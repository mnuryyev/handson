---
title: "HTTP - Cookie, Session, CORS, CSP"
date: "2026-05-03"
---

HTTP is a stateless protocol. Every request is independent - the server doesn't remember previous ones. Cookie, Session, CORS, and CSP are mechanisms that add state, security, and access control on top of this base protocol.

---

## Cookie

A cookie is a small piece of data that a server sends to the browser. The browser stores it and automatically attaches it to every subsequent request to the same domain.

### How cookies work

```
Client                              Server
  │                                    │
  │  GET /login HTTP/1.1               │
  │───────────────────────────────────►│
  │                                    │  authentication passed
  │  HTTP/1.1 200 OK                   │
  │  Set-Cookie: session_id=abc123;    │
  │              HttpOnly; Secure;     │
  │              SameSite=Strict;      │
  │              Max-Age=3600          │
  │◄───────────────────────────────────│
  │                                    │
  │  GET /dashboard HTTP/1.1           │
  │  Cookie: session_id=abc123         │  browser adds this automatically
  │───────────────────────────────────►│
  │                                    │  we know who this is → serve data
  │  HTTP/1.1 200 OK                   │
  │◄───────────────────────────────────│
```

### Set-Cookie attributes

```
Set-Cookie: name=value; attributes...

Attribute        Description
---------        -----------
Domain=          Which domains to send the cookie to.
                 Domain=example.com → also send to sub.example.com
                 No Domain → current host only (not subdomains)

Path=            Which paths to send the cookie for.
                 Path=/ → all paths
                 Path=/api → only /api/*

Expires=         Expiry date (RFC 1123 format).
                 Browser deletes cookie after this date.
                 Expires=Wed, 09 Jun 2024 10:18:14 GMT

Max-Age=         Lifetime in seconds (takes priority over Expires).
                 Max-Age=3600 → 1 hour
                 Max-Age=0 → delete cookie immediately
                 Max-Age=-1 → session cookie (delete on tab close)

HttpOnly         Cookie is not accessible via JavaScript (document.cookie).
                 Protects against XSS cookie theft.
                 [no value - just a flag]

Secure           Cookie is only sent over HTTPS.
                 [no value - just a flag]

SameSite=        Controls sending on cross-site requests:
  Strict         Only when origin matches (CSRF protection)
  Lax            On navigation (clicking a link) - yes.
                 On AJAX/iframe/img cross-site - no. [default]
  None           Always send (requires Secure!)

Partitioned      CHIPS (Cookies Having Independent Partitioned State).
                 Cookies are isolated by top-level site.
                 For embedded/third-party content.
```

```
Set-Cookie examples:

# Session cookie (deleted when browser closes)
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax

# Persistent cookie (30 days)
Set-Cookie: user_pref=dark_mode; Max-Age=2592000; SameSite=Lax

# Cookie for subdomains
Set-Cookie: auth=token; Domain=example.com; Secure; HttpOnly

# Cookie for third-party content (requires Secure + Partitioned or None)
Set-Cookie: tracking=id; SameSite=None; Secure; Partitioned

# Delete a cookie
Set-Cookie: session=; Max-Age=0
```

```
# View cookies in browser:
# DevTools → Application → Storage → Cookies

# curl: view Set-Cookie in response
curl -v https://example.com 2>&1 | grep -i "set-cookie"

# curl: send a cookie
curl -b "session=abc123" https://example.com

# curl: save and reuse cookies (cookie jar)
curl -c cookies.txt -b cookies.txt https://example.com/login -d "user=a&pass=b"
curl -c cookies.txt -b cookies.txt https://example.com/dashboard
```

### Cookies in JavaScript

```javascript
// Read cookies (HttpOnly ones are not accessible!)
document.cookie
// "user=john; pref=dark; lang=en"

// Set a cookie
document.cookie = "user=john; max-age=3600; path=/; samesite=lax"
// Note: each assignment adds or updates a single cookie,
// it does NOT replace all cookies at once

// Delete a cookie (set an expired date)
document.cookie = "user=; max-age=0; path=/"

// Convenience function for reading
function getCookie(name) {
  const match = document.cookie.match(
    new RegExp('(^| )' + name + '=([^;]+)')
  )
  return match ? match[2] : null
}

// Cookie Store API (modern, async)
const cookie = await cookieStore.get('session')
await cookieStore.set('name', 'value')
await cookieStore.delete('name')
```

### Cookie limitations

```
Size:    ~4KB per cookie
Count:   ~50 cookies per domain (varies by browser)
Scope:   own domain only (cannot read another domain's cookies)

Third-party cookies:
  Site A embeds an iframe from tracker.com
  tracker.com sets its own cookie
  When visiting site B (also embeds tracker.com) -
  the same cookie is sent to tracker.com
  → cross-site user tracking

  Chrome blocks 3rd party cookies from 2024
  Firefox/Safari have blocked them for years
  Alternatives: Storage Access API, CHIPS, FedCM
```

---

## Session

A session is a server-side concept for storing user state. The cookie holds a session identifier; the actual data lives on the server.

### Cookie-based session

```
Flow:

1. User logs in:
   POST /login {username, password}
   → Server verifies credentials
   → Creates session: sessions["abc123"] = {user_id: 42, role: "admin"}
   → Set-Cookie: session_id=abc123; HttpOnly; Secure

2. Next request:
   GET /api/data
   Cookie: session_id=abc123
   → Server looks up sessions["abc123"]
   → Finds user_id=42 → knows who this is

3. Logout:
   POST /logout
   → Server deletes sessions["abc123"]
   → Set-Cookie: session_id=; Max-Age=0
```

```
Server-side session storage options:

In-memory (dict/map):
  + Fast
  - Lost on restart
  - Doesn't work across multiple servers (no shared state)

Redis:
  + Fast, persistent, works across multiple servers
  + Built-in TTL (auto-expire)
  - Extra service to run

Database:
  + Reliable
  - Slower (disk I/O on every request)

Example with Redis (Python/Flask):
  from flask import Flask, session
  from flask_session import Session
  import redis

  app.config['SESSION_TYPE'] = 'redis'
  app.config['SESSION_REDIS'] = redis.from_url('redis://localhost')
  Session(app)
```

### JWT (JSON Web Token) - Stateless Session

```
JWT is an alternative to server-side sessions. Data is stored in the
token itself, signed by the server. The server holds no state.

JWT structure:
  header.payload.signature

  Header (base64url):
  {
    "alg": "HS256",
    "typ": "JWT"
  }

  Payload (base64url):
  {
    "sub": "42",           // user id
    "name": "John",
    "role": "admin",
    "iat": 1714000000,     // issued at (unix timestamp)
    "exp": 1714003600      // expires at
  }

  Signature:
  HMAC-SHA256(base64url(header) + "." + base64url(payload), secret)

Verification: recompute the signature → if it matches → token is unmodified.
```

```
JWT vs Cookie Session:

                Cookie Session      JWT
                ──────────────      ───
Storage         Server (Redis)      Client (cookie/localStorage)
Request size    Small (just ID)     Larger (full token)
Revocation      Easy (delete it)    Hard (requires blacklist)
Scaling         Needs shared store  None (stateless)
Data            Anything (server)   Only what's in token (visible!)

Where to store JWT on the client:
  HttpOnly Cookie:  safe from XSS, CSRF is possible
  localStorage:     XSS vulnerability (!), no CSRF
  In memory (JS):   safe from both, lost on page refresh

Recommendation: HttpOnly Cookie + SameSite=Strict/Lax

JWT revocation problem:
  User logs out, but the token is still valid.
  Solution: short-lived access token (15 min) + refresh token.
  Refresh token stored in HttpOnly cookie.
  Access token (JWT) is short-lived, kept in memory.
```

```bash
# Decode a JWT (without verifying signature)
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiJ9.xxx" | \
  cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool

# jwt-cli
jwt decode eyJ...
jwt encode --secret mysecret --alg HS256 '{"sub":"42","exp":9999999999}'

# Online JWT inspector: jwt.io
```

### Session Fixation and other attacks

```
Session Fixation:
  Attacker knows a session_id before login (e.g. from URL).
  Victim logs in → that session_id becomes authenticated.
  Attacker uses the known session_id.

  Defence: always create a NEW session_id after login.
  (session regeneration)

Session Hijacking:
  Theft of session_id (XSS, network sniffing).

  Defence:
  - HttpOnly (no JS access)
  - Secure (HTTPS only)
  - Short TTL + re-auth

Brute Force of session_id:
  If ID is predictable (sequential) → enumeration attack.

  Defence: cryptographically secure PRNG for ID generation.
  Python: secrets.token_hex(32)
  Node.js: crypto.randomBytes(32).toString('hex')
```

---

## CORS - Cross-Origin Resource Sharing

CORS is a browser mechanism for controlling cross-origin requests. It allows or denies JavaScript on one origin from fetching resources on another origin.

### Same-Origin Policy

```
Same-Origin Policy (SOP) is a fundamental browser security policy.
A script on a page can only make requests to the same origin.

Origin = protocol + host + port
  https://example.com:443  <- one origin
  https://api.example.com  <- different (different host)
  http://example.com       <- different (different protocol)
  https://example.com:8080 <- different (different port)

Without SOP:
  You visit evil.com
  JavaScript on evil.com makes a request to bank.com/api/balance
  With your cookies → reads your data → sends it to the attacker

SOP prevents this: evil.com cannot read responses from bank.com.

But sometimes cross-origin requests are legitimately needed:
  frontend.example.com → api.example.com
  app.com → fonts.googleapis.com, cdn.cloudflare.com
  → That's what CORS is for.
```

### How CORS works

```
Two types of CORS requests:

1. Simple Request:
   Methods: GET, HEAD, POST
   Headers: only simple ones (Content-Type: text/plain,
            application/x-www-form-urlencoded, multipart/form-data)

   Browser sends the request immediately + Origin header:

   GET /api/data HTTP/1.1
   Origin: https://frontend.example.com   <- browser adds this

   Server responds:
   Access-Control-Allow-Origin: https://frontend.example.com
   (or * for public APIs)

   Browser checks → if origin is allowed → JS gets the response.

2. Preflight Request:
   Non-standard methods (PUT, DELETE, PATCH) or headers
   (Authorization, Content-Type: application/json, etc.)

   Browser first sends OPTIONS:

   OPTIONS /api/data HTTP/1.1
   Origin: https://frontend.example.com
   Access-Control-Request-Method: DELETE
   Access-Control-Request-Headers: Authorization, Content-Type

   Server: "OK, I allow it":
   HTTP/1.1 204 No Content
   Access-Control-Allow-Origin: https://frontend.example.com
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE
   Access-Control-Allow-Headers: Authorization, Content-Type
   Access-Control-Max-Age: 86400   <- cache preflight for 24 hours

   Only then does the browser send the actual request.
```

### CORS headers

```
Request (browser adds):
  Origin: https://frontend.example.com
  Access-Control-Request-Method: PUT        (in preflight)
  Access-Control-Request-Headers: Auth      (in preflight)

Response (server must return):
  Access-Control-Allow-Origin: https://frontend.example.com
    or * (for public APIs without credentials)

  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS

  Access-Control-Allow-Headers: Authorization, Content-Type, X-Custom

  Access-Control-Allow-Credentials: true
    Required if the request includes credentials (cookie, Authorization).
    With credentials you CANNOT use * in Allow-Origin!
    You must specify the exact origin.

  Access-Control-Max-Age: 86400
    How long the browser caches the preflight response.

  Access-Control-Expose-Headers: X-Custom-Header
    Which response headers JS can access (default: basic ones only).
```

```
# Check CORS headers
curl -H "Origin: https://frontend.example.com" \
     -H "Access-Control-Request-Method: DELETE" \
     -X OPTIONS \
     https://api.example.com/resource -v 2>&1 | grep -i "access-control"

# Simulated browser preflight
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://api.example.com/data

# Check that the API returns the right origin
curl -H "Origin: https://evil.com" https://api.example.com/data -v 2>&1 | \
  grep "Access-Control-Allow-Origin"
# Should NOT return https://evil.com or *
```

### CORS on the server

```nginx
# Nginx CORS configuration

# Simple version (public API)
add_header Access-Control-Allow-Origin *;

# Correct version (with credentials and specific origins)
map $http_origin $cors_origin {
    default "";
    "https://app.example.com"    $http_origin;
    "https://admin.example.com"  $http_origin;
}

server {
    location /api/ {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin $cors_origin;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type";
            add_header Access-Control-Allow-Credentials true;
            add_header Access-Control-Max-Age 86400;
            return 204;
        }

        add_header Access-Control-Allow-Origin $cors_origin;
        add_header Access-Control-Allow-Credentials true;
        proxy_pass http://backend;
    }
}
```

```python
# FastAPI CORS
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Express.js CORS
const cors = require('cors')
app.use(cors({
    origin: ['https://app.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400
}))
```

### Common CORS errors

```
Error: "Access to fetch at '...' has been blocked by CORS policy"
  Causes:
  1. No Access-Control-Allow-Origin header
  2. Origin doesn't match Allow-Origin
  3. Allow-Origin: * + credentials: true (forbidden combination)
  4. Preflight returned an error (4xx/5xx)
  5. No OPTIONS handler on the server

Error: "The value of 'Access-Control-Allow-Credentials' header
         in the response is '' which must be 'true'"
  Fix: add Access-Control-Allow-Credentials: true

Error: wildcard + credentials
  NOT allowed: Access-Control-Allow-Origin: *
               Access-Control-Allow-Credentials: true
  Required:    Access-Control-Allow-Origin: https://specific.domain
               Access-Control-Allow-Credentials: true

Dangerous configuration (never do this!):
  Access-Control-Allow-Origin: $http_origin without a whitelist
  → any origin is allowed
  → any website can make requests on behalf of the user
```

---

## CSP - Content Security Policy

CSP is an HTTP header (or meta tag) that tells the browser where it is allowed to load resources from. Its primary purpose is XSS (Cross-Site Scripting) prevention.

### How CSP works

```
Without CSP:
  <script src="https://evil.com/malware.js"></script>
  Or injected into HTML: <script>document.cookie → evil.com</script>
  Browser executes everything.

With CSP:
  Content-Security-Policy: script-src 'self' https://cdn.example.com

  <script src="https://evil.com/malware.js"></script>
  → Browser blocks it (evil.com not in whitelist)

  <script>document.cookie</script>
  → Browser blocks it (inline scripts are forbidden by default)
```

### CSP directives

```
Content-Security-Policy: directive1 'values'; directive2 'values'

Resource directives:
  default-src    Fallback for all types (used if no specific directive)
  script-src     JavaScript
  style-src      CSS
  img-src        Images
  font-src       Fonts
  connect-src    fetch(), XMLHttpRequest, WebSocket
  media-src      audio, video
  frame-src      iframe
  child-src      iframe and Web Workers
  worker-src     Web Workers, Service Workers
  manifest-src   Web App Manifest
  object-src     <object>, <embed> (recommend 'none')
  base-uri       <base> tag (protects against base tag injection)
  form-action    where forms are allowed to submit

Navigation directives:
  frame-ancestors  Who can embed this page in an iframe
                   (replaces X-Frame-Options)

Reporting directives:
  report-uri     URL to send violations to (deprecated)
  report-to      Reporting API group (modern)

Special directives:
  upgrade-insecure-requests  Rewrite http:// to https:// automatically
  block-all-mixed-content    Block mixed content
```

### CSP source values

```
'none'          Nothing is allowed
'self'          Same origin only
'unsafe-inline' Allow inline scripts/styles (weakens CSP!)
'unsafe-eval'   Allow eval(), setTimeout(string) (weakens CSP!)
'strict-dynamic' Scripts can load other scripts (nonce-based)
'unsafe-hashes' Allow specific inline hashes

https:          Any HTTPS source
http:           Any HTTP source (not recommended)

https://cdn.example.com        Specific domain
https://*.example.com          Subdomains of example.com
https://cdn.example.com/libs/  Specific path

'nonce-RANDOM_STRING'         One-time token for inline script
'sha256-HASH_OF_CONTENT'      Hash of a specific inline script
```

### CSP policy examples

```
# Strict policy (recommended for most sites)
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';

# With nonce for inline scripts (strict and practical)
Content-Security-Policy:
  script-src 'nonce-{RANDOM}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';

  In HTML:
  <script nonce="RANDOM_VALUE">
    // this script is allowed
  </script>

  Nonce is a random string generated by the server per request.
  The attacker doesn't know the nonce → can't inject a script with it.

# With hashes (for static inline scripts)
Content-Security-Policy:
  script-src 'sha256-abc123=='

  Browser computes SHA-256 of each inline script.
  Match → allow. Change the script → hash won't match → blocked.

# Report-Only mode (test CSP without blocking)
Content-Security-Policy-Report-Only:
  default-src 'self';
  report-uri /csp-violations

  Browser does NOT block, but sends violation reports.
  Use this for testing before enforcing in production.
```

### Nonce-based CSP (best practice)

```
Problem with 'unsafe-inline': allows any inline script.
Solution: nonce - a unique token generated per request.

Python/Flask example:
  import secrets

  @app.before_request
  def set_csp_nonce():
      g.nonce = secrets.token_urlsafe(16)

  @app.after_request
  def add_csp_header(response):
      response.headers['Content-Security-Policy'] = \
          f"script-src 'nonce-{g.nonce}' 'strict-dynamic'; object-src 'none'"
      return response

  In template:
  <script nonce="{{ g.nonce }}">...</script>

'strict-dynamic':
  A script with a nonce can dynamically load other scripts.
  Required for SPAs (React, Vue) that import modules at runtime.
```

### CSP violation reports

```
Collecting CSP violation reports:

report-uri (deprecated but supported):
  Content-Security-Policy: ...; report-uri /csp-report

  Browser POSTs JSON on a violation:
  {
    "csp-report": {
      "document-uri": "https://example.com/page",
      "violated-directive": "script-src",
      "blocked-uri": "https://evil.com/script.js",
      "source-file": "https://example.com/page",
      "line-number": 42,
      "column-number": 10
    }
  }

Reporting API (modern):
  Report-To: {"group":"csp-endpoint","max_age":86400,
              "endpoints":[{"url":"/csp-report"}]}
  Content-Security-Policy: ...; report-to csp-endpoint

Services for collecting CSP reports:
  report-uri.com  (paid SaaS)
  Own endpoint: log and analyze violations
```

```
# Check a site's CSP header
curl -s -I https://example.com | grep -i "content-security-policy"

# Verbose check
curl -s -I https://google.com | grep -i "csp\|content-security"

# Check CSP in browser:
# DevTools → Network → select request → Response Headers → Content-Security-Policy

# Analyze a CSP policy:
# csp-evaluator.withgoogle.com  (Google CSP Evaluator)
# report-uri.com/home/analyse
```

---

## How it all fits together: Cookie + Session + CORS + CSP

```
Full picture for a typical SPA:

frontend.example.com          api.example.com
       │                            │
       │  1. Login (POST /auth)     │
       │──────────────────────────►│
       │                            │  create session / JWT
       │  Set-Cookie: session=abc;  │
       │  HttpOnly; Secure; Lax     │
       │◄──────────────────────────│
       │                            │
       │  2. API request            │
       │  GET /api/data             │
       │  Cookie: session=abc       │  browser adds automatically
       │  Origin: https://frontend  │  browser adds
       │──────────────────────────►│
       │                            │  CORS check:
       │                            │  origin allowed? ✓
       │                            │  credentials? ✓
       │  Access-Control-Allow-Origin: https://frontend.example.com
       │  Access-Control-Allow-Credentials: true
       │  Content-Security-Policy: script-src 'self'; ...
       │◄──────────────────────────│

CSP from api.example.com protects data in the response.
CORS controls access to the API.
Session cookie handles authentication.
HttpOnly - can't be stolen via XSS.
SameSite=Lax - CSRF protection.
```

---

## CSRF - Cross-Site Request Forgery

CSRF is closely related to cookies and SameSite.

```
CSRF attack:
  1. Victim is logged into bank.com (has session cookie)
  2. Victim visits evil.com
  3. evil.com contains:
     <img src="https://bank.com/transfer?to=evil&amount=1000">
     or a form that auto-submits
  4. Browser makes request to bank.com (and ATTACHES the cookie!)
  5. bank.com executes the transfer

Defences:
  SameSite=Strict:
    Cookie is not sent on cross-site requests.
    Full CSRF protection.
    Downside: a link from another site also won't send the cookie
    (user appears logged out when following external links).

  SameSite=Lax (default):
    Cookie is sent on navigation (GET).
    Cookie is NOT sent on POST, img, iframe cross-site.
    Protects against most CSRF attacks.

  CSRF Token:
    Server generates a random token, embeds it in the form.
    Token is verified on submission.
    evil.com doesn't know the token → can't forge the request.

  Double Submit Cookie:
    Cookie + identical value in header/body.
    Server compares cookie and header.
```

---

## Diagnostics

```
# View all security headers
curl -s -I https://example.com | grep -iE \
  "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions"

# Check CORS
curl -s -I \
  -H "Origin: https://test.com" \
  -X OPTIONS \
  https://api.example.com/endpoint | grep -i "access-control"

# Check cookie attributes
curl -c - -s https://example.com | head

# Online header analysis:
# securityheaders.com - header grader
# observatory.mozilla.org - Mozilla Observatory
# csp-evaluator.withgoogle.com - CSP analysis
```

---

## Cheat sheet

```
Cookie:
  Set-Cookie: name=value; HttpOnly; Secure; SameSite=Lax; Max-Age=3600
  HttpOnly    - no JS access (XSS theft protection)
  Secure      - HTTPS only
  SameSite=   Strict (full)/Lax (navigation)/None (always, needs Secure)
  Max-Age=0   - delete the cookie

Session:
  Cookie Session: ID on client, data on server (Redis)
  JWT:           data in token (stateless), needs blacklist for revoke
  Storing JWT:   HttpOnly Cookie (best) > memory > localStorage (dangerous)
  Regenerate session_id after login (fixation protection)

CORS:
  Simple requests (GET/HEAD/simple POST): just Origin + check response
  Preflight (PUT/DELETE/custom headers): OPTIONS first
  Allow-Origin: *  - cannot be used with credentials!
  Allow-Credentials: true - requires specific origin, not *
  Max-Age - cache preflight (fewer OPTIONS requests)

CSP:
  script-src 'self'          - own scripts only
  'unsafe-inline'            - dangerous, avoid
  'nonce-XYZ'               - best option for inline scripts
  'strict-dynamic'           - for SPAs (nonce + dynamic imports)
  object-src 'none'          - always set this
  frame-ancestors 'none'     - block iframe embedding (replaces X-Frame-Options)
  Report-Only                - test CSP without blocking

CSRF protection:
  SameSite=Strict/Lax  - primary defence
  CSRF Token           - for forms (double-submit pattern)
  Origin check         - verify the Origin header on the server

Minimum security headers:
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  Content-Security-Policy: default-src 'self'; ...
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY  (or frame-ancestors 'none' in CSP)
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
```

---

## References

- [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265) - HTTP State Management Mechanism (Cookie)
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) - Cookie update (SameSite, Secure prefix)
- [Fetch Spec CORS](https://fetch.spec.whatwg.org/#cors-protocol) - CORS specification
- [CSP Level 3](https://www.w3.org/TR/CSP3/) - Content Security Policy Level 3
- [OWASP Session Management](https://owasp.org/www-project-cheat-sheets/cheatsheets/Session_Management_Cheat_Sheet)
- [OWASP CSRF Prevention](https://owasp.org/www-project-cheat-sheets/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet)
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com) - CSP analysis
- [securityheaders.com](https://securityheaders.com) - header grader
- [jwt.io](https://jwt.io) - JWT decoder
