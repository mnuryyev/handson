---
title: "Active Directory - Trust Relationships"
date: "2026-05-13"
---

Trust relationships are the mechanism that allows users from one domain or forest to authenticate and access resources in another domain or forest. They are the foundation of cross-organizational collaboration and the basis of many attack vectors in AD environments.

---

## Core Concepts

### What is a Trust

```
A trust is established between two parties:

Trusting Domain  - the domain that provides access to its resources
Trusted Domain   - the domain whose users receive access

Example:
  contoso.com ──[trusts]──► fabrikam.com

  Read as: "contoso.com trusts fabrikam.com"
  Meaning: users of fabrikam.com can access resources in contoso.com
  contoso = Trusting, fabrikam = Trusted
```

```
Important to understand:
- A trust does NOT mean automatic access to everything
- A trust only allows authentication via the foreign KDC
- Actual access to a resource is still controlled by the object's ACL
- You still need to explicitly assign permissions to foreign users/groups
```

### Key Trust Characteristics

```
By direction:
──────────────────────────────────────────────────────────────────
One-way (Incoming):
  A ──[trusts]──► B
  - A is Trusting, B is Trusted
  - Users of B can access resources in A
  - Users of A CANNOT access resources in B
  - In AD: B has an incoming trust, A has an outgoing trust

Two-way (Bidirectional):
  A ◄──[trusts]──► B
  - Both domains are simultaneously Trusting and Trusted
  - Users of both domains get mutual access
  - Implemented as two one-way trusts in both directions

By transitivity:
──────────────────────────────────────────────────────────────────
Transitive:
  A trusts B, B trusts C -> A automatically trusts C
  All trusts within a single forest are transitive

Non-transitive:
  A trusts B, B trusts C -> A does NOT automatically trust C
  External trusts and Shortcut trusts are non-transitive
```

---

## Types of Trust Relationships

### Comparison Table

```
Type           Direction         Transitivity     Creation    Use Case
────────────────────────────────────────────────────────────────────────────
Parent-Child   Bidirectional     Transitive       Auto        Child domains
Tree-Root      Bidirectional     Transitive       Auto        New tree in forest
Shortcut       One/Bidirectional Non-transitive   Manual      Speed up auth in forest
Forest         One/Bidirectional Transitive       Manual      Between forests (full)
External       One/Bidirectional Non-transitive   Manual      Single domain in other forest
Realm          One/Bidirectional Both options     Manual      Unix/MIT Kerberos
```

### Parent-Child Trust

```
Automatically created when a child domain is added to a tree.

contoso.com (Parent)
└── europe.contoso.com (Child)

- Direction:     Bidirectional
- Transitivity:  Transitive
- Type in AD:    ParentChild
- Created:       automatically by Install-ADDSDomain

Result of transitivity:
contoso.com trusts europe.contoso.com
europe.contoso.com trusts uk.europe.contoso.com
-> contoso.com automatically trusts uk.europe.contoso.com
```

### Tree-Root Trust

```
Automatically created when a new tree is added to the forest.

Forest: contoso.com
├── contoso.com (Forest Root)
└── fabrikam.com (Tree Root)   <- separate tree, different DNS namespace

- Direction:     Bidirectional
- Transitivity:  Transitive
- Type in AD:    TreeRoot
- Created:       automatically when adding a new tree

All domains in fabrikam.com automatically get a transitive trust
via the Tree-Root trust to the Forest Root (contoso.com)
```

### Shortcut Trust

```
Created manually to speed up authentication between domains
in the same forest that are far apart in the hierarchy.

Problem without Shortcut:
  uk.europe.contoso.com -> europe.contoso.com -> contoso.com -> asia.contoso.com -> jp.asia.contoso.com
  Long chain of referral requests = slow authentication

With Shortcut Trust:
  uk.europe.contoso.com ──[shortcut]──► jp.asia.contoso.com
  Direct authentication path

- Direction:     One-way or Bidirectional (your choice)
- Transitivity:  Non-transitive
- Creation:      Manual via netdom or PowerShell
- Use:           Optimization only, no new capabilities
```

### Forest Trust

```
Connects two DIFFERENT forests. Requires Forest Functional Level 2003+.

Forest A: contoso.com          Forest B: fabrikam.com
├── contoso.com     ◄──────────────────► fabrikam.com
└── europe.contoso.com                 └── uk.fabrikam.com

- Direction:     One-way or Bidirectional
- Transitivity:  Transitive WITHIN each forest, NOT between third forests
- Creation:      Manual on Forest Root domains of both forests
- Requires:      Forest FL 2003, DNS resolution between forests
- SID Filtering: Enabled by default (security protection)

Forest Trust transitivity:
  If Forest A trusts Forest B, and Forest B trusts Forest C,
  this does NOT mean Forest A trusts Forest C
  (each Forest Trust must be created separately)
```

### External Trust

```
Connects a domain in one forest to a domain in another forest
(or to a Windows NT 4.0 domain).

contoso.com ──[external]──► partner.org (separate forest)

- Direction:     One-way or Bidirectional
- Transitivity:  Non-transitive
- Creation:      Manual
- SID Filtering: Enabled by default
- Use:           Access to a specific domain only, not the whole forest

Difference from Forest Trust:
- Forest Trust - to all domains in both forests
- External Trust - to one specific domain only
```

### Realm Trust

```
Trust between an AD domain and a non-Windows Kerberos realm
(Linux/Unix MIT Kerberos, Apple macOS Server).

contoso.com ◄──[realm trust]──► UNIX.EXAMPLE.COM

- Direction:     One-way or Bidirectional
- Transitivity:  Transitive or Non-transitive (configurable)
- Creation:      Manual
- Use:           Integration with Linux/Unix infrastructure

Requirements:
- Both Kerberos realms must use the same encryption type
- DNS: SRV records for the Kerberos realm
- NTP: time synchronization (Kerberos is time-sensitive)
```

---

## Authentication Across Trusts

### How Kerberos Works Across a Trust

```
Scenario: alice@contoso.com wants to access a resource in fabrikam.com

alice           DC (contoso.com)    DC (fabrikam.com)    Resource (fabrikam.com)
  │                    │                    │                      │
  │ 1. TGT Request     │                    │                      │
  │   (AS-REQ)         │                    │                      │
  │───────────────────►│                    │                      │
  │                    │                    │                      │
  │ 2. TGT             │                    │                      │
  │   (AS-REP)         │                    │                      │
  │◄───────────────────│                    │                      │
  │                    │                    │                      │
  │ 3. TGS-REQ         │                    │                      │
  │   (TGT + SPN of resource in fabrikam)   │                      │
  │───────────────────►│                    │                      │
  │                    │                    │                      │
  │ 4. Referral TGT    │                    │                      │
  │   (ticket for fabrikam.com KDC)         │                      │
  │◄───────────────────│                    │                      │
  │                    │                    │                      │
  │ 5. TGS-REQ         │                    │                      │
  │   (Referral TGT)   │                    │                      │
  │───────────────────────────────────────►│                      │
  │                    │                    │                      │
  │ 6. Service Ticket  │                    │                      │
  │   (for resource in fabrikam)            │                      │
  │◄───────────────────────────────────────│                      │
  │                                                               │
  │ 7. AP-REQ (Service Ticket)                                    │
  │──────────────────────────────────────────────────────────────►│
  │                                                               │
  │ 8. Access granted / denied (based on ACL)                     │
  │◄──────────────────────────────────────────────────────────────│

Inter-realm key - shared secret between the two KDCs, set when the Trust was created
Referral TGT    - ticket for the foreign KDC, encrypted with the inter-realm key
```

### NTLM Across Trust

```
NTLM authentication across Trust (Pass-through authentication):

Client          Resource Server   Resource DC   User's DC
  │                   │                │               │
  │ 1. NTLM Negotiate │                │               │
  │──────────────────►│                │               │
  │                   │                │               │
  │ 2. Challenge      │                │               │
  │◄──────────────────│                │               │
  │                   │                │               │
  │ 3. Response       │                │               │
  │──────────────────►│                │               │
  │                   │                │               │
  │                   │ 4. NetLogon Pass-through        │
  │                   │────────────────────────────────►│
  │                   │                │               │
  │                   │ 5. Validation  │               │
  │                   │◄────────────────────────────────│
  │                   │                │               │
  │ 6. Access         │                │               │
  │◄──────────────────│                │               │

Netlogon Secure Channel is used to forward credentials
```

---

## Managing Trusts via PowerShell

### Viewing Existing Trusts

```
# All trusts for the current domain
Get-ADTrust -Filter *

# Detailed info on a specific trust
Get-ADTrust -Identity "fabrikam.com"

# Formatted output with key attributes
Get-ADTrust -Filter * | Select-Object `
    Name,
    Direction,
    TrustType,
    TrustAttributes,
    DisallowTransivity,
    SIDFilteringQuarantined,
    SIDFilteringForestAware,
    SelectiveAuthentication

# Direction values:
# BiDirectional    = 3 (two-way)
# Inbound          = 1 (incoming - we are Trusted)
# Outbound         = 2 (outgoing - we are Trusting)

# TrustType values:
# Uplevel           = 2  (Windows 2000+)
# Downlevel         = 1  (NT 4.0)
# MIT               = 3  (Kerberos Realm)

# TrustAttributes bitmask:
# 0x01  NON_TRANSITIVE           - non-transitive
# 0x02  UPLEVEL_ONLY             - Windows 2000+ only
# 0x04  QUARANTINED_DOMAIN       - SID Filtering enabled
# 0x08  FOREST_TRANSITIVE        - Forest Trust
# 0x10  CROSS_ORGANIZATION       - Selective Authentication
# 0x20  WITHIN_FOREST            - within forest
# 0x40  TREAT_AS_EXTERNAL        - treat as External
# 0x80  USES_RC4_ENCRYPTION      - RC4 encryption (legacy)
```

```
# Trust via .NET (more details)
$domain = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
$domain.GetAllTrustRelationships()

# Forest-level trusts
$forest = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest()
$forest.GetAllTrustRelationships()

# Via ADSI
$domainDN = (Get-ADDomain).DistinguishedName
Get-ADObject -Filter {objectClass -eq "trustedDomain"} `
    -SearchBase $domainDN `
    -Properties * | Select-Object Name, TrustDirection, TrustType, TrustAttributes
```

### Creating Trusts

```
# --- Forest Trust (bidirectional) ---
# Must run as Enterprise Admins on BOTH forests

# Option 1: netdom (classic)
netdom trust contoso.com /domain:fabrikam.com /twoway /add /passwordt:TrustP@ss123

# Option 2: PowerShell via .NET
$localForest  = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest()
$remoteForest = [System.DirectoryServices.ActiveDirectory.Forest]::GetForest(
    (New-Object System.DirectoryServices.ActiveDirectory.DirectoryContext(
        "Forest", "fabrikam.com", "fabrikam\admin", "P@ssw0rd"
    ))
)
$localForest.CreateTrustRelationship($remoteForest, "Bidirectional")

# --- External Trust (one-way incoming) ---
# contoso.com trusts partner.org (partner.org users -> contoso.com resources)
netdom trust contoso.com /domain:partner.org /oneside:trusted /add /passwordt:TrustSecret

# --- Shortcut Trust ---
netdom trust europe.contoso.com /domain:asia.contoso.com /twoway /add /passwordt:ShortcutPass

# --- Realm Trust ---
netdom trust contoso.com /domain:UNIX.EXAMPLE.COM /realmtrust /twoway /add
```

### Modifying and Removing Trusts

```
# Change trust direction
netdom trust contoso.com /domain:fabrikam.com /twoway

# Enable Selective Authentication
netdom trust contoso.com /domain:fabrikam.com /quarantine:no /selectiveauth:yes

# Disable SID Filtering (caution - reduces security!)
netdom trust contoso.com /domain:fabrikam.com /quarantine:no

# Re-enable SID Filtering
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

# Remove trust
netdom trust contoso.com /domain:fabrikam.com /remove /twoway
Remove-ADTrust -Identity "CN=fabrikam.com,CN=System,DC=contoso,DC=com" -Confirm:$false

# Verify trust
netdom trust contoso.com /domain:fabrikam.com /verify
Test-ComputerSecureChannel -Server DC01
```

---

## SID Filtering and SID History

### SID Filtering

```
SID Filtering (SID Quarantine) - a security mechanism that strips
foreign SIDs from Kerberos tickets.

Problem without SID Filtering:
  1. Attacker compromises a Trusted domain (fabrikam.com)
  2. Adds the SID of "Domain Admins" from contoso.com
     to the SIDHistory attribute of their account
  3. When getting a Service Ticket in contoso.com,
     this SID is included in the PAC (Privilege Attribute Certificate)
  4. Server in contoso.com sees Domain Admins SID -> grants full access!

SID Filtering solves this:
  contoso.com DC filters all foreign-forest SIDs from the PAC
  Only SIDs from the trusted domain itself are kept

Default status:
- Forest Trust:   SID Filtering ENABLED  (TrustAttributes: QUARANTINED_DOMAIN)
- External Trust: SID Filtering ENABLED
- Parent-Child:   SID Filtering DISABLED (same forest - trusted)
```

```
# Check SID Filtering status
Get-ADTrust -Filter * | Select-Object Name, SIDFilteringQuarantined, SIDFilteringForestAware

# SIDFilteringQuarantined = True  -> SID Filtering enabled (safe)
# SIDFilteringQuarantined = False -> SID Filtering disabled (risk!)

# Enable SID Filtering (recommended for all external trusts)
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

# Disable SID Filtering (needed temporarily for SIDHistory migration)
netdom trust contoso.com /domain:fabrikam.com /quarantine:no
```

### SID History

```
SIDHistory - a user object attribute containing old SIDs.
Used during domain migration to preserve access to resources.

Legitimate use:
  1. User migrates from old.corp -> new.corp
  2. In new.corp they have a new SID: S-1-5-21-NEW-1234
  3. SIDHistory gets their old SID: S-1-5-21-OLD-5678
  4. File server in old.corp sees the old SID -> grants access
  5. Gradually reassign permissions to the new SID, then clear SIDHistory

SIDHistory Injection attack:
  1. Attacker compromises a DC in the trusted domain
  2. Adds the SID of Enterprise Admins / Domain Admins from the victim forest
     to SIDHistory of their own account
  3. When SID Filtering is DISABLED - full access to the victim forest

# View SIDHistory of a user
Get-ADUser "alice" -Properties SIDHistory | Select-Object Name, SIDHistory

# Audit: look for any SIDHistory entries (security check)
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object { $_.SIDHistory -ne $null } |
    Select-Object Name, SamAccountName, SIDHistory

# Find SIDHistory containing SIDs from a different domain (suspicious!)
$domainSID = (Get-ADDomain).DomainSID.Value
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object {
        $_.SIDHistory | Where-Object { $_.Value -notlike "$domainSID*" }
    } |
    Select-Object Name, SamAccountName, SIDHistory
```

---

## Selective Authentication

```
Selective Authentication - a stricter mode for Forest or External Trusts,
where access is granted only to explicitly authorized users.

Without Selective Authentication (standard Trust):
  Any user from the trusted domain can authenticate to any server

With Selective Authentication:
  A user from the trusted domain can log on to a server ONLY if
  they have been explicitly granted "Allowed to Authenticate" on the computer object

When to use:
- Forest Trust with a partner (not full trust)
- Access should be limited to specific servers only
- Principle of least privilege for cross-forest connections
```

```
# Enable Selective Authentication when creating a Trust
netdom trust contoso.com /domain:fabrikam.com /twoway /add /selectiveauth:yes

# Enable on an existing Trust
netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

# Grant "Allowed to Authenticate" on a specific server
# via PowerShell:
$server   = Get-ADComputer "FILESERVER01"
$acl      = Get-Acl "AD:$($server.DistinguishedName)"

$identity = [System.Security.Principal.IdentityReference](
    New-Object System.Security.Principal.NTAccount("fabrikam.com\bob.jones")
)
$adRights     = [System.DirectoryServices.ActiveDirectoryRights]::ExtendedRight
$type         = [System.Security.AccessControl.AccessControlType]::Allow
$objectType   = [System.Guid]"68b1d179-0d15-4d4f-ab71-46152e79a7bc" # Allowed-To-Authenticate
$inheritance  = [System.DirectoryServices.ActiveDirectorySecurityInheritance]::None

$ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $identity, $adRights, $type, $objectType, $inheritance
)
$acl.AddAccessRule($ace)
Set-Acl "AD:$($server.DistinguishedName)" $acl
Write-Host "[+] Allowed to Authenticate granted to bob.jones on FILESERVER01"
```

---

## Netlogon and Secure Channel

```
Secure Channel - a protected channel between a DC and a client/server,
used to pass credentials during NTLM pass-through authentication.

Every computer and every DC has a Secure Channel to the DC of its domain.
With Trust: the DC of the trusting domain has a Secure Channel to the DC of the trusted domain.

Secure Channel password:
- Rotates automatically every 30 days
- Stored in LSA secrets
- If the channel breaks - authentication through Trust fails
```

```
# Check Secure Channel state
nltest /sc_verify:fabrikam.com         # verify channel to trusted domain
nltest /sc_query:fabrikam.com          # query state
nltest /sc_reset:fabrikam.com          # reset and rebuild channel

# Check Trust with DC
nltest /domain_trusts                   # list all trusts
nltest /domain_trusts /all_trusts       # including indirect
nltest /dsgetdc:fabrikam.com           # find DC of trusted domain
nltest /dsgetdc:fabrikam.com /kdc      # find KDC

# Inter-Domain Trust Accounts (INTERDOMAIN_TRUST_ACCOUNT)
# A special account is created for each Trust:
# fabrikam$  in contoso.com (outgoing trust account)
# contoso$   in fabrikam.com

# Find Trust Accounts
Get-ADUser -Filter {Name -like "*$"} -Properties userAccountControl |
    Where-Object { $_.userAccountControl -band 2048 } |
    Select-Object Name, SamAccountName, userAccountControl
# userAccountControl bit 2048 = INTERDOMAIN_TRUST_ACCOUNT
```

---

## Practical Scenarios

### Scenario 1: Forest Trust with a Partner

```
Goal: give fabrikam.com users access to SharePoint in contoso.com,
but not to the entire infrastructure.

Solution:
1. Create Forest Trust with Selective Authentication
2. Grant "Allowed to Authenticate" to the right groups on the SharePoint computer

# Step 1: DNS - configure Conditional Forwarder
# In contoso.com DNS Manager, add Conditional Forwarder for fabrikam.com
# (or configure a stub zone)

# Verify DNS resolution before Trust
Resolve-DnsName fabrikam.com
nslookup fabrikam.com <fabrikam DC IP>

# Step 2: Create Forest Trust
# Run on DC contoso.com:
netdom trust contoso.com /domain:fabrikam.com `
    /twoway /add /selectiveauth:yes /passwordt:TrustSecret123!

# Step 3: Grant "Allowed to Authenticate" on SharePoint server
# for group G-SharePoint-Users from fabrikam.com
# (see Selective Authentication section for PowerShell code)

# Step 4: In SharePoint, add fabrikam\G-SharePoint-Users
# and assign the appropriate permissions

# Verify
netdom trust contoso.com /domain:fabrikam.com /verify
Get-ADTrust -Identity "fabrikam.com" | Select-Object *
```

### Scenario 2: Shortcut Trust to Speed Up Authentication

```
Situation: users from uk.europe.contoso.com frequently access resources
in asia.contoso.com. Authentication is slow.

Kerberos path without Shortcut:
  uk.europe.contoso.com -> europe.contoso.com -> contoso.com -> asia.contoso.com

Each hop = an additional Referral TGT request.

# Create Shortcut Trust
netdom trust uk.europe.contoso.com /domain:asia.contoso.com `
    /twoway /add /passwordt:ShortcutPass123

# After creation, Kerberos path:
uk.europe.contoso.com -> asia.contoso.com (direct referral)

# Verify
nltest /dsgetdc:asia.contoso.com /server:DC.uk.europe.contoso.com
```

### Scenario 3: Domain Migration with SIDHistory

```
Goal: migrate users from old.local to new.corp
while preserving access to resources in old.local

# Step 1: Create External Trust (old.local trusts new.corp)
netdom trust old.local /domain:new.corp /twoway /add /passwordt:MigrationSecret

# Step 2: Disable SID Filtering TEMPORARILY for migration
netdom trust old.local /domain:new.corp /quarantine:no

# Step 3: Migrate users (ADMT or PowerShell)
# SIDHistory is automatically populated with old SIDs during migration

# Step 4: Verify migrated users can access resources in old.local

# Step 5: After migration is complete - re-enable SID Filtering!
netdom trust old.local /domain:new.corp /quarantine:yes

# Step 6: Once all permissions are reassigned to new SIDs - clear SIDHistory
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object { $_.SIDHistory } |
    ForEach-Object {
        Set-ADUser $_ -Remove @{SIDHistory = $_.SIDHistory}
        Write-Host "Cleared SIDHistory for $($_.Name)"
    }

# Step 7: Remove Trust after full migration
netdom trust old.local /domain:new.corp /remove /twoway
```

---

## Troubleshooting Trusts

### Core Commands

```
# --- Trust verification ---
netdom trust contoso.com /domain:fabrikam.com /verify
nltest /domain_trusts /all_trusts
Get-ADTrust -Filter * | Format-Table Name, Direction, TrustType, TrustAttributes -AutoSize

# --- DNS diagnostics (critical for Trusts!) ---
# Trusts require mutual DNS resolution between domains

# Check SRV records of trusted domain
nslookup -type=SRV _ldap._tcp.fabrikam.com
nslookup -type=SRV _kerberos._tcp.fabrikam.com
nslookup -type=SRV _gc._tcp.fabrikam.com

# Find DC of trusted domain
nltest /dsgetdc:fabrikam.com
nltest /dsgetdc:fabrikam.com /kdc
nltest /dsgetdc:fabrikam.com /force   # bypass cache

# --- Kerberos diagnostics ---
# View current tickets (including Referral TGTs)
klist
klist tickets
klist -li 0x3e7   # LocalSystem tickets

# Clear tickets and get new ones
klist purge
gpupdate /force

# --- Netlogon log (detailed diagnostics) ---
# Enable verbose Netlogon logging on DC
nltest /dbflag:0x2080ffff    # enable verbose log
# Log location: C:\Windows\debug\netlogon.log

# Disable after troubleshooting:
nltest /dbflag:0x0

# --- Required ports between DCs ---
# 53   TCP/UDP  DNS
# 88   TCP/UDP  Kerberos
# 135  TCP      RPC Endpoint Mapper
# 137  UDP      NetBIOS Name
# 138  UDP      NetBIOS Datagram
# 139  TCP      NetBIOS Session
# 389  TCP/UDP  LDAP
# 445  TCP      SMB
# 464  TCP/UDP  Kerberos password change
# 636  TCP      LDAPS
# 3268 TCP      Global Catalog
# 49152-65535 TCP  RPC Dynamic Ports

# Check port connectivity
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 88
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 389
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 445
```

### Common Problems and Solutions

```
Problem:  "The trust relationship between this workstation and the primary domain failed"
Cause:    Broken Secure Channel between computer and DC
Solution:
  Test-ComputerSecureChannel -Repair -Credential (Get-Credential)
  nltest /sc_reset:contoso.com

Problem:  Authentication across Trust does not work
Checks:
  1. DNS: nslookup -type=SRV _ldap._tcp.fabrikam.com  (must resolve)
  2. Time: |time(contoso) - time(fabrikam)| < 5 minutes
     w32tm /monitor - check synchronization
  3. Firewall: ports 88, 389, 445 open between DCs
  4. Trust account: check InterDomain Trust Account is not locked
     Get-ADUser -Filter {Name -eq "fabrikam$"}
  5. Netlogon log: nltest /dbflag:0x2080ffff -> reproduce issue -> check log

Problem:  SID Filtering blocks Universal Group membership
Cause:    Forest Trust with SID Filtering strips cross-forest SIDs from PAC
Solution: Use Domain Local Groups in each forest,
          add Global Groups from the trusted forest to them

Problem:  Selective Authentication - user gets Access Denied on server
Cause:    Missing "Allowed to Authenticate" right on the Computer object
Solution: Grant Extended Right on the Computer object in AD
          (Security -> Add -> Allowed to Authenticate)
```

### Event Log Diagnostics

```
# Trust and authentication events (Security Log on DC)
# 4768  Kerberos TGT Request (AS-REQ / AS-REP)
# 4769  Kerberos Service Ticket Request (TGS-REQ)
# 4770  Kerberos Service Ticket Renewal
# 4771  Kerberos pre-auth failed
# 4772  Kerberos AS-REQ failed
# 4773  Kerberos TGS-REQ failed
# 4820  Kerberos TGT denied (account restrictions)
# 4821  Kerberos Service Ticket denied (account restrictions)
# 5136  Directory Service object modified (trust change)
# 5137  Directory Service object created (trust creation)
# 5139  Directory Service object moved
# 5141  Directory Service object deleted (trust deletion)

# Find all authentication events across Trust (cross-domain)
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(4768, 4769)
    StartTime = (Get-Date).AddHours(-1)
} | Where-Object {
    $_.Message -match "fabrikam"   # filter by trusted domain
} | Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Trust object changes (audit)
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(5136, 5137, 5141)
} | Where-Object {
    $_.Message -match "trustedDomain"
} | Select-Object TimeCreated, Id, Message

# Netlogon log: Trust errors
Get-Content "C:\Windows\debug\netlogon.log" |
    Select-String "fabrikam|TRUST|ERROR|FAIL" |
    Select-Object -Last 50
```

---

## Trust Security - Attacks and Hardening

### Dangerous Configurations

```
RISK 1: SID Filtering disabled on Forest Trust
  Enables SIDHistory Injection attack
  Check:
    Get-ADTrust -Filter * | Where-Object { $_.SIDFilteringQuarantined -eq $false }
  Fix:
    netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

RISK 2: Bidirectional Forest Trust without Selective Authentication
  All users from the trusted forest can authenticate to any server
  Check:
    Get-ADTrust -Filter * | Where-Object {
        $_.TrustAttributes -notmatch "CrossOrganization" -and
        $_.TrustType -eq "Uplevel"
    }
  Fix:
    netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

RISK 3: Legacy Trusts to Windows NT 4.0 domains
  NT 4.0 domains use LM/NTLM, no Kerberos support
  Check:
    Get-ADTrust -Filter {TrustType -eq "Downlevel"}
  Fix:
    Remove if NT 4.0 domain is no longer in use
    netdom trust contoso.com /domain:nt4domain /remove

RISK 4: Shortcut Trust to a weakly secured subdomain
  If the subdomain is compromised, the Shortcut Trust provides
  a direct path to resources in another branch of the forest
  Check:
    Get-ADTrust -Filter {TrustType -eq "Shortcut"}
  Evaluate: is this Trust still needed? What is the compromise risk?
```

### Trust Security Audit

```
# Full Trust audit for the domain
function Invoke-TrustAudit {
    $trusts = Get-ADTrust -Filter * -Properties *
    $report = @()

    foreach ($trust in $trusts) {
        $risks = @()

        # Check SID Filtering
        if (-not $trust.SIDFilteringQuarantined -and $trust.TrustType -ne "ParentChild") {
            $risks += "SID Filtering DISABLED"
        }

        # Check Selective Authentication
        if (-not ($trust.TrustAttributes -band 0x10) -and $trust.TrustType -eq "Uplevel") {
            $risks += "No Selective Authentication"
        }

        # NT4 trusts
        if ($trust.TrustType -eq "Downlevel") {
            $risks += "Legacy NT4 Trust (NTLM only)"
        }

        # RC4 encryption
        if ($trust.TrustAttributes -band 0x80) {
            $risks += "RC4 encryption (weak)"
        }

        $report += [PSCustomObject]@{
            TrustName      = $trust.Name
            Direction      = $trust.Direction
            Type           = $trust.TrustType
            SIDFiltering   = $trust.SIDFilteringQuarantined
            SelectiveAuth  = [bool]($trust.TrustAttributes -band 0x10)
            Transitive     = -not $trust.DisallowTransivity
            Risks          = ($risks -join " | ")
        }
    }

    return $report
}

$audit = Invoke-TrustAudit
$audit | Format-Table -AutoSize

# Highlight risky trusts
$audit | Where-Object { $_.Risks -ne "" } |
    Format-Table TrustName, Direction, Risks -AutoSize
```

---

## Cheat Sheet

```
# View trusts
Get-ADTrust -Filter *
Get-ADTrust -Filter * | Select-Object Name, Direction, TrustType, TrustAttributes
netdom trust contoso.com /domain:fabrikam.com /verify
nltest /domain_trusts /all_trusts

# Create trusts
netdom trust contoso.com /domain:fabrikam.com /twoway /add /passwordt:Secret
netdom trust contoso.com /domain:fabrikam.com /oneside:trusted /add    # incoming
netdom trust contoso.com /domain:fabrikam.com /oneside:trusting /add   # outgoing

# SID Filtering
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes    # enable (safe)
netdom trust contoso.com /domain:fabrikam.com /quarantine:no     # disable (risky!)

# Selective Authentication
netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

# Remove trust
netdom trust contoso.com /domain:fabrikam.com /remove /twoway

# Diagnostics
nltest /sc_verify:fabrikam.com          # verify Secure Channel
nltest /sc_reset:fabrikam.com           # reset Secure Channel
nltest /dsgetdc:fabrikam.com            # find DC
nslookup -type=SRV _ldap._tcp.fabrikam.com  # DNS check

# SIDHistory
Get-ADUser -Filter * -Properties SIDHistory | Where-Object { $_.SIDHistory }
# Clear SIDHistory
Set-ADUser "alice" -Remove @{SIDHistory = (Get-ADUser "alice" -Properties SIDHistory).SIDHistory}

# Trust types (TrustType):
# ParentChild / TreeRoot = within forest (automatic)
# Shortcut               = within forest (manual, speed optimization)
# Forest                 = between forests (manual, full)
# External               = to a single domain in another forest (manual, targeted)
# Realm                  = to a Kerberos realm (MIT/Unix)

# Direction enum:
# BiDirectional = 3
# Inbound       = 1 (we are Trusted - our users go OUT)
# Outbound      = 2 (we are Trusting - foreign users come IN)
```

---

## References

- [AD Trust Types](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/trust-types) - official documentation
- [Forest Design Models](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/forest-design-models) - forest planning
- [How Domain and Forest Trusts Work](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/how-domain-and-forest-trusts-work) - SID Filtering mechanism
- [Selective Authentication](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/best-practices-for-securing-active-directory) - best practices
- [netdom reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc835085(v=ws.11)) - netdom commands
- [Trust Attacks (ired.team)](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse) - attacks via Trust
