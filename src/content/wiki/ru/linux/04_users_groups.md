# Пользователи и группы (sudo, /etc/passwd, /etc/shadow)

Linux — многопользовательская система. Каждый процесс, файл и ресурс принадлежит конкретному пользователю и группе. Понимание этой модели — основа системного администрирования и безопасности.

---

## Типы пользователей

| Тип | UID | Описание |
|-----|-----|----------|
| **root** | `0` | Суперпользователь. Полный доступ ко всему |
| **Системные** | `1–999` | Демоны и сервисы (nginx, www-data, postgres) |
| **Обычные** | `1000+` | Реальные пользователи |

```bash
# Посмотреть свой UID, GID и группы
id
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

whoami          # только имя текущего пользователя
logname         # имя пользователя, который вошёл в систему (не su)
```

---

## /etc/passwd — база пользователей

Каждая строка — один пользователь. Файл читаем всеми.

```bash
cat /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
# alice:x:1001:1001:Alice Smith,,,:/home/alice:/bin/bash
```

### Формат строки

```
alice : x : 1001 : 1001 : Alice Smith,,, : /home/alice : /bin/bash
  │     │    │      │           │               │              │
  │     │    │      │           │               │              └── shell
  │     │    │      │           │               └───────────────── home dir
  │     │    │      │           └───────────────────────────────── GECOS (комментарий)
  │     │    │      └───────────────────────────────────────────── GID
  │     │    └──────────────────────────────────────────────────── UID
  │     └───────────────────────────────────────────────────────── пароль (x = в /etc/shadow)
  └─────────────────────────────────────────────────────────────── логин
```

**Поле пароля:**
- `x` — пароль хранится в `/etc/shadow`
- `*` — вход запрещён (системные аккаунты)
- пусто — пароль не требуется (небезопасно)

**Поле shell:**
- `/bin/bash` — обычный интерактивный вход
- `/usr/sbin/nologin` — вход запрещён (для демонов)
- `/bin/false` — вход запрещён (альтернатива)
- `/bin/sync` — только команда sync

```bash
# Посмотреть только логины и shells
awk -F: '{print $1, $7}' /etc/passwd

# Найти пользователей с bash
grep "/bin/bash" /etc/passwd

# Найти пользователей без пароля
awk -F: '($2 == "" )' /etc/passwd
```

---

## /etc/shadow — хэши паролей

Читается только root. Хранит пароли и политики устаревания.

```bash
sudo cat /etc/shadow
# root:$6$rounds=5000$salt$hash...:19000:0:99999:7:::
# alice:$6$xyz$abc...:19500:0:90:7:14::
# bob:!:19200:0:99999:7:::
# carol:!!:19100:::::
```

### Формат строки

```
alice : $6$xyz$hash : 19500 : 0 : 90 : 7 : 14 : : 
  │         │           │     │    │    │    │   │
  │         │           │     │    │    │    │   └── зарезервировано
  │         │           │     │    │    │    └────── дней до отключения после истечения
  │         │           │     │    │    └─────────── предупреждение за N дней до истечения
  │         │           │     │    └──────────────── максимум дней между сменами пароля
  │         │           │     └───────────────────── минимум дней между сменами пароля
  │         │           └─────────────────────────── дата последней смены (дни с 01.01.1970)
  │         └─────────────────────────────────────── хэш пароля
  └───────────────────────────────────────────────── логин
```

**Статус аккаунта по хэшу:**
- `$6$...` — SHA-512 хэш (активный аккаунт)
- `$5$...` — SHA-256 хэш
- `$1$...` — MD5 хэш (устарел, небезопасен)
- `$y$...` — yescrypt (современный, Debian 11+)
- `!` — аккаунт заблокирован
- `!!` — пароль никогда не устанавливался
- пусто — пароль не требуется (опасно)

```bash
# Формат хэша: $алгоритм$параметры$соль$хэш
# $6$rounds=5000$randomsalt$XXXXXXXXXXXXXXXXXXX
#  │  │                 
#  │  └── параметры (rounds = количество итераций)
#  └───── 6 = SHA-512
```

---

## /etc/group — группы

```bash
cat /etc/group
# root:x:0:
# sudo:x:27:alice,bob
# developers:x:1002:alice,carol
# www-data:x:33:
```

### Формат строки

```
developers : x : 1002 : alice,carol
     │        │    │         │
     │        │    │         └── список дополнительных членов
     │        │    └──────────── GID
     │        └───────────────── пароль группы (x = в /etc/gshadow, редко используется)
     └────────────────────────── имя группы
```

```bash
# Посмотреть группы пользователя
groups alice
# alice : alice sudo developers

id alice
# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),1002(developers)

# Посмотреть членов группы
getent group developers
# developers:x:1002:alice,carol
```

---

## /etc/gshadow — пароли групп

```bash
sudo cat /etc/gshadow
# developers:!::alice,carol
# sudo:*::alice,bob
```

Используется редко. `!` или `*` означает, что пароль на группу не установлен.

---

## Управление пользователями

### useradd — создание пользователя

```bash
# Базовое создание
useradd alice

# Полное создание с опциями
useradd -m -s /bin/bash -c "Alice Smith" -G sudo,developers alice
#        │   │               │             │
#        │   │               │             └── дополнительные группы
#        │   │               └──────────────── комментарий (GECOS)
#        │   └──────────────────────────────── shell
#        └──────────────────────────────────── создать домашнюю директорию

# Системный пользователь (для сервисов)
useradd -r -s /usr/sbin/nologin -d /var/lib/myapp myapp
#        │   │                    │
#        │   │                    └── home (но не создаётся)
#        │   └─────────────────────── запрет входа
#        └─────────────────────────── системный (UID < 1000)

# Опции useradd
useradd -u 1500 alice              # задать конкретный UID
useradd -g developers alice        # основная группа
useradd -G sudo,docker alice       # дополнительные группы
useradd -e 2024-12-31 alice        # дата истечения аккаунта
useradd -D                         # показать значения по умолчанию
```

### adduser — интерактивный (Debian/Ubuntu)

```bash
# adduser — высокоуровневый wrapper над useradd
adduser alice
# Creating user `alice'...
# Adding new group `alice' (1001)...
# Adding new user `alice' (1001) with group `alice'...
# Creating home directory `/home/alice'...
# Enter new UNIX password:
# ...

adduser alice sudo              # добавить в группу sudo
adduser alice developers        # добавить в группу developers
```

### usermod — изменение пользователя

```bash
usermod -s /bin/zsh alice              # изменить shell
usermod -d /home/newhome -m alice      # переместить домашнюю директорию
usermod -l newname alice               # переименовать пользователя
usermod -u 1500 alice                  # изменить UID
usermod -g developers alice            # изменить основную группу
usermod -aG sudo alice                 # добавить в группу (-a = append, важно!)
usermod -G sudo,developers alice       # задать точный список групп (убирает остальные)
usermod -L alice                       # заблокировать аккаунт (lock)
usermod -U alice                       # разблокировать аккаунт (unlock)
usermod -e 2025-12-31 alice            # задать дату истечения
usermod -e "" alice                    # снять дату истечения
usermod -c "Alice Smith" alice         # изменить комментарий
```

> ⚠️ `usermod -G` **без** `-a` заменяет все группы пользователя. Всегда используй `usermod -aG` для добавления в группу.

### userdel — удаление пользователя

```bash
userdel alice                  # удалить пользователя (сохранить home)
userdel -r alice               # удалить вместе с домашней директорией и почтой

# Перед удалением — найти все файлы пользователя
find / -user alice 2>/dev/null
find / -uid 1001 2>/dev/null   # по UID (если пользователь уже удалён)
```

---

## Управление паролями

### passwd — смена пароля

```bash
passwd                  # изменить свой пароль
passwd alice            # изменить пароль alice (root)
passwd -l alice         # заблокировать аккаунт (lock)
passwd -u alice         # разблокировать аккаунт (unlock)
passwd -d alice         # удалить пароль (небезопасно)
passwd -e alice         # истечение — пользователь должен сменить при входе
passwd -S alice         # статус пароля
# alice P 2024-01-15 0 90 7 14
#       │ └────────── дата последней смены
#       └──────────── P=установлен, L=заблокирован, NP=нет пароля
```

### chage — политика устаревания паролей

```bash
chage -l alice                  # показать текущую политику
# Last password change          : Jan 15, 2024
# Password expires              : Apr 15, 2024
# Password inactive             : Apr 29, 2024
# Account expires               : never
# Minimum number of days        : 0
# Maximum number of days        : 90
# Number of days of warning     : 7

chage -M 90 alice               # максимум 90 дней до смены пароля
chage -m 7 alice                # минимум 7 дней между сменами
chage -W 14 alice               # предупреждать за 14 дней
chage -I 30 alice               # неактивность 30 дней = блокировка
chage -E 2025-12-31 alice       # аккаунт истекает 31.12.2025
chage -E -1 alice               # никогда не истекает
chage -d 0 alice                # истечение немедленно (смена при след. входе)
```

---

## Управление группами

### groupadd / groupmod / groupdel

```bash
# Создание группы
groupadd developers
groupadd -g 2000 devops         # задать GID
groupadd -r syslog              # системная группа

# Изменение группы
groupmod -n newname developers  # переименовать
groupmod -g 2001 developers     # изменить GID

# Удаление группы
groupdel developers

# Добавить пользователя в группу
usermod -aG developers alice
gpasswd -a alice developers     # альтернатива

# Удалить пользователя из группы
gpasswd -d alice developers
deluser alice developers        # Debian/Ubuntu

# Посмотреть членов группы
getent group developers
grep "^developers" /etc/group
```

### newgrp — временная смена группы

```bash
# Сменить активную группу в текущей сессии
newgrp developers
# Теперь создаваемые файлы будут принадлежать группе developers

id
# uid=1001(alice) gid=1002(developers) groups=...

# Вернуться к основной группе
exit
```

---

## sudo — выполнение с привилегиями

`sudo` (superuser do) позволяет выполнять команды от имени другого пользователя (обычно root).

### Базовое использование

```bash
sudo command                    # выполнить как root
sudo -u bob command             # выполнить как bob
sudo -i                         # интерактивный shell root (с его окружением)
sudo -s                         # shell root (с текущим окружением)
sudo su -                       # ещё один способ стать root
sudo !!                         # повторить последнюю команду с sudo

sudo -l                         # показать что разрешено
sudo -l -U alice                # что разрешено alice (root)
sudo -v                         # обновить timestamp (продлить сессию)
sudo -k                         # сбросить timestamp (потребует пароль снова)
```

### /etc/sudoers — конфигурация

```bash
# НИКОГДА не редактируй /etc/sudoers напрямую
visudo                          # безопасное редактирование с проверкой синтаксиса
visudo -f /etc/sudoers.d/alice  # редактировать отдельный файл
```

#### Синтаксис sudoers

```
# Формат: кто  откуда=(как_кто)  команды
alice   ALL=(ALL:ALL)   ALL
│       │    │    │      │
│       │    │    │      └── команды (ALL = всё)
│       │    │    └───────── группа от чьего имени
│       │    └────────────── пользователь от чьего имени
│       └─────────────────── хост (ALL = любой)
└─────────────────────────── кто (пользователь или %группа)
```

#### Примеры правил

```bash
# Полный sudo без пароля (осторожно!)
alice   ALL=(ALL)   NOPASSWD: ALL

# Только конкретные команды
alice   ALL=(ALL)   /usr/bin/systemctl restart nginx, /usr/bin/systemctl status nginx

# Без пароля для конкретных команд
alice   ALL=(ALL)   NOPASSWD: /usr/bin/apt update, /usr/bin/apt upgrade

# Группа разработчиков может перезапускать сервисы
%developers   ALL=(ALL)   /usr/bin/systemctl restart *, /usr/bin/systemctl status *

# Запретить опасные команды
alice   ALL=(ALL)   ALL, !/bin/bash, !/bin/sh, !/usr/bin/su

# Выполнять команды от имени конкретного пользователя
alice   ALL=(www-data)   /usr/bin/php, /usr/bin/composer

# Алиасы для удобства
Cmnd_Alias SERVICES = /usr/bin/systemctl start *, /usr/bin/systemctl stop *
User_Alias ADMINS = alice, bob, carol
ADMINS   ALL=(ALL)   SERVICES
```

#### /etc/sudoers.d/

```bash
# Лучше создавать отдельные файлы, а не редактировать /etc/sudoers
ls /etc/sudoers.d/

# Создать правило для пользователя
echo "alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl" | sudo tee /etc/sudoers.d/alice
chmod 440 /etc/sudoers.d/alice

# Правило для группы разработчиков
cat /etc/sudoers.d/developers
# %developers ALL=(ALL) /usr/bin/docker, /usr/bin/docker-compose
```

---

## su — переключение пользователя

```bash
su alice                # переключиться на alice (нужен пароль alice)
su - alice              # с загрузкой окружения alice (рекомендуется)
su -                    # стать root (нужен пароль root)
su -c "command" alice   # выполнить команду от имени alice
```

> Разница `su` и `su -`: без дефиса переменные окружения остаются от текущего пользователя; с дефисом — полноценный вход (загружаются `.bashrc`, `.profile` целевого пользователя).

---

## PAM — Pluggable Authentication Modules

PAM управляет аутентификацией в Linux. Конфиги в `/etc/pam.d/`.

```bash
ls /etc/pam.d/
# common-auth  common-password  login  sshd  sudo  su  ...

# Пример /etc/pam.d/common-password
# password requisite pam_pwquality.so retry=3 minlen=12 dcredit=-1 ucredit=-1

# Настройка сложности паролей
apt install libpam-pwquality
cat /etc/security/pwquality.conf
# minlen = 12          # минимум 12 символов
# dcredit = -1         # минимум 1 цифра
# ucredit = -1         # минимум 1 заглавная
# lcredit = -1         # минимум 1 строчная
# ocredit = -1         # минимум 1 спецсимвол
# maxrepeat = 3        # не более 3 повторяющихся символов
```

---

## Блокировка и управление аккаунтами

```bash
# Заблокировать пользователя
passwd -l alice                  # добавляет ! перед хэшем в /etc/shadow
usermod -L alice                 # то же самое

# Разблокировать
passwd -u alice
usermod -U alice

# Заблокировать через изменение shell
usermod -s /usr/sbin/nologin alice

# Полная блокировка: и пароль, и дата истечения
usermod -L -e 1 alice            # дата 1 день с эпохи = аккаунт истёк

# Проверить статус
passwd -S alice
# alice L 2024-01-15 0 90 7 14   ← L = Locked

# Посмотреть заблокированные аккаунты
awk -F: '$2 ~ /^!/' /etc/shadow
```

---

## getent — запрос к базе NSS

`getent` запрашивает данные через Name Service Switch — работает и с локальными файлами, и с LDAP/AD.

```bash
getent passwd alice              # запись пользователя
getent passwd                    # все пользователи
getent group developers          # запись группы
getent group                     # все группы
getent shadow alice              # запись shadow (только root)
getent hosts myserver            # DNS/hosts lookup
```

---

## Аудит и мониторинг

```bash
# Кто сейчас в системе
who                             # вошедшие пользователи
w                               # вошедшие + что делают
last                            # история входов
last alice                      # входы конкретного пользователя
lastb                           # неудачные попытки входа (root)
lastlog                         # последний вход каждого пользователя

# Логи аутентификации
tail -f /var/log/auth.log       # Debian/Ubuntu
tail -f /var/log/secure         # RHEL/CentOS

# Найти подозрительные входы
grep "Failed password" /var/log/auth.log
grep "Invalid user" /var/log/auth.log
grep "sudo" /var/log/auth.log | grep alice

# Кто использует sudo
grep "sudo" /var/log/auth.log
journalctl _COMM=sudo

# История команд пользователя (если есть доступ)
cat /home/alice/.bash_history
```

---

## Практические сценарии

### Создать нового администратора

```bash
useradd -m -s /bin/bash -c "Bob Admin" bob
passwd bob
usermod -aG sudo bob            # Debian/Ubuntu
usermod -aG wheel bob           # RHEL/CentOS
```

### Создать сервисного пользователя

```bash
# Пользователь для веб-приложения
useradd -r -s /usr/sbin/nologin -d /opt/myapp -c "MyApp Service" myapp
mkdir -p /opt/myapp
chown myapp:myapp /opt/myapp
```

### Настроить sudo для команды

```bash
groupadd devops
usermod -aG devops alice
usermod -aG devops bob

cat > /etc/sudoers.d/devops << 'EOF'
%devops ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/bin/docker, /usr/bin/kubectl
EOF
chmod 440 /etc/sudoers.d/devops
```

### Аудит пользователей системы

```bash
# Все пользователи с возможностью входа
awk -F: '$7 !~ /nologin|false/ {print $1, $3, $7}' /etc/passwd

# Пользователи с UID 0 (должен быть только root!)
awk -F: '$3 == 0' /etc/passwd

# Пользователи без пароля
awk -F: '$2 == ""' /etc/shadow

# Пользователи с sudo правами
grep -Po '^[^#]\S+' /etc/sudoers
getent group sudo
getent group wheel
```

---

## Шпаргалка по командам

| Задача | Команда |
|--------|---------|
| Создать пользователя | `useradd -m -s /bin/bash alice` |
| Установить пароль | `passwd alice` |
| Добавить в группу | `usermod -aG sudo alice` |
| Заблокировать | `passwd -l alice` или `usermod -L alice` |
| Удалить с home | `userdel -r alice` |
| Создать группу | `groupadd developers` |
| Удалить из группы | `gpasswd -d alice developers` |
| Проверить группы | `id alice` или `groups alice` |
| Статус пароля | `passwd -S alice` |
| Политика пароля | `chage -l alice` |
| Кто онлайн | `who` или `w` |
| История входов | `last alice` |

---

## Ссылки

- [passwd man page](https://man7.org/linux/man-pages/man5/passwd.5.html) — `man 5 passwd`
- [shadow man page](https://man7.org/linux/man-pages/man5/shadow.5.html) — `man 5 shadow`
- [sudoers man page](https://man7.org/linux/man-pages/man5/sudoers.5.html) — `man 5 sudoers`
- [PAM Linux](http://www.linux-pam.org/Linux-PAM-html/) — документация PAM
