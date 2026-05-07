---
title: "CDN, Load Balancer - принципы работы"
date: "2026-05-07"
---

CDN и Load Balancer решают разные задачи, но часто работают вместе. CDN распределяет статический контент географически, Load Balancer распределяет запросы между серверами в одном месте.

---

## Load Balancer

### Что такое Load Balancer

Load Balancer (балансировщик нагрузки) принимает входящие запросы и распределяет их между несколькими серверами (backend / upstream).

```
Клиенты                Load Balancer            Backend серверы
                       ┌────────────┐
Client 1 ─────────────►│            │──────────► Server 1 (192.168.1.10)
Client 2 ─────────────►│  LB        │──────────► Server 2 (192.168.1.11)
Client 3 ─────────────►│            │──────────► Server 3 (192.168.1.12)
                       └────────────┘

Один IP/DNS -> множество серверов за ним.
Клиент не знает какой конкретно сервер обрабатывает его запрос.
```

### Зачем нужен Load Balancer

```
1. Горизонтальное масштабирование
   Добавить 10 серверов по 2 CPU лучше чем один сервер с 20 CPU.
   Проще и дешевле масштабировать.

2. Отказоустойчивость (High Availability)
   Если один сервер упал - остальные продолжают работать.
   LB перестаёт отправлять запросы на упавший сервер.

3. Равномерная нагрузка
   Без LB один сервер может быть перегружен, другой простаивать.

4. Rolling updates / zero downtime deploys
   Обновлять серверы по одному, не останавливая сервис.
   Вывести сервер из ротации -> обновить -> вернуть обратно.

5. Health checks
   LB постоянно проверяет живость серверов.
   Автоматически убирает упавшие серверы из пула.
```

### Уровни балансировки (L4 vs L7)

```
L4 Load Balancer (Transport Layer):
- Работает с TCP/UDP пакетами
- Не смотрит на содержимое (HTTP заголовки, URL)
- Быстрее, меньше overhead
- Балансировка по IP:Port
- Примеры: HAProxy в TCP режиме, AWS NLB, LVS

Пример L4 решения:
  Клиент подключается к LB 1.2.3.4:443
  LB перенаправляет TCP соединение на 10.0.0.1:443 или 10.0.0.2:443
  LB не видит HTTP содержимого, только TCP потоки

L7 Load Balancer (Application Layer):
- Работает с содержимым запроса (HTTP, gRPC, WebSocket)
- Может маршрутизировать по URL, заголовкам, Cookie
- Может модифицировать запросы и ответы
- Может терминировать TLS
- Примеры: nginx, HAProxy в HTTP режиме, AWS ALB, Traefik

Пример L7 решения:
  GET /api/users   -> backend группа "api-servers"
  GET /images/     -> backend группа "static-servers"
  POST /upload/    -> backend группа "upload-servers"
```

### Алгоритмы балансировки

```
Round Robin (по очереди):
  Запрос 1 -> Server 1
  Запрос 2 -> Server 2
  Запрос 3 -> Server 3
  Запрос 4 -> Server 1 (по кругу)
  Плюсы: просто, равномерно
  Минусы: не учитывает реальную нагрузку серверов

Weighted Round Robin:
  Server 1: weight=3 (мощный)
  Server 2: weight=1 (слабый)
  Из 4 запросов: 3 на Server 1, 1 на Server 2
  Плюсы: учитывает разную мощность серверов

Least Connections:
  Запрос идёт на сервер с наименьшим числом активных соединений
  Плюсы: лучше для запросов разной длительности
  Минусы: нужно хранить счётчики

Least Response Time:
  Запрос идёт на сервер с наименьшим временем ответа
  LB измеряет RTT к каждому backend
  Плюсы: адаптивный, учитывает реальную производительность

IP Hash:
  hash(client_ip) % N_servers -> всегда один сервер
  Плюсы: один клиент всегда попадает на один сервер (sticky)
  Минусы: неравномерно если мало клиентов

Consistent Hashing:
  Продвинутый вариант IP Hash
  Добавление/удаление сервера перераспределяет минимум запросов
  Используется в CDN, кешировании (Memcached, Redis Cluster)

Random:
  Случайный выбор сервера
  Простой, работает хорошо при большом числе запросов

Resource Based (Adaptive):
  LB запрашивает метрики у серверов (CPU, RAM, очередь)
  Отправляет на наименее загруженный
  Сложнее в реализации
```

### Health Checks

```
Active Health Check - LB сам опрашивает серверы:

HTTP check:
  GET /health HTTP/1.1
  Ожидаем: 200 OK
  Интервал: каждые 5 секунд
  Таймаут: 2 секунды
  Unhealthy: 3 неудачи подряд
  Healthy: 2 успеха подряд

TCP check:
  Открыть TCP соединение на порт 80
  Если соединение установлено - сервер жив

Passive Health Check (анализ реального трафика):
  Если сервер возвращает 5xx ошибки - пометить как нездоровый
  Если соединения зависают - пометить как нездоровый

Состояния сервера:
  UP       - принимает трафик
  DOWN     - не принимает трафик, LB не отправляет
  DRAINING - старые соединения обслуживает, новые не принимает
             (используется для graceful shutdown при деплое)
  MAINT    - ручное обслуживание, исключён из ротации
```

### Session Persistence (Sticky Sessions)

```
Проблема: пользователь залогинился на Server 1, сессия хранится там.
Следующий запрос попал на Server 2 - сессии нет, пользователь разлогинен.

Решения:

1. Cookie-based persistence (рекомендуется)
   LB вставляет Cookie с ID сервера:
   Set-Cookie: SERVERID=server1; Path=/
   Все следующие запросы с этой Cookie -> на server1

2. IP-based persistence
   hash(client_ip) -> всегда один сервер
   Минус: один IP может быть за NAT (целый офис = 1 сервер)

3. Source IP + Port Hash
   Лучше чем просто IP для NAT случаев

4. Лучшее решение: вынести сессии из серверов
   Хранить сессии в Redis / Memcached
   Любой сервер может обработать любой запрос
   Не нужен sticky session совсем
```

### SSL/TLS Termination

```
SSL Termination на LB:

Клиент ──HTTPS──► LB (терминирует TLS) ──HTTP──► Backend серверы
                   │
                   Расшифровывает трафик здесь
                   Backend видит открытый HTTP

Плюсы:
- Backend серверы не тратят CPU на TLS
- Сертификат в одном месте (на LB)
- LB может инспектировать трафик (L7)

Минусы:
- Трафик между LB и backend незашифрован
- Нужна защищённая внутренняя сеть

SSL Passthrough:
Клиент ──HTTPS──► LB (не трогает TLS) ──HTTPS──► Backend
LB не видит содержимое, только перенаправляет TCP
Плюсы: end-to-end шифрование
Минусы: нет L7 маршрутизации, нельзя смотреть на HTTP заголовки

SSL Re-encryption (Bridge):
Клиент ──HTTPS──► LB (терминирует, анализирует) ──HTTPS──► Backend
Плюсы: и L7 маршрутизация, и шифрование на всём пути
Минусы: двойная нагрузка TLS
```

### nginx как Load Balancer

```nginx
# /etc/nginx/nginx.conf

http {
    # Upstream группа серверов
    upstream backend {
        # Алгоритм (по умолчанию Round Robin)
        # least_conn;          # Least Connections
        # ip_hash;             # IP Hash (sticky)
        # least_time header;   # Least Response Time (nginx plus)

        server 192.168.1.10:8080 weight=3;
        server 192.168.1.11:8080 weight=1;
        server 192.168.1.12:8080 backup;   # только при падении остальных

        keepalive 32;    # keepalive соединения к backend
    }

    upstream api_servers {
        least_conn;
        server 10.0.0.1:3000;
        server 10.0.0.2:3000;
        server 10.0.0.3:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;
        listen 443 ssl;

        ssl_certificate     /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;

        # Балансировка по URL
        location /api/ {
            proxy_pass http://api_servers;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            proxy_pass http://backend;
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
        }
    }
}
```

### HAProxy как Load Balancer

```
# /etc/haproxy/haproxy.cfg

global
    maxconn 50000
    log /dev/log local0

defaults
    mode http              # или tcp для L4
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    option httplog
    option dontlognull
    option forwardfor      # добавить X-Forwarded-For

frontend http_in
    bind *:80
    bind *:443 ssl crt /etc/ssl/bundle.pem
    redirect scheme https if !{ ssl_fc }

    # ACL правила маршрутизации
    acl is_api path_beg /api/
    acl is_static path_beg /static/ /images/ /css/ /js/

    use_backend api_pool    if is_api
    use_backend static_pool if is_static
    default_backend web_pool

backend web_pool
    balance roundrobin
    option httpchk GET /health HTTP/1.1\r\nHost:\ localhost
    http-check expect status 200

    server web1 192.168.1.10:8080 check inter 5s rise 2 fall 3
    server web2 192.168.1.11:8080 check inter 5s rise 2 fall 3
    server web3 192.168.1.12:8080 check inter 5s rise 2 fall 3 backup

backend api_pool
    balance leastconn
    server api1 10.0.0.1:3000 check
    server api2 10.0.0.2:3000 check
    server api3 10.0.0.3:3000 check

backend static_pool
    balance roundrobin
    server static1 10.0.1.1:80 check
    server static2 10.0.1.2:80 check

# Статистика HAProxy
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth admin:secret
```

---

## CDN - Content Delivery Network

### Что такое CDN

CDN - сеть географически распределённых серверов (Point of Presence, PoP). Каждый PoP хранит кешированные копии контента. Пользователь получает данные от ближайшего PoP, а не от origin сервера.

```
Без CDN:
Пользователь в Токио ──────────────────────────► Origin в Нью-Йорке
                            ~150ms RTT

С CDN:
Пользователь в Токио ──► PoP в Токио ──► Origin в Нью-Йорке
                   ~5ms RTT        (только при cache miss)

CDN PoP хранит копию: пользователь получает ответ за 5ms
Origin получает запрос только при cache miss (первый запрос)
```

### Как CDN работает технически

```
1. DNS-based routing (основной метод):

   Клиент делает DNS запрос: image.example.com
   
   DNS авторитативный сервер CDN смотрит:
   - Откуда запрос (IP клиента)
   - Какой PoP ближайший / наименее загруженный
   - Возвращает IP PoP сервера в Токио
   
   Клиент подключается к PoP в Токио (не к origin!)

2. Anycast routing (BGP Anycast):

   Все PoP объявляют одинаковый IP через BGP
   Интернет-маршрутизация сама выбирает ближайший PoP
   Используется для: Cloudflare, DNS серверов (8.8.8.8, 1.1.1.1)

3. HTTP redirect:

   Origin получает запрос и отдаёт redirect на CDN URL
   Менее эффективно, но просто в реализации
```

### Типы контента в CDN

```
Хорошо кешируется (статический контент):
- Изображения (.jpg, .png, .webp, .svg)
- Видео и аудио (.mp4, .mp3, .hls сегменты)
- CSS, JavaScript файлы
- Шрифты (.woff2, .ttf)
- Документы (.pdf)
- Архивы (.zip, .tar.gz)
- HTML страницы (если не персонализированные)

Плохо кешируется (динамический контент):
- API ответы с персональными данными
- Страницы с авторизацией
- Реалтайм данные (курсы валют, погода)
- Корзина покупок, личный кабинет

Edge computing / Edge Functions:
- Код выполняется прямо на PoP (Cloudflare Workers, Vercel Edge)
- Динамический контент без запроса к origin
- A/B тестирование на уровне CDN
- Геоблокировка, rate limiting на краю сети
```

### Cache-Control заголовки

```
Cache-Control управляет поведением кеша:

Директивы для ответов сервера:
  max-age=3600           - кешировать 3600 секунд (1 час)
  s-maxage=86400         - для CDN/proxy: кешировать 86400 сек (1 день)
                           перекрывает max-age для shared cache
  no-cache               - можно кешировать, но всегда валидировать с сервером
  no-store               - не кешировать нигде (личные данные, банк)
  public                 - можно кешировать всем (CDN, браузер)
  private                - только браузер, не CDN
  must-revalidate        - при истечении кеша обязательно проверить
  stale-while-revalidate=60  - отдавать устаревший кеш пока обновляется
  stale-if-error=86400   - при ошибке origin отдавать кеш до 86400 сек
  immutable              - контент не изменится (для versioned assets)

Примеры:
  # Статика с версионированием (cache busting)
  Cache-Control: public, max-age=31536000, immutable
  # файл: /static/app.abc123.js (хеш в имени)

  # HTML страница
  Cache-Control: public, max-age=0, must-revalidate
  # или
  Cache-Control: no-cache

  # API с персональными данными
  Cache-Control: private, no-store

  # CDN кешируем дольше чем браузер
  Cache-Control: public, max-age=60, s-maxage=86400

Другие заголовки кеша:
  ETag: "abc123"            - хеш содержимого
  Last-Modified: Wed, ...   - дата последнего изменения
  Vary: Accept-Encoding     - разные кеши для разных Accept-Encoding
  Vary: Accept-Language     - разные кеши для разных языков
```

### Cache Miss / Hit

```
Cache HIT:
Клиент ──► CDN PoP (есть в кеше, свежий) ──► Клиент
                   ↑ быстро, origin не задействован

Cache MISS (первый запрос или устаревший кеш):
Клиент ──► CDN PoP (нет в кеше) ──► Origin сервер
                                ◄── Origin отдаёт контент + Cache-Control
           CDN кеширует ────────────────────────────► Клиент

Cache EXPIRED (кеш есть, но устарел):
CDN проверяет с origin через If-None-Match / If-Modified-Since:
  Если не изменилось: Origin -> 304 Not Modified -> CDN обновляет TTL
  Если изменилось:    Origin -> 200 OK + новый контент -> CDN обновляет

Метрика: Cache Hit Ratio (CHR)
  CHR = (cache hits) / (total requests) * 100%
  Хороший CHR: > 90% для статики
  Плохой CHR: < 50% (слишком много cache miss, CDN неэффективен)
```

### Инвалидация кеша (Cache Invalidation)

```
Проблема: файл обновился на origin, но CDN хранит старую версию.

Способы инвалидации:

1. TTL истёк (автоматически)
   Ждать пока max-age истечёт
   Минус: задержка до N секунд

2. API инвалидации CDN провайдера
   Cloudflare: curl -X POST "https://api.cloudflare.com/zones/ZONE_ID/purge_cache"
   AWS CloudFront: aws cloudfront create-invalidation --paths "/*"
   Fastly: PURGE https://example.com/image.jpg
   Минус: обход CDN на первый запрос после инвалидации

3. Cache Busting (лучшее решение для статики)
   Включить хеш содержимого в имя файла или URL:
   /static/app.js             -> устаревает через TTL
   /static/app.abc123.js      -> новый файл = новый URL = нет проблемы
   /static/app.js?v=abc123    -> query string (хуже, некоторые CDN не кешируют)

   Webpack / Vite автоматически добавляют хеш:
   app.js -> app.3f9a2b.js (хеш меняется при изменении файла)
   HTML ссылается на новый URL -> CDN видит новый URL -> новый кеш
```

### CDN и HTTPS / TLS

```
TLS Termination на CDN:
Клиент ──HTTPS──► CDN PoP (терминирует TLS) ──HTTPS──► Origin
                   │
                   Сертификат от CDN провайдера
                   Работает как reverse proxy

Преимущества:
- Сертификаты управляются CDN (автоматическое обновление)
- Клиент подключается к ближайшему PoP (быстрое TLS рукопожатие)
- Origin получает уже расшифрованный трафик (или re-encrypted)
- DDoS защита: CDN поглощает атаки до origin

Origin Pull vs Origin Push:
  Origin Pull (lazy caching):
  - CDN запрашивает контент у origin при первом запросе
  - Автоматически, не нужна настройка
  - Стандартная модель всех CDN

  Origin Push (предварительная загрузка):
  - Заранее загружаешь файлы на CDN
  - Полный контроль, но требует управления
  - Используется для: крупные дистрибутивы ПО, готовящиеся релизы
```

### Популярные CDN провайдеры

```
Cloudflare:
- Крупнейшая сеть (~300 PoP)
- Бесплатный базовый план
- DDoS защита, WAF, Workers (edge functions)
- Anycast IPv4 и IPv6
- Особенность: трафик proxied через Cloudflare (меняет IP)

AWS CloudFront:
- Интеграция с AWS (S3, ALB, API Gateway)
- ~450 PoP (Edge Locations)
- Lambda@Edge и CloudFront Functions
- Pay-per-use

Fastly:
- Программируемый CDN (VCL - Varnish Configuration Language)
- Очень быстрая инвалидация кеша (~150мс)
- Популярен у GitHub, Stripe, NY Times

Akamai:
- Один из старейших CDN (~4000 PoP)
- Enterprise уровень
- Сложный и дорогой

Vercel Edge / Netlify Edge:
- CDN + edge functions в одном (JAMstack)
- Автодеплой из Git

BunnyCDN:
- Доступный по цене
- Хорошее покрытие Европы и Азии
```

---

## CDN + Load Balancer вместе

### Типичная архитектура

```
Интернет
    │
    ▼
[CDN / Edge Layer]
Cloudflare / Fastly / CloudFront
- Кеширование статики
- TLS termination
- DDoS защита
- WAF (Web Application Firewall)
    │
    │ (только cache miss и динамика)
    ▼
[Load Balancer Layer]
nginx / HAProxy / AWS ALB
- Распределение запросов
- Health checks
- SSL (если не терминировали выше)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
[App Server 1]              [App Server 2]
Node.js / Django / Go       Node.js / Django / Go
    │                                  │
    └──────────────┬───────────────────┘
                   ▼
            [Databases]
            PostgreSQL / Redis / S3
```

### Заголовки для определения реального IP

```
Проблема: backend видит IP load balancer или CDN, не клиента.

Решение - заголовки:
  X-Forwarded-For: <client-ip>, <proxy1-ip>, <proxy2-ip>
  X-Real-IP: <client-ip>
  CF-Connecting-IP: <client-ip>   (Cloudflare)
  True-Client-IP: <client-ip>     (Akamai, Cloudflare Enterprise)

Пример цепочки:
  Клиент 1.2.3.4 -> Cloudflare 104.x.x.x -> nginx -> Django

  Заголовки которые получает Django:
  X-Forwarded-For: 1.2.3.4, 104.x.x.x
  X-Real-IP: 1.2.3.4
  CF-Connecting-IP: 1.2.3.4

nginx конфигурация:
  set_real_ip_from 103.21.244.0/22;    # IP диапазоны Cloudflare
  set_real_ip_from 173.245.48.0/20;
  real_ip_header CF-Connecting-IP;

Внимание: доверять X-Forwarded-For можно только от доверенных прокси!
Клиент может подделать заголовок: X-Forwarded-For: 127.0.0.1
```

### Geo-routing и Multi-region

```
Multi-region с CDN и LB:

         ┌─────────────────────────────────────┐
         │         DNS GeoDNS                   │
         │  EU клиенты -> EU region             │
         │  US клиенты -> US region             │
         │  AS клиенты -> Asia region           │
         └─────────────────────────────────────┘
                  │           │           │
                  ▼           ▼           ▼
            [EU CDN]    [US CDN]    [Asia CDN]
                  │           │           │
                  ▼           ▼           ▼
            [EU LB]     [US LB]     [Asia LB]
                  │           │           │
                  ▼           ▼           ▼
           EU Servers   US Servers  Asia Servers

Failover:
  Если US region недоступен -> DNS переключает трафик на EU
  Обычно автоматически через health checks в DNS
```

---

## Диагностика

```bash
# Проверить какой CDN PoP отвечает
curl -sv https://example.com 2>&1 | grep -E 'cf-ray|x-cache|via|server'

# Cloudflare специфичные заголовки
curl -I https://example.com | grep -i 'cf-'
# CF-Ray: 7abc123-AMS (показывает PoP: AMS = Amsterdam)
# CF-Cache-Status: HIT / MISS / EXPIRED

# Проверить Cache-Control заголовки
curl -I https://example.com/static/app.js
# Cache-Control: public, max-age=31536000
# Age: 3600  (сколько секунд файл в кеше)
# X-Cache: Hit from cloudfront

# Traceroute до CDN
traceroute example.com
mtr example.com

# Проверить с разных локаций
# https://tools.keycdn.com/performance
# https://www.cdnplanet.com/tools/cdnfinder/

# Проверить статус Load Balancer (HAProxy stats)
curl http://lb-host:8404/stats

# nginx статус
curl http://lb-host/nginx_status

# Проверить что X-Forwarded-For передаётся
curl -H "X-Forwarded-For: 1.2.3.4" https://example.com/api/myip

# nslookup для разных DNS серверов (GeoDNS проверка)
nslookup example.com 8.8.8.8     # через Google DNS
nslookup example.com 1.1.1.1     # через Cloudflare DNS
# Если GeoDNS - ответы могут отличаться

# dig с трассировкой DNS делегирования
dig +trace example.com
```

---

## Шпаргалка

```
Load Balancer:
  L4 (TCP/UDP)   - быстро, не видит содержимое
  L7 (HTTP)      - медленнее, маршрутизация по URL/заголовкам

Алгоритмы:
  Round Robin        - по очереди (default)
  Weighted RR        - с весами (для разных мощностей)
  Least Connections  - на менее загруженный
  IP Hash            - один клиент -> один сервер (sticky)
  Consistent Hash    - масштабируемый sticky, мало перераспределений

Health Check:
  HTTP: GET /health -> 200 OK
  TCP:  открыть соединение -> успех
  Unhealthy: N fails -> вывести из ротации
  Healthy: N successes -> вернуть в ротацию

Sticky Sessions:
  Cookie-based    - лучший вариант
  IP Hash         - просто, но проблемы с NAT
  Лучше всего: хранить сессии в Redis (убрать нужду в sticky)

SSL Termination:
  На LB   - backend разгружен, трафик внутри открытый
  Passthrough - end-to-end шифрование, нет L7 маршрутизации
  Re-encrypt - лучшее из двух, двойной overhead

CDN:
  Цель: отдавать контент с ближайшего PoP
  DNS routing  - основной метод (GSLB)
  Anycast      - BGP, один IP = ближайший PoP

Cache-Control:
  public, max-age=31536000, immutable  - статика с версионированием
  public, max-age=60, s-maxage=86400   - HTML / API (CDN кешируем дольше)
  private, no-store                    - личные данные

Cache Busting:
  /app.abc123.js   - хеш в имени (лучший вариант)
  /app.js?v=abc123 - query param (хуже)

Метрики:
  Cache Hit Ratio > 90% для статики
  Origin Traffic = полный трафик - cache hits
  Time To First Byte (TTFB) с CDN и без
```

---

## Ссылки

- [HAProxy Documentation](https://www.haproxy.org/download/2.8/doc/configuration.txt) - полная документация
- [nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html) - официальный гайд
- [Cloudflare Learning: CDN](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/) - хорошее объяснение
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) - все директивы
- [AWS: What is a Load Balancer](https://aws.amazon.com/what-is/load-balancing/) - AWS объяснение
- [The Illustrated Children's Guide to Kubernetes](https://www.cncf.io/phippy/) - облачная архитектура
