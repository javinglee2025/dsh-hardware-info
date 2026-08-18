---
name: dsh-hardware-info
description: 提取 Windows 物理磁盘硬件信息（型号、序列号、固件版本、接口与总线类型、容量）与 S.M.A.R.T. 健康数据（整体健康状态、温度、上电时间、总读写量、磨损、属性表），多通道回退：Win32_DiskDrive WMI → root\WMI ATA SMART 原始属性 → MSFT 存储可靠性计数器 → smartctl。当用户询问硬盘型号、序列号、SMART 信息、磁盘健康状态或取证设备清单时使用本技能。
---

# 硬盘硬件信息提取（Windows）

从 Windows 物理磁盘提取身份信息与 S.M.A.R.T. 健康数据。参考
[FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer) 的提取实现，
经版权方授权以 MIT 许可重新发布；通道设计与判定规则见 `docs/DESIGN.md`。

## 何时使用

- 用户询问某块硬盘的型号、序列号、固件版本、接口类型、容量
- 用户想了解磁盘健康状态 / SMART 数据（温度、上电时间、重分配扇区、磨损）
- 取证场景需要设备清单（多块盘的身份信息 + 健康状态）
- 需要在报告中引用设备标识信息

## 前置条件

- Windows 主机（PowerShell 5.1+ / pwsh 7+）
- 基本信息（型号/序列号/容量）：无需管理员
- 完整 SMART（MSFT 计数器 / root\WMI 原始属性 / smartctl）：通常需要管理员权限；
  无权限时返回基本信息并附带 error 字段说明
- smartctl 通道可选：smartmontools 安装于固定目录或 PATH
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
| `data_sources[]` | 实际命中的数据通道（win32_diskdrive / wmi_ata_smart / msft_reliability / smartctl） |
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
- 部分 NVMe 盘经 MSFT 计数器通道时不追踪 `power_on_hours` / 读写量（字段为 null）：
  不能据此判断「新盘」；需真实通电时间 / 读写量时走
  smartctl（`-d nvme`）通道
- `health_status = Good` 仅表示三通道合并判级正常，仍应结合属性表观察趋势
  （如重分配扇区、磨损百分比）

## 常见问题排查

- **插件工具返回「未枚举到任何物理磁盘」**：DSH 宿主会话运行在沙箱下时，WMI（DCOM 依赖命名管道）被拦截。
  注意：此时经宿主 shell 直接执行脚本同样会输出空数组 `[]` 或 CimException「无法从客户端中访问 CIM 资源」，
  不要反复重试；让用户在**不受限的 PowerShell 终端**中执行脚本，或在完整访问模式的会话中运行
- **如何确认是沙箱拦截而非权限/服务问题**：Winmgmt 与 DcomLaunch 服务均在运行，
  但 `Get-CimInstance Win32_ComputerSystem` 报「无法从客户端中访问 CIM 资源」→ 即命名管道被沙箱拦截
- **完整 SMART 需要提权**：请用户在管理员 PowerShell 中运行；或使用
  `Start-Process powershell -Verb RunAs`（弹 UAC，用户点「是」）自动提权重跑
- **`power_on_hours` 为 0 或 null 但盘已使用很久**：部分 NVMe 盘经 MSFT 计数器通道未追踪该字段，
  不代表新盘；安装 smartmontools 走 smartctl（`-d nvme`）通道获取真实通电时间与读写量
- **is_virtual_disk = true**：虚拟盘没有真实 SMART，属预期行为
- **error 提示需要管理员权限**：MSFT 计数器与 root\WMI 原始属性需要提权；请用户在管理员会话中运行或接受基本信息
- **USB 桥接移动硬盘无 SMART**：smartctl 通道会尝试 `-d sat`；安装 smartmontools 可提升成功率
- **data_sources 只有 win32_diskdrive**：三条 SMART 通道全部失败，见 error 字段
- **序列号为空**：部分 USB 桥 / 虚拟盘不上报序列号，属正常

## 安全注意

- 脚本与工具均为**只读**查询：不写入设备、不修改系统状态
- 序列号/型号属于设备标识信息：对外报告（尤其公开场合）前先与用户确认脱敏需求
- smartctl 若只在 PATH 上命中，脚本会以 Verbose 提示搜索顺序劫持风险
