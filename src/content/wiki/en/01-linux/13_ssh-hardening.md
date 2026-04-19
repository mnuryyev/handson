---
title: "SSH - Hardening, fail2ban, authorized_keys"
date: "2026-04-19"
---

A deep-dive continuation of SSH. Covers hardening the SSH server, brute-force protection, key management, and security auditing.

---

## SSH Threat Model

```
Common SSH attacks:
──────────────────────────────────────────────────────────────────
Brute Force       - password guessing (bots scan the whole internet)
Dictionary        - wordlist attacks on usernames/passwords
Credential Stuff  - using leaked login/password pairs
MITM              - rogue server on first connection
Key Theft         - stealing a private key from a workstation
Insider           - compromised authorized user

Reality: a server with SSH on port 22 receives thousands
of brute-force attempts per day within minutes of going online.
```

---

## Security Checklist

```
Disable password auth (PasswordAuthentication no)
Disable root login (PermitRootLogin no)
Use only Ed25519/RSA-4096 keys
Restrict users (AllowUsers)
Change port (optional, security through obscurity)
Configure fail2ban or equivalent
Configure firewall (UFW/nftables)
Keep OpenSSH updated
Monitor authentication logs
Use modern cipher algorithms
```

---

## Hardening sshd_config - Complete Config

```bash
# Check OpenSSH version
ssh -V
# OpenSSH_8.9p1 Ubuntu-3ubuntu0.6, OpenSSL 3.0.2

# Config location
/etc/ssh/sshd_config

# Always back up before editing
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Test config for errors
sshd -t && echo "Config OK"
```

### Hardened configuration

```ini
# /etc/ssh/sshd_config

#──────────── Network ────────────
Port 22
AddressFamily inet              # IPv4 only (or 'any' for dual-stack)
ListenAddress 0.0.0.0

#──────────── Host Keys ────────────
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
# Do NOT use: ssh_host_dsa_key, ssh_host_ecdsa_key (NIST curves)

#──────────── Cryptography ────────────
# Modern algorithms only
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512

Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr

MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com

HostKeyAlgorithms ssh-ed25519,ssh-ed25519-cert-v01@openssh.com,rsa-sha2-512,rsa-sha2-256

#──────────── Authentication ────────────
LoginGraceTime 20               # 20 seconds to authenticate
PermitRootLogin no              # disallow root login
StrictModes yes                 # check ~/.ssh file permissions
MaxAuthTries 3                  # 3 authentication attempts
MaxSessions 5                   # 5 concurrent sessions

PubkeyAuthentication yes        # keys allowed
AuthorizedKeysFile .ssh/authorized_keys

PasswordAuthentication no       # PASSWORDS DISABLED
PermitEmptyPasswords no         # empty passwords banned
ChallengeResponseAuthentication no

UsePAM yes                      # needed for 2FA if configured

#──────────── Access ────────────
AllowUsers alice bob deploy     # only these users

#──────────── Forwarding ────────────
AllowAgentForwarding no         # agent forwarding (enable if needed)
AllowTcpForwarding no           # TCP tunnels (enable if needed)
GatewayPorts no                 # ports only on localhost
X11Forwarding no                # X11 disabled
PermitTunnel no                 # tun devices disabled

#──────────── Misc ────────────
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server

# Keepalive
ClientAliveInterval 300         # 5 minutes
ClientAliveCountMax 2           # 2 attempts then disconnect

# Logging
LogLevel VERBOSE                # log key fingerprints
```

```bash
# Apply changes
sshd -t                         # verify syntax
systemctl reload sshd

# Verify settings
sshd -T | grep -E "permitrootlogin|passwordauth|pubkeyauth|allowusers|maxauthtries|logingracetime"
```

### Match blocks - different rules for different cases

```ini
# Allow password auth from local network only
Match Address 192.168.1.0/24,10.0.0.0/8
    PasswordAuthentication yes

# SFTP-only user in chroot jail
Match User sftp-backup
    ForceCommand internal-sftp
    ChrootDirectory /srv/sftp/%u
    AllowTcpForwarding no
    X11Forwarding no
    PasswordAuthentication no

# ops group can use tunnels
Match Group ops
    AllowTcpForwarding yes
    AllowAgentForwarding yes

# Restrict admin to specific IP only
Match User admin Address 203.0.113.1
    PasswordAuthentication no
    PubkeyAuthentication yes
```

---

## Modern Cipher Algorithms

### Checking supported algorithms

```bash
# What the client supports
ssh -Q kex         # key exchange algorithms
ssh -Q cipher      # ciphers
ssh -Q mac         # MAC algorithms
ssh -Q key         # key types

# Check what an active connection uses
ssh -vvv user@host 2>&1 | grep -E "kex_init|cipher|mac"

# Test with specific algorithms
ssh -c aes256-gcm@openssh.com -m hmac-sha2-256-etm@openssh.com user@host

# ssh-audit - SSH security scanner
pip3 install ssh-audit
ssh-audit hostname
```

### What NOT to use

```
Deprecated KexAlgorithms:
diffie-hellman-group1-sha1     - Logjam attack
diffie-hellman-group14-sha1    - SHA-1 weak

Deprecated Ciphers:
3des-cbc                       - Triple DES, slow
aes*-cbc                       - Lucky13 vulnerable
arcfour*                       - RC4, broken
blowfish-cbc                   - 64-bit block

Deprecated MACs:
hmac-md5*                      - MD5 broken
hmac-sha1                      - SHA-1 weak
umac-64*                       - 64-bit tag

Deprecated HostKeys:
ssh-dss (DSA)                  - 1024 bits, broken
ecdsa-sha2-nistp256/384/521    - NIST curves (suspected backdoor)
```

---

## authorized_keys - Detailed Management

### Key options

```bash
# authorized_keys line format:
# [options] keytype base64key [comment]

# Restrict to specific IP
from="192.168.1.10" ssh-ed25519 AAAA...

# Multiple IPs/subnets
from="192.168.1.0/24,10.0.0.*,!10.0.0.5" ssh-ed25519 AAAA...
# ! — exclude

# Single command only (useful for deploy keys)
command="/usr/local/bin/deploy.sh" ssh-ed25519 AAAA...

# Command + deny everything else
command="/usr/local/bin/deploy.sh",no-port-forwarding,no-agent-forwarding,no-x11-forwarding,no-pty ssh-ed25519 AAAA...

# restrict — deny everything unless explicitly allowed (OpenSSH 7.4+)
restrict,command="/usr/local/bin/deploy.sh" ssh-ed25519 AAAA...

# restrict + allow port forwarding only
restrict,port-forwarding ssh-ed25519 AAAA...

# CI/CD deploy key
restrict,command="/opt/ci/deploy.sh ${SSH_ORIGINAL_COMMAND}" ssh-ed25519 AAAA...

# SSH_ORIGINAL_COMMAND — the command the user tried to run
command='if [ "$SSH_ORIGINAL_COMMAND" = "backup" ]; then /opt/backup.sh; fi' ssh-ed25519 AAAA...
```

### All authorized_keys options

| Option | Description |
|--------|-------------|
| `from="pattern"` | Allow only from these IPs/hosts |
| `command="cmd"` | Execute only this command |
| `restrict` | Deny everything (pty, forwarding, etc.) |
| `no-pty` | No pseudo-terminal |
| `no-port-forwarding` | No port forwarding |
| `no-agent-forwarding` | No agent forwarding |
| `no-x11-forwarding` | No X11 |
| `no-user-rc` | Don't run ~/.ssh/rc |
| `port-forwarding` | Explicitly allow (with restrict) |
| `agent-forwarding` | Explicitly allow (with restrict) |
| `pty` | Explicitly allow pty (with restrict) |
| `environment="KEY=VAL"` | Set an environment variable |
| `expiry-time="YYYYMMDD"` | Key expiry date (OpenSSH 8.2+) |
| `tunnel="N"` | Allow tun tunnel N |
| `principals="name"` | For certificate auth |

### Practical uses

```bash
# Deploy key (deploy script only)
restrict,command="/opt/deploy.sh" ssh-ed25519 AAAA... ci-deploy@github

# Backup key (rsync only)
restrict,command="rsync --server --sender -logDtprze.iLsfxC . /backup/" ssh-ed25519 AAAA... backup@nas

# Monitoring key (read-only collection)
restrict,command="/opt/monitoring/collect.sh" ssh-ed25519 AAAA... prometheus@monitoring

# Key with expiry date
expiry-time="20251231",restrict,command="/opt/temp-access.sh" ssh-ed25519 AAAA... contractor

# SFTP-only key from specific IP
from="10.0.0.100",restrict ssh-ed25519 AAAA... sftp-client

# Admin key — office network only
from="203.0.113.0/24" ssh-ed25519 AAAA... alice@work
```

### Key management script

```bash
#!/usr/bin/env bash

add_deploy_key() {
    local keyfile="$1"
    local user="$2"
    local authorized_keys="/home/$user/.ssh/authorized_keys"

    [ -f "$keyfile" ] || { echo "Key not found: $keyfile" >&2; return 1; }

    local pubkey
    pubkey=$(cat "$keyfile")
    local key_comment
    key_comment=$(echo "$pubkey" | awk '{print $3}')

    if grep -qF "$pubkey" "$authorized_keys" 2>/dev/null; then
        echo "Key already present: $key_comment"
        return 0
    fi

    echo "restrict,command=\"/opt/deploy.sh\" $pubkey" >> "$authorized_keys"
    chmod 600 "$authorized_keys"
    echo "Key added: $key_comment"
}

remove_key_by_comment() {
    local comment="$1"
    local authorized_keys="$2"
    grep -v " $comment$" "$authorized_keys" > /tmp/ak_tmp
    mv /tmp/ak_tmp "$authorized_keys"
    chmod 600 "$authorized_keys"
    echo "Key removed: $comment"
}

# Audit all authorized_keys
for f in /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys; do
    [ -f "$f" ] && echo "=== $f ===" && cat "$f" | while read line; do
        echo "$line" | ssh-keygen -lf - 2>/dev/null
    done
done
```

---

## fail2ban - Brute-Force Protection

fail2ban monitors log files and blocks suspicious IPs via iptables/nftables.

### Installation and setup

```bash
# Install
apt install fail2ban                    # Debian/Ubuntu
dnf install fail2ban                    # RHEL/CentOS
pacman -S fail2ban                      # Arch

# Enable and start
systemctl enable --now fail2ban

# Check status
fail2ban-client status
fail2ban-client status sshd
```

### Configuration

```bash
# Never edit /etc/fail2ban/jail.conf directly!
# Create /etc/fail2ban/jail.local — it overrides jail.conf

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600          # 1 hour default ban
findtime = 600           # 10-minute detection window
maxretry = 3

# IMPORTANT: whitelist your own IPs!
ignoreip = 127.0.0.1/8 ::1 192.168.1.0/24 10.0.0.0/8

backend = systemd

[sshd]
enabled = true
port    = ssh,2222
filter  = sshd
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime  = 86400         # 24 hours for 3 attempts
findtime = 3600          # 1-hour window

# Aggressive mode (block pre-auth scan attempts)
mode = aggressive
EOF

systemctl restart fail2ban
```

### Custom filter

```bash
# /etc/fail2ban/filter.d/sshd-aggressive.conf
[Definition]
failregex = ^%(__prefix_line)sDisconnect(ed)? from (invalid |authenticating )?user .* <HOST> port \d+ \[preauth\]$
            ^%(__prefix_line)sConnection (closed|reset) by (authenticating |invalid )?user .* <HOST> port \d+ \[preauth\]$
            ^%(__prefix_line)sInvalid user .* from <HOST>
            ^%(__prefix_line)sFailed password for .* from <HOST>
            ^%(__prefix_line)sFailed publickey for .* from <HOST>

ignoreregex =
```

### Managing fail2ban

```bash
# Status
fail2ban-client status              # all jails
fail2ban-client status sshd         # specific jail
# Status for the jail: sshd
# |- Currently failed: 3
# |- Total failed: 127
# `- Banned IP list: 185.220.101.42 45.33.32.156

# Unban an IP
fail2ban-client unban 185.220.101.42

# Manually ban an IP
fail2ban-client set sshd banip 192.168.1.50

# Check banned IPs
fail2ban-client get sshd banip
iptables -n -L f2b-sshd

# Monitor fail2ban log
tail -f /var/log/fail2ban.log
journalctl -u fail2ban -f

# Test a filter
fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf
```

### Permanent bans for repeat offenders

```bash
# /etc/fail2ban/jail.local

[sshd-recidive]
enabled  = true
filter   = recidive
logpath  = /var/log/fail2ban.log
action   = iptables-allports[name=recidive]
bantime  = -1            # -1 = permanent
findtime = 86400         # 24-hour window
maxretry = 5
```

---

## UFW / nftables - Restricting SSH Access

### UFW

```bash
apt install ufw

ufw default deny incoming
ufw default allow outgoing

# Allow SSH from specific IPs only
ufw allow from 192.168.1.0/24 to any port 22
ufw allow from 203.0.113.1 to any port 22

# Allow SSH from anywhere (less secure)
ufw allow ssh

# Rate limiting (block after 6 connections in 30 seconds)
ufw limit ssh

ufw enable
ufw status verbose
```

### nftables

```bash
# /etc/nftables.conf

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        iifname "lo" accept
        ct state established,related accept

        # SSH rate limiting — max 3 new connections per minute per IP
        tcp dport 22 ct state new \
            limit rate 3/minute burst 5 packets \
            accept

        # Or allow only from specific IPs
        tcp dport 22 ip saddr { 192.168.1.0/24, 203.0.113.1 } accept
        tcp dport 22 drop
    }
}
```

---

## Two-Factor Authentication (2FA)

### TOTP via Google Authenticator

```bash
# Install
apt install libpam-google-authenticator

# Configure (run as the USER, NOT root)
google-authenticator
# Answer yes to all questions for maximum security

# Configure PAM — /etc/pam.d/sshd — ADD this line:
auth required pam_google_authenticator.so nullok
# Remove 'nullok' in production!

# sshd_config settings
UsePAM yes
ChallengeResponseAuthentication yes
# Require BOTH key AND TOTP:
AuthenticationMethods publickey,keyboard-interactive
# TOTP only (without key):
# AuthenticationMethods keyboard-interactive

# Restart sshd
systemctl restart sshd

# Login now asks for:
# Verification code: (6-digit code from the app)
```

---

## Audit and Monitoring

### Authentication log analysis

```bash
# Recent successful logins
grep "Accepted" /var/log/auth.log | tail -20
# Accepted publickey for alice from 192.168.1.5 port 52341 ssh2: ED25519 SHA256:...

# All failed attempts
grep "Failed\|Invalid\|Connection closed\|Disconnected" /var/log/auth.log | tail -50

# Top attacking IPs
grep "Failed password\|Invalid user" /var/log/auth.log \
    | grep -oP 'from \K[\d.]+' \
    | sort | uniq -c | sort -rn | head -20

# Top targeted usernames
grep "Invalid user" /var/log/auth.log \
    | awk '{print $8}' \
    | sort | uniq -c | sort -rn | head -20

# Via journald
journalctl _COMM=sshd --since "24 hours ago" | grep "Failed"
journalctl _COMM=sshd --since "24 hours ago" | grep "Accepted"

# Key fingerprints used for login (requires LogLevel VERBOSE)
grep "Accepted publickey" /var/log/auth.log | grep -oP 'ED25519 SHA256:\K\S+'
```

### Daily security report script

```bash
#!/usr/bin/env bash
# /etc/cron.daily/ssh-report

LOGFILE="/var/log/auth.log"
TODAY=$(date '+%b %d')

echo "=== SSH Security Report — $(date) ==="

echo ""
echo "--- Successful logins (last 24h) ---"
grep "Accepted" "$LOGFILE" | grep "$TODAY" \
    | awk '{print $1,$2,$3,"user="$9,"from="$11}' | sort | uniq -c

echo ""
echo "--- Top attacking IPs ---"
grep "Failed password\|Invalid user" "$LOGFILE" | grep "$TODAY" \
    | grep -oP 'from \K[\d.]+' \
    | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- Top targeted usernames ---"
grep "Invalid user" "$LOGFILE" | grep "$TODAY" \
    | awk '{print $8}' \
    | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- fail2ban status ---"
fail2ban-client status sshd 2>/dev/null || echo "fail2ban not running"
```

### Auditd - extended auditing

```bash
apt install auditd

# Track SSH config changes
auditctl -w /etc/ssh/sshd_config -p wa -k sshd_config

# Track authorized_keys changes
auditctl -w /root/.ssh/ -p wa -k root_ssh

# Persistent rules
cat >> /etc/audit/rules.d/ssh.rules << 'EOF'
-w /etc/ssh/sshd_config -p wa -k sshd_config
-w /root/.ssh/ -p wa -k root_ssh
-w /home -p wa -k user_ssh
EOF

# View events
ausearch -k sshd_config
ausearch -k root_ssh
aureport --auth
aureport --login
```

---

## Protecting Private Keys

### Passphrases

```bash
# Always use a passphrase for private keys!
ssh-keygen -t ed25519 -C "alice@work"
# Enter passphrase: (strong passphrase)

# Change passphrase on an existing key
ssh-keygen -p -f ~/.ssh/id_ed25519

# Check if a key has a passphrase
ssh-keygen -y -P "" -f ~/.ssh/id_ed25519 2>&1 | grep -q "incorrect passphrase" \
    && echo "Passphrase SET" || echo "NO passphrase — FIX THIS"
```

### Correct file permissions

```bash
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_ed25519          # private key
chmod 644 ~/.ssh/id_ed25519.pub      # public key
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/config
chmod 644 ~/.ssh/known_hosts

# Fix permissions in one sweep
find ~/.ssh -name "id_*" ! -name "*.pub" -exec chmod 600 {} \;
find ~/.ssh -name "*.pub" -exec chmod 644 {} \;

# Audit all authorized_keys on the system
for f in /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys; do
    [ -f "$f" ] && echo "=== $f ===" && cat "$f" | while read line; do
        echo "$line" | ssh-keygen -lf - 2>/dev/null
    done
done
```

### SSH Certificate Authority (SSH CA)

SSH CA lets you sign keys instead of managing authorized_keys on every server.

```bash
# Create the CA key (keep this in a vault!)
ssh-keygen -t ed25519 -f /etc/ssh/ca_key -C "SSH Certificate Authority"

# Tell servers to trust the CA
# /etc/ssh/sshd_config:
TrustedUserCAKeys /etc/ssh/ca_key.pub

# Sign a user's key (on the CA machine)
ssh-keygen -s /etc/ssh/ca_key \
    -I "alice@laptop" \              # identity
    -n alice,admin \                 # allowed usernames
    -V +52w \                        # valid for 52 weeks
    ~/.ssh/id_ed25519.pub

# Creates: ~/.ssh/id_ed25519-cert.pub
ssh-keygen -Lf ~/.ssh/id_ed25519-cert.pub
# Valid: from 2024-01-01T00:00:00 to 2025-01-01T00:00:00
# Principals: alice,admin

# alice can now log into ANY server that trusts the CA — no authorized_keys needed!
```

---

## Common Attacks and Defenses

### Brute Force

```
Attack: millions of password attempts
Defense:
PasswordAuthentication no
fail2ban with bantime > 1 hour
UFW rate limiting
Change port (reduces noise, not security)
```

### MITM

```bash
# Attack: rogue SSH server on first connection
# "The authenticity of host can't be established..."
# → User types "yes" → MITM

# Defense:
# 1. Pre-populate known_hosts
ssh-keyscan -H server.example.com >> ~/.ssh/known_hosts

# 2. Verify fingerprint out-of-band
ssh -o FingerprintHash=sha256 user@host

# 3. Never accept unknown hosts in scripts
StrictHostKeyChecking yes        # in ~/.ssh/config

# 4. SSHFP DNS records
ssh-keygen -r server.example.com   # generate SSHFP record
# Add to DNS zone, then verify with:
ssh -o VerifyHostKeyDNS=yes user@server.example.com
```

---

## Security Cheat Sheet

```bash
# Most important sshd_config settings:
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3
AllowUsers alice bob
LogLevel VERBOSE

# fail2ban status:
fail2ban-client status sshd

# Who is logging in:
journalctl _COMM=sshd | grep "Accepted\|Failed" | tail -20

# Top attacking IPs:
grep "Failed" /var/log/auth.log | grep -oP 'from \K[\d.]+' | sort | uniq -c | sort -rn | head

# Check ~/.ssh/ permissions:
ls -la ~/.ssh/

# Verify sshd config:
sshd -T | grep -E "permitroot|passwordauth|maxauth|allowusers"

# Unban yourself in fail2ban:
fail2ban-client unban MY_IP

# Check iptables bans:
iptables -n -L INPUT | grep DROP

# Audit all authorized_keys:
for f in /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys; do
    [ -f "$f" ] && echo "=== $f ===" && cat "$f" | while read line; do
        echo "$line" | ssh-keygen -lf - 2>/dev/null
    done
done
```

---

## References

- [OpenSSH Security](https://www.openssh.com/security.html) - OpenSSH CVE history
- [ssh-audit](https://github.com/jtesta/ssh-audit) - SSH server security scanner
- [Mozilla SSH Guidelines](https://infosec.mozilla.org/guidelines/openssh) - Mozilla recommendations
- [fail2ban docs](https://www.fail2ban.org/wiki/index.php/MANUAL_0_8) - fail2ban manual
- [SSH Certificate Authority](https://engineering.fb.com/2016/09/12/security/scalable-and-secure-access-with-ssh/) - FB's SSH CA article
