---
title: "Windows - NTFS Permissions and ACE/DACL/SACL"
date: "2026-05-15"
---

NTFS is a Windows file system with a rich access control model. Unlike Linux where permissions are expressed as three bits (rwx) for owner/group/other, Windows uses a flexible ACL (Access Control List) system that allows precise permission assignment for any number of users and groups. Understanding this model is critical for administration, security auditing, and penetration testing.

---

## Core Concept: Security Descriptor

```
Every Windows object (file, folder, registry key, process, service, etc.)
has a Security Descriptor - a data structure describing who can do what with the object.

A Security Descriptor contains four components:

  Owner SID    - SID of the object owner
                 The owner can always change the DACL (even without explicit rights)
                 The owner can reclaim rights if they were accidentally removed

  Group SID    - primary group (POSIX legacy, almost unused in Windows)

  DACL         - Discretionary Access Control List
                 List of who CAN do what with the object
                 "Discretionary" = the owner (or admin) decides who has access

  SACL         - System Access Control List
                 List of what to AUDIT (log to Security Event Log)
                 Configured by the system administrator
                 Entries generate Event Log records (EventID 4663 and others)

If DACL is absent (NULL DACL):
  Access is ALLOWED to everyone - full access without restrictions
  This is NOT the same as an empty DACL!

If DACL is empty (Empty DACL):
  Access is DENIED to everyone - no one can access the object
  Even the owner (though the owner can change the DACL and restore access)

If DACL has entries:
  Access is determined by ACE entries inside the DACL
```

---

## SID - Security Identifier

```
SID (Security Identifier) - a unique identifier for a security principal.
Every user, group, computer, and service has its own SID.

SID format:
  S-1-5-21-<domain_identifier>-<RID>

  S        - "Security" prefix
  1        - revision (always 1)
  5        - identifier authority (5 = NT Authority)
  21-...   - sub-authority, domain/machine identifier
  RID      - Relative Identifier, unique number within the domain

Real SID examples:

  S-1-5-21-1234567890-1234567890-1234567890-1000
    - regular user (RID >= 1000 for domain users)
    - first created user typically gets RID 1000

  S-1-5-21-1234567890-1234567890-1234567890-500
    - built-in Administrator account (RID 500 always)
    - the SID determines this - even if the account is renamed

  S-1-5-21-1234567890-1234567890-1234567890-512
    - Domain Admins group (RID 512 always)

Well-known SIDs - identical across all machines:

  S-1-1-0            Everyone            - all users (including anonymous)
  S-1-5-11           Authenticated Users - authenticated users only
  S-1-5-18           SYSTEM              - system account
  S-1-5-19           LOCAL SERVICE       - local service account
  S-1-5-20           NETWORK SERVICE     - network service account
  S-1-5-32-544       Administrators      - local Administrators group
  S-1-5-32-545       Users               - local Users group
  S-1-5-32-546       Guests              - local Guests group
  S-1-16-4096        Low IL              - Integrity Level: Low
  S-1-16-8192        Medium IL           - Integrity Level: Medium
  S-1-16-12288       High IL             - Integrity Level: High
  S-1-16-16384       System IL           - Integrity Level: System

Get current user SID:
  whoami /user

Find SID by name:
  wmic useraccount where name='username' get sid
  Get-LocalUser -Name username | Select-Object SID     # PowerShell
  Get-ADUser -Identity username | Select-Object SID    # AD PowerShell module

Find name by SID:
  wmic useraccount where sid='S-1-5-21-...' get name
```

---

## ACL - Access Control List

```
An ACL is a list of ACE entries applied to an object.
Two types of ACL:

  DACL - who has access (managed by owner/administrator)
  SACL - what gets audited (managed only with SeSecurityPrivilege)

Windows DACL evaluation order:
  When a request is made to access an object, Windows walks ACEs top to bottom:

  1. Evaluates each ACE in order (ORDER MATTERS)
  2. If ACE type is Deny - denies immediately and STOPS
  3. If ACE type is Allow - accumulates granted rights
  4. When all requested rights are accumulated - grants access
  5. If the entire list is exhausted and rights not accumulated - DENIES

  IMPORTANT: Deny ACEs are processed FIRST (if positioned at the start of the list).
  With incorrect ordering - Deny may not take effect!
  Windows places explicit Deny ACEs before Allow ACEs automatically during standard ops.
  But with manual editing you must control order yourself.

Access check algorithm (simplified):
  Request: open file for reading
  
  ACE 1: Allow DOMAIN\alice  Read   → alice? yes → add Read
  ACE 2: Allow BUILTIN\Users Read   → member? yes → Read already set, continue
  ACE 3: Deny  DOMAIN\bob    Write  → bob? no → skip
  ACE 4: Allow Administrators Full  → in Administrators? yes → add All
  
  Result: if only Read was requested - it's there. Allow.
```

---

## ACE - Access Control Entry

```
ACE (Access Control Entry) - a single record in an ACL.
Each ACE describes one subject's permissions on the object.

ACE structure:

  [ACE Type] [ACE Flags] [Access Mask] [SID]

  ACE Type  - record type (Allow, Deny, Audit, etc.)
  ACE Flags - inheritance and audit flags
  Access Mask - bitmask with specific rights
  SID       - who this ACE applies to

ACE Types:

  ACCESS_ALLOWED_ACE        (0x00) - allow access
  ACCESS_DENIED_ACE         (0x01) - deny access
  SYSTEM_AUDIT_ACE          (0x02) - audit (in SACL)
  ACCESS_ALLOWED_OBJECT_ACE (0x05) - allow on specific AD object type
  ACCESS_DENIED_OBJECT_ACE  (0x06) - deny on specific AD object type
  SYSTEM_MANDATORY_LABEL_ACE (0x11) - Integrity Level label (in SACL)

ACE Flags (inheritance flags):

  OBJECT_INHERIT_ACE        (0x01) OI - apply to child files
  CONTAINER_INHERIT_ACE     (0x02) CI - apply to child folders
  NO_PROPAGATE_INHERIT_ACE  (0x04) NP - don't propagate inheritance further
  INHERIT_ONLY_ACE          (0x08) IO - for inheritance only, not the object itself
  INHERITED_ACE             (0x10) I  - this ACE is inherited (not set explicitly)

  Flag combinations:
  OI + CI     - inherit to files and folders (most common case)
  IO + CI     - only subfolders inherit, the object itself does not
  IO + OI + CI - inherit to all child objects

ACE Flags (audit flags, SACL only):

  SUCCESSFUL_ACCESS_ACE_FLAG (0x40) SA - audit successful access
  FAILED_ACCESS_ACE_FLAG     (0x80) FA - audit failed access
```

---

## Access Mask - the permission bitmask

```
Access Mask - a 32-bit number where each bit = a specific right.
Divided into several zones:

Bits 0-15:   Object-specific rights (specific to object type)
Bits 16-23:  Standard rights (same for all objects)
Bits 24-31:  Generic rights (abstract rights, mapped to specific)

Standard Rights (same for all object types):
  Bit 16  DELETE              (0x00010000) - delete the object
  Bit 17  READ_CONTROL        (0x00020000) - read Security Descriptor (excluding SACL)
  Bit 18  WRITE_DAC           (0x00040000) - modify DACL
  Bit 19  WRITE_OWNER         (0x00080000) - change owner
  Bit 20  SYNCHRONIZE         (0x00100000) - synchronization (required for file read/write)

Generic Rights (mapped to concrete rights):
  GENERIC_ALL     (0x10000000) GA
  GENERIC_EXECUTE (0x20000000) GX
  GENERIC_WRITE   (0x40000000) GW
  GENERIC_READ    (0x80000000) GR

File/Directory Specific Rights (bits 0-15 for files):
  For files:
    FILE_READ_DATA         (0x0001) - read file contents
    FILE_WRITE_DATA        (0x0002) - write to file (modify contents)
    FILE_APPEND_DATA       (0x0004) - append to end of file
    FILE_READ_EA           (0x0008) - read Extended Attributes
    FILE_WRITE_EA          (0x0010) - write Extended Attributes
    FILE_EXECUTE           (0x0020) - execute file
    FILE_READ_ATTRIBUTES   (0x0080) - read attributes (hidden, system, archive, etc.)
    FILE_WRITE_ATTRIBUTES  (0x0100) - change attributes

  For directories:
    FILE_LIST_DIRECTORY    (0x0001) - list directory contents
    FILE_ADD_FILE          (0x0002) - create files in directory
    FILE_ADD_SUBDIRECTORY  (0x0004) - create subdirectories
    FILE_DELETE_CHILD      (0x0040) - delete files inside the directory
                                      (even without Delete rights on the file itself!)

Composite (aggregated) rights for files:

  FILE_GENERIC_READ  = READ_CONTROL + SYNCHRONIZE +
                       FILE_READ_DATA + FILE_READ_ATTRIBUTES + FILE_READ_EA

  FILE_GENERIC_WRITE = READ_CONTROL + SYNCHRONIZE + WRITE_DAC +
                       FILE_WRITE_DATA + FILE_APPEND_DATA +
                       FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA

  FILE_ALL_ACCESS    = all of the above + DELETE + all remaining bits

Standard Windows rights (in GUI): what they actually mean

  Full Control      = FILE_ALL_ACCESS
                      Includes WRITE_DAC and WRITE_OWNER - dangerous to grant!

  Modify            = FILE_GENERIC_READ + FILE_GENERIC_WRITE +
                      FILE_EXECUTE + DELETE
                      No WRITE_DAC and WRITE_OWNER - cannot change permissions

  Read & Execute    = FILE_GENERIC_READ + FILE_EXECUTE

  List Folder Contents = FILE_LIST_DIRECTORY + FILE_READ_ATTRIBUTES +
                         FILE_READ_EA + READ_CONTROL + SYNCHRONIZE
                         (folders only)

  Read              = FILE_GENERIC_READ

  Write             = FILE_WRITE_DATA + FILE_APPEND_DATA +
                      FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA +
                      READ_CONTROL
```

---

## DACL - Discretionary Access Control List

### DACL Inheritance

```
Inheritance - mechanism for automatically propagating ACEs from a parent folder
to child objects. Avoids manually setting permissions on every file.

ACE types from an inheritance perspective:

  Explicit ACE:
    Set directly on the object manually
    Take priority over inherited ACEs
    Do NOT have the INHERITED_ACE flag (0x10)

  Inherited ACE:
    Propagated from a parent object
    Have the INHERITED_ACE flag (0x10)
    Processed AFTER explicit ACEs

ACE order in DACL (Windows sorts automatically):
  1. Explicit Deny ACEs
  2. Explicit Allow ACEs
  3. Inherited Deny ACEs
  4. Inherited Allow ACEs

Inheritance flags with examples:

  Flags on parent folder C:\Data\:
  (OI)(CI) Allow Users Read
    OI = Object Inherit - inherit to files
    CI = Container Inherit - inherit to folders
    → files in C:\Data\ get Allow Users Read
    → subfolders in C:\Data\ get Allow Users Read + OI + CI (propagates further)

  (OI)(CI)(IO) Allow Users Read
    IO = Inherit Only - only for inheritance, NOT applied to C:\Data\ itself
    → C:\Data\ itself does NOT have this right
    → files and folders inside do get it

  (OI)(CI)(NP) Allow Users Read
    NP = No Propagate - don't propagate inheritance flags deeper
    → C:\Data\ has the right
    → C:\Data\subdir\ gets the right (without OI/CI flags)
    → C:\Data\subdir\file.txt does NOT get it (inheritance stopped)

Blocking inheritance:
  Inheritance can be interrupted at any object.
  When blocking you can choose:
    - Copy inherited ACEs as explicit ones (recommended)
    - Remove all inherited ACEs (object remains with explicit only)

  PowerShell:
    $acl = Get-Acl "C:\Data\secret"
    $acl.SetAccessRuleProtection($true, $true)  # block + copy
    Set-Acl "C:\Data\secret" $acl

  icacls:
    icacls C:\Data\secret /inheritance:d    # d = disable (block + keep)
    icacls C:\Data\secret /inheritance:r    # r = remove (block + delete inherited)
    icacls C:\Data\secret /inheritance:e    # e = enable (restore inheritance)
```

### Owner

```
Object owner - a special subject with inherent rights:
  - Can always read the DACL (READ_CONTROL is implicit)
  - Can always modify the DACL (WRITE_DAC is implicit)
  - Even if explicitly removed from DACL - can still restore permissions

Who becomes the owner:
  When creating a file/folder - the user who created the object
  If an administrator creates it - BUILTIN\Administrators becomes owner,
  not the specific user (standard behavior)

Changing owner:
  Requires SeTakeOwnershipPrivilege or already being an administrator.
  The owner can transfer ownership to another user or group.

  icacls:
    takeown /f C:\file.txt /a          # take ownership (you become the owner)
    takeown /f C:\folder /r /d y       # recursive for folder

  PowerShell:
    $acl = Get-Acl "C:\file.txt"
    $owner = New-Object System.Security.Principal.NTAccount("DOMAIN\user")
    $acl.SetOwner($owner)
    Set-Acl "C:\file.txt" $acl

Attack via ownership:
  SeRestorePrivilege or SeTakeOwnershipPrivilege allow taking any file.
  Example: take the SAM file → add permissions → read it → dump hashes.
  (But SAM and SYSTEM are locked by the kernel, requires Volume Shadow Copy)
```

---

## SACL - System Access Control List

```
SACL - the audit list. Defines what gets written to the Security Event Log.
Requires SeSecurityPrivilege to read/modify.

ACE types in SACL:

  SYSTEM_AUDIT_ACE - audit subject access
    Flags:
      SUCCESSFUL_ACCESS_ACE_FLAG (SA) - log successful access
      FAILED_ACCESS_ACE_FLAG     (FA) - log failed access

  SYSTEM_MANDATORY_LABEL_ACE - Integrity Level label
    Also in SACL, but not audit - it's the IL label for the object

Example: configure auditing via PowerShell:
  $acl = Get-Acl "C:\Data\sensitive"

  # audit: all delete attempts (success and failure) from Everyone
  $auditRule = New-Object System.Security.AccessControl.FileSystemAuditRule(
    "Everyone",
    "Delete",
    "ContainerInherit, ObjectInherit",
    "None",
    "Success, Failure"
  )
  $acl.AddAuditRule($auditRule)
  Set-Acl "C:\Data\sensitive" $acl

icacls for auditing:
  icacls C:\Data\sensitive /setaudit Everyone:D /T /C
  # D = Delete, /T = recursive, /C = continue on errors

What appears in Event Log:
  EventID 4663 - attempt to access an object (file, registry, etc.)
  EventID 4656 - object handle requested
  EventID 4660 - object deleted
  EventID 4670 - object permissions changed
  EventID 4907 - SACL changed

Important: for SACL auditing to work, the object access audit policy must be enabled:
  Local Security Policy → Audit Policy → Audit object access = Success, Failure
  Or via GPO: Computer Configuration → Windows Settings → Security Settings →
  Advanced Audit Policy Configuration → Object Access → Audit File System
```

---

## Tools for Working with Permissions

### icacls - command line

```
icacls - the primary command-line tool for working with NTFS permissions.

View permissions:
  icacls C:\Data\file.txt
  icacls C:\Data\ /T              # recursive

  Sample output:
  C:\Data\file.txt
    NT AUTHORITY\SYSTEM:(I)(F)       I=Inherited, F=Full Control
    BUILTIN\Administrators:(I)(F)
    BUILTIN\Users:(I)(RX)            RX = Read & Execute
    DOMAIN\alice:(R)                 R = Read

icacls permission notation:
  F  - Full Control
  M  - Modify
  RX - Read & Execute
  R  - Read
  W  - Write
  D  - Delete
  X  - Execute
  N  - No access (explicit Deny - rare but possible)

Inheritance flags in icacls:
  (OI) - Object Inherit
  (CI) - Container Inherit
  (IO) - Inherit Only
  (NP) - No Propagate
  (I)  - Inherited (shown when viewing)

Assigning permissions:
  # give alice Full Control recursively
  icacls C:\Data /grant "DOMAIN\alice:(OI)(CI)F" /T

  # give Users Read-only access
  icacls C:\Data\reports /grant "BUILTIN\Users:(OI)(CI)R"

  # deny bob write access (Deny)
  icacls C:\Data /deny "DOMAIN\bob:(W)"

  # remove alice's permissions (not Deny, remove the entry)
  icacls C:\Data /remove "DOMAIN\alice"

  # save permissions to file and restore
  icacls C:\Data /save permissions.txt /T
  icacls C:\Data /restore permissions.txt

  # reset to inherited (remove explicit ACEs)
  icacls C:\Data\file.txt /reset

  # replace all permissions (dangerous!)
  icacls C:\Data /grant:r "DOMAIN\alice:(OI)(CI)F" /T
  # /grant:r = replace (replaces existing entries for this user)
  # without :r = adds an additional ACE

Working with ownership:
  takeown /f C:\Data\file.txt
  takeown /f C:\Data /r /d y     # recursive, accept all
```

### PowerShell - Get-Acl / Set-Acl

```
PowerShell gives full control over ACLs through .NET classes.

View permissions:
  # basic view
  Get-Acl "C:\Data\file.txt" | Format-List

  # detailed view of all ACEs
  (Get-Acl "C:\Data\file.txt").Access | Format-Table IdentityReference,
    FileSystemRights, AccessControlType, IsInherited, InheritanceFlags -AutoSize

  # only explicit (non-inherited) ACEs
  (Get-Acl "C:\Data\file.txt").Access | Where-Object { -not $_.IsInherited }

  # find files with permissions for a specific user
  Get-ChildItem C:\Data -Recurse | ForEach-Object {
    $acl = Get-Acl $_.FullName
    $acl.Access | Where-Object { $_.IdentityReference -match "alice" } |
    Select-Object @{n='Path';e={$_.Path}}, IdentityReference, FileSystemRights
  }

Assigning permissions:
  $acl = Get-Acl "C:\Data\reports"

  # create a rule
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "DOMAIN\alice",                              # user
    "ReadAndExecute",                            # rights
    "ContainerInherit, ObjectInherit",           # inheritance flags
    "None",                                      # propagation flags
    "Allow"                                      # type
  )

  $acl.AddAccessRule($rule)
  Set-Acl "C:\Data\reports" $acl

  # remove a rule
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "DOMAIN\alice", "ReadAndExecute", "Allow"
  )
  $acl.RemoveAccessRule($rule)
  Set-Acl "C:\Data\reports" $acl

FileSystemRights enum values:
  FullControl, Modify, ReadAndExecute, Read, Write, Delete,
  ReadPermissions, ChangePermissions, TakeOwnership,
  ListDirectory, CreateFiles, CreateDirectories,
  AppendData, ReadExtendedAttributes, WriteExtendedAttributes,
  ExecuteFile, DeleteSubdirectoriesAndFiles,
  ReadAttributes, WriteAttributes, Synchronize

InheritanceFlags:
  None                        - this object only
  ContainerInherit (CI)       - child folders
  ObjectInherit (OI)          - child files

PropagationFlags:
  None                        - standard behavior
  InheritOnly (IO)            - inheritance only
  NoPropagateInherit (NP)     - don't propagate inheritance flags further
```

### Viewing via GUI (Explorer + Security Tab)

```
Right-click file/folder → Properties → Security tab

What you see:
  List of users/groups with their permissions
  Edit button - modify DACL
  Advanced button - full Security Descriptor (owner, SACL, inheritance)

In Advanced Security Settings:
  Permissions tab:
    List of all ACEs with inheritance flags
    "Show inherited permissions" button - shows inherited ACEs
    "Disable inheritance" checkbox - block inheritance

  Auditing tab:
    SACL - audit entries
    Requires admin rights to modify

  Effective Access tab:
    Calculate actual rights for a specific user
    Accounts for group membership, Integrity Level
    Very useful for troubleshooting

  Owner tab:
    Who is the owner, Change button to change ownership
```

### accesschk.exe (Sysinternals)

```
accesschk - a powerful permissions auditing tool, part of Sysinternals Suite.
Especially useful for pentesting and finding weak permission configurations.

Download: https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk

Check a specific user's permissions on a file:
  accesschk.exe -l C:\Data\file.txt         # show DACL
  accesschk.exe DOMAIN\alice C:\Data\       # what can alice do

Find folders writable by regular users:
  accesschk.exe -uwdq "Users" C:\           # -w = writable, -d = dirs, -q = no banner
  accesschk.exe -uwdq "Everyone" C:\
  accesschk.exe -uwdq "Authenticated Users" C:\

Finding weak points (LPE audit):
  # folders writable by all (often used in LPE)
  accesschk.exe -uwdqs "Everyone" C:\
  accesschk.exe -uwdqs "Users" C:\

  # services with weak permissions
  accesschk.exe -uwcqv "Everyone" *          # service permissions
  accesschk.exe -uwcqv "Users" *

  # registry - writable keys
  accesschk.exe -uwkqs "Users" HKLM\SYSTEM\CurrentControlSet\Services\

Penetration testing examples:
  # find folders in Program Files where Users can write (DLL hijacking)
  accesschk.exe -uwdq "Users" "C:\Program Files\" /accepteula

  # find services where Users can modify binPath (service hijacking)
  accesschk.exe -uwcqv "Users" * /accepteula
```

---

## Special Rights and Extended Concepts

### FILE_DELETE_CHILD - deleting through parent

```
FILE_DELETE_CHILD - the right to delete files INSIDE a directory.
Even without Delete rights on the file itself.

If folder C:\Shared\ has:
  Allow Users FILE_DELETE_CHILD

Then a user in Users can delete C:\Shared\file.txt,
even if they have no permissions on C:\Shared\file.txt at all.

Why this works:
  Windows checks BOTH options when deleting a file:
  1. Does the user have DELETE right on the file? OR
  2. Does the user have FILE_DELETE_CHILD on the parent folder?
  If either is true - allow.

This is leveraged in attacks on weak directory permissions.
Audit: check FILE_DELETE_CHILD on sensitive directories.
```

### CreateFile flags and access rights

```
When opening a file via CreateFile(), DesiredAccess is specified:
  GENERIC_READ     (0x80000000) - open for reading
  GENERIC_WRITE    (0x40000000) - open for writing
  GENERIC_EXECUTE  (0x20000000) - open for executing
  GENERIC_ALL      (0x10000000) - all rights

Windows maps GENERIC_* to file-specific rights:
  GENERIC_READ    → FILE_READ_DATA + FILE_READ_ATTRIBUTES + FILE_READ_EA + READ_CONTROL + SYNCHRONIZE
  GENERIC_WRITE   → FILE_WRITE_DATA + FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA + READ_CONTROL + SYNCHRONIZE + APPEND_DATA + WRITE_DAC
  GENERIC_EXECUTE → FILE_EXECUTE + FILE_READ_ATTRIBUTES + READ_CONTROL + SYNCHRONIZE
```

### Alternate Data Streams (ADS)

```
NTFS supports Alternate Data Streams - additional data streams
attached to a file. The primary stream is the unnamed stream.

Creating ADS:
  echo "hidden data" > C:\file.txt:hidden_stream
  Set-Content -Path "C:\file.txt:hidden_stream" -Value "secret"

Reading ADS:
  Get-Content "C:\file.txt:hidden_stream"
  type "C:\file.txt:hidden_stream"

Viewing all streams of a file:
  Get-Item C:\file.txt -Stream *
  dir /r C:\file.txt       # in CMD

Deleting ADS:
  Remove-Item "C:\file.txt" -Stream "hidden_stream"

ADS permissions:
  ADS inherits permissions from the main file.
  Permissions cannot be set separately for ADS.
  If you have read rights on the file - you have read rights on its ADS.

Malware usage:
  Malware hides payload in ADS of a legitimate file.
  Standard directory listing does not show ADS.
  wscript.exe C:\legit.txt:payload.vbs - execute a script from ADS.
  
  Detection:
    Get-ChildItem -Recurse | Get-Item -Stream * | Where-Object Stream -ne ':$DATA'
    streams.exe -s C:\  (Sysinternals)
```

### Hard Links and permissions

```
Hard Link - multiple directory entries pointing to the same inode.
  mklink /h C:\link.txt C:\original.txt

Permissions and hard links:
  Hard link and original file ARE THE SAME OBJECT.
  They share a Security Descriptor.
  Changing permissions via one path = changing for the other.
  
  Attack via hard links:
    If a program creates a file and immediately sets permissions -
    between creation and permission-setting a hard link can be created.
    Permissions will be set on the wrong file.
    (TOCTOU - Time of Check Time of Use vulnerability)

Symbolic links and permissions:
  mklink C:\symlink.txt C:\target.txt        # requires SeCreateSymbolicLinkPrivilege

  When accessing through a symlink - permissions of the TARGET file are checked.
  The symlink's own permissions are not used when accessing data.
  
  Junction Points (for directories):
    mklink /j C:\junction C:\target_dir
    Source folder permissions don't affect the target_dir content.
```

---

## Integrity Level and NTFS

```
Integrity Level (IL) - a separate control mechanism (MIC - Mandatory Integrity Control).
Works ON TOP OF and TOGETHER WITH DACL.

MIC rule: "No Write Up"
  A Medium IL process cannot write to a High IL object.
  Even if DACL explicitly allows Write.

IL label is stored in the object's SACL:
  Special SYSTEM_MANDATORY_LABEL_ACE.

Default IL labels for files:
  C:\Windows\         - Medium (system files accessible to High and System through DACL)
  C:\Program Files\   - Medium
  User files          - Medium
  Temp\Low\           - Low (specifically for Protected Mode browsers)

View object's IL label:
  icacls C:\file.txt   # shows IL at end of line if not Medium

  PowerShell:
    $acl = Get-Acl "C:\file.txt" -Audit
    # IL is in SACL as SYSTEM_MANDATORY_LABEL_ACE

Change IL label:
  icacls C:\file.txt /setintegritylevel Low
  icacls C:\file.txt /setintegritylevel Medium
  icacls C:\file.txt /setintegritylevel High

DACL + MIC combination:
  File with IL=High + DACL Allow Everyone FullControl:
    Medium IL process tries to write → MIC BLOCKS (No Write Up)
    DACL is not considered for Write operations if MIC blocks

  File with IL=Low + DACL Allow Everyone FullControl:
    Medium IL process can read (No Read Down rule does not exist)
    Medium IL process can write (IL is not higher, MIC doesn't block)
    But Low IL process cannot write to Medium IL file
```

---

## Registry Permissions

```
The Windows registry also uses the ACL model. Same principles, different rights.

Registry-specific rights (instead of File-specific):
  KEY_QUERY_VALUE        (0x0001) - read key values
  KEY_SET_VALUE          (0x0002) - set values
  KEY_CREATE_SUB_KEY     (0x0004) - create subkeys
  KEY_ENUMERATE_SUB_KEYS (0x0008) - enumerate subkeys
  KEY_NOTIFY             (0x0010) - change notifications
  KEY_CREATE_LINK        (0x0020) - create symbolic links in registry
  KEY_WOW64_64KEY        (0x0100) - work with 64-bit representation
  KEY_WOW64_32KEY        (0x0200) - work with 32-bit representation

Composite registry rights:
  KEY_READ  = KEY_QUERY_VALUE + KEY_ENUMERATE_SUB_KEYS + KEY_NOTIFY + READ_CONTROL
  KEY_WRITE = KEY_SET_VALUE + KEY_CREATE_SUB_KEY + READ_CONTROL
  KEY_ALL_ACCESS = all of the above + DELETE + WRITE_DAC + WRITE_OWNER

Viewing registry permissions:
  # PowerShell
  Get-Acl "HKLM:\SOFTWARE\MyApp" | Format-List

  # accesschk
  accesschk.exe -kquw "Users" HKLM\SYSTEM\CurrentControlSet\Services\

Assigning registry permissions in PowerShell:
  $acl = Get-Acl "HKLM:\SOFTWARE\MyApp"

  $rule = New-Object System.Security.AccessControl.RegistryAccessRule(
    "DOMAIN\alice",
    "ReadKey",          # or "FullControl", "WriteKey", etc.
    "ContainerInherit",
    "None",
    "Allow"
  )
  $acl.AddAccessRule($rule)
  Set-Acl "HKLM:\SOFTWARE\MyApp" $acl

Critical keys with restricted access:
  HKLM\SAM\SAM\                          # local account database (SYSTEM only)
  HKLM\SECURITY\                         # security policies (SYSTEM only)
  HKLM\SYSTEM\CurrentControlSet\         # system configuration
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\  # system boot

Weak permission search (LPE audit):
  # service keys writable by Users
  accesschk.exe -kquwsv "Users" "HKLM\SYSTEM\CurrentControlSet\Services\" /accepteula

  # autorun keys
  accesschk.exe -kquw "Users" "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
```

---

## Troubleshooting and Common Issues

### Access issue debugging algorithm

```
User can't open a file - what to check:

Step 1 - Check Effective Access (fastest method):
  File properties → Security → Advanced → Effective Access
  Select a user → View effective access
  Windows will calculate all permissions accounting for group membership

Step 2 - View ACL:
  icacls C:\path\to\file.txt
  (Get-Acl "C:\path\to\file.txt").Access | ft -AutoSize

Step 3 - Check user's group memberships:
  whoami /groups    # run as the user in question
  Get-ADPrincipalGroupMembership username | Select Name

Step 4 - Check inheritance:
  icacls C:\path\to\file.txt
  # (I) flag = inherited; no flag = explicit
  # check parent folder if rights came from there

Step 5 - Check for Deny ACEs:
  # Deny overrides Allow
  # look for Deny ACEs for the user or their groups
  (Get-Acl "C:\path").Access | Where-Object { $_.AccessControlType -eq "Deny" }

Step 6 - Check Integrity Level:
  # if Medium IL process tries to write to High IL object
  icacls C:\path  # IL shown at end if not Medium

Step 7 - Enable auditing and check Event Log:
  # EventID 4663 - access attempt
  # EventID 4656 - handle request (with failure reason)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4663} |
    Where-Object { $_.Message -match "C:\\path\\to\\file" } |
    Select-Object -First 10 | Format-List
```

### Common permission mistakes

```
Problem: "Access Denied" even though permissions look correct

Reason 1: Deny ACE from a group
  User is in Contractors group, folder has Deny Contractors Write.
  User personally has Allow Write.
  Group Deny overrides personal Allow.
  Fix: remove the Deny or remove user from the group.

Reason 2: Integrity Level
  Low IL process (browser in protected mode) tries to write to Medium IL file.
  Fix: understand why a Low IL process needs rights on a Medium IL file.

Reason 3: Owner locked themselves out
  Owner removed themselves from DACL and can't get access.
  Fix: owner can restore permissions via Advanced → Change permissions.

Reason 4: Empty DACL (not NULL, but Empty)
  No entries in DACL → no one has access.
  Fix: requires administrative rights to change DACL (via ownership).

Reason 5: NTFS permissions are fine, but Share limits access
  NTFS permissions + Share permissions work together.
  Effective access = intersection (most restrictive wins).
  Example: NTFS Full Control + Share Read Only = Read Only over the network.
  Fix: check both sets of permissions.

Problem: Permissions set but didn't apply to child files

Reason: Inheritance flags
  If you granted permission without CI/OI - it applies to the folder only, not contents.
  Or inheritance is blocked on child objects.
  Fix: icacls C:\folder /grant "user:(OI)(CI)R" /T /C
```

---

## Practical Scenarios

### Scenario 1: Configure access to a corporate folder

```
Task: folder C:\Projects\Finance\
  - Finance group can read and write
  - Management group reads only
  - IT Admins have Full Control
  - Everyone else - no access

Step 1: Remove inheritance (so Users/Everyone don't interfere):
  icacls C:\Projects\Finance /inheritance:d

Step 2: Remove unwanted inherited permissions:
  icacls C:\Projects\Finance /remove:g "BUILTIN\Users"
  icacls C:\Projects\Finance /remove:g "Everyone"

Step 3: Assign permissions:
  icacls C:\Projects\Finance /grant "BUILTIN\Administrators:(OI)(CI)F"
  icacls C:\Projects\Finance /grant "DOMAIN\IT-Admins:(OI)(CI)F"
  icacls C:\Projects\Finance /grant "DOMAIN\Finance:(OI)(CI)M"
  icacls C:\Projects\Finance /grant "DOMAIN\Management:(OI)(CI)R"
  # Required: SYSTEM must have access for system operations
  icacls C:\Projects\Finance /grant "NT AUTHORITY\SYSTEM:(OI)(CI)F"

Step 4: Verify:
  icacls C:\Projects\Finance
  # Check effective access for each group
```

### Scenario 2: Weak permissions audit (pentest / LPE)

```
Looking for privilege escalation paths via weak permissions.

1. Folders writable by regular users:
  # Places where executables live
  accesschk.exe -uwdqs "Users" "C:\Program Files" /accepteula
  accesschk.exe -uwdqs "Everyone" "C:\Program Files (x86)" /accepteula
  accesschk.exe -uwdqs "BUILTIN\Users" "C:\" /accepteula

2. Services with non-standard paths and permissions:
  # Unquoted Service Paths - paths without quotes containing spaces
  wmic service get name,displayname,pathname,startmode |
    findstr /i "auto" | findstr /i /v "c:\windows\\" | findstr /i /v """

  # Weak permissions on service binary folders
  sc qc ServiceName    # get service binary path
  accesschk.exe -uwdq "Users" "C:\path\to\service\"

3. Registry - service key permissions:
  accesschk.exe -kquwsv "Users" HKLM\SYSTEM\CurrentControlSet\Services\ /accepteula
  # if user can write to service key - can modify ImagePath

4. DLL Hijacking - find writable folders in PATH:
  # get PATH
  $env:PATH -split ';'
  # check each folder
  accesschk.exe -uwdq "Users" "C:\SomePath\InPATH"

5. Scheduled Tasks with weak paths:
  Get-ScheduledTask | Where-Object { $_.Principal.RunLevel -eq "Highest" } |
    Select-Object TaskName, @{n='Path';e={$_.Actions.Execute}}
  # then check permissions on the binary folder
```

### Scenario 3: Recovering permissions after a mistake

```
Situation: accidentally removed all permissions on C:\Important\
  Now "Access Denied" even for administrator.

Step 1: Take ownership (as administrator, from elevated cmd):
  takeown /f C:\Important /r /d y

Step 2: Restore admin permissions:
  icacls C:\Important /grant Administrators:F /T

Step 3: Restore standard permissions:
  icacls C:\Important /reset /T              # reset to inherited
  # or manually assign the needed permissions

Step 4: Restore inheritance if needed:
  icacls C:\Important /inheritance:e         # enable inheritance from parent

Situation 2: no access to a file you need to read, but you have SeBackupPrivilege:
  # SeBackupPrivilege allows reading files ignoring DACL via backup API
  # Used by backup utilities

  # Via robocopy (uses backup API):
  robocopy C:\Restricted\ C:\Backup\ /B    # /B = backup mode, bypasses DACL
  # works if you have SeBackupPrivilege
```

---

## Quick Reference

```
SECURITY DESCRIPTOR STRUCTURE
  Owner SID   - who owns it (can always change the DACL)
  Group SID   - primary group (rarely used)
  DACL        - who CAN do what
  SACL        - what to AUDIT (+ IL labels)

ACE TYPES
  ACCESS_ALLOWED_ACE    - allow
  ACCESS_DENIED_ACE     - deny
  SYSTEM_AUDIT_ACE      - audit (in SACL)
  SYSTEM_MANDATORY_LABEL_ACE - IL label (in SACL)

DACL EVALUATION ORDER
  1. Explicit Deny
  2. Explicit Allow
  3. Inherited Deny
  4. Inherited Allow
  → first Deny = stop
  → Allow accumulates until all requested rights are granted

ACE INHERITANCE FLAGS
  OI  Object Inherit        - inherit to files
  CI  Container Inherit     - inherit to folders
  IO  Inherit Only          - inheritance only (not the object itself)
  NP  No Propagate          - don't propagate inheritance flags further
  I   Inherited             - this ACE is inherited (shown when viewing)

STANDARD FILE RIGHTS
  F   Full Control          - everything, including WRITE_DAC and WRITE_OWNER
  M   Modify                - everything except changing permissions and owner
  RX  Read & Execute        - read + execute
  R   Read                  - read only
  W   Write                 - write (without delete!)
  D   Delete                - delete

TOOLS
  icacls path               - view/modify permissions (cmd)
  Get-Acl / Set-Acl         - PowerShell
  takeown /f path           - take ownership
  accesschk.exe             - permissions audit (Sysinternals)
  Get-Item -Stream *        - view Alternate Data Streams
  dir /r                    - view ADS in CMD

KEY ICACLS COMMANDS
  icacls path /grant "user:(OI)(CI)F" /T    - grant Full Control recursively
  icacls path /remove "user"                - remove permissions
  icacls path /deny "user:(W)"              - deny write
  icacls path /inheritance:d                - block inheritance
  icacls path /inheritance:e                - enable inheritance
  icacls path /reset /T                     - reset to inherited

EVENT IDS (AUDITING)
  4663  - attempt to access an object
  4656  - handle request (with error code)
  4660  - object deleted
  4670  - object permissions changed
  4907  - SACL changed
  4672  - special privileges at logon

PERMISSION-RELATED PRIVILEGES
  SeTakeOwnershipPrivilege  - take any object
  SeBackupPrivilege         - read files ignoring DACL (via backup API)
  SeRestorePrivilege        - write files ignoring DACL
  SeSecurityPrivilege       - read/modify SACL
  SeCreateSymbolicLinkPrivilege - create symbolic links
```

---

## References

- [File Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights) - official documentation
- [Access Control Lists](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-lists) - ACL model
- [Security Descriptor](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptors) - Security Descriptor structure
- [Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) - Integrity Levels
- [Well-known SIDs](https://learn.microsoft.com/en-us/windows/win32/secauthz/well-known-sids) - well-known SID table
- [icacls documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) - icacls reference
- [Accesschk](https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk) - Sysinternals accesschk
- [FileSystemRights Enum](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights) - PowerShell rights
- [SDDL (Security Descriptor Definition Language)](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-definition-language) - text representation of SD
