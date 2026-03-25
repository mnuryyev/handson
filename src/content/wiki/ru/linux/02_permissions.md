---
title: "Права доступа в Linux (chmod, chown, umask)"
date: "2026-03-25"
---

Права доступа - фундамент безопасности Linux. Каждый файл и директория имеют владельца, группу и набор разрешений, которые определяют кто может читать, изменять и выполнять файл.

---

## Базовая концепция

В Linux каждый файл имеет три категории субъектов:

| Категория | Обозначение | Описание |
|-----------|-------------|----------|
| Владелец | `u` (user) | Пользователь, которому принадлежит файл |
| Группа | `g` (group) | Группа, связанная с файлом |
| Остальные | `o` (other) | Все остальные пользователи |
| Все сразу | `a` (all) | u + g + o |

И три типа прав:

| Право | Символ | Число | На файл | На директорию |
|-------|--------|-------|---------|---------------|
| Чтение | `r` | `4` | Читать содержимое | Просматривать список файлов |
| Запись | `w` | `2` | Изменять содержимое | Создавать/удалять файлы внутри |
| Выполнение | `x` | `1` | Запускать как программу | Входить (`cd`) в директорию |

---

## Чтение прав (`ls -l`)

```bash
ls -l /etc/passwd
# -rw-r--r-- 1 root root 2847 Mar 10 12:00 /etc/passwd
```

Расшифровка строки:

```
-  rw-  r--  r--   1   root  root   2847   Mar 10 12:00  /etc/passwd
│   │    │    │    │    │     │       │
│   │    │    │    │    │     │       └── размер файла
│   │    │    │    │    │     └────────── группа
│   │    │    │    │    └──────────────── владелец
│   │    │    │    └───────────────────── количество жёстких ссылок
│   │    │    └────────────────────────── права остальных (r--)
│   │    └─────────────────────────────── права группы    (r--)
│   └──────────────────────────────────── права владельца (rw-)
└──────────────────────────────────────── тип файла
```

**Типы файлов:**

| Символ | Тип |
|--------|-----|
| `-` | Обычный файл |
| `d` | Директория |
| `l` | Символическая ссылка |
| `b` | Блочное устройство |
| `c` | Символьное устройство |
| `p` | Именованный канал (FIFO) |
| `s` | Сокет |

```bash
# Примеры разных типов
ls -la /
# drwxr-xr-x  /etc        (директория)
# lrwxrwxrwx  /bin -> usr/bin  (симлинк)

ls -la /dev/
# brw-rw----  sda         (блочное устройство)
# crw-rw-rw-  null        (символьное устройство)
```

---

## Числовая (восьмеричная) запись

Каждый блок прав - это три бита: `r=4`, `w=2`, `x=1`. Складываем:

```
rwx = 4+2+1 = 7
rw- = 4+2+0 = 6
r-x = 4+0+1 = 5
r-- = 4+0+0 = 4
-wx = 0+2+1 = 3
-w- = 0+2+0 = 2
--x = 0+0+1 = 1
--- = 0+0+0 = 0
```

```bash
# Полная запись: три цифры = владелец, группа, остальные
chmod 755 script.sh
# rwx r-x r-x
# 7   5   5

chmod 644 file.txt
# rw- r-- r--
# 6   4   4

chmod 600 private.key
# rw- --- ---
# 6   0   0

chmod 777 shared/
# rwx rwx rwx  ← никогда не делай так в продакшне
```

---

## chmod - изменение прав

### Числовой способ

```bash
chmod 755 script.sh        # rwxr-xr-x
chmod 644 config.conf      # rw-r--r--
chmod 600 ~/.ssh/id_rsa    # rw-------
chmod 700 ~/.ssh/          # rwx------
chmod 777 /tmp/shared      # rwxrwxrwx
chmod 000 locked.txt       # ----------
```

### Символьный способ

```bash
# Формат: chmod [кому][+/-/=][права] файл

chmod u+x script.sh        # добавить выполнение владельцу
chmod g-w file.txt         # убрать запись у группы
chmod o-r secret.txt       # убрать чтение у остальных
chmod a+r public.txt       # дать чтение всем
chmod u=rwx,g=rx,o= file   # задать точные права

# Убрать бит выполнения у всех
chmod a-x file.txt

# Дать выполнение только если уже есть для кого-то (X — заглавная)
chmod a+X directory/       # полезно для рекурсивного chmod
```

### Рекурсивное применение

```bash
# Применить ко всем файлам и директориям внутри
chmod -R 755 /var/www/html/

# Правильный подход: разные права для файлов и директорий
find /var/www/html -type f -exec chmod 644 {} \;   # файлы: 644
find /var/www/html -type d -exec chmod 755 {} \;   # папки: 755
```

---

## chown - смена владельца и группы

```bash
# Синтаксис: chown [владелец][:группа] файл

chown alice file.txt           # сменить владельца
chown alice:developers file.txt # сменить владельца и группу
chown :developers file.txt     # сменить только группу
chown alice: file.txt          # сменить владельца, группа = основная группа alice

# Рекурсивно
chown -R www-data:www-data /var/www/html/
chown -R alice:alice /home/alice/
```

```bash
# Посмотреть UID и GID пользователя
id alice
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

# Чтобы сменить владельца — нужен root (или sudo)
sudo chown root:root /etc/myconfig
```

---

## chgrp - смена группы

```bash
# Аналог chown только для группы
chgrp developers project/
chgrp -R www-data /var/www/

# Это эквивалентно:
chown :developers project/
```

---

## umask - маска по умолчанию

`umask` определяет права, которые **убираются** при создании новых файлов и директорий.

```bash
# Посмотреть текущую umask
umask
# 0022

umask -S
# u=rwx,g=rx,o=rx
```

**Как работает umask:**

```
Файлы создаются с максимальными правами:    666 (rw-rw-rw-)
Директории создаются с максимальными:       777 (rwxrwxrwx)

umask = 022 означает: убрать w у группы и остальных

666 - 022 = 644  →  файл получит rw-r--r--
777 - 022 = 755  →  директория получит rwxr-xr-x
```

```bash
# Таблица umask → результирующие права
# umask   файл    директория
# 022     644     755        ← стандарт для большинства систем
# 027     640     750        ← более строгий (группа не видит остальным)
# 077     600     700        ← параноид-режим (только владелец)
# 002     664     775        ← командная разработка

# Установить umask в текущей сессии
umask 027

# Сделать постоянным — добавить в ~/.bashrc или /etc/profile
echo "umask 027" >> ~/.bashrc
```

---

## Специальные биты

Помимо стандартных `rwx` существуют три специальных бита.

### SUID (Set User ID) — бит 4

Файл запускается с правами **владельца файла**, а не запускающего пользователя.

```bash
ls -la /usr/bin/passwd
# -rwsr-xr-x 1 root root /usr/bin/passwd
#     ^ s — SUID бит

# passwd запускается от root, даже если вызвал обычный пользователь
# Это позволяет изменять /etc/shadow (который читает только root)
```

```bash
# Установить SUID
chmod u+s /path/to/program
chmod 4755 /path/to/program   # 4 — SUID

# Найти все SUID файлы в системе
find / -perm -4000 -type f 2>/dev/null
```

> SUID на скриптах (sh, bash, python) игнорируется ядром по соображениям безопасности.

### SGID (Set Group ID) — бит 2

**На файле:** запускается с правами группы владельца.  
**На директории:** новые файлы внутри наследуют группу директории.

```bash
ls -la /usr/bin/wall
# -rwxr-sr-x 1 root tty /usr/bin/wall
#        ^ s — SGID бит

# На директории — очень полезно для командных проектов
mkdir /srv/project
chown :developers /srv/project
chmod g+s /srv/project         # все файлы внутри будут принадлежать группе developers

ls -la /srv/
# drwxrwsr-x  project  root  developers
#        ^ s — SGID на директории
```

```bash
chmod g+s /path/to/dir
chmod 2755 /path/to/dir   # 2 — SGID

# Найти все SGID файлы
find / -perm -2000 -type f 2>/dev/null
```

### Sticky Bit — бит 1

**На директории:** файл может удалить только его **владелец**, даже если у других есть права на запись.

```bash
ls -la /tmp
# drwxrwxrwt  tmp  root  root
#           ^ t — sticky bit

# Все могут писать в /tmp, но удалить чужой файл нельзя
chmod +t /shared/
chmod 1777 /shared/   # 1 — sticky bit
```

```bash
# Все три спец. бита вместе (SUID + SGID + Sticky):
# chmod 7755 file    (не делай так без причины)

# Заглавная T/S — бит установлен, но x не установлен (нет смысла)
# -rwSr--r--  ← SUID есть, но выполнения нет (бесполезно)
# drwxrwxrwT  ← Sticky есть, но выполнения нет
```

---

## ACL - расширенные права доступа

Стандартных `rwx` иногда не хватает. ACL позволяет задать права **отдельным пользователям и группам**.

```bash
# Установить пакет (если нет)
apt install acl

# Просмотр ACL
getfacl file.txt
# file: file.txt
# owner: alice
# group: developers
# user::rw-
# group::r--
# other::r--

# Дать пользователю bob права на чтение и запись
setfacl -m u:bob:rw file.txt

# Дать группе ops права на чтение
setfacl -m g:ops:r file.txt

# Убрать ACL для пользователя
setfacl -x u:bob file.txt

# Убрать все ACL
setfacl -b file.txt

# Рекурсивно
setfacl -R -m u:bob:rx /var/www/html/

# Default ACL — наследуется новыми файлами в директории
setfacl -d -m u:bob:rw /shared/
```

```bash
# Файл с ACL виден по знаку + в ls -l
ls -l file.txt
# -rw-rw-r--+ 1 alice developers  ← знак + означает ACL
```

---

## Атрибуты файлов (lsattr / chattr)

Атрибуты работают на уровне файловой системы (ext4) и не зависят от прав.

```bash
# Просмотр атрибутов
lsattr file.txt
# ----i--------e-- file.txt

# Основные атрибуты
chattr +i file.txt    # immutable — нельзя изменить, удалить, переименовать (даже root)
chattr +a file.txt    # append-only — можно только дописывать (для логов)
chattr +u file.txt    # undeletable — при удалении данные сохраняются для восстановления

# Снять атрибут
chattr -i file.txt

# Найти неизменяемые файлы
lsattr /etc/ | grep "\-i-"
```

> `chattr +i` — мощная защита конфигов: даже root не может удалить файл без снятия атрибута.

---

## Практические сценарии

### Веб-сервер

```bash
# Правильные права для Nginx/Apache
chown -R www-data:www-data /var/www/html/
find /var/www/html -type f -exec chmod 644 {} \;
find /var/www/html -type d -exec chmod 755 {} \;

# PHP upload директория
chmod 775 /var/www/html/uploads/
chown www-data:developers /var/www/html/uploads/
```

### SSH ключи

```bash
# SSH очень чувствителен к правам — неверные права = отказ в подключении
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_rsa          # приватный ключ
chmod 644 ~/.ssh/id_rsa.pub      # публичный ключ
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/config
```

### Командная разработка

```bash
# Создать общую директорию для команды
groupadd developers
usermod -aG developers alice
usermod -aG developers bob

mkdir /srv/project
chown root:developers /srv/project
chmod 2775 /srv/project   # SGID: новые файлы наследуют группу developers

# umask для разработчиков
echo "umask 002" >> /etc/profile.d/developers.sh
```

### Защита конфигов

```bash
# Конфиги с паролями — только для владельца
chmod 600 /etc/app/database.conf
chown app_user:app_user /etc/app/database.conf

# Защита от случайного изменения
chattr +i /etc/hosts
chattr +i /etc/resolv.conf

# Логи — только дозапись
chattr +a /var/log/myapp.log
```

---

## Быстрая диагностика прав

```bash
# Почему нет доступа к файлу?
namei -l /path/to/file          # показывает права каждого компонента пути
stat file.txt                   # полная информация о файле

# Проверить права как другой пользователь
sudo -u www-data ls /var/www/
sudo -u bob cat /home/alice/file.txt

# Что может сделать текущий пользователь?
id                              # uid, gid, groups
groups                          # список групп
sudo -l                         # права sudo

# Найти файлы с небезопасными правами
find /home -perm -o+w -type f   # файлы с правом записи для всех
find / -perm -4000 2>/dev/null  # SUID файлы
find / -perm -2000 2>/dev/null  # SGID файлы
find / -nouser 2>/dev/null      # файлы без владельца (потенциально опасно)
```

---

## Шпаргалка по числовым правам

| Число | Символ | Типичное использование |
|-------|--------|------------------------|
| `400` | `r--------` | Приватные ключи (read-only для владельца) |
| `600` | `rw-------` | SSH ключи, конфиги с паролями |
| `640` | `rw-r-----` | Конфиги (владелец + группа читает) |
| `644` | `rw-r--r--` | Обычные файлы, HTML, CSS |
| `664` | `rw-rw-r--` | Командные файлы |
| `700` | `rwx------` | ~/.ssh директория, скрипты только для владельца |
| `750` | `rwxr-x---` | Программы для группы |
| `755` | `rwxr-xr-x` | Программы, директории |
| `775` | `rwxrwxr-x` | Командные директории |
| `777` | `rwxrwxrwx` | !!! Только для /tmp-подобного (опасно) |

---

## Ссылки

- [chmod man page](https://man7.org/linux/man-pages/man1/chmod.1.html) - `man chmod`
- [chown man page](https://man7.org/linux/man-pages/man1/chown.1.html) - `man chown`
- [acl man page](https://man7.org/linux/man-pages/man5/acl.5.html) - `man 5 acl`
- [Linux File Permissions Explained](https://wiki.archlinux.org/title/File_permissions_and_attributes) - Arch Wiki
