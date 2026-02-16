---
title: "Inter-Network SSH Access in Cisco and MikroTik Networks"
description: "This work examines the process of configuring inter-network SSH access in a multi-segment Cisco and MikroTik network, including routing, access rules, and connection verification"
image: "/images/ssh_net/ssh.jpg"
date: "February 8, 2026"
---
In any network, sooner or later there comes a need to manage equipment remotely. Running to each router with a console cable is not a great idea, especially if the devices are located in different offices or network segments. That's exactly why **SSH** is typically used for administration - a protocol that allows you to connect to devices over the network and do it securely.

SSH is needed so you can access a router or server, check the configuration, make changes, or see what's going on in the network. Unlike Telnet, which transmits data in plain text, SSH encrypts all traffic, including login and password, which is why it's used in normal, working networks.

In practice, a network is almost never limited to one subnet. Usually there are several segments connected to each other by routers. In such a situation, it's important not only to enable SSH, but also to properly configure routing between networks so devices can see each other. And also, restrict access so that SSH connections can only be made from needed addresses, not from just anywhere.

In this work, we'll practically walk through setting up SSH access in such a multi-segment network. The scheme uses Cisco and MikroTik routers, as well as machines with Windows 10 and Kali Linux. Throughout the work, we'll configure IP addresses, set up routes between subnets, verify connectivity, and organize secure connection to network devices via SSH, including restricting access on MikroTik by IP.

* * *

### 1. Build the Topology

![topology](/images/ssh_net/topology.png)

The topology is as follows: in the first office, a Windows 10 client connects directly to the G0/0 interface of the Cisco router, and the Cisco router itself connects with its G1/0 interface to MikroTik via a dedicated trunk, emulating a connection between two different network segments. On the other side, MikroTik is connected to the second office where Kali Linux is located.

In the following steps, IP addressing will be configured: Windows will get address 192.168.10.10, and Cisco — 192.168.10.1 in subnet 192.168.10.0/24, which is used in the first office. For the connection between routers in network 10.10.10.0/30, addresses 10.10.10.1 will be assigned to Cisco and 10.10.10.2 to MikroTik. In the second office, subnet 172.16.10.0/24 will be used, where MikroTik will get address 172.16.10.1, and Kali Linux — 172.16.10.10.

* * *

### 2. Configure IP Addresses on Cisco R1

![set_ip_cisco](/images/ssh_net/set_ip_cisco.png)

After building the topology, the next stage is configuring IP addresses on the Cisco router to ensure operation of the first office's local network and connection between offices. In our scheme, the Cisco router has two interfaces — the first interface G0/0 is connected to the local network where the Windows 10 client is located, and the second interface G0/1 is used for connection with the MikroTik router, which is in the second office. Thus, Cisco performs the role of gateway for devices inside the first office and simultaneously provides inter-network connection.

For the office's local network, we use subnet 192.168.10.0/24, which gives us 256 possible addresses, of which 254 are available for use by devices. The subnet mask 255.255.255.0 (or prefix /24) indicates that the first 24 bits of the address are the network portion, and the remaining 8 bits are for device addressing. In such a scheme, address 192.168.10.0 is the network address, meaning it's a service address and not assigned to devices, and address 192.168.10.255 is the broadcast address — it's used for sending packets to all network participants at once.

Therefore, for the Cisco router on interface G0/0, we assign address 192.168.10.1 — this is a convenient and familiar solution, when exactly the first available address is given to the gateway. This address will be used as the exit point from the network for all devices in the local segment, including the client computer with Windows 10, which will later get address 192.168.10.10.

The next interface G0/1 of the Cisco router is intended for connection with MikroTik. Here we use network 10.10.10.0/30. Mask 255.255.255.252 (or prefix /30) allows creating a very compact network of four addresses. This is typical practice for a "point-to-point" connection, when you need to minimize IP address waste, since such a link connects only two devices — Cisco and MikroTik routers. In this subnet:

- 10.10.10.0 - network address (service, not used).
- 10.10.10.1 - Cisco address.
- 10.10.10.2 - MikroTik address.
- 10.10.10.3 - broadcast address.

Using a /30 network is suitable for connecting two devices directly, ensuring address space economy and simplifying configuration.

As a result, the Cisco router gets two addresses:

- On interface G0/0 - 192.168.10.1 for interaction with the local network.
- On interface G0/1 - 10.10.10.1 for connection with MikroTik.

* * *

### 3. Configure IP Addresses on MikroTik R2

![set_ip_mikrotik](/images/ssh_net/set_ip_mikrotik.png)

When first starting MikroTik RouterOS through the console (for example, in GNS3), the device asks for login and password to enter. By default, the login is **admin**, and the password is absent (just press Enter). However, on first setup, the system mandatorily requires setting a new password, since you can't leave an empty password - this is because the new password cannot match the current (empty) one for access security. Therefore, when entering an empty password, an error will appear, and you'll need to enter a password for subsequent login.

Next, we proceed to assigning IP addresses on MikroTik interfaces, which is necessary for proper network operation and inter-network interaction.

In our topology, MikroTik has two interfaces:

- Interface connected to Cisco (internal link) - IP from network 10.10.10.0/30
- Interface connected to the second office (local network) - IP from network 172.16.10.0/24

For convenience and better configuration readability, I renamed the MikroTik interfaces (ether1, ether2, etc.) to more understandable names corresponding to their purpose, *To_Cisco*, *To_Kali* .

* * * 

### 4. Assign IP Addresses to Windows 10 and Kali Linux in Respective Subnets

#### Windows 10

![set_ip_windows](/images/ssh_net/set_ip_windows.png)

We assign IP addresses on client machines - Windows 10 and Kali Linux, so they can correctly interact with routers and each other within their subnets.

In Windows 10, this is done through network adapter settings. You need to open "Network and Sharing Center", select the active connection, go to "Properties", then select "Internet Protocol Version 4 (TCP/IPv4)" and click "Properties". Here you manually enter the IP address, subnet mask, and default gateway. For example, for the first office this will be IP 192.168.10.10 with mask 255.255.255.0 and gateway 192.168.10.1 (Cisco address).

![share_options_windows](/images/ssh_net/share_options_windows.png)

Additionally, in Windows 10 it's worth paying attention to firewall settings and sharing parameters (Share Options). By default, to increase security, the system blocks incoming ICMP requests (ping) and some types of traffic. For ping from other devices to successfully go through, you need to either temporarily disable the firewall, or configure rules to allow incoming ping requests and other needed protocols. Without this setting, ping may simply not reach Windows, despite correct IP and routes.

----

#### Kali Linux

![set_ip_kali](/images/ssh_net/set_ip_kali.png)

In Kali Linux, the IP address is assigned through the terminal with the ip addr add command, for example: sudo ip addr add 172.16.10.10/24 dev eth0, where 172.16.10.10 is the IP address, /24 is the subnet mask, and eth0 is the network interface name. To configure the default gateway, the command sudo ip route add default via 172.16.10.1 is used.

Manual IP address assignment is necessary since automatic IP acquisition (DHCP servers) are absent in our topology, which helps better understand the basics of IP addressing and how devices communicate on the network.

* * *

### 5. Configure Routing on Cisco

![routing_cisco](/images/ssh_net/routing_cisco.png)

After assigning IP addresses on interfaces, we need to configure routing so devices from different subnets can reach each other. On the Cisco router, we add a static route to the second office's subnet 172.16.10.0/24, which is located behind MikroTik.

We use the command: ```ip route 172.16.10.0 255.255.255.0 10.10.10.2```

This tells Cisco: "If you need to reach network 172.16.10.0/24, send packets through the next hop 10.10.10.2" — which is MikroTik's address on the link between routers.

Thanks to this route, when Windows 10 wants to ping Kali Linux (172.16.10.10), the packet goes to Cisco, Cisco sees the route to 172.16.10.0/24 and forwards the packet to MikroTik, which then delivers it to Kali.

* * *

### 6. Configure Routing on MikroTik

![routing_mikrotik](/images/ssh_net/routing_mikrotik.png)

Similarly, on MikroTik we need to add a route to the first office's network so Kali Linux can reach Windows 10. We add a static route using the command:

```/ip route add dst-address=192.168.10.0/24 gateway=10.10.10.1```

This tells MikroTik: "To reach network 192.168.10.0/24, forward packets through 10.10.10.1" — the Cisco address.

Now the routers know how to reach each other's subnets, and devices in different offices can exchange data.

* * *

### 7. Verify Connectivity Between All Devices

#### From Windows 10

![ping_from_windows_to_routers](/images/ssh_net/ping_from_windows_to_routers.png)

Now it's time to verify that everything is configured correctly. To do this, we'll send ping from both client machines to router interfaces and to each other.

![ping_from_windows_to_routers2](/images/ssh_net/ping_from_windows_to_routers2.png)

The screenshot shows that from Windows 10 we first send ping to address 10.10.10.2 — this is the MikroTik interface that connects the two routers. Getting responses from MikroTik, we see that the connection with the neighboring router is established and working normally. Then we ping the final address in the other network — 172.16.10.10, where Kali Linux is located. Responses from Kali show that routing is configured correctly, and packets reach the needed device in the second office.

---

#### From Kali Linux

![ping_from_kali_to_routers2](/images/ssh_net/ping_from_kali_to_routers2.png)

From Kali the situation is similar: first we send ping to 10.10.10.1 - the Cisco interface, and get responses confirming that there's connection with the first router. Then we ping Windows 10 at address 192.168.10.10, and successful responses show that devices in different offices can exchange data.

* * *

### 8. Configure SSH on Cisco

![ssh_on_cisco](/images/ssh_net/ssh_on_cisco.png)

Configuring SSH on Cisco is an important step for secure remote access to the router. By default, Cisco uses Telnet, which transmits data in plain text, which is insecure and vulnerable to interception. Therefore, in the vty line configuration, it's necessary to disable Telnet and enable only SSH to increase security.

First thing, we set the hostname and domain name, since exactly these parameters are used when generating RSA cryptographic keys. The domain name is needed to create a unique device identifier that's part of the encryption keys.

Next, we generate RSA keys for SSH. The minimum recommended key size is 1024 bits, which already provides an acceptable level of protection. However, if increased security and compliance with modern standards is important, it's better to use a 2048-bit key — this significantly complicates key cracking and protects the connection from attacks. RSA keys create a pair — public and private, which are necessary for encryption and authentication of SSH sessions.

After this, we create a local user account, in my case with login admin and password test123, which will be used for authentication when connecting via SSH. This ensures access control and prevents unauthorized entry.

When configuring vty lines, we use the login local command — it indicates that local user database is used for authentication (meaning accounts created on the device itself).

Also, I want to mention, since questions may arise about vty lines — why the range from 0 to 4? Because routers usually have 5 vty lines available numbered from 0 to 4, which allows simultaneously supporting up to 5 remote connections via SSH or Telnet. On switches, the range 0 to 15 is more commonly used, meaning 16 lines, since switches can handle a larger number of simultaneous sessions.

In vty line settings, we specify authentication through local user database, enable only SSH protocol and prohibit Telnet.

We'll leave SSH access verification from the client machine for the following steps, where we'll test remote connections. Let's move on to configuring SSH on MikroTik.

* * *

### 9. Configure SSH on Mikrotik

![ssh_on_mikrotik](/images/ssh_net/ssh_on_mtik.png)

Now let's move on to enabling and configuring SSH service on MikroTik. With the command ```/ip service enable ssh``` we activate the SSH server, which allows accepting SSH connections. Next, with the command ```/ip ssh set strong-crypto=yes``` we enable the use of stronger encryption algorithms, increasing connection security. The option ```allow-none-crypto=no``` prohibits insecure encryption variants that could weaken protection.

In the current setup, we allow password authentication — the command ```/ip ssh set always-allow-password-login=yes``` allows logging in using a password. Later we'll restrict access only by IP addresses to increase security and limit the circle of people who can connect via SSH. We'll configure these restrictions later through firewall and additional security rules.

I want to note that the password for SSH connection is the one we set when first starting MikroTik in section 3 when configuring the router and assigning IP addresses. Besides this, if necessary, you can create additional users with new logins and passwords for more flexible access management.

---

### 10. Using SSH, Connect from Windows 10 to Cisco and MikroTik, and also from Kali Linux to Cisco and MikroTik

#### On Kali Linux

![kali_to_cisco](/images/ssh_net/kali_to_cisco.png)

On Kali Linux I have OpenSSH version 8.0p1 (Debian 4) with OpenSSL 1.1.1c installed. In new versions of OpenSSH, more modern and secure encryption algorithms and keys are used by default for SSH sessions. However, Cisco, especially on older IOS versions, supports a limited set of ciphers — mainly older algorithms like aes192-cbc or aes256-cbc.

Therefore, when simply trying to execute the command ssh admin@192.168.10.1, Kali tries to use modern algorithms that Cisco doesn't understand, and the connection isn't established. To fix this, you need to explicitly specify an encryption algorithm compatible with Cisco, for example:

```ssh -c aes192-cbc admin@192.168.10.1``` or ```ssh -c aes256-cbc admin@192.168.10.1```

This way we force the SSH client to use exactly those algorithms that Cisco accepts.

![kali_to_mikrotik](/images/ssh_net/kali_to_mikrotik.png)

In the case of MikroTik, there are no such limitations, since MikroTik supports modern algorithms by default. Therefore, to connect to MikroTik, it's simply enough: ```ssh admin@172.16.10.1```

---

#### On Windows 10

![win_to_cisco](/images/ssh_net/win_to_cisco.png)

Similarly, when connecting from Windows using the built-in SSH client in command prompt (CMD), you also need to consider cipher support, especially when connecting to Cisco. By default, the Windows SSH client uses modern encryption algorithms that may not be supported by Cisco, especially on older IOS versions. Therefore, the simple command ```ssh admin@192.168.10.1``` won't work due to encryption algorithm incompatibility. To establish a connection, you need to specify a Cisco-compatible cipher, ```ssh -c aes256-cbc admin@192.168.10.1```

Since I don't have specialized terminal emulators at hand, such as PuTTY or SecureCRT, I use the built-in CMD to perform SSH connections.

![win_to_mikrotik](/images/ssh_net/win_to_mikrotik.png)

In the case of MikroTik, such additional configuration is not required, since it supports modern encryption algorithms out of the box. Therefore, to connect it's simply enough ```ssh admin@172.16.10.1```

* * *

### 11. On MikroTik, Allow SSH Connection Only from Kali Linux(172.16.10.10), Block All Other IPs

![allow_on_mikrotik](/images/ssh_net/allow_on_mikrotik.png)

Now let's move on to configuring security on MikroTik - we'll restrict SSH access only from the Kali Linux computer (IP 172.16.10.10). For this, we'll configure firewall rules that will allow SSH connections only from this IP, and block all other connections.

This will allow us to increase security so that no outsider can connect to MikroTik via SSH. Such practice is often used in real networks to restrict access to important equipment.

As a result, we'll create two rules: the first — allow SSH from Kali Linux, the second — block SSH from all other addresses.

![allow_demo](/images/ssh_net/allow_demo.png)

As can be seen in the screenshots, Kali connects to MikroTik via SSH without problems, while connection attempts from Windows 10 don't go through, meaning the access restriction is working correctly.
