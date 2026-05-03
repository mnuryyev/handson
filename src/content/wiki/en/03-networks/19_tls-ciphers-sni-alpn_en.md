---
title: "TLS - Cipher Suites, SNI, ALPN"
date: "2026-05-03"
---

A continuation of the TLS topic. This page covers three mechanisms in depth: Cipher Suites (sets of cryptographic algorithms), SNI (Server Name Indication, certificate selection by hostname), and ALPN (Application-Layer Protocol Negotiation, negotiating the application protocol). All three work inside the TLS handshake and directly affect security, performance, and compatibility.

---

## Cipher Suites

### What a Cipher Suite Is

```
A cipher suite is an ordered set of cryptographic algorithms that
defines every aspect of a secure connection.

One suite describes:
  1. Key exchange algorithm
  2. Server authentication algorithm
  3. Symmetric bulk encryption algorithm
  4. Integrity check algorithm (MAC / AEAD)

Client and server negotiate one suite in ClientHello/ServerHello.
No common suite → handshake fails → connection closes.
```

### Anatomy of a Cipher Suite (TLS 1.2)

```
TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
 ↑    ↑      ↑    ↑    ↑    ↑    ↑
 │    │      │    │    │    │    └── MAC / AEAD hash (SHA-384)
 │    │      │    │    │    └─────── Block cipher mode (GCM)
 │    │      │    │    └──────────── Encryption key size (256 bits)
 │    │      │    └───────────────── Symmetric cipher (AES)
 │    │      └────────────────────── Server authentication (RSA)
 │    └───────────────────────────── Key exchange (ECDHE)
 └────────────────────────────────── Protocol (TLS)

More examples:
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  TLS_DHE_RSA_WITH_AES_256_CBC_SHA256
  TLS_RSA_WITH_AES_128_CBC_SHA        ← obsolete, no PFS
```

### TLS 1.3 - Simplified Cipher Suites

```
In TLS 1.3, a cipher suite describes ONLY the cipher + hash.
Key exchange and authentication are decoupled
(always ECDHE or DHE, always certificate/PSK).

Available suites in TLS 1.3:
  TLS_AES_256_GCM_SHA384          (recommended)
  TLS_CHACHA20_POLY1305_SHA256    (recommended, especially mobile)
  TLS_AES_128_GCM_SHA256          (acceptable)
  TLS_AES_128_CCM_SHA256          (embedded systems)
  TLS_AES_128_CCM_8_SHA256        (embedded systems, short tag)

Why the simplification?
  TLS 1.2 had >300 cipher suites → combinatorial explosion → vulnerabilities.
  All TLS 1.3 suites use AEAD (no separate MAC → more secure).
  No suites with known design weaknesses.
```

### Cipher Suite Components

#### Key Exchange

```
Goal: securely establish a shared secret between client and server
without transmitting it over the wire. Session keys are derived from it.

RSA Key Exchange (DEPRECATED in TLS 1.3):
  Client generates pre-master secret.
  Encrypts it with the server's RSA public key.
  Sends to server.
  Server decrypts with its private key.

  Problem: no Forward Secrecy.
  If the server's private key is compromised later →
  all recorded traffic can be decrypted.

DHE — Diffie-Hellman Ephemeral:
  Client and server each generate ephemeral DH keys.
  Exchange public halves.
  Each independently computes the shared secret.
  Ephemeral = one-time keys → Forward Secrecy.

  DH parameters: group (prime p) and generator (g).
  Weak DH (512, 768, 1024 bits) → Logjam attack.
  Recommended: >= 2048 bits.

ECDHE — Elliptic Curve DHE:
  Same as DHE but on elliptic curves.
  Shorter keys for equivalent security (256-bit ECDH ≈ 3072-bit RSA).
  Faster than DHE.
  Recommended curves:
    X25519    (Curve25519, modern, fast, no patents)
    P-256     (secp256r1, widely supported)
    P-384     (secp384r1, higher security)
    P-521     (secp521r1, maximum security, slower)

  Curves to avoid:
    P-224     (too short)
    B-163, K-163 (binary curves, weaknesses)
    Curves with known backdoor concerns (debated NIST curves)

PSK — Pre-Shared Key (TLS 1.3):
  Client and server already share a secret.
  Used for session resumption (0-RTT / 1-RTT).
  Ticket-based PSK: server issues a session ticket after handshake.
```

#### Authentication

```
Goal: prove the server (and optionally client) controls the key
corresponding to the certificate.

RSA:
  Server signs handshake data with its RSA private key.
  Client verifies signature with the public key from the certificate.
  Key size: minimum 2048 bits (4096 recommended).
  Slower than ECDSA for large key sizes.

ECDSA — Elliptic Curve Digital Signature Algorithm:
  Server signs with an ECDSA key.
  Faster than RSA.
  Shorter keys.
  Requires an ECDSA certificate (not RSA).
  Curves: P-256, P-384, P-521.

EdDSA / Ed25519 (TLS 1.3):
  Modern signature algorithm.
  Deterministic (no PRNG dependency).
  Very fast.
  Ed25519 (Curve25519) → widely used.
  Ed448 (Curve448) → higher security.

anon (anonymous suites — NEVER USE):
  TLS_DH_anon_WITH_AES_...
  No authentication → trivial man-in-the-middle.
  Never use.
```

#### Bulk Cipher - Symmetric Encryption

```
Encrypts the main data stream after session keys are established.

AES-GCM (recommended):
  AES — Advanced Encryption Standard.
  GCM — Galois/Counter Mode (AEAD mode).
  AEAD = Authenticated Encryption with Associated Data.
  Encryption + authentication in a single pass.
  Hardware acceleration (AES-NI CPU instructions).
  Key sizes: 128 or 256 bits.

ChaCha20-Poly1305 (recommended):
  ChaCha20 — stream cipher by Bernstein.
  Poly1305 — MAC algorithm (AEAD together with ChaCha20).
  Faster than AES on devices without AES-NI (mobile).
  Not vulnerable to cache-timing attacks.
  No patents, open design.

AES-CCM (for IoT):
  CCM — Counter with CBC-MAC.
  AEAD, but slower than GCM.
  Suitable for embedded systems with limited resources.

Deprecated (disable!):
  AES-CBC  — no built-in authentication → needs separate HMAC
             → padding oracle attacks (POODLE, BEAST, Lucky 13)
  3DES-CBC — 64-bit block → Sweet32 birthday attack (BAN)
  RC4      — statistical weaknesses → BAN (RFC 7465)
  DES      — 56-bit key → brute-forced in hours → BAN
  NULL     — no encryption → BAN
```

#### MAC / AEAD - Integrity

```
Protects data against modification.

HMAC (Hash-based MAC):
  Used with CBC cipher suites.
  HMAC-SHA256, HMAC-SHA384.
  Separate operation after encryption.
  Encrypt-then-MAC (TLS 1.3) vs MAC-then-Encrypt (TLS 1.2 CBC).
  MAC-then-Encrypt → padding oracle → vulnerabilities.

AEAD (Authenticated Encryption with Associated Data):
  Encryption and authentication in one operation.
  GCM, CCM, Poly1305 — all AEAD.
  TLS 1.3: ONLY AEAD suites (CBC/MAC are prohibited).
  No separate MAC field → no issues with operation ordering.

Hash algorithms for PRF (pseudorandom function):
  SHA-256 → TLS_*_SHA256
  SHA-384 → TLS_*_SHA384
  Used to derive keys from master secret.
```

### Cipher Suite Selection

```
Preference order (best to acceptable):

TLS 1.3 (all are good, client chooses):
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256

TLS 1.2 (ECDHE + AEAD only):
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384  ← best (ECDSA cert)
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384    ← best (RSA cert)
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256

Acceptable (TLS 1.2, has PFS but uses CBC):
  TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384
  TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256

Forbidden (disable immediately!):
  TLS_RSA_WITH_*                 (no PFS)
  TLS_*_WITH_RC4_*               (RC4 is broken)
  TLS_*_WITH_3DES_*              (Sweet32)
  TLS_*_WITH_DES_*               (too weak)
  TLS_*_WITH_NULL_*              (no encryption)
  TLS_DH_anon_*                  (no authentication)
  TLS_*_EXPORT_*                 (export-grade, 40-56 bits)
  TLS_*_MD5                      (MD5 is broken)
  TLS_ECDHE_RSA_WITH_AES_*_CBC_SHA  (SHA-1 → ban for new configs)
```

### Configuring Cipher Suites

```nginx
# nginx - recommended cipher suites
ssl_protocols TLSv1.2 TLSv1.3;

# TLS 1.3 suites (OpenSSL >= 1.1.1)
ssl_conf_command Ciphersuites TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256;

# TLS 1.2 cipher suites
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';

ssl_prefer_server_ciphers off;   # TLS 1.3: let client choose
                                 # TLS 1.2: can be on (server decides)

# ECDH curves
ssl_ecdh_curve X25519:prime256v1:secp384r1;
```

```apache
# Apache
SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:\
               ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:\
               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
SSLHonorCipherOrder off
SSLOpenSSLConfCmd Curves X25519:prime256v1:secp384r1
```

```bash
# Check supported cipher suites on a server
nmap --script ssl-enum-ciphers -p 443 example.com

# testssl.sh - detailed analysis
bash testssl.sh --cipher-per-proto example.com

# openssl - test a specific suite
openssl s_client -connect example.com:443 \
  -cipher ECDHE-RSA-AES256-GCM-SHA384

# List all OpenSSL cipher suites
openssl ciphers -v 'ALL:COMPLEMENTOFALL'

# List strong suites only
openssl ciphers -v 'HIGH:!aNULL:!MD5:!3DES'

# Check what was actually negotiated
openssl s_client -connect example.com:443 2>/dev/null \
  | grep "Cipher is"
# Cipher is ECDHE-RSA-AES256-GCM-SHA384

# Check TLS 1.3 ciphers
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null \
  | grep "Cipher is"
```

### Cipher Suite IDs

```
Every suite has a 2-byte identifier (in TLS ClientHello/ServerHello).

TLS 1.3:
  0x1301 = TLS_AES_128_GCM_SHA256
  0x1302 = TLS_AES_256_GCM_SHA384
  0x1303 = TLS_CHACHA20_POLY1305_SHA256

TLS 1.2 (examples):
  0xC02C = TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
  0xC030 = TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  0xCCA9 = TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
  0xCCA8 = TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
  0xC02B = TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  0xC02F = TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256

Deprecated (do not use):
  0x0035 = TLS_RSA_WITH_AES_256_CBC_SHA
  0x002F = TLS_RSA_WITH_AES_128_CBC_SHA
  0x000A = TLS_RSA_WITH_3DES_EDE_CBC_SHA

GREASE (RFC 8701):
  0x?A?A values (0x0A0A, 0x1A1A, 0x2A2A, ...) = fake values.
  Chrome and other clients include GREASE suites in ClientHello.
  Purpose: ensure servers don't crash on unknown values.
  A correct server must ignore GREASE → pick a real suite.
```

---

## SNI - Server Name Indication

### The Problem Without SNI

```
One server can host thousands of domains (virtual hosting).
Each domain needs its own TLS certificate.

Problem: TLS handshake happens BEFORE the HTTP request.
Server must choose the certificate during TLS, not after.
Without a hint from the client — server doesn't know which cert to send.

Without SNI (old approach):
  Each domain needs a separate IP address.
  example.com     → 1.2.3.4
  other.com       → 1.2.3.5
  another.com     → 1.2.3.6
  IPv4 exhaustion makes this impractical at scale.
```

### What SNI Is

```
SNI (Server Name Indication) — a TLS extension (RFC 6066).
Client includes the hostname at the very start of the TLS handshake (ClientHello).
Server reads SNI → selects the appropriate certificate.

Position in the handshake:
  ClientHello {
    ...
    extensions: [
      server_name: "example.com"     ← SNI
      supported_versions: [TLS 1.3]
      supported_groups: [X25519, P-256]
      signature_algorithms: [ecdsa_secp256r1_sha256, ...]
      ...
    ]
  }

Important:
  SNI is plaintext in TLS 1.2 (visible on the wire!).
  TLS 1.3 — Certificate is encrypted, but SNI is still plaintext.
  ESNI/ECH solves this (see below).
```

### SNI in Detail

```
Structure of the server_name extension (type 0x0000):
  ServerNameList {
    NameType:   host_name (0)
    HostName:   "example.com"  (no port, no http://)
  }

Rules:
  - DNS name only (not an IP address)
  - No port
  - No scheme (http:// or https://)
  - Lowercase, no trailing dot
  - Maximum 255 characters (DNS limit)

What the server does upon receiving SNI:
  1. Looks up a virtual host with that name.
  2. Found → returns the corresponding certificate.
  3. Not found → returns the default certificate (or closes connection).

Behavior when SNI is absent:
  Old clients (IE 6, XP) didn't support SNI.
  Server returns the default certificate.
  If the name doesn't match the default cert → error on client.
  Today SNI is universally supported (>99% of browsers).
```

### SNI and Security - The Leakage Problem

```
Critical issue: SNI is plaintext on the wire!

Even when using HTTPS, an observer (ISP, corporate proxy,
government, attacker on the same network) can see:
  - Which domain you visit (from SNI)
  - Which IP you connect to
  - Time and duration of connections

Cannot see:
  - Specific URL (path, query parameters)
  - Request and response content
  - HTTP headers

Example tcpdump capture:
  tcpdump -i eth0 -A 'tcp port 443' | grep -a "server_name"
  # Without decryption, "example.com" is visible

Why SNI is plaintext:
  TLS record layer — encrypted.
  TLS handshake — partially open (before key agreement).
  ClientHello — first packet, no keys yet → nothing to encrypt with.
```

### ESNI and ECH - Encrypted SNI

```
ESNI (Encrypted SNI) — draft, experimental (2018-2020).
ECH (Encrypted Client Hello) — ESNI replacement, RFC 9258 (2023).

ECH concept:
  Server's public key for encrypting ClientHello — published in DNS (HTTPS record).
  Client encrypts the "inner" ClientHello (with real SNI) using the public key.
  "Outer" ClientHello — only public information.
  Server decrypts and sees the real SNI.

DNS HTTPS record for ECH:
  example.com.  IN  HTTPS  1  .  ech=<base64 ech config>

Two ClientHellos:
  Outer ClientHello (visible on the wire):
    SNI: "cloudflare-esni.com" (or a generic ECH provider)
    Encrypted ClientHello extension (contains inner ClientHello)

  Inner ClientHello (encrypted):
    SNI: "example.com" (real)
    All other extensions

ECH status (2026):
  Firefox: enabled by default (for trusted HTTPS records)
  Chrome:  enabled by default
  Cloudflare: supports ECH for all sites on its CDN
  Requires: TLS 1.3 + DoH/DoT (DNS must also be encrypted!)

ECH limitations:
  DNS query for the HTTPS record must be encrypted (DoH/DoT).
  Otherwise: ISP sees DNS query → learns the domain.
  Requires support on server + DNS + client.
```

### Configuring SNI

```nginx
# nginx — different certificates for different domains on one IP

server {
    listen 443 ssl;
    server_name example.com www.example.com;
    ssl_certificate     /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;
}

server {
    listen 443 ssl;
    server_name other.com www.other.com;
    ssl_certificate     /etc/ssl/other.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/other.com/privkey.pem;
}

# Default server (if SNI doesn't match)
server {
    listen 443 ssl default_server;
    ssl_certificate     /etc/ssl/default/fullchain.pem;
    ssl_certificate_key /etc/ssl/default/privkey.pem;
    return 444;   # close connection with no response
}
```

```bash
# Check SNI in ClientHello (tcpdump)
tcpdump -i eth0 -A -s 0 'tcp port 443' 2>/dev/null \
  | grep -a "server_name\|SNI"

# Wireshark: filter tls.handshake.extensions_server_name
# Hostname visible in plaintext in ClientHello

# Verify server handles SNI correctly
openssl s_client -connect 1.2.3.4:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject
# Should show CN=example.com

# Without SNI (what does the server return by default?)
openssl s_client -connect example.com:443 -noservername 2>/dev/null \
  | openssl x509 -noout -subject

# curl with explicit SNI (if IP ≠ domain)
curl --resolve example.com:443:1.2.3.4 https://example.com

# Check multiple domains on one IP
for domain in example.com other.com third.com; do
    echo -n "$domain: "
    echo | openssl s_client -connect 1.2.3.4:443 \
      -servername $domain 2>/dev/null \
      | openssl x509 -noout -subject -issuer 2>/dev/null
done
```

### SNI in Other Contexts

```
HAProxy — SNI routing (L4, without decryption):
  frontend https_in
      bind *:443
      mode tcp
      tcp-request inspect-delay 5s
      tcp-request content accept if { req_ssl_hello_type 1 }

      use_backend be_example if { req_ssl_sni -i example.com }
      use_backend be_other   if { req_ssl_sni -i other.com }

  backend be_example
      mode tcp
      server s1 192.168.1.10:443

  backend be_other
      mode tcp
      server s2 192.168.1.20:443

  # HAProxy reads SNI from ClientHello WITHOUT decrypting TLS!
  # This is L4 (TCP) load balancing based on SNI.

nginx stream (equivalent to HAProxy SNI routing):
  stream {
      map $ssl_preread_server_name $backend {
          example.com  192.168.1.10:443;
          other.com    192.168.1.20:443;
          default      192.168.1.30:443;
      }
      server {
          listen 443;
          ssl_preread on;
          proxy_pass $backend;
      }
  }

Kubernetes Ingress + cert-manager:
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
  spec:
    tls:
    - hosts: [example.com]
      secretName: example-tls
    - hosts: [other.com]
      secretName: other-tls
    rules:
    - host: example.com
      ...
    # cert-manager automatically issues certificates per SNI
```

---

## ALPN - Application-Layer Protocol Negotiation

### What ALPN Is

```
ALPN (Application-Layer Protocol Negotiation) — a TLS extension (RFC 7301).
Negotiates the application-layer protocol within the TLS handshake.

Without ALPN:
  Client connects on port 443.
  After TLS handshake starts speaking HTTP.
  Separate round-trip for protocol negotiation — slow.
  Or separate ports for different protocols.

With ALPN:
  Client in ClientHello: "I support h2, http/1.1"
  Server in ServerHello: "I choose h2"
  After TLS handshake they immediately speak h2.
  No extra round-trip.
```

### ALPN in the TLS Handshake

```
ClientHello {
  extensions: [
    application_layer_protocol_negotiation: [
      "h2",        ← HTTP/2 (preferred)
      "http/1.1"   ← HTTP/1.1 (fallback)
    ]
    server_name: "example.com"
    ...
  ]
}

ServerHello {
  extensions: [
    application_layer_protocol_negotiation: "h2"   ← server chose h2
  ]
}

If the server doesn't support any of the proposed protocols:
  TLS Alert: no_application_protocol (120)
  Connection closes.

If no ALPN extension at all:
  Server omits ALPN in its response → client uses its default.
  Usually HTTP/1.1.
```

### ALPN Identifiers

```
IANA ALPN Protocol ID registry:

Web protocols:
  "http/1.0"      HTTP/1.0
  "http/1.1"      HTTP/1.1 (ALPN default)
  "h2"            HTTP/2 over TLS (RFC 7540)
  "h2c"           HTTP/2 over cleartext TCP (not via ALPN)
  "h3"            HTTP/3 (RFC 9114)
  "h3-29"         HTTP/3 draft 29 (legacy)

gRPC:
  "grpc-exp"      gRPC (experimental identifier)
  gRPC uses HTTP/2 → usually "h2"

WebSockets:
  No separate ALPN for WebSocket.
  WebSocket runs over HTTP/1.1 (Upgrade) or HTTP/2.

ACME (Let's Encrypt):
  "acme-tls/1"    TLS-ALPN-01 challenge (RFC 8737)
  Let's Encrypt verifies domain ownership via TLS on port 443.
  Client responds with a special certificate on ALPN "acme-tls/1".

Other protocols:
  "ftp"           FTP over TLS
  "imap"          IMAP over TLS
  "pop3"          POP3 over TLS
  "dot"           DNS over TLS (RFC 7858)
  "stun.nat-discovery" STUN
  "webrtc"        WebRTC
  "c-webrtc"      Confidential WebRTC
  "spdy/1"        SPDY 1 (obsolete)
  "spdy/2"        SPDY 2 (obsolete)
  "spdy/3"        SPDY 3 (obsolete, HTTP/2 predecessor)

Identifier format:
  ASCII string, 1-255 bytes.
  Registered with IANA.
  Flat namespace (no namespacing).
```

### ALPN for HTTP/2 - Key Scenario

```
HTTP/2 negotiation via ALPN:

Client (browser) → example.com:443:
  TLS ClientHello:
    extensions.ALPN: ["h2", "http/1.1"]

Server (nginx with http2 on) → client:
  TLS ServerHello:
    extensions.ALPN: "h2"

After this:
  Client sends HTTP/2 Connection Preface:
    "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
  HTTP/2 SETTINGS frame.
  HTTP/2 communication begins.

If server selects "http/1.1":
  Client begins HTTP/1.1 communication.
  Normal TCP keep-alive session.

If server doesn't support ALPN at all:
  No ALPN in ServerHello.
  Client (browser) → falls back to HTTP/1.1.
  HTTP/2 is NOT used (browsers won't use HTTP/2 without ALPN).
```

### ALPN for TLS-ALPN-01 (ACME Challenge)

```
Let's Encrypt verifies domain ownership via TLS on port 443.
Used when HTTP-01 (port 80) is unavailable.

Process:
  1. Let's Encrypt → ACME client: "Here's a challenge token"
  2. ACME client creates a temporary TLS certificate:
     - Self-signed
     - CN = domain being validated
     - SAN = domain
     - ASN.1 extension acmeIdentifier = hash of key authorization
  3. ACME client configures a TLS server on port 443
     to respond with this certificate on ALPN "acme-tls/1"
  4. Let's Encrypt → domain:443 with ALPN: ["acme-tls/1"]
  5. Server → special certificate
  6. Let's Encrypt checks acmeIdentifier extension → success

Certbot supports TLS-ALPN-01:
  certbot certonly --standalone --preferred-challenges tls-alpn-01 \
    -d example.com

Advantages of TLS-ALPN-01:
  - No need for port 80
  - No DNS records needed
  - Works with any TLS server on port 443
```

### Configuring ALPN

```nginx
# nginx — ALPN is configured via ssl_protocols and http2
server {
    listen 443 ssl;
    http2 on;          # enables ALPN "h2"
    server_name example.com;
    ssl_certificate     /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;
    # nginx automatically advertises ALPN ["h2", "http/1.1"]
}

# HTTP/1.1 only (disable HTTP/2)
server {
    listen 443 ssl;
    # no http2 on;
    # ALPN will be "http/1.1" only
}

# HTTP/3 ALPN (h3)
server {
    listen 443 quic reuseport;
    add_header Alt-Svc 'h3=":443"; ma=86400';
    # QUIC/HTTP/3 ALPN = "h3" (built into QUIC)
}
```

```apache
# Apache — ALPN controlled by mod_http2
LoadModule http2_module modules/mod_http2.so
Protocols h2 h2c http/1.1
# Order matters: h2 is preferred over http/1.1
```

```go
// Go — explicit ALPN configuration
tlsConfig := &tls.Config{
    NextProtos: []string{"h2", "http/1.1"},
    // tls.Config.NextProtos = ALPN list
}
ln, _ := tls.Listen("tcp", ":443", tlsConfig)
```

```python
# Python — via ssl module
import ssl
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('cert.pem', 'key.pem')
ctx.set_alpn_protocols(['h2', 'http/1.1'])
```

```bash
# Check ALPN negotiation result
openssl s_client -connect example.com:443 -alpn h2,http/1.1 2>/dev/null \
  | grep ALPN
# ALPN protocol: h2  ← server selected h2

# Verify server supports h2
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
  | grep "ALPN\|Protocol"

# curl — check the protocol used
curl -v --http2 https://example.com 2>&1 | grep -E "ALPN|h2|HTTP/"

# If ALPN is not supported
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
  | grep ALPN
# (nothing — no ALPN in server response)

# Full TLS handshake output with ALPN and SNI
openssl s_client -connect example.com:443 \
  -alpn h2,http/1.1 -servername example.com -state 2>&1 \
  | grep -E "ALPN|SNI|Cipher|Protocol|Verify"
```

---

## Interaction of SNI, ALPN, and Cipher Suites

### The Full ClientHello Picture

```
ClientHello (TLS 1.3 example):
  ┌─────────────────────────────────────────────────────┐
  │ Version: TLS 1.0 (compat) + supported_versions: 1.3  │
  │ Random: 32 random bytes                              │
  │ Session ID: <empty or old ID>                        │
  │ Cipher Suites:                                       │
  │   0x1302  TLS_AES_256_GCM_SHA384        ← TLS 1.3   │
  │   0x1303  TLS_CHACHA20_POLY1305_SHA256  ← TLS 1.3   │
  │   0x1301  TLS_AES_128_GCM_SHA256        ← TLS 1.3   │
  │   0xC02C  ECDHE_ECDSA_AES256_GCM_SHA384 ← TLS 1.2  │
  │   0xC030  ECDHE_RSA_AES256_GCM_SHA384   ← TLS 1.2  │
  │   0xCCA9  ECDHE_ECDSA_CHACHA20_POLY1305 ← TLS 1.2  │
  │   0xCCA8  ECDHE_RSA_CHACHA20_POLY1305   ← TLS 1.2  │
  │   0x0A0A  GREASE                         ← fuzz     │
  │ Extensions:                                          │
  │   server_name:             "example.com"   ← SNI    │
  │   supported_versions:      [0x0304, 0x0303] (1.3,1.2)│
  │   supported_groups:        [x25519, P-256, P-384]   │
  │   key_share:               [x25519 public key]      │
  │   signature_algorithms:    [ecdsa_sha256, rsa_pss_sha256, ...]│
  │   application_layer_protocol_negotiation: ["h2", "http/1.1"] ← ALPN│
  │   session_ticket:          <ticket data>             │
  │   psk_key_exchange_modes:  [psk_dhe_ke]             │
  │   pre_shared_key:          <PSK identity>           │
  └─────────────────────────────────────────────────────┘

ServerHello (response):
  ┌─────────────────────────────────────────────────────┐
  │ Version: TLS 1.2 (compat) + selected_version: 1.3   │
  │ Random: 32 bytes                                     │
  │ Cipher Suite: 0x1302 TLS_AES_256_GCM_SHA384         │
  │ Extensions:                                          │
  │   supported_versions:      0x0304 (TLS 1.3)         │
  │   key_share:               x25519 public key        │
  │   application_layer_protocol_negotiation: "h2" ← ALPN│
  │   (SNI is not echoed in ServerHello — already known) │
  └─────────────────────────────────────────────────────┘
```

### Server Decision Order

```
Incoming ClientHello:

1. SNI → virtual host and certificate selection
   SNI: "example.com" → load cert for example.com

2. Cipher Suites → algorithm selection
   Intersection: {client suites} ∩ {server suites}
   Empty → TLS alert: handshake_failure

3. TLS version → protocol selection
   From supported_versions on both sides
   No intersection → TLS alert: protocol_version

4. ALPN → application protocol selection
   Intersection: {client ALPN} ∩ {server ALPN}
   Empty and ALPN required → TLS alert: no_application_protocol
   No ALPN extension → no ALPN in response

5. key_share → curve/group selection for ECDHE
   If client didn't offer the needed group → HelloRetryRequest
```

---

## Diagnostics and Debugging

### Wireshark - Analyzing the TLS Handshake

```
Wireshark filters for TLS:
  tls                              - all TLS traffic
  tls.handshake                    - handshake only
  tls.handshake.type == 1          - ClientHello
  tls.handshake.type == 2          - ServerHello
  tls.handshake.extensions_server_name  - SNI
  tls.handshake.extensions.alpn   - ALPN extension
  tls.handshake.ciphersuite        - Cipher Suites list

ClientHello fields in Wireshark:
  Transport Layer Security
    TLSv1.3 Record Layer: Handshake Protocol: Client Hello
      Handshake Protocol: Client Hello
        Version: TLS 1.0 (0x0301)
        Random: ...
        Session ID: ...
        Cipher Suites (18 suites)
          Cipher Suite: TLS_AES_256_GCM_SHA384 (0x1302)
          Cipher Suite: TLS_CHACHA20_POLY1305_SHA256 (0x1303)
          ...
        Extensions
          Extension: server_name (len=14)
            Server Name: example.com        ← SNI (plaintext!)
          Extension: application_layer_protocol_negotiation (len=14)
            ALPN Protocol: h2
            ALPN Protocol: http/1.1
          Extension: supported_versions (len=7)
            Supported Version: TLS 1.3 (0x0304)
            Supported Version: TLS 1.2 (0x0303)
```

### Diagnostic Commands

```bash
# Full TLS handshake with details
openssl s_client -connect example.com:443 \
  -servername example.com \
  -alpn h2,http/1.1 \
  -state -debug 2>&1 | head -100

# What's visible on the wire (SNI leak)
tcpdump -i eth0 -A -s 0 'tcp port 443' 2>/dev/null | \
  strings | grep -i "example.com"
# (simplified example; use tshark or Wireshark for proper parsing)

# tshark — parse SNI and ALPN
tshark -i eth0 -Y 'tls.handshake.type == 1' \
  -T fields \
  -e tls.handshake.extensions_server_name \
  -e tls.handshake.extensions.alpn \
  2>/dev/null

# All cipher suites offered by a client
tshark -i eth0 -Y 'tls.handshake.type == 1' \
  -T fields -e tls.handshake.ciphersuites 2>/dev/null

# Verify server responds correctly to ALPN
openssl s_client -connect example.com:443 \
  -alpn h2,http/1.1 -servername example.com 2>/dev/null | \
  grep -E "ALPN|Cipher|Protocol"
# ALPN protocol: h2
# Cipher is TLS_AES_256_GCM_SHA384
# Protocol  : TLSv1.3

# nmap — scan cipher suites
nmap --script ssl-enum-ciphers -p 443 example.com
# Shows: all supported suites, grade (A/B/C/F)

# testssl.sh — full report
bash testssl.sh --cipher-per-proto --protocols example.com
bash testssl.sh -E example.com   # all cipher suites
bash testssl.sh -P example.com   # protocols only
```

### Common Problems

```
Problem: HTTP/2 not working despite server configuration

  Diagnosis:
    curl -v --http2 https://example.com 2>&1 | grep ALPN
    # If no ALPN → server doesn't support it or misconfigured

    openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
      | grep ALPN
    # If empty → no ALPN response from server

  Causes:
    - nginx: no "http2 on" (or "listen 443 ssl http2" in old syntax)
    - Apache: mod_http2 not loaded, no Protocols h2
    - Intermediate proxy/load balancer doesn't pass h2
    - Client not sending ALPN

Problem: Wrong certificate (SNI not working)

  Diagnosis:
    openssl s_client -connect ip:443 -servername target.domain 2>/dev/null \
      | openssl x509 -noout -subject
    # CN must match target.domain

    # Without SNI — what does server return?
    openssl s_client -connect ip:443 -noservername 2>/dev/null \
      | openssl x509 -noout -subject

  Causes:
    - Wrong server_name in nginx config
    - ssl_certificate in default_server overrides all
    - Client not sending SNI (very old client)

Problem: handshake failure (no shared cipher)

  Diagnosis:
    openssl s_client -connect example.com:443 2>&1 | grep -E "alert|error"
    # alert handshake failure → no common cipher suite

    # See what server supports
    nmap --script ssl-enum-ciphers -p 443 example.com

    # Force an older cipher for diagnosis
    openssl s_client -connect example.com:443 \
      -cipher TLSv1.2+FIPS:kRSA+FIPS:!eNULL:!aNULL

  Causes:
    - Server requires TLS 1.3 only, client doesn't support it
    - Server disabled all cipher suites the client supports
    - Firewall/IDS is interfering with the handshake

Problem: SNI not being sent (some tools)

  curl sends SNI = hostname from URL by default.
  wget — same.
  openssl s_client — needs explicit -servername.
  Old Java apps — may not support SNI (Java 6).

  Check:
    openssl s_client -connect example.com:443   # SNI = none (old behavior)
    openssl s_client -connect example.com:443 -servername example.com  # SNI = set
```

---

## Cheat Sheet

```
Cipher Suite:
  TLS 1.2: Key Exchange + Auth + Cipher + MAC
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  TLS 1.3: Cipher + Hash only (KE and Auth are separate)
    TLS_AES_256_GCM_SHA384

  Good KE:     ECDHE (X25519, P-256), DHE >= 2048 bits
  Bad KE:      RSA (no PFS), anonymous DH
  Good ciphers: AES-GCM, ChaCha20-Poly1305
  Bad ciphers:  RC4, 3DES, DES, NULL, CBC without AEAD
  Forward Secrecy = ECDHE or DHE (required!)

SNI:
  TLS extension, client sends hostname in ClientHello.
  Enables one IP → many TLS certificates.
  PLAINTEXT → ISP/observer sees the domain name.
  ECH = encrypted SNI (TLS 1.3 + DoH).
  nginx: server_name → selected automatically via SNI.

ALPN:
  TLS extension, negotiates the application protocol.
  ClientHello: ["h2", "http/1.1"]
  ServerHello: "h2"
  No extra round-trip.
  "h2" = HTTP/2, "http/1.1" = HTTP/1.1, "h3" = HTTP/3
  "acme-tls/1" = Let's Encrypt TLS-ALPN-01 challenge
  "dot" = DNS over TLS

nginx:
  http2 on;          → ALPN ["h2", "http/1.1"]
  ssl_ciphers ...;   → TLS 1.2 suite list
  ssl_ecdh_curve X25519:prime256v1; → ECDHE curves

Diagnostics:
  openssl s_client -connect host:443 -servername host -alpn h2,http/1.1
  nmap --script ssl-enum-ciphers -p 443 host
  testssl.sh host
  tshark -Y 'tls.handshake.type==1' -e tls.handshake.extensions_server_name
  curl -v --http2 https://host 2>&1 | grep -E "ALPN|HTTP/"
```

---

## References

- [RFC 6066](https://www.rfc-editor.org/rfc/rfc6066) - TLS Extensions (SNI, MaxFragmentLength, ...)
- [RFC 7301](https://www.rfc-editor.org/rfc/rfc7301) - ALPN (Application-Layer Protocol Negotiation)
- [RFC 7465](https://www.rfc-editor.org/rfc/rfc7465) - Prohibiting RC4 Cipher Suites
- [RFC 8701](https://www.rfc-editor.org/rfc/rfc8701) - GREASE for TLS
- [RFC 8737](https://www.rfc-editor.org/rfc/rfc8737) - ACME TLS-ALPN-01 Challenge
- [RFC 9258](https://www.rfc-editor.org/rfc/rfc9258) - ECH (Encrypted Client Hello)
- [IANA TLS Cipher Suites](https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-4)
- [IANA ALPN Protocol IDs](https://www.iana.org/assignments/tls-extensiontype-values/tls-extensiontype-values.xhtml#alpn-protocol-ids)
- [Mozilla SSL Config Generator](https://ssl-config.mozilla.org)
- [Cipher Suite Info](https://ciphersuite.info) - cipher suite database with grades
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/) - configuration checker
- [Cloudflare ECH blog post](https://blog.cloudflare.com/encrypted-client-hello)
