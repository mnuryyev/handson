---
title: "TCP - Handshake, Flags, States, Seq/Ack"
date: "2026-04-12"
---

TCP (Transmission Control Protocol) is a transport layer protocol providing reliable, ordered, and error-checked delivery of data between applications. Defined in RFC 793 (1981) and updated in RFC 9293 (2022).

---

## Core TCP Properties

```
TCP guarantees:
Data delivery (retransmission on loss)
Byte ordering (reassembly at the receiver)
Error detection (checksum)
Flow control (sliding window)
Congestion control
Full-duplex transmission (data flows in both directions)

TCP does NOT guarantee:
Delivery speed
Latency
Message boundaries (TCP is a byte stream, not a message protocol)
```

---

## TCP Header

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 bits            │          16 bits             │
├─────────────────────────────────────────────────────────────┤
│                      Sequence Number                        │
│                           32 bits                           │
├─────────────────────────────────────────────────────────────┤
│                   Acknowledgment Number                     │
│                           32 bits                           │
├──────┬──────────┬─────────────────────────────────────────┤
│ Data │          │ C  E  U  A  P  R  S  F                  │
│Offset│ Reserved │ W  C  R  C  S  S  Y  I                  │
│ 4 b  │  4 bits  │ R  E  G  K  H  T  N  N                  │
│      │          │                  Flags                   │
├──────┴──────────┴──────────────────────────────────────────┤
│           Window Size          │          Checksum          │
│            16 bits             │           16 bits          │
├────────────────────────────────┴───────────────────────────┤
│          Urgent Pointer        │          Options           │
│            16 bits             │   (variable length)       │
└────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
                    Data (Payload)
```

### Header fields

| Field | Size | Description |
|-------|------|-------------|
| Source Port | 16 bits | Sender's port (0–65535) |
| Destination Port | 16 bits | Receiver's port (0–65535) |
| Sequence Number | 32 bits | Byte number of the first data byte in this segment |
| Acknowledgment Number | 32 bits | Next byte expected from the peer |
| Data Offset | 4 bits | Header length in 32-bit words (min 5 = 20 bytes) |
| Flags | 9 bits | Control bits (CWR, ECE, URG, ACK, PSH, RST, SYN, FIN) |
| Window Size | 16 bits | Receive buffer space (bytes that can be received without ACK) |
| Checksum | 16 bits | Checksum of header + data |
| Urgent Pointer | 16 bits | Offset of urgent data (valid when URG=1) |
| Options | 0–40 bytes | MSS, Window Scale, SACK, Timestamp, etc. |

---

## TCP Flags

TCP uses 9 control bits in the header:

```
Bit:   8   7   6   5   4   3   2   1   0
Flag: NS  CWR ECE URG ACK PSH RST SYN FIN
```

### Flag descriptions

| Flag | Full Name | Description |
|------|-----------|-------------|
| **SYN** | Synchronize | Initiate connection. Synchronizes Sequence Numbers. |
| **ACK** | Acknowledge | Confirm receipt. Acknowledgment Number is valid. |
| **FIN** | Finish | Terminate connection from one side. Graceful close. |
| **RST** | Reset | Abruptly abort connection. Immediate close. |
| **PSH** | Push | Deliver data to application immediately, don't buffer. |
| **URG** | Urgent | Segment contains urgent data. Urgent Pointer is valid. |
| **ECE** | ECN-Echo | Congestion detected notification (RFC 3168). |
| **CWR** | Congestion Window Reduced | Sender has reduced the congestion window. |
| **NS** | Nonce Sum | Protection against inadvertent flag concealment (RFC 3540). |

### Common flag combinations

```
[S]        SYN only            - first packet of a connection
[S.] or [SA]  SYN+ACK          - server's response to SYN
[.]        ACK only            - acknowledgment (dot = ACK in tcpdump)
[P.]       PSH+ACK             - data + acknowledgment
[F.]       FIN+ACK             - teardown + acknowledgment
[R.]       RST+ACK             - connection reset
[R]        RST                 - reset without ACK
[FP.]      FIN+PSH+ACK         - last data + teardown
```

```bash
# tcpdump shows flags in square brackets
# [S]   = SYN
# [S.]  = SYN+ACK  (. means ACK)
# [.]   = ACK
# [P.]  = PSH+ACK
# [F.]  = FIN+ACK
# [R.]  = RST+ACK
# [R]   = RST

tcpdump -i eth0 -n 'tcp[13] & 2 != 0'    # SYN packets   (bit 1)
tcpdump -i eth0 -n 'tcp[13] & 1 != 0'    # FIN packets   (bit 0)
tcpdump -i eth0 -n 'tcp[13] & 4 != 0'    # RST packets   (bit 2)
tcpdump -i eth0 -n 'tcp[13] = 0x12'      # SYN-ACK (0x12 = 0001 0010)
tcpdump -i eth0 -n 'tcp[13] = 0x18'      # PSH+ACK (0x18 = 0001 1000)
```

---

## Sequence Numbers and Acknowledgment Numbers

### The seq/ack logic

```
Sequence Number (seq) — byte number of the first data byte in this segment.
Acknowledgment Number (ack) — the next byte the receiver is EXPECTING.

Meaning: "I've received all bytes up to ack-1. Send me byte ack."
```

### ISN - Initial Sequence Number

```
When establishing a connection, ISN is chosen RANDOMLY (not 0 or 1).
Why? Security + avoiding conflicts with old connections on the same ports.

RFC 793: ISN should increment ~32,000 times per second
Linux: ISN generated using a cryptographic PRNG
```

### Data transfer example

```
Client (ISN=1000)                        Server (ISN=5000)

SYN:       seq=1000, len=0
──────────────────────────────────────────►
                                           SYN-ACK: seq=5000, ack=1001, len=0
◄──────────────────────────────────────────
ACK:       seq=1001, ack=5001, len=0
──────────────────────────────────────────►

Client sends 300 bytes:
DATA:      seq=1001, ack=5001, len=300, flags=PSH+ACK
──────────────────────────────────────────►

                                           ACK: seq=5001, ack=1301, len=0
◄──────────────────────────────────────────
       (server confirmed 300 bytes: ack = 1001 + 300 = 1301)

Server sends 500 bytes:
                                           DATA: seq=5001, ack=1301, len=500
◄──────────────────────────────────────────

ACK:       seq=1301, ack=5501, len=0
──────────────────────────────────────────►
       (client confirmed 500 bytes: ack = 5001 + 500 = 5501)
```

### SYN and FIN consume sequence space

```
SYN and FIN each consume ONE byte in the Sequence Number space,
even though they carry no data.

SYN occupies seq=ISN, next byte = ISN+1
FIN occupies seq=N,   next byte = N+1

Therefore:
  After SYN with seq=1000 → ACK must be ack=1001
  After FIN with seq=2000 → ACK must be ack=2001
```

---

## Three-Way Handshake (Connection Establishment)

### Full diagram

```
Client                                              Server
CLOSED                                              LISTEN
  │                                                    │
  │  ① SYN                                            │
  │  seq=ISNc (random, e.g. 3274880045)               │
  │  flags=[SYN]                                      │
  │  win=65535, MSS=1460, SACK, wscale=7              │
  │──────────────────────────────────────────────────►│
  │                                                    │
SYN_SENT                                          SYN_RECEIVED
  │                                                    │
  │                       ② SYN-ACK                   │
  │                       seq=ISNs (e.g. 1892347562)  │
  │                       ack=ISNc+1 (3274880046)     │
  │                       flags=[SYN,ACK]             │
  │                       win=65535, MSS=1460         │
  │◄──────────────────────────────────────────────────│
  │                                                    │
  │  ③ ACK                                            │
  │  seq=ISNc+1 (3274880046)                          │
  │  ack=ISNs+1 (1892347563)                          │
  │  flags=[ACK]                                      │
  │──────────────────────────────────────────────────►│
  │                                                    │
ESTABLISHED                                      ESTABLISHED
  │◄══════════════════ Data Exchange ═════════════════►│
```

### Why three packets and not two?

```
Two packets aren't enough because Sequence Numbers must be
synchronized in BOTH directions:

① SYN    - client announces its ISN → server confirms it in ②
② SYN-ACK - server announces its ISN → client confirms it in ③

Without ③ the server doesn't know the client received its ISN.
```

### Parameters negotiated during handshake

```
MSS (Maximum Segment Size) - max data bytes per segment.
  Usually MTU - 40 bytes = 1500 - 40 = 1460 bytes for Ethernet.
  Each side announces its MSS in SYN/SYN-ACK.
  Effective MSS = min(client MSS, server MSS).

Window Scale — window scaling factor (up to 14 bit shift).
  Allows window up to 1 GB (65535 × 2^14).
  Critical for high-latency links (satellite, intercontinental WAN).

SACK (Selective Acknowledgment) — selective acknowledgments.
  Allows acknowledging ranges of bytes, not just the next expected.
  Speeds up recovery after losses.

Timestamp - for RTT measurement and PAWS (ancient segment protection).
```

```bash
# Watch handshake in real time
tcpdump -i eth0 -n 'tcp[13] & 2 != 0' -v
# 192.168.1.10.52341 > 93.184.216.34.80: Flags [S],
#   seq 3274880045, win 65535,
#   options [mss 1460,sackOK,TS val 123456 ecr 0,nop,wscale 7], length 0

# Send a SYN with hping3
hping3 -S -p 80 -c 1 example.com

# Capture a full handshake
tcpdump -i eth0 -w handshake.pcap 'host example.com and tcp'
```

---

## Four-Way Teardown (Graceful Close)

### Full diagram

```
Client                                              Server
ESTABLISHED                                      ESTABLISHED
  │                                                    │
  │  ① FIN+ACK  (Active Close)                        │
  │  seq=A, ack=B                                      │
  │  flags=[FIN,ACK]                                  │
  │──────────────────────────────────────────────────►│
  │                                                    │
FIN_WAIT_1                                       CLOSE_WAIT
  │                                                    │
  │                       ② ACK                       │
  │                       seq=B, ack=A+1              │
  │                       flags=[ACK]                 │
  │◄──────────────────────────────────────────────────│
  │                                                    │
FIN_WAIT_2                (server can still send data)
  │                                                    │
  │                       ③ FIN+ACK  (Passive Close)  │
  │                       seq=B, ack=A+1              │
  │                       flags=[FIN,ACK]             │
  │◄──────────────────────────────────────────────────│
  │                                                    │
TIME_WAIT                                          LAST_ACK
  │                                                    │
  │  ④ ACK                                            │
  │  seq=A+1, ack=B+1                                 │
  │  flags=[ACK]                                      │
  │──────────────────────────────────────────────────►│
  │                                                    │
  │  [waiting 2×MSL = 60-240 seconds]                │   CLOSED
CLOSED
```

### TIME_WAIT - why it matters

```
TIME_WAIT lasts 2×MSL (Maximum Segment Lifetime = 60 seconds on Linux).
2×MSL = 120 seconds (can be 60-240 sec depending on OS).

Why wait?
1. The last ACK (④) could be lost. If the server retransmits its FIN,
   the client must respond with ACK. Without TIME_WAIT it would reply RST.

2. Protection against "wandering" packets. Old packets from a previous
   connection on the same port pair must not be accepted by a new one.

TIME_WAIT problem:
Under high traffic (thousands of short-lived connections), TIME_WAIT
consumes memory and exhausts ephemeral ports.

Solutions:
tcp_tw_reuse = 1   - reuse TIME_WAIT sockets (safe)
tcp_fin_timeout    - reduce FIN_WAIT_2 timeout
SO_REUSEADDR       - socket option for port reuse
```

```bash
# Count TIME_WAIT connections
ss -tan state time-wait | wc -l
ss -tan state time-wait | head -20

# TIME_WAIT kernel parameters
cat /proc/sys/net/ipv4/tcp_fin_timeout     # FIN_WAIT_2 timeout (default 60)
cat /proc/sys/net/ipv4/tcp_tw_reuse        # reuse TIME_WAIT (0/1)

echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse
```

### Simultaneous Close

```
Both sides send FIN at the same time:

Client                        Server
  │  FIN ──────────────────►  │
  │  ◄────────────────── FIN  │
CLOSING                    CLOSING
  │  ACK ──────────────────►  │
  │  ◄────────────────── ACK  │
TIME_WAIT                 TIME_WAIT
```

---

## RST - Connection Reset

### When RST is generated

```
1. Connection to a closed port:
   Client → SYN to port 12345 → Server (nothing listening) → RST+ACK

2. Application closes socket with data still in the buffer:
   Instead of FIN (graceful) → RST

3. Firewall/IDS drops the connection

4. Packet received for a non-existent connection:
   ACK without a matching SYN → RST

5. Connection error (duplicate SYN, etc.)
```

### RST vs FIN

```
FIN - "I'm done sending data, but I can still receive"
      Graceful, the other side can still send data
      Requires acknowledgment (ACK + responding FIN)

RST - "Connection is immediately terminated"
      Not graceful, in-flight data is lost
      No acknowledgment required, immediately CLOSED
      Receiver of RST goes to CLOSED without TIME_WAIT
```

```bash
# Example: RST when connecting to a closed port
nmap -sT -p 12345 localhost

# Capture RST packets
tcpdump -i eth0 'tcp[13] & 4 != 0' -n   # RST bit = bit 2
```

---

## All TCP States

### Full state diagram

```
                         ┌─────────┐
                         │  CLOSED │
                         └────┬────┘
                    passive   │  active
                    open      │  open
                         ┌────▼────┐
                         │  LISTEN │◄──────────────────────────────┐
                         └────┬────┘                               │
               SYN received   │  SYN sent                          │
                         ┌────▼──────┐                             │
                         │SYN_RECEIVED│                            │
                         └────┬──────┘                             │
                    ACK of SYN│                                     │
                         ┌────▼──────────┐    ┌───────────────┐    │
      ┌──────────────────►  ESTABLISHED  │    │  SYN_SENT     │    │
      │              ┌───└───────┬───────┘    └───────┬───────┘    │
      │              │  close/  │close               │SYN+ACK     │
      │              │  FIN     │FIN                 │received     │
      │              │          │                    │            │
┌─────┴──────┐  ┌────▼────┐ ┌───▼──────┐            │            │
│CLOSE_WAIT  │  │FIN_WAIT1│ │FIN_WAIT1 │            │            │
└─────┬──────┘  └────┬────┘ └───┬──────┘            │            │
 close│          ACK │     FIN  │ACK                │            │
      │         recv.│     recv.│                   │            │
┌─────▼──────┐  ┌────▼────┐ ┌───▼──────┐            │            │
│  LAST_ACK  │  │FIN_WAIT2│ │ CLOSING  │            │            │
└─────┬──────┘  └────┬────┘ └───┬──────┘            │            │
ACK   │          FIN │    ACK   │                   │            │
recv. │         recv.│    recv. │                   │            │
      │         ┌────▼──────────▼──────┐            │            │
      │         │      TIME_WAIT       │            │            │
      │         └─────────┬────────────┘            │            │
      │           2MSL    │ timeout                 │            │
┌─────▼──────────────────▼──────────────────────────▼───────────▼┐
│                          CLOSED                                  │
└──────────────────────────────────────────────────────────────────┘
```

### State reference table

| State | Description |
|-------|-------------|
| **CLOSED** | No connection. Initial and final state. |
| **LISTEN** | Server waiting for incoming SYN. `ss -tlnp` |
| **SYN_SENT** | Client sent SYN, waiting for SYN-ACK |
| **SYN_RECEIVED** | Server received SYN, sent SYN-ACK, waiting for ACK |
| **ESTABLISHED** | Connection active, data is flowing |
| **FIN_WAIT_1** | Close initiator sent FIN, waiting for ACK |
| **FIN_WAIT_2** | ACK received, waiting for FIN from the other side |
| **CLOSE_WAIT** | FIN received, application hasn't closed the socket yet |
| **CLOSING** | Both sides sent FIN simultaneously |
| **LAST_ACK** | Waiting for ACK to own FIN |
| **TIME_WAIT** | Waiting 2×MSL before final close |

```bash
# Monitor TCP states
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

ss -tanp state established
ss -tanp state time-wait
ss -tanp state close-wait        # app hasn't closed the socket!
ss -tanp state syn-recv           # incoming connections in the queue

# Summary
ss -s
# Total: 1234
# TCP:   342 (estab 300, closed 20, orphan 5, timewait 15, ...
```

### CLOSE_WAIT - a common bug indicator

```
CLOSE_WAIT means:
- We received FIN from the peer (peer closed their side)
- BUT the application hasn't called close() on the socket yet

Many CLOSE_WAIT connections = BUG in the application!
The application is not closing sockets after receiving EOF.

Diagnose:
ss -tanp state close-wait      # see which process
lsof -p <PID> | grep CLOSE_WAIT
```

---

## Flow Control - Sliding Window

```
The sender cannot transmit more data than the receiver's window allows.
This prevents the receiver's buffer from overflowing.

Window Size = bytes that can be sent without waiting for an ACK

Window state:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│  sent and   │  sent,       │  can         │  cannot      │  no  │
│  confirmed  │  awaiting ACK│  send        │  send yet    │  data│
│             │              │  (in window) │  (past window)│     │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
             ↑ SND.UNA      ↑ SND.NXT    ↑ SND.UNA+WIN

On each ACK the window slides to the right.
```

### Zero Window

```
If the receiver is overwhelmed, it advertises Window Size = 0:
"Stop! Buffer is full, don't send more data!"

The sender stops and periodically sends a
Window Probe (1 byte) to check if the buffer has freed up.

Zero Window Probe:
Client ──── data (1 byte) ──────────────────► Server (win=0)
       ◄─── ACK, win=0 ─────────────────────
       [wait TCP_KEEPALIVE_INTVL]
Client ──── probe (1 byte) ─────────────────►
       ◄─── ACK, win=8192 ──────────────────  (buffer freed!)
       ══════════ resume transmission ══════►

tcpdump will show: [ZeroWindow] and [WindowProbe]
```

---

## Congestion Control

### Algorithms

```
Congestion Window (cwnd) - how many bytes the sender can have in-flight
(in addition to flow control constraints)

Effective limit = min(cwnd, rwnd)
where rwnd = receiver's window (flow control)

Congestion control algorithms:
TCP Reno       - classic (Linux < 2.6)
TCP CUBIC      - modern Linux default
TCP BBR        - Google's Bottleneck Bandwidth and RTT (2016)
TCP Vegas      - latency-based
```

### TCP Reno / CUBIC phases

```
Throughput
   │                            /\
   │                           /  \
   │             ____________ /    \
   │            /             ← ssthresh
   │           /
   │          / ← linear growth (Congestion Avoidance)
   │         /
   │────────/ ← exponential growth (Slow Start)
   └─────────────────────────────────────────── time

Slow Start:
- Start with cwnd = 10 MSS (RFC 6928)
- Each ACK: cwnd += 1 MSS → exponential growth
- Reach ssthresh → switch to Congestion Avoidance

Congestion Avoidance:
- cwnd += MSS²/cwnd per ACK → linear growth (1 MSS/RTT)

On packet loss (3 duplicate ACKs → Fast Retransmit):
- ssthresh = cwnd/2
- cwnd = ssthresh (TCP Reno) or stays high (CUBIC)
- Enter Congestion Avoidance

On timeout:
- ssthresh = cwnd/2
- cwnd = 1 MSS → Slow Start again
```

```bash
# Check current congestion control algorithm
cat /proc/sys/net/ipv4/tcp_congestion_control
# cubic

# Available algorithms
cat /proc/sys/net/ipv4/tcp_available_congestion_control
# reno cubic bbr

# Enable BBR
echo "bbr" > /proc/sys/net/ipv4/tcp_congestion_control
modprobe tcp_bbr

# View cwnd and RTT for a connection
ss -tni dst 8.8.8.8
# rtt:22.483/5.234 rto:211 mss:1460 pmtu:1500
# rcvmss:1460 advmss:1460 cwnd:10 ssthresh:2147483647
```

---

## Retransmission

### Types of retransmission

```
1. Retransmission Timeout (RTO):
   Timer expired, no ACK received → retransmit
   RTO = SRTT + 4×RTTVAR (adaptive, based on measured RTT)
   After each timeout: RTO doubles (exponential backoff)

2. Fast Retransmit:
   3 duplicate ACKs → immediate retransmission
   (don't wait for timeout — much faster!)

3. SACK-based Retransmit:
   Selective ACK identifies exactly which ranges were lost
   Retransmit only the missing segments (not everything from the loss point)
```

### Fast Retransmit example

```
Sender                               Receiver
seq=1-100  ──────────────────────►  ✓ (ACK=101)
seq=101-200 ─────────────── ✗       (lost!)
seq=201-300 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-300)
seq=301-400 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-400)
seq=401-500 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-500)
                                     ↑
             3 duplicate ACK=101 → Fast Retransmit!
seq=101-200 ──────────────────────►  ✓ (ACK=501, no SACK needed)
                     ↑
                   Immediately ACKed everything up to 501 (SACK helped)
```

```bash
# View retransmission counters
ss -tin | grep retrans
# rtt:5.123/1.234 rto:210 mss:1460 cwnd:10 retrans:0/2

# Interface-level stats
netstat -s | grep retransmit
# 234 segments retransmitted

# tcpdump marks: "TCP Retransmission"
# Wireshark: tcp.analysis.retransmission
```

---

## TCP Keep-Alive

```
Mechanism to detect dead connections during idle periods.
After an idle period, probe packets are sent.

Linux defaults:
tcp_keepalive_time    = 7200   # seconds idle before first probe (2 hours)
tcp_keepalive_intvl   = 75     # seconds between probes
tcp_keepalive_probes  = 9      # number of probes before giving up

Total: 7200 + 75×9 = 7875 seconds (~2.2 hours) to detect a dead host
```

```bash
# View keepalive settings
cat /proc/sys/net/ipv4/tcp_keepalive_time
cat /proc/sys/net/ipv4/tcp_keepalive_intvl
cat /proc/sys/net/ipv4/tcp_keepalive_probes

# Reduce for faster dead connection detection
echo 60 > /proc/sys/net/ipv4/tcp_keepalive_time
echo 10 > /proc/sys/net/ipv4/tcp_keepalive_intvl
echo 3  > /proc/sys/net/ipv4/tcp_keepalive_probes
```

---

## Practical TCP Diagnostics

```bash
# Full connection analysis
ss -tniep                              # everything
ss -tin dst 93.184.216.34             # specific host

# ss -tin output fields:
# rtt:22.483/5.234   - RTT / RTTVAR (mean/variance, ms)
# rto:211            - Retransmission Timeout (ms)
# mss:1460           - Maximum Segment Size
# cwnd:10            - Congestion Window (in MSS units)
# ssthresh:...       - Slow Start threshold
# retrans:0/2        - retrans/total retransmissions

# Capture a full session
tcpdump -i eth0 -w session.pcap 'host example.com and tcp'

# tcpdump/Wireshark diagnostic markers:
# [R] RST              - connection reset
# [ZeroWindow]         - receiver buffer full
# [WindowProbe]        - probe after ZeroWindow
# [TCP Dup ACK]        - duplicate ACK (possible loss)
# [TCP Retransmission] - retransmitted segment
# [TCP Fast Retrans]   - fast retransmission
# [TCP Out-Of-Order]   - out-of-order segment

# Monitor TCP problems in real time
watch -n 1 'netstat -s | grep -E "retransmit|reset|fail|error"'
```

---

## Cheat Sheet

```
TCP flags:
SYN  - establish connection (synchronize seq numbers)
ACK  - acknowledge data (ack number is valid)
FIN  - terminate connection (graceful)
RST  - reset connection (abrupt)
PSH  - deliver immediately (don't buffer)
URG  - urgent data present

TCP states:
LISTEN       - waiting for incoming connections
SYN_SENT     - client sent SYN
SYN_RECEIVED - server received SYN, waiting for ACK
ESTABLISHED  - connection active
FIN_WAIT_1/2 - active close (sent FIN)
CLOSE_WAIT   - received FIN (passive side)
LAST_ACK     - waiting for ACK to own FIN
TIME_WAIT    - waiting 2×MSL (120 sec default)
CLOSING      - simultaneous close

Handshake:
[S] → [SA] → [.] → data exchange

Teardown:
[F.] → [.] → [F.] → [.] → TIME_WAIT → CLOSED

seq/ack rule:
seq = byte number of first byte in this segment
ack = next byte we expect to receive
SYN and FIN each consume 1 byte of sequence space

Useful commands:
ss -tan             - all TCP states
ss -tin             - detailed TCP info (rtt, cwnd)
tcpdump -i eth0 tcp - TCP traffic
```

---

## References

- [RFC 793](https://www.rfc-editor.org/rfc/rfc793) - original TCP standard (1981)
- [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293) - updated TCP standard (2022)
- [RFC 2581](https://www.rfc-editor.org/rfc/rfc2581) - TCP Congestion Control
- [RFC 2018](https://www.rfc-editor.org/rfc/rfc2018) - TCP Selective Acknowledgment
- [TCP Illustrated, Vol. 1](https://www.kohala.com/start/tcpipiv1.html) - W. Richard Stevens
