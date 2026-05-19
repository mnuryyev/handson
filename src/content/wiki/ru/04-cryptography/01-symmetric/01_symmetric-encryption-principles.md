---
title: "Симметричное шифрование - принципы"
date: "2026-05-15"
---

Симметричное шифрование - криптографическая схема, в которой один и тот же ключ используется как для шифрования, так и для дешифрования. Это фундаментальный строительный блок практической криптографии: быстрое, эффективное и при правильном применении - надёжное.

---

## Основная идея

```
Шифрование:   Plaintext + Key -> Ciphertext
Дешифрование: Ciphertext + Key -> Plaintext

Ключевое свойство: один ключ для обеих операций.
Отсюда "симметричное" - в отличие от асимметричного (публичный + приватный ключ).

Цель: обеспечить конфиденциальность данных.
Дополнительно (в зависимости от режима): целостность, аутентичность.
```

### Симметричное vs Асимметричное

```
Симметричное:
- Один общий секретный ключ
- Быстрое (AES-NI: ~2-4 ГБ/с)
- Применение: шифрование данных, файлов, трафика
- Проблема: как безопасно передать ключ?

Асимметричное (RSA, ECDH):
- Публичный ключ для шифрования, приватный для дешифрования
- Медленнее в 100-1000 раз
- Применение: обмен ключами, подписи
- Решение проблемы передачи ключа

На практике - гибридная схема:
Асимметричное -> безопасно передаём симметричный ключ
Симметричное  -> шифруем данные этим ключом

Пример: TLS handshake (ECDH) -> сессионный AES-ключ -> шифрование данных
```

---

## Блочные шифры

### Что такое блочный шифр

```
Блочный шифр - функция, которая принимает блок данных фиксированного размера
и ключ, и возвращает зашифрованный блок того же размера.

E(K, P) = C   (шифрование)
D(K, C) = P   (дешифрование)

Где:
K - ключ (Key)
P - открытый текст (Plaintext), размером в один блок
C - шифртекст (Ciphertext), того же размера

Это детерминированная перестановка: для данного K это биекция из {0,1}^n -> {0,1}^n.
```

### Современные блочные шифры

```
AES (Advanced Encryption Standard):
  Размер блока:  128 бит (16 байт)
  Размер ключа:  128, 192 или 256 бит
  Раундов:       10 / 12 / 14
  Стандарт:      NIST FIPS 197 (2001)
  Статус:        основной стандарт, используется везде

3DES (Triple DES):
  Размер блока:  64 бита (8 байт)
  Размер ключа:  112 или 168 бит (3 ключа DES)
  Раундов:       48 (3 x 16)
  Статус:        устаревший, запрещён для новых систем (NIST 2023)

Blowfish / Twofish:
  Размер блока:  64 / 128 бит
  Статус:        исторические, не рекомендуются

ChaCha20:
  Потоковый шифр, не блочный (см. ниже)
  Широко используется как альтернатива AES (без AES-NI)
```

### Структура раундов

```
Блочные шифры строятся из нескольких раундов.
Каждый раунд - простые, но комбинированные операции.
Много раундов -> диффузия и конфузия.

AES раунд (упрощённо):
1. SubBytes   - замена байтов через S-box (нелинейность, конфузия)
2. ShiftRows  - сдвиг строк матрицы (диффузия)
3. MixColumns - перемешивание столбцов в GF(2^8) (диффузия)
4. AddRoundKey - XOR с раундовым ключом (ключевое воздействие)

Без MixColumns в последнем раунде.

Feistel-структура (DES, Blowfish):
Делим блок на две половины L и R.
Раунд: L' = R, R' = L XOR F(R, K_i)
Дешифрование = шифрование с обратным порядком ключей.
AES НЕ использует Feistel (он SPN - Substitution-Permutation Network).
```

---

## Потоковые шифры

### Что такое потоковый шифр

```
Потоковый шифр генерирует бесконечный псевдослучайный keystream
из ключа (и nonce). Данные шифруются побитно (или побайтно) через XOR.

Ciphertext_i = Plaintext_i XOR Keystream_i

Свойства:
- Нет понятия "блок" - работает с произвольной длиной данных
- Не требует padding
- Шифрование = дешифрование (одна и та же операция XOR)
- Быстрее на железе без AES-NI
```

### ChaCha20

```
Современный потоковый шифр, разработан Бернштейном (2008).
Основан на функции ARX: Addition, Rotation, XOR - без таблиц подстановок.

Параметры:
- Ключ: 256 бит
- Nonce: 96 бит (12 байт) в ChaCha20-IETF (RFC 7539)
- Counter: 32 бита
- Размер блока keystream: 512 бит (64 байта)
- Раундов: 20

Применение:
- TLS 1.3: TLS_CHACHA20_POLY1305_SHA256
- WireGuard, SSH, QUIC
- Android, iOS (когда нет AES-NI)

Преимущество перед AES:
На устройствах без AES-NI (старые ARM) ChaCha20 быстрее и безопаснее
(нет timing-атак через cache, т.к. нет таблиц).
```

### RC4 (устаревший, не использовать)

```
Исторический потоковый шифр, полностью сломан.
Запрещён в TLS (RFC 7465, 2015).

Проблемы:
- Статистические слабости в первых байтах keystream
- Атаки на WEP (Wi-Fi): повторный IV -> many-time pad
- NOMORE атака (2015): восстановление cookies в HTTPS

Никогда не использовать RC4 в новых системах.
```

---

## Принципы Керкгоффса

```
Огюст Керкгоффс, 1883:
"Криптосистема должна быть безопасной, даже если всё о системе,
кроме ключа, является общедоступным знанием."

Клод Шеннон переформулировал: "Предполагай, что враг знает систему."

Что это значит на практике:
- Безопасность = секретность КЛЮЧА, а не алгоритма
- Алгоритм публикуется и проверяется криптографическим сообществом
- "Security through obscurity" (безопасность через неизвестность) - не работает

Примеры нарушения:
- DVD CSS: проприетарный алгоритм, вскрыт за несколько часов после утечки
- GSM A5/1: засекреченный алгоритм, взломан когда стал известен
- Clipper chip (NSA, 1993): бэкдор через секретный алгоритм Skipjack

Правильный подход:
AES, ChaCha20, SHA-256 - публичные, многократно проверенные алгоритмы.
```

---

## Конфузия и диффузия

```
Шеннон (1949) определил два свойства, необходимых для стойкого шифра:

КОНФУЗИЯ (Confusion):
Связь между ключом и шифртекстом должна быть максимально сложной.
Изменение одного бита ключа должно влиять на весь шифртекст непредсказуемо.
Реализация в AES: SubBytes (S-box замены)

ДИФФУЗИЯ (Diffusion):
Изменение одного бита открытого текста должно влиять
на множество битов шифртекста (в идеале - на половину).
Реализация в AES: ShiftRows + MixColumns

Лавинный эффект (Avalanche Effect):
Изменение 1 бита входа -> изменение ~50% битов выхода.
AES обеспечивает полный лавинный эффект за 2 раунда.

Пример:
Plaintext:  00000000 00000000 00000000 00000000
                     vs
Plaintext:  10000000 00000000 00000000 00000000  (1 бит разницы)
После AES-128: шифртексты отличаются примерно в 64 битах из 128.
```

---

## Ключи: генерация и размер

### Размер ключа и стойкость

```
Стойкость шифра = сложность атаки перебора ключей (brute force).

Размер ключа   Комбинаций     Время перебора (10^12 ключей/с)
-----------   -----------     ------------------------------
56 бит        2^56 = 7.2*10^16   ~20 часов (DES - сломан в 1998!)
64 бита       2^64 = 1.8*10^19   ~213 дней
80 бит        2^80 = 1.2*10^24   ~38 000 лет
128 бит       2^128              практически бесконечно
256 бит       2^256              невозможно даже для квантовых компьютеров

Квантовые компьютеры (алгоритм Гровера):
Снижают стойкость симметричного шифра вдвое (в битах).
AES-128 -> 64 бита эффективной стойкости (спорно, требует огромных ресурсов)
AES-256 -> 128 бит стойкости (безопасно)

Рекомендация NIST (2024+): AES-128 и выше допустимы.
Для долгосрочной безопасности (>10 лет): AES-256.
```

### Генерация ключей

```
Золотое правило: ключи генерируются из криптографически стойкого
генератора псевдослучайных чисел (CSPRNG).

Источники энтропии в ОС:
- Linux:   /dev/urandom (рекомендуется), /dev/random
           getrandom() системный вызов (Linux 3.17+)
- Windows: BCryptGenRandom(), CryptGenRandom()
- macOS:   SecRandomCopyBytes(), arc4random()

НИКОГДА не использовать для ключей:
- rand() / random() из стандартной библиотеки C
- Math.random() в JavaScript
- Текущее время (timestamp)
- Предсказуемые паттерны

# Python: правильная генерация ключа
import os
key_128 = os.urandom(16)   # 128 бит
key_256 = os.urandom(32)   # 256 бит

# secrets модуль (Python 3.6+)
import secrets
key = secrets.token_bytes(32)
```

### Получение ключей из паролей (KDF)

```
Пользовательские пароли имеют низкую энтропию (~20-40 бит реальной).
Напрямую использовать пароль как AES-ключ - опасно.

Нужна Key Derivation Function (KDF):
Пароль + Соль -> KDF -> Ключ нужного размера

PBKDF2 (RFC 8018):
  key = PBKDF2(password, salt, iterations, dklen, PRF=HMAC-SHA256)
  NIST рекомендует: 600 000+ итераций для SHA-256 (2023)
  Минус: параллелизуется на GPU/ASIC

bcrypt:
  Разработан для хранения паролей (хэш), не для генерации ключей
  Ограничение: максимум 72 байта входного пароля

Argon2 (победитель Password Hashing Competition 2015):
  Три варианта: Argon2d, Argon2i, Argon2id (рекомендуется)
  Параметры: time_cost, memory_cost, parallelism
  Устойчив к GPU/ASIC атакам (memory-hard)
  Рекомендация: Argon2id с 64MB памяти, 3 итерации

scrypt (Colin Percival, 2009):
  Также memory-hard, широко используется (LUKS, Ethereum)

# Python: Argon2
from argon2 import PasswordHasher
from argon2.low_level import hash_secret_raw, Type
import os

salt = os.urandom(16)
key = hash_secret_raw(
    secret=b"user_password",
    salt=salt,
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,        # 256-битный ключ
    type=Type.ID        # Argon2id
)
```

---

## Режимы работы

```
Блочный шифр (AES) сам по себе шифрует только один 16-байтный блок.
Режим работы определяет, как обрабатываются данные произвольной длины.

Основные режимы:

ECB (Electronic Codebook):
  Каждый блок шифруется независимо.
  НЕБЕЗОПАСЕН: одинаковые блоки -> одинаковый шифртекст.

CBC (Cipher Block Chaining):
  Ci = AES(Pi XOR C(i-1)), IV = случайный.
  Последовательное шифрование. Уязвим к Padding Oracle без MAC.

CTR (Counter):
  Keystream = AES(Nonce||Counter). Ci = Pi XOR KS_i.
  Параллельный. Потоковый режим. Нет padding.

GCM (Galois/Counter Mode):
  CTR + GHASH аутентификация. AEAD режим.
  Конфиденциальность + целостность + аутентичность.
  Стандарт де-факто для новых систем.

Подробно: см. wiki "AES - режимы ECB, CBC, CTR, GCM"
```

---

## Аутентифицированное шифрование (AEAD)

```
Шифрование без аутентификации защищает только конфиденциальность.
Злоумышленник может изменить шифртекст, и получатель примет изменённые данные.

AEAD (Authenticated Encryption with Associated Data):
Одновременно обеспечивает:
1. Конфиденциальность (encryption)
2. Целостность (integrity) - данные не изменены
3. Аутентичность (authenticity) - данные от нужного отправителя
4. Аутентификация AAD - дополнительные данные проверяются, но не шифруются

Принцип Encrypt-then-MAC:
  1. Зашифруй: C = Enc(K1, P)
  2. Вычисли MAC: Tag = MAC(K2, C)
  3. Отправь: C || Tag
  4. Получатель: сначала проверяет Tag, потом расшифровывает

Порядок важен:
  Encrypt-then-MAC  -> безопасно (TLS 1.2 с HMAC, IPSec)
  MAC-then-Encrypt  -> уязвимо к Padding Oracle (SSL 3.0, TLS 1.0)
  Encrypt-and-MAC   -> небезопасно (SSH v1)

AEAD алгоритмы (рекомендуются):
  AES-GCM:          блочный шифр + GHASH
  ChaCha20-Poly1305: потоковый шифр + Poly1305 MAC
  AES-CCM:          CTR + CBC-MAC (IoT, 802.15.4)
  AES-SIV:          детерминированный AEAD
```

---

## MAC и HMAC

```
MAC (Message Authentication Code) - короткий тег, который подтверждает
целостность и аутентичность данных.

HMAC (Hash-based MAC):
  HMAC(K, M) = H((K XOR opad) || H((K XOR ipad) || M))

  Где H - хэш-функция (SHA-256, SHA-512)
  ipad = 0x36, opad = 0x5C (константы)

  HMAC-SHA256: 256-битный тег
  Безопасен если H безопасна (нет атаки length extension, в отличие от H(K||M))

CMAC (Cipher-based MAC):
  На основе блочного шифра (AES-CMAC).
  Используется в IPSec, 3GPP.

Poly1305:
  Одноразовый MAC (one-time MAC) - ключ используется только раз.
  В паре с ChaCha20 или AES (AES-Poly1305).
  Очень быстрый, используется в WireGuard, TLS 1.3.

# Python: HMAC
import hmac, hashlib, os

key = os.urandom(32)
message = b"Data to authenticate"

tag = hmac.new(key, message, hashlib.sha256).digest()  # 32 байта

# Проверка (константное время!):
is_valid = hmac.compare_digest(
    tag,
    hmac.new(key, message, hashlib.sha256).digest()
)
```

---

## Атаки на симметричные шифры

### Теоретические атаки

```
Brute Force (перебор ключей):
  Перебираем все возможные ключи.
  Стоимость: O(2^|key|)
  Защита: достаточный размер ключа (128+ бит)

Differential Cryptanalysis (дифференциальный криптоанализ):
  Анализируем разницы в открытых текстах и соответствующих шифртекстах.
  Атака на раунды шифра, позволяет восстановить ключ быстрее brute force.
  DES уязвим. AES проектировался с учётом этой атаки.

Linear Cryptanalysis (линейный криптоанализ):
  Ищем линейные приближения между битами PT, CT и ключа.
  Первая практическая атака на DES (Matsui, 1993).
  AES устойчив.

Meet-in-the-Middle (встреча посередине):
  Атака на двойное шифрование: Enc(K2, Enc(K1, P)) = C
  Не даёт двойной стойкости! 2DES = 2^56 стойкость, не 2^112.
  Именно поэтому используют 3DES (но и он устарел).

Related-Key атаки:
  Анализ шифртекстов, полученных похожими, но разными ключами.
  AES-256 теоретически уязвим (теоретически - не практически).
```

### Практические атаки

```
Padding Oracle:
  Сервер раскрывает, правильный ли padding -> побайтовое дешифрование без ключа.
  POODLE (2014): SSL 3.0 + CBC
  Защита: Encrypt-then-MAC или AEAD.

Timing Attack:
  Время выполнения зависит от данных -> утечка информации.
  Пример: сравнение MAC через == завершается при первом несовпадении байта.
  Защита: hmac.compare_digest() - константное время.

Cache-Timing (таблицы замен AES):
  Доступ к разным адресам кэша занимает разное время.
  Атаки на программный AES через S-box таблицы.
  Защита: AES-NI инструкции (аппаратный AES без таблиц).

Nonce Reuse:
  Повторное использование (Key, Nonce) в CTR/GCM -> катастрофа.
  Защита: случайный nonce или счётчик с гарантией уникальности.

Birthday Attack:
  При блоке 64 бита коллизии ожидаются через 2^32 блоков = 32 ГБ.
  SWEET32 (2016): атака на 3DES и Blowfish (64-битный блок).
  Защита: использовать 128-битный блок (AES).
```

---

## Управление ключами в системах

### Жизненный цикл ключа

```
1. Генерация  -> CSPRNG, достаточная длина
2. Хранение   -> защищённое хранилище (HSM, KMS, Vault)
3. Передача   -> только через защищённый канал (TLS, ECDH)
4. Ротация    -> периодическая смена ключей
5. Отзыв      -> механизм инвалидации скомпрометированных ключей
6. Уничтожение -> гарантированное удаление (shred, HSM erase)
```

### Иерархия ключей

```
Организация ключей по уровням:

Master Key (KEK - Key Encrypting Key):
  - Хранится в HSM (Hardware Security Module)
  - Никогда не покидает HSM в открытом виде
  - Используется только для шифрования других ключей

Data Encryption Key (DEK):
  - Шифрует реальные данные
  - Хранится зашифрованным с помощью KEK
  - Ротируется регулярно (раз в день/час/сообщение)

Session Key:
  - Временный ключ для одной сессии (TLS, SSH)
  - Генерируется при каждом соединении (ECDH)
  - Обеспечивает forward secrecy

Envelope Encryption (конвертное шифрование):
  DEK = random_key()
  Ciphertext = AES_DEK(Plaintext)
  Encrypted_DEK = AES_KEK(DEK)
  Хранить: Ciphertext + Encrypted_DEK

  При дешифровании:
  DEK = AES_KEK^(-1)(Encrypted_DEK)  // запрос к KMS
  Plaintext = AES_DEK^(-1)(Ciphertext)
```

### KMS и HSM

```
KMS (Key Management Service):
  Облачный сервис управления ключами.
  AWS KMS, Google Cloud KMS, Azure Key Vault.
  API: encrypt(KeyId, Plaintext), decrypt(KeyId, Ciphertext)
  Ротация ключей, аудит, IAM интеграция.

HSM (Hardware Security Module):
  Физическое устройство для хранения ключей.
  Ключи не могут быть извлечены в открытом виде.
  FIPS 140-2/3 сертификация (Level 2, 3, 4).
  Примеры: Thales Luna, AWS CloudHSM, YubiHSM.
  Применение: банки, PKI корневые ключи, коды подписи.
```

---

## Perfect Forward Secrecy (PFS)

```
Если долговременный ключ скомпрометирован, старые сессии
должны оставаться защищёнными.

Без PFS:
  TLS с RSA key exchange: клиент шифрует pre-master secret публичным ключом сервера.
  Если приватный ключ сервера утечёт -> расшифровываем ВСЕ старые сессии.

С PFS (Ephemeral Diffie-Hellman, ECDHE):
  Для каждой сессии генерируется новая пара ключей ECDH.
  Долговременный ключ используется только для аутентификации подписи.
  Компрометация долговременного ключа -> нельзя расшифровать прошлые сессии.

TLS 1.3 обязывает PFS: только ECDHE cipher suites.
TLS 1.2: DHE и ECDHE cipher suites - опционально.

Сессионный ключ в TLS 1.3:
ECDHE secret + PSK (если есть) -> HKDF -> master_secret
master_secret -> HKDF expand -> client_key, server_key (AES-256-GCM)
```

---

## Шифрование на практике

### Шифрование файла (Python)

```python
from Crypto.Cipher import AES
import os, struct

def encrypt_file(key: bytes, infile: str, outfile: str):
    """AES-256-GCM шифрование файла"""
    nonce = os.urandom(12)

    with open(infile, 'rb') as f:
        plaintext = f.read()

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    with open(outfile, 'wb') as f:
        # Формат: [nonce 12 байт][tag 16 байт][ciphertext]
        f.write(nonce + tag + ciphertext)

def decrypt_file(key: bytes, infile: str, outfile: str):
    """AES-256-GCM дешифрование файла"""
    with open(infile, 'rb') as f:
        data = f.read()

    nonce      = data[:12]
    tag        = data[12:28]
    ciphertext = data[28:]

    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except ValueError:
        raise ValueError("Тег аутентификации не совпадает - файл повреждён или подделан")

    with open(outfile, 'wb') as f:
        f.write(plaintext)

# Использование:
key = os.urandom(32)  # сохранить безопасно!
encrypt_file(key, "secret.pdf", "secret.pdf.enc")
decrypt_file(key, "secret.pdf.enc", "secret_recovered.pdf")
```

### Шифрование с паролем (Python)

```python
from Crypto.Cipher import AES
from argon2.low_level import hash_secret_raw, Type
import os

def encrypt_with_password(password: str, plaintext: bytes) -> bytes:
    """Шифрование данных паролем через Argon2id + AES-256-GCM"""
    salt  = os.urandom(16)
    nonce = os.urandom(12)

    # KDF: пароль -> ключ
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

    # Формат: [salt 16][nonce 12][tag 16][ciphertext]
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
    return cipher.decrypt_and_verify(ciphertext, tag)  # ValueError при подделке
```

---

## OpenSSL - практика

```bash
# Генерация случайного ключа
openssl rand -hex 32              # 256 бит в hex
openssl rand -base64 32           # 256 бит в base64

# Шифрование файла AES-256-GCM с паролем
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 \
    -in plaintext.txt -out encrypted.bin \
    -k "MySecretPassword"

# Дешифрование
openssl enc -d -aes-256-gcm -pbkdf2 -iter 600000 \
    -in encrypted.bin -out plaintext.txt \
    -k "MySecretPassword"

# Зашифровать с явным ключом и IV (hex)
KEY=$(openssl rand -hex 32)
IV=$(openssl rand -hex 16)
openssl enc -aes-256-cbc -K $KEY -iv $IV \
    -in file.txt -out file.enc

# Бенчмарк
openssl speed -evp aes-128-gcm aes-256-gcm aes-128-cbc

# Проверить AES-NI
openssl speed -evp aes-128-gcm 2>&1
grep -m1 aes /proc/cpuinfo
```

---

## Распространённые ошибки

```
1. Использование слабого RNG для генерации ключей
   Плохо:  key = str(time.time()).encode()[:16]
   Хорошо: key = os.urandom(16)

2. Захардкоженный ключ в исходном коде
   Плохо:  KEY = b"mysecretkey12345"
   Хорошо: ключ из KMS / переменных среды / HSM

3. Повторный nonce/IV в CTR или GCM
   Результат: раскрытие открытого текста или потеря аутентификации

4. CBC без аутентификации
   Уязвим к bit-flipping и Padding Oracle

5. Пароль напрямую как ключ
   Плохо:  key = password.encode().ljust(16)[:16]
   Хорошо: key = Argon2id(password, salt, ...)

6. Некриптостойкое сравнение тегов
   Плохо:  received_tag == computed_tag  (timing attack!)
   Хорошо: hmac.compare_digest(received_tag, computed_tag)

7. ECB для шифрования данных
   Паттерны открытого текста видны в шифртексте

8. Слишком малый размер ключа
   3DES (112 бит), DES (56 бит) - устарели и небезопасны
```

---

## Шпаргалка

```
Типы шифров:
  Блочный (AES): шифрует фиксированные блоки, нужен режим работы
  Потоковый (ChaCha20): XOR с keystream, произвольная длина

Выбор алгоритма (2024+):
  Шифрование данных:     AES-256-GCM
  Без AES-NI (ARM):      ChaCha20-Poly1305
  Хранение паролей:      Argon2id
  MAC:                   HMAC-SHA256 или Poly1305

Размеры ключей:
  AES-128: 128 бит -> 2^128 вариантов (норм)
  AES-256: 256 бит -> 2^256 вариантов (рекомендуется)
  Квантовые: AES-256 -> 128 бит эффективной стойкости

Генерация ключей:
  os.urandom(32)                  # Python
  /dev/urandom                    # Linux
  BCryptGenRandom()               # Windows

KDF (из пароля -> ключ):
  Argon2id  -> рекомендуется (memory-hard)
  scrypt    -> альтернатива
  PBKDF2    -> 600k+ итераций SHA-256 (NIST 2023)

Принципы:
  Керкгоффса: безопасность = секрет ключа, не алгоритма
  AEAD:       всегда шифруй И аутентифицируй
  PFS:        новый ключ для каждой сессии (ECDHE)
  Nonce:      никогда не повторять (Key, Nonce)

Команды:
  openssl rand -hex 32                      # случайный ключ
  openssl speed -evp aes-256-gcm            # бенчмарк
  grep aes /proc/cpuinfo                    # AES-NI
```

---

## Ссылки

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - стандарт AES
- [NIST SP 800-57](https://csrc.nist.gov/publications/detail/sp/800/57/pt1/rev5/final) - рекомендации по управлению ключами
- [NIST SP 800-131A](https://csrc.nist.gov/publications/detail/sp/800/131/a/rev2/final) - переходы криптографических алгоритмов
- [RFC 7539](https://www.rfc-editor.org/rfc/rfc7539) - ChaCha20 и Poly1305
- [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116) - AEAD интерфейс
- [RFC 8018](https://www.rfc-editor.org/rfc/rfc8018) - PBKDF2
- [Password Hashing Competition](https://www.password-hashing.net/) - Argon2
- [Cryptography Engineering](https://www.schneier.com/books/cryptography-engineering/) - Ferguson, Schneier, Kohno
