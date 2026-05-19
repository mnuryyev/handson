---
title: "Padding - PKCS#7, атака padding oracle"
date: "2026-05-15"
---

Padding - механизм выравнивания данных до кратного размера блока. Звучит как технический нюанс, но именно через padding были проведены одни из самых разрушительных атак в истории TLS: POODLE, BEAST, Lucky 13. Понимание padding oracle объясняет, почему порядок операций (Encrypt-then-MAC vs MAC-then-Encrypt) является критическим выбором дизайна.

---

## Зачем нужен padding

```
Блочный шифр (AES, DES) шифрует данные строго блоками фиксированного размера.
AES: блок = 16 байт (128 бит).

Проблема: реальные данные редко кратны 16 байтам.

"Hello" = 5 байт - нельзя зашифровать напрямую в AES (нужно 16 байт).
"Hello, World!!!" = 15 байт - не хватает 1 байта до блока.

Решение: добавить байты-заполнители (padding) до нужной длины.
Получатель должен знать как убрать padding после дешифрования.

Режимы, где нужен padding:
  ECB: да
  CBC: да
  CTR: нет (потоковый режим)
  GCM: нет (потоковый режим)

Вывод: padding нужен только блочным шифрам в блочных режимах.
AES-GCM и ChaCha20-Poly1305 не требуют padding.
```

---

## PKCS#7: стандарт паддинга

### Правило

```
PKCS#7 (RFC 5652, также известен как PKCS#5 для 8-байтных блоков):

Если данные не кратны размеру блока B:
  pad_len = B - (len(data) % B)
  Добавить pad_len байт, каждый со значением pad_len.

Если данные уже кратны B:
  Добавить целый блок (B байт) со значением B.
  (Это ВСЕГДА добавляет хотя бы один байт паддинга)

Для AES (B = 16):
  pad_len: от 1 до 16 включительно.
```

### Примеры

```
Блок = 16 байт. Значения паддинга показаны как \xNN.

Данные: b"Hello" (5 байт)
  pad_len = 16 - 5 = 11
  Padded:  b"Hello\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b\x0b"
                         └────────────── 11 байт со значением 0x0b ──────────────┘

Данные: b"Hello, World!!!" (15 байт)
  pad_len = 16 - 15 = 1
  Padded:  b"Hello, World!!!\x01"
                               └── 1 байт со значением 0x01

Данные: b"Hello, World!!!!" (16 байт, кратно блоку)
  pad_len = 16  (добавляем целый блок!)
  Padded:  b"Hello, World!!!!\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10\x10"
                               └─────────────── 16 байт со значением 0x10 ───────────────────┘

Данные: b"AB" (2 байта)
  pad_len = 16 - 2 = 14
  Padded:  b"AB\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e\x0e"
```

### Проверка и удаление паддинга

```
Алгоритм проверки (unpad):

1. Прочитать последний байт: pad_byte = data[-1]
2. Проверить: 1 <= pad_byte <= B
3. Проверить: последние pad_byte байт = pad_byte
4. Если всё верно: вернуть data[:-pad_byte]
5. Иначе: ошибка "Invalid padding"

Примеры корректного паддинга:
  ....\x01                  <- последний байт 0x01, один байт паддинга
  ....\x02\x02              <- последние 2 байта = 0x02
  ....\x10\x10...\x10       <- последние 16 байт = 0x10

Примеры НЕКОРРЕКТНОГО паддинга:
  ....\x00                  <- 0x00 не является корректным PKCS#7 паддингом
  ....\x02\x03              <- последние байты неодинаковы
  ....\x11                  <- 0x11 = 17 > размера блока (16)
  ....\x02\x01              <- 0x01 != 0x02
```

```python
from Crypto.Util.Padding import pad, unpad

# Паддинг
data = b"Hello"
padded = pad(data, 16)
print(f"Original: {data.hex()}")
print(f"Padded:   {padded.hex()}")
# Padded: 48656c6c6f0b0b0b0b0b0b0b0b0b0b0b

# Распаддинг
recovered = unpad(padded, 16)
print(f"Unpadded: {recovered}")  # b'Hello'

# Ручная реализация для понимания:
def pkcs7_pad(data: bytes, block_size: int) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len] * pad_len)

def pkcs7_unpad(data: bytes, block_size: int) -> bytes:
    if not data or len(data) % block_size != 0:
        raise ValueError("Invalid data length")
    pad_byte = data[-1]
    if pad_byte == 0 or pad_byte > block_size:
        raise ValueError("Invalid padding byte")
    padding = data[-pad_byte:]
    if padding != bytes([pad_byte] * pad_byte):
        raise ValueError("Invalid padding")
    return data[:-pad_byte]

# Тест
for msg in [b"A", b"Hello", b"Hello, World!!!", b"Hello, World!!!!"]:
    padded = pkcs7_pad(msg, 16)
    assert pkcs7_unpad(padded, 16) == msg
    print(f"{repr(msg):25s} -> pad_len={padded[-1]}, total={len(padded)}")
```

---

## Другие схемы паддинга

```
PKCS#7 - не единственная схема. Контекст важен.

PKCS#5:
  Идентичен PKCS#7, но только для 8-байтных блоков (DES).
  В коде термины часто используются взаимозаменяемо.

ISO/IEC 7816-4 (паддинг смарт-карт):
  Добавляем 0x80, затем нули до границы блока.
  b"Hello" -> b"Hello\x80\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  Если уже кратно: добавляем 0x80 + нули.

Zero Padding (битовый паддинг):
  Добавляем нули до границы блока.
  b"Hello" -> b"Hello\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  Проблема: нельзя отличить данные заканчивающиеся на 0x00 от паддинга!
  Не использовать для произвольных данных.

ANSI X9.23:
  Добавляем случайные байты + последний байт = длина паддинга.
  Аналог PKCS#7 но с рандомизацией.

Ciphertext Stealing (CTS):
  Не добавляет байты, "крадёт" часть последнего блока.
  Длина шифртекста = длина открытого текста.
  Используется в NTFS шифровании, некоторых AES-XTS вариантах.

TLS Record Layer:
  Паддинг в TLS 1.2 + CBC: PKCS#7.
  В TLS 1.3: нет CBC -> нет padding oracle.
```

---

## CBC дешифрование: как работает

```
Для понимания Padding Oracle нужно точно знать CBC дешифрование.

CBC шифрование:
  C_0 = IV
  C_i = E_K(P_i XOR C_{i-1})

CBC дешифрование:
  P_i = D_K(C_i) XOR C_{i-1}

Где D_K - обратная функция блочного шифра (AES Decrypt).

Ключевое свойство:
  P_i зависит от D_K(C_i) и C_{i-1}.
  Изменение C_{i-1} напрямую меняет P_i.
  Изменение C_i меняет D_K(C_i), что случайно меняет P_i.

Промежуточное значение:
  I_i = D_K(C_i)   <- "intermediate", результат блочного дешифрования
  P_i = I_i XOR C_{i-1}

Если мы знаем I_i и C_{i-1}, мы знаем P_i.
Padding oracle позволяет восстановить I_i без знания K.
```

```
Схема CBC дешифрования:

C_{i-1}     C_i
   |          |
   |        D_K()     <- расшифрование одного блока AES
   |          |
   |         I_i      <- промежуточное значение
   |          |
   +---XOR---+
              |
             P_i      <- открытый текст блока i
```

---

## Padding Oracle: принцип атаки

### Что такое оракул

```
Оракул (Oracle) в криптографии - функция, которая отвечает на запросы
и тем самым раскрывает информацию о секрете.

Padding Oracle - это система (сервер, функция), которая:
  Принимает: произвольный шифртекст
  Возвращает: "padding valid" или "padding invalid"

Это может быть явным (разные коды ошибок) или неявным (timing).

Примеры в реальных системах:
  "MAC verification failed" vs "Padding error"  <- явный padding oracle
  200 OK vs 403 Forbidden                       <- явный
  Быстрый ответ vs медленный ответ              <- timing oracle (Lucky 13)
  Соединение закрыто сразу vs после обработки   <- timing oracle
```

### Атака: побайтовое восстановление

```
Цель: расшифровать блок C_i, зная C_{i-1} и C_i.

Метод: манипулируем C_{i-1} чтобы получить контролируемый P_i.

Шаг 1: восстановить последний байт P_i[15]

  Хотим: P'_i[15] = 0x01 (минимальный корректный паддинг)

  P'_i[15] = I_i[15] XOR C'_{i-1}[15]

  Если P'_i[15] = 0x01, то:
    I_i[15] XOR C'_{i-1}[15] = 0x01
    I_i[15] = 0x01 XOR C'_{i-1}[15]

  Перебираем C'_{i-1}[15] от 0x00 до 0xFF (256 вариантов).
  При каком значении оракул скажет "padding valid"?

  Как только нашли:
    I_i[15] = C'_{i-1}[15] XOR 0x01
    P_i[15] = I_i[15] XOR C_{i-1}[15]   <- оригинальный C_{i-1}[15]

Шаг 2: восстановить P_i[14]

  Теперь хотим паддинг \x02\x02:
    P'_i[15] = 0x02  -> C'_{i-1}[15] = I_i[15] XOR 0x02  <- знаем I_i[15]!
    P'_i[14] = 0x02  -> перебираем C'_{i-1}[14]

  Когда оракул: "padding valid" -> нашли I_i[14]
    P_i[14] = I_i[14] XOR C_{i-1}[14]

Шаг 3: P_i[13] - аналогично, целевой паддинг \x03\x03\x03
...
Шаг 16: P_i[0] - паддинг \x10\x10...\x10 (16 байт)

Итого запросов к оракулу: 256 * 16 = 4096 на один блок.
Для N блоков: 4096 * N запросов (в среднем 128 * 16 = 2048).
```

---

## Полная реализация атаки

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import os

# ─── Настройка сервера-жертвы ─────────────────────────────────────────────────

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt(plaintext: bytes) -> tuple[bytes, bytes]:
    """Сервер шифрует данные. IV и CT возвращаются клиенту."""
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return IV, cipher.encrypt(pad(plaintext, 16))

def server_decrypt(iv: bytes, ciphertext: bytes) -> bool:
    """
    Уязвимый сервер: возвращает разные ошибки для padding vs data error.
    Это и есть Padding Oracle!
    """
    cipher = AES.new(KEY, AES.MODE_CBC, iv)
    try:
        decrypted = cipher.decrypt(ciphertext)
        unpad(decrypted, 16)   # бросает ValueError при плохом паддинге
        return True            # "200 OK" - паддинг корректный
    except ValueError:
        return False           # "403 Forbidden" - паддинг некорректный

# ─── Атака ───────────────────────────────────────────────────────────────────

def padding_oracle_attack(iv: bytes, ciphertext: bytes) -> bytes:
    """
    Восстанавливает открытый текст из iv + ciphertext
    используя только доступ к padding oracle.
    Ключ НЕ нужен.
    """
    block_size = 16

    # Разбиваем шифртекст на блоки
    blocks = [iv] + [
        ciphertext[i:i+block_size]
        for i in range(0, len(ciphertext), block_size)
    ]
    # blocks[0] = IV, blocks[1] = C_1, blocks[2] = C_2, ...

    plaintext = bytearray()

    # Атакуем каждый блок начиная с первого шифртекстового
    for block_idx in range(1, len(blocks)):
        target_block = blocks[block_idx]      # C_i
        prev_block   = blocks[block_idx - 1]  # C_{i-1}

        # Промежуточные байты I_i = D_K(C_i)
        intermediate = bytearray(block_size)

        # Восстанавливаем байты с конца блока
        for byte_pos in range(block_size - 1, -1, -1):
            pad_byte = block_size - byte_pos  # нужный байт паддинга

            # Формируем модифицированный C'_{i-1}
            # Байты ПОСЛЕ byte_pos уже известны -> задаём нужный паддинг
            crafted_prev = bytearray(block_size)
            for k in range(byte_pos + 1, block_size):
                crafted_prev[k] = intermediate[k] ^ pad_byte

            # Перебираем значение байта byte_pos
            found = False
            for guess in range(256):
                crafted_prev[byte_pos] = guess

                # Спрашиваем оракул
                if server_decrypt(bytes(crafted_prev), target_block):
                    # Нашли! Но нужна доп. проверка для последнего байта
                    # (чтобы исключить ложные срабатывания: 0x02 0x02 vs 0x01)
                    if byte_pos == block_size - 1:
                        # Убеждаемся что паддинг именно 0x01, а не 0x02 0x02
                        # Меняем соседний байт и проверяем снова
                        if byte_pos > 0:
                            alt = bytearray(crafted_prev)
                            alt[byte_pos - 1] ^= 0x01
                            if not server_decrypt(bytes(alt), target_block):
                                continue  # ложное срабатывание, продолжаем

                    # I_i[byte_pos] = guess XOR pad_byte
                    intermediate[byte_pos] = guess ^ pad_byte
                    found = True
                    break

            if not found:
                raise RuntimeError(
                    f"Не найден байт {byte_pos} в блоке {block_idx}"
                )

        # P_i = I_i XOR C_{i-1} (оригинальный предыдущий блок)
        pt_block = bytes(
            i ^ p for i, p in zip(intermediate, prev_block)
        )
        plaintext += pt_block
        print(f"  Блок {block_idx} расшифрован: {pt_block}")

    # Убираем паддинг из результата
    return bytes(unpad(plaintext, block_size))


# ─── Демонстрация ─────────────────────────────────────────────────────────────

secret = b"Attack at dawn!!"   # 16 байт
iv, ct = encrypt(secret)

print(f"Зашифровано: {ct.hex()}")
print(f"Ключ неизвестен. Запускаем padding oracle атаку...\n")

recovered = padding_oracle_attack(iv, ct)
print(f"\nВосстановлено: {recovered}")
assert recovered == secret
print("Атака успешна!")
```

---

## Детальный разбор одного байта

```
Покажем пошагово восстановление байта P_1[15] (последний байт первого блока).

Входные данные:
  IV = C_0 = [b0, b1, ..., b15]    <- знаем
  C_1      = [c0, c1, ..., c15]    <- знаем
  P_1[15]  = ?                      <- хотим найти

Внутри сервера при дешифровании:
  I_1 = D_K(C_1)                   <- промежуточное, НЕ ЗНАЕМ
  P_1 = I_1 XOR C_0                <- P_1[15] = I_1[15] XOR b15

Атака:
  Создаём C'_0 = [b0, b1, ..., b14, x] где x перебираем 0..255.
  Отправляем [C'_0 || C_1] серверу.

  Сервер вычисляет:
    P'_1 = D_K(C_1) XOR C'_0 = I_1 XOR C'_0

  Нас интересует: P'_1[15] = I_1[15] XOR x

  Когда x = 0x42 (например) оракул говорит "valid":
    P'_1[15] = 0x01  (единственный паддинг для последнего байта: \x01)
    I_1[15] XOR 0x42 = 0x01
    I_1[15] = 0x01 XOR 0x42 = 0x43

  Оригинальный открытый текст:
    P_1[15] = I_1[15] XOR b15 = 0x43 XOR b15

Важное замечание: весь блок P'_0 превращается в случайный мусор,
но нас это не волнует - нас интересует только паддинг P'_1.
```

---

## Ложные срабатывания

```
Проблема при восстановлении последнего байта:

Допустим I_i[15] = 0x42 и правильный ответ x = 0x43 (паддинг 0x01).

Но может случиться что при x = y оракул тоже говорит "valid":
  P'_i[15] = 0x02
  P'_i[14] = 0x02  <- СЛУЧАЙНО совпало!

Тогда паддинг \x02\x02 тоже корректный -> ложное срабатывание.

Решение:
  При нахождении "valid" для последнего байта дополнительно проверяем:
    Меняем byte_pos - 1 (предпоследний байт).
    Если оракул всё ещё "valid" -> паддинг действительно 0x01.
    Если "invalid" -> был паддинг \x02\x02, продолжаем поиск.

Для байтов не на конце блока (byte_pos < 15):
  Мы сами задаём байты ПОСЛЕ byte_pos нужными значениями.
  Ложные срабатывания практически невозможны.
```

---

## Реальные атаки

### POODLE (2014)

```
Padding Oracle On Downgraded Legacy Encryption
CVE-2014-3566

Цель: SSL 3.0 с CBC шифрованием.

Контекст SSL 3.0:
  Padding в SSL 3.0: последний байт = длина паддинга.
  Остальные байты паддинга могут быть ПРОИЗВОЛЬНЫМИ!
  Проверяется только последний байт.
  Это делает padding oracle тривиальным.

Атака:
  Позиция атакующего: MITM (Network eavesdropper + JavaScript injection)
  Метод:
    1. Злоумышленник вставляет JavaScript в HTTP страницу жертвы
    2. JavaScript заставляет браузер делать запросы к target.com
       с cookie жертвы (cross-origin через форму или CORS)
    3. Атакующий перехватывает TLS трафик и модифицирует шифртекст
    4. Сервер: "padding error" -> атакующий знает что угадал
    5. 256 запросов на байт * 16 * N_blocks = восстановление cookie

  Downgrade: атакующий вмешивается в TLS handshake,
  заставляя клиент и сервер откатиться до SSL 3.0.

Результат: восстановление session cookie из HTTPS.
Исправление: отключить SSL 3.0 (TLS_FALLBACK_SCSV).
```

### BEAST (2011)

```
Browser Exploit Against SSL/TLS
CVE-2011-3389

Цель: TLS 1.0 + CBC

Уязвимость TLS 1.0:
  IV следующей записи = последний блок шифртекста предыдущей записи.
  IV предсказуем атакующим!

Атака (chosen-plaintext via predictable IV):
  Атакующий знает IV следующего запроса.
  Может "угадать" один байт по реакции сервера (не padding oracle, но CPA).

Результат: восстановление cookie побайтово.
Исправление: добавить пустую запись перед каждой (меняет IV).
             TLS 1.1+ использует явный случайный IV.
```

### Lucky 13 (2013)

```
Авторы: Al Fardan, Paterson.
Цель: TLS + CBC + HMAC (включая encrypt-then-MAC!)

Суть timing oracle:
  При неверном паддинге сервер выбрасывает исключение РАНЬШЕ.
  При верном паддинге вычисляет HMAC над большим объёмом данных.
  Разница: ~2 микросекунды (в зависимости от размера данных для HMAC).

Это timing side-channel, а не явный padding oracle!
Даже Encrypt-then-MAC не защищал в некоторых реализациях.

Причина:
  Реализации вычисляли HMAC даже при плохом паддинге (для защиты от timing).
  Но объём данных для HMAC зависел от длины "правильного" паддинга.
  Разница в объёме HMAC -> timing leak.

Исправление:
  Constant-time реализация CBC padding + HMAC verification.
  Вычислять HMAC над фиксированным количеством блоков всегда.
  Или: перейти на TLS 1.3 (нет CBC, нет padding oracle).
```

### ROBOT (2018)

```
Return Of Bleichenbacher's Oracle Threat
CVE-2017-13099 и другие

Цель: RSA PKCS#1 v1.5 в TLS (не CBC, но принцип тот же).

Bleichenbacher 1998: атака padding oracle на RSA PKCS#1 v1.5.
  RSA шифрует с паддингом: 0x00 0x02 [random non-zero] 0x00 [message]
  Если сервер говорит "padding invalid": атакующий знает много.
  За ~1 миллион запросов восстанавливается сессионный ключ.

ROBOT 2018: обнаружена в 27 продуктах спустя 19 лет.
Включая: Facebook, Citrix, F5, Cisco, Broadcom, Palo Alto.

Вывод: padding oracle атаки работают спустя десятилетия.
TLS 1.3: запрещён RSA key exchange -> нет RSA padding oracle.
```

---

## Диагностика: есть ли padding oracle?

```python
import time
import os
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

KEY = os.urandom(16)
IV  = os.urandom(16)

def encrypt_example(msg: bytes) -> bytes:
    cipher = AES.new(KEY, AES.MODE_CBC, IV)
    return IV + cipher.encrypt(pad(msg, 16))

def safe_decrypt(ciphertext: bytes) -> tuple[bool, str]:
    """
    БЕЗОПАСНАЯ реализация: всегда возвращает одну и ту же ошибку.
    Злоумышленник не может отличить padding error от data error.
    """
    iv = ciphertext[:16]
    ct = ciphertext[16:]
    cipher = AES.new(KEY, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(ct)

    # Проверяем HMAC сначала (Encrypt-then-MAC)
    # ... (здесь должна быть проверка MAC) ...

    try:
        unpadded = pad(decrypted, 16)  # намеренно не unpad!
        # В правильной реализации: проверять MAC ДО unpad
        pass
    except Exception:
        pass

    # Всегда одна и та же обобщённая ошибка:
    return False, "Decryption failed"

def vulnerable_decrypt(ciphertext: bytes) -> tuple[bool, str]:
    """
    УЯЗВИМАЯ реализация: разные ошибки для padding vs data.
    Это и есть padding oracle!
    """
    from Crypto.Util.Padding import unpad
    iv = ciphertext[:16]
    ct = ciphertext[16:]
    try:
        cipher = AES.new(KEY, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(ct)
        unpad(decrypted, 16)
        return True, "OK"
    except ValueError as e:
        if "Padding" in str(e):
            return False, "Invalid padding"   # УТЕЧКА! Это padding oracle.
        return False, "Invalid data"

def timing_oracle_check():
    """
    Проверка timing oracle: одинаково ли быстро отвечает сервер?
    Большая разница в timing при разных шифртекстах = timing oracle.
    """
    ct = encrypt_example(b"test message 123")

    # Измеряем время ответа для корректного шифртекста
    times_valid = []
    for _ in range(100):
        t0 = time.perf_counter()
        try:
            from Crypto.Util.Padding import unpad
            AES.new(KEY, AES.MODE_CBC, ct[:16]).decrypt(ct[16:])
        except Exception:
            pass
        times_valid.append(time.perf_counter() - t0)

    # Измеряем время для случайного шифртекста (плохой паддинг)
    random_ct = ct[:16] + os.urandom(len(ct) - 16)
    times_invalid = []
    for _ in range(100):
        t0 = time.perf_counter()
        try:
            AES.new(KEY, AES.MODE_CBC, random_ct[:16]).decrypt(random_ct[16:])
        except Exception:
            pass
        times_invalid.append(time.perf_counter() - t0)

    avg_valid   = sum(times_valid) / len(times_valid) * 1e6
    avg_invalid = sum(times_invalid) / len(times_invalid) * 1e6
    diff = abs(avg_valid - avg_invalid)

    print(f"Среднее время (valid CT):   {avg_valid:.2f} мкс")
    print(f"Среднее время (invalid CT): {avg_invalid:.2f} мкс")
    print(f"Разница: {diff:.2f} мкс")
    if diff > 50:
        print("ПРЕДУПРЕЖДЕНИЕ: возможен timing oracle!")
    else:
        print("Timing разница в норме")

timing_oracle_check()
```

---

## Защита от Padding Oracle

### Правило 1: Encrypt-then-MAC

```
Порядок операций критичен.

Encrypt-then-MAC (безопасно):
  1. Encrypt: C = AES_CBC_K1(P)
  2. MAC:     T = HMAC_K2(C)
  3. Send:    C || T

  Получатель:
  1. Verify: HMAC_K2(C) == T  (константное время!)
  2. Если НЕТ -> отклонить, НЕ дешифровать
  3. Decrypt: P = AES_CBC_K1^{-1}(C)
  4. Unpad

  КЛЮЧЕВОЙ момент: дешифрование только после проверки MAC.
  Плохой паддинг никогда не дойдёт до проверки - MAC уже отклонит.

MAC-then-Encrypt (уязвимо - SSL, TLS < 1.2):
  1. MAC:     T = HMAC_K(P)
  2. Encrypt: C = AES_CBC_K(P || T)

  Получатель:
  1. Decrypt: D = AES_CBC_K^{-1}(C)  <- вот где padding проверяется!
  2. Verify MAC
  Паддинг проверяется ДО MAC -> padding oracle возможен.

Encrypt-and-MAC (уязвимо - SSH v1):
  Утечка информации через MAC вычисленный над plaintext.
```

### Правило 2: AEAD вместо CBC

```
Лучшее решение: не использовать CBC вообще.
AES-GCM и ChaCha20-Poly1305 - AEAD алгоритмы.

GCM не использует padding -> нет padding oracle физически.
Тег аутентификации проверяется ДО возврата данных.
Любая модификация шифртекста -> тег не совпадает -> отказ.

# ПЛОХО (CBC без MAC):
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

cipher = AES.new(key, AES.MODE_CBC, iv=iv)
ct = cipher.encrypt(pad(plaintext, 16))

cipher = AES.new(key, AES.MODE_CBC, iv=iv)
pt = unpad(cipher.decrypt(ct), 16)  # уязвимо!

# ХОРОШО (GCM):
cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
ct, tag = cipher.encrypt_and_digest(plaintext)

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
pt = cipher.decrypt_and_verify(ct, tag)  # тег проверяется первым!
```

### Правило 3: константное время

```python
import hmac
import secrets

def safe_mac_verify(expected_tag: bytes, received_tag: bytes) -> bool:
    """
    Сравнение MAC должно быть константного времени.
    Обычное == завершается при первом несовпадении байта -> timing attack.
    """
    # ПЛОХО: timing attack через раннее завершение
    # return expected_tag == received_tag

    # ХОРОШО: hmac.compare_digest работает за константное время
    return hmac.compare_digest(expected_tag, received_tag)

def safe_decrypt_with_mac(key_enc: bytes, key_mac: bytes,
                          iv: bytes, ciphertext: bytes,
                          received_tag: bytes) -> bytes:
    """
    Безопасная реализация CBC + HMAC (Encrypt-then-MAC).
    """
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad

    # Шаг 1: вычислить ожидаемый MAC (над шифртекстом)
    expected_tag = hmac.new(key_mac, iv + ciphertext,
                            digestmod='sha256').digest()

    # Шаг 2: сравнить в константном времени
    if not hmac.compare_digest(expected_tag, received_tag):
        raise ValueError("MAC verification failed")
        # НЕ раскрываем причину: не "padding error", не "MAC error"
        # Просто "decryption failed"

    # Шаг 3: только после успешного MAC -> дешифровать
    cipher = AES.new(key_enc, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(ciphertext)

    # Шаг 4: unpad (уже безопасно - данные аутентифицированы)
    return unpad(decrypted, 16)
```

### Правило 4: одна обобщённая ошибка

```python
def hardened_server_endpoint(encrypted_data: bytes) -> str:
    """
    Сервер НИКОГДА не раскрывает причину ошибки дешифрования.
    """
    try:
        result = safe_decrypt_with_mac(...)
        return process_data(result)
    except Exception:
        # ВСЕГДА одна и та же ошибка:
        # - не "Padding error"
        # - не "MAC mismatch"
        # - не "Invalid block length"
        return "Request processing failed"

    # Дополнительно: одинаковое время ответа независимо от причины ошибки
    # Используйте time.sleep() чтобы выровнять время при ошибках
```

### Правило 5: TLS 1.3

```
Самое простое решение: использовать TLS 1.3.

TLS 1.3 устранил все CBC-related уязвимости:
  - Убран CBC из cipher suites
  - Убран RSA key exchange
  - Только AEAD: AES-GCM, ChaCha20-Poly1305
  - Нет padding oracle физически

Конфигурация nginx для TLS 1.3:
  ssl_protocols TLSv1.3;
  ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;

Если нужен TLS 1.2 (совместимость):
  Запретить CBC cipher suites:
  ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:!CBC:!3DES:!RC4';
```

---

## Сложность и практичность атаки

```
Число запросов к оракулу:

На один блок (16 байт):
  В худшем случае: 256 * 16 = 4096 запросов
  В среднем:       128 * 16 = 2048 запросов (256/2 в среднем на байт)

Для сообщения из N блоков: ~2048 * N запросов

Пример (session cookie, 32 байта = 2 блока):
  ~4096 запросов

POODLE: ~256 запросов на байт (из-за специфики SSL 3.0 паддинга).
Сессия с keep-alive: 1000 запросов/сек -> 4 секунды на 1 блок.

Сетевая задержка: 100 мс RTT -> 4096 * 0.1 = 410 секунд на блок.
Параллельные запросы ускоряют атаку.

Реальные атаки занимали от минут до нескольких часов
в зависимости от латентности и длины сообщения.
```

---

## OpenSSL и диагностика

```bash
# Проверить TLS cipher suites сервера (ищем CBC)
openssl s_client -connect target.com:443 2>/dev/null | grep "Cipher is"

# Принудительно проверить CBC cipher suites
openssl s_client -connect target.com:443 \
    -cipher 'AES256-SHA:AES128-SHA:DES-CBC3-SHA' 2>/dev/null | grep Cipher
# Если соединение установлено - сервер поддерживает уязвимые CBC суиты!

# Проверить поддержку SSL 3.0 (POODLE)
openssl s_client -connect target.com:443 -ssl3 2>&1 | grep -E "Protocol|error"

# Проверить TLS версию
openssl s_client -connect target.com:443 2>/dev/null | grep "Protocol"

# Сканирование через testssl.sh
./testssl.sh --poodle --beast --lucky13 target.com

# nmap скрипт
nmap --script ssl-poodle target.com -p 443

# Конфиг nginx без уязвимых CBC:
# ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384:!CBC';
# ssl_protocols TLSv1.2 TLSv1.3;
```

---

## Шпаргалка

```
PKCS#7 Padding:
  pad_len = B - (len(data) % B)  [1..B]
  Добавить pad_len байт со значением pad_len
  Если данные кратны B: добавить B байт со значением B

  Пример AES (B=16):
  "Hi" (2 байта) -> "Hi" + b"\x0e" * 14
  "Hello World!!!!!" (17 байт) -> + b"\x0f" * 15

Padding Oracle атака:
  Требует: CBC шифрование + сервер раскрывает статус паддинга
  Запросов: 256 * 16 * N_blocks (в худшем случае)
  Результат: полное дешифрование без ключа
  Атаки: POODLE (SSL 3.0), BEAST (TLS 1.0), Lucky 13 (timing)

Защита:
  1. AEAD (AES-GCM, ChaCha20-Poly1305) - лучшее решение
  2. Encrypt-then-MAC (не MAC-then-Encrypt)
  3. MAC проверяется ДО дешифрования
  4. Константное время сравнения (hmac.compare_digest)
  5. Одна обобщённая ошибка (не раскрывать причину)
  6. TLS 1.3 (нет CBC вообще)

Приоритет применения:
  Новый код:  AES-256-GCM или ChaCha20-Poly1305
  TLS:        TLS 1.3 обязательно
  Legacy CBC: + HMAC-SHA256 (Encrypt-then-MAC) + constant-time

Проверка:
  openssl s_client -connect host:443 -cipher 'AES256-SHA' # CBC?
  nmap --script ssl-poodle host -p 443
  testssl.sh --poodle --lucky13 host
```

---

## Ссылки

- [POODLE CVE-2014-3566](https://www.openssl.org/~bodo/ssl-poodle.pdf) - оригинальная статья
- [Lucky 13 (Al Fardan, Paterson)](https://www.isg.rhul.ac.uk/tls/Lucky13.html) - timing oracle
- [BEAST (Duong, Rizzo)](https://vnhacker.blogspot.com/2011/09/beast.html) - предсказуемый IV в TLS 1.0
- [ROBOT Attack](https://robotattack.org/) - возвращение Bleichenbacher
- [Bleichenbacher 1998 (RSA PKCS#1)](https://link.springer.com/chapter/10.1007/BFb0055716) - оригинальная атака
- [RFC 5652](https://www.rfc-editor.org/rfc/rfc5652) - PKCS#7 / CMS (паддинг)
- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2 (CBC + padding)
- [Cryptopals Set 3, Challenge 17](https://cryptopals.com/sets/3/challenges/17) - реализация атаки
