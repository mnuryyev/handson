---
title: "iptables - NAT, MASQUERADE, DNAT"
date: "2026-05-09"
---

NAT (Network Address Translation) - network address translation. The Linux kernel intercepts a packet, modifies the source or destination IP address, and maintains a tracking table to return replies to the correct client.

All NAT in iptables lives in the **nat** table. Three chains: PREROUTING (before routing decision), OUTPUT (local processes), POSTROUTING (after routing decision). conntrack tracks connections and automatically applies reverse NAT to replies.

---

## How NAT Works

    Without NAT (direct routing):
      Client 192.168.1.5 → Server 8.8.8.8
      Packet: [src: 192.168.1.5][dst: 8.8.8.8]
      Server sees the real client IP.
      Reply goes directly to 192.168.1.5 (route must exist).

    With SNAT/MASQUERADE (outbound NAT):
      Client 192.168.1.5 → Gateway (eth1:192.168.1.1 / eth0:203.0.113.1) → Server 8.8.8.8
      Gateway replaces src 192.168.1.5 with 203.0.113.1.
      Packet: [src: 203.0.113.1][dst: 8.8.8.8]
      Server replies to 203.0.113.1.
      Gateway looks up conntrack table → forwards reply back to 192.168.1.5.

    With DNAT (inbound NAT / port forwarding):
      External client → Gateway 203.0.113.1:8080 → Internal server 192.168.1.10:80
      Gateway changes dst from 203.0.113.1:8080 to 192.168.1.10:80.
      Packet is delivered to the real server.
      Reply: conntrack automatically applies reverse DNAT (restores src).

    Packet path through the nat table:

      Incoming packet:
        Network → [PREROUTING: raw → mangle → nat] → Routing decision
                                                      ↓
                                          INPUT (local) or FORWARD (transit)

      Outgoing packet:
        Process → [OUTPUT: raw → mangle → nat → filter] → Routing decision
                                                           ↓
                                               [POSTROUTING: mangle → nat] → Network

    Important: NAT rules are applied only to the FIRST packet of a connection.
    All subsequent packets of the same connection are handled by conntrack
    automatically - without traversing NAT rules again.

---

## nat table: viewing rules

    # Show all NAT rules
    iptables -t nat -L -n -v

    # With line numbers
    iptables -t nat -L -n -v --line-numbers

    # Specific chain
    iptables -t nat -L PREROUTING -n -v
    iptables -t nat -L POSTROUTING -n -v
    iptables -t nat -L OUTPUT -n -v

    # As commands (for saving/auditing)
    iptables-save -t nat

    # Example output:
    # Chain PREROUTING (policy ACCEPT 100 packets, 6000 bytes)
    # target     prot opt source       destination
    # DNAT       tcp  --  0.0.0.0/0    203.0.113.1   tcp dpt:8080 to:192.168.1.10:80
    #
    # Chain POSTROUTING (policy ACCEPT 50 packets, 3000 bytes)
    # target     prot opt source       destination
    # MASQUERADE all  --  192.168.1.0/24  0.0.0.0/0

---

## MASQUERADE

MASQUERADE is outbound NAT with automatic IP detection. The gateway substitutes the current IP of the outgoing interface as the source IP.

    When to use MASQUERADE:
      - Dynamic IP on the external interface (DHCP, PPPoE).
      - IP may change - MASQUERADE always picks up the current IP.
      - Simpler to configure than SNAT.
      - Slightly slower than SNAT (checks interface IP per packet).

    # Basic MASQUERADE: all LAN traffic going outbound
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Only a specific protocol
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -p tcp -j MASQUERADE

    # Multiple subnets
    iptables -t nat -A POSTROUTING -s 192.168.0.0/16 -o eth0 -j MASQUERADE
    iptables -t nat -A POSTROUTING -s 10.0.0.0/8     -o eth0 -j MASQUERADE

    # VPN clients through NAT (OpenVPN, WireGuard)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
    iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE

    # MASQUERADE options:
    # --to-ports port[-port]  - use specific port range for SNAT
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -p tcp -j MASQUERADE --to-ports 1024-65535

    # Do not forget to enable IP forwarding:
    echo 1 > /proc/sys/net/ipv4/ip_forward
    # and allow FORWARD:
    iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

### MASQUERADE: complete gateway example

    #!/bin/bash
    # Variables
    WAN=eth0              # external interface (internet)
    LAN=eth1              # internal interface (local network)
    LAN_SUBNET=192.168.1.0/24

    # IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Flush old rules
    iptables -F
    iptables -t nat -F

    # Policies
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: basics
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT    # SSH

    # FORWARD: allow LAN → WAN and replies
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: MASQUERADE for outbound LAN traffic
    iptables -t nat -A POSTROUTING -s $LAN_SUBNET -o $WAN -j MASQUERADE

    echo "Gateway configured: $LAN_SUBNET → $WAN (MASQUERADE)"

---

## SNAT

SNAT (Source NAT) - outbound NAT with a static IP. An explicit IP or IP range is specified as the new source.

    When to use SNAT instead of MASQUERADE:
      - Static IP on the external interface.
      - Faster than MASQUERADE (IP does not need to be looked up per packet).
      - Multiple public IPs - control which client exits from which IP.
      - POSTROUTING only.

    # SNAT with one static IP
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1

    # SNAT with an IP range (pool of public addresses)
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1-203.0.113.10
    # Kernel load-balances across IPs in the range.

    # SNAT with a port range
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1:1024-65535

    # Different subnets exit through different public IPs
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1
    iptables -t nat -A POSTROUTING -s 192.168.2.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.2

    # SNAT for a specific host
    iptables -t nat -A POSTROUTING -s 192.168.1.100 -o eth0 \
      -j SNAT --to-source 203.0.113.5

### SNAT vs MASQUERADE: comparison

                    SNAT                    MASQUERADE
    IP address      explicitly specified     taken from interface automatically
    Speed           faster                  slightly slower
    IP type         static                  dynamic (DHCP, PPPoE)
    Flexibility     IP range and ports      ports only
    Use case        production servers      home/office routers
    Chain           POSTROUTING             POSTROUTING

---

## DNAT

DNAT (Destination NAT) - changing the destination IP of an incoming packet. Used for port forwarding: a packet arriving on an external IP:port is redirected to an internal server.

    When to use DNAT:
      - Publish an internal server externally (web, SSH, game server).
      - NAT-level load balancing.
      - Redirect traffic to a different host/port.
      - PREROUTING only (for transit packets) and OUTPUT (for local).

    # Port forwarding: external 8080 → internal 192.168.1.10:80
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80

    # Must also allow FORWARD to the backend
    iptables -A FORWARD -i eth0 -o eth1 \
      -p tcp -d 192.168.1.10 --dport 80 \
      -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT

    # DNAT without port change (port is preserved)
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.10
    # Traffic on :80 goes to 192.168.1.10:80

    # DNAT SSH on a non-standard external port
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22

    # DNAT from a specific source only
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp -s 10.0.0.5 --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80

    # DNAT for a port range (same port number is preserved)
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 8000:8080 \
      -j DNAT --to-destination 192.168.1.10

    # DNAT UDP (DNS forwarding)
    iptables -t nat -A PREROUTING \
      -i eth0 -p udp --dport 53 \
      -j DNAT --to-destination 192.168.1.53:53
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 53 \
      -j DNAT --to-destination 192.168.1.53:53

### DNAT: load balancing (statistic module)

    # Round-robin between two servers
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode nth --every 2 --packet 0 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.11:80
    # First rule: every 2nd packet (packet 0 = first of every 2).
    # Second rule: all others.

    # Probabilistic load balancing (random mode)
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.5 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.11:80
    # 50% of traffic → server1, 50% → server2.

    # Three servers: 33% each
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.333 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.5 \
      -j DNAT --to-destination 192.168.1.11:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.12:80
    # Logic: of remaining 66% → 50% = 33%; of remaining 33% → 100% = 33%.

### DNAT: OUTPUT (hairpin / loopback NAT)

    The hairpin NAT problem:
      Internal client (192.168.1.5) connects to the gateway's external IP (203.0.113.1).
      PREROUTING DNAT changes dst to 192.168.1.10.
      Packet goes from 192.168.1.5 to 192.168.1.10.
      Reply goes from 192.168.1.10 directly to 192.168.1.5 (bypasses gateway).
      Client receives reply from an "unexpected" IP → connection breaks.

    Solution 1: DNAT in OUTPUT + MASQUERADE
      iptables -t nat -A OUTPUT -p tcp -d 203.0.113.1 --dport 8080 \
        -j DNAT --to-destination 192.168.1.10:80
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 \
        -d 192.168.1.10 -j MASQUERADE

    Solution 2: additional SNAT for hairpin traffic
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 \
        -d 192.168.1.10 -p tcp --dport 80 \
        -j SNAT --to-source 192.168.1.1
      # Gateway becomes the source → reply returns via gateway.

---

## REDIRECT

REDIRECT is a special case of DNAT that redirects to a port on the gateway itself. Used for transparent proxies.

    # All HTTP traffic from LAN → local Squid on port 3128
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

    # Only for a specific subnet
    iptables -t nat -A PREROUTING -i eth1 -s 192.168.1.0/24 \
      -p tcp --dport 80 -j REDIRECT --to-port 3128

    # Transparent HTTPS proxy (requires SSL Bump in Squid)
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 443 \
      -j REDIRECT --to-port 3129

    # Intercept DNS and send to local resolver
    iptables -t nat -A PREROUTING -i eth1 -p udp --dport 53 \
      -j REDIRECT --to-port 5300

    # Exclude the gateway itself from interception (avoid loop)
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      ! -s 192.168.1.1 -j REDIRECT --to-port 3128

---

## conntrack and NAT

NAT depends entirely on conntrack. Understanding conntrack helps diagnose NAT problems.

    # View NAT connections in conntrack
    conntrack -L
    conntrack -L -p tcp
    conntrack -L | grep ESTABLISHED

    # Example conntrack entry for MASQUERADE:
    # tcp 6 86398 ESTABLISHED
    #   src=192.168.1.5  dst=8.8.8.8       sport=45678 dport=443
    #   src=8.8.8.8      dst=203.0.113.1   sport=443   dport=45678
    #   [ASSURED]
    #
    # First line:  original packet (client → server)
    # Second line: expected reply (server → gateway)
    # Gateway knows: reply from 8.8.8.8 to 203.0.113.1:45678 → return to 192.168.1.5:45678

    # Example for DNAT (port forwarding):
    # tcp 6 85000 ESTABLISHED
    #   src=5.6.7.8      dst=203.0.113.1   sport=34567 dport=8080
    #   src=192.168.1.10 dst=5.6.7.8       sport=80    dport=34567
    #
    # dst changed from 203.0.113.1:8080 to 192.168.1.10:80 (DNAT)
    # reply src changed from 192.168.1.10 back to 203.0.113.1 (reverse DNAT)

    # conntrack statistics
    conntrack -S

    # Delete a specific connection entry (force reconnect)
    conntrack -D -p tcp --orig-src 192.168.1.5 --orig-dst 8.8.8.8

    # Monitor conntrack events in real time
    conntrack -E            # all events
    conntrack -E -p tcp --dport 80    # HTTP only

    # conntrack limit tuning
    # View current maximum
    sysctl net.netfilter.nf_conntrack_max
    cat /proc/sys/net/netfilter/nf_conntrack_max

    # View current usage
    cat /proc/sys/net/netfilter/nf_conntrack_count

    # Increase maximum (for busy NAT gateways)
    sysctl -w net.netfilter.nf_conntrack_max=262144
    echo 'net.netfilter.nf_conntrack_max=262144' >> /etc/sysctl.conf

    # Reduce TCP ESTABLISHED timeout (free up entries faster)
    sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=7200
    # default 432000 (5 days) - too long for a NAT gateway

    # conntrack timeouts for various states
    sysctl net.netfilter.nf_conntrack_tcp_timeout_syn_sent     # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_syn_recv     # 60s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_fin_wait     # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_time_wait    # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_close        # 10s
    sysctl net.netfilter.nf_conntrack_udp_timeout              # 30s
    sysctl net.netfilter.nf_conntrack_udp_timeout_stream       # 180s

---

## Complete Configurations

### Home/Office Router

    #!/bin/bash
    WAN=eth0
    LAN=eth1
    LAN_NET=192.168.1.0/24
    WAN_IP=203.0.113.1    # static IP (or remove for MASQUERADE)

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F; iptables -X

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
    iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 5/s -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -s $LAN_NET -j ACCEPT

    # FORWARD
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT

    # MASQUERADE (or SNAT for static IP)
    iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j MASQUERADE
    # iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j SNAT --to-source $WAN_IP

    echo "Router configured"

### Server with Port Forwarding

    #!/bin/bash
    # Server: public IP 203.0.113.1
    # Internal servers in 192.168.1.0/24
    WAN=eth0
    LAN=eth1
    PUB_IP=203.0.113.1

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F; iptables -X

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: allow services on the gateway itself
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22   -j ACCEPT    # SSH to gateway
    iptables -A INPUT -p tcp --dport 80   -j ACCEPT    # HTTP to gateway
    iptables -A INPUT -p tcp --dport 443  -j ACCEPT    # HTTPS to gateway

    # FORWARD: allow forwarded traffic
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Web server: external 80/443 → 192.168.1.10
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 443 \
      -j DNAT --to-destination 192.168.1.10:443
    iptables -A FORWARD -p tcp -d 192.168.1.10 -m multiport \
      --dports 80,443 -j ACCEPT

    # SSH to internal server via non-standard external port
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22
    iptables -A FORWARD -p tcp -d 192.168.1.20 --dport 22 -j ACCEPT

    # Game server: UDP 27015 → 192.168.1.30
    iptables -t nat -A PREROUTING -i $WAN -p udp --dport 27015 \
      -j DNAT --to-destination 192.168.1.30:27015
    iptables -A FORWARD -p udp -d 192.168.1.30 --dport 27015 -j ACCEPT

    # MASQUERADE for outbound LAN traffic
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o $WAN -j MASQUERADE

    echo "Port forwarding configured"

### VPN Gateway (WireGuard / OpenVPN)

    #!/bin/bash
    WAN=eth0
    VPN=wg0           # or tun0 for OpenVPN
    VPN_NET=10.0.0.0/24

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp  --dport 22    -j ACCEPT   # SSH
    iptables -A INPUT -p udp  --dport 51820 -j ACCEPT   # WireGuard
    # iptables -A INPUT -p udp --dport 1194 -j ACCEPT   # OpenVPN

    # FORWARD: allow VPN clients to reach internet
    iptables -A FORWARD -i $VPN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: VPN clients exit through the gateway's IP
    iptables -t nat -A POSTROUTING -s $VPN_NET -o $WAN -j MASQUERADE

    echo "VPN gateway configured: $VPN_NET via $WAN"

### Double NAT

    Scenario: two levels of NAT.
    Internet → ISP router (NAT1) → Our gateway (NAT2) → LAN clients

    # On our gateway the config is the same as usual:
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Double NAT problems:
    # - Port forwarding only works from the ISP router side.
    # - Solution: ask ISP for a public IP or DMZ.
    # - Or use a VPN tunnel (WireGuard, Tailscale) - bypasses NAT entirely.

---

## NAT for IPv6

    # IPv6 does not require NAT (plenty of addresses).
    # But if needed - ip6tables uses the same syntax:

    ip6tables -t nat -A POSTROUTING -s fc00::/7 -o eth0 -j MASQUERADE

    # Check IPv6 NAT kernel support:
    lsmod | grep nf_nat
    # Should show nf_nat and nf_nat_masquerade

    # ip6tables commands are identical to iptables
    ip6tables -t nat -L -n -v
    ip6tables-save > /etc/iptables/rules.v6
    ip6tables-restore < /etc/iptables/rules.v6

---

## Diagnosing NAT

    # Verify MASQUERADE/SNAT is working
    # On a client behind NAT:
    curl ifconfig.me           # should show the gateway's public IP
    traceroute 8.8.8.8         # first hop = gateway

    # On gateway: watch conntrack
    conntrack -L | grep 192.168.1.5    # connections from specific client
    conntrack -L | wc -l               # total connection count

    # Test port forwarding
    # From outside:
    nc -zv 203.0.113.1 8080       # check if port is open
    curl http://203.0.113.1:8080  # HTTP request
    nmap -p 8080 203.0.113.1      # port scan

    # On gateway:
    tcpdump -i eth0 -n 'tcp port 8080'    # see incoming packets before DNAT
    tcpdump -i eth1 -n 'tcp port 80'      # see packets after DNAT

    # View NAT rule counters
    iptables -t nat -L -n -v    # pkts and bytes columns

    # Zero counters and test
    iptables -t nat -Z
    # make a test request...
    iptables -t nat -L -n -v    # check if counters increased

    # Trace packets through TRACE
    iptables -t raw -A PREROUTING -p tcp --dport 8080 -j TRACE
    journalctl -k | grep TRACE
    iptables -t raw -F    # remove after debugging

    # Problems and solutions:

    # Port forwarding not working:
    #   1. Check DNAT rule: iptables -t nat -L PREROUTING -n -v
    #   2. Check FORWARD rule: iptables -L FORWARD -n -v
    #   3. ip_forward enabled? cat /proc/sys/net/ipv4/ip_forward
    #   4. Backend reachable? ping 192.168.1.10

    # MASQUERADE not working (clients cannot reach internet):
    #   1. FORWARD allowed? iptables -L FORWARD -n -v
    #   2. ip_forward=1? cat /proc/sys/net/ipv4/ip_forward
    #   3. Correct interface in -o eth0?
    #   4. Default route exists? ip route

    # conntrack table full:
    #   cat /proc/sys/net/netfilter/nf_conntrack_count  - current usage
    #   cat /proc/sys/net/netfilter/nf_conntrack_max    - maximum
    #   Increase max or reduce timeouts.
    #   dmesg | grep "nf_conntrack: table full"  - kernel messages

    # Hairpin NAT not working (internal client → external IP):
    #   Add DNAT in OUTPUT + MASQUERADE for hairpin traffic.
    #   Or use split-horizon DNS.

---

## Saving NAT Rules

    # Save along with all other rules
    iptables-save > /etc/iptables/rules.v4

    # nat table only
    iptables-save -t nat > /etc/iptables/nat.rules

    # Restore
    iptables-restore < /etc/iptables/rules.v4

    # Debian/Ubuntu: iptables-persistent
    apt install iptables-persistent
    netfilter-persistent save      # save current state
    netfilter-persistent reload    # reload rules

    # Verify rules loaded after reboot
    iptables -t nat -L -n -v

---

## Cheat Sheet

    View NAT:
      iptables -t nat -L -n -v                   - all NAT rules
      iptables -t nat -L PREROUTING -n -v        - PREROUTING only
      iptables -t nat -L POSTROUTING -n -v       - POSTROUTING only
      iptables-save -t nat                       - as commands
      conntrack -L                               - connection table
      conntrack -L | grep ESTABLISHED | wc -l   - active connections

    MASQUERADE (dynamic IP):
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    SNAT (static IP):
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
        -j SNAT --to-source 203.0.113.1

    DNAT / Port forwarding:
      iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 \
        -j DNAT --to-destination 192.168.1.10:80
      iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 -j ACCEPT

    REDIRECT (transparent proxy):
      iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
        -j REDIRECT --to-port 3128

    Required for NAT to work:
      echo 1 > /proc/sys/net/ipv4/ip_forward
      iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
      iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    conntrack tuning:
      sysctl net.netfilter.nf_conntrack_max=262144
      sysctl net.netfilter.nf_conntrack_tcp_timeout_established=7200

    Diagnostics:
      conntrack -L | grep src=192.168.1.5     - connections from a client
      tcpdump -i eth0 -n 'tcp port 8080'      - packets before DNAT
      tcpdump -i eth1 -n 'tcp port 80'        - packets after DNAT
      iptables -t nat -Z && iptables -t nat -L -n -v  - reset and watch counters

---

## References

- [man iptables-extensions](https://linux.die.net/man/8/iptables-extensions) - MASQUERADE, SNAT, DNAT parameters
- [Netfilter NAT HOWTO](https://www.netfilter.org/documentation/HOWTO/NAT-HOWTO.html) - official NAT guide
- [conntrack-tools](https://conntrack-tools.netfilter.org/manual.html) - conntrack documentation
- [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022) - traditional IP NAT
- [nftables NAT](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_(NAT)) - NAT in nftables
- [Arch Wiki iptables](https://wiki.archlinux.org/title/iptables) - practical examples
- [Linux Advanced Routing](https://lartc.org/howto/) - advanced routing and NAT
