#Requires -Version 5.1
<#
.SYNOPSIS
    一键安装 / 卸载 dsh-hardware-info 技能到 DeepSeek Harness（DSH）。

.DESCRIPTION
    将本仓库（SKILL.md + docs/scripts/plugin/tools）安装为 DSH 技能。
    安装目标优先级：
      用户级（默认）—— $env:DSH_HOME 或 ~\.dsh\skills\dsh-hardware-info
                        所有会话、所有项目可用；
      项目级 —— 当前目录所在项目根的 .dsh\skills\dsh-hardware-info
                        仅该项目可用；
      自定义 —— -Dir 指定技能根目录。
    DSH 的技能文件系统提供商会自动发现并热加载技能目录，安装完成后
    新会话即可使用技能 dsh-hardware-info，无需重启 DSH。

    两种来源：
      1. 在仓库内运行本脚本（$PSScriptRoot 下有 SKILL.md）→ 直接复制本地文件；
      2. 单独下载本脚本运行 → 自动从 GitHub 下载仓库压缩包后安装。

.PARAMETER Scope
    安装范围：User（用户级，默认）或 Project（项目级）。

.PARAMETER Dir
    自定义技能根目录（技能将安装到该目录的 dsh-hardware-info 子目录）。

.PARAMETER Uninstall
    卸载指定范围内的 dsh-hardware-info 技能。

.PARAMETER RepoUrl
    自定义仓库地址（默认 https://github.com/javinglee2025/dsh-hardware-info）。

.EXAMPLE
    .\install.ps1                        # 用户级安装（本地仓库模式）
    .\install.ps1 -Project               # 项目级安装
    .\install.ps1 -Uninstall             # 卸载用户级安装
    .\install.ps1 -Uninstall -Project    # 卸载项目级安装

.NOTES
    一键安装（从 GitHub，无需先克隆）：
      iwr https://raw.githubusercontent.com/javinglee2025/dsh-hardware-info/main/install.ps1 -OutFile $env:TEMP\install-dsh-hardware-info.ps1; & $env:TEMP\install-dsh-hardware-info.ps1
#>
[CmdletBinding()]
param(
    # 安装范围：User（默认）/ Project
    [ValidateSet('User', 'Project')]
    [string]$Scope = 'User',
    # 自定义技能根目录
    [string]$Dir = '',
    # 卸载
    [switch]$Uninstall,
    # 仓库地址
    [string]$RepoUrl = 'https://github.com/javinglee2025/dsh-hardware-info'
)

$ErrorActionPreference = 'Stop'
$skillName = 'dsh-hardware-info'

function Resolve-TargetDir {
    param([string]$Scope, [string]$Dir)
    if ($Dir) {
        return (Join-Path $Dir $skillName)
    }
    if ($Scope -eq 'Project') {
        # 项目根：从当前目录向上找 .git 或 .dsh，找不到就用当前目录
        $root = (Get-Location).Path
        $cur = (Get-Location).Path
        while ($cur) {
            if ((Test-Path (Join-Path $cur '.git')) -or (Test-Path (Join-Path $cur '.dsh'))) {
                $root = $cur
                break
            }
            $parent = Split-Path -Parent $cur
            if ($parent -eq $cur) { break }
            $cur = $parent
        }
        return (Join-Path (Join-Path $root '.dsh') 'skills')
    }
    $dshHome = $env:DSH_HOME
    if (-not $dshHome -or -not $dshHome.Trim()) {
        $dshHome = Join-Path $HOME '.dsh'
    }
    return (Join-Path (Join-Path $dshHome 'skills') $skillName)
}

$target = Resolve-TargetDir $Scope $Dir

# ── 卸载 ──
if ($Uninstall) {
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
        Write-Host ("已卸载: " + $target) -ForegroundColor Green
    } else {
        Write-Host ("未发现安装: " + $target) -ForegroundColor Yellow
    }
    exit 0
}

# ── 定位安装源 ──
$source = ''
$tempZip = Join-Path $env:TEMP 'dsh-hardware-info-install.zip'
$tempDir = Join-Path $env:TEMP 'dsh-hardware-info-install'

if (Test-Path (Join-Path $PSScriptRoot 'SKILL.md')) {
    # 仓库内运行：直接使用本地文件
    $source = $PSScriptRoot
    Write-Host '来源：本地仓库'
} else {
    # 独立运行：从 GitHub 下载压缩包
    $zipUrl = $RepoUrl.TrimEnd('/') + '/archive/refs/heads/main.zip'
    Write-Host ('正在下载 ' + $zipUrl)
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
    Expand-Archive -Path $tempZip -DestinationPath $tempDir
    $inner = Get-ChildItem -Directory $tempDir | Select-Object -First 1
    $source = $inner.FullName
    Write-Host '来源：GitHub 压缩包'
}

if (-not (Test-Path (Join-Path $source 'SKILL.md'))) {
    throw ('安装源无效（未找到 SKILL.md）: ' + $source)
}

# ── 复制技能包 ──
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach ($item in @('SKILL.md', 'docs', 'scripts', 'plugin', 'tools', 'README.md', 'LICENSE', 'CHANGELOG.md', 'install.ps1')) {
    $srcItem = Join-Path $source $item
    if (Test-Path $srcItem) {
        Copy-Item -Recurse -Force $srcItem (Join-Path $target $item)
    }
}

# ── 清理临时文件 ──
Remove-Item $tempZip, $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ('✅ 已安装到: ' + $target) -ForegroundColor Green
Write-Host ('技能名: ' + $skillName)
Write-Host ''
Write-Host '使用方法：'
Write-Host '  1. 新会话中直接向 Agent 提需求（如「列出所有硬盘的型号和 SMART 信息」），'
Write-Host '     Agent 会按技能指引提取硬件信息；'
Write-Host '  2. 技能可自动加载（DSH 热加载），若当前会话看不到，新建会话即可；'
Write-Host '  3. 提取脚本也可独立运行：'
Write-Host ('       powershell -NoProfile -File "' + (Join-Path $target 'scripts\Get-DiskHardwareInfo.ps1') + '"')
Write-Host ''
Write-Host ('卸载命令: powershell -NoProfile -File "' + (Join-Path $target 'install.ps1') + '" -Uninstall')
