# 变更日志

本项目采用语义化版本号。每次含逻辑变更的提交应在本文件登记。

## [0.3.0] - 2026-08-18

### 新增

- 插件工具自动优先使用原生核心 `dskinfo.exe`（兄弟仓库 dskinfo：本仓库提取逻辑的
  C#/.NET 10 移植，判定规则与数据通道同源，输出契约 v1）：会话内首次调用探测一次，
  顺序为 `DSKINFO_EXE` 环境变量（推荐绝对路径，规避 PATH 劫持面）→ PATH 上的
  `dskinfo.exe`，均未命中走内嵌 PowerShell 脚本（行为不变）。exe 基础设施级失败
  （非零退出/无输出/JSON 解析失败）自动回退内嵌脚本重试一次并附 `note` 说明；
  空盘列表属环境问题（两引擎同样无解），不回退。工具返回新增 `source` 字段
  （`dskinfo.exe` / `powershell`）标记实际引擎；JSON 解析兼容契约 v1 信封
  （`{"schema_version":1,"disks":[...]}`）与 ps1 裸数组两种形态
- SKILL.md 新增「原生核心 dskinfo.exe」章节：探测顺序与回退规则、直接调用 CLI
  用法（参数与 ps1 一一对应）、信封输出与 ps1 裸数组的解析差异（取 `.disks`）、
  自包含单文件的获取与安装方式；「常见问题排查」「安全注意」补充引擎判别与
  PATH 劫持条目

## [0.2.2] - 2026-08-18

### 新增

- NVMe 原生健康日志通道（免 smartctl、免提权）：经
  `IOCTL_STORAGE_QUERY_PROPERTY`（StorageDeviceProtocolSpecificProperty，
  Log Page 02h）直通读取 NVMe SMART/Health 日志——真实通电时间、电源周期、
  温度、读写量、备用空间、寿命百分比、严重警告标志、介质错误。
  实现对齐 FileSystemExplorer 的 NVMe 直通实现（设备以零访问权限打开，
  FILE_ANY_ACCESS 查询类 IOCTL 未提权即可成功，实测免提权命中）。
  通道顺序：NVMe 盘优先原生直通（`data_sources` 含 `nvme_ioctl`），
  失败回退 MSFT 计数器，再回退 smartctl；ATA/SCSI 链不变

### 修复

- NVMe 盘经 MSFT 计数器通道时 `power_on_hours` / 读写量为 null 的遗留问题
  （MSFT 通道不追踪这些字段）：此前被误判为「新盘」或要求安装 smartmontools，
  现原生直通通道免提权直接给出真实值

### 实测

- 免提权运行：ZHITAI TiPro9000 4TB 通电 6525 小时 / 写入 29.8 TB / 读取 42.1 TB /
  电源周期 458 / 温度 50°C；Samsung 990 PRO 2TB 通电 3012 小时 / 写入 40.6 TB /
  读取 106.9 TB / 电源周期 1165 / 温度 54°C——均命中 `nvme_ioctl` 通道

## [0.2.1] - 2026-08-18

### 修复

- 插件路径在 Windows PowerShell 5.1 下的编码崩溃（彻底修复）：`host.js` 内嵌
  主体含中文，宿主 shell 以无 BOM UTF-8 临时文件 / 管道传递命令时被 5.1 按
  ANSI 读取（非 UTF-8 系统区域），GBK 双字节吞引号/换行导致解析崩溃——
  0.1.3 的 UTF-8 BOM 修复只覆盖 `.ps1` 文件直跑路径，管不到插件传递路径。
  现 `sync-hostjs.ps1` 生成时自动将内嵌主体 ASCII 化：单引号字符串中文转
  `\uXXXX` + 主体开头注入运行时解码函数 `ConvertFrom-UEsc`，注释非 ASCII
  替换为 `?`，转换后断言纯 ASCII；含中文的双引号插值字符串 / here-string
  无法安全转义，构建时直接报错（源码规约：中文一律单引号 + `-f` 格式化）
- `ConvertFrom-AtaString` 过滤条件 `-gt 32` 误杀空格：SAT 直通取得的盘体型号
  内部空格被吞（`WDC WD10SPZX` 显示为 `WDCWD10SPZX`），改为保留 0x20、
  首尾空格仍由 `Trim()` 处理

### 实测

- 无 BOM UTF-8 等价传递路径在 5.1 下解析执行成功，中文属性名 / 错误信息
  运行时解码还原正确
- 提权下 SAT 直通命中桥后真实盘体（WDC WD10SPZX-22Z10T1 / WD-WXS******** /
  04.01A04，`data_sources` 含 `scsi_sat_passthrough`），仓库脚本与 ASCII 化
  路径输出一致；机械盘 SMART 35°C / 774 通电小时

## [0.2.0] - 2026-08-18

### 新增

- USB 桥接盘 SCSI SAT 直通身份识别通道（免 smartmontools）：完整模式且盘接口/总线
  为 USB 时，经 `IOCTL_SCSI_PASS_THROUGH_DIRECT` 发 ATA PASS-THROUGH(16)
  （CDB 0x85）内嵌 `IDENTIFY DEVICE`(0xEC)
  穿透桥接，取桥后真实盘体的型号/序列号/固件（与 smartmontools `-d sat` 同一机制；
  机制设计对齐 FileSystemExplorer）。命中时 `model` / `serial_number` /
  `firmware_revision` 替换为真实盘体值，`data_sources` 追加
  `scsi_sat_passthrough`；校验过滤桥芯片假序列号（含 `00000000`、`5C` 前缀、
  长度 ≤ 6），失败静默回退桥上报信息
- `-Basic` 模式契约不变（无需管理员）：SAT 直通仅在完整模式尝试；非管理员或
  受限语言模式（如 DSH 沙箱）下通道自动跳过

### 文档

- README / SKILL / DESIGN 补充 USB 桥 SAT 直通通道说明、`scsi_sat_passthrough`
  数据源语义与使用前提（管理员权限 + 完整语言模式）

### 其他

- 同步重新生成 `plugin/host.js`

## [0.1.3] - 2026-08-18

### 修复

- Windows PowerShell 5.1 兼容：`Get-DiskHardwareInfo.ps1` 补 UTF-8 BOM——无 BOM 时
  中文注释被按 ANSI 读取导致 5.1 解析崩溃（README 快速开始命令直接失败）；
  `sync-hostjs.ps1` 参数默认值中的 `$PSScriptRoot` 在 5.1 的 `[CmdletBinding()]`
  脚本中为空导致工具崩溃，默认值改在主体内计算
- `install.ps1 -Project` 双重缺陷：① 文档与示例均使用 `-Project` 但参数实际为
  `-Scope Project`，文档写法必然报错，补充 `-Project` 快捷开关；② 项目级目标路径
  缺少技能名子目录，安装/卸载会 `Remove-Item` 整个 `.dsh\skills` 目录
  （连同其他项目技能）且文件散装到 skills 根目录无法被发现，已补 `dsh-hardware-info` 子目录
- 输出排序失效：`Sort-Object index` 对 OrderedDictionary 解析不到属性
  （字典键不是 PS 属性，比较键为空导致实际不排序，两盘时顺序反转），
  改用脚本块 `Sort-Object { $_.index }` 取值
- 单盘机器输出被管道解包成裸 JSON 对象而非数组，违反「stdout 只输出
  JSON 数组」契约，改用 `ConvertTo-Json -InputObject`
- ATA SMART 阈值表解析错位：`MSStorageDriver_ATAPISmartThresholds` 的 Thresholds
  与数据区同为 12 字节/条记录（阈值在记录内偏移 +1），原先按连续字节读取
  导致阈值全错、故障 SATA 盘判级失真
- smartctl 通道以退出码非 0 判失败，但退出码是位掩码（坏盘 bit3 置位时
  `-A --json` 仍输出有效数据），坏盘数据被丢弃；改为按 JSON 是否含属性表判定，
  且无属性表时继续尝试 `-d sat` / `-d nvme` 而非中断
- NVMe 读写量换算：数据单位为 1000 × 512 字节（NVMe 规范），原 ×1024
  导致 `total_bytes_written/read` 虚高 2.4%

### 改进

- MSFT 计数器字段为 null 时不再强转为 0（避免「新盘 / 零磨损」假象），
  实测 NVMe 盘 `power_on_hours` 由误导性的 0 变为如实的 null
- MSFT 计数器温度兼容 Kelvin 上报形态（250..400 减 273）
- NGUID→ASCII 解码增加字符白名单校验（字母数字与少量分隔符），
  降低字节序巧合解出乱码「序列号」的概率

## [0.1.2] - 2026-08-18

### 修复

- 序列号解析错误：NVMe 盘的 `serial_number` 原先取自 Win32_DiskDrive，返回的是
  NGUID 编码形态（如 `0025_3842_A1B2_C3D4.`）而非真实序列号。现按
  FileSystemExplorer 的策略解析：`MSFT_PhysicalDisk.AdapterSerialNumber`
  （剥离尾部 `_NNNN` 控制器号）> `FruId` > `SerialNumber`（NGUID 形态 hex→ASCII
  解码，直接 / 反转 / 两两交换三种字节序）> Win32 兜底
- 同步重新生成 `plugin/host.js`

## [0.1.1] - 2026-08-18

### 文档

- 补充实测避坑说明：宿主沙箱拦截 WMI 命名管道的现象、判定方法与绕行路径
  （README / SKILL，含 CimException「无法从客户端中访问 CIM 资源」特征）
- 补充管理员提权运行方式：管理员 PowerShell，或 `Start-Process powershell -Verb RunAs`
  一行命令自动弹 UAC 重跑
- 补充 NVMe 盘经 MSFT 计数器时 `power_on_hours = 0`、读写量为 null 的数据解读注意
  （不代表新盘，真实值需 smartctl `-d nvme` 通道）
- 补充输出公开发布前对 `serial_number` 脱敏的提示

## [0.1.0] - 2026-08-17

### 新增

- `scripts/Get-DiskHardwareInfo.ps1`：Windows 物理磁盘身份信息与 S.M.A.R.T. 健康数据提取脚本
  （多通道回退：Win32_DiskDrive WMI → root\WMI ATA SMART → MSFT 存储可靠性计数器 → smartctl）
- DSH 技能（`SKILL.md`）：工具调用指引、输出解读与故障排查
- Cordis 插件（`plugin/`）：注册 `list_physical_disks` 与 `read_disk_smart` 两个模型工具，
  内嵌提取脚本，零外部文件依赖
- `tools/sync-hostjs.ps1`：由提取脚本自动重新生成 `plugin/host.js`，避免两份实现漂移
- `install.ps1`：一键安装/卸载脚本（用户级 `~\.dsh\skills` / 项目级 `.dsh\skills` /
  自定义目录；支持从 GitHub 下载或本地仓库两种来源，安装后 DSH 自动热加载技能）
- 文档：README、设计说明（`docs/DESIGN.md`）、版权方授权声明
  （`docs/AUTHORIZATION.md`，含打印签署版 `AUTHORIZATION.html` / `AUTHORIZATION.pdf`）

### 许可

- MIT；提取逻辑源自 FileSystemExplorer（广州智皓计算机技术有限公司），经版权方授权重新发布
