---
title: "AES - modes ECB, CBC, CTR, GCM"
date: "2026-05-15"
---

AES (Advanced Encryption Standard) is a symmetric block cipher adopted as a NIST standard in 2001 (FIPS 197). It encrypts data in 128-bit blocks and supports key sizes of 128, 192, and 256 bits. The mode of operation defines how data longer than one block is encrypted and what security properties are guaranteed.

---

## AES Basics

```
AES parameters:
Block size:   128 bits (16 bytes) - fixed
Key size:     128, 192, or 256 bits
Rounds:       10 (AES-128), 12 (AES-192), 14 (AES-256)

One AES operation:
Plaintext (16 bytes) + Key -> Ciphertext (16 bytes)
Ciphertext (16 bytes) + Key -> Plaintext (16 bytes)

AES is a standard based on Rijndael.
Rijndael supports variable block and key sizes;
AES fixes the block size at 128 bits.
```

### Internal AES Structure (simplified)

```
Each AES round consists of 4 operations:

1. SubBytes   - replace each byte via S-box (non-linearity)
2. ShiftRows  - shift rows of the state matrix (diffusion)
3. MixColumns - mix columns in GF(2^8) (diffusion)
4. AddRoundKey - XOR with round key (Key Schedule)

Final round: no MixColumns.

State - 4x4 byte matrix (16 bytes = 1 block):
+--+--+--+--+
|a0|a4|a8|ac|
|a1|a5|a9|ad|
|a2|a6|aa|ae|
|a3|a7|ab|af|
+--+--+--+--+
```

### Why can't we just encrypt blocks independently?

```
Encrypting each block independently with the same key is ECB.
ECB is dangerous: identical plaintext blocks -> identical ciphertext blocks.
Modes of operation solve this problem in different ways.
```

---

## ECB Mode (Electronic Codebook)

### How it works

```
Encryption:
P1 -> AES_K -> C1
P2 -> AES_K -> C2
P3 -> AES_K -> C3

Each plaintext block is encrypted INDEPENDENTLY with the same key.

Decryption:
C1 -> AES_K^(-1) -> P1
C2 -> AES_K^(-1) -> P2
C3 -> AES_K^(-1) -> P3
```

```
Diagram:
Plaintext:  [P1]   [P2]   [P3]   [P4]
             |      |      |      |
            AES    AES    AES    AES   (same key K)
             |      |      |      |
Ciphertext: [C1]   [C2]   [C3]   [C4]
```

### The ECB Problem

```
ECB is deterministic: P = P' => Enc(P) = Enc(P')

Classic example: the Linux penguin Tux.
Encrypt a bitmap with ECB -> the penguin's outline is still visible!
Because identical pixels -> identical blocks -> identical ciphertext.

Attack: frequency analysis.
If an attacker knows P1 = P3, they know C1 = C3.
This reveals patterns in the data.

ECB does not provide semantic security (IND-CPA).
```

### Usage

```
ECB MUST NOT be used to encrypt data!

Only legitimate case:
- Encrypting a single block (e.g. key wrapping - but AES-KW exists for that)
- As a raw primitive inside other constructions

Padding: required (PKCS#7 or other) if data is not a multiple of 16 bytes.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

key = os.urandom(16)  # AES-128
cipher = AES.new(key, AES.MODE_ECB)

plaintext = b"Hello, World!!!!"  # exactly 16 bytes
ciphertext = cipher.encrypt(plaintext)

# Decryption
cipher2 = AES.new(key, AES.MODE_ECB)
recovered = cipher2.decrypt(ciphertext)
print(recovered)  # b'Hello, World!!!!'

# With padding:
data = b"Short message"
padded = pad(data, AES.block_size)
encrypted = cipher.encrypt(padded)
```

---

## CBC Mode (Cipher Block Chaining)

### How it works

```
Each plaintext block is XOR-ed with the previous ciphertext block
before encryption. The first block is XOR-ed with the IV (Initialization Vector).

Encryption:
C0 = IV
Ci = AES_K(Pi XOR C(i-1))

Decryption:
C0 = IV
Pi = AES_K^(-1)(Ci) XOR C(i-1)
```

```
Encryption diagram:
IV
 |
 v
[P1] ->XOR-> AES_K -> [C1] ->+
                               |
[P2] ->XOR---------------------+-> AES_K -> [C2] ->+
                                                    |
[P3] ->XOR------------------------------------------+-> AES_K -> [C3]

Decryption diagram:
IV
 |
[C1] -> AES_K^(-1) -> XOR -> [P1]
 |                    ^
 |                    |
[C2] -> AES_K^(-1) -> XOR -> [P2]
 |                    ^
 |                    |
[C3] -> AES_K^(-1) -> XOR -> [P3]
```

### CBC Properties

```
+ Identical plaintext blocks -> different ciphertext blocks (if IV is unique)
+ Widely used and well studied
+ Parallel DECRYPTION is possible (each Ci depends only on previous Ci-1)

- Parallel ENCRYPTION is not possible (each Ci depends on Ci-1)
- IV must be random and unique (not secret, but unpredictable)
- Requires padding (data must be a multiple of 16 bytes)
- Vulnerable to Padding Oracle Attacks (POODLE, BEAST)
- Does not authenticate data (no MAC) -> vulnerable to bit-flipping
```

### Bit-Flipping Attack on CBC

```
If an attacker flips a bit in Ci-1, the corresponding bit in Pi will be flipped.
This allows modifying plaintext without knowing the key.

Example:
Pi = AES_K^(-1)(Ci) XOR C(i-1)
Attacker changes C(i-1)[j] -> Pi[j] is changed

Conclusion: CBC without authentication does NOT provide integrity.
Always pair CBC with HMAC (Encrypt-then-MAC).
Or use an AEAD mode (GCM).
```

### IV in CBC

```
IV requirements:
- MUST be random (cryptographically secure CSPRNG)
- MUST be unique for each message
- Does NOT need to be secret (transmitted openly with the ciphertext)
- Size: 16 bytes (equal to AES block size)

Danger of a predictable IV:
BEAST attack (2011) exploited predictable IVs in TLS 1.0.
Attacker could determine plaintext by crafting specific blocks.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

key = os.urandom(32)   # AES-256
iv  = os.urandom(16)   # random IV

# Encryption
cipher = AES.new(key, AES.MODE_CBC, iv)
plaintext = b"Secret message, needs padding"
ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))

# IV is sent alongside ciphertext (in the clear)
message = iv + ciphertext

# Decryption
iv_recv  = message[:16]
ct_recv  = message[16:]
cipher2  = AES.new(key, AES.MODE_CBC, iv_recv)
recovered = unpad(cipher2.decrypt(ct_recv), AES.block_size)
print(recovered)  # b'Secret message, needs padding'
```

---

## CTR Mode (Counter)

### How it works

```
CTR turns a block cipher into a stream cipher.
The counter is encrypted, not the plaintext itself.
The result is XOR-ed with the plaintext.

Keystream:
KS_i = AES_K(Nonce || Counter_i)

Encryption:
Ci = Pi XOR KS_i

Decryption (identical to encryption!):
Pi = Ci XOR KS_i
```

```
Diagram:
Nonce||0   Nonce||1   Nonce||2   Nonce||3
    |           |           |           |
  AES_K      AES_K      AES_K      AES_K
    |           |           |           |
   KS0         KS1         KS2         KS3
    |           |           |           |
   XOR         XOR         XOR         XOR
    |           |           |           |
   [P1]        [P2]        [P3]        [P4]
    |           |           |           |
   [C1]        [C2]        [C3]        [C4]
```

### Nonce and Counter

```
The counter block typically consists of two parts:
[  Nonce (96 bits)  |  Counter (32 bits)  ]  - NIST SP 800-38A standard

Or:
[  Nonce (64 bits)  |  Counter (64 bits)  ]  - alternative scheme

Nonce (Number Used Once):
- MUST be unique for every message encrypted with the same key
- Does NOT need to be random (can be a counter: 0, 1, 2, ...)
- Size: typically 96 bits (12 bytes) in modern schemes

Counter:
- Starts at 0 or 1, increments by 1 per block
- 32-bit counter -> max 2^32 blocks = 64 GB of data per nonce
```

### CTR Properties

```
+ Parallel encryption AND decryption (no dependencies between blocks!)
+ Random access: decrypt any block without the others
  (just compute KS_i = AES_K(Nonce || i))
+ No padding required (works with arbitrary length)
+ Encryption = decryption (single operation)
+ Keystream can be pre-computed

- Does not authenticate data
- Nonce reuse with the same key is catastrophic:
  C1 = P1 XOR KS
  C2 = P2 XOR KS
  C1 XOR C2 = P1 XOR P2  (attacker gets XOR of plaintexts!)
```

### Danger of Nonce Reuse

```
Many-time pad attack:
If two messages are encrypted with the same key and nonce:

Enc(P1) = C1 = P1 XOR KS
Enc(P2) = C2 = P2 XOR KS

C1 XOR C2 = P1 XOR P2

Using language patterns, both plaintexts can be recovered.
This is exactly how RC4 was broken in WEP (Wi-Fi).

Rule: a (Key, Nonce) pair is used EXACTLY ONCE.
```

```python
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # AES-256
nonce = os.urandom(8)    # 64-bit nonce

# Encryption
cipher = AES.new(key, AES.MODE_CTR, nonce=nonce)
plaintext  = b"No padding needed! Any length works fine here."
ciphertext = cipher.encrypt(plaintext)

# Decryption
cipher2   = AES.new(key, AES.MODE_CTR, nonce=nonce)
recovered = cipher2.decrypt(ciphertext)
print(recovered)  # b'No padding needed! Any length works fine here.'
```

---

## GCM Mode (Galois/Counter Mode)

### How it works

```
GCM = CTR (encryption) + GHASH (authentication)
This is an AEAD mode (Authenticated Encryption with Associated Data).

GCM provides:
1. Confidentiality (CTR encryption)
2. Integrity and authentication (Authentication Tag)
3. Authentication of Additional Data (AAD / Associated Data)
   without encrypting it (e.g. packet headers)
```

```
GCM Diagram:

AAD (not encrypted)          Plaintext
     |                           |
     |           Nonce||1  Nonce||2  Nonce||3  Nonce||0
     |                |       |       |           |
     |              AES_K   AES_K   AES_K       AES_K
     |                |       |       |           |
     |               KS1     KS2     KS3         H (Hashkey)
     |                |       |       |
     |   XOR[P1]-->[C1]  XOR[P2]-->[C2]  XOR[P3]-->[C3]
     |       |           |           |
     +-->GHASH-------------------------------->GHASH--> Tag
              ^ multiplication in GF(2^128)

Tag (16 bytes) = GHASH(H, AAD, Ciphertext) XOR AES_K(Nonce||0)
```

### GHASH - How Authentication Works

```
H = AES_K(0^128)  - Hash key (encryption of the all-zero block)

GHASH(H, A, C):
Takes AAD (A) and ciphertext (C), returns a 128-bit tag.
Operation: multiplication in the Galois field GF(2^128).

X_0 = 0
X_i = (X_{i-1} XOR A_i) * H    for each AAD block
X_j = (X_j-1 XOR C_i) * H      for each ciphertext block
final block: lengths of A and C
Tag = X_final XOR AES_K(Nonce||0)
```

### GCM Properties

```
+ AEAD: confidentiality + authenticity in a single operation
+ Parallel encryption AND decryption (based on CTR)
+ AAD authentication: data that is not encrypted but is verified
  (e.g. IP headers, protocol headers)
+ Random access to ciphertext
+ No padding required
+ De facto standard: TLS 1.3, IPSec, SSH, WireGuard

- Tag MUST be verified before using decrypted data!
  If tag doesn't match -> data is corrupt or tampered -> REJECT
- Nonce reuse with the same key is catastrophic:
  Hash key H is revealed -> all authentication is permanently broken
- 32-bit counter in GCM -> max ~64 GB per nonce
  (overflow causes wraparound, security breaks)
```

### Nonce in GCM

```
Recommended size: 96 bits (12 bytes) - NIST SP 800-38D.
With 96 bits: nonce is used directly as IV, counter starts at 1.
With other sizes: nonce is processed through GHASH -> slower and worse.

Nonce generation:
1. Random (CSPRNG): safe up to ~2^32 messages (birthday bound at 96 bits)
   50% collision probability at ~2^48 encryptions -> safe in practice
2. Deterministic (counter): safe if counter never repeats
   Requires synchronization / state tracking

Nonce reuse in GCM:
If two messages are encrypted with the same (Key, Nonce):
- Both ciphertexts are vulnerable (like CTR: C1 XOR C2 = P1 XOR P2)
- WORSE: H = GHASH key is revealed -> attacker can forge the tag
  for ANY future message with the same key
```

### Authentication Tag

```
Tag size: 128, 120, 112, 104, 96, 64, 32 bits (NIST allows these)
Recommended: 128 bits (16 bytes) for full security.

Tag of 64 bits: birthday bound -> 50% at 2^32 attempts -> unsafe in general.

Tag verification MUST be constant-time:
Never use regular string comparison (timing attack).
Use hmac.compare_digest() or secrets.compare_digest().
```

```python
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # AES-256-GCM
nonce = os.urandom(12)   # 96-bit nonce (recommended)

# Encryption
plaintext = b"Sensitive data that needs both confidentiality and integrity"
aad       = b"Header info: version=1, user_id=42"  # not encrypted, but authenticated

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher.update(aad)                         # add AAD
ciphertext, tag = cipher.encrypt_and_digest(plaintext)

# Transmit: nonce + tag + ciphertext + aad (aad sent in the clear)
print(f"Nonce:      {nonce.hex()}")
print(f"Tag:        {tag.hex()}")         # 16 bytes
print(f"Ciphertext: {ciphertext.hex()}")

# Decryption with authentication check
cipher2 = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher2.update(aad)
try:
    recovered = cipher2.decrypt_and_verify(ciphertext, tag)
    print(f"OK: {recovered}")
except ValueError:
    print("ERROR: tag mismatch! Data is corrupt or tampered.")

# Verify that tampering is detected:
fake_ct = bytearray(ciphertext)
fake_ct[0] ^= 0xFF                         # flip one bit
cipher3 = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher3.update(aad)
try:
    cipher3.decrypt_and_verify(bytes(fake_ct), tag)
except ValueError:
    print("Tampering detected!")            # always triggers
```

---

## AES-GCM-SIV (SIV - Synthetic IV)

```
A GCM extension resistant to nonce reuse.
RFC 8452 (2019).

If nonce is reused in AES-GCM-SIV:
- Confidentiality is broken (equal plaintexts reveal equal ciphertexts)
- But authentication is NOT broken (unlike standard GCM!)

How it works:
Nonce is derived from AAD + Plaintext -> deterministic AEAD.
Same plaintext with same nonce -> same ciphertext
(deterministic, not randomized encryption).

Use case: situations where nonce uniqueness is hard to guarantee
(key-value stores, file systems, nonce misuse resistance).
```

---

## Mode Comparison

```
Mode     Parallel    Padding  AEAD  RandAccess  Unique Nonce/IV  Security
------   ---------   -------  ----  ----------  ---------------  --------
ECB      Yes / Yes   Yes      No    Yes         No               BAD
CBC      No / Yes    Yes      No    No          Random IV        Medium*
CTR      Yes / Yes   No       No    Yes         Unique nonce     Good*
GCM      Yes / Yes   No       Yes   Yes         Unique nonce     Excellent

* without authentication - vulnerable to active attacks

What to choose:
- New code: AES-256-GCM
- Nonce reuse risk: AES-256-GCM-SIV
- Legacy CBC code: add HMAC-SHA256 (Encrypt-then-MAC)
- ECB: NEVER (for data encryption)
```

```
Throughput (approx., x86_64 with AES-NI):
AES-128-GCM:  ~2-4 GB/s (hardware acceleration)
AES-256-GCM:  ~1.5-3 GB/s
AES-CBC:      ~1-2 GB/s (sequential encryption, parallel decryption)
AES-CTR:      ~2-4 GB/s

AES-NI (Intel/AMD): CPU-level instructions for AES rounds
Check: grep aes /proc/cpuinfo
```

---

## Padding

### PKCS#7

```
Required for ECB and CBC (block modes).
CTR and GCM do not need padding.

PKCS#7 (RFC 5652):
If data is not a multiple of 16 bytes, append N bytes each with value N.
N = 16 - (len(data) % 16)
If data is already a multiple of 16 - append 16 bytes of value 0x10.

Example:
Data: b"Hello" (5 bytes)
Padding: 11 bytes, each = 0x0B (11 in decimal)
Result: b"Hello\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b"

Data: b"Hello, World!!!" (15 bytes)
Padding: 1 byte = 0x01
Result: b"Hello, World!!!\x01"

Data: b"Hello, World!!!!" (16 bytes)
Padding: 16 bytes = 0x10
Result: b"Hello, World!!!!\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10"
```

### Padding Oracle Attack

```
If a server returns different errors for "invalid padding" vs "invalid data",
an attacker can decrypt data byte-by-byte without knowing the key.

POODLE attack (2014): SSL 3.0 with CBC.
BEAST attack (2011): TLS 1.0 with CBC and predictable IV.

Protection:
- Always return the same generic error (do not reveal the reason)
- Check MAC BEFORE decryption (Encrypt-then-MAC)
- Use GCM instead of CBC
```

---

## Key Management

```
AES key sizes and their security:
AES-128: 128 bits -> 2^128 possible keys -> sufficient for most uses
AES-192: 192 bits -> 2^192 possible keys
AES-256: 256 bits -> 2^256 possible keys -> recommended for long-lived secrets

Quantum computers (Grover's algorithm):
AES-128 -> effective security 64 bits (potentially vulnerable)
AES-256 -> effective security 128 bits (acceptable)

For long-lived data (>10 years): AES-256.
For TLS, VPN, file encryption today: AES-128 or AES-256 - both fine.
```

```
Key generation:
- NEVER use a password directly as an AES key
- For passwords: PBKDF2, bcrypt, Argon2 -> KDF -> AES key

# Python: secure key generation
import os
key = os.urandom(32)  # 256 bits from system CSPRNG (/dev/urandom)

# From password (PBKDF2):
import hashlib
key = hashlib.pbkdf2_hmac(
    'sha256',
    password=b"user_password",
    salt=os.urandom(16),    # random salt, stored with ciphertext
    iterations=600_000,     # NIST recommends 600k+ for PBKDF2-SHA256
    dklen=32
)
```

---

## Real-World Usage

### TLS 1.3

```
TLS_AES_128_GCM_SHA256    - mandatory cipher suite
TLS_AES_256_GCM_SHA384    - mandatory
TLS_CHACHA20_POLY1305_SHA256 - mandatory (GCM alternative)

AES-CBC is completely removed from TLS 1.3.
AES-GCM is the primary mode.

Nonce in TLS 1.3:
sequence_number (64 bits) XOR static_nonce -> unique per record
```

### WireGuard

```
ChaCha20-Poly1305 (preferred) or AES-256-GCM.
AES-GCM is used when AES-NI is available.
Nonce: 64-bit packet counter.
```

### File Encryption (age, GPG)

```
age (modern tool):
  ChaCha20-Poly1305 or AES-128-GCM
  Random 96-bit nonce
  Separate key per file

OpenSSL: encrypt file with AES-256-GCM
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 -in file.txt -out file.enc -k "password"
openssl enc -d -aes-256-gcm -pbkdf2 -iter 600000 -in file.enc -out file.txt -k "password"
```

### Disk Encryption

```
LUKS2 (Linux):
  AES-XTS-512 (AES-XTS with 256-bit key per direction)
  XTS - special mode for block devices (not AEAD)

BitLocker (Windows):
  AES-XTS-256 or AES-CBC-256 + Elephant diffuser

XTS (XEX-based tweaked codebook mode with ciphertext stealing):
  Designed for encrypting disk sectors
  Not AEAD (no authentication) - not for network communication
  Tweak = sector number -> same data in different sectors differs
```

---

## OpenSSL - Practice

```bash
# AES-256-CBC: encrypt a file
openssl enc -aes-256-cbc -in plaintext.txt -out encrypted.bin \
    -K $(openssl rand -hex 32) \
    -iv $(openssl rand -hex 16)

# Generate a random key
openssl rand -hex 32         # 256 bits in hex
openssl rand -base64 32      # 256 bits in base64

# List available AES modes in OpenSSL
openssl enc -list | grep aes

# Benchmark AES
openssl speed -evp aes-128-gcm aes-256-gcm aes-128-cbc aes-256-cbc

# Check for AES-NI support
grep -m1 aes /proc/cpuinfo
```

---

## Common Mistakes

```
1. Using ECB for data longer than 16 bytes
   Problem: patterns are visible in ciphertext

2. Reusing a nonce in GCM or CTR
   Problem: catastrophic failure of encryption and authentication

3. Predictable IV in CBC
   Problem: BEAST, CPA attacks

4. CBC without authentication
   Problem: bit-flipping, Padding Oracle

5. Not verifying the authentication tag in GCM
   Problem: accepting tampered data

6. Short GCM tag (less than 96 bits)
   Problem: reduced authentication security

7. Using a password directly as an AES key
   Problem: passwords have low entropy

8. Non-constant-time tag comparison (== or strcmp)
   Problem: timing attack leaks tag bits
```

---

## Cheat Sheet

```
ECB:
  Pi -> AES_K -> Ci (independently)
  NEVER use for data encryption!

CBC:
  Ci = AES_K(Pi XOR C(i-1)), C0 = IV (random)
  Padding: required; Parallelism: decryption only
  Always add: Encrypt-then-MAC

CTR:
  Ci = Pi XOR AES_K(Nonce||i)
  Padding: not needed; Parallelism: yes
  Nonce: unique, never reuse with the same key

GCM:
  CTR encryption + GHASH authentication
  Padding: not needed; Parallelism: yes; AEAD: yes
  Nonce: 12 bytes; never reuse with the same key
  Always verify Tag before using data

Choosing a mode:
  2024+: AES-256-GCM (or ChaCha20-Poly1305)
  Nonce reuse risk: AES-256-GCM-SIV
  Legacy CBC: + HMAC-SHA256 (Encrypt-then-MAC)

Commands:
  openssl rand -hex 32             # generate key
  openssl speed -evp aes-256-gcm  # benchmark
  grep aes /proc/cpuinfo           # check AES-NI
```

---

## References

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - AES standard
- [NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800/38/a/final) - ECB, CBC, CTR modes
- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800/38/d/final) - GCM mode
- [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116) - An Interface and Algorithms for Authenticated Encryption
- [RFC 8452](https://www.rfc-editor.org/rfc/rfc8452) - AES-GCM-SIV
- [Nonce-Disrespecting Adversaries](https://eprint.iacr.org/2016/475.pdf) - consequences of nonce reuse in GCM
- [PyCryptodome docs](https://pycryptodome.readthedocs.io/) - Python library for AES
