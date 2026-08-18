---
name: dsh-hardware-info
description: 提取 Windows 物理磁盘硬件信息（型号、序列号、固件版本、接口与总线类型、容量）与 S.M.A.R.T. 健康数据（整体健康状态、温度、上电时间、总读写量、磨损、属性表），多通道回退：Win32_DiskDrive WMI（USB 桥盘完整模式另走 SCSI SAT 直通取桥后真实盘体身份）→ root\WMI ATA SMART 原始属性 → NVMe 原生健康日志 IOCTL 直通（真实通电时间/读写量，免提权免 smartctl）→ MSFT 存储可靠性计数器 → smartctl。当用户询问硬盘型号、序列号、SMART 信息、磁盘健康状态或取证设备清单时使用本技能。
---

# 硬盘硬件信息提取（Windows）

从 Windows 物理磁盘提取身份信息与 S.M.A.R.T. 健康数据。参考
[FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer) 的提取实现，
经版权方授权以 MIT 许可重新发布；通道设计与判定规则见 `docs/DESIGN.md`。

安装了原生核心 `dskinfo.exe`（兄弟仓库 dskinfo，本技能逻辑的 C#/.NET 10 移植）时，
插件工具与直接调用都会**自动优先**走原生核心，未安装则使用本仓库 PowerShell 实现——
两者输出字段一致，见「原生核心 dskinfo.exe」。

## 何时使用

- 用户询问某块硬盘的型号、序列号、固件版本、接口类型、容量
- 用户想了解磁盘健康状态 / SMART 数据（温度、上电时间、重分配扇区、磨损）
- 取证场景需要设备清单（多块盘的身份信息 + 健康状态）
- 需要在报告中引用设备标识信息

## 前置条件

- Windows 主机（PowerShell 5.1+ / pwsh 7+）
- 原生核心 `dskinfo.exe`（可选，推荐）：存在时插件工具自动优先使用，免去 PowerShell
  脚本解析开销；探测顺序与安装方式见「原生核心 dskinfo.exe」
- 基本信息（型号/序列号/容量）：无需管理员
- NVMe 盘完整 SMART（原生健康日志 IOCTL 直通，含真实通电时间/读写量）：无需管理员；
- 其他盘完整 SMART（MSFT 计数器 / root\WMI 原始属性 / smartctl）：通常需要管理员权限；
  无权限时返回基本信息并附带 error 字段说明
- smartctl 通道可选：smartmontools 安装于固定目录或 PATH
- USB 桥接移动硬盘的真实盘体型号/序列号/固件：SCSI SAT 直通通道（需管理员权限
  与完整语言模式；非管理员或沙箱受限会话下自动跳过，只返回桥上报的通用信息）
- 宿主会话若运行在沙箱下，WMI 命名管道可能被拦截（判定与绕行见「常见问题排查」）

## 首选路径：插件工具

如果当前会话已加载本仓库的 Cordis 插件，直接调用工具（不传参数 = 全部磁盘）：

| 工具 | 用途 | 速度/权限 |
|------|------|-----------|
| `list_physical_disks` | 身份信息：型号、序列号、固件、接口/总线、容量、基础健康 | 快，无需管理员 |
| `read_disk_smart` | 完整 SMART：健康状态、温度、上电时间、读写量、属性表 | 慢，完整数据需管理员 |

用法示例（对模型而言）：

```text
调用 list_physical_disks 列出所有磁盘
调用 read_disk_smart { driveIndex: 0 } 读取 0 号盘 SMART
调用 read_disk_smart { driveIndex: 0, useSmartctl: false } 禁用第三方工具
```

工具返回中的 `source` 字段标记实际提取引擎：`dskinfo.exe`（原生核心）或
`powershell`（内嵌脚本）；原生核心失败自动回退脚本时附带 `note` 说明原因。

## 原生核心 dskinfo.exe（可选，自动优先）

[dskinfo](https://github.com/javinglee2025/dskinfo) 是本仓库提取逻辑的原生核心版
（C# / .NET 10）：判定规则、数据通道与本仓库逐一移植同源，以版本化 JSON 契约
（v1）对外输出，冷启动与解析速度显著优于 PowerShell 脚本。**无需安装即可使用本技能**；
安装后所有路径自动优先走它。

**探测顺序**（插件每次会话首次调用时探测一次）：

1. `DSKINFO_EXE` 环境变量（推荐设为绝对路径，规避 PATH 劫持面）
2. PATH 上的 `dskinfo.exe`
3. 均未命中 → 使用内嵌 PowerShell 脚本（行为不变）

原生核心执行失败（进程崩溃、无输出、JSON 解析失败）时自动回退内嵌脚本重试一次；
空盘列表属运行环境问题（沙箱拦截 WMI），两引擎同样无解，不回退。

**直接调用**（插件未加载时同样推荐优先 exe）：

```powershell
# 全部磁盘（身份 + SMART；stdout 输出契约 v1 JSON）
dskinfo.exe

# 指定盘、只要基本信息（快，无需管理员）
dskinfo.exe --drive-index 0 --basic

# 离线取证：禁用 smartctl 回退 / 自定义 smartctl 路径
dskinfo.exe --no-smartctl
dskinfo.exe --smartctl-path 'D:\tools\smartctl.exe'
```

参数与 ps1 一一对应（`-DriveIndex` ↔ `--drive-index`、`-Basic` ↔ `--basic`、
`-NoSmartctl` ↔ `--no-smartctl`、`-SmartctlPath` ↔ `--smartctl-path`）。
退出码：`0` 正常（含空盘列表/部分盘 SMART 失败）· `1` 未捕获错误 · `3` 环境不可用。

**输出差异**（与 ps1 相比多一层信封）：

```powershell
# ps1 输出裸数组：(Get-DiskHardwareInfo.ps1 | ConvertFrom-Json) 即磁盘数组
# exe 输出信封：取 .disks 才是磁盘数组
$disks = (dskinfo.exe | ConvertFrom-Json).disks
$disks[0].model; $disks[0].health_status
```

盘对象字段与 ps1 完全一致（`data_sources`、`attributes[]` 等含义相同），
完整字段与单位见 dskinfo 仓库 `docs/CONTRACT.md`。

**获取方式**:克隆 dskinfo 仓库后发布 NativeAOT 单文件(2.8MB,零依赖、免装 .NET,
需本机有 MSVC C++ 与 Windows SDK 组件),放入 PATH 已有目录或任意位置后设置
`DSKINFO_EXE` 指向它:

```powershell
git clone https://github.com/javinglee2025/dskinfo.git
cd dskinfo
dotnet publish src/DshDiskInfo.Cli -c Release -r win-x64 -p:PublishAot=true -p:DskNoWmi=true -o publish-aot
# 产物 publish-aot\dskinfo.exe(复制到 PATH 目录,或设 DSKINFO_EXE 指向它;新开终端生效)
# 无 C++ 环境时的备选:--self-contained -p:PublishSingleFile=true(约 74MB,含 WMI 完整回退)
```

dskinfo 0.3.0 起核心全直通化(身份/SAT/NVMe/ATA SMART 均 IOCTL 直通),
`data_sources` 相应新增 `storage_query_property`、`ata_pass_through` 等取值,
完整语义见其 `docs/CONTRACT.md`。

## 回退路径：直接执行脚本

插件未加载或需要自定义参数时，直接用 PowerShell 工具执行本仓库脚本：

```powershell
# 全部磁盘完整 SMART
& '<仓库路径>/scripts/Get-DiskHardwareInfo.ps1'

# 指定盘、只要基本信息
& '<仓库路径>/scripts/Get-DiskHardwareInfo.ps1' -DriveIndex 0 -Basic

# 禁用 smartctl（离线取证环境）
& '<仓库路径>/scripts/Get-DiskHardwareInfo.ps1' -NoSmartctl

# 自定义 smartctl 路径
& '<仓库路径>/scripts/Get-DiskHardwareInfo.ps1' -SmartctlPath 'D:\tools\smartctl.exe'
```

脚本 stdout 只输出 UTF-8 JSON 数组，可直接 `ConvertFrom-Json` 解析；诊断走 Verbose 流。
脚本只读查询，不写入任何磁盘数据。

## 输出解读

每个磁盘对象：

| 字段 | 含义 |
|------|------|
| `device_id` / `index` | `\\.\PhysicalDrive0` / 盘号 |
| `model` / `serial_number` / `firmware_revision` | 型号 / 序列号 / 固件版本 |
| `interface_type` / `bus_type` | WMI 接口类型（SCSI/IDE/USB/NVMe）/ 物理总线（SATA/NVMe/USB/RAID…） |
| `media_type` / `capacity_bytes` | 介质类型（HDD/SSD…）/ 容量（字节） |
| `health_status` | `Good`（健康）`Warning`（警告）`Bad`（危险）`Unknown`（未知） |
| `temperature_celsius` / `power_on_hours` | 温度（°C）/ 上电累计小时 |
| `total_bytes_written` / `total_bytes_read` | 累计写入/读取字节（无数据为 null） |
| `attributes[]` | SMART 属性表：`id/name/raw_value/current/worst/threshold/is_critical/status` |
| `failure_predicted` | 是否预示故障（健康为 Bad 时为 true） |
| `is_virtual_disk` | 虚拟盘（VHD/VMware 等）为 true，虚拟盘跳过 SMART |
| `data_sources[]` | 实际命中的数据通道（win32_diskdrive / scsi_sat_passthrough / nvme_ioctl / wmi_ata_smart / msft_reliability / smartctl）；`scsi_sat_passthrough` 表示 USB 桥后真实盘体身份已由 SAT 直通命中，`nvme_ioctl` 表示 NVMe 原生健康日志直通命中（含真实通电时间与读写量） |
| `error` | 查询失败原因；null 表示成功 |

健康判定要点：

- 属性状态：`current <= threshold` → Bad；`current <= threshold+10` → Warning
- 关键属性（5/187/196/197/198/177/178/179/231/233）异常直接判 Bad
- 温度：阈值缺省 55°C，≥阈值 Warning，≥阈值+5 Bad
- 最终健康 = WMI Status × 属性评估 × MSFT PhysicalDisk 健康 三者合并（取最差）

数据解读注意：

- `serial_number` 按 MSFT_PhysicalDisk 优先级解析（`AdapterSerialNumber` 剥离尾部
  `_NNNN` 控制器号 > `FruId` > `SerialNumber` 的 NGUID→ASCII 解码 > Win32 兜底）；
  NVMe 盘的 `Win32_DiskDrive.SerialNumber` 为 NGUID 编码形态，不可直接对外引用
- USB 桥接盘的 `model` / `serial_number` 默认来自桥芯片（常为通用名，如
  `USB3.0 storage USB Device`）；管理员完整模式下脚本经 SCSI SAT 直通自动替换为
  桥后真实盘体信息（命中时 `data_sources` 含 `scsi_sat_passthrough`），
  未命中则保留桥上报值
- NVMe 盘优先走原生健康日志 IOCTL 直通（`data_sources` 含 `nvme_ioctl`），
  直接给出真实 `power_on_hours` / 读写量，无需 smartctl；仅当该通道失败（如部分
  USB→NVMe 桥）才回退 MSFT 计数器（此时 `power_on_hours` 可能为 null，不代表新盘）
- `health_status = Good` 仅表示三通道合并判级正常，仍应结合属性表观察趋势
  （如重分配扇区、磨损百分比）

## 常见问题排查

- **如何确认工具实际用了哪个引擎**：看返回的 `source` 字段（`dskinfo.exe` /
  `powershell`）；若为 `powershell` 且带 `note`，说明原生核心执行失败已自动回退
- **PATH 上明明有 dskinfo.exe，工具却走 powershell**：DSH 宿主会话继承的 PATH/
  环境变量可能与交互终端不同（插件在会话内只探测一次）。在宿主会话可见的位置设置
  `DSKINFO_EXE` 绝对路径后重开会话，或接受 ps1 引擎（功能一致）
- **dskinfo.exe 输出解析不出磁盘数组**：exe 输出带契约 v1 信封
  （`{"schema_version":1,"disks":[...]}`），需取 `.disks`；ps1 才是裸数组
- **插件工具返回「未枚举到任何物理磁盘」**：DSH 宿主会话运行在沙箱下时，WMI（DCOM 依赖命名管道）被拦截。
  注意：此时经宿主 shell 直接执行脚本同样会输出空数组 `[]` 或 CimException「无法从客户端中访问 CIM 资源」，
  不要反复重试；让用户在**不受限的 PowerShell 终端**中执行脚本，或在完整访问模式的会话中运行
- **如何确认是沙箱拦截而非权限/服务问题**：Winmgmt 与 DcomLaunch 服务均在运行，
  但 `Get-CimInstance Win32_ComputerSystem` 报「无法从客户端中访问 CIM 资源」→ 即命名管道被沙箱拦截
- **NVMe 盘完整 SMART 无需提权**：原生健康日志直通通道未提权即可命中
- **完整 SMART 需要提权**（SATA/USB 桥盘走 MSFT/SAT/root\WMI 时）：请用户在管理员 PowerShell 中运行；或使用
  `Start-Process powershell -Verb RunAs`（弹 UAC，用户点「是」）自动提权重跑
- **`power_on_hours` 为 0 或 null 但盘已使用很久**：NVMe 盘应命中 `nvme_ioctl` 通道
  （免提权给出真实通电时间/读写量）；若 `data_sources` 无 `nvme_ioctl`（如 USB→NVMe 桥），
  MSFT 计数器通道未追踪该字段，不代表新盘，可安装 smartmontools 走 smartctl 通道
- **is_virtual_disk = true**：虚拟盘没有真实 SMART，属预期行为
- **error 提示需要管理员权限**：MSFT 计数器与 root\WMI 原始属性需要提权；请用户在管理员会话中运行或接受基本信息
- **USB 桥接移动硬盘无 SMART**：smartctl 通道会尝试 `-d sat`；安装 smartmontools 可提升成功率
- **USB 桥接盘型号/序列号是通用桥信息**：管理员权限 + 完整语言模式下脚本经 SCSI SAT
  直通自动取桥后真实盘体（免 smartmontools）；非管理员或沙箱受限会话该通道跳过，
  请在不受限的管理员 PowerShell 中运行
- **`data_sources` 含 `scsi_sat_passthrough`**：USB 桥后真实盘体身份已命中，
  `model`/`serial_number`/`firmware_revision` 为真实盘体值而非桥信息
- **data_sources 只有 win32_diskdrive**：三条 SMART 通道全部失败，见 error 字段
- **序列号为空**：部分 USB 桥 / 虚拟盘不上报序列号，属正常

## 安全注意

- 脚本与工具均为**只读**查询：不写入设备、不修改系统状态（dskinfo.exe 同理）
- 序列号/型号属于设备标识信息：对外报告（尤其公开场合）前先与用户确认脱敏需求
- smartctl 若只在 PATH 上命中，脚本会以 Verbose 提示搜索顺序劫持风险
- dskinfo.exe 经 PATH 命中时同理存在搜索顺序劫持面：安全敏感环境用 `DSKINFO_EXE`
  固定绝对路径，并确认文件来源（官方仓库构建产物）
