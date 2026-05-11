---
title: "strace and ltrace - System Call and Library Call Tracing"
date: "2026-05-11"
---

Tracing means watching what a program does from the inside: which system calls it makes, which library functions it invokes, which files it opens, who it talks to over the network. An indispensable tool for debugging, analysis, and reverse engineering.

---

## What is a System Call

A program cannot directly access files, the network, or hardware - everything goes through the kernel. A system call (syscall) is a controlled transition from user space into kernel space.

```
Program (user space)
    │
    │  read(), write(), open(), connect()...
    ▼
Linux Kernel (kernel space)
    │
    │  accesses hardware directly
    ▼
Devices: disk, network, memory
```

`strace` intercepts these transitions and shows every system call with its arguments and return value.

`ltrace` does the same, but for library function calls (libc and other shared libraries).

---

## strace - System Call Tracing

### Installation

```bash
apt install strace        # Debian/Ubuntu
yum install strace        # RHEL/CentOS
pacman -S strace          # Arch
```

### Basic Usage

```bash
# Launch a program and trace it
strace ls
strace cat /etc/hostname
strace curl https://example.com

# Attach to an already running process
strace -p 1234
strace -p $(pgrep nginx)

# Attach to a process and all its threads
strace -fp 1234
```

### What strace Outputs

```
openat(AT_FDCWD, "/etc/passwd", O_RDONLY) = 3
read(3, "root:x:0:0:root:/root:/bin/bash\n", 4096) = 32
close(3)                                = 0
```

Format of each line:

```
syscall_name(arguments) = return_value
```

- Negative return value means an error (`-1 ENOENT (No such file or directory)`)
- `=?` means the process exited before the call returned

### Key strace Flags

| Flag | Description |
| --- | --- |
| `-e trace=syscall` | Filter by specific call or group |
| `-e trace=file` | File operations only |
| `-e trace=network` | Network calls only |
| `-e trace=process` | Process management calls only |
| `-e trace=signal` | Signals only |
| `-e trace=ipc` | IPC only (pipes, sockets) |
| `-e trace=memory` | Memory operations only (mmap, brk) |
| `-o file.txt` | Write output to file |
| `-f` | Follow child processes (fork/clone) |
| `-ff` | Follow children, one file per child |
| `-t` | Add timestamp (HH:MM:SS) |
| `-tt` | Add timestamp with microseconds |
| `-T` | Show time spent in each call |
| `-c` | Summary statistics only (no per-call output) |
| `-C` | Statistics plus full output |
| `-s N` | Max string length in arguments (default 32) |
| `-x` | Hex output for strings |
| `-v` | Verbose - full structures without abbreviations |
| `-p PID` | Attach to existing process |
| `-P path` | Only show calls involving this path |
| `-y` | Decode file paths for file descriptors |
| `-yy` | Decode paths and socket addresses |
| `-k` | Print call stack for each syscall |

---

## Practical strace Examples

### Find Which Files a Program Opens

```bash
strace -e trace=openat,open ls /tmp 2>&1 | grep -v "= -1"
# Only successful opens (no errors)

strace -e trace=file ls 2>&1
# All file ops: open, stat, access, unlink...
```

### Find the Cause of an Error

```bash
# Program won't start? See what's wrong
strace ./myapp 2>&1 | grep -i "ENOENT\|EACCES\|EPERM"

# Or with a filter
strace -e trace=openat ./myapp 2>&1 | grep " = -1"
```

Common errors:

| Error | Meaning |
| --- | --- |
| `ENOENT` | No such file or directory |
| `EACCES` | Permission denied |
| `EPERM` | Operation not permitted |
| `ECONNREFUSED` | Connection refused |
| `ETIMEDOUT` | Connection timed out |
| `EADDRINUSE` | Address already in use |

### Trace Network Calls

```bash
strace -e trace=network curl https://example.com 2>&1 | head -30

# See which addresses a program connects to
strace -e trace=connect -yy curl https://example.com 2>&1
# -yy shows human-readable addresses in connect()
```

### Call Statistics

```bash
strace -c ls /usr/bin
# Prints a table: how many times each syscall was called, total time

# % time     seconds  usecs/call     calls    errors syscall
# ------ ----------- ----------- --------- --------- ----------------
#  38.44    0.000340          12        27           mmap
#  20.95    0.000185          18        10           openat
#  ...

strace -c -e trace=file nginx 2>&1
# File calls with statistics
```

### Follow Child Processes

```bash
# -f - follow fork/clone
strace -f bash -c "ls | wc -l" 2>&1

# -ff - separate file per child
strace -ff -o /tmp/trace nginx
ls /tmp/trace.*      # trace.PID for each process
```

### Write to a File

```bash
strace -o /tmp/trace.log ./myapp
cat /tmp/trace.log

# Separate files per thread
strace -ff -o /tmp/trace ./myapp
```

### Attach to a Running Daemon

```bash
# Nginx - watch what a worker is doing
strace -p $(pgrep -n nginx) 2>&1
# Ctrl+C to detach (process keeps running)

# PostgreSQL - watch SQL queries via syscalls
strace -e trace=read,write -s 4096 -p $(pgrep postgres | head -1) 2>&1

# MySQL
strace -e trace=read,write -s 4096 -p $(pgrep mysqld) 2>&1
```

### Track Operations on a Specific File

```bash
# -P - only calls related to this path
strace -P /etc/passwd cat /etc/passwd

# Who is writing to a log file?
strace -P /var/log/app.log -p $(pgrep myapp)
```

### Increase String Output Length

```bash
# By default strace truncates strings to 32 characters
strace -s 1024 curl https://example.com 2>&1 | grep "write"
# Now you can see full HTTP requests and responses
```

---

## System Call Groups

With `-e trace=` you can specify not just individual calls but groups:

| Group | What it includes |
| --- | --- |
| `file` | open, openat, stat, access, unlink, rename, chmod... |
| `network` | socket, connect, bind, accept, sendto, recvfrom... |
| `process` | fork, clone, execve, exit, wait4... |
| `signal` | kill, sigaction, sigprocmask, rt_sigreturn... |
| `ipc` | pipe, msgget, msgsnd, semget, shmget... |
| `memory` | mmap, munmap, mprotect, brk, mremap... |
| `desc` | read, write, close, dup, poll, select... |

```bash
# Combine groups
strace -e trace=file,network ./myapp

# Exclude a call
strace -e trace=\!read ./myapp   # everything except read
```

---

## ltrace - Library Call Tracing

`ltrace` intercepts calls to dynamic libraries (.so). Useful when syscalls don't give the full picture - for example when you want to see `fopen()` instead of the low-level `openat()`, or track `malloc()`/`free()`.

### Installation

```bash
apt install ltrace         # Debian/Ubuntu
yum install ltrace         # RHEL/CentOS
```

### Basic Usage

```bash
ltrace ls
ltrace cat /etc/hostname

# Attach to a process
ltrace -p 1234
```

### What ltrace Outputs

```
fopen("/etc/passwd", "r")                        = 0x55a3d1234b60
fgets("root:x:0:0:root:/root:/bin/bash", 256, 0x55a3d1234b60) = 0x55a3d1234c80
fclose(0x55a3d1234b60)                           = 0
```

### Key ltrace Flags

| Flag | Description |
| --- | --- |
| `-e func` | Filter by function name (wildcards supported) |
| `-l library` | Trace only functions from this library |
| `-C` | Demangle C++ names |
| `-c` | Summary statistics only |
| `-f` | Follow child processes |
| `-o file` | Output to file |
| `-s N` | Max string length |
| `-S` | Also show system calls |
| `-x func` | Trace a function even if not from a library |
| `-n N` | Indent nested calls (default 0) |

### Practical ltrace Examples

```bash
# Watch only malloc/free (memory leaks)
ltrace -e malloc,free,realloc ./myapp 2>&1

# Wildcard function matching
ltrace -e "str*" ./myapp      # all str* functions: strcmp, strlen, strcpy...
ltrace -e "*open*" ./myapp    # everything containing "open"

# Library call statistics
ltrace -c ./myapp
# % time     seconds  usecs/call     calls      function
# ------ ----------- ----------- --------- --------------------
#  35.12    0.000340          12        27 malloc
#  20.95    0.000185          18        10 fopen

# ltrace + strace together
ltrace -S ./myapp 2>&1 | head -50

# Demangle C++
ltrace -C ./cpp_program 2>&1
```

---

## strace vs ltrace - When to Use Which

| Situation | Tool |
| --- | --- |
| Program cannot open a file | `strace -e trace=file` |
| Network issues, where is it connecting | `strace -e trace=network -yy` |
| Which environment variables it reads | `strace -e trace=execve -v` |
| Permission problems | `strace -e trace=file` + look for EACCES |
| Memory leaks | `ltrace -e malloc,free` |
| C++ program, which methods are called | `ltrace -C` |
| Program hangs, which syscall is it in | `strace -p PID` - instantly visible |
| What a daemon is doing right now | `strace -p PID -T` |
| Performance: slow calls | `strace -c -T` |
| Reverse engineering a binary | both together |

---

## Reading strace Output

### Reading from a File

```
openat(AT_FDCWD, "/etc/hosts", O_RDONLY) = 4
# open /etc/hosts read-only, got file descriptor 4

fstat(4, {st_mode=S_IFREG|0644, st_size=221, ...}) = 0
# stat file by descriptor - size 221 bytes, mode 0644

read(4, "127.0.0.1   localhost\n::1     lo", 4096) = 221
# read up to 4096 bytes from fd 4, got 221

close(4) = 0
# close the descriptor
```

### Network Connection

```
socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3
# create a TCP socket, got descriptor 3

connect(3, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("93.184.216.34")}, 16) = 0
# connect to 93.184.216.34:80, success

sendto(3, "GET / HTTP/1.1\r\nHost: example.co"..., 75, MSG_NOSIGNAL, NULL, 0) = 75
# send HTTP request

recvfrom(3, "HTTP/1.1 200 OK\r\nAge: 529951\r\nCa"..., 16384, 0, NULL, NULL) = 1256
# receive response
```

### Spawning a Child Process

```
clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|SIGCHLD, ...) = 12345
# create child process, PID = 12345
# (in modern Linux, fork() is implemented via clone())

execve("/bin/ls", ["ls", "/tmp"], 0x... /* 23 vars */) = 0
# replace the process image with /bin/ls and arguments
```

### Signals in strace

```
--- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=1000, si_uid=1000} ---
# received SIGTERM from PID 1000

+++ killed by SIGTERM +++
# process killed by the signal
```

---

## Advanced Techniques

### Find Slow System Calls

```bash
# -T shows time spent in each call in angle brackets
strace -T ls /usr/bin 2>&1 | sort -t'<' -k2 -rn | head -10

# Or via statistics
strace -c -S time ls /usr/bin 2>&1
# Sorted by time - bottleneck is immediately visible
```

### Track DNS Requests

```bash
strace -e trace=network -s 256 -yy curl https://example.com 2>&1 | grep "connect\|sendto\|recvfrom"
```

### Dump All Application Traffic

```bash
# Large string buffer + all network calls
strace -e trace=read,write,send,recv,sendto,recvfrom -s 65536 -p $(pgrep myapp) 2>&1
```

### Find What Config File Gets Read

```bash
strace -e trace=openat -s 256 ./myapp 2>&1 | grep "= [0-9]"
# Shows only successfully opened files
```

### Tracing a Bash Script

```bash
# Trace a bash script including all child processes
strace -f -e trace=execve bash -x ./deploy.sh 2>&1 | grep execve
# See every command the script launches
```

---

## Working with /proc/PID/syscall

Without strace you can quickly check which syscall a process is stuck in:

```bash
# Current system call of a process
cat /proc/1234/syscall
# 0 0x3 0x7f... 0x1000 0x0 0x0 0x0 0x7ffee3a01000
# syscall_number  arguments...  stack_pointer

# Translate syscall number to name
ausyscall 0     # read
ausyscall 1     # write
ausyscall --dump | grep " 0$"

# Where in kernel code is the process stuck (D-state only)
cat /proc/1234/wchan
# poll_schedule_timeout  <- waiting on a timeout
# do_sys_poll            <- waiting in poll()
# pipe_wait              <- waiting for data in a pipe
```

---

## Limitations and Notes

**Performance.** strace significantly slows down the traced process (sometimes 10-100x). Avoid using on production servers unless necessary. For minimal impact use `-c` (statistics only).

**Permissions.** Requires root to attach to processes owned by other users. Normal users can trace only their own processes.

**ptrace\_scope.** Some systems restrict ptrace:

```bash
# Check the current mode
cat /proc/sys/kernel/yama/ptrace_scope
# 0 - no restrictions
# 1 - parent processes only (default on Ubuntu)
# 2 - root only
# 3 - completely disabled

# Temporarily allow (requires root)
echo 0 > /proc/sys/kernel/yama/ptrace_scope
```

**ltrace and static binaries.** ltrace does not work with statically compiled programs - there are no dynamic libraries to intercept.

**Threads.** For multithreaded programs use `-f`:

```bash
strace -f -p $(pgrep myapp)
# Threads are shown with [pid XXXXX] prefix
```

---

## Related Tools

| Tool | Description |
| --- | --- |
| `perf trace` | Tracing via perf with lower overhead |
| `auditd` | System-level syscall auditing with log storage |
| `stap` (SystemTap) | Dynamic tracing with custom scripts |
| `bpftrace` | Tracing via eBPF - minimal overhead |
| `dtrace` | Equivalent for Solaris/macOS/FreeBSD |
| `ftrace` | Built-in Linux kernel tracing |
| `gdb` | Debugger - can also inspect calls |
| `valgrind` | Memory analysis, leak detection |

```bash
# perf trace - faster strace alternative
perf trace ls
perf trace -e openat ls

# bpftrace - one-liners for tracing
bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s\n", str(args->filename)); }'
```

---

## Cheat Sheet

```bash
# strace - basic
strace ./program                         # run with tracing
strace -p PID                            # attach to process

# strace - filters
strace -e trace=file ./prog              # file operations
strace -e trace=network ./prog           # network operations
strace -e trace=openat ./prog            # only openat
strace -e trace=\!read ./prog            # everything except read

# strace - output
strace -o trace.log ./prog               # to file
strace -t ./prog                         # add timestamp
strace -T ./prog                         # time spent per call
strace -c ./prog                         # summary statistics only
strace -s 1024 ./prog                    # longer strings

# strace - processes
strace -f ./prog                         # follow forks
strace -ff -o /tmp/t ./prog              # one file per thread
strace -y ./prog                         # paths instead of fd numbers
strace -yy ./prog                        # socket addresses too

# ltrace - basic
ltrace ./program                         # library calls
ltrace -e malloc,free ./prog             # only malloc/free
ltrace -e "str*" ./prog                  # functions by pattern
ltrace -C ./prog                         # demangle C++
ltrace -c ./prog                         # statistics
ltrace -S ./prog                         # ltrace + syscalls

# Diagnostics
strace -e trace=file ./prog 2>&1 | grep "= -1"          # all errors
strace -c -S time ./prog 2>&1                            # slow calls
strace -e trace=openat -p PID 2>&1 | grep -v "= -1"     # what a daemon opens
cat /proc/PID/syscall                                    # current syscall without strace
cat /proc/PID/wchan                                      # which kernel function it's stuck in
```

---

## References

- [strace man page](https://man7.org/linux/man-pages/man1/strace.1.html) - `man strace`
- [ltrace man page](https://man7.org/linux/man-pages/man1/ltrace.1.html) - `man ltrace`
- [syscalls man page](https://man7.org/linux/man-pages/man2/syscalls.2.html) - `man 2 syscalls`
- [strace GitHub](https://github.com/strace/strace) - source code and docs
- [Julia Evans - strace zine](https://jvns.ca/strace-zine-v2.pdf) - great visual explanation
