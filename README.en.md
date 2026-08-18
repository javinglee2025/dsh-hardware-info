# dsh-hardware-info

[![简体中文](https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-%E5%88%87%E6%8D%A2-blue)](README.md)
[![English](https://img.shields.io/badge/English-Current-brightgreen)](README.en.md)

Windows physical disk hardware information extraction: **model / serial number /
firmware / interface / capacity / S.M.A.R.T. health data**, provided as a
DeepSeek Harness (DSH) **skill + Cordis plugin** dual package, and usable
standalone as open source.

The extraction logic references the disk information and S.M.A.R.T.
implementation of [FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
(Guangzhou Zhihao Computer Technology Co., Ltd.), re-published under the MIT
license with the copyright holder's authorization; channel design and
evaluation rules are documented in [docs/DESIGN.md](docs/DESIGN.md)
(Chinese).

## Directory Layout

```
dsh-hardware-info/
├── README.md                  # This file (Chinese default)
├── README.en.md               # English README
├── LICENSE                    # MIT
├── SKILL.md                   # DSH skill (instructions teaching the AI assistant how to extract and interpret)
├── scripts/
│   └── Get-DiskHardwareInfo.ps1   # Core extraction script (standalone, PowerShell 5.1+/7+)
├── plugin/
│   ├── host.template.js       # Plugin shell template (tool definitions, hand-edit entry)
│   └── host.js                # Generated artifact (embedded script body, do not edit by hand)
├── tools/
│   └── sync-hostjs.ps1        # Regenerates plugin/host.js from the .ps1
└── docs/
    ├── DESIGN.md              # Channel design, evaluation rules and implementation notes (Chinese)
    └── AUTHORIZATION.md       # Copyright authorization statement (to be signed and sealed before publishing)
```

## Quick Start

### Usage 1: Standalone PowerShell script (no DSH dependency)

```powershell
# All disks: identity info + SMART health data (stdout prints a JSON array)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Get-DiskHardwareInfo.ps1

# Basic info of disk 0 only (fast, no administrator required)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Get-DiskHardwareInfo.ps1 -DriveIndex 0 -Basic
```

| Parameter | Description |
|-----------|-------------|
| `-DriveIndex <n>` | Disk number(s) to query; omit to query all |
| `-Basic` | Identity info only, skip SMART |
| `-NoSmartctl` | Disable the smartctl fallback |
| `-SmartctlPath <path>` | Custom path to smartctl.exe |

Full SMART for NVMe disks (native health-log IOCTL passthrough: real power-on
hours / read-write totals / temperature) requires **no administrator**;
the other full-SMART channels (MSFT reliability counters / raw root\WMI
attributes / smartctl) usually require **administrator privileges**.
Without elevation the script still returns identity information with an
`error` note. To auto-elevate with a UAC prompt instead of right-clicking
"Run as administrator" (click "Yes" when the dialog pops up):

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\dsh-hardware-info\scripts\Get-DiskHardwareInfo.ps1'
```

USB-bridged external drives (enclosures / USB disks) report only the bridge
chip's generic model and serial number by default; in full mode (without
`-Basic`) and with administrator privileges, the script automatically
penetrates the bridge via SCSI SAT passthrough to obtain the real drive's
model / serial number / firmware (on a hit, `data_sources` contains
`scsi_sat_passthrough`).

> **Environment limitation (field-tested)**: DSH plugin tools execute through
> the host `shell` service; if the host session runs inside a file sandbox,
> named pipes (required by DCOM/WMI) are blocked — the plugin tool returns
> "no physical disks enumerated", and running the script through the host
> shell only yields an empty array `[]` or a CimException ("CIM resources
> cannot be accessed from the client"). Do not retry repeatedly in a
> restricted session; use Usage 1 in an **unrestricted PowerShell terminal**
> instead. Quick check: the Winmgmt and DcomLaunch services are both running,
> yet `Get-CimInstance Win32_ComputerSystem` reports "CIM resources cannot be
> accessed from the client" → the sandbox is intercepting named pipes; this is
> unrelated to the script or user privileges.

### Usage 2: DSH skill (SKILL.md) — one-line install

```powershell
# Option A: one-line install from GitHub (no clone needed)
iwr https://raw.githubusercontent.com/javinglee2025/dsh-hardware-info/main/install.ps1 -OutFile $env:TEMP\install-dsh-hardware-info.ps1; & $env:TEMP\install-dsh-hardware-info.ps1

# Option B: clone the repository, then install from inside it
git clone https://github.com/javinglee2025/dsh-hardware-info.git
.\dsh-hardware-info\install.ps1
```

Installer parameters: `-Project` (current project only), `-Dir <directory>`
(custom skill root), `-Uninstall` (uninstall).

> **Upgrading**: after the repository is updated, re-run `install.ps1` to
> refresh the installed copy — the files under `~\.dsh\skills` are a snapshot
> from install time and do not follow the repository; the same applies to the
> dynamic plugin in a DSH session, which must be re-defined from the latest
> `plugin/host.js` as `code.host`.

The default install location is user-level `~\.dsh\skills\dsh-hardware-info\`
(available in all sessions and projects); the DSH skill filesystem provider
discovers and hot-loads the skill automatically, so new sessions can use the
skill `dsh-hardware-info` right away. The skill instructs the agent to prefer
the plugin tools, falling back to running `scripts/Get-DiskHardwareInfo.ps1`
from the skill resource directory when the plugin is absent.

### Usage 3: DSH dynamic Cordis plugin

`plugin/host.js` is a runnable host-side plugin package (pure JavaScript, no
external dependencies). After defining its content as `code.host` and running
it in a DSH session, two model tools are registered:

| Tool | Description |
|------|-------------|
| `list_physical_disks` | Disk identity info (model/serial/firmware/interface/capacity/basic health), fast, no administrator |
| `read_disk_smart` | Full SMART (health/temperature/power-on hours/totals/attribute table), multi-channel fallback |

```text
# Ask the agent to: define plugin/host.js content as code.host via
# cordis_define and run it with cordis_run (DSH dynamic plugin, session-scoped)
```

The plugin embeds the body of `Get-DiskHardwareInfo.ps1` (zero external file
dependencies) and executes PowerShell through the host `shell` service,
parsing the JSON result.

## Output Example

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

(Attribute names such as `温度` are emitted in Chinese by the script.)
Field semantics and health-evaluation rules: see the "输出解读" (Output
Interpretation) section of [SKILL.md](SKILL.md) (Chinese).

> Always redact `serial_number` before publishing output (screenshots /
> articles / reports).

## Data Channels (multi-level fallback)

```
Win32_DiskDrive (WMI identity info, always available)
  ├─ Virtual disk short-circuit (VHD/VMware etc. have no real SMART, friendly early return)
  ├─ NVMe: native health-log IOCTL passthrough (no elevation, real power-on hours / totals)
  │        → MSFT storage reliability counter → smartctl (-d nvme)
  └─ ATA : root\WMI ATA SMART 512-byte raw attributes → MSFT counter → smartctl (-d sat)
```

- `root\WMI MSStorageDriver_ATAPISmartData`: 30 entries × 12-byte attribute
  parsing, thresholds taken from `MSStorageDriver_ATAPISmartThresholds`
- `NVMe native health log` (`IOCTL_STORAGE_QUERY_PROPERTY` passthrough, Log
  Page 02h, referencing the NVMe passthrough implementation of
  FileSystemExplorer): power-on hours / power cycles / temperature /
  read-write totals / available spare / percentage used / critical warning
  flag / media errors — no elevation, no smartctl
- `MSFT_StorageReliabilityCounter`: temperature / power-on hours / wear /
  read-write errors + disk health
- `smartctl -A --json`: full attribute table and NVMe health log (fixed
  install directories first, mitigating PATH hijacking)
- `MSFT_PhysicalDisk` (identity correction channel): serial number resolved
  by priority — `AdapterSerialNumber` (trailing `_NNNN` controller suffix
  stripped) > `FruId` > `SerialNumber` (hex→ASCII decoded when in NGUID
  form) > Win32_DiskDrive fallback. On NVMe disks,
  `Win32_DiskDrive.SerialNumber` is an NGUID-encoded string (e.g.
  `0025_3842_A1B2_C3D4.`), not the real serial number

> **Field note (field-tested)**: NVMe disks preferably hit the native
> health-log passthrough (`data_sources` contains `nvme_ioctl`), which
> directly reports real `power_on_hours` / read-write totals without
> smartmontools; only when that channel fails (e.g. some USB→NVMe bridges)
> does it fall back to the MSFT counter, where `power_on_hours` and totals
> may be null (that channel does not track these fields) — **do not conclude
> "new drive" from null/0 values**.

## Development

```powershell
# After modifying scripts/Get-DiskHardwareInfo.ps1 (extraction logic) or
# plugin/host.template.js (tool shell):
.\tools\sync-hostjs.ps1   # regenerate plugin/host.js
```

Note: `plugin/host.js` is a generated artifact — do not edit it by hand; the
.ps1 files contain Chinese comments and must be saved as UTF-8 with BOM per
Windows PowerShell 5.1 convention.

`sync-hostjs.ps1` automatically **ASCII-fies** the embedded body (Chinese
string literals become `\uXXXX` escapes decoded at runtime; non-ASCII
characters in comments become `?`): when the host shell passes the command
as BOM-less UTF-8 / via a pipe, Windows PowerShell 5.1 on a non-UTF-8 system
locale reads a Chinese body as ANSI and fails to parse; a pure-ASCII body is
immune under any delivery encoding. Source rule: Chinese text must use
single-quoted strings with `-f` formatting; Chinese double-quoted
interpolated strings / here-strings fail the build on purpose.

## License

[MIT](LICENSE). The extraction logic originates from
[FileSystemExplorer](https://github.com/javinglee2025/FileSystemExplorer)
(Guangzhou Zhihao Computer Technology Co., Ltd.), re-published under the MIT
license with the copyright holder's authorization; see
[docs/AUTHORIZATION.md](docs/AUTHORIZATION.md) for the authorization
statement (Chinese).
