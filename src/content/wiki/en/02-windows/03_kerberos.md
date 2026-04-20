---
title: "Active Directory - Kerberos Authentication (TGT, TGS)"
date: "2026-04-20"
---

Kerberos is a network authentication protocol based on symmetric cryptography and a trusted third party (KDC). In Active Directory, Kerberos v5 is the primary authentication protocol, replacing NTLM.

---

## Why Kerberos - Problems It Solves

```
Without Kerberos (NTLM):
─────────────────────────────────────────────────────────────────
Client → password/hash → Server → forwards → DC → verifies → OK

NTLM Problems:
Server sees the user's hash
Every resource contacts DC to verify the user
Pass-the-Hash attacks
No mutual authentication (server doesn't authenticate to client)
No authorisation - only "you are who you say you are"

With Kerberos:
─────────────────────────────────────────────────────────────────
Password never sent over the network
Single Sign-On - authenticate once, access all resources
Mutual authentication — both client and server prove identity
Delegation - a service can act on behalf of the user
Time-limited, scoped tickets
DC not involved in every resource access
```

---

## Key Components

```
KDC (Key Distribution Center) - the central trust authority
├── AS (Authentication Service)  - issues TGTs
└── TGS (Ticket Granting Service) - issues Service Tickets

In Active Directory: KDC = Domain Controller

TGT (Ticket Granting Ticket)    - "master pass" for getting other tickets
                                  Encrypted with the DC's krbtgt key
Service Ticket (ST)             - ticket for accessing a specific service
                                  Encrypted with the service account's key

SPN (Service Principal Name)    - unique service identifier in AD
                                  Format: ServiceClass/Host:Port/ServiceName
                                  Example: HTTP/webserver.contoso.com:80

krbtgt                          - special KDC account
                                  Its password encrypts all TGTs in the domain
                                  Resetting krbtgt invalidates all TGTs
```

---

## Full Kerberos Authentication Flow

### Step 1: AS-REQ - Request a TGT

```
Client (alice)                              KDC (DC)
                                        AS - Auth Service

1. User enters password
2. Client computes key = PBKDF2(password + salt)

alice ──── AS-REQ ──────────────────────────────► KDC
           ┌────────────────────────────────────┐
           │ Username: alice                    │
           │ Timestamp (encrypted with alice's  │  ← PreAuth
           │           key)                     │
           │ Realm: CONTOSO.COM                 │
           │ Requested ticket lifetime: 10h     │
           └────────────────────────────────────┘

Pre-Authentication:
Client encrypts the current timestamp with its key.
KDC decrypts it → confirms the client knows the password.
Prevents offline attacks on the hash (AS-REP Roasting without PreAuth).
```

### Step 2: AS-REP - Receive the TGT

```
KDC (AS) ──── AS-REP ──────────────────────────► alice
              ┌──────────────────────────────────────────┐
              │ Part 1: encrypted with alice's key:      │
              │   - Session Key (TGS Session Key)        │
              │   - TGT lifetime                         │
              │   - User information                     │
              │                                          │
              │ Part 2: TGT (encrypted with krbtgt key): │
              │   - Username: alice                      │
              │   - Client IP/realm                      │
              │   - Timestamp                            │
              │   - TGT lifetime (default 10 hours)      │
              │   - Session Key                          │
              │   - PAC (Privilege Attribute Certificate) │
              └──────────────────────────────────────────┘

The TGT is stored in the client's memory.
The client CANNOT decrypt the TGT (it's encrypted with krbtgt).
```

### PAC - Privilege Attribute Certificate

```
The PAC is embedded in the TGT and contains:
┌──────────────────────────────────────────────────────────┐
│ User SID:             S-1-5-21-xxx-1001                  │
│ Group SIDs:           Domain Users, IT-Admins, ...       │
│ Account flags:        enabled, not locked, ...           │
│ Account expiry:       date                               │
│ Password last changed: date                              │
│ Logon hours                                              │
│ Signed digitally by the KDC                              │
└──────────────────────────────────────────────────────────┘

The PAC carries group membership information →
used for authorisation at resources.
When group memberships change you need a new TGT!
(log off and log back on)
```

### Step 3: TGS-REQ - Request a Service Ticket

```
alice ──── TGS-REQ ─────────────────────────────► KDC
           ┌─────────────────────────────────────┐    TGS
           │ TGT (opaque to the client)          │
           │ Authenticator:                      │
           │   Username: alice                   │
           │   Timestamp: now                    │
           │   (encrypted with TGS Session Key)  │
           │ SPN: HTTP/webserver.contoso.com     │
           │ Requested lifetime                  │
           └─────────────────────────────────────┘

KDC decrypts TGT with krbtgt key →
extracts TGS Session Key →
decrypts Authenticator →
validates timestamp (must be within ±5 minutes).
```

### Step 4: TGS-REP - Receive the Service Ticket

```
KDC (TGS) ──── TGS-REP ────────────────────────► alice
               ┌────────────────────────────────────────────┐
               │ Part 1: encrypted with TGS Session Key:    │
               │   - Service Session Key                    │
               │   - Service Ticket lifetime                │
               │                                            │
               │ Part 2: Service Ticket                     │
               │   (encrypted with the service key):        │
               │   - Username: alice                        │
               │   - Client IP/realm                        │
               │   - Timestamp                              │
               │   - Lifetime                               │
               │   - Service Session Key                    │
               │   - PAC (copy from TGT)                    │
               └────────────────────────────────────────────┘
```

### Step 5: AP-REQ - Access the Resource

```
alice ──── AP-REQ ──────────────────────────────► WebServer
           ┌────────────────────────────────────┐
           │ Service Ticket (opaque)             │
           │ Authenticator:                      │
           │   Username: alice                   │
           │   Timestamp: now                    │
           │   (encrypted with Service           │
           │    Session Key)                     │
           └────────────────────────────────────┘

WebServer decrypts Service Ticket with its own key →
extracts Service Session Key →
decrypts Authenticator →
validates timestamp →
reads PAC → checks permissions.
```

### Step 6: AP-REP - Mutual Authentication

```
WebServer ──── AP-REP ──────────────────────────► alice
               ┌──────────────────────────────────┐
               │ Timestamp + 1                    │
               │ (encrypted with Service          │
               │  Session Key)                    │
               └──────────────────────────────────┘

Alice verifies the server knows the Service Session Key →
confirms it's talking to the real server, not a MITM.
```

### Full flow at a glance

```
alice           KDC (DC)         FileServer
  │                │                  │
  │──AS-REQ───────►│                  │
  │◄──AS-REP──────│ (TGT)            │
  │                │                  │
  │──TGS-REQ──────►│                  │
  │   (TGT + SPN)  │                  │
  │◄──TGS-REP─────│ (Service Ticket) │
  │                │                  │
  │──AP-REQ──────────────────────────►│
  │   (Service Ticket + Authenticator)│
  │◄──AP-REP──────────────────────────│
  │   (Mutual Auth)                   │
  │                                   │
  │◄══════════ Working ═══════════════►│
  │          (DC no longer needed)    │
```

---

## Ticket Caching

```
TGT (Ticket Granting Ticket):
- Lifetime: 10 hours (AD default)
- Renewable: up to 7 days (can renew without re-entering password)
- Stored in LSASS memory on Windows
- Stored in ccache file on Linux (/tmp/krb5cc_<uid>)

Service Ticket:
- Lifetime: 10 hours
- Cached in Kerberos Ticket Cache
- Reused for subsequent requests to the same resource

Client ticket cache:
Windows: C:\Windows\System32\lsass.exe (in memory)
Linux:   /tmp/krb5cc_1000 (or $KRB5CCNAME)
```

---

## Working with Tickets on Windows

```powershell
# View tickets for the current session
klist

# Sample output:
# Cached Tickets: (4)
#
# #0>     Client: alice @ CONTOSO.COM
#         Server: krbtgt/CONTOSO.COM @ CONTOSO.COM
#         KerbTicket Encryption Type: AES-256-CTS-HMAC-SHA1-96
#         Ticket Flags 0x40e10000 -> forwardable renewable initial
#         Start Time: 1/15/2024 10:00:00 (local)
#         End Time:   1/15/2024 20:00:00 (local)
#         Renew Time: 1/22/2024 10:00:00 (local)

# Clear tickets (force re-authentication)
klist purge

# TGT only
klist tgt

# List sessions
klist sessions
klist -li 0x3e7     # Local System session

# Kerberos domain info
nltest /sc_query:CONTOSO
```

---

## SPN - Service Principal Names

An SPN is a unique service identifier in AD. The KDC uses the SPN to find the right service account and encrypt the Service Ticket.

### SPN format

```
ServiceClass/Host:Port/ServiceName

Examples:
HTTP/webserver.contoso.com              - web service
HTTP/webserver.contoso.com:8080        - non-standard port
HOST/pc001.contoso.com                  - generic host service
MSSQLSvc/sql01.contoso.com:1433        - SQL Server
SMTP/mail.contoso.com                   - mail server
LDAP/dc01.contoso.com                   - LDAP on DC
GC/dc01.contoso.com                     - Global Catalog
```

### Managing SPNs

```powershell
# View SPNs for a user/computer
Get-ADUser -Identity "svc-webapp" -Properties ServicePrincipalNames |
    Select-Object -ExpandProperty ServicePrincipalNames

Get-ADComputer -Identity "webserver" -Properties ServicePrincipalNames |
    Select-Object -ExpandProperty ServicePrincipalNames

# Add an SPN
Set-ADUser -Identity "svc-webapp" -Add @{ServicePrincipalNames = "HTTP/webapp.contoso.com"}

# Via setspn.exe
setspn -S HTTP/webapp.contoso.com svc-webapp    # -S checks for duplicates
setspn -L svc-webapp                             # list SPNs
setspn -D HTTP/webapp.contoso.com svc-webapp     # delete

# Find duplicate SPNs (a problem!)
setspn -X
setspn -F -X     # across the forest

# Find all HTTP SPNs
Get-ADUser -Filter {ServicePrincipalNames -like "HTTP/*"} -Properties ServicePrincipalNames |
    Select-Object Name, ServicePrincipalNames

Get-ADComputer -Filter {ServicePrincipalNames -like "MSSQLSvc/*"} -Properties ServicePrincipalNames
```

---

## Kerberos Delegation

Delegation allows a service to act on behalf of a user when accessing other resources.

### Delegation types

```
Unconstrained Delegation:
───────────────────────────────────────────────────────
The server can delegate to ANY service.
The user's TGT is stored on the server.

DANGEROUS! Compromising the server = all TGTs compromised.
Use only on DCs where it's unavoidable.

Constrained Delegation:
───────────────────────────────────────────────────────
The server can only delegate to SPECIFIED services.
TGT is NOT stored. Uses S4U2Proxy extension.

Resource-Based Constrained Delegation (RBCD):
───────────────────────────────────────────────────────
Permission is configured on the RESOURCE (not on the delegating server).
Introduced in Windows Server 2012.
Used in Kubernetes and cloud scenarios.
```

### Configuring delegation

```powershell
# Unconstrained Delegation
# Avoid unless absolutely necessary
Set-ADComputer -Identity "AppServer" -TrustedForDelegation $true

# Constrained Delegation — only to specified services
Set-ADUser -Identity "svc-webapp" `
    -Add @{"msDS-AllowedToDelegateTo" = "MSSQLSvc/sql01.contoso.com:1433"}

# Resource-Based Constrained Delegation
$webAppComputer = Get-ADComputer "webapp-server"
Set-ADComputer "sql01" -PrincipalsAllowedToDelegateToAccount $webAppComputer

# View delegation settings
Get-ADUser -Identity "svc-webapp" -Properties TrustedForDelegation, `
    TrustedToAuthForDelegation, "msDS-AllowedToDelegateTo" |
    Select-Object Name, TrustedForDelegation, TrustedToAuthForDelegation, `
    "msDS-AllowedToDelegateTo"

# Find accounts with Unconstrained Delegation (security risk!)
Get-ADComputer -Filter {TrustedForDelegation -eq $true -and primaryGroupID -eq 515} |
    Select-Object Name, DistinguishedName
# primaryGroupID 515 = Domain Computers (excludes DCs which have it by default)
```

---

## Encryption Algorithms in Kerberos

```
Supported algorithms (in order of preference):
───────────────────────────────────────────────────
AES256-CTS-HMAC-SHA1-96  - recommended (AES-256)
AES128-CTS-HMAC-SHA1-96  - recommended (AES-128)
RC4-HMAC                  - NTLM Hash = RC4 key, DEPRECATED
DES-CBC-MD5               - fully deprecated, disable!
DES-CBC-CRC               - fully deprecated, disable!
```

```powershell
# Check supported encryption types for an account
Get-ADUser -Identity "alice" -Properties "msDS-SupportedEncryptionTypes" |
    Select-Object Name, "msDS-SupportedEncryptionTypes"

# 0x18 = AES128 + AES256 (recommended)
# 0x1C = RC4 + AES128 + AES256
# 0x7  = DES + RC4 + AES128 + AES256

# Enforce AES-only (disable RC4 and DES)
Set-ADUser -Identity "alice" -KerberosEncryptionType AES128, AES256
Set-ADComputer -Identity "webserver" -KerberosEncryptionType AES128, AES256

# Find accounts that still allow RC4
Get-ADUser -Filter {-not (msDS-SupportedEncryptionTypes -band 16)} `
    -Properties "msDS-SupportedEncryptionTypes"
```

---

## Kerberos on Linux (MIT Kerberos)

### Client configuration

```ini
# /etc/krb5.conf

[libdefaults]
    default_realm = CONTOSO.COM
    dns_lookup_realm = true
    dns_lookup_kdc = true
    ticket_lifetime = 24h
    renew_lifetime = 7d
    forwardable = true
    default_tgs_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96
    default_tkt_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96
    permitted_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96

[realms]
    CONTOSO.COM = {
        kdc = dc01.contoso.com
        kdc = dc02.contoso.com
        admin_server = dc01.contoso.com
        default_domain = contoso.com
    }

[domain_realm]
    .contoso.com = CONTOSO.COM
    contoso.com = CONTOSO.COM
```

### Working with tickets on Linux

```bash
# Get a TGT
kinit alice@CONTOSO.COM
kinit -f alice@CONTOSO.COM              # forwardable TGT
kinit -kt /etc/alice.keytab alice@CONTOSO.COM  # via keytab

# View tickets
klist
# Credentials cache: FILE:/tmp/krb5cc_1000
# Principal: alice@CONTOSO.COM
#   Issued           Expires          Principal
#   Jan 15 10:00:00  Jan 15 20:00:00  krbtgt/CONTOSO.COM@CONTOSO.COM

# Renew TGT (without re-entering the password)
kinit -R

# Destroy tickets
kdestroy

# Multiple ccache files (different accounts)
KRB5CCNAME=/tmp/alice.ccache kinit alice@CONTOSO.COM
KRB5CCNAME=/tmp/svc.ccache   kinit svc-webapp@CONTOSO.COM

# Test: get a Service Ticket
kvno HTTP/webserver.contoso.com
kvno MSSQLSvc/sql.contoso.com
```

### Keytab files

```bash
# A keytab holds the account's keys (no password needed)
# Used for service authentication

# Create keytab on Windows DC
ktpass -princ HTTP/webapp.contoso.com@CONTOSO.COM `
       -mapuser svc-webapp@contoso.com `
       -crypto AES256-SHA1 `
       -ptype KRB5_NT_PRINCIPAL `
       -pass MyPassword123! `
       -out C:\webapp.keytab

# Copy to Linux server
scp webapp.keytab root@webapp:/etc/webapp.keytab
chmod 400 /etc/webapp.keytab
chown webapp:webapp /etc/webapp.keytab

# View keytab contents
klist -kte /etc/webapp.keytab
# KVNO  Encryption type          Principal
# 5     aes256-cts-hmac-sha1-96  HTTP/webapp.contoso.com@CONTOSO.COM

# Test authentication via keytab
kinit -kt /etc/webapp.keytab HTTP/webapp.contoso.com@CONTOSO.COM
klist
```

---

## Kerberos Attacks

### Kerberoasting

Attack targeting service accounts: request a Service Ticket for an SPN and crack it offline.

```
How it works:
1. Any domain user can request a Service Ticket for any SPN
2. The Service Ticket is encrypted with the SERVICE ACCOUNT'S PASSWORD
3. Attacker can crack it offline (no lockout risk)
4. Weak service account passwords → cracked in minutes/hours
```

```powershell
# Defense: long random passwords for service accounts
# or use Managed Service Accounts (gMSA)

# Find vulnerable accounts (SPN + user account, not computer)
Get-ADUser -Filter {ServicePrincipalNames -ne "$null"} `
    -Properties ServicePrincipalNames, PasswordLastSet, PasswordNeverExpires |
    Select-Object Name, ServicePrincipalNames, PasswordLastSet, PasswordNeverExpires

# Use gMSA instead of regular service accounts
New-ADServiceAccount -Name "gMSA-WebApp" `
    -DNSHostName "webapp.contoso.com" `
    -PrincipalsAllowedToRetrieveManagedPassword "webapp-servers" `
    -ServicePrincipalNames "HTTP/webapp.contoso.com"

# Detect Kerberoasting — Event ID 4769 with RC4 encryption (0x17)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} |
    Where-Object {$_.Properties[5].Value -eq '0x17'} |
    Select-Object TimeCreated,
    @{N="User"; E={$_.Properties[0].Value}},
    @{N="Service"; E={$_.Properties[2].Value}}
```

### AS-REP Roasting

Attack against accounts with Pre-Authentication disabled:

```powershell
# If DoesNotRequirePreAuth = true → AS-REP can be requested without a password
# and cracked offline

# Find vulnerable accounts
Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true} -Properties DoesNotRequirePreAuth |
    Select-Object Name, SamAccountName

# Fix: enable Pre-Authentication
Set-ADAccountControl -Identity "alice" -DoesNotRequirePreAuth $false

# Detect: Event ID 4768 with Pre-Authentication Type = 0
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4768} |
    Where-Object {$_.Properties[5].Value -eq 0}
```

### Pass-the-Ticket

```
Attack: steal a TGT from one machine's memory and use it on another.
Tool: Mimikatz

Defense:
Protected Users security group - tickets can't be forwarded
Credential Guard (Virtualization Based Security)
Privileged Access Workstations (PAW)
Restrict local administrator rights
```

### Golden Ticket

```
Attack: compromise krbtgt password → forge TGTs
Impact: access to ALL domain resources with any privileges

Requirement: krbtgt NTLM hash (obtained when DC is compromised)

Indicators:
- Event ID 4768/4769 with unusual parameters
- TGT with non-standard lifetime (>10 hours)
- TGT with non-existent SID

Defense:
Reset krbtgt password TWICE (because of password history)
Protect DCs: minimal access, PAW, monitoring
Microsoft Defender for Identity - detects Golden Tickets

# Reset krbtgt — invalidates ALL existing TGTs!
# All users must re-authenticate
Set-ADAccountPassword -Identity "krbtgt" `
    -NewPassword (ConvertTo-SecureString (New-Guid).Guid -AsPlainText -Force) -Reset
# Wait for replication, then reset again:
Set-ADAccountPassword -Identity "krbtgt" `
    -NewPassword (ConvertTo-SecureString (New-Guid).Guid -AsPlainText -Force) -Reset
```

### Silver Ticket

```
Attack: compromise a SERVICE ACCOUNT password → forge Service Tickets
Impact: access to a specific service without contacting the KDC

Stealthier than Golden Ticket - never touches DC, harder to detect.

Defense:
Long random service account passwords
gMSA - automatically rotate passwords
PAC Validation on servers (enabled by default in modern OS)
```

---

## Kerberos Diagnostics

```powershell
# Check SPN registration
setspn -L CONTOSO\alice
setspn -L CONTOSO\webserver$    # for computer account ($)

# Verify KDC replication
nltest /dclist:CONTOSO.COM
nltest /sc_verify:CONTOSO.COM

# Time sync (CRITICAL — ±5 minute tolerance!)
w32tm /query /status
w32tm /resync /force
net time /querysntp

# Kerberos error codes (Event 4768/4769/4771 Result Code):
# 0x6  - Unknown username
# 0x7  - Account not found
# 0x12 - Account disabled/expired/locked
# 0x17 - Password expired
# 0x18 - Wrong password
# 0x19 - Too early (clock skew)
# 0x1F - Integrity check failed
# 0x20 - Ticket expired
# 0x25 - Clock skew too great (>5 min)
# 0x32 - No S4U2Self proxy
# 0x37 - Bad option

# View Kerberos events
Get-WinEvent -LogName "Security" | Where-Object {$_.Id -in 4768,4769,4770,4771}
```

```bash
# Linux diagnostics
# Enable Kerberos trace logging
export KRB5_TRACE=/dev/stdout
kinit alice@CONTOSO.COM

# Check clock sync
timedatectl
ntpq -pn

# DNS checks (KDC must resolve)
nslookup -type=SRV _kerberos._tcp.contoso.com
nslookup -type=SRV _kerberos._udp.contoso.com

# Check KDC reachability (port 88)
nc -zv dc01.contoso.com 88
```

---

## Monitoring Kerberos Events

```powershell
# Key Event IDs:
# 4768 - TGT request (AS-REQ)
# 4769 - Service Ticket request (TGS-REQ)
# 4770 - Service Ticket renewal
# 4771 - Pre-Authentication failed
# 4772 - Authentication ticket request failed
# 4773 - Service ticket request failed

# Monitor Kerberoasting (many TGS-REQ with RC4)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} -MaxEvents 1000 |
    Where-Object {$_.Properties[5].Value -eq '0x17'} |
    Group-Object {$_.Properties[0].Value} | Sort-Object Count -Descending

# Monitor failed authentications
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4771} |
    Select-Object TimeCreated,
    @{N="User"; E={$_.Properties[0].Value}},
    @{N="IP"; E={$_.Properties[6].Value}},
    @{N="FailCode"; E={$_.Properties[4].Value}} |
    Group-Object User | Sort-Object Count -Descending | Select-Object -First 10

# Enable advanced Kerberos auditing
auditpol /set /subcategory:"Kerberos Authentication Service" /success:enable /failure:enable
auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable /failure:enable
```

---

## Cheat Sheet

```
Core components:
KDC  = Domain Controller
AS   = Authentication Service (issues TGTs)
TGS  = Ticket Granting Service (issues Service Tickets)
TGT  = Ticket Granting Ticket (encrypted with krbtgt)
ST   = Service Ticket (encrypted with service key)
SPN  = Service Principal Name (service identifier)
PAC  = Privilege Attribute Certificate (group memberships)

Authentication flow:
1. AS-REQ: client → KDC (PreAuth = timestamp encrypted with client key)
2. AS-REP: KDC → client (TGT + TGS Session Key)
3. TGS-REQ: client → KDC (TGT + SPN + Authenticator)
4. TGS-REP: KDC → client (Service Ticket + Service Session Key)
5. AP-REQ: client → service (Service Ticket + Authenticator)
6. AP-REP: service → client (mutual authentication)

Ticket lifetimes:
TGT:            10 hours (renewable up to 7 days)
Service Ticket: 10 hours
Clock skew tolerance: ±5 minutes

Windows commands:
klist           - view tickets
klist purge     - clear tickets
klist tgt       - TGT only
nltest /sc_query:DOMAIN — Kerberos status

Linux commands:
kinit user@REALM    - get TGT
klist               - view tickets
kdestroy            - destroy tickets
kvno SPN            - get Service Ticket

Attacks and defences:
Kerberoasting  → gMSA / long passwords / monitor Event 4769+RC4
AS-REP Roast   → enable PreAuth (DoesNotRequirePreAuth=false)
Pass-the-Ticket → Credential Guard / Protected Users group
Golden Ticket  → protect DC / reset krbtgt twice
Silver Ticket  → gMSA / PAC validation
```

---

## References

- [RFC 4120](https://www.rfc-editor.org/rfc/rfc4120) - Kerberos V5 specification
- [Microsoft Kerberos](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-authentication-overview) - Kerberos in Windows
- [MIT Kerberos](https://web.mit.edu/kerberos/) - MIT Kerberos documentation
- [Kerberoasting — MITRE ATT&CK](https://attack.mitre.org/techniques/T1558/003/) - attack reference
- [Defender for Identity](https://learn.microsoft.com/en-us/defender-for-identity/) - attack detection
