---
title: "UDP - protocol, features, use cases"
date: "2026-04-25"
---

UDP (User Datagram Protocol) - a connectionless transport protocol with no delivery guarantees and no ordering. Defined in RFC 768 (1980). Core principle: fire and forget.

---

## Core properties of UDP

```
UDP guarantees:
Sending the datagram into the network
Checksum (optional, but enabled by default)
Message boundaries (one send = one datagram)

UDP does NOT guarantee:
Delivery (packet may be lost)
Order (packets may arrive in any order)
No duplicates (a packet may arrive twice)
Congestion control (can flood the network)
```

### UDP vs TCP

| Property | UDP | TCP |
| --- | --- | --- |
| Connection setup | None | 3-way handshake |
| Delivery guarantee | No | Yes |
| Packet ordering | Not guaranteed | Guaranteed |
| Speed | Higher | Lower |
| Header overhead | 8 bytes | 20-60 bytes |
| Buffering | No | Yes |
| Message boundaries | Preserved | Not preserved (byte stream) |
| Multicast / Broadcast | Yes | No |
| Congestion control | No | Yes |

---

## UDP Header

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 bits            │           16 bits            │
├──────────────────────────────┼──────────────────────────────┤
│            Length            │           Checksum           │
│           16 bits            │           16 bits            │
└──────────────────────────────┴──────────────────────────────┘
│                           Payload                            │
└──────────────────────────────────────────────────────────────┘
```

### Header fields

| Field | Size | Description |
| --- | --- | --- |
| Source Port | 16 bits | Sender's port (can be 0 if no reply is expected) |
| Destination Port | 16 bits | Receiver's port (0-65535) |
| Length | 16 bits | Header + data length in bytes (min. 8) |
| Checksum | 16 bits | Checksum (optional in IPv4, mandatory in IPv6) |

```
Maximum UDP datagram size:
  65535 bytes (max Length) - 8 bytes (UDP header) = 65527 bytes payload

In practice limited by MTU:
  Ethernet MTU = 1500 bytes
  IP header    = 20 bytes
  UDP header   = 8 bytes
  Max payload without fragmentation = 1472 bytes

If datagram > MTU - IP fragments it automatically.
Fragmentation is undesirable: loss of one fragment = loss of the entire datagram.
```

---

## How Checksum works

```
Checksum is computed over pseudo-header + UDP header + data.

Pseudo-header (never sent over the network, only used for calculation):
┌────────────────────────────────────────┐
│         Source IP Address (32 bits)    │
├────────────────────────────────────────┤
│      Destination IP Address (32 bits)  │
├───────────────┬────────────────────────┤
│  Zeros (8 b)  │  Protocol=17 (8 bits) │
├───────────────┴────────────────────────┤
│          UDP Length (16 bits)          │
└────────────────────────────────────────┘

IPv4: Checksum is optional (0x0000 = disabled)
IPv6: Checksum is always mandatory

If checksum is disabled and data is corrupted in transit - the application
receives garbage with no warning whatsoever.
```

---

## UDP sockets - how it works internally

```
Sender:                                Receiver:
socket(AF_INET, SOCK_DGRAM)            socket(AF_INET, SOCK_DGRAM)
                                       bind(port)
sendto(data, addr)                     recvfrom(buffer)
  │                                       │
  │  UDP datagram ──────────────────────► │
  │                                       │
  ▼                                       ▼
Kernel sent it and forgot.          Kernel places the datagram
                                    in the recv buffer. If the
                                    buffer is full - datagram is
                                    silently dropped.
```

```
# UDP buffers (Linux)
cat /proc/sys/net/core/rmem_default    # default receive buffer size
cat /proc/sys/net/core/rmem_max        # max receive buffer size
cat /proc/sys/net/core/wmem_default    # default send buffer size
cat /proc/sys/net/core/wmem_max        # max send buffer size

# Increase buffers (for high-load UDP services)
echo 26214400 > /proc/sys/net/core/rmem_max     # 25 MB
echo 26214400 > /proc/sys/net/core/rmem_default
```

### Datagram loss on the receiver side

```
Loss scenario when the buffer overflows:

[datagram 1] ──► buffer [1][2][3][4][5] - OK
[datagram 2] ──► buffer [1][2][3][4][5] - OK
...
[datagram N] ──► buffer FULL - SILENTLY DROPPED ✗

Application reads slowly → buffer fills up → packets get lost.
UDP does not notify the sender about this!

How to check how many datagrams were dropped:
cat /proc/net/udp      # receive queue, drops per socket
ss -unap               # recv-q > 0 means unread data in buffer
netstat -su            # summary stats: "receive buffer errors"
```

---

## Where UDP is used

### DNS (port 53)

```
Client                    DNS Server
  │  Query: A google.com  │
  │  src=random, dst=53   │
  │────────────────────►  │
  │                       │
  │  Reply: 142.250.x.x   │
  │◄────────────────────  │

Why UDP and not TCP?
- Request and reply fit in one datagram (< 512 bytes for UDP)
- No handshake needed (saves an RTT)
- If reply doesn't arrive - client simply retries
- DNS resolver handles thousands of queries/sec - TCP overhead is unacceptable

When DNS uses TCP (port 53):
- Response > 512 bytes (large zones, DNSSEC)
- Zone Transfer (AXFR) - full zone transfer
- When server returned TC (Truncated) flag
```

```
# Watch DNS queries
tcpdump -i eth0 -n udp port 53
# 14:32:01 192.168.1.10.52341 > 8.8.8.8.53: UDP, length 29
# 14:32:01 8.8.8.8.53 > 192.168.1.10.52341: UDP, length 61

# DNS query via UDP
dig google.com A
dig google.com A +notcp    # explicitly force UDP

# DNS query via TCP
dig google.com A +tcp

# Capture DNS traffic with decoding
tcpdump -i eth0 -n -v udp port 53
```

### DHCP (ports 67/68)

```
Client (0.0.0.0:68)              Server (255.255.255.255:67)
  │                                        │
  │  DISCOVER (broadcast)                  │
  │  src=0.0.0.0:68, dst=255.255.255.255:67│
  │───────────────────────────────────────►│
  │                                        │
  │           OFFER (unicast/broadcast)    │
  │◄───────────────────────────────────────│
  │                                        │
  │  REQUEST (broadcast)                   │
  │───────────────────────────────────────►│
  │                                        │
  │             ACK (unicast/broadcast)    │
  │◄───────────────────────────────────────│

Why UDP?
- Client has no IP address yet - can't establish a TCP connection
- Broadcast is required - TCP doesn't support broadcast
- Simple 4-packet exchange doesn't need TCP's guarantees
```

```
# Watch DHCP traffic
tcpdump -i eth0 -n udp port 67 or udp port 68
tcpdump -i eth0 -n -v 'udp and (port 67 or port 68)'

# Trigger DHCP renewal manually (Linux)
dhclient -r eth0    # release
dhclient eth0       # request new
```

### NTP (port 123)

```
Client                    NTP Server
  │  Request              │
  │  T1 = send time       │
  │──────────────────────►│  T2 = receive time
  │                       │  T3 = reply time
  │  Response             │
  │◄──────────────────────│
  T4 = receive time

RTT    = (T4-T1) - (T3-T2)
Offset = ((T2-T1) + (T3-T4)) / 2

Why UDP?
- One request, one reply
- Time sync requires precise timestamps - TCP adds unpredictable delays
- Broadcast mode supported (NTP broadcast for LAN)
```

```
# Watch NTP traffic
tcpdump -i eth0 -n udp port 123

# Check time synchronization
chronyc tracking
timedatectl show-timesync

# Force sync
chronyc makestep
```

### Streaming and VoIP

```
RTP (Real-time Transport Protocol) - runs over UDP:
- Audio/video calls (SIP, WebRTC)
- Online streaming
- Video conferencing (Zoom, Teams use RTP)

Why UDP is critical for VoIP/streaming:

Imagine TCP for a voice call:
  Packet lost → TCP waits → requests retransmit → waits again
  Delay can reach hundreds of milliseconds
  Voice "freezes", then arrives in a burst
  → Impossible for real-time

With UDP:
  Packet lost → gap (small click or silence)
  Next packet is received immediately
  → Small artifact, but conversation continues

Acceptable packet loss for VoIP: 1-3%
Acceptable one-way delay: < 150 ms
Acceptable jitter: < 30 ms
```

```
# Monitor UDP traffic for VoIP (RTP typically on ports 10000-20000)
tcpdump -i eth0 -n 'udp portrange 10000-20000'

# Measure jitter and loss with iperf3
iperf3 -c server -u -b 1M -t 30    # UDP test, 1 Mbit/s, 30 sec
# [ ID] Interval    Transfer    Bitrate    Jitter    Lost/Total
# [  5] 0-30 sec    3.58 MBytes 1.00 Mbits/s  0.234 ms  2/2560 (0.078%)
```

### Online games

```
Why games use UDP:
  - Data freshness matters more than delivery
  - A player position from 100 ms ago is useless - we need current
  - TCP: packet loss → retransmit → Head-of-Line blocking
    (new packets wait for the old one to be delivered)
  - UDP: old packet lost → immediately take the next one

What game engines build on top of UDP:
  - Packet sequence numbers
  - Selective retransmit only for critical data (events, hits)
  - Delta compression (send only changes)
  - Client-side prediction + reconciliation
  - Jitter buffer

Examples: Quake, CS:GO, Valorant, Minecraft (Java Edition uses TCP,
but Bedrock Edition uses UDP via the RakNet protocol)
```

### QUIC / HTTP/3

```
QUIC (Quick UDP Internet Connections) - Google (2012) → RFC 9000 (2021)
HTTP/3 runs over QUIC, which runs over UDP.

Why UDP instead of TCP?
  TCP runs in the kernel → slow to update, no flexibility
  QUIC runs in userspace over UDP → rapid protocol evolution

What QUIC adds on top of UDP:
  - Encryption (TLS 1.3 built-in)
  - Reliable delivery (own seq numbers, ACK)
  - Flow control
  - Multiplexing (multiple streams, no HOL blocking)
  - 0-RTT / 1-RTT handshake (faster than TCP+TLS)
  - Connection migration (change IP without dropping connection)

In essence: QUIC = TCP + TLS + multiplexing, but more flexible
```

```
# Check if a server supports HTTP/3
curl -I --http3 https://cloudflare.com
curl -v --http3-only https://quic.nginx.org

# Watch QUIC traffic
tcpdump -i eth0 -n udp port 443

# nmap: detect QUIC
nmap -sU -p 443 --script quic-info example.com
```

### SNMP (ports 161/162)

```
Simple Network Management Protocol
  - Monitoring and managing network equipment
  - get/set requests: port 161 (agent)
  - Traps (notifications): port 162 (manager)

Why UDP:
  - Simple request/reply (like DNS)
  - Traps are fire-and-forget notifications
  - Works even during network issues (no handshake required)
```

```
# Request data via SNMP
snmpget -v2c -c public router.local 1.3.6.1.2.1.1.1.0    # sysDescr

# Capture SNMP traffic
tcpdump -i eth0 -n udp port 161 or udp port 162

# Watch traps
snmptrapd -f -Lo -c /etc/snmp/snmptrapd.conf
```

---

## Broadcast and Multicast - UDP exclusives

### Broadcast

```
Unicast:   one sender  → one receiver
Broadcast: one sender  → everyone on the network
Multicast: one sender  → a group of receivers

Broadcast addresses:
  255.255.255.255         - limited broadcast (own network only)
  192.168.1.255           - directed broadcast (network 192.168.1.0/24)

TCP does not support broadcast - a connection requires a specific address.
UDP can send a datagram to everyone at once.
```

```
# Send a broadcast UDP packet
echo "hello" | nc -u -b 255.255.255.255 9999

# Capture broadcast packets
tcpdump -i eth0 -n 'udp and dst host 255.255.255.255'

# SO_BROADCAST socket option is required for broadcast
# Python example:
# s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
# s.sendto(b"hello", ("255.255.255.255", 9999))
```

### Multicast

```
Multicast addresses (IPv4): 224.0.0.0 - 239.255.255.255
  224.0.0.0/24  - link-local (not routed, own network only)
  224.0.0.1     - all hosts on the network
  224.0.0.2     - all routers on the network
  239.0.0.0/8   - administratively scoped (for LAN)

IGMP (Internet Group Management Protocol) manages subscriptions:
  Host → router: "I want to receive group 239.1.1.1"
  Router records it and forwards traffic only to subscribers

Multicast use cases:
  - IPTV / video conferencing on LAN
  - Routing protocols (OSPF: 224.0.0.5, 224.0.0.6)
  - mDNS (Bonjour, Avahi): 224.0.0.251, port 5353
  - SSDP (UPnP): 239.255.255.250, port 1900
```

```
# Show multicast groups on interface
ip maddress show eth0
netstat -g

# Capture multicast
tcpdump -i eth0 -n 'udp and dst net 224.0.0.0/4'

# mDNS - service discovery on LAN
avahi-browse -a           # list all services
avahi-resolve -n hostname.local  # resolve via mDNS

# SSDP - UPnP device discovery
tcpdump -i eth0 -n 'udp and dst host 239.255.255.250'
```

---

## UDP Flood - security concerns

### UDP Amplification DDoS

```
UDP is vulnerable to Amplification attacks because:
  1. No handshake - can't verify that src IP is real
  2. Small request → large response (amplification factor)

DNS Amplification example:
  Attacker (spoofed src=victim)        DNS server (open resolver)
      │  ANY isc.org request (40 bytes)      │
      │─────────────────────────────────────►│
      │                                      │  response 4000 bytes ──► victim
      │                                      │  Amplification: 100x!

Common UDP Amplification vectors:
  DNS      - amplification factor up to 140x
  NTP      - up to 556x (monlist request)
  SSDP     - up to 30x
  Memcached UDP - up to 51000x (record)
  CLDAP    - up to 70x
```

```
# Protection against UDP flood
# Rate-limit UDP traffic with iptables
iptables -A INPUT -p udp -m limit --limit 100/s --limit-burst 200 -j ACCEPT
iptables -A INPUT -p udp -j DROP

# Disable open DNS resolver
# /etc/named.conf:
# allow-recursion { 192.168.0.0/16; };   # own network only
# allow-query { any; };

# Disable NTP monlist (vulnerable feature)
# /etc/ntp.conf:
# restrict default noquery nomodify nopeer
# disable monitor

# Check UDP drop statistics
netstat -su | grep -i "error\|fail\|drop"
cat /proc/net/snmp | grep Udp
```

### UDP Port Scanning

```
UDP port scanning is harder than TCP:
  - No handshake: an open port may simply not respond
  - Closed port → ICMP Port Unreachable (type 3, code 3)
  - Firewall may block ICMP → unknown: open or filtered

nmap UDP scan logic:
  Send a UDP datagram to the port
  No response           → open | filtered
  ICMP unreachable      → closed
  UDP response          → open
  Other ICMP type       → filtered
```

```
# UDP scanning (slower than TCP, requires root)
sudo nmap -sU -p 53,67,68,123,161,162 target
sudo nmap -sU --top-ports 100 target       # top 100 UDP ports
sudo nmap -sU -p U:53,T:80 target          # UDP and TCP together

# Fast UDP scan
sudo nmap -sU -T4 --open target

# Verbose output
sudo nmap -sUV -p 53 target                # service version
```

---

## Diagnosing UDP

```
# All UDP sockets
ss -unap
# Recv-Q > 0 means unread data in the buffer (app is falling behind)

# UDP kernel statistics
cat /proc/net/snmp | grep Udp
# Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors
# Udp: 123456      42       7        234567        0            0

# InDatagrams  - total datagrams received
# NoPorts      - datagrams to a closed port (→ ICMP unreachable)
# InErrors     - checksum errors and others
# RcvbufErrors - dropped due to recv buffer overflow (!)
# SndbufErrors - dropped due to send buffer overflow

# Quick loss check
watch -n 1 'cat /proc/net/snmp | grep Udp'

# Detailed statistics
netstat -su
# Udp:
#     123456 packets received
#     42 packets to unknown port received
#     7 packet receive errors          <- errors
#     234567 packets sent
#     0 receive buffer errors          <- buffer overflow
```

```
# Capture UDP traffic
tcpdump -i eth0 -n udp
tcpdump -i eth0 -n udp port 53         # DNS only
tcpdump -i eth0 -n udp portrange 5000-6000
tcpdump -i eth0 -n 'udp and len > 500' # large datagrams

# UDP test with iperf3
# Server:
iperf3 -s
# Client:
iperf3 -c server -u -b 10M -t 10      # UDP, 10 Mbit/s, 10 sec
# Output shows: Bitrate, Jitter, Lost/Total datagrams

# Simple UDP port check with netcat
nc -u -l 9999                          # server listens
echo "test" | nc -u localhost 9999     # client sends

# Check UDP port reachability (via nmap)
sudo nmap -sU -p 53 8.8.8.8
```

### ICMP Port Unreachable

```
When a UDP datagram arrives on a closed port:
  → kernel sends ICMP Type 3 Code 3 (Port Unreachable) back

This is the only way to know a port is closed.
If a firewall blocks ICMP - the port appears open (filtered).

Capture ICMP Port Unreachable:
  tcpdump -i eth0 -n 'icmp[0]=3 and icmp[1]=3'
  tcpdump -i eth0 -n icmp

ICMP rate limiting:
  Linux limits ICMP unreachable generation by default:
  cat /proc/sys/net/ipv4/icmp_ratelimit   # usually 1000 (1000 ms between bursts)
  cat /proc/sys/net/ipv4/icmp_ratemask    # which ICMP types to rate-limit
```

---

## Implementing reliability over UDP

When UDP is needed for speed but some reliability is required - the protocol is implemented on top of UDP at the application level.

### Reliable UDP patterns

```
1. Packet numbering + application-level ACK:
   Sender numbers each datagram.
   Receiver sends ACK.
   If ACK doesn't arrive within timeout - retransmit.

2. Selective Repeat / Sliding Window:
   Don't wait for ACK on every packet - send in a window.
   ACK confirms ranges (like SACK in TCP).

3. FEC (Forward Error Correction):
   Redundant packets for recovery without retransmission.
   Example: from 10 data packets, generate 4 parity packets.
   If any 4 of 14 are lost - recover without requesting retransmit.

4. NACK (Negative Acknowledgment):
   Receiver signals only on loss.
   More efficient for low-loss networks.
```

### Ready-made reliable UDP protocols

| Protocol | Description | Use case |
| --- | --- | --- |
| QUIC | Google, RFC 9000, core of HTTP/3 | HTTP/3, web |
| RakNet | Reliable UDP for games | Minecraft Bedrock, games |
| ENet | Reliable UDP, lightweight | game engines |
| KCP | Faster than TCP on lossy links | mobile games, VPN |
| RUDP | RFC 1151, basic reliable UDP | legacy systems |
| SCTP | RFC 4960, TCP alternative | telecom (SS7/Diameter) |
| WebRTC | DataChannel over DTLS/SCTP/UDP | browsers |

---

## Common UDP ports

```
Port    Protocol   Description
------  ---------  -------------------------------------------
53      DNS        Domain Name System (queries)
67      DHCP       DHCP server (Bootstrap Protocol Server)
68      DHCP       DHCP client (Bootstrap Protocol Client)
69      TFTP       Trivial File Transfer Protocol
123     NTP        Network Time Protocol
137     NetBIOS    NetBIOS Name Service
138     NetBIOS    NetBIOS Datagram Service
161     SNMP       Simple Network Management Protocol
162     SNMP       SNMP Trap (notifications)
443     QUIC       HTTP/3 (over QUIC)
500     IKE        Internet Key Exchange (IPSec)
514     Syslog     UDP Syslog (RFC 5424)
1194    OpenVPN    OpenVPN (UDP mode)
1900    SSDP       Simple Service Discovery Protocol (UPnP)
4500    NAT-T      NAT Traversal for IPSec
5353    mDNS       Multicast DNS (Bonjour/Avahi)
5355    LLMNR      Link-Local Multicast Name Resolution
51820   WireGuard  WireGuard VPN
```

```
# Show all listening UDP ports
ss -ulnp
# netstat (legacy but universally available)
netstat -ulnp

# Specific port
ss -ulnp sport = :53
```

---

## UDP and NAT

```
NAT (Network Address Translation) is harder with UDP:
  TCP: NAT tracks connections by SYN/FIN flags
  UDP: no connection state - NAT uses timeouts

UDP timeout in NAT:
  Typically 30-300 seconds (depends on implementation)
  UDP session expires if no traffic flows in either direction
  After expiry - new incoming packets are dropped

Problem: UDP "holes" in NAT close on idle.
Solution: keepalive packets every 25-30 seconds.
```

### NAT Traversal (Hole Punching)

```
How two clients behind NAT establish a direct UDP connection:

Client A (NAT-A)    STUN/TURN Server    Client B (NAT-B)
  │                       │                    │
  │  What's my public IP:port?                 │
  │──────────────────────►│                    │
  │  203.0.113.1:4000     │                    │
  │◄──────────────────────│                    │
  │                       │  What's my public IP:port?
  │                       │◄───────────────────│
  │                       │  198.51.100.1:5000 │
  │                       │───────────────────►│
  │                       │                    │
  │◄──── "A: 203.0.113.1:4000, B: 198.51.100.1:5000" ────────────►│
  │                       │                    │
  │  UDP ──────────────────────────────────────────────────────────►│
  │◄────────────────────────────────────────────────────────────────│
                 (direct A <-> B connection, no server involved)

STUN - Session Traversal Utilities for NAT (RFC 5389)
TURN - Traversal Using Relays around NAT (RFC 5766)
ICE  - Interactive Connectivity Establishment (used by WebRTC)
```

```
# Discover your external IP and NAT type via STUN
stun stun.l.google.com:19302

# WireGuard uses UDP and keepalive to maintain NAT mappings:
# /etc/wireguard/wg0.conf
# PersistentKeepalive = 25    # send a packet every 25 sec
```

---

## Cheat sheet

```
UDP header: just 8 bytes
  Source Port (16) | Destination Port (16)
  Length (16)      | Checksum (16)

UDP is:
  [+] Fast (no handshake, no acknowledgments)
  [+] Low overhead (8-byte header)
  [+] Supports Broadcast and Multicast
  [+] Preserves message boundaries
  [-] No delivery guarantee
  [-] No packet ordering
  [-] No congestion control
  [-] Vulnerable to IP spoofing (amplification DDoS)

Use UDP when:
  Real-time (VoIP, streaming, games)
  Simple request/reply (DNS, NTP, SNMP, DHCP)
  Broadcast/Multicast is needed
  Loss is better than delay
  Custom reliability on top (QUIC, RakNet, KCP)

Use TCP when:
  Delivery guarantee and ordering required
  File transfer, HTTP(1/2), email, SSH
  No custom loss handling

Diagnostics:
  ss -unap                          - UDP sockets
  cat /proc/net/snmp | grep Udp     - stats (check for drops!)
  netstat -su                       - summary statistics
  tcpdump -i eth0 -n udp            - UDP traffic
  iperf3 -c server -u -b 10M       - UDP test (jitter, loss)
  sudo nmap -sU --top-ports 100 ip  - UDP scan
```

---

## References

- [RFC 768](https://www.rfc-editor.org/rfc/rfc768) - original UDP standard (1980)
- [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000) - QUIC: A UDP-Based Multiplexed and Secure Transport
- [RFC 5389](https://www.rfc-editor.org/rfc/rfc5389) - Session Traversal Utilities for NAT (STUN)
- [RFC 5766](https://www.rfc-editor.org/rfc/rfc5766) - Traversal Using Relays around NAT (TURN)
- [RFC 3550](https://www.rfc-editor.org/rfc/rfc3550) - RTP: A Transport Protocol for Real-Time Applications
- [TCP Illustrated, Vol. 1](https://www.kohala.com/start/tcpipiv1.html) - W. Richard Stevens (Chapter 11: UDP)
