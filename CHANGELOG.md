# 变更日志

本项目采用语义化版本号。每次含逻辑变更的提交应在本文件登记。

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
