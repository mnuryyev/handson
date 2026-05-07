---
title: "Файловые права: SUID, SGID, Sticky Bit"
date: "2026-05-07"
---

SUID, SGID и Sticky Bit - это три специальных бита прав доступа в Linux, которые идут сверх стандартных `rwx`. Они решают задачи, которые обычными правами не решить: запуск программы от имени владельца, наследование группы в директории и защита файлов в общей папке.

---

## Где они живут в структуре прав

Стандартная запись прав выглядит так:

```
- rwx rwx rwx
│  │   │   │
│  │   │   └── права остальных (other)
│  │   └────── права группы (group)
│   └────────── права владельца (user)
└────────────── тип файла
```

Специальные биты добавляют **четвёртую цифру** в восьмеричной записи и **заменяют** бит `x` в символьной записи:

```
  4    7    5    5
  │    │    │    │
  │    │    │    └── other:  r-x
  │    │    └─────── group:  r-x
  │    └──────────── user:   rwx
  └───────────────── спец. биты: 4=SUID, 2=SGID, 1=Sticky
```

| Бит | Число | Символ на файле | Символ на директории |
| --- | --- | --- | --- |
| SUID | `4` | `s` на позиции `x` владельца | `s` (редко используется) |
| SGID | `2` | `s` на позиции `x` группы | `s` на позиции `x` группы |
| Sticky | `1` | `t` (устарело) | `t` на позиции `x` остальных |

Если бит `x` не установлен, но специальный бит есть - отображается заглавная буква (`S` или `T`), что означает бесполезную / аномальную конфигурацию.

---

## SUID - Set User ID

### Что делает

При выполнении файла с SUID-битом процесс получает **эффективный UID владельца файла**, а не UID запустившего пользователя.

```
Обычное выполнение:
alice (uid=1001) запускает program
  -> процесс работает с uid=1001

SUID выполнение:
alice (uid=1001) запускает program (owner=root, SUID=on)
  -> процесс работает с uid=0 (root)
```

### Реальный пример: passwd

```bash
ls -la /usr/bin/passwd
# -rwsr-xr-x 1 root root 68208 /usr/bin/passwd
#     ^ s = SUID бит (x владельца заменён на s)

# passwd принадлежит root и имеет SUID
# Обычный пользователь запускает passwd -> процесс работает как root
# Это нужно чтобы изменить /etc/shadow (доступен только root)

# Без SUID у passwd:
# alice пытается изменить пароль -> нет доступа к /etc/shadow -> ошибка
```

### Другие SUID-программы в системе

```bash
# Найти все SUID-файлы
find / -perm -4000 -type f 2>/dev/null

# Типичные SUID-программы
ls -la /usr/bin/sudo       # -rwsr-xr-x root root  - выполнение от root
ls -la /usr/bin/su         # -rwsr-xr-x root root  - смена пользователя
ls -la /usr/bin/newgrp     # -rwsr-xr-x root root  - смена группы
ls -la /usr/bin/pkexec     # -rwsr-xr-x root root  - polkit
ls -la /usr/bin/passwd     # -rwsr-xr-x root root  - смена пароля
ls -la /usr/bin/chsh       # -rwsr-xr-x root root  - смена shell
ls -la /usr/bin/chfn       # -rwsr-xr-x root root  - смена info о пользователе
ls -la /bin/ping           # -rwsr-xr-x root root  - raw sockets (в старых системах)
ls -la /usr/bin/mount      # -rwsr-xr-x root root  - монтирование
```

### Как установить и убрать SUID

```bash
# Установить SUID (символьный способ)
chmod u+s /path/to/program

# Установить SUID (числовой способ)
chmod 4755 /path/to/program   # 4 = SUID, 755 = rwxr-xr-x

# Убрать SUID
chmod u-s /path/to/program
chmod 0755 /path/to/program   # 0 = без спец. битов

# Проверить
ls -la /path/to/program
# -rwsr-xr-x  <- SUID установлен (s на месте x владельца)
# -rwSr-xr-x  <- SUID установлен, но x НЕ установлен (S заглавная = аномалия)
```

### SUID на директориях

SUID на директории не имеет стандартного эффекта в Linux (в отличие от BSD, где влияет на наследование владельца). Ядро его игнорирует.

### SUID на скриптах - не работает

```bash
# Ядро Linux игнорирует SUID на интерпретируемых файлах
chmod u+s /usr/local/bin/myscript.sh
# Скрипт НЕ получит привилегии root - это намеренная защита ядра

# Причина: скрипт запускает интерпретатор (bash, python),
# а не выполняется напрямую. Атакующий мог бы подменить интерпретатор.

# Решение: написать обёртку на C, установить SUID на бинарник
```

### SUID и безопасность

```bash
# SUID - опасная вещь в руках злоумышленника
# Если SUID-программа уязвима -> эскалация привилегий до root

# Пример: /usr/bin/find с SUID (если кто-то по ошибке поставил)
find . -exec /bin/sh \; -quit   # получаем root shell

# Пример: /usr/bin/vim с SUID
vim -c ':!bash'                  # получаем root shell

# Поэтому важно:
# 1. Знать какие SUID-файлы есть в системе
find / -perm -4000 -type f 2>/dev/null | sort

# 2. Сравнить с эталоном после установки системы
find / -perm -4000 -type f 2>/dev/null | sort > /root/suid_baseline.txt

# 3. Проверять появление новых SUID файлов
diff /root/suid_baseline.txt <(find / -perm -4000 -type f 2>/dev/null | sort)

# 4. Убирать SUID где он не нужен
chmod u-s /usr/bin/chfn    # если не используется
chmod u-s /usr/bin/chsh    # если не используется
```

---

## SGID - Set Group ID

### Что делает на файле

Аналогично SUID, но для группы: процесс получает **эффективный GID группы файла**.

```bash
ls -la /usr/bin/wall
# -rwxr-sr-x 1 root tty 35048 /usr/bin/wall
#        ^ s = SGID бит (x группы заменён на s)

# wall принадлежит группе tty и имеет SGID
# Это позволяет программе писать в терминалы других пользователей

ls -la /usr/bin/write
# -rwxr-sr-x 1 root tty /usr/bin/write  - аналогично

ls -la /usr/bin/crontab
# -rwxr-sr-x 1 root crontab /usr/bin/crontab
# crontab нужен SGID группы crontab для доступа к /var/spool/cron/
```

### Что делает на директории - главная фича SGID

На директории SGID решает реальную задачу: **новые файлы и поддиректории наследуют группу директории**, а не основную группу создающего пользователя.

```
Без SGID:
alice (groups: alice, developers) создаёт файл в /srv/project
  -> файл принадлежит alice:alice  (основная группа alice)

С SGID на /srv/project (group=developers):
alice создаёт файл в /srv/project
  -> файл принадлежит alice:developers  (группа директории!)
```

```bash
# Практический пример: общая директория для команды
groupadd developers
usermod -aG developers alice
usermod -aG developers bob

mkdir /srv/project
chown root:developers /srv/project
chmod 2775 /srv/project       # 2 = SGID, 775 = rwxrwxr-x

ls -la /srv/
# drwxrwsr-x  2 root developers  /srv/project
#        ^ s = SGID на директории

# Теперь alice создаёт файл
su alice
touch /srv/project/code.py

ls -la /srv/project/
# -rw-rw-r-- 1 alice developers code.py   <- группа developers, не alice!

# bob может редактировать файл alice (у него есть права группы developers)
# Без SGID файл был бы alice:alice и bob не мог бы его изменить
```

### Как установить и убрать SGID

```bash
# На файл
chmod g+s /path/to/program
chmod 2755 /path/to/program

# На директорию
chmod g+s /shared/directory/
chmod 2775 /shared/directory/    # rwxrwsr-x

# Убрать
chmod g-s /path/to/file
chmod 0755 /path/to/file

# Проверить
ls -la /shared/directory/
# drwxrwsr-x  <- SGID установлен
# drwxrwSr-x  <- SGID установлен, но x группы НЕ установлен (S = аномалия)
```

### SGID и вложенные директории

```bash
# SGID наследуется поддиректориями только если поставить явно
mkdir /srv/project
chmod g+s /srv/project

# alice создаёт поддиректорию
mkdir /srv/project/module1

ls -la /srv/project/
# drwxrwsr-x  module1  <- поддиректория АВТОМАТИЧЕСКИ получила SGID
# Это ключевое поведение: SGID рекурсивно распространяется на субдиректории

# Но на файлах внутри SGID-директории SGID НЕ устанавливается автоматически
touch /srv/project/module1/file.py
ls -la /srv/project/module1/
# -rw-rw-r-- file.py   <- обычные права, нет SGID (файлы не выполняются)
```

---

## Sticky Bit

### История: изначальное назначение

Исторически Sticky Bit на файле говорил ОС: "держи текстовый сегмент этой программы в памяти (swap) даже после завершения". Это ускоряло повторный запуск часто используемых программ. В современных Linux системах это значение для файлов устарело и игнорируется - ядро само управляет кэшем.

### Современное назначение: защита директорий

На директории Sticky Bit означает: **удалить файл может только его владелец** (или root), даже если у других пользователей есть право записи `w` в директорию.

```
Без Sticky Bit на /tmp:
alice создаёт /tmp/alice_file
bob (у него w на /tmp) может удалить /tmp/alice_file  <- плохо

С Sticky Bit на /tmp:
alice создаёт /tmp/alice_file
bob пытается удалить /tmp/alice_file
  -> Permission denied  <- защита работает
```

### Главный пример: /tmp

```bash
ls -la /
# drwxrwxrwt  tmp  root  root
#           ^ t = Sticky Bit

# /tmp: все могут читать, писать, входить (rwxrwxrwx)
# Но удалить файл может только его владелец или root
# Это защищает файлы одних пользователей от других

# Проверить:
stat /tmp | grep "Access:"
# Access: (1777/drwxrwxrwt)  <- 1 = Sticky Bit
```

### Другие примеры Sticky Bit

```bash
ls -la /var/tmp
# drwxrwxrwt  <- /var/tmp тоже защищён Sticky Bit

# Общие директории для группы
mkdir /srv/shared
chmod 1777 /srv/shared    # все могут писать, но удалять только свои файлы

# Полная комбинация для командной директории
mkdir /srv/team
chown root:developers /srv/team
chmod 3775 /srv/team      # 3 = SGID + Sticky Bit, 775 = rwxrwxr-x
# SGID: файлы наследуют группу developers
# Sticky: каждый защищает свои файлы от удаления коллегами
```

### Как установить и убрать Sticky Bit

```bash
# Символьный способ
chmod +t /shared/directory/
chmod o+t /shared/directory/    # эквивалентно

# Числовой способ
chmod 1777 /tmp           # 1 = Sticky, 777 = rwxrwxrwx
chmod 1755 /directory/    # 1 = Sticky, 755 = rwxr-xr-x

# Убрать
chmod -t /shared/directory/
chmod 0777 /shared/directory/

# Проверить
ls -la /shared/
# drwxrwxrwt  <- Sticky установлен (t в конце)
# drwxrwxrwT  <- Sticky установлен, но x остальных НЕ установлен (T = аномалия)
```

### Что именно защищает Sticky Bit

```bash
# Sticky Bit защищает от rm и rename/move
# НЕ защищает от изменения содержимого файла (если есть w на файл)

# Пример:
ls -la /tmp/alice_file
# -rw-r--r-- 1 alice alice /tmp/alice_file

# bob может:
cat /tmp/alice_file           # прочитать (r у остальных)

# bob НЕ может (из-за Sticky Bit на /tmp):
rm /tmp/alice_file            # Permission denied
mv /tmp/alice_file /tmp/bob/  # Permission denied

# Если alice дала права записи всем:
chmod o+w /tmp/alice_file
# Тогда bob МОЖЕТ изменить содержимое файла
# Но удалить всё равно не сможет (Sticky Bit защищает удаление, не запись)
```

---

## Все три бита вместе: числовая запись

```bash
# Четвёртая (старшая) цифра в chmod:
# 4 = SUID
# 2 = SGID
# 1 = Sticky Bit
# Можно складывать: 6 = SUID + SGID, 7 = все три

chmod 4755 file     # SUID + rwxr-xr-x
chmod 2755 dir/     # SGID + rwxr-xr-x
chmod 1777 dir/     # Sticky + rwxrwxrwx
chmod 3775 dir/     # SGID + Sticky + rwxrwxr-x
chmod 6755 file     # SUID + SGID + rwxr-xr-x (редко нужно)
chmod 7777 dir/     # всё сразу (не делай так)

# Полная таблица:
# 0 - нет спец. битов
# 1 - Sticky
# 2 - SGID
# 3 - SGID + Sticky
# 4 - SUID
# 5 - SUID + Sticky
# 6 - SUID + SGID
# 7 - SUID + SGID + Sticky
```

---

## Символьное отображение в ls -l

```bash
# SUID - на месте x владельца
-rwsr-xr-x   # SUID + x установлен (нормально)
-rwSr-xr-x   # SUID без x (аномалия - s заглавная)

# SGID - на месте x группы
-rwxr-sr-x   # SGID + x установлен (нормально)
-rwxr-Sr-x   # SGID без x (аномалия - s заглавная)
drwxrwsr-x   # SGID на директории (нормально)

# Sticky - на месте x остальных
drwxrwxrwt   # Sticky + x установлен (нормально, как /tmp)
drwxrwxrwT   # Sticky без x (аномалия - t заглавная)

# Все три вместе
-rwsr-sr-t   # SUID + SGID + Sticky
```

---

## Поиск файлов со спец. битами

```bash
# Найти все SUID файлы
find / -perm -4000 -type f 2>/dev/null
find / -perm /4000 -type f 2>/dev/null  # то же самое

# Найти все SGID файлы
find / -perm -2000 -type f 2>/dev/null

# Найти SGID директории
find / -perm -2000 -type d 2>/dev/null

# Найти Sticky директории
find / -perm -1000 -type d 2>/dev/null

# Найти файлы с любым спец. битом
find / -perm /7000 -type f 2>/dev/null

# Найти SUID файлы только в конкретных директориях
find /usr /bin /sbin -perm -4000 -type f 2>/dev/null

# Красивый вывод с правами
find / -perm -4000 -type f -exec ls -la {} \; 2>/dev/null

# Только имена и права
find / -perm -4000 -type f 2>/dev/null | xargs ls -la 2>/dev/null
```

---

## Безопасность и типичные векторы атак

### SUID и GTFOBins

GTFOBins - база данных Unix-программ, через которые можно эскалировать привилегии если они имеют SUID.

```bash
# Проверить SUID файлы на эксплуатируемость
find / -perm -4000 -type f 2>/dev/null

# Опасные SUID - если кто-то поставил их не по назначению:

# find с SUID
find . -exec /bin/sh -p \; -quit      # -p = сохранить euid

# bash с SUID
bash -p                                # -p = privileged mode, не дропает euid

# vim с SUID
vim -c ':py3 import os; os.execl("/bin/sh", "sh", "-pc", "reset; exec sh -p")'

# cp с SUID - можно перезаписать /etc/passwd
# python с SUID
python3 -c 'import os; os.execl("/bin/sh", "sh", "-p")'

# nmap с SUID (старый метод)
nmap --interactive  # -> !sh

# Ресурс: https://gtfobins.github.io/
```

### Мониторинг SUID/SGID файлов

```bash
# Создать baseline при установке системы
find / -perm -4000 -o -perm -2000 -type f 2>/dev/null | sort \
  > /root/special_bits_baseline.txt

# Проверять периодически
find / -perm -4000 -o -perm -2000 -type f 2>/dev/null | sort \
  > /tmp/special_bits_current.txt

diff /root/special_bits_baseline.txt /tmp/special_bits_current.txt
# Если есть новые строки - кто-то поставил SUID/SGID

# Скрипт для мониторинга (в cron)
#!/bin/bash
BASELINE="/root/suid_baseline.txt"
CURRENT=$(find / -perm -4000 -type f 2>/dev/null | sort)
SAVED=$(cat $BASELINE 2>/dev/null)

if [ "$CURRENT" != "$SAVED" ]; then
    echo "ALERT: SUID files changed!" | mail -s "SUID Alert" admin@company.com
    echo "$CURRENT" > $BASELINE
fi
```

### Уменьшение поверхности атаки

```bash
# Убрать SUID с программ, которые не нужны
chmod u-s /usr/bin/chsh     # если никто не меняет shell
chmod u-s /usr/bin/chfn     # если не нужна смена finger info
chmod u-s /usr/bin/newgrp   # если не используется

# Ограничить выполнение через mount с nosuid
# В /etc/fstab для разделов где не нужны SUID файлы:
# /dev/sdb1  /data  ext4  defaults,nosuid,noexec  0 2

# Проверить текущие опции монтирования
mount | grep nosuid
cat /proc/mounts | grep nosuid

# Монтировать /tmp с nosuid (рекомендуется)
# tmpfs  /tmp  tmpfs  defaults,nosuid,noexec,nodev  0 0
```

---

## Практические сценарии

### Сценарий 1: общая папка для разработчиков

```bash
# Цель: папка /srv/project где все разработчики могут создавать файлы,
# файлы автоматически принадлежат группе developers,
# никто не может удалить чужие файлы

groupadd developers
usermod -aG developers alice
usermod -aG developers bob
usermod -aG developers charlie

mkdir /srv/project
chown root:developers /srv/project
chmod 3775 /srv/project
# 3 = SGID (2) + Sticky (1)
# 775 = rwxrwxr-x

ls -la /srv/
# drwxrwsr-t  developers  /srv/project
#        ^  ^ SGID + Sticky

# Результат:
# alice создаёт file.py -> file.py принадлежит alice:developers (SGID)
# bob создаёт config.yml -> config.yml принадлежит bob:developers (SGID)
# alice НЕ может удалить config.yml bob'а (Sticky Bit)
# Все developers могут редактировать все файлы (g+w)
```

### Сценарий 2: программа с повышенными привилегиями

```bash
# Задача: скрипт мониторинга должен читать /var/log/auth.log
# который принадлежит root и недоступен обычным пользователям

# Неправильно: дать всем права на auth.log
# chmod o+r /var/log/auth.log  <- плохо

# Правильно: создать SGID программу с нужной группой
# 1. Создать группу для доступа к логам
groupadd logreaders
chown root:logreaders /var/log/auth.log
chmod 640 /var/log/auth.log  # только группа logreaders может читать

# 2. Написать программу-обёртку (C для SUID/SGID скриптов)
cat > /usr/local/bin/read_auth.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
int main() {
    system("tail -n 100 /var/log/auth.log");
    return 0;
}
EOF

gcc -o /usr/local/bin/read_auth /usr/local/bin/read_auth.c
chown root:logreaders /usr/local/bin/read_auth
chmod 2750 /usr/local/bin/read_auth  # SGID: запускается от имени группы logreaders

# 3. Добавить пользователей мониторинга в группу
usermod -aG logreaders monitor_user
```

### Сценарий 3: аудит текущей системы

```bash
#!/bin/bash
# Скрипт аудита специальных битов

echo "=== SUID файлы ==="
find / -perm -4000 -type f 2>/dev/null | while read f; do
    ls -la "$f"
done

echo ""
echo "=== SGID файлы ==="
find / -perm -2000 -type f 2>/dev/null | while read f; do
    ls -la "$f"
done

echo ""
echo "=== SGID директории ==="
find / -perm -2000 -type d 2>/dev/null | while read d; do
    ls -lad "$d"
done

echo ""
echo "=== Sticky bit директории ==="
find / -perm -1000 -type d 2>/dev/null | while read d; do
    ls -lad "$d"
done

echo ""
echo "=== Файлы без владельца (потенциально опасно) ==="
find / -nouser -o -nogroup 2>/dev/null | head -20
```

---

## Быстрая шпаргалка

```bash
# Установить SUID
chmod u+s file        chmod 4755 file

# Убрать SUID
chmod u-s file        chmod 0755 file

# Установить SGID на файл
chmod g+s file        chmod 2755 file

# Установить SGID на директорию
chmod g+s dir/        chmod 2775 dir/

# Установить Sticky Bit
chmod +t dir/         chmod 1777 dir/

# SGID + Sticky (командная директория)
chmod 3775 dir/       # rwxrwsr-t

# Найти SUID файлы
find / -perm -4000 -type f 2>/dev/null

# Найти SGID файлы/директории
find / -perm -2000 2>/dev/null

# Найти Sticky директории
find / -perm -1000 -type d 2>/dev/null
```

| Комбинация | Chmod | Символ | Использование |
| --- | --- | --- | --- |
| SUID | `4755` | `-rwsr-xr-x` | Программы с правами владельца (passwd, sudo) |
| SGID на файле | `2755` | `-rwxr-sr-x` | Программы с правами группы (wall, crontab) |
| SGID на директории | `2775` | `drwxrwsr-x` | Командные проекты - наследование группы |
| Sticky на директории | `1777` | `drwxrwxrwt` | /tmp - защита от удаления чужих файлов |
| SGID + Sticky | `3775` | `drwxrwsr-t` | Командная директория с полной защитой |

---

## Ссылки

- `man chmod` - документация chmod со спец. битами
- `man 2 execve` - как ядро обрабатывает SUID при запуске
- `man 7 credentials` - eUID, eGID и как они работают
- [GTFOBins](https://gtfobins.github.io/) - эксплуатация SUID бинарей
- [Linux File Permissions](https://wiki.archlinux.org/title/File_permissions_and_attributes) - Arch Wiki
