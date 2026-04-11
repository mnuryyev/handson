---
title: "Active Directory - Domains, Trees, Forests"
date: "2026-04-11"
---

Active Directory (AD) is Microsoft's directory service and the central component for identity and access management in enterprise Windows networks. It stores information about all network objects: users, computers, groups, and policies.

---

## Why Active Directory Exists

Without AD (workgroup):
- Each machine manages its own users independently
- No centralized authentication
- No unified security policies
- At 50+ machines — management becomes chaos

With AD:
- Single sign-on for all network resources (SSO)
- Centralized policy management (GPO)
- Single user and group database
- Kerberos-based authentication
- Domain-level audit and logging

---

## Core Components

### Logical Structure

```
Forest
└── Tree: contoso.com
    ├── Domain: contoso.com        ← tree root domain
    │   ├── OU: IT
    │   │   ├── OU: Servers
    │   │   └── OU: Workstations
    │   ├── OU: HR
    │   ├── OU: Finance
    │   └── Objects: users, groups, computers
    │
    ├── Child domain: europe.contoso.com
    │   ├── OU: London
    │   └── OU: Paris
    │
    └── Child domain: asia.contoso.com
        ├── OU: Tokyo
        └── OU: Singapore

└── Tree: fabrikam.com           ← another tree in the same forest
    └── Domain: fabrikam.com
```

### Physical Structure

```
Forest
└── Site: HQ-NewYork
    ├── DC1.contoso.com (Domain Controller)
    ├── DC2.contoso.com (Domain Controller)
    └── Client machines

└── Site: London-Office
    ├── DC3.europe.contoso.com
    └── Client machines

└── Site Links
    └── HQ-NewYork ←→ London-Office (replication every 180 min)
```

---

## Domain

A domain is the basic administrative unit of AD. It is a boundary for security, replication, and administrative management.

### Domain characteristics

```
Domain name:       contoso.com (DNS name)
NetBIOS name:      CONTOSO (legacy style, ≤15 characters)
SID:               S-1-5-21-xxxxxxxxxx (unique identifier)
Functional level:  Windows Server 2016 / 2019 / 2022
```

### Domain Controller (DC)

A DC is a Windows Server machine with the Active Directory Domain Services (AD DS) role. It holds a full copy of the domain database (NTDS.dit).

```
NTDS.dit - the primary AD database file
Location: C:\Windows\NTDS\ntds.dit
Size:     from a few MB to tens of GB (depends on domain size)
Format:   ESE (Extensible Storage Engine) — Microsoft Jet database
```

```powershell
# Install AD DS role and create first DC (new forest)
Install-WindowsFeature -Name AD-Domain-Services -IncludeManagementTools

Import-Module ADDSDeployment
Install-ADDSForest `
    -DomainName "contoso.com" `
    -DomainNetbiosName "CONTOSO" `
    -ForestMode "WinThreshold" `
    -DomainMode "WinThreshold" `
    -InstallDns `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force

# Add DC to an existing domain
Install-ADDSDomainController `
    -DomainName "contoso.com" `
    -InstallDns `
    -Credential (Get-Credential) `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force

# Create a child domain
Install-ADDSDomain `
    -NewDomainName "europe" `
    -ParentDomainName "contoso.com" `
    -DomainMode "WinThreshold" `
    -InstallDns `
    -Credential (Get-Credential) `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force
```

### Functional Level

Determines which AD features are available. Depends on the minimum Windows Server version across all DCs.

| Functional Level | Min DC OS | Key Features |
|------------------|-----------|--------------|
| Windows Server 2008 R2 | WS 2008 R2 | Managed Service Accounts |
| Windows Server 2012 | WS 2012 | KDC claims support |
| Windows Server 2012 R2 | WS 2012 R2 | Protected Users, Authentication Policies |
| Windows Server 2016 | WS 2016 | Privileged Access Management |
| Windows Server 2019 | WS 2019 | No new AD features |
| Windows Server 2022 | WS 2022 | — |

```powershell
# View functional level
Get-ADDomain | Select-Object DomainMode
Get-ADForest | Select-Object ForestMode

# Raise functional level (irreversible!)
Set-ADDomainMode -Identity "contoso.com" -DomainMode Windows2016Domain
Set-ADForestMode -Identity "contoso.com" -ForestMode Windows2016Forest
```

---

## Organizational Units (OU)

An OU is a container within a domain used to organize objects. It allows delegating administration and applying GPOs to a group of objects.

```
OU hierarchy in domain contoso.com:
─────────────────────────────────────────────
contoso.com
├── Builtin          ← built-in groups (not an OU, no GPO)
├── Computers        ← default container for new computers (not an OU!)
├── Users            ← default container for new users (not an OU!)
│
├── OU=Corporate     ← custom OUs
│   ├── OU=IT
│   │   ├── OU=Admins
│   │   │   └── user: john.doe (CN=John Doe,OU=Admins,OU=IT,OU=Corporate,DC=contoso,DC=com)
│   │   └── OU=HelpDesk
│   ├── OU=HR
│   └── OU=Finance
│
└── OU=Servers
    ├── OU=Domain Controllers  ← created automatically
    ├── OU=File Servers
    └── OU=Web Servers
```

```powershell
# Manage OUs
New-ADOrganizationalUnit -Name "IT" -Path "OU=Corporate,DC=contoso,DC=com"
New-ADOrganizationalUnit -Name "Admins" -Path "OU=IT,OU=Corporate,DC=contoso,DC=com"

# Protect from accidental deletion (recommended)
New-ADOrganizationalUnit -Name "Finance" -Path "DC=contoso,DC=com" `
    -ProtectedFromAccidentalDeletion $true

# Move object to another OU
Move-ADObject -Identity "CN=John Doe,OU=HR,DC=contoso,DC=com" `
              -TargetPath "OU=IT,DC=contoso,DC=com"

# Remove OU (disable protection first)
Set-ADOrganizationalUnit -Identity "OU=OldOU,DC=contoso,DC=com" `
    -ProtectedFromAccidentalDeletion $false
Remove-ADOrganizationalUnit -Identity "OU=OldOU,DC=contoso,DC=com"

# List all OUs
Get-ADOrganizationalUnit -Filter * | Select-Object Name, DistinguishedName
```

---

## Tree

A tree is a group of domains sharing a common root DNS namespace. All domains in a tree have two-way transitive trust relationships.

```
Tree contoso.com:

contoso.com                    ← tree root
├── europe.contoso.com         ← child domain (DNS subdomain)
│   ├── uk.europe.contoso.com
│   └── de.europe.contoso.com
└── asia.contoso.com
    ├── jp.asia.contoso.com
    └── sg.asia.contoso.com

Trust relationships:
contoso.com ←──── two-way transitive trust ────► europe.contoso.com
europe.contoso.com ◄─────────────────────────► uk.europe.contoso.com

Transitivity means:
If A trusts B, and B trusts C → A automatically trusts C
```

---

## Forest

A forest is the highest level of AD hierarchy. It contains one or more trees. It is the **security boundary** - objects in one forest have no automatic access to resources in another forest.

### Forest structure

```
Forest: contoso.com (forest name = root domain name)
│
├── Tree 1: contoso.com
│   ├── contoso.com (Forest Root Domain)
│   └── europe.contoso.com
│
└── Tree 2: fabrikam.com    ← different DNS namespace
    ├── fabrikam.com
    └── uk.fabrikam.com

Between trees: two-way transitive trust
```

### Forest Root Domain

The first domain created in the forest. Special status:
- Contains the **Schema Admins** and **Enterprise Admins** groups
- Stores the **Configuration** and **Schema** naming contexts
- Cannot be renamed or deleted without rebuilding the forest

### Objects shared across the forest

```
Objects shared by the entire forest:
┌────────────────────────────────────────────────────────────┐
│  Schema        - defines all object classes and attributes  │
│  Configuration - forest configuration (sites, replication)  │
│  Forest Root DNS - root DNS namespace                       │
│  Global Catalog - partial replicas of all domain objects    │
│  Enterprise Admins - administrators of the entire forest    │
│  Schema Admins - can modify the schema                      │
└────────────────────────────────────────────────────────────┘
```

---

## Trust Relationships

Trusts allow users in one domain/forest to access resources in another.

### Trust types

```
By direction:
──────────────────────────────────────────────────────────────
One-way:
  A ──[trusts]──► B
  Users from B can access resources in A
  Users from A CANNOT access resources in B

Two-way (Bidirectional):
  A ◄──[trust]──► B
  Users in both domains can access each other's resources

By transitivity:
──────────────────────────────────────────────────────────────
Transitive:
  A trusts B, B trusts C → A automatically trusts C
  (all trusts within a forest are transitive)

Non-transitive:
  A trusts B, B trusts C → A does NOT automatically trust C
```

### Trust relationship types in AD

| Type | Direction | Transitive | Automatic? |
|------|-----------|------------|------------|
| Parent-Child | Two-way | Yes | Yes (when child domain is created) |
| Tree-Root | Two-way | Yes | Yes (when new tree is created) |
| Shortcut | One or two-way | No | No (manual) |
| Forest | One or two-way | Yes | No (manual) |
| External | One or two-way | No | No (manual) |
| Realm | One or two-way | Yes/No | No (for Kerberos V5) |

```powershell
# View trusts
Get-ADTrust -Filter *
Get-ADTrust -Identity "fabrikam.com"

# Create a forest trust
netdom trust contoso.com /domain:fabrikam.com /twoway /add

# Verify a trust
netdom trust contoso.com /domain:fabrikam.com /verify

# Create a shortcut trust (speeds up authentication)
netdom trust europe.contoso.com /domain:asia.contoso.com /twoway /add
```

---

## Active Directory Replication

AD is a multi-master database. Every DC holds its own copy and replicates changes to other DCs.

### Naming Contexts (Partitions)

```
Partition           Replicated to                    Content
──────────────────────────────────────────────────────────────────
Domain NC           All DCs in the same domain        Users, groups, computers
Configuration NC    All DCs in the entire forest      Site/replication config
Schema NC           All DCs in the entire forest      Class and attribute definitions
Global Catalog      Selected GC servers               Subset of attributes from all objects
DNS Application NC  DCs with the DNS role             DNS zones
```

### Replication mechanism

```
Replication topology built automatically by KCC
(Knowledge Consistency Checker)

Intrasite (within a site):
- Change notification: 15 seconds
- Uses RPC over IP
- Compression: no

Intersite (between sites):
- Scheduled: every 180 minutes by default
- Uses RPC or SMTP
- Compression: yes (for traffic > 50 KB)

USN (Update Sequence Number) — logical clock for replication
Every object change increments the USN on that DC
```

```powershell
# Replication status
repadmin /showrepl
repadmin /replsummary
repadmin /showrepl DC1

# Force replication
repadmin /syncall /AdeP
repadmin /replicate DC2 DC1 "DC=contoso,DC=com"

# Find replication errors
repadmin /showrepl * /csv > replication.csv
repadmin /errorsonly

# Show replication partners
repadmin /showconn

# Object metadata (change history)
repadmin /showobjmeta DC1 "CN=John Doe,OU=Users,DC=contoso,DC=com"
```

---

## FSMO Roles

FSMO (Flexible Single Master Operations) - 5 special roles performed by only one DC per domain/forest.

### Forest-level roles (one per forest)

| Role | What it does |
|------|--------------|
| **Schema Master** | The only DC that can modify the AD schema |
| **Domain Naming Master** | Controls adding/removing domains in the forest |

### Domain-level roles (one per domain)

| Role | What it does |
|------|--------------|
| **PDC Emulator** | Time synchronization, account lockouts, password changes, GPO |
| **RID Master** | Issues RID pools (used to construct SIDs) |
| **Infrastructure Master** | Updates cross-domain object references |

```powershell
# Find FSMO role owners
netdom query fsmo
Get-ADDomain | Select-Object PDCEmulator, RIDMaster, InfrastructureMaster
Get-ADForest | Select-Object SchemaMaster, DomainNamingMaster

# Transfer a role (graceful)
Move-ADDirectoryServerOperationMasterRole -Identity "DC2" `
    -OperationMasterRole PDCEmulator, RIDMaster

# Seize a role (only if the old DC is permanently gone!)
Move-ADDirectoryServerOperationMasterRole -Identity "DC2" `
    -OperationMasterRole PDCEmulator -Force

# Via ntdsutil (classic method)
ntdsutil
# roles
# connections
# connect to server DC2
# quit
# seize PDC
```

---

## Global Catalog (GC)

A partial replica of all objects from all domains in the forest. Contains the most frequently queried attributes.

```
Why GC is needed:
1. Search for objects across the entire forest (without knowing their domain)
2. Resolve UPN at login (user@contoso.com)
3. Universal Group membership resolution
4. Exchange: find recipients across the forest

GC ports:
3268  - LDAP for Global Catalog (unencrypted)
3269  - LDAPS for Global Catalog (encrypted)
```

```powershell
# Make a DC a Global Catalog server
Set-ADObject -Identity "CN=DC1,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=contoso,DC=com" `
    -Add @{options='1'}

# Check GC servers
Get-ADDomainController -Filter {IsGlobalCatalog -eq $true}
```

---

## Active Directory Schema

The schema is the set of rules defining which object classes and attributes exist in AD.

```
Class (objectClass):    Attributes:
─────────────────────────────────────────────────────
user                    sAMAccountName, userPrincipalName,
                        givenName, sn, mail, department,
                        memberOf, pwdLastSet, ...

computer                sAMAccountName, dNSHostName,
                        operatingSystem, ...

group                   sAMAccountName, groupType, member, ...

organizationalUnit      ou, description, gPLink, ...
```

---

## Active Directory Objects

### Users

```powershell
# Create a user
New-ADUser `
    -Name "John Doe" `
    -GivenName "John" `
    -Surname "Doe" `
    -SamAccountName "john.doe" `
    -UserPrincipalName "john.doe@contoso.com" `
    -Path "OU=IT,DC=contoso,DC=com" `
    -AccountPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Enabled $true `
    -PasswordNeverExpires $false `
    -ChangePasswordAtLogon $true

# Modify a user
Set-ADUser -Identity "john.doe" -Department "IT" -Title "System Administrator"

# Unlock account
Unlock-ADAccount -Identity "john.doe"

# Reset password
Set-ADAccountPassword -Identity "john.doe" `
    -NewPassword (ConvertTo-SecureString "NewP@ss!" -AsPlainText -Force) `
    -Reset

# Disable / enable
Disable-ADAccount -Identity "john.doe"
Enable-ADAccount -Identity "john.doe"

# Search users
Get-ADUser -Filter {Department -eq "IT"} -Properties *
Get-ADUser -Filter {Enabled -eq $false} | Select-Object Name, SamAccountName
Get-ADUser -Identity "john.doe" -Properties MemberOf | Select-Object -ExpandProperty MemberOf
```

### Groups

```
Group types:
┌─────────────────┬────────────────────────────────────────────────┐
│ Security        │ Used for assigning access permissions          │
│ Distribution    │ Email distribution lists only (Exchange)       │
└─────────────────┴────────────────────────────────────────────────┘

Group scopes:
┌──────────────────┬────────────────────────────────────────────────┐
│ Domain Local     │ Members from any domain in the forest          │
│                  │ Assign permissions only in own domain          │
├──────────────────┼────────────────────────────────────────────────┤
│ Global           │ Members from the same domain only              │
│                  │ Used to group users from one domain            │
├──────────────────┼────────────────────────────────────────────────┤
│ Universal        │ Members from any domain in the forest          │
│                  │ Stored in Global Catalog                       │
│                  │ For cross-domain permission assignment         │
└──────────────────┴────────────────────────────────────────────────┘

Recommended strategy: A-G-DL-P
Accounts → Global Groups → Domain Local Groups → Permissions
```

```powershell
# Create a group
New-ADGroup -Name "IT-Admins" `
    -GroupCategory Security `
    -GroupScope Global `
    -Path "OU=Groups,DC=contoso,DC=com"

# Add members
Add-ADGroupMember -Identity "IT-Admins" -Members "john.doe", "jane.smith"
Add-ADGroupMember -Identity "IT-Admins" -Members (Get-ADUser -Filter {Department -eq "IT"})

# Nested groups
Add-ADGroupMember -Identity "DL-FileServer-Read" -Members "IT-Admins"

# Remove member
Remove-ADGroupMember -Identity "IT-Admins" -Members "john.doe" -Confirm:$false

# List group members
Get-ADGroupMember -Identity "IT-Admins" -Recursive
```

### Computers

```powershell
# Join a computer to the domain (run on the target machine)
Add-Computer -DomainName "contoso.com" -Credential (Get-Credential) -Restart

# Pre-create a computer account
New-ADComputer -Name "WKS001" -Path "OU=Workstations,DC=contoso,DC=com"

# Find computers
Get-ADComputer -Filter {OperatingSystem -like "*Server*"} -Properties OperatingSystem
Get-ADComputer -Filter {LastLogonDate -lt (Get-Date).AddDays(-90)}  # inactive 90+ days

# Disable computer account
Disable-ADAccount -Identity "WKS001$"
```

---

## Authentication in AD

### Kerberos

Primary authentication protocol in AD (port 88).

```
Client          KDC (DC)              Resource
  │                │                     │
  │ 1. AS-REQ      │                     │
  │───────────────►│                     │
  │                │                     │
  │ 2. AS-REP      │                     │
  │ (TGT + key)    │                     │
  │◄───────────────│                     │
  │                │                     │
  │ 3. TGS-REQ     │                     │
  │ (TGT + SPN)    │                     │
  │───────────────►│                     │
  │                │                     │
  │ 4. TGS-REP     │                     │
  │ (Service Ticket)│                    │
  │◄───────────────│                     │
  │                                      │
  │ 5. AP-REQ (Service Ticket)           │
  │─────────────────────────────────────►│
  │                                      │
  │ 6. Access granted                    │
  │◄─────────────────────────────────────│

TGT = Ticket Granting Ticket (valid 10 hours by default)
SPN = Service Principal Name (service identifier)
```

### NTLM — legacy protocol

NTLM is used when Kerberos is unavailable (no DNS, no DC, IP address instead of hostname).

```
Client          Server          DC
  │               │               │
  │ 1. Negotiate  │               │
  │──────────────►│               │
  │               │               │
  │ 2. Challenge  │               │
  │◄──────────────│               │
  │               │               │
  │ 3. Response   │               │
  │  (NTLM Hash)  │               │
  │──────────────►│               │
  │               │ 4. Verify     │
  │               │──────────────►│
  │               │               │
  │               │ 5. Success    │
  │               │◄──────────────│
  │               │               │
  │ 6. Access     │               │
  │◄──────────────│               │
```

---

## AD Diagnostics

```powershell
# Core diagnostics
dcdiag                               # full DC health check
dcdiag /test:replications            # replication only
dcdiag /test:dns                     # DNS only
dcdiag /s:DC1 /v                     # specific DC, verbose

# Replication
repadmin /showrepl                   # replication status
repadmin /replsummary                # summary
repadmin /showvector /latency DC1 "DC=contoso,DC=com"

# Domain and forest info
Get-ADDomain
Get-ADForest
Get-ADDomainController -Filter *

# DNS validation for AD
nslookup -type=SRV _ldap._tcp.contoso.com
nslookup -type=SRV _kerberos._tcp.contoso.com
nslookup -type=SRV _gc._tcp.contoso.com

# Kerberos tickets
klist                                # current tickets
klist purge                          # clear all tickets
klist tgt                            # TGT only

# Time sync (critical for Kerberos — ±5 minute tolerance)
w32tm /query /status
w32tm /resync
w32tm /monitor

# DC connectivity check
nltest /dsgetdc:contoso.com
nltest /sc_verify:contoso.com        # verify secure channel
nltest /sc_reset:contoso.com         # recreate secure channel

# Event logs
Get-WinEvent -LogName "Directory Service" -MaxEvents 50
Get-WinEvent -LogName "Security" | Where-Object {$_.Id -in 4624,4625,4634,4648}
```

---

## Useful LDAP Queries

```powershell
# Users with stale passwords (90+ days)
$date = (Get-Date).AddDays(-90).ToFileTime()
Get-ADUser -LDAPFilter "(&(objectClass=user)(pwdLastSet<=$date)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"

# Users with "Password never expires"
Get-ADUser -Filter {PasswordNeverExpires -eq $true} -Properties PasswordNeverExpires

# Computers running Windows XP (security risk)
Get-ADComputer -Filter {OperatingSystem -like "*XP*"} -Properties OperatingSystem

# Empty groups
Get-ADGroup -Filter * | Where-Object {-not (Get-ADGroupMember $_)}

# Users inactive for 90+ days
$date = (Get-Date).AddDays(-90)
Get-ADUser -Filter {LastLogonDate -lt $date -and Enabled -eq $true} `
    -Properties LastLogonDate | Select-Object Name, LastLogonDate
```

---

## Cheat Sheet

```
AD hierarchy (top to bottom):
Forest > Tree > Domain > OU > Object

Key DC files:
C:\Windows\NTDS\ntds.dit          — AD database
C:\Windows\NTDS\*.log             — transaction logs
C:\Windows\SYSVOL\                — scripts, GPT (GPO templates)

Key AD ports:
88    Kerberos
135   RPC Endpoint Mapper
389   LDAP
445   SMB (SYSVOL, NETLOGON)
464   Kerberos password change
636   LDAPS
3268  Global Catalog LDAP
3269  Global Catalog LDAPS
49152-65535  RPC Dynamic Ports

FSMO roles:
Forest: Schema Master, Domain Naming Master
Domain: PDC Emulator, RID Master, Infrastructure Master

Group types:
Security vs Distribution
Domain Local / Global / Universal

Default trusts:
Parent↔Child:    two-way, transitive, automatic
Different trees: two-way, transitive, automatic
Different forests: configured manually
```

---

## References

- [Microsoft Docs: AD DS](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview) - official documentation
- [Active Directory PowerShell](https://learn.microsoft.com/en-us/powershell/module/activedirectory/) - AD PowerShell module
- [repadmin reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc770963(v=ws.11)) - repadmin commands
- [dcdiag reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc731968(v=ws.11)) - dcdiag commands
