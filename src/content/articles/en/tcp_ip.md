---
title: "TCP/IP Traffic Analysis in Wireshark"
description: "In this lab we capture and dissect real traffic: an HTTP request in plain text, DNS resolution, an ICMP ping, the TCP three-way handshake, an SSH session, and HTTPS"
image: "/images/tcp_ip_net/main.jpg"
date: "2026-04-18"
---

## Introduction

Network protocols are a fundamental part of data communication in computer networks. When a website is opened, a host is pinged, or an SSH connection is established, packets with defined structures are exchanged over the network. Wireshark can be used to capture and analyze this traffic.

In this lab, different types of network traffic are captured and analyzed, including HTTP requests, DNS resolution, ICMP (ping), the TCP three-way handshake, SSH, and HTTPS. For each protocol, key packet fields are examined, and conclusions are made about which information is visible in the traffic and which remains hidden.


| Parameter | Value |
| --- | --- |
| Machine | Parrot OS, 10.10.70.129 |
| Tools | Wireshark, curl, ping, nslookup, ssh |
| Test resources | httpbin.org, google.com, example.com |

---

## Theoretical Background

### The TCP/IP Model in Practice

Every packet in Wireshark is several protocols nested inside each other. An HTTP request to a website looks like this:

| Layer | Protocol | Contains |
| --- | --- | --- |
| Application | HTTP | GET /page, headers, body |
| Transport | TCP | Ports, flags, sequence numbers |
| Network | IP | Source and destination IPs, TTL |
| Link | Ethernet | MAC addresses |

Wireshark shows all layers simultaneously - you can expand any of them and inspect every field.

### What Is Encrypted, What Is Not

| Protocol | Content visible? | Metadata visible? |
| --- | --- | --- |
| HTTP | Yes - completely | Yes |
| DNS | Yes - queries and answers | Yes |
| ICMP | Yes - payload | Yes |
| HTTPS/TLS | No - encrypted | Yes - IP, port, SNI |
| SSH | No - encrypted | Yes - IP, port, version |

---

## Phase 1. HTTP Traffic

### Step 1. Generating an HTTP Request

We launch Wireshark, select the interface, and start capturing. In the terminal:

```bash
curl http://httpbin.org/get
```

![01_curl](/handson/images/tcp_ip_net/01_curl.png)

### Step 2. The Full Picture of an HTTP Session

In Wireshark without a filter the entire sequence is visible:

![02_wireshark](/handson/images/tcp_ip_net/02_wireshark.png)

One `curl http://httpbin.org/get` produced 15 packets:

| Packets | Protocol | What happens |
| --- | --- | --- |
| 1–4 | DNS | Resolving httpbin.org → IP (A and AAAA records) |
| 5–7 | TCP | Three-way handshake (SYN → SYN-ACK → ACK) |
| 8 | HTTP | GET /get request |
| 10 | HTTP | 200 OK response with JSON |
| 11–15 | TCP | Connection teardown (FIN-ACK) |

### Step 3. Filtering by Protocol

We enter the filter `http` in Wireshark:

![03_http](/handson/images/tcp_ip_net/03_http.png)

Of the 15 packets only two remain: the GET request and the 200 OK response.

### Step 4. Inside an HTTP GET Request

We click on the GET packet and expand `Hypertext Transfer Protocol`:

![04_get](/handson/images/tcp_ip_net/04_get.png)

All headers are visible in plain text:

```
GET /get HTTP/1.1
Host: httpbin.org
User-Agent: curl/8.14.1
Accept: */*
```

`[Response in frame: 10]` - Wireshark automatically links the request to its response. HTTP has no encryption — any observer on the packet's path sees this text in full.

### Step 5. Follow TCP Stream

Right-click on the GET packet → `Follow → TCP Stream`:

![05_tcp_stream](/handson/images/tcp_ip_net/05_tcp_stream.png)

![06_tcp_stream2](/handson/images/tcp_ip_net/06_tcp_stream2.png)

Wireshark reconstructs the entire dialogue - the client's request in red, the server's response in blue. The full HTTP exchange is visible: the request with all headers and the JSON response. This is exactly what HTTP looks like to an interceptor.

---

## Phase 2. ICMP - Anatomy of Ping

### Step 6. Generating ICMP Traffic

```bash
ping -c 4 google.com
```

![07_ping](/handson/images/tcp_ip_net/07_ping.png)

Filter in Wireshark: `icmp`

![08_icmp](/handson/images/tcp_ip_net/08_icmp.png)

Request/Reply pairs are visible: from `10.10.0.102` to `142.251.142.238` (Google) and back. Round-trip time is around 22 ms.

### Step 7. ICMP Packet Structure

We expand the Echo Request:

![09_request](/handson/images/tcp_ip_net/09_request.png)

```
Type: 8 (Echo request)
Identifier: 0xd966
Sequence number: 1
Timestamp: Apr 18...
[Response frame: 22]
```

We expand the Echo Reply:

![10_reply](/handson/images/tcp_ip_net/10_reply.png)

```
Type: 0 (Echo reply)
Identifier: 0xd966  ← same as in the request
Sequence number: 1  ← matches
Response time: 21.839 ms
Checksum: correct
```

The identifier and sequence number link each request to its reply. The TTL in the IP header of the reply shows how many routers the packet passed through from Google.

---

## Phase 3. DNS - How Names Become Addresses

### Step 8. DNS Query via nslookup

```bash
nslookup google.com
```

![11_nslookup](/handson/images/tcp_ip_net/11_nslookup.png)

Filter in Wireshark: `dns`

![12_dns](/handson/images/tcp_ip_net/12_dns.png)

Two transactions are visible: an A record query (IPv4) with ID `0x24ac` and an AAAA record query (IPv6) with ID `0xf98b`. Response time - 27 milliseconds.

### Step 9. Inside a DNS Query and Response

We expand the DNS Query:

![13_query](/handson/images/tcp_ip_net/13_query.png)

```
Port: 53 (UDP)
Flags: Message is a query
Question: google.com, type A
[Response In: 2]
```

We expand the DNS Response:

![14_response](/handson/images/tcp_ip_net/14_response.png)

```
Flags: Message is a response, No error
Answer: google.com → 172.217.19.238
Type: A (IPv4)
TTL: 3918 seconds (~65 minutes)
```

DNS runs over UDP on port 53 and is completely open - any observer can see which sites you are visiting. A TTL of 3918 seconds means the response can be cached for 65 minutes.

---

## Phase 4. TCP Three-Way Handshake

### Step 10. Capturing a TCP Connection

```bash
curl http://example.com
```

![15_example](/handson/images/tcp_ip_net/15_example.png)

Filter: `tcp.port == 80`

![16_tcp_port](/handson/images/tcp_ip_net/16_tcp_port.png)

### Step 11. The Three Handshake Packets

The first three packets establish the connection.

**Packet 1 - SYN:**

![17_syn](/handson/images/tcp_ip_net/17_syn.png)

```
Flags: 0x002 (SYN)
Sequence Number: 0 (relative), raw: 2244735208
Window: 64240
MSS option: 1460
```

The client `10.10.0.102:46590` proposes a connection to server `8.6.112.6:80`. The Sequence Number is a random value from which packet numbering will begin.

**Packet 2 - SYN-ACK:**

![18_syn_ack](/handson/images/tcp_ip_net/18_syn_ack.png)

```
Flags: 0x012 (SYN, ACK)
Acknowledgment Number: 1  ← confirms client's SYN
Sequence Number: 0         ← server's own SYN
[Expert Info: Connection establish acknowledge (SYN+ACK)]
```

The server accepts the connection and simultaneously sends its own SYN.

**Packet 3 — ACK:**

![19_ack](/handson/images/tcp_ip_net/19_ack.png)

```
Flags: 0x010 (ACK)
Acknowledgment Number: 1  ← confirms server's SYN
[TCP Flags: ....A....]
```

The client acknowledges the server's SYN. The connection is established - data can now be transferred.

---

## Phase 5. SSH - The Encrypted Tunnel

### Step 12. Connecting via SSH

```bash
ssh ubuntu@10.10.70.130
```

![20_ssh_connection](/handson/images/tcp_ip_net/20_ssh_connection.png)

Filter in Wireshark: `tcp.port == 22`

![21_ssh_22](/handson/images/tcp_ip_net/21_ssh_22.png)

Unlike HTTP where everything is open — here the picture is completely different:

| Packets | What is visible |
| --- | --- |
| 4–6 | TCP handshake (SYN, SYN-ACK, ACK) |
| 7 | `Client: Protocol (SSH-2.0-OpenSSH_10.0p2 Debian)` |
| 9 | `Server: Protocol (SSH-2.0-OpenSSH_10.0p2 Ubuntu)` |
| 11 | `Client: Key Exchange Init` |
| 14 | `Server: Key Exchange Init` |
| 15 | `Client: Diffie-Hellman Key Exchange Init` |
| 16 | `Server: Diffie-Hellman Key Exchange Reply, New Keys, Encrypted packet` |
| 18+ | `Client/Server: Encrypted packet` - content inaccessible |

After the Diffie-Hellman key exchange all subsequent packets are `Encrypted packet`. Wireshark sees the fact that data is being transferred and its size, but not the contents.

> The only thing open in SSH is the client and server versions in the first packets: `SSH-2.0-OpenSSH_10.0p2`. These are metadata that cannot be hidden - they are needed for protocol negotiation.

---

## Phase 6. HTTPS - TLS over TCP

### Step 13. HTTPS Request to Google

```bash
curl https://google.com
```

![22_curl_google](/handson/images/tcp_ip_net/22_curl_google.png)

Google returned `301 Moved` - a redirect to `https://www.google.com/`. This is standard behaviour: a request to the root domain is redirected to www.

Filter in Wireshark: `tcp.port == 443`

![23_port_443](/handson/images/tcp_ip_net/23_port_443.png)

The full picture of an HTTPS session:

| Packets | Protocol | What happens |
| --- | --- | --- |
| 7–9 | TCP | Three-way handshake on port 443 |
| 10 | TLSv1.3 | `Client Hello (SNI=google.com)` |
| 13 | TLSv1.3 | `Server Hello, Change Cipher Spec` |
| 14–20 | TCP | ACK confirmations |
| 21 | TLSv1.3 | `Application Data` - encrypted |
| 25 | TLSv1.3 | `Change Cipher Spec, Application Data` |
| 27+ | TLSv1.3 | `Application Data` - encrypted only |
| 43 | TCP | `RST, ACK` - connection reset |

The key moment is packet 10: `Client Hello (SNI=google.com)`. **SNI (Server Name Indication)** is the one field that remains open in HTTPS. It is needed so the server knows which site the client is connecting to and can select the correct certificate. An observer sees the domain name even in an encrypted HTTPS connection.

---

## Phase 7. Saving and Analysing the PCAP

### Step 14. Saving the Capture

In Wireshark: `File → Save As → lab_traffic.pcap`

```bash
ls -la ~/lab_traffic.pcap
```

A PCAP file can be opened at any time, shared with a colleague, or loaded into other analysis tools - `tcpdump`, `tshark`, `NetworkMiner`.

### Step 15. Statistics → Protocol Hierarchy

In Wireshark: `Statistics → Protocol Hierarchy`

Shows the protocol tree with traffic percentages - how many bytes went to TCP, UDP, TLS, HTTP, DNS.

---

## Summary and Conclusions

### HTTP vs HTTPS vs SSH - What Is Visible from Outside

| What is visible | HTTP | HTTPS | SSH |
| --- | --- | --- | --- |
| IP addresses | yes | yes | yes |
| Port | yes | yes | yes |
| TCP handshake | yes | yes | yes |
| Site name (SNI) | in Host header | in Client Hello | no |
| Protocol version | HTTP/1.1 | TLS 1.3 | SSH-2.0 |
| Client version | User-Agent | no | OpenSSH version |
| Request URL | completely | encrypted | no |
| Headers | completely | encrypted | no |
| Response body | completely | encrypted | no |
| Cookies | visible | encrypted | no |
| Data volume | yes | yes | yes |

### Useful Wireshark Filters

| Filter | What it shows |
| --- | --- |
| `http` | HTTP traffic only |
| `dns` | DNS queries and responses only |
| `icmp` | ICMP (ping) only |
| `tcp.port == 80` | TCP on port 80 |
| `tcp.port == 443` | HTTPS traffic |
| `tcp.port == 22` | SSH traffic |
| `tcp.flags.syn == 1 && tcp.flags.ack == 0` | SYN packets only |
| `tcp.flags.syn == 1 && tcp.flags.ack == 1` | SYN-ACK packets only |
| `ip.src == 10.10.70.129` | Traffic from a specific IP |
| `http.request.method == "GET"` | GET requests only |
| `frame.len > 1000` | Packets larger than 1000 bytes |

In this lab we examined real network traffic at the packet level: from DNS resolution and ICMP to HTTP, the TCP three-way handshake, SSH, and HTTPS. The key takeaway - encryption hides content but not metadata. An observer always sees who you are communicating with, when, and how much data is being transferred.
