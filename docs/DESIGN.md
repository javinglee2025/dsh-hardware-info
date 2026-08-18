# 设计说明

本仓库的提取逻辑参考业界通用的 Windows 存储栈与 smartmontools 机制实现。
本文记录数据通道设计、健康判定规则与实现注意事项。

参考实现：[FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
（广州智皓计算机技术有限公司），经版权方授权以 MIT 许可重新发布。

## 数据通道（多级回退）

```
Win32_DiskDrive（WMI 基本信息，恒可用）
  ├─ 虚拟盘短路（VHD/VMware 等无真实 SMART，提前返回友好提示）
  ├─ USB 桥身份识别：SCSI SAT 直通 → 桥后真实盘体型号/序列号/固件（完整模式，需管理员）
  ├─ NVMe：原生健康日志 IOCTL 直通（免提权，含真实通电时间/读写量）
  │        → MSFT 存储可靠性计数器 → smartctl（-d nvme）
  └─ ATA ：root\WMI ATA SMART 512 字节原始属性 → MSFT 计数器 → smartctl（-d sat）
```

全部通道失败时仍返回身份信息（型号/序列号/固件/容量），`error` 字段说明原因。

## 健康判定规则

- **单属性状态**：阈值 > 0 且当前值 ≤ 阈值 → Bad；当前值 ≤ 阈值+10 → Warning；其余 Good
- **关键属性集**：5/187/196/197/198/177/178/179/231/233 判定为 Bad 时直接定级 Bad
- **温度**：属性 194/190（原始值低字节）；阈值缺省 55°C，≥ 阈值 → Warning，≥ 阈值+5 → Bad
- **最终健康** = WMI Status × 属性评估 × MSFT 磁盘健康三者合并（取最差值）
- **虚拟盘短路**：型号含 virtual/虚拟、PNP 含 VIRTUAL、SWD\ 前缀或 BusType 为
  File Backed Virtual 时跳过 SMART 通道，直接返回友好提示

## 解析细节

### ATA SMART 512 字节结构（root\WMI VendorSpecific）

ATA SMART READ DATA 规范布局：属性从偏移 2 开始（前 2 字节为版本号），
共 30 条、每条 12 字节：

```
id(1) | flags(2) | current(1) | worst(1) | raw(6, 小端) | reserved(1)
```

- 属性 ID 为 0 的条目跳过
- 阈值取自 `MSStorageDriver_ATAPISmartThresholds`（按 InstanceName 对齐，
  仅一条时直接采用）；Thresholds 与数据区同为 12 字节/条记录
  （id + threshold + 保留 10 字节，前 2 字节版本号），阈值取记录内偏移 +1；
  类不可用时阈值按 0 处理
- 实例匹配：序列号出现在 InstanceName 中则优先；否则取第一个有效实例
  （InstanceName 格式随存储驱动变化，不可靠）

### MSFT 存储可靠性计数器

`Get-StorageReliabilityCounter` 提供：温度（0=未知）、上电时间、磨损百分比、
读写错误总数；`MSFT_PhysicalDisk.HealthStatus` 映射：0=Healthy→Good、
1=Warning→Warning、2=Unhealthy→Bad。cmdlet 在部分环境返回字符串枚举值，
实现同时兼容数字与字符串两种形态。

注意：该计数器对部分 NVMe 盘**不追踪**上电时间与累计读写量（实测
`power_on_hours` / 读写量为 null），不能据此判断「新盘」；NVMe 盘此类字段
以原生健康日志直通通道为准（见下节），原生直通失败时再以 smartctl
NVMe 健康日志为准。字段为 null 时不生成对应属性条目，
避免 0 值造成「新盘 / 零磨损」误读；温度兼容摄氏与 Kelvin
（250..400 减 273）两种上报形态。

### NVMe 原生健康日志（IOCTL_STORAGE_QUERY_PROPERTY 直通）

实现对齐 FileSystemExplorer 的 NVMe 直通实现（经版权方授权参考）：

- `DeviceIoControl(IOCTL_STORAGE_QUERY_PROPERTY=0x2D1400)`，
  PropertyId=StorageDeviceProtocolSpecificProperty(50)、
  ProtocolType=NVMe(3)、DataType=LogPage(2)、LogId=02h(SMART/Health)，
  协议数据 512 字节
- 缓冲布局（MSDN「Working with NVMe Devices」示例）：
  `STORAGE_PROTOCOL_SPECIFIC_DATA` 从 `STORAGE_PROPERTY_QUERY.AdditionalParameters`
  （偏移 8）起覆盖放置——错放到偏移 9 会导致 stornvme 把 ProtocolType
  读成 0x300 并返回 ERROR_INVALID_PARAMETER
- 返回描述符 `STORAGE_PROTOCOL_DATA_DESCRIPTOR`（Version/Size=48 +
  ProtocolSpecificData 40 字节），日志页位于 ProtocolSpecificData 起始 +
  ProtocolDataOffset（以 ProtocolSpecificData 为基准，不是整个描述符起始）
- 设备以**零访问权限**打开（FILE_SHARE_READ|WRITE）：FILE_ANY_ACCESS 查询类
  IOCTL 不需要 GENERIC_READ/WRITE，未提权环境实测即可成功——NVMe 完整
  SMART（含真实通电时间/读写量）因此**无需管理员**（依赖 Add-Type，
  受限语言模式下自动跳过该通道）
- 日志页 02h 布局：CriticalWarning(0) / 温度 Kelvin(1..2) / 备用空间(3) /
  备用阈值(4) / 寿命百分比(5) / DataUnitsRead(32..47) / DataUnitsWritten(48..63) /
  PowerCycles(112..127) / PowerOnHours(128..143) / MediaErrors(160..175)；
  128-bit 字段取低 64 位（消费级足够）；1 数据单元 = 1000 × 512 字节
- 映射属性：250 严重警告 / 251 备用空间 / 252 寿命百分比 / 194 温度 /
  9 上电累计时间 / 12 电源周期 / 241 LBA 写入 / 242 LBA 读取 / 255 介质错误；
  命中时 `data_sources` 追加 `nvme_ioctl`

### USB 桥 SCSI SAT 直通身份识别

Win32/WMI 对 USB 桥接盘只返回桥芯片信息（型号常为通用名、序列号为桥截断值或
占位符）。完整模式（非 `-Basic`）且盘接口/总线为 USB 时，经
`IOCTL_SCSI_PASS_THROUGH_DIRECT` 发 ATA PASS-THROUGH(16)（CDB `0x85`，PIO
Data-In，DEV=0xA0）内嵌 `IDENTIFY DEVICE`(0xEC)，与 smartmontools `-d sat`
同一机制，免第三方工具。解析：model 字节 54..93（40）、serial 20..39（20）、
fw 46..53（8），ATA 字交换字符串。校验：模型与序列号非空、序列号长度 > 6、
不含 `00000000`、不以 `5C` 开头（过滤桥芯片生成的假序列号）；校验失败或
IOCTL 失败时静默跳过，保留桥上报信息。IOCTL 重试 3 次（间隔 500ms）：
USB 桥直通偶发返回忙/检查条件（HDD 起旋、虚拟机 USB 透传时更常见）；
重试后仍失败（非管理员 / 受限语言模式 / 非 SATA 桥）即放弃该通道。
命中时 `model` / `serial_number` / `firmware_revision` 替换为真实盘体值，
`data_sources` 追加 `scsi_sat_passthrough`。

### smartctl JSON

- ATA 属性表：`ata_smart_attributes.table[]`（id/name/value/worst/thresh/raw，
  raw 支持数值与十六进制字符串两种形态）
- NVMe 健康日志：`nvme_smart_health_information_log`（temperature、percentage_used、
  available_spare、data_units_read/written、media_errors、power_on_hours、
  power_cycles、critical_warning 映射为属性条目）
- 定位顺序：固定安装目录优先（防 PATH 搜索顺序劫持）→ PATH 回退；
  查询顺序：直接 → `-d sat` → `-d nvme`
- 退出码为位掩码：坏盘（bit3 置位）时 `-A --json` 仍输出完整有效数据，
  故按 JSON 是否含属性表判定成败，不依赖退出码
- NVMe `data_units_read/written` 1 单位 = 1000 × 512 字节（规范定义），
  换算 512 字节 LBA 数用 ×1000

## 与原生直通机制的差异

纯 PowerShell 原生 cmdlet 无法构造内核级命令缓冲区，因此：

- SMART 属性类查询由 Windows 存储栈的 MSFT 计数器通道覆盖；
  完整属性表 / NVMe 健康日志由 smartctl 通道提供（smartctl 底层使用同类直通机制）
- 例外：USB 桥身份识别经 Add-Type + DeviceIoControl 直接实现 SCSI SAT 直通
  （仅 IDENTIFY DEVICE 读命令，只读不写；依赖完整语言模式与管理员权限，
  受限语言模式（DSH 沙箱）下自动跳过）
- 温度 / 上电时间等关键指标在各通道间保持同一判定语义

## 实现注意事项

- `Get-PhysicalDisk.DeviceNumber` 在部分环境为空：按盘号 → 序列号 → 型号
  三级回退匹配，避免按盘号错配
- 序列号含尾部点号（Win32 与 Storage 模块格式差异），匹配前统一 TrimEnd('.')
- WMI/MSFT/smartctl 通道对受限语言模式（ConstrainedLanguage）兼容：
  不依赖 Add-Type、反射或非核心 .NET 静态调用；SCSI SAT 直通通道例外——
  依赖 Add-Type 编译与 DeviceIoControl，受限语言模式下自动跳过（不影响其余通道）
- stdout 只输出 UTF-8 JSON 数组，诊断信息走 Verbose 流
- **插件内嵌主体 ASCII 化**：`sync-hostjs.ps1` 生成 `plugin/host.js` 时自动把
  主体中的中文（单引号字符串）转义为 `\uXXXX` 并在主体开头注入运行时解码函数
  `ConvertFrom-UEsc`，注释中的非 ASCII 替换为 `?`，转换后断言纯 ASCII。
  原因：宿主 shell 若以无 BOM UTF-8 临时文件 / 管道传递命令，Windows
  PowerShell 5.1 在非 UTF-8 系统区域下按 ANSI 读取，GBK 双字节会吞掉
  引号/换行导致解析崩溃（`.ps1` 文件本身的 UTF-8 BOM 修复覆盖不到该路径）；
  纯 ASCII 是 UTF-8 与所有 ANSI 代码页的公共子集，任何传递方式下免疫。
  源码规约：中文一律用单引号字符串 + `-f` 格式化，不用含中文的双引号
  插值字符串 / here-string（构建时会直接报错）
- **序列号解析**（对齐 FileSystemExplorer 策略）：NVMe 盘的
  `Win32_DiskDrive.SerialNumber` 为 NGUID 编码形态（十六进制分组，如
  `0025_3842_A1B2_C3D4.`），并非真实序列号。解析优先级：
  `MSFT_PhysicalDisk.AdapterSerialNumber`（剥离尾部「 _NNNN」控制器号）>
  `FruId` > `SerialNumber`（NGUID 形态时按 hex→ASCII 解码，依次尝试直接 /
  反转 / 两两交换三种字节序）> Win32_DiskDrive 兜底
