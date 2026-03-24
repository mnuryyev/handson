---
title: "Файловая система Linux (FHS)"
date: "2026-03-23"
---

**Filesystem Hierarchy Standard** - стандарт, описывающий структуру директорий и их содержимое в Linux-системах. Определяет, где хранятся бинарные файлы, конфиги, логи, временные данные и многое другое.

> Текущая версия стандарта: **FHS 3.0** (2015). Поддерживается Linux Foundation.

---

## Корневая директория `/`

Всё начинается отсюда. В Linux нет дисков `C:\` или `D:\` — есть единое дерево, корень которого `/`.

```bash
ls /
# bin  boot  dev  etc  home  lib  lib64  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

---

## Структура директорий

### `/bin` — основные бинарные файлы пользователя

Команды, доступные **всем пользователям**, необходимые для работы системы даже без монтирования других разделов.

```bash
ls /bin
# bash  cat  cp  echo  grep  ls  mkdir  mv  rm  sh  ...
```

> В современных дистрибутивах (Ubuntu 20.04+, Debian 10+) `/bin` — симлинк на `/usr/bin`.

---

### `/sbin` — системные бинарные файлы

Команды для **администрирования системы** (обычно требуют root).

```bash
ls /sbin
# fdisk  fsck  ifconfig  iptables  mount  reboot  shutdown  ...
```

> Так же является симлинком на `/usr/sbin` в современных дистрибутивах.

---

### `/boot` — файлы загрузчика

Всё необходимое для старта системы: ядро, initramfs, конфиг GRUB.

```bash
ls /boot
# grub/  initrd.img-6.5.0  vmlinuz-6.5.0  System.map-6.5.0
```

| Файл | Описание |
|------|----------|
| `vmlinuz-*` | Сжатое ядро Linux |
| `initrd.img-*` | Временная файловая система для загрузки |
| `grub/` | Конфиги загрузчика GRUB |
| `System.map-*` | Таблица символов ядра |

> Никогда не удалять файлы из `/boot` без необходимости — система не загрузится.

---

### `/dev` — файлы устройств

В Linux **всё есть файл**, в том числе устройства. `/dev` — это виртуальная ФС, управляемая `udev`.

```bash
# Диски
/dev/sda        # первый SATA/SCSI диск
/dev/sda1       # первый раздел на sda
/dev/nvme0n1    # NVMe диск

# Терминалы
/dev/tty        # текущий терминал
/dev/ttyS0      # COM1 (serial)
/dev/pts/0      # псевдотерминал (SSH сессия)

# Спец. устройства
/dev/null       # "мусорное ведро"
/dev/zero       # поток нулей
/dev/random     # генератор случайных чисел
/dev/urandom    # быстрый генератор (менее случайный)
/dev/stdin      # стандартный ввод
/dev/stdout     # стандартный вывод
```

```bash
# Примеры использования
dd if=/dev/zero of=file.img bs=1M count=100   # создать файл 100MB
cat /dev/urandom | head -c 16 | xxd           # случайные байты
echo "test" > /dev/null                       # выбросить вывод
```

---

### `/etc` — конфигурационные файлы

Все **системные конфиги** хранятся здесь. Только текстовые файлы, никаких бинарников.

```bash
/etc/passwd          # пользователи системы
/etc/shadow          # хэши паролей
/etc/group           # группы
/etc/hosts           # локальный DNS
/etc/hostname        # имя хоста
/etc/fstab           # монтируемые ФС
/etc/crontab         # системные задачи cron
/etc/sudoers         # права sudo
/etc/ssh/            # конфиги SSH
/etc/nginx/          # конфиги Nginx
/etc/systemd/        # конфиги systemd
/etc/apt/            # конфиги пакетного менеджера
/etc/network/        # сетевые настройки (Debian)
/etc/NetworkManager/ # сетевые настройки (RHEL/CentOS)
```

```bash
# Посмотреть всех пользователей
cat /etc/passwd

# Формат: login:x:UID:GID:comment:home:shell
root:x:0:0:root:/root:/bin/bash
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
```

> `/etc/shadow` читается только root — там хранятся хэши паролей.

---

### `/home` — домашние директории пользователей

Каждый пользователь имеет свою директорию `/home/<username>`.

```bash
/home/
├── alice/
│   ├── .bashrc
│   ├── .ssh/
│   │   ├── authorized_keys
│   │   └── id_rsa
│   ├── Documents/
│   └── Downloads/
└── bob/
    └── ...
```

```bash
# ~ — это алиас на домашнюю директорию текущего пользователя
cd ~
echo $HOME    # /home/alice
```

---

### `/root` — домашняя директория суперпользователя

Root не живёт в `/home` — его дом это `/root`. Это сделано намеренно: `/home` может быть на отдельном разделе.

```bash
ls /root
# .bashrc  .ssh/  .bash_history  ...
```

---

### `/lib` и `/lib64` — системные библиотеки

Разделяемые библиотеки (`.so` файлы), необходимые для бинарников из `/bin` и `/sbin`.

```bash
ls /lib/x86_64-linux-gnu/
# libc.so.6  libm.so.6  libpthread.so.0  ...

# Посмотреть зависимости программы
ldd /bin/ls
# linux-vdso.so.1
# libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
# libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
```

---

### `/usr` — пользовательские программы и данные

Второй по важности уровень иерархии. Исторически монтировался с сети.

```
/usr/
├── bin/          # пользовательские программы (python3, git, vim, ...)
├── sbin/         # системные программы (apache2, nginx, ...)
├── lib/          # библиотеки для программ из /usr/bin
├── local/        # программы, установленные вручную (не пакетным менеджером)
│   ├── bin/
│   ├── lib/
│   └── share/
├── share/        # архитектурно-независимые данные (man-страницы, иконки)
│   ├── doc/
│   ├── man/
│   └── locale/
└── include/      # заголовочные файлы C/C++
```

```bash
# Программы из пакетного менеджера идут в /usr/bin
which python3     # /usr/bin/python3
which git         # /usr/bin/git

# Программы собранные вручную — в /usr/local/bin
which myprogram   # /usr/local/bin/myprogram
```

---

### `/var` — изменяемые данные

Данные, которые **постоянно меняются** в процессе работы системы.

```bash
/var/
├── log/          # системные логи
│   ├── syslog
│   ├── auth.log
│   ├── kern.log
│   └── nginx/
│       ├── access.log
│       └── error.log
├── www/          # веб-файлы
├── lib/          # данные приложений (БД пакетного менеджера, etc.)
│   └── dpkg/     # база установленных пакетов
├── cache/        # кэш приложений
├── spool/        # очереди заданий (cron, mail)
│   └── cron/
├── mail/         # почтовые ящики
└── run/          # PID файлы запущенных процессов
```

```bash
# Смотреть логи в реальном времени
tail -f /var/log/syslog
tail -f /var/log/auth.log

# Найти все ошибки за сегодня
grep "error" /var/log/syslog | grep "$(date +%b\ %d)"
```

---

### `/tmp` — временные файлы

Временное хранилище. **Очищается при перезагрузке** (или по таймеру через systemd-tmpfiles).

```bash
# Создать временный файл
tmpfile=$(mktemp)
echo "данные" > $tmpfile

# Временная директория
tmpdir=$(mktemp -d)
cd $tmpdir

# /tmp доступен всем пользователям!
ls -la /tmp
# drwxrwxrwt  — sticky bit (t) — только владелец может удалить свой файл
```

> Не хранить чувствительные данные в `/tmp` — он доступен всем пользователям системы.

---

### `/proc` — виртуальная ФС процессов

Не существует на диске — генерируется ядром в памяти. Интерфейс к **внутренностям ядра**.

```bash
# Информация о процессе (PID)
ls /proc/1/           # процесс init/systemd
cat /proc/1/status    # статус процесса
cat /proc/1/cmdline   # командная строка запуска
ls /proc/1/fd/        # открытые файловые дескрипторы

# Информация о системе
cat /proc/cpuinfo     # CPU
cat /proc/meminfo     # память
cat /proc/version     # версия ядра
cat /proc/uptime      # время работы системы
cat /proc/loadavg     # нагрузка

# Сетевая статистика
cat /proc/net/tcp     # TCP соединения
cat /proc/net/if_inet6 # IPv6 интерфейсы
```

```bash
# Интерактивный пример: найти все открытые сокеты процесса
PID=$(pgrep nginx | head -1)
ls -la /proc/$PID/fd/ | grep socket
```

---

### `/sys` — виртуальная ФС ядра (sysfs)

Интерфейс к **драйверам и устройствам** ядра. Появился в Linux 2.6 как замена части `/proc`.

```bash
# Устройства
ls /sys/class/net/        # сетевые интерфейсы
cat /sys/class/net/eth0/address   # MAC адрес

# Управление питанием
cat /sys/class/power_supply/BAT0/capacity  # заряд батареи %

# Блочные устройства
ls /sys/block/            # диски
cat /sys/block/sda/size   # размер диска в секторах

# Параметры ядра (runtime)
cat /sys/kernel/hostname
```

---

### `/run` — runtime данные

Данные времени выполнения. Хранится в tmpfs (RAM). Появился как замена `/var/run`.

```bash
ls /run/
# lock/  systemd/  user/  sshd.pid  nginx.pid  ...

# PID файлы сервисов
cat /run/nginx.pid    # PID мастер-процесса nginx
cat /run/sshd.pid     # PID демона SSH

# Сокеты
ls /run/systemd/
ls /run/user/1000/    # сокеты пользовательской сессии
```

---

### `/media` и `/mnt` — монтируемые устройства

```bash
/media/   # автоматически монтируемые устройства (USB, CD/DVD)
/mnt/     # временное ручное монтирование

# Пример монтирования
mount /dev/sdb1 /mnt/usb
ls /mnt/usb/
umount /mnt/usb

# /media управляется автоматически (udisks2, GNOME, etc.)
ls /media/username/USB_DRIVE/
```

---

### `/opt` — опциональные пакеты

Программы сторонних производителей, которые не входят в стандартные репозитории. Каждый пакет — в своей поддиректории.

```bash
ls /opt/
# google/  chrome/  teamviewer/  idea/  ...

# Например, IntelliJ IDEA устанавливается как:
/opt/idea/
├── bin/
│   └── idea.sh
├── lib/
└── plugins/
```

---

### `/srv` — данные сервисов

Данные, предоставляемые системой как сервис (веб-сервер, FTP и т.д.).

```bash
/srv/
├── http/     # данные веб-сервера
├── ftp/      # данные FTP сервера
└── git/      # git репозитории
```

> На практике многие используют `/var/www` вместо `/srv/http` — это вопрос конвенции.

---

## Схема иерархии

```
/
├── bin  →  /usr/bin         # основные команды
├── sbin →  /usr/sbin        # системные команды
├── lib  →  /usr/lib         # библиотеки
├── lib64 → /usr/lib64
├── boot/                    # загрузчик + ядро
├── dev/                     # устройства
├── etc/                     # конфиги
├── home/                    # пользователи
├── root/                    # home для root
├── media/                   # съёмные носители
├── mnt/                     # точки монтирования
├── opt/                     # сторонние программы
├── proc/                    # виртуальная ФС (процессы)
├── run/                     # runtime данные (tmpfs)
├── srv/                     # данные сервисов
├── sys/                     # виртуальная ФС (ядро)
├── tmp/                     # временные файлы
├── usr/                     # программы и данные
│   ├── bin/
│   ├── lib/
│   ├── local/
│   └── share/
└── var/                     # изменяемые данные
    ├── log/
    ├── lib/
    └── cache/
```

---

## Полезные команды для навигации

```bash
# Где находится программа?
which python3           # /usr/bin/python3
whereis nginx           # nginx: /usr/sbin/nginx /etc/nginx /usr/share/man/...
type ls                 # ls is aliased to `ls --color=auto`

# Что занимает место?
du -sh /var/log/*       # размер каждого лога
du -sh /* 2>/dev/null   # размер корневых директорий
df -h                   # использование разделов

# Найти файл
find / -name "nginx.conf" 2>/dev/null
find /etc -name "*.conf" -mtime -7    # конфиги изменённые за 7 дней

# Информация о файле
stat /etc/passwd
file /bin/ls              # тип файла
lsof /var/log/syslog      # кто открыл файл
```

---

## Права доступа и владение

```bash
# FHS регулирует не только расположение, но и права
ls -la /
# drwxr-xr-x   /          (755) — root:root
# drwxr-xr-x   /etc       (755) — root:root
# drwx------   /root      (700) — root:root
# drwxrwxrwt   /tmp       (1777) — sticky bit!
# drwxr-xr-x   /home      (755) — root:root
# drwx------   /home/user (700) — user:user

# Sticky bit на /tmp — важная деталь
# Каждый может писать, но удалить файл может только его владелец
```

---

## Монтирование и /etc/fstab

```bash
# Посмотреть смонтированные ФС
mount | column -t
cat /proc/mounts

# /etc/fstab — что монтируется автоматически при загрузке
# <device>  <mountpoint>  <type>  <options>  <dump>  <pass>
UUID=abc123   /         ext4    defaults      0       1
UUID=def456   /boot     ext4    defaults      0       2
UUID=ghi789   /home     ext4    defaults      0       2
tmpfs         /tmp      tmpfs   defaults      0       0
```

---

## Типы файловых систем

| ФС | Использование |
|----|--------------|
| `ext4` | Основная ФС большинства Linux систем |
| `xfs` | RHEL/CentOS, хорошо масштабируется |
| `btrfs` | Снапшоты, сжатие, RAID |
| `tmpfs` | RAM-диск (`/tmp`, `/run`) |
| `proc` | Виртуальная ФС процессов |
| `sysfs` | Виртуальная ФС ядра |
| `devtmpfs` | Устройства `/dev` |
| `overlay` | Docker контейнеры |

---

## Отличия от других ОС

| Linux | macOS | Windows |
|-------|-------|---------|
| `/bin`, `/usr/bin` | `/bin`, `/usr/bin` | `C:\Windows\System32` |
| `/etc` | `/etc` | `C:\Windows\System32\drivers\etc`, реестр |
| `/home/user` | `/Users/user` | `C:\Users\user` |
| `/tmp` | `/tmp` → `/private/tmp` | `%TEMP%` |
| `/dev/sda` | `/dev/disk0` | `\\.\PhysicalDrive0` |
| `/proc` | `/proc` (ограниченно) | WMI, Registry |

---

## Ссылки

- [FHS 3.0 Specification](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html) - официальный стандарт
- [man hier](https://man7.org/linux/man-pages/man7/hier.7.html) - `man 7 hier` в терминале
- [Linux Foundation](https://www.linuxfoundation.org/) - организация, поддерживающая стандарт
