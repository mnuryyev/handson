---
title: "VLAN, Trunk Ports, STP"
date: "2026-04-26"
---

VLAN (Virtual Local Area Network) is the logical division of one physical network into multiple isolated segments. Trunk ports carry traffic from multiple VLANs over a single cable. STP prevents loops in L2 networks. Together these three technologies form the foundation of any enterprise switched network.

---

## VLAN

### Why VLANs Exist

```
Without VLANs:
  All devices share one broadcast domain.
  A broadcast from one host reaches everyone.
  No isolation: accounting sees developers' traffic.
  Scaling: 500 devices in one segment = broadcast storm.

VLANs solve:
  - Traffic isolation (accounting, dev, guests - separated)
  - Smaller broadcast domains (less noise, less ARP)
  - Security (devices in different VLANs can't see each other without a router)
  - Flexibility (move a port to another VLAN = one command)
  - Economy (one physical switch = many logical networks)

Without VLANs:          With VLANs:
┌─────────────────┐     ┌──────┐  ┌──────┐  ┌──────┐
│ all in one net  │     │VLAN10│  │VLAN20│  │VLAN30│
│ broadcast floods│     │acctg │  │dev   │  │guest │
└─────────────────┘     └──────┘  └──────┘  └──────┘
                         isolated from each other
```

### How VLAN Works (802.1Q)

```
Standard: IEEE 802.1Q (1998, updated 2022).

Principle: each Ethernet frame is tagged with a VLAN ID.
The switch reads the tag and forwards the frame only within the right VLAN.

802.1Q Tag (4 bytes, inserted into the Ethernet frame):
┌──────────────────┬─────┬─────┬──────────────────────┐
│  TPID (2 bytes)  │ PCP │ DEI │    VID (12 bits)      │
│     0x8100       │(3b) │(1b) │      0 - 4095         │
└──────────────────┴─────┴─────┴──────────────────────┘

TPID: 0x8100 - VLAN tag identifier (always this value)
PCP:  Priority Code Point (0-7) - QoS priority (CoS)
DEI:  Drop Eligible Indicator - can this frame be dropped under congestion
VID:  VLAN ID (0-4095)
        0    - reserved
        1    - default VLAN (often management)
        2-4094 - user VLANs
        4095 - reserved
      Total: 4094 usable VLANs

Untagged frame:
┌────────┬────────┬──────────┬──────────┬──────┐
│Dst MAC │Src MAC │EtherType │ Payload  │ FCS  │
└────────┴────────┴──────────┴──────────┴──────┘

Tagged frame (802.1Q):
┌────────┬────────┬────────┬──────────┬──────────┬──────┐
│Dst MAC │Src MAC │ 0x8100 │VLAN Tag  │ Payload  │ FCS  │
└────────┴────────┴────────┴──────────┴──────────┴──────┘
                    ↑ tag is inserted here
```

### Switch Port Types

```
ACCESS port:
  - Belongs to one VLAN.
  - Accepts untagged frames from the end device.
  - Adds the VLAN tag when forwarding to other ports.
  - Removes the tag when sending to the end device.
  - The end device (PC, printer) is unaware of VLANs.

  Used for: workstations, servers, printers, IP phones (data VLAN).

TRUNK port:
  - Carries frames of multiple VLANs.
  - Frames pass with 802.1Q tags.
  - One special VLAN - the native VLAN - passes untagged.
  - Covered in detail in the next section.

  Used for: uplinks to other switches, routers (router-on-a-stick), multi-VLAN servers.

HYBRID port (not Cisco terminology, used by other vendors):
  - Accepts both tagged and untagged frames.
  - Used with IP phones (voice VLAN tagged, data VLAN untagged).

Diagram:
  PC ──────── access (VLAN 10) ──┐
  PC ──────── access (VLAN 10) ──┤ SWITCH ──── trunk ──── another switch
  PC ──────── access (VLAN 20) ──┤
  Printer ─── access (VLAN 20) ──┘
```

### Configuring VLANs on Cisco

```
# Create VLANs
vlan 10
  name Accounting
vlan 20
  name Development
vlan 30
  name Guests

# Verify
show vlan brief
# VLAN Name                             Status    Ports
# ---- -------------------------------- --------- ----------------------------
#    1 default                          active    Gi0/0, Gi0/3
#   10 Accounting                       active    Gi0/1
#   20 Development                      active    Gi0/2
#   30 Guests                           active

# Configure an access port
interface GigabitEthernet0/1
  switchport mode access
  switchport access vlan 10
  description PC-Accounting

# Multiple access ports at once
interface range GigabitEthernet0/1 - 5
  switchport mode access
  switchport access vlan 10

# Verify a port
show interfaces GigabitEthernet0/1 switchport
# Name: Gi0/1
# Administrative Mode: static access
# Operational Mode: static access
# Access Mode VLAN: 10 (Accounting)

# Delete a VLAN (careful - ports assigned to it will lose connectivity)
no vlan 30
```

### Configuring VLANs on Linux

```
# Create a VLAN interface (subinterface)
# eth0.10 = interface eth0 for VLAN 10

# Method 1: via ip (temporary)
ip link add link eth0 name eth0.10 type vlan id 10
ip link set eth0.10 up
ip addr add 192.168.10.1/24 dev eth0.10

# Remove
ip link del eth0.10

# Method 2: via /etc/network/interfaces (Debian/Ubuntu, persistent)
# Install: apt install vlan
# Add to /etc/network/interfaces:
# auto eth0.10
# iface eth0.10 inet static
#   address 192.168.10.1
#   netmask 255.255.255.0
#   vlan-raw-device eth0

# Method 3: via NetworkManager
nmcli connection add type vlan con-name eth0.10 dev eth0 id 10
nmcli connection modify eth0.10 ipv4.addresses 192.168.10.1/24
nmcli connection up eth0.10

# View VLAN interfaces
cat /proc/net/vlan/config
# VLAN Dev name    | VLAN ID
# eth0.10          | 10  | eth0
# eth0.20          | 20  | eth0

ip -d link show eth0.10
# ... vlan protocol 802.1Q id 10 ...
```

### Voice VLAN (IP Phones)

```
An IP phone typically has a built-in mini-switch:
  PC ──── phone ──── switch port

The port is configured for two VLANs simultaneously:
  Data VLAN  (access, untagged) - PC traffic
  Voice VLAN (tagged)           - phone traffic

Cisco:
  interface GigabitEthernet0/1
    switchport mode access
    switchport access vlan 10         (data VLAN for PC)
    switchport voice vlan 50          (voice VLAN for phone)
    spanning-tree portfast            (fast startup)

  Verify:
    show interfaces GigabitEthernet0/1 switchport
    # Voice VLAN: 50 (VoIP)
```

---

## Trunk Ports

### What a Trunk Is

```
A trunk port carries traffic of multiple VLANs.
Frames are tagged with the appropriate VLAN ID using 802.1Q.

Why:
  Two switches, VLANs 10 and 20 on each.
  Without trunk: need 2 cables (one per VLAN).
  With trunk: one cable carries both VLANs.

  SW1 ──[VLAN10]──── SW2     without trunk: 2 cables
  SW1 ──[VLAN20]──── SW2

  SW1 ══[TRUNK]═════ SW2     with trunk: 1 cable, both VLANs
```

### Native VLAN

```
Native VLAN - the only VLAN whose frames travel the trunk WITHOUT a tag.

Why:
  Compatibility with older devices that don't support 802.1Q.
  Some protocols (CDP, PAgP) send untagged frames.

Default: VLAN 1.

Important rules:
  Native VLAN must match on both ends of a trunk.
  Mismatch → CDP warning, native VLAN traffic may be lost.

Security issue - VLAN Hopping via native VLAN:
  Double-tagging attack:
    Attacker on the native VLAN sends a double-tagged frame:
    Outer tag = native VLAN ID (stripped by the first switch)
    Inner tag = target VLAN ID
    The second switch sees the inner tag and forwards into the target VLAN!

  Defenses:
    1. Change native VLAN to an unused one (e.g. VLAN 999)
    2. Explicitly disallow native VLAN traffic on trunk ports:
       switchport trunk native vlan 999
       vlan 999
         name UNUSED_NATIVE
    3. Use "nonegotiate" and set trunk explicitly
```

### Configuring Trunks on Cisco

```
# Configure a trunk port
interface GigabitEthernet0/0
  switchport trunk encapsulation dot1q    (needed on older IOS, not on modern)
  switchport mode trunk
  switchport trunk native vlan 999        (change native VLAN)
  switchport trunk allowed vlan 10,20,30  (allow only needed VLANs)
  description TRUNK-to-SW2

# Add a VLAN to trunk
switchport trunk allowed vlan add 40

# Remove a VLAN from trunk
switchport trunk allowed vlan remove 30

# Allow all VLANs
switchport trunk allowed vlan all

# Verify trunk
show interfaces GigabitEthernet0/0 trunk
# Port        Mode             Encapsulation  Status        Native vlan
# Gi0/0       on               802.1q         trunking      999
#
# Port        Vlans allowed on trunk
# Gi0/0       10,20,30
#
# Port        Vlans allowed and active in management domain
# Gi0/0       10,20,30
#
# Port        Vlans in spanning tree forwarding state and not pruned
# Gi0/0       10,20,30

show interfaces trunk         (all trunk ports)
show interfaces status        (overview of all ports)
```

### DTP - Dynamic Trunking Protocol

```
DTP - Cisco proprietary protocol for automatic trunk negotiation.
Switches negotiate whether a port should be access or trunk.

DTP modes:
  dynamic auto      - passive; becomes trunk if neighbor is active/desirable
  dynamic desirable - actively proposes trunk; becomes trunk if neighbor is auto/desirable
  trunk             - always trunk, sends DTP
  access            - always access, sends DTP
  nonegotiate       - trunk without DTP (does not send DTP packets)

Recommendation:
  Always set mode explicitly (trunk or access), disable DTP.
  DTP is a potential attack vector (VLAN hopping via DTP negotiation).

  interface GigabitEthernet0/0
    switchport mode trunk
    switchport nonegotiate       (disable DTP)

  interface GigabitEthernet0/1
    switchport mode access
    switchport nonegotiate

show dtp interface Gi0/0         (DTP status)
show interfaces Gi0/0 switchport (mode and status)
```

### Router-on-a-Stick (ROAS)

```
Inter-VLAN routing through a single physical router interface.
The router connects to a switch trunk port.
The router has a subinterface for each VLAN.

Diagram:
  VLAN10 ─┐
  VLAN20 ─┤── SW1 ══[trunk]══ R1 (subinterfaces)
  VLAN30 ─┘

Cisco router:
  interface GigabitEthernet0/0
    no shutdown
    no ip address           (parent interface - no IP)

  interface GigabitEthernet0/0.10
    encapsulation dot1q 10
    ip address 192.168.10.1 255.255.255.0
    description Gateway-VLAN10

  interface GigabitEthernet0/0.20
    encapsulation dot1q 20
    ip address 192.168.20.1 255.255.255.0
    description Gateway-VLAN20

  interface GigabitEthernet0/0.30
    encapsulation dot1q 30
    ip address 192.168.30.1 255.255.255.0
    description Gateway-VLAN30

  interface GigabitEthernet0/0.999
    encapsulation dot1q 999 native   (native VLAN, no tag)

Downside of ROAS: single physical link = single point of failure.
Upside: cheap (one port used).

Modern alternative: Layer 3 switch with SVIs (Switched Virtual Interfaces).

Layer 3 switch (SVI):
  vlan 10
  interface Vlan10
    ip address 192.168.10.1 255.255.255.0
    no shutdown
  vlan 20
  interface Vlan20
    ip address 192.168.20.1 255.255.255.0
    no shutdown

  ip routing    (enable routing on the switch!)
```

### VTP - VLAN Trunking Protocol

```
VTP - Cisco proprietary protocol to synchronize VLAN databases across switches.
Create a VLAN on one switch → it automatically appears on all others.

VTP modes:
  Server      - creates/modifies/deletes VLANs, sends updates
  Client      - receives updates, cannot change VLANs locally
  Transparent - does not participate in VTP but forwards VTP messages
  Off         - fully disabled (VTPv3)

VTP danger:
  Plug in a new switch with a higher VTP revision number →
  it overwrites the entire VLAN database on all switches!
  Classic disaster: a new switch fresh out of the box destroys the whole network.

  Defense:
    Before connecting a new switch: reset its VTP to Transparent or Off.
    Use VTPv3 (more secure).
    Or avoid VTP altogether.

show vtp status           (status and revision number)
show vtp counters         (VTP statistics)
```

---

## STP - Spanning Tree Protocol

### The L2 Loop Problem

```
Why redundancy is needed:
  Networks need redundant links (if one fails, the other works).
  But two paths between two switches = a loop.

What happens with a loop:
  1. Broadcast Storm:
     A PC sends an ARP broadcast.
     SW1 floods to all ports, including the link to SW2.
     SW2 receives it, floods back to SW1.
     SW1 receives it again, floods again...
     Traffic doubles every iteration → network crashes in seconds.

  2. MAC Flapping (unstable CAM table):
     A switch sees the same MAC arriving from different ports.
     The CAM table constantly updates → forwarding becomes unstable.

  3. Duplicate unicast frames:
     The recipient receives the same frame twice → L4 problems.

STP solves this: automatically blocks redundant ports to eliminate loops.
```

### How STP Works (802.1D)

```
STP algorithm:

Step 1 - Elect the Root Bridge:
  All switches exchange BPDUs (Bridge Protocol Data Units).
  The switch with the lowest Bridge ID wins.
  Bridge ID = Priority (2B) + MAC address (6B).
  Default priority: 32768.
  Root Bridge = center of the loop-free "tree".

Step 2 - Select Root Port (RP):
  On each non-root switch, one port is selected
  with the lowest path cost to the Root Bridge.
  Root Port - the port "facing" the Root Bridge.

Step 3 - Select Designated Port (DP):
  On each segment (link), one Designated Port is selected.
  DP - the port with the lowest path cost to the Root Bridge on that segment.
  The Root Bridge has all ports as Designated.

Step 4 - Block redundant ports:
  Any port that is neither Root nor Designated → Blocked (BLK).
  A blocked port does not forward traffic (only listens for BPDUs).

STP port states:
  Blocking    - no forwarding, listens to BPDUs (20 sec)
  Listening   - no forwarding, participates in election (15 sec)
  Learning    - no forwarding, learns MAC addresses (15 sec)
  Forwarding  - normal operation, forwards frames
  Disabled    - administratively shut down

Total STP convergence time: ~30-50 seconds (very slow!)
```

### STP Path Cost

```
Port cost depends on link speed.
Lower cost = better path.

Speed           Short cost (802.1D)   Long cost (802.1t)
─────────────────────────────────────────────────────────
10 Mbps              100                  2,000,000
100 Mbps              19                    200,000
1 Gbps                 4                     20,000
10 Gbps                2                      2,000
100 Gbps               1                        200

Default: short cost (802.1D).
For 10G and above, long cost (802.1t) is recommended,
otherwise all high-speed links have cost=1 and tie-breaking becomes random.

Configure cost:
  interface GigabitEthernet0/1
    spanning-tree cost 10          (set cost)
    spanning-tree port-priority 64 (set port priority, default=128)
```

### Electing the Root Bridge

```
Bridge ID = Priority + MAC

Who becomes Root Bridge:
  Lowest Bridge ID → Root Bridge.
  Equal priority → lowest MAC (numerically smaller = better).

Change priority to become Root:
  spanning-tree vlan 10 priority 4096     (set explicitly)
  spanning-tree vlan 10 root primary      (auto-select optimal value)
  spanning-tree vlan 20 root secondary    (backup Root)

Priority must be a multiple of 4096:
  0, 4096, 8192, 12288, 16384, 20480, 24576, 28672,
  32768 (default), 36864, 40960, 45056, 49152, 53248, 57344, 61440

Verify:
  show spanning-tree vlan 10
  # Root ID   Priority    4096
  #           Address     0011.2233.4455
  #           This bridge is the root   ← we are the root!
  #           Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec
  #
  # Bridge ID Priority    32768
  #           Address     aabb.ccdd.eeff
  #
  # Interface           Role Sts Cost      Prio.Nbr Type
  # ────────────────────────────────────────────────────
  # Gi0/0               Desg FWD 4         128.1    P2p
  # Gi0/1               Root FWD 4         128.2    P2p
  # Gi0/2               Altn BLK 4         128.3    P2p  ← blocked
```

### RSTP - Rapid Spanning Tree (802.1W)

```
STP problem: 30-50 second convergence. Link failure = 50 sec of downtime!

RSTP (802.1W, 2001) - much faster (< 1-3 seconds).

Changes in RSTP:

1. Port roles:
   Root Port (RP)       - best path to Root Bridge (same as STP)
   Designated Port (DP) - best port in a segment (same as STP)
   Alternate Port (AP)  - backup path to Root (was Blocked in STP)
   Backup Port (BP)     - backup for Designated (on same segment)
   Disabled             - administratively down

2. Port states (simplified):
   Discarding  (= Blocking + Listening from STP)
   Learning
   Forwarding

3. Rapid Transition:
   Edge ports (connected to end devices) go directly to Forwarding.
   P2P links (full duplex) transition quickly using Proposal/Agreement
   instead of waiting for timers.

4. Topology Change Notification:
   RSTP floods TCN out all ports itself (doesn't wait for Root Bridge).

Configuration (Cisco uses PVST+/Rapid PVST+ by default):
  spanning-tree mode rapid-pvst        (enable Rapid PVST+)
  spanning-tree mode pvst              (legacy STP)
  spanning-tree mode mst               (MSTP)

  show spanning-tree summary
  # Switch is in rapid-pvst mode
```

### PVST+ and MST

```
STP can run per-VLAN or for all VLANs at once - depends on implementation:

STP (802.1D):
  One STP instance for all VLANs.
  All VLANs share one spanning tree.
  Downside: no load balancing between links.

PVST+ (Cisco, Per-VLAN Spanning Tree):
  A separate STP instance per VLAN.
  VLAN10 can have Root on SW1, VLAN20 on SW2.
  Enables load balancing.
  Downside: many VLANs = many STP instances = CPU overhead.

Rapid PVST+:
  PVST+ + RSTP = fast convergence + per-VLAN.
  Cisco default.

MST - Multiple Spanning Tree (802.1S):
  Multiple VLANs mapped to one STP instance.
  VLAN 10,20,30 → Instance 1
  VLAN 40,50    → Instance 2
  Fewer instances → less CPU overhead.
  More complex to configure.

Configuring MST:
  spanning-tree mode mst
  spanning-tree mst configuration
    name MY-MST-REGION
    revision 1
    instance 1 vlan 10,20,30
    instance 2 vlan 40,50
  spanning-tree mst 1 priority 4096    (Root for instance 1)
```

### PortFast and BPDU Guard

```
PortFast:
  A port connected to an end device (PC, server)
  should not wait 30-50 sec for STP convergence.
  PortFast moves the port directly to Forwarding, skipping Listening/Learning.

  Use ONLY on access ports (never on trunks or uplinks to switches!).
  If a PortFast port receives a BPDU → a switch was connected → loop risk.

  Configuration:
    interface GigabitEthernet0/1
      spanning-tree portfast        (on a specific port)

    spanning-tree portfast default  (on all access ports globally)

BPDU Guard:
  Protection for PortFast ports.
  If a PortFast port receives a BPDU → port goes into err-disabled state.
  Prevents unauthorized switches from being connected.

  Configuration:
    interface GigabitEthernet0/1
      spanning-tree portfast
      spanning-tree bpduguard enable

    spanning-tree portfast bpduguard default  (globally for all PortFast ports)

  Recover an err-disabled port:
    interface GigabitEthernet0/1
      shutdown
      no shutdown

  Or automatically via errdisable recovery:
    errdisable recovery cause bpduguard
    errdisable recovery interval 300   (seconds)

BPDU Filter:
  Prevents sending and receiving BPDUs on a port.
  Use with caution! Can create loops if a switch is connected.
  Used where BPDU Guard is too aggressive.

    spanning-tree bpdufilter enable   (per port)
```

### Root Guard and Loop Guard

```
Root Guard:
  Protects the Root Bridge position.
  If a port with Root Guard receives a Superior BPDU (better Bridge ID),
  the port transitions to root-inconsistent (blocked).
  Prevents a rogue device from taking over the Root Bridge role.

  Apply on: ports facing client devices and downlink ports.
  Do NOT apply on: ports facing the Root Bridge.

  interface GigabitEthernet0/1
    spanning-tree guard root

  Verify:
    show spanning-tree inconsistentports

Loop Guard:
  Protection against unidirectional link failures.
  If a port stops receiving BPDUs but the link is still physically up →
  without Loop Guard: port would transition to Forwarding (thinking no loop).
  With Loop Guard → port transitions to loop-inconsistent (blocked).

  interface GigabitEthernet0/1
    spanning-tree guard loop

  Globally:
    spanning-tree loopguard default

UDLD - UniDirectional Link Detection:
  Detects unidirectional failures at the physical level.
  Complements Loop Guard.

  udld enable              (globally)
  udld aggressive          (aggressive mode - blocks the port)
  interface GigabitEthernet0/1
    udld port aggressive
```

---

## Troubleshooting and Common Problems

### Problem: No Connectivity Between Devices in the Same VLAN

```
Step 1: Confirm the VLAN exists
  show vlan brief
  # If VLAN is missing - create it: vlan 10

Step 2: Check the access port
  show interfaces GigabitEthernet0/1 switchport
  # Administrative Mode: static access
  # Access Mode VLAN: 10
  # Confirm the VLAN is correct

Step 3: Check trunk between switches
  show interfaces trunk
  # Confirm VLAN 10 appears in "allowed and active"
  # If not: switchport trunk allowed vlan add 10

Step 4: Is STP blocking the port?
  show spanning-tree vlan 10
  # Check port status: FWD (forwarding) or BLK (blocked)?
  # BLK is normal for a redundant path.
  # BLK on the only path = STP topology problem.

Step 5: Capture traffic
  tcpdump -i eth0.10 -n   (on a server with a VLAN interface)
```

### Problem: Broadcast Storm / L2 Loop

```
Symptoms:
  - All switch port LEDs blinking in sync
  - Switch CPU at 100%
  - Network completely unreachable
  - show interfaces: input errors and runts spiking

Quick fix:
  1. Physically disconnect cables one by one until the network recovers.
  2. Or shut down ports via CLI:
     interface GigabitEthernet0/2
       shutdown

Diagnostics:
  show spanning-tree vlan 1           (check topology)
  show mac address-table              (is the table stable?)
  show interfaces | include input rate (high inbound traffic?)
  show log | include STP              (STP events)

Root causes:
  - Someone connected a cable that created a loop
  - PortFast configured on a trunk or uplink port
  - STP manually disabled
  - Incorrect topology

Prevention:
  - BPDU Guard on all access ports
  - Root Guard on downlink ports
  - Loop Guard on uplink ports
  - Monitoring (SNMP traps for STP topology changes)
```

### Problem: Slow STP Convergence

```
Symptom: after a link failure - 30-50 sec of no connectivity.

Solutions:
  1. Enable Rapid PVST+:
     spanning-tree mode rapid-pvst

  2. PortFast on access ports:
     spanning-tree portfast default

  3. Confirm P2P links run full-duplex:
     show interfaces GigabitEthernet0/0
     # Full-duplex, 1000Mb/s → RSTP can use Proposal/Agreement

  4. Set the Root Bridge correctly (not a random switch):
     spanning-tree vlan 10 root primary
```

### Problem: Wrong Root Bridge

```
Symptom: traffic takes a suboptimal path, Root Bridge is a random switch.

Diagnostics:
  show spanning-tree vlan 10 | include Root
  # Root ID   Priority    32768
  #           Address     aabb.ccdd.eeff   ← whose MAC is this?
  #
  # If "This bridge is the root" and it's the wrong switch →
  # something has a lower Priority or a smaller MAC.

Solution:
  On the correct switch (e.g. the core):
    spanning-tree vlan 10 priority 4096       (or)
    spanning-tree vlan 10 root primary

  On all others to prevent accidental Root takeover:
    Correct switch: priority 4096.
    All others: 32768 (default).
    Additionally: Root Guard on ports toward "untrusted" devices.
```

### Problem: VLAN Not Passing Through Trunk

```
Diagnostics:
  show interfaces trunk
  # Port   Vlans allowed on trunk: 1-4094    (or specific list)
  # Port   Vlans allowed and active in management domain: 10,20
  # Port   Vlans in spanning tree forwarding state and not pruned: 10,20

  VLAN is in "allowed" but not in "active":
    → VLAN not created with "vlan XX"
    → Add it: vlan 20

  VLAN not in "allowed":
    → switchport trunk allowed vlan add 20

  VLAN is in "forwarding" but still no connectivity:
    → Check native VLAN on both ends (must match)
    → show cdp neighbors detail | include Native
```

---

## Cheat Sheet

```
VLAN:
  Logical isolation within an L2 network.
  VLAN ID: 1-4094 (12 bits).
  802.1Q tag: 4 bytes (TPID=0x8100, PCP, DEI, VID).
  Access port: one VLAN, untagged frames to the device.
  Trunk port: multiple VLANs, tagged frames.
  Native VLAN: only VLAN sent untagged on trunk (default=VLAN1, change it).

VLAN commands (Cisco):
  vlan 10 → name NAME              create VLAN
  show vlan brief                  list VLANs
  switchport mode access           set access port
  switchport access vlan 10        assign VLAN
  switchport mode trunk            set trunk port
  switchport trunk allowed vlan 10,20   allowed VLANs
  switchport trunk native vlan 999      native VLAN

STP/RSTP:
  Goal: prevent L2 loops by blocking redundant ports.
  Root Bridge: lowest Bridge ID (Priority + MAC).
  Root Port: best path to Root Bridge.
  Designated Port: best port in a segment.
  Blocked/Alternate: blocked redundant port.

  STP (802.1D): convergence 30-50 sec.
  RSTP (802.1W): convergence < 3 sec.
  PVST+: per-VLAN STP (Cisco).
  Rapid PVST+: RSTP + per-VLAN (Cisco default).

STP commands (Cisco):
  spanning-tree mode rapid-pvst             enable Rapid PVST+
  spanning-tree vlan 10 root primary        become Root for VLAN 10
  spanning-tree vlan 10 priority 4096       set priority
  show spanning-tree vlan 10                topology for VLAN
  spanning-tree portfast                    instant startup for access port
  spanning-tree bpduguard enable            block rogue switches
  spanning-tree guard root                  protect Root Bridge position

Troubleshooting:
  show vlan brief                  VLAN list and ports
  show interfaces trunk            trunk ports and VLANs
  show spanning-tree vlan 10       STP topology
  show spanning-tree summary       overall STP status
  show interfaces Gi0/1 switchport port configuration
  show log | include STP           STP events
```

---

## References

- [IEEE 802.1Q](https://standards.ieee.org/ieee/802.1Q) - VLAN standard
- [IEEE 802.1D](https://standards.ieee.org/ieee/802.1D) - STP (Spanning Tree Protocol)
- [IEEE 802.1W](https://standards.ieee.org/ieee/802.1W) - RSTP (Rapid STP)
- [IEEE 802.1S](https://standards.ieee.org/ieee/802.1S) - MST (Multiple Spanning Tree)
- [RFC 5517](https://www.rfc-editor.org/rfc/rfc5517) - Cisco Systems' Private VLANs
- [Cisco STP Best Practices](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/28943-170.html)
