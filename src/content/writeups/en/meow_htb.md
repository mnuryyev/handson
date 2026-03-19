---
title: "Meow - HackTheBox (Easy)"
description: "Walkthrough of the Meow machine on HackTheBox: using Telnet with an empty password to gain access, exploring services, and obtaining the flag on the target machine"
image: "/images/meow_htb/htb_main.jpg"
date: "February 22, 2026"
platform: "htb"
---
**Meow** is one of the simple machines on the HTB platform, which is located in the *Starting Point* section.

The machine represents a classic example of working with vulnerabilities such as **incorrect security settings and unprotected services**. In the process of solving it, we'll encounter open ports and vulnerable services that can be used to gain access. The main vulnerability is that the target machine runs **Telnet** with an empty password, which allows an attacker to gain access to the system without the need for authentication.


![01_ip_machine](/handson/images/meow_htb/01_ip_machine.png)

* * *

## Task 1: What does the abbreviation VM stand for?

![02_task1](/handson/images/meow_htb/02_task1.png)

VM stands for **Virtual Machine**.

In the context of the HTB platform, **VM** is a virtual environment in which all tasks are performed. A virtual machine imitates a real operating system, and it's used to safely test vulnerabilities and conduct various attacks without risking damage to your main system.

---

## Task 2: What tool do we use to interact with the operating system through the command line to execute commands, for example, to connect to VPN? This tool is also called a console or shell.

![03_task2](/handson/images/meow_htb/03_task2.png)

To interact with the operating system through the command line, a terminal (or console) is used. This is a tool that allows entering commands to perform various tasks, such as connecting to VPN, using scanning tools, etc.

---

## Task 3: What service do we use to connect to VPN in the HTB lab?

![04_task3](/handson/images/meow_htb/04_task3.png)

To connect to VPN in the HTB lab, the OpenVPN service is used. This is a popular open-source tool that allows creating a secure encrypted connection between our device and HTB servers.

---

## Task 4: What tool do we use to test the connection to the target machine using an ICMP request?

![05_task4](/handson/images/meow_htb/05_task4.png)

To test the connection to the target machine, we use the **ping** command. This tool sends an *ICMP echo request* to the target IP address and waits for a response. If the machine is available, it will respond to the request, and we can confirm that it's on the network and can be worked with. The ping command is a simple and effective way to check the availability of a remote machine.

---

## Task 5: What tool is the most popular for finding open ports on the target machine?

![06_task5](/handson/images/meow_htb/06_task5.png)

To find open ports on the target machine, the **Nmap** tool is used. This is a powerful network port scanner that allows discovering open ports, as well as determining services running on these ports. Nmap is one of the most popular tools in the security world, as it provides detailed information about the target machine, which allows researching vulnerabilities and planning further steps.

---

## Task 6: What service do we identify on port 23/tcp during scanning?

![07_task6](/handson/images/meow_htb/07_task6.png)

![08_telnet](/handson/images/meow_htb/08_telnet.png)

When scanning port *23/tcp* on the target machine, we discover the **Telnet** service. Telnet is an old protocol for remote access, which is used to connect to machines and manage them through the command line. However, this protocol is insecure, as it transmits data, including passwords, in plain text. Because of this, Telnet is often replaced with more secure protocols, such as SSH, but it can still be found on older systems.

---

## Task 7: What login allows logging into the target machine via Telnet with an empty password?

![09_task7](/handson/images/meow_htb/09_task7.png)

![10_root](/handson/images/meow_htb/10_root.png)

To connect to the target machine via **Telnet** with an empty password, we can use the **root** user. This is a vulnerability, as access to the machine can be obtained without a password, simply by specifying the root login. Such an error in security settings allows attackers to easily gain access to the system with superuser rights, which represents a serious threat.

---

## Obtaining the Flag

After we connected to the target machine via **Telnet** with the **root** user and an empty password, we executed the *ls* command to view the contents of the current directory. And here we see the *flag.txt* file, which contains our flag.

![11_flag](/handson/images/meow_htb/11_flag.png)

![12_result](/handson/images/meow_htb/12_result.png)
