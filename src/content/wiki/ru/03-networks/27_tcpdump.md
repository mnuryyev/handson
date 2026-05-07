---
title: "tcpdump - захват и фильтрация пакетов"
date: "2026-05-07"
---

tcpdump - консольный анализатор сетевого трафика. Работает напрямую через libpcap без GUI. Незаменим на серверах, в скриптах и в ситуациях когда Wireshark недоступен.

- Установлен по умолчанию в большинстве Linux/macOS систем
- Синтаксис BPF (Berkeley Packet Filter) - тот же что у Wireshark Capture Filters
- Файлы .pcap совместимы с Wireshark, tshark, Zeek

---

## Установка

```bash
# Ubuntu / Debian
apt install tcpdump

# RHEL / CentOS / Fedora
yum install tcpdump
dnf install tcpdump

# macOS (предустановлен, или через Homebrew)
brew install tcpdump

# Проверка версии
tcpdump --version

# Список доступных интерфейсов
tcpdump -D
# Вывод:
# 1.eth0 [Up, Running]
# 2.lo [Up, Running, Loopback]
# 3.any (Pseudo-device that captures on all interfaces)
```

### Права доступа

```bash
# tcpdump требует root или CAP_NET_RAW
sudo tcpdump

# Дать capabilities без sudo
sudo setcap cap_net_raw,cap_net_admin+eip $(which tcpdump)
tcpdump    # теперь без sudo

# Добавить пользователя в группу (Debian/Ubuntu)
sudo usermod -aG wireshark $USER
# tcpdump использует ту же группу что Wireshark
```

---

## Базовый синтаксис

```
tcpdump [опции] [выражение-фильтра]

Основные опции:
  -i <iface>     - интерфейс (-i eth0, -i any - все интерфейсы)
  -n             - не разрешать IP -> hostname
  -nn            - не разрешать IP и порты -> имена
  -v             - verbose (больше деталей)
  -vv            - ещё больше деталей
  -vvv           - максимум деталей
  -c <N>         - захватить N пакетов и выйти
  -w <file>      - записать в файл .pcap
  -r <file>      - читать из файла .pcap
  -A             - вывод payload в ASCII
  -X             - вывод payload в HEX + ASCII
  -XX            - вывод с Ethernet заголовком
  -e             - показывать Ethernet заголовки (MAC адреса)
  -l             - буферизация построчно (для grep в реальном времени)
  -q             - тихий режим (меньше деталей)
  -t             - без временных меток
  -tt            - Unix timestamp
  -ttt           - дельта между пакетами
  -tttt          - дата + время
  -s <snaplen>   - сколько байт захватывать (0 = весь пакет)
  -S             - абсолютные sequence numbers (не относительные)
  -Z <user>      - сменить пользователя после открытия интерфейса
```

---

## Первые команды

```bash
# Захват всего трафика на eth0
sudo tcpdump -i eth0

# Захват без разрешения имён (быстрее и нагляднее)
sudo tcpdump -i eth0 -nn

# Все интерфейсы сразу
sudo tcpdump -i any -nn

# Только 10 пакетов и выйти
sudo tcpdump -i eth0 -nn -c 10

# С verbose выводом
sudo tcpdump -i eth0 -nn -v

# Показать payload в ASCII (HTTP, FTP...)
sudo tcpdump -i eth0 -nn -A

# Показать payload в HEX + ASCII
sudo tcpdump -i eth0 -nn -X

# Пример вывода:
# 12:34:56.789012 IP 192.168.1.10.54321 > 8.8.8.8.53: UDP, length 32
# │              │                                     │
# │              │                                     └── протокол, размер
# │              └──────────────────────────────────────── src:port > dst:port
# └─────────────────────────────────────────────────────── время
```

---

## Сохранение и чтение файлов

```bash
# Записать в pcap файл
sudo tcpdump -i eth0 -nn -w capture.pcap

# Записать с временем в имени файла
sudo tcpdump -i eth0 -nn -w "capture_$(date +%Y%m%d_%H%M%S).pcap"

# Ротация файлов: новый файл каждые 100МБ
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -C 100

# Ротация файлов: новый файл каждые 60 секунд
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -G 60

# Ограничить число файлов ротации (ring buffer)
sudo tcpdump -i eth0 -nn -w capture_%Y%m%d_%H%M%S.pcap -G 60 -W 10
# -W 10 = хранить только 10 последних файлов

# Читать из файла
tcpdump -r capture.pcap

# Читать из файла без разрешения имён
tcpdump -r capture.pcap -nn

# Читать файл и применить фильтр
tcpdump -r capture.pcap -nn 'tcp port 80'

# Читать файл с verbose выводом
tcpdump -r capture.pcap -nn -v

# Читать и показывать payload
tcpdump -r capture.pcap -nn -A -l | grep -i "user-agent"
```

---

## BPF фильтры

### Фильтры по хостам

```bash
# Трафик с/на конкретный хост
tcpdump -i eth0 host 192.168.1.1

# Только от источника
tcpdump -i eth0 src host 192.168.1.1
tcpdump -i eth0 src 192.168.1.1        # короткий вариант

# Только к назначению
tcpdump -i eth0 dst host 8.8.8.8
tcpdump -i eth0 dst 8.8.8.8

# Подсеть
tcpdump -i eth0 net 192.168.1.0/24
tcpdump -i eth0 src net 10.0.0.0/8

# Несколько хостов
tcpdump -i eth0 'host 192.168.1.1 or host 192.168.1.2'

# Исключить хост
tcpdump -i eth0 'not host 192.168.1.1'

# Исключить несколько хостов
tcpdump -i eth0 'not (host 192.168.1.1 or host 192.168.1.2)'
```

### Фильтры по портам

```bash
# Конкретный порт (src или dst)
tcpdump -i eth0 port 80
tcpdump -i eth0 port 443

# Только входящий / исходящий порт
tcpdump -i eth0 dst port 80
tcpdump -i eth0 src port 80

# Несколько портов
tcpdump -i eth0 'port 80 or port 443'
tcpdump -i eth0 'port 80 or 443'          # короткий вариант

# Диапазон портов
tcpdump -i eth0 'portrange 8000-9000'

# Исключить порт
tcpdump -i eth0 'not port 22'

# Исключить несколько портов
tcpdump -i eth0 'not port 22 and not port 53'
```

### Фильтры по протоколам

```bash
# Только TCP / UDP / ICMP
tcpdump -i eth0 tcp
tcpdump -i eth0 udp
tcpdump -i eth0 icmp
tcpdump -i eth0 icmp6

# ARP
tcpdump -i eth0 arp

# IPv6
tcpdump -i eth0 ip6

# Только конкретный протокол поверх IP (по номеру)
tcpdump -i eth0 'ip proto 89'       # OSPF (protocol 89)
tcpdump -i eth0 'ip proto 47'       # GRE (protocol 47)
tcpdump -i eth0 'ip proto 50'       # ESP / IPsec

# Только VLAN
tcpdump -i eth0 vlan
tcpdump -i eth0 vlan 100            # конкретный VLAN ID
```

### Комбинирование фильтров

```bash
# TCP порт 80 к конкретному хосту
tcpdump -i eth0 'tcp port 80 and host 192.168.1.1'

# HTTP и HTTPS трафик
tcpdump -i eth0 'tcp port 80 or tcp port 443'

# Весь трафик кроме SSH и DNS
tcpdump -i eth0 'not port 22 and not port 53'

# Входящий HTTP от подсети
tcpdump -i eth0 'tcp dst port 80 and src net 10.0.0.0/8'

# Трафик между двумя хостами
tcpdump -i eth0 'host 192.168.1.1 and host 192.168.1.2'

# UDP DNS от конкретного хоста
tcpdump -i eth0 'udp port 53 and src host 192.168.1.10'

# Весь трафик кроме loopback и broadcast
tcpdump -i eth0 'not dst host 255.255.255.255 and not src host 127.0.0.1'
```

---

## Продвинутые BPF выражения

BPF позволяет фильтровать по произвольным байтам пакета: `proto[offset:size] operator value`

```bash
# Синтаксис доступа к байтам:
# proto[offset]         - 1 байт по смещению
# proto[offset:2]       - 2 байта (big-endian)
# proto[offset:4]       - 4 байта

# TCP флаги (смещение 13 в TCP заголовке)
# Битовая маска: FIN=0x01, SYN=0x02, RST=0x04, PSH=0x08, ACK=0x10, URG=0x20

# Только SYN пакеты (SYN=1, ACK=0)
tcpdump -i eth0 'tcp[13] == 0x02'
tcpdump -i eth0 'tcp[tcpflags] == tcp-syn'

# SYN-ACK пакеты
tcpdump -i eth0 'tcp[13] == 0x12'
tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-ack) == (tcp-syn|tcp-ack)'

# RST пакеты
tcpdump -i eth0 'tcp[13] & 0x04 != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-rst != 0'

# FIN пакеты
tcpdump -i eth0 'tcp[tcpflags] & tcp-fin != 0'

# Все пакеты с установленным PSH
tcpdump -i eth0 'tcp[tcpflags] & tcp-push != 0'

# ICMP типы по байтам
# ICMP Type = первый байт ICMP заголовка
tcpdump -i eth0 'icmp[0] == 8'    # Echo Request
tcpdump -i eth0 'icmp[0] == 0'    # Echo Reply
tcpdump -i eth0 'icmp[0] == 3'    # Destination Unreachable
tcpdump -i eth0 'icmp[0] == 11'   # Time Exceeded (traceroute)

# ICMP Type 3 Code 4 (Fragmentation Needed - PMTUD)
tcpdump -i eth0 'icmp[0] == 3 and icmp[1] == 4'

# Пакеты с ненулевым IP TTL < 5 (почти "умерли")
tcpdump -i eth0 'ip[8] < 5'
# ip[8] = поле TTL (смещение 8 в IP заголовке)

# Фрагментированные IP пакеты (MF бит или ненулевой fragment offset)
tcpdump -i eth0 '(ip[6:2] & 0x3fff) != 0'

# Пакеты с установленным DF битом
tcpdump -i eth0 'ip[6:2] & 0x4000 != 0'

# Пакеты больше определённого размера
tcpdump -i eth0 'ip[2:2] > 1400'  # ip[2:2] = total length

# UDP пакеты с содержимым (payload > 0)
tcpdump -i eth0 'udp[4:2] > 8'   # udp[4:2] = UDP length (включая заголовок 8 байт)

# HTTP GET запросы (магические байты 'GET ')
tcpdump -i eth0 'tcp port 80 and tcp[((tcp[12:1]&0xf0)>>2):4] = 0x47455420'
# 0x47455420 = 'GET ' в ASCII (сложно, лучше использовать -A и grep)
```

### Именованные TCP флаги (удобный вариант)

```bash
# Именованные флаги (более читаемо)
tcpdump -i eth0 'tcp[tcpflags] & tcp-syn != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-ack != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-rst != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-fin != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-push != 0'
tcpdump -i eth0 'tcp[tcpflags] & tcp-urg != 0'

# Только SYN (не SYN-ACK): SYN установлен, ACK нет
tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'
```

---

## Практические примеры

### HTTP трафик

```bash
# Захват HTTP трафика с показом payload
sudo tcpdump -i eth0 -nn -A 'tcp port 80'

# HTTP заголовки в реальном времени (через grep)
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | \
  grep -E 'GET|POST|Host:|User-Agent:|HTTP/'

# Только HTTP GET и POST запросы
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | \
  grep -E '^(GET|POST|PUT|DELETE|HEAD) '

# Захват HTTP и сохранение в файл одновременно
sudo tcpdump -i eth0 -nn -l 'tcp port 80' | tee http_log.txt

# HTTP на нестандартном порту
sudo tcpdump -i eth0 -nn -A 'tcp port 8080 or tcp port 8443'
```

### DNS трафик

```bash
# Весь DNS трафик
sudo tcpdump -i eth0 -nn 'udp port 53'

# DNS запросы в читаемом виде
sudo tcpdump -i eth0 -nn -v 'udp port 53'

# DNS + TCP (для больших ответов / zone transfer)
sudo tcpdump -i eth0 -nn 'port 53'

# DNS запросы с именами доменов (через -A)
sudo tcpdump -i eth0 -nn -A 'udp port 53' | grep -E '\.'

# Только DNS запросы (не ответы) - по флагам
# DNS Query: QR бит = 0, смещение 2 в UDP payload
sudo tcpdump -i eth0 -nn 'udp port 53 and udp[10] & 0x80 == 0'

# Zone transfer (TCP порт 53)
sudo tcpdump -i eth0 -nn 'tcp port 53'
```

### SSH трафик

```bash
# Попытки подключения по SSH (только SYN)
sudo tcpdump -i eth0 -nn 'tcp dst port 22 and tcp[tcpflags] == tcp-syn'

# Весь SSH трафик
sudo tcpdump -i eth0 -nn 'tcp port 22'

# Исключить SSH из общего захвата (чтобы не засорять вывод)
sudo tcpdump -i eth0 -nn 'not port 22'
```

### ICMP / ping / traceroute

```bash
# Весь ICMP
sudo tcpdump -i eth0 -nn icmp

# Только ping (Echo Request и Reply)
sudo tcpdump -i eth0 -nn 'icmp[0] == 8 or icmp[0] == 0'

# Только Echo Request
sudo tcpdump -i eth0 -nn 'icmp[0] == 8'

# traceroute (ICMP Time Exceeded)
sudo tcpdump -i eth0 -nn 'icmp[0] == 11'

# Destination Unreachable
sudo tcpdump -i eth0 -nn 'icmp[0] == 3'

# ICMPv6
sudo tcpdump -i eth0 -nn icmp6
```

### ARP

```bash
# Весь ARP
sudo tcpdump -i eth0 -nn arp

# Только ARP запросы
sudo tcpdump -i eth0 -nn 'arp[6:2] == 1'    # arp opcode = 1 (request)

# Только ARP ответы
sudo tcpdump -i eth0 -nn 'arp[6:2] == 2'    # arp opcode = 2 (reply)

# ARP от конкретного IP
sudo tcpdump -i eth0 -nn 'arp and src host 192.168.1.1'

# Gratuitous ARP (поиск ARP spoofing)
# Gratuitous = sender IP == target IP
sudo tcpdump -i eth0 -nn -e arp    # -e показывает MAC адреса
```

### DHCP

```bash
# DHCP трафик (UDP 67 сервер, 68 клиент)
sudo tcpdump -i eth0 -nn 'udp port 67 or udp port 68'

# Подробно
sudo tcpdump -i eth0 -nn -v 'udp port 67 or udp port 68'
```

### Захват трафика конкретного приложения

```bash
# Найти PID процесса
PID=$(pgrep nginx)

# Узнать на каком порту слушает
ss -tlnp | grep nginx

# Захватить трафик к этому порту
sudo tcpdump -i eth0 -nn 'tcp port 80 or tcp port 443' -w nginx.pcap

# Альтернатива - через strace (видит системные вызовы сети)
sudo strace -p $PID -e trace=network
```

---

## Захват трафика с фильтрацией через grep

```bash
# Показать только строки с URL
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'GET\|POST\|Host:'

# Найти пароли в FTP
sudo tcpdump -i eth0 -nn -A -l 'tcp port 21' | grep -i 'pass\|user'

# SMTP команды
sudo tcpdump -i eth0 -nn -A -l 'tcp port 25' | \
  grep -E '^(EHLO|HELO|MAIL|RCPT|DATA|QUIT)'

# Найти User-Agent заголовки
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'User-Agent:'

# Найти Cookie заголовки
sudo tcpdump -i eth0 -nn -A -l 'tcp port 80' | grep 'Cookie:'

# Показать только IP:port пары (без payload)
sudo tcpdump -i eth0 -nn -l | \
  awk '{print $3, "->", $5}' | sort | uniq -c | sort -rn | head -20

# Топ источников трафика
sudo tcpdump -i eth0 -nn -l -q | \
  awk '{print $3}' | cut -d. -f1-4 | \
  sort | uniq -c | sort -rn | head -10
```

---

## Диагностика сети

```bash
# Проверить достигают ли пакеты интерфейса
sudo tcpdump -i eth0 -nn -c 5 'host 8.8.8.8'

# Анализ TCP handshake
sudo tcpdump -i eth0 -nn -S 'host 192.168.1.1 and tcp port 80'
# -S = абсолютные sequence numbers

# Найти RST пакеты (отклонённые соединения)
sudo tcpdump -i eth0 -nn 'tcp[tcpflags] & tcp-rst != 0'

# Найти SYN без ответа (потенциальный firewall / потеря пакетов)
sudo tcpdump -i eth0 -nn 'tcp[tcpflags] == tcp-syn'

# Мониторинг задержек (дельта между пакетами)
sudo tcpdump -i eth0 -nn -ttt 'host 8.8.8.8'
# -ttt показывает время от предыдущего пакета

# Захват пакетов с большим TTL (потенциальный spoofing)
sudo tcpdump -i eth0 -nn 'ip[8] > 200'    # TTL > 200

# PMTUD диагностика (Fragmentation Needed)
sudo tcpdump -i eth0 -nn 'icmp[0] == 3 and icmp[1] == 4' -v

# Захват фрагментированных пакетов
sudo tcpdump -i eth0 -nn '(ip[6:2] & 0x3fff) != 0'

# Захват нестандартных протоколов
sudo tcpdump -i eth0 -nn 'ip proto 47'    # GRE туннели
sudo tcpdump -i eth0 -nn 'ip proto 50'    # IPsec ESP
sudo tcpdump -i eth0 -nn 'ip proto 51'    # IPsec AH
```

---

## Захват на удалённом сервере + открытие в Wireshark

```bash
# Вариант 1: SSH + pipe в Wireshark (в реальном времени)
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22' | \
  wireshark -k -i -

# Вариант 2: SSH + сжатие (быстрее на медленных каналах)
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22 | gzip -1' | \
  gunzip | wireshark -k -i -

# Вариант 3: захват на сервере, копирование и анализ
ssh user@remote 'sudo tcpdump -i eth0 -nn -c 10000 -w /tmp/cap.pcap not port 22'
scp user@remote:/tmp/cap.pcap ./
wireshark cap.pcap

# Вариант 4: через named pipe
mkfifo /tmp/remote.fifo
ssh user@remote 'sudo tcpdump -i eth0 -nn -w - not port 22' > /tmp/remote.fifo &
wireshark -k -i /tmp/remote.fifo
```

---

## Мониторинг в реальном времени

```bash
# Счётчик пакетов по протоколу каждую секунду
# (нет встроенного, но можно через watch)
watch -n1 'sudo tcpdump -i eth0 -nn -c 100 -q 2>/dev/null | \
  awk "{print \$NF}" | sort | uniq -c | sort -rn'

# Непрерывный мониторинг трафика с временными метками
sudo tcpdump -i eth0 -nn -tttt -l | tee /var/log/traffic.log

# Мониторинг DNS запросов с временными метками
sudo tcpdump -i eth0 -nn -tttt -l 'udp port 53' | \
  awk '{print $1, $2, $5, $NF}'

# Скрипт: уведомление при обнаружении SYN флуда
#!/bin/bash
THRESHOLD=100
sudo tcpdump -i eth0 -nn -l 'tcp[tcpflags] == tcp-syn' 2>/dev/null | \
while read line; do
  IP=$(echo $line | awk '{print $3}' | cut -d. -f1-4)
  echo "SYN from: $IP at $(date)"
done
```

---

## Полезные однострочники

```bash
# Топ-10 хостов по количеству пакетов (захват 1000 пакетов)
sudo tcpdump -i eth0 -nn -c 1000 -q 2>/dev/null | \
  awk '{print $3}' | cut -d. -f1-4 | \
  sort | uniq -c | sort -rn | head -10

# Все уникальные IP источники
sudo tcpdump -i eth0 -nn -c 500 2>/dev/null | \
  awk '{print $3}' | cut -d. -f1-4 | sort -u

# Все DNS запросы с временными метками
sudo tcpdump -i eth0 -nn -tttt 'udp port 53' 2>/dev/null | \
  grep -oP '\d+\.\d+\.\d+\.\d+\.\d+\s+\S+\s+A\s+\S+'

# Захват и немедленный анализ через tshark
sudo tcpdump -i eth0 -nn -w - 2>/dev/null | \
  tshark -r - -T fields -e ip.src -e ip.dst -e tcp.dstport

# Мониторинг HTTPS по SNI (через tshark)
sudo tcpdump -i eth0 -nn -w - 'tcp port 443' 2>/dev/null | \
  tshark -r - -Y 'tls.handshake.type == 1' \
  -T fields -e ip.src -e tls.handshake.extensions_server_name

# Быстрый подсчёт пакетов в pcap файле
tcpdump -r capture.pcap -nn -q | wc -l

# Вычленить только HTTP хосты из pcap
tcpdump -r capture.pcap -nn -A 'tcp port 80' | \
  grep '^Host:' | sort | uniq -c | sort -rn
```

---

## Работа с pcap файлами

```bash
# Объединить несколько pcap
mergecap -w combined.pcap file1.pcap file2.pcap file3.pcap

# Разбить по времени (каждые 60 секунд)
editcap -i 60 big.pcap chunk.pcap

# Разбить по размеру (10000 пакетов)
editcap -c 10000 big.pcap chunk.pcap

# Вырезать временной диапазон
editcap -A "2026-05-06 10:00:00" -B "2026-05-06 10:05:00" \
  big.pcap slice.pcap

# Удалить дубликаты пакетов
editcap -d big.pcap deduped.pcap

# Конвертировать pcap в pcapng
editcap -F pcapng capture.pcap capture.pcapng

# Применить BPF фильтр к файлу и сохранить
tcpdump -r big.pcap -nn -w filtered.pcap 'tcp port 80'

# Показать статистику pcap файла
capinfos capture.pcap
# Выводит: размер, количество пакетов, длительность, bitrate
```

---

## Сравнение tcpdump и Wireshark

```
Критерий           tcpdump                    Wireshark
--------------     ---------------------      ------------------------
Интерфейс          Командная строка           Графический
Запуск на сервере  Да (везде)                 Нет (нужен X11/VNC)
Скорость           Высокая                    Ниже (GUI overhead)
Скриптинг          Легко (pipe, grep, awk)    tshark для скриптов
Анализ протоколов  Базовый                    Глубокий (диссекторы)
Фильтры захвата    BPF                        BPF
Фильтры анализа    BPF (ограниченно)          Display Filters (мощные)
Поиск по payload   grep + -A                  Contains / matches
Follow Stream      Нет                        Есть
Декодирование TLS  Нет                        Да (SSLKEYLOGFILE)
Графики            Нет                        IO Graph, Stream Graph
Форматы вывода     Текст / pcap               pcap / pcapng / JSON / CSV
```

---

## Шпаргалка

```
Базовые опции:
  -i eth0      - интерфейс
  -i any       - все интерфейсы
  -nn          - без разрешения имён (быстро!)
  -v / -vv     - больше деталей
  -c N         - N пакетов и стоп
  -w file      - писать в pcap
  -r file      - читать из pcap
  -A           - payload в ASCII
  -X           - payload hex+ASCII
  -e           - показать MAC адреса
  -S           - абсолютные seq numbers
  -ttt         - дельта времени между пакетами
  -tttt        - дата и время

Фильтры по хостам:
  host X.X.X.X          - любой трафик с/на
  src X.X.X.X           - только источник
  dst X.X.X.X           - только назначение
  net X.X.X.X/24        - подсеть
  not host X.X.X.X      - исключить хост

Фильтры по портам:
  port 80               - TCP или UDP порт
  tcp port 443          - конкретный протокол + порт
  dst port 80           - только destination
  portrange 8000-9000   - диапазон
  not port 22           - исключить порт

Протоколы:
  tcp / udp / icmp / arp / ip6 / vlan

TCP флаги:
  tcp[13] == 0x02       - SYN
  tcp[13] == 0x12       - SYN-ACK
  tcp[13] & 0x04 != 0   - RST
  tcp[tcpflags] & tcp-syn != 0   - (именованный)

ICMP типы:
  icmp[0] == 8          - Echo Request
  icmp[0] == 0          - Echo Reply
  icmp[0] == 3          - Unreachable
  icmp[0] == 11         - Time Exceeded

Логика:
  A and B               - оба условия
  A or B                - любое условие
  not A                 - отрицание
  (A or B) and C        - скобки для группировки

Удалённый захват в Wireshark:
  ssh user@host 'sudo tcpdump -i eth0 -w - not port 22' | wireshark -k -i -
```

---

## Ссылки

- [tcpdump man page](https://www.tcpdump.org/manpages/tcpdump.1.html) - официальная документация
- [BPF Filter Syntax](https://www.tcpdump.org/manpages/pcap-filter.7.html) - синтаксис фильтров
- [tcpdump Tutorial (Danielmiessler)](https://danielmiessler.com/p/tcpdump/) - отличный туториал
- [BPF / Wireshark Capture Filter](https://wiki.wireshark.org/CaptureFilters) - дополнительные примеры
- [capinfos man page](https://www.wireshark.org/docs/man-pages/capinfos.html) - статистика pcap файлов
- [editcap man page](https://www.wireshark.org/docs/man-pages/editcap.html) - работа с pcap файлами
