---
title: "DNS - рекурсивный vs итеративный резолвинг"
date: "2026-04-29"
---

Когда ты вводишь google.com в браузере, происходит цепочка DNS запросов. Есть два принципиально разных способа как эти запросы обрабатываются - рекурсивный и итеративный. Понимание разницы помогает диагностировать проблемы, настраивать резолверы и понимать где что может сломаться.

---

## Итеративный резолвинг

При итеративном резолвинге клиент сам обходит всю иерархию DNS. Каждый сервер отвечает "не знаю, но спроси вот того" и клиент делает следующий запрос сам.

```
Клиент сам обходит иерархию:

Клиент          Root сервер      .com сервер      google.com NS
  │                  │                │                  │
  │  google.com?     │                │                  │
  │─────────────────►│                │                  │
  │                  │                │                  │
  │  Не знаю.        │                │                  │
  │  Спроси .com NS: │                │                  │
  │  192.5.6.30      │                │                  │
  │◄─────────────────│                │                  │
  │                  │                │                  │
  │  google.com?                      │                  │
  │──────────────────────────────────►│                  │
  │                  │                │                  │
  │                  │  Не знаю.      │                  │
  │                  │  Спроси NS:    │                  │
  │                  │  216.239.32.10 │                  │
  │◄──────────────────────────────────│                  │
  │                  │                │                  │
  │  google.com?                                         │
  │─────────────────────────────────────────────────────►│
  │                  │                │                  │
  │  142.250.74.46   │                │                  │
  │◄─────────────────────────────────────────────────────│
```

```
Особенности итеративного резолвинга:
  - Клиент делает несколько запросов сам
  - Каждый сервер отвечает частичным ответом (referral) или финальным
  - Нагрузка на клиента выше
  - Нагрузка на DNS серверы ниже (каждый отвечает только за своё)
  - Так работает dig +trace и большинство авторитативных серверов

Тип ответа "referral":
  ;; flags: qr ra          ← ra = recursion available
  ;; AUTHORITY SECTION:
  com.  172800  IN  NS  a.gtld-servers.net.
  ;; ADDITIONAL SECTION:
  a.gtld-servers.net.  172800  IN  A  192.5.6.30
  (сервер говорит: "спроси вот этих")
```

---

## Рекурсивный резолвинг

При рекурсивном резолвинге клиент делает один запрос, а резолвер берёт всю работу на себя - сам обходит иерархию и возвращает клиенту готовый ответ.

```
Клиент делает один запрос, резолвер делает всё:

Клиент        Рекурсивный резолвер     Root       .com NS    google NS
  │                   │                  │            │           │
  │  google.com?      │                  │            │           │
  │──────────────────►│                  │            │           │
  │                   │  google.com?     │            │           │
  │                   │─────────────────►│            │           │
  │                   │  referral→.com   │            │           │
  │                   │◄─────────────────│            │           │
  │                   │  google.com?                  │           │
  │                   │──────────────────────────────►│           │
  │                   │  referral→google NS           │           │
  │                   │◄──────────────────────────────│           │
  │                   │  google.com?                              │
  │                   │──────────────────────────────────────────►│
  │                   │  142.250.74.46                            │
  │                   │◄──────────────────────────────────────────│
  │  142.250.74.46    │                  │            │           │
  │◄──────────────────│                  │            │           │
  │  (один запрос!)   │                  │            │           │
```

```
Особенности рекурсивного резолвинга:
  - Клиент делает один запрос и получает готовый ответ
  - Резолвер берёт всю работу на себя
  - Кэширует промежуточные и финальные ответы
  - Нагрузка на резолвер выше
  - Нагрузка на клиента минимальна
  - Так работает твой ПК (через /etc/resolv.conf)

Флаг RD (Recursion Desired):
  Клиент ставит RD=1 в запросе → "хочу рекурсивный ответ"
  Если резолвер поддерживает рекурсию → отвечает полным ответом
  Если не поддерживает → отвечает referral (итеративно)

Флаг RA (Recursion Available):
  Сервер ставит RA=1 в ответе → "я поддерживаю рекурсию"
  Root серверы: RA=0 (не делают рекурсию)
  8.8.8.8, 1.1.1.1: RA=1 (рекурсивные резолверы)
```

---

## Сравнение: рекурсивный vs итеративный

```
                    Итеративный              Рекурсивный
                    ───────────              ───────────
Кто делает работу   Клиент                   Резолвер
Запросов у клиента  Много (3-5+)             Один
Кэширование         Нет (на клиенте)         Да (на резолвере)
Нагрузка клиента    Высокая                  Минимальная
Нагрузка резолвера  Низкая                   Высокая
Где используется    Резолверы↔DNS серверы    Клиент↔Резолвер
Root серверы        Только итеративно        Не поддерживают рекурсию
Авторитативные NS   Только итеративно        Обычно не поддерживают рекурсию
Публичные резолверы Оба                      Для клиентов - рекурсивно
```

```
Ключевой момент:
  Клиент (браузер, ОС) → Рекурсивный резолвер (8.8.8.8)
       └── рекурсивный запрос (RD=1)

  Рекурсивный резолвер → Root / TLD / Authoritative
       └── итеративные запросы (обходит иерархию сам)

То есть в реальности используются ОБА подхода:
  - Между клиентом и резолвером: рекурсивный
  - Между резолвером и DNS иерархией: итеративный
```

---

## Флаги DNS запросов

```
В каждом DNS пакете есть заголовок с флагами.
Они определяют тип запроса и ответа.

Запрос (Query):
  QR  = 0  (это запрос, не ответ)
  RD  = 1  (хочу рекурсивный ответ)
  RD  = 0  (итеративный, дай referral если не знаешь)

Ответ (Response):
  QR  = 1  (это ответ)
  AA  = 1  (Authoritative Answer - авторитативный ответ, сервер владеет зоной)
  AA  = 0  (не авторитативный - из кэша или referral)
  RA  = 1  (Recursion Available - сервер поддерживает рекурсию)
  TC  = 1  (Truncated - ответ обрезан, повтори через TCP)
  AD  = 1  (Authenticated Data - DNSSEC проверен)
  CD  = 1  (Checking Disabled - не проверять DNSSEC)
```

```
# Посмотреть флаги в ответе dig
dig A google.com

# ;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
# ;; flags: qr rd ra; QUERY: 1, ANSWER: 1

# qr = Query Response (это ответ)
# rd = Recursion Desired (клиент просил рекурсию)
# ra = Recursion Available (сервер поддерживает рекурсию)
# aa = Authoritative Answer (если есть - ответ от владельца зоны)

# Запрос без рекурсии (итеративный)
dig A google.com @8.8.8.8 +norecurse
# ;; flags: qr ra; (нет rd - мы не просили рекурсию)
# Если 8.8.8.8 не знает - вернёт referral

# Запрос напрямую к авторитативному серверу
dig A google.com @ns1.google.com
# ;; flags: qr aa; (aa = authoritative answer, нет ra - рекурсия не поддерживается)
```

---

## Кэширование в рекурсивном резолвере

Рекурсивный резолвер кэширует ответы - это главная причина почему рекурсия выгодна для клиентов.

```
Первый запрос google.com (кэш пуст):
  Резолвер → Root → .com NS → google.com NS → 142.250.74.46
  Время: ~50-200мс (несколько RTT)

  Резолвер сохраняет в кэше:
    google.com. A 142.250.74.46  TTL=300
    google.com. NS ns1.google.com  TTL=86400
    com. NS a.gtld-servers.net  TTL=172800

Второй запрос google.com (кэш есть):
  Резолвер → берёт из кэша → 142.250.74.46
  Время: <1мс

Третий запрос mail.google.com (частичный кэш):
  Резолвер знает NS для google.com (из кэша)
  Резолвер → ns1.google.com → 172.217.x.x
  Время: ~10-30мс (один hop, не с нуля)
```

```
# Посмотреть TTL в ответе (сколько осталось в кэше)
dig A google.com @8.8.8.8
# google.com. 287 IN A 142.250.74.46
#              ^^^ TTL уменьшается каждую секунду

# Подождать и запросить снова - TTL уменьшился
sleep 10
dig A google.com @8.8.8.8
# google.com. 277 IN A 142.250.74.46  ← было 287, теперь 277

# Когда TTL = 0 → резолвер делает новый запрос к авторитативному серверу

# Посмотреть статистику кэша (systemd-resolved)
resolvectl statistics
# Current Cache Size: 42
# Cache Hits: 1234
# Cache Misses: 56

# Сбросить кэш
resolvectl flush-caches
```

### Негативный кэш

```
Негативный кэш (Negative Caching, RFC 2308):
  NXDOMAIN (домен не существует) тоже кэшируется.
  NODATA (тип записи не существует) тоже кэшируется.

Как долго? По TTL в поле minimum SOA записи:
  example.com.  IN  SOA  ns1... (
    ...
    300  ; minimum - NXDOMAIN кэшируется 300 секунд
  )

Пример:
  dig A несуществующий.example.com @8.8.8.8
  → NXDOMAIN (закэшировано на 300 сек)
  
  Ты добавил A запись для несуществующий.example.com
  Но ещё 300 секунд резолвер будет отвечать NXDOMAIN из кэша!

Решение при миграции: снижай minimum TTL заранее.
Проверить minimum TTL:
  dig SOA example.com +short
  # ns1.. admin.. 2024042601 3600 900 604800 300
  #                                                ^^^
  #                                           minimum = 300 сек
```

---

## Как dig +trace работает изнутри

`dig +trace` - самый полезный инструмент для понимания итеративного резолвинга. Он имитирует работу рекурсивного резолвера вручную.

```
dig A google.com +trace

; <<>> DiG 9.18 <<>> A google.com +trace
;; global options: +cmd

.                  518400  IN  NS  a.root-servers.net.    ← Root серверы
.                  518400  IN  NS  b.root-servers.net.       (берёт из hints файла)
...
;; Received 811 bytes from 198.41.0.4#53(a.root-servers.net) in 12 ms

com.               172800  IN  NS  a.gtld-servers.net.    ← TLD серверы для .com
com.               172800  IN  NS  b.gtld-servers.net.       (ответил root сервер)
...
;; Received 1169 bytes from 192.5.6.30#53(a.gtld-servers.net) in 8 ms

google.com.        172800  IN  NS  ns1.google.com.        ← NS для google.com
google.com.        172800  IN  NS  ns2.google.com.           (ответил .com сервер)
...
;; Received 292 bytes from 216.239.32.10#53(ns1.google.com) in 3 ms

google.com.        300     IN  A   142.250.74.46           ← Финальный ответ
;; Received 55 bytes from 216.239.32.10#53(ns1.google.com) in 3 ms
```

```
# Трассировка для разных типов записей
dig MX gmail.com +trace
dig AAAA google.com +trace
dig NS example.com +trace

# Трассировка с подробным выводом
dig A google.com +trace +additional   # показывает glue records

# Трассировка только от определённой точки (если знаешь NS)
dig A google.com @ns1.google.com      # спросить авторитативный сервер напрямую

# Посмотреть весь путь включая RTT каждого шага
dig A google.com +trace +stats
```

---

## Open Resolver - проблема безопасности

```
Open Resolver - рекурсивный резолвер который отвечает на запросы
от ЛЮБОГО IP адреса в интернете.

Проблемы:
  1. DNS Amplification DDoS:
     Атакующий (spoofed src=жертва) → Open Resolver
     Маленький запрос → большой ответ → жертва получает флуд
     
  2. Cache Poisoning (отравление кэша):
     Атакующий пытается подложить поддельный ответ в кэш резолвера
     Если успешно - все пользователи резолвера получают поддельные данные
     Защита: DNSSEC, рандомизация source port (RFC 5452)

  3. Использование чужих ресурсов:
     Твой резолвер обрабатывает запросы всего интернета

Как проверить что ты не Open Resolver:
  # С внешней машины или через dig с внешним IP:
  dig A google.com @твой.сервер.ip
  # Если вернул ответ - ты открытый резолвер (плохо!)
  # Если REFUSED - правильно настроен

  # Онлайн проверка:
  # openresolver.com
  # dnsinspect.com
```

```
# Закрыть Open Resolver в BIND (named.conf):
options {
    recursion yes;
    allow-recursion { 192.168.0.0/16; 10.0.0.0/8; 127.0.0.1; };
    # только для своей сети
};

# В Unbound (unbound.conf):
server:
    access-control: 0.0.0.0/0 refuse         # всем отказать
    access-control: 192.168.0.0/16 allow      # своя сеть
    access-control: 127.0.0.0/8 allow

# Проверить настройки
named-checkconf /etc/named.conf
unbound-checkconf /etc/unbound/unbound.conf
```

---

## DNS Cache Poisoning - отравление кэша

```
Атака Камински (2008) - самая известная атака на DNS кэш:

Нормальный процесс:
  Резолвер → запрос к NS сервера (с random transaction ID)
  NS → ответ с тем же transaction ID → резолвер принимает

Атака:
  1. Атакующий просит резолвер разрешить random.example.com
  2. Резолвер отправляет запрос к NS example.com
  3. Атакующий флудит резолвер поддельными ответами с разными transaction ID
  4. Если угадал ID (16 бит = 65536 вариантов) → кэш отравлен
  5. Теперь example.com → IP атакующего для всех пользователей резолвера

Защиты:
  - Source Port Randomization (RFC 5452): не только ID рандомный,
    но и UDP source port (добавляет ещё 16 бит случайности)
  - DNSSEC: подпись отвечает, атакующий не может подделать
  - 0x20 encoding: рандомизация регистра букв в запросе
    (gOoGlE.CoM - авторитативный сервер должен сохранить регистр)
```

```
# Проверить рандомизацию source port
tcpdump -i eth0 -n 'udp and dst port 53' -c 10
# Смотрим src port: должны быть разные числа > 1024

# Проверить DNSSEC на резолвере
dig A google.com +dnssec | grep flags
# flags: qr rd ra ad   ← "ad" = DNSSEC проверяется

# Проверить версию и патчи BIND/Unbound
named -v
unbound -V
```

---

## Forwarder - промежуточный резолвер

```
Forwarder (forwarding resolver) - резолвер который не обходит
иерархию сам, а передаёт запросы другому резолверу.

Зачем нужен:
  - Корпоративная сеть: внутренние домены → локальный DNS
                        внешние домены → 8.8.8.8
  - Split-horizon: company.local резолвится только внутри
  - Фильтрация: форвардер фильтрует нежелательные домены
  - Кэширование на уровне офиса

Схема:
  ПК → Корпоративный DNS (форвардер)
              │
              ├── company.local? → Авторитативный сервер company.local
              │
              └── google.com? → 8.8.8.8 (внешний резолвер)
```

```
# Настроить forwarder в BIND:
options {
    forwarders { 8.8.8.8; 8.8.4.4; };
    forward only;    # только форвардинг, не обходить иерархию
    # forward first; # сначала форвардер, если нет - обходить иерархию
};

# Conditional forwarder (только для определённых зон):
zone "company.local" {
    type forward;
    forwarders { 10.0.0.1; };  # внутренний DNS сервер
};

# В Unbound (unbound.conf):
forward-zone:
    name: "."
    forward-addr: 8.8.8.8
    forward-addr: 8.8.4.4

# Conditional forward в Unbound:
forward-zone:
    name: "company.local."
    forward-addr: 10.0.0.1
```

```
# Проверить куда форвардятся запросы
dig A google.com @корпоративный.dns +norecurse
# Если вернул referral - не форвардит (итеративный)
# Если вернул готовый ответ - форвардит (рекурсивный)

# systemd-resolved: посмотреть DNS серверы и домены
resolvectl status
# Per-Link DNS Server Routing:
# eth0: 8.8.8.8 (for .)
# vpn0: 10.0.0.1 (for company.local)

# Добавить conditional forwarder через systemd-resolved
resolvectl dns vpn0 10.0.0.1
resolvectl domain vpn0 company.local
```

---

## Negative TTL и NXDOMAIN caching

```
Практическая проблема: ты добавил DNS запись, но она "не видна".

Сценарий:
  1. Кто-то запросил несуществующий.example.com → NXDOMAIN
  2. Резолвер закэшировал NXDOMAIN на minimum TTL (допустим 3600 сек)
  3. Ты добавил A запись для несуществующий.example.com
  4. Запись уже на авторитативном сервере, но резолвер ещё час
     отвечает NXDOMAIN из кэша

Как определить:
  # Спросить авторитативный сервер напрямую
  dig A несуществующий.example.com @ns1.example.com
  # Если A запись есть - проблема в кэше

  # Спросить публичный резолвер
  dig A несуществующий.example.com @1.1.1.1
  # Сравнить с ответом @8.8.8.8

Решения:
  # Подождать (TTL истечёт)
  # Сбросить кэш на своём резолвере
  resolvectl flush-caches

  # Проверить minimum TTL в SOA (снизить заранее)
  dig SOA example.com +short
  # Последнее число = minimum TTL для негативного кэша
```

---

## Диагностика: где сломалось?

```
Проблема: домен не резолвится.
Нужно найти на каком шаге иерархии проблема.

Шаг 1 - проверить локальный резолвер
  dig A домен.com
  cat /etc/resolv.conf          # кто резолвер?
  resolvectl status             # статус systemd-resolved

Шаг 2 - обойти локальный резолвер
  dig A домен.com @8.8.8.8     # Google
  dig A домен.com @1.1.1.1     # Cloudflare
  # Если здесь работает - проблема в локальном резолвере

Шаг 3 - итеративный обход вручную
  dig A домен.com +trace
  # Смотрим где цепочка обрывается:
  # Root → .com → ОК
  # .com → домен.com NS → ОК
  # домен.com NS → timeout → проблема в авторитативном NS

Шаг 4 - спросить каждый уровень вручную
  # Root серверы знают .com?
  dig NS com. @a.root-servers.net
  
  # .com сервер знает NS для домена?
  dig NS домен.com @a.gtld-servers.net
  
  # Авторитативный NS отвечает?
  dig A домен.com @ns1.домен.com
  
  # NS имеет A запись (glue record)?
  dig A ns1.домен.com

Шаг 5 - проверить распространение NS изменений
  # Если недавно меняли NS записи
  dig NS домен.com @a.root-servers.net    # что знает root?
  dig NS домен.com @a.gtld-servers.net   # что знает TLD?
  dig NS домен.com @8.8.8.8             # что знает резолвер?
  # Все должны показывать одни и те же NS
```

```
# Полезные инструменты диагностики

# Проверить авторитативность ответа
dig A google.com @ns1.google.com | grep flags
# flags: qr aa    ← aa = authoritative answer

# Проверить есть ли рекурсия у сервера
dig A google.com @8.8.8.8 | grep flags
# flags: qr rd ra  ← ra = recursion available

# Сравнить ответы разных резолверов
for ns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo "$ns: $(dig A google.com @$ns +short)"
done

# Измерить время резолвинга на каждом шаге
dig A google.com +trace +stats 2>&1 | grep "msec"

# Найти авторитативный сервер для домена
dig NS google.com +short
# ns1.google.com.  ns2.google.com.  ns3.google.com.  ns4.google.com.

# Проверить все NS серверы зоны
for ns in $(dig NS google.com +short); do
  echo "$ns: $(dig A google.com @$ns +short) [$(dig SOA google.com @$ns +short | awk '{print $3}')]"
done
# Показывает IP ответ и serial для каждого NS
```

---

## Локальные резолверы - systemd-resolved, unbound, dnsmasq

### systemd-resolved

```
Стандартный резолвер в Ubuntu/Debian/Fedora.
Слушает на 127.0.0.53:53 (stub resolver).

Конфиг: /etc/systemd/resolved.conf
[Resolve]
DNS=8.8.8.8 8.8.4.4          # основные резолверы
FallbackDNS=1.1.1.1 9.9.9.9  # резервные
Domains=~.                    # для всех доменов
DNSSEC=yes                    # включить DNSSEC
DNSOverTLS=yes                # DoT
Cache=yes                     # кэш включён
```

```
# Статус и диагностика systemd-resolved
resolvectl status
resolvectl statistics
resolvectl query google.com        # резолвинг через resolved
resolvectl flush-caches            # сбросить кэш
resolvectl monitor                 # следить за запросами в реальном времени

# Посмотреть какой DNS используется для какого домена
resolvectl status | grep "DNS Server"

# Логи
journalctl -u systemd-resolved -f
journalctl -u systemd-resolved --since "10 minutes ago"
```

### unbound

```
Полноценный рекурсивный резолвер с DNSSEC, кэшем, rate limiting.
Хорош для сервера / роутера.

Конфиг: /etc/unbound/unbound.conf
server:
    interface: 127.0.0.1
    interface: ::1
    port: 53
    
    # Кто может делать запросы
    access-control: 127.0.0.0/8 allow
    access-control: 192.168.0.0/16 allow
    access-control: 0.0.0.0/0 refuse
    
    # DNSSEC
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    
    # Кэш
    cache-max-ttl: 86400
    cache-min-ttl: 60
    neg-cache-size: 4m
    
    # Rate limiting (защита от DDoS)
    ratelimit: 1000
    
    # Prefetch (обновлять кэш до истечения TTL)
    prefetch: yes
    prefetch-key: yes
```

```
# Управление unbound
systemctl start unbound
systemctl enable unbound
unbound-checkconf                  # проверить конфиг

# Статистика
unbound-control stats
unbound-control stats_noreset      # без сброса счётчиков

# Кэш
unbound-control dump_cache         # посмотреть весь кэш
unbound-control flush google.com   # удалить из кэша
unbound-control flush_zone google.com  # удалить всю зону

# DNSSEC
unbound-anchor -a /var/lib/unbound/root.key  # обновить root key

# Логи
unbound-control verbosity 2        # включить подробные логи
journalctl -u unbound -f
```

### dnsmasq

```
Лёгкий резолвер + DHCP сервер. Популярен на роутерах (OpenWrt).

Конфиг: /etc/dnsmasq.conf
# Слушать только на локальных интерфейсах
interface=lo
interface=eth0

# Форвард к вышестоящему резолверу
server=8.8.8.8
server=8.8.4.4

# Кэш
cache-size=1000

# Локальный домен
local=/local/
domain=local

# Статические DNS записи
address=/myhost.local/192.168.1.100
```

```
# Управление dnsmasq
systemctl restart dnsmasq
dnsmasq --test                     # проверить конфиг

# Проверить что слушает
ss -ulnp | grep dnsmasq

# Логи
journalctl -u dnsmasq -f
# Включить подробные логи:
# log-queries в dnsmasq.conf
```

---

## Шпаргалка

```
Два режима резолвинга:
  Итеративный:   клиент сам обходит root → TLD → NS → ответ
  Рекурсивный:   клиент → резолвер (тот сам всё обходит) → ответ

На практике:
  Клиент ↔ Резолвер:        рекурсивный (RD=1)
  Резолвер ↔ DNS иерархия:  итеративный (referral'ы)

Флаги в DNS пакете:
  RD = Recursion Desired   (клиент хочет рекурсию)
  RA = Recursion Available  (сервер поддерживает рекурсию)
  AA = Authoritative Answer (ответ от владельца зоны)
  AD = Authenticated Data   (DNSSEC проверен)
  TC = Truncated            (ответ обрезан, повтори через TCP)

dig флаги диагностики:
  +trace       - итеративный обход вручную (показывает весь путь)
  +norecurse   - не просить рекурсию (итеративный запрос)
  +short       - только данные ответа
  +dnssec      - показать DNSSEC записи
  @сервер      - спросить конкретный сервер

Диагностика:
  dig A домен +trace                 - весь путь от root
  dig A домен @8.8.8.8              - проверить через Google
  dig A домен @ns1.домен            - спросить авторитативный сервер
  dig SOA домен +short              - серийный номер и negative TTL
  resolvectl flush-caches           - сбросить кэш локального резолвера
  resolvectl statistics             - статистика кэша
  resolvectl monitor                - мониторинг запросов в реальном времени

Безопасность:
  Open Resolver - опасно (DDoS amplification)
  Закрыть: allow-recursion { своя_сеть; }
  Cache Poisoning: защита через DNSSEC + source port randomization
```

---

## Ссылки

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names: Concepts (рекурсивный и итеративный режимы)
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names: Implementation
- [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308) - Negative Caching of DNS Queries
- [RFC 5452](https://www.rfc-editor.org/rfc/rfc5452) - Measures for Making DNS More Resilient (source port randomization)
- [RFC 7766](https://www.rfc-editor.org/rfc/rfc7766) - DNS Transport over TCP
- [unbound.net](https://nlnetlabs.nl/projects/unbound/) - Unbound документация
- [DNS Flag Day](https://dnsflagday.net) - история изменений в DNS
