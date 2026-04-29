---
title: "DNS - recursive vs iterative resolving"
date: "2026-04-29"
---

When you type google.com in a browser, a chain of DNS queries happens. There are two fundamentally different ways those queries are handled - recursive and iterative. Understanding the difference helps you diagnose problems, configure resolvers, and know where things can break.

---

## Iterative resolving

With iterative resolving, the client walks the entire DNS hierarchy itself. Each server replies "I don't know, but ask that one" and the client makes the next query on its own.

```
Client walks the hierarchy itself:

Client          Root server      .com server      google.com NS
  │                  │                │                  │
  │  google.com?     │                │                  │
  │─────────────────►│                │                  │
  │                  │                │                  │
  │  Don't know.     │                │                  │
  │  Ask .com NS:    │                │                  │
  │  192.5.6.30      │                │                  │
  │◄─────────────────│                │                  │
  │                  │                │                  │
  │  google.com?                      │                  │
  │──────────────────────────────────►│                  │
  │                  │                │                  │
  │                  │  Don't know.   │                  │
  │                  │  Ask NS:       │                  │
  │                  │  216.239.32.10 │                  │
  │◄──────────────────────────────────│                  │
  │                  │                │                  │
  │  google.com?                                         │
  │─────────────────────────────────────────────────────►│
  │                  │                │                  │
  │  142.250.74.46   │                │                  │
  │◄─────────────────────────────────────────────────────│
```

```
Iterative resolving characteristics:
  - Client makes multiple queries itself
  - Each server returns either a referral or the final answer
  - Higher load on the client
  - Lower load on DNS servers (each only answers for its own zone)
  - This is how dig +trace works and how most authoritative servers behave

A "referral" response looks like:
  ;; flags: qr ra          <- ra = recursion available
  ;; AUTHORITY SECTION:
  com.  172800  IN  NS  a.gtld-servers.net.
  ;; ADDITIONAL SECTION:
  a.gtld-servers.net.  172800  IN  A  192.5.6.30
  (server says: "go ask these guys")
```

---

## Recursive resolving

With recursive resolving, the client makes a single query and the resolver takes on all the work - it walks the hierarchy itself and returns the final answer to the client.

```
Client makes one query, the resolver does everything:

Client        Recursive resolver       Root       .com NS    google NS
  │                   │                  │            │           │
  │  google.com?      │                  │            │           │
  │──────────────────►│                  │            │           │
  │                   │  google.com?     │            │           │
  │                   │─────────────────►│            │           │
  │                   │  referral→.com   │            │           │
  │                   │◄─────────────────│            │           │
  │                   │  google.com?                  │           │
  │                   │──────────────────────────────►│           │
  │                   │  referral→google NS           │           │
  │                   │◄──────────────────────────────│           │
  │                   │  google.com?                              │
  │                   │──────────────────────────────────────────►│
  │                   │  142.250.74.46                            │
  │                   │◄──────────────────────────────────────────│
  │  142.250.74.46    │                  │            │           │
  │◄──────────────────│                  │            │           │
  │  (one query!)     │                  │            │           │
```

```
Recursive resolving characteristics:
  - Client makes one query and gets a ready answer
  - Resolver takes all the work on itself
  - Caches intermediate and final answers
  - Higher load on the resolver
  - Minimal load on the client
  - This is how your PC works (via /etc/resolv.conf)

RD flag (Recursion Desired):
  Client sets RD=1 in the query → "I want a recursive answer"
  If the resolver supports recursion → returns the full answer
  If it doesn't → returns a referral (iterative response)

RA flag (Recursion Available):
  Server sets RA=1 in the response → "I support recursion"
  Root servers: RA=0 (do not do recursion)
  8.8.8.8, 1.1.1.1: RA=1 (recursive resolvers)
```

---

## Comparison: recursive vs iterative

```
                    Iterative                Recursive
                    ---------                ---------
Who does the work   Client                   Resolver
Queries by client   Many (3-5+)              One
Caching             No (on client side)      Yes (on resolver)
Client load         High                     Minimal
Resolver load       Low                      High
Where used          Resolvers <-> DNS servers Client <-> Resolver
Root servers        Iterative only           Don't support recursion
Authoritative NS    Iterative only           Usually don't support recursion
Public resolvers    Both                     Recursive for clients
```

```
Key point:
  Client (browser, OS) → Recursive resolver (8.8.8.8)
       └── recursive query (RD=1)

  Recursive resolver → Root / TLD / Authoritative
       └── iterative queries (walks the hierarchy itself)

In practice BOTH approaches are used:
  - Between client and resolver: recursive
  - Between resolver and DNS hierarchy: iterative
```

---

## DNS query flags

```
Every DNS packet has a header with flags.
They define the type of query and response.

Query:
  QR  = 0  (this is a query, not a response)
  RD  = 1  (I want a recursive answer)
  RD  = 0  (iterative - give me a referral if you don't know)

Response:
  QR  = 1  (this is a response)
  AA  = 1  (Authoritative Answer - server owns the zone)
  AA  = 0  (not authoritative - from cache or referral)
  RA  = 1  (Recursion Available - server supports recursion)
  TC  = 1  (Truncated - answer cut off, retry over TCP)
  AD  = 1  (Authenticated Data - DNSSEC validated)
  CD  = 1  (Checking Disabled - don't validate DNSSEC)
```

```
# Read flags from dig output
dig A google.com

# ;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
# ;; flags: qr rd ra; QUERY: 1, ANSWER: 1

# qr = Query Response (this is a response)
# rd = Recursion Desired (client requested recursion)
# ra = Recursion Available (server supports recursion)
# aa = Authoritative Answer (if present - answer from zone owner)

# Query without recursion (iterative)
dig A google.com @8.8.8.8 +norecurse
# ;; flags: qr ra; (no rd - we didn't request recursion)
# If 8.8.8.8 doesn't know - it returns a referral

# Query an authoritative server directly
dig A google.com @ns1.google.com
# ;; flags: qr aa; (aa = authoritative answer, no ra - recursion not supported)
```

---

## Caching in the recursive resolver

The recursive resolver caches answers - this is the main reason why recursion is beneficial for clients.

```
First query for google.com (empty cache):
  Resolver → Root → .com NS → google.com NS → 142.250.74.46
  Time: ~50-200ms (several RTTs)

  Resolver stores in cache:
    google.com. A 142.250.74.46  TTL=300
    google.com. NS ns1.google.com  TTL=86400
    com. NS a.gtld-servers.net  TTL=172800

Second query for google.com (cache hit):
  Resolver → answers from cache → 142.250.74.46
  Time: <1ms

Third query for mail.google.com (partial cache):
  Resolver already knows NS for google.com (from cache)
  Resolver → ns1.google.com → 172.217.x.x
  Time: ~10-30ms (one hop, not from scratch)
```

```
# Check the TTL in the answer (how much time is left in cache)
dig A google.com @8.8.8.8
# google.com. 287 IN A 142.250.74.46
#              ^^^ TTL counts down every second

# Wait and query again - TTL decreased
sleep 10
dig A google.com @8.8.8.8
# google.com. 277 IN A 142.250.74.46  <- was 287, now 277

# When TTL = 0 → resolver makes a fresh query to the authoritative server

# View cache statistics (systemd-resolved)
resolvectl statistics
# Current Cache Size: 42
# Cache Hits: 1234
# Cache Misses: 56

# Flush the cache
resolvectl flush-caches
```

### Negative cache

```
Negative Caching (RFC 2308):
  NXDOMAIN (domain doesn't exist) is also cached.
  NODATA (record type doesn't exist) is also cached.

For how long? By the TTL in the SOA minimum field:
  example.com.  IN  SOA  ns1... (
    ...
    300  ; minimum - NXDOMAIN cached for 300 seconds
  )

Example:
  dig A nonexistent.example.com @8.8.8.8
  → NXDOMAIN (cached for 300 sec)

  You add an A record for nonexistent.example.com.
  The record is already on the authoritative server, but for another
  300 seconds the resolver keeps returning NXDOMAIN from cache!

Fix during migrations: lower the minimum TTL in advance.
Check minimum TTL:
  dig SOA example.com +short
  # ns1.. admin.. 2024042601 3600 900 604800 300
  #                                                ^^^
  #                                           minimum = 300 sec
```

---

## How dig +trace works under the hood

`dig +trace` is the most useful tool for understanding iterative resolving. It manually simulates what a recursive resolver does.

```
dig A google.com +trace

; <<>> DiG 9.18 <<>> A google.com +trace
;; global options: +cmd

.                  518400  IN  NS  a.root-servers.net.    <- Root servers
.                  518400  IN  NS  b.root-servers.net.       (from hints file)
...
;; Received 811 bytes from 198.41.0.4#53(a.root-servers.net) in 12 ms

com.               172800  IN  NS  a.gtld-servers.net.    <- TLD servers for .com
com.               172800  IN  NS  b.gtld-servers.net.       (root server answered)
...
;; Received 1169 bytes from 192.5.6.30#53(a.gtld-servers.net) in 8 ms

google.com.        172800  IN  NS  ns1.google.com.        <- NS for google.com
google.com.        172800  IN  NS  ns2.google.com.           (.com server answered)
...
;; Received 292 bytes from 216.239.32.10#53(ns1.google.com) in 3 ms

google.com.        300     IN  A   142.250.74.46           <- Final answer
;; Received 55 bytes from 216.239.32.10#53(ns1.google.com) in 3 ms
```

```
# Trace different record types
dig MX gmail.com +trace
dig AAAA google.com +trace
dig NS example.com +trace

# Verbose trace with glue records
dig A google.com +trace +additional

# Ask the authoritative server directly (skip trace)
dig A google.com @ns1.google.com

# Trace with per-step RTT stats
dig A google.com +trace +stats
```

---

## Open Resolver - a security problem

```
An Open Resolver is a recursive resolver that answers queries from
ANY IP address on the internet.

Problems:
  1. DNS Amplification DDoS:
     Attacker (spoofed src=victim) → Open Resolver
     Small query → large response → victim gets flooded

  2. Cache Poisoning:
     Attacker tries to inject a forged answer into the resolver's cache.
     If successful - all users of that resolver get forged data.
     Defences: DNSSEC, source port randomization (RFC 5452)

  3. Resource abuse:
     Your resolver processes queries from the entire internet

How to check you're not an open resolver:
  # From an external machine or using an external IP:
  dig A google.com @your.server.ip
  # If it returned an answer - you're an open resolver (bad!)
  # If it returned REFUSED - correctly configured

  # Online check:
  # openresolver.com
  # dnsinspect.com
```

```
# Close an open resolver in BIND (named.conf):
options {
    recursion yes;
    allow-recursion { 192.168.0.0/16; 10.0.0.0/8; 127.0.0.1; };
    # only allow your own network
};

# In Unbound (unbound.conf):
server:
    access-control: 0.0.0.0/0 refuse         # deny everyone
    access-control: 192.168.0.0/16 allow      # own network
    access-control: 127.0.0.0/8 allow

# Validate config
named-checkconf /etc/named.conf
unbound-checkconf /etc/unbound/unbound.conf
```

---

## DNS Cache Poisoning

```
The Kaminsky attack (2008) - the most famous DNS cache poisoning attack:

Normal flow:
  Resolver → query to NS (with random transaction ID)
  NS → response with same transaction ID → resolver accepts it

The attack:
  1. Attacker asks the resolver to resolve random.example.com
  2. Resolver sends a query to NS of example.com
  3. Attacker floods the resolver with forged responses with different transaction IDs
  4. If the ID is guessed (16 bits = 65536 options) → cache is poisoned
  5. Now example.com → attacker's IP for all users of that resolver

Defences:
  - Source Port Randomization (RFC 5452): not only the ID is random,
    but also the UDP source port (adds another 16 bits of entropy)
  - DNSSEC: cryptographic signature - attacker can't forge it
  - 0x20 encoding: randomize letter case in the query
    (gOoGlE.CoM - authoritative server must preserve the case)
```

```
# Check source port randomization
tcpdump -i eth0 -n 'udp and dst port 53' -c 10
# Look at src port: should be different numbers > 1024

# Check DNSSEC validation on your resolver
dig A google.com +dnssec | grep flags
# flags: qr rd ra ad   <- "ad" = DNSSEC is being validated

# Check resolver software version and patches
named -v
unbound -V
```

---

## Forwarder - the intermediate resolver

```
A forwarder (forwarding resolver) is a resolver that doesn't walk
the hierarchy itself, but passes queries to another resolver.

Why you'd want one:
  - Corporate network: internal domains → local DNS
                       external domains → 8.8.8.8
  - Split-horizon: company.local only resolves inside
  - Filtering: forwarder blocks unwanted domains
  - Office-level caching

Flow:
  PC → Corporate DNS (forwarder)
              │
              ├── company.local? → Authoritative server for company.local
              │
              └── google.com?    → 8.8.8.8 (upstream resolver)
```

```
# Configure a forwarder in BIND:
options {
    forwarders { 8.8.8.8; 8.8.4.4; };
    forward only;    # only forward, don't walk the hierarchy
    # forward first; # try forwarder first, fall back to iterative
};

# Conditional forwarder (only for specific zones):
zone "company.local" {
    type forward;
    forwarders { 10.0.0.1; };  # internal DNS server
};

# In Unbound (unbound.conf):
forward-zone:
    name: "."
    forward-addr: 8.8.8.8
    forward-addr: 8.8.4.4

# Conditional forward in Unbound:
forward-zone:
    name: "company.local."
    forward-addr: 10.0.0.1
```

```
# Check where queries are being forwarded
dig A google.com @corporate.dns +norecurse
# Returns referral - not forwarding (iterative)
# Returns ready answer - forwarding (recursive)

# systemd-resolved: view DNS servers and domains
resolvectl status
# Per-Link DNS Server Routing:
# eth0: 8.8.8.8 (for .)
# vpn0: 10.0.0.1 (for company.local)

# Add conditional forwarder via systemd-resolved
resolvectl dns vpn0 10.0.0.1
resolvectl domain vpn0 company.local
```

---

## Negative TTL and NXDOMAIN caching

```
Common practical problem: you added a DNS record but it "isn't visible".

Scenario:
  1. Someone queried nonexistent.example.com → NXDOMAIN
  2. Resolver cached NXDOMAIN for minimum TTL (say 3600 sec)
  3. You added an A record for nonexistent.example.com
  4. The record is already on the authoritative server, but for another
     hour the resolver keeps returning NXDOMAIN from cache

How to diagnose:
  # Ask the authoritative server directly
  dig A nonexistent.example.com @ns1.example.com
  # If A record is there - the problem is in cache

  # Ask a public resolver
  dig A nonexistent.example.com @1.1.1.1
  # Compare with the answer from @8.8.8.8

Solutions:
  # Wait (TTL will expire)
  # Flush cache on your resolver
  resolvectl flush-caches

  # Check minimum TTL in SOA (lower it in advance for future changes)
  dig SOA example.com +short
  # Last number = minimum TTL for negative caching
```

---

## Diagnostics: where did it break?

```
Problem: domain doesn't resolve.
Need to find which step in the hierarchy is failing.

Step 1 - check the local resolver
  dig A domain.com
  cat /etc/resolv.conf          # which resolver is configured?
  resolvectl status             # systemd-resolved status

Step 2 - bypass the local resolver
  dig A domain.com @8.8.8.8     # Google
  dig A domain.com @1.1.1.1     # Cloudflare
  # If it works here - the problem is the local resolver

Step 3 - manual iterative walk
  dig A domain.com +trace
  # Watch where the chain breaks:
  # Root → .com → OK
  # .com → domain.com NS → OK
  # domain.com NS → timeout → problem is in the authoritative NS

Step 4 - query each level manually
  # Do root servers know .com?
  dig NS com. @a.root-servers.net

  # Does .com know the NS for the domain?
  dig NS domain.com @a.gtld-servers.net

  # Does the authoritative NS respond?
  dig A domain.com @ns1.domain.com

  # Does the NS have an A record (glue)?
  dig A ns1.domain.com

Step 5 - check NS change propagation
  # If NS records were recently changed
  dig NS domain.com @a.root-servers.net    # what does root know?
  dig NS domain.com @a.gtld-servers.net   # what does TLD know?
  dig NS domain.com @8.8.8.8             # what does the resolver know?
  # All should show the same NS records
```

```
# Useful diagnostic commands

# Verify answer is authoritative
dig A google.com @ns1.google.com | grep flags
# flags: qr aa    <- aa = authoritative answer

# Check if a server supports recursion
dig A google.com @8.8.8.8 | grep flags
# flags: qr rd ra  <- ra = recursion available

# Compare answers from different resolvers
for ns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo "$ns: $(dig A google.com @$ns +short)"
done

# Measure resolution time at each step
dig A google.com +trace +stats 2>&1 | grep "msec"

# Find the authoritative server for a domain
dig NS google.com +short
# ns1.google.com.  ns2.google.com.  ns3.google.com.  ns4.google.com.

# Check all NS servers in the zone
for ns in $(dig NS google.com +short); do
  echo "$ns: $(dig A google.com @$ns +short) [$(dig SOA google.com @$ns +short | awk '{print $3}')]"
done
# Shows the A answer and serial number for each NS
```

---

## Local resolvers - systemd-resolved, unbound, dnsmasq

### systemd-resolved

```
Default resolver on Ubuntu/Debian/Fedora.
Listens on 127.0.0.53:53 (stub resolver).

Config: /etc/systemd/resolved.conf
[Resolve]
DNS=8.8.8.8 8.8.4.4          # primary resolvers
FallbackDNS=1.1.1.1 9.9.9.9  # fallback
Domains=~.                    # for all domains
DNSSEC=yes                    # enable DNSSEC
DNSOverTLS=yes                # DoT
Cache=yes                     # cache enabled
```

```
# Status and diagnostics
resolvectl status
resolvectl statistics
resolvectl query google.com        # resolve via resolved
resolvectl flush-caches            # flush cache
resolvectl monitor                 # watch queries in real time

# Check which DNS is used for which domain
resolvectl status | grep "DNS Server"

# Logs
journalctl -u systemd-resolved -f
journalctl -u systemd-resolved --since "10 minutes ago"
```

### unbound

```
Full-featured recursive resolver with DNSSEC, cache, rate limiting.
Great for servers and routers.

Config: /etc/unbound/unbound.conf
server:
    interface: 127.0.0.1
    interface: ::1
    port: 53

    # Who can make queries
    access-control: 127.0.0.0/8 allow
    access-control: 192.168.0.0/16 allow
    access-control: 0.0.0.0/0 refuse

    # DNSSEC
    auto-trust-anchor-file: "/var/lib/unbound/root.key"

    # Cache
    cache-max-ttl: 86400
    cache-min-ttl: 60
    neg-cache-size: 4m

    # Rate limiting (DDoS protection)
    ratelimit: 1000

    # Prefetch (refresh cache before TTL expires)
    prefetch: yes
    prefetch-key: yes
```

```
# Manage unbound
systemctl start unbound
systemctl enable unbound
unbound-checkconf                  # validate config

# Statistics
unbound-control stats
unbound-control stats_noreset      # without resetting counters

# Cache
unbound-control dump_cache         # view entire cache
unbound-control flush google.com   # remove from cache
unbound-control flush_zone google.com  # remove entire zone

# DNSSEC
unbound-anchor -a /var/lib/unbound/root.key  # update root key

# Logs
unbound-control verbosity 2        # enable verbose logging
journalctl -u unbound -f
```

### dnsmasq

```
Lightweight resolver + DHCP server. Popular on routers (OpenWrt).

Config: /etc/dnsmasq.conf
# Listen on local interfaces only
interface=lo
interface=eth0

# Forward to upstream resolver
server=8.8.8.8
server=8.8.4.4

# Cache
cache-size=1000

# Local domain
local=/local/
domain=local

# Static DNS entries
address=/myhost.local/192.168.1.100
```

```
# Manage dnsmasq
systemctl restart dnsmasq
dnsmasq --test                     # validate config

# Check what it's listening on
ss -ulnp | grep dnsmasq

# Logs
journalctl -u dnsmasq -f
# Enable verbose logging:
# add log-queries to dnsmasq.conf
```

---

## Cheat sheet

```
Two resolving modes:
  Iterative:   client walks root → TLD → NS → answer itself
  Recursive:   client → resolver (it walks everything) → answer

In practice:
  Client <-> Resolver:         recursive (RD=1)
  Resolver <-> DNS hierarchy:  iterative (referrals)

DNS packet flags:
  RD = Recursion Desired    (client wants recursion)
  RA = Recursion Available  (server supports recursion)
  AA = Authoritative Answer (answer from zone owner)
  AD = Authenticated Data   (DNSSEC validated)
  TC = Truncated            (answer cut off, retry over TCP)

dig diagnostic flags:
  +trace       - manual iterative walk (shows full path)
  +norecurse   - don't request recursion (iterative query)
  +short       - answer data only
  +dnssec      - show DNSSEC records
  @server      - ask a specific server

Diagnostics:
  dig A domain +trace                - full path from root
  dig A domain @8.8.8.8             - check via Google
  dig A domain @ns1.domain          - ask authoritative server directly
  dig SOA domain +short             - serial number and negative TTL
  resolvectl flush-caches           - flush local resolver cache
  resolvectl statistics             - cache stats
  resolvectl monitor                - watch queries in real time

Security:
  Open Resolver - dangerous (DDoS amplification)
  Close it: allow-recursion { your_network; }
  Cache Poisoning: protect via DNSSEC + source port randomization
```

---

## References

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names: Concepts (recursive and iterative modes)
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names: Implementation
- [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308) - Negative Caching of DNS Queries
- [RFC 5452](https://www.rfc-editor.org/rfc/rfc5452) - Measures for Making DNS More Resilient (source port randomization)
- [RFC 7766](https://www.rfc-editor.org/rfc/rfc7766) - DNS Transport over TCP
- [nlnetlabs.nl/unbound](https://nlnetlabs.nl/projects/unbound/) - Unbound documentation
- [DNS Flag Day](https://dnsflagday.net) - history of DNS changes
