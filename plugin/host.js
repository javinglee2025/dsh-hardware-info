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
const SCRIPT_BODY = `# decode \\uXXXX escapes (ASCII-safe embedding, see tools/sync-hostjs.ps1)
function ConvertFrom-UEsc {
    param([string]$s)
    $sb = New-Object System.Text.StringBuilder
    $i = 0
    while ($i -lt $s.Length) {
        if ($s[$i] -eq '\\' -and ($i + 6) -le $s.Length -and $s[$i + 1] -eq 'u' -and $s.Substring($i + 2, 4) -match '^[0-9A-Fa-f]{4}$') {
            [void]$sb.Append([char][Convert]::ToInt32($s.Substring($i + 2, 4), 16))
            $i += 6
        }
        elseif ($s[$i] -eq '\\' -and ($i + 1) -lt $s.Length -and $s[$i + 1] -eq '\\') {
            [void]$sb.Append('\\')
            $i += 2
        }
        else {
            [void]$sb.Append($s[$i])
            $i++
        }
    }
    $sb.ToString()
}


# ??? ?????????? param ??????? tools/sync-hostjs.ps1 ??? plug?n/host.js ???
# ????? param ?????????????????????????????????

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = (ConvertFrom-UEsc 'SilentlyContinue')

# ??????????????????????????? ??????ATA SMART ?????????????????????????????????

$script:AttrNames = @{
    1   = (ConvertFrom-UEsc '\\u8BFB\\u53D6\\u9519\\u8BEF\\u7387')
    2   = (ConvertFrom-UEsc '\\u541E\\u5410\\u6027\\u80FD')
    3   = (ConvertFrom-UEsc '\\u8D77\\u65CB\\u65F6\\u95F4')
    4   = (ConvertFrom-UEsc '\\u8D77\\u505C\\u6B21\\u6570')
    5   = (ConvertFrom-UEsc '\\u91CD\\u5206\\u914D\\u6247\\u533A\\u8BA1\\u6570')
    7   = (ConvertFrom-UEsc '\\u5BFB\\u9053\\u9519\\u8BEF\\u7387')
    8   = (ConvertFrom-UEsc '\\u5BFB\\u9053\\u65F6\\u95F4\\u6027\\u80FD')
    9   = (ConvertFrom-UEsc '\\u4E0A\\u7535\\u7D2F\\u8BA1\\u65F6\\u95F4')
    10  = (ConvertFrom-UEsc '\\u8D77\\u65CB\\u91CD\\u8BD5\\u6B21\\u6570')
    12  = (ConvertFrom-UEsc '\\u7535\\u6E90\\u5468\\u671F\\u8BA1\\u6570')
    175 = (ConvertFrom-UEsc '\\u574F\\u5757\\u8BA1\\u6570')
    176 = (ConvertFrom-UEsc '\\u64E6\\u9664\\u8BA1\\u6570')
    177 = (ConvertFrom-UEsc '\\u78E8\\u635F\\u5747\\u8861\\u8BA1\\u6570')
    178 = (ConvertFrom-UEsc '\\u9884\\u671F\\u5BFF\\u547D')
    179 = (ConvertFrom-UEsc '\\u5DF2\\u7528\\u4FDD\\u7559\\u5757')
    180 = (ConvertFrom-UEsc '\\u7F16\\u7A0B\\u5931\\u8D25\\u8BA1\\u6570')
    181 = (ConvertFrom-UEsc '\\u7F16\\u7A0B\\u5931\\u8D25\\u8BA1\\u6570(\\u603B\\u8BA1)')
    182 = (ConvertFrom-UEsc '\\u64E6\\u9664\\u5931\\u8D25\\u8BA1\\u6570')
    187 = (ConvertFrom-UEsc '\\u62A5\\u544A\\u4E0D\\u53EF\\u7EA0\\u6B63\\u9519\\u8BEF')
    188 = (ConvertFrom-UEsc '\\u547D\\u4EE4\\u8D85\\u65F6')
    189 = (ConvertFrom-UEsc '\\u9AD8\\u98DE\\u5199\\u5165')
    190 = (ConvertFrom-UEsc '\\u6C14\\u6D41\\u6E29\\u5EA6')
    191 = (ConvertFrom-UEsc 'G-Sense \\u9519\\u8BEF\\u7387')
    192 = (ConvertFrom-UEsc '\\u65AD\\u7535\\u7F29\\u56DE\\u8BA1\\u6570')
    193 = (ConvertFrom-UEsc '\\u52A0\\u8F7D/\\u5378\\u8F7D\\u5468\\u671F')
    194 = (ConvertFrom-UEsc '\\u6E29\\u5EA6')
    195 = (ConvertFrom-UEsc '\\u786C\\u4EF6 ECC \\u6062\\u590D')
    196 = (ConvertFrom-UEsc '\\u91CD\\u5206\\u914D\\u4E8B\\u4EF6\\u8BA1\\u6570')
    197 = (ConvertFrom-UEsc '\\u5F53\\u524D\\u5F85\\u6620\\u5C04\\u6247\\u533A')
    198 = (ConvertFrom-UEsc '\\u79BB\\u7EBF\\u4E0D\\u53EF\\u7EA0\\u6B63\\u6247\\u533A')
    199 = (ConvertFrom-UEsc 'UltraDMA CRC \\u9519\\u8BEF')
    200 = (ConvertFrom-UEsc '\\u5199\\u5165\\u9519\\u8BEF\\u7387')
    201 = (ConvertFrom-UEsc '\\u8F6F\\u8BFB\\u53D6\\u9519\\u8BEF\\u7387')
    202 = (ConvertFrom-UEsc '\\u6570\\u636E\\u5730\\u5740\\u6807\\u8BB0\\u9519\\u8BEF')
    203 = (ConvertFrom-UEsc '\\u8017\\u5C3D\\u53D6\\u6D88\\u8BA1\\u6570')
    204 = (ConvertFrom-UEsc '\\u8F6F ECC \\u7EA0\\u6B63\\u7387')
    205 = (ConvertFrom-UEsc '\\u70ED\\u81A8\\u80C0\\u7387')
    206 = (ConvertFrom-UEsc '\\u98DE\\u9AD8')
    207 = (ConvertFrom-UEsc '\\u65CB\\u8F6C\\u9AD8\\u7535\\u6D41')
    208 = (ConvertFrom-UEsc '\\u65CB\\u8F6C\\u8109\\u51B2')
    209 = (ConvertFrom-UEsc '\\u79BB\\u7EBF\\u5BFB\\u9053\\u6027\\u80FD')
    210 = (ConvertFrom-UEsc '\\u632F\\u52A8')
    211 = (ConvertFrom-UEsc '\\u632F\\u52A8\\u5BFC\\u81F4\\u7684\\u5199\\u5165\\u9519\\u8BEF')
    212 = (ConvertFrom-UEsc '\\u632F\\u52A8\\u5BFC\\u81F4\\u7684\\u8BFB\\u53D6\\u9519\\u8BEF')
    220 = (ConvertFrom-UEsc '\\u78C1\\u76D8\\u504F\\u79FB')
    221 = (ConvertFrom-UEsc 'G-Sense/\\u632F\\u52A8')
    222 = (ConvertFrom-UEsc '\\u5DF2\\u52A0\\u8F7D\\u5C0F\\u65F6\\u6570')
    223 = (ConvertFrom-UEsc '\\u52A0\\u8F7D/\\u5378\\u8F7D\\u91CD\\u8BD5\\u8BA1\\u6570')
    224 = (ConvertFrom-UEsc '\\u8D1F\\u8F7D\\u6469\\u64E6')
    225 = (ConvertFrom-UEsc '\\u52A0\\u8F7D/\\u5378\\u8F7D\\u5468\\u671F\\u8BA1\\u6570')
    226 = (ConvertFrom-UEsc '\\u52A0\\u8F7D\\u65F6\\u95F4')
    227 = (ConvertFrom-UEsc '\\u626D\\u77E9\\u653E\\u5927\\u8BA1\\u6570')
    228 = (ConvertFrom-UEsc '\\u65AD\\u7535\\u7F29\\u56DE\\u5468\\u671F')
    230 = (ConvertFrom-UEsc 'GMR \\u78C1\\u5934\\u632F\\u5E45')
    231 = (ConvertFrom-UEsc '\\u5BFF\\u547D\\u5269\\u4F59')
    232 = (ConvertFrom-UEsc '\\u8010\\u4E45\\u6027\\u5269\\u4F59')
    233 = (ConvertFrom-UEsc '\\u4ECB\\u8D28\\u78E8\\u635F\\u6307\\u793A\\u5668')
    234 = (ConvertFrom-UEsc '\\u5E73\\u5747\\u64E6\\u9664\\u8BA1\\u6570')
    235 = (ConvertFrom-UEsc '\\u826F\\u597D\\u5757\\u8BA1\\u6570')
    240 = (ConvertFrom-UEsc '\\u78C1\\u5934\\u98DE\\u884C\\u5C0F\\u65F6\\u6570')
    241 = (ConvertFrom-UEsc 'LBA \\u5199\\u5165\\u603B\\u8BA1')
    242 = (ConvertFrom-UEsc 'LBA \\u8BFB\\u53D6\\u603B\\u8BA1')
    250 = (ConvertFrom-UEsc '\\u8BFB\\u53D6\\u9519\\u8BEF\\u91CD\\u8BD5\\u7387')
}

# ?????????????????
$script:CriticalIds = @(5, 187, 196, 197, 198, 177, 178, 179, 231, 233)

function Get-AttrName {
    param([int]$Id)
    if ($script:AttrNames.ContainsKey($Id)) { return $script:AttrNames[$Id] }
    if ($Id -ge 170 -and $Id -le 254) { return (ConvertFrom-UEsc '\\u5382\\u5546\\u7279\\u5B9A') }
    return ((ConvertFrom-UEsc '\\u672A\\u77E5\\u5C5E\\u6027({0})') -f $Id)
}

function Test-CriticalAttr {
    param([int]$Id)
    return ($script:CriticalIds -contains $Id)
}

# ??????????????? > 0 ???? <= ?? ? Bad?<= ??+10 ? Warn?ng?
function Get-AttrStatus {
    param([int]$Current, [int]$Threshold)
    if ($Threshold -gt 0 -and $Current -le $Threshold) { return 'Bad' }
    if ($Current -le ($Threshold + 10)) { return (ConvertFrom-UEsc 'Warning') }
    return 'Good'
}

# ????????????
function Merge-Health {
    param([string]$A, [string]$B)
    if ($A -eq 'Bad' -or $B -eq 'Bad') { return 'Bad' }
    if ($A -eq (ConvertFrom-UEsc 'Warning') -or $B -eq (ConvertFrom-UEsc 'Warning')) { return (ConvertFrom-UEsc 'Warning') }
    if ($A -eq 'Good' -and $B -eq 'Good') { return 'Good' }
    if ($A -eq 'Good' -and $B -eq 'Unknown') { return 'Good' }
    if ($A -eq 'Unknown' -and $B -eq 'Good') { return 'Good' }
    return 'Unknown'
}

# ???????????? 55?C ??????
function Get-AssessedHealth {
    param($Attributes)
    $hasWarning = $false
    $hasBad = $false
    foreach ($a in @($Attributes)) {
        if ($a.status -eq 'Bad') {
            if ($a.is_critical) { $hasBad = $true } else { $hasWarning = $true }
        }
        elseif ($a.status -eq (ConvertFrom-UEsc 'Warning')) { $hasWarning = $true }
        if ($a.id -eq 194 -or $a.id -eq 190) {
            $temp = [int]($a.raw_value -band 0xFF)
            $th = if ($a.threshold -gt 0) { $a.threshold } else { 55 }
            if ($temp -ge $th) {
                if ($temp -ge ($th + 5)) { $hasBad = $true } else { $hasWarning = $true }
            }
        }
    }
    if ($hasBad) { return 'Bad' }
    if ($hasWarning) { return (ConvertFrom-UEsc 'Warning') }
    if (@($Attributes).Count -eq 0) { return 'Unknown' }
    return 'Good'
}

# ??????? 194/190????????15..120?C ???
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

# ??? ?D ????
function Get-ValueFromAttrs {
    param($Attributes, [int]$Id)
    foreach ($a in @($Attributes)) {
        if ($a.id -eq $Id) { return $a.raw_value }
    }
    return $null
}

# ????????? v?rtual/???PNP ? V?RTUAL?SWD\\ ?????
function Test-VirtualDisk {
    param([string]$Model, [string]$Pnp, [string]$Bus)
    if ($Model.ToLowerInvariant().Contains((ConvertFrom-UEsc 'virtual'))) { return $true }
    if ($Model.Contains((ConvertFrom-UEsc '\\u865A\\u62DF'))) { return $true }
    $pnpUpper = $Pnp.ToUpperInvariant()
    if ($pnpUpper.Contains((ConvertFrom-UEsc 'VIRTUAL'))) { return $true }
    if ($pnpUpper.StartsWith('SWD\\')) { return $true }
    if ($Bus -eq (ConvertFrom-UEsc 'File Backed Virtual')) { return $true }
    return $false
}

# ?? ?? 2?root\\WM? MSStorageDr?ver_ATAP?SmartData?ATA SMART 512 ?????????
function Get-WmiAtaSmart {
    param([string]$Serial)
    try {
        $entries = @(Get-CimInstance -Namespace (ConvertFrom-UEsc 'root/wmi') -ClassName (ConvertFrom-UEsc 'MSStorageDriver_ATAPISmartData') -ErrorAction Stop)
    } catch { return $null }
    if ($entries.Count -eq 0) { return $null }

    # ??????????nstanceName ????????????????????
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

    # ????MSStorageDr?ver_ATAP?SmartThresholds?? ?nstanceName ?????????????
    # Thresholds ? VendorSpec?f?c ?????? 2 ????? + 30 ? ? 12 ?????
    # ??? ?d(1) + threshold(1) + ??(10)????????? +1
    $thresholds = @{}
    try {
        $tArr = @(Get-CimInstance -Namespace (ConvertFrom-UEsc 'root/wmi') -ClassName (ConvertFrom-UEsc 'MSStorageDriver_ATAPISmartThresholds') -ErrorAction Stop)
        foreach ($t in $tArr) {
            $tInst = [string]$t.InstanceName
            $match = if ($tArr.Count -eq 1) { $true } else { ($tInst -eq $chosenInst) }
            if ($match) {
                $th = $t.Thresholds
                $thBytes = $null
                if ($th -is [byte[]]) { $thBytes = $th } elseif ($th) { $thBytes = [byte[]]$th }
                if ($thBytes) {
                    for ($i = 0; $i -lt 30; $i++) {
                        $o = 2 + $i * 12 + 1
                        if ($o -ge $thBytes.Length) { break }
                        $thresholds[$i] = [int]$thBytes[$o]
                    }
                }
                break
            }
        }
    } catch { }

    # ????? 2 ???? 2 ????????? 30 ???? 12 ???ATA SMART READ DATA ?????
    $attrs = @()
    for ($i = 0; $i -lt 30; $i++) {
        $o = 2 + $i * 12
        if ($o + 12 -gt $chosen.Length) { break }
        $id = [int]$chosen[$o]
        if ($id -eq 0) { continue }
        $current = [int]$chosen[$o + 3]
        $worst = [int]$chosen[$o + 4]
        # ????6 ??????????????????
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

# ???/???/???????? Get-Phys?calD?sk ???Dev?ceNumber ????????????????
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

# ?? ??????????? FileSystemExplorer / FileSystemExplorer
# W?n32_D?skDr?ve.Ser?alNumber ? NVMe ??? NGU?D ???????????
# ?????? MSFT_Phys?calD?sk.AdapterSer?alNumber??????? _NNNN??? Fru?d?

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
    $s = ($chars -join '').Trim()
    # ???????????????????????? NGU?D ??????????????
    if ($s.Length -ge 8 -and $s -match '^[A-Za-z0-9._-]+$') { return $s }
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
    # 1) AdapterSer?alNumber?NVMe ????????? _NNNN?????????
    if ($Pd -and $null -ne $Pd.PSObject.Properties[(ConvertFrom-UEsc 'AdapterSerialNumber')]) {
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
    # 2) Fru?d????? AP? ????????
    if ($Pd -and $null -ne $Pd.PSObject.Properties[(ConvertFrom-UEsc 'FruId')]) {
        $fru = ([string]$Pd.FruId).Trim()
        if ($fru) { return $fru }
    }
    # 3) Storage Ser?alNumber?NGU?D ???????? ASC??
    if ($Pd -and $null -ne $Pd.PSObject.Properties[(ConvertFrom-UEsc 'SerialNumber')]) {
        $snum = ([string]$Pd.SerialNumber).Trim()
        if ($snum) {
            if (Test-LooksLikeNguidEui $snum) {
                $ascii = ConvertFrom-HexSerial $snum
                if ($ascii) { return $ascii }
            }
            return $snum
        }
    }
    # 4) W?n32_D?skDr?ve ??
    return $Win32Serial
}

# ?? ?? 2?USB ? SCS? SAT ???????? smartmontools????????
# W?n32/WM? ? USB ????????????? "USB3.0 storage USB Dev?ce"??
# ???????? SCS? PASS THROUGH D?RECT ? ATA PASS-THROUGH(16)?CDB 0x85?
# ?? ?DENT?FY DEV?CE(0xEC) ?????? smartmontools -d sat ??????
# ???? @{ model = ..; ser?al = ..; fw = .. }????? $null??????????
function Get-UsbSatIdentity {
    param([int]$Index)

    # Add-Type ????????????????DSH ?????????????
    if (-not ((ConvertFrom-UEsc 'DshDiskProbe') -as [type])) {
        $src = @"
using System;
using System.Runtime.InteropServices;
public static class DshDiskProbe {
    [StructLayout(LayoutKind.Sequential)]
    public struct SPTD {
        public ushort Length;
        public byte ScsiStatus, PathId, TargetId, Lun, CdbLength, SenseInfoLength, DataIn;
        public uint DataTransferLength, TimeOutValue;
        public IntPtr DataBuffer;
        public uint SenseInfoOffset;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)] public byte[] Cdb;
    }
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true, EntryPoint = "DeviceIoControl")]
    public static extern bool DeviceIoControlScsi(IntPtr h, uint code, ref SPTD i, uint isz, ref SPTD o, uint osz, out uint ret, IntPtr ov);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);
}
"@
        try { Add-Type -TypeDefinition $src -ErrorAction Stop }
        catch {
            Write-Verbose (ConvertFrom-UEsc 'SAT \\u76F4\\u901A: Add-Type \\u7F16\\u8BD1\\u5931\\u8D25\\uFF08\\u53D7\\u9650\\u8BED\\u8A00\\u6A21\\u5F0F\\u6216\\u7F16\\u8BD1\\u73AF\\u5883\\u7F3A\\u5931\\uFF09\\uFF0C\\u8DF3\\u8FC7\\u901A\\u9053')
            return $null
        }
    }

    # ?????????SCS? ??????????????
    $path = ((ConvertFrom-UEsc '\\\\\\\\.\\\\PhysicalDrive{0}') -f $Index)
    $h = [DshDiskProbe]::CreateFileW($path, [uint32]3221225472, 3, [IntPtr]::Zero, 3, 128, [IntPtr]::Zero)
    if ($h -eq [IntPtr]::Zero) {
        $h = [DshDiskProbe]::CreateFileW($path, [uint32]2147483648, 3, [IntPtr]::Zero, 3, 128, [IntPtr]::Zero)
    }
    if ($h -eq [IntPtr]::Zero) {
        Write-Verbose ((ConvertFrom-UEsc 'SAT \\u76F4\\u901A: \\u6253\\u5F00 {0} \\u5931\\u8D25\\uFF08\\u53EF\\u80FD\\u975E\\u7BA1\\u7406\\u5458\\uFF09\\uFF0C\\u8DF3\\u8FC7\\u901A\\u9053') -f $path)
        return $null
    }

    # ATA PASS-THROUGH(16) CDB?0x85 | P?O Data-?n | T_D?R/BYT_BLOK/512 | COUNT=1 | DEV=0xA0 | CMD=0xEC
    $cdb = New-Object byte[] 16
    $cdb[0] = 0x85; $cdb[1] = 8; $cdb[2] = 0x0E; $cdb[6] = 1; $cdb[13] = 0xA0; $cdb[14] = 0xEC

    # USB ? SAT ???????/?????HDD ?????? USB ????????
    # ?? 3 ???? 500ms????????????? w?n32/scs?Status ????
    $data = $null
    $attempt = 1
    while ($attempt -le 3 -and -not $data) {
        $s = [DshDiskProbe+SPTD]::new()
        $s.Length = [System.Runtime.InteropServices.Marshal]::SizeOf([type][DshDiskProbe+SPTD])
        $s.CdbLength = 16
        $s.DataIn = 1
        $s.DataTransferLength = [uint32]512
        $s.TimeOutValue = [uint32]10
        $s.Cdb = $cdb
        $buf = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(512)
        $s.DataBuffer = $buf
        $ret = [uint32]0
        $ok = [DshDiskProbe]::DeviceIoControlScsi($h, 0x4D014, [ref]$s, $s.Length, [ref]$s, $s.Length, [ref]$ret, [IntPtr]::Zero)
        $werr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($ok -and $s.ScsiStatus -eq 0) {
            $data = New-Object byte[] 512
            [System.Runtime.InteropServices.Marshal]::Copy($buf, $data, 0, 512)
        }
        else {
            Write-Verbose ((ConvertFrom-UEsc 'SAT \\u76F4\\u901A: PhysicalDrive{0} \\u7B2C {1} \\u6B21 IOCTL \\u672A\\u6210\\u529F\\uFF08win32={2} scsiStatus={3}\\uFF09') -f $Index, $attempt, $werr, $s.ScsiStatus)
            if ($attempt -lt 3) { Start-Sleep -Milliseconds 500 }
        }
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($buf)
        $attempt++
    }
    [DshDiskProbe]::CloseHandle($h) | Out-Null
    if (-not $data) {
        Write-Verbose ((ConvertFrom-UEsc 'SAT \\u76F4\\u901A: PhysicalDrive{0} \\u91CD\\u8BD5\\u540E\\u4ECD\\u5931\\u8D25\\uFF08\\u975E SATA \\u6865\\u6216\\u6743\\u9650\\u4E0D\\u8DB3\\uFF09\\uFF0C\\u8DF3\\u8FC7\\u901A\\u9053') -f $Index)
        return $null
    }

    # ?DENT?FY DEV?CE?model ?? 54..93?40??ser?al 20..39?20??fw 46..53?8?????
    $model = ConvertFrom-AtaString $data 54 40
    $serial = ConvertFrom-AtaString $data 20 20
    $fw = ConvertFrom-AtaString $data 46 8

    # ?????????????? 00000000?5C ??????????
    if ($model -and $serial -and $serial.Length -gt 6 -and $serial -notmatch '00000000' -and -not $serial.StartsWith('5C')) {
        return @{ model = $model; serial = $serial; fw = $fw }
    }
    Write-Verbose ((ConvertFrom-UEsc 'SAT \\u76F4\\u901A: PhysicalDrive{0} \\u8FD4\\u56DE\\u6570\\u636E\\u6821\\u9A8C\\u5931\\u8D25\\uFF08\\u6865\\u5047\\u5E8F\\u5217\\u53F7\\u6216\\u7A7A\\u6A21\\u578B\\uFF09\\uFF0C\\u4FDD\\u7559\\u6865\\u4E0A\\u62A5\\u4FE1\\u606F') -f $Index)
    return $null
}

# ATA ??????????????????????????
function ConvertFrom-AtaString {
    param([byte[]]$Data, [int]$Offset, [int]$Length)
    $sb = New-Object System.Text.StringBuilder
    for ($i = $Offset; $i -lt ($Offset + $Length); $i += 2) {
        $c1 = [char]$Data[$i + 1]
        $c2 = [char]$Data[$i]
        # ?????0x20?????????????? "WDC WD10..."?????
        # ????????? Tr?m() ??????????
        if ([int]$c1 -ge 32) { [void]$sb.Append($c1) }
        if ([int]$c2 -ge 32) { [void]$sb.Append($c2) }
    }
    return $sb.ToString().Trim()
}

# ?? ?? 3?MSFT ?????????Get-StorageRel?ab?l?tyCounter????????
function Get-MsftSmart {
    param($Pd)
    if (-not $Pd) { return $null }
    try {
        $counter = $Pd | Get-StorageReliabilityCounter -ErrorAction Stop
        if (-not $counter) { return $null }
    } catch { return $null }

    # ?????null??????????? null ? [?nt64] ??? 0 ????? / ??????
    $attrs = @()
    $temp = $null
    $poh = $null

    if ($null -ne $counter.Temperature) {
        $t = [int64]$counter.Temperature
        # ??????? ATA/NVMe ??? Kelv?n ???? 250..400???????
        if ($t -ge 250 -and $t -le 400) { $t = $t - 273 }
        if ($t -ge 1 -and $t -le 120) {
            $temp = $t
            $attrs += @{ id = 194; name = (ConvertFrom-UEsc '\\u6E29\\u5EA6'); raw_value = $t; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
        }
    }
    if ($null -ne $counter.PowerOnHours) {
        $powerOn = [int64]$counter.PowerOnHours
        if ($powerOn -ge 0) {
            $poh = $powerOn
            $attrs += @{ id = 9; name = (ConvertFrom-UEsc '\\u4E0A\\u7535\\u7D2F\\u8BA1\\u65F6\\u95F4'); raw_value = $powerOn; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
        }
    }
    if ($null -ne $counter.Wear) {
        $wear = [int64]$counter.Wear
        if ($wear -ge 0) {
            $wearCur = if ($wear -gt 100) { 0 } else { 100 - $wear }
            $wearStatus = 'Good'
            if ($wear -ge 100) { $wearStatus = 'Bad' } elseif ($wear -ge 90) { $wearStatus = (ConvertFrom-UEsc 'Warning') }
            $attrs += @{ id = 252; name = (ConvertFrom-UEsc '\\u5DF2\\u7528\\u5BFF\\u547D\\u767E\\u5206\\u6BD4'); raw_value = $wear; current = $wearCur; worst = $wearCur; threshold = 90; is_critical = $true; status = $wearStatus }
        }
    }
    if ($null -ne $counter.ReadErrorsTotal -or $null -ne $counter.WriteErrorsTotal) {
        $totalErr = 0
        if ($null -ne $counter.ReadErrorsTotal) { $totalErr += [int64]$counter.ReadErrorsTotal }
        if ($null -ne $counter.WriteErrorsTotal) { $totalErr += [int64]$counter.WriteErrorsTotal }
        $errCurrent = if ($totalErr -eq 0) { 100 } else { 0 }
        $errStatus = if ($totalErr -gt 0) { (ConvertFrom-UEsc 'Warning') } else { 'Good' }
        $attrs += @{ id = 255; name = (ConvertFrom-UEsc '\\u8BFB\\u5199\\u9519\\u8BEF\\u603B\\u8BA1'); raw_value = $totalErr; current = $errCurrent; worst = $errCurrent; threshold = 1; is_critical = $true; status = $errStatus }
    }

    # MSFT_Phys?calD?sk.HealthStatus?0=Healthy 1=Warn?ng 2=Unhealthy
    # ?????? cmdlet ?????????????????
    $hsRaw = $Pd.HealthStatus
    $health = 'Unknown'
    if ($hsRaw -is [string]) {
        $hsStr = [string]$hsRaw
        if ($hsStr -eq 'Healthy') { $health = 'Good' }
        elseif ($hsStr -eq (ConvertFrom-UEsc 'Warning')) { $health = (ConvertFrom-UEsc 'Warning') }
        elseif ($hsStr -eq 'Unhealthy') { $health = 'Bad' }
    }
    else {
        $hs = [int64]$hsRaw
        if ($hs -eq 0) { $health = 'Good' }
        elseif ($hs -eq 1) { $health = (ConvertFrom-UEsc 'Warning') }
        elseif ($hs -eq 2) { $health = 'Bad' }
    }
    return @{ attrs = $attrs; temp = $temp; poh = $poh; health = $health }
}

# ?? smartctl ????????????PATH ???????
function Resolve-Smartctl {
    param([string]$CustomPath)
    if ($CustomPath -and (Test-Path -LiteralPath $CustomPath)) { return $CustomPath }
    $fixed = @(
        (ConvertFrom-UEsc 'C:\\\\Program Files\\\\smartmontools\\\\bin\\\\smartctl.exe')
        (ConvertFrom-UEsc 'C:\\\\Program Files (x86)\\\\smartmontools\\\\bin\\\\smartctl.exe')
        (ConvertFrom-UEsc 'C:\\\\smartmontools\\\\bin\\\\smartctl.exe')
        (ConvertFrom-UEsc 'C:\\\\ProgramData\\\\chocolatey\\\\bin\\\\smartctl.exe')
    )
    foreach ($p in $fixed) { if (Test-Path -LiteralPath $p) { return $p } }
    $cmd = Get-Command smartctl -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Verbose (ConvertFrom-UEsc 'smartctl \\u4EC5\\u5728 PATH \\u4E0A\\u627E\\u5230\\uFF1A\\u5B58\\u5728\\u641C\\u7D22\\u987A\\u5E8F\\u52AB\\u6301\\u98CE\\u9669\\uFF0C\\u5EFA\\u8BAE\\u5B89\\u88C5\\u5230\\u56FA\\u5B9A\\u4F4D\\u7F6E')
        return $cmd.Source
    }
    return $null
}

# ?? ?? 4?smartctl -A --json??? ? -d sat ? -d nvme ?????
function Get-SmartctlSmart {
    param([int]$Index, [string]$Exe)
    if (-not $Exe) { return $null }
    $dev = ((ConvertFrom-UEsc '\\\\\\\\.\\\\PhysicalDrive{0}') -f $Index)
    $attempts = @(
        ,@('-A', '--json', $dev)
        ,@('-A', '--json', '-d', 'sat', $dev)
        ,@('-A', '--json', '-d', 'nvme', $dev)
    )
    # ???????????b?t3 ???? -A --json ?????????????
    # ???? 0 ????? JSON ??????????????????????????????????
    foreach ($argsList in $attempts) {
        $outText = ''
        try {
            $outText = (& $Exe @argsList 2>$null | Out-String)
        } catch { }
        if (-not $outText) { continue }
        try { $json = $outText | ConvertFrom-Json } catch { continue }

        # ATA ????ata_smart_attr?butes.table?
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

        # NVMe ???????nvme_smart_health_?nformat?on_log?
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
            $tempStatus = if ($tempC -ge 55) { (ConvertFrom-UEsc 'Warning') } else { 'Good' }
            $attrs += @{ id = 194; name = (ConvertFrom-UEsc '\\u6E29\\u5EA6'); raw_value = $tempC; current = $tempCurrent; worst = $tempCurrent; threshold = 55; is_critical = $false; status = $tempStatus }
            $attrs += @{ id = 9; name = (ConvertFrom-UEsc '\\u4E0A\\u7535\\u7D2F\\u8BA1\\u65F6\\u95F4'); raw_value = $nvmePoh; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $critCur = if ($critWarn -eq 0) { 100 } else { 0 }
            $critStatus = if ($critWarn -ne 0) { 'Bad' } else { 'Good' }
            $attrs += @{ id = 250; name = (ConvertFrom-UEsc '\\u4E25\\u91CD\\u8B66\\u544A\\u6807\\u5FD7'); raw_value = $critWarn; current = $critCur; worst = $critCur; threshold = 1; is_critical = $true; status = $critStatus }
            $spareStatus = 'Good'
            if ($spare -le $spareTh) { $spareStatus = 'Bad' } elseif ($spare -lt 10) { $spareStatus = (ConvertFrom-UEsc 'Warning') }
            $attrs += @{ id = 251; name = (ConvertFrom-UEsc '\\u53EF\\u7528\\u5907\\u7528\\u7A7A\\u95F4'); raw_value = $spare; current = $spare; worst = $spare; threshold = $spareTh; is_critical = $true; status = $spareStatus }
            $usedCur = if ($used -gt 100) { 0 } else { 100 - $used }
            $usedStatus = 'Good'
            if ($used -ge 100) { $usedStatus = 'Bad' } elseif ($used -ge 90) { $usedStatus = (ConvertFrom-UEsc 'Warning') }
            $attrs += @{ id = 252; name = (ConvertFrom-UEsc '\\u5DF2\\u7528\\u5BFF\\u547D\\u767E\\u5206\\u6BD4'); raw_value = $used; current = $usedCur; worst = $usedCur; threshold = 90; is_critical = $true; status = $usedStatus }
            # NVMe ???? = 1000 ? 512 ???NVMe ????????? 512 ?? LBA ?
            $attrs += @{ id = 241; name = (ConvertFrom-UEsc 'LBA \\u5199\\u5165\\u603B\\u8BA1'); raw_value = ($writeUnits * 1000); current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $attrs += @{ id = 242; name = (ConvertFrom-UEsc 'LBA \\u8BFB\\u53D6\\u603B\\u8BA1'); raw_value = ($readUnits * 1000); current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $attrs += @{ id = 12; name = (ConvertFrom-UEsc '\\u7535\\u6E90\\u5468\\u671F\\u8BA1\\u6570'); raw_value = $cycles; current = 100; worst = 100; threshold = 0; is_critical = $false; status = 'Good' }
            $mediaCur = if ($mediaErr -eq 0) { 100 } else { 0 }
            $mediaStatus = if ($mediaErr -gt 0) { (ConvertFrom-UEsc 'Warning') } else { 'Good' }
            $attrs += @{ id = 255; name = (ConvertFrom-UEsc '\\u4ECB\\u8D28\\u9519\\u8BEF\\u8BA1\\u6570'); raw_value = $mediaErr; current = $mediaCur; worst = $mediaCur; threshold = 1; is_critical = $true; status = $mediaStatus }

            $headTemp = if ($tempC -ge 1 -and $tempC -le 120) { $tempC } else { $null }
            return @{ attrs = $attrs; temp = $headTemp; poh = $nvmePoh; health = 'Unknown' }
        }
    }
    return $null
}

# ?? ?? SMART ???????????
function Get-DiskSmart {
    param([pscustomobject]$Disk, [int]$Index, [string]$Pnp, [string]$Bus, [bool]$NoSmartctlFlag, [string]$SmartctlPathArg, $Pd)
    $model = [string]$Disk.Model
    $serial = [string]$Disk.SerialNumber

    # ????????????? SMART????????????????????
    if (Test-VirtualDisk $model $Pnp $Bus) {
        return @{ attrs = @(); temp = $null; poh = $null; bw = $null; br = $null; health = 'Unknown'; sources = @(); error = (ConvertFrom-UEsc '\\u865A\\u62DF\\u78C1\\u76D8\\u4E0D\\u652F\\u6301 S.M.A.R.T. \\u76D1\\u63A7') }
    }

    # NVMe ????nterfaceType ?? SCS????? PNPDev?ce?D ???????
    $isNvme = ($Bus -eq 'NVMe') -or $Pnp.ToUpperInvariant().Contains('NVME')

    $attrs = @()
    $sources = @()
    $msftHealth = 'Unknown'

    # ATA/SATA??? root\\WM? ??????OCTL ATA PASS THROUGH ? PowerShell ????
    if (-not $isNvme) {
        Write-Verbose ((ConvertFrom-UEsc 'SMART: PhysicalDrive{0} \\u8D70 WMI ATA SMART \\u901A\\u9053') -f $Index)
        $wmiAttrs = Get-WmiAtaSmart $serial
        if ($wmiAttrs -and @($wmiAttrs).Count -gt 0) { $attrs = @($wmiAttrs); $sources += (ConvertFrom-UEsc 'wmi_ata_smart') }
    }

    # MSFT ?????????NVMe ???? / WM? ???????
    if (@($attrs).Count -eq 0) {
        Write-Verbose ((ConvertFrom-UEsc 'SMART: PhysicalDrive{0} \\u5C1D\\u8BD5 MSFT \\u5B58\\u50A8\\u53EF\\u9760\\u6027\\u8BA1\\u6570\\u5668') -f $Index)
        $msft = Get-MsftSmart $Pd
        if ($msft -and @($msft.attrs).Count -gt 0) {
            $attrs = @($msft.attrs)
            $msftHealth = $msft.health
            $sources += (ConvertFrom-UEsc 'msft_reliability')
        }
    }

    # smartctl ????
    if (@($attrs).Count -eq 0 -and -not $NoSmartctlFlag) {
        Write-Verbose ((ConvertFrom-UEsc 'SMART: PhysicalDrive{0} \\u5C1D\\u8BD5 smartctl \\u56DE\\u9000') -f $Index)
        $sc = Get-SmartctlSmart $Index (Resolve-Smartctl $SmartctlPathArg)
        if ($sc -and @($sc.attrs).Count -gt 0) { $attrs = @($sc.attrs); $sources += 'smartctl' }
    }

    # ??????? 194/190????? 9??? 241?512??? 242?512?
    $temp = Get-TempFromAttrs $attrs
    $poh = Get-ValueFromAttrs $attrs 9
    $bwRaw = Get-ValueFromAttrs $attrs 241
    $brRaw = Get-ValueFromAttrs $attrs 242
    $bw = $null
    $br = $null
    if ($null -ne $bwRaw) { $bw = [int64]$bwRaw * 512 }
    if ($null -ne $brRaw) { $br = [int64]$brRaw * 512 }

    # ?????WM? Status OK ? Good?
    $baseHealth = 'Unknown'
    $status = [string]$Disk.Status
    if ($status -ieq 'OK') { $baseHealth = 'Good' } elseif ($status) { $baseHealth = (ConvertFrom-UEsc 'Warning') }

    $error = $null
    if (@($attrs).Count -eq 0) {
        $health = $baseHealth
        $error = (ConvertFrom-UEsc '\\u65E0\\u6CD5\\u83B7\\u53D6 S.M.A.R.T. \\u6570\\u636E\\uFF08WMI/MSFT/smartctl \\u901A\\u9053\\u5747\\u5931\\u8D25\\uFF0C\\u78C1\\u76D8\\u53EF\\u80FD\\u4E0D\\u652F\\u6301\\u6216\\u9700\\u8981\\u7BA1\\u7406\\u5458\\u6743\\u9650\\uFF09')
    }
    else {
        $health = Merge-Health $baseHealth (Get-AssessedHealth $attrs)
        $health = Merge-Health $health $msftHealth
    }
    return @{ attrs = $attrs; temp = $temp; poh = $poh; bw = $bw; br = $br; health = $health; sources = $sources; error = $error }
}

# ????????????????????????????????? ??? ?????????????????????????????????

Write-Verbose ((ConvertFrom-UEsc 'SMART: \\u5F00\\u59CB\\u679A\\u4E3E\\u7269\\u7406\\u78C1\\u76D8\\uFF08Basic={0}\\uFF0CNoSmartctl={1}\\uFF09') -f $Basic, $NoSmartctl)

$wmiDisks = @(Get-CimInstance -ClassName (ConvertFrom-UEsc 'Win32_DiskDrive') -ErrorAction SilentlyContinue)
if ($DriveIndex.Count -gt 0) {
    $wmiDisks = @($wmiDisks | Where-Object { $DriveIndex -contains [int]$_.Index })
}
if ($wmiDisks.Count -eq 0) {
    Write-Output '[]'
    exit 0
}

# Get-Phys?calD?sk ???????/????????/???/???????
$pdList = @()
try {
    $pdList = @(Get-PhysicalDisk -ErrorAction Stop)
} catch {
    Write-Verbose (ConvertFrom-UEsc 'Get-PhysicalDisk \\u4E0D\\u53EF\\u7528\\uFF08\\u53EF\\u80FD\\u9700\\u8981\\u7BA1\\u7406\\u5458\\u6743\\u9650\\u6216 Storage \\u6A21\\u5757\\u7F3A\\u5931\\uFF09')
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

    # USB ????WM? ??????????????? SAT ???????????
    # ?-Bas?c ?????????????????/????????????? $null?
    $sat = $null
    if (-not $Basic -and ([string]$d.InterfaceType -eq 'USB' -or $bus -eq 'USB')) {
        $sat = Get-UsbSatIdentity $index
        if ($sat) {
            Write-Verbose ((ConvertFrom-UEsc 'IDENTITY: PhysicalDrive{0} USB \\u6865 SAT \\u76F4\\u901A\\u547D\\u4E2D\\u771F\\u5B9E\\u76D8\\u4F53 model={1} serial={2} fw={3}') -f $index, $sat.model, $sat.serial, $sat.fw)
            $model = $sat.model
            $serial = $sat.serial
        }
    }

    $smart = @{ attrs = @(); temp = $null; poh = $null; bw = $null; br = $null; health = 'Unknown'; sources = @(); error = $null }
    if (-not $Basic) {
        $smart = Get-DiskSmart $d $index ([string]$d.PNPDeviceID) $bus ([bool]$NoSmartctl) $SmartctlPath $pd
    }
    else {
        $status = [string]$d.Status
        if ($status -ieq 'OK') { $smart.health = 'Good' } elseif ($status) { $smart.health = (ConvertFrom-UEsc 'Warning') }
    }
    $sources = @((ConvertFrom-UEsc 'win32_diskdrive')) + @($smart.sources)
    if ($sat) { $sources += (ConvertFrom-UEsc 'scsi_sat_passthrough') }

    $result += [ordered]@{
        device_id          = ((ConvertFrom-UEsc '\\\\\\\\.\\\\PhysicalDrive{0}') -f $index)
        index              = $index
        model              = $model
        serial_number      = $serial
        firmware_revision  = if ($sat -and $sat.fw) { $sat.fw } else { [string]$d.FirmwareRevision }
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

# ????? PS ???Sort-Object ?ndex ????????????????????
# -?nputObject ?????????????? JSON ??
$sorted = @($result | Sort-Object { $_.index })
Write-Output (ConvertTo-Json -InputObject $sorted -Depth 12 -Compress)
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
