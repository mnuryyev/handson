---
title: "Wireshark - Filters, Traffic Analysis"
date: "2026-05-07"
---

Wireshark is a network traffic analyzer (packet sniffer / protocol analyzer). It captures packets in real time or reads from .pcap / .pcapng files, decodes protocols, and lets you examine every packet in detail.

- Website: https://www.wireshark.org
- Formats: .pcap (tcpdump), .pcapng (modern, with metadata)
- GUI: Wireshark | CLI: tshark, dumpcap

---

## Wireshark Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  Menu + Toolbar                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Display Filter Bar  [ tcp.port == 80          ] [Apply]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Packet List                                                    │
│  No. │ Time  │ Source      │ Destination │ Protocol │ Info      │
│  1   │ 0.000 │ 192.168.1.1 │ 8.8.8.8    │ DNS      │ Query A   │
│  2   │ 0.012 │ 8.8.8.8     │ 192.168.1.1 │ DNS     │ Response  │
│  3   │ 0.013 │ 192.168.1.1 │ 93.184.216  │ TCP     │ SYN       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Packet Details (protocol tree)                                 │
│  ▼ Frame 3: 74 bytes on wire                                    │
│  ▼ Ethernet II, Src: aa:bb:cc:dd:ee:ff, Dst: 11:22:33:44:55:66 │
│  ▼ Internet Protocol Version 4, Src: 192.168.1.1, Dst: 93.x.x  │
│  ▼ Transmission Control Protocol, Src Port: 54321, Dst Port: 80 │
│    Flags: 0x002 (SYN)                                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Packet Bytes (hex + ASCII dump)                                │
│  0000  45 00 00 3c 1c 46 40 00 40 06 b1 e6 c0 a8 01 01         │
│  0010  5d b8 d8 22 d4 31 00 50 00 00 00 00 a0 02 fa f0         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Status bar: Packets: 1234 | Displayed: 56 | Marked: 0
```

---

## Capturing Traffic

### Starting a Capture

```
1. Launch Wireshark
   - Select an interface from the list (eth0, wlan0, lo, any)
   - Click the interface or press "Start"

2. Capture Filter - set before capture begins
   Capture > Capture Filters...
   Syntax: BPF (Berkeley Packet Filter)
   Applied at the kernel level, reduces load

3. Display Filter - applied after capture
   Filter bar at the top
   Syntax: Wireshark Display Filter Language
   Applied to already-captured packets
```

### Capture Filters (BPF syntax)

```
# By host
host 192.168.1.1
src host 192.168.1.1
dst host 192.168.1.1

# By network
net 192.168.1.0/24
src net 10.0.0.0/8

# By port
port 80
src port 1024
dst port 443
portrange 8000-9000

# By protocol
tcp
udp
icmp
arp
ip6

# Combinations (and, or, not)
host 8.8.8.8 and port 53
tcp and not port 22
src host 192.168.1.1 and dst port 80
not arp and not icmp

# By packet size
less 128
greater 1000
len == 64

# By MAC address
ether host aa:bb:cc:dd:ee:ff
ether src aa:bb:cc:dd:ee:ff

# Capture only the first N bytes of each packet (snaplen)
# Set in Capture Options: -s 96
```

### Capture Modes

```
Promiscuous mode (enabled by default):
- Captures all traffic on the segment, not just what's addressed to us
- Requires adapter support

Monitor mode (Wi-Fi only):
- Captures 802.11 frames including management frames
- Set up: airmon-ng start wlan0 -> wlan0mon

Ring buffer (continuous capture):
- Capture > Capture Options > Output
- Multiple files of N MB or N minutes each
- Old files get overwritten

Remote capture:
- Capture > Remote Interfaces
- rpcap:// protocol
- Or: ssh user@host 'tcpdump -w - -i eth0' | wireshark -k -i -
```

---

## Display Filters - Syntax

### Basic Syntax

```
Format: field  operator  value

Comparison operators:
  ==   or  eq    equal
  !=   or  ne    not equal
  >    or  gt    greater than
  <    or  lt    less than
  >=   or  ge    greater or equal
  <=   or  le    less or equal
  ~=   or  matches  Perl regex match
  contains          contains substring

Logical operators:
  &&   or  and   logical AND
  ||   or  or    logical OR
  !    or  not   logical NOT
  xor  or  ^^    exclusive OR

Field existence:
  tcp.flags.syn               # field exists (SYN flag is set)
  !tcp.flags.syn              # flag is not set

Grouping with parentheses:
  (ip.src == 10.0.0.1 || ip.src == 10.0.0.2) && tcp.port == 80
```

### IP Filters

```
# By address
ip.addr == 192.168.1.1              # source or destination
ip.src == 192.168.1.1               # source only
ip.dst == 8.8.8.8                   # destination only

# Range (CIDR)
ip.addr == 192.168.1.0/24
ip.src == 10.0.0.0/8

# Exclusion
!(ip.addr == 192.168.1.1)
ip.addr != 192.168.1.1              # careful! != works differently

# IMPORTANT: ip.addr != X does not work as expected!
# A packet shows if at least one field (src or dst) != X
# Correct: !(ip.addr == X)

# IPv6
ipv6.addr == 2001:db8::1
ipv6.src == fe80::1

# TTL
ip.ttl <= 5                         # almost expired
ip.ttl == 64

# Fragmentation
ip.flags.df == 1                    # Don't Fragment set
ip.flags.mf == 1                    # More Fragments
ip.frag_offset > 0                  # fragmented packet
```

### TCP Filters

```
# By port
tcp.port == 80
tcp.srcport == 443
tcp.dstport == 22
tcp.port in {80, 443, 8080, 8443}   # multiple ports

# By flags
tcp.flags.syn == 1                  # SYN
tcp.flags.ack == 1                  # ACK
tcp.flags.fin == 1                  # FIN
tcp.flags.rst == 1                  # RST
tcp.flags.push == 1                 # PSH
tcp.flags.urg == 1                  # URG

# Flag combinations
tcp.flags == 0x002                  # SYN only (hex)
tcp.flags == 0x012                  # SYN + ACK
tcp.flags == 0x004                  # RST
tcp.flags == 0x010                  # ACK only
tcp.flags == 0x018                  # PSH + ACK

# By sequence/acknowledgment
tcp.seq == 0
tcp.ack == 1
tcp.seq_raw                         # absolute sequence number

# Problems (Wireshark expert analysis)
tcp.analysis.retransmission         # retransmissions
tcp.analysis.fast_retransmission    # fast retransmissions
tcp.analysis.duplicate_ack          # duplicate ACKs
tcp.analysis.out_of_order           # out-of-order packets
tcp.analysis.zero_window            # zero window (receiver buffer full)
tcp.analysis.window_full            # sender stopped (window full)
tcp.analysis.lost_segment           # Wireshark assumes loss
tcp.analysis.ack_lost_segment       # ACK for a lost segment

# Window size
tcp.window_size == 0                # zero window
tcp.window_size < 1024              # very small window

# Handshake
tcp.flags.syn == 1 && tcp.flags.ack == 0    # SYN (new connection)
tcp.flags.syn == 1 && tcp.flags.ack == 1    # SYN-ACK
tcp.flags.fin == 1                          # connection teardown

# RST (connection reset)
tcp.flags.rst == 1
```

### UDP Filters

```
udp.port == 53                      # DNS
udp.srcport == 67                   # DHCP server
udp.dstport == 68                   # DHCP client
udp.length > 512
```

### Protocol Filters

```
# Protocol name
dns
http
https
tls
ssl
ftp
ssh
smtp
pop
imap
dhcp
arp
icmp
icmpv6
ospf
bgp
rip
stp
vlan
gre
esp
ah

# HTTP
http.request                        # HTTP requests
http.response                       # HTTP responses
http.request.method == "GET"
http.request.method == "POST"
http.response.code == 200
http.response.code == 404
http.response.code >= 400           # error responses
http.host == "example.com"
http.request.uri contains "/api/"
http.user_agent contains "curl"
http.cookie contains "session"
http.authorization                  # packets with auth header

# DNS
dns.qry.name == "google.com"        # specific domain query
dns.qry.name contains "google"
dns.qry.type == 1                   # A query
dns.qry.type == 28                  # AAAA query
dns.qry.type == 15                  # MX query
dns.flags.response == 0             # requests only
dns.flags.response == 1             # responses only
dns.flags.rcode == 0                # NOERROR
dns.flags.rcode == 3                # NXDOMAIN (domain not found)
dns.count.answers > 0               # responses with records

# TLS / HTTPS
tls.handshake                       # TLS handshake packets
tls.handshake.type == 1             # Client Hello
tls.handshake.type == 2             # Server Hello
tls.handshake.type == 11            # Certificate
tls.record.content_type == 21       # Alert (TLS errors)
tls.alert_message.desc == 42        # bad_certificate

# DHCP
dhcp.option.dhcp == 1               # DISCOVER
dhcp.option.dhcp == 2               # OFFER
dhcp.option.dhcp == 3               # REQUEST
dhcp.option.dhcp == 5               # ACK
dhcp.option.hostname                # packets with hostname
bootp.hw.mac_addr == aa:bb:cc:dd:ee:ff  # by MAC

# ARP
arp.opcode == 1                     # ARP Request
arp.opcode == 2                     # ARP Reply
arp.src.proto_ipv4 == 192.168.1.1
arp.duplicate-address-detected      # duplicate IP (conflict)

# ICMP
icmp.type == 8                      # Echo Request (ping)
icmp.type == 0                      # Echo Reply
icmp.type == 3                      # Destination Unreachable
icmp.type == 11                     # Time Exceeded
icmp.code == 3                      # Port Unreachable
```

### Content Filters

```
# Search string in payload
frame contains "password"
tcp contains "HTTP"
udp contains "admin"

# Regular expression
frame matches "pass(word|wd)"
http.request.uri matches "\\.(php|asp|aspx)$"

# By packet size
frame.len == 64                     # exact size
frame.len > 1400                    # large packets
frame.len < 100                     # small packets
tcp.len > 0                         # TCP with data (not bare ACKs)

# By time
frame.time_relative > 10            # after 10 seconds
frame.time_delta > 1                # pause > 1 sec between packets
```

### Useful Compound Filters

```
# Specific TCP stream (conversation)
tcp.stream eq 5                     # stream number 5

# All traffic minus noise
!(arp or icmp or dns or stp)

# Data packets only (no bare ACKs)
tcp.len > 0

# Port scanning (SYN flood / lots of RST)
tcp.flags.rst == 1

# SSH brute force (many SYNs to port 22)
tcp.dstport == 22 && tcp.flags.syn == 1

# HTTP Basic Auth in plain text
http.authorization

# TCP problems - anything flagged
tcp.analysis.flags
tcp.analysis.retransmission || tcp.analysis.lost_segment

# Traffic not from our subnet (anomaly)
!(ip.src == 192.168.1.0/24) && !(ip.dst == 192.168.1.0/24)

# Large transfers (potential data exfiltration)
tcp.len > 5000

# DNS to non-standard servers
dns && !(ip.dst == 8.8.8.8) && !(ip.dst == 1.1.1.1)

# TLS on non-standard ports
tls && !(tcp.dstport == 443)
```

---

## Working with Streams

### Follow Stream

```
Follow TCP Stream:
- Right-click a packet -> Follow -> TCP Stream
- Wireshark assembles the full TCP conversation as text
- Red = client, Blue = server
- Can save as Raw data, Hex dump, C Arrays

Follow UDP Stream:
- Same for UDP (DNS, VoIP)

Follow TLS Stream:
- If decryption keys are available -> shows decrypted traffic

Keyboard shortcut: Ctrl+Alt+Shift+T (TCP Stream)
```

### Conversation and Endpoint Statistics

```
Statistics > Conversations
- TCP / UDP / IP conversations
- Packet count, bytes, duration
- Sort by bytes -> find top talkers

Statistics > Endpoints
- List of all IP/MAC addresses
- Inbound / outbound traffic per endpoint

Statistics > Protocol Hierarchy
- Protocol tree with percentages
- Quickly see: 80% TCP, 60% TLS, 10% UDP...

Statistics > IO Graph
- Traffic graph over time
- Multiple curves with different filters
- Find load spikes, traffic patterns
```

---

## tshark - Wireshark CLI

### Capturing Traffic

```bash
# Capture to file
tshark -i eth0 -w capture.pcap

# Capture with BPF filter
tshark -i eth0 -f "tcp port 80" -w http.pcap

# Limit packet count
tshark -i eth0 -c 1000 -w capture.pcap

# Limit capture duration (seconds)
tshark -i eth0 -a duration:60 -w capture.pcap

# Ring buffer: 5 files of 10MB each
tshark -i eth0 -b filesize:10240 -b files:5 -w ring.pcap

# Capture on multiple interfaces
tshark -i eth0 -i eth1 -w multi.pcap

# List available interfaces
tshark -D
```

### Reading and Filtering

```bash
# Read from file
tshark -r capture.pcap

# Display filter
tshark -r capture.pcap -Y "http.request"

# Print specific fields
tshark -r capture.pcap -Y "dns" \
  -T fields \
  -e frame.number \
  -e ip.src \
  -e ip.dst \
  -e dns.qry.name \
  -e dns.a

# Output formats
tshark -r capture.pcap -T json       # JSON
tshark -r capture.pcap -T pdml       # XML (detailed)
tshark -r capture.pcap -T text       # text (default)
tshark -r capture.pcap -T fields ... # specified fields only

# Statistics
tshark -r capture.pcap -q -z io,stat,1          # traffic per second
tshark -r capture.pcap -q -z conv,tcp            # TCP conversations
tshark -r capture.pcap -q -z endpoints,ip        # IP endpoints
tshark -r capture.pcap -q -z http,tree           # HTTP statistics
tshark -r capture.pcap -q -z dns,tree            # DNS statistics
tshark -r capture.pcap -q -z pkt_len,tree        # size distribution
```

### Practical tshark Examples

```bash
# All HTTP requests with URL
tshark -r capture.pcap -Y "http.request" \
  -T fields -e http.request.method -e http.host -e http.request.uri \
  -E separator=" " -E quote=d

# DNS queries - what is the host resolving
tshark -r capture.pcap -Y "dns.flags.response == 0" \
  -T fields -e ip.src -e dns.qry.name -e dns.qry.type

# Plaintext credentials (HTTP Basic Auth)
tshark -r capture.pcap -Y "http.authorization" \
  -T fields -e ip.src -e http.authorization

# Top 10 IPs by traffic
tshark -r capture.pcap -q -z endpoints,ip | sort -k2 -rn | head -10

# Find retransmissions
tshark -r capture.pcap -Y "tcp.analysis.retransmission" \
  -T fields -e frame.number -e ip.src -e ip.dst -e tcp.analysis.retransmission

# Export HTTP objects (files)
tshark -r capture.pcap --export-objects http,/tmp/http_objects/

# Show TLS SNI (which HTTPS domains are being accessed)
tshark -r capture.pcap -Y "tls.handshake.type == 1" \
  -T fields -e ip.src -e ip.dst -e tls.handshake.extensions_server_name

# Search for a string in traffic
tshark -r capture.pcap -Y 'frame contains "password"' \
  -T fields -e frame.number -e ip.src -e ip.dst
```

---

## Analyzing Specific Scenarios

### HTTP Traffic Analysis

```
Filters:
  http                              # all HTTP
  http.request                      # requests
  http.response                     # responses
  http.response.code >= 400         # error responses
  http.request.method == "POST"     # POST requests

What to look at:
1. Statistics > HTTP > Requests    - top requests
2. Statistics > HTTP > Load Distribution
3. Follow TCP Stream               - full conversation
4. Packet Details > HTTP           - headers, cookies, body

Exporting files:
  File > Export Objects > HTTP
  Wireshark reconstructs files from HTTP responses (images, JS, etc.)
```

### DNS Traffic Analysis

```
Filters:
  dns                               # all DNS
  dns.flags.response == 1 && dns.flags.rcode == 3   # NXDOMAIN
  dns.qry.type == 28               # AAAA queries

What to look at:
1. Statistics > DNS                - response time, query types
2. Field dns.time -> server response time
3. No reply to a query -> DNS server unreachable or timeout

Anomalies:
- Many NXDOMAIN -> wrong DNS or DGA (malware)
- Long random domain names -> DGA
- DNS to non-standard IPs -> potential DNS tunneling
- Large TXT records -> DNS tunneling
- dns.resp.len > 512 && !tcp -> possible DNS amplification
```

### TLS / HTTPS Analysis

```
Filters:
  tls
  tls.handshake.type == 1          # Client Hello
  tls.alert_message                # TLS errors
  tls.record.content_type == 21    # Alert

What to look at in Client Hello:
- TLS version (should be 1.2 or 1.3)
- SNI (Server Name Indication) -> which domain
- Cipher Suites -> what algorithms the client proposes
- Extensions

Decrypting TLS (if keys are available):
  Edit > Preferences > Protocols > TLS
  - (Pre)-Master-Secret log file (SSLKEYLOGFILE)

  # In browser / curl:
  export SSLKEYLOGFILE=/tmp/ssl_keys.log
  curl https://example.com
  # or launch Chrome/Firefox with this env variable

  # Point Wireshark to the key file
  # Wireshark will decrypt the traffic automatically
```

### TCP Problem Analysis

```
Key diagnostic filters:
  tcp.analysis.retransmission         # retransmissions
  tcp.analysis.fast_retransmission    # fast (3 dup ACKs)
  tcp.analysis.duplicate_ack          # duplicate ACKs
  tcp.analysis.out_of_order           # out-of-order packets
  tcp.analysis.zero_window            # receiver not reading
  tcp.analysis.window_full            # sender paused
  tcp.analysis.lost_segment           # Wireshark assumes loss

TCP Handshake problems:
  tcp.flags.syn == 1 && !tcp.flags.ack == 1  # SYN without SYN-ACK
  tcp.flags.rst == 1                          # RST reset

Latency analysis:
  tcp.time_delta > 0.1                # pause > 100ms between packets

Statistics > TCP Stream Graphs:
  - Time/Sequence (Stevens)  - data growth over time
  - Window Scaling           - window size over time
  - Round Trip Time          - RTT per packet
  - Throughput               - throughput over time
```

### DHCP Analysis

```
Filters:
  dhcp                              # all DHCP (or bootp)
  dhcp.option.dhcp == 1             # DISCOVER
  dhcp.option.dhcp == 2             # OFFER
  dhcp.option.dhcp == 3             # REQUEST
  dhcp.option.dhcp == 5             # ACK
  dhcp.option.dhcp == 6             # NAK (refusal)

DORA process (normal scenario):
  DISCOVER -> OFFER -> REQUEST -> ACK

Problems:
- DISCOVER without OFFER -> no DHCP server
- NAK instead of ACK -> conflict or misconfiguration
- Multiple OFFERs -> multiple DHCP servers (a problem!)
- arp.duplicate-address-detected -> IP conflict after lease

What to look at in ACK:
  - Assigned IP address
  - Lease time
  - Default gateway (option 3)
  - DNS servers (option 6)
```

### ARP Analysis

```
Filters:
  arp
  arp.opcode == 1                   # Request
  arp.opcode == 2                   # Reply
  arp.duplicate-address-detected    # IP conflict

ARP Spoofing detection:
  - Multiple different MACs replying for the same IP
  - arp.src.hw_mac != arp.dst.hw_mac in Reply for same IP
  - Frequent ARP Replies without preceding Request

# Wireshark automatically flags duplicate ARP as Expert Info
```

---

## Expert Information

```
Analyze > Expert Information

Wireshark automatically flags anomalies:

Severity levels:
  Error   (red)    - serious issues (TCP RST, malformed)
  Warning (yellow) - retransmissions, duplicate ACKs, zero window
  Note    (blue)   - unexpected ACK, simultaneous SYN-FIN
  Chat    (white)  - normal events (TCP/TLS handshake)

Useful categories:
  Sequence            - TCP sequence problems
  Connection          - connection problems
  Protocol            - protocol errors
```

---

## Coloring Rules

```
View > Coloring Rules

Built-in colors:
  Green      - TCP
  Light blue - UDP
  Dark blue  - DNS
  Cyan       - HTTP
  Black      - errors (RST, ICMP unreachable)

Creating custom rules:
  1. View > Coloring Rules > + (add)
  2. Name: "High Latency"
  3. Filter: tcp.time_delta > 0.5
  4. Background color: red

Example custom rules:
  "TCP Problems"   tcp.analysis.flags            -> red
  "HTTP Errors"    http.response.code >= 400      -> orange
  "DNS NX"         dns.flags.rcode == 3           -> yellow
  "Large Packets"  frame.len > 1400               -> purple
```

---

## Columns - Customizing the Display

```
Edit > Preferences > Columns (or right-click a column header)

Useful columns to add:
  - ip.src           -> Source IP
  - ip.dst           -> Destination IP
  - tcp.srcport      -> Src Port
  - tcp.dstport      -> Dst Port
  - http.host        -> HTTP Host
  - dns.qry.name     -> DNS Query
  - tls.handshake.extensions_server_name -> TLS SNI
  - frame.time_delta -> Delta time (pause between packets)
  - tcp.time_delta   -> TCP Delta

Right-click any field in Packet Details:
  "Apply as Column" -> instantly adds that field as a column
```

---

## Saving and Exporting

```
Save capture:
  File > Save As                   - save entire capture
  File > Export Specified Packets  - filtered packets only

Export objects (files from traffic):
  File > Export Objects > HTTP     - files from HTTP
  File > Export Objects > SMB      - files from SMB
  File > Export Objects > DICOM    - medical images
  File > Export Objects > IMF      - email

Export as CSV / JSON:
  File > Export Packet Dissections > As CSV
  File > Export Packet Dissections > As JSON

Save a filter as a button:
  After typing a filter, click + next to the filter bar
  Creates a quick-apply button for that filter
```

---

## Wireshark Profiles

```
Edit > Configuration Profiles

Lets you maintain separate sets of settings:
  - Default          - standard settings
  - HTTP Analysis    - custom columns + filters for HTTP
  - Security Audit   - settings for security analysis

A profile includes:
  - Coloring rules
  - Columns
  - Display filter buttons
  - Preferences
```

---

## Wireshark for Security

### Detecting Scans

```
# Port scan (nmap SYN scan)
tcp.flags.syn == 1 && tcp.flags.ack == 0 && ip.src == <scanner>

# Lots of RST -> responses to closed ports
tcp.flags.rst == 1

# UDP scan -> ICMP Port Unreachable
icmp.type == 3 && icmp.code == 3

# Host sending RST to many ports in a short time
# -> sign of scanning
```

### Detecting Anomalies

```
# Traffic to non-standard ports
!(tcp.dstport in {80, 443, 22, 25, 53, 3389, 8080})

# DNS tunneling (large TXT records)
dns.qry.type == 16 && dns.resp.len > 100    # TXT queries

# Data in ICMP (ICMP tunneling)
icmp.type == 8 && data.len > 100

# Many connections from a single host
# -> analyze in Statistics > Conversations

# Suspicious User-Agent
http.user_agent contains "curl" || http.user_agent contains "wget"
http.user_agent contains "python"

# Credentials in plaintext
http.authorization
ftp.request.command == "PASS"
```

### Malware Traffic Analysis

```
Common signs:
1. Beacon traffic - regular check-ins to C2
   frame.time_delta ~= constant interval + constant dst

2. DNS DGA (Domain Generation Algorithm)
   - Many NXDOMAIN responses
   - Long random-looking domain names
   dns.flags.rcode == 3

3. Unusual protocols
   - TCP/UDP on non-standard ports
   - ICMP with payload data
   - DNS with large responses

4. Outbound connections to new hosts
   - ip.dst outside known ranges

Useful resources:
  https://www.malware-traffic-analysis.net/ - .pcap samples with malware
  https://www.netresec.com/?page=PcapFiles  - pcap file collections
```

---

## Wireshark Keyboard Shortcuts

```
Capture:
  Ctrl+E          - start/stop capture
  Ctrl+K          - open Capture Options

Navigation:
  Ctrl+F          - find packet
  Ctrl+G          - go to packet by number
  Ctrl+Home       - first packet
  Ctrl+End        - last packet
  Ctrl+Up/Down    - previous/next with same column value

Filters:
  Ctrl+/          - clear Display Filter
  Enter           - apply filter
  Right-click > Apply as Filter - apply field value as filter

Display:
  Ctrl+W          - close file
  Ctrl+S          - save
  Ctrl+Shift+P    - Preferences
  Ctrl+Alt+Shift+T - Follow TCP Stream
  Ctrl+Alt+Shift+U - Follow UDP Stream

Marking:
  Ctrl+M          - mark/unmark packet
  Ctrl+Shift+N    - next marked packet
  Ctrl+Shift+B    - previous marked packet
```

---

## Filter Cheat Sheet

```
IP:
  ip.addr == X                    ip.src | ip.dst
  ip.addr == X/24                 CIDR range
  !(ip.addr == X)                 exclude host
  ip.ttl < 10                     low TTL

TCP:
  tcp.port == 80                  tcp.srcport | tcp.dstport
  tcp.port in {80 443 8080}       multiple ports
  tcp.flags == 0x002              SYN only
  tcp.flags == 0x012              SYN-ACK
  tcp.flags.rst == 1              RST
  tcp.analysis.retransmission     retransmissions
  tcp.analysis.zero_window        zero window
  tcp.len > 0                     packets with data

HTTP:
  http.request.method == "POST"
  http.response.code >= 400
  http.host contains "example"
  http.authorization              credentials

DNS:
  dns.qry.name == "example.com"
  dns.flags.rcode == 3            NXDOMAIN
  dns.qry.type == 1               A records

TLS:
  tls.handshake.type == 1         Client Hello
  tls.handshake.extensions_server_name  SNI
  tls.alert_message               errors

ICMP:
  icmp.type == 8                  ping request
  icmp.type == 11                 TTL exceeded

Content:
  frame contains "text"
  tcp contains "password"
  frame matches "regex"
  frame.len > 1400

Meta:
  tcp.stream eq 5                 specific stream
  frame.time_delta > 1            pause > 1 sec
  tcp.analysis.flags              any TCP anomalies
  !(arp or icmp or dns or stp)    remove noise
```

---

## References

- [Wireshark Display Filter Reference](https://www.wireshark.org/docs/dfref/) - full field reference
- [Wireshark User's Guide](https://www.wireshark.org/docs/wsug_html_chunked/) - official documentation
- [Sample Captures](https://wiki.wireshark.org/SampleCaptures) - example .pcap files
- [Malware Traffic Analysis](https://www.malware-traffic-analysis.net/) - real malware traffic
- [Cheat Sheet (PacketLife)](https://packetlife.net/media/library/13/Wireshark_Display_Filters.pdf) - filters PDF
