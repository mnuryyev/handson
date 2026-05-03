---
title: "SMTP, IMAP, POP3 - email protocols"
date: "2026-05-03"
---

Email runs on three protocols with distinct roles. SMTP sends mail. IMAP and POP3 deliver it to the client. Understanding each one helps diagnose mail problems, configure servers, and figure out why a message ended up in spam.

```
Overall message flow:

Sender             Sender's MTA         Recipient's MTA    Recipient
(Outlook/        (mail.sender.com)    (mail.rcpt.com)    (Gmail/
 Thunderbird)          │                    │             Thunderbird)
     │                 │                   │                  │
     │  SMTP (587)     │                   │                  │
     │────────────────►│                   │                  │
     │                 │  SMTP (25)        │                  │
     │                 │──────────────────►│                  │
     │                 │                   │  IMAP/POP3       │
     │                 │                   │◄─────────────────│
     │                 │                   │                  │

MTA = Mail Transfer Agent (mail server)
MUA = Mail User Agent (mail client)
MDA = Mail Delivery Agent (delivers to mailbox, e.g. Dovecot)
```

---

## SMTP - Simple Mail Transfer Protocol

SMTP (RFC 5321) is the protocol for sending and relaying email. Runs over TCP.

### SMTP ports

```
Port 25:   MTA-to-MTA (server-to-server). Direct relay between mail servers.
           ISPs block outbound port 25 for home users (spam prevention).
           No encryption by default (STARTTLS optional).

Port 587:  Mail Submission (client → server). Client submits mail
           to its own mail server. AUTH required. STARTTLS mandatory.
           The standard for MUAs.

Port 465:  SMTPS (SMTP over TLS, deprecated but widely used).
           Immediate TLS on connect (Implicit TLS).
           Supported by Gmail and many providers.

Port 2525: Alternative submission port (if 587 is blocked).

Modern recommendation for clients: 587 (STARTTLS) or 465 (Implicit TLS).
```

### SMTP session - commands and dialogue

```
Client (MUA/MTA)                      Server (MTA)
  │                                        │
  │◄─── 220 mail.example.com ESMTP ready ──│  greeting
  │                                        │
  │──── EHLO client.example.com ──────────►│  extended HELO
  │◄─── 250-mail.example.com               │
  │◄─── 250-SIZE 52428800                  │  max message size
  │◄─── 250-STARTTLS                       │  TLS support
  │◄─── 250-AUTH LOGIN PLAIN XOAUTH2       │  auth methods
  │◄─── 250-8BITMIME                       │  8-bit chars
  │◄─── 250 SMTPUTF8                       │  Unicode in addresses
  │                                        │
  │──── STARTTLS ─────────────────────────►│  request TLS
  │◄─── 220 Ready to start TLS ────────────│
  │     [TLS handshake]                    │
  │                                        │
  │──── EHLO client.example.com ──────────►│  repeat after TLS
  │◄─── 250-...                            │
  │                                        │
  │──── AUTH PLAIN base64(user:pass) ─────►│  authenticate
  │◄─── 235 Authentication successful ─────│
  │                                        │
  │──── MAIL FROM:<sender@example.com> ───►│  sender (envelope)
  │◄─── 250 OK                             │
  │                                        │
  │──── RCPT TO:<rcpt@gmail.com> ─────────►│  recipient
  │◄─── 250 OK                             │
  │──── RCPT TO:<cc@gmail.com> ───────────►│  another recipient (CC)
  │◄─── 250 OK                             │
  │                                        │
  │──── DATA ─────────────────────────────►│  begin message body
  │◄─── 354 Start mail input               │
  │──── From: "John" <sender@example.com> ►│
  │──── To: <rcpt@gmail.com>              ►│
  │──── Subject: Hello                    ►│
  │──── Date: Mon, 26 Apr 2024 10:00:00   ►│
  │──── MIME-Version: 1.0                 ►│
  │──── Content-Type: text/plain          ►│
  │────                                   ►│  blank line = end of headers
  │──── Message body...                   ►│
  │──── . ────────────────────────────────►│  single dot = end of DATA
  │◄─── 250 OK: queued as 1234567890 ──────│  message accepted into queue
  │                                        │
  │──── QUIT ─────────────────────────────►│
  │◄─── 221 Bye ───────────────────────────│
```

### Important: Envelope vs Header

```
An email has two distinct "From" fields:

Envelope From (Return-Path):
  MAIL FROM:<sender@example.com>
  Used for:
  - Bounce notifications (where to return if undeliverable)
  - SPF checking
  Does not have to match Header From

Header From:
  From: "John Doe" <john@example.com>
  What the user sees in their mail client.
  May differ from Envelope From.

Mailing list example:
  Envelope From: bounce@mailinglist.com   (for bounce processing)
  Header From:   newsletter@company.com   (what recipient sees)

This gap is exploited in phishing:
  Envelope From: legit@example.com
  Header From:   admin@bank.com  <- looks like the bank!

DMARC checks that Header From domain aligns with SPF/DKIM domain.
```

### SMTP response codes

```
1xx - Informational (rarely used)

2xx - Success
  211  System status / help reply
  214  Help message
  220  Service ready (greeting)
  221  Service closing (response to QUIT)
  235  Authentication successful
  250  OK (command executed)
  251  User not local, will forward
  354  Start mail input (response to DATA)

4xx - Temporary failure (retry is appropriate)
  421  Service unavailable (overloaded, try later)
  450  Mailbox unavailable (busy, try later)
  451  Local error in processing
  452  Insufficient storage
  454  TLS not available

5xx - Permanent failure (retry is pointless)
  500  Syntax error, command unrecognized
  501  Syntax error in parameters
  502  Command not implemented
  503  Bad sequence of commands
  535  Authentication failed
  550  Mailbox unavailable (doesn't exist, rejected by policy)
  551  User not local
  552  Storage exceeded
  553  Mailbox name not allowed
  554  Transaction failed (often: spam, blacklist)
```

```
# Manual SMTP dialogue via telnet
telnet mail.example.com 25
EHLO test.com
MAIL FROM:<test@test.com>
RCPT TO:<user@example.com>
DATA
Subject: Test
.
QUIT

# Via openssl (with TLS, port 587 or 465)
openssl s_client -connect smtp.gmail.com:587 -starttls smtp
# or
openssl s_client -connect smtp.gmail.com:465

# After TLS negotiates:
EHLO test.com
AUTH LOGIN
# base64 username
# base64 password

# Quick port check
nc -zv mail.example.com 25
telnet mail.example.com 25

# Find the MX and try connecting
MX=$(dig MX example.com +short | sort -n | head -1 | awk '{print $2}')
telnet $MX 25
```

### SMTP Extensions (ESMTP)

```
EHLO instead of HELO activates ESMTP extensions.
Server lists what it supports.

Extension       Description
---------       -----------
STARTTLS        Upgrade to TLS within the connection
SIZE n          Maximum message size in bytes
AUTH            Authentication (LOGIN, PLAIN, CRAM-MD5, XOAUTH2)
8BITMIME        8-bit characters in message body
SMTPUTF8        UTF-8 in email addresses (RFC 6531)
PIPELINING      Send multiple commands without waiting for replies
DSN             Delivery Status Notifications
CHUNKING        Send message in chunks (BDAT command)
BINARYMIME      Binary data without base64
REQUIRETLS      Require TLS for transmission (RFC 8689)
```

---

## MIME - message format

SMTP transmits text. MIME (RFC 2045-2049) adds attachments, HTML, and images.

```
Example of a multipart message:

From: sender@example.com
To: rcpt@example.com
Subject: Hello with attachment
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_Part_1234"

------=_Part_1234
Content-Type: multipart/alternative; boundary="----=_Alt_5678"

------=_Alt_5678
Content-Type: text/plain; charset=UTF-8

Plain text version for clients without HTML support.

------=_Alt_5678
Content-Type: text/html; charset=UTF-8

<html><body><p>HTML version of the message.</p></body></html>

------=_Alt_5678--

------=_Part_1234
Content-Type: application/pdf; name="document.pdf"
Content-Disposition: attachment; filename="document.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK...base64 data...

------=_Part_1234--
```

```
Content-Type hierarchy:
  multipart/mixed        - text + attachments
  multipart/alternative  - multiple versions (plain + html)
  multipart/related      - HTML + inline images
  multipart/signed       - signed message (S/MIME)
  multipart/encrypted    - encrypted message

Content-Transfer-Encoding:
  7bit      - ASCII only (default)
  8bit      - 8-bit characters (if server supports 8BITMIME)
  base64    - binary data, attachments
  quoted-printable - text with non-ASCII characters
```

---

## POP3 - Post Office Protocol v3

POP3 (RFC 1939) is a simple protocol for downloading mail from the server. Traditional model: download → delete from server.

### POP3 ports

```
Port 110:  POP3 (no encryption / STARTTLS)
Port 995:  POP3S (POP3 over TLS, Implicit TLS)
```

### POP3 session

```
Client                              Server
  │                                    │
  │◄─── +OK POP3 server ready ─────────│
  │                                    │
  │──── USER john@example.com ────────►│
  │◄─── +OK ───────────────────────────│
  │──── PASS mypassword ──────────────►│
  │◄─── +OK Logged in ─────────────────│
  │                                    │
  │──── STAT ─────────────────────────►│  how many messages
  │◄─── +OK 3 2948 ────────────────────│  3 messages, 2948 bytes
  │                                    │
  │──── LIST ─────────────────────────►│  list with sizes
  │◄─── +OK 3 messages                 │
  │◄─── 1 1024                         │  message 1: 1024 bytes
  │◄─── 2 512                          │
  │◄─── 3 1412                         │
  │◄─── .                              │  end of list
  │                                    │
  │──── RETR 1 ───────────────────────►│  retrieve message 1
  │◄─── +OK 1024 octets                │
  │◄─── [message content]              │
  │◄─── . ─────────────────────────────│
  │                                    │
  │──── DELE 1 ───────────────────────►│  mark for deletion
  │◄─── +OK                            │
  │                                    │
  │──── QUIT ─────────────────────────►│  exit (deletions applied)
  │◄─── +OK Bye ───────────────────────│
```

### POP3 commands

```
Authentication:
  USER name      - username
  PASS password  - password (plaintext! use TLS)
  APOP           - MD5 authentication (deprecated)
  AUTH           - SASL authentication

Message management:
  STAT           - message count and total size
  LIST [n]       - message list (or specific message)
  RETR n         - retrieve message n
  DELE n         - mark for deletion
  RSET           - cancel all DELE marks
  TOP n lines    - retrieve headers + first N lines
  UIDL [n]       - unique message ID (for sync)
  NOOP           - keepalive, does nothing
  QUIT           - exit (apply deletions)
```

### POP3 vs IMAP

```
                POP3                    IMAP
                ----                    ----
Model           Download and delete     Work on server
Multiple devices Poor (one device)      Excellent (synchronized)
Folders         No                      Yes (create and manage)
Search          On client (local)       On server (fast)
Partial fetch   No (only TOP)           Yes (headers, body parts)
Offline mode    Yes (everything local)  Partial (cache)
State stored    On client               On server
Storage used    Client disk             Server
Use when        Single device,          Multiple devices
                save server space       (phone + desktop)
```

---

## IMAP - Internet Message Access Protocol

IMAP (RFC 3501, IMAPv4) is a full-featured mail access protocol. Messages stay on the server; the client synchronizes.

### IMAP ports

```
Port 143:  IMAP (no encryption / STARTTLS)
Port 993:  IMAPS (IMAP over TLS, Implicit TLS)
```

### IMAP session

```
Client                                    Server
  │                                          │
  │◄─── * OK IMAP server ready ──────────────│  untagged response
  │                                          │
  │──── A001 CAPABILITY ────────────────────►│
  │◄─── * CAPABILITY IMAP4rev1 STARTTLS      │
  │         IDLE NAMESPACE MOVE LITERAL+     │
  │◄─── A001 OK                              │
  │                                          │
  │──── A002 STARTTLS ──────────────────────►│
  │◄─── A002 OK Begin TLS                    │
  │     [TLS handshake]                      │
  │                                          │
  │──── A003 LOGIN user@ex.com password ────►│
  │◄─── A003 OK Logged in                    │
  │                                          │
  │──── A004 LIST "" "*" ───────────────────►│  list folders
  │◄─── * LIST (\HasNoChildren) "/" INBOX    │
  │◄─── * LIST (\HasNoChildren) "/" Sent     │
  │◄─── * LIST (\HasNoChildren) "/" Trash    │
  │◄─── A004 OK List completed               │
  │                                          │
  │──── A005 SELECT INBOX ─────────────────►│  open folder
  │◄─── * 42 EXISTS                          │  42 messages
  │◄─── * 3 RECENT                           │  3 new
  │◄─── * OK [UNSEEN 40]                     │  first unread
  │◄─── * OK [UIDVALIDITY 1234567890]        │  sync identifier
  │◄─── * OK [UIDNEXT 43]                    │  next UID
  │◄─── * FLAGS (\Answered \Flagged          │
  │              \Deleted \Seen \Draft)      │
  │◄─── A005 OK SELECT completed             │
  │                                          │
  │──── A006 FETCH 1:5 (FLAGS ENVELOPE) ───►│  headers for msgs 1-5
  │◄─── * 1 FETCH (FLAGS (\Seen)             │
  │      ENVELOPE ("Mon, 26 Apr" "Subject"   │
  │      (("John" NIL "john" "ex.com"))...)) │
  │◄─── ...                                  │
  │◄─── A006 OK Fetch completed              │
  │                                          │
  │──── A007 FETCH 1 BODY[] ───────────────►│  full message 1
  │◄─── * 1 FETCH (BODY[] {1024}            │
  │◄─── [message content]                    │
  │◄─── A007 OK Fetch completed              │
  │                                          │
  │──── A008 STORE 1 +FLAGS (\Seen) ───────►│  mark as read
  │◄─── * 1 FETCH (FLAGS (\Seen))            │
  │◄─── A008 OK Store completed              │
  │                                          │
  │──── A009 IDLE ─────────────────────────►│  wait for new mail
  │◄─── + idling                             │
  │◄─── * 43 EXISTS                          │  new message arrived!
  │──── DONE ──────────────────────────────►│  exit IDLE
  │◄─── A009 OK IDLE terminated              │
  │                                          │
  │──── A010 LOGOUT ───────────────────────►│
  │◄─── * BYE IMAP server logging out        │
  │◄─── A010 OK Logout completed             │
```

### IMAP tags and response types

```
Every IMAP command has a tag (A001, A002...).
A response with the same tag = command completion.

Response types:
  A001 OK     - command completed successfully
  A001 NO     - command rejected (no permission, not found)
  A001 BAD    - syntax error
  * (untagged) - data or server notifications
  + (continue) - server awaits continuation (IDLE, APPEND)
```

### IMAP commands

```
Connection and state:
  CAPABILITY     - list server capabilities
  STARTTLS       - upgrade to TLS
  LOGIN / AUTHENTICATE - authenticate
  LOGOUT         - disconnect

Mailbox management:
  LIST           - list mailboxes
  LSUB           - list subscribed mailboxes
  SELECT         - open mailbox (read-write)
  EXAMINE        - open mailbox (read-only)
  CREATE         - create mailbox
  DELETE         - delete mailbox
  RENAME         - rename mailbox
  SUBSCRIBE/UNSUBSCRIBE - mailbox subscription
  STATUS         - mailbox statistics (without SELECT)
  NAMESPACE      - namespaces (INBOX, Personal...)

Message operations:
  FETCH          - retrieve messages or parts
  STORE          - change message flags
  COPY           - copy messages to another mailbox
  MOVE           - move messages (extension, RFC 6851)
  EXPUNGE        - permanently delete flagged (Deleted) messages
  APPEND         - add a message to a mailbox
  SEARCH         - search messages by criteria
  SORT           - sort results (extension)

Push notifications:
  IDLE           - wait for new mail (push instead of polling)
  NOTIFY         - extended notifications (RFC 5465)

Synchronization:
  UID commands   - use permanent UIDs instead of sequence numbers
  CONDSTORE      - optimized sync using MODSEQ
  QRESYNC        - fast resync after reconnect
```

### IMAP FETCH - message parts

```
You can fetch only what you need, not the whole message:

FETCH n ENVELOPE            - headers only (subject, from, to, date)
FETCH n FLAGS               - flags only (\Seen, \Answered...)
FETCH n BODY[HEADER]        - message headers
FETCH n BODY[TEXT]          - body only
FETCH n BODY[]              - entire message
FETCH n BODY[1]             - first MIME part
FETCH n BODY[1.TEXT]        - text of the first MIME part
FETCH n BODY[2]             - second MIME part (e.g. attachment)
FETCH n RFC822.SIZE         - size only
FETCH n BODYSTRUCTURE       - MIME structure without downloading

Efficient loading pattern:
  First FETCH ENVELOPE (message list with subjects)
  Then FETCH BODY[] only for messages the user opens
```

### IMAP SEARCH

```
SEARCH UNSEEN               - unread messages
SEARCH FROM "john"          - from john
SEARCH SUBJECT "invoice"    - with "invoice" in subject
SEARCH SINCE 26-Apr-2024    - since date
SEARCH BEFORE 26-Apr-2024   - before date
SEARCH LARGER 1000000       - larger than 1MB
SEARCH SMALLER 1000         - smaller than 1KB
SEARCH TEXT "hello"         - text in body
SEARCH HEADER X-Spam-Flag YES  - specific header
SEARCH ALL                  - all messages
SEARCH NEW                  - new (RECENT + UNSEEN)
SEARCH ANSWERED             - replied to
SEARCH DELETED              - marked for deletion

# Combining:
SEARCH UNSEEN FROM "boss"   - unread messages from boss
SEARCH OR FROM "a" FROM "b" - from a OR from b
SEARCH NOT SEEN             - unread
```

### IMAP flags

```
System flags (\ required):
  \Seen       - message has been read
  \Answered   - reply has been sent
  \Flagged    - marked (star in client)
  \Deleted    - marked for deletion (EXPUNGE removes)
  \Draft      - draft
  \Recent     - new since last session (server-set only)

User-defined keywords:
  $Forwarded  - forwarded
  $Phishing   - phishing (some clients)
  $Junk       - spam
  $NotJunk    - not spam

Modifying flags (STORE):
  +FLAGS (\Seen)       - add flag
  -FLAGS (\Seen)       - remove flag
  FLAGS (\Seen)        - set exactly these flags (replace)
```

---

## Email authentication - SPF, DKIM, DMARC

These mechanisms work on top of DNS and protect against sender forgery.

### SPF (Sender Policy Framework)

```
SPF is a DNS TXT record that lists the IP addresses allowed to send
email on behalf of a domain.

Record:
  example.com. IN TXT "v=spf1 ip4:1.2.3.4 include:_spf.google.com -all"

Recipient-side check:
  1. Take the Envelope From (MAIL FROM) domain: example.com
  2. Query DNS TXT: example.com → SPF record
  3. Check sending IP against SPF
  4. Result: Pass / Fail / SoftFail / Neutral / None

Qualifier at the end (all):
  +all = allow everyone (pointless)
  ~all = SoftFail (don't block, but flag as suspicious)
  -all = Fail (reject mail from unknown IPs)
  ?all = Neutral (no opinion)

SPF limitations:
  Checks Envelope From (not Header From).
  Breaks with forwarding (forwarding fails SPF).
  Max 10 DNS lookups per SPF record (otherwise PermerError).
```

```
# Check a domain's SPF record
dig TXT example.com | grep spf
dig TXT gmail.com | grep spf

# Validate SPF for a specific IP
python3 -m spf 1.2.3.4 sender@example.com example.com
# Or use: mxtoolbox.com/spf.aspx
```

### DKIM (DomainKeys Identified Mail)

```
DKIM is a digital signature on the message. It guarantees the message
was not modified in transit and was sent from a domain that owns the
private key.

How it works:
  1. Sending server signs headers + body with RSA/Ed25519.
  2. Signature is placed in the DKIM-Signature header.
  3. Public key stored in DNS TXT:
     selector._domainkey.example.com → public key

  4. Recipient:
     - Reads selector from DKIM-Signature header
     - Fetches public key from DNS
     - Verifies the signature

DKIM-Signature header:
  DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
    d=example.com;       <- domain (must align with Header From)
    s=selector1;         <- selector (key name)
    h=from:to:subject:date:message-id;  <- signed headers
    bh=base64(body hash);
    b=base64(header signature);

Canonicalization (c=):
  relaxed/relaxed  - normalize whitespace (survives forwarding)
  simple/simple    - strict (breaks if anything changes)
```

```
# Check a DKIM record
# Find the selector in the DKIM-Signature header of an incoming message
dig TXT selector1._domainkey.example.com

# Online check:
# mxtoolbox.com/dkim.aspx
# mail-tester.com (send a test email and get a report)
```

### DMARC (Domain-based Message Authentication, Reporting & Conformance)

```
DMARC ties together SPF and DKIM and specifies a policy for what to do
with messages that fail authentication.

DNS TXT record at _dmarc.example.com:
  "v=DMARC1; p=reject; rua=mailto:dmarc@example.com;
   ruf=mailto:forensics@example.com; pct=100; adkim=s; aspf=s"

Parameters:
  p=        policy (none / quarantine / reject)
  sp=       subdomain policy (if different)
  rua=      where to send aggregate reports (XML, daily)
  ruf=      where to send forensic reports (per violation)
  pct=      percentage of messages to apply policy to (1-100)
  adkim=    DKIM strictness (s=strict, r=relaxed)
  aspf=     SPF strictness (s=strict, r=relaxed)

Alignment:
  relaxed: DKIM/SPF domain must match Header From domain
           OR be its subdomain.
  strict:  must be an exact match.

Policies:
  none:        monitoring only (reports arrive, nothing blocked)
  quarantine:  deliver to spam
  reject:      reject the message (do not deliver)

Recommended rollout path:
  1. p=none + rua= (collect stats, block nothing)
  2. Analyze reports, fix legitimate sending sources
  3. p=quarantine pct=25 (start with 25%)
  4. p=quarantine pct=100
  5. p=reject pct=100
```

```
# Check a DMARC record
dig TXT _dmarc.example.com
dig TXT _dmarc.gmail.com +short

# Full email authentication check for a domain:
# mxtoolbox.com/emailhealth/
# dmarcian.com/dmarc-inspector/

# Analyzing DMARC aggregate reports:
# dmarcian.com, valimail.com, postmarkapp.com/dmarc
```

---

## Message headers - diagnostics

```
The message path is recorded in Received headers.
Read from bottom to top (most recent is at the top).

Received: from client.example.com (client.example.com [1.2.3.4])
        by mail.example.com with ESMTPS id abc123
        for <rcpt@gmail.com>; Mon, 26 Apr 2024 10:00:00 +0000

Received: from mail.example.com (mail.example.com [5.6.7.8])
        by mx.google.com with ESMTPS id xyz789
        for <rcpt@gmail.com>; Mon, 26 Apr 2024 10:00:05 +0000

Reading bottom to top:
  1. client.example.com → mail.example.com (client submission)
  2. mail.example.com → mx.google.com (MTA-to-MTA relay)

Other important headers:
  Return-Path:    Envelope From (bounce address)
  Message-ID:     Unique message ID (generated by sender)
  X-Spam-Score:   Spam score (SpamAssassin)
  X-Spam-Status:  Spam filter result
  Authentication-Results: SPF/DKIM/DMARC results
  DKIM-Signature: Digital signature
  X-Mailer:       Sender's mail client
  X-Forwarded-To: If the message was forwarded
```

```
# View message headers
# In Gmail: ⋮ → Show original
# In Outlook: File → Properties
# In Thunderbird: View → Headers → All

# Online header analysis:
# mxtoolbox.com/EmailHeaders.aspx
# toolbox.googleapps.com/apps/messageheader/
```

---

## Diagnosing email problems

### Message not delivered

```
Step 1 - check MX records
  dig MX example.com
  dig MX example.com +short

Step 2 - connect to the MX server manually
  MX=$(dig MX example.com +short | sort -n | awk 'NR==1{print $2}')
  telnet $MX 25
  EHLO test.com
  # See how the server responds

Step 3 - check if IP is blacklisted
  # Online: mxtoolbox.com/blacklists.aspx
  # Command:
  IP="1.2.3.4"
  for bl in zen.spamhaus.org bl.spamcop.net b.barracudacentral.org; do
    result=$(dig +short ${IP%.*}.${IP##*.*.}.$(echo $IP | awk -F. '{print $2"."$1}').$bl)
    [ -n "$result" ] && echo "BLACKLISTED: $bl ($result)"
  done

Step 4 - check SPF/DKIM/DMARC
  dig TXT domain | grep spf
  dig TXT _dmarc.domain
  # Online: mail-tester.com (send a test message)

Step 5 - check SMTP server logs
  # Postfix:
  tail -f /var/log/mail.log
  grep "status=" /var/log/mail.log | tail -20

  # Exim:
  tail -f /var/log/exim4/mainlog

  # Find a specific message:
  grep "rcpt@gmail.com" /var/log/mail.log | tail -10
```

### Message ends up in spam

```
Common causes:
  1. No PTR record (no reverse DNS for the sending IP)
  2. Missing or incorrect SPF
  3. No DKIM signature
  4. No DMARC
  5. IP on a blacklist
  6. Low domain reputation (new domain)
  7. Suspicious content (keywords, links)
  8. No List-Unsubscribe header (mailing lists)
  9. High bounce rate
  10. Spam complaints from recipients

Checks:
  # Full domain diagnostic
  # mail-tester.com - send a test email and get a score
  # mxtoolbox.com/emailhealth/ - check all parameters

  # Check PTR record
  dig -x 1.2.3.4 +short  # should return a hostname
  # PTR should match HELO/EHLO name

  # Check blacklists
  # mxtoolbox.com/blacklists.aspx

  # Deliverability testing
  # glockapps.com
  # senderscore.org (IP reputation)
  # postmaster.google.com (for Gmail delivery issues)
```

### SMTP errors and what they mean

```
421 Service temporarily unavailable
  → Server is overloaded. Retry in a few minutes.
  → Your MTA will queue it and retry automatically.

450 Requested mail action not taken
  → Temporary error, mailbox is busy.

451 Requested action aborted: local error
  → Internal server error. Retry later.

452 Too many emails sent or too many recipients
  → Limit exceeded. Retry later.

550 No such user here / User unknown
  → Recipient address doesn't exist. Do not retry.

550 Message rejected as spam
  → Message flagged as spam. Check SPF/DKIM/DMARC/blacklist.

551 User not local; please try forwarding
  → Recipient is not on this server and forwarding is not set up.

552 Message too large
  → Message exceeds the SIZE limit. Reduce size or split.

553 Mailbox name invalid
  → Recipient address is malformed.

554 Relay access denied
  → Server won't relay for this domain.
  → Trying to send through a foreign server without auth.
  → Or your IP is blacklisted.
```

---

## Postfix configuration (basics)

```
# /etc/postfix/main.cf - core settings

myhostname = mail.example.com      # FQDN of the mail server
mydomain = example.com             # domain
myorigin = $mydomain               # From domain for local mail
inet_interfaces = all              # listen on all interfaces
inet_protocols = all               # IPv4 and IPv6

# Who can send without authentication (localhost only)
mynetworks = 127.0.0.0/8 [::1]/128

# Where to deliver locally
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain

# TLS for incoming (MTA-to-MTA)
smtpd_tls_cert_file = /etc/ssl/certs/mail.crt
smtpd_tls_key_file = /etc/ssl/private/mail.key
smtpd_tls_security_level = may        # offer TLS but don't require it
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# TLS for outgoing
smtp_tls_security_level = may          # use TLS if available
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# Authentication (SASL via Dovecot)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination

# Limits
message_size_limit = 52428800      # 50 MB max message size
mailbox_size_limit = 0             # no mailbox size limit
```

```
# Manage Postfix
postfix start / stop / reload / status
postfix check           # validate configuration
postfix flush           # flush the queue immediately

# Queue management
mailq                   # view the queue
postqueue -p            # same as above
postqueue -f            # try to flush all queued messages
postsuper -d ALL        # delete everything from queue (careful!)
postsuper -d QUEUEID    # delete a specific message

# Logs
tail -f /var/log/mail.log
tail -f /var/log/mail.err
postcat -q QUEUEID      # view a queued message
```

---

## Cheat sheet

```
Ports:
  25   - SMTP MTA-to-MTA (often blocked by ISPs)
  465  - SMTPS (immediate TLS, for clients)
  587  - SMTP Submission (STARTTLS, for clients)
  110  - POP3
  995  - POP3S (TLS)
  143  - IMAP
  993  - IMAPS (TLS)

SMTP commands:
  EHLO     - introduce yourself (ESMTP)
  STARTTLS - request TLS upgrade
  AUTH     - authenticate
  MAIL FROM - sender (envelope)
  RCPT TO  - recipient
  DATA     - begin message body (end = line with a single dot)
  QUIT     - close the session

POP3 commands:
  USER / PASS  - authenticate
  STAT         - message count
  LIST         - message list with sizes
  RETR n       - download message
  DELE n       - mark for deletion
  QUIT         - apply deletions and exit

IMAP commands:
  LOGIN          - authenticate
  LIST "" "*"    - list folders
  SELECT INBOX   - open folder
  FETCH n BODY[] - download message
  STORE n +FLAGS (\Seen) - mark as read
  IDLE           - push notifications for new mail
  LOGOUT         - disconnect

Email authentication:
  SPF   - which IPs may send on behalf of the domain (DNS TXT)
  DKIM  - digital signature on the message (DNS TXT + header)
  DMARC - policy + reports (DNS TXT at _dmarc.domain)

Diagnostics:
  dig MX example.com               - MX records
  telnet mail.example.com 25       - manual SMTP
  openssl s_client -connect host:587 -starttls smtp
  dig TXT example.com | grep spf  - SPF record
  dig TXT _dmarc.example.com      - DMARC record
  tail -f /var/log/mail.log        - Postfix logs
  mailq                            - outbound queue
  mxtoolbox.com                    - online diagnostics
  mail-tester.com                  - deliverability test
```

---

## References

- [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321) - SMTP
- [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322) - Internet Message Format (headers)
- [RFC 1939](https://www.rfc-editor.org/rfc/rfc1939) - POP3
- [RFC 3501](https://www.rfc-editor.org/rfc/rfc3501) - IMAP4rev1
- [RFC 9051](https://www.rfc-editor.org/rfc/rfc9051) - IMAP4rev2 (2021, current)
- [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208) - SPF
- [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376) - DKIM
- [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) - DMARC
- [RFC 2045-2049](https://www.rfc-editor.org/rfc/rfc2045) - MIME
- [mxtoolbox.com](https://mxtoolbox.com) - comprehensive email diagnostics
- [mail-tester.com](https://www.mail-tester.com) - deliverability test
- [postmaster.google.com](https://postmaster.google.com) - Gmail delivery stats
