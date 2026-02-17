---
title: "Neighbour - TryHackMe (Easy)"
description: "Walkthrough of the Neighbour web machine on TryHackMe: exploiting IDOR vulnerability, bypassing access control, and obtaining another user's data"
image: "/images/neighbour_thm/thm_main.png"
date: "February 17, 2026"
---

**Insecure Direct Object Reference (IDOR)** is a classic vulnerability in the **Broken Access Control category (A01 in OWASP Top 10 2021)**, where an application allows a user to directly access internal system objects (profiles, files, database records) by modifying request parameters, while the server doesn't perform access rights verification.

Essentially, the application trusts data received from the client and doesn't control whether the user has the right to request a specific object. As a result, an attacker can change the identifier in the request and gain access to someone else's data.

Within this work, we'll examine the **IDOR** vulnerability using the example of a simple web machine **Neighbour** from the TryHackMe platform. We'll deploy a laboratory environment and sequentially go through the path from the reconnaissance stage to obtaining the administrator's flag.

## Phase 1. Reconnaissance and Application Access

![01_intro](/handson/images/neighbour_thm/01_intro.png)

![02_intro](/handson/images/neighbour_thm/02_intro.png)

The **Neighbour** machine is a web application called "Authentication Anywhere", which supposedly allows you to securely log in from anywhere.

The application is used to test access control. It's necessary to determine whether it's possible to gain access to other people's profiles and data by changing request parameters, which corresponds to an **IDOR** type vulnerability.

### Step 1. Accessing the Web Application

After starting the virtual machine, we get the target IP address, ***10.10.138.87***.

![03_login_page](/handson/images/neighbour_thm/03_login_page.png)

We open a browser and go to the address: **http://10.10.138.87**

We're greeted by a login page with two fields: Username and Password. Under the form in small text there's a hint:
Don't have an account? Use the guest account! (Ctrl+U)

### Step 2. Analyzing the Page Source Code

![08_code](/handson/images/neighbour_thm/08_code.png)

We press Ctrl+U to open the source HTML code. At the end of the document there's a commented fragment: guest:guest.

The comment contains test user credentials. We use them to log into the system: in the Username field we enter guest, in the Password field guest, then click the Login button and perform authorization.

![04_guest](/handson/images/neighbour_thm/screens/04_guest.png)

### Step 3. First Acquaintance with the Profile

After successful login, we're redirected to the page: http://10.10.138.87/profile.php?user=guest

![05_guest_page](/handson/images/neighbour_thm/05_guest_page.png)

We immediately pay attention to the browser's address bar. In the URL we see the parameter: **?user=guest** This means the application inserts the username directly into the request and loads the profile based on this value. That is, the page is formed based on the user parameter, which we can change manually.

If the server additionally doesn't check whether the current user has the right to view the requested profile, then it's enough to simply change the parameter value in the URL to try to gain access to another user's data.

* * *

## Phase 2. Exploiting the IDOR Vulnerability

### Step 4. Simple Parameter Manipulation

We change the user parameter value directly in the browser's address bar: from guest to admin. **?user=admin**

![06_admin](/handson/images/neighbour_thm/06_admin.png)

The application displays data for the administrator.

We see that the server doesn't check access rights and simply uses the parameter value to select the profile.

![07_flag](/handson/images/neighbour_thm/07_flag.png)

### Step 5. Confirmation and Analysis

We authenticated as a regular guest user, however we were able to gain access to the administrator's profile simply by changing the parameter value in the URL. The application displayed someone else's data without any checks.

The server completely trusts the user parameter value and doesn't check:

- whether the requested profile matches the current user session;
- whether the user has the necessary rights (for example, administrator role);
- whether access to the requested object is allowed in principle.

Essentially, the application uses the identifier from the request directly, without access control. This is a classic example of an **Insecure Direct Object Reference (IDOR)** vulnerability.

* * *

Phase 3. Real Problems and Scale

Although Neighbour looks like a training task, similar errors regularly occur in real production applications. The problem arises when the server accepts an object identifier from the request and doesn't check whether the current user has the right to access this data.

Most often the vulnerability manifests when using:

- sequential numeric identifiers;
- predictable UUIDs;
- string identifiers (username, email);
- parameters in API requests.

If the server doesn't link the requested object with the current user session and doesn't perform access rights verification, a classic IDOR occurs.

* * *

Phase 4. How to Properly Protect Against IDOR

To close such a vulnerability, you need to perform checks on the server side. You can't trust parameters from the URL or data coming from the client.

Direct object ownership verification - with each request the server must check whether the requested object belongs to the current user and whether they have access rights. If the object doesn't belong to them, access must be denied.
