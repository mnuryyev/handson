---
title: "HTTP/2 and HTTP/3 (QUIC) - Differences"
date: "2026-05-02"
---

HTTP/2 (RFC 9113, 2022 / original RFC 7540, 2015) is a binary protocol with multiplexing, header compression, and server push. HTTP/3 (RFC 9114, 2022) is the next generation, running over QUIC instead of TCP. Both are semantically compatible with HTTP/1.1: the same methods, headers, and status codes. Only the transport mechanism changes.

---

## Evolution of HTTP

```
HTTP/1.0 (1996, RFC 1945)
  - One connection = one request
  - New TCP connection for every resource
  - No keep-alive by default

HTTP/1.1 (1997/2014, RFC 7230-7235)
  + Keep-Alive (persistent connections)
  + Chunked transfer encoding
  + Virtual hosting (Host header)
  - Head-of-Line Blocking (requests queue up)
  - Plain-text headers (duplicated in every request)
  - No request prioritization

HTTP/2 (2015/2022, RFC 7540 → RFC 9113)
  + Binary protocol (not text)
  + Multiplexing (many requests in one TCP connection)
  + Header compression (HPACK)
  + Server Push
  + Stream prioritization
  - Still TCP: Head-of-Line Blocking at TCP level
  - TLS required in practice (though not mandated by spec)

HTTP/3 (2022, RFC 9114)
  + Runs over QUIC (UDP, not TCP)
  + No TCP Head-of-Line Blocking
  + 0-RTT / 1-RTT connection (faster than TLS 1.2/1.3 over TCP)
  + Connection migration (IP change without disruption)
  + QPACK (improved HPACK for QUIC)
  + TLS 1.3 built into QUIC
```

---

## HTTP/2

### Key Concepts

```
Frame:
  The smallest unit of data in HTTP/2.
  Everything - headers, data, control - is sent as frames.
  Frame header: 9 bytes (length, type, flags, Stream ID).

Stream:
  An independent bidirectional sequence of frames.
  Each request/response = its own stream.
  Stream IDs: client → odd (1, 3, 5...), server → even (2, 4, 6...).
  Streams are multiplexed within one TCP connection.

Connection:
  One TCP connection = many concurrent streams.
  No reason to open multiple connections to the same host.

Stream lifecycle:
  idle → open → half-closed (local/remote) → closed

  Client opens a stream: HEADERS frame.
  Data flows: DATA frames.
  Stream closes: END_STREAM flag.
```

### Frame Types

```
Type       Code  Description
────────────────────────────────────────────────────────────
DATA       0x0   Request/response body data
HEADERS    0x1   Request/response headers (HPACK compressed)
PRIORITY   0x2   Stream priority (deprecated in RFC 9113)
RST_STREAM 0x3   Forcibly terminate a stream
SETTINGS   0x4   Connection parameters
PUSH_PROMISE 0x5 Server's promise to push a resource
PING       0x6   RTT check and keep-alive
GOAWAY     0x7   Close the connection (last processed Stream ID)
WINDOW_UPDATE 0x8 Flow control
CONTINUATION 0x9 Continue a header block

Important SETTINGS parameters:
  HEADER_TABLE_SIZE:      4096    (HPACK table size)
  ENABLE_PUSH:            1       (allow Server Push)
  MAX_CONCURRENT_STREAMS: ∞       (max concurrent streams)
  INITIAL_WINDOW_SIZE:    65535   (initial flow control window)
  MAX_FRAME_SIZE:         16384   (max frame size)
  MAX_HEADER_LIST_SIZE:   ∞       (max header list size)
```

### Multiplexing

```
HTTP/1.1 problem:
  Requests on one connection are processed strictly in order.
  A slow request (large image) blocks all subsequent ones.
  Browsers work around this by opening 6-8 connections per host.

HTTP/2 solution:
  All requests travel over one TCP connection simultaneously.
  Each request is an independent stream.
  A slow stream does not block others.

HTTP/1.1:                    HTTP/2:
  Connection 1:               One connection:
    GET /style.css              Stream 1: GET /style.css
    (waiting for response...)   Stream 3: GET /script.js
    GET /script.js              Stream 5: GET /image.png
    (waiting...)                (all at once!)
    GET /image.png

  Connection 2: ...
  Connection 3: ...
  Connections 4-6: ...

Results:
  - One TCP handshake instead of several
  - No 6-8 connection limit
  - Better use of the TCP congestion window
  - No overhead for establishing new connections
```

### Header Compression - HPACK

```
HTTP/1.1 problem:
  Headers are plain text, repeated in every request.
  Cookie, Authorization, User-Agent - identical across all requests.
  Header overhead = hundreds of bytes every time.

HPACK (RFC 7541) solutions:

1. Static Table:
   61 predefined entries (commonly used headers).
   Example: index 2 = ":method: GET", index 7 = ":scheme: https".
   A header is encoded as one byte (the index) instead of full text.

2. Dynamic Table:
   Headers sent during the current connection.
   Client and server maintain synchronized copies.
   A new header is added to the table.
   Reuse = only the index (1-2 bytes).

3. Huffman Encoding:
   Strings are encoded by character frequency (tuned for HTTP).
   ~30% additional compression on top of indexing.

Compression example:
  First request (header added to dynamic table):
    :method: GET          → 0x82 (index 2 from static table)
    :path: /index.html    → literal + Huffman + add to dynamic table
    :scheme: https        → 0x87 (index 7)
    :authority: example.com → literal + add to dynamic table

  Second request to the same host:
    :method: GET          → 0x82 (1 byte!)
    :path: /style.css     → only the changed path
    :scheme: https        → 0x87 (1 byte!)
    :authority: example.com → index from dynamic table (1-2 bytes)

  Savings: hundreds of bytes → a handful of bytes for unchanged headers.

HPACK vulnerability - CRIME/BREACH:
  Compression + secrets in headers (Cookie, Authorization) →
  side-channel attack (measuring compressed traffic size).
  Defense: don't mix secrets with attacker-controlled content.
```

### Server Push

```
Server Push lets the server send resources the client hasn't requested yet
but will definitely need.

Classic scenario:
  Client: GET /index.html
  Server thinks: "The client will then request style.css and script.js"
  Server sends PUSH_PROMISE frame
  Server immediately starts sending style.css and script.js

  Client receives /index.html, sees links to CSS/JS,
  but they're already in cache (received via push) → no extra requests needed.

PUSH_PROMISE frame:
  Contains the headers of the "future" request (as if the client made it).
  Associated with the current stream.
  A new stream (even ID) is created for the push data.

Server Push problems:
  - Client may already have the resource cached → push is wasted
  - Hard to predict what to push
  - Competes with real requests for bandwidth
  - Chrome removed Server Push support in 2022
  - Better alternative: HTTP Link preload header

Client can decline a push:
  RST_STREAM with CANCEL error code → "no thanks"

Alternatives to Server Push:
  <link rel="preload" href="style.css" as="style">   (HTML)
  Link: </style.css>; rel=preload; as=style           (response header)
  103 Early Hints + Link headers
```

### Stream Prioritization

```
HTTP/2 (RFC 7540) had a complex priority system:
  - Dependency tree
  - Stream weight (1-256)
  - Exclusive dependencies

In practice: implementations often ignored or poorly supported it.
RFC 9113 (HTTP/2 2022) removed prioritization via PRIORITY frames.

Replacement: Extensible Priorities (RFC 9218)
  Priority: u=3, i  (urgency + incremental)
  u = urgency (0 = most important, 7 = least important)
  i = incremental (data can be processed as it arrives)

Typical urgency values:
  u=0 - render-blocking critical resource (inline scripts)
  u=1 - important resources (main CSS)
  u=2 - above-the-fold resources
  u=3 - default (most resources)
  u=4 - speculative preload
  u=7 - background fetch
```

### HTTP/2 and TLS

```
By the spec, HTTP/2 can run without TLS (h2c - cleartext).
In practice: all browsers require TLS for HTTP/2.

Protocol negotiation via ALPN (TLS extension):
  Client in TLS ClientHello: "I support h2, http/1.1"
  Server chooses: "I select h2"
  No extra round-trip for negotiation.

ALPN identifiers:
  h2    - HTTP/2 over TLS
  h2c   - HTTP/2 cleartext (no TLS, testing only)
  http/1.1 - HTTP/1.1
  http/1.0 - HTTP/1.0

Upgrade mechanism (cleartext, rare):
  GET / HTTP/1.1
  Host: example.com
  Upgrade: h2c
  HTTP2-Settings: AAMAAABkAAQAAP__...

  HTTP/1.1 101 Switching Protocols
  Upgrade: h2c
```

### Connection Preface

```
After TLS (or plaintext) connection is established:

Client sends Connection Preface:
  PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n  (magic string, 24 bytes)
  + SETTINGS frame (client parameters)

Server responds:
  SETTINGS frame (server parameters)
  SETTINGS ACK (acknowledges client parameters)

Client confirms:
  SETTINGS ACK (acknowledges server parameters)

After this - normal request/response exchange.
```

---

## HTTP/3 and QUIC

### What QUIC Is

```
QUIC (Quick UDP Internet Connections) is a transport protocol.
Developed by Google (2012), standardized by IETF (RFC 9000, 2021).

Runs over UDP (not TCP).
Includes: reliability, flow control, multiplexing, TLS 1.3.

QUIC solves the main HTTP/2 problem:
  HTTP/2 eliminated Head-of-Line Blocking at the HTTP level.
  But TCP Head-of-Line Blocking remained!
  A lost TCP packet → all HTTP/2 streams wait for retransmit.
  QUIC - independent streams at the transport level.
  A lost QUIC packet → only the affected stream waits.

Port: UDP 443 (primary for HTTP/3).
Discovery: Alt-Svc response header tells the client HTTP/3 is available.
```

### QUIC vs TCP

```
Feature               TCP + TLS 1.3          QUIC (TLS 1.3 built-in)
─────────────────────────────────────────────────────────────────────
Handshake             1-RTT (TCP) +           1-RTT (QUIC+TLS together)
                      1-RTT (TLS) = 2 RTTs    = 1 round-trip
0-RTT reconnect       No (handshake needed)   Yes (for known servers)
HoL Blocking          Yes (at TCP level)       No (streams independent)
Multiplexing          Via HTTP/2 over TCP      Built into QUIC
Connection ID         No (IP:port tuple)       Yes (survives IP change)
Network change        Connection broken        Transparent migration
Flow control          TCP window               QUIC connection + stream
Encryption            TLS separately           TLS 1.3 built-in
Header encryption     No (TCP headers plain)*  Yes (almost all encrypted)
Packet ordering       Strict                   No strict ordering
Implementation        OS level (kernel)        User space (usually)

* TCP headers are not encrypted even with TLS → metadata is visible.
  QUIC encrypts everything except the minimal QUIC packet header.
```

### QUIC Connection and Handshake

```
New connection (1-RTT):
  Client                              Server
     │── Initial (ClientHello TLS) ──►│
     │                                │
     │◄── Initial (ServerHello) ──────│
     │◄── Handshake (TLS cert,...) ───│
     │◄── 1-RTT (HTTP/3 data) ────────│  (server can already respond!)
     │── Handshake (Finished) ────────►│
     │── 1-RTT (HTTP/3 request) ──────►│
     │◄── 1-RTT (HTTP/3 response) ─────│

  Total: 1 round-trip before first data.
  Compare to TCP+TLS1.3: TCP SYN+SYN-ACK + TLS = 2 round-trips.

0-RTT (resuming a known connection):
  Client knows server parameters (PSK from previous session).

  Client                              Server
     │── Initial + 0-RTT data ────────►│  request together with handshake!
     │◄── Initial + 1-RTT data ─────────│  response without waiting

  0 round-trips before data!
  Warning: 0-RTT is vulnerable to replay attacks.
  Use only for idempotent requests (GET).
```

### QUIC Connection ID

```
TCP identifies a connection by: (src IP, src port, dst IP, dst port).
Changing IP (Wi-Fi → mobile) = broken connection.

QUIC uses a Connection ID:
  A random identifier, independent of IP and port.
  One or more Connection IDs per connection.
  Client and server may have different Connection IDs.

Connection Migration:
  Client switches from Wi-Fi to mobile data → IP changes.
  QUIC continues with the same Connection ID.
  Server sees the same Connection ID → continues without disruption.

  Practical uses:
    - Video call doesn't drop when switching networks
    - File download continues
    - HTTP/3 session doesn't reset

  Mobile devices with unstable connections benefit most.

Preferred Address:
  Server can suggest a different address to migrate to.
  QUIC: switch to IP:port with more capacity.
```

### QPACK - Header Compression for HTTP/3

```
HPACK for HTTP/2 assumed strict stream ordering over TCP.
QUIC delivers streams independently → HPACK doesn't fit.

QPACK (RFC 9204) - adaptation of HPACK for QUIC:

Two special unidirectional streams:
  Encoder stream: sends table updates (new entries).
  Decoder stream: sends acknowledgements that entries were received.

Static table: 99 entries (more than HPACK's 61).

Two encoding modes:
  Without indexing: header not added to dynamic table.
    Safe for any stream, no head-of-line dependency.
  With indexing: wait for dynamic table to synchronize.
    Better compression but stream depends on encoder stream.

In practice:
  Most implementations use "without indexing" to minimize HoL.
  Dynamic table is less useful than in HTTP/2.
```

### HTTP/3 Frames

```
HTTP/3 uses QUIC streams, not TCP.

QUIC stream types in HTTP/3:
  Bidirectional streams: request/response (one per HTTP exchange).
  Unidirectional streams:
    Control stream     (one per side)
    QPACK encoder stream
    QPACK decoder stream
    Push stream        (Server Push)

HTTP/3 frame types (subset of HTTP/2):
  DATA       0x0  - request/response body
  HEADERS    0x1  - headers (QPACK compressed)
  CANCEL_PUSH 0x3 - cancel a Server Push
  SETTINGS   0x4  - connection parameters
  PUSH_PROMISE 0x5 - push promise
  GOAWAY     0x7  - close connection
  MAX_PUSH_ID 0xD - limit Push IDs

Removed from HTTP/3 (not needed - QUIC handles them):
  PRIORITY      → QUIC prioritization or Extensible Priorities
  RST_STREAM    → QUIC RESET_STREAM
  WINDOW_UPDATE → QUIC flow control
  PING          → QUIC PING

HTTP/3 request:
  Stream 0 (bidirectional):
    HEADERS frame (QPACK: method, path, headers)
    DATA frame (body, if any)

  Stream 0 return direction:
    HEADERS frame (status, response headers)
    DATA frame (response body)
```

### HTTP/3 Discovery (Alt-Svc)

```
A browser doesn't know upfront that a server supports HTTP/3.
The first connection is always TCP (HTTP/1.1 or HTTP/2).
The server advertises HTTP/3 via the Alt-Svc response header:

  Alt-Svc: h3=":443"; ma=86400
  Alt-Svc: h3=":443"; ma=86400, h3-29=":443"; ma=86400

  h3       = HTTP/3 (final version)
  h3-29    = HTTP/3 draft 29 (compatibility with older clients)
  :443     = same host, port 443
  ma=86400 = max-age in seconds (cache this info for 24 hours)

Process:
  1. Browser → server: HTTP/2 over TLS (first visit)
  2. Server → Alt-Svc: h3=":443"
  3. Browser caches: "example.com supports HTTP/3"
  4. Next request → HTTP/3 over QUIC (UDP 443)

Happy Eyeballs for HTTP/3:
  Browser tries HTTP/3 (UDP) and HTTP/2 (TCP) simultaneously.
  Whichever responds first wins.
  If UDP is blocked (firewall) - falls back to HTTP/2 automatically.

DNS HTTPS record (alternative to Alt-Svc):
  example.com.  IN  HTTPS  1  .  alpn="h3,h2" port=443
  Browser learns about HTTP/3 before the first connection (from DNS).
  No cold-start via HTTP/2.
```

---

## Comparison: HTTP/1.1, HTTP/2, HTTP/3

### Feature Table

```
Feature                HTTP/1.1      HTTP/2         HTTP/3
────────────────────────────────────────────────────────────────────
Transport              TCP           TCP            QUIC (UDP)
Format                 Text          Binary         Binary
Connections per host   6-8           1              1
Multiplexing           No*           Yes            Yes
HoL Blocking (HTTP)    Yes           No             No
HoL Blocking (TCP)     Yes           Yes            No (no TCP!)
Header compression     No            HPACK          QPACK
Server Push            No            Yes (deprecated) Yes (rare)
TLS                    Optional      Required**     Required (built-in)
Handshake              1-RTT TCP     1-RTT TCP      1-RTT QUIC
                       + 1-RTT TLS   + 1-RTT TLS    (or 0-RTT)
0-RTT                  No            No             Yes
Connection migration   No            No             Yes
Prioritization         No            Yes            Extensible Priorities

* HTTP/1.1 pipelining - theoretically yes, in practice no
** Browsers require TLS; the spec allows without TLS
```

### When to Use What

```
HTTP/1.1:
  - Simple APIs without browser clients
  - Systems with strict compatibility requirements
  - Debugging (human-readable format)
  - Internal services without TLS (use carefully!)

HTTP/2:
  - Websites (especially with many resources)
  - REST APIs with browser clients
  - gRPC (requires HTTP/2)
  - All modern web applications

HTTP/3:
  - Mobile users (unstable networks)
  - High-latency networks (satellite, mobile)
  - Media streaming (video, audio)
  - CDNs (Cloudflare, Fastly, Google - all support it)
  - Latency-sensitive applications
```

### Performance: Real Numbers

```
HTTP/2 improvements vs HTTP/1.1:
  Many small resources: -50-60% load time
  One large file: ~0% (no advantage for a single stream)
  Site with 100+ resources: significant improvement

HTTP/3 improvements vs HTTP/2:
  Stable network (LAN, good wired): ~0-5%
  Wi-Fi with 1% packet loss: -10-30%
  Mobile with network switching: significant improvement
  High-latency (satellite 600ms RTT): noticeable improvement (0-RTT)

When HTTP/3 doesn't help:
  - Packet loss < 0.1% (typical wired networks)
  - UDP blocked (firewall, VPN)
  - Single large requests (no multiplexing benefit)

WebTransport (future):
  API over HTTP/3 for bidirectional streams in the browser.
  WebSocket alternative with better performance.
```

---

## Server Configuration

### nginx

```nginx
# /etc/nginx/nginx.conf or site config

# HTTP/2
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                    # nginx >= 1.25.1 (new syntax)
    # Old syntax: listen 443 ssl http2;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    # ALPN negotiated automatically via SSL
    ssl_protocols TLSv1.2 TLSv1.3;
}

# HTTP/3 (QUIC)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    listen 443 quic reuseport;   # UDP for QUIC/HTTP/3
    listen [::]:443 quic reuseport;

    # Advertise HTTP/3 support to clients
    add_header Alt-Svc 'h3=":443"; ma=86400';

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    # Required for QUIC
    ssl_protocols TLSv1.3;      # QUIC requires TLS 1.3
}

# Server Push (HTTP/2, deprecated but functional)
location / {
    http2_push /style.css;
    http2_push /script.js;

    # Or via header (better)
    add_header Link "</style.css>; rel=preload; as=style";
    add_header Link "</script.js>; rel=preload; as=script";
}

# Verify HTTP/2
curl -v --http2 https://example.com 2>&1 | grep "HTTP/2"
# * Using HTTP2, server supports multiplexing
# < HTTP/2 200
```

### Caddy (HTTP/2 and HTTP/3 out of the box)

```
# Caddyfile
example.com {
    root * /var/www/html
    file_server

    # HTTP/2 and HTTP/3 enabled automatically!
    # TLS automatically via Let's Encrypt
}

# Verify protocol versions
curl -sv https://example.com 2>&1 | grep -E "HTTP/[23]|Alt-Svc|alpn"
```

### Apache

```apache
# Apache >= 2.4.17 for HTTP/2
# Requires: mod_http2

# /etc/apache2/mods-enabled/http2.conf or in VirtualHost:
Protocols h2 h2c http/1.1

<VirtualHost *:443>
    ServerName example.com
    SSLEngine on
    SSLCertificateFile /etc/ssl/cert.pem
    SSLCertificateKeyFile /etc/ssl/key.pem

    # HTTP/2 Server Push
    <Location "/index.html">
        Header add Link "</style.css>; rel=preload; as=style"
    </Location>
</VirtualHost>

# Verify HTTP/2 is loaded
apachectl -M | grep http2
```

### HAProxy (load balancer)

```
frontend https_front
    bind *:443 ssl crt /etc/ssl/cert.pem alpn h2,http/1.1
    bind *:443 quic crt /etc/ssl/cert.pem alpn h3   # HTTP/3

    use_backend http2_backend if { ssl_fc_alpn -i h2 }
    default_backend http1_backend

backend http2_backend
    server app1 127.0.0.1:8080 proto h2   # HTTP/2 to backend

# Advertise HTTP/3
http-response add-header Alt-Svc 'h3=":443"; ma=86400'
```

---

## Diagnostics

### Checking Protocol Version

```bash
# curl - specify version
curl --http1.1 https://example.com    # HTTP/1.1
curl --http2   https://example.com    # HTTP/2
curl --http3   https://example.com    # HTTP/3

# Show protocol in use
curl -v --http2 https://example.com 2>&1 | grep "HTTP/"
# * h2 state: IDLE => OPEN
# < HTTP/2 200

# Full timing with protocol info
curl -s -o /dev/null -w "
Protocol: %{http_version}
Time DNS:  %{time_namelookup}s
Time TCP:  %{time_connect}s
Time TLS:  %{time_appconnect}s
TTFB:      %{time_starttransfer}s
Total:     %{time_total}s
" https://example.com

# Check Alt-Svc header (HTTP/3 advertisement)
curl -sI https://example.com | grep -i alt-svc
# alt-svc: h3=":443"; ma=86400

# Check ALPN negotiation
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null | grep ALPN
# ALPN protocol: h2

# List ALPN protocols offered
openssl s_client -connect example.com:443 2>/dev/null | grep "ALPN"

# nghttp2 - HTTP/2 client
apt install nghttp2-client
nghttp -v https://example.com                    # verbose
nghttp -v -m 10 https://example.com              # multiplexing
nghttp --stat https://example.com                # stream statistics

# h2spec - HTTP/2 compliance test
h2spec -h example.com -p 443 -t -k

# HTTP/3 verification
# Browser: DevTools → Network → Protocol column
# chrome://net-internals/#http2  - HTTP/2 sessions in Chrome
# chrome://net-internals/#quic   - QUIC sessions in Chrome
```

### Wireshark / tcpdump for HTTP/2 and HTTP/3

```bash
# tcpdump - capture HTTP/2 (TLS, decryptable with key log)
tcpdump -i eth0 -w http2.pcap 'tcp port 443'

# HTTP/3 / QUIC (UDP 443)
tcpdump -i eth0 -w http3.pcap 'udp port 443'

# Wireshark filters:
http2                          # HTTP/2 frames (with decryption key)
quic                           # QUIC packets
http3                          # HTTP/3 frames

# Decrypt TLS in Wireshark:
# Preferences → Protocols → TLS → (Pre)-Master-Secret log filename
# In browser: SSLKEYLOGFILE=/tmp/ssl-keys.log firefox
# Wireshark uses this file to decrypt sessions

# Export TLS keys from browser (Chrome/Firefox)
export SSLKEYLOGFILE=/tmp/ssl-keys.log
google-chrome https://example.com

# Capture + keys
tcpdump -i eth0 -w capture.pcap 'tcp port 443 or udp port 443'
# Open in Wireshark with SSLKEYLOGFILE → see HTTP/2 frames

# qvis.quictools.dev - online QUIC trace visualizer
# qlog format for QUIC debugging (RFC 9001)
```

### Common Problems

```
Problem: HTTP/2 not working (fallback to HTTP/1.1)
  Diagnosis:
    curl -v --http2 https://example.com 2>&1 | grep -E "HTTP/|h2|alpn"
  Causes:
    - Server doesn't have HTTP/2 enabled in config
    - Wrong ALPN (no "h2" in the list)
    - TLS version < 1.2 (HTTP/2 requires TLS 1.2+)
    - Intermediate proxy doesn't support HTTP/2

Problem: HTTP/3 not working
  Diagnosis:
    curl -v --http3 https://example.com
    # If error - UDP blocked or server doesn't support QUIC
  Causes:
    - UDP 443 blocked by firewall
    - Server not configured for QUIC (no "listen quic")
    - Alt-Svc not being sent
    - OpenSSL without QUIC support (need BoringSSL or OpenSSL 3.3+)
  Check:
    # Is UDP 443 reachable?
    nc -u -v example.com 443
    # Wireshark: any QUIC packets in response?

Problem: Head-of-Line Blocking in HTTP/2
  Symptom: one slow resource slows everything else down
  This is a TCP problem, not HTTP/2.
  Solutions:
    - Move to HTTP/3 (QUIC has no HoL)
    - Use multiple domains (sharding) - not recommended for HTTP/2
    - Optimize the slow resources

Problem: High memory usage with HTTP/2
  Every stream has state → many connections = much memory.
  MAX_CONCURRENT_STREAMS limits the number of streams.
  nginx: http2_max_concurrent_streams 128;
  Load balancer: limit at balancer level.
```

---

## Cheat Sheet

```
HTTP/2:
  Transport: TCP
  Format: binary (frames)
  Key features:
    - Multiplexing (many requests in one TCP connection)
    - HPACK (header compression)
    - Server Push (send without request)
    - One connection instead of 6-8
  Problem: TCP HoL Blocking remains
  TLS: required in browsers (ALPN: h2)

HTTP/3:
  Transport: QUIC (UDP)
  Format: binary (HTTP/3 frames over QUIC streams)
  Key features:
    - No TCP HoL Blocking (streams are independent)
    - 1-RTT or 0-RTT handshake
    - Connection Migration (IP change without disruption)
    - TLS 1.3 built into QUIC
    - QPACK (header compression for QUIC)
  Discovery: Alt-Svc header or DNS HTTPS record
  TLS: required (TLS 1.3)

QUIC vs TCP:
  QUIC = UDP + reliability + multiplexing + TLS 1.3
  Handshake: 1-RTT (vs 2-RTT for TCP+TLS 1.3)
  0-RTT: for resume connections (idempotent requests only!)
  Connection ID: survives IP/port changes

nginx configuration:
  http2 on;                           HTTP/2
  listen 443 quic reuseport;          HTTP/3
  add_header Alt-Svc 'h3=":443"';    advertise HTTP/3

Diagnostics:
  curl --http2 -v URL                 HTTP/2
  curl --http3 -v URL                 HTTP/3
  curl -w "%{http_version}" URL       protocol version
  nghttp -v URL                       HTTP/2 details
  chrome://net-internals/#quic        QUIC in Chrome
  curl -sI URL | grep Alt-Svc        HTTP/3 advertisement
```

---

## References

- [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113) - HTTP/2 (2022, current)
- [RFC 7540](https://www.rfc-editor.org/rfc/rfc7540) - HTTP/2 (2015, original)
- [RFC 7541](https://www.rfc-editor.org/rfc/rfc7541) - HPACK: Header Compression for HTTP/2
- [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000) - QUIC: A UDP-Based Multiplexed and Secure Transport
- [RFC 9001](https://www.rfc-editor.org/rfc/rfc9001) - Using TLS to Secure QUIC
- [RFC 9002](https://www.rfc-editor.org/rfc/rfc9002) - QUIC Loss Detection and Congestion Control
- [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114) - HTTP/3
- [RFC 9204](https://www.rfc-editor.org/rfc/rfc9204) - QPACK: Field Compression for HTTP/3
- [RFC 9218](https://www.rfc-editor.org/rfc/rfc9218) - Extensible Prioritization Scheme for HTTP
- [HTTP/2 explained (Daniel Stenberg)](https://http2-explained.haxx.se)
- [HTTP/3 explained (Daniel Stenberg)](https://http3-explained.haxx.se)
- [QUIC Working Group](https://quicwg.org)
- [quic.nginx.org](https://quic.nginx.org) - nginx QUIC/HTTP/3 documentation
