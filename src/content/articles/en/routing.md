---
title: "Routing in Local Networks: From Static Routing to OSPF"
description: "In this lab, we will build a three-router topology in GNS3, configure IP addresses on all interfaces, go through static routing from scratch"
image: "/images/routing_net/main.jpg"
date: "2026-05-11"
---

## Introduction

Routing is the process of selecting a path for forwarding packets between networks. When PC1 sends a packet to the 192.168.2.0/24 network, it does not know how to get there - it simply passes the packet to its default gateway. From there, the routers take over: each one looks up its routing table and decides where to forward the packet next.

In this lab, we will build a three-router topology in GNS3, configure IP addresses on all interfaces, go through static routing from scratch, capture traffic with Wireshark, study TTL behaviour, and then switch to OSPF to confirm that the network reconverges automatically when a link goes down.

| Parameter | Value |
| --- | --- |
| Environment | GNS3 |
| Devices | 3× Router (R1, R2, R3), 3× VPC (PC1, PC2, PC3) |
| Traffic capture | Wireshark (built into Packet Tracer) |
| Protocols | Static routing → OSPF |

---

## Theoretical Background

### How the Routing Table Works

Each router makes decisions locally - it does not know the full topology, only its own table. A packet travels hop-by-hop:

```
PC1 → Router1 → Router2 → PC2
       looks up   looks up
       its own    its own
       table      table
```

### Static Routes vs OSPF

| Parameter | Static Routes | OSPF |
| --- | --- | --- |
| Configuration | Manually on every router | Once - routers negotiate automatically |
| Failure response | None - packets go nowhere | Automatic reconvergence within seconds |
| Scale | Suitable up to ~5 routers | Networks of any size |
| CPU load | Minimal | Moderate (LSA flooding, SPF computation) |

### What is TTL

TTL (Time to Live) is a counter in the IP header. Every router decrements TTL by 1. When TTL reaches 0, the router drops the packet and sends an ICMP Time Exceeded message back to the sender. This is exactly the mechanism that traceroute relies on.

---

## Phase 1. Topology and Initial Configuration

### Step 1. Initial Topology

Build the base topology: two routers and two hosts.

```
PC1 (192.168.1.2) - R1 - R2 - PC2 (192.168.2.2)
```

![01_topology](/handson/images/routing_net/01_topology.png)

### Step 2. Configure PC1

```
ip 192.168.1.2/24 192.168.1.1
```

IP address `192.168.1.2`, mask `/24`, gateway `192.168.1.1` - this is R1's Fa0/0 interface.

![02_pc1](/handson/images/routing_net/02_pc1.png)

### Step 3. Configure PC2

```
ip 192.168.2.2/24 192.168.2.1
```

Gateway `192.168.2.1` - R2's Fa0/1 interface.

![03_pc2](/handson/images/routing_net/03_pc2.png)

### Step 4. R1 - Interface Fa0/0 (PC1 side)

```
interface FastEthernet0/0
ip address 192.168.1.1 255.255.255.0
no shutdown
```

![04_inter_f0](/handson/images/routing_net/04_inter_f0.png)

### Step 5. R1 - Interface Fa0/1 (link to R2)

```
interface FastEthernet0/1
ip address 10.0.12.1 255.255.255.252
no shutdown
```

> The `/30` mask between routers is intentional. It provides exactly 2 usable IP addresses for a point-to-point link - no address space is wasted.

![05_inter_f1](/handson/images/routing_net/05_inter_f1.png)

### Step 6. Verify R1 Interfaces

```
show ip interface brief
```

Both interfaces must be in the **up/up** state.

```
FastEthernet0/0   192.168.1.1   up   up
FastEthernet0/1   10.0.12.1     up   up
```

![06_brief](/handson/images/routing_net/06_brief.png)

### Step 7. R2 - Interface Fa0/0 (link to R1)

```
interface FastEthernet0/0
ip address 10.0.12.2 255.255.255.252
no shutdown
```

![07_inter_f0](/handson/images/routing_net/07_inter_f0.png)

### Step 8. R2 - Interface Fa0/1 (PC2 side)

```
interface FastEthernet0/1
ip address 192.168.2.1 255.255.255.0
no shutdown
```

![08_inter_f1](/handson/images/routing_net/08_inter_f1.png)

### Step 9. Verify R2 Interfaces

```
show ip interface brief
```

```
FastEthernet0/0   10.0.12.2    up   up
FastEthernet0/1   192.168.2.1  up   up
```

![09_brief_r2](/handson/images/routing_net/09_brief_r2.png)

---

## Phase 2. Static Routing

### Step 10. Test Connectivity Before Adding Routes

```
PC1> ping 192.168.2.2
```

The ping fails - `Destination host unreachable`. R1 only knows about its directly connected subnets and has no idea how to reach 192.168.2.0/24.

![10_test](/handson/images/routing_net/10_test.png)

### Step 11. Add a Route on R1

```
ip route 192.168.2.0 255.255.255.0 10.0.12.2
```

This tells R1: send packets destined for `192.168.2.0/24` via neighbour `10.0.12.2` (R2).

![11_ip_route](/handson/images/routing_net/11_ip_route.png)

### Step 12. R1 Routing Table

```
show ip route
```

```
C    192.168.1.0/24  is directly connected, Fa0/0
C    10.0.12.0/30    is directly connected, Fa0/1
S    192.168.2.0/24  [1/0] via 10.0.12.2
```

`S` = Static, `[1/0]` = Administrative Distance / Metric.

![12_show_ip_route](/handson/images/routing_net/12_show_ip_route.png)

### Step 13. Add a Route on R2

R2 also needs to know how to reply back to the 192.168.1.0/24 network:

```
ip route 192.168.1.0 255.255.255.0 10.0.12.1
```

![13_ip_route](/handson/images/routing_net/13_ip_route.png)

### Step 14. R2 Routing Table

```
show ip route
```

```
C    10.0.12.0/30    is directly connected, Fa0/0
S    192.168.1.0/24  [1/0] via 10.0.12.1
C    192.168.2.0/24  is directly connected, Fa0/1
```

![14_show_ip_route](/handson/images/routing_net/14_show_ip_route.png)

### Step 15. Verify Ping - Now Working

```
PC1> ping 192.168.2.2
```

All 5 packets received. Static routing is configured.

![15_test_success](/handson/images/routing_net/15_test_success.png)

---

## Phase 3. Traffic Analysis - Wireshark and TTL

### Step 16. Traceroute from PC1 to PC2

```
PC1> trace 192.168.2.2
```

```
1   192.168.1.1   18 ms    ← R1
2   10.0.12.2     59 ms    ← R2
3   192.168.2.2   ---      ← PC2 (port unreachable - traceroute UDP port is closed)
```

All hops on the path to PC2 are visible.

![16_trace](/handson/images/routing_net/16_trace.png)

### Step 17. Start a Packet Capture Between R1 and R2

In Packet Tracer, click on the link between R1 and R2 - the packet capture interface opens.

![17_r1_r2](/handson/images/routing_net/17_r1_r2.png)

### Step 18. ICMP Packets in Wireshark

Run `ping 192.168.2.2` from PC1 and inspect the capture:

- ICMP Echo Request from `192.168.1.2` to `192.168.2.2`
- CDP packets (Cisco Discovery Protocol) are also visible in the capture

![18_icmp](/handson/images/routing_net/18_icmp.png)

### Step 19. Examining the IP Header - Checking TTL

Click on the ICMP Echo Request → expand `Internet Protocol`:

```
Source:          192.168.1.2
Destination:     192.168.2.2
Time to Live:    63
Protocol:        ICMP (1)
```

> TTL = 63, not 64. PC1 sent the packet with TTL=64, and R1 decremented it by 1 when forwarding. This is exactly how routers count hops and prevent packets from looping endlessly in the network.

![19_icmp_req_ttl](/handson/images/routing_net/19_icmp_req_ttl.png)

### Step 20. Time-to-Live Exceeded During Traceroute

During the trace, packets with TTL=1 are visible - R1 drops them and responds with ICMP Time Exceeded. This is the traceroute mechanism in action: each successive probe has a TTL one higher than the previous one, until the destination is finally reached.

![20_trace](/handson/images/routing_net/20_trace.png)

---

## Phase 4. Expanding the Network - Adding R3 and PC3

### Address Plan for R3

| Device | Interface | IP |
| --- | --- | --- |
| R2 | Fa1/0 | 10.0.23.1/30 |
| R3 | Fa0/0 | 10.0.23.2/30 |
| R3 | Fa0/1 | 192.168.3.1/24 |
| PC3 | e0 | 192.168.3.2/24 |

### Step 21. Add R3 and PC3 to the Topology

```
PC1 - R1 - R2 - PC2
            |
            R3 - PC3
```

![21_adding_r3_p3](/handson/images/routing_net/21_adding_r3_p3.png)

### Step 22. Configure the New Interface on R2

```
interface FastEthernet1/0
ip address 10.0.23.1 255.255.255.252
no shutdown
```

This is the new 10.0.23.0/30 point-to-point link between R2 and R3.

![22_adding](/handson/images/routing_net/22_adding.png)

### Step 23. Configure R3

```
interface FastEthernet0/0
ip address 10.0.23.2 255.255.255.252
no shutdown

interface FastEthernet0/1
ip address 192.168.3.1 255.255.255.0
no shutdown
```

![23_set_r3](/handson/images/routing_net/23_set_r3.png)

### Step 24. Configure PC3

```
ip 192.168.3.2/24 192.168.3.1
```

![24_set_ip_p3](/handson/images/routing_net/24_set_ip_p3.png)

### Step 25. Update Routes on R1

Add a route to the new 192.168.3.0/24 network via R2:

```
ip route 192.168.3.0 255.255.255.0 10.0.12.2
```

![25_r1_add](/handson/images/routing_net/25_r1_add.png)

### Step 26. Update Routes on R2

```
ip route 192.168.3.0 255.255.255.0 10.0.23.2
```

![26_r2_add](/handson/images/routing_net/26_r2_add.png)

### Step 27. Routes on R3

R3 needs to know how to reach both remote networks:

```
ip route 192.168.1.0 255.255.255.0 10.0.23.1
ip route 192.168.2.0 255.255.255.0 10.0.23.1
```

![27_r3_add](/handson/images/routing_net/27_r3_add.png)

### Step 28. Test PC1 → PC3

```
PC1> ping 192.168.3.2
```

All 5 packets received. TTL=61 - the packet traversed 3 routers (64 − 3 = 61).

![28_test_pc1](/handson/images/routing_net/28_test_pc1.png)

---

## Phase 5. Simulating a Link Failure

### Step 29. Network Instability

Disconnect the link between R1 and R2 - simulating a cable cut.

![29_suspend](/handson/images/routing_net/29_suspend.png)

### Step 30. Ping Drops Packets

```
PC1> ping 192.168.2.2
```

The pings are unstable - packet loss is visible. Static routes do not react to a link failure automatically.

![30_ping](/handson/images/routing_net/30_ping.png)

### Step 31. R1 Routing Table After Shutdown

```
R1(config)# interface Fa0/1
R1(config-if)# shutdown

R1# show ip route
```

Only one connected route remains in the table - `C 192.168.1.0/24`. All static routes have disappeared: the next-hop `10.0.12.2` is unreachable, so Cisco removes them from the table.

> This is the fundamental problem with static routing: when a link goes down, routes vanish and packets have nowhere to go. The administrator must manually add backup routes or redesign the topology. OSPF exists precisely to solve this problem.

![31_no_routes](/handson/images/routing_net/31_no_routes.png)

### Step 32. Restore the Interface

```
R1(config-if)# no shutdown
```

Once the interface comes back up, connectivity is restored - but the first few packets are lost while the router waits for the interface to reach the up/up state.

![32_after_no_sh_works](/handson/images/routing_net/32_after_no_sh_works.png)

---

## Phase 6. OSPF - Switching to Dynamic Routing

### Step 33. Remove Static Routes on R1

```
no ip route 192.168.2.0 255.255.255.0 10.0.12.2
no ip route 192.168.3.0 255.255.255.0 10.0.12.2
```

![33_no_route_r1](/handson/images/routing_net/33_no_route_r1.png)

### Step 34. Remove Static Routes on R2

```
no ip route 192.168.1.0 255.255.255.0 10.0.12.1
no ip route 192.168.3.0 255.255.255.0 10.0.23.2
```

![34_no_route_r2](/handson/images/routing_net/34_no_route_r2.png)

### Step 35. Remove Static Routes on R3

```
no ip route 192.168.1.0 255.255.255.0 10.0.23.1
no ip route 192.168.2.0 255.255.255.0 10.0.23.1
```

![35_no_route_r3](/handson/images/routing_net/35_no_route_r3.png)

### Step 36. Enable OSPF on R1

```
router ospf 1
network 192.168.1.0 0.0.0.255 area 0
network 10.0.12.0 0.0.0.3 area 0
```

`process ID = 1` - locally significant; it does not need to match across routers. The mask `0.0.0.255` is a wildcard (the inverse of the subnet mask). `area 0` is the OSPF backbone area and is mandatory.

![36_ospf_r1](/handson/images/routing_net/36_ospf_r1.png)

### Step 37. OSPF on R2

```
router ospf 1
network 10.0.12.0 0.0.0.3 area 0
network 10.0.23.0 0.0.0.3 area 0
network 192.168.2.0 0.0.0.255 area 0
```

![37_ospf_r2](/handson/images/routing_net/37_ospf_r2.png)

### Step 38. OSPF on R3

```
router ospf 1
network 10.0.23.0 0.0.0.3 area 0
network 192.168.3.0 0.0.0.255 area 0
```

After entering the commands, the console displays `%OSPF-5-ADJCHG` - this means R3 has established a neighbour relationship with R2 and both routers have transitioned to the `FULL` state.

![38_ospf_r3](/handson/images/routing_net/38_ospf_r3.png)

### Step 39. Verify OSPF on R1

```
show ip ospf neighbor
show ip route
```

```
Neighbor ID    State    Interface
192.168.2.1    FULL/DR  Fa0/1     ← neighbour R2, state FULL
```

```
O    10.0.23.0/30   [110/2] via 10.0.12.2   ← learned via OSPF
O    192.168.3.0/24 [110/3] via 10.0.12.2   ← PC3 network, metric 3
```

`O` = OSPF. `[110/2]` = Administrative Distance 110 / Cost 2. R1 has automatically learned about the networks behind R3 - without a single static entry.

![39_ospf_check](/handson/images/routing_net/39_ospf_check.png)

### Step 40. Final Verification

```
PC1> ping 192.168.2.2
PC1> ping 192.168.3.2
```

Both pings succeed. OSPF has independently built the routing tables on all three routers.

![40_ospf_works](/handson/images/routing_net/40_ospf_works.png)

---

## Summary and Conclusions

### Final Network Diagram

```
PC1 (192.168.1.2)
        |
       R1 (Fa0/0: 192.168.1.1 | Fa0/1: 10.0.12.1)
        |
   10.0.12.0/30
        |
       R2 (Fa0/0: 10.0.12.2 | Fa0/1: 192.168.2.1 | Fa1/0: 10.0.23.1)
        |                         |
PC2 (192.168.2.2)           10.0.23.0/30
                                  |
                                 R3 (Fa0/0: 10.0.23.2 | Fa0/1: 192.168.3.1)
                                  |
                            PC3 (192.168.3.2)
```

### Comparison of Approaches

| Characteristic | Static Routing | OSPF |
| --- | --- | --- |
| Configuration | Manually on every router | Once - `network` commands |
| Failure response | Routes disappear, packets are dropped | Automatic reconvergence within seconds |
| Adding a router | Must update routes everywhere | Router announces its own networks automatically |
| CPU load | Minimal | Moderate (LSA, Dijkstra's algorithm) |
| Scalability | Poor | Excellent |

### Key Takeaways

Static routing is well suited for small networks with a fixed topology - everything is predictable and transparent. As the network grows, the number of routes increases exponentially: every new router requires updating entries on all the others.

The main drawback of static routing is the complete absence of failure response. When a link goes down, routes disappear from the table and traffic is black-holed until an administrator intervenes manually.

OSPF solves this problem: routers discover neighbours automatically through Hello packets, exchange topology information through LSAs (Link State Advertisements), and compute the routing table using Dijkstra's algorithm. When a link fails, OSPF reconverges automatically.

The OSPF metric is the cumulative cost along the path, where the cost of each interface equals 10⁸ / bandwidth. The `FULL/DR` state indicates that a Designated Router has been elected for the segment - on the 10.0.12.0/30 link that role was taken by R2.
