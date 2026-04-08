---
title: "Processes and Signals (ps, kill, top, htop)"
date: "2026-03-27"
---

A process is a running program loaded into memory. Every process has a unique identifier (PID), a parent, resources, and a state.

---

## What Is a Process

When a program is launched, the kernel creates a process and allocates it:

- **PID** - unique numeric identifier
- **PPID** - parent process PID
- **UID / GID** - which user/group it runs as
- **Virtual memory** - its address space
- **File descriptors** - open files and sockets
- **Priority** - nice value, influences CPU scheduling

```bash
# Every process is born via fork() + exec()
# init/systemd (PID 1) - the ancestor of all processes

pstree -p              # process tree with PIDs
pstree -p | head -20
```

---

## Process States

| Symbol | State | Description |
|--------|-------|-------------|
| `R` | Running | Executing or ready to execute |
| `S` | Sleeping | Waiting for an event (interruptible) |
| `D` | Disk sleep | Waiting for I/O (uninterruptible — cannot be killed) |
| `Z` | Zombie | Finished, but parent hasn't read its exit status |
| `T` | Stopped | Paused by a signal (SIGSTOP / SIGTSTP) |
| `I` | Idle | Idle kernel thread |
| `<` | — | High priority (negative nice) |
| `N` | — | Low priority (positive nice) |
| `s` | — | Session leader |
| `l` | — | Multi-threaded |
| `+` | — | Foreground process |

---

## ps - Process Snapshot

`ps` shows a snapshot of current processes at the moment it's called.

### Common usage

```bash
ps                     # processes in the current terminal
ps aux                 # all processes, all users (BSD style)
ps -ef                 # all processes with PPID (UNIX style)
ps -ejH                # process tree
ps -u alice            # processes owned by alice
ps -p 1234             # specific PID
```

### Decoding `ps aux`

```bash
ps aux
# USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
# root         1  0.0  0.1 168940 13208 ?        Ss   Mar01   0:05 /sbin/init
# alice     1234  2.3  1.5 512340 61440 pts/0    Sl+  10:22   0:12 python3 app.py
```

| Column | Description |
|--------|-------------|
| `USER` | Process owner |
| `PID` | Process ID |
| `%CPU` | CPU usage (%) |
| `%MEM` | RAM usage (%) |
| `VSZ` | Virtual memory size (KB) |
| `RSS` | Resident memory in RAM (KB) |
| `TTY` | Terminal (`?` = no terminal, daemon) |
| `STAT` | Process state |
| `START` | Start time |
| `TIME` | Total CPU time consumed |
| `COMMAND` | Launch command |

### Useful filters

```bash
# Find a process by name
ps aux | grep nginx
ps aux | grep -v grep | grep nginx   # exclude the grep line itself

# With header preserved
ps aux | head -1; ps aux | grep nginx

# PIDs only
ps -C nginx -o pid=

# Custom output, sorted by CPU
ps -eo pid,ppid,user,stat,pcpu,pmem,comm --sort=-pcpu | head -20

# Process tree
ps -ejH | grep -A5 nginx
```

### Custom fields for `-o`

```bash
ps -eo pid,ppid,user,stat,ni,pcpu,pmem,vsz,rss,etime,comm
#         │    │     │   │   │    │    │   │   │      └── command name
#         │    │     │   │   │    │    │   │   └───────── elapsed time
#         │    │     │   │   │    │    │   └───────────── RSS memory
#         │    │     │   │   │    │    └───────────────── virtual memory
#         │    │     │   │   │    └────────────────────── % memory
#         │    │     │   │   └─────────────────────────── % CPU
#         │    │     │   └─────────────────────────────── nice value
#         │    │     └─────────────────────────────────── state
#         │    └───────────────────────────────────────── user
#         └────────────────────────────────────────────── PPID
```

---

## top - Interactive Monitor

`top` shows processes in real time, refreshing every 3 seconds by default.

```bash
top              # launch
top -u alice     # only alice's processes
top -p 1234      # watch a specific PID
top -b -n 1      # batch mode, single snapshot (for scripts)
top -b -n 1 > processes.txt  # save to file
```

### top header explained

```
top - 14:32:01 up 5 days, 3:12,  2 users,  load average: 0.52, 0.48, 0.41
Tasks: 187 total,   1 running, 186 sleeping,   0 stopped,   0 zombie
%Cpu(s):  3.2 us,  0.8 sy,  0.0 ni, 95.5 id,  0.3 wa,  0.0 hi,  0.2 si
MiB Mem :   7854.3 total,   1203.5 free,   3841.2 used,   2809.6 buff/cache
MiB Swap:   2048.0 total,   2001.3 free,     46.7 used.   3712.4 avail Mem
```

| Field | Description |
|-------|-------------|
| `load average` | Average load over 1/5/15 minutes |
| `us` | User - user-space processes |
| `sy` | System - kernel |
| `ni` | Nice - processes with adjusted priority |
| `id` | Idle - doing nothing |
| `wa` | Wait - waiting for I/O |
| `hi` | Hardware IRQ |
| `si` | Software IRQ |
| `buff/cache` | Filesystem cache (reclaimable) |

### top keyboard shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `h` | Help |
| `k` | Send a signal (kill) to a process |
| `r` | Change priority (renice) |
| `u` | Filter by user |
| `M` | Sort by memory |
| `P` | Sort by CPU |
| `T` | Sort by time |
| `1` | Show each CPU core separately |
| `c` | Show full command line |
| `i` | Hide idle processes |
| `f` | Select displayed fields |
| `W` | Save settings |
| `Space` | Refresh immediately |

---

## htop — Enhanced top

`htop` is an interactive process viewer with colors, a process tree, and mouse support.

```bash
# Install
apt install htop      # Debian/Ubuntu
yum install htop      # RHEL/CentOS

htop                  # launch
htop -u alice         # alice's processes only
htop -p 1234,5678     # specific PIDs
htop -d 10            # refresh every 1.0 second (value is in tenths)
```

### htop keyboard shortcuts

| Key | Action |
|-----|--------|
| `F1` | Help |
| `F2` | Setup |
| `F3` / `/` | Search for a process |
| `F4` | Filter |
| `F5` | Toggle tree/list view |
| `F6` | Sort by column |
| `F7` / `F8` | Decrease/increase nice value |
| `F9` | Send signal (kill) |
| `F10` | Quit |
| `Space` | Tag a process |
| `U` | Untag all |
| `t` | Toggle process tree |
| `H` | Show/hide user threads |
| `K` | Show/hide kernel threads |
| `u` | Filter by user |
| `I` | Invert sort order |
| `+` / `-` | Expand/collapse tree |

---

## Signals

A signal is an asynchronous notification sent to a process. The kernel delivers signals immediately.

### Key signals

| Number | Name | Description | Catchable? |
|--------|------|-------------|------------|
| `1` | `SIGHUP` | Hang Up - reload config | Yes |
| `2` | `SIGINT` | Interrupt - same as Ctrl+C | Yes |
| `3` | `SIGQUIT` | Quit - like Ctrl+\ (with core dump) | Yes |
| `9` | `SIGKILL` | Kill - immediate termination | No |
| `10` | `SIGUSR1` | User-defined signal 1 | Yes |
| `12` | `SIGUSR2` | User-defined signal 2 | Yes |
| `15` | `SIGTERM` | Terminate - graceful shutdown | Yes |
| `17` | `SIGCHLD` | Child - child process exited | Yes |
| `18` | `SIGCONT` | Continue - resume after STOP | Yes |
| `19` | `SIGSTOP` | Stop - freeze the process | No |
| `20` | `SIGTSTP` | Terminal Stop - same as Ctrl+Z | Yes |

```bash
# List all signals
kill -l
# 1) SIGHUP  2) SIGINT  3) SIGQUIT  4) SIGILL ...
```

---

## kill - Sending Signals

Despite the name, `kill` sends **any signal**, not just termination ones.

```bash
# Syntax: kill [-signal] PID

kill 1234              # send SIGTERM (default)
kill -15 1234          # SIGTERM — ask the process to exit gracefully
kill -9 1234           # SIGKILL — force kill immediately
kill -1 1234           # SIGHUP — reload config
kill -STOP 1234        # freeze the process
kill -CONT 1234        # unfreeze the process

# By name (sends signal to all matching processes)
killall nginx          # send SIGTERM to all nginx processes
killall -9 nginx       # SIGKILL all nginx
killall -HUP nginx     # reload nginx config

# pkill — kill by name pattern
pkill nginx            # like killall
pkill -u alice         # all processes owned by alice
pkill -f "python3 app" # match against the full command line

# Send signal to a process group (negative PID)
kill -TERM -1234       # entire process group
```

### Correct termination order

```bash
# 1. SIGTERM first - give the process a chance to clean up
kill -15 $PID

# 2. Wait
sleep 5

# 3. Check if it's still alive
kill -0 $PID 2>/dev/null && echo "still alive"

# 4. If still alive — SIGKILL
kill -9 $PID
```

```bash
# Graceful kill script
graceful_kill() {
    local pid=$1
    kill -TERM $pid 2>/dev/null
    for i in $(seq 1 10); do
        kill -0 $pid 2>/dev/null || return 0
        sleep 1
    done
    kill -KILL $pid 2>/dev/null
}
```

---

## Background Jobs and Job Control

### Running in the background

```bash
command &              # run in the background
nohup command &        # ignore SIGHUP (survives terminal logout)
nohup command > out.log 2>&1 &  # with output redirection

# disown — detach from terminal after launch
long_running_command &
disown %1              # detach the last background job
```

### jobs - job management

```bash
jobs                   # list background jobs
jobs -l                # include PIDs

# [1]+ Running    sleep 100 &
# [2]- Stopped    vim file.txt

fg                     # bring the last job to the foreground
fg %1                  # bring job #1 to the foreground
bg                     # resume a stopped job in the background
bg %2                  # job #2 to background

# Ctrl+Z — stop the current process (SIGTSTP)
# Ctrl+C — terminate the current process (SIGINT)
```

---

## Process Priority (nice / renice)

`nice` value ranges from `-20` (highest priority) to `+19` (lowest). Default is `0`.

```bash
# Start with a low priority
nice -n 10 ./heavy_script.sh     # nice value = 10
nice -n 19 make -j8              # maximum low priority (won't disturb the system)

# Raise priority (root only)
nice -n -10 ./critical.sh        # negative nice = higher priority

# Change priority of a running process
renice +5 -p 1234                # lower priority for PID 1234
renice -5 -p 1234                # raise priority (root only)
renice +10 -u alice              # all of alice's processes
renice +10 -g developers         # all processes in the group

# See nice values in ps
ps -eo pid,ni,comm | head -20
```

---

## /proc and Process Information

```bash
# Every process has a directory at /proc/PID/
ls /proc/1234/
# cmdline  cwd  environ  exe  fd  maps  mem  net  stat  status  ...

cat /proc/1234/cmdline    # command line (\0 separated)
cat /proc/1234/status     # detailed status
cat /proc/1234/environ    # environment variables
ls -la /proc/1234/exe     # symlink to the executable
ls -la /proc/1234/cwd     # current working directory
ls /proc/1234/fd/         # open file descriptors

# How many files does the process have open?
ls /proc/1234/fd/ | wc -l

# Open file limits
cat /proc/1234/limits
```

---

## lsof - Open Files and Sockets

```bash
lsof                          # all open files (a lot)
lsof -p 1234                  # files opened by process 1234
lsof -u alice                 # files opened by alice
lsof /var/log/syslog          # who has this file open
lsof -i                       # all network connections
lsof -i :80                   # who is listening on port 80
lsof -i :80 -i :443           # ports 80 and 443
lsof -i TCP:22                # TCP connections on port 22
lsof -i UDP                   # all UDP connections

# Find the process using a port
lsof -i :8080 | grep LISTEN
```

---

## Resource Monitoring

### CPU and memory

```bash
# Overall system load
uptime
# 14:32:01 up 5 days, load average: 0.52, 0.48, 0.41
# load average > number of CPUs = system is overloaded

nproc                  # number of CPUs
cat /proc/cpuinfo | grep "processor" | wc -l

# Memory
free -h                # memory overview
cat /proc/meminfo      # detailed

# vmstat — virtual memory statistics
vmstat 1 5             # update every second, 5 times
# procs ----memory---- ---swap-- -----io---- -system-- ----cpu----
# r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa
# 1  0      0 1203456 123456 2809600   0    0    12    34  100  200  3  1 95  1
```

| vmstat field | Description |
|--------------|-------------|
| `r` | Processes waiting for CPU |
| `b` | Processes in uninterruptible sleep |
| `si/so` | Swap in/out (KB/s) |
| `bi/bo` | Block I/O (blocks/s) |
| `in` | Interrupts per second |
| `cs` | Context switches per second |
| `us/sy/id/wa` | CPU: user/system/idle/wait |

### I/O monitoring

```bash
# iostat - disk statistics
iostat -x 1            # extended, every second
iostat -x -d sda 1     # just sda

# iotop — like top but for I/O
apt install iotop
iotop                  # all processes
iotop -o               # only active ones
iotop -u alice         # alice's processes
```

---

## Useful One-liners

```bash
# Top 10 processes by CPU
ps aux --sort=-%cpu | head -11

# Top 10 processes by memory
ps aux --sort=-%mem | head -11

# Find and kill a process by name
kill $(pgrep nginx)
pkill -f "gunicorn"

# Wait for a process to finish
wait $PID
tail --pid=$PID -f /dev/null   # wait without using wait builtin

# Run with a timeout
timeout 30 ./script.sh         # kill after 30 seconds

# Monitor a process every 2 seconds
watch -n 2 'ps aux | grep nginx'

# How many processes does a user have?
ps -u alice | wc -l

# Show the parent tree of a process
pstree -s -p 1234

# Find zombie processes
ps aux | awk '$8=="Z"'

# Restart a service via SIGHUP
kill -HUP $(cat /run/nginx.pid)
```

---

## systemd and Service Management

In modern distributions, daemon processes are managed through systemd.

```bash
# Core commands
systemctl status nginx         # service status
systemctl start nginx          # start
systemctl stop nginx           # stop
systemctl restart nginx        # restart
systemctl reload nginx         # reload config (SIGHUP)
systemctl enable nginx         # start on boot
systemctl disable nginx        # don't start on boot

# View service logs
journalctl -u nginx            # all logs
journalctl -u nginx -f         # follow in real time
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx -n 50      # last 50 lines

# List all services
systemctl list-units --type=service
systemctl list-units --type=service --state=running
```

---

## Diagnosing Stuck Processes

```bash
# Process in state D (disk sleep) — I/O problem
ps aux | awk '$8 ~ /D/'

# Find what's blocking it
cat /proc/$PID/wchan            # which syscall it's stuck in
strace -p $PID                  # trace system calls

# Zombie processes — parent hasn't read exit status
ps aux | awk '$8=="Z"'
# Zombies cannot be killed — kill the parent (PPID) instead
kill -CHLD $PPID                # ask the parent to reap the child

# Process ignoring SIGTERM?
strace -e trace=signal -p $PID  # observe signal handling
```

---

## References

- [ps man page](https://man7.org/linux/man-pages/man1/ps.1.html) - `man ps`
- [signal man page](https://man7.org/linux/man-pages/man7/signal.7.html) - `man 7 signal`
- [proc man page](https://man7.org/linux/man-pages/man5/proc.5.html) - `man 5 proc`
- [htop official site](https://htop.dev/) - documentation and screenshots
