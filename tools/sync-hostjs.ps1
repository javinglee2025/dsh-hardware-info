#Requires -Version 5.1
<#
.SYNOPSIS
    由 scripts/Get-DiskHardwareInfo.ps1 重新生成 plugin/host.js（内嵌脚本主体）。

.DESCRIPTION
    plugin/host.js 是生成产物，禁止手改：
      - 修改提取逻辑（通道、解析、健康评估）→ 改 scripts/Get-DiskHardwareInfo.ps1
      - 修改插件外壳（工具定义、错误处理）→ 改 plugin/host.template.js
    两者任一修改后运行本脚本重新生成。

    生成规则：
      1. 截取 ps1 中第一个 param(...) 块（按括号配对）之后的主体；
      2. 主体 ASCII 化（关键）：宿主 shell 可能以无 BOM UTF-8 临时文件或管道传递命令，
         Windows PowerShell 5.1 在非 UTF-8 系统区域下按 ANSI 读取含中文主体 → 解析崩溃
         （GBK 双字节吞引号/换行）。纯 ASCII 是 UTF-8 与所有 ANSI 代码页的公共子集，
         任何传递方式下都不会被误读。转换规则：
           - 单引号字符串中的非 ASCII 字符 → \uXXXX 转义，改写为 (ConvertFrom-UEsc '...')
            （解码函数注入主体开头；双引号字符串因插值语义不可安全改写，检测到即报错）
           - 注释中的非 ASCII 字符 → '?'（防止 GBK 误读吞掉换行/引号）
           - 转换后断言主体纯 ASCII，残留即报错（含非 ASCII 的 here-string 等）
      3. 做 JS 模板字符串转义（反斜杠、反引号、${），替换
         plugin/host.template.js 中的 /*__DSH_HWINFO_SCRIPT_BODY__*/ 占位符。
#>
[CmdletBinding()]
param(
    # 仓库根目录，默认取本脚本所在目录的上一级
    # （默认值须在主体内计算：PS 5.1 下带 [CmdletBinding()] 脚本的参数默认值
    #   表达式中 $PSScriptRoot 为空，直接写在 param 里会在 5.1 崩溃）
    [string]$RepoRoot = ''
)

if (-not $RepoRoot) { $RepoRoot = (Split-Path -Parent $PSScriptRoot) }

$ps1Path = Join-Path $RepoRoot 'scripts/Get-DiskHardwareInfo.ps1'
$tplPath = Join-Path $RepoRoot 'plugin/host.template.js'
$outPath = Join-Path $RepoRoot 'plugin/host.js'

$ps1 = [System.IO.File]::ReadAllText($ps1Path)
$idx = $ps1.IndexOf('param(')
if ($idx -lt 0) { throw '未找到 param( 块：请勿改动 Get-DiskHardwareInfo.ps1 的 param 结构' }
$depth = 0
$bodyStart = -1
for ($i = $idx; $i -lt $ps1.Length; $i++) {
    $c = $ps1[$i]
    if ($c -eq '(') { $depth++ }
    elseif ($c -eq ')') {
        $depth--
        if ($depth -eq 0) { $bodyStart = $i + 1; break }
    }
}
if ($bodyStart -lt 0) { throw 'param 块括号不配对' }
$body = $ps1.Substring($bodyStart)

# ── 主体 ASCII 化 ──
# 单引号字符串改写为解码调用；双引号/here-string 含非 ASCII 时无法安全改写，报错退出
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($body, [ref]$tokens, [ref]$parseErrors)

$edits = @()
foreach ($tk in $tokens) {
    $kind = [string]$tk.Kind
    # 注意：-match/-replace 默认忽略大小写，[\u0080-\uFFFF] 会经 Unicode 折叠
    # 误匹配 ASCII 的 i/I（折叠到 U+0131），必须用 -cmatch/-creplace 大小写敏感形式
    if ($kind -eq 'StringLiteral' -or $kind -eq 'StringExpandable') {
        if ($tk.Text -cmatch '[\u0080-\uFFFF]') {
            if ($kind -ne 'StringLiteral') {
                throw ('含非 ASCII 的双引号字符串无法安全转义（插值语义），请改为单引号 + -f 格式化: ' + $tk.Extent.StartLineNumber + ' 行 [' + $tk.Text.Substring(0, [Math]::Min(40, $tk.Text.Length)) + ']')
            }
            # 元素：起始偏移、结束偏移、原始 token 文本、是否注释改写
            $edits += ,@($tk.Extent.StartOffset, $tk.Extent.EndOffset, $tk.Text, $false)
        }
    }
    elseif ($kind -eq 'Comment') {
        if ($tk.Text -cmatch '[\u0080-\uFFFF]') {
            $edits += ,@($tk.Extent.StartOffset, $tk.Extent.EndOffset, ($tk.Text -creplace '[\u0080-\uFFFF]', '?'), $true)
        }
    }
}
# 倒序应用改写，保证偏移始终有效
$sb = [System.Text.StringBuilder]::new($body)
for ($e = $edits.Count - 1; $e -ge 0; $e--) {
    $start = $edits[$e][0]; $end = $edits[$e][1]; $text = $edits[$e][2]; $isComment = $edits[$e][3]
    if ($isComment) {
        $newText = $text
    }
    else {
        $inner = $text.Substring(1, $text.Length - 2).Replace("'", "''")
        $esc = [System.Text.StringBuilder]::new()
        foreach ($ch in $inner.ToCharArray()) {
            $n = [int]$ch
            if ($ch -eq '\' -or $n -gt 0x7F) {
                if ($n -gt 0x7F) { [void]$esc.Append(('\u{0:X4}' -f $n)) }
                else { [void]$esc.Append('\\') }
            }
            else { [void]$esc.Append($ch) }
        }
        $newText = "(ConvertFrom-UEsc '" + $esc.ToString() + "')"
    }
    [void]$sb.Remove($start, $end - $start)
    [void]$sb.Insert($start, $newText)
}
$body = $sb.ToString()

# 解码函数（注入主体开头；纯 ASCII，PS 5.1 与受限语言模式兼容）
$decoder = @'
# decode \uXXXX escapes (ASCII-safe embedding, see tools/sync-hostjs.ps1)
function ConvertFrom-UEsc {
    param([string]$s)
    $sb = New-Object System.Text.StringBuilder
    $i = 0
    while ($i -lt $s.Length) {
        if ($s[$i] -eq '\' -and ($i + 6) -le $s.Length -and $s[$i + 1] -eq 'u' -and $s.Substring($i + 2, 4) -match '^[0-9A-Fa-f]{4}$') {
            [void]$sb.Append([char][Convert]::ToInt32($s.Substring($i + 2, 4), 16))
            $i += 6
        }
        elseif ($s[$i] -eq '\' -and ($i + 1) -lt $s.Length -and $s[$i + 1] -eq '\') {
            [void]$sb.Append('\')
            $i += 2
        }
        else {
            [void]$sb.Append($s[$i])
            $i++
        }
    }
    $sb.ToString()
}

'@
$body = $decoder + $body

# 断言：嵌入主体必须纯 ASCII（任何传递编码下都不会被误读）
$leftover = [regex]::Match($body, '[\u0080-\uFFFF]')
if ($leftover.Success) {
    $line = ($body.Substring(0, $leftover.Index) -split "`n").Count
    throw ('嵌入主体仍含非 ASCII 字符（约 ' + $line + ' 行）: [' + $body.Substring($leftover.Index, [Math]::Min(30, $body.Length - $leftover.Index)) + ']——请检查 here-string / 双引号字符串中的中文')
}

# JS 模板字符串转义（顺序不可颠倒：先反斜杠，再反引号，最后 ${）
$body = $body.Replace('\', '\\').Replace('`', '\`').Replace('${', '\${')

$tpl = [System.IO.File]::ReadAllText($tplPath)
if (-not $tpl.Contains('/*__DSH_HWINFO_SCRIPT_BODY__*/')) {
    throw 'host.template.js 缺少 /*__DSH_HWINFO_SCRIPT_BODY__*/ 占位符'
}
$out = $tpl.Replace('/*__DSH_HWINFO_SCRIPT_BODY__*/', ('`' + $body + '`'))
[System.IO.File]::WriteAllText($outPath, $out, (New-Object System.Text.UTF8Encoding $false))
Write-Host ('已生成 ' + $outPath + '（内嵌主体已 ASCII 化）')
