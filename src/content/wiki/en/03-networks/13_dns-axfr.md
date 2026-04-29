---
title: "DNS - Zone Transfers (AXFR/IXFR), Records, Security"
date: "2026-04-29"
---

DNS (Domain Name System) is a distributed, hierarchical system for resolving domain names to IP addresses and back. Defined in RFC 1034 and RFC 1035 (1987). Runs over UDP port 53 (queries up to 512 bytes) and TCP port 53 (large responses, zone transfers, DNSSEC). DNS is the foundation of the internet - almost nothing works without it.

---

## DNS Hierarchy

### Domain Name Space Structure

```
Root (".")
├── com.
│   ├── google.com.
│   │   ├── www.google.com.
│   │   └── mail.google.com.
│   └── github.com.
├── org.
│   └── wikipedia.org.
├── net.
├── uk.
│   └── bbc.co.uk.
└── (thousands of other TLDs)

FQDN (Fully Qualified Domain Name):
  www.google.com.   ← trailing dot = root
  Read right to left:
    . (root) → com → google → www

Levels:
  Root:         .
  TLD:          .com, .org, .net, .uk
  Second Level: google.com, bbc.co.uk
  Third Level:  www.google.com, mail.google.com
  And so on...

TLD types:
  gTLD (generic):    .com, .org, .net, .info, .biz
  ccTLD (country):   .uk, .de, .ru, .cn, .us
  New gTLD:          .app, .dev, .io, .cloud, .tech
  Infrastructure:    .arpa (reverse DNS)
```

### Types of DNS Servers

```
Authoritative server:
  Holds zone files with the real data.
  Replies with the AA (Authoritative Answer) flag.
  Does not do recursion.
  Examples: BIND, PowerDNS, NSD, Knot DNS.

  Primary (Master):
    The master copy of the zone.
    Admin edits zone files here.
    Answers AXFR/IXFR requests from Secondaries.

  Secondary (Slave):
    A copy of the zone obtained through zone transfer.
    Read-only (cannot be edited directly).
    Automatically syncs with Primary.
    Provides fault tolerance and load distribution.

Recursive resolver:
  Accepts queries from clients.
  Walks the DNS hierarchy from root to answer.
  Caches answers (respects TTL).
  Examples: 8.8.8.8 (Google), 1.1.1.1 (Cloudflare), unbound, dnsmasq.

Root servers:
  13 groups of servers (a.root-servers.net - m.root-servers.net).
  Know the addresses of TLD servers.
  Physically hundreds of servers worldwide (Anycast).

Forwarder:
  Forwards queries to another resolver.
  Common in corporate networks.
```

### The DNS Resolution Process

```
Client wants to know the IP for www.google.com:

Client → Recursive resolver (8.8.8.8)

  Resolver checks cache → no entry

  Resolver → Root Server (a.root-servers.net)
    Question: "Where is www.google.com?"
    Answer:   "I don't know, but the TLD server for .com is: a.gtld-servers.net"
    (Referral, NS type)

  Resolver → TLD Server (a.gtld-servers.net)
    Question: "Where is www.google.com?"
    Answer:   "I don't know, but the NS server for google.com is: ns1.google.com"
    (Referral, NS type)

  Resolver → Authoritative Server (ns1.google.com)
    Question: "Where is www.google.com?"
    Answer:   "142.250.185.4" (A record, AA flag)

  Resolver caches the answer (for the TTL duration)
  Resolver → Client: "142.250.185.4"

Iterative query: each step from resolver to server.
Recursive query: client → resolver (client asks for the full answer).
```

---

## DNS Resource Records

### Record Structure

```
Format:
  name    TTL    class    type    rdata

  www     3600   IN       A       142.250.185.4
  ↑       ↑      ↑        ↑       ↑
  name   time   Internet  type   data

name:  domain name (@ = current zone, * = wildcard)
TTL:   Time To Live (seconds) - how long to cache
class: almost always IN (Internet)
type:  record type (A, AAAA, MX, CNAME, ...)
rdata: data specific to the record type
```

### Common Record Types

```
A - IPv4 address
  www.example.com.  3600  IN  A  93.184.216.34
  One domain can have multiple A records (Round Robin DNS).

AAAA - IPv6 address
  www.example.com.  3600  IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

CNAME - Canonical Name (alias)
  mail.example.com.  3600  IN  CNAME  ghs.google.com.
  Redirects to another name (not an IP!).
  CNAME rules:
    - Cannot be used at the zone apex (@)
    - Cannot coexist with other record types for the same name
    - Chaining CNAME → CNAME → ... is undesirable
    - MX and NS records must not point to a CNAME

MX - Mail Exchanger
  example.com.  3600  IN  MX  10  mail1.example.com.
  example.com.  3600  IN  MX  20  mail2.example.com.
  The number = priority (lower = higher priority).
  MX must point to an A/AAAA record (not a CNAME!).

NS - Name Server
  example.com.  86400  IN  NS  ns1.example.com.
  example.com.  86400  IN  NS  ns2.example.com.
  Delegates the zone to these servers.
  Minimum 2 NS records required (redundancy).

SOA - Start of Authority
  Mandatory for every zone. One per zone.
  Covered in detail in the next section.

PTR - Pointer (reverse DNS, IP → name)
  34.216.184.93.in-addr.arpa.  3600  IN  PTR  www.example.com.
  Used for mail server verification, logs, security.
  Managed by the IP block owner (usually the ISP).

TXT - Text record (free-form text)
  example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"
  Used for:
    SPF   (Sender Policy Framework) - who can send mail
    DKIM  (DomainKeys Identified Mail) - mail signing
    DMARC (Domain-based Message Authentication)
    Domain ownership verification (Google, Cloudflare, ...)
    ACME (Let's Encrypt DNS-01 challenge)

SRV - Service location
  _service._proto.name  TTL  IN  SRV  priority  weight  port  target
  _sip._tcp.example.com.   3600  IN  SRV  10  20  5060  sip.example.com.
  _xmpp._tcp.example.com.  3600  IN  SRV  5    0  5269  xmpp.example.com.
  Used by: SIP, XMPP, LDAP, Kubernetes, service discovery.

CAA - Certification Authority Authorization
  example.com.  3600  IN  CAA  0  issue  "letsencrypt.org"
  example.com.  3600  IN  CAA  0  issuewild  ";"   (no wildcard certs)
  Defines who can issue SSL certificates for this domain.
  Checked by CAs before issuing a certificate.

NAPTR - Naming Authority Pointer
  Used in VoIP (E.164 numbers to SIP URIs).
  Complex format, rarely configured manually.

ALIAS / ANAME (non-standard, vendor-specific):
  Like CNAME but works at the zone apex (@).
  Supported by: Cloudflare (CNAME Flattening), Route53, PowerDNS.
  Enables: example.com → cdn.example.net (without a hardcoded A record).
```

### SOA Record - Start of Authority

```
SOA holds meta-information about the zone.
Critical for zone transfers.

Format:
  example.com.  86400  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901  ; Serial   - zone version
    3600        ; Refresh  - how often Secondary checks for updates
    900         ; Retry    - pause after a failed check
    604800      ; Expire   - when Secondary considers the zone stale
    300         ; Minimum  - minimum TTL (negative caching)
  )

SOA fields:
  MNAME (Primary NS):
    The primary NS server for the zone (ns1.example.com.).
    NOTIFY messages are sent to this server.
    This is the authoritative source for the SOA.

  RNAME (Responsible person):
    Zone admin email (@ replaced with a dot).
    admin.example.com. = admin@example.com
    The first dot in the name = @.

  Serial:
    Zone version number. Must be incremented with every change.
    Recommended format: YYYYMMDDNN (date + sequence).
    2026042901 = April 29 2026, first change of the day.
    Secondary compares Serial: if Primary has a higher number → starts transfer.
    If you forget to increment Serial → Secondary won't know about changes!

  Refresh (seconds):
    How often Secondary polls Primary's SOA to detect changes.
    Typical: 3600-86400 (1-24 hours).
    NOTIFY replaces polling but Refresh remains as a fallback.

  Retry (seconds):
    If a Refresh attempt failed, how long to wait before retrying.
    Typical: 600-3600 (10 min - 1 hour). Must be less than Refresh.

  Expire (seconds):
    If Secondary can't reach Primary for this long →
    Secondary stops answering queries (zone is considered dead).
    Typical: 604800-2419200 (1-4 weeks).
    Must be much larger than Refresh.

  Minimum TTL (negative caching):
    RFC 2308: now the TTL for NXDOMAIN (negative) responses.
    How long to cache "this name does not exist".
    Typical: 300-3600 (5 min - 1 hour).
```

---

## Zone Transfers

### What a Zone Transfer Is

```
A zone transfer is the mechanism for synchronizing zone data
between the Primary (Master) and Secondary (Slave) DNS servers.

Why:
  Primary holds the master copy of the zone.
  Secondaries are replicas for fault tolerance and load distribution.
  When the zone changes on Primary → Secondaries must get the update.

Two types:
  AXFR - full transfer (Full Zone Transfer)
  IXFR - incremental transfer (Incremental Zone Transfer)

Both run over TCP (port 53).
AXFR: RFC 5936 (updated from RFC 1034/1035).
IXFR: RFC 1995.
```

### AXFR - Full Zone Transfer

```
AXFR transfers a complete copy of the zone.
Used for initial synchronization or when IXFR is not possible.

AXFR process:
  Secondary                     Primary
      │                              │
      │── DNS Query: AXFR ──────────►│
      │   qtype=AXFR, name=zone      │
      │                              │
      │◄── SOA record ───────────────│  first record of the response
      │◄── all zone records ─────────│  all RRs one by one
      │◄── SOA record ───────────────│  last record (same SOA)
      │                              │
      │  [Secondary saves the zone]  │

Details:
  1. Secondary sends a DNS query with type AXFR.
  2. Primary checks ACL (is this Secondary allowed to transfer?).
  3. Response starts with the SOA record.
  4. Then all zone records follow (in any order).
  5. Response ends with the same SOA record.
  6. Secondary replaces its zone with the received data.

AXFR downside: for large zones - slow and bandwidth-heavy.
Solution: IXFR.

TCP connection:
  AXFR always uses TCP (too much data for UDP).
  The response may be split across multiple TCP segments / DNS messages.
```

### IXFR - Incremental Zone Transfer

```
IXFR transfers only the changes since the last transfer.
Much more efficient than AXFR for large zones with frequent updates.

IXFR process:
  Secondary                     Primary
      │                              │
      │── DNS Query: IXFR ──────────►│
      │   qtype=IXFR                 │
      │   + SOA with current Serial  │  Secondary sends its current Serial
      │                              │
      │◄── SOA (new) ────────────────│  Primary's new Serial
      │◄── SOA (Secondary's old) ───│  start of diff block
      │◄── deleted records ──────────│  what was removed
      │◄── SOA (intermediate) ───────│
      │◄── added records ────────────│  what was added
      │◄── SOA (new) ────────────────│  end of diff block
      │                              │

If Primary doesn't support IXFR or the diff is too large:
  Primary falls back to a full AXFR response.

Secondary decides whether to apply incremental changes
or request a full AXFR.

Change history storage:
  Primary must keep a change journal for IXFR.
  BIND: a .jnl (journal) file alongside the zone file.
  If history is unavailable → falls back to AXFR.
```

### DNS NOTIFY

```
NOTIFY - mechanism for Primary to tell Secondaries about zone changes.
RFC 1996.

Without NOTIFY: Secondary polls Primary every Refresh interval (hours).
With NOTIFY: Primary immediately alerts Secondaries when the zone changes.

Process:
  Primary              Secondary
      │── NOTIFY ──────────►│   "Zone changed, my Serial = X"
      │◄── ACK ─────────────│   Secondary acknowledges
      │                     │
      │                     │   Secondary queries SOA
      │◄── SOA Query ───────│
      │── SOA Response ─────►│
      │                     │   Primary Serial > Secondary Serial?
      │                     │   Yes → start IXFR/AXFR
      │◄── IXFR/AXFR ───────│

Configuring NOTIFY in BIND:
  options {
      notify yes;                    (enable globally)
  };
  zone "example.com" {
      type master;
      notify yes;
      also-notify { 192.168.1.2; }; (explicitly list Secondaries)
  };
```

### Configuring Zone Transfers in BIND

```
# /etc/bind/named.conf.options (global)
options {
    # Deny AXFR by default (security)
    allow-transfer { none; };
};

# /etc/bind/named.conf.local (per zone)

# Primary (Master) zone
zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.db";

    # Allow transfer only to Secondary servers
    allow-transfer { 192.168.1.2; 192.168.1.3; };

    # Notify Secondaries of changes
    notify yes;
    also-notify { 192.168.1.2; 192.168.1.3; };

    # TSIG key for authentication (better than IP ACL)
    # allow-transfer { key "transfer-key"; };
};

# Secondary (Slave) zone
zone "example.com" {
    type slave;
    masters { 192.168.1.1; };         (Primary IP)
    file "/var/cache/bind/example.com.db";  (zone cache)

    # Accept NOTIFY from Primary
    # (by default accepts from masters list)
};
```

### Configuring TSIG (Authenticated Transfers)

```
TSIG (Transaction Signature, RFC 2845):
  Authenticates DNS transactions via HMAC-MD5/SHA.
  More secure than IP ACL (IP can be spoofed).

# Generate a TSIG key
tsig-keygen -a hmac-sha256 transfer-key > /etc/bind/transfer-key.conf
# Or manually:
# dnssec-keygen -a hmac-sha256 -b 256 -n HOST transfer-key

# Key file contents:
# key "transfer-key" {
#     algorithm hmac-sha256;
#     secret "base64encodedkey==";
# };

# /etc/bind/named.conf (Primary)
include "/etc/bind/transfer-key.conf";

zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.db";
    allow-transfer { key "transfer-key"; };
    notify yes;
};

# /etc/bind/named.conf (Secondary)
include "/etc/bind/transfer-key.conf";

zone "example.com" {
    type slave;
    masters { 192.168.1.1 key "transfer-key"; };
    file "/var/cache/bind/example.com.db";
};
```

```
# Manual AXFR request (diagnostics)
dig @ns1.example.com example.com AXFR
dig @192.168.1.1 example.com AXFR

# IXFR request
dig @ns1.example.com example.com IXFR=2026042901
# 2026042901 = Serial from which we want updates

# AXFR with TSIG key
dig @ns1.example.com example.com AXFR \
  -y hmac-sha256:transfer-key:base64key==

# Using host
host -t AXFR example.com ns1.example.com

# Using nslookup
nslookup
> server ns1.example.com
> set type=AXFR
> example.com

# Check SOA (Serial)
dig @ns1.example.com example.com SOA
dig @ns2.example.com example.com SOA
# Compare Serials - all NS servers should match
```

---

## Zone File

### Zone File Format

```
; Comments start with ;
; File: /etc/bind/zones/example.com.db

$ORIGIN example.com.    ; suffix for relative names
$TTL 3600               ; default TTL (1 hour)

; SOA record
@  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901  ; Serial
    3600        ; Refresh
    900         ; Retry
    604800      ; Expire
    300         ; Minimum/Negative TTL
)

; NS records (name servers)
@       IN  NS  ns1.example.com.
@       IN  NS  ns2.example.com.

; Glue records (A records for NS servers in this zone)
ns1     IN  A   192.168.1.1
ns2     IN  A   192.168.1.2

; A records
@       IN  A   93.184.216.34      ; example.com
www     IN  A   93.184.216.34      ; www.example.com
mail    IN  A   93.184.216.100
ftp     IN  A   93.184.216.101

; AAAA records
www     IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

; MX records
@       IN  MX  10  mail.example.com.
@       IN  MX  20  mail2.example.com.
mail2   IN  A   93.184.216.101

; CNAME records
blog    IN  CNAME  www.example.com.
shop    IN  CNAME  www.example.com.

; TXT records
@       IN  TXT  "v=spf1 ip4:93.184.216.0/24 -all"
_dmarc  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"

; DKIM (long records can be split with parentheses)
mail._domainkey  IN  TXT  (
    "v=DKIM1; k=rsa; "
    "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC..."
)

; SRV records
_http._tcp   IN  SRV  10  0  80   www.example.com.
_https._tcp  IN  SRV  10  0  443  www.example.com.

; CAA records
@   IN  CAA  0  issue      "letsencrypt.org"
@   IN  CAA  0  issuewild  ";"
@   IN  CAA  0  iodef      "mailto:security@example.com"

; Wildcard
*   IN  A   93.184.216.34    ; catch-all for undefined names
```

### Reverse DNS Zone File

```
; File: /etc/bind/zones/1.168.192.in-addr.arpa.db
; Reverse zone for 192.168.1.0/24

$ORIGIN 1.168.192.in-addr.arpa.
$TTL 3600

@  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901
    3600
    900
    604800
    300
)

@   IN  NS  ns1.example.com.
@   IN  NS  ns2.example.com.

; PTR records: last octet → hostname
1   IN  PTR  ns1.example.com.
2   IN  PTR  ns2.example.com.
10  IN  PTR  router.example.com.
50  IN  PTR  server1.example.com.
51  IN  PTR  server2.example.com.
100 IN  PTR  mail.example.com.
```

```
# Managing BIND zones

# Check config syntax
named-checkconf /etc/bind/named.conf

# Check zone file syntax
named-checkzone example.com /etc/bind/zones/example.com.db

# Reload all zones
rndc reload

# Reload a specific zone
rndc reload example.com

# Force Secondary to retransfer
rndc retransfer example.com

# Update Serial and notify Secondaries
rndc notify example.com

# Zone status
rndc zonestatus example.com

# Flush resolver cache
rndc flush

# Dump cache contents
rndc dumpdb -cache
cat /var/cache/bind/named_dump.db

# BIND logs
journalctl -u named -f
tail -f /var/log/named/named.log
```

---

## AXFR as a Vulnerability

### Why Open Zone Transfer Is Dangerous

```
AXFR lets anyone download the entire zone file in a single request.
If the server doesn't restrict who can request AXFR →
anyone can get a complete map of your network.

What an attacker gets from AXFR:
  - All hosts and their IPs (servers, routers, printers, PCs)
  - Internal subdomains (vpn.company.com, dev.company.com, admin.company.com)
  - Mail servers (MX) → targets for spam/phishing
  - Network structure (names hint at function: db01, ldap, monitoring)
  - Potentially internal IPs if included in the zone

Example attack (recon before a pentest):
  dig @ns1.company.com company.com AXFR

  Result:
    dev.company.com.     A  10.0.1.50    ← dev server
    staging.company.com. A  10.0.1.51    ← staging env
    vpn.company.com.     A  203.0.113.10 ← VPN gateway
    ldap.company.com.    A  10.0.0.5     ← LDAP/AD server
    db01.company.com.    A  10.0.1.100   ← database
    jenkins.company.com. A  10.0.1.200   ← CI/CD
    admin.company.com.   A  10.0.1.5     ← management panel
    ...and so on

This information significantly simplifies the next stages of an attack.
DNS reconnaissance is a standard part of OSINT and penetration testing.
```

### Tools for DNS Reconnaissance

```
# Check if AXFR is allowed (often it isn't)
dig @ns1.example.com example.com AXFR

# If allowed - response contains records
# If denied:
# ; Transfer failed.
# or
# ;; XFR size: 0 records (messages 1, bytes 56)

# dnsenum - automated DNS recon
dnsenum example.com
dnsenum --dnsserver ns1.example.com example.com
# Tries AXFR + subdomain brute-force + reverse DNS

# dnsrecon - multi-purpose tool
dnsrecon -d example.com -t axfr
dnsrecon -d example.com -t std         (standard records)
dnsrecon -d example.com -t brt -D /usr/share/dnsrecon/namelist.txt

# fierce - subdomain discovery
fierce --domain example.com

# subfinder - subdomain discovery via OSINT
subfinder -d example.com

# amass - full DNS reconnaissance
amass enum -d example.com
amass enum -active -d example.com

# theHarvester - OSINT (subdomains via search engines)
theHarvester -d example.com -b all

# Check all NS servers for the zone
dig example.com NS
# Then try AXFR against each NS

for ns in $(dig +short example.com NS); do
    echo "=== $ns ==="
    dig @$ns example.com AXFR
done

# Zone Walking for DNSSEC (NSEC walking)
# If zone is signed with NSEC (not NSEC3) - you can enumerate all records
ldns-walk example.com
# Uses NSEC chains to discover all names in the zone
```

### Protecting Against Unauthorized AXFR

```
1. Restrict AXFR by IP (ACL):
   # BIND
   options {
       allow-transfer { none; };   (deny everyone by default)
   };
   zone "example.com" {
       allow-transfer { 192.168.1.2; 192.168.1.3; };  (Secondary only)
   };

2. TSIG authentication (better than ACL):
   Harder to forge than an IP address.
   Even if traffic is intercepted - useless without the key.
   (see "Configuring TSIG" section for setup)

3. Split-horizon DNS (internal vs external):
   External NS: only public records (www, mail, vpn)
   Internal NS: all records (dev, staging, db, ldap, ...)
   External has no knowledge of internal names → AXFR is useless.

4. Verify your server blocks AXFR from the outside:
   # From an external machine:
   dig @your-public-ns.com yourdomain.com AXFR
   # Should return "Transfer failed" or a refusal.

5. Monitor AXFR attempts:
   BIND logs will contain "denied zone transfer" or successful transfers.
   Set up alerts for AXFR requests from unknown IPs.

   # BIND logging config
   logging {
       channel transfer_log {
           file "/var/log/named/transfer.log";
           severity info;
       };
       category xfer-out { transfer_log; };
       category xfer-in  { transfer_log; };
   };

6. Use NSEC3 instead of NSEC (if using DNSSEC):
   NSEC allows "zone walking" - enumerating all records.
   NSEC3 with opt-out prevents this (adds salt + hash).
```

---

## DNS Security

### DNS Spoofing / Cache Poisoning

```
Attack against a recursive resolver:
  Attacker sends forged DNS replies faster than the real ones.
  Resolver caches the forged record.
  All resolver clients receive the fake IP.

Kaminsky attack (2008):
  A major DNS vulnerability.
  Attacker sent thousands of forged replies with different Transaction IDs.
  Predictable Transaction IDs made it possible to guess correctly.
  Fix: source port randomization (different port per request).

Protection against Cache Poisoning:
  - Source port randomization (RFC 5452)
  - DNSSEC (cryptographic verification of answers)
  - DNS over TLS (DoT) / DNS over HTTPS (DoH)
  - 0x20 encoding (random case in query name)
```

### DNSSEC - DNS Security Extensions

```
DNSSEC adds cryptographic signatures to DNS responses.
Clients verify: does this data really come from the authoritative server?

DNSSEC record types:
  DNSKEY  - zone public key (ZSK and KSK)
  RRSIG   - digital signature for each record set
  NSEC    - proof that a name does NOT exist (lists adjacent names)
  NSEC3   - same, but with hashing (prevents zone walking)
  DS      - hash of child zone's KSK (stored in parent zone)
  CDS     - request to update DS (from child zone)
  CDNSKEY - request to update DNSKEY

Chain of trust:
  Root (.) is signed → ICANN manages root keys.
  TLD (.com) is signed → Verisign.
  Zone (example.com) is signed → zone admin.
  DS record in .com points to example.com key.
  DS in . points to .com key.

Keys:
  ZSK (Zone Signing Key) - signs zone records.
  KSK (Key Signing Key)  - signs the ZSK.
  KSK is rotated rarely (yearly), ZSK more often.

Checking DNSSEC:
  dig +dnssec example.com A            (query with DNSSEC)
  dig +sigchase www.example.com A      (verify chain)
  delv @8.8.8.8 example.com A          (DNS lookup + validation)
```

### DNS over TLS (DoT) and DNS over HTTPS (DoH)

```
Standard DNS is plaintext → your ISP / attacker can see all queries.

DNS over TLS (DoT, RFC 7858):
  TCP port 853.
  Encrypts DNS traffic via TLS.
  Client knows which server it's connecting to (SNI).

DNS over HTTPS (DoH, RFC 8484):
  HTTPS port 443.
  DNS queries as HTTP POST/GET to /dns-query.
  Indistinguishable from regular HTTPS traffic.
  Harder to block or monitor.

DNS over QUIC (DoQ, RFC 9250):
  QUIC (UDP 853).
  Faster TLS handshake, lower latency.

Popular DoT/DoH servers:
  Cloudflare: 1.1.1.1 (DoT), https://cloudflare-dns.com/dns-query (DoH)
  Google:     8.8.8.8 (DoT), https://dns.google/dns-query (DoH)
  Quad9:      9.9.9.9 (DoT), https://dns.quad9.net/dns-query (DoH)

Configuring DoT on Linux (systemd-resolved):
  /etc/systemd/resolved.conf:
  [Resolve]
  DNS=1.1.1.1#cloudflare-dns.com 9.9.9.9#dns.quad9.net
  DNSOverTLS=yes

Configuring DoH in Firefox:
  about:preferences#general → Network Settings → Enable DNS over HTTPS
```

---

## DNS Troubleshooting

### Core Commands

```
# dig - primary DNS diagnostics tool
dig example.com                    (A record)
dig example.com A                  (explicit type)
dig example.com AAAA               (IPv6)
dig example.com MX                 (mail servers)
dig example.com NS                 (name servers)
dig example.com SOA                (SOA record)
dig example.com TXT                (TXT records)
dig example.com ANY                (all types, may not always work)

# Query a specific server
dig @8.8.8.8 example.com           (Google DNS)
dig @1.1.1.1 example.com           (Cloudflare)
dig @ns1.example.com example.com   (authoritative)

# Useful dig flags
dig +short example.com             (answer only, no extras)
dig +norecurse example.com         (no recursion, iterative)
dig +trace example.com             (trace from root to answer)
dig +dnssec example.com            (show DNSSEC records)
dig +time=2 +tries=1 example.com   (timeout and retry count)
dig -4 example.com                 (IPv4 transport only)
dig -6 example.com                 (IPv6 transport only)

# Reverse DNS (PTR)
dig -x 8.8.8.8                     (reverse query)
dig 8.8.8.8.in-addr.arpa PTR       (same, manually)

# Trace the full resolution path
dig +trace www.example.com
# . NS (root servers)
# com. NS (TLD servers)
# example.com. NS (authoritative)
# www.example.com. A (answer)

# nslookup (less powerful, but available everywhere)
nslookup example.com
nslookup example.com 8.8.8.8
nslookup -type=MX example.com

# host - simple tool
host example.com
host -t MX example.com
host 8.8.8.8                       (reverse DNS)
```

### Checking Zone Transfer and Synchronization

```
# Check Serial on all NS servers (should match)
for ns in $(dig +short example.com NS); do
    serial=$(dig @$ns example.com SOA +short | awk '{print $3}')
    echo "$ns: Serial=$serial"
done

# Example output:
# ns1.example.com.: Serial=2026042901
# ns2.example.com.: Serial=2026042901  ← in sync

# Test AXFR
dig @ns1.example.com example.com AXFR | head -50

# Count records in zone
dig @ns1.example.com example.com AXFR | grep -c "IN"

# Compare Primary and Secondary zones
diff <(dig @ns1.example.com example.com AXFR | sort) \
     <(dig @ns2.example.com example.com AXFR | sort)
# No differences expected

# Check BIND sync status
rndc zonestatus example.com
# name: example.com
# type: master
# files: /etc/bind/zones/example.com.db
# serial: 2026042901
# nodes: 25
# last loaded: ...
# secure: no
```

### Common DNS Problems

```
Problem: Secondary not syncing

Diagnosis:
  # Compare Serial on Primary and Secondary
  dig @primary example.com SOA +short
  dig @secondary example.com SOA +short
  # If Secondary has lower Serial → no sync happening

  # Test AXFR manually from Secondary's perspective
  dig @primary-ip example.com AXFR

  Causes:
  - ACL doesn't allow Secondary to do AXFR
  - Firewall blocks TCP 53 between servers
  - Serial wasn't incremented on Primary after change
  - TSIG keys don't match

Problem: Stale DNS cache

  # Flush resolver cache
  rndc flush                       (BIND)
  systemd-resolve --flush-caches   (systemd-resolved)
  ipconfig /flushdns               (Windows)

  # Check TTL remaining in response
  dig example.com A
  # ;; ANSWER SECTION:
  # example.com. 285 IN A 93.184.216.34
  #              ↑ remaining TTL in seconds (was 3600, time has passed)

  # Wait for TTL to expire, or lower it in advance
  # Before a planned change: reduce TTL to 300 sec a few hours ahead.

Problem: NXDOMAIN for an existing domain

  # Check directly on the authoritative server
  dig @ns1.example.com missinghost.example.com

  # Check NSEC/NSEC3 records (DNSSEC)
  dig +dnssec +noadditional example.com NSEC

  Causes:
  - Record not created in the zone file
  - Serial not incremented → Secondary not updated
  - DNSSEC signature issue

Problem: Slow DNS resolution

  # Measure response time
  dig example.com | grep "Query time"
  # ;; Query time: 2 msec    ← from cache
  # ;; Query time: 234 msec  ← recursive query

  # Find the slow hop with trace
  dig +trace example.com

  Causes:
  - Recursive resolver is far away or overloaded
  - Authoritative server is slow
  - TTL too low → cache provides no benefit
  - High round-trip time to DNS server
```

---

## Cheat Sheet

```
DNS hierarchy:
  Root (.) → TLD (.com) → SLD (example.com) → host (www.example.com)
  FQDN ends with a dot: www.example.com.

Key record types:
  A     - IPv4 address
  AAAA  - IPv6 address
  CNAME - alias to another name
  MX    - mail server (with priority)
  NS    - zone name servers
  SOA   - zone start (Serial, Refresh, Retry, Expire, Minimum)
  PTR   - reverse DNS (IP → name)
  TXT   - text (SPF, DKIM, DMARC, ownership verification)
  SRV   - service location (priority weight port target)
  CAA   - who can issue SSL certificates

SOA timers:
  Serial  - zone version (must increment on every change!)
  Refresh - how often Secondary checks (sec)
  Retry   - pause after failed check (sec)
  Expire  - when Secondary considers zone dead (sec)
  Minimum - TTL for NXDOMAIN responses (sec)

Zone transfers:
  AXFR - full transfer (TCP 53)
  IXFR - incremental transfer (changes only)
  NOTIFY - Primary tells Secondary about changes
  Without restrictions → anyone can download the entire zone!

Security:
  allow-transfer { none; };         deny AXFR to everyone
  allow-transfer { 1.2.3.4; };     allow only Secondary
  TSIG keys - better than IP ACL
  Split-horizon DNS - separate zones for inside/outside
  DNSSEC - signatures to protect against spoofing
  DoT/DoH - encrypt DNS traffic

Diagnostics:
  dig example.com A                  basic query
  dig @ns1 example.com SOA           check Serial
  dig @ns1 example.com AXFR          request zone
  dig +trace example.com             trace from root
  dig -x 8.8.8.8                     reverse DNS
  rndc reload example.com            reload zone
  rndc zonestatus example.com        zone status
  named-checkzone zone file          check syntax

Ports:
  UDP 53  - standard DNS queries (up to 512 bytes)
  TCP 53  - large responses, AXFR, DNSSEC
  TCP 853 - DNS over TLS (DoT)
  TCP 443 - DNS over HTTPS (DoH)
```

---

## References

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names - Concepts and Facilities
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names - Implementation and Specification
- [RFC 1995](https://www.rfc-editor.org/rfc/rfc1995) - Incremental Zone Transfer (IXFR)
- [RFC 1996](https://www.rfc-editor.org/rfc/rfc1996) - DNS NOTIFY
- [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308) - Negative Caching of DNS Queries (NXDOMAIN TTL)
- [RFC 2845](https://www.rfc-editor.org/rfc/rfc2845) - Secret Key Transaction Authentication for DNS (TSIG)
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - DNSSEC Resource Records
- [RFC 5936](https://www.rfc-editor.org/rfc/rfc5936) - DNS Zone Transfer Protocol (AXFR)
- [RFC 7858](https://www.rfc-editor.org/rfc/rfc7858) - DNS over TLS (DoT)
- [RFC 8484](https://www.rfc-editor.org/rfc/rfc8484) - DNS over HTTPS (DoH)
- [BIND 9 Administrator Reference](https://bind9.readthedocs.io)
- [dnsviz.net](https://dnsviz.net) - DNSSEC chain of trust visualizer
