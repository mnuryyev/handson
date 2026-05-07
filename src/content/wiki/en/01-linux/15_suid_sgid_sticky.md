---
title: "File Permissions: SUID, SGID, Sticky Bit"
date: "2026-05-07"
---

SUID, SGID, and Sticky Bit are three special permission bits in Linux that go beyond the standard `rwx`. They solve problems that regular permissions can't: running a program as its owner, inheriting a group in a directory, and protecting files in a shared folder.

---

## Where They Live in the Permission Structure

Standard permissions look like this:

```
- rwx rwx rwx
│  │   │   │
│  │   │   └── other permissions
│  │   └────── group permissions
│   └────────── owner (user) permissions
└────────────── file type
```

Special bits add a **fourth digit** in octal notation and **replace** the `x` bit in symbolic notation:

```
  4    7    5    5
  │    │    │    │
  │    │    │    └── other:  r-x
  │    │    └─────── group:  r-x
  │    └──────────── user:   rwx
  └───────────────── special bits: 4=SUID, 2=SGID, 1=Sticky
```

| Bit | Number | Symbol on file | Symbol on directory |
| --- | --- | --- | --- |
| SUID | `4` | `s` at owner `x` position | `s` (rarely used) |
| SGID | `2` | `s` at group `x` position | `s` at group `x` position |
| Sticky | `1` | `t` (obsolete on files) | `t` at other `x` position |

If `x` is not set but the special bit is - an uppercase letter appears (`S` or `T`), indicating a useless or anomalous configuration.

---

## SUID - Set User ID

### What It Does

When a file with the SUID bit is executed, the process gets the **effective UID of the file's owner**, not the UID of the user who ran it.

```
Normal execution:
alice (uid=1001) runs program
  -> process runs with uid=1001

SUID execution:
alice (uid=1001) runs program (owner=root, SUID=on)
  -> process runs with uid=0 (root)
```

### Real Example: passwd

```bash
ls -la /usr/bin/passwd
# -rwsr-xr-x 1 root root 68208 /usr/bin/passwd
#     ^ s = SUID bit (owner's x replaced by s)

# passwd is owned by root and has SUID
# A regular user runs passwd -> process runs as root
# This is needed to modify /etc/shadow (only accessible by root)

# Without SUID on passwd:
# alice tries to change her password -> no access to /etc/shadow -> error
```

### Other SUID Programs on the System

```bash
# Find all SUID files
find / -perm -4000 -type f 2>/dev/null

# Typical SUID programs
ls -la /usr/bin/sudo       # -rwsr-xr-x root root  - execute as root
ls -la /usr/bin/su         # -rwsr-xr-x root root  - switch user
ls -la /usr/bin/newgrp     # -rwsr-xr-x root root  - switch group
ls -la /usr/bin/pkexec     # -rwsr-xr-x root root  - polkit
ls -la /usr/bin/passwd     # -rwsr-xr-x root root  - change password
ls -la /usr/bin/chsh       # -rwsr-xr-x root root  - change shell
ls -la /usr/bin/chfn       # -rwsr-xr-x root root  - change user info
ls -la /bin/ping           # -rwsr-xr-x root root  - raw sockets (older systems)
ls -la /usr/bin/mount      # -rwsr-xr-x root root  - mounting
```

### Setting and Removing SUID

```bash
# Set SUID (symbolic)
chmod u+s /path/to/program

# Set SUID (numeric)
chmod 4755 /path/to/program   # 4 = SUID, 755 = rwxr-xr-x

# Remove SUID
chmod u-s /path/to/program
chmod 0755 /path/to/program   # 0 = no special bits

# Verify
ls -la /path/to/program
# -rwsr-xr-x  <- SUID set (lowercase s where owner x would be)
# -rwSr-xr-x  <- SUID set but x NOT set (uppercase S = anomaly)
```

### SUID on Directories

SUID on a directory has no standard effect in Linux (unlike BSD where it affects owner inheritance). The kernel ignores it.

### SUID on Scripts - Does Not Work

```bash
# The Linux kernel ignores SUID on interpreted files
chmod u+s /usr/local/bin/myscript.sh
# The script will NOT get root privileges - this is an intentional kernel protection

# Reason: a script launches an interpreter (bash, python),
# it's not executed directly. An attacker could substitute the interpreter.

# Solution: write a C wrapper, set SUID on the binary
```

### SUID and Security

```bash
# SUID is dangerous in the wrong hands
# If a SUID program is vulnerable -> privilege escalation to root

# Example: /usr/bin/find with SUID (if someone accidentally set it)
find . -exec /bin/sh \; -quit   # get a root shell

# Example: /usr/bin/vim with SUID
vim -c ':!bash'                  # get a root shell

# Therefore it's important to:
# 1. Know which SUID files exist in the system
find / -perm -4000 -type f 2>/dev/null | sort

# 2. Compare with a baseline after installation
find / -perm -4000 -type f 2>/dev/null | sort > /root/suid_baseline.txt

# 3. Check for new SUID files
diff /root/suid_baseline.txt <(find / -perm -4000 -type f 2>/dev/null | sort)

# 4. Remove SUID where it's not needed
chmod u-s /usr/bin/chfn    # if not used
chmod u-s /usr/bin/chsh    # if not used
```

---

## SGID - Set Group ID

### What It Does on a File

Similar to SUID, but for groups: the process gets the **effective GID of the file's group**.

```bash
ls -la /usr/bin/wall
# -rwxr-sr-x 1 root tty 35048 /usr/bin/wall
#        ^ s = SGID bit (group's x replaced by s)

# wall belongs to group tty and has SGID
# This allows the program to write to other users' terminals

ls -la /usr/bin/write
# -rwxr-sr-x 1 root tty /usr/bin/write  - same

ls -la /usr/bin/crontab
# -rwxr-sr-x 1 root crontab /usr/bin/crontab
# crontab needs SGID of the crontab group to access /var/spool/cron/
```

### What It Does on a Directory - The Main SGID Feature

On a directory, SGID solves a real problem: **new files and subdirectories inherit the directory's group**, not the creating user's primary group.

```
Without SGID:
alice (groups: alice, developers) creates a file in /srv/project
  -> file belongs to alice:alice  (alice's primary group)

With SGID on /srv/project (group=developers):
alice creates a file in /srv/project
  -> file belongs to alice:developers  (the directory's group!)
```

```bash
# Practical example: shared directory for a team
groupadd developers
usermod -aG developers alice
usermod -aG developers bob

mkdir /srv/project
chown root:developers /srv/project
chmod 2775 /srv/project       # 2 = SGID, 775 = rwxrwxr-x

ls -la /srv/
# drwxrwsr-x  2 root developers  /srv/project
#        ^ s = SGID on directory

# Now alice creates a file
su alice
touch /srv/project/code.py

ls -la /srv/project/
# -rw-rw-r-- 1 alice developers code.py   <- group is developers, not alice!

# bob can edit alice's file (he has group developers permissions)
# Without SGID the file would be alice:alice and bob couldn't edit it
```

### Setting and Removing SGID

```bash
# On a file
chmod g+s /path/to/program
chmod 2755 /path/to/program

# On a directory
chmod g+s /shared/directory/
chmod 2775 /shared/directory/    # rwxrwsr-x

# Remove
chmod g-s /path/to/file
chmod 0755 /path/to/file

# Verify
ls -la /shared/directory/
# drwxrwsr-x  <- SGID set
# drwxrwSr-x  <- SGID set but group x NOT set (uppercase S = anomaly)
```

### SGID and Nested Directories

```bash
# SGID propagates to subdirectories automatically
mkdir /srv/project
chmod g+s /srv/project

# alice creates a subdirectory
mkdir /srv/project/module1

ls -la /srv/project/
# drwxrwsr-x  module1  <- subdirectory AUTOMATICALLY got SGID
# This is the key behavior: SGID propagates recursively to subdirectories

# But on files inside a SGID directory, SGID is NOT set automatically
touch /srv/project/module1/file.py
ls -la /srv/project/module1/
# -rw-rw-r-- file.py   <- normal permissions, no SGID (files aren't executed)
```

---

## Sticky Bit

### History: Original Purpose

Originally, Sticky Bit on a file told the OS: "keep the text segment of this program in memory (swap) even after it exits." This sped up repeated launching of frequently used programs. In modern Linux systems this meaning for files is obsolete and ignored - the kernel manages the cache itself.

### Modern Purpose: Directory Protection

On a directory, Sticky Bit means: **only the file's owner** (or root) can delete the file, even if other users have write `w` permission on the directory.

```
Without Sticky Bit on /tmp:
alice creates /tmp/alice_file
bob (who has w on /tmp) can delete /tmp/alice_file  <- bad

With Sticky Bit on /tmp:
alice creates /tmp/alice_file
bob tries to delete /tmp/alice_file
  -> Permission denied  <- protection works
```

### The Main Example: /tmp

```bash
ls -la /
# drwxrwxrwt  tmp  root  root
#           ^ t = Sticky Bit

# /tmp: everyone can read, write, enter (rwxrwxrwx)
# But only the file's owner or root can delete a file
# This protects one user's files from another

# Verify:
stat /tmp | grep "Access:"
# Access: (1777/drwxrwxrwt)  <- 1 = Sticky Bit
```

### Other Sticky Bit Examples

```bash
ls -la /var/tmp
# drwxrwxrwt  <- /var/tmp is also protected by Sticky Bit

# Shared directories for a group
mkdir /srv/shared
chmod 1777 /srv/shared    # everyone can write, but only delete their own files

# Full combination for a team directory
mkdir /srv/team
chown root:developers /srv/team
chmod 3775 /srv/team      # 3 = SGID + Sticky Bit, 775 = rwxrwxr-x
# SGID: files inherit group developers
# Sticky: everyone protects their files from deletion by teammates
```

### Setting and Removing Sticky Bit

```bash
# Symbolic
chmod +t /shared/directory/
chmod o+t /shared/directory/    # equivalent

# Numeric
chmod 1777 /tmp           # 1 = Sticky, 777 = rwxrwxrwx
chmod 1755 /directory/    # 1 = Sticky, 755 = rwxr-xr-x

# Remove
chmod -t /shared/directory/
chmod 0777 /shared/directory/

# Verify
ls -la /shared/
# drwxrwxrwt  <- Sticky set (lowercase t at the end)
# drwxrwxrwT  <- Sticky set but other x NOT set (uppercase T = anomaly)
```

### What Sticky Bit Actually Protects

```bash
# Sticky Bit protects against rm and rename/move
# Does NOT protect against modifying file content (if w is set on the file)

# Example:
ls -la /tmp/alice_file
# -rw-r--r-- 1 alice alice /tmp/alice_file

# bob CAN:
cat /tmp/alice_file           # read (other has r)

# bob CANNOT (due to Sticky Bit on /tmp):
rm /tmp/alice_file            # Permission denied
mv /tmp/alice_file /tmp/bob/  # Permission denied

# If alice grants write to everyone:
chmod o+w /tmp/alice_file
# Then bob CAN modify the file content
# But still cannot delete it (Sticky Bit protects deletion, not writes)
```

---

## All Three Bits Together: Numeric Notation

```bash
# The fourth (leading) digit in chmod:
# 4 = SUID
# 2 = SGID
# 1 = Sticky Bit
# Combine by adding: 6 = SUID + SGID, 7 = all three

chmod 4755 file     # SUID + rwxr-xr-x
chmod 2755 dir/     # SGID + rwxr-xr-x
chmod 1777 dir/     # Sticky + rwxrwxrwx
chmod 3775 dir/     # SGID + Sticky + rwxrwxr-x
chmod 6755 file     # SUID + SGID + rwxr-xr-x (rarely needed)
chmod 7777 dir/     # everything (don't do this)

# Full table:
# 0 - no special bits
# 1 - Sticky
# 2 - SGID
# 3 - SGID + Sticky
# 4 - SUID
# 5 - SUID + Sticky
# 6 - SUID + SGID
# 7 - SUID + SGID + Sticky
```

---

## Symbolic Display in ls -l

```bash
# SUID - at owner x position
-rwsr-xr-x   # SUID + x set (normal)
-rwSr-xr-x   # SUID without x (anomaly - uppercase S)

# SGID - at group x position
-rwxr-sr-x   # SGID + x set (normal)
-rwxr-Sr-x   # SGID without x (anomaly - uppercase S)
drwxrwsr-x   # SGID on directory (normal)

# Sticky - at other x position
drwxrwxrwt   # Sticky + x set (normal, like /tmp)
drwxrwxrwT   # Sticky without x (anomaly - uppercase T)

# All three together
-rwsr-sr-t   # SUID + SGID + Sticky
```

---

## Finding Files with Special Bits

```bash
# Find all SUID files
find / -perm -4000 -type f 2>/dev/null
find / -perm /4000 -type f 2>/dev/null  # same

# Find all SGID files
find / -perm -2000 -type f 2>/dev/null

# Find SGID directories
find / -perm -2000 -type d 2>/dev/null

# Find Sticky directories
find / -perm -1000 -type d 2>/dev/null

# Find files with any special bit
find / -perm /7000 -type f 2>/dev/null

# Find SUID files in specific directories only
find /usr /bin /sbin -perm -4000 -type f 2>/dev/null

# Pretty output with permissions
find / -perm -4000 -type f -exec ls -la {} \; 2>/dev/null

# Names and permissions only
find / -perm -4000 -type f 2>/dev/null | xargs ls -la 2>/dev/null
```

---

## Security and Common Attack Vectors

### SUID and GTFOBins

GTFOBins is a database of Unix programs through which privilege escalation is possible if they have SUID set.

```bash
# Check SUID files for exploitability
find / -perm -4000 -type f 2>/dev/null

# Dangerous SUID - if someone set these incorrectly:

# find with SUID
find . -exec /bin/sh -p \; -quit      # -p = preserve euid

# bash with SUID
bash -p                                # -p = privileged mode, doesn't drop euid

# vim with SUID
vim -c ':py3 import os; os.execl("/bin/sh", "sh", "-pc", "reset; exec sh -p")'

# cp with SUID - can overwrite /etc/passwd
# python with SUID
python3 -c 'import os; os.execl("/bin/sh", "sh", "-p")'

# nmap with SUID (old method)
nmap --interactive  # -> !sh

# Resource: https://gtfobins.github.io/
```

### Monitoring SUID/SGID Files

```bash
# Create a baseline at system installation
find / -perm -4000 -o -perm -2000 -type f 2>/dev/null | sort \
  > /root/special_bits_baseline.txt

# Check periodically
find / -perm -4000 -o -perm -2000 -type f 2>/dev/null | sort \
  > /tmp/special_bits_current.txt

diff /root/special_bits_baseline.txt /tmp/special_bits_current.txt
# New lines = someone set SUID/SGID

# Monitoring script (for cron)
#!/bin/bash
BASELINE="/root/suid_baseline.txt"
CURRENT=$(find / -perm -4000 -type f 2>/dev/null | sort)
SAVED=$(cat $BASELINE 2>/dev/null)

if [ "$CURRENT" != "$SAVED" ]; then
    echo "ALERT: SUID files changed!" | mail -s "SUID Alert" admin@company.com
    echo "$CURRENT" > $BASELINE
fi
```

### Reducing the Attack Surface

```bash
# Remove SUID from programs that aren't needed
chmod u-s /usr/bin/chsh     # if nobody changes their shell
chmod u-s /usr/bin/chfn     # if finger info change isn't needed
chmod u-s /usr/bin/newgrp   # if not used

# Restrict execution via mount with nosuid
# In /etc/fstab for partitions that don't need SUID:
# /dev/sdb1  /data  ext4  defaults,nosuid,noexec  0 2

# Check current mount options
mount | grep nosuid
cat /proc/mounts | grep nosuid

# Mount /tmp with nosuid (recommended)
# tmpfs  /tmp  tmpfs  defaults,nosuid,noexec,nodev  0 0
```

---

## Practical Scenarios

### Scenario 1: Shared Folder for Developers

```bash
# Goal: /srv/project where all developers can create files,
# files automatically belong to the developers group,
# nobody can delete someone else's files

groupadd developers
usermod -aG developers alice
usermod -aG developers bob
usermod -aG developers charlie

mkdir /srv/project
chown root:developers /srv/project
chmod 3775 /srv/project
# 3 = SGID (2) + Sticky (1)
# 775 = rwxrwxr-x

ls -la /srv/
# drwxrwsr-t  developers  /srv/project
#        ^  ^ SGID + Sticky

# Result:
# alice creates file.py -> file.py belongs to alice:developers (SGID)
# bob creates config.yml -> config.yml belongs to bob:developers (SGID)
# alice CANNOT delete bob's config.yml (Sticky Bit)
# All developers can edit all files (g+w)
```

### Scenario 2: Program with Elevated Privileges

```bash
# Task: a monitoring script needs to read /var/log/auth.log
# which belongs to root and is inaccessible to regular users

# Wrong: give everyone read access to auth.log
# chmod o+r /var/log/auth.log  <- bad

# Right: create a SGID program with the needed group
# 1. Create a group for log access
groupadd logreaders
chown root:logreaders /var/log/auth.log
chmod 640 /var/log/auth.log  # only logreaders group can read

# 2. Write a C wrapper (C is required for SUID/SGID scripts)
cat > /usr/local/bin/read_auth.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
int main() {
    system("tail -n 100 /var/log/auth.log");
    return 0;
}
EOF

gcc -o /usr/local/bin/read_auth /usr/local/bin/read_auth.c
chown root:logreaders /usr/local/bin/read_auth
chmod 2750 /usr/local/bin/read_auth  # SGID: runs as group logreaders

# 3. Add monitoring users to the group
usermod -aG logreaders monitor_user
```

### Scenario 3: System Audit Script

```bash
#!/bin/bash
# Special bits audit script

echo "=== SUID Files ==="
find / -perm -4000 -type f 2>/dev/null | while read f; do
    ls -la "$f"
done

echo ""
echo "=== SGID Files ==="
find / -perm -2000 -type f 2>/dev/null | while read f; do
    ls -la "$f"
done

echo ""
echo "=== SGID Directories ==="
find / -perm -2000 -type d 2>/dev/null | while read d; do
    ls -lad "$d"
done

echo ""
echo "=== Sticky Bit Directories ==="
find / -perm -1000 -type d 2>/dev/null | while read d; do
    ls -lad "$d"
done

echo ""
echo "=== Files Without Owner (potentially dangerous) ==="
find / -nouser -o -nogroup 2>/dev/null | head -20
```

---

## Quick Reference

```bash
# Set SUID
chmod u+s file        chmod 4755 file

# Remove SUID
chmod u-s file        chmod 0755 file

# Set SGID on file
chmod g+s file        chmod 2755 file

# Set SGID on directory
chmod g+s dir/        chmod 2775 dir/

# Set Sticky Bit
chmod +t dir/         chmod 1777 dir/

# SGID + Sticky (team directory)
chmod 3775 dir/       # rwxrwsr-t

# Find SUID files
find / -perm -4000 -type f 2>/dev/null

# Find SGID files/directories
find / -perm -2000 2>/dev/null

# Find Sticky directories
find / -perm -1000 -type d 2>/dev/null
```

| Combination | Chmod | Symbol | Use Case |
| --- | --- | --- | --- |
| SUID | `4755` | `-rwsr-xr-x` | Programs running as owner (passwd, sudo) |
| SGID on file | `2755` | `-rwxr-sr-x` | Programs running as group (wall, crontab) |
| SGID on directory | `2775` | `drwxrwsr-x` | Team projects - group inheritance |
| Sticky on directory | `1777` | `drwxrwxrwt` | /tmp - protect files from deletion |
| SGID + Sticky | `3775` | `drwxrwsr-t` | Team directory with full protection |

---

## References

- `man chmod` - chmod documentation including special bits
- `man 2 execve` - how the kernel handles SUID at execution
- `man 7 credentials` - eUID, eGID and how they work
- [GTFOBins](https://gtfobins.github.io/) - exploiting SUID binaries
- [Linux File Permissions](https://wiki.archlinux.org/title/File_permissions_and_attributes) - Arch Wiki
