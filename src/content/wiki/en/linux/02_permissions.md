# Linux File Permissions (chmod, chown, umask)

File permissions are the foundation of Linux security. Every file and directory has an owner, a group, and a set of permission bits that control who can read, modify, and execute it.

---

## Core Concept

In Linux, every file has three categories of subjects:

| Category | Symbol | Description |
|----------|--------|-------------|
| Owner | `u` (user) | The user who owns the file |
| Group | `g` (group) | The group associated with the file |
| Others | `o` (other) | Everyone else |
| All | `a` (all) | u + g + o |

And three types of permissions:

| Permission | Symbol | Number | On a file | On a directory |
|------------|--------|--------|-----------|----------------|
| Read | `r` | `4` | Read file contents | List files inside |
| Write | `w` | `2` | Modify file contents | Create/delete files inside |
| Execute | `x` | `1` | Run as a program | Enter the directory (`cd`) |

---

## Reading Permissions (`ls -l`)

```bash
ls -l /etc/passwd
# -rw-r--r-- 1 root root 2847 Mar 10 12:00 /etc/passwd
```

Breaking down the output:

```
-  rw-  r--  r--   1   root  root   2847   Mar 10 12:00  /etc/passwd
│   │    │    │    │    │     │       │
│   │    │    │    │    │     │       └── file size
│   │    │    │    │    │     └────────── group
│   │    │    │    │    └──────────────── owner
│   │    │    │    └───────────────────── number of hard links
│   │    │    └────────────────────────── others permissions (r--)
│   │    └─────────────────────────────── group permissions  (r--)
│   └──────────────────────────────────── owner permissions  (rw-)
└──────────────────────────────────────── file type
```

**File types:**

| Symbol | Type |
|--------|------|
| `-` | Regular file |
| `d` | Directory |
| `l` | Symbolic link |
| `b` | Block device |
| `c` | Character device |
| `p` | Named pipe (FIFO) |
| `s` | Socket |

```bash
# Examples of different types
ls -la /
# drwxr-xr-x  /etc        (directory)
# lrwxrwxrwx  /bin -> usr/bin  (symlink)

ls -la /dev/
# brw-rw----  sda         (block device)
# crw-rw-rw-  null        (character device)
```

---

## Numeric (Octal) Notation

Each permission block is three bits: `r=4`, `w=2`, `x=1`. Add them up:

```
rwx = 4+2+1 = 7
rw- = 4+2+0 = 6
r-x = 4+0+1 = 5
r-- = 4+0+0 = 4
-wx = 0+2+1 = 3
-w- = 0+2+0 = 2
--x = 0+0+1 = 1
--- = 0+0+0 = 0
```

```bash
# Three digits = owner, group, others
chmod 755 script.sh
# rwx r-x r-x
# 7   5   5

chmod 644 file.txt
# rw- r-- r--
# 6   4   4

chmod 600 private.key
# rw- --- ---
# 6   0   0

chmod 777 shared/
# rwx rwx rwx  ← never do this in production
```

---

## chmod — Changing Permissions

### Numeric mode

```bash
chmod 755 script.sh        # rwxr-xr-x
chmod 644 config.conf      # rw-r--r--
chmod 600 ~/.ssh/id_rsa    # rw-------
chmod 700 ~/.ssh/          # rwx------
chmod 777 /tmp/shared      # rwxrwxrwx
chmod 000 locked.txt       # ----------
```

### Symbolic mode

```bash
# Format: chmod [who][+/-/=][permissions] file

chmod u+x script.sh        # add execute for owner
chmod g-w file.txt         # remove write from group
chmod o-r secret.txt       # remove read from others
chmod a+r public.txt       # add read for everyone
chmod u=rwx,g=rx,o= file   # set exact permissions

# Remove execute from everyone
chmod a-x file.txt

# Add execute only if already set for someone (uppercase X)
chmod a+X directory/       # useful for recursive chmod
```

### Recursive application

```bash
# Apply to all files and directories inside
chmod -R 755 /var/www/html/

# Better approach: different permissions for files vs directories
find /var/www/html -type f -exec chmod 644 {} \;   # files: 644
find /var/www/html -type d -exec chmod 755 {} \;   # dirs:  755
```

---

## chown — Changing Owner and Group

```bash
# Syntax: chown [owner][:group] file

chown alice file.txt            # change owner
chown alice:developers file.txt # change owner and group
chown :developers file.txt      # change group only
chown alice: file.txt           # change owner, group = alice's primary group

# Recursive
chown -R www-data:www-data /var/www/html/
chown -R alice:alice /home/alice/
```

```bash
# View a user's UID and GID
id alice
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

# Changing ownership requires root
sudo chown root:root /etc/myconfig
```

---

## chgrp — Changing Group

```bash
# Dedicated command for changing the group
chgrp developers project/
chgrp -R www-data /var/www/

# Equivalent to:
chown :developers project/
```

---

## umask — Default Permission Mask

`umask` defines the permissions that are **subtracted** when new files and directories are created.

```bash
# View the current umask
umask
# 0022

umask -S
# u=rwx,g=rx,o=rx
```

**How umask works:**

```
Files are created with maximum permissions:       666 (rw-rw-rw-)
Directories are created with maximum permissions: 777 (rwxrwxrwx)

umask = 022 means: remove write from group and others

666 - 022 = 644  →  file gets rw-r--r--
777 - 022 = 755  →  directory gets rwxr-xr-x
```

```bash
# umask → resulting permissions table
# umask   file    directory
# 022     644     755        ← standard for most systems
# 027     640     750        ← stricter (group can't see others)
# 077     600     700        ← paranoid mode (owner only)
# 002     664     775        ← team development

# Set umask for the current session
umask 027

# Make it permanent — add to ~/.bashrc or /etc/profile
echo "umask 027" >> ~/.bashrc
```

---

## Special Bits

Beyond standard `rwx`, there are three special permission bits.

### SUID (Set User ID) — bit 4

The file runs with the permissions of its **owner**, not the user who launched it.

```bash
ls -la /usr/bin/passwd
# -rwsr-xr-x 1 root root /usr/bin/passwd
#     ^ s — SUID bit

# passwd runs as root even when called by a regular user
# This allows it to modify /etc/shadow (root-readable only)
```

```bash
# Set SUID
chmod u+s /path/to/program
chmod 4755 /path/to/program   # 4 — SUID prefix

# Find all SUID files on the system
find / -perm -4000 -type f 2>/dev/null
```

> ⚠️ SUID on scripts (sh, bash, python) is ignored by the kernel for security reasons.

### SGID (Set Group ID) — bit 2

**On a file:** runs with the permissions of the file's **group owner**.  
**On a directory:** new files inside inherit the directory's group.

```bash
ls -la /usr/bin/wall
# -rwxr-sr-x 1 root tty /usr/bin/wall
#        ^ s — SGID bit

# On a directory — very useful for team projects
mkdir /srv/project
chown :developers /srv/project
chmod g+s /srv/project         # all new files will belong to the developers group

ls -la /srv/
# drwxrwsr-x  project  root  developers
#        ^ s — SGID on a directory
```

```bash
chmod g+s /path/to/dir
chmod 2755 /path/to/dir   # 2 — SGID prefix

# Find all SGID files
find / -perm -2000 -type f 2>/dev/null
```

### Sticky Bit — bit 1

**On a directory:** a file can only be deleted by its **owner**, even if others have write access.

```bash
ls -la /tmp
# drwxrwxrwt  tmp  root  root
#           ^ t — sticky bit

# Everyone can write to /tmp, but can't delete each other's files
chmod +t /shared/
chmod 1777 /shared/   # 1 — sticky bit prefix
```

```bash
# All three special bits combined (SUID + SGID + Sticky):
# chmod 7755 file    (don't do this without good reason)

# Uppercase T/S — bit is set but x is not (useless combination)
# -rwSr--r--  ← SUID is set but no execute (pointless)
# drwxrwxrwT  ← Sticky is set but no execute
```

---

## ACL — Extended Access Control Lists

Standard `rwx` is sometimes not enough. ACL lets you set permissions for **specific users and groups**.

```bash
# Install the package if needed
apt install acl

# View ACL
getfacl file.txt
# file: file.txt
# owner: alice
# group: developers
# user::rw-
# group::r--
# other::r--

# Give user bob read and write access
setfacl -m u:bob:rw file.txt

# Give group ops read access
setfacl -m g:ops:r file.txt

# Remove ACL for a user
setfacl -x u:bob file.txt

# Remove all ACL entries
setfacl -b file.txt

# Recursive
setfacl -R -m u:bob:rx /var/www/html/

# Default ACL — inherited by new files created inside the directory
setfacl -d -m u:bob:rw /shared/
```

```bash
# Files with ACL show a + sign in ls -l
ls -l file.txt
# -rw-rw-r--+ 1 alice developers  ← + means ACL is present
```

---

## File Attributes (lsattr / chattr)

Attributes work at the filesystem level (ext4) and are independent of permissions.

```bash
# View attributes
lsattr file.txt
# ----i--------e-- file.txt

# Key attributes
chattr +i file.txt    # immutable — cannot be modified, deleted, or renamed (even by root)
chattr +a file.txt    # append-only — can only be appended to (great for logs)
chattr +u file.txt    # undeletable — data is preserved for recovery when deleted

# Remove an attribute
chattr -i file.txt

# Find immutable files
lsattr /etc/ | grep "\-i-"
```

> 🔒 `chattr +i` is powerful protection for configs: even root can't delete the file without removing the attribute first.

---

## Practical Scenarios

### Web server

```bash
# Correct permissions for Nginx/Apache
chown -R www-data:www-data /var/www/html/
find /var/www/html -type f -exec chmod 644 {} \;
find /var/www/html -type d -exec chmod 755 {} \;

# PHP upload directory
chmod 775 /var/www/html/uploads/
chown www-data:developers /var/www/html/uploads/
```

### SSH keys

```bash
# SSH is very strict about permissions — wrong permissions = connection refused
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_rsa          # private key
chmod 644 ~/.ssh/id_rsa.pub      # public key
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/config
```

### Team development

```bash
# Create a shared directory for the team
groupadd developers
usermod -aG developers alice
usermod -aG developers bob

mkdir /srv/project
chown root:developers /srv/project
chmod 2775 /srv/project   # SGID: new files inherit the developers group

# umask for developers
echo "umask 002" >> /etc/profile.d/developers.sh
```

### Protecting configs

```bash
# Configs with passwords — owner only
chmod 600 /etc/app/database.conf
chown app_user:app_user /etc/app/database.conf

# Protect against accidental modification
chattr +i /etc/hosts
chattr +i /etc/resolv.conf

# Logs — append only
chattr +a /var/log/myapp.log
```

---

## Quick Permission Diagnostics

```bash
# Why is access denied?
namei -l /path/to/file          # shows permissions at each path component
stat file.txt                   # full file information

# Check permissions as another user
sudo -u www-data ls /var/www/
sudo -u bob cat /home/alice/file.txt

# What can the current user do?
id                              # uid, gid, groups
groups                          # list of groups
sudo -l                         # sudo permissions

# Find files with unsafe permissions
find /home -perm -o+w -type f   # world-writable files
find / -perm -4000 2>/dev/null  # SUID files
find / -perm -2000 2>/dev/null  # SGID files
find / -nouser 2>/dev/null      # files with no owner (potentially dangerous)
```

---

## Numeric Permissions Cheat Sheet

| Number | Symbol | Typical use |
|--------|--------|-------------|
| `400` | `r--------` | Private keys (owner read-only) |
| `600` | `rw-------` | SSH keys, configs with passwords |
| `640` | `rw-r-----` | Configs (owner + group can read) |
| `644` | `rw-r--r--` | Regular files, HTML, CSS |
| `664` | `rw-rw-r--` | Team shared files |
| `700` | `rwx------` | `~/.ssh` directory, owner-only scripts |
| `750` | `rwxr-x---` | Programs for a group |
| `755` | `rwxr-xr-x` | Programs, directories |
| `775` | `rwxrwxr-x` | Team directories |
| `777` | `rwxrwxrwx` | ⚠️ Only for /tmp-like dirs (dangerous) |

---

## References

- [chmod man page](https://man7.org/linux/man-pages/man1/chmod.1.html) — `man chmod`
- [chown man page](https://man7.org/linux/man-pages/man1/chown.1.html) — `man chown`
- [acl man page](https://man7.org/linux/man-pages/man5/acl.5.html) — `man 5 acl`
- [File permissions and attributes](https://wiki.archlinux.org/title/File_permissions_and_attributes) — Arch Wiki
