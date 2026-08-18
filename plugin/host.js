// dsh-hardware-info —— Cordis 插件 Host 端源码模板
// 生成产物 plugin/host.js 请勿手改：
//   - 修改插件外壳（工具定义、错误处理）→ 改本文件
//   - 修改提取逻辑（通道、解析、健康评估）→ 改 scripts/Get-DiskHardwareInfo.ps1
//   - 两者任一修改后运行 tools/sync-hostjs.ps1 重新生成 plugin/host.js
//
// 安装（DSH 动态插件）：将生成的 plugin/host.js 整个内容作为 code.host 传入
// cordis_define 并运行；插件在会话内注册两个工具：
//   - list_physical_disks —— 磁盘身份信息（型号/序列号/固件/接口/容量，快，无需管理员）
//   - read_disk_smart      —— S.M.A.R.T. 健康数据（多通道回退，完整数据需管理员）
// 详见 README.md「安装」章节。

// 内嵌的 PowerShell 提取脚本主体（与 scripts/Get-DiskHardwareInfo.ps1 的 param 块之后一致，
// 由 tools/sync-hostjs.ps1 自动内嵌并做 JS 模板字符串转义）
const SCRIPT_BODY = `

# ═══ 内嵌模式入口：本文件 param 块之后的主体由 tools/sync-hostjs.ps1 内嵌进 plugin/host.js ═══
# 注意：保持 param 块与主体结构不变（同步脚本按括号配对截取主体），脚本中避免反引号。

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'

# ═══════════════════════════ 属性名称表（ATA SMART 通用属性名）═══════════════════════════

$script:AttrNames = @{
    1   = '读取错误率'
    2   = '吞吐性能'
    3   = '起旋时间'
    4   = '起停次数'
    5   = '重分配扇区计数'
    7   = '寻道错误率'
    8   = '寻道时间性能'
    9   = '上电累计时间'
    10  = '起旋重试次数'
    12  = '电源周期计数'
    175 = '坏块计数'
    176 = '擦除计数'
    177 = '磨损均衡计数'
    178 = '预期寿命'
    179 = '已用保留块'
    180 = '编程失败计数'
    181 = '编程失败计数(总计)'
    182 = '擦除失败计数'
    187 = '报告不可纠正错误'
    188 = '命令超时'
    189 = '高飞写入'
    190 = '气流温度'
    191 = 'G-Sense 错误率'
    192 = '断电缩回计数'
    193 = '加载/卸载周期'
    194 = '温度'
    195 = '硬件 ECC 恢复'
    196 = '重分配事件计数'
    197 = '当前待映射扇区'
    198 = '离线不可纠正扇区'
    199 = 'UltraDMA CRC 错误'
    200 = '写入错误率'
    201 = '软读取错误率'
    202 = '数据地址标记错误'
    203 = '耗尽取消计数'
    204 = '软 ECC 纠正率'
    205 = '热膨胀率'
    206 = '飞高'
    207 = '旋转高电流'
    208 = '旋转脉冲'
    209 = '离线寻道性能'
    210 = '振动'
    211 = '振动导致的写入错误'
    212 = '振动导致的读取错误'
    220 = '磁盘偏移'
    221 = 'G-Sense/振动'
    222 = '已加载小时数'
    223 = '加载/卸载重试计数'
    224 = '负载摩擦'
    225 = '加载/卸载周期计数'
    226 = '加载时间'
    227 = '扭矩放大计数'
    228 = '断电缩回周期'
    230 = 'GMR 磁头振幅'
    231 = '寿命剩余'
    232 = '耐久性剩余'
    233 = '介质磨损指示器'
    234 = '平均擦除计数'
    235 = '良好块计数'
    240 = '磁头飞行小时数'
    241 = 'LBA 写入总计'
    242 = 'LBA 读取总计'
    250 = '读取错误重试率'
}

# 关键属性（业界通用故障预警属性集）
$script:CriticalIds = @(5, 187, 196, 197, 198, 177, 178, 179, 231, 233)

function Get-AttrName {
    param([int]$Id)
    if ($script:AttrNames.ContainsKey($Id)) { return $script:AttrNames[$Id] }
    if ($Id -ge 170 -and $Id -le 254) { return '厂商特定' }
    return ('未知属性({0})' -f $Id)
}

function Test-CriticalAttr {
    param([int]$Id)
    return ($script:CriticalIds -contains $Id)
}

# 单属性状态（通用阈值判定：阈值 > 0 且当前值 <= 阈值 → Bad；<= 阈值+10 → Warning）
function Get-AttrStatus {
    param([int]$Current, [int]$Threshold)
    if ($Threshold -gt 0 -and $Current -le $Threshold) { return 'Bad' }
    if ($Current -le ($Threshold + 10)) { return 'Warning' }
    return 'Good'
}

# 健康状态合并（取最差值）
function Merge-Health {
    param([string]$A, [string]$B)
    if ($A -eq 'Bad' -or $B -eq 'Bad') { return 'Bad' }
    if ($A -eq 'Warning' -or $B -eq 'Warning') { return 'Warning' }
    if ($A -eq 'Good' -and $B -eq 'Good') { return 'Good' }
    if ($A -eq 'Good' -and $B -eq 'Unknown') { return 'Good' }
    if ($A -eq 'Unknown' -and $B -eq 'Good') { return 'Good' }
    return 'Unknown'
}

# 基于属性评估健康（含温度 55°C 默认警戒值）
function Get-AssessedHealth {
    param($Attributes)
    $hasWarning = $false
    $hasBad = $false
    foreach ($a in @($Attributes)) {
        if ($a.status -eq 'Bad') {
            if ($a.is_critical) { $hasBad = $true } else { $hasWarning = $true }
        }
        elseif ($a.status -eq 'Warning') { $hasWarning = $true }
        if ($a.id -eq 194 -or $a.id -eq 190) {
            $temp = [int]($a.raw_value -band 0xFF)
            $th = if ($a.threshold -gt 0) { $a.threshold } else { 55 }
            if ($temp -ge $th) {
                if ($temp -ge ($th + 5)) { $hasBad = $true } else { $hasWarning = $true }
            }
        }
    }
    if ($hasBad) { return 'Bad' }
    if ($hasWarning) { return 'Warning' }
    if (@($Attributes).Count -eq 0) { return 'Unknown' }
    return 'Good'
}

# 温度提取（属性 194/190，原始值低字节，15..120°C 有效）
function Get-TempFromAttrs {
    param($Attributes)
    foreach ($a in @($Attributes)) {
        if ($a.id -eq 194 -or $a.id -eq 190) {
            $t = [int]($a.raw_value -band 0xFF)
            if ($t -ge 15 -and $t -le 120) { return $t }
        }
    }
    return $null
}

# 按属性 ID 取原始值
function Get-ValueFromAttrs {
    param($Attributes, [int]$Id)
    foreach ($a in @($Attributes)) {
        if ($a.id -eq $Id) { return $a.raw_value }
    }
    return $null
}

# 虚拟盘识别（型号含 virtual/虚拟、PNP 含 VIRTUAL、SWD\\ 软件设备）
function Test-VirtualDisk {
    param([string]$Model, [string]$Pnp, [string]$Bus)
    if ($Model.ToLowerInvariant().Contains('virtual')) { return $true }
    if ($Model.Contains('虚拟')) { return $true }
    $pnpUpper = $Pnp.ToUpperInvariant()
    if ($pnpUpper.Contains('VIRTUAL')) { return $true }
    if ($pnpUpper.StartsWith('SWD\\')) { return $true }
    if ($Bus -eq 'File Backed Virtual') { return $true }
    return $false
}

# ── 通道 2：root\\WMI MSStorageDriver_ATAPISmartData（ATA SMART 512 字节原始属性）──
function Get-WmiAtaSmart {
    param([string]$Serial)
    try {
        $entries = @(Get-CimInstance -Namespace 'root/wmi' -ClassName 'MSStorageDriver_ATAPISmartData' -ErrorAction Stop)
    } catch { return $null }
    if ($entries.Count -eq 0) { return $null }

    # 按序列号匹配实例（InstanceName 包含序列号则优先），否则取第一个有效实例
    $chosen = $null
    $chosenInst = ''
    foreach ($e in $entries) {
        $vs = $e.VendorSpecific
        $bytes = $null
        if ($vs -is [byte[]]) { $bytes = $vs } elseif ($vs) { $bytes = [byte[]]$vs }
        if (-not $bytes -or $bytes.Length -lt 512) { continue }
        if (-not $chosen) { $chosen = $bytes; $chosenInst = [string]$e.InstanceName }
        if ($Serial) {
            $inst = [string]$e.InstanceName
            if ($inst -and $inst.ToUpperInvariant().Contains($Serial.ToUpperInvariant())) {
                $chosen = $bytes
                $chosenInst = $inst
                break
            }
        }
    }
    if (-not $chosen) { return $null }

    # 阈值表（MSStorageDriver_ATAPISmartThresholds；按 InstanceName 对齐，仅一条时直接采用）
    $thresholds = @{}
    try {
        $tArr = @(Get-CimInstance -Namespace 'root/wmi' -ClassName 'MSStorageDriver_ATAPISmartThresholds' -ErrorAction Stop)
        foreach ($t in $tArr) {
            $tInst = [string]$t.InstanceName
            $match = if ($tArr.Count -eq 1) { $true } else { ($tInst -eq $chosenInst) }
            if ($match) {
                $th = $t.Thresholds
                $thBytes = $null
                if ($th -is [byte[]]) { $thBytes = $th } elseif ($th) { $thBytes = [byte[]]$th }
                if ($thBytes) {
                    $limit = if ($thBytes.Length -lt 30) { $thBytes.Length } else { 30 }
                    for ($i = 0; $i -lt $limit; $i++) { $thresholds[$i] = [int]$thBytes[$i] }
                }
                break
            }
        }
    } catch { }

    # 属性从偏移 2 开始（前 2 字节为版本号），共 30 条、每条 12 字节（ATA SMART READ DATA 规范布局）
    $attrs = @()
    for ($i = 0; $i -lt 30; $i++) {
        $o = 2 + $i * 12
        if ($o + 12 -gt $chosen.Length) { break }
        $id = [int]$chosen[$o]
        if ($id -eq 0) { continue }
        $current = [int]$chosen[$o + 3]
        $worst = [int]$chosen[$o + 4]
        # 原始值：6 字节小端（纯算术，兼容受限语言模式）
        $raw = [int64]$chosen[$o + 5] +
               [int64]$chosen[$o + 6] * 256 +
               [int64]$chosen[$o + 7] * 65536 +
               [int64]$chosen[$o + 8] * 16777216 +
               [int64]$chosen[$o + 9] * 4294967296 +
               [int64]$chosen[$o + 10] * 1099511627776
        $threshold = 0
        if ($thresholds.ContainsKey($i)) { $threshold = $thresholds[$i] }
        $attrs += @{
            id          = $id
            name        = Get-AttrName $id
            raw_value   = $raw
            current     = $current
            worst       = $worst
            threshold   = $threshold
            is_critical = Test-CriticalAttr $id
            status      = Get-AttrStatus $current $threshold
        }
    }
    return $attrs
}

# 按盘号/序列号/型号三级回退匹配 Get-PhysicalDisk 对象（DeviceNumber 在部分环境为空，仅按盘号会错配）
function Find-PhysicalDiskFor {
    param([int]$DiskIndex, [string]$Serial, [string]$Model, $PdList)
    foreach ($p in @($PdList)) {
        $dn = $p.DeviceNumber
        if ($null -ne $dn -and ([string]$dn).Trim() -ne '') {
            $dnInt = 0
            $ok = $false
            try { $dnInt = [int]$dn; $ok = $true } catch { }
            if ($ok -and $dnInt -eq $DiskIndex) { return $p }
        }
    }
    $ser = $Serial.TrimEnd('.')
    foreach ($p in @($PdList)) {
        $ps = [string]$p.SerialNumber
        if ($ser -and $ps -and $ps.TrimEnd('.').ToUpperInvariant() -eq $ser.ToUpperInvariant()) { return $p }
    }
    foreach ($p in @($PdList)) {
        if ($Model -and [string]$p.FriendlyName -eq $Model) { return $p }
    }
    return $null
}

# ── 序列号解析（策略移植自 FileSystemExplorer）──
# Win32_DiskDrive.SerialNumber 对 NVMe 盘返回 NGUID 编码串而非真实序列号；
# 真实序列号在 MSFT_PhysicalDisk.AdapterSerialNumber（格式「序列号 _NNNN」）或 FruId。

function Test-LooksLikeNguidEui {
    param([string]$Serial)
    if ([string]::IsNullOrWhiteSpace($Serial)) { return $false }
    $hex = ($Serial.ToCharArray() | Where-Object { $_ -match '[0-9A-Fa-f]' }) -join ''
    $total = @($Serial.ToCharArray() | Where-Object { -not [char]::IsWhiteSpace($_) }).Count
    if ($total -eq 0) { return $false }
    if (($hex.Length / $total) -lt 0.8) { return $false }
    if ($hex.Length -eq 32 -or $hex.Length -eq 16) { return $true }
    if ($hex.Length -ge 20) { return $true }
    if ($Serial.Contains('_')) { return $true }
    return $false
}

function Get-AsciiFromBytes {
    param([object[]]$Bytes)
    $chars = @($Bytes | Where-Object { ([int]$_ -ge 0x20) -and ([int]$_ -le 0x7E) } | ForEach-Object { [char]$_ })
    if ($chars.Count -ge 8) { return (($chars -join '').Trim()) }
    return $null
}

function ConvertFrom-HexSerial {
    param([string]$Serial)
    if ([string]::IsNullOrWhiteSpace($Serial)) { return $null }
    $hex = ($Serial.ToCharArray() | Where-Object { $_ -match '[0-9A-Fa-f]' }) -join ''
    if ($hex.Length -lt 2) { return $null }
    $bytes = @()
    for ($i = 0; $i -lt $hex.Length - 1; $i += 2) {
        $bytes += [byte]('0x' + $hex.Substring($i, 2))
    }
    $direct = Get-AsciiFromBytes $bytes
    if ($direct) { return $direct }
    $rev = @()
    for ($i = $bytes.Count - 1; $i -ge 0; $i--) { $rev += $bytes[$i] }
    $reversed = Get-AsciiFromBytes $rev
    if ($reversed) { return $reversed }
    $swapped = @()
    for ($i = 0; $i -lt $bytes.Count; $i += 2) {
        if ($i + 1 -lt $bytes.Count) {
            $swapped += $bytes[$i + 1]
            $swapped += $bytes[$i]
        }
        else { $swapped += $bytes[$i] }
    }
    $pairSwapped = Get-AsciiFromBytes $swapped
    if ($pairSwapped) { return $pairSwapped }
    return $null
}

function Resolve-DiskSerial {
    param([string]$Win32Serial, $Pd)
    # 1) AdapterSerialNumber：NVMe 真实序列号，尾部「 _NNNN」为控制器号需剥离
    if ($Pd -and $null -ne $Pd.PSObject.Properties['AdapterSerialNumber']) {
        $adapter = ([string]$Pd.AdapterSerialNumber).Trim()
        if ($adapter) {
            $lastSpace = $adapter.LastIndexOf(' ')
            if ($lastSpace -gt 0) {
                $part = $adapter.Substring(0, $lastSpace).Trim()
                if ($part) { return $part }
            }
            else { return $adapter }
        }
    }
    # 2) FruId：存储管理 API 的真实序列号字段
    if ($Pd -and $null -ne $Pd.PSObject.Properties['FruId']) {
        $fru = ([string]$Pd.FruId).Trim()
        if ($fru) { return $fru }
    }
    # 3) Storage SerialNumber：NGUID 编码形态时尝试转 ASCII
    if ($Pd -and $null -ne $Pd.PSObject.Properties['SerialNumber']) {
        $snum = ([string]$Pd.SerialNumber).Trim()
        if ($snum) {
            if (Test-LooksLikeNguidEui $snum) {
                $ascii = ConvertFrom-HexSerial $snum
                if ($ascii) { return $ascii }
            }
            return $snum
        }
    }
    # 4) Win32_DiskDrive 兜底
    return $Win32Serial
}

# ── 通道 3：MSFT 存储可靠性计数器（Get-StorageReliabilityCounter，需管理员）──
function Get-MsftSmart {
    param($Pd)
    if (-not $Pd) { return $null }
    try {
        $counter = $Pd | Get-StorageReliabilityCounter -ErrorAction Stop
        if (-not $counter) { return $null }
    } catch { return $null }

    $attrs = @()
    $temp = $null
    $poh = $null

    $t = [int64]$counter.Temperature
    if ($t -ge 1 -and $t -le 120) {
        $temp = $t
        $attrs += @{ id = 194; name = '温度'; raw_value = $t; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
    }
    $powerOn = [int64]$counter.PowerOnHours
    if ($powerOn -ge 0) {
        $poh = $powerOn
        $attrs += @{ id = 9; name = '上电累计时间'; raw_value = $powerOn; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
    }
    $wear = [int64]$counter.Wear
    if ($wear -ge 0) {
        $wearCur = if ($wear -gt 100) { 0 } else { 100 - $wear }
        $wearStatus = 'Good'
        if ($wear -ge 100) { $wearStatus = 'Bad' } elseif ($wear -ge 90) { $wearStatus = 'Warning' }
        $attrs += @{ id = 252; name = '已用寿命百分比'; raw_value = $wear; current = $wearCur; worst = $wearCur; threshold = 90; is_critical = $true; status = $wearStatus }
    }
    $readErr = [int64]$counter.ReadErrorsTotal
    $writeErr = [int64]$counter.WriteErrorsTotal
    $totalErr = $readErr + $writeErr
    $errCurrent = if ($totalErr -eq 0) { 100 } else { 0 }
    $errStatus = if ($totalErr -gt 0) { 'Warning' } else { 'Good' }
    $attrs += @{ id = 255; name = '读写错误总计'; raw_value = $totalErr; current = $errCurrent; worst = $errCurrent; threshold = 1; is_critical = $true; status = $errStatus }

    # MSFT_PhysicalDisk.HealthStatus：0=Healthy 1=Warning 2=Unhealthy
    # （部分环境的 cmdlet 返回字符串枚举值，两种形态都兼容）
    $hsRaw = $Pd.HealthStatus
    $health = 'Unknown'
    if ($hsRaw -is [string]) {
        $hsStr = [string]$hsRaw
        if ($hsStr -eq 'Healthy') { $health = 'Good' }
        elseif ($hsStr -eq 'Warning') { $health = 'Warning' }
        elseif ($hsStr -eq 'Unhealthy') { $health = 'Bad' }
    }
    else {
        $hs = [int64]$hsRaw
        if ($hs -eq 0) { $health = 'Good' }
        elseif ($hs -eq 1) { $health = 'Warning' }
        elseif ($hs -eq 2) { $health = 'Bad' }
    }
    return @{ attrs = $attrs; temp = $temp; poh = $poh; health = $health }
}

# ── smartctl 定位（固定安装位置优先，PATH 最后回退）──
function Resolve-Smartctl {
    param([string]$CustomPath)
    if ($CustomPath -and (Test-Path -LiteralPath $CustomPath)) { return $CustomPath }
    $fixed = @(
        'C:\\Program Files\\smartmontools\\bin\\smartctl.exe'
        'C:\\Program Files (x86)\\smartmontools\\bin\\smartctl.exe'
        'C:\\smartmontools\\bin\\smartctl.exe'
        'C:\\ProgramData\\chocolatey\\bin\\smartctl.exe'
    )
    foreach ($p in $fixed) { if (Test-Path -LiteralPath $p) { return $p } }
    $cmd = Get-Command smartctl -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Verbose 'smartctl 仅在 PATH 上找到：存在搜索顺序劫持风险，建议安装到固定位置'
        return $cmd.Source
    }
    return $null
}

# ── 通道 4：smartctl -A --json（直接 → -d sat → -d nvme 回退）──
function Get-SmartctlSmart {
    param([int]$Index, [string]$Exe)
    if (-not $Exe) { return $null }
    $dev = ('\\\\.\\PhysicalDrive{0}' -f $Index)
    $attempts = @(
        ,@('-A', '--json', $dev)
        ,@('-A', '--json', '-d', 'sat', $dev)
        ,@('-A', '--json', '-d', 'nvme', $dev)
    )
    foreach ($argsList in $attempts) {
        $outText = ''
        $code = -1
        try {
            $outText = (& $Exe @argsList 2>$null | Out-String)
            $code = $LASTEXITCODE
        } catch { }
        if ($code -ne 0 -or -not $outText) { continue }
        try { $json = $outText | ConvertFrom-Json } catch { continue }

        # ATA 属性表（ata_smart_attributes.table）
        if ($json.ata_smart_attributes -and $json.ata_smart_attributes.table) {
            $attrs = @()
            foreach ($entry in @($json.ata_smart_attributes.table)) {
                $id = [int]$entry.id
                $name = [string]$entry.name
                $raw = 0
                if ($null -ne $entry.raw) {
                    if ($null -ne $entry.raw.value) { $raw = [int64]$entry.raw.value }
                    elseif ($entry.raw.string) {
                        $hexStr = ([string]$entry.raw.string).TrimStart('0x')
                        if ($hexStr -match '^[0-9A-Fa-f]+$') { $raw = [int64]('0x' + $hexStr) }
                    }
                }
                $current = if ($null -ne $entry.value) { [int]$entry.value } else { 100 }
                $worst = if ($null -ne $entry.worst) { [int]$entry.worst } else { 100 }
                $threshold = if ($null -ne $entry.thresh) { [int]$entry.thresh } else { 0 }
                $attrs += @{
                    id          = $id
                    name        = $name
                    raw_value   = $raw
                    current     = $current
                    worst       = $worst
                    threshold   = $threshold
                    is_critical = Test-CriticalAttr $id
                    status      = Get-AttrStatus $current $threshold
                }
            }
            if ($attrs.Count -gt 0) { return @{ attrs = $attrs; temp = $null; poh = $null; health = 'Unknown' } }
        }

        # NVMe 健康日志映射（nvme_smart_health_information_log）
        if ($json.nvme_smart_health_information_log) {
            $n = $json.nvme_smart_health_information_log
            $tempC = if ($null -ne $n.temperature) { [int]$n.temperature } else { 0 }
            $used = if ($null -ne $n.percentage_used) { [int]$n.percentage_used } else { 0 }
            $spare = if ($null -ne $n.available_spare) { [int]$n.available_spare } else { 100 }
            $spareTh = if ($null -ne $n.available_spare_threshold) { [int]$n.available_spare_threshold } else { 10 }
            $readUnits = if ($null -ne $n.data_units_read) { [int64]$n.data_units_read } else { 0 }
            $writeUnits = if ($null -ne $n.data_units_written) { [int64]$n.data_units_written } else { 0 }
            $mediaErr = if ($null -ne $n.media_errors) { [int64]$n.media_errors } else { 0 }
            $nvmePoh = if ($null -ne $n.power_on_hours) { [int64]$n.power_on_hours } else { 0 }
            $cycles = if ($null -ne $n.power_cycles) { [int64]$n.power_cycles } else { 0 }
            $critWarn = if ($null -ne $n.critical_warning) { [int]$n.critical_warning } else { 0 }

            $attrs = @()
            $tempCurrent = if ($tempC -lt 50) { 100 } else { 100 - ($tempC - 50) }
            if ($tempCurrent -lt 0) { $tempCurrent = 0 }
            $tempStatus = if ($tempC -ge 55) { 'Warning' } else { 'Good' }
            $attrs += @{ id = 194; name = '温度'; raw_value = $tempC; current = $tempCurrent; worst = $tempCurrent; threshold = 55; is_critical = $false; status = $tempStatus }
            $attrs += @{ id = 9; name = '上电累计时间'; raw_value = $nvmePoh; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $critCur = if ($critWarn -eq 0) { 100 } else { 0 }
            $critStatus = if ($critWarn -ne 0) { 'Bad' } else { 'Good' }
            $attrs += @{ id = 250; name = '严重警告标志'; raw_value = $critWarn; current = $critCur; worst = $critCur; threshold = 1; is_critical = $true; status = $critStatus }
            $spareStatus = 'Good'
            if ($spare -le $spareTh) { $spareStatus = 'Bad' } elseif ($spare -lt 10) { $spareStatus = 'Warning' }
            $attrs += @{ id = 251; name = '可用备用空间'; raw_value = $spare; current = $spare; worst = $spare; threshold = $spareTh; is_critical = $true; status = $spareStatus }
            $usedCur = if ($used -gt 100) { 0 } else { 100 - $used }
            $usedStatus = 'Good'
            if ($used -ge 100) { $usedStatus = 'Bad' } elseif ($used -ge 90) { $usedStatus = 'Warning' }
            $attrs += @{ id = 252; name = '已用寿命百分比'; raw_value = $used; current = $usedCur; worst = $usedCur; threshold = 90; is_critical = $true; status = $usedStatus }
            $attrs += @{ id = 241; name = 'LBA 写入总计'; raw_value = ($writeUnits * 1024); current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $attrs += @{ id = 242; name = 'LBA 读取总计'; raw_value = ($readUnits * 1024); current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $attrs += @{ id = 12; name = '电源周期计数'; raw_value = $cycles; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $mediaCur = if ($mediaErr -eq 0) { 100 } else { 0 }
            $mediaStatus = if ($mediaErr -gt 0) { 'Warning' } else { 'Good' }
            $attrs += @{ id = 255; name = '介质错误计数'; raw_value = $mediaErr; current = $mediaCur; worst = $mediaCur; threshold = 1; is_critical = $true; status = $mediaStatus }

            $headTemp = if ($tempC -ge 1 -and $tempC -le 120) { $tempC } else { $null }
            return @{ attrs = $attrs; temp = $headTemp; poh = $nvmePoh; health = 'Unknown' }
        }
        break
    }
    return $null
}

# ── 单盘 SMART 编排（通道回退链）──
function Get-DiskSmart {
    param([pscustomobject]$Disk, [int]$Index, [string]$Pnp, [string]$Bus, [bool]$NoSmartctlFlag, [string]$SmartctlPathArg, $Pd)
    $model = [string]$Disk.Model
    $serial = [string]$Disk.SerialNumber

    # 虚拟磁盘短路（虚拟盘无真实 SMART，多通道只会全部报错，提前返回友好提示）
    if (Test-VirtualDisk $model $Pnp $Bus) {
        return @{ attrs = @(); temp = $null; poh = $null; bw = $null; br = $null; health = 'Unknown'; sources = @(); error = '虚拟磁盘不支持 S.M.A.R.T. 监控' }
    }

    # NVMe 判定（InterfaceType 常报 SCSI，须结合 PNPDeviceID 判断真实总线）
    $isNvme = ($Bus -eq 'NVMe') -or $Pnp.ToUpperInvariant().Contains('NVME')

    $attrs = @()
    $sources = @()
    $msftHealth = 'Unknown'

    # ATA/SATA：先走 root\\WMI 原始属性（IOCTL ATA PASS THROUGH 的 PowerShell 等价物）
    if (-not $isNvme) {
        Write-Verbose ('SMART: PhysicalDrive{0} 走 WMI ATA SMART 通道' -f $Index)
        $wmiAttrs = Get-WmiAtaSmart $serial
        if ($wmiAttrs -and @($wmiAttrs).Count -gt 0) { $attrs = @($wmiAttrs); $sources += 'wmi_ata_smart' }
    }

    # MSFT 存储可靠性计数器（NVMe 原生路径 / WMI 失败后的回退）
    if (@($attrs).Count -eq 0) {
        Write-Verbose ('SMART: PhysicalDrive{0} 尝试 MSFT 存储可靠性计数器' -f $Index)
        $msft = Get-MsftSmart $Pd
        if ($msft -and @($msft.attrs).Count -gt 0) {
            $attrs = @($msft.attrs)
            $msftHealth = $msft.health
            $sources += 'msft_reliability'
        }
    }

    # smartctl 最后回退
    if (@($attrs).Count -eq 0 -and -not $NoSmartctlFlag) {
        Write-Verbose ('SMART: PhysicalDrive{0} 尝试 smartctl 回退' -f $Index)
        $sc = Get-SmartctlSmart $Index (Resolve-Smartctl $SmartctlPathArg)
        if ($sc -and @($sc.attrs).Count -gt 0) { $attrs = @($sc.attrs); $sources += 'smartctl' }
    }

    # 指标提取（温度 194/190、上电时间 9、写入 241×512、读取 242×512）
    $temp = Get-TempFromAttrs $attrs
    $poh = Get-ValueFromAttrs $attrs 9
    $bwRaw = Get-ValueFromAttrs $attrs 241
    $brRaw = Get-ValueFromAttrs $attrs 242
    $bw = $null
    $br = $null
    if ($null -ne $bwRaw) { $bw = [int64]$bwRaw * 512 }
    if ($null -ne $brRaw) { $br = [int64]$brRaw * 512 }

    # 基础健康（WMI Status OK → Good）
    $baseHealth = 'Unknown'
    $status = [string]$Disk.Status
    if ($status -ieq 'OK') { $baseHealth = 'Good' } elseif ($status) { $baseHealth = 'Warning' }

    $error = $null
    if (@($attrs).Count -eq 0) {
        $health = $baseHealth
        $error = '无法获取 S.M.A.R.T. 数据（WMI/MSFT/smartctl 通道均失败，磁盘可能不支持或需要管理员权限）'
    }
    else {
        $health = Merge-Health $baseHealth (Get-AssessedHealth $attrs)
        $health = Merge-Health $health $msftHealth
    }
    return @{ attrs = $attrs; temp = $temp; poh = $poh; bw = $bw; br = $br; health = $health; sources = $sources; error = $error }
}

# ═════════════════════════════════ 主流程 ═════════════════════════════════

Write-Verbose ('SMART: 开始枚举物理磁盘（Basic={0}，NoSmartctl={1}）' -f $Basic, $NoSmartctl)

$wmiDisks = @(Get-CimInstance -ClassName 'Win32_DiskDrive' -ErrorAction SilentlyContinue)
if ($DriveIndex.Count -gt 0) {
    $wmiDisks = @($wmiDisks | Where-Object { $DriveIndex -contains [int]$_.Index })
}
if ($wmiDisks.Count -eq 0) {
    Write-Output '[]'
    exit 0
}

# Get-PhysicalDisk 交叉信息（总线/介质类型；按盘号/序列号/型号回退匹配）
$pdList = @()
try {
    $pdList = @(Get-PhysicalDisk -ErrorAction Stop)
} catch {
    Write-Verbose 'Get-PhysicalDisk 不可用（可能需要管理员权限或 Storage 模块缺失）'
}

$result = @()
foreach ($d in $wmiDisks) {
    $index = [int]$d.Index
    $model = [string]$d.Model
    $serialRaw = [string]$d.SerialNumber
    $pd = Find-PhysicalDiskFor $index $serialRaw $model $pdList
    $serial = Resolve-DiskSerial $serialRaw $pd
    $bus = ''
    $media = ''
    if ($pd) {
        $bus = [string]$pd.BusType
        $media = [string]$pd.MediaType
    }
    if (-not $media) { $media = [string]$d.MediaType }

    $smart = @{ attrs = @(); temp = $null; poh = $null; bw = $null; br = $null; health = 'Unknown'; sources = @(); error = $null }
    if (-not $Basic) {
        $smart = Get-DiskSmart $d $index ([string]$d.PNPDeviceID) $bus ([bool]$NoSmartctl) $SmartctlPath $pd
    }
    else {
        $status = [string]$d.Status
        if ($status -ieq 'OK') { $smart.health = 'Good' } elseif ($status) { $smart.health = 'Warning' }
    }
    $sources = @('win32_diskdrive') + @($smart.sources)

    $result += [ordered]@{
        device_id          = ('\\\\.\\PhysicalDrive{0}' -f $index)
        index              = $index
        model              = $model
        serial_number      = $serial
        firmware_revision  = [string]$d.FirmwareRevision
        interface_type     = [string]$d.InterfaceType
        bus_type           = $bus
        media_type         = $media
        capacity_bytes     = [int64]$d.Size
        health_status      = $smart.health
        temperature_celsius = $smart.temp
        power_on_hours     = $smart.poh
        total_bytes_written = $smart.bw
        total_bytes_read   = $smart.br
        attributes         = @($smart.attrs)
        failure_predicted  = ($smart.health -eq 'Bad')
        is_virtual_disk    = (Test-VirtualDisk $model ([string]$d.PNPDeviceID) $bus)
        data_sources       = $sources
        error              = $smart.error
    }
}

Write-Output (@($result | Sort-Object index) | ConvertTo-Json -Depth 12 -Compress)
`

return {
  name: 'dsh-hardware-info',
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    // 组装一次完整提取命令：参数变量赋值 + 脚本主体
    function buildCommand(driveIndexes, basic, noSmartctl, smartctlPath) {
      const idx = (driveIndexes || [])
        .map((n) => String(Number(n)))
        .filter((s) => s !== 'NaN')
        .join(',')
      const safe = String(smartctlPath || '').replace(/'/g, "''")
      return [
        '$DriveIndex = @(' + idx + ')',
        '$Basic = $' + (basic ? 'true' : 'false'),
        '$NoSmartctl = $' + (noSmartctl ? 'true' : 'false'),
        "$SmartctlPath = '" + safe + "'",
        SCRIPT_BODY,
      ].join('\n')
    }

    // 执行提取并解析 JSON
    async function runExtract(command, timeoutMs) {
      const spec = shell.resolve({
        command: command,
        timeoutMs: timeoutMs,
        stdoutMaxBytes: 8 * 1024 * 1024,
      })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) {
        const stderr = String((result.stderr && result.stderr.text) || '').trim()
        return {
          ok: false,
          exitCode: result.exitCode,
          error: '提取命令执行失败' + (stderr ? ': ' + stderr.slice(0, 2000) : ''),
        }
      }
      const text = String((result.stdout && result.stdout.text) || '').trim()
      if (!text) {
        return { ok: false, exitCode: 0, error: '提取脚本无输出（可能不在 Windows 环境或 WMI 不可用）' }
      }
      try {
        const disks = JSON.parse(text)
        const arr = Array.isArray(disks) ? disks : [disks]
        if (arr.length === 0) {
          return {
            ok: false,
            exitCode: 0,
            error: '未枚举到任何物理磁盘：WMI 查询可能被当前运行环境阻止（DSH 沙箱限制命名管道/WMI 访问，或缺少权限）。建议改用 SKILL 回退路径，在不受限的 PowerShell 中直接执行 scripts/Get-DiskHardwareInfo.ps1。',
          }
        }
        return { ok: true, disks: arr }
      } catch (e) {
        return {
          ok: false,
          exitCode: 0,
          error: 'JSON 解析失败: ' + String(e && e.message ? e.message : e),
          rawTail: text.slice(-2000),
        }
      }
    }

    // ── 工具 1：枚举物理磁盘身份信息（快，无需管理员）──
    const listTool = harness.defineTool({
      name: 'list_physical_disks',
      description: '枚举本机物理磁盘的硬件身份信息：设备号、型号、序列号、固件版本、接口与总线类型、介质类型、容量和基础健康状态。仅 Windows；只读查询，不修改任何数据。省略参数查询全部磁盘。',
      parameters: {
        driveIndex: {
          type: 'integer',
          description: '可选：只查询指定 PhysicalDrive 编号（0、1、…）；省略查询全部。',
        },
      },
      output: {
        schema: { type: 'json' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      timeoutMs: 60000,
      async execute(args) {
        const idx = args.driveIndex === undefined || args.driveIndex === null ? [] : [args.driveIndex]
        return runExtract(buildCommand(idx, true, false, ''), 60000)
      },
    })
    harness.registerTool(ctx, listTool)

    // ── 工具 2：读取磁盘 S.M.A.R.T. 健康数据 ──
    const smartTool = harness.defineTool({
      name: 'read_disk_smart',
      description: '读取物理磁盘的 S.M.A.R.T. 健康数据：整体健康状态、温度、上电时间、总读写量、磨损与属性表（多通道回退：root\\WMI ATA SMART 原始属性 → MSFT 存储可靠性计数器 → smartctl）。完整数据通常需要管理员权限；无权限时仍返回身份信息并注明错误。仅 Windows；只读查询，不修改任何数据。',
      parameters: {
        driveIndex: {
          type: 'integer',
          description: '可选：只查询指定 PhysicalDrive 编号（0、1、…）；省略查询全部。',
        },
        useSmartctl: {
          type: 'boolean',
          description: '是否允许 smartctl.exe 回退通道（默认 true；离线取证环境可设 false 禁用第三方工具）。',
        },
        smartctlPath: {
          type: 'string',
          description: '可选：自定义 smartctl.exe 绝对路径，优先于内置查找顺序（固定安装目录 → PATH）。',
        },
      },
      output: {
        schema: { type: 'json' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      timeoutMs: 180000,
      async execute(args) {
        const idx = args.driveIndex === undefined || args.driveIndex === null ? [] : [args.driveIndex]
        const noSmartctl = args.useSmartctl === false
        return runExtract(buildCommand(idx, false, noSmartctl, args.smartctlPath || ''), 180000)
      },
    })
    harness.registerTool(ctx, smartTool)
  },
}
