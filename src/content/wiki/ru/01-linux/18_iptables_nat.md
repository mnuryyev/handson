---
title: "iptables - NAT, MASQUERADE, DNAT"
date: "2026-05-09"
---

NAT (Network Address Translation) - трансляция сетевых адресов. Ядро Linux перехватывает пакет, изменяет IP-адрес источника или назначения, и ведёт таблицу соответствий чтобы вернуть ответ правильному клиенту.

Всё NAT в iptables живёт в таблице **nat**. Три цепочки: PREROUTING (до маршрутизации), OUTPUT (локальные процессы), POSTROUTING (после маршрутизации). conntrack отслеживает соединения и автоматически применяет обратный NAT к ответам.

---

## Как работает NAT

    Без NAT (прямая маршрутизация):
      Клиент 192.168.1.5 → Сервер 8.8.8.8
      Пакет: [src: 192.168.1.5][dst: 8.8.8.8]
      Сервер видит реальный IP клиента.
      Ответ идёт напрямую к 192.168.1.5 (должен быть маршрут).

    С SNAT/MASQUERADE (исходящий NAT):
      Клиент 192.168.1.5 → Шлюз (eth1:192.168.1.1 / eth0:203.0.113.1) → Сервер 8.8.8.8
      Шлюз меняет src с 192.168.1.5 на 203.0.113.1.
      Пакет: [src: 203.0.113.1][dst: 8.8.8.8]
      Сервер отвечает на 203.0.113.1.
      Шлюз смотрит в conntrack таблицу → возвращает ответ к 192.168.1.5.

    С DNAT (входящий NAT / port forwarding):
      Клиент снаружи → Шлюз 203.0.113.1:8080 → Внутренний сервер 192.168.1.10:80
      Шлюз меняет dst с 203.0.113.1:8080 на 192.168.1.10:80.
      Пакет идёт на реальный сервер.
      Ответ: conntrack автоматически делает обратный DNAT (меняет src обратно).

    Путь пакета через таблицу nat:

      Входящий пакет:
        Сеть → [PREROUTING: raw → mangle → nat] → Решение маршрутизации
                                                  ↓
                                        INPUT (local) или FORWARD (transit)

      Исходящий пакет:
        Процесс → [OUTPUT: raw → mangle → nat → filter] → Решение маршрутизации
                                                           ↓
                                               [POSTROUTING: mangle → nat] → Сеть

    Важно: NAT правила применяются только к ПЕРВОМУ пакету соединения.
    Все последующие пакеты того же соединения обрабатываются conntrack
    автоматически - без повторного прохода через NAT правила.

---

## Таблица nat: просмотр

    # Показать все NAT правила
    iptables -t nat -L -n -v

    # С номерами строк
    iptables -t nat -L -n -v --line-numbers

    # Конкретная цепочка
    iptables -t nat -L PREROUTING -n -v
    iptables -t nat -L POSTROUTING -n -v
    iptables -t nat -L OUTPUT -n -v

    # В виде команд (для сохранения/аудита)
    iptables-save -t nat

    # Пример вывода:
    # Chain PREROUTING (policy ACCEPT 100 packets, 6000 bytes)
    # target     prot opt source       destination
    # DNAT       tcp  --  0.0.0.0/0    203.0.113.1   tcp dpt:8080 to:192.168.1.10:80
    #
    # Chain POSTROUTING (policy ACCEPT 50 packets, 3000 bytes)
    # target     prot opt source       destination
    # MASQUERADE all  --  192.168.1.0/24  0.0.0.0/0

---

## MASQUERADE

MASQUERADE - исходящий NAT с автоматическим определением IP. Шлюз подставляет свой текущий IP исходящего интерфейса в качестве source IP.

    Когда использовать MASQUERADE:
      - Динамический IP на внешнем интерфейсе (DHCP, PPPoE).
      - IP может меняться - MASQUERADE каждый раз берёт актуальный.
      - Проще в настройке чем SNAT.
      - Чуть медленнее SNAT (каждый пакет смотрит IP интерфейса).

    # Базовый MASQUERADE: всё из LAN наружу
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Только конкретный протокол
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -p tcp -j MASQUERADE

    # Несколько подсетей
    iptables -t nat -A POSTROUTING -s 192.168.0.0/16 -o eth0 -j MASQUERADE
    iptables -t nat -A POSTROUTING -s 10.0.0.0/8     -o eth0 -j MASQUERADE

    # VPN клиенты через NAT (OpenVPN, WireGuard)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
    iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE

    # Параметры MASQUERADE:
    # --to-ports port[-port]  - использовать конкретный диапазон портов для SNAT
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -p tcp -j MASQUERADE --to-ports 1024-65535

    # Не забыть включить IP forwarding:
    echo 1 > /proc/sys/net/ipv4/ip_forward
    # и разрешить FORWARD:
    iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

### MASQUERADE: полный пример шлюза

    #!/bin/bash
    # Переменные
    WAN=eth0              # внешний интерфейс (интернет)
    LAN=eth1              # внутренний интерфейс (локальная сеть)
    LAN_SUBNET=192.168.1.0/24

    # IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Очистить старые правила
    iptables -F
    iptables -t nat -F

    # Политики
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: базовое
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT    # SSH

    # FORWARD: разрешить LAN → WAN и ответы
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: MASQUERADE для исходящего трафика LAN
    iptables -t nat -A POSTROUTING -s $LAN_SUBNET -o $WAN -j MASQUERADE

    echo "Шлюз настроен: $LAN_SUBNET → $WAN (MASQUERADE)"

---

## SNAT

SNAT (Source NAT) - исходящий NAT со статическим IP. Явно указывается IP или диапазон IP, на который меняется source.

    Когда использовать SNAT вместо MASQUERADE:
      - Статический IP на внешнем интерфейсе.
      - Быстрее MASQUERADE (IP не нужно каждый раз определять).
      - Несколько публичных IP - можно управлять какой клиент выходит с какого IP.
      - Только в POSTROUTING.

    # SNAT с одним статическим IP
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1

    # SNAT с диапазоном IP (пул публичных адресов)
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1-203.0.113.10
    # Ядро балансирует между IP из диапазона.

    # SNAT с диапазоном портов
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1:1024-65535

    # Разные подсети через разные публичные IP
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.1
    iptables -t nat -A POSTROUTING -s 192.168.2.0/24 -o eth0 \
      -j SNAT --to-source 203.0.113.2

    # SNAT для конкретного хоста
    iptables -t nat -A POSTROUTING -s 192.168.1.100 -o eth0 \
      -j SNAT --to-source 203.0.113.5

### SNAT vs MASQUERADE: сравнение

                    SNAT                    MASQUERADE
    IP адрес        явно задан              берётся с интерфейса автоматически
    Скорость        быстрее                 чуть медленнее
    IP тип          статический             динамический (DHCP, PPPoE)
    Гибкость        диапазон IP и портов    только порты
    Применение      продакшн серверы        домашние/офисные роутеры
    Цепочка         POSTROUTING             POSTROUTING

---

## DNAT

DNAT (Destination NAT) - изменение IP назначения входящего пакета. Используется для port forwarding: пакет, пришедший на внешний IP:порт, перенаправляется на внутренний сервер.

    Когда использовать DNAT:
      - Публикация внутреннего сервера наружу (веб, SSH, игровой сервер).
      - Балансировка нагрузки на уровне NAT.
      - Перенаправление трафика на другой хост/порт.
      - Только в PREROUTING (для транзитных пакетов) и OUTPUT (для локальных).

    # Port forwarding: внешний 8080 → внутренний 192.168.1.10:80
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80

    # Обязательно разрешить FORWARD к backend
    iptables -A FORWARD -i eth0 -o eth1 \
      -p tcp -d 192.168.1.10 --dport 80 \
      -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT

    # DNAT без смены порта (порт сохраняется)
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.10
    # Трафик на :80 идёт на 192.168.1.10:80

    # DNAT SSH на нестандартном порту
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22

    # DNAT для конкретного источника
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp -s 10.0.0.5 --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80

    # DNAT с диапазоном портов (одинаковый номер порта)
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 8000:8080 \
      -j DNAT --to-destination 192.168.1.10

    # DNAT UDP (DNS forwarding)
    iptables -t nat -A PREROUTING \
      -i eth0 -p udp --dport 53 \
      -j DNAT --to-destination 192.168.1.53:53
    iptables -t nat -A PREROUTING \
      -i eth0 -p tcp --dport 53 \
      -j DNAT --to-destination 192.168.1.53:53

### DNAT: балансировка нагрузки (statistic module)

    # Round-robin между двумя серверами
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode nth --every 2 --packet 0 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.11:80
    # Первое правило: каждый второй пакет (packet 0 = первый из every 2).
    # Второе правило: все остальные.

    # Вероятностная балансировка (random mode)
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.5 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.11:80
    # 50% трафика → server1, 50% → server2.

    # Три сервера: 33% каждому
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.333 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -m statistic --mode random --probability 0.5 \
      -j DNAT --to-destination 192.168.1.11:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.12:80
    # Логика: из оставшихся 66% → 50% = 33%; из оставшихся 33% → 100% = 33%.

### DNAT: OUTPUT (hairpin / loopback NAT)

    Проблема hairpin NAT:
      Внутренний клиент (192.168.1.5) обращается к внешнему IP шлюза (203.0.113.1).
      PREROUTING DNAT меняет dst на 192.168.1.10.
      Пакет идёт с 192.168.1.5 на 192.168.1.10.
      Ответ идёт с 192.168.1.10 напрямую на 192.168.1.5 (минуя шлюз).
      Клиент получает ответ с "неправильного" IP → разрыв соединения.

    Решение 1: DNAT в OUTPUT + MASQUERADE
      iptables -t nat -A OUTPUT -p tcp -d 203.0.113.1 --dport 8080 \
        -j DNAT --to-destination 192.168.1.10:80
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 \
        -d 192.168.1.10 -j MASQUERADE

    Решение 2: Дополнительный SNAT для hairpin трафика
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 \
        -d 192.168.1.10 -p tcp --dport 80 \
        -j SNAT --to-source 192.168.1.1
      # Шлюз становится источником → ответ возвращается через шлюз.

---

## REDIRECT

REDIRECT - частный случай DNAT, перенаправляет на порт самого шлюза. Используется для прозрачных прокси.

    # Весь HTTP трафик LAN → локальный Squid на порту 3128
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

    # Только для конкретной подсети
    iptables -t nat -A PREROUTING -i eth1 -s 192.168.1.0/24 \
      -p tcp --dport 80 -j REDIRECT --to-port 3128

    # Прозрачный прокси для HTTPS (нужен SSL Bump в Squid)
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 443 \
      -j REDIRECT --to-port 3129

    # Перехватить DNS и отправить на локальный resolver
    iptables -t nat -A PREROUTING -i eth1 -p udp --dport 53 \
      -j REDIRECT --to-port 5300

    # Исключить сам шлюз из перехвата (иначе петля)
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      ! -s 192.168.1.1 -j REDIRECT --to-port 3128

---

## conntrack и NAT

NAT полностью зависит от conntrack. Понимание conntrack помогает диагностировать проблемы NAT.

    # Посмотреть NAT соединения в conntrack
    conntrack -L
    conntrack -L -p tcp
    conntrack -L | grep ESTABLISHED

    # Пример записи conntrack для MASQUERADE:
    # tcp 6 86398 ESTABLISHED
    #   src=192.168.1.5  dst=8.8.8.8       sport=45678 dport=443
    #   src=8.8.8.8      dst=203.0.113.1   sport=443   dport=45678
    #   [ASSURED]
    #
    # Первая строка:  оригинальный пакет (клиент → сервер)
    # Вторая строка:  ожидаемый ответ (сервер → шлюз)
    # Шлюз знает: ответ от 8.8.8.8 к 203.0.113.1:45678 → вернуть к 192.168.1.5:45678

    # Пример для DNAT (port forwarding):
    # tcp 6 85000 ESTABLISHED
    #   src=5.6.7.8      dst=203.0.113.1   sport=34567 dport=8080
    #   src=192.168.1.10 dst=5.6.7.8       sport=80    dport=34567
    #
    # dst изменён с 203.0.113.1:8080 на 192.168.1.10:80 (DNAT)
    # src ответа изменён с 192.168.1.10 на 203.0.113.1 (обратный DNAT)

    # Статистика conntrack
    conntrack -S
    # entries: число активных записей
    # searched/found/new/invalid/ignore/delete/delete_list/insert/insert_failed/drop/early_drop/error

    # Сброс конкретного соединения (заставить переустановить)
    conntrack -D -p tcp --orig-src 192.168.1.5 --orig-dst 8.8.8.8

    # Мониторинг событий conntrack в реальном времени
    conntrack -E    # все события
    conntrack -E -p tcp --dport 80    # только HTTP

    # Настройка лимитов conntrack
    # Посмотреть текущий максимум
    sysctl net.netfilter.nf_conntrack_max
    cat /proc/sys/net/netfilter/nf_conntrack_max

    # Посмотреть текущее использование
    cat /proc/sys/net/netfilter/nf_conntrack_count

    # Увеличить максимум (для нагруженных NAT шлюзов)
    sysctl -w net.netfilter.nf_conntrack_max=262144
    echo 'net.netfilter.nf_conntrack_max=262144' >> /etc/sysctl.conf

    # Уменьшить timeout для TCP ESTABLISHED (освобождать записи быстрее)
    sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=7200
    # по умолчанию 432000 (5 дней) - это слишком много для NAT шлюза

    # Таймауты conntrack для разных состояний
    sysctl net.netfilter.nf_conntrack_tcp_timeout_syn_sent     # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_syn_recv     # 60s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_fin_wait     # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_time_wait    # 120s
    sysctl net.netfilter.nf_conntrack_tcp_timeout_close        # 10s
    sysctl net.netfilter.nf_conntrack_udp_timeout              # 30s
    sysctl net.netfilter.nf_conntrack_udp_timeout_stream       # 180s

---

## Полные конфигурации

### Домашний/офисный роутер

    #!/bin/bash
    WAN=eth0
    LAN=eth1
    LAN_NET=192.168.1.0/24
    WAN_IP=203.0.113.1    # статический IP (или убрать для MASQUERADE)

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F; iptables -X

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
    iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 5/s -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -s $LAN_NET -j ACCEPT

    # FORWARD
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT

    # MASQUERADE (или SNAT если статический IP)
    iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j MASQUERADE
    # iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j SNAT --to-source $WAN_IP

    echo "Роутер настроен"

### Сервер с port forwarding

    #!/bin/bash
    # Сервер: публичный IP 203.0.113.1
    # Внутренние серверы в 192.168.1.0/24
    WAN=eth0
    LAN=eth1
    PUB_IP=203.0.113.1

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F; iptables -X

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: разрешить сервисы на самом шлюзе
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22   -j ACCEPT    # SSH к шлюзу
    iptables -A INPUT -p tcp --dport 80   -j ACCEPT    # HTTP к шлюзу
    iptables -A INPUT -p tcp --dport 443  -j ACCEPT    # HTTPS к шлюзу

    # FORWARD: разрешить проброшенный трафик
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Web сервер: внешний 80/443 → 192.168.1.10
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 443 \
      -j DNAT --to-destination 192.168.1.10:443
    iptables -A FORWARD -p tcp -d 192.168.1.10 -m multiport \
      --dports 80,443 -j ACCEPT

    # SSH к внутреннему серверу через нестандартный порт
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22
    iptables -A FORWARD -p tcp -d 192.168.1.20 --dport 22 -j ACCEPT

    # Game server: UDP 27015 → 192.168.1.30
    iptables -t nat -A PREROUTING -i $WAN -p udp --dport 27015 \
      -j DNAT --to-destination 192.168.1.30:27015
    iptables -A FORWARD -p udp -d 192.168.1.30 --dport 27015 -j ACCEPT

    # MASQUERADE для исходящего LAN трафика
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o $WAN -j MASQUERADE

    echo "Port forwarding настроен"

### VPN шлюз (WireGuard / OpenVPN)

    #!/bin/bash
    WAN=eth0
    VPN=wg0           # или tun0 для OpenVPN
    VPN_NET=10.0.0.0/24

    sysctl -w net.ipv4.ip_forward=1

    iptables -F; iptables -t nat -F

    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp  --dport 22    -j ACCEPT   # SSH
    iptables -A INPUT -p udp  --dport 51820 -j ACCEPT   # WireGuard
    # iptables -A INPUT -p udp --dport 1194 -j ACCEPT   # OpenVPN

    # FORWARD: разрешить VPN клиентам выходить в интернет
    iptables -A FORWARD -i $VPN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: VPN клиенты выходят через IP шлюза
    iptables -t nat -A POSTROUTING -s $VPN_NET -o $WAN -j MASQUERADE

    echo "VPN шлюз настроен: $VPN_NET через $WAN"

### Двойной NAT (double NAT)

    Ситуация: два уровня NAT.
    Интернет → Роутер провайдера (NAT1) → Наш шлюз (NAT2) → LAN клиенты

    # На нашем шлюзе настройка такая же как обычно:
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Проблемы двойного NAT:
    # - Port forwarding работает только со стороны провайдерского роутера.
    # - Решение: попросить провайдера дать "белый" IP или DMZ.
    # - Или использовать VPN туннель (WireGuard, Tailscale) - обходит NAT.

---

## NAT для IPv6

    # IPv6 не требует NAT (адресов достаточно).
    # Но при необходимости - ip6tables с теми же правилами:

    ip6tables -t nat -A POSTROUTING -s fc00::/7 -o eth0 -j MASQUERADE

    # Проверить поддержку NAT для IPv6 в ядре:
    lsmod | grep nf_nat
    # Должен быть nf_nat и nf_nat_masquerade

    # ip6tables команды аналогичны iptables
    ip6tables -t nat -L -n -v
    ip6tables-save > /etc/iptables/rules.v6
    ip6tables-restore < /etc/iptables/rules.v6

---

## Диагностика NAT

    # Проверить что MASQUERADE/SNAT работает
    # На клиенте за NAT:
    curl ifconfig.me           # должен показать публичный IP шлюза
    traceroute 8.8.8.8         # первый хоп = шлюз

    # На шлюзе: смотреть conntrack
    conntrack -L | grep 192.168.1.5    # соединения конкретного клиента
    conntrack -L | wc -l               # общее число соединений

    # Проверить port forwarding
    # Снаружи:
    nc -zv 203.0.113.1 8080       # проверить открыт ли порт
    curl http://203.0.113.1:8080  # HTTP запрос
    nmap -p 8080 203.0.113.1      # сканирование порта

    # На шлюзе:
    tcpdump -i eth0 -n 'tcp port 8080'    # видим ли входящие пакеты
    tcpdump -i eth1 -n 'tcp port 80'      # видим ли пакеты после DNAT

    # Посмотреть счётчики NAT правил
    iptables -t nat -L -n -v    # столбцы pkts и bytes

    # Обнулить счётчики и протестировать
    iptables -t nat -Z
    # делаем тестовый запрос...
    iptables -t nat -L -n -v    # смотрим увеличились ли счётчики

    # Трассировка пакета через TRACE
    iptables -t raw -A PREROUTING -p tcp --dport 8080 -j TRACE
    journalctl -k | grep TRACE
    iptables -t raw -F    # убрать после диагностики

    # Проблемы и решения:

    # Port forwarding не работает:
    #   1. Проверить DNAT правило: iptables -t nat -L PREROUTING -n -v
    #   2. Проверить FORWARD правило: iptables -L FORWARD -n -v
    #   3. ip_forward включён? cat /proc/sys/net/ipv4/ip_forward
    #   4. Backend сервер доступен? ping 192.168.1.10

    # MASQUERADE не работает (клиенты не выходят в интернет):
    #   1. FORWARD разрешён? iptables -L FORWARD -n -v
    #   2. ip_forward=1? cat /proc/sys/net/ipv4/ip_forward
    #   3. Правильный интерфейс в -o eth0?
    #   4. Маршрут по умолчанию есть? ip route

    # conntrack таблица переполнена:
    #   cat /proc/sys/net/netfilter/nf_conntrack_count  - текущее
    #   cat /proc/sys/net/netfilter/nf_conntrack_max    - максимум
    #   Увеличить max или уменьшить timeout'ы.
    #   dmesg | grep "nf_conntrack: table full"  - сообщения ядра

    # Hairpin NAT не работает (внутренний клиент → внешний IP):
    #   Добавить DNAT в OUTPUT + MASQUERADE для hairpin трафика.
    #   Или использовать split-horizon DNS.

---

## Сохранение NAT правил

    # Сохранить вместе со всеми правилами
    iptables-save > /etc/iptables/rules.v4

    # Только nat таблицу
    iptables-save -t nat > /etc/iptables/nat.rules

    # Восстановить
    iptables-restore < /etc/iptables/rules.v4

    # Debian/Ubuntu: iptables-persistent
    apt install iptables-persistent
    netfilter-persistent save      # сохранить текущее состояние
    netfilter-persistent reload    # перезагрузить правила

    # Проверить что правила загрузились после ребута
    iptables -t nat -L -n -v

---

## Шпаргалка

    Просмотр NAT:
      iptables -t nat -L -n -v                   - все NAT правила
      iptables -t nat -L PREROUTING -n -v        - только PREROUTING
      iptables -t nat -L POSTROUTING -n -v       - только POSTROUTING
      iptables-save -t nat                       - в виде команд
      conntrack -L                               - таблица соединений
      conntrack -L | grep ESTABLISHED | wc -l   - активные соединения

    MASQUERADE (динамический IP):
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    SNAT (статический IP):
      iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
        -j SNAT --to-source 203.0.113.1

    DNAT / Port forwarding:
      iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 \
        -j DNAT --to-destination 192.168.1.10:80
      iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 -j ACCEPT

    REDIRECT (прозрачный прокси):
      iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
        -j REDIRECT --to-port 3128

    Обязательно при NAT:
      echo 1 > /proc/sys/net/ipv4/ip_forward
      iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
      iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    conntrack настройка:
      sysctl net.netfilter.nf_conntrack_max=262144
      sysctl net.netfilter.nf_conntrack_tcp_timeout_established=7200

    Диагностика:
      conntrack -L | grep src=192.168.1.5     - соединения клиента
      tcpdump -i eth0 -n 'tcp port 8080'      - пакеты до DNAT
      tcpdump -i eth1 -n 'tcp port 80'        - пакеты после DNAT
      iptables -t nat -Z && iptables -t nat -L -n -v  - сбросить и смотреть счётчики

---

## Ссылки

- [man iptables-extensions](https://linux.die.net/man/8/iptables-extensions) - MASQUERADE, SNAT, DNAT параметры
- [Netfilter NAT HOWTO](https://www.netfilter.org/documentation/HOWTO/NAT-HOWTO.html) - официальное руководство NAT
- [conntrack-tools](https://conntrack-tools.netfilter.org/manual.html) - документация conntrack
- [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022) - традиционный IP NAT
- [nftables NAT](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_(NAT)) - NAT в nftables
- [Arch Wiki iptables](https://wiki.archlinux.org/title/iptables) - практические примеры
- [Linux Advanced Routing](https://lartc.org/howto/) - продвинутая маршрутизация и NAT
