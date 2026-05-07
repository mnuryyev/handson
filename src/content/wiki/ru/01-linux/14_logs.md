---
title: "Логи в Linux (/var/log, journalctl, syslog)"
date: "2026-05-07"
---

Логи - это записи о событиях в системе. Без них невозможно диагностировать проблемы, отслеживать безопасность и понимать что происходит "под капотом". Linux имеет два параллельных мира логирования: классические текстовые файлы в `/var/log` и бинарный журнал systemd (journald).

---

## Архитектура логирования в Linux

```
Приложение / Ядро
       │
       ├──► /dev/log (сокет)
       │          │
       │    syslog-демон (rsyslog / syslog-ng)
       │          │
       │    /var/log/*.log   ←── текстовые файлы
       │
       └──► systemd journal (journald)
                  │
            /run/log/journal/   ←── бинарный журнал
            /var/log/journal/   ←── если настроено персистентное хранение
```

До systemd всё логирование шло через syslog-демон. Сейчас оба механизма сосуществуют: journald перехватывает всё (stdout/stderr сервисов, сообщения ядра, syslog-сокет), а rsyslog может читать из journald и писать в файлы.

---

## /var/log - структура директории

```bash
ls /var/log/
```

| Файл / Директория | Содержимое |
| --- | --- |
| `syslog` | Основной системный журнал (Debian/Ubuntu) |
| `messages` | Основной системный журнал (RHEL/CentOS) |
| `auth.log` | Аутентификация: ssh, sudo, su (Debian/Ubuntu) |
| `secure` | Аутентификация (RHEL/CentOS) |
| `kern.log` | Сообщения ядра |
| `dmesg` | Сообщения загрузки ядра (кольцевой буфер) |
| `boot.log` | Лог загрузки системы |
| `dpkg.log` | Установка/удаление пакетов (Debian) |
| `apt/history.log` | История apt-команд |
| `cron` / `cron.log` | Задания cron |
| `mail.log` / `maillog` | Почтовый сервер |
| `nginx/` | Логи nginx (access.log, error.log) |
| `apache2/` | Логи Apache |
| `mysql/` | Логи MySQL |
| `fail2ban.log` | Заблокированные IP fail2ban |
| `audit/audit.log` | Аудит безопасности (auditd) |
| `lastlog` | Последний вход каждого пользователя (бинарный) |
| `wtmp` | История всех входов/выходов (бинарный) |
| `btmp` | Неудачные попытки входа (бинарный) |

```bash
# Посмотреть размеры всех лог-файлов
du -sh /var/log/* 2>/dev/null | sort -rh | head -20

# Список файлов с датами изменения
ls -lth /var/log/ | head -20
```

---

## Чтение текстовых логов

### Базовые инструменты

```bash
# Просмотр файла целиком
cat /var/log/syslog

# Постраничный просмотр
less /var/log/syslog
# в less: G - конец, g - начало, /слово - поиск, q - выход

# Последние N строк
tail -n 50 /var/log/syslog
tail -n 100 /var/log/auth.log

# Следить в реальном времени
tail -f /var/log/syslog
tail -f /var/log/nginx/access.log

# Следить за несколькими файлами одновременно
tail -f /var/log/syslog /var/log/auth.log

# Первые N строк
head -n 50 /var/log/syslog
```

### Поиск и фильтрация

```bash
# Найти все строки с ключевым словом
grep "error" /var/log/syslog
grep -i "error" /var/log/syslog          # регистронезависимо
grep -i "fail\|error\|warn" /var/log/syslog  # несколько паттернов

# С контекстом (строки до и после)
grep -A 3 -B 3 "segfault" /var/log/syslog  # 3 строки до и после
grep -C 5 "kernel panic" /var/log/syslog   # 5 строк контекста

# Инвертировать (исключить строки)
grep -v "systemd" /var/log/syslog

# Только количество совпадений
grep -c "error" /var/log/syslog

# Показать номера строк
grep -n "sshd" /var/log/auth.log

# Рекурсивно по всем файлам в /var/log
grep -r "192.168.1.100" /var/log/
grep -rl "error" /var/log/          # только имена файлов

# Регулярные выражения
grep -E "error|warning|critical" /var/log/syslog
grep -E "^May  7" /var/log/syslog   # строки с определённой датой
```

### Работа с временными диапазонами

```bash
# Фильтр по дате (формат зависит от системы)
# Формат syslog: "May  7 14:32:01"
grep "^May  7" /var/log/syslog
grep "^May  7 1[4-6]:" /var/log/syslog   # с 14:00 до 16:59

# Временной диапазон с awk
awk '/May  7 14:00/,/May  7 15:00/' /var/log/syslog

# Последний час (грубо - последние 1000 строк)
tail -n 1000 /var/log/syslog | grep "$(date +'%b %e %H')"
```

### Анализ с awk и sed

```bash
# Извлечь только IP-адреса
grep "sshd" /var/log/auth.log | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'

# Топ IP-адресов по количеству попыток входа
grep "Failed password" /var/log/auth.log \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
  | sort | uniq -c | sort -rn | head -10

# Топ URL в nginx access.log
awk '{print $7}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn | head -20

# Топ HTTP статус-кодов
awk '{print $9}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn

# Количество ошибок по часам
grep "error" /var/log/syslog \
  | awk '{print $3}' \
  | cut -d: -f1 \
  | sort | uniq -c
```

---

## Формат syslog

Классический формат (RFC 3164):

```
May  7 14:32:01 hostname sshd[1234]: Failed password for alice from 10.0.0.5 port 54321 ssh2
│               │         │    │      └── сообщение
│               │         │    └───────── PID процесса
│               │         └────────────── имя программы (тег)
│               └──────────────────────── имя хоста
└──────────────────────────────────────── временная метка
```

Расширенный формат (RFC 5424):

```
<34>1 2026-05-07T14:32:01.000Z hostname sshd 1234 - - Failed password...
│     │ │                        │         │    │
│     │ └── ISO 8601 timestamp    │         │    └── PID
│     └── версия                  │         └── программа
└── приоритет (facility * 8 + severity)        
```

### Facility и Severity

```bash
# Facility (источник сообщения)
# 0  - kern    (ядро)
# 1  - user    (пользовательские программы)
# 2  - mail    (почта)
# 3  - daemon  (системные демоны)
# 4  - auth    (аутентификация)
# 10 - authpriv (приватная аутентификация)
# 16-23 - local0..local7 (свободные для использования)

# Severity (уровень)
# 0 - emerg   (система нерабочая)
# 1 - alert   (нужно срочное действие)
# 2 - crit    (критическое состояние)
# 3 - err     (ошибки)
# 4 - warning (предупреждения)
# 5 - notice  (нормальное, но важное)
# 6 - info    (информационные)
# 7 - debug   (отладочные)

# Приоритет = facility * 8 + severity
# <34> = 4 * 8 + 2 = auth + crit
```

---

## rsyslog - настройка

rsyslog - стандартный syslog-демон в Debian/Ubuntu/RHEL.

```bash
# Конфиги
/etc/rsyslog.conf           # основной конфиг
/etc/rsyslog.d/*.conf       # дополнительные конфиги

# Проверить конфиг
rsyslogd -N1

# Перезапустить
systemctl restart rsyslog
systemctl status rsyslog
```

### Основной синтаксис rsyslog

```bash
# /etc/rsyslog.conf
# Формат: facility.severity    действие

# Все сообщения ядра в kern.log
kern.*                          /var/log/kern.log

# Все ошибки и выше в /var/log/error
*.err                           /var/log/error

# auth и authpriv в auth.log
auth,authpriv.*                 /var/log/auth.log

# Всё кроме auth в syslog
*.*;auth,authpriv.none          /var/log/syslog

# Только info, не выше warning, кроме mail/auth/cron
*.info;mail.none;authpriv.none;cron.none  /var/log/messages

# Дублировать в консоль root
*.emerg                         :omusrmsg:root

# Отправить на удалённый syslog-сервер (UDP)
*.* @192.168.1.10:514

# Отправить на удалённый syslog-сервер (TCP, надёжнее)
*.* @@192.168.1.10:514
```

### Пример кастомного конфига

```bash
# /etc/rsyslog.d/nginx.conf
# Перехватить логи nginx в отдельный файл
if $programname == 'nginx' then /var/log/nginx/rsyslog.log
& stop   # не продолжать обработку этого сообщения
```

---

## dmesg - сообщения ядра

`dmesg` показывает кольцевой буфер ядра (kernel ring buffer). Особенно полезен при диагностике железа, загрузки и ошибок ядра.

```bash
# Основные команды
dmesg                          # весь буфер
dmesg | less                   # с пагинацией
dmesg -T                       # с читаемыми временными метками
dmesg -H                       # красивый вывод (human-readable)
dmesg -w                       # следить в реальном времени (watch)
dmesg -c                       # вывести и очистить буфер (нужен root)

# Фильтры по уровню
dmesg -l err                   # только ошибки
dmesg -l warn,err,crit         # несколько уровней
dmesg -l emerg,alert,crit,err  # все серьёзные

# Фильтры по устройствам и событиям
dmesg | grep -i "usb"          # USB события
dmesg | grep -i "eth\|enp\|ens"  # сетевые интерфейсы
dmesg | grep -i "error\|fail"  # ошибки
dmesg | grep -i "oom"          # Out Of Memory killer
dmesg | grep -i "sda\|nvme"    # диски
dmesg | grep -i "thermal\|temperature"  # температура

# После загрузки системы - ошибки при старте
dmesg -T | grep -i "error\|fail\|warn" | head -30
```

### Типичные сообщения dmesg

```bash
# OOM Killer (нехватка памяти)
# [123456.789] Out of memory: Killed process 1234 (python3) ...

# Ошибка диска
# [123456.789] ata1.00: error: { UNC }
# [123456.789] end_request: I/O error, dev sda, sector 1234567

# USB устройство подключено
# [123456.789] usb 1-1: new high-speed USB device number 3

# Загрузка ядерного модуля
# [    0.123] Loading driver: e1000e
```

---

## journalctl - журнал systemd

`journalctl` - инструмент для чтения бинарного журнала systemd (journald). Хранит структурированные данные: сервис, PID, UID, приоритет и т.д.

### Базовые команды

```bash
journalctl                     # весь журнал (от старых к новым)
journalctl -r                  # от новых к старым
journalctl -f                  # следить в реальном времени (follow)
journalctl -e                  # перейти к концу журнала
journalctl -n 50               # последние 50 строк
journalctl -n 100 -r           # последние 100, сначала новые
```

### Фильтры по времени

```bash
# Абсолютное время
journalctl --since "2026-05-07 14:00:00"
journalctl --until "2026-05-07 15:00:00"
journalctl --since "2026-05-07 14:00:00" --until "2026-05-07 15:00:00"

# Относительное время
journalctl --since "1 hour ago"
journalctl --since "2 hours ago" --until "1 hour ago"
journalctl --since "yesterday"
journalctl --since "today"
journalctl --since "-30m"       # последние 30 минут

# Текущая загрузка системы
journalctl -b                   # текущая загрузка
journalctl -b -1                # предыдущая загрузка
journalctl -b -2                # две загрузки назад

# Список загрузок
journalctl --list-boots
# -2  abc123  Mon 2026-05-05 10:00:00  Mon 2026-05-05 23:59:59
# -1  def456  Tue 2026-05-06 08:00:00  Tue 2026-05-06 23:59:59
#  0  ghi789  Wed 2026-05-07 09:00:00  n/a
```

### Фильтры по сервисам и юнитам

```bash
# По имени сервиса (юнита)
journalctl -u nginx              # все логи nginx
journalctl -u nginx -f           # в реальном времени
journalctl -u nginx -n 100       # последние 100 строк
journalctl -u nginx --since "1 hour ago"

# Несколько сервисов одновременно
journalctl -u nginx -u php-fpm -u mysql

# По исполняемому файлу
journalctl /usr/sbin/sshd
journalctl /usr/bin/python3
```

### Фильтры по уровню важности

```bash
# -p задаёт уровень (0-7 или имя)
journalctl -p err               # ошибки и выше (0-3)
journalctl -p warning           # предупреждения и выше (0-4)
journalctl -p info              # info и выше (0-6)
journalctl -p debug             # всё (0-7)

# Диапазон уровней
journalctl -p warning..err      # от warning до err
journalctl -p 4..3              # числами

# Уровни: emerg(0) alert(1) crit(2) err(3) warning(4) notice(5) info(6) debug(7)
```

### Фильтры по процессам и пользователям

```bash
# По PID
journalctl _PID=1234

# По UID (пользователю)
journalctl _UID=1000
journalctl _UID=$(id -u alice)

# По имени исполняемого файла
journalctl _COMM=sshd
journalctl _COMM=nginx

# По пути исполняемого файла
journalctl _EXE=/usr/sbin/sshd

# Комбинировать фильтры (И)
journalctl _UID=1000 _COMM=bash

# Комбинировать (ИЛИ)
journalctl _COMM=sshd + _COMM=sudo
```

### Форматы вывода

```bash
journalctl -o short             # стандартный (по умолчанию)
journalctl -o short-precise     # с микросекундами
journalctl -o short-iso         # ISO 8601 временные метки
journalctl -o verbose           # все поля записи
journalctl -o json              # JSON формат
journalctl -o json-pretty       # JSON с отступами
journalctl -o cat               # только сообщение, без метаданных
journalctl -o export            # для экспорта/резервного копирования

# JSON - удобно для парсинга
journalctl -u nginx -o json-pretty | head -60

# Пример JSON-записи
# {
#   "__REALTIME_TIMESTAMP" : "1746620321000000",
#   "_HOSTNAME" : "server01",
#   "_SYSTEMD_UNIT" : "nginx.service",
#   "PRIORITY" : "6",
#   "MESSAGE" : "Started A high performance web server",
#   "_PID" : "1234",
#   "_COMM" : "nginx"
# }
```

### Управление журналом

```bash
# Размер журнала на диске
journalctl --disk-usage

# Очистить старые записи
journalctl --vacuum-size=500M    # оставить не более 500 МБ
journalctl --vacuum-time=30d     # удалить старше 30 дней
journalctl --vacuum-files=5      # оставить только 5 файлов журнала

# Принудительно ротировать журнал
journalctl --rotate

# Проверить целостность
journalctl --verify
```

### Настройка journald

```bash
# /etc/systemd/journald.conf

[Journal]
# Хранение: "persistent" (на диск), "volatile" (только RAM), "auto", "none"
Storage=persistent

# Максимальный размер журнала на диске
SystemMaxUse=1G

# Максимальный размер одного файла журнала
SystemMaxFileSize=128M

# Хранить не более N дней
MaxRetentionSec=30day

# Сжимать старые записи
Compress=yes

# Пересылать в syslog
ForwardToSyslog=yes

# Максимальный уровень для пересылки в syslog
MaxLevelSyslog=warning
```

```bash
# Применить изменения
systemctl restart systemd-journald

# Создать директорию для персистентного хранения
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
```

---

## logger - запись в syslog из командной строки

```bash
# Базовый синтаксис
logger "Это тестовое сообщение"

# С уровнем и источником
logger -p user.info "Деплой начат"
logger -p user.err "Ошибка деплоя!"
logger -p auth.warning "Подозрительная активность"

# С тегом (именем программы)
logger -t myapp "Сервис запущен"
logger -t deploy -p local0.info "v2.3.1 задеплоен"

# С именем хоста
logger -n 192.168.1.10 -P 514 "Отправить на удалённый syslog"

# Прочитать из stdin
echo "Критическая ошибка" | logger -p user.crit -t myapp
cat error.log | logger -t import-errors

# Проверить что записалось
journalctl -t myapp -n 5
grep "myapp" /var/log/syslog | tail -5
```

---

## Бинарные лог-файлы

Некоторые файлы в `/var/log` бинарные - их нельзя читать через `cat`.

### last, lastb, lastlog

```bash
# last - история входов (читает /var/log/wtmp)
last                           # все входы
last alice                     # входы пользователя alice
last -n 20                     # последние 20 записей
last -F                        # полные временные метки
last -x                        # включить выключения и перезагрузки
last reboot                    # история перезагрузок
last shutdown                  # история выключений

# Пример вывода last:
# alice    pts/0  192.168.1.5    Wed May  7 14:32   still logged in
# root     tty1                  Wed May  7 09:00 - 09:05  (00:05)
# reboot   system boot           Wed May  7 08:55

# lastb - неудачные входы (читает /var/log/btmp, нужен root)
lastb                          # все неудачные входы
lastb -n 20                    # последние 20
lastb alice                    # неудачные входы alice

# lastlog - последний вход каждого пользователя
lastlog                        # все пользователи
lastlog -u alice               # конкретный пользователь
lastlog -t 7                   # входы за последние 7 дней
lastlog -b 7                   # те, кто не входил последние 7 дней
```

---

## logrotate - ротация логов

logrotate автоматически архивирует и удаляет старые логи.

```bash
# Конфиги
/etc/logrotate.conf             # основной
/etc/logrotate.d/               # конфиги для отдельных приложений

# Проверить что будет делать (dry run)
logrotate -d /etc/logrotate.conf

# Принудительно ротировать сейчас
logrotate -f /etc/logrotate.conf
logrotate -f /etc/logrotate.d/nginx
```

### Пример конфига logrotate

```bash
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily                      # ротировать ежедневно
    missingok                  # не ошибка если файл отсутствует
    rotate 30                  # хранить 30 архивов
    compress                   # сжимать архивы (gzip)
    delaycompress              # сжать со следующей ротации (не сразу)
    notifempty                 # не ротировать пустые файлы
    create 0640 www-data adm   # создать новый файл с правами 640
    sharedscripts              # выполнить скрипты один раз для всех файлов

    postrotate
        # Перезагрузить nginx после ротации
        [ -f /run/nginx.pid ] && kill -USR1 $(cat /run/nginx.pid)
    endscript
}
```

```bash
# Именование архивов
# access.log          - текущий
# access.log.1        - вчерашний
# access.log.2.gz     - позавчерашний
# ...
# access.log.30.gz    - 30 дней назад

# Прочитать сжатый архив
zcat /var/log/nginx/access.log.2.gz
zgrep "error" /var/log/nginx/access.log.*.gz
zless /var/log/nginx/access.log.3.gz
```

---

## Централизованное логирование

### Отправка логов на удалённый сервер

```bash
# Клиент: /etc/rsyslog.d/remote.conf

# Отправить все логи по UDP (быстро, может теряться)
*.* @192.168.1.100:514

# Отправить все логи по TCP (надёжнее)
*.* @@192.168.1.100:514

# Только критические ошибки
*.crit @@192.168.1.100:514

# С TLS (рекомендуется для продакшена)
$DefaultNetstreamDriver gtls
*.* @@192.168.1.100:6514
```

```bash
# Сервер: /etc/rsyslog.d/server.conf

# Принимать по UDP
module(load="imudp")
input(type="imudp" port="514")

# Принимать по TCP
module(load="imtcp")
input(type="imtcp" port="514")

# Сохранять логи по имени хоста клиента
$template RemoteLogs,"/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log"
*.* ?RemoteLogs
```

### Пересылка journald в remote syslog

```bash
# /etc/systemd/journald.conf
[Journal]
ForwardToSyslog=yes

# Или пересылать напрямую через journalctl
journalctl -f -o json | \
  nc -u 192.168.1.100 514
```

---

## Полезные однострочники

```bash
# Мониторить все новые записи в реальном времени
journalctl -f

# Найти все SSH-попытки за сегодня
journalctl -u ssh --since today | grep "Failed\|Invalid"

# Топ-10 IP по неудачным попыткам SSH
grep "Failed password" /var/log/auth.log \
  | grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}' \
  | sort | uniq -c | sort -rn | head -10

# Найти OOM Kill события
dmesg -T | grep -i "killed process"
journalctl -k | grep -i "killed process"

# Все sudo-команды за последние 24 часа
journalctl _COMM=sudo --since "24 hours ago"

# Ошибки за текущую загрузку системы
journalctl -b -p err

# Посмотреть лог конкретного сервиса с момента последнего старта
journalctl -u nginx --since "$(systemctl show nginx -p ActiveEnterTimestamp \
  | cut -d= -f2)"

# Количество событий по уровням за сегодня
for level in emerg alert crit err warning notice info; do
  count=$(journalctl --since today -p $level -p $level -q | wc -l)
  echo "$level: $count"
done

# Найти большие лог-файлы
find /var/log -name "*.log" -size +100M -exec ls -lh {} \;

# Следить за несколькими сервисами
journalctl -f -u nginx -u php-fpm -u redis

# Экспортировать логи за период в файл
journalctl --since "2026-05-01" --until "2026-05-07" \
  -u nginx -o json > nginx-may.json

# Количество запросов к nginx по статус-коду
awk '{print $9}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn

# Найти кто занимает много места в /var/log
du -sh /var/log/* 2>/dev/null | sort -rh | head -15
```

---

## Диагностика типичных ситуаций

### SSH-атаки и брутфорс

```bash
# Посмотреть неудачные входы
grep "Failed password" /var/log/auth.log | tail -20
journalctl _COMM=sshd | grep "Failed" | tail -20

# Атакующие IP с количеством попыток
grep "Failed password" /var/log/auth.log \
  | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head

# Какие имена пользователей пробуют
grep "Invalid user" /var/log/auth.log \
  | awk '{print $8}' | sort | uniq -c | sort -rn | head

# Успешные входы
grep "Accepted password\|Accepted publickey" /var/log/auth.log | tail -20
```

### Проблемы с сервисом

```bash
# Сервис упал - почему?
journalctl -u myservice -n 50         # последние 50 строк
journalctl -u myservice -p err        # только ошибки
journalctl -u myservice -b -1         # при предыдущей загрузке

# Статус и последние логи
systemctl status myservice

# Сколько раз перезапускался
journalctl -u myservice | grep "Started\|stopped\|failed" | wc -l
```

### OOM Killer (нехватка памяти)

```bash
# Найти события OOM
dmesg -T | grep -i "out of memory\|oom\|killed process"
journalctl -k | grep -i "killed process"

# Какие процессы убивал OOM
grep -i "killed process" /var/log/syslog | tail -20

# Текущее использование памяти
free -h
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|SwapFree"
```

### Ошибки диска

```bash
# Ошибки I/O
dmesg -T | grep -iE "error|fail|I/O error|ata|scsi|nvme" | tail -30

# SMART статус диска
smartctl -a /dev/sda | grep -iE "error|fail|reallocated|pending"

# Файловая система
dmesg | grep -i "ext4\|xfs\|btrfs" | grep -i "error\|corrupt"
```

---

## auditd - расширенный аудит

`auditd` - подсистема аудита ядра Linux. Логирует системные вызовы, доступ к файлам, изменения конфигов.

```bash
# Установка
apt install auditd audispd-plugins

# Основные файлы
/etc/audit/auditd.conf          # настройки демона
/etc/audit/rules.d/audit.rules  # правила аудита
/var/log/audit/audit.log        # лог аудита

# Просмотр логов
ausearch -m USER_LOGIN          # входы пользователей
ausearch -m USER_CMD            # выполненные команды
ausearch -m SYSCALL -sc open    # системный вызов open()
ausearch -ui 1000               # события пользователя с UID 1000
ausearch --start today          # события за сегодня
ausearch -f /etc/passwd         # доступ к файлу /etc/passwd

# Добавить правило: следить за /etc/shadow
auditctl -w /etc/shadow -p rwa -k shadow-access

# Следить за выполнением команд пользователем
auditctl -a always,exit -F arch=b64 -F uid=1000 -S execve -k user-cmds

# Посмотреть текущие правила
auditctl -l

# Отчёты
aureport                        # общая сводка
aureport --login                # отчёт по входам
aureport --failed               # неудачные события
aureport --auth                 # аутентификация
```

---

## Ссылки

- `man journalctl` - полная документация journalctl
- `man rsyslog.conf` - конфигурация rsyslog
- `man logrotate` - ротация логов
- `man auditd` - аудит безопасности
- `man last` - история входов
- `man dmesg` - сообщения ядра
- [journald документация](https://www.freedesktop.org/software/systemd/man/systemd-journald.service.html)
- [rsyslog документация](https://www.rsyslog.com/doc/)
