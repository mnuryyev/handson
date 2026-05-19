---
title: "DES and 3DES - Why They Are Weak"
date: "2026-05-15"
---

DES (Data Encryption Standard) is a block cipher adopted as a US standard in 1977. It was the ubiquitous standard for two decades, but today it is considered completely broken. 3DES was an attempt to extend DES's life by applying it three times, but it too is now obsolete and banned by NIST since 2023.

---

## DES: History and Parameters

```
Developer: IBM (Horst Feistel's team), with NSA involvement
Adopted:   NIST (then NBS) in 1977, FIPS PUB 46
Withdrawn: NIST in 2005 (formally), banned in 2023

Parameters:
  Block size:  64 bits (8 bytes)
  Key size:    56 bits (physically 64 bits, 8 bits are parity)
  Rounds:      16
  Structure:   Feistel network

Number of possible keys: 2^56 = 72,057,594,037,927,936 (~72 quadrillion)
```

### Context of Its Creation

```
1973: NBS announced a competition for a national encryption standard.
IBM submitted Lucifer (128-bit key, 64-bit block).
NSA asked IBM to reduce the key to 56 bits and revise the S-boxes.

Controversy from the start:
- Why 56 bits and not 64 or 128?
- NSA modified the S-boxes: random hardening or a backdoor?

Later (1990): Biham and Shamir invented differential cryptanalysis.
It turned out DES's S-boxes were already optimized against this attack.
NSA knew about this attack 15 years before its public discovery.
They strengthened the S-boxes - they did not weaken them. But the key was still left short.
```

---

## DES Structure: Feistel Network

### Overall Scheme

```
Plaintext (64 bits)
       |
   IP (Initial Permutation)
       |
  +----+----+
  L0 (32)  R0 (32)
  |         |
  |    +----+
  |    |  F(R0, K1)
  |    |     |
  +XOR+     |
  R1=L0 XOR F(R0,K1)
  L1=R0
       |
  ... 16 rounds ...
       |
   IP^(-1) (Final Permutation)
       |
Ciphertext (64 bits)

Round i:
  L_i = R_(i-1)
  R_i = L_(i-1) XOR F(R_(i-1), K_i)

Decryption = encryption with subkeys applied in reverse: K16..K1.
```

### The F Function (Round Function)

```
F(R, K):

R (32 bits)
    |
    E  (expansion: 32 -> 48 bits, some bits are duplicated)
    |
  XOR with K (48 bits)
    |
   S-boxes (8 total, each 6->4 bits, total 48->32 bits)
    |
    P  (permutation: rearrange 32 bits)
    |
  result (32 bits)

S-boxes are the key source of non-linearity in DES.
Without them, DES would be linear and trivially broken.
```

### S-box: Example

```
S1 (first of eight S-boxes):
Input: 6 bits b1 b2 b3 b4 b5 b6
Row:    b1 b6 (2 bits -> 0-3)
Column: b2 b3 b4 b5 (4 bits -> 0-15)

        0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Row 0: 14  4 13  1  2 15 11  8  3 10  6 12  5  9  0  7
Row 1:  0 15  7  4 14  2 13  1 10  6 12 11  9  5  3  8
Row 2:  4  1 14  8 13  6  2 11 15 12  9  7  3 10  5  0
Row 3: 15 12  8  2  4  9  1  7  5 11  3 14 10  0  6 13

Example: input = 011011
  b1=0, b6=1 -> row 01 = 1
  b2b3b4b5 = 1101 = 13
  S1[1][13] = 5 -> output = 0101
```

### DES Key Schedule

```
From the 64-bit key (56 significant bits), 16 subkeys of 48 bits are generated:

1. PC-1 (Permuted Choice 1): 64 -> 56 bits (strips parity bits)
2. Split into C0 (28 bits) and D0 (28 bits)
3. For each round i:
   - Left circular shift: C_i = LS_i(C_(i-1)), D_i = LS_i(D_(i-1))
     LS = 1 bit for rounds 1,2,9,16; 2 bits for all others
4. PC-2 (Permuted Choice 2): 56 -> 48 bits (select 48 of 56)

Key schedule problems:
  Weak keys (4 total): keys where K_i = K_(16-i+1)
  -> encryption = decryption!
  Semi-weak keys: 12 pairs of keys
  Related keys: differences in keys propagate predictably
```

---

## Why DES is Weak

### 1. Critically Small Key: 56 Bits

```
2^56 = 72 quadrillion keys - sounds like a lot.
But:

1977: exhausting 2^56 required specialized hardware costing millions.
1993: Wiener showed a $1M machine could break DES in 3.5 hours.
1998: EFF Deep Crack ($250,000) broke DES in 56 hours.
1999: Deep Crack + distributed.net (100,000+ computers): 22 hours 15 minutes.
2006: COPACOBANA (FPGA, $10,000): 6-7 days average, 26 hours best case.
2012: Next-generation COPACOBANA: under one day.
2024: modern GPU cluster: hours or minutes.

Conclusion: a 56-bit key has been insufficient since the late 1990s.
```

### 2. Small Block: 64 Bits

```
64-bit block -> birthday bound at 2^32 blocks = 32 GB of data.

Birthday Bound: after encrypting 2^(n/2) blocks with one key,
the probability of a collision between two blocks reaches ~50%.

Collision of blocks in CBC:
C_i = C_j => AES_K(P_i XOR C_(i-1)) = AES_K(P_j XOR C_(j-1))
=> P_i XOR C_(i-1) = P_j XOR C_(j-1)
=> P_i XOR P_j = C_(i-1) XOR C_(j-1)  (everything known except P_i, P_j)

This leaks the XOR of two plaintext blocks!

SWEET32 attack (2016):
  Target: 3DES and Blowfish (64-bit block) in TLS
  Method: HTTPS session with high traffic volume (e.g. long-poll)
          Collect 2^32 blocks (~32 GB)
          Wait for a collision -> recover parts of HTTP headers
  CVE: CVE-2016-2183
  Result: browsers capped 3DES at 2^20 blocks (~1 MB) per connection
```

### 3. Weak Keys

```
DES has special categories of problematic keys:

Weak keys (4 total):
  0x0101010101010101  (all zeros with parity bits)
  0xFEFEFEFEFEFEFEFE  (all ones)
  0x1F1F1F1F0E0E0E0E
  0xE0E0E0E0F1F1F1F1

  With these keys: K_i = K_(17-i) -> all subkeys are the same
  DES_K(DES_K(P)) = P  (double encryption is an involution!)

Semi-weak keys (6 pairs):
  Two keys K1 and K2 such that: DES_K1(DES_K2(P)) = P for all P
  DES_K1 is the inverse of DES_K2

Possibly-weak keys: 48 keys (subkeys take fewer distinct values)

In practice: probability of randomly choosing a weak key = 4/2^56 - negligible.
But when systematically searching, these keys must be excluded.
```

### 4. Differential and Linear Cryptanalysis

```
Differential Cryptanalysis (Biham, Shamir 1990):
  Analyzes differences between pairs of plaintexts and their ciphertexts.
  Against DES: requires 2^47 chosen plaintexts.
  Better than brute force (2^56) but only theoretically useful.

Linear Cryptanalysis (Matsui 1993):
  First practically applicable attack on DES.
  Finds linear approximations of S-boxes.
  Requires 2^43 known plaintexts.
  Practically demonstrated on 12 rounds, then full 16.

Both attacks confirmed:
  The S-boxes are designed well enough against these methods.
  The main weakness of DES is the 56-bit key size, not the construction.
```

---

## 3DES: An Attempt to Save DES

### The Idea

```
Apply DES three times with different keys.
Standard: ANSI X9.52, NIST SP 800-67

Three variants (keying options):

Option 1 (3TDEA, recommended):
  C = DES_K3(DES_K1^(-1)(DES_K2(P)))
  K1, K2, K3 - three independent keys (168 bits = 3 x 56)
  Effective security: 112 bits

Option 2 (2TDEA):
  C = DES_K1(DES_K2^(-1)(DES_K1(P)))
  K1 = K3, K2 - different key (112 bits = 2 x 56)
  Effective security: ~80 bits (due to meet-in-the-middle)

Option 3 (compatibility):
  C = DES_K1(DES_K1^(-1)(DES_K1(P))) = DES_K1(P)
  K1 = K2 = K3 -> plain DES (do not use!)
```

### Why EDE (Encrypt-Decrypt-Encrypt)?

```
Why E-D-E and not E-E-E?

When K1 = K2 = K3:
  E-D-E: DES_K(DES_K^(-1)(DES_K(P))) = DES_K(P)  -> plain DES (backward compatible!)
  E-E-E: DES_K(DES_K(DES_K(P)))     != DES_K(P)   -> no compatibility

EDE was chosen for backward compatibility with DES hardware:
Setting K1 = K2 = K3 yields standard DES.
This allowed gradual migration from old DES systems.
```

---

## Why 3DES is Also Weak

### 1. Meet-in-the-Middle Attack

```
Why double DES (2DES) does not give 112-bit security:

C = DES_K2(DES_K1(P))

Attack:
1. For all 2^56 values of K1: compute T = DES_K1(P), store in a table
2. For all 2^56 values of K2: compute T' = DES_K2^(-1)(C)
3. Look for a match T = T'

Memory: O(2^56)
Time:   O(2^57) operations -> roughly 2x DES brute force

2DES provides only ~57 bits of security instead of 112!

3DES (Option 1, K1 != K2 != K3):
Meet-in-the-middle is possible but harder:
Attack requires 2^112 time and 2^56 memory.
Effective security: 112 bits (not 168).

3DES (Option 2, K1 = K3):
Meet-in-the-middle reduces security to ~80 bits.
```

```python
def meet_in_the_middle_2des(plaintext: bytes, ciphertext: bytes):
    """
    Demonstration of the meet-in-the-middle principle on 2DES.
    In practice requires 2^56 operations - infeasible without ASIC/GPU.
    Here we show the PRINCIPLE with small keys.
    """
    from Crypto.Cipher import DES

    # Simplification: 3-bit "keys" for demonstration
    table = {}

    # Step 1: build table of DES_K1(P) for all K1
    for k1 in range(8):  # 2^3 = 8 options
        key1 = bytes([k1]) * 8  # simplified
        try:
            cipher1 = DES.new(key1, DES.MODE_ECB)
            mid = cipher1.encrypt(plaintext)
            table[mid] = k1
        except Exception:
            pass

    # Step 2: for each K2, check DES_K2^(-1)(C)
    for k2 in range(8):
        key2 = bytes([k2]) * 8
        try:
            cipher2 = DES.new(key2, DES.MODE_ECB)
            mid = cipher2.decrypt(ciphertext)
            if mid in table:
                print(f"Found! K1={table[mid]}, K2={k2}")
        except Exception:
            pass
```

### 2. Still a 64-bit Block

```
3DES keeps DES's block size: 64 bits.
SWEET32 applies to 3DES too!

In TLS, 3DES was used in:
TLS_RSA_WITH_3DES_EDE_CBC_SHA  (aka "DES-CBC3-SHA")

With traffic volume > 32 GB on a single key -> birthday bound hit.
The SWEET32 attack (2016) demonstrated practical exploitation.

Response:
- OpenSSL: downgraded 3DES priority
- Browsers: capped 3DES block count to 2^20 (~8 MB)
- NIST: banned 3DES for new applications (2017), fully (2023)
```

### 3. Speed: 3x Slower Than DES

```
3DES performs three DES operations.
DES is already slower than AES on modern hardware (no hardware acceleration).
AES-NI delivers AES-128-GCM at ~2-4 GB/s.
3DES-CBC: ~50-100 MB/s (30-80x slower than AES).

No hardware acceleration for 3DES in modern CPUs.
At equal or better security, AES is faster and safer.
```

### 4. Deprecation and Bans

```
Timeline:
  2005: NIST stopped recommending DES
  2008: NIST SP 800-67 Rev.1 - 3DES allowed only with Option 1
  2015: PCI DSS banned SSL and TLS 1.0, recommended avoiding 3DES
  2016: SWEET32 - practical attack on 3DES in TLS
  2017: NIST SP 800-131A Rev.2 - 3DES "not recommended"
  2023: NIST SP 800-131A Rev.3 - 3DES fully banned ("disallowed")

If you see 3DES in code or config today:
  -> it is technical debt requiring immediate replacement.
```

---

## DES Cracking: Historical Milestones

### EFF Deep Crack (1998)

```
The Electronic Frontier Foundation built a specialized machine
to crack DES and prove its insecurity.

Cost:         $250,000
Architecture: 1,856 custom ASIC chips ("Deep Crack chips")
              each testing 2.5 million keys/s
Total:        ~90 billion keys/s

RSA DES Challenge III (1999):
  Combined with distributed.net (100,000+ computers)
  Time to crack: 22 hours, 15 minutes
  Message found: "See you in Rome (Second AES Candidate Conference)"

Demonstrated: a 56-bit key is insufficient for security.
```

### COPACOBANA (2006)

```
Cost-Optimized Parallel COde Breaker
University of Bochum, Germany.

Hardware: 120 FPGAs (Xilinx Spartan-3)
Cost:     ~$10,000
Performance: 2^56 keys in 6.4 days on average

Key lesson:
  Breaking DES is not just within reach of nation-states.
  $10,000 is a budget within reach of a small organization.
```

### Modern GPU (2024)

```
RTX 4090 hashcat DES benchmark: ~2 billion keys/s
Cluster of 8x RTX 4090: ~16 billion keys/s

Time to exhaust 2^56 keys:
  8x RTX 4090: 72,057,594,037,927,936 / 16,000,000,000 ≈ 4,500,000 s ≈ 52 days

Rented cloud cluster (100x A100):
  ~500 billion keys/s -> ~1.6 days

Rental cost: a few thousand dollars.
This is accessible to any attacker with a budget.
```

---

## Attacks on DES/3DES: Summary

### Attack Table

```
Attack                  Target    Complexity         Data            Practical?
--------------------    ------    ---------------    ----------      ----------
Brute Force             DES       2^56 = 7*10^16     any CT          Yes (1998+)
Brute Force             2DES      2^57               any CT          Yes
Meet-in-the-Middle      2DES      2^57 time          2 PT-CT pairs   Yes
                                  2^56 memory
Linear (Matsui)         DES       2^43 KP            2^43 PT-CT      Theory
Differential            DES       2^47 CPA           2^47 chosen PT  Theory
SWEET32                 3DES/CBC  2^32 blocks        32 GB CT        Yes (2016+)
Weak Keys               DES       4 keys             1 PT-CT pair    Theory
Meet-in-the-Middle      3DES v1   2^112 time         2^56 PT         Theory
                                  2^56 memory
```

### Practical Attacks Today

```
DES:
  Brute force accessible in hours/days on a GPU cluster.
  Cost: a few thousand dollars.
  Any organization can crack it in a reasonable time.

2DES:
  Meet-in-the-middle: effectively 2x DES brute force.
  Provides no real security.

3DES (Option 1):
  Direct brute force requires 2^112 - not feasible.
  But SWEET32 is practical with sufficient traffic volume.
  64-bit block is a fundamental limitation.
  Slow: impractical in modern systems.
```

---

## DES / 3DES / AES Comparison

```
Parameter         DES           3DES(v1)        AES-128       AES-256
---------         ---           --------        -------       -------
Year              1977          1998            2001          2001
Block size        64 bits       64 bits         128 bits      128 bits
Key size          56 bits       168 bits        128 bits      256 bits
Eff. security     ~0 bits*      112 bits        128 bits      256 bits
Rounds            16            48 (3x16)       10            14
Speed (AES-NI)    50 MB/s       30 MB/s         4000 MB/s     2500 MB/s
HW acceleration   No            No              Yes (AES-NI)  Yes (AES-NI)
Status            Broken        Banned (2023)   Current       Current
SWEET32           Yes (64-bit)  Yes (64-bit)    No            No

* 56 bits of security = practically zero protection today
```

---

## Code: Weakness Demonstrations

### DES Weak Keys

```python
from Crypto.Cipher import DES
import os

# 4 DES weak keys (with parity bits)
WEAK_KEYS = [
    bytes.fromhex("0101010101010101"),
    bytes.fromhex("FEFEFEFEFEFEFEFE"),
    bytes.fromhex("1F1F1F1F0E0E0E0E"),
    bytes.fromhex("E0E0E0E0F1F1F1F1"),
]

def is_weak_key(key: bytes) -> bool:
    return key in WEAK_KEYS

def demonstrate_weak_key():
    key = bytes.fromhex("0101010101010101")
    plaintext = b"ABCDEFGH"  # 8 bytes

    cipher = DES.new(key, DES.MODE_ECB)
    ciphertext = cipher.encrypt(plaintext)

    # Double encryption with a weak key returns the original plaintext!
    cipher2 = DES.new(key, DES.MODE_ECB)
    double_encrypted = cipher2.encrypt(ciphertext)

    print(f"Plaintext:         {plaintext.hex()}")
    print(f"Ciphertext:        {ciphertext.hex()}")
    print(f"Double encrypted:  {double_encrypted.hex()}")
    print(f"PT == 2xEnc(PT):   {plaintext == double_encrypted}")  # True!

demonstrate_weak_key()
```

### SWEET32 Demonstration (Block Collision)

```python
from Crypto.Cipher import DES3
import os
from collections import defaultdict

def sweet32_demo():
    """
    Demonstration of birthday bound for a 64-bit block.
    In practice, 2^32 blocks (~32 GB) are needed.
    Here we show the principle on a small number of blocks.
    """
    key = os.urandom(24)   # 3DES key

    seen_blocks = defaultdict(list)
    collision_found = False

    print("Encrypting blocks with 3DES-ECB...")
    print(f"Birthday bound: collision expected at ~{2**32} blocks (~32 GB)\n")

    # Simulate a small number of blocks for demonstration
    for i in range(10000):
        plaintext = os.urandom(8)  # random 64-bit block
        cipher = DES3.new(key, DES3.MODE_ECB)
        ct = cipher.encrypt(plaintext)

        if ct in seen_blocks:
            print(f"Collision at block #{i}!")
            print(f"Ciphertext:   {ct.hex()}")
            print(f"P1: {seen_blocks[ct][0].hex()}")
            print(f"P2: {plaintext.hex()}")
            print(f"P1 XOR P2: {bytes(a^b for a,b in zip(seen_blocks[ct][0], plaintext)).hex()}")
            collision_found = True
            break
        else:
            seen_blocks[ct].append(plaintext)

    if not collision_found:
        print(f"No collision found in 10,000 blocks (expected - need 2^32)")
        print(f"Unique blocks seen: {len(seen_blocks)}")

sweet32_demo()
```

### Speed Comparison DES / 3DES / AES

```python
import time
import os
from Crypto.Cipher import DES, DES3, AES

def benchmark(name, cipher_factory, data_size=10*1024*1024):
    """Benchmark encryption (10 MB)"""
    data = os.urandom(data_size)

    start = time.perf_counter()
    cipher = cipher_factory()
    ct = cipher.encrypt(data)
    elapsed = time.perf_counter() - start

    speed = data_size / elapsed / 1024 / 1024  # MB/s
    print(f"{name:20s}: {speed:8.1f} MB/s")

key_des  = os.urandom(8)
key_3des = os.urandom(24)
key_aes  = os.urandom(32)

benchmark("DES-ECB",     lambda: DES.new(key_des, DES.MODE_ECB))
benchmark("3DES-ECB",    lambda: DES3.new(key_3des, DES3.MODE_ECB))
benchmark("AES-128-ECB", lambda: AES.new(key_aes[:16], AES.MODE_ECB))
benchmark("AES-256-ECB", lambda: AES.new(key_aes, AES.MODE_ECB))

# Approximate output (without AES-NI):
# DES-ECB             :     80.0 MB/s
# 3DES-ECB            :     27.0 MB/s
# AES-128-ECB         :   1200.0 MB/s
# AES-256-ECB         :    900.0 MB/s
```

---

## Migrating from DES/3DES to AES

### Where to Look

```
DES/3DES appears in:
- Legacy banking systems (SWIFT, HSM)
- POS terminals, ATMs (PIN Block encryption)
- Old VPN configs (IPSec: 3des-cbc)
- Old TLS cipher suites (DES-CBC3-SHA)
- Card readers, smart cards (EMV)
- Legacy database encryption

Check TLS cipher suites:
openssl s_client -connect host:443 -cipher 'DES:3DES' 2>&1 | grep Cipher

Check IPSec:
ipsec statusall | grep 3DES
```

### Replacement in OpenSSL Config

```bash
# Check which cipher suites are supported
openssl ciphers -v 'ALL' | grep -E 'DES|3DES'

# Disable DES/3DES in TLS
# In nginx.conf:
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:!3DES:!DES';

# In Apache:
SSLCipherSuite ECDHE-ECDSA-AES256-GCM-SHA384:!3DES:!DES

# Minimal TLS 1.2+ config without weak ciphers:
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:!aNULL:!eNULL:!DES:!3DES:!RC4';
```

### Replacement in Python Code

```python
# BAD: DES
from Crypto.Cipher import DES
key = os.urandom(8)
cipher = DES.new(key, DES.MODE_CBC, iv=os.urandom(8))
ct = cipher.encrypt(pad(data, 8))

# BAD: 3DES
from Crypto.Cipher import DES3
key = os.urandom(24)
cipher = DES3.new(key, DES3.MODE_CBC, iv=os.urandom(8))
ct = cipher.encrypt(pad(data, 8))

# GOOD: AES-256-GCM
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # 256-bit key
nonce = os.urandom(12)   # 96-bit nonce

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher.update(aad)                           # optional AAD
ciphertext, tag = cipher.encrypt_and_digest(data)
# Store: nonce + tag + ciphertext
```

### PIN Block: Migration in Banking Systems

```
Historical problem: PIN Block encryption in ATMs.
ISO 9564 originally used DES/3DES.

PIN Block Format 0 (3DES):
  PIN_Block = Format || PIN_Length || PIN || Padding
  Encrypted_PIN = 3DES_K(PIN_Block XOR PAN_Block)

Problems:
  - 3DES is obsolete
  - PIN Block Format 0 vulnerable to attacks on compromised HSMs

Migration (ISO 9564-1:2017):
  PIN Block Format 4: AES-256 with PAN included in encryption
  Requires HSM, ATM software, and processing upgrades

PCI DSS 4.0 (2022):
  Requires migration away from 3DES by 2025 for new systems.
```

---

## OpenSSL - Practice

```bash
# Check that DES/3DES is disabled in TLS
openssl s_client -connect example.com:443 2>/dev/null | grep -E "Cipher|Protocol"

# Force 3DES (for testing):
openssl s_client -connect example.com:443 -cipher 'DES-CBC3-SHA'
# If connection succeeds - server supports 3DES (a problem!)

# Encrypt data with DES (do NOT use in production!):
openssl enc -des-ecb -K 0102030405060708 -nosalt -in plain.txt -out enc.bin

# Encrypt with 3DES:
openssl enc -des-ede3-cbc -K 010203040506070801020304050607080102030405060708 \
    -iv 0102030405060708 -in plain.txt -out enc.bin

# Correct replacement - AES-256-GCM:
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 -in plain.txt -out enc.bin -k "password"

# Benchmark to compare:
openssl speed des des-ede3 aes-128 aes-256

# Find DES/3DES in system configs:
grep -r "3des\|DES\|des-cbc" /etc/ssl/ /etc/nginx/ /etc/apache2/ 2>/dev/null
```

---

## Cheat Sheet

```
DES:
  Key: 56 bits -> 2^56 -> cracked in hours (GPU cluster)
  Block: 64 bits -> birthday bound at 32 GB
  Weak keys: 4 total (double encryption = plaintext)
  Status: BROKEN since 1998, banned

3DES:
  Key: 168 bits (v1), effective security 112 bits (meet-in-middle)
  Block: 64 bits -> SWEET32 attack with >32 GB of traffic
  Speed: 30-80x slower than AES
  Status: banned by NIST since 2023

Attacks:
  Brute force DES:         2^56 -> hours on a GPU cluster
  Meet-in-middle 2DES:     2^57 -> provides no real security
  SWEET32 3DES:            2^32 blocks = 32 GB -> practical
  Linear cryptanalysis:    2^43 KP -> theoretical

Replacement:
  DES  -> AES-256-GCM
  3DES -> AES-256-GCM
  No padding, no MAC -> add HMAC or switch to GCM

Diagnostic commands:
  openssl ciphers -v 'ALL' | grep -E 'DES|3DES'  # find DES suites
  grep -r "3des" /etc/ 2>/dev/null                 # in configs
  openssl speed des des-ede3 aes-128               # speed comparison
```

---

## References

- [FIPS 46-3](https://csrc.nist.gov/publications/detail/fips/46/3/final) - original DES standard (withdrawn)
- [NIST SP 800-67 Rev.2](https://csrc.nist.gov/publications/detail/sp/800/67/rev2/final) - 3DES (deprecated)
- [NIST SP 800-131A Rev.3](https://csrc.nist.gov/publications/detail/sp/800/131/a/rev3/final) - algorithm transitions (3DES banned)
- [SWEET32 (CVE-2016-2183)](https://sweet32.info/) - birthday attack on 64-bit block ciphers
- [EFF Deep Crack](https://w2.eff.org/Privacy/Crypto/Crypto_misc/DESCracker/) - DES cracking 1998
- [Linear Cryptanalysis of DES (Matsui 1993)](https://link.springer.com/chapter/10.1007/3-540-48285-7_33) - original paper
- [Differential Cryptanalysis (Biham, Shamir)](https://link.springer.com/book/10.1007/978-1-4613-9314-6) - the book
- [Applied Cryptography, Schneier](https://www.schneier.com/books/applied-cryptography/) - classic reference
