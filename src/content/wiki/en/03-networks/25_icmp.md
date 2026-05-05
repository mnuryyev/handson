---
title: "ICMP - Message Types, traceroute, ping"
date: "2026-05-05"
---

ICMP (Internet Control Message Protocol) is a helper protocol at the network layer (L3). It does not carry user data - it reports delivery errors and is used for network diagnostics.

- RFC 792 (ICMPv4)
- RFC 4443 (ICMPv6)
- Encapsulated directly inside an IP packet (protocol number 1)
- Has no ports - operates at the IP level

---

## ICMP Packet Structure

```
IP header (20 bytes)
└── ICMP message
    ├── Type     (1 byte)  - message type
    ├── Code     (1 byte)  - subtype / detail
    ├── Checksum (2 bytes) - ICMP checksum
    └── Data     (variable) - depends on type

For error messages, Data contains:
├── IP header of the original packet (20 bytes)
└── First 8 bytes of the original packet's data
    (this is the TCP/UDP header - src/dst ports, seq)
```

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
├───────────────────┬───────────────────┬────────────────────────┤
│      Type         │      Code         │       Checksum         │
├───────────────────────────────────────┴────────────────────────┤
│                        Rest of Header                          │
│                      (depends on Type/Code)                    │
├────────────────────────────────────────────────────────────────┤
│                          Data (payload)                        │
│               (for errors: IP hdr + 8 bytes of data)          │
└────────────────────────────────────────────────────────────────┘
```

---

## ICMPv4 Message Types

| Type | Code | Name | Description |
| --- | --- | --- | --- |
| 0 | 0 | Echo Reply | Response to ping |
| 3 | 0 | Net Unreachable | No route to network |
| 3 | 1 | Host Unreachable | Host is down or unreachable |
| 3 | 2 | Protocol Unreachable | Protocol not supported |
| 3 | 3 | Port Unreachable | UDP port is closed |
| 3 | 4 | Fragmentation Needed | Fragmentation needed but DF is set |
| 3 | 5 | Source Route Failed | Source routing failed |
| 3 | 9 | Net Admin Prohibited | Network blocked by admin |
| 3 | 10 | Host Admin Prohibited | Host blocked by admin |
| 3 | 13 | Communication Prohibited | Filtered by firewall |
| 4 | 0 | Source Quench | Slow down (deprecated, RFC 6633) |
| 5 | 0 | Redirect for Net | Redirect for network |
| 5 | 1 | Redirect for Host | Redirect for host |
| 8 | 0 | Echo Request | Ping request |
| 9 | 0 | Router Advertisement | Router announces itself |
| 10 | 0 | Router Solicitation | Host looks for routers |
| 11 | 0 | TTL Exceeded in Transit | TTL reached 0 in transit (traceroute!) |
| 11 | 1 | Fragment Reassembly Time Exceeded | Fragment reassembly timeout |
| 12 | 0 | Pointer Indicates Error | IP header error |
| 13 | 0 | Timestamp Request | Request timestamp |
| 14 | 0 | Timestamp Reply | Timestamp response |
| 30 | 0 | Traceroute | Traceroute info (deprecated) |

---

## Type 8 / 0 - Echo Request / Echo Reply (ping)

### Echo Packet Structure

```
ICMP Echo Request (Type=8, Code=0):
├── Type:       8
├── Code:       0
├── Checksum:   checksum
├── Identifier: process ID (to differentiate parallel pings)
├── Sequence:   sequence number (increments per packet)
└── Data:       arbitrary payload (often a timestamp by default)

ICMP Echo Reply (Type=0, Code=0):
- Same structure, same Identifier and Sequence
- Source and destination are swapped
```

### How ping Works

```
Sender                               Receiver
    │                                    │
    │── ICMP Echo Request (seq=1) ──────►│
    │◄─ ICMP Echo Reply   (seq=1) ───────│  RTT measured here
    │                                    │
    │── ICMP Echo Request (seq=2) ──────►│
    │◄─ ICMP Echo Reply   (seq=2) ───────│
    │                                    │
    │── ICMP Echo Request (seq=3) ──────►│  no reply = packet loss
    │                                    │
    │── ICMP Echo Request (seq=4) ──────►│
    │◄─ ICMP Echo Reply   (seq=4) ───────│

RTT (Round-Trip Time) = time from sending Request to receiving Reply
```

### The ping Command

```bash
# Basic ping
ping 8.8.8.8

# Limit number of packets
ping -c 4 8.8.8.8

# Change packet size (payload, bytes)
ping -s 1400 8.8.8.8           # large packet (MTU test)
ping -s 65507 8.8.8.8          # max IPv4 ICMP packet

# Set TTL
ping --ttl 64 8.8.8.8          # Linux
ping -t 64 8.8.8.8             # macOS

# Interval between packets (seconds)
ping -i 0.2 8.8.8.8            # fast (200ms)
ping -i 5 8.8.8.8              # slow (5 sec)

# Flood ping (requires root, use carefully!)
ping -f 8.8.8.8                # as fast as possible

# Set DF bit (don't fragment)
ping -M do -s 1472 8.8.8.8     # Linux, PMTUD test

# IPv6
ping6 ::1
ping -6 google.com

# No DNS resolution (IP only)
ping -n 8.8.8.8

# ping output:
# PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
# 64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms
# 64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=11.9 ms
#
# --- 8.8.8.8 ping statistics ---
# 4 packets transmitted, 4 received, 0% packet loss, time 3004ms
# rtt min/avg/max/mdev = 11.9/12.1/12.3/0.15 ms
```

### Reading ping Output

```
64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms
│                       │         │        │
│                       │         │        └── RTT (round-trip time)
│                       │         └─────────── TTL remaining in reply
│                       └───────────────────── sequence number
└───────────────────────────────────────────── reply size

TTL in reply - estimate number of hops:
Initial TTL is usually 64, 128, or 255
If reply ttl=118 -> initial was 128, traversed 10 hops
If reply ttl=54  -> initial was 64, traversed 10 hops

Packet loss:
0%      - perfect
< 1%    - normal in wireless networks
1-5%    - there's a problem
> 5%    - serious problem

Jitter (mdev - mean deviation):
< 1ms   - excellent (data center)
1-5ms   - good
> 10ms  - bad for VoIP/gaming
```

---

## Type 3 - Destination Unreachable

Generated by a router or host when a packet cannot be delivered.

```
The receiver of the error message is the SENDER of the original packet.
Data contains: IP header + first 8 bytes of the original packet.
```

### Type 3 Code Breakdown

```
Code 0 - Net Unreachable
  Router has no route to the destination network.
  "No matching entry in the routing table"

Code 1 - Host Unreachable
  Router knows the network but can't reach the host.
  "ARP not responding, host is down"

Code 2 - Protocol Unreachable
  Host received the packet but doesn't support the specified protocol.
  IP header: Protocol=253 but nothing handles it

Code 3 - Port Unreachable
  Host received a UDP packet but nothing is listening on that port.
  Note: for TCP this is RST, not ICMP!
  Used in DNS/UDP: if port is closed -> ICMP Port Unreachable

Code 4 - Fragmentation Needed and DF Set
  Packet needs to be fragmented but DF (Don't Fragment) bit is set.
  Contains the MTU of the next link (used by PMTUD).

  IP Header: Flags DF=1
  ┌──────┬──────┬─────────┐
  │ Res  │  DF  │   MF    │
  │  0   │  1   │    0    │
  └──────┴──────┴─────────┘

Code 9/10 - Administratively Prohibited
  Packet blocked by a firewall or ACL.
  Firewall may send this instead of silently dropping.

Code 13 - Communication Administratively Prohibited
  Similar to 9/10, often from a stateful firewall.
```

### Example: Port Unreachable in UDP Scanning

```bash
# nmap uses ICMP Port Unreachable to identify closed UDP ports
nmap -sU -p 53,161,500 192.168.1.1

# Capture ICMP errors
tcpdump -i eth0 'icmp and icmp[0] == 3'

# Responses:
# ICMP type=3 code=3 -> Port Unreachable (UDP port closed)
# ICMP type=3 code=9 -> Administratively Prohibited (firewall)
# No response        -> port is filtered or open
```

---

## Type 11 - Time Exceeded (the backbone of traceroute)

```
Code 0 - TTL Exceeded in Transit
  Router received a packet with TTL=1, decremented to 0, dropped it.
  Sends ICMP Time Exceeded back to the source.
  Contains its own IP address -> source learns the router's address.

Code 1 - Fragment Reassembly Time Exceeded
  Host failed to reassemble a fragmented packet within the time limit.
  Fragments arrive late or not at all.
```

---

## Type 5 - Redirect

```
A router sends Redirect when it knows a better path for the host.

Scenario:
- Host A (192.168.1.10) sends a packet to router R1
- R1 sees: the better path is via R2, which is on the same subnet as A
- R1 forwards the packet to R2 AND sends a Redirect to host A
- A updates its routing cache: "for X.X.X.X go via R2"

Codes:
Code 0 - Redirect for Network
Code 1 - Redirect for Host
Code 2 - Redirect for Type of Service and Network
Code 3 - Redirect for Type of Service and Host

Security: ICMP Redirect can be used for attacks!
Many OSes ignore ICMP Redirects by default:
  sysctl net.ipv4.conf.all.accept_redirects   # 0 = ignore
```

---

## Type 4 - Source Quench (deprecated)

```
Routers used this to ask the sender to slow down.
Deprecated and removed in RFC 6633 (2012).
Modern congestion control: ECN, TCP congestion control.
```

---

## Path MTU Discovery (PMTUD)

PMTUD uses ICMP Type 3 Code 4 to discover the minimum MTU along a path.

```
PMTUD process:

Sender                         Router R2              Receiver
(MTU=1500)                   (MTU=576)
    │                              │                      │
    │── IP packet 1500, DF=1 ─────►│                      │
    │                              │ link MTU = 576        │
    │                              │ can't fragment (DF=1) │
    │◄── ICMP Type 3 Code 4 ───────│                      │
    │    "Fragmentation needed"    │                      │
    │    "Next-hop MTU = 576"      │                      │
    │                              │                      │
    │── IP packet 576, DF=1 ──────►│─────────────────────►│
    │                              │                      │

PMTUD Black Hole problem:
If a router blocks ICMP Type 3 Code 4 -> sender never learns the MTU.
Packets are silently dropped. Connection "hangs" or is slow.

Diagnosing PMTUD:
ping -M do -s 1472 8.8.8.8        # Linux, DF=1, size 1472+28=1500
ping -M do -s 1400 8.8.8.8        # reduce if no reply

# Find path MTU
for size in 1472 1400 1300 1200; do
  result=$(ping -M do -s $size -c 1 8.8.8.8 2>&1)
  if echo "$result" | grep -q "1 received"; then
    echo "MTU OK: $((size + 28))"
    break
  else
    echo "MTU $((size + 28)) - fragmentation needed"
  fi
done
```

---

## traceroute - How It Works

### traceroute Principle

```
traceroute uses ICMP TTL Exceeded to discover each hop.

The sender sends packets with TTL=1, TTL=2, TTL=3...

TTL=1:
Sender ──── TTL=1 ────► R1 (TTL becomes 0)
            ◄─── ICMP Time Exceeded (from R1) ───
            We learned R1's address!

TTL=2:
Sender ──── TTL=2 ────► R1 ──── TTL=1 ────► R2 (TTL becomes 0)
            ◄─────────── ICMP Time Exceeded (from R2) ───────────
            We learned R2's address!

TTL=3:
Sender ──── TTL=3 ────► R1 ──► R2 ──── TTL=1 ────► R3 (TTL=0)
            ◄──────────────── ICMP Time Exceeded (from R3) ─────
            We learned R3's address!

...continues until the destination is reached...

TTL=N:
Packet reaches the destination.
Destination replies with Echo Reply (or Port Unreachable for UDP traceroute).
Trace complete.
```

### traceroute Implementations

```
Different OSes and tools use different protocols:

Linux traceroute (default):
  UDP packets to port 33434+ with incrementing TTL
  Destination replies with ICMP Port Unreachable (type 3, code 3)

Windows tracert:
  ICMP Echo Request with incrementing TTL
  Destination replies with ICMP Echo Reply

macOS traceroute:
  UDP (same as Linux) by default

traceroute -I (Linux):
  ICMP Echo Request (same as Windows tracert)

traceroute -T -p 80 (Linux):
  TCP SYN packets - bypasses ICMP filters!
  Destination replies with TCP SYN-ACK or RST

Comparison:
┌────────────────┬────────────────┬───────────────────────────┐
│ Method         │ Protocol       │ When to use               │
├────────────────┼────────────────┼───────────────────────────┤
│ traceroute     │ UDP            │ Linux default             │
│ tracert        │ ICMP           │ Windows                   │
│ traceroute -I  │ ICMP           │ Linux, same as tracert    │
│ traceroute -T  │ TCP            │ Bypass ICMP blocks        │
│ mtr            │ ICMP/UDP       │ Interactive, best option  │
└────────────────┴────────────────┴───────────────────────────┘
```

### traceroute Commands

```bash
# Basic traceroute (UDP)
traceroute 8.8.8.8

# ICMP mode (like tracert)
traceroute -I 8.8.8.8

# TCP mode (bypasses ICMP filters)
traceroute -T -p 443 8.8.8.8

# Set max hops
traceroute -m 30 8.8.8.8

# No DNS resolution (faster)
traceroute -n 8.8.8.8

# Number of probes per hop (default 3)
traceroute -q 5 8.8.8.8

# Packet size
traceroute -s 1400 8.8.8.8 -N 1

# IPv6
traceroute6 2001:4860:4860::8888
traceroute -6 google.com

# Windows
tracert 8.8.8.8
tracert -d 8.8.8.8                    # no DNS resolution
tracert -h 30 8.8.8.8                 # max hops
```

### Reading traceroute Output

```bash
traceroute 8.8.8.8
# traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
#  1  192.168.1.1 (192.168.1.1)      1.234 ms  1.198 ms  1.176 ms
#  2  10.0.0.1 (10.0.0.1)            5.432 ms  5.411 ms  5.390 ms
#  3  * * *
#  4  72.14.215.165 (72.14.215.165)  12.3 ms  12.1 ms  12.4 ms
#  5  8.8.8.8 (8.8.8.8)             13.2 ms  13.0 ms  13.1 ms

# Columns:
# Hop | IP address (hostname) | RTT probe 1 | RTT probe 2 | RTT probe 3

# * * * means:
# - Router doesn't respond to ICMP (firewall)
# - Router responds but blocks ICMP Time Exceeded outbound
# - Router de-prioritizes ICMP (rate limiting)
# - Packet was lost

# Asymmetric routing:
# Hops may differ between probes (3 probes may follow different paths)

# Sudden RTT spike at a hop:
# May indicate a slow link or congestion
# BUT: intermediate hops may de-prioritize ICMP
#      -> high RTT at hop, normal RTT to destination = not a real problem
```

### mtr - The Best Traceroute Tool

```bash
# Install
apt install mtr

# Interactive mode
mtr 8.8.8.8

# Report mode (non-interactive)
mtr -r -c 100 8.8.8.8              # 100 packets, print report

# No DNS resolution
mtr -n 8.8.8.8

# TCP mode
mtr -T -P 443 8.8.8.8

# JSON output
mtr -r -j 8.8.8.8

# mtr output:
# Host                    Loss%   Snt   Last   Avg  Best  Wrst StDev
# 1. 192.168.1.1           0.0%   100    1.2   1.3   1.1   2.1   0.2
# 2. 10.0.0.1              0.0%   100    5.4   5.3   5.1   6.2   0.3
# 3. ???                  100.0%  100    0.0   0.0   0.0   0.0   0.0
# 4. 72.14.215.165         0.0%   100   12.3  12.1  11.9  13.2   0.4
# 5. 8.8.8.8               0.0%   100   13.1  13.0  12.8  13.5   0.3

# Loss% - packet loss percentage
# Snt   - packets sent
# Last  - RTT of last packet
# Avg   - average RTT
# Best  - minimum RTT
# Wrst  - maximum RTT
# StDev - standard deviation (jitter)
```

---

## ICMPv6 - ICMP for IPv6

ICMPv6 is significantly expanded compared to ICMPv4. It takes over the functions of ARP and DHCP from IPv4.

### ICMPv6 Types

| Type | Name | Description |
| --- | --- | --- |
| 1 | Destination Unreachable | ICMPv4 Type 3 equivalent |
| 2 | Packet Too Big | ICMPv4 Type 3 Code 4 (PMTUD) |
| 3 | Time Exceeded | ICMPv4 Type 11 (traceroute) |
| 4 | Parameter Problem | Header error |
| 128 | Echo Request | ICMPv4 Type 8 (ping6) |
| 129 | Echo Reply | ICMPv4 Type 0 |
| 133 | Router Solicitation | NDP: host looks for routers |
| 134 | Router Advertisement | NDP: router announces itself |
| 135 | Neighbor Solicitation | NDP: like ARP Request |
| 136 | Neighbor Advertisement | NDP: like ARP Reply |
| 137 | Redirect | ICMPv4 Type 5 equivalent |
| 143 | MLD Report v2 | Multicast Listener Discovery |

### NDP - Neighbor Discovery Protocol

```
NDP replaces ARP in IPv6, using ICMPv6:

Instead of ARP Request/Reply:
  Neighbor Solicitation (Type 135)  = ARP Request
  Neighbor Advertisement (Type 136) = ARP Reply

Multicast instead of broadcast:
  ARP: FF:FF:FF:FF:FF:FF (broadcast)
  NDP: solicited-node multicast FF02::1:FF<last 3 bytes>

Example:
  Host is looking for the MAC for IPv6 address 2001:db8::1
  Solicited-node multicast: FF02::1:FF00:0001
  Multicast MAC: 33:33:FF:00:00:01

# IPv6 neighbor table (like ARP table)
ip -6 neigh show

# Capture NDP traffic
tcpdump -i eth0 icmp6

# ping6
ping6 fe80::1%eth0                   # link-local requires interface
ping6 2001:4860:4860::8888
```

---

## ICMP and Security

### ICMP in Penetration Testing

```bash
# Discover live hosts with ping sweep
# nmap
nmap -sn 192.168.1.0/24              # ping scan (ICMP + TCP ACK)
nmap -PE 192.168.1.0/24              # ICMP Echo only
nmap -PP 192.168.1.0/24              # ICMP Timestamp
nmap -PM 192.168.1.0/24              # ICMP Address Mask

# fping - parallel ping
fping -a -g 192.168.1.0/24 2>/dev/null

# OS fingerprinting by TTL in reply:
# TTL 64   -> Linux/macOS/FreeBSD
# TTL 128  -> Windows
# TTL 255  -> Cisco IOS, Solaris
# (approximate - depends on number of hops)
```

### ICMP Attacks

```
1. ICMP Flood (Ping Flood)
   Sending a massive number of Echo Requests.
   DDoS attack that saturates the link or CPU of the target.
   Defense: ICMP rate limiting, null-routing the source.

2. Smurf Attack (historical)
   Sending Echo Request to broadcast address with spoofed src IP (victim).
   All hosts in the network reply to the victim.
   Defense: disable responding to broadcast pings (sysctl).

3. Ping of Death (historical)
   Sending an oversized ICMP packet (> 65535 bytes after reassembly).
   Caused buffer overflow on old OSes.
   Long since patched.

4. ICMP Redirect Attack
   Attacker sends a forged ICMP Redirect.
   Redirects victim's traffic through the attacker (MITM).
   Defense: disable accept_redirects.

5. ICMP Tunneling
   Encapsulating data inside ICMP Echo payload.
   Bypasses firewalls that allow ping but block TCP/UDP.
   Tools: icmptunnel, ptunnel, hans.

6. Covert Channel via ICMP
   Transmitting data in ICMP packet payload.
   Used by malware for C2 communications.
```

### ICMP Filtering and Hardening

```bash
# Sysctl security settings
# Disable responding to broadcast pings (anti-Smurf)
sysctl -w net.ipv4.icmp_echo_ignore_broadcasts=1

# Ignore ICMP Redirects
sysctl -w net.ipv4.conf.all.accept_redirects=0
sysctl -w net.ipv4.conf.all.send_redirects=0

# Rate limiting ICMP (already in Linux kernel)
sysctl -w net.ipv4.icmp_ratelimit=1000          # 1000ms between errors
sysctl -w net.ipv4.icmp_ratemask=6168           # which types to rate-limit

# iptables ICMP filtering
# Allow only required types
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p icmp --icmp-type destination-unreachable -j ACCEPT
iptables -A INPUT -p icmp --icmp-type time-exceeded -j ACCEPT
iptables -A INPUT -p icmp -j DROP               # drop everything else

# Rate limit ping (max 10/sec)
iptables -A INPUT -p icmp --icmp-type echo-request \
  -m limit --limit 10/second --limit-burst 20 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j DROP

# Important: do NOT block ICMP completely!
# ICMP Type 3 Code 4 is needed for PMTUD
# ICMP Time Exceeded is needed for traceroute
# Blocking ICMP breaks PMTUD -> MTU/connectivity issues
```

---

## Capturing and Analyzing ICMP

```bash
# tcpdump
tcpdump -i eth0 icmp                            # all ICMP traffic
tcpdump -i eth0 icmp and host 8.8.8.8          # from/to specific host
tcpdump -i eth0 'icmp[0] == 8'                 # Echo Request only
tcpdump -i eth0 'icmp[0] == 0'                 # Echo Reply only
tcpdump -i eth0 'icmp[0] == 3'                 # Unreachable only
tcpdump -i eth0 'icmp[0] == 11'                # Time Exceeded only
tcpdump -i eth0 'icmp[0] == 3 and icmp[1] == 4' # Fragmentation Needed

# Show packet contents
tcpdump -i eth0 icmp -X -v

# Wireshark filters
# icmp                     - all ICMP
# icmp.type == 8           - Echo Request
# icmp.type == 3           - Destination Unreachable
# icmp.type == 11          - Time Exceeded
# icmp.code == 3           - Port Unreachable
# icmpv6                   - ICMPv6 traffic

# hping3 - advanced ping/ICMP generator
hping3 -1 8.8.8.8                              # ICMP ping
hping3 -1 --icmptype 13 8.8.8.8               # ICMP Timestamp Request
hping3 -1 -d 1000 --flood 8.8.8.8             # ICMP flood test
hping3 -S -p 80 8.8.8.8                       # TCP SYN (not ICMP)
```

---

## Network Diagnostics with ICMP

```bash
# Full connectivity check
# 1. Check local interface
ping -c 1 127.0.0.1                            # loopback
ping -c 1 192.168.1.10                         # own IP

# 2. Check gateway
ping -c 3 192.168.1.1                          # default gateway

# 3. Check DNS
ping -c 3 8.8.8.8                              # by IP (no DNS)
ping -c 3 google.com                           # with DNS resolution

# 4. Trace the path
traceroute -n 8.8.8.8                         # no DNS (faster)
mtr -r -n -c 50 8.8.8.8                       # stats over 50 packets

# 5. MTU diagnostics
ping -M do -s 1472 8.8.8.8                    # standard Ethernet MTU
ping -M do -s 1452 8.8.8.8                    # PPPoE (MTU 1492)
ping -M do -s 1400 8.8.8.8                    # VPN (MTU ~1450)

# 6. Check packet loss
ping -c 100 -i 0.1 8.8.8.8 | tail -2          # 100 fast pings

# Availability monitoring script
#!/bin/bash
TARGET="8.8.8.8"
while true; do
  if ping -c 1 -W 1 $TARGET > /dev/null 2>&1; then
    echo "$(date): $TARGET - OK"
  else
    echo "$(date): $TARGET - UNREACHABLE!"
  fi
  sleep 5
done
```

---

## Cheat Sheet

```
Key ICMPv4 types:
Type 0  Code 0   - Echo Reply (ping response)
Type 3  Code 0   - Network Unreachable
Type 3  Code 1   - Host Unreachable
Type 3  Code 3   - Port Unreachable (UDP)
Type 3  Code 4   - Fragmentation Needed (PMTUD)
Type 3  Code 13  - Communication Prohibited (firewall)
Type 5  Code 1   - Redirect for Host
Type 8  Code 0   - Echo Request (ping)
Type 11 Code 0   - TTL Exceeded (traceroute)
Type 11 Code 1   - Fragment Reassembly Timeout

traceroute principle:
- Sends packets with TTL=1, 2, 3...
- Each router at TTL=0 replies with ICMP Time Exceeded
- Source learns the IP of each hop
- Linux: UDP by default | Windows: ICMP | traceroute -T: TCP

ping commands:
  ping -c 4 IP          - 4 packets
  ping -s 1400 IP       - packet size
  ping -M do -s 1472 IP - MTU test (DF=1)
  ping -i 0.2 IP        - 200ms interval
  ping -f IP            - flood (root)

ICMPv6 key types:
Type 2   - Packet Too Big (PMTUD)
Type 3   - Time Exceeded (traceroute)
Type 128 - Echo Request (ping6)
Type 129 - Echo Reply
Type 135 - Neighbor Solicitation (= ARP Request)
Type 136 - Neighbor Advertisement (= ARP Reply)
Type 133 - Router Solicitation
Type 134 - Router Advertisement

Security sysctl:
net.ipv4.icmp_echo_ignore_broadcasts=1    - anti-Smurf
net.ipv4.conf.all.accept_redirects=0      - disable ICMP Redirect
net.ipv4.icmp_ratelimit=1000              - error rate limiting
```

---

## References

- [RFC 792](https://www.rfc-editor.org/rfc/rfc792) - ICMPv4
- [RFC 4443](https://www.rfc-editor.org/rfc/rfc4443) - ICMPv6
- [RFC 1191](https://www.rfc-editor.org/rfc/rfc1191) - Path MTU Discovery
- [RFC 4821](https://www.rfc-editor.org/rfc/rfc4821) - PMTUD for TCP (without ICMP)
- [RFC 6633](https://www.rfc-editor.org/rfc/rfc6633) - Deprecation of ICMP Source Quench
- [IANA ICMP types](https://www.iana.org/assignments/icmp-parameters/icmp-parameters.xhtml) - complete list
- [Wireshark ICMP](https://wiki.wireshark.org/ICMP) - ICMP analysis in Wireshark
