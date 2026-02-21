---
title: "Nmap: reconnaissance and scanning"
description: "In this work, we'll examine how Nmap works, from discovering active hosts and analyzing traffic in Wireshark to practical port and service scanning"
image: "/images/nmap_tools/nmap.png"
date: "February 21, 2026"
---
**Nmap** is a freely distributed open-source tool designed for analyzing network infrastructure and assessing its security. The utility is used both when working with individual nodes and when researching large network segments.

The tool is suitable both for checking one computer and for analyzing an entire address range. It allows not only viewing open ports, determining service versions and trying to understand what operating system is on the machine, but also, if necessary, running additional checks through built-in scripts. Thanks to these capabilities, Nmap is often used in pentesting - it helps safely check the network for weak points, see open services and identify potential vulnerabilities so they can be closed or security strengthened.

## Using Nmap

![01_nmap](/handson/images/nmap_tools/01_nmap.png)

When launching Nmap, we immediately specify what exactly we want to scan and with what parameters. Everything that doesn't relate to program options and keys, Nmap automatically considers a target. Therefore, you can list several addresses in a row, the utility will try to scan each of them.

As a target, you can specify a separate IP address, several addresses, a range, a subnet, or an entire network. It all depends on the task.

Another point is access rights. Many types of scanning require superuser rights. Without them, part of the functions won't work, or Nmap will switch to a simpler mode. In general, it's easier to immediately run through sudo so as not to hit limitations during work.

## TCP Flags and Their Significance for Scanning

To understand exactly how Nmap determines port states, you need to understand TCP flags a bit. Each TCP segment has control bits, exactly these set connection behavior. Nmap actively uses them, sending special flag combinations and analyzing the target's response. Thanks to this, you can determine the port state without even establishing a full connection.

| **Flag** | **Bit** | **Purpose** | **Role in Nmap** |
| --- | --- | --- | --- |
| SYN | 0x02 | Connection establishment request | Basic probe for SYN scanning |
| ACK | 0x10 | Data receipt acknowledgment | ACK scanning for firewall mapping |
| RST | 0x04 | Connection reset | Closed port response; Nmap sends RST after SYN/ACK |
| FIN | 0x01 | Connection termination | FIN/NULL/XMAS scans to bypass stateless firewall |
| PSH | 0x08 | Pass data to application immediately | Component of XMAS scanning |
| URG | 0x20 | Urgent data (urgent pointer) | Component of XMAS scanning |
| ECE | 0x40 | ECN-Echo (network congestion) | Used in OS fingerprint probes |
| CWR | 0x80 | Congestion Window Reduced | Analyzed during OS detection |

In practice, we most often encounter SYN, ACK, and RST. Exactly these form the basic understanding of open and closed ports. The remaining flags are used in more specific scanning techniques or when determining the operating system.

## Port States in Nmap's Interpretation

If it seems that a port can only be open or closed - that's logical, but in practice everything is a bit more complex. Because of how different protocols and network filters work, it's not always possible to unambiguously understand what's happening on the target's side. Therefore, Nmap identifies several port states. Understanding these statuses is important, otherwise scan results can easily be interpreted incorrectly.

| **State** | **What's Happening in the Network** | **Wireshark Filter** |
| --- | --- | --- |
| open | Target responds with SYN/ACK (TCP) or data (UDP) | tcp.flags.syn==1 && tcp.flags.ack==1 |
| closed | Target responds with RST/ACK — port unavailable, but host is alive | tcp.flags.reset==1 |
| filtered | Packet is dropped; no response or ICMP type 3 arrives | icmp.type==3 |
| unfiltered | ACK scan: port accessible, but open/closed unknown | tcp.flags.ack==1 |
| open|filtered | UDP or FIN scan: no response — unknown | (no packet) |
| closed|filtered | Only IP-IDLE scan: IP ID analysis | ip.id analysis |

When we start working with a new target, we know almost nothing about it. Our task is to collect primary information. That is, understand whether the host is alive, which ports respond and how they behave. Already at this stage, you can determine the further action plan.

Of course, there's no universal algorithm, everything depends on the task. But there are basic things you need to understand well: what port states mean, how Nmap reacts to them, and what's visible in traffic at that moment.

## Host Discovery

If you look at Nmap's help, first thing there is host discovery. Essentially, this is checking whether there's anyone at all at the specified addresses. Before scanning ports, you need to understand whether the device responds. Usually this is called ping scanning. But it's not just regular ping. Nmap can use different verification methods: ICMP, TCP, UDP or ARP requests. This is convenient because sometimes regular ping is disabled, but other types of requests go through.

If the host responds, Nmap by default will continue working and start scanning its ports. If you just need to find out which addresses are alive, without checking ports, this can be specified separately in the parameters.

## Nmap Options for Host Discovery

### -sL - list targets output

The **-sL** option is used when you just need to view the list of addresses that fall under the specified range. In this mode, Nmap doesn't scan anything and doesn't send packets, it only outputs IP addresses included in the specified network. If DNS names are configured for them, they'll also be shown. At the end, the total number of found addresses is displayed. If you specify a domain name, Nmap will show the corresponding IP and try to perform reverse DNS resolution.

### -sn - active host discovery

![02_ip](/handson/images/nmap_tools/02_ip.png)

![03_sn](/handson/images/nmap_tools/03_sn.png)

![04_sn_wireshark](/handson/images/nmap_tools/04_sn_wireshark.png)

The **-sn** option is used to understand which devices on the network respond at all. Ports are not scanned, we simply check who's alive.

The screenshot shows what address was assigned to the machine and what subnet it belongs to. Address 10.10.0.105/24, meaning we're in network 10.10.0.0/24.

In my case, Nmap showed 7 active devices on the network. Exactly these responded to the verification requests.

We look at Wireshark, what was happening at the moment of scanning. In the local network, Nmap usually uses ARP requests. Since this is a **/24** network, enumeration goes approximately from **.1** to **.254** (total 254 possible hosts). Each ARP request is an attempt to find out whether a device with such an IP exists. If the device exists, it responds with its MAC address. In Wireshark this is clearly visible - ARP requests scatter across the network, and only real hosts send responses. Exactly by these responses Nmap determines which devices are active.

### -Pn - skip host discovery

![05_windows](/handson/images/nmap_tools/05_windows.png)

![06_Pn](/handson/images/nmap_tools/06_Pn.png)

![07_Pn_wireshark](/handson/images/nmap_tools/07_Pn_wireshark.png)


The **-Pn** option disables the ping scanning stage. This means Nmap won't check whether the host is alive, but will immediately proceed to port scanning. Simply put, it considers the target active even if it doesn't respond to ping. This is useful in situations when ICMP or other discovery methods are blocked, and normal host determination doesn't work.

For the test, I added a Windows machine to the network, we'll use it as the target. First we look at its IP address. After that, we launch scanning directly on this IP.

Since **-Pn** is used, Nmap doesn't try to first determine host activity, but immediately starts checking ports. The screenshot shows the result, open ports on the Windows machine are displayed.

In Wireshark, you can notice that there's no ARP/ICMP verification stage before scanning (or it's minimal), and TCP packets immediately go to specific ports. Exactly this is the difference compared to normal launch without **-Pn**.

### -PS, -PA, -PU — alternative host discovery methods

These options are used at the host discovery stage when you need to check whether the device responds, but regular ping may be blocked. The difference between them is in the type of packet sent. -PS sends TCP SYN to the specified port, -PA — TCP ACK, and -PU — UDP packet (requires root rights for it). In the case of UDP, the target often responds with an ICMP message "port unreachable", and by this response Nmap understands that the host is active. If a response arrives, the host is alive, if there's complete silence, traffic is likely filtered or the device is unavailable.

Additionally, you can specify which ICMP requests to use: -PE (echo request), -PP (timestamp) and -PM (address mask). In practice, such requests are often blocked by the firewall, so in real conditions TCP methods (-PS, -PA) are more commonly used, which look more natural for the network.

### -PO - verification through IP protocols

![08_PO](/handson/images/nmap_tools/08_PO.png)

The **-PO** option is used for host discovery using IP protocols. In this mode, Nmap sends packets specifying a specific protocol number in the IP header and looks at how the target reacts. If a packet arrives by the same protocol in response, it means it's supported and the host is active. If an unreachability message returns, for example, ICMP with an error, this says that such a protocol is not used on the target or is blocked.

Simply put, **-PO** allows checking which IP protocols are alive on the host's side at all, without moving on to regular port scanning.

### -PR - ARP ping

![09_PR](/handson/images/nmap_tools/09_PR.png)

The **-PR** option enables ARP pinging and is used for discovering active hosts in the local network (requires root rights). In this mode, Nmap sends ARP requests and waits for responses with the MAC address. If the device responds, it means it's active.

Within one subnet, this is one of the most reliable and fast ways to determine live hosts, because ARP is almost never blocked. **-PR** is exactly responsible for device discovery. Service and port scanning begins after this stage, unless additionally disabled by other parameters.

### --traceroute - route tracing

![10_traceroute](/handson/images/nmap_tools/10_traceroute.png)

The **--traceroute** option allows determining the path to the target, that is, seeing through which nodes traffic passes from your machine to the specified host (in our case scanme.nmap.org). Simply put, this is built-in route tracing inside Nmap.

It's used together with any type of scanning. Nmap first performs the main scan, and then based on the received data builds a route to the target. Root rights are required for its operation.

* * *

## Scanning Techniques

### -sS - TCP SYN scanning

![11_sS](/handson/images/nmap_tools/11_sS.png)

**-sS** is the most popular type of scanning in Nmap. It's often called half-open, because the connection isn't completed. Nmap sends a SYN packet, as if it's going to establish a regular TCP connection, and then looks at the target's reaction.

If **SYN/ACK** arrives - the port is considered open.
If **RST** arrives - the port is closed.
If there's no response or an ICMP error returns - the port is likely filtered.

When Nmap receives **SYN/ACK**, it doesn't send the final **ACK**, but immediately sends **RST**, thereby breaking the connection. Therefore, a full session isn't created.

![12_port_445](/handson/images/nmap_tools/12_port_445.png)

For open port 445, the sequence looked like this. First my host sends **SYN**. Windows responds with **SYN/ACK**, this means the port is open and ready to accept a connection. After this, Nmap sends **RST** and immediately closes the connection attempt. Exactly this is why this type of scanning is considered less noticeable, the connection doesn't reach the data transmission stage.

![13_port_22](/handson/images/nmap_tools/13_port_22.png)

Next I checked port 22. In this case, it was blocked by the firewall. Neither **SYN/ACK** nor **RST** arrived. This means the packet is simply dropped. In such a case, Nmap marks the port as **filtered**, because it's impossible to precisely determine whether it's open or closed, filtering prevents getting a response.

### -sU - UDP scanning

![14_sU](/handson/images/nmap_tools/14_sU.png)

The **-sU** option is used to check ports on which UDP services are running. It can be launched separately or together with TCP scanning, for example, **-sS -sU**, if you need to check both TCP and UDP simultaneously.

It works like this. Nmap sends a UDP packet to the selected port and looks at the reaction. If an ICMP message "port unreachable" arrives in response, the port is closed. If another type of ICMP error arrives or there's no response at all, the port may be filtered. If the host responds with a UDP packet, the port is open.

Often with no response, Nmap assigns the status **open|filtered**, because it's impossible to precisely understand whether the port is open or packets are simply being dropped. In such cases, you can try to clarify the result using service version detection (-sV).

UDP scanning works noticeably slower than TCP. This is related to waiting for responses and timeouts. Therefore, in practice, specific ports of interest are usually specified, for example, **-p U:53**, so as not to check everything and reduce scanning time.

### -sA - TCP ACK scanning

![15_sA](/handson/images/nmap_tools/15_sA.png)

The **-sA** option is used not for finding open ports, but for analyzing firewall rules. In this mode, Nmap sends TCP packets with the ACK flag and looks at how the target reacts to them.

If **RST** arrives in response, it means the port is accessible (not filtered), but whether it's open or closed can't be said. In this case, Nmap marks it as **unfiltered**.

If there's no response or an ICMP error arrives, the port is considered **filtered**, meaning traffic is blocked by the firewall.

### -sO - IP protocol scanning

![16_sO](/handson/images/nmap_tools/16_sO.png)

The **-sO** option is used to check which IP protocols the target host supports. In this case, Nmap doesn't work with ports, but with protocol numbers in the IP header (TCP, UDP, GRE and others).

It works like this. Nmap sends a packet with the specified protocol number and looks at the reaction. If any response arrives, such a protocol is considered available and marked as **open**. If an ICMP message "protocol unreachable" returns in response, it means the protocol is not supported, and it's marked as **closed**.

If there's no response at all, Nmap usually assigns the status **open|filtered**, because it's impossible to precisely understand whether the protocol is supported but silent, or it's simply blocked by a filter.

* * *

## Port Specification and Scan Order
 
### -p - selecting specific ports

![17_p](/handson/images/nmap_tools/17_p.png)

If you need to scan not everything, but only certain ports, the **-p** parameter is used. With its help, you can specify one port, several separated by commas, or an entire range.

First the scan type is specified (for example, -sS or -sU), and then through **-p** the needed ports are listed. You can also specify the protocol:
T: — for TCP
U: — for UDP

If the protocol is not specified, TCP ports are used by default.

Specifying **U** itself doesn't enable UDP scanning. For this, the **-sU** option must be added. Similarly, for TCP, **-sS** (or another TCP method) is used.

Besides manually specifying ports through **-p**, there are a couple more quick options. If you use the **-F** parameter, Nmap will scan only the 100 most common ports. But the **-p-** parameter means checking all 65535 TCP ports. Such an option takes more time, but allows seeing everything without exception, especially if the service is running on a non-standard port.

* * *

## Service Detection, Version and Operating System

### -sV - service version detection

![18_sV](/handson/images/nmap_tools/18_sV.png)

The **-sV** option is responsible for determining the service version. After Nmap finds an open port, it starts sending special requests to it to understand exactly what service is running there and, if possible, determine its version.

For this, the **nmap-service-probes** database is used, which is included with Nmap (it's located in its installation directory). This database contains request templates and expected response variants. Nmap compares the received response with these templates and based on matches makes a conclusion about the service type and its version.

### -O

![19_O](/handson/images/nmap_tools/19_O.png)

The **-O** option enables target operating system detection mode. When it's used, Nmap sends a set of specially prepared TCP and UDP packets to the host and analyzes the responses.

Next, the received data is compared with records from the **nmap-os-db** database, which is included with Nmap. This database contains fingerprints of different operating systems, that is, characteristic features of their network behavior. If a match is found, Nmap outputs the presumed OS and, sometimes, its version.

Besides the system itself, the utility can try to determine the device type (for example, server, router, printer) and even the manufacturer.

For correct operation of **-O**, root rights and at least one open and one closed port are usually needed, so detection accuracy will be higher.

* * *

### -T - scan speed templates (0–5)

![20_T4](/handson/images/nmap_tools/20_T4.png)

The **-T** parameter sets Nmap's aggressiveness and speed. Essentially, these are ready-made timing profiles - how long to wait for a response, how quickly to send packets, how many retries to make, etc.

Values go from 0 to 5:

**-T0 - paranoid**: Very slow mode. Packets are sent with large pauses. Used if you need to be maximally undetectable. In practice, it's used rarely — scanning can take very long.

**-T1 - sneaky**: Also a slow mode, but a bit faster than the previous one. Suitable if you want to reduce the probability of detection, but not wait forever.

**-T2 - polite**: Polite mode. Reduces load on the network and target host. Suitable for careful scanning of someone else's infrastructure by agreement, so as not to create extra load.

**-T3 - normal**: Default mode. Balance between speed and stability. In most cases it's sufficient.

**-T4 - aggressive**: Accelerated scanning. Timeouts are reduced, packets are sent faster. Often used in the local network or in the lab where there are no strict limitations.

**-T5 - insane**: Maximally fast mode. Suitable for very fast and stable networks. In real conditions, it can miss ports due to too aggressive timeouts.

### -A - aggressive scanning

![21_A](/handson/images/nmap_tools/21_A.png)

The **-A** option enables several advanced Nmap capabilities with one command. Essentially, this is a combo mode that launches extended target investigation.

When using **-A**, the following are automatically enabled:

- -sV — service version detection
- -O — attempt to determine the operating system
- --traceroute — route tracing to the host

That is, instead of writing everything separately, you can simply specify **-A**.

Such a mode gives maximum information about the target. What services are running, their versions, presumed OS, additional data from scripts and the path to the host.

But you need to understand that **-A** works longer than regular scanning, creates more network noise, requires root rights for full operation.

Therefore, in the lab - excellent option. But with careful pentesting, it's used consciously, because it's quite noticeable.
