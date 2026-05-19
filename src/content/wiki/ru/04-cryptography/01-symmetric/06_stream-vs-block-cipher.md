---
title: "Потоковые и блочные шифры - сравнение"
date: "2026-05-15"
---

Блочные и потоковые шифры - два фундаментальных класса симметричного шифрования. Понимание различий между ними определяет правильный выбор алгоритма для конкретной задачи и объясняет почему одни атаки применимы к одному классу и бесполезны против другого.

---

## Блочный шифр: основная идея

```
Блочный шифр - детерминированная перестановка на пространстве {0,1}^n.

E: {0,1}^k x {0,1}^n -> {0,1}^n
   (ключ)    (блок)       (блок)

Для фиксированного ключа K: E(K, .) - биекция (перестановка).
Каждый блок фиксированного размера шифруется как отдельная операция.

Примеры:
  AES-128:   блок 128 бит, ключ 128/192/256 бит
  AES-256:   блок 128 бит, ключ 256 бит
  DES:       блок 64 бита, ключ 56 бит (устарел)
  3DES:      блок 64 бита, ключ 112/168 бит (устарел)
  Blowfish:  блок 64 бита, ключ 32-448 бит (устарел)
  Camellia:  блок 128 бит, ключ 128/192/256 бит
```

### Что значит "перестановка"

```
При фиксированном ключе K блочный шифр создаёт
взаимно однозначное соответствие (биекцию):

Ключ K определяет конкретную перестановку из 2^n! возможных.
AES-128: 2^128! возможных перестановок 128-битных блоков.

Это означает:
  - Каждый 128-битный блок PT -> ровно один 128-битный CT
  - Каждый 128-битный CT -> ровно один 128-битный PT
  - Без знания ключа: перестановка выглядит случайной (PRP)

PRP (Pseudo-Random Permutation):
  Отличить E(K, .) от случайной перестановки за разумное время невозможно.
  Это основное требование безопасности блочного шифра.
```

---

## Потоковый шифр: основная идея

```
Потоковый шифр генерирует псевдослучайный поток битов (keystream)
из ключа и nonce, затем XOR-ит его с открытым текстом.

Keystream  = PRG(Key, Nonce)
Ciphertext = Plaintext XOR Keystream

Примеры:
  ChaCha20:    ключ 256 бит, nonce 96 бит (IETF) / 64 бит
  Salsa20:     ключ 256 бит, nonce 64 бит
  RC4:         ключ 40-2048 бит (СЛОМАН, не использовать)
  A5/1:        64 бита (GSM, СЛОМАН)
  Grain-128a:  ключ 128 бит (IoT)
  SNOW 3G:     3GPP (LTE шифрование)

Ключевые свойства:
  Шифрование = Дешифрование (одна операция XOR).
  Нет понятия "блок" - работает с произвольной длиной данных.
  Нет паддинга.
```

### PRG: псевдослучайный генератор

```
PRG (Pseudo-Random Generator) - детерминированная функция,
растягивающая короткий секретный seed в длинный псевдослучайный поток.

Требование безопасности:
  Отличить PRG(seed) от истинно случайной строки той же длины
  за полиномиальное время невозможно.

Для потокового шифра:
  Seed = (Key, Nonce, Counter)
  Поток = PRG(Key, Nonce, Counter)

  При одном (Key, Nonce): поток детерминирован.
  При разных (Key, Nonce): потоки независимы.

ChaCha20 как PRG:
  ChaCha20_block(Key, Nonce, Counter) -> 64 байта keystream
  Для следующих 64 байт: Counter++
  Стойкость: 2^256 (256-битный ключ)
```

---

## Структурные различия

### Схема работы

```
Блочный шифр (AES в режиме ECB - упрощённо):

Plaintext:  [   блок 1  ] [   блок 2  ] [   блок 3  ]
                  |               |               |
                AES_K           AES_K           AES_K
                  |               |               |
Ciphertext: [   блок 1  ] [   блок 2  ] [   блок 3  ]

Данные должны быть кратны размеру блока (или с паддингом).


Потоковый шифр (ChaCha20):

Key+Nonce -> [KS block 0] [KS block 1] [KS block 2] ...
                   |            |            |
                  XOR          XOR          XOR
                   |            |            |
Plaintext:  [..любая длина.................................................]
                   |            |            |
Ciphertext: [..любая длина.................................................]

Нет паддинга. Keystream блоки независимы -> параллельная генерация.
```

### Сравнительная таблица

```
Характеристика         Блочный шифр           Потоковый шифр
--------------------   --------------------   --------------------
Единица обработки      Фиксированный блок     Один бит или байт
Длина данных           Кратно блоку (или pad) Любая
Padding                Нужен (ECB, CBC)       Не нужен
Параллельность шифр.   Зависит от режима      Да
Параллельность дешифр. Да (CBC и др.)         Да
Случайный доступ       С режимом CTR          Да (через counter)
Внутренняя структура   SPN или Feistel        ARX / LFSR / другие
Состояние              Без состояния *        Может иметь состояние
Nonce/IV               Зависит от режима      Обязателен
Примеры                AES, Camellia          ChaCha20, Salsa20, RC4
Скорость (без HW)      Средняя                Высокая
HW ускорение           Да (AES-NI)            Нет (SIMD помогает)
Cache-timing риск      Есть (S-box таблицы)   Нет (ARX)

* Состояние добавляет режим работы (CBC -> IV, CTR -> counter)
```

---

## Режимы работы блочного шифра

```
Блочный шифр шифрует ровно один блок.
Для данных произвольной длины нужен режим работы.
Режим определяет ВСЕ свойства безопасности системы.

ECB (Electronic Codebook):
  Ci = E(K, Pi)
  Детерминирован, паттерны открытого текста видны. НИКОГДА не использовать.

CBC (Cipher Block Chaining):
  Ci = E(K, Pi XOR C(i-1)),  C0 = IV (случайный)
  Последовательное шифрование. Уязвим к Padding Oracle без MAC.

CTR (Counter):
  Ci = Pi XOR E(K, Nonce || i)
  Превращает блочный шифр в потоковый!
  Параллельный. Нет паддинга. Произвольный доступ.

GCM (Galois/Counter Mode):
  CTR + GHASH аутентификация. AEAD.
  Стандарт де-факто для новых систем.

CFB (Cipher Feedback):
  Ci = Pi XOR E(K, C(i-1))
  Самосинхронизирующийся. Редко используется сегодня.

OFB (Output Feedback):
  KS_i = E(K, KS_(i-1))
  Превращает блочный шифр в синхронный потоковый.
  Уязвим: повтор nonce -> повтор всего keystream.
```

### CTR стирает границу между классами

```
Ключевое наблюдение: CTR превращает AES в потоковый шифр.

AES-CTR keystream:
  KS_i = AES_K(Nonce || i)
  Ciphertext = Plaintext XOR KS

Свойства, которые CTR даёт AES:
  - Нет паддинга
  - Произвольный доступ
  - Параллельное шифрование
  - Длина шифртекста = длина открытого текста

AES-GCM = AES-CTR + GHASH (блочный примитив в потоковом режиме + MAC)
ChaCha20-Poly1305 = ChaCha20 + Poly1305 (потоковый примитив + MAC)

Оба алгоритма структурно идентичны.
Разница только в примитиве: AES vs ChaCha20.
Выбор определяется наличием AES-NI.
```

---

## Внутренняя конструкция

### SPN: Substitution-Permutation Network (AES)

```
AES использует SPN - чередование подстановок и перестановок.

Один раунд AES:
  SubBytes:   каждый байт -> S-box[байт]   <- нелинейность (конфузия)
  ShiftRows:  циклический сдвиг строк матрицы  <- диффузия
  MixColumns: умножение в GF(2^8)              <- диффузия
  AddRoundKey: XOR с раундовым ключом           <- ключевое воздействие

10-14 раундов в зависимости от размера ключа.

S-box: нелинейная таблица 8->8 бит (256 записей в памяти).
Обращения к памяти по адресам, зависящим от данных ->
потенциальные cache-timing атаки в shared environments (VM, облако).
```

### Feistel Network (DES, Blowfish, Twofish)

```
Feistel разбивает блок на две половины L и R.

Раунд i:
  L_i = R_(i-1)
  R_i = L_(i-1) XOR F(R_(i-1), K_i)

Дешифрование = шифрование с обратным порядком подключей.
Функция F не обязана быть обратимой!

Преимущество: простое дешифрование, гибкая функция F.
Недостаток: нужно вдвое больше раундов для той же диффузии.

AES - не Feistel (он SPN): лучшая диффузия за меньше раундов.
```

### ARX: Addition, Rotation, XOR (ChaCha20, Salsa20)

```
ARX - строительные блоки без таблиц подстановок.

Операции:
  a = (a + b) mod 2^32  <- сложение создаёт нелинейность
  a = a XOR b            <- диффузия
  a = a <<< n            <- циклический сдвиг (rotation)

Quarter Round ChaCha20:
  a += b;  d ^= a;  d <<<= 16;
  c += d;  b ^= c;  b <<<= 12;
  a += b;  d ^= a;  d <<<= 8;
  c += d;  b ^= c;  b <<<= 7;

Все операции на 32-битных словах без ветвлений и таблиц.
Исполняется за константное время на любой платформе.
Нет cache-timing атак физически.

Компромисс: нелинейность слабее чем S-box.
Компенсация: больше раундов (ChaCha20: 20 раундов vs AES: 10-14).
```

### LFSR: Linear Feedback Shift Register (устаревшие шифры)

```
Исторические потоковые шифры (A5/1, SNOW 2.0) используют LFSR.

LFSR - регистр сдвига с линейной обратной связью:
  Состояние: n-битный регистр
  Каждый такт: новый_бит = XOR выбранных битов состояния (tap positions)
  Выход: один бит

Проблема: выход LFSR линейный.
Berlekamp-Massey алгоритм восстанавливает любой LFSR
по 2n битам выхода (где n - длина регистра).

Защита: нелинейная комбинация нескольких LFSR.
Но: математически намного слабее ARX.

A5/1 (GSM): 3 LFSR, 64-битный ключ -> взломан полностью.
SNOW 3G (LTE): LFSR + S-box -> безопасен пока.

В современных системах LFSR не используется как основа.
ARX (ChaCha20) - правильная альтернатива.
```

---

## Производительность

### Без аппаратного ускорения

```
x86_64 без AES-NI (Python/PyCryptodome):

Алгоритм              Скорость
---------             --------
ChaCha20-Poly1305     ~350 МБ/с
AES-128-GCM           ~60 МБ/с
AES-256-GCM           ~45 МБ/с   <- в 8 раз медленнее ChaCha20!
AES-128-CBC           ~80 МБ/с
3DES-CBC              ~25 МБ/с

ARM Cortex-A53 без AES-NI (типичный IoT/Raspberry Pi):
ChaCha20-Poly1305     ~200 МБ/с
AES-256-GCM           ~30 МБ/с
```

### С аппаратным ускорением

```
AES-NI (Intel Sandy Bridge+, AMD Zen+):
  AES-128-GCM:   ~3-5 ГБ/с на ядро
  AES-256-GCM:   ~2-4 ГБ/с на ядро
  Ускорение: ~50x vs программный AES

ChaCha20 AVX2 (8 блоков параллельно):
  ~2-4 ГБ/с - сравнимо с AES-NI на некоторых CPU

ARM Crypto Extension (аналог AES-NI):
  Cortex-A57+, Apple M1/M2, Snapdragon 8xx
  AES: ~3-8 ГБ/с
  NEON ChaCha20: ~2-3 ГБ/с

Вывод по производительности:
  Без HW ускорения: ChaCha20 быстрее в 5-10 раз
  С HW ускорением (AES-NI): AES быстрее в 1.5-3 раза
  Мобильные чипы 2020+: оба быстры, разница ~2x
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
    print(f"{name:30s}: {mb / elapsed:7.1f} МБ/с")

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

## Безопасность: ключевые различия

### Семантическая безопасность (IND-CPA)

```
IND-CPA (Indistinguishability under Chosen Plaintext Attack):
Злоумышленник не может различить шифртексты двух сообщений
при доступе к оракулу шифрования.

ECB - НЕ IND-CPA:
  Детерминирован: P = P' => C = C'
  Атака мгновенна: шлём P и P', получаем C и C', сравниваем.

Блочный шифр + случайный IV (CBC, CTR, GCM) - IND-CPA:
  Рандомизация через IV/nonce обеспечивает семантическую безопасность.
  Даже одинаковые PT блоки -> разный CT.

Потоковый шифр с уникальным nonce - IND-CPA:
  (Key, Nonce) уникален -> keystream уникален -> нет паттернов.

Потоковый шифр с повторным nonce - катастрофа:
  C1 = P1 XOR KS
  C2 = P2 XOR KS
  C1 XOR C2 = P1 XOR P2   <- many-time pad атака
```

### Целостность и аутентификация

```
Ни блочный, ни потоковый шифр сами по себе целостность не обеспечивают.

Атаки без MAC:
  CBC: bit-flipping -> предсказуемое изменение Pi через модификацию C(i-1)
  CTR: bit-flipping -> прямое изменение бит plaintext (немедленно!)
  ChaCha20 без Poly1305: полная уязвимость к подделке

Решение: AEAD
  AES-GCM:           AES-CTR + GHASH MAC
  ChaCha20-Poly1305: ChaCha20 + Poly1305 MAC
  AES-CCM:           AES-CTR + AES-CBC-MAC

Без AEAD: обязательно Encrypt-then-MAC (HMAC-SHA256).
Порядок важен: Encrypt-then-MAC безопасен, MAC-then-Encrypt нет.
```

### Атаки по классам

```
Специфичные для БЛОЧНЫХ шифров:
  - ECB: паттерны видны, byte-at-a-time oracle декриптует секрет
  - CBC Padding Oracle: побайтовое дешифрование (POODLE, BEAST)
  - CBC Bit-Flipping: контролируемое изменение plaintext
  - Birthday Bound (64-битный блок): SWEET32 (3DES, Blowfish)
  - Related-Key атаки: теоретические на key schedule
  - Cache-Timing: через S-box таблицы в памяти

Специфичные для ПОТОКОВЫХ шифров:
  - Nonce Reuse (many-time pad): главная практическая угроза
  - Statistical Bias: первые байты RC4 предсказуемы -> NOMORE атака
  - LFSR Linear Attacks: Berlekamp-Massey восстанавливает LFSR за 2n битов
  - Time-Memory-Data Tradeoff: для слабых шифров (A5/1)

Общие для обоих:
  - Слабый RNG для ключей и nonce
  - Оракульные атаки (padding oracle, timing oracle)
  - Реализационные timing атаки
```

---

## Когда что использовать

### Практическое руководство

```
С AES-NI (серверы, desktop x86_64):
  -> AES-256-GCM

Без AES-NI (ARM, IoT, мобильные, embedded):
  -> ChaCha20-Poly1305

Требуется FIPS 140-2/3 compliance:
  -> AES-256-GCM (ChaCha20 пока не в FIPS)

Много сообщений с случайным nonce (> 2^32):
  -> XChaCha20-Poly1305 или ротация ключей

Шифрование диска (случайный доступ к секторам):
  -> AES-XTS (специально для block devices, не AEAD)
  LUKS2: AES-256-XTS по умолчанию

Устаревший код с CBC:
  -> обязательно добавить HMAC (Encrypt-then-MAC)
  -> или мигрировать на GCM/ChaCha20-Poly1305

Никогда не использовать:
  ECB (данные длиннее одного блока)
  RC4 (сломан с 2001, запрещён в TLS 2015)
  DES (56-битный ключ, сломан с 1998)
  3DES (запрещён NIST с 2023)
  Режим без аутентификации без отдельного MAC
```

### Дерево решений

```
Нужно шифрование данных?
|
+-- Требуется FIPS? -> Да  -> AES-256-GCM
|
+-- Есть AES-NI?   -> Да  -> AES-256-GCM
|                  -> Нет -> ChaCha20-Poly1305
|
+-- Много сообщений на ключ (> 2^32)?
|   -> XChaCha20-Poly1305 или ротация ключей
|
+-- Шифрование диска с random access к секторам?
|   -> AES-XTS (LUKS2, BitLocker)
|
+-- Нужна аутентификация AAD?
    -> GCM или ChaCha20-Poly1305 (оба AEAD, оба поддерживают AAD)
```

---

## Реальные примеры из протоколов

### TLS 1.3

```
Три обязательных cipher suite (RFC 8446):
  TLS_AES_128_GCM_SHA256        <- AES блочный в CTR режиме + GHASH
  TLS_AES_256_GCM_SHA384        <- AES блочный в CTR режиме + GHASH
  TLS_CHACHA20_POLY1305_SHA256  <- ChaCha20 потоковый + Poly1305

Выбор на практике:
  Chrome/Firefox без AES-NI: выбирают ChaCha20-Poly1305
  Серверы с AES-NI:          предпочитают AES-GCM
  Алгоритм: клиент предлагает список, сервер выбирает первый совпавший

Nonce схема одинакова для обоих в TLS 1.3:
  Nonce = static_IV XOR (0-padded sequence_number)
  sequence_number: 0, 1, 2, ... (инкрементируется, не повторяется)
```

### WireGuard: только потоковый

```
WireGuard использует ТОЛЬКО ChaCha20-Poly1305. Никакого AES. Никакого выбора.
"Algorithm agility is the enemy of security." - Jason Donenfeld

Почему только один алгоритм:
  - Нет downgrade атак (нечего downgradе-ить)
  - Нет слабых cipher suites
  - Простота реализации -> меньше кода -> меньше ошибок
  - ChaCha20 работает одинаково быстро без AES-NI зависимости

Nonce: 64-битный счётчик пакетов (не повторяется).
Handshake: Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s
```

### OpenSSH: оба класса

```
Приоритет cipher suites (OpenSSH 9.0+):
  chacha20-poly1305@openssh.com  <- потоковый (1 приоритет)
  aes256-gcm@openssh.com         <- блочный в GCM
  aes128-gcm@openssh.com         <- блочный в GCM
  aes256-ctr + hmac-sha2-256     <- блочный CTR + отдельный MAC

Все secure варианты в SSH используют блочный шифр в потоковом режиме
(CTR/GCM) или настоящий потоковый шифр.
Чистый CBC в SSH - устарел и по умолчанию отключён.

Проверить cipher соединения:
  ssh -vv user@host 2>&1 | grep "cipher:"
```

---

## Атаки: практические примеры

### Many-time pad (nonce reuse)

```python
import os
from Crypto.Cipher import ChaCha20

def many_time_pad_demo():
    """
    Если (key, nonce) используется дважды - потоковый шифр сломан.
    """
    key   = os.urandom(32)
    nonce = os.urandom(12)  # ОШИБКА: один и тот же nonce для обоих

    p1 = b"Attack at dawn! Send all forces."
    p2 = b"Retreat at noon. Conserve ammo!"

    c1 = ChaCha20.new(key=key, nonce=nonce).encrypt(p1)
    c2 = ChaCha20.new(key=key, nonce=nonce).encrypt(p2)

    # Злоумышленник видит только c1 и c2
    xored = bytes(a ^ b for a, b in zip(c1, c2))
    # xored = p1 XOR p2 - утечка XOR открытых текстов!

    # Crib dragging: предполагаем что p1 содержит "Attack"
    crib = b"Attack"
    for i in range(len(xored) - len(crib)):
        candidate = bytes(a ^ b for a, b in zip(xored[i:], crib))
        if all(32 <= x < 127 for x in candidate[:len(crib)]):
            print(f"Позиция {i}: если P1='{crib.decode()}' то P2='{candidate[:len(crib)].decode()}'")

    # Зная p1 -> восстанавливаем keystream -> расшифровываем c2
    ks = bytes(a ^ b for a, b in zip(c1, p1))
    p2_recovered = bytes(a ^ b for a, b in zip(c2, ks))
    print(f"P2 восстановлен: {p2_recovered}")

many_time_pad_demo()
```

### Padding Oracle: специфика блочного шифра

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
    Уязвимый сервер: возвращает True если паддинг корректный.
    В реальности разные ошибки = утечка информации.
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
    """Восстановить последний байт блока через Padding Oracle"""
    for guess in range(256):
        modified_prev = bytearray(prev_block)
        modified_prev[15] = guess
        crafted = bytes(modified_prev) + ct_block
        if padding_oracle(crafted):
            # Паддинг 0x01 корректен: intermediate[15] = guess XOR 0x01
            intermediate = guess ^ 0x01
            return intermediate ^ prev_block[15]
    return -1

# Потоковый шифр ChaCha20-Poly1305 к этой атаке неуязвим:
# нет блоков, нет паддинга, тег отклонит любую модификацию
print("CBC Padding Oracle: атака специфична для блочных шифров с паддингом")
print("ChaCha20-Poly1305: нет паддинга, нет этой атаки")
```

### Случайный доступ: потоковый vs CBC

```python
from Crypto.Cipher import ChaCha20_Poly1305, AES
import os, time

data_1mb = os.urandom(1024 * 1024)
key = os.urandom(32)
n12 = os.urandom(12)
iv  = os.urandom(16)

# Зашифруем 1 МБ данных
cha_cipher = ChaCha20_Poly1305.new(key=key, nonce=n12)
cha_ct, cha_tag = cha_cipher.encrypt_and_digest(data_1mb)

cbc_cipher = AES.new(key[:16], AES.MODE_CBC, iv=iv)
cbc_ct = cbc_cipher.encrypt(data_1mb)  # данные уже выровнены

TARGET_POS = 500_000  # хотим расшифровать байт по этой позиции

# Потоковый (CTR-подобный): нужен только один блок keystream
# block 500000//64 = 7812, offset = 500000%64 = 32
# Можно начать дешифрование с любого блока - O(1)
t0 = time.perf_counter()
# Создаём новый cipher - seek не нужен, просто пропускаем до нужного блока
# (реальный skip через шифрование нулей или внутренний seek)
_ = AES.new(key[:16], AES.MODE_CTR,
            nonce=n12[:8],
            initial_value=TARGET_POS // 16)
t_stream = time.perf_counter() - t0

# CBC: нужно расшифровать ВСЕ блоки до целевого - O(n)
t0 = time.perf_counter()
cbc_d = AES.new(key[:16], AES.MODE_CBC, iv=iv)
_ = cbc_d.decrypt(cbc_ct[:((TARGET_POS // 16) + 1) * 16])
t_cbc = time.perf_counter() - t0

print(f"CTR/Stream random access:  ~O(1) - один блок keystream")
print(f"CBC random access:          O(n)  - {TARGET_POS//16} блоков до позиции")
print(f"\nВывод: CTR и потоковые шифры дают O(1) доступ к любому байту")
print("       CBC требует расшифровки всех предыдущих блоков")
```

---

## LFSR и RC4: почему устарели

### A5/1: GSM шифрование

```
A5/1 - потоковый шифр для голоса в GSM (1987, засекречен до 1994).

Архитектура:
  R1: 19-битный LFSR, tap positions: {18, 17, 16, 13}
  R2: 22-битный LFSR, tap positions: {21, 20}
  R3: 23-битный LFSR, tap positions: {22, 21, 20, 7}
  Итого: 64 бита состояния
  Irregular clocking: majority vote bit 8/10/10

Взломы:
  1999: Biham, Dunkelman - теоретическая атака 2^40
  2003: Kraken - TMTO с предвычисленными таблицами
  2010: Karsten Nohl - публичные rainbow tables
        GSM перехват в реальном времени на обычном PC!

Причина слабости:
  64-битный ключ (из 64 бит только 54 значащих)
  Линейная структура LFSR -> Berlekamp-Massey применима
  Неравномерная синхронизация добавляет малую нелинейность

Замена: KASUMI (A5/3) в 3G -> SNOW 3G и AES-128 в LTE.
```

### RC4: почему запрещён

```
RC4 (1987, утёк в 1994) - исторически самый распространённый потоковый шифр.
Сломан. RFC 7465 (2015): запрещён в TLS.

Проблемы:
1. Biased output: первые 256+ байт keystream статистически предсказуемы.
   Атака: при многократном использовании одного ключа
   статистика первых байт раскрывает ключ.

2. Fluhrer-Mantin-Shamir (2001):
   Слабые ключи в RC4 -> восстановление ключа.
   WEP: RC4 с предсказуемым IV = катастрофа.
   Инструменты взлома WEP: aircrack-ng, за минуты.

3. RC4 NOMORE (2015):
   Восстановление session cookie из HTTPS за ~52 часа.
   75% вероятность за 2^24 зашифрованных сессий.

Замена RC4: ChaCha20 (Google выбрал ChaCha20 именно как замену RC4 в 2014).
```

---

## Гибридное шифрование

```
На практике симметричное шифрование (любого класса)
никогда не используется изолированно для обмена данными.

Типичная схема:

1. Key Agreement (ECDH, X25519):
   Alice.pub * Bob.priv = Bob.pub * Alice.priv = shared_secret
   Ни одна сторона не передаёт ключ явно

2. Key Derivation (HKDF):
   sym_key = HKDF(shared_secret, salt, "context", length=32)

3. Симметричное шифрование (блочное или потоковое):
   ciphertext, tag = AES-256-GCM.encrypt(sym_key, nonce, data)
   или
   ciphertext, tag = ChaCha20-Poly1305.encrypt(sym_key, nonce, data)

TLS 1.3 делает именно это:
  X25519 ECDHE -> HKDF -> AES-GCM или ChaCha20-Poly1305

Выбор между AES-GCM и ChaCha20-Poly1305 в этой схеме:
  Только производительность и совместимость (оба безопасны).
```

---

## Шпаргалка

```
БЛОЧНЫЙ ШИФР (AES):
  Шифрует фиксированные блоки (128 бит)
  Нужен режим работы для данных > 1 блока
  Конструкция: SPN (AES) или Feistel (DES)
  Нелинейность: S-box (таблицы в памяти -> cache-timing риск)
  С AES-NI: ~2-5 ГБ/с (лучший выбор на серверах)

ПОТОКОВЫЙ ШИФР (ChaCha20):
  Генерирует keystream -> XOR с данными
  Произвольная длина, нет паддинга
  Конструкция: ARX (нет таблиц -> нет cache-timing)
  Нелинейность: сложение mod 2^32
  Без AES-NI: ~350 МБ/с (лучший выбор на ARM/IoT)

КЛЮЧЕВОЕ:
  AES в CTR/GCM режиме = функционально потоковый шифр
  Граница стёрта: оба используют одну AEAD схему
  AES-GCM и ChaCha20-Poly1305 структурно идентичны

ВЫБОР:
  С AES-NI    -> AES-256-GCM
  Без AES-NI  -> ChaCha20-Poly1305
  FIPS нужен  -> AES-256-GCM
  WireGuard   -> ChaCha20-Poly1305 (фиксировано)
  TLS 1.3     -> оба поддерживаются

НИКОГДА:
  ECB, RC4, DES, 3DES
  Режим без аутентификации без отдельного MAC
  Повторный (Key, Nonce)

КОМАНДЫ:
  openssl speed -evp chacha20-poly1305 aes-256-gcm
  openssl ciphers -v 'ALL' | grep -vE 'RC4|DES|NULL|EXPORT'
  grep aes /proc/cpuinfo  # проверить AES-NI
```

---

## Ссылки

- [The Joy of Cryptography (Mike Rosulek)](https://joyofcryptography.com/) - бесплатный учебник
- [A Graduate Course in Applied Cryptography (Boneh, Shoup)](https://toc.cryptobook.us/) - полный курс
- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) - ChaCha20-Poly1305
- [NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800/38/a/final) - блочные режимы (CBC, CTR)
- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800/38/d/final) - GCM
- [eSTREAM Project](https://www.ecrypt.eu.org/stream/) - конкурс потоковых шифров 2008
- [SWEET32 (sweet32.info)](https://sweet32.info/) - birthday bound на 64-битных блоках
- [RFC 7465](https://www.rfc-editor.org/rfc/rfc7465) - RC4 запрещён в TLS
- [Cryptopals Challenges](https://cryptopals.com/) - практика атак на оба класса
