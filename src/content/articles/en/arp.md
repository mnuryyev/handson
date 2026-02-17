---
title: "ARP Protocol and Data Exchange in Local Networks"
description: "In this work, we'll take a detailed look at how ARP works, from the principles of ARP request and response exchange, through network traffic analysis using Wireshark"
image: "/images/arp_net/arp.jpg"
date: "February 9, 2026"
---
**ARP (Address Resolution Protocol)** is a protocol that helps devices in a local network find each other.

Usually we work with IP addresses or domain names (which get converted to IP through DNS). But inside a local network, data is transmitted not by IP, but by MAC addresses. Switches only see MAC addresses and have no idea what IP is.

So before sending data, a device needs to find out: which MAC address corresponds to the needed IP. That's what ARP does.

It broadcasts a request on the network, gets a response from the needed device, and remembers the IP ↔ MAC correspondence. Thanks to this, devices can exchange data normally, even if the physical address of the recipient was unknown beforehand.


### 1. Build the Topology

![01_topology](/handson/images/arp_net/01_topology.png)

For the lab setup in GNS3, we'll create a simple network with a Cisco router, a switch, and two virtual machines. The router will have a FastEthernet0/0 interface configured with address *192.168.1.1/24*, which will act as the gateway for all network devices. The switch connects all nodes in one subnet, providing data transmission at the data link layer.

* * *

### 2. Configuring IP Addresses on the Router and Client PCs

![02_set_router](/handson/images/arp_net/02_set_router.png)

Let's move on to configuring the Cisco router. First, we select the needed interface, in my case FastEthernet0/0, and assign it an IP address and subnet mask. For the interface in our network, we assign *192.168.1.1/24*. After that, the interface needs to be activated with the **no shutdown** command so it starts working and passing traffic. Now the router is ready to exchange data with devices in the local network.

* * *

![03_set_windows](/handson/images/arp_net/03_set_windows.png)

Now let's configure the IP address on the Windows 10 client machine. To do this, we open the network adapter settings, select the needed connection, and manually specify the IP address, subnet mask, and gateway. In our example, for Windows we set IP *192.168.1.10*, subnet mask *255.255.255.0*, and for the gateway we specify the router address - *192.168.1.1*. After saving the settings, the computer will be able to exchange data with other network devices and access the local subnet.

* * *

![04_set_route](/handson/images/arp_net/04_set_route.png)

On Linux, we'll configure the IP address manually through the terminal. In our case, the network interface is called **enp2s0**. To assign a static IP, we use the command **sudo ip addr add 192.168.1.11/24 dev enp2s0**. Next, we need to specify the default gateway through which the device will access the network **sudo ip route add default via 192.168.1.1**. After these actions, the enp2s0 interface gets IP address *192.168.1.11* with subnet mask *255.255.255.0*, and the router *192.168.1.1* acts as the gateway. Now the Ubuntu machine can correctly exchange data with other network devices and interact with the router.

* * *

### 3. Breakdown of Standard ARP Message Exchange

![05_empty_arp](/handson/images/arp_net/05_empty_arp.png)

Let's move on to capturing network traffic using Wireshark. For convenience, we filter packets by ARP protocol to see only ARP messages. At the start of the capture, the ARP tables on both hosts are empty, so all requests and responses will be recorded from scratch.

* * *

![06_arp_d_win](/handson/images/arp_net/06_arp_d_win.png)

Before starting the experiment, we'll clear the ARP cache on both hosts so that all entries are created anew and we can observe the process in real time.

On Windows, this is done through the command line with the **arp -d** command. This command removes all existing ARP entries. Then you can check the table status with **arp -a**.

Initially the table is empty, but after running the ping command to another host, new entries will appear, reflecting the recently resolved MAC addresses

* * *

![07_arp_d_linux](/handson/images/arp_net/07_arp_d_linux.png)

On Linux, clearing the ARP cache is done with the command **sudo ip neigh flush all**. This command removes all current ARP entries for all interfaces, including enp2s0 in our case. After running it, the system forgets which MAC addresses correspond to which IPs, and all subsequent connections to other network devices will initiate new ARP requests.

To make sure the table is really empty, you can use **ip neigh show**. Initially the output will be empty since the entries are deleted. After the host tries to send data to another device, new entries will appear in the table, reflecting the just-resolved MAC addresses.

* * *

![08_ping](/handson/images/arp_net/08_ping.png)

We send ICMP requests to the Linux machine with IP address *192.168.1.11*, then proceed to analyze the network traffic in Wireshark.

* * *

![09_wireshark](/handson/images/arp_net/09_wireshark.png)

ARP request and ARP response entries appeared in Wireshark.

* * *

#### ARP Request

![10_arp_request](/handson/images/arp_net/10_arp_request.png)

When a device in a local network wants to send data to another device, it needs to know the recipient's MAC address. If there's no entry for this IP in the ARP cache, the system performs the following steps:

- **Step 1:** Checking the ARP cache. The computer first checks its ARP table. If an entry for the needed IP is missing, it needs to find out the MAC address of the device with that IP.

- **Step 2:** Forming the ARP request. The device creates an ARP packet that specifies:

    - Its own MAC and IP, so the recipient knows who's asking.
    - The target IP address - the address whose MAC needs to be found.
    - The target MAC address is left empty (00:00:00:00:00:00), since it's not known yet.

- **Step 3:**. Sending the request to all network devices (broadcast)
The packet is sent to address ff:ff:ff:ff:ff:ff, meaning to all computers in the local network, so the needed device will definitely receive it.

- **Step 4:**. Processing the request by other devices. Each computer checks if its IP matches the target: If it matches, the device forms an ARP response and sends it back to the sender. If it doesn't match, it ignores the packet.

- **Step 5**. Updating the ARP cache. After receiving the response, the sender saves the IP ↔ MAC correspondence in the ARP cache. Now subsequent data transmissions can be done directly, without a new request.

**ARP Request Fields**

| Field                  | Example Value       | Description                                                      |
|-----------------------|---------------------|---------------------------------------------------------------|
| **Hardware Type**      | Ethernet (1)         | Data link layer type (Ethernet).                             |
| **Protocol Type**      | IPv4 (0x0800)        | Upper layer protocol we're looking for the MAC for (IPv4).      |
| **Hardware Size**      | 6                    | MAC address length in bytes.                                   |
| **Protocol Size**      | 4                    | IP address length in bytes.                                    |
| **Opcode**             | Request (1)          | ARP message type: 1 — request.                               |
| **Sender MAC Address** | 0c:e5:1d:02:00:00   | MAC address of the request sender.                                |
| **Sender IP Address**  | 192.168.1.10         | IP address of the sender.                                        |
| **Target MAC Address** | 00:00:00:00:00:00    | MAC address of the target (not yet known).                             |
| **Target IP Address**  | 192.168.1.11         | IP address of the device whose MAC address needs to be found.        |

* * *

#### ARP Reply

![11_arp_reply](/handson/images/arp_net/11_arp_reply.png)

When a device receives an ARP request and finds that the IP in the request matches its own, it forms an ARP reply. This message tells the request sender which MAC address corresponds to the requested IP.

-   **Step 1:** Receiving the ARP request. The device receives the ARP request and checks if its IP matches the IP address in the request. If it matches, it prepares a response.
    
-   **Step 2:** Forming the ARP reply. The device creates an ARP packet that specifies:
    
    -   Its own MAC and IP — this is the address and IP of the device that's responding.
    -   The MAC and IP of the request sender — so the response reaches exactly them.
        
-   **Step 3:** Sending the response directly (unicast). The ARP Reply is sent to the MAC address of the request sender, not to broadcast. The packet goes only to the needed device.
    
-   **Step 4:** Updating the ARP cache at the recipient. The computer that sent the request receives the response and records the IP ↔ MAC correspondence in its ARP cache.
    
-   **Step 5:** Further data transmission. After recording in the cache, the device can send data directly, without needing a new ARP request.

**ARP Reply Fields**

| Field                  | Example Value       | Description                                                      |
|-----------------------|---------------------|---------------------------------------------------------------|
| **Hardware Type**      | Ethernet (1)         | Data link layer type (Ethernet).                             |
| **Protocol Type**      | IPv4 (0x0800)        | Upper layer protocol (IPv4).                              |
| **Hardware Size**      | 6                    | MAC address length in bytes.                                   |
| **Protocol Size**      | 4                    | IP address length in bytes.                                    |
| **Opcode**             | Reply (2)            | ARP message type: 2 — reply.                                 |
| **Sender MAC Address** | 0c:ef:f7:15:00:00   | MAC address of the device responding to the request.             |
| **Sender IP Address**  | 192.168.1.11         | IP address of the device that's responding.                        |
| **Target MAC Address** | 0c:e5:1d:02:00:00   | MAC address of the device the reply is intended for.           |
| **Target IP Address**  | 192.168.1.10         | IP address of the device the reply is intended for.            |


* * *

### Breakdown of Standard Gratuitous ARP (G-ARP) Exchange on the Network

![12_arping_linux_grad](/handson/images/arp_net/12_arping_linux_grad.png)

Gratuitous ARP is a special type of ARP message that a device sends about itself, without anyone making a request. In other words, a computer or server itself tells the network: "Here's my IP and MAC address". Such packets don't require a response from other devices — they're broadcast so that all computers and network equipment in the local network update their ARP caches.

The main purposes of using G-ARP are as follows:

1. Updating other devices' ARP caches. If the MAC address or IP changed on a device, sending G-ARP allows all network nodes to learn the current data.

2. Checking if an IP address is taken. A device can send G-ARP to make sure the given IP isn't being used by another device.

3. Informing the network when a device starts up. When a computer or server just powered on, G-ARP helps routers, switches, and other hosts quickly learn the correct MAC for its IP.

In Linux, sending G-ARP is easily done using the **arping** utility. The device sends an ARP Reply to the broadcast address, but doesn't wait for a response. This approach differs from a standard ARP request, when a computer looks for another host's MAC address and waits for a response.

For example, if Ubuntu sends a G-ARP for IP 192.168.1.11, it broadcasts a message on the network, announcing its MAC address. All devices in the local network that receive this packet update their ARP caches, even if they didn't request this address. Thanks to this, subsequent data transmissions can be done directly, without extra requests.

![13_g_arp](/handson/images/arp_net/13_g_arp.png)

**ARP Reply Fields**

| Field                  | Example Value       | Description                                                      |
|-----------------------|---------------------|---------------------------------------------------------------|
| **Hardware Type**      | Ethernet (1)         | Data link layer type (Ethernet).                             |
| **Protocol Type**      | IPv4 (0x0800)        | Upper layer protocol (IPv4).                              |
| **Hardware Size**      | 6                    | MAC address length in bytes.                                   |
| **Protocol Size**      | 4                    | IP address length in bytes.                                    |
| **Opcode**             | Reply (2)            | ARP message type: 2 — reply. In G-ARP, ARP Reply is used, but without a request. |
| **Sender MAC Address** | 0c:ef:f7:15:00:00   | MAC address of the device broadcasting information about itself.   |
| **Sender IP Address**  | 192.168.1.11         | IP address of the device broadcasting information about itself.    |
| **Target MAC Address** | ff:ff:ff:ff:ff:ff    | Broadcast MAC address, packet is sent to everyone on the network.  |
| **Target IP Address**  | 192.168.1.11         | IP address of the device about which information is being broadcast.       |


* * *

![14_arp_windows](/handson/images/arp_net/14_arp_windows.png)

After Ubuntu sent Gratuitous ARP (G-ARP) indicating its IP and MAC address, Windows received this packet and automatically updated its ARP cache.

* * * 

### 4. Dynamic and Static ARP

**Dynamic ARP** - these are entries that a device creates itself, automatically, when it needs to find out another device's MAC address by its IP. Such entries are added to the ARP table by themselves and after some time can be deleted if the address is no longer used.

In our work, an example of dynamic ARP was when Ubuntu sent Gratuitous ARP for its IP 192.168.1.11. Windows received this packet and automatically added the entry.

---

**Static ARP** - these are entries that are created manually and remain in the table until they're specifically deleted. They're useful for devices with which you always need stable contact, for example, servers, routers, or printers on the network.

For example, if we manually added an entry for Ubuntu on Windows: **arp -s 192.168.1.11 0c:ef:f7:15:00:00**. then this entry would become static. It won't disappear on its own and will always use this MAC for the specified IP, even if Ubuntu doesn't send packets or G-ARP.
