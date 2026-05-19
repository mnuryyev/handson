---
title: "Block Ciphers - S-box, P-box, Round Keys"
date: "2026-05-15"
---

S-boxes, P-boxes, and round keys are the three building blocks that every modern block cipher is made of. Understanding them explains why AES resists differential cryptanalysis, how confusion and diffusion are achieved mathematically, and why 10 rounds of AES-128 deliver 2^128 security.

---

## Block Cipher Structure

```
A block cipher is an iterative construction: the same round function
is applied repeatedly with different round keys.

BlockCipher(K, P):
  K1, K2, ..., KR = KeySchedule(K)   <- key expansion
  state = P                           <- initial state
  for i in 1..R:
      state = Round(state, Ki)         <- apply round
  return state

Where Round typically consists of:
  1. SubBytes  (S-box layer)  - non-linearity
  2. PermBytes (P-box layer)  - diffusion
  3. MixLayer               - additional diffusion
  4. AddRoundKey             - key injection

Shannon's two principles (1949):
  Confusion:  the relationship key -> ciphertext is complex (S-box)
  Diffusion:  one input bit affects many output bits (P-box + Mix)
```

---

## S-box: Non-linear Substitution

### What is an S-box

```
S-box (Substitution box) - a lookup table mapping n input bits to m output bits.

Notation: S: {0,1}^n -> {0,1}^m

In AES: S: {0,1}^8 -> {0,1}^8  (8 bits -> 8 bits)
  256 input values (0x00..0xFF)
  256 output values (bijection - one-to-one correspondence)

In DES: S: {0,1}^6 -> {0,1}^4  (6 bits -> 4 bits)
  8 S-boxes, each 64 inputs -> 16 outputs
  Not a bijection!

Why S-boxes are needed:
  Without non-linear operations, a block cipher is affine.
  Affine cipher: C = A * P + B (matrix operations)
  Broken by a system of linear equations in O(n^3).

  S-box introduces non-linearity -> linear attacks don't apply directly.
```

### AES S-box: The Math

```
The AES S-box is not an arbitrary table. It is constructed mathematically:

Field GF(2^8):
  Elements: polynomials of degree < 8 over GF(2)
  Example: 0x53 = 0101 0011 = x^6 + x^4 + x + 1
  Addition: XOR (no carry)
  Multiplication: modulo the irreducible polynomial
                  p(x) = x^8 + x^4 + x^3 + x + 1  (AES polynomial)

AES S-box construction for input b:
  Step 1: b' = b^(-1) in GF(2^8)  (multiplicative inverse)
          Exception: 0x00 -> 0x00 (zero has no inverse)

  Step 2: affine transformation over GF(2):
          s = A * b' + c

Matrix A (8x8 over GF(2)):
  [1 0 0 0 1 1 1 1]
  [1 1 0 0 0 1 1 1]
  [1 1 1 0 0 0 1 1]
  [1 1 1 1 0 0 0 1]
  [1 1 1 1 1 0 0 0]
  [0 1 1 1 1 1 0 0]
  [0 0 1 1 1 1 1 0]
  [0 0 0 1 1 1 1 1]

Constant c = 0x63 = 0110 0011 (added via XOR)

Result:
  High non-linearity (NL = 112 out of maximum 120)
  Optimal against differential cryptanalysis
  Optimal against linear cryptanalysis
```

### AES S-box Table

```
Full AES S-box (hex, row = high nibble, column = low nibble):

     0   1   2   3   4   5   6   7   8   9   a   b   c   d   e   f
0x  63  7c  77  7b  f2  6b  6f  c5  30  01  67  2b  fe  d7  ab  76
1x  ca  82  c9  7d  fa  59  47  f0  ad  d4  a2  af  9c  a4  72  c0
2x  b7  fd  93  26  36  3f  f7  cc  34  a5  e5  f1  71  d8  31  15
3x  04  c7  23  c3  18  96  05  9a  07  12  80  e2  eb  27  b2  75
4x  09  83  2c  1a  1b  6e  5a  a0  52  3b  d6  b3  29  e3  2f  84
5x  53  d1  00  ed  20  fc  b1  5b  6a  cb  be  39  4a  4c  58  cf
6x  d0  ef  aa  fb  43  4d  33  85  45  f9  02  7f  50  3c  9f  a8
7x  51  a3  40  8f  92  9d  38  f5  bc  b6  da  21  10  ff  f3  d2
8x  cd  0c  13  ec  5f  97  44  17  c4  a7  7e  3d  64  5d  19  73
9x  60  81  4f  dc  22  2a  90  88  46  ee  b8  14  de  5e  0b  db
ax  e0  32  3a  0a  49  06  24  5c  c2  d3  ac  62  91  95  e4  79
bx  e7  c8  37  6d  8d  d5  4e  a9  6c  56  f4  ea  65  7a  ae  08
cx  ba  78  25  2e  1c  a6  b4  c6  e8  dd  74  1f  4b  bd  8b  8a
dx  70  3e  b5  66  48  03  f6  0e  61  35  57  b9  86  c1  1d  9e
ex  e1  f8  98  11  69  d9  8e  94  9b  1e  87  e9  ce  55  28  df
fx  8c  a1  89  0d  bf  e6  42  68  41  99  2d  0f  b0  54  bb  16

Example: S-box(0x53) = ?
  Row 5, column 3 -> 0xed

Inverse: for decryption, AES uses an inverse S-box (InvSubBytes).
```

```python
# Full AES S-box table
AES_SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]

def sub_bytes(state: list) -> list:
    """SubBytes: apply S-box to every byte of the AES state"""
    return [AES_SBOX[b] for b in state]

# Example
state = [0x19, 0xa0, 0x9a, 0xe9,
         0x3d, 0xf4, 0xc6, 0xf8,
         0xe3, 0xe2, 0x8d, 0x48,
         0xbe, 0x2b, 0x2a, 0x08]
result = sub_bytes(state)
print([hex(b) for b in result])
# [0xd4, 0xe0, 0xb8, 0x1e, 0x27, 0xbf, 0xb4, 0x41, ...]
```

### Non-linearity: Why It Matters

```
Linearity in cryptography is the enemy.

If the S-box were linear (affine):
  output = A * input + c  (matrix operations over GF(2))

  The entire block cipher becomes a system of linear equations:
  C = M * P + K_eff  (M is the product of all matrices, K_eff is the effective key)

  Linear attack: with 128 PT-CT pairs, solve the system of equations.
  Time: O(n^3) = O(128^3) - instantaneous.

S-box non-linearity (NL = 112):
  Best linear approximation: |L(x) - S(x)| <= 16 out of 256 cases.
  Attacker can use linear approximation with probability at most
  1/2 + 16/256 = 0.5625 (vs ideal 0.5).

  This requires O(2^21) known plaintexts per key bit through
  linear cryptanalysis. For a 128-bit key - completely infeasible.
```

### S-box in DES

```
DES uses 8 S-boxes, each mapping 6 bits -> 4 bits.

S1 of DES (6-bit input -> 4-bit output):
  Input: b1 b2 b3 b4 b5 b6
  Row    = b1 b6 (2 bits, 0-3)
  Column = b2 b3 b4 b5 (4 bits, 0-15)

     0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
r=0: 14   4  13   1   2  15  11   8   3  10   6  12   5   9   0   7
r=1:  0  15   7   4  14   2  13   1  10   6  12  11   9   5   3   8
r=2:  4   1  14   8  13   6   2  11  15  12   9   7   3  10   5   0
r=3: 15  12   8   2   4   9   1   7   5  11   3  14  10   0   6  13

Example: input = 011011
  b1=0, b6=1 -> row 01 = 1
  b2b3b4b5 = 1101 = 13
  S1[1][13] = 5 = 0101 (4-bit output)

The NSA and DES S-boxes:
  NSA modified IBM's original S-boxes before DES was standardized.
  In 1990, differential cryptanalysis was published - it turned out
  that DES S-boxes were already optimized AGAINST this attack.
  NSA had known about it since 1974!
  This was intentional hardening, not a backdoor.
```

---

## P-box: Bit Permutation

### What is a P-box

```
P-box (Permutation box) - permutes bit (or byte) positions
without changing their values.

Purpose: spread the change caused by one S-box output
across the inputs of multiple S-boxes in the next round.

Without P-box:
  Changing one input bit -> changes only one S-box.
  Diffusion is confined to that single S-box.

With P-box:
  Output bits of one S-box become input bits of DIFFERENT S-boxes next round.
  One changed bit "spreads" throughout the entire state.
```

### P-box in DES: the P-permutation

```
After the 8 S-boxes, DES applies a 32-bit P-permutation:

Output position:  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
Input position:  16  7 20 21 29 12 28 17  1 15 23 26  5 18 31 10

Output position: 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32
Input position:   2  8 24 14 32 27  3  9 19 13 30  6 22 11  4 25

Example: bit 1 from S-box output goes to position 16 in the next round input.
         bit 2 -> position 7, bit 3 -> position 20, ...

This permutation ensures: each output bit of S-box_i
influences the inputs of two DIFFERENT S-boxes in the next round.
```

### ShiftRows: the P-box in AES

```
AES does not use a bit-level P-permutation directly.
Instead: ShiftRows - a byte-level row permutation of the state matrix.

AES state: 4x4 byte matrix

Before ShiftRows:      After ShiftRows:
a0  a4  a8  a12        a0  a4  a8  a12   <- row 0: no shift
a1  a5  a9  a13   ->   a5  a9  a13 a1    <- row 1: left shift by 1
a2  a6  a10 a14        a10 a14 a2  a6    <- row 2: left shift by 2
a3  a7  a11 a15        a15 a3  a7  a11   <- row 3: left shift by 3

For decryption (InvShiftRows): shifts in reverse direction.

Effect of ShiftRows:
  Bytes from one column "spread" into different columns.
  After MixColumns (next step), each byte from an original column
  influences all 4 bytes across 4 different columns.

ShiftRows + MixColumns together guarantee
full diffusion in just 2 rounds (Wide Trail Strategy).
```

```python
def shift_rows(state: list) -> list:
    """
    ShiftRows for AES.
    state: list of 16 bytes (4x4 matrix, column-major order)
    """
    # Convert to 4x4 matrix (rows and columns)
    m = [[state[r + 4*c] for c in range(4)] for r in range(4)]

    # Shift rows
    for r in range(4):
        m[r] = m[r][r:] + m[r][:r]  # cyclic left shift by r

    # Back to linear list
    return [m[r][c] for c in range(4) for r in range(4)]

# Example
state = list(range(16))
print("Before ShiftRows:", state)
print("After ShiftRows: ", shift_rows(state))
# Before: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
# After:  [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]
```

---

## MixColumns: Diffusion Through Multiplication

### MixColumns Math

```
MixColumns processes each column of the state matrix independently.
Each column (4 bytes) is multiplied by a fixed matrix in GF(2^8).

MixColumns matrix:
[2 3 1 1]
[1 2 3 1]
[1 1 2 3]
[3 1 1 2]

Multiplication in GF(2^8) modulo polynomial x^8 + x^4 + x^3 + x + 1:

xtime(a) = multiply by 2 in GF(2^8):
  if a < 0x80: xtime(a) = a << 1
  if a >= 0x80: xtime(a) = (a << 1) XOR 0x1B

Multiply by 3 = xtime(a) XOR a

MixColumns result for one column [a0, a1, a2, a3]:
  b0 = xtime(a0) XOR (xtime(a1) XOR a1) XOR a2 XOR a3
  b1 = a0 XOR xtime(a1) XOR (xtime(a2) XOR a2) XOR a3
  b2 = a0 XOR a1 XOR xtime(a2) XOR (xtime(a3) XOR a3)
  b3 = (xtime(a0) XOR a0) XOR a1 XOR a2 XOR xtime(a3)
```

```python
def xtime(a: int) -> int:
    """Multiply by 2 in GF(2^8)"""
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else (a << 1) & 0xFF

def mix_single_column(col: list) -> list:
    """MixColumns for one column [a0, a1, a2, a3]"""
    a = col
    return [
        xtime(a[0]) ^ xtime(a[1]) ^ a[1] ^ a[2] ^ a[3],
        a[0] ^ xtime(a[1]) ^ xtime(a[2]) ^ a[2] ^ a[3],
        a[0] ^ a[1] ^ xtime(a[2]) ^ xtime(a[3]) ^ a[3],
        xtime(a[0]) ^ a[0] ^ a[1] ^ a[2] ^ xtime(a[3]),
    ]

def mix_columns(state: list) -> list:
    """MixColumns for the full AES state (16 bytes)"""
    result = []
    for c in range(4):
        col = [state[r + 4*c] for r in range(4)]
        mixed = mix_single_column(col)
        result.extend(mixed)
    return result

# Demonstrate MixColumns diffusion
col = [0x01, 0x00, 0x00, 0x00]   # only one nonzero byte
mixed = mix_single_column(col)
print(f"Input:  {[hex(x) for x in col]}")
print(f"Output: {[hex(x) for x in mixed]}")
# Input:  ['0x1', '0x0', '0x0', '0x0']
# Output: ['0x2', '0x1', '0x1', '0x3']
# One input byte affects ALL 4 output bytes!
```

### Why MixColumns Provides Diffusion

```
The MixColumns matrix is an MDS (Maximum Distance Separable) matrix.

MDS property: for any nonzero input vector
  weight(input) + weight(output) >= n + 1  (n = column size = 4)

  weight = number of nonzero bytes (branch number)

For MixColumns with n=4:
  Minimum branch number = 5
  If 1 input byte is nonzero -> at least 4 output bytes are nonzero

This means:
  Any change in 1 column byte is guaranteed to change all 4 bytes.
  After ShiftRows these 4 changed bytes land in 4 different columns.
  In the next round, SubBytes+ShiftRows+MixColumns -> change covers the whole block.

After 2 rounds: changing 1 bit affects the entire 128-bit block.
This is the Avalanche Effect.
```

---

## Round Keys: Key Schedule

### Why Round Keys Are Needed

```
If the same key were used in every round:
  Attacker could attack rounds independently.
  Meet-in-the-middle between first and last round.
  Related-key attacks would work trivially.

Key Schedule (key expansion):
  From one master key K, unique round keys K1..KR are generated.
  Each Ki is added in the corresponding round via XOR (AddRoundKey).

  Key Schedule requirements:
  - One-way: Ki should not reveal K (ideally)
  - Diffusion: one bit change in K affects all Ki
  - Avalanche: similar keys -> completely different Ki
```

### AES Key Schedule: In Detail

```
AES-128: 128-bit key -> 11 round keys of 128 bits each
         (original key + 10 round keys)

Key organized as 4 words (word = 32 bits):
  W[0], W[1], W[2], W[3] = original key

Expansion for AES-128 (i = 4, 5, ..., 43):
  if i % 4 == 0:
      W[i] = W[i-4] XOR SubWord(RotWord(W[i-1])) XOR Rcon[i/4]
  else:
      W[i] = W[i-4] XOR W[i-1]

Round key r = W[4r], W[4r+1], W[4r+2], W[4r+3]

Where:
  RotWord([a0,a1,a2,a3]) = [a1,a2,a3,a0]  <- cyclic word rotation
  SubWord([a0,a1,a2,a3]) = [S(a0),S(a1),S(a2),S(a3)]  <- apply S-box

  Rcon (Round Constants):
  Rcon[1]  = [0x01, 0x00, 0x00, 0x00]
  Rcon[2]  = [0x02, 0x00, 0x00, 0x00]
  Rcon[3]  = [0x04, 0x00, 0x00, 0x00]
  Rcon[4]  = [0x08, 0x00, 0x00, 0x00]
  Rcon[5]  = [0x10, 0x00, 0x00, 0x00]
  Rcon[6]  = [0x20, 0x00, 0x00, 0x00]
  Rcon[7]  = [0x40, 0x00, 0x00, 0x00]
  Rcon[8]  = [0x80, 0x00, 0x00, 0x00]
  Rcon[9]  = [0x1b, 0x00, 0x00, 0x00]
  Rcon[10] = [0x36, 0x00, 0x00, 0x00]

  Rcon[i] - powers of 2 in GF(2^8): x^0, x^1, x^2, ...
```

```python
# AES-128 Key Schedule

AES_SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]

RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

def rot_word(word: list) -> list:
    """Cyclic left rotation of a word by 1 byte"""
    return word[1:] + word[:1]

def sub_word(word: list) -> list:
    """Apply S-box to each byte of a word"""
    return [AES_SBOX[b] for b in word]

def xor_words(a: list, b: list) -> list:
    return [x ^ y for x, y in zip(a, b)]

def aes128_key_schedule(key: bytes) -> list:
    """
    AES-128 Key Schedule.
    Returns 11 round keys (each 16 bytes).
    """
    assert len(key) == 16, "AES-128 requires a 16-byte key"

    # Initialize: split key into 4 words
    w = []
    for i in range(4):
        w.append(list(key[4*i : 4*i+4]))

    # Generate the remaining words
    for i in range(4, 44):
        temp = w[i-1][:]
        if i % 4 == 0:
            temp = sub_word(rot_word(temp))
            temp[0] ^= RCON[i // 4]
        w.append(xor_words(w[i-4], temp))

    # Assemble 11 round keys (4 words = 16 bytes each)
    round_keys = []
    for r in range(11):
        rk = []
        for i in range(4):
            rk.extend(w[4*r + i])
        round_keys.append(bytes(rk))

    return round_keys

# Demonstration
key = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
round_keys = aes128_key_schedule(key)

print(f"Master key:  {key.hex()}")
for i, rk in enumerate(round_keys):
    print(f"  Round {i:2d}: {rk.hex()}")

# Master key:  000102030405060708090a0b0c0d0e0f
# Round  0: 000102030405060708090a0b0c0d0e0f
# Round  1: d6aa74fdd2af72fadaa678f1d6ab76fe
# Round  2: b692cf0b643dbdf1be9bc5006830b3fe
# ...
```

### AES-256 Key Schedule

```
AES-256: 256-bit key (8 words) -> 15 round keys (14 rounds)

Expansion for AES-256 (i = 8, 9, ..., 59):
  if i % 8 == 0:
      W[i] = W[i-8] XOR SubWord(RotWord(W[i-1])) XOR Rcon[i/8]
  elif i % 8 == 4:
      W[i] = W[i-8] XOR SubWord(W[i-1])   <- extra SubWord!
  else:
      W[i] = W[i-8] XOR W[i-1]

Difference from AES-128:
  When i % 8 == 4, SubWord is applied without RotWord.
  This increases Key Schedule non-linearity.
  AES-256 needs more non-linearity due to the greater round count.
```

### Why Rcon (Round Constants)?

```
Rcon prevents symmetry in the round keys.

Without Rcon:
  W[0] = W[4] = W[8] = ... (periodicity in Key Schedule)
  Attacks exploiting symmetric keys become possible.

Rcon = x^(i-1) in GF(2^8):
  Rcon[1] = 0x01 = x^0
  Rcon[2] = 0x02 = x^1
  Rcon[3] = 0x04 = x^2
  ...
  Rcon[8] = 0x80 = x^7
  Rcon[9] = 0x1b = x^8 mod p(x) = x^4 + x^3 + x + 1

Each round uses a unique constant -> no periodicity.
```

---

## Full AES Round: Assembly

### All Four Operations

```
AES round (except the last):

1. SubBytes:    Non-linear substitution (S-box)
2. ShiftRows:   Byte permutation (P-box)
3. MixColumns:  Linear diffusion (MDS matrix in GF(2^8))
4. AddRoundKey: XOR with round key

Last round (R = 10/12/14):
1. SubBytes
2. ShiftRows
3. AddRoundKey  <- no MixColumns!

Why no MixColumns in the last round:
  MixColumns is invertible and adds no security in the final round.
  Without MixColumns: encryption and decryption are more symmetric (easier to implement).
  Security is not reduced: the observable ciphertext already went through ShiftRows.

Initial AddRoundKey (before the first round):
  state = plaintext XOR K0
  This is "key whitening".
  Without it: the attacker can study the first round without key interference.
```

```python
def add_round_key(state: list, round_key: bytes) -> list:
    """AddRoundKey: XOR state with round key"""
    return [s ^ k for s, k in zip(state, round_key)]

def aes_round(state: list, round_key: bytes, last_round: bool = False) -> list:
    """
    One AES round.
    last_round=True: skip MixColumns.
    """
    state = sub_bytes(state)
    state = shift_rows(state)
    if not last_round:
        state = mix_columns(state)
    state = add_round_key(state, round_key)
    return state

def aes128_encrypt(key: bytes, plaintext: bytes) -> bytes:
    """
    AES-128 encryption of one block.
    (Educational implementation - use Crypto.Cipher.AES for production)
    """
    assert len(key) == 16 and len(plaintext) == 16

    round_keys = aes128_key_schedule(key)
    state = list(plaintext)

    # Initial key addition
    state = add_round_key(state, round_keys[0])

    # 9 regular rounds
    for r in range(1, 10):
        state = aes_round(state, round_keys[r], last_round=False)

    # Final round (no MixColumns)
    state = aes_round(state, round_keys[10], last_round=True)

    return bytes(state)

# Test with NIST test vector
key       = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
plaintext = bytes.fromhex("00112233445566778899aabbccddeeff")
expected  = bytes.fromhex("69c4e0d86a7b04300d8a8e9ebf9b6af4")  # NIST

result = aes128_encrypt(key, plaintext)
print(f"Key:       {key.hex()}")
print(f"PT:        {plaintext.hex()}")
print(f"CT:        {result.hex()}")
print(f"Expected:  {expected.hex()}")
print(f"Correct:   {result == expected}")
```

---

## Avalanche Effect

### Propagation Through Rounds

```python
from Crypto.Cipher import AES

def count_differing_bits(b1: bytes, b2: bytes) -> int:
    return sum(bin(a ^ b).count('1') for a, b in zip(b1, b2))

def avalanche_demo():
    """
    Shows how a 1-bit key change propagates through AES rounds.
    """
    key1 = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    key2 = bytearray(key1)
    key2[0] ^= 0x01  # flip one bit
    key2 = bytes(key2)

    pt = bytes.fromhex("00112233445566778899aabbccddeeff")

    ct1 = AES.new(key1, AES.MODE_ECB).encrypt(pt)
    ct2 = AES.new(key2, AES.MODE_ECB).encrypt(pt)

    diff_bits = count_differing_bits(ct1, ct2)
    print(f"Key 1:   {key1.hex()}")
    print(f"Key 2:   {key2.hex()}  (1 bit different)")
    print(f"CT 1:    {ct1.hex()}")
    print(f"CT 2:    {ct2.hex()}")
    print(f"Differing bits: {diff_bits} out of 128")
    print(f"Percentage:     {diff_bits/128*100:.1f}%")
    # Typically ~64 bits (50%) - ideal avalanche effect

avalanche_demo()

def avalanche_by_rounds():
    """How fast does a 1-bit change spread?"""
    key = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    round_keys = aes128_key_schedule(key)

    pt1 = list(bytes.fromhex("00112233445566778899aabbccddeeff"))
    pt2 = list(pt1)
    pt2[0] ^= 0x01  # flip 1 bit

    state1 = add_round_key(pt1, round_keys[0])
    state2 = add_round_key(pt2, round_keys[0])

    print("\n1-bit change propagation through rounds:")
    for r in range(1, 11):
        last = (r == 10)
        state1 = aes_round(state1, round_keys[r], last)
        state2 = aes_round(state2, round_keys[r], last)
        diff = sum(bin(a ^ b).count('1') for a, b in zip(state1, state2))
        print(f"  After round {r:2d}: {diff:3d} bits out of 128 ({diff/128*100:.0f}%)")

avalanche_by_rounds()
# After round  1:   X bits (limited spread)
# After round  2:  ~64 bits (full diffusion!)
# After round  3+: ~64 bits (stabilizes)
```

---

## Wide Trail Strategy

```
Wide Trail Strategy - a block cipher design method
(Daemen and Rijmen - AES authors) that guarantees resistance
to differential and linear cryptanalysis.

Idea:
  Track "differential trails" through rounds.
  Minimize the probability of any differential trail.

Key parameters:
  Ns = number of active S-boxes in the trail
  p  = maximum probability of one active S-box differential

  Trail probability <= p^Ns

For AES:
  p = 2^(-6) (maximum input differential probability for one AES S-box)
  Minimum active S-boxes in 4 rounds: 25

  4-round trail probability: <= (2^(-6))^25 = 2^(-150)
  This is less than 2^(-128) (key size) -> differential cryptanalysis fails.

Wide Trail components:
  ShiftRows: ensures bytes from one column land in different columns
             -> no "local" differential trails.
  MixColumns (MDS): guarantees branch number = 5.
             1 active input byte -> 4 active output bytes.
  SubBytes: high non-linearity -> small p per S-box.

Together these guarantee: after 2 rounds, at least 5 active S-boxes;
after 4 rounds, at least 25. Full AES has 2x safety margin.
```

---

## Attacks on Components

### Cache-Timing Attacks on S-boxes

```
Software AES implementations use tables in memory.
Different memory addresses -> different cache lines -> different access times.

Attack:
  An observer (another process, VM) can measure timing of memory accesses.
  Cache miss/hit patterns reveal S-box indices.
  Indices = state bits = information leak.

Bernstein's attack (2005):
  AES key recovery via timing in OpenSSL encryption.
  Requires: shared cache between victim and attacker.

Defense:
  AES-NI: hardware instructions without tables -> no cache timing.
  Constant-time software implementation (bitsliced AES).
  ChaCha20 (ARX) uses no tables -> this attack does not apply.

# Check for AES-NI:
import subprocess
result = subprocess.run(['grep', '-m1', 'aes', '/proc/cpuinfo'],
                       capture_output=True, text=True)
has_aesni = 'aes' in result.stdout.lower()
print(f"AES-NI available: {has_aesni}")
```

### Related-Key Attacks on Key Schedule

```
Related-key attack: attacker encrypts with several related keys
(e.g. K, K XOR delta) and analyzes the differences.

AES-128: no known practical related-key attacks.
AES-256: theoretical related-key attacks (2009, Biryukov, Khovratovich).
  Requires 2^99.5 encryptions under related keys.
  Not practical.

DES Key Schedule:
  Weak keys (4): Key Schedule is periodic -> K_i = K_{17-i}
  Semi-weak keys (12 pairs): E_K1(E_K2(P)) = P
  Cause: simple Key Schedule with no non-linearity.

AES Key Schedule uses S-box and Rcon:
  SubWord adds non-linearity.
  Rcon prevents periodicity.
  But: AES-256 Key Schedule is weaker than desired for related-key security.
```

---

## SPN vs Feistel: Comparing Constructions

```
Two main approaches to building a block cipher:

SPN (Substitution-Permutation Network):
  All bits of the block are processed every round.
  Fast diffusion: full avalanche effect in 2 rounds.
  Examples: AES (Rijndael), Camellia, PRESENT, GIFT.

  SPN round structure:
  state -> [S-box layer] -> [P-box/MixLayer] -> [AddKey] -> ...

Feistel Network:
  Only half the block is processed each round.
  Slower diffusion: needs 2x more rounds.
  Decryption = encryption with reversed keys (hardware-friendly).
  Examples: DES, 3DES, Blowfish, Twofish, Camellia (hybrid).

  Feistel round structure:
  (L, R) -> (R, L XOR F(R, K))

Comparison:
Property          SPN (AES)          Feistel (DES)
---------         ---------          -------------
Diffusion         2 rounds           4+ rounds
Rounds (typical)  10-14              16-32
Encryption        More complex       Simpler
Decryption        Needs InvS-box     Same operations
HW efficiency     High               Medium
Security          Better at ~10 rds  Worse at same count
```

---

## Other S-box Examples

### PRESENT (Lightweight Block Cipher)

```
PRESENT - ultra-lightweight block cipher (64-bit block, 80 or 128-bit key).
Designed for IoT / RFID (severely constrained hardware).

PRESENT S-box (4-bit, 4->4):
  Input:  0x0 0x1 0x2 0x3 0x4 0x5 0x6 0x7 0x8 0x9 0xa 0xb 0xc 0xd 0xe 0xf
  Output: 0xC 0x5 0x6 0xB 0x9 0x0 0xA 0xD 0x3 0xE 0xF 0x8 0x4 0x7 0x1 0x2

  Non-linearity = 4 (maximum for a 4-bit S-box).
  Optimal for a 4-bit cipher!

PRESENT P-box (64-bit permutation):
  Bit position i -> i // 16 + (i % 16) * 4
  (a formula, not a lookup table)

This allows PRESENT to be implemented in ~1000 gates - a compactness record.
```

### Camellia S-boxes

```
Camellia uses 4 different S-boxes (SP1, SP2, SP3, SP4).
This strengthens non-linearity: different S-boxes = fewer correlations.

SP2(x) = SP1(x) <<<1  (cyclic left shift by 1 bit)
SP3(x) = SP1(x) >>>1  (cyclic right shift by 1 bit)
SP4(x) = SP1(x >>> 1) (shift the input)

This construction (rotated S-boxes) is standard in Japanese ciphers
(Camellia, MISTY1).
```

---

## Cheat Sheet

```
S-box (Substitution box):
  Non-linear n->m bit mapping
  Purpose: confusion
  AES S-box: 8->8 bits, GF(2^8)^{-1} + affine transform
  AES S-box non-linearity: 112 (optimal)
  Without S-box: cipher is linear -> broken by linear equations

P-box (Permutation box):
  Bit/byte position permutation
  Purpose: diffusion
  AES: ShiftRows (byte-level row permutation)
  DES: 32-bit P-permutation after S-boxes

MixColumns:
  Multiply by MDS matrix in GF(2^8)
  Branch number = 5: 1 active byte -> 4 active bytes
  Together with ShiftRows: full avalanche effect in 2 rounds

Key Schedule (AES-128):
  Input: 16-byte key
  Output: 11 x 16 bytes = 176 bytes of round keys
  Operations: RotWord + SubWord + XOR + Rcon
  Non-linearity: SubWord (S-box) + Rcon (uniqueness)

AES rounds:
  AES-128: 10 rounds (+ initial AddRoundKey)
  AES-192: 12 rounds
  AES-256: 14 rounds
  Last round: no MixColumns

Wide Trail:
  Guarantee: at least 25 active S-boxes in any 4-round trail
  Trail probability: <= 2^(-150) < 2^(-128)
  -> differential and linear cryptanalysis infeasible

Avalanche Effect:
  1-bit change -> ~50% output bit changes
  AES: full avalanche effect after 2 rounds

SPN vs Feistel:
  SPN (AES): faster diffusion, better on parallel HW
  Feistel (DES): same ops for enc/dec, needs more rounds
```

---

## References

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - AES standard (full specification)
- [The Design of Rijndael (Daemen, Rijmen)](https://www.springer.com/gp/book/9783540425809) - book by AES designers
- [Wide Trail Strategy](https://link.springer.com/chapter/10.1007/3-540-45661-9_1) - Daemen, Rijmen 2001
- [AES S-box construction](https://en.wikipedia.org/wiki/Rijndael_S-box)
- [PRESENT cipher](https://link.springer.com/chapter/10.1007/978-3-540-74735-2_31) - lightweight block cipher
- [Cache-timing attacks on AES (Bernstein)](https://cr.yp.to/antiforgery/cachetiming-20050414.pdf)
- [A Graduate Course in Applied Cryptography (Boneh, Shoup)](https://toc.cryptobook.us/) - ch. 4
- [Cryptopals Set 1, Challenge 7](https://cryptopals.com/sets/1/challenges/7) - AES practice
