---
title: "nftables - основы и замена iptables"
date: "2026-05-09"
---

nftables - современный фреймворк фильтрации пакетов в ядре Linux, замена iptables/ip6tables/arptables/ebtables. Включён в ядро начиная с версии 3.13 (2014). В Debian 10+, RHEL 8+, Ubuntu 20.04+ является инструментом по умолчанию. Команда `iptables` на этих системах - обёртка над nftables.

Одна утилита `nft` заменяет четыре: iptables, ip6tables, arptables, ebtables. Правила хранятся в одном месте, читаются как конфигурационный файл, не требуют отдельных команд для каждого действия.

---

## Отличия от iptables

                    iptables                nftables
    Команды         4 утилиты               1 утилита (nft)
    IPv4/IPv6       раздельно               в одном правиле
    Таблицы         встроенные, фиксированные  создаются пользователем
    Цепочки         встроенные              создаются пользователем
    Синтаксис       флаги (-A, -D, -p)      читаемый язык (add rule ... tcp dport)
    Наборы (sets)   ipset (внешний)         встроены в nftables
    Счётчики        к правилу               именованные, переиспользуются
    Атомарные замены нет (построчно)        да (nft -f файл - атомарно)
    Производит.     линейный поиск          JIT компиляция правил

    Совместимость:
      iptables-nft    - iptables синтаксис, backend nftables
      iptables-legacy - старый iptables kernel backend
      Нельзя смешивать iptables-legacy и nftables одновременно.

---

## Установка и базовые команды

    # Установка
    apt install nftables    # Debian/Ubuntu
    dnf install nftables    # Fedora/RHEL

    # Запуск и автозапуск
    systemctl enable --now nftables

    # Версия
    nft --version

    # Показать всё (таблицы, цепочки, правила)
    nft list ruleset

    # Показать конкретную таблицу
    nft list table inet filter

    # Показать конкретную цепочку
    nft list chain inet filter input

    # Показать в виде который можно восстановить
    nft -s list ruleset     # с комментариями handle
    nft list ruleset > /etc/nftables.conf   # сохранить

    # Применить конфиг из файла (атомарно)
    nft -f /etc/nftables.conf

    # Проверить файл без применения
    nft -c -f /etc/nftables.conf

    # Сбросить всё
    nft flush ruleset

---

## Структура: семейства, таблицы, цепочки

### Семейства (families)

    Семейство определяет какой трафик обрабатывается:

      ip      - только IPv4 (аналог iptables)
      ip6     - только IPv6 (аналог ip6tables)
      inet    - IPv4 и IPv6 одновременно (рекомендуется)
      arp     - ARP пакеты (аналог arptables)
      bridge  - трафик через мост (аналог ebtables)
      netdev  - привязка к конкретному интерфейсу (ingress/egress)

    Рекомендация: использовать inet для большинства задач.
    Одно правило в inet покрывает и IPv4, и IPv6.

### Таблицы (tables)

    Таблица - контейнер для цепочек. В nftables таблицы создаются вручную,
    нет встроенных таблиц filter/nat/mangle.

    # Создать таблицу
    nft add table inet filter
    nft add table inet nat
    nft add table ip myfilter

    # Удалить таблицу (и все цепочки/правила внутри)
    nft delete table inet filter

    # Список таблиц
    nft list tables

### Цепочки (chains)

    Два типа цепочек:
      Base chain  - точка входа трафика (hook). Обрабатывает реальные пакеты.
      Regular chain - вызывается из других цепочек (аналог пользовательских цепочек iptables).

    Параметры base chain:
      type    - filter, nat, route
      hook    - prerouting, input, forward, output, postrouting, ingress
      priority - порядок обработки (число или имена: filter=0, nat=-100, mangle=-150)
      policy  - default action: accept или drop

    # Создать base chain (аналог INPUT в iptables)
    nft add chain inet filter input \
      '{ type filter hook input priority filter; policy drop; }'

    # Создать base chain OUTPUT
    nft add chain inet filter output \
      '{ type filter hook output priority filter; policy accept; }'

    # Создать base chain FORWARD
    nft add chain inet filter forward \
      '{ type filter hook forward priority filter; policy drop; }'

    # Создать NAT цепочку PREROUTING
    nft add chain inet nat prerouting \
      '{ type nat hook prerouting priority dstnat; }'

    # Создать NAT цепочку POSTROUTING
    nft add chain inet nat postrouting \
      '{ type nat hook postrouting priority srcnat; }'

    # Создать regular chain (без hook - для вызова из других цепочек)
    nft add chain inet filter tcp_input

    # Удалить цепочку
    nft delete chain inet filter input

    # Список цепочек
    nft list chains

    Приоритеты (стандартные имена):
      raw        = -300
      mangle     = -150
      dstnat     = -100   (используется для PREROUTING nat)
      filter     =  0
      security   =  50
      srcnat     =  100   (используется для POSTROUTING nat)

---

## Правила (rules)

### Синтаксис правил

    # Добавить правило в конец цепочки
    nft add rule inet filter input <условия> <действие>

    # Вставить правило в начало цепочки
    nft insert rule inet filter input <условия> <действие>

    # Вставить после конкретного handle (номера правила)
    nft add rule inet filter input handle 5 <условия> <действие>

    # Показать handle номера
    nft -a list chain inet filter input

    # Удалить правило по handle
    nft delete rule inet filter input handle 7

    # Заменить правило
    nft replace rule inet filter input handle 7 <новые условия> <действие>

### Условия (matches)

    # Протокол
    ip protocol tcp
    ip protocol udp
    meta l4proto tcp       # работает и для IPv4, и для IPv6

    # Порты
    tcp dport 22
    tcp dport { 80, 443 }  # набор портов
    tcp dport 8000-9000    # диапазон
    tcp sport 1024-65535

    # IP адреса
    ip saddr 192.168.1.0/24
    ip daddr 10.0.0.1
    ip6 saddr ::1
    ip saddr { 192.168.1.0/24, 10.0.0.0/8 }

    # Интерфейсы
    iifname "eth0"         # входящий интерфейс
    oifname "eth1"         # исходящий интерфейс
    iif lo                 # по индексу (быстрее)

    # conntrack состояния
    ct state established,related
    ct state invalid
    ct state new

    # TCP флаги
    tcp flags syn
    tcp flags & (syn|ack) == syn   # только SYN (не SYN-ACK)

    # ICMP
    icmp type echo-request
    icmpv6 type echo-request

    # Инверсия условия
    ip saddr != 192.168.1.1
    tcp dport != { 80, 443 }

    # Мета-информация
    meta iifname "eth0"
    meta oifname "eth1"
    meta mark 0x1
    meta length > 1000     # размер пакета

### Действия (verdicts / statements)

    accept   - принять пакет
    drop     - отбросить молча
    reject   - отбросить с ICMP ошибкой
    reject with tcp reset   - отбросить с TCP RST
    reject with icmp type port-unreachable
    return   - вернуться в вызвавшую цепочку
    jump <chain>   - перейти в цепочку (с возвратом)
    goto <chain>   - перейти в цепочку (без возврата)
    log      - логировать
    counter  - считать пакеты/байты
    limit    - ограничение rate

---

## Полные примеры правил

### Базовые правила INPUT

    # Добавить правила в inet filter input
    nft add rule inet filter input iif lo accept
    nft add rule inet filter input ct state established,related accept
    nft add rule inet filter input ct state invalid drop
    nft add rule inet filter input ip protocol icmp icmp type echo-request limit rate 5/second accept
    nft add rule inet filter input tcp dport 22 accept
    nft add rule inet filter input tcp dport { 80, 443 } accept

    # Логировать и дропать остальное
    nft add rule inet filter input log prefix "input_drop: " drop

### Конфигурация через файл (рекомендуется)

    Лучший способ - писать конфиг файл и применять целиком:

    # /etc/nftables.conf

    #!/usr/sbin/nft -f
    flush ruleset

    table inet filter {

        chain input {
            type filter hook input priority filter; policy drop;

            # Loopback
            iif lo accept

            # Установленные соединения
            ct state established,related accept
            ct state invalid drop

            # ICMP / ICMPv6
            ip protocol icmp  icmp type echo-request  limit rate 5/second accept
            ip6 nexthdr icmpv6 icmpv6 type echo-request limit rate 5/second accept

            # ICMPv6 - обязательные типы для IPv6 работы
            ip6 nexthdr icmpv6 icmpv6 type {
                nd-neighbor-solicitation,
                nd-neighbor-advertisement,
                nd-router-advertisement
            } accept

            # SSH
            tcp dport 22 accept

            # HTTP / HTTPS
            tcp dport { 80, 443 } accept

            # Логировать остальное
            limit rate 5/minute log prefix "nft_input_drop: "
        }

        chain forward {
            type filter hook forward priority filter; policy drop;
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    # Применить
    nft -f /etc/nftables.conf

---

## Наборы (sets)

Наборы - одно из главных преимуществ nftables над iptables. Встроены в ядро, не требуют внешнего ipset.

### Анонимные наборы

    # Прямо в правиле - анонимный набор
    nft add rule inet filter input tcp dport { 22, 80, 443, 8080 } accept
    nft add rule inet filter input ip saddr { 192.168.1.0/24, 10.0.0.0/8 } accept

    # Анонимные наборы не переиспользуются.

### Именованные наборы

    # Создать именованный набор IP адресов
    nft add set inet filter trusted_ips { type ipv4_addr; }

    # Создать набор с поддержкой подсетей
    nft add set inet filter blocked_nets { type ipv4_addr; flags interval; }

    # Создать набор портов
    nft add set inet filter allowed_ports { type inet_service; }

    # Добавить элементы в набор
    nft add element inet filter trusted_ips { 192.168.1.5, 10.0.0.1 }
    nft add element inet filter blocked_nets { 1.2.3.0/24, 5.6.7.0/24 }
    nft add element inet filter allowed_ports { 22, 80, 443 }

    # Удалить элемент
    nft delete element inet filter blocked_nets { 1.2.3.0/24 }

    # Использовать набор в правиле
    nft add rule inet filter input ip saddr @trusted_ips accept
    nft add rule inet filter input ip saddr @blocked_nets drop
    nft add rule inet filter input tcp dport @allowed_ports accept

    # Показать содержимое набора
    nft list set inet filter trusted_ips

    # Типы наборов:
    # ipv4_addr    - IPv4 адреса
    # ipv6_addr    - IPv6 адреса
    # inet_proto   - протоколы
    # inet_service - порты (0-65535)
    # ether_addr   - MAC адреса
    # mark         - packet mark

### Наборы в конфиг-файле

    table inet filter {

        set trusted_ips {
            type ipv4_addr;
            elements = { 192.168.1.5, 192.168.1.10, 10.0.0.1 }
        }

        set blocked_nets {
            type ipv4_addr;
            flags interval;
            elements = { 1.2.3.0/24, 5.6.0.0/16 }
        }

        set allowed_ports {
            type inet_service;
            elements = { 22, 80, 443, 8080 }
        }

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept
            ct state established,related accept
            ip saddr @blocked_nets drop
            ip saddr @trusted_ips accept
            tcp dport @allowed_ports accept
        }
    }

### Наборы с timeout (динамический бан)

    # Набор с автоматическим удалением элементов через timeout
    nft add set inet filter temp_ban {
        type ipv4_addr;
        flags timeout;
        timeout 1h;    # элементы удаляются через 1 час
    }

    # Добавить IP в бан (удалится через 1 час)
    nft add element inet filter temp_ban { 1.2.3.4 }

    # Добавить с конкретным timeout
    nft add element inet filter temp_ban { 5.6.7.8 timeout 30m }

    # Правило использующее бан-лист
    nft add rule inet filter input ip saddr @temp_ban drop

### Счётчики в наборах (meters)

    # Динамический набор для rate limiting (meter)
    # Создать правило с meter прямо в цепочке
    nft add rule inet filter input \
      tcp dport 22 \
      meter ssh_meter { ip saddr timeout 60s limit rate over 3/minute } \
      drop
    # Если src IP превышает 3 соединения/минуту → drop.
    # Состояние хранится в meter (автоматически удаляется через 60s).

---

## NAT в nftables

### MASQUERADE

    # Создать NAT таблицу и цепочки
    nft add table inet nat
    nft add chain inet nat prerouting  \
      '{ type nat hook prerouting priority dstnat; }'
    nft add chain inet nat postrouting \
      '{ type nat hook postrouting priority srcnat; }'

    # MASQUERADE: все пакеты из LAN через eth0
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" masquerade

    # Включить IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Разрешить FORWARD
    nft add rule inet filter forward \
      iifname "eth1" oifname "eth0" accept
    nft add rule inet filter forward \
      ct state established,related accept

### SNAT

    # SNAT со статическим IP
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" \
      snat to 203.0.113.1

    # SNAT с диапазоном портов
    nft add rule inet nat postrouting \
      ip saddr 192.168.1.0/24 oifname "eth0" \
      snat to 203.0.113.1:1024-65535

### DNAT / Port forwarding

    # Проброс порта: внешний 8080 → внутренний 192.168.1.10:80
    nft add rule inet nat prerouting \
      iifname "eth0" tcp dport 8080 \
      dnat to 192.168.1.10:80

    # SSH forwarding на нестандартном порту
    nft add rule inet nat prerouting \
      iifname "eth0" tcp dport 2222 \
      dnat to 192.168.1.20:22

    # UDP forwarding (DNS)
    nft add rule inet nat prerouting \
      iifname "eth0" udp dport 53 \
      dnat to 192.168.1.53

    # DNAT с условием по source IP
    nft add rule inet nat prerouting \
      iifname "eth0" ip saddr 10.0.0.5 tcp dport 80 \
      dnat to 192.168.1.10:80

    # Разрешить FORWARD для DNAT трафика
    nft add rule inet filter forward \
      ip daddr 192.168.1.10 tcp dport 80 accept

### REDIRECT

    # Прозрачный прокси: HTTP → Squid
    nft add rule inet nat prerouting \
      iifname "eth1" tcp dport 80 \
      redirect to :3128

### NAT в конфиг-файле

    table inet nat {

        chain prerouting {
            type nat hook prerouting priority dstnat;

            # Port forwarding
            iifname "eth0" tcp dport 8080 dnat to 192.168.1.10:80
            iifname "eth0" tcp dport 2222 dnat to 192.168.1.20:22
            iifname "eth0" udp dport 27015 dnat to 192.168.1.30:27015
        }

        chain postrouting {
            type nat hook postrouting priority srcnat;

            # MASQUERADE для LAN
            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Логирование и счётчики

### Логирование

    # Логировать пакеты (и продолжить обработку)
    nft add rule inet filter input log prefix "INPUT: "

    # Логировать с уровнем syslog
    nft add rule inet filter input \
      tcp dport 22 \
      log prefix "SSH: " level info

    # Логировать и дропать
    nft add rule inet filter input \
      ip saddr 1.2.3.4 \
      log prefix "BLOCKED: " drop

    # Логировать с rate limiting (не спамить)
    nft add rule inet filter input \
      limit rate 5/minute \
      log prefix "nft_drop: " level warn

    # Уровни логирования: emerg, alert, crit, err, warn, notice, info, debug

    # Смотреть логи
    journalctl -k | grep "INPUT:"
    tail -f /var/log/kern.log | grep "nft_"

### Счётчики

    # Именованный счётчик (создать отдельно)
    nft add counter inet filter http_counter
    nft add counter inet filter ssh_counter

    # Использовать в правиле
    nft add rule inet filter input \
      tcp dport 80 counter name http_counter accept
    nft add rule inet filter input \
      tcp dport 22 counter name ssh_counter accept

    # Встроенный счётчик в правило
    nft add rule inet filter input \
      tcp dport 80 counter accept

    # Показать счётчики
    nft list counters
    nft list counter inet filter http_counter

    # Сбросить счётчики
    nft reset counters inet filter

    # Показать правила со счётчиками
    nft list chain inet filter input

---

## Limit (ограничение rate)

    # Ограничить ICMP
    nft add rule inet filter input \
      ip protocol icmp limit rate 5/second burst 10 packets accept
    nft add rule inet filter input ip protocol icmp drop

    # Ограничить SSH соединения
    nft add rule inet filter input \
      tcp dport 22 ct state new \
      limit rate 3/minute burst 5 packets accept
    nft add rule inet filter input tcp dport 22 ct state new drop

    # Limit на интерфейсе
    nft add rule inet filter input \
      iifname "eth0" limit rate over 100 mbytes/second drop

    # Параметры limit:
    # rate N/second|minute|hour|day   - скорость
    # burst N packets|bytes           - допустимый всплеск
    # rate over - дропать если ПРЕВЫШАЕТ (инверсия)

---

## Полные конфигурации

### Firewall сервера (файл конфигурации)

    # /etc/nftables.conf
    #!/usr/sbin/nft -f
    flush ruleset

    table inet filter {

        # Наборы
        set trusted_ssh {
            type ipv4_addr;
            flags interval;
            elements = { 10.0.0.0/8, 192.168.0.0/16 }
        }

        set blocked {
            type ipv4_addr;
            flags interval, timeout;
            timeout 24h;
        }

        # Счётчики
        counter dropped { }
        counter accepted { }

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept

            ct state established,related counter name accepted accept
            ct state invalid counter name dropped drop

            # Блокировать из чёрного списка
            ip saddr @blocked counter name dropped drop

            # ICMP
            ip protocol icmp icmp type echo-request \
                limit rate 5/second burst 10 packets accept
            ip6 nexthdr icmpv6 icmpv6 type {
                echo-request, nd-neighbor-solicitation,
                nd-neighbor-advertisement, nd-router-advertisement
            } accept

            # SSH: только с доверенных сетей + rate limit
            ip saddr @trusted_ssh tcp dport 22 \
                ct state new limit rate 5/minute \
                counter name accepted accept

            # HTTP/HTTPS
            tcp dport { 80, 443 } counter name accepted accept

            # Логировать дропы
            limit rate 10/minute log prefix "nft_drop: " level warn
            counter name dropped
        }

        chain forward {
            type filter hook forward priority filter; policy drop;
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

### NAT шлюз (файл конфигурации)

    # /etc/nftables.conf
    #!/usr/sbin/nft -f
    flush ruleset

    # Включить forwarding (лучше через sysctl.conf)
    # В nftables нельзя напрямую, только через sysctl

    table inet filter {

        chain input {
            type filter hook input priority filter; policy drop;

            iif lo accept
            iif "eth1" accept                              # доверять LAN
            ct state established,related accept
            ct state invalid drop

            tcp dport 22 accept                            # SSH к шлюзу
            ip protocol icmp icmp type echo-request \
                limit rate 5/second accept
        }

        chain forward {
            type filter hook forward priority filter; policy drop;

            ct state established,related accept
            ct state invalid drop

            # LAN → WAN
            iifname "eth1" oifname "eth0" accept

            # DNAT трафик (forwarding к backend серверам)
            ip daddr 192.168.1.10 tcp dport { 80, 443 } accept
            ip daddr 192.168.1.20 tcp dport 22 accept
        }

        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    table inet nat {

        chain prerouting {
            type nat hook prerouting priority dstnat;

            iifname "eth0" tcp dport { 80, 443 } dnat to 192.168.1.10
            iifname "eth0" tcp dport 2222 dnat to 192.168.1.20:22
        }

        chain postrouting {
            type nat hook postrouting priority srcnat;

            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Миграция с iptables

### Автоматическая конвертация

    # Установить утилиты конвертации
    apt install iptables    # содержит iptables-translate

    # Конвертировать одну команду iptables в nftables синтаксис
    iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT
    # Вывод: nft add rule ip filter INPUT tcp dport 22 counter accept

    # Конвертировать весь набор правил
    # Сначала сохранить текущие iptables правила:
    iptables-save > /tmp/iptables.rules
    ip6tables-save > /tmp/ip6tables.rules

    # Конвертировать в nftables формат:
    iptables-restore-translate -f /tmp/iptables.rules > /tmp/nftables_from_ipt.conf
    ip6tables-restore-translate -f /tmp/ip6tables.rules >> /tmp/nftables_from_ipt.conf

    # Проверить результат
    cat /tmp/nftables_from_ipt.conf

    # Применить (после проверки)
    nft -f /tmp/nftables_from_ipt.conf

### Соответствие концепций

    iptables                         nftables
    ──────────────────────────────────────────────────────────────
    iptables -t filter               table inet filter (или ip filter)
    iptables -t nat                  table inet nat
    iptables -t mangle               table inet mangle
    -A INPUT                         add rule ... hook input
    -A OUTPUT                        add rule ... hook output
    -A FORWARD                       add rule ... hook forward
    -j ACCEPT                        accept
    -j DROP                          drop
    -j REJECT                        reject
    -j MASQUERADE                    masquerade
    -j SNAT --to-source X            snat to X
    -j DNAT --to-destination X       dnat to X
    -p tcp --dport 80                tcp dport 80
    -p tcp -m multiport --dports X   tcp dport { X, Y, Z }
    -s 192.168.1.0/24                ip saddr 192.168.1.0/24
    -d 10.0.0.1                      ip daddr 10.0.0.1
    -i eth0                          iifname "eth0"
    -o eth0                          oifname "eth0"
    -m conntrack --ctstate EST       ct state established
    -m limit --limit 5/s             limit rate 5/second
    -m set --match-set X src         ip saddr @X
    -j LOG --log-prefix "X"         log prefix "X"
    -N MYCHAIN                       add chain inet filter mychain
    -j MYCHAIN                       jump mychain

### Ручная миграция: пример

    # iptables правила:
    iptables -P INPUT DROP
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # Эквивалент в nftables (/etc/nftables.conf):
    table inet filter {
        chain input {
            type filter hook input priority filter; policy drop;
            iif lo accept
            ct state established,related accept
            tcp dport 22 accept
            tcp dport { 80, 443 } accept
        }
        chain forward {
            type filter hook forward priority filter; policy drop;
            iifname "eth1" oifname "eth0" accept
            ct state established,related accept
        }
        chain output {
            type filter hook output priority filter; policy accept;
        }
    }

    table inet nat {
        chain postrouting {
            type nat hook postrouting priority srcnat;
            ip saddr 192.168.1.0/24 oifname "eth0" masquerade
        }
    }

---

## Управление правилами

### Атомарное обновление

    # Главное преимущество nftables: атомарная замена всего набора правил.
    # iptables применяет правила по одному → промежуточные состояния небезопасны.
    # nftables применяет файл целиком атомарно → либо всё, либо ничего.

    # Редактировать файл
    vim /etc/nftables.conf

    # Применить атомарно
    nft -f /etc/nftables.conf
    # Если ошибка - старые правила остаются в силе.

    # Проверить без применения
    nft -c -f /etc/nftables.conf

### Добавление и удаление правил онлайн

    # Показать handle (номера правил)
    nft -a list chain inet filter input
    # ...
    # tcp dport 22 accept # handle 5
    # tcp dport { 80, 443 } accept # handle 6

    # Удалить правило по handle
    nft delete rule inet filter input handle 5

    # Вставить правило после handle 3
    nft add rule inet filter input handle 3 \
      ip saddr 1.2.3.4 drop

    # Заменить правило
    nft replace rule inet filter input handle 5 \
      tcp dport 2222 accept

### Управление наборами онлайн

    # Добавить IP в набор без перезагрузки правил
    nft add element inet filter blocked { 1.2.3.4 }
    nft add element inet filter blocked { 5.6.0.0/16 }

    # Удалить IP из набора
    nft delete element inet filter blocked { 1.2.3.4 }

    # Очистить набор
    nft flush set inet filter blocked

    # Это работает онлайн - правила продолжают работать.

### Сохранение и автозагрузка

    # Сохранить текущие правила в файл
    nft list ruleset > /etc/nftables.conf

    # Автозапуск через systemd
    systemctl enable nftables
    # Читает /etc/nftables.conf при старте

    # Проверить статус
    systemctl status nftables

    # Перезагрузить правила
    systemctl reload nftables
    # или
    nft -f /etc/nftables.conf

---

## Диагностика

    # Показать все правила
    nft list ruleset

    # Показать с handle номерами
    nft -a list ruleset

    # Показать статистику правил (счётчики)
    nft list ruleset    # если counter добавлен в правило

    # Мониторинг трафика: добавить счётчик временно
    nft add rule inet filter input counter    # считать всё входящее
    nft list chain inet filter input          # посмотреть счётчики
    nft delete rule inet filter input handle <N>  # убрать

    # Трассировка пакетов
    # nftables аналог iptables TRACE:
    nft add table netdev trace_table
    nft add chain netdev trace_table trace_chain \
      '{ type filter hook ingress device eth0 priority -500; }'
    nft add rule netdev trace_table trace_chain \
      tcp dport 80 meta nftrace set 1

    # Смотреть трассировку
    nft monitor trace

    # Удалить после диагностики
    nft delete table netdev trace_table

    # Проверить conntrack
    conntrack -L
    conntrack -L | grep ESTABLISHED | wc -l

    # Часто встречающиеся ошибки:
    # "Error: Could not process rule: No such file or directory"
    #   - таблица или цепочка не существует, создать сначала.
    # "Error: syntax error, unexpected..."
    #   - синтаксическая ошибка в конфиге. Проверить кавычки и скобки.
    # NAT не работает:
    #   - проверить ip_forward: cat /proc/sys/net/ipv4/ip_forward
    #   - убедиться что FORWARD разрешён в filter таблице.
    # Правила применяются но трафик не проходит:
    #   - проверить порядок правил (drop раньше accept?)
    #   - nft -a list chain ... - посмотреть handle и порядок.

---

## Шпаргалка

    Базовые команды:
      nft list ruleset                         - показать всё
      nft -a list ruleset                      - с handle номерами
      nft flush ruleset                        - сбросить всё
      nft -f /etc/nftables.conf                - применить конфиг
      nft -c -f /etc/nftables.conf             - проверить конфиг

    Таблицы и цепочки:
      nft add table inet filter                - создать таблицу
      nft add chain inet filter input \
        '{ type filter hook input priority filter; policy drop; }'
      nft delete table inet filter             - удалить таблицу

    Правила:
      nft add rule inet filter input iif lo accept
      nft add rule inet filter input ct state established,related accept
      nft add rule inet filter input tcp dport 22 accept
      nft add rule inet filter input tcp dport { 80, 443 } accept
      nft add rule inet filter input ip saddr 1.2.3.4 drop
      nft delete rule inet filter input handle 5

    NAT:
      nft add rule inet nat postrouting \
        ip saddr 192.168.1.0/24 oifname "eth0" masquerade
      nft add rule inet nat prerouting \
        iifname "eth0" tcp dport 8080 dnat to 192.168.1.10:80

    Наборы:
      nft add set inet filter myips { type ipv4_addr; }
      nft add element inet filter myips { 1.2.3.4, 5.6.7.8 }
      nft add rule inet filter input ip saddr @myips drop
      nft delete element inet filter myips { 1.2.3.4 }

    Миграция с iptables:
      iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT
      iptables-save | iptables-restore-translate -f /dev/stdin

    Автозагрузка:
      nft list ruleset > /etc/nftables.conf
      systemctl enable --now nftables

    Трассировка:
      nft add rule ... meta nftrace set 1
      nft monitor trace

---

## Ссылки

- [nftables Wiki](https://wiki.nftables.org/) - официальная документация
- [man nft](https://linux.die.net/man/8/nft) - man страница
- [nftables Quick Reference](https://wiki.nftables.org/wiki-nftables/index.php/Quick_reference-nftables_in_10_minutes) - быстрый старт
- [Migrating from iptables](https://wiki.nftables.org/wiki-nftables/index.php/Moving_from_iptables_to_nftables) - официальное руководство по миграции
- [nftables examples](https://wiki.nftables.org/wiki-nftables/index.php/Main_Page) - примеры конфигураций
- [Netfilter documentation](https://www.netfilter.org/documentation/) - документация netfilter
- [Arch Wiki nftables](https://wiki.archlinux.org/title/nftables) - практическое руководство
- [Red Hat nftables guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/configuring_firewalls_and_packet_filters/) - руководство RHEL
