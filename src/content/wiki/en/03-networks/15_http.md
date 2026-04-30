---
title: "HTTP/1.1 - методы, заголовки, статус коды"
date: "2026-05-01"
---

HTTP (HyperText Transfer Protocol) is an application layer protocol (L7) for transferring hypertext. The backbone of the web. HTTP/1.1 is defined in RFC 7230-7235 (2014, updating RFC 2616 from 1999). Runs over TCP, port 80 (HTTP) and 443 (HTTPS). Text-based protocol: requests and responses are human-readable plain text.

---

## HTTP Message Structure

### Request

```
GET /index.html HTTP/1.1\r\n
Host: www.example.com\r\n
User-Agent: Mozilla/5.0\r\n
Accept: text/html\r\n
Connection: keep-alive\r\n
\r\n
[request body - for POST/PUT/PATCH]

Format:
  [Method] [URI] [HTTP Version]\r\n   ← start line (Request Line)
  [Header]: [Value]\r\n               ← headers
  ...                                 ← more headers
  \r\n                                ← blank line (end of headers)
  [Body]                              ← body (optional)

\r\n = CRLF (Carriage Return + Line Feed) = 0x0D 0x0A
The blank line separates headers from the body.
```

### Response

```
HTTP/1.1 200 OK\r\n
Content-Type: text/html; charset=UTF-8\r\n
Content-Length: 1234\r\n
Date: Tue, 29 Apr 2026 10:00:00 GMT\r\n
Server: nginx/1.24\r\n
\r\n
<!DOCTYPE html>
<html>...

Format:
  [HTTP Version] [Status Code] [Reason Phrase]\r\n  ← Status Line
  [Header]: [Value]\r\n                             ← headers
  \r\n                                              ← blank line
  [Body]                                            ← body (optional)
```

### URI - Uniform Resource Identifier

```
Full URL format:
  scheme://userinfo@host:port/path?query#fragment

  https://user:pass@www.example.com:8080/api/v1/users?page=2&limit=10#section

  scheme:    https
  userinfo:  user:pass (rarely used in URLs)
  host:      www.example.com
  port:      8080 (standard ports 80/443 can be omitted)
  path:      /api/v1/users
  query:     page=2&limit=10 (parameters after ?)
  fragment:  section (anchor, after #, never sent to the server!)

Absolute URI:  GET http://www.example.com/path HTTP/1.1
Relative:      GET /path HTTP/1.1  (Host header identifies the server)
```

---

## HTTP Methods

### Method Overview

```
Method    Safe  Idempotent  Cacheable  Request Body
────────────────────────────────────────────────────
GET        yes     yes         yes        no*
HEAD       yes     yes         yes        no
POST       no      no          no**       yes
PUT        no      yes         no         yes
DELETE     no      yes         no         no*
CONNECT    no      no          no         no
OPTIONS    yes     yes         no         no*
TRACE      yes     yes         no         no
PATCH      no      no          no         yes

* technically possible but not conventional
** cacheability can be declared explicitly

Safe:
  Does not modify server state. Read-only.
  GET, HEAD, OPTIONS, TRACE.

Idempotent:
  Repeating the call with the same parameters yields the same result.
  GET, HEAD, PUT, DELETE, OPTIONS, TRACE.
  POST is NOT idempotent (repeating creates a duplicate).
```

### GET

```
Retrieve a resource. The most common method.
Must not change server state.
No request body (technically possible, but ignored by servers).
Parameters passed in the URL (query string).

Request:
  GET /api/users?page=1&limit=20 HTTP/1.1
  Host: api.example.com
  Accept: application/json
  Authorization: Bearer token123

Response:
  HTTP/1.1 200 OK
  Content-Type: application/json
  Content-Length: 512

  {"users": [...]}

Caching:
  GET responses are cached by browsers and proxies.
  Cache-Control, ETag, Last-Modified headers control caching.

URL limitations:
  URL length is limited by browsers/servers (~2000-8000 chars).
  Data is visible in URL (logs, browser history) → not suitable for secrets.
  Special characters must be encoded: space = %20, & = %26.
```

### HEAD

```
Identical to GET, but the server returns no response body.
Headers only.

Use cases:
  - Check whether a resource exists (without downloading it)
  - Get Content-Length before downloading
  - Check cache freshness (Last-Modified, ETag)
  - Check supported headers

Request:
  HEAD /big-file.zip HTTP/1.1
  Host: downloads.example.com

Response:
  HTTP/1.1 200 OK
  Content-Type: application/zip
  Content-Length: 1073741824    ← 1 GB, learned size without downloading
  Last-Modified: Mon, 28 Apr 2026 12:00:00 GMT
                                ← no body!
```

### POST

```
Send data to the server for processing.
Create a new resource.
Not idempotent: repeating may create a duplicate.

Body formats (determined by Content-Type):
  application/x-www-form-urlencoded  - HTML forms
  multipart/form-data                - files + forms
  application/json                   - API requests
  application/xml                    - SOAP, XML API
  text/plain                         - plain text

HTML form (application/x-www-form-urlencoded):
  POST /login HTTP/1.1
  Host: www.example.com
  Content-Type: application/x-www-form-urlencoded
  Content-Length: 29

  username=admin&password=secret

JSON API:
  POST /api/users HTTP/1.1
  Host: api.example.com
  Content-Type: application/json
  Content-Length: 45

  {"name": "Alice", "email": "alice@example.com"}

Successful creation response:
  HTTP/1.1 201 Created
  Location: /api/users/42    ← URI of the new resource
  Content-Type: application/json

  {"id": 42, "name": "Alice", ...}
```

### PUT

```
Create or fully replace a resource at the given URI.
Idempotent: repeating PUT with the same data = same result.

Difference from POST:
  POST /api/users       → server assigns the URI for the new resource
  PUT  /api/users/42    → client specifies the exact URI

  PUT replaces the resource ENTIRELY.
  If a field is missing from the PUT body → it will be deleted/nulled.

Request:
  PUT /api/users/42 HTTP/1.1
  Host: api.example.com
  Content-Type: application/json

  {"id": 42, "name": "Alice Updated", "email": "alice@example.com"}

Responses:
  200 OK          - resource updated, body with updated data
  201 Created     - resource created (didn't exist before)
  204 No Content  - success, no body
```

### PATCH

```
Partial update of a resource.
Difference from PUT: only changes specified fields, leaves others untouched.

Request (change only email):
  PATCH /api/users/42 HTTP/1.1
  Host: api.example.com
  Content-Type: application/json

  {"email": "newemail@example.com"}

Server updates only the email; the name stays the same.

JSON Patch (RFC 6902) - standard format for PATCH:
  PATCH /api/users/42 HTTP/1.1
  Content-Type: application/json-patch+json

  [
    {"op": "replace", "path": "/email", "value": "new@example.com"},
    {"op": "add", "path": "/phone", "value": "+1234567890"},
    {"op": "remove", "path": "/nickname"}
  ]

  Operations: add, remove, replace, move, copy, test.
```

### DELETE

```
Delete a resource.
Idempotent: deleting again = same result (resource doesn't exist).

Request:
  DELETE /api/users/42 HTTP/1.1
  Host: api.example.com
  Authorization: Bearer token123

Responses:
  200 OK          - deleted, body with confirmation
  204 No Content  - deleted, no body (preferred)
  404 Not Found   - resource doesn't exist
  403 Forbidden   - not allowed to delete
```

### OPTIONS

```
Query allowed methods and capabilities of a server/resource.

Request:
  OPTIONS /api/users HTTP/1.1
  Host: api.example.com

Response:
  HTTP/1.1 200 OK
  Allow: GET, POST, OPTIONS
  Content-Length: 0

CORS Preflight (the main use case for OPTIONS):
  Before a "complex" cross-origin request, the browser asks the server:
  "Will you allow me to send a POST with Content-Type: application/json
   from https://app.frontend.com?"

  OPTIONS /api/data HTTP/1.1
  Host: api.backend.com
  Origin: https://app.frontend.com
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: Content-Type, Authorization

  HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: https://app.frontend.com
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Max-Age: 86400   ← cache preflight for 24 hours
```

### CONNECT

```
Creates a tunnel through a proxy server.
Used for HTTPS through an HTTP proxy.

Client → Proxy:
  CONNECT www.example.com:443 HTTP/1.1
  Host: www.example.com:443

Proxy → Client:
  HTTP/1.1 200 Connection Established

The client now communicates directly with www.example.com through the tunnel.
The proxy just forwards bytes (cannot see HTTPS traffic).
```

### TRACE

```
Diagnostic method. Server echoes back the received request.
Lets you see what intermediate proxies have changed.

Disabled on most servers in practice (security risk).
XST vulnerability (Cross-Site Tracing) - TRACE allowed cookie theft.

Example (if enabled):
  TRACE / HTTP/1.1
  Host: example.com

  HTTP/1.1 200 OK
  Content-Type: message/http

  TRACE / HTTP/1.1
  Host: example.com
  [body = entire request, including headers added by proxies]
```

---

## HTTP Headers

### Request Headers

```
Host (mandatory in HTTP/1.1):
  Host: www.example.com
  Host: www.example.com:8080
  Identifies the virtual host (one IP, many sites).
  An HTTP/1.1 request without Host is invalid.

User-Agent:
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  Client identifier: browser, bot, curl.
  Server may change behavior (mobile version, bot blocking).
  Easily faked.

Accept:
  Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
  What the client is willing to receive (MIME types).
  q=0.9 = priority 0.9 (0 to 1, default 1).

Accept-Language:
  Accept-Language: en-US,en;q=0.9,de;q=0.7
  Preferred response languages.

Accept-Encoding:
  Accept-Encoding: gzip, deflate, br
  Supported compression algorithms.
  br = Brotli (better than gzip for web).
  Server responds with Content-Encoding: gzip if supported.

Content-Type (for requests with a body):
  Content-Type: application/json
  Content-Type: multipart/form-data; boundary=----FormBoundary123
  Content-Type: application/x-www-form-urlencoded

Content-Length:
  Content-Length: 348
  Body size in bytes. Required when body is present (unless chunked).

Authorization:
  Authorization: Basic dXNlcjpwYXNz           (Basic Auth, base64)
  Authorization: Bearer eyJhbGciOiJIUzI1Ni... (JWT token)
  Authorization: Digest username="user",...    (Digest Auth)
  Authorization: AWS4-HMAC-SHA256 ...          (AWS Signature)

Cookie:
  Cookie: session_id=abc123; theme=dark; lang=en
  Sends cookies to the server.

Referer [sic]:
  Referer: https://www.google.com/search?q=example
  Where the user came from. Original typo in the RFC (should be Referrer).
  Absent on direct URL entry, private mode, or HTTPS → HTTP transitions.

Origin:
  Origin: https://app.frontend.com
  Request source for CORS. No path (scheme + host + port only).

If-Modified-Since:
  If-Modified-Since: Mon, 28 Apr 2026 10:00:00 GMT
  Conditional request: return resource only if modified after this date.
  Server responds 304 Not Modified if unchanged.

If-None-Match:
  If-None-Match: "abc123def456"
  Conditional request by ETag.
  Return resource only if ETag has changed.
  Server responds 304 if ETag matches (resource unchanged).

Range:
  Range: bytes=0-1023          (first 1024 bytes)
  Range: bytes=1024-2047       (next 1024 bytes)
  Range: bytes=-500            (last 500 bytes)
  Partial download (HTTP range requests).
  Response: 206 Partial Content.

Connection:
  Connection: keep-alive       (HTTP/1.0 style, default in HTTP/1.1)
  Connection: close            (close connection after response)
  Connection: Upgrade          (signal protocol upgrade)

Upgrade:
  Upgrade: websocket
  Connection: Upgrade
  Request upgrade to WebSocket or HTTP/2.

X-Forwarded-For:
  X-Forwarded-For: 1.2.3.4, 10.0.0.1
  Real client IP (added by proxy/load balancer).
  List: first = original client, rest = proxies.
  Easily forged by clients → don't trust blindly.
  Modern alternative: Forwarded (RFC 7239).
```

### Response Headers

```
Content-Type:
  Content-Type: text/html; charset=UTF-8
  Content-Type: application/json
  Content-Type: image/png
  Content-Type: application/octet-stream   (binary data)
  Type and encoding of the response body.

Content-Length:
  Content-Length: 1234
  Body size in bytes.
  If absent - chunked encoding is used or the connection is closed.

Content-Encoding:
  Content-Encoding: gzip
  Content-Encoding: br
  Compression algorithm applied to the response body.
  Client decompresses before processing.

Transfer-Encoding:
  Transfer-Encoding: chunked
  Body delivered in pieces (chunks). Size unknown in advance.
  Each chunk: size (hex)\r\n + data\r\n.
  End: 0\r\n\r\n.

  Example chunked:
    HTTP/1.1 200 OK
    Transfer-Encoding: chunked

    4\r\n
    Wiki\r\n
    5\r\n
    pedia\r\n
    0\r\n
    \r\n

Location:
  Location: /api/users/42            (relative URI)
  Location: https://www.example.com/ (absolute URI)
  Used with 3xx (redirects) and 201 Created.

Set-Cookie:
  Set-Cookie: session=abc123; Path=/; HttpOnly; Secure; SameSite=Strict
  Set-Cookie: theme=dark; Path=/; Max-Age=2592000
  Sets cookies in the browser.
  Attributes:
    Path=/ - the cookie scope
    HttpOnly - not accessible via document.cookie (XSS protection)
    Secure - send over HTTPS only
    SameSite=Strict/Lax/None - CSRF protection
    Max-Age=N - lifetime in seconds
    Expires=date - expiry date

WWW-Authenticate:
  WWW-Authenticate: Basic realm="Admin Area"
  WWW-Authenticate: Bearer realm="api"
  Authentication challenge (returned with 401).

Server:
  Server: nginx/1.24.0
  Server: Apache/2.4.51 (Ubuntu)
  Server identifier. Often hidden for security reasons.

ETag:
  ETag: "abc123def456"
  ETag: W/"weaketag"   (weak ETag, W/ prefix)
  Resource version identifier. Used for caching.
  Client sends in If-None-Match for conditional requests.

Last-Modified:
  Last-Modified: Mon, 28 Apr 2026 12:00:00 GMT
  Last modification date of the resource.
  Client sends in If-Modified-Since.

Retry-After:
  Retry-After: 120          (seconds)
  Retry-After: Fri, 01 May 2026 10:00:00 GMT
  Used with 503 Service Unavailable and 429 Too Many Requests.

Allow:
  Allow: GET, HEAD, POST, OPTIONS
  Allowed methods (in response to 405 Method Not Allowed).

Content-Disposition:
  Content-Disposition: inline                         (display in browser)
  Content-Disposition: attachment; filename="file.pdf" (download)
  Content-Disposition: form-data; name="field"        (in multipart)

Strict-Transport-Security (HSTS):
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Browser must always use HTTPS for this domain.
  After receiving - browser blocks HTTP for max-age seconds.

X-Content-Type-Options:
  X-Content-Type-Options: nosniff
  Prevents MIME sniffing (browser must not guess Content-Type).

X-Frame-Options:
  X-Frame-Options: DENY           (no embedding in iframe)
  X-Frame-Options: SAMEORIGIN     (only same origin)
  Clickjacking protection. Superseded by CSP frame-ancestors.

Content-Security-Policy (CSP):
  Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com
  Content security policy. XSS protection.

Access-Control-Allow-Origin (CORS):
  Access-Control-Allow-Origin: *                       (all domains)
  Access-Control-Allow-Origin: https://app.example.com (specific)
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Expose-Headers: X-Custom-Header
  Access-Control-Max-Age: 86400
```

### Caching Headers

```
Cache-Control (request and response):
  Response directives:
    no-store           - do not cache at all (private data)
    no-cache           - cache but always revalidate with server
    private            - cache in browser only (not in proxies)
    public             - can be cached in proxies
    max-age=3600       - cache for 3600 seconds (1 hour)
    s-maxage=86400     - for shared caches (proxies)
    must-revalidate    - after expiry, must check with server
    immutable          - resource will never change (cache forever)
    stale-while-revalidate=60  - serve stale while revalidating

  Request directives:
    no-cache           - don't serve from cache without revalidating
    no-store           - don't store request/response in cache
    max-age=0          - require a fresh resource
    max-stale=60       - accept a resource stale by at most 60 sec

Expires (deprecated, superseded by Cache-Control):
  Expires: Wed, 30 Apr 2026 10:00:00 GMT
  Ignored if Cache-Control is present.

Pragma (deprecated):
  Pragma: no-cache
  HTTP/1.0 equivalent of Cache-Control: no-cache.

Example caching policies:
  # Static assets with hash in filename (forever):
  Cache-Control: public, max-age=31536000, immutable

  # HTML pages (always revalidate):
  Cache-Control: no-cache

  # API responses (no caching):
  Cache-Control: no-store

  # Public API data (5 minutes):
  Cache-Control: public, max-age=300, s-maxage=300
```

---

## HTTP Status Codes

### 1xx - Informational

```
100 Continue
  Server accepted the headers; client can send the body.
  Client sends Expect: 100-continue before a large body.
  If server replies 100 - send the body.
  If 417 Expectation Failed - body not needed.

101 Switching Protocols
  Server agrees to protocol switch (Upgrade).
  Used when upgrading to WebSocket or HTTP/2.

  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

102 Processing (WebDAV)
  Request accepted, still being processed, no response yet.
  Prevents client timeout.

103 Early Hints
  Preliminary headers while server prepares the response.
  Lets browser start loading resources early (Link: preload).
```

### 2xx - Success

```
200 OK
  Standard successful response. Body contains the requested data.
  GET → body with resource.
  POST → body with result or created resource.

201 Created
  Resource was created (response to POST or PUT).
  Location header points to the URI of the new resource.

202 Accepted
  Request accepted, but processing is not yet complete.
  Async operations: "task queued".
  No guarantee of successful processing.

204 No Content
  Success, no response body.
  DELETE (deleted), PUT/PATCH (updated, result not needed).
  Browser doesn't navigate to a new page (unlike 200 with empty body).

206 Partial Content
  Partial response (range request).
  Content-Range: bytes 0-1023/10240 (returned / total).

207 Multi-Status (WebDAV)
  Multiple operations, each with its own status.

208 Already Reported (WebDAV)
  Resource already included in a previous response.

226 IM Used
  Server fulfilled a GET with instance manipulations (delta encoding).
```

### 3xx - Redirects

```
300 Multiple Choices
  Multiple representations of the resource (formats, languages).
  Rarely used.

301 Moved Permanently
  Resource permanently moved. New URI in Location.
  Browser caches the redirect.
  Search engines transfer PageRank to the new URL.
  POST may become GET on redirect (some browsers).

302 Found (temporary redirect)
  Resource temporarily at a different URI.
  Browser doesn't cache.
  POST may become GET (ambiguous behavior, fixed by 303/307).

303 See Other
  Response to the request is at another URI.
  Always make GET to the new URI (even if original was POST).
  Post/Redirect/Get (PRG) pattern for forms.

304 Not Modified
  Resource hasn't changed (response to If-Modified-Since / If-None-Match).
  Browser uses cached version.
  No body. Saves bandwidth.

307 Temporary Redirect
  Temporary redirect preserving the request method.
  POST → POST to the new URI (unlike 302 where POST → GET).

308 Permanent Redirect
  Permanent redirect preserving the request method.
  POST → POST to the new URI (unlike 301 where POST → GET).

Redirect comparison:
  Permanent + preserves method:   308
  Permanent + changes to GET:     301
  Temporary + preserves method:   307
  Temporary + changes to GET:     302, 303
  For forms (POST → GET):         303
```

### 4xx - Client Errors

```
400 Bad Request
  Malformed request. Syntax error, invalid parameters.
  JSON won't parse, missing required field, wrong format.

401 Unauthorized
  Authentication required. (Despite the name, means unauthenticated.)
  Response includes WWW-Authenticate header.
  Difference from 403: 401 = "who are you?", 403 = "I know you, but no."

403 Forbidden
  Access denied. Authentication won't help.
  No permission for the resource. Or resource is hidden (consider 404 for security).

404 Not Found
  Resource not found. The most famous status code.
  Also used when a resource exists but is intentionally hidden.

405 Method Not Allowed
  Method not allowed for this URI.
  Response must include the Allow header with permitted methods.

406 Not Acceptable
  Server can't return content in any format from the Accept header.

408 Request Timeout
  Client took too long sending the request.
  Server closes the connection.

409 Conflict
  State conflict. Resource already exists, version is stale.
  PUT with an outdated version, duplicate unique record creation.

410 Gone
  Resource permanently deleted. Unlike 404 - it's definitely not coming back.
  Search engines should remove it from the index.

411 Length Required
  Content-Length is required for this request.

413 Content Too Large (formerly: Payload Too Large)
  Request body exceeds server limit.
  Typical: uploading a file that's too large.

414 URI Too Long
  URI is too long. Usually GET with a huge query string.

415 Unsupported Media Type
  Server doesn't support the request's Content-Type.
  Expected JSON, received XML.

416 Range Not Satisfiable
  Requested range is outside the resource.
  Content-Range: */10240 (no data / total size).

422 Unprocessable Content (formerly: Unprocessable Entity)
  Syntactically valid request but semantically wrong.
  JSON parses fine but data fails validation.
  Common in REST APIs: required field missing, value out of range.

423 Locked (WebDAV)
  Resource is locked.

424 Failed Dependency (WebDAV)
  Request failed because a prior dependent operation failed.

425 Too Early
  Server not willing to process due to replay attack risk (TLS early data).

429 Too Many Requests
  Rate limit exceeded. Retry-After header indicates when to try again.

431 Request Header Fields Too Large
  Request headers are too large.

451 Unavailable For Legal Reasons
  Resource unavailable for legal reasons (copyright, censorship).
  Reference to "Fahrenheit 451".
```

### 5xx - Server Errors

```
500 Internal Server Error
  Generic server error. Something went wrong.
  Unhandled exception, application crash.

501 Not Implemented
  Method not implemented by the server.
  Not the same as 405 (method not allowed for this URI).

502 Bad Gateway
  Proxy/load balancer received an invalid response from the upstream server.
  Nginx/HAProxy can't get a response from the backend.

503 Service Unavailable
  Server temporarily unavailable (overloaded or under maintenance).
  Retry-After indicates when to try again.

504 Gateway Timeout
  Proxy/load balancer didn't receive a response from upstream in time.
  Backend is stuck or too slow.

505 HTTP Version Not Supported
  Server doesn't support the HTTP version in the request.

507 Insufficient Storage (WebDAV)
  Not enough space to store the resource.

508 Loop Detected (WebDAV)
  Infinite loop detected during processing.

511 Network Authentication Required
  Network authentication required (Wi-Fi captive portal).

Difference between 502/503/504:
  502 Bad Gateway     - upstream returned garbage or crashed
  503 Unavailable     - server itself is down (connection limit)
  504 Gateway Timeout - upstream responds too slowly
```

---

## HTTP/1.1 Features

### Keep-Alive (Persistent Connections)

```
HTTP/1.0: each request = new TCP connection (slow).
HTTP/1.1: connection stays open for multiple requests.

Headers:
  Connection: keep-alive   (HTTP/1.0 style, default in HTTP/1.1)
  Keep-Alive: timeout=5, max=100
    timeout=5  - close if idle for 5 sec
    max=100    - max 100 requests on this connection

Closing the connection:
  Connection: close  (one side wants to close)
  Server closes on its own after a timeout.

HTTP/1.1 problem - Head-of-Line Blocking:
  Requests on one connection are processed in order (FIFO).
  A slow response for request N blocks requests N+1, N+2...
  Workaround: open multiple connections (browsers open 6-8 per host).
  Better solution: HTTP/2 (multiplexing).
```

### Chunked Transfer Encoding

```
Used when body size is unknown in advance (generated dynamically).
No Content-Length → use Transfer-Encoding: chunked.

Format:
  HTTP/1.1 200 OK
  Transfer-Encoding: chunked
  Content-Type: text/plain

  7\r\n          ← chunk size in hex (7 = 7 bytes)
  Mozilla\r\n    ← data
  9\r\n          ← next chunk (9 bytes)
  Developer\r\n
  7\r\n
  Network\r\n
  0\r\n          ← zero chunk = end
  \r\n           ← final blank line

Use cases: data streaming, Server-Sent Events, large files.
```

### Content Negotiation

```
Mechanism for selecting the best representation of a resource for a client.

Client states preferences:
  Accept: text/html, application/json;q=0.9, */*;q=0.8
  Accept-Language: en-US, de;q=0.8
  Accept-Encoding: gzip, br;q=0.9

Server picks the best match and responds:
  Content-Type: text/html; charset=UTF-8
  Content-Language: en
  Content-Encoding: gzip
  Vary: Accept, Accept-Language   ← cache must account for these headers!

Vary header:
  Specifies which request headers influence the response.
  Proxies/CDNs cache separate versions for different Vary values.
  Vary: Accept-Encoding → separate cache for gzip and non-gzip.
  Vary: * → don't cache (response is unique per request).
```

---

## Practical Usage and Diagnostics

### curl - Working with HTTP

```
# GET request
curl https://example.com
curl -v https://example.com     # verbose (headers)
curl -I https://example.com     # headers only (HEAD)
curl -s https://example.com     # silent (no progress bar)

# POST with JSON
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token123" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# POST with form data
curl -X POST https://example.com/login \
  -d "username=admin&password=secret"

# File upload (multipart)
curl -X POST https://api.example.com/upload \
  -F "file=@/path/to/file.pdf" \
  -F "name=document"

# PUT request
curl -X PUT https://api.example.com/users/42 \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Updated"}'

# DELETE
curl -X DELETE https://api.example.com/users/42

# Follow redirects
curl -L https://example.com

# Save to file
curl -o output.html https://example.com
curl -O https://example.com/file.zip    # filename from URL

# Custom headers
curl -H "X-Custom-Header: value" https://example.com

# Basic auth
curl -u username:password https://example.com

# Ignore SSL certificate errors
curl -k https://self-signed.example.com

# Print only status code
curl -s -o /dev/null -w "%{http_code}" https://example.com

# Print request timing
curl -s -o /dev/null -w "Time: %{time_total}s\n" https://example.com

# Full timing breakdown
curl -s -o /dev/null -w "
  DNS lookup:    %{time_namelookup}s
  TCP connect:   %{time_connect}s
  TLS handshake: %{time_appconnect}s
  TTFB:          %{time_starttransfer}s
  Total:         %{time_total}s
  HTTP code:     %{http_code}
" https://example.com
```

### httpie - Friendlier Alternative to curl

```
# Install
pip install httpie

# GET request
http https://api.example.com/users

# POST with JSON (automatic)
http POST https://api.example.com/users \
  name=Alice email=alice@example.com

# With headers
http GET https://api.example.com/users \
  Authorization:"Bearer token123" \
  Accept:application/json

# File upload
http --multipart POST https://api.example.com/upload \
  file@/path/to/file.pdf

# Basic auth
http -a username:password https://example.com
```

### Capturing HTTP in tcpdump / Wireshark

```
# tcpdump - HTTP traffic
tcpdump -i eth0 -A 'tcp port 80'
# -A = ASCII output (readable text)

# Save for Wireshark
tcpdump -i eth0 -w http.pcap 'tcp port 80 or tcp port 443'

# Wireshark filters:
http                           # all HTTP traffic
http.request.method == "POST"  # POST requests only
http.response.code == 404      # 404 responses only
http.host == "example.com"     # specific host
http.request.uri contains "/api" # URI contains /api
http && ip.addr == 1.2.3.4     # HTTP to/from specific IP

# mitmproxy - interactive HTTP proxy
pip install mitmproxy
mitmproxy --listen-port 8080
# Configure browser to use proxy 127.0.0.1:8080
# Lets you view/modify requests in real time

# Simple HTTP server for testing
python3 -m http.server 8080   # current directory on :8080
```

### Common Problems

```
Problem: 301/302 redirect loop
  Symptom: ERR_TOO_MANY_REDIRECTS in browser
  Diagnosis:
    curl -v --max-redirs 5 https://example.com
    # Check Location headers - where is it redirecting?
  Causes:
    - HTTPS redirects to HTTP which redirects back to HTTPS
    - Load balancer and app disagree on X-Forwarded-Proto
    - Cookie with Secure flag triggers HTTPS redirect

Problem: CORS errors in browser
  Symptom: "Access to fetch at '...' from origin '...' has been blocked"
  Diagnosis:
    # Check preflight response
    curl -X OPTIONS https://api.example.com/data \
      -H "Origin: https://app.frontend.com" \
      -H "Access-Control-Request-Method: POST" -v
  Server-side fix:
    Access-Control-Allow-Origin: https://app.frontend.com
    Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
    Access-Control-Allow-Headers: Content-Type, Authorization

Problem: slow TTFB (Time To First Byte)
  Diagnosis:
    curl -s -o /dev/null -w "%{time_starttransfer}" https://example.com
  Causes:
    - Slow server-side processing
    - Database is slow
    - No caching, everything recomputed
    - Slow DNS resolution

Problem: 413 on file upload
  nginx:  client_max_body_size 100m;
  Apache: LimitRequestBody 104857600
  PHP:    upload_max_filesize = 100M, post_max_size = 100M
```

---

## Cheat Sheet

```
HTTP methods:
  GET    - retrieve resource (safe, idempotent, cacheable)
  HEAD   - headers only, no body
  POST   - create resource / send data (NOT idempotent)
  PUT    - create or fully replace resource (idempotent)
  PATCH  - partially update resource
  DELETE - delete resource (idempotent)
  OPTIONS - get allowed methods (CORS preflight)

Key request headers:
  Host              required in HTTP/1.1
  Authorization     authentication (Basic, Bearer, Digest)
  Content-Type      request body type
  Accept            what client wants to receive
  Cookie            cookies
  If-None-Match     conditional request (ETag)
  If-Modified-Since conditional request (date)

Key response headers:
  Content-Type      response body type
  Set-Cookie        set a cookie
  Location          redirect target or created resource URI
  Cache-Control     caching policy
  ETag              resource version identifier
  WWW-Authenticate  authentication challenge (401)

Status codes (most important):
  200 OK              success with body
  201 Created         resource created
  204 No Content      success without body
  206 Partial         partial content (range)
  301 Moved Perm.     permanent redirect (GET)
  302 Found           temporary redirect (GET)
  303 See Other       redirect to GET (after POST)
  304 Not Modified    use cached version
  307 Temp. Redirect  temporary redirect (method preserved)
  308 Perm. Redirect  permanent redirect (method preserved)
  400 Bad Request     malformed request
  401 Unauthorized    authentication required
  403 Forbidden       access denied
  404 Not Found       resource not found
  405 Method NA       method not allowed
  409 Conflict        state conflict
  422 Unprocessable   validation error
  429 Too Many Req.   rate limited
  500 Server Error    server-side error
  502 Bad Gateway     upstream returned bad response
  503 Unavailable     server is down
  504 Gateway Timeout upstream timed out

curl quick reference:
  curl -v URL                           verbose output
  curl -I URL                           HEAD request
  curl -X POST -H "CT: app/json" -d '{}' URL  POST with JSON
  curl -s -o /dev/null -w "%{http_code}" URL  status code only
  curl -L URL                           follow redirects
```

---

## References

- [RFC 7230](https://www.rfc-editor.org/rfc/rfc7230) - HTTP/1.1: Message Syntax and Routing
- [RFC 7231](https://www.rfc-editor.org/rfc/rfc7231) - HTTP/1.1: Semantics and Content (methods, statuses, headers)
- [RFC 7232](https://www.rfc-editor.org/rfc/rfc7232) - HTTP/1.1: Conditional Requests (ETag, If-Modified-Since)
- [RFC 7233](https://www.rfc-editor.org/rfc/rfc7233) - HTTP/1.1: Range Requests
- [RFC 7234](https://www.rfc-editor.org/rfc/rfc7234) - HTTP/1.1: Caching
- [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) - HTTP/1.1: Authentication
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) - HTTP Semantics (consolidated, current)
- [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902) - JSON Patch
- [MDN HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP) - detailed documentation with examples
- [HTTP Status Dogs](https://httpstatusdogs.com) / [HTTP Cats](https://http.cat) - visual status code reference
