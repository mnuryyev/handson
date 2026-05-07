---
title: "VPN - IPSec, OpenVPN, WireGuard"
date: "2026-05-07"
---

VPN (Virtual Private Network) - technology for creating an encrypted tunnel over a public network. Traffic between client and server is encrypted, and the source IP address is hidden from the destination.

Three main protocols: IPSec (the standard for site-to-site and enterprise VPNs), OpenVPN (flexible, SSL/TLS-based), WireGuard (modern, minimalist, high performance).

---

## Why VPN

    VPN solves several problems:

    Traffic confidentiality:
      ISP / Wi-Fi access point sees only encrypted traffic.
      Real client IP is hidden from websites and services.

    Secure remote access:
      Employee from home connects to corporate network.
      Acts as if in the office - all internal resources are accessible.

    Bypassing restrictions:
      Geo-blocks, censorship, firewalls.

    Site-to-site connection:
      Connecting two office networks over the internet.
      Traffic between offices goes through an encrypted tunnel.

    Without VPN (open network):
      Cafe Wi-Fi - traffic interception (MITM).
      ISP - logging all requests.
      Corporate proxy - deep packet inspection.

    VPN models:
      Client-to-Site (Remote Access VPN) - one client connects to a network.
      Site-to-Site (LAN-to-LAN VPN) - two networks joined via a tunnel.
      Mesh VPN (fully connected network) - each node connected to every other directly.

---

## IPSec

IPSec (Internet Protocol Security, RFC 4301) - a suite of protocols for protecting IP traffic at the network layer (L3). The standard for enterprise VPNs, supported in every modern router.

    IPSec consists of:
      IKE (Internet Key Exchange) - negotiating parameters and exchanging keys.
      AH (Authentication Header) - authentication and integrity (no encryption).
      ESP (Encapsulating Security Payload) - encryption + authentication + integrity.

    In practice ESP is used (AH does not encrypt and breaks NAT).

### IPSec Modes

    Transport Mode:
      Only the IP packet payload (data) is encrypted.
      Original IP header is untouched.
      Use case: host-to-host connection (two specific hosts).

      [IP header][ESP header][TCP/UDP + data][ESP trailer]
       ^^^^^^^^^^ not encrypted  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ encrypted

    Tunnel Mode:
      The entire original IP packet is placed inside a new ESP packet.
      A new outer IP header is added (VPN gateway addresses).
      Use case: site-to-site and remote access VPN.

      [Outer IP][ESP header][Original IP + TCP/UDP + data][ESP trailer]
       ^^^^^^^^^^ not encrypted  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ encrypted

    Site-to-site example:
      Office A (192.168.1.0/24) ←→ VPN GW A (1.1.1.1)
                                    ~~~~~~~~~~ tunnel ~~~~~~~~~~
                                    VPN GW B (2.2.2.2) ←→ Office B (10.0.0.0/24)

      Packet from 192.168.1.5 to 10.0.0.7:
        Original: [src:192.168.1.5 dst:10.0.0.7][TCP][data]
        After IPSec: [src:1.1.1.1 dst:2.2.2.2][ESP][encrypted...]

### IKE - Key Exchange

    IKE (RFC 7296) runs on UDP port 500 (and UDP 4500 behind NAT).
    Two phases:

    Phase 1 (IKE SA - Security Association):
      Establishes a secure channel between the two nodes.
      Negotiates parameters: encryption algorithm, hash, DH group.
      Authentication: Pre-Shared Key (PSK) or X.509 certificates.
      Result: IKE SA - an encrypted channel for Phase 2.

    Phase 2 (IPSec SA / Child SA):
      Over the Phase 1 secure channel, tunnel parameters are negotiated.
      ESP algorithms and data encryption keys are selected.
      Traffic selectors define which traffic goes into the tunnel.
      Result: IPSec SA - two unidirectional SAs (inbound + outbound).

    IKEv1 vs IKEv2:
      IKEv1: main mode (6 packets) or aggressive mode (3 packets).
      IKEv2: always 4 packets, simpler, built-in mobility (MOBIKE).
      IKEv2 supports EAP authentication (username/password).
      IKEv2 - modern standard, IKEv1 - deprecated.

    IKE parameters (example):
      Encryption: AES-256-CBC or AES-256-GCM
      Integrity:  SHA-256 or SHA-384
      PRF:        PRF-HMAC-SHA-256
      DH Group:   Group 14 (2048-bit MODP) or Group 19 (256-bit ECP)
      Lifetime:   28800 seconds (8 hours) for IKE SA
                  3600 seconds (1 hour) for IPSec SA

### Security Association (SA)

    SA (Security Association) - a unidirectional agreement on protection parameters.
    A bidirectional connection requires two SAs.

    SA contains:
      SPI (Security Parameter Index) - 32-bit SA identifier
      Destination IP address
      Protocol (AH or ESP)
      Encryption and authentication algorithms
      Keys
      Lifetime
      Sequence Number counter

    SAD (Security Association Database) - database of all active SAs on the node.
    SPD (Security Policy Database) - rules: which traffic to process with IPSec.

    # View active SAs (Linux)
    ip xfrm state     # SA database
    ip xfrm policy    # SPD - policies
    ip xfrm monitor   # watch for changes

    # IPSec statistics
    ip -s xfrm state

### ESP - Encapsulating Security Payload

    ESP header (RFC 4303):
      SPI (32 bit) - which SA to use
      Sequence Number (32 bit) - replay attack protection
      Payload (variable) - encrypted data
      Padding - alignment
      Pad Length - padding length
      Next Header - type of next header (TCP=6, UDP=17, IP=4)
      ICV (Integrity Check Value) - authentication tag (HMAC or GCM tag)

    ESP algorithms (modern recommendations):
      AES-256-GCM (AEAD)    - encryption + authentication in one algorithm
      AES-128-GCM (AEAD)    - faster, still secure enough
      ChaCha20-Poly1305     - without AES-NI (mobile devices)
      AES-256-CBC + SHA-256 - deprecated combined mode

    # Deprecated (do not use):
    # DES, 3DES - weak
    # MD5 HMAC  - broken
    # NULL encryption - no confidentiality

### NAT-T (NAT Traversal)

    IPSec behind NAT: problem is that ESP (IP protocol 50) has no ports.
    NAT device cannot translate ESP - tunnel fails to establish.

    NAT-T solution (RFC 3948):
      IKE detects NAT (NAT-Detection payloads in IKE).
      ESP is encapsulated in UDP:4500.
      NAT can translate UDP - ESP passes through.

      Without NAT:  [IP][ESP][data]
      With NAT-T:   [IP][UDP:4500][ESP][data]

    Keepalive:
      Behind NAT, packets must be sent periodically to prevent NAT table expiry.
      IKE keepalive: NAT-keepalive UDP packet every 20 seconds.
      strongSwan setting: nat_keepalive = 20s

### IPSec Setup (strongSwan)

    # Install
    apt install strongswan strongswan-pki    # Debian/Ubuntu
    dnf install strongswan                   # Fedora/RHEL

    # Configuration /etc/ipsec.conf (legacy style)
    config setup
        charondebug="ike 2, knl 2, cfg 2"   # log level

    conn site-to-site
        type=tunnel
        authby=secret              # PSK authentication
        left=1.1.1.1               # local address
        leftsubnet=192.168.1.0/24  # local network
        right=2.2.2.2              # remote address
        rightsubnet=10.0.0.0/24    # remote network
        ike=aes256-sha256-modp2048 # IKE parameters
        esp=aes256gcm16-modp2048   # ESP parameters
        keyexchange=ikev2
        auto=start                 # bring up at boot

    # PSK key /etc/ipsec.secrets
    1.1.1.1 2.2.2.2 : PSK "secret-key-at-least-20-characters"

    # swanctl.conf configuration (new IKEv2 style)
    connections {
        vpn-site {
            version = 2
            local_addrs  = 1.1.1.1
            remote_addrs = 2.2.2.2
            local {
                auth = psk
                id = 1.1.1.1
            }
            remote {
                auth = psk
                id = 2.2.2.2
            }
            proposals = aes256gcm16-sha256-modp2048
            children {
                net-net {
                    local_ts  = 192.168.1.0/24
                    remote_ts = 10.0.0.0/24
                    esp_proposals = aes256gcm16-modp2048
                    start_action = start
                }
            }
        }
    }

    secrets {
        ike-vpn {
            id-local  = 1.1.1.1
            id-remote = 2.2.2.2
            secret = "secret-key-at-least-20-characters"
        }
    }

    # Management
    ipsec start             # start
    ipsec status            # connection status
    ipsec statusall         # detailed status
    ipsec up site-to-site   # bring up connection
    ipsec down site-to-site # bring down
    ipsec reload            # reload config
    swanctl --load-all      # load swanctl config
    swanctl --list-sas      # active SAs
    swanctl --initiate --child net-net  # initiate

    # Diagnostics
    ipsec statusall         # status + counters
    ip xfrm state           # kernel: active SAs
    ip xfrm policy          # kernel: policies
    journalctl -u strongswan -f  # live logs

### IPSec with Certificates (PKI)

    # Generate CA
    pki --gen --type rsa --size 4096 --outform pem > ca-key.pem
    pki --self --ca --lifetime 3650 --in ca-key.pem \
        --dn "CN=VPN CA" --outform pem > ca-cert.pem

    # Generate server certificate
    pki --gen --type rsa --size 2048 --outform pem > server-key.pem
    pki --issue --lifetime 730 \
        --cacert ca-cert.pem --cakey ca-key.pem \
        --dn "CN=vpn.example.com" \
        --san vpn.example.com \
        --flag serverAuth --flag ikeIntermediate \
        --outform pem < server-key.pem > server-cert.pem

    # Generate client certificate
    pki --gen --type rsa --size 2048 --outform pem > client-key.pem
    pki --issue --lifetime 730 \
        --cacert ca-cert.pem --cakey ca-key.pem \
        --dn "CN=client1" \
        --flag clientAuth \
        --outform pem < client-key.pem > client-cert.pem

    # strongSwan config with certificates
    connections {
        ikev2-cert {
            version = 2
            local_addrs = 0.0.0.0
            remote_addrs = %any
            local {
                auth = pubkey
                certs = server-cert.pem
                id = vpn.example.com
            }
            remote {
                auth = pubkey
                id = %any
            }
            pools = vpn-pool
            children {
                vpn {
                    local_ts = 0.0.0.0/0
                    esp_proposals = aes256gcm16-sha256-x25519
                }
            }
        }
    }

    pools {
        vpn-pool {
            addrs = 10.100.0.0/24
            dns = 8.8.8.8
        }
    }

---

## OpenVPN

OpenVPN - a VPN solution based on TLS/SSL. Runs in user space, requires no kernel support. Very flexible: TCP or UDP, any port, proxy support.

    Protocol versions:
      OpenVPN 2.x - classic, TLS 1.0+, widely supported.
      OpenVPN 3.x - rewritten, TLS 1.2+ only, improved security.
      OpenVPN Access Server - commercial version with web GUI.

    Default port: UDP 1194 (or TCP 443 to bypass firewalls).

### OpenVPN Architecture

    OpenVPN creates a virtual network interface:
      tun0 - Layer 3 (IP tunnel) - packet routing
      tap0 - Layer 2 (Ethernet tunnel) - network bridging

    tun (most common):
      Each packet is an IP packet.
      Suitable for remote access VPN.
      Client receives an IP address from the VPN pool.

    tap (rare):
      Each frame is an Ethernet frame.
      Suitable for site-to-site bridge connections.
      Client becomes part of the L2 network.

    Data flow:
      Application → kernel → tun interface → OpenVPN process →
      TLS encryption → UDP/TCP socket → internet →
      VPN server → TLS decryption → tun interface → routing

### TLS in OpenVPN

    OpenVPN uses TLS for:
      Authentication (X.509 certificates or PSK)
      Session key negotiation
      Control channel protection

    Two channels:
      Control Channel  - TLS: authentication, key exchange, management.
      Data Channel     - encrypted data (AES-GCM or AES-CBC + HMAC).

    Data channel keys are generated via TLS and rotated every N seconds.

    tls-auth (HMAC signature of packets):
      Additional key for HMAC signing all TLS packets.
      DoS protection: packets without correct signature dropped before TLS.
      openvpn --genkey secret ta.key

    tls-crypt (control channel encryption):
      Improvement over tls-auth: control channel is fully encrypted.
      Hides the fact that OpenVPN is being used (against DPI).
      openvpn --genkey tls-crypt-v2-server server.pem

### OpenVPN Server Setup

    # Install
    apt install openvpn easy-rsa    # Debian/Ubuntu
    dnf install openvpn easy-rsa   # Fedora/RHEL

    # Create PKI with easy-rsa
    make-cadir /etc/openvpn/easy-rsa
    cd /etc/openvpn/easy-rsa

    # Initialize
    ./easyrsa init-pki

    # Create CA
    ./easyrsa build-ca nopass
    # Enter Common Name: e.g. "OpenVPN CA"

    # Server certificate
    ./easyrsa gen-req server nopass
    ./easyrsa sign-req server server

    # Client certificate
    ./easyrsa gen-req client1 nopass
    ./easyrsa sign-req client client1

    # Diffie-Hellman parameters (OpenVPN 2.x only)
    ./easyrsa gen-dh

    # HMAC key
    openvpn --genkey secret /etc/openvpn/ta.key

    # Server configuration /etc/openvpn/server.conf
    port 1194
    proto udp
    dev tun

    ca   /etc/openvpn/easy-rsa/pki/ca.crt
    cert /etc/openvpn/easy-rsa/pki/issued/server.crt
    key  /etc/openvpn/easy-rsa/pki/private/server.key
    dh   /etc/openvpn/easy-rsa/pki/dh.pem

    server 10.8.0.0 255.255.255.0    # VPN address pool

    # Route all traffic through VPN
    push "redirect-gateway def1 bypass-dhcp"
    push "dhcp-option DNS 8.8.8.8"
    push "dhcp-option DNS 8.8.4.4"

    keepalive 10 120
    tls-auth /etc/openvpn/ta.key 0   # 0 = server, 1 = client
    key-direction 0

    cipher AES-256-GCM
    auth SHA256
    ncp-ciphers AES-256-GCM:AES-128-GCM   # cipher negotiation

    user nobody
    group nogroup
    persist-key
    persist-tun

    status /var/log/openvpn/status.log
    log-append /var/log/openvpn/openvpn.log
    verb 3

    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # NAT (for VPN clients to access internet through server)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

    # Start
    systemctl enable --now openvpn@server
    systemctl status openvpn@server

### OpenVPN Client Setup

    # Client configuration client.ovpn
    client
    dev tun
    proto udp
    remote vpn.example.com 1194

    resolv-retry infinite
    nobind
    persist-key
    persist-tun

    ca   ca.crt
    cert client1.crt
    key  client1.key

    tls-auth ta.key 1   # 1 = client
    key-direction 1

    cipher AES-256-GCM
    auth SHA256
    verb 3

    # Inline certificates (everything in one .ovpn file)
    <ca>
    -----BEGIN CERTIFICATE-----
    (ca.crt contents)
    -----END CERTIFICATE-----
    </ca>

    <cert>
    -----BEGIN CERTIFICATE-----
    (client1.crt contents)
    -----END CERTIFICATE-----
    </cert>

    <key>
    -----BEGIN PRIVATE KEY-----
    (client1.key contents)
    -----END PRIVATE KEY-----
    </key>

    <tls-auth>
    (ta.key contents)
    </tls-auth>
    key-direction 1

    # Connect
    openvpn --config client.ovpn                  # in terminal
    openvpn3 session-start --config client.ovpn   # via OpenVPN 3

    # Verify connection
    ip addr show tun0          # VPN IP
    ip route                   # routing table
    curl ifconfig.me           # external IP (should be server's IP)

### Client Management Scripts

    # Revoke client certificate
    cd /etc/openvpn/easy-rsa
    ./easyrsa revoke client1
    ./easyrsa gen-crl
    cp pki/crl.pem /etc/openvpn/

    # Add to server config
    # crl-verify /etc/openvpn/crl.pem

    systemctl reload openvpn@server

    # View connected clients
    cat /var/log/openvpn/status.log

    # Script to create a client
    #!/bin/bash
    CLIENT=$1
    cd /etc/openvpn/easy-rsa
    ./easyrsa gen-req $CLIENT nopass
    ./easyrsa sign-req client $CLIENT
    # Build .ovpn file
    cat > /tmp/$CLIENT.ovpn <<EOF
    client
    dev tun
    proto udp
    remote vpn.example.com 1194
    ...
    EOF
    cat pki/ca.crt >> /tmp/$CLIENT.ovpn
    # etc.

### OpenVPN Diagnostics

    # Live logs
    journalctl -u openvpn@server -f

    # Verbose mode in config
    verb 6    # 0-9, 3 is default, 6 is verbose

    # Check port
    ss -ulnp | grep 1194          # UDP socket
    nmap -sU -p 1194 localhost    # check from outside

    # Test TLS handshake
    openssl s_client -connect vpn.example.com:1194

    # Traffic monitoring
    tcpdump -i eth0 -n 'udp port 1194'

    # Common issues:
    # "TLS Error: TLS handshake failed" - tls-auth key mismatch
    #   or certificate issue. Check ca.crt and ta.key.
    # "VERIFY ERROR: depth=0, error=certificate has expired"
    #   - expired certificate. Reissue via easyrsa.
    # "Connection timed out" - UDP blocked by firewall.
    #   Switch to TCP 443: proto tcp / port 443.
    # "Initialization Sequence Completed" - successful connection.

---

## WireGuard

WireGuard - a modern VPN protocol developed by Jason Donenfeld. Included in the Linux kernel starting from version 5.6 (March 2020). About 4,000 lines of code versus ~70,000 for OpenVPN.

    Key features:
      Built into the Linux kernel (no user space process for data).
      UDP only (no TCP mode).
      Cryptography is fixed (no cipher negotiation).
      Roaming: peer IP can change without dropping the tunnel.
      Stealth: no response to unauthenticated packets.

    WireGuard cryptography (fixed):
      Key exchange:   Curve25519 (ECDH)
      Encryption:     ChaCha20-Poly1305 (AEAD)
      Hashing:        BLAKE2s
      Handshake:      Noise Protocol Framework (IKpsk2)
      Timestamp:      TAI64N (replay protection)

### WireGuard Key Model

    Each node has a key pair:
      Private key - secret, 32 bytes
      Public key  - derived from private, 32 bytes, shared with peers

    Peer - a remote node.
    Each peer is identified by its public key.
    Peer list is stored in the configuration.

    Pre-shared key (PSK):
      Optional additional symmetric key.
      Protection against quantum attacks (post-quantum).
      One PSK per pair of nodes.

    # Generate keys
    wg genkey | tee private.key | wg pubkey > public.key
    cat private.key   # private key - keep secret
    cat public.key    # public key - share with peers

    # Generate pre-shared key
    wg genpsk > psk.key

### WireGuard Handshake (Noise IKpsk2)

    WireGuard uses the Noise Protocol Framework, IKpsk2 pattern.
    Handshake takes 1 RTT (two messages).

    Initiator                              Responder
        │                                      │
        │──── Initiation (msg1) ──────────────►│
        │     - Ephemeral public key (Eph_I)   │
        │     - Static public key encrypted    │
        │     - Timestamp encrypted            │
        │     - MAC1, MAC2                     │
        │                                      │
        │◄─── Response (msg2) ─────────────────│
        │     - Ephemeral public key (Eph_R)   │
        │     - Empty (confirmation)           │
        │     - MAC1, MAC2                     │
        │                                      │
        │═══════════ Data (encrypted) ═════════│

    Key derivation (simplified):
      DH operations used:
        DH(Eph_I, Eph_R)    - ephemeral keys of both parties
        DH(Eph_I, Static_R) - initiator ephemeral + responder static
        DH(Static_I, Eph_R) - initiator static + responder ephemeral
        + PSK if set
      Result: two symmetric keys (send_key, recv_key).
      Rotation: new handshake every 3 minutes (or every 2^64 packets).

    Replay Protection:
      Each packet has a counter (nonce).
      Receiving side tracks a sliding window of counters.
      Duplicates and old packets are dropped.

### WireGuard Server Setup

    # Install
    apt install wireguard    # Debian/Ubuntu
    dnf install wireguard-tools   # Fedora/RHEL
    # Linux 5.6+ - built in, older - needs wireguard-dkms module

    # Generate server keys
    cd /etc/wireguard
    wg genkey | tee server_private.key | wg pubkey > server_public.key
    chmod 600 server_private.key

    # Server configuration /etc/wireguard/wg0.conf
    [Interface]
    PrivateKey = <contents of server_private.key>
    Address = 10.0.0.1/24          # server IP in VPN network
    ListenPort = 51820             # UDP port

    # DNS (optional)
    # DNS = 8.8.8.8

    # IP forwarding + NAT (for internet access)
    PostUp   = iptables -A FORWARD -i %i -j ACCEPT; \
               iptables -A FORWARD -o %i -j ACCEPT; \
               iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    PreDown  = iptables -D FORWARD -i %i -j ACCEPT; \
               iptables -D FORWARD -o %i -j ACCEPT; \
               iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

    # Client 1
    [Peer]
    PublicKey = <client 1 public key>
    AllowedIPs = 10.0.0.2/32      # only this IP is allowed from this peer
    # PresharedKey = <PSK> (optional)

    # Client 2
    [Peer]
    PublicKey = <client 2 public key>
    AllowedIPs = 10.0.0.3/32
    PersistentKeepalive = 25      # keepalive through NAT

    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # Start
    wg-quick up wg0            # bring up interface
    systemctl enable --now wg-quick@wg0   # autostart

    # Management
    wg show                    # status of all interfaces
    wg show wg0                # status of specific interface
    wg-quick down wg0          # bring down interface
    wg-quick up wg0            # bring up interface

    # Add peer without restart
    wg set wg0 peer <pubkey> allowed-ips 10.0.0.4/32
    wg-quick save wg0          # save to config

### WireGuard Client Setup

    # Generate client keys
    wg genkey | tee client_private.key | wg pubkey > client_public.key

    # Client configuration /etc/wireguard/wg0.conf
    [Interface]
    PrivateKey = <contents of client_private.key>
    Address = 10.0.0.2/24         # client IP in VPN network
    DNS = 8.8.8.8                 # DNS via VPN

    [Peer]
    PublicKey = <server public key>
    Endpoint = vpn.example.com:51820   # server address
    AllowedIPs = 0.0.0.0/0            # all traffic through VPN
    # AllowedIPs = 10.0.0.0/24        # only VPN traffic (split tunnel)
    PersistentKeepalive = 25          # keepalive (needed behind NAT)

    # Connect
    wg-quick up wg0

    # Verify
    wg show                    # should show handshake time
    ping 10.0.0.1              # ping server
    curl ifconfig.me           # external IP = server IP

    # AllowedIPs - both routing and filtering:
    #   Outbound: packets destined for IPs in AllowedIPs go into tunnel.
    #   Inbound: only packets from IPs in AllowedIPs are accepted from peer.

### Mesh VPN with WireGuard

    WireGuard is natively peer-to-peer: every node can communicate directly.

    Topology:
      Node A (10.0.0.1) ←→ Node B (10.0.0.2)
                        ←→ Node C (10.0.0.3)
      Node B            ←→ Node C

    Each node knows the public keys of all others.

    Mesh automation:
      Tailscale  - managed WireGuard mesh (coordinator in the cloud).
      Headscale  - self-hosted replacement for Tailscale coordinator.
      Netbird    - self-hosted WireGuard mesh with web UI.
      innernet   - CLI-based WireGuard mesh.

    # Example 3-node mesh on Node A:
    [Interface]
    PrivateKey = <privkey_A>
    Address = 10.0.0.1/24
    ListenPort = 51820

    [Peer]  # Node B
    PublicKey = <pubkey_B>
    AllowedIPs = 10.0.0.2/32
    Endpoint = b.example.com:51820

    [Peer]  # Node C
    PublicKey = <pubkey_C>
    AllowedIPs = 10.0.0.3/32
    Endpoint = c.example.com:51820

### WireGuard Diagnostics

    # Status and statistics
    wg show wg0
    # interface: wg0
    #   public key: ...
    #   listening port: 51820
    #
    # peer: <pubkey>
    #   endpoint: 1.2.3.4:51820
    #   allowed ips: 10.0.0.2/32
    #   latest handshake: 30 seconds ago   ← connected
    #   transfer: 1.20 MiB received, 3.45 MiB sent

    # If "latest handshake" is empty - no connection.

    # Check routes
    ip route show table main
    ip route show table 51820   # wg-quick creates a separate table

    # Check firewall
    iptables -L FORWARD -n -v   # FORWARD chain

    # Packet capture
    tcpdump -i eth0 -n 'udp port 51820'

    # Kernel logs
    dmesg | grep wireguard

    # Common issues:
    # No handshake - check:
    #   1. UDP 51820 open on server firewall
    #   2. Correct server public key on client
    #   3. Correct Endpoint (server IP:port)
    #   4. AllowedIPs includes required addresses

    # Handshake exists, no traffic:
    #   1. ip_forward enabled on server?
    #   2. iptables FORWARD allows traffic?
    #   3. NAT configured?
    #   4. Route to client network on server?

---

## Comparison: IPSec vs OpenVPN vs WireGuard

                    IPSec               OpenVPN             WireGuard
    ──────────────────────────────────────────────────────────────────────
    OSI Layer       L3 (kernel)         L3/L2 (user space)  L3 (kernel)
    Transport       ESP/UDP             UDP/TCP             UDP only
    Standard        IETF RFC            OpenVPN Inc.        Kernel/RFC
    Code (lines)    complex             ~70,000             ~4,000
    Linux kernel    yes                 no (tun/tap)        from 5.6 (2020)
    Performance     high                medium              very high
    Latency         low                 medium              very low
    Auth            PSK / X.509 / EAP   X.509 / PSK         public keys
    Crypto          configurable        configurable        fixed
    NAT issues      yes (NAT-T)         no                  no
    Roaming         limited (MOBIKE)    no                  yes (built-in)
    DPI evasion     difficult           TCP 443 (tricky)    difficult
    Mobile OS       native support      app needed          native (iOS/Android)
    Complexity      high                medium              low
    Debugging       hard                moderate            easy
    Support         everywhere          widely              growing

    When to choose IPSec:
      - Site-to-site between enterprise routers (Cisco, Juniper...).
      - Native support on all platforms without extra software.
      - Compliance required (FIPS, Common Criteria).
      - Integration with existing PKI infrastructure.

    When to choose OpenVPN:
      - TCP mode needed (bypass strict firewalls, proxies).
      - Many clients, need flexible config distribution (.ovpn).
      - Username/password authentication needed (plugin-based).
      - Wide compatibility (Windows XP and above).

    When to choose WireGuard:
      - Maximum performance.
      - Simplicity of setup and maintenance.
      - Mobile clients with frequent IP changes.
      - Mesh network (Tailscale, Netbird).
      - New project without legacy constraints.

---

## Performance and Testing

    # Throughput test with iperf3
    # On server:
    iperf3 -s

    # On client (through VPN):
    iperf3 -c 10.0.0.1 -t 30           # TCP test 30 seconds
    iperf3 -c 10.0.0.1 -u -b 1G        # UDP test

    # Typical results (hardware dependent):
    # WireGuard:  ~3-10 Gbps (with or without AES-NI)
    # IPSec ESP:  ~1-5 Gbps (in kernel)
    # OpenVPN:    ~200-600 Mbps (user space)

    # Monitor CPU during VPN traffic
    mpstat -P ALL 1    # per core
    perf top           # hot functions

    # MTU sizes:
    # Physical MTU: 1500 bytes (Ethernet)
    # IPSec overhead:  ~50-60 bytes → tunnel MTU ~1440
    # OpenVPN overhead: ~35-50 bytes → MTU ~1450
    # WireGuard overhead: 60 bytes (IPv4) / 80 bytes (IPv6) → MTU ~1420

    # Set MTU for WireGuard
    [Interface]
    MTU = 1420   # add to wg0.conf

    # For OpenVPN
    tun-mtu 1420
    fragment 1300
    mssfix 1300

---

## VPN Security

### General Principles

    Perfect Forward Secrecy (PFS):
      Compromising long-term keys does not reveal past sessions.
      IPSec: enable PFS in policy (pfs=yes in strongSwan).
      OpenVPN: ECDHE automatically provides PFS.
      WireGuard: PFS built-in (ephemeral keys in every handshake).

    Kill Switch:
      Block all traffic if VPN drops.
      Without kill switch: apps continue using the regular internet.

      # WireGuard kill switch via AllowedIPs
      AllowedIPs = 0.0.0.0/0, ::/0   # all traffic through VPN

      # WireGuard kill switch via iptables
      PostUp  = iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) \
                -m addrtype ! --dst-type LOCAL -j REJECT
      PreDown = iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) \
                -m addrtype ! --dst-type LOCAL -j REJECT

    DNS Leak:
      DNS queries may bypass VPN to ISP DNS.
      Fix: push DNS server to client through VPN.
      Check: dnsleaktest.com or dnsleak.sh

    Split Tunneling:
      Only some traffic goes through VPN.
      IPSec: traffic selectors define which traffic enters tunnel.
      OpenVPN: routes via push or client config.
      WireGuard: AllowedIPs = 10.0.0.0/24 (VPN network only).

### VPN Attack Vectors

    MITM against PSK:
      Weak Pre-Shared Key can be bruteforced from captured IKE traffic.
      Recommendation: PSK at least 32 random chars, or use certificates.

    Certificate Attack:
      Forged CA certificate - MITM possible.
      Recommendation: certificate pinning, private CA, DANE (DNS-based).

    Replay Attack:
      Retransmitting captured old packets.
      IPSec: Sequence Number + Anti-Replay Window.
      WireGuard: TAI64N timestamp + sliding window.

    VPN Fingerprinting (DPI):
      ISP/firewall detects that VPN is in use.
      IPSec: recognizable UDP 500, UDP 4500, ESP packets.
      OpenVPN: characteristic TLS handshake, tls-crypt hides it.
      WireGuard: recognizable handshake packets (no stealth mode).
      Obfuscation: obfs4, shadowsocks over VPN tunnel.

    VPN Leak via WebRTC:
      Browser reveals real IP via WebRTC even with VPN.
      Fix: disable WebRTC in browser or use an extension.

---

## Cheat Sheet

    IPSec:
      Protocols: IKEv2 (UDP 500/4500) + ESP (IP protocol 50)
      Modes:     Transport (host-to-host) / Tunnel (site-to-site)
      Keys:      PSK or X.509 certificates
      SA:        unidirectional protection parameter agreement
      Tools:     strongSwan, Libreswan, Openswan

      # Check SA
      ip xfrm state
      ip xfrm policy
      ipsec statusall   # strongSwan

    OpenVPN:
      Port:    UDP 1194 (or TCP 443)
      Channels: Control (TLS) + Data (AES-GCM)
      Interface: tun (L3) or tap (L2)
      PKI:     easy-rsa for certificate management
      tls-auth / tls-crypt - control channel protection

      # Start
      systemctl start openvpn@server
      # Client status
      cat /var/log/openvpn/status.log

    WireGuard:
      Port:    UDP 51820
      Crypto:  Curve25519 + ChaCha20-Poly1305 + BLAKE2s (fixed)
      Keys:    wg genkey | wg pubkey
      AllowedIPs: routing + ACL simultaneously
      Roaming: built-in, IP can change freely
      Kernel:  Linux 5.6+, macOS native, iOS/Android

      # Status
      wg show
      # Start
      wg-quick up wg0

    Protocol selection:
      Enterprise site-to-site, legacy hardware → IPSec IKEv2
      Many clients, flexibility, TCP firewall bypass → OpenVPN
      Performance, simplicity, mobility → WireGuard

    Verify VPN:
      ip addr show tun0 / wg0    - VPN interface
      ip route                   - routing table
      ping 10.0.0.1              - ping VPN server
      curl ifconfig.me           - external IP
      tcpdump -i wg0             - traffic in tunnel
      wg show                    - WireGuard status

---

## References

- [RFC 4301](https://www.rfc-editor.org/rfc/rfc4301) - IPSec Architecture
- [RFC 7296](https://www.rfc-editor.org/rfc/rfc7296) - IKEv2
- [RFC 4303](https://www.rfc-editor.org/rfc/rfc4303) - ESP
- [RFC 3948](https://www.rfc-editor.org/rfc/rfc3948) - UDP Encapsulation of IPSec ESP (NAT-T)
- [WireGuard Whitepaper](https://www.wireguard.com/papers/wireguard.pdf) - original paper
- [Noise Protocol Framework](https://noiseprotocol.org) - WireGuard handshake foundation
- [strongSwan Docs](https://docs.strongswan.org) - strongSwan documentation
- [OpenVPN Docs](https://openvpn.net/community-resources/) - OpenVPN documentation
- [WireGuard Quick Start](https://www.wireguard.com/quickstart/) - official guide
- [Tailscale Blog](https://tailscale.com/blog/) - WireGuard mesh articles
