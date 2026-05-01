---
title: "HTTPS - TLS handshake (1.2 и 1.3)"
date: "2026-05-02"
---

TLS (Transport Layer Security) is a cryptographic protocol that provides encryption, authentication, and data integrity on top of TCP. HTTPS = HTTP + TLS. TLS 1.2 is defined in RFC 5246 (2008), TLS 1.3 in RFC 8446 (2018).

Key improvements in TLS 1.3: handshake in 1 RTT instead of 2, weak algorithms removed, 0-RTT for session resumption.

---

## What TLS provides

```
TLS guarantees three properties:

Confidentiality:
  Data is encrypted → an eavesdropper sees only ciphertext.
  AES-GCM, ChaCha20-Poly1305.

Authentication:
  The client is sure it's talking to the real server.
  X.509 certificate + server's digital signature.
  Optional: mutual TLS (mTLS) - server also verifies the client.

Integrity:
  Data has not been modified in transit.
  HMAC or AEAD (Authenticated Encryption with Associated Data).

Without TLS:
  Your ISP, coffee shop Wi-Fi, corporate proxy - see everything.
  MITM attack: substitute the server's response.
  Injection: insert a script into the HTML response.
```

---

## TLS 1.2 Handshake

TLS 1.2 requires **2 RTT** before data transfer begins.

```
Client                                              Server
  │                                                    │
  │──── ClientHello ──────────────────────────────────►│  RTT 1 →
  │     - TLS version (1.2)                            │
  │     - random value (Client Random, 32 bytes)       │
  │     - list of cipher suites                        │
  │     - list of extensions (SNI, ALPN...)            │
  │                                                    │
  │◄─── ServerHello ───────────────────────────────────│
  │     - chosen TLS version                           │
  │     - random value (Server Random, 32 bytes)       │
  │     - chosen cipher suite                          │
  │◄─── Certificate ───────────────────────────────────│
  │     - X.509 certificate chain                      │
  │◄─── ServerKeyExchange (optional) ─────────────────│  ← RTT 1 ←
  │     - DH parameters (if DHE/ECDHE)                 │
  │     - server's signature                           │
  │◄─── ServerHelloDone ───────────────────────────────│
  │                                                    │
  │  Client verifies certificate                       │
  │  Client generates pre-master secret                │
  │                                                    │
  │──── ClientKeyExchange ────────────────────────────►│  RTT 2 →
  │     - encrypted pre-master secret (RSA)            │
  │     - or DH public key (DHE/ECDHE)                 │
  │──── ChangeCipherSpec ─────────────────────────────►│
  │     - "switching to encryption"                    │
  │──── Finished ─────────────────────────────────────►│
  │     - HMAC of entire handshake (encrypted)         │
  │                                                    │
  │◄─── ChangeCipherSpec ──────────────────────────────│
  │◄─── Finished ──────────────────────────────────────│  ← RTT 2 ←
  │                                                    │
  │══════════ Encrypted data (HTTP) ══════════════════►│
  │◄═════════ Encrypted data (HTTP) ══════════════════│
```

### Cipher Suite in TLS 1.2

```
A cipher suite is a set of algorithms for key exchange, encryption, and MAC.
Format: TLS_KeyExchange_Auth_WITH_Cipher_MAC

Example:
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
       │      │        │          │
       │      │        │          └── MAC: HMAC-SHA256
       │      │        └── Cipher: AES-128 in GCM mode
       │      └── Certificate auth: RSA signature
       └── Key exchange: ECDHE (elliptic curve DH)

Recommended TLS 1.2 cipher suites:
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256    <- recommended
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384    <- recommended
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305     <- for mobile
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256  <- with ECDSA certs

Deprecated (do not use!):
  TLS_RSA_WITH_AES_128_CBC_SHA     <- no Forward Secrecy
  TLS_RSA_WITH_RC4_128_MD5         <- RC4 is broken
  TLS_DHE_RSA_WITH_DES_CBC_SHA     <- DES is broken
  *_WITH_NULL_*                    <- no encryption (!)
```

### Key derivation in TLS 1.2

```
Pre-Master Secret → Master Secret → Session Keys

1. Pre-Master Secret:
   - RSA: client generates 48 bytes, encrypts with server's public key
   - DHE/ECDHE: both sides compute a shared secret via DH

2. Master Secret (48 bytes):
   master_secret = PRF(pre_master_secret,
                       "master secret",
                       ClientRandom + ServerRandom)
   PRF = Pseudo-Random Function (HMAC-SHA256 or SHA-384)

3. Key Material (derived from Master Secret):
   key_block = PRF(master_secret,
                   "key expansion",
                   ServerRandom + ClientRandom)

   Split into:
   - client_write_MAC_key   (client HMAC key)
   - server_write_MAC_key   (server HMAC key)
   - client_write_key       (client encryption key)
   - server_write_key       (server encryption key)
   - client_write_IV        (client IV, if needed)
   - server_write_IV        (server IV)
```

### Forward Secrecy

```
Problem without Forward Secrecy (RSA key exchange):
  If an attacker recorded all traffic today,
  then tomorrow obtains the server's private key →
  they can decrypt ALL past sessions.

Forward Secrecy (DHE/ECDHE):
  Fresh temporary DH keys are generated for every session.
  The long-term server key is only used for signing.
  Compromising the long-term key does not expose past sessions.
  Temporary keys are destroyed after the session ends.

  Cipher suites with FS: all with DHE or ECDHE
  Cipher suites without FS: TLS_RSA_* (deprecated)
```

---

## TLS 1.3 Handshake

TLS 1.3 requires **1 RTT** before data (0-RTT for resumption).

```
Client                                              Server
  │                                                    │
  │──── ClientHello ──────────────────────────────────►│  RTT 1 →
  │     - TLS 1.3 (via supported_versions extension)   │
  │     - Client Random                                │
  │     - cipher suites (AEAD only)                    │
  │     - key_share: DH public key                     │
  │       (guess the group - usually X25519)           │
  │     - supported_groups, signature_algorithms       │
  │     - (SNI, ALPN, pre_shared_key...)               │
  │                                                    │
  │◄─── ServerHello ───────────────────────────────────│
  │     - chosen cipher suite                          │
  │     - key_share: server's DH public key            │
  │     [everything below is already encrypted!]       │
  │◄─── EncryptedExtensions ───────────────────────────│
  │◄─── Certificate ───────────────────────────────────│
  │◄─── CertificateVerify ─────────────────────────────│
  │     - signature over entire handshake transcript   │
  │◄─── Finished ──────────────────────────────────────│  ← RTT 1 ←
  │     - HMAC of entire handshake                     │
  │                                                    │
  │  Client verifies certificate and signature         │
  │                                                    │
  │──── Finished ─────────────────────────────────────►│
  │                                                    │
  │══════════ Encrypted data (HTTP) ══════════════════►│
  │◄═════════ Encrypted data (HTTP) ══════════════════│
```

```
Key differences from TLS 1.2:
  1. Server sends Certificate right in RTT 1 (no separate round trip)
  2. Everything after ServerHello is already encrypted (less metadata in plaintext)
  3. DH keys in ClientHello (don't wait for ServerHello to start DH)
  4. No RSA key exchange (only ECDHE/DHE - Forward Secrecy always on)
  5. No ChangeCipherSpec (encryption activates implicitly)
  6. CertificateVerify: signature over the entire handshake transcript
```

### Cipher Suites in TLS 1.3

```
In TLS 1.3 the cipher suite is simplified - just AEAD algorithm + hash.
Key exchange and authentication are specified separately.

TLS 1.3 cipher suites (only 5):
  TLS_AES_128_GCM_SHA256          <- standard
  TLS_AES_256_GCM_SHA384          <- stronger
  TLS_CHACHA20_POLY1305_SHA256    <- for mobile / no AES-NI
  TLS_AES_128_CCM_SHA256          <- IoT
  TLS_AES_128_CCM_8_SHA256        <- IoT (short tag)

Groups for key_share (DH parameters):
  x25519      <- recommended (Curve25519)
  secp256r1   <- NIST P-256
  secp384r1   <- NIST P-384
  x448        <- Curve448 (high security)
  ffdhe2048   <- classic DH 2048-bit
```

### Key derivation in TLS 1.3 (HKDF)

```
TLS 1.3 uses HKDF (HMAC-based Key Derivation Function, RFC 5869).
Keys are derived step by step using the "transcript hash" of the handshake.

Simplified diagram:
  Early Secret  <- from PSK (pre-shared key) or zero
       │
       ▼
  Handshake Secret <- from ECDHE shared secret
       │
       ├── client_handshake_traffic_secret  -> key for encrypting handshake
       └── server_handshake_traffic_secret  -> key for encrypting handshake
       │
       ▼
  Master Secret
       │
       ├── client_application_traffic_secret -> key for application data
       └── server_application_traffic_secret -> key for application data

  Each secret = HKDF(input_material, transcript_hash)
  transcript_hash = hash of all handshake messages up to this point
  → altering any message changes all subsequent keys
```

---

## 0-RTT in TLS 1.3

```
0-RTT (Zero Round Trip Time Resumption) - for reconnections.
Client sends application data together with the first handshake packet.

How it works:
  First connection (normal 1-RTT):
    Server sends NewSessionTicket after Finished.
    Contains PSK (pre-shared key) and ticket.

  Reconnection (0-RTT):
    Client sends ClientHello + early_data simultaneously.
    Early data is encrypted with PSK from the previous session.
    Server decrypts early data immediately, without waiting.

Flow:
  Client                            Server
    │  ClientHello                    │
    │  + pre_shared_key               │
    │  + early_data (HTTP request!)  ──►│  0 RTT!
    │                                 │
    │◄─ ServerHello                   │
    │◄─ EncryptedExtensions           │
    │◄─ Finished                      │
    │──► Finished                     │
    │◄══════════ HTTP response ═══════│
```

```
0-RTT limitations and risks:
  - Replay attacks: early data can be replayed
    Attacker captures the 0-RTT packet → resends it →
    server executes the request twice (e.g. a payment)
  - Do NOT use for non-idempotent requests (POST, PUT, DELETE)
  - Safe only for GET requests (idempotent)
  - Server can reject early data (return early_data_rejected)
  - No Forward Secrecy for 0-RTT data (PSK is long-lived)

Replay protection:
  - Server maintains a list of used PSKs (stateful)
  - Age check (time window limit)
  - Single-use tickets
```

---

## X.509 Certificates

```
A certificate is an electronic document that binds a public key to an identity.
Signed by a Certificate Authority (CA).

Certificate fields:
  Version:            3 (current X.509 version)
  Serial Number:      unique number from the CA
  Signature Algorithm: sha256WithRSAEncryption or ecdsa-with-SHA256
  Issuer:             who issued it (CA)
  Validity:           Not Before / Not After
  Subject:            for whom (CN=example.com, O=Example Inc...)
  Public Key:         RSA or ECDSA public key
  Extensions:
    Subject Alt Name (SAN): list of domains (example.com, www.example.com)
    Key Usage:         allowed key uses (digitalSignature, keyEncipherment)
    Extended Key Usage: serverAuth (TLS server), clientAuth (TLS client)
    Basic Constraints: isCA: false (not a CA certificate)
    CRL Distribution:  where to check revocation (CRL)
    OCSP:              URL for online revocation check
    CT Logs:           Certificate Transparency (SCT)
```

```
# View a site's certificate
openssl s_client -connect google.com:443 -showcerts 2>/dev/null | \
  openssl x509 -noout -text

# Just the key fields
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -subject -issuer -dates -fingerprint

# Check SAN (Subject Alternative Names)
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -ext subjectAltName

# Expiry date
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -enddate
# notAfter=Jun 30 08:00:00 2024 GMT

# View the full certificate chain
openssl s_client -connect google.com:443 -showcerts 2>/dev/null
# Shows all certs from leaf to root
```

### Certificate Chain of Trust

```
Browser/client trusts Root CAs (hardcoded in OS/browser).
Intermediate CA is signed by Root CA.
Leaf certificate (the site) is signed by Intermediate CA.

Root CA (DigiCert, Let's Encrypt ISRG Root, Sectigo...)
  └── Intermediate CA (Let's Encrypt R3)
        └── Leaf Certificate (example.com)

Verification:
  1. Is leaf signed by Intermediate? → verify signature with Intermediate's public key
  2. Is Intermediate signed by Root? → verify signature with Root's public key
  3. Is Root in the trust store? → OK

Why Intermediate CA?
  Root CA key is stored offline (in HSM, physically protected).
  If Intermediate is compromised - only revoke that Intermediate.
  Root CA is never touched.
```

```
# Verify the full chain
curl -v https://example.com 2>&1 | grep -E "subject|issuer|expire"

# Verify chain via openssl
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt \
  -untrusted intermediate.pem leaf.pem

# View the system trust store
ls /etc/ssl/certs/
update-ca-certificates --fresh   # refresh store (Debian/Ubuntu)
```

### OCSP - certificate revocation check

```
OCSP (Online Certificate Status Protocol) - online check whether
a certificate has been revoked.

Request:
  Client → CA's OCSP server: "status of certificate with serial 12345?"
  OCSP server → client: "good" / "revoked" / "unknown"

Problem: client contacts the CA on every TLS connection
  → added latency
  → CA can see all your connections (privacy leak)

OCSP Stapling (solution):
  Server pre-fetches the OCSP response from the CA.
  Staples it to the TLS handshake.
  Client gets the OCSP response as part of the handshake → no separate request.
  OCSP response is signed by CA → can't be forged.

Check OCSP Stapling:
  openssl s_client -connect google.com:443 -status 2>/dev/null | \
    grep -A 10 "OCSP response"
  # OCSP Response Status: successful (0x0)
```

```
# Check revocation via OCSP manually
# 1. Get the OCSP URL from the certificate
openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -ocsp_uri
# http://ocsp.example-ca.com

# 2. Query OCSP
openssl ocsp -issuer intermediate.pem -cert leaf.pem \
  -url http://ocsp.example-ca.com -resp_text

# Nginx OCSP Stapling:
# ssl_stapling on;
# ssl_stapling_verify on;
# ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
# resolver 8.8.8.8;
```

---

## SNI - Server Name Indication

```
Problem: one IP address can host many domains.
Inside a TLS handshake there are no HTTP headers (they're encrypted).
How does the server know which certificate to send?

SNI (RFC 6066):
  Client includes the domain name in ClientHello (before encryption).
  Server reads SNI → selects the right certificate.

  ClientHello:
    server_name: "example.com"  <- SNI

Privacy problem with SNI:
  SNI is visible in plaintext (before encryption starts).
  Your ISP / network observer sees which sites you're connecting to.

Solution: ECH (Encrypted Client Hello, RFC draft):
  SNI is encrypted with the server's public key.
  Outer ClientHello: SNI = public name (e.g. "cloudflare.com")
  Inner ClientHello: real SNI, encrypted
  Cloudflare/Google have supported ECH since 2023-2024.
```

```
# Inspect SNI in a capture
tcpdump -i eth0 -n 'tcp port 443' -w capture.pcap
# In Wireshark: TLSv1.3 → Client Hello → Extension: server_name

# Check ECH support
curl -v https://crypto.cloudflare.com/cdn-cgi/trace 2>&1 | grep -i ech
dig HTTPS cloudflare.com    # ECH public key in HTTPS DNS record

# ECH test
openssl s_client -connect cloudflare.com:443 -ech_config_list ...
```

---

## ALPN - Application-Layer Protocol Negotiation

```
ALPN (RFC 7301) - negotiate the application protocol inside TLS.
Without ALPN you can't distinguish HTTP/1.1, HTTP/2, HTTP/3 on the same port.

ClientHello includes ALPN extension:
  alpn_protocols: ["h2", "http/1.1"]  <- client supports HTTP/2 and HTTP/1.1

ServerHello responds:
  alpn_protocol: "h2"  <- server picked HTTP/2

Common values:
  "http/1.1"   - HTTP/1.1
  "h2"         - HTTP/2
  "h3"         - HTTP/3 (QUIC)
  "acme-tls/1" - Let's Encrypt ACME validation
  "dot"        - DNS over TLS
```

```
# Check ALPN
openssl s_client -connect google.com:443 -alpn h2 2>/dev/null | \
  grep ALPN
# ALPN protocol: h2

# curl shows the protocol
curl -v https://google.com 2>&1 | grep "< HTTP"
# < HTTP/2 200

# Verify HTTP/2 support
curl --http2 -v https://example.com 2>&1 | grep "^*"
```

---

## TLS Extensions

```
TLS Extensions - mechanism for adding new features without
changing the base protocol. Added to ClientHello/ServerHello.

Key extensions:

  server_name (0x0000)     SNI - server name
  max_fragment_length      fragment size limit
  status_request           request OCSP stapling
  supported_groups         supported DH groups (x25519, P-256...)
  signature_algorithms     supported signature algorithms
  use_srtp                 Secure RTP (WebRTC)
  heartbeat                heartbeat (dangerous! CVE-2014-0160 Heartbleed)
  alpn (0x0010)            ALPN - application protocol
  signed_certificate_timestamp  Certificate Transparency
  session_ticket           TLS session tickets (resumption)
  pre_shared_key           PSK for 0-RTT
  early_data               0-RTT early data
  supported_versions       supported TLS versions
  cookie                   cookie for HelloRetryRequest
  psk_key_exchange_modes   PSK modes
  key_share                DH public keys (TLS 1.3)
  renegotiation_info       secure renegotiation
  encrypted_client_hello   ECH (draft)
```

---

## Session Resumption

### Session Tickets (TLS 1.2 and 1.3)

```
After the handshake completes, the server encrypts the session parameters
and sends them to the client as a session ticket (NewSessionTicket).

The ticket encryption key is stored on the server (ticket key).

Reconnection:
  Client sends ticket in ClientHello.
  Server decrypts it → restores session parameters → abbreviated handshake.

Forward Secrecy concern:
  The ticket key is long-lived → compromise exposes all sessions.
  Solution: rotate ticket key every 24-48 hours.
  Nginx: ssl_session_ticket_key (multiple keys can be specified)

Nginx config:
  ssl_session_tickets on;
  ssl_session_ticket_key /etc/nginx/ticket.key;
  ssl_session_timeout 1d;
```

### Session ID (TLS 1.2, legacy)

```
Old mechanism: server stores session parameters keyed by Session ID.
Problem: requires shared state across servers (load balancing).
Session Tickets solve this (client holds the encrypted data).
```

---

## Diagnosing TLS

### Server checks

```
# Full TLS connection info
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null
openssl s_client -connect example.com:443 2>/dev/null

# openssl s_client output includes:
# Protocol: TLSv1.3
# Cipher: TLS_AES_256_GCM_SHA384
# Session-ID: ...
# Resumption PSK: ... (TLS 1.3)

# Check a specific TLS version
openssl s_client -connect example.com:443 -tls1_2 2>/dev/null | grep Protocol
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null | grep Protocol

# Check cipher suite
openssl s_client -connect example.com:443 2>/dev/null | grep Cipher

# List server's supported cipher suites
nmap --script ssl-enum-ciphers -p 443 example.com

# sslyze - comprehensive check
pip install sslyze
sslyze example.com:443
# Checks: TLS versions, cipher suites, certificate, OCSP, HSTS, ...

# testssl.sh - bash script
testssl.sh example.com
testssl.sh --fast example.com   # fast mode
```

### Capturing TLS traffic

```
# Capture with decryption (if SSLKEYLOGFILE is available)
# In browser or app:
export SSLKEYLOGFILE=/tmp/ssl-keys.log
chromium --ssl-key-log-file=/tmp/ssl-keys.log

# In Wireshark: Edit → Preferences → Protocols → TLS
# Pre-Master-Secret log filename: /tmp/ssl-keys.log
# Wireshark will now decrypt TLS traffic

# Capture only TLS handshakes
tcpdump -i eth0 -n 'tcp port 443 and (tcp[tcpflags] & tcp-syn != 0)'

# Extract SNI from traffic
tcpdump -i eth0 -n 'tcp port 443' -A 2>/dev/null | grep -a "\.com\|\.org\|\.net"

# curl with verbose TLS output
curl -v --tlsv1.3 https://example.com 2>&1 | grep -E "SSL|TLS|cipher|protocol"
```

### Certificate checks

```
# Expiry date
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# All certificate fields
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -text | head -50

# CN and SAN only
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -subject -ext subjectAltName

# Check the chain
echo | openssl s_client -connect example.com:443 -showcerts 2>/dev/null | \
  grep -E "subject=|issuer="

# Certificate fingerprint
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -fingerprint -sha256

# Expiry monitoring (for a script)
EXPIRY=$(echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_TS=$(date -d "$EXPIRY" +%s)
NOW_TS=$(date +%s)
DAYS=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
echo "Certificate expires in $DAYS days"
[ $DAYS -lt 14 ] && echo "WARNING: time to renew!"
```

### Common problems

```
Problem: SSL_ERROR_RX_RECORD_TOO_LONG
  Cause: client connected to HTTP port (80) using HTTPS.
  Fix: make sure port is 443, not 80.

Problem: ERR_CERT_AUTHORITY_INVALID
  Cause: certificate signed by unknown CA (self-signed
         or internal CA not added to trust store).
  Fix: curl -k (bypass), or add CA to trust store.
  curl --cacert my-ca.pem https://example.com

Problem: ERR_CERT_DATE_INVALID
  Cause: certificate expired or client/server clock is wrong.
  Fix: renew certificate (Let's Encrypt: certbot renew)
       or sync time (chronyc makestep).

Problem: SSL handshake timeout / connection reset
  Cause: firewall blocks port 443, or MTU issue (PMTUD broken).
  Diagnose:
    telnet example.com 443          # check TCP
    curl -v https://example.com     # verbose output

Problem: ERR_SSL_VERSION_OR_CIPHER_MISMATCH
  Cause: no common cipher suites or TLS versions.
  Diagnose:
    nmap --script ssl-enum-ciphers -p 443 example.com
    openssl s_client -connect example.com:443 -tls1_2

Problem: certificate name mismatch (CN mismatch)
  Cause: SAN does not contain the requested domain.
  Diagnose:
    openssl s_client -connect example.com:443 2>/dev/null | \
      openssl x509 -noout -ext subjectAltName
```

---

## Configuring TLS on a server

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/nginx/ssl/example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    # TLS 1.2 and 1.3 only
    ssl_protocols TLSv1.2 TLSv1.3;

    # Modern cipher suites
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
                ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
                ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;  # in TLS 1.3 client picks

    # DH parameters for DHE (TLS 1.2)
    ssl_dhparam /etc/nginx/dhparam.pem;  # openssl dhparam -out dhparam.pem 2048

    # Session resumption
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;  # disable for Forward Secrecy

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    resolver 8.8.8.8 valid=300s;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Additional security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

```
# Generate DH parameters
openssl dhparam -out /etc/nginx/dhparam.pem 2048

# Validate config
nginx -t

# Reload without downtime
nginx -s reload

# Verify after setup
curl -I https://example.com | grep -E "Strict|X-Frame|Content-Type"
openssl s_client -connect example.com:443 2>/dev/null | grep -E "Protocol|Cipher"
```

### Let's Encrypt / Certbot

```
# Install certbot
apt install certbot python3-certbot-nginx  # Ubuntu/Debian
dnf install certbot python3-certbot-nginx  # Fedora/RHEL

# Obtain certificate (Nginx plugin)
certbot --nginx -d example.com -d www.example.com

# Certonly (certificate only, don't modify config)
certbot certonly --nginx -d example.com

# DNS challenge (for wildcard certificates)
certbot certonly --manual --preferred-challenges dns -d "*.example.com"

# Auto-renewal (cron or systemd timer)
certbot renew --dry-run    # test renewal
# Cron: 0 0,12 * * * certbot renew --quiet

# Check certificate status
certbot certificates
# Found the following certs:
#   Certificate Name: example.com
#   Domains: example.com www.example.com
#   Expiry Date: 2024-07-01 (VALID: 89 days)
#   Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
```

---

## HSTS - HTTP Strict Transport Security

```
HSTS (RFC 6797) - the browser remembers that a site is HTTPS-only.
Protects against SSL stripping attacks.

Header:
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

  max-age:          how long the browser remembers (63072000 = 2 years)
  includeSubDomains: apply to subdomains too
  preload:          submit to browser's built-in HSTS preload list

After receiving HSTS:
  Browser → example.com:80 → redirects to HTTPS locally (without making the request!)
  Attacker cannot intercept the HTTP request → HTTPS downgrade impossible.

HSTS Preload:
  A list of domains is hardcoded in Chrome, Firefox, Safari.
  Even on the first visit - HTTPS only.
  Submit your domain at: hstspreload.org
  CAUTION: hard to undo (takes months to remove from the list).
```

---

## TLS 1.2 vs TLS 1.3 - comparison

```
                    TLS 1.2                  TLS 1.3
                    ──────────               ──────────
RTT before data     2                        1 (0 for resumption)
Forward Secrecy     optional                 mandatory (always ECDHE)
Handshake encryption partial                 full (after ServerHello)
RSA key exchange    allowed                  removed
CBC cipher modes    allowed                  removed
SHA-1 / MD5         allowed                  removed
Renegotiation       present                  removed
Compression         present (CRIME attack!)  removed
Session resumption  Session ID / Tickets     PSK / Tickets
0-RTT               no                       yes (use with care)
Algorithm choice    client/server negotiate  AEAD + hash only
ClientHello size    smaller                  larger (key_share)
```

---

## Cheat sheet

```
TLS provides:
  Confidentiality (encryption)
  Authentication (X.509 certificate)
  Integrity (AEAD / HMAC)

TLS 1.2 handshake: 2 RTT
  ClientHello → ServerHello + Certificate + ServerHelloDone
  ClientKeyExchange + ChangeCipherSpec + Finished
  <- ChangeCipherSpec + Finished

TLS 1.3 handshake: 1 RTT
  ClientHello (+ key_share DH key)
  <- ServerHello (+ key_share) + [encrypted] Certificate + CertificateVerify + Finished
  -> Finished
  [data immediately]

TLS 1.3 0-RTT: 0 RTT (with PSK, idempotent requests only)

Cipher suite:
  TLS 1.2: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS 1.3: TLS_AES_128_GCM_SHA256 (AEAD only)

Key concepts:
  Forward Secrecy   - key compromise doesn't expose past sessions
  SNI               - domain name in ClientHello (before encryption)
  ALPN              - protocol negotiation (h2, http/1.1, dot)
  OCSP Stapling     - revocation check without contacting CA directly
  HSTS              - browser remembers HTTPS-only
  ECH               - encrypted SNI (draft)
  0-RTT             - data in first packet (replay risk)

Diagnostics:
  openssl s_client -connect host:443           - TLS connection
  openssl s_client -connect host:443 -tls1_3   - TLS 1.3 only
  openssl x509 -noout -text -in cert.pem       - view certificate
  nmap --script ssl-enum-ciphers -p 443 host   - cipher suites
  sslyze host:443                              - full check
  testssl.sh host                              - bash check
  certbot renew --dry-run                      - test renewal

Problems:
  TLS SERVFAIL     -> use nmap or sslyze to diagnose cipher/version
  Cert expired     -> certbot renew
  Cert mismatch    -> check SAN in certificate
  Handshake fail   -> check TLS versions and cipher suites
```

---

## References

- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2
- [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797) - HSTS
- [RFC 7301](https://www.rfc-editor.org/rfc/rfc7301) - ALPN
- [RFC 6066](https://www.rfc-editor.org/rfc/rfc6066) - SNI and other TLS Extensions
- [RFC 6960](https://www.rfc-editor.org/rfc/rfc6960) - OCSP
- [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869) - HKDF (used in TLS 1.3)
- [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) - online TLS configuration grader
- [hstspreload.org](https://hstspreload.org) - HSTS preload list submission
- [testssl.sh](https://testssl.sh) - bash TLS testing tool
- [The Illustrated TLS 1.3 Connection](https://tls13.xargs.org) - byte-by-byte TLS 1.3 breakdown
