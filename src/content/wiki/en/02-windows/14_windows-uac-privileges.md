---
title: "Windows - UAC and Privilege Escalation Mechanisms"
date: "2026-05-13"
---

UAC (User Account Control) is a Windows mechanism that separates normal user work from administrative actions. Even if a user is a member of the Administrators group, their processes run with stripped-down privileges by default. Administrative actions require explicit confirmation. Understanding UAC is critical for both administration and security - most attacks on a local system relate in some way to bypassing this mechanism.

---

## The Problem UAC Solves

```
Before UAC existed (pre-Vista) the situation was:

User logs in as Administrator
-> Every process launched - browser, text editor, email client -
   runs with full Administrator rights
-> User visits a malicious site - browser downloads and runs malware
-> Malware runs with Administrator rights
-> Full system compromise

UAC solves this through token splitting:
  Administrator logs in -> Windows creates TWO tokens:
    Filtered Token  (standard) - no privileges, no Admins membership
    Elevated Token  (full)     - all privileges, full Admins membership

  Normal work runs through the Filtered Token
  Elevation is requested explicitly - only then is the Elevated Token issued
```

---

## UAC Architecture

### Access Tokens

```
An Access Token is a kernel data structure attached to every process and thread.
Contains: user SID, group SIDs, privileges, integrity level.

When an administrator logs in, two tokens are created:

Filtered Token (restricted):
  - Groups removed: Administrators, Backup Operators, and other
    privileged groups (they exist in the list but are marked USE_FOR_DENY_ONLY)
  - Dangerous privileges removed: SeDebugPrivilege, SeImpersonatePrivilege, etc.
  - Integrity Level: Medium
  - This is the token used for Explorer and all child processes

Full / Elevated Token:
  - All groups active
  - All privileges present
  - Integrity Level: High
  - Issued only after UAC elevation (with user confirmation)

For a standard user (non-administrator):
  - Only one token is created
  - Integrity Level: Medium
  - No privileged groups
  - Elevation requires entering administrator credentials
```

### Integrity Levels (IL)

```
Integrity Level (IL) is the Mandatory Integrity Control (MIC) mechanism
added in Windows Vista. Every object and every process has an integrity level.
A process cannot write to an object with a higher IL than itself.

Levels (from lowest to highest):

Untrusted (0x0000)
  - Anonymous processes
  - Almost no access to resources

Low (0x1000)
  - Protected Mode browsers (IE Protected Mode, Edge sandbox)
  - Sandbox processes
  - Can only write to Low IL folders:
    %USERPROFILE%\AppData\Local\Temp\Low\
    %USERPROFILE%\AppData\LocalLow\
  - Cannot write to the desktop or user registry hive

Medium (0x2000)
  - Standard level for regular users
  - Standard level for restricted administrators (Filtered Token)
  - Explorer, Office, browser (not sandboxed)
  - Can read/write the user profile
  - Cannot write to HKLM, Program Files, Windows

High (0x3000)
  - Elevated processes (UAC elevation)
  - Processes launched "as administrator"
  - Can write to HKLM, Program Files, Windows
  - Can interact with System-level processes through some APIs

System (0x4000)
  - Windows service processes (SYSTEM account)
  - Kernel drivers
  - Full access to system resources

Protected (0x5000)
  - Protected processes (antivirus, DRM)
  - Anti-Malware Light (PPL) processes
  - lsass.exe in Protected Process Light mode

Where an object's IL is stored:
  In the object's security descriptor, in the SACL
  Special ACE of type SYSTEM_MANDATORY_LABEL_ACE
```

```
Practical implications of IL:

A Medium IL process CANNOT:
  - Write to C:\Windows\, C:\Program Files\
  - Write to HKLM\SOFTWARE\
  - Modify system files
  - Launch another process at High IL without UAC

A High IL process CAN:
  - All of the above
  - Read memory of Medium processes
  - Inject into Medium processes (if privileges are present)

A Low IL process CANNOT:
  - Communicate with Medium processes via IPC
  - Write to most filesystem locations
  - Send window messages to most other processes (UIPI protection)
```

### UIPI (User Interface Privilege Isolation)

```
UIPI is a mechanism that prevents processes with lower IL from
sending window messages to processes with higher IL.

Without UIPI:
  Malware at Low IL could:
  - Send WM_SETTEXT to the UAC dialog and type arbitrary text
  - Simulate clicking the "Yes" button
  - Get privilege elevation without the user noticing

With UIPI:
  A Low IL process cannot send Windows messages to a Medium or High IL process
  The UAC dialog runs on the isolated Secure Desktop
```

---

## Secure Desktop

```
Secure Desktop is a separate desktop object in which
the UAC confirmation dialog is displayed.

Normal user desktop: WinSta0\Default
UAC Secure Desktop:  WinSta0\Winlogon

Why this matters:
  Only processes at System IL run on the Secure Desktop.
  No user process (including malware) can:
  - Take a screenshot of the Secure Desktop
  - Type text into Secure Desktop fields
  - Simulate button clicks
  - "See" the content of the dialog

When the UAC dialog is shown:
  1. The screen dims (this is the switch to Secure Desktop)
  2. The dialog is drawn in the Winlogon desktop
  3. User clicks "Yes" or "No"
  4. Control returns to the Default desktop

If UAC is configured to "not dim" (prompt on normal desktop):
  Secure Desktop is disabled - this reduces security
  Malware can interact with the dialog via the UI Automation API
```

---

## UAC Elevation - The Process

### What Happens When You Run "As Administrator"

```
When the user clicks "Run as administrator"
or a process requests elevation via ShellExecute with "runas":

1. Windows checks the executable's manifest
   (requestedExecutionLevel in the embedded XML manifest)

2. Application Information Service (AIS) - appinfo.dll service -
   receives the elevation request

3. A new consent.exe process is created
   Consent.exe runs on the Secure Desktop under the SYSTEM account

4. Consent.exe checks:
   - Executable's signature (signed by Microsoft or a trusted publisher?)
   - UAC policy settings

5. Depending on the UAC policy:
   - Shows a confirmation dialog (Yes/No for Admin)
   - Or requests credentials (for standard user)
   - Or silently elevates (Auto-elevation)

6. On confirmation: a new process is created with the Elevated Token

Key components:
  consent.exe    - UAC dialog process (runs as SYSTEM)
  appinfo.dll    - Application Information Service
  shell32.dll    - ShellExecute/ShellExecuteEx (initiates the request)
  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\ - UAC config
```

### Application Manifest and requestedExecutionLevel

```
Every executable (.exe) may contain an embedded XML manifest.
It declares the required privilege level:

<trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
  <security>
    <requestedPrivileges>
      <requestedExecutionLevel
        level="asInvoker"           <- run at the same level as the parent
        uiAccess="false"/>
    </requestedPrivileges>
  </security>
</trustInfo>

Level values:
  asInvoker           - run with the same token as the launching process
                        (no UAC dialog)
  highestAvailable    - request the highest available level
                        (Admin -> High; standard user -> Medium; no dialog)
  requireAdministrator - REQUIRES elevation
                        (always triggers UAC dialog unless Auto-elevation applies)

If the manifest is absent:
  Windows applies heuristics (Installer Detection):
  If the filename contains setup, install, update, patch - may request elevation
  Otherwise - treated as asInvoker

View a file's manifest:
  sigcheck.exe -m <file.exe>   (Sysinternals)
  mt.exe -inputresource:<file.exe> -manifest   (Windows SDK)
  Resource Hacker (GUI)
```

### UAC Modes (Policy Settings)

```
UAC has several configuration levels. Stored in registry:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\

Key parameters:
  EnableLUA                    = 1  (0 = completely disable UAC - very bad!)
  ConsentPromptBehaviorAdmin   - behavior for Administrators
  ConsentPromptBehaviorUser    - behavior for standard Users
  PromptOnSecureDesktop        - use Secure Desktop (1) or not (0)

ConsentPromptBehaviorAdmin values:
  0 = Elevate without prompting        (Auto-elevate, no dialog - insecure)
  1 = Prompt for credentials on secure desktop
  2 = Prompt for consent on secure desktop     <- stricter default
  3 = Prompt for credentials
  4 = Prompt for consent
  5 = Prompt for consent for non-Windows binaries  <- DEFAULT (less strict)

ConsentPromptBehaviorUser values:
  0 = Automatically deny elevation requests  (user cannot get elevation)
  1 = Prompt for credentials on secure desktop  <- recommended
  3 = Prompt for credentials  <- DEFAULT

Preset levels in GUI (secpol.msc or Control Panel):

Always notify (maximum protection):
  ConsentPromptBehaviorAdmin = 2
  PromptOnSecureDesktop = 1

Notify only for app changes (DEFAULT):
  ConsentPromptBehaviorAdmin = 5
  PromptOnSecureDesktop = 1

Notify for app changes without Secure Desktop (less protection):
  ConsentPromptBehaviorAdmin = 5
  PromptOnSecureDesktop = 0

Never notify (UAC essentially disabled):
  ConsentPromptBehaviorAdmin = 0
  EnableLUA = 1 (still technically enabled, but no dialog shown)
```

---

## Auto-Elevation

```
Auto-elevation is a mechanism by which SOME executables
elevate AUTOMATICALLY without showing a UAC dialog.

Auto-elevation conditions (all three must be true):
  1. Executable is signed by Microsoft (not third-party!)
  2. Located in a "trusted directory": C:\Windows\, C:\Windows\System32\
  3. Manifest declares level="highestAvailable" or "requireAdministrator"
     AND the special autoElevate=true flag is set in the manifest

Examples of auto-elevate binaries:
  C:\Windows\System32\eventvwr.exe   (Event Viewer)
  C:\Windows\System32\mmc.exe        (Microsoft Management Console)
  C:\Windows\System32\CompMgmt.exe
  C:\Windows\System32\fodhelper.exe
  C:\Windows\System32\sdclt.exe
  C:\Windows\System32\cleanmgr.exe

Check autoElevate in manifest:
  sigcheck.exe -m C:\Windows\System32\eventvwr.exe | findstr autoElevate

Why this matters for attacks:
  Auto-elevate binaries are GOLD for UAC bypass techniques.
  If an attacker can make such a binary execute their code -
  they get High IL without a UAC dialog.
  This is why most UAC bypass techniques are built around auto-elevate EXEs.
```

---

## UAC Bypass Techniques

```
Important to understand: UAC bypass is NOT a vulnerability in Microsoft's view.
Microsoft considers UAC a "convenience feature" not a "security boundary".
This means UAC bypass techniques are NOT patched as critical vulnerabilities.

All bypass techniques work only if:
  - The attacker is already running code as an administrator user
    (but at Medium IL, i.e. via the Filtered Token)
  - UAC is NOT set to the maximum level (which is usually the case)

Main technique classes:
```

### 1. COM Object Hijacking / Registry Hijacking

```
Concept:
  An auto-elevate binary at startup looks something up in the registry.
  Search order: HKCU first (user can write without elevation!),
  then HKLM.
  If the right value is planted in HKCU - the binary picks it up.

Classic example - eventvwr.exe:
  1. eventvwr.exe launches (auto-elevate, High IL, no dialog)
  2. Looks up the file association for MSC files in the registry
  3. First checks HKCU\Software\Classes\mscfile\shell\open\command
  4. In HKCU the user CAN write (Medium IL is enough)
  5. Attacker writes a path to their program there
  6. eventvwr.exe launches that program at High IL

After the attack the key should be cleaned up, otherwise MSC files break.

Other binaries with similar technique:
  fodhelper.exe      -> HKCU\Software\Classes\ms-settings\shell\open\command
  sdclt.exe          -> HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\control.exe
  ComputerDefaults.exe -> HKCU\Software\Classes\ms-settings\shell\open\command
```

### 2. DLL Hijacking via Auto-Elevate EXE

```
Concept:
  An auto-elevate EXE when loading looks for a DLL.
  If a replacement DLL exists in a folder next to the EXE
  (or in PATH before System32) - the EXE loads it at High IL.

Example:
  C:\Windows\System32\cleanmgr.exe looks for dismapi.dll
  If a malicious dismapi.dll is placed in a user-writable directory
  that appears in PATH before System32 - cleanmgr loads it at High IL.

Limitation: requires a user-writable directory that comes before System32 in PATH.
  Such locations are becoming rare on hardened systems.
```

### 3. Elevated COM Objects

```
Concept:
  Some COM objects are registered as "Elevation Moniker" -
  they can be created at High IL from a Medium process.
  If such a COM object has a method for executing commands -
  it is a ready-made UAC bypass.

How it works:
  HKLM\SOFTWARE\Classes\CLSID\{...}\Elevation\Enabled = 1
  This marks the COM object as "elevatable"
  When created via CoCreateInstance with CLSCTX_LOCAL_SERVER -
  Windows shows UAC (or elevates silently if the object is Microsoft-signed)

Example - ICMLuaUtil interface:
  COM object {3E5FC7F9-9A51-4367-9063-A120244FBEC7}
  Has a ShellExec method for launching processes
  Created with elevation, executes commands at High IL
```

### 4. Token Impersonation / Parent Process Spoofing

```
Concept:
  When creating a process you can specify a DIFFERENT process as "parent".
  The new process inherits the token of the specified parent.
  If there is already a High IL process in the system - its token can be "borrowed".

Details:
  Windows API CreateProcess allows PROC_THREAD_ATTRIBUTE_PARENT_PROCESS
  The new process appears in the process tree as a child of the specified parent
  and inherits its token (if the creator has PROCESS_CREATE_PROCESS access)

Limitation: requires SeDebugPrivilege or access to the target process.
  But some Medium IL processes have access to certain High IL processes.
```

### 5. BYOVD and Kernel Exploits

```
If all UAC bypasses fail (maximum UAC, Secure Desktop),
the attacker takes a different path:

Kernel vulnerability (kernel exploit):
  The kernel runs at Ring 0, above any UAC
  Kernel exploit -> System IL -> UAC bypass
  Examples: PrintNightmare, HiveNightmare, and other LPE (Local Privilege Escalation)

BYOVD (Bring Your Own Vulnerable Driver):
  Load a vulnerable but legitimately signed driver
  Use its vulnerability to execute code in Ring 0
  Bypasses UAC and any user-level protection
```

---

## Runas and Explicit Credentials

### Runas

```
runas.exe - the built-in Windows tool for running programs
as a different user.

How it works:
  runas /user:DOMAIN\Administrator cmd.exe
  -> Windows prompts for Administrator's password
  -> A new process is created with Administrator's token
  -> The new process does NOT inherit environment variables
     or drive mappings from the original session

Key parameters:
  /user:domain\username   - who to run as
  /savecred               - save credentials to Credential Manager
                            (dangerous! credentials remain on the system)
  /netonly                - use credentials only for network access
                            (locally the process runs as the original user)
                            Analogous to -NetOnly in PowerShell
  /noprofile              - don't load user profile (faster, but some apps may break)
```

### Credential Manager

```
Credential Manager - the Windows credentials store.
GUI: Control Panel -> Credential Manager
     (or rundll32.exe keymgr.dll, KRShowKeyMgr)

Two types of credentials:
  Windows Credentials   - for network resources (servers, shares), NTLM/Kerberos
  Certificate Credentials - client certificates
  Generic Credentials   - applications (GitHub, Teams, etc.)

Physical storage:
  C:\Users\<username>\AppData\Roaming\Microsoft\Credentials\
  C:\Users\<username>\AppData\Local\Microsoft\Credentials\
  Files are encrypted via DPAPI (Data Protection API)

DPAPI:
  Encryption is tied to the user account and machine.
  Encryption keys are stored at:
    C:\Users\<username>\AppData\Roaming\Microsoft\Protect\<SID>\
  Decryption requires the user's master key (available while the user is logged in).
  Mimikatz can decrypt DPAPI blobs using the master key extracted from LSASS.
```

---

## Protected Users and Credentials Protection

### Protected Users Security Group

```
Protected Users - a special security group in AD (introduced in Server 2012 R2).
Members get additional restrictions:

  - Cannot use NTLM (Kerberos only)
  - Cannot use DES or RC4 Kerberos encryption (AES only)
  - No credential caching on client (cannot log in without DC)
  - No Kerberos delegation (neither Unconstrained nor Constrained)
  - TGT lifetime maximum 4 hours (not renewable)
  - Credentials NOT stored in lsass as plaintext or weakly encrypted

Who to add: Domain Admins, Enterprise Admins, Schema Admins
Who NOT to add: service accounts (Kerberos delegation will break),
                accounts that need NTLM

Limitation: only for domain accounts, local administrators are not affected.
```

### Credential Guard

```
Credential Guard - hardware-backed protection of credentials in memory.
Uses Virtualization Based Security (VBS) and the Hyper-V hypervisor.

Problem without Credential Guard:
  LSASS (Local Security Authority Subsystem Service) stores credentials in memory.
  Mimikatz (sekurlsa::logonpasswords) can extract them from LSASS memory.
  Any process with SeDebugPrivilege can read LSASS memory.

How Credential Guard works:
  Credentials are moved to an isolated virtual machine (Isolated LSA / LSAIso).
  This VM runs at the hypervisor level, below the Windows kernel.
  Even a compromised kernel cannot directly access credentials in LSAIso.
  LSASS in the normal context works as a "proxy" to LSAIso.

What it protects:
  - NT hashes
  - Kerberos TGTs and session keys
  - NTLMv2 challenge-response (limited)

What it does NOT protect:
  - Credentials at the moment the user types them
  - Credentials in the SAM database (for local accounts)
  - Cached credentials (DCC2 hashes in registry)
  - Credentials in Credential Manager (DPAPI)

Requirements:
  64-bit Windows (Enterprise or Education)
  UEFI Secure Boot
  Virtualization (Intel VT-x or AMD-V)
  TPM (recommended)
  Windows 10 1511+ / Server 2016+

Where to check status:
  msinfo32.exe -> System Summary -> "Virtualization-based security"
  HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\CredentialGuard\
    Enabled  = 1
    Running  = 1
```

---

## Local Privileges and Their Significance

### Windows Privileges

```
A privilege is a special right assigned to an account or group,
allowing a specific system-level action to be performed.
Privileges differ from access rights (ACL): they apply system-wide.

View your current privileges:
  whoami /priv

Dangerous privileges (can be used for LPE - Local Privilege Escalation):

SeDebugPrivilege
  - Open any process (including SYSTEM) for memory read/write
  - Read LSASS -> get all credentials (Mimikatz)
  - Default: Administrator only (in elevated session)

SeImpersonatePrivilege
  - Impersonate another user after authentication
  - Use the token of an authenticated user
  - "Potato" attacks (PrintSpoofer, RoguePotato, GodPotato):
    service with this privilege -> attracts SYSTEM token -> runs code as SYSTEM
  - Default: Network Service, Local Service, IIS worker processes

SeAssignPrimaryTokenPrivilege
  - Replace a process's token
  - Combined with SeImpersonatePrivilege

SeTakeOwnershipPrivilege
  - Take ownership of any object (file, registry key, process)
  - As owner -> can change ACL -> gain access

SeLoadDriverPrivilege
  - Load a kernel driver
  - Can be used for BYOVD attacks

SeBackupPrivilege and SeRestorePrivilege
  - Read/write ANY files regardless of ACL (via backup API bypass)
  - Read SAM, SYSTEM, SECURITY registry hives -> extract hashes

SeTcbPrivilege
  - "Act as part of operating system"
  - Create tokens with arbitrary content
  - One of the most dangerous privileges

SeCreateTokenPrivilege
  - Create arbitrary access tokens
  - Create a token with any SIDs and privileges

SeEnableDelegationPrivilege
  - Configure Kerberos delegation for AD objects
```

### Whoami and Checking Current Privileges

```
whoami /all     - complete info (user, groups, privileges)
whoami /priv    - privileges only
whoami /groups  - groups only

Sample whoami /priv output:
  PRIVILEGES INFORMATION
  ----------------------
  Privilege Name                Description                    State
  ============================= ============================== ========
  SeShutdownPrivilege           Shut down the system           Disabled
  SeChangeNotifyPrivilege       Bypass traverse checking       Enabled
  SeUndockPrivilege             Remove computer from docking   Disabled
  SeIncreaseWorkingSetPrivilege Increase a process working set Disabled

State:
  Enabled  - privilege is active right now
  Disabled - privilege is in the token but not active
             (can be enabled programmatically via AdjustTokenPrivileges API)

Even if a privilege is Disabled - it is still present in the token
and can be activated programmatically without re-elevation.
```

---

## Local Admin and Its Limitations in a Domain

### Pass-the-Hash and Remote UAC

```
Even if an attacker has a local administrator's hash on another machine,
that does not always mean full access.

LocalAccountTokenFilterPolicy - policy that affects Remote UAC for local accounts:

LocalAccountTokenFilterPolicy = 0 (DEFAULT):
  When connecting remotely (via WinRM, SMB, PsExec) local accounts
  (even Administrator) receive a Filtered Token (Medium IL).
  This is Remote UAC - protection against lateral movement via local accounts.

LocalAccountTokenFilterPolicy = 1:
  Local accounts receive a Full Token on remote connections.
  Needed for some management scenarios (but reduces security).

Exceptions (always get Full Token remotely):
  - Built-in Administrator account (SID S-1-5-21-...-500) - NOT filtered!
  - Domain accounts - NOT filtered (only local accounts are affected)

Registry:
  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
    LocalAccountTokenFilterPolicy = 0 or 1

Check:
  reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
    /v LocalAccountTokenFilterPolicy
```

---

## UAC Configuration - Where to Look and What to Change

### Registry and GPO

```
All UAC settings live in registry:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\

Parameter                         Type   Description
──────────────────────────────────────────────────────────────────────
EnableLUA                         DWORD  1 = UAC enabled, 0 = disabled
ConsentPromptBehaviorAdmin        DWORD  Admin behavior (0-5)
ConsentPromptBehaviorUser         DWORD  User behavior (0,1,3)
PromptOnSecureDesktop             DWORD  1 = Secure Desktop, 0 = normal desktop
EnableInstallerDetection          DWORD  1 = detect installers heuristically
ValidateAdminCodeSignatures       DWORD  1 = only signed apps (strict)
EnableSecureUIAPaths              DWORD  1 = UIPI for UI Automation
FilterAdministratorToken          DWORD  1 = filter built-in Admin (rarely needed)

Via GPO:
Computer Configuration -> Windows Settings -> Security Settings ->
Local Policies -> Security Options -> "User Account Control: ..."
```

### Secure Configuration Recommendations

```
Maximum protection (recommended for critical servers and workstations):
  EnableLUA = 1
  ConsentPromptBehaviorAdmin = 2   (Prompt for consent on Secure Desktop)
  ConsentPromptBehaviorUser  = 1   (Prompt for credentials on Secure Desktop)
  PromptOnSecureDesktop      = 1
  ValidateAdminCodeSignatures = 1  (signed apps only - strict)

Standard configuration (corporate balance):
  EnableLUA = 1
  ConsentPromptBehaviorAdmin = 5   (prompt only for non-Windows binaries)
  ConsentPromptBehaviorUser  = 3   (prompt for credentials)
  PromptOnSecureDesktop      = 1

Bad configuration (avoid!):
  EnableLUA = 0                    (UAC off - no token splitting)
  ConsentPromptBehaviorAdmin = 0   (auto-elevate without dialog)
  PromptOnSecureDesktop = 0        (no Secure Desktop - UIPI ineffective)
```

---

## Cheat Sheet

```
KEY COMPONENTS
  consent.exe        - UAC dialog process (System IL, Secure Desktop)
  appinfo.dll        - Application Information Service (handles elevation requests)
  lsass.exe          - stores credentials in memory (Mimikatz target)
  LSAIso             - isolated process (Credential Guard)

INTEGRITY LEVELS
  Untrusted < Low < Medium < High < System < Protected
  Filtered Token processes -> Medium IL
  After UAC elevation -> High IL
  System services -> System IL

REGISTRY
  UAC settings:
    HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
      EnableLUA
      ConsentPromptBehaviorAdmin (0-5)
      PromptOnSecureDesktop (0/1)

  Remote UAC for local accounts:
    HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
      LocalAccountTokenFilterPolicy (0/1)

  Credential Guard:
    HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\CredentialGuard\

AUTO-ELEVATE BINARIES (UAC bypass targets)
  C:\Windows\System32\eventvwr.exe
  C:\Windows\System32\fodhelper.exe
  C:\Windows\System32\sdclt.exe
  C:\Windows\System32\CompMgmtLauncher.exe
  C:\Windows\System32\ComputerDefaults.exe

PRIVILEGE CHECKS
  whoami /all       - everything at once
  whoami /priv      - privileges only
  whoami /groups    - groups only

DANGEROUS PRIVILEGES
  SeDebugPrivilege          -> read LSASS (Mimikatz)
  SeImpersonatePrivilege    -> Potato attacks -> SYSTEM
  SeTakeOwnershipPrivilege  -> take ownership of any object
  SeLoadDriverPrivilege     -> load a kernel driver
  SeBackupPrivilege         -> read SAM/SYSTEM directly
  SeTcbPrivilege            -> create arbitrary tokens

DIAGNOSTICS
  msinfo32.exe      - Virtualization-based security (Credential Guard)
  whoami /priv      - current process privileges
  sigcheck.exe -m <exe> - manifest and autoElevate flag
  Process Explorer (Sysinternals) - process IL in real time
```

---

## References

- [UAC Architecture](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works) - official documentation
- [Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) - Integrity Levels
- [Credential Guard](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/) - Credential Guard documentation
- [Protected Users](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - Protected Users group
- [UACME](https://github.com/hfiref0x/UACME) - comprehensive UAC bypass technique database (research project)
- [Sigcheck](https://learn.microsoft.com/en-us/sysinternals/downloads/sigcheck) - Sysinternals for manifest analysis
- [Windows Privilege Constants](https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants) - privilege reference
