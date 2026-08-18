#Requires -Version 5.1
<#
.SYNOPSIS
    由 scripts/Get-DiskHardwareInfo.ps1 重新生成 plugin/host.js（内嵌脚本主体）。

.DESCRIPTION
    plugin/host.js 是生成产物，禁止手改：
      - 修改提取逻辑（通道、解析、健康评估）→ 改 scripts/Get-DiskHardwareInfo.ps1
      - 修改插件外壳（工具定义、错误处理）→ 改 plugin/host.template.js
    两者任一修改后运行本脚本重新生成。
    生成规则：截取 ps1 中第一个 param(...) 块（按括号配对）之后的主体，
    做 JS 模板字符串转义（反斜杠、反引号、${），替换
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

# JS 模板字符串转义（顺序不可颠倒：先反斜杠，再反引号，最后 ${）
$body = $body.Replace('\', '\\').Replace('`', '\`').Replace('${', '\${')

$tpl = [System.IO.File]::ReadAllText($tplPath)
if (-not $tpl.Contains('/*__DSH_HWINFO_SCRIPT_BODY__*/')) {
    throw 'host.template.js 缺少 /*__DSH_HWINFO_SCRIPT_BODY__*/ 占位符'
}
$out = $tpl.Replace('/*__DSH_HWINFO_SCRIPT_BODY__*/', ('`' + $body + '`'))
[System.IO.File]::WriteAllText($outPath, $out, (New-Object System.Text.UTF8Encoding $false))
Write-Host ('已生成 ' + $outPath)
