---
title: "Ethernet - MAC Addresses, ARP, CAM Table"
date: "2026-04-26"
---

Ethernet is the most widely used data link layer technology (OSI L2). It works with physical addresses (MAC), defines the frame format and rules for transmitting data within a single network segment. ARP bridges L2 and L3 - it maps an IP address to a MAC address. The CAM table is how a switch "remembers" who is where.

---

## MAC Address

### What a MAC Address Is

```
MAC (Media Access Control) - unique physical address of a network interface.
Length: 48 bits (6 bytes).
Format: XX:XX:XX:XX:XX:XX (hex, separated by colons or dashes)

Examples:
  00:1A:2B:3C:4D:5E
  00-1A-2B-3C-4D-5E
  001A.2B3C.4D5E     (Cisco format)

Assigned by the network hardware manufacturer.
"Burned in" to the NIC (Network Interface Card), but can be changed in software.
```

### MAC Address Structure

```
|←────── OUI (3 bytes) ──────→|←─── NIC Specific (3 bytes) ───→|
  00      :     1A     :     2B  :  3C     :     4D     :     5E

OUI (Organizationally Unique Identifier):
  First 3 bytes - manufacturer identifier.
  Assigned by IEEE.
  Example: 00:1A:2B = Dell, BC:92:6B = Apple, F8:FF:C2 = Google

NIC Specific:
  Last 3 bytes - unique device number assigned by the manufacturer.

Special bits in the first byte:
  Bit 0 (LSB) - Individual/Group bit:
    0 = unicast (single recipient)
    1 = multicast/broadcast (group or all)

  Bit 1 - Universal/Local bit:
    0 = globally unique (assigned by manufacturer)
    1 = locally administered (changed by admin/OS)
```

### Special MAC Addresses

```
Broadcast:
  FF:FF:FF:FF:FF:FF - received by all devices in the segment.
  Used by ARP, DHCP Discover, some L2 protocols.

Multicast:
  First byte is odd (LSB=1), but not FF.
  01:00:5E:xx:xx:xx - IPv4 multicast (RFC 1112)
  33:33:xx:xx:xx:xx - IPv6 multicast (RFC 2464)
  01:80:C2:00:00:00 - STP (Spanning Tree)
  01:00:0C:CC:CC:CC - CDP (Cisco Discovery Protocol)

Null address (not seen in real traffic):
  00:00:00:00:00:00 - zero address (not used in real frames)
```

### Find Your MAC Address

```
# Linux
ip link show
ip link show eth0
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
#     link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff

ip addr show eth0     # also shows MAC

# Old way (deprecated, but works everywhere)
ifconfig eth0
# eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
#         ether 00:1a:2b:3c:4d:5e  txqueuelen 1000 ...

# macOS
ifconfig en0 | grep ether

# Windows
ipconfig /all
# Physical Address: 00-1A-2B-3C-4D-5E

getmac /v    # all interfaces

# Look up manufacturer by OUI
# Online: https://macvendors.com
# IEEE registry: https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries
```

### Changing the MAC Address (MAC Spoofing)

```
# Linux - temporary (until reboot)
ip link set eth0 down
ip link set eth0 address 00:11:22:33:44:55
ip link set eth0 up

# Using macchanger (more convenient)
apt install macchanger
macchanger -r eth0                       # random MAC
macchanger -m 00:11:22:33:44:55 eth0    # specific MAC
macchanger -p eth0                       # restore original MAC

# Persistent (via NetworkManager)
# /etc/NetworkManager/system-connections/eth0.nmconnection
# [ethernet]
# cloned-mac-address=00:11:22:33:44:55

# Windows
# Device Manager → adapter properties → Advanced → Network Address

# Why?
# - Security testing
# - Bypassing MAC filtering
# - Privacy (Android/iOS randomize MAC when scanning for Wi-Fi)
# - Cloning MAC for ISP (some ISPs bind to MAC)
```

---

## Ethernet Frame

### Ethernet II Frame Structure (most common)

```
┌──────────────┬──────────────┬──────────┬──────────────────┬──────┐
│  Destination │    Source    │EtherType │     Payload      │ FCS  │
│   MAC (6B)   │   MAC (6B)   │  (2B)   │   (46-1500 B)    │ (4B) │
└──────────────┴──────────────┴──────────┴──────────────────┴──────┘
                                          ↑
                                  IP packet / ARP / etc

Before the frame (at physical layer, not visible in Wireshark):
  Preamble (7 bytes): 10101010 x 7 - clock synchronization
  SFD (1 byte):       10101011      - Start Frame Delimiter

Total on the wire: 8 (preamble+SFD) + 6 + 6 + 2 + 46..1500 + 4 = 64..1518 bytes
```

### Frame Fields

```
Destination MAC (6 bytes):
  Recipient's MAC. Can be unicast, multicast, or broadcast.

Source MAC (6 bytes):
  Sender's MAC. Always unicast (you can't send from a broadcast address).

EtherType (2 bytes):
  Upper-layer protocol carried in the Payload.

  EtherType values:
    0x0800 - IPv4
    0x0806 - ARP
    0x86DD - IPv6
    0x8100 - VLAN (802.1Q, adds 4-byte tag)
    0x8847 - MPLS unicast
    0x88CC - LLDP (Link Layer Discovery Protocol)
    0x88F7 - PTP (Precision Time Protocol)
    0x9100 - QinQ (double VLAN encapsulation)

Payload (data): 46-1500 bytes
  Minimum 46 bytes (if data is shorter - padding is added).
  Maximum 1500 bytes (standard Ethernet MTU).
  Jumbo frames: up to 9000+ bytes (non-standard, datacenter only).

FCS - Frame Check Sequence (4 bytes):
  CRC-32 checksum of the entire frame (except preamble and SFD).
  Receiver recalculates and compares.
  Mismatch → frame is dropped (CRC Error).
  FCS is not visible in Wireshark - the NIC checks and strips it before passing to the OS.
```

### 802.1Q VLAN Tag

```
When VLANs are used, a 4-byte tag is inserted into the frame:

┌──────────┬──────────┬─────────┬──────────┬──────────────────┬──────┐
│ Dst MAC  │ Src MAC  │  0x8100 │ VLAN Tag │    Payload       │ FCS  │
│   (6B)   │   (6B)   │  (2B)  │  (4B)   │  (42-1500 B)     │ (4B) │
└──────────┴──────────┴─────────┴──────────┴──────────────────┴──────┘

VLAN Tag (4 bytes):
  TPID (2B): 0x8100 - tag protocol identifier
  TCI  (2B):
    PCP (3 bits): Priority Code Point (0-7, QoS)
    DEI (1 bit):  Drop Eligible Indicator
    VID (12 bits): VLAN ID (0-4095)

VLAN ID:
  0    - no VLAN (reserved)
  1    - default VLAN (often management)
  2-4094 - user VLANs
  4095 - reserved

Maximum 4094 VLANs per switch (12 bits = 4096 values, two reserved).
```

---

## ARP - Address Resolution Protocol

### Why ARP Is Needed

```
The problem:
  L3 (IP) knows where to send a packet (destination IP).
  But L2 (Ethernet) works with MAC addresses.
  How do you find the MAC address of the host with the target IP?

Solution: ARP (RFC 826, 1982).

ARP answers the question:
  "Who has IP 192.168.1.1? Tell me your MAC address!"

Works only within a single broadcast domain (L2 segment).
For communication with another network, the gateway's MAC is used
(not the final destination's MAC).
```

### ARP Packet Format

```
┌───────────────┬───────────────┬──────┬──────┬────────┐
│Hardware Type  │Protocol Type  │HW Len│Pr Len│Operation│
│    (2B)       │    (2B)       │ (1B) │ (1B) │  (2B)  │
├───────────────┴───────────────┴──────┴──────┴────────┤
│          Sender Hardware Address (MAC, 6B)            │
├───────────────────────────────────────────────────────┤
│          Sender Protocol Address (IP, 4B)             │
├───────────────────────────────────────────────────────┤
│          Target Hardware Address (MAC, 6B)            │
├───────────────────────────────────────────────────────┤
│          Target Protocol Address (IP, 4B)             │
└───────────────────────────────────────────────────────┘

Hardware Type:  0x0001 = Ethernet
Protocol Type:  0x0800 = IPv4
HW Len:         6 (MAC = 6 bytes)
Pr Len:         4 (IPv4 = 4 bytes)
Operation:      1 = ARP Request, 2 = ARP Reply
                3 = RARP Request, 4 = RARP Reply (obsolete)
```

### How ARP Works

```
Host A (192.168.1.10, MAC: AA:AA:AA:AA:AA:AA) wants to send a packet
to Host B (192.168.1.20, MAC: ???)

Step 1 - ARP Request (broadcast):
  A checks its ARP cache. If no entry → sends ARP Request.

  Ethernet frame:
    Dst MAC: FF:FF:FF:FF:FF:FF  (broadcast - everyone in the segment)
    Src MAC: AA:AA:AA:AA:AA:AA  (sender's MAC)
    EtherType: 0x0806 (ARP)

  ARP payload:
    Operation:  1 (Request)
    Sender MAC: AA:AA:AA:AA:AA:AA
    Sender IP:  192.168.1.10
    Target MAC: 00:00:00:00:00:00  (unknown, filled with zeros)
    Target IP:  192.168.1.20

  All devices in the segment receive this frame.
  Only the host with IP 192.168.1.20 replies.

Step 2 - ARP Reply (unicast):
  Host B replies directly to Host A.

  Ethernet frame:
    Dst MAC: AA:AA:AA:AA:AA:AA  (unicast to A)
    Src MAC: BB:BB:BB:BB:BB:BB  (Host B's MAC)
    EtherType: 0x0806 (ARP)

  ARP payload:
    Operation:  2 (Reply)
    Sender MAC: BB:BB:BB:BB:BB:BB
    Sender IP:  192.168.1.20
    Target MAC: AA:AA:AA:AA:AA:AA
    Target IP:  192.168.1.10

Step 3 - Caching:
  Host A stores in ARP cache: 192.168.1.20 → BB:BB:BB:BB:BB:BB
  Subsequent packets to 192.168.1.20 are sent without ARP Request.
```

### ARP Cache

```
ARP cache (ARP table) - a table mapping IP → MAC addresses.
Stored in RAM, periodically refreshed.

Entry types:
  dynamic   - learned automatically through ARP Request/Reply
              expire after a timeout
  static    - added manually by an admin
              do not expire automatically
  incomplete - ARP Request sent, Reply not yet received
```

```
# View ARP cache
ip neigh show
# 192.168.1.1  dev eth0 lladdr 00:1a:2b:3c:4d:5e REACHABLE
# 192.168.1.20 dev eth0 lladdr bb:bb:bb:bb:bb:bb STALE
# 192.168.1.30 dev eth0                           FAILED

# Entry states:
# REACHABLE - entry is fresh, recently confirmed
# STALE     - entry has aged out but not yet removed
#             (next packet will trigger a recheck)
# DELAY     - waiting for confirmation (packet sent, awaiting reply)
# PROBE     - sending unicast ARP to verify
# FAILED    - host is unreachable (no response)
# PERMANENT - static entry

# Old way
arp -n
# Address         HWtype  HWaddress           Flags Iface
# 192.168.1.1     ether   00:1a:2b:3c:4d:5e   C     eth0

# Add a static entry
ip neigh add 192.168.1.50 lladdr 00:11:22:33:44:55 dev eth0 nud permanent

# Delete an entry
ip neigh del 192.168.1.50 dev eth0

# Flush the entire cache
ip neigh flush all
ip neigh flush dev eth0   # only on a specific interface

# Windows
arp -a                    # show the table
arp -s 192.168.1.50 00-11-22-33-44-55   # add static entry
arp -d 192.168.1.50       # delete entry

# ARP cache timeouts (Linux)
cat /proc/sys/net/ipv4/neigh/eth0/gc_stale_time    # 60 sec by default
cat /proc/sys/net/ipv4/neigh/default/gc_stale_time
```

### Gratuitous ARP (GARP)

```
Gratuitous ARP - a "self-announcing" ARP request.
A host announces its own IP → MAC mapping.

Key: Sender IP = Target IP (the host asks about itself).

When it's used:
  1. When an interface comes up - announces its MAC to the whole network
  2. When a MAC address changes - updates neighbors' caches
  3. In HA (High Availability) - when an IP moves to another node
     (keepalived, VRRP, CARP send GARP during failover)
  4. IP conflict detection - if someone replies to GARP,
     that IP is already in use

Example GARP:
  Sender: 192.168.1.10 (MAC: AA:AA:AA:AA:AA:AA)
  Dst MAC:    FF:FF:FF:FF:FF:FF (broadcast)
  Operation:  Request (or Reply)
  Sender MAC: AA:AA:AA:AA:AA:AA
  Sender IP:  192.168.1.10
  Target MAC: 00:00:00:00:00:00
  Target IP:  192.168.1.10   ← same IP as Sender!

Receivers update ARP cache: 192.168.1.10 → AA:AA:AA:AA:AA:AA
```

### Proxy ARP

```
Proxy ARP - a router replies to ARP on behalf of the real host.

Scenario:
  Host A (192.168.1.10) wants to reach 10.0.0.5
  A doesn't know 10.0.0.5 is on a different network
  (no default gateway configured or wrong subnet mask)

  A sends ARP Request: "who is 10.0.0.5?"
  The router (if Proxy ARP is enabled) replies with its own MAC.
  A thinks 10.0.0.5 is the router.
  The router forwards packets onward.

Proxy ARP problems:
  - Increases ARP traffic
  - Hides real network topology
  - Can cause security issues

Check and disable (Linux):
  cat /proc/sys/net/ipv4/conf/eth0/proxy_arp
  echo 0 > /proc/sys/net/ipv4/conf/all/proxy_arp

Cisco:
  interface GigabitEthernet0/0
    no ip proxy-arp
```

---

## ARP and Security

### ARP Spoofing / ARP Poisoning

```
ARP has no authentication.
Any host can send an ARP Reply with false data.
Recipients will update their ARP cache without any verification.

ARP Spoofing (ARP Cache Poisoning):
  Attacker (MAC: EE:EE:EE:EE:EE:EE) sends:

  To victim A (192.168.1.10):
    ARP Reply: "IP 192.168.1.1 is at EE:EE:EE:EE:EE:EE"
    Victim A now thinks the gateway is the attacker.

  To the gateway (192.168.1.1):
    ARP Reply: "IP 192.168.1.10 is at EE:EE:EE:EE:EE:EE"
    Gateway thinks victim A is the attacker.

Result:
  All traffic A ↔ gateway flows through the attacker → MITM (Man in the Middle).
  The attacker can:
    - Intercept data (sniffing)
    - Modify traffic (injection)
    - Block the connection (DoS)
```

```
# Tools for ARP spoofing (for testing your own network only!)
# arpspoof (dsniff package)
arpspoof -i eth0 -t 192.168.1.10 192.168.1.1   # tell victim: gateway is us
arpspoof -i eth0 -t 192.168.1.1 192.168.1.10   # tell gateway: victim is us

# Enable IP forwarding (so traffic actually flows through us)
echo 1 > /proc/sys/net/ipv4/ip_forward

# ettercap
ettercap -T -M arp:remote /192.168.1.10// /192.168.1.1//

# bettercap
bettercap -iface eth0
# arp.spoof on
# net.sniff on

# Detect ARP spoofing
arp -n | sort          # look for duplicate MACs
# If two different IPs share the same MAC - suspicious!

# arpwatch - ARP monitoring daemon
apt install arpwatch
arpwatch -i eth0       # logs all ARP changes
```

### Defending Against ARP Spoofing

```
1. Dynamic ARP Inspection (DAI) - on managed switches:
   The switch validates ARP packets against the DHCP Snooping table.
   If IP→MAC doesn't match what DHCP assigned → packet is dropped.

   Cisco:
     ip dhcp snooping
     ip dhcp snooping vlan 10
     ip arp inspection vlan 10
     interface GigabitEthernet0/1
       ip arp inspection limit rate 100  (pps)

2. Static ARP entries (for critical hosts):
   ip neigh add 192.168.1.1 lladdr 00:1a:2b:3c:4d:5e dev eth0 nud permanent

   Downside: doesn't scale, hard to manage.

3. VLAN segmentation:
   Split the network into VLANs → ARP broadcasts don't cross VLAN boundaries.

4. Monitoring:
   arpwatch, XArp, Wireshark filter: arp.duplicate-address-detected

5. Use IPv6:
   IPv6 does not use ARP. Instead it uses NDP (Neighbor Discovery Protocol).
   NDP uses ICMPv6 and can be secured with SEND (Secure Neighbor Discovery).

6. 802.1X port authentication:
   Only authorized devices can connect to a port.
```

---

## Switch CAM Table

### What the CAM Table Is

```
CAM (Content Addressable Memory) table - the switch's MAC address table.
Also called: MAC table, forwarding table, switching table.

Contents: MAC address → port (+ VLAN ID).

Purpose:
  The switch remembers which port each MAC address is behind.
  When it receives a frame it looks up the table and sends only to the right port.
  Without the table it would have to flood every frame to all ports (like a hub).

Stored in dedicated CAM memory (Content Addressable Memory):
  Hardware implementation, O(1) lookup - faster than regular RAM.
  Size is limited: typically 8K-64K entries per switch.
```

### How a Switch Learns MAC Addresses

```
MAC Learning - the process of filling the CAM table:

For every received frame the switch:
1. Looks at the frame's Source MAC.
2. Writes to the table: Source MAC → incoming port (+ VLAN).
3. Resets the entry timer (typically 300 sec = 5 minutes).

Example:
  Port 1: PC A (MAC: AA:AA:AA:AA:AA:AA)
  Port 2: PC B (MAC: BB:BB:BB:BB:BB:BB)
  Port 3: PC C (MAC: CC:CC:CC:CC:CC:CC)

  A sends a frame to B:
    Src=AA:AA:AA:AA:AA:AA, Dst=BB:BB:BB:BB:BB:BB
    Switch: learns AA:AA... → port 1
    BB:BB... is in the table → send only to port 2

  B replies to A:
    Src=BB:BB:BB:BB:BB:BB, Dst=AA:AA:AA:AA:AA:AA
    Switch: learns/updates BB:BB... → port 2
    AA:AA... → port 1 → send only to port 1
```

### Flooding, Forwarding, Filtering

```
Three main actions a switch takes with a frame:

FLOODING:
  When: Dst MAC is not in the CAM table (unknown unicast),
        or Dst MAC = FF:FF:FF:FF:FF:FF (broadcast),
        or Dst MAC = multicast.
  Action: send the frame to all ports except the incoming one.

FORWARDING:
  When: Dst MAC is found in the table, port != incoming port.
  Action: send the frame only to the right port.

FILTERING:
  When: Dst MAC is found in the table, port == incoming port.
  Action: drop the frame (why send it back?).
  Rare case (e.g. a hub is connected to the port).
```

### Viewing the CAM Table

```
# Cisco IOS
show mac address-table
# Vlan    Mac Address       Type        Ports
# ----    -----------       --------    -----
#    1    aa:aa:aa:aa:aa:aa  DYNAMIC    Gi0/1
#    1    bb:bb:bb:bb:bb:bb  DYNAMIC    Gi0/2
#   10    cc:cc:cc:cc:cc:cc  STATIC     Gi0/3

show mac address-table count            # number of entries
show mac address-table vlan 10          # only VLAN 10
show mac address-table address aa:aa:aa:aa:aa:aa   # find a specific MAC
show mac address-table interface Gi0/1  # MACs on a specific port
show mac address-table aging-time       # aging timer

# Clear the table
clear mac address-table dynamic
clear mac address-table dynamic interface Gi0/1
clear mac address-table dynamic vlan 10

# Add a static entry
mac address-table static aa:aa:aa:aa:aa:aa vlan 1 interface Gi0/1

# Change the aging timer (default: 300 sec)
mac address-table aging-time 600

# Linux (Open vSwitch)
ovs-appctl fdb/show br0
# port  VLAN  MAC                Age
#    1     0  aa:aa:aa:aa:aa:aa    0
#    2     0  bb:bb:bb:bb:bb:bb    5

# Linux bridge
bridge fdb show
# aa:aa:aa:aa:aa:aa dev eth1 master br0
# bb:bb:bb:bb:bb:bb dev eth2 master br0 permanent
```

### CAM Table Overflow (MAC Flooding Attack)

```
Attack: CAM Table Overflow / MAC Flooding

How it works:
  A switch's CAM table has a limited size (typically 8K-64K entries).
  The attacker floods the switch with frames carrying thousands of random MACs.
  The table fills up, real entries get evicted.

Result:
  The switch no longer knows where real hosts are → floods all traffic.
  The attacker receives all frames (like a hub) → passive interception.

Tool (for testing only!):
  macof (dsniff package):
    macof -i eth0     # generates ~155,000 frames/sec with random MACs

Defense - Port Security on Cisco:
  interface GigabitEthernet0/1
    switchport mode access
    switchport port-security                      # enable
    switchport port-security maximum 3            # max 3 MACs on the port
    switchport port-security mac-address sticky   # remember current MACs
    switchport port-security violation restrict   # action on violation:
    # restrict  - block extra frames, increment counter, log
    # protect   - block extra frames silently
    # shutdown  - put port in err-disabled state (strictest)

  # Check port security
  show port-security interface Gi0/1
  show port-security address

  # Recover a port after shutdown
  interface Gi0/1
    shutdown
    no shutdown
```

---

## Spanning Tree Protocol (STP) - Brief Overview

```
The L2 loop problem:
  If there is a physical loop in an Ethernet network,
  broadcast frames will circulate forever.
  The CAM table will constantly flip (MAC flapping).
  The network will go down in seconds (broadcast storm).

STP (802.1D) solves this:
  Automatically detects loops and blocks one of the ports.
  The network stays connected but loop-free.

RSTP (Rapid STP, 802.1W):
  Much faster convergence (seconds vs 30-50 sec in STP).
  The modern standard.

Signs of a broadcast storm:
  - Switch CPU at 100%
  - All port LEDs blinking in sync
  - Network is completely unavailable

  Quick fix:
    - Physically disconnect one link in the loop
    - Then investigate the topology
```

---

## Practical Scenarios and Troubleshooting

### Host Not Reachable - L2 Diagnostics

```
Host A cannot reach Host B on the same network.

Step 1: Check ARP cache
  ip neigh show | grep 192.168.1.20
  # No entry - ARP is not getting through
  # FAILED - host is not responding or L2 issue

Step 2: Send ARP manually
  arping -I eth0 192.168.1.20
  # ARPING 192.168.1.20 from 192.168.1.10 eth0
  # Unicast reply from 192.168.1.20 [BB:BB:BB:BB:BB:BB] 1.234ms

  # No reply? → host is off, wrong IP, L2 issue

Step 3: Wireshark / tcpdump on ARP
  tcpdump -i eth0 arp
  # See Request but no Reply → problem is on B's side
  # No Request visible → problem on A's side (interface, cable)

Step 4: Check the CAM table on the switch
  show mac address-table | include bb:bb:bb:bb:bb:bb
  # Not found - switch doesn't see Host B
  # Check physical connection, port, VLAN

Step 5: Check VLAN assignment
  show vlan brief
  show interfaces GigabitEthernet0/1 switchport
  # Make sure A and B are in the same VLAN
```

### Duplicate IP Addresses

```
Symptom: connection to a host is intermittently lost, ARP cache is unstable.

Diagnostics:
  # Check ARP cache - one IP with two different MACs?
  arp -n
  ip neigh show

  # arping will show who replied
  arping -I eth0 -D 192.168.1.10   # -D = detect duplicates
  # Two replies = IP conflict!

  # On the switch - check logs for MAC flapping
  show logging | include flapping

Resolution:
  Find the second host using its MAC address (OUI lookup).
  Change the IP on one of the hosts.
  Configure DHCP with reservations to prevent conflicts.
```

### ARP Not Working Across VLANs

```
Situation: hosts are in different VLANs, a router should connect them.

Problem: ARP broadcast does not cross the router.
Solution: each host sends ARP requests within its own VLAN,
          the router has an IP in each VLAN (SVI or sub-interface),
          hosts send packets to the router's MAC (default gateway).

Rule: never try to ARP an address from a different subnet.
      ARP is only needed for addresses in the same subnet.
      For other subnets - ARP for the gateway's MAC instead.
```

---

## Cheat Sheet

```
MAC address (48 bits = 6 bytes):
  XX:XX:XX (OUI - manufacturer) : XX:XX:XX (device number)
  FF:FF:FF:FF:FF:FF = broadcast
  Bit 0 of first byte: 0=unicast, 1=multicast/broadcast
  Bit 1 of first byte: 0=globally unique, 1=locally administered

EtherType:
  0x0800 = IPv4
  0x0806 = ARP
  0x86DD = IPv6
  0x8100 = VLAN (802.1Q)

ARP:
  Request: broadcast (FF:FF:FF:FF:FF:FF), Operation=1
  Reply:   unicast to requester,          Operation=2
  GARP:    Sender IP = Target IP (announcing own IP)
  No authentication → vulnerable to ARP spoofing

CAM table:
  MAC → port (+ VLAN)
  Learned from Source MAC of every incoming frame
  Aging timer: 300 sec (5 min) by default
  Flooding: dst MAC unknown or broadcast
  Forwarding: dst MAC found in table
  Overflow → MAC flooding attack → traffic sent to all ports

Defenses:
  DAI (Dynamic ARP Inspection) - against ARP spoofing
  Port Security - against MAC flooding
  Static ARP - for critical hosts
  VLAN segmentation - limit broadcast domain

Useful commands:
  ip neigh show              - Linux ARP cache
  ip neigh flush all         - flush ARP cache
  arping -I eth0 192.168.1.1 - manual ARP request
  tcpdump -i eth0 arp        - capture ARP traffic
  ip link show               - interface MAC addresses
  show mac address-table     - CAM table (Cisco)
  bridge fdb show            - MAC table (Linux bridge)
```

---

## References

- [RFC 826](https://www.rfc-editor.org/rfc/rfc826) - ARP (Address Resolution Protocol), 1982
- [RFC 5227](https://www.rfc-editor.org/rfc/rfc5227) - IPv4 Address Conflict Detection (Gratuitous ARP)
- [RFC 1122](https://www.rfc-editor.org/rfc/rfc1122) - Requirements for Internet Hosts (ARP cache, timeouts)
- [IEEE 802.1Q](https://standards.ieee.org/ieee/802.1Q) - VLAN standard
- [IEEE 802.1D](https://standards.ieee.org/ieee/802.1D) - Spanning Tree Protocol
- [IEEE OUI Registry](https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries) - manufacturer database by MAC prefix
