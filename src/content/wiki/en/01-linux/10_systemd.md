---
title: "Systemd and Service Units"
date: "2026-04-13"
---

Systemd is the init system and service manager for Linux, replacing SysV init and Upstart. It runs as PID 1 and manages the entire system lifecycle from boot to shutdown.

---

## Why Systemd

```
SysV init (old way):               systemd (modern):
─────────────────────────────────  ─────────────────────────────────
Sequential service startup         Parallel service startup
Shell scripts (/etc/init.d/)       Declarative unit files
No dependency tracking             Explicit dependencies (After=, Requires=)
No automatic restart               Built-in Restart=on-failure
Logs in /var/log/syslog            Centralized journald
No service isolation               Cgroups, namespaces, seccomp
```

---

## systemd Architecture

```
PID 1: systemd
├── systemd-journald    — log collection
├── systemd-logind      — user sessions
├── systemd-networkd    — network management
├── systemd-resolved    — DNS resolver
├── systemd-udevd       — device management
├── systemd-timesyncd   — time synchronization
└── all other services (nginx, sshd, postgresql, ...)

Configuration:
/lib/systemd/system/       — package manager units (don't edit!)
/etc/systemd/system/       — custom and overridden units
/run/systemd/system/       — runtime units (temporary)
~/.config/systemd/user/    — user-level units
```

---

## Unit Types

| Type | Extension | Description |
|------|-----------|-------------|
| Service | `.service` | Start and manage a process/daemon |
| Timer | `.timer` | Cron replacement, schedule-based activation |
| Socket | `.socket` | Socket activation — start service on first connection |
| Target | `.target` | Group units together (replaces runlevels) |
| Mount | `.mount` | Mount filesystems |
| Automount | `.automount` | Auto-mount on access |
| Path | `.path` | Monitor files/directories |
| Slice | `.slice` | cgroup hierarchy for resource management |
| Scope | `.scope` | Manage externally-started processes |
| Device | `.device` | udev devices |
| Swap | `.swap` | Swap space |

---

## systemctl - Service Management

### Core commands

```bash
# Start, stop, restart
systemctl start nginx
systemctl stop nginx
systemctl restart nginx
systemctl reload nginx          # reload config without stopping (SIGHUP)
systemctl try-restart nginx     # restart only if already running
systemctl reload-or-restart nginx  # reload if supported, otherwise restart

# Status and info
systemctl status nginx
systemctl is-active nginx       # active / inactive / failed
systemctl is-enabled nginx      # enabled / disabled
systemctl is-failed nginx

# Autostart
systemctl enable nginx          # create symlink in target
systemctl disable nginx         # remove symlink
systemctl enable --now nginx    # enable + start immediately
systemctl disable --now nginx   # disable + stop immediately

# Masking (prevent any startup)
systemctl mask nginx            # symlink to /dev/null
systemctl unmask nginx

# Reload unit files after changes
systemctl daemon-reload
```

### Viewing units

```bash
# List all units
systemctl list-units
systemctl list-units --type=service
systemctl list-units --type=service --state=running
systemctl list-units --state=failed

# List all installed units (including inactive)
systemctl list-unit-files
systemctl list-unit-files --type=service
systemctl list-unit-files --state=enabled

# Unit dependencies
systemctl list-dependencies nginx
systemctl list-dependencies --reverse nginx   # who depends on nginx

# Show unit file contents
systemctl cat nginx
```

### System management

```bash
# Shutdown and reboot
systemctl poweroff
systemctl reboot
systemctl suspend
systemctl hibernate

# Targets (like runlevels)
systemctl get-default                    # current default target
systemctl set-default multi-user.target  # set default
systemctl isolate rescue.target          # switch to rescue mode

# Emergency modes
systemctl rescue
systemctl emergency
```

---

## Anatomy of a .service Unit File

```ini
[Unit]
Description=My Application
Documentation=https://example.com/docs
After=network.target postgresql.service
Requires=postgresql.service
Wants=redis.service
BindsTo=postgresql.service
Conflicts=other.service

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStartPre=/opt/myapp/scripts/check-config.sh
ExecStart=/opt/myapp/bin/myapp --config /etc/myapp/config.yaml
ExecStartPost=/opt/myapp/scripts/notify-started.sh
ExecStop=/bin/kill -TERM $MAINPID
ExecStopPost=/opt/myapp/scripts/cleanup.sh
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

---

## [Unit] Section

### Description directives

```ini
Description=Nginx HTTP Server          # human-readable description
Documentation=man:nginx(8)             # documentation references
Documentation=https://nginx.org/docs
```

### Dependency directives

```ini
# After — unit starts AFTER the listed units
After=network.target
After=network-online.target nss-lookup.target

# Before — unit starts BEFORE the listed units
Before=httpd.service

# Requires — hard dependency (if dependency fails, this one fails too)
Requires=postgresql.service

# Wants — soft dependency (tries to start, but won't fail if it can't)
Wants=redis.service

# BindsTo — if dependency stops or fails, this unit stops too
BindsTo=some-device.device

# Conflicts — cannot run simultaneously
Conflicts=apache2.service

# Requisite — if dependency is not already running, this won't start either
Requisite=network.target
```

### After vs Requires vs Wants

```
Requires=B  →  "Start B before me. If B fails, stop me."
After=B     →  "Start me only AFTER B has started."
Wants=B     →  "Try to start B, but I don't care if it works."

Typical combination:
After=postgresql.service
Requires=postgresql.service
→  "Start postgres before me, and if postgres fails — I fail too."

After without Requires:
After=postgresql.service
→  "Wait for postgres, but I'll start even if postgres isn't running."
```

---

## [Service] Section

### Service type (Type=)

```ini
Type=simple     # Default. ExecStart IS the main process.
                # systemd considers the service started immediately.

Type=exec       # Like simple, but waits for fork() to complete. More precise.

Type=forking    # Process calls fork() and parent exits.
                # Classic daemons (nginx, apache).
                # PIDFile= is needed for tracking.

Type=oneshot    # Process exits after completing work.
                # For one-time tasks (migrations, setup).
                # RemainAfterExit=yes — consider "active" after exit.

Type=notify     # Like simple, but process notifies systemd via
                # sd_notify() when ready. systemd waits for the notification.

Type=dbus       # Service registers a D-Bus name.

Type=idle       # Like simple, but startup is delayed until other
                # tasks complete (for non-urgent services).
```

```ini
# forking service example (nginx)
[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t        # test config
ExecStart=/usr/sbin/nginx
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s QUIT $MAINPID

# oneshot example (DB migration)
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/myapp/manage.py migrate
User=myapp
```

### Exec directives

```ini
ExecStartPre=/path/to/script   # before start (multiple allowed)
ExecStart=/path/to/binary      # main command (required!)
ExecStartPost=/path/to/script  # after successful start

ExecStop=/bin/kill -TERM $MAINPID     # on stop
ExecStopPost=/path/to/cleanup         # always after stop

ExecReload=/bin/kill -HUP $MAINPID    # on reload

# Prefixes:
ExecStartPre=-/path/to/script  # - ignore failure (non-zero exit is ok)
ExecStart=!/path/to/privileged # ! elevate via PolicyKit
```

### Restart policy

```ini
Restart=no               # don't restart (default)
Restart=on-success       # only on clean exit (code 0)
Restart=on-failure       # on error (non-zero code, signal, timeout)
Restart=on-abnormal      # on signal, timeout, watchdog failure
Restart=on-watchdog      # only on watchdog timeout
Restart=on-abort         # only on uncaught signal
Restart=always           # always, except on systemctl stop

RestartSec=5s            # delay before restart
RestartSec=5             # seconds (5s, 5min, 500ms)

StartLimitBurst=5        # max 5 restarts
StartLimitIntervalSec=10s # within 10 seconds (restart loop protection)
```

### Environment and user

```ini
User=nginx              # run as this user
Group=nginx             # group
WorkingDirectory=/var/www  # working directory

# Environment variables
Environment="NODE_ENV=production" "PORT=3000"
EnvironmentFile=/etc/myapp/env        # file with variables
EnvironmentFile=-/etc/myapp/env.local # (-) ignore if file is missing

# Standard streams
StandardOutput=journal   # stdout → journald (default)
StandardError=journal    # stderr → journald
StandardOutput=append:/var/log/myapp.log  # to file
StandardOutput=null      # /dev/null
```

### Timeouts

```ini
TimeoutStartSec=30       # max wait for startup (0 = infinite)
TimeoutStopSec=30        # max wait for stop
TimeoutSec=30            # both at once

TimeoutStartSec=infinity # never abort startup
```

---

## [Install] Section

Defines which target should activate this unit when `systemctl enable` is run.

```ini
[Install]
WantedBy=multi-user.target    # typical for server services
WantedBy=graphical.target     # for desktop applications
RequiredBy=some.target        # hard dependency in target
Alias=myapp.service           # alternative name
Also=myapp-watcher.service    # enable alongside this unit
```

### Standard targets

```
poweroff.target    →   runlevel 0 (shutdown)
rescue.target      →   runlevel 1 (single user)
multi-user.target  →   runlevel 2,3,4 (multi-user, no GUI)
graphical.target   →   runlevel 5 (with GUI)
reboot.target      →   runlevel 6 (reboot)

Special:
network.target          — network is configured (but not necessarily online)
network-online.target   — network is definitely online
sysinit.target          — early system initialization
basic.target            — basic initialization complete
```

---

## Overriding Units (Drop-in Files)

Never edit system units directly — they'll be overwritten on updates.

```bash
# Create a drop-in file
systemctl edit nginx

# This creates /etc/systemd/system/nginx.service.d/override.conf
# The editor opens automatically

# Example override.conf:
[Service]
Environment="NGINX_OPTS=-g 'daemon off;'"
Restart=always
RestartSec=3s
LimitNOFILE=65536

# View the final merged unit
systemctl cat nginx

# Remove override
systemctl revert nginx
```

```bash
# Manually create a drop-in
mkdir -p /etc/systemd/system/nginx.service.d/
cat > /etc/systemd/system/nginx.service.d/override.conf << 'EOF'
[Service]
Restart=always
RestartSec=5
Environment="EXTRA_OPTS=--debug"
EOF

systemctl daemon-reload
systemctl restart nginx
```

---

## Timer Units

Timers are the systemd replacement for cron.

### Example: nightly backup

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Backup Service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
User=backup
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily Backup Timer
Requires=backup.service

[Timer]
OnCalendar=*-*-* 02:30:00    # every day at 02:30
AccuracySec=1min              # accuracy (default 1 minute)
Persistent=true               # run if missed (after reboot)
RandomizedDelaySec=15min      # random delay up to 15 minutes

[Install]
WantedBy=timers.target
```

```bash
# Manage timers
systemctl enable --now backup.timer
systemctl list-timers                  # all timers
systemctl list-timers --all

# Test a calendar expression
systemd-analyze calendar "*-*-* 02:30:00"
systemd-analyze calendar "Mon *-*-* 04:00:00"   # every Monday

# OnCalendar shortcuts:
# daily               = *-*-* 00:00:00
# weekly              = Mon *-*-* 00:00:00
# monthly             = *-*-01 00:00:00
# hourly              = *-*-* *:00:00
# minutely            = *-*-* *:*:00
# *-*-* 14:00,20:00   = twice a day
```

### Monotonic timers

```ini
[Timer]
OnBootSec=5min          # 5 minutes after boot
OnActiveSec=1h          # 1 hour after timer activation
OnUnitActiveSec=6h      # 6 hours after last service run
OnStartupSec=10min      # 10 minutes after systemd startup
```

---

## Socket Activation

Start a service only when the first connection arrives.

```ini
# /etc/systemd/system/myapp.socket
[Unit]
Description=MyApp Socket

[Socket]
ListenStream=8080         # TCP port
Accept=no                 # one process handles all connections

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=MyApp Service

[Service]
ExecStart=/opt/myapp/bin/myapp
# Receives socket via file descriptor 3 (LISTEN_FDS)
StandardInput=socket
```

---

## Security and Isolation

Systemd provides powerful service isolation mechanisms:

```ini
[Service]
# Filesystem
ProtectSystem=strict           # /usr, /boot, /etc read-only
ProtectSystem=full             # /usr, /boot read-only
ProtectHome=true               # /home, /root, /run/user inaccessible
PrivateTmp=true                # isolated /tmp
ReadOnlyPaths=/etc             # read-only
ReadWritePaths=/var/lib/myapp  # allow write only here
InaccessiblePaths=/proc/sys    # completely deny access
NoNewPrivileges=true           # cannot escalate privileges
TemporaryFileSystem=/var       # tmpfs instead of real directory

# Network
PrivateNetwork=true            # isolated network (loopback only)
IPAddressDeny=any              # block all network connections
IPAddressAllow=192.168.1.0/24  # allow only this network

# User and capabilities
User=myapp
Group=myapp
DynamicUser=true               # create a temporary user automatically
AmbientCapabilities=CAP_NET_BIND_SERVICE   # bind port < 1024 without root
CapabilityBoundingSet=CAP_NET_BIND_SERVICE # restrict capability set

# System calls (seccomp)
SystemCallFilter=@system-service   # standard service call set
SystemCallFilter=~@debug @mount    # deny debug and mount syscalls
SystemCallArchitectures=native     # native architecture only

# Resources
LimitNOFILE=65536              # max open files
LimitNPROC=512                 # max processes
MemoryMax=512M                 # max memory (cgroup v2)
CPUQuota=50%                   # max 50% CPU
```

```bash
# Check unit security score
systemd-analyze security nginx
# 0 = safe, 10 = very exposed
```

---

## journald - Viewing Logs

```bash
# Basic commands
journalctl                              # all logs
journalctl -u nginx                     # nginx only
journalctl -u nginx -f                  # follow (real time)
journalctl -u nginx -n 50               # last 50 lines
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since "2024-01-01" --until "2024-01-02"
journalctl -u nginx -p err              # errors only
journalctl -u nginx -p warning..err     # warning and above

# Priority levels (like syslog):
# 0=emerg, 1=alert, 2=crit, 3=err, 4=warning, 5=notice, 6=info, 7=debug

# By time
journalctl --since today
journalctl --since yesterday
journalctl -b                           # since current boot
journalctl -b -1                        # since previous boot
journalctl --list-boots                 # list all boots

# Output formats
journalctl -o json-pretty               # JSON
journalctl -o short-iso                 # with ISO timestamps
journalctl -o verbose                   # all fields
journalctl -o cat                       # messages only

# Log disk usage
journalctl --disk-usage
journalctl --vacuum-size=1G            # remove old logs down to 1GB
journalctl --vacuum-time=2weeks        # remove older than 2 weeks
```

---

## systemd-analyze - Boot Analysis

```bash
# Total boot time
systemd-analyze time
# Startup finished in 1.234s (kernel) + 3.456s (userspace) = 4.690s

# Critical path chain
systemd-analyze critical-chain

# Boot timing graph (SVG)
systemd-analyze plot > boot.svg

# Per-unit time
systemd-analyze blame

# Validate a unit file
systemd-analyze verify /etc/systemd/system/myapp.service

# Test a timer schedule
systemd-analyze calendar "Mon,Wed,Fri *-*-* 10:00:00"
```

---

## Creating a Custom Service - Complete Example

### Node.js application

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js Application
Documentation=https://github.com/myorg/myapp
After=network-online.target
Wants=network-online.target
After=postgresql.service redis.service
Requires=postgresql.service

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp

Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/etc/myapp/env

ExecStartPre=/usr/bin/node /opt/myapp/scripts/preflight.js
ExecStart=/usr/bin/node /opt/myapp/server.js
ExecReload=/bin/kill -USR2 $MAINPID

Restart=on-failure
RestartSec=5s
StartLimitBurst=3
StartLimitIntervalSec=30s

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/myapp/logs /var/lib/myapp

LimitNOFILE=65536
MemoryMax=512M
CPUQuota=80%

StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

TimeoutStartSec=60
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
# Deploy
systemctl daemon-reload
systemctl enable --now myapp
systemctl status myapp
journalctl -u myapp -f
```

### Python/Django with gunicorn

```ini
# /etc/systemd/system/gunicorn.service
[Unit]
Description=Gunicorn Django App
After=network.target postgresql.service

[Service]
Type=notify
NotifyAccess=all
User=www-data
Group=www-data
WorkingDirectory=/var/www/myproject
RuntimeDirectory=gunicorn
EnvironmentFile=/var/www/myproject/.env

ExecStart=/var/www/myproject/venv/bin/gunicorn \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind unix:/run/gunicorn/gunicorn.sock \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log \
    myproject.wsgi:application

ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## User Services

```bash
# User unit directory
~/.config/systemd/user/

# Manage without sudo
systemctl --user start myapp
systemctl --user enable myapp
systemctl --user status myapp
journalctl --user -u myapp

# Keep user services running after logout
loginctl enable-linger username
```

---

## Useful One-liners

```bash
# Find failed services
systemctl list-units --state=failed

# Reset failed state
systemctl reset-failed

# Watch all system logs in real time
journalctl -f

# Log disk usage
journalctl --disk-usage

# When was a service last started
systemctl show nginx --property=ActiveEnterTimestamp

# ExecStart command of a service
systemctl show nginx --property=ExecStart

# Environment variables of a service
systemctl show nginx -p Environment

# All unit properties
systemctl show nginx

# cgroup process tree
systemd-cgls
systemd-cgtop    # top by cgroup
```

---

## Cheat Sheet

```
Core commands:
systemctl start|stop|restart|reload <unit>
systemctl enable|disable|mask|unmask <unit>
systemctl status <unit>
systemctl daemon-reload          ← after changing unit files!

Viewing:
systemctl list-units --state=failed
systemctl list-timers
journalctl -u <unit> -f
journalctl -u <unit> -n 100

Configuration:
/lib/systemd/system/    — system units (don't touch)
/etc/systemd/system/    — custom units
systemctl edit <unit>   — safe override

Service types:
Type=simple    — regular process
Type=forking   — classic daemon with fork()
Type=oneshot   — one-time task
Type=notify    — service signals readiness

Restart policy:
Restart=on-failure   — restart on error
Restart=always       — always (except systemctl stop)

Security:
PrivateTmp=true
NoNewPrivileges=true
ProtectSystem=strict
DynamicUser=true
```

---

## References

- [systemd.service man](https://www.freedesktop.org/software/systemd/man/systemd.service.html) - .service docs
- [systemd.timer man](https://www.freedesktop.org/software/systemd/man/systemd.timer.html) - .timer docs
- [systemd.exec man](https://www.freedesktop.org/software/systemd/man/systemd.exec.html) - all [Service] directives
- [Arch Wiki systemd](https://wiki.archlinux.org/title/systemd) - best reference
