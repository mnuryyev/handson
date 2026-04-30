---
title: "DNS - DNSSEC"
date: "2026-05-01"
---

DNSSEC (DNS Security Extensions) is a set of DNS extensions that add cryptographic signatures to DNS responses. It protects against DNS data forgery - cache poisoning and man-in-the-middle attacks. Defined in RFC 4033, 4034, 4035 (2005).

Core idea: the authoritative server signs its records with a private key. The resolver verifies the signature with the public key. Forging a response without the key is computationally infeasible.

---

## Why DNSSEC exists

```
Without DNSSEC:

Client          Resolver          Authoritative NS
  │                 │                     │
  │  bank.com?      │                     │
  │────────────────►│  bank.com?          │
  │                 │────────────────────►│
  │                 │                     │
  │                 │   Attacker intercepts the response
  │                 │   and substitutes the IP:
  │                 │   bank.com → 1.3.3.7 (phishing)
  │                 │◄────────────────────
  │  1.3.3.7        │
  │◄────────────────│
  │  (victim goes to phishing site)

With DNSSEC:
  Attacker substitutes the response, but the signature doesn't match.
  Resolver discards the response → SERVFAIL.
  Client never receives the forged IP.
```

```
What DNSSEC protects against:
  - Cache Poisoning (forging entries in a resolver's cache)
  - Man-in-the-middle (substituting responses in transit)
  - DNS Spoofing (forged responses)

What DNSSEC does NOT protect against:
  - Confidentiality (queries are still visible on the network)
    → Use DoT/DoH for that
  - DDoS attacks against DNS servers
  - Misconfigured DNS records (if the owner made the mistake)
  - Unsigned zones (if the domain isn't signed - no protection)
```

---

## DNSSEC keys - KSK and ZSK

```
DNSSEC uses two types of keys (RSA or ECDSA):

ZSK (Zone Signing Key) - signs the zone's records:
  - Signs actual records (A, MX, AAAA etc.)
  - Rotated frequently (monthly to quarterly)
  - Shorter and faster (lower computational load)

KSK (Key Signing Key) - signs the keys:
  - Signs only DNSKEY records (including the ZSK)
  - Rotated rarely (annually or every two years)
  - Longer and stronger
  - Its hash is stored in the parent zone (DS record)

Why two keys?
  With a single key, every rotation would require updating the DS record
  at the parent (slow, requires interaction with the registrar).

  With two keys:
  - ZSK rotates frequently → DS never needs to be touched
  - KSK rotates rarely → DS is updated infrequently
```

```
Analogy:
  KSK = master key to the safe (changed rarely, stored securely)
  ZSK = working key (changed often, used daily)
  DS  = fingerprint of KSK stored at the parent (allows verifying KSK)
```

---

## DNSSEC records

### DNSKEY - zone public key

```
Stores the zone's public keys (KSK and ZSK).

Format:
  name  TTL  IN  DNSKEY  flags  protocol  algorithm  public-key

Flags:
  256 = ZSK (Zone Signing Key)
  257 = KSK (Key Signing Key, also called SEP - Secure Entry Point)

Algorithms:
  5   = RSA/SHA-1        (deprecated)
  7   = RSASHA1-NSEC3-SHA1
  8   = RSA/SHA-256       (widely used)
  10  = RSA/SHA-512
  13  = ECDSA P-256 / SHA-256  (recommended, compact)
  14  = ECDSA P-384 / SHA-384
  15  = Ed25519           (modern, very compact)
  16  = Ed448

Example:
  example.com.  3600  IN  DNSKEY  256  3  13  (
    oJMRESz5E4gYzS/q6XDrvU1qMPYIjCWz
    JaOkcrws2N3A+pyMfOOKgzBJoWDFBnGM
    ...
  )
  example.com.  3600  IN  DNSKEY  257  3  13  (
    mdsswUyr3DPW132mOi8V9xESWE8jTo0d
    xCjjnopKl+GqJxpVXckHAeF+KkxLbxIL
    ...
  )
  ; 256 = ZSK, 257 = KSK
```

```
# Query DNSKEY records
dig DNSKEY cloudflare.com
dig DNSKEY cloudflare.com +short

# Inspect flags and algorithm
dig DNSKEY example.com | grep DNSKEY
# 256 = ZSK, 257 = KSK
# algorithm 13 = ECDSA P-256

# Calculate the key tag (key identifier)
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+12345.key
```

### RRSIG - resource record signature

```
Digital signature for each record set (RRset).
Every record type (A, MX, NS...) has its own RRSIG.

Format:
  name  TTL  IN  RRSIG  type  algo  labels  orig-ttl
               sig-expiry  sig-inception  key-tag
               signer-name  signature

Fields:
  type          - type of signed records (A, MX, NS...)
  algo          - signature algorithm (13 = ECDSA P-256)
  labels        - number of labels in the name (for wildcards)
  orig-ttl      - original TTL of the signed records
  sig-expiry    - when the signature expires (YYYYMMDDHHMMSS)
  sig-inception - when the signature becomes valid
  key-tag       - ID of the signing key
  signer-name   - zone that signed
  signature     - the actual signature (base64)

Example:
  example.com.  3600  IN  RRSIG  A 13 2 3600 (
    20240526000000  ; expires
    20240426000000  ; inception
    12345           ; key tag
    example.com.    ; signer
    base64signature...
  )
```

```
# Query RRSIG records
dig A cloudflare.com +dnssec
# ANSWER SECTION will contain both A and RRSIG records

# Check signature expiry dates
dig A example.com +dnssec | grep RRSIG
# Date format: 20240526000000 = May 26 2024 00:00:00 UTC

# Verify signature is valid
dig A cloudflare.com +dnssec +short
```

### DS - Delegation Signer

```
Stored in the PARENT zone.
Contains a hash of the child zone's KSK.
This is the "trust bridge" between zones.

Format:
  name  TTL  IN  DS  key-tag  algorithm  digest-type  digest

Digest types:
  1 = SHA-1    (deprecated)
  2 = SHA-256  (recommended)
  4 = SHA-384

Example:
  example.com.  3600  IN  DS  12345  13  2  (
    49FD46E6C4B45C55D4AC69CBD3CD34AC
    1B1E6B4B5C8A0A85DBE535D3DA7B6B94
  )
  ; 12345 = key tag
  ; 13 = ECDSA P-256
  ; 2 = SHA-256
  ; last field = hash of KSK

Where DS is stored:
  DS for example.com lives in the .com zone
  DS for cloudflare.com lives in the .com zone
  DS for .com lives in the root zone (.)
```

```
# Query a DS record
dig DS cloudflare.com
dig DS cloudflare.com +short
# 2371 13 2 32096BA... (key-tag algorithm digest-type hash)

# Query DS at the TLD server (the parent)
dig DS cloudflare.com @a.gtld-servers.net

# Generate DS from DNSKEY (when setting up DNSSEC)
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+12345.key
```

### NSEC and NSEC3 - proof of non-existence

```
Problem: how do you prove that a domain does NOT exist?
  Simply returning NXDOMAIN is forgeable - an attacker could fake
  an NXDOMAIN for a domain that actually exists.

NSEC (Next Secure):
  Contains the next existing name in the zone (alphabetical order).
  Proves there is nothing between A and C → B doesn't exist.

  Example zone: a.example.com, c.example.com, e.example.com
  NSEC for a.example.com: "next = c.example.com"
  Query for b.example.com → NSEC says: "nothing exists between a and c"

  Problem with NSEC: Zone Walking
  By following the NSEC chain you can enumerate ALL names in the zone.
  a → c → e → a (entire zone leaked).

NSEC3 (RFC 5155):
  Hashes names (SHA-1) before including them in the chain.
  Attacker sees hashes, not real names.
  Zone walking is not possible (only hash brute-forcing).

  NSEC3 parameters:
    Hash Algorithm: 1 = SHA-1
    Flags: 0 or 1 (Opt-Out - don't sign delegations without DS)
    Iterations: number of hash iterations (0-5 recommended)
    Salt: random salt (makes precomputation harder)
```

```
# Query NSEC records
dig A nonexistent.example.com +dnssec
# AUTHORITY SECTION will contain NSEC/NSEC3 records

# View the NSEC chain (zone walking - only for NSEC zones)
dig NSEC example.com @ns1.example.com
# example.com. IN NSEC mail.example.com. A MX NS SOA TXT RRSIG NSEC DNSKEY

# Query NSEC3PARAM (hashing parameters for the zone)
dig NSEC3PARAM example.com
```

---

## Chain of Trust

```
DNSSEC works as a trust hierarchy from the root down to the final domain.

The root zone (.) is signed by IANA.
The root's public key ("Trust Anchor") is hardcoded in every
DNSSEC-validating resolver.

Chain:
  . (root)
  │  DNSKEY (KSK root) <- Trust Anchor (resolver already knows this)
  │  RRSIG signs DNSKEY
  │
  ├── DS for .com <- signed with root key
  │
  .com
  │  DNSKEY (KSK .com) <- hash matches the DS in root
  │  RRSIG signs DNSKEY
  │
  ├── DS for example.com <- signed with .com key
  │
  example.com
     DNSKEY (KSK example.com) <- hash matches DS in .com
     DNSKEY (ZSK example.com)
     RRSIG over ZSK DNSKEY (signed by KSK)
     RRSIG over A records (signed by ZSK)
     A 93.184.216.34
```

```
Resolver verification process:

1. Resolver knows the Trust Anchor (root KSK public key).
2. Gets DNSKEY for .com → verifies using DS in root zone.
3. Gets DNSKEY for example.com → verifies using DS in .com.
4. Gets A record + RRSIG → verifies RRSIG with ZSK.
5. Everything checks out → AD=1 flag in response to client.
6. Something is wrong → SERVFAIL.
```

```
# Visualize the chain of trust
# dnsviz.net is the best tool for this

# Verify chain via dig
dig A cloudflare.com +dnssec +cd   # +cd = don't validate (just get data)
dig A cloudflare.com +dnssec       # validate

# AD flag in the response
dig A cloudflare.com | grep flags
# flags: qr rd ra ad  <- ad = authenticated data (DNSSEC OK)
# flags: qr rd ra     <- no ad = DNSSEC not validated / not configured

# Check DNSSEC for a specific domain
dig A domain.com +dnssec +short
# SERVFAIL with RRSIG present → DNSSEC validation problem
# dig A domain.com +dnssec +cd +short → get answer despite the error
```

---

## Setting up DNSSEC on your domain

### Step 1 - generate keys

```
# Using BIND utilities:

# Generate ZSK (ECDSA P-256, algorithm 13)
dnssec-keygen -a ECDSAP256SHA256 -n ZONE example.com
# Creates two files:
# Kexample.com.+013+12345.key        (public key)
# Kexample.com.+013+12345.private    (private key - keep secure!)

# Generate KSK (-f KSK flag)
dnssec-keygen -a ECDSAP256SHA256 -f KSK -n ZONE example.com
# Kexample.com.+013+67890.key
# Kexample.com.+013+67890.private

# Recommended algorithms (2024+):
#   13 = ECDSAP256SHA256 (compact, fast)
#   15 = ED25519         (smallest, modern)
#   8  = RSASHA256       (backward compatibility)
```

### Step 2 - sign the zone

```
# Add public keys to the zone file
cat Kexample.com.+013+12345.key >> /etc/bind/zones/example.com
cat Kexample.com.+013+67890.key >> /etc/bind/zones/example.com

# Sign the zone (BIND):
dnssec-signzone -A -3 $(head -c 1000 /dev/random | sha1sum | cut -b 1-16) \
  -N INCREMENT -o example.com -t \
  /etc/bind/zones/example.com \
  Kexample.com.+013+12345.private \
  Kexample.com.+013+67890.private

# Creates: example.com.signed
# -A = include all DNSKEY records
# -3 = use NSEC3 (instead of NSEC)
# -N INCREMENT = auto-increment serial
# -o = origin (zone name)

# Use the signed file in named.conf:
zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.signed";
    auto-dnssec maintain;    # automatic key maintenance
    inline-signing yes;      # sign inline (recommended)
};
```

### Step 3 - publish DS at the registrar

```
# Get the DS record to hand to the registrar
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+67890.key
# example.com. IN DS 67890 13 2 ABC123...hash...

# Provide to registrar:
# Key Tag:     67890
# Algorithm:   13 (ECDSA P-256)
# Digest Type: 2 (SHA-256)
# Digest:      ABC123...hash...

# Registrar adds the DS record to the .com zone.
# After propagation (~24-48 hours) the chain of trust is complete.

# Verify DS appeared
dig DS example.com @a.gtld-servers.net
```

### Automatic setup (Cloudflare / modern DNS providers)

```
Most modern DNS providers configure DNSSEC with a single click:
  Cloudflare:  Dashboard → DNS → DNSSEC → Enable
  Route53:     Hosted Zone → DNSSEC signing → Enable
  GoDaddy:     DNS Management → DNSSEC → Add

After enabling, the provider:
  - Generates keys automatically
  - Signs the zone
  - Publishes the DS record with the registrar (if registrar supports it)

Verify after enabling:
  dig DS example.com
  dig A example.com +dnssec | grep flags
  # Should see the "ad" flag
```

---

## Key Rollover

```
Keys must be rotated periodically. The process must be gradual,
otherwise resolvers with cached old keys will get SERVFAIL.

ZSK Rollover (more frequent, simpler):
  Does not require changing DS at the parent (DS points to KSK).

  Pre-Publication method:
  1. Publish new ZSK (add DNSKEY for new ZSK)
  2. Wait until old ZSK TTL expires (everyone has cached the new ZSK)
  3. Start signing with new ZSK
  4. Wait until old RRSIG signatures expire
  5. Remove old ZSK

  Timeline (TTL=1 hour, RRSIG validity=14 days):
  Day 0:   publish new ZSK
  Day 1:   switch signing to new ZSK
  Day 15:  remove old ZSK
```

```
KSK Rollover (less frequent, requires DS update):
  Requires updating the DS record at the registrar / parent zone.
  RFC 6781 describes the Double-DS and Double-KSK methods.

  Double-KSK method:
  1. Publish new KSK (add to DNSKEY)
  2. Submit new DS to registrar
  3. Wait until registrar publishes DS AND old DS TTL expires
  4. Sign DNSKEY set with new KSK
  5. Remove old KSK from DNSKEY
  6. Remove old DS at registrar

  Timeline:
  Day 0:   publish new KSK, submit DS to registrar
  Day 2-3: new DS has propagated → switch to new KSK
  Day 4-5: remove old KSK and DS
```

```
# Automatic rollover in BIND (inline-signing):
# named.conf:
zone "example.com" {
    inline-signing yes;
    auto-dnssec maintain;
    key-directory "/etc/bind/keys/example.com/";
};

# Add new key to key-directory - BIND handles rollover
# automatically based on activation/deactivation dates in the key.

# Check key status
rndc dnssec -status example.com

# Check signature expiry dates
dig A example.com +dnssec | grep RRSIG
# Expiry date: 20240526000000
```

---

## DNSSEC problems

### SERVFAIL caused by DNSSEC

```
The most common complaint: "domain doesn't work, dig returns SERVFAIL."
Cause - invalid DNSSEC signature.

Diagnostics:
  # Get an answer without DNSSEC validation
  dig A domain.com +cd           # cd = checking disabled
  # If +cd gives an answer but without it → SERVFAIL = DNSSEC problem

  # Find out what exactly is wrong
  dig A domain.com +dnssec +cd   # get RRSIG without validation

  # Online diagnosis (best tool)
  # dnsviz.net/d/domain.com
  # dnssec-analyzer.verisignlabs.com/domain.com

Common causes of SERVFAIL:
  1. Expired RRSIG signatures (forgot to re-sign the zone)
  2. DS doesn't match DNSKEY (key changed, DS not updated)
  3. KSK rollover done incorrectly
  4. Zone is not signed but DS exists at parent
  5. Server clock is wrong (RRSIG inception/expiry checked against system time)
```

```
# Check signature expiry
dig A example.com +dnssec | grep "RRSIG A"
# example.com. 3600 IN RRSIG A 13 2 3600 20240526000000 20240426000000 ...
#                                        ^^^^^^^^^^^^^^^^
#                                        expiry (May 26, 2024)

# Quick RRSIG expiry check
dig RRSIG example.com @ns1.example.com | awk '/RRSIG/ {print $9}' | \
  while read d; do
    echo "$d = $(date -d "${d:0:8}" 2>/dev/null || date -j -f '%Y%m%d' ${d:0:8} '+%Y-%m-%d' 2>/dev/null)"
  done

# Check that DS matches DNSKEY
# DS at parent:
dig DS example.com @a.gtld-servers.net +short
# DNSKEY in zone:
dig DNSKEY example.com +short
# The hash of DNSKEY must match the digest in DS

# If not - update DS at registrar
```

### Expired signatures

```
The most common real-world DNSSEC issue: forgot to re-sign the zone.
Signatures are valid for a limited period (typically 30 days).

Monitoring signature expiry:
  # Nagios/Zabbix check:
  check_dnssec_expiry.sh:
  #!/bin/bash
  DOMAIN=$1
  EXPIRY=$(dig RRSIG $DOMAIN @ns1.$DOMAIN +short | awk 'NR==1{print $5}')
  EXPIRY_TS=$(date -d "${EXPIRY:0:8}" +%s 2>/dev/null)
  NOW_TS=$(date +%s)
  DAYS=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
  echo "RRSIG expires in $DAYS days ($EXPIRY)"
  [ $DAYS -lt 7 ] && exit 2   # CRITICAL
  [ $DAYS -lt 14 ] && exit 1  # WARNING
  exit 0

  # Online monitoring: expiredns.com, zonemaster.net
```

```
# Re-sign the zone manually (BIND):
dnssec-signzone -A -3 $(head -c 1000 /dev/random | sha1sum | cut -b 1-16) \
  -N INCREMENT -o example.com \
  /etc/bind/zones/example.com

# Reload the zone in BIND:
rndc reload example.com

# Inline signing re-signs automatically:
rndc sign example.com        # re-sign immediately
rndc loadkeys example.com    # load new keys

# Confirm zone is signed
dig SOA example.com +dnssec | grep RRSIG
```

### Opt-Out in NSEC3

```
Opt-Out flag in NSEC3 (flag = 1):
  Allows skipping signatures for delegations without a DS record.
  Used on TLD zones (.com, .net) with millions of delegations.
  Delegations to unsigned domains don't require NSEC3 records.

Implication for users:
  If a domain has no DNSSEC and the TLD uses NSEC3 Opt-Out,
  the NXDOMAIN for that domain cannot be authenticated.
  (A minor but real gap in coverage.)

Check Opt-Out:
  dig NSEC3PARAM example.com
  # example.com. IN NSEC3PARAM 1 0 5 AB12
  #                               ^ flag: 0 = Opt-Out off
  #                                       1 = Opt-Out on
```

---

## Checking DNSSEC - tools

```
# dig - the primary tool

# Query with DNSSEC records
dig A cloudflare.com +dnssec

# Check for the AD flag (authenticated)
dig A cloudflare.com | grep flags
# flags: qr rd ra ad   <- DNSSEC verified

# Query without DNSSEC validation (debugging)
dig A domain.com +cd

# Query only RRSIG records
dig RRSIG example.com

# Query DNSKEY
dig DNSKEY cloudflare.com

# Query DS (at parent zone)
dig DS cloudflare.com @a.gtld-servers.net

# delv - DNSSEC-aware dig (built-in validation)
delv A cloudflare.com
# ; fully validated
# cloudflare.com.  299  IN  A  104.16.132.229
# cloudflare.com.  299  IN  RRSIG  A 13 2 300 ...

# delv with explicit trust anchor
delv @8.8.8.8 A cloudflare.com +root=/usr/share/dns/root.key

# drill (from ldns-utils)
drill -D cloudflare.com A    # DNSSEC drill
drill -TD cloudflare.com A   # trace + DNSSEC
```

```
# Online tools:
# dnsviz.net                         - best chain of trust visualizer
# dnssec-analyzer.verisignlabs.com   - detailed analysis
# zonemaster.net                     - full zone check
# dnschecker.org                     - check from multiple locations worldwide
# whatsmydns.net                     - DNS propagation checker
```

---

## DNSSEC and negative responses

```
The problem with authenticating NXDOMAIN:
  How do you sign "this domain doesn't exist"?
  You can't sign a non-existent record.

Solution - NSEC/NSEC3:
  Instead of signing the NXDOMAIN, we sign the RANGE of non-existence.

  Query: b.example.com (doesn't exist)
  Response contains NSEC:
    a.example.com. IN NSEC c.example.com. A RRSIG NSEC
    "the next name after a is c, nothing exists between them"

  The NSEC record is signed by RRSIG → can't be forged.
  Resolver is convinced that b.example.com doesn't exist.

NODATA (record type doesn't exist):
  Query: AAAA for a domain that only has an A record
  NSEC contains a bitmap of types at that name: A, MX, RRSIG, NSEC
  AAAA is not in the bitmap → NODATA is authenticated
```

---

## Cheat sheet

```
DNSSEC records:
  DNSKEY   zone public key (256=ZSK, 257=KSK)
  RRSIG    signature over a record set (every RRset)
  DS       hash of child zone's KSK (stored at parent)
  NSEC     next name (proof of non-existence, zone walkable)
  NSEC3    hash of next name (anonymized, prevents zone walking)

Recommended algorithms:
  13 = ECDSAP256SHA256  (balance of security and speed)
  15 = ED25519          (smallest size, modern)
  8  = RSASHA256        (backward compatibility)

Chain of trust:
  Trust Anchor (root KSK) → DS(.com) → DNSKEY(.com)
  → DS(example.com) → DNSKEY(example.com) → RRSIG(A record)

Flags in dig response:
  ad = Authenticated Data (DNSSEC validated and OK)
  cd = Checking Disabled  (validation turned off)

Diagnostics:
  dig A domain +dnssec              - query with DNSSEC
  dig A domain | grep flags         - check for ad flag
  dig A domain +cd                  - bypass DNSSEC validation
  dig RRSIG domain                  - view signatures
  dig DS domain @parent.ns          - DS at parent zone
  delv A domain                     - built-in validation
  dnsviz.net                        - chain visualizer

If SERVFAIL:
  1. dig A domain +cd → get answer without DNSSEC
  2. If it works → DNSSEC is the problem
  3. Check: are RRSIG expired? DS matches DNSKEY? Server clock correct?
  4. Use dnsviz.net for visual diagnosis

Key rotation:
  ZSK: monthly to quarterly (DS doesn't need to change)
  KSK: annually or every two years (must update DS at registrar)
  Method: Pre-Publication (ZSK) / Double-KSK (KSK)
```

---

## References

- [RFC 4033](https://www.rfc-editor.org/rfc/rfc4033) - DNSSEC Introduction and Requirements
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - Resource Records for DNSSEC (DNSKEY, RRSIG, NSEC, DS)
- [RFC 4035](https://www.rfc-editor.org/rfc/rfc4035) - Protocol Modifications for DNSSEC
- [RFC 5155](https://www.rfc-editor.org/rfc/rfc5155) - DNS Security (NSEC3)
- [RFC 6781](https://www.rfc-editor.org/rfc/rfc6781) - DNSSEC Operational Practices (Key Rollover)
- [RFC 8624](https://www.rfc-editor.org/rfc/rfc8624) - Algorithm Implementation Requirements for DNSSEC
- [dnsviz.net](https://dnsviz.net) - DNSSEC visualization and diagnostics
- [zonemaster.net](https://zonemaster.net) - full zone health check
- [IANA DNSSEC Root](https://www.iana.org/dnssec/files) - root trust anchors
