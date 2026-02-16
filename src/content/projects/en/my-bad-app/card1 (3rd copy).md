---
title: "Part 1: Interface"
description: "How I drew buttons"
---
In any network, devices must receive IP addresses, gateways, and DNS servers in order to communicate correctly and have Internet access. Of course, you can configure everything manually, but in real life it is inconvenient and often leads to errors. The DHCP protocol (Dynamic Host Configuration Protocol) comes to the rescue. Its task is simple - to automatically distribute to clients all the necessary network parameters, including IP, subnet mask, gateway and DNS.

In this paper, we will analyze in detail how DHCP works, from the DORA messaging process (Discover, Offer, Request, Knowledge), through network traffic analysis in Wireshark, to configuring the DHCP server on MikroTik and Ubuntu Server. We will also look at additional protocol features such as DHCP Relay, which allows you to serve clients on other subnets.

First, let's build a simple network in GNS3. It includes three clients - Windows 10, Ubuntu and a lightweight VPC emulator. They are all connected to a Switch-1 switch, and the switch is connected to a MikroTik router. At this stage, the router will act solely as a DHCP server, distributing IP addresses to clients within the network.

The subnet 192.168.10.0/24 is designed for 254 working hosts. The first network address (192.168.10.0) is reserved as a network identifier, and the last one (192.168.10.255) is used for broadcasts within the subnet. Accordingly, the operating addresses are in the range from 192.168.10.1 to 192.168.10.254.

![Альтернативный текст для картинки](/images/photo.jpg "Подсказка при наведении")

## 2. Configuring DHCP on MikroTik

Let's move on to configuring MikroTik. When you first start MikroTik via the console, the device asks for a username and password to log in. By default, the username is admin, but there is no password (just press Enter). However, during the first configuration, the system necessarily requires you to set a new password, since you cannot leave an empty password. This is due to the fact that the new password cannot match the current one (i.e., empty) for access security. Therefore, an error will appear when entering an empty password, and you will need to enter the password for subsequent login.

