---
title: "DNS - записи, как работает, диагностика"
date: "2026-04-27"
---

DNS (Domain Name System) - распределённая иерархическая база данных, которая переводит доменные имена в IP адреса и хранит другую информацию о доменах. Без DNS интернет работал бы только по IP адресам. Определён в RFC 1034 и RFC 1035 (1987).

---

## Как работает DNS - общая картина

```
Браузер хочет узнать IP для google.com:

Клиент                Рекурсивный           Root          .com          google.com
(твой ПК)             Резолвер              Сервер        Сервер        Nameserver
   │                     │                    │              │               │
   │  google.com?        │                    │              │               │
   │────────────────────►│                    │              │               │
   │                     │  google.com?       │              │               │
   │                     │───────────────────►│              │               │
   │                     │  спроси .com NS    │              │               │
   │                     │◄───────────────────│              │               │
   │                     │  google.com?                      │               │
   │                     │──────────────────────────────────►│               │
   │                     │  спроси google.com NS             │               │
   │                     │◄──────────────────────────────────│               │
   │                     │  google.com?                                      │
   │                     │──────────────────────────────────────────────────►│
   │                     │  142.250.74.46                                    │
   │                     │◄──────────────────────────────────────────────────│
   │  142.250.74.46      │                    │              │               │
   │◄────────────────────│                    │              │               │
   │  (кэшируется TTL)   │                    │              │               │
```

```
Иерархия DNS:
  . (root)
  ├── com
  │   ├── google.com
  │   ├── example.com
  │   └── ...
  ├── ru
  │   ├── yandex.ru
  │   └── ...
  ├── org
  └── ...

Корневые серверы (root): 13 кластеров (a.root-servers.net ... m.root-servers.net)
Знают только адреса TLD серверов (.com, .ru, .org...)

TLD серверы (.com, .ru...): знают только NS записи доменов

Authoritative серверы: хранят реальные DNS записи домена
```

### Типы DNS серверов

```
Recursive Resolver (рекурсивный резолвер):
  - Делает всю работу за клиента: обходит root → TLD → authoritative
  - Кэширует ответы (по TTL)
  - Примеры: 8.8.8.8 (Google), 1.1.1.1 (Cloudflare), твой роутер
  - На Linux настраивается в /etc/resolv.conf

Authoritative Server (авторитативный):
  - Хранит DNS зону (реальные A, MX, CNAME записи)
  - Даёт окончательный ответ для своего домена
  - Примеры: ns1.cloudflare.com, ns1.google.com

Forwarding Resolver:
  - Принимает запросы и перенаправляет к другому резолверу
  - Сам не обходит иерархию
  - Используется в корпоративных сетях (split-horizon DNS)

Root Server:
  - 13 адресов (a-m.root-servers.net), реально сотни серверов через anycast
  - Знает NS для всех TLD
  - Список захардкожен в каждом резолвере ("hints file")
```

---

## DNS записи - все типы

### A - IPv4 адрес

```
Формат:
  name  TTL  class  type  data
  host  300  IN     A     192.0.2.1

Примеры:
  google.com.     300  IN  A  142.250.74.46
  www.example.com 3600 IN  A  93.184.216.34
  @               3600 IN  A  1.2.3.4          (@  = корень домена)
  *               3600 IN  A  1.2.3.4          (*  = wildcard)

Один домен может иметь несколько A записей:
  google.com.  300  IN  A  142.250.74.46
  google.com.  300  IN  A  142.250.74.78
  google.com.  300  IN  A  142.250.74.110
  → DNS round-robin (балансировка нагрузки)

TTL (Time To Live):
  Сколько секунд резолверы кэшируют ответ.
  Низкий TTL (60-300) - изменения распространяются быстро, но нагрузка выше.
  Высокий TTL (3600-86400) - меньше запросов, изменения медленнее.
  Перед миграцией: снизить TTL заранее (за 24-48 часов).
```

```
# Запросить A запись
dig A google.com
dig google.com                    # A по умолчанию
dig A google.com +short           # только IP
dig A google.com @8.8.8.8         # спросить конкретный резолвер
dig A google.com @8.8.8.8 +norecurse  # только у этого сервера (не рекурсивно)

# nslookup
nslookup google.com
nslookup google.com 8.8.8.8

# host
host google.com
host -t A google.com
```

### AAAA - IPv6 адрес

```
Аналог A записи, но для IPv6. Название "AAAA" - потому что IPv6 адрес
в 4 раза длиннее IPv4 (128 vs 32 бит).

Примеры:
  google.com.  300  IN  AAAA  2a00:1450:4001:82b::200e
  example.com. 3600 IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

Домен с dual-stack (есть и A и AAAA):
  google.com.  300  IN  A     142.250.74.46
  google.com.  300  IN  AAAA  2a00:1450:4001:82b::200e

  Клиент получает оба адреса.
  Happy Eyeballs (RFC 8305): пробует IPv6 первым, если не
  подключился за 250мс - пробует IPv4 параллельно.
```

```
# Запросить AAAA запись
dig AAAA google.com
dig AAAA google.com +short
dig AAAA ipv6.google.com          # только IPv6

# Проверить dual-stack
dig google.com A
dig google.com AAAA
# или оба сразу:
dig google.com ANY                # осторожно: многие серверы игнорируют ANY
```

### MX - почтовый сервер

```
Указывает какой сервер принимает почту для домена.

Формат:
  name  TTL  IN  MX  priority  mail-server

Примеры:
  gmail.com.  3600  IN  MX  5   gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  10  alt1.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  20  alt2.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  30  alt3.gmail-smtp-in.l.google.com.
  gmail.com.  3600  IN  MX  40  alt4.gmail-smtp-in.l.google.com.

Priority (приоритет):
  Меньше число = выше приоритет.
  SMTP клиент пробует MX с наименьшим числом первым.
  Если недоступен - переходит к следующему.
  Одинаковые числа = равный приоритет (round-robin).

Важно:
  MX запись указывает на hostname, НЕ на IP адрес.
  Для этого hostname должна быть A/AAAA запись.
  MX не может указывать на CNAME - это запрещено (RFC 2181).
```

```
# Запросить MX записи
dig MX gmail.com
dig MX gmail.com +short
# 5 gmail-smtp-in.l.google.com.
# 10 alt1.gmail-smtp-in.l.google.com.

# Проверить что hostname в MX имеет A запись
dig A gmail-smtp-in.l.google.com

# Симулировать SMTP подключение (проверить почтовый сервер)
telnet gmail-smtp-in.l.google.com 25
# или через openssl для STARTTLS:
openssl s_client -connect gmail-smtp-in.l.google.com:25 -starttls smtp
```

### CNAME - псевдоним (алиас)

```
Создаёт псевдоним - одно имя указывает на другое.
Резолвер сначала разрешает CNAME, потом разрешает цель.

Формат:
  alias  TTL  IN  CNAME  canonical-name

Примеры:
  www.example.com.    3600  IN  CNAME  example.com.
  mail.example.com.   3600  IN  CNAME  ghs.googlehosted.com.
  cdn.example.com.    3600  IN  CNAME  example.cdn.cloudflare.net.

Цепочки CNAME:
  foo.example.com → bar.example.com → baz.example.com → 1.2.3.4
  Каждый уровень требует отдельного запроса. Длинные цепочки = медленнее.
  Рекомендуется не более 3-4 уровней.

Ограничения CNAME - НЕЛЬЗЯ:
  - На корень домена (@): нельзя делать example.com CNAME на что-то
    (потому что на @ должны быть SOA и NS записи)
    Решение: ALIAS/ANAME запись (не стандарт, у многих DNS провайдеров есть)
  - MX не может указывать на CNAME (RFC 2181)
  - NS не может указывать на CNAME
  - CNAME нельзя соседствовать с другими записями того же имени
    (кроме DNSSEC записей)
```

```
# Запросить CNAME
dig CNAME www.google.com
# www.google.com. 300 IN CNAME www3.l.google.com.

# Проследить всю цепочку
dig www.google.com +trace

# Получить финальный A адрес (резолвер разворачивает цепочку сам)
dig A www.google.com
# Покажет и CNAME и итоговый A
```

### NS - nameserver записи

```
Указывают какие серверы являются авторитативными для домена.

Формат:
  name  TTL  IN  NS  nameserver

Примеры:
  google.com.  86400  IN  NS  ns1.google.com.
  google.com.  86400  IN  NS  ns2.google.com.
  google.com.  86400  IN  NS  ns3.google.com.
  google.com.  86400  IN  NS  ns4.google.com.

Обычно 2-4 NS сервера (для отказоустойчивости).

Делегирование (delegation):
  Когда TLD (.com) говорит "google.com управляется этими NS" -
  это делегирование. NS записи у TLD называются "glue records"
  если NS сервер находится внутри делегируемого домена:
  
  Проблема: ns1.google.com. IN NS → нужно знать IP ns1.google.com,
  но ns1.google.com внутри google.com → курица и яйцо.
  Решение: glue record - IP ns1.google.com прописывается прямо
  в зоне .com, без отдельного запроса.
```

```
# Запросить NS записи
dig NS google.com
dig NS google.com +short
# ns1.google.com.
# ns2.google.com.
# ns3.google.com.
# ns4.google.com.

# Спросить NS напрямую у авторитативного сервера
dig NS google.com @ns1.google.com

# Проверить делегирование (что TLD знает правильные NS)
dig NS google.com @a.gtld-servers.net   # TLD сервер для .com
```

### PTR - обратный DNS (reverse DNS)

```
Обратное разрешение: IP адрес → hostname.
Используется: почтовые серверы (anti-spam), логи, диагностика.

Специальный домен:
  IPv4: in-addr.arpa     (октеты в обратном порядке)
  IPv6: ip6.arpa         (нибблы в обратном порядке)

IPv4 пример:
  IP: 1.2.3.4
  PTR запись: 4.3.2.1.in-addr.arpa.  →  host.example.com.

IPv6 пример:
  IP: 2001:db8::1
  Полный вид: 2001:0db8:0000:0000:0000:0000:0000:0001
  Развернуть все нибблы в обратном порядке:
  1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
  PTR → host.example.com.

Forward-confirmed reverse DNS (FCrDNS):
  PTR для 1.2.3.4 = mail.example.com
  A для mail.example.com = 1.2.3.4
  Совпадает → FCrDNS настроен корректно.
  Почтовые серверы требуют FCrDNS, иначе письма идут в спам.
```

```
# Обратный запрос
dig -x 8.8.8.8
dig -x 8.8.8.8 +short
# dns.google.

dig -x 2001:4860:4860::8888 +short
# dns.google.

# Развернуть вручную
dig PTR 8.8.8.8.in-addr.arpa
dig PTR 8.8.4.4.in-addr.arpa

# host
host 8.8.8.8
# 8.8.8.8.in-addr.arpa domain name pointer dns.google.

# nslookup
nslookup 8.8.8.8

# Проверить FCrDNS (почтовый сервер)
# 1. узнать PTR для IP
dig -x 1.2.3.4 +short          # mail.example.com
# 2. узнать A для полученного hostname
dig A mail.example.com +short  # должно вернуть 1.2.3.4
```

### TXT - текстовые записи

```
Произвольный текст. Используется для верификации и email-защиты.

Формат:
  name  TTL  IN  TXT  "text content"

Главные применения:

1. SPF (Sender Policy Framework) - кто может слать почту от имени домена:
   example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"
   
   Операторы:
     +  pass (разрешено)      ip4:1.2.3.4
     -  fail (запрещено)      -all
     ~  softfail (подозрит.)  ~all
     ?  neutral               ?all
   
   include: - включить SPF другого домена
   ip4:/ip6: - конкретные адреса
   a: / mx: - A/MX записи домена
   all - всё остальное

2. DKIM (DomainKeys Identified Mail) - подпись письма:
   selector._domainkey.example.com.  IN  TXT
     "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."
   
   Письмо подписывается приватным ключом.
   Публичный ключ в DNS (TXT запись).
   Получатель проверяет подпись.

3. DMARC - политика для SPF+DKIM:
   _dmarc.example.com.  IN  TXT
     "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"
   
   p=none    - мониторинг, не блокировать
   p=quarantine - в спам
   p=reject  - отклонить письмо

4. Верификация домена (Google, GitHub, Cloudflare...):
   example.com.  IN  TXT  "google-site-verification=abc123..."
   example.com.  IN  TXT  "MS=ms12345678"  (Microsoft)

5. ACME (Let's Encrypt DNS challenge):
   _acme-challenge.example.com.  IN  TXT  "random-token-value"
```

```
# Запросить TXT записи
dig TXT example.com
dig TXT example.com +short

# Проверить SPF
dig TXT example.com | grep spf

# Проверить DKIM (нужно знать selector)
dig TXT selector._domainkey.example.com
# Узнать selector из заголовка письма: DKIM-Signature: s=selector

# Проверить DMARC
dig TXT _dmarc.example.com
dig TXT _dmarc.gmail.com +short

# Онлайн проверка SPF/DKIM/DMARC
# mxtoolbox.com/SuperTool.aspx
```

### SOA - Start of Authority

```
Обязательная запись для каждой DNS зоны. Содержит метаданные зоны.

Формат:
  name  TTL  IN  SOA  primary-ns  admin-email  (
    serial      ; серийный номер зоны
    refresh     ; как часто secondary проверяет обновления
    retry       ; как часто повторять если primary недоступен
    expire      ; когда secondary считает зону устаревшей
    minimum     ; TTL для negative caching (NXDOMAIN)
  )

Пример:
  example.com.  3600  IN  SOA  ns1.example.com.  admin.example.com.  (
    2024042601  ; serial (часто формат YYYYMMDDNN)
    3600        ; refresh (1 час)
    900         ; retry (15 минут)
    604800      ; expire (1 неделя)
    300         ; minimum TTL / negative TTL
  )

admin.example.com = admin@example.com (первая точка = @)

Serial number:
  Должен увеличиваться при каждом изменении зоны.
  Secondary серверы синхронизируются если serial у primary выше.
  Формат YYYYMMDDNN удобен: 2024042601 = 26 апреля 2024, версия 01.
```

```
# Запросить SOA
dig SOA example.com
dig SOA google.com +short

# Проверить серийный номер на разных NS серверах
dig SOA example.com @ns1.example.com | grep SOA
dig SOA example.com @ns2.example.com | grep SOA
# Серийные номера должны совпадать. Разные = secondary не синхронизирован.
```

### SRV - сервисные записи

```
Указывают где искать конкретный сервис (порт + хост).

Формат:
  _service._proto.name  TTL  IN  SRV  priority  weight  port  target

Примеры:
  _sip._tcp.example.com.     IN  SRV  10  60  5060  sip.example.com.
  _xmpp-client._tcp.jabber.org.  IN  SRV  5   0   5222  xmpp.jabber.org.
  _minecraft._tcp.example.com.   IN  SRV  0   5  25565  mc.example.com.

Priority: меньше = выше приоритет (как MX)
Weight: при равном приоритете - вероятность выбора (больше = чаще)
  weight 60 и weight 40 = 60% и 40% трафика соответственно

Применения:
  SIP телефония, XMPP, Minecraft, Kubernetes (kube-dns), Office 365 автонастройка
```

```
# Запросить SRV
dig SRV _sip._tcp.example.com
dig SRV _minecraft._tcp.example.com

# Office 365 autodiscovery
dig SRV _autodiscover._tcp.example.com
```

### CAA - авторизация центра сертификации

```
Указывает какие CA (Certificate Authority) могут выпускать сертификаты.
Защита от выдачи сертификатов посторонними CA.

Примеры:
  example.com.  IN  CAA  0  issue    "letsencrypt.org"
  example.com.  IN  CAA  0  issuewild ";"        (запрет wildcard сертификатов)
  example.com.  IN  CAA  0  iodef    "mailto:security@example.com"

issue:     разрешить выпуск обычных сертификатов
issuewild: разрешить wildcard (*.example.com)
iodef:     куда сообщать о нарушениях
";"        - никому не разрешено (полный запрет)
```

```
# Запросить CAA
dig CAA example.com
dig CAA google.com +short
# 0 issue "pki.goog"
# 0 issue "symantec.com"
```

---

## Зоны и Zone Transfer

```
DNS зона - файл с записями для домена.

Пример файла зоны (BIND формат):
$ORIGIN example.com.
$TTL 3600

@   IN  SOA  ns1.example.com.  admin.example.com. (
                2024042601  ; serial
                3600        ; refresh
                900         ; retry
                604800      ; expire
                300 )       ; minimum

; NS записи
@       IN  NS   ns1.example.com.
@       IN  NS   ns2.example.com.

; A записи
@       IN  A    93.184.216.34
www     IN  A    93.184.216.34
mail    IN  A    93.184.216.50
ns1     IN  A    93.184.216.60
ns2     IN  A    93.184.216.61

; AAAA
@       IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

; MX
@       IN  MX   10  mail.example.com.

; CNAME
ftp     IN  CNAME  @

; TXT
@       IN  TXT  "v=spf1 ip4:93.184.216.50 ~all"
```

```
# Zone Transfer - получить все записи зоны (только если разрешено)
dig AXFR example.com @ns1.example.com

# Проверить позволяет ли сервер AXFR (должен запрещать посторонним)
dig AXFR zonetransfer.me @nsztm1.digi.ninja    # учебный пример с открытым AXFR

# Incremental Zone Transfer
dig IXFR=2024042601 example.com @ns1.example.com
```

---

## DNS кэширование и TTL

```
Как работает кэш:

Резолвер получил ответ: A 142.250.74.46, TTL=300
→ Хранит 300 секунд
→ Следующие запросы до истечения TTL отвечает из кэша
→ Через 300 секунд делает новый запрос

Негативный кэш (NXDOMAIN):
  Если домен не существует - тоже кэшируется.
  На сколько? По TTL в SOA minimum поле.
  
TTL стратегия:
  Стабильные записи (NS, MX):   86400 (сутки) и выше
  Обычные A/AAAA записи:        3600 (час)
  Балансировка / CDN:            60-300 (минуты)
  Перед миграцией:               снизить до 60-300 за 24-48 часов
  После миграции:                поднять обратно
```

```
# Посмотреть кэш системного резолвера (systemd-resolved)
resolvectl statistics
resolvectl flush-caches           # сбросить кэш

# Сбросить кэш DNS на Linux
# systemd-resolved:
systemctl restart systemd-resolved
# или:
resolvectl flush-caches

# nscd:
nscd -i hosts

# Посмотреть текущий резолвер
resolvectl status
cat /etc/resolv.conf

# Проверить TTL ответа
dig A google.com | grep -A1 'ANSWER SECTION'
# google.com. 299 IN A 142.250.74.46
#              ^^^ TTL (уменьшается каждую секунду)
```

---

## DNSSEC - подпись зон

```
DNSSEC добавляет криптографическую подпись к DNS ответам.
Защищает от cache poisoning (подмены DNS ответов).

Записи DNSSEC:
  RRSIG   - цифровая подпись набора записей
  DNSKEY  - публичный ключ зоны
  DS      - хэш DNSKEY (хранится у родительской зоны)
  NSEC/NSEC3 - доказательство несуществования имени

Цепочка доверия:
  . (root) → .com (DS) → google.com (DNSKEY → RRSIG)
  Корневая зона подписана IANA, всё остальное наследует доверие.

Проверить DNSSEC:
  dig A google.com +dnssec
  dig A google.com +dnssec +cd    # +cd = отключить проверку (только данные)
  
  В ответе:
  ;; flags: qr rd ra ad    ← "ad" = Authenticated Data (DNSSEC проверен)
  ;; flags: qr rd ra       ← нет "ad" = DNSSEC не проверен/не настроен
```

```
# Проверить DNSSEC подпись
dig A cloudflare.com +dnssec +short
dig DNSKEY cloudflare.com
dig DS cloudflare.com @a.gtld-servers.com

# Онлайн проверка DNSSEC
# dnssec-analyzer.verisignlabs.com
# dnsviz.net
```

---

## DNS over HTTPS и DNS over TLS

```
Обычный DNS: UDP/TCP порт 53, не зашифрован.
Провайдер / кто угодно в сети видит все DNS запросы.

DoT (DNS over TLS, RFC 7858):
  Порт: 853
  DNS в TLS туннеле
  Клиент: systemd-resolved, unbound

DoH (DNS over HTTPS, RFC 8484):
  Порт: 443 (стандартный HTTPS)
  DNS в HTTPS запросах
  Трудно заблокировать (смешивается с обычным HTTPS)
  Клиент: браузеры (Firefox, Chrome), адрес: /dns-query

Публичные DoH серверы:
  Cloudflare:  https://1.1.1.1/dns-query
  Google:      https://8.8.8.8/dns-query
  Quad9:       https://9.9.9.9/dns-query
```

```
# Запрос через DoH (curl)
curl -s "https://1.1.1.1/dns-query?name=google.com&type=A" \
  -H "accept: application/dns-json" | python3 -m json.tool

# dig через DoT (нужен kdig из knot-dnsutils)
kdig @1.1.1.1 +tls google.com A

# Настроить DoT в systemd-resolved
# /etc/systemd/resolved.conf:
# [Resolve]
# DNS=1.1.1.1#cloudflare-dns.com 8.8.8.8#dns.google
# DNSOverTLS=yes

systemctl restart systemd-resolved
resolvectl status | grep 'DNS over TLS'
```

---

## Диагностика DNS

### Полный цикл диагностики

```
Проблема: домен не резолвится

Шаг 1 - базовая проверка
  dig A проблемный.домен
  # Если NXDOMAIN - домена нет в DNS или опечатка
  # Если SERVFAIL - сервер вернул ошибку (DNSSEC, зона broken)
  # Если timeout - резолвер недоступен

Шаг 2 - проверить разные резолверы
  dig A проблемный.домен @8.8.8.8
  dig A проблемный.домен @1.1.1.1
  dig A проблемный.домен @9.9.9.9
  # Если у одного работает, у другого нет - проблема в конкретном резолвере

Шаг 3 - обойти DNS иерархию вручную
  dig A проблемный.домен +trace
  # Покажет весь путь от root до ответа

Шаг 4 - спросить авторитативный сервер напрямую
  dig NS проблемный.домен @8.8.8.8    # узнать NS
  dig A проблемный.домен @ns1.example.com  # спросить напрямую

Шаг 5 - проверить SOA и распространение
  dig SOA проблемный.домен @ns1.example.com
  dig SOA проблемный.домен @ns2.example.com
  # Серийные номера должны совпадать
```

### Коды ответов DNS (RCODE)

```
NOERROR  (0) - успех
FORMERR  (1) - ошибка формата запроса
SERVFAIL (2) - сервер не смог обработать (DNSSEC failure, зона broken)
NXDOMAIN (3) - домен не существует
NOTIMP   (4) - сервер не поддерживает этот тип запроса
REFUSED  (5) - сервер отказал (нет рекурсии, нет доступа)

Посмотреть RCODE в ответе dig:
  dig A несуществующий.домен
  ;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 12345
                                           ^^^^^^^^
```

### Проблема: медленная резолвция

```
# Измерить время резолвинга
time dig A google.com
# real 0m0.023s - быстро (ответ из кэша)
# real 0m0.280s - медленно (полный обход DNS)

# Посмотреть query time в ответе dig
dig A google.com | grep "Query time"
# ;; Query time: 23 msec

# Проверить что кэш работает (повторный запрос должен быть быстрее)
dig A google.com @8.8.8.8
dig A google.com @8.8.8.8   # второй раз - должен быть из кэша (TTL уменьшился)

# Проверить /etc/resolv.conf
cat /etc/resolv.conf
# nameserver 127.0.0.53     - systemd-resolved (норма для Ubuntu)
# nameserver 8.8.8.8        - Google DNS напрямую

# Если резолвер далеко - задержка большая
# mtr -n 8.8.8.8           # посмотреть latency до резолвера
```

### Проблема: split-horizon DNS

```
Split-horizon (split-brain): один домен разрешается по-разному
внутри корпоративной сети и снаружи.

Пример:
  Извне: api.company.com → 203.0.113.50 (публичный IP)
  Внутри: api.company.com → 10.0.1.50 (внутренний IP)

Диагностика:
  # Резолвер в корп. сети
  dig A api.company.com @10.0.0.1
  # Внешний резолвер
  dig A api.company.com @8.8.8.8
  # Сравнить ответы

Настройка через /etc/hosts (простое переопределение):
  echo "10.0.1.50 api.company.com" >> /etc/hosts

Через systemd-resolved (split-dns для VPN):
  resolvectl dns vpn0 10.0.0.1
  resolvectl domain vpn0 company.com
```

### Полезные однострочники

```
# Все записи домена (если сервер позволяет)
dig ANY example.com @ns1.example.com

# Проверить SPF/DKIM/DMARC/MX одной командой
for type in TXT MX NS A AAAA; do echo "=== $type ==="; dig $type example.com +short; done

# Проверить почтовые настройки
dig MX example.com +short
dig TXT example.com +short | grep -E 'spf|dkim|dmarc'
dig TXT _dmarc.example.com +short

# Найти все поддомены через AXFR (если разрешено)
dig AXFR example.com @ns1.example.com

# Batch запросы
cat domains.txt | while read d; do echo "$d: $(dig A $d +short)"; done

# Проверить PTR для списка IP
echo "8.8.8.8 8.8.4.4 1.1.1.1" | tr ' ' '\n' | while read ip; do
  echo "$ip → $(dig -x $ip +short)"
done

# Мониторинг: оповещение если A запись изменилась
OLD=$(dig A example.com +short)
sleep 60
NEW=$(dig A example.com +short)
[ "$OLD" != "$NEW" ] && echo "DNS изменился: $OLD → $NEW"
```

---

## Проблемы и решения

| Симптом | Вероятная причина | Решение |
| --- | --- | --- |
| NXDOMAIN | Домен не существует / опечатка | Проверить имя, NS серверы |
| SERVFAIL | Сломанный DNSSEC / недоступный NS | dig +cd (без DNSSEC проверки), проверить NS |
| Timeout | Резолвер недоступен | Проверить /etc/resolv.conf, другой резолвер |
| Медленно | Резолвер далеко, нет кэша | Сменить резолвер, включить локальный кэш |
| Разные ответы | Не разошлось после изменения | Подождать TTL, сбросить кэш |
| Письма в спам | SPF/DKIM/DMARC не настроен | Настроить TXT записи |
| Cert error | CAA запись запрещает CA | Добавить CA в CAA запись |
| NS не синхронизированы | Разные serial в SOA | Проверить репликацию зоны |

---

## Шпаргалка

```
Основные записи:
  A      hostname → IPv4 (1.2.3.4)
  AAAA   hostname → IPv6 (2001:db8::1)
  CNAME  псевдоним → другое имя (нельзя на @, нельзя для MX/NS)
  MX     домен → почтовый сервер (+ приоритет)
  NS     домен → авторитативный nameserver
  PTR    IP → hostname (обратный DNS, in-addr.arpa)
  TXT    произвольный текст (SPF, DKIM, DMARC, верификация)
  SOA    метаданные зоны (serial, TTL, primary NS)
  SRV    _service._proto → host:port (+ priority, weight)
  CAA    кто может выпускать сертификаты

Диагностика:
  dig A example.com              - A запись
  dig A example.com +short       - только IP
  dig A example.com @8.8.8.8     - конкретный резолвер
  dig A example.com +trace       - полный путь от root
  dig -x 8.8.8.8                 - обратный DNS (PTR)
  dig SOA example.com            - метаданные зоны
  dig AXFR example.com @ns1      - все записи зоны
  dig ANY example.com            - все типы (часто ограничено)

Email проверка:
  dig MX example.com             - почтовые серверы
  dig TXT example.com            - SPF, DKIM, DMARC
  dig TXT _dmarc.example.com     - DMARC политика
  dig TXT selector._domainkey.example.com  - DKIM ключ

Коды ответов:
  NOERROR  - успех
  NXDOMAIN - домен не существует
  SERVFAIL - ошибка сервера (DNSSEC, broken zone)
  REFUSED  - сервер отказал

TTL стратегия:
  Перед изменением: снизить до 300 за 24-48 ч
  Стабильные записи: 3600-86400
  CDN / балансировка: 60-300
  Негативный кэш (NXDOMAIN): SOA minimum
```

---

## Ссылки

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names: Concepts and Facilities
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names: Implementation and Specification
- [RFC 2181](https://www.rfc-editor.org/rfc/rfc2181) - Clarifications to DNS (в т.ч. MX → не CNAME)
- [RFC 7858](https://www.rfc-editor.org/rfc/rfc7858) - DNS over TLS (DoT)
- [RFC 8484](https://www.rfc-editor.org/rfc/rfc8484) - DNS over HTTPS (DoH)
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - DNSSEC Resource Records
- [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) - DMARC
- [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208) - SPF
- [dnsviz.net](https://dnsviz.net) - визуализация DNS/DNSSEC цепочки
- [mxtoolbox.com](https://mxtoolbox.com/SuperTool.aspx) - проверка MX/SPF/DMARC/blacklist
