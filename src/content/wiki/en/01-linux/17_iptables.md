---
title: "iptables - Chains INPUT, OUTPUT, FORWARD"
date: "2026-05-07"
---

iptables is the userspace utility for managing netfilter, the Linux kernel packet filtering framework. Every packet traverses a set of tables and chains where rules are evaluated. When a rule matches, a target (ACCEPT, DROP, REJECT, etc.) is executed.

The modern replacement is nftables, but iptables remains ubiquitous and is fundamental knowledge for every Linux engineer. On many systems iptables is now a wrapper over nftables.

---

## Architecture: Tables and Chains

    Tables - group rules by purpose:
      filter   - main packet filtering (INPUT, OUTPUT, FORWARD)
      nat      - address translation (PREROUTING, OUTPUT, POSTROUTING)
      mangle   - packet header modification
      raw      - bypass conntrack, early processing
      security - SELinux labels on packets

    Chains in the filter table:
      INPUT    - packets destined for the local system
      OUTPUT   - packets originating from the local system
      FORWARD  - packets being routed through the system

    Packet traversal path:

      Incoming packet for a local process:
        Network → PREROUTING (raw, mangle, nat) → INPUT (mangle, filter) → Process

      Outgoing packet from a local process:
        Process → OUTPUT (raw, mangle, nat, filter) → POSTROUTING (mangle, nat) → Network

      Transit packet (routing):
        Network → PREROUTING → FORWARD (mangle, filter) → POSTROUTING → Network

    Default policy:
      If no rule matches - the chain's policy is applied.
      ACCEPT - allow (open system).
      DROP   - silently discard (closed system).

### Targets (Actions)

    ACCEPT     - allow the packet, stop processing the chain.
    DROP       - discard the packet silently (client gets no response).
    REJECT     - discard and send an ICMP error to the client.
    LOG        - log the packet and continue to the next rule.
    RETURN     - return from a user-defined chain to the calling chain.
    DNAT       - change destination IP (nat PREROUTING/OUTPUT only).
    SNAT       - change source IP (nat POSTROUTING only).
    MASQUERADE - SNAT with dynamic IP (for PPP/DHCP interfaces).
    REDIRECT   - redirect to a different local port.
    MARK       - mark the packet (for policy-based routing).

---

## iptables Syntax

    # General syntax:
    iptables [-t table] COMMAND chain [matches] [-j target]

    # Default table is filter (if -t is omitted)

    Commands:
      -A  (--append)       - append rule to end of chain
      -I  (--insert)       - insert rule (default: at beginning)
      -D  (--delete)       - delete rule
      -R  (--replace)      - replace rule by number
      -L  (--list)         - list rules
      -F  (--flush)        - delete all rules from chain
      -Z  (--zero)         - reset counters
      -N  (--new)          - create user-defined chain
      -X  (--delete-chain) - delete user-defined chain
      -P  (--policy)       - set default policy
      -n  (--numeric)      - do not resolve names (show IPs and ports as numbers)
      -v  (--verbose)      - verbose output (packet/byte counters)
      --line-numbers       - show rule line numbers

    Matches (conditions):
      -s <ip>      - source IP
      -d <ip>      - destination IP
      -i <iface>   - incoming interface
      -o <iface>   - outgoing interface
      -p <proto>   - protocol (tcp, udp, icmp, all)
      --sport      - source port (only with -p tcp/udp)
      --dport      - destination port (only with -p tcp/udp)
      ! before match - negation (NOT)

---

## INPUT Chain

INPUT processes packets addressed to the server itself (its IP). A web server listening on 80/443 - INPUT rules allow those connections.

    # View INPUT rules
    iptables -L INPUT -n -v --line-numbers

    # Allow established connections (conntrack)
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    # ESTABLISHED - replies to outgoing connections
    # RELATED     - related connections (e.g. FTP data channel)

    # Allow loopback interface
    iptables -A INPUT -i lo -j ACCEPT

    # Allow ICMP ping
    iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

    # Allow SSH (port 22)
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT

    # Allow SSH from specific IP only
    iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -j ACCEPT

    # Allow HTTP and HTTPS
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT

    # Allow multiple ports (multiport)
    iptables -A INPUT -p tcp -m multiport --dports 80,443,8080,8443 -j ACCEPT

    # Allow a port range
    iptables -A INPUT -p tcp --dport 8000:9000 -j ACCEPT

    # Block a specific IP
    iptables -A INPUT -s 1.2.3.4 -j DROP

    # Block a subnet
    iptables -A INPUT -s 10.0.0.0/8 -j DROP

    # Default policy - DROP (deny all that is not explicitly allowed)
    iptables -P INPUT DROP

    # IMPORTANT: add ACCEPT rules (SSH, etc.) BEFORE setting policy to DROP
    # or you will lose access to the server!

### Protecting INPUT

    # SYN flood protection
    iptables -A INPUT -p tcp --syn -m limit --limit 1/s --limit-burst 3 -j ACCEPT
    iptables -A INPUT -p tcp --syn -j DROP

    # Port scan protection (NULL, FIN, XMAS scans)
    iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP      # NULL scan
    iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP       # XMAS scan
    iptables -A INPUT -p tcp --tcp-flags ALL FIN,PSH,URG -j DROP # FIN scan

    # ICMP rate limiting (anti ping flood)
    iptables -A INPUT -p icmp -m limit --limit 5/s --limit-burst 10 -j ACCEPT
    iptables -A INPUT -p icmp -j DROP

    # Block INVALID state packets
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

    # SSH brute-force protection via recent module
    iptables -A INPUT -p tcp --dport 22 -m recent --name ssh --update \
      --seconds 60 --hitcount 4 -j DROP
    iptables -A INPUT -p tcp --dport 22 -m recent --name ssh --set -j ACCEPT

    # Same via hashlimit (more flexible)
    iptables -A INPUT -p tcp --dport 22 -m hashlimit \
      --hashlimit-upto 3/min \
      --hashlimit-burst 5 \
      --hashlimit-mode srcip \
      --hashlimit-name ssh_limit \
      -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j DROP

---

## OUTPUT Chain

OUTPUT processes packets originating from the server itself (from local processes). By default OUTPUT is ACCEPT - the server can connect anywhere.

    # View OUTPUT rules
    iptables -L OUTPUT -n -v --line-numbers

    # Allow loopback
    iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established connections (replies)
    iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Allow DNS queries
    iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

    # Allow HTTP/HTTPS (so server can download updates)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # Allow NTP (time synchronization)
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # Allow SMTP (sending email)
    iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT

    # Block outbound to specific IP
    iptables -A OUTPUT -d 1.2.3.4 -j DROP

    # Allow only specific UID to make outbound connections
    iptables -A OUTPUT -m owner --uid-owner www-data -p tcp --dport 443 -j ACCEPT
    iptables -A OUTPUT -m owner --uid-owner www-data -j DROP

    # DROP policy for OUTPUT (paranoid mode)
    iptables -P OUTPUT DROP
    # After this, every type of outbound traffic must be explicitly allowed

---

## FORWARD Chain

FORWARD processes packets being routed through the server (not destined for it). Used when the server acts as a router, VPN gateway, or NAT device.

    # Default policy FORWARD DROP (secure)
    iptables -P FORWARD DROP

    # Enable IP forwarding in the kernel (required for FORWARD to work)
    echo 1 > /proc/sys/net/ipv4/ip_forward
    # permanently:
    echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
    sysctl -p

    # View FORWARD rules
    iptables -L FORWARD -n -v --line-numbers

    # Allow forwarding of established connections
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Allow forwarding from LAN to WAN (router)
    iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
    # eth1 = LAN interface, eth0 = WAN interface

    # Allow only HTTP/HTTPS through the router
    iptables -A FORWARD -i eth1 -o eth0 -p tcp -m multiport \
      --dports 80,443 -j ACCEPT

    # Block forwarding to a specific host
    iptables -A FORWARD -d 192.168.2.5 -j DROP

    # VPN server: allow forwarding through VPN interface
    iptables -A FORWARD -i wg0 -j ACCEPT
    iptables -A FORWARD -o wg0 -j ACCEPT
    # or
    iptables -A FORWARD -i tun0 -j ACCEPT
    iptables -A FORWARD -o tun0 -j ACCEPT

    # Docker uses FORWARD for containers
    # Example: containers on 172.17.0.0/16 via docker0
    iptables -A FORWARD -i docker0 -j ACCEPT
    iptables -A FORWARD -o docker0 -j ACCEPT

---

## NAT Table

NAT (Network Address Translation) works in the separate nat table. Three chains: PREROUTING, OUTPUT, POSTROUTING.

    # View NAT rules
    iptables -t nat -L -n -v

### MASQUERADE and SNAT (outbound NAT)

    # MASQUERADE - for dynamic IP (DHCP, PPPoE)
    # All packets from LAN outbound appear to come from the WAN interface IP
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # SNAT - for static IP (faster than MASQUERADE, IP is known upfront)
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 1.2.3.4

    # NAT all traffic through VPN (except the VPN traffic itself)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

### DNAT (inbound NAT / Port Forwarding)

    # Port forwarding: external port 8080 → internal server 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80

    # Forward port 22 to internal SSH server
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22

    # Forward only from specific source IP
    iptables -t nat -A PREROUTING -i eth0 -p tcp -s 10.0.0.5 --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80

    # Do not forget to allow forwarding to the backend
    iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 \
      -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT

### REDIRECT (local port redirect)

    # Redirect traffic to a local port (transparent proxy)
    iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3128

    # Redirect traffic from a specific subnet
    iptables -t nat -A PREROUTING -s 192.168.1.0/24 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

---

## Connection Tracking (conntrack)

conntrack is the connection state tracking module. Enables stateful rules instead of allowing each direction separately.

    conntrack states:
      NEW         - first packet of a new connection (SYN for TCP)
      ESTABLISHED - connection is up, packets flow both ways
      RELATED     - related connection (ICMP errors, FTP data channel)
      INVALID     - packet does not match any known connection
      UNTRACKED   - marked as not tracked (via raw table)

    # The golden stateful firewall rule:
    iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    # Allows replies without separate rules for each protocol.

    # View the connection tracking table
    conntrack -L
    conntrack -L --proto tcp
    conntrack -L --state ESTABLISHED
    cat /proc/net/nf_conntrack

    # Statistics
    conntrack -S

    # Delete a specific connection entry
    conntrack -D -p tcp --dport 80 -s 1.2.3.4

    # Maximum number of tracked connections
    cat /proc/sys/net/netfilter/nf_conntrack_max
    sysctl net.netfilter.nf_conntrack_max=131072

    # Lifetime of established TCP connections in conntrack
    cat /proc/sys/net/netfilter/nf_conntrack_tcp_timeout_established
    # default 432000 seconds (5 days) - too long for busy servers
    sysctl net.netfilter.nf_conntrack_tcp_timeout_established=86400

---

## User-Defined Chains

User-defined chains are a way to structure rules and avoid duplication. They are called from built-in chains via -j CHAIN_NAME.

    # Create chains for logical separation
    iptables -N TCP_IN      # TCP rules
    iptables -N UDP_IN      # UDP rules
    iptables -N ICMP_IN     # ICMP rules
    iptables -N BLACKLIST   # blocked IPs

    # Populate BLACKLIST
    iptables -A BLACKLIST -s 1.2.3.4    -j DROP
    iptables -A BLACKLIST -s 5.6.7.0/24 -j DROP
    # End of BLACKLIST - RETURN (everything else is not blocked)
    iptables -A BLACKLIST -j RETURN

    # Populate TCP_IN
    iptables -A TCP_IN -p tcp --dport 22  -j ACCEPT
    iptables -A TCP_IN -p tcp --dport 80  -j ACCEPT
    iptables -A TCP_IN -p tcp --dport 443 -j ACCEPT
    iptables -A TCP_IN -j RETURN          # everything else - return (will hit DROP)

    # Call user-defined chains from INPUT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -j BLACKLIST        # check blacklist first
    iptables -A INPUT -p tcp  -j TCP_IN
    iptables -A INPUT -p udp  -j UDP_IN
    iptables -A INPUT -p icmp -j ICMP_IN
    iptables -P INPUT DROP

    # View a user-defined chain
    iptables -L TCP_IN -n -v

---

## Logging

    # Log and allow
    iptables -A INPUT -p tcp --dport 22 -j LOG --log-prefix "SSH_ATTEMPT: " --log-level 4
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT

    # Log and drop (LOG does not stop chain processing)
    iptables -A INPUT -s 1.2.3.4 -j LOG --log-prefix "BLOCKED: " --log-level 4
    iptables -A INPUT -s 1.2.3.4 -j DROP

    # Rate-limit logging (to avoid flooding syslog)
    iptables -A INPUT -m limit --limit 5/min -j LOG \
      --log-prefix "INPUT_DROP: " --log-level 4

    # Syslog levels:
    # 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug

    # View logs
    tail -f /var/log/kern.log          # Debian/Ubuntu
    tail -f /var/log/messages          # RHEL/Fedora
    journalctl -k -f                   # systemd journal (kernel messages)
    journalctl -k | grep "SSH_ATTEMPT"

    # Log everything that falls through to DROP
    iptables -A INPUT -m limit --limit 5/min -j LOG \
      --log-prefix "INPUT_DROP: " --log-level 4
    iptables -P INPUT DROP

---

## Managing Rules

### Viewing

    # Show all filter table rules
    iptables -L -n -v

    # With line numbers
    iptables -L INPUT -n -v --line-numbers

    # Show nat table
    iptables -t nat -L -n -v

    # Show as commands (for scripts)
    iptables-save
    iptables-save -t filter    # filter table only

### Inserting and Deleting

    # Insert rule at position 1 (first)
    iptables -I INPUT 1 -s 10.0.0.1 -j ACCEPT

    # Insert at specific position
    iptables -I INPUT 3 -p tcp --dport 8080 -j ACCEPT

    # Delete by line number
    iptables -L INPUT --line-numbers    # find the number first
    iptables -D INPUT 3                 # delete rule #3

    # Delete by content
    iptables -D INPUT -p tcp --dport 8080 -j ACCEPT

    # Flush a chain
    iptables -F INPUT
    iptables -F         # flush all filter chains

    # Flush nat table
    iptables -t nat -F

    # Full reset (nuclear option)
    iptables -F
    iptables -X         # delete all user-defined chains
    iptables -Z         # reset counters
    iptables -t nat -F
    iptables -t nat -X
    iptables -t mangle -F
    iptables -t mangle -X
    iptables -P INPUT ACCEPT
    iptables -P OUTPUT ACCEPT
    iptables -P FORWARD ACCEPT

### Saving and Restoring

    # Save current rules
    iptables-save > /etc/iptables/rules.v4
    ip6tables-save > /etc/iptables/rules.v6

    # Restore
    iptables-restore < /etc/iptables/rules.v4

    # Debian/Ubuntu: autoload via iptables-persistent
    apt install iptables-persistent
    # Save current rules:
    netfilter-persistent save
    # Automatically loads /etc/iptables/rules.v4 at boot

    # RHEL/Fedora: via iptables service
    dnf install iptables-services
    systemctl enable iptables
    service iptables save    # saves to /etc/sysconfig/iptables

    # systemd unit (universal approach)
    # /etc/systemd/system/iptables-restore.service
    [Unit]
    Description=Restore iptables rules
    Before=network-pre.target
    Wants=network-pre.target

    [Service]
    Type=oneshot
    ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
    RemainAfterExit=yes

    [Install]
    WantedBy=multi-user.target

---

## Ready-to-Use Configurations

### Basic Server Firewall

    #!/bin/bash
    # Flush all rules
    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t nat -X

    # Default policies
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # Loopback
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT

    # Established connections
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Drop invalid packets
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

    # ICMP ping (rate-limited)
    iptables -A INPUT -p icmp --icmp-type echo-request \
      -m limit --limit 5/s -j ACCEPT

    # SSH (management network only)
    iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT

    # HTTP and HTTPS
    iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT

    # Log everything that drops
    iptables -A INPUT -m limit --limit 5/min -j LOG \
      --log-prefix "iptables_drop: " --log-level 4

    echo "Firewall applied"

### NAT Router (gateway for a local network)

    #!/bin/bash
    # Variables
    WAN=eth0          # external interface
    LAN=eth1          # internal interface
    LAN_NET=192.168.1.0/24

    # Enable IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Flush
    iptables -F
    iptables -t nat -F

    # Policies
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: loopback and established
    iptables -A INPUT -i lo   -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT    # trust LAN
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -i $WAN -j ACCEPT   # SSH from outside

    # FORWARD: LAN → WAN
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: masquerade for LAN
    iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j MASQUERADE

    # Port forwarding: external 8080 → internal web server
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 -j ACCEPT

### Docker-Compatible Firewall

    # Docker manages FORWARD and nat tables itself.
    # Do not set iptables -P FORWARD DROP without accounting for Docker rules.

    # Correct approach - add rules via the DOCKER-USER chain:
    # Docker creates DOCKER-USER, called from FORWARD before the DOCKER chain.

    # Block access to a container from external network
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -s 0.0.0.0/0 -j DROP

    # Allow only from a specific IP
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -s 10.0.0.5 -j ACCEPT
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -j DROP

    # DOCKER-USER rules survive Docker restarts.
    # Rules in the DOCKER chain are managed by Docker - do not touch.

---

## ipset - IP Address Sets

ipset speeds up matching against large lists of IPs (thousands of addresses).

    # Install
    apt install ipset    # Debian/Ubuntu
    dnf install ipset    # Fedora/RHEL

    # Create an IP set
    ipset create blacklist hash:ip
    ipset create blacklist_net hash:net    # for subnets

    # Add addresses
    ipset add blacklist 1.2.3.4
    ipset add blacklist 5.6.7.8
    ipset add blacklist_net 10.0.0.0/8

    # Use in iptables
    iptables -A INPUT -m set --match-set blacklist src -j DROP
    iptables -A INPUT -m set --match-set blacklist_net src -j DROP

    # View set contents
    ipset list blacklist

    # Remove address from set
    ipset del blacklist 1.2.3.4

    # Save and restore
    ipset save > /etc/ipset.conf
    ipset restore < /etc/ipset.conf

    # Temporary ban (TTL)
    ipset create temp_ban hash:ip timeout 3600   # ban for 1 hour
    ipset add temp_ban 1.2.3.4                   # auto-removed after 1 hour

---

## Diagnostics

    # Show all rules for all tables
    iptables -L -n -v
    iptables -t nat -L -n -v
    iptables -t mangle -L -n -v

    # Check counters (packets/bytes)
    iptables -L INPUT -n -v    # pkts and bytes columns

    # Zero counters and watch what arrives
    iptables -Z INPUT
    # ... generate traffic ...
    iptables -L INPUT -n -v

    # Packet tracing (TRACE target)
    # Add trace rule to the raw table
    iptables -t raw -A PREROUTING -p tcp --dport 80 -j TRACE
    iptables -t raw -A OUTPUT -p tcp --dport 80 -j TRACE
    # Watch in logs:
    journalctl -k | grep TRACE
    # Remove after debugging:
    iptables -t raw -F

    # View conntrack table
    conntrack -L
    conntrack -L | grep "src=1.2.3.4"

    # Check ip_forward
    cat /proc/sys/net/ipv4/ip_forward    # 1 = enabled

    # Verify rule works
    tcpdump -i eth0 -n 'tcp port 80'     # can we see packets before rules
    curl -v http://server_ip             # test connectivity

    # Common mistakes:
    # Rule order: more specific rules must come before general ones.
    # ESTABLISHED,RELATED must be the first INPUT/OUTPUT rule.
    # Forgot -P INPUT ACCEPT after testing → locked out of server.
    # FORWARD DROP without ip_forward=1 → packets not routed.
    # Docker rewrites FORWARD → use DOCKER-USER chain instead.

---

## Cheat Sheet

    View:
      iptables -L -n -v                       - all filter rules
      iptables -L INPUT -n -v --line-numbers  - INPUT with line numbers
      iptables -t nat -L -n -v                - NAT rules
      iptables-save                           - all rules as commands

    Adding rules:
      iptables -A INPUT -p tcp --dport 22 -j ACCEPT   - allow SSH
      iptables -A INPUT -p tcp --dport 80 -j ACCEPT   - allow HTTP
      iptables -A INPUT -s 1.2.3.4 -j DROP            - block IP
      iptables -I INPUT 1 -s 10.0.0.1 -j ACCEPT       - insert first

    Deleting:
      iptables -D INPUT 3                              - delete rule #3
      iptables -D INPUT -p tcp --dport 80 -j ACCEPT   - delete by content
      iptables -F INPUT                                - flush INPUT chain
      iptables -F && iptables -P INPUT ACCEPT          - reset everything

    Policies:
      iptables -P INPUT DROP     - deny all inbound by default
      iptables -P FORWARD DROP   - deny all forwarding by default
      iptables -P OUTPUT ACCEPT  - allow all outbound

    conntrack:
      -m conntrack --ctstate ESTABLISHED,RELATED  - allow replies
      -m conntrack --ctstate INVALID              - block invalid
      -m conntrack --ctstate NEW                  - new connections only
      conntrack -L                                - connection table

    NAT:
      -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE  - NAT
      -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to 10.0.0.1:80  - port forward

    Saving:
      iptables-save > /etc/iptables/rules.v4
      iptables-restore < /etc/iptables/rules.v4
      apt install iptables-persistent && netfilter-persistent save

    Protection:
      -m limit --limit 5/s --limit-burst 10          - rate limiting
      -m recent --update --seconds 60 --hitcount 4   - brute-force protection
      --tcp-flags ALL NONE -j DROP                   - NULL scan protection
      -m set --match-set blacklist src -j DROP        - ipset blocking

---

## References

- [man iptables](https://linux.die.net/man/8/iptables) - full options reference
- [man iptables-extensions](https://linux.die.net/man/8/iptables-extensions) - all match modules
- [Netfilter Documentation](https://www.netfilter.org/documentation/) - official docs
- [conntrack-tools](https://conntrack-tools.netfilter.org/) - conntrack utilities
- [ipset man](https://ipset.netfilter.org/ipset.man.html) - ipset documentation
- [nftables Wiki](https://wiki.nftables.org/) - modern iptables replacement
- [Arch Wiki iptables](https://wiki.archlinux.org/title/iptables) - practical guide
- [frozentux iptables tutorial](https://www.frozentux.net/iptables-tutorial/iptables-tutorial.html) - detailed tutorial
