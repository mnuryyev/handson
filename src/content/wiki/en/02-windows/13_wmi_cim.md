---
title: "Windows - WMI / CIM"
date: "2026-05-13"
---

WMI (Windows Management Instrumentation) is an infrastructure for managing and monitoring Windows systems. It lets you read system configuration, hardware state, running processes, services — all uniformly, locally or remotely, through a single interface.

CIM (Common Information Model) is an international standard from DMTF that WMI is built on. Starting with PowerShell 3.0, Microsoft provides CIM cmdlets (`Get-CimInstance` etc.) as the modern replacement for the old WMI cmdlets (`Get-WmiObject`).

---

## WMI Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                      │
│   PowerShell  │  wmic.exe  │  WBEMTest  │  Third-party tools│
└───────────────┴────────────┴────────────┴───────────────────┘
                          │
                          │  WMI API (COM/DCOM or WS-Man)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      WMI Service                            │
│                    winmgmt (winmgmt.exe)                    │
│                   Service name: winmgmt                     │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  WMI         │  │  CIM         │  │  WMI         │
│  Repository  │  │  Providers   │  │  Providers   │
│ (schema      │  │ (collect     │  │ (Win32_,     │
│  database)   │  │  actual data)│  │  MSFT_*, ...) │
└──────────────┘  └──────────────┘  └──────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Operating System     │
              │  Hardware             │
              │  Registry             │
              │  File System          │
              └───────────────────────┘
```

### Key Components

```
winmgmt.exe (winmgmt service):
  The core WMI service. Runs inside svchost.exe.
  Accepts requests, routes them to providers, returns results.
  If winmgmt stops — WMI is completely unavailable.

WMI Repository:
  The WMI schema database: all class definitions, namespaces, properties.
  Location: C:\Windows\System32\wbem\Repository\
  Files: OBJECTS.DATA, INDEX.BTR, MAPPING*.MAP
  Repository corruption → WMI broken (can be rebuilt: winmgmt /resetrepository)

WMI Providers:
  DLL files that actually collect data.
  Each provider is responsible for a set of classes.
  Location: C:\Windows\System32\wbem\*.dll
  Examples:
    cimwin32.dll   - Win32_Process, Win32_Service, Win32_LogicalDisk, ...
    wmiprvse.exe   - WMI Provider Host process (hosts the providers)
    wbemcons.dll   - WMI Event subscriptions
```

---

## Namespaces

WMI is organized as a hierarchy of namespaces. Classes live inside namespaces.

```
root\
├── root\CIMV2          ← primary namespace, Win32_* classes live here
│   ├── Win32_Process
│   ├── Win32_Service
│   ├── Win32_LogicalDisk
│   └── ... (hundreds of classes)
├── root\Microsoft
│   ├── root\Microsoft\Windows
│   │   ├── root\Microsoft\Windows\Storage    - disks, volumes, partitions (MSFT_*)
│   │   ├── root\Microsoft\Windows\DNS        - DNS server
│   │   └── root\Microsoft\Windows\DHCP
│   └── root\Microsoft\SqlServer             - SQL Server
├── root\StandardCimv2  ← modern MSFT_Net* classes (networking)
│   ├── MSFT_NetIPAddress
│   ├── MSFT_NetRoute
│   └── MSFT_NetTCPConnection
├── root\SecurityCenter2 ← antivirus, firewall, Windows Defender products
│   ├── AntiVirusProduct
│   └── FirewallProduct
├── root\WMI             ← WDM classes (drivers)
├── root\DEFAULT         ← system classes
├── root\SECURITY        ← security policies
└── root\subscription    ← WMI Event Subscriptions (persistent subscriptions!)
```

```powershell
# List all namespaces
Get-CimInstance -Namespace root -ClassName __Namespace | Select-Object Name

# Recursively list all namespaces
function Get-WmiNamespace {
    param([string]$Namespace = "root")
    Get-CimInstance -Namespace $Namespace -ClassName __Namespace |
        ForEach-Object {
            $child = "$Namespace\$($_.Name)"
            $child
            Get-WmiNamespace -Namespace $child
        }
}
```

---

## WMI vs CIM: What is the Difference

```
Parameter             Get-WmiObject (old)           Get-CimInstance (new)
──────────────────────────────────────────────────────────────────────────────
Introduced in         PowerShell v1                 PowerShell v3
Remote transport      DCOM (port 135 + random)      WS-Man (port 5985/5986)
Platform              Windows only                  Windows + Linux + macOS
Returns               ManagementObject              CimInstance
Methods               Via .InvokeMethod()           Via Invoke-CimMethod
Sessions              None                          CimSession (reusable)
Performance           Slower                        Faster
Recommended           No (deprecated)               Yes
```

```
DCOM vs WS-Man for remote queries:
  DCOM (Get-WmiObject -ComputerName):
    - Requires port 135 (RPC Endpoint Mapper) + random high ports
    - Difficult to allow through firewalls precisely
    - Old protocol, less security hardening

  WS-Man (Get-CimInstance via CimSession):
    - Port 5985 (HTTP) or 5986 (HTTPS)
    - Same transport as PowerShell Remoting (WinRM)
    - Modern, firewall-friendly
    - Requires WinRM enabled on the target machine
```

---

## WQL — the WMI Query Language

WQL (WMI Query Language) is a subset of SQL for querying WMI. Used inside `Get-CimInstance -Query` and in Event Subscriptions.

```sql
-- Basic syntax
SELECT * FROM Win32_Process
SELECT Name, ProcessId, WorkingSetSize FROM Win32_Process
SELECT * FROM Win32_Process WHERE Name = 'notepad.exe'
SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3
SELECT * FROM Win32_Service WHERE State = 'Running' AND StartMode = 'Auto'

-- LIKE with wildcards
SELECT * FROM Win32_Process WHERE Name LIKE 'chrome%'
SELECT * FROM Win32_Service WHERE Name LIKE '%sql%'

-- IS NULL / IS NOT NULL
SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPAddress IS NOT NULL

-- Association queries
-- Find all disks for a given computer
ASSOCIATORS OF {Win32_ComputerSystem.Name='MYPC'}
    WHERE AssocClass = Win32_SystemDiskPartitions

-- Event Queries (monitoring)
SELECT * FROM __InstanceCreationEvent WITHIN 5
    WHERE TargetInstance ISA 'Win32_Process'

SELECT * FROM __InstanceModificationEvent WITHIN 10
    WHERE TargetInstance ISA 'Win32_Service'
    AND TargetInstance.Name = 'Spooler'
```

```powershell
# Using WQL in PowerShell
Get-CimInstance -Query "SELECT * FROM Win32_Process WHERE Name = 'notepad.exe'"
Get-CimInstance -Query "SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3" -Namespace root\CIMV2
```

---

## Key Classes: Win32 and MSFT

### System and Hardware

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_OperatingSystem        OS                            Caption, Version, BuildNumber,
                                                           LastBootUpTime, FreePhysicalMemory,
                                                           TotalVisibleMemorySize, OSArchitecture

Win32_ComputerSystem         Computer                      Name, Domain, Manufacturer, Model,
                                                           TotalPhysicalMemory, NumberOfProcessors,
                                                           UserName (current logged-on user)

Win32_Processor              CPU                           Name, NumberOfCores,
                                                           NumberOfLogicalProcessors,
                                                           MaxClockSpeed, LoadPercentage,
                                                           SocketDesignation

Win32_PhysicalMemory         Physical RAM (sticks)         Capacity, Speed, MemoryType,
                                                           BankLabel, DeviceLocator

Win32_BIOS                   BIOS / UEFI                   Manufacturer, SMBIOSBIOSVersion,
                                                           ReleaseDate, SerialNumber

Win32_BaseBoard              Motherboard                   Manufacturer, Product, SerialNumber,
                                                           Version

Win32_SystemEnclosure        Chassis / form factor         ChassisTypes (1=Other, 3=Desktop,
                                                           8=Notebook, 12=Docking, 23=Blade)

Win32_VideoController        GPU                           Name, AdapterRAM, DriverVersion,
                                                           VideoModeDescription

Win32_SoundDevice            Audio device                  Name, Manufacturer, Status
```

### Disks and Storage

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_DiskDrive              Physical disk                 Model, Size, InterfaceType,
                                                           MediaType, SerialNumber, Status

Win32_DiskPartition          Disk partition                DeviceID, DiskIndex, Index,
                                                           Size, Type, BootPartition

Win32_LogicalDisk            Logical disk (drive letter)   DeviceID, DriveType, Size,
                                                           FreeSpace, FileSystem, VolumeName
                                                           DriveType: 2=Removable, 3=Local,
                                                           4=Network, 5=CD, 6=RAM

Win32_Volume                 Volume (including unmounted)  Name, Capacity, FreeSpace,
                                                           DriveLetter, FileSystem, Label,
                                                           BootVolume, SystemVolume

MSFT_Disk                    Physical disk (modern)        FriendlyName, Size,
(root\Microsoft\Windows\Storage) OperationalStatus, PartitionStyle

MSFT_Partition               Partition (modern)            DriveLetter, Size,
                                                           IsSystem, IsActive

MSFT_Volume                  Volume (modern)               DriveLetter, Size,
                                                           SizeRemaining, FileSystem
```

### Processes and Services

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_Process                Processes                     ProcessId, Name, CommandLine,
                                                           ExecutablePath, ParentProcessId,
                                                           WorkingSetSize, KernelModeTime,
                                                           UserModeTime, CreationDate,
                                                           SessionId, ThreadCount

Win32_Service                Services                      Name, DisplayName, State,
                                                           StartMode, PathName, StartName,
                                                           ProcessId, Description

Win32_StartupCommand         Autorun entries               Name, Command, Location, User
                                                           (Run keys, Startup folders)

Win32_ScheduledJob           Scheduled jobs (AT format)    JobId, Command, RunRepeatedly
                             (legacy AT jobs only)
```

### Networking

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_NetworkAdapter         Network adapters              Name, MACAddress, Speed,
                                                           AdapterType, NetEnabled,
                                                           PhysicalAdapter

Win32_NetworkAdapterConfiguration  Adapter configuration   IPAddress, IPSubnet,
                                                           DefaultIPGateway, MACAddress,
                                                           DNSServerSearchOrder,
                                                           DHCPEnabled, DNSDomain

MSFT_NetIPAddress            IP addresses (modern)         IPAddress, PrefixLength,
(root\StandardCimv2)                                       InterfaceAlias, AddressFamily

MSFT_NetRoute                Routing table (modern)        DestinationPrefix, NextHop,
(root\StandardCimv2)                                       InterfaceAlias, RouteMetric

MSFT_NetTCPConnection        TCP connections (modern)      LocalAddress, LocalPort,
(root\StandardCimv2)                                       RemoteAddress, RemotePort,
                                                           State, OwningProcess

Win32_NetworkConnection      Network connections           LocalName, RemoteName,
                             (mapped drives)               Status, UserName

Win32_Share                  Shared folders                Name, Path, Type, Description,
                                                           AllowMaximum, MaximumAllowed
```

### Users and Security

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_UserAccount            Local user accounts           Name, SID, Disabled, Lockout,
                                                           PasswordRequired, PasswordChangeable,
                                                           PasswordExpires, LocalAccount

Win32_Group                  Local groups                  Name, SID, LocalAccount,
                                                           Description

Win32_GroupUser              Group membership              GroupComponent, PartComponent
                             (association class)

Win32_LoggedOnUser           Currently logged-on users     Antecedent (user account),
                                                           Dependent (logon session)

Win32_LogonSession           Active logon sessions         LogonId, LogonType, StartTime
                                                           LogonType: 2=Interactive,
                                                           3=Network, 4=Batch, 5=Service,
                                                           7=Unlock, 10=RemoteInteractive

Win32_Account                All accounts (users+groups)   Name, SID, SIDType, Domain
```

### Software

```
Class                        Description                   Key Properties
────────────────────────────────────────────────────────────────────────────────
Win32_Product                Installed software (MSI)      Name, Version, Vendor,
                             WARNING: very slow!           InstallDate, InstallLocation
                             Triggers reconfiguration      Caption, IdentifyingNumber
                             of every MSI product.
                             Better to read the registry directly.

Win32_QuickFixEngineering    Installed updates             HotFixID, InstalledOn,
                             (same as Get-HotFix)          Description, InstalledBy

Win32_PnPEntity              Plug and Play devices         Name, DeviceID, Status,
                                                           ClassGuid, Manufacturer
```

---

## Practical Examples

### System Information

```powershell
# Full OS information
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber,
    OSArchitecture, InstallDate, LastBootUpTime,
    @{N="UptimeDays";    E={[math]::Round(((Get-Date) - $_.LastBootUpTime).TotalDays, 1)}},
    @{N="FreeRAM_GB";    E={[math]::Round($_.FreePhysicalMemory / 1MB, 2)}},
    @{N="TotalRAM_GB";   E={[math]::Round($_.TotalVisibleMemorySize / 1MB, 2)}}

# Manufacturer and model
Get-CimInstance Win32_ComputerSystem |
    Select-Object Name, Manufacturer, Model, Domain,
        @{N="RAM_GB"; E={[math]::Round($_.TotalPhysicalMemory/1GB, 1)}}

# CPU in detail
Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer,
    NumberOfCores, NumberOfLogicalProcessors,
    @{N="MaxGHz"; E={[math]::Round($_.MaxClockSpeed/1000, 2)}},
    LoadPercentage, SocketDesignation

# Physical RAM sticks
Get-CimInstance Win32_PhysicalMemory |
    Select-Object BankLabel, DeviceLocator,
        @{N="Capacity_GB"; E={[math]::Round($_.Capacity/1GB, 0)}},
        Speed, MemoryType

# Form factor (laptop or desktop)
$chassis = (Get-CimInstance Win32_SystemEnclosure).ChassisTypes
# 3=Desktop, 4=LowProfile, 8=Notebook, 9=Laptop, 10=Notebook, 12=Docking, 23=Blade
```

### Disks

```powershell
# Logical disks - free space
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Select-Object DeviceID, VolumeName, FileSystem,
        @{N="Total_GB";   E={[math]::Round($_.Size/1GB, 1)}},
        @{N="Free_GB";    E={[math]::Round($_.FreeSpace/1GB, 1)}},
        @{N="Free_Pct";   E={[math]::Round($_.FreeSpace/$_.Size*100, 1)}},
        @{N="Status";     E={
            if ($_.FreeSpace/$_.Size -lt 0.05) {"CRITICAL"}
            elseif ($_.FreeSpace/$_.Size -lt 0.15) {"WARNING"}
            else {"OK"}
        }}

# Physical disks
Get-CimInstance Win32_DiskDrive |
    Select-Object Model, InterfaceType,
        @{N="Size_GB"; E={[math]::Round($_.Size/1GB, 0)}},
        MediaType, SerialNumber, Status

# Partition map
Get-CimInstance Win32_DiskPartition |
    Select-Object DiskIndex, Index, Type,
        @{N="Size_GB"; E={[math]::Round($_.Size/1GB, 1)}},
        BootPartition, PrimaryPartition
```

### Processes

```powershell
# All processes with command lines (important for security)
Get-CimInstance Win32_Process |
    Select-Object ProcessId, Name, CommandLine,
        ExecutablePath, ParentProcessId,
        @{N="RAM_MB"; E={[math]::Round($_.WorkingSetSize/1MB, 1)}},
        CreationDate |
    Sort-Object RAM_MB -Descending

# Find a process by command line
Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%powershell%'"

# Get the owner of a process (requires a method call)
Get-CimInstance Win32_Process -Filter "Name='notepad.exe'" | ForEach-Object {
    $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwner
    [PSCustomObject]@{
        PID     = $_.ProcessId
        Name    = $_.Name
        User    = "$($owner.Domain)\$($owner.User)"
        CmdLine = $_.CommandLine
    }
}

# Process tree (parent-child relationships)
$procs = Get-CimInstance Win32_Process
$procs | ForEach-Object {
    $parent = $procs | Where-Object ProcessId -eq $_.ParentProcessId
    [PSCustomObject]@{
        PID        = $_.ProcessId
        Name       = $_.Name
        ParentPID  = $_.ParentProcessId
        ParentName = $parent.Name
    }
} | Sort-Object ParentName, Name | Format-Table
```

### Networking

```powershell
# IP configuration (active adapters only)
Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" |
    Select-Object Description, MACAddress,
        @{N="IP";      E={$_.IPAddress -join ", "}},
        @{N="Mask";    E={$_.IPSubnet -join ", "}},
        @{N="Gateway"; E={$_.DefaultIPGateway -join ", "}},
        @{N="DNS";     E={$_.DNSServerSearchOrder -join ", "}},
        DHCPEnabled, DNSDomain

# Modern way (MSFT classes)
Get-CimInstance -Namespace root\StandardCimv2 -ClassName MSFT_NetIPAddress |
    Where-Object { $_.AddressFamily -eq 2 } |   # 2=IPv4, 23=IPv6
    Select-Object IPAddress, PrefixLength, InterfaceAlias

# TCP connections with process names
Get-CimInstance -Namespace root\StandardCimv2 -ClassName MSFT_NetTCPConnection |
    Where-Object { $_.State -eq 5 } |   # 5=Established
    Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort,
        @{N="Process"; E={(Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)").Name}},
        OwningProcess

# Shared folders
Get-CimInstance Win32_Share |
    Select-Object Name, Path, Type, Description,
        @{N="TypeName"; E={
            switch ($_.Type) {
                0 {"Disk"}; 1 {"Print"}; 2 {"Device"};
                3 {"IPC"}; 2147483648 {"Admin Disk"}
            }
        }}
```

### Users and Sessions

```powershell
# Local user accounts
Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" |
    Select-Object Name, SID, Disabled, Lockout,
        PasswordRequired, PasswordChangeable, PasswordExpires

# Who is currently logged on
Get-CimInstance Win32_LoggedOnUser | ForEach-Object {
    $session = [wmi]$_.Dependent
    $account = [wmi]$_.Antecedent
    [PSCustomObject]@{
        User      = $account.Name
        Domain    = $account.Domain
        LogonType = $session.LogonType
        LogonId   = $session.LogonId
    }
} | Select-Object -Unique Domain, User, LogonType

# Active logon sessions (with logon type)
Get-CimInstance Win32_LogonSession |
    Select-Object LogonId, StartTime,
        @{N="LogonType"; E={
            @{2="Interactive";3="Network";4="Batch";5="Service";
              7="Unlock";10="RemoteInteractive";11="CachedInteractive"}[$_.LogonType]
        }}
```

### Services via WMI

```powershell
# All services with paths (for security review)
Get-CimInstance Win32_Service |
    Select-Object Name, DisplayName, State, StartMode,
        PathName, StartName, ProcessId |
    Sort-Object State, Name

# Services running under non-standard accounts
Get-CimInstance Win32_Service |
    Where-Object {
        $_.StartName -notmatch "^(LocalSystem|NT AUTHORITY|NT SERVICE)" -and
        $_.State -eq "Running"
    } |
    Select-Object Name, StartName, PathName

# Services with unquoted paths (Unquoted Service Path vulnerability)
Get-CimInstance Win32_Service |
    Where-Object {
        $_.PathName -notmatch '^"' -and
        $_.PathName -match ' ' -and
        $_.PathName -notlike "C:\Windows\*"
    } |
    Select-Object Name, PathName
```

### Autorun

```powershell
# WMI covers some autorun locations
Get-CimInstance Win32_StartupCommand |
    Select-Object Name, Command, Location, User

# Location shows where the entry came from:
# "HKU\<SID>\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
# "Startup"        (user startup folder)
# "Common Startup" (all-users startup folder)
```

---

## WMI Methods: Calling Actions

WMI classes not only read data - they can perform actions through methods.

```powershell
# View methods of a class
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassMethods | Select-Object Name, Parameters

# Terminate a process
$proc = Get-CimInstance Win32_Process -Filter "Name='notepad.exe'"
Invoke-CimMethod -InputObject $proc -MethodName Terminate

# Create a process
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
    -Arguments @{ CommandLine = "cmd.exe /c dir C:\ > C:\out.txt" }
# ReturnValue: 0 = success, 2 = Access Denied, 9 = Path Not Found

# Change a local user password
$user = Get-CimInstance Win32_UserAccount -Filter "Name='alice' AND LocalAccount=True"
Invoke-CimMethod -InputObject $user -MethodName SetPassword `
    -Arguments @{ Password = "NewPassword123!" }

# Control services
$svc = Get-CimInstance Win32_Service -Filter "Name='Spooler'"
Invoke-CimMethod -InputObject $svc -MethodName StopService
Invoke-CimMethod -InputObject $svc -MethodName StartService
Invoke-CimMethod -InputObject $svc -MethodName ChangeStartMode `
    -Arguments @{ StartMode = "Disabled" }

# Win32_OperatingSystem methods
$os = Get-CimInstance Win32_OperatingSystem
Invoke-CimMethod -InputObject $os -MethodName Reboot
Invoke-CimMethod -InputObject $os -MethodName Shutdown
```

---

## WMI Event Subscriptions

WMI supports event subscriptions: notifications about the creation, modification, or deletion of WMI objects, registry changes, file system changes, and even simple timer-based notifications.

There are two kinds of subscriptions:

```
Temporary:
  Live only as long as the PowerShell session is open.
  Register-CimIndicationEvent / Register-WmiEvent
  Used for real-time monitoring inside scripts.

Permanent:
  Stored in the WMI Repository under root\subscription.
  Survive reboots, fire without any user logged on.
  Require three objects: Filter + Consumer + Binding.
  VERY POPULAR WITH ATTACKERS - reliable persistence mechanism.
```

### Temporary Subscriptions (Monitoring)

```powershell
# Monitor new process creation
$query = "SELECT * FROM __InstanceCreationEvent WITHIN 2
          WHERE TargetInstance ISA 'Win32_Process'"

Register-CimIndicationEvent -Query $query -SourceIdentifier "NewProcess" `
    -Action {
        $proc = $Event.SourceEventArgs.NewEvent.TargetInstance
        Write-Host "New process: $($proc.Name) PID=$($proc.ProcessId) CMD=$($proc.CommandLine)"
    }

# Monitor registry changes
$query = "SELECT * FROM RegistryValueChangeEvent
          WHERE Hive='HKEY_LOCAL_MACHINE'
          AND KeyPath='SYSTEM\\CurrentControlSet\\Services'
          AND ValueName='ImagePath'"

Register-WmiEvent -Query $query -SourceIdentifier "RegChange" `
    -Action { Write-Host "Service ImagePath was modified!" }

# View active subscriptions
Get-EventSubscriber

# Remove a subscription
Unregister-Event -SourceIdentifier "NewProcess"
```

### Permanent Subscriptions (and Why They Matter for Security)

```
Three objects in root\subscription:

1. __EventFilter    - the filter: what event to listen for (WQL query)
2. __EventConsumer  - the consumer: what to do when the event fires
   - CommandLineEventConsumer  - execute a command
   - ActiveScriptEventConsumer - run a script (VBScript/JScript)
   - NTEventLogEventConsumer   - write to Event Log
   - SMTPEventConsumer          - send an email
   - LogFileEventConsumer       - write to a text file
3. __FilterToConsumerBinding - links the Filter to the Consumer
```

```powershell
# Example permanent subscription (persistence technique!)
# Run cmd.exe every 60 seconds (shown here to illustrate the mechanics)

# 1. Create the filter
$filterArgs = @{
    Name           = "MyFilter"
    EventNameSpace = "root\CIMV2"
    QueryLanguage  = "WQL"
    Query          = "SELECT * FROM __TimerEvent WHERE TimerID = 'MyTimer'"
}
$filter = New-CimInstance -Namespace root\subscription `
    -ClassName __EventFilter -Property $filterArgs

# 2. Create the timer instruction
$timerArgs = @{
    TimerID                   = "MyTimer"
    IntervalBetweenEvents     = 60000   # milliseconds
}
New-CimInstance -Namespace root\subscription `
    -ClassName __IntervalTimerInstruction -Property $timerArgs

# 3. Create the consumer
$consumerArgs = @{
    Name                = "MyConsumer"
    CommandLineTemplate = "cmd.exe /c whoami > C:\out.txt"
}
$consumer = New-CimInstance -Namespace root\subscription `
    -ClassName CommandLineEventConsumer -Property $consumerArgs

# 4. Bind them together
$bindingArgs = @{
    Filter   = [ref]$filter
    Consumer = [ref]$consumer
}
New-CimInstance -Namespace root\subscription `
    -ClassName __FilterToConsumerBinding -Property $bindingArgs
```

### Detecting Permanent WMI Subscriptions (Blue Team)

```powershell
# Check all persistent event filters
Get-CimInstance -Namespace root\subscription -ClassName __EventFilter |
    Select-Object Name, Query, EventNamespace

# Check all consumers
Get-CimInstance -Namespace root\subscription -ClassName __EventConsumer |
    Select-Object Name, *Command*, *Script*

Get-CimInstance -Namespace root\subscription -ClassName CommandLineEventConsumer |
    Select-Object Name, CommandLineTemplate

Get-CimInstance -Namespace root\subscription -ClassName ActiveScriptEventConsumer |
    Select-Object Name, ScriptText, ScriptFileName

# Check all bindings
Get-CimInstance -Namespace root\subscription -ClassName __FilterToConsumerBinding |
    Select-Object Filter, Consumer

# Remove a suspicious subscription
$filter = Get-CimInstance -Namespace root\subscription -ClassName __EventFilter `
    -Filter "Name='SuspiciousFilter'"
Remove-CimInstance -InputObject $filter

# WMI activity Event Log
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 50 |
    Where-Object { $_.Id -eq 5861 }   # 5861 - permanent subscription detected
```

---

## CimSession: Efficient Remote Queries

```powershell
# Create a session (single TCP connection, reused for multiple queries)
$session = New-CimSession -ComputerName Server01

# With alternate credentials
$cred    = Get-Credential
$session = New-CimSession -ComputerName Server01 -Credential $cred

# Multiple machines
$sessions = New-CimSession -ComputerName "Server01", "Server02", "Server03"

# Reuse the session for multiple queries
Get-CimInstance Win32_OperatingSystem -CimSession $session
Get-CimInstance Win32_LogicalDisk     -CimSession $session
Get-CimInstance Win32_Process         -CimSession $session

# Query multiple sessions at once (runs in parallel)
Get-CimInstance Win32_OperatingSystem -CimSession $sessions |
    Select-Object PSComputerName, Caption, LastBootUpTime

# Session management
Get-CimSession          # list active sessions
Remove-CimSession $session

# Force DCOM transport instead of WS-Man
$opt     = New-CimSessionOption -Protocol Dcom
$session = New-CimSession -ComputerName Server01 -SessionOption $opt
```

---

## wmic.exe — The WMI Command-Line Interface

`wmic.exe` is the built-in WMI CLI tool. Deprecated in Windows 11 but still functional and commonly seen in scripts and attack tools.

```cmd
:: Basic syntax
wmic <alias> [where <filter>] get <property> [/format:<fmt>]

:: OS information
wmic os get Caption, Version, BuildNumber, LastBootUpTime

:: Processes
wmic process list brief
wmic process where "name='notepad.exe'" get ProcessId, CommandLine
wmic process where "ProcessId=1234" delete     <- terminate a process

:: Services
wmic service list brief
wmic service where "name='Spooler'" get Name, State, PathName, StartName
wmic service where "name='Spooler'" call StartService
wmic service where "name='Spooler'" call StopService

:: Disks
wmic logicaldisk where "DriveType=3" get DeviceID, Size, FreeSpace, FileSystem

:: Installed software
wmic product get Name, Version, Vendor, InstallDate

:: Installed updates
wmic qfe get HotFixID, InstalledOn, Description

:: User accounts
wmic useraccount list brief

:: Network adapters
wmic nic get Name, MACAddress, Speed, NetEnabled

:: Remote machine queries
wmic /node:Server01 os get Caption, Version
wmic /node:Server01 /user:domain\admin /password:pass process list brief

:: Output formats
wmic os get Caption /format:csv
wmic os get Caption /format:value    <- key=value format
wmic os get Caption /format:list     <- vertical list
wmic os get Caption /format:htable   <- HTML table

:: Get all properties
wmic os get /format:list
```

---

## WMI Security

### WMI as an Attack Vector

```
WMI is used by attackers for:

1. Reconnaissance (Discovery):
   Get-CimInstance Win32_ComputerSystem  - machine name, domain
   Get-CimInstance Win32_UserAccount     - local user accounts
   Get-CimInstance Win32_Share           - shared folders
   Get-CimInstance Win32_Process         - running processes
   Standard technique - hard to distinguish from legitimate admin activity.

2. Lateral Movement (WMI Exec):
   Invoke-CimMethod -ClassName Win32_Process -MethodName Create
       -Arguments @{ CommandLine = "powershell.exe -enc ..." }
       -ComputerName TargetPC
   PsExec equivalent, but fully built-in.
   Does not create a new service.
   Process runs in Session 0.

3. Persistence (WMI Subscriptions):
   Permanent subscriptions in root\subscription.
   Survive reboots.
   Fire without any user logged on.
   Hard to find without a deliberate check.

4. Exfiltration via WMI:
   Data is encoded and stored in WMI object properties.
   Read from another machine via WMI query.
   C2 channel over WMI (attacker machine → WMI → target).

MITRE ATT&CK:
   T1047       - Windows Management Instrumentation (exec)
   T1546.003   - Event Subscription (persistence)
```

### Protecting and Monitoring WMI

```
WMI Access Control:
  WMI uses its own DACL (separate from NTFS).
  Configure: wmimgmt.msc → right-click "WMI Control" → Properties → Security

  Default permissions:
    Administrators: full access to all namespaces
    NETWORK SERVICE: limited access
    LOCAL SERVICE: limited access

  Minimum required rights for remote WMI access:
    - Enable Account  (to connect to the namespace)
    - Remote Enable   (to allow remote access)
    - Read Security   (optional)

Firewall rules for WMI:
  DCOM (Get-WmiObject): TCP 135 + dynamic ports → hard to allow precisely
  WS-Man (Get-CimInstance): TCP 5985/5986 → easy to control

WMI Activity Logging:
  Log: Microsoft-Windows-WMI-Activity/Operational
  EventID 5857 - provider loaded
  EventID 5858 - provider error
  EventID 5859 - new persistent filter created (!! possible attack)
  EventID 5860 - temporary subscription created
  EventID 5861 - permanent subscription fired (!! important!)

Detecting WMI-based attacks:
  1. Check root\subscription for unexpected objects
  2. Monitor EventID 5861 in WMI-Activity/Operational
  3. WmiPrvSE.exe (WMI Provider Host) spawning child processes
     → classic sign of WMI exec
  4. Sysmon EventID 19/20/21 - WMI Activity (if Sysmon is installed)
     19 - WmiEventFilter activity
     20 - WmiEventConsumer activity
     21 - WmiEventConsumerToFilter activity
```

---

## WMI Repository: On-Disk Structure

```
C:\Windows\System32\wbem\
├── Repository\
│   ├── OBJECTS.DATA        - main WMI database (objects, class definitions)
│   ├── INDEX.BTR           - B-Tree index
│   ├── MAPPING1.MAP        - page mapping table
│   ├── MAPPING2.MAP        - backup mapping table
│   └── MAPPING3.MAP
├── wbemcore.dll            - WMI core engine
├── cimwin32.dll            - Win32_* class provider
├── wmiprvse.exe            - WMI Provider Host process
├── wmic.exe                - CLI tool
├── mof\                    - MOF files (class definitions)
│   ├── cimwin32.mof
│   └── ...
└── AutoRecover\            - MOF files used to rebuild the repository
```

```
MOF (Managed Object Format):
  Text language for describing and registering WMI classes.
  When software is installed, its WMI classes are registered via MOF files.
  MOF compiler: mofcomp.exe

  mofcomp.exe myclass.mof   - register a class

  Attackers use mofcomp to register malicious subscriptions:
  mofcomp.exe malicious.mof
```

```
Rebuilding the WMI Repository:
  If WMI stops working or the repository is corrupted:

  1. Stop winmgmt:
     net stop winmgmt

  2. Reset the repository:
     winmgmt /resetrepository

  3. Re-register providers:
     for /f %s in ('dir /b /s %windir%\system32\wbem\*.dll') do regsvr32 /s %s
     for /f %s in ('dir /b /s %windir%\system32\wbem\*.mof') do mofcomp %s

  4. Start winmgmt:
     net start winmgmt
```

---

## Discovering Classes and Properties

```powershell
# Find classes by keyword
Get-CimClass -ClassName "*disk*"     -Namespace root\CIMV2
Get-CimClass -ClassName "*network*"  -Namespace root\CIMV2
Get-CimClass -ClassName "*user*"     -Namespace root\CIMV2

# All classes in a namespace
Get-CimClass -Namespace root\CIMV2 | Where-Object CimClassName -like "Win32_*" |
    Select-Object CimClassName | Sort-Object CimClassName

# Properties of a specific class
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassProperties |
    Select-Object Name, CimType, Qualifiers |
    Sort-Object Name

# Methods of a class
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassMethods

# Interactive browser
# Win+R → wbemtest → Connect → root\CIMV2 → OK
# Enumerate Classes → browse the full WMI schema interactively
```

---

## Cheat Sheet

```
Architecture:
  winmgmt (in svchost.exe) - the WMI service
  WMI Repository - C:\Windows\System32\wbem\Repository\
  wmiprvse.exe - WMI Provider Host (spawned by winmgmt)
  cimwin32.dll - Win32_* class provider

Key namespaces:
  root\CIMV2             - Win32_* classes (primary)
  root\StandardCimv2     - MSFT_Net* (networking, modern)
  root\Microsoft\Windows\Storage - MSFT_Disk, MSFT_Volume
  root\SecurityCenter2   - antivirus, firewall products
  root\subscription      - permanent subscriptions (! attack target !)

WMI vs CIM:
  Get-WmiObject    → Get-CimInstance   (DCOM → WS-Man)
  ManagementObject → CimInstance
  Old, deprecated  → new, recommended

Key classes:
  Win32_OperatingSystem    - OS version, uptime, free RAM
  Win32_ComputerSystem     - name, domain, RAM, manufacturer
  Win32_Processor          - CPU, cores, load %
  Win32_LogicalDisk        - drives, free space (DriveType=3)
  Win32_Process            - processes, CommandLine, PID, owner
  Win32_Service            - services, PathName, StartName
  Win32_NetworkAdapterConfiguration - IP, MAC, DNS, DHCP
  Win32_UserAccount        - local user accounts
  Win32_LogonSession       - active logon sessions

CimSession:
  New-CimSession -ComputerName / -Credential
  Get-CimInstance -CimSession $session
  Remove-CimSession

Methods:
  Invoke-CimMethod -InputObject $obj -MethodName "Terminate"
  Invoke-CimMethod -ClassName Win32_Process -MethodName "Create" -Arguments @{...}

WMI Subscriptions (persistence!):
  root\subscription: __EventFilter + __EventConsumer + __FilterToConsumerBinding
  Check: Get-CimInstance -Namespace root\subscription -ClassName __EventFilter
  EventID 5861 in Microsoft-Windows-WMI-Activity/Operational

Security:
  WmiPrvSE.exe spawning child processes = suspicious
  Sysmon EventID 19/20/21 = WMI activity
  wbemtest.exe = interactive WMI class browser
```

---

## References

- [Microsoft Docs: WMI](https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmi-start-page) - official WMI documentation
- [WMI Explorer](https://github.com/vinaypamnani/wmie2) - GUI browser for WMI classes
- [MITRE ATT&CK: T1047](https://attack.mitre.org/techniques/T1047/) - WMI for lateral movement
- [MITRE ATT&CK: T1546.003](https://attack.mitre.org/techniques/T1546/003/) - WMI Event Subscriptions persistence
- [Sysmon config](https://github.com/SwiftOnSecurity/sysmon-config) - configuration for detecting WMI attacks
- [Investigating WMI Attacks](https://www.mandiant.com/resources/reports) - Mandiant research on WMI in attacks
