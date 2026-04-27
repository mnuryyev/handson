---
title: "DNS - records, how it works, diagnostics"
date: "2026-04-27"
---

DNS (Domain Name System) is a distributed hierarchical database that translates domain names into IP addresses and stores other information about domains. Without DNS the internet would only work by IP addresses. Defined in RFC 1034 and RFC 1035 (1987).

---

## How DNS works - the big picture

```
Browser wants to resolve google.com:

Client               Recursive             Root          .com          google.com
(your PC)            Resolver              Server        Server        Nameserver
   │                     │                    │              │               │
   │  google.com?        │                    │              │               │
   │────────────────────►│                    │              │               │
   │                     │  google.com?       │              │               │
   │                     │───────────────────►│              │               │
   │                     │  ask .com NS       │              │               │
   │                     │◄───────────────────│              │               │
   │                     │  google.com?                      │               │
   │                     │──────────────────────────────────►│               │
   │                     │  ask google.com NS                │               │
   │                     │◄──────────────────────────────────│               │
   │                     │  google.com?                                      │
   │                     │──────────────────────────────────────────────────►│
   │                     │  142.250.74.46                                    │
   │                     │◄──────────────────────────────────────────────────│
   │  142.250.74.46      │                    │              │               │
   │◄────────────────────│                    │              │               │
   │  (cached by TTL)    │                    │              │               │
```

```
DNS hierarchy:
  . (root)
  ├── com
  │   ├── google.com
  │   ├── example.com
  │   └── ...
  ├── uk
  │   ├── bbc.co.uk
  │   └── ...
  ├── org
  └── ...

Root servers: 13 clusters (a.root-servers.net ... m.root-servers.net)
Only know the addresses of TLD servers (.com, .org, .uk...)

TLD servers (.com, .org...): only know the NS records of domains

Authoritative servers: store the actual DNS records for a domain
```

### DNS server types

```
Recursive Resolver:
  - Does all the work for the client: walks root → TLD → authoritative
  - Caches answers (according to TTL)
  - Examples: 8.8.8.8 (Google), 1.1.1.1 (Cloudflare), your router
  - Configured on Linux via /etc/resolv.conf

Authoritative Server:
  - Stores the DNS zone (actual A, MX, CNAME records)
  - Gives the final answer for its own domain
  - Examples: ns1.cloudflare.com, ns1.google.com

Forwarding Resolver:
  - Accepts queries and forwards them to another resolver
  - Does not walk the hierarchy itself
  - Used in corporate networks (split-horizon DNS)

Root Server:
  - 13 addresses (a-m.root-servers.net), actually hundreds of servers via anycast
  - Knows the NS for every TLD
  - The list is hardcoded in every resolver ("hints file")
```

---

## DNS records - all types

### A - IPv4 address

```
Format:
  name  TTL  class  type  data
  host  300  IN     A     192.0.2.1

Examples:
  google.com.     300  IN  A  142.250.74.46
  www.example.com 3600 IN  A  93.184.216.34
  @               3600 IN  A  1.2.3.4          (@  = zone apex / root of domain)
  *               3600 IN  A  1.2.3.4          (*  = wildcard)

A domain can have multiple A records:
  google.com.  300  IN  A  142.250.74.46
  google.com.  300  IN  A  142.250.74.78
  google.com.  300  IN  A  142.250.74.110
  → DNS round-robin (load balancing)

TTL (Time To Live):
  How many seconds resolvers cache the answer.
  Low TTL (60-300) - changes propagate quickly, but load is higher.
  High TTL (3600-86400) - fewer queries, changes propagate slowly.
  Before migration: lower TTL in advance (24-48 hours ahead).
```

```
# Query an A record
dig A google.com
dig google.com                    # A by default
dig A google.com +short           # IP only
dig A google.com @8.8.8.8         # ask a specific resolver
dig A google.com @8.8.8.8 +norecurse  # only at this server (non-recursive)

# nslookup
nslookup google.com
nslookup google.com 8.8.8.8

# host
host google.com
host -t A google.com
```

### AAAA - IPv6 address

```
Like A but for IPv6. The name "AAAA" comes from IPv6 being
4 times longer than IPv4 (128 vs 32 bits).

Examples:
  google.com.  300  IN  AAAA  2a00:1450:4001:82b::200e
  example.com. 3600 IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

Domain with dual-stack (both A and AAAA):
  google.com.  300  IN  A     142.250.74.46
  google.com.  300  IN  AAAA  2a00:1450:4001:82b::200e

  Client receives both addresses.
  Happy Eyeballs (RFC 8305): tries IPv6 first, falls back to
  IPv4 after 250ms if the connection doesn't succeed.
```

```
# Query an AAAA record
dig AAAA google.com
dig AAAA google.com +short
dig AAAA ipv6.google.com          # IPv6-only

# Check dual-stack
dig google.com A
dig google.com AAAA
# or both at once:
dig google.com ANY                # caution: many servers ignore ANY
```

### MX - mail server

```
Specifies which server accepts email for the domain.

Format:
  name  TTL  IN  MX  priority  mail-server

Examples:
  gmail.com.  3600  IN  MX  5   gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  10  alt1.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  20  alt2.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  30  alt3.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  40  alt4.gmail-smtp-in.l.google.com.

Priority:
  Lower number = higher priority.
  SMTP client tries the lowest-numbered MX first.
  If unavailable - moves to the next one.
  Equal numbers = equal priority (round-robin).

Important:
  MX points to a hostname, NOT an IP address.
  That hostname must have an A/AAAA record.
  MX cannot point to a CNAME - this is forbidden (RFC 2181).
```

```
# Query MX records
dig MX gmail.com
dig MX gmail.com +short
# 5 gmail-smtp-in.l.google.com.
# 10 alt1.gmail-smtp-in.l.google.com.

# Verify the MX hostname has an A record
dig A gmail-smtp-in.l.google.com

# Simulate an SMTP connection (test the mail server)
telnet gmail-smtp-in.l.google.com 25
# or via openssl for STARTTLS:
openssl s_client -connect gmail-smtp-in.l.google.com:25 -starttls smtp
```

### CNAME - canonical name (alias)

```
Creates an alias - one name points to another.
The resolver resolves the CNAME first, then resolves the target.

Format:
  alias  TTL  IN  CNAME  canonical-name

Examples:
  www.example.com.    3600  IN  CNAME  example.com.
  mail.example.com.   3600  IN  CNAME  ghs.googlehosted.com.
  cdn.example.com.    3600  IN  CNAME  example.cdn.cloudflare.net.

CNAME chains:
  foo.example.com → bar.example.com → baz.example.com → 1.2.3.4
  Each level requires a separate query. Long chains = slower.
  Recommended: no more than 3-4 levels.

CNAME restrictions - NOT allowed:
  - At the zone apex (@): you cannot CNAME example.com itself
    (because @ must have SOA and NS records)
    Workaround: ALIAS/ANAME record (non-standard, available at many DNS providers)
  - MX cannot point to a CNAME (RFC 2181)
  - NS cannot point to a CNAME
  - CNAME cannot coexist with other record types at the same name
    (except DNSSEC records)
```

```
# Query a CNAME
dig CNAME www.google.com
# www.google.com. 300 IN CNAME www3.l.google.com.

# Follow the full chain
dig www.google.com +trace

# Get the final A address (resolver unfolds the chain automatically)
dig A www.google.com
# Shows both the CNAME chain and the final A record
```

### NS - nameserver records

```
Specify which servers are authoritative for the domain.

Format:
  name  TTL  IN  NS  nameserver

Examples:
  google.com.  86400  IN  NS  ns1.google.com.
  google.com.  86400  IN  NS  ns2.google.com.
  google.com.  86400  IN  NS  ns3.google.com.
  google.com.  86400  IN  NS  ns4.google.com.

Typically 2-4 NS servers (for redundancy).

Delegation:
  When the TLD (.com) says "google.com is managed by these NS servers" -
  that is delegation. NS records at the TLD level are called "glue records"
  when the NS server lives inside the delegated domain itself:

  Problem: ns1.google.com NS → need IP of ns1.google.com,
  but ns1.google.com is inside google.com → chicken and egg.
  Solution: glue record - the IP of ns1.google.com is stored
  directly in the .com zone, no extra query needed.
```

```
# Query NS records
dig NS google.com
dig NS google.com +short
# ns1.google.com.
# ns2.google.com.
# ns3.google.com.
# ns4.google.com.

# Ask the authoritative server directly
dig NS google.com @ns1.google.com

# Verify delegation (check that the TLD knows the correct NS)
dig NS google.com @a.gtld-servers.net   # TLD server for .com
```

### PTR - reverse DNS

```
Reverse resolution: IP address → hostname.
Used by: mail servers (anti-spam), logs, diagnostics.

Special domain:
  IPv4: in-addr.arpa     (octets in reverse order)
  IPv6: ip6.arpa         (nibbles in reverse order)

IPv4 example:
  IP: 1.2.3.4
  PTR record: 4.3.2.1.in-addr.arpa.  →  host.example.com.

IPv6 example:
  IP: 2001:db8::1
  Full form: 2001:0db8:0000:0000:0000:0000:0000:0001
  Expand all nibbles in reverse order:
  1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
  PTR → host.example.com.

Forward-confirmed reverse DNS (FCrDNS):
  PTR for 1.2.3.4 = mail.example.com
  A for mail.example.com = 1.2.3.4
  They match → FCrDNS is correctly configured.
  Mail servers require FCrDNS, otherwise email goes to spam.
```

```
# Reverse lookup
dig -x 8.8.8.8
dig -x 8.8.8.8 +short
# dns.google.

dig -x 2001:4860:4860::8888 +short
# dns.google.

# Manual PTR query
dig PTR 8.8.8.8.in-addr.arpa
dig PTR 8.8.4.4.in-addr.arpa

# host
host 8.8.8.8
# 8.8.8.8.in-addr.arpa domain name pointer dns.google.

# nslookup
nslookup 8.8.8.8

# Verify FCrDNS (mail server)
# 1. get PTR for the IP
dig -x 1.2.3.4 +short          # mail.example.com
# 2. get A for that hostname
dig A mail.example.com +short  # should return 1.2.3.4
```

### TXT - text records

```
Arbitrary text. Used for verification and email authentication.

Format:
  name  TTL  IN  TXT  "text content"

Main use cases:

1. SPF (Sender Policy Framework) - who can send email on behalf of the domain:
   example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"

   Qualifiers:
     +  pass (allowed)        ip4:1.2.3.4
     -  fail (rejected)       -all
     ~  softfail (suspicious) ~all
     ?  neutral               ?all

   include: - include SPF of another domain
   ip4:/ip6: - specific addresses
   a: / mx:  - A/MX records of the domain
   all       - everything else

2. DKIM (DomainKeys Identified Mail) - email signature:
   selector._domainkey.example.com.  IN  TXT
     "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."

   Email is signed with the private key.
   Public key is in DNS (TXT record).
   Receiver verifies the signature.

3. DMARC - policy for SPF+DKIM:
   _dmarc.example.com.  IN  TXT
     "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"

   p=none       - monitor only, don't block
   p=quarantine - send to spam
   p=reject     - reject the email

4. Domain verification (Google, GitHub, Cloudflare...):
   example.com.  IN  TXT  "google-site-verification=abc123..."
   example.com.  IN  TXT  "MS=ms12345678"  (Microsoft)

5. ACME (Let's Encrypt DNS challenge):
   _acme-challenge.example.com.  IN  TXT  "random-token-value"
```

```
# Query TXT records
dig TXT example.com
dig TXT example.com +short

# Check SPF
dig TXT example.com | grep spf

# Check DKIM (need to know the selector)
dig TXT selector._domainkey.example.com
# Find the selector in the email header: DKIM-Signature: s=selector

# Check DMARC
dig TXT _dmarc.example.com
dig TXT _dmarc.gmail.com +short

# Online SPF/DKIM/DMARC checker
# mxtoolbox.com/SuperTool.aspx
```

### SOA - Start of Authority

```
Mandatory record for every DNS zone. Contains zone metadata.

Format:
  name  TTL  IN  SOA  primary-ns  admin-email  (
    serial      ; zone serial number
    refresh     ; how often secondary checks for updates
    retry       ; how often to retry if primary is unreachable
    expire      ; when secondary considers the zone stale
    minimum     ; TTL for negative caching (NXDOMAIN)
  )

Example:
  example.com.  3600  IN  SOA  ns1.example.com.  admin.example.com.  (
    2024042601  ; serial (YYYYMMDDNN format is common)
    3600        ; refresh (1 hour)
    900         ; retry (15 minutes)
    604800      ; expire (1 week)
    300         ; minimum TTL / negative TTL
  )

admin.example.com = admin@example.com (first dot = @)

Serial number:
  Must increase with every zone change.
  Secondary servers sync when primary's serial is higher.
  YYYYMMDDNN format is convenient: 2024042601 = April 26 2024, revision 01.
```

```
# Query SOA
dig SOA example.com
dig SOA google.com +short

# Check serial number across NS servers
dig SOA example.com @ns1.example.com | grep SOA
dig SOA example.com @ns2.example.com | grep SOA
# Serial numbers must match. Mismatch = secondary is out of sync.
```

### SRV - service records

```
Specify where to find a particular service (port + host).

Format:
  _service._proto.name  TTL  IN  SRV  priority  weight  port  target

Examples:
  _sip._tcp.example.com.         IN  SRV  10  60  5060  sip.example.com.
  _xmpp-client._tcp.jabber.org.  IN  SRV   5   0  5222  xmpp.jabber.org.
  _minecraft._tcp.example.com.   IN  SRV   0   5 25565  mc.example.com.

Priority: lower = higher priority (like MX)
Weight: when priority is equal - probability of being chosen (higher = more often)
  weight 60 and weight 40 = 60% and 40% of traffic respectively

Use cases:
  SIP telephony, XMPP, Minecraft, Kubernetes (kube-dns), Office 365 autodiscovery
```

```
# Query SRV
dig SRV _sip._tcp.example.com
dig SRV _minecraft._tcp.example.com

# Office 365 autodiscovery
dig SRV _autodiscover._tcp.example.com
```

### CAA - Certification Authority Authorization

```
Specifies which CAs are allowed to issue certificates for the domain.
Protects against certificates being issued by unauthorized CAs.

Examples:
  example.com.  IN  CAA  0  issue     "letsencrypt.org"
  example.com.  IN  CAA  0  issuewild ";"        (wildcard certificates forbidden)
  example.com.  IN  CAA  0  iodef     "mailto:security@example.com"

issue:     allow issuing regular certificates
issuewild: allow wildcard certs (*.example.com)
iodef:     where to report violations
";"        - nobody is allowed (complete ban)
```

```
# Query CAA
dig CAA example.com
dig CAA google.com +short
# 0 issue "pki.goog"
# 0 issue "symantec.com"
```

---

## Zones and Zone Transfer

```
A DNS zone is a file containing records for a domain.

Example zone file (BIND format):
$ORIGIN example.com.
$TTL 3600

@   IN  SOA  ns1.example.com.  admin.example.com. (
                2024042601  ; serial
                3600        ; refresh
                900         ; retry
                604800      ; expire
                300 )       ; minimum

; NS records
@       IN  NS   ns1.example.com.
@       IN  NS   ns2.example.com.

; A records
@       IN  A    93.184.216.34
www     IN  A    93.184.216.34
mail    IN  A    93.184.216.50
ns1     IN  A    93.184.216.60
ns2     IN  A    93.184.216.61

; AAAA
@       IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

; MX
@       IN  MX   10  mail.example.com.

; CNAME
ftp     IN  CNAME  @

; TXT
@       IN  TXT  "v=spf1 ip4:93.184.216.50 ~all"
```

```
# Zone Transfer - retrieve all records for a zone (only if allowed)
dig AXFR example.com @ns1.example.com

# Check whether the server allows AXFR (it should deny outsiders)
dig AXFR zonetransfer.me @nsztm1.digi.ninja    # a training example with open AXFR

# Incremental Zone Transfer
dig IXFR=2024042601 example.com @ns1.example.com
```

---

## DNS caching and TTL

```
How the cache works:

Resolver got an answer: A 142.250.74.46, TTL=300
→ Stores it for 300 seconds
→ Subsequent queries before TTL expires are answered from cache
→ After 300 seconds it makes a fresh query

Negative caching (NXDOMAIN):
  If a domain doesn't exist - that is cached too.
  For how long? By the TTL in the SOA minimum field.

TTL strategy:
  Stable records (NS, MX):    86400 (one day) or more
  Regular A/AAAA records:     3600 (one hour)
  Load balancing / CDN:       60-300 (minutes)
  Before migration:           lower to 60-300, 24-48 hours in advance
  After migration:            raise back to normal
```

```
# View cache stats (systemd-resolved)
resolvectl statistics
resolvectl flush-caches           # flush the cache

# Flush DNS cache on Linux
# systemd-resolved:
systemctl restart systemd-resolved
# or:
resolvectl flush-caches

# nscd:
nscd -i hosts

# Check the current resolver
resolvectl status
cat /etc/resolv.conf

# Check the TTL of an answer
dig A google.com | grep -A1 'ANSWER SECTION'
# google.com. 299 IN A 142.250.74.46
#              ^^^ TTL (counts down every second)
```

---

## DNSSEC - zone signing

```
DNSSEC adds cryptographic signatures to DNS answers.
Protects against cache poisoning (forged DNS responses).

DNSSEC record types:
  RRSIG   - digital signature over a record set
  DNSKEY  - zone's public key
  DS      - hash of DNSKEY (stored in the parent zone)
  NSEC/NSEC3 - proof of non-existence for a name

Chain of trust:
  . (root) → .com (DS) → google.com (DNSKEY → RRSIG)
  The root zone is signed by IANA; everything else inherits trust.

Verify DNSSEC:
  dig A google.com +dnssec
  dig A google.com +dnssec +cd    # +cd = disable validation (data only)

  In the answer:
  ;; flags: qr rd ra ad    <- "ad" = Authenticated Data (DNSSEC validated)
  ;; flags: qr rd ra       <- no "ad" = DNSSEC not validated / not configured
```

```
# Verify DNSSEC signature
dig A cloudflare.com +dnssec +short
dig DNSKEY cloudflare.com
dig DS cloudflare.com @a.gtld-servers.com

# Online DNSSEC check
# dnssec-analyzer.verisignlabs.com
# dnsviz.net
```

---

## DNS over HTTPS and DNS over TLS

```
Plain DNS: UDP/TCP port 53, unencrypted.
Your ISP / anyone on the network can see all DNS queries.

DoT (DNS over TLS, RFC 7858):
  Port: 853
  DNS inside a TLS tunnel
  Clients: systemd-resolved, unbound

DoH (DNS over HTTPS, RFC 8484):
  Port: 443 (standard HTTPS)
  DNS inside HTTPS requests
  Hard to block (blends with regular HTTPS traffic)
  Clients: browsers (Firefox, Chrome), endpoint: /dns-query

Public DoH servers:
  Cloudflare:  https://1.1.1.1/dns-query
  Google:      https://8.8.8.8/dns-query
  Quad9:       https://9.9.9.9/dns-query
```

```
# Query via DoH (curl)
curl -s "https://1.1.1.1/dns-query?name=google.com&type=A" \
  -H "accept: application/dns-json" | python3 -m json.tool

# dig via DoT (requires kdig from knot-dnsutils)
kdig @1.1.1.1 +tls google.com A

# Configure DoT in systemd-resolved
# /etc/systemd/resolved.conf:
# [Resolve]
# DNS=1.1.1.1#cloudflare-dns.com 8.8.8.8#dns.google
# DNSOverTLS=yes

systemctl restart systemd-resolved
resolvectl status | grep 'DNS over TLS'
```

---

## Diagnosing DNS

### Full diagnostic flow

```
Problem: domain doesn't resolve

Step 1 - basic check
  dig A problem.domain
  # NXDOMAIN  - domain doesn't exist in DNS or typo
  # SERVFAIL  - server returned an error (DNSSEC, broken zone)
  # timeout   - resolver is unreachable

Step 2 - try different resolvers
  dig A problem.domain @8.8.8.8
  dig A problem.domain @1.1.1.1
  dig A problem.domain @9.9.9.9
  # Works on one but not another = problem is with a specific resolver

Step 3 - walk the DNS hierarchy manually
  dig A problem.domain +trace
  # Shows the full path from root to the answer

Step 4 - ask the authoritative server directly
  dig NS problem.domain @8.8.8.8           # find the NS
  dig A problem.domain @ns1.example.com    # ask it directly

Step 5 - check SOA and propagation
  dig SOA problem.domain @ns1.example.com
  dig SOA problem.domain @ns2.example.com
  # Serial numbers must match
```

### DNS response codes (RCODE)

```
NOERROR  (0) - success
FORMERR  (1) - malformed query
SERVFAIL (2) - server failed to process (DNSSEC failure, broken zone)
NXDOMAIN (3) - domain does not exist
NOTIMP   (4) - query type not supported by server
REFUSED  (5) - server refused (no recursion, access denied)

How to see the RCODE in dig output:
  dig A nonexistent.domain
  ;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 12345
                                           ^^^^^^^^
```

### Problem: slow resolution

```
# Measure resolution time
time dig A google.com
# real 0m0.023s - fast (answered from cache)
# real 0m0.280s - slow (full DNS walk)

# Check query time in dig output
dig A google.com | grep "Query time"
# ;; Query time: 23 msec

# Verify cache is working (second query should be faster)
dig A google.com @8.8.8.8
dig A google.com @8.8.8.8   # second time - from cache (TTL decreased)

# Check /etc/resolv.conf
cat /etc/resolv.conf
# nameserver 127.0.0.53     - systemd-resolved (normal on Ubuntu)
# nameserver 8.8.8.8        - Google DNS directly

# If the resolver is far away - high latency
# mtr -n 8.8.8.8           # check latency to the resolver
```

### Problem: split-horizon DNS

```
Split-horizon (split-brain): the same domain resolves differently
inside a corporate network vs the public internet.

Example:
  From outside: api.company.com → 203.0.113.50 (public IP)
  From inside:  api.company.com → 10.0.1.50 (internal IP)

Diagnostics:
  # Corporate resolver
  dig A api.company.com @10.0.0.1
  # Public resolver
  dig A api.company.com @8.8.8.8
  # Compare the answers

Override via /etc/hosts (simple local override):
  echo "10.0.1.50 api.company.com" >> /etc/hosts

Via systemd-resolved (split-dns for VPN):
  resolvectl dns vpn0 10.0.0.1
  resolvectl domain vpn0 company.com
```

### Useful one-liners

```
# All records for a domain (if the server allows it)
dig ANY example.com @ns1.example.com

# Check SPF/DKIM/DMARC/MX in one command
for type in TXT MX NS A AAAA; do echo "=== $type ==="; dig $type example.com +short; done

# Check email configuration
dig MX example.com +short
dig TXT example.com +short | grep -E 'spf|dkim|dmarc'
dig TXT _dmarc.example.com +short

# Get all subdomains via AXFR (if allowed)
dig AXFR example.com @ns1.example.com

# Batch queries
cat domains.txt | while read d; do echo "$d: $(dig A $d +short)"; done

# Check PTR for a list of IPs
echo "8.8.8.8 8.8.4.4 1.1.1.1" | tr ' ' '\n' | while read ip; do
  echo "$ip -> $(dig -x $ip +short)"
done

# Monitor: alert if an A record changed
OLD=$(dig A example.com +short)
sleep 60
NEW=$(dig A example.com +short)
[ "$OLD" != "$NEW" ] && echo "DNS changed: $OLD -> $NEW"
```

---

## Problems and solutions

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| NXDOMAIN | Domain doesn't exist / typo | Check name, NS servers |
| SERVFAIL | Broken DNSSEC / unreachable NS | dig +cd (skip DNSSEC check), check NS |
| Timeout | Resolver unreachable | Check /etc/resolv.conf, try another resolver |
| Slow | Resolver far away, no cache | Switch resolver, enable local cache |
| Different answers | Change not propagated yet | Wait out TTL, flush cache |
| Email going to spam | SPF/DKIM/DMARC not configured | Set up TXT records |
| Certificate error | CAA record blocks the CA | Add the CA to CAA record |
| NS out of sync | Different serial in SOA | Check zone replication |

---

## Cheat sheet

```
Record types:
  A      hostname → IPv4 (1.2.3.4)
  AAAA   hostname → IPv6 (2001:db8::1)
  CNAME  alias → another name (not at @, not for MX/NS)
  MX     domain → mail server (+ priority)
  NS     domain → authoritative nameserver
  PTR    IP → hostname (reverse DNS, in-addr.arpa)
  TXT    arbitrary text (SPF, DKIM, DMARC, verification)
  SOA    zone metadata (serial, TTL, primary NS)
  SRV    _service._proto → host:port (+ priority, weight)
  CAA    who can issue certificates

Diagnostics:
  dig A example.com              - A record
  dig A example.com +short       - IP only
  dig A example.com @8.8.8.8     - specific resolver
  dig A example.com +trace       - full path from root
  dig -x 8.8.8.8                 - reverse DNS (PTR)
  dig SOA example.com            - zone metadata
  dig AXFR example.com @ns1      - all zone records
  dig ANY example.com            - all types (often limited)

Email checks:
  dig MX example.com             - mail servers
  dig TXT example.com            - SPF, DKIM, DMARC
  dig TXT _dmarc.example.com     - DMARC policy
  dig TXT selector._domainkey.example.com  - DKIM public key

Response codes:
  NOERROR  - success
  NXDOMAIN - domain does not exist
  SERVFAIL - server error (DNSSEC, broken zone)
  REFUSED  - server refused

TTL strategy:
  Before a change: lower to 300, 24-48 hours in advance
  Stable records: 3600-86400
  CDN / load balancing: 60-300
  Negative cache (NXDOMAIN): SOA minimum field
```

---

## References

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names: Concepts and Facilities
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names: Implementation and Specification
- [RFC 2181](https://www.rfc-editor.org/rfc/rfc2181) - Clarifications to the DNS Specification (incl. MX must not point to CNAME)
- [RFC 7858](https://www.rfc-editor.org/rfc/rfc7858) - DNS over TLS (DoT)
- [RFC 8484](https://www.rfc-editor.org/rfc/rfc8484) - DNS over HTTPS (DoH)
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - DNSSEC Resource Records
- [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) - DMARC
- [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208) - SPF
- [dnsviz.net](https://dnsviz.net) - DNS/DNSSEC chain visualization
- [mxtoolbox.com](https://mxtoolbox.com/SuperTool.aspx) - MX/SPF/DMARC/blacklist checker
