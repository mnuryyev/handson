---
title: "lsof, ss, netstat - открытые файлы и сетевые соединения"
date: "2026-05-11"
---


Три инструмента для диагностики того, что происходит с файлами и сетью прямо сейчас: кто держит открытым файл, какие порты слушают, какие соединения активны, к чему подключён процесс. Без этих утилит диагностика любых проблем с сетью или файлами в Linux практически невозможна.

---

## lsof - список открытых файлов

`lsof` (List Open Files) - показывает все открытые файловые дескрипторы в системе. В Linux всё является файлом: обычные файлы, директории, сокеты, пайпы, устройства. lsof видит их все.

### Установка

```bash
apt install lsof          # Debian/Ubuntu
yum install lsof          # RHEL/CentOS
pacman -S lsof            # Arch
```

### Базовый запуск

```bash
lsof                      # все открытые файлы (очень много)
lsof | wc -l              # сколько их вообще

lsof | head -20           # первые 20 строк
```

### Структура вывода

```
COMMAND    PID   USER   FD   TYPE  DEVICE SIZE/OFF   NODE NAME
nginx     1234   root  cwd    DIR     8,1     4096  12345 /
nginx     1234   root  txt    REG     8,1   786432  67890 /usr/sbin/nginx
nginx     1234   root  mem    REG     8,1  1905632  23456 /lib/x86_64/libc.so.6
nginx     1234   root    3u  IPv4  123456      0t0    TCP *:80 (LISTEN)
nginx     1234   root    4u  IPv4  234567      0t0    TCP 10.0.0.1:80->1.2.3.4:52341 (ESTABLISHED)
```

| Колонка | Описание |
| --- | --- |
| `COMMAND` | Имя процесса (первые 9 символов) |
| `PID` | ID процесса |
| `USER` | Владелец процесса |
| `FD` | Файловый дескриптор (cwd, txt, mem, 0-N) |
| `TYPE` | Тип файла (REG, DIR, IPv4, IPv6, FIFO, CHR...) |
| `DEVICE` | Major/minor номера устройства |
| `SIZE/OFF` | Размер файла или смещение |
| `NODE` | Inode номер |
| `NAME` | Путь к файлу или адрес соединения |

### Значения поля FD

| FD | Описание |
| --- | --- |
| `cwd` | Current Working Directory - текущая директория |
| `txt` | Text - исполняемый файл программы |
| `mem` | Memory - файл загружен в память (shared library) |
| `rtd` | Root Directory - корневая директория |
| `0u` | stdin (u = read+write, r = read, w = write) |
| `1u` | stdout |
| `2u` | stderr |
| `3u`, `4r`, `5w`... | Файловые дескрипторы открытых файлов |

### Значения поля TYPE

| TYPE | Описание |
| --- | --- |
| `REG` | Обычный файл |
| `DIR` | Директория |
| `CHR` | Character device (терминал, /dev/...) |
| `BLK` | Block device (диск) |
| `FIFO` | Пайп или FIFO |
| `IPv4` | IPv4 сокет |
| `IPv6` | IPv6 сокет |
| `unix` | Unix domain socket |
| `sock` | Сокет неизвестного типа |

---

## lsof - основные примеры

### По процессу и пользователю

```bash
# Открытые файлы конкретного процесса
lsof -p 1234
lsof -p 1234,5678         # несколько PID

# Открытые файлы по имени процесса
lsof -c nginx
lsof -c nginx -c apache   # несколько имён

# Открытые файлы пользователя
lsof -u alice
lsof -u alice,bob

# Все кроме пользователя (^ = исключить)
lsof -u ^root
```

### По файлу и директории

```bash
# Кто держит файл открытым
lsof /var/log/nginx/access.log
lsof /etc/passwd

# Кто использует директорию (и всё внутри)
lsof +D /var/log/          # рекурсивно по директории (медленно)
lsof +d /var/log/          # только файлы прямо в директории (быстро)

# Кто держит устройство
lsof /dev/sda1
```

### Сетевые соединения через lsof

```bash
# Все сетевые соединения
lsof -i

# Только IPv4 или IPv6
lsof -i 4
lsof -i 6

# Конкретный порт
lsof -i :80
lsof -i :80,443
lsof -i :22

# Конкретный протокол и порт
lsof -i TCP:80
lsof -i UDP:53

# Диапазон портов
lsof -i :1-1024

# Только LISTEN (кто слушает порты)
lsof -i -s TCP:LISTEN
lsof -i TCP -s TCP:LISTEN

# Только установленные соединения
lsof -i -s TCP:ESTABLISHED

# Соединения с конкретным хостом
lsof -i @192.168.1.100
lsof -i @192.168.1.100:80

# Кто слушает порт 8080?
lsof -i :8080 | grep LISTEN
```

### Полезные комбинации

```bash
# PID процесса, занимающего порт
lsof -ti :80                   # -t = только PID, без заголовка
kill $(lsof -ti :80)           # убить процесс на порту 80

# Все сокеты процесса
lsof -p $(pgrep nginx) -a -i

# Сколько файлов открыто у процесса
lsof -p 1234 | wc -l

# Файлы которые были удалены, но ещё открыты (занимают место на диске)
lsof | grep deleted
lsof | grep "(deleted)"

# Найти процесс, который держит удалённый файл (место на диске не освобождается)
lsof | grep deleted | awk '{print $1, $2, $NF}'

# Открытые файлы по расширению
lsof | grep "\.log$"
lsof | grep "\.py$"

# Процессы использующие конкретную библиотеку
lsof | grep libssl

# Не ждать DNS-резолвинга (быстрее)
lsof -n -i :80        # -n = не резолвить IP в имена
lsof -P -i :80        # -P = не резолвить порты в имена служб
lsof -nP -i           # оба флага вместе - максимальная скорость
```

---

## ss - статистика сокетов

`ss` (Socket Statistics) - современная замена `netstat`. Работает быстрее, так как читает данные напрямую из ядра через netlink, а не из `/proc`. Входит в пакет `iproute2`.

### Базовый запуск

```bash
ss                        # все сокеты (по умолчанию non-listening TCP)
ss -a                     # все сокеты включая LISTEN
ss -l                     # только listening сокеты
ss -t                     # только TCP
ss -u                     # только UDP
ss -x                     # только Unix domain sockets
```

### Структура вывода

```bash
ss -tnp
# Netid  State    Recv-Q  Send-Q   Local Address:Port   Peer Address:Port   Process
# tcp    LISTEN   0       128      0.0.0.0:80            0.0.0.0:*          users:(("nginx",pid=1234,fd=6))
# tcp    ESTAB    0       0        10.0.0.1:80           1.2.3.4:52341      users:(("nginx",pid=1235,fd=8))
```

| Колонка | Описание |
| --- | --- |
| `Netid` | Тип сокета: tcp, udp, unix, nl (netlink) |
| `State` | Состояние соединения |
| `Recv-Q` | Байт в очереди на получение |
| `Send-Q` | Байт в очереди на отправку |
| `Local Address:Port` | Локальный адрес и порт |
| `Peer Address:Port` | Удалённый адрес и порт |
| `Process` | PID и имя процесса (требует -p и root) |

### Состояния TCP в ss

| Состояние | Описание |
| --- | --- |
| `LISTEN` | Сокет слушает входящие соединения |
| `ESTAB` | Соединение установлено |
| `TIME-WAIT` | Соединение закрывается, ждёт последних пакетов |
| `CLOSE-WAIT` | Удалённая сторона закрыла соединение |
| `SYN-SENT` | Отправлен SYN, ждём SYN-ACK |
| `SYN-RECV` | Получен SYN, отправлен SYN-ACK |
| `FIN-WAIT-1` | Начало закрытия со своей стороны |
| `FIN-WAIT-2` | Ждём FIN от удалённой стороны |
| `LAST-ACK` | Ждём последнего ACK |
| `CLOSED` | Соединение закрыто |
| `UNCONN` | UDP сокет не подключён |

---

## ss - основные флаги

| Флаг | Описание |
| --- | --- |
| `-t` | TCP сокеты |
| `-u` | UDP сокеты |
| `-x` | Unix domain sockets |
| `-n` | Числовые адреса и порты (не резолвить) |
| `-l` | Только listening |
| `-a` | Все сокеты |
| `-p` | Показать процесс (PID и имя) |
| `-s` | Сводная статистика |
| `-e` | Расширенная информация |
| `-i` | Внутренняя информация TCP (таймеры, окна) |
| `-m` | Информация о памяти сокета |
| `-o` | Таймеры |
| `-r` | Резолвить имена (DNS + /etc/services) |
| `-4` | Только IPv4 |
| `-6` | Только IPv6 |
| `-f FAMILY` | Фильтр по семейству (inet, inet6, unix, netlink) |

---

## ss - практические примеры

### Основные запросы

```bash
# Кто слушает порты (самая частая задача)
ss -tlnp                  # TCP listening, числа, с процессами
ss -ulnp                  # UDP listening
ss -tlnp | grep :80       # конкретный порт

# Все установленные соединения
ss -tnp                   # TCP established с процессами
ss -tunp                  # TCP + UDP

# Все соединения (включая LISTEN)
ss -tanp                  # все TCP с процессами

# Unix domain sockets
ss -xlnp                  # Unix listening
ss -xp                    # все Unix с процессами
```

### Фильтрация по адресу и порту

```bash
# Фильтры в ss используют специальный синтаксис
ss -tnp dst 1.2.3.4              # соединения с удалённым хостом 1.2.3.4
ss -tnp dst 1.2.3.4:80           # на конкретный порт
ss -tnp src 10.0.0.1             # от локального адреса
ss -tnp src 10.0.0.1:8080        # от локального адреса и порта

# Порт
ss -tnp dport = :80              # destination port 80
ss -tnp sport = :443             # source port 443
ss -tnp dport \> :1024           # destination port > 1024

# Подсети
ss -tnp dst 192.168.0.0/24       # к подсети

# Комбинировать условия
ss -tnp dst 1.2.3.4 and dport = :80
ss -tnp state established dst 1.2.3.4
```

### Фильтрация по состоянию

```bash
ss -t state established          # все ESTABLISHED
ss -t state listen               # все LISTEN
ss -t state time-wait            # все TIME-WAIT

# Несколько состояний
ss -t state established or state close-wait

# Все кроме LISTEN
ss -t exclude listen

# Состояния с фильтром порта
ss -tnp state established dport = :443
```

### Статистика и информация

```bash
# Сводная статистика по всем сокетам
ss -s
# Total: 450
# TCP:   234 (estab 45, closed 12, orphaned 3, timewait 12)
# Transport Total  IP  IPv6
# RAW       0      0   0
# UDP       23     20  3
# TCP       222    200 22

# Расширенная информация о сокете
ss -tne                   # с параметрами сокета (таймауты, буферы)

# TCP внутренняя информация (окна, RTT, congestion control)
ss -tni
# cubic wscale:7,7 rto:204 rtt:4.123/1.123 ato:40 mss:1448
# rcvmss:536 advmss:1448 cwnd:10 ssthresh:2147483647 bytes_sent:1234
# segs_out:100 segs_in:80 data_segs_out:50 data_segs_in:40
# send 28.1Mbps lastsnd:8 lastrcv:4 lastack:4 pacing_rate 33.8Mbps
# rcv_rtt:1234 rcv_space:29200 rcv_ssthresh:56587

# Таймеры
ss -tno                   # показать таймеры keepalive / retransmit
```

### Диагностика конкретного процесса

```bash
# Все соединения nginx
ss -tnp | grep nginx

# Соединения по PID
ss -tnp | grep "pid=1234"

# Или через -p и grep
ss -tnp | grep 1234

# Сколько соединений у nginx?
ss -tnp | grep nginx | wc -l

# Соединения по состоянию для процесса
ss -tnp state established | grep nginx
```

---

## netstat - классическая утилита

`netstat` - старый стандарт, входит в пакет `net-tools`. В современных системах заменён на `ss`, но всё ещё встречается повсеместно. Синтаксис схож, но работает медленнее (читает `/proc/net`).

### Установка

```bash
apt install net-tools      # Debian/Ubuntu
yum install net-tools      # RHEL/CentOS
```

### Основные флаги netstat

| Флаг | Описание |
| --- | --- |
| `-t` | TCP |
| `-u` | UDP |
| `-x` | Unix domain sockets |
| `-l` | Только listening |
| `-a` | Все соединения |
| `-n` | Числовые адреса (не резолвить) |
| `-p` | Показать PID/имя процесса |
| `-s` | Статистика по протоколам |
| `-r` | Таблица маршрутизации |
| `-i` | Сетевые интерфейсы |
| `-e` | Расширенная информация |
| `-c` | Непрерывный вывод |
| `-4` | Только IPv4 |
| `-6` | Только IPv6 |

### Основные примеры netstat

```bash
# Кто слушает порты
netstat -tlnp             # TCP listening, числа, с процессами
netstat -ulnp             # UDP listening
netstat -tlnp | grep :80  # конкретный порт

# Все соединения
netstat -tunp             # TCP + UDP с процессами
netstat -tanp             # TCP all с процессами

# Статистика
netstat -s                # статистика по всем протоколам
netstat -st               # только TCP статистика
netstat -su               # только UDP статистика

# Таблица маршрутизации
netstat -r
netstat -rn               # без резолвинга

# Интерфейсы
netstat -i                # краткая статистика интерфейсов
netstat -ie               # расширенная (как ifconfig)
```

---

## netstat vs ss - сравнение

| Задача | netstat | ss |
| --- | --- | --- |
| Кто слушает TCP порты | `netstat -tlnp` | `ss -tlnp` |
| Все TCP соединения | `netstat -tnp` | `ss -tnp` |
| Все UDP | `netstat -unp` | `ss -unp` |
| Unix сокеты | `netstat -xnp` | `ss -xnp` |
| Статистика | `netstat -s` | `ss -s` |
| Таблица маршрутизации | `netstat -rn` | `ip route` |
| Интерфейсы | `netstat -i` | `ip link` |
| Скорость работы | медленная | быстрая |
| Фильтрация | только grep | встроенные фильтры |
| Детали TCP | ограниченно | `ss -tni` |

---

## Сравнение lsof, ss и netstat для сетевых задач

```bash
# Кто слушает порт 80?
lsof -i :80 | grep LISTEN
ss -tlnp | grep :80
netstat -tlnp | grep :80

# Все соединения к хосту 1.2.3.4
lsof -i @1.2.3.4
ss -tnp dst 1.2.3.4
netstat -tnp | grep 1.2.3.4

# Сколько соединений ESTABLISHED?
ss -t state established | wc -l
netstat -tn | grep ESTABLISHED | wc -l

# Процесс занимает порт?
lsof -ti :8080            # вернёт PID
ss -tlnp | grep :8080     # покажет PID в колонке Process
```

---

## Диагностические сценарии

### Порт занят, кем?

```bash
# Вариант 1 - lsof
lsof -i :5432

# Вариант 2 - ss
ss -tlnp | grep :5432

# Вариант 3 - netstat
netstat -tlnp | grep :5432

# Убить процесс на порту
kill $(lsof -ti :5432)
```

### Утечка файловых дескрипторов

```bash
# Сколько дескрипторов у процесса?
lsof -p 1234 | wc -l

# Лимит дескрипторов
cat /proc/1234/limits | grep "open files"

# Топ процессов по количеству открытых файлов
lsof | awk '{print $2}' | sort | uniq -c | sort -rn | head -10
# Первая колонка - количество, вторая - PID

# То же с именами
lsof | awk '{print $1, $2}' | sort | uniq -c | sort -rn | head -10
```

### Файл удалён, но место не освобождается

```bash
# Найти удалённые файлы которые ещё открыты
lsof | grep deleted

# Найти и показать размер
lsof | grep deleted | awk '{print $1, $2, $7, $NF}'
# COMMAND PID SIZE FILENAME

# Самые большие удалённые файлы
lsof | grep deleted | awk '{print $7, $1, $2, $NF}' | sort -rn | head -10

# Решение: перезапустить процесс который держит файл открытым
# или truncate файл без перезапуска:
> /proc/PID/fd/FD_NUMBER   # очистить содержимое через дескриптор
```

### Много соединений TIME-WAIT

```bash
# Сколько TIME-WAIT соединений?
ss -t state time-wait | wc -l
netstat -tn | grep TIME_WAIT | wc -l

# С каких IP больше всего TIME-WAIT?
ss -tn state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Ускорить переиспользование (в /etc/sysctl.conf)
# net.ipv4.tcp_tw_reuse = 1
# net.ipv4.tcp_fin_timeout = 30
sysctl -w net.ipv4.tcp_tw_reuse=1
```

### Анализ нагрузки на сервер

```bash
# Топ IP по количеству соединений
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# То же через netstat
netstat -tn | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Количество соединений по состоянию
ss -t | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# Netstat вариант
netstat -tn | awk 'NR>2 {print $6}' | sort | uniq -c | sort -rn
```

### Мониторинг в реальном времени

```bash
# watch + ss - обновление каждые 2 секунды
watch -n 2 'ss -tnp | grep :80'

# watch + netstat
watch -n 2 'netstat -tnp | grep :80'

# Непрерывный вывод netstat
netstat -c -tnp

# Мониторинг конкретного порта
watch -n 1 'ss -tnp state established | grep :443 | wc -l'
```

### Проверить, слушает ли сервис

```bash
# Nginx запущен?
ss -tlnp | grep nginx

# PostgreSQL доступен?
ss -tlnp | grep :5432

# Redis
ss -tlnp | grep :6379

# Проверить из скрипта
if ss -tlnp | grep -q :80; then
    echo "Port 80 is listening"
else
    echo "Port 80 is NOT listening"
fi
```

---

## Мониторинг Unix domain sockets

```bash
# Все Unix сокеты
ss -xl
lsof -U               # Unix domain sockets

# Найти сокет PostgreSQL
ss -xl | grep postgres
lsof | grep ".s.PGSQL"

# Nginx FastCGI сокет
ss -xl | grep nginx
ls -la /run/php/php8-fpm.sock

# Проверить что к сокету можно подключиться
nc -U /run/php/php8-fpm.sock
```

---

## /proc/net - чтение напрямую

Когда утилиты недоступны, данные можно читать напрямую:

```bash
# Все TCP соединения (hex формат)
cat /proc/net/tcp
cat /proc/net/tcp6        # IPv6

# Все UDP
cat /proc/net/udp
cat /proc/net/udp6

# Unix domain sockets
cat /proc/net/unix

# Статистика сокетов
cat /proc/net/sockstat

# Пример /proc/net/tcp:
# sl  local_address rem_address   st tx_queue rx_queue
# 0: 00000000:0050 00000000:0000 0A 00000000:00000000  <- port 80 (0x50) LISTEN (0A)
# Адреса в little-endian hex, порты в hex

# Перевести hex-порт в десятичный
printf "%d\n" 0x0050      # 80
printf "%d\n" 0x01BB      # 443
```

---

## Шпаргалка

```bash
# lsof
lsof -p PID                          # файлы процесса
lsof -u USER                         # файлы пользователя
lsof /path/to/file                   # кто держит файл
lsof +D /path/to/dir                 # кто использует директорию
lsof -i                              # все сетевые соединения
lsof -i :PORT                        # конкретный порт
lsof -i TCP:PORT                     # TCP порт
lsof -i -s TCP:LISTEN                # только listening
lsof -nP -i :PORT                    # без DNS резолвинга
lsof -ti :PORT                       # только PID на порту
lsof | grep deleted                  # удалённые но открытые файлы
lsof -c COMMAND                      # по имени команды

# ss
ss -tlnp                             # TCP listening с процессами
ss -ulnp                             # UDP listening
ss -tnp                              # TCP established с процессами
ss -tunp                             # TCP + UDP с процессами
ss -tanp                             # все TCP с процессами
ss -s                                # сводная статистика
ss -tnp dst HOST                     # соединения с хостом
ss -tnp dport = :PORT                # по destination port
ss -t state established              # только ESTABLISHED
ss -t state time-wait                # только TIME-WAIT
ss -tni                              # TCP internals (RTT, окна)

# netstat (устаревший)
netstat -tlnp                        # TCP listening с процессами
netstat -ulnp                        # UDP listening
netstat -tunp                        # TCP + UDP с процессами
netstat -s                           # статистика по протоколам
netstat -rn                          # таблица маршрутизации
netstat -i                           # интерфейсы

# Частые задачи
lsof -ti :80 | xargs kill            # убить процесс на порту 80
ss -t state established | wc -l     # количество активных соединений
lsof | grep deleted | awk '{print $7, $1, $2, $NF}' | sort -rn | head  # удалённые файлы
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head  # топ IP
```

---

## Ссылки

- [lsof man page](https://man7.org/linux/man-pages/man8/lsof.8.html) - `man lsof`
- [ss man page](https://man7.org/linux/man-pages/man8/ss.8.html) - `man ss`
- [netstat man page](https://man7.org/linux/man-pages/man8/netstat.8.html) - `man netstat`
- [proc/net документация](https://www.kernel.org/doc/html/latest/networking/proc_net_tcp.html) - формат /proc/net/tcp
