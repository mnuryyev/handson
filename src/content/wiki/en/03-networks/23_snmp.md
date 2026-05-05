---
title: "SNMP - MIB, OID, Community Strings"
date: "2026-05-05"
---

SNMP (Simple Network Management Protocol) is a protocol for managing and monitoring network devices. It lets you query routers, switches, servers, and printers to retrieve status data: CPU load, interface traffic, memory usage. Defined in RFC 1157 (v1), RFC 1901 (v2c), RFC 3411-3418 (v3).

```
How SNMP works:

NMS (Network Management System)        Managed device
  (Zabbix, PRTG, Nagios, LibreNMS)        (router, switch)
         │                                      │
         │  GET-REQUEST (OID)   UDP 161         │
         │───────────────────────────────────►  │
         │                                      │
         │  GET-RESPONSE (value)                │
         │◄───────────────────────────────────  │
         │                                      │
         │◄── TRAP (event)     UDP 162 ─────────│
         │     (device reports spontaneously)   │
```

---

## SNMP versions

```
SNMPv1 (RFC 1157, 1988):
  - Community string is the only authentication
  - Password sent in plaintext
  - 32-bit counters (overflow on high-speed links)
  - Obsolete but found on legacy hardware

SNMPv2c (RFC 1901, 1995):
  - "c" = community-based (same simple authentication)
  - 64-bit counters (Counter64 - no overflow on 10G+)
  - New PDU types: GetBulk (efficient table traversal)
  - Better error handling
  - Most widely deployed version today

SNMPv3 (RFC 3411, 2002):
  - Real authentication (HMAC-MD5, HMAC-SHA)
  - Encryption (DES, AES-128, AES-192, AES-256)
  - Access control (View-Based Access Control - VACM)
  - No community strings - uses usernames with passwords
  - Recommended for production
```

```
Version comparison:

                SNMPv1    SNMPv2c   SNMPv3
                -------   -------   ------
Authentication  Community Community Username+Auth
Encryption      No        No        AES/DES
64-bit counter  No        Yes       Yes
GetBulk         No        Yes       Yes
Security        Low       Low       High
Complexity      Simple    Simple    Complex
```

---

## OID - Object Identifier

An OID is a unique identifier for an object in the hierarchical MIB tree. It is a sequence of numbers separated by dots.

### OID structure

```
An OID is written as a sequence of numbers:
  1.3.6.1.2.1.1.1.0

Each number is a branch in the tree:
  1          - iso
  1.3        - iso.org
  1.3.6      - iso.org.dod
  1.3.6.1    - iso.org.dod.internet
  1.3.6.1.1  - directory
  1.3.6.1.2  - mgmt
  1.3.6.1.2.1 - mib-2 (standard MIBs)
  1.3.6.1.4  - private (vendor extensions)
  1.3.6.1.4.1 - enterprises (vendor OIDs)
  1.3.6.1.4.1.9  - Cisco
  1.3.6.1.4.1.11 - HP
  1.3.6.1.4.1.2636 - Juniper

OID tree:
  iso(1)
  └── org(3)
      └── dod(6)
          └── internet(1)
              ├── mgmt(2)
              │   └── mib-2(1)
              │       ├── system(1)         <- sysDescr, sysUpTime...
              │       ├── interfaces(2)     <- ifTable, ifSpeed...
              │       ├── ip(4)             <- ipAddrTable...
              │       ├── tcp(6)
              │       ├── udp(7)
              │       └── snmp(11)
              └── private(4)
                  └── enterprises(1)
                      ├── cisco(9)
                      ├── hp(11)
                      └── juniper(2636)
```

### Key OIDs (mib-2)

```
system group (1.3.6.1.2.1.1):
  1.3.6.1.2.1.1.1.0   sysDescr      - device description
  1.3.6.1.2.1.1.2.0   sysObjectID   - device type OID
  1.3.6.1.2.1.1.3.0   sysUpTime     - uptime (hundredths of a second)
  1.3.6.1.2.1.1.4.0   sysContact    - admin contact
  1.3.6.1.2.1.1.5.0   sysName       - device name (hostname)
  1.3.6.1.2.1.1.6.0   sysLocation   - physical location
  1.3.6.1.2.1.1.7.0   sysServices   - service types

interfaces group (1.3.6.1.2.1.2):
  1.3.6.1.2.1.2.1.0   ifNumber      - number of interfaces
  1.3.6.1.2.1.2.2     ifTable       - interface table
  1.3.6.1.2.1.2.2.1.1 ifIndex       - interface index
  1.3.6.1.2.1.2.2.1.2 ifDescr       - description (eth0, GigabitEthernet0/0)
  1.3.6.1.2.1.2.2.1.5 ifSpeed       - speed (bits/sec)
  1.3.6.1.2.1.2.2.1.7 ifAdminStatus - admin status (1=up, 2=down)
  1.3.6.1.2.1.2.2.1.8 ifOperStatus  - operational status (1=up, 2=down)
  1.3.6.1.2.1.2.2.1.10 ifInOctets   - bytes in (32-bit, wraps!)
  1.3.6.1.2.1.2.2.1.16 ifOutOctets  - bytes out (32-bit)

IF-MIB (64-bit counters, RFC 2863):
  1.3.6.1.2.1.31.1.1.1.6  ifHCInOctets   - bytes in (64-bit)
  1.3.6.1.2.1.31.1.1.1.10 ifHCOutOctets  - bytes out (64-bit)
  1.3.6.1.2.1.31.1.1.1.15 ifHighSpeed    - speed in Mbps

ip group (1.3.6.1.2.1.4):
  1.3.6.1.2.1.4.1.0    ipForwarding  - routing enabled (1=yes, 2=no)
  1.3.6.1.2.1.4.20     ipAddrTable   - IP address table
  1.3.6.1.2.1.4.21     ipRouteTable  - routing table
  1.3.6.1.2.1.4.3.0    ipInReceives  - incoming IP packets

tcp group (1.3.6.1.2.1.6):
  1.3.6.1.2.1.6.9.0    tcpCurrEstab  - current TCP connections
  1.3.6.1.2.1.6.10.0   tcpInSegs     - incoming TCP segments
  1.3.6.1.2.1.6.11.0   tcpOutSegs    - outgoing TCP segments
```

### The trailing .0 in OIDs

```
.0 at the end of an OID means a scalar object (a single value).
Without .0 it is an object definition or a table entry.

  1.3.6.1.2.1.1.1.0  - sysDescr (one value for the device)
  1.3.6.1.2.1.2.2.1.2.1 - ifDescr for interface with index 1
  1.3.6.1.2.1.2.2.1.2.2 - ifDescr for interface with index 2

In tables the last number is the row index:
  ifTable (1.3.6.1.2.1.2.2)
    ifEntry (1.3.6.1.2.1.2.2.1)
      ifDescr (1.3.6.1.2.1.2.2.1.2)
        ifDescr.1 = "eth0"      (1.3.6.1.2.1.2.2.1.2.1)
        ifDescr.2 = "eth1"      (1.3.6.1.2.1.2.2.1.2.2)
        ifDescr.3 = "lo"        (1.3.6.1.2.1.2.2.1.2.3)
```

---

## MIB - Management Information Base

A MIB is a database that describes all OIDs, their types, values, and structure. MIB files are written in SMI (Structure of Management Information).

### MIB file format

```
-- Example from MIB-II (RFC 1213)
-- File: RFC1213-MIB.txt

RFC1213-MIB DEFINITIONS ::= BEGIN

IMPORTS
    mgmt, NetworkAddress, IpAddress, Counter, Gauge,
    TimeTicks FROM RFC1155-SMI
    OBJECT-TYPE FROM RFC-1212;

-- system group definition
system OBJECT IDENTIFIER ::= { mib-2 1 }

sysDescr OBJECT-TYPE
    SYNTAX  DisplayString (SIZE (0..255))
    ACCESS  read-only
    STATUS  mandatory
    DESCRIPTION
        "A textual description of the entity. This value
        should include the full name and version of the
        hardware, software, and firmware."
    ::= { system 1 }

sysUpTime OBJECT-TYPE
    SYNTAX  TimeTicks
    ACCESS  read-only
    STATUS  mandatory
    DESCRIPTION
        "The time (in hundredths of a second) since the
        network management portion of the system was last
        re-initialized."
    ::= { system 3 }

END
```

### SNMP data types

```
Base types:
  INTEGER       - signed integer (32-bit)
  Integer32     - same (SNMPv2)
  Unsigned32    - unsigned 32-bit
  Counter32     - monotonically increasing counter (32-bit, wraps)
  Counter64     - monotonically increasing counter (64-bit)
  Gauge32       - value that can rise and fall
  TimeTicks     - time in hundredths of a second
  OctetString   - byte string (text, MAC addresses, etc.)
  DisplayString - text string (subtype of OctetString)
  IpAddress     - IPv4 address (4 bytes)
  OBJECT IDENTIFIER - OID
  Bits          - bitmask

Status values:
  ifAdminStatus / ifOperStatus:
    1 = up
    2 = down
    3 = testing
    4 = unknown
    5 = dormant
    6 = notPresent
    7 = lowerLayerDown
```

### Standard MIB files

```
MIB-II (RFC 1213):          Core set - system, interfaces, ip, tcp, udp
IF-MIB (RFC 2863):          64-bit interface counters
HOST-RESOURCES-MIB:         CPU, memory, disk, processes (RFC 2790)
BRIDGE-MIB (RFC 4188):      Switches, MAC tables
Q-BRIDGE-MIB (RFC 4363):    VLANs
OSPF-MIB (RFC 1850):        OSPF routing
BGP4-MIB (RFC 4273):        BGP
MPLS-MIB:                   MPLS
UCD-SNMP-MIB:               Net-SNMP extensions (Linux CPU, disk, processes)
Cisco-specific MIBs:        CISCO-PROCESS-MIB, CISCO-MEMORY-POOL-MIB...
```

```
# MIB file locations
ls /usr/share/snmp/mibs/          # Linux (net-snmp)
ls /usr/share/mibs/               # alternative location

# Download additional MIBs
apt install snmp-mibs-downloader
download-mibs

# Uncomment the following line in /etc/snmp/snmp.conf to load all MIBs:
# mibs +ALL
# or:
echo "mibs +ALL" >> ~/.snmp/snmp.conf
```

---

## Community Strings

A community string is the password for SNMPv1/v2c. It is transmitted in plaintext in every SNMP packet.

### Access types

```
Read-Only (RO) community - read only:
  Typically called "public"
  Allows GET, GETNEXT, GETBULK
  Does NOT allow changing configuration

Read-Write (RW) community - read and write:
  Typically called "private"
  Allows GET and SET
  SET can change device configuration!
  VERY dangerous if accessible from outside

Defaults on almost all devices:
  RO community: "public"
  RW community: "private"
  - this is a major security hole
  - ALWAYS change to strong random strings
```

```
# Example SNMPv2c packet (Wireshark):
# SNMP version: v2c
# Community: public          <- visible in plaintext!
# PDU type: GetRequest
# OID: 1.3.6.1.2.1.1.1.0

# Capture community strings from traffic:
tcpdump -i eth0 -n udp port 161 -A | grep -i "public\|private\|community"
```

### Community String security

```
Problems with SNMPv1/v2c:
  - Community string sent in plaintext in UDP packet
  - No protection against replay attacks
  - No data encryption
  - "public" and "private" are defaults on most devices

Minimum security measures for v1/v2c:
  1. Replace "public" and "private" with random strings
  2. Restrict access by IP (ACL on device and firewall)
  3. Disable RW community if not needed
  4. Use SNMP only in a management VLAN
  5. Block UDP 161/162 at the perimeter

Best solution: migrate to SNMPv3
```

---

## PDU - SNMP operation types

```
PDU (Protocol Data Unit) - the unit of SNMP data.

SNMPv1/v2c PDU types:
  GetRequest      - request specific OIDs
  GetNextRequest  - get the next OID (table traversal)
  GetBulkRequest  - get many OIDs at once (v2c, efficient)
  SetRequest      - set a value
  GetResponse     - agent's reply
  Trap            - notification from agent (v1, no acknowledgement)
  InformRequest   - acknowledged trap (v2c)
  SNMPv2-Trap     - trap in v2c format

GetBulk parameters:
  non-repeaters: how many OIDs to fetch once
  max-repetitions: how many times to repeat for the remaining OIDs
  Used for efficient table reads.
```

```
Operation diagrams:

GET - fetch a specific OID:
  Manager → Agent: GET 1.3.6.1.2.1.1.5.0
  Agent → Manager: sysName = "router01"

GETNEXT - get the next in the tree:
  Manager → Agent: GETNEXT 1.3.6.1.2.1.1
  Agent → Manager: sysDescr.0 = "Cisco IOS..."

  GETNEXT 1.3.6.1.2.1.1.1.0
  → sysObjectID.0 = 1.3.6.1.4.1.9.1.1

  Used to walk the entire tree.

GETBULK - get many OIDs:
  Manager → Agent: GETBULK max-repetitions=10 1.3.6.1.2.1.2.2.1.2
  Agent → Manager: ifDescr.1 = "eth0"
                   ifDescr.2 = "eth1"
                   ifDescr.3 = "lo"
                   ...

SET - change a value:
  Manager → Agent: SET sysName.0 = "new-router01"
  Agent → Manager: OK (or error if no permission)

TRAP - device notification:
  Agent → Manager: Trap "linkDown" ifIndex=2
  (no response required)

INFORM - acknowledged notification:
  Agent → Manager: InformRequest "linkDown"
  Manager → Agent: Response (acknowledgement)
```

---

## SNMPv3 - secure SNMP

### SNMPv3 security models

```
SNMPv3 introduces three security levels:

noAuthNoPriv:
  - No authentication (username only)
  - No encryption
  - No more secure than v2c

authNoPriv:
  - Authentication (HMAC-MD5 or HMAC-SHA)
  - No encryption (data visible on the wire)
  - Protects against packet forgery

authPriv:
  - Authentication + encryption
  - Data is encrypted (DES, AES-128, AES-192, AES-256)
  - Maximum security
  - Use this in production

Authentication algorithms:
  MD5    - deprecated (128-bit)
  SHA-1  - deprecated (160-bit)
  SHA-256 - recommended
  SHA-384, SHA-512 - for high security

Encryption algorithms:
  DES    - deprecated (56-bit)
  AES-128 - minimally acceptable
  AES-192, AES-256 - recommended
```

### Configuring SNMPv3

```
# Net-SNMP agent configuration (Linux)
# /etc/snmp/snmpd.conf

# Create SNMPv3 user
# (run this command while snmpd is STOPPED)
# net-snmp-config --create-snmpv3-user -ro -A "authpass123" -X "privpass456" -a SHA-256 -x AES monuser

# Or add to /var/lib/snmp/snmpd.conf:
createUser monuser SHA-256 "authpass123" AES "privpass456"

# In /etc/snmp/snmpd.conf:
rouser monuser priv         # read-only with authPriv
rwuser adminuser priv       # read-write with authPriv

# Views (what each user can see)
view systemview included .1.3.6.1.2.1.1   # system group only
view allview    included .1               # entire tree

# Grant access to full view
rouser monuser priv -V allview

systemctl restart snmpd
```

```
# SNMPv3 on Cisco IOS:
snmp-server group MON-GROUP v3 priv
snmp-server user monuser MON-GROUP v3 auth sha AuthPass123 priv aes 128 PrivPass456
snmp-server view ALL-VIEW iso included
snmp-server group MON-GROUP v3 priv read ALL-VIEW

# Verify
show snmp user
show snmp group
```

---

## SNMP utilities - practical use

### snmpget

```
# Get a single OID
snmpget -v2c -c public 192.168.1.1 1.3.6.1.2.1.1.1.0
# SNMPv2-MIB::sysDescr.0 = STRING: Cisco IOS Software...

# Use a name instead of OID (if MIBs are loaded)
snmpget -v2c -c public 192.168.1.1 sysDescr.0
snmpget -v2c -c public 192.168.1.1 sysName.0
snmpget -v2c -c public 192.168.1.1 sysUpTime.0

# Multiple OIDs at once
snmpget -v2c -c public 192.168.1.1 sysName.0 sysLocation.0 sysUpTime.0

# SNMPv3
snmpget -v3 -l authPriv -u monuser -a SHA-256 -A "authpass123" \
        -x AES -X "privpass456" 192.168.1.1 sysDescr.0

# Value only (no OID name)
snmpget -v2c -c public -Ov 192.168.1.1 sysName.0
# STRING: router01

# Type and value only
snmpget -v2c -c public -Ovq 192.168.1.1 sysName.0
# router01
```

### snmpwalk

```
# Walk the entire MIB tree
snmpwalk -v2c -c public 192.168.1.1

# Walk a specific branch
snmpwalk -v2c -c public 192.168.1.1 1.3.6.1.2.1.1
snmpwalk -v2c -c public 192.168.1.1 system

# Walk the interface table
snmpwalk -v2c -c public 192.168.1.1 ifDescr
snmpwalk -v2c -c public 192.168.1.1 ifOperStatus
snmpwalk -v2c -c public 192.168.1.1 interfaces

# Show numeric OIDs (no names)
snmpwalk -v2c -c public -On 192.168.1.1 system

# Show values only
snmpwalk -v2c -c public -Ov 192.168.1.1 system

# SNMPv3 walk
snmpwalk -v3 -l authPriv -u monuser -a SHA-256 -A "auth123" \
         -x AES -X "priv456" 192.168.1.1 system
```

### snmpbulkwalk

```
# Efficient table traversal using GetBulk (v2c/v3 only)
snmpbulkwalk -v2c -c public 192.168.1.1 ifTable

# Tune the response size
snmpbulkwalk -v2c -c public -Cr25 192.168.1.1 ifTable
# -Cr25 = max-repetitions=25 (25 OIDs per request)

# Speed comparison:
time snmpwalk    -v2c -c public 192.168.1.1 ifTable
time snmpbulkwalk -v2c -c public 192.168.1.1 ifTable
# bulkwalk is significantly faster on large tables
```

### snmpset

```
# Change a value (requires RW community or SNMPv3 rwuser)
snmpset -v2c -c private 192.168.1.1 sysName.0 s "new-router01"
# s = STRING type

# Data type codes for snmpset:
# i = INTEGER
# u = Unsigned32
# s = STRING (OctetString)
# x = HEX STRING
# d = DECIMAL STRING
# n = NULL
# o = OID
# t = TimeTicks
# a = IpAddress
# b = BITS

# SET examples:
snmpset -v2c -c private 192.168.1.1 sysContact.0 s "admin@company.com"
snmpset -v2c -c private 192.168.1.1 sysLocation.0 s "Server Room A, Rack 3"

# Shut down an interface (ifAdminStatus: 1=up, 2=down)
snmpset -v2c -c private 192.168.1.1 ifAdminStatus.2 i 2
```

### snmptrap and snmptrapd

```
# Send a trap manually (for testing)
snmptrap -v2c -c public 192.168.1.100 "" linkDown.0

# Send an SNMPv3 trap
snmptrap -v3 -l authPriv -u trapuser -a SHA -A "authpass" \
         -x AES -X "privpass" 192.168.1.100 \
         "" linkDown.0 ifIndex i 2

# Run a trap receiver (snmptrapd)
# /etc/snmp/snmptrapd.conf:
authCommunity log,execute,net public
traphandle default /usr/bin/logger

snmptrapd -f -Lo -c /etc/snmp/snmptrapd.conf

# Trap logs
tail -f /var/log/syslog | grep snmptrapd
tail -f /var/log/snmptrapd.log
```

### snmptranslate

```
# Translate OID to name
snmptranslate 1.3.6.1.2.1.1.1.0
# SNMPv2-MIB::sysDescr.0

# Translate name to OID
snmptranslate -On SNMPv2-MIB::sysDescr.0
# .1.3.6.1.2.1.1.1.0

# Detailed object info
snmptranslate -Td SNMPv2-MIB::sysDescr
# SNMPv2-MIB::sysDescr
# sysDescr OBJECT-TYPE
#   SYNTAX DisplayString (SIZE (0..255))
#   ACCESS read-only
#   ...

# Show MIB tree
snmptranslate -Tp 1.3.6.1.2.1.1
```

---

## Practical monitoring examples

### Interface traffic monitoring

```
# Step 1 - find interface indexes
snmpwalk -v2c -c public 192.168.1.1 ifDescr
# IF-MIB::ifDescr.1 = STRING: eth0
# IF-MIB::ifDescr.2 = STRING: eth1

# Step 2 - get counters for interface 1
snmpget -v2c -c public 192.168.1.1 \
    ifHCInOctets.1 ifHCOutOctets.1 ifHighSpeed.1 ifOperStatus.1

# Step 3 - calculate throughput (two samples with interval)
T1_IN=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifHCInOctets.1)
sleep 60
T2_IN=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifHCInOctets.1)
BPS=$(( (T2_IN - T1_IN) * 8 / 60 ))
echo "Inbound traffic: $BPS bits/sec"

# Script to check all interfaces
snmpwalk -v2c -c public -Ovq 192.168.1.1 ifDescr | nl | while read i name; do
  status=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifOperStatus.$i 2>/dev/null)
  [ "$status" = "1" ] && status="UP" || status="DOWN"
  echo "$i: $name - $status"
done
```

### Server resource monitoring (HOST-RESOURCES-MIB)

```
# CPU load (UCD-SNMP-MIB)
snmpget -v2c -c public 192.168.1.10 \
    UCD-SNMP-MIB::ssCpuUser.0 \
    UCD-SNMP-MIB::ssCpuSystem.0 \
    UCD-SNMP-MIB::ssCpuIdle.0

# Via OID directly:
# 1.3.6.1.4.1.2021.11.9.0  - CPU user %
# 1.3.6.1.4.1.2021.11.10.0 - CPU system %
# 1.3.6.1.4.1.2021.11.11.0 - CPU idle %

# Memory (HOST-RESOURCES-MIB)
snmpwalk -v2c -c public 192.168.1.10 hrStorage
# hrStorageDescr.1 = STRING: Physical memory
# hrStorageSize.1 = INTEGER: 4096000   (KB)
# hrStorageUsed.1 = INTEGER: 2048000   (KB)

# Processes
snmpwalk -v2c -c public 192.168.1.10 hrSWRunName
# hrSWRunName.1 = STRING: systemd
# hrSWRunName.2 = STRING: nginx
# ...

# Disk
snmpwalk -v2c -c public 192.168.1.10 dskTable
# UCD-SNMP-MIB::dskPath.1 = STRING: /
# UCD-SNMP-MIB::dskTotal.1 = INTEGER: 51200000
# UCD-SNMP-MIB::dskAvail.1 = INTEGER: 30720000
# UCD-SNMP-MIB::dskPercent.1 = INTEGER: 40
```

### Cisco device monitoring

```
# Cisco CPU (CISCO-PROCESS-MIB)
snmpget -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.109.1.1.1.1.8.1    # 5-minute CPU average

# Cisco memory
snmpget -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.48.1.1.1.5.1       # used memory
    1.3.6.1.4.1.9.9.48.1.1.1.6.1       # free memory

# Cisco temperature
snmpwalk -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.13.1.3             # ciscoEnvMonTemperatureTable

# Cisco interfaces with descriptions
snmpwalk -v2c -c public cisco-router ifAlias
# IF-MIB::ifAlias.1 = STRING: "Uplink to Core Switch"
```

---

## snmpd configuration (Linux agent)

```
# /etc/snmp/snmpd.conf - minimal secure configuration

# SNMPv2c read-only (specific IPs only)
rocommunity mys3cur3str 127.0.0.1
rocommunity mys3cur3str 10.0.0.0/24    # monitoring network

# Disable default "public"
# (remove or comment out any line containing public)

# SNMPv3 user (added via createUser in /var/lib/snmp/snmpd.conf)
rouser monitorv3 priv

# Define views (what is visible)
view systemonly included .1.3.6.1.2.1.1   # system group only
view all        included .1               # everything

# Grant full view access
rouser monitorv3 priv -V all

# Extend with custom scripts
extend uptime   /bin/cat /proc/uptime
extend loadavg  /bin/cat /proc/loadavg

# Trap destination
trap2sink 10.0.0.5 community_string

# System info
sysLocation "Server Room, Rack 5, Unit 3"
sysContact "ops@company.com"
```

```
# Validate the configuration
snmpd -f -Lo -C -c /etc/snmp/snmpd.conf

# Start
systemctl start snmpd
systemctl enable snmpd

# Verify it's listening
ss -ulnp | grep 161

# Test locally
snmpget -v2c -c mys3cur3str localhost sysName.0
snmpwalk -v2c -c mys3cur3str localhost system
```

---

## Diagnosing SNMP problems

```
Problem: no response to SNMP request

Step 1 - check port 161 is reachable
  nc -uzv 192.168.1.1 161
  # Connection to 192.168.1.1 161 port [udp/snmp] succeeded

  # Note: UDP has no explicit "refused" (unlike TCP)
  # You can only detect a response or its absence

Step 2 - capture traffic
  tcpdump -i eth0 -n udp port 161
  # Do we see both request and response?

Step 3 - check the community string
  snmpget -v2c -c public 192.168.1.1 sysDescr.0
  # Error: Timeout (No Response)
  # Try other strings: public, private, community, snmp

Step 4 - check ACL on the device
  # Cisco:
  show snmp community
  show ip access-list SNMP-ACL

  # Linux snmpd:
  grep -i "com2sec\|rocommunity\|rwcommunity" /etc/snmp/snmpd.conf

Step 5 - check firewall
  # Linux iptables:
  iptables -L INPUT -n | grep 161
  # There should be a rule allowing UDP 161 from the monitoring IP

Step 6 - verify snmpd is running
  systemctl status snmpd
  ss -ulnp | grep 161
```

```
Problem: OID returns "No Such Object"
  - OID doesn't exist on this device
  - MIB file not loaded
  - Incorrect OID syntax

  Diagnose:
  snmpwalk -v2c -c public device .1.3.6.1.2.1  # what is available?
  snmptranslate -Td OID-name                    # check OID in MIB

Problem: Counter32 wraps around
  - On 100Mbit+ interfaces Counter32 wraps in minutes
  - Use Counter64: ifHCInOctets / ifHCOutOctets

  snmpget -v2c -c public device ifHCInOctets.1
  # requires SNMPv2c or v3
```

---

## Cheat sheet

```
Ports:
  UDP 161 - SNMP agent (requests)
  UDP 162 - SNMP trap receiver (notifications)

Versions:
  v1  - obsolete, no Counter64
  v2c - most common, has Counter64 and GetBulk
  v3  - secure, authentication + encryption

Community strings (v1/v2c):
  Defaults: public (RO), private (RW) - ALWAYS change!
  Sent in plaintext - restrict by IP

SNMPv3 security levels:
  noAuthNoPriv - username only
  authNoPriv   - +authentication (SHA-256)
  authPriv     - +encryption (AES-256) - use this!

Operations:
  GET      - fetch a specific OID
  GETNEXT  - next OID in the tree (tree traversal)
  GETBULK  - many OIDs at once (efficient, v2c/v3)
  SET      - change a value (requires RW access)
  TRAP     - device notification (no acknowledgement)
  INFORM   - acknowledged notification (v2c/v3)

Key OIDs:
  1.3.6.1.2.1.1.1.0  sysDescr     - device description
  1.3.6.1.2.1.1.3.0  sysUpTime    - uptime
  1.3.6.1.2.1.1.5.0  sysName      - hostname
  1.3.6.1.2.1.2.2.1.2.N ifDescr   - interface N name
  1.3.6.1.2.1.2.2.1.8.N ifOperStatus - interface N status
  1.3.6.1.2.1.31.1.1.1.6.N  ifHCInOctets  - inbound traffic (64-bit)
  1.3.6.1.2.1.31.1.1.1.10.N ifHCOutOctets - outbound traffic (64-bit)

Commands:
  snmpget  -v2c -c public host OID          - get OID
  snmpwalk -v2c -c public host OID          - walk branch
  snmpbulkwalk -v2c -c public host OID      - fast walk
  snmpset  -v2c -c private host OID t val   - set value
  snmptranslate OID                         - name <-> OID
  snmpwalk -v2c -c public -On host system   - print numeric OIDs

SNMPv3 flags:
  -v3 -l authPriv -u USER -a SHA-256 -A "authpass" -x AES -X "privpass"
```

---

## References

- [RFC 1157](https://www.rfc-editor.org/rfc/rfc1157) - SNMPv1
- [RFC 1901](https://www.rfc-editor.org/rfc/rfc1901) - SNMPv2c
- [RFC 3411](https://www.rfc-editor.org/rfc/rfc3411) - SNMPv3 Architecture
- [RFC 3414](https://www.rfc-editor.org/rfc/rfc3414) - SNMPv3 User-based Security Model
- [RFC 1213](https://www.rfc-editor.org/rfc/rfc1213) - MIB-II
- [RFC 2863](https://www.rfc-editor.org/rfc/rfc2863) - IF-MIB (64-bit counters)
- [RFC 2790](https://www.rfc-editor.org/rfc/rfc2790) - HOST-RESOURCES-MIB
- [Net-SNMP](http://www.net-snmp.org) - documentation and utilities
- [OID Repository](https://oidref.com) - OID lookup
- [LibreNMS](https://www.librenms.org) - open-source SNMP monitoring
