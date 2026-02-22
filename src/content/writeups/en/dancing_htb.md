---
title: "Dancing - HackTheBox (Easy)"
description: "Walkthrough of the Dancing machine on HackTheBox: working with SMB protocol, analyzing available shares, using anonymous access, and obtaining the flag through SMB shell."
image: "/images/meow_htb/htb_main.png"
date: "February 23, 2026"
---
**Dancing** is a simple machine on the HTB platform that provides an opportunity to practice with **SMB (Server Message Block)** vulnerabilities and network service exploitation. In this task, we'll work with the **SMB** protocol, search for available shares, and use various tools to obtain the flag.

![01_ip_machine](/handson/images/dancing_htb/01_ip_machine.png)

* * *

## Task 1: What does the abbreviation SMB stand for?

![02_task1](/handson/images/dancing_htb/02_task1.png)

**SMB** stands for **Server Message Block**. This is a protocol used for sharing files and printers on networks, as well as for accessing other resources (for example, shared directories) in Windows operating systems. It's used for interaction between computers on a local network or through the internet.

---

## Task 2: What port does SMB work on?

![03_task2](/handson/images/dancing_htb/03_task2.png)

**SMB** typically uses ports **137**, **138**, **139** and **445** for its operation. Port **445** is the main one for newer versions of SMB (for example, SMB 2 and 3), while older versions of SMB may use ports **137**, **138** and **139** for various purposes.

---

## Task 3: What is the service name on port 445 discovered in the Nmap scan?

![04_task3](/handson/images/dancing_htb/04_task3.png)

![05_nmap_scan](/handson/images/dancing_htb/05_nmap_scan.png)

When scanning with **Nmap** on port **445**, we discover a service named **microsoft-ds**. This is a service that works over the **SMB** protocol and is used to provide access to files and other resources on the network.

---

## Task 4: What flag or switch can we use in the **smbclient** utility to 'list' the available shares on Dancing?

![06_task4](/handson/images/dancing_htb/06_task4.png)

To see the available shares on the server through **smbclient**, we use the **-L** flag. The command will look like this:

```bash
smbclient -L //10.129.6.202
```

This flag allows getting a list of all available shared resources (shares) on the remote machine.

---

## Task 5: How many shares are on Dancing?

![07_task5](/handson/images/dancing_htb/07_task5.png)

![08_L](/handson/images/dancing_htb/08_L.png)

After executing the **smbclient -L** command to get the list of shares on the **Dancing** machine, we discover **4 shares**.

---

## Task 6: What is the name of the share we can access in the end with an empty password?

![09_task6](/handson/images/dancing_htb/09_task6.png)

To access one of the shares on **Dancing** with an empty password, we can use **Guest** or **Anonymous** login. In this case, the share we gain access to is called **WorkShares**.

---

## Task 7: What command is used in SMB shell to download found files?

![10_task7](/handson/images/dancing_htb/10_task7.png)

In **SMB shell**, the **get** command is used to download files from the remote server. For example:

```bash
get filename
```

This command allows downloading a file from the remote resource to the local machine.

---

## Obtaining the Flag

![11_amy](/handson/images/dancing_htb/11_amy.png)

After we connected to the **WorkShares** share, we see two folders: **Amy.J** and **James.P**. Let's look at the **Amy.J** folder.

We entered the **Amy.J** folder and see the **worknotes.txt** file, but the flag wasn't in this file.

![12_flag](/handson/images/dancing_htb/12_flag.png)

Then we returned to the root directory and moved to the **James.P** folder. Here we found the **flag.txt** file - this is our flag.

![13_result](/handson/images/dancing_htb/13_result.png)
