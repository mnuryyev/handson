---
title: "Windows - Event Log (Security, System, Application)"
date: "2026-05-13"
---

Event Log is the centralized logging system of Windows. The operating system, drivers, services, and applications write structured records to it about what is happening: errors, warnings, user logons, policy changes, service failures. Without understanding Event Log you cannot diagnose problems or investigate incidents.

---

## Where the Logs Are Stored

```
Log files live here physically:
C:\Windows\System32\winevt\Logs\

Main files:
├── Application.evtx       - Application log
├── Security.evtx          - Security log
├── System.evtx            - System log
├── Setup.evtx             - Setup log
├── Microsoft-Windows-*    - hundreds of specialized channels
│   ├── TaskScheduler%4Operational.evtx
│   ├── PowerShell%4Operational.evtx
│   ├── TerminalServices-LocalSessionManager%4Operational.evtx
│   └── ...
└── ForwardedEvents.evtx   - events forwarded from other machines

File format: .evtx (binary XML format, introduced in Vista)
Old format:  .evt  (pre-Vista, pre-Windows Server 2003)
```

```
Registry keys for log configuration:
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\

Each log has its own subkey:
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Security\
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\System\
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Application\

Important values in each subkey:
  File        - path to the .evtx file
  MaxSize     - maximum log size (bytes)
  Retention   - overwrite policy
```

---

## Event Structure

```
Every event in the log contains the following fields:

┌─────────────────────────────────────────────────────────────────┐
│ Log Name:      Security                                          │
│ Source:        Microsoft-Windows-Security-Auditing              │
│ Date:          2026-05-12 14:32:11                               │
│ Event ID:      4624                                              │
│ Task Category: Logon                                             │
│ Level:         Information                                       │
│ Keywords:      Audit Success                                     │
│ User:          SYSTEM                                            │
│ Computer:      DC01.contoso.com                                  │
│ Description:   An account was successfully logged on.           │
│                                                                  │
│ Subject:                                                         │
│   Security ID:      SYSTEM                                       │
│   Account Name:     DC01$                                        │
│   Account Domain:   CONTOSO                                      │
│   Logon ID:         0x3E7                                        │
│                                                                  │
│ Logon Information:                                               │
│   Logon Type:       3                                            │
│   ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

```
Field descriptions:

Log Name       - which log it belongs to (Security / System / Application / ...)
Source         - who generated the event (app, service, OS component)
Event ID       - numeric identifier of the event type
                 The same Event ID always means the same thing
Task Category  - event category within the source
Level          - severity:
                   Information  - normal operation
                   Warning      - potential problem
                   Error        - something broke
                   Critical     - critical failure (used rarely)
                   Verbose      - detailed output (in operational logs)
Keywords       - event tags:
                   Audit Success  - action succeeded (audited)
                   Audit Failure  - attempt failed (audited)
                   Classic        - old-style event
User           - user context in which the event was generated
Computer       - name of the machine where the event occurred
Description    - text description + XML data (EventData)
```

```
Inside each event there is an XML structure with data fields (EventData).
This is the most useful part - it holds the details:
usernames, IP addresses, operation types, file paths, and so on.

Example XML for event 4624:
<Event>
  <System>
    <EventID>4624</EventID>
    <TimeCreated SystemTime="2026-05-12T14:32:11.123456789Z"/>
    <Computer>DC01.contoso.com</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-18</Data>
    <Data Name="SubjectUserName">DC01$</Data>
    <Data Name="SubjectDomainName">CONTOSO</Data>
    <Data Name="TargetUserSid">S-1-5-21-...-1234</Data>
    <Data Name="TargetUserName">alice.smith</Data>
    <Data Name="TargetDomainName">CONTOSO</Data>
    <Data Name="LogonType">3</Data>
    <Data Name="IpAddress">192.168.1.55</Data>
    <Data Name="IpPort">49152</Data>
    <Data Name="WorkstationName">WKS001</Data>
    <Data Name="AuthenticationPackageName">Kerberos</Data>
  </EventData>
</Event>
```

---

## The Three Main Logs

### Security Log

```
Purpose:  security auditing - who logged on, who did what, who tried and failed.
Source:   Microsoft-Windows-Security-Auditing
Written by: Windows kernel only (Local Security Authority, LSA)
            No application can write to Security on its own

Two types of records:
  Audit Success  - action succeeded (green lock icon)
  Audit Failure  - attempt failed   (red lock icon)

What controls what gets written: Audit Policy
  Without an enabled Audit Policy - Security Log is empty!

File location:
  C:\Windows\System32\winevt\Logs\Security.evtx

Default size: 20 MB (too small! DCs need at least 1-4 GB)
```

```
Audit categories and what they log:

Account Logon
  - Kerberos authentication (on DC)
  - NTLM authentication (on DC)
  - Credential validation

Logon/Logoff
  - Interactive logon/logoff
  - Network logon
  - Remote Desktop
  - Screensaver lock/unlock

Account Management
  - User creation/deletion/modification
  - Password changes
  - Group creation/deletion
  - Adding/removing from groups

Directory Service Access (DC only)
  - Access to AD objects
  - Modification of AD objects

Object Access
  - File access (if SACL is set on files)
  - Registry access
  - Printer access

Policy Change
  - Audit policy changes
  - User rights changes
  - IPSec / Kerberos policy changes

Privilege Use
  - Use of privileges (SeDebugPrivilege, SeTakeOwnershipPrivilege, etc.)

Process Tracking
  - Process creation and termination
  - DLL loading
  - Process activity

System
  - Startup/shutdown
  - System time change
  - Security Log cleared (important!)
```

### System Log

```
Purpose:  events from the Windows kernel, drivers, and system services.
          Hardware problems, service failures, network events.
Source:   Windows components, drivers, services

What is interesting there:
  - Service start and stop (Service Control Manager)
  - Driver failures
  - Disk errors
  - Network configuration changes
  - NTP time synchronization
  - Group Policy application
  - BSOD (Stop Error) - entry written before reboot
  - Unexpected reboots / shutdowns
  - Time changes (critical for Kerberos!)

Location: C:\Windows\System32\winevt\Logs\System.evtx
Default size: 20 MB
```

### Application Log

```
Purpose:  events from applications and software components.
Source:   any application that can write to Event Log

What gets written there:
  - Microsoft SQL Server - errors, start/stop
  - IIS - errors, warnings (though IIS also has its own logs)
  - .NET Framework - unhandled exceptions
  - COM/DCOM errors
  - Windows Installer - application installs/removals
  - Antivirus agents, monitoring agents

Key point: ANY application can write to Application Log.
           The Source field tells you who wrote it.
           The same Event ID from different Sources means different things!

Location: C:\Windows\System32\winevt\Logs\Application.evtx
Default size: 20 MB
```

### Setup Log

```
Purpose:  events from Windows installation and component setup.
Source:   Windows Setup, Windows Update

What is there:
  - Installation / removal of Windows roles and features
  - Installation of Windows Updates
  - OS installation phases

Location: C:\Windows\System32\winevt\Logs\Setup.evtx
```

---

## Specialized Channels (Operational Logs)

```
Beyond the four classic logs, Windows contains hundreds of
specialized channels. They live in:
C:\Windows\System32\winevt\Logs\

And in Event Viewer: Applications and Services Logs -> Microsoft -> Windows

The most useful for diagnostics and investigations:
```

```
Microsoft-Windows-PowerShell/Operational
  - PowerShell commands (if Script Block Logging is enabled)
  - Module loading
  - Script execution errors
  File: ...PowerShell%4Operational.evtx

Microsoft-Windows-PowerShell/Admin
  - Critical PowerShell engine errors

Microsoft-Windows-TaskScheduler/Operational
  - Scheduled task start and completion
  - Task execution errors
  File: ...TaskScheduler%4Operational.evtx

Microsoft-Windows-TerminalServices-LocalSessionManager/Operational
  - RDP session connect/disconnect
  - Shadow sessions
  File: ...TerminalServices-LocalSessionManager%4Operational.evtx

Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational
  - Incoming RDP connections
  - Network Level Authentication (NLA)

Microsoft-Windows-WinRM/Operational
  - WinRM (PowerShell Remoting) sessions
  - Inbound and outbound connections

Microsoft-Windows-Bits-Client/Operational
  - BITS jobs (background file transfer)
  - Frequently abused by malware to download payloads

Microsoft-Windows-DNS-Client/Operational
  - DNS queries from the client (very detailed)
  - Useful for investigating C2 communications

Microsoft-Windows-Sysmon/Operational
  - If Sysmon (Sysinternals) is installed
  - Process creation, network connections, registry changes
  - Gold standard for threat hunting
```

---

## Audit Policy

```
Security Log empty or nearly empty = Audit Policy is not configured.
This is the most common reason for missing events.

Two ways to configure Audit Policy:

1. Basic Audit Policy (legacy)
   GPO: Computer Configuration -> Windows Settings ->
        Security Settings -> Local Policies -> Audit Policy
   9 categories, coarse-grained control

2. Advanced Audit Policy (recommended)
   GPO: Computer Configuration -> Windows Settings ->
        Security Settings -> Advanced Audit Policy Configuration
   58 subcategories, fine-grained control
   Introduced in Windows Vista / Server 2008

View current audit policy:
  auditpol /get /category:*           - all categories
  auditpol /get /subcategory:*        - all subcategories
  auditpol /get /subcategory:"Logon"  - specific subcategory

Output example:
  Machine Name: DC01
  System audit policy
  Category/Subcategory        Setting
  Logon/Logoff
    Logon                     Success and Failure
    Logoff                    Success
  Account Logon
    Kerberos Authentication Service  Success and Failure
```

```
Minimum recommended settings (Advanced Audit Policy):

Account Logon:
  Credential Validation              - Success, Failure
  Kerberos Authentication Service    - Success, Failure
  Kerberos Service Ticket Operations - Success, Failure

Account Management:
  User Account Management            - Success, Failure
  Security Group Management          - Success, Failure
  Computer Account Management        - Success, Failure

Logon/Logoff:
  Logon                              - Success, Failure
  Logoff                             - Success
  Special Logon                      - Success
  Account Lockout                    - Failure

Object Access:
  File System                        - Success, Failure (only on critical folders via SACL)

Policy Change:
  Audit Policy Change                - Success, Failure

Privilege Use:
  Sensitive Privilege Use            - Success, Failure

Process Tracking (optional, noisy):
  Process Creation                   - Success

DS Access (DC only):
  Directory Service Access           - Success, Failure
  Directory Service Changes          - Success
```

---

## Most Important Event IDs

### Security Log - Authentication and Logon

```
4624  Successful logon
      Fields: TargetUserName, LogonType, IpAddress, WorkstationName, AuthenticationPackage
      LogonType values:
        2  = Interactive (physical console logon)
        3  = Network (SMB, UNC, mapped drives)
        4  = Batch (scheduled tasks)
        5  = Service (service account logon)
        7  = Unlock (screen unlock)
        8  = NetworkCleartext (WinRM with Basic, IIS Basic Auth)
        9  = NewCredentials (runas /netonly)
        10 = RemoteInteractive (RDP)
        11 = CachedInteractive (logon with cached credentials when DC is unreachable)

4625  Failed logon attempt
      Fields: TargetUserName, FailureReason, Status, SubStatus
      Status/SubStatus codes:
        0xC000006A = wrong password
        0xC0000064 = user does not exist
        0xC0000234 = account locked out
        0xC0000072 = account disabled
        0xC000006F = logon outside allowed hours
        0xC0000070 = restricted workstation
        0xC0000193 = account expired
        0xC0000071 = password expired

4634  Session ended (Logoff)
      Correlated with 4624 via LogonID

4647  User-initiated logoff

4648  Logon with explicit credentials (runas, network drive with different credentials)
      Fields: TargetUserName, TargetServerName, TargetInfo

4672  Special privileges assigned to new logon
      Occurs right after 4624 for privileged accounts
      Fields: SubjectUserName, PrivilegeList
      Seeing SeDebugPrivilege, SeImpersonatePrivilege here is interesting

4768  Kerberos TGT request (AS-REQ / AS-REP) - DC only
      Fields: TargetUserName, IpAddress, TicketEncryptionType, Status
      EncryptionType 0x17 (RC4) = potential Kerberoasting / AS-REP roasting

4769  Kerberos Service Ticket request (TGS-REQ) - DC only
      Fields: ServiceName, TicketEncryptionType, IpAddress
      EncryptionType 0x17 + ServiceName not krbtgt = suspicious Kerberoasting

4771  Failed Kerberos TGT request (pre-auth failed)
      Fields: ClientAddress, FailureCode
      Many 4771 from one IP = Kerberos brute force

4776  NTLM authentication attempt - DC only
      Fields: TargetUserName, Workstation, Status
      Even if Kerberos is used overall, pass-through auth is visible here
```

### Security Log - Account Management

```
4720  User account created
      Fields: SubjectUserName (who created), TargetUserName (who was created)

4722  Account enabled

4723  Attempt to change password (user changing their own)
      Fields: TargetUserName, SubjectUserName

4724  Attempt to reset password (admin resetting someone else's)
      Fields: TargetUserName, SubjectUserName

4725  Account disabled

4726  Account deleted

4738  Account changed
      Fields: TargetUserName + list of changed attributes

4740  Account locked out
      Fields: TargetUserName, CallerComputerName (which machine sent the failed attempt)
      CallerComputerName helps trace the lockout source

4767  Account unlocked

4781  Account renamed

4732  User added to a group (Security Group)
      Fields: MemberName, GroupName, SubjectUserName

4733  User removed from a group

4727  Global Security Group created
4731  Local Security Group created
4754  Universal Group created

4728  Added to global group
4729  Removed from global group
4756  Added to Universal group
```

### Security Log - System and Policies

```
1102  Security Log cleared
      Fields: SubjectUserName
      Log clearing is a serious signal!
      Should never happen on a normal machine

4616  System time changed
      Fields: SubjectUserName, PreviousTime, NewTime
      Time changes can break Kerberos

4697  New service installed
      Fields: ServiceName, ServiceFileName, ServiceStartType, SubjectUserName
      New service = potential persistence mechanism

4698  Scheduled task created
4699  Scheduled task deleted
4702  Scheduled task modified
      Fields: TaskName, SubjectUserName, TaskContent

4688  New process created
      (requires Process Creation audit to be enabled)
      Fields: NewProcessName, ProcessId, ParentProcessId, CommandLine (if enabled)
      CommandLine logging is separate - enable via GPO or registry

4689  Process terminated

4657  Registry value modified
      (requires SACL on the registry key)
      Fields: ObjectName, OldValue, NewValue

4663  Attempt to access an object (file, registry, AD object)
      (requires SACL on the object)

4670  Object permissions changed (ACL modified)

4907  Object audit settings changed (SACL modified)
```

### System Log - Key Events

```
7045  New service installed
      (duplicate of Security 4697, but visible without audit policy)
      Fields: ServiceName, ImagePath, ServiceType, StartType, ServiceAccount

7036  Service changed state (started / stopped)
      Fields: ServiceName, param2 (running / stopped)

7034  Service terminated unexpectedly (crashed)

7031  Service terminated unexpectedly, restart attempts will be made

6005  Event Log service started (= system booted)

6006  Event Log service stopped (= clean system shutdown)

6008  Previous shutdown was unexpected (BSOD / power loss)
      Fields: time (timestamp of last normal event before crash)

41    System was rebooted without a clean shutdown
      (Kernel-Power) - sudden power loss or BSOD

1074  System shutdown / reboot initiated
      Fields: who initiated it, reason, type (shutdown/reboot)

4199  IP address conflict detected

20    Disk error

4226 / 4227  Time service problems (W32Time)
```

### Application Log - Key Events

```
Source: MsiInstaller
  1033  Application installation completed
  1034  Application removal completed
  11707 / 11708  MSI installation succeeded / failed

Source: Windows Error Reporting
  1001  Crash report (application crashed)
        Fields: AppName, AppPath, ModuleName
        Useful for diagnosing repeated crashes

Source: .NET Runtime
  1026  Unhandled .NET application exception
        Fields: stack trace

Source: Application Error
  1000  Application crash
        Fields: AppName, AppVersion, ModuleName, FaultOffset

Source: MSSQLSERVER (SQL Server)
  17111 SQL Server started
  18452 Failed SQL Server login
  33090 SQL Server stopped
```

---

## Event Viewer Interface

```
Launch: eventvwr.msc  (or Win+R -> eventvwr)

Tree structure in Event Viewer:

Event Viewer (Local)
├── Custom Views                  <- custom filters (very handy!)
│   ├── Administrative Events    <- shows Warning+Error from all logs
│   └── (your filters)
├── Windows Logs
│   ├── Application
│   ├── Security
│   ├── Setup
│   ├── System
│   └── Forwarded Events
└── Applications and Services Logs
    ├── Hardware Events
    ├── Internet Explorer
    ├── Microsoft
    │   └── Windows
    │       ├── PowerShell
    │       │   ├── Admin
    │       │   └── Operational
    │       ├── TaskScheduler
    │       │   └── Operational
    │       ├── TerminalServices-LocalSessionManager
    │       │   └── Operational
    │       └── ...hundreds more...
    └── Subscriptions
```

```
Filtering events in Event Viewer:

Right-click on log -> Filter Current Log

Filter fields:
  Logged:      date range (Last hour / 12 hours / 24 hours / 7 days / 30 days / Custom)
  Event level: Critical / Error / Warning / Information / Verbose
  Event sources: specific source (e.g. Security-Auditing)
  Event IDs:   4624, 4625, 4740   (comma-separated or range 4620-4640)
  Computer:    machine name (for Forwarded Events)
  User:        specific user (via XML filter)

XML filter (more powerful than GUI):
  XML tab -> Edit query manually -> paste XPath query

Example XPath: find Event 4625 for a specific user
<QueryList>
  <Query Id="0" Path="Security">
    <Select Path="Security">
      *[System[EventID=4625]]
      and
      *[EventData[Data[@Name='TargetUserName']='alice.smith']]
    </Select>
  </Query>
</QueryList>
```

---

## Log Size and Overwrite Policy

```
By default Windows is configured very conservatively.
For serious systems these defaults are not sufficient.

Configure via GPO:
Computer Configuration -> Administrative Templates ->
Windows Components -> Event Log Service -> Security (or System/Application)

Parameters:
  Maximum Log Size (KB)           - maximum log size
  Log Access                      - access rights to the log
  Retain old events               - behavior when full

Behavior when full (three modes):
  Overwrite events as needed      - overwrite oldest events (default)
  Archive log when full           - archive when full, then start fresh
  Do not overwrite events         - never overwrite (risky - log will simply stop recording)

Recommended sizes:
  Security.evtx on a DC       - 4 GB minimum, 16 GB is better
  Security.evtx on a server   - 512 MB - 1 GB
  Security.evtx on a client   - 128 - 256 MB
  System.evtx                 - 128 - 256 MB
  Application.evtx            - 128 - 256 MB
```

```
Why small logs are a problem:

During an attack on a DC with active auditing, Security Log can fill up
at 100 MB+ per hour.
With the 20 MB default size, the entire log gets overwritten in about 12 minutes.
That means attack traces can be permanently lost.

Set via registry directly (equivalent to GPO):
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Security\
  MaxSize = 0x40000000  (1 GB in hex = 1073741824 bytes)

HKLM\SYSTEM\CurrentControlSet\Services\EventLog\System\
  MaxSize = 0x8000000   (128 MB)
```

---

## Centralized Logging - Windows Event Forwarding

```
Windows Event Forwarding (WEF) is the built-in mechanism for forwarding events
from many machines to a centralized collector.

Without WEF: you have to log into each machine and look at logs locally.
With WEF:    all events are collected on a single Windows Event Collector (WEC) server,
             visible under "Forwarded Events" in Event Viewer.

Architecture:
  ┌──────────────────────────────────────────────────────────────┐
  │  Source Machines (tens or thousands)                         │
  │  WKS001, WKS002, SERVER01, DC01 ...                          │
  └──────────────┬───────────────────────────────────────────────┘
                 │ WinRM (port 5985 / 5986)
                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Windows Event Collector (WEC)                               │
  │  One or more collector servers                               │
  │  C:\Windows\System32\winevt\Logs\ForwardedEvents.evtx        │
  └──────────────────────────────────────────────────────────────┘

Two subscription modes:
  Collector-Initiated: the collector polls source machines
  Source-Initiated:    sources push events, configured via GPO
  In practice Source-Initiated via GPO is more common.

Important to understand:
  WEF is just a transport layer. To search collected logs you need
  an additional tool: a SIEM (Splunk, Elastic, Sentinel) or
  at minimum PowerShell / wevtutil on the collector.
```

---

## Tools for Working with Logs

### Event Viewer (GUI)

```
Built into Windows.
Sufficient for one-off diagnostics and viewing individual events.
Inconvenient for analyzing large volumes or searching across multiple machines.
```

### wevtutil (command line)

```
wevtutil is the built-in command-line tool for Event Log management.

# List all logs
wevtutil el

# Information about a log (size, event count)
wevtutil gl Security

# Export log to file
wevtutil epl Security C:\backup\security.evtx

# Clear a log (with archiving)
wevtutil cl Security /bu:C:\backup\security_backup.evtx

# Query events (text output)
wevtutil qe Security /q:"*[System[EventID=4624]]" /c:10 /f:text

# Query with XPath filter
wevtutil qe Security /q:"*[System[(EventID=4625) and TimeCreated[timediff(@SystemTime) <= 3600000]]]"
# timediff in milliseconds: 3600000 = 1 hour

# View log on a remote machine
wevtutil qe Security /r:SERVER01 /u:admin /p:password
```

### Sysmon (Sysinternals)

```
Sysmon (System Monitor) - a free Sysinternals/Microsoft tool.
Installed as a Windows driver and service.
Writes detailed events to:
  Microsoft-Windows-Sysmon/Operational

What Sysmon logs (selected events):
  Event 1   - Process Create (with full CommandLine and hashes)
  Event 2   - File creation time changed
  Event 3   - Network Connection (TCP/UDP with the initiating process)
  Event 4   - Sysmon service state changed
  Event 5   - Process Terminated
  Event 6   - Driver Loaded (with hash)
  Event 7   - Image Loaded (DLL with hash)
  Event 8   - CreateRemoteThread (code injection!)
  Event 10  - Process Access (OpenProcess - LSASS dump!)
  Event 11  - File Created
  Event 12/13/14 - Registry changes
  Event 15  - File stream created (ADS - Alternate Data Streams)
  Event 17/18 - Named Pipe
  Event 22  - DNS Query (process + queried name)
  Event 23  - File Deleted

Sysmon Event 10 (ProcessAccess) with TargetImage=lsass.exe
almost always means a credential dumping attempt (Mimikatz and equivalents).
```

---

## Practical Scenarios

### Investigating Failed Logons and Account Lockouts

```
Scenario: user alice.smith is locked out. Where are the attempts coming from?

What to look for:
1. Event 4740 (Account Locked Out) on DC
   -> CallerComputerName field = name of the machine sending the attempts

2. Event 4625 (Failed Logon) on DC and on the machine from step 1
   -> fields: IpAddress, WorkstationName, LogonType

3. If LogonType = 3 (Network) - check scheduled tasks,
   services, mapped drives with saved credentials on that machine

Typical lockout causes:
  - Old password in a scheduled task
  - Service running as the user with an outdated password
  - Mobile device with a cached password
  - Application with hardcoded credentials
  - Actual brute force attack
```

### Investigating a Suspicious Logon

```
Scenario: logon detected at 3am from an unusual country

What to look for in Security Log:
1. Event 4624 with LogonType 10 (RDP) or 3 (Network)
   -> fields: IpAddress, TargetUserName, LogonID

2. Using the LogonID, find Event 4647 or 4634 (when they logged off)
   -> calculate session duration

3. Event 4672 after 4624 -> were there any privileges?

4. Event 4688 (Process Creation) with the same LogonID
   -> what was launched in this session?

5. In Microsoft-Windows-TerminalServices-LocalSessionManager/Operational:
   -> Event 21 (Logon), 23 (Logoff), 24 (Disconnect), 25 (Reconnect)
   -> full RDP session history with IP addresses is visible there
```

### Detecting a New Persistence Mechanism

```
Scenario: a suspicious service appeared on a machine

What to look for:
1. Security Log - Event 4697 (Service installed)
   -> ServiceName, ServiceFileName, SubjectUserName

2. System Log - Event 7045 (New service installed)
   -> same information, duplicated without needing audit policy enabled

3. Security Log - Event 4698 (Scheduled task created)
   -> TaskName, TaskContent (contains XML with the actual command!)

4. Application Log - MsiInstaller Event 1033
   -> if installed via MSI

For ServiceFileName check:
   - non-standard path (not C:\Windows\System32\)?
   - name looks like a legitimate binary but slightly altered (svchost32.exe)?
   - path contains temp, appdata, users?
```

---

## Event ID Cheat Sheet

```
AUTHENTICATION
  4624  Successful logon
  4625  Failed logon
  4634  Logoff
  4647  User-initiated logoff
  4648  Logon with explicit credentials
  4672  Privileged session opened
  4768  Kerberos TGT request (DC)
  4769  Kerberos ST request (DC)
  4771  Kerberos pre-auth failed (DC)
  4776  NTLM authentication (DC)
  4740  Account locked out
  4767  Account unlocked

ACCOUNT MANAGEMENT
  4720  User created
  4722  Account enabled
  4723  User changes own password
  4724  Admin resets password
  4725  Account disabled
  4726  Account deleted
  4738  Account modified
  4732  Added to group
  4733  Removed from group

SYSTEM / PROCESSES
  4688  Process created (requires audit)
  4689  Process terminated
  4697  New service installed
  4698  Scheduled task created
  4616  System time changed
  1102  Security Log cleared (!)

SYSTEM LOG
  7045  New service (no audit needed)
  7036  Service started/stopped
  6005  System started
  6006  Clean shutdown
  6008  Unexpected shutdown
  1074  Initiated shutdown/reboot

SYSMON (if installed)
  1     Process creation
  3     Network connection
  8     CreateRemoteThread (injection!)
  10    Process access (lsass dump!)
  22    DNS query
```

---

## References

- [Windows Security Log Encyclopedia](https://www.ultimatewindowssecurity.com/securitylog/encyclopedia/) - full Event ID reference
- [Audit Policy Recommendations](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/audit-policy-recommendations) - Microsoft recommendations
- [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - installation and documentation
- [NSA Event Forwarding Guidance](https://github.com/nsacyber/Event-Forwarding-Guidance) - what to collect via WEF
- [EVTX Attack Samples](https://github.com/sbousseaden/EVTX-ATTACK-SAMPLES) - real attack log examples
- [Advanced Audit Policy](https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/advanced-security-auditing-faq) - full audit policy guide
