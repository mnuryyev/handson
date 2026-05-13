---
title: "Active Directory - ACL and Object Permissions"
date: "2026-05-13"
---

A deep dive into the AD security model at the object level. ACL (Access Control List) is the mechanism that defines who can do what with every object in Active Directory: users, groups, OUs, GPOs, computers.

---

## Key Concepts

### ACL Structure

```
AD Object (e.g. user alice.smith)
└── Security Descriptor
    ├── Owner         - object owner
    ├── DACL          - Discretionary ACL (who can do what)
    │   ├── ACE 1     - Allow: Domain Admins - Full Control
    │   ├── ACE 2     - Allow: HelpDesk - Reset Password
    │   └── ACE 3     - Deny:  Guest - Read
    └── SACL          - System ACL (audit: who did what)
        ├── ACE 1     - Audit: Everyone - Write (Success, Failure)
        └── ACE 2     - Audit: Domain Admins - Full Control (Success)
```

```
Core components:

DACL (Discretionary ACL)
- List of ACEs that allow or deny access
- If DACL is empty - access denied for everyone
- If DACL is absent - full access for everyone (dangerous!)

SACL (System ACL)
- List of ACEs for auditing (logging)
- Requires SeSecurityPrivilege to read/write
- Entries go into Security Event Log (Event ID 4663 etc.)

ACE (Access Control Entry) - one record in an ACL
- Principal   - who (SID of user/group)
- Type        - Allow / Deny
- Rights      - what is allowed/denied (bitmask)
- Flags       - inheritance
- Object Type - which object type (for Object ACEs)
```

### AD Access Right Types

```
# Standard Access Rights:
# 0x00010000  DELETE           - delete the object
# 0x00020000  READ_CONTROL     - read DACL (required for any read)
# 0x00040000  WRITE_DAC        - modify DACL
# 0x00080000  WRITE_OWNER      - change owner
# 0x00100000  SYNCHRONIZE      - synchronize (for files)

# AD-specific Rights (Active Directory Rights):
# 0x00000001  DS-CREATE-CHILD  - create child objects
# 0x00000002  DS-DELETE-CHILD  - delete child objects
# 0x00000004  ACTRL-DS-LIST    - list child objects
# 0x00000008  DS-SELF          - self-write
# 0x00000010  DS-READ-PROP     - read attributes
# 0x00000020  DS-WRITE-PROP    - write attributes
# 0x00000040  DS-DELETE-TREE   - delete object tree
# 0x00000080  DS-LIST-OBJECT   - list the object
# 0x00000100  DS-CONTROL-ACCESS - extended rights

# Generic Rights (combinations):
# GENERIC_READ    = READ_CONTROL + LIST + READ_PROP + LIST_OBJECT
# GENERIC_WRITE   = READ_CONTROL + SELF + WRITE_PROP
# GENERIC_EXECUTE = READ_CONTROL + LIST
# GENERIC_ALL     = CREATE + DELETE + READ + WRITE + EXEC + DELETE_TREE + CONTROL_ACCESS
```

### Extended Rights

```
# Extended Rights - special operations that don't fit standard rights
# Defined by GUIDs in the AD schema

# Most important Extended Rights:

# User-Force-Change-Password  {00299570-246d-11d0-a768-00aa006e0529}
# - reset password without knowing the current one
# - this is what HelpDesk gets delegated

# User-Change-Password        {ab721a53-1e2f-11d0-9819-00aa0040529b}
# - change password knowing the current one (user for themselves)

# Receive-As                  {ab721a56-1e2f-11d0-9819-00aa0040529b}
# - read mailbox as another user (Exchange)

# Send-As                     {ab721a54-1e2f-11d0-9819-00aa0040529b}
# - send emails as another user

# DS-Replication-Get-Changes  {1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}
# - replicate changes (needed for DCSync attack!)

# DS-Replication-Get-Changes-All {1131f6ad-9c07-11d1-f79f-00c04fc2dcd2}
# - replicate all changes including secrets

# Get all Extended Rights from schema
Get-ADObject -SearchBase "CN=Extended-Rights,CN=Configuration,DC=contoso,DC=com" `
    -Filter * -Properties DisplayName, RightsGuid |
    Select-Object DisplayName, RightsGuid | Sort-Object DisplayName
```

---

## Reading ACL on AD Objects

### Via PowerShell - Get-Acl

```
# ACL of a user
$user = Get-ADUser -Identity "alice.smith"
$acl = Get-Acl "AD:$($user.DistinguishedName)"

# All ACL entries
$acl.Access | Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType, IsInherited

# Only explicitly set (not inherited)
$acl.Access | Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType

# Only Allow entries
$acl.Access | Where-Object { $_.AccessControlType -eq "Allow" } |
    Format-Table IdentityReference, ActiveDirectoryRights -AutoSize

# Only Deny entries (check these carefully!)
$acl.Access | Where-Object { $_.AccessControlType -eq "Deny" } |
    Format-Table IdentityReference, ActiveDirectoryRights -AutoSize
```

```
# ACL of an OU
$ou = Get-ADOrganizationalUnit -Identity "OU=IT,DC=contoso,DC=com"
$acl = Get-Acl "AD:$($ou.DistinguishedName)"
$acl.Access | Format-Table -AutoSize

# ACL of Domain Root (most interesting from a security perspective)
$domain = Get-ADDomain
$acl = Get-Acl "AD:$($domain.DistinguishedName)"

# Who has replication rights (DCSync)?
$acl.Access | Where-Object {
    $_.ObjectType -eq "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2" -or
    $_.ObjectType -eq "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"
} | Select-Object IdentityReference, ActiveDirectoryRights

# ACL of Domain Admins group
$da = Get-ADGroup "Domain Admins"
$acl = Get-Acl "AD:$($da.DistinguishedName)"
$acl.Access | Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType
```

### Human-readable Output

```
# Helper function to decode Object Type GUIDs
function Get-ADRightName {
    param([string]$Guid)

    $guidMap = @{
        "00000000-0000-0000-0000-000000000000" = "All Objects"
        "00299570-246d-11d0-a768-00aa006e0529" = "User-Force-Change-Password"
        "ab721a53-1e2f-11d0-9819-00aa0040529b" = "User-Change-Password"
        "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2" = "DS-Replication-Get-Changes"
        "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2" = "DS-Replication-Get-Changes-All"
        "89e95b76-444d-4c62-991a-0facbeda640c" = "DS-Replication-Get-Changes-In-Filtered-Set"
        "bf9679c0-0de6-11d0-a285-00aa003049e2" = "Self-Membership (member attribute)"
        "72e39547-7b18-11d1-adef-00c04fd8d5cd" = "DNS-Host-Name-Attributes"
        "f3a64788-5306-11d1-a9c5-0000f80367c1" = "Validated-SPN"
    }

    if ($guidMap.ContainsKey($Guid)) { return $guidMap[$Guid] }
    else { return $Guid }
}

# Output ACL with decoded names
$dn = (Get-ADUser "alice.smith").DistinguishedName
(Get-Acl "AD:$dn").Access | ForEach-Object {
    [PSCustomObject]@{
        Principal    = $_.IdentityReference
        Type         = $_.AccessControlType
        Rights       = $_.ActiveDirectoryRights
        ObjectType   = Get-ADRightName $_.ObjectType.ToString()
        InheritedFrom = if ($_.IsInherited) { "Inherited" } else { "Explicit" }
    }
} | Format-Table -AutoSize
```

---

## Delegating Permissions

### What is Delegation

```
Delegation - assigning the minimum necessary rights
to a specific group/user on specific objects.

Principle of least privilege:
- HelpDesk can reset passwords - but not read all attributes
- HR can create users in OU=HR - but not in OU=IT
- Monitoring account can read LastLogon - but not modify objects

Always delegate to a group, not directly to a user!
```

### Delegation of Control Wizard (GUI)

```
Steps in Active Directory Users and Computers (ADUC):
1. Right-click on OU or container
2. "Delegate Control..."
3. Next
4. Add... - select group/user
5. Next
6. Choose task:
   - "Reset user passwords and force password change at next logon"
   - "Read all user information"
   - "Create, delete, and manage user accounts"
   - "Modify the membership of a group"
   - "Manage Group Policy links"
   - "Create, delete and manage inetOrgPerson accounts"
   or "Create a custom task to delegate"
7. Finish
```

### Delegation via PowerShell

```
# Helper function to add an ACE
function Add-ADObjectACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName,
        [string]$Right,
        [string]$ObjectTypeGUID = "00000000-0000-0000-0000-000000000000",
        [string]$InheritedObjectTypeGUID = "00000000-0000-0000-0000-000000000000",
        [string]$AccessType = "Allow",
        [string]$Inheritance = "Descendents"
    )

    $principal = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity  = [System.Security.Principal.IdentityReference]$principal

    $adRight    = [System.DirectoryServices.ActiveDirectoryRights]$Right
    $type       = [System.Security.AccessControl.AccessControlType]$AccessType
    $objType    = [System.Guid]$ObjectTypeGUID
    $inhType    = [System.DirectoryServices.ActiveDirectorySecurityInheritance]$Inheritance
    $inhObjType = [System.Guid]$InheritedObjectTypeGUID

    $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity, $adRight, $type, $objType, $inhType, $inhObjType
    )

    $acl = Get-Acl "AD:$TargetDN"
    $acl.AddAccessRule($ace)
    Set-Acl "AD:$TargetDN" $acl
    Write-Host "[+] ACE added: $PrincipalName - $Right on $TargetDN"
}
```

```
# --- Scenario 1: HelpDesk resets passwords ---
$ouDN    = "OU=Users,DC=contoso,DC=com"
$hdGroup = "CONTOSO\HelpDesk"

# Extended Right: User-Force-Change-Password
Add-ADObjectACE `
    -TargetDN $ouDN `
    -PrincipalName $hdGroup `
    -Right "ExtendedRight" `
    -ObjectTypeGUID "00299570-246d-11d0-a768-00aa006e0529" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
# bf967aba... = User class GUID in AD schema

# Extended Right: Read lockoutTime (to check lockout status)
Add-ADObjectACE `
    -TargetDN $ouDN `
    -PrincipalName $hdGroup `
    -Right "ReadProperty" `
    -ObjectTypeGUID "28630ebf-41d5-11d1-a9c1-0000f80367c1" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
# 28630ebf... = lockoutTime attribute GUID
```

```
# --- Scenario 2: HR creates/modifies users in their OU ---
$hrOU    = "OU=HR,OU=Users,DC=contoso,DC=com"
$hrGroup = "CONTOSO\HR-Managers"

# Create User objects in OU
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "CreateChild" `
    -ObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "All"

# Delete User objects
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "DeleteChild" `
    -ObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "All"

# Write all user attributes
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "WriteProperty" `
    -Inheritance "Descendents"
```

```
# --- Scenario 3: Service account reads attributes ---
$serviceDN = "CONTOSO\svc-monitoring"

# Read-only access to all user properties
Add-ADObjectACE `
    -TargetDN "DC=contoso,DC=com" `
    -PrincipalName $serviceDN `
    -Right "ReadProperty,ListChildren,ListObject" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
```

### Removing Delegation

```
function Remove-ADObjectACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName
    )

    $acl       = Get-Acl "AD:$TargetDN"
    $principal = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity  = [System.Security.Principal.IdentityReference]$principal

    $toRemove = $acl.Access | Where-Object {
        $_.IdentityReference -eq $identity -and
        $_.IsInherited -eq $false
    }

    foreach ($ace in $toRemove) {
        $acl.RemoveAccessRule($ace) | Out-Null
        Write-Host "[-] Removed ACE: $PrincipalName from $TargetDN"
    }
    Set-Acl "AD:$TargetDN" $acl
}

# Example
Remove-ADObjectACE `
    -TargetDN "OU=Users,DC=contoso,DC=com" `
    -PrincipalName "CONTOSO\OldHelpDesk"
```

---

## ACL Inheritance

### How Inheritance Works

```
AD object hierarchy:
DC=contoso,DC=com             [ACL applies to all children]
└── OU=Users
    ├── OU=IT
    │   ├── alice.smith       [inherits from OU=IT, OU=Users, DC=...]
    │   └── bob.jones
    └── OU=HR
        └── carol.white       [inherits from OU=HR, OU=Users, DC=...]

ACE inheritance flags:
- None            - this object only
- All             - this object and all descendants
- Descendents     - descendants only (not this object)
- SelfAndChildren - this object and direct children
- Children        - direct children only
```

```
# Check inheritance on an object
$dn = (Get-ADUser "alice.smith").DistinguishedName
$acl = Get-Acl "AD:$dn"

# All inherited rights
$acl.Access | Where-Object { $_.IsInherited -eq $true } |
    Select-Object IdentityReference, ActiveDirectoryRights, IsInherited |
    Group-Object IdentityReference |
    Select-Object Name, Count

# Count explicit vs inherited
$acl.Access | Group-Object IsInherited |
    Select-Object @{N="Type"; E={if ($_.Name -eq "True") {"Inherited"} else {"Explicit"}}}, Count
```

### Blocking Inheritance

```
# Disable inheritance on an object (copy or remove inherited ACEs)

$dn  = (Get-ADUser "alice.smith").DistinguishedName
$acl = Get-Acl "AD:$dn"

# $true  - copy inherited ACEs as explicit entries
# $false - remove inherited ACEs (object left unprotected!)
$acl.SetAccessRuleProtection($true, $true)

Set-Acl "AD:$dn" $acl
Write-Host "Inheritance disabled, existing ACEs copied as explicit"

# Re-enable inheritance
$acl.SetAccessRuleProtection($false, $true)
Set-Acl "AD:$dn" $acl
```

---

## Auditing via SACL

### Configuring AD Object Auditing

```
# Step 1: Enable AD object access auditing via GPO
# Computer Configuration -> Windows Settings -> Security Settings ->
# Advanced Audit Policy Configuration -> DS Access:
# - Audit Directory Service Access  - Success, Failure
# - Audit Directory Service Changes - Success

# Via PowerShell (auditpol)
auditpol /set /subcategory:"Directory Service Access" /success:enable /failure:enable
auditpol /set /subcategory:"Directory Service Changes" /success:enable /failure:enable
auditpol /get /subcategory:"Directory Service Access"
```

```
# Step 2: Set SACL on an object

function Add-ADAuditACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName = "Everyone",
        [string]$Right = "WriteProperty",
        [string]$AuditFlags = "Success,Failure"
    )

    $principal  = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity   = [System.Security.Principal.IdentityReference]$principal
    $adRight    = [System.DirectoryServices.ActiveDirectoryRights]$Right
    $auditFlag  = [System.Security.AccessControl.AuditFlags]$AuditFlags
    $inheritance = [System.DirectoryServices.ActiveDirectorySecurityInheritance]"All"

    $ace = New-Object System.DirectoryServices.ActiveDirectoryAuditRule(
        $identity, $adRight, $auditFlag, $inheritance
    )

    $acl = Get-Acl "AD:$TargetDN"
    $acl.AddAuditRule($ace)
    Set-Acl "AD:$TargetDN" $acl
    Write-Host "[+] SACL added: audit $Right for $PrincipalName on $TargetDN"
}

# Audit attribute changes for all users in OU=IT
Add-ADAuditACE `
    -TargetDN "OU=IT,OU=Users,DC=contoso,DC=com" `
    -PrincipalName "Everyone" `
    -Right "WriteProperty" `
    -AuditFlags "Success,Failure"

# Audit object deletion
Add-ADAuditACE `
    -TargetDN "DC=contoso,DC=com" `
    -PrincipalName "Everyone" `
    -Right "DeleteTree,Delete" `
    -AuditFlags "Success,Failure"
```

### Analyzing Audit Events

```
# Event IDs in Security Log (on DC):
# 4662 - operation on AD object (read/write via SACL)
# 4663 - attempt to access object
# 4741 - Computer object created
# 4742 - Computer object changed
# 4743 - Computer object deleted
# 4720 - User object created
# 4722 - Account enabled
# 4723 - Attempt to change password
# 4724 - Attempt to reset password
# 4725 - Account disabled
# 4726 - User object deleted
# 4727 - Security Group created
# 4730 - Security Group deleted
# 4732 - User added to group
# 4733 - User removed from group

# Read events via PowerShell
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(4720, 4724, 4732, 4726)
    StartTime = (Get-Date).AddHours(-24)
} | Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Only password changes in the last hour
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = 4723, 4724
    StartTime = (Get-Date).AddHours(-1)
} | ForEach-Object {
    $xml = [xml]$_.ToXml()
    [PSCustomObject]@{
        Time        = $_.TimeCreated
        SubjectUser = $xml.Event.EventData.Data | Where-Object Name -eq "SubjectUserName" | Select-Object -Expand "#text"
        TargetUser  = $xml.Event.EventData.Data | Where-Object Name -eq "TargetUserName"  | Select-Object -Expand "#text"
        EventId     = $_.Id
    }
}
```

---

## Tools for ACL Analysis

### Native Tools

```
# 1. dsacls.exe - built into Windows
dsacls "OU=IT,DC=contoso,DC=com"                      # show ACL
dsacls "OU=IT,DC=contoso,DC=com" /I:T                 # including children
dsacls "CN=alice.smith,OU=IT,DC=contoso,DC=com"       # specific object

# Add a right via dsacls
dsacls "OU=HR,DC=contoso,DC=com" /G "CONTOSO\HelpDesk:CA;Reset Password;user"
# G = Grant, CA = Control Access (Extended Right), user = object class

# Remove a right
dsacls "OU=HR,DC=contoso,DC=com" /R "CONTOSO\OldGroup"

# Reset to defaults (be careful!)
dsacls "OU=Test,DC=contoso,DC=com" /S /T

# 2. Ldp.exe - included in RSAT
# Displays Security Descriptor in a GUI
# Great for inspecting individual objects

# 3. Via ADSI (COM objects) - without ActiveDirectory module
$entry = [ADSI]"LDAP://CN=alice.smith,OU=IT,DC=contoso,DC=com"
$sd    = $entry.psbase.ObjectSecurity

$sd.Access | Select-Object IdentityReference, ActiveDirectoryRights,
    AccessControlType, IsInherited | Format-Table -AutoSize

# Get owner
$sd.Owner
```

### Bulk ACL Check Across Domain

```
# Find all objects with non-standard (explicit) ACEs
function Find-CustomACEs {
    param(
        [string]$SearchBase = (Get-ADDomain).DistinguishedName,
        [string]$ExcludeIdentity = "BUILTIN|NT AUTHORITY|S-1-5-"
    )

    $results = @()
    Get-ADObject -Filter * -SearchBase $SearchBase -Properties * |
        ForEach-Object {
            $dn = $_.DistinguishedName
            try {
                $acl = Get-Acl "AD:$dn" -ErrorAction Stop
                $explicit = $acl.Access | Where-Object {
                    $_.IsInherited -eq $false -and
                    $_.IdentityReference.Value -notmatch $ExcludeIdentity
                }
                if ($explicit) {
                    foreach ($ace in $explicit) {
                        $results += [PSCustomObject]@{
                            ObjectDN  = $dn
                            Principal = $ace.IdentityReference
                            Rights    = $ace.ActiveDirectoryRights
                            Type      = $ace.AccessControlType
                        }
                    }
                }
            } catch {}
        }
    return $results
}

# Run on OU=IT
$customACEs = Find-CustomACEs -SearchBase "OU=IT,DC=contoso,DC=com"
$customACEs | Format-Table -AutoSize

# Export to CSV
$customACEs | Export-Csv "C:\acl-audit.csv" -NoTypeInformation
```

---

## Dangerous Rights from a Security Perspective

### WriteDACL and WriteOwner

```
# WriteDACL - can completely rewrite the ACL of an object
# WriteOwner - can become owner (owner implicitly has WriteDACL)

# These are critically dangerous rights!
# An attacker with WriteDACL can grant themselves full access

# Example attack path:
# 1. Attacker has WriteDACL on the Domain object
# 2. Adds DS-Replication-Get-Changes-All to themselves
# 3. Runs DCSync - gets hashes of all passwords in domain

# Find who has WriteDACL on Domain object
$domainDN = (Get-ADDomain).DistinguishedName
(Get-Acl "AD:$domainDN").Access |
    Where-Object {
        $_.ActiveDirectoryRights -match "WriteDacl|GenericAll|GenericWrite" -and
        $_.AccessControlType -eq "Allow" -and
        $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators"
    } |
    Select-Object IdentityReference, ActiveDirectoryRights
```

### GenericAll and GenericWrite

```
# GenericAll  - full control over the object
# GenericWrite - write any attributes

# If attacker has GenericWrite on a user:
# - Can set SPN and perform Kerberoasting
# - Can modify logon script (scriptPath attribute)
# - Can add themselves to a group via member attribute

# If GenericAll on a group:
# - Can add themselves to the group (including Domain Admins!)

# Search for anomalous GenericAll/GenericWrite
function Find-DangerousACEs {
    param([string]$SearchBase = (Get-ADDomain).DistinguishedName)

    $dangerousRights   = "GenericAll|GenericWrite|WriteDacl|WriteOwner"
    $trustedPrincipals = "Domain Admins|Enterprise Admins|BUILTIN\\Administrators|NT AUTHORITY|S-1-5-18|S-1-5-32"

    Get-ADObject -Filter * -SearchBase $SearchBase |
        ForEach-Object {
            $dn = $_.DistinguishedName
            try {
                (Get-Acl "AD:$dn").Access |
                    Where-Object {
                        $_.ActiveDirectoryRights -match $dangerousRights -and
                        $_.AccessControlType -eq "Allow" -and
                        $_.IdentityReference.Value -notmatch $trustedPrincipals -and
                        $_.IsInherited -eq $false
                    } |
                    ForEach-Object {
                        [PSCustomObject]@{
                            Object    = $dn
                            Principal = $_.IdentityReference
                            Rights    = $_.ActiveDirectoryRights
                            Warning   = "POTENTIAL PRIVILEGE ESCALATION"
                        }
                    }
            } catch {}
        }
}

$dangerous = Find-DangerousACEs
if ($dangerous) {
    Write-Warning "Potentially dangerous ACEs found!"
    $dangerous | Format-Table -AutoSize
} else {
    Write-Host "No dangerous ACEs found" -ForegroundColor Green
}
```

### DCSync Rights

```
# DCSync - attack where an adversary requests password replication
# Requires two Extended Rights on the domain object:
# - DS-Replication-Get-Changes      {1131f6aa-...}
# - DS-Replication-Get-Changes-All  {1131f6ad-...}

# By default these rights belong only to:
# - Domain Controllers
# - Domain Admins
# - Enterprise Admins

# Check who has replication rights
$domainDN = (Get-ADDomain).DistinguishedName
$replicationGuids = @(
    "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2",  # Get-Changes
    "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2",  # Get-Changes-All
    "89e95b76-444d-4c62-991a-0facbeda640c"   # Get-Changes-In-Filtered-Set
)

(Get-Acl "AD:$domainDN").Access |
    Where-Object {
        $_.ObjectType.Guid -in $replicationGuids -and
        $_.AccessControlType -eq "Allow"
    } |
    Select-Object IdentityReference, @{N="ExtRight"; E={$_.ObjectType.Guid}} |
    Format-Table -AutoSize

# If anything besides DC/DomainAdmins/EnterpriseAdmins appears - this is an INCIDENT
```

---

## AdminSDHolder Permissions

### What is AdminSDHolder

```
AdminSDHolder - a special object:
CN=AdminSDHolder,CN=System,DC=contoso,DC=com

Every 60 minutes SDProp (Security Descriptor Propagator)
copies the AdminSDHolder ACL to all protected objects:

Protected groups (adminCount=1):
- Domain Admins
- Enterprise Admins
- Schema Admins
- Administrators
- Account Operators
- Backup Operators
- Print Operators
- Server Operators
- Replicator
- KRBTGT
- and their members (attribute adminCount=1)

Purpose: even if someone modifies the ACL on a Domain Admin user,
within 60 minutes the permissions are restored from AdminSDHolder.
```

```
# View ACL of AdminSDHolder
$adminSDHolder = "CN=AdminSDHolder,CN=System,DC=contoso,DC=com"
(Get-Acl "AD:$adminSDHolder").Access |
    Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType |
    Format-Table -AutoSize

# IMPORTANT: Backdoor via AdminSDHolder
# An attacker with rights on AdminSDHolder adds themselves to it
# Within 60 minutes that access propagates to all Domain Admins!

# Check for non-standard entries in AdminSDHolder
(Get-Acl "AD:$adminSDHolder").Access |
    Where-Object {
        $_.IsInherited -eq $false -and
        $_.IdentityReference.Value -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators|SELF"
    } |
    Select-Object IdentityReference, ActiveDirectoryRights
```

---

## Practical Scenarios

### ACL Audit Before Pentest / Security Review

```
# Full non-standard ACL audit of the domain
# Export to CSV for reporting

$reportPath = "C:\AD-ACL-Audit-$(Get-Date -Format 'yyyyMMdd').csv"

$allACEs = @()
$searchBases = @(
    (Get-ADDomain).DistinguishedName,
    "CN=AdminSDHolder,CN=System,$((Get-ADDomain).DistinguishedName)"
)

foreach ($base in $searchBases) {
    Get-ADObject -Filter * -SearchBase $base -SearchScope SubTree |
        ForEach-Object {
            $dn = $_.DistinguishedName
            try {
                (Get-Acl "AD:$dn").Access |
                    Where-Object {
                        $_.IsInherited -eq $false -and
                        $_.IdentityReference.Value -notmatch "BUILTIN|NT AUTHORITY|Domain Admins|Enterprise Admins|S-1-5-18"
                    } |
                    ForEach-Object {
                        $allACEs += [PSCustomObject]@{
                            Object     = $dn
                            Principal  = $_.IdentityReference
                            Rights     = $_.ActiveDirectoryRights
                            Type       = $_.AccessControlType
                            Inherited  = $_.IsInherited
                            ObjectType = $_.ObjectType.Guid
                        }
                    }
            } catch {}
        }
}

$allACEs | Export-Csv $reportPath -NoTypeInformation
Write-Host "Found $($allACEs.Count) non-standard ACEs. Exported to $reportPath"
```

### Resetting ACL to Defaults

```
# Reset object ACL to inherited state

function Reset-ADObjectACL {
    param([string]$DistinguishedName)

    $acl = Get-Acl "AD:$DistinguishedName"

    # Remove all explicit ACEs
    $explicit = $acl.Access | Where-Object { $_.IsInherited -eq $false }
    foreach ($ace in $explicit) {
        $acl.RemoveAccessRule($ace) | Out-Null
    }

    # Enable inheritance
    $acl.SetAccessRuleProtection($false, $false)
    Set-Acl "AD:$DistinguishedName" $acl

    Write-Host "[+] ACL reset to inherited state: $DistinguishedName"
}

# Usage
Reset-ADObjectACL -DistinguishedName "CN=alice.smith,OU=IT,DC=contoso,DC=com"

# Caution! Resetting ACL on an OU may break delegated permissions.
# Always back up before making changes:
(Get-Acl "AD:$dn").Access | Export-Csv "C:\backup-acl-$(Get-Date -Format 'yyyyMMdd-HHmm').csv"
```

---

## Cheat Sheet

```
# Read ACL
$dn = (Get-ADUser "alice").DistinguishedName
(Get-Acl "AD:$dn").Access | Format-Table -AutoSize

# Explicit only (not inherited)
(Get-Acl "AD:$dn").Access | Where-Object { $_.IsInherited -eq $false }

# Find dangerous rights
(Get-Acl "AD:$dn").Access | Where-Object {
    $_.ActiveDirectoryRights -match "GenericAll|WriteDacl|WriteOwner"
}

# ACL on Domain Root
$domain = (Get-ADDomain).DistinguishedName
(Get-Acl "AD:$domain").Access | Format-Table -AutoSize

# DCSync rights on domain object
(Get-Acl "AD:$domain").Access | Where-Object {
    $_.ObjectType.Guid -in @(
        "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2",
        "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"
    )
}

# dsacls - show ACL from command line
dsacls "OU=IT,DC=contoso,DC=com"
dsacls "CN=alice.smith,OU=IT,DC=contoso,DC=com"

# Delegate password reset (Extended Right via dsacls)
dsacls "OU=Users,DC=contoso,DC=com" /G "CONTOSO\HelpDesk:CA;Reset Password;user"

# Enable object auditing
auditpol /set /subcategory:"Directory Service Changes" /success:enable /failure:enable

# Force immediate SDProp run (registry key)
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "RunProtectAdminGroupsTask" -Value 1

# Read AD object change events
Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4720,4724,4732,4726} |
    Select-Object TimeCreated, Id, Message
```

---

## References

- [Understanding AD Security Descriptors](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-descriptors) - official docs
- [Delegate Administration via OU](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/delegating-administration-by-using-ou-objects) - delegation guide
- [ActiveDirectoryRights Enum](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.activedirectoryrights) - rights reference
- [AdminSDHolder and Protected Groups](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/appendix-c--protected-accounts-and-groups-in-active-directory) - protected objects
- [DCSync Attack](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse/dump-password-hashes-from-domain-controller-with-dcsync) - attack theory (ired.team)
- [BloodHound](https://github.com/BloodHoundAD/BloodHound) - ACL attack path visualization
