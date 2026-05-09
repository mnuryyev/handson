---
title: "Active Directory - Building a Domain from Scratch"
description: "In this lab we will build a domain from scratch: install the AD DS role, create an OU structure, users and groups, join a Windows 10 client to the domain, configure GPO, explore the LDAP structure from the inside, and enable logon auditing."
image: "/images/ad_net/main.jpg"
date: "2026-05-09"
---

## Introduction

AD is the central system of enterprise infrastructure: a single authentication point, centralized policy management, and control over every machine on the network.

In this lab we will build a domain from scratch: install the AD DS role, create an OU structure, users and groups, join a Windows 10 client to the domain, configure GPO, explore the LDAP structure from the inside, and enable logon auditing.

| Parameter | Value |
| --- | --- |
| Domain | lab.local |
| Domain Controller | Windows Server 2022 |
| Client Machine | Windows 10 |
| DC IP | 10.10.70.132 |
| Client IP | 10.10.70.134 |
| Tools | Server Manager, ADUC, GPMC, ldp.exe, Event Viewer |

---

## Theory

### What is Active Directory

AD is a directory service from Microsoft based on the **LDAP** protocol with authentication via **Kerberos**. It stores information about domain objects: users, computers, groups, and policies.

### Key Concepts

| Object | Description |
| --- | --- |
| **Domain** | Administrative boundary. All objects inside share one policy |
| **DC (Domain Controller)** | Server storing the AD database and handling authentication |
| **OU (Organizational Unit)** | A container inside the domain for grouping objects |
| **GPO (Group Policy Object)** | A set of policies applied to OUs, users, or computers |
| **LDAP** | Query protocol for the AD database (port 389 / 636 TLS) |
| **Kerberos** | Authentication protocol (port 88). Uses tickets instead of passwords |
| **SID** | Unique identifier for every object in the domain |
| **Forest** | Top level of the AD hierarchy. One or more domains |

### How Domain Logon Works

```
User enters password
    → Windows sends request to DC (Kerberos AS-REQ)
    → DC validates credentials, issues a TGT ticket
    → TGT is used to obtain service tickets
    → Access to resources without re-entering password (SSO)
```

---

## Phase 1. Installing the AD DS Role

### Step 1. Logging In

Start the Windows Server 2022 virtual machine. Log in as `Administrator`.

![01_start](/handson/images/ad_net/01_start.png)

### Step 2. Server Manager

**Server Manager** opens automatically - the main management tool for Windows Server. This is where roles and features are added.

Click **"Add roles and features"**.

![02_start](/handson/images/ad_net/02_start.png)

### Step 3. Add Roles and Features Wizard

The **Add Roles and Features Wizard** opens. The first screen lists prerequisites: a static IP address and up-to-date security updates.

Click **Next**.

![03_add_roles](/handson/images/ad_net/03_add_roles.png)

### Step 4. Installation Type

Select **"Role-based or feature-based installation"** - the standard option for installing roles on a single server.

Click **Next**.

![04_role_based](/handson/images/ad_net/04_role_based.png)

### Step 5. Server Selection

Select our server from the pool - **`WIN-H5P0PJB7B3A`** at IP `10.10.70.132`. This will become the domain controller.

Click **Next**.

![05_ip](/handson/images/ad_net/05_ip.png)

### Step 6. Selecting the AD DS Role

Check **"Active Directory Domain Services"** in the role list. The right panel shows a description: AD DS stores network object information and enables single sign-on (SSO).

In the popup click **"Add Features"** - this adds the required management tools (ADUC, GPMC, ldp.exe).

Click **Next → Next → Install**.

![06_add_features](/handson/images/ad_net/06_add_features.png)

The role is installed but the domain does not exist yet. AD DS is just the engine - it needs to be configured.

### Step 7. Installation Complete

A notification appears: **"Additional steps are required to make this machine a domain controller"** with a link to **"Promote this server to a domain controller"**.

This is the key moment: the role is installed, but the server is not yet a domain controller.

![07_completed](/handson/images/ad_net/07_completed.png)

### Step 8. Promoting to Domain Controller

A yellow flag appears at the top of Server Manager. Click it and select **"Promote this server to a domain controller"**.

![08_promote](/handson/images/ad_net/08_promote.png)

---

## Phase 2. Creating the Domain

### Step 9. Creating a New Forest

The **Active Directory Domain Services Configuration Wizard** opens.

Select **"Add a new forest"** - we are building a new AD infrastructure from scratch. Root domain name: **`lab.local`**.

Click **Next**.

![09_add_forest](/handson/images/ad_net/09_add_forest.png)

> A Forest is the top-level container in AD. All domains within a single forest automatically trust each other.

### Step 10. Domain Controller Options

Configure functional levels:
- Forest functional level: **Windows Server 2016**
- Domain functional level: **Windows Server 2016**
- Check: ✓ DNS Server, ✓ Global Catalog

Set the **DSRM** (Directory Services Restore Mode) password - used for emergency AD recovery. Without it, restoring the domain after a failure is not possible.

![10_dsrm](/handson/images/ad_net/10_dsrm.png)

### Step 11. NetBIOS Name

The wizard automatically suggests the NetBIOS name **LAB** - short for `lab.local`. This name is used for backward compatibility with older clients and for logging in as `LAB\username`.

Leave it as **LAB** and click **Next**.

![11_netbios](/handson/images/ad_net/11_netbios.png)

### Step 12. Database Paths

Leave the default paths:
- `C:\Windows\NTDS` - AD database and transaction logs
- `C:\Windows\SYSVOL` - folder with policies and scripts, replicated between DCs

Click **Next → Next → Install**.

![12_paths](/handson/images/ad_net/12_paths.png)

The server will automatically reboot. After the reboot the domain `lab.local` exists.

### Step 13. Verification

After the reboot the server checks its configuration. Warnings about the static IP and DNS delegation are normal for a lab environment.

Click **Close**.

![13_success](/handson/images/ad_net/13_success.png)

---

## Phase 3. OU Structure and Domain Objects

### Step 14. Logging in with a Domain Account

After the reboot the login screen shows `LAB\Administrator` - we are now logging in as a domain account, not a local administrator. The domain is working.

![14_login](/handson/images/ad_net/14_login.png)

### Step 15. Opening ADUC and Creating OUs

Start → Windows Administrative Tools → **Active Directory Users and Computers**.

In the left tree: right-click on `lab.local` → **New → Organizational Unit**.

![15_ou](/handson/images/ad_net/15_ou.png)

> OUs are not just folders for organization. GPOs are applied to OUs. The right structure means flexible policy management.

### Step 16. Creating OU "IT"

Name: **IT** → OK.

![16_it](/handson/images/ad_net/16_it.png)

### Step 17. Creating OU "HR"

Right-click on `lab.local` → New → Organizational Unit → Name: **HR** → OK.

![17_hr](/handson/images/ad_net/17_hr.png)

### Step 18. Creating OU "Management"

Right-click on `lab.local` → New → Organizational Unit → Name: **Management** → OK.

![18_management](/handson/images/ad_net/18_management.png)

The left tree now shows three OUs: IT, HR, Management. The structure mirrors company departments - each can have its own policy applied.

---

## Phase 4. Creating Users and Groups

### Step 19. Starting User Creation

Right-click on OU **IT** → **New → User**.

![19_user1](/handson/images/ad_net/19_user1.png)

### Step 20. Ivan Petrov User Details

Fill in:
- First name: `Ivan`, Last name: `Petrov`
- User logon name: **`petrov.i`**

Click **Next**.

![20_user1](/handson/images/ad_net/20_user1.png)

### Step 21. User Password

Set the password. Uncheck **"User must change password at next logon"**, check **"Password never expires"**.

Click **Next → Finish**.

![21_user1_pass](/handson/images/ad_net/21_user1_pass.png)

### Step 22. Creating Anna Sidorova (HR)

Right-click on OU **HR** → New → User.
- First name: `Anna`, Last name: `Sidorova`
- User logon name: **`sidorova.a`**

Same password settings → Finish.

![22_user2](/handson/images/ad_net/22_user2.png)

### Step 23. Creating Admin User (IT)

Right-click on OU **IT** → New → User.
- User logon name: **`admin`**

Set password → Finish.

![23_admin](/handson/images/ad_net/23_admin.png)

### Step 24. Adding Admin to Domain Admins

`lab.local` → **Users** → double-click **Domain Admins** → **Members** tab → **Add** → type `admin` → **Check Names** → OK → OK.

The `admin` user now has full domain administrator privileges.

![24_domain_admin](/handson/images/ad_net/24_domain_admin.png)

### Step 25. Creating a Security Group

Right-click on OU **IT** → **New → Group**.

![25_new_group](/handson/images/ad_net/25_new_group.png)

### Step 26. IT-Staff Group

- Group name: **IT-Staff**
- Group scope: **Global**
- Group type: **Security**

OK.

![26_it_staff](/handson/images/ad_net/26_it_staff.png)

> Security groups are used to assign access rights. Distribution groups are for email only. We need Security.

### Step 27. Adding Members to IT-Staff

Double-click **IT-Staff** → **Members** tab → **Add** → add `admin` and `Ivan Petrov` → OK.

![27_added_members](/handson/images/ad_net/27_added_members.png)

### Step 28. HR-Staff Group

Right-click on OU **HR** → New → Group → **HR-Staff**, Global, Security → OK.

Double-click **HR-Staff** → Members → Add → `Anna Sidorova` → OK.

![28_hr_staff](/handson/images/ad_net/28_hr_staff.png)

---

## Phase 5. Joining the Client to the Domain

### Step 29. Configure DNS on the Client

On Windows 10: network settings → TCP/IPv4 → **Preferred DNS server: `10.10.70.132`** (our DC's IP).

Without this step, joining the domain is impossible - the client cannot resolve `lab.local`.

![29_address_dc](/handson/images/ad_net/29_address_dc.png)

### Step 30. Specifying the Domain

Right-click **This PC** → Properties → **Change settings** → Computer Name tab → **Change** → switch to **Domain** → type `lab.local` → OK.

![30_lab_local](/handson/images/ad_net/30_lab_local.png)

### Step 31. Authentication

The system requests credentials to join the domain. Enter `Administrator` and the password.

After successful authentication a "Welcome to the lab.local domain" message appears.

![31_pass_admin](/handson/images/ad_net/31_pass_admin.png)

### Step 32. First Domain User Logon

After restarting the client: **Other user** → type `sidorova.a` with the password. The login screen shows the **LAB** domain.

The client now authenticates through the DC using the Kerberos protocol.

![32_user2_login](/handson/images/ad_net/32_user2_login.png)

---

## Phase 6. GPO - Blocking CMD for HR

### Step 33. Creating a GPO in OU HR

Start → Windows Administrative Tools → **Group Policy Management**.

In the tree: `lab.local` → OU **HR** → right-click → **"Create a GPO in this domain, and Link it here..."**.

![33_gpo](/handson/images/ad_net/33_gpo.png)

### Step 34. Naming the GPO

Name: **HR - Block CMD** → OK.

The GPO is created and automatically linked to the HR OU - the policy will apply to all users and computers inside this OU.

![34_hr_block_cmd](/handson/images/ad_net/34_hr_block_cmd.png)

### Step 35. Configuring the Policy

Right-click **HR - Block CMD** → **Edit**.

Navigate:
**User Configuration → Policies → Administrative Templates → System**

Find **"Prevent access to the command prompt"** → double-click → **Enabled** → "Disable the command prompt script processing also?" → **Yes** → OK.

![35_enabled](/handson/images/ad_net/35_enabled.png)

> We configure this under User Configuration - the policy follows the user, not the computer. Wherever `sidorova.a` logs in, cmd will be blocked.

### Step 36. Forcing GPO Application

On the client machine logged in as `sidorova.a`, open PowerShell (still accessible) and run:

```
gpupdate /force
```

![36_gpupdate](/handson/images/ad_net/36_gpupdate.png)

### Step 37. Verification - CMD is Blocked

Start → type `cmd` → Enter.

Message appears: **"The command prompt has been disabled by your administrator."**

The GPO applied. User `sidorova.a` from OU HR cannot open the command prompt. User `petrov.i` from OU IT can.

![37_disabled_cmd](/handson/images/ad_net/37_disabled_cmd.png)

---

## Phase 7. Exploring LDAP Structure

### Step 38. Connecting via ldp.exe

Start → type `ldp` → Enter.

**Connection → Connect** → Server: `WIN-H5P0PJB7B3A.lab.local`, Port: `389` → OK.

**Connection → Bind** → **"Bind as currently logged on user"** → OK.

The right panel shows server information: `namingContexts`, `supportedLDAPVersion`, `supportedSASLMechanisms` - everything the DC reports on first contact.

![38_ldp](/handson/images/ad_net/38_ldp.png)

### Step 39. Browsing the Domain Tree

**View → Tree** → BaseDN: `DC=lab, DC=local` → OK.

The LDAP domain tree expands in the left panel. Expand `OU=HR` → `CN=Anna Sidorova` - all object attributes appear in the right panel.

![39_tree_biew](/handson/images/ad_net/39_tree_biew.png)

> This is how AD stores every object - a set of LDAP attributes. The `DN` (Distinguished Name) is the unique path: `CN=Anna Sidorova,OU=HR,DC=lab,DC=local`.

### Step 40. Anna Sidorova's User Attributes

Expand the `Anna Sidorova` object in ldp.exe. Key attributes:

| Attribute | Value | Meaning |
| --- | --- | --- |
| `lastLogon` | 5/9/2026 4:14:29 AM | Last successful logon |
| `logonCount` | 3 | Total number of logons |
| `userAccountControl` | 0x10200 | NORMAL_ACCOUNT + DONT_EXPIRE_PASSWORD |

![40_user2](/handson/images/ad_net/40_user2.png)

---

## Phase 8. Logon Auditing

### Step 41. Enabling Audit Logon

In **Group Policy Management** → right-click **Default Domain Policy** → **Edit**.

**Computer Configuration → Policies → Windows Settings → Security Settings → Advanced Audit Policy Configuration → Audit Policies → Logon/Logoff**

Double-click **"Audit Logon"** → ✓ **Success**, ✓ **Failure** → OK.

![41_audit_1](/handson/images/ad_net/41_audit_1.png)

### Step 42. Enabling Audit Logoff

Double-click **"Audit Logoff"** → ✓ **Success** → OK.

![42_logoff](/handson/images/ad_net/42_logoff.png)

### Step 43. Enabling Audit Kerberos Authentication

Under **Account Logon** → double-click **"Audit Kerberos Authentication Service"** → ✓ **Success**, ✓ **Failure** → OK.

![43_aduit_kerberos](/handson/images/ad_net/43_aduit_kerberos.png)

> Kerberos auditing captures TGT requests. This is critical: Pass-the-Ticket and Golden Ticket attacks are visible here - in events 4768 and 4769.

### Step 44. Generating a Failed Logon Event

On the client machine, attempt to log in as `sidorova.a` with the **wrong password** several times in a row.

The system responds: **"The password is incorrect"** - this generates Event ID 4625 in the Security Log on the DC.

![44_incorrect](/handson/images/ad_net/44_incorrect.png)

### Step 45. Event Viewer - Filtering by Event ID

On the DC: Start → **Event Viewer** → Windows Logs → **Security** → right side **"Filter Current Log"** → Event ID: `4624` → OK.

All successful logons since auditing was enabled are now visible.

![45_event_viewer](/handson/images/ad_net/45_event_viewer.png)

### Step 46. Event Details - Who, From Where, How

Double-click an event 4624. Key fields:

| Field | Value | Meaning |
| --- | --- | --- |
| `Account Name` | sidorova.a | Who logged in |
| `LogonProcessName` | Kerberos | Authentication protocol |
| `AuthenticationPackageName` | Kerberos | Confirmed: Kerberos was used |
| `IpAddress` | 10.10.70.134 | Source machine |
| `LogonType` | 10 | RemoteInteractive (RDP) |

![46_ip_user2](/handson/images/ad_net/46_ip_user2.png)

> In a real SOC, Event 4625 from the same IP multiple times in a row is a brute-force signal. Event 4624 with `LogonType: 10` outside working hours is a suspicious remote logon. These are the events that start an incident investigation.

---

## Summary

### What Was Built

| Component | Result |
| --- | --- |
| Domain lab.local | Deployed on Windows Server 2022 |
| OU: IT, HR, Management | Structure created |
| Ivan Petrov (petrov.i) | Created in OU IT, member of IT-Staff |
| Anna Sidorova (sidorova.a) | Created in OU HR, member of HR-Staff |
| admin | Created in OU IT, added to Domain Admins |
| WIN10 Client | Joined to lab.local domain |
| GPO: HR - Block CMD | Applied to OU HR, cmd blocked |
| LDAP Exploration | Structure explored via ldp.exe |
| Logon Auditing | Event ID 4624/4625 being recorded |

### Security Event Map

| Event ID | Event | Where to Look |
| --- | --- | --- |
| 4624 | Successful logon | Security Log on DC |
| 4625 | Failed logon attempt | Security Log on DC |
| 4768 | Kerberos TGT request | Security Log on DC |
| 4769 | Kerberos TGS request | Security Log on DC |
| 4728 | Added to global group | Security Log on DC |
| 4720 | User account created | Security Log on DC |

### What's Next

This lab is the foundation. The next level:

**BloodHound** - AD attack path mapping, finding privilege escalation routes through trust chains.

**Kerberoasting** - attacking service accounts via SPN. The attacker requests a TGS ticket and brute-forces it offline.

**Pass-the-Hash / Pass-the-Ticket** - lateral movement across the domain without knowing the password, using only a hash or ticket.

**Wazuh SIEM** - centralized collection of all Event IDs from the DC and clients, correlation and real-time alerting.
