---
title: "DHCP: Server Configuration, Relay and Traffic Analysis in Wireshark"
description: "In this work, we'll thoroughly examine how DHCP works, from the DORA message exchange process (Discover, Offer, Request, Acknowledge), through network traffic analysis in Wireshark"
image: "/images/dhcp_net/dhcp_main.jpg"
date: "February 6, 2026"
---

In any network, devices need to obtain IP addresses, gateways, and DNS servers to correctly exchange data and have internet access. Of course, everything can be configured manually, but in real life this is inconvenient and often leads to errors. This is where the **DHCP (Dynamic Host Configuration Protocol)** comes in. Its task is simple - to automatically distribute all necessary network parameters to clients, including IP, subnet mask, gateway, and DNS.

In this work, we'll thoroughly examine how DHCP works, from the **DORA (Discover, Offer, Request, Acknowledge)** message exchange process, through network traffic analysis in Wireshark, to configuring a DHCP server on MikroTik and Ubuntu Server. We'll also look at additional protocol capabilities, such as DHCP Relay, which allows serving clients in other subnets.

For starters, we'll build a simple network in GNS3. It includes three clients - Windows 10, Ubuntu, and a lightweight VPCS emulator. They all connect to Switch-1, and the switch is linked to a MikroTik router. At this stage, the router will exclusively perform the role of a DHCP server, distributing IP addresses to clients within the network.

The 192.168.10.0/24 subnet is designed for 254 working hosts. The first address in the network (192.168.10.0) is reserved as the network identifier, and the last (192.168.10.255) is used for broadcast transmissions within the subnet. Accordingly, working addresses are in the range from 192.168.10.1 to 192.168.10.254.

### 1. Build the Topology

![01_topology](/handson/images/dhcp_net/01_topology.png)

For starters, we'll build a simple network in GNS3. It includes three clients — Windows 10, Ubuntu, and a lightweight VPCS emulator. They all connect to Switch-1, and the switch is linked to a MikroTik router. At this stage, the router will exclusively perform the role of a DHCP server, distributing IP addresses to clients within the network.

The *192.168.10.0/24* subnet is designed for 254 working hosts. The first address in the network (192.168.10.0) is reserved as the network identifier, and the last (192.168.10.255) is used for broadcast transmissions within the subnet. Accordingly, working addresses are in the range from 192.168.10.1 to 192.168.10.254.

* * *

### 2. Configuring DHCP on MikroTik

![02_mikrotik_admin](/handson/images/dhcp_net/02_mikrotik_admin.png)

![03_mikrotik_password](/handson/images/dhcp_net/03_mikrotik_password.png)

Let's proceed to MikroTik configuration. When launching MikroTik for the first time through the console, the device requests a login and password. By default, the login is **admin**, and there is no password (just press Enter). However, during initial setup, the system requires setting a new password, as an empty password cannot be left - this is because the new password cannot match the current one (i.e., empty) for security access. Therefore, when entering an empty password, an error will appear, and you'll need to enter a password for subsequent login.

* * *

![04_setting_mikrotik](/handson/images/dhcp_net/04_setting_mikrotik.png)

After login, the first step is to assign an IP address to the interface through which clients will be connected — in our case, ether1. The IP address is set within the 192.168.10.0/24 subnet, where "/24" indicates the subnet mask 255.255.255.0. The subnet mask determines which addresses are considered part of the local network and allows devices to correctly exchange data with each other. Without assigning IP and mask, clients won't be able to interact with the DHCP server.

The next step is to create an IP address pool — a range of addresses from which the DHCP server will automatically issue IPs to clients. In our case, the pool covers addresses from 192.168.10.10 to 192.168.10.100. Additionally, when configuring DHCP, a DNS server is specified, for example 8.8.8.8, so clients can correctly resolve names on the network and on the Internet. The pool and DNS specification allow centralized management of address distribution, prevent conflicts, and ensure correct operation of all devices. The lease time is set to one day, which allows automatically freeing addresses from devices that are no longer connected and reusing them for new clients.

Using a pool also simplifies network organization: addresses outside the pool can be reserved for static devices, such as servers or printers, so they don't fall under automatic DHCP assignment. Thus, the pool, subnet mask, and DNS server are key elements of DHCP configuration, ensuring correct, unique, and managed distribution of IP addresses for all clients.

* * *

### 3. DORA Analysis

![05_dora_win](/handson/images/dhcp_net/05_dora_win.png)

* * *

![06_dora_ubuntu](/handson/images/dhcp_net/06_dora_ubuntu.png)

* * *

![07_dora_vpcs](/handson/images/dhcp_net/07_dora_vpcs.png)

* * *

![08_ip_all](/handson/images/dhcp_net/08_ip_all.png)

After the DHCP server was brought up and enabled, all devices on the network automatically received their settings. Each client received an IP address that is unique within the pool defined on the server, a subnet mask to understand which addresses belong to the local network, a gateway that will allow devices to access other networks in future tasks, and a DNS server to correctly resolve domain names. In addition, other parameters necessary for normal network operation are transmitted, such as the address lease time.

All this data is transmitted via the DHCP protocol, and the process of a client obtaining an IP address can be traced through the DORA message sequence: Discover, Offer, Request, and Acknowledgment. First, the client broadcasts a request to obtain an address (Discover), the server responds with an offer of a free IP (Offer), the client confirms the address selection (Request), and the server completes the process by confirming the IP assignment (Acknowledgment). Thanks to this mechanism, devices receive all necessary parameters automatically and are ready to work on the network.

Now let's move on to the DORA process itself and examine each stage in detail using one device as an example to clearly show what exactly happens between the client and server at each step.

* * *

![09_discover](/handson/images/dhcp_net/09_discover.png)

When a device connects to the network and doesn't yet have an IP address, it sends **DHCP Discover** — the first step of the DORA process. Simply put, the client informs the network that it's new and wants to receive settings for operation. Let's examine what actually happens at each level.

**Data Link Layer (Ethernet II):** At this level, the packet is sent broadcast with the destination address `ff:ff:ff:ff:ff:ff`, so all devices on the local network receive the message. This is necessary because the client doesn't yet know where the DHCP server is located. The packet source is the client's MAC address, the unique identifier of its network card. Thanks to this, any DHCP server on the network will be able to determine who is making the request and respond to it.

**Network Layer (IP):** The client doesn't yet have an IP address, so `0.0.0.0` is used as the source. The packet destination is `255.255.255.255` to broadcast reach all devices on the local network. This double broadcast (at both data link and network layers) guarantees that Discover will reach all DHCP servers on the subnet, even if there are several.

**Transport Layer (UDP):** The client sends the packet through port 68, and DHCP servers receive it on port 67. UDP is used for connectionless transmission, which simplifies and speeds up the process. Each server on the network gets the opportunity to process the request and offer the client a free IP address.

**Application Layer (DHCP):** The main request information is here. Message type — Discover, which indicates searching for a DHCP server. Transaction ID is unique for this attempt, so the client can match received responses with the sent request. IP fields are still empty, as the client has no address. DHCP options include: Message Type = Discover, Client Identifier (client's MAC), Host Name, Vendor class identifier (for example, MSFT 5.0), and Parameter Request List with a list of necessary settings — subnet mask, gateway, DNS, and other parameters. Discover informs servers about the presence of a new client and its needs, allowing the address and network settings provision process to begin.

So, **Discover** is simply the client's request to receive IP and other settings. The server doesn't distribute anything yet, it only receives information about who connected and what exactly this device needs.

* * *

![10_offer](/handson/images/dhcp_net/10_offer.png)

When the DHCP server receives Discover from the client, it responds with **DHCP Offer** — the second step of the DORA process. The server offers the client a specific IP address and necessary network parameters. The packet is sent unicast so the selected client receives the offer directly, and other servers understand that the address is taken.

**Data Link Layer (Ethernet II):** At this level, the packet is addressed directly to the client's MAC address (`0e:2a:b0:14:00:00`). The source is the server's MAC address (`0c:63:76:e4:00:00`). Unlike Discover, this is not a broadcast but unicast, so the server can directly tell the client which IP it's offering.

**Network Layer (IP):** The packet source is the DHCP server's IP (192.168.10.1), and the destination is the IP the server is offering to the client (192.168.10.100). At this level, the server "offers" the client an address that it can use once it confirms the selection.

**Transport Layer (UDP):** The server uses port 67 as the source, and the client receives on port 68. UDP allows quick packet transmission without establishing a connection and guarantees that the client will receive the server's offer.

**Application Layer (DHCP):** Message type — Offer, Transaction ID matches Discover so the client can match the response with the sent request. The main field — Your (Client) IP address — contains the offered address (192.168.10.100). DHCP options include Server Identifier (192.168.10.1), IP Address Lease Time, Subnet Mask, Router, DNS, and Domain Name. These parameters allow the client to know what network settings it will receive when accepting the address.

**Summary:** DHCP Offer is a specific offer from the server to the client with IP and network parameters. At this stage, the client can accept the offer and move to the next step — DHCP Request, to finally secure the address.

* * *

![11_request](/handson/images/dhcp_net/11_request.png)

After the client receives an offer from the server (**Offer**), it sends **DHCP Request** — the third step of the DORA process. In this packet, the client confirms its IP choice and notifies the network that it's going to use the offered address. The packet is sent broadcast so the selected server understands that its offer is accepted, and other DHCP servers can free their offers.

**Data Link Layer (Ethernet II):** The packet is addressed to all network devices (`ff:ff:ff:ff:ff:ff`), which allows the selected server to see the confirmation, and other servers to understand that their offers are rejected and addresses can return to the pool. The source is the client's MAC address (`0e:2a:b0:14:00:00`), the unique identifier of its network interface.

**Network Layer (IP):** The packet source is `0.0.0.0`, as the client hasn't yet received a finally assigned IP. The destination is `255.255.255.255` to deliver the packet to all devices on the local network. This broadcast ensures that the packet reaches the selected server and all other servers, if any exist on the network.

**Transport Layer (UDP):** The client uses port 68 as the source, and the server listens on port 67 as the destination. UDP allows quick packet transmission without establishing a connection, ensuring message delivery to all DHCP servers on the network.

**Application Layer (DHCP):** Message type — Request, Transaction ID matches Discover and Offer, linking the entire DORA transaction. IP fields are still empty, as the address lease is not finally confirmed. DHCP options include Message Type = Request, Server Identifier = 192.168.10.1, Requested IP = 192.168.10.100, Client Identifier = client's MAC, Host Name = MSEDGEWIN10, Vendor class = MSFT 5.0, and Parameter Request List with subnet mask, gateway, DNS, and other parameters for the final ACK.

**Summary:** DHCP Request notifies the network about accepting the server's offer. The client is ready to receive final confirmation, after which the IP and network settings will become valid, which will happen at the next step — DHCP Acknowledgment.

* * *

![12_ack](/handson/images/dhcp_net/12_ack.png)

After the client sends **Request**, the server confirms the final selection of IP address and network parameters using **DHCP ACK** — the fourth and final step of the DORA process. This packet officially assigns the client the IP and all network settings, after which the device can begin full-fledged work on the local network.

**Data Link Layer (Ethernet II):** At this level, the packet is sent directly to the client (unicast) to MAC address `0e:2a:b0:14:00:00`. The source is the DHCP server's MAC address (`0c:63:76:e4:00:00`). Unicast is used to accurately deliver confirmation of the selected address to a specific device and exclude unnecessary broadcasting.

**Network Layer (IP):** The packet source is the DHCP server's IP (192.168.10.1), and the destination is the IP now officially assigned to the client (192.168.10.100). At this level, the packet is already addressed directly to the assigned IP, which differs from previous steps where the client's IP was not yet known.

**Transport Layer (UDP):** The server uses port 67 as the source, and the client receives on port 68. UDP ensures fast delivery without establishing a connection and guarantees that the client receives all network parameters for correct operation.

**Application Layer (DHCP):** Message type — ACK, Transaction ID matches previous Discover, Offer, and Request packets, linking the entire DORA transaction. The Your (Client) IP address field contains the assigned IP (192.168.10.100). DHCP options include final parameters: Subnet Mask (255.255.255.0), Router (192.168.10.1), DNS server (8.8.8.8), IP Address Lease Time (1 day), Server Identifier (192.168.10.1), and end of list (Option 255). The client applies these settings to its network interface, after which it can fully work on the network, including access to external resources through the specified gateway and using DNS for domain name resolution.

**Summary:** DHCP ACK completes the DORA process, officially assigning the client an IP address and network parameters. After receiving this packet, the device is ready to work on the local network with correct configuration and the ability to access other networks.

* * *

![13_mikrotik](/handson/images/dhcp_net/13_mikrotik_lease_print.png)

The `ip dhcp-server lease print` command on MikroTik shows which IP addresses the DHCP server has currently issued to devices on the network. In our case, the dhcp1 server distributed addresses to three devices: Windows, Ubuntu, and VPCS.

The table shows that each device is assigned a unique IP from the pool, its MAC address and host name are indicated. The bound status means the lease is active — that is, the device is currently using this IP and can fully work on the network. For example, Windows received 192.168.10.100, Ubuntu — 192.168.10.99, and VPCS — 192.168.10.98.

The DHCP server successfully performed its work: all three devices automatically received IP, subnet mask, gateway, and other necessary network parameters. They can now exchange data on the local network and in the future use the gateway to access other subnets or the internet.

* * *

### 4. Analysis of Additional DHCP Messages

#### Release

![14_release_win](/handson/images/dhcp_net/14_release_win.png)

* * *

![15_release_wireshark](/handson/images/dhcp_net/15_release_wireshark.png)

* * *

When the `ipconfig /release` command is executed on a Windows client computer, the device tells the DHCP server that it no longer needs the leased IP address. In our example, the client sends **DHCP Release** to server 192.168.10.1, freeing address 192.168.10.100. This means the server can return this IP back to the pool of free addresses so other devices can use it.

On the client, after executing the command, the IPv4 address disappears, gateway and DNS server are no longer assigned. The client cannot exchange data beyond the local network until it receives an address through DHCP again. IPv6 addresses remain, as the command only affects IPv4.

The Release network packet is sent **unicast** directly to the server (not broadcast). The source is the client's old IP (192.168.10.100), and the destination is the server's IP (192.168.10.1). The packet specifies the message type (Release), client identifier (MAC), and server identifier so DHCP knows exactly which lease to terminate.

On the MikroTik server, after receiving this packet, the lease record for the client is immediately updated: the address returns to the available pool, and the lease status changes from `bound` to `released` (or the record is deleted from the active leases list).

Simply put, **DHCP Release** is the client's way to correctly "return" the IP to the server, ending the use of the address. Thus, the address is no longer occupied, and the server can issue it to another device.

* * *

#### NAK

![16_nak_wireshark](/handson/images/dhcp_net/16_nak_wireshark.png)

After the Windows client freed IP address 192.168.10.100 using the **ipconfig /release** command, the server returned this address to the free pool. Later, the DHCP pool was changed with the command `/ip pool set dhcp_pool ranges=192.168.10.10-192.168.10.99` and now includes only addresses **192.168.10.10–192.168.10.99**. When Windows tried to obtain IP 192.168.10.100 again, the server responded with a negative acknowledgment — **DHCP NAK**. This message tells the client that the requested address is invalid and cannot be used.

DHCP NAK is broadcast to guarantee that the client receives the notification. In the message, the server indicates which IP cannot be used and its identifier so the client clearly understands this is the response from the needed server. Upon receiving NAK, the client immediately stops using the old IP and starts the process of obtaining a new address from scratch: first sends Discover, then receives Offer, confirms with Request, and receives ACK with a new IP. In our case, Windows received address **192.168.10.97**, which is included in the current pool.

The reasons why a server might send NAK are varied. The most common is that the client requested an address that is no longer in the pool or is already occupied by another device. NAK can also occur if the client tries to renew the lease of an old IP that the server no longer recognizes, or if it specified the wrong server for lease renewal. Overall, DHCP NAK is a protection mechanism that prevents IP address conflicts and guarantees that devices use only valid addresses from the current pool.

* * *

#### INFORM

After a device has already received an IP address and other settings through DHCP, sometimes there's a need to request only additional network parameters from the DHCP server without changing the IP. The DHCP INFORM message is used for this. The client sends it to the server to receive, for example, current DNS servers, domain name, or other options that may change on the network without affecting its current IP.

The INFORM message is sent from the IP address already assigned to the device, and the server responds with a regular DHCP ACK containing the requested parameters. This is useful if DNS settings, gateways, or other service parameters have been updated on the network, and the client needs to receive them without requesting a new IP.

Unlike Discover, Request, or Release, INFORM doesn't participate in IP address assignment but only serves to obtain information. Commands on Windows: `ipconfig /renew`, on Linux: `dhclient -1 -v -s 192.168.10.1>`

* * *

#### Decline

The **DHCP DECLINE** message is used by the client when it discovers that the IP address offered by the DHCP server is already occupied by another device. For example, the client received an Offer with address 192.168.10.50, but an ARP check showed that this address is already being used by another host. In this case, the client cannot safely use the IP and sends a DECLINE message to the server to notify about the conflict.

After receiving DECLINE, the server marks this address as unavailable and no longer issues it to other clients until the administrator or server resolves the conflict issue. Thus, DHCP DECLINE prevents IP address conflicts on the network and ensures correct operation of all devices.

It's important to note that with DECLINE, the client **doesn't lose its current working IP** if it's already using some other address. This is purely a protective mechanism for handling offers from the server that could potentially cause a conflict.

Usage example: Windows and Linux automatically send DECLINE if they detect an IP match on the network through ARP when checking an Offer.

* * *

### 5. Static IP Binding

![17_fixed_ip](/handson/images/dhcp_net/17_fixed_ip_ubuntu.png)

* * *

![18_fixed_ip_ubuntu_wireshark](/handson/images/dhcp_net/18_fixed_ip_ubuntu_wireshark.png)

* * *

![19_fixed_ip_mikrotik](/handson/images/dhcp_net/19_fixed_ip_mikrotik.png)

In DHCP, there's a capability to **assign a specific IP address to a particular device** using its MAC address. This mechanism is called **Static Lease** and allows guaranteeing that the selected client will always receive the same address, regardless of the dynamic pool.

In practice, this is done as follows: the administrator on MikroTik manually creates a record where they specify the IP address, client's MAC address, DHCP server name, and a comment for convenience. In our case, the Ubuntu virtual machine with MAC `0c:a2:21:ee:00:00` was assigned static IP `192.168.10.105`. The configuration command looks as follows: `/ip dhcp-server lease add address=192.168.10.105 mac-address=0c:a2:21:ee:00:00 comment="Ubuntu fixed IP" server=dhcp1`

After applying this setting, the DHCP server will never issue this IP to another device. If the client with the specified MAC tries to use a different address from the pool, the server will send NAK, and the client will be forced to request a new configuration. In our example, Ubuntu first received a refusal, and then, through the standard DORA process, correctly received its assigned address 192.168.10.105.

* * *

### 6. Configuring DHCP on Ubuntu

![20_topology2](/handson/images/dhcp_net/20_topology_2.png)

* * *

![21_disable_dhcp](/handson/images/dhcp_net/21_disable_dhcp_mikrotik.png)

We're moving the DHCP server from MikroTik to Ubuntu. Previously, addresses were distributed by MikroTik with IP 192.168.10.1, now it will be a dedicated Ubuntu server. First, we disable DHCP on MikroTik so clients no longer receive IPs from it.

* * *

![22_isc_dhcp_server](/handson/images/dhcp_net/22_isc_dhcp_server.png)

First, you need to make sure the package itself is installed. If not, install it with the command: `sudo apt install isc-dhcp-server`. After installation, you need to tell the server which network interface to listen for client requests on. This is done in the `/etc/default/isc-dhcp-server` file. Open it and edit the line: `INTERFACESv4="ens3"`. **ens3** is the name of my network interface, yours may be different.

* * *

![23_dhcpd](/handson/images/dhcp_net/23_dhcpd.png)

Next, we go to the main configuration file `/etc/dhcp/dhcpd.conf`. There we set network parameters: pool of issued addresses, gateway, DNS, and lease time.
So now the server knows which addresses to distribute to whom, through which gateway, which DNS to provide, and for how long to issue the lease.

* * *

![24_restart_isc](/handson/images/dhcp_net/24_restart_isc_dhcp.png)

We assign the server a static IP **192.168.10.2/24**. Now Ubuntu Server is ready to issue IP addresses to clients. Start the service with the command `sudo systemctl start isc-dhcp-server`. To check the status: `sudo systemctl status isc-dhcp-server`

* * *

![25_requested_ip](/handson/images/dhcp_net/25_requested_ip_win.png)

* * *

![26_requested_ip_ubuntu](/handson/images/dhcp_net/26_requested_ip_ubuntu.png)

When clients start communicating with the new server, here's what happens: Windows tried to take its old address 192.168.10.97 — the server confirmed it because the address was free in the new pool. But the Ubuntu client, which previously had static address 192.168.10.105 on MikroTik, can no longer obtain it, as the address is not included in the new range. The server ignores this request, and the client sends Discover again, receives Offer, makes Request, and ultimately receives a new address from the pool — 192.168.10.12.

* * *

![27_ubuntuserver_print](/handson/images/dhcp_net/27_ubuntuserver_print.png)

In the end, checking the lease table shows: Windows kept its old address, Ubuntu received a new one, and vpc also received its IP from the new range.

* * *

### 7. Configuring DHCP Relay

![28_topology_3](/handson/images/dhcp_net/28_topology_3.png)

Our network now has two subnets: the old 192.168.10.0/24 and the new 172.16.10.0/24. The DHCP server (Ubuntu Server, 192.168.10.2) currently only knows the pool for the first subnet. That is, if clients from the new subnet (PC2, PC3) send DHCP Discover, the server simply doesn't see them — broadcast packets don't cross the router.

To fix this, we use MikroTik as DHCP Relay and configure routing.

* * *

#### 1. Configuring Routing on MikroTik

![29_route_mikroik](/handson/images/dhcp_net/29_route_mikrotik.png)

On interface ether2, which faces the new subnet 172.16.10.0/24, we assign IP address 172.16.10.1/24. Now the router knows that packets destined for this subnet go through ether2 and can correctly route traffic between networks. Routing is also needed for the return path: when the DHCP server responds, the packet should get back to 172.16.10.0/24.

* * *

#### 2. Configuring DHCP Relay on MikroTik

![30_dhcp_relay](/handson/images/dhcp_net/30_dhcp_relay.png)

DHCP Relay is a mechanism that allows clients from one subnet to contact a server in another subnet, even if the server is not in the same broadcast domain. Relay "listens" for DHCP packets on the client network interface and forwards them to the server as regular unicast packets.

On MikroTik it looks like this:

`/ip dhcp-relay add name=relay1 interface=ether2 dhcp-server=192.168.10.2 local-address=172.16.10.1
/ip dhcp-relay enable relay1`

- `interface=ether2` — the interface where the new subnet and clients whose packets need to be intercepted are located.
- `dhcp-server=192.168.10.2` — the server's IP to which requests will be forwarded.
- `local-address=172.16.10.1` — MikroTik's IP in the client subnet, which will be indicated as the source of responses for the client. Without local-address, Offer/ACK packets returned by the server may not reach the client because the client doesn't know how to route them through another subnet.
- `enable relay1` — activates the previously created relay named relay1.

* * *

![31_cant_find](/handson/images/dhcp_net/31_cant_find_pc2.png)

* * *

![32_add_subnet](/handson/images/dhcp_net/32_add_subnet.png)

While the server only knows network 192.168.10.0/24, Relay will "deliver" Discover to the server, but the server won't be able to issue an address, and the client will remain without an IP. Therefore, before starting Relay, you need to add the new subnet to the DHCP server configuration (/etc/dhcp/dhcpd.conf):

* * *

![33_pc2_pc3](/handson/images/dhcp_net/33_pc2_pc3.png)

* * *

![34_offer_pc2](/handson/images/dhcp_net/34_offer_pc2.png)

PC1 and PC2 received addresses. Let's analyze DHCP Offer for client PC2. The Ubuntu server itself wants to issue the client an address from its pool in the first subnet, but the client is located in the second subnet 172.16.10.0/24. The packet reaches the client through MikroTik, which acts as DHCP Relay. The router substitutes its local IP 172.16.10.1 as the source so the packet correctly reaches the client, who has no direct route to the server. The packet destination is IP 172.16.10.10, which the server is offering to the client. The Next Server IP Address field remains 192.168.10.2, showing that the real DHCP server is located in the first subnet. That is, the packet visually goes "from" MikroTik, but in fact it's an offer from the Ubuntu server, and this mechanism allows a client in an isolated subnet to receive an IP address and network parameters.

* * *

#### 3. How Packets Pass Through Relay (Step-by-Step Breakdown)

* **Step 1: Discover from Client (PC2/PC3)**  
    The client from subnet 172.16.10.0/24 sends DHCP Discover broadcast (`ff:ff:ff:ff:ff:ff`). It's looking for any DHCP server. But since the server is in a different subnet, the packet won't reach directly.

* **Step 2: Packet Interception by MikroTik**  
    DHCP Relay on MikroTik "catches" this Discover on ether2. Relay reads the packet and substitutes a new destination IP address — the DHCP server's IP (192.168.10.2). The packet is now sent as unicast from MikroTik to the server.

* **Step 3: Server Receives Discover**  
    The Ubuntu DHCP server receives the packet. Currently the server only knows the pool for 192.168.10.0/24, so it cannot issue an address for 172.16.10.0/24. Relay can optionally add option 82 (Agent Information) so the server understands which subnet the client came from and which pool to use.

* **Step 4: Offer from Server**  
    The server forms DHCP Offer for the client. If the pool for 172.16.10.0/24 is already added, the server selects a free IP from this pool and sends the packet back to the IP from which Discover came (MikroTik).

* **Step 5: MikroTik Delivers Offer to Client**  
    When the packet returns to MikroTik, it changes the source IP address to its interface in the client subnet (172.16.10.1) so the client can receive the response, and forwards the Offer to the client.

* **Step 6: Request and ACK**  
    The client responds with DHCP Request, the server confirms with DHCP ACK — the entire DORA process completely passes through Relay. The client receives IP address, gateway, and DNS, as if the server is in its subnet.
