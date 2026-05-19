---
title: "ChaCha20-Poly1305"
date: "2026-05-15"
---

ChaCha20-Poly1305 - современный AEAD алгоритм (Authenticated Encryption with Associated Data), объединяющий потоковый шифр ChaCha20 и MAC Poly1305. Разработан Дэниелом Бернштейном (djb). Стандартизирован в RFC 8439 (2018). Является основной альтернативой AES-GCM - особенно на устройствах без аппаратного ускорения AES.

---

## Зачем нужна альтернатива AES-GCM

```
AES-GCM отличный алгоритм, но имеет ограничения:

1. Зависит от AES-NI (аппаратное ускорение):
   На ARM без AES-NI (старые смартфоны, IoT, embedded):
   AES-GCM: ~40-60 МБ/с
   ChaCha20-Poly1305: ~200-400 МБ/с

2. Timing-атаки на программный AES:
   Таблицы замен (S-box) используют обращения к памяти.
   Cache-timing атаки возможны в shared environments (виртуалки, облако).
   ChaCha20 использует только ARX (нет таблиц) - нет cache-timing.

3. Nonce reuse в GCM катастрофичен:
   Повтор nonce -> раскрытие H -> подделка любых тегов навсегда.
   ChaCha20-Poly1305 при повторе nonce теряет конфиденциальность,
   но не теряет аутентификацию так катастрофично.

Итог: ChaCha20-Poly1305 - выбор по умолчанию когда нет AES-NI.
TLS 1.3, WireGuard, QUIC, OpenSSH - всё поддерживает оба алгоритма.
```

---

## ChaCha20: потоковый шифр

### Происхождение

```
Salsa20 (Бернштейн, 2005) -> ChaCha20 (Бернштейн, 2008)

ChaCha = "cha cha" от Salsa (оба используют четвертьраундовую функцию).
ChaCha20 улучшает диффузию Salsa20: лучшее лавинное распространение
при том же числе раундов, выше устойчивость к дифференциальному криптоанализу.

eSTREAM (2008): Salsa20 выбран в финалисты конкурса потоковых шифров.
Google: выбрал ChaCha20-Poly1305 для HTTPS на мобильных в 2014.
RFC 7539 (2015) -> RFC 8439 (2018): IETF стандарт.
```

### Параметры ChaCha20

```
Ключ:    256 бит (32 байта)
Nonce:   96 бит (12 байт) - IETF вариант (RFC 8439)
         64 бит (8 байт)  - оригинальный вариант Бернштейна
Counter: 32 бита (IETF) или 64 бита (оригинал)
Блок keystream: 512 бит (64 байта)
Раунды:  20 (отсюда "20" в названии)

Максимум данных на (key, nonce):
  2^32 блоков x 64 байта = 256 ГБ (IETF, 32-битный counter)
  2^64 блоков x 64 байта = практически неограничено (оригинал)
```

### Состояние ChaCha20: матрица 4x4

```
ChaCha20 оперирует состоянием из 16 слов по 32 бита (512 бит):

┌────────────────┬────────────────┬────────────────┬────────────────┐
│   "expa"       │   "nd 3"       │   "2-by"       │   "te k"       │
│   константа    │   константа    │   константа    │   константа    │
├────────────────┼────────────────┼────────────────┼────────────────┤
│   Key[0]       │   Key[1]       │   Key[2]       │   Key[3]       │
│   (байты 0-3)  │   (байты 4-7)  │  (байты 8-11)  │ (байты 12-15)  │
├────────────────┼────────────────┼────────────────┼────────────────┤
│   Key[4]       │   Key[5]       │   Key[6]       │   Key[7]       │
│ (байты 16-19)  │ (байты 20-23)  │ (байты 24-27)  │ (байты 28-31)  │
├────────────────┼────────────────┼────────────────┼────────────────┤
│   Counter      │   Nonce[0]     │   Nonce[1]     │   Nonce[2]     │
│   (32 бита)    │   (байты 0-3)  │   (байты 4-7)  │  (байты 8-11)  │
└────────────────┴────────────────┴────────────────┴────────────────┘

Константа "expa nd 3 2-by te k" = "expand 32-byte k" (ASCII)
Это magic number от Бернштейна, обеспечивает фиксированную инициализацию.
```

### Quarter Round: строительный блок

```
Вся нелинейность ChaCha20 строится из одной операции - четвертьраунда.
Использует только ARX: Addition (сложение), Rotation (вращение), XOR.

QuarterRound(a, b, c, d):
  a += b;  d ^= a;  d <<<= 16;
  c += d;  b ^= c;  b <<<= 12;
  a += b;  d ^= a;  d <<<= 8;
  c += d;  b ^= c;  b <<<= 7;

Все операции на 32-битных беззнаковых словах (mod 2^32).
<<< = циклический сдвиг влево (rotation).

Преимущество ARX:
- Нет таблиц -> нет cache-timing атак
- Константное время исполнения на любой платформе
- Эффективен на 32-битных процессорах без специальных инструкций
```

### Полный раунд ChaCha20

```
Один раунд = 4 операции QuarterRound:

Столбцовый раунд (column round):
  QR(0, 4,  8, 12)   QR(1, 5,  9, 13)
  QR(2, 6, 10, 14)   QR(3, 7, 11, 15)

Диагональный раунд (diagonal round):
  QR(0, 5, 10, 15)   QR(1, 6, 11, 12)
  QR(2, 7,  8, 13)   QR(3, 4,  9, 14)

Два QR подряд = "двойной раунд" (double round).
ChaCha20 = 10 двойных раундов = 20 QR итого.

После 20 раундов: добавляем исходное состояние (add initial state):
  output = final_state + initial_state  (поэлементное сложение mod 2^32)

Это предотвращает инвертирование: зная output, нельзя найти key/nonce.
```

### Генерация keystream

```
Для шифрования блока данных:
  1. Инициализировать состояние (константы + key + counter + nonce)
  2. Выполнить 20 раундов (10 двойных)
  3. Добавить исходное состояние
  4. Сериализовать в 64 байта keystream (little-endian)
  5. XOR с блоком открытого текста

  Ciphertext[i..i+64] = Plaintext[i..i+64] XOR Keystream(counter=i/64)

Для следующего блока: увеличить counter на 1, повторить.
Параллельность: блоки независимы -> полный параллелизм.

Произвольный доступ:
  Чтобы расшифровать байт с позиции N:
  counter = N // 64
  offset  = N % 64
  keystream_block = ChaCha20_block(key, nonce, counter)
  plaintext_byte  = ciphertext_byte XOR keystream_block[offset]
```

```python
# Упрощённая реализация ChaCha20 для понимания
import struct

def rotl32(v, n):
    """Циклический сдвиг влево 32-битного слова"""
    return ((v << n) | (v >> (32 - n))) & 0xFFFFFFFF

def quarter_round(state, a, b, c, d):
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = rotl32(state[d], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = rotl32(state[b], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = rotl32(state[d],  8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = rotl32(state[b],  7)

def chacha20_block(key: bytes, counter: int, nonce: bytes) -> bytes:
    """Генерация одного 64-байтного блока keystream"""
    # Константы "expand 32-byte k"
    constants = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]

    # Ключ: 8 слов по 32 бита (little-endian)
    key_words = list(struct.unpack('<8I', key))

    # Nonce: 3 слова по 32 бита (IETF, 96-битный nonce)
    nonce_words = list(struct.unpack('<3I', nonce))

    # Начальное состояние
    state = constants + key_words + [counter] + nonce_words

    # Рабочая копия
    working = state[:]

    # 20 раундов (10 двойных)
    for _ in range(10):
        # Столбцовый раунд
        quarter_round(working, 0, 4,  8, 12)
        quarter_round(working, 1, 5,  9, 13)
        quarter_round(working, 2, 6, 10, 14)
        quarter_round(working, 3, 7, 11, 15)
        # Диагональный раунд
        quarter_round(working, 0, 5, 10, 15)
        quarter_round(working, 1, 6, 11, 12)
        quarter_round(working, 2, 7,  8, 13)
        quarter_round(working, 3, 4,  9, 14)

    # Добавить исходное состояние
    output = [(working[i] + state[i]) & 0xFFFFFFFF for i in range(16)]

    # Сериализовать в байты (little-endian)
    return struct.pack('<16I', *output)

def chacha20_encrypt(key: bytes, nonce: bytes, plaintext: bytes, counter: int = 0) -> bytes:
    """Шифрование/дешифрование ChaCha20"""
    ciphertext = bytearray()
    for i in range(0, len(plaintext), 64):
        block = plaintext[i:i+64]
        keystream = chacha20_block(key, counter + i // 64, nonce)
        ciphertext += bytes(p ^ k for p, k in zip(block, keystream))
    return bytes(ciphertext)
```

---

## Poly1305: MAC аутентификации

### Происхождение и идея

```
Poly1305 (Бернштейн, 2005) - одноразовый MAC (one-time MAC).
"Одноразовый" означает: ключ используется только для ОДНОГО сообщения.

В паре с ChaCha20 это достигается автоматически:
ChaCha20 генерирует уникальный 32-байтный ключ для Poly1305
из первого блока keystream (counter=0).

Математическая основа:
  Poly1305 вычисляет полином над полем GF(2^130 - 5).
  Сообщение разбивается на 16-байтные блоки.
  Каждый блок - коэффициент полинома.
  Вычисляется P(r) mod (2^130 - 5), затем добавляется s.

Параметры:
  Ключ:     256 бит (32 байта) = r (128 бит) + s (128 бит)
  Тег:      128 бит (16 байт)
  Скорость: очень высокая (нет S-box, только сложение и умножение)
```

### Математика Poly1305

```
Ключ разбивается на две части:
  r = первые 16 байт (с применением clamp)
  s = последние 16 байт

Clamp r (обнуление определённых битов для эффективной реализации):
  r[3]  &= 0x0F
  r[7]  &= 0x0F
  r[11] &= 0x0F
  r[15] &= 0x0F
  r[4]  &= 0xFC
  r[8]  &= 0xFC
  r[12] &= 0xFC

Обработка сообщения (блок за блоком):
  acc = 0
  for each 16-byte block m_i:
      n_i = little_endian_integer(m_i) + 2^(8*len(m_i))  # добавляем старший бит
      acc = (acc + n_i) * r mod (2^130 - 5)

  tag = (acc + s) mod 2^128

Результат: 16-байтный тег аутентификации.
```

### Почему 2^130 - 5?

```
2^130 - 5 - простое число Мерсенна (почти).
Арифметика по модулю этого числа очень эффективна:
  2^130 ≡ 5 (mod p)
  Редукция: x mod p = (x >> 130) * 5 + (x & (2^130 - 1))

Это позволяет реализовать умножение эффективно без деления.
На 64-битных процессорах: 3 умножения 64x64 бит для одного блока.

Безопасность:
  Если r случаен (что обеспечивает ChaCha20), Poly1305
  является информационно-теоретически безопасным MAC:
  вероятность подделки <= (length/16 + 1) / 2^102
```

```python
def poly1305_mac(key: bytes, message: bytes) -> bytes:
    """
    Упрощённая реализация Poly1305 для понимания алгоритма.
    В продакшене используйте Crypto.Hash.Poly1305 или nacl.
    """
    assert len(key) == 32

    # Clamp r
    r = bytearray(key[:16])
    r[3]  &= 0x0F; r[7]  &= 0x0F; r[11] &= 0x0F; r[15] &= 0x0F
    r[4]  &= 0xFC; r[8]  &= 0xFC; r[12] &= 0xFC
    r = int.from_bytes(r, 'little')

    s = int.from_bytes(key[16:], 'little')
    p = (1 << 130) - 5  # простое число поля

    acc = 0
    for i in range(0, len(message), 16):
        block = message[i:i+16]
        n = int.from_bytes(block, 'little') + (1 << (8 * len(block)))
        acc = (acc + n) * r % p

    tag = (acc + s) % (1 << 128)
    return tag.to_bytes(16, 'little')
```

---

## ChaCha20-Poly1305: сборка AEAD

### Протокол (RFC 8439)

```
Входные данные:
  key     = 256 бит (32 байта)
  nonce   = 96 бит (12 байт)
  aad     = дополнительные аутентифицируемые данные (любая длина)
  message = открытый текст (любая длина)

Шаг 1: генерация ключа Poly1305
  poly_key = ChaCha20_block(key, counter=0, nonce)[:32]
  (первые 32 байта первого keystream блока)

Шаг 2: шифрование данных
  ciphertext = ChaCha20_encrypt(key, nonce, message, counter=1)
  (counter начинается с 1 - блок 0 отдан Poly1305)

Шаг 3: формирование Poly1305 input
  Poly1305_input =
    AAD || pad16(AAD)        <- AAD выравнивается до 16 байт
    || ciphertext || pad16(ciphertext)  <- шифртекст выравнивается
    || len(AAD) as uint64 LE           <- длина AAD (8 байт little-endian)
    || len(ciphertext) as uint64 LE    <- длина CT (8 байт little-endian)

  pad16(x): добавляем нули чтобы длина стала кратна 16
  (если уже кратна 16 - паддинг не добавляется)

Шаг 4: вычисление тега
  tag = Poly1305_MAC(poly_key, Poly1305_input)

Вывод: ciphertext || tag (16 байт)
```

```
Визуальная схема:

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

Передаём получателю: Ciphertext || Tag
AAD передаётся открыто (например, заголовки пакетов)
```

### Дешифрование и верификация

```
Получатель имеет: key, nonce, aad, ciphertext, tag

1. Сгенерировать poly_key = ChaCha20_block(key, 0, nonce)[:32]
2. Вычислить expected_tag = Poly1305_MAC(poly_key, построить input)
3. Сравнить tag == expected_tag (КОНСТАНТНОЕ ВРЕМЯ!)
   - Если не совпадает: ОТКЛОНИТЬ, не возвращать данные
   - Если совпадает: расшифровать

4. plaintext = ChaCha20_encrypt(key, nonce, ciphertext, counter=1)

КРИТИЧЕСКИ ВАЖНО: проверять тег ДО дешифрования.
Никогда не возвращать расшифрованные данные при неверном теге.
```

---

## Применение в Python

### Базовое использование (PyCryptodome)

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os

key   = os.urandom(32)   # 256-битный ключ
nonce = os.urandom(12)   # 96-битный nonce (IETF)

# Шифрование
plaintext = b"Secret message that needs AEAD protection"
aad       = b"version=1;user_id=42"  # аутентифицируется, не шифруется

cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher.update(aad)
ciphertext, tag = cipher.encrypt_and_digest(plaintext)

print(f"Key:        {key.hex()}")
print(f"Nonce:      {nonce.hex()}")
print(f"AAD:        {aad}")
print(f"Ciphertext: {ciphertext.hex()}")
print(f"Tag:        {tag.hex()}")  # всегда 16 байт

# Дешифрование
cipher2 = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher2.update(aad)
try:
    recovered = cipher2.decrypt_and_verify(ciphertext, tag)
    print(f"Recovered:  {recovered}")
except ValueError:
    print("Ошибка: тег не совпадает - данные повреждены или подделаны!")

# Демонстрация обнаружения подделки
tampered = bytearray(ciphertext)
tampered[0] ^= 0xFF
cipher3 = ChaCha20_Poly1305.new(key=key, nonce=nonce)
cipher3.update(aad)
try:
    cipher3.decrypt_and_verify(bytes(tampered), tag)
except ValueError:
    print("Подделка обнаружена!")  # всегда сработает
```

### Базовое использование (PyNaCl)

```python
import nacl.secret
import nacl.utils

# nacl использует 24-байтный nonce (XSalsa20-Poly1305)
key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)  # 32 байта
box = nacl.secret.SecretBox(key)

# Шифрование (nonce генерируется автоматически и включается в вывод)
message = b"Hello, NaCl!"
encrypted = box.encrypt(message)  # nonce (24) + ciphertext + tag

# Дешифрование
decrypted = box.decrypt(encrypted)
print(decrypted)  # b'Hello, NaCl!'

# Явное управление nonce
nonce = nacl.utils.random(nacl.secret.SecretBox.NONCE_SIZE)  # 24 байта
encrypted = box.encrypt(message, nonce)
decrypted = box.decrypt(encrypted)
```

### Шифрование файла

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os, struct

def encrypt_file(key: bytes, inpath: str, outpath: str, aad: bytes = b"") -> None:
    """ChaCha20-Poly1305 шифрование файла"""
    nonce = os.urandom(12)

    with open(inpath, 'rb') as f:
        plaintext = f.read()

    cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce)
    if aad:
        cipher.update(aad)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    with open(outpath, 'wb') as f:
        # Формат: [nonce 12][tag 16][aad_len 4][aad][ciphertext]
        aad_len = struct.pack('<I', len(aad))
        f.write(nonce + tag + aad_len + aad + ciphertext)
    print(f"Зашифровано: {len(plaintext)} байт -> {outpath}")

def decrypt_file(key: bytes, inpath: str, outpath: str) -> None:
    """ChaCha20-Poly1305 дешифрование файла"""
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
        raise ValueError("Файл повреждён или подделан - дешифрование отклонено")

    with open(outpath, 'wb') as f:
        f.write(plaintext)
    print(f"Расшифровано: {len(plaintext)} байт -> {outpath}")

# Использование
key = os.urandom(32)
encrypt_file(key, "secret.pdf", "secret.enc", aad=b"metadata:v1")
decrypt_file(key, "secret.enc", "recovered.pdf")
```

### Потоковое шифрование (большие файлы)

```python
from Crypto.Cipher import ChaCha20_Poly1305
import os

CHUNK_SIZE = 64 * 1024  # 64 КБ чанки

def encrypt_stream(key: bytes, inpath: str, outpath: str) -> None:
    """
    Потоковое шифрование больших файлов.
    Каждый чанк шифруется отдельным nonce.
    Порядок чанков аутентифицируется через AAD с номером чанка.
    """
    with open(inpath, 'rb') as fin, open(outpath, 'wb') as fout:
        file_nonce = os.urandom(8)  # базовый nonce файла
        fout.write(file_nonce)

        chunk_num = 0
        while True:
            chunk = fin.read(CHUNK_SIZE)
            if not chunk:
                break

            # Уникальный nonce для каждого чанка: file_nonce + chunk_number
            chunk_nonce = file_nonce + chunk_num.to_bytes(4, 'big')
            aad = chunk_num.to_bytes(8, 'big')  # номер чанка как AAD

            cipher = ChaCha20_Poly1305.new(key=key, nonce=chunk_nonce)
            cipher.update(aad)
            ct, tag = cipher.encrypt_and_digest(chunk)

            # Формат чанка: [len(ct) 4][tag 16][ct]
            fout.write(len(ct).to_bytes(4, 'big'))
            fout.write(tag)
            fout.write(ct)
            chunk_num += 1

    print(f"Зашифровано {chunk_num} чанков")
```

---

## XChaCha20-Poly1305

### Зачем расширенный nonce

```
ChaCha20-Poly1305 (IETF): nonce = 96 бит
При случайном nonce: birthday bound при 2^48 сообщениях (~281 триллион).
Это достаточно для большинства приложений.

Но если нужно шифровать случайным nonce много сообщений
(миллиарды) без риска коллизии - нужен больший nonce.

XChaCha20-Poly1305: nonce = 192 бит (24 байта)
Birthday bound: 2^96 сообщений - практически неограничено.
```

### HChaCha20: субключ из nonce

```
XChaCha20 использует расширение HChaCha20:
  subkey = HChaCha20(key, nonce[:16])
  XChaCha20_encrypt(subkey, nonce[16:] || 0^32, message)

HChaCha20 - это первые и последние 4 слова ChaCha20 блока
(без добавления исходного состояния).

Это позволяет безопасно использовать 24-байтный nonce:
Первые 16 байт nonce -> деривация субключа
Последние 8 байт    -> nonce для ChaCha20 с субключем

Итог: XChaCha20-Poly1305 безопасен при случайном nonce
даже при миллиардах сообщений.
```

```python
# XChaCha20-Poly1305 через libsodium (PyNaCl)
import nacl.secret
import nacl.utils

key = nacl.utils.random(32)
box = nacl.secret.SecretBox(key)

# PyNaCl использует XSalsa20-Poly1305 (аналог XChaCha20)
# 24-байтный nonce генерируется автоматически
message = b"Long-lived secret with many messages"
encrypted = box.encrypt(message)   # автоматически безопасный nonce
decrypted = box.decrypt(encrypted)

# Для XChaCha20-Poly1305 напрямую: cryptography library
from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
import os

key   = os.urandom(32)
nonce = os.urandom(24)   # 24 байта = 192 бита!

xcha = XChaCha20Poly1305(key)
ct   = xcha.encrypt(nonce, b"plaintext", b"aad")
pt   = xcha.decrypt(nonce, ct, b"aad")
print(pt)  # b'plaintext'
```

---

## Сравнение с AES-GCM

```
Характеристика         ChaCha20-Poly1305      AES-256-GCM
--------------------   ------------------     ----------------
Тип шифра              Потоковый (ARX)        Блочный (SPN)
Размер ключа           256 бит                256 бит
Размер nonce           96 бит (IETF)          96 бит
Размер тега            128 бит                128 бит
Аппаратное ускор.      Нет (но быстр и так)   AES-NI (Intel/AMD)
Без AES-NI             ~400 МБ/с              ~50 МБ/с
С AES-NI               ~1-2 ГБ/с              ~4 ГБ/с
Cache-timing атаки     Невозможны (ARX)       Риск (S-box таблицы)
Nonce reuse            CT утечка              CT + H утечка (хуже)
Параллельность         Да (блоки независимы)  Да (CTR основа)
Случайный доступ       Да (counter)           Да (counter)
Стандарты              RFC 8439, TLS 1.3      NIST SP 800-38D, TLS 1.3
Применение             Мобильные, IoT, VPN    Серверы с AES-NI

Когда выбирать ChaCha20-Poly1305:
  - Устройства без AES-NI (ARM, MIPS, embedded)
  - Нужна защита от cache-timing атак
  - Мобильные приложения (Android, iOS)
  - WireGuard, OpenSSH
  - Когда производительность важна без AES-NI

Когда выбирать AES-GCM:
  - Серверы с AES-NI (x86_64)
  - Нужна максимальная скорость на desktop/server
  - FIPS 140-2/3 compliance (ChaCha20 не в FIPS пока)
  - Стандарты требуют AES (PCI DSS, банки)
```

---

## Применение в реальных протоколах

### TLS 1.3

```
RFC 8446 определяет три обязательных cipher suite:
  TLS_AES_128_GCM_SHA256
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256   <- наш алгоритм

Nonce в TLS 1.3:
  - Базовый IV (12 байт) генерируется при handshake
  - XOR с sequence number записи (64 бита, расширенным до 12 байт)
  - Sequence number: 0, 1, 2, ... (никогда не повторяется в сессии)
  - Nonce = IV XOR (0^32 || sequence_number)

Выбор алгоритма в TLS 1.3:
  Сервер может указать предпочтение через порядок cipher suites.
  Клиент (браузер, curl) выбирает ChaCha20 если нет AES-NI.
  Сервер на x86_64 с AES-NI обычно предпочитает AES-GCM.

Проверить какой cipher использует соединение:
  openssl s_client -connect example.com:443 2>/dev/null | grep Cipher
```

### WireGuard

```
WireGuard использует ChaCha20-Poly1305 как ЕДИНСТВЕННЫЙ шифр.
Нет negotiation, нет agility - только один правильный выбор.

Почему только ChaCha20-Poly1305:
  "Algorithm agility is the enemy of security"
  Нет возможности downgrade attack.
  Нет слабых cipher суites.
  Простота реализации -> меньше ошибок.

Nonce в WireGuard:
  64-битный счётчик пакетов (увеличивается на 1 для каждого пакета)
  Никогда не повторяется для данного ключа сессии.
  Ключи сессии ротируются (Noise protocol, ECDH).

Handshake: Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s
  X25519 (ECDH) + ChaCha20-Poly1305 + BLAKE2s
```

### OpenSSH

```
OpenSSH 6.5+ (2014): добавлен chacha20-poly1305@openssh.com
OpenSSH 9.0 (2022): сделан приоритетным по умолчанию

Особенность реализации OpenSSH:
  Два ключа ChaCha20: один для длины пакета, один для данных.
  Это защищает метаданные о размере пакета.

  header_key = ChaCha20(K_header, nonce)  <- шифрует packet_length
  main_key   = ChaCha20(K_main,   nonce)  <- шифрует payload
  tag        = Poly1305(poly_key, encrypted_length || encrypted_payload)

Конфигурация:
  # Приоритет chacha20 в сервере:
  Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com

  # Проверить что используется:
  ssh -vv user@host 2>&1 | grep "cipher:"
```

### QUIC и HTTP/3

```
QUIC (RFC 9000) использует TLS 1.3 для шифрования.
ChaCha20-Poly1305 поддерживается через TLS_CHACHA20_POLY1305_SHA256.

Особенность QUIC:
  Packet number используется как часть nonce.
  Header encryption: отдельный ключ для шифрования заголовков пакетов
  (чтобы скрыть packet number от промежуточных узлов).

  HP_key (header protection key) = HKDF_expand(secret, "quic hp", 32)
  mask = ChaCha20(HP_key, nonce=sample_of_ciphertext)
  encrypted_header = header XOR mask[:4]  (первые 4 байта маски)
```

---

## Безопасность и ограничения

### Безопасность

```
Доказанная безопасность ChaCha20:
  Основана на предположении о псевдослучайности функции ChaCha20.
  При 20 раундах нет известных атак лучше brute force (2^256).
  7-раундовый ChaCha7 имеет теоретические атаки - 20 раундов в запасе.

Безопасность Poly1305:
  Информационно-теоретически безопасен (one-time MAC).
  Вероятность подделки для сообщения длиной L байт:
    Pr[forgery] <= ceil(L/16 + 1) / 2^102
  При L = 1 МБ (65536 блоков): ~65537 / 2^102 = ничтожно мало.

Криптоанализ ChaCha20 (что известно):
  Лучшая атака на ChaCha20 (256-битный ключ): нет известных атак.
  ChaCha7: differential cryptanalysis (теоретическая).
  ChaCha12: безопасен с большим запасом.
  ChaCha20: 20 раундов - в 2.8x больше чем нужно для безопасности.
```

### Ограничения

```
1. Nonce reuse:
   (Key, Nonce) повтор -> утечка XOR открытых текстов.
   Менее катастрофично чем GCM (H не раскрывается),
   но всё равно: НИКОГДА не повторять (Key, Nonce).

2. Максимальный объём данных на (Key, Nonce):
   IETF (96-bit nonce): 2^32 * 64 = 256 ГБ.
   Практически: это ограничение никогда не достигается в нормальных сценариях.

3. Poly1305 - одноразовый:
   Ключ Poly1305 (poly_key) используется ровно для одного сообщения.
   Если бы poly_key повторился: злоумышленник мог бы подделать тег.
   ChaCha20 гарантирует уникальность poly_key при уникальном (Key, Nonce).

4. Нет FIPS сертификации (пока):
   ChaCha20-Poly1305 не входит в FIPS 140-2/3 approved algorithms.
   Для систем требующих FIPS: использовать AES-GCM.
   (В 2024 обсуждается включение в FIPS - ситуация меняется)

5. Нет аппаратного ускорения в большинстве CPU:
   Нет инструкций типа AES-NI.
   ARM Neon, x86 AVX2 - SIMD ускоряет, но нет специализированных.
   На серверных CPU с AES-NI: AES-GCM быстрее.
```

---

## Производительность

### Бенчмарки

```python
import time
import os
from Crypto.Cipher import ChaCha20_Poly1305, AES

def benchmark_aead(name, encrypt_fn, data_size=100*1024*1024):
    """Бенчмарк AEAD алгоритма (100 МБ)"""
    data = os.urandom(data_size)
    aad  = b"benchmark-aad"

    start = time.perf_counter()
    encrypt_fn(data, aad)
    elapsed = time.perf_counter() - start

    speed = data_size / elapsed / 1024 / 1024
    print(f"{name:30s}: {speed:8.1f} МБ/с")

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

# Примерный вывод на ARM без AES-NI:
# ChaCha20-Poly1305             :    350.0 МБ/с
# AES-256-GCM                   :     45.0 МБ/с

# Примерный вывод на x86_64 с AES-NI:
# ChaCha20-Poly1305             :   1200.0 МБ/с
# AES-256-GCM                   :   3800.0 МБ/с
```

### SIMD оптимизации

```
ChaCha20 отлично параллелится через SIMD:

x86 SSE2/AVX2:
  4 или 8 блоков параллельно (4-way или 8-way vectorization)
  AVX2: ~3-4 ГБ/с (8 блоков параллельно)
  Сравнимо с AES-GCM на некоторых CPU

ARM NEON:
  4-way vectorization
  ~1-2 ГБ/с на современных ARM (Apple M1/M2, Cortex-A77+)

RISC-V V extension:
  Аналогичное ускорение через векторные инструкции

Реализации использующие SIMD:
  OpenSSL: chacha20_avx2 (автоматически)
  BoringSSL: аналогично
  Linux kernel: chacha20-avx2, chacha20-ssse3
```

---

## OpenSSL - практика

```bash
# Проверить поддержку ChaCha20-Poly1305
openssl ciphers -v 'CHACHA20'

# TLS с принудительным ChaCha20-Poly1305
openssl s_client -connect example.com:443 \
    -cipher 'TLS_CHACHA20_POLY1305_SHA256' \
    -tls1_3 2>/dev/null | grep Cipher

# Бенчмарк
openssl speed -evp chacha20-poly1305
openssl speed -evp aes-256-gcm
openssl speed -evp aes-128-gcm

# Шифрование файла через ChaCha20 (без Poly1305 - не AEAD!)
# Для полного AEAD используйте Python или другой API

# Проверить cipher в nginx
openssl s_client -connect myserver.com:443 2>/dev/null | grep "Cipher is"

# nginx.conf: включить ChaCha20 с приоритетом для мобильных клиентов
# ssl_ciphers 'TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256';

# WireGuard - просто настроить интерфейс, ChaCha20-Poly1305 используется автоматически
wg show  # показать статус и используемые ключи
```

---

## Распространённые ошибки

```
1. Повторение nonce с тем же ключом
   Плохо:  nonce = b'\x00' * 12  # фиксированный nonce
   Хорошо: nonce = os.urandom(12)  # случайный

2. Не проверять тег перед использованием данных
   Плохо:  plaintext = cipher.decrypt(ciphertext)  # без verify!
   Хорошо: plaintext = cipher.decrypt_and_verify(ciphertext, tag)

3. Использовать ChaCha20 без Poly1305 (только шифрование)
   ChaCha20 без MAC не защищает от подделки.
   Всегда использовать ChaCha20-Poly1305 вместе.

4. Сравнивать теги небезопасным способом
   Плохо:  received_tag == computed_tag  # timing attack!
   Хорошо: hmac.compare_digest(received_tag, computed_tag)

5. XChaCha20 vs ChaCha20: перепутать размер nonce
   ChaCha20-Poly1305 (IETF): 12 байт nonce
   XChaCha20-Poly1305:        24 байта nonce
   Перепутать -> неправильная инициализация -> уязвимость

6. Повторное использование poly_key
   poly_key генерируется автоматически из key+nonce.
   Никогда не передавать poly_key вручную между сообщениями.
```

---

## Шпаргалка

```
Параметры:
  Ключ:   32 байта (256 бит)
  Nonce:  12 байт (96 бит) IETF / 24 байта (192 бит) XChaCha20
  Тег:    16 байт (128 бит)
  Макс:   256 ГБ на (key, nonce) [IETF]

Алгоритм:
  poly_key   = ChaCha20_block(key, counter=0, nonce)[:32]
  ciphertext = ChaCha20(key, counter=1, nonce, plaintext)
  tag        = Poly1305(poly_key, AAD || CT || lengths)

ChaCha20 внутри:
  Состояние:  4 константы + 8 ключевых слов + 1 counter + 3 nonce слова
  Quarter Round: a+=b; d^=a; d<<<16; c+=d; b^=c; b<<<12; ...
  Раунды: 10 двойных = 20 QuarterRound вызовов
  Вывод:  state + initial_state (сложение mod 2^32)

Poly1305 внутри:
  Поле: GF(2^130 - 5)
  acc = sum((m_i + 2^len) * r^i) mod p
  tag = (acc + s) mod 2^128

Выбор алгоритма:
  Без AES-NI (ARM, IoT): ChaCha20-Poly1305
  С AES-NI (x86_64):     AES-256-GCM (быстрее)
  Нужен FIPS:            AES-256-GCM (ChaCha20 не в FIPS)
  WireGuard/SSH:         ChaCha20-Poly1305 (единственный вариант в WG)

Nonce стратегии:
  Случайный 12 байт: безопасен до ~2^32 сообщений на ключ
  Счётчик 12 байт:   безопасен пока не переполняется
  XChaCha20 24 байт: случайный, безопасен до ~2^96 сообщений

Команды:
  openssl speed -evp chacha20-poly1305   # бенчмарк
  openssl ciphers -v 'CHACHA20'          # доступные суиты
  wg show                                 # WireGuard статус
```

---

## Ссылки

- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) - ChaCha20 и Poly1305 для TLS (2018)
- [RFC 7539](https://www.rfc-editor.org/rfc/rfc7539) - предыдущая версия стандарта (2015)
- [Оригинальная статья ChaCha (Bernstein, 2008)](https://cr.yp.to/chacha/chacha-20080128.pdf)
- [Оригинальная статья Poly1305 (Bernstein, 2005)](https://cr.yp.to/mac/poly1305-20050329.pdf)
- [RFC 8448](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [WireGuard paper](https://www.wireguard.com/papers/wireguard.pdf) - применение ChaCha20-Poly1305
- [Bernstein's website cr.yp.to](https://cr.yp.to/) - оригинальные материалы
- [XChaCha20 (draft)](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
