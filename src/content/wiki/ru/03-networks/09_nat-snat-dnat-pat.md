---
title: "NAT - SNAT, DNAT, PAT"
date: "2026-04-26"
---

NAT (Network Address Translation) - механизм преобразования IP-адресов при прохождении пакетов через маршрутизатор или файрвол. Позволяет множеству устройств с приватными адресами выходить в интернет через один публичный IP, скрывать внутреннюю топологию сети и публиковать внутренние сервисы наружу.

---

## Основы NAT

### Зачем нужен NAT

```
Две главные причины:

1. Нехватка IPv4 адресов:
   Всего ~4.3 миллиарда IPv4 адресов.
   Все давно распределены.
   NAT позволяет тысячам устройств использовать один публичный IP.

2. Безопасность и изоляция:
   Внутренние адреса не маршрутизируются в интернете.
   Хосты снаружи не могут напрямую инициировать соединение с внутренними хостами
   (если явно не настроен DNAT/Port Forwarding).

Приватные адреса (RFC 1918) - не маршрутизируются в интернете:
  10.0.0.0/8       (10.0.0.0 - 10.255.255.255)
  172.16.0.0/12    (172.16.0.0 - 172.31.255.255)
  192.168.0.0/16   (192.168.0.0 - 192.168.255.255)

  Также:
  127.0.0.0/8      - loopback
  169.254.0.0/16   - link-local (APIPA, автоконфигурация)
  100.64.0.0/10    - shared address space (CGNAT, RFC 6598)
```

### Терминология NAT

```
Inside Local:
  Приватный IP внутреннего хоста (как видит сам хост).
  Пример: 192.168.1.10

Inside Global:
  Публичный IP внутреннего хоста (как видит его интернет).
  Пример: 203.0.113.5

Outside Local:
  IP внешнего хоста как видит его внутренняя сеть.
  Обычно совпадает с Outside Global (если нет двойного NAT).

Outside Global:
  Реальный IP внешнего хоста (как видит его интернет).
  Пример: 8.8.8.8

Таблица NAT (translation table):
  Хранит маппинг: Inside Local ↔ Inside Global (+ порты для PAT).
  Создаётся динамически при установке соединения.
  Записи устаревают по таймауту.
```

### Типы NAT

```
Static NAT (1:1):
  Один приватный IP → один публичный IP.
  Постоянное соответствие, не меняется.
  Используется для серверов которым нужен постоянный публичный IP.

Dynamic NAT (many:many):
  Пул приватных IP → пул публичных IP.
  Соответствие назначается динамически из пула.
  Если все публичные IP заняты → новые соединения отбрасываются.
  Редко используется сегодня.

PAT / NAT Overload (many:1):
  Много приватных IP → один публичный IP.
  Различие по порту источника (port number).
  Самый распространённый тип (домашние роутеры, офисы).
  Также называется: IP Masquerading (Linux), NAT Overload (Cisco).

SNAT (Source NAT):
  Изменяется IP источника (src IP).
  Используется когда внутренние хосты выходят в интернет.
  Тип: Static NAT или PAT.

DNAT (Destination NAT):
  Изменяется IP получателя (dst IP).
  Используется для публикации внутренних сервисов.
  Также называется: Port Forwarding, Virtual Server.
```

---

## SNAT - Source NAT

### Как работает SNAT

```
Внутренний хост инициирует соединение во внешний мир.
NAT-устройство заменяет src IP (и порт при PAT) на свой публичный IP.

Без NAT (не работает - приватный IP не маршрутизируется):
  Хост (192.168.1.10) → пакет с src=192.168.1.10 → интернет
  Ответ не придёт (некуда - 192.168.1.10 не публичный).

С SNAT:
  Хост (192.168.1.10) отправляет пакет:
    src IP: 192.168.1.10, dst IP: 8.8.8.8

  NAT-устройство получает пакет, создаёт запись в таблице:
    192.168.1.10:52341 ↔ 203.0.113.5:52341 (или другой порт при PAT)

  NAT-устройство изменяет пакет:
    src IP: 203.0.113.5  (заменили!)
    dst IP: 8.8.8.8      (не изменилось)

  8.8.8.8 отвечает:
    src IP: 8.8.8.8, dst IP: 203.0.113.5

  NAT-устройство получает ответ, смотрит таблицу:
    dst 203.0.113.5:52341 → 192.168.1.10:52341

  NAT-устройство изменяет ответный пакет:
    src IP: 8.8.8.8      (не изменилось)
    dst IP: 192.168.1.10 (заменили обратно!)

  Хост получает ответ и "не знает" о NAT.
```

### SNAT на Linux (iptables)

```
# SNAT - заменить src IP на конкретный адрес
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
  -j SNAT --to-source 203.0.113.5

# MASQUERADE - автоматически использовать IP интерфейса
# (удобно если публичный IP динамический - DHCP, PPPoE)
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
  -j MASQUERADE

# Разрешить форвардинг пакетов (обязательно!)
echo 1 > /proc/sys/net/ipv4/ip_forward
# Постоянно:
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

# Посмотреть правила NAT
iptables -t nat -L -n -v
# Chain POSTROUTING (policy ACCEPT 0 packets, 0 bytes)
# target     prot opt source          destination
# MASQUERADE all  --  192.168.1.0/24  0.0.0.0/0

# Посмотреть таблицу соединений (conntrack)
conntrack -L
# tcp  6  431999  ESTABLISHED src=192.168.1.10 dst=8.8.8.8 sport=52341 dport=53
#   [UNREPLIED] src=8.8.8.8 dst=203.0.113.5 sport=53 dport=52341
#   [ASSURED] mark=0 ...

conntrack -L --src 192.168.1.10   (фильтрация по src)
conntrack -D --src 192.168.1.10   (удалить запись)

# nftables (современная замена iptables)
nft add table nat
nft add chain nat postrouting { type nat hook postrouting priority 100 \; }
nft add rule nat postrouting ip saddr 192.168.1.0/24 oif eth0 masquerade
```

### SNAT на Linux (nftables, современный способ)

```
# /etc/nftables.conf
table ip nat {
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;

        # MASQUERADE для динамического IP
        ip saddr 192.168.1.0/24 oif "eth0" masquerade

        # Или SNAT для статического IP
        ip saddr 192.168.1.0/24 oif "eth0" snat to 203.0.113.5
    }
}

# Применить
nft -f /etc/nftables.conf

# Проверить
nft list table ip nat
nft list ruleset
```

### SNAT на Cisco (IOS)

```
# Static NAT (1:1) - один IP к одному IP
ip nat inside source static 192.168.1.10 203.0.113.5

# Dynamic NAT с пулом
ip nat pool MY-POOL 203.0.113.10 203.0.113.20 netmask 255.255.255.0
ip access-list standard NAT-INSIDE
  permit 192.168.1.0 0.0.0.255
ip nat inside source list NAT-INSIDE pool MY-POOL

# NAT Overload (PAT) - все через один IP
ip access-list standard NAT-INSIDE
  permit 192.168.1.0 0.0.0.255
ip nat inside source list NAT-INSIDE interface GigabitEthernet0/0 overload

# Настроить интерфейсы
interface GigabitEthernet0/0
  ip nat outside         (смотрит в интернет)
interface GigabitEthernet0/1
  ip nat inside          (смотрит во внутреннюю сеть)

# Проверить
show ip nat translations
# Pro Inside global      Inside local       Outside local      Outside global
# tcp 203.0.113.5:1024   192.168.1.10:52341 8.8.8.8:80        8.8.8.8:80
# tcp 203.0.113.5:1025   192.168.1.20:43210 1.1.1.1:443       1.1.1.1:443

show ip nat statistics
# Total active translations: 5 (0 static, 5 dynamic; 5 extended)
# Outside interfaces: GigabitEthernet0/0
# Inside interfaces: GigabitEthernet0/1
# Hits: 1523  Misses: 12

# Очистить таблицу NAT
clear ip nat translation *
clear ip nat translation inside 192.168.1.10   (конкретная запись)
```

---

## DNAT - Destination NAT

### Как работает DNAT

```
Внешний хост обращается к публичному IP.
NAT-устройство перенаправляет соединение на внутренний хост.

Задача: опубликовать внутренний веб-сервер (192.168.1.100:80)
        наружу через публичный IP 203.0.113.5:80.

Входящий запрос:
  src IP: 1.2.3.4, dst IP: 203.0.113.5, dst port: 80

NAT-устройство видит правило DNAT:
  dst 203.0.113.5:80 → перенаправить на 192.168.1.100:80

NAT-устройство изменяет пакет:
  src IP: 1.2.3.4       (не изменилось)
  dst IP: 192.168.1.100 (заменили!)
  dst port: 80          (не изменилось, но может быть другим)

Внутренний сервер отвечает:
  src IP: 192.168.1.100, dst IP: 1.2.3.4

NAT-устройство изменяет ответ (обратный SNAT):
  src IP: 203.0.113.5   (заменили обратно!)
  dst IP: 1.2.3.4       (не изменилось)

Внешний хост получает ответ от 203.0.113.5 (не знает о 192.168.1.100).

Важно: DNAT обычно сочетается с обратным SNAT автоматически.
       Файрвол/роутер сам подставляет src IP в ответе.
```

### Port Forwarding (частный случай DNAT)

```
Port Forwarding = DNAT на конкретный порт.

Примеры:
  203.0.113.5:80  → 192.168.1.100:80   (веб-сервер)
  203.0.113.5:443 → 192.168.1.100:443  (HTTPS)
  203.0.113.5:22  → 192.168.1.50:22    (SSH к конкретному серверу)
  203.0.113.5:25  → 192.168.1.200:25   (почтовый сервер)
  203.0.113.5:3389 → 192.168.1.30:3389 (RDP к Windows серверу)

Можно менять порт:
  203.0.113.5:2222 → 192.168.1.50:22
  Снаружи подключаться на порт 2222, внутри попадём на 22.
  Небольшая защита (security through obscurity) от ботов сканирующих 22.
```

### DNAT на Linux (iptables)

```
# DNAT - перенаправить входящие запросы на внутренний сервер
# Трафик на 203.0.113.5:80 → 192.168.1.100:80
iptables -t nat -A PREROUTING -d 203.0.113.5 -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.1.100:80

# DNAT с изменением порта
# Внешний :2222 → внутренний :22
iptables -t nat -A PREROUTING -d 203.0.113.5 -p tcp --dport 2222 \
  -j DNAT --to-destination 192.168.1.50:22

# Также нужно разрешить форвардинг к серверу
iptables -A FORWARD -d 192.168.1.100 -p tcp --dport 80 -j ACCEPT
iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

# DNAT для UDP (например DNS)
iptables -t nat -A PREROUTING -p udp --dport 53 \
  -j DNAT --to-destination 192.168.1.53:53

# Полный пример - публикация веб-сервера
# 1. IP форвардинг
echo 1 > /proc/sys/net/ipv4/ip_forward

# 2. DNAT (входящие → сервер)
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.1.100:80

# 3. MASQUERADE (исходящие → публичный IP)
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# 4. FORWARD разрешить
iptables -A FORWARD -i eth0 -o eth1 -p tcp --dport 80 \
  -d 192.168.1.100 -j ACCEPT
iptables -A FORWARD -i eth1 -o eth0 -m state \
  --state ESTABLISHED,RELATED -j ACCEPT
```

### DNAT на Linux (nftables)

```
# /etc/nftables.conf
table ip nat {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;

        # HTTP на веб-сервер
        iif "eth0" tcp dport 80 dnat to 192.168.1.100:80

        # SSH с изменением порта
        iif "eth0" tcp dport 2222 dnat to 192.168.1.50:22

        # RDP
        iif "eth0" tcp dport 3389 dnat to 192.168.1.30:3389
    }

    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        oif "eth0" masquerade
    }
}
```

### DNAT на Cisco (IOS)

```
# Static DNAT (Port Forwarding)
# Внешний :80 → внутренний 192.168.1.100:80
ip nat inside source static tcp 192.168.1.100 80 interface GigabitEthernet0/0 80

# С другим публичным IP
ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80

# SSH на другой порт
ip nat inside source static tcp 192.168.1.50 22 203.0.113.5 2222

# UDP (например DNS)
ip nat inside source static udp 192.168.1.53 53 203.0.113.5 53

# Проверить
show ip nat translations
# Pro Inside global         Inside local         Outside local  Outside global
# tcp 203.0.113.5:80        192.168.1.100:80     ---            ---
# tcp 203.0.113.5:2222      192.168.1.50:22      ---            ---
```

### Hairpin NAT (NAT Loopback)

```
Проблема:
  Внутренний хост (192.168.1.10) пытается обратиться к своему серверу
  (192.168.1.100) через публичный IP (203.0.113.5).

  Без Hairpin NAT:
    Пакет уходит на 203.0.113.5 → DNAT → возвращается на 192.168.1.100.
    Но ответ от сервера (192.168.1.100) идёт напрямую к 192.168.1.10,
    минуя NAT-устройство.
    Хост ожидал ответ от 203.0.113.5, получает от 192.168.1.100 → разрыв!

  Hairpin NAT решает:
    NAT-устройство видит DNAT запрос изнутри,
    делает дополнительный SNAT: src = внутренний IP NAT-устройства.
    Сервер отвечает на NAT-устройство → оно перенаправляет хосту.
    Всё работает, хотя и неэффективно (трафик идёт через роутер дважды).

Лучшее решение: внутри сети использовать внутренний IP или внутренний DNS.
  Зона split-horizon DNS: для внутренних хостов 203.0.113.5 → 192.168.1.100.

Linux Hairpin NAT:
  iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -d 192.168.1.100 \
    -p tcp --dport 80 -j MASQUERADE

Cisco Hairpin NAT:
  ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80
  (на Cisco это работает автоматически если обе стороны inside)
```

---

## PAT - Port Address Translation

### Как работает PAT

```
PAT (Port Address Translation) = NAT Overload = IP Masquerading.
Много внутренних хостов → один публичный IP.
Различие между сессиями - по портам источника.

Таблица PAT (пример):
┌──────────────────────┬──────────────────────┬──────────────────┐
│   Inside Local       │   Inside Global      │  Outside         │
│   (приватный)        │   (публичный)        │                  │
├──────────────────────┼──────────────────────┼──────────────────┤
│ 192.168.1.10:52341   │ 203.0.113.5:1024     │ 8.8.8.8:53       │
│ 192.168.1.10:52342   │ 203.0.113.5:1025     │ 8.8.8.8:80       │
│ 192.168.1.20:44123   │ 203.0.113.5:1026     │ 1.1.1.1:443      │
│ 192.168.1.30:61234   │ 203.0.113.5:1027     │ 8.8.8.8:53       │
│ 192.168.1.20:44124   │ 203.0.113.5:1028     │ 172.217.16.4:80  │
└──────────────────────┴──────────────────────┴──────────────────┘

Видно: несколько хостов, один публичный IP (203.0.113.5),
       разные порты источника позволяют различать сессии.

Ограничение PAT:
  Порт - 16-битное число (1-65535).
  Один публичный IP → теоретически 65535 одновременных соединений.
  На практике: ~4000-64000 (часть зарезервирована).
  При большой нагрузке: несколько публичных IP для PAT.
```

### Конфликт портов в PAT

```
Что если два хоста используют одинаковый порт источника?
  192.168.1.10:52341 → 8.8.8.8:53
  192.168.1.20:52341 → 8.8.8.8:53

PAT-устройство переназначает порт для одного из них:
  192.168.1.10:52341 → 203.0.113.5:1024
  192.168.1.20:52341 → 203.0.113.5:1025   (порт изменён!)

Так работает PAT - порты источника могут изменяться.
Внутренние хосты не замечают этого.
```

### Протоколы без порта (ICMP и PAT)

```
ICMP не использует порты (это L3 протокол).
Как PAT различает ICMP сессии разных хостов?

Для ICMP ping:
  В ICMP Echo Request есть поле Identifier (16 бит).
  PAT использует его как "порт" для различения сессий.

  192.168.1.10 ping id=1  → 203.0.113.5 id=1024
  192.168.1.20 ping id=1  → 203.0.113.5 id=1025  (id переназначен!)

Для GRE (VPN туннели):
  GRE имеет Key поле или Call ID.
  PAT использует его для различения туннелей.
  Ограничение: часто только один GRE туннель за PAT (зависит от реализации).

Для IPsec:
  ESP не имеет портов.
  Работает через NAT-T (NAT Traversal, RFC 3948):
  ESP инкапсулируется в UDP порт 4500.
  PAT работает с UDP 4500 как обычно.
```

### PAT и ALG (Application Layer Gateway)

```
Некоторые протоколы передают IP-адрес/порт в самом payload (данных).
NAT не знает об этом и не меняет адрес внутри данных.
Результат: соединение рвётся.

Протоколы требующие ALG:
  FTP (PORT режим):
    Клиент в команде PORT говорит "подключись ко мне на 192.168.1.10:4567".
    Сервер пытается → получает приватный IP → не может подключиться.
    ALG для FTP: перехватывает PORT команду и заменяет внутренний IP публичным.

  SIP (VoIP):
    SIP пакеты содержат IP-адрес для медиапотока.
    ALG для SIP: заменяет адреса в SDP payload.

  H.323 (старый VoIP/видеоконференции):
    Аналогично SIP.

  TFTP, RTSP, IRC DCC.

Включение ALG (Linux):
  modprobe nf_conntrack_ftp      (FTP ALG)
  modprobe nf_conntrack_sip      (SIP ALG)
  modprobe nf_conntrack_h323

Проблема SIP ALG:
  Многие роутеры имеют SIP ALG включённый по умолчанию.
  Часто работает некорректно → VoIP звонки не работают.
  Рекомендация: отключить SIP ALG, использовать VPN или SIP provider с STUN/TURN.
```

---

## CGNAT - Carrier-Grade NAT

```
CGNAT (Carrier-Grade NAT) = Large Scale NAT (LSN).
Двойной NAT: NAT у провайдера + NAT у пользователя.

  Хост (192.168.1.10)
    ↓ NAT домашнего роутера
  100.64.0.x  (shared address space, RFC 6598)
    ↓ CGNAT у провайдера
  1.2.3.4  (публичный IP провайдера)
    ↓
  Интернет

Проблемы CGNAT:
  - Двойной NAT → сложно пробросить порты (Port Forwarding не работает)
  - P2P приложения (торренты, игры) работают хуже
  - VPN серверы дома не подними (нет прямого публичного IP)
  - Логи провайдера: один публичный IP = сотни пользователей → проблемы при следствии
  - Некоторые сайты блокируют диапазон 100.64.0.0/10

Как определить что у тебя CGNAT:
  Внешний IP на роутере: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 100.64.x.x
  (не совпадает с IP на whatismyip.com)

Решения:
  - Запросить у провайдера статический публичный IP (платно)
  - IPv6 (не нуждается в NAT)
  - VPN до сервера с публичным IP (WireGuard, OpenVPN)
  - Reverse tunnel (ngrok, frp, cloudflared) для публикации сервисов
```

---

## NAT и IPv6

```
IPv6 разрабатывался чтобы устранить необходимость в NAT.
Адресов IPv6 достаточно для каждого устройства в мире.

NAT66 (IPv6 → IPv6):
  Технически существует, но считается антипаттерном.
  RFC 6296: NPTv6 (Network Prefix Translation) - изменяет только префикс.
  Используется очень редко.

NPTv6:
  2001:db8:1::/48 (внутренний) ↔ 2001:db8:2::/48 (внешний)
  Изменяется только префикс, host часть остаётся.
  Stateless (не нужно хранить таблицу соединений).

NAT64 (IPv6 → IPv4):
  Позволяет IPv6-only клиентам обращаться к IPv4 серверам.
  Используется в мобильных сетях и datacenters.
  Работает совместно с DNS64 (синтезирует AAAA записи из A записей).

  IPv6 клиент → NAT64 устройство → IPv4 сервер
  IPv6 адрес цели: 64:ff9b::/96 + IPv4 адрес
  Пример: 64:ff9b::8.8.8.8 = 64:ff9b::808:808

  Включение DNS64 на BIND9:
    options {
        dns64 64:ff9b::/96 {
            clients { any; };
        };
    };
```

---

## Conntrack - таблица соединений в Linux

```
Conntrack (Connection Tracking) - механизм отслеживания соединений в Linux.
Основа для stateful NAT и stateful firewall.

Хранит состояние каждого соединения:
  (src IP, src port, dst IP, dst port, protocol) → состояние

Состояния conntrack:
  NEW         - первый пакет нового соединения
  ESTABLISHED - соединение установлено (видели пакеты в обе стороны)
  RELATED     - связанное соединение (FTP data из FTP control)
  INVALID     - пакет не соответствует ни одному соединению
  UNTRACKED   - соединение явно помечено как не отслеживаемое
```

```
# Просмотр таблицы conntrack
conntrack -L
# tcp  6  431999  ESTABLISHED
#   src=192.168.1.10 dst=8.8.8.8 sport=52341 dport=443
#   src=8.8.8.8 dst=203.0.113.5 sport=443 dport=52341
#   [ASSURED] mark=0 ...

conntrack -L --proto tcp           (только TCP)
conntrack -L --src 192.168.1.10    (от конкретного хоста)
conntrack -L | wc -l               (количество соединений)

# Статистика
conntrack -S
# cpu=0 found=0 invalid=12 ignore=523 insert=0 insert_failed=0
#        drop=0 early_drop=0 error=0 search_restart=0

# Максимальное количество соединений
cat /proc/sys/net/netfilter/nf_conntrack_max
# 65536

# Текущее количество
cat /proc/sys/net/netfilter/nf_conntrack_count

# Увеличить лимит (при высокой нагрузке)
echo 262144 > /proc/sys/net/netfilter/nf_conntrack_max
# Постоянно:
echo "net.netfilter.nf_conntrack_max = 262144" >> /etc/sysctl.conf

# Таймауты соединений
sysctl net.netfilter.nf_conntrack_tcp_timeout_established  # 432000 сек (5 дней!)
sysctl net.netfilter.nf_conntrack_tcp_timeout_time_wait    # 120 сек
sysctl net.netfilter.nf_conntrack_udp_timeout              # 30 сек
sysctl net.netfilter.nf_conntrack_icmp_timeout             # 30 сек

# Для высоконагруженных серверов уменьшить таймаут ESTABLISHED:
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600
```

---

## Диагностика NAT

### Пакет не проходит через NAT

```
Шаг 1: IP форвардинг включён?
  cat /proc/sys/net/ipv4/ip_forward
  # Должно быть 1
  # Если 0: echo 1 > /proc/sys/net/ipv4/ip_forward

Шаг 2: Правила NAT применяются?
  iptables -t nat -L -n -v --line-numbers
  # Проверить что правило есть и счётчик pkts растёт

Шаг 3: Захват трафика на входе и выходе
  tcpdump -i eth1 -n host 192.168.1.10   (внутренний интерфейс)
  tcpdump -i eth0 -n host 203.0.113.5    (внешний интерфейс)

  Если пакет виден на eth1 но не eth0 → проблема в форвардинге или NAT правиле.
  Если пакет виден на eth0 но src IP не изменился → NAT правило не сработало.

Шаг 4: Conntrack видит соединение?
  conntrack -L --src 192.168.1.10
  # Если нет записи → пакет не дошёл до conntrack или отброшен раньше

Шаг 5: Проверить маршрутизацию
  ip route get 8.8.8.8
  # Убедиться что есть маршрут через нужный интерфейс
```

### DNAT не работает (port forwarding)

```
Шаг 1: Правило DNAT есть?
  iptables -t nat -L PREROUTING -n -v
  # Проверить правило и счётчик

Шаг 2: Трафик доходит до PREROUTING?
  tcpdump -i eth0 -n tcp port 80
  # Видим ли входящие запросы?

Шаг 3: Трафик форвардится к серверу?
  tcpdump -i eth1 -n host 192.168.1.100
  # После DNAT пакет должен появиться здесь с dst=192.168.1.100

Шаг 4: Сервер отвечает?
  tcpdump -i eth1 -n host 192.168.1.100 and tcp
  # Видим ли ответный трафик от сервера?

Шаг 5: FORWARD chain разрешает?
  iptables -L FORWARD -n -v
  # Должно быть правило разрешающее трафик к 192.168.1.100:80

Частые ошибки:
  - Забыли разрешить в FORWARD chain (только DNAT недостаточно)
  - Сервер отвечает не через NAT-устройство (нет default gateway на сервере)
  - Firewall на самом сервере блокирует входящие
  - SELinux/AppArmor блокирует binding на порт
```

### Диагностика Cisco NAT

```
# Включить debug (осторожно на production!)
debug ip nat                        (базовый debug)
debug ip nat detailed               (подробный)
no debug all                        (выключить всё)

# Пример вывода debug ip nat:
# NAT: s=192.168.1.10->203.0.113.5, d=8.8.8.8 [12345]
# NAT*: s=8.8.8.8, d=203.0.113.5->192.168.1.10 [12345]

# Проверить трансляции
show ip nat translations
show ip nat translations verbose     (подробно с таймаутами)
show ip nat translations total       (только статистика)

# Статистика NAT
show ip nat statistics

# Сбросить таблицу
clear ip nat translation *

# Убедиться что интерфейсы правильно помечены
show ip interface GigabitEthernet0/0
# ...NAT: Inside source...  или  ...NAT: Outside...
```

---

## Шпаргалка

```
Типы NAT:
  SNAT    - меняем src IP (исходящий трафик изнутри)
  DNAT    - меняем dst IP (входящий трафик, port forwarding)
  PAT     - SNAT с использованием портов (много:1)
  Static  - фиксированное соответствие 1:1
  CGNAT   - двойной NAT у провайдера (100.64.0.0/10)

Приватные адреса (RFC 1918):
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16

Linux iptables SNAT:
  iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE
  echo 1 > /proc/sys/net/ipv4/ip_forward   (обязательно!)

Linux iptables DNAT:
  iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
    -j DNAT --to-destination 192.168.1.100:80

Cisco SNAT (PAT):
  ip nat inside source list ACL interface Gi0/0 overload
  interface Gi0/0 → ip nat outside
  interface Gi0/1 → ip nat inside

Cisco DNAT (port forwarding):
  ip nat inside source static tcp 192.168.1.100 80 203.0.113.5 80

Conntrack (Linux):
  conntrack -L              список соединений
  conntrack -L | wc -l      количество
  conntrack -D --src IP     удалить запись
  /proc/sys/net/netfilter/nf_conntrack_max   лимит соединений

Диагностика:
  iptables -t nat -L -n -v      правила NAT
  conntrack -L                  таблица соединений
  tcpdump -i eth0 -n ...        захват трафика
  show ip nat translations      Cisco таблица NAT
  show ip nat statistics        Cisco статистика

Частые проблемы:
  - ip_forward = 0 → пакеты не форвардятся
  - FORWARD chain блокирует → DNAT не работает
  - SIP ALG сломан → VoIP не работает
  - conntrack переполнен → новые соединения отбрасываются
  - CGNAT → нет прямого публичного IP
```

---

## Ссылки

- [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918) - Address Allocation for Private Internets
- [RFC 2663](https://www.rfc-editor.org/rfc/rfc2663) - IP Network Address Translator (NAT) Terminology and Considerations
- [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022) - Traditional IP Network Address Translator (Traditional NAT)
- [RFC 3948](https://www.rfc-editor.org/rfc/rfc3948) - UDP Encapsulation of IPsec ESP Packets (NAT-T)
- [RFC 6296](https://www.rfc-editor.org/rfc/rfc6296) - IPv6-to-IPv6 Network Prefix Translation (NPTv6)
- [RFC 6598](https://www.rfc-editor.org/rfc/rfc6598) - IANA-Reserved IPv4 Prefix for Shared Address Space (CGNAT, 100.64.0.0/10)
- [nftables wiki](https://wiki.nftables.org) - современная замена iptables
