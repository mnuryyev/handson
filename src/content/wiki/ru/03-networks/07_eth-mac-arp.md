---
title: "Ethernet - MAC-адреса, ARP, CAM-таблица"
date: "2026-04-26"
---

Ethernet - самая распространённая технология канального уровня (L2 OSI). Работает с физическими адресами (MAC), определяет формат кадра и правила передачи данных внутри одного сегмента сети. ARP связывает L2 и L3 - переводит IP-адрес в MAC. CAM-таблица - это то, как коммутатор "запоминает" кто где находится.

---

## MAC-адрес

### Что такое MAC-адрес

```
MAC (Media Access Control) - уникальный физический адрес сетевого интерфейса.
Длина: 48 бит (6 байт).
Формат: XX:XX:XX:XX:XX:XX (hex, разделитель - двоеточие или дефис)

Примеры:
  00:1A:2B:3C:4D:5E
  00-1A-2B-3C-4D-5E
  001A.2B3C.4D5E     (Cisco формат)

Назначается производителем сетевого оборудования.
"Прошит" в NIC (Network Interface Card), но может быть изменён программно.
```

### Структура MAC-адреса

```
|←────── OUI (3 байта) ──────→|←─── NIC Specific (3 байта) ───→|
  00      :     1A     :     2B  :  3C     :     4D     :     5E

OUI (Organizationally Unique Identifier):
  Первые 3 байта - идентификатор производителя.
  Назначается IEEE.
  Пример: 00:1A:2B = Dell, BC:92:6B = Apple, F8:FF:C2 = Google

NIC Specific:
  Последние 3 байта - уникальный номер устройства у данного производителя.
  Производитель сам назначает.

Специальные биты в первом байте:
  Бит 0 (LSB) - Individual/Group bit:
    0 = unicast (один получатель)
    1 = multicast/broadcast (группа или все)

  Бит 1 - Universal/Local bit:
    0 = globally unique (назначен производителем)
    1 = locally administered (изменён администратором/ОС)
```

### Специальные MAC-адреса

```
Broadcast:
  FF:FF:FF:FF:FF:FF - получают все устройства в сегменте.
  Используется ARP, DHCP Discover, некоторые протоколы L2.

Multicast:
  Первый байт нечётный (LSB=1), но не FF.
  01:00:5E:xx:xx:xx - IPv4 multicast (RFC 1112)
  33:33:xx:xx:xx:xx - IPv6 multicast (RFC 2464)
  01:80:C2:00:00:00 - STP (Spanning Tree)
  01:00:0C:CC:CC:CC - CDP (Cisco Discovery Protocol)

Loopback/null (не встречается в сети):
  00:00:00:00:00:00 - нулевой адрес (не используется в реальных кадрах)
```

### Узнать MAC-адрес

```
# Linux
ip link show
ip link show eth0
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
#     link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff

ip addr show eth0     # тоже показывает MAC

# Старый способ (устаревший, но работает)
ifconfig eth0
# eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
#         ether 00:1a:2b:3c:4d:5e  txqueuelen 1000 ...

# macOS
ifconfig en0 | grep ether

# Windows
ipconfig /all
# Physical Address: 00-1A-2B-3C-4D-5E

getmac /v    # все интерфейсы

# Определить производителя по OUI
# Онлайн: https://macvendors.com
# Локально через nmap
nmap --script broadcast-dhcp-discover
# или просто:
echo "00:1a:2b" | tr '[:lower:]' '[:upper:]'
# Потом ищем в базе IEEE: https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries
```

### Изменить MAC-адрес (MAC Spoofing)

```
# Linux - временно (до перезагрузки)
ip link set eth0 down
ip link set eth0 address 00:11:22:33:44:55
ip link set eth0 up

# Через macchanger (удобнее)
apt install macchanger
macchanger -r eth0          # случайный MAC
macchanger -m 00:11:22:33:44:55 eth0   # конкретный MAC
macchanger -p eth0          # вернуть оригинальный

# Постоянно (через NetworkManager)
# /etc/NetworkManager/system-connections/eth0.nmconnection
# [ethernet]
# cloned-mac-address=00:11:22:33:44:55

# Windows
# Диспетчер устройств → свойства адаптера → дополнительно → Network Address

# Зачем?
# - Тестирование безопасности
# - Обход MAC-фильтрации
# - Приватность (Android/iOS рандомизируют MAC при Wi-Fi сканировании)
# - Клонирование MAC для ISP (некоторые провайдеры привязывают по MAC)
```

---

## Кадр Ethernet (Ethernet Frame)

### Структура кадра Ethernet II (наиболее распространённый)

```
┌──────────────┬──────────────┬──────────┬──────────────────┬──────┐
│  Destination │    Source    │EtherType │     Payload      │ FCS  │
│   MAC (6Б)   │   MAC (6Б)   │  (2Б)   │   (46-1500 Б)    │ (4Б) │
└──────────────┴──────────────┴──────────┴──────────────────┴──────┘
                                          ↑
                                  IP пакет / ARP / etc

Перед кадром (на физическом уровне, не видно в wireshark):
  Preamble (7 байт): 10101010 × 7 - синхронизация
  SFD (1 байт):      10101011      - Start Frame Delimiter

Итого на проводе: 8 (преамбула+SFD) + 6 + 6 + 2 + 46..1500 + 4 = 64..1518 байт
```

### Поля кадра

```
Destination MAC (6 байт):
  MAC получателя. Может быть unicast, multicast, broadcast.

Source MAC (6 байт):
  MAC отправителя. Всегда unicast (нельзя отправить от broadcast).

EtherType (2 байта):
  Протокол верхнего уровня в Payload.

  Значения EtherType:
    0x0800 - IPv4
    0x0806 - ARP
    0x86DD - IPv6
    0x8100 - VLAN (802.1Q, добавляет 4 байта тега)
    0x8847 - MPLS unicast
    0x88CC - LLDP (Link Layer Discovery Protocol)
    0x88F7 - PTP (Precision Time Protocol)
    0x9100 - QinQ (двойная инкапсуляция VLAN)

Payload (данные): 46-1500 байт
  Минимум 46 байт (если данных меньше - добавляется padding).
  Максимум 1500 байт (стандартный MTU Ethernet).
  Jumbo frames: до 9000+ байт (нестандартно, только внутри датацентра).

FCS - Frame Check Sequence (4 байта):
  CRC-32 контрольная сумма всего кадра (кроме преамбулы и SFD).
  Получатель пересчитывает и сравнивает.
  Несовпадение → кадр отбрасывается (CRC Error).
  FCS не виден в Wireshark - NIC проверяет и убирает до передачи ОС.
```

### 802.1Q VLAN тег

```
При использовании VLAN в кадр вставляется 4-байтный тег:

┌──────────┬──────────┬─────────┬──────────┬──────────────────┬──────┐
│ Dst MAC  │ Src MAC  │  0x8100 │ VLAN Tag │    Payload       │ FCS  │
│   (6Б)   │   (6Б)   │  (2Б)  │  (4Б)   │  (42-1500 Б)     │ (4Б) │
└──────────┴──────────┴─────────┴──────────┴──────────────────┴──────┘

VLAN Tag (4 байта):
  TPID (2Б): 0x8100 - идентификатор тега
  TCI  (2Б):
    PCP (3 бита): Priority Code Point (0-7, QoS)
    DEI (1 бит):  Drop Eligible Indicator
    VID (12 бит): VLAN ID (0-4095)

VLAN ID:
  0    - нет VLAN (зарезервирован)
  1    - default VLAN (часто управляющий)
  2-4094 - пользовательские VLAN
  4095 - зарезервирован

Максимум 4094 VLAN на один коммутатор (12 бит = 4096 значений, два зарезервированы).
```

---

## ARP - Address Resolution Protocol

### Зачем нужен ARP

```
Проблема:
  L3 (IP) знает куда отправить пакет (IP получателя).
  Но L2 (Ethernet) работает с MAC-адресами.
  Как узнать MAC-адрес хоста с нужным IP?

Решение: ARP (RFC 826, 1982).

ARP отвечает на вопрос:
  "У кого IP-адрес 192.168.1.1? Ответь мне своим MAC-адресом!"

Работает только внутри одного широковещательного домена (L2 сегмента).
Для связи с другой сетью используется MAC шлюза (default gateway),
а не MAC конечного получателя.
```

### Формат ARP-пакета

```
┌───────────────┬───────────────┬──────┬──────┬────────┬────────┐
│Hardware Type  │Protocol Type  │HW Len│Pr Len│Operation│       │
│    (2Б)       │    (2Б)       │ (1Б) │ (1Б) │  (2Б)  │       │
├───────────────┴───────────────┴──────┴──────┴────────┤       │
│          Sender Hardware Address (MAC, 6Б)            │       │
├───────────────────────────────────────────────────────┤       │
│          Sender Protocol Address (IP, 4Б)             │       │
├───────────────────────────────────────────────────────┤       │
│          Target Hardware Address (MAC, 6Б)            │       │
├───────────────────────────────────────────────────────┤       │
│          Target Protocol Address (IP, 4Б)             │       │
└───────────────────────────────────────────────────────┴───────┘

Hardware Type:  0x0001 = Ethernet
Protocol Type:  0x0800 = IPv4
HW Len:         6 (MAC = 6 байт)
Pr Len:         4 (IPv4 = 4 байта)
Operation:      1 = ARP Request, 2 = ARP Reply
                3 = RARP Request, 4 = RARP Reply (устаревший)
```

### Как работает ARP

```
Хост A (192.168.1.10, MAC: AA:AA:AA:AA:AA:AA) хочет отправить пакет
Хосту B (192.168.1.20, MAC: ???)

Шаг 1 - ARP Request (широковещательный):
  A проверяет ARP-кэш. Если записи нет → отправляет ARP Request.

  Ethernet кадр:
    Dst MAC: FF:FF:FF:FF:FF:FF  (broadcast - все в сегменте)
    Src MAC: AA:AA:AA:AA:AA:AA  (MAC отправителя)
    EtherType: 0x0806 (ARP)

  ARP payload:
    Operation:  1 (Request)
    Sender MAC: AA:AA:AA:AA:AA:AA
    Sender IP:  192.168.1.10
    Target MAC: 00:00:00:00:00:00  (неизвестен, заполнен нулями)
    Target IP:  192.168.1.20

  Все устройства в сегменте получают этот кадр.
  Только хост с IP 192.168.1.20 отвечает.

Шаг 2 - ARP Reply (unicast):
  Хост B отвечает напрямую хосту A.

  Ethernet кадр:
    Dst MAC: AA:AA:AA:AA:AA:AA  (unicast к A)
    Src MAC: BB:BB:BB:BB:BB:BB  (MAC хоста B)
    EtherType: 0x0806 (ARP)

  ARP payload:
    Operation:  2 (Reply)
    Sender MAC: BB:BB:BB:BB:BB:BB
    Sender IP:  192.168.1.20
    Target MAC: AA:AA:AA:AA:AA:AA
    Target IP:  192.168.1.10

Шаг 3 - кэширование:
  Хост A сохраняет в ARP-кэш: 192.168.1.20 → BB:BB:BB:BB:BB:BB
  Следующие пакеты к 192.168.1.20 идут без ARP Request.
```

### ARP-кэш

```
ARP-кэш (ARP cache / ARP table) - таблица соответствий IP → MAC.
Хранится в RAM, периодически обновляется.

Типы записей:
  dynamic - выучены автоматически через ARP Request/Reply
            живут ограниченное время (timeout)
  static  - добавлены вручную администратором
            не устаревают автоматически
  incomplete - ARP Request отправлен, Reply ещё не получен
```

```
# Посмотреть ARP-кэш
ip neigh show
# 192.168.1.1  dev eth0 lladdr 00:1a:2b:3c:4d:5e REACHABLE
# 192.168.1.20 dev eth0 lladdr bb:bb:bb:bb:bb:bb STALE
# 192.168.1.30 dev eth0                           FAILED

# Статусы записей:
# REACHABLE - запись актуальна, недавно подтверждена
# STALE     - запись устарела, но ещё не удалена
#             (следующий пакет вызовет проверку)
# DELAY     - ждём подтверждения (послали пакет, ждём ответа)
# PROBE     - отправляем unicast ARP для подтверждения
# FAILED    - хост недоступен (нет ответа)
# PERMANENT - статическая запись

# Старый способ
arp -n
# Address         HWtype  HWaddress           Flags Iface
# 192.168.1.1     ether   00:1a:2b:3c:4d:5e   C     eth0

# Добавить статическую запись
ip neigh add 192.168.1.50 lladdr 00:11:22:33:44:55 dev eth0 nud permanent

# Удалить запись
ip neigh del 192.168.1.50 dev eth0

# Очистить весь кэш
ip neigh flush all
ip neigh flush dev eth0   # только на интерфейсе

# Windows
arp -a                    # показать таблицу
arp -s 192.168.1.50 00-11-22-33-44-55   # добавить статическую
arp -d 192.168.1.50       # удалить

# Таймауты ARP кэша (Linux)
cat /proc/sys/net/ipv4/neigh/eth0/gc_stale_time    # 60 сек по умолчанию
cat /proc/sys/net/ipv4/neigh/default/gc_stale_time

# Посмотреть через sysctl
sysctl net.ipv4.neigh.default.gc_stale_time
```

### Gratuitous ARP (GARP)

```
Gratuitous ARP - "самообъявляющий" ARP-запрос.
Хост объявляет свой собственный IP → MAC.

Особенность: Sender IP = Target IP (хост спрашивает о себе самом).

Когда используется:
  1. При поднятии интерфейса - объявляет свой MAC всей сети
  2. При смене MAC-адреса - обновляет кэши всех соседей
  3. В HA (High Availability) - при переходе IP на другой узел
     (keepalived, VRRP, CARP - отправляют GARP при failover)
  4. Детектирование конфликта IP - если кто-то ответит на GARP,
     значит этот IP уже занят

Пример GARP:
  Отправитель: 192.168.1.10 (MAC: AA:AA:AA:AA:AA:AA)
  Dst MAC:    FF:FF:FF:FF:FF:FF (broadcast)
  Operation:  Request (или Reply)
  Sender MAC: AA:AA:AA:AA:AA:AA
  Sender IP:  192.168.1.10
  Target MAC: 00:00:00:00:00:00
  Target IP:  192.168.1.10   ← тот же IP что и Sender!

Получатели обновляют ARP-кэш: 192.168.1.10 → AA:AA:AA:AA:AA:AA
```

### Proxy ARP

```
Proxy ARP - маршрутизатор отвечает на ARP вместо реального хоста.

Сценарий:
  Хост A (192.168.1.10) хочет связаться с 10.0.0.5
  A не знает, что 10.0.0.5 в другой сети
  (нет default gateway или неправильная маска)

  A отправляет ARP Request: "кто 10.0.0.5?"
  Маршрутизатор (если включён Proxy ARP) отвечает своим MAC.
  A думает, что 10.0.0.5 - это маршрутизатор.
  Маршрутизатор перенаправляет пакеты дальше.

Проблемы Proxy ARP:
  - Увеличивает ARP трафик
  - Скрывает реальную топологию сети
  - Может вызвать security проблемы

Проверить и отключить (Linux):
  cat /proc/sys/net/ipv4/conf/eth0/proxy_arp
  echo 0 > /proc/sys/net/ipv4/conf/all/proxy_arp

Cisco:
  interface GigabitEthernet0/0
    no ip proxy-arp
```

---

## ARP и безопасность

### ARP Spoofing / ARP Poisoning

```
ARP - протокол без аутентификации.
Любой хост может отправить ARP Reply с ложными данными.
Получатели обновят ARP-кэш без проверки.

ARP Spoofing (ARP Cache Poisoning):
  Атакующий (MAC: EE:EE:EE:EE:EE:EE) отправляет:

  Жертве A (192.168.1.10):
    ARP Reply: "IP 192.168.1.1 - это EE:EE:EE:EE:EE:EE"
    Жертва A теперь думает, что шлюз - это атакующий.

  Шлюзу (192.168.1.1):
    ARP Reply: "IP 192.168.1.10 - это EE:EE:EE:EE:EE:EE"
    Шлюз думает, что жертва A - это атакующий.

Результат:
  Весь трафик A ↔ шлюз проходит через атакующего → MITM (Man in the Middle).
  Атакующий может:
    - Перехватывать данные (sniffing)
    - Изменять трафик (injection)
    - Блокировать соединение (DoS)
```

```
# Инструменты для ARP spoofing (для тестирования собственной сети!)
# arpspoof (dsniff пакет)
arpspoof -i eth0 -t 192.168.1.10 192.168.1.1   # жертве говорим что шлюз - мы
arpspoof -i eth0 -t 192.168.1.1 192.168.1.10   # шлюзу говорим что жертва - мы

# Включить IP forwarding (чтобы трафик реально шёл через нас)
echo 1 > /proc/sys/net/ipv4/ip_forward

# ettercap
ettercap -T -M arp:remote /192.168.1.10// /192.168.1.1//

# bettercap
bettercap -iface eth0
# arp.spoof on
# net.sniff on

# Обнаружить ARP spoofing
arp -n | sort          # посмотреть дублирующиеся MAC
# Если два разных IP имеют одинаковый MAC - подозрительно!

# arpwatch - демон мониторинга ARP
apt install arpwatch
arpwatch -i eth0       # логирует все ARP изменения

# XArp - GUI инструмент для обнаружения ARP атак
```

### Защита от ARP Spoofing

```
1. Dynamic ARP Inspection (DAI) - на управляемых коммутаторах:
   Коммутатор проверяет ARP пакеты по DHCP Snooping таблице.
   Если IP→MAC не совпадает с выданным DHCP → пакет блокируется.

   Cisco:
     ip dhcp snooping
     ip dhcp snooping vlan 10
     ip arp inspection vlan 10
     interface GigabitEthernet0/1
       ip arp inspection limit rate 100  (pps)

2. Статические ARP записи (для критичных хостов):
   ip neigh add 192.168.1.1 lladdr 00:1a:2b:3c:4d:5e dev eth0 nud permanent

   Минус: не масштабируется, сложно управлять.

3. VLAN сегментация:
   Разделить сеть на VLAN → ARP broadcast не выходит за пределы VLAN.

4. Мониторинг:
   arpwatch, XArp, Wireshark фильтр: arp.duplicate-address-detected

5. Использование IPv6:
   IPv6 не использует ARP. Вместо него - NDP (Neighbor Discovery Protocol).
   NDP использует ICMPv6 и защищён SEND (Secure Neighbor Discovery).

6. 802.1X port authentication:
   Только авторизованные устройства подключаются к порту.
```

---

## CAM-таблица коммутатора

### Что такое CAM-таблица

```
CAM (Content Addressable Memory) таблица - таблица MAC-адресов коммутатора.
Также называется: MAC table, forwarding table, switching table.

Содержимое: MAC-адрес → порт (+ VLAN ID).

Назначение:
  Коммутатор запоминает, на каком порту находится каждый MAC-адрес.
  При получении кадра смотрит в таблицу и отправляет только на нужный порт.
  Без таблицы - пришлось бы делать flooding на все порты (как хаб).

Хранится в специальной CAM-памяти (Content Addressable Memory):
  Аппаратная реализация, поиск за O(1) - быстрее чем RAM.
  Размер ограничен: обычно 8K-64K записей на коммутатор.
```

### Как коммутатор учит MAC-адреса

```
MAC Learning - процесс заполнения CAM-таблицы:

При получении любого кадра коммутатор:
1. Смотрит на Source MAC кадра.
2. Записывает в таблицу: Source MAC → входящий порт (+ VLAN).
3. Обновляет таймер записи (обычно 300 сек = 5 минут).

Пример:
  Порт 1: ПК A (MAC: AA:AA:AA:AA:AA:AA)
  Порт 2: ПК B (MAC: BB:BB:BB:BB:BB:BB)
  Порт 3: ПК C (MAC: CC:CC:CC:CC:CC:CC)

  A отправляет кадр B:
    Src=AA:AA:AA:AA:AA:AA, Dst=BB:BB:BB:BB:BB:BB
    Коммутатор: AA:AA... → порт 1 (учим)
    BB:BB... в таблице есть → отправляем только на порт 2

  B отвечает A:
    Src=BB:BB:BB:BB:BB:BB, Dst=AA:AA:AA:AA:AA:AA
    Коммутатор: BB:BB... → порт 2 (учим/обновляем)
    AA:AA... → порт 1 → отправляем только на порт 1
```

### Flooding, Forwarding, Filtering

```
Три основных действия коммутатора с кадром:

FLOODING (затопление):
  Когда: Dst MAC не найден в CAM-таблице (неизвестный unicast),
         или Dst MAC = FF:FF:FF:FF:FF:FF (broadcast),
         или Dst MAC = multicast.
  Действие: отправить кадр на все порты кроме входящего.

FORWARDING (пересылка):
  Когда: Dst MAC найден в таблице, порт != входящий.
  Действие: отправить кадр только на нужный порт.

FILTERING (фильтрация):
  Когда: Dst MAC найден в таблице, порт == входящий.
  Действие: отбросить кадр (зачем отправлять обратно?).
  Редкий случай (например, хаб подключён к порту).
```

### Просмотр CAM-таблицы

```
# Cisco IOS
show mac address-table
# Vlan    Mac Address       Type        Ports
# ----    -----------       --------    -----
#    1    aa:aa:aa:aa:aa:aa  DYNAMIC    Gi0/1
#    1    bb:bb:bb:bb:bb:bb  DYNAMIC    Gi0/2
#   10    cc:cc:cc:cc:cc:cc  STATIC     Gi0/3

show mac address-table count         # количество записей
show mac address-table vlan 10       # только для VLAN 10
show mac address-table address aa:aa:aa:aa:aa:aa  # найти конкретный MAC
show mac address-table interface Gi0/1  # MAC на конкретном порту
show mac address-table aging-time    # таймер устаревания

# Очистить таблицу
clear mac address-table dynamic
clear mac address-table dynamic interface Gi0/1
clear mac address-table dynamic vlan 10

# Добавить статическую запись
mac address-table static aa:aa:aa:aa:aa:aa vlan 1 interface Gi0/1

# Изменить таймер устаревания (default: 300 сек)
mac address-table aging-time 600

# Linux (Open vSwitch)
ovs-appctl fdb/show br0
# port  VLAN  MAC                Age
#    1     0  aa:aa:aa:aa:aa:aa    0
#    2     0  bb:bb:bb:bb:bb:bb    5

# Linux bridge
bridge fdb show
# aa:aa:aa:aa:aa:aa dev eth1 master br0
# bb:bb:bb:bb:bb:bb dev eth2 master br0 permanent
```

### CAM Table Overflow (MAC Flooding атака)

```
Атака: CAM Table Overflow / MAC Flooding

Принцип:
  CAM-таблица коммутатора имеет ограниченный размер (обычно 8K-64K записей).
  Атакующий заваливает коммутатор кадрами с тысячами случайных MAC-адресов.
  Таблица переполняется, настоящие записи вытесняются.

Результат:
  Коммутатор не знает где реальные хосты → делает flooding всего трафика.
  Атакующий получает все кадры (как в хабе) → пассивный перехват.

Инструмент (для тестирования!):
  macof (пакет dsniff):
    macof -i eth0     # генерирует ~155,000 кадров в секунду со случайными MAC

Защита - Port Security на Cisco:
  interface GigabitEthernet0/1
    switchport mode access
    switchport port-security                      # включить
    switchport port-security maximum 3            # max 3 MAC на порту
    switchport port-security mac-address sticky   # запомнить текущие MAC
    switchport port-security violation restrict   # действие при нарушении:
    # restrict  - блокировать лишние кадры, счётчик++, log
    # protect   - блокировать лишние кадры, тихо
    # shutdown  - перевести порт в err-disabled (самое жёсткое)

  # Проверить port security
  show port-security interface Gi0/1
  show port-security address

  # Восстановить порт после shutdown
  interface Gi0/1
    shutdown
    no shutdown
```

---

## Spanning Tree Protocol (STP) - кратко

```
Проблема L2 петель:
  Если в сети Ethernet есть физическая петля (loop),
  broadcast кадры будут циркулировать бесконечно.
  CAM-таблица будет постоянно обновляться (MAC flapping).
  Сеть ляжет за секунды (broadcast storm).

STP (802.1D) решает это:
  Автоматически находит петли и блокирует один из портов.
  Сеть остаётся связной, но без петель.

RSTP (Rapid STP, 802.1W):
  Более быстрая конвергенция (секунды вместо 30-50 сек у STP).
  Современный стандарт.

Признаки broadcast storm:
  - Загрузка CPU коммутатора 100%
  - Все индикаторы портов мигают синхронно
  - Сеть недоступна

  Быстрое решение:
    - Физически отключить один из линков в петле
    - Затем разобраться в топологии
```

---

## Практические сценарии и диагностика

### Хост не пингуется - диагностика L2

```
Хост A не может достучаться до хоста B в той же сети.

Шаг 1: Проверить ARP-кэш
  ip neigh show | grep 192.168.1.20
  # Если нет записи - ARP не проходит
  # Если FAILED - хост не отвечает или L2 проблема

Шаг 2: Отправить ARP вручную
  arping -I eth0 192.168.1.20
  # ARPING 192.168.1.20 from 192.168.1.10 eth0
  # Unicast reply from 192.168.1.20 [BB:BB:BB:BB:BB:BB] 1.234ms

  # Нет ответа? → хост выключен, неправильный IP, L2 проблема

Шаг 3: Wireshark / tcpdump на ARP
  tcpdump -i eth0 arp
  # Если видим Request но нет Reply → проблема на стороне B
  # Если не видим Request → проблема на стороне A (интерфейс, кабель)

Шаг 4: Проверить CAM-таблицу на коммутаторе
  show mac address-table | include bb:bb:bb:bb:bb:bb
  # Если нет - коммутатор не видит хост B
  # Проверить физическое подключение, порт, VLAN

Шаг 5: Проверить VLAN
  show vlan brief
  show interfaces GigabitEthernet0/1 switchport
  # Убедиться что A и B в одном VLAN
```

### Дублирующиеся IP-адреса

```
Симптом: периодически теряется связь с хостом, ARP кэш нестабилен.

Диагностика:
  # Посмотреть ARP кэш - один IP = два MAC?
  arp -n
  ip neigh show

  # arping покажет кто ответил
  arping -I eth0 -D 192.168.1.10   # -D = detect duplicates
  # Если два ответа - конфликт IP!

  # На коммутаторе - MAC flapping в логах
  show logging | include flapping

Решение:
  Найти второй хост с тем же IP через MAC-адрес (OUI поиск).
  Изменить IP на одном из хостов.
  Настроить DHCP с зарезервированными адресами чтобы не повторялись.
```

### ARP не работает через VLAN

```
Ситуация: хосты в разных VLAN, маршрутизатор должен их связывать.

Проблема: ARP broadcast не проходит через маршрутизатор.
Решение: каждый хост отправляет ARP запросы в свой VLAN,
         маршрутизатор имеет IP в каждом VLAN (SVI или sub-interface),
         хосты отправляют пакеты на MAC маршрутизатора (default gateway).

Правило: никогда не пытайся ARP-ить адрес из другой подсети.
         ARP нужен только для адресов в той же подсети.
         Для других подсетей - ARP за MAC шлюза.
```

---

## Шпаргалка

```
MAC-адрес (48 бит = 6 байт):
  XX:XX:XX (OUI - производитель) : XX:XX:XX (номер устройства)
  FF:FF:FF:FF:FF:FF = broadcast
  Бит 0 первого байта: 0=unicast, 1=multicast/broadcast
  Бит 1 первого байта: 0=глобальный, 1=локально назначен

EtherType:
  0x0800 = IPv4
  0x0806 = ARP
  0x86DD = IPv6
  0x8100 = VLAN (802.1Q)

ARP:
  Request: broadcast (FF:FF:FF:FF:FF:FF), Operation=1
  Reply:   unicast к спрашивающему,       Operation=2
  GARP:    Sender IP = Target IP (объявление своего IP)
  Нет аутентификации → уязвим к ARP spoofing

CAM-таблица:
  MAC → порт (+ VLAN)
  Учится из Source MAC каждого входящего кадра
  Таймер: 300 сек (5 мин) по умолчанию
  Flooding: dst MAC неизвестен или broadcast
  Forwarding: dst MAC найден в таблице
  Переполнение → атака MAC flooding → трафик на все порты

Защита:
  DAI (Dynamic ARP Inspection) - против ARP spoofing
  Port Security - против MAC flooding
  Static ARP - для критичных хостов
  VLAN сегментация - ограничить broadcast домен

Полезные команды:
  ip neigh show              - ARP-кэш Linux
  ip neigh flush all         - очистить ARP-кэш
  arping -I eth0 192.168.1.1 - ручной ARP запрос
  tcpdump -i eth0 arp        - захват ARP трафика
  ip link show               - MAC-адреса интерфейсов
  show mac address-table     - CAM-таблица (Cisco)
  bridge fdb show            - MAC таблица Linux bridge
```

---

## Ссылки

- [RFC 826](https://www.rfc-editor.org/rfc/rfc826) - ARP (Address Resolution Protocol), 1982
- [RFC 5227](https://www.rfc-editor.org/rfc/rfc5227) - IPv4 Address Conflict Detection (Gratuitous ARP)
- [RFC 1122](https://www.rfc-editor.org/rfc/rfc1122) - Requirements for Internet Hosts (ARP кэш, таймауты)
- [IEEE 802.1Q](https://standards.ieee.org/ieee/802.1Q) - VLAN стандарт
- [IEEE 802.1D](https://standards.ieee.org/ieee/802.1D) - Spanning Tree Protocol
- [IEEE OUI Registry](https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries) - база данных производителей по MAC
