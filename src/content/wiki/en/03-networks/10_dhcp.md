---
title: "DHCP - Address Acquisition Process, Options"
date: "2026-04-27"
---

DHCP (Dynamic Host Configuration Protocol) is a protocol for automatic network configuration. A client receives an IP address, subnet mask, gateway, DNS, and other parameters without any manual setup. Defined in RFC 2131 (1997). Runs over UDP: client uses port 68, server uses port 67.

---

## How DHCP Works

### The DORA Process

```
DORA - four steps to get an address:
  D - Discover    (client looks for a DHCP server)
  O - Offer       (server proposes an address)
  R - Request     (client asks for that specific address)
  A - Acknowledge (server confirms)

Client                              DHCP Server
  │                                      │
  │──── DHCP Discover ──────────────────►│  broadcast (255.255.255.255)
  │     src: 0.0.0.0:68                  │  "Is there a DHCP server out there?"
  │     dst: 255.255.255.255:67          │
  │                                      │
  │◄─── DHCP Offer ─────────────────────│  unicast or broadcast
  │     "I offer you 192.168.1.10"       │
  │     IP: 192.168.1.10                 │
  │     Mask: 255.255.255.0              │
  │     Gateway: 192.168.1.1             │
  │     DNS: 8.8.8.8                     │
  │     Lease time: 86400 sec            │
  │                                      │
  │──── DHCP Request ───────────────────►│  broadcast
  │     "I want 192.168.1.10 from        │
  │      server X"                       │
  │     (broadcast so other servers      │
  │      know their Offers were declined)│
  │                                      │
  │◄─── DHCP ACK ───────────────────────│  unicast or broadcast
  │     "Confirmed. The address is yours"│
  │     Same params + exact lease time   │
  │                                      │
  │  [Client configures the interface]   │

Why broadcast for Discover and Request?
  The client has no IP yet → can't send unicast.
  Discover: finds all DHCP servers in the segment.
  Request: broadcast so all servers (not just the chosen one)
           know the other Offers were declined.
```

### Details of Each Step

```
DHCP Discover:
  src MAC:  client MAC
  src IP:   0.0.0.0 (no address yet)
  dst IP:   255.255.255.255 (broadcast)
  dst port: 67 (DHCP server)
  src port: 68 (DHCP client)

  Contains:
  - xid (transaction ID) - random number that links request to reply
  - chaddr - client MAC address
  - Option 53: DHCP Message Type = 1 (Discover)
  - Option 55: Parameter Request List (what the client wants)
  - Option 61: Client Identifier

DHCP Offer:
  src IP:   DHCP server IP
  dst IP:   255.255.255.255 (broadcast, because client has no IP)
            or unicast to chaddr (client MAC)
  Same xid as Discover.

  Contains:
  - yiaddr ("your IP") - offered IP address
  - siaddr - DHCP server IP
  - Option 53: DHCP Message Type = 2 (Offer)
  - Option 51: IP Address Lease Time
  - Option 1: Subnet Mask
  - Option 3: Router (gateway)
  - Option 6: DNS Servers
  - Any other requested options

DHCP Request:
  broadcast (255.255.255.255) - important!
  Same xid.

  Contains:
  - Option 53: DHCP Message Type = 3 (Request)
  - Option 54: Server Identifier - IP of the chosen server
  - Option 50: Requested IP Address - which IP the client wants

DHCP ACK:
  Contains:
  - Option 53: DHCP Message Type = 5 (ACK)
  - yiaddr - confirmed IP address
  - All network parameters (mask, gateway, DNS, etc.)
  - Exact lease time

DHCP NACK (Negative Acknowledgement):
  Option 53: DHCP Message Type = 6 (NACK)
  Sent when:
  - The requested IP is already in use
  - The client is on the wrong network (VLAN)
  - The IP lease has expired
  Client starts DORA over again.
```

### Lease Renewal

```
A lease is temporary ownership of an IP address.
The client must renew the lease before it expires.

Three time points:
  T1 = 50% of Lease Time → Renewal time
       Client tries to renew via unicast to the server.

  T2 = 87.5% of Lease Time → Rebinding time
       If T1 failed → broadcast Request (looking for any DHCP server).

  T3 = 100% of Lease Time → Expiration
       Lease expired. Client must stop using the IP.
       Starts DORA all over again.

Example (Lease Time = 24 hours = 86400 sec):
  T1 = 43200 sec (12 hours) → Renewal
  T2 = 75600 sec (21 hours) → Rebinding
  T3 = 86400 sec (24 hours) → Expiration

Renewal via unicast:
  Client           DHCP Server
  │──── Request ──────────────►│  unicast to server (client already has IP)
  │◄─── ACK ───────────────────│  new Lease Time

If server is unreachable at T2:
  Client           Any DHCP Server
  │──── Request ──────────────►│  broadcast
  │◄─── ACK or NACK ───────────│
```

### DHCP Release and Decline

```
DHCP Release:
  Client voluntarily gives up the IP address.
  Unicast to the server.
  Option 53: Message Type = 7 (Release)

  When:
  - Normal OS shutdown
  - Command: dhclient -r (Linux) / ipconfig /release (Windows)

  Note: the server is not required to free the lease immediately.
  Some servers mark the address as available, others wait for expiry.

DHCP Decline:
  Client discovered the offered IP is already in use on the network.
  Client sends an ARP probe before using the address (RFC 2131).
  If someone replies to the ARP - the IP is taken → Decline.
  Option 53: Message Type = 4 (Decline)

  After Decline:
  - Client waits 10 seconds and starts DORA again
  - Server marks the address as conflicted
  - Admin needs to investigate the conflict

DHCP Inform:
  Client already has a static IP but wants other parameters (DNS, gateway).
  Unicast Request with the already-known IP.
  Option 53: Message Type = 8 (Inform)
  Server replies with ACK containing the requested options (no yiaddr - no IP is assigned).
```

---

## DHCP Options

### DHCP Packet Structure

```
DHCP is built on top of BOOTP (Bootstrap Protocol, RFC 951).
It inherited the basic packet structure.

DHCP packet fields:
  op     (1 byte):   1=request (client→server), 2=reply (server→client)
  htype  (1 byte):   HW address type (1=Ethernet)
  hlen   (1 byte):   HW address length (6 for MAC)
  hops   (1 byte):   relay agent hop counter (0 from client)
  xid    (4 bytes):  transaction ID (random number)
  secs   (2 bytes):  seconds elapsed since start of address acquisition
  flags  (2 bytes):  broadcast bit (B) - reply must be broadcast
  ciaddr (4 bytes):  client IP (filled in if client already has IP - at Renewal)
  yiaddr (4 bytes):  "your IP" - IP being offered to the client (in Offer/ACK)
  siaddr (4 bytes):  server IP - next server IP (TFTP server for PXE)
  giaddr (4 bytes):  gateway IP - relay agent IP (filled in by relay agent)
  chaddr (16 bytes): client HW address (MAC)
  sname  (64 bytes): server name (optional)
  file   (128 bytes): boot file name (for PXE)
  options (variable): DHCP options (start with magic cookie 99.130.83.99)
```

### Common DHCP Options

```
Option format: Code (1B) + Length (1B) + Value (Length bytes)
Exception: option 0 (Pad) and option 255 (End) - just 1 byte each.

Code  Name                          Description
────────────────────────────────────────────────────────────────
   1  Subnet Mask                   Subnet mask (4 bytes)
   2  Time Offset                   Offset from UTC
   3  Router                        Gateway IP (list, 4 bytes each)
   4  Time Server                   Time server (obsolete)
   5  Name Server                   IEN-116 Name Server (obsolete)
   6  Domain Name Server            DNS server IPs (list)
   7  Log Server                    Syslog server IP
  12  Host Name                     Client hostname
  15  Domain Name                   DNS domain (e.g. company.local)
  26  Interface MTU                 MTU for the interface
  28  Broadcast Address             Broadcast address
  33  Static Route                  Static routes (legacy format)
  42  NTP Servers                   NTP server IPs
  43  Vendor Specific Information   Vendor-specific options
  44  NetBIOS Name Server           WINS server
  50  Requested IP Address          IP requested by client (in Request)
  51  IP Address Lease Time         Lease duration (in seconds)
  52  Option Overload               Use sname/file fields for options
  53  DHCP Message Type             DHCP message type (1-8)
  54  Server Identifier             DHCP server IP
  55  Parameter Request List        List of options the client wants
  56  Message                       Error message text (in NACK)
  57  Maximum DHCP Message Size     Max DHCP message size
  58  Renewal (T1) Time Value       Renewal time (default 50% of lease)
  59  Rebinding (T2) Time Value     Rebinding time (default 87.5% of lease)
  60  Vendor Class Identifier       Client vendor class identifier
  61  Client Identifier             Unique client ID (usually type + MAC)
  66  TFTP Server Name              TFTP server name (for PXE)
  67  Bootfile Name                 Boot file name (for PXE)
  77  User Class                    User class
  82  Relay Agent Information       Info from relay agent (sub-options)
 119  Domain Search                 DNS search domain list
 121  Classless Static Route        Static routes (RFC 3442, modern)
 249  Microsoft Classless Route     Microsoft version of option 121
 252  WPAD                          URL for Web Proxy Auto-Discovery
 255  End                           End of options list
```

### Option 53 - DHCP Message Type

```
All possible values:
  1 - DHCPDISCOVER  (client looking for server)
  2 - DHCPOFFER     (server offering address)
  3 - DHCPREQUEST   (client requesting / renewing address)
  4 - DHCPDECLINE   (client declining - IP already in use)
  5 - DHCPACK       (server confirming)
  6 - DHCPNAK       (server refusing)
  7 - DHCPRELEASE   (client releasing address)
  8 - DHCPINFORM    (client requesting options only)
```

### Option 82 - Relay Agent Information

```
Added by the DHCP relay agent when forwarding a request.
Contains sub-options with information about the client.

Sub-options:
  1 - Circuit ID   - port/VLAN the request arrived on
                     Example: "GigabitEthernet0/1" or "VLAN10:Gi0/1"
  2 - Remote ID    - relay agent MAC/IP
  5 - Link Selection - IP of the subnet where the client is
                       (when giaddr is on a different subnet)
  6 - Subscriber ID  - subscriber identifier (used by ISPs)

Use cases:
  DHCP server sees Circuit ID and picks the right pool.
  Example: client from VLAN20 port → pool 192.168.20.0/24.
  Security: ISP ties an IP to a specific port / subscriber.
```

### Option 121 - Classless Static Routes

```
Lets the DHCP server push static routes to the client.
Format: destination (prefix length + network bytes) + gateway (4 bytes).

Example:
  Route 10.0.0.0/8 via 192.168.1.254
  Route 172.16.0.0/12 via 192.168.1.254

Encoding in option 121:
  8 + 10.0.0.0 + 192.168.1.254      (prefix /8, network 10.0.0.0)
  12 + 172.16.0.0 + 192.168.1.254   (prefix /12, network 172.16.0.0)

Option 33 (legacy) does not support classless addressing.
Option 121 overrides option 3 (Router) when both are present!
Important for VPN clients - split tunneling can be configured via DHCP options.
```

---

## DHCP Relay Agent

### Why a Relay Agent Is Needed

```
DHCP Discover is a broadcast packet.
Broadcast stays within a single L2 segment (VLAN).
There is usually one DHCP server for the whole network.

Problem:
  A client in VLAN 20 (192.168.20.0/24) sends a broadcast.
  The DHCP server in VLAN 1 (192.168.1.0/24) never receives it.

Solution: DHCP Relay Agent (ip helper-address on Cisco).
  The relay agent intercepts the DHCP broadcast.
  Repackages it as unicast and forwards it to the DHCP server.
  Fills in giaddr (gateway IP) with its own IP.
  Adds option 82 (client information).

  Client → [broadcast] → Relay Agent → [unicast] → DHCP Server
  DHCP Server → [unicast] → Relay Agent → [unicast/broadcast] → Client

giaddr (Gateway IP Address):
  Relay agent inserts its own IP into this field.
  DHCP server looks at giaddr → selects the pool for that subnet.
  DHCP server sends the reply to giaddr (not directly to the client).
```

### Configuring the Relay Agent

```
# Cisco IOS - on the interface facing clients
interface Vlan20
  ip address 192.168.20.1 255.255.255.0
  ip helper-address 192.168.1.100    (DHCP server IP)

# Multiple servers (for redundancy)
interface Vlan20
  ip helper-address 192.168.1.100
  ip helper-address 192.168.1.101

# ip helper-address forwards several protocols by default:
# UDP 37  (Time)
# UDP 49  (TACACS)
# UDP 53  (DNS)
# UDP 67  (DHCP/BOOTP)
# UDP 68  (DHCP/BOOTP)
# UDP 69  (TFTP)
# UDP 137 (NetBIOS Name)
# UDP 138 (NetBIOS Datagram)

# Restrict to DHCP only:
no ip forward-protocol udp 37
no ip forward-protocol udp 49
no ip forward-protocol udp 69
no ip forward-protocol udp 137
no ip forward-protocol udp 138

# Linux (isc-dhcp-relay)
apt install isc-dhcp-relay
# /etc/default/isc-dhcp-relay:
# SERVERS="192.168.1.100"
# INTERFACES="eth1 eth2"   (interfaces with clients)
# OPTIONS=""
systemctl restart isc-dhcp-relay

# Linux (dhcrelay from dhcp package)
dhcrelay -i eth1 -i eth2 192.168.1.100

# Verify on Cisco
show ip helper-address
debug ip dhcp server events   (careful on production!)
```

---

## Configuring a DHCP Server

### ISC DHCP Server (Linux, classic)

```
# Install
apt install isc-dhcp-server

# Main config: /etc/dhcp/dhcpd.conf

# Global parameters
default-lease-time 86400;         # 24 hours
max-lease-time 172800;             # 48 hours (maximum)
authoritative;                     # server is authoritative (sends NACK)
log-facility local7;               # syslog facility

# DDNS updates
ddns-update-style none;            # disable DDNS

# Options for all clients
option domain-name "company.local";
option domain-name-servers 192.168.1.10, 192.168.1.11;
option ntp-servers 192.168.1.12;

# Subnet
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.50 192.168.1.200;    # address pool
    option routers 192.168.1.1;           # gateway
    option subnet-mask 255.255.255.0;
    option broadcast-address 192.168.1.255;
    default-lease-time 86400;
    max-lease-time 172800;
}

# Reservation (fixed IP by MAC)
host printer-office {
    hardware ethernet 00:11:22:33:44:55;
    fixed-address 192.168.1.20;
    option host-name "printer-office";
}

host server-web {
    hardware ethernet aa:bb:cc:dd:ee:ff;
    fixed-address 192.168.1.100;
    # Individual options for this host
    default-lease-time 2592000;   # 30 days for servers
}

# Multiple subnets (for relay)
subnet 192.168.10.0 netmask 255.255.255.0 {
    range 192.168.10.50 192.168.10.200;
    option routers 192.168.10.1;
    option domain-name-servers 192.168.1.10;
}

subnet 192.168.20.0 netmask 255.255.255.0 {
    range 192.168.20.50 192.168.20.200;
    option routers 192.168.20.1;
    option domain-name-servers 192.168.1.10;
}

# Pushing static routes (option 121)
option classless-static-routes code 121 = array of unsigned integer 8;
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.50 192.168.1.200;
    option routers 192.168.1.1;
    # Route 10.0.0.0/8 via 192.168.1.254
    option classless-static-routes 8, 10, 192.168.1.254,
                                    0, 192.168.1.1;   # default route
}
```

```
# Managing ISC DHCP
systemctl start isc-dhcp-server
systemctl status isc-dhcp-server

# Validate config
dhcpd -t -cf /etc/dhcp/dhcpd.conf

# View issued leases
cat /var/lib/dhcp/dhcpd.leases
# lease 192.168.1.50 {
#   starts 1 2026/04/27 10:00:00;
#   ends   2 2026/04/28 10:00:00;
#   binding state active;
#   hardware ethernet 00:1a:2b:3c:4d:5e;
#   client-hostname "laptop-user";
# }

# Count active leases
grep "^lease" /var/lib/dhcp/dhcpd.leases | wc -l

# Logs
journalctl -u isc-dhcp-server -f
tail -f /var/log/syslog | grep dhcp
```

### Kea DHCP (modern replacement for ISC DHCP)

```
ISC DHCP (dhcpd) was declared end-of-life in 2022.
Kea is the modern replacement from ISC, actively maintained.

# Install
apt install kea-dhcp4-server

# Config: /etc/kea/kea-dhcp4.conf (JSON format)
{
  "Dhcp4": {
    "interfaces-config": {
      "interfaces": ["eth0"]
    },
    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    "valid-lifetime": 86400,
    "renew-timer": 43200,
    "rebind-timer": 75600,
    "subnet4": [
      {
        "subnet": "192.168.1.0/24",
        "pools": [{ "pool": "192.168.1.50 - 192.168.1.200" }],
        "option-data": [
          { "name": "routers", "data": "192.168.1.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8, 8.8.4.4" }
        ],
        "reservations": [
          {
            "hw-address": "00:11:22:33:44:55",
            "ip-address": "192.168.1.20",
            "hostname": "printer"
          }
        ]
      }
    ]
  }
}
```

### DHCP on Cisco IOS (built-in server)

```
# Exclude addresses from the pool (gateways, servers)
ip dhcp excluded-address 192.168.1.1 192.168.1.19
ip dhcp excluded-address 192.168.1.200 192.168.1.254

# Create a pool
ip dhcp pool LAN
  network 192.168.1.0 255.255.255.0
  default-router 192.168.1.1
  dns-server 8.8.8.8 8.8.4.4
  domain-name company.local
  lease 1 0 0                    (days hours minutes = 1 day)
  ntp-server 192.168.1.12

# Reservation by MAC
ip dhcp pool PC-ADMIN
  host 192.168.1.10 255.255.255.0
  hardware-address 00:1a:2b:3c:4d:5e
  client-name admin-pc

# Verify
show ip dhcp pool
show ip dhcp binding
# IP address       Client-ID/          Lease expiration        Type
#                  Hardware address
# 192.168.1.50     0100.1a2b.3c4d.5e   Apr 28 2026 10:00 AM   Automatic
# 192.168.1.10     0100.1a2b.3c4d.5f   Infinite                Manual

show ip dhcp conflict             (address conflicts)
show ip dhcp statistics           (statistics)

# Clear leases
clear ip dhcp binding *
clear ip dhcp binding 192.168.1.50

# Disable DHCP server
no service dhcp
```

---

## DHCP Client

### Linux - dhclient

```
# Request an address (dhclient - traditional)
dhclient eth0           # get address
dhclient -r eth0        # release
dhclient -v eth0        # verbose output

# Force renewal
dhclient -r eth0 && dhclient eth0

# dhclient files
/etc/dhcp/dhclient.conf         # config
/var/lib/dhcp/dhclient.leases   # lease history

# View current lease
cat /var/lib/dhcp/dhclient.leases

# dhclient.conf - request additional options
request subnet-mask, broadcast-address, routers,
        domain-name, domain-name-servers,
        ntp-servers, classless-static-routes;

# Set the hostname the client sends to the server
send host-name "my-laptop";
```

### Linux - systemd-networkd / NetworkManager

```
# NetworkManager - status
nmcli device status
nmcli connection show

# Request / renew DHCP
nmcli device reapply eth0
# or
nmcli connection up "Wired connection 1"

# View received parameters
nmcli device show eth0
# GENERAL.DEVICE:   eth0
# IP4.ADDRESS[1]:   192.168.1.50/24
# IP4.GATEWAY:      192.168.1.1
# IP4.DNS[1]:       8.8.8.8

# systemd-networkd
# /etc/systemd/network/20-wired.network
# [Match]
# Name=eth0
#
# [Network]
# DHCP=yes
#
# [DHCP]
# SendHostname=yes
# UseDNS=yes
# UseNTP=yes

systemctl restart systemd-networkd

# View lease
networkctl status eth0
```

### Windows

```
# Release / renew
ipconfig /release           # release address
ipconfig /renew             # request new address

# View DHCP details
ipconfig /all
# Ethernet adapter Local Area Connection:
#    DHCP Enabled. . . . . . . . . . : Yes
#    Autoconfiguration Enabled . . . : Yes
#    IPv4 Address. . . . . . . . . . : 192.168.1.50
#    Subnet Mask . . . . . . . . . . : 255.255.255.0
#    Lease Obtained. . . . . . . . . : April 27 2026 10:00:00
#    Lease Expires . . . . . . . . . : April 28 2026 10:00:00
#    Default Gateway . . . . . . . . : 192.168.1.1
#    DHCP Server . . . . . . . . . . : 192.168.1.1
#    DNS Servers . . . . . . . . . . : 8.8.8.8

# PowerShell
Get-NetIPConfiguration
Get-DhcpServerInDC                          (list DHCP servers in AD)
```

---

## DHCP Snooping

### What DHCP Snooping Is

```
DHCP Snooping is a security feature on managed switches.
Protects against rogue DHCP servers.

Rogue DHCP attack:
  An attacker runs a DHCP server on the network.
  Clients receive addresses from it.
  The rogue server hands out:
    - Its own IP as the gateway → MITM (all traffic goes through attacker)
    - Its own IP as DNS → DNS spoofing
    - A very short lease time → clients keep renewing with the attacker

DHCP Snooping:
  Ports are divided into Trusted and Untrusted.
  Trusted: uplinks toward the legitimate DHCP server.
  Untrusted: client-facing ports (default for all ports).

  On Untrusted ports:
  - DHCP Offer/ACK/NACK → dropped (only a server can send these)
  - DHCP Release from an IP not in the snooping table → dropped
  - Rate limit: max N DHCP packets per second (flood protection)

  On Trusted ports:
  - All DHCP traffic is allowed through.

DHCP Snooping Binding Table:
  The switch builds a table: MAC → IP → port → VLAN → lease time.
  Used by DAI (Dynamic ARP Inspection) and IP Source Guard.
```

### Configuring DHCP Snooping

```
# Cisco - enable DHCP Snooping
ip dhcp snooping                           # enable globally
ip dhcp snooping vlan 10,20,30             # for specific VLANs

# Trust only the uplink port (toward DHCP server)
interface GigabitEthernet0/24
  ip dhcp snooping trust                   # uplink - trusted

# Rate-limit client ports
interface GigabitEthernet0/1
  ip dhcp snooping limit rate 10           # max 10 packets/sec

# Don't insert option 82 (sometimes it causes problems)
no ip dhcp snooping information option

# Verify
show ip dhcp snooping
# DHCP snooping is configured on following VLANs: 10,20,30
# Insertion of option 82 is enabled
# Interface           Trusted   Rate limit (pps)
# GigabitEthernet0/1  no        10
# GigabitEthernet0/24 yes       unlimited

show ip dhcp snooping binding
# MacAddress         IpAddress    Lease(sec) Type          VLAN Interface
# 00:1a:2b:3c:4d:5e 192.168.1.50 86313      dhcp-snooping 10   Gi0/1

# Export binding table (survives reloads)
ip dhcp snooping database flash:/dhcp-snooping.db
ip dhcp snooping database write-delay 30   # write every 30 sec
```

---

## DHCP and PXE (Network Boot)

```
PXE (Preboot eXecution Environment) - booting an OS over the network.
DHCP is used to deliver the TFTP server address and boot file name.

Options for PXE:
  Option 66 (tftp-server-name): IP or hostname of the TFTP server
  Option 67 (bootfile-name): name of the file to load
  siaddr: TFTP server IP (field in the DHCP packet)

ISC DHCP config for PXE:
  subnet 192.168.1.0 netmask 255.255.255.0 {
      range 192.168.1.50 192.168.1.200;
      option routers 192.168.1.1;
      next-server 192.168.1.5;             # TFTP server IP (siaddr)
      filename "pxelinux.0";               # boot file (BIOS)

      # Different files for BIOS and UEFI clients
      if option vendor-class-identifier = "PXEClient:Arch:00007" {
          filename "bootx64.efi";          # UEFI 64-bit
      } elsif option vendor-class-identifier = "PXEClient:Arch:00000" {
          filename "pxelinux.0";           # Legacy BIOS
      }
  }

Cisco IOS:
  ip dhcp pool PXE-POOL
    network 192.168.1.0 255.255.255.0
    default-router 192.168.1.1
    next-server 192.168.1.5
    bootfile pxelinux.0
```

---

## APIPA - Auto-Configuration Without DHCP

```
APIPA (Automatic Private IP Addressing) - RFC 3927.
When no DHCP server is reachable, the host assigns itself an address
from the 169.254.0.0/16 range.

Process:
  1. Client gets no response to DHCP Discover.
  2. Picks a random address from 169.254.1.0 - 169.254.254.255.
  3. Checks with an ARP probe that the address is not already in use.
  4. Assigns itself the address with mask 255.255.0.0.
  5. Continues periodically retrying DHCP in the background.

Use cases:
  - Small networks with no DHCP server (peer-to-peer)
  - Diagnostics: seeing 169.254.x.x → DHCP is not working

Diagnosing on Windows:
  ipconfig /all → address is 169.254.x.x → DHCP did not respond

  What to check:
    - Physical connection (cable, Wi-Fi)
    - Is the DHCP server running?
    - Is the DHCP pool exhausted?
    - Is DHCP Snooping blocking the traffic?
    - Does the firewall allow UDP 67/68?

IPv6 equivalent - SLAAC (Stateless Address Autoconfiguration, RFC 4862):
  Host auto-generates an address from fe80::/10 (link-local).
  Uses Router Advertisements (RA) to get a global prefix.
  No DHCP required (though DHCPv6 also exists).
```

---

## Troubleshooting DHCP

### Client Not Getting an Address

```
Step 1: Capture DHCP traffic
  tcpdump -i eth0 -n port 67 or port 68
  # Do we see DHCPDISCOVER?
  # Do we see DHCPOFFER?
  # Discover present but no Offer → server is not responding

  # Detailed capture to file for Wireshark
  tcpdump -i eth0 -w /tmp/dhcp.pcap port 67 or port 68

Step 2: Request address manually with verbose output
  dhclient -v eth0
  # Watching for response...
  # Bound to *:68
  # Listening on LPF/eth0/00:1a:2b:3c:4d:5e
  # Sending on   LPF/eth0/00:1a:2b:3c:4d:5e
  # DHCPDISCOVER on eth0 to 255.255.255.255 port 67
  # DHCPOFFER from 192.168.1.1
  # DHCPREQUEST on eth0 to 255.255.255.255 port 67
  # DHCPACK from 192.168.1.1

Step 3: Check server logs
  # ISC DHCP logs
  journalctl -u isc-dhcp-server
  # DHCPDISCOVER from 00:1a:2b:3c:4d:5e via eth0
  # DHCPOFFER on 192.168.1.50 to 00:1a:2b:3c:4d:5e via eth0
  # DHCPREQUEST for 192.168.1.50 from 00:1a:2b:3c:4d:5e via eth0
  # DHCPACK on 192.168.1.50 to 00:1a:2b:3c:4d:5e via eth0

  # Cisco
  debug ip dhcp server events
  debug ip dhcp server packet

Step 4: Pool exhausted?
  # ISC DHCP
  grep "^lease" /var/lib/dhcp/dhcpd.leases | wc -l
  # Compare with the pool size

  # Cisco
  show ip dhcp pool
  # Utilization mark (high/low): 100/0
  # Total addresses: 151
  # Leased addresses: 151  ← pool is full!
  # Available addresses: 0

Step 5: Address conflict?
  # Cisco
  show ip dhcp conflict
  # IP address        Detection method   Detection time
  # 192.168.1.50      Ping               Apr 27 2026 10:00 AM
  # clear ip dhcp conflict *  ← clear and re-evaluate

Step 6: DHCP Snooping blocking?
  show ip dhcp snooping statistics
  # Look for high DroppedUntrustedPorts counter
```

### Checking DHCP Options Received

```
# Linux - view what was received
ip addr show eth0      # IP and mask
ip route show          # routes (gateway)
cat /etc/resolv.conf   # DNS
cat /run/systemd/resolve/resolv.conf  (with systemd-resolved)

# Full info via nmcli
nmcli device show eth0

# Wireshark filters
bootp                                    # all DHCP traffic
bootp.option.type == 53                  # filter by message type
bootp.option.dhcp == 5                   # ACK only
bootp.hw.mac_addr == 00:1a:2b:3c:4d:5e  # specific client

# Manual DHCP server check (dhcping)
apt install dhcping
dhcping -s 192.168.1.1 -h 00:1a:2b:3c:4d:5e

# nmap to discover DHCP servers
nmap --script broadcast-dhcp-discover
# Starting Nmap ...
# Host: 192.168.1.1
#   DHCP Message Type: DHCPOFFER
#   Server Identifier: 192.168.1.1
#   IP Offered: 192.168.1.X
#   Subnet Mask: 255.255.255.0
#   Router: 192.168.1.1
#   ...
```

---

## Cheat Sheet

```
DORA process:
  Discover  → broadcast from client (src 0.0.0.0, dst 255.255.255.255)
  Offer     → from server with proposed IP
  Request   → broadcast from client (confirming the choice)
  ACK       → from server (confirmation)

Ports:
  UDP 67 - DHCP server
  UDP 68 - DHCP client

Key options:
  1   - Subnet Mask
  3   - Router (gateway)
  6   - DNS Servers
  51  - Lease Time (seconds)
  53  - Message Type (1=Discover, 2=Offer, 3=Request, 5=ACK, 6=NACK)
  54  - Server Identifier
  55  - Parameter Request List
  58  - T1 Renewal Time (50% of Lease)
  59  - T2 Rebinding Time (87.5% of Lease)
  66  - TFTP Server (PXE)
  67  - Boot File (PXE)
  82  - Relay Agent Info (Circuit ID, Remote ID)
  121 - Classless Static Routes

Lease timers:
  T1 = 50%    (renewal via unicast to server)
  T2 = 87.5%  (rebinding via broadcast to any server)
  T3 = 100%   (expiry - restart DORA)

DHCP Snooping:
  Protection against rogue DHCP servers.
  Trusted ports: uplinks toward the server.
  Untrusted ports: client-facing (DHCP Offer is dropped).

Useful commands (Linux):
  dhclient -v eth0               request address (verbose)
  dhclient -r eth0               release address
  tcpdump -n port 67 or port 68  capture DHCP traffic
  journalctl -u isc-dhcp-server  server logs
  cat /var/lib/dhcp/dhcpd.leases lease table

Useful commands (Cisco):
  show ip dhcp binding           issued addresses
  show ip dhcp pool              pool usage
  show ip dhcp conflict          conflicts
  show ip dhcp snooping binding  DHCP snooping table
  clear ip dhcp binding *        clear all leases
  debug ip dhcp server events    debug (use carefully!)

APIPA:
  169.254.0.0/16 → DHCP server unreachable
  IPv6 equivalent: fe80::/10 (link-local, SLAAC)
```

---

## References

- [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131) - DHCP (Dynamic Host Configuration Protocol), 1997
- [RFC 2132](https://www.rfc-editor.org/rfc/rfc2132) - DHCP Options and BOOTP Vendor Extensions (full options list)
- [RFC 3442](https://www.rfc-editor.org/rfc/rfc3442) - Classless Static Route Option (option 121)
- [RFC 3046](https://www.rfc-editor.org/rfc/rfc3046) - DHCP Relay Agent Information Option (option 82)
- [RFC 3927](https://www.rfc-editor.org/rfc/rfc3927) - Dynamic Configuration of IPv4 Link-Local Addresses (APIPA)
- [RFC 8415](https://www.rfc-editor.org/rfc/rfc8415) - DHCPv6
- [Kea DHCP Documentation](https://kea.readthedocs.io) - modern DHCP server
- [ISC DHCP (dhcpd)](https://www.isc.org/dhcp/) - classic DHCP server (end-of-life)
