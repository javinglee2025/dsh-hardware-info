// dsh-hardware-info —— Cordis 插件 Host 端源码模板
// 生成产物 plugin/host.js 请勿手改：
//   - 修改插件外壳（工具定义、错误处理）→ 改本文件
//   - 修改提取逻辑（通道、解析、健康评估）→ 改 scripts/Get-DiskHardwareInfo.ps1
//   - 两者任一修改后运行 tools/sync-hostjs.ps1 重新生成 plugin/host.js
//
// 安装（DSH 动态插件）：将生成的 plugin/host.js 整个内容作为 code.host 传入
// cordis_define 并运行；插件在会话内注册两个工具：
//   - list_physical_disks —— 磁盘身份信息（型号/序列号/固件/接口/容量，快，无需管理员）
//   - read_disk_smart      —— S.M.A.R.T. 健康数据（多通道回退，完整数据需管理员）
// 提取引擎优先级：原生核心 dskinfo.exe（探测顺序 DSKINFO_EXE 环境变量 → PATH，
// 兄弟仓库 dskinfo 的 C#/.NET 10 移植，输出契约 v1 信封）→ 内嵌 PowerShell 脚本
// （scripts/Get-DiskHardwareInfo.ps1）。exe 基础设施级失败自动回退内嵌脚本。
// 详见 README.md「安装」章节与 SKILL.md「原生核心 dskinfo.exe」章节。

// 内嵌的 PowerShell 提取脚本主体（与 scripts/Get-DiskHardwareInfo.ps1 的 param 块之后一致，
// 由 tools/sync-hostjs.ps1 自动内嵌并做 JS 模板字符串转义）
const SCRIPT_BODY = /*__DSH_HWINFO_SCRIPT_BODY__*/

return {
  name: 'dsh-hardware-info',
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    // 盘号列表归一化为 "0,1,2" 形态（无效项剔除；空列表输出空串）
    function joinIndexes(driveIndexes) {
      return (driveIndexes || [])
        .map((n) => String(Number(n)))
        .filter((s) => s !== 'NaN')
        .join(',')
    }

    // ── 原生核心 dskinfo.exe 探测（会话内首次调用探测一次，结果缓存）──
    // 顺序：DSKINFO_EXE 环境变量（推荐：绝对路径，规避 PATH 劫持面）
    //       → PATH 上的 dskinfo.exe；均未命中返回 null，走内嵌 PowerShell 脚本。
    // 探测失败（shell 异常/超时）同样降级 ps1，不阻断工具。
    let dskinfoExePromise = null
    function detectDskinfoExe() {
      if (dskinfoExePromise === null) {
        dskinfoExePromise = shell
          .run(
            shell.resolve({
              command:
                '$p = $env:DSKINFO_EXE; ' +
                'if (-not $p) { $c = Get-Command dskinfo.exe -ErrorAction SilentlyContinue; if ($c) { $p = $c.Source } }; ' +
                'if ($p -and (Test-Path -LiteralPath $p)) { $p }',
              timeoutMs: 15000,
              stdoutMaxBytes: 64 * 1024,
            })
          )
          .then(function (r) {
            const p = String((r.stdout && r.stdout.text) || '').trim()
            return p !== '' ? p : null
          })
          .catch(function () {
            return null
          })
      }
      return dskinfoExePromise
    }

    // dskinfo.exe 命令行（参数与 ps1 一一对应：--drive-index/--basic/--no-smartctl/--smartctl-path）
    function buildExeCommand(exePath, driveIndexes, basic, noSmartctl, smartctlPath) {
      const parts = ["& '" + String(exePath).replace(/'/g, "''") + "'"]
      const idx = joinIndexes(driveIndexes)
      if (idx !== '') parts.push('--drive-index ' + idx)
      if (basic) parts.push('--basic')
      if (noSmartctl) parts.push('--no-smartctl')
      const sp = String(smartctlPath || '').replace(/'/g, "''")
      if (sp !== '') parts.push("--smartctl-path '" + sp + "'")
      return parts.join(' ')
    }

    // 组装一次完整提取命令：参数变量赋值 + 脚本主体
    function buildCommand(driveIndexes, basic, noSmartctl, smartctlPath) {
      const safe = String(smartctlPath || '').replace(/'/g, "''")
      return [
        '$DriveIndex = @(' + joinIndexes(driveIndexes) + ')',
        '$Basic = $' + (basic ? 'true' : 'false'),
        '$NoSmartctl = $' + (noSmartctl ? 'true' : 'false'),
        "$SmartctlPath = '" + safe + "'",
        SCRIPT_BODY,
      ].join('\n')
    }

    // 执行命令文本并解析 JSON。
    // 兼容两种输出形态：dskinfo.exe 的契约 v1 信封 {schema_version, generated_at, disks}
    // 与 ps1 的裸数组；stage 标记失败环节（run 执行 / empty 空盘 / parse 解析），
    // 供编排层决定是否回退。
    async function runExtract(command, timeoutMs, source) {
      const spec = shell.resolve({
        command: command,
        timeoutMs: timeoutMs,
        stdoutMaxBytes: 8 * 1024 * 1024,
      })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) {
        const stderr = String((result.stderr && result.stderr.text) || '').trim()
        return {
          ok: false,
          stage: 'run',
          source: source,
          exitCode: result.exitCode,
          error: '提取命令执行失败' + (stderr ? ': ' + stderr.slice(0, 2000) : ''),
        }
      }
      const text = String((result.stdout && result.stdout.text) || '').trim()
      if (!text) {
        return {
          ok: false,
          stage: 'run',
          source: source,
          exitCode: 0,
          error: '提取命令无输出（可能不在 Windows 环境或 WMI 不可用）',
        }
      }
      try {
        const parsed = JSON.parse(text)
        const arr = Array.isArray(parsed)
          ? parsed
          : parsed && Array.isArray(parsed.disks)
            ? parsed.disks
            : [parsed]
        if (arr.length === 0) {
          return {
            ok: false,
            stage: 'empty',
            source: source,
            exitCode: 0,
            error: '未枚举到任何物理磁盘：WMI 查询可能被当前运行环境阻止（DSH 沙箱限制命名管道/WMI 访问，或缺少权限）。建议改用 SKILL 回退路径，在不受限的 PowerShell 中直接执行 scripts/Get-DiskHardwareInfo.ps1 或 dskinfo.exe。',
          }
        }
        return { ok: true, source: source, disks: arr }
      } catch (e) {
        return {
          ok: false,
          stage: 'parse',
          source: source,
          exitCode: 0,
          error: 'JSON 解析失败: ' + String(e && e.message ? e.message : e),
          rawTail: text.slice(-2000),
        }
      }
    }

    // 提取编排：探测到 dskinfo.exe 则优先走原生核心；其基础设施级失败
    // （stage = run/parse：非零退出、无输出、解析失败）时回退内嵌 ps1 重试一次。
    // 空盘列表（stage = empty）属运行环境问题，ps1 同样无解，不回退。
    async function extract(driveIndexes, basic, noSmartctl, smartctlPath, timeoutMs) {
      let exe = null
      try {
        exe = await detectDskinfoExe()
      } catch (e) {
        exe = null
      }
      if (exe) {
        const viaExe = await runExtract(
          buildExeCommand(exe, driveIndexes, basic, noSmartctl, smartctlPath),
          timeoutMs,
          'dskinfo.exe'
        )
        if (viaExe.ok || viaExe.stage === 'empty') return viaExe
        const viaPs1 = await runExtract(
          buildCommand(driveIndexes, basic, noSmartctl, smartctlPath),
          timeoutMs,
          'powershell'
        )
        if (viaPs1.ok) {
          viaPs1.note = 'dskinfo.exe 通道失败（' + viaExe.error + '），已回退内嵌 PowerShell 脚本'
        } else {
          viaPs1.note = 'dskinfo.exe 通道失败（' + viaExe.error + '）；PowerShell 回退亦失败'
        }
        return viaPs1
      }
      return runExtract(
        buildCommand(driveIndexes, basic, noSmartctl, smartctlPath),
        timeoutMs,
        'powershell'
      )
    }

    // ── 工具 1：枚举物理磁盘身份信息（快，无需管理员）──
    const listTool = harness.defineTool({
      name: 'list_physical_disks',
      description: '枚举本机物理磁盘的硬件身份信息：设备号、型号、序列号、固件版本、接口与总线类型、介质类型、容量和基础健康状态。仅 Windows；只读查询，不修改任何数据。省略参数查询全部磁盘。',
      parameters: {
        driveIndex: {
          type: 'integer',
          description: '可选：只查询指定 PhysicalDrive 编号（0、1、…）；省略查询全部。',
        },
      },
      output: {
        schema: { type: 'json' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      timeoutMs: 60000,
      async execute(args) {
        const idx = args.driveIndex === undefined || args.driveIndex === null ? [] : [args.driveIndex]
        return extract(idx, true, false, '', 60000)
      },
    })
    harness.registerTool(ctx, listTool)

    // ── 工具 2：读取磁盘 S.M.A.R.T. 健康数据 ──
    const smartTool = harness.defineTool({
      name: 'read_disk_smart',
      description: '读取物理磁盘的 S.M.A.R.T. 健康数据：整体健康状态、温度、上电时间、总读写量、磨损与属性表（多通道回退：root\\WMI ATA SMART 原始属性 → MSFT 存储可靠性计数器 → smartctl）。完整数据通常需要管理员权限；无权限时仍返回身份信息并注明错误。仅 Windows；只读查询，不修改任何数据。',
      parameters: {
        driveIndex: {
          type: 'integer',
          description: '可选：只查询指定 PhysicalDrive 编号（0、1、…）；省略查询全部。',
        },
        useSmartctl: {
          type: 'boolean',
          description: '是否允许 smartctl.exe 回退通道（默认 true；离线取证环境可设 false 禁用第三方工具）。',
        },
        smartctlPath: {
          type: 'string',
          description: '可选：自定义 smartctl.exe 绝对路径，优先于内置查找顺序（固定安装目录 → PATH）。',
        },
      },
      output: {
        schema: { type: 'json' },
        render(args, value) {
          return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
        },
      },
      timeoutMs: 180000,
      async execute(args) {
        const idx = args.driveIndex === undefined || args.driveIndex === null ? [] : [args.driveIndex]
        const noSmartctl = args.useSmartctl === false
        return extract(idx, false, noSmartctl, args.smartctlPath || '', 180000)
      },
    })
    harness.registerTool(ctx, smartTool)
  },
}
