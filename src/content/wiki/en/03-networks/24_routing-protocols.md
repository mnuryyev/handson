---
title: "BGP, OSPF, RIP - Routing Protocols"
date: "2026-05-05"
---

Dynamic routing protocols allow routers to automatically exchange network information and build routing tables. Without them, every route would need to be configured manually.

---

## Protocol Classification

```
Routing Protocols
├── IGP (Interior Gateway Protocol) - within an autonomous system
│   ├── Distance Vector
│   │   ├── RIP (Routing Information Protocol)
│   │   └── EIGRP (Cisco, hybrid)
│   └── Link State
│       ├── OSPF (Open Shortest Path First)
│       └── IS-IS (Intermediate System to Intermediate System)
└── EGP (Exterior Gateway Protocol) - between autonomous systems
    └── BGP (Border Gateway Protocol)
```

### Autonomous System (AS)

    An Autonomous System (AS) is a group of networks under a single
    administrative control, using a unified routing policy.

    AS examples:
    - AS15169 - Google
    - AS32934 - Meta (Facebook)
    - AS8075  - Microsoft
    - AS13335 - Cloudflare

    AS Number (ASN):
    - 16-bit: 1 - 65535 (legacy, public)
    - 32-bit: 1 - 4294967295 (new, RFC 4893)
    - Private: 64512 - 65534 (similar to RFC 1918 for IP)

    # Look up ASN by IP
    whois 8.8.8.8 | grep origin
    curl https://ipinfo.io/8.8.8.8

---

## RIP - Routing Information Protocol

### What is RIP

RIP is one of the oldest dynamic routing protocols. It operates on the **Distance Vector** principle - each router knows only the distance to a network and the next hop, but has no view of the full topology.

**RIP metric** = hop count
- Maximum 15 hops
- 16 hops = infinity (network unreachable)

### RIP Versions

| Parameter | RIPv1 | RIPv2 |
| --- | --- | --- |
| RFC | 1058 | 2453 |
| Subnet masks | No (classful) | Yes (classless, CIDR) |
| Authentication | No | Yes (MD5) |
| Multicast | No (broadcast) | 224.0.0.9 |
| Summarization | Automatic | Manual and auto |
| VLSM | Not supported | Supported |

RIPng - version for IPv6 (RFC 2080).

### How RIP Works

```
Bellman-Ford Algorithm (Distance Vector):

Router R1:
  "My direct neighbors: R2 via eth0 (1 hop), R3 via eth1 (1 hop)"

R1 broadcasts its table to R2 and R3 every 30 seconds:
  Network 10.1.0.0/24 - 1 hop
  Network 10.2.0.0/24 - 1 hop

R2 receives R1's table and adds +1 hop:
  "Via R1, I can reach 10.2.0.0/24 in 2 hops"
```

### RIP Timers

```
Update Timer:       30 sec  - how often updates are sent
Invalid Timer:     180 sec  - after which a route is marked unreachable
Holddown Timer:    180 sec  - ignore updates with worse metric
Flush Timer:       240 sec  - after which route is removed from table

RIP convergence is slow - can take several minutes.
```

### Routing Loop Problem

```
Network: R1 - R2 - R3, network N is attached to R3

R3 goes down. What happens?

1. R2 knows about N via R3 (metric 1)
2. R1 knows about N via R2 (metric 2)
3. R3 failed, R2 doesn't know yet
4. R1 tells R2: "I know N at 2 hops"
5. R2 thinks: "great, via R1 at 3 hops!" (forgets R3)
6. R2 tells R1: "I know N at 3 hops"
7. R1 updates: "via R2 at 4 hops"
8. Metric grows to 16 = count to infinity
```

**Loop prevention mechanisms in RIP:**

```
1. Split Horizon
   - Don't advertise a route back out the interface it was learned from
   - R2 won't tell R3 about a route it learned from R3

2. Split Horizon with Poison Reverse
   - Advertise the route back, but with metric 16 (unreachable)
   - Explicitly says: "don't route through me to get there"

3. Route Poisoning
   - Immediately announces metric 16 when a network fails
   - Faster than waiting for Invalid Timer

4. Triggered Updates
   - Send update immediately when topology changes
   - Don't wait 30 seconds
```

### RIP Configuration (Cisco IOS)

```
! Enable RIP
router rip
  version 2
  no auto-summary           ! Disable auto-summarization
  network 192.168.1.0       ! Announce network
  network 10.0.0.0          ! Announce network
  passive-interface eth0    ! Don't send on this interface
  redistribute static       ! Add static routes into RIP

! Verification
show ip rip database
show ip route rip
debug ip rip
```

### RIP Configuration (Linux / FRR)

```bash
# FRRouting (FRR) - modern implementation for Linux
# Install
apt install frr

# /etc/frr/frr.conf
router rip
  network 192.168.1.0/24
  network 10.0.0.0/8
  version 2
  no auto-summary
!

# Start
systemctl start frr

# View RIP table
vtysh -c "show ip rip"
vtysh -c "show ip route"
```

### When to Use RIP

```
Good fit:
- Small networks (< 15 routers)
- Simple topologies without redundancy
- Lab/study environments

Not suitable:
- Large networks (15 hop limit)
- Networks requiring fast convergence
- Modern enterprise networks
- Networks with unequal cost links (metric only counts hops)
```

---

## OSPF - Open Shortest Path First

### What is OSPF

OSPF is a Link State protocol. Every router knows the **full topology** of the network and independently calculates shortest paths using Dijkstra's (SPF) algorithm.

- RFC 2328 (OSPFv2 for IPv4)
- RFC 5340 (OSPFv3 for IPv6)
- Metric = cost (based on bandwidth)

### Dijkstra's Algorithm (SPF)

```
Topology:
        10          5
R1 ─────────── R2 ────── R3
│                        │
│        20              │
└────────────────────────┘
                 15

R1 builds Shortest Path Tree (SPT):
- R1 -> R2: cost 10
- R1 -> R3: min(10+5, 20) = 15 via R2 (not 20 directly)

Interface cost = 100 / bandwidth (Mbps)
- FastEthernet 100Mbps: cost = 1
- T1 1.544Mbps: cost = 64
- Serial 64kbps: cost = 1562
```

### OSPF Database - LSDB

```
Each router builds an LSDB (Link State Database):

Link State Advertisement (LSA) - announcement about a link's state
Each router floods its LSAs to all others.
LSDB = collection of all LSAs in an area.

When all routers have identical LSDBs -> network has converged.
```

### LSA Types

| Type | Name | Description |
| --- | --- | --- |
| 1 | Router LSA | Each router describes its own interfaces |
| 2 | Network LSA | DR describes the broadcast segment |
| 3 | Summary LSA | ABR announces routes between areas |
| 4 | ASBR Summary LSA | ABR announces ASBR location |
| 5 | External LSA | ASBR announces external routes |
| 7 | NSSA External | External routes inside NSSA area |

### OSPF Areas

```
OSPF divides the network into areas to reduce SPF computation load:

                    [Area 0 - Backbone]
                   /         |         \
            Area 1        Area 2      Area 3
         (Regular)      (Stub)       (NSSA)

Rules:
- Area 0 (Backbone) - must always exist
- All other areas must connect to Area 0
- Inter-area traffic passes through Area 0

Area types:
- Regular Area     - accepts all LSA types
- Stub Area        - does not accept type 5 LSAs (external routes)
                     replaced by a default route from ABR
- NSSA             - Not So Stubby Area, can have an ASBR
                     uses LSA type 7 instead of type 5
- Totally Stub     - only LSA 1, 2 + default route (Cisco)
```

### OSPF Router Roles

```
Router (regular)
- Participates in OSPF within its area
- Maintains LSDB only for its own area

ABR (Area Border Router)
- Connects two or more areas
- Maintains separate LSDB per area
- Generates Summary LSA (type 3)

ASBR (Autonomous System Boundary Router)
- Connects OSPF to another routing protocol (BGP, RIP, static)
- Generates External LSA (type 5)

DR/BDR (Designated Router / Backup DR)
- Elected on broadcast segments (Ethernet)
- DR collects and distributes LSAs for the segment
- Reduces adjacency count: N*(N-1)/2 -> N
```

### Neighbor Establishment Process

```
OSPF Neighbor State Machine:

Down         - no packets received from neighbor
Init         - Hello received but own Router ID not in it
2-Way        - own Router ID appears in neighbor's Hello
               (DR/BDR election happens here)
ExStart      - Master/Slave determination for LSDB exchange
Exchange     - Database Description (DBD) packets exchanged
Loading      - requesting missing LSAs via LSR
Full         - LSDB is synchronized, neighbor is established

OSPF Multicast addresses:
224.0.0.5  - AllSPFRouters (all OSPF routers)
224.0.0.6  - AllDRRouters (DR and BDR only)
```

### OSPF Hello Packet

```
Hello packet contains:
- Router ID           - unique router identifier (usually an IP)
- Area ID             - area number
- Hello Interval      - how often to send (default: 10 sec)
- Dead Interval       - when to declare neighbor dead (default: 40 sec)
- Network Mask        - subnet mask
- Priority            - DR election priority (default: 1)
- DR / BDR            - current DR and BDR addresses
- Authentication      - auth data

Adjacency won't form if these don't match:
- Area ID
- Hello and Dead Interval
- Authentication
- Network Mask (on broadcast segments)
- Stub flag
```

### DR and BDR Election

```
On broadcast segments (Ethernet), OSPF elects a DR and BDR:

DR election criteria (highest wins):
1. Highest OSPF Priority (0-255, default 1)
   Priority = 0 -> router does not participate in election
2. Highest Router ID (if Priority is equal)

Router ID selection order:
1. Manually configured: router-id X.X.X.X
2. Otherwise: highest IP of a loopback interface
3. Otherwise: highest IP of an active interface

Note: DR/BDR is not re-elected when a new router with a higher
      priority appears (non-preemptive behavior)
```

### OSPF Configuration (Cisco IOS)

```
! Basic setup
router ospf 1                          ! process ID (local, doesn't need to match)
  router-id 1.1.1.1                   ! explicit Router ID
  network 192.168.1.0 0.0.0.255 area 0  ! wildcard mask!
  network 10.0.0.0 0.0.0.3 area 0

! Interface-level config
interface GigabitEthernet0/0
  ip ospf 1 area 0                    ! bind directly to OSPF
  ip ospf cost 10                     ! manual cost
  ip ospf priority 200                ! DR priority
  ip ospf hello-interval 5            ! Hello every 5 sec
  ip ospf dead-interval 20            ! Dead after 20 sec
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 SECRET

! Passive interface (don't send Hellos)
router ospf 1
  passive-interface GigabitEthernet0/1

! Redistribution
router ospf 1
  redistribute bgp 65000 metric 100 metric-type 2 subnets
  redistribute static subnets
  default-information originate         ! advertise default route

! Verification
show ip ospf neighbor                  ! neighbors
show ip ospf database                  ! LSDB
show ip ospf database router           ! type 1 LSA
show ip ospf interface                 ! interface parameters
show ip route ospf                     ! routes from OSPF
debug ip ospf events                   ! event debugging
debug ip ospf adj                      ! adjacency debugging
```

### OSPF Configuration (Linux / FRR)

```bash
# /etc/frr/frr.conf
interface eth0
  ip ospf area 0.0.0.0
  ip ospf cost 10
  ip ospf hello-interval 10
  ip ospf dead-interval 40
!

router ospf
  ospf router-id 1.1.1.1
  network 192.168.1.0/24 area 0.0.0.0
  network 10.0.0.0/8 area 0.0.0.0
  passive-interface eth1
!

# Verification
vtysh -c "show ip ospf neighbor"
vtysh -c "show ip ospf database"
vtysh -c "show ip route ospf"
```

### OSPF Authentication

```
Authentication types:
0 - None
1 - Plain text (insecure!)
2 - MD5 (recommended)

MD5 config on Cisco:
interface GigabitEthernet0/0
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 MySecretKey

router ospf 1
  area 0 authentication message-digest  ! area-wide
```

### OSPF Troubleshooting

```bash
# Adjacency not forming - check:
# 1. Same Area ID?
show ip ospf interface GigabitEthernet0/0

# 2. Same Hello/Dead timers?
show ip ospf neighbor detail

# 3. Same authentication?
debug ip ospf adj

# 4. MTU mismatch?
# MTU mismatch -> stuck in Exchange/Loading
ip ospf mtu-ignore                     ! workaround

# 5. Same subnet/mask?
show ip ospf database router

# OSPF routes not showing up:
show ip route ospf
show ip ospf database summary          ! type 3 LSA
```

---

## BGP - Border Gateway Protocol

### What is BGP

BGP is the only EGP protocol in use on the internet. It is used to exchange routes between autonomous systems and manages the routing of **all internet traffic**.

- RFC 4271 (BGP-4, current version)
- Path Vector protocol
- Runs over TCP port 179
- Metric - not a simple number, but a set of attributes

### iBGP vs eBGP

```
eBGP (External BGP) - between different ASes
  - Typically direct connection (TTL=1 by default)
  - Administrative Distance: 20
  - Next-hop is changed to the interface IP

iBGP (Internal BGP) - within the same AS
  - Can be multi-hop (TTL=255)
  - Administrative Distance: 200
  - Next-hop is NOT changed (can be a problem!)
  - Requires full mesh OR Route Reflector / Confederation

Full mesh iBGP:
N routers = N*(N-1)/2 sessions
10 routers = 45 sessions (too many!)
```

### Route Reflector

```
Solution to the full mesh problem in iBGP:

                    [Route Reflector]
                   /        |         \
               RR Client  RR Client  RR Client
               (R1)       (R2)       (R3)

Route Reflector forwards routes from one client to others.
Breaks the rule "iBGP routes are not forwarded to other iBGP peers".

Loop-prevention attributes:
- ORIGINATOR_ID  - Router ID of the original sender
- CLUSTER_LIST   - list of clusters (RRs) the route has passed through
```

### BGP Path Attributes

```
Well-known Mandatory (required, all routers understand):
- ORIGIN           - route origin (IGP=i, EGP=e, incomplete=?)
- AS_PATH          - list of ASes on the path (loop prevention)
- NEXT_HOP         - next hop IP

Well-known Discretionary (optional, all routers understand):
- LOCAL_PREF       - exit preference within AS (iBGP only)
- ATOMIC_AGGREGATE - route was summarized

Optional Transitive (forwarded on, not all understand):
- COMMUNITY        - tags for route grouping
- AGGREGATOR       - who summarized the route

Optional Non-Transitive (not forwarded):
- MED (MULTI_EXIT_DISC) - hint to neighbor AS about preferred entry point
- ORIGINATOR_ID    - for Route Reflector
- CLUSTER_LIST     - for Route Reflector
```

### BGP Best Path Selection

```
BGP Best Path Selection Algorithm (first difference wins):

1.  Weight (Cisco-specific)           - highest preferred
2.  LOCAL_PREF                        - highest preferred
3.  Locally originated                - local routes preferred
4.  AS_PATH length                    - shortest preferred
5.  ORIGIN                            - IGP < EGP < Incomplete
6.  MED                               - lowest preferred
7.  eBGP over iBGP                    - eBGP preferred
8.  IGP metric to NEXT_HOP            - lowest metric preferred
9.  Oldest eBGP route                 - older route (more stable)
10. Lowest Router ID                  - lowest Router ID
11. Shortest Cluster List             - for Route Reflector
12. Lowest neighbor IP                - lowest neighbor IP address

Mnemonic: "We Love Oranges AS Oranges Mean Pure Refreshment"
           Weight, Local_pref, Originated, AS_path, Origin, Med,
           Peer(eBGP), Routing metric, Remaining tiebreakers
```

### BGP Community

```
BGP Community - 32-bit value (AA:NN format)
Used to group routes and apply routing policies.

Well-known communities:
- NO_EXPORT (65535:65281)     - don't export outside the AS
- NO_ADVERTISE (65535:65282)  - don't advertise to any peer
- NO_EXPORT_SUBCONFED         - don't export outside sub-AS
- INTERNET (0:0)              - advertise to everyone

Usage example:
Provider tells customer: "tag your routes with community 65000:100
and we won't pass them to upstream"

Large Community (RFC 8092):
- 96 bits (3x32 bit): ASN:Function:Parameter
- Example: 65000:1:100
```

### BGP Session - Connection Establishment

```
BGP State Machine:

Idle         - not attempting to connect
Connect      - TCP connection being established
Active        - TCP connection failed, retrying
OpenSent     - OPEN message sent
OpenConfirm  - OPEN received, waiting for KEEPALIVE
Established  - session up, routes being exchanged

BGP message types:
OPEN         - session setup (AS, Router ID, Hold time)
UPDATE       - announce new / withdraw routes
KEEPALIVE    - keep session alive (every 60 sec, hold time 180 sec)
NOTIFICATION - error, session is being closed

TCP port 179 (BGP server listens here)
```

### BGP Configuration (Cisco IOS)

```
! Basic eBGP session
router bgp 65001
  bgp router-id 1.1.1.1
  neighbor 203.0.113.2 remote-as 65002    ! eBGP neighbor
  neighbor 203.0.113.2 description ISP1
  neighbor 203.0.113.2 password SECRET
  !
  ! Announce own network
  network 198.51.100.0 mask 255.255.255.0
  !
  address-family ipv4 unicast
    neighbor 203.0.113.2 activate
    neighbor 203.0.113.2 soft-reconfiguration inbound
    neighbor 203.0.113.2 route-map FILTER-IN in
    neighbor 203.0.113.2 route-map FILTER-OUT out

! iBGP session
router bgp 65001
  neighbor 10.0.0.2 remote-as 65001       ! same AS = iBGP
  neighbor 10.0.0.2 update-source Loopback0

! Route Reflector
router bgp 65001
  neighbor 10.0.0.2 route-reflector-client
  neighbor 10.0.0.3 route-reflector-client

! Route Map for attribute manipulation
route-map FILTER-OUT permit 10
  match ip address prefix-list MY-PREFIXES
  set local-preference 150
  set community 65001:100 additive

ip prefix-list MY-PREFIXES seq 10 permit 198.51.100.0/24

! Verification
show bgp summary
show bgp neighbors 203.0.113.2
show bgp ipv4 unicast
show bgp ipv4 unicast 198.51.100.0
show ip route bgp
debug ip bgp 203.0.113.2 events
```

### BGP Configuration (Linux / FRR)

```bash
# /etc/frr/frr.conf
router bgp 65001
  bgp router-id 1.1.1.1
  neighbor 203.0.113.2 remote-as 65002
  neighbor 203.0.113.2 description "ISP Uplink"
  !
  address-family ipv4 unicast
    network 198.51.100.0/24
    neighbor 203.0.113.2 activate
    neighbor 203.0.113.2 route-map FILTER-IN in
    neighbor 203.0.113.2 route-map FILTER-OUT out
  exit-address-family
!

route-map FILTER-OUT permit 10
  match ip address prefix-list MY-NETS
  set community 65001:100
!

ip prefix-list MY-NETS seq 10 permit 198.51.100.0/24
!

# Verification
vtysh -c "show bgp summary"
vtysh -c "show bgp ipv4 unicast"
vtysh -c "show bgp neighbors 203.0.113.2"
vtysh -c "show ip route bgp"
```

### BGP Security - Issues and Defenses

```
Problem: BGP Route Hijacking
Any AS can announce someone else's prefixes (by mistake or intentionally).

Real incidents:
- 2008: Pakistan Telecom took down YouTube (AS17557 announced 208.65.153.0/24)
- 2010: China Telecom intercepted ~15% of internet traffic for 18 minutes
- 2019: Cloudflare downtime due to route leak through Verizon

Defenses:
1. IRR (Internet Routing Registry) - register your own prefixes
   Databases: RIPE, ARIN, APNIC, RADB

2. RPKI (Resource Public Key Infrastructure)
   - Cryptographically signed ROAs (Route Origin Authorizations)
   - ROA: "only AS65001 may announce 198.51.100.0/24"
   - BGP Origin Validation: Valid / Invalid / NotFound

3. BGPSEC (RFC 8205)
   - Cryptographic signatures on the full AS_PATH
   - Not widely deployed

4. Prefix filtering
   - Accept only expected prefixes from neighbors
   - Filter bogon prefixes and RFC 1918 space

5. GTSM (Generalized TTL Security Mechanism)
   - TTL = 255 for iBGP, 254 for eBGP
   - Protects against attacks from non-adjacent hosts
```

---

## Comparison Table

| Parameter | RIP | OSPF | BGP |
| --- | --- | --- | --- |
| Type | Distance Vector | Link State | Path Vector |
| Use case | IGP (legacy) | IGP | EGP |
| Metric | Hops (max 15) | Cost (bandwidth) | Attributes |
| Convergence | Slow (minutes) | Fast (seconds) | Slow (policy-controlled) |
| Scale | Small networks | Medium and large | The entire internet |
| Topology knowledge | None | Full area map | AS_PATH only |
| Transport | UDP 520 | IP protocol 89 | TCP 179 |
| Authentication | MD5 (v2) | Plaintext, MD5 | MD5, TCP-AO |
| Policy control | None | Limited | Full control |
| Admin Distance (Cisco) | 120 | 110 | eBGP 20, iBGP 200 |

---

## Administrative Distance

```
Administrative Distance (AD) - preference for a routing source.
Used when multiple protocols know a route to the same network.
Lower = better.

Cisco IOS default values:
Connected interface    0
Static route           1
eBGP                  20
EIGRP (internal)      90
OSPF                 110
IS-IS                115
RIP                  120
EIGRP (external)     170
iBGP                 200
Unknown/Untrusted    255  (not used for routing)
```

---

## Route Redistribution

```
Redistributing routes between protocols (Cisco):

! RIP -> OSPF
router ospf 1
  redistribute rip metric 20 metric-type 2 subnets

! OSPF -> BGP
router bgp 65001
  redistribute ospf 1 match internal external 1 external 2

! BGP -> OSPF
router ospf 1
  redistribute bgp 65001 metric 100 metric-type 2 subnets

! Static -> OSPF
router ospf 1
  redistribute static subnets

Warning: mutual redistribution can create routing loops!
Use route-map and tag to control what gets redistributed.
```

---

## Routing Diagnostics

```bash
# General commands (Linux)
ip route show                           # routing table
ip route show table all                 # all routing tables
ip route get 8.8.8.8                   # which route is used
traceroute 8.8.8.8                      # path to destination
mtr 8.8.8.8                            # interactive traceroute

# View BGP routes from the internet
# (use BGP looking glass servers)
# https://lg.he.net/
# https://bgpview.io/

# RPKI validation
# https://rpki.cloudflare.com/

# AS and prefix lookup
whois -h whois.radb.net 8.8.8.8
curl https://api.bgpview.io/ip/8.8.8.8

# Tcpdump for BGP (port 179)
tcpdump -i eth0 tcp port 179 -v

# FRR / Quagga (Linux)
vtysh
  show ip route                         # routing table
  show ip ospf neighbor                 # OSPF neighbors
  show ip bgp summary                   # BGP summary
  show ip rip                           # RIP table

# Useful packages
apt install -y frr bird2 quagga
```

---

## Cheat Sheet

```
RIP
  Type:        Distance Vector
  Metric:      Hops (max 15, 16 = inf)
  Updates:     every 30 sec (broadcast/multicast)
  Timers:      Update=30, Invalid=180, Flush=240
  Loop prev:   Split Horizon, Poison Reverse, Triggered Updates
  UDP port:    520 (RIPv1/v2), 521 (RIPng)

OSPF
  Type:        Link State (Dijkstra's algorithm)
  Metric:      Cost = 100/bandwidth
  Updates:     only on changes (flood LSA)
  Hello:       10 sec (P2P/broadcast), 30 sec (NBMA)
  Dead:        40 sec (broadcast), 120 sec (NBMA)
  Multicast:   224.0.0.5 (all OSPF), 224.0.0.6 (DR/BDR)
  IP protocol: 89

BGP
  Type:        Path Vector
  Metric:      Set of attributes (AS_PATH, LOCAL_PREF, MED...)
  Transport:   TCP port 179
  Keepalive:   60 sec (Hold time 180 sec)
  Best path:   Weight > LP > Origin > AS_PATH > Origin-type >
               MED > eBGP>iBGP > IGP metric > Router ID
  Security:    RPKI, IRR, prefix filtering
```

---

## References

- [RFC 2453](https://www.rfc-editor.org/rfc/rfc2453) - RIPv2
- [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328) - OSPFv2
- [RFC 4271](https://www.rfc-editor.org/rfc/rfc4271) - BGP-4
- [RFC 8205](https://www.rfc-editor.org/rfc/rfc8205) - BGPsec
- [FRRouting Documentation](https://docs.frrouting.org/) - FRR for Linux
- [BGPView](https://bgpview.io/) - BGP topology visualization
- [Cloudflare RPKI](https://rpki.cloudflare.com/) - RPKI validator
- [BGP Looking Glass HE](https://lg.he.net/) - Hurricane Electric LG
