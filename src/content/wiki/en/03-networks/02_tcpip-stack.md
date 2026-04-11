---
title: "TCP/IP Stack - Packets, Frames, Segments"
date: "2026-04-11"
---

TCP/IP is the fundamental protocol stack of the internet. Unlike OSI (7 layers), TCP/IP uses 4 layers. Understanding how data is encapsulated and transmitted at each level is critical for network diagnostics and development.

---

## TCP/IP Model vs OSI

```
OSI (7 layers)           TCP/IP (4 layers)       Protocols
────────────────────────────────────────────────────────────
7  Application      ┐
6  Presentation     ├──► Application          HTTP, FTP, DNS, SSH
5  Session          ┘                         SMTP, TLS, NFS, SNMP

4  Transport        ────► Transport           TCP, UDP, SCTP

3  Network          ────► Internet            IP, ICMP, ARP, OSPF

2  Data Link        ┐
1  Physical         ┘───► Network Access      Ethernet, Wi-Fi, PPP
```

---

## Encapsulation - How Data Gets Wrapped

Each layer adds its own header to the data from the layer above:

```
Application generates:
┌─────────────────────────────────┐
│           HTTP DATA             │  "GET / HTTP/1.1\r\nHost: ..."
└─────────────────────────────────┘

Transport layer adds TCP header → SEGMENT:
┌──────────────┬──────────────────────────────────┐
│  TCP Header  │           HTTP DATA              │
│   20 bytes   │                                  │
└──────────────┴──────────────────────────────────┘

Internet layer adds IP header → PACKET:
┌─────────────┬──────────────┬────────────────────┐
│  IP Header  │  TCP Header  │     HTTP DATA      │
│   20 bytes  │   20 bytes   │                    │
└─────────────┴──────────────┴────────────────────┘

Network Access layer adds Ethernet header → FRAME:
┌──────────────┬─────────────┬──────────────┬────────────────┬──────┐
│  ETH Header  │  IP Header  │  TCP Header  │   HTTP DATA    │ FCS  │
│   14 bytes   │   20 bytes  │   20 bytes   │                │  4B  │
└──────────────┴─────────────┴──────────────┴────────────────┴──────┘

On the wire: 010101001101010101...  (bits)
```

### PDU terminology by layer

| TCP/IP Layer | OSI Layer | Protocol Data Unit (PDU) |
|--------------|-----------|--------------------------|
| Application | 5-7 | Message / Data |
| Transport | 4 | Segment (TCP) / Datagram (UDP) |
| Internet | 3 | Packet |
| Network Access | 1-2 | Frame / Bit |

---

## Ethernet Frame

A frame is the unit of transmission at the Data Link layer. It contains the physical (MAC) addresses of sender and receiver.

### IEEE 802.3 Frame Structure

```
┌───────────┬──────────┬──────────┬────────────┬─────────────────┬─────────┐
│ Preamble  │ Dst MAC  │ Src MAC  │ EtherType  │    Payload      │   FCS   │
│  + SFD    │          │          │  / Length  │   46–1500 bytes │  CRC32  │
│  8 bytes  │  6 bytes │  6 bytes │   2 bytes  │                 │  4 bytes│
└───────────┴──────────┴──────────┴────────────┴─────────────────┴─────────┘

Preamble (7 bytes): 10101010 repeated — clock synchronization
SFD — Start Frame Delimiter (1 byte): 10101011 — start of frame
FCS — Frame Check Sequence: CRC-32, error detection
```

### EtherType — what's inside the frame

| Value | Protocol |
|-------|----------|
| `0x0800` | IPv4 |
| `0x0806` | ARP |
| `0x0842` | Wake-on-LAN |
| `0x86DD` | IPv6 |
| `0x8100` | VLAN (802.1Q) |
| `0x8847` | MPLS unicast |
| `0x88CC` | LLDP |

### VLAN-tagged frame (802.1Q)

```
┌──────────┬──────────┬──────────┬────────────┬────────────┬─────────┬─────┐
│ Preamble │ Dst MAC  │ Src MAC  │  802.1Q    │ EtherType  │ Payload │ FCS │
│          │          │          │  Tag (4B)  │            │         │     │
└──────────┴──────────┴──────────┴────────────┴────────────┴─────────┴─────┘
                                  │
                    ┌─────────────┴──────────────────┐
                    │ TPID: 0x8100  (2 bytes)         │
                    │ PCP:  3 bits  (priority 0-7)    │
                    │ DEI:  1 bit   (drop eligible)   │
                    │ VID: 12 bits  (VLAN ID 1-4094)  │
                    └─────────────────────────────────┘
```

### MTU and Frame Fragmentation

```
MTU (Maximum Transmission Unit) - maximum Payload size in a frame

Ethernet:          MTU = 1500 bytes  (standard)
Jumbo Frame:       MTU = 9000 bytes  (data centers)
PPPoE:             MTU = 1492 bytes  (MTU - 8 byte PPPoE header)
VPN (IPSec):       MTU = 1400-1460   (depends on overhead)

If packet > MTU → IP-level fragmentation
```

```bash
# Get interface MTU
ip link show eth0
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500

# Change MTU
ip link set eth0 mtu 9000

# Check Path MTU
tracepath 8.8.8.8

# Ping with specific packet size
ping -M do -s 1472 8.8.8.8
# -M do = don't fragment
# -s 1472 = 1472 bytes data + 28 bytes ICMP/IP header = 1500

# Capture frames
tcpdump -i eth0 -e          # -e shows MAC addresses
tcpdump -i eth0 ether proto 0x0806   # ARP frames only
```

---

## IP Packet

A packet is the unit of transmission at the Internet layer. It contains logical (IP) addresses and enables routing.

### IPv4 Header Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌───┬───────┬───────────────────┬───────────────────────────────┐
│VER│  IHL  │   DSCP    │  ECN  │          Total Length         │
│ 4b│  4b   │    6b     │   2b  │            16 bits            │
├───┴───────┼──────────────────┬┼───────────────────────────────┤
│      Identification          ││Flags│   Fragment Offset       │
│          16 bits             ││ 3b  │       13 bits           │
├──────────────┬───────────────┴┴───────────────────────────────┤
│     TTL      │    Protocol    │        Header Checksum        │
│    8 bits    │    8 bits      │           16 bits             │
├──────────────┴────────────────────────────────────────────────┤
│                     Source IP Address (32 bits)               │
├───────────────────────────────────────────────────────────────┤
│                  Destination IP Address (32 bits)             │
├───────────────────────────────────────────────────────────────┤
│                   Options (if IHL > 5)                        │
└───────────────────────────────────────────────────────────────┘

Minimum header: 20 bytes (IHL = 5, i.e. 5 × 4 bytes)
```

### IPv4 Header Fields

| Field | Size | Description |
|-------|------|-------------|
| Version | 4 bits | IP version (4 or 6) |
| IHL | 4 bits | Header length in 32-bit words (min 5 = 20 bytes) |
| DSCP | 6 bits | Differentiated Services — QoS priority |
| ECN | 2 bits | Explicit Congestion Notification |
| Total Length | 16 bits | Total packet length (max 65535 bytes) |
| Identification | 16 bits | ID for reassembling fragments |
| Flags | 3 bits | DF (Don't Fragment), MF (More Fragments) |
| Fragment Offset | 13 bits | Fragment position in 8-byte units |
| TTL | 8 bits | Time To Live — max hops (typically 64 or 128) |
| Protocol | 8 bits | Upper-layer protocol (6=TCP, 17=UDP, 1=ICMP) |
| Header Checksum | 16 bits | Checksum of the header only |
| Source IP | 32 bits | Sender IP address |
| Destination IP | 32 bits | Recipient IP address |

### IP Packet Fragmentation

```
Packet (4000 bytes) > MTU (1500 bytes) → IP splits it:

Original packet:
┌──────────────┬──────────────────────────────────────────────────┐
│  IP Header   │               3980 bytes of data                 │
│   ID=1234    │                                                  │
└──────────────┴──────────────────────────────────────────────────┘

Fragment 1 (1500 bytes):
┌──────────────┬──────────────────────────────────────────────────┐
│  IP Header   │     1480 bytes (first)       MF=1, offset=0      │
│   ID=1234    │                                                  │
└──────────────┴──────────────────────────────────────────────────┘

Fragment 2 (1500 bytes):
┌──────────────┬──────────────────────────────────────────────────┐
│  IP Header   │     1480 bytes (next)        MF=1, offset=185    │
│   ID=1234    │                              (185 × 8 = 1480)    │
└──────────────┴──────────────────────────────────────────────────┘

Fragment 3 (1040 bytes):
┌──────────────┬──────────────────────────────────────────────────┐
│  IP Header   │     1020 bytes (last)        MF=0, offset=370    │
│   ID=1234    │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

```bash
# View IP headers
tcpdump -i eth0 -v ip
tcpdump -i eth0 ip and host 8.8.8.8

# Capture fragmented packets
tcpdump -i eth0 'ip[6:2] & 0x3fff != 0'

# Default TTL values by OS:
# Linux:   64
# Windows: 128
# macOS:   64
# Cisco:   255

# Infer OS from TTL in ping/traceroute
ping -c1 target | grep "ttl="
```

### IPv6 Header

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌───────┬────────────────┬─────────────────────────────────────┐
│Version│  Traffic Class │           Flow Label                │
│  4b   │     8 bits     │             20 bits                 │
├───────┴────────────────┼─────────────────┬───────────────────┤
│    Payload Length      │   Next Header   │   Hop Limit       │
│       16 bits          │     8 bits      │     8 bits        │
├────────────────────────┴─────────────────┴───────────────────┤
│                  Source Address (128 bits / 16 bytes)        │
├──────────────────────────────────────────────────────────────┤
│               Destination Address (128 bits / 16 bytes)      │
└──────────────────────────────────────────────────────────────┘

Header is always 40 bytes (no options, uses Extension Headers instead)
No fragmentation at intermediate nodes (only at the source)
No checksum (handled at L4)
TTL replaced by Hop Limit (same semantics)
```

---

## TCP Segment

A segment is the unit of TCP transmission. It provides reliable, ordered, error-checked delivery of data.

### TCP Header Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 bits            │          16 bits             │
├──────────────────────────────┴──────────────────────────────┤
│                     Sequence Number                         │
│                          32 bits                            │
├─────────────────────────────────────────────────────────────┤
│                   Acknowledgment Number                     │
│                          32 bits                            │
├─────────┬────────┬──────────────────────────────────────────┤
│  Data   │Reserv. │C E U A P R S F                          │
│ Offset  │        │W C R C S S Y I                          │
│  4 bits │  4 bits│R E G K H T N N                          │
│         │        │           flags (9 bits)                │
├─────────┴────────┴──────────────────────────────────────────┤
│           Window Size           │         Checksum          │
│             16 bits             │          16 bits          │
├─────────────────────────────────┴───────────────────────────┤
│          Urgent Pointer         │         Options           │
│             16 bits             │   (if Data Offset > 5)   │
└─────────────────────────────────────────────────────────────┘

Minimum header: 20 bytes
```

### TCP Flags

| Flag | Bit | Description |
|------|-----|-------------|
| `SYN` | Bit 1 | Synchronize - connection establishment |
| `ACK` | Bit 4 | Acknowledge - confirm receipt |
| `FIN` | Bit 0 | Finish - graceful connection teardown |
| `RST` | Bit 2 | Reset - abrupt connection reset |
| `PSH` | Bit 3 | Push - deliver data to application immediately |
| `URG` | Bit 5 | Urgent - high-priority data |
| `ECE` | Bit 6 | ECN Echo - congestion notification |
| `CWR` | Bit 7 | Congestion Window Reduced |

### TCP Three-Way Handshake in Detail

```
Client                                         Server
  │                                               │
  │  SYN                                         │
  │  seq=1000, ack=0                             │
  │  Flags: SYN                                  │
  │  Win=65535, MSS=1460                         │
  │───────────────────────────────────────────►  │
  │                                               │
  │                               SYN-ACK        │
  │                               seq=5000       │
  │                               ack=1001       │
  │                               Flags: SYN,ACK │
  │                               Win=65535      │
  │  ◄───────────────────────────────────────── │
  │                                               │
  │  ACK                                         │
  │  seq=1001, ack=5001                          │
  │  Flags: ACK                                  │
  │───────────────────────────────────────────►  │
  │                                               │
  │  ════════════ Data ════════════════════════  │
  │                                               │
```

### TCP Four-Way Teardown

```
Client                                         Server
  │                                               │
  │  FIN                                         │
  │  seq=1500, Flags: FIN,ACK                   │
  │───────────────────────────────────────────►  │  Active Close
  │                                               │
  │                            ACK               │
  │                            ack=1501          │
  │  ◄─────────────────────────────────────────  │
  │                                               │  (server may still
  │                                               │   send data)
  │                            FIN               │
  │                            seq=5500          │
  │  ◄─────────────────────────────────────────  │  Passive Close
  │                                               │
  │  ACK                                         │
  │  ack=5501                                   │
  │───────────────────────────────────────────►  │
  │                                               │
  │  [TIME_WAIT: 2×MSL = 60-240 seconds]        │
```

### TCP Sequence Numbers and Reliability

```
Sender                                   Receiver
seq=1, len=100 ──────────────────────►  received bytes 1-100
seq=101, len=100 ────────────────────►  received bytes 101-200
seq=201, len=100 ────────────────────►
                                         ◄─── ACK=301 (expecting byte 301)

Packet loss:
seq=1, len=100 ──────────────────────►
seq=101, len=100 ─────────────── ✗      (lost!)
seq=201, len=100 ────────────────────►
                                         ◄─── ACK=101 (Duplicate ACK)
                                         ◄─── ACK=101
                                         ◄─── ACK=101  (3 dupes = Fast Retransmit)
seq=101, len=100 ────────────────────►  (retransmission)
                                         ◄─── ACK=301
```

### TCP Sliding Window

```
Window Size = 3 segments

State 1:
[sent&acked][──── can send ────][──── cannot ────][no data]
             1        2        3
             ↑ SND.UNA           ↑ SND.WND

State 2 (after ACK 1):
[sent&acked][sent&acked][── can ──][──────── cannot ────────]
                         2    3   4
                         ↑ SND.UNA        ↑ SND.WND
```

### TCP Options

| Option | Code | Description |
|--------|------|-------------|
| MSS | 2 | Maximum Segment Size - max data in a segment |
| Window Scale | 3 | Window scaling (shift up to 14 bits, max ~1 GB window) |
| SACK | 4 | Selective Acknowledgment |
| Timestamp | 8 | Timestamps for RTT measurement and PAWS |
| No-Op | 1 | Padding |

```bash
# View TCP options in a capture
tcpdump -i eth0 -v 'tcp[13] & 2 != 0'  # SYN packets (contain options)

# Example tcpdump output:
# IP 192.168.1.10.52341 > 93.184.216.34.80: Flags [S],
#    seq 3123456789, win 65535,
#    options [mss 1460,sackOK,TS val 123456 ecr 0,nop,wscale 7]

# ss shows MSS and window
ss -tin dst 8.8.8.8
```

---

## UDP Datagram

UDP is a simple, connectionless transport protocol. The header is only 8 bytes.

### UDP Header Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 bits            │          16 bits             │
├──────────────────────────────┼──────────────────────────────┤
│            Length            │           Checksum           │
│           16 bits            │          16 bits             │
└──────────────────────────────┴──────────────────────────────┘
          Header: 8 bytes

Length   = header + data (min 8 bytes)
Checksum = optional in IPv4, mandatory in IPv6
```

### UDP vs TCP - when to use which

```
UDP is better when:                      TCP is better when:
──────────────────────────────────────   ──────────────────────────────────────
Speed matters more than reliability      Reliability is critical
Packet loss is acceptable               Order of data matters
Application manages reliability itself   No built-in error handling needed
Broadcast/multicast traffic required     Flow control is needed

UDP examples:                            TCP examples:
- DNS queries (fast and simple)          - HTTP/HTTPS (files, APIs)
- DHCP (no IP address yet)               - SSH, FTP, SMTP
- VoIP, video calls (latency matters)    - Databases (need integrity)
- Online games (better to drop a frame)  - Email, file transfers
- QUIC (HTTP/3) — reliability over UDP   - Banking transactions
- NTP, SNMP, syslog
- TFTP, DNS zone transfer (<512B)
```

---

## ICMP - Control Messages

ICMP operates on top of IP (Protocol=1), used for diagnostics and control.

### ICMP Message Structure

```
┌──────────┬──────────┬──────────────────────────────────────┐
│   Type   │   Code   │              Checksum                │
│  8 bits  │  8 bits  │              16 bits                 │
├──────────┴──────────┴──────────────────────────────────────┤
│           Rest of Header (depends on Type/Code)            │
│                          32 bits                           │
├────────────────────────────────────────────────────────────┤
│                    Data (variable)                         │
└────────────────────────────────────────────────────────────┘
```

### Key ICMP types

| Type | Code | Description | Used by |
|------|------|-------------|---------|
| 0 | 0 | Echo Reply | `ping` response |
| 3 | 0 | Net Unreachable | - |
| 3 | 1 | Host Unreachable | - |
| 3 | 3 | Port Unreachable | UDP port not listening |
| 3 | 4 | Fragmentation Needed | MTU issue |
| 5 | 0 | Redirect Network | router redirecting |
| 8 | 0 | Echo Request | `ping` |
| 11 | 0 | TTL Exceeded | `traceroute` |
| 11 | 1 | Fragment Reassembly Exceeded | - |

---

## Full Packet Journey - HTTP Request Example

```
Browser at 192.168.1.10 opens http://93.184.216.34

STEP 1: DNS (if needed)
────────────────────────────────────────────────────────────────
Sender: 192.168.1.10:54321 → 8.8.8.8:53 (UDP)
[ETH: src=AA:BB:CC | dst=GW_MAC][IP: 192.168.1.10→8.8.8.8]
[UDP: 54321→53][DNS: Query A example.com]

STEP 2: TCP Handshake
────────────────────────────────────────────────────────────────
SYN packet:
[ETH: AA:BB:CC→GW_MAC][IP: 192.168.1.10→93.184.216.34, TTL=64]
[TCP: src=52341, dst=80, seq=1000, SYN, win=65535, MSS=1460]

SYN passes through routers:
Router 1: TTL 64→63, changes src MAC, looks up routing table
Router 2: TTL 63→62, changes src MAC again
...
Server: receives SYN with TTL=58

SYN-ACK from server:
[ETH: server→...][IP: 93.184.216.34→192.168.1.10, TTL=128]
[TCP: src=80, dst=52341, seq=5000, ack=1001, SYN,ACK]

ACK:
[IP: 192.168.1.10→93.184.216.34]
[TCP: seq=1001, ack=5001, ACK]

STEP 3: HTTP Request
────────────────────────────────────────────────────────────────
[ETH: AA:BB:CC→GW_MAC][IP: 192.168.1.10→93.184.216.34, TTL=64]
[TCP: seq=1001, ack=5001, PSH,ACK][HTTP: GET / HTTP/1.1\r\n...]

STEP 4: HTTP Response
────────────────────────────────────────────────────────────────
[IP: 93.184.216.34→192.168.1.10]
[TCP: seq=5001, ack=1077, PSH,ACK]
[HTTP: HTTP/1.1 200 OK\r\n...\r\n<html>...]

STEP 5: TCP Teardown
────────────────────────────────────────────────────────────────
FIN,ACK → ACK → FIN,ACK → ACK
```

### What changes as a packet passes through a router

```
Before router:                        After router:
┌─────────────────────────────┐       ┌─────────────────────────────┐
│ ETH: AA:BB:CC → DD:EE:FF    │  →    │ ETH: 11:22:33 → 44:55:66    │ ← MACs change
│ IP:  192.168.1.10           │  →    │ IP:  192.168.1.10           │ ← IP unchanged (no NAT)
│      → 93.184.216.34        │  →    │      → 93.184.216.34        │
│ TTL: 64                     │  →    │ TTL: 63                     │ ← TTL decremented
│ TCP: seq=1001               │  →    │ TCP: seq=1001               │ ← TCP unchanged
│ HTTP: GET /                 │  →    │ HTTP: GET /                 │ ← data unchanged
└─────────────────────────────┘       └─────────────────────────────┘
```

---

## ARP - Bridging L2 and L3

ARP resolves an IP address to a MAC address.

```
Device A (192.168.1.10, MAC: AA:BB:CC:11:22:33)
wants to send a packet to 192.168.1.20

┌────────────────────────────────────────────────────────────┐
│ ARP Request (broadcast)                                    │
│ ETH: src=AA:BB:CC:11:22:33, dst=FF:FF:FF:FF:FF:FF         │
│ ARP: Who has 192.168.1.20? Tell 192.168.1.10              │
│      Sender IP:  192.168.1.10                             │
│      Sender MAC: AA:BB:CC:11:22:33                        │
│      Target IP:  192.168.1.20                             │
│      Target MAC: 00:00:00:00:00:00 (unknown)              │
└────────────────────────────────────────────────────────────┘
                    Broadcast → everyone hears it

Device B (192.168.1.20, MAC: DD:EE:FF:44:55:66) replies:

┌────────────────────────────────────────────────────────────┐
│ ARP Reply (unicast)                                        │
│ ETH: src=DD:EE:FF:44:55:66, dst=AA:BB:CC:11:22:33        │
│ ARP: 192.168.1.20 is at DD:EE:FF:44:55:66                │
│      Sender IP:  192.168.1.20                             │
│      Sender MAC: DD:EE:FF:44:55:66                        │
│      Target IP:  192.168.1.10                             │
│      Target MAC: AA:BB:CC:11:22:33                        │
└────────────────────────────────────────────────────────────┘
```

---

## Wireshark and tcpdump - Packet Analysis

```bash
# tcpdump - basic usage
tcpdump -i eth0                          # all traffic
tcpdump -i eth0 -n                       # no name resolution
tcpdump -i eth0 -v                       # verbose
tcpdump -i eth0 -vv                      # very verbose
tcpdump -i eth0 -e                       # MAC addresses (L2)
tcpdump -i eth0 -X                       # hex + ASCII dump
tcpdump -i eth0 -w capture.pcap          # save to file
tcpdump -r capture.pcap                  # read from file

# Filter by protocol
tcpdump -i eth0 tcp
tcpdump -i eth0 udp
tcpdump -i eth0 icmp
tcpdump -i eth0 arp

# Filter by address and port
tcpdump -i eth0 host 192.168.1.10
tcpdump -i eth0 src 192.168.1.10
tcpdump -i eth0 dst 8.8.8.8
tcpdump -i eth0 port 80
tcpdump -i eth0 portrange 8000-8080
tcpdump -i eth0 net 192.168.1.0/24

# Complex filters
tcpdump -i eth0 'tcp port 80 and host 192.168.1.10'
tcpdump -i eth0 'not port 22'
tcpdump -i eth0 'tcp[13] & 2 != 0'      # SYN flag
tcpdump -i eth0 'tcp[13] & 1 != 0'      # FIN flag
tcpdump -i eth0 'tcp[13] = 18'          # SYN-ACK (0x12)
tcpdump -i eth0 'tcp[13] & 4 != 0'      # RST flag

# Filter by size
tcpdump -i eth0 'len > 1000'             # packets > 1000 bytes
tcpdump -i eth0 'ip[6:2] & 0x3fff != 0' # fragmented packets

# Wireshark display filters (in GUI or tshark)
tshark -i eth0 -Y "http"
tshark -i eth0 -Y "tcp.flags.syn==1"
tshark -i eth0 -Y "ip.addr==192.168.1.10 && tcp.port==80"
tshark -i eth0 -Y "dns"
tshark -r capture.pcap -Y "tcp.analysis.retransmission"
```

---

## Practical Diagnostics

```bash
# Check MTU and fragmentation
ping -M do -s 1472 gateway           # 1472 + 28 = 1500 (no fragmentation)
ping -M do -s 1473 gateway           # 1473 + 28 = 1501 (will fragment)

# Analyze TCP connections
ss -tan                              # all TCP connections
ss -tin                              # with TCP info (RTT, MSS, etc.)
ss -tan state established            # established only
ss -tan '( sport = :80 )'            # on port 80

# Check TCP retransmissions
ss -tin | grep retrans

# Network usage by process / host
nethogs eth0                         # by process
iftop -i eth0                        # by host pair
nload eth0                           # total bandwidth

# Path analysis
mtr --report 8.8.8.8                 # stats per hop
mtr --report --tcp --port 80 example.com  # TCP traceroute

# Latency analysis
hping3 -S -p 80 -c 10 example.com   # SYN packets, measure RTT
hping3 --traceroute -V -S -p 80 example.com  # TCP traceroute

# Bandwidth testing
iperf3 -s                            # server
iperf3 -c server_ip                  # client
iperf3 -c server_ip -u -b 100M      # UDP 100 Mbps
```

---

## Header Size Cheat Sheet

```
Ethernet Frame:
└── Preamble(8) + Dst MAC(6) + Src MAC(6) + EtherType(2) + Payload(46-1500) + FCS(4)
    Minimum: 64 bytes, Maximum: 1518 bytes

IPv4 Packet:
└── Ver(4b)+IHL(4b)+DSCP(6b)+ECN(2b)+TotalLen(16b)+ID(16b)+Flags(3b)+
    FragOffset(13b)+TTL(8b)+Proto(8b)+Checksum(16b)+SrcIP(32b)+DstIP(32b)
    Minimum: 20 bytes

IPv6 Packet:
└── Ver(4b)+TC(8b)+Flow(20b)+PayloadLen(16b)+NextHdr(8b)+HopLimit(8b)+
    SrcIP(128b)+DstIP(128b)
    Always: 40 bytes

TCP Segment:
└── SrcPort(16b)+DstPort(16b)+Seq(32b)+Ack(32b)+DataOffset(4b)+Reserved(4b)+
    Flags(9b)+Window(16b)+Checksum(16b)+Urgent(16b)+Options
    Minimum: 20 bytes

UDP Datagram:
└── SrcPort(16b)+DstPort(16b)+Length(16b)+Checksum(16b)
    Always: 8 bytes

ICMP:
└── Type(8b)+Code(8b)+Checksum(16b)+RestOfHeader(32b)+Data
    Minimum: 8 bytes

Typical HTTP overhead:
14 (ETH) + 20 (IP) + 20 (TCP) = 54 bytes overhead on 1500-byte MTU
= 3.6% overhead
```

---

## References

- [RFC 791](https://www.rfc-editor.org/rfc/rfc791) - IPv4
- [RFC 793](https://www.rfc-editor.org/rfc/rfc793) - TCP
- [RFC 768](https://www.rfc-editor.org/rfc/rfc768) - UDP
- [RFC 826](https://www.rfc-editor.org/rfc/rfc826) - ARP
- [Wireshark](https://www.wireshark.org/) - packet analyzer
- [tcpdump filters](https://www.tcpdump.org/manpages/pcap-filter.7.html) - filter documentation
