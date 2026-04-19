---
title: "Active Directory - Users, Groups, GPO"
date: "2026-04-19"
---

A deep-dive continuation of Active Directory. Covers user and group management, nesting strategies, and Group Policy Objects - the primary tool for centralised Windows management.

---

## User Management

### User Object Attributes

```powershell
# Get all attributes for a user
Get-ADUser -Identity "alice.smith" -Properties *

# Key attributes:
# sAMAccountName      - login name (up to 20 chars, backwards compat)
# UserPrincipalName   - UPN (alice@contoso.com), used for sign-in
# DistinguishedName   - full AD path (CN=Alice Smith,OU=IT,DC=contoso,DC=com)
# SID                 - unique security identifier
# ObjectGUID          - globally unique identifier
# memberOf            - list of groups
# pwdLastSet          - last password change time (Unix timestamp)
# badPwdCount         - failed login attempts
# lastLogon           - last login (on this DC only!)
# lastLogonTimestamp  - replicates between DCs (accuracy ~14 days)
# userAccountControl  - account control flags
```

### userAccountControl - Account Flags

```powershell
# userAccountControl is a bitfield

# Key values:
# 0x0002   (2)     - ACCOUNTDISABLE      - account disabled
# 0x0010   (16)    - LOCKOUT             - account locked out
# 0x0020   (32)    - PASSWD_NOTREQD      - password not required
# 0x0040   (64)    - PASSWD_CANT_CHANGE  - user can't change password
# 0x0200   (512)   - NORMAL_ACCOUNT      - standard user account
# 0x1000   (4096)  - WORKSTATION_TRUST   - computer account
# 0x10000  (65536) - DONT_EXPIRE_PASSWD  - password never expires
# 0x40000  (262144) - SMARTCARD_REQUIRED - smartcard required

# Normal active user = 512
# Disabled user = 514 (512 + 2)
# Active with non-expiring password = 66048 (65536 + 512)

Get-ADUser alice -Properties userAccountControl |
    Select-Object Name, userAccountControl,
    @{N="Disabled"; E={[bool]($_.userAccountControl -band 2)}},
    @{N="PasswordNeverExpires"; E={[bool]($_.userAccountControl -band 65536)}},
    @{N="LockedOut"; E={$_.LockedOut}}
```

### CRUD Operations on Users

```powershell
# ─── CREATE ───
New-ADUser `
    -Name "Alice Smith" `
    -GivenName "Alice" `
    -Surname "Smith" `
    -SamAccountName "alice.smith" `
    -UserPrincipalName "alice.smith@contoso.com" `
    -Path "OU=IT,OU=Users,DC=contoso,DC=com" `
    -Department "Information Technology" `
    -Title "System Administrator" `
    -Company "Contoso" `
    -Office "New York" `
    -OfficePhone "+1-212-000-0001" `
    -EmailAddress "alice.smith@contoso.com" `
    -Manager "CN=Bob Jones,OU=IT,OU=Users,DC=contoso,DC=com" `
    -AccountPassword (ConvertTo-SecureString "TempP@ss123!" -AsPlainText -Force) `
    -Enabled $true `
    -ChangePasswordAtLogon $true `
    -Description "IT System Administrator"

# ─── READ ───
Get-ADUser -Identity "alice.smith"
Get-ADUser -Identity "alice.smith" -Properties Department, Title, Manager, MemberOf

# Filter-based search
Get-ADUser -Filter {Department -eq "IT"} -Properties Title, EmailAddress
Get-ADUser -Filter {Enabled -eq $true -and PasswordNeverExpires -eq $true}
Get-ADUser -Filter {LastLogonDate -lt (Get-Date).AddDays(-90) -and Enabled -eq $true} `
    -Properties LastLogonDate

# LDAP filter (faster for large domains)
Get-ADUser -LDAPFilter "(&(objectClass=user)(department=IT)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
# Active IT users only

# ─── UPDATE ───
Set-ADUser -Identity "alice.smith" `
    -Title "Senior System Administrator" `
    -Department "IT Operations" `
    -Office "Boston"

# Bulk update
Get-ADUser -Filter {Department -eq "IT"} | Set-ADUser -Description "IT Department Staff"

# Custom attributes
Set-ADUser -Identity "alice.smith" -Add @{extensionAttribute1 = "EMP-001"}
Set-ADUser -Identity "alice.smith" -Replace @{extensionAttribute1 = "EMP-002"}
Set-ADUser -Identity "alice.smith" -Clear extensionAttribute1

# ─── DELETE ───
# Safe approach: disable first, then delete after retention period
Disable-ADAccount -Identity "alice.smith"
Move-ADObject -Identity "CN=Alice Smith,OU=IT,OU=Users,DC=contoso,DC=com" `
    -TargetPath "OU=Disabled,DC=contoso,DC=com"
# After 30 days:
Remove-ADUser -Identity "CN=Alice Smith,OU=Disabled,DC=contoso,DC=com"
```

### Password Management

```powershell
# Reset password
$newPassword = Read-Host -AsSecureString "New password"
Set-ADAccountPassword -Identity "alice.smith" -NewPassword $newPassword -Reset

# Non-interactive (for scripts)
Set-ADAccountPassword -Identity "alice.smith" `
    -NewPassword (ConvertTo-SecureString "NewP@ss123!" -AsPlainText -Force) `
    -Reset

# Force password change at next login
Set-ADUser -Identity "alice.smith" -ChangePasswordAtLogon $true

# Unlock account
Unlock-ADAccount -Identity "alice.smith"

# Bulk password reset for contractors
Get-ADUser -Filter * -SearchBase "OU=Contractors,DC=contoso,DC=com" |
    Set-ADAccountPassword -NewPassword (ConvertTo-SecureString "Temp@12345" -AsPlainText -Force) -Reset |
    Set-ADUser -ChangePasswordAtLogon $true

# Show password expiry info
Get-ADUser -Identity "alice.smith" -Properties PasswordLastSet, PasswordExpired, PasswordNeverExpires |
    Select-Object Name, PasswordLastSet, PasswordExpired, PasswordNeverExpires
```

### Fine-Grained Password Policies

```powershell
# The default domain password policy is set in Default Domain Policy GPO
# FGPP allows different policies for different groups

# Create stricter policy for administrators
New-ADFineGrainedPasswordPolicy `
    -Name "AdminPasswordPolicy" `
    -Precedence 10 `
    -MinPasswordLength 16 `
    -PasswordHistoryCount 24 `
    -MaxPasswordAge "60.00:00:00" `
    -MinPasswordAge "1.00:00:00" `
    -ComplexityEnabled $true `
    -ReversibleEncryptionEnabled $false `
    -LockoutThreshold 3 `
    -LockoutDuration "00:30:00" `
    -LockoutObservationWindow "00:30:00" `
    -ProtectedFromAccidentalDeletion $true

# Apply to a group
Add-ADFineGrainedPasswordPolicySubject -Identity "AdminPasswordPolicy" -Subjects "Domain Admins"
Add-ADFineGrainedPasswordPolicySubject -Identity "AdminPasswordPolicy" -Subjects "alice.smith"

# View effective policy for a user
Get-ADUserResultantPasswordPolicy -Identity "alice.smith"

# List all FGPPs
Get-ADFineGrainedPasswordPolicy -Filter *
```

---

## Group Management

### Group Types and Scopes

```
Group types:
┌────────────────┬──────────────────────────────────────────────────────┐
│ Security       │ Assign permissions, appear in Kerberos token         │
│ Distribution   │ Email distribution lists only (Exchange/365)         │
└────────────────┴──────────────────────────────────────────────────────┘

Group scopes:
┌────────────────┬──────────┬────────────────────────────────────────────┐
│ Domain Local   │ DL       │ Members: any domain in forest + external    │
│                │          │ Permissions: own domain only               │
│                │          │ Use: assign to resources (files, printers) │
├────────────────┼──────────┼────────────────────────────────────────────┤
│ Global         │ G        │ Members: own domain only                   │
│                │          │ Permissions: any domain in forest          │
│                │          │ Use: group users by role/department        │
├────────────────┼──────────┼────────────────────────────────────────────┤
│ Universal      │ U        │ Members: any domain in forest              │
│                │          │ Permissions: any domain in forest          │
│                │          │ Stored in Global Catalog                   │
│                │          │ Use: cross-domain resource access          │
└────────────────┴──────────┴────────────────────────────────────────────┘
```

### A-G-DL-P Strategy

Microsoft's recommended group nesting model:

```
A  → Accounts (users)
G  → Global Groups (by role/department)
DL → Domain Local Groups (by resource)
P  → Permissions (access rights)

Example: access to a file server

[alice] [bob]              ← Accounts
    ↓
[G-IT-Admins]              ← Global Group (all IT admins)
    ↓
[DL-FileServer1-ReadWrite] ← Domain Local Group (access to this resource)
    ↓
[NTFS rights on \\FS1\IT\] ← Permissions

Benefits:
- Add a new IT admin → only add to G-IT-Admins
- Change server permissions → only modify the DL group
- G groups can be reused across multiple DL groups
```

### CRUD Operations on Groups

```powershell
# ─── CREATE ───
New-ADGroup `
    -Name "G-IT-Admins" `
    -SamAccountName "G-IT-Admins" `
    -GroupCategory Security `
    -GroupScope Global `
    -Path "OU=Groups,OU=IT,DC=contoso,DC=com" `
    -Description "IT Administrators"

# ─── ADD MEMBERS ───
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith","bob.jones","carol.white"

# All users from an OU
Get-ADUser -Filter * -SearchBase "OU=IT,OU=Users,DC=contoso,DC=com" |
    ForEach-Object { Add-ADGroupMember -Identity "G-IT-Admins" -Members $_ }

# Nested group (group inside group)
Add-ADGroupMember -Identity "DL-FileServer-IT" -Members "G-IT-Admins"

# ─── READ ───
Get-ADGroupMember -Identity "G-IT-Admins"
Get-ADGroupMember -Identity "G-IT-Admins" -Recursive   # including nested groups

# User's groups
Get-ADUser -Identity "alice.smith" -Properties MemberOf | Select-Object -ExpandProperty MemberOf
(Get-ADUser "alice.smith" -Properties MemberOf).MemberOf | Get-ADGroup | Select-Object Name, GroupScope

# Effective membership (including nested)
Get-ADPrincipalGroupMembership -Identity "alice.smith" | Select-Object Name, GroupScope, GroupCategory

# ─── REMOVE MEMBER ───
Remove-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith" -Confirm:$false

# ─── DELETE ───
Remove-ADGroup -Identity "G-IT-Admins" -Confirm:$false
```

### Built-in Security Groups

```powershell
# Critical built-in groups:

# Domain Admins - full control of the domain
# Don't add regular administrators here!
Get-ADGroupMember "Domain Admins"

# Enterprise Admins - full control of the forest (Forest Root only)
Get-ADGroupMember "Enterprise Admins"

# Schema Admins - can modify the schema (use only when needed)
Get-ADGroupMember "Schema Admins"

# Audit privileged group membership
foreach ($group in @("Domain Admins","Enterprise Admins","Schema Admins","Administrators")) {
    Write-Host "=== $group ===" -ForegroundColor Yellow
    Get-ADGroupMember $group -Recursive | Select-Object Name, ObjectClass
}
```

---

## Group Policy Objects (GPO)

GPO is the mechanism for centrally managing Windows settings for computers and users in the domain.

### What GPO can control

```
Computer Configuration:
├── Software Settings        - software deployment
├── Windows Settings
│   ├── Scripts             - startup/shutdown scripts
│   ├── Security Settings   - password policy, audit, rights
│   │   ├── Account Policies - passwords, lockout
│   │   ├── Local Policies  - audit, privileges
│   │   ├── Windows Firewall - firewall rules
│   │   └── AppLocker       - application control
│   └── QoS Policy          - traffic prioritization
└── Administrative Templates - thousands of registry settings
    ├── Windows Components  - IE, Edge, BitLocker, etc.
    ├── System              - logon, group policy
    └── Network             - DNS, offline files, etc.

User Configuration:
├── Software Settings        - per-user software deployment
├── Windows Settings
│   ├── Scripts             - logon/logoff scripts
│   ├── Folder Redirection  - redirect user folders to server
│   └── Internet Explorer Maintenance
└── Administrative Templates - user-specific settings
    ├── Desktop             - wallpaper, icons
    ├── Start Menu          - menu configuration
    └── Control Panel       - restrict control panel access
```

### GPO Application Order

```
GPOs are applied in LSDOU order:
1. Local Policy        - local computer policy
2. Site Policy         - AD site policies
3. Domain Policy       - domain policies
4. OU Policy           - OU policies (parent to child)

The last policy applied wins (unless Block/Enforce is set).

Exceptions:
- No Override (Enforced) - cannot be overridden by child containers
- Block Inheritance - OU ignores parent container policies
```

### Managing GPO via PowerShell

```powershell
# Install RSAT module
Install-WindowsFeature -Name RSAT-Group-Policy
Import-Module GroupPolicy

# ─── CREATE ───
New-GPO -Name "IT Security Policy" -Comment "Security policy for IT department"

# ─── LINK to OU ───
New-GPLink `
    -Name "IT Security Policy" `
    -Target "OU=IT,DC=contoso,DC=com" `
    -LinkEnabled Yes `
    -Enforced No `
    -Order 1                     # priority (1 = highest)

# ─── LIST ───
Get-GPO -All
Get-GPO -Name "IT Security Policy"
Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com"
Get-GPLink -Name "IT Security Policy"

# GPOs linked to a specific OU
(Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com").GpoLinks

# ─── MODIFY ───
Set-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com" -LinkEnabled No
Set-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com" -Enforced Yes

# ─── BACKUP / RESTORE ───
Backup-GPO -Name "IT Security Policy" -Path "C:\GPOBackups"
Backup-GPO -All -Path "C:\GPOBackups"

Restore-GPO -Name "IT Security Policy" -Path "C:\GPOBackups"

# ─── DELETE ───
Remove-GPO -Name "Old Security Policy"
Remove-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com"
```

### Configuring GPO Registry Settings

```powershell
# Set-GPRegistryValue - set settings via registry

# Disable USB storage devices
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" `
    -ValueName "Start" `
    -Type DWord `
    -Value 4              # 4 = disabled, 3 = enabled

# Set desktop wallpaper (User Configuration)
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" `
    -ValueName "Wallpaper" `
    -Type String `
    -Value "\\server\netlogon\wallpaper.jpg"

# Disable Task Manager
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" `
    -ValueName "DisableTaskMgr" `
    -Type DWord `
    -Value 1
```

### Security Settings in GPO

```powershell
# Via GUI (Group Policy Management Editor):
# Computer Configuration → Windows Settings → Security Settings

# User Rights Assignment:
# "Deny log on locally"          - prevent local logon
# "Allow log on through RDP"     - allow RDP
# "Backup files and directories" - backup privilege

# Security Options:
# "Interactive logon: Message title for users attempting to log on" - login banner
# "Interactive logon: Don't display last user name"                  - hide username
# "Network security: LAN Manager auth level"                         - NTLMv2 only

# Audit Policy:
# "Audit account logon events"   - authentication
# "Audit logon events"           - logons/logoffs
# "Audit object access"          - file access
# "Audit policy change"          - policy changes

# Export/import security policy via secedit
secedit /export /cfg C:\security.inf
secedit /configure /db C:\security.sdb /cfg C:\security.inf /areas SECURITYPOLICY
```

### Security Filtering

```powershell
# By default GPO applies to all objects in the OU
# Security Filtering lets you narrow it down

# Remove "Authenticated Users" (applied to everyone by default)
Set-GPPermission -Name "IT Security Policy" -TargetName "Authenticated Users" `
    -TargetType Group -PermissionLevel GpoRead -Replace

# Grant apply permission to specific group
Set-GPPermission -Name "IT Security Policy" -TargetName "G-IT-Admins" `
    -TargetType Group -PermissionLevel GpoApply

# WMI Filter - additional condition (e.g. Windows 10 only)
# Create in GPMC:
# SELECT * FROM Win32_OperatingSystem WHERE Version LIKE "10.%"
```

### Folder Redirection

```
GPO: User Configuration → Windows Settings → Folder Redirection

Redirect:
Desktop   → \\fileserver\users\%USERNAME%\Desktop
Documents → \\fileserver\users\%USERNAME%\Documents
AppData   → \\fileserver\users\%USERNAME%\AppData

Benefits:
- User data stored on server (centralized backup)
- Works seamlessly when switching computers
- Roaming profiles work better
```

---

## Resultant Set of Policy (RSoP)

```powershell
# Calculate the effective policy for a user/computer
Get-GPResultantSetOfPolicy `
    -ReportType Html `
    -Path "C:\RSoP-alice.html" `
    -User "contoso\alice.smith" `
    -Computer "WORKSTATION01"

Invoke-Item "C:\RSoP-alice.html"

# On the target machine
gpresult /r                          # summary to console
gpresult /h C:\gpresult.html        # full HTML report
gpresult /v                          # verbose text
gpresult /scope user                 # user policies only
gpresult /scope computer             # computer policies only

# Force policy refresh
gpupdate /force
gpupdate /force /target:user
gpupdate /force /target:computer

# Remote refresh via PowerShell
Invoke-GPUpdate -Computer "WORKSTATION01" -Force
Invoke-GPUpdate -Computer "WORKSTATION01" -RandomDelayInMinutes 0
```

---

## Practical GPO Scenarios

### Workstation Security Baseline

```
GPO: "Workstation Security Baseline"
OU: OU=Workstations,DC=contoso,DC=com

Computer Configuration:
  Security Settings:
    - Password Policy: min 12 chars, complexity enabled
    - Account Lockout: 3 attempts, 30 min lockout
    - Audit: logon/logoff, policy changes, file access
    - Windows Firewall: enabled, block inbound
    - Windows Update: automatic

  Administrative Templates:
    - BitLocker: enable drive encryption
    - Windows Defender: enable real-time protection
    - UAC: enable (require elevation prompt)
    - Remote Desktop: allow DL-RDP-Users group only
```

### Logon Script via GPO

```powershell
# GPO: User Configuration → Windows Settings → Scripts → Logon
# File: \\contoso.com\NETLOGON\logon.ps1

# Map network drives
$drives = @{
    "H:" = "\\fileserver\users\$env:USERNAME"
    "I:" = "\\fileserver\shared\IT"
    "S:" = "\\fileserver\software"
}

foreach ($drive in $drives.GetEnumerator()) {
    if (-not (Test-Path $drive.Key)) {
        New-PSDrive -Name $drive.Key.TrimEnd(':') -PSProvider FileSystem `
            -Root $drive.Value -Persist -Scope Global 2>$null
    }
}
```

---

## Delegating Permissions in AD

```powershell
# Delegate password reset to HelpDesk group

$ou = "OU=Users,DC=contoso,DC=com"
$group = "CN=HelpDesk,OU=Groups,DC=contoso,DC=com"

$acl = Get-Acl "AD:$ou"
$identity = [System.Security.Principal.IdentityReference](
    New-Object System.Security.Principal.NTAccount($group))
$adRights = [System.DirectoryServices.ActiveDirectoryRights]::ExtendedRight
$type = [System.Security.AccessControl.AccessControlType]::Allow
$inheritanceType = [System.DirectoryServices.ActiveDirectorySecurityInheritance]::Descendents
$objectType = [GUID]"00299570-246d-11d0-a768-00aa006e0529"  # Reset Password GUID
$ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $identity, $adRights, $type, $objectType, $inheritanceType)
$acl.AddAccessRule($ace)
Set-Acl "AD:$ou" $acl

# Verify delegation
(Get-Acl "AD:OU=Users,DC=contoso,DC=com").Access |
    Where-Object {$_.IdentityReference -like "*HelpDesk*"} |
    Select-Object IdentityReference, ActiveDirectoryRights, ObjectType
```

---

## GPO Diagnostics

```powershell
# List all GPOs with their links
Get-GPO -All | ForEach-Object {
    $gpo = $_
    [PSCustomObject]@{
        Name   = $gpo.DisplayName
        Status = $gpo.GpoStatus
        Created = $gpo.CreationTime
        Modified = $gpo.ModificationTime
    }
} | Format-Table -AutoSize

# Find GPOs with no links (orphaned)
Get-GPO -All | Where-Object {
    $id = $_.Id
    $linked = Get-GPInheritance -Target "DC=contoso,DC=com" -ErrorAction SilentlyContinue
    $linked.GpoLinks.GpoId -notcontains $id
} | Select-Object DisplayName, CreationTime

# Check GPO replication (SYSVOL)
ls "\\contoso.com\SYSVOL\contoso.com\Policies\" | Select-Object Name, LastWriteTime

# Group Policy event log on the client
Get-WinEvent -LogName "Microsoft-Windows-GroupPolicy/Operational" -MaxEvents 50 |
    Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Find blocked/filtered policies
gpresult /v 2>&1 | Select-String "denied|blocked|filtered|not applied"
```

---

## Cheat Sheet

```powershell
# Users
New-ADUser -Name "..." -SamAccountName "..." -Enabled $true
Get-ADUser -Filter {Department -eq "IT"} -Properties *
Set-ADUser -Identity "..." -Title "Senior Admin"
Disable-ADAccount -Identity "..."
Unlock-ADAccount -Identity "..."
Set-ADAccountPassword -Identity "..." -Reset

# Groups
New-ADGroup -Name "G-IT-Admins" -GroupScope Global -GroupCategory Security
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"
Remove-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"
Get-ADGroupMember -Identity "G-IT-Admins" -Recursive
Get-ADPrincipalGroupMembership "alice.smith"

# GPO
New-GPO -Name "My Policy"
New-GPLink -Name "My Policy" -Target "OU=IT,DC=contoso,DC=com"
Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com"
Invoke-GPUpdate -Computer "PC001" -Force
gpresult /h report.html    # on target computer

# Find inactive users
Search-ADAccount -AccountInactive -TimeSpan 90 -UsersOnly

# Find locked-out accounts
Search-ADAccount -LockedOut | Select-Object Name, SamAccountName

# Find expired passwords
Search-ADAccount -PasswordExpired | Select-Object Name, SamAccountName

# Export users to CSV
Get-ADUser -Filter * -Properties Title, Department, EmailAddress |
    Select-Object Name, SamAccountName, Title, Department, EmailAddress |
    Export-Csv C:\users.csv -NoTypeInformation
```

---

## References

- [AD PowerShell Module](https://learn.microsoft.com/en-us/powershell/module/activedirectory/) - documentation
- [Group Policy PowerShell](https://learn.microsoft.com/en-us/powershell/module/grouppolicy/) - GPO module
- [Security Identifiers](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers) - SID reference
- [AGDLP Strategy](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/implementing-least-privilege-administrative-models) - group nesting model
