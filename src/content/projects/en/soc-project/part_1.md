---
title: "Part-1. Introduction"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---

In most modern organizations, **Active Directory** is used to manage users, computers, and groups. Exactly this environment most often becomes the target of attackers, since domain compromise essentially means complete control over the company's infrastructure.

Within this work, we'll build our own laboratory environment that will allow us to model real attacks and learn to detect them. We'll deploy a full-fledged **SIEM based on Wazuh**, configure log collection from Windows machines, conduct attacks from Kali Linux, and see what telemetry this generates. As a result, we'll have a live environment where you can study both domain administration and threat detection methods.



## Laboratory Architecture

Before moving on to installing and configuring components, let's first examine our laboratory's architecture. This is an important step - understanding how nodes are connected to each other helps not only to configure everything correctly, but also to consciously analyze traffic and events later.

Let's look at the diagram:



![diagram](/handson/images/soc_project/part_1/01_diagram.png)



All machines are in a single **10.10.70.0/24** network and united through a common **Switch**. This means that all nodes see each other directly and are in one broadcast domain. Exactly this topology is typical for corporate network segments and exactly it makes possible the attacks we'll be studying.

Now let's examine each node and its role in our laboratory.



## Windows 10 - victim machine

IP address: receives via DHCP (dynamically in the **10.10.70.0/24** network range. Since we won't be configuring a DHCP server on the domain.)

This is our target machine, which will be targeted by attacks from **Kali Linux**. Two important components are installed on it. The first is Wazuh Agent, which reads Windows event logs (Security, System) and sends them to Wazuh Server for analysis. The second is Sysmon (System Monitor), a utility from Microsoft Sysinternals that provides extended logging: captures process creation, network connections, registry changes, and much more that the standard Windows log doesn't see.

Traffic from this machine goes in two directions: network attacks come from Kali Linux, and logs go to Wazuh Server.



## Active Directory - domain controller

IP address: **10.10.70.25**

This machine is the domain controller for **handson.local**. It manages authentication of all users and computers in the domain, stores security policies, and processes all login requests. That's exactly why it's of particular interest to an attacker. By gaining control over the domain controller, an attacker gains control over the entire infrastructure.

**Wazuh Agent** and **Sysmon** are also installed on this machine, which will allow us to see authentication events, policy changes, and other critically important activity directly in our SIEM.

AD is connected to the switch and interacts with Windows 10 within the domain - when a user on Windows 10 logs into the system, the authentication request goes exactly to this server.



## Wazuh Server - heart of our monitoring system

IP address: **10.10.70.30**

This is the central node of our entire laboratory. We'll be installing on Ubuntu Server. **Wazuh Server** includes three components that work together. **Wazuh Manager** receives events from all agents, runs them through a set of rules (Ruleset), and generates alerts when suspicious activity is detected. **Wazuh Indexer** is a search engine based on OpenSearch that stores all events and alerts, providing fast search and filtering. **Wazuh Dashboard** is a web interface through which we'll observe everything happening, view alerts, and work with the **MITRE ATT&CK** matrix.

Wazuh Server receives encrypted event streams from agents on Windows 10 and Active Directory. Exactly here logs turn into alerts, and alerts into understanding what's happening in the network.



## Kali Linux - attacker's machine

IP address: **10.10.70.60**

This is our offensive machine. Being in the same network as the victim, Kali will be used to conduct attacks. We'll be working with **Metasploit**. This is for conducting reconnaissance through SMB protocol, finding vulnerabilities, and gathering information about the target system.

Kali is connected to the switch the same way as all other machines. This allows it to directly interact with Windows 10 and Active Directory without going through additional network filters.



## Data Flow Scheme

Now that we've examined each node, it's important to understand how data moves through our laboratory during an attack.

When Kali Linux conducts SMB reconnaissance through Metasploit, Active Directory captures a network logon (Logon Type 3) on behalf of ANONYMOUS LOGON. Wazuh Agent on the domain controller sends this event to the server, where it also turns into an alert.
Thus, all attacker activity, even if they haven't yet gained access to the system, leaves traces that we can detect and analyze.
