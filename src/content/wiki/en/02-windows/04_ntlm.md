---
title: "Active Directory - NTLM Authentication"
date: "2026-04-21"
---

NTLM (NT LAN Manager) is a legacy Microsoft authentication protocol and the predecessor of Kerberos. Despite being outdated, NTLM remains widely used in enterprise networks and is the target of many attacks.

---

## History and Versions

```
LM (LAN Manager, 1987):
  - Weakest. Password split into two 7-character halves.
  - Each half hashed independently.
  - Disabled by default since Windows Vista.

NTLMv1 (1993):
  - Uses NT Hash (MD4 of Unicode password)
  - 8-byte server challenge
  - Vulnerable to Pass-the-Hash and offline attacks

NTLMv2 (1998):
  - Improved response algorithm
  - Includes timestamp and client challenge
  - Harder to crack, but still vulnerable

NTLMv2 Session (NTLM2):
  - Combination of NTLMv1 + NTLMv2 challenge
  - Rarely used
```

---

## How NTLM Works - Three Steps

### Challenge-Response Mechanism

```
Client                    Server                     DC (NetLogon)
  │                          │                           │
  │ 1. NEGOTIATE_MESSAGE     │                           │
  │──────────────────────────►│                          │
  │   (supported flags)      │                           │
  │                          │                           │
  │ 2. CHALLENGE_MESSAGE     │                           │
  │◄──────────────────────────│                          │
  │   (server challenge,     │                           │
  │    server flags,         │                           │
  │    target name)          │                           │
  │                          │                           │
  │ 3. AUTHENTICATE_MESSAGE  │                           │
  │──────────────────────────►│                          │
  │   (NT Response,          │                           │
  │    LM Response,          │                           │
  │    username, domain,     │                           │
  │    workstation)          │                           │
  │                          │ 4. NetLogon (Pass-Through)│
  │                          │──────────────────────────►│
  │                          │   (username, challenge,   │
  │                          │    NT Response)           │
  │                          │                           │
  │                          │ 5. Verify + respond       │
  │                          │◄──────────────────────────│
  │                          │   (Success + session key) │
  │                          │                           │
  │ 6. Access granted        │                           │
  │◄──────────────────────────│                          │
```

### Details of Each Step

#### Step 1: NEGOTIATE_MESSAGE (Type 1)

```
Client announces:
- Supported NTLM flags
- NTLM version (v1 or v2)
- Client domain name
- Workstation name

Example flags:
NTLMSSP_NEGOTIATE_56               - 56-bit encryption
NTLMSSP_NEGOTIATE_128              - 128-bit encryption
NTLMSSP_NEGOTIATE_NTLM2           - NTLMv2 support
NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY
```

#### Step 2: CHALLENGE_MESSAGE (Type 2)

```
Server sends:
- Server Challenge: 8 random bytes (nonce)
- Target name: domain or server name
- Target info: DNS names, flags
- Supported flags

Server Challenge: AA BB CC DD EE FF 00 11  (example)
```

#### Step 3: AUTHENTICATE_MESSAGE (Type 3)

```
Client computes the response:

For NTLMv1:
NT Hash = MD4(UTF-16LE(password))
NT Response = HMAC-MD5(NT Hash, ServerChallenge + ClientChallenge)

For NTLMv2:
NT Hash = MD4(UTF-16LE(password))
NTLMv2 Hash = HMAC-MD5(NT Hash, UTF-16LE(uppercase(username) + domain))
Client Challenge = 8 random bytes
Blob = timestamp + ClientChallenge + TargetInfo
NT Response = HMAC-MD5(NTLMv2 Hash, ServerChallenge + Blob) + Blob

Client sends:
- NT Response (computed response to the challenge)
- LM Response (deprecated)
- Username
- Domain
- Workstation
- Encrypted random session key (optional)
```

---

## NT Hash - The Core of NTLM

```
NT Hash = MD4(UTF-16LE(password))

Examples:
Password         NT Hash
────────────────────────────────────────────────────
"password"    → 8846F7EAEE8FB117AD06BDD830B7586C
"Password1"   → 64F12CDDAA88057E06A81B54E73B949B
"Admin@123"   → A6B1E3B33C9C8B3D6CE3B42C9F1E65B0

Key properties:
- No salt used!
- Same password = same hash on every machine
- This is why Pass-the-Hash works
- MD4 is fast → fast brute-force
```

---

## When NTLM Is Used Instead of Kerberos

```
NTLM is used when Kerberos is not possible:

1. Connecting via IP address (not hostname)
   \\192.168.1.10\share       - NTLM (no SPN for IP)
   \\SERVER\share             - Kerberos (if SPN is registered)

2. DNS not working or hostname doesn't resolve to an AD name
   Kerberos requires DNS to locate the KDC

3. Service not registered in AD (no SPN)
   Misconfigured services

4. NTLM explicitly requested by client or server

5. Workgroup computers (not domain-joined)

6. Local authentication on a machine
   Logging on with a local account (.\Administrator)

7. Applications written with explicit NTLM API calls

8. Cross-domain auth when forest trusts are missing
```

---

## NTLM Pass-Through Authentication

```
When a client connects to a resource server (e.g. FS01):
FS01 does not store user passwords.
It passes the challenge/response to the DC for verification.

Client → FS01 → DC (NetLogon) → Result

NetLogon is the service on the DC that accepts these pass-through requests.
FS01 acts as a Passthrough Server.

Problem: the server sees challenge/response → can be captured and cracked.
```

---

## Managing NTLM via Policies

### LM Authentication Level - Key Policy

```
Computer Configuration → Windows Settings → Security Settings
→ Local Policies → Security Options
→ "Network security: LAN Manager authentication level"

Levels (least to most secure):
0 - Send LM & NTLM responses           (FORBIDDEN)
1 - Send LM & NTLM, use NTLMv2 if negotiated
2 - Send NTLM response only
3 - Send NTLMv2 response only
4 - Send NTLMv2 only; refuse LM
5 - Send NTLMv2 only; refuse LM & NTLM (RECOMMENDED)
```

```powershell
# Set via registry
# 5 = NTLMv2 only, refuse LM and NTLM
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "LmCompatibilityLevel" `
    -Value 5 `
    -Type DWord

# Check current level
Get-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "LmCompatibilityLevel"
```

### Additional NTLM Security Settings

```powershell
# Disable LM Hash storage
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "NoLMHash" `
    -Value 1 `
    -Type DWord

# Require NTLM signing (protects against relay attacks)
# Client:
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord

# Server:
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord
```

### Restricting NTLM via GPO

```
Computer Configuration → Windows Settings → Security Settings
→ Local Policies → Security Options

Key policies:

"Network security: Restrict NTLM: Outgoing NTLM traffic to remote servers"
  - Allow all (default)
  - Audit all
  - Deny all  ← Block outgoing NTLM

"Network security: Restrict NTLM: Incoming NTLM traffic"
  - Allow all
  - Deny all domain accounts
  - Deny all accounts

"Network security: Restrict NTLM: NTLM authentication in this domain"
  - Disable
  - Deny for domain accounts to domain servers
  - Deny for domain accounts
  - Deny all
```

```powershell
# Enable NTLM usage audit
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0" `
    -Name "AuditReceivingNTLMTraffic" `
    -Value 2 `  # 2 = Audit All
    -Type DWord

# Check the operational NTLM log
Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" -MaxEvents 100 |
    Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## NTLM Attacks

### Pass-the-Hash (PtH)

```
How it works:
NT Hash = MD4(password) - the same hash on every computer.
If you capture an NT Hash, you don't need the plaintext password.
The hash can be used directly in NTLM authentication.

Tools (for awareness): Mimikatz, Impacket
```

```powershell
# Defenses against Pass-the-Hash

# 1. Credential Guard - isolates LSASS in a Hyper-V container
# (requires UEFI, Secure Boot, virtualisation)
# GPO: Computer Configuration → Administrative Templates
#         → System → Device Guard → Turn On Virtualization Based Security

# 2. Protected Users Security Group
# Members:
# - Cannot use NTLM (Kerberos only)
# - Tickets not cached on disk
# - DES and RC4 forbidden
# - No delegation
Add-ADGroupMember -Identity "Protected Users" -Members "alice.smith"

# 3. LAPS (Local Administrator Password Solution)
# Unique local admin passwords → PtH can't move laterally

# 4. Disable NTLM where not needed
# GPO: Network security: Restrict NTLM: Outgoing NTLM traffic = Deny all
```

### NTLM Relay

```
How it works:
1. Victim tries to authenticate to Server A
2. Attacker intercepts the NTLM handshake
3. Attacker relays it to Server B
4. Server B sees legitimate credentials of the victim
5. Attacker gains access to Server B as the victim

Key point: attacker never needs to know the password.

Prerequisites:
- SMB Signing disabled (default on workstations!)
- HTTP/LDAP Signing disabled

Common vectors:
- NBT-NS / LLMNR poisoning (answer broadcast name queries)
- IPv6 DNS spoofing
- WPAD attacks
- MS-RPRN (PrintSpooler) coercion
```

```powershell
# Defenses against NTLM Relay

# 1. Enable SMB Signing (CRITICAL!)
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord

# GPO:
# "Microsoft network server: Digitally sign communications (always)" = Enabled
# "Microsoft network client: Digitally sign communications (always)" = Enabled

# 2. Disable LLMNR
# GPO: Computer Config → Administrative Templates → Network
#      → DNS Client → Turn off multicast name resolution = Enabled

# 3. Disable NBT-NS
# Via NIC settings or DHCP option 001

# 4. Enable LDAP Signing on DCs
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LDAPServerIntegrity" `
    -Value 2 -Type DWord  # 2 = Required

# 5. Enable LDAPS Channel Binding
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LdapEnforceChannelBinding" `
    -Value 2 -Type DWord  # 2 = Always
```

### Offline Cracking

```
Captured NT Hashes or NTLMv2 responses can be cracked offline.

Cracking speeds on modern GPU (RTX 3090):
NT Hash (MD4):       70 BILLION hashes/sec → "Password1" = instant
NTLMv2 response:      5 BILLION hashes/sec  → dictionary attacks

Defenses:
Long passwords (>14 characters)
Passphrases instead of Password+number
Multi-factor authentication
Disable NTLM where possible
```

---

## Viewing and Analysing NTLM Traffic

### Wireshark

```
Useful Wireshark filters for NTLM:
ntlmssp                      - all NTLM traffic
ntlmssp.messagetype == 1     - NEGOTIATE
ntlmssp.messagetype == 2     - CHALLENGE
ntlmssp.messagetype == 3     - AUTHENTICATE

Fields to look at in AUTHENTICATE:
- ntlmssp.auth.username
- ntlmssp.auth.domain
- ntlmssp.auth.ntresponse    (can be captured for cracking)
- ntlmssp.ntlmserverchallenge (from CHALLENGE)
```

### NTLM Logging on DC

```powershell
# Event IDs for NTLM:
# 4776 - DC attempted to validate credentials for an account (NTLM)
# 4624 - Successful logon (type 3 = network = often NTLM)
# 4625 - Failed logon

# View NTLM authentication events
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    Id = 4776
} -MaxEvents 100 | ForEach-Object {
    [PSCustomObject]@{
        Time        = $_.TimeCreated
        User        = $_.Properties[1].Value
        Workstation = $_.Properties[2].Value
        ErrorCode   = $_.Properties[3].Value
    }
}

# Enable credential validation audit
auditpol /set /subcategory:"Credential Validation" /success:enable /failure:enable

# Find where NTLM is being used
Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" |
    Select-Object TimeCreated,
    @{N="ProcessName"; E={$_.Properties[0].Value}},
    @{N="TargetServer"; E={$_.Properties[3].Value}} |
    Group-Object TargetServer | Sort-Object Count -Descending
```

---

## Gradually Disabling NTLM

Turning off NTLM abruptly breaks legacy applications. The right approach:

```
Step 1: Audit - find out where NTLM is used
─────────────────────────────────────────────────────────────
GPO: "Restrict NTLM: Outgoing NTLM traffic" = Audit All
GPO: "Restrict NTLM: Audit Incoming NTLM Traffic" = Enable auditing

Check Event Log → Microsoft-Windows-NTLM/Operational

Step 2: Fix - switch to Kerberos where possible
─────────────────────────────────────────────────────────────
- Connect by hostname, not IP
- Register SPNs for services
- Fix applications that explicitly request NTLM

Step 3: Exceptions - add allowlist
─────────────────────────────────────────────────────────────
GPO: "Restrict NTLM: Add server exceptions in this domain"
Add servers that MUST use NTLM (legacy systems)

Step 4: Restrict - start blocking
─────────────────────────────────────────────────────────────
Start with non-critical OUs, expand gradually
"Restrict NTLM: NTLM authentication in this domain" = Deny for domain accounts

Step 5: Full disable
─────────────────────────────────────────────────────────────
"Restrict NTLM: Incoming NTLM traffic" = Deny all accounts
```

```powershell
# Quick audit: top servers using NTLM
wevtutil sl "Microsoft-Windows-NTLM/Operational" /e:true

Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" -MaxEvents 10000 |
    Where-Object {$_.Id -eq 4001} |
    ForEach-Object {
        [PSCustomObject]@{
            Time    = $_.TimeCreated
            Process = $_.Properties[0].Value
            Target  = $_.Properties[3].Value
        }
    } |
    Group-Object Target | Sort-Object Count -Descending | Select-Object -First 20
```

---

## NTLM vs Kerberos

| Feature | NTLM | Kerberos |
|---------|------|----------|
| Algorithm | MD4 + HMAC-MD5 | AES-256 / RC4 |
| Password sent over network | Never | Never |
| DC involved in every request | YES (Pass-Through) | No (TGT only) |
| Mutual authentication | No | Yes (AP-REP) |
| Single Sign-On | Limited | Full |
| Delegation | No | Yes (constrained/unconstrained) |
| Works with IP address | Yes | No (needs hostname) |
| Workgroup support | Yes | No (needs DC) |
| Pass-the-Hash | Vulnerable | Resilient |
| Relay attacks | Vulnerable | Resilient |
| Offline cracking | Vulnerable (MD4 is fast) | Resilient (AES) |

---

## Managed Service Accounts (MSA / gMSA)

Special accounts that resolve service account password problems:

```powershell
# gMSA — recommended
# Password managed by AD automatically (120 chars, rotated every 30 days)
# No NTLM needed — uses Kerberos
# Protected against Kerberoasting

# Create gMSA
New-ADServiceAccount `
    -Name "gMSA-WebApp" `
    -DNSHostName "webapp.contoso.com" `
    -PrincipalsAllowedToRetrieveManagedPassword "WebApp-Servers" `
    -KerberosEncryptionType AES256 `
    -ServicePrincipalNames @("HTTP/webapp.contoso.com", "HTTP/webapp")

# Install on server
Add-ADComputerServiceAccount -Computer "WebServer01" -ServiceAccount "gMSA-WebApp"
Install-ADServiceAccount -Identity "gMSA-WebApp"

# Verify
Test-ADServiceAccount -Identity "gMSA-WebApp"

# Configure service to use gMSA
# In service properties: Account = CONTOSO\gMSA-WebApp$
# (with $ suffix, leave password blank)
```

---

## Diagnostics

```powershell
# Determine which protocol a connection uses
# Via Event 4624 — "Authentication Package" field
# NTLM = NTLM was used
# Kerberos = Kerberos was used
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} |
    Where-Object {$_.Properties[10].Value -eq 'NTLM'} |
    Select-Object TimeCreated,
    @{N="User"; E={$_.Properties[5].Value}},
    @{N="WorkStation"; E={$_.Properties[11].Value}},
    @{N="Protocol"; E={$_.Properties[10].Value}}

# Protocol breakdown — NTLM vs Kerberos
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 1000 |
    Group-Object {$_.Properties[10].Value} | Select-Object Name, Count

# Check local NTLM settings
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" |
    Select-Object LmCompatibilityLevel, NoLMHash
```

---

## Cheat Sheet

```
NTLM versions:
LM     - disabled, obsolete
NTLMv1 - vulnerable, disable!
NTLMv2 - minimum acceptable (still risky)

LmCompatibilityLevel:
0-2 - insecure
3   - NTLMv2 only on client
4   - NTLMv2 + refuse LM on server
5   - NTLMv2 only everywhere (recommended)

Key defenses:
SMB Signing       - enable, always
Protected Users   - for privileged accounts
Credential Guard  - isolates LSASS
gMSA              - for service accounts instead of NTLM
Disable LLMNR     - removes relay attack vector
Disable NBT-NS    - removes relay attack vector

Monitoring Event IDs:
4776 — NTLM Credential Validation (on DC)
4624 type 3 — network logon (may be NTLM)
4625 — failed logon

Key registry keys:
HKLM\SYSTEM\...\Lsa\LmCompatibilityLevel
HKLM\SYSTEM\...\Lsa\NoLMHash
HKLM\SYSTEM\...\LanmanServer\Parameters\RequireSecuritySignature
HKLM\SYSTEM\...\LanmanWorkstation\Parameters\RequireSecuritySignature
```

---

## References

- [MS-NLMP Specification](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-nlmp) - official protocol spec
- [NTLM Relay — MITRE ATT&CK](https://attack.mitre.org/techniques/T1557/001/) - attack reference
- [Pass-the-Hash — MITRE ATT&CK](https://attack.mitre.org/techniques/T1550/002/) - attack reference
- [Mitigating Pass-the-Hash](https://www.microsoft.com/en-us/download/details.aspx?id=36036) - Microsoft whitepaper
- [Protected Users](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - documentation
