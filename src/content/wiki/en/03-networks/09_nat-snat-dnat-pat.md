---
title: "NAT - SNAT, DNAT, PAT"
date: "2026-04-26"
---

NAT (Network Address Translation) is a mechanism for rewriting IP addresses as packets pass through a router or firewall. It allows many devices with private addresses to reach the internet through one public IP, hides internal network topology, and publishes internal services to the outside world.

---

## NAT Basics

### Why NAT Exists

```
Two main reasons:

1. IPv4 address exhaustion:
   Only ~4.3 billion IPv4 addresses total.
   All of them have long been allocated.
   NAT lets thousands of devices share one public IP.

2. Security and isolation:
   Internal addresses are not routable on the internet.
   Outside hosts cannot directly initiate connections to internal hosts
   (unless DNAT / Port Forwarding is explicitly configured).

Private addresses (RFC 1918) - not routable on the internet:
  10.0.0.0/8       (10.0.0.0 - 10.255.255.255)
  172.16.0.0/12    (172.16.0.0 - 172.31.255.255)
  192.168.0.0/16   (192.168.0.0 - 192.168.255.255)

  Also:
  127.0.0.0/8      - loopback
  169.254.0.0/16   - link-local (APIPA, auto-configuration)
  100.64.0.0/10    - shared address space (CGNAT, RFC 6598)
```

### NAT Terminology

```
Inside Local:
  Private IP of an internal host (as the host sees itself).
  Example: 192.168.1.10

Inside Global:
  Public IP of an internal host (as the internet sees it).
  Example: 203.0.113.5

Outside Local:
  IP of an external host as seen from inside the network.
  Usually matches Outside Global (unless double NAT is in use).

Outside Global:
  Real IP of an external host (as the internet sees it).
  Example: 8.8.8.8

NAT translation table:
  Stores the mapping: Inside Local ↔ Inside Global (+ ports for PAT).
  Created dynamically when a connection is established.
  Entries expire after a timeout.
```

### Types of NAT

```
Static NAT (1:1):
  One private IP → one public IP.
  Permanent mapping, never changes.
  Used for servers that need a fixed public IP.

Dynamic NAT (many:many):
  Pool of private IPs → pool of public IPs.
  Mapping is assigned dynamically from the pool.
  If all public IPs are in use → new connections are dropped.
  Rarely used today.

PAT / NAT Overload (many:1):
  Many private IPs → one public IP.
  Differentiated by source port number.
  The most common type (home routers, offices).
  Also called: IP Masquerading (Linux), NAT Overload (Cisco).

SNAT (Source NAT):
  The source IP (src IP) is rewritten.
  Used when internal hosts go out to the internet.
  Can be Static NAT or PAT.

DNAT (Destination NAT):
  The destination IP (dst IP) is rewritten.
  Used to publish internal services externally.
  Also called: Port Forwarding, Virtual Server.
```

---

## SNAT - Source NAT

### How SNAT Works

```
An internal host initiates a connection to the outside world.
The NAT device replaces the src IP (and port for PAT) with its public IP.

Without NAT (doesn't work - private IP is not routable):
  Host (192.168.1.10) → packet with src=192.168.1.10 → internet
  Reply never arrives (192.168.1.10 is not a public address).

With SNAT:
  Host (192.168.1.10) sends a packet:
    src IP: 192.168.1.10, dst IP: 8.8.8.8

  NAT device receives it, creates a table entry:
    192.168.1.10:52341 ↔ 203.0.113.5:52341 (or another port with PAT)

  NAT device rewrites the packet:
    src IP: 203.0.113.5  (replaced!)
    dst IP: 8.8.8.8      (unchanged)

  8.8.8.8 replies:
    src IP: 8.8.8.8, dst IP: 203.0.113.5

  NAT device receives the reply, looks up the table:
    dst 203.0.113.5:52341 → 192.168.1.10:52341

  NAT device rewrites the reply:
    src IP: 8.8.8.8      (unchanged)
    dst IP: 192.168.1.10 (restored!)

  The host receives the reply and has no idea NAT was involved.
```

### SNAT on Linux (iptables)

```
# SNAT - replace src IP with a specific address
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
  -j SNAT --to-source 203.0.113.5

# MASQUERADE - automatically use the interface's IP
# (convenient when the public IP is dynamic - DHCP, PPPoE)
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
  -j MASQUERADE

# Enable IP forwarding (required!)
echo 1 > /proc/sys/net/ipv4/ip_forward
# Persistent:
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

# View NAT rules
iptables -t nat -L -n -v
# Chain POSTROUTING (policy ACCEPT 0 packets, 0 bytes)
# target     prot opt source          destination
# MASQUERADE all  --  192.168.1.0/24  0.0.0.0/0

# View connection tracking table
conntrack -L
# tcp  6  431999  ESTABLISHED src=192.168.1.10 dst=8.8.8.8 sport=52341 dport=53
#   [UNREPLIED] src=8.8.8.8 dst=203.0.113.5 sport=53 dport=52341
#   [ASSURED] mark=0 ...

conntrack -L --src 192.168.1.10   (filter by src)
conntrack -D --src 192.168.1.10   (delete entry)
```

### SNAT on Linux (nftables, modern way)

```
# /etc/nftables.conf
table ip nat {
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;

        # MASQUERADE for dynamic IP
        ip saddr 192.168.1.0/24 oif "eth0" masquerade

        # Or SNAT for a static IP
        ip saddr 192.168.1.0/24 oif "eth0" snat to 203.0.113.5
    }
}

# Apply
nft -f /etc/nftables.conf

# Verify
nft list table ip nat
nft list ruleset
```

### SNAT on Cisco (IOS)

```
# Static NAT (1:1) - one IP to one IP
ip nat inside source static 192.168.1.10 203.0.113.5

# Dynamic NAT with a pool
ip nat pool MY-POOL 203.0.113.10 203.0.113.20 netmask 255.255.255.0
ip access-list standard NAT-INSIDE
  permit 192.168.1.0 0.0.0.255
ip nat inside source list NAT-INSIDE pool MY-POOL

# NAT Overload (PAT) - all through one IP
ip access-list standard NAT-INSIDE
  permit 192.168.1.0 0.0.0.255
ip nat inside source list NAT-INSIDE interface GigabitEthernet0/0 overload

# Configure interfaces
interface GigabitEthernet0/0
  ip nat outside         (faces the internet)
interface GigabitEthernet0/1
  ip nat inside          (faces the internal network)

# Verify
show ip nat translations
# Pro Inside global      Inside local       Outside local      Outside global
# tcp 203.0.113.5:1024   192.168.1.10:52341 8.8.8.8:80        8.8.8.8:80
# tcp 203.0.113.5:1025   192.168.1.20:43210 1.1.1.1:443       1.1.1.1:443

show ip nat statistics
# Total active translations: 5 (0 static, 5 dynamic; 5 extended)
# Outside interfaces: GigabitEthernet0/0
# Inside interfaces: GigabitEthernet0/1
# Hits: 1523  Misses: 12

# Clear NAT table
clear ip nat translation *
clear ip nat translation inside 192.168.1.10   (specific entry)
```

---

## DNAT - Destination NAT

### How DNAT Works

```
An external host connects to the public IP.
The NAT device redirects the connection to an internal host.

Task: publish an internal web server (192.168.1.100:80)
      externally via public IP 203.0.113.5:80.

Incoming request:
  src IP: 1.2.3.4, dst IP: 203.0.113.5, dst port: 80

NAT device sees the DNAT rule:
  dst 203.0.113.5:80 → forward to 192.168.1.100:80

NAT device rewrites the packet:
  src IP: 1.2.3.4       (unchanged)
  dst IP: 192.168.1.100 (replaced!)
  dst port: 80          (unchanged, but can differ)

Internal server replies:
  src IP: 192.168.1.100, dst IP: 1.2.3.4

NAT device rewrites the reply (reverse SNAT):
  src IP: 203.0.113.5   (restored!)
  dst IP: 1.2.3.4       (unchanged)

External host receives the reply from 203.0.113.5 (unaware of 192.168.1.100).

Note: DNAT is usually paired with an automatic reverse SNAT.
      The firewall/router rewrites the src IP in the reply automatically.
```

### Port Forwarding (a specific case of DNAT)

```
Port Forwarding = DNAT targeted at a specific port.

Examples:
  203.0.113.5:80  → 192.168.1.100:80   (web server)
  203.0.113.5:443 → 192.168.1.100:443  (HTTPS)
  203.0.113.5:22  → 192.168.1.50:22    (SSH to a specific server)
  203.0.113.5:25  → 192.168.1.200:25   (mail server)
  203.0.113.5:3389 → 192.168.1.30:3389 (RDP to Windows server)

You can also remap the port:
  203.0.113.5:2222 → 192.168.1.50:22
  Connect from outside on port 2222, land on internal port 22.
  Slight protection (security through obscurity) against bots scanning port 22.
```

### DNAT on Linux (iptables)

```
# DNAT - redirect incoming requests to an internal server
# Traffic to 203.0.113.5:80 → 192.168.1.100:80
iptables -t nat -A PREROUTING -d 203.0.113.5 -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.1.100:80

# DNAT with port remapping
# External :2222 → internal :22
iptables -t nat -A PREROUTING -d 203.0.113.5 -p tcp --dport 2222 \
  -j DNAT --to-destination 192.168.1.50:22

# Also allow forwarding to the server
iptables -A FORWARD -d 192.168.1.100 -p tcp --dport 80 -j ACCEPT
iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

# DNAT for UDP (e.g. DNS)
iptables -t nat -A PREROUTING -p udp --dport 53 \
  -j DNAT --to-destination 192.168.1.53:53

# Full example - publishing a web server
# 1. IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward

# 2. DNAT (incoming → server)
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.1.100:80

# 3. MASQUERADE (outgoing → public IP)
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# 4. Allow FORWARD
iptables -A FORWARD -i eth0 -o eth1 -p tcp --dport 80 \
  -d 192.168.1.100 -j ACCEPT
iptables -A FORWARD -i eth1 -o eth0 -m state \
  --state ESTABLISHED,RELATED -j ACCEPT
```

### DNAT on Linux (nftables)

```
# /etc/nftables.conf
table ip nat {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;

        # HTTP to web server
        iif "eth0" tcp dport 80 dnat to 192.168.1.100:80

        # SSH with port remapping
        iif "eth0" tcp dport 2222 dnat to 192.168.1.50:22

        # RDP
        iif "eth0" tcp dport 3389 dnat to 192.168.1.30:3389
    }

    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        oif "eth0" masquerade
    }
}
```

### DNAT on Cisco (IOS)

```
# Static DNAT (Port Forwarding)
# External :80 → internal 192.168.1.100:80
ip nat inside source static tcp 192.168.1.100 80 interface GigabitEthernet0/0 80

# With a specific public IP
ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80

# SSH on a different port
ip nat inside source static tcp 192.168.1.50 22 203.0.113.5 2222

# UDP (e.g. DNS)
ip nat inside source static udp 192.168.1.53 53 203.0.113.5 53

# Verify
show ip nat translations
# Pro Inside global         Inside local         Outside local  Outside global
# tcp 203.0.113.5:80        192.168.1.100:80     ---            ---
# tcp 203.0.113.5:2222      192.168.1.50:22      ---            ---
```

### Hairpin NAT (NAT Loopback)

```
Problem:
  An internal host (192.168.1.10) tries to reach its own server
  (192.168.1.100) using the public IP (203.0.113.5).

  Without Hairpin NAT:
    Packet goes to 203.0.113.5 → DNAT → lands on 192.168.1.100.
    But the server's reply (from 192.168.1.100) goes directly to 192.168.1.10,
    bypassing the NAT device.
    The host expected a reply from 203.0.113.5, received one from 192.168.1.100 → broken!

  Hairpin NAT fixes this:
    The NAT device sees a DNAT request coming from inside,
    applies an additional SNAT: src = NAT device's internal IP.
    The server replies to the NAT device → which forwards it to the host.
    Everything works, though inefficiently (traffic goes through the router twice).

Better solution: use the internal IP inside the network, or split-horizon DNS.
  Split DNS: for internal hosts, 203.0.113.5 resolves to 192.168.1.100.

Linux Hairpin NAT:
  iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -d 192.168.1.100 \
    -p tcp --dport 80 -j MASQUERADE

Cisco Hairpin NAT:
  ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80
  (works automatically on Cisco if both sides are "inside")
```

---

## PAT - Port Address Translation

### How PAT Works

```
PAT (Port Address Translation) = NAT Overload = IP Masquerading.
Many internal hosts → one public IP.
Sessions are distinguished by source port number.

PAT table (example):
┌──────────────────────┬──────────────────────┬──────────────────┐
│   Inside Local       │   Inside Global      │  Outside         │
│   (private)          │   (public)           │                  │
├──────────────────────┼──────────────────────┼──────────────────┤
│ 192.168.1.10:52341   │ 203.0.113.5:1024     │ 8.8.8.8:53       │
│ 192.168.1.10:52342   │ 203.0.113.5:1025     │ 8.8.8.8:80       │
│ 192.168.1.20:44123   │ 203.0.113.5:1026     │ 1.1.1.1:443      │
│ 192.168.1.30:61234   │ 203.0.113.5:1027     │ 8.8.8.8:53       │
│ 192.168.1.20:44124   │ 203.0.113.5:1028     │ 172.217.16.4:80  │
└──────────────────────┴──────────────────────┴──────────────────┘

Multiple hosts, one public IP (203.0.113.5),
different source ports allow distinguishing sessions.

PAT limitation:
  Port is a 16-bit number (1-65535).
  One public IP → theoretically 65535 simultaneous connections.
  In practice: ~4000-64000 (some are reserved).
  Under heavy load: use multiple public IPs for PAT.
```

### Port Conflicts in PAT

```
What if two hosts use the same source port?
  192.168.1.10:52341 → 8.8.8.8:53
  192.168.1.20:52341 → 8.8.8.8:53

The PAT device reassigns the port for one of them:
  192.168.1.10:52341 → 203.0.113.5:1024
  192.168.1.20:52341 → 203.0.113.5:1025   (port changed!)

This is how PAT works - source ports may be remapped.
Internal hosts never notice this.
```

### Portless Protocols (ICMP and PAT)

```
ICMP has no ports (it's an L3 protocol).
How does PAT tell apart ICMP sessions from different hosts?

For ICMP ping:
  ICMP Echo Request has an Identifier field (16 bits).
  PAT uses it as a "port" to distinguish sessions.

  192.168.1.10 ping id=1  → 203.0.113.5 id=1024
  192.168.1.20 ping id=1  → 203.0.113.5 id=1025  (id reassigned!)

For GRE (VPN tunnels):
  GRE has a Key field or Call ID.
  PAT uses it to distinguish tunnels.
  Limitation: often only one GRE tunnel can exist behind PAT
  (depends on implementation).

For IPsec:
  ESP has no ports.
  Works through NAT-T (NAT Traversal, RFC 3948):
  ESP is encapsulated in UDP port 4500.
  PAT handles UDP 4500 like any other UDP.
```

### PAT and ALG (Application Layer Gateway)

```
Some protocols embed IP addresses or ports inside their payload.
NAT rewrites addresses at the IP header level but not inside the payload.
Result: the connection breaks.

Protocols that need ALG:
  FTP (PORT mode):
    The client sends a PORT command: "connect back to me at 192.168.1.10:4567".
    The server tries → gets a private IP → can't connect.
    FTP ALG: intercepts the PORT command and replaces the private IP with public.

  SIP (VoIP):
    SIP packets contain an IP address for the media stream (in SDP payload).
    SIP ALG: replaces addresses inside the SDP.

  H.323 (legacy VoIP/video conferencing):
    Similar to SIP.

  TFTP, RTSP, IRC DCC.

Loading ALG modules (Linux):
  modprobe nf_conntrack_ftp      (FTP ALG)
  modprobe nf_conntrack_sip      (SIP ALG)
  modprobe nf_conntrack_h323

SIP ALG problem:
  Many routers have SIP ALG enabled by default.
  It frequently works incorrectly → VoIP calls fail.
  Recommendation: disable SIP ALG, use VPN or a SIP provider with STUN/TURN.
```

---

## CGNAT - Carrier-Grade NAT

```
CGNAT (Carrier-Grade NAT) = Large Scale NAT (LSN).
Double NAT: NAT at the ISP + NAT at the user's router.

  Host (192.168.1.10)
    ↓ home router NAT
  100.64.0.x  (shared address space, RFC 6598)
    ↓ ISP CGNAT
  1.2.3.4  (ISP's public IP)
    ↓
  Internet

CGNAT problems:
  - Double NAT → port forwarding doesn't work
  - P2P apps (torrents, games) perform worse
  - Can't run a VPN server at home (no direct public IP)
  - ISP logs: one public IP = hundreds of users → forensic issues
  - Some sites block the 100.64.0.0/10 range

How to tell if you're behind CGNAT:
  Router's WAN IP: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, or 100.64.x.x
  (doesn't match IP shown on whatismyip.com)

Solutions:
  - Request a static public IP from the ISP (paid service)
  - IPv6 (no NAT needed)
  - VPN to a server with a public IP (WireGuard, OpenVPN)
  - Reverse tunnel (ngrok, frp, cloudflared) for publishing services
```

---

## NAT and IPv6

```
IPv6 was designed to eliminate the need for NAT.
There are enough IPv6 addresses for every device on the planet.

NAT66 (IPv6 → IPv6):
  Technically exists but is considered an anti-pattern.
  RFC 6296: NPTv6 (Network Prefix Translation) - rewrites only the prefix.
  Very rarely used.

NPTv6:
  2001:db8:1::/48 (internal) ↔ 2001:db8:2::/48 (external)
  Only the prefix changes, the host part stays the same.
  Stateless (no connection table needed).

NAT64 (IPv6 → IPv4):
  Lets IPv6-only clients reach IPv4 servers.
  Used in mobile networks and datacenters.
  Works with DNS64 (synthesizes AAAA records from A records).

  IPv6 client → NAT64 device → IPv4 server
  Target IPv6 address: 64:ff9b::/96 + IPv4 address
  Example: 64:ff9b::8.8.8.8 = 64:ff9b::808:808

  Enabling DNS64 on BIND9:
    options {
        dns64 64:ff9b::/96 {
            clients { any; };
        };
    };
```

---

## Conntrack - Linux Connection Tracking

```
Conntrack (Connection Tracking) - Linux mechanism for tracking connections.
The foundation of stateful NAT and stateful firewall.

Stores the state of every connection:
  (src IP, src port, dst IP, dst port, protocol) → state

Conntrack states:
  NEW         - first packet of a new connection
  ESTABLISHED - connection is up (packets seen in both directions)
  RELATED     - related connection (FTP data from FTP control)
  INVALID     - packet doesn't match any tracked connection
  UNTRACKED   - connection explicitly marked as not tracked
```

```
# View conntrack table
conntrack -L
# tcp  6  431999  ESTABLISHED
#   src=192.168.1.10 dst=8.8.8.8 sport=52341 dport=443
#   src=8.8.8.8 dst=203.0.113.5 sport=443 dport=52341
#   [ASSURED] mark=0 ...

conntrack -L --proto tcp           (TCP only)
conntrack -L --src 192.168.1.10    (from specific host)
conntrack -L | wc -l               (count connections)

# Statistics
conntrack -S
# cpu=0 found=0 invalid=12 ignore=523 insert=0 insert_failed=0
#        drop=0 early_drop=0 error=0 search_restart=0

# Maximum number of tracked connections
cat /proc/sys/net/netfilter/nf_conntrack_max
# 65536

# Current count
cat /proc/sys/net/netfilter/nf_conntrack_count

# Increase the limit (under high load)
echo 262144 > /proc/sys/net/netfilter/nf_conntrack_max
# Persistent:
echo "net.netfilter.nf_conntrack_max = 262144" >> /etc/sysctl.conf

# Connection timeouts
sysctl net.netfilter.nf_conntrack_tcp_timeout_established  # 432000 sec (5 days!)
sysctl net.netfilter.nf_conntrack_tcp_timeout_time_wait    # 120 sec
sysctl net.netfilter.nf_conntrack_udp_timeout              # 30 sec
sysctl net.netfilter.nf_conntrack_icmp_timeout             # 30 sec

# Reduce ESTABLISHED timeout for high-traffic servers
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600
```

---

## Troubleshooting NAT

### Packet Not Passing Through NAT

```
Step 1: Is IP forwarding enabled?
  cat /proc/sys/net/ipv4/ip_forward
  # Must be 1
  # If 0: echo 1 > /proc/sys/net/ipv4/ip_forward

Step 2: Are NAT rules being applied?
  iptables -t nat -L -n -v --line-numbers
  # Check the rule exists and the pkts counter is growing

Step 3: Capture traffic on both interfaces
  tcpdump -i eth1 -n host 192.168.1.10   (internal interface)
  tcpdump -i eth0 -n host 203.0.113.5    (external interface)

  Packet visible on eth1 but not eth0 → forwarding or NAT rule issue.
  Packet on eth0 but src IP unchanged → NAT rule didn't fire.

Step 4: Does conntrack see the connection?
  conntrack -L --src 192.168.1.10
  # No entry → packet never reached conntrack or was dropped earlier

Step 5: Check routing
  ip route get 8.8.8.8
  # Confirm there's a route via the correct interface
```

### DNAT Not Working (Port Forwarding)

```
Step 1: Is the DNAT rule present?
  iptables -t nat -L PREROUTING -n -v
  # Check the rule and its counter

Step 2: Is traffic reaching PREROUTING?
  tcpdump -i eth0 -n tcp port 80
  # Do we see incoming requests?

Step 3: Is traffic being forwarded to the server?
  tcpdump -i eth1 -n host 192.168.1.100
  # After DNAT the packet should appear here with dst=192.168.1.100

Step 4: Is the server replying?
  tcpdump -i eth1 -n host 192.168.1.100 and tcp
  # Do we see reply traffic from the server?

Step 5: Does the FORWARD chain allow it?
  iptables -L FORWARD -n -v
  # There must be a rule allowing traffic to 192.168.1.100:80

Common mistakes:
  - Forgot to allow in FORWARD chain (DNAT alone is not enough)
  - Server replies not going through NAT device (no default gateway on server)
  - Firewall on the server itself is blocking incoming traffic
  - SELinux/AppArmor blocking port binding
```

### Cisco NAT Diagnostics

```
# Enable debug (be careful on production!)
debug ip nat                        (basic debug)
debug ip nat detailed               (verbose)
no debug all                        (disable everything)

# Example debug ip nat output:
# NAT: s=192.168.1.10->203.0.113.5, d=8.8.8.8 [12345]
# NAT*: s=8.8.8.8, d=203.0.113.5->192.168.1.10 [12345]

# Check translations
show ip nat translations
show ip nat translations verbose     (detailed with timeouts)
show ip nat translations total       (count only)

# NAT statistics
show ip nat statistics

# Clear the table
clear ip nat translation *

# Verify interfaces are correctly marked
show ip interface GigabitEthernet0/0
# ...NAT: Inside source...  or  ...NAT: Outside...
```

---

## Cheat Sheet

```
NAT types:
  SNAT    - rewrite src IP (outbound traffic from inside)
  DNAT    - rewrite dst IP (inbound traffic, port forwarding)
  PAT     - SNAT using ports (many:1)
  Static  - fixed 1:1 mapping
  CGNAT   - double NAT at the ISP (100.64.0.0/10)

Private addresses (RFC 1918):
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16

Linux iptables SNAT:
  iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE
  echo 1 > /proc/sys/net/ipv4/ip_forward   (required!)

Linux iptables DNAT:
  iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
    -j DNAT --to-destination 192.168.1.100:80

Cisco SNAT (PAT):
  ip nat inside source list ACL interface Gi0/0 overload
  interface Gi0/0 → ip nat outside
  interface Gi0/1 → ip nat inside

Cisco DNAT (port forwarding):
  ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80

Conntrack (Linux):
  conntrack -L              list connections
  conntrack -L | wc -l      count
  conntrack -D --src IP     delete entry
  /proc/sys/net/netfilter/nf_conntrack_max   connection limit

Diagnostics:
  iptables -t nat -L -n -v      NAT rules
  conntrack -L                  connection tracking table
  tcpdump -i eth0 -n ...        capture traffic
  show ip nat translations      Cisco NAT table
  show ip nat statistics        Cisco statistics

Common problems:
  - ip_forward = 0 → packets not forwarded
  - FORWARD chain blocks → DNAT doesn't work
  - Broken SIP ALG → VoIP fails
  - conntrack table full → new connections dropped
  - CGNAT → no direct public IP
```

---

## References

- [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918) - Address Allocation for Private Internets
- [RFC 2663](https://www.rfc-editor.org/rfc/rfc2663) - IP Network Address Translator (NAT) Terminology
- [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022) - Traditional IP Network Address Translator
- [RFC 3948](https://www.rfc-editor.org/rfc/rfc3948) - UDP Encapsulation of IPsec ESP Packets (NAT-T)
- [RFC 6296](https://www.rfc-editor.org/rfc/rfc6296) - IPv6-to-IPv6 Network Prefix Translation (NPTv6)
- [RFC 6598](https://www.rfc-editor.org/rfc/rfc6598) - IANA-Reserved IPv4 Prefix for Shared Address Space (CGNAT)
- [nftables wiki](https://wiki.nftables.org) - modern replacement for iptables
