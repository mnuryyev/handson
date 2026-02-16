---
title: "ARP Protocol Vulnerability and MITM Attack Implementation"
description: "In this work, we'll examine how ARP works: from request exchange and traffic analysis in Wireshark to practical implementation of a MITM attack with data interception"
image: "/images/arp_spoofing_sec/main.jpg"
date: "February 12, 2026"
---
**ARP Spoofing** is a **Man-in-the-Middle** type attack based on the peculiarities of the ARP protocol, which lacks authentication mechanisms. The essence of the attack is that an attacker broadcasts fake ARP responses and thereby substitutes the correspondence between IP and MAC addresses in the local network. As a result, the target device starts to consider the attacking machine, for example, as its default gateway, causing all network traffic to go through the attacker's computer. This makes it possible to intercept, analyze, and if necessary, modify transmitted data.

Within this work, we'll examine this vulnerability from both theoretical and practical perspectives. We'll deploy an isolated laboratory environment based on **Kali Linux** and **Windows 10**, in which we'll step-by-step reproduce the **ARP Spoofing** attack. During the experiment, we'll demonstrate interception of unencrypted HTTP traffic using **Wireshark**.

## Phase 1. Reconnaissance and Capturing Network Baseline State

Before starting the attack, it's necessary to conduct network reconnaissance and capture its initial state. This allows us to precisely determine the parameters of target nodes and later clearly show what changes occurred as a result of ARP Spoofing. First of all, we're interested in the IP addresses of interaction participants and the current state of ARP tables, since exactly these will be changed during the attack.

### Step 1. Determining Target Node Parameters

For the experiment, we deployed a virtual laboratory environment in which Windows 10 operating system is used as the victim, and Kali Linux as the attacking side. Both virtual machines are connected in Bridge mode, which allows them to be in one broadcast domain and directly interact with each other and with the router. The approximate topology looks like this:

![01_topology](/images/arp_spoofing_sec/01_topology.png)

First, on the victim's side, network settings were checked to determine the system's IP address and the main gateway address. This data is necessary for conducting the MITM attack, since all external traffic from the Windows machine goes exactly through the gateway. During the check, it was established that the victim's IP address is *192.168.70.11*, and the default gateway is *192.168.70.1*.

![02_ipconfig](/images/arp_spoofing_sec/02_ipconfig.png)

### Step 2. Analyzing the Initial ARP Table

After this, the initial ARP table on the Windows side was captured. This stage is necessary to preserve the correct system state before starting the attack and have the ability to compare it with results after ARP cache poisoning. Using the **arp -a** command, the current correspondence between the gateway's IP address and its MAC address was obtained:

![03_arp_a_win](/images/arp_spoofing_sec/03_arp_a_win.png)

From the output we see that the default gateway is linked with the correct router MAC address, and the entry type is designated as dynamic. This means the entry was obtained automatically and can be changed when receiving new ARP responses, which creates conditions for conducting ARP Spoofing. The captured ARP table is used later as a checkpoint.

### Step 3. Checking Network Interface on the Attacker's Side

![04_kali_ip_a](/images/arp_spoofing_sec/04_kali_ip_a.png)

On Kali we open the terminal and enter the command ip a. In the output we see that the active network interface is eth0, and the system's IP address is *192.168.70.12*. This means Kali is in the same network as the victim.

### Step 4. Checking Target Availability

On Kali Linux we check the target machine's availability. In the terminal we execute the ping command, specifying the Windows system's IP address *192.168.70.11*.

![05_ping_from_kali](/images/arp_spoofing_sec/05_ping_from_kali.png)

From the results we see that responses from the target node arrive without losses, and the delay is minimal. This confirms a stable network connection between the attacking machine and the victim and allows moving on to the next research stages.

### Step 5. Network Scanning

To get an overall picture of the network, we use the netdiscover utility. In Kali Linux it's usually already installed by default or appears after system update and standard package upgrade. If the utility is missing, we install it through the package manager (**sudo apt install netdiscover -y**).

Next, we start scanning the local network. We specify the used network interface (eth0) and the network range *192.168.70.0/24*. Scanning allows determining active devices in the segment and obtaining their IP and MAC addresses.

![06_netdiscover_start](/images/arp_spoofing_sec/06_netdiscover_start.png)

![07_scan_finish](/images/arp_spoofing_sec/07_scan_finish.png)


After a few seconds, a list of discovered nodes appears in the output. In it we find:

- Router's IP address and MAC address;
- Windows machine's IP address and MAC address.

After obtaining the necessary information, we stop the scan with the key combination **Ctrl + C**.

Such a stage is used for realistic attack modeling, since in real conditions, before conducting ARP Spoofing, network mapping and determination of all potential targets is first performed.

* * *

## Phase 2. Attacking Machine Configuration

### Step 6. Enabling IP Forwarding

By default, Linux family operating systems drop packets not addressed to them. If we launch the attack in such a state, the Windows machine will lose connection with the router and internet access will be interrupted, which will instantly unmask our intervention.

To remain undetected, we must force Kali Linux to work in router mode, that is, accept foreign traffic and immediately forward it to its destination. For this, the **IP Forwarding** function is activated in the Linux kernel.

We perform verification and activation through the system variable net.ipv4.ip_forward:

![08_forwarding](/images/arp_spoofing_sec/08_forwarding.png)

### Step 7. Installing dsniff

For implementing the attack, we need specific utilities capable of forming and sending arbitrary ARP packets to the network. In the Kali environment, there's a **dsniff** package for these purposes.

The main component we're interested in this set is the **arpspoof** utility. Its task is to automate the process of sending fake ARP responses. Instead of manually forming each frame, we delegate this to the program, and it will periodically broadcast our MAC address to the target, maintaining substituted entries in the ARP table. Installation check:

![09_dsniff](/images/arp_spoofing_sec/09_dsniff.png)

ARP cache is not static and updates over time, meaning the router periodically reminds of its real MAC address. arpspoof solves this problem by constantly broadcasting fake ARP responses and not allowing these entries to restore, keeping traffic under our control.

* * *

## Phase 3. Launching the Attack

After completing preparations, we move on to the active phase, establishing control over the communication channel between the victim and the gateway. To implement a full-fledged MITM attack, we need to organize data interception in both directions. For this, we'll use two parallel **arpspoof** processes.

### Step 8. Launching Bidirectional ARP Spoofing

We open two terminal windows in Kali Linux and place them side by side. This allows simultaneously controlling the ARP substitution process both from the victim's side and from the router's side.

![10_attackingpng](/images/arp_spoofing_sec/10_attackingpng.png)

**Terminal 1**. We launch the attack on the Windows machine. We specify the network interface (eth0), the victim's IP address (192.168.70.11), and the gateway address (192.168.70.1), on whose behalf we'll act.

After launch, the utility starts broadcasting fake ARP responses. Actually, we're substituting the ARP correspondence on the victim's side, linking the router's IP address with Kali Linux's MAC address. Windows accepts the received ARP responses and updates its ARP cache, after which all outgoing traffic starts being directed through the attacking machine.

**Terminal 2**. Deceiving the router. To intercept not only outgoing but also incoming packets from the external network, we set up a similar process in the second terminal, but now we choose the router itself as the target.

In this command, we inform the router that the Windows machine's MAC address now corresponds to our interface. Thus, we close the loop, meaning the router sends responses from the internet to us, and we, thanks to the previously enabled **IP Forwarding**, transparently forward them to the real recipient.

The presence of a continuous flow of ARP responses in both terminals confirms that the attack is active. Now we occupy the Man-in-the-Middle position and are ready to analyze traffic passing through us.

* * *

## Phase 4: Attack Confirmation and Data Analysis

After launching the active phase, we need to make sure that address substitution actually occurred and the target system accepted our fake data.

### Step 9. Checking Changes in Victim's ARP Table

To verify the result, we switch to the Windows machine. In the command line we re-enter the **arp -a** command to view the current state of the ARP cache after the attack started.

![11_arp_a_win](/images/arp_spoofing_sec/11_arp_a_win.png)

When analyzing the output, we capture a critical moment: the router's IP address (192.168.70.1) and our attacking Kali machine's IP address (192.168.70.12) now have absolutely the **same physical address**.

State comparison:

- Before the attack: The gateway was linked with the real router MAC address (90-f6-52-a9-e3-ac).
- After the attack: The gateway is bound to our system's MAC address (00-0c-29-07-84-66).

The Windows system no longer sees the real router directly, for it all packets going to the external network must now be sent to our MAC address.

### Step 10. Configuring Filtering and Generating Traffic

We check that traffic is going through our system, and immediately configure Wireshark filters to see only the needed packets.

In the upper part of the Wireshark window, in the Filter field, we set display parameters. We need to see only HTTP requests coming from our victim or directed to it. We enter the following construction: **ip.addr == 192.168.70.11 && http**

![12_wireshark_kali](/images/arp_spoofing_sec/12_wireshark_kali.png)

To check the interception, we go to the Windows machine's side and open any browser. Most modern sites use HTTPS, because of which packet contents are encrypted and unavailable for viewing. To see HTTP traffic in plain form, we use the site http://neverssl.com, which works without encryption.

![13_neverssl](/images/arp_spoofing_sec/13_neverssl.png)

### Step 11. Analyzing Intercepted Data

After the victim visited the site, a list of intercepted HTTP packets appeared in the Wireshark window on Kali Linux. Now we can study the contents of any of them in detail to understand what information an attacker can obtain.

![14_wireshark_http](/images/arp_spoofing_sec/14_wireshark_http.png)

![15_analyzing](/images/arp_spoofing_sec/15_analyzing.png)

For analysis, we select any packet with the **GET / HTTP/1.1** method. In the lower part of the Wireshark window we expand the Hypertext Transfer Protocol section and look at the application layer contents. Exactly this data in a normal situation should be visible only to the client and web server.

As a result of analysis, we can see the following information:

- Host - the target resource is determined, in this case neverssl.com.
- User-Agent - information about the victim's system is displayed, including operating system version (Windows 10) and the used browser.
- HTTP headers - information about system language, caching parameters, and content types that the browser accepts is available.

Since traffic is transmitted without encryption, all this data is displayed in plain form. In a real scenario, in their place could be session cookies, allowing access to an account without password entry, or the logins and passwords themselves when working with HTTP authorization forms. The ARP Spoofing attack gives complete control over unencrypted network traffic and represents a serious security threat.

### Step 12. Demonstrating Credential Interception

To assess the real risks of the attack, we'll conduct an experiment on intercepting user-entered data. In modern conditions, most sites use encryption, so for the purity of the experiment we'll create a local test form imitating an authorization page.

![16_test_html](/images/arp_spoofing_sec/16_test_html.png)

On the Windows side, we create a simple HTML file with an input form. The main feature of this form is the use of the **POST** method and sending data via the unprotected HTTP protocol to the test service httpbin.org.

### Step 13. Filter in Wireshark

On Kali, we'll change the filter in Wireshark to **http.request.method == "POST"** to quickly find the packet with form data.

![17_start_wireshark](/images/arp_spoofing_sec/17_start_wireshark.png)

### Step 14. Sending Test Credentials

On the Windows side, we fill in the created form. In the login field we entered *testuser*, and in the password field *test123*. After clicking the *Login* button, the data was sent to the network.

![18_test_win](/images/arp_spoofing_sec/18_test_win.png)

### Step 15. Analyzing POST Request in Wireshark

We returned to Kali Linux and among the intercepted traffic found a packet sent by the **POST** method. Unlike a regular GET request, this packet contains a message body, in which user-entered data is transmitted.

![19_wireshark_result](/images/arp_spoofing_sec/19_wireshark_result.png)

Clicking on the packet and expanding the **HTML Form URL Encoded** section, we got full access to the form contents.

* * *

## Phase 5. Stopping the Attack and Network Restoration

### Step 16. Restoring Legitimate ARP Entries

First of all, we stop the work of arpspoof in both Kali Linux terminals using the Ctrl + C key combination.

This is important because with correct stopping, the utility automatically sends so-called re-arping ARP packets. The victim is transmitted the real router MAC address, and the router the real Windows machine MAC address.

### Step 17. Disabling IP Forwarding

After the network tables are restored, we need to return our system to standard state. We disable the packet forwarding function so Kali again stops working as a router.

![20_restore](/images/arp_spoofing_sec/20_restore.png)

Leaving IP Forwarding enabled on a working machine is unsafe and impractical. Now our system again ignores packets not addressed to it.

## How to Protect

Protection from ARP Spoofing works only in networks without basic security. Main methods: 
- use static ARP entries, rigidly binding the gateway's IP address to its MAC address;
- enable Dynamic ARP Inspection on managed switches to block fake ARP packets; apply HTTPS and VPN for traffic encryption so the MITM attacker doesn't see data contents;
- configure Port Security to limit the number of MAC addresses on a port;
- segment the network using VLANs so ARP requests don't go beyond their segment.
