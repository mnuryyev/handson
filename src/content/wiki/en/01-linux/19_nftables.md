---
title: "nftables - Basics and Replacing iptables"
date: "2026-05-09"
---

nftables is the modern packet filtering framework in the Linux kernel, replacing iptables/ip6tables/arptables/ebtables. Included in the kernel since version 3.13 (2014). In Debian 10+, RHEL 8+, Ubuntu 20.04+ it is the default tool. The `iptables` command on these systems is a wrapper over nftables.

One utility `nft` replaces four: iptables, ip6tables, arptables, ebtables. Rules are stored in one place, read like a config file, and no separate commands are needed per action.

---

## Differences from iptables

                    iptables                nftables
    Commands        4 utilities             1 utility (nft)
    IPv4/IPv6       separate                in one rule
    Tables          built-in, fixed         created by user
    Chains          built-in                created by user
    Syntax          flags (-A, -D, -p)      readable language (add rule ... tcp dport)
    Sets            ipset (external)        built into nftables
    Counters        per rule                named, reusable
    Atomic replace  no (line by line)       yes (nft -f file - atomic)
    Performance     linear scan             JIT rule compilation

    Compatibility:
      iptables-nft    - iptables syntax, nftables backend
      iptables-legacy - old iptables kernel backend
      Cannot mix iptables-legacy and nftables simultaneously.

---

## Installation and Basic Commands

    # Install
    apt install nftables    # Debian/Ubuntu
    dnf install nftables    # Fedora/RHEL

    # Start and enable
    systemctl enable --now nftables

    # Version
    nft --version

    # Show everything (tables, chains, rules)
    nft list ruleset

    # Show a specific table
    nft list table inet filter

    # Show a specific chain
    nft list chain inet filter input

    # Show in restorable form
    nft -s list ruleset     # with handle comments
    nft list ruleset > /etc/nftables.conf   # save

    # Apply config from file (atomically)
    nft -f /etc/nftables.conf

    # Validate file without applying
    nft -c -f /etc/nftables.conf

    # Flush everything
    nft flush ruleset

---

## Structure: Families, Tables, Chains

### Families

    The family determines which traffic is processed:

      ip      - IPv4 only (like iptables)
      ip6     - IPv6 only (like ip6tables)
      inet    - IPv4 and IPv6 together (recommended)
      arp     - ARP packets (like arptables)
      bridge  - traffic through a bridge (like ebtables)
      netdev  - bound to a specific interface (ingress/egress)

    Recommendation: use inet for most tasks.
    One rule in inet covers both IPv4 and IPv6.

### Tables

    A table is a container for chains. In nftables, tables are created manually -
    there are no built-in filter/nat/mangle tables.

    # Create a table
    nft add table inet filter
    nft add table inet nat
    nft add table ip myfilter

    # Delete a table (and all chains/rules inside)
    nft delete table inet filter

    # List tables
    nft list tables

### Chains

    Two chain types:
      Base chain   - entry point for traffic (hook). Processes real packets.
      Regular chain - called from other chains (like iptables user-defined chains).

    Base chain parameters:
      type     - filter, nat, route
      hook     - prerouting, input, forward, output, postrouting, ingress
      priority - processing order (number or names: filter=0, nat=-100, mangle=-150)
      policy   - default action: accept or drop

    # Create base chain (like INPUT in iptables)
    nft add chain inet filter input \
      '{ type filter hook input priority filter; policy drop; }'

    # Create base chain OUTPUT
    nft add chain inet filter output \
      '{ type filter hook output priority filter; policy accept; }'

    # Create base chain FORWARD
    nft add chain inet filter forward \
      '{ type filter hook forward priority filter; policy drop; }'

    # Create NAT chain PREROUTING
    nft add chain inet nat prerouting \
      '{ type nat hook prerouting priority dstnat; }'

    # Create NAT chain POSTROUTING
    nft add chain inet nat postrouting \
      '{ type nat hook postrouting priority srcnat; }'

    # Create regular chain (no hook - called from other chains)
    nft add chain inet filter tcp_input

    # Delete a chain
    nft delete chain inet filter input

    # List chains
    nft list chains

    Standard priority names:
      raw        = -300
      mangle     = -150
      dstnat     = -100   (used for PREROUTING nat)
      filter     =  0
      security   =  50
      srcnat     =  100   (used for POSTROUTING nat)

---

## Rules

### Rule Syntax

    # Append rule to end of chain
    nft add rule inet filter input <matches> <verdict>

    # Insert rule at beginning of chain
    nft insert rule inet filter input <matches> <verdict>

    # Insert after specific handle (rule number)
    nft add rule inet filter input handle 5 <matches> <verdict>

    # Show handle numbers
    nft -a list chain inet filter input

    # Delete rule by handle
    nft delete rule inet filter input handle 7

    # Replace a rule
    nft replace rule inet filter input handle 7 <new matches> <verdict>

### Matches (conditions)

    # Protocol
    ip protocol tcp
    ip protocol udp
    meta l4proto tcp       # works for both IPv4 and IPv6

    # Ports
    tcp dport 22
    tcp dport { 80, 443 }  # set of ports
    tcp dport 8000-9000    # range
    tcp sport 1024-65535

    # IP addresses
    ip saddr 192.168.1.0/24
    ip daddr 10.0.0.1
    ip6 saddr ::1
    ip saddr { 192.168.1.0/24, 10.0.0.0/8 }

    # Interfaces
    iifname "eth0"         # incoming interface
    oifname "eth1"         # outgoing interface
    iif lo                 # by index (faster)

    # conntrack states
    ct state established,related
    ct state invalid
    ct state new

    # TCP flags
    tcp flags syn
    tcp flags & (syn|ack) == syn   # SYN only (not SYN-ACK)

    # ICMP
    icmp type echo-request
    icmpv6 type echo-request

    # Negation
    ip saddr != 192.168.1.1
    tcp dport != { 80, 443 }

    # Meta information
    meta iifname "eth0"
    meta oifname "eth1"
    meta mark 0x1
    meta length > 1000     # packet size

### Verdicts and Statements

    accept   - allow the packet
    drop     - discard silently
    reject   - discard with ICMP error
    reject with tcp reset       - discard with TCP RST
    reject with icmp type port-unreachable
    return   - return to calling chain
    jump <chain>   - go to chain (with return)
    goto <chain>   - go to chain (without return)
    log      - log the packet
    counter  - count packets/bytes
    limit    - rate limiting

---

## Complete Rule Examples

### Basic INPUT Rules

    # Add rules to inet filter input
    nft add rule inet filter input iif lo accept
    nft add rule inet filter input ct state established,related accept
    nft add rule inet filter input ct state invalid drop
    nft add rule inet filter input ip protocol icmp icmp type echo-request limit rate 5/second accept
    nft add rule inet filter input tcp dport 22 accept
    nft add rule inet filter input tcp dport { 80, 443 } accept

    # Log and drop the rest
    nft add rule inet filter input log prefix "input_drop: " drop

### Configuration via File (recommended)

    The best approach is to write a config file and apply it as a whole:

    # /etc/nftables.conf

    #!/usr/sbin/nft -f
    flush ruleset

    table inet filter {

        chain input {
            type filter hook input priority filter; policy drop;

            # Loopback
            iif lo accept

            # Established connections
            ct state established,related accept
            ct state invalid drop

            # ICMP / ICMPv6
            ip protocol icmp  icmp type echo-request  limit rate 5/second accept
            ip6 nexthdr icmpv6 icmpv6 type echo-request limit rate 5/second accept

            # ICMPv6 - required types for IPv6 to work
            ip6 nexthdr icmpv6 icmpv6 type {
                nd-neighbor-solicitation,
                nd-neighbor-advertisement,
                nd-router-advertisement
            } accept

            # SSH
            tcp dport 22 accept

            # HTTP / HTTPS
            tcp dport { 80, 443 } accept

            # Log the rest
            limit rate 5/minute log prefix "nft_input_drop: "
        }

        chain forward {
            type filter hook forward priority filter; policy drop;
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    # Apply
    nft -f /etc/nftables.conf

---

## Sets

Sets are one of the main advantages of nftables over iptables. Built into the kernel - no external ipset needed.

### Anonymous Sets

    # Inline in a rule - anonymous set
    nft add rule inet filter input tcp dport { 22, 80, 443, 8080 } accept
    nft add rule inet filter input ip saddr { 192.168.1.0/24, 10.0.0.0/8 } accept

    # Anonymous sets cannot be reused.

### Named Sets

    # Create a named IP address set
    nft add set inet filter trusted_ips { type ipv4_addr; }

    # Create a set with subnet support
    nft add set inet filter blocked_nets { type ipv4_addr; flags interval; }

    # Create a port set
    nft add set inet filter allowed_ports { type inet_service; }

    # Add elements to the set
    nft add element inet filter trusted_ips { 192.168.1.5, 10.0.0.1 }
    nft add element inet filter blocked_nets { 1.2.3.0/24, 5.6.7.0/24 }
    nft add element inet filter allowed_ports { 22, 80, 443 }

    # Remove an element
    nft delete element inet filter blocked_nets { 1.2.3.0/24 }

    # Use the set in a rule
    nft add rule inet filter input ip saddr @trusted_ips accept
    nft add rule inet filter input ip saddr @blocked_nets drop
    nft add rule inet filter input tcp dport @allowed_ports accept

    # Show set contents
    nft list set inet filter trusted_ips

    # Set types:
    # ipv4_addr    - IPv4 addresses
    # ipv6_addr    - IPv6 addresses
    # inet_proto   - protocols
    # inet_service - ports (0-65535)
    # ether_addr   - MAC addresses
    # mark         - packet mark

### Sets in Config File

    table inet filter {

        set trusted_ips {
            type ipv4_addr;
            elements = { 192.168.1.5, 192.168.1.10, 10.0.0.1 }
        }

        set blocked_nets {
            type ipv4_addr;
            flags interval;
            elements = { 1.2.3.0/24, 5.6.0.0/16 }
        }

        set allowed_ports {
            type inet_service;
            elements = { 22, 80, 443, 8080 }
        }

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept
            ct state established,related accept
            ip saddr @blocked_nets drop
            ip saddr @trusted_ips accept
            tcp dport @allowed_ports accept
        }
    }

### Sets with Timeout (dynamic banning)

    # Set with automatic element removal after timeout
    nft add set inet filter temp_ban {
        type ipv4_addr;
        flags timeout;
        timeout 1h;    # elements removed after 1 hour
    }

    # Add IP to ban list (removed after 1 hour)
    nft add element inet filter temp_ban { 1.2.3.4 }

    # Add with specific timeout
    nft add element inet filter temp_ban { 5.6.7.8 timeout 30m }

    # Rule using the ban list
    nft add rule inet filter input ip saddr @temp_ban drop

### Counters in Sets (meters)

    # Dynamic set for rate limiting (meter)
    # Create a rule with an inline meter
    nft add rule inet filter input \
      tcp dport 22 \
      meter ssh_meter { ip saddr timeout 60s limit rate over 3/minute } \
      drop
    # If a src IP exceeds 3 connections/minute → drop.
    # State is stored in the meter (auto-removed after 60s).

---

## NAT in nftables

### MASQUERADE

    # Create NAT table and chains
    nft add table inet nat
    nft add chain inet nat prerouting  \
      '{ type nat hook prerouting priority dstnat; }'
    nft add chain inet nat postrouting \
      '{ type nat hook postrouting priority srcnat; }'

    # MASQUERADE: all packets from LAN through eth0
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" masquerade

    # Enable IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Allow FORWARD
    nft add rule inet filter forward \
      iifname "eth1" oifname "eth0" accept
    nft add rule inet filter forward \
      ct state established,related accept

### SNAT

    # SNAT with static IP
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" \
      snat to 203.0.113.1

    # SNAT with port range
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" \
      snat to 203.0.113.1:1024-65535

### DNAT / Port Forwarding

    # Port forwarding: external 8080 → internal 192.168.1.10:80
    nft add rule inet nat prerouting \
      iifname "eth0" tcp dport 8080 \
      dnat to 192.168.1.10:80

    # SSH forwarding on non-standard port
    nft add rule inet nat prerouting \
      iifname "eth0" tcp dport 2222 \
      dnat to 192.168.1.20:22

    # UDP forwarding (DNS)
    nft add rule inet nat prerouting \
      iifname "eth0" udp dport 53 \
      dnat to 192.168.1.53

    # DNAT with source IP condition
    nft add rule inet nat prerouting \
      iifname "eth0" ip saddr 10.0.0.5 tcp dport 80 \
      dnat to 192.168.1.10:80

    # Allow FORWARD for DNAT traffic
    nft add rule inet filter forward \
      ip daddr 192.168.1.10 tcp dport 80 accept

### REDIRECT

    # Transparent proxy: HTTP → Squid
    nft add rule inet nat prerouting \
      iifname "eth1" tcp dport 80 \
      redirect to :3128

### NAT in Config File

    table inet nat {

        chain prerouting {
            type nat hook prerouting priority dstnat;

            # Port forwarding
            iifname "eth0" tcp dport 8080 dnat to 192.168.1.10:80
            iifname "eth0" tcp dport 2222 dnat to 192.168.1.20:22
            iifname "eth0" udp dport 27015 dnat to 192.168.1.30:27015
        }

        chain postrouting {
            type nat hook postrouting priority srcnat;

            # MASQUERADE for LAN
            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Logging and Counters

### Logging

    # Log packets (and continue processing)
    nft add rule inet filter input log prefix "INPUT: "

    # Log with syslog level
    nft add rule inet filter input \
      tcp dport 22 \
      log prefix "SSH: " level info

    # Log and drop
    nft add rule inet filter input \
      ip saddr 1.2.3.4 \
      log prefix "BLOCKED: " drop

    # Log with rate limiting (avoid syslog flooding)
    nft add rule inet filter input \
      limit rate 5/minute \
      log prefix "nft_drop: " level warn

    # Log levels: emerg, alert, crit, err, warn, notice, info, debug

    # View logs
    journalctl -k | grep "INPUT:"
    tail -f /var/log/kern.log | grep "nft_"

### Counters

    # Named counter (create separately)
    nft add counter inet filter http_counter
    nft add counter inet filter ssh_counter

    # Use in a rule
    nft add rule inet filter input \
      tcp dport 80 counter name http_counter accept
    nft add rule inet filter input \
      tcp dport 22 counter name ssh_counter accept

    # Inline counter in a rule
    nft add rule inet filter input \
      tcp dport 80 counter accept

    # Show counters
    nft list counters
    nft list counter inet filter http_counter

    # Reset counters
    nft reset counters inet filter

    # Show rules with counters
    nft list chain inet filter input

---

## Limit (rate limiting)

    # Rate-limit ICMP
    nft add rule inet filter input \
      ip protocol icmp limit rate 5/second burst 10 packets accept
    nft add rule inet filter input ip protocol icmp drop

    # Rate-limit new SSH connections
    nft add rule inet filter input \
      tcp dport 22 ct state new \
      limit rate 3/minute burst 5 packets accept
    nft add rule inet filter input tcp dport 22 ct state new drop

    # Rate-limit on interface
    nft add rule inet filter input \
      iifname "eth0" limit rate over 100 mbytes/second drop

    # limit parameters:
    # rate N/second|minute|hour|day   - rate
    # burst N packets|bytes           - allowed burst
    # rate over - drop if EXCEEDS (inverted)

---

## Complete Configurations

### Server Firewall (config file)

    # /etc/nftables.conf
    #!/usr/sbin/nft -f
    flush ruleset

    table inet filter {

        # Sets
        set trusted_ssh {
            type ipv4_addr;
            flags interval;
            elements = { 10.0.0.0/8, 192.168.0.0/16 }
        }

        set blocked {
            type ipv4_addr;
            flags interval, timeout;
            timeout 24h;
        }

        # Counters
        counter dropped { }
        counter accepted { }

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept

            ct state established,related counter name accepted accept
            ct state invalid counter name dropped drop

            # Block from blacklist
            ip saddr @blocked counter name dropped drop

            # ICMP
            ip protocol icmp icmp type echo-request \
                limit rate 5/second burst 10 packets accept
            ip6 nexthdr icmpv6 icmpv6 type {
                echo-request, nd-neighbor-solicitation,
                nd-neighbor-advertisement, nd-router-advertisement
            } accept

            # SSH: trusted networks only + rate limit
            ip saddr @trusted_ssh tcp dport 22 \
                ct state new limit rate 5/minute \
                counter name accepted accept

            # HTTP/HTTPS
            tcp dport { 80, 443 } counter name accepted accept

            # Log drops
            limit rate 10/minute log prefix "nft_drop: " level warn
            counter name dropped
        }

        chain forward {
            type filter hook forward priority filter; policy drop;
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

### NAT Gateway (config file)

    # /etc/nftables.conf
    #!/usr/sbin/nft -f
    flush ruleset

    table inet filter {

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept
            iif "eth1" accept                              # trust LAN
            ct state established,related accept
            ct state invalid drop

            tcp dport 22 accept                            # SSH to gateway
            ip protocol icmp icmp type echo-request \
                limit rate 5/second accept
        }

        chain forward {
            type filter hook forward priority filter; policy drop;

            ct state established,related accept
            ct state invalid drop

            # LAN → WAN
            iifname "eth1" oifname "eth0" accept

            # DNAT traffic (forwarding to backend servers)
            ip daddr 192.168.1.10 tcp dport { 80, 443 } accept
            ip daddr 192.168.1.20 tcp dport 22 accept
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    table inet nat {

        chain prerouting {
            type nat hook prerouting priority dstnat;

            iifname "eth0" tcp dport { 80, 443 } dnat to 192.168.1.10
            iifname "eth0" tcp dport 2222 dnat to 192.168.1.20:22
        }

        chain postrouting {
            type nat hook postrouting priority srcnat;

            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Migrating from iptables

### Automatic Conversion

    # Install conversion tools
    apt install iptables    # includes iptables-translate

    # Convert a single iptables command to nftables syntax
    iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT
    # Output: nft add rule ip filter INPUT tcp dport 22 counter accept

    # Convert an entire ruleset
    # First save current iptables rules:
    iptables-save > /tmp/iptables.rules
    ip6tables-save > /tmp/ip6tables.rules

    # Convert to nftables format:
    iptables-restore-translate -f /tmp/iptables.rules > /tmp/nftables_from_ipt.conf
    ip6tables-restore-translate -f /tmp/ip6tables.rules >> /tmp/nftables_from_ipt.conf

    # Review the output
    cat /tmp/nftables_from_ipt.conf

    # Apply (after review)
    nft -f /tmp/nftables_from_ipt.conf

### Concept Mapping

    iptables                         nftables
    ──────────────────────────────────────────────────────────────
    iptables -t filter               table inet filter (or ip filter)
    iptables -t nat                  table inet nat
    iptables -t mangle               table inet mangle
    -A INPUT                         add rule ... hook input
    -A OUTPUT                        add rule ... hook output
    -A FORWARD                       add rule ... hook forward
    -j ACCEPT                        accept
    -j DROP                          drop
    -j REJECT                        reject
    -j MASQUERADE                    masquerade
    -j SNAT --to-source X            snat to X
    -j DNAT --to-destination X       dnat to X
    -p tcp --dport 80                tcp dport 80
    -p tcp -m multiport --dports X   tcp dport { X, Y, Z }
    -s 192.168.1.0/24                ip saddr 192.168.1.0/24
    -d 10.0.0.1                      ip daddr 10.0.0.1
    -i eth0                          iifname "eth0"
    -o eth0                          oifname "eth0"
    -m conntrack --ctstate EST       ct state established
    -m limit --limit 5/s             limit rate 5/second
    -m set --match-set X src         ip saddr @X
    -j LOG --log-prefix "X"         log prefix "X"
    -N MYCHAIN                       add chain inet filter mychain
    -j MYCHAIN                       jump mychain

### Manual Migration Example

    # iptables rules:
    iptables -P INPUT DROP
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Equivalent in nftables (/etc/nftables.conf):
    table inet filter {
        chain input {
            type filter hook input priority filter; policy drop;
            iif lo accept
            ct state established,related accept
            tcp dport 22 accept
            tcp dport { 80, 443 } accept
        }
        chain forward {
            type filter hook forward priority filter; policy drop;
            iifname "eth1" oifname "eth0" accept
            ct state established,related accept
        }
        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    table inet nat {
        chain postrouting {
            type nat hook postrouting priority srcnat;
            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Managing Rules

### Atomic Updates

    # The key advantage of nftables: atomic replacement of the entire ruleset.
    # iptables applies rules one by one → intermediate states are unsafe.
    # nftables applies the whole file atomically → all or nothing.

    # Edit the file
    vim /etc/nftables.conf

    # Apply atomically
    nft -f /etc/nftables.conf
    # If there is an error - old rules remain in effect.

    # Validate without applying
    nft -c -f /etc/nftables.conf

### Adding and Deleting Rules Online

    # Show handles (rule numbers)
    nft -a list chain inet filter input
    # ...
    # tcp dport 22 accept # handle 5
    # tcp dport { 80, 443 } accept # handle 6

    # Delete rule by handle
    nft delete rule inet filter input handle 5

    # Insert rule after handle 3
    nft add rule inet filter input handle 3 \
      ip saddr 1.2.3.4 drop

    # Replace a rule
    nft replace rule inet filter input handle 5 \
      tcp dport 2222 accept

### Managing Sets Online

    # Add IP to a set without reloading rules
    nft add element inet filter blocked { 1.2.3.4 }
    nft add element inet filter blocked { 5.6.0.0/16 }

    # Remove IP from set
    nft delete element inet filter blocked { 1.2.3.4 }

    # Flush a set
    nft flush set inet filter blocked

    # This works live - rules continue operating.

### Saving and Autoloading

    # Save current rules to file
    nft list ruleset > /etc/nftables.conf

    # Enable autostart via systemd
    systemctl enable nftables
    # Reads /etc/nftables.conf at boot

    # Check status
    systemctl status nftables

    # Reload rules
    systemctl reload nftables
    # or
    nft -f /etc/nftables.conf

---

## Diagnostics

    # Show all rules
    nft list ruleset

    # Show with handle numbers
    nft -a list ruleset

    # Traffic monitoring: add a temporary counter
    nft add rule inet filter input counter    # count all inbound
    nft list chain inet filter input          # view counters
    nft delete rule inet filter input handle <N>  # remove when done

    # Packet tracing
    # nftables equivalent of iptables TRACE:
    nft add table netdev trace_table
    nft add chain netdev trace_table trace_chain \
      '{ type filter hook ingress device eth0 priority -500; }'
    nft add rule netdev trace_table trace_chain \
      tcp dport 80 meta nftrace set 1

    # Watch the trace
    nft monitor trace

    # Remove after debugging
    nft delete table netdev trace_table

    # Check conntrack
    conntrack -L
    conntrack -L | grep ESTABLISHED | wc -l

    # Common errors:
    # "Error: Could not process rule: No such file or directory"
    #   - table or chain does not exist, create it first.
    # "Error: syntax error, unexpected..."
    #   - syntax error in config. Check quotes and braces.
    # NAT not working:
    #   - check ip_forward: cat /proc/sys/net/ipv4/ip_forward
    #   - make sure FORWARD is allowed in the filter table.
    # Rules applied but traffic not passing:
    #   - check rule order (drop before accept?)
    #   - nft -a list chain ... to see handles and order.

---

## Cheat Sheet

    Basic commands:
      nft list ruleset                         - show everything
      nft -a list ruleset                      - with handle numbers
      nft flush ruleset                        - flush everything
      nft -f /etc/nftables.conf                - apply config
      nft -c -f /etc/nftables.conf             - validate config

    Tables and chains:
      nft add table inet filter                - create table
      nft add chain inet filter input \
        '{ type filter hook input priority filter; policy drop; }'
      nft delete table inet filter             - delete table

    Rules:
      nft add rule inet filter input iif lo accept
      nft add rule inet filter input ct state established,related accept
      nft add rule inet filter input tcp dport 22 accept
      nft add rule inet filter input tcp dport { 80, 443 } accept
      nft add rule inet filter input ip saddr 1.2.3.4 drop
      nft delete rule inet filter input handle 5

    NAT:
      nft add rule inet nat postrouting \
        ip saddr 192.168.1.0/24 oifname "eth0" masquerade
      nft add rule inet nat prerouting \
        iifname "eth0" tcp dport 8080 dnat to 192.168.1.10:80

    Sets:
      nft add set inet filter myips { type ipv4_addr; }
      nft add element inet filter myips { 1.2.3.4, 5.6.7.8 }
      nft add rule inet filter input ip saddr @myips drop
      nft delete element inet filter myips { 1.2.3.4 }

    Migrating from iptables:
      iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT
      iptables-save | iptables-restore-translate -f /dev/stdin

    Autoloading:
      nft list ruleset > /etc/nftables.conf
      systemctl enable --now nftables

    Tracing:
      nft add rule ... meta nftrace set 1
      nft monitor trace

---

## References

- [nftables Wiki](https://wiki.nftables.org/) - official documentation
- [man nft](https://linux.die.net/man/8/nft) - man page
- [nftables Quick Reference](https://wiki.nftables.org/wiki-nftables/index.php/Quick_reference-nftables_in_10_minutes) - quick start
- [Migrating from iptables](https://wiki.nftables.org/wiki-nftables/index.php/Moving_from_iptables_to_nftables) - official migration guide
- [nftables examples](https://wiki.nftables.org/wiki-nftables/index.php/Main_Page) - configuration examples
- [Netfilter documentation](https://www.netfilter.org/documentation/) - netfilter docs
- [Arch Wiki nftables](https://wiki.archlinux.org/title/nftables) - practical guide
- [Red Hat nftables guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/configuring_firewalls_and_packet_filters/) - RHEL guide
