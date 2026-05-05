---
title: "ICMP - типы сообщений, traceroute, ping"
date: "2026-05-05"
---

ICMP (Internet Control Message Protocol) - вспомогательный протокол сетевого уровня (L3). Не передаёт пользовательские данные, а сообщает об ошибках доставки и используется для диагностики сети.

- RFC 792 (ICMPv4)
- RFC 4443 (ICMPv6)
- Инкапсулируется прямо в IP пакет (протокол номер 1)
- Не имеет портов - работает на уровне IP

---

## Структура ICMP пакета

```
IP заголовок (20 байт)
└── ICMP сообщение
    ├── Type     (1 байт) - тип сообщения
    ├── Code     (1 байт) - подтип / уточнение
    ├── Checksum (2 байта) - контрольная сумма ICMP
    └── Data     (переменная длина) - зависит от типа

Для сообщений об ошибках Data содержит:
├── IP заголовок исходного пакета (20 байт)
└── Первые 8 байт данных исходного пакета
    (это как раз заголовок TCP/UDP - порты src/dst, seq)
```

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
├───────────────────┬───────────────────┬────────────────────────┤
│      Type         │      Code         │       Checksum         │
├───────────────────────────────────────┴────────────────────────┤
│                        Rest of Header                          │
│                  (зависит от Type/Code)                        │
├────────────────────────────────────────────────────────────────┤
│                     Data (payload)                             │
│              (для ошибок: IP hdr + 8 байт данных)             │
└────────────────────────────────────────────────────────────────┘
```

---

## Таблица типов ICMP (ICMPv4)

| Type | Code | Название | Описание |
| --- | --- | --- | --- |
| 0 | 0 | Echo Reply | Ответ на ping |
| 3 | 0 | Net Unreachable | Сеть недостижима |
| 3 | 1 | Host Unreachable | Хост недостижим |
| 3 | 2 | Protocol Unreachable | Протокол недостижим |
| 3 | 3 | Port Unreachable | Порт недоступен |
| 3 | 4 | Fragmentation Needed | Нужна фрагментация, но DF установлен |
| 3 | 5 | Source Route Failed | Источниковая маршрутизация не удалась |
| 3 | 9 | Net Admin Prohibited | Сеть заблокирована администратором |
| 3 | 10 | Host Admin Prohibited | Хост заблокирован администратором |
| 3 | 13 | Communication Prohibited | Фильтрация коммуникации |
| 4 | 0 | Source Quench | Замедли отправку (устарел, RFC 6633) |
| 5 | 0 | Redirect Datagram for Net | Редирект для сети |
| 5 | 1 | Redirect Datagram for Host | Редирект для хоста |
| 8 | 0 | Echo Request | Запрос ping |
| 9 | 0 | Router Advertisement | Объявление роутера |
| 10 | 0 | Router Solicitation | Запрос роутера |
| 11 | 0 | TTL Exceeded in Transit | TTL стал 0 при транзите (traceroute!) |
| 11 | 1 | Fragment Reassembly Time Exceeded | Таймаут сборки фрагментов |
| 12 | 0 | Pointer Indicates Error | Ошибка в IP заголовке |
| 13 | 0 | Timestamp Request | Запрос временной метки |
| 14 | 0 | Timestamp Reply | Ответ с временной меткой |
| 30 | 0 | Traceroute | Информация трассировки (устарел) |

---

## Тип 8 / 0 - Echo Request / Echo Reply (ping)

### Структура Echo пакета

```
ICMP Echo Request (Type=8, Code=0):
├── Type:       8
├── Code:       0
├── Checksum:   контрольная сумма
├── Identifier: ID процесса (чтобы различать параллельные ping)
├── Sequence:   порядковый номер (увеличивается с каждым пакетом)
└── Data:       произвольные данные (по умолчанию часто временная метка)

ICMP Echo Reply (Type=0, Code=0):
- Та же структура, те же Identifier и Sequence
- Отправитель и получатель меняются местами
```

### Как работает ping

```
Отправитель                          Получатель
    │                                    │
    │── ICMP Echo Request (seq=1) ──────►│
    │◄─ ICMP Echo Reply   (seq=1) ───────│  RTT измеряется здесь
    │                                    │
    │── ICMP Echo Request (seq=2) ──────►│
    │◄─ ICMP Echo Reply   (seq=2) ───────│
    │                                    │
    │── ICMP Echo Request (seq=3) ──────►│  нет ответа = потеря пакета
    │                                    │
    │── ICMP Echo Request (seq=4) ──────►│
    │◄─ ICMP Echo Reply   (seq=4) ───────│

RTT (Round-Trip Time) = время от отправки Request до получения Reply
```

### Команда ping

```bash
# Базовый ping
ping 8.8.8.8

# Ограничить количество пакетов
ping -c 4 8.8.8.8

# Изменить размер пакета (payload, байт)
ping -s 1400 8.8.8.8           # большой пакет (тест MTU)
ping -s 65507 8.8.8.8          # максимальный IPv4 ICMP пакет

# Изменить TTL
ping -t 64 8.8.8.8             # macOS
ping --ttl 64 8.8.8.8          # Linux

# Интервал между пакетами (секунды)
ping -i 0.2 8.8.8.8            # быстрый (0.2 сек)
ping -i 5 8.8.8.8              # медленный (5 сек)

# Flood ping (нужен root, осторожно!)
ping -f 8.8.8.8                # максимально быстро

# Установить DF бит (не фрагментировать)
ping -M do -s 1472 8.8.8.8     # Linux, тест PMTUD

# IPv6
ping6 ::1
ping -6 google.com

# Без разрешения имён (только IP)
ping -n 8.8.8.8

# Вывод ping:
# PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
# 64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms
# 64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=11.9 ms
#
# --- 8.8.8.8 ping statistics ---
# 4 packets transmitted, 4 received, 0% packet loss, time 3004ms
# rtt min/avg/max/mdev = 11.9/12.1/12.3/0.15 ms
```

### Интерпретация вывода ping

```
64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms
│                       │         │        │
│                       │         │        └── RTT (round-trip time)
│                       │         └─────────── TTL оставшийся у ответа
│                       └───────────────────── порядковый номер
└───────────────────────────────────────────── размер ответа

TTL в ответе - можно приблизительно оценить количество хопов:
Начальный TTL обычно 64, 128 или 255
Если ответ ttl=118 -> начальный был 128, прошёл 10 хопов
Если ответ ttl=54  -> начальный был 64, прошёл 10 хопов

Потеря пакетов (packet loss):
0%      - отлично
< 1%    - норма в беспроводных сетях
1-5%    - проблема
> 5%    - серьёзная проблема

Джиттер (mdev - mean deviation):
< 1ms   - отлично (дата-центр)
1-5ms   - хорошо
> 10ms  - плохо для VoIP/игр
```

---

## Тип 3 - Destination Unreachable

Генерируется роутером или хостом когда пакет не может быть доставлен.

```
Получатель сообщения об ошибке - ОТПРАВИТЕЛЬ исходного пакета.
В Data содержится: IP заголовок + первые 8 байт исходного пакета.
```

### Разбор кодов Type 3

```
Code 0 - Net Unreachable
  Роутер не знает маршрута к сети назначения.
  "Нет маршрута в таблице маршрутизации"

Code 1 - Host Unreachable
  Роутер знает сеть, но не может достучаться до хоста.
  "ARP не отвечает, хост выключен"

Code 2 - Protocol Unreachable
  Хост получил пакет, но не поддерживает указанный протокол.
  IP заголовок: Protocol field = 253, но такого нет

Code 3 - Port Unreachable
  Хост получил UDP пакет, но на порту ничего не слушает.
  Важно: для TCP это RST, не ICMP!
  Используется в DNS/UDP: если порт закрыт -> ICMP Port Unreachable

Code 4 - Fragmentation Needed and DF Set
  Пакет нужно фрагментировать, но установлен бит DF (Don't Fragment).
  Содержит MTU следующего канала (используется в PMTUD).

  IP Header: Flags DF=1
  ┌──────┬──────┬─────────┐
  │ Res  │  DF  │   MF    │
  │  0   │  1   │    0    │
  └──────┴──────┴─────────┘

Code 9/10 - Administratively Prohibited
  Пакет заблокирован брандмауэром или ACL.
  Фаерволл может отправлять это вместо молчания.

Code 13 - Communication Administratively Prohibited
  Аналогично 9/10, часто от stateful firewall.
```

### Пример: Port Unreachable при сканировании UDP

```bash
# nmap использует ICMP Port Unreachable для определения закрытых UDP портов
nmap -sU -p 53,161,500 192.168.1.1

# Захват ICMP ошибок
tcpdump -i eth0 'icmp and icmp[0] == 3'

# Ответы:
# ICMP type=3 code=3 -> Port Unreachable (UDP порт закрыт)
# ICMP type=3 code=9 -> Administratively Prohibited (firewall)
# Нет ответа         -> порт фильтруется или открыт
```

---

## Тип 11 - Time Exceeded (основа traceroute)

```
Code 0 - TTL Exceeded in Transit
  Роутер получил пакет с TTL=1, уменьшил до 0, отбросил.
  Отправляет ICMP Time Exceeded обратно источнику.
  Содержит свой IP адрес -> источник узнаёт адрес роутера.

Code 1 - Fragment Reassembly Time Exceeded
  Хост не смог собрать фрагментированный пакет за отведённое время.
  Фрагменты приходят не все или с задержкой.
```

---

## Тип 5 - Redirect

```
Роутер отправляет Redirect когда знает лучший маршрут для хоста.

Сценарий:
- Хост A (192.168.1.10) отправляет пакет роутеру R1
- R1 видит: лучший путь через R2, который в той же подсети, что и A
- R1 пересылает пакет R2 И отправляет Redirect хосту A
- A обновляет свой routing cache: "для X.X.X.X идти через R2"

Коды:
Code 0 - Redirect for Network
Code 1 - Redirect for Host
Code 2 - Redirect for Type of Service and Network
Code 3 - Redirect for Type of Service and Host

Безопасность: ICMP Redirect может использоваться для атак!
Многие ОС по умолчанию игнорируют ICMP Redirect:
  sysctl net.ipv4.conf.all.accept_redirects   # 0 = игнорировать
```

---

## Тип 4 - Source Quench (устарел)

```
Роутер просил источник замедлить отправку.
Устарел и убран в RFC 6633 (2012).
Современные механизмы управления перегрузкой: ECN, TCP congestion control.
```

---

## Path MTU Discovery (PMTUD)

PMTUD использует ICMP Type 3 Code 4 для определения минимального MTU на пути.

```
Принцип PMTUD:

Отправитель                    Роутер R2              Получатель
(MTU=1500)                   (MTU=576)
    │                              │                      │
    │── IP пакет 1500, DF=1 ──────►│                      │
    │                              │ MTU канала = 576      │
    │                              │ Нельзя фрагментировать│
    │◄── ICMP Type 3 Code 4 ───────│                      │
    │    "Fragmentation needed"    │                      │
    │    "Next-hop MTU = 576"      │                      │
    │                              │                      │
    │── IP пакет 576, DF=1 ───────►│─────────────────────►│
    │                              │                      │

Проблема "PMTUD Black Hole":
Если роутер блокирует ICMP Type 3 Code 4 -> отправитель не узнает MTU.
Пакеты молча теряются. Соединение "зависает" или работает медленно.

Диагностика PMTUD:
ping -M do -s 1472 8.8.8.8        # Linux, DF=1, размер 1472+28=1500
ping -M do -s 1400 8.8.8.8        # уменьшить если нет ответа

# Найти MTU пути
for size in 1472 1400 1300 1200; do
  result=$(ping -M do -s $size -c 1 8.8.8.8 2>&1)
  if echo "$result" | grep -q "1 received"; then
    echo "MTU OK: $((size + 28))"
    break
  else
    echo "MTU $((size + 28)) - фрагментация нужна"
  fi
done
```

---

## traceroute - как работает

### Принцип traceroute

```
traceroute использует ICMP TTL Exceeded для обнаружения каждого хопа.

Отправитель посылает пакеты с TTL=1, TTL=2, TTL=3...

TTL=1:
Sender ──── TTL=1 ────► R1 (TTL становится 0)
            ◄─── ICMP Time Exceeded (от R1) ───
            Узнали адрес R1!

TTL=2:
Sender ──── TTL=2 ────► R1 ──── TTL=1 ────► R2 (TTL становится 0)
            ◄─────────── ICMP Time Exceeded (от R2) ───────────
            Узнали адрес R2!

TTL=3:
Sender ──── TTL=3 ────► R1 ──► R2 ──── TTL=1 ────► R3 (TTL=0)
            ◄──────────────── ICMP Time Exceeded (от R3) ─────
            Узнали адрес R3!

...продолжаем пока не достигнем цели...

TTL=N:
Пакет достигает цели.
Цель отвечает Echo Reply (или Port Unreachable для UDP traceroute).
Трассировка завершена.
```

### Реализации traceroute

```
Разные ОС и утилиты используют разные протоколы:

Linux traceroute (по умолчанию):
  UDP пакеты на порт 33434+ с возрастающим TTL
  Цель отвечает ICMP Port Unreachable (тип 3, код 3)

Windows tracert:
  ICMP Echo Request с возрастающим TTL
  Цель отвечает ICMP Echo Reply

macOS traceroute:
  UDP (как Linux) по умолчанию

traceroute -I (Linux):
  ICMP Echo Request (как Windows tracert)

traceroute -T -p 80 (Linux):
  TCP SYN пакеты - обходит ICMP-фильтры!
  Цель отвечает TCP SYN-ACK или RST

Сравнение:
┌────────────────┬────────────────┬───────────────────────────┐
│ Метод          │ Протокол       │ Когда использовать        │
├────────────────┼────────────────┼───────────────────────────┤
│ traceroute     │ UDP            │ Linux по умолчанию        │
│ tracert        │ ICMP           │ Windows                   │
│ traceroute -I  │ ICMP           │ Linux, как tracert        │
│ traceroute -T  │ TCP            │ Обход ICMP-блокировок     │
│ mtr            │ ICMP/UDP       │ Интерактивный, лучший     │
└────────────────┴────────────────┴───────────────────────────┘
```

### Команды traceroute

```bash
# Базовый traceroute (UDP)
traceroute 8.8.8.8

# ICMP режим (как tracert)
traceroute -I 8.8.8.8

# TCP режим (обходит ICMP-фильтры)
traceroute -T -p 443 8.8.8.8

# Указать максимальное количество хопов
traceroute -m 30 8.8.8.8

# Без разрешения DNS (быстрее)
traceroute -n 8.8.8.8

# Количество запросов на хоп (default 3)
traceroute -q 5 8.8.8.8

# Размер пакета
traceroute -s 1400 8.8.8.8 -N 1

# IPv6
traceroute6 2001:4860:4860::8888
traceroute -6 google.com

# Windows
tracert 8.8.8.8
tracert -d 8.8.8.8                    # без разрешения DNS
tracert -h 30 8.8.8.8                 # максимум хопов
```

### Чтение вывода traceroute

```bash
traceroute 8.8.8.8
# traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
#  1  192.168.1.1 (192.168.1.1)      1.234 ms  1.198 ms  1.176 ms
#  2  10.0.0.1 (10.0.0.1)            5.432 ms  5.411 ms  5.390 ms
#  3  * * *
#  4  72.14.215.165 (72.14.215.165)  12.3 ms  12.1 ms  12.4 ms
#  5  8.8.8.8 (8.8.8.8)             13.2 ms  13.0 ms  13.1 ms

# Столбцы:
# Хоп | IP-адрес (hostname) | RTT запрос 1 | RTT запрос 2 | RTT запрос 3

# * * *  означает:
# - Роутер не отвечает на ICMP (firewall)
# - Роутер отвечает, но блокирует ICMP Time Exceeded
# - Роутер де-приоритизирует ICMP (rate limiting)
# - Пакет был потерян

# Асимметричный маршрут:
# Хопы могут отличаться для разных запросов (3 запроса = разные пути)

# Резкий рост RTT на хопе:
# Может означать медленный канал или перегрузку
# НО: промежуточный хоп может де-приоритизировать ICMP
#     -> высокий RTT на хопе, но нормальный RTT до цели = не проблема
```

### mtr - лучший инструмент для трассировки

```bash
# Установка
apt install mtr

# Интерактивный режим
mtr 8.8.8.8

# Режим отчёта (не интерактивный)
mtr -r -c 100 8.8.8.8              # 100 пакетов, вывести отчёт

# Без DNS разрешения
mtr -n 8.8.8.8

# TCP режим
mtr -T -P 443 8.8.8.8

# JSON вывод
mtr -r -j 8.8.8.8

# Вывод mtr:
# Host                    Loss%   Snt   Last   Avg  Best  Wrst StDev
# 1. 192.168.1.1           0.0%   100    1.2   1.3   1.1   2.1   0.2
# 2. 10.0.0.1              0.0%   100    5.4   5.3   5.1   6.2   0.3
# 3. ???                  100.0%  100    0.0   0.0   0.0   0.0   0.0
# 4. 72.14.215.165         0.0%   100   12.3  12.1  11.9  13.2   0.4
# 5. 8.8.8.8               0.0%   100   13.1  13.0  12.8  13.5   0.3

# Loss% - потеря пакетов
# Snt   - отправлено пакетов
# Last  - RTT последнего пакета
# Avg   - средний RTT
# Best  - минимальный RTT
# Wrst  - максимальный RTT
# StDev - стандартное отклонение (джиттер)
```

---

## ICMPv6 - ICMP для IPv6

ICMPv6 значительно расширен по сравнению с ICMPv4. Выполняет функции ARP и DHCP из IPv4.

### Типы ICMPv6

| Type | Название | Описание |
| --- | --- | --- |
| 1 | Destination Unreachable | Аналог ICMPv4 Type 3 |
| 2 | Packet Too Big | Аналог ICMPv4 Type 3 Code 4 (PMTUD) |
| 3 | Time Exceeded | Аналог ICMPv4 Type 11 (traceroute) |
| 4 | Parameter Problem | Ошибка в заголовке |
| 128 | Echo Request | Аналог ICMPv4 Type 8 (ping6) |
| 129 | Echo Reply | Аналог ICMPv4 Type 0 |
| 133 | Router Solicitation | NDP: хост ищет роутеры |
| 134 | Router Advertisement | NDP: роутер объявляет себя |
| 135 | Neighbor Solicitation | NDP: аналог ARP Request |
| 136 | Neighbor Advertisement | NDP: аналог ARP Reply |
| 137 | Redirect | Аналог ICMPv4 Type 5 |
| 143 | MLD Report v2 | Multicast Listener Discovery |

### NDP - Neighbor Discovery Protocol

```
NDP заменяет ARP в IPv6, используя ICMPv6:

Вместо ARP Request/Reply:
  Neighbor Solicitation (Type 135)  = ARP Request
  Neighbor Advertisement (Type 136) = ARP Reply

Мультикаст вместо широковещания:
  ARP: FF:FF:FF:FF:FF:FF (broadcast)
  NDP: solicited-node multicast FF02::1:FF<last 3 bytes>

Пример:
  Хост ищет MAC для IPv6 адреса 2001:db8::1
  Solicited-node multicast: FF02::1:FF00:0001
  Multicast MAC: 33:33:FF:00:00:01

# Таблица соседей IPv6 (аналог ARP таблицы)
ip -6 neigh show

# Захват NDP трафика
tcpdump -i eth0 icmp6

# ping6
ping6 fe80::1%eth0                   # link-local требует интерфейс
ping6 2001:4860:4860::8888
```

---

## ICMP и безопасность

### ICMP в пентестинге

```bash
# Обнаружение живых хостов через ping sweep
# nmap
nmap -sn 192.168.1.0/24              # ping scan (ICMP + TCP ACK)
nmap -PE 192.168.1.0/24              # только ICMP Echo
nmap -PP 192.168.1.0/24              # ICMP Timestamp
nmap -PM 192.168.1.0/24              # ICMP Address Mask

# fping - параллельный ping
fping -a -g 192.168.1.0/24 2>/dev/null

# Определение ОС по TTL ответа:
# TTL 64   -> Linux/macOS/FreeBSD
# TTL 128  -> Windows
# TTL 255  -> Cisco IOS, Solaris
# (значения приблизительные, зависит от количества хопов)
```

### ICMP атаки

```
1. ICMP Flood (Ping Flood)
   Отправка огромного количества Echo Request.
   DDoS атака, перегружает канал или CPU цели.
   Защита: rate limiting на ICMP, null routing источника.

2. Smurf Attack (устарела)
   Отправка Echo Request на broadcast адрес с поддельным src IP (жертва).
   Все хосты в сети отвечают жертве.
   Защита: отключить ответ на broadcast ping (sysctl).

3. Ping of Death (историческая)
   Отправка oversized ICMP пакета (> 65535 байт после сборки).
   Вызывал переполнение буфера на старых ОС.
   Давно пропатчено.

4. ICMP Redirect атака
   Злоумышленник отправляет поддельный ICMP Redirect.
   Перенаправляет трафик жертвы через атакующего (MITM).
   Защита: отключить accept_redirects.

5. ICMP Tunneling
   Инкапсуляция данных в ICMP Echo payload.
   Обход файрволлов, которые разрешают ping но блокируют TCP/UDP.
   Инструменты: icmptunnel, ptunnel, hans.

6. Covert channel через ICMP
   Передача данных в payload ICMP пакетов.
   Используется вредоносным ПО для C2 коммуникаций.
```

### Защита и фильтрация ICMP

```bash
# Sysctl настройки безопасности
# Отключить ответ на broadcast ping (anti-Smurf)
sysctl -w net.ipv4.icmp_echo_ignore_broadcasts=1

# Игнорировать ICMP Redirect
sysctl -w net.ipv4.conf.all.accept_redirects=0
sysctl -w net.ipv4.conf.all.send_redirects=0

# Rate limiting ICMP (уже есть в ядре Linux)
sysctl -w net.ipv4.icmp_ratelimit=1000          # 1000 мс между ошибками
sysctl -w net.ipv4.icmp_ratemask=6168           # какие типы rate-limit

# iptables фильтрация ICMP
# Разрешить только нужные типы
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p icmp --icmp-type destination-unreachable -j ACCEPT
iptables -A INPUT -p icmp --icmp-type time-exceeded -j ACCEPT
iptables -A INPUT -p icmp -j DROP               # остальное заблокировать

# Rate limit ping (max 10 в секунду)
iptables -A INPUT -p icmp --icmp-type echo-request \
  -m limit --limit 10/second --limit-burst 20 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j DROP

# Важно: НЕ блокируй полностью!
# ICMP Type 3 Code 4 нужен для PMTUD
# ICMP Time Exceeded нужен для traceroute
# Блокировка ICMP ломает PMTUD -> проблемы с MTU
```

---

## Захват и анализ ICMP

```bash
# tcpdump
tcpdump -i eth0 icmp                            # весь ICMP трафик
tcpdump -i eth0 icmp and host 8.8.8.8          # от/к определённому хосту
tcpdump -i eth0 'icmp[0] == 8'                 # только Echo Request
tcpdump -i eth0 'icmp[0] == 0'                 # только Echo Reply
tcpdump -i eth0 'icmp[0] == 3'                 # только Unreachable
tcpdump -i eth0 'icmp[0] == 11'                # только Time Exceeded
tcpdump -i eth0 'icmp[0] == 3 and icmp[1] == 4' # Fragmentation Needed

# Показать содержимое пакетов
tcpdump -i eth0 icmp -X -v

# Wireshark фильтры
# icmp                     - весь ICMP
# icmp.type == 8           - Echo Request
# icmp.type == 3           - Destination Unreachable
# icmp.type == 11          - Time Exceeded
# icmp.code == 3           - Port Unreachable
# icmpv6                   - ICMPv6 трафик

# hping3 - продвинутый ping/ICMP генератор
hping3 -1 8.8.8.8                              # ICMP ping
hping3 -1 --icmptype 13 8.8.8.8               # ICMP Timestamp Request
hping3 -1 -d 1000 --flood 8.8.8.8             # ICMP flood тест
hping3 -S -p 80 8.8.8.8                       # TCP SYN (не ICMP)
```

---

## Диагностика сети с помощью ICMP

```bash
# Полная диагностика связности
# 1. Проверить локальный интерфейс
ping -c 1 127.0.0.1                            # loopback
ping -c 1 192.168.1.10                         # свой IP

# 2. Проверить шлюз
ping -c 3 192.168.1.1                          # default gateway

# 3. Проверить DNS
ping -c 3 8.8.8.8                              # по IP (без DNS)
ping -c 3 google.com                           # с DNS разрешением

# 4. Трассировка пути
traceroute -n 8.8.8.8                         # без DNS (быстрее)
mtr -r -n -c 50 8.8.8.8                       # статистика 50 пакетов

# 5. Диагностика MTU
ping -M do -s 1472 8.8.8.8                    # стандартный Ethernet MTU
ping -M do -s 1452 8.8.8.8                    # PPPoE (MTU 1492)
ping -M do -s 1400 8.8.8.8                    # VPN (MTU ~1450)

# 6. Проверка потери пакетов
ping -c 100 -i 0.1 8.8.8.8 | tail -2          # 100 быстрых ping

# Скрипт мониторинга доступности
#!/bin/bash
TARGET="8.8.8.8"
while true; do
  if ping -c 1 -W 1 $TARGET > /dev/null 2>&1; then
    echo "$(date): $TARGET - OK"
  else
    echo "$(date): $TARGET - НЕДОСТУПЕН!"
  fi
  sleep 5
done
```

---

## Шпаргалка

```
Ключевые типы ICMPv4:
Type 0  Code 0   - Echo Reply (ответ ping)
Type 3  Code 0   - Network Unreachable
Type 3  Code 1   - Host Unreachable
Type 3  Code 3   - Port Unreachable (UDP)
Type 3  Code 4   - Fragmentation Needed (PMTUD)
Type 3  Code 13  - Communication Prohibited (firewall)
Type 5  Code 1   - Redirect for Host
Type 8  Code 0   - Echo Request (ping)
Type 11 Code 0   - TTL Exceeded (traceroute)
Type 11 Code 1   - Fragment Reassembly Timeout

traceroute принцип:
- Отправляет пакеты с TTL=1, 2, 3...
- Каждый роутер при TTL=0 отвечает ICMP Time Exceeded
- Источник узнаёт IP каждого хопа
- Linux: UDP by default | Windows: ICMP | traceroute -T: TCP

ping команды:
  ping -c 4 IP          - 4 пакета
  ping -s 1400 IP       - размер пакета
  ping -M do -s 1472 IP - тест MTU (DF=1)
  ping -i 0.2 IP        - интервал 200мс
  ping -f IP            - flood (root)

ICMPv6 ключевые типы:
Type 2   - Packet Too Big (PMTUD)
Type 3   - Time Exceeded (traceroute)
Type 128 - Echo Request (ping6)
Type 129 - Echo Reply
Type 135 - Neighbor Solicitation (= ARP Request)
Type 136 - Neighbor Advertisement (= ARP Reply)
Type 133 - Router Solicitation
Type 134 - Router Advertisement

Безопасность (sysctl):
net.ipv4.icmp_echo_ignore_broadcasts=1    - anti-Smurf
net.ipv4.conf.all.accept_redirects=0      - отключить ICMP Redirect
net.ipv4.icmp_ratelimit=1000              - rate limiting ошибок
```

---

## Ссылки

- [RFC 792](https://www.rfc-editor.org/rfc/rfc792) - ICMPv4
- [RFC 4443](https://www.rfc-editor.org/rfc/rfc4443) - ICMPv6
- [RFC 1191](https://www.rfc-editor.org/rfc/rfc1191) - Path MTU Discovery
- [RFC 4821](https://www.rfc-editor.org/rfc/rfc4821) - PMTUD для TCP (без ICMP)
- [RFC 6633](https://www.rfc-editor.org/rfc/rfc6633) - Deprecation of ICMP Source Quench
- [IANA ICMP типы](https://www.iana.org/assignments/icmp-parameters/icmp-parameters.xhtml) - полный список
- [Wireshark ICMP](https://wiki.wireshark.org/ICMP) - анализ в Wireshark
