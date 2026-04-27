---
title: "DHCP - процесс получения адреса, опции"
date: "2026-04-27"
---

DHCP (Dynamic Host Configuration Protocol) - протокол автоматической настройки сетевых параметров. Клиент получает IP-адрес, маску, шлюз, DNS и другие параметры без ручной настройки. Определён в RFC 2131 (1997). Работает поверх UDP: клиент - порт 68, сервер - порт 67.

---

## Как работает DHCP

### Процесс DORA

```
DORA - четыре шага получения адреса:
  D - Discover  (клиент ищет DHCP сервер)
  O - Offer     (сервер предлагает адрес)
  R - Request   (клиент просит конкретный адрес)
  A - Acknowledge (сервер подтверждает)

Клиент                              DHCP Сервер
  │                                      │
  │──── DHCP Discover ──────────────────►│  broadcast (255.255.255.255)
  │     src: 0.0.0.0:68                  │  "Есть тут DHCP серверы?"
  │     dst: 255.255.255.255:67          │
  │                                      │
  │◄─── DHCP Offer ─────────────────────│  unicast или broadcast
  │     "Предлагаю тебе 192.168.1.10"   │
  │     IP: 192.168.1.10                 │
  │     Маска: 255.255.255.0             │
  │     Шлюз: 192.168.1.1               │
  │     DNS: 8.8.8.8                     │
  │     Время аренды: 86400 сек          │
  │                                      │
  │──── DHCP Request ───────────────────►│  broadcast
  │     "Хочу 192.168.1.10 от сервера X"│
  │     (broadcast - другие серверы      │
  │      тоже должны узнать об отказе)   │
  │                                      │
  │◄─── DHCP ACK ───────────────────────│  unicast или broadcast
  │     "Подтверждаю. Адрес твой."      │
  │     Всё то же + точное время аренды  │
  │                                      │
  │  [Клиент настраивает интерфейс]      │

Почему broadcast на этапе Discover и Request?
  У клиента ещё нет IP-адреса → не может отправить unicast.
  Discover: ищет все DHCP серверы в сегменте.
  Request: broadcast чтобы все серверы (не только выбранный)
           знали что остальные Offer отклонены.
```

### Детали каждого шага

```
DHCP Discover:
  src MAC:  клиентский MAC
  src IP:   0.0.0.0 (нет адреса)
  dst IP:   255.255.255.255 (broadcast)
  dst port: 67 (DHCP server)
  src port: 68 (DHCP client)

  Содержит:
  - xid (transaction ID) - случайное число, связывает запрос с ответом
  - chaddr - MAC-адрес клиента
  - Опция 53: DHCP Message Type = 1 (Discover)
  - Опция 55: Parameter Request List (что клиент хочет получить)
  - Опция 61: Client Identifier

DHCP Offer:
  src IP:   IP DHCP сервера
  dst IP:   255.255.255.255 (broadcast, т.к. клиент без IP)
            или unicast по chaddr (MAC клиента)
  Тот же xid что в Discover.

  Содержит:
  - yiaddr ("your IP") - предлагаемый IP
  - siaddr - IP DHCP сервера
  - Опция 53: DHCP Message Type = 2 (Offer)
  - Опция 51: IP Address Lease Time
  - Опция 1: Subnet Mask
  - Опция 3: Router (шлюз)
  - Опция 6: DNS Servers
  - И другие запрошенные опции

DHCP Request:
  broadcast (255.255.255.255) - важно!
  Тот же xid.

  Содержит:
  - Опция 53: DHCP Message Type = 3 (Request)
  - Опция 54: Server Identifier - IP сервера которого выбрал клиент
  - Опция 50: Requested IP Address - какой IP хочет клиент

DHCP ACK:
  Содержит:
  - Опция 53: DHCP Message Type = 5 (ACK)
  - yiaddr - подтверждённый IP
  - Все параметры сети (маска, шлюз, DNS и т.д.)
  - Точное время аренды (Lease Time)

DHCP NACK (Negative Acknowledgement):
  Опция 53: DHCP Message Type = 6 (NACK)
  Отправляется если:
  - Запрошенный IP уже занят
  - Клиент в неправильной сети (VLAN)
  - IP адрес просрочен
  Клиент начинает DORA заново.
```

### Продление аренды (Lease Renewal)

```
Аренда (lease) - временное владение IP-адресом.
Клиент должен продлять аренду до истечения.

Три временных точки:
  T1 = 50% от Lease Time → Renewal time
       Клиент пробует продлить unicast'ом к серверу.

  T2 = 87.5% от Lease Time → Rebinding time
       Если T1 не удался → broadcast Request (ищет любой DHCP сервер).

  T3 = 100% от Lease Time → Expiration
       Аренда истекла. Клиент должен прекратить использовать IP.
       Начинает DORA заново.

Пример (Lease Time = 24 часа = 86400 сек):
  T1 = 43200 сек (12 часов) → Renewal
  T2 = 75600 сек (21 час)   → Rebinding
  T3 = 86400 сек (24 часа)  → Expiration

Продление (Renewal) через unicast:
  Клиент           DHCP Сервер
  │──── Request ──────────────►│  unicast к серверу (уже есть IP)
  │◄─── ACK ───────────────────│  новый Lease Time

Если сервер недоступен при T2:
  Клиент           Любой DHCP Сервер
  │──── Request ──────────────►│  broadcast
  │◄─── ACK или NACK ──────────│
```

### DHCP Release и Decline

```
DHCP Release:
  Клиент добровольно освобождает IP-адрес.
  Unicast к серверу.
  Опция 53: Message Type = 7 (Release)

  Когда:
  - Нормальное выключение ОС
  - Команда: dhclient -r (Linux) / ipconfig /release (Windows)

  Важно: сервер не обязан отзывать аренду мгновенно.
  Некоторые серверы помечают адрес как "доступен", другие - ждут истечения.

DHCP Decline:
  Клиент обнаружил что предложенный IP уже используется в сети.
  Клиент делает ARP probe перед использованием адреса (RFC 2131).
  Если ARP ответил - значит IP занят → Decline.
  Опция 53: Message Type = 4 (Decline)

  После Decline:
  - Клиент ждёт 10 секунд и начинает DORA заново
  - Сервер помечает адрес как конфликтный
  - Администратор должен разобраться с конфликтом

DHCP Inform:
  Клиент уже имеет статический IP, но хочет получить другие параметры (DNS, шлюз).
  Unicast Request с уже известным IP.
  Опция 53: Message Type = 8 (Inform)
  Сервер отвечает ACK с запрошенными опциями (без yiaddr - IP не выдаётся).
```

---

## DHCP опции

### Структура DHCP пакета

```
DHCP работает поверх BOOTP (Bootstrap Protocol, RFC 951).
Унаследовал базовую структуру пакета.

Поля DHCP пакета:
  op     (1 байт):  1=запрос (клиент→сервер), 2=ответ (сервер→клиент)
  htype  (1 байт):  тип HW адреса (1=Ethernet)
  hlen   (1 байт):  длина HW адреса (6 для MAC)
  hops   (1 байт):  счётчик relay agent хопов (0 от клиента)
  xid    (4 байта): transaction ID (случайное число)
  secs   (2 байта): секунды с начала процесса получения адреса
  flags  (2 байта): бит broadcast (B) - ответ должен быть broadcast
  ciaddr (4 байта): client IP (заполняет если уже имеет IP - при Renewal)
  yiaddr (4 байта): "your IP" - IP предлагаемый клиенту (в Offer/ACK)
  siaddr (4 байта): server IP - IP следующего сервера (TFTP для PXE)
  giaddr (4 байта): gateway IP - IP relay agent (заполняется relay agent)
  chaddr (16 байт): client HW address (MAC)
  sname  (64 байта): имя сервера (необязательно)
  file   (128 байт): имя boot файла (для PXE)
  options (переменная): опции DHCP (начинаются с magic cookie 99.130.83.99)
```

### Основные DHCP опции

```
Формат опции: Code (1Б) + Length (1Б) + Value (Length байт)
Исключение: опция 0 (Pad) и опция 255 (End) - только 1 байт.

Код  Название                      Описание
────────────────────────────────────────────────────────────────
  1  Subnet Mask                   Маска подсети (4 байта)
  2  Time Offset                   Смещение от UTC
  3  Router                        IP шлюза (список, по 4 байта)
  4  Time Server                   Time сервер (устаревший)
  5  Name Server                   IEN-116 Name Server (устаревший)
  6  Domain Name Server            IP DNS серверов (список)
  7  Log Server                    IP syslog сервера
 12  Host Name                     Имя хоста клиента
 15  Domain Name                   DNS domain (например company.local)
 26  Interface MTU                 MTU для интерфейса
 28  Broadcast Address             Broadcast адрес
 33  Static Route                  Статические маршруты (устаревший формат)
 42  NTP Servers                   IP NTP серверов
 43  Vendor Specific Information   Опции специфичные для вендора
 44  NetBIOS Name Server           WINS сервер
 50  Requested IP Address          IP запрошенный клиентом (в Request)
 51  IP Address Lease Time         Время аренды (в секундах)
 52  Option Overload               Использовать sname/file поля для опций
 53  DHCP Message Type             Тип DHCP сообщения (1-8)
 54  Server Identifier             IP DHCP сервера
 55  Parameter Request List        Список запрашиваемых опций
 56  Message                       Текст ошибки (в NACK)
 57  Maximum DHCP Message Size     Максимальный размер DHCP сообщения
 58  Renewal (T1) Time Value       Время продления (50% lease по умолчанию)
 59  Rebinding (T2) Time Value     Время перепривязки (87.5% lease)
 60  Vendor Class Identifier       Идентификатор класса вендора клиента
 61  Client Identifier             Уникальный ID клиента (обычно тип+MAC)
 66  TFTP Server Name              Имя TFTP сервера (для PXE)
 67  Bootfile Name                 Имя boot файла (для PXE)
 77  User Class                    Класс пользователя
 82  Relay Agent Information       Информация от relay agent (sub-опции)
119  Domain Search                 Список DNS search domains
121  Classless Static Route        Статические маршруты (RFC 3442, современный)
249  Microsoft Classless Route     Microsoft версия опции 121
252  WPAD                          URL для Web Proxy Auto-Discovery
255  End                           Конец списка опций
```

### Опция 53 - DHCP Message Type

```
Все возможные значения:
  1 - DHCPDISCOVER  (клиент ищет сервер)
  2 - DHCPOFFER     (сервер предлагает адрес)
  3 - DHCPREQUEST   (клиент запрашивает/продлевает адрес)
  4 - DHCPDECLINE   (клиент отказывается - IP занят)
  5 - DHCPACK       (сервер подтверждает)
  6 - DHCPNAK       (сервер отказывает)
  7 - DHCPRELEASE   (клиент освобождает адрес)
  8 - DHCPINFORM    (клиент запрашивает только опции)
```

### Опция 82 - Relay Agent Information

```
Добавляется DHCP relay agent при пересылке запроса.
Содержит sub-опции с информацией о клиенте.

Sub-опции:
  1 - Circuit ID   - порт/VLAN с которого пришёл запрос
                     Пример: "GigabitEthernet0/1" или "VLAN10:Gi0/1"
  2 - Remote ID    - MAC/IP relay agent
  5 - Link Selection - IP подсети откуда пришёл клиент
                       (когда giaddr в другой подсети)
  6 - Subscriber ID - идентификатор подписчика (у провайдеров)

Применение:
  DHCP сервер видит Circuit ID и выдаёт IP из нужного пула.
  Например: клиент с порта VLAN20 → пул 192.168.20.0/24.
  Безопасность: ISP привязывает IP к конкретному порту/абоненту.
```

### Опция 121 - Classless Static Routes

```
Позволяет DHCP серверу передать клиенту статические маршруты.
Формат: destination (prefix + network) + gateway (4 байта).

Пример:
  Маршрут 10.0.0.0/8 через 192.168.1.254
  Маршрут 172.16.0.0/12 через 192.168.1.254

Кодирование в опции 121:
  8 + 10.0.0.0 + 192.168.1.254      (prefix /8, сеть 10.0.0.0)
  12 + 172.16.0.0 + 192.168.1.254   (prefix /12, сеть 172.16.0.0)

Опция 33 (старая) не поддерживает classless адресацию.
Опция 121 заменяет опцию 3 (Router) если присутствует в ответе!
Важно для VPN клиентов - split tunneling через DHCP опции.
```

---

## DHCP Relay Agent

### Зачем нужен Relay Agent

```
DHCP Discover - broadcast пакет.
Broadcast не выходит за пределы L2 сегмента (VLAN).
DHCP сервер обычно один на всю сеть.

Проблема:
  Клиент в VLAN 20 (192.168.20.0/24) делает broadcast.
  DHCP сервер в VLAN 1 (192.168.1.0/24) не получает его.

Решение: DHCP Relay Agent (ip helper-address на Cisco).
  Relay agent перехватывает DHCP broadcast.
  Переупаковывает его в unicast и пересылает DHCP серверу.
  Заполняет giaddr (gateway IP) своим IP.
  Добавляет опцию 82 (информация о клиенте).

  Клиент → [broadcast] → Relay Agent → [unicast] → DHCP Сервер
  DHCP Сервер → [unicast] → Relay Agent → [unicast/broadcast] → Клиент

giaddr (Gateway IP Address):
  Relay agent вставляет свой IP в это поле.
  DHCP сервер смотрит giaddr → выбирает пул для этой подсети.
  DHCP сервер отвечает на giaddr (не напрямую клиенту).
```

### Настройка Relay Agent

```
# Cisco IOS - на интерфейсе смотрящем в сторону клиентов
interface Vlan20
  ip address 192.168.20.1 255.255.255.0
  ip helper-address 192.168.1.100    (IP DHCP сервера)

# Можно несколько серверов (для резервирования)
interface Vlan20
  ip helper-address 192.168.1.100
  ip helper-address 192.168.1.101

# ip helper-address пересылает несколько протоколов по умолчанию:
# UDP 37  (Time)
# UDP 49  (TACACS)
# UDP 53  (DNS)
# UDP 67  (DHCP/BOOTP)
# UDP 68  (DHCP/BOOTP)
# UDP 69  (TFTP)
# UDP 137 (NetBIOS Name)
# UDP 138 (NetBIOS Datagram)

# Ограничить только DHCP:
no ip forward-protocol udp 37
no ip forward-protocol udp 49
no ip forward-protocol udp 69
no ip forward-protocol udp 137
no ip forward-protocol udp 138

# Linux (isc-dhcp-relay)
apt install isc-dhcp-relay
# /etc/default/isc-dhcp-relay:
# SERVERS="192.168.1.100"
# INTERFACES="eth1 eth2"   (интерфейсы с клиентами)
# OPTIONS=""
systemctl restart isc-dhcp-relay

# Linux (dhcrelay из пакета dhcp)
dhcrelay -i eth1 -i eth2 192.168.1.100

# Проверить relay на Cisco
show ip helper-address
debug ip dhcp server events   (осторожно на production!)
```

---

## Настройка DHCP сервера

### ISC DHCP Server (Linux, классический)

```
# Установка
apt install isc-dhcp-server

# Основной конфиг: /etc/dhcp/dhcpd.conf

# Глобальные параметры
default-lease-time 86400;         # 24 часа
max-lease-time 172800;             # 48 часов (максимум)
authoritative;                     # сервер авторитетен (шлёт NACK)
log-facility local7;               # syslog facility

# DNS обновления (DDNS)
ddns-update-style none;            # отключить DDNS

# Опции для всех клиентов
option domain-name "company.local";
option domain-name-servers 192.168.1.10, 192.168.1.11;
option ntp-servers 192.168.1.12;

# Подсеть
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.50 192.168.1.200;    # пул адресов
    option routers 192.168.1.1;           # шлюз
    option subnet-mask 255.255.255.0;
    option broadcast-address 192.168.1.255;
    default-lease-time 86400;
    max-lease-time 172800;
}

# Резервирование (фиксированный IP по MAC)
host printer-office {
    hardware ethernet 00:11:22:33:44:55;
    fixed-address 192.168.1.20;
    option host-name "printer-office";
}

host server-web {
    hardware ethernet aa:bb:cc:dd:ee:ff;
    fixed-address 192.168.1.100;
    # Индивидуальные опции для этого хоста
    default-lease-time 2592000;   # 30 дней для серверов
}

# Несколько подсетей (для relay)
subnet 192.168.10.0 netmask 255.255.255.0 {
    range 192.168.10.50 192.168.10.200;
    option routers 192.168.10.1;
    option domain-name-servers 192.168.1.10;
}

subnet 192.168.20.0 netmask 255.255.255.0 {
    range 192.168.20.50 192.168.20.200;
    option routers 192.168.20.1;
    option domain-name-servers 192.168.1.10;
}

# Передача статических маршрутов (опция 121)
option classless-static-routes code 121 = array of unsigned integer 8;
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.50 192.168.1.200;
    option routers 192.168.1.1;
    # Маршрут 10.0.0.0/8 через 192.168.1.254
    option classless-static-routes 8, 10, 192.168.1.254,
                                    0, 192.168.1.1;   # default route
}
```

```
# Управление ISC DHCP
systemctl start isc-dhcp-server
systemctl status isc-dhcp-server

# Проверить конфиг
dhcpd -t -cf /etc/dhcp/dhcpd.conf

# Посмотреть выданные адреса
cat /var/lib/dhcp/dhcpd.leases
# lease 192.168.1.50 {
#   starts 1 2026/04/27 10:00:00;
#   ends   2 2026/04/28 10:00:00;
#   binding state active;
#   hardware ethernet 00:1a:2b:3c:4d:5e;
#   client-hostname "laptop-user";
# }

# Количество аренд
grep "^lease" /var/lib/dhcp/dhcpd.leases | wc -l

# Логи
journalctl -u isc-dhcp-server -f
tail -f /var/log/syslog | grep dhcp
```

### Kea DHCP (современная замена ISC DHCP)

```
ISC DHCP (dhcpd) объявлен устаревшим в 2022.
Kea - современная замена от ISC, активно развивается.

# Установка
apt install kea-dhcp4-server

# Конфиг: /etc/kea/kea-dhcp4.conf (формат JSON)
{
  "Dhcp4": {
    "interfaces-config": {
      "interfaces": ["eth0"]
    },
    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    "valid-lifetime": 86400,
    "renew-timer": 43200,
    "rebind-timer": 75600,
    "subnet4": [
      {
        "subnet": "192.168.1.0/24",
        "pools": [{ "pool": "192.168.1.50 - 192.168.1.200" }],
        "option-data": [
          { "name": "routers", "data": "192.168.1.1" },
          { "name": "domain-name-servers", "data": "8.8.8.8, 8.8.4.4" }
        ],
        "reservations": [
          {
            "hw-address": "00:11:22:33:44:55",
            "ip-address": "192.168.1.20",
            "hostname": "printer"
          }
        ]
      }
    ]
  }
}
```

### DHCP на Cisco IOS (встроенный сервер)

```
# Исключить адреса из пула (шлюзы, серверы)
ip dhcp excluded-address 192.168.1.1 192.168.1.19
ip dhcp excluded-address 192.168.1.200 192.168.1.254

# Создать пул
ip dhcp pool LAN
  network 192.168.1.0 255.255.255.0
  default-router 192.168.1.1
  dns-server 8.8.8.8 8.8.4.4
  domain-name company.local
  lease 1 0 0                    (дни часы минуты = 1 день)
  ntp-server 192.168.1.12

# Резервирование по MAC
ip dhcp pool PC-ADMIN
  host 192.168.1.10 255.255.255.0
  hardware-address 00:1a:2b:3c:4d:5e
  client-name admin-pc

# Проверить
show ip dhcp pool
show ip dhcp binding
# IP address       Client-ID/          Lease expiration        Type
#                  Hardware address
# 192.168.1.50     0100.1a2b.3c4d.5e   Apr 28 2026 10:00 AM   Automatic
# 192.168.1.10     0100.1a2b.3c4d.5f   Infinite                Manual

show ip dhcp conflict             (конфликты адресов)
show ip dhcp statistics           (статистика)

# Очистить аренды
clear ip dhcp binding *
clear ip dhcp binding 192.168.1.50

# Отключить DHCP сервер
no service dhcp
```

---

## DHCP клиент

### Linux - dhclient

```
# Запросить адрес (dhclient - традиционный)
dhclient eth0           # получить адрес
dhclient -r eth0        # release (освободить)
dhclient -v eth0        # verbose (подробный вывод)

# Принудительно обновить
dhclient -r eth0 && dhclient eth0

# Файлы dhclient
/etc/dhcp/dhclient.conf         # конфиг
/var/lib/dhcp/dhclient.leases   # история аренд

# Посмотреть текущую аренду
cat /var/lib/dhcp/dhclient.leases

# dhclient.conf - запрос дополнительных опций
request subnet-mask, broadcast-address, routers,
        domain-name, domain-name-servers,
        ntp-servers, classless-static-routes;

# Задать hostname который клиент шлёт серверу
send host-name "my-laptop";
```

### Linux - systemd-networkd / NetworkManager

```
# NetworkManager - статус
nmcli device status
nmcli connection show

# Запросить/обновить DHCP
nmcli device reapply eth0
# или
nmcli connection up "Wired connection 1"

# Посмотреть полученные параметры
nmcli device show eth0
# GENERAL.DEVICE:   eth0
# IP4.ADDRESS[1]:   192.168.1.50/24
# IP4.GATEWAY:      192.168.1.1
# IP4.DNS[1]:       8.8.8.8

# systemd-networkd
# /etc/systemd/network/20-wired.network
# [Match]
# Name=eth0
#
# [Network]
# DHCP=yes
#
# [DHCP]
# SendHostname=yes
# UseDNS=yes
# UseNTP=yes

systemctl restart systemd-networkd

# Посмотреть аренду
networkctl status eth0
```

### Windows

```
# Получить/обновить адрес
ipconfig /release           # освободить
ipconfig /renew             # запросить новый

# Посмотреть детали DHCP
ipconfig /all
# Ethernet adapter Local Area Connection:
#    DHCP Enabled. . . . . . . . . . : Yes
#    Autoconfiguration Enabled . . . : Yes
#    IPv4 Address. . . . . . . . . . : 192.168.1.50
#    Subnet Mask . . . . . . . . . . : 255.255.255.0
#    Lease Obtained. . . . . . . . . : 27 апреля 2026 г. 10:00:00
#    Lease Expires . . . . . . . . . : 28 апреля 2026 г. 10:00:00
#    Default Gateway . . . . . . . . : 192.168.1.1
#    DHCP Server . . . . . . . . . . : 192.168.1.1
#    DNS Servers . . . . . . . . . . : 8.8.8.8

# PowerShell
Get-NetIPConfiguration
Get-DhcpServerInDC                          (список DHCP серверов в AD)
```

---

## DHCP Snooping

### Что такое DHCP Snooping

```
DHCP Snooping - функция безопасности на управляемых коммутаторах.
Защищает от Rogue DHCP серверов (подставных DHCP серверов).

Атака Rogue DHCP:
  Злоумышленник поднимает DHCP сервер в сети.
  Клиенты получают адреса от него.
  Rogue сервер выдаёт:
    - Свой IP как шлюз → MITM атака (весь трафик через злоумышленника)
    - Свой IP как DNS → DNS spoofing
    - Короткое время аренды → постоянно обновляются у него

DHCP Snooping:
  Порты делятся на Trusted и Untrusted.
  Trusted: uplink к настоящему DHCP серверу.
  Untrusted: порты к клиентам (по умолчанию все).

  На Untrusted портах:
  - DHCP Offer/ACK/NACK → отбрасываются (только DHCP сервер может их слать)
  - DHCP Release с другого IP чем в snooping таблице → отбрасывается
  - Ограничение rate: max N DHCP пакетов в секунду (защита от flood)

  На Trusted портах:
  - Весь DHCP трафик пропускается.

DHCP Snooping Binding Table:
  Коммутатор строит таблицу: MAC → IP → порт → VLAN → lease time.
  Используется DAI (Dynamic ARP Inspection) и IP Source Guard.
```

### Настройка DHCP Snooping

```
# Cisco - включить DHCP Snooping
ip dhcp snooping                           # включить глобально
ip dhcp snooping vlan 10,20,30             # для конкретных VLAN

# Доверять только uplink порту (к DHCP серверу)
interface GigabitEthernet0/24
  ip dhcp snooping trust                   # uplink - trusted

# Ограничить rate на клиентских портах
interface GigabitEthernet0/1
  ip dhcp snooping limit rate 10           # max 10 пакетов/сек

# Не добавлять опцию 82 (иногда мешает)
no ip dhcp snooping information option

# Проверить
show ip dhcp snooping
# DHCP snooping is configured on following VLANs: 10,20,30
# Insertion of option 82 is enabled
# Interface           Trusted   Rate limit (pps)
# GigabitEthernet0/1  no        10
# GigabitEthernet0/24 yes       unlimited

show ip dhcp snooping binding
# MacAddress         IpAddress    Lease(sec) Type       VLAN Interface
# 00:1a:2b:3c:4d:5e 192.168.1.50 86313      dhcp-snooping 10 Gi0/1

# Экспорт binding table (для стойкости после перезагрузки)
ip dhcp snooping database flash:/dhcp-snooping.db
ip dhcp snooping database write-delay 30   # записывать каждые 30 сек
```

---

## DHCP и PXE (сетевая загрузка)

```
PXE (Preboot eXecution Environment) - загрузка ОС по сети.
DHCP используется для передачи адреса TFTP сервера и имени boot файла.

Опции для PXE:
  Опция 66 (tftp-server-name): IP или имя TFTP сервера
  Опция 67 (bootfile-name): имя файла для загрузки
  siaddr: IP TFTP сервера (поле в DHCP пакете)

ISC DHCP конфиг для PXE:
  subnet 192.168.1.0 netmask 255.255.255.0 {
      range 192.168.1.50 192.168.1.200;
      option routers 192.168.1.1;
      next-server 192.168.1.5;             # IP TFTP сервера (siaddr)
      filename "pxelinux.0";               # boot файл (BIOS)

      # Для UEFI клиентов (разные файлы для BIOS и UEFI)
      if option vendor-class-identifier = "PXEClient:Arch:00007" {
          filename "bootx64.efi";          # UEFI 64-bit
      } elsif option vendor-class-identifier = "PXEClient:Arch:00000" {
          filename "pxelinux.0";           # Legacy BIOS
      }
  }

Cisco IOS:
  ip dhcp pool PXE-POOL
    network 192.168.1.0 255.255.255.0
    default-router 192.168.1.1
    next-server 192.168.1.5
    bootfile pxelinux.0
```

---

## APIPA - автоконфигурация без DHCP

```
APIPA (Automatic Private IP Addressing) - RFC 3927.
Когда DHCP сервер недоступен, хост назначает себе адрес из 169.254.0.0/16.

Процесс:
  1. Клиент не получил ответ на DHCP Discover.
  2. Выбирает случайный адрес из 169.254.1.0 - 169.254.254.255.
  3. Проверяет через ARP probe что адрес не занят.
  4. Назначает себе адрес с маской 255.255.0.0.
  5. Продолжает периодически пробовать DHCP.

Применение:
  - Малые сети без DHCP сервера (peer-to-peer)
  - Диагностика: увидел 169.254.x.x → DHCP не работает

Диагностика на Windows:
  ipconfig /all → если адрес 169.254.x.x → DHCP не ответил
  
  Что проверить:
    - Физическое подключение (кабель, Wi-Fi)
    - DHCP сервер работает?
    - DHCP пул не исчерпан?
    - DHCP Snooping не блокирует?
    - Firewall разрешает UDP 67/68?

IPv6 аналог - SLAAC (Stateless Address Autoconfiguration, RFC 4862):
  Хост генерирует адрес из fe80::/10 (link-local) автоматически.
  Использует Router Advertisement (RA) для получения префикса.
  Не требует DHCP (хотя DHCPv6 тоже существует).
```

---

## Диагностика DHCP

### Клиент не получает адрес

```
Шаг 1: Захватить DHCP трафик
  tcpdump -i eth0 -n port 67 or port 68
  # Видим ли DHCPDISCOVER?
  # Видим ли DHCPOFFER?
  # Если Discover есть но Offer нет → сервер не отвечает

  # Подробный захват в файл для Wireshark
  tcpdump -i eth0 -w /tmp/dhcp.pcap port 67 or port 68

Шаг 2: Принудительно запросить адрес с verbose
  dhclient -v eth0
  # Watching for response...
  # Bound to *:68
  # Listening on LPF/eth0/00:1a:2b:3c:4d:5e
  # Sending on   LPF/eth0/00:1a:2b:3c:4d:5e
  # DHCPDISCOVER on eth0 to 255.255.255.255 port 67
  # DHCPOFFER from 192.168.1.1
  # DHCPREQUEST on eth0 to 255.255.255.255 port 67
  # DHCPACK from 192.168.1.1

Шаг 3: Проверить сервер
  # ISC DHCP - логи
  journalctl -u isc-dhcp-server
  # DHCPDISCOVER from 00:1a:2b:3c:4d:5e via eth0
  # DHCPOFFER on 192.168.1.50 to 00:1a:2b:3c:4d:5e via eth0
  # DHCPREQUEST for 192.168.1.50 from 00:1a:2b:3c:4d:5e via eth0
  # DHCPACK on 192.168.1.50 to 00:1a:2b:3c:4d:5e via eth0

  # Cisco
  debug ip dhcp server events
  debug ip dhcp server packet

Шаг 4: Пул исчерпан?
  # ISC DHCP
  grep "^lease" /var/lib/dhcp/dhcpd.leases | wc -l
  # Сравнить с размером пула

  # Cisco
  show ip dhcp pool
  # Utilization mark (high/low): 100/0
  # Subnet size (first/next): 0/0
  # Total addresses: 151
  # Leased addresses: 151  ← пул исчерпан!
  # Available addresses: 0

Шаг 5: Конфликт адресов
  # Cisco
  show ip dhcp conflict
  # IP address        Detection method   Detection time
  # 192.168.1.50      Ping               Apr 27 2026 10:00 AM
  # clear ip dhcp conflict *  ← очистить и пересмотреть

Шаг 6: DHCP Snooping блокирует?
  show ip dhcp snooping statistics
  # Вывод: DroppedUntrustedPorts (если много - проблема в snooping)
```

### Проверка опций DHCP

```
# Linux - посмотреть что получили
ip addr show eth0      # IP и маска
ip route show          # маршруты (шлюз)
cat /etc/resolv.conf   # DNS
cat /run/systemd/resolve/resolv.conf  (при systemd-resolved)

# Полная информация через nmcli
nmcli device show eth0

# Wireshark фильтры
bootp                           # весь DHCP трафик
bootp.option.type == 53         # по типу сообщения
bootp.option.dhcp == 5          # только ACK
bootp.hw.mac_addr == 00:1a:2b:3c:4d:5e  # конкретный клиент

# Ручная проверка DHCP сервера (dhcping)
apt install dhcping
dhcping -s 192.168.1.1 -h 00:1a:2b:3c:4d:5e

# nmap для обнаружения DHCP серверов
nmap --script broadcast-dhcp-discover
# Starting Nmap ...
# Host: 192.168.1.1
#   DHCP Message Type: DHCPOFFER
#   Server Identifier: 192.168.1.1
#   IP Offered: 192.168.1.X
#   Subnet Mask: 255.255.255.0
#   Router: 192.168.1.1
#   ...
```

---

## Шпаргалка

```
DORA процесс:
  Discover  → broadcast от клиента (src 0.0.0.0, dst 255.255.255.255)
  Offer     → от сервера с предложением IP
  Request   → broadcast от клиента (подтверждение выбора)
  ACK       → от сервера (подтверждение)

Порты:
  UDP 67 - DHCP сервер
  UDP 68 - DHCP клиент

Ключевые опции:
  1   - Subnet Mask
  3   - Router (шлюз)
  6   - DNS Servers
  51  - Lease Time (секунды)
  53  - Message Type (1=Discover, 2=Offer, 3=Request, 5=ACK, 6=NACK)
  54  - Server Identifier
  55  - Parameter Request List
  58  - T1 Renewal Time (50% от Lease)
  59  - T2 Rebinding Time (87.5% от Lease)
  66  - TFTP Server (PXE)
  67  - Boot File (PXE)
  82  - Relay Agent Info (Circuit ID, Remote ID)
  121 - Classless Static Routes

Таймеры аренды:
  T1 = 50%    (продление unicast к серверу)
  T2 = 87.5%  (продление broadcast к любому серверу)
  T3 = 100%   (истечение - начало DORA заново)

DHCP Snooping:
  Защита от Rogue DHCP серверов.
  Trusted порты: uplinks к серверу.
  Untrusted порты: клиентские (DHCP Offer отбрасывается).

Полезные команды (Linux):
  dhclient -v eth0           запросить адрес verbose
  dhclient -r eth0           освободить адрес
  tcpdump -n port 67 or 68   захват DHCP трафика
  journalctl -u isc-dhcp-server  логи сервера
  cat /var/lib/dhcp/dhcpd.leases таблица аренд

Полезные команды (Cisco):
  show ip dhcp binding           выданные адреса
  show ip dhcp pool              использование пула
  show ip dhcp conflict          конфликты
  show ip dhcp snooping binding  DHCP snooping таблица
  clear ip dhcp binding *        сбросить все аренды
  debug ip dhcp server events    debug (осторожно!)

APIPA:
  169.254.0.0/16 → DHCP сервер недоступен
  IPv6 аналог: fe80::/10 (link-local, SLAAC)
```

---

## Ссылки

- [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131) - DHCP (Dynamic Host Configuration Protocol), 1997
- [RFC 2132](https://www.rfc-editor.org/rfc/rfc2132) - DHCP Options and BOOTP Vendor Extensions (полный список опций)
- [RFC 3442](https://www.rfc-editor.org/rfc/rfc3442) - Classless Static Route Option (опция 121)
- [RFC 3046](https://www.rfc-editor.org/rfc/rfc3046) - DHCP Relay Agent Information Option (опция 82)
- [RFC 3927](https://www.rfc-editor.org/rfc/rfc3927) - Dynamic Configuration of IPv4 Link-Local Addresses (APIPA)
- [RFC 8415](https://www.rfc-editor.org/rfc/rfc8415) - DHCPv6
- [Kea DHCP Documentation](https://kea.readthedocs.io) - современный DHCP сервер
- [ISC DHCP (dhcpd)](https://www.isc.org/dhcp/) - классический DHCP сервер (устаревший)
