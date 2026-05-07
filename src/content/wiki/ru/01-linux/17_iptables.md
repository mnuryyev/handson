---
title: "iptables - Цепочки INPUT, OUTPUT, FORWARD"
date: "2026-05-07"
---

iptables - утилита управления netfilter, фреймворком фильтрации пакетов в ядре Linux. Каждый пакет проходит через набор таблиц и цепочек, где к нему применяются правила. Правило совпало - выполняется действие (ACCEPT, DROP, REJECT и др.).

Современная замена - nftables, но iptables остаётся повсеместно используемым и входит в базу знаний каждого Linux-инженера. На многих системах iptables - это обёртка над nftables.

---

## Архитектура: таблицы и цепочки

    Таблицы (tables) - группируют правила по назначению:
      filter  - основная фильтрация пакетов (INPUT, OUTPUT, FORWARD)
      nat     - трансляция адресов (PREROUTING, OUTPUT, POSTROUTING)
      mangle  - модификация заголовков пакетов
      raw     - обход conntrack, ранняя обработка
      security - метки SELinux на пакеты

    Цепочки (chains) в таблице filter:
      INPUT    - пакеты, адресованные локальной системе
      OUTPUT   - пакеты, исходящие с локальной системы
      FORWARD  - пакеты, проходящие через систему (маршрутизация)

    Путь пакета через iptables:

      Входящий пакет для локального процесса:
        Сеть → PREROUTING (raw, mangle, nat) → INPUT (mangle, filter) → Процесс

      Исходящий пакет от локального процесса:
        Процесс → OUTPUT (raw, mangle, nat, filter) → POSTROUTING (mangle, nat) → Сеть

      Транзитный пакет (маршрутизация):
        Сеть → PREROUTING → FORWARD (mangle, filter) → POSTROUTING → Сеть

    Политика по умолчанию (default policy):
      Если ни одно правило не совпало - применяется политика цепочки.
      ACCEPT - разрешить (открытая система).
      DROP   - отбросить молча (закрытая система).

### Действия (targets)

    ACCEPT   - пропустить пакет, прекратить обработку цепочки.
    DROP     - отбросить пакет молча (клиент не получает ответа).
    REJECT   - отбросить пакет и отправить ICMP ошибку клиенту.
    LOG      - записать в лог и продолжить обработку следующих правил.
    RETURN   - вернуться из пользовательской цепочки в вызвавшую.
    DNAT     - изменить IP назначения (только в nat PREROUTING/OUTPUT).
    SNAT     - изменить IP источника (только в nat POSTROUTING).
    MASQUERADE - SNAT с динамическим IP (для PPP/DHCP интерфейсов).
    REDIRECT - перенаправить на другой порт локальной машины.
    MARK     - поставить mark на пакет (для маршрутизации по политике).

---

## Синтаксис iptables

    # Общий синтаксис:
    iptables [-t таблица] КОМАНДА цепочка [условия] [-j действие]

    # Таблица по умолчанию - filter (если -t не указан)

    Команды:
      -A  (--append)   - добавить правило в конец цепочки
      -I  (--insert)   - вставить правило (по умолчанию в начало)
      -D  (--delete)   - удалить правило
      -R  (--replace)  - заменить правило по номеру
      -L  (--list)     - показать правила
      -F  (--flush)    - удалить все правила из цепочки
      -Z  (--zero)     - обнулить счётчики
      -N  (--new)      - создать пользовательскую цепочку
      -X  (--delete-chain) - удалить пользовательскую цепочку
      -P  (--policy)   - установить политику по умолчанию
      -n  (--numeric)  - не разрешать имена (показывать IP и порты числами)
      -v  (--verbose)  - подробный вывод (счётчики пакетов/байт)
      --line-numbers   - показать номера правил

    Условия (matches):
      -s <ip>      - IP источника
      -d <ip>      - IP назначения
      -i <iface>   - входящий интерфейс
      -o <iface>   - исходящий интерфейс
      -p <proto>   - протокол (tcp, udp, icmp, all)
      --sport      - порт источника (только с -p tcp/udp)
      --dport      - порт назначения (только с -p tcp/udp)
      ! перед условием - инверсия (НЕ)

---

## Цепочка INPUT

INPUT обрабатывает пакеты, адресованные самому серверу (его IP). Веб-сервер слушает 80/443 - правила в INPUT разрешают эти подключения.

    # Просмотр правил INPUT
    iptables -L INPUT -n -v --line-numbers

    # Разрешить установленные соединения (conntrack)
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    # ESTABLISHED - ответы на исходящие соединения
    # RELATED     - связанные соединения (например, FTP data)

    # Разрешить loopback интерфейс
    iptables -A INPUT -i lo -j ACCEPT

    # Разрешить ICMP ping
    iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

    # Разрешить SSH (порт 22)
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT

    # Разрешить SSH только с конкретного IP
    iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -j ACCEPT

    # Разрешить HTTP и HTTPS
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT

    # Разрешить несколько портов (multiport)
    iptables -A INPUT -p tcp -m multiport --dports 80,443,8080,8443 -j ACCEPT

    # Разрешить диапазон портов
    iptables -A INPUT -p tcp --dport 8000:9000 -j ACCEPT

    # Заблокировать конкретный IP
    iptables -A INPUT -s 1.2.3.4 -j DROP

    # Заблокировать подсеть
    iptables -A INPUT -s 10.0.0.0/8 -j DROP

    # Политика по умолчанию - DROP (запрещено всё что не разрешено)
    iptables -P INPUT DROP

    # ВАЖНО: сначала добавить правила ACCEPT (SSH и др.),
    # потом ставить политику DROP - иначе потеряете доступ!

### Защита INPUT

    # Защита от SYN flood
    iptables -A INPUT -p tcp --syn -m limit --limit 1/s --limit-burst 3 -j ACCEPT
    iptables -A INPUT -p tcp --syn -j DROP

    # Защита от сканирования портов (NULL, FIN, XMAS сканы)
    iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP      # NULL scan
    iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP       # XMAS scan
    iptables -A INPUT -p tcp --tcp-flags ALL FIN,PSH,URG -j DROP # FIN scan

    # Ограничение ICMP (anti ping flood)
    iptables -A INPUT -p icmp -m limit --limit 5/s --limit-burst 10 -j ACCEPT
    iptables -A INPUT -p icmp -j DROP

    # Блокировка недопустимых пакетов (INVALID state)
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

    # Rate limiting SSH (брутфорс защита)
    iptables -A INPUT -p tcp --dport 22 -m recent --name ssh --update \
      --seconds 60 --hitcount 4 -j DROP
    iptables -A INPUT -p tcp --dport 22 -m recent --name ssh --set -j ACCEPT

    # Аналог через hashlimit (современнее)
    iptables -A INPUT -p tcp --dport 22 -m hashlimit \
      --hashlimit-upto 3/min \
      --hashlimit-burst 5 \
      --hashlimit-mode srcip \
      --hashlimit-name ssh_limit \
      -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j DROP

---

## Цепочка OUTPUT

OUTPUT обрабатывает пакеты, исходящие с самого сервера (от локальных процессов). По умолчанию OUTPUT ACCEPT - сервер может подключаться куда угодно.

    # Просмотр правил OUTPUT
    iptables -L OUTPUT -n -v --line-numbers

    # Разрешить loopback
    iptables -A OUTPUT -o lo -j ACCEPT

    # Разрешить установленные соединения (ответы)
    iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Разрешить DNS запросы
    iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

    # Разрешить HTTP/HTTPS (чтобы сервер мог скачивать обновления)
    iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # Разрешить NTP (синхронизация времени)
    iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # Разрешить SMTP (отправка почты)
    iptables -A OUTPUT -p tcp --dport 25 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 587 -j ACCEPT

    # Запретить исходящие на конкретный IP (блокировка outbound)
    iptables -A OUTPUT -d 1.2.3.4 -j DROP

    # Разрешить только конкретному UID делать исходящие соединения
    iptables -A OUTPUT -m owner --uid-owner www-data -p tcp --dport 443 -j ACCEPT
    iptables -A OUTPUT -m owner --uid-owner www-data -j DROP

    # Политика DROP для OUTPUT (параноидальный режим)
    iptables -P OUTPUT DROP
    # После этого нужно явно разрешать каждый вид исходящего трафика

---

## Цепочка FORWARD

FORWARD обрабатывает пакеты, которые маршрутизируются через сервер (не для него самого). Используется когда сервер работает как роутер, VPN-шлюз или NAT-устройство.

    # По умолчанию FORWARD DROP (безопасно)
    iptables -P FORWARD DROP

    # Включить IP forwarding в ядре (без этого FORWARD не работает)
    echo 1 > /proc/sys/net/ipv4/ip_forward
    # или постоянно:
    echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
    sysctl -p

    # Просмотр правил FORWARD
    iptables -L FORWARD -n -v --line-numbers

    # Разрешить forwarding установленных соединений
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Разрешить forwarding из LAN в WAN (роутер)
    iptables -A FORWARD -i eth1 -o eth0 -j ACCEPT
    # eth1 = LAN интерфейс, eth0 = WAN интерфейс

    # Разрешить только HTTP/HTTPS через роутер
    iptables -A FORWARD -i eth1 -o eth0 -p tcp -m multiport \
      --dports 80,443 -j ACCEPT

    # Заблокировать forwarding к конкретному IP
    iptables -A FORWARD -d 192.168.2.5 -j DROP

    # VPN сервер: разрешить forwarding через VPN интерфейс
    iptables -A FORWARD -i wg0 -j ACCEPT
    iptables -A FORWARD -o wg0 -j ACCEPT
    # или
    iptables -A FORWARD -i tun0 -j ACCEPT
    iptables -A FORWARD -o tun0 -j ACCEPT

    # Docker использует FORWARD для контейнеров
    # Пример: контейнер на 172.17.0.0/16 через docker0
    iptables -A FORWARD -i docker0 -j ACCEPT
    iptables -A FORWARD -o docker0 -j ACCEPT

---

## Таблица NAT

NAT (Network Address Translation) работает в отдельной таблице nat. Три цепочки: PREROUTING, OUTPUT, POSTROUTING.

    # Посмотреть NAT правила
    iptables -t nat -L -n -v

### MASQUERADE и SNAT (исходящий NAT)

    # MASQUERADE - для динамического IP (DHCP, PPPoE)
    # Все пакеты из LAN наружу выглядят как с IP WAN интерфейса
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE

    # SNAT - для статического IP (быстрее MASQUERADE, знает IP заранее)
    iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 \
      -j SNAT --to-source 1.2.3.4

    # NAT всего трафика через VPN (кроме самого VPN трафика)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

### DNAT (входящий NAT / Port Forwarding)

    # Port forwarding: внешний порт 8080 → внутренний сервер 192.168.1.10:80
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80

    # Пробросить порт 22 на внутренний SSH сервер
    iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 2222 \
      -j DNAT --to-destination 192.168.1.20:22

    # Пробросить для конкретного входящего IP
    iptables -t nat -A PREROUTING -i eth0 -p tcp -s 10.0.0.5 --dport 80 \
      -j DNAT --to-destination 192.168.1.10:80

    # Не забыть разрешить forward к backend серверу
    iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 \
      -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT

### REDIRECT (локальный проброс)

    # Перенаправить трафик на локальный порт (прозрачный прокси)
    iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3128

    # Перенаправить трафик конкретной подсети
    iptables -t nat -A PREROUTING -s 192.168.1.0/24 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

---

## Connection Tracking (conntrack)

conntrack - модуль отслеживания состояний соединений. Позволяет писать stateful правила вместо разрешения каждого направления отдельно.

    Состояния conntrack:
      NEW         - первый пакет нового соединения (SYN для TCP)
      ESTABLISHED - соединение установлено, пакеты идут в обе стороны
      RELATED     - связанное соединение (ICMP ошибки, FTP data channel)
      INVALID     - пакет не соответствует ни одному известному соединению
      UNTRACKED   - помечен как не отслеживаемый (через raw таблицу)

    # Золотое правило stateful firewall:
    iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    # Разрешает ответы без отдельных правил для каждого протокола.

    # Посмотреть таблицу соединений
    conntrack -L
    conntrack -L --proto tcp
    conntrack -L --state ESTABLISHED
    cat /proc/net/nf_conntrack

    # Статистика
    conntrack -S

    # Удалить конкретное соединение
    conntrack -D -p tcp --dport 80 -s 1.2.3.4

    # Максимальное число отслеживаемых соединений
    cat /proc/sys/net/netfilter/nf_conntrack_max
    sysctl net.netfilter.nf_conntrack_max=131072

    # Время жизни established TCP соединений в conntrack
    cat /proc/sys/net/netfilter/nf_conntrack_tcp_timeout_established
    # по умолчанию 432000 секунд (5 дней) - много для нагруженного сервера
    sysctl net.netfilter.nf_conntrack_tcp_timeout_established=86400

---

## Пользовательские цепочки

Пользовательские цепочки - способ структурировать правила и избежать дублирования. Из встроенных цепочек вызываются через -j CHAIN_NAME.

    # Создать цепочки для логического разделения
    iptables -N TCP_IN      # правила для TCP
    iptables -N UDP_IN      # правила для UDP
    iptables -N ICMP_IN     # правила для ICMP
    iptables -N BLACKLIST   # заблокированные IP

    # Заполнить цепочку BLACKLIST
    iptables -A BLACKLIST -s 1.2.3.4   -j DROP
    iptables -A BLACKLIST -s 5.6.7.0/24 -j DROP
    # В конце BLACKLIST - RETURN (все остальные не заблокированы)
    iptables -A BLACKLIST -j RETURN

    # Заполнить TCP_IN
    iptables -A TCP_IN -p tcp --dport 22  -j ACCEPT
    iptables -A TCP_IN -p tcp --dport 80  -j ACCEPT
    iptables -A TCP_IN -p tcp --dport 443 -j ACCEPT
    iptables -A TCP_IN -j RETURN          # остальное - вернуться (будет DROP)

    # Вызвать пользовательские цепочки из INPUT
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -j BLACKLIST        # сначала проверить чёрный список
    iptables -A INPUT -p tcp -j TCP_IN
    iptables -A INPUT -p udp -j UDP_IN
    iptables -A INPUT -p icmp -j ICMP_IN
    iptables -P INPUT DROP

    # Посмотреть пользовательские цепочки
    iptables -L TCP_IN -n -v

---

## Логирование

    # Логировать и пропустить
    iptables -A INPUT -p tcp --dport 22 -j LOG --log-prefix "SSH_ATTEMPT: " --log-level 4
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT

    # Логировать и дропнуть (LOG не прерывает цепочку)
    iptables -A INPUT -s 1.2.3.4 -j LOG --log-prefix "BLOCKED: " --log-level 4
    iptables -A INPUT -s 1.2.3.4 -j DROP

    # Ограничить частоту логирования (чтобы не заспамить syslog)
    iptables -A INPUT -m limit --limit 5/min -j LOG \
      --log-prefix "INPUT_DROP: " --log-level 4

    # Уровни лога (syslog levels):
    # 0 emerg, 1 alert, 2 crit, 3 err, 4 warning, 5 notice, 6 info, 7 debug

    # Смотреть логи
    tail -f /var/log/kern.log          # Debian/Ubuntu
    tail -f /var/log/messages          # RHEL/Fedora
    journalctl -k -f                   # systemd journal (kernel messages)
    journalctl -k | grep "SSH_ATTEMPT"

    # Логировать DROP в конце цепочки (весь незатронутый трафик)
    iptables -A INPUT -j LOG --log-prefix "INPUT_DROP: " --log-level 4
    iptables -P INPUT DROP

---

## Управление правилами

### Просмотр

    # Показать все правила filter таблицы
    iptables -L -n -v

    # С номерами строк
    iptables -L INPUT -n -v --line-numbers

    # Показать таблицу nat
    iptables -t nat -L -n -v

    # Показать в виде команд (для скриптов)
    iptables-save
    iptables-save -t filter    # только filter таблица

### Вставка и удаление

    # Вставить правило первым (номер 1)
    iptables -I INPUT 1 -s 10.0.0.1 -j ACCEPT

    # Вставить на конкретную позицию
    iptables -I INPUT 3 -p tcp --dport 8080 -j ACCEPT

    # Удалить по номеру строки
    iptables -L INPUT --line-numbers    # сначала найти номер
    iptables -D INPUT 3                 # удалить правило #3

    # Удалить конкретное правило (по содержимому)
    iptables -D INPUT -p tcp --dport 8080 -j ACCEPT

    # Очистить всю цепочку
    iptables -F INPUT
    iptables -F         # очистить все цепочки filter

    # Очистить nat таблицу
    iptables -t nat -F

    # Сбросить всё (ядерный вариант)
    iptables -F
    iptables -X         # удалить все пользовательские цепочки
    iptables -Z         # обнулить счётчики
    iptables -t nat -F
    iptables -t nat -X
    iptables -t mangle -F
    iptables -t mangle -X
    iptables -P INPUT ACCEPT
    iptables -P OUTPUT ACCEPT
    iptables -P FORWARD ACCEPT

### Сохранение и восстановление

    # Сохранить текущие правила
    iptables-save > /etc/iptables/rules.v4
    ip6tables-save > /etc/iptables/rules.v6

    # Восстановить
    iptables-restore < /etc/iptables/rules.v4

    # Debian/Ubuntu: автозагрузка через iptables-persistent
    apt install iptables-persistent
    # Сохранить текущие правила:
    netfilter-persistent save
    # Автоматически загружает /etc/iptables/rules.v4 при загрузке

    # RHEL/Fedora: через iptables сервис
    dnf install iptables-services
    systemctl enable iptables
    service iptables save    # сохранить в /etc/sysconfig/iptables

    # systemd unit (универсальный вариант)
    # /etc/systemd/system/iptables-restore.service
    [Unit]
    Description=Restore iptables rules
    Before=network-pre.target
    Wants=network-pre.target

    [Service]
    Type=oneshot
    ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
    RemainAfterExit=yes

    [Install]
    WantedBy=multi-user.target

---

## Готовые конфигурации

### Базовый firewall для сервера

    #!/bin/bash
    # Сброс всех правил
    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t nat -X

    # Политики по умолчанию
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # Loopback
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT

    # Установленные соединения
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # Невалидные пакеты
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

    # ICMP ping (ограниченно)
    iptables -A INPUT -p icmp --icmp-type echo-request \
      -m limit --limit 5/s -j ACCEPT

    # SSH (только с управляющей сети)
    iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT

    # HTTP и HTTPS
    iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT

    # Логировать всё что упало
    iptables -A INPUT -m limit --limit 5/min -j LOG \
      --log-prefix "iptables_drop: " --log-level 4

    echo "Firewall применён"

### NAT роутер (шлюз для локальной сети)

    #!/bin/bash
    # Переменные
    WAN=eth0          # внешний интерфейс
    LAN=eth1          # внутренний интерфейс
    LAN_NET=192.168.1.0/24

    # Включить IP forwarding
    sysctl -w net.ipv4.ip_forward=1

    # Сброс
    iptables -F
    iptables -t nat -F

    # Политики
    iptables -P INPUT   DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT  ACCEPT

    # INPUT: loopback и established
    iptables -A INPUT -i lo   -j ACCEPT
    iptables -A INPUT -i $LAN -j ACCEPT    # доверять LAN
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -i $WAN -j ACCEPT   # SSH снаружи

    # FORWARD: LAN → WAN
    iptables -A FORWARD -i $LAN -o $WAN -j ACCEPT
    iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

    # NAT: маскарад для LAN
    iptables -t nat -A POSTROUTING -s $LAN_NET -o $WAN -j MASQUERADE

    # Port forwarding: внешний 8080 → внутренний веб-сервер
    iptables -t nat -A PREROUTING -i $WAN -p tcp --dport 8080 \
      -j DNAT --to-destination 192.168.1.10:80
    iptables -A FORWARD -p tcp -d 192.168.1.10 --dport 80 -j ACCEPT

### Docker-совместимый firewall

    # Docker управляет FORWARD и nat таблицами сам.
    # Не делать iptables -P FORWARD DROP без учёта Docker правил.

    # Правильный подход - добавлять правила через DOCKER-USER цепочку:
    # Docker создаёт цепочку DOCKER-USER, вызываемую из FORWARD перед DOCKER.

    # Заблокировать доступ к контейнеру из внешней сети
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -s 0.0.0.0/0 -j DROP

    # Разрешить только с конкретного IP
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -s 10.0.0.5 -j ACCEPT
    iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 \
      -j DROP

    # Правила DOCKER-USER не сбрасываются при рестарте Docker.
    # Правила в DOCKER цепочке - управляются Docker, не трогать.

---

## ipset - наборы IP адресов

ipset ускоряет работу с большими списками IP (тысячи адресов).

    # Установка
    apt install ipset    # Debian/Ubuntu
    dnf install ipset    # Fedora/RHEL

    # Создать набор IP адресов
    ipset create blacklist hash:ip
    ipset create blacklist_net hash:net    # для подсетей

    # Добавить адреса
    ipset add blacklist 1.2.3.4
    ipset add blacklist 5.6.7.8
    ipset add blacklist_net 10.0.0.0/8

    # Использовать в iptables
    iptables -A INPUT -m set --match-set blacklist src -j DROP
    iptables -A INPUT -m set --match-set blacklist_net src -j DROP

    # Посмотреть содержимое набора
    ipset list blacklist

    # Удалить адрес из набора
    ipset del blacklist 1.2.3.4

    # Сохранить и восстановить
    ipset save > /etc/ipset.conf
    ipset restore < /etc/ipset.conf

    # Временный бан (TTL)
    ipset create temp_ban hash:ip timeout 3600   # бан на 1 час
    ipset add temp_ban 1.2.3.4                   # через час автоматически удалится

---

## Диагностика

    # Показать все правила всех таблиц
    iptables -L -n -v
    iptables -t nat -L -n -v
    iptables -t mangle -L -n -v

    # Проверить счётчики (пакеты/байты)
    iptables -L INPUT -n -v    # столбцы pkts и bytes

    # Обнулить счётчики и наблюдать что приходит
    iptables -Z INPUT
    # ... генерируем трафик ...
    iptables -L INPUT -n -v

    # Трассировка пакета (TRACE target)
    # Добавить правило трассировки в таблицу raw
    iptables -t raw -A PREROUTING -p tcp --dport 80 -j TRACE
    iptables -t raw -A OUTPUT -p tcp --dport 80 -j TRACE
    # Смотреть в логах:
    journalctl -k | grep TRACE
    # Удалить после диагностики:
    iptables -t raw -F

    # Проверить что пакет мог бы сделать (без реального применения)
    # Использовать nft trace в nftables или tcpdump

    # Посмотреть conntrack таблицу
    conntrack -L
    conntrack -L | grep "src=1.2.3.4"

    # Проверить ip_forward
    cat /proc/sys/net/ipv4/ip_forward    # 1 = включён

    # Проверить что правило работает
    tcpdump -i eth0 -n 'tcp port 80'     # видим ли пакеты до правил
    curl -v http://server_ip             # тест подключения

    # Частые ошибки:
    # Порядок правил: более специфичные правила должны быть выше общих.
    # ESTABLISHED,RELATED должно быть первым правилом INPUT/OUTPUT.
    # Забыли -P INPUT ACCEPT после отладки → потеря доступа.
    # FORWARD DROP без ip_forward=1 → пакеты не маршрутизируются.
    # Docker переписывает FORWARD → использовать DOCKER-USER.

---

## Шпаргалка

    Просмотр:
      iptables -L -n -v                  - все правила filter
      iptables -L INPUT -n -v --line-numbers  - INPUT с номерами
      iptables -t nat -L -n -v           - NAT правила
      iptables-save                      - все правила в виде команд

    Добавление правил:
      iptables -A INPUT -p tcp --dport 22 -j ACCEPT   - разрешить SSH
      iptables -A INPUT -p tcp --dport 80 -j ACCEPT   - разрешить HTTP
      iptables -A INPUT -s 1.2.3.4 -j DROP            - заблокировать IP
      iptables -I INPUT 1 -s 10.0.0.1 -j ACCEPT       - вставить первым

    Удаление:
      iptables -D INPUT 3                  - удалить правило #3
      iptables -D INPUT -p tcp --dport 80 -j ACCEPT  - удалить по содержимому
      iptables -F INPUT                    - очистить цепочку INPUT
      iptables -F && iptables -P INPUT ACCEPT  - сбросить всё

    Политики:
      iptables -P INPUT DROP     - запретить всё входящее по умолчанию
      iptables -P FORWARD DROP   - запретить forwarding по умолчанию
      iptables -P OUTPUT ACCEPT  - разрешить всё исходящее

    conntrack:
      -m conntrack --ctstate ESTABLISHED,RELATED  - разрешить ответы
      -m conntrack --ctstate INVALID              - заблокировать невалидные
      -m conntrack --ctstate NEW                  - только новые соединения
      conntrack -L                                - таблица соединений

    NAT:
      -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE  - NAT
      -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to 10.0.0.1:80  - port forward

    Сохранение:
      iptables-save > /etc/iptables/rules.v4
      iptables-restore < /etc/iptables/rules.v4
      apt install iptables-persistent && netfilter-persistent save

    Защита:
      -m limit --limit 5/s --limit-burst 10       - rate limiting
      -m recent --update --seconds 60 --hitcount 4 - брутфорс защита
      --tcp-flags ALL NONE -j DROP                - NULL scan защита
      -m set --match-set blacklist src -j DROP    - ipset блокировка

---

## Ссылки

- [man iptables](https://linux.die.net/man/8/iptables) - полное описание опций
- [man iptables-extensions](https://linux.die.net/man/8/iptables-extensions) - все модули match
- [Netfilter Hacks HOWTO](https://www.netfilter.org/documentation/) - официальная документация
- [conntrack-tools](https://conntrack-tools.netfilter.org/) - утилиты conntrack
- [ipset man](https://ipset.netfilter.org/ipset.man.html) - документация ipset
- [nftables Wiki](https://wiki.nftables.org/) - современная замена iptables
- [Arch Wiki iptables](https://wiki.archlinux.org/title/iptables) - практическое руководство
- [frozentux iptables tutorial](https://www.frozentux.net/iptables-tutorial/iptables-tutorial.html) - детальный туториал
