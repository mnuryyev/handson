---
title: "Analysis of Cryptographic Hash Functions"
description: "In this work, we'll examine how cryptographic hash functions work: from computing hashes to analyzing MD5, SHA-1, and SHA-256 algorithms and verifying file integrity"
image: "/images/hash_functions_sec/hash.png"
date: "March 14, 2026"
---

## Introduction
A cryptographic hash function is a mathematical algorithm that transforms data of arbitrary length into a string of fixed length, called a hash or digest. This is a fundamental primitive of modern information security. It's used in password storage, file integrity verification, digital signatures, and even as the foundation of blockchain technology.

In this work, we'll conduct a comparative study of three algorithms - MD5, SHA-1, and SHA-256 - from both theoretical and practical perspectives. We'll reproduce real attacks on weak algorithms, demonstrate their vulnerabilities, and justify why SHA-256 and its family are used in modern systems.

## Theoretical Foundation

### Properties of Cryptographic Hash Functions

Any reliable hashing algorithm must provide several key properties:

- **Determinism** - identical input data always produces identical hash.
- **Avalanche effect** - even changing one bit in the input data completely changes the hashing result.
- **Collision resistance** - it's impossible to find two different messages that have the same hash.
- **Irreversibility (preimage resistance)** - it's impossible to recover original data from the hash.

### Comparison of Hashing Algorithms

| Algorithm | Year Created | Hash Length | Status | Reason for Obsolescence |
|----------|-------------|------------|--------|---------------------|
| MD5 | 1991 | 128 bits (32 hex) | Obsolete | Practical collisions (2004) |
| SHA-1 | 1995 | 160 bits (40 hex) | Obsolete | SHAttered collision (2017) |
| SHA-256 | 2001 | 256 bits (64 hex) | Current | No collisions found |

---

## Phase 1. Environment Preparation

### Step 1. Creating Working Directory and Test Files

Before starting work, we'll organize the workspace. Let's create a directory for all experiment files:

``` mkdir ~/hash_lab && cd ~/hash_lab ```

![01_mkdir](/handson/images/hash_functions_sec/01_mkdir.png)

Let's create the main test file with arbitrary content:

``` echo 'Test File' > data.txt && cat data.txt ```

![02_test_file](/handson/images/hash_functions_sec/02_test_file.png)

### Step 2. Checking Tool Availability

We check that all necessary utilities are present in the system. In Parrot OS they're included in the standard distribution:

```
 which md5sum sha1sum sha256sum
# Expected output:
# /usr/bin/md5sum
# /usr/bin/sha1sum
# /usr/bin/sha256sum
```

![03_check_instruments](/handson/images/hash_functions_sec/03_check_instruments.png)

---

## Phase 2. MD5 Demonstration

### Step 3. Computing MD5 Hash

The MD5 algorithm was developed in 1991 as an improvement over MD4. Initially it was widely used for data integrity verification, password storage, and digital signatures. Output value length is 128 bits.

``` md5sum data.txt ```

![04_demo_md5](/handson/images/hash_functions_sec/04_demo_md5.png)


### Step 4. Demonstrating Avalanche Effect

Let's add one character to the file and compute the hash again:

``` 
echo 'Test File!' > data.txt
md5sum data.txt
```

![05_md5_lavin_effect](/handson/images/hash_functions_sec/05_md5_lavin_effect.png)

The result is completely different from the previous one, despite the fact that we only added one character - an exclamation mark. This property is called the **avalanche effect** and is a mandatory requirement for any reliable hash function.

### Step 5. Hashing Strings Directly

A hash can be computed not only for a file, but for any string:

```
echo -n 'pass' | md5sum
echo -n 'pass123' | md5sum
echo -n 'Pass' | md5sum
```

![06_hash_demo_direct](/handson/images/hash_functions_sec/06_hash_demo_direct.png)

> The -n flag is important: without it echo adds a newline character, which changes the hash. It's always better to use **-n** when hashing strings.

### Step 6. Demonstrating Vulnerability - Cracking MD5 Through Rainbow Tables

This is exactly where MD5's main weakness manifests: its hashes are too short and well-studied. Hackers have created giant databases, **rainbow tables**, where hashes of millions of passwords are already pre-computed.

Let's create a file with weak password hashes:

```
echo -n 'password' | md5sum | cut -d' ' -f1 > hashes_md5.txt
echo -n '123456' | md5sum | cut -d' ' -f1 >> hashes_md5.txt
echo -n 'qwerty' | md5sum | cut -d' ' -f1 >> hashes_md5.txt
cat hashes_md5.txt
```

![07_demo_vulnerability](/handson/images/hash_functions_sec/07_demo_vulnerability.png)

Let's launch a dictionary attack using **hashcat**, one of the most powerful password recovery tools:

``` hashcat -m 0 -a 0 hashes_md5.txt /usr/share/wordlists/rockyou.txt ```

![08_start_attack](/handson/images/hash_functions_sec/08_start_attack.png)

![09_result](/handson/images/hash_functions_sec/09_result.png)


Alternatively through **John the Ripper**:

```
john --format=raw-md5 --wordlist=/usr/share/wordlists/rockyou.txt hashes_md5.txt
john --format=raw-md5 --show hashes_md5.txt
```

![10_john_ripper](/handson/images/hash_functions_sec/10_john_ripper.png)

In a matter of seconds, hashcat recovers passwords from hashes. This clearly shows why storing passwords in MD5 is a gross error. The MD5 algorithm is too fast: modern video cards can compute tens of billions of MD5 hashes per second.

### Step 7. Demonstrating MD5 Collision

In 2004, researchers publicly presented the first practical MD5 collision - two different files with the same hash. In 2005, attacks were improved so much that collision generation began to take seconds.
For demonstration, we download files from GitHub:

![11_download_files](/handson/images/hash_functions_sec/11_download_files.png)

![12_collision](/handson/images/hash_functions_sec/12_collision.png)

![13_collision](/handson/images/hash_functions_sec/13_collision.png)

The md5sum output will show identical hashes for both files, while sha256sum will give different ones. This explains why MD5 cannot be used for software verification or in security systems.

---

## Phase 3. SHA-1 Demonstration

### Step 8. Computing SHA-1 Hash

The SHA-1 algorithm was developed by the US NSA and published by NIST in 1995 as a response to MD5's shortcomings. Hash length increased to 160 bits. For many years, SHA-1 was considered the de facto standard - it was exactly what was used in SSL/TLS protocol, Git version control systems, and X.509 certificates.

``` sha1sum data.txt ```

![14_demo_sha1](/handson/images/hash_functions_sec/14_demo_sha1.png)

### Step 9. Cracking SHA-1 Through hashcat

Despite the greater length, SHA-1 is still vulnerable to dictionary attack - for the same reason as MD5: the algorithm was created for speed, not for password storage security.

```
echo -n 'password' | sha1sum | cut -d' ' -f1 > hashes_sha1.txt
echo -n '123456' | sha1sum | cut -d' ' -f1 >> hashes_sha1.txt

# Mode 100 = SHA-1
hashcat -m 100 -a 0 hashes_sha1.txt /usr/share/wordlists/rockyou.txt
```

![15_add_hashes](/handson/images/hash_functions_sec/15_add_hashes.png)

![16_attack1](/handson/images/hash_functions_sec/16_attack1.png)

![17_attack2](/handson/images/hash_functions_sec/17_attack2.png)

### Step 10. SHAttered Attack - Theoretical Explanation

In 2017, researchers from Google and CWI Amsterdam published the results of the SHAttered project. They managed for the first time in history to find a practical SHA-1 collision.
Two PDF files with different visual content received absolutely identical SHA-1 hash. This meant that an attacker could theoretically create a malicious document having the same hash as a legitimate one - and the verification system wouldn't detect the substitution.

![18_download_files](/handson/images/hash_functions_sec/18_download_files.png)

![19_collision](/handson/images/hash_functions_sec/19_collision.png)

After this publication, Chrome and Firefox browsers stopped trusting TLS certificates signed with SHA-1. Git also transitioned to SHA-256 as the primary algorithm.

## Phase 4. SHA-256 Demonstration

### Step 11. Computing SHA-256 Hash

SHA-256 is part of the SHA-2 family, developed by the US NSA and standardized by NIST in 2001. Hash length is 256 bits (64 hexadecimal characters). To this day, no practical collision attack on SHA-256 exists. That's exactly why it's the de facto standard in modern cryptography.

![20_sha256_demo](/handson/images/hash_functions_sec/20_sha256_demo.png)

### Step 12. Final Comparison of All Algorithms

Let's run all three algorithms for the same file and compare results visually:

```
echo 'Cryptography Lab' > compare.txt
echo '--- Hash length for each algorithm ---'
echo -n 'MD5:    '; md5sum compare.txt | cut -d' ' -f1 | wc -c
echo -n 'SHA-1:  '; sha1sum compare.txt | cut -d' ' -f1 | wc -c
echo -n 'SHA-256:'; sha256sum compare.txt | cut -d' ' -f1 | wc -c

echo ''
echo '--- The hashes themselves ---'
echo 'MD5:    '; md5sum compare.txt
echo 'SHA-1:  '; sha1sum compare.txt
echo 'SHA-256:'; sha256sum compare.txt
```

![21_compare](/handson/images/hash_functions_sec/21_compare.png)

### Step 13. Demonstrating Avalanche Effect

We compare hashes of two passwords differing by one character:

```
echo -n 'password123' | sha256sum
echo -n 'password124' | sha256sum
```

![22_lavin_effect](/handson/images/hash_functions_sec/22_lavin_effect.png)

## Phase 5. Real-World SHA-256 Application

### Step 14. File Integrity Verification

One of the most common applications of hash functions is verification of downloaded files. Any Linux distribution publishes the SHA-256 hash of its ISO images so users can verify their authenticity.

![23_iso_test](/handson/images/hash_functions_sec/23_iso_test.png)

### Step 15. Modern Password Storage

Storing passwords in MD5 or SHA-1 is unacceptable. Modern systems use specialized algorithms based on SHA-256 with salt and a large number of iterations: bcrypt, scrypt, Argon2. They're intentionally slow - this makes password brute-forcing economically impractical.

![24_safe_pass](/handson/images/hash_functions_sec/24_safe_pass.png)

---

## Summary and Conclusions

### Detailed Algorithm Comparison

| Criterion | MD5 | SHA-1 | SHA-256 |
|----------|-----|-------|---------|
| Hash length (bits) | 128 | 160 | 256 |
| Hash length (hex characters) | 32 | 40 | 64 |
| Year created | 1991 | 1995 | 2001 |
| NIST status | Not recommended | Not recommended | Active |
| Collisions found | Yes (2004) | Yes (2017) | No |
| Computation speed | Very high | High | Moderate |
| Dictionary attack | Seconds | Seconds–minutes | Practically impossible |
| Application today | File checksums | Git (legacy) | TLS, Bitcoin, OS, digital signatures |


### Conclusion

During this practical work, the operation of cryptographic hash functions MD5, SHA-1, and SHA-256 was investigated. Specific examples demonstrated:
    • Hash function determinism: the same data always produces the same result.
    • Avalanche effect: changing even one character completely changes the hash.
    • MD5 vulnerability: collisions and dictionary cracking show the algorithm's practical unsuitability.
    • SHA-1 vulnerability: the SHAttered attack (2017) proved that a 160-bit hash is insufficient for modern threats.
    • SHA-256 reliability: the absence of practical attacks and use in operating systems confirms its relevance.

Key conclusion: the choice of hashing algorithm should be determined not by its speed, but by its cryptographic strength and compliance with current security standards. SHA-256 (and in the context of password storage - Argon2, bcrypt or scrypt) is the right choice for any modern system.
