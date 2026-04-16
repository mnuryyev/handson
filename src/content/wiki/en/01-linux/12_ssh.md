---
title: "SSH - Keys, Config, Tunnels, Port Forwarding"
date: "2026-04-13"
---

SSH (Secure Shell) is a cryptographic protocol for secure remote access to servers. It provides encryption, authentication, and traffic tunneling. Default port: **22**.

---

## How SSH Works

```
Client                                    Server (port 22)
  │                                           │
  │ 1. TCP SYN → TCP SYN-ACK → TCP ACK      │
  │──────────────────────────────────────────►│
  │                                           │
  │ 2. Protocol version exchange             │
  │──────────────────────────────────────────►│
  │◄──────────────────────────────────────────│
  │                                           │
  │ 3. Key exchange                          │
  │   - Diffie-Hellman / ECDH               │
  │   - Negotiate shared session key         │
  │──────────────────────────────────────────►│
  │                                           │
  │ 4. Server authentication                 │
  │   - Server sends host key               │
  │   - Client verifies ~/.ssh/known_hosts  │
  │◄──────────────────────────────────────────│
  │                                           │
  │ 5. User authentication                   │
  │   - password / public key / GSSAPI      │
  │──────────────────────────────────────────►│
  │                                           │
  │ 6. Encrypted channel established         │
  │◄══════════════════════════════════════════►│
```

---

## Basic Connection

```bash
# Simple connection
ssh user@hostname
ssh user@192.168.1.10
ssh user@hostname -p 2222          # non-standard port

# Run a command without interactive session
ssh user@host "uptime && df -h"
ssh user@host "sudo systemctl restart nginx"

# Run interactive command (with pseudo-terminal)
ssh -t user@host "sudo htop"
ssh -t user@host "sudo bash"

# Copy files
scp file.txt user@host:/remote/path/
scp user@host:/remote/file.txt ./local/
scp -r /local/dir/ user@host:/remote/dir/   # recursive
scp -P 2222 file.txt user@host:/path/       # non-standard port

# rsync over SSH
rsync -avz /local/ user@host:/remote/
rsync -avz --delete /local/ user@host:/remote/
rsync -avz -e "ssh -p 2222" /local/ user@host:/remote/
```

---

## SSH Keys

### Generating keys

```bash
# Ed25519 - recommended (modern, fast, secure)
ssh-keygen -t ed25519 -C "comment"
ssh-keygen -t ed25519 -C "alice@work" -f ~/.ssh/id_ed25519_work

# RSA 4096 — for compatibility with legacy systems
ssh-keygen -t rsa -b 4096 -C "alice@laptop"

# ECDSA
ssh-keygen -t ecdsa -b 521 -C "comment"

# With a specific filename
ssh-keygen -t ed25519 -f ~/.ssh/github_key -C "github"
ssh-keygen -t ed25519 -f ~/.ssh/prod_server -C "production"

# Non-interactive generation (for automation)
ssh-keygen -t ed25519 -N "" -f /tmp/deploy_key -q
# -N "" — empty passphrase
# -q    — quiet mode
```

### Key pair structure

```bash
~/.ssh/
├── id_ed25519          # private key (600, owner only!)
├── id_ed25519.pub      # public key (644, shareable)
├── id_rsa              # legacy RSA private key
├── id_rsa.pub          # legacy RSA public key
├── known_hosts         # known hosts (server fingerprints)
├── authorized_keys     # public keys of allowed clients
└── config              # SSH client configuration
```

```bash
# Correct file permissions (REQUIRED!)
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/authorized_keys
chmod 644 ~/.ssh/known_hosts

# Wrong permissions will cause SSH to refuse the connection:
# "Permissions 0644 for '~/.ssh/id_ed25519' are too open."
```

### Public key

```bash
# View the public key
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... alice@laptop

# Copy public key to a server
ssh-copy-id user@host
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host
ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 2222 user@host

# Manually (when ssh-copy-id is unavailable)
cat ~/.ssh/id_ed25519.pub | ssh user@host "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# One-liner
ssh user@host "echo '$(cat ~/.ssh/id_ed25519.pub)' >> ~/.ssh/authorized_keys"
```

### authorized_keys - format

```bash
# ~/.ssh/authorized_keys on the server
# One line = one allowed public key

# Simple key
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... alice@laptop

# Key with options
command="/opt/scripts/backup.sh" ssh-ed25519 AAAA...    # only this command
no-pty,no-port-forwarding ssh-ed25519 AAAA...           # shell only, no tunnels
from="192.168.1.*" ssh-ed25519 AAAA...                  # only from these IPs
restrict,command="rsync --server" ssh-ed25519 AAAA...   # only rsync

# All options combined
from="10.0.0.1",command="/bin/bash",no-port-forwarding,no-X11-forwarding ssh-ed25519 AAAA...
```

### SSH Agent

```bash
# Start the agent
eval "$(ssh-agent -s)"
# Agent pid 12345

# Add a key (no passphrase prompt each time)
ssh-add ~/.ssh/id_ed25519
ssh-add ~/.ssh/prod_server

# Add with time limit (8 hours)
ssh-add -t 8h ~/.ssh/id_ed25519

# List loaded keys
ssh-add -l
# 256 SHA256:... alice@laptop (ED25519)

# Remove all keys from agent
ssh-add -D

# Auto-start on login — add to ~/.bashrc or ~/.zshrc
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)" > /dev/null
    ssh-add ~/.ssh/id_ed25519 2>/dev/null
fi
```

### Fingerprints and known_hosts

```bash
# View a server's key fingerprint
ssh-keyscan -t ed25519 hostname 2>/dev/null | ssh-keygen -lf -

# View your own key fingerprint
ssh-keygen -lf ~/.ssh/id_ed25519.pub
# 256 SHA256:xxxxxxxx alice@laptop (ED25519)

# known_hosts stores server fingerprints
cat ~/.ssh/known_hosts
# hostname ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...

# Add a host to known_hosts without connecting
ssh-keyscan -H hostname >> ~/.ssh/known_hosts
ssh-keyscan -p 2222 -H hostname >> ~/.ssh/known_hosts

# Remove a host entry (if server was reinstalled)
ssh-keygen -R hostname
ssh-keygen -R 192.168.1.10

# Disable host key checking (FOR TESTING ONLY)
ssh -o StrictHostKeyChecking=no user@host
ssh -o StrictHostKeyChecking=accept-new user@host  # accept new, reject changed
```

---

## SSH Config (~/.ssh/config)

SSH config lets you set connection parameters per host, eliminating long command lines.

### Basic syntax

```
# ~/.ssh/config

Host alias              # the alias you type in ssh
    HostName real-host
    User username
    Port port
    IdentityFile path-to-key
    ...other options...

Host *                  # applies to all hosts (defaults)
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Example configurations

```
# ~/.ssh/config

# Work server
Host work
    HostName 203.0.113.10
    User alice
    Port 22
    IdentityFile ~/.ssh/id_ed25519_work
    ForwardAgent yes

# Home server
Host home
    HostName 192.168.1.100
    User alice
    IdentityFile ~/.ssh/id_ed25519

# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_key
    IdentitiesOnly yes      # use only this key

# GitLab
Host gitlab.com
    HostName gitlab.com
    User git
    IdentityFile ~/.ssh/gitlab_key

# Jump host (bastion)
Host bastion
    HostName bastion.example.com
    User alice
    Port 22
    IdentityFile ~/.ssh/id_ed25519

# Server behind bastion via ProxyJump
Host internal
    HostName 10.0.0.50
    User alice
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519

# Wildcard for internal network
Host 10.0.*
    User alice
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking no

# Global defaults
Host *
    ServerAliveInterval 60    # keepalive every 60 sec
    ServerAliveCountMax 3     # 3 attempts before disconnect
    AddKeysToAgent yes        # auto-add keys to agent
    IdentityFile ~/.ssh/id_ed25519
    Compression yes           # compress traffic
```

```bash
# Now instead of:
ssh -i ~/.ssh/id_ed25519_work -p 22 alice@203.0.113.10

# Just:
ssh work

# scp also works with aliases:
scp file.txt work:/tmp/
```

### Useful config options

```
HostName           — real hostname or IP
User               — username
Port               — port (default 22)
IdentityFile       — path to private key
IdentitiesOnly     — only use specified key (don't try others)
ForwardAgent       — forward SSH agent to remote host
ProxyJump          — connect via intermediate host
ProxyCommand       — custom proxy command
ServerAliveInterval — keepalive interval (seconds)
ServerAliveCountMax — number of keepalive attempts
StrictHostKeyChecking — host key check (yes/no/accept-new)
AddKeysToAgent     — add keys to agent
Compression        — compression (yes/no)
LogLevel           — log verbosity (DEBUG, INFO, VERBOSE...)
ConnectTimeout     — connection timeout (seconds)
BatchMode          — never prompt for passwords (for scripts)
ControlMaster      — connection multiplexing
ControlPath        — path to control socket
ControlPersist     — how long to keep master connection alive
```

### Connection multiplexing

```
# ~/.ssh/config — speeds up repeated connections to the same host
Host *
    ControlMaster auto
    ControlPath ~/.ssh/cm_socket/%r@%h:%p
    ControlPersist 10m    # keep connection for 10 min after exit

# Create the directory
mkdir -p ~/.ssh/cm_socket
chmod 700 ~/.ssh/cm_socket
```

---

## Port Forwarding (Tunnels)

SSH can tunnel any TCP traffic through an encrypted connection.

### Local Port Forwarding (-L)

**Scenario:** Access a remote resource via a local port.

```
Your machine         SSH server           Target resource
   :8080  ──────────►   :22   ──────────►  :5432 (PostgreSQL)

Traffic: localhost:8080 → SSH tunnel → server → postgres:5432
```

```bash
# Syntax: ssh -L [local_addr:]local_port:remote_host:remote_port user@ssh_server
# -N : don't run a command (tunnel only)
# -f : go to background

# Access PostgreSQL on a remote server
ssh -L 5432:localhost:5432 user@server -N
# Now: psql -h localhost -p 5432 -U myuser mydb

# Access a web interface (e.g. internal Jenkins)
ssh -L 8080:jenkins.internal:8080 user@bastion -N

# Access Redis on another server via SSH
ssh -L 6379:redis-server:6379 user@ssh-server -N

# Multiple tunnels at once
ssh -L 5432:db:5432 -L 6379:redis:6379 -L 8080:web:80 user@bastion -N -f

# Accessible from other machines on local network (bind to 0.0.0.0)
ssh -L 0.0.0.0:5432:db:5432 user@server -N
```

```
# In ~/.ssh/config:
Host db-tunnel
    HostName server.example.com
    User alice
    LocalForward 5432 localhost:5432
    LocalForward 6379 redis.internal:6379
```

### Remote Port Forwarding (-R)

**Scenario:** Expose a local resource to a remote server.

```
Your machine         SSH server          External user
   :3000  ◄──────────   :8080  ◄──────── (client)

Traffic: server:8080 → SSH tunnel → localhost:3000
```

```bash
# Syntax: ssh -R [remote_addr:]remote_port:local_host:local_port user@ssh_server

# Expose local app (port 3000) via server
ssh -R 8080:localhost:3000 user@server -N

# Reverse SSH tunnel (access machine behind NAT)
# On the machine behind NAT:
ssh -R 2222:localhost:22 user@public-server -N -f
# From public-server: ssh -p 2222 localhost

# Expose to all interfaces on the server
# (requires GatewayPorts yes in server's sshd_config)
ssh -R 0.0.0.0:8080:localhost:3000 user@server -N
```

### Dynamic Port Forwarding (-D) / SOCKS Proxy

**Scenario:** Use the SSH server as a SOCKS5 proxy for all traffic.

```bash
# Syntax: ssh -D [local_addr:]local_port user@ssh_server

# Create a SOCKS5 proxy on port 1080
ssh -D 1080 user@server -N -f

# Point your browser to SOCKS5 proxy: localhost:1080
# All browser traffic routes through the server

# curl via SOCKS proxy
curl --socks5 localhost:1080 http://example.com

# wget via SOCKS proxy
ALL_PROXY=socks5://localhost:1080 wget http://example.com
```

### ProxyJump - connect via bastion

```bash
# Single intermediate host
ssh -J bastion.example.com user@internal-server

# Chain of hosts
ssh -J bastion1,bastion2 user@final-server

# In ~/.ssh/config:
Host internal
    HostName 10.0.0.50
    User alice
    ProxyJump bastion

# ProxyCommand (more flexible, legacy approach)
ssh -o ProxyCommand="ssh -W %h:%p bastion" user@internal-server
```

### Persistent tunnels with autossh

```bash
# autossh — automatically recreates tunnel on disconnect
apt install autossh

# Local tunnel
autossh -M 0 -N -L 5432:localhost:5432 user@server

# Reverse tunnel as a systemd service
cat > /etc/systemd/system/reverse-tunnel.service << 'EOF'
[Unit]
Description=Reverse SSH Tunnel
After=network-online.target

[Service]
User=tunnel
ExecStart=/usr/bin/autossh -M 0 -N \
    -o "ServerAliveInterval 30" \
    -o "ServerAliveCountMax 3" \
    -o "ExitOnForwardFailure yes" \
    -i /home/tunnel/.ssh/id_ed25519 \
    -R 2222:localhost:22 \
    user@public-server.example.com
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now reverse-tunnel
```

---

## SSH Server Configuration (sshd_config)

```bash
# Main config file
/etc/ssh/sshd_config

# Test config for errors
sshd -t                    # syntax check
sshd -T                    # show all effective settings

# Apply changes
systemctl reload sshd
```

### Key sshd_config parameters

```bash
# Port
Port 22
Port 2222              # multiple ports allowed

# Authentication
PermitRootLogin no                      # disallow root login
PermitRootLogin prohibit-password       # root by key only
PasswordAuthentication no               # disallow password auth (recommended!)
PubkeyAuthentication yes                # allow key-based auth
AuthorizedKeysFile .ssh/authorized_keys # where to look for keys

# Limits
MaxAuthTries 3                          # auth attempts
MaxSessions 10                          # sessions per connection
LoginGraceTime 30                       # seconds to authenticate
ClientAliveInterval 300                 # keepalive interval
ClientAliveCountMax 3                   # keepalive count

# User restrictions
AllowUsers alice bob deploy
DenyUsers badguy
AllowGroups sshusers admins

# Tunneling
AllowTcpForwarding yes
GatewayPorts no                         # no = tunnels to localhost only
X11Forwarding no

# SFTP
Subsystem sftp /usr/lib/openssh/sftp-server

# SFTP-only jail
Match User sftp-user
    ForceCommand internal-sftp
    ChrootDirectory /home/sftp-user
    AllowTcpForwarding no
    X11Forwarding no

# Allow password auth from specific network only
Match Address 192.168.1.0/24
    PasswordAuthentication yes
```

### Hardened sshd configuration

```bash
# /etc/ssh/sshd_config — hardened config
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers alice bob
X11Forwarding no
AllowTcpForwarding yes
GatewayPorts no
PermitEmptyPasswords no

# Modern ciphers
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com

# Verify effective settings
sshd -T | grep -E "permitrootlogin|passwordauthentication|pubkeyauthentication"
```

---

## Practical Scenarios

### Running commands via SSH in scripts

```bash
# Simple execution
ssh user@host "command"

# Multiple commands
ssh user@host "cd /app && git pull && npm install && pm2 restart all"

# Heredoc for multi-line commands
ssh user@host << 'EOF'
set -e
cd /app
git pull origin main
npm ci --production
systemctl restart myapp
echo "Deploy complete"
EOF

# Pass variables
VERSION="1.2.3"
ssh user@host "export VERSION=$VERSION; /opt/deploy.sh"

# Quiet mode (stderr only)
ssh -q user@host "command"

# Connection timeout
ssh -o ConnectTimeout=10 user@host "command"
```

### Deploy keys to multiple servers

```bash
PUBKEY=$(cat ~/.ssh/id_ed25519.pub)
SERVERS=("server1.example.com" "server2.example.com" "server3.example.com")

for server in "${SERVERS[@]}"; do
    echo "Deploying key to $server..."
    ssh -o StrictHostKeyChecking=accept-new user@"$server" \
        "mkdir -p ~/.ssh && echo '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    echo "Done: $server"
done
```

### SFTP - secure file transfer

```bash
# Interactive SFTP session
sftp user@host
# sftp> ls
# sftp> cd /remote/path
# sftp> get remote-file.txt
# sftp> put local-file.txt
# sftp> mget *.log          # download multiple files
# sftp> mput *.csv          # upload multiple files
# sftp> bye

# Non-interactive file transfer
sftp user@host <<< "get /remote/file.txt /local/path/"
sftp -b - user@host << 'EOF'
cd /uploads
put /local/file1.txt
put /local/file2.txt
EOF
```

### X11 Forwarding - GUI over SSH

```bash
# In server's /etc/ssh/sshd_config:
X11Forwarding yes

# Connect with X11 forwarding
ssh -X user@host           # untrusted X11 forwarding
ssh -Y user@host           # trusted (faster, less secure)

# Open GUI application
ssh -X user@host "firefox"
ssh -X user@host "gimp /path/to/image.png"
```

---

## Troubleshooting SSH

```bash
# Verbose output (-v, -vv, -vvv)
ssh -v user@host
ssh -vv user@host        # more detail
ssh -vvv user@host       # maximum (DEBUG3)

# Common errors:

# "Permission denied (publickey)"
# → Key not in authorized_keys
# → Wrong permissions on ~/.ssh/ or authorized_keys
# → PasswordAuthentication=no, no key available
ssh -v user@host 2>&1 | grep -E "Offering|Accepted|Trying"

# "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!"
# → Server reinstalled or MITM attack
ssh-keygen -R hostname      # remove old fingerprint
ssh-keyscan -H hostname >> ~/.ssh/known_hosts

# "Connection refused"
# → SSH daemon not running
# → Wrong port
# → Firewall blocking
nc -zv hostname 22
nmap -p 22 hostname

# "Connection timed out"
# → No route to host
# → Firewall dropping packets
ping hostname
traceroute hostname

# SSH server logs
journalctl -u ssh -f              # Debian/Ubuntu
journalctl -u sshd -f             # RHEL/CentOS
tail -f /var/log/auth.log         # Debian/Ubuntu
tail -f /var/log/secure           # RHEL/CentOS

# View currently connected users
who
w
ss -tnp | grep :22
```

---

## SSH Security

```bash
# Suspicious login attempts
grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn | head -20

grep "Invalid user" /var/log/auth.log | awk '{print $8}' | sort | uniq -c | sort -rn | head -20

grep "Accepted publickey" /var/log/auth.log | tail -20

# Block brute force with fail2ban
apt install fail2ban

cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600    # 1 hour
findtime = 600    # 10-minute window
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
fail2ban-client unban 192.168.1.10
```

---

## Cheat Sheet

```bash
# Keys
ssh-keygen -t ed25519 -C "comment"     # create key
ssh-copy-id user@host                  # copy key to server
ssh-add ~/.ssh/id_ed25519              # add to agent
ssh-add -l                             # list keys in agent
ssh-keygen -R hostname                 # remove host from known_hosts
ssh-keyscan -H host >> known_hosts     # add fingerprint

# Connecting
ssh user@host                          # connect
ssh -p 2222 user@host                  # non-standard port
ssh -i ~/.ssh/key user@host            # specific key
ssh -J bastion user@host               # via jump host
ssh -t user@host "sudo htop"           # force pseudo-terminal

# Tunnels
ssh -L 8080:localhost:80 user@host -N  # local forward
ssh -R 8080:localhost:3000 user@host -N # remote forward
ssh -D 1080 user@host -N               # SOCKS proxy
ssh -L local:host:remote               # general form

# Flags
-N     no command execution (tunnel only)
-f     go to background
-v     verbose (debug)
-t     force pseudo-terminal
-q     quiet mode
-C     compression
-A     agent forwarding

# File permissions (REQUIRED)
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_*           # private keys
chmod 644 ~/.ssh/*.pub          # public keys
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/authorized_keys
```

---

## References

- [OpenSSH Manual](https://www.openssh.com/manual.html) - official documentation
- [ssh_config man](https://man7.org/linux/man-pages/man5/ssh_config.5.html) - `man 5 ssh_config`
- [sshd_config man](https://man7.org/linux/man-pages/man5/sshd_config.5.html) - `man 5 sshd_config`
- [SSH Hardening Guide](https://infosec.mozilla.org/guidelines/openssh) - Mozilla recommendations
