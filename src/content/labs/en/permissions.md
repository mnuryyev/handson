# Lab 01. Linux Filesystem — Complete Access Control Map

## Introduction

Every time an administrator sets permissions on a file or directory, they are making a decision about who can do what on the system. Misconfigured permissions are one of the most common causes of successful attacks on Linux systems — not exploits, not zero-days, just `chmod 777` in the wrong place.

In this lab we will cover Unix permissions not in theory but in practice: build an isolated directory structure, set up users, reproduce real attack scenarios, and understand why SUID, SGID, and Sticky bit exist in the first place.

## Theoretical Background

### How Unix Permissions Work

Every file and directory in Linux has three permission groups: for the **owner**, the **group**, and **others**. Each group contains three bits:

| Bit | Symbol | Meaning for a file | Meaning for a directory |
| --- | --- | --- | --- |
| read | r | Read file contents | List files inside |
| write | w | Modify the file | Create and delete files inside |
| execute | x | Run the file | Enter the directory (cd) |

Permissions are written in octal: `r=4`, `w=2`, `x=1`. Three digits — for owner, group, others.

| Permission | Octal | Owner | Group | Others | Typical use |
| --- | --- | --- | --- | --- | --- |
| rwxrwxrwx | 777 | everything | everything | everything | Never — this is a mistake |
| rwxr-xr-x | 755 | everything | read + execute | read + execute | Binaries, public directories |
| rwx------ | 700 | everything | nothing | nothing | Private directories |
| rw-r----- | 640 | read + write | read only | nothing | Config files with secrets |

### Special Bits

Beyond rwx, there are three special bits that change filesystem behaviour:

**SUID (Set User ID, bit 4000)** — the file runs with the privileges of its **owner**, not the user who launched it. This is exactly why a regular user can change their password via `/usr/bin/passwd`, even though `/etc/shadow` belongs to root.

**SGID (Set Group ID, bit 2000)** — same idea but for the group. On directories: all new files created inside inherit the directory's group instead of the creating user's group. Useful for shared team environments.

**Sticky bit (bit 1000)** — on a directory: a user can only delete **their own** files, even if they have write permission on the directory itself. The classic example is `/tmp`.

In symbolic notation the special bits appear as:
- SUID: `s` in place of `x` for owner (`-rwsr-xr-x`)
- SGID: `s` in place of `x` for group (`-rwxr-sr-x`)
- Sticky: `t` in place of `x` for others (`drwxrwxrwt`)

---

## Phase 1. Environment Setup

### Step 1. Creating the Directory Tree

We create a directory tree under `/lab`. The `-p` flag creates all intermediate directories in one command — if `/lab` already exists, no error is produced.

```bash
sudo mkdir -p /lab/public /lab/private /lab/shared
ls -la /lab/
```

![01_mkdir](images/lab01_permissions/01_mkdir.png)

By default `mkdir` sets permissions to `755` — the owner has full access, everyone else can only read and enter the directory.

### Step 2. Setting Different Permissions

We apply different permissions to each directory and create a separate secret directory with strict restrictions:

```bash
sudo chmod 777 /lab/public
sudo chmod 755 /lab/private
sudo mkdir /lab/secret
sudo chmod 700 /lab/secret
```

Create test files in each directory as root:

```bash
sudo bash -c 'echo "public data"  > /lab/public/file.txt'
sudo bash -c 'echo "private data" > /lab/private/file.txt'
sudo bash -c 'echo "secret data"  > /lab/secret/file.txt'

ls -la /lab/
```

![02_chmod](images/lab01_permissions/02_chmod.png)

![03_echo_ls](images/lab01_permissions/03_echo_ls.png)

Notice the permission column in `ls -la`: `drwxrwxrwx` for public, `drwxr-xr-x` for private, and `drwx------` for secret. The secret directory is completely closed to everyone except root.

---

## Phase 2. Users and Access Separation

### Step 3. Creating Test Users

We create two users with home directories and a bash shell. The `-m` flag creates `/home/user1`, and `-s` sets the shell.

```bash
sudo useradd -m -s /bin/bash user1
sudo useradd -m -s /bin/bash user2
sudo passwd user1   # set password: user1pass
sudo passwd user2   # set password: user2pass

id user1
id user2
```

![04_add_users](images/lab01_permissions/04_add_users.png)

The `id` command shows the UID and GID of each user. Both belong only to their own groups — they are not in the root group and have no sudo privileges.

### Step 4. Checking Access as user1

Switch to user1 and verify what they can and cannot access:

```bash
su - user1

ls /lab/public    # ✅ accessible — permissions 777
ls /lab/private   # ✅ accessible — permissions 755, x set for others
ls /lab/secret    # ❌ Permission denied — permissions 700, root only

cat /lab/secret/file.txt  # ❌ also denied

id
exit
```

![05_login_user1](images/lab01_permissions/05_login_user1.png)

Key point: `/lab/private` with permissions `755` **is visible** to a regular user. Many assume "private" means closed — it does not. Closed means `700`.

### Step 5. Checking Access as user2

```bash
su - user2

ls /lab/secret    # ❌ Permission denied — same result
ls /lab/public    # ✅ can see files
exit
```

![06_login_user2](images/lab01_permissions/06_login_user2.png)

Both users get the same result — `/lab/secret` is inaccessible to both. Permissions `700` mean: **only the owner (root) has access**.

---

## Phase 3. Sticky Bit — Protecting Against Deletion of Others' Files

### Step 6. Applying the Sticky Bit to /lab/shared

The sticky bit is added as the fourth digit `1` at the beginning of the octal value:

```bash
sudo chmod 1777 /lab/shared
ls -la /lab/
```

![07_sticky_1](images/lab01_permissions/07_sticky_1.png)

The letter `t` is now visible at the end of the permissions: `drwxrwxrwt`. Without the sticky bit this would be `drwxrwxrwx` — and any user could delete anyone else's files.

### Step 7. user2 Creates a File in shared

```bash
su - user2

touch /lab/shared/user2_important.txt
echo "User2 data" > /lab/shared/user2_important.txt
ls -la /lab/shared/
exit
```

![08_user2_creates_file](images/lab01_permissions/08_user2_creates_file.png)

File created. Owner is user2, group is user2. Permissions `664` — user2 can read and write, others can only read.

### Step 8. user1 Tries to Delete user2's File

Without the sticky bit this would succeed — user1 has write permission on the directory (rwxrwxrwt → w for others). The sticky bit adds an additional ownership check:

```bash
su - user1

rm /lab/shared/user2_important.txt
# rm: remove write-protected regular file ...? y
# rm: cannot remove ...: Operation not permitted ❌

# But deleting own files works fine:
touch /lab/shared/user1_file.txt
rm /lab/shared/user1_file.txt  # ✅ works
exit
```

![09_user1_trying_delete](images/lab01_permissions/09_user1_trying_delete.png)

![10_user1_deleting_his_file](images/lab01_permissions/10_user1_deleting_his_file.png)

This is exactly how `/tmp` works on any Linux system: everyone can write, but no one can delete someone else's temporary files.

---

## Phase 4. Finding SUID and SGID Files System-Wide

### Step 9. Finding All SUID Files

`find` with `-perm -4000` locates files that have bit 4000 (SUID) set. Redirecting `2>/dev/null` suppresses "Permission denied" errors when scanning directories we cannot enter.

```bash
find / -perm -4000 2>/dev/null
```

![11_suid_files](images/lab01_permissions/11_suid_files.png)

The output includes key system utilities: `/usr/bin/passwd`, `/usr/bin/su`, `/usr/bin/sudo`, `/usr/bin/mount`. All of them run as root precisely because their job is to perform privileged operations on behalf of regular users in a controlled manner.

### Step 10. Finding All SGID Files

```bash
find / -perm -2000 2>/dev/null
```

![12_sgid_files](images/lab01_permissions/12_sgid_files.png)

SGID files include `/usr/bin/crontab` and password-checking utilities like `unix_chkpwd`. The latter has SGID set to the `shadow` group — this is how it gains access to `/etc/shadow` to verify passwords without requiring full root privileges.

### Step 11. Both Bits — Extended Output

The `/6000` mask means "bit 4000 OR bit 2000". We pipe the result into `xargs ls -la` to display detailed permissions for each file:

```bash
find / -perm /6000 -type f 2>/dev/null | xargs ls -la 2>/dev/null
```

![13_together](images/lab01_permissions/13_together.png)

Notice that most found files reside inside snap packages (`/snap/core22/...`). Snap packages bundle their own copies of standard utilities — this is expected, but during a pentest every non-standard path deserves a closer look.

---

## Phase 5. Analysing /usr/bin/passwd — Why SUID Is Necessary

### Step 12. Permissions on passwd and shadow

```bash
ls -la /usr/bin/passwd
ls -la /etc/shadow
```

![15_suid_shadow](images/lab01_permissions/15_suid_shadow.png)

`/etc/shadow` stores password hashes for all users. Its permissions are `640` with owner root and group shadow. A regular user is not in this group and cannot read the file directly.

### Step 13. user1 Cannot Read shadow Directly

```bash
su - user1
cat /etc/shadow  # ❌ Permission denied
```

![16_user1_cat_shadow](images/lab01_permissions/16_user1_cat_shadow.png)

Direct access to `/etc/shadow` is blocked. Yet users must be able to **change their own** password.

### Step 14. Changing a Password via passwd — It Works

```bash
su - user1
passwd
# Current password: ...
# New password: ...
# passwd: password updated successfully ✅
```

![17_changing_pass](images/lab01_permissions/17_changing_pass.png)

This is the purpose of SUID. `passwd` runs with root's privileges, writes **only the current user's entry** in `/etc/shadow`, and exits. Controlled access to a privileged resource.

### Step 15. Tracing System Calls with strace

Let's observe what actually happens inside `passwd` at the system call level:

```bash
sudo strace -e trace=open,openat passwd 2>&1 | grep shadow
```

![18_strace](images/lab01_permissions/18_strace.png)

`strace` intercepts `open` and `openat` system calls — the calls programs use to open files. When `/etc/shadow` appears in the output it confirms that `passwd` does access the protected file, acting with root's privileges through the SUID mechanism.

---

## Phase 6. Cleaning Up

### Step 16. Removing Users and Directories

```bash
sudo userdel -r user1
sudo userdel -r user2
sudo rm -rf /lab

# Verify
id user1 2>&1      # no such user
ls /lab 2>&1       # No such file or directory
```

![19_deleting_all](images/lab01_permissions/19_deleting_all.png)

The `-r` flag in `userdel` removes the user's home directory along with the account. The warning about the mail spool is normal — it simply never existed.

---

## Summary and Conclusions

### Special Bits Reference

| Bit | Command | On a file | On a directory | Risk if misused |
| --- | --- | --- | --- | --- |
| SUID | `chmod u+s` / `4xxx` | Runs as file owner | Not applicable | Privilege escalation to root |
| SGID | `chmod g+s` / `2xxx` | Runs as file group | New files inherit group | Access to group-owned data |
| Sticky | `chmod +t` / `1xxx` | Not applicable | Only delete own files | Without it — anyone deletes anyone's files |

### Common Mistakes and Their Consequences

| Mistake | Example | Consequence |
| --- | --- | --- |
| chmod 777 on a data directory | `/var/www/uploads` with 777 | Any user can write and delete files |
| SUID on an interpreter | `chmod u+s /bin/bash` | Any user gets a root shell |
| No sticky bit on /tmp | `/tmp` without bit 1 | Users can delete each other's temp files |
| Readable /etc/shadow | `chmod 644 /etc/shadow` | Offline hash cracking via hashcat |
| SGID on world-writable directory without sticky | `/lab/shared` missing sticky | Group files accessible to all |

### What to Check During a System Audit

```bash
# Find non-standard SUID files (outside standard paths)
find / -perm -4000 2>/dev/null | grep -v "^/usr/bin\|^/usr/lib\|^/bin\|^/sbin\|^/snap"

# Find world-writable directories
find / -type d -perm -0002 2>/dev/null | grep -v proc

# Find files with no owner (sign of a deleted user account)
find / -nouser -o -nogroup 2>/dev/null
```

In this lab we built a complete practical map of Unix access controls — from basic `chmod` to special bits SUID, SGID, and Sticky. Each mechanism was tested in real scenarios with multiple users, which is exactly how permissions behave in production systems. Understanding these mechanisms is critical both for hardening systems and for auditing them.
