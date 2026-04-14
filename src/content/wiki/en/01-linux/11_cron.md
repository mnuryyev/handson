---
title: "Cron and Task Schedulers"
date: "2026-04-13"
---

Task schedulers let you run commands automatically on a schedule. On Linux the traditional tool is cron, on modern systems — systemd timers, and in the cloud — managed scheduling services.

---

## Cron Overview

Cron is the classic task scheduler daemon. It runs in the background, wakes up every minute, checks the schedule, and executes tasks.

```
Cron daemons:
crond       — RHEL, CentOS, Fedora
cron        — Debian, Ubuntu
fcron       — alternative with extra features
anacron     — for systems that don't run 24/7
```

---

## Crontab Syntax

```
# ┌───────── minute (0–59)
# │ ┌─────── hour (0–23)
# │ │ ┌───── day of month (1–31)
# │ │ │ ┌─── month (1–12 or jan–dec)
# │ │ │ │ ┌─ day of week (0–7, 0 and 7 = Sunday, or sun–sat)
# │ │ │ │ │
# * * * * *  command_to_run
```

### Special characters

| Character | Description | Example |
|-----------|-------------|---------|
| `*` | Any value | `* * * * *` — every minute |
| `,` | List of values | `0 9,17 * * *` — at 9:00 and 17:00 |
| `-` | Range | `0 9-17 * * *` — every hour from 9 to 17 |
| `/` | Step | `*/15 * * * *` — every 15 minutes |
| `L` | Last | `0 0 L * *` — last day of month (not universal) |
| `#` | Nth weekday | `0 0 * * 1#2` — second Monday (not universal) |

### Schedule examples

```bash
# Every minute
* * * * *

# Every 5 minutes
*/5 * * * *

# Every 15 minutes
*/15 * * * *

# Every hour (at minute 0)
0 * * * *

# Every 2 hours
0 */2 * * *

# Every day at 2:30 AM
30 2 * * *

# Weekdays at 9:00 AM
0 9 * * 1-5

# Weekends at 10:00 AM
0 10 * * 6,7

# Every Monday at 8:00 AM
0 8 * * 1

# Every 6 hours
0 */6 * * *

# 1st of every month at midnight
0 0 1 * *

# January 1st at midnight
0 0 1 1 *

# Every 10 minutes 9AM–6PM on weekdays
*/10 9-18 * * 1-5

# Twice a day — 8:00 AM and 8:00 PM
0 8,20 * * *

# Every 30 minutes from 6AM to 11PM
*/30 6-23 * * *
```

### Special strings (macros)

```bash
@reboot     # on every reboot
@yearly     # once a year   = 0 0 1 1 *
@annually   # same as @yearly
@monthly    # once a month  = 0 0 1 * *
@weekly     # once a week   = 0 0 * * 0
@daily      # once a day    = 0 0 * * *
@midnight   # same as @daily
@hourly     # every hour    = 0 * * * *
```

---

## Managing crontab

### User crontab

```bash
# Edit current user's crontab
crontab -e

# View current user's crontab
crontab -l

# Remove current user's crontab
crontab -r

# Manage another user's crontab (as root)
crontab -u alice -e
crontab -u alice -l
crontab -u alice -r

# Import from a file
crontab /path/to/cronfile

# Export to a file
crontab -l > ~/my_crontab_backup.txt
```

### System crontab (/etc/crontab)

```bash
# /etc/crontab — system crontab (with a user field)
# min hour dom month dow  user    command
  17 *  *  *  *   root    cd / && run-parts --report /etc/cron.hourly
  25 6  *  *  *   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.daily)
  47 6  *  *  7   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.weekly)
  52 6  1  *  *   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.monthly)
```

### Script directories

```bash
/etc/cron.d/          # individual schedule files (like /etc/crontab format)
/etc/cron.hourly/     # scripts run every hour
/etc/cron.daily/      # daily scripts
/etc/cron.weekly/     # weekly scripts
/etc/cron.monthly/    # monthly scripts

# A script in /etc/cron.daily/ is just an executable file (no extension)
cat > /etc/cron.daily/cleanup-temp << 'EOF'
#!/bin/bash
find /tmp -type f -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/cleanup-temp
```

### /etc/cron.d/ - individual files

```bash
# Same format as /etc/crontab — user field is required
cat > /etc/cron.d/myapp << 'EOF'
# Nightly backup at 3:00 AM
0 3 * * * myapp /opt/myapp/scripts/backup.sh

# Hourly session cleanup
0 * * * * www-data /opt/myapp/scripts/cleanup-sessions.php
EOF
```

---

## Output and Logging

```bash
# By default cron emails stdout/stderr to the task owner
# Disable email notifications:
MAILTO=""

# Redirect output to a file
0 2 * * * /path/to/script.sh >> /var/log/myscript.log 2>&1

# Redirect only errors
0 2 * * * /path/to/script.sh 2>> /var/log/errors.log

# Discard all output
0 2 * * * /path/to/script.sh &>/dev/null

# With timestamp
0 2 * * * echo "$(date): start" >> /var/log/myscript.log && /path/to/script.sh >> /var/log/myscript.log 2>&1

# Log via logger (to syslog)
0 2 * * * /path/to/script.sh 2>&1 | logger -t myscript
```

```bash
# View cron logs
grep CRON /var/log/syslog          # Debian/Ubuntu
grep CRON /var/log/cron            # RHEL/CentOS
journalctl -u cron                 # systemd
journalctl _CRON_ACTION=start      # only starts
```

---

## Environment Variables in crontab

```bash
# Define variables at the top of crontab
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
MAILTO=""
HOME=/root

# Important: cron's environment is minimal!
# Missing: .bashrc, .bash_profile, .profile
# PATH is usually very short

# Solution: set a full PATH or use absolute paths
0 2 * * * PATH=/usr/local/bin:/usr/bin:/bin; /opt/myapp/backup.sh
0 2 * * * /usr/local/bin/python3 /opt/myapp/script.py

# Source variables from a file
0 2 * * * . /etc/myapp/env && /opt/myapp/script.sh
0 2 * * * env $(cat /etc/myapp/env | xargs) /opt/myapp/script.sh
```

---

## Practical Scenarios

### Backups

```bash
# Daily database backup at 2:00 AM
0 2 * * * /usr/bin/pg_dump mydb | gzip > /backup/mydb-$(date +\%Y\%m\%d).sql.gz

# Weekly full file backup
0 3 * * 0 tar -czf /backup/files-$(date +\%Y\%m\%d).tar.gz /var/www

# Backup with rotation — keep only 7 days
0 2 * * * /usr/bin/pg_dump mydb | gzip > /backup/mydb-$(date +\%A).sql.gz
# (Mon, Tue, Wed... — each day overwrites the file from a week ago)
```

### Maintenance

```bash
# Delete temp files older than 7 days
0 4 * * * find /tmp -type f -mtime +7 -delete 2>/dev/null

# Rotate logs (if logrotate isn't configured)
0 0 * * 0 gzip /var/log/myapp.log && mv /var/log/myapp.log.gz /var/log/archive/ && touch /var/log/myapp.log

# Clean up Docker garbage
0 3 * * 0 /usr/bin/docker system prune -f >> /var/log/docker-cleanup.log 2>&1

# Renew Let's Encrypt certificates
0 3 */2 * * /usr/bin/certbot renew --quiet >> /var/log/certbot.log 2>&1
```

### Monitoring and alerts

```bash
# Check service health every 5 minutes
*/5 * * * * curl -sf http://localhost:8080/health || echo "SERVICE DOWN $(date)" | mail -s "Alert" admin@example.com

# Check disk space every hour
0 * * * * [ $(df / | awk 'NR==2 {print $5}' | tr -d '%') -gt 90 ] && echo "Disk almost full!" | mail -s "Disk Alert" admin@example.com

# Memory monitoring
*/10 * * * * free -m | awk 'NR==2 {printf "RAM: %.1f%% used\n", $3/$2*100}' >> /var/log/mem.log
```

### Data sync and processing

```bash
# S3 sync every 15 minutes
*/15 * * * * /usr/local/bin/aws s3 sync /var/data/ s3://mybucket/data/ >> /var/log/s3sync.log 2>&1

# Process new files every minute
* * * * * find /incoming -name "*.csv" -newer /tmp/last_processed -exec /opt/process.sh {} \; && touch /tmp/last_processed

# Send daily reports at 8:00 AM on weekdays
0 8 * * 1-5 /opt/reports/generate.sh | mail -s "Daily Report" team@example.com
```

---

## Cron Best Practices

```bash
# 1. Always use absolute paths
0 2 * * * /usr/bin/python3 /opt/myapp/script.py 
0 2 * * * python3 script.py                       # PATH may not contain python3

# 2. Always redirect output
0 2 * * * /path/script.sh >> /var/log/script.log 2>&1  
0 2 * * * /path/script.sh                              # output lost or emailed

# 3. Use locking for long-running jobs
0 * * * * flock -n /tmp/myscript.lock /path/script.sh   # don't run if already running

# 4. Test scripts manually with the same environment
env -i HOME=/root SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin /path/script.sh

# 5. Set a timeout for long-running tasks
0 2 * * * timeout 3600 /path/backup.sh  # kill after 1 hour

# 6. Add timestamps to logs
0 2 * * * { echo "=== $(date) ==="; /path/script.sh; } >> /var/log/script.log 2>&1

# 7. Use MAILTO="" for silent tasks
MAILTO=""
*/5 * * * * /path/health-check.sh
```

---

## anacron - for Non-24/7 Systems

anacron runs missed tasks after a reboot. It doesn't guarantee exact timing, but guarantees the task will eventually run.

```
/etc/anacrontab:
# period(days)  delay(min)  identifier    command
1              5            cron.daily    run-parts /etc/cron.daily
7              10           cron.weekly   run-parts /etc/cron.weekly
@monthly       15           cron.monthly  run-parts /etc/cron.monthly
```

```bash
# Run anacron manually
anacron -n          # immediately (no delay)
anacron -f          # force (even if already ran today)
anacron -d          # debug mode

# anacron stores timestamps in:
ls /var/spool/anacron/
# cron.daily  cron.monthly  cron.weekly
```

---

## at - One-Time Execution

`at` runs a command once at a specified time.

```bash
# Time syntax
at now + 5 minutes
at now + 2 hours
at 15:00
at 15:00 tomorrow
at 15:00 Jul 4
at midnight
at noon
at teatime     # 16:00
at midnight + 1 day

# Enter commands interactively
at 15:00 tomorrow
at> /path/to/script.sh
at> Ctrl+D      (end input)

# Pass via pipe
echo "/path/to/script.sh" | at 15:00 tomorrow
echo "reboot" | at now + 10 minutes

# Batch - run when load is low (load average < 0.8)
batch << 'EOF'
/path/to/heavy-task.sh
EOF

# Manage the at queue
atq                    # show queue
at -l                  # same as atq
atrm 3                 # remove job #3
at -c 3                # show contents of job #3
```

---

## systemd timers - Modern Alternative

Covered in detail in [Systemd and Service Units]. Here's a brief comparison.

### Why systemd timers are better in most cases

```
Advantages of systemd timers:
Logs in journald — journalctl -u myapp.timer
Dependencies — After=network-online.target
Execution tracking — systemctl list-timers
No missed jobs — Persistent=true
Random delay — RandomizedDelaySec=
Isolation — User=, PrivateTmp=, MemoryMax=
Monitoring — status via systemctl

When cron is still better:
✓ Simple one-off tasks
✓ No access to systemd (containers, legacy systems)
✓ User tasks without sudo
✓ Cross-distro compatibility
```

### systemd timer quick example

```bash
# /etc/systemd/system/backup.service
[Unit]
Description=Database Backup

[Service]
Type=oneshot
ExecStart=/opt/backup.sh
User=backup
```

```bash
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily Database Backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now backup.timer
systemctl list-timers
journalctl -u backup.service
```

---

## Cron in Containers and Cloud

### Docker + cron

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y cron

COPY crontab /etc/cron.d/myapp-cron
RUN chmod 0644 /etc/cron.d/myapp-cron

RUN touch /var/log/cron.log

CMD ["cron", "-f"]
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
spec:
  schedule: "0 2 * * *"         # same syntax as cron!
  timeZone: "UTC"
  concurrencyPolicy: Forbid     # don't start if previous is still running
  failedJobsHistoryLimit: 3
  successfulJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: myapp:latest
            command: ["/backup.sh"]
            env:
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: host
```

---

## Monitoring and Debugging

```bash
# Watch cron execution in real time
tail -f /var/log/syslog | grep CRON         # Debian/Ubuntu
journalctl -f _COMM=cron                    # systemd

# Test cron schedule expressions
# https://crontab.guru — interactive editor

# Test schedule in Python
python3 -c "
import datetime
from croniter import croniter
c = croniter('*/15 9-18 * * 1-5', datetime.datetime.now())
for i in range(5):
    print(c.get_next(datetime.datetime))
"
# pip install croniter

# List all crontabs on the system
for user in $(cut -f1 -d: /etc/passwd); do
    tasks=$(crontab -u "$user" -l 2>/dev/null | grep -v "^#" | grep -v "^$")
    [ -n "$tasks" ] && echo "=== $user ===" && echo "$tasks"
done

# Find all cron files on the system
find /etc/cron* -type f 2>/dev/null
find /var/spool/cron -type f 2>/dev/null
```

---

## Common Issues

```bash
# 1. Script works manually but not from cron
# Cause: different environment (PATH, HOME, etc.)
# Fix: log the environment
* * * * * env > /tmp/cron-env.txt

# 2. Percent sign % must be escaped
0 2 * * * date +\%Y-\%m-\%d  # % must be written as \%

# 3. Timezones
# cron uses the system timezone
date                                    # check current TZ
timedatectl | grep "Time zone"
# Or set in crontab:
CRON_TZ=America/New_York
0 9 * * * /path/script.sh

# 4. Cron daemon not running
systemctl status cron                   # Debian/Ubuntu
systemctl status crond                  # RHEL/CentOS

# 5. File permissions in /etc/cron.d/
chown root:root /etc/cron.d/myapp
chmod 644 /etc/cron.d/myapp

# 6. User access control
cat /etc/cron.allow   # if exists — only these users can use cron
cat /etc/cron.deny    # these users cannot use cron
```

---

## Cheat Sheet

```
Format: min hour dom month dow command

Examples:
* * * * *           — every minute
*/5 * * * *         — every 5 minutes
0 * * * *           — every hour
0 0 * * *           — every day at midnight
0 0 * * 0           — every Sunday
0 0 1 * *           — 1st of every month
0 9-17 * * 1-5      — every hour 9AM–5PM on weekdays
0 9 * * 1,3,5       — Mon, Wed, Fri at 9:00 AM
30 2 * * *          — every day at 2:30 AM

Special strings:
@reboot             — on reboot
@daily              — once a day
@weekly             — once a week
@monthly            — once a month
@hourly             — every hour

Management:
crontab -e          — edit
crontab -l          — view
crontab -r          — delete
crontab -u alice -l — another user's crontab

Files:
/etc/crontab        — system crontab (has user field)
/etc/cron.d/        — drop-in schedule files
/etc/cron.daily/    — daily scripts
/var/spool/cron/    — user crontabs

Tips:
>> log.txt 2>&1     — log to file
&>/dev/null         — silent mode
flock -n lock cmd   — prevent parallel runs
timeout 3600 cmd    — execution timeout
```

---

## References

- [crontab.guru](https://crontab.guru/) - interactive schedule editor
- [cron man page](https://man7.org/linux/man-pages/man8/cron.8.html) - `man 8 cron`
- [crontab man page](https://man7.org/linux/man-pages/man5/crontab.5.html) - `man 5 crontab`
- [anacron man page](https://man7.org/linux/man-pages/man8/anacron.8.html) - `man 8 anacron`
- [at man page](https://man7.org/linux/man-pages/man1/at.1.html) - `man at`
