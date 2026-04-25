---
title: "UDP - протокол, особенности, применение"
date: "2026-04-25"
---

UDP (User Datagram Protocol) - транспортный протокол без установки соединения, без гарантии доставки и без сохранения порядка. Определён в RFC 768 (1980). Главный принцип: отправил и забыл.

---

## Базовые свойства UDP

```
UDP гарантирует:
Отправку датаграммы в сеть
Контрольную сумму (опционально, но включена по умолчанию)
Сохранение границ сообщений (одна отправка = одна датаграмма)

UDP НЕ гарантирует:
Доставку (пакет может быть потерян)
Порядок (пакеты приходят в произвольном порядке)
Отсутствие дублей (один пакет может прийти дважды)
Контроль перегрузки (может "залить" сеть)
```

### UDP vs TCP

| Характеристика | UDP | TCP |
| --- | --- | --- |
| Установка соединения | Нет | 3-way handshake |
| Гарантия доставки | Нет | Да |
| Порядок пакетов | Не гарантирован | Гарантирован |
| Скорость | Выше | Ниже |
| Overhead заголовка | 8 байт | 20-60 байт |
| Буферизация | Нет | Да |
| Границы сообщений | Сохраняются | Не сохраняются (поток байт) |
| Multicast / Broadcast | Да | Нет |
| Congestion control | Нет | Да |

---

## Заголовок UDP

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 бит             │           16 бит             │
├──────────────────────────────┼──────────────────────────────┤
│            Length            │           Checksum           │
│           16 бит             │           16 бит             │
└──────────────────────────────┴──────────────────────────────┘
│                        Данные (Payload)                      │
└──────────────────────────────────────────────────────────────┘
```

### Поля заголовка

| Поле | Размер | Описание |
| --- | --- | --- |
| Source Port | 16 бит | Порт отправителя (может быть 0 если ответ не нужен) |
| Destination Port | 16 бит | Порт получателя (0-65535) |
| Length | 16 бит | Длина заголовка + данных в байтах (мин. 8) |
| Checksum | 16 бит | Контрольная сумма (опционально в IPv4, обязательно в IPv6) |

```
Максимальный размер UDP датаграммы:
  65535 байт (max Length) - 8 байт (заголовок UDP) = 65527 байт payload

Но на практике ограничен MTU:
  Ethernet MTU = 1500 байт
  IP заголовок = 20 байт
  UDP заголовок = 8 байт
  Максимальный payload без фрагментации = 1472 байт

Если датаграмма > MTU - IP фрагментирует её сам.
Фрагментация нежелательна: потеря одного фрагмента = потеря всей датаграммы.
```

---

## Как работает Checksum

```
Checksum считается над псевдо-заголовком + заголовком UDP + данными.

Псевдо-заголовок (не передаётся по сети, только для расчёта):
┌────────────────────────────────────────┐
│         Source IP Address (32 бит)     │
├────────────────────────────────────────┤
│      Destination IP Address (32 бит)   │
├───────────────┬────────────────────────┤
│  Zeros (8 б)  │  Protocol=17 (8 бит)  │
├───────────────┴────────────────────────┤
│          UDP Length (16 бит)           │
└────────────────────────────────────────┘

IPv4: Checksum опционален (0x0000 = выключен)
IPv6: Checksum обязателен всегда

Если checksum выключен и данные повреждены в пути - приложение
получит мусор без какого-либо предупреждения.
```

---

## Сокеты UDP - как это работает изнутри

```
Отправитель:                           Получатель:
socket(AF_INET, SOCK_DGRAM)            socket(AF_INET, SOCK_DGRAM)
                                       bind(port)
sendto(data, addr)                     recvfrom(buffer)
  │                                       │
  │  UDP датаграмма ───────────────────►  │
  │                                       │
  ▼                                       ▼
Ядро отправило и забыло            Ядро положило датаграмму
                                   в буфер recv. Если буфер
                                   переполнен - датаграмма
                                   молча сбрасывается.
```

```
# Буферы UDP (Linux)
cat /proc/sys/net/core/rmem_default    # размер буфера приёма по умолчанию
cat /proc/sys/net/core/rmem_max        # максимальный буфер приёма
cat /proc/sys/net/core/wmem_default    # буфер отправки по умолчанию
cat /proc/sys/net/core/wmem_max        # максимальный буфер отправки

# Увеличить буферы (для высоконагруженных UDP сервисов)
echo 26214400 > /proc/sys/net/core/rmem_max     # 25 MB
echo 26214400 > /proc/sys/net/core/rmem_default
```

### Потеря датаграмм на стороне получателя

```
Сценарий потери при переполнении буфера:

[датаграмма 1] ──► буфер [1][2][3][4][5] - ОК
[датаграмма 2] ──► буфер [1][2][3][4][5] - ОК
...
[датаграмма N] ──► буфер ПОЛНЫЙ - МОЛЧА СБРОШЕНА ✗

Приложение читает медленно → буфер заполняется → пакеты теряются.
UDP не уведомляет отправителя об этом!

Посмотреть сколько датаграмм было потеряно:
cat /proc/net/udp      # receive queue, drops для каждого сокета
ss -unap               # recv-q > 0 означает непрочитанные данные
netstat -su            # суммарная статистика: "receive buffer errors"
```

---

## Где применяется UDP

### DNS (порт 53)

```
Клиент                    DNS Сервер
  │  Запрос: A google.com  │
  │  src=random, dst=53    │
  │─────────────────────►  │
  │                        │
  │  Ответ: 142.250.x.x    │
  │◄─────────────────────  │

Почему UDP, а не TCP?
- Запрос и ответ помещаются в одну датаграмму (< 512 байт для UDP)
- Не нужен handshake (экономия RTT)
- Если ответ не пришёл - клиент просто переспрашивает
- DNS резолвер делает тысячи запросов/сек - TCP overhead неприемлем

Когда DNS использует TCP (порт 53):
- Ответ > 512 байт (большие зоны, DNSSEC)
- Zone Transfer (AXFR) - передача всей зоны
- Когда сервер вернул флаг TC (Truncated)
```

```
# Посмотреть DNS запросы
tcpdump -i eth0 -n udp port 53
# 14:32:01 192.168.1.10.52341 > 8.8.8.8.53: UDP, length 29
# 14:32:01 8.8.8.8.53 > 192.168.1.10.52341: UDP, length 61

# Сделать DNS запрос через UDP
dig google.com A
dig google.com A +notcp    # явно указать UDP

# Сделать DNS запрос через TCP
dig google.com A +tcp

# Захват DNS трафика с декодированием
tcpdump -i eth0 -n -v udp port 53
```

### DHCP (порты 67/68)

```
Клиент (0.0.0.0:68)              Сервер (255.255.255.255:67)
  │                                        │
  │  DISCOVER (broadcast)                  │
  │  src=0.0.0.0:68, dst=255.255.255.255:67│
  │───────────────────────────────────────►│
  │                                        │
  │           OFFER (unicast/broadcast)    │
  │◄───────────────────────────────────────│
  │                                        │
  │  REQUEST (broadcast)                   │
  │───────────────────────────────────────►│
  │                                        │
  │             ACK (unicast/broadcast)    │
  │◄───────────────────────────────────────│

Почему UDP?
- Клиент ещё не имеет IP адреса - нельзя установить TCP соединение
- Нужен broadcast - TCP не поддерживает broadcast
- Простой 4-пакетный обмен не требует гарантий TCP
```

```
# Посмотреть DHCP трафик
tcpdump -i eth0 -n udp port 67 or udp port 68
tcpdump -i eth0 -n -v 'udp and (port 67 or port 68)'

# Запустить DHCP renewal вручную (Linux)
dhclient -r eth0    # release
dhclient eth0       # request new
```

### NTP (порт 123)

```
Клиент                    NTP Сервер
  │  Request               │
  │  T1 = время отправки   │
  │───────────────────────►│  T2 = время получения
  │                        │  T3 = время ответа
  │  Response              │
  │◄───────────────────────│
  T4 = время получения

RTT = (T4-T1) - (T3-T2)
Смещение = ((T2-T1) + (T3-T4)) / 2

Почему UDP?
- Один запрос, один ответ
- Синхронизация времени требует точных меток - TCP добавляет задержки
- Широковещательный режим (NTP broadcast для LAN)
```

```
# Посмотреть NTP трафик
tcpdump -i eth0 -n udp port 123

# Проверить синхронизацию времени
chronyc tracking
timedatectl show-timesync

# Принудительная синхронизация
chronyc makestep
```

### Стриминг и VoIP

```
RTP (Real-time Transport Protocol) - поверх UDP:
- Аудио/видео звонки (SIP, WebRTC)
- Онлайн-стриминг
- Видеоконференции (Zoom, Teams используют RTP)

Почему UDP критичен для VoIP/стриминга?

Представь TCP для голосового звонка:
  Пакет потерян → TCP ждёт → запрашивает повторно → ждёт снова
  Задержка может составить сотни миллисекунд
  Голос "замерзает", потом идёт пачкой
  → Невозможно для реального времени

С UDP:
  Пакет потерян → пропуск (слышен "щелчок" или тишина)
  Следующий пакет принят сразу
  → Небольшой артефакт, но разговор продолжается

Допустимая потеря пакетов для VoIP: 1-3%
Допустимая задержка (one-way): < 150 мс
Допустимый jitter: < 30 мс
```

```
# Мониторинг UDP трафика для VoIP (RTP обычно на портах 10000-20000)
tcpdump -i eth0 -n 'udp portrange 10000-20000'

# Измерить jitter и потери через iperf3
iperf3 -c server -u -b 1M -t 30    # UDP тест, 1 Mbit/s, 30 сек
# [ ID] Interval    Transfer    Bitrate    Jitter    Lost/Total
# [  5] 0-30 sec    3.58 MBytes 1.00 Mbits/s  0.234 ms  2/2560 (0.078%)
```

### Онлайн-игры

```
Почему игры используют UDP:
  - Актуальность данных важнее доставки
  - Позиция игрока 100 мс назад бесполезна - нужна текущая
  - TCP: потеря пакета → повторная передача → Head-of-Line blocking
    (новые пакеты ждут пока старый не будет доставлен)
  - UDP: потеря старого пакета → сразу берём следующий

Что делают игровые движки поверх UDP:
  - Нумерация пакетов (sequence numbers)
  - Selective retransmit только для критичных данных (events, hits)
  - Delta compression (передаём только изменения)
  - Client-side prediction + reconciliation
  - Jitter buffer

Примеры: Quake, CS:GO, Valorant, Minecraft (Java Edition использует TCP,
но Bedrock Edition - UDP через протокол RakNet)
```

### QUIC / HTTP/3

```
QUIC (Quick UDP Internet Connections) - Google (2012) → RFC 9000 (2021)
HTTP/3 работает поверх QUIC, который работает поверх UDP.

Почему UDP вместо TCP?
  TCP работает в ядре ОС → медленные обновления, нет гибкости
  QUIC работает в userspace поверх UDP → быстрая эволюция протокола

Что QUIC добавляет поверх UDP:
  - Шифрование (TLS 1.3 встроен)
  - Надёжная доставка (свои seq numbers, ACK)
  - Управление потоком (flow control)
  - Мультиплексирование (несколько потоков, нет HOL blocking)
  - 0-RTT / 1-RTT handshake (быстрее TCP+TLS)
  - Connection migration (смена IP без разрыва соединения)

По сути: QUIC = TCP + TLS + мультиплексирование, но гибче
```

```
# Проверить поддерживает ли сервер HTTP/3
curl -I --http3 https://cloudflare.com
curl -v --http3-only https://quic.nginx.org

# Посмотреть QUIC трафик
tcpdump -i eth0 -n udp port 443

# nmap: определить QUIC
nmap -sU -p 443 --script quic-info example.com
```

### SNMP (порт 161/162)

```
Simple Network Management Protocol
  - Мониторинг и управление сетевым оборудованием
  - Запросы get/set: порт 161 (агент)
  - Трапы (уведомления): порт 162 (менеджер)

Почему UDP:
  - Простые запрос/ответ (как DNS)
  - Трапы - fire and forget уведомления
  - Работает даже при проблемах с сетью (нет handshake)
```

```
# Запросить данные через SNMP
snmpget -v2c -c public router.local 1.3.6.1.2.1.1.1.0    # sysDescr

# Захват SNMP трафика
tcpdump -i eth0 -n udp port 161 or udp port 162

# Проверить трапы
snmptrapd -f -Lo -c /etc/snmp/snmptrapd.conf
```

---

## Broadcast и Multicast - эксклюзив UDP

### Broadcast

```
Unicast:   один отправитель  → один получатель
Broadcast: один отправитель  → все в сети
Multicast: один отправитель  → группа получателей

Broadcast адреса:
  255.255.255.255         - ограниченный broadcast (только своя сеть)
  192.168.1.255           - directed broadcast (сеть 192.168.1.0/24)

TCP не поддерживает broadcast - соединение требует конкретный адрес.
UDP может отправить датаграмму всем сразу.
```

```
# Отправить broadcast UDP
echo "hello" | nc -u -b 255.255.255.255 9999

# Захват broadcast пакетов
tcpdump -i eth0 -n 'udp and dst host 255.255.255.255'

# Включить broadcast в сокете (нужно SO_BROADCAST)
# Python пример:
# s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
# s.sendto(b"hello", ("255.255.255.255", 9999))
```

### Multicast

```
Multicast адреса (IPv4): 224.0.0.0 - 239.255.255.255
  224.0.0.0/24  - link-local (не маршрутизируются, только своя сеть)
  224.0.0.1     - все хосты в сети
  224.0.0.2     - все роутеры в сети
  239.0.0.0/8   - administratively scoped (для LAN)

IGMP (Internet Group Management Protocol) управляет подпиской:
  Хост → роутеру: "хочу получать группу 239.1.1.1"
  Роутер записывает и форвардит трафик только подписчикам

Применения multicast:
  - IPTV / видеоконференции в LAN
  - Routing протоколы (OSPF: 224.0.0.5, 224.0.0.6)
  - mDNS (Bonjour, Avahi): 224.0.0.251, port 5353
  - SSDP (UPnP): 239.255.255.250, port 1900
```

```
# Посмотреть multicast группы на интерфейсе
ip maddress show eth0
netstat -g

# Захват multicast
tcpdump -i eth0 -n 'udp and dst net 224.0.0.0/4'

# mDNS - обнаружение сервисов в LAN
avahi-browse -a           # список всех сервисов
avahi-resolve -n hostname.local  # резолв через mDNS

# SSDP - обнаружение UPnP устройств
tcpdump -i eth0 -n 'udp and dst host 239.255.255.250'
```

---

## UDP Flood - проблемы безопасности

### UDP Amplification DDoS

```
UDP уязвим к Amplification атакам из-за:
  1. Нет handshake - нельзя проверить что src IP настоящий
  2. Маленький запрос → большой ответ (amplification factor)

Пример DNS Amplification:
  Атакующий (spoofed src=жертва)      DNS сервер (open resolver)
      │  запрос ANY isc.org (40 байт)       │
      │─────────────────────────────────────►│
      │                                      │  ответ 4000 байт ──► жертва
      │                                      │  Amplification: 100x !

Популярные UDP Amplification векторы:
  DNS     - коэф. усиления до 140x
  NTP     - до 556x (monlist запрос)
  SSDP    - до 30x
  Memcached UDP - до 51000x (рекорд)
  CLDAP   - до 70x
```

```
# Защита от UDP flood
# Ограничить rate UDP трафика через iptables
iptables -A INPUT -p udp -m limit --limit 100/s --limit-burst 200 -j ACCEPT
iptables -A INPUT -p udp -j DROP

# Отключить открытый DNS резолвер
# /etc/named.conf:
# allow-recursion { 192.168.0.0/16; };   # только своя сеть
# allow-query { any; };

# Отключить NTP monlist (уязвимый функционал)
# /etc/ntp.conf:
# restrict default noquery nomodify nopeer
# disable monitor

# Посмотреть статистику UDP drops
netstat -su | grep -i "error\|fail\|drop"
cat /proc/net/snmp | grep Udp
```

### UDP Port Scanning

```
Сканирование UDP портов сложнее TCP:
  - Нет handshake: открытый порт может просто не ответить
  - Закрытый порт → ICMP Port Unreachable (тип 3, код 3)
  - Firewall может блокировать ICMP → неизвестно: открыт или фильтруется

nmap UDP scan логика:
  Отправляем UDP датаграмму на порт
  Нет ответа            → open | filtered
  ICMP unreachable      → closed
  UDP ответ             → open
  ICMP другой тип       → filtered
```

```
# UDP сканирование (медленнее TCP, нужны права)
sudo nmap -sU -p 53,67,68,123,161,162 target
sudo nmap -sU --top-ports 100 target       # топ 100 UDP портов
sudo nmap -sU -p U:53,T:80 target          # UDP и TCP вместе

# Быстрый UDP скан
sudo nmap -sU -T4 --open target

# Подробный вывод
sudo nmap -sUV -p 53 target                # версия сервиса
```

---

## Диагностика UDP

```
# Все UDP сокеты
ss -unap
# Recv-Q > 0 означает непрочитанные данные в буфере (приложение отстаёт)

# Статистика UDP ядра
cat /proc/net/snmp | grep Udp
# Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors
# Udp: 123456      42       7        234567        0            0

# InDatagrams  - всего принято датаграмм
# NoPorts      - датаграмм на закрытый порт (→ ICMP unreachable)
# InErrors     - ошибки checksum и другие
# RcvbufErrors - сброшено из-за переполнения recv буфера (!)
# SndbufErrors - сброшено из-за переполнения send буфера

# Быстрая проверка потерь
watch -n 1 'cat /proc/net/snmp | grep Udp'

# Подробная статистика
netstat -su
# Udp:
#     123456 packets received
#     42 packets to unknown port received
#     7 packet receive errors          ← ошибки
#     234567 packets sent
#     0 receive buffer errors          ← переполнение буфера
```

```
# Захват UDP трафика
tcpdump -i eth0 -n udp
tcpdump -i eth0 -n udp port 53         # только DNS
tcpdump -i eth0 -n udp portrange 5000-6000
tcpdump -i eth0 -n 'udp and len > 500' # большие датаграммы

# Тест UDP с iperf3
# Сервер:
iperf3 -s
# Клиент:
iperf3 -c server -u -b 10M -t 10      # UDP, 10 Mbit/s, 10 сек
# Результат покажет: Bitrate, Jitter, Lost/Total datagrams

# Простая проверка UDP порта через netcat
nc -u -l 9999                          # сервер слушает
echo "test" | nc -u localhost 9999     # клиент отправляет

# Проверить достижимость UDP порта (через nmap)
sudo nmap -sU -p 53 8.8.8.8
```

### ICMP Port Unreachable

```
Когда UDP датаграмма приходит на закрытый порт:
  → ядро отправляет ICMP Type 3 Code 3 (Port Unreachable) обратно

Это единственный способ узнать что порт закрыт.
Если файрволл блокирует ICMP - порт выглядит открытым (filtered).

Захват ICMP Port Unreachable:
  tcpdump -i eth0 -n 'icmp[0]=3 and icmp[1]=3'
  tcpdump -i eth0 -n icmp

Rate limiting ICMP:
  Linux по умолчанию ограничивает генерацию ICMP unreachable:
  cat /proc/sys/net/ipv4/icmp_ratelimit   # обычно 1000 (1000 мс между пачками)
  cat /proc/sys/net/ipv4/icmp_ratemask    # какие типы ICMP лимитировать
```

---

## Реализация UDP надёжности в приложениях

Когда UDP нужен по скорости, но нужна хоть какая-то надёжность - протокол реализуется поверх UDP в приложении.

### Паттерны надёжного UDP

```
1. Нумерация пакетов + ACK на уровне приложения:
   Отправитель нумерует каждую датаграмму.
   Получатель отправляет ACK.
   Если ACK не пришёл за timeout - повтор.

2. Selective Repeat / Sliding Window:
   Не ждём ACK на каждый пакет - отправляем окном.
   ACK подтверждает диапазоны (как SACK в TCP).

3. FEC (Forward Error Correction):
   Избыточные пакеты для восстановления без повторной передачи.
   Пример: из 10 пакетов данных создаём 4 parity-пакета.
   Если потеряны любые 4 из 14 - восстанавливаем без запроса.

4. NACK (Negative Acknowledgment):
   Получатель сигнализирует только о потере.
   Эффективнее для low-loss сетей.
```

### Готовые протоколы надёжного UDP

| Протокол | Описание | Применение |
| --- | --- | --- |
| QUIC | Google, RFC 9000, в ядре HTTP/3 | HTTP/3, веб |
| RakNet | Reliable UDP для игр | Minecraft Bedrock, игры |
| ENet | Reliable UDP, lightweight | игровые движки |
| KCP | Быстрее TCP на плохих каналах | мобильные игры, VPN |
| RUDP | RFC 1151, базовый reliable UDP | старые системы |
| SCTP | RFC 4960, альтернатива TCP | телеком (SS7/Diameter) |
| WebRTC | DataChannel поверх DTLS/SCTP/UDP | браузеры |

---

## Популярные UDP порты

```
Порт    Протокол   Описание
------  ---------  -------------------------------------------
53      DNS        Domain Name System (запросы)
67      DHCP       DHCP сервер (Bootstrap Protocol Server)
68      DHCP       DHCP клиент (Bootstrap Protocol Client)
69      TFTP       Trivial File Transfer Protocol
123     NTP        Network Time Protocol
137     NetBIOS    NetBIOS Name Service
138     NetBIOS    NetBIOS Datagram Service
161     SNMP       Simple Network Management Protocol
162     SNMP       SNMP Trap (уведомления)
443     QUIC       HTTP/3 (поверх QUIC)
500     IKE        Internet Key Exchange (IPSec)
514     Syslog     UDP Syslog (RFC 5424)
1194    OpenVPN    OpenVPN (UDP режим)
1900    SSDP       Simple Service Discovery Protocol (UPnP)
4500    NAT-T      NAT Traversal для IPSec
5353    mDNS       Multicast DNS (Bonjour/Avahi)
5355    LLMNR      Link-Local Multicast Name Resolution
51820   WireGuard  WireGuard VPN
```

```
# Посмотреть все слушающие UDP порты
ss -ulnp
# Netstate (устаревший)
netstat -ulnp

# Конкретный порт
ss -ulnp sport = :53
```

---

## UDP и NAT

```
NAT (Network Address Translation) сложнее с UDP:
  TCP: NAT отслеживает соединения по флагам SYN/FIN
  UDP: нет состояния соединения - NAT использует таймауты

Таймаут UDP в NAT:
  Обычно 30-300 секунд (зависит от реализации)
  UDP сессия истекает если нет трафика в обе стороны
  После истечения - новые входящие пакеты дропаются

Проблема: UDP "дырки" в NAT закрываются при простое.
Решение: keepalive пакеты каждые 25-30 секунд.
```

### NAT Traversal (Hole Punching)

```
Как два клиента за NAT устанавливают прямое UDP соединение:

Клиент A (NAT-A)    STUN/TURN Сервер    Клиент B (NAT-B)
  │                       │                    │
  │  Мой внешний IP:port? │                    │
  │──────────────────────►│                    │
  │  203.0.113.1:4000     │                    │
  │◄──────────────────────│                    │
  │                       │  Мой внешний IP:port?
  │                       │◄───────────────────│
  │                       │  198.51.100.1:5000  │
  │                       │───────────────────►│
  │                       │                    │
  │◄──── "A: 203.0.113.1:4000, B: 198.51.100.1:5000" ─────────►│
  │                       │                    │
  │  UDP ──────────────────────────────────────────────────────►│
  │◄────────────────────────────────────────────────────────────│
                (прямое соединение A ↔ B, без сервера)

STUN - Session Traversal Utilities for NAT (RFC 5389)
TURN - Traversal Using Relays around NAT (RFC 5766)
ICE  - Interactive Connectivity Establishment (WebRTC использует ICE)
```

```
# Определить свой внешний IP и NAT тип через STUN
stun stun.l.google.com:19302

# WireGuard использует UDP и keepalive для поддержания NAT:
# /etc/wireguard/wg0.conf
# PersistentKeepalive = 25    # пакет каждые 25 сек
```

---

## Шпаргалка

```
Заголовок UDP: всего 8 байт
  Source Port (16) | Destination Port (16)
  Length (16)      | Checksum (16)

UDP - это:
  [+] Быстро (нет handshake, нет подтверждений)
  [+] Малый overhead (8 байт header)
  [+] Broadcast и Multicast
  [+] Сохраняет границы сообщений
  [-] Нет гарантии доставки
  [-] Нет порядка пакетов
  [-] Нет контроля перегрузки
  [-] Уязвим к IP spoofing (amplification DDoS)

Когда UDP:
  Реальное время (VoIP, стриминг, игры)
  Простые запрос/ответ (DNS, NTP, SNMP, DHCP)
  Broadcast/Multicast нужен
  Потеря лучше задержки
  Своя надёжность поверх (QUIC, RakNet, KCP)

Когда TCP:
  Нужна гарантия доставки и порядок
  Передача файлов, HTTP(1/2), email, SSH
  Нет своей обработки потерь

Диагностика:
  ss -unap                          - UDP сокеты
  cat /proc/net/snmp | grep Udp     - статистика (потери!)
  netstat -su                       - суммарная статистика
  tcpdump -i eth0 -n udp            - UDP трафик
  iperf3 -c server -u -b 10M       - тест UDP (jitter, loss)
  sudo nmap -sU --top-ports 100 ip  - UDP скан
```

---

## Ссылки

- [RFC 768](https://www.rfc-editor.org/rfc/rfc768) - оригинальный стандарт UDP (1980)
- [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000) - QUIC: A UDP-Based Multiplexed and Secure Transport
- [RFC 5389](https://www.rfc-editor.org/rfc/rfc5389) - Session Traversal Utilities for NAT (STUN)
- [RFC 5766](https://www.rfc-editor.org/rfc/rfc5766) - Traversal Using Relays around NAT (TURN)
- [RFC 3550](https://www.rfc-editor.org/rfc/rfc3550) - RTP: A Transport Protocol for Real-Time Applications
- [TCP Illustrated, Vol. 1](https://www.kohala.com/start/tcpipiv1.html) - W. Richard Stevens (глава 11: UDP)
