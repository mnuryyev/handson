---
title: "Part-2. Infrastructure Preparation"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---

[In the first part](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_1) we built a diagram of our laboratory and examined the architecture - who interacts with whom and why. Now we're moving on to practice. In this part, we'll install all virtual machines that will participate in our project.

As a result, we'll have four machines ready: Windows 10 in the role of victim, Kali Linux in the role of attacker, Windows Server 2022 with AD, and Ubuntu Server with Wazuh. We'll configure each component in the following parts. Right now our task is simply to deploy all machines and make sure they start correctly.

We'll be running all virtual machines in VMware.



## Windows 10

Windows 10 is already installed and ready to work, so we won't dwell on this step in detail.

![windows_installed](/handson/images/soc_project/part_2/windows_installed.png)



## Kali Linux

Kali Linux is also already installed and ready to work.

![windows_installed](/handson/images/soc_project/part_2/kali_installed.png)



## Windows Server 2022

Windows Server 2022 will perform the role of domain controller for handson.local. Exactly on this machine we'll later install Active Directory Domain Services and create domain users. But first we need to deploy the operating system itself.

The image can be downloaded from the Microsoft website. There we need to choose download in ISO format.

When the ISO is downloaded, we open VMware and create a new virtual machine. We set the name - we'll call it DC (Domain Controller) and specify the path to the downloaded ISO image. We set RAM to 4 GB, processor - 1 CPU, disk size - 50 GB. We start the machine.

After the installer loads, we're greeted by the standard language settings screen, leave everything default and click **Next**, then **Install Now**.

On the operating system version selection screen, we need to choose **Windows Server 2022 Standard Evaluation (Desktop Experience)**. If we choose the version without Desktop Experience, we'll only get a command line without a graphical interface.

![windows_installed](/handson/images/soc_project/part_2/installing_win_serv.png)

As usual, we accept the license agreement.

After installation completes, the system will ask us to set a password for the **Administrator** account. We enter a strong password and click Finish.

![windows_installed](/handson/images/soc_project/part_2/pass_winser.png)


Windows Server is installed and ready to work. Moving on to the last machine.

![windows_installed](/handson/images/soc_project/part_2/winser_installed.png)



## Ubuntu Server

Ubuntu Server will be the foundation of our monitoring system. On it we'll deploy **Wazuh Manager**, **Wazuh Indexer**, and **Wazuh Dashboard**. Exactly this machine will receive all events from agents, analyze them, and display alerts. Therefore, we'll allocate it slightly more resources than other machines. Wazuh will constantly receive and index events from all laboratory machines, and it needs a performance reserve.

To download the image, we go to the official ubuntu website, download Ubuntu Server 22.04 LTS version. The version may differ slightly depending on the download moment, but any release within 22.04 will work.

When the image is downloaded, we create a new virtual machine in VMware and name it **SOC**. We specify the downloaded ISO image. This machine's parameters will differ from the others: we set 8 GB RAM, 2 CPUs, and 60 GB of disk space. We start the machine.

After startup, we're greeted by the installer menu. We choose the first item - Try or Install Ubuntu Server. Next, the installer will offer us to choose language, keyboard layout, and network settings, leave everything default and continue clicking Done or Enter on each screen. On the storage configuration screen, the installer will offer default configuration, we accept it and click Done, then Continue.

The next important screen is account creation. Here we need to fill in several fields. In the Your name field, we enter any name. In the Your server's name field, we enter **soc** - this will be our server's hostname. In the Username and Password fields, we set credentials that we'll definitely remember - they'll be needed for every login to the system. Click Done.

![windows_installed](/handson/images/soc_project/part_2/ubuntu_server1.png)

We skip the Ubuntu Pro installation offer. But we do install OpenSSH.

![windows_installed](/handson/images/soc_project/part_2/ubuntu_server2.png)

When the process completes, a Reboot Now button will appear at the bottom of the screen - we click it. The system may show an error like **Failed unmounting /cdrom** - this is normal behavior, just press Enter and wait for reboot.

![windows_installed](/handson/images/soc_project/part_2/complete_installation.png)

After reboot, we're greeted by the system login screen. We enter the username and password we set during installation.

![windows_installed](/handson/images/soc_project/part_2/start_ubuntu_server.png)
