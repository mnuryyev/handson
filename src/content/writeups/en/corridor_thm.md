---
title: "Corridor - TryHackMe (Easy)"
description: "Analysis of IDOR vulnerability in the Corridor web application on TryHackMe: demonstrating access control bypass and accessing hidden resources through URL parameter manipulation"
image: "/images/neighbour_thm/thm_main.png"
date: "2026-03-19"
platform: "thm"
---

**IDOR (Insecure Direct Object Reference)** belongs to the **Broken Access Control (A01 OWASP Top 10 2021)** vulnerability category and occurs in situations where an application provides direct access to internal system objects through request parameters without performing user access rights verification.

As a result, an attacker can modify identifiers in the URL and gain access to data that doesn't belong to them.

This room examines the Corridor web application from the TryHackMe platform, which implements an IDOR vulnerability through the use of predictable object identifiers.

![01_intro](/handson/images/corridor_thm/01_intro.png)

![02_ip_machine](/handson/images/corridor_thm/02_ip_machine.png)


## Phase 1. Initial Application Investigation

After launching the virtual machine, a web page opens with an image of a corridor containing 13 doors. Each door is an interactive element and leads to a separate resource.

![03_web](/handson/images/corridor_thm/03_web.png)

### Step 1. Studying Page Structure

First room:

![04_first_room](/handson/images/corridor_thm/04_first_room.png)

When analyzing the page source code (Ctrl+U), an HTML image map is discovered in which each door is represented by a link in the format

![05_html_code](/handson/images/corridor_thm/05_html_code.png)

All values are 32-character strings, characteristic of MD5 hashes, indicating the use of hashed identifiers instead of regular numeric IDs.

### Step 2. Analyzing Link Formation Mechanism

During analysis, we see that each identifier corresponds to the result of MD5 hashing of numbers.

![06_convert_md5](/handson/images/corridor_thm/06_convert_md5.png)

The application uses deterministic hashes as object identifiers, making them predictable.


## Phase 2. IDOR Vulnerability Exploitation

### Step 3. Application Navigation

When clicking through each door, a separate page opens. However, visually they don't contain obvious differences or useful information.

This indicates that the server forms a response exclusively based on the passed identifier without additional access logic.

### Step 4. Checking Identifier Range

Since 13 doors are displayed on the page, initially it can be assumed that values in the range 1–13 are used. Each door corresponds to an MD5 hash of a numeric value.

When checking hash correspondence, it becomes visible that the interface displays only part of possible values and doesn't show the full range of identifiers used on the backend.

### Step 5. Discovering Hidden Resource

When matching MD5 hashes with numeric values (0–13), it turns out that the interface lacks display of value 0, however the server correctly processes it with direct access.

The backend uses the full range of values, including hidden ones not represented in HTML. When accessing the MD5 hash for 0, a hidden resource with the flag becomes available.

We try 0: cfcd208495d565ef66e7dff9f98764da

![07_flag](/handson/images/corridor_thm/07_flag.png)

![08_result](/handson/images/corridor_thm/08_result.png)


## Phase 3. Essence of the Vulnerability

The main problem is that the application:
- uses predictable identifiers (MD5 of numbers);
- doesn't limit permissible values at the server level;
- trusts data coming from the URL;
- doesn't verify access rights to objects.

As a result, any user can directly access internal system resources, which is a classic example of IDOR.
