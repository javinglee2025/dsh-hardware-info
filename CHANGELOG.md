# 变更日志

本项目采用语义化版本号。每次含逻辑变更的提交应在本文件登记。

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
