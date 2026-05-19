---
title: "Padding - PKCS#7, Padding Oracle Attack"
date: "2026-05-15"
---

Padding is a mechanism for aligning data to a multiple of the block size. It sounds like a technical detail, but some of the most devastating attacks in TLS history - POODLE, BEAST, Lucky 13 - exploited it directly. Understanding padding oracles explains why the order of operations (Encrypt-then-MAC vs MAC-then-Encrypt) is a critical design choice.

---

## Why Padding is Needed

```
A block cipher (AES, DES) encrypts data in strictly fixed-size blocks.
AES: block size = 16 bytes (128 bits).

Problem: real data is rarely a multiple of 16 bytes.

"Hello" = 5 bytes - cannot be encrypted directly with AES (needs 16 bytes).
"Hello, World!!!" = 15 bytes - 1 byte short of a full block.

Solution: append filler bytes (padding) to reach the required length.
The receiver must know how to strip padding after decryption.

Modes that require padding:
  ECB: yes
  CBC: yes
  CTR: no (stream mode)
  GCM: no (stream mode)

Conclusion: padding is only needed for block ciphers in block modes.
AES-GCM and ChaCha20-Poly1305 do not require padding.
```

---

## PKCS#7: The Padding Standard

### The Rule

```
PKCS#7 (RFC 5652, also known as PKCS#5 for 8-byte blocks):

If data length is not a multiple of block size B:
  pad_len = B - (len(data) % B)
  Append pad_len bytes, each with value pad_len.

If data is already a multiple of B:
  Append a full block (B bytes) each with value B.
  (This ALWAYS appends at least one byte of padding)

For AES (B = 16):
  pad_len: from 1 to 16 inclusive.
```

### Examples

```
Block = 16 bytes. Padding values shown as \xNN.

Data: b"Hello" (5 bytes)
  pad_len = 16 - 5 = 11
  Padded:  b"Hello\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b"
                         +------------ 11 bytes of value 0x0b -----------+

Data: b"Hello, World!!!" (15 bytes)
  pad_len = 16 - 15 = 1
  Padded:  b"Hello, World!!!\x01"
                               +-- 1 byte of value 0x01

Data: b"Hello, World!!!!" (16 bytes, already a multiple)
  pad_len = 16  (append a full extra block!)
  Padded:  b"Hello, World!!!!\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10"

Data: b"AB" (2 bytes)
  pad_len = 14
  Padded:  b"AB\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e"
```

### Checking and Removing Padding

```
Unpad algorithm:

1. Read the last byte: pad_byte = data[-1]
2. Check: 1 <= pad_byte <= B
3. Check: the last pad_byte bytes all equal pad_byte
4. If valid: return data[:-pad_byte]
5. Otherwise: raise "Invalid padding" error

Examples of valid padding:
  ....\x01                  <- last byte 0x01, one padding byte
  ....\x02\x02              <- last 2 bytes = 0x02
  ....\x10\x10...\x10       <- last 16 bytes = 0x10

Examples of INVALID padding:
  ....\x00                  <- 0x00 is not valid PKCS#7 padding
  ....\x02\x03              <- last bytes are not equal
  ....\x11                  <- 0x11 = 17 > block size (16)
  ....\x02\x01              <- 0x01 != 0x02
```

```python
from Crypto.Util.Padding import pad, unpad

# Padding
data = b"Hello"
padded = pad(data, 16)
print(f"Original: {data.hex()}")
print(f"Padded:   {padded.hex()}")
# Padded: 48656c6c6f0b0b0b0b0b0b0b0b0b0b0b

# Unpadding
recovered = unpad(padded, 16)
print(f"Unpadded: {recovered}")  # b'Hello'

# Manual implementation for understanding:
def pkcs7_pad(data: bytes, block_size: int) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len] * pad_len)

def pkcs7_unpad(data: bytes, block_size: int) -> bytes:
    if not data or len(data) % block_size != 0:
        raise ValueError("Invalid data length")
    pad_byte = data[-1]
    if pad_byte == 0 or pad_byte > block_size:
        raise ValueError("Invalid padding byte")
    padding = data[-pad_byte:]
    if padding != bytes([pad_byte] * pad_byte):
        raise ValueError("Invalid padding")
    return data[:-pad_byte]

# Test
for msg in [b"A", b"Hello", b"Hello, World!!!", b"Hello, World!!!!"]:
    padded = pkcs7_pad(msg, 16)
    assert pkcs7_unpad(padded, 16) == msg
    print(f"{repr(msg):25s} -> pad_len={padded[-1]}, total={len(padded)}")
```

---

## Other Padding Schemes

```
PKCS#7 is not the only scheme. Context matters.

PKCS#5:
  Identical to PKCS#7 but only for 8-byte blocks (DES).
  The terms are often used interchangeably in code.

ISO/IEC 7816-4 (smart card padding):
  Append 0x80, then zeros up to the block boundary.
  b"Hello" -> b"Hello\x80\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  If already aligned: append 0x80 + zeros.

Zero Padding:
  Append zeros until block boundary.
  b"Hello" -> b"Hello\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  Problem: cannot distinguish data ending in 0x00 from padding!
  Do not use for arbitrary binary data.

ANSI X9.23:
  Append random bytes + last byte = padding length.
  Like PKCS#7 but with randomization.

Ciphertext Stealing (CTS):
  Does not add bytes - "steals" part of the last block.
  Ciphertext length = plaintext length exactly.
  Used in NTFS encryption, some AES-XTS variants.

TLS Record Layer:
  TLS 1.2 + CBC: PKCS#7 padding.
  TLS 1.3: no CBC -> no padding oracle possible.
```

---

## CBC Decryption: How It Works

```
Understanding CBC decryption exactly is prerequisite for the Padding Oracle.

CBC encryption:
  C_0 = IV
  C_i = E_K(P_i XOR C_{i-1})

CBC decryption:
  P_i = D_K(C_i) XOR C_{i-1}

Where D_K is the inverse block cipher function (AES Decrypt).

Key property:
  P_i depends on D_K(C_i) and C_{i-1}.
  Changing C_{i-1} directly and predictably changes P_i.
  Changing C_i randomizes D_K(C_i), which randomly changes P_i.

Intermediate value:
  I_i = D_K(C_i)   <- "intermediate", block decryption result
  P_i = I_i XOR C_{i-1}

If we know I_i and C_{i-1}, we know P_i.
The padding oracle lets us recover I_i without knowing K.
```

```
CBC decryption diagram:

C_{i-1}     C_i
   |          |
   |        D_K()     <- one AES block decryption
   |          |
   |         I_i      <- intermediate value
   |          |
   +---XOR---+
              |
             P_i      <- plaintext block i
```

---

## Padding Oracle: Attack Principle

### What is an Oracle

```
An Oracle in cryptography is a function that answers queries
and thereby leaks information about a secret.

A Padding Oracle is a system (server, function) that:
  Accepts: arbitrary ciphertext
  Returns: "padding valid" or "padding invalid"

This can be explicit (different error codes) or implicit (timing).

Real-world examples:
  "MAC verification failed" vs "Padding error"  <- explicit padding oracle
  200 OK vs 403 Forbidden                       <- explicit
  Fast response vs slow response                <- timing oracle (Lucky 13)
  Connection drops immediately vs after processing <- timing oracle
```

### Attack: Byte-by-Byte Recovery

```
Goal: decrypt block C_i, knowing C_{i-1} and C_i.

Method: manipulate C_{i-1} to get a controlled P_i.

Step 1: recover the last byte P_i[15]

  We want: P'_i[15] = 0x01 (minimal valid padding)

  P'_i[15] = I_i[15] XOR C'_{i-1}[15]

  If P'_i[15] = 0x01, then:
    I_i[15] XOR C'_{i-1}[15] = 0x01
    I_i[15] = 0x01 XOR C'_{i-1}[15]

  Try C'_{i-1}[15] from 0x00 to 0xFF (256 options).
  For which value does the oracle say "padding valid"?

  Once found:
    I_i[15] = C'_{i-1}[15] XOR 0x01
    P_i[15] = I_i[15] XOR C_{i-1}[15]   <- original C_{i-1}[15]

Step 2: recover P_i[14]

  Now we want padding \x02\x02:
    P'_i[15] = 0x02  -> C'_{i-1}[15] = I_i[15] XOR 0x02  <- we know I_i[15]!
    P'_i[14] = 0x02  -> try all C'_{i-1}[14] values

  When oracle says "valid" -> we found I_i[14]
    P_i[14] = I_i[14] XOR C_{i-1}[14]

Step 3: P_i[13] - same approach, target padding \x03\x03\x03
...
Step 16: P_i[0] - padding \x10\x10...\x10 (16 bytes)

Total oracle queries: 256 * 16 = 4096 per block worst case.
For N blocks: 4096 * N queries (average: 128 * 16 = 2048).
```

---

## Full Attack Implementation

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

# ─── Victim server setup ──────────────────────────────────────────────────────

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt(plaintext: bytes) -> tuple[bytes, bytes]:
    """Server encrypts data. IV and CT are returned to the client."""
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return IV, cipher.encrypt(pad(plaintext, 16))

def server_decrypt(iv: bytes, ciphertext: bytes) -> bool:
    """
    Vulnerable server: returns different errors for padding vs data errors.
    This IS the padding oracle!
    """
    cipher = AES.new(KEY, AES.MODE_CBC, iv)
    try:
        decrypted = cipher.decrypt(ciphertext)
        unpad(decrypted, 16)   # raises ValueError on bad padding
        return True            # "200 OK" - padding is valid
    except ValueError:
        return False           # "403 Forbidden" - padding is invalid

# ─── Attack ───────────────────────────────────────────────────────────────────

def padding_oracle_attack(iv: bytes, ciphertext: bytes) -> bytes:
    """
    Recovers plaintext from iv + ciphertext
    using only access to the padding oracle.
    No key needed.
    """
    block_size = 16

    # Split ciphertext into blocks
    blocks = [iv] + [
        ciphertext[i:i+block_size]
        for i in range(0, len(ciphertext), block_size)
    ]
    # blocks[0] = IV, blocks[1] = C_1, blocks[2] = C_2, ...

    plaintext = bytearray()

    # Attack each block starting from the first ciphertext block
    for block_idx in range(1, len(blocks)):
        target_block = blocks[block_idx]      # C_i
        prev_block   = blocks[block_idx - 1]  # C_{i-1}

        # Intermediate bytes I_i = D_K(C_i)
        intermediate = bytearray(block_size)

        # Recover bytes from the end of the block
        for byte_pos in range(block_size - 1, -1, -1):
            pad_byte = block_size - byte_pos  # desired padding byte value

            # Build modified C'_{i-1}
            # Bytes AFTER byte_pos are already known -> set them for desired padding
            crafted_prev = bytearray(block_size)
            for k in range(byte_pos + 1, block_size):
                crafted_prev[k] = intermediate[k] ^ pad_byte

            # Try all values for byte_pos
            found = False
            for guess in range(256):
                crafted_prev[byte_pos] = guess

                # Ask the oracle
                if server_decrypt(bytes(crafted_prev), target_block):
                    # Found! Extra check for the last byte
                    # (to exclude false positives: 0x02 0x02 vs 0x01)
                    if byte_pos == block_size - 1:
                        if byte_pos > 0:
                            alt = bytearray(crafted_prev)
                            alt[byte_pos - 1] ^= 0x01
                            if not server_decrypt(bytes(alt), target_block):
                                continue  # false positive, keep searching

                    # I_i[byte_pos] = guess XOR pad_byte
                    intermediate[byte_pos] = guess ^ pad_byte
                    found = True
                    break

            if not found:
                raise RuntimeError(
                    f"Could not find byte {byte_pos} in block {block_idx}"
                )

        # P_i = I_i XOR C_{i-1} (the original previous block)
        pt_block = bytes(
            i ^ p for i, p in zip(intermediate, prev_block)
        )
        plaintext += pt_block
        print(f"  Block {block_idx} decrypted: {pt_block}")

    # Strip padding from result
    return bytes(unpad(plaintext, block_size))


# ─── Demonstration ────────────────────────────────────────────────────────────

secret = b"Attack at dawn!!"   # 16 bytes
iv, ct = encrypt(secret)

print(f"Encrypted: {ct.hex()}")
print(f"Key is unknown. Running padding oracle attack...\n")

recovered = padding_oracle_attack(iv, ct)
print(f"\nRecovered: {recovered}")
assert recovered == secret
print("Attack successful!")
```

---

## Byte-by-Byte Walkthrough

```
Step-by-step recovery of P_1[15] (last byte of the first block).

Inputs:
  IV = C_0 = [b0, b1, ..., b15]    <- known
  C_1      = [c0, c1, ..., c15]    <- known
  P_1[15]  = ?                      <- we want this

Inside the server during decryption:
  I_1 = D_K(C_1)                   <- intermediate, NOT KNOWN
  P_1 = I_1 XOR C_0                <- P_1[15] = I_1[15] XOR b15

Attack:
  Create C'_0 = [b0, b1, ..., b14, x] where x iterates 0..255.
  Send [C'_0 || C_1] to the server.

  Server computes:
    P'_1 = D_K(C_1) XOR C'_0 = I_1 XOR C'_0

  We care about: P'_1[15] = I_1[15] XOR x

  When x = 0x42 (for example) oracle says "valid":
    P'_1[15] = 0x01  (only valid last-byte padding: \x01)
    I_1[15] XOR 0x42 = 0x01
    I_1[15] = 0x01 XOR 0x42 = 0x43

  Original plaintext:
    P_1[15] = I_1[15] XOR b15 = 0x43 XOR b15

Note: the entire P'_0 block becomes random garbage,
but that doesn't matter - we only care about P'_1 padding.
```

---

## False Positives

```
Problem when recovering the last byte:

Suppose I_i[15] = 0x42 and correct answer is x = 0x43 (padding 0x01).

But it may happen that for some x = y the oracle also says "valid":
  P'_i[15] = 0x02
  P'_i[14] = 0x02  <- RANDOMLY coincides!

Then padding \x02\x02 is also valid -> false positive.

Solution:
  When "valid" is found for the last byte, additionally verify:
    Flip byte_pos - 1 (the second-to-last byte).
    If oracle still says "valid" -> padding is genuinely 0x01.
    If "invalid" -> it was \x02\x02, continue searching.

For non-last bytes (byte_pos < 15):
  We explicitly set bytes AFTER byte_pos to the desired values.
  False positives are practically impossible.
```

---

## Real-World Attacks

### POODLE (2014)

```
Padding Oracle On Downgraded Legacy Encryption
CVE-2014-3566

Target: SSL 3.0 with CBC encryption.

SSL 3.0 padding:
  Last byte = padding length.
  Remaining padding bytes may be ARBITRARY!
  Only the last byte is checked.
  This makes the padding oracle trivial.

Attack:
  Attacker position: MITM (network eavesdropper + JavaScript injection)
  Method:
    1. Attacker injects JavaScript into a page the victim visits
    2. JavaScript forces the browser to make requests to target.com
       with the victim's cookies (cross-origin via forms or CORS)
    3. Attacker intercepts TLS traffic and modifies ciphertext
    4. Server: "padding error" -> attacker knows they guessed correctly
    5. 256 requests per byte * 16 * N_blocks = cookie recovered

  Downgrade: attacker interferes with the TLS handshake,
  forcing client and server to fall back to SSL 3.0.

Result: session cookie recovered from HTTPS.
Fix: disable SSL 3.0 (TLS_FALLBACK_SCSV).
```

### BEAST (2011)

```
Browser Exploit Against SSL/TLS
CVE-2011-3389

Target: TLS 1.0 + CBC

TLS 1.0 vulnerability:
  IV for the next record = last ciphertext block of the previous record.
  IV is predictable to the attacker!

Attack (chosen-plaintext via predictable IV):
  Attacker knows the IV of the next request.
  Can determine one byte at a time via server reaction (CPA, not padding oracle).

Result: cookie recovered byte by byte.
Fix: prepend an empty record before each one (changes IV).
     TLS 1.1+ uses an explicit random IV.
```

### Lucky 13 (2013)

```
Authors: Al Fardan, Paterson.
Target: TLS + CBC + HMAC (including encrypt-then-MAC!)

Timing oracle:
  With invalid padding, the server throws an exception EARLIER.
  With valid padding, it computes HMAC over more data.
  Difference: ~2 microseconds depending on the amount of data for HMAC.

This is a timing side-channel, not an explicit padding oracle!
Even Encrypt-then-MAC did not protect in some implementations.

Root cause:
  Implementations computed HMAC even for bad padding (to protect from timing).
  But the amount of data fed to HMAC depended on the "correct" padding length.
  Different HMAC input size -> timing leak.

Fix:
  Constant-time implementation of CBC padding + HMAC verification.
  Always feed a fixed number of blocks to HMAC regardless of padding.
  Or: upgrade to TLS 1.3 (no CBC, no padding oracle).
```

### ROBOT (2018)

```
Return Of Bleichenbacher's Oracle Threat
CVE-2017-13099 and others

Target: RSA PKCS#1 v1.5 in TLS (not CBC, but the same principle).

Bleichenbacher 1998: padding oracle attack on RSA PKCS#1 v1.5.
  RSA encrypts with padding: 0x00 0x02 [random non-zero] 0x00 [message]
  If server says "padding invalid": attacker learns significant information.
  ~1 million queries -> session key recovered.

ROBOT 2018: rediscovered in 27 products after 19 years.
Including: Facebook, Citrix, F5, Cisco, Broadcom, Palo Alto.

Lesson: padding oracle attacks remain effective for decades.
TLS 1.3: RSA key exchange removed -> no RSA padding oracle.
```

---

## Checking for Padding Oracles

```python
import time
import os
import hmac as hmac_module
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt_example(msg: bytes) -> bytes:
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return IV + cipher.encrypt(pad(msg, 16))

def vulnerable_decrypt(ciphertext: bytes) -> tuple[bool, str]:
    """
    VULNERABLE: different errors for padding vs data errors.
    This IS a padding oracle!
    """
    from Crypto.Util.Padding import unpad
    iv = ciphertext[:16]
    ct = ciphertext[16:]
    try:
        cipher = AES.new(KEY, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(ct)
        unpad(decrypted, 16)
        return True, "OK"
    except ValueError as e:
        if "Padding" in str(e):
            return False, "Invalid padding"   # LEAK! Padding oracle.
        return False, "Invalid data"

def timing_oracle_check():
    """
    Check for timing oracle: does the server respond in constant time?
    A large timing difference for different ciphertexts = timing oracle.
    """
    ct = encrypt_example(b"test message 123")

    # Time for valid ciphertext
    times_valid = []
    for _ in range(100):
        t0 = time.perf_counter()
        try:
            from Crypto.Util.Padding import unpad
            AES.new(KEY, AES.MODE_CBC, ct[:16]).decrypt(ct[16:])
        except Exception:
            pass
        times_valid.append(time.perf_counter() - t0)

    # Time for random (bad padding) ciphertext
    random_ct = ct[:16] + os.urandom(len(ct) - 16)
    times_invalid = []
    for _ in range(100):
        t0 = time.perf_counter()
        try:
            AES.new(KEY, AES.MODE_CBC, random_ct[:16]).decrypt(random_ct[16:])
        except Exception:
            pass
        times_invalid.append(time.perf_counter() - t0)

    avg_valid   = sum(times_valid) / len(times_valid) * 1e6
    avg_invalid = sum(times_invalid) / len(times_invalid) * 1e6
    diff = abs(avg_valid - avg_invalid)

    print(f"Average time (valid CT):   {avg_valid:.2f} us")
    print(f"Average time (invalid CT): {avg_invalid:.2f} us")
    print(f"Difference: {diff:.2f} us")
    if diff > 50:
        print("WARNING: possible timing oracle!")
    else:
        print("Timing difference within normal range")

timing_oracle_check()
```

---

## Defenses Against Padding Oracle

### Defense 1: Encrypt-then-MAC

```
The order of operations is critical.

Encrypt-then-MAC (secure):
  1. Encrypt: C = AES_CBC_K1(P)
  2. MAC:     T = HMAC_K2(C)
  3. Send:    C || T

  Receiver:
  1. Verify: HMAC_K2(C) == T  (constant time!)
  2. If NO -> reject, DO NOT decrypt
  3. Decrypt: P = AES_CBC_K1^{-1}(C)
  4. Unpad

  KEY POINT: decryption only after MAC verification.
  Bad padding never reaches the check - MAC already rejected it.

MAC-then-Encrypt (vulnerable - SSL, TLS < 1.2):
  1. MAC:     T = HMAC_K(P)
  2. Encrypt: C = AES_CBC_K(P || T)

  Receiver:
  1. Decrypt: D = AES_CBC_K^{-1}(C)  <- padding is checked HERE!
  2. Verify MAC
  Padding is checked BEFORE MAC -> padding oracle is possible.

Encrypt-and-MAC (vulnerable - SSH v1):
  Information leaks through MAC computed over plaintext.
```

### Defense 2: AEAD Instead of CBC

```
Best solution: don't use CBC at all.
AES-GCM and ChaCha20-Poly1305 are AEAD algorithms.

GCM does not use padding -> no padding oracle possible.
Authentication tag is verified BEFORE returning data.
Any modification to ciphertext -> tag mismatch -> rejection.

# BAD (CBC without MAC):
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

cipher = AES.new(key, AES.MODE_CBC, iv=iv)
ct = cipher.encrypt(pad(plaintext, 16))

cipher = AES.new(key, AES.MODE_CBC, iv=iv)
pt = unpad(cipher.decrypt(ct), 16)  # vulnerable!

# GOOD (GCM):
cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
ct, tag = cipher.encrypt_and_digest(plaintext)

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
pt = cipher.decrypt_and_verify(ct, tag)  # tag checked first!
```

### Defense 3: Constant-Time Operations

```python
import hmac

def safe_mac_verify(expected_tag: bytes, received_tag: bytes) -> bool:
    """
    MAC comparison must be constant-time.
    Regular == terminates at the first mismatched byte -> timing attack.
    """
    # BAD: timing attack via early termination
    # return expected_tag == received_tag

    # GOOD: hmac.compare_digest runs in constant time
    return hmac.compare_digest(expected_tag, received_tag)

def safe_decrypt_with_mac(key_enc: bytes, key_mac: bytes,
                          iv: bytes, ciphertext: bytes,
                          received_tag: bytes) -> bytes:
    """
    Secure CBC + HMAC implementation (Encrypt-then-MAC).
    """
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad

    # Step 1: compute expected MAC (over ciphertext)
    expected_tag = hmac.new(key_mac, iv + ciphertext,
                            digestmod='sha256').digest()

    # Step 2: constant-time comparison
    if not hmac.compare_digest(expected_tag, received_tag):
        raise ValueError("Decryption failed")
        # Do NOT reveal the reason: not "padding error", not "MAC error"
        # Just: "Decryption failed"

    # Step 3: only decrypt after successful MAC verification
    cipher = AES.new(key_enc, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(ciphertext)

    # Step 4: unpad (now safe - data is authenticated)
    return unpad(decrypted, 16)
```

### Defense 4: Single Generic Error

```python
def hardened_server_endpoint(encrypted_data: bytes) -> str:
    """
    Server NEVER reveals the reason for a decryption failure.
    """
    try:
        result = safe_decrypt_with_mac(...)
        return process_data(result)
    except Exception:
        # ALWAYS the same error:
        # - NOT "Padding error"
        # - NOT "MAC mismatch"
        # - NOT "Invalid block length"
        return "Request processing failed"

    # Additionally: equal response time regardless of failure reason
    # Use time.sleep() to equalize timing on errors
```

### Defense 5: TLS 1.3

```
The simplest solution: use TLS 1.3.

TLS 1.3 eliminated all CBC-related vulnerabilities:
  - CBC removed from cipher suites entirely
  - RSA key exchange removed
  - Only AEAD: AES-GCM, ChaCha20-Poly1305
  - Padding oracle not possible by construction

nginx configuration for TLS 1.3:
  ssl_protocols TLSv1.3;
  ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;

If TLS 1.2 is needed (compatibility):
  Forbid CBC cipher suites:
  ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:!CBC:!3DES:!RC4';
```

---

## Attack Complexity and Practicality

```
Number of oracle queries:

Per block (16 bytes):
  Worst case:  256 * 16 = 4,096 queries
  Average:     128 * 16 = 2,048 queries (256/2 average per byte)

For a message of N blocks: ~2048 * N queries

Example (session cookie, 32 bytes = 2 blocks):
  ~4,096 queries

POODLE: ~256 queries per byte (due to SSL 3.0 padding specifics).
Keep-alive session: 1000 requests/s -> 4 seconds per block.

Network latency: 100ms RTT -> 4096 * 0.1 = 410 seconds per block.
Parallel requests speed up the attack significantly.

Real attacks took from minutes to a few hours
depending on latency and message length.
```

---

## OpenSSL and Diagnostics

```bash
# Check TLS cipher suites of a server (look for CBC)
openssl s_client -connect target.com:443 2>/dev/null | grep "Cipher is"

# Force CBC cipher suites check
openssl s_client -connect target.com:443 \
    -cipher 'AES256-SHA:AES128-SHA:DES-CBC3-SHA' 2>/dev/null | grep Cipher
# If connection succeeds - server supports vulnerable CBC suites!

# Check for SSL 3.0 support (POODLE)
openssl s_client -connect target.com:443 -ssl3 2>&1 | grep -E "Protocol|error"

# Check TLS version
openssl s_client -connect target.com:443 2>/dev/null | grep "Protocol"

# Scan with testssl.sh
./testssl.sh --poodle --beast --lucky13 target.com

# nmap script
nmap --script ssl-poodle target.com -p 443

# nginx config without vulnerable CBC:
# ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384:!CBC';
# ssl_protocols TLSv1.2 TLSv1.3;
```

---

## Cheat Sheet

```
PKCS#7 Padding:
  pad_len = B - (len(data) % B)  [1..B]
  Append pad_len bytes each with value pad_len
  If data is already a multiple of B: append B bytes of value B

  AES examples (B=16):
  "Hi" (2 bytes)   -> "Hi" + b"\x0e" * 14
  "Hello World!!!!!" (17 bytes) -> + b"\x0f" * 15

Padding Oracle Attack:
  Requires: CBC encryption + server reveals padding status
  Queries: 256 * 16 * N_blocks (worst case)
  Result: full plaintext recovery without the key
  Attacks: POODLE (SSL 3.0), BEAST (TLS 1.0), Lucky 13 (timing)

Defenses:
  1. AEAD (AES-GCM, ChaCha20-Poly1305) - best solution
  2. Encrypt-then-MAC (not MAC-then-Encrypt)
  3. Verify MAC BEFORE decrypting
  4. Constant-time comparison (hmac.compare_digest)
  5. Single generic error (never reveal the reason)
  6. TLS 1.3 (no CBC at all)

Priority:
  New code:    AES-256-GCM or ChaCha20-Poly1305
  TLS:         TLS 1.3 mandatory
  Legacy CBC:  + HMAC-SHA256 (Encrypt-then-MAC) + constant-time

Diagnostics:
  openssl s_client -connect host:443 -cipher 'AES256-SHA'  # CBC?
  nmap --script ssl-poodle host -p 443
  testssl.sh --poodle --lucky13 host
```

---

## References

- [POODLE CVE-2014-3566](https://www.openssl.org/~bodo/ssl-poodle.pdf) - original paper
- [Lucky 13 (Al Fardan, Paterson)](https://www.isg.rhul.ac.uk/tls/Lucky13.html) - timing oracle
- [BEAST (Duong, Rizzo)](https://vnhacker.blogspot.com/2011/09/beast.html) - predictable IV in TLS 1.0
- [ROBOT Attack](https://robotattack.org/) - Bleichenbacher returns
- [Bleichenbacher 1998 (RSA PKCS#1)](https://link.springer.com/chapter/10.1007/BFb0055716) - original attack
- [RFC 5652](https://www.rfc-editor.org/rfc/rfc5652) - PKCS#7 / CMS (padding)
- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2 (CBC + padding)
- [Cryptopals Set 3, Challenge 17](https://cryptopals.com/sets/3/challenges/17) - attack implementation
