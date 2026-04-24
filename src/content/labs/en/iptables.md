---
title: "iptables. Basic firewall configuration"
description: "In this lab we will build a firewall from scratch: from resetting rules to SYN-flood protection, port scan blocking, and logging everything suspicious"
image: "/images/iptables_sec/main.jpg"
date: "2026-04-12"
---

## Introduction

Most Linux systems ship without a configured firewall — all incoming traffic is accepted by default. iptables gives you complete control over what reaches the server, what leaves it, and what gets forwarded further.

In this lab we will build a firewall from scratch: from resetting rules to SYN-flood protection, port scan blocking, and logging everything suspicious. At the end we will verify the result through nmap from another machine - to see exactly what is visible from the outside.

| Parameter | Value |
| --- | --- |
| Server | Ubuntu, 10.10.70.130 |
| Attack machine | Parrot OS, 10.10.70.129 |
| Tools | iptables, nmap, curl, journalctl |

---

## Theoretical Background

### How iptables Chains Work

iptables processes packets through three main chains:

**INPUT** - packets addressed to the server itself. This is where the decision is made about who can connect to SSH, HTTP, and other services.

**FORWARD** - packets the server is forwarding onward (router behaviour). For a regular server this is closed completely.

**OUTPUT** - packets originating from the server. Usually left open — the server needs to initiate its own connections.

### DROP vs REJECT

**DROP** - the packet is silently discarded. The sender gets no response and does not know whether the host exists. Better for security — hides network topology.

**REJECT** - the sender receives an ICMP error. More honest, but reveals the existence of the host and the presence of a firewall.

### Connection State Tracking

The `state` module allows understanding the context of a packet:

| State | Meaning |
| --- | --- |
| NEW | First packet of a new connection |
| ESTABLISHED | Packet belonging to an already established connection |
| RELATED | Related connection (e.g. FTP data channel) |
| INVALID | Packet not belonging to any known connection |

---

## Phase 1. Initial State

### Step 1. Checking Rules Before Any Changes

```bash
sudo iptables -L -v -n
sudo iptables -L -v -n --line-numbers
sudo iptables-save
```

![01_iptables_now](/handson/images/iptables_sec/01_iptables_now.png)

By default all chains have policy `ACCEPT` and contain no rules. The firewall blocks nothing - every packet passes freely.

---

## Phase 2. Reset and Base Policy

### Step 2. Resetting All Rules

```bash
sudo iptables -F   # flush all chains
sudo iptables -X   # delete user-defined chains
sudo iptables -Z   # zero packet and byte counters
```

![02_reset](/handson/images/iptables_sec/02_reset.png)

After the reset the chains are empty. The policy remains `ACCEPT` - the server still accepts everything, but with no rules at all.

### Step 3. Setting the DROP Policy

```bash
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT
```

![03_drop](/handson/images/iptables_sec/03_drop.png)

Any packet that does not match an explicit allow rule is now silently discarded. The server is completely closed. The following steps will open exactly what is needed.

> Setting DROP without allow rules first will break an active SSH session. In this lab we are working locally on a VM with direct access.

### Step 4. Verifying the Policies

```bash
sudo iptables -P OUTPUT ACCEPT
sudo iptables -L -v -n
```

![04_check](/handson/images/iptables_sec/04_check.png)

The output shows: `Chain INPUT (policy DROP 3 packets, 732 bytes)` - three packets have already been dropped since the policy was set. The firewall is working.

---

## Phase 3. Base Allow Rules

### Step 5. Allowing Loopback

```bash
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -L INPUT -v -n --line-numbers
```

![05_loopback](/handson/images/iptables_sec/05_loopback.png)

Without this rule all local services break - databases, web servers, inter-process communication. Everything communicating through `127.0.0.1` must work without restrictions.

### Step 6. Allowing ESTABLISHED Connections

```bash
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
```

![06_established](/handson/images/iptables_sec/06_established.png)

Without this rule the server would not receive replies to its own outbound requests - `apt update`, `curl`, DNS queries would all stop working. The rule allows incoming packets only for connections the server itself initiated.

### Step 7. Allowing SSH from the Local Subnet Only

```bash
# Find our subnet
ip route | grep src

# Allow SSH only from the local network
sudo iptables -A INPUT -s 10.10.70.0/24 -p tcp --dport 22 -j ACCEPT
```

![07_ssh](/handson/images/iptables_sec/07_ssh.png)

SSH is open only for the `10.10.70.0/24` subnet. Connection attempts from any other IP are silently dropped.

### Step 8. Allowing HTTP and HTTPS

```bash
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

sudo iptables -L INPUT -v -n --line-numbers
```

![08_http-s](/handson/images/iptables_sec/08_http-s.png)

Web traffic is open for everyone - these are public ports. Unlike SSH, IP restrictions are not needed here.

---

## Phase 4. Attack Protection

### Step 9. Rate Limiting - SYN Flood Protection

```bash
sudo iptables -A INPUT -p tcp --syn \
    -m limit --limit 25/minute --limit-burst 100 \
    -j ACCEPT
```

![09_rate_limiting](/handson/images/iptables_sec/09_rate_limiting.png)

SYN flood is a classic DoS attack: the attacker sends millions of TCP SYN packets exhausting the server's connection table. The rule allows no more than 25 new connections per minute, with a burst buffer of 100. Everything above the limit falls through to the default DROP.

### Step 10. Blocking Port Scanning

```bash
# NULL packets (all flags off) - Nmap -sN
sudo iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP

# XMAS packets (all flags on) - Nmap -sX
sudo iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
```

![10_sec_scan](/handson/images/iptables_sec/10_sec_scan.png)

Nmap uses non-standard TCP flag combinations to identify open ports while bypassing simple firewalls. NULL packets (no flags) and XMAS packets (all flags) never appear in normal traffic - we block both.

### Step 11. ICMP with Rate Limit

```bash
sudo iptables -A INPUT -p icmp \
    --icmp-type echo-request \
    -m limit --limit 1/second \
    -j ACCEPT
```

![11_icmp_limit](/handson/images/iptables_sec/11_icmp_limit.png)

Ping is useful for checking server availability - completely blocking ICMP is not recommended. A limit of 1 packet per second makes ICMP flood pointless.

---

## Phase 5. Logging and Saving

### Step 12. Reviewing the Complete Ruleset

```bash
sudo iptables -L INPUT -v -n --line-numbers
```

![12_check](/handson/images/iptables_sec/12_check.png)

Final INPUT ruleset:

| # | Action | Condition |
| --- | --- | --- |
| 1 | ACCEPT | Loopback (lo) |
| 2 | ACCEPT | ESTABLISHED, RELATED |
| 3 | ACCEPT | TCP 22, only 10.10.70.0/24 |
| 4 | ACCEPT | TCP 80 (HTTP) |
| 5 | ACCEPT | TCP 443 (HTTPS) |
| 6 | ACCEPT | TCP SYN, limit 25/min |
| 7 | DROP | TCP flags ALL NONE (NULL scan) |
| 8 | DROP | TCP flags ALL ALL (XMAS scan) |
| 9 | ACCEPT | ICMP echo-request, limit 1/s |

Default policy: **DROP**

### Step 13. Adding Logging for Dropped Packets

```bash
# LOG rule goes last - it does not block the packet, only logs it
sudo iptables -A INPUT -j LOG \
    --log-prefix 'IPTABLES-DROPPED: ' \
    --log-level 4
```

![13_drop_logs](/handson/images/iptables_sec/13_drop_logs.png)

The `LOG` target is non-terminal - after logging, the packet continues processing and hits the default DROP. All blocked packets are now written to `/var/log/kern.log` with the prefix `IPTABLES-DROPPED:`.

### Step 14. Installing iptables-persistent

```bash
sudo apt install iptables-persistent -y
# During installation it will ask to save current rules - answer Yes
```

![14_install](/handson/images/iptables_sec/14_install.png)

`iptables-persistent` automatically loads rules from files on system boot. The `ufw` package is removed - it conflicts with manual iptables management.

### Step 15. Saving Rules to File

```bash
sudo mkdir -p /etc/iptables
sudo iptables-save | sudo tee /etc/iptables/rules.v4
cat /etc/iptables/rules.v4
```

![15_save](/handson/images/iptables_sec/15_save.png)

The `rules.v4` file contains all rules in plain text - it can be edited manually and read as documentation:

```
*filter
:INPUT DROP [6:1342]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [56:8387]
-A INPUT -i lo -j ACCEPT
-A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
-A INPUT -s 10.10.70.0/24 -p tcp -m tcp --dport 22 -j ACCEPT
...
COMMIT
```

---

## Phase 6. Verification from an External Machine

### Step 16. Service Version Scan

From Parrot OS we run a targeted scan of the key ports:

```bash
sudo nmap -sV -p 22,80,443,8080 10.10.70.130
```

![16_nmap](/handson/images/iptables_sec/16_nmap.png)

Scan results:

| Port | State | Service | Version |
| --- | --- | --- | --- |
| 22/tcp | open | ssh | OpenSSH 10.0p2 Ubuntu |
| 80/tcp | closed | http | - |
| 443/tcp | closed | https | - |
| 8080/tcp | closed | http-proxy | - |

Port 22 is open - Parrot is in the `10.10.70.0/24` subnet. Ports 80 and 443 show `closed` rather than `filtered` - nginx is not yet running, the ports are allowed by the firewall but no service is listening.

### Step 17. UDP Scan

```bash
sudo nmap -sU --top-ports 20 10.10.70.130
```

![17_udp_ports](/handson/images/iptables_sec/17_udp_ports.png)

All 20 popular UDP ports show `open|filtered`. This is the characteristic behaviour of a DROP policy - Nmap receives neither a reply nor an ICMP error and cannot determine whether a port is open or closed.

### Step 18. FIN and NULL Scanning

```bash
sudo nmap -sF 10.10.70.130   # FIN scan
sudo nmap -sN 10.10.70.130   # NULL scan
```

![18_scan](/handson/images/iptables_sec/18_scan.png)

998 ports - `open|filtered`. Ports 80 and 443 - `closed` (no service running, but the firewall allows them). NULL packets are blocked by rule 7, FIN packets by the default DROP. The scanner receives no useful information about the server.

### Step 19. XMAS Scan

```bash
sudo nmap -sX 10.10.70.130
```

![19_scan_sx](/handson/images/iptables_sec/19_scan_sx.png)

XMAS packets (FIN+PSH+URG flags) are blocked by rule 8. The result is identical to the NULL scan - `open|filtered` everywhere.

### Step 20. Logs of Blocked Packets

```bash
sudo journalctl -k | grep IPTABLES-DROPPED | tail -30
```

![20_logs_dropped_scan](/handson/images/iptables_sec/20_logs_dropped_scan.png)

The logs show the full scan history:

```
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=1863 ... URG PSH FIN
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=990  ... URG PSH FIN
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=1503 ... URG PSH FIN
```

The flags `URG PSH FIN` are the signature of XMAS scanning. In a real system these logs are a signal for investigation.

---

## Phase 7. Web Server Check and Final Verification

### Step 21. Testing nginx via curl

```bash
curl -I http://localhost
```

![21_curl_i](/handson/images/iptables_sec/21_curl_i.png)

```
HTTP/1.1 200 OK
Server: nginx/1.28.0 (Ubuntu)
Content-Type: text/html
```

Nginx is working locally. The firewall passes loopback traffic and does not interfere with local services.

### Step 22. SSH from a Blocked Subnet

```bash
ssh ubuntu@10.10.70.130
```

![22_another_net](/handson/images/iptables_sec/22_another_net.png)

An SSH attempt from a machine outside `10.10.70.0/24` - the connection does not establish. The packet is dropped without a reply - the attacker does not know whether the host exists.

### Step 23. Verifying Rules After Reboot

```bash
sudo reboot
# After reboot:
sudo iptables -L -v -n --line-numbers
```

![23_after_reboot](/handson/images/iptables_sec/23_after_reboot.png)

All rules are in place. The packet counters show real firewall activity:

| # | pkts | Rule |
| --- | --- | --- |
| 1 | 48 | ACCEPT loopback |
| 2 | 1042 | ACCEPT ESTABLISHED |
| 3 | 13 | ACCEPT SSH |
| 6 | 182 | ACCEPT SYN limit |
| 7 | 1994 | DROP NULL scan |
| 10 | 6123 | LOG dropped |

Rule 7 processed 1994 packets - these are traces of scanning. The LOG rule recorded 6123 blocked packets.

---

## Summary and Conclusions

### Complete Firewall Map

| Rule | Protocol | Source | Port | Action | Protects against |
| --- | --- | --- | --- | --- | --- |
| Loopback | all | 127.0.0.1 | any | ACCEPT | - |
| ESTABLISHED | all | any | any | ACCEPT | - |
| SSH | TCP | 10.10.70.0/24 | 22 | ACCEPT | External SSH brute-force |
| HTTP | TCP | any | 80 | ACCEPT | - |
| HTTPS | TCP | any | 443 | ACCEPT | - |
| SYN limit | TCP SYN | any | any | ACCEPT | SYN flood DoS |
| NULL drop | TCP | any | any | DROP | Nmap -sN |
| XMAS drop | TCP | any | any | DROP | Nmap -sX |
| ICMP limit | ICMP | any | - | ACCEPT | ICMP flood |
| LOG | all | any | any | LOG | Audit trail |

### What nmap Showed from Outside

A firewall with DROP policy effectively hides information about the server. The attacker sees only what is explicitly allowed. NULL, FIN, and XMAS scans return `open|filtered` - no useful information about the network topology.


