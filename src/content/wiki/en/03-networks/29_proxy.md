---
title: "Proxy - Forward, Reverse, Transparent"
date: "2026-05-07"
---

A proxy server is an intermediary between a client and a server. It accepts requests from the client, forwards them to the target server, and returns the response. Depending on placement and purpose, there are different types of proxies.

Three main types: Forward Proxy (client-aware, requests going outbound), Reverse Proxy (server-side, client-unaware), Transparent Proxy (intercepts traffic invisibly to the client).

---

## Why Use a Proxy

    Proxies serve different purposes depending on type:

    Forward Proxy (client side):
      Anonymity - hide the real client IP from servers.
      Access control - corporate website filtering.
      Caching - speed up repeated requests.
      Bypassing restrictions - route through a different IP.

    Reverse Proxy (server side):
      Load balancing - distribute traffic across multiple backends.
      SSL/TLS termination - strip TLS at the proxy, backends run plain HTTP.
      Caching - serve static content without hitting backends.
      Protection - hide real backend server addresses.
      Compression - gzip/brotli at the proxy level.

    Transparent Proxy:
      Corporate filtering without configuring clients.
      ISP-level caching.
      Traffic interception and inspection (MITM for analysis).

    Without a proxy:
      Client talks directly to the server.
      Server sees the real client IP.
      No centralized control or caching.

---

## Forward Proxy

A Forward Proxy sits on the client side. The client explicitly configures the proxy in the browser or OS and routes requests through it.

    Flow:
      Client → Forward Proxy → Internet → Target server
      Client knows about the proxy.
      Target server sees the proxy IP, not the client IP.

    HTTP request through a proxy:
      Client sends to proxy:
        GET http://example.com/page HTTP/1.1   ← full URL (not just /page)
        Host: example.com
        Proxy-Authorization: Basic ...         ← if proxy requires authentication

      Proxy makes a normal request to the server:
        GET /page HTTP/1.1
        Host: example.com
        X-Forwarded-For: 192.168.1.5          ← real client IP (if added)

    HTTPS through a proxy (CONNECT method):
      For HTTPS the proxy cannot see or modify traffic (TLS).
      Client establishes a tunnel using CONNECT:

      Client → Proxy:
        CONNECT example.com:443 HTTP/1.1
        Host: example.com:443

      Proxy → Client:
        HTTP/1.1 200 Connection Established

      After that:
        Client ←TLS→ Proxy ←TCP tunnel→ example.com
        Proxy blindly forwards bytes, cannot see content.

### Proxy Headers

    X-Forwarded-For (XFF):
      Chain of client IP addresses through multiple proxies.
      X-Forwarded-For: 1.2.3.4, 10.0.0.1
                        ^^^^^^   ^^^^^^^^
                        real IP   intermediate proxy

      Problem: client can spoof this header.
      Trust XFF only from known proxies.

    X-Real-IP:
      Single client IP (not a chain). Used by Nginx.
      X-Real-IP: 1.2.3.4

    Forwarded (RFC 7239):
      Standardized replacement for XFF.
      Forwarded: for=1.2.3.4;proto=https;by=10.0.0.1

    Via:
      Chain of proxies the request passed through.
      Via: 1.1 proxy1.example.com, 1.1 proxy2.example.com

    Proxy-Authorization:
      Authentication to the proxy.
      Proxy-Authorization: Basic dXNlcjpwYXNz

### Squid Setup (Forward Proxy)

    # Install
    apt install squid    # Debian/Ubuntu
    dnf install squid   # Fedora/RHEL

    # Configuration /etc/squid/squid.conf

    # Listening port
    http_port 3128

    # ACL - access control lists
    acl localnet src 192.168.0.0/16    # local network
    acl localnet src 10.0.0.0/8
    acl SSL_ports port 443
    acl Safe_ports port 80 443 8080 21 22

    # Deny unsafe ports
    http_access deny !Safe_ports
    http_access deny CONNECT !SSL_ports

    # Allow local network
    http_access allow localnet
    http_access deny all    # deny everyone else

    # Cache
    cache_dir ufs /var/spool/squid 1000 16 256
    # 1000 MB, 16 first-level dirs, 256 second-level

    # Logs
    access_log /var/log/squid/access.log squid
    cache_log  /var/log/squid/cache.log

    # Hide proxy version
    via off
    forwarded_for off    # do not add X-Forwarded-For

    # Management
    systemctl enable --now squid
    squid -k reconfigure    # reload config without restart
    squid -k check          # validate config
    tail -f /var/log/squid/access.log    # live logs

    # Cache statistics
    squidclient -h 127.0.0.1 mgr:info
    squidclient -h 127.0.0.1 mgr:stats

### URL Filtering in Squid

    # Block by domain
    acl blocked_sites dstdomain .facebook.com .youtube.com .tiktok.com
    http_access deny blocked_sites

    # Block by URL regex
    acl bad_urls url_regex -i \.exe$ \.torrent$
    http_access deny bad_urls

    # Allow only during working hours
    acl working_hours time MTWHF 09:00-18:00
    http_access allow localnet working_hours
    http_access deny localnet    # deny outside working hours

    # Blacklist from file
    acl blacklist dstdomain "/etc/squid/blacklist.txt"
    http_access deny blacklist

    # Traffic throttling (delay pools)
    delay_pools 1
    delay_class 1 2                      # class 2: aggregate + individual
    delay_parameters 1 -1/-1 50000/50000 # individual 50KB/s
    delay_access 1 allow localnet

### Authentication in Squid

    # NCSA (login/password file)
    auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
    auth_param basic realm "Proxy Authentication"
    auth_param basic credentialsttl 2 hours

    acl authenticated proxy_auth REQUIRED
    http_access allow authenticated
    http_access deny all

    # Create user
    htpasswd -c /etc/squid/passwd user1
    htpasswd /etc/squid/passwd user2    # add another

    # Kerberos / NTLM (for Active Directory)
    auth_param negotiate program /usr/lib/squid/negotiate_kerberos_auth
    auth_param negotiate keep_alive on
    acl authenticated proxy_auth REQUIRED

### Configuring Clients for a Proxy

    # Environment variables (Linux/macOS)
    export http_proxy=http://proxy.example.com:3128
    export https_proxy=http://proxy.example.com:3128
    export no_proxy=localhost,127.0.0.1,10.0.0.0/8

    # With authentication
    export http_proxy=http://user:pass@proxy.example.com:3128

    # curl through proxy
    curl -x http://proxy.example.com:3128 https://example.com
    curl --proxy socks5://proxy.example.com:1080 https://example.com

    # wget through proxy
    wget -e http_proxy=http://proxy.example.com:3128 http://example.com

    # apt through proxy
    echo 'Acquire::http::Proxy "http://proxy.example.com:3128";' \
      > /etc/apt/apt.conf.d/99proxy

    # git through proxy
    git config --global http.proxy http://proxy.example.com:3128
    git config --global https.proxy http://proxy.example.com:3128

    # systemd services through proxy
    # /etc/systemd/system/myservice.service.d/proxy.conf
    [Service]
    Environment="http_proxy=http://proxy.example.com:3128"
    Environment="https_proxy=http://proxy.example.com:3128"

---

## Reverse Proxy

A Reverse Proxy sits on the server side. The client thinks it is talking directly to the server; in reality it talks to the proxy. The proxy forwards the request to one of the backend servers.

    Flow:
      Client → Reverse Proxy → Backend 1
                             → Backend 2
                             → Backend 3
      Client does NOT know about the proxy.
      Client sees the proxy IP (which is the "server" IP).

    Reverse proxy responsibilities:
      Load balancing.
      SSL/TLS termination (offloading).
      Caching static resources.
      Compression (gzip, brotli).
      Rate limiting.
      Authentication and authorization.
      A/B testing and canary deployments.
      DDoS protection (rate limiting, connection limits).

### Nginx as Reverse Proxy

    # Basic reverse proxy configuration
    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://127.0.0.1:8080;   # backend

            # Pass client headers to backend
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout 10s;
            proxy_send_timeout    30s;
            proxy_read_timeout    30s;
        }
    }

    # SSL termination
    server {
        listen 443 ssl;
        server_name example.com;

        ssl_certificate     /etc/nginx/ssl/example.com.pem;
        ssl_certificate_key /etc/nginx/ssl/example.com.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://127.0.0.1:8080;   # backend via plain HTTP
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto https;   # tell backend client used HTTPS
        }
    }

### Load Balancing in Nginx

    # Upstream - group of backend servers
    upstream backend_pool {
        # Round Robin (default)
        server 10.0.0.1:8080;
        server 10.0.0.2:8080;
        server 10.0.0.3:8080;

        # Least Connections - route to server with fewest active connections
        # least_conn;

        # IP Hash - same client always hits same backend (session persistence)
        # ip_hash;

        # Weighted Round Robin
        # server 10.0.0.1:8080 weight=3;
        # server 10.0.0.2:8080 weight=1;

        # Backup server (used only when primary servers are down)
        # server 10.0.0.3:8080 backup;

        # Health check parameters
        # server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;

        # Keepalive connections to backends
        keepalive 32;
    }

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend_pool;
            proxy_http_version 1.1;
            proxy_set_header Connection "";   # required for keepalive to backend
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }

### Caching in Nginx

    # Cache zone (shared memory + directory)
    proxy_cache_path /var/cache/nginx
        levels=1:2
        keys_zone=my_cache:10m    # 10MB metadata in RAM
        max_size=1g               # max 1GB on disk
        inactive=60m              # evict if not accessed for 60 minutes
        use_temp_path=off;

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend_pool;
            proxy_cache my_cache;

            # Cache key - what to cache separately
            proxy_cache_key "$scheme$request_method$host$request_uri";

            # Cache 200 responses for 1 hour, 404 for 1 minute
            proxy_cache_valid 200 302 1h;
            proxy_cache_valid 404 1m;

            # Serve stale cache if backend is unavailable
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503;

            # Header showing cache status
            add_header X-Cache-Status $upstream_cache_status;
            # HIT = from cache, MISS = from backend, BYPASS = skipped

            # Bypass cache if client sends Cache-Control: no-cache
            proxy_cache_bypass $http_cache_control;
        }

        # Static assets - long cache without proxying
        location ~* \.(js|css|png|jpg|ico|woff2)$ {
            root /var/www/static;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

### Nginx: rate limiting, gzip, security

    # Rate limiting
    # Zone: 10MB memory, 10 requests/second per IP
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            # burst=20: allow bursts of up to 20 requests
            # nodelay: return 429 immediately instead of queuing
            limit_req_status 429;

            proxy_pass http://backend_pool;
        }
    }

    # Connection limiting
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    server {
        location / {
            limit_conn conn_limit 10;   # max 10 simultaneous connections per IP
            proxy_pass http://backend_pool;
        }
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Hide Nginx version
    server_tokens off;

### HAProxy as Reverse Proxy

    # /etc/haproxy/haproxy.cfg

    global
        log /dev/log local0
        maxconn 50000
        user haproxy
        group haproxy

    defaults
        log global
        mode http
        option httplog
        option forwardfor       # add X-Forwarded-For
        option http-server-close
        timeout connect 5s
        timeout client  30s
        timeout server  30s

    frontend http_front
        bind *:80
        bind *:443 ssl crt /etc/haproxy/certs/example.com.pem
        redirect scheme https if !{ ssl_fc }   # redirect HTTP → HTTPS

        # ACL routing by domain
        acl is_api hdr(host) -i api.example.com
        use_backend api_servers if is_api
        default_backend web_servers

    backend web_servers
        balance roundrobin
        option httpchk GET /health    # health check
        server web1 10.0.0.1:8080 check
        server web2 10.0.0.2:8080 check
        server web3 10.0.0.3:8080 check backup

    backend api_servers
        balance leastconn
        server api1 10.0.1.1:8080 check
        server api2 10.0.1.2:8080 check

    # HAProxy stats
    listen stats
        bind *:8404
        stats enable
        stats uri /stats
        stats auth admin:password

    # Management
    systemctl enable --now haproxy
    haproxy -c -f /etc/haproxy/haproxy.cfg   # validate config
    # Statistics
    echo "show stat" | socat stdio /var/run/haproxy/admin.sock

### Health Checks

    # Nginx passive health checks (open source)
    upstream backend_pool {
        server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
        server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;
        # 3 failures within 30 seconds marks server as down
        # Retried after 30 seconds
    }

    # HAProxy health check
    backend web_servers
        option httpchk GET /health HTTP/1.1\r\nHost:\ example.com
        http-check expect status 200
        server web1 10.0.0.1:8080 check inter 5s rise 2 fall 3
        # inter 5s  - check every 5 seconds
        # rise 2    - 2 successes needed to re-add to rotation
        # fall 3    - 3 failures needed to remove from rotation

---

## Transparent Proxy

A Transparent Proxy intercepts traffic without any configuration on the client. The client does not know its traffic is going through a proxy.

    Flow:
      Client → (network) → [Transparent proxy intercepts] → Server
      Client configures nothing.
      Traffic is redirected to the proxy by network equipment (iptables, router).

    Interception methods:
      iptables REDIRECT/TPROXY - on a Linux gateway.
      Policy Based Routing - on a router.
      WCCP (Web Cache Communication Protocol) - on Cisco equipment.
      Inline device (network tap) - inserted into the network path.

    Use cases:
      Corporate filtering - all HTTP requests go through Squid.
      ISP-level caching.
      Captive portal - intercept for an auth page (guest Wi-Fi).
      SSL Inspection (MITM) - decrypt HTTPS in a corporate network.

### Traffic Interception via iptables

    # Redirect HTTP traffic to Squid (port 3128)
    # On the gateway/router:

    # REDIRECT - changes dst port, src IP remains
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

    # Exclude the proxy server itself (avoid loop)
    iptables -t nat -A PREROUTING -s 127.0.0.1 -j RETURN
    iptables -t nat -A PREROUTING -d 192.168.1.1 -j RETURN

    # TPROXY - more powerful, preserves original dst IP
    # Required for Squid in tproxy mode
    iptables -t mangle -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j TPROXY --tproxy-mark 1/1 --on-port 3128
    ip rule add fwmark 1 lookup 100
    ip route add local 0.0.0.0/0 dev lo table 100

    # Transparent mode in Squid
    http_port 3128 intercept      # for REDIRECT
    # http_port 3129 tproxy       # for TPROXY

    # Check rules
    iptables -t nat -L PREROUTING -n -v

### SSL Inspection (HTTPS Interception)

    SSL Inspection (MITM proxy) - decryption of HTTPS traffic.
    Used by corporate proxies: Zscaler, Cisco Umbrella, BlueCoat, Squid ssl-bump.

    How it works:
      1. Client → Proxy: ClientHello (CONNECT or transparent).
      2. Proxy generates a fake certificate for example.com,
         signed by the corporate CA.
      3. Client verifies the certificate → OK (corp CA is trusted).
      4. Proxy establishes a real TLS connection with example.com.
      5. Proxy sees all traffic in plaintext.
      6. Proxy can log, filter, or block.

    Flow:
      Client ←TLS with fake cert→ Proxy ←TLS with real cert→ Server

    Requirements:
      Corporate CA certificate must be installed on clients.
      Usually distributed via GPO (Windows AD) or MDM.

    Squid with SSL Bump:
      # /etc/squid/squid.conf
      http_port 3128 ssl-bump \
        cert=/etc/squid/ssl/ca.crt \
        key=/etc/squid/ssl/ca.key \
        generate-host-certificates=on \
        dynamic_cert_mem_cache_size=4MB

      # Bump rules
      acl step1 at_step SslBump1
      ssl_bump peek step1           # peek at SNI
      ssl_bump bump all             # decrypt everything
      # ssl_bump splice banking     # do not decrypt banking sites

    Ethical and legal considerations:
      SSL Inspection is a MITM attack, legal only with user consent.
      Corporate policy must inform employees.
      Cannot be applied to personal devices without consent.
      Some jurisdictions require explicit legal authorization.

    Certificate Pinning as defense:
      Some apps (mobile banking, messengers) implement pinning.
      Pinning means the app knows the specific server certificate.
      Proxy's fake certificate - app rejects the connection.

### Captive Portal

    Captive Portal - HTTP interception for an auth page (guest Wi-Fi, hotels).

    Flow:
      1. Client connects to Wi-Fi.
      2. Client makes an HTTP request to any site.
      3. Transparent proxy intercepts - redirects to portal.example.com/login.
      4. Client enters credentials on the portal.
      5. Portal adds the client MAC/IP to the whitelist.
      6. Subsequent requests pass through without interception.

    iptables for captive portal:
      # All unauthenticated clients
      iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 \
        ! -d 192.168.1.1 -j DNAT --to-destination 192.168.1.1:8080

      iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 \
        ! -d 192.168.1.1 -j DNAT --to-destination 192.168.1.1:8443

      # After auth, add to whitelist:
      iptables -I FORWARD -s <client_ip> -j ACCEPT

    Tools: NoDogSplash, CoovaChilli, pfSense Captive Portal.

---

## SOCKS Proxy

SOCKS (Socket Secure) - a universal proxy protocol at the transport layer. Works with any TCP/UDP traffic, not just HTTP.

    SOCKS4:
      TCP only.
      IPv4 only.
      No authentication.

    SOCKS4a:
      SOCKS4 + DNS resolution on the proxy side.

    SOCKS5 (RFC 1928):
      TCP and UDP.
      IPv4 and IPv6.
      DNS through proxy (prevents DNS leak).
      Authentication (username/password or GSS-API).

    Difference from HTTP proxy:
      HTTP proxy: understands HTTP, can modify headers.
      SOCKS proxy: blind tunnel, any TCP/UDP protocol.
      SOCKS does not add X-Forwarded-For.

    # SSH as SOCKS5 proxy
    ssh -D 1080 -N user@remote.server.com
    # -D 1080: SOCKS proxy on local port 1080
    # -N: do not execute a command (tunnel only)

    # Using SOCKS5
    curl --socks5 127.0.0.1:1080 https://example.com
    curl --socks5-hostname 127.0.0.1:1080 https://example.com  # DNS through proxy

    # Dante - SOCKS server
    apt install dante-server
    # /etc/danted.conf
    logoutput: syslog
    internal: 0.0.0.0 port = 1080
    external: eth0
    socksmethod: username
    clientmethod: none
    client pass { from: 10.0.0.0/8 to: 0.0.0.0/0 }
    socks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 method: username }

    # proxychains - run any program through SOCKS
    apt install proxychains4
    # /etc/proxychains4.conf
    [ProxyList]
    socks5 127.0.0.1 1080
    # Run any program through the proxy:
    proxychains4 curl https://example.com
    proxychains4 nmap -sT target.com

---

## Proxy Diagnostics

### Testing a Proxy

    # Test HTTP proxy
    curl -x http://proxy.example.com:3128 http://httpbin.org/ip
    curl -x http://user:pass@proxy.example.com:3128 https://httpbin.org/headers

    # Test SOCKS5
    curl --socks5-hostname proxy.example.com:1080 https://httpbin.org/ip

    # Test CONNECT tunnel manually
    openssl s_client -proxy proxy.example.com:3128 -connect example.com:443

    # Check headers the proxy adds
    curl -x http://proxy.example.com:3128 https://httpbin.org/headers
    # Shows X-Forwarded-For, Via, and other proxy headers

    # Check proxy does not block ports
    curl -v -x http://proxy.example.com:3128 https://api.github.com

### Squid Logs

    # access.log format
    # time elapsed client action/code size method URL user hierarchy/peer type
    tail -f /var/log/squid/access.log

    # Example line:
    # 1714985600.123 245 192.168.1.5 TCP_MISS/200 1234 GET http://example.com/ user1 DIRECT/93.184.216.34 text/html

    # TCP_MISS  - not in cache, fetched from server
    # TCP_HIT   - served from cache
    # TCP_DENIED - request denied by ACL
    # TCP_TUNNEL - HTTPS tunnel (CONNECT)

    # Log analysis
    awk '{print $3}' /var/log/squid/access.log | sort | uniq -c | sort -rn | head
    # top clients by request count

    awk '{print $7}' /var/log/squid/access.log | sed 's|https\?://||;s|/.*||' | \
      sort | uniq -c | sort -rn | head
    # top domains

    awk '$4 ~ /DENIED/ {print $3, $7}' /var/log/squid/access.log | head
    # blocked requests

### Diagnosing Nginx Reverse Proxy

    # Check Nginx is listening
    ss -tlnp | grep nginx
    curl -v http://localhost/

    # Check backend is reachable
    curl -v http://127.0.0.1:8080/

    # Nginx logs
    tail -f /var/log/nginx/access.log
    tail -f /var/log/nginx/error.log

    # Check upstream status
    curl http://localhost/nginx_status

    # Debug proxy_pass
    # Temporarily add to location:
    add_header X-Upstream-Addr $upstream_addr;
    add_header X-Upstream-Status $upstream_status;
    add_header X-Cache-Status $upstream_cache_status;

    # Check headers Nginx sends to backend
    # Start a temporary server on backend:
    python3 -m http.server 8080
    # or
    nc -l 8080   # and inspect raw headers

    # Common errors:
    # 502 Bad Gateway  - backend not responding or unreachable
    # 504 Gateway Timeout - backend responding too slowly
    # 413 Request Entity Too Large - exceeded client_max_body_size
    #   Fix: client_max_body_size 100m;
    # 400 Bad Request from backend - malformed headers
    #   Check proxy_set_header Host $host;

---

## Proxy Type Comparison

                Forward Proxy       Reverse Proxy       Transparent Proxy
    ─────────────────────────────────────────────────────────────────────────
    Who knows      client              server              nobody
    Placement      client side         server side         in the network (gw)
    Configuration  client              server              gateway only
    Purpose        anonymity,          load balancing,     filtering,
                   filtering           cache, SSL offload  cache, monitoring
    HTTPS          CONNECT tunnel      SSL termination     SSL Bump (MITM)
    Examples       Squid, Privoxy      Nginx, HAProxy,     Squid intercept,
                                       Traefik, Envoy      iptables REDIRECT
    Modifies       XFF headers         XFF headers         transparent
    traffic

---

## Cheat Sheet

    Forward Proxy:
      Client explicitly configures the proxy.
      HTTP: full URL in request (GET http://example.com/).
      HTTPS: CONNECT method → TCP tunnel.
      Headers: X-Forwarded-For, Via, Proxy-Authorization.

      # Squid
      http_port 3128
      http_access allow localnet
      squid -k reconfigure

      # Client
      export http_proxy=http://proxy:3128
      curl -x http://proxy:3128 https://example.com

    Reverse Proxy:
      Client unaware of proxy.
      Load balancing: round-robin, least_conn, ip_hash.
      SSL termination: TLS at proxy, HTTP to backend.
      Backend headers: X-Forwarded-For, X-Real-IP, X-Forwarded-Proto.

      # Nginx upstream
      upstream pool { server 10.0.0.1:8080; server 10.0.0.2:8080; }
      location / { proxy_pass http://pool; }

      # HAProxy
      frontend http_front
        bind *:80
        default_backend web_servers

    Transparent Proxy:
      iptables redirects traffic to the proxy.
      Client needs no configuration.
      HTTP: Squid intercept mode.
      HTTPS: SSL Bump (MITM, requires corp CA).

      # iptables
      iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3128
      # Squid
      http_port 3128 intercept

    SOCKS5:
      Universal tunnel (any TCP/UDP).
      DNS through proxy (no DNS leak).
      ssh -D 1080 user@server    # quick SOCKS5 via SSH
      curl --socks5-hostname 127.0.0.1:1080 https://example.com

    Diagnostics:
      curl -x http://proxy:3128 https://httpbin.org/headers  - proxy test + headers
      tail -f /var/log/squid/access.log   - Squid logs
      tail -f /var/log/nginx/error.log    - Nginx errors
      iptables -t nat -L -n -v            - interception rules
      ss -tlnp | grep -E 'nginx|squid'    - open ports

    Squid log codes:
      TCP_HIT    - from cache
      TCP_MISS   - from server
      TCP_DENIED - blocked by ACL
      TCP_TUNNEL - HTTPS CONNECT tunnel

---

## References

- [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) - HTTP Authentication (Proxy-Authorization)
- [RFC 7239](https://www.rfc-editor.org/rfc/rfc7239) - Forwarded HTTP Extension
- [RFC 1928](https://www.rfc-editor.org/rfc/rfc1928) - SOCKS Protocol Version 5
- [Squid Docs](http://www.squid-cache.org/Doc/) - Squid documentation
- [Nginx Proxy Module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) - Nginx proxy module
- [HAProxy Docs](https://www.haproxy.org/download/2.8/doc/configuration.txt) - HAProxy configuration
- [Nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html) - Nginx load balancing
- [Traefik Docs](https://doc.traefik.io/traefik/) - modern reverse proxy for containers
- [Envoy Proxy](https://www.envoyproxy.io/docs) - proxy for microservices (Istio, service mesh)
