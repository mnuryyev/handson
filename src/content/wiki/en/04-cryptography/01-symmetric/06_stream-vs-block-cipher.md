---
title: "Stream vs Block Ciphers"
date: "2026-05-15"
---

Block ciphers and stream ciphers are the two fundamental classes of symmetric encryption. Understanding the differences between them determines the right algorithm choice for a given task and explains why certain attacks apply to one class but are useless against the other.

---

## Block Cipher: Core Idea

```
A block cipher is a deterministic permutation over the space {0,1}^n.

E: {0,1}^k x {0,1}^n -> {0,1}^n
   (key)     (block)      (block)

For a fixed key K: E(K, .) is a bijection (permutation).
Each fixed-size block is encrypted as a separate operation.

Examples:
  AES-128:   128-bit block, 128/192/256-bit key
  AES-256:   128-bit block, 256-bit key
  DES:       64-bit block, 56-bit key (broken)
  3DES:      64-bit block, 112/168-bit key (deprecated)
  Blowfish:  64-bit block, 32-448-bit key (deprecated)
  Camellia:  128-bit block, 128/192/256-bit key
```

### What "Permutation" Means

```
For a fixed key K, a block cipher creates a bijective mapping:

Key K selects one specific permutation from 2^n! possible permutations.
AES-128: 2^128! possible permutations of 128-bit blocks.

This means:
  - Each 128-bit plaintext block -> exactly one 128-bit ciphertext
  - Each 128-bit ciphertext -> exactly one 128-bit plaintext
  - Without the key: the permutation looks random (PRP)

PRP (Pseudo-Random Permutation):
  Distinguishing E(K, .) from a truly random permutation in polynomial time is infeasible.
  This is the core security requirement of a block cipher.
```

---

## Stream Cipher: Core Idea

```
A stream cipher generates a pseudorandom stream of bits (keystream)
from a key and nonce, then XOR-s it with the plaintext.

Keystream  = PRG(Key, Nonce)
Ciphertext = Plaintext XOR Keystream

Examples:
  ChaCha20:    256-bit key, 96-bit nonce (IETF) / 64-bit
  Salsa20:     256-bit key, 64-bit nonce
  RC4:         40-2048-bit key (BROKEN, do not use)
  A5/1:        64 bits (GSM, BROKEN)
  Grain-128a:  128-bit key (IoT)
  SNOW 3G:     3GPP (LTE encryption)

Key properties:
  Encryption = Decryption (a single XOR operation).
  No concept of "block" - works with arbitrary-length data.
  No padding required.
```

### PRG: Pseudo-Random Generator

```
PRG (Pseudo-Random Generator) - a deterministic function
that stretches a short secret seed into a long pseudorandom stream.

Security requirement:
  Distinguishing PRG(seed) from a truly random string of the same length
  in polynomial time is infeasible.

For a stream cipher:
  Seed = (Key, Nonce, Counter)
  Stream = PRG(Key, Nonce, Counter)

  Same (Key, Nonce): stream is deterministic.
  Different (Key, Nonce): streams are independent.

ChaCha20 as a PRG:
  ChaCha20_block(Key, Nonce, Counter) -> 64 bytes of keystream
  Next 64 bytes: Counter++
  Security: 2^256 (256-bit key)
```

---

## Structural Differences

### How They Work

```
Block cipher (AES in ECB mode - simplified):

Plaintext:  [  block 1  ] [  block 2  ] [  block 3  ]
                 |              |              |
               AES_K          AES_K          AES_K
                 |              |              |
Ciphertext: [  block 1  ] [  block 2  ] [  block 3  ]

Data must be a multiple of the block size (or use padding).


Stream cipher (ChaCha20):

Key+Nonce -> [KS block 0] [KS block 1] [KS block 2] ...
                  |            |            |
                 XOR          XOR          XOR
                  |            |            |
Plaintext:  [..any length.................................................]
                  |            |            |
Ciphertext: [..any length.................................................]

No padding. Keystream blocks are independent -> parallel generation.
```

### Comparison Table

```
Property               Block Cipher             Stream Cipher
--------------------   --------------------     --------------------
Unit of processing     Fixed-size block         One bit or byte
Data length            Multiple of block (pad)  Any
Padding                Required (ECB, CBC)      Not needed
Parallel encryption    Depends on mode          Yes
Parallel decryption    Yes (CBC etc.)           Yes
Random access          With CTR mode            Yes (via counter)
Internal structure     SPN or Feistel           ARX / LFSR / other
State                  Stateless *              May maintain state
Nonce/IV               Depends on mode          Required
Examples               AES, Camellia            ChaCha20, Salsa20, RC4
Speed (no HW)          Moderate                 High
HW acceleration        Yes (AES-NI)             No (SIMD helps)
Cache-timing risk      Yes (S-box tables)       No (ARX)

* Mode of operation adds state (CBC -> IV, CTR -> counter)
```

---

## Modes of Operation for Block Ciphers

```
A block cipher encrypts exactly one block.
A mode of operation handles data of arbitrary length.
The mode determines ALL security properties of the system.

ECB (Electronic Codebook):
  Ci = E(K, Pi)
  Deterministic, plaintext patterns are visible. NEVER use.

CBC (Cipher Block Chaining):
  Ci = E(K, Pi XOR C(i-1)),  C0 = IV (random)
  Sequential encryption. Vulnerable to Padding Oracle without MAC.

CTR (Counter):
  Ci = Pi XOR E(K, Nonce || i)
  Turns a block cipher into a stream cipher!
  Parallel. No padding. Random access.

GCM (Galois/Counter Mode):
  CTR + GHASH authentication. AEAD.
  De facto standard for new systems.

CFB (Cipher Feedback):
  Ci = Pi XOR E(K, C(i-1))
  Self-synchronizing. Rarely used today.

OFB (Output Feedback):
  KS_i = E(K, KS_(i-1))
  Turns block cipher into a synchronous stream cipher.
  Vulnerable: nonce reuse -> entire keystream repeats.
```

### CTR Erases the Boundary

```
Key insight: CTR mode turns AES into a stream cipher.

AES-CTR keystream:
  KS_i = AES_K(Nonce || i)
  Ciphertext = Plaintext XOR KS

Properties CTR brings to AES:
  - No padding
  - Random access
  - Parallel encryption
  - Ciphertext length = plaintext length

AES-GCM = AES-CTR + GHASH (block primitive in stream mode + MAC)
ChaCha20-Poly1305 = ChaCha20 + Poly1305 (stream primitive + MAC)

Both algorithms are structurally identical.
The difference is only in the primitive: AES vs ChaCha20.
The choice is determined by AES-NI availability.
```

---

## Internal Construction

### SPN: Substitution-Permutation Network (AES)

```
AES uses SPN - alternating substitutions and permutations.

One AES round:
  SubBytes:   each byte -> S-box[byte]             <- non-linearity (confusion)
  ShiftRows:  cyclic shift of matrix rows           <- diffusion
  MixColumns: multiplication in GF(2^8)             <- diffusion
  AddRoundKey: XOR with round key                   <- key injection

10-14 rounds depending on key size.

S-box: non-linear 8->8-bit table (256 entries in memory).
Memory lookups at addresses that depend on data ->
potential cache-timing attacks in shared environments (VMs, cloud).
```

### Feistel Network (DES, Blowfish, Twofish)

```
Feistel splits the block into two halves L and R.

Round i:
  L_i = R_(i-1)
  R_i = L_(i-1) XOR F(R_(i-1), K_i)

Decryption = encryption with subkeys applied in reverse order.
The F function does NOT need to be invertible!

Advantage: simple decryption, flexible F function.
Disadvantage: needs twice as many rounds for the same diffusion.

AES is not Feistel (it uses SPN): better diffusion in fewer rounds.
```

### ARX: Addition, Rotation, XOR (ChaCha20, Salsa20)

```
ARX - building blocks without substitution tables.

Operations:
  a = (a + b) mod 2^32  <- addition creates non-linearity
  a = a XOR b            <- diffusion
  a = a <<< n            <- left circular rotation

ChaCha20 Quarter Round:
  a += b;  d ^= a;  d <<<= 16;
  c += d;  b ^= c;  b <<<= 12;
  a += b;  d ^= a;  d <<<= 8;
  c += d;  b ^= c;  b <<<= 7;

All operations on 32-bit words with no branches or tables.
Executes in constant time on any platform.
No cache-timing attacks possible.

Trade-off: weaker non-linearity than S-box.
Compensation: more rounds (ChaCha20: 20 rounds vs AES: 10-14).
```

### LFSR: Linear Feedback Shift Register (legacy ciphers)

```
Historical stream ciphers (A5/1, SNOW 2.0) use LFSRs.

LFSR - shift register with linear feedback:
  State: n-bit register
  Each clock: new_bit = XOR of selected state bits (tap positions)
  Output: one bit

Problem: LFSR output is linear.
Berlekamp-Massey algorithm reconstructs any LFSR
from just 2n output bits (where n is the register length).

Protection: non-linear combination of multiple LFSRs.
But: mathematically much weaker than ARX.

A5/1 (GSM): 3 LFSRs, 64-bit key -> completely broken.
SNOW 3G (LTE): LFSR + S-box -> secure for now.

Modern systems do not use LFSR as a foundation.
ARX (ChaCha20) is the correct alternative.
```

---

## Performance

### Without Hardware Acceleration

```
x86_64 without AES-NI (Python/PyCryptodome):

Algorithm             Speed
---------             -----
ChaCha20-Poly1305     ~350 MB/s
AES-128-GCM           ~60 MB/s
AES-256-GCM           ~45 MB/s   <- 8x slower than ChaCha20!
AES-128-CBC           ~80 MB/s
3DES-CBC              ~25 MB/s

ARM Cortex-A53 without AES-NI (typical IoT/Raspberry Pi):
ChaCha20-Poly1305     ~200 MB/s
AES-256-GCM           ~30 MB/s
```

### With Hardware Acceleration

```
AES-NI (Intel Sandy Bridge+, AMD Zen+):
  AES-128-GCM:   ~3-5 GB/s per core
  AES-256-GCM:   ~2-4 GB/s per core
  Speedup: ~50x vs software AES

ChaCha20 AVX2 (8 blocks in parallel):
  ~2-4 GB/s - comparable to AES-NI on some CPUs

ARM Crypto Extension (AES-NI equivalent):
  Cortex-A57+, Apple M1/M2, Snapdragon 8xx
  AES: ~3-8 GB/s
  NEON ChaCha20: ~2-3 GB/s

Performance conclusion:
  Without HW acceleration: ChaCha20 is 5-10x faster
  With AES-NI: AES is 1.5-3x faster
  Mobile chips 2020+: both fast, ~2x difference
```

```python
import time
import os
from Crypto.Cipher import ChaCha20_Poly1305, AES

def bench(name, fn, mb=100):
    data = os.urandom(mb * 1024 * 1024)
    t = time.perf_counter()
    fn(data)
    elapsed = time.perf_counter() - t
    print(f"{name:30s}: {mb / elapsed:7.1f} MB/s")

key = os.urandom(32)
n12 = os.urandom(12)

bench("ChaCha20-Poly1305",
      lambda d: ChaCha20_Poly1305.new(key=key, nonce=n12).encrypt_and_digest(d))
bench("AES-256-GCM",
      lambda d: AES.new(key, AES.MODE_GCM, nonce=n12).encrypt_and_digest(d))
bench("AES-128-GCM",
      lambda d: AES.new(key[:16], AES.MODE_GCM, nonce=n12).encrypt_and_digest(d))
```

---

## Security: Key Differences

### Semantic Security (IND-CPA)

```
IND-CPA (Indistinguishability under Chosen Plaintext Attack):
Attacker cannot distinguish ciphertexts of two messages
even with access to an encryption oracle.

ECB - NOT IND-CPA:
  Deterministic: P = P' => C = C'
  Attack is instant: send P and P', observe C and C', compare.

Block cipher + random IV (CBC, CTR, GCM) - IND-CPA:
  Randomization via IV/nonce provides semantic security.
  Even identical plaintext blocks -> different ciphertext.

Stream cipher with unique nonce - IND-CPA:
  Unique (Key, Nonce) -> unique keystream -> no patterns.

Stream cipher with repeated nonce - catastrophe:
  C1 = P1 XOR KS
  C2 = P2 XOR KS
  C1 XOR C2 = P1 XOR P2   <- many-time pad attack
```

### Integrity and Authentication

```
Neither block nor stream ciphers provide integrity on their own.

Attacks without MAC:
  CBC: bit-flipping -> predictable change in Pi via modifying C(i-1)
  CTR: bit-flipping -> direct change of plaintext bits (immediate!)
  ChaCha20 without Poly1305: fully vulnerable to forgery

Solution: AEAD
  AES-GCM:           AES-CTR + GHASH MAC
  ChaCha20-Poly1305: ChaCha20 + Poly1305 MAC
  AES-CCM:           AES-CTR + AES-CBC-MAC

Without AEAD: always use Encrypt-then-MAC (HMAC-SHA256).
Order matters: Encrypt-then-MAC is safe, MAC-then-Encrypt is not.
```

### Attacks by Class

```
Specific to BLOCK ciphers:
  - ECB: patterns visible, byte-at-a-time oracle decrypts secrets
  - CBC Padding Oracle: byte-by-byte decryption (POODLE, BEAST)
  - CBC Bit-Flipping: controlled modification of plaintext
  - Birthday Bound (64-bit block): SWEET32 (3DES, Blowfish)
  - Related-Key attacks: theoretical attacks on key schedule
  - Cache-Timing: via S-box table lookups in memory

Specific to STREAM ciphers:
  - Nonce Reuse (many-time pad): the primary practical threat
  - Statistical Bias: first bytes of RC4 keystream are predictable
  - LFSR Linear Attacks: Berlekamp-Massey recovers LFSR in 2n bits
  - Time-Memory-Data Tradeoff: for weak ciphers (A5/1)

Common to both:
  - Weak RNG for key and nonce generation
  - Oracle attacks (padding oracle, timing oracle)
  - Implementation-level timing attacks
```

---

## When to Use Which

### Practical Guide

```
With AES-NI (servers, desktop x86_64):
  -> AES-256-GCM

Without AES-NI (ARM, IoT, mobile, embedded):
  -> ChaCha20-Poly1305

FIPS 140-2/3 compliance required:
  -> AES-256-GCM (ChaCha20 not yet in FIPS)

Many messages with random nonce (> 2^32):
  -> XChaCha20-Poly1305 or key rotation

Disk encryption (random access to sectors):
  -> AES-XTS (designed for block devices, not AEAD)
  LUKS2: AES-256-XTS by default

Legacy code with CBC:
  -> Must add HMAC (Encrypt-then-MAC)
  -> Or migrate to GCM/ChaCha20-Poly1305

Never use:
  ECB (for data longer than one block)
  RC4 (broken since 2001, banned in TLS 2015)
  DES (56-bit key, broken since 1998)
  3DES (banned by NIST since 2023)
  Any mode without authentication and no separate MAC
```

### Decision Tree

```
Need to encrypt data?
|
+-- FIPS required?  -> Yes -> AES-256-GCM
|
+-- AES-NI present? -> Yes -> AES-256-GCM
|                   -> No  -> ChaCha20-Poly1305
|
+-- Many messages per key (> 2^32)?
|   -> XChaCha20-Poly1305 or key rotation
|
+-- Disk encryption with random sector access?
|   -> AES-XTS (LUKS2, BitLocker)
|
+-- Need to authenticate AAD?
    -> GCM or ChaCha20-Poly1305 (both AEAD, both support AAD)
```

---

## Real-World Protocol Examples

### TLS 1.3

```
Three mandatory cipher suites (RFC 8446):
  TLS_AES_128_GCM_SHA256        <- AES block cipher in CTR mode + GHASH
  TLS_AES_256_GCM_SHA384        <- AES block cipher in CTR mode + GHASH
  TLS_CHACHA20_POLY1305_SHA256  <- ChaCha20 stream cipher + Poly1305

In practice:
  Chrome/Firefox without AES-NI: choose ChaCha20-Poly1305
  Servers with AES-NI (nginx):   prefer AES-GCM
  Selection: client offers ordered list, server picks first match

Same nonce scheme for both in TLS 1.3:
  Nonce = static_IV XOR (zero-padded sequence_number)
  sequence_number: 0, 1, 2, ... (increments, never repeats)
```

### WireGuard: Stream Only

```
WireGuard uses ONLY ChaCha20-Poly1305. No AES. No negotiation.
"Algorithm agility is the enemy of security." - Jason Donenfeld

Why only one algorithm:
  - No downgrade attacks (nothing to downgrade to)
  - No weak cipher suites
  - Simple implementation -> less code -> fewer bugs
  - ChaCha20 performs consistently without AES-NI dependency

Nonce: 64-bit packet counter (never repeats).
Handshake: Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s
```

### OpenSSH: Both Classes

```
Cipher suite priority (OpenSSH 9.0+):
  chacha20-poly1305@openssh.com  <- stream cipher (top priority)
  aes256-gcm@openssh.com         <- block cipher in GCM mode
  aes128-gcm@openssh.com         <- block cipher in GCM mode
  aes256-ctr + hmac-sha2-256     <- block CTR + separate MAC

All secure SSH cipher suites use either a block cipher in stream mode
(CTR/GCM) or a true stream cipher.
Plain CBC in SSH is deprecated and disabled by default.

Check which cipher is in use:
  ssh -vv user@host 2>&1 | grep "cipher:"
```

---

## Attacks: Practical Examples

### Many-Time Pad (Nonce Reuse)

```python
import os
from Crypto.Cipher import ChaCha20

def many_time_pad_demo():
    """
    If (key, nonce) is used twice - stream cipher is broken.
    """
    key   = os.urandom(32)
    nonce = os.urandom(12)  # BUG: same nonce for both messages!

    p1 = b"Attack at dawn! Send all forces."
    p2 = b"Retreat at noon. Conserve ammo!"

    c1 = ChaCha20.new(key=key, nonce=nonce).encrypt(p1)
    c2 = ChaCha20.new(key=key, nonce=nonce).encrypt(p2)

    # Attacker sees only c1 and c2
    xored = bytes(a ^ b for a, b in zip(c1, c2))
    # xored = p1 XOR p2 - leaked XOR of plaintexts!

    # Crib dragging: assume p1 contains "Attack"
    crib = b"Attack"
    for i in range(len(xored) - len(crib)):
        candidate = bytes(a ^ b for a, b in zip(xored[i:], crib))
        if all(32 <= x < 127 for x in candidate[:len(crib)]):
            print(f"Position {i}: if P1='{crib.decode()}' then P2='{candidate[:len(crib)].decode()}'")

    # Knowing p1 -> recover keystream -> decrypt c2
    ks = bytes(a ^ b for a, b in zip(c1, p1))
    p2_recovered = bytes(a ^ b for a, b in zip(c2, ks))
    print(f"P2 recovered: {p2_recovered}")

many_time_pad_demo()
```

### Padding Oracle: Block Cipher Specific

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt(plaintext: bytes) -> bytes:
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return IV + cipher.encrypt(pad(plaintext, 16))

def padding_oracle(ciphertext: bytes) -> bool:
    """
    Vulnerable server: returns True if padding is valid.
    In reality: different error messages = information leakage.
    """
    iv = ciphertext[:16]
    ct = ciphertext[16:]
    try:
        cipher = AES.new(KEY, AES.MODE_CBC, iv)
        unpad(cipher.decrypt(ct), 16)
        return True
    except ValueError:
        return False

def recover_last_byte(ct_block: bytes, prev_block: bytes) -> int:
    """Recover the last byte of a block via Padding Oracle"""
    for guess in range(256):
        modified_prev = bytearray(prev_block)
        modified_prev[15] = guess
        crafted = bytes(modified_prev) + ct_block
        if padding_oracle(crafted):
            # Padding 0x01 is valid: intermediate[15] = guess XOR 0x01
            intermediate = guess ^ 0x01
            return intermediate ^ prev_block[15]
    return -1

# ChaCha20-Poly1305 is immune to this attack:
# no blocks, no padding, tag rejects any modification
print("CBC Padding Oracle: attack specific to block ciphers with padding")
print("ChaCha20-Poly1305: no padding, no blocks, this attack does not apply")
```

### Random Access: Stream vs CBC

```python
from Crypto.Cipher import ChaCha20_Poly1305, AES
import os

data_1mb = os.urandom(1024 * 1024)
key = os.urandom(32)
n12 = os.urandom(12)
iv  = os.urandom(16)

TARGET_POS = 500_000  # want to decrypt byte at this position

# Stream cipher (CTR-like): only one keystream block needed
# block 500000//64 = 7812, offset = 500000%64 = 32
# Start decryption from any block - O(1)
print("Stream cipher / CTR random access:")
print(f"  To decrypt byte at position {TARGET_POS}:")
print(f"  -> Compute keystream block #{TARGET_POS // 64} only")
print(f"  -> XOR byte at offset {TARGET_POS % 64}")
print(f"  -> O(1) regardless of position\n")

# AES-CBC: must decrypt ALL blocks up to target - O(n)
print("AES-CBC random access:")
print(f"  To decrypt byte at position {TARGET_POS}:")
print(f"  -> Must decrypt all {TARGET_POS // 16} blocks before it")
print(f"  -> O(n) - proportional to position\n")

# AES-CTR: random access like a stream cipher
print("AES-CTR random access:")
print(f"  Same as stream: start counter at block #{TARGET_POS // 16}")
print(f"  -> O(1) regardless of position")
print(f"\nConclusion: CTR and stream ciphers give O(1) byte access")
print("           CBC requires decrypting all preceding blocks")
```

---

## Legacy Stream Ciphers: Why They Failed

### A5/1: GSM Encryption

```
A5/1 - stream cipher for voice in GSM (1987, kept secret until 1994).

Architecture:
  R1: 19-bit LFSR, tap positions: {18, 17, 16, 13}
  R2: 22-bit LFSR, tap positions: {21, 20}
  R3: 23-bit LFSR, tap positions: {22, 21, 20, 7}
  Total: 64 bits of state
  Irregular clocking: majority vote on bits 8/10/10

Attacks:
  1999: Biham, Dunkelman - theoretical attack 2^40
  2003: Kraken - TMTO with precomputed tables
  2010: Karsten Nohl - public rainbow tables published
        Real-time GSM interception on a standard PC!

Root cause:
  64-bit key (only 54 significant bits)
  Linear LFSR structure -> Berlekamp-Massey applies
  Irregular clocking adds minimal non-linearity

Replacement: KASUMI (A5/3) in 3G -> SNOW 3G and AES-128 in LTE.
```

### RC4: Why It Is Banned

```
RC4 (1987, leaked 1994) - historically the most widespread stream cipher.
Broken. RFC 7465 (2015): banned from TLS.

Problems:
1. Biased output: first 256+ bytes of keystream are statistically predictable.
   Attack: with repeated key use, first-byte statistics reveal the key.

2. Fluhrer-Mantin-Shamir (2001):
   Weak keys in RC4 -> key recovery attack.
   WEP: RC4 with predictable IV = catastrophe.
   WEP cracking tools: aircrack-ng, breaks in minutes.

3. RC4 NOMORE (2015):
   Session cookie recovery from HTTPS in ~52 hours.
   75% success probability after 2^24 encrypted sessions.

Replacement: ChaCha20 (Google specifically chose ChaCha20 to replace RC4 in 2014).
```

---

## Hybrid Encryption

```
In practice, symmetric encryption (of either class)
is never used in isolation for communication between parties.

Typical scheme:

1. Key Agreement (ECDH, X25519):
   Alice.pub * Bob.priv = Bob.pub * Alice.priv = shared_secret
   Neither party transmits the key explicitly

2. Key Derivation (HKDF):
   sym_key = HKDF(shared_secret, salt, "context", length=32)

3. Symmetric encryption (block or stream):
   ciphertext, tag = AES-256-GCM.encrypt(sym_key, nonce, data)
   or
   ciphertext, tag = ChaCha20-Poly1305.encrypt(sym_key, nonce, data)

TLS 1.3 does exactly this:
  X25519 ECDHE -> HKDF -> AES-GCM or ChaCha20-Poly1305

The choice between AES-GCM and ChaCha20-Poly1305 in this scheme:
  Only performance and compatibility (both are secure).
```

---

## Cheat Sheet

```
BLOCK CIPHER (AES):
  Encrypts fixed-size blocks (128 bits)
  Requires a mode of operation for data > 1 block
  Construction: SPN (AES) or Feistel (DES)
  Non-linearity: S-box (table in memory -> cache-timing risk)
  With AES-NI: ~2-5 GB/s (best choice on servers)

STREAM CIPHER (ChaCha20):
  Generates keystream -> XOR with data
  Arbitrary length, no padding
  Construction: ARX (no tables -> no cache-timing)
  Non-linearity: addition mod 2^32
  Without AES-NI: ~350 MB/s (best choice on ARM/IoT)

KEY INSIGHT:
  AES in CTR/GCM mode = functionally a stream cipher
  Boundary is blurred: both use the same AEAD pattern
  AES-GCM and ChaCha20-Poly1305 are structurally identical

SELECTION:
  With AES-NI    -> AES-256-GCM
  Without AES-NI -> ChaCha20-Poly1305
  FIPS required  -> AES-256-GCM
  WireGuard      -> ChaCha20-Poly1305 (fixed)
  TLS 1.3        -> both supported

NEVER:
  ECB, RC4, DES, 3DES
  Any mode without authentication and no separate MAC
  Reusing (Key, Nonce) pair

COMMANDS:
  openssl speed -evp chacha20-poly1305 aes-256-gcm
  openssl ciphers -v 'ALL' | grep -vE 'RC4|DES|NULL|EXPORT'
  grep aes /proc/cpuinfo   # check for AES-NI
```

---

## References

- [The Joy of Cryptography (Mike Rosulek)](https://joyofcryptography.com/) - free textbook
- [A Graduate Course in Applied Cryptography (Boneh, Shoup)](https://toc.cryptobook.us/) - full course
- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) - ChaCha20-Poly1305
- [NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800/38/a/final) - block cipher modes (CBC, CTR)
- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800/38/d/final) - GCM mode
- [eSTREAM Project](https://www.ecrypt.eu.org/stream/) - stream cipher competition 2008
- [SWEET32 (sweet32.info)](https://sweet32.info/) - birthday bound on 64-bit block ciphers
- [RFC 7465](https://www.rfc-editor.org/rfc/rfc7465) - RC4 prohibited in TLS
- [Cryptopals Challenges](https://cryptopals.com/) - practical attacks on both classes
