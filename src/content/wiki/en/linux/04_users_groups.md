---
title: "Users and Groups (sudo, /etc/passwd, /etc/shadow)"
date: "2026-03-30"
---

Linux is a multi-user system. Every process, file, and resource belongs to a specific user and group.

---

## Types of Users

| Type | UID | Description |
|------|-----|-------------|
| **root** | `0` | Superuser. Full access to everything |
| **System** | `1–999` | Daemons and services (nginx, www-data, postgres) |
| **Regular** | `1000+` | Real human users |

```bash
# View your UID, GID, and groups
id
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

whoami          # just the current username
logname         # the user who logged in (not affected by su)
```

---

## /etc/passwd - User Database

One line per user. World-readable.

```bash
cat /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
# alice:x:1001:1001:Alice Smith,,,:/home/alice:/bin/bash
```

### Line format

```
alice : x : 1001 : 1001 : Alice Smith,,, : /home/alice : /bin/bash
  │     │    │      │           │               │              │
  │     │    │      │           │               │              └── login shell
  │     │    │      │           │               └───────────────── home directory
  │     │    │      │           └───────────────────────────────── GECOS (comment)
  │     │    │      └───────────────────────────────────────────── GID
  │     │    └──────────────────────────────────────────────────── UID
  │     └───────────────────────────────────────────────────────── password (x = in /etc/shadow)
  └─────────────────────────────────────────────────────────────── login name
```

**Password field values:**
- `x` - password is stored in `/etc/shadow`
- `*` - login disabled (system accounts)
- empty — no password required (insecure)

**Shell field values:**
- `/bin/bash` - normal interactive login
- `/usr/sbin/nologin` - login disabled (for daemons)
- `/bin/false` - login disabled (alternative)
- `/bin/sync` - only runs sync command

```bash
# List all logins and their shells
awk -F: '{print $1, $7}' /etc/passwd

# Find users with bash
grep "/bin/bash" /etc/passwd

# Find users without a password
awk -F: '($2 == "" )' /etc/passwd
```

---

## /etc/shadow - Password Hashes

Root-readable only. Stores password hashes and aging policy.

```bash
sudo cat /etc/shadow
# root:$6$rounds=5000$salt$hash...:19000:0:99999:7:::
# alice:$6$xyz$abc...:19500:0:90:7:14::
# bob:!:19200:0:99999:7:::
# carol:!!:19100:::::
```

### Line format

```
alice : $6$xyz$hash : 19500 : 0 : 90 : 7 : 14 : : 
  │         │           │     │    │    │    │   │
  │         │           │     │    │    │    │   └── reserved
  │         │           │     │    │    │    └────── days after expiry before account disabled
  │         │           │     │    │    └─────────── days of warning before password expires
  │         │           │     │    └──────────────── maximum days between password changes
  │         │           │     └───────────────────── minimum days between password changes
  │         │           └─────────────────────────── date of last change (days since 01.01.1970)
  │         └─────────────────────────────────────── password hash
  └───────────────────────────────────────────────── login name
```

**Account status from the hash field:**
- `$6$...` - SHA-512 hash (active account)
- `$5$...` - SHA-256 hash
- `$1$...` - MD5 hash (deprecated, insecure)
- `$y$...` - yescrypt (modern, Debian 11+)
- `!` - account locked
- `!!` - password was never set
- empty - no password required (dangerous)

```bash
# Hash format: $algorithm$parameters$salt$hash
# $6$rounds=5000$randomsalt$XXXXXXXXXXXXXXXXXXX
#  │  │
#  │  └── parameters (rounds = iteration count)
#  └───── 6 = SHA-512
```

---

## /etc/group - Groups

```bash
cat /etc/group
# root:x:0:
# sudo:x:27:alice,bob
# developers:x:1002:alice,carol
# www-data:x:33:
```

### Line format

```
developers : x : 1002 : alice,carol
     │        │    │         │
     │        │    │         └── list of supplementary members
     │        │    └──────────── GID
     │        └───────────────── group password (x = in /etc/gshadow, rarely used)
     └────────────────────────── group name
```

```bash
# View a user's groups
groups alice
# alice : alice sudo developers

id alice
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

# View group members
getent group developers
# developers:x:1002:alice,carol
```

---

## /etc/gshadow - Group Passwords

```bash
sudo cat /etc/gshadow
# developers:!::alice,carol
# sudo:*::alice,bob
```

Rarely used in practice. `!` or `*` means no group password is set.

---

## Managing Users

### useradd - creating a user

```bash
# Basic creation
useradd alice

# Full creation with options
useradd -m -s /bin/bash -c "Alice Smith" -G sudo,developers alice
#        │   │               │             │
#        │   │               │             └── supplementary groups
#        │   │               └──────────────── comment (GECOS)
#        │   └──────────────────────────────── shell
#        └──────────────────────────────────── create home directory

# System user (for services)
useradd -r -s /usr/sbin/nologin -d /var/lib/myapp myapp
#        │   │                    │
#        │   │                    └── home dir (not created)
#        │   └─────────────────────── no login
#        └─────────────────────────── system account (UID < 1000)

# Other options
useradd -u 1500 alice              # set a specific UID
useradd -g developers alice        # primary group
useradd -G sudo,docker alice       # supplementary groups
useradd -e 2026-12-31 alice        # account expiration date
useradd -D                         # show default values
```

### adduser - interactive (Debian/Ubuntu)

```bash
# adduser is a high-level wrapper around useradd
adduser alice
# Creating user `alice'...
# Adding new group `alice' (1001)...
# Adding new user `alice' (1001) with group `alice'...
# Creating home directory `/home/alice'...
# Enter new UNIX password:
# ...

adduser alice sudo              # add to sudo group
adduser alice developers        # add to developers group
```

### usermod — modifying a user

```bash
usermod -s /bin/zsh alice              # change shell
usermod -d /home/newhome -m alice      # move home directory
usermod -l newname alice               # rename user
usermod -u 1500 alice                  # change UID
usermod -g developers alice            # change primary group
usermod -aG sudo alice                 # add to a group (-a = append, important!)
usermod -G sudo,developers alice       # set exact group list (removes others)
usermod -L alice                       # lock account
usermod -U alice                       # unlock account
usermod -e 2026-12-31 alice            # set expiration date
usermod -e "" alice                    # remove expiration date
usermod -c "Alice Smith" alice         # change comment
```

> !!! `usermod -G` **without** `-a` replaces all of the user's groups. Always use `usermod -aG` when adding to a group.

### userdel — deleting a user

```bash
userdel alice                  # delete user (keep home directory)
userdel -r alice               # delete user and home directory and mail spool

# Before deleting — find all files owned by the user
find / -user alice 2>/dev/null
find / -uid 1001 2>/dev/null   # by UID (if user is already deleted)
```

---

## Managing Passwords

### passwd - changing passwords

```bash
passwd                  # change your own password
passwd alice            # change alice's password (root)
passwd -l alice         # lock account (prepends ! to hash in shadow)
passwd -u alice         # unlock account
passwd -d alice         # remove password (insecure)
passwd -e alice         # expire — user must change password at next login
passwd -S alice         # password status
# alice P 2026-03-15 0 90 7 14
#       │ └────────── date of last change
#       └──────────── P=set, L=locked, NP=no password
```

### chage — password aging policy

```bash
chage -l alice                  # show current policy
# Last password change          : Jan 15, 2026
# Password expires              : Apr 15, 2026
# Password inactive             : Apr 29, 2026
# Account expires               : never
# Minimum number of days        : 0
# Maximum number of days        : 90
# Number of days of warning     : 7

chage -M 90 alice               # max 90 days between password changes
chage -m 7 alice                # min 7 days between changes
chage -W 14 alice               # warn 14 days before expiry
chage -I 30 alice               # 30 days of inactivity = lock
chage -E 2026-12-31 alice       # account expires on 2026-12-31
chage -E -1 alice               # account never expires
chage -d 0 alice                # expire immediately (force change at next login)
```

---

## Managing Groups

### groupadd / groupmod / groupdel

```bash
# Create a group
groupadd developers
groupadd -g 2000 devops         # specify GID
groupadd -r syslog              # system group

# Modify a group
groupmod -n newname developers  # rename
groupmod -g 2001 developers     # change GID

# Delete a group
groupdel developers

# Add a user to a group
usermod -aG developers alice
gpasswd -a alice developers     # alternative

# Remove a user from a group
gpasswd -d alice developers
deluser alice developers        # Debian/Ubuntu

# View group members
getent group developers
grep "^developers" /etc/group
```

### newgrp - temporarily switch active group

```bash
# Switch active group in the current session
newgrp developers
# Files created now will belong to the developers group

id
# uid=1001(alice) gid=1002(developers) groups=...

# Return to the primary group
exit
```

---

## sudo - Running Commands with Elevated Privileges

`sudo` (superuser do) allows executing commands as another user (usually root).

### Basic usage

```bash
sudo command                    # run as root
sudo -u bob command             # run as bob
sudo -i                         # interactive root shell (with root's environment)
sudo -s                         # root shell (with current environment)
sudo su -                       # another way to become root
sudo !!                         # repeat the last command with sudo

sudo -l                         # show what's permitted for you
sudo -l -U alice                # show what's permitted for alice (root)
sudo -v                         # update timestamp (extend session)
sudo -k                         # invalidate timestamp (require password again)
```

### /etc/sudoers — configuration

```bash
# NEVER edit /etc/sudoers directly
visudo                          # safe editing with syntax checking
visudo -f /etc/sudoers.d/alice  # edit a separate drop-in file
```

#### sudoers syntax

```
# Format: who  where=(as_whom)  commands
alice   ALL=(ALL:ALL)   ALL
│       │    │    │      │
│       │    │    │      └── commands (ALL = everything)
│       │    │    └───────── group to run as
│       │    └────────────── user to run as
│       └─────────────────── host (ALL = any)
└─────────────────────────── who (user or %group)
```

#### Example rules

```bash
# Full sudo without password (be careful!)
alice   ALL=(ALL)   NOPASSWD: ALL

# Specific commands only
alice   ALL=(ALL)   /usr/bin/systemctl restart nginx, /usr/bin/systemctl status nginx

# No password for specific commands
alice   ALL=(ALL)   NOPASSWD: /usr/bin/apt update, /usr/bin/apt upgrade

# Developers group can restart services
%developers   ALL=(ALL)   /usr/bin/systemctl restart *, /usr/bin/systemctl status *

# Block dangerous commands
alice   ALL=(ALL)   ALL, !/bin/bash, !/bin/sh, !/usr/bin/su

# Run commands as a specific user
alice   ALL=(www-data)   /usr/bin/php, /usr/bin/composer

# Aliases for convenience
Cmnd_Alias SERVICES = /usr/bin/systemctl start *, /usr/bin/systemctl stop *
User_Alias ADMINS = alice, bob, carol
ADMINS   ALL=(ALL)   SERVICES
```

#### /etc/sudoers.d/

```bash
# Better to create separate files than editing /etc/sudoers directly
ls /etc/sudoers.d/

# Create a rule for a user
echo "alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl" | sudo tee /etc/sudoers.d/alice
chmod 440 /etc/sudoers.d/alice

# Rule for a group
cat /etc/sudoers.d/developers
# %developers ALL=(ALL) /usr/bin/docker, /usr/bin/docker-compose
```

---

## su - Switching Users

```bash
su alice                # switch to alice (requires alice's password)
su - alice              # with alice's full environment (recommended)
su -                    # become root (requires root's password)
su -c "command" alice   # run a command as alice
```

> The difference between `su` and `su -`: without the dash, environment variables stay from the current user; with the dash it's a full login (loads the target user's `.bashrc` and `.profile`).

---

## PAM - Pluggable Authentication Modules

PAM controls authentication in Linux. Configs live in `/etc/pam.d/`.

```bash
ls /etc/pam.d/
# common-auth  common-password  login  sshd  sudo  su  ...

# Example /etc/pam.d/common-password
# password requisite pam_pwquality.so retry=3 minlen=12 dcredit=-1 ucredit=-1

# Password complexity settings
apt install libpam-pwquality
cat /etc/security/pwquality.conf
# minlen = 12          # minimum 12 characters
# dcredit = -1         # at least 1 digit
# ucredit = -1         # at least 1 uppercase letter
# lcredit = -1         # at least 1 lowercase letter
# ocredit = -1         # at least 1 special character
# maxrepeat = 3        # no more than 3 repeating characters
```

---

## Locking and Account Management

```bash
# Lock a user account
passwd -l alice                  # prepends ! to the hash in /etc/shadow
usermod -L alice                 # same thing

# Unlock
passwd -u alice
usermod -U alice

# Lock by changing the shell
usermod -s /usr/sbin/nologin alice

# Full lock: both password and expiration
usermod -L -e 1 alice            # date = 1 day since epoch = already expired

# Check status
passwd -S alice
# alice L 2024-01-15 0 90 7 14   ← L = Locked

# List locked accounts
awk -F: '$2 ~ /^!/' /etc/shadow
```

---

## getent - NSS Database Queries

`getent` queries data through the Name Service Switch - works with local files and LDAP/AD alike.

```bash
getent passwd alice              # user entry
getent passwd                    # all users
getent group developers          # group entry
getent group                     # all groups
getent shadow alice              # shadow entry (root only)
getent hosts myserver            # DNS/hosts lookup
```

---

## Auditing and Monitoring

```bash
# Who is currently on the system
who                             # logged-in users
w                               # logged-in users + what they're doing
last                            # login history
last alice                      # login history for alice
lastb                           # failed login attempts (root)
lastlog                         # last login for every user

# Authentication logs
tail -f /var/log/auth.log       # Debian/Ubuntu
tail -f /var/log/secure         # RHEL/CentOS

# Find suspicious activity
grep "Failed password" /var/log/auth.log
grep "Invalid user" /var/log/auth.log
grep "sudo" /var/log/auth.log | grep alice

# Who is using sudo
grep "sudo" /var/log/auth.log
journalctl _COMM=sudo

# User command history (if you have access)
cat /home/alice/.bash_history
```

---

## Practical Scenarios

### Create a new admin user

```bash
useradd -m -s /bin/bash -c "Bob Admin" bob
passwd bob
usermod -aG sudo bob            # Debian/Ubuntu
usermod -aG wheel bob           # RHEL/CentOS
```

### Create a service user

```bash
# User for a web application
useradd -r -s /usr/sbin/nologin -d /opt/myapp -c "MyApp Service" myapp
mkdir -p /opt/myapp
chown myapp:myapp /opt/myapp
```

### Set up sudo for a team

```bash
groupadd devops
usermod -aG devops alice
usermod -aG devops bob

cat > /etc/sudoers.d/devops << 'EOF'
%devops ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/bin/docker, /usr/bin/kubectl
EOF
chmod 440 /etc/sudoers.d/devops
```

### Audit system users

```bash
# All users who can log in
awk -F: '$7 !~ /nologin|false/ {print $1, $3, $7}' /etc/passwd

# Users with UID 0 (should be root only!)
awk -F: '$3 == 0' /etc/passwd

# Users without a password
awk -F: '$2 == ""' /etc/shadow

# Users with sudo access
grep -Po '^[^#]\S+' /etc/sudoers
getent group sudo
getent group wheel
```

---

## Command Cheat Sheet

| Task | Command |
|------|---------|
| Create a user | `useradd -m -s /bin/bash alice` |
| Set password | `passwd alice` |
| Add to group | `usermod -aG sudo alice` |
| Lock account | `passwd -l alice` or `usermod -L alice` |
| Delete with home | `userdel -r alice` |
| Create group | `groupadd developers` |
| Remove from group | `gpasswd -d alice developers` |
| Check groups | `id alice` or `groups alice` |
| Password status | `passwd -S alice` |
| Password policy | `chage -l alice` |
| Who is online | `who` or `w` |
| Login history | `last alice` |

---

## References

- [passwd man page](https://man7.org/linux/man-pages/man5/passwd.5.html) - `man 5 passwd`
- [shadow man page](https://man7.org/linux/man-pages/man5/shadow.5.html) - `man 5 shadow`
- [sudoers man page](https://man7.org/linux/man-pages/man5/sudoers.5.html) - `man 5 sudoers`
- [Linux-PAM documentation](http://www.linux-pam.org/Linux-PAM-html/) - PAM reference
