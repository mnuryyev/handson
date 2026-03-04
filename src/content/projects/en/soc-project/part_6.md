---
title: "Part-6. Attack Simulation and Detection in Wazuh"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---
[All previous parts](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_5) were preparation for this moment. We built infrastructure, configured monitoring, deployed a domain. Now we're moving on to the most interesting part - we'll launch a real attack from Kali Linux on our victim machine `target-PC` through SMB protocol using Metasploit and see how Wazuh detects it.

The scenario will be as follows: the attacker conducts network reconnaissance, determines the victim's operating system version, and checks it for critical vulnerabilities. We'll observe each step from two sides - from the attacker's side in the Kali terminal and from the defender's side in Wazuh Dashboard.



## Phase 1: Target Preparation - Enabling RDP

### Step 1. Enabling Remote Desktop on Windows 10

Before starting the attack, let's enable RDP on the victim machine - this will make it a more realistic target, as it happens in real corporate networks where RDP is often open for remote administration.

We open **Settings → System → Remote Desktop** and move the switch to **On** position.

![01_remote](/handson/images/soc_project/part_6/01_remote.png)

![02_enabled](/handson/images/soc_project/part_6/02_enabled.png)

After enabling, we see the machine's full domain name **`target-PC.handson.local`**.

* * *

## Phase 2: Preparing the Attacking Machine

### Step 2. Updating Kali Linux

We switch to the attacker's machine - **Kali**. Before starting work, we update repositories:

```bash
sudo apt update
```

![03_kali_update](/handson/images/soc_project/part_6/03_kali_update.png)



### Step 3. Configuring Network on Kali Linux

We check network settings. Kali must be in the same subnet as the victim - `10.10.70.0/24`. If the IP wasn't assigned automatically, we set it manually (since we originally wanted to set a static IP):

```bash
sudo ip addr add 10.10.70.60/24 dev eth0
sudo ip link set eth0 up
```

![06_ip_add](/handson/images/soc_project/part_6/06_ip_add.png)

![07_link_up](/handson/images/soc_project/part_6/07_link_up.png)

We check the result:

```bash
ip a
```

![08_ip_a](/handson/images/soc_project/part_6/08_ip_a.png)

The `eth0` interface is up and has address `10.10.70.60/24` - exactly this IP we specified in our diagram for the attacking machine.



### Step 4. Reconnaissance - Checking Target Availability

Before starting the attack, we check the availability of our targets on the network:

```bash
ping 10.10.70.25
ping 10.10.70.134
```

![09_ping](/handson/images/soc_project/part_6/09_ping.png)

Both pings pass successfully. The domain controller (`10.10.70.25`) and victim machine (`10.10.70.134`) are available. Moving on to the active phase.

* * *

## Phase 3: Attack Through Metasploit - SMB Reconnaissance

### Step 5. Launching Metasploit

We launch the Metasploit framework:

```bash
msfconsole
```

![10_msf](/handson/images/soc_project/part_6/10_msf.png)

Metasploit is one of the most powerful tools for penetration testing. It contains thousands of modules: exploits, scanners, auxiliary utilities. We'll start with reconnaissance through SMB protocol - exactly through it attacks most often occur in domain environments.



### Step 6. Determining SMB Version

The first module - `scanner/smb/smb_version`. It allows determining the SMB protocol version and operating system on the target machine without any interference with its operation. For the attacker, this is pure reconnaissance - no traces, as they think.

```bash
use scanner/smb/smb_version
set RHOSTS 10.10.70.134
run
```

![11_attack1](/handson/images/soc_project/part_6/11_attack1.png)

The result tells us that the target is running **Windows 10 version 2004**. The attacker received the first valuable information about the victim without doing anything except a regular network request.



### Step 7. Checking for EternalBlue Vulnerability

Knowing the Windows version, the attacker checks the system for the presence of the critical **EternalBlue (MS17-010)** vulnerability - the same one that was used in the WannaCry attack and allows gaining complete control over a machine without knowing the password.

```bash
use scanner/smb/smb_ms17_010
set RHOSTS 10.10.70.134
run
```

![12_attack2](/handson/images/soc_project/part_6/12_attack2.png)

Direct vulnerability not detected - possibly firewall policies worked. However, even these attempts to connect to SMB have already left traces in Windows logs. We switch to Wazuh Dashboard and see what's happening there.

* * *

## Phase 4: Attack Detection in Wazuh

### Step 8. Analyzing Alerts in Wazuh Dashboard

We open **Wazuh Dashboard** and go to the **Discover** section.

![13_alert](/handson/images/soc_project/part_6/13_alert.png)

While the attacker was conducting reconnaissance through SMB, the Wazuh agent on the `target-PC` machine was silently recording every suspicious event and sending them to the server. Let's examine key alert fields in detail.

**`agent.name: Windows10`** - the event was captured by the agent on our target machine. We know exactly which host was attacked.

**`data.win.eventdata.ipAddress: 10.10.70.60`** - this is the IP address of the attacking Kali Linux machine, from which we just conducted scanning. The attacker revealed themselves.

**`data.win.eventdata.authenticationPackageName: NTLM`** - the authentication attempt occurred via NTLM protocol. Exactly this way Metasploit tried to connect to the machine's SMB resources during scanning.

**`data.win.eventdata.lmPackageName: NTLM V1`** - the outdated NTLMv1 version is used. This is an important indicator of compromise - legitimate modern systems extremely rarely use NTLMv1, and its appearance in logs is itself a reason for investigation.

**`data.win.eventdata.workstationName: WORKSTATION`** - the workstation name from which connection attempts were made.

The main thing here: the attacker just launched Metasploit scanning modules - they haven't yet gained any system access and most likely thought they were acting undetected. But Wazuh has already captured their IP address, authentication protocol, and NTLM version. In a real SOC, an analyst would receive this alert immediately and could block the attacker at the reconnaissance stage - before they caused any harm.



## Summary

This completes the final part of our project.

We prepared Kali Linux for attack and conducted SMB reconnaissance through Metasploit. Wazuh captured attacker activity at the reconnaissance stage - before they gained any system access. In the alert we saw the attacker's IP, the used NTLM V1 protocol, and workstation name.

The entire project as a whole showed the main idea: **SIEM without proper configuration is just a log repository**. But SIEM with correctly configured agents, Sysmon, and audit policies is a system that sees the attacker before they manage to cause real harm. Exactly this is what our project was dedicated to - from an empty virtual machine to a working SOC in miniature.
