---
title: "TLS - Certificates, PKI, Chain of Trust"
date: "2026-05-03"
---

TLS (Transport Layer Security) is a cryptographic protocol for securing connections. It is the successor to SSL (Secure Sockets Layer). TLS provides confidentiality, integrity, and authentication. TLS 1.3 (RFC 8446, 2018) is the current version. TLS 1.2 (RFC 5246, 2008) is still widely deployed. SSL and TLS 1.0/1.1 are considered deprecated and insecure.

---

## TLS Basics

### What TLS Provides

```
Confidentiality:
  Data is encrypted. An interceptor sees ciphertext,
  cannot read the contents.

Integrity:
  MAC (Message Authentication Code) protects against modification.
  If a packet is altered in transit → detected, connection terminated.

Authentication:
  A certificate proves: the server is really who it claims to be.
  Client checks: "example.com? Yes, this is genuinely example.com."
  Optionally: mutual authentication (mTLS) - server verifies client too.

Non-repudiation:
  With mutual authentication - parties cannot deny their participation.
```

### TLS in the Protocol Stack

```
Application (HTTP, SMTP, FTP, LDAP...)
       ↕
     TLS
       ↕
     TCP
       ↕
     IP

TLS sits above TCP, below the application layer.
HTTPS = HTTP + TLS.
SMTPS = SMTP + TLS.
LDAPS = LDAP + TLS.

QUIC = TLS 1.3 built into the transport layer (UDP).
```

### TLS Versions

```
Version   RFC         Year  Status
──────────────────────────────────────────────────────
SSL 2.0   -           1995  PROHIBITED (RFC 6176)
SSL 3.0   RFC 6101    1996  PROHIBITED (RFC 7568, POODLE attack)
TLS 1.0   RFC 2246    1999  DEPRECATED (RFC 8996, 2021)
TLS 1.1   RFC 4346    2006  DEPRECATED (RFC 8996, 2021)
TLS 1.2   RFC 5246    2008  ACTIVE     (widespread use)
TLS 1.3   RFC 8446    2018  ACTIVE     (recommended)

Key improvements in TLS 1.3:
  - Removed obsolete algorithms (RSA key exchange, MD5, SHA-1, DES, RC4)
  - 1-RTT handshake (vs 2-RTT in TLS 1.2)
  - 0-RTT for session resumption (with restrictions)
  - Forward Secrecy mandatory (only ECDHE/DHE)
  - Certificate frame is encrypted (no domain leak via cert)
  - Simplified cipher suites (no combinatorial explosion)
```

---

## TLS Handshake

### TLS 1.2 Handshake (2-RTT)

```
Client                                           Server
  │── ClientHello ────────────────────────────────►│
  │   TLS version, random (client_random)          │
  │   Supported cipher suites                      │
  │   Extensions (SNI, ALPN, ...)                  │
  │                                                │
  │◄── ServerHello ─────────────────────────────────│
  │   Chosen TLS version                           │
  │   server_random                                │
  │   Chosen cipher suite                          │
  │◄── Certificate ─────────────────────────────────│
  │   Server certificate (and chain)               │
  │◄── ServerKeyExchange ───────────────────────────│
  │   Key exchange parameters (if needed)          │
  │◄── ServerHelloDone ─────────────────────────────│
  │                                                │
  │   [Client verifies the certificate]            │
  │                                                │
  │── ClientKeyExchange ───────────────────────────►│
  │   Pre-master secret (encrypted with public key │
  │   or DH/ECDH parameters)                       │
  │── ChangeCipherSpec ────────────────────────────►│
  │── Finished ────────────────────────────────────►│
  │   Hash of entire handshake (encrypted)         │
  │                                                │
  │◄── ChangeCipherSpec ────────────────────────────│
  │◄── Finished ────────────────────────────────────│
  │                                                │
  │══ Encrypted application data ══════════════════│

Total: 2 RTT before data (+ 1 RTT TCP handshake = 3 RTT).
```

### TLS 1.3 Handshake (1-RTT)

```
Client                                           Server
  │── ClientHello ────────────────────────────────►│
  │   + key_share (ECDH public keys)               │
  │   + supported_versions: TLS 1.3                │
  │   + SNI, ALPN, ...                             │
  │                                                │
  │◄── ServerHello ─────────────────────────────────│
  │   + key_share (server ECDH public key)         │
  │◄── {EncryptedExtensions} ───────────────────────│  } all encrypted
  │◄── {Certificate} ───────────────────────────────│  } from ServerHello on!
  │◄── {CertificateVerify} ─────────────────────────│
  │◄── {Finished} ──────────────────────────────────│
  │                                                │
  │   [Client verifies the certificate]            │
  │                                                │
  │── {Finished} ──────────────────────────────────►│
  │══ {Encrypted data} ═════════════════════════════│

Total: 1 RTT before data (+ 1 RTT TCP = 2 RTT).

Key differences from TLS 1.2:
  - Client already sends ECDH keys in ClientHello (no waiting for ServerHello)
  - Server computes shared secret immediately after ClientHello
  - Certificate is encrypted (no domain name leak via cert)
  - No ChangeCipherSpec (simplified protocol)
  - Forward Secrecy guaranteed (only ECDHE)
```

### TLS 1.3 - 0-RTT (Early Data)

```
When reconnecting to a known server:

Client                                           Server
  │── ClientHello ────────────────────────────────►│
  │   + early_data (PSK ticket from prev session)  │
  │   + {Early Data (HTTP request)} ───────────────►│  data immediately!
  │                                                │
  │◄── ServerHello + ... + Finished ────────────────│
  │◄── {Response to early data} ────────────────────│

0-RTT restrictions:
  - Vulnerable to replay attacks (same request can be replayed)
  - Use only for idempotent requests (GET)
  - Server must protect against replay (anti-replay tokens)
  - PSK ticket has a limited lifetime
```

### Cipher Suites

```
A cipher suite defines the set of algorithms for a TLS session.

TLS 1.2 format:
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  ↑   ↑      ↑   ↑    ↑   ↑   ↑
  │   │      │   │    │   │   └─ HMAC hash (SHA-384)
  │   │      │   │    │   └───── Cipher mode (GCM)
  │   │      │   │    └───────── Key size (256 bits)
  │   │      │   └────────────── Bulk cipher (AES)
  │   │      └────────────────── Server key auth algorithm (RSA)
  │   └───────────────────────── Key exchange algorithm (ECDHE)
  └───────────────────────────── Protocol (TLS)

TLS 1.3 format (simplified - no key exchange or auth in suite):
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256

Key exchange algorithms:
  ECDHE  - Elliptic Curve Diffie-Hellman Ephemeral (modern)
  DHE    - Diffie-Hellman Ephemeral (older, slower)
  RSA    - direct RSA encryption (PROHIBITED in TLS 1.3, no FS)

Forward Secrecy (Perfect Forward Secrecy, PFS):
  Each session uses ephemeral (one-time) keys.
  Compromising the server's long-term key doesn't expose old sessions.
  Only ECDHE and DHE provide PFS.
  RSA key exchange does NOT provide PFS.

Recommended cipher suites (TLS 1.2):
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256

Deprecated (disable!):
  TLS_RSA_WITH_AES_*             (no PFS)
  TLS_*_WITH_3DES_*              (SWEET32 attack)
  TLS_*_WITH_RC4_*               (RC4 is broken)
  *_MD5                          (MD5 is broken)
```

---

## X.509 Certificates

### Certificate Structure

```
An X.509 certificate is an ASN.1/DER binary format.
PEM = Base64(DER) wrapped with -----BEGIN CERTIFICATE-----.

Certificate fields:
  Version:            3 (X.509 v3)
  Serial Number:      unique number at this CA (hex)
  Signature Algorithm: CA's signing algorithm (sha256WithRSAEncryption)
  Issuer:             who issued the cert (DN = Distinguished Name)
  Validity:           Not Before / Not After (validity period)
  Subject:            who the cert is issued to (DN)
  Public Key:         public key and algorithm (RSA, ECDSA, ...)
  Extensions:         X.509 v3 extensions

Distinguished Name (DN):
  CN  = Common Name      (example.com or "Let's Encrypt R3")
  O   = Organization     (Example Corp)
  OU  = Organizational Unit (IT Department)
  C   = Country          (US, DE, GB)
  ST  = State/Province   (California)
  L   = Locality/City    (San Francisco)
  Email = emailAddress

Subject Alternative Name (SAN, extension):
  DNS: www.example.com
  DNS: example.com
  DNS: *.example.com      (wildcard)
  IP:  93.184.216.34
  Email: admin@example.com
  URI:  https://example.com

  Modern browsers use SAN; CN for domains is deprecated.
  Wildcard: *.example.com covers sub.example.com
            BUT NOT sub.sub.example.com (one level only).
```

### X.509 v3 Extensions

```
Basic Constraints:
  CA: TRUE   → this is a CA certificate, can sign others
  CA: FALSE  → this is a leaf (end-entity) certificate
  pathLenConstraint: N  → maximum chain depth

Key Usage (critical):
  digitalSignature  - sign data
  keyEncipherment   - encrypt keys (RSA)
  keyAgreement      - key agreement (DH, ECDH)
  keyCertSign       - sign certificates (CA only)
  cRLSign           - sign CRLs (CA only)

Extended Key Usage (EKU):
  serverAuth    (1.3.6.1.5.5.7.3.1) - TLS server
  clientAuth    (1.3.6.1.5.5.7.3.2) - TLS client
  codeSigning   (1.3.6.1.5.5.7.3.3) - code signing
  emailProtection (1.3.6.1.5.5.7.3.4) - S/MIME

Subject Key Identifier (SKI):
  Hash of the subject's public key.
  Used to identify the key.

Authority Key Identifier (AKI):
  Hash of the issuer (CA) public key.
  Links the certificate to the CA's key.

CRL Distribution Points:
  URL to download the Certificate Revocation List.
  http://crl.example.com/ca.crl

Authority Information Access (AIA):
  OCSP responder URL: http://ocsp.example.com
  CA Issuers URL: http://ca.example.com/ca.crt
  (for downloading the intermediate certificate)

Certificate Policies:
  OID of the policy under which the cert was issued.
  2.23.140.1.2.1 = Domain Validated (DV)
  2.23.140.1.2.2 = Organization Validated (OV)
  2.23.140.1.2.3 = Extended Validation (EV)

SCT - Signed Certificate Timestamp (Certificate Transparency):
  Proof that the certificate was logged in a CT log.
  Chrome has required 2+ SCTs since 2018.
```

### Certificate Types by Validation Level

```
DV - Domain Validated:
  CA verifies only domain ownership.
  Verification methods:
    - HTTP-01: file at http://example.com/.well-known/acme-challenge/TOKEN
    - DNS-01: TXT record at _acme-challenge.example.com
    - TLS-ALPN-01: special TLS cert on port 443
  Fast (minutes). Free (Let's Encrypt).
  Browser shows a padlock, no organization name.

OV - Organization Validated:
  CA verifies domain + organization existence + right to use domain.
  Verified via government registries, phone.
  Takes days. Paid.
  Browser: padlock (like DV). Organization data inside the cert.

EV - Extended Validation:
  Strict organization verification (legal entity, address, phone).
  CA/Browser Forum standard.
  Takes weeks. Expensive.
  Old browsers: green address bar with organization name.
  Modern browsers (2019+): visual distinction from OV removed.
  Relevant for: banks, finance, government sites.

Wildcard (*.example.com):
  Covers one level of subdomains.
  Can be DV, OV, or EV.
  One cert for all subdomains.
  Downside: compromise exposes all subdomains.

Multi-SAN (Subject Alternative Names):
  One certificate for multiple domains.
  Example: example.com, www.example.com, api.example.com.
  Let's Encrypt: up to 100 SANs per certificate.
```

### Certificate File Formats

```
PEM (Privacy Enhanced Mail):
  Base64-encoded DER, wrapped with -----BEGIN/END-----.
  Extensions: .pem, .crt, .cer, .key
  Can contain: certificate, key, chain.
  -----BEGIN CERTIFICATE-----
  MIIDazCCAlOgAwIBAgIUExam...
  -----END CERTIFICATE-----

DER (Distinguished Encoding Rules):
  Binary ASN.1 format.
  Extensions: .der, .cer
  Not human-readable.
  Used in Java, Android.

PKCS#12 / PFX:
  Container for certificate + private key + chain.
  Extensions: .p12, .pfx
  Password-protected.
  Used in Windows, browsers.
  Export from Windows Certificate Store.

PKCS#7 / P7B:
  Container for certificate + chain (no key).
  Extensions: .p7b, .p7c
  Used in Windows for importing chains.

JKS (Java KeyStore):
  Java format.
  Extension: .jks
  Being replaced by PKCS#12 in newer Java.

Format conversion:
  # PEM → DER
  openssl x509 -in cert.pem -out cert.der -outform DER

  # DER → PEM
  openssl x509 -in cert.der -out cert.pem -inform DER

  # PEM → PKCS#12 (with key and chain)
  openssl pkcs12 -export -out cert.p12 \
    -inkey key.pem -in cert.pem -certfile chain.pem

  # PKCS#12 → PEM
  openssl pkcs12 -in cert.p12 -out cert.pem -nodes

  # View PEM certificate
  openssl x509 -in cert.pem -text -noout

  # View PKCS#12
  openssl pkcs12 -in cert.p12 -info
```

---

## PKI - Public Key Infrastructure

### PKI Components

```
PKI is a system for managing digital certificates.

Components:
  CA (Certificate Authority) - issues and signs certificates
  RA (Registration Authority) - handles identity verification
  CRL (Certificate Revocation List) - list of revoked certs
  OCSP (Online Certificate Status Protocol) - status check
  Certificate Repository - certificate storage

CA responsibilities:
  - Verifying applicant identity
  - Signing certificates (with its own private key)
  - Publishing CRLs
  - Running an OCSP responder

CA types:
  Root CA:
    Top of the hierarchy.
    Self-signed certificate.
    Stored in the browser/OS Trust Store.
    Private key in HSM, kept offline (air-gapped).
    Never directly issues certificates to end users.

  Intermediate CA (Subordinate CA):
    Signed by the Root CA.
    Issues certificates to end users.
    Online (but key protected by HSM).
    Multiple Intermediate CAs = risk isolation.

  Leaf Certificate (End Entity):
    The end certificate (your site).
    Signed by an Intermediate CA.
    CA: FALSE in Basic Constraints.
```

### Chain of Trust

```
The full certificate chain:

  Root CA (self-signed, in Trust Store)
    └── Intermediate CA (signed by Root CA)
          └── Leaf Certificate (signed by Intermediate CA)
                └── your website

Example (Let's Encrypt):
  ISRG Root X1  (Root CA, self-signed)
    └── Let's Encrypt R11 (Intermediate CA)
          └── *.example.com (Leaf, your certificate)

Example (DigiCert):
  DigiCert Global Root CA
    └── DigiCert SHA2 Secure Server CA
          └── www.example.com

How the browser verifies the chain:
  1. Receives leaf certificate from server.
  2. Checks signature: who signed this certificate?
  3. Finds the Intermediate CA (in server's response or via AIA).
  4. Checks Intermediate signature: who signed it?
  5. Reaches Root CA → looks it up in Trust Store.
  6. If Root is found and everything is valid → TRUSTED.

You must always send the full chain!
  Server must send: leaf + all intermediate CAs.
  Root CA is NOT included (it's in the client's Trust Store).
  Incomplete chain → browser can't build the path → error.
```

### Trust Store

```
Trust Store - storage of trusted root CAs.
Browser/OS/application validates certificates against the Trust Store.

System Trust Stores:
  Windows:  Computer Management → Certificates
            certmgr.msc (current user only)
            certlm.msc  (computer)

  macOS:    Keychain Access → System Root Certificates
            /System/Library/Keychains/SystemRootCertificates.keychain

  Linux:    /etc/ssl/certs/ (Ubuntu/Debian)
            /etc/pki/ca-trust/ (RHEL/CentOS)
            update-ca-certificates (Debian/Ubuntu)
            update-ca-trust (RHEL/CentOS)

  Java:     $JAVA_HOME/lib/security/cacerts (JKS)
            keytool -list -keystore cacerts

Browser Trust Stores:
  Firefox:  its own Trust Store (Mozilla NSS), NOT system-level
            about:preferences#privacy → View Certificates
  Chrome:   uses the system Trust Store (Windows/macOS)
            On Linux: uses NSS (certutil)

Add a root CA (for corporate PKI):
  # Ubuntu/Debian
  cp my-ca.crt /usr/local/share/ca-certificates/
  update-ca-certificates

  # RHEL/CentOS
  cp my-ca.crt /etc/pki/ca-trust/source/anchors/
  update-ca-trust extract

  # macOS
  sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain my-ca.crt

  # Windows (PowerShell)
  Import-Certificate -FilePath "my-ca.crt" \
    -CertStoreLocation Cert:\LocalMachine\Root
```

---

## Certificate Revocation

### CRL - Certificate Revocation List

```
CRL - a list of revoked certificates, signed by the CA.
Contains Serial Numbers of revoked certs + reason + date.

Revocation reason codes:
  0 - unspecified
  1 - keyCompromise (key was compromised)
  2 - cACompromise (CA was compromised)
  3 - affiliationChanged (org change)
  4 - superseded (replaced by a new certificate)
  5 - cessationOfOperation (business closed)
  6 - certificateHold (temporary suspension)
  9 - privilegeWithdrawn

CRL format:
  Version, Issuer, issue date, next update date,
  list: [Serial, revocation date, reason code]
  CA signature.

CRL problems:
  - Large size (megabytes for major CAs)
  - Client must download the CRL (HTTP request per connection)
  - Cached until nextUpdate (up to 24 hours)
  - Slow to update

Manual CRL check:
  openssl crl -in ca.crl -text -noout   (view)
  openssl verify -crl_check -CRLfile ca.crl cert.pem
```

### OCSP - Online Certificate Status Protocol

```
OCSP (RFC 6960) - real-time certificate status check.
More timely than CRL.

OCSP process:
  Client                          OCSP Responder
    │── OCSP Request ─────────────►│
    │   Certificate Serial Number  │
    │   Issuer DN + Issuer Key Hash│
    │                              │
    │◄── OCSP Response ────────────│
    │   good / revoked / unknown   │
    │   Time of response           │
    │   Responder signature        │

OCSP Response statuses:
  good    - certificate is valid
  revoked - revoked (with reason and date)
  unknown - CA doesn't know this certificate

OCSP problems:
  - Privacy: CA learns which sites you visit
  - Performance: extra HTTP request on every connection
  - Availability: if OCSP server is down → soft-fail (skip check)

Manual OCSP check:
  openssl ocsp \
    -issuer intermediate.pem \
    -cert cert.pem \
    -url http://ocsp.example.com \
    -text
```

### OCSP Stapling

```
OCSP Stapling solves the problems with regular OCSP:

Without stapling:
  Browser → CA's OCSP server (on every connection)
  Privacy violation, slow.

With OCSP Stapling:
  Server periodically fetches its own OCSP response from the CA.
  Caches the signed OCSP response (typically 24-48 hours).
  During TLS handshake - "staples" the OCSP response to the Certificate.
  Browser does not contact the CA directly.

Benefits:
  - No privacy issues (browser doesn't know about OCSP)
  - Faster (no extra round-trip)
  - Works even if OCSP server is down (cached response)

OCSP Must-Staple:
  Certificate extension (RFC 7633).
  Tells the browser: "This certificate MUST always have an OCSP Staple."
  If staple is missing → browser refuses the connection.
  Protection against attacks that disable OCSP.

nginx configuration:
  ssl_stapling on;
  ssl_stapling_verify on;
  resolver 8.8.8.8 8.8.4.4 valid=300s;   (for OCSP requests)
  ssl_trusted_certificate /etc/ssl/chain.pem;  (full chain)

Apache configuration:
  SSLUseStapling On
  SSLStaplingCache "shmcb:logs/stapling-cache(150000)"

Verify stapling:
  openssl s_client -connect example.com:443 -status 2>/dev/null \
    | grep -A 10 "OCSP Response"
  # OCSP Response Status: successful (0x0)
  # Response verify OK
```

---

## Certificate Transparency (CT)

```
Certificate Transparency (RFC 9162) - public logs of all issued certificates.
Launched by Google in 2013 after the DigiNotar breach.

Goal:
  Every certificate must be in a public CT log.
  Domain owners can check: has a fraudulent certificate been issued?
  A CA cannot secretly issue a certificate for example.com.

Process:
  1. CA issues a certificate.
  2. CA submits the certificate to a CT log.
  3. CT log returns an SCT (Signed Certificate Timestamp).
  4. SCT is embedded in the certificate or sent via TLS.
  5. Browser checks SCT (Chrome requires 2+ SCTs since 2018).

SCT is stored in:
  - Certificate extension (embedded SCT)
  - TLS extension (in handshake)
  - OCSP stapling response

Public CT logs:
  Google Argon, Google Xenon, DigiCert Yeti, Sectigo Mammoth, ...
  crt.sh - search CT logs (convenient UI)
  Implemented as a Merkle tree (append-only, provably consistent).

Monitoring CT:
  # All certificates for a domain (via crt.sh API)
  curl "https://crt.sh/?q=%.example.com&output=json" | jq '.[].name_value'

  # Monitoring tools
  certspotter (SSLMate) - alerts for new certificates
  Facebook CT Monitor - monitor.cert.transparency.dev
```

---

## Creating and Managing Certificates

### Key and CSR Generation

```bash
# Generate RSA key (2048 or 4096 bits)
openssl genrsa -out private.key 4096
openssl genrsa -aes256 -out private.key 4096  # password-protected

# Generate ECDSA key (recommended)
openssl ecparam -name prime256v1 -genkey -noout -out private.key  # P-256
openssl ecparam -name secp384r1  -genkey -noout -out private.key  # P-384

# CSR (Certificate Signing Request)
openssl req -new -key private.key -out request.csr \
  -subj "/C=US/ST=California/L=San Francisco/O=Example Corp/CN=example.com"

# CSR with SAN extensions
cat > san.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = California
O = Example Corp
CN = example.com

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = example.com
DNS.2 = www.example.com
DNS.3 = api.example.com
IP.1  = 93.184.216.34
EOF

openssl req -new -key private.key -out request.csr -config san.conf

# View CSR
openssl req -in request.csr -text -noout
openssl req -in request.csr -verify   (verify signature)

# Self-signed certificate (for testing)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### Let's Encrypt / ACME

```bash
# certbot - most popular ACME client
apt install certbot python3-certbot-nginx

# Get a certificate (nginx)
certbot --nginx -d example.com -d www.example.com

# Get a certificate (standalone, stop nginx first)
certbot certonly --standalone -d example.com

# DNS-01 challenge (for wildcard)
certbot certonly --manual --preferred-challenges dns \
  -d "*.example.com" -d example.com

# Auto-renewal (cron or systemd timer)
certbot renew --dry-run   (test)
certbot renew             (real renewal)

# Let's Encrypt file locations:
/etc/letsencrypt/live/example.com/
  cert.pem       - certificate (leaf)
  chain.pem      - intermediate CA
  fullchain.pem  - cert.pem + chain.pem (for nginx/apache)
  privkey.pem    - private key

# acme.sh - alternative client
curl https://get.acme.sh | sh
acme.sh --issue -d example.com --webroot /var/www/html
acme.sh --issue -d example.com --nginx
acme.sh --issue -d "*.example.com" --dns dns_cf  # Cloudflare DNS
```

### Viewing and Verifying Certificates

```bash
# View a certificate
openssl x509 -in cert.pem -text -noout
openssl x509 -in cert.pem -noout -subject -issuer -dates -fingerprint

# Verify chain
openssl verify -CAfile root.pem -untrusted intermediate.pem cert.pem

# Check a live server certificate
openssl s_client -connect example.com:443 -servername example.com

# Show full chain
openssl s_client -connect example.com:443 -showcerts 2>/dev/null

# Verify key matches certificate
openssl x509 -in cert.pem -noout -modulus | md5sum
openssl rsa -in private.key -noout -modulus | md5sum
# Hashes must match!

# Certificate expiry
openssl x509 -in cert.pem -noout -enddate
openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# SSL Labs test (online)
# https://www.ssllabs.com/ssltest/

# testssl.sh - local testing
bash testssl.sh example.com
bash testssl.sh --severity HIGH example.com   (HIGH and above only)

# Quick cipher suite check
nmap --script ssl-enum-ciphers -p 443 example.com

# Check HSTS
curl -sI https://example.com | grep -i strict-transport

# Check Certificate Transparency
curl "https://crt.sh/?q=example.com&output=json" | jq '.[0]'
```

### Corporate PKI (Internal CA)

```bash
# Create root CA
mkdir -p /ca/root/{certs,crl,newcerts,private}
chmod 700 /ca/root/private
touch /ca/root/index.txt
echo 1000 > /ca/root/serial

# Root CA key (password-protected!)
openssl genrsa -aes256 -out /ca/root/private/ca.key 4096
chmod 400 /ca/root/private/ca.key

# Self-signed Root CA certificate
openssl req -config /ca/root/openssl.conf \
  -key /ca/root/private/ca.key \
  -new -x509 -days 7300 -sha256 \
  -extensions v3_ca \
  -out /ca/root/certs/ca.crt

# Create Intermediate CA
openssl genrsa -aes256 -out /ca/intermediate/private/intermediate.key 4096
openssl req -config /ca/intermediate/openssl.conf \
  -key /ca/intermediate/private/intermediate.key \
  -new -sha256 -out /ca/intermediate/csr/intermediate.csr

# Sign Intermediate CA with Root CA
openssl ca -config /ca/root/openssl.conf \
  -extensions v3_intermediate_ca \
  -days 3650 -notext -md sha256 \
  -in /ca/intermediate/csr/intermediate.csr \
  -out /ca/intermediate/certs/intermediate.crt

# Sign a server certificate
openssl ca -config /ca/intermediate/openssl.conf \
  -extensions server_cert \
  -days 365 -notext -md sha256 \
  -in request.csr \
  -out server.crt

# Build certificate bundle (chain for nginx)
cat server.crt /ca/intermediate/certs/intermediate.crt > fullchain.crt
```

---

## TLS Security

### Common Vulnerabilities and Attacks

```
POODLE (CVE-2014-3566):
  Attack against SSL 3.0 (padding oracle for CBC).
  Fix: disable SSL 3.0 entirely.

BEAST (CVE-2011-3389):
  Attack against CBC in TLS 1.0.
  Fix: TLS 1.1+ or prefer RC4 (RC4 is also broken, use 1.1+).

CRIME/BREACH:
  Attack against TLS compression / HTTP compression.
  CRIME: disable TLS compression.
  BREACH: disable HTTP compression for secret data.

Heartbleed (CVE-2014-0160):
  Vulnerability in OpenSSL HeartBeat extension.
  Server memory leak (including private key).
  Fix: update OpenSSL, reissue certificates.

FREAK (CVE-2015-0204):
  Downgrade to export-grade (40-bit) keys.
  Fix: disable export cipher suites.

Logjam (CVE-2015-4000):
  Attack against DHE with 512-bit keys.
  Fix: use DH parameters >= 2048 bits or ECDHE.

Sweet32 (CVE-2016-2183):
  64-bit block ciphers (3DES) - birthday attack.
  Fix: disable 3DES.

ROBOT (CVE-2017-13099):
  Return Of Bleichenbacher's Oracle Threat.
  RSA PKCS#1 v1.5 padding oracle.
  Fix: don't use RSA key exchange (always use ECDHE).

Downgrade attacks:
  Attacker forces use of a weaker protocol/cipher.
  Protection: TLS_FALLBACK_SCSV, disable old versions.
```

### Recommended TLS Configuration

```nginx
# nginx - modern secure configuration

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;   # TLS 1.3: client chooses

# TLS 1.2 ciphers (ECDHE only, AEAD only)
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
            ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
            ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

# DH parameters for DHE (if needed)
ssl_dhparam /etc/ssl/dhparam4096.pem;  # openssl dhparam -out dhparam4096.pem 4096

# ECDHE curves
ssl_ecdh_curve X25519:prime256v1:secp384r1;

# Session cache
ssl_session_cache shared:SSL:50m;
ssl_session_timeout 1d;
ssl_session_tickets off;   # disable for PFS (debated)

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/ssl/fullchain.pem;
resolver 1.1.1.1 8.8.8.8 valid=300s;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

```bash
# Generate strong DH parameters
openssl dhparam -out /etc/ssl/dhparam4096.pem 4096

# Check configuration (Mozilla Observatory)
# https://observatory.mozilla.org

# testssl.sh - full check
bash testssl.sh --full example.com

# Test a cipher suite
openssl s_client -connect example.com:443 \
  -cipher 'ECDHE-RSA-AES256-GCM-SHA384' 2>/dev/null | grep Cipher
```

---

## TLS Diagnostics

```bash
# Basic connection
openssl s_client -connect example.com:443

# With SNI (for virtual hosts)
openssl s_client -connect example.com:443 -servername example.com

# Show full chain
openssl s_client -connect example.com:443 -showcerts 2>/dev/null \
  | openssl x509 -noout -text

# Test a specific TLS version
openssl s_client -connect example.com:443 -tls1_2
openssl s_client -connect example.com:443 -tls1_3

# Test a cipher suite
openssl s_client -connect example.com:443 \
  -cipher ECDHE-RSA-AES256-GCM-SHA384 2>/dev/null

# Check ALPN (HTTP/2)
openssl s_client -connect example.com:443 -alpn h2,http/1.1 \
  2>/dev/null | grep ALPN

# Certificate expiry date
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# Certificate fingerprint
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256

# Expiry monitoring script
DAYS_WARN=30
DOMAIN=example.com
EXPIRY=$(echo | openssl s_client -connect $DOMAIN:443 2>/dev/null \
  | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))
echo "$DOMAIN: $DAYS_LEFT days until expiry"
if [ $DAYS_LEFT -lt $DAYS_WARN ]; then
    echo "WARNING: Certificate expires soon!"
fi

# curl with TLS inspection
curl -v https://example.com 2>&1 | grep -E "TLS|SSL|cipher|certificate"

# Test mTLS (client certificate)
curl --cert client.pem --key client.key https://api.example.com
openssl s_client -connect api.example.com:443 \
  -cert client.pem -key client.key
```

---

## Cheat Sheet

```
TLS versions:
  TLS 1.0/1.1 → DEPRECATED (disable!)
  TLS 1.2     → Active (keep support)
  TLS 1.3     → Recommended (enable first)

Handshake:
  TLS 1.2: 2-RTT (+ 1-RTT TCP = 3 RTT before data)
  TLS 1.3: 1-RTT (+ 1-RTT TCP = 2 RTT)
  TLS 1.3 0-RTT: 0 RTT (resume only, GET requests only!)

Certificates:
  DV - domain validation (fast, free)
  OV - organization validation (days, paid)
  EV - extended validation (weeks, expensive)
  Wildcard: *.example.com (one level only)

Chain of trust:
  Root CA (Trust Store) → Intermediate CA → Leaf cert
  Server sends: leaf + intermediate (Root NOT needed)
  Incomplete chain → error on client

Revocation:
  CRL - list (slow, cached)
  OCSP - real-time check (fast, privacy issue)
  OCSP Stapling - server caches OCSP response (best option)

Files:
  cert.pem      - certificate
  chain.pem     - intermediate CA
  fullchain.pem - cert + chain (for nginx)
  privkey.pem   - private key
  .p12/.pfx     - key + cert + chain (Windows)

Commands:
  openssl x509 -in cert.pem -text -noout       view certificate
  openssl s_client -connect host:443            connect
  openssl verify -CAfile ca.pem cert.pem        verify chain
  openssl x509 -in cert.pem -noout -dates       validity dates
  certbot --nginx -d example.com                Let's Encrypt
  testssl.sh example.com                        full TLS test

nginx:
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers ECDHE-...:...;
  ssl_stapling on;
  add_header HSTS ...;

Security:
  Disable: SSL 3.0, TLS 1.0, TLS 1.1
  Disable: RC4, 3DES, DES, MD5, SHA-1 (for signing)
  Use: ECDHE (Forward Secrecy)
  Enable: OCSP Stapling, HSTS, CT
```

---

## References

- [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2
- [RFC 8996](https://www.rfc-editor.org/rfc/rfc8996) - Deprecating TLS 1.0 and TLS 1.1
- [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280) - X.509 PKI Certificates and CRL
- [RFC 6960](https://www.rfc-editor.org/rfc/rfc6960) - OCSP
- [RFC 7633](https://www.rfc-editor.org/rfc/rfc7633) - OCSP Must-Staple
- [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162) - Certificate Transparency
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org) - ready-to-use configs
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/) - online analysis
- [crt.sh](https://crt.sh) - search CT logs
- [testssl.sh](https://testssl.sh) - local TLS testing tool
- [badssl.com](https://badssl.com) - browser TLS tests
