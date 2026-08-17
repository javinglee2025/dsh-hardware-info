# 设计说明

本仓库的提取逻辑参考业界通用的 Windows 存储栈与 smartmontools 机制实现。
本文记录数据通道设计、健康判定规则与实现注意事项。

参考实现：[FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
（广州智皓计算机技术有限公司），经版权方授权以 MIT 许可重新发布。

## 数据通道（多级回退）

```
Win32_DiskDrive（WMI 基本信息，恒可用）
  ├─ 虚拟盘短路（VHD/VMware 等无真实 SMART，提前返回友好提示）
  ├─ NVMe：MSFT 存储可靠性计数器 → smartctl（-d nvme）
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
  仅一条时直接采用）；类不可用时阈值按 0 处理
- 实例匹配：序列号出现在 InstanceName 中则优先；否则取第一个有效实例
  （InstanceName 格式随存储驱动变化，不可靠）

### MSFT 存储可靠性计数器

`Get-StorageReliabilityCounter` 提供：温度（0=未知）、上电时间、磨损百分比、
读写错误总数；`MSFT_PhysicalDisk.HealthStatus` 映射：0=Healthy→Good、
1=Warning→Warning、2=Unhealthy→Bad。cmdlet 在部分环境返回字符串枚举值，
实现同时兼容数字与字符串两种形态。

### smartctl JSON

- ATA 属性表：`ata_smart_attributes.table[]`（id/name/value/worst/thresh/raw，
  raw 支持数值与十六进制字符串两种形态）
- NVMe 健康日志：`nvme_smart_health_information_log`（temperature、percentage_used、
  available_spare、data_units_read/written、media_errors、power_on_hours、
  power_cycles、critical_warning 映射为属性条目）
- 定位顺序：固定安装目录优先（防 PATH 搜索顺序劫持）→ PATH 回退；
  查询顺序：直接 → `-d sat` → `-d nvme`

## 与原生直通机制的差异

纯 PowerShell 无法直接构造内核级命令缓冲区，因此：

- ATA/NVMe 直通类查询由 Windows 存储栈的 MSFT 计数器通道覆盖
- 需要完整属性表 / NVMe 健康日志时由 smartctl 通道提供
  （smartctl 底层使用同一类直通机制，含 USB 桥 SAT 支持）
- 温度 / 上电时间等关键指标在三个通道间保持同一判定语义

## 实现注意事项

- `Get-PhysicalDisk.DeviceNumber` 在部分环境为空：按盘号 → 序列号 → 型号
  三级回退匹配，避免按盘号错配
- 序列号含尾部点号（Win32 与 Storage 模块格式差异），匹配前统一 TrimEnd('.')
- 全部 PowerShell 原生通道对受限语言模式（ConstrainedLanguage）兼容：
  不依赖 Add-Type、反射或非核心 .NET 静态调用
- stdout 只输出 UTF-8 JSON 数组，诊断信息走 Verbose 流
