---
title: "CDN, Load Balancer - How They Work"
date: "2026-05-07"
---

CDN and Load Balancer solve different problems but often work together. A CDN distributes static content geographically. A Load Balancer distributes requests across servers in the same location.

---

## Load Balancer

### What is a Load Balancer

A Load Balancer accepts incoming requests and distributes them across multiple backend servers.

```
Clients                Load Balancer            Backend Servers
                       ┌────────────┐
Client 1 ─────────────►│            │──────────► Server 1 (192.168.1.10)
Client 2 ─────────────►│  LB        │──────────► Server 2 (192.168.1.11)
Client 3 ─────────────►│            │──────────► Server 3 (192.168.1.12)
                       └────────────┘

One IP/DNS -> many servers behind it.
The client has no idea which specific server handles its request.
```

### Why Use a Load Balancer

```
1. Horizontal scaling
   10 servers with 2 CPUs each beats one server with 20 CPUs.
   Cheaper and easier to scale out.

2. High Availability
   If one server goes down, the rest keep working.
   LB stops sending requests to the failed server.

3. Even load distribution
   Without LB one server may be overloaded while others are idle.

4. Rolling updates / zero-downtime deploys
   Update servers one at a time without stopping the service.
   Drain server -> update -> return to rotation.

5. Health checks
   LB continuously monitors server health.
   Automatically removes failed servers from the pool.
```

### Balancing Layers (L4 vs L7)

```
L4 Load Balancer (Transport Layer):
- Works with TCP/UDP packets
- Does not inspect content (HTTP headers, URL)
- Faster, less overhead
- Balances by IP:Port
- Examples: HAProxy TCP mode, AWS NLB, LVS

L4 example:
  Client connects to LB at 1.2.3.4:443
  LB forwards the TCP stream to 10.0.0.1:443 or 10.0.0.2:443
  LB never sees HTTP content, only TCP flows

L7 Load Balancer (Application Layer):
- Works with request content (HTTP, gRPC, WebSocket)
- Can route by URL, headers, cookies
- Can modify requests and responses
- Can terminate TLS
- Examples: nginx, HAProxy HTTP mode, AWS ALB, Traefik

L7 example:
  GET /api/users   -> backend group "api-servers"
  GET /images/     -> backend group "static-servers"
  POST /upload/    -> backend group "upload-servers"
```

### Load Balancing Algorithms

```
Round Robin:
  Request 1 -> Server 1
  Request 2 -> Server 2
  Request 3 -> Server 3
  Request 4 -> Server 1 (wraps around)
  Pros: simple, even distribution
  Cons: ignores actual server load

Weighted Round Robin:
  Server 1: weight=3 (powerful)
  Server 2: weight=1 (weaker)
  Out of 4 requests: 3 to Server 1, 1 to Server 2
  Pros: accounts for different server capacities

Least Connections:
  Request goes to server with fewest active connections
  Pros: better for requests with varying duration
  Cons: requires maintaining connection counters

Least Response Time:
  Request goes to server with lowest response time
  LB measures RTT to each backend
  Pros: adaptive, reflects real performance

IP Hash:
  hash(client_ip) % N_servers -> always the same server
  Pros: one client always hits one server (sticky)
  Cons: uneven distribution if few clients

Consistent Hashing:
  Advanced IP Hash variant
  Adding/removing a server redistributes minimal requests
  Used in CDNs, caching layers (Memcached, Redis Cluster)

Random:
  Random server selection
  Simple, works well at high request volumes

Resource Based (Adaptive):
  LB polls servers for metrics (CPU, RAM, queue depth)
  Sends to least loaded server
  More complex to implement
```

### Health Checks

```
Active Health Check - LB polls servers itself:

HTTP check:
  GET /health HTTP/1.1
  Expected: 200 OK
  Interval: every 5 seconds
  Timeout: 2 seconds
  Unhealthy: 3 consecutive failures
  Healthy: 2 consecutive successes

TCP check:
  Open TCP connection to port 80
  If connection succeeds - server is alive

Passive Health Check (real traffic analysis):
  If server returns 5xx errors - mark as unhealthy
  If connections time out - mark as unhealthy

Server states:
  UP       - receiving traffic
  DOWN     - not receiving traffic, LB skips it
  DRAINING - finishing existing connections, no new ones
             (used for graceful shutdown during deploys)
  MAINT    - manual maintenance, excluded from rotation
```

### Session Persistence (Sticky Sessions)

```
Problem: user logged in on Server 1, session is stored there.
Next request lands on Server 2 - no session, user is logged out.

Solutions:

1. Cookie-based persistence (recommended)
   LB inserts a cookie with the server ID:
   Set-Cookie: SERVERID=server1; Path=/
   All subsequent requests with this cookie -> server1

2. IP-based persistence
   hash(client_ip) -> always same server
   Downside: an entire office may share one NAT IP -> one server

3. Source IP + Port Hash
   Better than plain IP for NAT scenarios

4. Best solution: externalize sessions
   Store sessions in Redis / Memcached
   Any server can handle any request
   No sticky session needed at all
```

### SSL/TLS Termination

```
SSL Termination at the LB:

Client ──HTTPS──► LB (terminates TLS) ──HTTP──► Backend servers
                   │
                   Decrypts traffic here
                   Backends see plain HTTP

Pros:
- Backends don't spend CPU on TLS
- Certificate managed in one place (on LB)
- LB can inspect traffic (L7)

Cons:
- Traffic between LB and backends is unencrypted
- Requires a protected internal network

SSL Passthrough:
Client ──HTTPS──► LB (doesn't touch TLS) ──HTTPS──► Backend
LB doesn't see content, only forwards TCP.
Pros: end-to-end encryption
Cons: no L7 routing, can't read HTTP headers

SSL Re-encryption (Bridge):
Client ──HTTPS──► LB (terminates, inspects) ──HTTPS──► Backend
Pros: L7 routing AND encryption end to end
Cons: double TLS overhead
```

### nginx as a Load Balancer

```nginx
# /etc/nginx/nginx.conf

http {
    # Upstream server group
    upstream backend {
        # Algorithm (Round Robin is the default)
        # least_conn;          # Least Connections
        # ip_hash;             # IP Hash (sticky)
        # least_time header;   # Least Response Time (nginx plus)

        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=1;
        server 192.168.1.12:8080 backup;   # only used when others are down

        keepalive 32;    # keepalive connections to backends
    }

    upstream api_servers {
        least_conn;
        server 10.0.0.1:3000;
        server 10.0.0.2:3000;
        server 10.0.0.3:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;
        listen 443 ssl;

        ssl_certificate     /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;

        # Route by URL path
        location /api/ {
            proxy_pass http://api_servers;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            proxy_pass http://backend;
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
        }
    }
}
```

### HAProxy as a Load Balancer

```
# /etc/haproxy/haproxy.cfg

global
    maxconn 50000
    log /dev/log local0

defaults
    mode http              # or tcp for L4
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    option httplog
    option dontlognull
    option forwardfor      # add X-Forwarded-For

frontend http_in
    bind *:80
    bind *:443 ssl crt /etc/ssl/bundle.pem
    redirect scheme https if !{ ssl_fc }

    # ACL routing rules
    acl is_api path_beg /api/
    acl is_static path_beg /static/ /images/ /css/ /js/

    use_backend api_pool    if is_api
    use_backend static_pool if is_static
    default_backend web_pool

backend web_pool
    balance roundrobin
    option httpchk GET /health HTTP/1.1\r\nHost:\ localhost
    http-check expect status 200

    server web1 192.168.1.10:8080 check inter 5s rise 2 fall 3
    server web2 192.168.1.11:8080 check inter 5s rise 2 fall 3
    server web3 192.168.1.12:8080 check inter 5s rise 2 fall 3 backup

backend api_pool
    balance leastconn
    server api1 10.0.0.1:3000 check
    server api2 10.0.0.2:3000 check
    server api3 10.0.0.3:3000 check

backend static_pool
    balance roundrobin
    server static1 10.0.1.1:80 check
    server static2 10.0.1.2:80 check

# HAProxy stats dashboard
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth admin:secret
```

---

## CDN - Content Delivery Network

### What is a CDN

A CDN is a network of geographically distributed servers called Points of Presence (PoPs). Each PoP stores cached copies of content. Users get data from the nearest PoP rather than from the origin server.

```
Without CDN:
User in Tokyo ──────────────────────────► Origin in New York
                         ~150ms RTT

With CDN:
User in Tokyo ──► PoP in Tokyo ──► Origin in New York
              ~5ms RTT     (only on cache miss)

CDN PoP stores a copy: user gets response in ~5ms.
Origin only receives a request on cache miss (first request).
```

### How CDN Works Technically

```
1. DNS-based routing (primary method):

   Client makes a DNS query: image.example.com

   CDN's authoritative DNS server looks at:
   - Where the query came from (client IP)
   - Which PoP is closest / least loaded
   - Returns the IP of the Tokyo PoP

   Client connects to the Tokyo PoP (not the origin!)

2. Anycast routing (BGP Anycast):

   All PoPs announce the same IP via BGP
   Internet routing automatically picks the nearest PoP
   Used by: Cloudflare, public DNS (8.8.8.8, 1.1.1.1)

3. HTTP redirect:

   Origin receives request and returns a redirect to the CDN URL
   Less efficient but simple to implement
```

### What Content Belongs on a CDN

```
Caches well (static content):
- Images (.jpg, .png, .webp, .svg)
- Video and audio (.mp4, .mp3, HLS segments)
- CSS, JavaScript files
- Fonts (.woff2, .ttf)
- Documents (.pdf)
- Archives (.zip, .tar.gz)
- HTML pages (if not personalized)

Caches poorly (dynamic content):
- API responses with personal data
- Authenticated pages
- Real-time data (exchange rates, weather)
- Shopping cart, user account pages

Edge computing / Edge Functions:
- Code runs directly on the PoP (Cloudflare Workers, Vercel Edge)
- Dynamic responses without hitting origin
- A/B testing at the CDN level
- Geo-blocking, rate limiting at the network edge
```

### Cache-Control Headers

```
Cache-Control controls caching behavior:

Response directives:
  max-age=3600           - cache for 3600 seconds (1 hour)
  s-maxage=86400         - for CDN/proxy: cache for 86400 sec (1 day)
                           overrides max-age for shared caches
  no-cache               - may cache, but always revalidate with server
  no-store               - don't cache anywhere (personal data, banking)
  public                 - anyone can cache (CDN, browser)
  private                - browser only, not CDN
  must-revalidate        - when stale, must revalidate before serving
  stale-while-revalidate=60  - serve stale while revalidating in background
  stale-if-error=86400   - serve stale cache for up to 86400s on origin error
  immutable              - content will never change (for versioned assets)

Examples:
  # Static assets with versioning (cache busting)
  Cache-Control: public, max-age=31536000, immutable
  # file: /static/app.abc123.js (hash in filename)

  # HTML page
  Cache-Control: public, max-age=0, must-revalidate
  # or
  Cache-Control: no-cache

  # API with personal data
  Cache-Control: private, no-store

  # CDN caches longer than the browser
  Cache-Control: public, max-age=60, s-maxage=86400

Other cache headers:
  ETag: "abc123"            - content hash
  Last-Modified: Wed, ...   - last modification date
  Vary: Accept-Encoding     - separate cache per encoding
  Vary: Accept-Language     - separate cache per language
```

### Cache Miss / Hit

```
Cache HIT:
Client ──► CDN PoP (content in cache, fresh) ──► Client
                   fast, origin not involved

Cache MISS (first request or stale cache):
Client ──► CDN PoP (not in cache) ──► Origin server
                                 ◄── Origin returns content + Cache-Control
           CDN stores it ───────────────────────────► Client

Cache EXPIRED (cached but stale):
CDN validates with origin via If-None-Match / If-Modified-Since:
  Not changed: Origin -> 304 Not Modified -> CDN refreshes TTL
  Changed:     Origin -> 200 OK + new content -> CDN updates cache

Metric: Cache Hit Ratio (CHR)
  CHR = (cache hits) / (total requests) * 100%
  Good CHR: > 90% for static assets
  Bad CHR: < 50% (too many cache misses, CDN isn't helping)
```

### Cache Invalidation

```
Problem: file updated on origin, CDN still serves the old version.

Invalidation methods:

1. Wait for TTL to expire (automatic)
   Just wait for max-age to run out.
   Downside: delay of up to N seconds.

2. CDN provider's purge API
   Cloudflare: curl -X POST ".../zones/ZONE_ID/purge_cache"
   AWS CloudFront: aws cloudfront create-invalidation --paths "/*"
   Fastly: PURGE https://example.com/image.jpg
   Downside: first request after purge is a cache miss.

3. Cache Busting (best for static assets)
   Embed a content hash in the filename or URL:
   /static/app.js             -> expires based on TTL
   /static/app.abc123.js      -> new file = new URL = no stale cache
   /static/app.js?v=abc123    -> query param (worse, some CDNs skip caching)

   Webpack / Vite add the hash automatically:
   app.js -> app.3f9a2b.js (hash changes when content changes)
   HTML references the new URL -> CDN treats it as a new asset
```

### CDN and HTTPS / TLS

```
TLS Termination at CDN:
Client ──HTTPS──► CDN PoP (terminates TLS) ──HTTPS──► Origin
                   │
                   Certificate from CDN provider
                   Acts as a reverse proxy

Advantages:
- Certificates managed by CDN (auto-renewal)
- Client connects to nearest PoP (fast TLS handshake)
- Origin receives already-decrypted traffic (or re-encrypted)
- DDoS protection: CDN absorbs attacks before origin

Origin Pull vs Origin Push:
  Origin Pull (lazy caching):
  - CDN requests content from origin on first cache miss
  - Automatic, no special setup needed
  - Standard model for all CDNs

  Origin Push (pre-loading):
  - You upload files to the CDN in advance
  - Full control but requires management
  - Used for: large software distributions, upcoming releases
```

### Popular CDN Providers

```
Cloudflare:
- Largest network (~300 PoPs)
- Free basic plan
- DDoS protection, WAF, Workers (edge functions)
- Anycast IPv4 and IPv6
- Note: traffic is proxied through Cloudflare (changes IP)

AWS CloudFront:
- Deep AWS integration (S3, ALB, API Gateway)
- ~450 PoPs (Edge Locations)
- Lambda@Edge and CloudFront Functions
- Pay-per-use pricing

Fastly:
- Programmable CDN (VCL - Varnish Configuration Language)
- Very fast cache invalidation (~150ms)
- Popular with GitHub, Stripe, NY Times

Akamai:
- One of the oldest CDNs (~4000 PoPs)
- Enterprise tier
- Complex and expensive

Vercel Edge / Netlify Edge:
- CDN + edge functions in one (JAMstack)
- Auto-deploy from Git

BunnyCDN:
- Affordable pricing
- Good coverage in Europe and Asia
```

---

## CDN + Load Balancer Together

### Typical Architecture

```
Internet
    │
    ▼
[CDN / Edge Layer]
Cloudflare / Fastly / CloudFront
- Static content caching
- TLS termination
- DDoS protection
- WAF (Web Application Firewall)
    │
    │ (only cache misses and dynamic requests)
    ▼
[Load Balancer Layer]
nginx / HAProxy / AWS ALB
- Request distribution
- Health checks
- SSL (if not already terminated above)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
[App Server 1]              [App Server 2]
Node.js / Django / Go       Node.js / Django / Go
    │                                  │
    └──────────────┬───────────────────┘
                   ▼
            [Databases]
            PostgreSQL / Redis / S3
```

### Real Client IP Behind Proxies

```
Problem: backend sees the LB or CDN IP, not the real client IP.

Solution - forwarding headers:
  X-Forwarded-For: <client-ip>, <proxy1-ip>, <proxy2-ip>
  X-Real-IP: <client-ip>
  CF-Connecting-IP: <client-ip>   (Cloudflare)
  True-Client-IP: <client-ip>     (Akamai, Cloudflare Enterprise)

Example chain:
  Client 1.2.3.4 -> Cloudflare 104.x.x.x -> nginx -> Django

  Headers Django receives:
  X-Forwarded-For: 1.2.3.4, 104.x.x.x
  X-Real-IP: 1.2.3.4
  CF-Connecting-IP: 1.2.3.4

nginx config:
  set_real_ip_from 103.21.244.0/22;    # Cloudflare IP ranges
  set_real_ip_from 173.245.48.0/20;
  real_ip_header CF-Connecting-IP;

Warning: only trust X-Forwarded-For from known trusted proxies!
A client can spoof the header: X-Forwarded-For: 127.0.0.1
```

### Geo-routing and Multi-Region

```
Multi-region with CDN and LB:

         ┌─────────────────────────────────────┐
         │             DNS / GeoDNS             │
         │  EU clients  -> EU region            │
         │  US clients  -> US region            │
         │  Asia clients -> Asia region         │
         └─────────────────────────────────────┘
                  │           │           │
                  ▼           ▼           ▼
            [EU CDN]    [US CDN]    [Asia CDN]
                  │           │           │
                  ▼           ▼           ▼
            [EU LB]     [US LB]     [Asia LB]
                  │           │           │
                  ▼           ▼           ▼
           EU Servers   US Servers  Asia Servers

Failover:
  If US region is unavailable -> DNS redirects traffic to EU
  Usually automatic via health checks in DNS (Route 53, etc.)
```

---

## Diagnostics

```bash
# Check which CDN PoP is responding
curl -sv https://example.com 2>&1 | grep -E 'cf-ray|x-cache|via|server'

# Cloudflare-specific headers
curl -I https://example.com | grep -i 'cf-'
# CF-Ray: 7abc123-AMS  (PoP: AMS = Amsterdam)
# CF-Cache-Status: HIT / MISS / EXPIRED

# Check Cache-Control headers
curl -I https://example.com/static/app.js
# Cache-Control: public, max-age=31536000
# Age: 3600  (seconds the file has been in cache)
# X-Cache: Hit from cloudfront

# Traceroute to CDN
traceroute example.com
mtr example.com

# Test from multiple locations
# https://tools.keycdn.com/performance
# https://www.cdnplanet.com/tools/cdnfinder/

# Check HAProxy stats
curl http://lb-host:8404/stats

# nginx status
curl http://lb-host/nginx_status

# Verify X-Forwarded-For is passed correctly
curl -H "X-Forwarded-For: 1.2.3.4" https://example.com/api/myip

# nslookup from different DNS servers (GeoDNS test)
nslookup example.com 8.8.8.8     # via Google DNS
nslookup example.com 1.1.1.1     # via Cloudflare DNS
# With GeoDNS - answers may differ by region

# dig with full DNS delegation trace
dig +trace example.com
```

---

## Cheat Sheet

```
Load Balancer:
  L4 (TCP/UDP)   - fast, no content inspection
  L7 (HTTP)      - slower, routes by URL/headers

Algorithms:
  Round Robin        - sequential (default)
  Weighted RR        - with weights for unequal servers
  Least Connections  - to least busy server
  IP Hash            - one client -> one server (sticky)
  Consistent Hash    - scalable sticky, minimal redistribution on change

Health Check:
  HTTP: GET /health -> 200 OK
  TCP:  open connection -> success
  Unhealthy: N failures -> remove from rotation
  Healthy: N successes -> return to rotation

Sticky Sessions:
  Cookie-based    - best option
  IP Hash         - simple, but problems with NAT
  Best practice: store sessions in Redis (eliminate need for sticky)

SSL Termination:
  At LB     - backends offloaded, internal traffic unencrypted
  Passthrough - end-to-end encryption, no L7 routing
  Re-encrypt - best of both, double TLS overhead

CDN:
  Goal: serve content from the nearest PoP
  DNS routing  - primary method (GSLB)
  Anycast      - BGP, one IP = nearest PoP

Cache-Control:
  public, max-age=31536000, immutable  - versioned static assets
  public, max-age=60, s-maxage=86400   - HTML / API (CDN caches longer)
  private, no-store                    - personal data

Cache Busting:
  /app.abc123.js   - hash in filename (best option)
  /app.js?v=abc123 - query param (worse)

Metrics:
  Cache Hit Ratio > 90% for static assets
  Origin Traffic = total traffic - cache hits
  Time To First Byte (TTFB) with and without CDN
```

---

## References

- [HAProxy Documentation](https://www.haproxy.org/download/2.8/doc/configuration.txt) - full reference
- [nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html) - official guide
- [Cloudflare Learning: CDN](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) - good explanation
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) - all directives
- [AWS: What is a Load Balancer](https://aws.amazon.com/what-is/load-balancing/) - AWS explanation
- [web.dev: HTTP caching](https://web.dev/articles/http-cache) - Google's caching guide
