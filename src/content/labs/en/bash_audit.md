---
title: "Bash scripting - system audit automation"
description: "In this work we'll create a Bash script for security audit: collecting users, services, open ports, and suspicious files with colored output and report saving"
image: "/images/bash_audit_sec/main.jpg"
date: "2026-04-02"
---

## Introduction

We'll create a Bash script for security audit: collecting users, services, open ports, and suspicious files with colored output and report saving. There's a --help argument. Each check is added and tested separately.

---

## Theoretical Foundation

### Why bash for auditing

Bash is available in any Linux system without installing dependencies. The script runs immediately after gaining access to the machine - that's exactly why bash remains the standard for quick audit tools even with Python or other languages available.

### Key Script Mechanisms

**ANSI escape codes** - control sequences for colored output in the terminal. Format: `\033[COLOR_CODEm`. Color reset is mandatory after each colored output - otherwise all subsequent text will remain colored.

| Code | Color | Application in Script |
| --- | --- | --- |
| `\033[0;31m` | Red | Warnings, suspicious files |
| `\033[0;32m` | Green | Regular information |
| `\033[0;33m` | Yellow | Notes and counters |
| `\033[0;36m` | Cyan | Section headers |
| `\033[0m` | Reset | After each colored block |

**`exec > >(tee -a "$REPORT") 2>&1`** - redirects all script output simultaneously to terminal and to file. More elegant than appending `>> $REPORT` to each command.

**`$(date +%Y%m%d_%H%M%S)`** - command substitution in filename. Each script run creates a unique report with timestamp.

---

## Phase 1. File Creation and Basic Structure

### Step 1. Creation and Permissions

```bash
touch audit.sh
chmod +x audit.sh
nano audit.sh
```

![01_create_file](screens/01_create_file.png)

The `+x` flag makes the file executable - without it bash will refuse to run the script directly through `./audit.sh`.

### Step 2. Script Header - Colors, Functions, Report

We insert the first part of the script: shebang, color variables, helper functions, and report file setup.

```bash
#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

section() {
    echo ""
    echo -e "${CYAN}${BOLD}══════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}══════════════════════════════════════${NC}"
}
warn() { echo -e "${RED}[!] $1${NC}"; }
info() { echo -e "${GREEN}[+] $1${NC}"; }
note() { echo -e "${YELLOW}[-] $1${NC}"; }

REPORT="report_$(date +%Y%m%d_%H%M%S).txt"
START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
exec > >(tee -a "$REPORT") 2>&1
```

![02_creating](screens/02_creating.png)

We check permissions on the created file:

```bash
ls -la audit.sh
```

![03_ls](screens/03_ls.png)

The file has permissions `-rwxrwxr-x` - executable for all. Size 717 bytes after the first part of the script.

---

## Phase 2. --help Argument

### Step 3. Argument Processing

We add the `--help` block right after the header. When this argument is passed, the script outputs help and exits - without performing the audit.

```bash
if [[ "$1" == "--help" ]]; then
    echo "Usage: ./audit.sh [--help]"
    echo ""
    echo "Sections:"
    echo "  System info   - hostname, IP, uptime, kernel"
    echo "  Users         - logged in + users with shell"
    echo "  SUID/SGID     - files with special bits"
    echo "  Services      - running systemd services"
    echo "  Network       - listening ports"
    echo "  Files         - modified last 24h, world-writable"
    exit 0
fi
```

![04_system](screens/04_system.png)

We check:

```bash
./audit.sh --help
```

![05_help](screens/05_help.png)

Help is displayed correctly and the script exits with code 0.

---

## Phase 3. SYSTEM INFO Section

### Step 4. Collecting System Information

```bash
section "SYSTEM INFO"

info "Hostname : $(hostname)"
info "Kernel   : $(uname -r)"
info "OS       : $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
info "Uptime   : $(uptime -p)"

echo ""
note "IP Addresses:"
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | while read ip; do
    info "  $ip"
done
```

![06_system_info](screens/06_system_info.png)

We run:

```bash
sudo ./audit.sh
```

![07_running_systeminfo](screens/07_running_systeminfo.png)

The script outputs hostname `ubuntu`, kernel `6.17.0-14-generic`, OS `Ubuntu 25.10`, uptime `up 9 minutes`, and two IP addresses: loopback `127.0.0.1` and network `10.10.70.130`.

---

## Phase 4. USERS Section

### Step 5. Current Users and Users with Shell

```bash
section "LOGGED IN USERS"

WHO_OUT=$(who)
if [[ -z "$WHO_OUT" ]]; then
    note "No users currently logged in"
else
    echo "$WHO_OUT"
fi

echo ""
note "Last 5 logins:"
last -n 5

section "USERS WITH LOGIN SHELL"

note "Users with real shell:"
echo ""
grep -v nologin /etc/passwd | grep -v '/bin/false' | \
while IFS=: read user pass uid gid desc home shell; do
    if [[ "$uid" -eq 0 ]]; then
        warn "ROOT account: $user  shell=$shell"
    else
        info "$user  uid=$uid  shell=$shell  home=$home"
    fi
done
```

![08_users](screens/08_users.png)

![09_logged_in](screens/09_logged_in.png)

The output shows: no one is currently logged into the system. In the list of users with shell - root (highlighted in red as a warning), system `sync`, and `ubuntu`.

> The `last` command turned out to be unavailable on this system - the package is not installed. This is normal for minimal images, the script continues working.

---

## Phase 5. RUNNING SERVICES Section

### Step 6. Running systemd Services

```bash
section "RUNNING SERVICES"

systemctl list-units --type=service --state=running --no-pager \
    | grep ".service" | while read line; do
    SVC=$(echo "$line" | awk '{print $1}')
    info "$SVC"
done

echo ""
TOTAL=$(systemctl list-units --type=service --state=running \
    --no-pager | grep -c '.service')
note "Total running services: $TOTAL"
```

![10_running_services](screens/10_running_services.png)

![11_result](screens/11_result.png)

The system started **29 services**. Among them: `cron.service`, `NetworkManager.service`, `snapd.service`, `gdm.service`, `dbus.service`. Nothing suspicious - standard Ubuntu set with desktop.

---

## Phase 6. LISTENING NETWORK PORTS Section

### Step 7. Listening Network Ports

Ports below 1024 are privileged, root is required to open them. We highlight them in red.

```bash
section "LISTENING NETWORK PORTS"

ss -tlnp 2>/dev/null | grep LISTEN | while read line; do
    ADDR=$(echo "$line" | awk '{print $4}')
    PORT=$(echo "$ADDR" | rev | cut -d: -f1 | rev)
    PROC=$(echo "$line" | grep -oP '(?<=users:\(\(")[^"]*' 2>/dev/null)

    if [[ "$PORT" -lt 1024 ]] 2>/dev/null; then
        warn "Port $PORT  ($ADDR)  process: $PROC"
    else
        info "Port $PORT  ($ADDR)  process: $PROC"
    fi
done
```

![12_listening_ports](screens/12_listening_ports.png)

![13_result](screens/13_result.png)

There are no ports open to the outside - all listen on `127.0.0.1` or `127.0.0.53`. Port 53 — DNS through `systemd-resolved`, port 631 — CUPS (printing). The system is closed from external connections.

---

## Phase 7. FILES Section

### Step 8. Modified Files and World-writable

```bash
section "FILES MODIFIED IN LAST 24H"

warn "Scanning (excluding /proc /sys /dev /run)..."
echo ""

find / -mtime -1 -type f \
    ! -path "/proc/*" ! -path "/sys/*" \
    ! -path "/dev/*"  ! -path "/run/*" \
    2>/dev/null | sort | head -50 | while read f; do
    MTIME=$(stat -c "%y" "$f" 2>/dev/null | cut -d. -f1)
    echo "  $MTIME  $f"
done

TOTAL_MOD=$(find / -mtime -1 -type f \
    ! -path "/proc/*" ! -path "/sys/*" \
    ! -path "/dev/*"  ! -path "/run/*" \
    2>/dev/null | wc -l)
note "Total modified: $TOTAL_MOD files (showing first 50)"

section "WORLD-WRITABLE FILES"

warn "Scanning for world-writable files..."
echo ""

find / -perm -o+w -type f \
    ! -path "/tmp/*"  ! -path "/dev/*" \
    ! -path "/proc/*" ! -path "/sys/*" \
    2>/dev/null | while read f; do
    warn "world-writable: $f"
done
```

![14_files](screens/14_files.png)

![15_result](screens/15_result.png)

In the last 24 hours **88 files** were modified - this is normal for a freshly started system. Among them: `/var/lib/snapd/state.json`, `/var/lib/systemd/random-seed`, `/var/lib/plymouth/boot-duration`. Everything is system-related, nothing suspicious.

---

## Phase 8. Completion and Full Script Run

### Step 9. Report Footer

```bash
section "AUDIT COMPLETE"

END_TIME=$(date '+%Y-%m-%d %H:%M:%S')
info "Started  : $START_TIME"
info "Finished : $END_TIME"
info "Saved to : $REPORT"
```

![16_final](screens/16_final.png)

### Step 10. Full Run

```bash
sudo ./audit.sh
```

![17_saved](screens/17_saved.png)

The full audit took **5 seconds** (from 21:44:59 to 21:45:04). The report was saved to file.

### Step 11. Viewing Report

```bash
ls -la report_*.txt
cat report_20260402_214459.txt | head -40
```

![18_result](screens/18_result.png)

The report file weighs **8735 bytes**, belongs to root (we ran through sudo). The contents are identical to the terminal output - exactly this is ensured by the construction `exec > >(tee -a "$REPORT") 2>&1`.

---

## Summary and Conclusions

### What the Script Collects

| Section | Commands | What We're Looking For |
| --- | --- | --- |
| System info | `hostname`, `uname -r`, `ip addr` | Basic system profile |
| Logged in users | `who`, `last` | Active sessions |
| Users with shell | `grep -v nologin /etc/passwd` | Accounts with login capability |
| Running services | `systemctl list-units` | Running processes |
| Listening ports | `ss -tlnp` | Open network sockets |
| Modified files | `find -mtime -1` | Changes in last 24h |
| World-writable | `find -perm -o+w` | Files accessible to all for writing |

### What to Add for Production Script

**Checking cron jobs** - vector for persistence and privilege escalation:

```bash
section "CRON JOBS"
for user in $(cut -d: -f1 /etc/passwd); do
    crontab -u "$user" -l 2>/dev/null | grep -v "^#" | grep -v "^$" | while read job; do
        warn "[$user] $job"
    done
done
cat /etc/crontab 2>/dev/null
ls /etc/cron.d/ 2>/dev/null
```

**Checking sudoers** - who can execute commands as root:

```bash
section "SUDO PERMISSIONS"
cat /etc/sudoers 2>/dev/null | grep -v "^#" | grep -v "^$"
ls /etc/sudoers.d/ 2>/dev/null
```

**SSH authorized_keys** - foreign keys in home directories:

```bash
section "SSH AUTHORIZED KEYS"
find /home /root -name "authorized_keys" 2>/dev/null | while read f; do
    warn "Found: $f"
    cat "$f"
done
```

During this work, a bash script for automatic system auditing was written. The script saves a report with a timestamp in the name - this allows comparing system state between runs and tracking changes.
