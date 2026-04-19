---
title: "DNS - Complete Breakdown from Query to Answer"
description: "In this lab we break down DNS at every level: from basic A, MX, NS, and TXT queries to tracing the full recursion path, reverse DNS, zone transfers, and setting up a local resolver"
image: "/images/dns_net/main.jpg"
date: "2026-04-19"
---

## Introduction

DNS (Domain Name System) is a distributed system designed to translate domain names into IP addresses. When a website address is entered into a browser, a DNS query is processed through a chain of servers, starting from a recursive resolver and continuing to authoritative domain servers, which ultimately provides the required IP address for establishing a connection.

This work examines the main levels and mechanisms of DNS operation, including record types (A, MX, NS, TXT, etc.), the process of recursive name resolution, DNS query structure, reverse DNS lookup, zone transfers, as well as the principles of configuring a local DNS resolver. Practical command examples and analysis of network interactions are also included.

| Parameter | Value |
| --- | --- |
| Machine | Parrot OS |
| Tools | dig, nslookup, dnsmasq, Wireshark |
| Test domains | google.com, github.com, zonetransfer.me |

---

## Theoretical Background

### DNS Hierarchy

DNS is structured as an inverted tree. A query for `google.com` passes through three levels:

```
. (root zone)
    └── com. (TLD - top-level domain)
            └── google.com. (authoritative zone)
```

**Root servers** (13 of them: a–m.root-servers.net) know the addresses of all TLD servers. **TLD servers** (.com, .org, .net) know the NS records for each domain. **Authoritative servers** store the actual records for the domain.

### DNS Record Types

| Type | Stores | Example |
| --- | --- | --- |
| A | IPv4 address | `google.com → 142.250.x.x` |
| AAAA | IPv6 address | `google.com → 2a00:...` |
| MX | Mail server | `google.com → smtp.google.com` |
| NS | Zone name server | `google.com → ns1.google.com` |
| TXT | Text (SPF, DKIM, verification) | `v=spf1 include:...` |
| PTR | Reverse DNS | `8.8.8.8 → dns.google` |
| CNAME | Alias | `www → @` |
| SOA | Start of authority | Contact, timers, serial number |
| CAA | Authorised certificate authorities | `letsencrypt.org` |

---

## Phase 1. Installing Tools

### Step 1. Installing Packages

```bash
sudo apt install dnsutils dnsmasq wireshark -y
dig -v
```

![01_install](/handson/images/dns_net/01_install.png)

`dnsutils` is the package containing `dig` and `nslookup`. `dnsmasq` is a lightweight local DNS server. `wireshark` is for capturing DNS traffic.

---

## Phase 2. Basic Record Types

### Step 2. A Record - IPv4 Address

```bash
dig google.com A
```

![02_dig](/handson/images/dns_net/02_dig.png)

The `dig` output is split into sections:

```
;; QUESTION SECTION:
;google.com.    IN  A           ← what was asked

;; ANSWER SECTION:
google.com. 5  IN  A  142.251.142.238  ← answer, TTL=5 seconds

;; Query time: 19 msec           ← response time
;; SERVER: 10.10.70.2#53         ← which server responded
```

TTL of 5 seconds is very short. Google intentionally keeps a low TTL for fast switching between servers during load balancing.

### Step 3. MX Record - Mail Servers

```bash
dig google.com MX
```

![03_dig_mx](/handson/images/dns_net/03_dig_mx.png)

```
;; ANSWER SECTION:
google.com. 5 IN MX 10 smtp.google.com.

;; ADDITIONAL SECTION:
smtp.google.com.  A  64.233.164.27
smtp.google.com.  A  142.251.1.27
```

The number `10` is the priority - lower means higher priority. The ADDITIONAL section contains IP addresses for the mail servers - the DNS server added them proactively so the client would not need to make an extra query.

### Step 4. NS Record - Zone Name Servers

```bash
dig google.com NS
```

![04_dig_ns](/handson/images/dns_net/04_dig_ns.png)

```
;; ANSWER SECTION:
google.com. IN NS ns1.google.com.
google.com. IN NS ns2.google.com.
google.com. IN NS ns3.google.com.
google.com. IN NS ns4.google.com.
```

Four NS servers provide redundancy. If one is unavailable, the query goes to another.

### Step 5. TXT Record - Text Data

```bash
dig google.com TXT
```

![05_dig_txt](/handson/images/dns_net/05_dig_txt.png)

```
;; ANSWER SECTION:
google.com. TXT "v=spf1 include:_spf.google.com -all"
google.com. TXT "google-site-verification=..."
google.com. TXT "apple-domain-verification=..."
```

TXT records contain the SPF policy (rules for who may send mail on behalf of the domain) and domain ownership verification tokens for various services. DNS is used as a public metadata store.

---

## Phase 3. Recursion Tracing

### Step 6. First Level - Root Servers

```bash
dig +trace google.com
```

![06_dig_trace_1](/handson/images/dns_net/06_dig_trace_1.png)

The first step of the trace - a query to the root servers. The resolver asks `.` (the root zone) who knows about the `.com` zone. The response contains all 13 root servers (a–m.root-servers.net) with their RRSIG signatures (DNSSEC).

### Step 7. Second and Third Level - TLD and Authoritative Answer

![07_dig_trace_2](/handson/images/dns_net/07_dig_trace_2.png)

The second step - a query to the TLD servers for the `.com` zone. The response contains 13 `gtld-servers.net` servers that know the NS records for all domains in the `.com` zone:

```
com. 172800 IN NS a.gtld-servers.net.
com. 172800 IN NS b.gtld-servers.net.
...
com. 172800 IN NS m.gtld-servers.net.
;; Received 1170 bytes from 192.58.128.30#53(j.root-servers.net) in 3 ms
```

Failed IPv6 connection attempts are also visible (`network unreachable`) - IPv6 is not configured on this network. `dig +trace` tries both protocols and falls back to IPv4.

The third step - a query to the authoritative server `ns2.google.com`, which returns the final answer `172.217.19.238`.

> `dig +trace` bypasses the cache and performs the full recursion path manually - from root servers to the authoritative answer. This is exactly how a recursive resolver works for every new domain.

---

## Phase 4. Queries to Specific Servers

### Step 8. Query to Google DNS (8.8.8.8)

```bash
dig @8.8.8.8 google.com
```

![09_dns_google](/handson/images/dns_net/09_dns_google.png)

```
;; ANSWER SECTION:
google.com. IN A 216.58.201.206   ← different IP (load balancing)
;; Query time: 133 msec            ← slower - remote server
;; SERVER: 8.8.8.8#53
```

### Step 9. Query to Cloudflare DNS (1.1.1.1)

```bash
dig @1.1.1.1 google.com
```

![10_dns_cloudflare](/handson/images/dns_net/10_dns_cloudflare.png)

```
;; Query time: 33 msec   ← faster than 8.8.8.8 in this test
;; SERVER: 1.1.1.1#53
```

### Step 10. Caching - The Effect of a Second Query

```bash
dig google.com | grep 'Query time'   # first query
dig google.com | grep 'Query time'   # second query — from cache
```

![24_google_system](/handson/images/dns_net/24_google_system.png)

```
Query time: 30 msec   ← first query - goes to the server
Query time:  3 msec   ← second query - from the resolver cache
```

A 10x difference. The DNS server caches responses until the TTL expires - this is exactly why DNS record changes do not take effect instantly.

### Step 11. Comparing Public DNS Servers

```bash
for server in 8.8.8.8 1.1.1.1 9.9.9.9 208.67.222.222; do
    TIME=$(dig @$server google.com | grep 'Query time' | awk '{print $4}')
    echo "$server → ${TIME}ms"
done
```

![25_compare](/handson/images/dns_net/25_compare.png)

```
8.8.8.8          → 60 ms
1.1.1.1          → 23 ms   ← fastest here
9.9.9.9          → 26 ms
208.67.222.222   → 73 ms
```

Response time depends on physical proximity to the servers and their load. Cloudflare (1.1.1.1) was the fastest in this test.

---

## Phase 5. Reverse DNS

### Step 12. PTR Query via -x

```bash
dig -x 8.8.8.8
dig -x 1.1.1.1
```

![13_ptr](/handson/images/dns_net/13_ptr.png)

```
;; ANSWER SECTION:
8.8.8.8.in-addr.arpa. IN PTR dns.google.
```

### Step 13. How Reverse DNS Works

```bash
dig PTR 8.8.8.8.in-addr.arpa
```

![14_ptr_long](/handson/images/dns_net/14_ptr_long.png)

The `-x` flag is a shortcut. Internally DNS reverses the IP and appends `.in-addr.arpa`:
`8.8.8.8` → `8.8.8.8.in-addr.arpa` → PTR query → `dns.google`

Reverse zones are needed for server verification, mail systems, and security logs.

---

## Phase 6. Zone Transfers (AXFR)

### Step 14. AXFR on Protected Servers

```bash
# example.com - protected
dig axfr @a.iana-servers.net example.com

# google.com - also protected
dig axfr @ns1.google.com google.com
```

![15_axfr_example](/handson/images/dns_net/15_axfr_example.png)

![16_axfr_google](/handson/images/dns_net/16_axfr_google.png)

Both servers return `Transfer failed` - modern DNS servers deny AXFR to everyone except authorised secondary servers. This is correct configuration.

### Step 15. AXFR on a Vulnerable Test Server

```bash
dig axfr @nsztm1.digi.ninja zonetransfer.me
```

![17_axfr_zonetransfer](/handson/images/dns_net/17_axfr_zonetransfer.png)

`zonetransfer.me` is a domain specifically created to demonstrate the danger of open zone transfers. The entire zone is returned:

```
zonetransfer.me. 7200 IN SOA    nsztm1.digi.ninja. robin.digi.ninja. ...
zonetransfer.me. 7200 IN DNSKEY 256 3 7 AwEAAapoL+...
zonetransfer.me.  301 IN TXT    "google-site-verification=..."
zonetransfer.me. 7200 IN MX     0  ASPMX.L.GOOGLE.COM.
zonetransfer.me. 7200 IN MX     10 ALT1.ASPMX.L.GOOGLE.COM.
zonetransfer.me. 7200 IN A      5.196.105.14
zonetransfer.me. 7200 IN NS     nsztm1.digi.ninja.
zonetransfer.me.  300 IN HINFO  "Casio fx-700G" "Windows XP"
_acme-challenge.zonetransfer.me. 301 IN TXT "60a05hbUJ9..."
_sip._tcp.zonetransfer.me. 14000 IN SRV  0 0 5060 www.zonetransfer.me.
```

From a single AXFR request an attacker obtains: all A records (all company servers), MX (mail infrastructure), TXT (verification tokens), SRV (internal services), HINFO (server operating systems), and even `CERT` records with certificates.

> An open AXFR on production servers is a serious vulnerability. Check your DNS servers with `dig axfr @ns1.yourdomain.com yourdomain.com` - the response should be `Transfer failed`.

---

## Phase 7. DNS Analysis in Wireshark

### Step 16. Capturing DNS Packets

We launch Wireshark with the filter `dns` and run queries:

```bash
dig google.com A
dig google.com MX
dig @8.8.8.8 github.com
```

![20_dns_wireshark](/handson/images/dns_net/20_dns_wireshark.png)

In Wireshark Query/Response pairs are visible: query `google.com A` → response with `142.251.142.238`, query `google.com MX` → large 294-byte response with MX and additional records, query `github.com` to `8.8.8.8` → response with `140.82.121.3`.

### Step 17. DNS Query Packet Structure

We click on the Query packet and expand `Domain Name System`:

![22_query](/handson/images/dns_net/22_query.png)

```
Transaction ID: 0x88cb     ← unique ID linking query to response
Flags: 0x0120
  QR: Message is a query   ← 0 = query
  Opcode: Standard query
  RD: Do query recursively ← requesting recursion
Questions: 1
Question: google.com, type A, class IN
[Response In: 5]           ← Wireshark linked it to the response
```

### Step 18. DNS Response Packet Structure

We click on the Response packet:

![21_response_answers](/handson/images/dns_net/21_response_answers.png)

![23_response](/handson/images/dns_net/23_response.png)

```
Transaction ID: 0x88cb     ← same ID as in the query
Flags: 0x8180
  QR: Message is a response  ← 1 = response
  RA: Server can do recursion
  RCODE: No error
Answer RRs: 1
Answers:
  google.com. A 142.251.142.238
  Time to live: 5
[Time: 0.020112798 seconds]  ← 20 ms
```

The Transaction ID is the key field. DNS runs over UDP with no sessions - the ID is the only thing linking a query to its response. If an attacker guesses the ID and responds first, that is DNS spoofing.

---

## Phase 8. Local DNS Server - dnsmasq

### Step 19. Verifying dnsmasq Status

```bash
sudo systemctl status dnsmasq
```

![26_dnsmasq_active](/handson/images/dns_net/26_dnsmasq_active.png)

Status `active (running)`, PID 1432, memory 2.7 MB - dnsmasq is one of the lightest DNS servers available.

### Step 20. Adding Custom Records

```bash
sudo nano /etc/dnsmasq.conf
```

We add to the end of the file:

```
address=/mylab.local/127.0.0.1
address=/testserver.local/10.10.70.130
address=/devbox.local/192.168.1.100
```

![27_custom](/handson/images/dns_net/27_custom.png)

The syntax `address=/domain/ip` is the simplest way to add a static record to dnsmasq.

### Step 21. Restarting and Verifying Records

```bash
sudo systemctl restart dnsmasq
sudo systemctl status dnsmasq
```

![28_restart](/handson/images/dns_net/28_restart.png)

```bash
dig @127.0.0.1 mylab.local
dig @127.0.0.1 testserver.local
dig @127.0.0.1 devbox.local
```

![29_dig_mylab](/handson/images/dns_net/29_dig_mylab.png)

![30_dig_testserver](/handson/images/dns_net/30_dig_testserver.png)

![31_dig_devbox](/handson/images/dns_net/31_dig_devbox.png)

```
mylab.local.      0 IN A 127.0.0.1
testserver.local. 0 IN A 10.10.70.130
devbox.local.     0 IN A 192.168.1.100
```

TTL=0 - dnsmasq does not cache static records. All three domains resolve locally without contacting any external server.

### Step 22. Switching the System Resolver to dnsmasq

```bash
# View current resolver
cat /etc/resolv.conf
```

![32_resolve](/handson/images/dns_net/32_resolve.png)

```bash
# Add localhost first
sudo nano /etc/resolv.conf
# nameserver 127.0.0.1
```

![33_nameserver](/handson/images/dns_net/33_nameserver.png)

```bash
# Test without explicit @127.0.0.1
dig mylab.local
nslookup testserver.local
```

![34_dig_nslookup](/handson/images/dns_net/34_dig_nslookup.png)

Now all system DNS queries pass through dnsmasq. Local `.local` domains resolve instantly, and external queries are proxied to the upstream server from the original `resolv.conf`.

---

## Phase 9. Useful dig Flags

### Step 23. Compact Output

```bash
# IP address only
dig google.com +short

# Answer section only
dig google.com +noall +answer

# All record types in one script
for type in A AAAA MX NS TXT; do
    echo "=== $type ==="
    dig google.com $type +short
done
```

![35_short_flags](/handson/images/dns_net/35_short_flags.png)

The `+short` flag is essential in scripts - it returns only the value with no service information. `+noall +answer` shows just the answer section in a readable format.

---

## Summary and Conclusions

### The Full DNS Query Path

```
Client
  → Local cache (miss?)
  → System resolver /etc/resolv.conf
  → Recursive resolver (ISP or 8.8.8.8)
      → Root servers (.)         - who knows .com?
      → TLD servers (.com)       - who knows google.com?
      → Authoritative server     - what is the IP of google.com?
  → Answer cached for TTL seconds
  → IP returned to client
```

### Key Security Points for DNS

| Vulnerability | Description | Defence |
| --- | --- | --- |
| Open AXFR | Entire zone returned on request | Restrict AXFR by IP |
| DNS spoofing | Response substitution by guessing Transaction ID | DNSSEC |
| DNS amplification | UDP allows traffic amplification for DDoS | Restrict recursion |
| Unencrypted DNS | Queries visible to ISP | DoH / DoT |
| Cache poisoning | Poisoning cache with forged records | DNSSEC, randomised ports |

### dig Quick Reference

| Command | What it does |
| --- | --- |
| `dig domain A` | IPv4 address |
| `dig domain MX` | Mail servers |
| `dig domain NS` | Name servers |
| `dig domain TXT` | Text records |
| `dig -x IP` | Reverse DNS |
| `dig +trace domain` | Full recursion path |
| `dig @8.8.8.8 domain` | Query a specific server |
| `dig domain +short` | Value only |
| `dig axfr @ns domain` | Zone transfer |
| `dig domain \| grep 'Query time'` | Response time |

In this lab DNS was broken down at every level: from packet structure in Wireshark to full recursion tracing through root servers. A local dnsmasq resolver was configured with custom records. The danger of open zone transfers was demonstrated - a single AXFR request can reveal the complete infrastructure map of a domain.
