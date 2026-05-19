---
title: "ChaCha20-Poly1305"
date: "2026-05-15"
---

ChaCha20-Poly1305 is a modern AEAD (Authenticated Encryption with Associated Data) algorithm combining the ChaCha20 stream cipher with the Poly1305 MAC. Designed by Daniel J. Bernstein (djb). Standardized in RFC 8439 (2018). It is the primary alternative to AES-GCM - especially on devices without hardware AES acceleration.

---

## Why an Alternative to AES-GCM is Needed

```
AES-GCM is an excellent algorithm but has limitations:

1. Depends on AES-NI (hardware acceleration):
   On ARM without AES-NI (older smartphones, IoT, embedded):
   AES-GCM:             ~40-60 MB/s
   ChaCha20-Poly1305:   ~200-400 MB/s

2. Timing attacks on software AES:
   Substitution tables (S-boxes) use memory lookups.
   Cache-timing attacks are possible in shared environments (VMs, cloud).
   ChaCha20 uses only ARX (no tables) -> no cache-timing.

3. Nonce reuse in GCM is catastrophic:
   Repeated nonce -> H is leaked -> forging any future tag permanently.
   ChaCha20-Poly1305 loses confidentiality on nonce reuse,
   but does not lose authentication as catastrophically.

Summary: ChaCha20-Poly1305 is the default choice when AES-NI is unavailable.
TLS 1.3, WireGuard, QUIC, OpenSSH all support both algorithms.
```

---

## ChaCha20: The Stream Cipher

### Origins

```
Salsa20 (Bernstein, 2005) -> ChaCha20 (Bernstein, 2008)

ChaCha = "cha cha" from Salsa (both use a quarter-round function).
ChaCha20 improves on Salsa20's diffusion: better avalanche propagation
with the same number of rounds, stronger resistance to differential cryptanalysis.

eSTREAM (2008): Salsa20 selected as a finalist in the stream cipher competition.
Google: chose ChaCha20-Poly1305 for HTTPS on mobile in 2014.
RFC 7539 (2015) -> RFC 8439 (2018): IETF standard.
```

### ChaCha20 Parameters

```
Key:     256 bits (32 bytes)
Nonce:   96 bits (12 bytes) - IETF variant (RFC 8439)
         64 bits (8 bytes)  - original Bernstein variant
Counter: 32 bits (IETF) or 64 bits (original)
Keystream block: 512 bits (64 bytes)
Rounds:  20 (hence "20" in the name)

Maximum data per (key, nonce):
  2^32 blocks x 64 bytes = 256 GB (IETF, 32-bit counter)
  2^64 blocks x 64 bytes = practically unlimited (original)
```

### ChaCha20 State: 4x4 Matrix

```
ChaCha20 operates on a state of 16 32-bit words (512 bits total):

+----------------+----------------+----------------+----------------+
|   "expa"       |   "nd 3"       |   "2-by"       |   "te k"       |
|   constant     |   constant     |   constant     |   constant     |
+----------------+----------------+----------------+----------------+
|   Key[0]       |   Key[1]       |   Key[2]       |   Key[3]       |
|  (bytes 0-3)   |  (bytes 4-7)   |  (bytes 8-11)  |  (bytes 12-15) |
+----------------+----------------+----------------+----------------+
|   Key[4]       |   Key[5]       |   Key[6]       |   Key[7]       |
| (bytes 16-19)  | (bytes 20-23)  | (bytes 24-27)  | (bytes 28-31)  |
+----------------+----------------+----------------+----------------+
|   Counter      |   Nonce[0]     |   Nonce[1]     |   Nonce[2]     |
|   (32 bits)    |  (bytes 0-3)   |  (bytes 4-7)   |  (bytes 8-11)  |
+----------------+----------------+----------------+----------------+

Constant "expa nd 3 2-by te k" = "expand 32-byte k" (ASCII)
This magic number from Bernstein ensures fixed initialization.
```

### Quarter Round: The Building Block

```
All non-linearity in ChaCha20 comes from one operation - the quarter round.
Uses only ARX: Addition, Rotation, XOR.

QuarterRound(a, b, c, d):
  a += b;  d ^= a;  d <<<= 16;
  c += d;  b ^= c;  b <<<= 12;
  a += b;  d ^= a;  d <<<= 8;
  c += d;  b ^= c;  b <<<= 7;

All operations on 32-bit unsigned words (mod 2^32).
<<< = left circular rotation.

Advantages of ARX:
- No tables -> no cache-timing attacks
- Constant-time execution on any platform
- Efficient on 32-bit processors without special instructions
```

### Full ChaCha20 Round

```
One round = 4 QuarterRound operations:

Column round:
  QR(0, 4,  8, 12)   QR(1, 5,  9, 13)
  QR(2, 6, 10, 14)   QR(3, 7, 11, 15)

Diagonal round:
  QR(0, 5, 10, 15)   QR(1, 6, 11, 12)
  QR(2, 7,  8, 13)   QR(3, 4,  9, 14)

Two QRs back to back = one "double round".
ChaCha20 = 10 double rounds = 20 QR calls total.

After 20 rounds: add the initial state (add initial state):
  output = final_state + initial_state  (element-wise addition mod 2^32)

This prevents inversion: knowing the output, you cannot recover key/nonce.
```

### Keystream Generation

```
To encrypt a block of data:
  1. Initialize the state (constants + key + counter + nonce)
  2. Perform 20 rounds (10 double rounds)
  3. Add the initial state
  4. Serialize to 64 bytes of keystream (little-endian)
  5. XOR with the plaintext block

  Ciphertext[i..i+64] = Plaintext[i..i+64] XOR Keystream(counter=i/64)

For the next block: increment counter by 1 and repeat.
Parallelism: blocks are independent -> fully parallel.

Random access:
  To decrypt byte at position N:
  counter = N // 64
  offset  = N % 64
  keystream_block = ChaCha20_block(key, nonce, counter)
  plaintext_byte  = ciphertext_byte XOR keystream_block[offset]
```

```python
# Simplified ChaCha20 implementation for understanding
import struct

def rotl32(v, n):
    """Left rotate a 32-bit word"""
    return ((v << n) | (v >> (32 - n))) & 0xFFFFFFFF

def quarter_round(state, a, b, c, d):
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = rotl32(state[d], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = rotl32(state[b], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = rotl32(state[d],  8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = rotl32(state[b],  7)

def chacha20_block(key: bytes, counter: int, nonce: bytes) -> bytes:
    """Generate one 64-byte keystream block"""
    # Constants "expand 32-byte k"
    constants = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]

    # Key: 8 32-bit words (little-endian)
    key_words = list(struct.unpack('<8I', key))

    # Nonce: 3 32-bit words (IETF, 96-bit nonce)
    nonce_words = list(struct.unpack('<3I', nonce))

    # Initial state
    state = constants + key_words + [counter] + nonce_words

    # Working copy
    working = state[:]

    # 20 rounds (10 double rounds)
    for _ in range(10):
        # Column round
        quarter_round(working, 0, 4,  8, 12)
        quarter_round(working, 1, 5,  9, 13)
        quarter_round(working, 2, 6, 10, 14)
        quarter_round(working, 3, 7, 11, 15)
        # Diagonal round
        quarter_round(working, 0, 5, 10, 15)
        quarter_round(working, 1, 6, 11, 12)
        quarter_round(working, 2, 7,  8, 13)
        quarter_round(working, 3, 4,  9, 14)

    # Add initial state
    output = [(working[i] + state[i]) & 0xFFFFFFFF for i in range(16)]

    # Serialize to bytes (little-endian)
    return struct.pack('<16I', *output)

def chacha20_encrypt(key: bytes, nonce: bytes, plaintext: bytes, counter: int = 0) -> bytes:
    """ChaCha20 encryption/decryption"""
    ciphertext = bytearray()
    for i in range(0, len(plaintext), 64):
        block = plaintext[i:i+64]
        keystream = chacha20_block(key, counter + i // 64, nonce)
        ciphertext += bytes(p ^ k for p, k in zip(block, keystream))
    return bytes(ciphertext)
```

---

## Poly1305: The Authentication MAC

### Origins and Idea

```
Poly1305 (Bernstein, 2005) - a one-time MAC.
"One-time" means: the key is used for exactly ONE message.

When paired with ChaCha20, this is achieved automatically:
ChaCha20 generates a unique 32-byte Poly1305 key
from the first keystream block (counter=0).

Mathematical basis:
  Poly1305 evaluates a polynomial over the field GF(2^130 - 5).
  The message is split into 16-byte blocks.
  Each block is a polynomial coefficient.
  Computes P(r) mod (2^130 - 5), then adds s.

Parameters:
  Key:   256 bits (32 bytes) = r (128 bits) + s (128 bits)
  Tag:   128 bits (16 bytes)
  Speed: very high (no S-boxes, only addition and multiplication)
```

### Poly1305 Math

```
The key is split into two parts:
  r = first 16 bytes (with clamping applied)
  s = last 16 bytes

Clamp r (zero out certain bits for efficient implementation):
  r[3]  &= 0x0F
  r[7]  &= 0x0F
  r[11] &= 0x0F
  r[15] &= 0x0F
  r[4]  &= 0xFC
  r[8]  &= 0xFC
  r[12] &= 0xFC

Message processing (block by block):
  acc = 0
  for each 16-byte block m_i:
      n_i = little_endian_integer(m_i) + 2^(8*len(m_i))  # add high bit
      acc = (acc + n_i) * r mod (2^130 - 5)

  tag = (acc + s) mod 2^128

Result: a 16-byte authentication tag.
```

### Why 2^130 - 5?

```
2^130 - 5 is a (near) Mersenne prime.
Arithmetic modulo this number is highly efficient:
  2^130 ≡ 5 (mod p)
  Reduction: x mod p = (x >> 130) * 5 + (x & (2^130 - 1))

This allows multiplication to be implemented without division.
On 64-bit processors: 3 64x64-bit multiplications per block.

Security:
  If r is random (which ChaCha20 ensures), Poly1305
  is an information-theoretically secure MAC:
  forgery probability <= (length/16 + 1) / 2^102
```

```python
def poly1305_mac(key: bytes, message: bytes) -> bytes:
    """
    Simplified Poly1305 implementation for understanding.
    In production, use Crypto.Hash.Poly1305 or nacl.
    """
    assert len(key) == 32

    # Clamp r
    r = bytearray(key[:16])
    r[3]  &= 0x0F; r[7]  &= 0x0F; r[11] &= 0x0F; r[15] &= 0x0F
    r[4]  &= 0xFC; r[8]  &= 0xFC; r[12] &= 0xFC
    r = int.from_bytes(r, 'little')

    s = int.from_bytes(key[16:], 'little')
    p = (1 << 130) - 5  # field prime

    acc = 0
    for i in range(0, len(message), 16):
        block = message[i:i+16]
        n = int.from_bytes(block, 'little') + (1 << (8 * len(block)))
        acc = (acc + n) * r % p

    tag = (acc + s) % (1 << 128)
    return tag.to_bytes(16, 'little')
```

---

## ChaCha20-Poly1305: AEAD Construction

### Protocol (RFC 8439)

```
Inputs:
  key     = 256 bits (32 bytes)
  nonce   = 96 bits (12 bytes)
  aad     = additional authenticated data (any length)
  message = plaintext (any length)

Step 1: generate Poly1305 key
  poly_key = ChaCha20_block(key, counter=0, nonce)[:32]
  (first 32 bytes of the first keystream block)

Step 2: encrypt data
  ciphertext = ChaCha20_encrypt(key, nonce, message, counter=1)
  (counter starts at 1 - block 0 is reserved for Poly1305)

Step 3: build Poly1305 input
  Poly1305_input =
    AAD || pad16(AAD)                    <- AAD padded to 16-byte boundary
    || ciphertext || pad16(ciphertext)   <- ciphertext padded
    || len(AAD) as uint64 LE             <- AAD length (8 bytes, little-endian)
    || len(ciphertext) as uint64 LE      <- CT length (8 bytes, little-endian)

  pad16(x): append zeros until length is a multiple of 16
  (if already a multiple of 16 - no padding added)

Step 4: compute tag
  tag = Poly1305_MAC(poly_key, Poly1305_input)

Output: ciphertext || tag (16 bytes)
```

```
Visual diagram:

key + nonce + counter=0
        |
   ChaCha20_block
        |
   first 32 bytes -> Poly1305 key (r, s)
   (rest discarded)

key + nonce + counter=1,2,3,...
        |
   ChaCha20_encrypt
        |
   Ciphertext

AAD || padding || Ciphertext || padding || len(AAD) || len(CT)
        |
   Poly1305_MAC(poly_key, ...)
        |
       Tag (16 bytes)

Send to receiver: Ciphertext || Tag
AAD is transmitted in the clear (e.g. packet headers)
```

### Decryption and Verification

```
Receiver has: key, nonce, aad, ciphertext, tag

1. Generate poly_key = ChaCha20_block(key, 0, nonce)[:32]
2. Compute expected_tag = Poly1305_MAC(poly_key, build input)
3. Compare tag == expected_tag (CONSTANT TIME!)
   - If mismatch: REJECT, do not return any data
   - If match: proceed to decrypt

4. plaintext = ChaCha20_encrypt(key, nonce, ciphertext, counter=1)

CRITICAL: verify the tag BEFORE decrypting.
Never return decrypted data when the tag is invalid.
```

---

## Usage in Python

### Basic Usage (PyCryptodome)

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os

key   = os.urandom(32)   # 256-bit key
nonce = os.urandom(12)   # 96-bit nonce (IETF)

# Encryption
plaintext = b"Secret message that needs AEAD protection"
aad       = b"version=1;user_id=42"  # authenticated, not encrypted

cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher.update(aad)
ciphertext, tag = cipher.encrypt_and_digest(plaintext)

print(f"Key:        {key.hex()}")
print(f"Nonce:      {nonce.hex()}")
print(f"AAD:        {aad}")
print(f"Ciphertext: {ciphertext.hex()}")
print(f"Tag:        {tag.hex()}")  # always 16 bytes

# Decryption
cipher2 = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher2.update(aad)
try:
    recovered = cipher2.decrypt_and_verify(ciphertext, tag)
    print(f"Recovered:  {recovered}")
except ValueError:
    print("Error: tag mismatch - data is corrupt or tampered!")

# Demonstrate tampering detection
tampered = bytearray(ciphertext)
tampered[0] ^= 0xFF
cipher3 = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher3.update(aad)
try:
    cipher3.decrypt_and_verify(bytes(tampered), tag)
except ValueError:
    print("Tampering detected!")  # always triggers
```

### Basic Usage (PyNaCl)

```python
import nacl.secret
import nacl.utils

# nacl uses a 24-byte nonce (XSalsa20-Poly1305)
key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)  # 32 bytes
box = nacl.secret.SecretBox(key)

# Encryption (nonce is generated automatically and included in output)
message = b"Hello, NaCl!"
encrypted = box.encrypt(message)  # nonce (24) + ciphertext + tag

# Decryption
decrypted = box.decrypt(encrypted)
print(decrypted)  # b'Hello, NaCl!'

# Explicit nonce management
nonce = nacl.utils.random(nacl.secret.SecretBox.NONCE_SIZE)  # 24 bytes
encrypted = box.encrypt(message, nonce)
decrypted = box.decrypt(encrypted)
```

### File Encryption

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os, struct

def encrypt_file(key: bytes, inpath: str, outpath: str, aad: bytes = b"") -> None:
    """ChaCha20-Poly1305 file encryption"""
    nonce = os.urandom(12)

    with open(inpath, 'rb') as f:
        plaintext = f.read()

    cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    if aad:
        cipher.update(aad)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    with open(outpath, 'wb') as f:
        # Format: [nonce 12][tag 16][aad_len 4][aad][ciphertext]
        aad_len = struct.pack('<I', len(aad))
        f.write(nonce + tag + aad_len + aad + ciphertext)
    print(f"Encrypted: {len(plaintext)} bytes -> {outpath}")

def decrypt_file(key: bytes, inpath: str, outpath: str) -> None:
    """ChaCha20-Poly1305 file decryption"""
    with open(inpath, 'rb') as f:
        data = f.read()

    nonce   = data[:12]
    tag     = data[12:28]
    aad_len = struct.unpack('<I', data[28:32])[0]
    aad     = data[32:32+aad_len]
    ct      = data[32+aad_len:]

    cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    if aad:
        cipher.update(aad)
    try:
        plaintext = cipher.decrypt_and_verify(ct, tag)
    except ValueError:
        raise ValueError("File is corrupt or tampered - decryption rejected")

    with open(outpath, 'wb') as f:
        f.write(plaintext)
    print(f"Decrypted: {len(plaintext)} bytes -> {outpath}")

# Usage
key = os.urandom(32)
encrypt_file(key, "secret.pdf", "secret.enc", aad=b"metadata:v1")
decrypt_file(key, "secret.enc", "recovered.pdf")
```

### Streaming Encryption (Large Files)

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os

CHUNK_SIZE = 64 * 1024  # 64 KB chunks

def encrypt_stream(key: bytes, inpath: str, outpath: str) -> None:
    """
    Streaming encryption for large files.
    Each chunk is encrypted with a unique nonce.
    Chunk order is authenticated via the chunk number in AAD.
    """
    with open(inpath, 'rb') as fin, open(outpath, 'wb') as fout:
        file_nonce = os.urandom(8)  # base file nonce
        fout.write(file_nonce)

        chunk_num = 0
        while True:
            chunk = fin.read(CHUNK_SIZE)
            if not chunk:
                break

            # Unique nonce per chunk: file_nonce + chunk_number
            chunk_nonce = file_nonce + chunk_num.to_bytes(4, 'big')
            aad = chunk_num.to_bytes(8, 'big')  # chunk number as AAD

            cipher = ChaCha20_Poly1305.new(key=key, nonce=chunk_nonce)
            cipher.update(aad)
            ct, tag = cipher.encrypt_and_digest(chunk)

            # Chunk format: [len(ct) 4][tag 16][ct]
            fout.write(len(ct).to_bytes(4, 'big'))
            fout.write(tag)
            fout.write(ct)
            chunk_num += 1

    print(f"Encrypted {chunk_num} chunks")
```

---

## XChaCha20-Poly1305

### Why an Extended Nonce

```
ChaCha20-Poly1305 (IETF): nonce = 96 bits
With random nonces: birthday bound at 2^48 messages (~281 trillion).
This is sufficient for most applications.

But if you need to encrypt many messages (billions) with random nonces
and want zero collision risk - you need a larger nonce.

XChaCha20-Poly1305: nonce = 192 bits (24 bytes)
Birthday bound: 2^96 messages - practically unlimited.
```

### HChaCha20: Subkey Derivation from Nonce

```
XChaCha20 uses the HChaCha20 extension:
  subkey = HChaCha20(key, nonce[:16])
  XChaCha20_encrypt(subkey, nonce[16:] || 0^32, message)

HChaCha20 - the first and last 4 words of a ChaCha20 block
(without adding the initial state).

This safely extends the nonce to 24 bytes:
First 16 bytes of nonce -> subkey derivation
Last 8 bytes            -> nonce for ChaCha20 with the subkey

Result: XChaCha20-Poly1305 is safe with random nonces
even with billions of messages.
```

```python
# XChaCha20-Poly1305 via cryptography library
from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
import os

key   = os.urandom(32)
nonce = os.urandom(24)   # 24 bytes = 192 bits!

xcha = XChaCha20Poly1305(key)
ct   = xcha.encrypt(nonce, b"plaintext", b"aad")
pt   = xcha.decrypt(nonce, ct, b"aad")
print(pt)  # b'plaintext'

# PyNaCl uses XSalsa20-Poly1305 (analogous to XChaCha20):
import nacl.secret, nacl.utils
key = nacl.utils.random(32)
box = nacl.secret.SecretBox(key)
encrypted = box.encrypt(b"Long-lived secret with many messages")  # safe random nonce
decrypted = box.decrypt(encrypted)
```

---

## Comparison with AES-GCM

```
Property               ChaCha20-Poly1305      AES-256-GCM
--------------------   ------------------     ----------------
Cipher type            Stream (ARX)           Block (SPN)
Key size               256 bits               256 bits
Nonce size             96 bits (IETF)         96 bits
Tag size               128 bits               128 bits
HW acceleration        No (but still fast)    AES-NI (Intel/AMD)
Without AES-NI         ~400 MB/s              ~50 MB/s
With AES-NI            ~1-2 GB/s              ~4 GB/s
Cache-timing attacks   Impossible (ARX)       Risk (S-box tables)
Nonce reuse            CT leak                CT + H leak (worse)
Parallelism            Yes (independent)      Yes (CTR based)
Random access          Yes (counter)          Yes (counter)
Standards              RFC 8439, TLS 1.3      NIST SP 800-38D, TLS 1.3
Use case               Mobile, IoT, VPN       Servers with AES-NI

When to choose ChaCha20-Poly1305:
  - Devices without AES-NI (ARM, MIPS, embedded)
  - Protection against cache-timing attacks needed
  - Mobile applications (Android, iOS)
  - WireGuard, OpenSSH
  - Performance matters without AES-NI

When to choose AES-GCM:
  - Servers with AES-NI (x86_64)
  - Maximum throughput on desktop/server
  - FIPS 140-2/3 compliance required (ChaCha20 not yet in FIPS)
  - Standards mandate AES (PCI DSS, banking)
```

---

## Usage in Real Protocols

### TLS 1.3

```
RFC 8446 defines three mandatory cipher suites:
  TLS_AES_128_GCM_SHA256
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256   <- our algorithm

Nonce in TLS 1.3:
  - Base IV (12 bytes) derived during handshake
  - XOR-ed with the record sequence number (64 bits, zero-padded to 12 bytes)
  - Sequence number: 0, 1, 2, ... (never repeats within a session)
  - Nonce = IV XOR (0^32 || sequence_number)

Algorithm selection in TLS 1.3:
  Server signals preference via cipher suite ordering.
  Client (browser, curl) picks ChaCha20 if no AES-NI available.
  Server on x86_64 with AES-NI typically prefers AES-GCM.

Check which cipher is used:
  openssl s_client -connect example.com:443 2>/dev/null | grep Cipher
```

### WireGuard

```
WireGuard uses ChaCha20-Poly1305 as the ONLY cipher.
No negotiation, no agility - one right choice only.

Why only ChaCha20-Poly1305:
  "Algorithm agility is the enemy of security"
  No downgrade attacks possible.
  No weak cipher suites.
  Simple implementation -> fewer bugs.

Nonce in WireGuard:
  64-bit packet counter (incremented by 1 per packet)
  Never repeats for a given session key.
  Session keys are rotated (Noise protocol, ECDH).

Handshake: Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s
  X25519 (ECDH) + ChaCha20-Poly1305 + BLAKE2s
```

### OpenSSH

```
OpenSSH 6.5+ (2014): added chacha20-poly1305@openssh.com
OpenSSH 9.0 (2022): made the top priority by default

OpenSSH implementation detail:
  Two ChaCha20 keys: one for packet length, one for data.
  This protects packet size metadata.

  header_key = ChaCha20(K_header, nonce)  <- encrypts packet_length
  main_key   = ChaCha20(K_main,   nonce)  <- encrypts payload
  tag        = Poly1305(poly_key, encrypted_length || encrypted_payload)

Configuration:
  # Prioritize chacha20 on server:
  Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com

  # Check what cipher is used:
  ssh -vv user@host 2>&1 | grep "cipher:"
```

### QUIC and HTTP/3

```
QUIC (RFC 9000) uses TLS 1.3 for encryption.
ChaCha20-Poly1305 is supported via TLS_CHACHA20_POLY1305_SHA256.

QUIC specifics:
  Packet number is used as part of the nonce.
  Header encryption: a separate key for encrypting packet headers
  (to hide the packet number from intermediate nodes).

  HP_key (header protection key) = HKDF_expand(secret, "quic hp", 32)
  mask = ChaCha20(HP_key, nonce=sample_of_ciphertext)
  encrypted_header = header XOR mask[:4]  (first 4 bytes of mask)
```

---

## Security and Limitations

### Security

```
Proven security of ChaCha20:
  Based on the assumed pseudorandomness of the ChaCha20 function.
  With 20 rounds, no known attacks better than brute force (2^256).
  7-round ChaCha7 has theoretical attacks - 20 rounds have ample margin.

Security of Poly1305:
  Information-theoretically secure (one-time MAC).
  Forgery probability for a message of L bytes:
    Pr[forgery] <= ceil(L/16 + 1) / 2^102
  At L = 1 MB (65,536 blocks): ~65537 / 2^102 = negligible.

Cryptanalysis of ChaCha20 (known results):
  Best attack on ChaCha20 (256-bit key): no known attacks exist.
  ChaCha7: differential cryptanalysis (theoretical only).
  ChaCha12: secure with large margin.
  ChaCha20: 20 rounds - 2.8x more than needed for security.
```

### Limitations

```
1. Nonce reuse:
   (Key, Nonce) repeat -> XOR of plaintexts is leaked.
   Less catastrophic than GCM (H is not exposed),
   but still: NEVER repeat (Key, Nonce).

2. Maximum data per (Key, Nonce):
   IETF (96-bit nonce): 2^32 * 64 = 256 GB.
   Practically: this limit is never reached in normal scenarios.

3. Poly1305 is one-time:
   The Poly1305 key (poly_key) is used for exactly one message.
   If poly_key were reused: an attacker could forge tags.
   ChaCha20 guarantees poly_key uniqueness with a unique (Key, Nonce).

4. No FIPS certification (yet):
   ChaCha20-Poly1305 is not in the FIPS 140-2/3 approved list.
   For FIPS-required systems: use AES-GCM.
   (Inclusion in FIPS was under discussion in 2024 - situation evolving)

5. No hardware acceleration in most CPUs:
   No AES-NI equivalent instructions.
   ARM Neon, x86 AVX2 - SIMD helps but no dedicated units.
   On server CPUs with AES-NI: AES-GCM is faster.
```

---

## Performance

### Benchmarks

```python
import time
import os
from Crypto.Cipher import ChaCha20_Poly1305, AES

def benchmark_aead(name, encrypt_fn, data_size=100*1024*1024):
    """Benchmark AEAD algorithm (100 MB)"""
    data = os.urandom(data_size)
    aad  = b"benchmark-aad"

    start = time.perf_counter()
    encrypt_fn(data, aad)
    elapsed = time.perf_counter() - start

    speed = data_size / elapsed / 1024 / 1024
    print(f"{name:30s}: {speed:8.1f} MB/s")

key   = os.urandom(32)
nonce = os.urandom(12)

def chacha_encrypt(data, aad):
    cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    cipher.update(aad)
    return cipher.encrypt_and_digest(data)

def aesgcm_encrypt(data, aad):
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    cipher.update(aad)
    return cipher.encrypt_and_digest(data)

benchmark_aead("ChaCha20-Poly1305", chacha_encrypt)
benchmark_aead("AES-256-GCM",       aesgcm_encrypt)

# Approximate output on ARM without AES-NI:
# ChaCha20-Poly1305             :    350.0 MB/s
# AES-256-GCM                   :     45.0 MB/s

# Approximate output on x86_64 with AES-NI:
# ChaCha20-Poly1305             :   1200.0 MB/s
# AES-256-GCM                   :   3800.0 MB/s
```

### SIMD Optimizations

```
ChaCha20 parallelizes very well via SIMD:

x86 SSE2/AVX2:
  4 or 8 blocks in parallel (4-way or 8-way vectorization)
  AVX2: ~3-4 GB/s (8 blocks at once)
  Comparable to AES-GCM on some CPUs

ARM NEON:
  4-way vectorization
  ~1-2 GB/s on modern ARM (Apple M1/M2, Cortex-A77+)

RISC-V V extension:
  Similar acceleration via vector instructions

Implementations using SIMD:
  OpenSSL: chacha20_avx2 (automatic)
  BoringSSL: similar
  Linux kernel: chacha20-avx2, chacha20-ssse3
```

---

## OpenSSL - Practice

```bash
# Check ChaCha20-Poly1305 support
openssl ciphers -v 'CHACHA20'

# TLS with forced ChaCha20-Poly1305
openssl s_client -connect example.com:443 \
    -cipher 'TLS_CHACHA20_POLY1305_SHA256' \
    -tls1_3 2>/dev/null | grep Cipher

# Benchmark
openssl speed -evp chacha20-poly1305
openssl speed -evp aes-256-gcm
openssl speed -evp aes-128-gcm

# Check which cipher nginx is using
openssl s_client -connect myserver.com:443 2>/dev/null | grep "Cipher is"

# nginx.conf: enable ChaCha20 with priority for mobile clients
# ssl_ciphers 'TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256';

# WireGuard - just configure the interface, ChaCha20-Poly1305 is used automatically
wg show  # show status and session keys
```

---

## Common Mistakes

```
1. Reusing the nonce with the same key
   Bad:  nonce = b'\x00' * 12  # fixed nonce
   Good: nonce = os.urandom(12)  # random

2. Not verifying the tag before using data
   Bad:  plaintext = cipher.decrypt(ciphertext)  # no verify!
   Good: plaintext = cipher.decrypt_and_verify(ciphertext, tag)

3. Using ChaCha20 without Poly1305 (encryption only)
   ChaCha20 without a MAC does not protect against tampering.
   Always use ChaCha20-Poly1305 together.

4. Comparing tags with a non-constant-time method
   Bad:  received_tag == computed_tag  # timing attack!
   Good: hmac.compare_digest(received_tag, computed_tag)

5. XChaCha20 vs ChaCha20: confusing nonce sizes
   ChaCha20-Poly1305 (IETF): 12-byte nonce
   XChaCha20-Poly1305:        24-byte nonce
   Mixing them up -> wrong initialization -> vulnerability

6. Reusing poly_key across messages
   poly_key is derived automatically from key+nonce.
   Never pass poly_key manually between messages.
```

---

## Cheat Sheet

```
Parameters:
  Key:   32 bytes (256 bits)
  Nonce: 12 bytes (96 bits) IETF / 24 bytes (192 bits) XChaCha20
  Tag:   16 bytes (128 bits)
  Max:   256 GB per (key, nonce) [IETF]

Algorithm:
  poly_key   = ChaCha20_block(key, counter=0, nonce)[:32]
  ciphertext = ChaCha20(key, counter=1, nonce, plaintext)
  tag        = Poly1305(poly_key, AAD || CT || lengths)

ChaCha20 internals:
  State:  4 constants + 8 key words + 1 counter + 3 nonce words
  QR:     a+=b; d^=a; d<<<16; c+=d; b^=c; b<<<12; ...
  Rounds: 10 double rounds = 20 QuarterRound calls
  Output: state + initial_state (add mod 2^32)

Poly1305 internals:
  Field: GF(2^130 - 5)
  acc = sum((m_i + 2^len) * r^i) mod p
  tag = (acc + s) mod 2^128

Algorithm selection:
  No AES-NI (ARM, IoT): ChaCha20-Poly1305
  With AES-NI (x86_64): AES-256-GCM (faster)
  FIPS required:         AES-256-GCM (ChaCha20 not in FIPS)
  WireGuard/SSH:         ChaCha20-Poly1305 (only option in WG)

Nonce strategies:
  Random 12 bytes:   safe up to ~2^32 messages per key
  Counter 12 bytes:  safe as long as it never overflows
  XChaCha20 24 bytes: random, safe up to ~2^96 messages

Commands:
  openssl speed -evp chacha20-poly1305   # benchmark
  openssl ciphers -v 'CHACHA20'          # available suites
  wg show                                 # WireGuard status
```

---

## References

- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) - ChaCha20 and Poly1305 for TLS (2018)
- [RFC 7539](https://www.rfc-editor.org/rfc/rfc7539) - previous version of the standard (2015)
- [Original ChaCha paper (Bernstein, 2008)](https://cr.yp.to/chacha/chacha-20080128.pdf)
- [Original Poly1305 paper (Bernstein, 2005)](https://cr.yp.to/mac/poly1305-20050329.pdf)
- [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [WireGuard paper](https://www.wireguard.com/papers/wireguard.pdf) - ChaCha20-Poly1305 in practice
- [Bernstein's website cr.yp.to](https://cr.yp.to/) - original materials
- [XChaCha20 draft](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
