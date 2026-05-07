---
title: "Proxy - Forward, Reverse, Transparent"
date: "2026-05-07"
---

Proxy (прокси-сервер) - посредник между клиентом и сервером. Принимает запросы от клиента, пересылает их к целевому серверу, возвращает ответ обратно. В зависимости от расположения и цели - разные типы прокси.

Три основных типа: Forward Proxy (клиент знает о прокси, запросы наружу), Reverse Proxy (сервер-сторона, клиент не знает), Transparent Proxy (перехватывает трафик незаметно для клиента).

---

## Зачем нужен прокси

    Прокси решает разные задачи в зависимости от типа:

    Forward Proxy (со стороны клиента):
      Анонимность - скрыть реальный IP клиента от серверов.
      Контроль доступа - корпоративный фильтр сайтов.
      Кэширование - ускорить повторные запросы.
      Обход ограничений - выйти через другой IP.

    Reverse Proxy (со стороны сервера):
      Балансировка нагрузки - распределить трафик по нескольким backend.
      SSL/TLS терминация - снять TLS на прокси, backend работает по HTTP.
      Кэширование - отдавать статику без обращения к backend.
      Защита - скрыть реальные адреса backend серверов.
      Компрессия - gzip/brotli на уровне прокси.

    Transparent Proxy:
      Корпоративная фильтрация без настройки на клиентах.
      Кэширование на уровне провайдера.
      Перехват и инспекция трафика (MITM для анализа).

    Без прокси:
      Клиент → Сервер напрямую.
      Сервер видит реальный IP клиента.
      Нет централизованного контроля и кэширования.

---

## Forward Proxy

Forward Proxy - прокси на стороне клиента. Клиент явно настраивает прокси в браузере или ОС и направляет запросы через него.

    Схема:
      Клиент → Forward Proxy → Интернет → Целевой сервер
      Клиент знает о прокси.
      Целевой сервер видит IP прокси, не клиента.

    HTTP запрос через прокси:
      Клиент отправляет прокси:
        GET http://example.com/page HTTP/1.1   ← полный URL (не /page)
        Host: example.com
        Proxy-Authorization: Basic ...         ← если прокси требует авторизацию

      Прокси делает обычный запрос к серверу:
        GET /page HTTP/1.1
        Host: example.com
        X-Forwarded-For: 192.168.1.5          ← реальный IP клиента (если добавляет)

    HTTPS через прокси (CONNECT метод):
      Для HTTPS прокси не может видеть и изменять трафик (TLS).
      Клиент устанавливает туннель через CONNECT:

      Клиент → Прокси:
        CONNECT example.com:443 HTTP/1.1
        Host: example.com:443

      Прокси → Клиент:
        HTTP/1.1 200 Connection Established

      После этого:
        Клиент ←TLS→ Прокси ←TCP туннель→ example.com
        Прокси слепо проксирует байты, не видя содержимое.

### Заголовки прокси

    X-Forwarded-For (XFF):
      Цепочка IP адресов клиента через несколько прокси.
      X-Forwarded-For: 1.2.3.4, 10.0.0.1
                        ^^^^^^   ^^^^^^^^
                        реальный IP   промежуточный прокси

      Проблема: клиент может подделать этот заголовок.
      Доверять XFF только от известных прокси.

    X-Real-IP:
      Один IP клиента (не цепочка). Используется Nginx.
      X-Real-IP: 1.2.3.4

    Forwarded (RFC 7239):
      Стандартный заголовок замена XFF.
      Forwarded: for=1.2.3.4;proto=https;by=10.0.0.1

    Via:
      Цепочка прокси через которые прошёл запрос.
      Via: 1.1 proxy1.example.com, 1.1 proxy2.example.com

    Proxy-Authorization:
      Аутентификация на прокси.
      Proxy-Authorization: Basic dXNlcjpwYXNz

### Настройка Squid (Forward Proxy)

    # Установка
    apt install squid    # Debian/Ubuntu
    dnf install squid   # Fedora/RHEL

    # Конфигурация /etc/squid/squid.conf

    # Порт прослушивания
    http_port 3128

    # ACL - списки контроля доступа
    acl localnet src 192.168.0.0/16    # локальная сеть
    acl localnet src 10.0.0.0/8
    acl SSL_ports port 443
    acl Safe_ports port 80 443 8080 21 22

    # Запретить небезопасные порты
    http_access deny !Safe_ports
    http_access deny CONNECT !SSL_ports

    # Разрешить локальной сети
    http_access allow localnet
    http_access deny all    # всем остальным запрещено

    # Кэш
    cache_dir ufs /var/spool/squid 1000 16 256
    # 1000 MB, 16 директорий первого уровня, 256 второго

    # Логи
    access_log /var/log/squid/access.log squid
    cache_log  /var/log/squid/cache.log

    # Скрыть версию прокси
    via off
    forwarded_for off    # не добавлять X-Forwarded-For

    # Управление
    systemctl enable --now squid
    squid -k reconfigure    # перечитать конфиг без рестарта
    squid -k check          # проверить конфиг
    tail -f /var/log/squid/access.log    # логи в реальном времени

    # Статистика кэша
    squidclient -h 127.0.0.1 mgr:info
    squidclient -h 127.0.0.1 mgr:stats

### Фильтрация URL в Squid

    # Блокировка по домену
    acl blocked_sites dstdomain .facebook.com .youtube.com .tiktok.com
    http_access deny blocked_sites

    # Блокировка по URL регулярному выражению
    acl bad_urls url_regex -i \.exe$ \.torrent$
    http_access deny bad_urls

    # Разрешить только рабочее время
    acl working_hours time MTWHF 09:00-18:00
    http_access allow localnet working_hours
    http_access deny localnet    # вне рабочего времени - запрет

    # Blacklist из файла
    acl blacklist dstdomain "/etc/squid/blacklist.txt"
    http_access deny blacklist

    # Лимит трафика (delay pools)
    delay_pools 1
    delay_class 1 2                  # класс 2: общий + индивидуальный
    delay_parameters 1 -1/-1 50000/50000   # индивидуально 50KB/s
    delay_access 1 allow localnet

### Аутентификация в Squid

    # NCSA (файл с логинами/паролями)
    auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
    auth_param basic realm "Proxy Authentication"
    auth_param basic credentialsttl 2 hours

    acl authenticated proxy_auth REQUIRED
    http_access allow authenticated
    http_access deny all

    # Создать пользователя
    htpasswd -c /etc/squid/passwd user1
    htpasswd /etc/squid/passwd user2    # добавить ещё

    # Kerberos / NTLM (для Active Directory)
    auth_param negotiate program /usr/lib/squid/negotiate_kerberos_auth
    auth_param negotiate keep_alive on
    acl authenticated proxy_auth REQUIRED

### Настройка клиентов для прокси

    # Переменные окружения (Linux/macOS)
    export http_proxy=http://proxy.example.com:3128
    export https_proxy=http://proxy.example.com:3128
    export no_proxy=localhost,127.0.0.1,10.0.0.0/8

    # С аутентификацией
    export http_proxy=http://user:pass@proxy.example.com:3128

    # curl через прокси
    curl -x http://proxy.example.com:3128 https://example.com
    curl --proxy socks5://proxy.example.com:1080 https://example.com

    # wget через прокси
    wget -e http_proxy=http://proxy.example.com:3128 http://example.com

    # apt через прокси
    echo 'Acquire::http::Proxy "http://proxy.example.com:3128";' \
      > /etc/apt/apt.conf.d/99proxy

    # git через прокси
    git config --global http.proxy http://proxy.example.com:3128
    git config --global https.proxy http://proxy.example.com:3128

    # systemd сервисы через прокси
    # /etc/systemd/system/myservice.service.d/proxy.conf
    [Service]
    Environment="http_proxy=http://proxy.example.com:3128"
    Environment="https_proxy=http://proxy.example.com:3128"

---

## Reverse Proxy

Reverse Proxy - прокси на стороне сервера. Клиент думает что обращается напрямую к серверу, на самом деле - к прокси. Прокси пересылает запрос к одному из backend серверов.

    Схема:
      Клиент → Reverse Proxy → Backend 1
                             → Backend 2
                             → Backend 3
      Клиент НЕ знает о прокси.
      Клиент видит IP прокси (он же IP "сервера").

    Задачи reverse proxy:
      Балансировка нагрузки (load balancing).
      SSL/TLS терминация (offloading).
      Кэширование статических ресурсов.
      Сжатие (gzip, brotli).
      Rate limiting (ограничение частоты запросов).
      Аутентификация и авторизация.
      A/B тестирование и canary deployments.
      Защита от DDoS (rate limiting, connection limits).

### Nginx как Reverse Proxy

    # Базовая конфигурация обратного прокси
    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://127.0.0.1:8080;   # backend

            # Передать заголовки клиента backend
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Таймауты
            proxy_connect_timeout 10s;
            proxy_send_timeout    30s;
            proxy_read_timeout    30s;
        }
    }

    # SSL терминация
    server {
        listen 443 ssl;
        server_name example.com;

        ssl_certificate     /etc/nginx/ssl/example.com.pem;
        ssl_certificate_key /etc/nginx/ssl/example.com.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://127.0.0.1:8080;   # backend по HTTP (не HTTPS)
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto https;   # сообщить backend что клиент по HTTPS
        }
    }

### Балансировка нагрузки в Nginx

    # Upstream - группа backend серверов
    upstream backend_pool {
        # Round Robin (по умолчанию)
        server 10.0.0.1:8080;
        server 10.0.0.2:8080;
        server 10.0.0.3:8080;

        # Least Connections - к серверу с наименьшим числом соединений
        # least_conn;

        # IP Hash - один клиент всегда на один backend (session persistence)
        # ip_hash;

        # Взвешенный Round Robin
        # server 10.0.0.1:8080 weight=3;
        # server 10.0.0.2:8080 weight=1;

        # Резервный сервер (используется если основные упали)
        # server 10.0.0.3:8080 backup;

        # Health check параметры
        # server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;

        # Keepalive соединения к backend
        keepalive 32;
    }

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend_pool;
            proxy_http_version 1.1;
            proxy_set_header Connection "";   # для keepalive к backend
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }

### Кэширование в Nginx

    # Зона кэша (shared memory + директория)
    proxy_cache_path /var/cache/nginx
        levels=1:2
        keys_zone=my_cache:10m    # 10MB metadata в RAM
        max_size=1g               # максимум 1GB на диске
        inactive=60m              # удалить если не запрашивали 60 минут
        use_temp_path=off;

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend_pool;
            proxy_cache my_cache;

            # Ключ кэша - что кэшировать отдельно
            proxy_cache_key "$scheme$request_method$host$request_uri";

            # Кэшировать 200 ответы 1 час, 404 - 1 минуту
            proxy_cache_valid 200 302 1h;
            proxy_cache_valid 404 1m;

            # Отдавать устаревший кэш если backend недоступен
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503;

            # Заголовок показывающий статус кэша
            add_header X-Cache-Status $upstream_cache_status;
            # HIT = из кэша, MISS = от backend, BYPASS = пропущено

            # Не кэшировать если клиент прислал Cache-Control: no-cache
            proxy_cache_bypass $http_cache_control;
        }

        # Статика - длинный кэш без прокси
        location ~* \.(js|css|png|jpg|ico|woff2)$ {
            root /var/www/static;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

### Nginx: rate limiting, gzip, security

    # Rate limiting
    # Зона: 10MB памяти, 10 запросов в секунду на IP
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            # burst=20: разрешить всплески до 20 запросов
            # nodelay: не задерживать, сразу отдавать 429 при превышении
            limit_req_status 429;

            proxy_pass http://backend_pool;
        }
    }

    # Ограничение соединений
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    server {
        location / {
            limit_conn conn_limit 10;   # максимум 10 одновременных соединений с одного IP
            proxy_pass http://backend_pool;
        }
    }

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Скрыть версию Nginx
    server_tokens off;

### HAProxy как Reverse Proxy

    # /etc/haproxy/haproxy.cfg

    global
        log /dev/log local0
        maxconn 50000
        user haproxy
        group haproxy

    defaults
        log global
        mode http
        option httplog
        option forwardfor       # добавить X-Forwarded-For
        option http-server-close
        timeout connect 5s
        timeout client  30s
        timeout server  30s

    frontend http_front
        bind *:80
        bind *:443 ssl crt /etc/haproxy/certs/example.com.pem
        redirect scheme https if !{ ssl_fc }   # редирект HTTP → HTTPS

        # ACL маршрутизация по домену
        acl is_api hdr(host) -i api.example.com
        use_backend api_servers if is_api
        default_backend web_servers

    backend web_servers
        balance roundrobin
        option httpchk GET /health    # health check
        server web1 10.0.0.1:8080 check
        server web2 10.0.0.2:8080 check
        server web3 10.0.0.3:8080 check backup

    backend api_servers
        balance leastconn
        server api1 10.0.1.1:8080 check
        server api2 10.0.1.2:8080 check

    # Статистика HAProxy
    listen stats
        bind *:8404
        stats enable
        stats uri /stats
        stats auth admin:password

    # Управление
    systemctl enable --now haproxy
    haproxy -c -f /etc/haproxy/haproxy.cfg   # проверить конфиг
    # Статистика
    echo "show stat" | socat stdio /var/run/haproxy/admin.sock

### Health Checks

    # Nginx active health checks (только Nginx Plus)
    # В open source версии используется пассивная проверка:
    upstream backend_pool {
        server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
        server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;
        # Если 3 ошибки за 30 секунд - сервер помечается как упавший
        # Через 30 секунд пробуется снова
    }

    # HAProxy health check
    backend web_servers
        option httpchk GET /health HTTP/1.1\r\nHost:\ example.com
        http-check expect status 200
        server web1 10.0.0.1:8080 check inter 5s rise 2 fall 3
        # inter 5s  - проверять каждые 5 секунд
        # rise 2    - нужно 2 успешных ответа чтобы вернуть в ротацию
        # fall 3    - нужно 3 ошибки чтобы исключить из ротации

---

## Transparent Proxy

Transparent Proxy (прозрачный прокси) - перехватывает трафик без какой-либо настройки на клиенте. Клиент не знает что его трафик идёт через прокси.

    Схема:
      Клиент → (сеть) → [Прозрачный прокси перехватывает] → Сервер
      Клиент не настраивает прокси.
      Трафик перенаправляется на прокси сетевым оборудованием (iptables, роутер).

    Методы перехвата:
      iptables REDIRECT/TPROXY - на Linux шлюзе.
      Policy Based Routing - на маршрутизаторе.
      WCCP (Web Cache Communication Protocol) - на Cisco оборудовании.
      Inline устройство (network tap) - в разрыв сети.

    Применение:
      Корпоративная фильтрация - все HTTP запросы проходят через Squid.
      Кэширование на уровне провайдера.
      Captive portal - перехват для страницы авторизации (гостевой Wi-Fi).
      SSL Inspection (MITM) - расшифровка HTTPS в корпоративной сети.

### Перехват трафика через iptables

    # Перенаправить HTTP трафик на Squid (порт 3128)
    # На шлюзе/роутере:

    # REDIRECT - меняет dst порт, src IP остаётся
    iptables -t nat -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j REDIRECT --to-port 3128

    # Исключить сам прокси-сервер (иначе петля)
    iptables -t nat -A PREROUTING -s 127.0.0.1 -j RETURN
    iptables -t nat -A PREROUTING -d 192.168.1.1 -j RETURN

    # TPROXY - более мощный, сохраняет оригинальный dst IP
    # Нужен для Squid в режиме tproxy
    iptables -t mangle -A PREROUTING -i eth1 -p tcp --dport 80 \
      -j TPROXY --tproxy-mark 1/1 --on-port 3128
    ip rule add fwmark 1 lookup 100
    ip route add local 0.0.0.0/0 dev lo table 100

    # Прозрачный режим в Squid
    http_port 3128 intercept      # для REDIRECT
    # http_port 3129 tproxy       # для TPROXY

    # Проверить правила
    iptables -t nat -L PREROUTING -n -v

### SSL Inspection (HTTPS Interception)

    SSL Inspection (MITM прокси) - расшифровка HTTPS трафика.
    Корпоративные прокси (Zscaler, Cisco Umbrella, BlueCoat, Squid с bump).

    Как работает:
      1. Клиент → Прокси: ClientHello (CONNECT или прозрачный).
      2. Прокси генерирует поддельный сертификат для example.com,
         подписанный корпоративным CA.
      3. Клиент проверяет сертификат → OK (корп. CA в доверенных).
      4. Прокси устанавливает реальное TLS соединение с example.com.
      5. Прокси видит весь трафик в открытом виде.
      6. Прокси может логировать, фильтровать, блокировать.

    Схема:
      Клиент ←TLS с поддельным cert→ Прокси ←TLS с реальным cert→ Сервер

    Требования:
      Корпоративный CA сертификат должен быть установлен на клиентах.
      Обычно распространяется через GPO (Windows AD) или MDM.

    Squid с SSL Bump:
      # /etc/squid/squid.conf
      http_port 3128 ssl-bump \
        cert=/etc/squid/ssl/ca.crt \
        key=/etc/squid/ssl/ca.key \
        generate-host-certificates=on \
        dynamic_cert_mem_cache_size=4MB

      # Правила bump
      acl step1 at_step SslBump1
      ssl_bump peek step1           # посмотреть SNI
      ssl_bump bump all             # расшифровать всё
      # ssl_bump splice banking     # не расшифровывать банки

    Этические и правовые аспекты:
      SSL Inspection - это MITM атака, легальная только при согласии пользователей.
      Корпоративная политика должна уведомлять сотрудников.
      Нельзя применять к личным устройствам без согласия.
      В некоторых странах требует законодательного разрешения.

    Certificate Pinning как защита:
      Некоторые приложения (мобильные банки, мессенджеры) делают pinning.
      Pinning = приложение знает конкретный сертификат сервера.
      Поддельный сертификат прокси → приложение отказывает соединение.

### Captive Portal

    Captive Portal - перехват HTTP для страницы авторизации (гостевой Wi-Fi, отели).

    Поток:
      1. Клиент подключается к Wi-Fi.
      2. Клиент делает HTTP запрос к любому сайту.
      3. Прозрачный прокси перехватывает → редирект на portal.example.com/login.
      4. Клиент вводит данные на портале.
      5. Портал добавляет MAC/IP клиента в whitelist.
      6. Следующие запросы проходят без перехвата.

    iptables для captive portal:
      # Все неаутентифицированные клиенты
      iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 \
        ! -d 192.168.1.1 -j DNAT --to-destination 192.168.1.1:8080

      iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 \
        ! -d 192.168.1.1 -j DNAT --to-destination 192.168.1.1:8443

      # После авторизации добавить в whitelist:
      iptables -I FORWARD -s <client_ip> -j ACCEPT

    Инструменты: NoDogSplash, CoovaChilli, pfSense Captive Portal.

---

## SOCKS прокси

SOCKS (Socket Secure) - универсальный прокси протокол на транспортном уровне. Работает с любым TCP/UDP трафиком, не только HTTP.

    SOCKS4:
      Только TCP.
      Только IPv4.
      Нет аутентификации.

    SOCKS4a:
      SOCKS4 + разрешение DNS на стороне прокси.

    SOCKS5 (RFC 1928):
      TCP и UDP.
      IPv4 и IPv6.
      DNS через прокси (предотвращает DNS leak).
      Аутентификация (логин/пароль или GSS-API).

    Отличие от HTTP прокси:
      HTTP прокси: понимает HTTP, может изменять заголовки.
      SOCKS прокси: слепой туннель, любой TCP/UDP протокол.
      SOCKS не добавляет X-Forwarded-For.

    # SSH как SOCKS5 прокси
    ssh -D 1080 -N user@remote.server.com
    # -D 1080: SOCKS прокси на локальном порту 1080
    # -N: не выполнять команду (только туннель)

    # Использование SOCKS5
    curl --socks5 127.0.0.1:1080 https://example.com
    curl --socks5-hostname 127.0.0.1:1080 https://example.com  # DNS через прокси

    # Dante - SOCKS сервер
    apt install dante-server
    # /etc/danted.conf
    logoutput: syslog
    internal: 0.0.0.0 port = 1080
    external: eth0
    socksmethod: username
    clientmethod: none
    client pass { from: 10.0.0.0/8 to: 0.0.0.0/0 }
    socks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 method: username }

    # proxychains - любые программы через SOCKS
    apt install proxychains4
    # /etc/proxychains4.conf
    [ProxyList]
    socks5 127.0.0.1 1080
    # Запуск любой программы через прокси:
    proxychains4 curl https://example.com
    proxychains4 nmap -sT target.com

---

## Диагностика прокси

### Тест прокси

    # Проверить HTTP прокси
    curl -x http://proxy.example.com:3128 http://httpbin.org/ip
    curl -x http://user:pass@proxy.example.com:3128 https://httpbin.org/headers

    # Проверить SOCKS5
    curl --socks5-hostname proxy.example.com:1080 https://httpbin.org/ip

    # Проверить CONNECT туннель вручную
    openssl s_client -proxy proxy.example.com:3128 -connect example.com:443

    # Проверить заголовки которые прокси добавляет
    curl -x http://proxy.example.com:3128 https://httpbin.org/headers
    # Видим X-Forwarded-For, Via и другие заголовки прокси

    # Проверить что прокси не блокирует порты
    curl -v -x http://proxy.example.com:3128 https://api.github.com

### Логи Squid

    # Формат access.log
    # time elapsed client action/code size method URL user hierarchy/peer type
    tail -f /var/log/squid/access.log

    # Пример строки:
    # 1714985600.123 245 192.168.1.5 TCP_MISS/200 1234 GET http://example.com/ user1 DIRECT/93.184.216.34 text/html

    # TCP_MISS  - не было в кэше, запрошено у сервера
    # TCP_HIT   - отдано из кэша
    # TCP_DENIED - запрос запрещён ACL
    # TCP_TUNNEL - HTTPS туннель (CONNECT)

    # Анализ логов
    awk '{print $3}' /var/log/squid/access.log | sort | uniq -c | sort -rn | head
    # топ клиентов по числу запросов

    awk '{print $7}' /var/log/squid/access.log | sed 's|https\?://||;s|/.*||' | \
      sort | uniq -c | sort -rn | head
    # топ доменов

    awk '$4 ~ /DENIED/ {print $3, $7}' /var/log/squid/access.log | head
    # заблокированные запросы

### Диагностика Nginx reverse proxy

    # Проверить что Nginx принимает соединения
    ss -tlnp | grep nginx
    curl -v http://localhost/

    # Проверить что backend доступен
    curl -v http://127.0.0.1:8080/

    # Логи Nginx
    tail -f /var/log/nginx/access.log
    tail -f /var/log/nginx/error.log

    # Проверить upstream статус
    # (нужен nginx_upstream_check_module или Nginx Plus)
    curl http://localhost/nginx_status

    # Отладка proxy_pass
    # Временно добавить в location:
    add_header X-Upstream-Addr $upstream_addr;
    add_header X-Upstream-Status $upstream_status;
    add_header X-Cache-Status $upstream_cache_status;

    # Проверить заголовки которые Nginx передаёт backend
    # На backend поднять временный сервер:
    python3 -m http.server 8080
    # или
    nc -l 8080   # и посмотреть сырые заголовки

    # Частые проблемы:
    # 502 Bad Gateway  - backend не отвечает или недоступен
    # 504 Gateway Timeout - backend отвечает слишком долго
    # 413 Request Entity Too Large - превышен client_max_body_size
    #   Решение: client_max_body_size 100m;
    # 400 Bad Request от backend - неправильные заголовки
    #   Проверить proxy_set_header Host $host;

---

## Сравнение типов прокси

                Forward Proxy       Reverse Proxy       Transparent Proxy
    ─────────────────────────────────────────────────────────────────────────
    Кто знает      клиент              сервер              никто
    Расположение   у клиента           у сервера           в сети (шлюз)
    Настройка      клиент              сервер              только шлюз
    Цель           анонимность,        балансировка,       фильтрация,
                   фильтрация          кэш, SSL offload    кэш, мониторинг
    HTTPS          CONNECT туннель     SSL терминация      SSL Bump (MITM)
    Примеры        Squid, Privoxy      Nginx, HAProxy,     Squid intercept,
                                       Traefik, Envoy      iptables REDIRECT
    Изменяет       заголовки XFF       заголовки XFF       прозрачно
    трафик

---

## Шпаргалка

    Forward Proxy:
      Клиент настраивает прокси явно.
      HTTP: полный URL в запросе (GET http://example.com/).
      HTTPS: CONNECT метод → TCP туннель.
      Заголовки: X-Forwarded-For, Via, Proxy-Authorization.

      # Squid
      http_port 3128
      http_access allow localnet
      squid -k reconfigure

      # Клиент
      export http_proxy=http://proxy:3128
      curl -x http://proxy:3128 https://example.com

    Reverse Proxy:
      Клиент не знает о прокси.
      Балансировка: round-robin, least_conn, ip_hash.
      SSL терминация: TLS на прокси, HTTP к backend.
      Заголовок backend: X-Forwarded-For, X-Real-IP, X-Forwarded-Proto.

      # Nginx upstream
      upstream pool { server 10.0.0.1:8080; server 10.0.0.2:8080; }
      location / { proxy_pass http://pool; }

      # HAProxy
      frontend http_front
        bind *:80
        default_backend web_servers

    Transparent Proxy:
      iptables перенаправляет трафик на прокси.
      Клиент не настраивается.
      HTTP: intercept режим Squid.
      HTTPS: SSL Bump (MITM, нужен корп. CA).

      # iptables
      iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3128
      # Squid
      http_port 3128 intercept

    SOCKS5:
      Универсальный туннель (любой TCP/UDP).
      DNS через прокси (нет DNS leak).
      ssh -D 1080 user@server    # быстрый SOCKS5 через SSH
      curl --socks5-hostname 127.0.0.1:1080 https://example.com

    Диагностика:
      curl -x http://proxy:3128 https://httpbin.org/headers  - тест прокси + заголовки
      tail -f /var/log/squid/access.log   - логи Squid
      tail -f /var/log/nginx/error.log    - ошибки Nginx
      iptables -t nat -L -n -v            - правила перехвата
      ss -tlnp | grep -E 'nginx|squid'    - открытые порты

    Коды в логах Squid:
      TCP_HIT    - из кэша
      TCP_MISS   - от сервера
      TCP_DENIED - запрещено ACL
      TCP_TUNNEL - HTTPS CONNECT туннель

---

## Ссылки

- [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) - HTTP Authentication (Proxy-Authorization)
- [RFC 7239](https://www.rfc-editor.org/rfc/rfc7239) - Forwarded HTTP Extension
- [RFC 1928](https://www.rfc-editor.org/rfc/rfc1928) - SOCKS Protocol Version 5
- [Squid Docs](http://www.squid-cache.org/Doc/) - документация Squid
- [Nginx Proxy Module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) - модуль proxy Nginx
- [HAProxy Docs](https://www.haproxy.org/download/2.8/doc/configuration.txt) - конфигурация HAProxy
- [Nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html) - балансировка в Nginx
- [Traefik Docs](https://doc.traefik.io/traefik/) - современный reverse proxy для контейнеров
- [Envoy Proxy](https://www.envoyproxy.io/docs) - прокси для микросервисов (Istio, service mesh)
