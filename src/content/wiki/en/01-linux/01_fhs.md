---
title: "Linux Filesystem Hierarchy (FHS)"
date: "2026-03-23"
---

**Filesystem Hierarchy Standard** - a standard that defines the directory structure and directory contents in Linux systems. It specifies where binaries, configs, logs, temporary data, and everything else should live.

> Current version: **FHS 3.0** (2015). Maintained by the Linux Foundation.

---

## Root Directory `/`

Everything starts here. Linux has no `C:\` or `D:\` drives — there is one unified tree, rooted at `/`.

```bash
ls /
# bin  boot  dev  etc  home  lib  lib64  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

---

## Directory Structure

### `/bin` - Essential User Binaries

Commands available to **all users**, required for the system to function even without other partitions mounted.

```bash
ls /bin
# bash  cat  cp  echo  grep  ls  mkdir  mv  rm  sh  ...
```

> On modern distros (Ubuntu 20.04+, Debian 10+) `/bin` is a symlink to `/usr/bin`.

---

### `/sbin` - System Binaries

Commands for **system administration** (typically require root).

```bash
ls /sbin
# fdisk  fsck  ifconfig  iptables  mount  reboot  shutdown  ...
```

> Also a symlink to `/usr/sbin` on modern distributions.

---

### `/boot` - Boot Loader Files

Everything needed to start the system: kernel, initramfs, GRUB config.

```bash
ls /boot
# grub/  initrd.img-6.5.0  vmlinuz-6.5.0  System.map-6.5.0
```

| File | Description |
|------|-------------|
| `vmlinuz-*` | Compressed Linux kernel |
| `initrd.img-*` | Temporary filesystem for early boot |
| `grub/` | GRUB bootloader configs |
| `System.map-*` | Kernel symbol table |

> Never delete files from `/boot` without good reason — the system won't boot.

---

### `/dev` - Device Files

In Linux **everything is a file**, including devices. `/dev` is a virtual filesystem managed by `udev`.

```bash
# Disks
/dev/sda        # first SATA/SCSI disk
/dev/sda1       # first partition on sda
/dev/nvme0n1    # NVMe disk

# Terminals
/dev/tty        # current terminal
/dev/ttyS0      # COM1 (serial)
/dev/pts/0      # pseudo-terminal (SSH session)

# Special devices
/dev/null       # the black hole
/dev/zero       # stream of zeros
/dev/random     # random number generator
/dev/urandom    # fast random (slightly less random)
/dev/stdin      # standard input
/dev/stdout     # standard output
```

```bash
# Practical examples
dd if=/dev/zero of=file.img bs=1M count=100   # create a 100MB file
cat /dev/urandom | head -c 16 | xxd           # random bytes in hex
echo "test" > /dev/null                       # discard output
```

---

### `/etc` - Configuration Files

All **system-wide configuration** lives here. Text files only — no binaries.

```bash
/etc/passwd          # user accounts
/etc/shadow          # password hashes
/etc/group           # groups
/etc/hosts           # local DNS entries
/etc/hostname        # system hostname
/etc/fstab           # filesystem mount table
/etc/crontab         # system cron jobs
/etc/sudoers         # sudo permissions
/etc/ssh/            # SSH configuration
/etc/nginx/          # Nginx configuration
/etc/systemd/        # systemd units and config
/etc/apt/            # APT package manager config
/etc/network/        # network settings (Debian)
/etc/NetworkManager/ # network settings (RHEL/CentOS)
```

```bash
# View all system users
cat /etc/passwd

# Format: login:x:UID:GID:comment:home:shell
root:x:0:0:root:/root:/bin/bash
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
```

> `/etc/shadow` is readable by root only — it contains password hashes.

---

### `/home` - User Home Directories

Every user gets their own directory at `/home/<username>`.

```bash
/home/
├── alice/
│   ├── .bashrc
│   ├── .ssh/
│   │   ├── authorized_keys
│   │   └── id_rsa
│   ├── Documents/
│   └── Downloads/
└── bob/
    └── ...
```

```bash
# ~ is an alias for the current user's home directory
cd ~
echo $HOME    # /home/alice
```

---

### `/root` - Root User's Home Directory

The root user does not live in `/home` — their home is `/root`. This is intentional: `/home` may be on a separate partition.

```bash
ls /root
# .bashrc  .ssh/  .bash_history  ...
```

---

### `/lib` and `/lib64` — System Libraries

Shared libraries (`.so` files) required by binaries in `/bin` and `/sbin`.

```bash
ls /lib/x86_64-linux-gnu/
# libc.so.6  libm.so.6  libpthread.so.0  ...

# View a binary's library dependencies
ldd /bin/ls
# linux-vdso.so.1
# libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
# libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
```

---

### `/usr` - User Programs and Data

The second major hierarchy level. Historically mounted from the network.

```
/usr/
├── bin/          # user programs (python3, git, vim, ...)
├── sbin/         # system programs (apache2, nginx, ...)
├── lib/          # libraries for /usr/bin programs
├── local/        # manually installed programs (not via package manager)
│   ├── bin/
│   ├── lib/
│   └── share/
├── share/        # architecture-independent data (man pages, icons)
│   ├── doc/
│   ├── man/
│   └── locale/
└── include/      # C/C++ header files
```

```bash
# Package manager programs go to /usr/bin
which python3     # /usr/bin/python3
which git         # /usr/bin/git

# Manually compiled programs go to /usr/local/bin
which myprogram   # /usr/local/bin/myprogram
```

---

### `/var` - Variable Data

Data that **changes constantly** during system operation.

```bash
/var/
├── log/          # system logs
│   ├── syslog
│   ├── auth.log
│   ├── kern.log
│   └── nginx/
│       ├── access.log
│       └── error.log
├── www/          # web files
├── lib/          # application state data (package DB, etc.)
│   └── dpkg/     # installed packages database
├── cache/        # application cache
├── spool/        # job queues (cron, mail)
│   └── cron/
├── mail/         # mailboxes
└── run/          # PID files of running services
```

```bash
# Watch logs in real time
tail -f /var/log/syslog
tail -f /var/log/auth.log

# Find all errors from today
grep "error" /var/log/syslog | grep "$(date +%b\ %d)"
```

---

### `/tmp` - Temporary Files

Temporary storage. **Cleared on reboot** (or periodically via systemd-tmpfiles).

```bash
# Create a temporary file
tmpfile=$(mktemp)
echo "data" > $tmpfile

# Create a temporary directory
tmpdir=$(mktemp -d)
cd $tmpdir

# /tmp is world-writable!
ls -la /tmp
# drwxrwxrwt  — sticky bit (t) — only the owner can delete their own file
```

> Never store sensitive data in `/tmp` — it is accessible to all users on the system.

---

### `/proc` - Process Virtual Filesystem

Does not exist on disk - generated by the kernel in memory. It's an interface to the **kernel internals**.

```bash
# Information about a process (by PID)
ls /proc/1/           # init/systemd process
cat /proc/1/status    # process status
cat /proc/1/cmdline   # command line used to start it
ls /proc/1/fd/        # open file descriptors

# System information
cat /proc/cpuinfo     # CPU info
cat /proc/meminfo     # memory info
cat /proc/version     # kernel version
cat /proc/uptime      # system uptime
cat /proc/loadavg     # load average

# Network stats
cat /proc/net/tcp     # TCP connections
cat /proc/net/if_inet6 # IPv6 interfaces
```

```bash
# Practical: find all open sockets of a process
PID=$(pgrep nginx | head -1)
ls -la /proc/$PID/fd/ | grep socket
```

---

### `/sys` - Kernel Virtual Filesystem (sysfs)

Interface to **kernel drivers and devices**. Introduced in Linux 2.6 as a replacement for parts of `/proc`.

```bash
# Network devices
ls /sys/class/net/
cat /sys/class/net/eth0/address     # MAC address

# Power management
cat /sys/class/power_supply/BAT0/capacity  # battery percentage

# Block devices
ls /sys/block/
cat /sys/block/sda/size   # disk size in sectors

# Kernel parameters (runtime)
cat /sys/kernel/hostname
```

---

### `/run` - Runtime Data

Runtime state data. Stored in tmpfs (RAM). Introduced as a replacement for `/var/run`.

```bash
ls /run/
# lock/  systemd/  user/  sshd.pid  nginx.pid  ...

# Service PID files
cat /run/nginx.pid    # PID of nginx master process
cat /run/sshd.pid     # PID of SSH daemon

# Sockets
ls /run/systemd/
ls /run/user/1000/    # user session sockets
```

---

### `/media` and `/mnt` — Mount Points

```bash
/media/   # auto-mounted removable devices (USB, CD/DVD)
/mnt/     # temporary manual mount points

# Manual mount example
mount /dev/sdb1 /mnt/usb
ls /mnt/usb/
umount /mnt/usb

# /media is managed automatically (udisks2, GNOME, etc.)
ls /media/username/USB_DRIVE/
```

---

### `/opt` - Optional Packages

Third-party software that doesn't fit into standard repositories. Each package gets its own subdirectory.

```bash
ls /opt/
# google/  chrome/  teamviewer/  idea/  ...

# For example, IntelliJ IDEA is installed as:
/opt/idea/
├── bin/
│   └── idea.sh
├── lib/
└── plugins/
```

---

### `/srv` - Service Data

Data served by the system (web server, FTP, etc.).

```bash
/srv/
├── http/     # web server data
├── ftp/      # FTP server data
└── git/      # git repositories
```

> In practice, many people use `/var/www` instead of `/srv/http` — it's a matter of convention.

---

## Hierarchy Overview

```
/
├── bin  →  /usr/bin         # essential commands
├── sbin →  /usr/sbin        # system commands
├── lib  →  /usr/lib         # libraries
├── lib64 → /usr/lib64
├── boot/                    # bootloader + kernel
├── dev/                     # device files
├── etc/                     # configuration files
├── home/                    # user home directories
├── root/                    # root user's home
├── media/                   # removable media
├── mnt/                     # manual mount points
├── opt/                     # third-party software
├── proc/                    # virtual FS (processes)
├── run/                     # runtime data (tmpfs)
├── srv/                     # service data
├── sys/                     # virtual FS (kernel)
├── tmp/                     # temporary files
├── usr/                     # programs and data
│   ├── bin/
│   ├── lib/
│   ├── local/
│   └── share/
└── var/                     # variable data
    ├── log/
    ├── lib/
    └── cache/
```

---

## Useful Navigation Commands

```bash
# Where is a program?
which python3           # /usr/bin/python3
whereis nginx           # nginx: /usr/sbin/nginx /etc/nginx /usr/share/man/...
type ls                 # ls is aliased to `ls --color=auto`

# What's taking up space?
du -sh /var/log/*       # size of each log
du -sh /* 2>/dev/null   # size of root-level directories
df -h                   # filesystem usage

# Find a file
find / -name "nginx.conf" 2>/dev/null
find /etc -name "*.conf" -mtime -7    # configs modified in the last 7 days

# File information
stat /etc/passwd
file /bin/ls              # file type
lsof /var/log/syslog      # who has the file open
```

---

## Permissions and Ownership - more details [here](https://mnuryyev.github.io/handson/en/wiki/linux/02_permissions/)

```bash
# FHS defines not just location, but also permissions
ls -la /
# drwxr-xr-x   /          (755) — root:root
# drwxr-xr-x   /etc       (755) — root:root
# drwx------   /root      (700) — root:root
# drwxrwxrwt   /tmp       (1777) — sticky bit!
# drwxr-xr-x   /home      (755) — root:root
# drwx------   /home/user (700) — user:user

# Sticky bit on /tmp — an important detail
# Everyone can write, but only the file owner can delete it
```

---

## Mounting and /etc/fstab

```bash
# View mounted filesystems
mount | column -t
cat /proc/mounts

# /etc/fstab — what gets mounted automatically at boot
# <device>  <mountpoint>  <type>  <options>  <dump>  <pass>
UUID=abc123   /         ext4    defaults      0       1
UUID=def456   /boot     ext4    defaults      0       2
UUID=ghi789   /home     ext4    defaults      0       2
tmpfs         /tmp      tmpfs   defaults      0       0
```

---

## Filesystem Types

| FS | Usage |
|----|-------|
| `ext4` | Default FS for most Linux systems |
| `xfs` | RHEL/CentOS, scales well for large files |
| `btrfs` | Snapshots, compression, built-in RAID |
| `tmpfs` | RAM disk (`/tmp`, `/run`) |
| `proc` | Process virtual filesystem |
| `sysfs` | Kernel virtual filesystem |
| `devtmpfs` | Device files in `/dev` |
| `overlay` | Docker container layers |

---

## Comparison with Other OS

| Linux | macOS | Windows |
|-------|-------|---------|
| `/bin`, `/usr/bin` | `/bin`, `/usr/bin` | `C:\Windows\System32` |
| `/etc` | `/etc` | `C:\Windows\System32\drivers\etc`, Registry |
| `/home/user` | `/Users/user` | `C:\Users\user` |
| `/tmp` | `/tmp` → `/private/tmp` | `%TEMP%` |
| `/dev/sda` | `/dev/disk0` | `\\.\PhysicalDrive0` |
| `/proc` | `/proc` (limited) | WMI, Registry |

---

## References

- [FHS 3.0 Specification](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) - the official standard
- [man hier](https://man7.org/linux/man-pages/man7/hier.7.html) - run `man 7 hier` in your terminal
- [Linux Foundation](https://www.linuxfoundation.org/) - the organization that maintains the standard
