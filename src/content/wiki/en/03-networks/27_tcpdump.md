---
title: "tcpdump - Packet Capture and Filtering"
date: "2026-05-07"
---

tcpdump is a command-line network traffic analyzer. It operates directly through libpcap with no GUI. Indispensable on servers, in scripts, and wherever Wireshark is unavailable.

- Pre-installed on most Linux/macOS systems
- Uses BPF (Berkeley Packet Filter) syntax - same as Wireshark Capture Filters
- .pcap files are compatible with Wireshark, tshark, Zeek

---

## Installation

```bash
# Ubuntu / Debian
apt install tcpdump

# RHEL / CentOS / Fedora
yum install tcpdump
dnf install tcpdump

# macOS (pre-installed, or via Homebrew)
brew install tcpdump

# Check version
tcpdump --version

# List available interfaces
tcpdump -D
# Output:
# 1.eth0 [Up, Running]
# 2.lo [Up, Running, Loopback]
# 3.any (Pseudo-device that captures on all interfaces)
```

### Permissions

```bash
# tcpdump requires root or CAP_NET_RAW
sudo tcpdump

# Grant capabilities without sudo
sudo setcap cap_net_raw,cap_net_admin+eip $(which tcpdump)
tcpdump    # now works without sudo

# Add user to group (Debian/Ubuntu)
sudo usermod -aG wireshark $USER
# tcpdump uses the same group as Wireshark
```

---

## Basic Syntax

```
tcpdump [options] [filter expression]

Key options:
  -i <iface>     - interface (-i eth0, -i any for all)
  -n             - don't resolve IP -> hostname
  -nn            - don't resolve IPs or ports to names
  -v             - verbose (more detail)
  -vv            - even more detail
  -vvv           - maximum detail
  -c <N>         - capture N packets then exit
  -w <file>      - write to .pcap file
  -r <file>      - read from .pcap file
  -A             - print payload in ASCII
  -X             - print payload in HEX + ASCII
  -XX            - print with Ethernet header
  -e             - show Ethernet headers (MAC addresses)
  -l             - line-buffered output (for real-time grep)
  -q             - quiet mode (less detail)
  -t             - no timestamps
  -tt            - Unix timestamp
  -ttt           - delta between packets
  -tttt          - date + time
  -s <snaplen>   - bytes to capture per packet (0 = full packet)
  -S             - absolute sequence numbers (not relative)
  -Z <user>      - drop privileges after opening the interface
```

---

## First Commands

```bash
# Capture all traffic on eth0
sudo tcpdump -i eth0

# Capture without name resolution (faster and cleaner)
sudo tcpdump -i eth0 -nn

# All interfaces at once
sudo tcpdump -i any -nn

# Only 10 packets then exit
sudo tcpdump -i eth0 -nn -c 10

# Verbose output
sudo tcpdump -i eth0 -nn -v

# Show payload in ASCII (HTTP, FTP...)
sudo tcpdump -i eth0 -nn -A

# Show payload in HEX + ASCII
sudo tcpdump -i eth0 -nn -X

# Example output:
# 12:34:56.789012 IP 192.168.1.10.54321 > 8.8.8.8.53: UDP, length 32
# │              │                                     │
# │              │                                     └── protocol, size
# │              └──────────────────────────────────────── src:port > dst:port
# └─────────────────────────────────────────────────────── timestamp
```

---

## Saving and Reading Files

```bash
# Write to pcap file
sudo tcpdump -i eth0 -nn -w capture.pcap

# Write with timestamp in filename
sudo tcpdump -i eth0 -nn -w "capture_$(date +%Y%m%d_%H%M%S).pcap"

# File rotation: new file every 100MB
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -C 100

# File rotation: new file every 60 seconds
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -G 60

# Ring buffer: keep only last 10 files
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -G 60 -W 10

# Read from file
tcpdump -r capture.pcap

# Read without name resolution
tcpdump -r capture.pcap -nn

# Read and apply filter
tcpdump -r capture.pcap -nn 'tcp port 80'

# Read with verbose output
tcpdump -r capture.pcap -nn -v

# Read and pipe to grep
tcpdump -r capture.pcap -nn -A -l | grep -i "user-agent"
```

---

## BPF Filters

### Host Filters

```bash
# Traffic to/from a specific host
tcpdump -i eth0 host 192.168.1.1

# Source only
tcpdump -i eth0 src host 192.168.1.1
tcpdump -i eth0 src 192.168.1.1         # shorthand

# Destination only
tcpdump -i eth0 dst host 8.8.8.8
tcpdump -i eth0 dst 8.8.8.8

# Subnet
tcpdump -i eth0 net 192.168.1.0/24
tcpdump -i eth0 src net 10.0.0.0/8

# Multiple hosts
tcpdump -i eth0 'host 192.168.1.1 or host 192.168.1.2'

# Exclude a host
tcpdump -i eth0 'not host 192.168.1.1'

# Exclude multiple hosts
tcpdump -i eth0 'not (host 192.168.1.1 or host 192.168.1.2)'
```

### Port Filters

```bash
# Specific port (src or dst)
tcpdump -i eth0 port 80
tcpdump -i eth0 port 443

# Destination port only / source port only
tcpdump -i eth0 dst port 80
tcpdump -i eth0 src port 80

# Multiple ports
tcpdump -i eth0 'port 80 or port 443'
tcpdump -i eth0 'port 80 or 443'           # shorthand

# Port range
tcpdump -i eth0 'portrange 8000-9000'

# Exclude port
tcpdump -i eth0 'not port 22'

# Exclude multiple ports
tcpdump -i eth0 'not port 22 and not port 53'
```

### Protocol Filters

```bash
# TCP / UDP / ICMP
tcpdump -i eth0 tcp
tcpdump -i eth0 udp
tcpdump -i eth0 icmp
tcpdump -i eth0 icmp6

# ARP
tcpdump -i eth0 arp

# IPv6
tcpdump -i eth0 ip6

# Specific IP protocol by number
tcpdump -i eth0 'ip proto 89'       # OSPF (protocol 89)
tcpdump -i eth0 'ip proto 47'       # GRE (protocol 47)
tcpdump -i eth0 'ip proto 50'       # ESP / IPsec

# VLAN
tcpdump -i eth0 vlan
tcpdump -i eth0 vlan 100            # specific VLAN ID
```

### Combining Filters

```bash
# TCP port 80 to a specific host
tcpdump -i eth0 'tcp port 80 and host 192.168.1.1'

# HTTP and HTTPS
tcpdump -i eth0 'tcp port 80 or tcp port 443'

# All traffic except SSH and DNS
tcpdump -i eth0 'not port 22 and not port 53'

# Inbound HTTP from a subnet
tcpdump -i eth0 'tcp dst port 80 and src net 10.0.0.0/8'

# Traffic between two specific hosts
tcpdump -i eth0 'host 192.168.1.1 and host 192.168.1.2'

# UDP DNS from a specific host
tcpdump -i eth0 'udp port 53 and src host 192.168.1.10'

# All traffic except loopback and broadcast
tcpdump -i eth0 'not dst host 255.255.255.255 and not src host 127.0.0.1'
```

---

## Advanced BPF Expressions

BPF lets you filter on arbitrary packet bytes: `proto[offset:size] operator value`

```bash
# Byte access syntax:
# proto[offset]         - 1 byte at offset
# proto[offset:2]       - 2 bytes (big-endian)
# proto[offset:4]       - 4 bytes

# TCP flags (offset 13 in TCP header)
# Bitmask: FIN=0x01, SYN=0x02, RST=0x04, PSH=0x08, ACK=0x10, URG=0x20

# SYN only (SYN=1, ACK=0)
tcpdump -i eth0 'tcp[13] == 0x02'
tcpdump -i eth0 'tcp[tcpflags] == tcp-syn'

# SYN-ACK
tcpdump -i eth0 'tcp[13] == 0x12'
tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-ack) == (tcp-syn|tcp-ack)'

# RST
tcpdump -i eth0 'tcp[13] & 0x04 != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-rst != 0'

# FIN
tcpdump -i eth0 'tcp[tcpflags] & tcp-fin != 0'

# PSH set
tcpdump -i eth0 'tcp[tcpflags] & tcp-push != 0'

# ICMP types by byte offset
# ICMP Type = first byte of ICMP header
tcpdump -i eth0 'icmp[0] == 8'    # Echo Request
tcpdump -i eth0 'icmp[0] == 0'    # Echo Reply
tcpdump -i eth0 'icmp[0] == 3'    # Destination Unreachable
tcpdump -i eth0 'icmp[0] == 11'   # Time Exceeded (traceroute)

# ICMP Type 3 Code 4 (Fragmentation Needed - PMTUD)
tcpdump -i eth0 'icmp[0] == 3 and icmp[1] == 4'

# Packets with low TTL < 5 (nearly expired)
tcpdump -i eth0 'ip[8] < 5'
# ip[8] = TTL field (offset 8 in IP header)

# Fragmented IP packets (MF bit set or non-zero fragment offset)
tcpdump -i eth0 '(ip[6:2] & 0x3fff) != 0'

# Packets with DF bit set (Don't Fragment)
tcpdump -i eth0 'ip[6:2] & 0x4000 != 0'

# Large IP packets
tcpdump -i eth0 'ip[2:2] > 1400'  # ip[2:2] = total length

# UDP packets with payload (length > 8 bytes header)
tcpdump -i eth0 'udp[4:2] > 8'   # udp[4:2] = UDP length field
```

### Named TCP Flags (cleaner syntax)

```bash
tcpdump -i eth0 'tcp[tcpflags] & tcp-syn != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-ack != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-rst != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-fin != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-push != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-urg != 0'

# SYN only (not SYN-ACK): SYN set, ACK not set
tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'
```

---

## Practical Examples

### HTTP Traffic

```bash
# Capture HTTP with payload
sudo tcpdump -i eth0 -nn -A 'tcp port 80'

# HTTP headers in real time
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | \
  grep -E 'GET|POST|Host:|User-Agent:|HTTP/'

# Only HTTP request lines
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | \
  grep -E '^(GET|POST|PUT|DELETE|HEAD) '

# Capture HTTP and log simultaneously
sudo tcpdump -i eth0 -nn -l 'tcp port 80' | tee http_log.txt

# HTTP on non-standard ports
sudo tcpdump -i eth0 -nn -A 'tcp port 8080 or tcp port 8443'
```

### DNS Traffic

```bash
# All DNS traffic
sudo tcpdump -i eth0 -nn 'udp port 53'

# DNS in verbose mode (shows query names)
sudo tcpdump -i eth0 -nn -v 'udp port 53'

# DNS over TCP (large responses / zone transfer)
sudo tcpdump -i eth0 -nn 'port 53'

# DNS query names via ASCII
sudo tcpdump -i eth0 -nn -A 'udp port 53' | grep -E '\.'

# Only DNS queries (QR bit = 0)
sudo tcpdump -i eth0 -nn 'udp port 53 and udp[10] & 0x80 == 0'

# Zone transfer attempt
sudo tcpdump -i eth0 -nn 'tcp port 53'
```

### SSH Traffic

```bash
# SSH connection attempts (SYN only)
sudo tcpdump -i eth0 -nn 'tcp dst port 22 and tcp[tcpflags] == tcp-syn'

# All SSH traffic
sudo tcpdump -i eth0 -nn 'tcp port 22'

# Exclude SSH from general capture (reduce noise)
sudo tcpdump -i eth0 -nn 'not port 22'
```

### ICMP / ping / traceroute

```bash
# All ICMP
sudo tcpdump -i eth0 -nn icmp

# ping only (Echo Request and Reply)
sudo tcpdump -i eth0 -nn 'icmp[0] == 8 or icmp[0] == 0'

# Echo Request only
sudo tcpdump -i eth0 -nn 'icmp[0] == 8'

# traceroute (ICMP Time Exceeded)
sudo tcpdump -i eth0 -nn 'icmp[0] == 11'

# Destination Unreachable
sudo tcpdump -i eth0 -nn 'icmp[0] == 3'

# ICMPv6
sudo tcpdump -i eth0 -nn icmp6
```

### ARP

```bash
# All ARP
sudo tcpdump -i eth0 -nn arp

# ARP requests only
sudo tcpdump -i eth0 -nn 'arp[6:2] == 1'

# ARP replies only
sudo tcpdump -i eth0 -nn 'arp[6:2] == 2'

# ARP from specific IP
sudo tcpdump -i eth0 -nn 'arp and src host 192.168.1.1'

# Gratuitous ARP (ARP spoofing detection) - show MAC addresses
sudo tcpdump -i eth0 -nn -e arp
```

### DHCP

```bash
# DHCP traffic (UDP 67 server, 68 client)
sudo tcpdump -i eth0 -nn 'udp port 67 or udp port 68'

# Verbose
sudo tcpdump -i eth0 -nn -v 'udp port 67 or udp port 68'
```

---

## Capture + grep Pipeline

```bash
# Show only URLs
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'GET\|POST\|Host:'

# Find passwords in FTP
sudo tcpdump -i eth0 -nn -A -l 'tcp port 21' | grep -i 'pass\|user'

# SMTP commands
sudo tcpdump -i eth0 -nn -A -l 'tcp port 25' | \
  grep -E '^(EHLO|HELO|MAIL|RCPT|DATA|QUIT)'

# User-Agent headers
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'User-Agent:'

# Cookie headers
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'Cookie:'

# Top talkers (src:port pairs, sorted by count)
sudo tcpdump -i eth0 -nn -l | \
  awk '{print $3, "->", $5}' | sort | uniq -c | sort -rn | head -20

# Top source IPs
sudo tcpdump -i eth0 -nn -l -q | \
  awk '{print $3}' | cut -d. -f1-4 | \
  sort | uniq -c | sort -rn | head -10
```

---

## Network Diagnostics

```bash
# Verify packets are reaching the interface
sudo tcpdump -i eth0 -nn -c 5 'host 8.8.8.8'

# Analyze TCP handshake with absolute seq numbers
sudo tcpdump -i eth0 -nn -S 'host 192.168.1.1 and tcp port 80'

# Find RST packets (rejected connections)
sudo tcpdump -i eth0 -nn 'tcp[tcpflags] & tcp-rst != 0'

# Find SYN without response (firewall / packet loss)
sudo tcpdump -i eth0 -nn 'tcp[tcpflags] == tcp-syn'

# Monitor timing gaps between packets
sudo tcpdump -i eth0 -nn -ttt 'host 8.8.8.8'
# -ttt shows time delta from previous packet

# Capture packets with very high TTL (potential spoofing)
sudo tcpdump -i eth0 -nn 'ip[8] > 200'

# PMTUD diagnostics (Fragmentation Needed)
sudo tcpdump -i eth0 -nn 'icmp[0] == 3 and icmp[1] == 4' -v

# Capture fragmented packets
sudo tcpdump -i eth0 -nn '(ip[6:2] & 0x3fff) != 0'

# Non-standard protocols
sudo tcpdump -i eth0 -nn 'ip proto 47'    # GRE tunnels
sudo tcpdump -i eth0 -nn 'ip proto 50'    # IPsec ESP
sudo tcpdump -i eth0 -nn 'ip proto 51'    # IPsec AH
```

---

## Remote Capture -> Wireshark

```bash
# Option 1: SSH + pipe to Wireshark (live)
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22' | \
  wireshark -k -i -

# Option 2: SSH + compression (faster on slow links)
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22 | gzip -1' | \
  gunzip | wireshark -k -i -

# Option 3: capture on server, copy, then analyze
ssh user@remote 'sudo tcpdump -i eth0 -nn -c 10000 -w /tmp/cap.pcap not port 22'
scp user@remote:/tmp/cap.pcap ./
wireshark cap.pcap

# Option 4: via named pipe
mkfifo /tmp/remote.fifo
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22' > /tmp/remote.fifo &
wireshark -k -i /tmp/remote.fifo
```

---

## Real-Time Monitoring

```bash
# Continuous traffic log with timestamps
sudo tcpdump -i eth0 -nn -tttt -l | tee /var/log/traffic.log

# Live DNS queries with timestamps
sudo tcpdump -i eth0 -nn -tttt -l 'udp port 53' | \
  awk '{print $1, $2, $5, $NF}'

# Alert on potential SYN flood
#!/bin/bash
sudo tcpdump -i eth0 -nn -l 'tcp[tcpflags] == tcp-syn' 2>/dev/null | \
while read line; do
  IP=$(echo $line | awk '{print $3}' | cut -d. -f1-4)
  echo "SYN from: $IP at $(date)"
done
```

---

## Useful One-Liners

```bash
# Top 10 hosts by packet count (1000 packets sample)
sudo tcpdump -i eth0 -nn -c 1000 -q 2>/dev/null | \
  awk '{print $3}' | cut -d. -f1-4 | \
  sort | uniq -c | sort -rn | head -10

# All unique source IPs
sudo tcpdump -i eth0 -nn -c 500 2>/dev/null | \
  awk '{print $3}' | cut -d. -f1-4 | sort -u

# Live DNS queries with domain names
sudo tcpdump -i eth0 -nn -tttt 'udp port 53' 2>/dev/null

# Pipe to tshark for richer field output
sudo tcpdump -i eth0 -nn -w - 2>/dev/null | \
  tshark -r - -T fields -e ip.src -e ip.dst -e tcp.dstport

# Monitor HTTPS by SNI (via tshark)
sudo tcpdump -i eth0 -nn -w - 'tcp port 443' 2>/dev/null | \
  tshark -r - -Y 'tls.handshake.type == 1' \
  -T fields -e ip.src -e tls.handshake.extensions_server_name

# Quick packet count in a pcap
tcpdump -r capture.pcap -nn -q | wc -l

# Extract HTTP Host headers from pcap
tcpdump -r capture.pcap -nn -A 'tcp port 80' | \
  grep '^Host:' | sort | uniq -c | sort -rn
```

---

## Working with pcap Files

```bash
# Merge multiple pcap files
mergecap -w combined.pcap file1.pcap file2.pcap file3.pcap

# Split by time interval (every 60 seconds)
editcap -i 60 big.pcap chunk.pcap

# Split by packet count (10000 per file)
editcap -c 10000 big.pcap chunk.pcap

# Cut a time range
editcap -A "2026-05-06 10:00:00" -B "2026-05-06 10:05:00" \
  big.pcap slice.pcap

# Remove duplicate packets
editcap -d big.pcap deduped.pcap

# Convert pcap to pcapng
editcap -F pcapng capture.pcap capture.pcapng

# Filter with BPF and save to new file
tcpdump -r big.pcap -nn -w filtered.pcap 'tcp port 80'

# Show pcap file statistics
capinfos capture.pcap
# Shows: size, packet count, duration, bitrate
```

---

## tcpdump vs Wireshark

```
Criteria             tcpdump                     Wireshark
--------------       ---------------------       ------------------------
Interface            Command line                Graphical
Run on servers       Yes (everywhere)            No (needs X11/VNC)
Speed                High                        Lower (GUI overhead)
Scripting            Easy (pipe, grep, awk)      tshark for scripts
Protocol analysis    Basic                       Deep (dissectors)
Capture filters      BPF                         BPF
Analysis filters     BPF (limited)               Display Filters (powerful)
Payload search       grep + -A                   Contains / matches
Follow Stream        No                          Yes
TLS decryption       No                          Yes (SSLKEYLOGFILE)
Graphs               No                          IO Graph, Stream Graph
Output formats       Text / pcap                 pcap / pcapng / JSON / CSV
```

---

## Cheat Sheet

```
Key options:
  -i eth0      - interface
  -i any       - all interfaces
  -nn          - no name resolution (always use this!)
  -v / -vv     - more detail
  -c N         - N packets then stop
  -w file      - write to pcap
  -r file      - read from pcap
  -A           - payload in ASCII
  -X           - payload hex+ASCII
  -e           - show MAC addresses
  -S           - absolute seq numbers
  -ttt         - time delta between packets
  -tttt        - full date and time

Host filters:
  host X.X.X.X          - any traffic to/from
  src X.X.X.X           - source only
  dst X.X.X.X           - destination only
  net X.X.X.X/24        - subnet
  not host X.X.X.X      - exclude host

Port filters:
  port 80               - TCP or UDP port
  tcp port 443          - protocol + port
  dst port 80           - destination only
  portrange 8000-9000   - range
  not port 22           - exclude port

Protocols:
  tcp / udp / icmp / arp / ip6 / vlan

TCP flags:
  tcp[13] == 0x02                          - SYN
  tcp[13] == 0x12                          - SYN-ACK
  tcp[13] & 0x04 != 0                      - RST
  tcp[tcpflags] & tcp-syn != 0             - SYN (named)

ICMP types:
  icmp[0] == 8          - Echo Request
  icmp[0] == 0          - Echo Reply
  icmp[0] == 3          - Unreachable
  icmp[0] == 11         - Time Exceeded

Logic:
  A and B               - both conditions
  A or B                - either condition
  not A                 - negation
  (A or B) and C        - grouping with parentheses

Remote capture in Wireshark:
  ssh user@host 'sudo tcpdump -i eth0 -w - not port 22' | wireshark -k -i -
```

---

## References

- [tcpdump man page](https://www.tcpdump.org/manpages/tcpdump.1.html) - official docs
- [BPF Filter Syntax](https://www.tcpdump.org/manpages/pcap-filter.7.html) - filter syntax reference
- [tcpdump Tutorial (Danielmiessler)](https://danielmiessler.com/p/tcpdump/) - great practical guide
- [Wireshark Capture Filters](https://wiki.wireshark.org/CaptureFilters) - more BPF examples
- [capinfos man page](https://www.wireshark.org/docs/man-pages/capinfos.html) - pcap file statistics
- [editcap man page](https://www.wireshark.org/docs/man-pages/editcap.html) - pcap file manipulation
