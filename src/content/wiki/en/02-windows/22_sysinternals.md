---
title: "Windows - Sysinternals Suite"
date: "2026-05-15"
---

Sysinternals Suite is a collection of utilities for diagnosing, monitoring, and administering Windows. Created by Mark Russinovich and Bryce Cogswell, owned by Microsoft since 2006. The de facto standard toolkit for system administrators, forensic analysts, and security professionals. Many tools have no equivalent in the standard Windows toolset.

Download: https://learn.microsoft.com/en-us/sysinternals/downloads/sysinternals-suite
Live (no install): https://live.sysinternals.com/

---

## Process Monitor (Procmon)

Process Monitor provides real-time monitoring of filesystem operations, registry access, process/thread activity, network connections, and thread profiling. Indispensable for diagnosing "why doesn't this application work" and for forensic investigation.

### Interface and Filters

```
Procmon captures events via ETW (Event Tracing for Windows) and a
minifilter driver for filesystem and registry operations.

Five event categories (toolbar buttons):
  Registry  - read/write/create/delete registry keys
  File      - file operations (Create, Read, Write, SetInfo, QueryInfo...)
  Network   - network connections (TCP Connect, UDP Send/Receive)
  Process   - process create/exit, DLL load/unload
  Profiling - CPU samples per thread (for performance profiling)

Each event includes:
  Time        - timestamp with microsecond precision
  Process     - name and PID
  Operation   - operation type
  Path        - path (file, registry key, address)
  Result      - SUCCESS, NAME NOT FOUND, ACCESS DENIED, etc.
  Detail      - additional parameters (what was read, what was written)
```

### Filters - the Most Important Skill

```
Without filters Procmon generates thousands of events per second - unusable.
Filtering well is the key skill.

Open: Filter → Filter... (Ctrl+L)

Filter structure: [Column] [Condition] [Value] → [Include/Exclude]

Useful filter examples:

  Process Name  is        notepad.exe          Include
  → only Notepad events

  Path          contains  HKCU\Software\Bad    Include
  → only accesses to this registry key

  Result        is        ACCESS DENIED        Include
  → only access failures (permissions troubleshooting)

  Operation     is        RegSetValue          Include
  → only registry writes

  Path          contains  C:\Temp              Include
  → only operations in C:\Temp

  Process Name  is        System               Exclude
  → remove kernel noise

  Process Name  is        svchost.exe          Exclude
  → remove background service noise

Save filters: Filter → Save Filter → *.pmc file
Quick filter: right-click an event → Include [value] / Exclude [value]
```

### Process Tree

```
Tools → Process Tree (Ctrl+T)

Shows the process hierarchy with creation and termination times.
Blue = live process, grey = terminated.
Double-click a process → see only its events.

Useful for:
  - Understanding parent-child launch relationships
  - Seeing short-lived processes that already exited
  - Detecting injection (process spawned by unexpected parent)
```

### Practical Procmon Scenarios

```
Scenario 1: Application fails to start - "missing file or DLL"
  Filter: Process Name = myapp.exe, Result = NAME NOT FOUND
  Look for: which files or DLLs are not found

Scenario 2: Where does an application store its settings?
  Filter: Process Name = myapp.exe, Operation = RegSetValue
  Look for: which registry keys it writes on save

Scenario 3: COM Hijacking candidates
  Filter: Operation = RegOpenKey,
          Path contains HKCU\Software\Classes\CLSID,
          Result = NAME NOT FOUND
  → CLSIDs looked up in HKCU but not found = hijacking candidates

Scenario 4: What does a suspicious process do?
  Filter: Process Name = suspicious.exe, Include
  Watch all: files created, registry keys written, network connections

Scenario 5: Boot-time capture
  Options → Enable Boot Logging → captures from the moment of boot
  Analyze slow operations: View → Highlight operations > 100ms

Scenario 6: Who is accessing a specific file?
  Filter: Path = C:\sensitive\file.txt, Include
  See all processes that touched the file
```

### Saving and Exporting

```
File → Save → Native Format (.pml)  - save for later re-analysis
File → Save → CSV / XML             - export for Excel or scripting

Capture options:
  File → Capture Events (F5)          - start/stop capture
  File → Drop Filtered Events         - discard filtered events (saves RAM)
  Options → Enable Boot Logging       - capture from system start

Open a .pml file on another machine:
  Procmon is portable - run without installation and open any .pml.
  Convenient for lab analysis of captured data.
```

---

## Autoruns

Autoruns is a complete catalog of every autostart location in Windows. It shows absolutely everything that launches at system boot or user logon. The standard tool for finding malware persistence.

### Tabs

```
Each tab = a category of autostart locations:

Everything     - all entries combined
Logon          - HKCU/HKLM Run, RunOnce, Startup folders, Winlogon
Explorer       - Shell extensions, BHOs, toolbars
Internet Explorer - BHO, toolbar, IE extensions
Scheduled Tasks - Task Scheduler tasks
Services       - Windows services
Drivers        - kernel drivers
Codecs         - audio/video codecs
Boot Execute   - programs that run before Windows loads (rare)
Image Hijacks  - IFEO (Image File Execution Options) - debuggers and replacements
AppInit DLLs   - DLLs loaded into every user32.dll process (dangerous!)
KnownDLLs      - system DLL overrides
Winlogon       - notification providers, GINA
Winsock        - Layered Service Providers (LSP)
Print Monitors - DLLs inside spoolsv.exe
LSA Providers  - security providers
Network Providers - network providers
```

### Color Coding

```
Row color = signature verification status:

White / No color   - signed by Microsoft, looks normal
Yellow             - file not found (registry entry exists, file is gone!)
                   → deleted malware left its registry trace
Red                - unsigned OR signature not verified
                   → requires investigation, especially in system folders
Pink               - file not found or no publisher info

Important: red ≠ malware. Plenty of legitimate software is unsigned.
Red = "needs manual review." Check the path and hash.
```

### Key Settings

```
Options → Scan Options:
  Check VirusTotal.com             - check all hashes on VT (needs internet)
  Submit Unknown Images            - upload unknown files to VT
  Hide Signed Microsoft Entries    - hide Microsoft-signed entries (reduce noise)
  Hide Microsoft and Windows Entries - hide all Microsoft entries

Options → Check VirusTotal.com is the most useful toggle.
After enabling: the VirusTotal column shows detection scores.
Red score like 3/72 = serious reason to investigate.
```

### Autoruns from the Command Line

```
autorunsc.exe - the console version of Autoruns.

# All autostart entries
autorunsc.exe -a * -c -h -s > autoruns_output.csv
# -a * = all categories
# -c   = CSV format
# -h   = SHA256 hashes
# -s   = verify signatures

# Only unsigned/unverified entries
autorunsc.exe -a * -c -h -s -u > autoruns_unsigned.csv

# With VirusTotal lookup
autorunsc.exe -a * -c -h -s -vt > autoruns_vt.csv

# Analyze a remote machine
autorunsc.exe -a * -c \\REMOTE_PC\C$ -u

# Baseline comparison: export before/after → diff in Excel
```

### What to Look for in Autoruns

```
1. Yellow entries (file not found)
   Malware was removed but the registry entry survived. You found a trail.

2. Non-standard paths for "system" filenames
   C:\Windows\System32\svchost.exe  - normal
   C:\Users\user\AppData\svchost.exe - NOT normal
   C:\Temp\winlogon.exe             - almost certainly malware

3. AppInit DLLs tab has entries
   Loaded into EVERY process that uses user32.dll.
   Any entry here is highly suspicious.

4. Image File Execution Options (Image Hijacks tab)
   HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\
   Used for legitimate debuggers, but also to replace system executables.
   sethc.exe (Sticky Keys) → cmd.exe = classic backdoor technique.

5. Scheduled Tasks from non-standard paths
   Tasks pointing to C:\Users\, C:\Temp\ → suspicious.

6. Services with no description and random names
   Names like "xkbqpx" = malware service.

7. LSA Providers and Winlogon Notification Packages
   DLLs loaded into lsass.exe or winlogon.exe.
   Used by legitimate products and by credential theft tools.
```

---

## Process Explorer (ProcExp)

Process Explorer is an advanced Task Manager replacement. It shows the process hierarchy, open handles, loaded DLLs, per-process CPU and memory, signature verification, and VirusTotal lookup.

### Overview

```
Process color coding:
  Blue        - processes running as the current user
  Pink        - services (running as SYSTEM or NetworkService)
  Dark grey   - terminated processes (still visible in the tree)
  Purple      - .NET processes
  Green       - new process (flashes briefly)
  Red         - process that is terminating

Useful columns (View → Select Columns):
  CPU History  - mini CPU graph over the last few seconds
  Private Bytes - memory allocated exclusively to this process
  Working Set  - physical memory in use
  Handles      - open handle count
  Company Name - from PE resources
  Command Line - the full launch command line
  Integrity    - Integrity Level (Low/Medium/High/System)
  Verified Signer - digital signature status
  VirusTotal   - detection score (if VT lookup is enabled)
```

### Double-Click a Process - Details

```
Image tab:
  Full path, command line, parent process, autostart location, version, signature.

Threads tab:
  All threads with CPU usage and call stack.
  Right-click → Stack → see what the thread is doing right now.
  Useful for: understanding what a process is doing at this moment.

TCP/IP tab:
  Network connections for this process (like netstat -b but live).

Security tab:
  SID, group memberships, privileges, Integrity Level.

Strings tab:
  Strings from the file on disk AND from the in-memory image.
  Compare Disk vs Memory: differences indicate process hollowing or injection.

.NET Assemblies tab:
  Loaded .NET assemblies (for managed processes).
```

### Handles and DLLs

```
View → Lower Pane View → DLLs (Ctrl+D)
  All loaded DLLs with paths, versions, and hashes.
  DLLs from non-standard paths = suspicious.
  Right-click → Check VirusTotal.

View → Lower Pane View → Handles (Ctrl+H)
  All open handles: files, registry keys, mutexes, events, threads.
  Useful: find who is holding a file open.

Find a handle:
  Find → Find Handle or DLL (Ctrl+F)
  Enter a filename or path fragment → see all processes with that handle.
  Classic use: "file is in use by another process" → find which one.
```

### VirusTotal Integration

```
Options → VirusTotal.com → Check VirusTotal.com (enable)

After enabling:
  VirusTotal column appears in the process tree.
  Green 0/70 = clean.
  Red X/70 = detections → investigate.
  Grey (not checked) = hash not in VT yet (new or not previously submitted).

Note: VT checks the on-disk hash, not the in-memory image.
A packed or injected payload may have a "clean" on-disk hash.
```

---

## TCPView

TCPView shows network connections in real time with process names. A visual replacement for `netstat -b` with color animation.

```
Color coding:
  Green  = new connection
  Red    = connection closed
  Yellow = state changed

Columns: Process, PID, Protocol, Local Address, Remote Address, State

Common TCP states:
  ESTABLISHED - active connection
  LISTENING   - waiting for inbound connections
  TIME_WAIT   - closing (normal)
  SYN_SENT    - connection attempt in progress

Right-click a connection:
  → Close Connection       - terminate the connection
  → Process Properties     - open in ProcExp
  → Whois                  - whois lookup for the remote IP

What to look for:
  Processes with unexpected outbound connections
  ESTABLISHED connections to unknown IPs
  Services listening on 0.0.0.0 instead of localhost
  notepad.exe, calc.exe → unexpected ports

Command line: tcpvcon.exe -a -c > connections.csv
```

---

## Handle

Handle shows all open handles per process. Command-line utility.

```
# All handles open by a specific process
handle.exe -p lsass.exe /accepteula

# Find which process has a file open
handle.exe "C:\file.txt" /accepteula

# All pipe handles
handle.exe -a pipe /accepteula

# Filter by handle type
handle.exe -t Key /accepteula    # registry keys only
handle.exe -t File /accepteula   # files only

# Close a specific handle (use with caution)
handle.exe -c <hex_handle> -p <PID> -y /accepteula

Handle types: File, Key, Process, Thread, Event, Semaphore, Mutant,
              Section, Directory, Token, Desktop, WindowStation, Port, Timer

Classic use case: "file is in use by another process" on delete/move
  handle.exe filename.ext /accepteula
  # Shows PID and process name
```

---

## Accesschk

Accesschk checks access rights on Windows objects: files, registry, services, processes, kernel objects, Named Pipes.

```
# File/folder permissions
accesschk.exe -l C:\Windows\Temp /accepteula
accesschk.exe -uwdq "Users" C:\              # folders writable by Users
accesschk.exe -uwdqs "Everyone" C:\          # recursive

# Registry key permissions
accesschk.exe -kquw "Users" HKLM\SYSTEM\CurrentControlSet\Services\

# Service permissions
accesschk.exe -uwcqv "Users" *               # services modifiable by Users
accesschk.exe -ucqv wuauserv                 # permissions on one service

# Named Pipe permissions
accesschk.exe -l \pipe\lsass /accepteula

# Kernel object permissions
accesschk.exe -o \BaseNamedObjects\*

Flags:
  -u = only objects accessible to the specified user
  -w = only writable objects
  -d = directories only
  -f = files only
  -s = recursive
  -q = quiet (no banner)
  -l = show full ACL
  -c = services
  -k = registry keys
  -o = kernel objects

Security audit use:
  # Services with weak ACLs (LPE vector)
  accesschk.exe -uwcqv "Authenticated Users" * /accepteula
  accesschk.exe -uwcqv "INTERACTIVE" * /accepteula
```

---

## PsTools

A set of command-line utilities for remote administration.

### PsExec

```
PsExec - execute processes on remote machines.

# Shell on a remote machine
psexec.exe \\REMOTE cmd.exe

# Run as a different user
psexec.exe \\REMOTE -u DOMAIN\admin -p password cmd.exe

# SYSTEM shell locally
psexec.exe -s cmd.exe
psexec.exe -s -i powershell.exe    # -i = interactive (for GUI)

# Copy and run a file on a remote machine
psexec.exe \\REMOTE -c C:\tool.exe

# Run on multiple machines
psexec.exe \\M1,\\M2,\\M3 cmd.exe /c ipconfig

# Run on all machines from a list file
psexec.exe @machines.txt cmd.exe /c systeminfo

Key flags:
  -s    = run as SYSTEM
  -i    = interactive session
  -d    = don't wait for completion
  -c    = copy file before running
  -h    = run with elevated token (Vista+)
  -u/-p = credentials
  -e    = don't load user profile
```

### PsList, PsKill, PsInfo

```
PsList - list processes locally or remotely:
  pslist.exe                          # local
  pslist.exe \\REMOTE                 # remote
  pslist.exe -t                       # process tree
  pslist.exe -x                       # extended (memory, threads)
  pslist.exe -s 5 -r 3 notepad        # monitor notepad every 3s, 5 times

PsKill - kill a process by name or PID:
  pskill.exe notepad                  # by name
  pskill.exe 1234                     # by PID
  pskill.exe \\REMOTE explorer        # on a remote machine

PsInfo - system information:
  psinfo.exe                          # local
  psinfo.exe \\REMOTE                 # remote
  psinfo.exe -h                       # include hotfixes
  psinfo.exe -s                       # include installed software
  # Outputs: computer name, OS, SP, uptime, CPU, RAM, disks
```

### PsLogon, PsLogList, PsService

```
PsLogon - currently logged-on users:
  pslogon.exe
  pslogon.exe \\REMOTE

PsLogList - read Event Logs:
  psloglist.exe Security              # Security log
  psloglist.exe -n 50 Application     # last 50 entries
  psloglist.exe -s \\REMOTE System    # remote System log

PsService - manage services:
  psservice.exe query wuauserv
  psservice.exe start wuauserv
  psservice.exe stop wuauserv
  psservice.exe \\REMOTE query
```

---

## Strings

Strings extracts printable strings from binary files. Windows equivalent of Unix `strings`.

```
# Strings from a file (default: minimum 3 chars)
strings.exe C:\suspicious.exe

# Set minimum length
strings.exe -n 8 C:\suspicious.exe

# Unicode (wide char) strings
strings.exe -u C:\suspicious.exe

# Both ASCII and Unicode
strings.exe -a C:\suspicious.exe

# From a process's memory (by PID)
strings.exe -pid 1234

# Recursively from a folder
strings.exe -s C:\Malware\

# Find URLs
strings.exe C:\suspicious.exe | findstr /i "http ftp smtp"

# Find IP addresses
strings.exe C:\suspicious.exe | Select-String "\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"

What to look for:
  URLs (http://, https://)     → C2 addresses
  IP addresses                 → hardcoded servers
  File paths                   → what it reads/writes
  API function names           → which Windows APIs it calls
  Mutex names                  → malware instance marker
  Registry key names           → persistence mechanism
  Service names                → persistence via service
  Base64 strings               → encoded payload
  Keywords: "password", "crypt", "inject", "shellcode"
```

---

## WinObj

WinObj is a browser for the Windows kernel Object Manager namespace - the global namespace of kernel objects that is invisible to normal tools.

```
Key namespace paths:
  \Device\          - hardware devices (disks, network interfaces)
  \Driver\          - driver objects
  \BaseNamedObjects\ - named objects (Mutex, Event, Semaphore, Section)
  \Sessions\        - session-scoped objects
  \KnownDlls\       - system DLLs known to the kernel
  \GLOBAL??\        - symbolic links (C:, D:, \\.\COM1, etc.)
  \RPC Control\     - RPC endpoints
  \Security\        - LSA objects

Use cases:
  Find a malware mutex - many malware samples create a named mutex as an
    "already running" flag. Check \BaseNamedObjects\ for unusual names.
  Examine symbolic links in \GLOBAL??\
  Verify KnownDLLs entries for tampering
  Explore device objects visible to the kernel
```

---

## Sigcheck

```
Sigcheck verifies digital signatures on files.

# Check a single file
sigcheck.exe C:\Windows\System32\notepad.exe /accepteula

# Check all files in a folder recursively
sigcheck.exe -r C:\Windows\System32\

# Only unsigned files (executables only)
sigcheck.exe -u -e C:\Windows\System32\

# Check against VirusTotal
sigcheck.exe -vt C:\suspicious.exe

# Unsigned + VT combined
sigcheck.exe -u -e -vt C:\Windows\System32\

# Export to CSV
sigcheck.exe -c -u C:\Program Files\ > unsigned.csv

Output includes:
  Verified/Not signed, Publisher, Company, Description,
  Product version, File version, SHA1, SHA256, PE metadata

Use cases:
  Find unsigned DLLs in system folders
  Verify a file hash on VirusTotal
  Detect files with invalid or expired signatures
```

---

## Sysmon (System Monitor)

```
Sysmon is a persistent service and kernel driver for detailed event logging.
Not a diagnostic tool - it runs continuously as a monitoring agent.
Writes to: Microsoft-Windows-Sysmon/Operational

Install / manage:
  sysmon.exe -accepteula -i sysmonconfig.xml
  sysmon.exe -c sysmonconfig.xml    # update config
  sysmon.exe -u                     # uninstall

Key Sysmon Event IDs:
  1   - Process Create (CommandLine, Hashes, PPID, User)
  2   - File creation time changed  ← timestomping detection!
  3   - Network connection (Process, remote IP, Port)
  5   - Process terminated
  6   - Driver loaded
  7   - Image (DLL) loaded
  8   - CreateRemoteThread           ← injection indicator!
  9   - RawAccessRead (direct disk read, bypassing filesystem)
  10  - ProcessAccess                ← LSASS dump attempt!
  11  - FileCreate
  12  - Registry key/value created or deleted
  13  - Registry value set
  15  - FileCreateStreamHash (ADS created)
  17  - Pipe Created
  18  - Pipe Connected
  22  - DNS Query
  23  - FileDelete
  25  - ProcessTampering             ← process hollowing detection!

Ready-made configs:
  SwiftOnSecurity (balanced, low noise):
    https://github.com/SwiftOnSecurity/sysmon-config
  Olaf Hartong sysmon-modular (advanced, modular):
    https://github.com/olafhartong/sysmon-modular
```

---

## VMMap and RAMMap

```
VMMap - Virtual Memory Map. Detailed virtual memory layout of a process.
  Launch: vmmap.exe -p <PID> or pick a process in the GUI.
  Shows: Private, Shareable, Heap, Stack, Image, Mapped File regions.
  Region size is drawn proportionally.
  Forensic use: find large Private Data regions that don't correspond
  to any loaded module → potential shellcode or injected payload.
  RWX (Read+Write+Execute) private region in an "unexpected gap" = shellcode.

RAMMap - Physical memory of the entire system.
  Analyzes RAM usage: Active, Standby, Modified, Free.
  Tabs: Use Counts, Processes, Priority Summary, Physical Pages, File Summary.
  Useful for: understanding why a system is slow after a long uptime
  (Standby list too large, etc.).
```

---

## Quick Reference

```
PICK THE RIGHT TOOL

Task                                       Tool
─────────────────────────────────────────────────────────────────────
What launches at boot/logon?               Autoruns
What is running? Process tree?             Process Explorer
What is this specific process doing?       Process Monitor (filter by name)
Which process has this file open?          Handle.exe or ProcExp Find
Network connections per process?           TCPView
Permissions on a file/registry/service?    Accesschk
Strings from a binary?                     Strings
File signature and VT hash check?          Sigcheck
Execute a command on a remote machine?     PsExec
System info from a remote machine?         PsInfo
Kernel objects (mutex, device)?            WinObj
Continuous monitoring for SIEM?            Sysmon
Virtual memory layout of a process?        VMMap

PROCMON KEY FILTERS
  Result = ACCESS DENIED                   → permissions troubleshooting
  Result = NAME NOT FOUND                  → missing files / DLLs
  Operation = RegSetValue                  → where the app writes to registry
  Path contains HKCU\...\CLSID + NAME NOT FOUND → COM hijacking candidates
  Process Name = <suspicious.exe>          → everything the process does

AUTORUNS WHAT TO LOOK FOR
  Yellow (file not found)                  → deleted malware left a trail
  Non-empty AppInit DLLs                   → DLL loaded into every process
  Suspicious IFEO entries                  → system binary replacement
  Services with random names               → malware persistence
  Run keys pointing to %TEMP%, %APPDATA%   → user-space dropper

PSEXEC QUICK
  psexec.exe -s cmd.exe                    → SYSTEM shell locally
  psexec.exe \\HOST cmd.exe               → shell on remote machine
  psexec.exe \\HOST -u usr -p pwd cmd     → with credentials

ACCESSCHK QUICK
  accesschk.exe -uwdqs "Users" C:\         → folders writable by Users
  accesschk.exe -uwcqv "Users" *           → services modifiable by Users
  accesschk.exe -kquw "Users" HKLM\...\Services\ → writable service registry keys

SYSMON KEY EVENTS
  ID 1  → process created (with command line and hash)
  ID 3  → network connection
  ID 8  → CreateRemoteThread = code injection!
  ID 10 → process access = LSASS dump attempt!
  ID 22 → DNS query (C2 via domain)
  ID 25 → process tampering = hollowing!
```

---

## References

- [Sysinternals Suite Download](https://learn.microsoft.com/en-us/sysinternals/downloads/sysinternals-suite) - official download
- [Sysinternals Live](https://live.sysinternals.com/) - run tools directly from the web
- [Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) - documentation
- [Autoruns](https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns) - documentation
- [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - documentation
- [Sysmon config (SwiftOnSecurity)](https://github.com/SwiftOnSecurity/sysmon-config) - ready-to-use config
- [Sysmon Modular (Olaf Hartong)](https://github.com/olafhartong/sysmon-modular) - advanced modular config
- [Windows Internals (book)](https://learn.microsoft.com/en-us/sysinternals/resources/windows-internals) - by Mark Russinovich et al.
