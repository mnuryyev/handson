---
title: "FTP, FTPS, SFTP - Differences and Vulnerabilities"
date: "2026-05-03"
---

Three file transfer protocols with similar names but fundamentally different architectures. FTP (1971) is the classic, unencrypted protocol. FTPS is FTP + TLS. SFTP is an SSH subsystem with no relation to FTP whatsoever. Understanding the differences is critical: choosing the wrong protocol means transmitting credentials and data in plaintext.

---

## FTP - File Transfer Protocol

### History and Basics

```
FTP (RFC 959, 1985 — main; RFC 354, 1972 — original).
One of the oldest internet protocols.
Designed for file transfer between hosts in ARPANET.

Design characteristics:
  - Designed before the era of internet security.
  - No encryption: everything in plaintext (login, password, data).
  - Two separate TCP connections: control and data.
  - Supports binary and ASCII transfer modes.

Ports:
  TCP 21 — control connection (command channel)
  TCP 20 — data connection in active mode
  Random port > 1024 — data connection in passive mode
```

### Two FTP Channels

```
The defining characteristic of FTP: two separate TCP connections.

Control Connection:
  - Port 21 on the server
  - Opened by the client at connection time
  - Stays open for the entire session
  - Carries commands (LIST, RETR, STOR...) and responses (150, 200, 550...)
  - Text protocol (human-readable commands)

Data Connection:
  - Created fresh for each file operation or directory listing
  - Closed after the transfer completes
  - Carries actual data (file contents, directory listings)
  - ASCII mode: line endings converted (\r\n ↔ \n)
  - Binary (IMAGE) mode: byte for byte

The two-channel design is the root cause of many NAT and firewall problems.
```

### Active Mode (PORT)

```
In active mode the server initiates the data connection to the client.

Client (192.168.1.10)             Server (1.2.3.4)
  │                                      │
  │── TCP SYN → 1.2.3.4:21 ────────────►│  (client connects to port 21)
  │◄── TCP SYN-ACK ──────────────────────│
  │── Login, commands ──────────────────►│
  │◄── 220, 230, ... ────────────────────│
  │                                      │
  │── PORT 192,168,1,10,195,210 ────────►│  client says: "Connect back
  │   (sends own IP:port)                │   to me at 192.168.1.10:50130"
  │◄── 200 PORT command successful ──────│
  │                                      │
  │── LIST ─────────────────────────────►│
  │◄── 150 Opening data connection ──────│
  │                                      │
  │   Server → TCP SYN on port 50130     │
  │◄── TCP SYN (from 1.2.3.4:20) ────────│  (server connects TO the client!)
  │── TCP SYN-ACK ──────────────────────►│
  │                                      │
  │◄══ directory listing data ═══════════│  data through new connection
  │◄── 226 Transfer complete ────────────│

Active mode problem:
  The server initiates a connection TO the client.
  Client's firewall/NAT blocks incoming connections.
  Result: active mode often doesn't work behind NAT.
```

### Passive Mode (PASV)

```
In passive mode the client initiates both connections.

Client (192.168.1.10)             Server (1.2.3.4)
  │                                      │
  │── PASV ─────────────────────────────►│  client requests passive mode
  │◄── 227 Entering Passive Mode         │
  │    (1,2,3,4,195,150)  ───────────────│  server provides IP:port for data
  │                                      │  IP: 1.2.3.4, Port: 195*256+150=50070
  │                                      │
  │── LIST ─────────────────────────────►│
  │◄── 150 Opening data connection ──────│
  │                                      │
  │── TCP SYN → 1.2.3.4:50070 ──────────►│  (client connects to server!)
  │◄── TCP SYN-ACK ──────────────────────│
  │                                      │
  │◄══ directory listing data ═══════════│
  │◄── 226 Transfer complete ────────────│

Advantage: the client initiates both connections.
Client firewall allows outbound → passive mode works behind NAT.

EPSV (Extended Passive Mode, RFC 2428):
  For IPv6 and large port numbers.
  Response: 229 Entering Extended Passive Mode (|||50070|)
  Only the port, no IP (client uses the already-known server IP).
```

### FTP Commands

```
Authentication:
  USER username    - send username
  PASS password    - send password (PLAINTEXT!)
  QUIT             - end session

Navigation:
  PWD              - print working directory
  CWD directory    - change directory
  CDUP             - go up one level (..)
  MKD directory    - make directory
  RMD directory    - remove directory

Listing:
  LIST             - file listing (with details, like ls -l)
  NLST             - filenames only
  MLSD             - machine-readable listing (RFC 3659)
  STAT             - server or file status

File transfer:
  RETR filename    - download a file (retrieve)
  STOR filename    - upload a file (store)
  STOU             - upload with unique name
  APPE filename    - append to file
  DELE filename    - delete file
  RNFR old_name   - rename from
  RNTO new_name   - rename to
  SIZE filename    - get file size

Transfer mode:
  TYPE A           - ASCII mode (line ending conversion)
  TYPE I           - Binary/Image mode (byte for byte, default for files)
  MODE S           - Stream mode (standard)

Data connection:
  PORT h1,h2,h3,h4,p1,p2  - active mode (client IP and port)
  PASV             - passive mode
  EPSV             - extended passive (IPv6)
  EPRT             - extended active (IPv6)

Misc:
  SYST             - server OS type
  FEAT             - supported extensions
  NOOP             - no-op (keepalive)
  ABOR             - abort current transfer
  REST offset      - resume from position (resume download)
```

### FTP Response Codes

```
1xx — preliminary positive response:
  125 Data connection already open; transfer starting
  150 File status okay; about to open data connection

2xx — completed positive response:
  200 Command okay
  220 Service ready for new user (server greeting)
  221 Service closing control connection (QUIT)
  226 Closing data connection (transfer complete)
  227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
  229 Entering Extended Passive Mode
  230 User logged in, proceed
  250 Requested file action okay, completed

3xx — intermediate response (more action needed):
  331 User name okay, need password
  350 Requested file action pending further information (REST)

4xx — transient negative response:
  421 Service not available, closing control connection
  425 Can't open data connection
  426 Connection closed; transfer aborted
  450 Requested file action not taken (file busy)
  451 Requested action aborted: local error in processing

5xx — permanent negative response:
  500 Syntax error, command unrecognized
  501 Syntax error in parameters or arguments
  502 Command not implemented
  503 Bad sequence of commands
  530 Not logged in (authentication failed)
  550 Requested action not taken (file not found, no permission)
  553 Requested action not taken (invalid filename)
```

---

## FTPS - FTP over TLS

### What FTPS Is

```
FTPS (RFC 4217) — FTP with TLS encryption added on top.
NOT a new protocol — it's FTP + a TLS wrapper.
Retains FTP's two-channel architecture.
Adds encryption for both command and data channels.

Two variants of FTPS:

FTPS Explicit (FTPS/E, AUTH TLS):
  Client connects to the standard port 21.
  Explicitly requests encryption with AUTH TLS command.
  Server agrees — they upgrade to TLS.
  After TLS: normal FTP commands over an encrypted channel.
  Can start without encryption and upgrade.
  Port: 21 (same as plain FTP).

FTPS Implicit (FTPIS):
  Encryption from the first byte — TLS handshake immediately.
  Client connects to port 990.
  No option to operate without TLS.
  Deprecated; many clients don't support it.
  Port: 990 (data: 989).
```

### FTPS Explicit - Connection Process

```
Client                               Server (port 21)
  │── TCP SYN → port 21 ────────────►│
  │◄── 220 FTP Server Ready ──────────│  (greeting, no TLS yet)
  │                                   │
  │── AUTH TLS ─────────────────────►│  request TLS
  │◄── 234 AUTH TLS OK ───────────────│  server agrees
  │                                   │
  │══ TLS Handshake ════════════════════│  establish TLS
  │   (ClientHello, ServerHello,       │
  │    Certificate, Finished...)       │
  │                                   │
  │── USER username ────────────────►│  now everything is encrypted!
  │◄── 331 Password required ─────────│
  │── PASS password ────────────────►│  password is encrypted!
  │◄── 230 User logged in ─────────────│
  │                                   │
  │── PBSZ 0 ───────────────────────►│  Protection Buffer Size = 0
  │◄── 200 PBSZ=0 ────────────────────│
  │── PROT P ───────────────────────►│  encrypt data channel too!
  │◄── 200 Protection level set to P ─│
  │                                   │
  │── PASV / EPSV ──────────────────►│
  │◄── 227 Entering Passive Mode... ──│
  │                                   │
  │── RETR file.txt ────────────────►│
  │◄── 150 Opening TLS data... ───────│
  │                                   │
  │══ TLS Handshake (data channel) ════│  separate TLS for data!
  │◄══ encrypted file data ════════════│
  │◄── 226 Transfer complete ─────────│

PBSZ and PROT commands:
  PBSZ 0 — Protection Buffer Size (0 for TLS streaming)
  PROT C — Clear (data NOT encrypted, only commands are)
  PROT P — Private (data encrypted with TLS)
  PROT E — Confidential (encryption without integrity, deprecated)
  PROT S — Safe (integrity without encryption, deprecated)

  Without PROT P → file data goes in plaintext even if commands are encrypted!
```

### FTPS and NAT/Firewall - the Main Problem

```
FTPS inherits FTP's two-channel problems and adds new ones.

Problem 1: firewall can't inspect the data channel
  Plain FTP: firewall sees PASV response (IP:port) and opens a rule.
  FTPS: command channel is encrypted → firewall can't see PASV response.
  → Firewall doesn't know which port to open for data.
  → Data channel is blocked.

Solutions:
  1. Configure the FTPS server to use a fixed port range.
     Open that range on the firewall statically.

     vsftpd example:
       pasv_min_port=50000
       pasv_max_port=50100

     Firewall: allow TCP 50000-50100 inbound.

  2. Use SFTP instead of FTPS (no two-channel problem).

Problem 2: mismatched IP in PASV response
  Server behind NAT reports its internal IP in the PASV response.
  Client tries to connect to the internal IP → fails.

  vsftpd fix:
    pasv_address=1.2.3.4  (the real external IP)
    pasv_addr_resolve=YES (if using a hostname instead of IP)

Problem 3: ALG (Application Layer Gateway) interference
  Some routers have an FTP ALG that "helps" FTP through NAT.
  FTP ALG doesn't understand FTPS (encrypted) → can break the connection.
  Disable FTP ALG when using FTPS.
```

---

## SFTP - SSH File Transfer Protocol

### What SFTP Is

```
SFTP (SSH File Transfer Protocol, RFC draft) — NOT FTP!
It is an SSH subsystem for file transfer.
Developed by OpenSSH/IETF as part of the SSH-2 protocol.

Key differences from FTP/FTPS:
  - Single TCP connection (no command/data channel split)
  - Everything encrypted by SSH (no separate TLS)
  - Runs over an SSH tunnel (port 22)
  - Binary protocol (not text like FTP)
  - No passive/active mode (not needed!)
  - No NAT problems (single connection)
  - Supports symbolic links, permissions, file ownership
  - Atomic operations, transfer resumption
  - Built-in SSH key authentication

Port: TCP 22 (same as SSH).
```

### SFTP Architecture

```
SFTP runs as an SSH subsystem:

Client → SSH connection (TCP 22) → SSH tunnel → SFTP subsystem on server

SSH connection:
  1. TCP handshake (port 22)
  2. SSH handshake (key exchange, host key verification)
  3. Authentication (password or key)
  4. Open SSH channel with request "subsystem sftp"
  5. Server starts sftp-server process
  6. Client and server exchange SFTP packets over the SSH channel

SFTP protocol (over SSH):
  Version 3 — most common (OpenSSH).
  Version 6 — extended (less support).

  SFTP packet:
    uint32  length       (packet length)
    uint8   type         (message type)
    uint32  request-id   (for response matching)
    <data depends on type>
```

### SFTP Message Types

```
Initialization:
  SSH_FXP_INIT     (1)  - client → server, protocol version
  SSH_FXP_VERSION  (2)  - server → client, version + extensions

File operations:
  SSH_FXP_OPEN     (3)  - open file (read/write/append)
  SSH_FXP_CLOSE    (4)  - close file/directory
  SSH_FXP_READ     (5)  - read data
  SSH_FXP_WRITE    (6)  - write data
  SSH_FXP_LSTAT    (7)  - stat (don't follow symlinks)
  SSH_FXP_FSTAT    (8)  - stat by handle
  SSH_FXP_SETSTAT  (9)  - set attributes
  SSH_FXP_FSETSTAT (10) - setstat by handle
  SSH_FXP_OPENDIR  (11) - open directory
  SSH_FXP_READDIR  (12) - read directory contents
  SSH_FXP_REMOVE   (13) - delete file
  SSH_FXP_MKDIR    (14) - create directory
  SSH_FXP_RMDIR    (15) - remove directory
  SSH_FXP_REALPATH (16) - resolve absolute path
  SSH_FXP_STAT     (17) - stat (follow symlinks)
  SSH_FXP_RENAME   (18) - rename file
  SSH_FXP_READLINK (19) - read symlink
  SSH_FXP_SYMLINK  (20) - create symlink

Responses:
  SSH_FXP_STATUS   (101) - operation status (OK, error, ...)
  SSH_FXP_HANDLE   (102) - handle for open file/directory
  SSH_FXP_DATA     (103) - file data
  SSH_FXP_NAME     (104) - file names/attributes
  SSH_FXP_ATTRS    (105) - file attributes

Status codes (SSH_FXP_STATUS):
  SSH_FX_OK                (0)  - success
  SSH_FX_EOF               (1)  - end of file
  SSH_FX_NO_SUCH_FILE      (2)  - file not found
  SSH_FX_PERMISSION_DENIED (3)  - no permission
  SSH_FX_FAILURE           (4)  - general failure
  SSH_FX_BAD_MESSAGE       (5)  - bad packet
  SSH_FX_OP_UNSUPPORTED    (8)  - operation not supported
```

---

## Comparison Table

```
Feature              FTP           FTPS (Explicit)   SFTP
────────────────────────────────────────────────────────────────────────
Standard             RFC 959       RFC 4217          SSH subsystem (draft)
Port(s)              21 + dynamic  21 + dynamic      22 (one!)
Connections          2 (cmd+data)  2 (cmd+data)      1 (SSH tunnel)
Encryption           NONE          TLS               SSH (AES, ChaCha20...)
Authentication       Login/pass    Login/pass        Login/pass,
                     (plaintext!)  (encrypted)       SSH keys (better!)
Headers visible      Everything!   No                No
Certificate          No            Yes (TLS)         No (host key)
NAT problems         Major         Very major        NONE
Firewall             Complex       Very complex      One port 22
Resume transfer      Yes (REST)    Yes (REST)        Yes
Symlinks             No            No                Yes
File permissions     No            No                Yes
Binary protocol      No (text)     No (text)         Yes
Performance          Medium        Lower (TLS)       Good
MITM without TLS     Vulnerable    Protected         Protected
Passive mode         Required      Required          Not needed
Wide support         Yes           Partial           Yes
```

---

## SCP - Secure Copy (Bonus)

```
SCP (Secure Copy Protocol) — another file transfer method over SSH.
Older than SFTP, simpler functionality.

Differences from SFTP:
  - Only copies files (no listing, no navigation)
  - No transfer resumption
  - No pre-transfer file existence check on server
  - Problems with spaces and special characters in filenames

Two SCP modes:
  Legacy SCP: uses rcp-compatible protocol, has vulnerabilities.
    A file can "escape" the target directory.
    CVE-2019-6111, CVE-2019-6109 vulnerabilities.

  SCP with SFTP backend: modern OpenSSH uses SFTP internally.
    scp -s flag or newer OpenSSH defaults.

SCP commands:
  scp file.txt user@host:/remote/path/
  scp user@host:/remote/file.txt ./local/
  scp -r directory/ user@host:/remote/
  scp -P 2222 file.txt user@host:/path/   # non-standard port

Recommendation: use SFTP instead of SCP for new projects.
OpenSSH 9.0+ (2022): legacy SCP deprecated, SFTP backend is default.
```

---

## Vulnerabilities and Attacks

### FTP - Plaintext (Critical)

```
Problem 1: credential interception
  All FTP commands are plaintext.
  tcpdump or any sniffer on the network sees:
    USER admin
    PASS secretpassword123

  Attack:
    # Intercept FTP traffic
    tcpdump -i eth0 -A 'tcp port 21'
    # Login and password instantly visible

    # Via ARP spoofing (MITM on local network)
    arpspoof -i eth0 -t 192.168.1.10 192.168.1.1
    tcpdump -i eth0 -A 'tcp port 21'

Problem 2: data interception
  Files are transferred in plaintext.
  Confidential documents, databases, keys → visible on the network.

  # Reconstruct files from tcpdump capture
  tcpflow -r capture.pcap
  # Get individual files per stream

Problem 3: MITM attack
  Without encryption MITM is trivial.
  Attacker can substitute files on the fly.
  User won't notice the substitution.

Problem 4: Bounce attack (FTP Bounce, RFC 2577)
  Uses the PORT command to make the server connect to a third host.
  PORT 10,0,0,1,0,80   → server connects to 10.0.0.1:80
  The FTP server becomes a proxy for scanning/attacking other hosts.

  Defense: reject PORT commands with IPs other than the client's.
  Modern servers do this by default.

Problem 5: Anonymous FTP
  Many servers allow connections without a password (USER anonymous).
  If misconfigured → access to the filesystem.
  Configs, backups, sensitive files are often found.

  # Check for anonymous FTP
  ftp target.com
  > USER anonymous
  > PASS anyemail@example.com
```

### FTP Brute Force

```
FTP has no built-in rate limiting.
Without protection: thousands of attempts per second.

# FTP brute force (Hydra)
hydra -l admin -P /usr/share/wordlists/rockyou.txt ftp://target.com
hydra -L users.txt -P passwords.txt ftp://target.com -t 4

# Protection:
  fail2ban for FTP:
    /etc/fail2ban/jail.conf:
    [vsftpd]
    enabled = true
    port = ftp
    filter = vsftpd
    logpath = /var/log/vsftpd.log
    maxretry = 3
    bantime = 3600

  Limit connections:
    vsftpd: max_per_ip=3

  Whitelist IPs:
    /etc/hosts.allow:
    vsftpd: 192.168.1.0/24
    vsftpd: ALL EXCEPT ALL
```

### FTPS - Vulnerabilities

```
Problem 1: partial encryption (PROT C)
  Without PROT P — file data goes in plaintext.
  Commands are encrypted (USER, PASS are protected).
  But file contents travel unencrypted!

  Force encryption in vsftpd:
    force_local_data_ssl=YES    (force SSL for data channel)
    force_local_logins_ssl=YES  (force SSL for login)

Problem 2: self-signed/unverified certificates
  Clients often accept any certificate.
  MITM with a fake certificate → success.

  Certificate validation in clients:
    FileZilla: Settings → FTP → FTP over TLS settings → "Require valid certificate"
    lftp: set ssl:verify-certificate true

Problem 3: TLS downgrade
  Client tries AUTH TLS → server/MITM says "not supported" → client falls back to FTP.
  Data flows unencrypted.

  Defense: client must refuse if AUTH TLS is rejected.
  FileZilla: "Require explicit FTP over TLS" in settings.

Problem 4: FTP heritage
  All FTP NAT problems remain.
  Firewall can't see the PASV response (encrypted).
  FTP bounce attacks are still potentially possible.

Problem 5: outdated TLS versions
  Old FTPS servers may use TLS 1.0/1.1 or SSL 3.0.
  Must explicitly configure minimum TLS version.

  vsftpd:
    ssl_tlsv1_2=YES
    ssl_sslv2=NO
    ssl_sslv3=NO
```

### SFTP - Vulnerabilities

```
SFTP is significantly more secure than FTP and FTPS, but not without issues.

Problem 1: weak passwords + exposed port 22
  Port 22 is scanned by bots 24/7.
  Brute force attacks on SSH passwords.

  Defense:
    - Disable password auth, use SSH keys
    - fail2ban for SSH
    - Change port (security through obscurity, reduces noise)
    - AllowUsers/AllowGroups in sshd_config

Problem 2: path traversal
  If chroot is not configured — user can escape their directory.
  Read /etc/passwd, /etc/shadow, configs.

  Defense (OpenSSH sshd_config):
    Match User ftpuser
        ChrootDirectory /var/sftp/%u
        ForceCommand internal-sftp
        AllowTcpForwarding no
        X11Forwarding no

Problem 3: weak SSH host keys
  If the host key leaks — MITM is possible.
  Client doesn't verify host key (clicked "yes" on first connect) → vulnerable.

  Defense: strict host key checking.
  ~/.ssh/known_hosts must contain the correct key.
  TOFU (Trust On First Use) — acceptable only on first connect.

Problem 4: SSH-1 (deprecated and insecure)
  SSH-1 has critical vulnerabilities.
  All modern systems use SSH-2.

  sshd_config:
    Protocol 2   # in older OpenSSH versions

Problem 5: weak SSH algorithms
  Old algorithms (DH group 1, arcfour/RC4, DES) are insecure.

  Check:
    ssh -vv user@host 2>&1 | grep -E "cipher|mac|kex"

  Recommended algorithms (/etc/ssh/sshd_config):
    KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512
    Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
    MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```

### CVEs and Known Vulnerabilities

```
FTP vulnerabilities:
  CVE-2010-4221  - ProFTPD 1.3.3c: RCE via Telnet IAC sequence
  CVE-2015-3306  - ProFTPD mod_copy: copy files without authentication
                   Read/write any file on the server!
                   EXPLOIT: SITE CPFR /etc/passwd, SITE CPTO /var/www/html/passwd.txt
  CVE-2011-1137  - vsftpd 2.3.4 backdoor (trojanized release)
  CVE-2019-12815 - ProFTPD mod_copy (again): path traversal

FTPS vulnerabilities:
  Inherits TLS vulnerabilities (POODLE, BEAST, CRIME — with old versions).
  CVE-2014-0224  - OpenSSL CCS Injection (affects FTPS with OpenSSL)

SFTP/SSH vulnerabilities:
  CVE-2023-38408  - OpenSSH: RCE via ssh-agent forwarding
  CVE-2024-6387   - OpenSSH regreSSHion: Remote Code Execution (race condition)
                    Critical! Affects glibc Linux, OpenSSH < 9.8
  CVE-2019-6111   - OpenSSH SCP: files can be overwritten by malicious server
  CVE-2016-0777   - OpenSSH: private key leak via roaming feature

# Check OpenSSH version
ssh -V
# OpenSSH_9.9p1, OpenSSL 3.4.0

# Check for CVE-2024-6387 (regreSSHion)
ssh -V | grep -oP '(?<=OpenSSH_)\d+\.\d+'
# If < 9.8 → vulnerable!
```

---

## Server Configuration

### vsftpd (Very Secure FTP Daemon)

```ini
# /etc/vsftpd.conf

# Basic settings
listen=YES
listen_ipv6=NO
anonymous_enable=NO          # disable anonymous
local_enable=YES             # allow local users
write_enable=YES             # allow writes
local_umask=022

# Security
chroot_local_user=YES        # jail users in chroot
chroot_list_enable=NO
allow_writeable_chroot=NO    # no writing to chroot root
userlist_enable=YES
userlist_file=/etc/vsftpd.userlist
userlist_deny=NO             # userlist = whitelist

# TLS (for FTPS)
ssl_enable=YES
allow_anon_ssl=NO
force_local_data_ssl=YES     # encrypt data too
force_local_logins_ssl=YES   # encrypt login too
ssl_tlsv1=NO
ssl_sslv2=NO
ssl_sslv3=NO
ssl_tlsv1_1=NO
ssl_tlsv1_2=YES
ssl_tlsv1_3=YES
rsa_cert_file=/etc/ssl/certs/vsftpd.pem
rsa_private_key_file=/etc/ssl/private/vsftpd.key
ssl_ciphers=HIGH

# Passive mode (required for FTPS through NAT)
pasv_enable=YES
pasv_min_port=50000
pasv_max_port=50100
pasv_address=1.2.3.4         # external IP

# Logging
xferlog_enable=YES
xferlog_file=/var/log/vsftpd.log
log_ftp_protocol=YES

# Limits
max_clients=50
max_per_ip=5
idle_session_timeout=300
data_connection_timeout=120
```

### OpenSSH for SFTP

```bash
# /etc/ssh/sshd_config

# SFTP subsystem
Subsystem sftp /usr/lib/openssh/sftp-server

# Or internal-sftp (built-in, no external process)
Subsystem sftp internal-sftp

# Create SFTP-only users with chroot
groupadd sftpusers

Match Group sftpusers
    ChrootDirectory /var/sftp/%u    # %u = username
    ForceCommand internal-sftp -l INFO   # SFTP only, log operations
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    AllowAgentForwarding no

# Create the user
useradd -m -G sftpusers -s /usr/sbin/nologin ftpuser1
passwd ftpuser1

# Set up directories (chroot requirement: owned by root, no group/other write)
mkdir -p /var/sftp/ftpuser1/uploads
chown root:root /var/sftp/ftpuser1      # must be owned by root!
chmod 755 /var/sftp/ftpuser1
chown ftpuser1:ftpuser1 /var/sftp/ftpuser1/uploads
chmod 755 /var/sftp/ftpuser1/uploads

# Secure algorithms
KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com

# Disable password auth (prefer keys)
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no

# SFTP logging
LogLevel VERBOSE    # detailed subsystem logging
```

```bash
# Validate config
sshd -t

# Restart
systemctl restart sshd

# Test SFTP connection
sftp ftpuser1@server.com

# SFTP operation logs (with LogLevel VERBOSE)
journalctl -u sshd | grep sftp
# session opened for local user ftpuser1
# opendir "/uploads"
# sent status Ok
```

---

## Clients

### Command Line

```bash
# FTP client
ftp ftp.example.com
# > USER anonymous
# > PASS email@example.com
# > ls
# > get file.txt
# > put localfile.txt
# > bye

# Download without interactive mode
ftp -n <<EOF
open ftp.example.com
user ftpuser password
binary
get /path/to/file.txt /local/file.txt
bye
EOF

# SFTP client
sftp user@server.com
sftp -P 2222 user@server.com   # non-standard port
sftp -i ~/.ssh/mykey user@server.com  # specific key

# SFTP commands:
# ls, cd, pwd, get, put, mget, mput, mkdir, rmdir, rm, rename, chmod, chown
sftp> ls -la
sftp> get remote_file.txt local_file.txt
sftp> put local_file.txt remote_file.txt
sftp> mget *.txt   # download all .txt
sftp> mput *.csv   # upload all .csv

# Transfer one file non-interactively
sftp user@server.com:/remote/path/file.txt /local/path/
echo "put /local/file.txt /remote/file.txt" | sftp user@server.com

# lftp - advanced client (FTP, FTPS, SFTP, HTTP)
apt install lftp

# FTP via lftp
lftp -u user,password ftp://ftp.example.com
lftp> ls
lftp> mirror /remote/dir /local/dir   # download directory recursively
lftp> mirror -R /local/dir /remote/dir  # upload recursively

# FTPS via lftp
lftp -u user,pass ftps://ftp.example.com
lftp ftp.example.com
lftp> set ftp:ssl-force true
lftp> set ssl:verify-certificate true

# SFTP via lftp
lftp sftp://user@server.com

# curl for FTP
curl ftp://ftp.example.com/file.txt --user user:password
curl -T localfile.txt ftp://ftp.example.com/ --user user:password
curl ftps://ftp.example.com/file.txt --user user:password  # FTPS
curl --ftp-ssl ftp://ftp.example.com/file.txt  # FTPS explicit

# wget for FTP
wget ftp://ftp.example.com/file.txt
wget --user=user --password=pass ftp://ftp.example.com/file.txt
```

### GUI Clients

```
FileZilla (Linux/Windows/macOS):
  Free, cross-platform.
  Supports: FTP, FTPS (Explicit and Implicit), SFTP.
  Certificate validation for FTPS.
  Settings → FTP → FTP over TLS settings.

WinSCP (Windows):
  Specializes in SFTP and FTPS.
  Very user-friendly for Windows.
  SSH key support.
  Built-in text editor.
  Scripting and automation.

Cyberduck (macOS, Windows):
  Clean interface.
  FTP, FTPS, SFTP, S3, WebDAV, and more.
  Keychain integration on macOS.
```

---

## Diagnostics

### FTP/FTPS Diagnostics

```bash
# Check FTP connectivity
telnet ftp.example.com 21
# 220 FTP Server Ready

# Check FTPS (openssl)
openssl s_client -connect ftp.example.com:21 -starttls ftp
# Should start TLS handshake after AUTH TLS

# Implicit FTPS
openssl s_client -connect ftp.example.com:990

# Capture FTP traffic
tcpdump -i eth0 -A 'tcp port 21'               # command channel
tcpdump -i eth0 'tcp port 20'                  # active mode data
tcpdump -i eth0 'tcp portrange 50000-50100'    # passive mode

# Check vsftpd status
systemctl status vsftpd
journalctl -u vsftpd -f

# View vsftpd log
tail -f /var/log/vsftpd.log
# Tue Apr 29 10:00:00 2026 [pid 1234] CONNECT: Client "192.168.1.10"
# Tue Apr 29 10:00:01 2026 [pid 1234] OK LOGIN: Client "192.168.1.10", "ftpuser"

# Check open ports
ss -tlnp | grep vsftpd
netstat -tlnp | grep :21

# Test passive mode
ftp ftp.example.com
> PASV
# 227 Entering Passive Mode (1,2,3,4,195,136)
# IP: 1.2.3.4, Port: 195*256+136 = 50056
```

### SFTP Diagnostics

```bash
# Test SFTP connection with verbose output
sftp -v user@server.com
# Shows full SSH handshake, algorithms, authentication

# Even more detail
sftp -vvv user@server.com

# Check SSH connection
ssh -v user@server.com
ssh -vvv user@server.com 2>&1 | grep -E "kex|cipher|hmac|auth"

# Test directory listing
echo "ls -la" | sftp user@server.com

# SFTP speed benchmark
dd if=/dev/zero bs=1M count=100 | sftp user@server.com:/dev/null

# Check host key
ssh-keyscan server.com
ssh-keyscan -t rsa,ecdsa,ed25519 server.com

# View known_hosts
cat ~/.ssh/known_hosts | grep server.com

# Remove stale known_hosts entry (if key changed)
ssh-keygen -R server.com

# SSH server logs
journalctl -u sshd -f
grep "sftp" /var/log/auth.log

# Common errors:
# "Connection refused" → SSH not running or wrong port
# "Host key verification failed" → server key changed
# "Permission denied (publickey)" → no key or key not added
# "This service allows sftp connections only" → ForceCommand internal-sftp working
# "bad ownership or modes for chroot directory" → ChrootDirectory not root:root
```

### Performance Comparison

```bash
# Test FTP speed
time curl -s -o /dev/null ftp://ftp.example.com/1GB_file.bin --user user:pass

# Test SFTP speed
time sftp user@server.com:/path/1GB_file.bin /dev/null

# Test rsync over SSH (SFTP alternative for synchronization)
time rsync -avz --progress user@server.com:/path/dir/ /local/dir/

# SFTP is typically slower than rsync due to per-packet encryption overhead
# but more reliable and secure than FTP
```

---

## Cheat Sheet

```
Protocols:
  FTP  - port 21 (commands) + 20/dynamic (data)
         NO encryption, everything in plaintext.
         Avoid! Use only in isolated networks.

  FTPS - port 21 (Explicit AUTH TLS) or 990 (Implicit)
         FTP + TLS, two channels.
         PROT P is REQUIRED to encrypt data!
         NAT/firewall problems.

  SFTP - port 22 (SSH)
         SSH subsystem, single connection.
         No NAT problems.
         SSH key support (better than passwords).

Choosing:
  Always use SFTP if possible.
  FTPS only if FTP compatibility is required.
  FTP — never in production facing the internet.

FTP vulnerabilities:
  - Password in plaintext
  - Data in plaintext
  - FTP Bounce attack (PORT to a third host)
  - Anonymous FTP (no authentication)
  - No MITM protection

FTPS vulnerabilities:
  - PROT C (forgot to set PROT P) → data is plaintext
  - Self-signed/unverified certificates
  - TLS downgrade attack
  - Inherited FTP NAT problems

SFTP/SSH vulnerabilities:
  - Weak passwords + port 22 publicly exposed
  - No chroot → path traversal
  - Weak SSH algorithms
  - CVE-2024-6387 regreSSHion (OpenSSH < 9.8)

SFTP best practices:
  PasswordAuthentication no       # keys only
  ChrootDirectory /var/sftp/%u    # isolate users
  ForceCommand internal-sftp      # SFTP only, no shell
  AllowTcpForwarding no           # block tunneling
  fail2ban for SSH
  Non-default port instead of 22 (optional)

Commands:
  sftp user@host                  connect
  sftp -P 2222 user@host          non-standard port
  sftp -i key user@host           with specific key
  lftp sftp://user@host           lftp SFTP
  lftp -u user,pass ftps://host   lftp FTPS
  curl ftps://host/file -u u:p    curl FTPS
  openssl s_client -connect host:21 -starttls ftp  test FTPS
```

---

## References

- [RFC 959](https://www.rfc-editor.org/rfc/rfc959) - FTP (File Transfer Protocol), 1985
- [RFC 2228](https://www.rfc-editor.org/rfc/rfc2228) - FTP Security Extensions
- [RFC 2389](https://www.rfc-editor.org/rfc/rfc2389) - FEAT command (FTP extensions)
- [RFC 2428](https://www.rfc-editor.org/rfc/rfc2428) - FTP Extensions for IPv6 (EPSV, EPRT)
- [RFC 2577](https://www.rfc-editor.org/rfc/rfc2577) - FTP Security Considerations (Bounce attack)
- [RFC 4217](https://www.rfc-editor.org/rfc/rfc4217) - Securing FTP with TLS (FTPS)
- [RFC 3659](https://www.rfc-editor.org/rfc/rfc3659) - FTP Extensions (MLST, MLSD, SIZE, MDTM)
- [IETF SFTP draft](https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer) - SSH File Transfer Protocol
- [OpenSSH](https://www.openssh.com) - SSH/SFTP implementation
- [vsftpd](https://security.appspot.com/vsftpd.html) - Very Secure FTP Daemon
- [CVE-2024-6387](https://nvd.nist.gov/vuln/detail/CVE-2024-6387) - regreSSHion OpenSSH RCE
