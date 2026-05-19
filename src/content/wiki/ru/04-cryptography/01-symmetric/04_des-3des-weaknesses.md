---
title: "DES и 3DES - почему слабые"
date: "2026-05-15"
---

DES (Data Encryption Standard) - блочный шифр, принятый как стандарт США в 1977 году. Был повсеместным стандартом на протяжении двух десятилетий, но сегодня считается полностью сломанным. 3DES - попытка продлить жизнь DES тройным применением, но и он устарел и запрещён NIST с 2023 года.

---

## DES: история и параметры

```
Разработчик: IBM (команда Хорста Фейстеля), при участии АНБ
Принят: NIST (тогда NBS) в 1977 году, FIPS PUB 46
Отозван: NIST в 2005 году (формально), запрещён в 2023

Параметры:
  Размер блока:  64 бита (8 байт)
  Размер ключа:  56 бит (физически 64 бита, 8 бит - биты чётности)
  Раундов:       16
  Структура:     сеть Фейстеля (Feistel network)

Число возможных ключей: 2^56 = 72 057 594 037 927 936 (~72 квадриллиона)
```

### Контекст появления

```
1973: NBS объявил конкурс на национальный стандарт шифрования.
IBM представила Lucifer (128-битный ключ, 64-битный блок).
АНБ попросило IBM уменьшить ключ до 56 бит и доработать S-box.

Споры с самого начала:
- Почему 56 бит, а не 64 или 128?
- АНБ изменило S-box: случайное укрепление или бэкдор?

Позже (1990): Биham и Шамир изобрели дифференциальный криптоанализ.
Оказалось, S-box DES уже оптимизирован против этой атаки.
АНБ знало об этой атаке за 15 лет до публичного открытия.
Укрепили S-box - не ослабили. Но ключ всё равно оставили коротким.
```

---

## Структура DES: сеть Фейстеля

### Общая схема

```
Plaintext (64 бита)
       |
   IP (Initial Permutation)
       |
  ┌────┴────┐
  L0 (32)  R0 (32)
  │         │
  │    ┌────┘
  │    │  F(R0, K1)
  │    │     │
  └─XOR┘     │
  R1=L0 XOR F(R0,K1)
  L1=R0
       │
  ... 16 раундов ...
       │
   IP^(-1) (Final Permutation)
       │
Ciphertext (64 бита)

Раунд i:
  L_i = R_(i-1)
  R_i = L_(i-1) XOR F(R_(i-1), K_i)

Дешифрование = шифрование с обратным порядком подключей K16..K1.
```

### Функция F (раундовая функция)

```
F(R, K):

R (32 бита)
    |
    E  (expansion: 32 -> 48 бит, некоторые биты дублируются)
    |
  XOR с K (48 бит)
    |
   S-boxes (8 штук, каждый 6->4 бита, итого 48->32 бита)
    |
    P  (permutation: перестановка 32 бит)
    |
  результат (32 бита)

S-boxes - ключевой элемент нелинейности DES.
Без них DES был бы линейным и тривиально взламывался.
```

### S-box: пример

```
S1 (первый из восьми S-box):
Вход: 6 бит b1 b2 b3 b4 b5 b6
Строка: b1 b6 (2 бита -> 0-3)
Столбец: b2 b3 b4 b5 (4 бита -> 0-15)

       0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
Ряд 0: 14  4 13  1  2 15 11  8  3 10  6 12  5  9  0  7
Ряд 1:  0 15  7  4 14  2 13  1 10  6 12 11  9  5  3  8
Ряд 2:  4  1 14  8 13  6  2 11 15 12  9  7  3 10  5  0
Ряд 3: 15 12  8  2  4  9  1  7  5 11  3 14 10  0  6 13

Пример: вход = 011011
  b1=0, b6=1 -> строка 01 = 1
  b2b3b4b5 = 1101 = 13
  S1[1][13] = 5 -> выход = 0101
```

### Key Schedule DES

```
Из 64-битного ключа (56 значащих) генерируется 16 подключей по 48 бит:

1. PC-1 (Permuted Choice 1): 64 -> 56 бит (убираем биты чётности)
2. Делим на C0 (28 бит) и D0 (28 бит)
3. Для каждого раунда i:
   - Циклический сдвиг влево: C_i = LS_i(C_(i-1)), D_i = LS_i(D_(i-1))
     LS = 1 бит для раундов 1,2,9,16; 2 бита для остальных
4. PC-2 (Permuted Choice 2): 56 -> 48 бит (выбираем 48 из 56)

Проблема key schedule:
  Слабые ключи (weak keys): 4 ключа, при которых K_i = K_(16-i+1)
  -> шифрование = дешифрование!
  Полуслабые ключи (semi-weak keys): 12 пар ключей
  Связанные ключи: различия в ключах предсказуемо распространяются
```

---

## Почему DES слабый

### 1. Критически маленький ключ: 56 бит

```
2^56 = 72 квадриллиона ключей - звучит много.
Но:

1977: перебор 2^56 требовал специализированного железа за миллионы $.
1993: Wiener показал, что машина за $1 млн взломает DES за 3.5 часа.
1998: EFF Deep Crack (стоимость $250 000) взломала DES за 56 часов.
1999: Deep Crack + distributed.net: 22 часа 15 минут.
2006: COPACOBANA (FPGA, $10 000): 6-7 дней в среднем, 26 часов в лучшем.
2012: COPACOBANA нового поколения: меньше суток.
2024: современный GPU кластер: часы или минуты.

Вывод: 56-битный ключ - недостаточная защита уже с конца 1990-х.
```

### 2. Маленький блок: 64 бита

```
64-битный блок -> birthday bound при 2^32 блоках = 32 ГБ данных.

Birthday Bound: при шифровании 2^(n/2) блоков одним ключом
вероятность коллизии двух блоков достигает ~50%.

При коллизии блоков в CBC:
C_i = C_j => AES_K(P_i XOR C_(i-1)) = AES_K(P_j XOR C_(j-1))
=> P_i XOR C_(i-1) = P_j XOR C_(j-1)
=> P_i XOR P_j = C_(i-1) XOR C_(j-1)  (всё известно кроме P_i,P_j)

Утечка XOR двух блоков открытого текста!

SWEET32 атака (2016):
  Цель: 3DES и Blowfish (64-битный блок) в TLS
  Метод: HTTPS сессия с большим объёмом трафика (например, long-poll)
         Собираем 2^32 блоков (~32 ГБ)
         Ждём коллизии -> восстанавливаем части HTTP заголовков
  CVE: CVE-2016-2183
  Результат: браузеры ограничили 3DES до 2^20 блоков (1 МБ) на соединение
```

### 3. Слабые ключи

```
DES имеет особые категории ключей:

Слабые ключи (4 штуки):
  0x0101010101010101  (все нули с битами чётности)
  0xFEFEFEFEFEFEFEFE  (все единицы)
  0x1F1F1F1F0E0E0E0E
  0xE0E0E0E0F1F1F1F1

  При этих ключах: K_i = K_(17-i) -> все подключи одинаковы
  DES_K(DES_K(P)) = P  (двойное шифрование = инволюция!)

Полуслабые ключи (6 пар):
  Два ключа K1 и K2: DES_K1(DES_K2(P)) = P для всех P
  DES_K1 является инверсией DES_K2

Возможно-слабые ключи: 48 штук (подключи принимают меньше различных значений)

На практике: вероятность случайно выбрать слабый ключ = 4/2^56 - ничтожна.
Но при систематическом поиске эти ключи нужно исключать.
```

### 4. Дифференциальный и линейный криптоанализ

```
Дифференциальный криптоанализ (Biham, Shamir 1990):
  Анализирует разницы в парах открытых текстов и шифртекстов.
  На DES: требует 2^47 выбранных открытых текстов.
  Лучше brute force (2^56), но только теоретически полезно.

Линейный криптоанализ (Matsui 1993):
  Первая практически применимая атака на DES.
  Находит линейные приближения S-box.
  Требует 2^43 известных открытых текстов.
  Практически продемонстрировал на 12 раундах, затем на полных 16.

Обе атаки подтвердили:
  S-box спроектированы достаточно хорошо против этих методов.
  Главная слабость DES - размер ключа 56 бит, а не конструкция.
```

---

## 3DES: попытка спасти DES

### Идея

```
Трижды применить DES с разными ключами.
Стандарт: ANSI X9.52, NIST SP 800-67

Три варианта (keying options):

Вариант 1 (3TDEA, рекомендуется):
  C = DES_K3(DES_K1^(-1)(DES_K2(P)))
  K1, K2, K3 - три независимых ключа (168 бит = 3 x 56)
  Эффективная стойкость: 112 бит

Вариант 2 (2TDEA):
  C = DES_K1(DES_K2^(-1)(DES_K1(P)))
  K1 = K3, K2 - другой ключ (112 бит = 2 x 56)
  Эффективная стойкость: 80 бит (из-за meet-in-the-middle)

Вариант 3 (совместимость):
  C = DES_K1(DES_K1^(-1)(DES_K1(P))) = DES_K1(P)
  K1 = K2 = K3 -> обычный DES (не использовать!)
```

### Зачем EDE (Encrypt-Decrypt-Encrypt)?

```
Почему E-D-E, а не E-E-E?

При K1 = K2 = K3:
  E-D-E: DES_K(DES_K^(-1)(DES_K(P))) = DES_K(P)   -> обычный DES (обратная совместимость!)
  E-E-E: DES_K(DES_K(DES_K(P)))     != DES_K(P)    -> нет совместимости

EDE выбрали для обратной совместимости с оборудованием DES:
Установив K1 = K2 = K3, получаем обычный DES.
Это позволяло плавно мигрировать со старых систем.
```

---

## Почему 3DES тоже слабый

### 1. Meet-in-the-Middle атака

```
Почему двойной DES (2DES) не даёт 112-битной стойкости:

C = DES_K2(DES_K1(P))

Атака:
1. Для всех 2^56 значений K1: вычисляем T = DES_K1(P), храним в таблице
2. Для всех 2^56 значений K2: вычисляем T' = DES_K2^(-1)(C)
3. Ищем совпадение T = T'

Память: O(2^56)
Время:  O(2^57) операций -> примерно 2x brute force DES

2DES обеспечивает лишь ~57 бит стойкости вместо 112!

3DES (вариант 1, K1 != K2 != K3):
Meet-in-the-middle возможен но сложнее:
Атака требует 2^112 времени и 2^56 памяти.
Эффективная стойкость: 112 бит (не 168).

3DES (вариант 2, K1 = K3):
Meet-in-the-middle снижает стойкость до ~80 бит.
```

```python
def meet_in_the_middle_2des(plaintext: bytes, ciphertext: bytes):
    """
    Демонстрация принципа meet-in-the-middle на 2DES.
    На практике требует 2^56 операций - нереально без ASIC/GPU.
    Здесь показан ПРИНЦИП на маленьких ключах.
    """
    from Crypto.Cipher import DES
    import itertools

    # Упрощение: 3-битные "ключи" для демонстрации
    block_size = 8

    # Шаг 1: строим таблицу DES_K1(P) для всех K1
    table = {}
    for k1 in range(8):  # 2^3 = 8 вариантов
        key1 = bytes([k1]) * 8  # упрощённо
        try:
            cipher1 = DES.new(key1, DES.MODE_ECB)
            mid = cipher1.encrypt(plaintext)
            table[mid] = k1
        except Exception:
            pass

    # Шаг 2: для каждого K2 проверяем DES_K2^(-1)(C)
    for k2 in range(8):
        key2 = bytes([k2]) * 8
        try:
            cipher2 = DES.new(key2, DES.MODE_ECB)
            mid = cipher2.decrypt(ciphertext)
            if mid in table:
                print(f"Найдено! K1={table[mid]}, K2={k2}")
        except Exception:
            pass
```

### 2. По-прежнему 64-битный блок

```
3DES сохраняет блок DES: 64 бита.
SWEET32 применима и к 3DES!

В TLS 3DES использовался в cipher suite:
TLS_RSA_WITH_3DES_EDE_CBC_SHA  (aka "DES-CBC3-SHA")

При объёме трафика >32 ГБ на одном ключе -> birthday bound.
Атака SWEET32 (2016) продемонстрировала практическую эксплуатацию.

Реакция:
- OpenSSL: снизил приоритет 3DES
- Браузеры: ограничили число блоков 3DES до 2^20 (~8 МБ)
- NIST: запретил 3DES для новых приложений (2017), полностью (2023)
```

### 3. Скорость: в 3 раза медленнее DES

```
3DES выполняет три операции DES.
DES уже медленнее AES на современном железе (нет аппаратного ускорения).
AES-NI дает AES-128-GCM ~2-4 ГБ/с.
3DES-CBC: ~50-100 МБ/с (в 30-80 раз медленнее AES).

Нет аппаратного ускорения 3DES в современных CPU.
При одинаковой безопасности AES быстрее и безопаснее.
```

### 4. Устаревание и запреты

```
Хронология:
  2005: NIST перестал рекомендовать DES
  2008: NIST SP 800-67 Rev.1 - 3DES разрешён только с вариантом 1
  2015: PCI DSS запретил SSL и TLS 1.0, рекомендовал избегать 3DES
  2016: SWEET32 - практическая атака на 3DES в TLS
  2017: NIST SP 800-131A Rev.2 - 3DES "не рекомендуется"
  2023: NIST SP 800-131A Rev.3 - 3DES полностью запрещён ("disallowed")

Если вы видите 3DES в коде/конфиге сегодня:
  -> это технический долг, требующий немедленной замены.
```

---

## DES Cracking: исторические вехи

### EFF Deep Crack (1998)

```
Electronic Frontier Foundation построила специализированную машину
для взлома DES, чтобы доказать его небезопасность.

Стоимость: $250 000
Архитектура: 1 856 специализированных ASIC чипов ("Deep Crack chips")
             каждый проверяет 2.5 млн ключей/с
Итого: ~90 млрд ключей/с

RSA DES Challenge III (1999):
  Совместно с distributed.net (100 000+ компьютеров)
  Время взлома: 22 часа 15 минут
  Сообщение: "See you in Rome (Second AES Candidate Conference)"

Демонстрация: 56-битный ключ недостаточен для безопасности.
```

### COPACOBANA (2006)

```
Cost-Optimized Parallel COde Breaker
Университет Бохума, Германия.

Железо: 120 FPGA (Xilinx Spartan-3)
Стоимость: ~$10 000
Производительность: 2^56 ключей за 6.4 дня в среднем

Главный урок:
  Взлом DES доступен не только государствам.
  $10 000 - это бюджет небольшой организации.
```

### Современный GPU (2024)

```
RTX 4090 hashcat DES benchmark: ~2 млрд ключей/с
Кластер из 8x RTX 4090: ~16 млрд ключей/с

Время перебора 2^56 ключей:
  8x RTX 4090: 72 057 594 037 927 936 / 16 000 000 000 ≈ 4 500 000 с ≈ 52 дня

Арендованный облачный кластер (100x A100):
  ~500 млрд ключей/с -> ~1.6 дня

Стоимость аренды: несколько тысяч долларов.
Это доступно любому злоумышленнику с бюджетом.
```

---

## Атаки на DES/3DES: сводка

### Таблица атак

```
Атака                  Цель      Сложность         Данные         Практичность
--------------------   ------    ---------------   ----------     ------------
Brute Force            DES       2^56 = 7*10^16    любые CT       Да (1998+)
Brute Force            2DES      2^57              любые CT       Да
Meet-in-the-Middle     2DES      2^57 времени      2 PT-CT пары   Да
                                 2^56 памяти
Lineiniy (Matsui)      DES       2^43 KP           2^43 PT-CT     Теория
Differentsialny        DES       2^47 CPA           2^47 выбр.PT   Теория
SWEET32                3DES/CBC  2^32 блоков        32 ГБ CT       Да (2016+)
                                 ~2^32 + offline
Slabiye klyuchi        DES       4 ключа            1 пара PT-CT   Теория
Meet-in-the-Middle     3DES v1   2^112 времени      2^56 PT        Теория
                                 2^56 памяти
```

### Практические атаки сегодня

```
DES:
  Brute force доступен за часы/дни на GPU кластере.
  Стоимость: несколько тысяч долларов.
  Любая организация может взломать за разумное время.

2DES:
  Meet-in-the-middle: фактически как 2x DES.
  Не даёт реальной безопасности.

3DES (вариант 1):
  Прямой brute force требует 2^112 - невозможно.
  Но SWEET32 атака практична при достаточном объёме трафика.
  64-битный блок - принципиальное ограничение.
  Медленный: непрактичен в современных системах.
```

---

## Сравнение DES / 3DES / AES

```
Параметр          DES           3DES(v1)        AES-128       AES-256
---------         ---           --------        -------       -------
Год               1977          1998            2001          2001
Размер блока      64 бит        64 бит          128 бит       128 бит
Размер ключа      56 бит        168 бит         128 бит       256 бит
Эфф. стойкость    ~0 бит*       112 бит         128 бит       256 бит
Раундов           16            48 (3x16)       10            14
Скорость(AES-NI)  50 МБ/с       30 МБ/с         4000 МБ/с    2500 МБ/с
Аппаратное уск.   Нет           Нет             Да (AES-NI)  Да (AES-NI)
Статус            Сломан        Запрещён(2023)  Актуален      Актуален
SWEET32           Да (64 бит)   Да (64 бит)     Нет           Нет

* 56 бит стойкости = практически нулевая защита сегодня
```

---

## Код: демонстрация слабостей

### Слабые ключи DES

```python
from Crypto.Cipher import DES
import os

# 4 слабых ключа DES (с битами чётности)
WEAK_KEYS = [
    bytes.fromhex("0101010101010101"),
    bytes.fromhex("FEFEFEFEFEFEFEFE"),
    bytes.fromhex("1F1F1F1F0E0E0E0E"),
    bytes.fromhex("E0E0E0E0F1F1F1F1"),
]

def is_weak_key(key: bytes) -> bool:
    return key in WEAK_KEYS

def demonstrate_weak_key():
    key = bytes.fromhex("0101010101010101")
    plaintext = b"ABCDEFGH"  # 8 байт

    cipher = DES.new(key, DES.MODE_ECB)
    ciphertext = cipher.encrypt(plaintext)

    # Двойное шифрование слабым ключом = исходный текст!
    cipher2 = DES.new(key, DES.MODE_ECB)
    double_encrypted = cipher2.encrypt(ciphertext)

    print(f"Plaintext:         {plaintext.hex()}")
    print(f"Ciphertext:        {ciphertext.hex()}")
    print(f"Double encrypted:  {double_encrypted.hex()}")
    print(f"PT == 2xEnc(PT):   {plaintext == double_encrypted}")  # True!

demonstrate_weak_key()
```

### Демонстрация SWEET32 (коллизия блоков)

```python
from Crypto.Cipher import DES3
import os
from collections import defaultdict

def sweet32_demo():
    """
    Демонстрация birthday bound для 64-битного блока.
    На практике нужно 2^32 блоков (~32 ГБ).
    Здесь демонстрируем принцип на малом числе блоков.
    """
    key = os.urandom(24)   # 3DES ключ
    iv  = os.urandom(8)    # 64-битный блок

    seen_blocks = defaultdict(list)
    collision_found = False

    # В реальной атаке: собираем 2^32 блоков из HTTPS трафика
    # Здесь просто показываем что коллизии неизбежны (birthday paradox)
    print("Шифруем блоки 3DES-CBC...")
    print(f"Birthday bound: при {2**32} блоках (~32 ГБ) ожидается коллизия\n")

    # Симулируем небольшое число блоков для демонстрации
    import random
    for i in range(10000):
        plaintext = os.urandom(8)  # случайный 64-битный блок
        cipher = DES3.new(key, DES3.MODE_ECB)
        ct = cipher.encrypt(plaintext)

        if ct in seen_blocks:
            print(f"Коллизия блока #{i}!")
            print(f"Шифртекст: {ct.hex()}")
            print(f"P1: {seen_blocks[ct][0].hex()}")
            print(f"P2: {plaintext.hex()}")
            print(f"P1 XOR P2: {bytes(a^b for a,b in zip(seen_blocks[ct][0], plaintext)).hex()}")
            collision_found = True
            break
        else:
            seen_blocks[ct].append(plaintext)

    if not collision_found:
        print(f"Коллизии не найдено в {10000} блоков (ожидаемо - нужно 2^32)")
        print(f"Уникальных блоков: {len(seen_blocks)}")

sweet32_demo()
```

### Сравнение скорости DES/3DES/AES

```python
import time
import os
from Crypto.Cipher import DES, DES3, AES

def benchmark(name, cipher_factory, data_size=10*1024*1024):
    """Бенчмарк шифрования (10 МБ)"""
    data = os.urandom(data_size)

    start = time.perf_counter()
    cipher = cipher_factory()
    ct = cipher.encrypt(data)
    elapsed = time.perf_counter() - start

    speed = data_size / elapsed / 1024 / 1024  # МБ/с
    print(f"{name:20s}: {speed:8.1f} МБ/с")

key_des  = os.urandom(8)
key_3des = os.urandom(24)
key_aes  = os.urandom(32)

benchmark("DES-ECB",     lambda: DES.new(key_des, DES.MODE_ECB))
benchmark("3DES-ECB",    lambda: DES3.new(key_3des, DES3.MODE_ECB))
benchmark("AES-128-ECB", lambda: AES.new(key_aes[:16], AES.MODE_ECB))
benchmark("AES-256-ECB", lambda: AES.new(key_aes, AES.MODE_ECB))

# Примерный вывод (без AES-NI):
# DES-ECB             :     80.0 МБ/с
# 3DES-ECB            :     27.0 МБ/с
# AES-128-ECB         :   1200.0 МБ/с
# AES-256-ECB         :    900.0 МБ/с
```

---

## Миграция с DES/3DES на AES

### Что заменить

```
DES/3DES встречается в:
- Унаследованных банковских системах (SWIFT, HSM)
- POS терминалы, банкоматы (PIN Block шифрование)
- Старые VPN конфигурации (IPSec: 3des-cbc)
- Старые TLS cipher suites (DES-CBC3-SHA)
- Кардридеры, смарт-карты (EMV)
- Шифрование баз данных в legacy системах

Проверка TLS cipher suites:
openssl s_client -connect host:443 -cipher 'DES:3DES' 2>&1 | grep Cipher

Проверка IPSec:
ipsec statusall | grep 3DES
```

### Замена в OpenSSL

```bash
# Проверить какие cipher suites поддерживаются
openssl ciphers -v 'ALL' | grep -E 'DES|3DES'

# Исключить DES/3DES из TLS
# В nginx.conf:
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:!3DES:!DES';

# В Apache:
SSLCipherSuite ECDHE-ECDSA-AES256-GCM-SHA384:!3DES:!DES

# Минимальная конфигурация TLS 1.2+ без слабых шифров:
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:!aNULL:!eNULL:!DES:!3DES:!RC4';
```

### Замена в Python коде

```python
# ПЛОХО: DES
from Crypto.Cipher import DES
key = os.urandom(8)
cipher = DES.new(key, DES.MODE_CBC, iv=os.urandom(8))
ct = cipher.encrypt(pad(data, 8))

# ПЛОХО: 3DES
from Crypto.Cipher import DES3
key = os.urandom(24)
cipher = DES3.new(key, DES3.MODE_CBC, iv=os.urandom(8))
ct = cipher.encrypt(pad(data, 8))

# ХОРОШО: AES-256-GCM
from Crypto.Cipher import AES
import os

key   = os.urandom(32)   # 256-битный ключ
nonce = os.urandom(12)   # 96-битный nonce

cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
cipher.update(aad)                           # опциональные AAD
ciphertext, tag = cipher.encrypt_and_digest(data)
# Сохраняем: nonce + tag + ciphertext
```

### PIN Block: миграция в банковских системах

```
Историческая проблема: PIN Block шифрование в банкоматах.
Стандарт ISO 9564 изначально использовал DES/3DES.

PIN Block Format 0 (3DES):
  PIN_Block = Format || PIN_Length || PIN || Padding
  Encrypted_PIN = 3DES_K(PIN_Block XOR PAN_Block)

Проблемы:
  - 3DES устарел
  - PIN Block Format 0 уязвим к атакам при компрометации HSM

Миграция (ISO 9564-1:2017):
  PIN Block Format 4: AES-256 с включением PAN в шифрование
  Требует обновления HSM, ПО банкоматов, процессинга

PCI DSS 4.0 (2022):
  Требует миграцию с 3DES до 2025 года для новых систем.
```

---

## Openssl - практика

```bash
# Проверить что DES/3DES отключены в TLS
openssl s_client -connect example.com:443 2>/dev/null | grep -E "Cipher|Protocol"

# Принудительно использовать 3DES (для теста):
openssl s_client -connect example.com:443 -cipher 'DES-CBC3-SHA'
# Если соединение установлено - сервер поддерживает 3DES (проблема!)

# Зашифровать данные DES (не делать в продакшене!):
openssl enc -des-ecb -K 0102030405060708 -nosalt -in plain.txt -out enc.bin

# Зашифровать 3DES:
openssl enc -des-ede3-cbc -K 010203040506070801020304050607080102030405060708 \
    -iv 0102030405060708 -in plain.txt -out enc.bin

# Правильная замена - AES-256-GCM:
openssl enc -aes-256-gcm -pbkdf2 -iter 600000 -in plain.txt -out enc.bin -k "password"

# Бенчмарк для сравнения:
openssl speed des des-ede3 aes-128 aes-256

# Найти DES/3DES в конфигах системы:
grep -r "3des\|DES\|des-cbc" /etc/ssl/ /etc/nginx/ /etc/apache2/ 2>/dev/null
```

---

## Шпаргалка

```
DES:
  Ключ: 56 бит -> 2^56 -> взламывается за часы (GPU кластер)
  Блок: 64 бита -> birthday bound при 32 ГБ
  Слабые ключи: 4 штуки (двойное шифрование = plaintext)
  Статус: СЛОМАН с 1998 года, запрещён

3DES:
  Ключ: 168 бит (v1), стойкость 112 бит (meet-in-middle)
  Блок: 64 бита -> SWEET32 атака при >32 ГБ трафика
  Скорость: в 30-80 раз медленнее AES
  Статус: запрещён NIST с 2023 года

Атаки:
  Brute force DES:      2^56 -> часы на GPU кластере
  Meet-in-middle 2DES:  2^57 -> не даёт безопасности
  SWEET32 3DES:         2^32 блоков = 32 ГБ -> практична
  Lineiniy kriptoanaliz: 2^43 KP -> теоретическая

Замена:
  DES  -> AES-256-GCM
  3DES -> AES-256-GCM
  Нет PAD нет MAC -> + HMAC или переход на GCM

Команды диагностики:
  openssl ciphers -v 'ALL' | grep -E 'DES|3DES'  # найти DES
  grep -r "3des" /etc/ 2>/dev/null                 # в конфигах
  openssl speed des des-ede3 aes-128               # сравнение скорости
```

---

## Ссылки

- [FIPS 46-3](https://csrc.nist.gov/publications/detail/fips/46/3/final) - оригинальный стандарт DES (отозван)
- [NIST SP 800-67 Rev.2](https://csrc.nist.gov/publications/detail/sp/800/67/rev2/final) - 3DES (deprecated)
- [NIST SP 800-131A Rev.3](https://csrc.nist.gov/publications/detail/sp/800/131/a/rev3/final) - переходы алгоритмов (3DES запрещён)
- [SWEET32 (CVE-2016-2183)](https://sweet32.info/) - атака на 64-битные блоки
- [EFF Deep Crack](https://w2.eff.org/Privacy/Crypto/Crypto_misc/DESCracker/) - взлом DES 1998
- [Linearity Cryptanalysis of DES (Matsui 1993)](https://link.springer.com/chapter/10.1007/3-540-48285-7_33) - оригинальная статья
- [Differential Cryptanalysis (Biham, Shamir)](https://link.springer.com/book/10.1007/978-1-4613-9314-6) - книга
- [Applied Cryptography, Schneier](https://www.schneier.com/books/applied-cryptography/) - классика
