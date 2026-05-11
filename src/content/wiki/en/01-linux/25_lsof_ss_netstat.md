---
title: "lsof, ss, netstat - Open Files and Network Connections"
date: "2026-05-11"
---

Three tools for diagnosing what is happening with files and the network right now: who is holding a file open, which ports are listening, which connections are active, what a process is connected to. Without these utilities, diagnosing any network or file problem in Linux is practically impossible.

---

## lsof - List Open Files

`lsof` (List Open Files) shows all open file descriptors in the system. In Linux, everything is a file: regular files, directories, sockets, pipes, devices. lsof sees them all.

### Installation

```bash
apt install lsof          # Debian/Ubuntu
yum install lsof          # RHEL/CentOS
pacman -S lsof            # Arch
```

### Basic Usage

```bash
lsof                      # all open files (a lot)
lsof | wc -l              # how many in total

lsof | head -20           # first 20 lines
```

### Output Structure

```
COMMAND    PID   USER   FD   TYPE  DEVICE SIZE/OFF   NODE NAME
nginx     1234   root  cwd    DIR     8,1     4096  12345 /
nginx     1234   root  txt    REG     8,1   786432  67890 /usr/sbin/nginx
nginx     1234   root  mem    REG     8,1  1905632  23456 /lib/x86_64/libc.so.6
nginx     1234   root    3u  IPv4  123456      0t0    TCP *:80 (LISTEN)
nginx     1234   root    4u  IPv4  234567      0t0    TCP 10.0.0.1:80->1.2.3.4:52341 (ESTABLISHED)
```

| Column | Description |
| --- | --- |
| `COMMAND` | Process name (first 9 characters) |
| `PID` | Process ID |
| `USER` | Process owner |
| `FD` | File descriptor (cwd, txt, mem, 0-N) |
| `TYPE` | File type (REG, DIR, IPv4, IPv6, FIFO, CHR...) |
| `DEVICE` | Major/minor device numbers |
| `SIZE/OFF` | File size or offset |
| `NODE` | Inode number |
| `NAME` | File path or connection address |

### FD Field Values

| FD | Description |
| --- | --- |
| `cwd` | Current Working Directory |
| `txt` | Text - the program executable |
| `mem` | Memory - file mapped into memory (shared library) |
| `rtd` | Root Directory |
| `0u` | stdin (u = read+write, r = read, w = write) |
| `1u` | stdout |
| `2u` | stderr |
| `3u`, `4r`, `5w`... | Open file descriptors |

### TYPE Field Values

| TYPE | Description |
| --- | --- |
| `REG` | Regular file |
| `DIR` | Directory |
| `CHR` | Character device (terminal, /dev/...) |
| `BLK` | Block device (disk) |
| `FIFO` | Pipe or FIFO |
| `IPv4` | IPv4 socket |
| `IPv6` | IPv6 socket |
| `unix` | Unix domain socket |
| `sock` | Socket of unknown type |

---

## lsof - Core Examples

### By Process and User

```bash
# Open files of a specific process
lsof -p 1234
lsof -p 1234,5678         # multiple PIDs

# Open files by process name
lsof -c nginx
lsof -c nginx -c apache   # multiple names

# Open files by user
lsof -u alice
lsof -u alice,bob

# Everyone except a user (^ = exclude)
lsof -u ^root
```

### By File and Directory

```bash
# Who is holding a file open
lsof /var/log/nginx/access.log
lsof /etc/passwd

# Who is using a directory (and everything inside)
lsof +D /var/log/          # recursive (slow)
lsof +d /var/log/          # files directly in directory only (fast)

# Who is using a device
lsof /dev/sda1
```

### Network Connections via lsof

```bash
# All network connections
lsof -i

# Only IPv4 or IPv6
lsof -i 4
lsof -i 6

# Specific port
lsof -i :80
lsof -i :80,443
lsof -i :22

# Specific protocol and port
lsof -i TCP:80
lsof -i UDP:53

# Port range
lsof -i :1-1024

# Only LISTEN (who is listening on ports)
lsof -i -s TCP:LISTEN
lsof -i TCP -s TCP:LISTEN

# Only established connections
lsof -i -s TCP:ESTABLISHED

# Connections to a specific host
lsof -i @192.168.1.100
lsof -i @192.168.1.100:80

# Who is listening on port 8080?
lsof -i :8080 | grep LISTEN
```

### Useful Combinations

```bash
# PID of process using a port
lsof -ti :80                   # -t = PID only, no header
kill $(lsof -ti :80)           # kill the process on port 80

# All sockets of a process
lsof -p $(pgrep nginx) -a -i

# How many files does a process have open?
lsof -p 1234 | wc -l

# Files that were deleted but are still open (still consuming disk space)
lsof | grep deleted
lsof | grep "(deleted)"

# Find the process holding a deleted file (disk space not freed)
lsof | grep deleted | awk '{print $1, $2, $NF}'

# Open files by extension
lsof | grep "\.log$"
lsof | grep "\.py$"

# Processes using a specific library
lsof | grep libssl

# Skip DNS resolution (faster)
lsof -n -i :80        # -n = don't resolve IPs to names
lsof -P -i :80        # -P = don't resolve ports to service names
lsof -nP -i           # both flags - maximum speed
```

---

## ss - Socket Statistics

`ss` (Socket Statistics) is the modern replacement for `netstat`. It is faster because it reads data directly from the kernel via netlink rather than from `/proc`. It is part of the `iproute2` package.

### Basic Usage

```bash
ss                        # all sockets (non-listening TCP by default)
ss -a                     # all sockets including LISTEN
ss -l                     # listening sockets only
ss -t                     # TCP only
ss -u                     # UDP only
ss -x                     # Unix domain sockets only
```

### Output Structure

```bash
ss -tnp
# Netid  State    Recv-Q  Send-Q   Local Address:Port   Peer Address:Port   Process
# tcp    LISTEN   0       128      0.0.0.0:80            0.0.0.0:*          users:(("nginx",pid=1234,fd=6))
# tcp    ESTAB    0       0        10.0.0.1:80           1.2.3.4:52341      users:(("nginx",pid=1235,fd=8))
```

| Column | Description |
| --- | --- |
| `Netid` | Socket type: tcp, udp, unix, nl (netlink) |
| `State` | Connection state |
| `Recv-Q` | Bytes queued for receive |
| `Send-Q` | Bytes queued for send |
| `Local Address:Port` | Local address and port |
| `Peer Address:Port` | Remote address and port |
| `Process` | PID and process name (requires -p and root) |

### TCP States in ss

| State | Description |
| --- | --- |
| `LISTEN` | Socket is listening for incoming connections |
| `ESTAB` | Connection is established |
| `TIME-WAIT` | Connection closing, waiting for remaining packets |
| `CLOSE-WAIT` | Remote side closed the connection |
| `SYN-SENT` | SYN sent, waiting for SYN-ACK |
| `SYN-RECV` | SYN received, SYN-ACK sent |
| `FIN-WAIT-1` | Starting close from our side |
| `FIN-WAIT-2` | Waiting for FIN from remote side |
| `LAST-ACK` | Waiting for the last ACK |
| `CLOSED` | Connection is closed |
| `UNCONN` | UDP socket not connected |

---

## ss - Key Flags

| Flag | Description |
| --- | --- |
| `-t` | TCP sockets |
| `-u` | UDP sockets |
| `-x` | Unix domain sockets |
| `-n` | Numeric addresses and ports (no resolution) |
| `-l` | Listening only |
| `-a` | All sockets |
| `-p` | Show process (PID and name) |
| `-s` | Summary statistics |
| `-e` | Extended information |
| `-i` | TCP internal info (timers, windows) |
| `-m` | Socket memory info |
| `-o` | Timers |
| `-r` | Resolve names (DNS + /etc/services) |
| `-4` | IPv4 only |
| `-6` | IPv6 only |
| `-f FAMILY` | Filter by family (inet, inet6, unix, netlink) |

---

## ss - Practical Examples

### Core Queries

```bash
# Who is listening on ports (most common task)
ss -tlnp                  # TCP listening, numeric, with processes
ss -ulnp                  # UDP listening
ss -tlnp | grep :80       # specific port

# All established connections
ss -tnp                   # TCP established with processes
ss -tunp                  # TCP + UDP

# All connections (including LISTEN)
ss -tanp                  # all TCP with processes

# Unix domain sockets
ss -xlnp                  # Unix listening
ss -xp                    # all Unix with processes
```

### Filtering by Address and Port

```bash
# ss filters use a special syntax
ss -tnp dst 1.2.3.4              # connections to remote host 1.2.3.4
ss -tnp dst 1.2.3.4:80           # to a specific port
ss -tnp src 10.0.0.1             # from a local address
ss -tnp src 10.0.0.1:8080        # from local address and port

# Port
ss -tnp dport = :80              # destination port 80
ss -tnp sport = :443             # source port 443
ss -tnp dport \> :1024           # destination port > 1024

# Subnets
ss -tnp dst 192.168.0.0/24       # to a subnet

# Combine conditions
ss -tnp dst 1.2.3.4 and dport = :80
ss -tnp state established dst 1.2.3.4
```

### Filtering by State

```bash
ss -t state established          # all ESTABLISHED
ss -t state listen               # all LISTEN
ss -t state time-wait            # all TIME-WAIT

# Multiple states
ss -t state established or state close-wait

# All except LISTEN
ss -t exclude listen

# State filter with port filter
ss -tnp state established dport = :443
```

### Statistics and Information

```bash
# Summary statistics for all sockets
ss -s
# Total: 450
# TCP:   234 (estab 45, closed 12, orphaned 3, timewait 12)
# Transport Total  IP  IPv6
# RAW       0      0   0
# UDP       23     20  3
# TCP       222    200 22

# Extended socket information
ss -tne                   # with socket parameters (timeouts, buffers)

# TCP internals (windows, RTT, congestion control)
ss -tni
# cubic wscale:7,7 rto:204 rtt:4.123/1.123 ato:40 mss:1448
# rcvmss:536 advmss:1448 cwnd:10 ssthresh:2147483647 bytes_sent:1234
# segs_out:100 segs_in:80 data_segs_out:50 data_segs_in:40
# send 28.1Mbps lastsnd:8 lastrcv:4 lastack:4 pacing_rate 33.8Mbps

# Timers
ss -tno                   # show keepalive / retransmit timers
```

### Diagnosing a Specific Process

```bash
# All nginx connections
ss -tnp | grep nginx

# Connections by PID
ss -tnp | grep "pid=1234"

# How many connections does nginx have?
ss -tnp | grep nginx | wc -l

# Connections by state for a process
ss -tnp state established | grep nginx
```

---

## netstat - Classic Utility

`netstat` is the old standard, part of the `net-tools` package. In modern systems it has been replaced by `ss`, but it is still widely found in the wild. The syntax is similar, but it is slower (reads from `/proc/net`).

### Installation

```bash
apt install net-tools      # Debian/Ubuntu
yum install net-tools      # RHEL/CentOS
```

### Core netstat Flags

| Flag | Description |
| --- | --- |
| `-t` | TCP |
| `-u` | UDP |
| `-x` | Unix domain sockets |
| `-l` | Listening only |
| `-a` | All connections |
| `-n` | Numeric addresses (no resolution) |
| `-p` | Show PID/process name |
| `-s` | Protocol statistics |
| `-r` | Routing table |
| `-i` | Network interfaces |
| `-e` | Extended information |
| `-c` | Continuous output |
| `-4` | IPv4 only |
| `-6` | IPv6 only |

### Core netstat Examples

```bash
# Who is listening on ports
netstat -tlnp             # TCP listening, numeric, with processes
netstat -ulnp             # UDP listening
netstat -tlnp | grep :80  # specific port

# All connections
netstat -tunp             # TCP + UDP with processes
netstat -tanp             # all TCP with processes

# Statistics
netstat -s                # stats for all protocols
netstat -st               # TCP statistics only
netstat -su               # UDP statistics only

# Routing table
netstat -r
netstat -rn               # without name resolution

# Interfaces
netstat -i                # brief interface statistics
netstat -ie               # extended (like ifconfig)
```

---

## netstat vs ss - Comparison

| Task | netstat | ss |
| --- | --- | --- |
| Who listens on TCP ports | `netstat -tlnp` | `ss -tlnp` |
| All TCP connections | `netstat -tnp` | `ss -tnp` |
| All UDP | `netstat -unp` | `ss -unp` |
| Unix sockets | `netstat -xnp` | `ss -xnp` |
| Statistics | `netstat -s` | `ss -s` |
| Routing table | `netstat -rn` | `ip route` |
| Interfaces | `netstat -i` | `ip link` |
| Speed | slow | fast |
| Filtering | grep only | built-in filters |
| TCP details | limited | `ss -tni` |

---

## Comparing lsof, ss, and netstat for Network Tasks

```bash
# Who is listening on port 80?
lsof -i :80 | grep LISTEN
ss -tlnp | grep :80
netstat -tlnp | grep :80

# All connections to host 1.2.3.4
lsof -i @1.2.3.4
ss -tnp dst 1.2.3.4
netstat -tnp | grep 1.2.3.4

# How many ESTABLISHED connections?
ss -t state established | wc -l
netstat -tn | grep ESTABLISHED | wc -l

# Which process is using a port?
lsof -ti :8080            # returns PID
ss -tlnp | grep :8080     # shows PID in Process column
```

---

## Diagnostic Scenarios

### Port is in use - by whom?

```bash
# Option 1 - lsof
lsof -i :5432

# Option 2 - ss
ss -tlnp | grep :5432

# Option 3 - netstat
netstat -tlnp | grep :5432

# Kill the process on the port
kill $(lsof -ti :5432)
```

### File Descriptor Leak

```bash
# How many descriptors does a process have open?
lsof -p 1234 | wc -l

# File descriptor limit
cat /proc/1234/limits | grep "open files"

# Top processes by number of open files
lsof | awk '{print $2}' | sort | uniq -c | sort -rn | head -10
# First column = count, second = PID

# Same with process names
lsof | awk '{print $1, $2}' | sort | uniq -c | sort -rn | head -10
```

### File Deleted but Disk Space Not Freed

```bash
# Find deleted files that are still open
lsof | grep deleted

# Show with file size
lsof | grep deleted | awk '{print $1, $2, $7, $NF}'
# COMMAND PID SIZE FILENAME

# Largest deleted files still held open
lsof | grep deleted | awk '{print $7, $1, $2, $NF}' | sort -rn | head -10

# Fix: restart the process holding the file open
# or truncate the file without restarting:
> /proc/PID/fd/FD_NUMBER   # clear content via the descriptor
```

### Many TIME-WAIT Connections

```bash
# How many TIME-WAIT connections?
ss -t state time-wait | wc -l
netstat -tn | grep TIME_WAIT | wc -l

# Which IPs have the most TIME-WAIT?
ss -tn state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Speed up reuse (in /etc/sysctl.conf)
# net.ipv4.tcp_tw_reuse = 1
# net.ipv4.tcp_fin_timeout = 30
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### Analyzing Server Load

```bash
# Top IPs by number of connections
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# Same with netstat
netstat -tn | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Connection count by state
ss -t | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# netstat version
netstat -tn | awk 'NR>2 {print $6}' | sort | uniq -c | sort -rn
```

### Real-time Monitoring

```bash
# watch + ss - refresh every 2 seconds
watch -n 2 'ss -tnp | grep :80'

# watch + netstat
watch -n 2 'netstat -tnp | grep :80'

# Continuous netstat output
netstat -c -tnp

# Monitor connection count on a port
watch -n 1 'ss -tnp state established | grep :443 | wc -l'
```

### Check if a Service is Listening

```bash
# Is nginx running?
ss -tlnp | grep nginx

# Is PostgreSQL available?
ss -tlnp | grep :5432

# Redis
ss -tlnp | grep :6379

# Check from a script
if ss -tlnp | grep -q :80; then
    echo "Port 80 is listening"
else
    echo "Port 80 is NOT listening"
fi
```

---

## Monitoring Unix Domain Sockets

```bash
# All Unix sockets
ss -xl
lsof -U               # Unix domain sockets

# Find PostgreSQL socket
ss -xl | grep postgres
lsof | grep ".s.PGSQL"

# Nginx FastCGI socket
ss -xl | grep nginx
ls -la /run/php/php8-fpm.sock

# Test connecting to a socket
nc -U /run/php/php8-fpm.sock
```

---

## /proc/net - Reading Directly

When utilities are not available, data can be read directly:

```bash
# All TCP connections (hex format)
cat /proc/net/tcp
cat /proc/net/tcp6        # IPv6

# All UDP
cat /proc/net/udp
cat /proc/net/udp6

# Unix domain sockets
cat /proc/net/unix

# Socket statistics
cat /proc/net/sockstat

# Example /proc/net/tcp:
# sl  local_address rem_address   st tx_queue rx_queue
# 0: 00000000:0050 00000000:0000 0A 00000000:00000000  <- port 80 (0x50) LISTEN (0A)
# Addresses are little-endian hex, ports are hex

# Convert hex port to decimal
printf "%d\n" 0x0050      # 80
printf "%d\n" 0x01BB      # 443
```

---

## Cheat Sheet

```bash
# lsof
lsof -p PID                          # files of a process
lsof -u USER                         # files of a user
lsof /path/to/file                   # who holds the file open
lsof +D /path/to/dir                 # who is using a directory
lsof -i                              # all network connections
lsof -i :PORT                        # specific port
lsof -i TCP:PORT                     # TCP port
lsof -i -s TCP:LISTEN                # listening only
lsof -nP -i :PORT                    # no DNS resolution
lsof -ti :PORT                       # PID only for a port
lsof | grep deleted                  # deleted but open files
lsof -c COMMAND                      # by process name

# ss
ss -tlnp                             # TCP listening with processes
ss -ulnp                             # UDP listening
ss -tnp                              # TCP established with processes
ss -tunp                             # TCP + UDP with processes
ss -tanp                             # all TCP with processes
ss -s                                # summary statistics
ss -tnp dst HOST                     # connections to a host
ss -tnp dport = :PORT                # by destination port
ss -t state established              # ESTABLISHED only
ss -t state time-wait                # TIME-WAIT only
ss -tni                              # TCP internals (RTT, windows)

# netstat (legacy)
netstat -tlnp                        # TCP listening with processes
netstat -ulnp                        # UDP listening
netstat -tunp                        # TCP + UDP with processes
netstat -s                           # protocol statistics
netstat -rn                          # routing table
netstat -i                           # interfaces

# Common tasks
lsof -ti :80 | xargs kill            # kill process on port 80
ss -t state established | wc -l     # count active connections
lsof | grep deleted | awk '{print $7, $1, $2, $NF}' | sort -rn | head  # deleted files
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head  # top IPs
```

---

## References

- [lsof man page](https://man7.org/linux/man-pages/man8/lsof.8.html) - `man lsof`
- [ss man page](https://man7.org/linux/man-pages/man8/ss.8.html) - `man ss`
- [netstat man page](https://man7.org/linux/man-pages/man8/netstat.8.html) - `man netstat`
- [proc/net documentation](https://www.kernel.org/doc/html/latest/networking/proc_net_tcp.html) - /proc/net/tcp format
