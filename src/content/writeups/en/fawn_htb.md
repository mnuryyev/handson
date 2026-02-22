---
title: "Fawn - HackTheBox (Easy)"
description: "Walkthrough of the Fawn machine on HackTheBox: using FTP to gain access to files, analyzing services, and obtaining the flag through anonymous access."
image: "/images/meow_htb/htb_main.jpg"
date: "February 22, 2026"
---
**Fawn** is one of the simple machines on the HTB platform, located in the *Starting Point* section. In this task, we'll work with the **FTP** protocol, as well as basic methods for bypassing authentication and obtaining the flag.

The machine has several standard vulnerabilities, such as open ports and incorrect access settings, which allow gaining access to the system. The main vulnerability is an unprotected **FTP service**, which provides the ability to access files on the server using simple tools.

![01_ip_machine](/handson/images/fawn_htb/01_ip_machine.png)

* * *

## Task 1: What does the abbreviation FTP stand for?

![02_task1](/handson/images/fawn_htb/02_task1.png)

**FTP** stands for *File Transfer Protocol*. This is a standard network protocol for transferring files between a client and server over a TCP/IP network.

---

## Task 2: On what port does the FTP service usually run?

![03_task2](/handson/images/fawn_htb/03_task2.png)

By default, the **FTP** service listens on port **21**. This is the standard port for establishing a connection with an FTP server and transferring files between client and server.

---

## Task 3: FTP transmits data without encryption. What abbreviation is used for a protocol that was developed as a secure alternative to FTP and is an extension of the SSH protocol?

![04_task3](/handson/images/fawn_htb/04_task3.png)

For secure file transfer, the SFTP (SSH File Transfer Protocol) protocol was developed. This protocol provides data encryption and protects it from interception, unlike FTP, which transmits data in plain text.

---

## Task 4: What command is used to send an ICMP request (ping) to check the connection to the target?

![05_task4](/handson/images/fawn_htb/05_task4.png)

To check the target machine's availability, we use the **ping** command. This tool sends an ICMP echo request to the target IP address and checks whether the machine responds. This is one of the simplest ways to make sure the target machine is available on the network.

---

## Task 5: What version of FTP can be identified on the target machine using scanning?

![06_task5](/handson/images/fawn_htb/06_task5.png)

![07_nmap_scan](/handson/images/fawn_htb/07_nmap_scan.png)

During scanning using Nmap or when connecting via FTP, you can determine that the target machine is running *vsftpd 3.0.3*. This is important information, as it helps understand what vulnerabilities can be used for exploitation. In this case, version *vsftpd 3.0.3* is known for a backdoor vulnerability.

---

## Task 6: What type of operating system is running on the target machine?

![08_task6](/handson/images/fawn_htb/08_task6.png)

![09_nmap_os](/handson/images/fawn_htb/09_nmap_os.png)

To determine the operating system type, we use the Nmap command with the *-O* flag for OS detection. In our case, the target machine uses Linux as its operating system.

---

## Task 7: What command is used to display the help menu of the 'ftp' client?

![10_task7](/handson/images/fawn_htb/10_task7.png)

![11_ftp_?](/handson/images/fawn_htb/11_ftp_?.png)

To see the available commands in the ftp client, the **help** or **?** command is used. It outputs a list of commands that can be used to work with the FTP server.

---

## Task 8: What login is used to enter FTP if you don't have an account?

![12_task8](/handson/images/fawn_htb/12_task8.png)

If you don't have an account to log into the FTP server, you can use the login *anonymous*. This login is often used to access public FTP servers where full authentication is not required. The point is that FTP servers configured for anonymous access allow users to connect without specifying a password or with an empty password, which provides access to public data or files. This login is used not only on public FTP servers, but can also be used to enter specific services configured to allow access to certain files without the need to create an account.

---

## Task 9: What response code do we get for the FTP message 'Login successful'?

![13_task9](/handson/images/fawn_htb/13_task9.png)

![14_login_suc](/handson/images/fawn_htb/14_login_suc.png)

When we successfully log into the FTP server, the server returns response code **230**. This code confirms successful authentication and login to the system.

---

## Task 10: There are several commands to list files and directories on an FTP server. One of them is dir. What other command is standard for displaying files in Linux systems?

![15_task10](/handson/images/fawn_htb/15_task10.png)

![16_ls](/handson/images/fawn_htb/16_ls.png)

In addition to the dir command, you can use the **ls** command to display the file list. This is a standard command for outputting a list of files in Linux systems, which also works in FTP sessions.

---

## Task 11: What command is used to download a file found on the FTP server?

![17_task11](/handson/images/fawn_htb/17_task11.png)

![18_get](/handson/images/fawn_htb/18_get.png)

To download a file from the FTP server, the *get* command is used. It allows downloading a file from the server to the local machine. For example, to download the flag.txt file, you need to execute the command: *get flag.txt*

---

## Obtaining the Flag

![19_flag](/handson/images/fawn_htb/19_flag.png)

![20_result](/handson/images/fawn_htb/20_result.png)
