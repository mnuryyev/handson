---
title: "Wireshark - фильтры, анализ трафика"
date: "2026-05-07"
---

Wireshark - графический анализатор сетевого трафика (packet analyzer / sniffer). Захватывает пакеты с сетевого интерфейса и позволяет их детально изучать. Использует библиотеку libpcap (Linux/macOS) и Npcap (Windows).

- Сайт: https://www.wireshark.org/
- Лицензия: GPLv2
- Консольная версия: `tshark`
- Форматы захвата: .pcap, .pcapng

---

## Установка

```bash
# Ubuntu / Debian
apt install wireshark tshark

# Разрешить захват без root (добавить пользователя в группу)
usermod -aG wireshark $USER
newgrp wireshark     # или перелогиниться

# macOS
brew install --cask wireshark

# Windows - скачать с wireshark.org (включает Npcap)

# Проверка
wireshark --version
tshark --version
```

---

## Интерфейс Wireshark

```
┌─────────────────────────────────────────────────────────────────┐
│  Строка меню: File Edit View Go Capture Analyze Statistics Help  │
├─────────────────────────────────────────────────────────────────┤
│  Панель инструментов (быстрый доступ)                           │
├─────────────────────────────────────────────────────────────────┤
│  [Display Filter Bar]  tcp.port == 80           ▼  Apply  Clear │
├─────────────────────────────────────────────────────────────────┤
│                     СПИСОК ПАКЕТОВ                              │
│  No. │ Time  │ Source  │ Destination │ Protocol │ Len │ Info    │
│   1  │ 0.000 │ 1.1.1.1 │ 2.2.2.2    │ TCP      │ 74  │ SYN     │
│   2  │ 0.012 │ 2.2.2.2 │ 1.1.1.1    │ TCP      │ 74  │ SYN-ACK │
│   3  │ 0.013 │ 1.1.1.1 │ 2.2.2.2    │ TCP      │ 66  │ ACK     │
├─────────────────────────────────────────────────────────────────┤
│                   ДЕТАЛИ ПАКЕТА                                 │
│  ▼ Frame 1: 74 bytes on wire                                    │
│  ▼ Ethernet II, Src: aa:bb:cc, Dst: dd:ee:ff                   │
│  ▼ Internet Protocol Version 4, Src: 1.1.1.1, Dst: 2.2.2.2    │
│  ▼ Transmission Control Protocol, Src Port: 54321, Dst: 80     │
├─────────────────────────────────────────────────────────────────┤
│                  БАЙТЫ ПАКЕТА (HEX + ASCII)                     │
│  0000  45 00 00 3c 1c 46 40 00 40 06 ...  E..<.F@.@.           │
└─────────────────────────────────────────────────────────────────┘

Три панели:
1. Packet List    - список всех захваченных пакетов
2. Packet Details - дерево полей выбранного пакета
3. Packet Bytes   - сырые байты (hex + ASCII)
```

---

## Захват трафика

### Старт захвата

```
Capture -> Interfaces (Ctrl+I)
- Выбрать нужный интерфейс
- Нажать Start

Capture -> Options (Ctrl+K) - полные настройки:
- Capture Filter    - фильтровать при захвате (BPF синтаксис)
- Promiscuous mode  - захватывать чужой трафик
- Snaplen           - сколько байт пакета сохранять (default: 262144)
- Ring buffer       - писать в несколько файлов по очереди
- Stop conditions   - остановить после N пакетов / N МБ / N секунд
```

### Capture Filters (при захвате)

Capture Filter применяется **во время** захвата. Синтаксис BPF - тот же что у `tcpdump`.

```bash
# Конкретный хост
host 192.168.1.1

# Подсеть
net 192.168.1.0/24

# Только TCP / UDP / ICMP / ARP
tcp
udp
icmp
arp

# Порт
tcp port 80
tcp port 80 or tcp port 443

# Источник / назначение
src host 10.0.0.1
dst host 10.0.0.2

# Исключить трафик
not port 22
udp and not port 53

# Размер пакета
greater 1000
less 100

# MAC адрес
ether host aa:bb:cc:dd:ee:ff

# VLAN
vlan 100

# IPv6
ip6

# Комбинации
(host 192.168.1.1 or host 192.168.1.2) and tcp port 443
not (arp or icmp or stp)
```

---

## Display Filters (фильтры отображения)

Display Filter применяется **после** захвата к уже собранным пакетам. Мощный синтаксис Wireshark.

### Синтаксис

```
Базовая структура:
  protocol.field operator value

Операторы сравнения:
  ==    равно           (eq)
  !=    не равно        (ne)
  >     больше          (gt)
  <     меньше          (lt)
  >=    больше или равно (ge)
  <=    меньше или равно (le)
  ~     регулярное выражение (matches)
  contains  содержит подстроку

Логические операторы:
  &&   и    (and)
  ||   или  (or)
  !    не   (not)
  ()   группировка

Присутствие поля (поле существует):
  ip.options
  http.authorization
```

### Фильтры по протоколу

```
tcp          udp          icmp         icmpv6
arp          dns          http         tls
ssh          ftp          smtp         dhcp
ospf         bgp          stp          quic
ip           ipv6
```

### IP адреса

```
# Любой трафик с/на адрес
ip.addr == 192.168.1.1

# Только источник / только назначение
ip.src == 192.168.1.1
ip.dst == 8.8.8.8

# Подсеть
ip.addr == 192.168.1.0/24
ip.src == 10.0.0.0/8

# Исключить (правильный способ)
!(ip.addr == 192.168.1.1)

# Диапазон
ip.addr >= 192.168.1.1 and ip.addr <= 192.168.1.10

# IPv6
ipv6.addr == 2001:db8::1
ipv6.src == fe80::1
```

### Порты

```
# TCP порт (src или dst)
tcp.port == 80
tcp.port == 443

# Только источник / только назначение
tcp.srcport == 54321
tcp.dstport == 80

# Диапазон
tcp.port >= 1024 and tcp.port <= 65535

# Несколько портов сразу
tcp.port in {80 443 8080 8443}

# UDP
udp.port == 53
udp.port == 67 or udp.port == 68     # DHCP
```

### TCP флаги

```
# SYN (начало соединения)
tcp.flags.syn == 1

# Только первый SYN (без ACK)
tcp.flags.syn == 1 and tcp.flags.ack == 0

# SYN-ACK (ответ сервера)
tcp.flags.syn == 1 and tcp.flags.ack == 1

# RST (сброс соединения)
tcp.flags.reset == 1

# FIN (завершение)
tcp.flags.fin == 1

# По hex значению флагов
tcp.flags == 0x002    # SYN
tcp.flags == 0x012    # SYN-ACK
tcp.flags == 0x010    # ACK
tcp.flags == 0x018    # PSH-ACK
tcp.flags == 0x004    # RST
tcp.flags == 0x001    # FIN

# Все TCP аномалии
tcp.analysis.flags
tcp.analysis.retransmission
tcp.analysis.duplicate_ack
tcp.analysis.out_of_order
tcp.window_size == 0            # нулевое окно (получатель не успевает)
tcp.analysis.ack_rtt > 0.1      # высокий RTT
```

### HTTP

```
# Запросы / ответы
http.request
http.response

# Метод
http.request.method == "GET"
http.request.method == "POST"
http.request.method == "PUT"
http.request.method == "DELETE"

# URI
http.request.uri contains "/api/"
http.request.uri matches ".*\\.php$"

# Host заголовок
http.host == "example.com"
http.host contains "google"

# Код ответа
http.response.code == 200
http.response.code == 404
http.response.code == 500
http.response.code >= 400       # все ошибки

# Content-Type
http.content_type contains "json"
http.content_type == "text/html"

# Прочие заголовки
http.cookie contains "session"
http.authorization               # наличие заголовка авторизации
http.content_length > 10000
```

### DNS

```
# Запросы / ответы
dns.flags.response == 0
dns.flags.response == 1

# Имя домена
dns.qry.name == "google.com"
dns.qry.name contains "google"
dns.qry.name matches ".*\\.ru$"

# Тип записи
dns.qry.type == 1     # A
dns.qry.type == 28    # AAAA
dns.qry.type == 5     # CNAME
dns.qry.type == 15    # MX
dns.qry.type == 16    # TXT
dns.qry.type == 6     # SOA

# Ошибки DNS
dns.flags.rcode != 0       # любая ошибка
dns.flags.rcode == 3       # NXDOMAIN (домен не существует)
dns.flags.rcode == 2       # SERVFAIL

# IP в ответе
dns.a == 8.8.8.8
```

### TLS / HTTPS

```
# Всё TLS
tls

# Фазы рукопожатия
tls.handshake.type == 1     # ClientHello
tls.handshake.type == 2     # ServerHello
tls.handshake.type == 11    # Certificate
tls.handshake.type == 14    # ServerHelloDone

# SNI (имя сайта в ClientHello)
tls.handshake.extensions_server_name == "example.com"
tls.handshake.extensions_server_name contains "google"

# Версия TLS
tls.record.version == 0x0303    # TLS 1.2
tls.record.version == 0x0304    # TLS 1.3

# TLS Alert (ошибки)
tls.record.content_type == 21
```

### ICMP

```
icmp.type == 8               # Echo Request (ping)
icmp.type == 0               # Echo Reply
icmp.type == 3               # Destination Unreachable
icmp.type == 3 and icmp.code == 3   # Port Unreachable
icmp.type == 3 and icmp.code == 4   # Fragmentation Needed
icmp.type == 11              # Time Exceeded (traceroute)

icmpv6.type == 128           # Echo Request
icmpv6.type == 135           # Neighbor Solicitation
icmpv6.type == 136           # Neighbor Advertisement
```

### ARP

```
arp                          # весь ARP
arp.opcode == 1              # запросы
arp.opcode == 2              # ответы
arp.src.proto_ipv4 == 192.168.1.1
arp.dst.proto_ipv4 == 192.168.1.1
arp.src.hw_mac == aa:bb:cc:dd:ee:ff

# Gratuitous ARP (src IP == dst IP, конфликт или HSRP/VRRP)
arp.src.proto_ipv4 == arp.dst.proto_ipv4
```

### Размер и время

```
frame.len > 1000             # большие пакеты
frame.len < 100              # маленькие пакеты
frame.len == 64              # минимальный Ethernet кадр

ip.len > 1400

frame.time_relative > 10    # секунды от начала захвата
frame.time_delta > 1        # задержка между пакетами > 1 сек
tcp.time_delta > 0.1        # задержка в TCP потоке

frame.number == 100
frame.number <= 500
```

### Комплексные фильтры

```
# HTTP ошибки
http.response.code >= 400

# Ретрансмиссии (потеря пакетов)
tcp.analysis.retransmission

# Попытки подключения (SYN scan)
tcp.flags.syn == 1 and tcp.flags.ack == 0

# ARP spoofing (много Gratuitous ARP)
arp.opcode == 2 and arp.src.proto_ipv4 == arp.dst.proto_ipv4

# Конкретный TCP поток
tcp.stream == 0

# Трафик между двумя хостами
ip.addr == 192.168.1.1 and ip.addr == 192.168.1.2

# Исключить фоновый шум
not (arp or icmp or stp or broadcast)

# Незашифрованные пароли FTP
ftp.request.command == "PASS"

# DNS к нестандартным серверам
dns and !(ip.dst == 8.8.8.8 or ip.dst == 192.168.1.1)

# Подозрительные User-Agent
http.user_agent contains "sqlmap"
http.user_agent contains "nikto"
http.user_agent contains "nmap"
```

---

## Follow Stream - анализ потоков

```
Правый клик на пакет -> Follow -> TCP Stream
Правый клик на пакет -> Follow -> UDP Stream
Правый клик на пакет -> Follow -> HTTP Stream
Правый клик на пакет -> Follow -> TLS Stream

Показывает полный диалог двух хостов в читаемом виде:
- Красный  = данные от клиента
- Синий    = данные от сервера

Автоматически создаёт фильтр: tcp.stream == N

Полезно для:
- Чтение HTTP запросов/ответов целиком
- Анализ FTP, SMTP, POP3 в открытом виде
- Изучение пользовательских протоколов
- Извлечение передаваемых файлов
```

---

## Statistics - статистика

### Conversations и Endpoints

```
Statistics -> Conversations
- Список всех пар src-dst
- Сортировка по байтам, пакетам, времени
- Видно кто с кем общается больше всего

Statistics -> Endpoints
- Список всех участников захвата
- IPv4, IPv6, Ethernet вкладки
- Трафик на каждый endpoint
```

### Protocol Hierarchy

```
Statistics -> Protocol Hierarchy
- Дерево протоколов с процентами
- Показывает распределение трафика
- Клик на протокол -> создаёт Display Filter

Пример вывода:
Protocol          % Packets  % Bytes
Ethernet          100%       100%
  IPv4            95%        96%
    TCP           80%        85%
      HTTP        30%        40%
      TLS         45%        42%
    UDP           15%        11%
      DNS         10%        5%
      QUIC        5%         6%
  ARP             5%         4%
```

### IO Graph

```
Statistics -> I/O Graph
- График трафика по времени (пакеты или байты в секунду)
- Несколько серий с разными фильтрами одновременно

Пример: найти моменты с ошибками
Серия 1: (без фильтра)              - весь трафик (серый)
Серия 2: tcp.analysis.retransmission - ретрансмиссии (красный)
Серия 3: tcp.flags.reset == 1        - RST сбросы (оранжевый)
```

### Flow Graph (Sequence Diagram)

```
Statistics -> Flow Graph
- Диаграмма последовательностей (как UML Sequence Diagram)
- Показывает обмен пакетами между хостами
- Удобно для анализа TCP handshake, DNS, SIP, HTTP

Настройки:
- Flow type: TCP Flows / All Flows
- Показывает Time, Seq numbers, комментарии
```

### TCP Stream Graph

```
Правый клик на TCP пакет -> Statistics -> TCP Stream Graph

- Time-Sequence (Stevens)    - seq номера по времени
- Time-Sequence (tcptrace)   - детальный анализ
- Throughput                 - пропускная способность
- Round-Trip Time            - RTT по времени
- Window Scaling             - размер окна TCP
```

---

## Экспорт данных

```
# Извлечь файлы из HTTP/FTP/SMB трафика
File -> Export Objects -> HTTP
File -> Export Objects -> SMB
File -> Export Objects -> FTP-DATA

# Сохранить только отфильтрованные пакеты
File -> Export Specified Packets
  (галочка "Displayed" - только текущий фильтр)

# Экспорт в CSV / JSON
File -> Export Packet Dissections -> As CSV
File -> Export Packet Dissections -> As JSON

# Экспорт raw bytes выбранного пакета
Packet Details -> правый клик -> Export Packet Bytes
```

---

## tshark - консольный Wireshark

```bash
# Список доступных интерфейсов
tshark -D

# Захват в реальном времени
tshark -i eth0

# С capture filter
tshark -i eth0 -f "tcp port 80"

# N пакетов и стоп
tshark -i eth0 -c 100

# Сохранить в файл
tshark -i eth0 -w capture.pcap

# Читать из файла
tshark -r capture.pcap

# Применить display filter
tshark -r capture.pcap -Y "http.request"

# Вывести конкретные поля
tshark -r capture.pcap -T fields \
  -e frame.number \
  -e ip.src \
  -e ip.dst \
  -e tcp.dstport \
  -e http.request.method \
  -e http.request.uri

# Вывод в JSON
tshark -r capture.pcap -T json

# Вывод в CSV
tshark -r capture.pcap -T fields \
  -e ip.src -e ip.dst -e tcp.port \
  -E header=y -E separator=,

# Статистика протоколов
tshark -r capture.pcap -q -z io,phs

# Статистика TCP соединений
tshark -r capture.pcap -q -z conv,tcp

# Follow TCP stream (поток 0)
tshark -r capture.pcap -q -z follow,tcp,ascii,0

# HTTP запросы в реальном времени
tshark -i eth0 -Y http.request \
  -T fields -e ip.src -e http.host -e http.request.uri

# DNS запросы в реальном времени
tshark -i eth0 -Y "dns.flags.response==0" \
  -T fields -e frame.time -e ip.src -e dns.qry.name

# Декодировать нестандартный порт
tshark -r capture.pcap -d tcp.port==8080,http

# Фильтрация и сохранение в новый файл
tshark -r big.pcap -Y "http" -w http_only.pcap
```

---

## Расшифровка TLS / HTTPS

### Способ 1 - SSLKEYLOGFILE (рекомендуется)

```bash
# Chrome и Firefox умеют писать ключи сессии в файл
# Установить переменную ДО запуска браузера:

# Linux / macOS
export SSLKEYLOGFILE=/tmp/ssl_keys.log
google-chrome &

export SSLKEYLOGFILE=/tmp/ssl_keys.log
firefox &

# Windows
set SSLKEYLOGFILE=C:\ssl_keys.log
start chrome

# В Wireshark:
Edit -> Preferences -> Protocols -> TLS
  (Pre)-Master-Secret log filename: /tmp/ssl_keys.log

# Через tshark
tshark -r capture.pcap \
  -o "tls.keylog_file:/tmp/ssl_keys.log" \
  -Y http
```

### Способ 2 - приватный ключ сервера

```
Работает только если НЕТ Perfect Forward Secrecy (RSA key exchange).
TLS 1.3 и ECDHE/DHE всегда используют PFS - ключ не поможет.

Edit -> Preferences -> Protocols -> TLS -> RSA Keys (кнопка +)
  IP address: адрес сервера
  Port: 443
  Protocol: http
  Key File: /path/to/server.key
  Password: (если ключ зашифрован)
```

---

## Анализ реальных сценариев

### Диагностика TCP соединений

```
# Попытки подключения
tcp.flags.syn == 1 and tcp.flags.ack == 0

# Отклонённые (RST в ответ на SYN - порт закрыт)
tcp.flags.reset == 1

# Потеря пакетов
tcp.analysis.retransmission or tcp.analysis.fast_retransmission

# Высокий RTT (больше 100мс)
tcp.analysis.ack_rtt > 0.1

# Нулевое окно (получатель захлёбывается)
tcp.window_size == 0

# Дублированные ACK (признак потери)
tcp.analysis.duplicate_ack

# Все TCP проблемы сразу
tcp.analysis.flags

Нормальный TCP handshake:
  SYN      -> tcp.flags == 0x002
  SYN-ACK  -> tcp.flags == 0x012
  ACK      -> tcp.flags == 0x010
  ... данные ...
  FIN-ACK  -> tcp.flags == 0x011
  FIN-ACK  -> tcp.flags == 0x011
  ACK      -> tcp.flags == 0x010
```

### Диагностика HTTP

```
# Все запросы
http.request

# Ошибки сервера
http.response.code >= 500

# Клиентские ошибки
http.response.code >= 400 and http.response.code < 500

# Медленные ответы (больше 1 секунды)
http.time > 1

# Большие тела запросов (возможная утечка данных)
http.request.method == "POST" and http.content_length > 100000

# Редиректы
http.response.code == 301 or http.response.code == 302

# Кеш miss/hit
http.cache_control contains "no-cache"
```

### Диагностика DNS

```
# Медленные ответы
dns and frame.time_delta > 0.5

# Неудачные запросы
dns.flags.rcode != 0

# DNS к нестандартным серверам (потенциальный DNS leakage)
dns and !(ip.dst == 8.8.8.8 or ip.dst == 192.168.1.1)

# Большие ответы (потенциальный DNS amplification)
dns.flags.response == 1 and ip.len > 512

# Statistics -> DNS
# Показывает: запросы/ответы, время ответа, коды ошибок
```

### Анализ безопасности

```
# Сканирование портов
tcp.flags.syn == 1 and tcp.flags.ack == 0

# Много RST - закрытые порты / отвергнутые соединения
tcp.flags.reset == 1

# ARP spoofing
arp.opcode == 2 and arp.src.proto_ipv4 == arp.dst.proto_ipv4

# DNS tunneling (подозрительно длинные имена)
dns.qry.name.len > 50

# Подозрительные инструменты по User-Agent
http.user_agent contains "sqlmap"
http.user_agent contains "nikto"
http.user_agent contains "nmap"
http.user_agent contains "python-requests"

# SQL injection в URL
http.request.uri contains "' or"
http.request.uri contains "UNION SELECT"
http.request.uri contains "../"

# Path traversal
http.request.uri contains "%2e%2e"
http.request.uri contains "..%2f"

# FTP пароли в открытом виде
ftp.request.command == "PASS"

# Telnet (незашифрованное управление)
telnet

# ICMP flood
icmp.type == 8 and frame.time_delta < 0.001

# Много соединений с одного IP (DDoS / brute force)
ip.src == X.X.X.X and tcp.flags.syn == 1
```

---

## Coloring Rules (раскраска пакетов)

```
View -> Coloring Rules

Встроенные цвета по умолчанию:
- Зелёный      - HTTP
- Голубой      - DNS
- Тёмно-синий  - TCP SYN/FIN
- Чёрный       - TCP проблемы (retransmission, RST)
- Жёлтый       - DHCP, ARP

Создать правило:
View -> Coloring Rules -> +
  Name: "HTTP Errors"
  Filter: http.response.code >= 400
  Background: красный

Временная раскраска потока:
Правый клик на пакет -> Colorize Conversation -> цвет
Сброс всей раскраски: View -> Reset Colorization (Ctrl+Space)
```

---

## Горячие клавиши

```
Ctrl+E          - Старт / Стоп захвата
Ctrl+K          - Настройки захвата
Ctrl+W          - Закрыть файл
Ctrl+S          - Сохранить
Ctrl+Shift+S    - Сохранить как
Ctrl+F          - Найти пакет
Ctrl+G          - Перейти к пакету по номеру
Ctrl+B          - Назад к предыдущему найденному
Ctrl+N          - Вперёд к следующему найденному
Ctrl+M          - Отметить / снять отметку с пакета
Ctrl+D          - Построитель выражений Display Filter
Space           - Следующий пакет
Backspace       - Предыдущий пакет
Tab             - Переключение между панелями
Ctrl+Alt+Shift+T - Follow TCP Stream
```

---

## Работа с большими pcap файлами

```bash
# Разбить по количеству пакетов
editcap -c 10000 big.pcap chunk_%d.pcap

# Разбить по времени (каждые 60 секунд)
editcap -i 60 big.pcap chunk_%d.pcap

# Вырезать временной диапазон
editcap -A "2026-05-06 10:00:00" -B "2026-05-06 10:05:00" \
  big.pcap slice.pcap

# Объединить несколько pcap
mergecap -w combined.pcap file1.pcap file2.pcap file3.pcap

# Фильтрация через tshark -> новый файл
tshark -r big.pcap -Y "http" -w http_only.pcap

# Быстрый просмотр без GUI
tcpdump -r capture.pcap -n | head -50
```

---

## Шпаргалка по фильтрам

```
IP адреса:
  ip.addr == X.X.X.X            - любой трафик с/на адрес
  ip.src == X.X.X.X             - только источник
  ip.dst == X.X.X.X             - только назначение
  ip.addr == X.X.X.X/24         - подсеть
  !(ip.addr == X.X.X.X)         - исключить адрес

Порты:
  tcp.port == N                  - TCP порт (src или dst)
  tcp.dstport == N               - только dest
  tcp.port in {80 443 8080}      - несколько портов
  udp.port == 53                 - UDP порт

TCP флаги:
  tcp.flags.syn == 1             - SYN
  tcp.flags.syn == 1 and tcp.flags.ack == 0   - только SYN
  tcp.flags.reset == 1           - RST
  tcp.flags.fin == 1             - FIN
  tcp.analysis.retransmission    - ретрансмиссии
  tcp.analysis.flags             - все TCP проблемы
  tcp.window_size == 0           - нулевое окно

HTTP:
  http.request                   - запросы
  http.response                  - ответы
  http.request.method == "POST"  - метод
  http.response.code == 200      - код ответа
  http.response.code >= 400      - ошибки
  http.host contains "google"    - Host заголовок
  http.request.uri contains "/"  - URI

DNS:
  dns.flags.response == 0        - запросы
  dns.flags.response == 1        - ответы
  dns.qry.name == "site.com"     - имя
  dns.flags.rcode != 0           - ошибки DNS
  dns.qry.type == 1              - тип A

TLS:
  tls.handshake.type == 1        - ClientHello
  tls.handshake.extensions_server_name contains "x"  - SNI

ICMP:
  icmp.type == 8                 - Echo Request
  icmp.type == 3                 - Unreachable
  icmp.type == 11                - Time Exceeded (traceroute)

Размер и время:
  frame.len > 1000               - большие пакеты
  frame.time_delta > 1           - задержка > 1 сек
  tcp.analysis.ack_rtt > 0.1     - RTT > 100 мс

Логика:
  A and B                        - оба условия
  A or B                         - любое условие
  !A   или  !(A)                 - отрицание
```

---

## Ссылки

- [Wireshark Display Filter Reference](https://www.wireshark.org/docs/dfref/) - все поля всех протоколов
- [Wireshark User Guide](https://www.wireshark.org/docs/wsug_html/) - официальная документация
- [Wireshark Wiki](https://wiki.wireshark.org/) - статьи по протоколам
- [Sample Captures](https://wiki.wireshark.org/SampleCaptures) - примеры pcap для практики
- [BPF Syntax](https://www.tcpdump.org/manpages/pcap-filter.7.html) - синтаксис capture filters
- [CloudShark](https://www.cloudshark.org/) - анализ pcap онлайн
