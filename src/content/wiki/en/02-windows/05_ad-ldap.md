---
title: "Active Directory - LDAP: Structure and Queries"
date: "2026-04-25"
---

LDAP (Lightweight Directory Access Protocol) is the protocol applications use to interact with Active Directory. AD is essentially an LDAP-compatible directory with Microsoft extensions.

---

## LDAP Basics in the AD Context

```
Ports:
389   - LDAP (unencrypted or STARTTLS)
636   - LDAPS (SSL/TLS, legacy method)
3268  - Global Catalog LDAP (search across the entire forest)
3269  - Global Catalog LDAPS

Version: LDAP v3 (RFC 4511)

Transport:
LDAP  → TCP/UDP 389 (UDP only for connectionless simple bind)
LDAPS → TCP 636 (TLS over TCP)
```

---

## Directory Structure - DIT and DN

### Directory Information Tree (DIT)

AD stores objects in a tree. Every object has a unique Distinguished Name (DN).

```
DC=contoso,DC=com                           ← domain root
├── CN=Users                                ← built-in container
│   ├── CN=Alice Smith                      ← user
│   ├── CN=Domain Admins                    ← group
│   └── CN=Administrator                   ← user
├── CN=Computers                            ← built-in container
│   └── CN=WORKSTATION01                    ← computer
├── OU=IT                                   ← organizational unit
│   ├── OU=Servers
│   │   └── CN=WEB01                        ← computer
│   └── OU=Users
│       └── CN=Bob Jones                    ← user
├── CN=System                               ← system container
└── CN=Configuration                        ← configuration (separate NC)
```

### Distinguished Name (DN)

```
DN is read right-to-left from the root:

CN=Alice Smith,OU=Users,OU=IT,DC=contoso,DC=com
│              │         │    └────────────────── domain suffix (Naming Context)
│              │         └───────────────────── OU "IT"
│              └─────────────────────────────── OU "Users" inside IT
└────────────────────────────────────────────── the user object itself

RDN (Relative Distinguished Name) components:
CN  — Common Name     (objects, groups, users)
OU  — Organizational Unit
DC  — Domain Component  (parts of the domain name)
O   — Organization
L   — Locality
C   — Country
```

### Naming Contexts (NC) in AD

```
Each DC holds several partitions:

DC=contoso,DC=com                            ← Domain NC (primary)
CN=Configuration,DC=contoso,DC=com           ← Configuration NC (forest-wide)
CN=Schema,CN=Configuration,DC=contoso,DC=com ← Schema NC (forest-wide)
DC=DomainDnsZones,DC=contoso,DC=com          ← Application NC (DNS)
DC=ForestDnsZones,DC=contoso,DC=com          ← Application NC (forest DNS)
```

```bash
# Get rootDSE — server information
ldapsearch -H ldap://dc01.contoso.com -x -b "" -s base "(objectClass=*)"
# Response includes:
# namingContexts: DC=contoso,DC=com
# defaultNamingContext: DC=contoso,DC=com
# schemaNamingContext: CN=Schema,CN=Configuration,DC=contoso,DC=com
# configurationNamingContext: CN=Configuration,DC=contoso,DC=com
# dnsHostName: dc01.contoso.com
# supportedLDAPVersion: 3
```

---

## Objects and Attributes

### Main Object Classes

```
objectClass defines the object type and the allowed attributes.

user           - domain user
computer       - domain computer  (inherits from user!)
group          - security or distribution group
organizationalUnit - OU container
contact        - contact (no account)
container      - plain container (CN=Users, CN=Computers)
domainDNS      - domain
builtinDomain  - built-in container (CN=Builtin)
trustedDomain  - domain trust
serviceConnectionPoint - service connection point
```

### Key Attributes of the user Object

```
Identity:
sAMAccountName     - login (CONTOSO\alice)
userPrincipalName  - UPN (alice@contoso.com)
distinguishedName  - full DN
objectSID          - security SID (S-1-5-21-...)
objectGUID         - GUID (immutable identifier)

Personal data:
cn                 - Common Name (Alice Smith)
givenName          - first name (Alice)
sn                 - surname (Smith)
displayName        - display name
mail               - email address
telephoneNumber    - phone number
department         - department
title              - job title
company            - company
manager            - DN reference to the manager
memberOf           - list of group DNs (multi-valued)

Authentication:
userAccountControl - account flags (disabled, locked, etc.)
pwdLastSet         - password last changed (FILETIME)
accountExpires     - account expiry date (FILETIME)
lockoutTime        - lockout timestamp (FILETIME)
badPwdCount        - failed login attempts
lastLogon          - last logon (local DC only!)
lastLogonTimestamp - last logon (replicated, ~14 day accuracy)

Technical:
objectClass        - object classes (multi-valued)
whenCreated        - creation date (GeneralizedTime)
whenChanged        - last modification date
uSNCreated         - USN on creation (for replication)
uSNChanged         - USN on last change
```

### Attribute Syntax

```
Important value types:

FILETIME          - 100-ns intervals since 01/01/1601
                    0 = "never" (for accountExpires)
                    9999999999999999 = "never expires"
                    Conversion: (value / 10000000) - 11644473600 = Unix timestamp

GeneralizedTime   — YYYYMMDDHHmmSS.0Z
                    Example: 20240115102233.0Z

Boolean           — TRUE / FALSE

Integer           — integer number

BitString         — bit field (userAccountControl)

DN                — Distinguished Name reference to another object

SID               — Binary (16+ bytes)

GUID              — Binary (16 bytes), displayed as {xxxxxxxx-xxxx-...}
```

---

## LDAP Queries — Filter Syntax

### Basic Filter Syntax

```
(attribute=value)          — exact equality
(attribute>=value)         — greater than or equal
(attribute<=value)         — less than or equal
(attribute=*)              — attribute exists (present)
(attribute~=value)         — approximate match
(!(filter))                — NOT
(&(filter1)(filter2))      — AND
(|(filter1)(filter2))      — OR
(attribute=*substring*)    — substring search
(attribute=prefix*)        — starts with
(attribute=*suffix)        — ends with
```

### Special OID Syntax (bitwise operations)

```
For bit fields (userAccountControl):
attribute:1.2.840.113556.1.4.803:=value   — AND (bit is set)
attribute:1.2.840.113556.1.4.804:=value   — OR (any bit is set)
attribute:1.2.840.113556.1.4.1941:=DN     — recursive group membership

Examples:
(userAccountControl:1.2.840.113556.1.4.803:=2)      — account disabled (bit 2)
(userAccountControl:1.2.840.113556.1.4.803:=65536)  — password never expires
(member:1.2.840.113556.1.4.1941:=CN=alice,DC=...)   — recursively member of group
```

### Practical Filters

```ldap
# All domain users
(objectClass=user)

# Only users (not computers — they are also objectClass=user)
(&(objectClass=user)(objectCategory=person))

# Only computers
(objectClass=computer)

# Only groups
(objectClass=group)

# Only OUs
(objectClass=organizationalUnit)

# Active (not disabled) users
(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))

# Disabled accounts
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))

# Users with "password never expires"
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=65536))

# Locked out accounts
(&(objectClass=user)(lockoutTime>=1))

# Users without PreAuth (vulnerable to AS-REP Roasting)
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))

# Users with SPN (vulnerable to Kerberoasting)
(&(objectClass=user)(servicePrincipalName=*))

# Users in a specific department
(&(objectClass=user)(department=IT))

# Users with login starting with "Al"
(&(objectClass=user)(sAMAccountName=Al*))

# Users with email in the domain
(&(objectClass=user)(mail=*@contoso.com))

# Computers running Windows Server
(&(objectClass=computer)(operatingSystem=Windows Server*))

# Direct members of a group
(memberOf=CN=Domain Admins,CN=Users,DC=contoso,DC=com)

# Recursive membership (including nested groups)
(memberOf:1.2.840.113556.1.4.1941:=CN=Domain Admins,CN=Users,DC=contoso,DC=com)

# Objects modified after a specific date
(whenChanged>=20240101000000.0Z)

# HTTP SPNs (Kerberoasting targets)
(&(objectClass=user)(servicePrincipalName=http/*))

# Unconstrained delegation
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=524288))
```

---

## LDAP Search Parameters

### Base DN, Scope, Filter, Attributes

```
An LDAP query consists of:
1. Base DN    — where to start searching
2. Scope      — search depth
3. Filter     — what to search for
4. Attributes — which attributes to return

Scope values:
base        — only the Base DN object itself
one         — only immediate children
sub (subtree) — full subtree (default, recursive)
```

---

## LDAP Query Tools

### ldapsearch (Linux)

```bash
# Install
apt install ldap-utils

# Syntax:
ldapsearch -H ldap://server -D "bindDN" -w password -b "baseDN" -s scope "filter" attributes

# Password authentication
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" \
    -w "MyPassword" \
    -b "DC=contoso,DC=com" \
    "(objectClass=user)" \
    sAMAccountName displayName mail

# Kerberos authentication (via ccache)
kinit alice@CONTOSO.COM
ldapsearch -H ldap://dc01.contoso.com \
    -Y GSSAPI \
    -b "DC=contoso,DC=com" \
    "(&(objectClass=user)(department=IT))" \
    sAMAccountName displayName

# LDAPS (SSL)
ldapsearch -H ldaps://dc01.contoso.com \
    -D "alice@contoso.com" \
    -w "MyPassword" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=alice)"

# Get specific user
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=bob.jones)" \
    "*"                          # all attributes

# Find a user's groups
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=alice)" \
    memberOf

# Paged results (PagedResultsControl)
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    -E pr=1000/noprompt \
    "(objectClass=user)" \
    sAMAccountName

# Global Catalog (search across the forest)
ldapsearch -H ldap://dc01.contoso.com:3268 \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(mail=bob@fabrikam.com)" \
    sAMAccountName
```

### PowerShell - Get-ADObject

```powershell
Import-Module ActiveDirectory

# Basic user search
Get-ADUser -Filter {SamAccountName -eq "alice.smith"}

# LDAP filter (faster for complex queries)
Get-ADUser -LDAPFilter "(&(objectClass=user)(department=IT))"

# All attributes
Get-ADUser -Identity "alice.smith" -Properties *

# Specific attributes
Get-ADUser -Filter * -Properties DisplayName, Department, Mail, LastLogonDate |
    Select-Object Name, DisplayName, Department, Mail, LastLogonDate

# Universal object search
Get-ADObject -LDAPFilter "(objectClass=*)" -SearchBase "OU=IT,DC=contoso,DC=com"

# Find users with SPN
Get-ADObject -LDAPFilter "(&(objectClass=user)(servicePrincipalName=*))" `
    -Properties servicePrincipalName

# Raw .NET LDAP
$searcher = New-Object DirectoryServices.DirectorySearcher
$searcher.SearchRoot = New-Object DirectoryServices.DirectoryEntry("LDAP://DC=contoso,DC=com")
$searcher.Filter = "(&(objectClass=user)(department=IT))"
$searcher.PropertiesToLoad.AddRange(@("sAMAccountName","displayName","mail","memberOf"))
$searcher.PageSize = 1000

$results = $searcher.FindAll()
foreach ($result in $results) {
    [PSCustomObject]@{
        Login   = $result.Properties["samaccountname"][0]
        Name    = $result.Properties["displayname"][0]
        Email   = $result.Properties["mail"][0]
        Groups  = $result.Properties["memberof"] -join "; "
    }
}
$results.Dispose()

# Global Catalog search
$gc = New-Object DirectoryServices.DirectoryEntry("GC://contoso.com")
$gcSearcher = New-Object DirectoryServices.DirectorySearcher($gc)
$gcSearcher.Filter = "(mail=bob@fabrikam.com)"
$gcSearcher.FindOne()
```

### Python - ldap3

```python
import ldap3
from datetime import datetime, timezone

class ADConnector:
    def __init__(self, server: str, username: str, password: str,
                 base_dn: str, use_ssl: bool = True):
        self.base_dn = base_dn
        srv = ldap3.Server(server, port=636 if use_ssl else 389,
                           use_ssl=use_ssl, get_info=ldap3.ALL)
        self.conn = ldap3.Connection(
            srv, user=username, password=password,
            authentication=ldap3.NTLM, auto_bind=True
        )

    def get_user(self, username: str) -> dict | None:
        self.conn.search(
            self.base_dn,
            f"(sAMAccountName={username})",
            attributes=["sAMAccountName", "displayName", "mail",
                        "department", "title", "memberOf",
                        "userAccountControl", "pwdLastSet"]
        )
        if not self.conn.entries:
            return None
        entry = self.conn.entries[0]
        return {
            "login":      str(entry.sAMAccountName),
            "name":       str(entry.displayName),
            "email":      str(entry.mail),
            "department": str(entry.department),
            "groups":     [str(g) for g in entry.memberOf],
            "enabled":    not bool(int(str(entry.userAccountControl)) & 2),
        }

    def find_users(self, filter_str: str, attributes: list = None) -> list:
        attrs = attributes or ["sAMAccountName", "displayName", "mail"]
        self.conn.search(
            self.base_dn,
            f"(&(objectClass=user)(objectCategory=person){filter_str})",
            attributes=attrs,
            paged_size=1000
        )
        return self.conn.entries

    def is_member_of(self, username: str, group_dn: str) -> bool:
        """Recursive group membership check"""
        self.conn.search(
            self.base_dn,
            f"(&(sAMAccountName={username})"
            f"(memberOf:1.2.840.113556.1.4.1941:={group_dn}))",
            attributes=["sAMAccountName"]
        )
        return len(self.conn.entries) > 0

    def close(self):
        self.conn.unbind()


# Usage:
ad = ADConnector(
    server="dc01.contoso.com",
    username="contoso\\svc-app",
    password="ServiceP@ss!",
    base_dn="DC=contoso,DC=com"
)

user = ad.get_user("alice.smith")
print(user)

it_users = ad.find_users("(department=IT)")
for u in it_users:
    print(u.sAMAccountName, u.displayName)

is_admin = ad.is_member_of("alice.smith",
    "CN=Domain Admins,CN=Users,DC=contoso,DC=com")
print(f"Is Domain Admin: {is_admin}")

ad.close()
```

---

## Practical Query Examples

### Inventory

```powershell
# All users with details to CSV
Get-ADUser -Filter * -Properties * |
    Select-Object sAMAccountName, DisplayName, EmailAddress, Department, `
        Title, Enabled, PasswordLastSet, LastLogonDate, `
        PasswordNeverExpires, LockedOut |
    Export-Csv -Path "C:\users_inventory.csv" -NoTypeInformation -Encoding UTF8

# All computers with OS info
Get-ADComputer -Filter * -Properties OperatingSystem, OperatingSystemVersion, `
    LastLogonDate, IPv4Address |
    Select-Object Name, OperatingSystem, OperatingSystemVersion, `
        LastLogonDate, IPv4Address |
    Export-Csv "C:\computers.csv" -NoTypeInformation

# All groups with members
Get-ADGroup -Filter * | ForEach-Object {
    $group = $_
    Get-ADGroupMember $group -Recursive | ForEach-Object {
        [PSCustomObject]@{
            GroupName  = $group.Name
            MemberName = $_.Name
            MemberType = $_.objectClass
        }
    }
} | Export-Csv "C:\group_members.csv" -NoTypeInformation
```

### Security and Auditing

```powershell
# Find users with dangerous settings
$dangerous = Get-ADUser -Filter * -Properties * | Where-Object {
    $_.PasswordNeverExpires -eq $true -or
    $_.DoesNotRequirePreAuth -eq $true -or
    ($_.ServicePrincipalNames -ne $null -and $_.ServicePrincipalNames.Count -gt 0)
} | Select-Object sAMAccountName, Enabled,
    PasswordNeverExpires, DoesNotRequirePreAuth, ServicePrincipalNames

# Find computers with Unconstrained Delegation
Get-ADComputer -Filter * -Properties TrustedForDelegation |
    Where-Object {$_.TrustedForDelegation -eq $true} |
    Select-Object Name, DistinguishedName

# Find accounts protected by AdminSDHolder
Get-ADUser -LDAPFilter "(adminCount=1)" -Properties adminCount |
    Select-Object sAMAccountName, DistinguishedName
```

### Working with FILETIME Dates

```powershell
function Convert-FileTime {
    param([long]$fileTime)
    if ($fileTime -eq 0 -or $fileTime -eq 9223372036854775807) {
        return "Never"
    }
    [DateTime]::FromFileTime($fileTime)
}

# Users inactive for 90+ days
$cutoff = (Get-Date).AddDays(-90).ToFileTime()
Get-ADUser -Filter * -Properties lastLogonTimestamp |
    Where-Object {
        $_.lastLogonTimestamp -lt $cutoff -or
        $_.lastLogonTimestamp -eq $null
    } |
    Select-Object sAMAccountName, @{
        N="LastLogon"
        E={ Convert-FileTime ($_.lastLogonTimestamp) }
    }

# Via LDAP filter (faster for large domains)
$cutoffLDAP = $cutoff.ToString()
Get-ADUser -LDAPFilter "(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(lastLogonTimestamp<=$cutoffLDAP))" `
    -Properties lastLogonTimestamp |
    Select-Object sAMAccountName, @{N="LastLogon"; E={[DateTime]::FromFileTime($_.lastLogonTimestamp)}}
```

---

## LDAP Security in AD

```powershell
# LDAP Signing — protection against MITM attacks
# Without signing: attacker can modify LDAP responses
# Without channel binding: relay attacks on LDAPS

# Require LDAP signing on DC
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LDAPServerIntegrity" `
    -Value 2 -Type DWord   # 0=None, 1=Negotiate, 2=Require

# Enable LDAPS Channel Binding
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LdapEnforceChannelBinding" `
    -Value 2 -Type DWord   # 0=Never, 1=When Supported, 2=Always

# Monitor for unsigned LDAP binds
# Event 2889 — unsigned LDAP bind attempt
Get-WinEvent -FilterHashtable @{
    LogName = "Directory Service"
    Id = 2889
} | Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## LDAP Filter Cheat Sheet

```ldap
# Object types
(objectClass=user)                           — all user objects (incl. computers)
(&(objectClass=user)(objectCategory=person)) — users only
(objectClass=computer)                       — computers
(objectClass=group)                          — groups
(objectClass=organizationalUnit)             — OUs

# Account state
(!(userAccountControl:1.2.840.113556.1.4.803:=2))  — active
(userAccountControl:1.2.840.113556.1.4.803:=2)     — disabled
(lockoutTime>=1)                                    — locked out
(pwdLastSet=0)                                      — password never set

# Security
(servicePrincipalName=*)                     — has SPN (Kerberoasting)
(userAccountControl:1.2.840.113556.1.4.803:=4194304)  — no PreAuth
(userAccountControl:1.2.840.113556.1.4.803:=524288)   — unconstrained delegation
(adminCount=1)                               — protected by AdminSDHolder

# Group membership
(memberOf=CN=Group,DC=domain,DC=com)         — direct member
(memberOf:1.2.840.113556.1.4.1941:=CN=...)  — recursive member

# Searching
(sAMAccountName=alice*)                      — login starts with alice
(displayName=*Smith*)                        — name contains Smith
(mail=*@contoso.com)                         — email in domain

# Time-based
(whenChanged>=20240101000000.0Z)             — modified after 01.01.2024
(lastLogonTimestamp<=133500000000000000)     — inactive for a long time
```

---

## References

- [RFC 4511](https://www.rfc-editor.org/rfc/rfc4511) - LDAP v3 specification
- [MS-ADTS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts) - AD Technical Specification
- [ldap3 Python](https://ldap3.readthedocs.io/) - ldap3 library docs
- [AD LDAP Filters](https://ldapwiki.com/wiki/LDAP%20Query%20Examples) - filter examples
- [UserAccountControl](https://support.microsoft.com/en-us/topic/how-to-use-the-useraccountcontrol-flags-to-manipulate-user-account-properties-902d9292-a06e-5ca5-c4e7-b01e7b71e2c6) - UAC flags reference
