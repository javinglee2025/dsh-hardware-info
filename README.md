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
无权限时仍返回身份信息并附带 `error` 说明。

> **环境限制提示**：DSH 插件的工具经宿主 `shell` 服务执行，宿主沙箱若限制
> 命名管道（DCOM/WMI 依赖），工具会返回「未枚举到任何物理磁盘」的提示；
> 此时改用用法 1 在不受限的 PowerShell 中执行脚本即可获得完整数据。

### 用法 2：DSH 技能（SKILL.md）

把本目录加入 DSH 的技能目录（或经 `skills` 注册），会话内可用技能
`dsh-hardware-info` 指导 Agent：优先调用插件工具，插件缺失时回退到
直接执行 `scripts/Get-DiskHardwareInfo.ps1`。

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
