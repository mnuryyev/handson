---
title: "Windows - Services and SCM (Service Control Manager)"
date: "2026-05-13"
---

A Windows Service is a background process that runs independently of any user session. Services can start before any user logs in, run under special system accounts, and automatically restart after failures. The closest Linux equivalent is a systemd unit.

The SCM (Service Control Manager) is the system process `services.exe` that manages the entire lifecycle of services: starting, stopping, registering, and tracking their state.

---

## Why Services Exist

Regular process vs service:

```
Regular process:
- Lives only while a user session is open
- Terminates when the user logs off
- Runs with the user's privileges
- No automatic restart on failure

Service:
- Starts before any user logs in (or without a user at all)
- Keeps running after the user logs off
- Can run as SYSTEM, LOCAL SERVICE, NETWORK SERVICE
- Supports automatic restart on failure
- Has declared dependencies on other services
- Integrated with SCM and the Event Log
```

Typical examples: Windows Defender, Print Spooler, Windows Update, DHCP Client, DNS Client, Remote Desktop Services.

---

## Service Control Manager (SCM)

The SCM is `%SystemRoot%\System32\services.exe`. It is one of the first processes started during Windows boot and lives for the entire system uptime.

### What SCM does

```
1. Reads the service list from the registry at boot time
   HKLM\SYSTEM\CurrentControlSet\Services\

2. Starts services in the correct order (respecting dependencies)

3. Tracks the state of every service

4. Accepts control commands (start, stop, pause, continue)
   - from users via services.msc / sc.exe / PowerShell
   - from services themselves (e.g. a service reports that it finished initializing)

5. Reacts to failures (recovery actions):
   - restart the service
   - run a program
   - reboot the computer

6. Logs to the System Event Log
   EventID 7034 - service crashed unexpectedly
   EventID 7035 - start/stop command was sent
   EventID 7036 - service entered running/stopped state
   EventID 7040 - service start type changed
   EventID 7045 - a new service was installed (important for security!)
```

### How SCM communicates with services

SCM and a service communicate through a dedicated mechanism: when SCM launches the service process it passes a handle through which the service registers its ServiceMain function and sends status updates. The service must notify SCM of a successful start within a timeout (default 30 seconds), otherwise SCM considers the start failed.

```
Service startup lifecycle:

SCM                              Service (process)
 │                                     │
 │  CreateProcess(ImagePath)           │
 │────────────────────────────────────►│
 │                                     │  ServiceMain() is called
 │                                     │  Service initializes
 │                                     │  RegisterServiceCtrlHandler()
 │◄─ SetServiceStatus(START_PENDING) ──│
 │                                     │  ... continues initialization ...
 │◄─ SetServiceStatus(RUNNING) ────────│
 │                                     │
 │  Service is up, monitoring...       │
 │                                     │
 │  SCM: Stop                          │
 │────────────────────────────────────►│
 │◄─ SetServiceStatus(STOP_PENDING) ───│
 │◄─ SetServiceStatus(STOPPED) ────────│
```

---

## Service Registry Keys

Every service is described in the registry. This is the primary configuration store.

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\
```

### Key parameters

```
Parameter         Type            Value / Description
──────────────────────────────────────────────────────────────────────────
ImagePath         REG_EXPAND_SZ   Path to the executable (or driver)
                                  Example: "C:\Windows\System32\svchost.exe -k netsvcs"
                                  Example: "\SystemRoot\System32\drivers\tcpip.sys"

DisplayName       REG_SZ          Human-readable name (shown in services.msc)
                                  Example: "Windows Update"

Description       REG_SZ          Service description text

ObjectName        REG_SZ          Account the service runs as
                                  "LocalSystem"                  = SYSTEM
                                  "NT AUTHORITY\LocalService"
                                  "NT AUTHORITY\NetworkService"
                                  "DOMAIN\svc-account"           = domain account

Start             REG_DWORD       Start type:
                                  0 = Boot    - driver loaded by the kernel at boot
                                  1 = System  - driver loaded after the kernel
                                  2 = Auto    - automatically at Windows startup
                                  3 = Manual  - on demand
                                  4 = Disabled - cannot start

Type              REG_DWORD       Service type:
                                  1  = Kernel Driver
                                  2  = File System Driver
                                  16 = Win32 Own Process      (separate process)
                                  32 = Win32 Shared Process   (svchost, multiple services in one process)
                                  256 = Interactive Process   (can show UI on desktop - obsolete)

ErrorControl      REG_DWORD       What to do if the service fails to start:
                                  0 = Ignore  - ignore the error
                                  1 = Normal  - log the error and continue
                                  2 = Severe  - revert to Last Known Good Configuration if possible
                                  3 = Critical - reboot the system

DependOnService   REG_MULTI_SZ    Services that must be running before this one starts
DependOnGroup     REG_MULTI_SZ    Service groups that must have at least one member running

Group             REG_SZ          Service group membership (controls load ordering)
```

### Failure/recovery parameters

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\

FailureActions    REG_BINARY      Encoded SC_ACTION structure:
                                  - Action 1 (after first failure)
                                  - Action 2 (after second failure)
                                  - Action 3 (after subsequent failures)
                                  Possible actions:
                                    SC_ACTION_NONE         - do nothing
                                    SC_ACTION_RESTART      - restart the service
                                    SC_ACTION_REBOOT       - reboot the computer
                                    SC_ACTION_RUN_COMMAND  - run a command

FailureCommand    REG_SZ          Command to run for SC_ACTION_RUN_COMMAND

ResetPeriod       REG_DWORD       Seconds after which the failure counter resets
```

### Security and additional subkeys

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Parameters\
    - Service-specific settings (each service has its own)

HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Security\
    Security    REG_BINARY    Security descriptor (DACL) for the service object itself
                              Controls who can manage this service (start/stop/change config)
```

---

## Start Types - In Depth

```
Boot (0):
  Used only by kernel-mode drivers.
  Loaded by the Windows kernel before SCM starts.
  Example: disk filter drivers, kernel-level antivirus drivers.

System (1):
  Used only by drivers.
  Loaded by SCM at the very beginning (Session 0 phase).
  Example: file system drivers.

Automatic (2):
  Started automatically by SCM at boot.
  Two variants exist:
    - Regular Auto:         starts during system boot
    - Delayed Auto Start:   starts some time AFTER the boot phase ends
                            (registry parameter: DelayedAutostart = 1)
  Example: Windows Update, Print Spooler, DHCP Client.

Manual (3):
  Not started automatically.
  Started on demand - by another service, an application, or a user.
  Example: Windows Search.

Disabled (4):
  Cannot be started by any means until the type is changed.
  Used to disable unnecessary or unwanted services.
```

```
Why Delayed Auto Start matters:
With regular Auto, all services start simultaneously at boot → the system
is heavily loaded before the Desktop even appears.
Delayed allows non-critical services to start after the logon screen is shown,
spreading the load over time.

Registry parameter:
HKLM\SYSTEM\CurrentControlSet\Services\<Name>\DelayedAutostart = 1
```

---

## Service Accounts

The account a service runs under determines its privileges in the system and on the network.

### Built-in accounts

```
LocalSystem (SYSTEM):
  ObjectName: "LocalSystem" or ".\LocalSystem"
  - Highest privileges on the local machine
  - Accesses the network as <COMPUTERNAME>$
  - Has full access to all local resources
  - Use only when genuinely required
  - Example services: Windows Defender, BITS

LocalService (LOCAL SERVICE):
  ObjectName: "NT AUTHORITY\LocalService"
  - Reduced privileges (less than a regular user)
  - Accesses the network anonymously
  - Suitable for services that do not need network authentication
  - Example: Windows Time, LightweightDirectory Access Client

NetworkService (NETWORK SERVICE):
  ObjectName: "NT AUTHORITY\NetworkService"
  - Reduced local privileges
  - Accesses the network as <COMPUTERNAME>$ (like SYSTEM does)
  - Suitable for services that need Kerberos-authenticated network access
  - Example: DNS Client, Remote Procedure Call (RPC)
```

### Managed Service Accounts (MSA) and Group Managed Service Accounts (gMSA)

```
MSA (Managed Service Account):
  - Tied to a single computer
  - Password managed automatically by AD (128 characters, rotated every 30 days)
  - No one needs to know the password - AD syncs it
  - Supports automatic SPN registration
  - Name format: DOMAIN\accountname$
  - In the registry ObjectName: "DOMAIN\accountname$"

gMSA (Group Managed Service Account):
  - Works across multiple computers (a group of machines)
  - Same automatic password management
  - Used for clusters, NLB farms, IIS farms
  - Requires Windows Server 2012+ DC
  - The recommended replacement for regular service accounts

Regular domain account (not recommended):
  - Password must be known and entered at installation
  - Password can expire - causing the service to fail
  - If the password is stolen the blast radius is higher
  - Use only when MSA/gMSA is not an option
```

### Principle of least privilege for services

```
Preference order (most secure to least secure):

1. gMSA / MSA                    - best choice for most services
2. NetworkService                 - when network authentication is needed
3. LocalService                   - when network is not needed
4. Regular domain account         - only when MSA is not applicable
5. LocalSystem                    - only when full local privilege is required

Never run services as Domain Admin!
```

---

## Service Types: Own Process vs Shared Process (svchost)

Most built-in Windows services do not live in their own process - they are packaged as DLLs and loaded inside `svchost.exe`.

### Own Process (Type = 16)

```
The service has its own exe and runs as a separate process.

ImagePath: "C:\Program Files\MyApp\myservice.exe"

Every such process appears as a separate entry in Task Manager.
Examples: SQL Server, Apache, nginx as a service.
```

### Shared Process - svchost (Type = 32)

```
The service is implemented in a DLL and loaded into svchost.exe.
Multiple services share the same svchost process.

The service's ImagePath: "C:\Windows\System32\svchost.exe -k <GroupName>"

The real service code is pointed to in a subkey:
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Parameters\
    ServiceDll    REG_EXPAND_SZ    "C:\Windows\System32\wuaueng.dll"

svchost groups are defined in:
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Svchost\
    netsvcs       REG_MULTI_SZ    (list of services in the netsvcs group)
    LocalService  REG_MULTI_SZ    (list of services in the LocalService group)
    ...
```

### svchost isolation in Windows 10 / Server 2019+

```
Before Windows 10 1703 / Server 2016:
  Many services per svchost process. A single crash or DLL compromise
  affected all services in the same group.

Starting with Windows 10 1703 on machines with ≥3.5 GB RAM:
  Each service gets its own dedicated svchost process.
  This is called SvcHost Split or Service Isolation.
  It became much harder to hide malicious DLLs among system services.

How to see what is running in which svchost:
  tasklist /svc                    - lists services per process
  services.msc → process properties → file path
  Process Explorer (Sysinternals)  - best option, shows everything
```

---

## Service States

```
SERVICE_STOPPED          - stopped
SERVICE_START_PENDING    - starting up
SERVICE_STOP_PENDING     - shutting down
SERVICE_RUNNING          - running normally
SERVICE_CONTINUE_PENDING - resuming from pause
SERVICE_PAUSE_PENDING    - pausing
SERVICE_PAUSED           - paused (not all services support this)

Not all transitions are valid. For example:
  RUNNING → STOP_PENDING → STOPPED
  STOPPED → START_PENDING → RUNNING
  RUNNING → PAUSE_PENDING → PAUSED → CONTINUE_PENDING → RUNNING
```

---

## Service Dependencies

A service can declare that it requires other services or service groups to be running before it can start. SCM enforces the correct startup order.

```
DependOnService:
  Specific named services. If a dependency cannot start, this service
  will also fail to start.

DependOnGroup:
  A group of services. It is enough for at least one member of the group
  to be running.

Example: Workstation (lanmanworkstation) depends on:
  - NSI  (Network Store Interface)
  - MRxSmb20 (SMB2 Mini-Redirector)
  - Bowser (Network Browser Driver)
```

```
View dependencies:
  services.msc → right-click service → Properties → Dependencies tab
  sc qc <servicename>          - shows DependOnService
  Get-Service <name> | Select-Object -ExpandProperty DependentServices
  Get-Service <name> | Select-Object -ExpandProperty ServicesDependedOn
```

---

## Service Security: DACL on the Service Object

Every service has its own Security Descriptor, separate from the security on the exe file. It is stored in the registry:

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Security\
    Security    REG_BINARY    (binary DACL)
```

The DACL on the service object controls who can:

```
SERVICE_QUERY_CONFIG           - read the service configuration
SERVICE_CHANGE_CONFIG          - modify configuration (start type, ImagePath!)
SERVICE_QUERY_STATUS           - read the current status
SERVICE_ENUMERATE_DEPENDENTS   - list dependent services
SERVICE_START                  - start the service
SERVICE_STOP                   - stop the service
SERVICE_PAUSE_CONTINUE         - pause or resume
SERVICE_INTERROGATE            - query current status
SERVICE_USER_DEFINED_CONTROL   - send custom control codes

SERVICE_ALL_ACCESS             - all of the above
```

```
Security note:
  SERVICE_CHANGE_CONFIG granted to a non-privileged user = critical vulnerability!
  An attacker can change ImagePath to point to a malicious executable.
  The next service restart runs the malware with the service's privileges.

View service DACL:
  sc sdshow <servicename>
  Output is an SDDL string (Security Descriptor Definition Language)

Example SDDL interpretation:
  D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)            - SYSTEM: full access
     (A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)   - Administrators: full access
     (A;;CCLCSWLOCRRC;;;IU)                 - Interactive Users: start/stop/query

Check all services for over-permissive ACLs (Sysinternals):
  accesschk.exe -uwcv Everyone *
  accesschk.exe -uwcv "Users" *
```

---

## ImagePath and the Unquoted Service Path Vulnerability

A classic security issue - paths without quotes (Unquoted Service Path).

```
If ImagePath contains spaces and is NOT quoted:
  C:\Program Files\My Company\MyService\myservice.exe

Windows parses this left to right, treating each token as a potential path:
  1. C:\Program.exe                               <- if it exists - runs it!
  2. C:\Program Files\My.exe                      <- if it exists - runs it!
  3. C:\Program Files\My Company\MyService.exe    <- if it exists - runs it!
  4. C:\Program Files\My Company\MyService\myservice.exe  <- intended target

Attack: create C:\Program.exe or C:\Program Files\My.exe
→ it runs instead of the real service, with the service's privileges!

Correct:
  ImagePath: "\"C:\Program Files\My Company\MyService\myservice.exe\""
  or (stored with quotes in the registry):
  ImagePath: "C:\Program Files\My Company\MyService\myservice.exe"

Find vulnerable services:
  wmic service get name,pathname | findstr /i /v "C:\Windows\\" | findstr /i /v "\""
```

---

## Files on Disk

Beyond the registry, services leave traces in several locations:

```
Executables:
  C:\Windows\System32\         - built-in Windows services
  C:\Windows\SysWOW64\         - 32-bit system components on 64-bit Windows
  C:\Windows\System32\drivers\ - kernel-mode drivers (.sys files)
  C:\Program Files\            - third-party services (64-bit)
  C:\Program Files (x86)\      - third-party services (32-bit)

Logs:
  Windows Event Log (source: Service Control Manager):
  C:\Windows\System32\winevt\Logs\System.evtx
  EventID 7034 - service crashed unexpectedly
  EventID 7036 - service started or stopped
  EventID 7045 - a new service was installed

  Application-specific logs (each service has its own):
  C:\Windows\System32\LogFiles\
  C:\ProgramData\<ProductName>\Logs\
  C:\Windows\Logs\
```

---

## Driver Signing and Kernel Security

Kernel-mode services (drivers) run in Ring 0 and have complete access to the system.

```
Starting with Windows 10 in Secure Boot mode:
  All drivers must be signed by Microsoft (WHQL or EV certificate).
  Unsigned drivers = load refused.

Test Signing Mode:
  Developer mode allowing unsigned drivers.
  bcdedit /set testsigning on     <- enable (requires reboot)
  bcdedit /set testsigning off    <- disable

Driver Signature Enforcement can be bypassed for one session via
F8 boot menu → Disable Driver Signature Enforcement.
Attackers actively look for ways to permanently bypass signing → rootkits.

Check for test signing mode:
  bcdedit /enum | findstr testsigning
  When enabled, the desktop shows a "Test Mode" watermark.

Kernel Patch Protection (PatchGuard):
  In 64-bit Windows - protects critical kernel data structures from patching.
  Always active, cannot be disabled through supported interfaces.
```

---

## How Services Load at Boot

The boot sequence is important for understanding what happens before a user even sees the logon screen.

```
Phase 1 - UEFI/BIOS and bootloader:
  bootmgr → winload.exe (or winload.efi)
  Loads the kernel (ntoskrnl.exe) and HAL (hal.dll) into memory.

Phase 2 - Kernel initialization:
  ntoskrnl.exe initializes base subsystems.
  Loads Boot drivers (Start=0) from the registry CurrentControlSet\Services.
  Examples: disk.sys, storport.sys, volmgr.sys.

Phase 3 - System drivers:
  System drivers (Start=1) are loaded.
  Disk partitions are mounted, the file system comes online.
  Examples: ntfs.sys, tcpip.sys.

Phase 4 - Session 0, SCM starts:
  smss.exe → wininit.exe → services.exe (SCM)
  SCM starts all Auto services in dependency order.
  At this point there is no Desktop or Explorer yet.

Phase 5 - User logon:
  winlogon.exe → LogonUI → userinit.exe → explorer.exe
  Programs from Run/RunOnce keys launch.
  Delayed Auto Start services launch after this point.
```

```
The "Last Known Good Configuration" concept:
  HKLM\SYSTEM\ stores multiple ControlSets:
    ControlSet001        - first set (often = current)
    ControlSet002        - second set (often = last successful boot)
    CurrentControlSet    - symbolic link to the active one

  After a successful boot, the current ControlSet is marked as "Last Known Good".
  Booting with F8 → "Last Known Good Configuration":
    Windows switches to the last successful ControlSet,
    rolling back driver and service changes that may have broken the system.
```

---

## Managing Services - Tools

### services.msc - graphical console

```
Launch: Win+R → services.msc

Capabilities:
  - View all services: name, status, start type, account
  - Start, stop, restart, pause
  - Change start type
  - Configure failure actions (Recovery tab)
  - View dependencies
  - Change logon account (Log On tab)

Does not show:
  - Kernel-mode drivers in a useful way
  - The raw ImagePath from the registry
```

### sc.exe - the primary CLI tool

```
sc - Service Control - direct SCM API access from the command line.

Key commands:
  sc query                      - list running services
  sc query type= all            - all services including stopped ones
  sc query <name>               - state of a specific service
  sc qc <name>                  - service configuration (mirrors registry)
  sc start <name>               - start
  sc stop <name>                - stop
  sc config <name> start= auto  - change start type
  sc config <name> obj= "NT AUTHORITY\LocalService"  - change account
  sc create <name> binPath= "C:\path\svc.exe"        - create a service
  sc delete <name>              - delete a service
  sc sdshow <name>              - show service DACL in SDDL format
  sc sdset <name> <SDDL>        - set service DACL
  sc failure <name> reset= 3600 actions= restart/5000/restart/10000  - configure recovery

Important: the space after = is mandatory in sc.exe!
  sc config myservice start= auto   <- correct
  sc config myservice start=auto    <- ERROR
```

### tasklist /svc

```
tasklist /svc
  Shows: PID, process name, and which services are hosted in it.
  Particularly useful for svchost.exe - see which services share which PID.

Example output:
  svchost.exe    1234    DcomLaunch, PlugPlay, Power
  svchost.exe    2345    AudioSrv, Audiosrv
  svchost.exe    3456    wuauserv, WaaSMedicSvc
```

---

## Services in a Security Context

### Common attack vectors

```
1. Overwriting ImagePath (if SERVICE_CHANGE_CONFIG is granted):
   The attacker changes the executable path to a malicious one.
   Next service restart → malware runs with the service's privileges.

2. Replacing the executable file:
   If the service exe file has weak write permissions,
   the attacker replaces it with a malicious binary.

3. Unquoted Service Path (described above):
   Creating C:\Program.exe or a similar file at an intercepted path.

4. DLL Hijacking in svchost services:
   A service loads a DLL from an insecure path.
   The attacker places a malicious DLL earlier in the search order.

5. Malicious service as persistence mechanism:
   sc create MalSvc binPath= "C:\malware.exe" start= auto
   EventID 7045 in System log is the indicator of a new service installation.
   One of the most common indicators of compromise to hunt for.
```

### What to look for during an investigation

```
In the registry:
  HKLM\SYSTEM\CurrentControlSet\Services\
  Suspicious signs:
  - Unfamiliar service names
  - ImagePath pointing to TEMP, AppData, or the root of a drive
  - ImagePath with spaces and no quotes (UQP vulnerability)
  - ObjectName = LocalSystem for a service that does not need it
  - Service with Type=32 (svchost) but no ServiceDll under Parameters

In the Event Log:
  System.evtx:
    EventID 7045 - new service installed (possible persistence)
    EventID 7034 - service crashed unexpectedly
    EventID 7040 - start type changed

On disk:
  Service executables outside C:\Windows\ and C:\Program Files\
  .exe or .dll files in unusual locations (Temp, AppData, C:\ root)

Service DACLs:
  Run accesschk.exe (Sysinternals):
    accesschk.exe -uwcv "Users" *        - Users group rights on services
    accesschk.exe -uwcv Everyone *       - Everyone rights
  Find services where unprivileged users have
  SERVICE_CHANGE_CONFIG or GENERIC_WRITE.
```

---

## Cheat Sheet

```
SCM = services.exe
  - reads service config from the registry
  - starts services in order (respecting dependencies)
  - monitors state, reacts to failures
  - accepts commands from sc.exe / services.msc / PowerShell

Service registry location:
  HKLM\SYSTEM\CurrentControlSet\Services\<Name>\
    ImagePath       - path to exe / dll
    Start           - 0=Boot, 1=System, 2=Auto, 3=Manual, 4=Disabled
    Type            - 16=OwnProcess, 32=SharedProcess(svchost)
    ObjectName      - run-as account
    DependOnService - dependencies

Accounts (safest to most privileged):
  LocalService       - minimal rights, no network auth
  NetworkService     - minimal rights, network auth as ComputerName$
  gMSA / MSA         - auto-rotating password, best practice
  LocalSystem        - maximum rights (use sparingly)

Start types:
  Auto              - at system startup
  Delayed Auto      - after the Desktop loads (DelayedAutostart=1)
  Manual            - on demand
  Disabled          - cannot start

svchost and ServiceDll:
  Type 32 = service lives inside svchost.exe
  Actual code: Parameters\ServiceDll
  svchost groups: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Svchost\

Security - what to check:
  Unquoted Service Path    - spaces in ImagePath without quotes
  Weak service DACL        - accesschk.exe -uwcv Everyone *
  Non-standard ImagePath   - outside Windows\ and Program Files\
  EventID 7045             - new service installed (possible persistence)

Tools:
  services.msc             - GUI management
  sc.exe                   - CLI, direct SCM access
  tasklist /svc            - which services are in which PID (svchost)
  accesschk.exe            - check service DACLs
  Process Explorer         - full picture of processes and their services
```

---

## References

- [Microsoft Docs: Services](https://learn.microsoft.com/en-us/windows/win32/services/services) - official Windows Services API documentation
- [Microsoft Docs: SCM](https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager) - Service Control Manager
- [Sysinternals: accesschk](https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk) - check service permissions
- [Sysinternals: Process Explorer](https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer) - process and service analysis
- [MITRE ATT&CK: New Service](https://attack.mitre.org/techniques/T1543/003/) - persistence via services
- [MITRE ATT&CK: Unquoted Service Path](https://attack.mitre.org/techniques/T1574/009/) - privilege escalation via UQP
