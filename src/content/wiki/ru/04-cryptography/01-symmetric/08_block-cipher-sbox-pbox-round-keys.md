---
title: "Блочные шифры - S-box, P-box, раундовые ключи"
date: "2026-05-15"
---

S-box, P-box и раундовые ключи - три строительных блока, из которых состоит любой современный блочный шифр. Понимание этих компонентов объясняет почему AES устойчив к дифференциальному криптоанализу, как конфузия и диффузия достигаются математически, и почему 10 раундов AES-128 обеспечивают безопасность 2^128.

---

## Структура блочного шифра

```
Блочный шифр - итеративная конструкция: одна и та же раундовая функция
применяется многократно с разными раундовыми ключами.

BlockCipher(K, P):
  K1, K2, ..., KR = KeySchedule(K)   <- развёртка ключа
  state = P                           <- начальное состояние
  for i in 1..R:
      state = Round(state, Ki)         <- применить раунд
  return state

Где Round обычно состоит из:
  1. SubBytes  (S-box слой)  - нелинейность
  2. PermBytes (P-box слой)  - диффузия
  3. MixLayer               - дополнительная диффузия
  4. AddRoundKey             - добавление ключевого материала

Два принципа Шеннона (1949):
  Конфузия (Confusion):  связь ключ -> шифртекст сложная (S-box)
  Диффузия (Diffusion):  один бит входа влияет на много битов выхода (P-box + Mix)
```

---

## S-box: нелинейная замена

### Что такое S-box

```
S-box (Substitution box) - таблица замены, отображающая
n входных бит в m выходных бит.

Обозначение: S: {0,1}^n -> {0,1}^m

В AES: S: {0,1}^8 -> {0,1}^8  (8 бит -> 8 бит)
  256 входных значений (0x00..0xFF)
  256 выходных значений (биекция - взаимно однозначное соответствие)

В DES: S: {0,1}^6 -> {0,1}^4  (6 бит -> 4 бит)
  8 S-box, каждый 64 входа -> 16 выходов
  Не биекция!

Зачем нужен S-box:
  Без нелинейных операций блочный шифр является аффинным.
  Аффинный шифр: C = A * P + B (матричные операции)
  Взламывается системой линейных уравнений за O(n^3).

  S-box вводит нелинейность -> линейные атаки неприменимы напрямую.
```

### AES S-box: математика

```
AES S-box - не произвольная таблица. Она строится математически:

Поле GF(2^8):
  Элементы: полиномы степени < 8 над GF(2)
  Например: 0x53 = 0101 0011 = x^6 + x^4 + x + 1
  Сложение: XOR (без переносов)
  Умножение: по модулю неприводимого полинома
             p(x) = x^8 + x^4 + x^3 + x + 1  (AES polynomial)

Конструкция AES S-box для входа b:
  Шаг 1: b' = b^(-1) в GF(2^8)  (мультипликативный обратный)
          Исключение: 0x00 -> 0x00 (нет обратного для нуля)

  Шаг 2: аффинное преобразование над GF(2):
          s = A * b' + c

Матрица A (8x8 над GF(2)):
  [1 0 0 0 1 1 1 1]
  [1 1 0 0 0 1 1 1]
  [1 1 1 0 0 0 1 1]
  [1 1 1 1 0 0 0 1]
  [1 1 1 1 1 0 0 0]
  [0 1 1 1 1 1 0 0]
  [0 0 1 1 1 1 1 0]
  [0 0 0 1 1 1 1 1]

Константа c = 0x63 = 0110 0011 (добавляется через XOR)

Результат:
  Высокая нелинейность (НЛ = 112 из максимально возможных 120)
  Оптимальна против дифференциального криптоанализа
  Оптимальна против линейного криптоанализа
```

### Таблица AES S-box

```
Полная таблица AES S-box (hex, строка = старшие 4 бита, столбец = младшие 4 бита):

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

Пример: S-box(0x53) = ?
  Строка 5, столбец 3 -> 0xed

Инверсия: для дешифрования AES использует обратный S-box (InvSubBytes).
```

```python
# Полная таблица AES S-box
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
    """SubBytes: применить S-box к каждому байту состояния AES"""
    return [AES_SBOX[b] for b in state]

# Пример
state = [0x19, 0xa0, 0x9a, 0xe9,
         0x3d, 0xf4, 0xc6, 0xf8,
         0xe3, 0xe2, 0x8d, 0x48,
         0xbe, 0x2b, 0x2a, 0x08]
result = sub_bytes(state)
print([hex(b) for b in result])
# [0xd4, 0xe0, 0xb8, 0x1e, 0x27, 0xbf, 0xb4, 0x41, ...]
```

### Нелинейность: почему она важна

```
Линейность в криптографии - враг.

Если бы S-box был линейным (аффинным):
  output = A * input + c  (матричные операции над GF(2))

  Тогда весь блочный шифр стал бы системой линейных уравнений:
  C = M * P + K_eff  (M - произведение всех матриц, K_eff - эффективный ключ)

  Линейная атака: имея 128 пар PT-CT, решаем систему уравнений.
  Время: O(n^3) = O(128^3) - мгновенно.

Нелинейность S-box (NL = 112):
  Лучшее линейное приближение: |L(x) - S(x)| <= 16 из 256 случаев.
  Атакующий может использовать линейное приближение только с вероятностью
  1/2 + 16/256 = 0.5625 (против идеальных 0.5).

  Это требует O(2^21) известных PT для одного бита ключа через
  линейный криптоанализ. Для 128-битного ключа - неприменимо.
```

### S-box в DES

```
DES использует 8 S-boxes, каждый 6->4 бита.

S1 DES (6 бит входа -> 4 бита выхода):
  Вход: b1 b2 b3 b4 b5 b6
  Строка = b1 b6 (2 бита, 0-3)
  Столбец = b2 b3 b4 b5 (4 бита, 0-15)

     0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
r=0: 14   4  13   1   2  15  11   8   3  10   6  12   5   9   0   7
r=1:  0  15   7   4  14   2  13   1  10   6  12  11   9   5   3   8
r=2:  4   1  14   8  13   6   2  11  15  12   9   7   3  10   5   0
r=3: 15  12   8   2   4   9   1   7   5  11   3  14  10   0   6  13

Пример: вход = 011011
  b1=0, b6=1 -> строка 01 = 1
  b2b3b4b5 = 1101 = 13
  S1[1][13] = 5 = 0101 (4 бита выхода)

АНБ и S-box DES:
  АНБ изменило оригинальные S-box IBM для DES.
  1990: открыт дифференциальный криптоанализ - оказалось, что S-box DES
  оптимизированы ПРОТИВ этой атаки. АНБ знало с 1974 года!
  Это была сознательная укреплённость, а не бэкдор.
```

---

## P-box: перестановка битов

### Что такое P-box

```
P-box (Permutation box) - перестановка битов (или байтов).
Переставляет позиции битов без изменения их значений.

Назначение: распространить изменение одного бита S-box
на входы нескольких S-box следующего раунда.

Без P-box:
  Изменение одного входного бита -> изменение только одного S-box.
  Диффузия ограничена одним S-box.

С P-box:
  Выходные биты одного S-box -> входные биты РАЗНЫХ S-box в следующем раунде.
  Один изменённый бит "распространяется" по всему состоянию.
```

### P-box в DES: P-перестановка

```
После 8 S-box DES применяет 32-битную P-перестановку:

Позиция вывода:   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
Позиция ввода:   16  7 20 21 29 12 28 17  1 15 23 26  5 18 31 10

Позиция вывода:  17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32
Позиция ввода:    2  8 24 14 32 27  3  9 19 13 30  6 22 11  4 25

Пример: бит 1 выхода S-box идёт на позицию 16 входа следующего раунда.
        бит 2 -> позиция 7, бит 3 -> позиция 20, ...

Эта перестановка обеспечивает: каждый бит выхода S-box_i
влияет на входы двух РАЗНЫХ S-box в следующем раунде.
```

### ShiftRows: P-box в AES

```
AES не использует битовую P-перестановку напрямую.
Вместо этого: ShiftRows - побайтовая перестановка строк матрицы состояния.

Состояние AES: матрица 4x4 байта

До ShiftRows:          После ShiftRows:
a0  a4  a8  a12        a0  a4  a8  a12   <- строка 0: без сдвига
a1  a5  a9  a13   ->   a5  a9  a13 a1    <- строка 1: сдвиг влево на 1
a2  a6  a10 a14        a10 a14 a2  a6    <- строка 2: сдвиг влево на 2
a3  a7  a11 a15        a15 a3  a7  a11   <- строка 3: сдвиг влево на 3

Для дешифрования (InvShiftRows): сдвиги в обратную сторону.

Эффект ShiftRows:
  Байты из одного столбца "растекаются" по разным столбцам.
  После MixColumns (следующий шаг) каждый байт оригинального столбца
  влияет на все 4 байта в 4 разных столбцах.

Совместно ShiftRows + MixColumns обеспечивают
полную диффузию за 2 раунда (Wide Trail Strategy).
```

```python
def shift_rows(state: list) -> list:
    """
    ShiftRows для AES.
    state: список 16 байт (матрица 4x4, column-major order)
    """
    # Переводим в матрицу 4x4 (строки и столбцы)
    m = [[state[r + 4*c] for c in range(4)] for r in range(4)]

    # Сдвигаем строки
    for r in range(4):
        m[r] = m[r][r:] + m[r][:r]  # циклический сдвиг влево на r

    # Обратно в линейный список
    return [m[r][c] for c in range(4) for r in range(4)]

# Пример
state = list(range(16))
print("До ShiftRows:  ", state)
print("После ShiftRows:", shift_rows(state))
# До:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
# После: [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]
```

---

## MixColumns: диффузия через умножение

### Математика MixColumns

```
MixColumns работает с каждым столбцом матрицы состояния независимо.
Каждый столбец (4 байта) умножается на фиксированную матрицу в GF(2^8).

Матрица MixColumns:
[2 3 1 1]
[1 2 3 1]
[1 1 2 3]
[3 1 1 2]

Умножение в GF(2^8) по модулю полинома x^8 + x^4 + x^3 + x + 1:

xtime(a) = умножение на 2 в GF(2^8):
  если a < 0x80: xtime(a) = a << 1
  если a >= 0x80: xtime(a) = (a << 1) XOR 0x1B

Умножение на 3 = xtime(a) XOR a

Результат MixColumns для одного столбца [a0, a1, a2, a3]:
  b0 = xtime(a0) XOR (xtime(a1) XOR a1) XOR a2 XOR a3
  b1 = a0 XOR xtime(a1) XOR (xtime(a2) XOR a2) XOR a3
  b2 = a0 XOR a1 XOR xtime(a2) XOR (xtime(a3) XOR a3)
  b3 = (xtime(a0) XOR a0) XOR a1 XOR a2 XOR xtime(a3)
```

```python
def xtime(a: int) -> int:
    """Умножение на 2 в GF(2^8)"""
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else (a << 1) & 0xFF

def mix_single_column(col: list) -> list:
    """MixColumns для одного столбца [a0, a1, a2, a3]"""
    a = col
    return [
        xtime(a[0]) ^ xtime(a[1]) ^ a[1] ^ a[2] ^ a[3],
        a[0] ^ xtime(a[1]) ^ xtime(a[2]) ^ a[2] ^ a[3],
        a[0] ^ a[1] ^ xtime(a[2]) ^ xtime(a[3]) ^ a[3],
        xtime(a[0]) ^ a[0] ^ a[1] ^ a[2] ^ xtime(a[3]),
    ]

def mix_columns(state: list) -> list:
    """MixColumns для всего состояния AES (16 байт)"""
    result = []
    for c in range(4):
        col = [state[r + 4*c] for r in range(4)]
        mixed = mix_single_column(col)
        result.extend(mixed)
    return result

# Демонстрация диффузии MixColumns
col = [0x01, 0x00, 0x00, 0x00]   # один ненулевой байт
mixed = mix_single_column(col)
print(f"Вход:  {[hex(x) for x in col]}")
print(f"Выход: {[hex(x) for x in mixed]}")
# Вход:  ['0x1', '0x0', '0x0', '0x0']
# Выход: ['0x2', '0x1', '0x1', '0x3']
# Один байт влияет на ВСЕ 4 байта столбца!
```

### Почему MixColumns обеспечивает диффузию

```
Матрица MixColumns - MDS (Maximum Distance Separable) матрица.

Свойство MDS: для любого ненулевого входного вектора
  вес(вход) + вес(выход) >= n + 1  (n = размер столбца = 4)

  вес = число ненулевых байт (branch number)

Для MixColumns с n=4:
  Минимальный branch number = 5
  Если 1 байт входа ненулевой -> минимум 4 байта выхода ненулевые

Это означает:
  Любое изменение в 1 байте столбца гарантированно изменит все 4 байта.
  После ShiftRows эти 4 изменённых байта попадают в 4 разных столбца.
  В следующем раунде SubBytes+ShiftRows+MixColumns -> изменение охватывает весь блок.

После 2 раундов: изменение 1 бита затрагивает весь 128-битный блок.
Это и есть "лавинный эффект" (Avalanche Effect).
```

---

## Раундовые ключи: Key Schedule

### Зачем нужны раундовые ключи

```
Если бы один и тот же ключ использовался в каждом раунде:
  Атакующий мог бы атаковать раунды независимо.
  Meet-in-the-middle между первым и последним раундом.
  Related-key атаки работали бы тривиально.

Key Schedule (развёртка ключа):
  Из одного мастер-ключа K генерируются уникальные раундовые ключи K1..KR.
  Каждый Ki добавляется в соответствующем раунде через XOR (AddRoundKey).

  Требования к Key Schedule:
  - Необратимость: из Ki нельзя восстановить K (в идеале)
  - Диффузия: изменение одного бита K влияет на все Ki
  - Лавина: похожие ключи -> совершенно разные Ki
```

### AES Key Schedule: детально

```
AES-128: ключ 128 бит -> 11 раундовых ключей по 128 бит
         (исходный ключ + 10 раундовых)

Ключ организован как 4 слова (word = 32 бита):
  W[0], W[1], W[2], W[3] = исходный ключ

Расширение для AES-128 (i = 4, 5, ..., 43):
  if i % 4 == 0:
      W[i] = W[i-4] XOR SubWord(RotWord(W[i-1])) XOR Rcon[i/4]
  else:
      W[i] = W[i-4] XOR W[i-1]

Раундовый ключ r = W[4r], W[4r+1], W[4r+2], W[4r+3]

Где:
  RotWord([a0,a1,a2,a3]) = [a1,a2,a3,a0]  <- циклический сдвиг слова
  SubWord([a0,a1,a2,a3]) = [S(a0),S(a1),S(a2),S(a3)]  <- применить S-box

  Rcon (Round Constant) - константы раундов:
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

  Rcon[i] - степени 2 в GF(2^8): x^0, x^1, x^2, ...
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
    """Циклический сдвиг слова влево на 1 байт"""
    return word[1:] + word[:1]

def sub_word(word: list) -> list:
    """Применить S-box к каждому байту слова"""
    return [AES_SBOX[b] for b in word]

def xor_words(a: list, b: list) -> list:
    """XOR двух слов"""
    return [x ^ y for x, y in zip(a, b)]

def aes128_key_schedule(key: bytes) -> list:
    """
    AES-128 Key Schedule.
    Возвращает 11 раундовых ключей (каждый 16 байт).
    """
    assert len(key) == 16, "AES-128 требует 16-байтный ключ"

    # Инициализация: разбиваем ключ на 4 слова
    w = []
    for i in range(4):
        w.append(list(key[4*i : 4*i+4]))

    # Генерация остальных слов
    for i in range(4, 44):
        temp = w[i-1][:]
        if i % 4 == 0:
            temp = sub_word(rot_word(temp))
            temp[0] ^= RCON[i // 4]
        w.append(xor_words(w[i-4], temp))

    # Собираем 11 раундовых ключей (по 4 слова = 16 байт каждый)
    round_keys = []
    for r in range(11):
        rk = []
        for i in range(4):
            rk.extend(w[4*r + i])
        round_keys.append(bytes(rk))

    return round_keys

# Демонстрация
import os
key = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
round_keys = aes128_key_schedule(key)

print(f"Мастер-ключ:  {key.hex()}")
for i, rk in enumerate(round_keys):
    print(f"  Раунд {i:2d}: {rk.hex()}")

# Мастер-ключ:  000102030405060708090a0b0c0d0e0f
# Раунд  0: 000102030405060708090a0b0c0d0e0f
# Раунд  1: d6aa74fdd2af72fadaa678f1d6ab76fe
# Раунд  2: b692cf0b643dbdf1be9bc5006830b3fe
# ...
```

### AES-256 Key Schedule

```
AES-256: ключ 256 бит (8 слов) -> 15 раундовых ключей (раундов 14)

Расширение для AES-256 (i = 8, 9, ..., 59):
  if i % 8 == 0:
      W[i] = W[i-8] XOR SubWord(RotWord(W[i-1])) XOR Rcon[i/8]
  elif i % 8 == 4:
      W[i] = W[i-8] XOR SubWord(W[i-1])   <- дополнительный SubWord!
  else:
      W[i] = W[i-8] XOR W[i-1]

Отличие от AES-128:
  При i % 8 == 4 применяется SubWord без RotWord.
  Это увеличивает нелинейность Key Schedule.
  AES-256 требует больше нелинейности из-за большего числа раундов.
```

### Зачем Rcon (Round Constants)?

```
Rcon предотвращает симметрию в раундовых ключах.

Без Rcon:
  W[0] = W[4] = W[8] = ... (периодичность в Key Schedule)
  Атаки на симметричные ключи становятся возможными.

Rcon = x^(i-1) в GF(2^8):
  Rcon[1] = 0x01 = x^0
  Rcon[2] = 0x02 = x^1
  Rcon[3] = 0x04 = x^2
  ...
  Rcon[8] = 0x80 = x^7
  Rcon[9] = 0x1b = x^8 mod p(x) = x^4 + x^3 + x + 1

Каждый раунд использует уникальную константу -> нет периодичности.
```

---

## Полный раунд AES: сборка

### Все четыре операции

```
Раунд AES (кроме последнего):

1. SubBytes:    Нелинейная замена (S-box)
2. ShiftRows:   Перестановка байтов (P-box)
3. MixColumns:  Линейная диффузия (MDS матрица в GF(2^8))
4. AddRoundKey: XOR с раундовым ключом

Последний раунд (R = 10/12/14):
1. SubBytes
2. ShiftRows
3. AddRoundKey  <- нет MixColumns!

Почему нет MixColumns в последнем раунде:
  MixColumns обратима и не добавляет безопасности в последнем раунде.
  Без MixColumns: шифрование и дешифрование симметричнее (проще реализовать).
  Безопасность не снижается: наблюдаемый шифртекст уже после ShiftRows.

Первоначальный AddRoundKey (перед первым раундом):
  state = plaintext XOR K0
  Это "ключевое отбеливание" (key whitening).
  Без него: атакующий может изучить первый раунд без ключевого вмешательства.
```

```python
def add_round_key(state: list, round_key: bytes) -> list:
    """AddRoundKey: XOR состояния с раундовым ключом"""
    return [s ^ k for s, k in zip(state, round_key)]

def aes_round(state: list, round_key: bytes, last_round: bool = False) -> list:
    """
    Один раунд AES.
    last_round=True: пропускаем MixColumns.
    """
    state = sub_bytes(state)
    state = shift_rows(state)
    if not last_round:
        state = mix_columns(state)
    state = add_round_key(state, round_key)
    return state

def aes128_encrypt(key: bytes, plaintext: bytes) -> bytes:
    """
    AES-128 шифрование одного блока.
    (Учебная реализация - для продакшена используйте Crypto.Cipher.AES)
    """
    assert len(key) == 16 and len(plaintext) == 16

    round_keys = aes128_key_schedule(key)
    state = list(plaintext)

    # Начальное добавление ключа
    state = add_round_key(state, round_keys[0])

    # 9 обычных раундов
    for r in range(1, 10):
        state = aes_round(state, round_keys[r], last_round=False)

    # Последний раунд (без MixColumns)
    state = aes_round(state, round_keys[10], last_round=True)

    return bytes(state)

# Тест с NIST test vector
key       = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
plaintext = bytes.fromhex("00112233445566778899aabbccddeeff")
expected  = bytes.fromhex("69c4e0d86a7b04300d8a8e9ebf9b6af4")  # NIST

result = aes128_encrypt(key, plaintext)
print(f"Ключ:      {key.hex()}")
print(f"PT:        {plaintext.hex()}")
print(f"CT:        {result.hex()}")
print(f"Ожидалось: {expected.hex()}")
print(f"Верно: {result == expected}")
```

---

## Лавинный эффект

### Демонстрация через раунды

```python
from Crypto.Cipher import AES

def count_differing_bits(b1: bytes, b2: bytes) -> int:
    """Подсчёт различающихся битов"""
    return sum(bin(a ^ b).count('1') for a, b in zip(b1, b2))

def avalanche_demo():
    """
    Показывает как изменение 1 бита ключа
    распространяется через раунды AES.
    """
    key1 = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    key2 = bytearray(key1)
    key2[0] ^= 0x01  # изменяем один бит
    key2 = bytes(key2)

    pt = bytes.fromhex("00112233445566778899aabbccddeeff")

    ct1 = AES.new(key1, AES.MODE_ECB).encrypt(pt)
    ct2 = AES.new(key2, AES.MODE_ECB).encrypt(pt)

    diff_bits = count_differing_bits(ct1, ct2)
    print(f"Ключ 1:    {key1.hex()}")
    print(f"Ключ 2:    {key2.hex()}  (1 бит отличается)")
    print(f"CT 1:      {ct1.hex()}")
    print(f"CT 2:      {ct2.hex()}")
    print(f"Различается битов: {diff_bits} из 128")
    print(f"Процент:           {diff_bits/128*100:.1f}%")
    # Обычно ~64 бита (50%) - идеальный лавинный эффект

avalanche_demo()

def avalanche_by_rounds():
    """Как быстро распространяется изменение 1 бита"""
    key = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    round_keys = aes128_key_schedule(key)

    pt1 = list(bytes.fromhex("00112233445566778899aabbccddeeff"))
    pt2 = list(pt1)
    pt2[0] ^= 0x01  # изменяем 1 бит

    state1 = add_round_key(pt1, round_keys[0])
    state2 = add_round_key(pt2, round_keys[0])

    print("\nРаспространение изменения 1 бита через раунды:")
    for r in range(1, 11):
        last = (r == 10)
        state1 = aes_round(state1, round_keys[r], last)
        state2 = aes_round(state2, round_keys[r], last)
        diff = sum(bin(a ^ b).count('1') for a, b in zip(state1, state2))
        print(f"  После раунда {r:2d}: {diff:3d} бит из 128 ({diff/128*100:.0f}%)")

avalanche_by_rounds()
# После раунда  1:   X бит (небольшое распространение)
# После раунда  2:  ~64 бит (полная диффузия!)
# После раунда  3+: ~64 бит (стабилизируется)
```

---

## Wide Trail Strategy

```
Wide Trail Strategy - метод проектирования блочных шифров
(Daemen, Rijmen - создатели AES), гарантирующий стойкость
к дифференциальному и линейному криптоанализу.

Идея:
  Отследить "дифференциальный след" (trail) через раунды.
  Минимизировать вероятность дифференциального следа.

Ключевые параметры:
  Ns = число активных S-box в следе
  p  = максимальная вероятность одного активного S-box

  Вероятность следа <= p^Ns

Для AES:
  p = 2^(-6) (максимальная вероятность входной дифференциальной характеристики S-box)
  Минимум активных S-box за 4 раунда: 25

  Вероятность 4-раундового следа: <= (2^(-6))^25 = 2^(-150)
  Это меньше 2^(-128) (размер ключа) -> дифференциальный криптоанализ неприменим.

Компоненты Wide Trail:
  ShiftRows: гарантирует что байты из одного столбца попадают в разные
             столбцы -> нет "локальных" дифференциальных следов.
  MixColumns (MDS): гарантирует branch number = 5.
             Если 1 байт активен на входе -> 4 активных на выходе.
  SubBytes: высокая нелинейность -> малая p для S-box.

Вместе это гарантирует: за 2 раунда минимум 5 активных S-box,
за 4 раунда минимум 25. Полный AES имеет запас в 2x.
```

---

## Атаки на компоненты

### Cache-Timing атаки на S-box

```
Программная реализация AES использует таблицы в памяти.
Разные адреса памяти -> разные cache lines -> разное время доступа.

Атака:
  Наблюдатель (другой процесс, VM) может измерить время обращений к памяти.
  По паттерну cache miss/hit определить индексы в S-box.
  Индексы = биты состояния = утечка информации.

Bernstein's attack (2005):
  Восстановление AES ключа через timing при шифровании OpenSSL.
  Требует: общая кэш-память между жертвой и атакующим.

Защита:
  AES-NI: аппаратные инструкции без таблиц -> нет cache timing.
  Constant-time программная реализация (bitsliced AES).
  ChaCha20 (ARX) не использует таблицы -> нет этой атаки.

# Проверить AES-NI:
import subprocess
result = subprocess.run(['grep', '-m1', 'aes', '/proc/cpuinfo'],
                       capture_output=True, text=True)
has_aesni = 'aes' in result.stdout.lower()
print(f"AES-NI доступен: {has_aesni}")
```

### Related-Key атаки на Key Schedule

```
Related-Key атака: атакующий шифрует с несколькими связанными ключами
(например K, K XOR delta) и анализирует разницы.

AES-128: нет известных практических related-key атак.
AES-256: теоретические related-key атаки (2009, Biryukov, Khovratovich).
  Требует 2^99.5 шифрований в related-key модели.
  Не практична.

DES Key Schedule:
  Слабые ключи (4 штуки): Key Schedule периодичен -> K_i = K_{17-i}
  Полуслабые ключи (12 штук): E_K1(E_K2(P)) = P
  Причина: простая Key Schedule без нелинейности.

AES Key Schedule использует S-box и Rcon:
  SubWord добавляет нелинейность.
  Rcon предотвращает периодичность.
  Но: Key Schedule AES-256 слабее чем хотелось бы для related-key модели.
```

---

## SPN vs Feistel: сравнение конструкций

```
Два основных подхода к построению блочного шифра:

SPN (Substitution-Permutation Network):
  Все биты блока обрабатываются в каждом раунде.
  Быстрая диффузия: полный лавинный эффект за 2 раунда.
  Примеры: AES (Rijndael), Camellia, PRESENT, GIFT.

  Структура раунда SPN:
  state -> [S-box слой] -> [P-box/MixLayer] -> [AddKey] -> ...

Feistel Network:
  Только половина блока обрабатывается за раунд.
  Медленнее диффузия: нужно 2x больше раундов.
  Дешифрование = шифрование с обратными ключами (удобно аппаратно).
  Примеры: DES, 3DES, Blowfish, Twofish, Camellia (гибрид).

  Структура раунда Feistel:
  (L, R) -> (R, L XOR F(R, K))

Сравнение:
Параметр          SPN (AES)          Feistel (DES)
---------         ---------          -------------
Диффузия          2 раунда           4+ раундов
Раундов (типично) 10-14              16-32
Шифрование        Сложнее            Проще
Дешифрование      Нужен InvS-box     Те же операции
HW эффективность  Высокая            Средняя
Безопасность      Лучше при ~10 р.   Хуже при тех же
```

---

## Примеры других S-box

### PRESENT (облегчённый блочный шифр)

```
PRESENT - сверхлёгкий блочный шифр (блок 64 бита, ключ 80 или 128 бит).
Разработан для IoT / RFID (ограниченные ресурсы).

S-box PRESENT (4-битный, 4->4):
  Вход:  0x0 0x1 0x2 0x3 0x4 0x5 0x6 0x7 0x8 0x9 0xa 0xb 0xc 0xd 0xe 0xf
  Выход: 0xC 0x5 0x6 0xB 0x9 0x0 0xA 0xD 0x3 0xE 0xF 0x8 0x4 0x7 0x1 0x2

  Нелинейность = 4 (максимум для 4-битного S-box = 4).
  Оптимальный для 4-битного шифра!

P-box PRESENT (64-битная перестановка):
  Позиция бита i -> i // 16 + (i % 16) * 4
  (детерминированная формула, не таблица)

Это позволяет реализовать PRESENT на 1000 ворот (gates) - рекорд компактности.
```

### Camellia S-box

```
Camellia использует 4 разных S-box (SP1, SP2, SP3, SP4).
Это усиливает нелинейность: разные S-box = меньше корреляций.

SP2(x) = SP1(x) <<<1  (циклический сдвиг влево на 1 бит)
SP3(x) = SP1(x) >>>1  (циклический сдвиг вправо на 1 бит)
SP4(x) = SP1(x >>> 1) (сдвиг входа)

Такая конструкция (variante S-boxes) стандартна в японских шифрах
(Camellia, MISTY1).
```

---

## Шпаргалка

```
S-box (Substitution box):
  Нелинейная замена n->m бит
  Цель: конфузия (confusion)
  AES S-box: 8->8 бит, GF(2^8)^{-1} + аффинное преобразование
  Нелинейность AES S-box: 112 (оптимально)
  Без S-box: шифр линейный -> взламывается системой уравнений

P-box (Permutation box):
  Перестановка битов/байтов
  Цель: диффузия (diffusion)
  AES: ShiftRows (побайтовая перестановка строк)
  DES: 32-битная P-перестановка после S-box

MixColumns:
  Умножение на MDS матрицу в GF(2^8)
  Branch number = 5: 1 активный байт -> 4 активных
  Совместно с ShiftRows: полный лавинный эффект за 2 раунда

Key Schedule (AES-128):
  Вход: 16 байт ключа
  Выход: 11 x 16 байт = 176 байт раундовых ключей
  Операции: RotWord + SubWord + XOR + Rcon
  Нелинейность: SubWord (S-box) + Rcon (уникальность)

Раунды AES:
  AES-128: 10 раундов (+ начальный AddRoundKey)
  AES-192: 12 раундов
  AES-256: 14 раундов
  Последний раунд: нет MixColumns

Wide Trail:
  Гарантия: за 4 раунда минимум 25 активных S-box
  Вероятность следа: <= 2^(-150) < 2^(-128)
  -> дифференциальный и линейный криптоанализ неприменимы

Лавинный эффект:
  Изменение 1 бита -> ~50% изменений на выходе
  AES: полный лавинный эффект после 2 раундов

SPN vs Feistel:
  SPN (AES): быстрее диффузия, лучше на HW с параллелизмом
  Feistel (DES): одни операции для шифр/дешифр, нужно больше раундов
```

---

## Ссылки

- [FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) - стандарт AES (полная спецификация)
- [The Design of Rijndael (Daemen, Rijmen)](https://www.springer.com/gp/book/9783540425809) - книга создателей AES
- [Wide Trail Strategy](https://link.springer.com/chapter/10.1007/3-540-45661-9_1) - Daemen, Rijmen 2001
- [AES S-box construction (Wikipedia)](https://en.wikipedia.org/wiki/Rijndael_S-box)
- [PRESENT cipher](https://link.springer.com/chapter/10.1007/978-3-540-74735-2_31) - облегчённый блочный шифр
- [Cache-timing attacks on AES (Bernstein)](https://cr.yp.to/antiforgery/cachetiming-20050414.pdf)
- [A Graduate Course in Applied Cryptography (Boneh, Shoup)](https://toc.cryptobook.us/) - гл. 4
- [Cryptopals Set 1, Challenge 7](https://cryptopals.com/sets/1/challenges/7) - практика AES
