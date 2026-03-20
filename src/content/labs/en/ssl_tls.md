---
title: "SSL/TLS. Analysis of Secure Connection Establishment Process"
description: "In this work, we'll examine the SSL/TLS protocol, check real server configurations for vulnerabilities, and reproduce the consequences of using outdated protocol versions"
image: "/images/ssl_tls_sec/main.jpg"
date: "2026-03-18"
---

## Introduction
Every time a lock and the letters HTTPS appear in the browser's address bar, a complex cryptographic process occurs between the device and server - **TLS Handshake**. Exactly it guarantees three things: that we're communicating with exactly the server we intend (authentication), that data cannot be read by third parties (confidentiality), and that it hasn't been modified in transit (integrity).
In this work, we'll examine the **SSL/TLS** protocol both from a theoretical perspective and conduct a complete practical demonstration. We'll intercept and analyze **TLS handshake** in Wireshark, analyze certificates, check real server configurations for vulnerabilities, and reproduce the consequences of using outdated protocol versions.



## Theoretical Foundation

### History: from SSL to TLS

The **SSL (Secure Sockets Layer)** protocol was developed by Netscape in 1994 to protect HTTP traffic. Over three decades, it has gone from vulnerable early versions to modern **TLS 1.3**.

| Version   | Year  | Status                | Reason for Obsolescence / Notes               |
|----------|------|----------------------|-----------------------------------------------|
| SSL 2.0  | 1995 | Prohibited (RFC 6176)  | Critical design vulnerabilities             |
| SSL 3.0  | 1996 | Prohibited (RFC 7568)  | POODLE attack (2014)                           |
| TLS 1.0  | 1999 | Obsolete (RFC 8996)   | BEAST, POODLE-TLS attacks                       |
| TLS 1.1  | 2006 | Obsolete (RFC 8996)   | Weak algorithms, disabled in 2021             |
| TLS 1.2  | 2008 | Current             | Secure with proper configuration         |
| TLS 1.3  | 2018 | Recommended         | Simplified handshake, Forward Secrecy         |


### Key Concepts

Asymmetric Encryption **(RSA, ECDH)**

Uses a key pair: **public and private**. The public key is embedded in the certificate and available to everyone. The private key is stored only on the server. Used only during the handshake stage for secure symmetric key exchange - due to high computational cost.

Symmetric Encryption **(AES-GCM, ChaCha20)**

After the handshake, all traffic is encrypted with a fast symmetric algorithm using a session key that was negotiated in the previous stage. This ensures high performance during data transmission.

Forward Secrecy (PFS) - **perfect forward secrecy**

A key property of TLS 1.3: a unique temporary key is generated for each session (via ECDHE). Even if the server's private key is compromised in the future - it will be impossible to decrypt previously intercepted traffic.


### TLS Handshake Structure (TLS 1.3 — simplified)

- ClientHello - client immediately sends supported groups and key_share parameters.
- ServerHello + EncryptedExtensions + Certificate + Finished - all in one response.
- Client Finished - client confirms. Connection established.

> TLS 1.3 completely abandoned outdated algorithms: RSA key exchange, RC4, DES, 3DES, MD5, SHA-1 for signatures. Only modern ones remain: AES-GCM, ChaCha20-Poly1305, ECDHE.



## Phase 1. Environment Preparation

### Step 1. Installing Tools

All tools necessary for this work are available in Parrot OS through the standard package manager. Let's install the TLS server configuration analysis script (testssl.sh)

![01_testssl](/handson/images/ssl_tls_sec/01_testssl.png)

![02_openssl](/handson/images/ssl_tls_sec/02_openssl.png)


### Step 2. Configuring Wireshark for TLS Traffic Capture

By default, Wireshark requires root rights to capture traffic. Let's add the current user to the wireshark group to work without sudo.

![03_wireshark](/handson/images/ssl_tls_sec/03_wireshark.png)

In Wireshark, we select the network interface (in my case ens33) and in the filter field enter: **TLS**

![04_interface](/handson/images/ssl_tls_sec/04_interface.png)

![05_tls](/handson/images/ssl_tls_sec/05_tls.png)

This filter displays only TLS packets, hiding all other traffic. For more precise analysis, you can use: tls.handshake to view only the handshake stage.



## Phase 2. Capturing and Analyzing TLS Handshake in Wireshark

### Step 3. Generating TLS Traffic

We start capture in Wireshark, then in the terminal execute an HTTPS request to the test server: we connect to badssl.com - a site for testing TLS configurations

![06_badssl](/handson/images/ssl_tls_sec/06_badssl.png)

Or you can use openssl for more detailed output: ```openssl s_client -connect badssl.com:443 -tls1_2```

After executing the command, we'll see a series of TLS packets in Wireshark.

![07_wireshark_tls](/handson/images/ssl_tls_sec/07_wireshark_tls.png)

### Step 4. Analyzing ClientHello

In the packet list, we find the first TLS packet marked **Client Hello**. We click on it. In the lower Wireshark panel, we expand the Transport Layer Security → TLSv1.2 Record Layer → Handshake Protocol: Client Hello section.
What we see in ClientHello:
- Version - maximum TLS version supported by the client (for example, TLS 1.2).
- Random - 32 bytes of random data (Client Random). Used when generating the session key.
- Session ID - if this is a repeat connection, there will be the previous session's ID here.
- Cipher Suites - list of encryption algorithms supported by the client (usually 10–30 options).
- Extensions - additional capabilities: SNI (server name), ALPN support (HTTP/2), supported_groups.

![08_clienthello](/handson/images/ssl_tls_sec/08_clienthello.png)

**SNI (Server Name Indication)** - a particularly important extension. It allows the server to understand which site the client is accessing and return the correct certificate. Without SNI, one IP address could only use one certificate.

### Step 5. Analyzing ServerHello and Cipher Suite Selection

We find the Server Hello packet. We expand its structure similarly. The key field is Cipher Suite: here the server selected one algorithm from the list proposed by the client.
Example of a typical choice for TLS 1.2:
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
Decoding this string:
- TLS - protocol.
- ECDHE - key exchange method (Elliptic Curve Diffie-Hellman Ephemeral). Provides Forward Secrecy.
- RSA - server authentication algorithm (verified through certificate).
- AES_256_GCM - symmetric data encryption algorithm (256-bit key, GCM mode).
- SHA384 - algorithm for HMAC (message integrity verification).

![09_serverhello](/handson/images/ssl_tls_sec/09_serverhello.png)


### Step 6. Analyzing Server Certificate

We find the **Certificate** packet. It contains the X.509 certificate chain: site certificate, intermediate CA, and root CA. We expand Certificate → Certificates → Certificate.
Key fields for analysis:
- Subject - to whom the certificate is issued (Common Name = domain name).
- Issuer - by whom issued (Certificate Authority, for example Let's Encrypt).
- Validity - validity period (Not Before / Not After).
- Subject Alternative Names (SAN) - list of domains covered by the certificate.
- Public Key - server's public key (type and size: RSA 2048, EC 256, etc.).
- Signature Algorithm - CA signature algorithm (should be SHA-256 or better).

![10_analyze_cert](/handson/images/ssl_tls_sec/10_analyze_cert.png)


### Step 7. Observing ChangeCipherSpec and Handshake Completion

After key exchange, the following appear in the packet list:
- Change Cipher Spec (client) - notification.
- Encrypted Handshake Message (client) - encrypted Finished message.
- Change Cipher Spec (server) - response notification from server.
- Encrypted Handshake Message (server) - encrypted Finished from server.

After this, all subsequent packets have the Application Data type - this is already encrypted HTTP traffic, whose contents cannot be seen without the key.

![11_changecipher](/handson/images/ssl_tls_sec/11_changecipher.png)




## Phase 3. Detailed Analysis Through OpenSSL

### Step 8. Connecting with Full Handshake Output

The **openssl s_client** utility allows manually establishing a TLS connection and obtaining a detailed log of all handshake stages:
openssl s_client -connect google.com:443 -tls1_3 -showcerts

![12_showcerts](/handson/images/ssl_tls_sec/12_showcerts.png)


### Step 9. Extracting and Analyzing Certificate

Save the certificate to a file and analyze its structure:

![13_cert](/handson/images/ssl_tls_sec/13_cert.png)

This command outputs:
- Version, Serial Number, Signature Algorithm
- Issuer DN - who issued the certificate
- Validity - validity period
- Subject DN - to whom issued
- Public-Key - size and type
- X509v3 extensions - SAN, Key Usage, Extended Key Usage

View certificate in text format:

![14_cert_text](/handson/images/ssl_tls_sec/14_cert_text.png)

Verify certificate validity period:

![15_cert_check](/handson/images/ssl_tls_sec/15_cert_check.png)


### Step 10. Testing Specific TLS Versions

Force connection via specific version:

![16_tls_versions](/handson/images/ssl_tls_sec/16_tls_versions.png)

Modern servers should reject SSL 3.0, TLS 1.0, and TLS 1.1. If the server accepts them - this is a serious security issue.



## Phase 4. Auditing Real Servers

### Step 11. Checking Popular Services

Let's check several well-known services to understand what the state of TLS in the real world is:

![17_check_pop_services](/handson/images/ssl_tls_sec/17_check_pop_services.png)

![18_cloudflare](/handson/images/ssl_tls_sec/18_cloudflare.png)

![19_google](/handson/images/ssl_tls_sec/19_google.png)

![20_github](/handson/images/ssl_tls_sec/20_github.png)


### Step 12. Comprehensive Server Audit with testssl.sh

testssl.sh is the industry standard for TLS configuration analysis. It performs a full security check:

![21_testssl_1](/handson/images/ssl_tls_sec/21_testssl_1.png)

![22_testssl_2](/handson/images/ssl_tls_sec/22_testssl_2.png)

![23_testssl_3](/handson/images/ssl_tls_sec/23_testssl_3.png)

In the testssl.sh output, we pay attention to the sections:
- Testing protocols - which SSL/TLS versions the server supports (red - outdated enabled, green - disabled).
- Testing cipher categories - whether insecure cipher suites are supported (RC4, EXPORT, NULL).
- Testing vulnerabilities - check for POODLE, BEAST, HEARTBLEED, ROBOT, DROWN and other attacks.
- Testing server defaults - HTTP Strict Transport Security (HSTS), OCSP stapling.


### Step 13. Scanning Through Nmap SSL Scripts

Nmap has built-in NSE scripts for TLS analysis. This allows quickly getting the overall picture without installing additional tools:

Determining supported cipher suites and TLS versions:

![24_nmap](/handson/images/ssl_tls_sec/24_nmap.png)

Getting the certificate:

![25_nmap_cert](/handson/images/ssl_tls_sec/25_nmap_cert.png)

Checking for Heartbleed vulnerability (CVE-2014-0160):

![26_heartbleed](/handson/images/ssl_tls_sec/26_heartbleed.png)

Full TLS audit with one command:

![27_nmap_all_ssl](/handson/images/ssl_tls_sec/27_nmap_all_ssl.png)




## Phase 5. Creating Your Own TLS Server

### Step 14. Generating Self-Signed Certificate

For local experiments, let's create our own CA and server certificate. This allows complete control over the process and observing handshake in Wireshark without external dependencies:

![28_own_tls_server](/handson/images/ssl_tls_sec/28_own_tls_server.png)

We check the result:

![29_own_cert_demo](/handson/images/ssl_tls_sec/29_own_cert_demo.png)


### Step 15. Starting Test TLS Server

OpenSSL provides a built-in tool for starting a simple TLS server. This is ideal for observing handshake in a controlled environment:

We start the TLS server on port 4443 and in another terminal connect as a client and observe the handshake

![30_connect](/handson/images/ssl_tls_sec/30_connect.png)

Connection only via TLS 1.3:

![31_tls_1_3](/handson/images/ssl_tls_sec/31_tls_1_3.png)

Connection with output of all session details:

![32_all](/handson/images/ssl_tls_sec/32_all.png)

> The **-state** flag outputs each handshake step: SSL_connect:before SSL initialization → SSL_connect:SSLv3/TLS write client hello → SSL_connect:SSLv3/TLS read server hello → and so on. This allows literally observing the protocol in real time.


### Step 16. Simultaneous Capture in Wireshark

While the server is running, we start Wireshark and filter traffic on port 4443:

Filter in Wireshark ```tcp.port == 4443``` or only TLS handshake ```tcp.port == 4443 && tls.handshake```

![33_wireshark](/handson/images/ssl_tls_sec/33_wireshark.png)

Now each client connection will be visible in Wireshark as a complete sequence: TCP SYN → TCP SYN-ACK → TCP ACK → ClientHello → ServerHello → Certificate → ... → Application Data.




## Phase 6. Demonstrating Consequences of Outdated TLS Versions

### Step 17. Testing Servers with Intentionally Bad Configuration

The badssl.com site provides a set of subdomains with deliberately insecure TLS configuration - specifically for training and testing security tools:

Server with expired certificate:

We check three cases: first a server with an expired certificate, which causes an error due to expiration; then a server with a self-signed certificate, where a certificate trust error occurs; and finally a server with incorrect hostname, which gives an error due to name mismatch in the certificate.

![34_test_server](/handson/images/ssl_tls_sec/34_test_server.png)

All of the above can be forcibly bypassed:

![35_curl_k](/handson/images/ssl_tls_sec/35_curl_k.png)

The **curl -k (--insecure)** flag completely disables certificate verification. MITM attack becomes trivial - the attacker's certificate will be accepted without warnings.


### Step 18. Analyzing Insecure Cipher Suites

We check servers supporting intentionally weak algorithms:

Server with RC4 (broken stream cipher) and with 512-bit keys (EXPORT-grade, cracked in hours)

![36_cipher_suites](/handson/images/ssl_tls_sec/36_cipher_suites.png)

We run testssl.sh against the bad server and look at the report:

![37_vuln](/handson/images/ssl_tls_sec/37_vuln.png)


### Step 19. POODLE - Attack Explanation on SSL 3.0

POODLE (Padding Oracle On Downgraded Legacy Encryption) - 2014 attack on SSL 3.0. The essence: an attacker, being in MITM position, can forcibly "downgrade" the connection from TLS to SSL 3.0 (downgrade attack), and then use vulnerability in CBC mode to decrypt traffic byte by byte.

We check if the server supports the outdated SSL 3.0 protocol (it should reject the connection with a handshake error), then additionally check it for POODLE attack vulnerability using scanning and make sure it's not vulnerable, and for comparison perform the same check on a deliberately vulnerable server.

![38_poodle](/handson/images/ssl_tls_sec/38_poodle.png)




## Phase 7. Decrypting TLS Traffic in Wireshark

### Step 20. Exporting Session Keys via SSLKEYLOGFILE

Chromium-based browsers and Firefox support the SSLKEYLOGFILE environment variable: when set, the browser writes session keys to a file, and Wireshark can use them to decrypt intercepted traffic. This is a legitimate method for debugging and analysis.

We specify the path to the file for saving TLS keys, start the browser with this setting, open several HTTPS sites, then check that the keys were indeed written to the file.

![39_export_sslkeylogfile](/handson/images/ssl_tls_sec/39_export_sslkeylogfile.png)

![40_chromium](/handson/images/ssl_tls_sec/40_chromium.png)

![41_check_file](/handson/images/ssl_tls_sec/41_check_file.png)

Now we configure Wireshark to use this file:

![42_wireshark_test](/handson/images/ssl_tls_sec/42_wireshark_test.png)

![43_tls](/handson/images/ssl_tls_sec/43_tls.png)

![44_wireshark](/handson/images/ssl_tls_sec/44_wireshark.png)




## Summary and Conclusions

### TLS Version Security Comparison

| Parameter                | TLS 1.1                | TLS 1.2                          | TLS 1.3                          |
|-------------------------|------------------------|----------------------------------|----------------------------------|
| Status                  | Disabled since 2021        | Current                         | Recommended                     |
| RTT for handshake       | 2 RTT                  | 2 RTT                            | 1 RTT (0-RTT with resumption)     |
| Forward Secrecy         | Optional            | Optional                      | Mandatory                      |
| Supported ciphers    | RC4, 3DES, weak      | AES-GCM, ChaCha20 + outdated   | Only modern               |
| Authentication          | RSA, DSA               | RSA, ECDSA, DSA                  | RSA, ECDSA (without outdated)      |
| TLS compression              | Yes (CRIME vulnerability)  | Yes (CRIME vulnerability)            | No                              |
| Encrypted SNI           | No                    | No                              | Supported (ECH)             |
| Vulnerabilities              | BEAST, POODLE, RC4     | SWEET32 with weak sets       | Not found                    |

During this work, the SSL/TLS Handshake mechanism was investigated - the fundamental process ensuring the security of the modern internet. We examined the protocol's evolution from vulnerable SSL 2.0 to modern TLS 1.3, captured and analyzed a real handshake in Wireshark, conducted a TLS configuration audit of servers, created our own CA and TLS server, and also demonstrated what consequences result from using outdated protocol versions and weak cipher suites.
