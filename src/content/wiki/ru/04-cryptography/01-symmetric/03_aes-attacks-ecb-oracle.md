---
title: "AES - атаки на слабые режимы (ECB oracle)"
date: "2026-05-15"
---

ECB oracle - класс атак, при которых злоумышленник использует доступ к шифрующей функции (оракулу) для побайтового восстановления секретных данных без знания ключа. Атаки возможны из-за фундаментального свойства ECB: одинаковый открытый текст всегда даёт одинаковый шифртекст.

---

## Почему ECB уязвим

```
ECB (Electronic Codebook) шифрует каждый 16-байтный блок независимо:

Ci = AES_K(Pi)

Главная проблема - детерминированность:
P = P'  =>  AES_K(P) = AES_K(P')

Если злоумышленник контролирует часть входа оракула,
он может манипулировать границами блоков и узнавать секрет побайтово.

Нет ни диффузии между блоками, ни рандомизации (нет IV, нет nonce).
Каждый блок - изолированная, предсказуемая операция.
```

---

## Byte-at-a-time ECB decryption (простой вариант)

### Схема атаки

```
Оракул делает следующее:
  Ciphertext = AES_ECB_K(Attacker_Input || Secret)

Злоумышленник контролирует Attacker_Input.
Secret - неизвестные байты, которые нужно восстановить.

Ключевая идея:
Подбираем Attacker_Input так, чтобы один байт Secret
попал в конец известного нам блока.
Затем перебираем все 256 значений этого байта
и сравниваем шифртекст.
```

### Шаг 1: определить размер блока

```python
def detect_block_size(oracle):
    """Определяем размер блока AES оракула"""
    initial_len = len(oracle(b""))
    for i in range(1, 64):
        ct = oracle(b"A" * i)
        if len(ct) > initial_len:
            # Размер блока = разница в длине
            return len(ct) - initial_len
    return None

# block_size = 16 (всегда для AES)
```

### Шаг 2: подтвердить ECB режим

```python
def detect_ecb(oracle, block_size):
    """Два одинаковых блока -> ECB"""
    ct = oracle(b"A" * block_size * 2)
    blocks = [ct[i:i+block_size] for i in range(0, len(ct), block_size)]
    return len(blocks) != len(set(blocks))  # True если ECB

# В ECB: два блока "AAAA...AAAA" дают одинаковый шифртекст
```

### Шаг 3: восстановить первый байт секрета

```
Оракул: AES_ECB_K(input || secret)

Подаём 15 байт 'A':  AES_ECB_K("AAAAAAAAAAAAAAA" || secret[0] || ...)
                                 └──── блок 1 ─────────────────────┘

Первый блок = AES_K("AAAAAAAAAAAAAAA" + secret[0])

Теперь перебираем все 256 значений x:
AES_ECB_K("AAAAAAAAAAAAAAA" + chr(x))
                               └── целевой блок

Когда шифртекст первого блока совпадёт - мы нашли secret[0].
```

```python
def recover_byte(oracle, known_bytes, block_size):
    """Восстановить следующий байт секрета"""
    # Сколько байт паддинга нужно чтобы secret[len(known)] оказался
    # последним байтом в блоке
    pad_len = block_size - (len(known_bytes) % block_size) - 1
    padding = b"A" * pad_len

    # Какой блок нас интересует
    block_index = len(known_bytes) // block_size
    block_start = block_index * block_size
    block_end   = block_start + block_size

    # Целевой шифртекст (с одним неизвестным байтом в конце блока)
    target_ct = oracle(padding)[block_start:block_end]

    # Перебираем все 256 значений
    for byte_val in range(256):
        candidate = padding + known_bytes + bytes([byte_val])
        ct = oracle(candidate)[block_start:block_end]
        if ct == target_ct:
            return bytes([byte_val])

    return None

def full_ecb_attack(oracle, block_size):
    """Полное восстановление секрета"""
    secret_len = len(oracle(b""))  # приблизительно
    known = b""

    while True:
        byte = recover_byte(oracle, known, block_size)
        if byte is None:
            break
        known += byte
        print(f"[+] Восстановлено {len(known)} байт: {known}")

    return known
```

### Демонстрация полной атаки

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import os

# Симуляция уязвимого оракула
KEY    = os.urandom(16)
SECRET = b"SuperSecretData!"  # то что нужно восстановить

def vulnerable_oracle(attacker_input: bytes) -> bytes:
    plaintext = attacker_input + SECRET
    cipher = AES.new(KEY, AES.MODE_ECB)
    return cipher.encrypt(pad(plaintext, 16))

# Атака
block_size = detect_block_size(vulnerable_oracle)
print(f"Размер блока: {block_size}")

is_ecb = detect_ecb(vulnerable_oracle, block_size)
print(f"ECB режим: {is_ecb}")

recovered = full_ecb_attack(vulnerable_oracle, block_size)
print(f"Восстановлено: {recovered}")
# Восстановлено: b'SuperSecretData!'
```

---

## Byte-at-a-time ECB decryption (сложный вариант)

### Когда перед секретом есть случайный префикс

```
Оракул: AES_ECB_K(Random_Prefix || Attacker_Input || Secret)

Random_Prefix генерируется один раз при старте сервера (константный).
Его длина неизвестна.

Задача усложняется: нужно сначала "выровнять" префикс до границы блока.
```

```python
def find_prefix_length(oracle, block_size):
    """Определить длину случайного префикса"""
    # Шлём два разных набора - ищем первый различающийся блок
    ct1 = oracle(b"A" * block_size * 2)
    ct2 = oracle(b"B" * block_size * 2)

    blocks1 = [ct1[i:i+block_size] for i in range(0, len(ct1), block_size)]
    blocks2 = [ct2[i:i+block_size] for i in range(0, len(ct2), block_size)]

    # Найти первый блок где они расходятся
    prefix_block = 0
    for i, (b1, b2) in enumerate(zip(blocks1, blocks2)):
        if b1 != b2:
            prefix_block = i
            break

    # Найти точный байт - добавляем паддинг пока два целевых блока не станут одинаковы
    for pad_len in range(block_size):
        ct = oracle(b"A" * (pad_len + block_size * 2))
        blocks = [ct[i:i+block_size] for i in range(0, len(ct), block_size)]
        if blocks[prefix_block] == blocks[prefix_block + 1]:
            prefix_len = prefix_block * block_size - pad_len
            return prefix_len, pad_len

    return None, None

def attack_with_prefix(oracle, block_size):
    """ECB атака при наличии случайного префикса"""
    prefix_len, align_pad = find_prefix_length(oracle, block_size)
    print(f"Длина префикса: {prefix_len}, выравнивающий паддинг: {align_pad}")

    # Теперь действуем как в простом варианте,
    # но всегда добавляем align_pad байт в начало нашего ввода
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

## ECB Cut-and-Paste атака

### Идея

```
Злоумышленник перестановкой блоков шифртекста создаёт
новое "сообщение" с другим смыслом.
ECB позволяет это, потому что блоки независимы.
```

### Сценарий: повышение привилегий

```
Сервер шифрует профиль пользователя в ECB:
profile = "email=user@mail.com&role=user"

Шифруется блоками по 16 байт:
Блок 0: "email=user@mail."
Блок 1: "com&role=user\x03\x03\x03"

Цель: создать профиль с role=admin.
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os
import urllib.parse

KEY = os.urandom(16)

def profile_for(email: str) -> bytes:
    """Создать зашифрованный профиль"""
    # Убираем & и = из email (фильтрация)
    email = email.replace("&", "").replace("=", "")
    profile = f"email={email}&role=user"
    cipher = AES.new(KEY, AES.MODE_ECB)
    return cipher.encrypt(pad(profile.encode(), 16))

def parse_profile(ciphertext: bytes) -> dict:
    """Расшифровать профиль"""
    cipher = AES.new(KEY, AES.MODE_ECB)
    plaintext = unpad(cipher.decrypt(ciphertext), 16).decode()
    return dict(urllib.parse.parse_qsl(plaintext))

# Атака:
# Шаг 1: создать блок с "admin" + PKCS7 паддинг
# "email=AAAAAAAAAA" | "admin\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b" | "&role=user..."
#  блок 0 (16 байт)      блок 1 (16 байт)

crafted_email_1 = "A" * 10 + "admin" + "\x0b" * 11
ct1 = profile_for(crafted_email_1)
admin_block = ct1[16:32]  # блок 1 содержит "admin" с паддингом

# Шаг 2: создать профиль где "user" находится РОВНО в начале блока
# "email=user@mai" | "l.com&role=user" -> нет, нужно подобрать длину
# "email=" (6) + email + "&role=user" (10) = нужно чтобы "user" начинался с блока

# "email=AAAAAAAAAA&role=" - ровно 22 байта = 1.375 блока
# нам нужно 2 полных блока до "user"
# email=<14 байт>&role=<u>  -> email нужен ровно 13 символов
crafted_email_2 = "user@mail.com"  # 13 символов
# "email=user@mai" | "l.com&role=use" | "r\x01" ...
# нет, пробуем: нам нужно "email=" (6) + N + "&role=" (6) = кратно 16
# 6 + N + 6 = 16 -> N = 4 => email = "AAAA"
# "email=AAAA&rol" | "e=user\x0a\x0a..." - нет

# Проще: подбираем email так чтобы "role=" оканчивалось ровно в конце блока
# "email=" + email + "&role=" = k * 16  => len(email) = k*16 - 12
# k=2: len = 20, k=1: len = 4
email_len = 4  # "email=AAAA&role=" = 16 байт, ровно 1 блок!
crafted_email_2 = "A" * email_len
ct2 = profile_for(crafted_email_2)

# ct2 блоки:
# Блок 0: "email=AAAA&role"  <- не то, &role должна быть с =
# "email=" (6) + "AAAA" (4) + "&role=" (6) = 16 -> блок 0 = "email=AAAA&role="
# Блок 1: "user" + padding

# Финал: берём блоки 0 из ct2 и подставляем admin_block вместо блока с "user"
forged_ct = ct2[:32] + admin_block  # блок 0 + блок 1(role=) + блок с admin

parsed = parse_profile(forged_ct)
print(parsed)  # {'email': 'AAAA', 'role': 'admin'}
```

### Принцип в общем виде

```
ECB cut-and-paste работает потому что:
1. Блоки шифртекста независимы
2. Изменение одного блока не влияет на другие при дешифровании
3. Можно перестанавливать, дублировать, удалять блоки произвольно

Защита: использовать CBC или GCM - изменение любого блока
разрушает дешифрование всех последующих (CBC)
или не проходит проверку тега (GCM).
```

---

## Атака на основе паттернов ECB

### Визуальная атака на изображения

```
Классический пример из учебников:

Шифрование bitmap-изображения (Linux Tux) в ECB:
- Пиксели одного цвета формируют одинаковые 16-байтные блоки
- ECB превращает каждый блок в одинаковый шифртекст
- Структура изображения сохраняется - очертания видны!

Что происходит в CBC/GCM:
- Даже одинаковые блоки открытого текста -> разный шифртекст
- Изображение выглядит как случайный шум

Это наглядно показывает: ECB не скрывает паттерны данных.
```

```python
from PIL import Image
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import os, struct

def encrypt_image_ecb(img_path: str, out_path: str):
    """Шифруем только пиксели, сохраняем заголовок"""
    img = Image.open(img_path)
    header = img.tobytes()[:54]  # BMP заголовок
    pixel_data = img.tobytes()[54:]

    key = os.urandom(16)
    cipher = AES.new(key, AES.MODE_ECB)
    encrypted_pixels = cipher.encrypt(pad(pixel_data, 16))

    # Сохраняем: оригинальный заголовок + зашифрованные пиксели
    # Структура изображения видна - паттерны сохраняются!
    with open(out_path, 'wb') as f:
        f.write(header + encrypted_pixels[:len(pixel_data)])
```

### Атака на зашифрованные логи в ECB

```
Сценарий: сервер логирует события в зашифрованном виде (ECB).
Формат: [timestamp 8 байт][user_id 4 байт][action 4 байт]

Блок = ровно 16 байт.

Наблюдение: если два блока шифртекста одинаковы ->
одно и то же событие (user + action) произошло дважды.

Атакующий может:
1. Определить, когда пользователь выполнял одинаковые действия
2. Подсчитать частоту событий по паттернам шифртекста
3. Восстановить последовательность действий без знания ключа

Это нарушение конфиденциальности даже без расшифровки!
```

---

## Padding Oracle Attack (на CBC)

### Суть атаки

```
CBC дешифрование:
Pi = AES_K^(-1)(Ci) XOR C(i-1)

Если сервер возвращает разные ошибки:
- "Неверный паддинг"  (padding error)
- "Неверные данные"   (logic error после успешного дешифрования)

Злоумышленник может побайтово восстановить открытый текст.
Ключ НЕ нужен.
```

### Механизм атаки (пошагово)

```
Цель: расшифровать блок C2, зная C1 и C2.

Шаг 1: восстановить последний байт P2[15]

  Модифицируем C1' = C1, изменяя последний байт C1[15]:
  C1'[15] = C1[15] XOR x  (перебираем x от 0 до 255)

  Отправляем [C1' || C2] серверу.
  Сервер дешифрует: P2' = AES_K^(-1)(C2) XOR C1'

  При каком x паддинг корректен?
  Если P2'[15] = 0x01 -> паддинг \x01 корректен!

  P2'[15] = 0x01
  AES_K^(-1)(C2)[15] XOR C1'[15] = 0x01
  AES_K^(-1)(C2)[15] = 0x01 XOR C1'[15]
                      = 0x01 XOR C1[15] XOR x

  Но мы знаем:
  P2[15] = AES_K^(-1)(C2)[15] XOR C1[15]
         = 0x01 XOR x   <- восстановлен!

Шаг 2: восстановить P2[14]

  Теперь нам нужен паддинг \x02\x02.
  Устанавливаем C1'[15] так, чтобы P2'[15] = 0x02:
  C1'[15] = AES_K^(-1)(C2)[15] XOR 0x02
           = (P2[15] XOR C1[15]) XOR 0x02

  Перебираем C1'[14] пока P2'[14] = 0x02.

  И так далее для каждого байта...
```

```python
def padding_oracle_attack(ciphertext: bytes, oracle_func, block_size: int = 16):
    """
    oracle_func(ct) -> True если паддинг корректен, False иначе
    Возвращает расшифрованный текст (без последнего блока - он IV или предыдущий CT)
    """
    blocks = [ciphertext[i:i+block_size]
              for i in range(0, len(ciphertext), block_size)]

    plaintext = b""

    # Атакуем каждый блок начиная со второго
    for block_idx in range(1, len(blocks)):
        ct_block   = blocks[block_idx]
        prev_block = blocks[block_idx - 1]

        # Промежуточные байты: AES_K^(-1)(ct_block)
        intermediate = bytearray(block_size)

        # Восстанавливаем байты с конца
        for byte_pos in range(block_size - 1, -1, -1):
            pad_byte = block_size - byte_pos  # нужный байт паддинга

            # Формируем C1' с уже известными промежуточными байтами
            c1_prime = bytearray(block_size)
            for k in range(byte_pos + 1, block_size):
                c1_prime[k] = intermediate[k] XOR pad_byte

            # Перебираем значение текущего байта
            found = False
            for guess in range(256):
                c1_prime[byte_pos] = guess
                crafted = bytes(c1_prime) + ct_block

                if oracle_func(crafted):
                    # Нашли! Вычисляем промежуточный байт
                    intermediate[byte_pos] = guess XOR pad_byte

                    # Проверка: убедимся что не ложное срабатывание (0x02 0x02 vs 0x01)
                    if byte_pos == block_size - 1:
                        # Дополнительная проверка: меняем byte_pos-1
                        if byte_pos > 0:
                            c1_prime[byte_pos - 1] ^= 1
                            if not oracle_func(bytes(c1_prime) + ct_block):
                                continue  # ложное срабатывание, продолжаем

                    found = True
                    break

            if not found:
                raise Exception(f"Не удалось найти байт {byte_pos} в блоке {block_idx}")

        # Восстанавливаем открытый текст через XOR с предыдущим блоком
        pt_block = bytes(a XOR b for a, b in zip(intermediate, prev_block))
        plaintext += pt_block
        print(f"[+] Блок {block_idx} расшифрован: {pt_block}")

    return plaintext
```

### Известные атаки на основе Padding Oracle

```
POODLE (2014) - Padding Oracle On Downgraded Legacy Encryption:
  Цель: SSL 3.0 + CBC
  Суть: злоумышленник вынуждает браузер делать 256 запросов
        для восстановления одного байта (MITM позиция)
  Результат: восстановление cookie сессии
  CVE: CVE-2014-3566

BEAST (2011) - Browser Exploit Against SSL/TLS:
  Цель: TLS 1.0 + CBC с предсказуемым IV
  Суть: IV следующего блока = последний блок предыдущего шифртекста
        (предсказуемый!) -> CPA атака
  CVE: CVE-2011-3389

Lucky 13 (2013):
  Цель: TLS + CBC + HMAC
  Суть: time-based padding oracle - разное время обработки
        корректного и некорректного паддинга (~2 мкс разница)
  Даже Encrypt-then-MAC не защищал из-за timing leak

ROBOT (2018) - Return Of Bleichenbacher's Oracle Threat:
  Цель: RSA PKCS#1 v1.5 key exchange в TLS
  19-летняя старая атака, найдена в 27 продуктах
  Включая Facebook, Citrix, F5, Cisco

Защита:
- TLS 1.3: нет CBC, нет RSA key exchange -> все эти атаки неприменимы
- Использовать AES-GCM вместо AES-CBC
- Constant-time паддинг проверка
```

---

## Bit-Flipping атака (на CBC)

### Как работает

```
CBC дешифрование:
Pi = AES_K^(-1)(Ci) XOR C(i-1)

Если изменить бит j в блоке C(i-1):
P_i[j] изменится соответствующим образом.

При этом блок P(i-1) будет случайным мусором (следствие изменения C(i-1)),
но P_i изменится предсказуемо.

Формула:
P_i_new[j] = P_i[j] XOR C(i-1)[j] XOR C(i-1)_modified[j]
           = P_i[j] XOR (оригинал XOR модификация)
```

### Практический пример

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt_userdata(userdata: str) -> bytes:
    """Шифрует данные пользователя"""
    # Экранируем ; и =
    userdata = userdata.replace(";", "%3B").replace("=", "%3D")
    plaintext = f"comment1=cooking%20MCs;userdata={userdata};comment2=%20like%20a%20pound%20of%20bacon"
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return cipher.encrypt(pad(plaintext.encode(), 16))

def is_admin(ciphertext: bytes) -> bool:
    """Проверяет наличие ;admin=true; в расшифрованном тексте"""
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    try:
        plaintext = unpad(cipher.decrypt(ciphertext), 16).decode(errors='replace')
        print(f"  Расшифровано: {plaintext}")
        return ";admin=true;" in plaintext
    except Exception:
        return False

# Исходная строка:
# "comment1=cooking%20MCs;userdata=" <- блок 0 + начало блока 1 (32 байта)
# ":admin<true:"                      <- наш ввод (хотим ;admin=true;)
# ";comment2=..."

# Подаём ":admin<true:" (с : вместо ; и < вместо =)
userdata = ":admin<true:"
ct = bytearray(encrypt_userdata(userdata))

# Блок 1 шифртекста влияет на блок 2 открытого текста при CBC дешифровании
# "comment1=cooking" = блок 0 (16 байт)
# "%20MCs;userdata=" = блок 1 (16 байт)
# ":admin<true:;co"  = блок 2 (начало нашего ввода)

# Нам нужно изменить блок 1 чтобы : -> ; и < -> = в блоке 2
# Позиция ':' в блоке 2: первый символ -> позиция 0 относительно блока 2
# Блок 1 в шифртексте: байты [16:32]

# ':' XOR ';' = 0x3A XOR 0x3B = 0x01
# '<' XOR '=' = 0x3C XOR 0x3D = 0x01

# Изменяем соответствующие байты в блоке 1 шифртекста:
ct[16] ^= ord(':') ^ ord(';')   # позиция 0 в блоке 2
ct[22] ^= ord('<') ^ ord('=')   # позиция 6 в блоке 2 (";admin" -> 6)
ct[27] ^= ord('<') ^ ord('=')   # позиция 11 в блоке 2 ("true<" -> 10, нет...)

# Проверяем
print(f"Admin: {is_admin(bytes(ct))}")
# Блок 1 открытого текста будет мусором, но блок 2 = ";admin=true;"
```

---

## IV Recovery атака (CBC)

### Когда IV предсказуем или повторяется

```
Стандартная атака: IV = ключу (неправильная реализация)

Если первый блок шифртекста одинаков для двух сообщений ->
одинаковый открытый текст + одинаковый IV.

Атака восстановления IV (если IV угадываем):
Знаем: C1 = AES_K(P1 XOR IV)
       P1 = AES_K^(-1)(C1) XOR IV

Если мы можем отправить C1 как первый блок нового сообщения
и знаем дешифрованное значение - получаем IV.
```

```python
def recover_iv(oracle_encrypt, oracle_decrypt, block_size=16):
    """
    Восстановление IV когда есть доступ к оракулу дешифрования
    и известен один блок открытого текста.

    Атака: отправляем [C1 || 0...0 || C1]
    При дешифровании CBC:
      P1' = AES_K^(-1)(C1) XOR IV          <- содержит IV
      P2' = AES_K^(-1)(0...0) XOR C1       <- мусор
      P3' = AES_K^(-1)(C1) XOR 0...0       <- AES_K^(-1)(C1) напрямую

    IV = P1' XOR AES_K^(-1)(C1)
       = P1' XOR P3'
    """
    # Получаем один блок шифртекста
    ct = oracle_encrypt(b"A" * block_size)
    c1 = ct[:block_size]

    # Формируем C1 || 0...0 || C1
    crafted = c1 + b"\x00" * block_size + c1

    # Дешифруем
    pt = oracle_decrypt(crafted)
    p1_prime = pt[:block_size]
    p3_prime = pt[32:48]

    # IV = P1' XOR P3'
    iv = bytes(a ^ b for a, b in zip(p1_prime, p3_prime))
    return iv
```

---

## CRIME и BREACH (сжатие + шифрование)

```
Атаки на системы, которые сжимают данные ПЕРЕД шифрованием.

CRIME (2012) - Compression Ratio Info-leak Made Easy:
  Цель: TLS с DEFLATE сжатием (gzip)
  Суть: если злоумышленник контролирует часть открытого текста
        и видит длину шифртекста, он может угадать секрет побайтово.
  Принцип: compression + known_prefix -> короче если совпадает
  CVE: CVE-2012-4929
  Результат: браузеры отключили TLS-сжатие

BREACH (2013) - Browser Reconnaissance and Exfiltration via Adaptive Compression:
  То же самое но для HTTP сжатия (Content-Encoding: gzip)
  Не требует TLS-сжатия - только HTTP-сжатие
  Атака на CSRF токены, session ID в HTML

Принцип атаки:
  Response = AES_K(compress("SECRET=XYZ...USER_INPUT"))

  Если USER_INPUT = "SECRET=A" -> сжатие короче (match найден)
  Если USER_INPUT = "SECRET=B" -> сжатие длиннее (нет match)

  -> угадываем посимвольно по длине ответа

Защита:
  - Не сжимать данные содержащие секреты вместе с user input
  - Добавить случайный padding к ответам (Heal-the-Breach)
  - SameSite cookies
```

---

## Nonce Reuse атаки (CTR и GCM)

### CTR: many-time pad

```
Если (Key, Nonce) используется дважды:
C1 = P1 XOR KS
C2 = P2 XOR KS

C1 XOR C2 = P1 XOR P2

Зная XOR двух открытых текстов и паттерны языка:
можно восстановить оба текста (crib dragging).
```

```python
def crib_drag(ct1: bytes, ct2: bytes, crib: bytes) -> list:
    """
    Crib dragging: перебираем позиции где crib (известная фраза)
    может находиться в одном из текстов.
    """
    xored = bytes(a ^ b for a, b in zip(ct1, ct2))
    results = []

    for i in range(len(xored) - len(crib) + 1):
        # Предполагаем что P1[i:i+len] = crib
        # Тогда P2[i:i+len] = xored[i:i+len] XOR crib
        candidate = bytes(a ^ b for a, b in zip(xored[i:], crib))
        # Проверяем printable
        if all(32 <= b < 127 for b in candidate[:len(crib)]):
            results.append((i, crib, candidate[:len(crib)]))

    return results

# Пример
ct1 = bytes.fromhex("1234abcd...")
ct2 = bytes.fromhex("5678efab...")
hits = crib_drag(ct1, ct2, b"the ")
for pos, crib, candidate in hits:
    print(f"Позиция {pos}: если P1='{crib}' то P2='{candidate}'")
```

### GCM: Forbidden Attack (Nonce Reuse)

```
Если (Key, Nonce) используется дважды в GCM:

C1 = P1 XOR KS
C2 = P2 XOR KS
T1 = GHASH(H, A1, C1) XOR E(K, Nonce||0)
T2 = GHASH(H, A2, C2) XOR E(K, Nonce||0)

T1 XOR T2 = GHASH(H, A1, C1) XOR GHASH(H, A2, C2)

Это уравнение в GF(2^128) позволяет восстановить H (hash key)!
Зная H, злоумышленник может подделать тег для ЛЮБОГО сообщения
с тем же ключом.

Это называется "Forbidden Attack" (Joux, 2006).
Даже если P1 и P2 неизвестны - H восстанавливается.

Последствия:
- Полная потеря аутентификации
- Возможность подделки любых будущих сообщений
- Необратимо: даже смена nonce не поможет (ключ скомпрометирован)

Реальный случай: уязвимость в Solar Designer's key wrapping (2011)
```

```python
# Демонстрация восстановления H из двух GCM шифртекстов с одним nonce
# (упрощённо, настоящая атака требует арифметику в GF(2^128))

def forbidden_attack_demo(ct1, tag1, ct2, tag2, aad1=b"", aad2=b""):
    """
    Если два сообщения зашифрованы одним (key, nonce) в GCM:
    T1 XOR T2 = GHASH(H, aad1, ct1) XOR GHASH(H, aad2, ct2)

    Это полином от H степени max(len(ct1), len(ct2))/16 + 2
    Решение даёт H.

    На практике используют библиотеки вроде gcm-siv или
    pwn-gcm для решения в GF(2^128).
    """
    xor_tags = bytes(a ^ b for a, b in zip(tag1, tag2))
    print(f"T1 XOR T2 = {xor_tags.hex()}")
    print("Это уравнение в GF(2^128) для восстановления H")
    print("Зная H: можно подделать тег для любого CT с тем же ключом")
    # Полная реализация требует polynomial GCD в GF(2^128)
```

---

## Атаки на основе длины шифртекста

### ECB length leak

```
В ECB паддинг добавляется до кратного размера блока.
По изменению длины шифртекста можно определить длину секрета.

Алгоритм:
1. Увеличиваем ввод на 1 байт за раз
2. Смотрим когда длина шифртекста скачет на 16 байт
3. Этот момент говорит: ввод + секрет перешёл границу блока

Длина секрета = (длина шифртекста при пустом вводе) - pad_at_jump

# Точное вычисление длины секрета
def find_secret_length(oracle):
    base_len = len(oracle(b""))
    for i in range(1, 33):
        new_len = len(oracle(b"A" * i))
        if new_len > base_len:
            # Скачок произошёл при i байтах ввода
            # Значит секрет занимал base_len - i байт + паддинг
            secret_len = base_len - i
            return secret_len
    return None
```

---

## Итог: почему всё это работает

```
Корень всех этих атак:

ECB:
  - Детерминированность: P = P' => C = C'
  - Нет зависимости между блоками
  - Атакующий контролирует блочные границы -> oracle атаки

CBC без MAC:
  - Malleable: изменение C(i-1) предсказуемо меняет P_i
  - Padding oracle: сервер раскрывает информацию через ошибки
  - Предсказуемый IV -> CPA атаки

CTR/GCM с повторным nonce:
  - Keystream повторяется -> many-time pad
  - GCM: H восстанавливается -> полная потеря аутентификации

Сжатие + шифрование:
  - Длина шифртекста утекает информацию о содержимом

Правильное решение:
  AES-256-GCM + случайный 12-байтный nonce (НИКОГДА не повторять)
  + проверка тега перед использованием данных
  + не сжимать секреты вместе с пользовательским вводом
```

---

## Практика: CTF задачи

```
ECB Oracle (типичный CTF сценарий):
  nc challenge.ctf.example 1337
  > Введите input (hex): 4141414141414141414141414141414141414141414141
  > Зашифровано: a1b2c3...{encrypted_flag}

  1. Определить block_size (пробуем 1, 2, 3... байта)
  2. Подтвердить ECB (два одинаковых блока в выводе)
  3. Применить byte-at-a-time атаку
  4. Получить флаг

Полезные инструменты:
  - pwntools: взаимодействие с сервером
  - PyCryptodome: шифрование/дешифрование
  - matasano/cryptopals challenges: практика (Set 2)

Cryptopals задачи по теме:
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

## Шпаргалка

```
ECB Oracle (byte-at-a-time):
  Оракул: AES_ECB(attacker_input || secret)
  1. Заполнить блок до одного неизвестного байта
  2. Перебрать 256 значений -> сравнить шифртекст
  3. Повторить для каждого байта
  Сложность: 256 * len(secret) запросов к оракулу

ECB Cut-and-Paste:
  Перестановка блоков шифртекста -> изменение смысла данных
  Работает потому что блоки ECB независимы

Padding Oracle (CBC):
  Оракул говорит "паддинг верный/нет" -> побайтовое дешифрование
  Сложность: 256 * 16 * num_blocks запросов
  Реальные атаки: POODLE, BEAST, Lucky 13

Bit-Flipping (CBC):
  Изменение бита в C(i-1) -> предсказуемое изменение P_i
  P_i мусор, но P_(i+1) повреждён предсказуемо

Nonce Reuse:
  CTR: C1 XOR C2 = P1 XOR P2 (crib dragging)
  GCM: восстанавливается H -> подделка любых тегов

Защита:
  AES-GCM            -> нет Padding Oracle, нет cut-and-paste
  Случайный нonce    -> нет nonce reuse
  Проверка тега      -> нет bit-flipping
  Не сжимать         -> нет CRIME/BREACH
```

---

## Ссылки

- [Cryptopals Challenges](https://cryptopals.com/) - практические упражнения по атакам
- [POODLE CVE-2014-3566](https://www.openssl.org/~bodo/ssl-poodle.pdf) - оригинальная статья
- [Forbidden Attack (Joux 2006)](https://eprint.iacr.org/2006/487.pdf) - GCM nonce reuse
- [Lucky 13](https://www.isg.rhul.ac.uk/tls/Lucky13.html) - timing-based padding oracle
- [BEAST Attack](https://vnhacker.blogspot.com/2011/09/beast.html) - CBC IV предсказуемость
- [CRIME/BREACH](https://www.breachattack.com/) - сжатие + шифрование
- [A Graduate Course in Applied Cryptography](https://toc.cryptobook.us/) - Boneh & Shoup (бесплатно)
