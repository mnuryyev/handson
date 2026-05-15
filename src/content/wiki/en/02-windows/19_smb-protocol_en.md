---
title: "Windows - SMB: Protocol, Versions, Vulnerabilities"
date: "2026-05-15"
---

SMB (Server Message Block) is a network protocol for shared access to files, printers, and other resources. It is the backbone of Windows networking: network drives, DFS, Active Directory SYSVOL, and most remote administration tools all depend on it. It is also historically one of the most attacked protocols in Windows.

---

## SMB Basics

```
Transport:
  TCP 445   - direct SMB (Windows 2000+, primary)
  TCP 139   - SMB over NetBIOS Session Service (legacy)
  UDP 137   - NetBIOS Name Service (NBNS)
  UDP 138   - NetBIOS Datagram Service

UNC (Universal Naming Convention) namespace:
  \\<server>\<share>             - access a share
  \\<server>\<share>\<path>      - path inside a share
  \\<server>\C$                  - admin share (drive C)
  \\<server>\ADMIN$              - %SystemRoot%
  \\<server>\IPC$                - IPC via Named Pipes
  \\<server>\PRINT$              - printer drivers
  \\<server>\SYSVOL              - domain: policies and logon scripts
  \\<server>\NETLOGON            - domain: logon scripts

Windows SMB components:
  Server service (LanmanServer)       - hosts shares, accepts incoming SMB
  Workstation service (LanmanWorkstation) - client, connects to shares
  mrxsmb.sys, mrxsmb20.sys            - SMB client redirector drivers
  srv.sys, srv2.sys                   - SMB server drivers
```

---

## SMB Versions

### SMB 1.0 (CIFS)

```
Year: 1983-1996 (IBM/Microsoft)
Also known as: CIFS (Common Internet File System)

Characteristics:
  - Primitive architecture: one request = one round-trip
  - NetBIOS dependency (originally)
  - Plaintext passwords in early versions
  - NT LM 0.12 dialect - the final SMB 1 version
  - No traffic encryption
  - No message signing by default
  - No protection against man-in-the-middle
  - Broadcast dependency (Browser service, NBNS)

Status: DISABLE IMMEDIATELY
  - EternalBlue (MS17-010) exploits SMB 1
  - WannaCry, NotPetya, and dozens of other attacks rely on it
  - Microsoft disabled by default in Windows 10 1709
  - Not installed at all on Windows Server 2019 / Windows 11

Check and disable SMB1:
  # Check status
  Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol
  Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol

  # Disable (server)
  Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force

  # Disable (client feature - separate)
  Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol-Client -NoRestart

  # Via registry (fallback)
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      SMB1 -Type DWORD -Value 0
```

### SMB 2.0 / 2.1

```
SMB 2.0: Windows Vista / Server 2008
SMB 2.1: Windows 7 / Server 2008 R2

Key improvements over SMB 1:
  - Compact binary format (replaces text-like CIFS)
  - Pipelining: multiple requests without waiting for responses
  - Compounding: multiple operations in a single packet
  - Larger MTU: fewer packets for large files
  - Durable handles: recovery after connection loss
  - Leasing: client-side caching with server notifications
  - Message signing (optional)

SMB 2.1 added:
  - Opportunistic locking improvements
  - BranchCache support (branch office caching)
  - Larger credit grants (more concurrent requests)
```

### SMB 3.0 / 3.0.2 / 3.1.1

```
SMB 3.0:   Windows 8 / Server 2012
SMB 3.0.2: Windows 8.1 / Server 2012 R2
SMB 3.1.1: Windows 10 / Server 2016 (current)

Major additions in SMB 3:

SMB Direct (RDMA):
  Works over RDMA NICs (InfiniBand, RoCE, iWARP)
  Bypasses CPU and OS - data moves directly between NIC and RAM
  Minimal latency, maximum throughput

SMB Multichannel:
  Multiple TCP sessions simultaneously (multiple NICs or RSS)
  Automatic load balancing
  Failover: if one channel fails, traffic shifts to another

End-to-end encryption:
  AES-128-CCM (SMB 3.0)
  AES-128-GCM (SMB 3.1.1, faster than CCM)
  AES-256-CCM / AES-256-GCM (Windows Server 2022)
  Encryption per share or for the entire server

Pre-authentication Integrity (SMB 3.1.1):
  HMAC-SHA512 hash of the entire negotiate handshake
  Protects against downgrade attacks (cannot force SMB 1)
  Each connection is bound to specific negotiate parameters

Check on production:
  Get-SmbServerConfiguration | Select-Object `
      EnableSMB2Protocol,
      EncryptData,
      RequireSecuritySignature,
      EnableSMB1Protocol
```

### Version Comparison

```
Feature                      SMB1   SMB2   SMB2.1  SMB3.0  SMB3.1.1
─────────────────────────────────────────────────────────────────────
Traffic encryption             -      -       -      AES-CCM  AES-GCM
Pre-auth Integrity             -      -       -        -        +
Signing (optional)             +      +       +        +        +
Pipelining                     -      +       +        +        +
Multichannel                   -      -       -        +        +
SMB Direct (RDMA)              -      -       -        +        +
Durable Handles                -      +       +        +        +
Leasing (client cache)         -      -       +        +        +
Compound Requests              -      +       +        +        +
Vulnerable to EternalBlue     YES     -       -        -        -
```

---

## Dialect Negotiation

```
When a connection is established, client and server negotiate a dialect.
The client offers a list of supported dialects; the server picks the best.

Dialect identifiers:
  0x0002   PC NETWORK PROGRAM 1.0    - SMB 1 (oldest)
  0x0200   NT LM 0.12               - SMB 1 NT (CIFS)
  0x0202   SMB 2.0.2                - SMB 2.0
  0x0210   SMB 2.1                  - SMB 2.1
  0x0300   SMB 3.0                  - SMB 3.0
  0x0302   SMB 3.0.2                - SMB 3.0.2
  0x0311   SMB 3.1.1                - SMB 3.1.1

Downgrade attack:
  Previously: a MITM could modify the Negotiate packet to force SMB 1.
  SMB 3.1.1 fixed this with Pre-authentication Integrity: an HMAC-SHA512
  of all negotiate packets makes any tampering detectable.

Check active connection dialect:
  Get-SmbConnection | Select-Object ServerName, Dialect, Encrypted, Signed
  # Dialect 3.1.1 = good. Dialect 1.0 = investigate immediately.
```

---

## SMB Authentication

```
SMB supports multiple authentication mechanisms via SPNEGO:

1. Kerberos (preferred in a domain)
   - Used when client connects by hostname (not IP)
   - Mutual authentication
   - No password/hash transmitted over the network

2. NTLM / NTLMv2 (fallback)
   - Used when connecting by IP
   - Or when Kerberos is unavailable
   - Pass-Through: server forwards challenge/response to DC
   - Vulnerable to relay attacks if Signing is off

3. Anonymous (guest)
   - Login without credentials
   - Disabled by default on Windows 10 / Server 2016+
   - Check: Get-SmbServerConfiguration | Select EnableGuestLogon

4. Null Session
   - Connect to IPC$ without credentials
   - Historically used for enumeration (users, groups, shares)
   - Heavily restricted since Windows XP SP2

Session flow:
  1. TCP connect → port 445
  2. SMB Negotiate (dialect selection)
  3. Session Setup (SPNEGO: Kerberos or NTLM)
  4. Tree Connect (connect to a specific share)
  5. Operations (Create, Read, Write, Close, ...)
  6. Tree Disconnect → Session Logoff
```

---

## SMB Signing

```
SMB Signing - a digital signature on every SMB packet.
Protects against NTLM Relay and man-in-the-middle attacks.

How it works:
  Each packet is signed with HMAC-SHA256 (SMB 2/3) or MD5 (SMB 1)
  using a key derived from the session authentication key.
  Packet substitution or modification is impossible without the key.

Settings (two sides - client and server):
  RequireSecuritySignature = $true   # signing mandatory; unsigned connections rejected
  EnableSecuritySignature  = $true   # signing supported (not mandatory)
  RequireSecuritySignature = $false  # signing not required
  EnableSecuritySignature  = $false  # signing disabled entirely

Windows defaults:
  DC:          RequireSecuritySignature = $true  (always requires)
  Member server: EnableSecuritySignature = $true  (supports, doesn't require)
  Workstation: EnableSecuritySignature = $true  (supports, doesn't require)

Enable mandatory Signing (recommended everywhere):
  # Server
  Set-SmbServerConfiguration -RequireSecuritySignature $true -Force

  # Client
  Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

  # Via registry:
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      RequireSecuritySignature -Type DWORD -Value 1
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" `
      RequireSecuritySignature -Type DWORD -Value 1

Verify signing on active connections:
  Get-SmbConnection | Select-Object ServerName, Dialect, Signed, Encrypted
```

---

## SMB Encryption

```
SMB Encryption - encrypts all SMB traffic end-to-end.
Available from SMB 3.0 (Windows 8 / Server 2012).
Protects against packet capture and eavesdropping.

Algorithms:
  SMB 3.0:      AES-128-CCM
  SMB 3.1.1:    AES-128-GCM (faster, preferred)
  Server 2022:  AES-256-CCM, AES-256-GCM

Application levels:
  1. Entire server:
     Set-SmbServerConfiguration -EncryptData $true -Force
     All connections to all shares are encrypted.
     Clients must support SMB 3.0+, otherwise rejected.

  2. Specific share:
     Set-SmbShare -Name "Finance" -EncryptData $true

  3. Client cipher preference:
     Set-SmbClientConfiguration -EncryptionCiphers "AES_256_GCM,AES_128_GCM"

Check encryption status:
  Get-SmbServerConfiguration | Select EncryptData
  Get-SmbShare | Select Name, EncryptData
  Get-SmbConnection | Select ServerName, Encrypted, Dialect

Performance note:
  AES-128-GCM: ~2-5% overhead on modern CPU with AES-NI
  AES-128-CCM: ~5-10% overhead
  On old hardware without AES-NI: noticeable performance hit.
  Check AES-NI: (Get-WmiObject Win32_Processor).Description -match "AES"
```

---

## Managing Shares

### Create and Configure

```powershell
# Create a share
New-SmbShare -Name "Data" -Path "C:\SharedData" `
    -Description "Shared data folder" `
    -FullAccess "DOMAIN\Admins" `
    -ReadAccess "DOMAIN\Users" `
    -ChangeAccess "DOMAIN\Editors"

# Create share with encryption
New-SmbShare -Name "Finance" -Path "C:\Finance" `
    -EncryptData $true `
    -FullAccess "DOMAIN\FinanceTeam"

# Hidden share ($ suffix - not visible in network browsing)
New-SmbShare -Name "Backup$" -Path "C:\Backups" `
    -FullAccess "DOMAIN\BackupAdmins"

# Modify access
Grant-SmbShareAccess -Name "Data" -AccountName "DOMAIN\NewUser" -AccessRight Read -Force
Revoke-SmbShareAccess -Name "Data" -AccountName "DOMAIN\OldUser" -Force
Block-SmbShareAccess -Name "Data" -AccountName "DOMAIN\Blocked" -Force

# View shares
Get-SmbShare
Get-SmbShareAccess -Name "Data"

# Remove share (files not deleted)
Remove-SmbShare -Name "Data" -Force
```

### Share vs NTFS Permissions

```
EFFECTIVE ACCESS = intersection of Share permissions AND NTFS permissions
                  (most restrictive wins).

Example:
  Share:  Users = Full Control
  NTFS:   Users = Read Only
  Result: Users = Read Only  (NTFS limits)

  Share:  Users = Read Only
  NTFS:   Users = Full Control
  Result: Users = Read Only  (Share limits)

Best practice:
  Share permissions:  Authenticated Users = Full Control (or Change)
  NTFS permissions:   detailed per-group configuration
  Reason: NTFS permissions apply to local access too; Share only applies over the network.

Administrative hidden shares (C$, ADMIN$, IPC$):
  Created automatically.
  Only Administrators have access.
  C$ = drive root, ADMIN$ = %SystemRoot%
  IPC$ = cannot be removed (critical for SMB).

  Disable auto-admin shares (usually not recommended - breaks WMI, PsExec):
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      AutoShareWks -Type DWORD -Value 0   # workstations
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      AutoShareServer -Type DWORD -Value 0  # servers
```

---

## SMB Enumeration

```
Without credentials (anonymous) - limited on modern Windows, worth trying:
  net view \\TARGET /all          # share list (may require auth)
  smbclient -L //TARGET -N        # Linux: list shares anonymously

With credentials:
  # Windows - map a share
  net use \\TARGET\share /user:DOMAIN\user password
  net use * \\TARGET\C$ /user:Administrator password

  # PowerShell
  $cred = Get-Credential
  Get-SmbShare -CimSession (New-CimSession -ComputerName TARGET -Credential $cred)

  # View open files on a server
  Get-SmbOpenFile
  Get-SmbSession

Via CrackMapExec / NetExec (Linux, pentest):
  crackmapexec smb TARGET -u user -p password --shares
  crackmapexec smb TARGET -u user -p password --sessions
  crackmapexec smb 192.168.1.0/24 -u user -p pass        # subnet scan

Via nmap:
  nmap -p 445 --script smb-enum-shares,smb-enum-users TARGET
  nmap -p 445 --script smb-security-mode TARGET           # signing, auth level
  nmap -p 445 --script smb-vuln-ms17-010 TARGET           # check EternalBlue
  nmap -p 445 --script smb-protocols TARGET               # list dialects

Check SMB versions locally:
  Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol, EnableSMB2Protocol
```

---

## SMB Vulnerabilities

### MS17-010 / EternalBlue

```
CVE-2017-0144 (and related CVEs)
Discovered by: NSA; published by Shadow Brokers (April 2017)

Affected: Windows XP, Vista, 7, 8, Server 2003/2008/2008R2/2012 (unpatched)
Protocol: SMB 1 ONLY

Vulnerability:
  Bug in SMB1 transaction handling.
  SetupAndX + Trans2 requests with malformed parameters →
  heap/pool corruption in srv.sys (kernel) →
  Remote Code Execution with no authentication.

Impact: full SYSTEM access over the network, no credentials needed.

Used in attacks:
  WannaCry (May 2017): ransomware, infected 200,000+ machines in 150 countries
  NotPetya (June 2017): wiper, damage >$10 billion
  TrickBot, Emotet, and hundreds of others spread via EternalBlue

Defense:
  1. Disable SMB 1 (primary measure)
  2. Apply MS17-010 patch (if SMB 1 cannot be disabled)
  3. Block TCP 445 at the perimeter (not necessarily inside the LAN)
  4. Windows Firewall: deny inbound SMB from untrusted hosts

Check vulnerability:
  nmap -p 445 --script smb-vuln-ms17-010 TARGET

Check patch:
  Get-HotFix -Id KB4012212, KB4012215  # Windows 7 / Server 2008 R2
  # (KB number depends on OS version; search by MS17-010)
```

### MS08-067 / NetAPI

```
CVE-2008-4250
Service: Server service (netapi32.dll)
Affected: Windows XP, Server 2003, Vista, Server 2008 (unpatched)

Remote Code Execution without authentication via SMB.
Exploited by the Conficker worm (infected 9-15 million machines).
Relevant today only for legacy unpatched systems.

Check:
  nmap -p 445 --script smb-vuln-ms08-067 TARGET
```

### CVE-2020-0796 / SMBGhost

```
CVE-2020-0796 (March 2020)
Version: SMB 3.1.1 ONLY
Affected: Windows 10 1903, 1909, Server 1903, Server 1909

Bug in handling of compressed SMB3 packets (new compression feature).
Integer overflow during decompression → heap overflow in the kernel.
Local Privilege Escalation → SYSTEM (LPE PoC well documented)
Remote Code Execution (RCE PoCs appeared later)

Note: Windows Server 2019 and Windows 10 before 1903 are NOT affected.

Defense:
  Apply patch KB4551762
  Temporary workaround: disable SMB3 compression
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      DisableCompression -Type DWORD -Value 1

Check:
  nmap -p 445 --script smb-vuln-cve-2020-0796 TARGET
```

### CVE-2021-36942 / PetitPotam

```
CVE-2021-36942 (July 2021)
Not a classic SMB bug, but abuses SMB / LSARPC.

The LSARPC interface (via \pipe\lsarpc in SMB) allowed
UNAUTHENTICATED users to force a DC to authenticate to an arbitrary server
via NTLM (MS-EFSRPC / EfsRpcOpenFileRaw).

Used in relay chains:
  PetitPotam → DC authenticates → relay to AD CS → get DC certificate →
  DCSync → dump all domain hashes.

Patch: KB5005413 (August 2021)
Defenses:
  Apply the patch
  Disable WebClient service (removes HTTP relay vector)
  Enable EPA (Extended Protection for Authentication) on AD CS
  Enable LDAP Signing + Channel Binding on DCs
```

### NTLM Relay over SMB

```
Not a CVE - an architectural weakness. Still relevant.

How it works:
  SMB without Signing → MITM can relay NTLM authentication.
  Victim connects to server A → attacker intercepts → relays to server B →
  attacker gets access to B as the victim.

Conditions:
  SMB Signing is off (default on workstations!)
  Attacker is in the same subnet or controls DNS/LLMNR

Attack vectors that trigger NTLM over SMB:
  LLMNR poisoning (Link-Local Multicast Name Resolution)
  NBT-NS poisoning (NetBIOS Name Service)
  IPv6 DNS takeover (if IPv6 is active)
  PrinterBug (SpoolService forces DC to authenticate)
  PetitPotam

Defenses:
  1. Enable SMB Signing everywhere (key measure)
     Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
     Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

  2. Disable LLMNR:
     GPO: Computer Config → Admin Templates → Network → DNS Client
     → Turn off Multicast Name Resolution = Enabled

  3. Disable NBT-NS:
     Via DHCP option 001 or NIC settings

  4. Enable SMB Encryption (additional protection)
```

### Pass-the-Hash over SMB

```
SMB supports authentication with just an NT Hash (via NTLM).
If an attacker has the NT Hash, the plaintext password is not needed.

Usage (Impacket):
  smbclient.py -hashes :NTHash DOMAIN/user@TARGET
  psexec.py -hashes :NTHash DOMAIN/Administrator@TARGET
  secretsdump.py -hashes :NTHash DOMAIN/user@TARGET

Usage (CrackMapExec):
  crackmapexec smb TARGET -u Administrator -H NTHash --shares
  crackmapexec smb 192.168.1.0/24 -u Administrator -H NTHash

Defenses:
  Credential Guard (isolates hashes from extraction)
  Protected Users group (disables NTLM for members)
  LAPS (unique local admin passwords → PtH doesn't move laterally)
  Deny network logon for local accounts:

  # Deny local admin network logon (KB2871997):
  # GPO: User Rights Assignment → Deny access to this computer from the network
  # Add: BUILTIN\Administrators
  # Or via registry:
  Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
      LocalAccountTokenFilterPolicy -Type DWORD -Value 0
```

---

## SMB Hardening Checklist

```powershell
# ============================================================
# 1. DISABLE SMB 1 (top priority)
# ============================================================
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart
Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol  # verify

# ============================================================
# 2. REQUIRE SIGNING
# ============================================================
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

# ============================================================
# 3. ENABLE ENCRYPTION (if all clients are Windows 8+/Server 2012+)
# ============================================================
Set-SmbServerConfiguration -EncryptData $true -Force
# Or per sensitive share only:
Set-SmbShare -Name "Finance" -EncryptData $true

# ============================================================
# 4. DISABLE GUEST LOGON
# ============================================================
Set-SmbServerConfiguration -EnableGuestLogon $false -Force

# ============================================================
# 5. DISABLE INSECURE FEATURES
# ============================================================
# Disable LLMNR via registry:
New-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" `
    EnableMulticast -Type DWORD -Value 0 -Force

# Disable NetBIOS over TCP/IP on all adapters:
$adapters = Get-WmiObject Win32_NetworkAdapterConfiguration
$adapters | Where-Object { $_.IPEnabled } | ForEach-Object {
    $_.SetTcpipNetbios(2)  # 2 = Disable NetBIOS
}

# ============================================================
# 6. ENABLE AUDITING
# ============================================================
Set-SmbServerConfiguration -AuditSmb1Access $true -Force
auditpol /set /subcategory:"File Share" /success:enable /failure:enable
auditpol /set /subcategory:"Detailed File Share" /success:enable /failure:enable

# ============================================================
# 7. VERIFY FINAL STATE
# ============================================================
Get-SmbServerConfiguration | Select-Object `
    EnableSMB1Protocol,
    EnableSMB2Protocol,
    EnableGuestLogon,
    RequireSecuritySignature,
    EncryptData,
    AuditSmb1Access | Format-List
```

---

## Monitoring SMB

### Event IDs

```
Security Log:
  5140  - Network share object was accessed (connection to a share)
  5142  - Network share object was added (share created)
  5143  - Network share object was modified
  5144  - Network share object was deleted
  5145  - Network share object checked (file/folder access within a share)
  4624  - Successful logon (Type 3 = Network = SMB)
  4625  - Failed logon
  4776  - NTLM Credential Validation (SMB + NTLM auth)

System Log:
  7045  - New service installed (PsExec-style attacks create a service)

Microsoft-Windows-SMBServer/Audit:
  3000  - SMB1 access (if AuditSmb1Access is enabled)

Microsoft-Windows-SMBClient/Security:
  31017 - Insecure guest logon rejected

PowerShell monitoring:
  # Recent share connections
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5140} -MaxEvents 50 |
      ForEach-Object {
          [PSCustomObject]@{
              Time   = $_.TimeCreated
              User   = $_.Properties[1].Value
              Source = $_.Properties[3].Value
              Share  = $_.Properties[7].Value
          }
      } | Format-Table -AutoSize

  # Detect SMB1 activity
  Get-WinEvent -LogName "Microsoft-Windows-SMBServer/Audit" |
      Where-Object { $_.Id -eq 3000 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # Active SMB sessions right now
  Get-SmbSession | Select-Object ClientUserName, ClientComputerName, NumOpens
  Get-SmbOpenFile | Select-Object ClientUserName, Path
```

---

## Diagnostics

```powershell
# Test SMB connectivity
Test-NetConnection -ComputerName SERVER01 -Port 445
Test-Path "\\SERVER01\SYSVOL"

# View active SMB connections (client side)
Get-SmbConnection
# Shows: ServerName, ShareName, UserName, Dialect, Encrypted, Signed

# Disconnect a stuck session
Get-SmbSession | Where-Object { $_.ClientComputerName -eq "WORKSTATION01" } |
    Remove-SmbSession -Force

# Close a locked file
Get-SmbOpenFile | Where-Object { $_.Path -match "report.xlsx" } |
    Close-SmbOpenFile -Force

# SMB performance counters
Get-Counter "\SMB Server\Bytes Received/sec"
Get-Counter "\SMB Server\Bytes Sent/sec"

# SMB ETW trace (for deep troubleshooting)
netsh trace start capture=yes provider=Microsoft-Windows-SMBClient
# ... reproduce the problem ...
netsh trace stop
# Open the .etl file in Windows Performance Analyzer

# List shares on a remote server
net view \\SERVER01 /all

# Show current mapped drives
net use
```

---

## Quick Reference

```
SMB VERSIONS
  1.0 / CIFS  - DISABLE. EternalBlue, legacy, insecure.
  2.0 / 2.1   - Vista/7. Acceptable, but no encryption.
  3.0 / 3.0.2 - Server 2012. Encryption, Multichannel.
  3.1.1       - Server 2016/Win10+. Pre-auth integrity, AES-GCM. Use this.

KEY SETTINGS
  EnableSMB1Protocol = $false      - MANDATORY
  RequireSecuritySignature = $true - critical (relay protection)
  EncryptData = $true              - where possible (SMB 3.0+)
  EnableGuestLogon = $false        - MANDATORY

CRITICAL VULNERABILITIES
  MS17-010 (EternalBlue)  - SMB1, RCE no auth. Patch or disable SMB1.
  SMBGhost (CVE-2020-0796)- SMB 3.1.1 compression, Win10 1903/1909. KB4551762.
  NTLM Relay              - no Signing. Enable RequireSecuritySignature.
  Pass-the-Hash           - NTLM + NT Hash. Credential Guard, LAPS.
  PetitPotam              - LSARPC forces NTLM auth. Patch KB5005413.

ADMIN SHARES
  C$, D$   - drive roots (Administrators only)
  ADMIN$   - %SystemRoot% (Administrators only)
  IPC$     - Named Pipes (cannot be removed)
  SYSVOL   - domain: policies (DC only)
  NETLOGON - domain: scripts (DC only)

COMMANDS
  Get-SmbServerConfiguration                  - server configuration
  Get-SmbShare                                - list shares
  Get-SmbSession                              - active sessions
  Get-SmbOpenFile                             - open files
  Get-SmbConnection                           - client connections
  Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
  Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
  Set-SmbServerConfiguration -EncryptData $true -Force
  New-SmbShare -Name X -Path Y -FullAccess "DOMAIN\Group"

EVENT IDS
  5140  - share access
  5145  - file access within a share
  4624 type 3  - network logon (SMB)
  7045  - new service installed (PsExec-style)
  3000 (SMBServer/Audit) - SMB1 activity detected
```

---

## References

- [SMB Overview](https://learn.microsoft.com/en-us/windows-server/storage/file-server/troubleshoot/windows-server-smb-overview) - official SMB overview
- [SMB Security Enhancements](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security) - SMB hardening guide
- [Detect and Disable SMB1](https://learn.microsoft.com/en-us/windows-server/storage/file-server/troubleshoot/detect-enable-and-disable-smbv1-v2-v3) - disable SMB1
- [MS17-010 Security Bulletin](https://support.microsoft.com/en-us/topic/ms17-010-security-update-for-windows-smb-server-814bd487-b7c3-bf79-b9d8-b42ce4c5d44f) - EternalBlue patch
- [CVE-2020-0796 (SMBGhost)](https://msrc.microsoft.com/update-guide/en-US/vulnerability/CVE-2020-0796) - SMBGhost advisory
- [MITRE T1557.001: NTLM Relay](https://attack.mitre.org/techniques/T1557/001/) - relay attacks
- [MITRE T1021.002: SMB/Admin Shares](https://attack.mitre.org/techniques/T1021/002/) - lateral movement via SMB
- [NetExec (CrackMapExec fork)](https://github.com/Pennyw0rth/NetExec) - SMB enumeration tool
