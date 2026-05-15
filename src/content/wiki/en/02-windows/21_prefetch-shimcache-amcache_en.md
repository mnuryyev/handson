---
title: "Windows - Prefetch, Shimcache, Amcache (Forensics)"
date: "2026-05-15"
---

When investigating an incident, one of the first questions is: "What was executed on this machine and when?" Prefetch, Shimcache, and Amcache are three Windows artifacts that answer exactly that. Each stores different data and has different characteristics from an investigative standpoint. Used together they fill each other's gaps.

---

## Overview: Three Execution Artifacts

```
Artifact        Location                         What it provides
────────────────────────────────────────────────────────────────────────────
Prefetch        C:\Windows\Prefetch\*.pf         Name, path, last run time(s),
                                                 run count, list of loaded
                                                 files and DLLs

Shimcache       HKLM\SYSTEM\CurrentControlSet\   Path, file last-modified date,
(AppCompatCache) Control\Session Manager\         execution flag (Win XP/7 only).
                AppCompatibility\                Written to registry only on
                AppCompatCache                   shutdown/reboot.

Amcache         C:\Windows\AppCompat\Programs\   SHA1 hash, path, publisher,
                Amcache.hve                      version, compile time,
                                                 first appearance timestamp.

Use all three together - each can fill gaps the others leave.
```

---

## Prefetch

### What Prefetch Is and How It Works

```
Prefetch is a Windows startup optimization feature.
Windows tracks which files a program accesses during launch →
records the list → on next launch pre-loads those files into RAM.

Location:     C:\Windows\Prefetch\
File format:  <PROGRAMNAME>-<8HEX>.pf
Examples:     NOTEPAD.EXE-CF4C5227.pf
              MIMIKATZ.EXE-D6F25AD8.pf

The 8-hex hash: CRC32 of the full path to the executable.
Same exe from different paths → different .pf files!
  CMD.EXE from C:\Windows\System32\ → CMD.EXE-4A81B364.pf
  CMD.EXE from C:\Temp\             → CMD.EXE-87B96812.pf

Enabled by default:
  Workstations: YES
  Servers:      NO (disabled for performance; SSD/server use case)

Check and enable:
  reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters"
  # EnablePrefetcher: 0=Off, 1=App only, 2=Boot only, 3=Both (default on workstations)

  # Enable on a server:
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters" `
      -Name "EnablePrefetcher" -Value 3
```

### What a .pf File Contains

```
Each .pf file contains:

  Executable name     - name of the .exe file
  Path hash           - hash of the execution path (8 hex chars in filename)
  Run count           - number of times executed (up to 8 depending on OS)
  Last run time(s)    - timestamps of the last executions:
                        WinXP/Vista/7: 1 timestamp (most recent run only)
                        Win8+:         up to 8 timestamps (last 8 runs!)
  Volume info         - volume serial number, device path
  File references     - list of all files the program accessed (DLL, configs, etc.)
  Directory strings   - directory paths referenced

Maximum .pf file count:
  Windows XP/7:  128 files
  Windows 8+:    1024 files

When the limit is reached, oldest entries are removed (FIFO).
Absence of a .pf file does NOT mean the program was never run.
```

### Reading Prefetch

```powershell
# List all .pf files sorted by last write time
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Sort-Object LastWriteTime -Descending |
    Select-Object Name, LastWriteTime, Length |
    Format-Table -AutoSize

# LastWriteTime ≈ last execution time of the program
# (quick approximation - parse the file for full accuracy)

# Search for a specific program
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Where-Object { $_.Name -match "MIMIKATZ" -or $_.Name -match "PSEXEC" }

# Programs run within a time window
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Where-Object {
        $_.LastWriteTime -gt "2024-01-15 10:00" -and
        $_.LastWriteTime -lt "2024-01-15 18:00"
    } | Select-Object Name, LastWriteTime | Sort-Object LastWriteTime
```

```
Tools for full .pf parsing (all timestamps + file references):

PECmd (Eric Zimmermann - EZ Tools) - best choice, command line:
  https://github.com/EricZimmermann/PECmd

  PECmd.exe -f "C:\Windows\Prefetch\NOTEPAD.EXE-CF4C5227.pf"
  PECmd.exe -d "C:\Windows\Prefetch" --csv "C:\Output" --csvf prefetch.csv
  PECmd.exe -d "C:\Windows\Prefetch" -q    # quiet, CSV only

  Sample output:
    Source file: NOTEPAD.EXE-CF4C5227.pf
    Executable: NOTEPAD.EXE
    Last run: 2024-01-15 14:32:11
    Other run times:
      2024-01-14 09:15:44
      2024-01-13 16:22:03
    Run count: 7
    Files referenced:
      \DEVICE\HARDDISKVOLUME3\WINDOWS\SYSTEM32\NOTEPAD.EXE
      \DEVICE\HARDDISKVOLUME3\WINDOWS\SYSTEM32\NTDLL.DLL
      ...

WinPrefetchView (NirSoft) - free GUI tool:
  https://www.nirsoft.net/utils/win_prefetch_view.html

Offline analysis (from mounted disk image):
  PECmd.exe -d "E:\Windows\Prefetch" --csv "C:\Output"
```

### Forensic Value of Prefetch

```
What you can establish:

1. Proof of execution
   Even if the program is deleted, its .pf file remains.
   MIMIKATZ.EXE-D6F25AD8.pf → mimikatz definitely ran.

2. When it ran
   Win8+: up to 8 timestamps for the last 8 executions.
   Win7:  only the most recent run time.

3. How many times it ran
   Run count is a valuable indicator.
   Count of 1: possibly a one-time test or attack.
   Count of 47: regular use.

4. Where it was launched from
   The hash encodes the path. Different paths = different .pf files.
   Paths starting with \DEVICE\HARDDISKVOLUME? where ? is a removable drive
   indicate execution from USB.

5. What the program touched
   FileReferences can reveal:
   - Access to specific documents (C2 configs, data files)
   - Non-standard DLL loading (DLL hijacking indicators)
   - Access to network paths (\DEVICE\MUP\...)

6. Lateral movement artifacts
   PSEXESVC.EXE-*.pf on a server → PsExec was used against this machine.
   MSIEXEC.EXE with a non-standard hash → MSI ran from outside System32.

Limitations:
   - Absent on servers by default
   - Can be manually deleted (but deletion itself is suspicious)
   - Capped at 1024 entries; old files may be evicted
   - Timestamps can be tampered with (timestomping)
   - No username - does not tell you who launched it
```

---

## Shimcache (AppCompatCache)

### What Shimcache Is

```
Application Compatibility Cache (Shimcache) - application compatibility cache.
Original purpose: help legacy programs run on newer Windows via "shims."

Side effect: Windows records information about every executable file
that the filesystem interacted with.

Registry location:
  HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatibility\AppCompatCache
  (on some versions: \AppCompatCache\AppCompatCache)

Critical behavior: data is written to the registry ONLY on system
shutdown or reboot. Entries cached in memory are lost on a crash or hard power-off.
→ If the system was not shut down cleanly, the most recent entries may be missing.

Entry count:
  Windows XP:     96 entries
  Windows Vista/7: 1024 entries
  Windows 8+:     no practical limit

Entry order: newest to oldest (index 0 = most recent).
```

### What Shimcache Contains

```
Each entry contains:

  File path      - full path to the executable
  Last modified  - file's last-modification date (from filesystem $MTIME)
  File size      - file size (XP and Vista/7 only)
  Execution flag - whether the file was executed (Windows XP and Vista/7 ONLY!)

Execution flag (InsertFlag):
  Windows XP / Vista / 7: present.
    TRUE  = file was executed
    FALSE = file existed and was indexed, but may not have been run

  Windows 8+: execution flag was REMOVED.
  A Shimcache entry = the file existed and was seen by the OS.
  It does NOT prove the file was executed.

This distinction is critical:
  Win7: entry + InsertFlag=TRUE → high confidence the file ran
  Win8+: entry → only "this file existed at this path"
```

### Reading Shimcache

```
Shimcache is stored as a binary blob in the registry.
Direct PowerShell reading is impractical - use dedicated tools.

AppCompatCacheParser (Eric Zimmermann - EZ Tools) - best choice:
  https://github.com/EricZimmermann/AppCompatCacheParser

  # Live system
  AppCompatCacheParser.exe --csv "C:\Output" --csvf shimcache.csv

  # Offline (extracted hive or mounted image)
  AppCompatCacheParser.exe -f "E:\Windows\System32\config\SYSTEM" `
      --csv "C:\Output" --csvf shimcache.csv

  CSV output includes:
    ControlSet, CacheIndex, Path, LastModified, Executed (Win7 and earlier)

ShimCacheParser.py (Mandiant/FireEye) - Python, good for Linux analysis:
  python ShimCacheParser.py -i SYSTEM --output shimcache.txt

RegRipper plugin appcompatcache:
  rip.pl -r SYSTEM -p appcompatcache > shimcache.txt

Volatility (memory forensics):
  vol.py -f memory.raw --profile=Win7SP1x64 shimcache
```

### Forensic Value of Shimcache

```
What you can establish:

1. A file existed on the system (Win8+)
   Even if the file is deleted, the Shimcache entry remains.
   Path + modification date → correlate with other artifacts.

2. A file was executed (Win XP/7 with InsertFlag=TRUE)
   Stronger statement than "just existed."

3. Temporal anchor via LastModified
   LastModified = file's last-modification date (not execution date!).
   If this aligns with other incident timeline artifacts - valuable indicator.

4. Relative chronology via CacheIndex
   Index 0 = most recent interaction, higher index = older.
   Enables relative ordering even without absolute timestamps.

5. Files from non-standard paths
   C:\Users\Public\svc.exe, C:\Temp\update.exe, %APPDATA%\... → suspicious.

6. Deleted files
   Shimcache retains entries for files that no longer exist.
   Key source for reconstructing what was on the system.

Limitations:
   - Only written at shutdown/reboot → entries can be lost
   - Win8+: no execution guarantee (only file existence)
   - Does not record username
   - Can be manipulated by anyone with SYSTEM privileges
```

---

## Amcache

### What Amcache Is

```
Amcache.hve - a registry hive for tracking installed and executed applications.
Replaced RecentFileCache.bcf (Win7 era).

Location:     C:\Windows\AppCompat\Programs\Amcache.hve
Type:         Registry hive (open with regedit or offline tools)
Access:       Locked by OS while running → need VSS or offline copy

Introduced:   Windows 8 (partial), fully in Windows 8.1 / 10
Restructured: Windows 10 1709+ (new InventoryApplication* key structure)
```

### Amcache Structure

```
Legacy structure (pre Win10 1709):
  Root\File\{VolumeGUID}\{FileID}
    Key values per entry:
      0    - Product Name
      1    - Company Name
      2    - File version
      6    - File size
      f    - Linker version
      11   - File last-modified time
      15   - File creation time
      17   - Amcache entry last-modified time
      100  - Program ID
      101  - SHA1 hash of the file  ← KEY VALUE

New structure (Win10 1709+):
  Root\InventoryApplication\{GUID}
    - Installed applications

  Root\InventoryApplicationFile\{Path|Hash}
    - Executable files
    Key fields:
      Name, FileId (SHA1), LowerCaseLongPath, BinaryType,
      ProductName, Publisher, Version, BinProductVersion,
      LinkDate (compile timestamp!), IsPEFile, Language

  Root\InventoryDriverBinary\
    - Driver binaries

SHA1 hash in Amcache:
  Amcache stores SHA1 of the first 30 MB of the file (or the full file if smaller).
  This allows:
    - Comparison against VirusTotal / NSRL (Known Good file sets)
    - Definitive file identification regardless of filename
    - Detection of renamed malware tools
```

### Reading Amcache

```powershell
# Amcache.hve is locked - cannot read directly from a live system
# Method 1: copy via Volume Shadow Copy

# List available shadows
vssadmin list shadows

# Copy from shadow
$shadow = "\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve" "C:\Temp\Amcache.hve"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG1" "C:\Temp\"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG2" "C:\Temp\"

# Open the copied hive in regedit for manual browsing:
# regedit → HKLM → File → Load Hive → select Amcache.hve
```

```
Tools for parsing Amcache:

AmcacheParser (Eric Zimmermann - EZ Tools) - best choice:
  https://github.com/EricZimmermann/AmcacheParser

  AmcacheParser.exe -f "C:\Temp\Amcache.hve" --csv "C:\Output"
  AmcacheParser.exe -f "C:\Temp\Amcache.hve" --csv "C:\Output" -i  # include all entries

  Produces multiple CSV files:
    *_UnassociatedFileEntries.csv   - standalone file entries
    *_AssociatedFileEntries.csv     - files linked to installed programs
    *_Programs.csv                  - installed programs
    *_DriverBinaries.csv            - driver files

RegRipper plugin amcache:
  rip.pl -r Amcache.hve -p amcache

Python (python-registry):
  from Registry import Registry
  reg = Registry.Registry("Amcache.hve")
  key = reg.open("Root\\InventoryApplicationFile")
  for subkey in key.subkeys():
      for val in subkey.values():
          print(f"{val.name()}: {val.value()}")
```

### Forensic Value of Amcache

```
What you can establish:

1. SHA1 hash of the file (primary value)
   Enables comparison against:
   - VirusTotal: malware or clean?
   - NSRL: known-good file?
   - Internal IOC databases
   Quick VirusTotal check via API:
   Invoke-RestMethod "https://www.virustotal.com/vtapi/v2/file/report?apikey=KEY&resource=SHA1"

2. Compile time (LinkDate)
   When the binary was compiled.
   Red flags:
     - Compile time = 1970-01-01 or 2037 → timestamp forgery
     - Compile time after the incident date → impossible, file was planted retroactively

3. Publisher / Digital Signature info
   Unsigned files in system folders → suspicious.
   Known publisher name but different SHA1 → file substitution.

4. First appearance on the system
   Amcache timestamp ≈ when the file first appeared (not necessarily when it ran).
   Combine with Shimcache and Prefetch for the full picture.

5. Renamed files
   SHA1 is unchanged by renaming.
   mimikatz.exe renamed to svchost32.exe → the hash exposes it.

6. Compile time vs appearance time
   If a file appeared seconds after its compile timestamp
   → it was likely compiled on this machine (or timestamp was forged).

Limitations:
   - Not all files get recorded in Amcache
   - SHA1 is weak cryptographically but sufficient for identification
   - Entries may be stale (file deleted but entry remains)
   - Locked during system operation → VSS or offline access required
   - No username, no run count
```

---

## Using All Three Together

### Comparison Table

```
                    Prefetch         Shimcache            Amcache
─────────────────────────────────────────────────────────────────────
Storage             .pf files        Registry (SYSTEM)    Hive file
Live access         Yes              Yes (but in memory)  No (locked)
Proves execution    YES (strong)     Win7: yes, Win8+: no No (existence only)
Timestamps          Up to 8 runs     File last-modified   First appearance
File hash           No               No                   SHA1 (key value!)
Full path           Yes              Yes                  Yes
Run count           Yes              No                   No
Deleted files       Yes (entry stays) Yes (entry stays)   Yes (entry stays)
Present on servers  Usually not      Yes                  Yes
Written             Continuously     Only at shutdown      Continuously
```

### Investigation Workflow

```
Step 1: Collect artifacts

  # Prefetch - simple copy
  Copy-Item "C:\Windows\Prefetch" "C:\ForensicOutput\Prefetch" -Recurse

  # Shimcache - via registry save
  reg save "HKLM\SYSTEM" "C:\ForensicOutput\SYSTEM.hive"

  # Amcache - via VSS
  $shadow = (Get-WmiObject Win32_ShadowCopy |
      Sort-Object InstallDate -Descending | Select-Object -First 1).DeviceObject
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve" "C:\ForensicOutput\"
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG1" "C:\ForensicOutput\"
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG2" "C:\ForensicOutput\"

  # Or use KAPE for automated collection:
  kape.exe --tsource C: --tdest D:\Evidence `
      --target Prefetch,Amcache,Shimcache,BAM,RecentFiles

Step 2: Parse

  PECmd.exe -d "C:\ForensicOutput\Prefetch" --csv "C:\Analysis" --csvf prefetch.csv
  AppCompatCacheParser.exe -f "C:\ForensicOutput\SYSTEM.hive" --csv "C:\Analysis"
  AmcacheParser.exe -f "C:\ForensicOutput\Amcache.hve" --csv "C:\Analysis" -i

Step 3: Correlate in Timeline Explorer (EZ Tools)

  # Load all CSVs into Timeline Explorer
  # Sort by timestamp → see the unified chronological picture
  # Filter to the incident window

  # Or via PowerShell:
  $incidentStart = [DateTime]"2024-01-15 10:00"
  $incidentEnd   = [DateTime]"2024-01-15 18:00"

  $prefetch = Import-Csv "C:\Analysis\prefetch.csv"
  $prefetch | Where-Object {
      [DateTime]$_.LastRun -gt $incidentStart -and
      [DateTime]$_.LastRun -lt $incidentEnd
  } | Select-Object ExecutableName, LastRun, RunCount | Sort-Object LastRun
```

### Practical Investigation Example

```
Scenario: suspected credential dumping activity.

1. Check Prefetch for known tools:
   Get-ChildItem "C:\Windows\Prefetch" |
       Where-Object { $_.Name -match "MIMI|PROCDUMP|LSASS|SECRETSDUMP" } |
       Select-Object Name, LastWriteTime

   Found: PROCDUMP64.EXE-7AB8F3D1.pf (LastWriteTime: 2024-01-15 14:32)

2. Parse the .pf file:
   PECmd.exe -f "C:\Windows\Prefetch\PROCDUMP64.EXE-7AB8F3D1.pf"

   Result:
     Last run: 2024-01-15 14:32:11
     Other runs: 14:28:44, 14:27:09
     Run count: 3
     Files referenced:
       ...\LSASS.EXE
       ...\PROCDUMP64.EXE
       C:\TEMP\LSASS.DMP   ← dump file was created!

3. Shimcache - look for additional tools in the same window:
   Parse SYSTEM hive, filter by suspicious paths.
   Found: C:\Users\admin\Desktop\tools\mimikatz.exe (modified: 2024-01-15)
   Found: C:\Windows\Temp\srv64.exe (non-standard location)

4. Amcache - get SHA1 hashes:
   C:\Users\admin\Desktop\tools\mimikatz.exe → SHA1: a3b94f2e...
   Check VirusTotal → 68/72 engines detect as Mimikatz

5. Reconstructed timeline:
   14:27 - procdump64.exe first run (Prefetch)
   14:28 - second run (Prefetch)
   14:32 - third run, lsass.dmp created (Prefetch + file references)
   ~14:33 - mimikatz.exe present (Shimcache + Amcache)
```

---

## Additional Execution Artifacts

```
For a complete picture, forensics uses more than the three main artifacts:

UserAssist (registry - NTUSER.DAT):
  HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\
  Programs launched via Explorer GUI, encoded as ROT13.
  Contains: run count, last execution time, focus time.

BAM / DAM (Background Activity Monitor):
  HKLM\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\{SID}\
  Windows 10 1709+. Tracks background program execution.
  Contains path and last run time. Not cleared on logout!

  # Read BAM:
  $sid = (Get-LocalUser -Name $env:USERNAME).SID.Value
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\$sid"

MUI Cache (registry - NTUSER.DAT):
  HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache\
  Friendly name for every .exe that was ever shown in the UI.
  Quick way to find suspicious program names.

LNK files (shortcuts):
  %APPDATA%\Microsoft\Windows\Recent\
  Created when files are opened. Contains: path, MAC times of original,
  volume serial, NetBIOS hostname (if network path).

Jump Lists:
  %APPDATA%\Microsoft\Windows\Recent\AutomaticDestinations\
  Recent files per application - richer than LNK.

Sysmon EventID 1 (Process Creation):
  Most detailed source if Sysmon is deployed.
  Contains: full command line, hash, PPID, username, logon ID.
```

---

## Tools and Resources

```
Eric Zimmermann (EZ) Tools - de facto standard for Windows forensics:
  https://ericzimmerman.github.io/
  PECmd                   - Prefetch
  AppCompatCacheParser    - Shimcache
  AmcacheParser           - Amcache
  Timeline Explorer       - unified CSV viewer and filter
  MFTECmd                 - Master File Table
  LECmd                   - LNK files
  JLECmd                  - Jump Lists

KAPE (Kroll Artifact Parser and Extractor):
  https://www.kroll.com/kape
  Automated artifact collection by predefined targets.
  Targets: Prefetch, Amcache, Shimcache, BAM, UserAssist, LNK, etc.

Volatility:
  https://github.com/volatilityfoundation/volatility3
  Memory forensics, includes shimcache and malfind plugins.

SANS Windows Forensic Analysis Poster:
  https://www.sans.org/posters/windows-forensic-analysis/
  Single-page reference sheet covering all key artifacts.

Shimcache structure by Windows version:
  https://github.com/libyal/winreg-kb/wiki/Application-compatibility-cache
```

---

## Quick Reference

```
PREFETCH
  Path:       C:\Windows\Prefetch\*.pf
  Format:     PROGRAM.EXE-XXXXXXXX.pf  (hash = CRC32 of path)
  Contains:   timestamps (up to 8 in Win8+), run count, file references
  Written:    continuously on every execution
  Servers:    disabled by default
  Tool:       PECmd.exe -d "C:\Windows\Prefetch" --csv output\

SHIMCACHE
  Path:       HKLM\SYSTEM\...\AppCompatCache
  Contains:   path, file last-modified date, [Win7: execution flag]
  Written:    ONLY at shutdown/reboot!
  Win8+:      no execution flag - proves file existed, not that it ran
  Tool:       AppCompatCacheParser.exe -f SYSTEM.hive --csv output\

AMCACHE
  Path:       C:\Windows\AppCompat\Programs\Amcache.hve
  Contains:   SHA1 hash, path, publisher, compile time, version
  Locked:     need VSS or offline copy
  Key value:  SHA1 → VirusTotal / NSRL check
  Tool:       AmcacheParser.exe -f Amcache.hve --csv output\ -i

WHAT EACH ARTIFACT LACKS
  Prefetch:   no file hash, no username
  Shimcache:  no run count, no username, Win8+ no execution proof
  Amcache:    no execution proof, no username, no run count

COLLECTION IN ONE STEP (KAPE):
  kape.exe --tsource C: --tdest D:\Evidence `
      --target Prefetch,Amcache,Shimcache,BAM,RecentFiles

EZ TOOLS WORKFLOW:
  1. PECmd / AppCompatCacheParser / AmcacheParser → CSV files
  2. Timeline Explorer → load all CSVs
  3. Filter to incident time window
  4. Look for suspicious paths, hash hits, cross-source correlations

SUSPICIOUS PATTERNS
  Program from %TEMP%, %APPDATA%, C:\Users\Public\ → not normal
  High run count for an unknown program → regular use, not a test
  Compile time matches incident time → compiled on this machine
  SHA1 → VirusTotal detection → malware confirmed
  Shimcache entry, no Prefetch → ran on a server (Prefetch disabled)
  Shimcache entry exists, Amcache does not → file was present briefly
  File references in Prefetch include a .dmp file → memory dump created
```

---

## References

- [EZ Tools (Eric Zimmermann)](https://ericzimmerman.github.io/) - PECmd, AmcacheParser, AppCompatCacheParser
- [KAPE](https://www.kroll.com/kape) - automated artifact collection
- [Libyal AppCompat wiki](https://github.com/libyal/winreg-kb/wiki/Application-compatibility-cache) - Shimcache structure by version
- [Tracking Malware with Amcache (Mandiant)](https://www.mandiant.com/resources/blog/tracking-malware-amcache) - Amcache research
- [SANS Windows Forensic Analysis Poster](https://www.sans.org/posters/windows-forensic-analysis/) - analyst reference card
- [Prefetch file format (libprefetch)](https://github.com/libyal/libprefetch/blob/main/documentation/Windows%20Prefetch%20File%20(PF)%20format.asciidoc) - .pf format spec
- [BAM/DAM research](https://www.group-ib.com/blog/bam/) - Background Activity Monitor
- [ForensicsWiki: Prefetch](https://forensicswiki.xyz/wiki/index.php?title=Prefetch) - artifact overview
