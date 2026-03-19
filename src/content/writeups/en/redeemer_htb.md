---
title: "Redeemer - HackTheBox (Easy)"
description: "Walkthrough of the Redeemer machine on HackTheBox: scanning open ports, connecting to Redis without password, exploring database keys, and obtaining the flag directly from the service"
image: "/images/meow_htb/htb_main.jpg"
date: "February 23, 2026"
platform: "htb"
---
**Redeemer** is a simple machine on the HTB platform in the *Starting Point* section.

The machine demonstrates a typical security problem, namely an improperly configured **Redis** service that's accessible over the network without authentication. During the solution process, we'll discover an open port, connect to the database, and obtain the flag directly from the storage.

The main vulnerability is that **Redis** is running without a password and is accessible from outside, which allows anyone to connect and read data.

![01_ip_machine](/handson/images/redeemer_htb/01_ip_machine.png)

---

## Task 1: Which TCP port is open on the target machine?

![02_task1](/handson/images/redeemer_htb/02_task1.png)

![03_nmap_scan](/handson/images/redeemer_htb/03_nmap_scan.png)

First, let's scan the target machine to identify open ports.

We first ran a standard scan. However, the scan didn't show any open ports. Nmap by default checks only the top 1000 most popular ports, and they all turned out to be closed or filtered.

Since the task mentions a four-digit port, it's logical to assume that the service may be running on a non-standard port beyond the top 1000. Therefore, let's scan the port range from 1 to 9999.

And here we discover open port **6379**, and the *Redis* service is running on it.

Redis is an in-memory key → value type database. Usually it's used for caching, session storage, and speeding up application performance. In a normal situation, **Redis** should not be accessible from the external network without authentication, since through it you can gain access to data.

In our case, exactly Redis is the entry point into the system.

---

## Task 2: Which service is running on the open port?

![04_task2](/handson/images/redeemer_htb/04_task2.png)

The *Redis* service is running on open port **6379**

---

## Task 3: What type of database is Redis? (i) In-memory Database, (ii) Traditional Database

![05_task3](/handson/images/redeemer_htb/05_task3.png)


Redis is an **In-memory Database**.

This means that data is stored in RAM (random access memory), not on disk, which provides very high performance. Redis is often used for data caching, user session storage, and task queues.

---

## Task 4: Which utility is used to interact with Redis through the command line?

![06_task4](/handson/images/redeemer_htb/06_task4.png)

![07_redis](/handson/images/redeemer_htb/07_redis.png)


The **redis-cli** utility is used for interacting with Redis. This is the official command-line client for working with Redis server.

---

## Task 5: Which flag is used in redis-cli to specify the host?

![08_task5](/handson/images/redeemer_htb/08_task5.png)

To connect to a remote Redis server, you need to specify its IP address.

The **-h** flag is used for this. This flag specifies the host we want to connect to.

---

## Task 6: Which command is used to get information and statistics about Redis?

![09_task6](/handson/images/redeemer_htb/09_task6.png)

![10_info](/handson/images/redeemer_htb/10_info.png)

After connecting to the Redis server, you can get information about the system using the **info** command. 

The info command shows:

* Redis version
* used memory
* number of connections
* database information

---

## Task 7: What version of Redis is installed on the target machine?

![11_task7](/handson/images/redeemer_htb/11_task7.png)

Redis version on the target machine: **5.0.7**

---

## Task 8: Which command is used to select the needed database in Redis?

![12_task8](/handson/images/redeemer_htb/12_task8.png)

Redis supports multiple logical databases (by default from 0 to 15).

The **SELECT** command is used to select a database.

---

## Task 9: How many keys are in the database with index 0?

![13_task9](/handson/images/redeemer_htb/13_task9.png)

![14_keys](/handson/images/redeemer_htb/14_keys.png)

In the output of the *info* command in the Keyspace section, it was indicated *db0:keys=4*

This means that in the database with index 0 there are **4 keys**. 

---

## Task 10: Which command is used to get all keys from the database?

![15_task10](/handson/images/redeemer_htb/15_task10.png)

To get a list of all keys in the database, the KEYS * command is used. The KEYS * command outputs all saved keys.

After execution we see:

* numb
* flag
* temp
* stor

---

# Getting the Flag

We see among the keys a key named **flag**. To find out its value, we use the *GET flag* command. The *GET* command allows getting the value of any string type key in Redis.

After executing the command, Redis returns the contents of the flag key, and this is the flag of the Redeemer machine.

![16_get_flag](/handson/images/redeemer_htb/16_get_flag.png)

![17_result](/handson/images/redeemer_htb/17_result.png)
