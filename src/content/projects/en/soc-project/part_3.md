---
title: "Part-3. Installing and Configuring Wazuh on Ubuntu Server"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---
[In the previous part](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_2) we installed all virtual machines that will participate in our project. Now we're moving on to configuring the main component of our laboratory - the Wazuh monitoring system. In this part, we'll configure the network on Ubuntu Server and install the full Wazuh stack: Manager, Indexer, and Dashboard.



## Step 1. Checking Network Settings

First thing after logging into the system, we check current network settings. We open the terminal and execute the command: **ip a**

![01_ip_a](/handson/images/soc_project/part_3/01_ip_a.png)

We see that the **ens33** interface received a dynamic IP address **10.10.70.139** via DHCP. This doesn't suit us. The Wazuh server must have a permanent static address, otherwise agents on Windows machines will lose connection with it after each reboot.



## Step 2. Configuring Static IP

For network configuration in Ubuntu, the **Netplan** tool is used. Its configuration files are located in the **/etc/netplan/** directory. We check the contents of this directory and open the configuration file in the nano editor:

```
ls /etc/netplan/
sudo nano /etc/netplan/50-cloud-init.yaml
```

![02_netplan](/handson/images/soc_project/part_3/02_netplan.png)

We're greeted by a file with default settings where DHCP is enabled. We need to change it so that the **ens33** interface receives the static address **10.10.70.30**, exactly this IP we specified in our diagram for the Wazuh server.

![03_netplan_editing](/handson/images/soc_project/part_3/03_netplan_editing.png)

We edit the file as follows:

```
network:
  ethernets:
    ens33:
      dhcp4: no
      addresses: [10.10.70.30/24]
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
      routes:
        - to: default
          via: 10.10.70.2
  version: 2
```

Let's break down each line.
- **dhcp4: no** disables automatic address acquisition.
- **addresses** sets our server's static IP.
- **nameservers** specifies DNS servers, we use Google DNS and Cloudflare.
- **routes** sets the default route through the network gateway.

After saving, we apply the new configuration: ``` sudo netplan apply ```



## Step 3. Checking Network After Changes

We check that the static IP was applied correctly and make sure there's internet access: 

```
ip a
ping 8.8.8.8
```

![05_ip_a_ping](/handson/images/soc_project/part_3/05_ip_a_ping.png)

We see that the **ens33** interface now has address **10.10.70.30/24** - exactly what we need. Ping to 8.8.8.8 passes successfully, internet connection works. Moving on to the next step.



## Step 4. Updating the System

Before installing Wazuh, let's update all system packages to current versions:
```
sudo apt-get update && sudo apt-get upgrade -y
```

![06_apt_update](/handson/images/soc_project/part_3/06_apt_update.png)

This is standard practice before installing any serious software. We make sure the system has the latest security patches and current dependencies.



## Step 5. Creating Wazuh Configuration File

We'll be installing Wazuh in all-in-one mode - all three components (Manager, Indexer, and Dashboard) on one machine. Before running the installer, we need to create a config.yml configuration file in which we'll specify our server's IP address for each component: 

![10_config](/handson/images/soc_project/part_3/10_config.png)

In the file we write the following:

```
nodes:
  indexer:
    - name: node-1
      ip: "10.10.70.30"
  server:
    - name: wazuh-1
      ip: "10.10.70.30"
  dashboard:
    - name: dashboard
      ip: "10.10.70.30"
```

We save the file. This file will be used by the installer to generate SSL certificates and correctly bind components to each other.



## Step 6. Downloading Installer and Generating Certificates

We download the official Wazuh installer script:

``` curl -sO https://packages.wazuh.com/4.7/wazuh-install.sh ```

![07_downloading_wazuh](/handson/images/soc_project/part_3/07_downloading_wazuh.png)

Now we launch SSL certificate generation based on our config.yml. These certificates ensure a secure connection between Wazuh components:

``` sudo bash wazuh-install.sh -g -c config.yml ```

![11_certificate](/handson/images/soc_project/part_3/11_certificate.png)

The script generates all necessary certificates for the indexer, server, Dashboard, and administrative user and packages them into the **wazuh-install-files.tar** archive. Without this archive, further installation won't proceed.



## Step 7. Installing Wazuh

We launch final installation of all components:

``` sudo bash wazuh-install.sh -a ```

![08_downloading_wazuh](/handson/images/soc_project/part_3/08_downloading_wazuh.png)

Installation will take several minutes. The script will sequentially install and configure Wazuh Indexer, Wazuh Manager, Filebeat, and Wazuh Dashboard. We observe the process in the terminal - each component is installed and configured in turn.

![12_finished](/handson/images/soc_project/part_3/12_finished.png)

After completion, summary information appears on the screen: the address for logging into the web interface, username **admin**, and **generated password**. This password must be saved, it will be needed when first logging into the Dashboard and is not displayed anywhere else.



## Step 8. First Login to Wazuh Dashboard

We open a browser on any machine in our network and go to the address:

``` https://10.10.70.30 ```

![13_wazuh_main](/handson/images/soc_project/part_3/13_wazuh_main.png)

We're greeted by the **Wazuh Dashboard** login page. We enter login admin and the password that was shown at the completion of installation.

![14_starting](/handson/images/soc_project/part_3/14_starting.png)

After first login, the system performs initialization: checks connection with Wazuh API, API version, and index presence. At the bottom of the screen, a message "Default API has been updated" will appear - this means initial setup was successful.

![15_main](/handson/images/soc_project/part_3/15_main.png)

We arrive at the main **Wazuh** management panel. Here we see the message "This instance has no agents registered" - this is absolutely normal for a freshly installed system. The panel displays the platform's main capabilities: Endpoint Security, Threat Intelligence, vulnerability detection, and file integrity monitoring. Wazuh is installed and ready to work.
