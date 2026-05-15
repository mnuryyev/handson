---
title: "Windows - Windows Defender and AV Mechanisms"
date: "2026-05-15"
---

Windows Defender (officially Microsoft Defender Antivirus) is the built-in antivirus that has long evolved from a simple scanner into a multilayered protection platform. Defender Antivirus is just one component of the Microsoft Defender suite. Understanding the architecture, detection mechanisms, and management options is essential for both defenders and anyone doing security assessments.

---

## Microsoft Defender Architecture

```
Microsoft Defender Suite - a set of interconnected components:

Microsoft Defender Antivirus (MDAV)
  Built-in AV. Always active unless a third-party AV is installed.
  Components: Real-time protection, On-demand scan, Cloud protection, ASR.

Microsoft Defender SmartScreen
  Checks downloaded files and URLs against a reputation database.
  Integrated into Edge, Explorer, and Windows Security.

Microsoft Defender Firewall
  Built-in firewall with per-application, per-port, per-profile filtering.

Microsoft Defender for Endpoint (MDE) / formerly Defender ATP
  Enterprise EDR (Endpoint Detection & Response) solution.
  Requires Microsoft 365 / Defender for Endpoint P1/P2 license.
  Adds: behavioral analysis, threat hunting, event timeline, auto-remediation.

Microsoft Defender for Identity (MDI) / formerly Azure ATP
  Analyzes AD traffic (Kerberos, LDAP, NTLM) for anomalies.
  Sensors on DCs; detects attacks: Pass-the-Hash, DCSync, Kerberoasting.

Windows Defender Application Guard (WDAG)
  Isolated Edge browser in a Hyper-V container.
  Untrusted sites open in an isolated VM.

Windows Defender Credential Guard
  LSASS isolation in Hyper-V (Virtual Secure Mode).
  NT Hashes are inaccessible even to kernel-level malware.

Windows Defender Application Control (WDAC) / AppLocker
  Allowlist: only allow signed/trusted files to run.

Key MDAV processes:
  MsMpEng.exe    - Antimalware Service Executable (scan engine)
  MpCmdRun.exe   - command-line management tool
  NisSrv.exe     - Network Inspection Service (network IDS)
  MpDefenderCoreService.exe - Defender core (Server 2022 / Win 11)
  SecurityHealthService.exe - Windows Security Center
  WdNisDrv.sys   - network inspection driver
  WdFilter.sys   - filesystem minifilter (real-time)
  WdBoot.sys     - Early Launch Anti-Malware (ELAM)
```

---

## Detection Mechanisms

### Signature-Based Detection

```
Classic approach: compare a file/memory region against a database of known signatures.

Signature database:
  Location: C:\ProgramData\Microsoft\Windows Defender\Definition Updates\
  Updated: via Windows Update, Defender Update, WSUS, SCCM
  Format: .vdm files (mpasbase.vdm, mpavbase.vdm, mpavdlta.vdm)
  Frequency: several times a day (emergency updates - every few hours)

What gets detected:
  - Hashes of known malware files (MD5/SHA1/SHA256)
  - Byte patterns inside files
  - Strings (function names, URLs, mutex names from known malware)

Check signature version:
  Get-MpComputerStatus | Select-Object `
      AntivirusSignatureVersion,
      AntivirusSignatureLastUpdated,
      AntispywareSignatureVersion

Update manually:
  Update-MpSignature
  MpCmdRun.exe -SignatureUpdate

Limitations:
  - Does not work against unknown/zero-day malware
  - Bypass: minor file modifications change the hash/pattern
  - Packers and obfuscation hide signatures
```

### Heuristics and ML

```
Static analysis without execution:
  Defender analyzes PE structure, imports, strings,
  entropy (high entropy → likely packed/encrypted),
  metadata, and behavioral indicators.

ML models - two layers:
  Client model (offline): works without internet
  Cloud model (MAPS):     more powerful, requires cloud protection

  Client model detects based on:
    - Anomalous PE structures
    - Suspicious import combinations (CreateRemoteThread + VirtualAllocEx)
    - Characteristic shellcode patterns
    - Entropy anomalies in PE sections

Behavioral analysis in memory (AMSI + ETW):
  Defender intercepts execution via AMSI (Antimalware Scan Interface).
  Scripts (PowerShell, VBScript, JScript, .NET) are scanned BEFORE execution.
```

### AMSI - Antimalware Scan Interface

```
AMSI is an API for integrating AV with applications.
It allows scripting engines to pass content to AV for scanning before execution.

Hosts that implement AMSI:
  PowerShell (v5+)
  Windows Script Host (VBScript, JScript)
  .NET Framework (v4.8+) / .NET Core
  Office VBA macros
  User Account Control (UAC)
  WMI

How AMSI works:
  1. PowerShell receives a script
  2. Calls AmsiScanBuffer() via amsi.dll
  3. amsi.dll passes the buffer to registered AV providers
  4. If AV returns "malicious" - execution is blocked
  5. If "clean" - execution continues

  Key point: AMSI scans the final deobfuscated content.
  Even if a script is heavily obfuscated, it gets deobfuscated
  just before execution and that result is passed to AMSI.

Test that AMSI is working (EICAR-like test string):
  # In PowerShell - this should be blocked by Defender:
  'AMSI Test Sample: X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  # Defender will report "This script contains malicious content"
```

### Cloud Protection (MAPS)

```
MAPS (Microsoft Active Protection Service) - cloud-based analysis.
When Defender encounters a suspicious file, it sends metadata to the cloud.

Reporting levels (SpynetReporting):
  0 = Disabled - send nothing
  1 = Basic    - basic metadata (recommended minimum)
  2 = Advanced - additional data (samples)

What gets sent:
  - File hash, path, process name
  - PE header metadata
  - At Advanced level: the file itself (if no PII)

Block at First Sight:
  If a file is unknown and the cloud says "suspicious" -
  the file is blocked while waiting for cloud response (usually < 1 second).
  Requires: CloudBlockLevel and CloudExtendedTimeout configured.

Configure:
  Set-MpPreference -MAPSReporting Advanced
  Set-MpPreference -SubmitSamplesConsent SendAllSamples
  Set-MpPreference -CloudBlockLevel High
  Set-MpPreference -CloudExtendedTimeout 50  # seconds

Verify:
  Get-MpPreference | Select-Object MAPSReporting, CloudBlockLevel, SubmitSamplesConsent
```

### Real-Time Protection

```
WdFilter.sys - filesystem minifilter. Intercepts:
  - File create/write (IRP_MJ_CREATE, IRP_MJ_WRITE)
  - Process creation
  - DLL loading
  - Registry changes (key branches)

What gets scanned in real time:
  Files on creation/modification/access
  Downloaded files (via Mark of the Web)
  Network files (via network provider)
  Processes at launch

Mark of the Web (MotW / Zone.Identifier):
  Files from the internet receive an ADS Zone.Identifier:
  [ZoneTransfer]
  ZoneId=3  (3=Internet, 1=Intranet, 2=Trusted, 4=Restricted)

  Defender and SmartScreen pay extra attention to files with ZoneId=3/4.
  This is why an LNK file extracted from a ZIP is treated differently
  from a plain .exe you already had on disk.

  View MotW:
  Get-Item C:\Downloads\file.exe -Stream Zone.Identifier | Get-Content

  Remove MotW:
  Unblock-File -Path C:\Downloads\file.exe
  # Or: right-click → Properties → Unblock
```

---

## Attack Surface Reduction (ASR)

```
ASR - a set of rules that block specific attack techniques.
Not signatures - pure behavioral rules.
Requires: Windows 10 1709+, Microsoft Defender active.

Rule modes:
  0 = Disabled  - rule is off
  1 = Block     - block and write to Event Log
  2 = Audit     - write to Event Log only (don't block)
  6 = Warn      - warn the user with option to bypass

Key ASR rules (GUID: description):

  BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550
  Block executable content from email client and webmail

  D4F940AB-401B-4EFC-AADC-AD5F3C50688A
  Block all Office applications from creating child processes

  3B576869-A4EC-4529-8536-B80A7769E899
  Block Office applications from creating executable content

  75668C1F-73B5-4CF0-BB93-3ECF5CB7CC84
  Block Office applications from injecting code into other processes

  D3E037E1-3EB8-44C8-A917-57927947596D
  Block JavaScript or VBScript from launching downloaded executable content

  5BEB7EFE-FD9A-4556-801D-275E5FFC04CC
  Block execution of potentially obfuscated scripts

  92E97FA1-2EDF-4476-BDD6-9DD0B4DDDC7B
  Block Win32 API calls from Office macros

  01443614-CD74-433A-B99E-2ECDC07BFC25
  Block executable files unless they meet prevalence, age, or trusted list criteria

  9E6C4E1F-7D60-472F-BA1A-A39EF669E4B0
  Block credential stealing from LSASS  ← prevents LSASS dumps!

  D1E49AAC-8F56-4280-B9BA-993A6D77406C
  Block process creations from PSExec and WMI commands

  B2B3F03D-6A65-4F7B-A9C7-1C7EF74A9BA4
  Block untrusted and unsigned processes from USB

  E6DB77E5-3DF2-4CF1-B95A-636979351E5B
  Block persistence through WMI event subscription

  7674BA52-37EB-4A4F-A9A1-F0F9A1619A2C
  Block Adobe Reader from creating child processes

Manage ASR:
  # Enable a rule (Block mode)
  Add-MpPreference -AttackSurfaceReductionRules_Ids "9E6C4E1F-..." `
      -AttackSurfaceReductionRules_Actions Enabled

  # Enable in Audit mode first (always test this way!)
  Add-MpPreference -AttackSurfaceReductionRules_Ids "9E6C4E1F-..." `
      -AttackSurfaceReductionRules_Actions AuditMode

  # View all rules
  Get-MpPreference | Select-Object AttackSurfaceReductionRules_Ids,
      AttackSurfaceReductionRules_Actions

  # Exclude a specific path from ASR
  Add-MpPreference -AttackSurfaceReductionOnlyExclusions "C:\LegacyApp\app.exe"

Event Log for ASR:
  Microsoft-Windows-Windows Defender/Operational
  EventID 1121 - ASR rule blocked
  EventID 1122 - ASR rule audit (logged but not blocked)
  EventID 1131 - ASR rule blocked network connection

  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -in 1121, 1122 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## Controlled Folder Access

```
Controlled Folder Access - ransomware protection for folders.
Only trusted applications can write to protected folders.
Unknown applications attempting to write are blocked.

Protected folders by default:
  %USERPROFILE%\Documents
  %USERPROFILE%\Desktop
  %USERPROFILE%\Pictures
  %USERPROFILE%\Videos
  %USERPROFILE%\Music
  %PUBLIC%\Documents and others

Enable:
  Set-MpPreference -EnableControlledFolderAccess Enabled
  # Modes: Enabled, AuditMode, Disabled, BlockDiskModificationOnly, AuditDiskModificationOnly

Add a protected folder:
  Add-MpPreference -ControlledFolderAccessProtectedFolders "D:\ImportantData"

Add an allowed (trusted) application:
  Add-MpPreference -ControlledFolderAccessAllowedApplications "C:\MyApp\app.exe"

Event Log:
  EventID 1123 - Controlled Folder Access blocked
  EventID 1124 - Controlled Folder Access audit

Verify:
  Get-MpPreference | Select-Object EnableControlledFolderAccess,
      ControlledFolderAccessProtectedFolders,
      ControlledFolderAccessAllowedApplications
```

---

## Exclusions

```
Exclusions - files/folders/processes that Defender skips scanning.
Needed for performance (databases, IDEs, VMs).
Dangerous: malware actively abuses exclusions as an evasion technique.

Exclusion types:
  Path exclusions    - exclude a folder or file
  Extension          - exclude files by extension
  Process            - files opened by this process are not scanned
  Auto-generated     - Defender creates these automatically for some services

Manage exclusions:
  # Add
  Add-MpPreference -ExclusionPath "C:\SQLData"
  Add-MpPreference -ExclusionExtension ".log"
  Add-MpPreference -ExclusionProcess "sqlservr.exe"

  # View
  Get-MpPreference | Select-Object ExclusionPath, ExclusionExtension, ExclusionProcess

  # Remove
  Remove-MpPreference -ExclusionPath "C:\SQLData"

Registry location of exclusions (readable by malware to find "safe" drop locations):
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths\
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Extensions\
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Processes\

  # Read exclusions via registry (requires admin):
  Get-Item "HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths"

GPO exclusions (override local settings):
  Computer Config → Admin Templates → Windows Components
  → Microsoft Defender Antivirus → Exclusions

Security note: path-based exclusions are a known attacker technique.
  A dropper reads the exclusion list from the registry, then writes its payload
  into an excluded folder - bypassing scanning entirely.
  Audit: monitor EventID 4657 on the exclusions registry keys.
```

---

## Managing Defender

### PowerShell

```powershell
# ---- Status and info ----
Get-MpComputerStatus
# Returns: AntivirusEnabled, RealTimeProtectionEnabled, NISEnabled,
# SignatureVersion, SignatureLastUpdated, IsTamperProtected, AMRunningMode, etc.

Get-MpThreat                     # threat history
Get-MpThreatDetection            # detailed detections
Get-MpThreatCatalog              # known threat catalog

# ---- Scanning ----
Start-MpScan -ScanType QuickScan
Start-MpScan -ScanType FullScan
Start-MpScan -ScanType CustomScan -ScanPath "C:\Suspicious"

# Offline scan (reboot + scan before Windows loads)
Start-MpWDOScan

# ---- Protection settings ----
Set-MpPreference -DisableRealtimeMonitoring $false  # enable RTP
Set-MpPreference -MAPSReporting Advanced
Set-MpPreference -CloudBlockLevel High
Set-MpPreference -CloudExtendedTimeout 50
Set-MpPreference -PUAProtection Enabled

# Scan schedule
Set-MpPreference -ScanScheduleDay Everyday
Set-MpPreference -ScanScheduleTime "02:00"

# ---- Updates ----
Update-MpSignature
Update-MpSignature -UpdateSource MicrosoftUpdateServer

# ---- Threat management ----
Get-MpThreat | Where-Object { $_.IsActive }
Remove-MpThreat
```

### MpCmdRun.exe

```
Location:
  C:\Program Files\Windows Defender\MpCmdRun.exe
  C:\ProgramData\Microsoft\Windows Defender\Platform\<version>\MpCmdRun.exe

Commands:
  MpCmdRun.exe -SignatureUpdate
  MpCmdRun.exe -Scan -ScanType 1            # Quick
  MpCmdRun.exe -Scan -ScanType 2            # Full
  MpCmdRun.exe -Scan -ScanType 3 -File "C:\Suspicious\file.exe"
  MpCmdRun.exe -GetFiles                    # collect diagnostic files
  MpCmdRun.exe -Restore -Name "Trojan:..."  # restore from quarantine

Quarantine location:
  C:\ProgramData\Microsoft\Windows Defender\Quarantine\
  Files are encrypted (XOR). Cannot simply copy and run.
  Restore via: MpCmdRun.exe -Restore -Name <threat_name> [-All] [-Path <path>]
```

### GPO Management

```
Computer Configuration → Administrative Templates → Windows Components
  → Microsoft Defender Antivirus

Key policies:

  Turn off Microsoft Defender Antivirus
    → Disabled: Defender is on (recommended)
    → Enabled: Defender is off (ONLY if a third-party AV is present)

  Real-time Protection:
    Turn off real-time protection
    Monitor file and program activity on your computer

  MAPS / Cloud:
    Join Microsoft MAPS
    Configure the 'Block at First Sight' feature

  Exclusions:
    Path Exclusions, Extension Exclusions, Process Exclusions

Registry path for GPO policies (override local settings):
  HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\
```

---

## Defender in the Enterprise

### Defender Modes with Third-Party AV

```
When a third-party AV is installed:
  The AV registers itself in WMI → SecurityCenter2
  Windows moves Defender to Passive Mode or Disabled Mode.

Modes:
  Active Mode   - primary AV, all features
  Passive Mode  - runs alongside third-party AV, does not block,
                  but sends data to MDE (EDR functions still work)
  Disabled Mode - completely off

Check the current mode:
  Get-MpComputerStatus | Select-Object AMRunningMode
  # Normal = Active, Passive = Passive

Check registered AV products via WMI:
  Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct |
      Select-Object displayName, pathToSignedProductExe, productState
```

### WDAC - Windows Defender Application Control

```
WDAC is the modern replacement for AppLocker.
Works at kernel level (CI.dll). Harder to bypass than AppLocker.

Policy modes:
  Audit Mode   - allow everything, log what would have been blocked
  Enforce Mode - block everything not matching the policy

Create a basic policy:
  # Allow only Microsoft-signed and Store apps
  New-CIPolicy -Level Publisher -FilePath "C:\Policy\BasePolicy.xml" `
      -UserPEs -MultiplePolicyFormat

  # Compile the policy
  ConvertFrom-CIPolicy "C:\Policy\BasePolicy.xml" "C:\Policy\BasePolicy.bin"

  # Deploy (copy to the CodeIntegrity folder)
  Copy-Item "C:\Policy\BasePolicy.bin" `
      "C:\Windows\System32\CodeIntegrity\SIPolicy.p7b"

Event Log:
  Microsoft-Windows-CodeIntegrity/Operational
  EventID 3076 - Audit: file would have been blocked
  EventID 3077 - Block: file was blocked
```

---

## Diagnostics and Event Log

```
Main Defender log:
  Microsoft-Windows-Windows Defender/Operational

Key Event IDs:

  1000  - Scan started
  1001  - Scan finished
  1006  - Malware detected (scan)
  1007  - Action taken on malware
  1009  - Item restored from quarantine
  1015  - Suspicious behavior detected
  1116  - Malware detected (real-time protection)
  1117  - Action taken (real-time)

  1121  - ASR rule blocked
  1122  - ASR rule audit
  1123  - Controlled Folder Access blocked
  1124  - Controlled Folder Access audit
  1125  - Network protection blocked
  1126  - Network protection audit

  2000  - Signature updated
  2001  - Signature update failed

  3002  - Real-time protection failure
  5004  - Real-time protection enabled
  5007  - Configuration changed  ← monitor this!
  5008  - Engine failure

PowerShell - analyze Defender logs:
  # All detections in the last 24 hours
  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -in 1006, 1116 -and
          $_.TimeCreated -gt (Get-Date).AddHours(-24) } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # Configuration changes (suspicious if you didn't make them)
  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -eq 5007 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # Full threat history
  Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending |
      Select-Object -First 20 ThreatName, InitialDetectionTime,
          ActionSuccess, RemediationTime | Format-Table

  # Verify real-time protection is on
  Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled,
      AMServiceEnabled, OnAccessProtectionEnabled, IsTamperProtected
```

---

## Tamper Protection

```
Tamper Protection prevents changes to Defender settings via:
  - Registry edits
  - PowerShell (Set-MpPreference)
  - Third-party tools and scripts

Even if an attacker has admin rights, they cannot disable Defender
while Tamper Protection is on. Changes must be made interactively
through Windows Security UI or via Intune/MDE in enterprise environments.

Enable:
  Windows Security → Virus & Threat Protection → Manage settings
  → Tamper Protection → On

  In enterprise: managed centrally via Intune / MDE policy.
  Cannot be disabled locally when managed.

Verify:
  Get-MpComputerStatus | Select-Object IsTamperProtected
  # True = protected

Monitor: EventID 5007 in Defender/Operational log will still record
any attempted changes - even blocked ones.
```

---

## Quick Reference

```
DEFENDER COMPONENTS
  MDAV (MsMpEng.exe)   - malware scan engine
  NisSrv.exe           - Network Inspection Service
  WdFilter.sys         - filesystem minifilter (real-time)
  WdBoot.sys           - ELAM (early launch)
  AMSI (amsi.dll)      - script scanning before execution

DETECTION MECHANISMS
  Signatures           - hashes and patterns of known malware
  Heuristics / ML      - static PE analysis, entropy
  AMSI                 - PowerShell / VBScript / .NET before execution
  Behavioral           - what a process does (injection, hollowing)
  Cloud (MAPS)         - cloud lookup for unknown files
  ASR                  - behavioral rules against attack techniques

KEY COMMANDS
  Get-MpComputerStatus                         - overall status
  Get-MpThreatDetection                        - detection history
  Start-MpScan -ScanType QuickScan             - quick scan
  Update-MpSignature                           - update signatures
  Set-MpPreference -DisableRealtimeMonitoring $false  - enable RTP
  Get-MpPreference                             - all settings
  Add-MpPreference -ExclusionPath "C:\..."     - add exclusion
  Add-MpPreference -AttackSurfaceReductionRules_Ids GUID -Actions Enabled

ASR RULES (key GUIDs)
  9E6C4E1F-7D60-472F-BA1A-A39EF669E4B0  - Block LSASS dump
  D1E49AAC-8F56-4280-B9BA-993A6D77406C  - Block PSExec/WMI process creation
  5BEB7EFE-FD9A-4556-801D-275E5FFC04CC  - Block obfuscated scripts
  BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550  - Block executable from email
  E6DB77E5-3DF2-4CF1-B95A-636979351E5B  - Block WMI persistence

EVENT IDS (Windows Defender/Operational)
  1116  - Malware detected (real-time)
  1117  - Action taken
  1121  - ASR blocked
  1122  - ASR audit
  1123  - Controlled Folder Access blocked
  2000  - Signature updated
  5007  - Configuration changed (!) always monitor this

HARDENING PRIORITIES
  1. Tamper Protection = ON
  2. Cloud Protection = Advanced + Block at First Sight
  3. ASR rules: start in Audit mode, then Block
     (especially: LSASS, PSExec, Office child processes, obfuscated scripts)
  4. Controlled Folder Access = Enabled for important folders
  5. PUA Protection = Enabled
  6. Exclusions = minimum; audit all changes (EventID 4657 on exclusion keys)

FILE PATHS
  Signatures:  C:\ProgramData\Microsoft\Windows Defender\Definition Updates\
  Quarantine:  C:\ProgramData\Microsoft\Windows Defender\Quarantine\
  Logs:        C:\ProgramData\Microsoft\Windows Defender\Support\
  MpCmdRun:    C:\Program Files\Windows Defender\MpCmdRun.exe
```

---

## References

- [Microsoft Defender Antivirus documentation](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/microsoft-defender-antivirus-windows) - official docs
- [AMSI documentation](https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-portal) - AMSI API reference
- [ASR rules reference](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference) - all ASR rules with GUIDs
- [Controlled Folder Access](https://learn.microsoft.com/en-us/defender-endpoint/controlled-folders) - ransomware folder protection
- [Tamper Protection](https://learn.microsoft.com/en-us/defender-endpoint/prevent-changes-to-security-settings-with-tamper-protection) - Tamper Protection docs
- [WDAC overview](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appcontrol-and-applocker-overview) - Application Control
- [Defender for Endpoint](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/) - enterprise EDR
- [MITRE ATT&CK: Defense Evasion](https://attack.mitre.org/tactics/TA0005/) - evasion techniques (for defenders)
