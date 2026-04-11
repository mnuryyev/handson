---
title: "SSH Hardening - Configuring a Secure Server"
description: "In this lab we will configure SSH: generate an Ed25519 key, disable password authentication and root login, change the port, install fail2ban, and verify it by simulating a brute-force attack"
image: "/images/ssh_hardening_sec/ssh_main.jpg"
date: "2026-04-11"
---

## Introduction

SSH is the primary way to remotely manage Linux servers. By default it is configured for convenience rather than security: standard port 22, root login permitted, passwords accepted. That is exactly why port 22 is one of the most scanned ports on the internet.

In this lab we will configure SSH: generate an Ed25519 key, disable password authentication and root login, change the port, install fail2ban, and verify it by simulating a brute-force attack. At the end we will look at SSH traffic in Wireshark - to see exactly what is visible from the outside.

| Parameter | Value |
| --- | --- |
| Server | Ubuntu Server, openssh-server |
| Client | Parrot OS |
| Server IP | 10.10.70.130 |
| Client IP | 10.10.70.129 |
| Final port | 2222 |

---

## Theoretical Background

### Why Ed25519 Instead of RSA

Ed25519 is a modern algorithm based on elliptic curves. A 256-bit key provides security comparable to RSA-3072 but generates faster, signs faster, and is shorter in size. All modern OpenSSH clients support it.

### What fail2ban Does

Fail2ban reads system logs (`/var/log/auth.log`) and when it detects a series of failed login attempts, adds the attacker's IP address to iptables/nftables rules - blocking it at the network level. Each set of rules is called a **jail**.

### What Is Visible in SSH Traffic from Outside

After the TCP handshake SSH immediately establishes an encrypted channel. From outside only the connection metadata is visible: IP addresses, ports, and packet sizes. The contents — commands, passwords, data - are encrypted and inaccessible to an observer.

---

## Phase 1. Installing and Starting the SSH Server

### Step 1. Installing openssh-server

```bash
sudo apt install openssh-server -y
```

![01_openssh_install](/handson/images/ssh_hardening_sec/01_openssh_install.png)

### Step 2. Starting and Checking Status

By default the service may be disabled. We enable autostart and start it:

```bash
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

![02_ssh_status](/handson/images/ssh_hardening_sec/02_ssh_status.png)

Status `active (running)` - SSH is accepting connections. A symlink has been created in `/etc/systemd/system/` — the service will start on every boot.

---

## Phase 2. Key Generation and Passwordless Login

### Step 3. Generating an Ed25519 Key on the Client

```bash
ssh-keygen -t ed25519 -C "lab-key"
# Path - Enter (default ~/.ssh/id_ed25519)
# Passphrase - Enter (leaving empty for the lab)
```

![03_lab_key](/handson/images/ssh_hardening_sec/03_lab_key.png)

### Step 4. Verifying the Created Keys

```bash
ls -la ~/.ssh/
cat ~/.ssh/id_ed25519.pub
```

![04_check](/handson/images/ssh_hardening_sec/04_check.png)

Two files were created: the private key `id_ed25519` with permissions `600` (owner only) and the public key `id_ed25519.pub` with permissions `644`. The private key never leaves the client machine.

### Step 5. Copying the Public Key to the Server

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@10.10.70.130
```

![05_public](/handson/images/ssh_hardening_sec/05_public.png)

`ssh-copy-id` connects using a password and appends the public key to `~/.ssh/authorized_keys` on the server. After this the password is no longer needed.

### Step 6. Verifying Key-Based Login

```bash
ssh ubuntu@10.10.70.130
cat ~/.ssh/authorized_keys
```

![06_copy_pub_key](/handson/images/ssh_hardening_sec/06_copy_pub_key.png)

Login succeeded without a password prompt. In `authorized_keys` — the public key with the comment `lab-key`. Password authentication can now be disabled.

---

## Phase 3. Hardening sshd_config

### Step 7. Backing Up the Configuration

Before any changes to the config - save the original:

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
ls -la /etc/ssh/
```

![07_backup](/handson/images/ssh_hardening_sec/07_backup.png)

`sshd_config.backup` is the safety net. If SSH fails to start after the changes, restore the original with `sudo cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config`.

### Step 8. Changing the Port

```bash
sudo nano /etc/ssh/sshd_config
```

```
Port 2222
```

![08_port2222](/handson/images/ssh_hardening_sec/08_port2222.png)

Port 22 is automatically scanned by millions of bots every day. Switching to a non-standard port does not provide real security, but it eliminates all the automated noise from the logs.

### Step 9. Disabling Root Login

```
PermitRootLogin no
```

![09_permitrootlogin](/handson/images/ssh_hardening_sec/09_permitrootlogin.png)

Direct root connections are blocked. Administrators log in under their own account and use `sudo` - all privileged actions remain in the logs with the real user's name.

### Step 10. Restricting Allowed Users

```
AllowUsers ubuntu
```

![10_allowusers](/handson/images/ssh_hardening_sec/10_allowusers.png)

Even if other users appear in the system with keys — they will not be able to connect via SSH. An explicit whitelist is better than implicit permission.

### Step 11. Additional Hardening Parameters

```
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
```

![11_extra_hardening](/handson/images/ssh_hardening_sec/11_extra_hardening.png)

| Parameter | Value | Why |
| --- | --- | --- |
| `MaxAuthTries` | 3 | Fewer attempts before connection is dropped |
| `LoginGraceTime` | 20 | Authentication window — 20 seconds instead of 120 |
| `ClientAliveInterval` | 300 | Terminates hung sessions |
| `X11Forwarding` | no | Closes graphical application forwarding |
| `AllowTcpForwarding` | no | Prevents using SSH as a tunnel |

### Step 12. Syntax Check and Restart

Mandatory check before restarting - one bad character in the config can lock you out of the server permanently:

```bash
sudo sshd -t
echo "Exit code: $?"   # 0 = config is valid

sudo systemctl restart ssh
sudo systemctl status ssh
```

![12_restart](/handson/images/ssh_hardening_sec/12_restart.png)

Exit code `0` - config is valid. The service restarted and is running on port 2222.

### Step 13. Verifying the New Port

From the client we test both ports:

```bash
ssh -p 2222 ubuntu@10.10.70.130   # works
ssh ubuntu@10.10.70.130           # Connection refused
```

![13_2222_port](/handson/images/ssh_hardening_sec/13_2222_port.png)

Port 22 is closed - `Connection refused`. Connection via 2222 with the key succeeds without a password.

---

## Phase 4. Installing and Configuring fail2ban

### Step 14. Installing fail2ban

```bash
sudo apt install fail2ban -y
```

![14_fail2ban](/handson/images/ssh_hardening_sec/14_fail2ban.png)

### Step 15. Creating a Local Config

`jail.conf` is overwritten on package updates. All changes go into `jail.local` only:

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

![15_fail2ban_create_config](/handson/images/ssh_hardening_sec/15_fail2ban_create_config.png)

### Step 16. Configuring the SSH Jail

We find the `[sshd]` section and update it:

```ini
[sshd]
enabled  = true
port     = 2222
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 1h
findtime = 10m
```

![16_sshd](/handson/images/ssh_hardening_sec/16_sshd.png)

3 failed attempts within 10 minutes - ban for 1 hour. `port = 2222` must match the port in `sshd_config`.

### Step 17. Starting and Verifying fail2ban

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo systemctl status fail2ban

sudo fail2ban-client status
sudo fail2ban-client status sshd
```

![17_fail2ban_start](/handson/images/ssh_hardening_sec/17_fail2ban_start.png)

Jail `sshd` is active. Currently banned: 0, Currently failed: 0 - the system is clean, no attacks yet.

---

## Phase 5. Simulating a Brute-Force Attack

### Step 18. Launching the Attack from the Client

From machine `10.10.70.129` (Parrot OS) we run a loop of login attempts with the wrong password:

```bash
for i in {1..5}; do
    echo "Attempt $i"
    ssh -p 2222 ubuntu@10.10.70.130
done
```

![18_bruteforce](/handson/images/ssh_hardening_sec/18_bruteforce.png)

### Step 19. Result - IP Blocked

```
Attempt 1: 2 failed attempts → Connection closed
Attempt 2: Too many authentication failures
Attempt 3: connection rejected - IP is already banned
```

![19_fail](/handson/images/ssh_hardening_sec/19_fail.png)

After 3 failed attempts fail2ban added `10.10.70.129` to the block list. All subsequent connections from this IP are rejected at the network level - even the TCP handshake does not complete.

### Step 20. Verifying the Ban on the Server

```bash
sudo fail2ban-client status sshd
```

![20_fail2ban_look](/handson/images/ssh_hardening_sec/20_fail2ban_look.png)

```
Currently failed:  1
Total failed:      9
Currently banned:  1
Banned IP list:    10.10.70.129
```

### Step 21. Logs - How fail2ban Made the Ban Decision

```bash
sudo tail -50 /var/log/auth.log | grep -E "Failed|Invalid|Ban"
sudo tail -20 /var/log/fail2ban.log
```

![21_logs](/handson/images/ssh_hardening_sec/21_logs.png)

In `auth.log` - five lines of `Failed password for invalid user ubuntu from 10.10.70.129`. In `fail2ban.log` the full chain is visible: `Found 10.10.70.129` several times in a row, then `NOTICE [sshd] Ban 10.10.70.129`. Fail2ban detected the pattern and blocked the IP.

---

## Phase 6. Unbanning and Recovery

### Step 22. Manually Unbanning the IP

```bash
sudo fail2ban-client set sshd unbanip 10.10.70.129
sudo fail2ban-client status sshd
```

![22_unban](/handson/images/ssh_hardening_sec/22_unban.png)

The command returned `1` - success. Currently banned: 0.

### Step 23. Verifying Connection After Unban

```bash
ssh -p 2222 ubuntu@10.10.70.130
```

![23_connecting](/handson/images/ssh_hardening_sec/23_connecting.png)

Connection is permitted again.

---

## Phase 7. Traffic Analysis in Wireshark

### Step 24. TCP Handshake on Port 2222

We start Wireshark with filter `tcp.port == 2222` and connect via SSH. The first packets show the standard TCP handshake:

```
SYN     → 10.10.70.129:47504 → 10.10.70.130:2222
SYN-ACK ← 10.10.70.130:2222  → 10.10.70.129:47504
ACK     → confirmation
```

![24_wireshark](/handson/images/ssh_hardening_sec/24_wireshark.png)

### Step 25. What Is Visible from Outside - and What Is Not

After the TCP handshake SSH immediately moves to key exchange and encryption. All subsequent packets are encrypted data.

![25_syn](/handson/images/ssh_hardening_sec/25_syn.png)

The packet details show: `Flags: 0x002 (SYN)`, Destination Port: 2222. This is all that is available to an outside observer - the fact of a connection from a specific IP to a specific port. Commands, passwords, and data are encrypted and invisible.

> An interceptor sees: who connected, when, to which port, and how much data was transferred. What exactly was transferred is inaccessible without the server's private key.

---

## Phase 8. Final Verification

### Step 26. Complete Configuration Audit

```bash
# What SSH is actually listening on
sudo ss -tlnp | grep 2222

# Active configuration - what was applied
sudo sshd -T | grep -E "port|permitroot|passwordauth|allowusers|maxauthtries"

# fail2ban status
sudo fail2ban-client status sshd

# Authorised keys
cat ~/.ssh/authorized_keys
```

![26_final_check](/handson/images/ssh_hardening_sec/26_final_check.png)

Everything is in place: port 2222, `permitrootlogin no`, `maxauthtries 3`, key `lab-key` in `authorized_keys`, fail2ban active.

---

## Summary and Conclusions

### What We Changed and Why

| Parameter | Before | After | Effect |
| --- | --- | --- | --- |
| `Port` | 22 | 2222 | Eliminates automated scanners |
| `PermitRootLogin` | yes | no | Root cannot be attacked directly |
| `PasswordAuthentication` | yes | no | Password brute-force is impossible |
| `MaxAuthTries` | 6 | 3 | Fewer attempts before disconnect |
| `LoginGraceTime` | 120 | 20 | Shorter attack window |
| `AllowUsers` | everyone | ubuntu | Explicit whitelist |
| `X11Forwarding` | yes | no | Graphical forwarding closed |
| `AllowTcpForwarding` | yes | no | Tunnelling disabled |
| `fail2ban` | none | bantime=1h, maxretry=3 | Auto-blocks attacking IPs |

### What Wireshark Showed

SSH encrypts traffic immediately after the TCP handshake. From outside only metadata is visible: IP addresses, destination port, connection time, and volume of data transferred. The session contents - commands, files, passwords - are fully encrypted and inaccessible to an interceptor without the server's private key.

### The Defence Chain

The hardened server requires three conditions to be met simultaneously for a successful login: knowing the non-standard port, possessing the private Ed25519 key, and not being blocked by fail2ban. Each layer independently raises the cost of an attack.
