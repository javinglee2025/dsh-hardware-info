# dsh-hardware-info

Windows 物理磁盘硬件信息提取：**型号 / 序列号 / 固件 / 接口 / 容量 / S.M.A.R.T. 健康数据**，
以 DeepSeek Harness（DSH）**技能 + Cordis 插件**双形态提供，可独立开源使用。

提取逻辑参考 [FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
（广州智皓计算机技术有限公司）的磁盘信息与 S.M.A.R.T. 提取实现，
经版权方授权以 MIT 许可重新发布；通道设计与判定规则见 [docs/DESIGN.md](docs/DESIGN.md)。

## 目录结构

```
dsh-hardware-info/
├── README.md                  # 本文件
├── LICENSE                    # MIT
├── SKILL.md                   # DSH 技能（指令包，教 AI 助手如何提取与解读）
├── scripts/
│   └── Get-DiskHardwareInfo.ps1   # 核心提取脚本（独立可运行，PowerShell 5.1+/7+）
├── plugin/
│   ├── host.template.js       # 插件外壳模板（工具定义，手改入口）
│   └── host.js                # 生成产物（内嵌脚本主体，禁止手改）
├── tools/
│   └── sync-hostjs.ps1        # 由 ps1 重新生成 plugin/host.js
└── docs/
    ├── DESIGN.md                # 通道设计、判定规则与实现说明
    └── AUTHORIZATION.md         # 版权方授权声明（发布前需签署并盖章）
```

## 快速开始

### 用法 1：独立 PowerShell 脚本（无 DSH 依赖）

```powershell
# 全部磁盘：身份信息 + SMART 健康数据（stdout 输出 JSON 数组）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Get-DiskHardwareInfo.ps1

# 只看 0 号盘的基本信息（快，无需管理员）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Get-DiskHardwareInfo.ps1 -DriveIndex 0 -Basic
```

| 参数 | 说明 |
|------|------|
| `-DriveIndex <n>` | 指定盘号（可多个）；省略查询全部 |
| `-Basic` | 只取基本信息，跳过 SMART |
| `-NoSmartctl` | 禁用 smartctl 回退 |
| `-SmartctlPath <path>` | 自定义 smartctl.exe 路径 |

完整 SMART 数据（MSFT 计数器 / root\WMI 原始属性 / smartctl）通常需要**管理员权限**；
无权限时仍返回身份信息并附带 `error` 说明。不想手动右键「以管理员身份运行」时，
可一行命令自动弹 UAC 提权重跑（窗口弹出后点「是」）：

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\dsh-hardware-info\scripts\Get-DiskHardwareInfo.ps1'
```

> **环境限制提示（实测）**：DSH 插件的工具经宿主 `shell` 服务执行；宿主会话若运行在
> 文件沙箱下，命名管道（DCOM/WMI 依赖）会被拦截——插件工具返回「未枚举到任何物理磁盘」，
> 经宿主 shell 直接执行脚本也只会输出空数组 `[]` 或 CimException「无法从客户端中访问 CIM 资源」。
> 此时不要在受限会话里反复重试，改用用法 1 在**不受限的 PowerShell 终端**中执行脚本即可。
> 快速判定方法：Winmgmt 与 DcomLaunch 服务均在运行，但
> `Get-CimInstance Win32_ComputerSystem` 报「无法从客户端中访问 CIM 资源」→ 即沙箱拦截命名管道，
> 与脚本实现、用户权限无关。

### 用法 2：DSH 技能（SKILL.md）—— 一键安装

```powershell
# 方式 A：从 GitHub 一键安装（无需克隆仓库）
iwr https://raw.githubusercontent.com/javinglee2025/dsh-hardware-info/main/install.ps1 -OutFile $env:TEMP\install-dsh-hardware-info.ps1; & $env:TEMP\install-dsh-hardware-info.ps1

# 方式 B：克隆仓库后在仓库内安装
git clone https://github.com/javinglee2025/dsh-hardware-info.git
.\dsh-hardware-info\install.ps1
```

安装脚本参数：`-Project`（仅当前项目生效）、`-Dir <目录>`（自定义技能根目录）、
`-Uninstall`（卸载）。

默认安装到用户级 `~\.dsh\skills\dsh-hardware-info\`（所有会话可用）；DSH 的
技能文件系统提供商会自动发现并热加载，安装后新会话即可使用技能
`dsh-hardware-info`。技能会指引 Agent 优先调用插件工具，插件缺失时回退到
直接执行技能资源目录下的 `scripts/Get-DiskHardwareInfo.ps1`。

### 用法 3：DSH 动态 Cordis 插件

`plugin/host.js` 是一个可运行的 Host 端插件包（纯 JavaScript，无外部依赖），
在 DSH 会话中将其内容作为 `code.host` 定义并运行后，注册两个模型工具：

| 工具 | 说明 |
|------|------|
| `list_physical_disks` | 磁盘身份信息（型号/序列号/固件/接口/容量/基础健康），快、无需管理员 |
| `read_disk_smart` | 完整 SMART（健康/温度/上电时间/读写量/属性表），多通道回退 |

```text
# 让 Agent 执行：把 plugin/host.js 的内容作为 code.host 用 cordis_define
# 定义并 cordis_run 运行（DSH 动态插件，会话内临时生效）
```

插件内嵌了 `Get-DiskHardwareInfo.ps1` 的主体（零外部文件依赖），
经宿主 `shell` 服务执行 PowerShell 并解析 JSON。

## 输出示例

```json
[
  {
    "device_id": "\\\\.\\PhysicalDrive0",
    "index": 0,
    "model": "EXAMPLE NVMe SSD 1TB",
    "serial_number": "EXAMPLESERIAL000000",
    "firmware_revision": "EXA0100",
    "interface_type": "SCSI",
    "bus_type": "NVMe",
    "media_type": "SSD",
    "capacity_bytes": 1000204886016,
    "health_status": "Good",
    "temperature_celsius": 42,
    "power_on_hours": 10000,
    "total_bytes_written": 61572651155456,
    "total_bytes_read": 246290604621824,
    "attributes": [
      { "id": 194, "name": "温度", "raw_value": 42, "current": 100,
        "worst": 100, "threshold": 0, "is_critical": false, "status": "Good" }
    ],
    "failure_predicted": false,
    "is_virtual_disk": false,
    "data_sources": ["win32_diskdrive", "msft_reliability"],
    "error": null
  }
]
```

字段与健康判定语义详见 [SKILL.md](SKILL.md) 的「输出解读」章节。

> 公开发布输出（截图 / 文章 / 报告）前，请务必对 `serial_number` 脱敏。

## 数据通道（多级回退）

```
Win32_DiskDrive（WMI 基本信息，恒可用）
  ├─ 虚拟盘短路（VHD/VMware 等无真实 SMART，提前返回友好提示）
  ├─ NVMe：MSFT 存储可靠性计数器 → smartctl（-d nvme）
  └─ ATA ：root\WMI ATA SMART 512 字节原始属性 → MSFT 计数器 → smartctl（-d sat）
```

- `root\WMI MSStorageDriver_ATAPISmartData`：30 条 × 12 字节属性解析，
  阈值取自 `MSStorageDriver_ATAPISmartThresholds`
- `MSFT_StorageReliabilityCounter`：温度 / 上电时间 / 磨损 / 读写错误 + 磁盘健康
- `smartctl -A --json`：完整属性表与 NVMe 健康日志（固定安装目录优先，防 PATH 劫持）
- `MSFT_PhysicalDisk`（身份信息修正通道）：序列号按优先级解析——
  `AdapterSerialNumber`（剥离尾部 `_NNNN` 控制器号）> `FruId` > `SerialNumber`
  （NGUID 编码形态时 hex→ASCII 解码）> Win32_DiskDrive 兜底。NVMe 盘的
  `Win32_DiskDrive.SerialNumber` 是 NGUID 编码串（如 `0025_3842_A1B2_C3D4.`），
  不是真实序列号

> **实测注意**：部分 NVMe 盘经 MSFT 计数器通道时 `power_on_hours` 恒为 0、
> `total_bytes_written/read` 为 null（该通道未追踪这些字段），**不能据此判断是「新盘」**；
> 需要真实通电时间 / 读写量时，安装 smartmontools 走 smartctl（`-d nvme`）通道。

## 开发

```powershell
# 修改 scripts/Get-DiskHardwareInfo.ps1（提取逻辑）或 plugin/host.template.js（工具外壳）后：
.\tools\sync-hostjs.ps1   # 重新生成 plugin/host.js
```

注意：`plugin/host.js` 是生成产物，不要手改；两个 .ps1 文件含中文注释，
按 Windows PowerShell 5.1 惯例保存为 UTF-8 with BOM。

## 许可

[MIT](LICENSE)。提取逻辑源自 [FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
（广州智皓计算机技术有限公司），经版权方授权以 MIT 许可重新发布；
授权声明见 [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md)。
