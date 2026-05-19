---
title: "AES - Attacks on Weak Modes (ECB Oracle)"
date: "2026-05-15"
---

An ECB oracle is a class of attacks where an attacker uses access to an encryption function (the oracle) to recover secret data byte-by-byte without knowing the key. These attacks are possible due to the fundamental property of ECB: identical plaintext always produces identical ciphertext.

---

## Why ECB is Vulnerable

```
ECB (Electronic Codebook) encrypts each 16-byte block independently:

Ci = AES_K(Pi)

The core problem is determinism:
P = P'  =>  AES_K(P) = AES_K(P')

If an attacker controls part of the oracle's input,
they can manipulate block boundaries and recover the secret byte by byte.

No diffusion between blocks, no randomization (no IV, no nonce).
Each block is an isolated, predictable operation.
```

---

## Byte-at-a-time ECB Decryption (Simple Case)

### Attack Overview

```
The oracle does the following:
  Ciphertext = AES_ECB_K(Attacker_Input || Secret)

The attacker controls Attacker_Input.
Secret - the unknown bytes to recover.

Key idea:
Craft Attacker_Input so that one byte of Secret
lands at the end of a known block.
Then try all 256 values for that byte
and compare the ciphertext.
```

### Step 1: Determine Block Size

```python
def detect_block_size(oracle):
    """Detect the AES oracle's block size"""
    initial_len = len(oracle(b""))
    for i in range(1, 64):
        ct = oracle(b"A" * i)
        if len(ct) > initial_len:
            # Block size = difference in length
            return len(ct) - initial_len
    return None

# block_size = 16 (always for AES)
```

### Step 2: Confirm ECB Mode

```python
def detect_ecb(oracle, block_size):
    """Two identical blocks -> ECB"""
    ct = oracle(b"A" * block_size * 2)
    blocks = [ct[i:i+block_size] for i in range(0, len(ct), block_size)]
    return len(blocks) != len(set(blocks))  # True if ECB

# In ECB: two blocks "AAAA...AAAA" produce the same ciphertext
```

### Step 3: Recover the First Secret Byte

```
Oracle: AES_ECB_K(input || secret)

Send 15 bytes of 'A':  AES_ECB_K("AAAAAAAAAAAAAAA" || secret[0] || ...)
                                   |_____ block 1 ___________________|

Block 1 = AES_K("AAAAAAAAAAAAAAA" + secret[0])

Now try all 256 values of x:
AES_ECB_K("AAAAAAAAAAAAAAA" + chr(x))
                               |__ target block

When the first block's ciphertext matches - we found secret[0].
```

```python
def recover_byte(oracle, known_bytes, block_size):
    """Recover the next byte of the secret"""
    # How many padding bytes to push secret[len(known)] to
    # the last position in a block
    pad_len = block_size - (len(known_bytes) % block_size) - 1
    padding = b"A" * pad_len

    # Which block we are targeting
    block_index = len(known_bytes) // block_size
    block_start = block_index * block_size
    block_end   = block_start + block_size

    # Target ciphertext (one unknown byte at end of block)
    target_ct = oracle(padding)[block_start:block_end]

    # Try all 256 values
    for byte_val in range(256):
        candidate = padding + known_bytes + bytes([byte_val])
        ct = oracle(candidate)[block_start:block_end]
        if ct == target_ct:
            return bytes([byte_val])

    return None

def full_ecb_attack(oracle, block_size):
    """Full recovery of the secret"""
    known = b""

    while True:
        byte = recover_byte(oracle, known, block_size)
        if byte is None:
            break
        known += byte
        print(f"[+] Recovered {len(known)} bytes: {known}")

    return known
```

### Full Attack Demonstration

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import os

# Simulated vulnerable oracle
KEY    = os.urandom(16)
SECRET = b"SuperSecretData!"  # what we want to recover

def vulnerable_oracle(attacker_input: bytes) -> bytes:
    plaintext = attacker_input + SECRET
    cipher = AES.new(KEY, AES.MODE_ECB)
    return cipher.encrypt(pad(plaintext, 16))

# Attack
block_size = detect_block_size(vulnerable_oracle)
print(f"Block size: {block_size}")

is_ecb = detect_ecb(vulnerable_oracle, block_size)
print(f"ECB mode: {is_ecb}")

recovered = full_ecb_attack(vulnerable_oracle, block_size)
print(f"Recovered: {recovered}")
# Recovered: b'SuperSecretData!'
```

---

## Byte-at-a-time ECB Decryption (Hard Case)

### When There is a Random Prefix Before the Secret

```
Oracle: AES_ECB_K(Random_Prefix || Attacker_Input || Secret)

Random_Prefix is generated once at server startup (constant).
Its length is unknown.

The attack is harder: we first need to "align" the prefix to a block boundary.
```

```python
def find_prefix_length(oracle, block_size):
    """Determine the length of the random prefix"""
    # Send two different inputs - find the first differing block
    ct1 = oracle(b"A" * block_size * 2)
    ct2 = oracle(b"B" * block_size * 2)

    blocks1 = [ct1[i:i+block_size] for i in range(0, len(ct1), block_size)]
    blocks2 = [ct2[i:i+block_size] for i in range(0, len(ct2), block_size)]

    # Find the first block where they differ
    prefix_block = 0
    for i, (b1, b2) in enumerate(zip(blocks1, blocks2)):
        if b1 != b2:
            prefix_block = i
            break

    # Find the exact byte - add padding until two target blocks become identical
    for pad_len in range(block_size):
        ct = oracle(b"A" * (pad_len + block_size * 2))
        blocks = [ct[i:i+block_size] for i in range(0, len(ct), block_size)]
        if blocks[prefix_block] == blocks[prefix_block + 1]:
            prefix_len = prefix_block * block_size - pad_len
            return prefix_len, pad_len

    return None, None

def attack_with_prefix(oracle, block_size):
    """ECB attack in the presence of a random prefix"""
    prefix_len, align_pad = find_prefix_length(oracle, block_size)
    print(f"Prefix length: {prefix_len}, alignment pad: {align_pad}")

    # Proceed as in the simple case,
    # but always prepend align_pad bytes to our input
    prefix_blocks = (prefix_len + align_pad) // block_size
    skip_bytes    = prefix_blocks * block_size

    known = b""
    secret_max_len = len(oracle(b"A" * align_pad)) - skip_bytes

    for i in range(secret_max_len):
        pad_len = block_size - (len(known) % block_size) - 1
        padding = b"A" * (align_pad + pad_len)

        block_index = prefix_blocks + len(known) // block_size
        block_start = block_index * block_size
        block_end   = block_start + block_size

        target_ct = oracle(padding)[block_start:block_end]

        found = False
        for byte_val in range(256):
            candidate = padding + known + bytes([byte_val])
            ct = oracle(candidate)[block_start:block_end]
            if ct == target_ct:
                known += bytes([byte_val])
                found = True
                break

        if not found:
            break

    return known
```

---

## ECB Cut-and-Paste Attack

### Idea

```
By rearranging ciphertext blocks, an attacker constructs
a new "message" with a different meaning.
ECB allows this because blocks are independent.
```

### Scenario: Privilege Escalation

```
The server encrypts a user profile in ECB:
profile = "email=user@mail.com&role=user"

Encrypted in 16-byte blocks:
Block 0: "email=user@mail."
Block 1: "com&role=user\x03\x03\x03"

Goal: craft a profile with role=admin.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os
import urllib.parse

KEY = os.urandom(16)

def profile_for(email: str) -> bytes:
    """Create an encrypted profile"""
    # Strip & and = from email (sanitization)
    email = email.replace("&", "").replace("=", "")
    profile = f"email={email}&role=user"
    cipher = AES.new(KEY, AES.MODE_ECB)
    return cipher.encrypt(pad(profile.encode(), 16))

def parse_profile(ciphertext: bytes) -> dict:
    """Decrypt a profile"""
    cipher = AES.new(KEY, AES.MODE_ECB)
    plaintext = unpad(cipher.decrypt(ciphertext), 16).decode()
    return dict(urllib.parse.parse_qsl(plaintext))

# Attack:
# Step 1: craft a block containing "admin" + PKCS7 padding
# "email=AAAAAAAAAA" | "admin\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b" | "&role=user..."
#  block 0 (16 bytes)   block 1 (16 bytes)

crafted_email_1 = "A" * 10 + "admin" + "\x0b" * 11
ct1 = profile_for(crafted_email_1)
admin_block = ct1[16:32]  # block 1 contains "admin" with padding

# Step 2: craft a profile where "user" starts EXACTLY at a block boundary
# "email=" (6) + email + "&role=" (6) = multiple of 16
# 6 + N + 6 = 16 -> N = 4 => email = "AAAA"
# "email=AAAA&role=" = 16 bytes, exactly 1 block!
crafted_email_2 = "A" * 4
ct2 = profile_for(crafted_email_2)

# ct2 blocks:
# Block 0: "email=AAAA&role="  (16 bytes)
# Block 1: "user" + padding

# Final: take blocks from ct2 and splice in admin_block instead of the "user" block
forged_ct = ct2[:32] + admin_block  # block 0 + block 1(role=) + admin block

parsed = parse_profile(forged_ct)
print(parsed)  # {'email': 'AAAA', 'role': 'admin'}
```

### General Principle

```
ECB cut-and-paste works because:
1. Ciphertext blocks are independent
2. Modifying one block does not affect the others during decryption
3. Blocks can be freely rearranged, duplicated, or removed

Defense: use CBC or GCM - changing any block corrupts
all subsequent decrypted blocks (CBC),
or fails the tag verification (GCM).
```

---

## Pattern-Based ECB Attacks

### Visual Attack on Images

```
Classic textbook example:

Encrypting a bitmap image (Linux Tux) in ECB:
- Pixels of the same color form identical 16-byte blocks
- ECB maps each block to the same ciphertext
- The image structure is preserved - the outline is visible!

What happens in CBC/GCM:
- Even identical plaintext blocks -> different ciphertext
- The image looks like random noise

This clearly shows: ECB does not hide data patterns.
```

```python
from PIL import Image
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import os

def encrypt_image_ecb(img_path: str, out_path: str):
    """Encrypt only the pixels, preserve the header"""
    img = Image.open(img_path)
    header = img.tobytes()[:54]       # BMP header
    pixel_data = img.tobytes()[54:]

    key = os.urandom(16)
    cipher = AES.new(key, AES.MODE_ECB)
    encrypted_pixels = cipher.encrypt(pad(pixel_data, 16))

    # Save: original header + encrypted pixels
    # Image structure is still visible - patterns are preserved!
    with open(out_path, 'wb') as f:
        f.write(header + encrypted_pixels[:len(pixel_data)])
```

### Attack on ECB-Encrypted Logs

```
Scenario: a server logs events in encrypted form (ECB).
Format: [timestamp 8 bytes][user_id 4 bytes][action 4 bytes]

Block = exactly 16 bytes.

Observation: if two ciphertext blocks are identical ->
the same event (user + action) happened twice.

An attacker can:
1. Determine when a user performed the same action
2. Count event frequencies from ciphertext patterns
3. Reconstruct the sequence of actions without knowing the key

This is a confidentiality breach even without decrypting anything!
```

---

## Padding Oracle Attack (on CBC)

### Core Idea

```
CBC decryption:
Pi = AES_K^(-1)(Ci) XOR C(i-1)

If the server returns different errors for:
- "Invalid padding"  (padding error)
- "Invalid data"     (logic error after successful decryption)

An attacker can recover plaintext byte by byte.
No key needed.
```

### Attack Mechanism (Step by Step)

```
Goal: decrypt block C2, knowing C1 and C2.

Step 1: recover the last byte P2[15]

  Modify C1' = C1, varying the last byte C1[15]:
  C1'[15] = C1[15] XOR x  (try x from 0 to 255)

  Send [C1' || C2] to the server.
  Server decrypts: P2' = AES_K^(-1)(C2) XOR C1'

  For which x is the padding valid?
  If P2'[15] = 0x01 -> padding \x01 is valid!

  P2'[15] = 0x01
  AES_K^(-1)(C2)[15] XOR C1'[15] = 0x01
  AES_K^(-1)(C2)[15] = 0x01 XOR C1'[15]
                      = 0x01 XOR C1[15] XOR x

  But we know:
  P2[15] = AES_K^(-1)(C2)[15] XOR C1[15]
         = 0x01 XOR x   <- recovered!

Step 2: recover P2[14]

  Now we need padding \x02\x02.
  Set C1'[15] so that P2'[15] = 0x02:
  C1'[15] = AES_K^(-1)(C2)[15] XOR 0x02
           = (P2[15] XOR C1[15]) XOR 0x02

  Try all values of C1'[14] until P2'[14] = 0x02.

  Continue for each byte...
```

```python
def padding_oracle_attack(ciphertext: bytes, oracle_func, block_size: int = 16):
    """
    oracle_func(ct) -> True if padding is valid, False otherwise
    Returns the decrypted text
    """
    blocks = [ciphertext[i:i+block_size]
              for i in range(0, len(ciphertext), block_size)]

    plaintext = b""

    # Attack each block starting from the second
    for block_idx in range(1, len(blocks)):
        ct_block   = blocks[block_idx]
        prev_block = blocks[block_idx - 1]

        # Intermediate bytes: AES_K^(-1)(ct_block)
        intermediate = bytearray(block_size)

        # Recover bytes from the end
        for byte_pos in range(block_size - 1, -1, -1):
            pad_byte = block_size - byte_pos  # desired padding byte

            # Form C1' using already-known intermediate bytes
            c1_prime = bytearray(block_size)
            for k in range(byte_pos + 1, block_size):
                c1_prime[k] = intermediate[k] ^ pad_byte

            # Try all values for the current byte
            found = False
            for guess in range(256):
                c1_prime[byte_pos] = guess
                crafted = bytes(c1_prime) + ct_block

                if oracle_func(crafted):
                    # Found! Compute the intermediate byte
                    intermediate[byte_pos] = guess ^ pad_byte

                    # Sanity check: avoid false positives (0x02 0x02 vs 0x01)
                    if byte_pos == block_size - 1:
                        if byte_pos > 0:
                            c1_prime[byte_pos - 1] ^= 1
                            if not oracle_func(bytes(c1_prime) + ct_block):
                                continue  # false positive, keep trying

                    found = True
                    break

            if not found:
                raise Exception(f"Could not find byte {byte_pos} in block {block_idx}")

        # Recover plaintext via XOR with the previous block
        pt_block = bytes(a ^ b for a, b in zip(intermediate, prev_block))
        plaintext += pt_block
        print(f"[+] Block {block_idx} decrypted: {pt_block}")

    return plaintext
```

### Well-Known Padding Oracle Attacks

```
POODLE (2014) - Padding Oracle On Downgraded Legacy Encryption:
  Target: SSL 3.0 + CBC
  Method: attacker forces the browser to make 256 requests
          to recover one byte (requires MITM position)
  Result: session cookie recovery
  CVE: CVE-2014-3566

BEAST (2011) - Browser Exploit Against SSL/TLS:
  Target: TLS 1.0 + CBC with predictable IV
  Method: IV of the next record = last ciphertext block of previous record
          (predictable!) -> CPA attack
  CVE: CVE-2011-3389

Lucky 13 (2013):
  Target: TLS + CBC + HMAC
  Method: timing-based padding oracle - different processing time
          for valid vs invalid padding (~2 microsecond difference)
  Even Encrypt-then-MAC did not protect due to timing leak

ROBOT (2018) - Return Of Bleichenbacher's Oracle Threat:
  Target: RSA PKCS#1 v1.5 key exchange in TLS
  19-year-old attack rediscovered in 27 products
  Including Facebook, Citrix, F5, Cisco

Defense:
- TLS 1.3: no CBC, no RSA key exchange -> all these attacks inapplicable
- Use AES-GCM instead of AES-CBC
- Constant-time padding validation
```

---

## Bit-Flipping Attack (on CBC)

### How It Works

```
CBC decryption:
Pi = AES_K^(-1)(Ci) XOR C(i-1)

If bit j in block C(i-1) is flipped:
P_i[j] changes in a predictable way.

Block P(i-1) becomes random garbage (consequence of changing C(i-1)),
but P_i changes predictably.

Formula:
P_i_new[j] = P_i[j] XOR C(i-1)[j] XOR C(i-1)_modified[j]
           = P_i[j] XOR (original XOR modification)
```

### Practical Example

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt_userdata(userdata: str) -> bytes:
    """Encrypt user data"""
    # Escape ; and =
    userdata = userdata.replace(";", "%3B").replace("=", "%3D")
    plaintext = f"comment1=cooking%20MCs;userdata={userdata};comment2=%20like%20a%20pound%20of%20bacon"
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return cipher.encrypt(pad(plaintext.encode(), 16))

def is_admin(ciphertext: bytes) -> bool:
    """Check for ;admin=true; in the decrypted text"""
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    try:
        plaintext = unpad(cipher.decrypt(ciphertext), 16).decode(errors='replace')
        print(f"  Decrypted: {plaintext}")
        return ";admin=true;" in plaintext
    except Exception:
        return False

# Input ":admin<true:" (using : instead of ; and < instead of =)
userdata = ":admin<true:"
ct = bytearray(encrypt_userdata(userdata))

# Block layout:
# "comment1=cooking" = block 0 (16 bytes)
# "%20MCs;userdata=" = block 1 (16 bytes)
# ":admin<true:;co"  = block 2 (start of our input)

# We need to flip bits in block 1 ciphertext to change block 2 plaintext
# ':' XOR ';' = 0x3A XOR 0x3B = 0x01
# '<' XOR '=' = 0x3C XOR 0x3D = 0x01

# Block 2 offset 0: ':' -> ';'
# Block 2 offset 6: '<' -> '=' (after "admin")

# Corresponding positions in block 1 ciphertext (bytes 16..31):
ct[16 + 0] ^= ord(':') ^ ord(';')   # flip ':' to ';'
ct[16 + 6] ^= ord('<') ^ ord('=')   # flip '<' to '='

print(f"Admin: {is_admin(bytes(ct))}")
# Block 1 plaintext becomes garbage, but block 2 = ";admin=true;..."
```

---

## IV Recovery Attack (CBC)

### When IV is Predictable or Reused

```
Common mistake: IV = key (wrong implementation)

If the first ciphertext block is the same for two messages ->
same plaintext + same IV.

IV recovery attack (if IV is guessable):
We know: C1 = AES_K(P1 XOR IV)
         P1 = AES_K^(-1)(C1) XOR IV

If we can send C1 as the first block of a new message
and observe the decrypted value - we recover IV.
```

```python
def recover_iv(oracle_encrypt, oracle_decrypt, block_size=16):
    """
    Recover IV when there is access to a decryption oracle
    and one plaintext block is known.

    Attack: send [C1 || 0...0 || C1]
    Under CBC decryption:
      P1' = AES_K^(-1)(C1) XOR IV          <- contains IV
      P2' = AES_K^(-1)(0...0) XOR C1       <- garbage
      P3' = AES_K^(-1)(C1) XOR 0...0       <- AES_K^(-1)(C1) directly

    IV = P1' XOR AES_K^(-1)(C1)
       = P1' XOR P3'
    """
    # Get one ciphertext block
    ct = oracle_encrypt(b"A" * block_size)
    c1 = ct[:block_size]

    # Craft C1 || 0...0 || C1
    crafted = c1 + b"\x00" * block_size + c1

    # Decrypt
    pt = oracle_decrypt(crafted)
    p1_prime = pt[:block_size]
    p3_prime = pt[32:48]

    # IV = P1' XOR P3'
    iv = bytes(a ^ b for a, b in zip(p1_prime, p3_prime))
    return iv
```

---

## CRIME and BREACH (Compression + Encryption)

```
Attacks on systems that compress data BEFORE encryption.

CRIME (2012) - Compression Ratio Info-leak Made Easy:
  Target: TLS with DEFLATE compression (gzip)
  Method: if the attacker controls part of the plaintext
          and sees the ciphertext length, they can guess the secret byte by byte.
  Principle: compression + known_prefix -> shorter if there's a match
  CVE: CVE-2012-4929
  Result: browsers disabled TLS compression

BREACH (2013) - Browser Reconnaissance and Exfiltration via Adaptive Compression:
  Same idea but for HTTP compression (Content-Encoding: gzip)
  Does not require TLS compression - only HTTP compression
  Attacks CSRF tokens, session IDs in HTML

Attack principle:
  Response = AES_K(compress("SECRET=XYZ...USER_INPUT"))

  If USER_INPUT = "SECRET=A" -> compression is shorter (match found)
  If USER_INPUT = "SECRET=B" -> compression is longer (no match)

  -> recover character by character based on response length

Defense:
  - Do not compress secrets together with user input
  - Add random padding to responses (Heal-the-Breach)
  - SameSite cookies
```

---

## Nonce Reuse Attacks (CTR and GCM)

### CTR: Many-Time Pad

```
If (Key, Nonce) is used twice:
C1 = P1 XOR KS
C2 = P2 XOR KS

C1 XOR C2 = P1 XOR P2

Knowing the XOR of two plaintexts and language patterns:
both texts can be recovered (crib dragging).
```

```python
def crib_drag(ct1: bytes, ct2: bytes, crib: bytes) -> list:
    """
    Crib dragging: try positions where crib (a known phrase)
    might appear in one of the plaintexts.
    """
    xored = bytes(a ^ b for a, b in zip(ct1, ct2))
    results = []

    for i in range(len(xored) - len(crib) + 1):
        # Assume P1[i:i+len] = crib
        # Then P2[i:i+len] = xored[i:i+len] XOR crib
        candidate = bytes(a ^ b for a, b in zip(xored[i:], crib))
        # Check if printable
        if all(32 <= b < 127 for b in candidate[:len(crib)]):
            results.append((i, crib, candidate[:len(crib)]))

    return results

# Example
ct1 = bytes.fromhex("1234abcd...")
ct2 = bytes.fromhex("5678efab...")
hits = crib_drag(ct1, ct2, b"the ")
for pos, crib, candidate in hits:
    print(f"Position {pos}: if P1='{crib}' then P2='{candidate}'")
```

### GCM: Forbidden Attack (Nonce Reuse)

```
If (Key, Nonce) is used twice in GCM:

C1 = P1 XOR KS
C2 = P2 XOR KS
T1 = GHASH(H, A1, C1) XOR E(K, Nonce||0)
T2 = GHASH(H, A2, C2) XOR E(K, Nonce||0)

T1 XOR T2 = GHASH(H, A1, C1) XOR GHASH(H, A2, C2)

This equation in GF(2^128) allows recovering H (the hash key)!
Knowing H, the attacker can forge the tag for ANY message
encrypted with the same key.

This is called the "Forbidden Attack" (Joux, 2006).
Even if P1 and P2 are unknown - H can still be recovered.

Consequences:
- Complete loss of authentication
- Ability to forge any future messages
- Irreversible: even changing the nonce does not help (key is compromised)

Real-world case: vulnerability in Solar Designer's key wrapping (2011)
```

```python
def forbidden_attack_demo(ct1, tag1, ct2, tag2, aad1=b"", aad2=b""):
    """
    If two messages are encrypted with the same (key, nonce) in GCM:
    T1 XOR T2 = GHASH(H, aad1, ct1) XOR GHASH(H, aad2, ct2)

    This is a polynomial in H of degree max(len(ct1), len(ct2))/16 + 2
    Solving it yields H.

    In practice, use libraries like pwn-gcm for solving in GF(2^128).
    """
    xor_tags = bytes(a ^ b for a, b in zip(tag1, tag2))
    print(f"T1 XOR T2 = {xor_tags.hex()}")
    print("This is an equation in GF(2^128) to recover H")
    print("Knowing H: the tag can be forged for any CT with the same key")
    # Full implementation requires polynomial GCD in GF(2^128)
```

---

## Ciphertext Length Leakage Attacks

### ECB Length Leak

```
In ECB, padding is added to the next block boundary.
By watching ciphertext length changes, the secret length can be determined.

Algorithm:
1. Increase input by 1 byte at a time
2. Watch for when ciphertext length jumps by 16 bytes
3. That jump tells us: input + secret just crossed a block boundary

Secret length = (ciphertext length with empty input) - pad_at_jump

# Exact secret length calculation
def find_secret_length(oracle):
    base_len = len(oracle(b""))
    for i in range(1, 33):
        new_len = len(oracle(b"A" * i))
        if new_len > base_len:
            # Jump happened after i bytes of input
            # So the secret occupied base_len - i bytes + padding
            secret_len = base_len - i
            return secret_len
    return None
```

---

## Why All of This Works

```
The root cause of all these attacks:

ECB:
  - Determinism: P = P' => C = C'
  - No dependency between blocks
  - Attacker controls block boundaries -> oracle attacks

CBC without MAC:
  - Malleable: changing C(i-1) predictably changes P_i
  - Padding oracle: server leaks info through error messages
  - Predictable IV -> CPA attacks

CTR/GCM with nonce reuse:
  - Keystream repeats -> many-time pad
  - GCM: H is recovered -> complete loss of authentication

Compression + encryption:
  - Ciphertext length leaks information about content

The correct solution:
  AES-256-GCM + random 12-byte nonce (NEVER reuse)
  + tag verification before using data
  + do not compress secrets together with user input
```

---

## Practice: CTF Challenges

```
ECB Oracle (typical CTF scenario):
  nc challenge.ctf.example 1337
  > Enter input (hex): 4141414141414141414141414141414141414141414141
  > Encrypted: a1b2c3...{encrypted_flag}

  1. Determine block_size (try 1, 2, 3... bytes)
  2. Confirm ECB (two identical blocks in output)
  3. Apply byte-at-a-time attack
  4. Recover the flag

Useful tools:
  - pwntools: interact with the server
  - PyCryptodome: encryption/decryption
  - matasano/cryptopals challenges: practice (Set 2)

Relevant Cryptopals challenges:
  Set 1, Challenge 8:  Detect AES in ECB mode
  Set 2, Challenge 11: An ECB/CBC detection oracle
  Set 2, Challenge 12: Byte-at-a-time ECB decryption (simple)
  Set 2, Challenge 13: ECB cut-and-paste
  Set 2, Challenge 14: Byte-at-a-time ECB decryption (harder)
  Set 3, Challenge 17: The CBC padding oracle
  Set 3, Challenge 19: Break fixed-nonce CTR mode
  Set 3, Challenge 20: Break fixed-nonce CTR statistically
  Set 7, Challenge 49: CBC-MAC Message Forgery
```

---

## Cheat Sheet

```
ECB Oracle (byte-at-a-time):
  Oracle: AES_ECB(attacker_input || secret)
  1. Fill block to leave one unknown byte at end
  2. Try all 256 values -> compare ciphertext
  3. Repeat for each byte
  Complexity: 256 * len(secret) oracle queries

ECB Cut-and-Paste:
  Rearranging ciphertext blocks -> changes the semantic meaning
  Works because ECB blocks are independent

Padding Oracle (CBC):
  Oracle says "valid/invalid padding" -> byte-by-byte decryption
  Complexity: 256 * 16 * num_blocks queries
  Real attacks: POODLE, BEAST, Lucky 13

Bit-Flipping (CBC):
  Flipping a bit in C(i-1) -> predictable change in P_i
  P(i-1) becomes garbage, P_i is corrupted predictably

Nonce Reuse:
  CTR: C1 XOR C2 = P1 XOR P2 (crib dragging)
  GCM: H is recovered -> any tag can be forged

Defense:
  AES-GCM        -> no Padding Oracle, no cut-and-paste
  Random nonce   -> no nonce reuse
  Tag check      -> no bit-flipping
  No compression -> no CRIME/BREACH
```

---

## References

- [Cryptopals Challenges](https://cryptopals.com/) - hands-on attack exercises
- [POODLE CVE-2014-3566](https://www.openssl.org/~bodo/ssl-poodle.pdf) - original paper
- [Forbidden Attack (Joux 2006)](https://eprint.iacr.org/2006/487.pdf) - GCM nonce reuse
- [Lucky 13](https://www.isg.rhul.ac.uk/tls/Lucky13.html) - timing-based padding oracle
- [BEAST Attack](https://vnhacker.blogspot.com/2011/09/beast.html) - CBC IV predictability
- [CRIME/BREACH](https://www.breachattack.com/) - compression + encryption
- [A Graduate Course in Applied Cryptography](https://toc.cryptobook.us/) - Boneh & Shoup (free)
