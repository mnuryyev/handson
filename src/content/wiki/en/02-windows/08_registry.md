---
title: "Windows Registry - Structure, Keys, and Usage"
date: "2026-05-13"
---

The Windows Registry is a centralized hierarchical database that stores configuration for the operating system, installed applications, hardware, and user settings. It appeared in Windows 3.1 and replaced the chaotic mess of scattered .ini files.

---

## Why the Registry Exists

Without a registry (early Windows / Linux-style approach):

- Each application stores config in its own .ini file
- No centralized location for system settings
- No access control over configuration
- Difficult to manage centrally via GPO

With the registry:

- Single store for all system and application settings
- Hierarchical structure with access control (ACL)
- Centralized management via Group Policy (GPO)
- Multi-user support (separate per-user branches)
- Change auditing via Event Log

---

## Registry Structure

The registry has five root keys (hives). Names all start with `HKEY_` (Handle to a Key).

```
Windows Registry
├── HKEY_LOCAL_MACHINE (HKLM)       - system and software settings (all users)
│   ├── HARDWARE                    - hardware data (memory only, not on disk)
│   ├── SAM                         - account database (protected)
│   ├── SECURITY                    - security policies (protected)
│   ├── SOFTWARE                    - installed programs
│   └── SYSTEM                      - system config, drivers
│
├── HKEY_CURRENT_USER (HKCU)        - settings for the current user
│   ├── AppEvents                   - event sounds
│   ├── Console                     - console window settings
│   ├── Control Panel               - control panel preferences
│   ├── Environment                 - user environment variables
│   ├── Network                     - mapped network drives
│   ├── Printers                    - printers
│   └── Software                    - per-user application settings
│
├── HKEY_USERS (HKU)                - profiles for all users on the system
│   ├── .DEFAULT                    - default profile
│   ├── S-1-5-18                    - SYSTEM
│   ├── S-1-5-19                    - LOCAL SERVICE
│   ├── S-1-5-20                    - NETWORK SERVICE
│   └── S-1-5-21-...-1001           - a specific user's profile (SID)
│       └── (same structure as HKCU)
│
├── HKEY_CLASSES_ROOT (HKCR)        - file associations and COM objects
│   ├── .txt                        - .txt file association
│   ├── .exe                        - .exe file association
│   └── CLSID                       - COM objects
│
└── HKEY_CURRENT_CONFIG (HKCC)      - current hardware profile
```

### Aliases (virtual branches)

```
HKCU  =>  HKU\<current user SID>
HKCR  =>  HKLM\SOFTWARE\Classes  +  HKCU\Software\Classes (merged)
HKCC  =>  HKLM\SYSTEM\CurrentControlSet\Hardware Profiles\Current
```

---

## Registry Files on Disk (Hive Files)

The registry is stored in files. Each file is called a "hive".

```
Registry branch                  File on disk
────────────────────────────────────────────────────────────────────────
HKLM\SYSTEM                      C:\Windows\System32\config\SYSTEM
HKLM\SOFTWARE                    C:\Windows\System32\config\SOFTWARE
HKLM\SAM                         C:\Windows\System32\config\SAM
HKLM\SECURITY                    C:\Windows\System32\config\SECURITY
HKLM\HARDWARE                    memory only (no file)
HKU\.DEFAULT                     C:\Windows\System32\config\DEFAULT
HKU\<SID>                        C:\Users\<Username>\NTUSER.DAT
HKU\<SID>_Classes                C:\Users\<Username>\AppData\Local\
                                  Microsoft\Windows\UsrClass.dat
```

```
Each hive file has companion files created by Windows:
SYSTEM.LOG   - transaction log (recovery after crash)
SYSTEM.LOG1  - second transaction log
SYSTEM.LOG2  - third log (if needed)
SYSTEM.SAV   - backup copy after setup
```

---

## Data Types (Value Types)

Each registry value has a name, type, and data.

```
Type             Hex    Description                    Example
────────────────────────────────────────────────────────────────────────
REG_SZ           0x01   String (Unicode)               "C:\Windows\system32"
REG_EXPAND_SZ    0x02   String with env variables      "%SystemRoot%\system32"
REG_BINARY       0x03   Binary data                    01 00 14 80 ...
REG_DWORD        0x04   32-bit integer (LE)            0x00000001
REG_DWORD_BE     0x05   32-bit integer (BE)            rarely used
REG_LINK         0x06   Symbolic link                  (system use)
REG_MULTI_SZ     0x07   List of strings (null-sep)     "Value1\0Value2\0"
REG_QWORD        0x0B   64-bit integer                 0x0000000100000000
REG_NONE         0x00   No type                        (rare)
```

```
# Examples in regedit:
# REG_SZ:        HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion -> ProductName = "Windows 11 Pro"
# REG_DWORD:     HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters -> TcpMaxDataRetransmissions = 5
# REG_EXPAND_SZ: HKCU\Environment -> TEMP = "%USERPROFILE%\AppData\Local\Temp"
# REG_MULTI_SZ:  HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters -> NullSessionPipes
# REG_BINARY:    HKLM\SAM\SAM\Domains\Account\Users\... -> F (password hash and flags)
```

---

## Working with the Registry: regedit and reg.exe

### regedit.exe - GUI editor

```
Launch: Win+R -> regedit
        or:  regedit.exe /s file.reg  (silent import, no dialogs)

Keyboard shortcuts:
  Ctrl+F         - search the registry
  F5             - refresh
  F2             - rename key/value
  Del            - delete
  Alt+F4         - close

Connect to a remote machine's registry:
  File -> Connect Network Registry -> <machine name>
  (requires Remote Registry service: sc start RemoteRegistry)
```

### reg.exe - command line

```cmd
:: Read a key
reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion /v ProgramFilesDir
reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run
reg query HKLM\SYSTEM\CurrentControlSet\Services /s   :: recursive

:: Add/modify a value
reg add HKCU\Software\MyApp /v Setting1 /t REG_SZ /d "HelloWorld" /f
reg add HKLM\SOFTWARE\MyApp /v Counter /t REG_DWORD /d 42 /f
reg add HKCU\Software\MyApp /v BinaryData /t REG_BINARY /d 0102030405 /f

:: Delete a value
reg delete HKCU\Software\MyApp /v Setting1 /f

:: Delete a key (recursively)
reg delete HKCU\Software\MyApp /f

:: Export to .reg file
reg export HKCU\Software\MyApp C:\backup\myapp.reg

:: Import from .reg file
reg import C:\backup\myapp.reg

:: Copy a key
reg copy HKCU\Software\MyApp HKCU\Software\MyAppBackup /s /f

:: Compare two branches
reg compare HKLM\SOFTWARE\MyApp HKCU\Software\MyApp

:: Search for a value across a branch
reg query HKLM /f "notepad" /t REG_SZ /s

:: Remote registry
reg query \\REMOTEPC\HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion /v ProductName
```

---

## Working with the Registry: PowerShell

PowerShell exposes the registry as a filesystem via PSDrive.

```powershell
# Registry as a drive
Get-PSDrive -PSProvider Registry
# HKLM and HKCU are available by default

# Navigation
Set-Location HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion
Get-ChildItem HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion

# Read values
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir
(Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion).ProgramFilesDir

# Read a single value
Get-ItemPropertyValue HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir

# Create a key
New-Item -Path HKCU:\Software\MyApp -Force

# Create a value
New-ItemProperty -Path HKCU:\Software\MyApp -Name "Version" -Value "1.0" -PropertyType String -Force
New-ItemProperty -Path HKCU:\Software\MyApp -Name "Count" -Value 42 -PropertyType DWord -Force

# Modify a value
Set-ItemProperty -Path HKCU:\Software\MyApp -Name "Version" -Value "2.0"

# Delete a value
Remove-ItemProperty -Path HKCU:\Software\MyApp -Name "Version"

# Delete a key (recursively)
Remove-Item -Path HKCU:\Software\MyApp -Recurse -Force

# Check if a key exists
Test-Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion

# Search the registry
Get-ChildItem -Path HKLM:\SOFTWARE -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -like "*notepad*" }

# Mount additional hives (e.g. HKU)
New-PSDrive -Name HKU -PSProvider Registry -Root HKEY_USERS
Get-ChildItem HKU:\

# Read a remote computer's registry
$reg = [Microsoft.Win32.RegistryKey]::OpenRemoteBaseKey("LocalMachine", "REMOTEPC")
$key = $reg.OpenSubKey("SOFTWARE\Microsoft\Windows\CurrentVersion")
$key.GetValue("ProgramFilesDir")
```

---

## Important Registry Keys

### Autorun / Startup

Keys from which programs are launched at Windows start or user logon.

```
System-wide startup (requires admin rights):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx
HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run   (32-bit apps on 64-bit OS)

Current user startup:
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce

Services:
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>
    Start:     0=Boot, 1=System, 2=Auto, 3=Manual, 4=Disabled
    Type:      1=Kernel Driver, 2=File System Driver, 16=Win32 Own Process, 32=Win32 Shared Process
    ImagePath: path to the executable

Policy-based startup:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run
HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run

Winlogon startup:
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    Userinit:  "C:\Windows\system32\userinit.exe,"   <- attack vector!
    Shell:     "explorer.exe"                         <- attack vector!
```

```powershell
# View startup entries
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run

# Add a program to startup
Set-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run `
    -Name "MyApp" -Value "C:\MyApp\myapp.exe"

# Remove from startup
Remove-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run -Name "MyApp"
```

### System Information

```
Windows version:
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion
    ProductName        - "Windows 11 Pro"
    CurrentVersion     - "6.3"
    CurrentBuild       - "22631"
    ReleaseId          - "2009"
    DisplayVersion     - "23H2"
    InstallDate        - (UNIX timestamp)
    RegisteredOwner    - owner name
    SystemRoot         - "C:\Windows"

Computer name:
HKLM\SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName
    ComputerName       - machine name

Timezone:
HKLM\SYSTEM\CurrentControlSet\Control\TimeZoneInformation
    TimeZoneKeyName    - "Eastern Standard Time"
    Bias               - offset from UTC in minutes
```

### Network

```
Network adapters:
HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{GUID}
    IPAddress          - IP address (if static)
    SubnetMask         - subnet mask
    DefaultGateway     - gateway
    NameServer         - DNS servers
    EnableDHCP         - 1=DHCP, 0=static

Global TCP/IP parameters:
HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
    Hostname           - hostname
    Domain             - DNS suffix
    TcpMaxDataRetransmissions  - TCP retransmit count (default: 5)
    EnableICMPRedirect - allow ICMP redirects

System proxy:
HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
    ProxyEnable        - 1=enabled, 0=disabled
    ProxyServer        - "server:port"
    ProxyOverride      - bypass list

Firewall:
HKLM\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\
    StandardProfile\EnableFirewall   - 1=enabled
    DomainProfile\EnableFirewall
    PublicProfile\EnableFirewall
```

### Security and Policies

```
UAC (User Account Control):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
    EnableLUA          - 1=UAC enabled (recommended), 0=disabled
    ConsentPromptBehaviorAdmin    - behavior when elevation is requested
    ConsentPromptBehaviorUser
    PromptOnSecureDesktop         - prompt on secure desktop

PowerShell execution policy:
HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell
    ExecutionPolicy    - "Restricted" / "RemoteSigned" / "Unrestricted"

Windows Defender:
HKLM\SOFTWARE\Policies\Microsoft\Windows Defender
    DisableAntiSpyware - 1=disabled (bad!)

LSA protection:
HKLM\SYSTEM\CurrentControlSet\Control\Lsa
    RunAsPPL           - 1=LSA process protection (anti-mimikatz)
    LmCompatibilityLevel  - NTLMv1/v2 level (recommend: 5)
    RestrictAnonymous  - 1=restrict anonymous access
    NoLMHash           - 1=do not store LM hashes
```

### Programs and File Associations

```
Installed programs (64-bit):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>
    DisplayName        - application name
    DisplayVersion     - version
    InstallDate        - install date (YYYYMMDD)
    InstallLocation    - install path
    Publisher          - publisher
    UninstallString    - uninstall command
    QuietUninstallString - silent uninstall

Installed programs (32-bit on 64-bit OS):
HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>

Per-user installed programs:
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>

File associations:
HKCR\.txt                          - ProgID for .txt (e.g., "txtfile")
HKCR\txtfile\shell\open\command    - open command
    (Default) = "C:\Windows\system32\NOTEPAD.EXE %1"

HKCR\.pdf
    (Default) = "AcroExch.Document"
HKCR\AcroExch.Document\shell\open\command
    (Default) = "C:\Program Files\Adobe\...\AcroRd32.exe %1"
```

---

## Registry Bitness: 32-bit vs 64-bit

On 64-bit Windows, there are parallel branches for 32-bit applications (WOW64 - Windows-on-Windows 64-bit).

```
64-bit applications read/write:
HKLM\SOFTWARE\...                           (main branch)

32-bit applications on 64-bit Windows read/write:
HKLM\SOFTWARE\WOW6432Node\...              (WOW64 redirect)

Same for HKCU:
HKCU\Software\...                          (64-bit)
HKCU\Software\Classes\WOW6432Node\...     (32-bit)

Check if a process is 32-bit:
[System.Environment]::Is64BitProcess       # PowerShell
IsWow64Process()                           # WinAPI
```

```powershell
# Access the 32-bit hive from 64-bit PowerShell
$reg = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::LocalMachine,
    [Microsoft.Win32.RegistryView]::Registry32
)
$key = $reg.OpenSubKey("SOFTWARE\MyApp32")
$key.GetValue("Version")
```

---

## .reg Files

Files with the `.reg` extension are a text-based export/import format for the registry.

```reg
Windows Registry Editor Version 5.00

; This is a comment

; Create a key and add values
[HKEY_CURRENT_USER\Software\MyApp]
"StringValue"="Hello, World!"
"ExpandString"=hex(2):25,00,55,00,53,00,45,00,52,00,50,00,52,00,4f,00,46,00,49,00,4c,00,45,00,25,00,00,00
"DWordValue"=dword:0000002a
"QWordValue"=hex(b):01,00,00,00,00,00,00,00
"BinaryValue"=hex:01,02,03,04,05
"MultiString"=hex(7):56,00,61,00,6c,00,31,00,00,00,56,00,61,00,6c,00,32,00,00,00,00,00

; Delete a value (minus before the name)
"OldValue"=-

; Delete an entire key (minus before the path)
[-HKEY_CURRENT_USER\Software\OldApp]

; Create a nested key
[HKEY_CURRENT_USER\Software\MyApp\SubKey]
"SubValue"="test"
```

```cmd
:: Import a .reg file
regedit /s myfile.reg

:: Export a branch to .reg
regedit /e C:\export.reg HKEY_CURRENT_USER\Software\MyApp

:: Via reg.exe
reg import myfile.reg
reg export HKCU\Software\MyApp C:\export.reg
```

---

## Registry Backup

### System Restore Points

```powershell
# Create a system restore point
Checkpoint-Computer -Description "Before registry changes" -RestorePointType MODIFY_SETTINGS

# Restore via:
# Control Panel -> Recovery -> Open System Restore
```

### Export via reg.exe

```cmd
:: Export the entire HKLM\SOFTWARE branch
reg export HKLM\SOFTWARE C:\backup\software.reg /y

:: Export a specific key
reg export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" C:\backup\winver.reg /y
```

### Hive file backup

```powershell
# Save to binary hive format
reg save HKLM\SOFTWARE C:\backup\software.hiv
reg save HKLM\SYSTEM   C:\backup\system.hiv

# Restore hive
reg restore HKLM\SOFTWARE C:\backup\software.hiv

# Load an external hive (e.g. from another system)
reg load HKLM\TEMP C:\Users\OtherUser\NTUSER.DAT
# ... work with HKLM\TEMP ...
reg unload HKLM\TEMP
```

---

## Access Control (ACL) on Registry Keys

Every registry key has a security descriptor, just like an NTFS file.

```
Standard permissions:
  Query Value         - read a value
  Set Value           - write a value
  Create Subkey       - create subkeys
  Enumerate Subkeys   - list subkeys
  Notify              - receive change notifications
  Create Link         - create symbolic links (system use)
  Delete              - delete the key
  Write DAC           - modify access permissions
  Write Owner         - change owner
  Read Control        - read the security descriptor

Combined permissions:
  KEY_READ      = Query Value + Enumerate Subkeys + Notify + Read Control
  KEY_WRITE     = Set Value + Create Subkey + Write DAC (scoped to key)
  KEY_ALL_ACCESS = all permissions
```

```powershell
# View ACL on a key
$acl = Get-Acl -Path "HKLM:\SOFTWARE\MyApp"
$acl.Access | Format-Table IdentityReference, RegistryRights, AccessControlType

# Grant read access to a group
$acl = Get-Acl "HKLM:\SOFTWARE\MyApp"
$rule = New-Object System.Security.AccessControl.RegistryAccessRule(
    "DOMAIN\GroupName",
    "ReadKey",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl -Path "HKLM:\SOFTWARE\MyApp" -AclObject $acl
```

---

## Monitoring Registry Changes

### Process Monitor (Sysinternals)

The best tool for real-time registry access monitoring.

```
Download: https://learn.microsoft.com/sysinternals/downloads/procmon

Useful filters for registry:
  Operation is RegSetValue    - writes only
  Operation is RegQueryValue  - reads only
  Path contains "Run"         - autorun keys only
  Process Name is notepad.exe - specific process only

Keyboard shortcuts:
  Ctrl+E  - toggle capture on/off
  Ctrl+X  - clear
  Ctrl+F  - search
```

### Built-in Event Auditing

```powershell
# Enable object auditing (via Group Policy or directly)
# Policy: Audit Object Access -> Success and Failure

# Set auditing on a specific key
$acl = Get-Acl "HKLM:\SOFTWARE\MyApp"
$audit = New-Object System.Security.AccessControl.RegistryAuditRule(
    "Everyone",
    "SetValue,CreateSubKey,DeleteSubKey",
    "ContainerInherit,ObjectInherit",
    "None",
    "Success,Failure"
)
$acl.SetAuditRule($audit)
Set-Acl -Path "HKLM:\SOFTWARE\MyApp" -AclObject $acl

# View events in the Security log
Get-WinEvent -LogName Security | Where-Object { $_.Id -eq 4657 }
# 4657 - registry value modified
# 4656 - handle to registry key requested
# 4658 - handle closed
# 4660 - registry key deleted
# 4663 - registry object accessed
```

### Snapshot comparison with reg.exe

```cmd
:: Save state before changes
reg export HKLM\SOFTWARE\MyApp before.reg

:: ... make changes ...

:: Save state after
reg export HKLM\SOFTWARE\MyApp after.reg

:: Compare (using fc or diff)
fc before.reg after.reg
```

---

## Registry in a Security Context

The registry is a frequent target of attacks. Knowing the security-sensitive keys is essential.

### Attack vectors via the registry

```
1. Persistence
─────────────────────────────────────────────────────────────────────
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run           <- classic
HKCU\Software\Microsoft\Windows\CurrentVersion\Run           <- user-level
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    Userinit = "userinit.exe, C:\malware.exe"                <- hijack
    Shell    = "explorer.exe, C:\malware.exe"                <- hijack
HKLM\SYSTEM\CurrentControlSet\Services\<Name>
    ImagePath = "C:\malware.exe"                             <- malicious service
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\<exe>
    Debugger = "C:\malware.exe"                              <- IFEO hijack

2. Privilege escalation and UAC bypass
─────────────────────────────────────────────────────────────────────
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
    EnableLUA = 0                                            <- UAC disabled
HKCU\Software\Classes\ms-settings\shell\open\command        <- UAC bypass (eventvwr)

3. DLL Hijacking via registry
─────────────────────────────────────────────────────────────────────
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs  <- known DLL list
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows
    AppInit_DLLs = ""                                        <- loads DLL into every process!
    LoadAppInit_DLLs = 0                                     <- must be 0

4. Credentials in the registry
─────────────────────────────────────────────────────────────────────
HKLM\SAM\SAM\...                                             <- NTLM hashes (SYSTEM required)
HKLM\SECURITY\Policy\Secrets\...                             <- LSA Secrets
HKCU\Software\SimonTatham\PuTTY\Sessions\...                 <- saved PuTTY sessions
```

### Security checks

```powershell
# Check autoruns (Sysinternals autorunsc.exe is even better)
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run

# Check Winlogon for hijacking
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" |
    Select-Object Userinit, Shell

# AppInit_DLLs should be empty
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows" |
    Select-Object AppInit_DLLs, LoadAppInit_DLLs

# LM hashes should be disabled
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").NoLMHash
# Should be: 1

# NTLMv2 level
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").LmCompatibilityLevel
# Recommended: 5 (NTLMv2 only)

# LSA process protection (PPL)
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").RunAsPPL
# Recommended: 1

# Image File Execution Options - look for suspicious debugger entries
Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options" |
    ForEach-Object {
        $debugger = (Get-ItemProperty $_.PSPath).Debugger
        if ($debugger) { Write-Host "$($_.PSChildName): $debugger" }
    }
```

---

## Offline Registry Analysis

During incident response or analysis of a foreign system, you work with hive files directly.

```powershell
# Load a hive from another machine (from an image, USB drive)
reg load HKLM\ANALYSIS C:\Evidence\NTUSER.DAT

# Work with it normally
Get-ItemProperty "HKLM:\ANALYSIS\Software\Microsoft\Windows\CurrentVersion\Run"

# Always unload when done!
[gc]::Collect()   # release PowerShell handles
reg unload HKLM\ANALYSIS
```

```cmd
:: Copy locked hive files from a live system using Volume Shadow Copy
vssadmin create shadow /for=C:
:: Then copy from the shadow copy:
copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SYSTEM C:\backup\
copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SAM C:\backup\
```

Popular tools for offline analysis:

- **RegRipper** - automated hive analysis, extracts forensic artifacts
- **Registry Explorer** (Eric Zimmerman) - GUI hive viewer with transaction log support
- **regipy** (Python) - programmatic hive analysis
- **Volatility** - registry analysis from memory dumps

---

## Cheat Sheet

```
Root keys:
HKLM   - Local Machine (everything except user profiles)
HKCU   - Current User (current user = HKU\<SID>)
HKU    - all user profiles
HKCR   - file associations + COM (HKLM\SOFTWARE\Classes + HKCU\Software\Classes)
HKCC   - current hardware profile

Files on disk:
HKLM\SYSTEM    -> C:\Windows\System32\config\SYSTEM
HKLM\SOFTWARE  -> C:\Windows\System32\config\SOFTWARE
HKLM\SAM       -> C:\Windows\System32\config\SAM
HKCU           -> C:\Users\<User>\NTUSER.DAT

Data types:
REG_SZ         - string
REG_EXPAND_SZ  - string with %env_variables%
REG_DWORD      - 32-bit integer
REG_QWORD      - 64-bit integer
REG_BINARY     - binary data
REG_MULTI_SZ   - list of strings

Key autorun locations:
HKLM\...\CurrentVersion\Run
HKCU\...\CurrentVersion\Run
HKLM\...\Winlogon  (Userinit, Shell)
HKLM\SYSTEM\...\Services\<Name>

Security - what to verify:
EnableLUA = 1          (UAC enabled)
NoLMHash = 1           (LM hashes disabled)
LmCompatibilityLevel=5 (NTLMv2 only)
RunAsPPL = 1           (LSA protection)
AppInit_DLLs = ""      (must be empty!)

Commands:
reg query / add / delete / export / import / load / unload / compare
regedit /s file.reg    (silent import)
Get-ItemProperty / Set-ItemProperty / New-Item / Remove-Item  (PowerShell)
```

---

## References

- [Microsoft Docs: Registry](https://learn.microsoft.com/en-us/windows/win32/sysinfo/registry) - official documentation
- [Sysinternals Autoruns](https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns) - autorun analysis
- [Sysinternals Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) - registry monitoring
- [Registry Explorer (Zimmerman)](https://ericzimmerman.github.io/) - offline hive viewer
- [RegRipper](https://github.com/keydet89/RegRipper3.0) - registry forensics
- [MITRE ATT&CK: Registry Run Keys](https://attack.mitre.org/techniques/T1547/001/) - persistence via registry
