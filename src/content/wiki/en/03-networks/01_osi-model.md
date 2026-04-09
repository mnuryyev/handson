---
title: "OSI Model - All 7 Layers"
date: "2026-04-09"
---

The OSI (Open Systems Interconnection) model is a reference framework for network communication, developed by ISO in 1984. It describes how data travels from an application on one computer to an application on another, breaking the process into 7 distinct layers.

---

## Why the OSI Model Exists

- **Standardization** - hardware and software vendors from different manufacturers speak the same language
- **Troubleshooting** - when something breaks, you can pinpoint which layer the problem is at
- **Modularity** - changing one layer doesn't break the others
- **Education** - a structured way to understand how networks work

> In practice, TCP/IP (4 layers) is what runs the internet - but OSI remains the foundation for understanding and diagnosing networks.

---

## All Layers at a Glance

```
Sender                               Receiver
┌─────────────────────┐              ┌─────────────────────┐
│  7  Application     │◄────────────►│  7  Application     │
│  6  Presentation    │◄────────────►│  6  Presentation    │
│  5  Session         │◄────────────►│  5  Session         │
│  4  Transport       │◄────────────►│  4  Transport       │
│  3  Network         │◄────────────►│  3  Network         │
│  2  Data Link       │◄────────────►│  2  Data Link       │
│  1  Physical        │◄────────────►│  1  Physical        │
└─────────────────────┘              └─────────────────────┘
         │                                    │
         └─────────── physical medium ────────┘
```

## Data Encapsulation

Each layer adds its own header (and sometimes trailer) to the data - this is called **encapsulation**:

```
Application data:  [  DATA  ]

Layers 7-5:        [  DATA  ]
Layer 4:           [ TCP HDR |  DATA  ]     - segment / datagram
Layer 3:           [ IP HDR | TCP HDR | DATA ]    - packet
Layer 2:           [ ETH HDR | IP HDR | TCP HDR | DATA | ETH TRL ] - frame
Layer 1:           01010101010101011010...         - bits
```

```
PDU (Protocol Data Unit) by layer:
7-5  Data       - data
4    Segment    - segment (TCP) / Datagram (UDP)
3    Packet     - packet
2    Frame      - frame
1    Bit        - bit
```

---

## Layer 7 - Application

**What it does:** Interface between the user/application and the network. Provides network services directly to applications.

**Don't confuse:** Layer 7 is not the applications themselves (browser, Outlook) - it's the **protocols** they use.

### Protocols

| Protocol | Port | Description |
|----------|------|-------------|
| HTTP | 80 | Web page transfer |
| HTTPS | 443 | HTTP over TLS encryption |
| FTP | 20/21 | File transfer |
| SFTP | 22 | FTP over SSH |
| SSH | 22 | Secure remote management |
| Telnet | 23 | Unencrypted remote management |
| SMTP | 25/587 | Sending email |
| POP3 | 110 | Retrieving email |
| IMAP | 143 | Email retrieval with sync |
| DNS | 53 | Name-to-IP resolution |
| DHCP | 67/68 | Automatic IP assignment |
| SNMP | 161 | Network device monitoring |
| NTP | 123 | Time synchronization |
| LDAP | 389 | Directory services |
| RDP | 3389 | Windows Remote Desktop |

### Functions of Layer 7

```
- Identifying communication partners
- Determining resource availability
- Synchronizing communication
- Managing data access rights
- Providing API for network operations
```

### In practice

```bash
# HTTP request - Layer 7
curl -v http://example.com
# GET / HTTP/1.1          ← Layer 7 HTTP header
# Host: example.com
# User-Agent: curl/7.81.0

# DNS query - Layer 7
dig example.com
nslookup example.com

# Capture HTTP traffic
tcpdump -i eth0 -A port 80

# Test SMTP
telnet smtp.example.com 25
# 220 smtp.example.com ESMTP
# EHLO myhost
# MAIL FROM:<user@example.com>
```

---

## Layer 6 - Presentation

**What it does:** Translates data into a format the application can understand. Handles **encryption, compression, and encoding**.

### Functions

```
1. Encoding / Decoding
   ASCII, Unicode (UTF-8), EBCDIC

2. Encryption / Decryption
   TLS/SSL - encrypts data before transmission
   This happens here, between the application and transport

3. Compression / Decompression
   gzip, zlib - reduce the size of transmitted data

4. Serialization / Deserialization
   JSON, XML, Protocol Buffers - convert data structures
```

### Formats and protocols

| Format/Protocol | Purpose |
|-----------------|---------|
| TLS/SSL | Encryption (HTTPS, SMTPS, FTPS) |
| ASCII / UTF-8 | Text encoding |
| JPEG, PNG, GIF | Image formats |
| MPEG, H.264 | Video formats |
| MP3, AAC | Audio formats |
| JSON, XML | Data formats |
| Base64 | Binary data in text |
| gzip, zlib | Data compression |

### Where Layer 6 fits in practice

```
HTTPS = HTTP (Layer 7) + TLS (Layer 6) + TCP (Layer 4)

Browser opens https://example.com:
1. [L7] HTTP: GET / HTTP/1.1\r\nHost: example.com\r\n
2. [L6] TLS: encrypts the HTTP data → encrypted blob
3. [L4] TCP: wraps into segments
4. [L3] IP: adds IP header
5. [L2] Ethernet: adds MAC header
6. [L1] Bits go onto the wire
```

```bash
# Observe TLS handshake
openssl s_client -connect example.com:443

# Inspect a certificate
openssl s_client -connect example.com:443 | openssl x509 -text

# Wireshark: filter for TLS
# ssl or tls

# Check what cipher a site uses
curl -v https://example.com 2>&1 | grep "SSL connection"
# SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
```

---

## Layer 5 - Session

**What it does:** Manages **communication sessions** between applications. Establishes, maintains, and terminates sessions. Handles synchronization and recovery from failures.

### Functions

```
1. Session establishment
   - Authentication of both parties
   - Parameter negotiation

2. Session management
   - Half-duplex vs full-duplex
   - Token management (who has the right to send)
   - Checkpoints for recovery

3. Session termination
   - Graceful connection close
   - Resource cleanup

4. Recovery after failure
   - Resume from checkpoint
   - Examples: FTP resume, NFS
```

### Layer 5 protocols

| Protocol | Description |
|----------|-------------|
| NetBIOS | Sessions in Windows networks |
| RPC | Remote Procedure Call |
| NFS | Network File System (mounting) |
| SMB | Server Message Block (Windows shares) |
| PPTP | Point-to-Point Tunneling Protocol |
| SIP | Session Initiation Protocol (VoIP) |
| H.323 | Video conferencing |
| SQL sessions | Database sessions |

### Example: SIP session

```
Alice                    SIP Proxy               Bob
  │                          │                    │
  │──── INVITE ──────────────►│──── INVITE ───────►│
  │                          │◄─── 180 Ringing ───│
  │◄─── 180 Ringing ─────────│                    │
  │                          │◄─── 200 OK ────────│
  │◄─── 200 OK ──────────────│                    │
  │──── ACK ─────────────────►│──── ACK ──────────►│
  │                                               │
  │◄═══════════ RTP Audio/Video ══════════════════►│  (layers 4-1)
  │                                               │
  │──── BYE ─────────────────►│──── BYE ──────────►│
  │◄─── 200 OK ──────────────│◄─── 200 OK ────────│
```

---

## Layer 4 - Transport

**What it does:** Provides **end-to-end** delivery of data between applications. Responsible for reliability, packet ordering, and flow control.

### TCP vs UDP

| Feature | TCP | UDP |
|---------|-----|-----|
| Reliability | Guaranteed delivery | Best-effort |
| Ordering | Preserved | Not guaranteed |
| Connection | Connection-oriented (3-way handshake) | Connectionless |
| Flow control | Sliding window | None |
| Speed | Slower | Faster |
| Header size | 20-60 bytes | 8 bytes |
| Used for | HTTP, FTP, SSH, SMTP | DNS, DHCP, VoIP, video |

### TCP - Three-Way Handshake

```
Client                              Server
  │                                    │
  │──── SYN (seq=100) ────────────────►│
  │                                    │
  │◄─── SYN-ACK (seq=200, ack=101) ───│
  │                                    │
  │──── ACK (seq=101, ack=201) ───────►│
  │                                    │
  │◄══════════ Data ══════════════════►│
  │                                    │
  │──── FIN ──────────────────────────►│  teardown
  │◄─── FIN-ACK ───────────────────────│
  │──── ACK ──────────────────────────►│
```

### TCP Header

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
├─────────────────────────┬─────────────────────────────────────┤
│      Source Port        │       Destination Port              │
├─────────────────────────────────────────────────────────────┤
│                    Sequence Number                           │
├─────────────────────────────────────────────────────────────┤
│                 Acknowledgment Number                        │
├───────┬─────────┬─────────────────────────────────────────┤
│  Data │Reserved │ Flags: URG ACK PSH RST SYN FIN          │
│Offset │         │                                          │
├───────────────────────────┬─────────────────────────────────┤
│         Window Size       │           Checksum              │
├───────────────────────────┴─────────────────────────────────┤
│          Urgent Pointer   │           Options               │
└─────────────────────────────────────────────────────────────┘
```

### Ports

```
Port ranges:
0–1023      Well-known (privileged): HTTP=80, HTTPS=443, SSH=22
1024–49151  Registered: PostgreSQL=5432, MySQL=3306
49152–65535 Dynamic / Ephemeral (client/temporary ports)
```

### Flow control and congestion

```
Sliding Window (flow control):
Sender                         Receiver
  │ ─── segment 1 ──────────────► │
  │ ─── segment 2 ──────────────► │  Window = 3
  │ ─── segment 3 ──────────────► │
  │◄─── ACK 1 ─────────────────── │
  │ ─── segment 4 ──────────────► │  window slides forward
  │◄─── ACK 2,3 ───────────────── │

If receiver is overwhelmed → it reduces Window Size → sender slows down
```

```bash
# View TCP connections
ss -tan                          # all TCP
ss -tnp                          # with process names
ss -tan state established        # ESTABLISHED only
ss -tan state TIME-WAIT          # TIME-WAIT connections

# TCP statistics
ss -s
netstat -s | grep -A5 "Tcp:"

# Capture TCP traffic
tcpdump -i eth0 tcp port 80
tcpdump -i eth0 'tcp[13] & 2 != 0'   # SYN packets only

# Check open ports
ss -tlnp                         # listening TCP ports
ss -ulnp                         # listening UDP ports
```

---

## Layer 3 — Network

**What it does:** Logical addressing and **routing** - determining the path a packet takes from source to destination across multiple intermediate nodes.

### IP Addressing

```
IPv4 address: 192.168.1.100 / 24
              └──────────┘   └┘
              4 octets of    prefix (subnet mask)
              8 bits each

Network part:  192.168.1.0    (first 24 bits)
Host part:     .100           (last 8 bits)
Broadcast:     192.168.1.255

/24 = 255.255.255.0 = 256 addresses, 254 usable hosts
```

### Private IP ranges and special addresses

```
Private ranges (RFC 1918):
10.0.0.0/8          - 10.0.0.0    – 10.255.255.255   (16M hosts)
172.16.0.0/12       - 172.16.0.0  – 172.31.255.255   (1M hosts)
192.168.0.0/16      - 192.168.0.0 – 192.168.255.255  (65K hosts)

Special addresses:
127.0.0.0/8         - Loopback (127.0.0.1 = localhost)
169.254.0.0/16      - Link-local (APIPA, no DHCP)
224.0.0.0/4         - Multicast
255.255.255.255     - Limited broadcast
0.0.0.0             - Unspecified address
```

### IPv4 Header

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
├───┬───────┬────────────────────┬────────────────────────────────┤
│Ver│  IHL  │   DSCP / ECN       │          Total Length          │
├───┴───────┼────────────────────┼────┬───────────────────────────┤
│    Identification              │Flgs│    Fragment Offset        │
├────────────┬───────────────────┼────┴───────────────────────────┤
│    TTL     │    Protocol       │         Header Checksum        │
├────────────┴───────────────────┴───────────────────────────────┤
│                       Source IP Address                        │
├────────────────────────────────────────────────────────────────┤
│                    Destination IP Address                      │
└────────────────────────────────────────────────────────────────┘

TTL (Time To Live) - decremented by 1 at each router (loop prevention)
Protocol field: 6=TCP, 17=UDP, 1=ICMP, 89=OSPF
```

### Routing

```bash
# Routing table
ip route show
route -n

# Output:
# default via 192.168.1.1 dev eth0     ← default gateway
# 192.168.1.0/24 dev eth0 proto kernel ← directly connected
# 10.0.0.0/8 via 10.10.0.1 dev eth1   ← static route

# Add a route
ip route add 10.0.0.0/8 via 192.168.1.1
ip route add default via 192.168.1.1

# Delete a route
ip route del 10.0.0.0/8

# Trace the route
traceroute 8.8.8.8
tracepath 8.8.8.8
mtr 8.8.8.8                      # interactive traceroute

# Ping — ICMP Echo Request (Layer 3)
ping -c 4 8.8.8.8
ping6 ::1
```

### ICMP

```
ICMP - Internet Control Message Protocol
Operates at Layer 3, used for diagnostics

Type 0  - Echo Reply (ping response)
Type 3  - Destination Unreachable
Type 5  - Redirect
Type 8  - Echo Request (ping)
Type 11 - Time Exceeded (TTL = 0, used by traceroute)
Type 12 - Parameter Problem

How traceroute works:
Sends packets with TTL=1, 2, 3...
Each router decrements TTL; when TTL=0 it replies with ICMP Time Exceeded
→ traceroute learns the address of each hop along the path
```

### Routing protocols

| Protocol | Type | Description |
|----------|------|-------------|
| RIP | Distance Vector | Obsolete, max 15 hops |
| OSPF | Link State | Fast convergence, popular in enterprise |
| BGP | Path Vector | The internet's routing protocol, between ASes |
| EIGRP | Hybrid | Cisco proprietary, fast |
| IS-IS | Link State | Carrier/ISP networks |

---

## Layer 2 - Data Link

**What it does:** Transfers data between **directly connected** nodes. Physical addressing (MAC), error detection, and media access control.

### Two sublayers

```
┌─────────────────────────────────────────┐
│  LLC — Logical Link Control             │  ← logical link management
│       (IEEE 802.2)                      │    multiplexing L3 protocols
├─────────────────────────────────────────┤
│  MAC — Media Access Control             │  ← physical addressing
│       (802.3 Ethernet, 802.11 Wi-Fi)    │    media access management
└─────────────────────────────────────────┘
```

### MAC Addresses

```
MAC address: AA:BB:CC:DD:EE:FF
             └──────┘  └──────┘
             OUI (vendor)  Unique device identifier
             3 bytes       3 bytes

48 bits = ~281 trillion unique addresses

Special MAC addresses:
FF:FF:FF:FF:FF:FF - Broadcast (sent to everyone in the segment)
01:xx:xx:xx:xx:xx - Multicast (first bit = 1)
00:xx:xx:xx:xx:xx - Unicast

OUI examples:
00:1A:A0 - Dell
00:50:56 - VMware
B8:27:EB - Raspberry Pi
3C:22:FB - Apple
```

### Ethernet Frame (IEEE 802.3)

```
┌──────────┬──────────┬──────┬──────────────────┬──────┬──────┐
│Preamble  │Dest MAC  │Src   │  EtherType/Length │ Data │ FCS  │
│ 8 bytes  │ 6 bytes  │MAC   │    2 bytes        │46-   │  4   │
│          │          │6bytes│                   │1500B │bytes │
└──────────┴──────────┴──────┴──────────────────┴──────┴──────┘

EtherType:
0x0800 = IPv4
0x0806 = ARP
0x86DD = IPv6
0x8100 = VLAN tagged (802.1Q)

FCS — Frame Check Sequence (CRC-32, error detection)
MTU = 1500 bytes (maximum Data field size)
```

### ARP - Address Resolution Protocol

```
Goal: I know the IP address, I need the MAC (to send a frame)

Device A (192.168.1.10) wants to send a packet to 192.168.1.20

1. A checks its ARP cache — no entry found
2. A sends ARP Request (broadcast FF:FF:FF:FF:FF:FF):
   "Who has IP 192.168.1.20? Tell 192.168.1.10"
3. Device B (192.168.1.20) sends ARP Reply (unicast):
   "192.168.1.20 is here, my MAC is: AA:BB:CC:11:22:33"
4. A saves to ARP cache and sends the frame
```

```bash
# ARP table
arp -n
ip neigh show

# Output:
# 192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
# 192.168.1.20 dev eth0 lladdr 11:22:33:44:55:66 STALE

# Add a static ARP entry
arp -s 192.168.1.100 aa:bb:cc:dd:ee:ff
ip neigh add 192.168.1.100 lladdr aa:bb:cc:dd:ee:ff dev eth0

# Flush ARP cache
ip neigh flush all

# arping - ping at the ARP level
arping -I eth0 192.168.1.1

# Capture ARP traffic
tcpdump -i eth0 arp
```

### VLAN - Virtual LANs (802.1Q)

```
A VLAN tag is inserted into the Ethernet frame:
┌──────┬──────┬──────────┬──────┬──────┐
│ Dest │ Src  │ 802.1Q   │ Type │ Data │
│ MAC  │ MAC  │ Tag (4B) │      │      │
└──────┴──────┴──────────┴──────┴──────┘
              │
              └── TPID(2B): 0x8100
                  PCP (3 bits): priority
                  DEI (1 bit): drop eligible
                  VID (12 bits): VLAN ID 1-4094
```

### STP - Spanning Tree Protocol

```
Problem: switching loops with multiple switches
→ Broadcast storm, frame duplication

STP solution:
- Elects a Root Bridge (lowest Bridge ID)
- Blocks redundant ports
- When a link fails - unblocks the backup path

STP port states:
Blocking → Listening → Learning → Forwarding → Disabled
```

---

## Layer 1 - Physical

**What it does:** Transmits **bits** over a physical medium. Defines electrical, mechanical, and functional characteristics.

### Transmission media

```
Wired:
┌──────────────────┬──────────────────┬──────────────────────────┐
│ Type             │ Speed            │ Max distance             │
├──────────────────┼──────────────────┼──────────────────────────┤
│ Cat5e UTP        │ 1 Gbps           │ 100 m                    │
│ Cat6 UTP         │ 10 Gbps          │ 55 m (10G) / 100 m (1G) │
│ Cat6A UTP        │ 10 Gbps          │ 100 m                    │
│ Cat7 STP         │ 10 Gbps          │ 100 m                    │
│ Single-mode fiber│ 100+ Gbps        │ 10-80 km                 │
│ Multi-mode fiber │ 10-100 Gbps      │ 550 m (OM4)              │
│ Coaxial          │ up to 10 Gbps    │ type-dependent           │
└──────────────────┴──────────────────┴──────────────────────────┘

Wireless:
┌──────────────────┬────────────┬──────────────────────────────┐
│ Standard         │ Frequency  │ Speed                        │
├──────────────────┼────────────┼──────────────────────────────┤
│ 802.11n (Wi-Fi4) │ 2.4/5 GHz  │ up to 600 Mbps              │
│ 802.11ac (Wi-Fi5)│ 5 GHz      │ up to 3.5 Gbps              │
│ 802.11ax (Wi-Fi6)│ 2.4/5/6GHz │ up to 9.6 Gbps              │
│ Bluetooth 5.0    │ 2.4 GHz    │ up to 2 Mbps                │
│ LTE              │ various    │ up to 300 Mbps (theoretical) │
│ 5G               │ various    │ up to 20 Gbps (theoretical)  │
└──────────────────┴────────────┴──────────────────────────────┘
```

### Signal encoding

```
NRZ (Non-Return-to-Zero):
1: high level
0: low level
Problem: long runs of identical bits → loss of synchronization

Manchester encoding:
1: low-to-high transition at bit center
0: high-to-low transition at bit center
Used in 10BASE-T Ethernet

4B/5B encoding (Fast Ethernet):
every 4 data bits → encoded as 5 bits for transmission
Guarantees enough transitions for clock recovery
```

### Layer 1 devices

```
Repeater - amplifies signal, no analysis
Hub — multi-port repeater
   - All devices see all traffic
   - Single collision domain
   - Obsolete, replaced by switches

Modem - modulates/demodulates signal (analog ↔ digital)
Transceiver - converts signal type (electrical ↔ optical)
```

### Network topologies

```
Bus:           A──B──C──D──E
                 (obsolete)

Star:              Hub/Switch
                  /    |    \
                 A     B     C
                (dominant today)

Ring:          A─B─C─D─A
                (Token Ring, FDDI)

Full Mesh:     A─B─C
               │╲│╲│
               C─D─E
                (WAN, data centers)

Tree:          Hierarchical star
                (enterprise networks)
```

---

## OSI vs TCP/IP

```
OSI Model           TCP/IP Model        Protocol Examples
─────────────────────────────────────────────────────────────
7  Application  ┐
6  Presentation ├── Application        HTTP, FTP, DNS, SMTP,
5  Session      ┘                      SSH, TLS, NFS, SNMP

4  Transport    ─── Transport          TCP, UDP, SCTP

3  Network      ─── Internet           IP, ICMP, ARP, OSPF, BGP

2  Data Link    ┐
                ├── Network Access     Ethernet, Wi-Fi, PPP
1  Physical     ┘                      (data link + physical)
```

---

## Troubleshooting by Layer

```bash
# L1 - physical layer issues
ip link show                             # interface status
ethtool eth0                             # speed, duplex, cable
ethtool -S eth0 | grep error            # physical layer errors
cat /sys/class/net/eth0/carrier          # cable presence (1/0)
dmesg | grep eth0                        # driver errors

# L2 - data link issues
ip neigh show                            # ARP table
arp -n
tcpdump -i eth0 arp                      # ARP requests
brctl show                               # bridges
bridge fdb show                          # MAC table

# L3 - network layer issues
ip addr show                             # IP addresses
ip route show                            # routing table
ping 8.8.8.8                             # ICMP
traceroute 8.8.8.8                       # path to destination
mtr 8.8.8.8                              # interactive traceroute

# L4 - transport layer issues
ss -tlnp                                 # listening ports
ss -tan                                  # all TCP connections
ss -s                                    # statistics
tcpdump -i eth0 port 80                  # TCP traffic on port

# L7 - application layer issues
curl -v http://example.com              # HTTP request
dig example.com                          # DNS query
openssl s_client -connect example.com:443  # TLS/SSL
telnet example.com 80                    # TCP + HTTP check
```

---

## Cheat Sheet

```
Layer  Name           PDU      Devices              Addressing
─────────────────────────────────────────────────────────────────
7      Application    Data     L7 gateways, Proxy   URL, FQDN
6      Presentation   Data     -                    Data formats
5      Session        Data     -                    Session ID
4      Transport      Segment  -                    Port (0-65535)
3      Network        Packet   Router, L3 switch    IP address
2      Data Link      Frame    Switch, AP           MAC address
1      Physical       Bit      Hub, Repeater        -

```

---

## References

- [RFC 1122](https://www.rfc-editor.org/rfc/rfc1122) - Host Requirements
- [IEEE 802.3](https://standards.ieee.org/ieee/802.3) - Ethernet standard
- [Wireshark](https://www.wireshark.org/) - packet analyzer
- [OSI Model — Cloudflare](https://www.cloudflare.com/learning/ddos/glossary/open-systems-interconnection-model-osi/) - detailed explanation
