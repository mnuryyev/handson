---
title: "Part-5. Configuring Active Directory and Joining Windows 10 to Domain"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---
[In the previous part](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_4) we connected Windows 10 to Wazuh and installed Sysmon - our victim machine is now fully monitored. In this part, we're moving on to Windows Server 2022 and deploying **Active Directory** on it. We'll create the **handson.local** domain, configure the organizational structure, create a test user, and join **target-PC** to the domain. 

A domain environment is the main target of attackers in real infrastructures. And domain authentication events, which we'll start seeing in Wazuh after this step, will become key evidence in attack detection in the next part.


## Phase 1: Windows Server Configuration

### Step 1. Getting to Know Server Manager

After logging into Windows Server, we're greeted by Server Manager - the central server management console. So far there are minimal roles here: only basic File and Storage Services, which is present by default. Exactly from here we'll be installing Active Directory.

![01_starting_winser](/handson/images/soc_project/part_5/01_starting_winser.png)



### Step 2. Configuring Static IP Address

Before installing AD, the server must be assigned a static IP address. The domain controller cannot work with a dynamic address - client machines and other servers must always know where to find it.
We open network adapter properties, go to IPv4, and manually set the following parameters according to our diagram:

- IP address: 10.10.70.25
- Subnet mask: 255.255.255.0
- Default gateway: 10.10.70.2
- Preferred DNS: 8.8.8.8

![02_change_ip](/handson/images/soc_project/part_5/02_change_ip.png)

For now we specify external DNS, after we install Active Directory, the server will become a DNS server for itself and for all machines in the domain. We'll fix this later.



### Step 3. Checking Network Settings

We open the command prompt and check that everything is configured correctly. We execute **ipconfig**, we see the static address **10.10.70.25**. Then we check internet access with the command ping google.com.

![03_checking](/handson/images/soc_project/part_5/03_checking.png)

Ping passes successfully - the network works. Now we check connectivity with our Wazuh server:

``` ping 10.10.70.30 ```

![04_ping_wazuh](/handson/images/soc_project/part_5/04_ping_wazuh.png)

Ping to **10.10.70.30** passes with minimal delay - the domain controller and Wazuh server see each other. This means that when we connect the Wazuh agent to this server, events will reach the SIEM without problems. The network is configured correctly, moving on to Active Directory installation.

* * *

## Phase 2: Installing Active Directory Domain Services

### Step 4. Launching the Add Roles Wizard

We return to **Server Manager** and click **"Add roles and features"**.

![05_add_rules](/handson/images/soc_project/part_5/05_add_rules.png)

The role addition wizard opens. On the first screen we're greeted by a page with recommendations - to make sure the administrator password is set and static IP is configured. We've already done all this. We check the box **"Skip this page by default"** and click **Next**.

![06_next](/handson/images/soc_project/part_5/06_next.png)



### Step 5. Choosing Installation Type and Target Server

On the next screen we choose installation type **"Role-based or feature-based installation"**. This is the standard choice when configuring a specific server.

![07_role](/handson/images/soc_project/part_5/07_role.png)

Next the wizard offers to select the target server. The list displays our **DC** server with IP `10.10.70.25` - we select it and click **Next**.

![08_next](/handson/images/soc_project/part_5/08_next.png)



### Step 6. Choosing Active Directory Domain Services Role

On the role selection screen, we find and check the box for **"Active Directory Domain Services"**. A popup window appears offering to add necessary management components - we agree and click **Add Features**, then **Next**.

![09_installing_ad](/handson/images/soc_project/part_5/09_installing_ad.png)

On the next screen with additional components, we don't change anything and click **Next**.

![09_next](/handson/images/soc_project/part_5/09_next.png)



### Step 7. Completing Role Installation

We click **Install** and wait for installation to complete. After finishing, the wizard outputs the result with an important notification at the bottom of the screen:

> *"Additional steps are required to make this machine a domain controller. Promote this server to a domain controller."*

![10_installed](/handson/images/soc_project/part_5/10_installed.png)

Role installation is only the first step. The server itself is not yet a domain controller. We click on the link **"Promote this server to a domain controller"**.

![11_install_domain](/handson/images/soc_project/part_5/11_install_domain.png)

* * *

## Phase 3: Creating the handson.local Domain

### Step 8. Creating a New Forest

The Active Directory configuration wizard launches. Since we're deploying a domain from scratch, no domain existed before this, we choose the option **"Add a new forest"** and enter the root domain name: **`handson.local`**.

![12_adding_new_forest](/handson/images/soc_project/part_5/12_adding_new_forest.png)



### Step 9. Configuring Domain Controller Parameters

On the next screen we set key parameters. We leave forest and domain functional levels at **Windows Server 2016** - this is the standard choice ensuring compatibility. We leave checkboxes **DNS server** and **Global Catalog** marked - they're mandatory for the first domain controller. We set the **DSRM** (Directory Services Restore Mode) password - this is an emergency password for AD recovery in case of failure. We remember it.

![13_pass](/handson/images/soc_project/part_5/13_pass.png)

![14_next](/handson/images/soc_project_part_5/14_next.png)



### Step 10. Database Paths

The wizard offers to specify paths for storing the NTDS database, logs, and SYSVOL folder. We leave default paths - `C:\Windows\NTDS` and `C:\Windows\SYSVOL`.

![15_paths](/handson/images/soc_project/part_5/15_paths.png)



### Step 11. Installation and Reboot

We click **Install**. The process of Active Directory installation and configuration begins. The system creates the `handson.local` forest, configures DNS and replication. After completion, the server automatically reboots.

![16_installing](/handson/images/soc_project/part_5/16_installing.png)

After reboot, the login screen has changed - in the lower left corner **`HANDSON\Administrator`** is now displayed. This means the server has successfully become a domain controller for `handson.local`.

![17_login_page](/handson/images/soc_project/part_5/17_login_page.png)

We log in with domain administrator credentials.

* * *

## Phase 4: Creating Organizational Structure and User

### Step 12. Opening Active Directory Users and Computers

After login, we open **Server Manager**, go to the **Tools** menu, and select **Active Directory Users and Computers**.

![18_tools](/handson/images/soc_project/part_5/18_tools.png)

The domain management snap-in opens before us. Here we'll create organizational units and users.



### Step 13. Creating IT Organizational Unit

We right-click on the **handson.local** domain, choose **New → Organizational Unit**.

![19_ou](/handson/images/soc_project/part_5/19_ou.png)

In the name field we enter **`IT`** - this will be our information technology department. We leave the **"Protect container from accidental deletion"** checkbox enabled for protection against accidental deletion.

![20_it](/handson/images/soc_project/part_5/20_it.png)



### Step 14. Creating Test User

In the left panel we select the just-created **IT** unit. We right-click on the right panel and choose **New → User**.

![21_new_user](/handson/images/soc_project/part_5/21_new_user.png)

We fill in the new user fields: **First name** - `Test`, **Last name** - `User`, **User logon name** - `testuser`. Exactly this name will be used to log into the domain.

![22_test_user](/handson/images/soc_project/part_5/22_test_user.png)

On the next step we set a password for the user. We uncheck **"User must change password at next logon"** - this will simplify the first test login. We click **Next** and **Finish**.

![23_pass](/handson/images/soc_project/part_5/23_pass.png)

The created user **Test User** is now displayed in the **IT** organizational unit. The domain is configured, the user is ready.

![24_set_user](/handson/images/soc_project/part_5/24_set_user.png)

* * *

## Phase 5: Joining Windows 10 to Domain

### Step 15. Changing DNS on Windows 10

We switch to the **target-PC** machine. For the computer to find the `handson.local` domain, it must use the DNS of our domain controller, not external DNS. Without this step, the computer simply won't see the domain.

We open network adapter settings, go to **IPv4** properties, and change the DNS server address to the domain controller's IP - **`10.10.70.25`**.

![27_dns_win10](/handson/images/soc_project/part_5/27_dns_win10.png)

We save the settings.



### Step 16. Joining the Domain

We open **Settings → System → About** and click **"Advanced system settings"**.

![25_win10](/handson/images/soc_project/part_5/25_win10.png)

In the opened **System Properties** window on the **Computer Name** tab, we click **"Change..."**.

![26_change](/handson/images/soc_project/part_5/26_change.png)

In the **Member of** section we switch from **Workgroup** to **Domain** and enter our domain name - **`handson.local`**.

The system requests credentials for joining the domain. We enter login **Administrator** and the domain administrator's password.

![28_ad_login](/handson/images/soc_project/part_5/28_ad_login.png)



### Step 17. Successful Domain Join

A window appears with the message:

> **"Welcome to the handson.local domain."**

![29_success](/handson/images/soc_project/part_5/29_success.png)

Computer `target-PC` has successfully joined the domain. We reboot the machine.



### Step 18. Logging in with Domain User

After reboot, the login screen has changed. In the lower left corner, the **"Other user"** option has appeared - we click on it.

![30_testuser](/handson/images/soc_project/part_5/30_testuser.png)

We enter the login of the domain user we created - **`testuser`** - and their password. Login performed successfully.

![31_success](/handson/images/soc_project/part_5/31_success.png)

`target-PC` is now a full member of the **handson.local** domain and logs in with a domain account.

* * *

## Summary

This completes the fifth part. We deployed Active Directory on Windows Server 2022 and created the **handson.local** domain, configured static IP and verified connectivity with all laboratory nodes, created the **IT** organizational unit and test user **testuser**, and successfully joined `target-PC` to the domain and verified login with the domain account.
