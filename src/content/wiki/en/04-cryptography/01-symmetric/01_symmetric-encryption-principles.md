---
title: "Symmetric Encryption - Principles"
date: "2026-05-15"
---

Symmetric encryption is a cryptographic scheme where the same key is used for both encryption and decryption. It is the fundamental building block of practical cryptography: fast, efficient, and - when applied correctly - highly secure.

---

## Core Idea

```
Encryption:   Plaintext + Key -> Ciphertext
Decryption:   Ciphertext + Key -> Plaintext

Key property: one key for both operations.
Hence "symmetric" - as opposed to asymmetric (public key + private key).

Goal: ensure data confidentiality.
Additionally (depending on mode): integrity, authenticity.
```

### Symmetric vs Asymmetric

```
Symmetric:
- One shared secret key
- Fast (AES-NI: ~2-4 GB/s)
- Usage: encrypting data, files, traffic
- Problem: how to securely share the key?

Asymmetric (RSA, ECDH):
- Public key encrypts, private key decrypts
- 100-1000x slower
- Usage: key exchange, digital signatures
- Solves the key distribution problem

In practice - a hybrid scheme:
Asymmetric -> securely exchange the symmetric key
Symmetric  -> encrypt data with that key

Example: TLS handshake (ECDH) -> session AES key -> data encryption
```

---

## Block Ciphers

### What is a Block Cipher

```
A block cipher is a function that takes a fixed-size block of data
and a key, and returns an encrypted block of the same size.

E(K, P) = C   (encryption)
D(K, C) = P   (decryption)

Where:
K - key
P - plaintext, exactly one block in size
C - ciphertext, same size as plaintext

It is a deterministic permutation: for a given K it is a bijection {0,1}^n -> {0,1}^n.
```

### Modern Block Ciphers

```
AES (Advanced Encryption Standard):
  Block size:   128 bits (16 bytes)
  Key size:     128, 192, or 256 bits
  Rounds:       10 / 12 / 14
  Standard:     NIST FIPS 197 (2001)
  Status:       primary standard, used everywhere

3DES (Triple DES):
  Block size:   64 bits (8 bytes)
  Key size:     112 or 168 bits (3 DES keys)
  Rounds:       48 (3 x 16)
  Status:       deprecated, banned for new systems (NIST 2023)

Blowfish / Twofish:
  Block size:   64 / 128 bits
  Status:       historical, not recommended

ChaCha20:
  Stream cipher, not a block cipher (see below)
  Widely used as an AES alternative (when no AES-NI)
```

### Round Structure

```
Block ciphers are built from multiple rounds.
Each round applies simple but combined operations.
Many rounds -> diffusion and confusion.

AES round (simplified):
1. SubBytes   - byte substitution via S-box (non-linearity, confusion)
2. ShiftRows  - shift rows of the state matrix (diffusion)
3. MixColumns - column mixing in GF(2^8) (diffusion)
4. AddRoundKey - XOR with round key (key injection)

Last round: no MixColumns.

Feistel structure (DES, Blowfish):
Split block into two halves L and R.
Round: L' = R, R' = L XOR F(R, K_i)
Decryption = encryption with reversed key schedule.
AES does NOT use Feistel (it uses SPN - Substitution-Permutation Network).
```

---

## Stream Ciphers

### What is a Stream Cipher

```
A stream cipher generates an infinite pseudorandom keystream
from a key (and nonce). Data is encrypted bit-by-bit (or byte-by-byte) via XOR.

Ciphertext_i = Plaintext_i XOR Keystream_i

Properties:
- No concept of "blocks" - works with arbitrary-length data
- No padding required
- Encryption = decryption (same XOR operation)
- Faster on hardware without AES-NI
```

### ChaCha20

```
A modern stream cipher, designed by Bernstein (2008).
Based on the ARX function: Addition, Rotation, XOR - no lookup tables.

Parameters:
- Key: 256 bits
- Nonce: 96 bits (12 bytes) in ChaCha20-IETF (RFC 7539)
- Counter: 32 bits
- Keystream block size: 512 bits (64 bytes)
- Rounds: 20

Usage:
- TLS 1.3: TLS_CHACHA20_POLY1305_SHA256
- WireGuard, SSH, QUIC
- Android, iOS (when no AES-NI)

Advantage over AES:
On devices without AES-NI (older ARM), ChaCha20 is faster and safer
(no timing attacks via cache, since there are no lookup tables).
```

### RC4 (deprecated, do not use)

```
A historical stream cipher, completely broken.
Banned in TLS (RFC 7465, 2015).

Problems:
- Statistical weaknesses in the first bytes of the keystream
- Attacks on WEP (Wi-Fi): repeated IV -> many-time pad
- NOMORE attack (2015): cookie recovery in HTTPS

Never use RC4 in new systems.
```

---

## Kerckhoffs's Principle

```
Auguste Kerckhoffs, 1883:
"A cryptosystem should be secure even if everything about the system,
except the key, is public knowledge."

Claude Shannon reformulated it: "The enemy knows the system."

What this means in practice:
- Security = secrecy of the KEY, not the algorithm
- The algorithm is published and reviewed by the cryptographic community
- "Security through obscurity" does not work

Examples of violations:
- DVD CSS: proprietary algorithm, broken in hours once leaked
- GSM A5/1: classified algorithm, cracked once it became known
- Clipper chip (NSA, 1993): backdoor through secret algorithm Skipjack

The right approach:
AES, ChaCha20, SHA-256 - public, extensively reviewed algorithms.
```

---

## Confusion and Diffusion

```
Shannon (1949) defined two properties necessary for a strong cipher:

CONFUSION:
The relationship between the key and the ciphertext must be as complex as possible.
Changing one bit of the key must unpredictably affect the entire ciphertext.
Implementation in AES: SubBytes (S-box substitution)

DIFFUSION:
Changing one bit of the plaintext must affect
many bits of the ciphertext (ideally half of them).
Implementation in AES: ShiftRows + MixColumns

Avalanche Effect:
Changing 1 bit of input -> ~50% of output bits change.
AES achieves full avalanche effect after just 2 rounds.

Example:
Plaintext:  00000000 00000000 00000000 00000000
                     vs
Plaintext:  10000000 00000000 00000000 00000000  (1 bit difference)
After AES-128: ciphertexts differ in approximately 64 out of 128 bits.
```

---

## Keys: Generation and Size

### Key Size and Security

```
Cipher strength = cost of a brute-force key search.

Key size      Combinations       Time to brute-force (10^12 keys/s)
---------     ------------       ----------------------------------
56 bits       2^56 = 7.2*10^16   ~20 hours (DES - broken in 1998!)
64 bits       2^64 = 1.8*10^19   ~213 days
80 bits       2^80 = 1.2*10^24   ~38,000 years
128 bits      2^128              practically infinite
256 bits      2^256              impossible even for quantum computers

Quantum computers (Grover's algorithm):
Halve the effective security of symmetric ciphers (in bits).
AES-128 -> 64 bits effective security (debated, requires enormous resources)
AES-256 -> 128 bits of security (safe)

NIST recommendation (2024+): AES-128 and above are acceptable.
For long-term security (>10 years): AES-256.
```

### Key Generation

```
Golden rule: keys must be generated from a cryptographically secure
pseudorandom number generator (CSPRNG).

OS entropy sources:
- Linux:   /dev/urandom (recommended), /dev/random
           getrandom() system call (Linux 3.17+)
- Windows: BCryptGenRandom(), CryptGenRandom()
- macOS:   SecRandomCopyBytes(), arc4random()

NEVER use for keys:
- rand() / random() from the C standard library
- Math.random() in JavaScript
- Current timestamp
- Predictable patterns

# Python: correct key generation
import os
key_128 = os.urandom(16)   # 128 bits
key_256 = os.urandom(32)   # 256 bits

# secrets module (Python 3.6+)
import secrets
key = secrets.token_bytes(32)
```

### Key Derivation from Passwords (KDF)

```
User passwords have low entropy (~20-40 bits of real entropy).
Using a password directly as an AES key is dangerous.

A Key Derivation Function (KDF) is required:
Password + Salt -> KDF -> Key of the desired size

PBKDF2 (RFC 8018):
  key = PBKDF2(password, salt, iterations, dklen, PRF=HMAC-SHA256)
  NIST recommends: 600,000+ iterations for SHA-256 (2023)
  Downside: parallelizable on GPUs/ASICs

bcrypt:
  Designed for password storage (hashing), not key generation
  Limitation: maximum 72-byte input password

Argon2 (winner of Password Hashing Competition 2015):
  Three variants: Argon2d, Argon2i, Argon2id (recommended)
  Parameters: time_cost, memory_cost, parallelism
  Resistant to GPU/ASIC attacks (memory-hard)
  Recommendation: Argon2id with 64MB memory, 3 iterations

scrypt (Colin Percival, 2009):
  Also memory-hard, widely used (LUKS, Ethereum)

# Python: Argon2
from argon2.low_level import hash_secret_raw, Type
import os

salt = os.urandom(16)
key = hash_secret_raw(
    secret=b"user_password",
    salt=salt,
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,        # 256-bit key
    type=Type.ID        # Argon2id
)
```

---

## Modes of Operation

```
A block cipher (AES) by itself only encrypts a single 16-byte block.
The mode of operation defines how data of arbitrary length is processed.

Main modes:

ECB (Electronic Codebook):
  Each block encrypted independently.
  INSECURE: identical blocks -> identical ciphertext.

CBC (Cipher Block Chaining):
  Ci = AES(Pi XOR C(i-1)), IV = random.
  Sequential encryption. Vulnerable to Padding Oracle without MAC.

CTR (Counter):
  Keystream = AES(Nonce||Counter). Ci = Pi XOR KS_i.
  Parallel. Stream mode. No padding.

GCM (Galois/Counter Mode):
  CTR + GHASH authentication. AEAD mode.
  Confidentiality + integrity + authenticity.
  De facto standard for new systems.

Details: see wiki "AES - modes ECB, CBC, CTR, GCM"
```

---

## Authenticated Encryption (AEAD)

```
Encryption without authentication only protects confidentiality.
An attacker can modify the ciphertext and the receiver will accept corrupted data.

AEAD (Authenticated Encryption with Associated Data):
Simultaneously provides:
1. Confidentiality (encryption)
2. Integrity - data has not been modified
3. Authenticity - data came from the right sender
4. AAD authentication - additional data is verified but not encrypted

Encrypt-then-MAC principle:
  1. Encrypt: C = Enc(K1, P)
  2. Compute MAC: Tag = MAC(K2, C)
  3. Send: C || Tag
  4. Receiver: verifies Tag first, then decrypts

Order matters:
  Encrypt-then-MAC  -> secure (TLS 1.2 with HMAC, IPSec)
  MAC-then-Encrypt  -> vulnerable to Padding Oracle (SSL 3.0, TLS 1.0)
  Encrypt-and-MAC   -> insecure (SSH v1)

AEAD algorithms (recommended):
  AES-GCM:           block cipher + GHASH
  ChaCha20-Poly1305: stream cipher + Poly1305 MAC
  AES-CCM:           CTR + CBC-MAC (IoT, 802.15.4)
  AES-SIV:           deterministic AEAD
```

---

## MAC and HMAC

```
MAC (Message Authentication Code) - a short tag that confirms
the integrity and authenticity of data.

HMAC (Hash-based MAC):
  HMAC(K, M) = H((K XOR opad) || H((K XOR ipad) || M))

  Where H is a hash function (SHA-256, SHA-512)
  ipad = 0x36, opad = 0x5C (constants)

  HMAC-SHA256: 256-bit tag
  Secure if H is secure (no length extension attack, unlike H(K||M))

CMAC (Cipher-based MAC):
  Based on a block cipher (AES-CMAC).
  Used in IPSec, 3GPP.

Poly1305:
  One-time MAC - key is used only once.
  Paired with ChaCha20 or AES (AES-Poly1305).
  Very fast, used in WireGuard, TLS 1.3.

# Python: HMAC
import hmac, hashlib, os

key = os.urandom(32)
message = b"Data to authenticate"

tag = hmac.new(key, message, hashlib.sha256).digest()  # 32 bytes

# Verification (constant time!):
is_valid = hmac.compare_digest(
    tag,
    hmac.new(key, message, hashlib.sha256).digest()
)
```

---

## Attacks on Symmetric Ciphers

### Theoretical Attacks

```
Brute Force:
  Try every possible key.
  Cost: O(2^|key|)
  Defense: sufficient key size (128+ bits)

Differential Cryptanalysis:
  Analyze differences between pairs of plaintexts and their ciphertexts.
  Attack on cipher rounds, allows recovering the key faster than brute force.
  DES is vulnerable. AES was designed with this attack in mind.

Linear Cryptanalysis:
  Find linear approximations between bits of PT, CT, and the key.
  First practical attack on DES (Matsui, 1993).
  AES is resistant.

Meet-in-the-Middle:
  Attack on double encryption: Enc(K2, Enc(K1, P)) = C
  Does NOT give double security! 2DES = 2^56 strength, not 2^112.
  That's exactly why 3DES was used (but it's also now deprecated).

Related-Key Attacks:
  Analysis of ciphertexts produced by similar but different keys.
  AES-256 is theoretically vulnerable (theoretical, not practical).
```

### Practical Attacks

```
Padding Oracle:
  Server reveals whether padding is valid -> byte-by-byte decryption without key.
  POODLE (2014): SSL 3.0 + CBC
  Defense: Encrypt-then-MAC or AEAD.

Timing Attack:
  Execution time depends on data -> information leakage.
  Example: MAC comparison via == terminates at the first mismatched byte.
  Defense: hmac.compare_digest() - constant-time comparison.

Cache-Timing (AES S-box tables):
  Accessing different cache addresses takes different time.
  Attacks on software AES through S-box lookup tables.
  Defense: AES-NI instructions (hardware AES without tables).

Nonce Reuse:
  Reusing (Key, Nonce) in CTR/GCM -> catastrophic failure.
  Defense: random nonce or counter guaranteed to never repeat.

Birthday Attack:
  With a 64-bit block, collisions are expected after 2^32 blocks = 32 GB.
  SWEET32 (2016): attack on 3DES and Blowfish (64-bit block).
  Defense: use 128-bit block (AES).
```

---

## Key Management in Systems

### Key Lifecycle

```
1. Generation   -> CSPRNG, sufficient length
2. Storage      -> secure storage (HSM, KMS, Vault)
3. Distribution -> only over a secure channel (TLS, ECDH)
4. Rotation     -> periodic key change
5. Revocation   -> mechanism to invalidate compromised keys
6. Destruction  -> guaranteed deletion (shred, HSM erase)
```

### Key Hierarchy

```
Organizing keys in layers:

Master Key (KEK - Key Encrypting Key):
  - Stored in an HSM (Hardware Security Module)
  - Never leaves the HSM in plaintext
  - Used only to encrypt other keys

Data Encryption Key (DEK):
  - Encrypts actual data
  - Stored encrypted by the KEK
  - Rotated regularly (daily / hourly / per message)

Session Key:
  - Temporary key for one session (TLS, SSH)
  - Generated for each connection (ECDH)
  - Provides forward secrecy

Envelope Encryption:
  DEK = random_key()
  Ciphertext = AES_DEK(Plaintext)
  Encrypted_DEK = AES_KEK(DEK)
  Store: Ciphertext + Encrypted_DEK

  On decryption:
  DEK = AES_KEK^(-1)(Encrypted_DEK)  // request to KMS
  Plaintext = AES_DEK^(-1)(Ciphertext)
```

### KMS and HSM

```
KMS (Key Management Service):
  Cloud-based key management service.
  AWS KMS, Google Cloud KMS, Azure Key Vault.
  API: encrypt(KeyId, Plaintext), decrypt(KeyId, Ciphertext)
  Key rotation, audit logs, IAM integration.

HSM (Hardware Security Module):
  Physical device for storing keys.
  Keys cannot be extracted in plaintext.
  FIPS 140-2/3 certification (Level 2, 3, 4).
  Examples: Thales Luna, AWS CloudHSM, YubiHSM.
  Usage: banks, PKI root keys, code signing.
```

---

## Perfect Forward Secrecy (PFS)

```
If a long-term key is compromised, past sessions
must remain protected.

Without PFS:
  TLS with RSA key exchange: client encrypts pre-master secret with server's public key.
  If the server's private key leaks -> ALL past sessions can be decrypted.

With PFS (Ephemeral Diffie-Hellman, ECDHE):
  A new ECDH key pair is generated for each session.
  The long-term key is only used to authenticate the handshake signature.
  Compromise of the long-term key -> cannot decrypt past sessions.

TLS 1.3 mandates PFS: only ECDHE cipher suites.
TLS 1.2: DHE and ECDHE cipher suites - optional.

Session key derivation in TLS 1.3:
ECDHE secret + PSK (if any) -> HKDF -> master_secret
master_secret -> HKDF expand -> client_key, server_key (AES-256-GCM)
```

---

## Encryption in Practice

### File Encryption (Python)

```python
from Crypto.Cipher import AES
import os

def encrypt_file(key: bytes, infile: str, outfile: str):
    """AES-256-GCM file encryption"""
    nonce = os.urandom(12)

    with open(infile, 'rb') as f:
        plaintext = f.read()

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    with open(outfile, 'wb') as f:
        # Format: [nonce 12 bytes][tag 16 bytes][ciphertext]
        f.write(nonce + tag + ciphertext)

def decrypt_file(key: bytes, infile: str, outfile: str):
    """AES-256-GCM file decryption"""
    with open(infile, 'rb') as f:
        data = f.read()

    nonce      = data[:12]
    tag        = data[12:28]
    ciphertext = data[28:]

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except ValueError:
        raise ValueError("Authentication tag mismatch - file is corrupt or tampered")

    with open(outfile, 'wb') as f:
        f.write(plaintext)

# Usage:
key = os.urandom(32)  # store securely!
encrypt_file(key, "secret.pdf", "secret.pdf.enc")
decrypt_file(key, "secret.pdf.enc", "secret_recovered.pdf")
```

### Password-Based Encryption (Python)

```python
from Crypto.Cipher import AES
from argon2.low_level import hash_secret_raw, Type
import os

def encrypt_with_password(password: str, plaintext: bytes) -> bytes:
    """Encrypt data with a password using Argon2id + AES-256-GCM"""
    salt  = os.urandom(16)
    nonce = os.urandom(12)

    # KDF: password -> key
    key = hash_secret_raw(
        secret=password.encode(),
        salt=salt,
        time_cost=3,
        memory_cost=65536,  # 64 MB
        parallelism=1,
        hash_len=32,
        type=Type.ID
    )

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    # Format: [salt 16][nonce 12][tag 16][ciphertext]
    return salt + nonce + tag + ciphertext

def decrypt_with_password(password: str, data: bytes) -> bytes:
    salt       = data[:16]
    nonce      = data[16:28]
    tag        = data[28:44]
    ciphertext = data[44:]

    key = hash_secret_raw(
        secret=password.encode(),
        salt=salt,
        time_cost=3,
        memory_cost=65536,
        parallelism=1,
        hash_len=32,
        type=Type.ID
    )

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(ciphertext, tag)  # raises ValueError if tampered
```

---

## OpenSSL - Practice

```bash
# Generate a random key
openssl rand -hex 32              # 256 bits in hex
openssl rand -base64 32           # 256 bits in base64

# Encrypt a file with AES-256-GCM and a password
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 \
    -in plaintext.txt -out encrypted.bin \
    -k "MySecretPassword"

# Decrypt
openssl enc -d -aes-256-gcm -pbkdf2 -iter 600000 \
    -in encrypted.bin -out plaintext.txt \
    -k "MySecretPassword"

# Encrypt with explicit key and IV (hex)
KEY=$(openssl rand -hex 32)
IV=$(openssl rand -hex 16)
openssl enc -aes-256-cbc -K $KEY -iv $IV \
    -in file.txt -out file.enc

# Benchmark
openssl speed -evp aes-128-gcm aes-256-gcm aes-128-cbc

# Check for AES-NI
grep -m1 aes /proc/cpuinfo
```

---

## Common Mistakes

```
1. Using a weak RNG for key generation
   Bad:  key = str(time.time()).encode()[:16]
   Good: key = os.urandom(16)

2. Hardcoded key in source code
   Bad:  KEY = b"mysecretkey12345"
   Good: key from KMS / environment variables / HSM

3. Reusing nonce/IV in CTR or GCM
   Result: plaintext exposure or loss of authentication

4. CBC without authentication
   Vulnerable to bit-flipping and Padding Oracle

5. Password used directly as a key
   Bad:  key = password.encode().ljust(16)[:16]
   Good: key = Argon2id(password, salt, ...)

6. Non-constant-time tag comparison
   Bad:  received_tag == computed_tag  (timing attack!)
   Good: hmac.compare_digest(received_tag, computed_tag)

7. ECB for data encryption
   Plaintext patterns are visible in the ciphertext

8. Key size too small
   3DES (112 bits), DES (56 bits) - outdated and insecure
```

---

## Cheat Sheet

```
Cipher types:
  Block (AES): encrypts fixed blocks, requires a mode of operation
  Stream (ChaCha20): XOR with keystream, arbitrary length

Algorithm selection (2024+):
  Data encryption:       AES-256-GCM
  No AES-NI (ARM):       ChaCha20-Poly1305
  Password storage:      Argon2id
  MAC:                   HMAC-SHA256 or Poly1305

Key sizes:
  AES-128: 128 bits -> 2^128 options (fine)
  AES-256: 256 bits -> 2^256 options (recommended)
  Quantum: AES-256 -> 128 bits effective security

Key generation:
  os.urandom(32)                  # Python
  /dev/urandom                    # Linux
  BCryptGenRandom()               # Windows

KDF (password -> key):
  Argon2id  -> recommended (memory-hard)
  scrypt    -> alternative
  PBKDF2    -> 600k+ iterations SHA-256 (NIST 2023)

Principles:
  Kerckhoffs: security = secret key, not secret algorithm
  AEAD:       always encrypt AND authenticate
  PFS:        new key per session (ECDHE)
  Nonce:      never reuse (Key, Nonce) pair

Commands:
  openssl rand -hex 32                      # random key
  openssl speed -evp aes-256-gcm            # benchmark
  grep aes /proc/cpuinfo                    # AES-NI
```

---

## References

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - AES standard
- [NIST SP 800-57](https://csrc.nist.gov/publications/detail/sp/800/57/pt1/rev5/final) - Recommendation for Key Management
- [NIST SP 800-131A](https://csrc.nist.gov/publications/detail/sp/800/131/a/rev2/final) - Transitioning Cryptographic Algorithms
- [RFC 7539](https://www.rfc-editor.org/rfc/rfc7539) - ChaCha20 and Poly1305
- [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116) - AEAD interface
- [RFC 8018](https://www.rfc-editor.org/rfc/rfc8018) - PBKDF2
- [Password Hashing Competition](https://www.password-hashing.net/) - Argon2
- [Cryptography Engineering](https://www.schneier.com/books/cryptography-engineering/) - Ferguson, Schneier, Kohno
