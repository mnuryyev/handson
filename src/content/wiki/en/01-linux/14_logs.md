---
title: "Linux Logs (/var/log, journalctl, syslog)"
date: "2026-05-07"
---

Logs are records of system events. Without them it's impossible to diagnose problems, track security incidents, or understand what's happening under the hood. Linux has two parallel logging worlds: classic text files in `/var/log` and the binary systemd journal (journald).

---

## Linux Logging Architecture

```
Application / Kernel
       │
       ├──► /dev/log (socket)
       │          │
       │    syslog daemon (rsyslog / syslog-ng)
       │          │
       │    /var/log/*.log   ←── plain text files
       │
       └──► systemd journal (journald)
                  │
            /run/log/journal/   ←── binary journal (volatile)
            /var/log/journal/   ←── if persistent storage is configured
```

Before systemd, all logging went through the syslog daemon. Now both mechanisms coexist: journald captures everything (service stdout/stderr, kernel messages, syslog socket), while rsyslog can read from journald and write to files.

---

## /var/log - Directory Structure

```bash
ls /var/log/
```

| File / Directory | Contents |
| --- | --- |
| `syslog` | Main system journal (Debian/Ubuntu) |
| `messages` | Main system journal (RHEL/CentOS) |
| `auth.log` | Authentication: ssh, sudo, su (Debian/Ubuntu) |
| `secure` | Authentication (RHEL/CentOS) |
| `kern.log` | Kernel messages |
| `dmesg` | Kernel boot messages (ring buffer snapshot) |
| `boot.log` | System boot log |
| `dpkg.log` | Package install/remove (Debian) |
| `apt/history.log` | apt command history |
| `cron` / `cron.log` | Cron job logs |
| `mail.log` / `maillog` | Mail server logs |
| `nginx/` | nginx logs (access.log, error.log) |
| `apache2/` | Apache logs |
| `mysql/` | MySQL logs |
| `fail2ban.log` | Blocked IPs by fail2ban |
| `audit/audit.log` | Security audit log (auditd) |
| `lastlog` | Last login per user (binary) |
| `wtmp` | Full login/logout history (binary) |
| `btmp` | Failed login attempts (binary) |

```bash
# Check sizes of all log files
du -sh /var/log/* 2>/dev/null | sort -rh | head -20

# List files with modification dates
ls -lth /var/log/ | head -20
```

---

## Reading Plain Text Logs

### Basic Tools

```bash
# View full file
cat /var/log/syslog

# Paginated view
less /var/log/syslog
# in less: G - end, g - start, /word - search, q - quit

# Last N lines
tail -n 50 /var/log/syslog
tail -n 100 /var/log/auth.log

# Follow in real time
tail -f /var/log/syslog
tail -f /var/log/nginx/access.log

# Follow multiple files simultaneously
tail -f /var/log/syslog /var/log/auth.log

# First N lines
head -n 50 /var/log/syslog
```

### Search and Filtering

```bash
# Find all lines with a keyword
grep "error" /var/log/syslog
grep -i "error" /var/log/syslog          # case-insensitive
grep -i "fail\|error\|warn" /var/log/syslog  # multiple patterns

# With context (lines before and after)
grep -A 3 -B 3 "segfault" /var/log/syslog  # 3 lines before and after
grep -C 5 "kernel panic" /var/log/syslog   # 5 lines of context

# Invert (exclude lines)
grep -v "systemd" /var/log/syslog

# Only count matches
grep -c "error" /var/log/syslog

# Show line numbers
grep -n "sshd" /var/log/auth.log

# Recursively across all files in /var/log
grep -r "192.168.1.100" /var/log/
grep -rl "error" /var/log/          # only filenames

# Regular expressions
grep -E "error|warning|critical" /var/log/syslog
grep -E "^May  7" /var/log/syslog   # lines with a specific date
```

### Working with Time Ranges

```bash
# Filter by date (format depends on distribution)
# syslog format: "May  7 14:32:01"
grep "^May  7" /var/log/syslog
grep "^May  7 1[4-6]:" /var/log/syslog   # 14:00 to 16:59

# Time range with awk
awk '/May  7 14:00/,/May  7 15:00/' /var/log/syslog

# Last hour (rough - last 1000 lines)
tail -n 1000 /var/log/syslog | grep "$(date +'%b %e %H')"
```

### Analysis with awk and sed

```bash
# Extract only IP addresses
grep "sshd" /var/log/auth.log | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'

# Top IPs by number of login attempts
grep "Failed password" /var/log/auth.log \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
  | sort | uniq -c | sort -rn | head -10

# Top URLs in nginx access.log
awk '{print $7}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn | head -20

# Top HTTP status codes
awk '{print $9}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn

# Error count by hour
grep "error" /var/log/syslog \
  | awk '{print $3}' \
  | cut -d: -f1 \
  | sort | uniq -c
```

---

## Syslog Format

Classic format (RFC 3164):

```
May  7 14:32:01 hostname sshd[1234]: Failed password for alice from 10.0.0.5 port 54321 ssh2
│               │         │    │      └── message
│               │         │    └───────── process PID
│               │         └────────────── program name (tag)
│               └──────────────────────── hostname
└──────────────────────────────────────── timestamp
```

Extended format (RFC 5424):

```
<34>1 2026-05-07T14:32:01.000Z hostname sshd 1234 - - Failed password...
│     │ │                        │         │    │
│     │ └── ISO 8601 timestamp    │         │    └── PID
│     └── version                 │         └── program
└── priority (facility * 8 + severity)        
```

### Facility and Severity

```bash
# Facility (message source)
# 0  - kern    (kernel)
# 1  - user    (user-level programs)
# 2  - mail    (mail system)
# 3  - daemon  (system daemons)
# 4  - auth    (authentication)
# 10 - authpriv (private authentication)
# 16-23 - local0..local7 (free for custom use)

# Severity (level)
# 0 - emerg   (system is unusable)
# 1 - alert   (action must be taken immediately)
# 2 - crit    (critical condition)
# 3 - err     (error conditions)
# 4 - warning (warning conditions)
# 5 - notice  (normal but significant)
# 6 - info    (informational)
# 7 - debug   (debug-level messages)

# Priority = facility * 8 + severity
# <34> = 4 * 8 + 2 = auth + crit
```

---

## rsyslog - Configuration

rsyslog is the standard syslog daemon on Debian/Ubuntu/RHEL.

```bash
# Config files
/etc/rsyslog.conf           # main config
/etc/rsyslog.d/*.conf       # additional configs

# Validate config
rsyslogd -N1

# Restart
systemctl restart rsyslog
systemctl status rsyslog
```

### Core rsyslog Syntax

```bash
# /etc/rsyslog.conf
# Format: facility.severity    action

# All kernel messages to kern.log
kern.*                          /var/log/kern.log

# All errors and above to /var/log/error
*.err                           /var/log/error

# auth and authpriv to auth.log
auth,authpriv.*                 /var/log/auth.log

# Everything except auth to syslog
*.*;auth,authpriv.none          /var/log/syslog

# info and above, excluding mail/auth/cron
*.info;mail.none;authpriv.none;cron.none  /var/log/messages

# Duplicate emergency messages to root's console
*.emerg                         :omusrmsg:root

# Send to remote syslog server (UDP)
*.* @192.168.1.10:514

# Send to remote syslog server (TCP, more reliable)
*.* @@192.168.1.10:514
```

### Custom Config Example

```bash
# /etc/rsyslog.d/nginx.conf
# Capture nginx logs to a separate file
if $programname == 'nginx' then /var/log/nginx/rsyslog.log
& stop   # stop processing this message further
```

---

## dmesg - Kernel Messages

`dmesg` displays the kernel ring buffer. Especially useful for diagnosing hardware issues, boot problems, and kernel errors.

```bash
# Basic commands
dmesg                          # full buffer
dmesg | less                   # paginated
dmesg -T                       # human-readable timestamps
dmesg -H                       # pretty output (human-readable + colors)
dmesg -w                       # follow in real time (watch)
dmesg -c                       # print and clear buffer (requires root)

# Filter by level
dmesg -l err                   # errors only
dmesg -l warn,err,crit         # multiple levels
dmesg -l emerg,alert,crit,err  # all serious levels

# Filter by device/event type
dmesg | grep -i "usb"          # USB events
dmesg | grep -i "eth\|enp\|ens"  # network interfaces
dmesg | grep -i "error\|fail"  # errors
dmesg | grep -i "oom"          # Out Of Memory killer
dmesg | grep -i "sda\|nvme"    # disk devices
dmesg | grep -i "thermal\|temperature"  # temperature

# Boot errors
dmesg -T | grep -i "error\|fail\|warn" | head -30
```

### Typical dmesg Messages

```bash
# OOM Killer (out of memory)
# [123456.789] Out of memory: Killed process 1234 (python3) ...

# Disk error
# [123456.789] ata1.00: error: { UNC }
# [123456.789] end_request: I/O error, dev sda, sector 1234567

# USB device connected
# [123456.789] usb 1-1: new high-speed USB device number 3

# Kernel module loaded
# [    0.123] Loading driver: e1000e
```

---

## journalctl - systemd Journal

`journalctl` is the tool for reading the binary systemd journal (journald). It stores structured data: service name, PID, UID, priority, and more.

### Basic Commands

```bash
journalctl                     # full journal (oldest first)
journalctl -r                  # newest first
journalctl -f                  # follow in real time
journalctl -e                  # jump to end of journal
journalctl -n 50               # last 50 lines
journalctl -n 100 -r           # last 100, newest first
```

### Time Filters

```bash
# Absolute time
journalctl --since "2026-05-07 14:00:00"
journalctl --until "2026-05-07 15:00:00"
journalctl --since "2026-05-07 14:00:00" --until "2026-05-07 15:00:00"

# Relative time
journalctl --since "1 hour ago"
journalctl --since "2 hours ago" --until "1 hour ago"
journalctl --since "yesterday"
journalctl --since "today"
journalctl --since "-30m"       # last 30 minutes

# Current boot
journalctl -b                   # current boot
journalctl -b -1                # previous boot
journalctl -b -2                # two boots ago

# List all boots
journalctl --list-boots
# -2  abc123  Mon 2026-05-05 10:00:00  Mon 2026-05-05 23:59:59
# -1  def456  Tue 2026-05-06 08:00:00  Tue 2026-05-06 23:59:59
#  0  ghi789  Wed 2026-05-07 09:00:00  n/a
```

### Filters by Service and Unit

```bash
# By service (unit) name
journalctl -u nginx              # all nginx logs
journalctl -u nginx -f           # real time
journalctl -u nginx -n 100       # last 100 lines
journalctl -u nginx --since "1 hour ago"

# Multiple services at once
journalctl -u nginx -u php-fpm -u mysql

# By executable path
journalctl /usr/sbin/sshd
journalctl /usr/bin/python3
```

### Priority Filters

```bash
# -p sets the level (0-7 or name)
journalctl -p err               # errors and above (0-3)
journalctl -p warning           # warnings and above (0-4)
journalctl -p info              # info and above (0-6)
journalctl -p debug             # everything (0-7)

# Range of levels
journalctl -p warning..err      # from warning to err
journalctl -p 4..3              # by number

# Levels: emerg(0) alert(1) crit(2) err(3) warning(4) notice(5) info(6) debug(7)
```

### Process and User Filters

```bash
# By PID
journalctl _PID=1234

# By UID (user)
journalctl _UID=1000
journalctl _UID=$(id -u alice)

# By executable name
journalctl _COMM=sshd
journalctl _COMM=nginx

# By executable path
journalctl _EXE=/usr/sbin/sshd

# Combine filters (AND)
journalctl _UID=1000 _COMM=bash

# Combine (OR)
journalctl _COMM=sshd + _COMM=sudo
```

### Output Formats

```bash
journalctl -o short             # standard (default)
journalctl -o short-precise     # with microseconds
journalctl -o short-iso         # ISO 8601 timestamps
journalctl -o verbose           # all fields of each entry
journalctl -o json              # JSON format
journalctl -o json-pretty       # JSON with indentation
journalctl -o cat               # message only, no metadata
journalctl -o export            # for export/backup

# JSON - convenient for parsing
journalctl -u nginx -o json-pretty | head -60

# Example JSON entry:
# {
#   "__REALTIME_TIMESTAMP" : "1746620321000000",
#   "_HOSTNAME" : "server01",
#   "_SYSTEMD_UNIT" : "nginx.service",
#   "PRIORITY" : "6",
#   "MESSAGE" : "Started A high performance web server",
#   "_PID" : "1234",
#   "_COMM" : "nginx"
# }
```

### Journal Management

```bash
# Journal size on disk
journalctl --disk-usage

# Clean up old entries
journalctl --vacuum-size=500M    # keep no more than 500 MB
journalctl --vacuum-time=30d     # delete entries older than 30 days
journalctl --vacuum-files=5      # keep only 5 journal files

# Force journal rotation
journalctl --rotate

# Verify journal integrity
journalctl --verify
```

### Configuring journald

```bash
# /etc/systemd/journald.conf

[Journal]
# Storage: "persistent" (to disk), "volatile" (RAM only), "auto", "none"
Storage=persistent

# Maximum journal size on disk
SystemMaxUse=1G

# Maximum size of a single journal file
SystemMaxFileSize=128M

# Keep logs no longer than N days
MaxRetentionSec=30day

# Compress old entries
Compress=yes

# Forward to syslog
ForwardToSyslog=yes

# Maximum level to forward to syslog
MaxLevelSyslog=warning
```

```bash
# Apply changes
systemctl restart systemd-journald

# Create directory for persistent storage
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
```

---

## logger - Write to Syslog from CLI

```bash
# Basic syntax
logger "This is a test message"

# With level and facility
logger -p user.info "Deployment started"
logger -p user.err "Deployment failed!"
logger -p auth.warning "Suspicious activity detected"

# With a tag (program name)
logger -t myapp "Service started"
logger -t deploy -p local0.info "v2.3.1 deployed"

# With hostname
logger -n 192.168.1.10 -P 514 "Send to remote syslog"

# Read from stdin
echo "Critical error" | logger -p user.crit -t myapp
cat error.log | logger -t import-errors

# Verify it was recorded
journalctl -t myapp -n 5
grep "myapp" /var/log/syslog | tail -5
```

---

## Binary Log Files

Some files in `/var/log` are binary - they cannot be read with `cat`.

### last, lastb, lastlog

```bash
# last - login history (reads /var/log/wtmp)
last                           # all logins
last alice                     # logins for user alice
last -n 20                     # last 20 entries
last -F                        # full timestamps
last -x                        # include shutdowns and reboots
last reboot                    # reboot history
last shutdown                  # shutdown history

# Example last output:
# alice    pts/0  192.168.1.5    Wed May  7 14:32   still logged in
# root     tty1                  Wed May  7 09:00 - 09:05  (00:05)
# reboot   system boot           Wed May  7 08:55

# lastb - failed login attempts (reads /var/log/btmp, requires root)
lastb                          # all failed logins
lastb -n 20                    # last 20
lastb alice                    # failed logins for alice

# lastlog - last login per user
lastlog                        # all users
lastlog -u alice               # specific user
lastlog -t 7                   # logins within last 7 days
lastlog -b 7                   # users who haven't logged in for 7+ days
```

---

## logrotate - Log Rotation

logrotate automatically archives and removes old logs.

```bash
# Config files
/etc/logrotate.conf             # main config
/etc/logrotate.d/               # per-application configs

# Preview what would happen (dry run)
logrotate -d /etc/logrotate.conf

# Force rotation now
logrotate -f /etc/logrotate.conf
logrotate -f /etc/logrotate.d/nginx
```

### Example logrotate Config

```bash
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily                      # rotate daily
    missingok                  # don't error if file is missing
    rotate 30                  # keep 30 archives
    compress                   # compress archives (gzip)
    delaycompress              # compress on next rotation (not immediately)
    notifempty                 # don't rotate empty files
    create 0640 www-data adm   # create new file with 640 permissions
    sharedscripts              # run scripts once for all matched files

    postrotate
        # Reload nginx after rotation
        [ -f /run/nginx.pid ] && kill -USR1 $(cat /run/nginx.pid)
    endscript
}
```

```bash
# Archive naming
# access.log          - current
# access.log.1        - yesterday
# access.log.2.gz     - two days ago
# ...
# access.log.30.gz    - 30 days ago

# Read a compressed archive
zcat /var/log/nginx/access.log.2.gz
zgrep "error" /var/log/nginx/access.log.*.gz
zless /var/log/nginx/access.log.3.gz
```

---

## Centralized Logging

### Sending Logs to a Remote Server

```bash
# Client: /etc/rsyslog.d/remote.conf

# Send all logs via UDP (fast, may lose messages)
*.* @192.168.1.100:514

# Send all logs via TCP (more reliable)
*.* @@192.168.1.100:514

# Only critical errors
*.crit @@192.168.1.100:514

# With TLS (recommended for production)
$DefaultNetstreamDriver gtls
*.* @@192.168.1.100:6514
```

```bash
# Server: /etc/rsyslog.d/server.conf

# Accept via UDP
module(load="imudp")
input(type="imudp" port="514")

# Accept via TCP
module(load="imtcp")
input(type="imtcp" port="514")

# Save logs by client hostname
$template RemoteLogs,"/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log"
*.* ?RemoteLogs
```

### Forwarding journald to Remote Syslog

```bash
# /etc/systemd/journald.conf
[Journal]
ForwardToSyslog=yes

# Or forward directly via journalctl
journalctl -f -o json | \
  nc -u 192.168.1.100 514
```

---

## Useful One-liners

```bash
# Monitor all new entries in real time
journalctl -f

# Find all SSH attempts today
journalctl -u ssh --since today | grep "Failed\|Invalid"

# Top 10 IPs by failed SSH attempts
grep "Failed password" /var/log/auth.log \
  | grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}' \
  | sort | uniq -c | sort -rn | head -10

# Find OOM Kill events
dmesg -T | grep -i "killed process"
journalctl -k | grep -i "killed process"

# All sudo commands in the last 24 hours
journalctl _COMM=sudo --since "24 hours ago"

# Errors since current boot
journalctl -b -p err

# Logs for a service since its last start
journalctl -u nginx --since "$(systemctl show nginx -p ActiveEnterTimestamp \
  | cut -d= -f2)"

# Event count by priority level today
for level in emerg alert crit err warning notice info; do
  count=$(journalctl --since today -p $level -q | wc -l)
  echo "$level: $count"
done

# Find large log files
find /var/log -name "*.log" -size +100M -exec ls -lh {} \;

# Follow multiple services
journalctl -f -u nginx -u php-fpm -u redis

# Export logs for a period to a file
journalctl --since "2026-05-01" --until "2026-05-07" \
  -u nginx -o json > nginx-may.json

# Request count by HTTP status code
awk '{print $9}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn

# Find what's taking up space in /var/log
du -sh /var/log/* 2>/dev/null | sort -rh | head -15
```

---

## Diagnosing Common Situations

### SSH Attacks and Brute Force

```bash
# View failed login attempts
grep "Failed password" /var/log/auth.log | tail -20
journalctl _COMM=sshd | grep "Failed" | tail -20

# Attacking IPs with attempt counts
grep "Failed password" /var/log/auth.log \
  | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head

# Usernames being tried
grep "Invalid user" /var/log/auth.log \
  | awk '{print $8}' | sort | uniq -c | sort -rn | head

# Successful logins
grep "Accepted password\|Accepted publickey" /var/log/auth.log | tail -20
```

### Service Problems

```bash
# Service crashed - why?
journalctl -u myservice -n 50         # last 50 lines
journalctl -u myservice -p err        # errors only
journalctl -u myservice -b -1         # during previous boot

# Status and recent logs
systemctl status myservice

# How many times it restarted
journalctl -u myservice | grep "Started\|stopped\|failed" | wc -l
```

### OOM Killer (Out of Memory)

```bash
# Find OOM events
dmesg -T | grep -i "out of memory\|oom\|killed process"
journalctl -k | grep -i "killed process"

# Which processes OOM killed
grep -i "killed process" /var/log/syslog | tail -20

# Current memory usage
free -h
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|SwapFree"
```

### Disk Errors

```bash
# I/O errors
dmesg -T | grep -iE "error|fail|I/O error|ata|scsi|nvme" | tail -30

# SMART disk status
smartctl -a /dev/sda | grep -iE "error|fail|reallocated|pending"

# Filesystem errors
dmesg | grep -i "ext4\|xfs\|btrfs" | grep -i "error\|corrupt"
```

---

## auditd - Extended Security Audit

`auditd` is the Linux kernel audit subsystem. It logs syscalls, file access, and config changes.

```bash
# Install
apt install auditd audispd-plugins

# Key files
/etc/audit/auditd.conf          # daemon configuration
/etc/audit/rules.d/audit.rules  # audit rules
/var/log/audit/audit.log        # audit log

# View logs
ausearch -m USER_LOGIN          # user logins
ausearch -m USER_CMD            # executed commands
ausearch -m SYSCALL -sc open    # open() syscall
ausearch -ui 1000               # events for UID 1000
ausearch --start today          # events from today
ausearch -f /etc/passwd         # access to /etc/passwd

# Add rule: watch /etc/shadow
auditctl -w /etc/shadow -p rwa -k shadow-access

# Watch command execution by a user
auditctl -a always,exit -F arch=b64 -F uid=1000 -S execve -k user-cmds

# View current rules
auditctl -l

# Reports
aureport                        # overall summary
aureport --login                # login report
aureport --failed               # failed events
aureport --auth                 # authentication events
```

---

## References

- `man journalctl` - full journalctl documentation
- `man rsyslog.conf` - rsyslog configuration
- `man logrotate` - log rotation
- `man auditd` - security auditing
- `man last` - login history
- `man dmesg` - kernel messages
- [journald documentation](https://www.freedesktop.org/software/systemd/man/systemd-journald.service.html)
- [rsyslog documentation](https://www.rsyslog.com/doc/)
