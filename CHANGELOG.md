# 变更日志

本项目采用语义化版本号。每次含逻辑变更的提交应在本文件登记。

## [0.1.0] - 2026-08-17

### 新增

- `scripts/Get-DiskHardwareInfo.ps1`：Windows 物理磁盘身份信息与 S.M.A.R.T. 健康数据提取脚本
  （多通道回退：Win32_DiskDrive WMI → root\WMI ATA SMART → MSFT 存储可靠性计数器 → smartctl）
- DSH 技能（`SKILL.md`）：工具调用指引、输出解读与故障排查
- Cordis 插件（`plugin/`）：注册 `list_physical_disks` 与 `read_disk_smart` 两个模型工具，
  内嵌提取脚本，零外部文件依赖
- `tools/sync-hostjs.ps1`：由提取脚本自动重新生成 `plugin/host.js`，避免两份实现漂移
- 文档：README、设计说明（`docs/DESIGN.md`）、版权方授权声明
  （`docs/AUTHORIZATION.md`，含打印签署版 `AUTHORIZATION.html` / `AUTHORIZATION.pdf`）

### 许可

- MIT；提取逻辑源自 FileSystemExplorer（广州智皓计算机技术有限公司），经版权方授权重新发布
