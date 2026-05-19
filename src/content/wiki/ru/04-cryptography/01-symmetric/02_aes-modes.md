---
title: "AES - режимы ECB, CBC, CTR, GCM"
date: "2026-05-15"
---

AES (Advanced Encryption Standard) - симметричный блочный шифр, принятый как стандарт NIST в 2001 году (FIPS 197). Шифрует данные блоками по 128 бит, поддерживает ключи 128, 192 и 256 бит. Режим работы определяет, как шифруются данные длиннее одного блока и какие свойства безопасности обеспечиваются.

---

## Основы AES

```
Параметры AES:
Размер блока:   128 бит (16 байт) — фиксированный
Размер ключа:   128, 192 или 256 бит
Раундов:        10 (AES-128), 12 (AES-192), 14 (AES-256)

Одна операция шифрования AES:
Plaintext (16 байт) + Key → Ciphertext (16 байт)
Ciphertext (16 байт) + Key → Plaintext (16 байт)

AES — не алгоритм, а стандарт на основе Rijndael.
Rijndael поддерживает переменные размеры блока и ключа,
AES фиксирует блок на 128 бит.
```

### Внутренняя структура AES (упрощённо)

```
Каждый раунд AES состоит из 4 операций:

1. SubBytes   - замена каждого байта через S-box (нелинейность)
2. ShiftRows  - сдвиг строк матрицы состояния (диффузия)
3. MixColumns - перемешивание столбцов в GF(2^8) (диффузия)
4. AddRoundKey - XOR с раундовым ключом (Key Schedule)

Последний раунд: без MixColumns.

Состояние (State) - матрица 4×4 байта (16 байт = 1 блок):
┌──┬──┬──┬──┐
│a0│a4│a8│ac│
│a1│a5│a9│ad│
│a2│a6│aa│ae│
│a3│a7│ab│af│
└──┴──┴──┴──┘
```

### Почему нельзя просто шифровать блоки независимо?

```
Если шифровать каждый блок независимо одним ключом → это ECB.
ECB опасен: одинаковые блоки открытого текста → одинаковые блоки шифртекста.
Режимы работы решают эту проблему разными способами.
```

---

## Режим ECB (Electronic Codebook)

### Принцип работы

```
Шифрование:
P1 → AES_K → C1
P2 → AES_K → C2
P3 → AES_K → C3

Каждый блок открытого текста шифруется НЕЗАВИСИМО одним ключом.

Дешифрование:
C1 → AES_K^(-1) → P1
C2 → AES_K^(-1) → P2
C3 → AES_K^(-1) → P3
```

```
Схема:
Plaintext:  [P1]   [P2]   [P3]   [P4]
             |      |      |      |
            AES    AES    AES    AES   (один ключ K)
             |      |      |      |
Ciphertext: [C1]   [C2]   [C3]   [C4]
```

### Проблема ECB

```
ECB — детерминированный: P = P' ⟹ Enc(P) = Enc(P')

Знаменитый пример: Linux пингвин Tux.
Исходное изображение шифруется ECB → контуры пингвина видны!
Потому что одинаковые пиксели → одинаковые блоки → одинаковый шифртекст.

Атака: анализ частот.
Если злоумышленник знает, что P1 = P3, он знает C1 = C3.
Это раскрывает паттерны в данных.

ECB не обеспечивает семантическую безопасность (IND-CPA).
```

### Применение

```
ECB НЕ ИСПОЛЬЗОВАТЬ для шифрования данных!

Единственный законный случай:
- Шифрование одного блока (напр. ключа другого ключа в Key Wrapping — но даже здесь есть AES-KW)
- Примитивный строительный блок внутри других конструкций

Padding: нужен (PKCS#7 или другой), если данные не кратны 16 байтам.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

key = os.urandom(16)  # AES-128
cipher = AES.new(key, AES.MODE_ECB)

plaintext = b"Hello, World!!!!"  # ровно 16 байт
ciphertext = cipher.encrypt(plaintext)

# Дешифрование
cipher2 = AES.new(key, AES.MODE_ECB)
recovered = cipher2.decrypt(ciphertext)
print(recovered)  # b'Hello, World!!!!'

# С паддингом:
data = b"Short message"
padded = pad(data, AES.block_size)
encrypted = cipher.encrypt(padded)
```

---

## Режим CBC (Cipher Block Chaining)

### Принцип работы

```
Каждый блок открытого текста перед шифрованием XOR-ится
с предыдущим блоком шифртекста.
Первый блок XOR-ится с IV (Initialization Vector).

Шифрование:
C0 = IV
Ci = AES_K(Pi XOR C(i-1))

Дешифрование:
C0 = IV
Pi = AES_K^(-1)(Ci) XOR C(i-1)
```

```
Схема шифрования:
IV
 |
 v
[P1] →XOR→ AES_K → [C1] →┐
                            |
[P2] →XOR────────────────┘→ AES_K → [C2] →┐
                                             |
[P3] →XOR────────────────────────────────┘→ AES_K → [C3]

Схема дешифрования:
IV
 |
[C1] → AES_K^(-1) → XOR → [P1]
 |                   ^
 |                   |
[C2] → AES_K^(-1) → XOR → [P2]
 |                   ^
 |                   |
[C3] → AES_K^(-1) → XOR → [P3]
```

### Свойства CBC

```
+ Одинаковые блоки открытого текста → разные блоки шифртекста (если IV уникален)
+ Широко используется, хорошо изучен
+ Параллельное ДЕШИФРОВАНИЕ возможно (каждый Ci зависит только от предыдущего Ci-1)

- Параллельное ШИФРОВАНИЕ невозможно (каждый Ci зависит от Ci-1)
- IV должен быть случайным и уникальным (не секретным, но непредсказуемым)
- Требует padding (данные должны быть кратны 16 байтам)
- Уязвим к Padding Oracle Attack (POODLE, BEAST)
- Не аутентифицирует данные (нет MAC) → уязвим к bit-flipping атаке
```

### Bit-flipping атака на CBC

```
Если злоумышленник изменяет бит в Ci-1, соответствующий бит в Pi будет изменён.
Это позволяет менять открытый текст, не зная ключа.

Пример:
Pi = AES_K^(-1)(Ci) XOR C(i-1)
Злоумышленник меняет C(i-1)[j] → изменяется Pi[j]

Вывод: CBC без аутентификации НЕ обеспечивает целостность.
Всегда используйте CBC вместе с HMAC (Encrypt-then-MAC).
Или используйте AEAD режим (GCM).
```

### IV в CBC

```
Требования к IV:
- ДОЛЖЕН быть случайным (криптографически стойкий CSPRNG)
- ДОЛЖЕН быть уникальным для каждого сообщения
- НЕ должен быть секретным (передаётся открыто вместе с шифртекстом)
- Размер: 16 байт (равен блоку AES)

Опасность предсказуемого IV:
BEAST атака (2011) использовала предсказуемые IV в TLS 1.0.
Атакующий мог определить открытый текст, выбрав специальные блоки.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

key = os.urandom(32)   # AES-256
iv  = os.urandom(16)   # случайный IV

# Шифрование
cipher = AES.new(key, AES.MODE_CBC, iv)
plaintext = b"Secret message, needs padding"
ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))

# IV передаём вместе с шифртекстом (открыто)
message = iv + ciphertext

# Дешифрование
iv_recv  = message[:16]
ct_recv  = message[16:]
cipher2  = AES.new(key, AES.MODE_CBC, iv_recv)
recovered = unpad(cipher2.decrypt(ct_recv), AES.block_size)
print(recovered)  # b'Secret message, needs padding'
```

---

## Режим CTR (Counter)

### Принцип работы

```
CTR превращает блочный шифр в потоковый.
Шифруется не сам открытый текст, а счётчик.
Результат XOR-ится с открытым текстом.

Keystream:
KS_i = AES_K(Nonce || Counter_i)

Шифрование:
Ci = Pi XOR KS_i

Дешифрование (идентично шифрованию!):
Pi = Ci XOR KS_i
```

```
Схема:
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

### Nonce и Counter

```
Counter block обычно состоит из двух частей:
[  Nonce (96 бит)  |  Counter (32 бит)  ]  — стандарт NIST SP 800-38A

Или:
[  Nonce (64 бит)  |  Counter (64 бит)  ]  — другая схема

Nonce (Number used Once):
- Должен быть уникальным для каждого сообщения с данным ключом
- НЕ обязан быть случайным (может быть счётчиком: 0, 1, 2, ...)
- Размер: обычно 96 бит (12 байт) в современных схемах

Counter:
- Начинается с 0 или 1, увеличивается на 1 для каждого блока
- 32-битный counter → максимум 2^32 блоков = 64 ГБ данных на один nonce
```

### Свойства CTR

```
+ Параллельное шифрование И дешифрование (нет зависимостей между блоками!)
+ Случайный доступ: можно расшифровать любой блок без остальных
  (нужно только KS_i = AES_K(Nonce || i))
+ Не требует padding (работает с произвольной длиной)
+ Шифрование = дешифрование (одна операция)
+ Keystream можно вычислить заранее (pre-computation)

- Не аутентифицирует данные
- Повторное использование Nonce с тем же ключом → катастрофа:
  C1 = P1 XOR KS
  C2 = P2 XOR KS
  C1 XOR C2 = P1 XOR P2  (злоумышленник получает XOR открытых текстов!)
```

### Опасность повторного Nonce

```
Many-time pad атака:
Если два сообщения зашифрованы одним ключом и одним nonce:

Enc(P1) = C1 = P1 XOR KS
Enc(P2) = C2 = P2 XOR KS

C1 XOR C2 = P1 XOR P2

Зная паттерны языка, можно восстановить оба открытых текста.
Именно так взломали RC4 в WEP (Wi-Fi).

Правило: (Key, Nonce) пара используется ТОЛЬКО ОДИН РАЗ.
```

```python
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # AES-256
nonce = os.urandom(8)    # 64-битный nonce (Crypto.Cipher.AES CTR)

# Шифрование
cipher = AES.new(key, AES.MODE_CTR, nonce=nonce)
plaintext  = b"No padding needed! Any length works fine here."
ciphertext = cipher.encrypt(plaintext)

# Дешифрование
cipher2   = AES.new(key, AES.MODE_CTR, nonce=nonce)
recovered = cipher2.decrypt(ciphertext)
print(recovered)  # b'No padding needed! Any length works fine here.'

# Произвольный доступ к блоку N (seek):
# cipher.seek(block_number * 16)  — для некоторых библиотек
```

---

## Режим GCM (Galois/Counter Mode)

### Принцип работы

```
GCM = CTR (шифрование) + GHASH (аутентификация)
Это режим AEAD (Authenticated Encryption with Associated Data).

GCM обеспечивает:
1. Конфиденциальность (CTR шифрование)
2. Целостность и аутентификацию (тег аутентификации - Authentication Tag)
3. Аутентификацию дополнительных данных (AAD / Associated Data)
   без их шифрования (например, заголовки пакетов)
```

```
Схема GCM:

AAD (не шифруется)           Plaintext
     |                           |
     |           Nonce||1  Nonce||2  Nonce||3  Nonce||0
     |                |       |       |           |
     |              AES_K   AES_K   AES_K       AES_K
     |                |       |       |           |
     |               KS1     KS2     KS3         H (Hashkey)
     |                |       |       |
     |   XOR[P1]--►[C1]  XOR[P2]--►[C2]  XOR[P3]--►[C3]
     |       |           |           |
     └──►GHASH──────────────────────────────►GHASH──► Tag
              ↑ умножение в GF(2^128)

Tag (16 байт) = GHASH(H, AAD, Ciphertext) XOR AES_K(Nonce||0)
```

### GHASH — как устроена аутентификация

```
H = AES_K(0^128)  — Hash key (шифрование нулевого блока)

GHASH(H, A, C):
Принимает AAD (A) и шифртекст (C), возвращает 128-битный тег.
Операция: умножение в поле Галуа GF(2^128) с неприводимым полиномом.

X_0 = 0
X_i = (X_{i-1} XOR A_i) * H    для каждого блока AAD
X_j = (X_j-1 XOR C_i) * H      для каждого блока шифртекста
финальный блок: длины A и C
Tag = X_final XOR AES_K(Nonce||0)
```

### Свойства GCM

```
+ AEAD: конфиденциальность + аутентичность в одной операции
+ Параллельное шифрование И дешифрование (на основе CTR)
+ Аутентификация AAD: данные, которые не шифруются, но проверяются
  (напр. IP-заголовки, protocol headers)
+ Произвольный доступ к шифртексту
+ Не требует padding
+ Стандарт де-факто: TLS 1.3, IPSec, SSH, WireGuard

- Нет смысла без проверки тега при дешифровании!
  Если тег не совпадает → данные повреждены или подделаны → ОТКАЗАТЬ
- Повторное использование (Key, Nonce) → катастрофа:
  Раскрывается Hash key H → вся аутентификация сломана навсегда
- 32-битный counter в GCM → максимум ~64 ГБ на один nonce
  (при превышении - wraparound, безопасность нарушается)
```

### Nonce в GCM

```
Рекомендуемый размер: 96 бит (12 байт) — NIST SP 800-38D.
При 96 битах: Nonce используется напрямую как IV, counter начинается с 1.
При другом размере: Nonce сам обрабатывается через GHASH → хуже и медленнее.

Генерация Nonce:
1. Случайный (CSPRNG): безопасен до 2^32 сообщений (birthday bound при 96 бит)
   Риск коллизии: 50% при ~2^48 шифрованиях → на практике безопасно
2. Детерминированный (счётчик): безопасен, если счётчик никогда не повторяется
   Нужна синхронизация / состояние

Повторный nonce в GCM:
Если два сообщения зашифрованы с одним (Key, Nonce):
- Оба шифртекста уязвимы (как CTR: C1 XOR C2 = P1 XOR P2)
- ХУЖЕ: раскрывается H = GHASH key → злоумышленник может подделать тег
  для ЛЮБОГО будущего сообщения с тем же ключом
```

### Authentication Tag

```
Размер тега: 128, 120, 112, 104, 96, 64, 32 бит (NIST допускает)
Рекомендуется: 128 бит (16 байт) для полной безопасности.

Тег 64 бит: birthday bound → 50% при 2^32 попытках → небезопасно в общем случае.

Проверка тега должна быть КОНСТАНТНОГО ВРЕМЕНИ:
Нельзя использовать обычное сравнение строк (timing attack).
Используйте hmac.compare_digest() или secrets.compare_digest().
```

```python
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # AES-256-GCM
nonce = os.urandom(12)   # 96-битный nonce (рекомендуется)

# Шифрование
plaintext = b"Sensitive data that needs both confidentiality and integrity"
aad       = b"Header info: version=1, user_id=42"  # не шифруется, но аутентифицируется

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher.update(aad)                         # добавить AAD
ciphertext, tag = cipher.encrypt_and_digest(plaintext)

# Передаём: nonce + tag + ciphertext + aad (aad передаём открыто)
print(f"Nonce:      {nonce.hex()}")
print(f"Tag:        {tag.hex()}")         # 16 байт
print(f"Ciphertext: {ciphertext.hex()}")

# Дешифрование с проверкой аутентичности
cipher2 = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher2.update(aad)
try:
    recovered = cipher2.decrypt_and_verify(ciphertext, tag)
    print(f"OK: {recovered}")
except ValueError:
    print("ОШИБКА: тег не совпадает! Данные повреждены или подделаны.")

# Проверим что подделка обнаруживается:
fake_ct = bytearray(ciphertext)
fake_ct[0] ^= 0xFF                         # изменим один бит
cipher3 = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher3.update(aad)
try:
    cipher3.decrypt_and_verify(bytes(fake_ct), tag)
except ValueError:
    print("Подделка обнаружена!")           # всегда сработает
```

---

## AES-GCM-SIV (SIV - Synthetic IV)

```
Расширение GCM, устойчивое к повторному использованию nonce.
RFC 8452 (2019).

Если nonce повторяется в AES-GCM-SIV:
- Конфиденциальность нарушается (видно равенство шифртекстов)
- Но аутентификация НЕ ломается (в отличие от обычного GCM!)

Как работает:
Nonce генерируется из AAD + Plaintext → детерминированный AEAD.
Если одинаковый plaintext с одинаковым nonce → одинаковый ciphertext
(детерминированность, а не randomized encryption).

Применение: случаи, где сложно гарантировать уникальность nonce
(key-value хранилища, файловые системы, nonce misuse resistance).
```

---

## Сравнение режимов

```
Режим    Параллельно  Padding  AEAD  Случ.доступ  Random IV/Nonce  Безопасность
------   -----------  -------  ----  -----------  ---------------  ------------
ECB      Да / Да      Да       Нет   Да           Нет              ПЛОХОЙ
CBC      Нет / Да     Да       Нет   Нет          IV случайный     Средний*
CTR      Да / Да      Нет      Нет   Да           Nonce уникальный Хороший*
GCM      Да / Да      Нет      Да    Да           Nonce уникальный Отличный

* без аутентификации — уязвим к активным атакам

Что выбрать:
- Новый код: AES-256-GCM
- Нужна устойчивость к nonce-reuse: AES-256-GCM-SIV
- Устаревший код с CBC: добавить HMAC-SHA256 (Encrypt-then-MAC)
- ECB: НИКОГДА (для шифрования данных)
```

```
Пропускная способность (примерно, x86_64 с AES-NI):
AES-128-GCM:  ~2-4 ГБ/с (аппаратное ускорение)
AES-256-GCM:  ~1.5-3 ГБ/с
AES-CBC:      ~1-2 ГБ/с (шифрование последовательно, дешифрование параллельно)
AES-CTR:      ~2-4 ГБ/с

AES-NI (Intel/AMD): инструкции уровня процессора для AES раундов
Проверить: grep aes /proc/cpuinfo
```

---

## Padding

### PKCS#7

```
Нужен в ECB и CBC (блочные режимы).
CTR и GCM — не нужен.

PKCS#7 (RFC 5652):
Если данные не кратны 16 байтам, добавляем N байт со значением N.
N = 16 - (len(data) % 16)
Если данные уже кратны — добавляем 16 байт (один полный блок) со значением 0x10.

Пример:
Данные: b"Hello" (5 байт)
Padding: 11 байт, каждый = 0x0B (11 в десятичном)
Результат: b"Hello\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b"

Данные: b"Hello, World!!!" (15 байт)
Padding: 1 байт = 0x01
Результат: b"Hello, World!!!\x01"

Данные: b"Hello, World!!!!" (16 байт)
Padding: 16 байт = 0x10
Результат: b"Hello, World!!!!\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10"
```

### Padding Oracle Attack

```
Если сервер сообщает разные ошибки для "неверный паддинг" vs "неверные данные",
атакующий может побайтово расшифровать данные без знания ключа.

Атака POODLE (2014): SSL 3.0 с CBC.
Атака BEAST (2011): TLS 1.0 с CBC и предсказуемым IV.

Защита:
- Всегда возвращать одну и ту же ошибку (не раскрывать причину)
- Проверять MAC ПЕРЕД расшифровкой (Encrypt-then-MAC)
- Использовать GCM вместо CBC
```

---

## Управление ключами

```
Размеры ключей AES и их стойкость:
AES-128: 128 бит → 2^128 возможных ключей → достаточно для большинства задач
AES-192: 192 бита → 2^192 возможных ключей
AES-256: 256 бит → 2^256 возможных ключей → рекомендуется для долгосрочных секретов

Квантовые компьютеры (алгоритм Гровера):
AES-128 → эффективная стойкость 64 бит (уязвим?)
AES-256 → эффективная стойкость 128 бит (приемлемо)

Для долгосрочных данных (>10 лет): AES-256.
Для TLS, VPN, шифрования файлов сейчас: AES-128 или AES-256 — оба нормальны.
```

```
Генерация ключей:
- НИКОГДА не использовать пароль напрямую как ключ AES
- Для паролей: PBKDF2, bcrypt, Argon2 → KDF → ключ AES

# Python: безопасная генерация ключа
import os
key = os.urandom(32)  # 256 бит из системного CSPRNG (/dev/urandom)

# Из пароля (PBKDF2):
import hashlib
key = hashlib.pbkdf2_hmac(
    'sha256',
    password=b"user_password",
    salt=os.urandom(16),    # случайная соль, сохранить вместе с шифртекстом
    iterations=600_000,     # NIST рекомендует 600k+ для PBKDF2-SHA256
    dklen=32
)
```

---

## Реальные применения

### TLS 1.3

```
TLS_AES_128_GCM_SHA256    - обязательный cipher suite
TLS_AES_256_GCM_SHA384    - обязательный
TLS_CHACHA20_POLY1305_SHA256 - обязательный (альтернатива GCM)

AES-CBC полностью убран из TLS 1.3.
AES-GCM — основной режим.

Nonce в TLS 1.3:
sequence_number (64 бит) XOR static_nonce → уникален для каждого записи
```

### WireGuard

```
ChaCha20-Poly1305 (предпочтительно) или AES-256-GCM.
AES-GCM используется при наличии AES-NI.
Nonce: 64-битный счётчик пакетов.
```

### Шифрование файлов (age, GPG)

```
age (современный инструмент):
  ChaCha20-Poly1305 или AES-128-GCM
  Случайный nonce 96 бит
  Отдельный ключ для каждого файла

OpenSSL: шифрование файла AES-256-GCM
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 -in file.txt -out file.enc -k "password"
openssl enc -d -aes-256-gcm -pbkdf2 -iter 600000 -in file.enc -out file.txt -k "password"
```

### Шифрование диска

```
LUKS2 (Linux):
  AES-XTS-512 (AES-XTS с 256-битным ключом для каждого направления)
  XTS - специальный режим для блочных устройств (не AEAD)

BitLocker (Windows):
  AES-XTS-256 или AES-CBC-256 + Elephant diffuser

XTS (XEX-based tweaked codebook mode with ciphertext stealing):
  Создан для шифрования блоков диска
  Не AEAD (нет аутентификации) - не для сетевого обмена
  Tweak = номер сектора → блоки в одном секторе не одинаковы
```

---

## Openssl — практика

```bash
# AES-256-CBC: шифрование файла
openssl enc -aes-256-cbc -in plaintext.txt -out encrypted.bin \
    -K $(openssl rand -hex 32) \
    -iv $(openssl rand -hex 16)

# AES-256-GCM через openssl (низкоуровневый API)
# Удобнее через Python или openssl pkeyutl

# Генерация случайного ключа
openssl rand -hex 32         # 256 бит в hex
openssl rand -base64 32      # 256 бит в base64

# Проверка режимов, доступных в OpenSSL
openssl enc -list | grep aes

# Бенчмарк AES
openssl speed -evp aes-128-gcm aes-256-gcm aes-128-cbc aes-256-cbc

# Проверить наличие AES-NI
openssl speed -evp aes-128-gcm 2>&1 | head -5
grep -m1 aes /proc/cpuinfo
```

---

## Распространённые ошибки

```
1. ECB для шифрования данных длиннее 16 байт
   Проблема: паттерны видны в шифртексте

2. Повторный nonce в GCM или CTR
   Проблема: катастрофический провал шифрования и аутентификации

3. Предсказуемый IV в CBC
   Проблема: BEAST, CPA атаки

4. CBC без аутентификации
   Проблема: bit-flipping, Padding Oracle

5. Не проверять тег аутентификации в GCM
   Проблема: принимаем подделанные данные

6. Короткий тег GCM (менее 96 бит)
   Проблема: снижается стойкость аутентификации

7. Пароль напрямую как ключ AES
   Проблема: пароли имеют малую энтропию

8. Использование небезопасного сравнения тегов (== или strcmp)
   Проблема: timing attack → утечка тега по времени
```

---

## Шпаргалка

```
ECB:
  Pi → AES_K → Ci (независимо)
  НИКОГДА не использовать для данных!

CBC:
  Ci = AES_K(Pi XOR C(i-1)), C0 = IV (случайный)
  Padding: нужен; Параллельность: только дешифрование
  Добавлять: Encrypt-then-MAC

CTR:
  Ci = Pi XOR AES_K(Nonce||i)
  Padding: не нужен; Параллельность: да
  Nonce: уникальный, никогда не повторять с тем же ключом

GCM:
  CTR шифрование + GHASH аутентификация
  Padding: не нужен; Параллельность: да; AEAD: да
  Nonce: 12 байт; никогда не повторять с тем же ключом
  Всегда проверять Tag перед использованием данных

Выбор:
  2024+: AES-256-GCM (или ChaCha20-Poly1305)
  Nonce reuse risk: AES-256-GCM-SIV
  CBC legacy: + HMAC-SHA256 (Encrypt-then-MAC)

Команды:
  openssl rand -hex 32          # сгенерировать ключ
  openssl speed -evp aes-256-gcm  # бенчмарк
  grep aes /proc/cpuinfo        # проверить AES-NI
```

---

## Ссылки

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - стандарт AES
- [NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800/38/a/final) - режимы ECB, CBC, CTR
- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800/38/d/final) - режим GCM
- [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116) - An Interface and Algorithms for Authenticated Encryption
- [RFC 8452](https://www.rfc-editor.org/rfc/rfc8452) - AES-GCM-SIV
- [Nonce-Disrespecting Adversaries](https://eprint.iacr.org/2016/475.pdf) - последствия nonce reuse в GCM
- [PyCryptodome docs](https://pycryptodome.readthedocs.io/) - Python библиотека для AES
