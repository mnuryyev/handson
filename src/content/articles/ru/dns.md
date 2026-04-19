---
title: "DNS - полный разбор от запроса до ответа"
description: "В данной работе разберём DNS на всех уровнях: от базовых запросов типов A, MX, NS и TXT до трассировки полного пути рекурсии, обратного DNS, зонных передач и настройки собственного локального резолвера"
image: "/images/dns_net/main.jpg"
date: "2026-04-19"
---

## Введение

DNS (Domain Name System) - это распределённая система, предназначенная для преобразования доменных имён в IP-адреса. При вводе адреса сайта в браузере происходит последовательная обработка DNS-запроса через цепочку серверов, начиная с рекурсивного резолвера и заканчивая авторитативными серверами домена, что позволяет получить необходимый IP-адрес для установления соединения.

В данной работе рассматриваются основные уровни и механизмы работы DNS: типы записей (A, MX, NS, TXT и др.), процесс рекурсивного разрешения имён, структура DNS-запросов, обратное разрешение (reverse DNS), зонные передачи, а также принципы настройки локального DNS-резолвера. Также будут приведены практические примеры команд и анализ сетевого взаимодействия.

| Параметр | Значение |
| --- | --- |
| Машина | Parrot OS |
| Инструменты | dig, nslookup, dnsmasq, Wireshark |
| Тестовые домены | google.com, github.com, zonetransfer.me |

---

## Теоретическая база

### Иерархия DNS

DNS устроен как перевёрнутое дерево. Запрос на `google.com` проходит три уровня:

```
. (корневая зона)
    └── com. (TLD — top-level domain)
            └── google.com. (авторитативная зона)
```

**Корневые серверы** (13 штук: a–m.root-servers.net) знают адреса серверов всех TLD. **TLD серверы** (.com, .org, .ru) знают NS-серверы каждого домена. **Авторитативные серверы** домена хранят реальные записи.

### Типы DNS записей

| Тип | Что хранит | Пример |
| --- | --- | --- |
| A | IPv4 адрес | `google.com → 142.250.x.x` |
| AAAA | IPv6 адрес | `google.com → 2a00:...` |
| MX | Почтовый сервер | `google.com → smtp.google.com` |
| NS | Сервер имён зоны | `google.com → ns1.google.com` |
| TXT | Текст (SPF, DKIM, верификация) | `v=spf1 include:...` |
| PTR | Обратный DNS | `8.8.8.8 → dns.google` |
| CNAME | Псевдоним | `www → @` |
| SOA | Начало зоны | Контакт, таймеры, серийный номер |
| CAA | Разрешённые CA для сертификатов | `letsencrypt.org` |

---

## Фаза 1. Установка инструментов

### Шаг 1. Установка пакетов

```bash
sudo apt install dnsutils dnsmasq wireshark -y
dig -v
```

![01_install](/handson/images/dns_net/01_install.png)

`dnsutils` - пакет с утилитами `dig` и `nslookup`. `dnsmasq` - лёгкий локальный DNS-сервер. `wireshark` - для захвата DNS-трафика.

---

## Фаза 2. Базовые типы записей

### Шаг 2. A запись - IPv4 адрес

```bash
dig google.com A
```

![02_dig](/handson/images/dns_net/02_dig.png)

Вывод `dig` разбит на секции:

```
;; QUESTION SECTION:
;google.com.    IN  A           ← что спросили

;; ANSWER SECTION:
google.com. 5  IN  A  142.251.142.238  ← ответ, TTL=5 секунд

;; Query time: 19 msec           ← время ответа
;; SERVER: 10.10.70.2#53         ← какой сервер ответил
```

TTL 5 секунд - очень короткий. Google намеренно держит низкий TTL для быстрого переключения между серверами при балансировке нагрузки.

### Шаг 3. MX запись - почтовые серверы

```bash
dig google.com MX
```

![03_dig_mx](/handson/images/dns_net/03_dig_mx.png)

```
;; ANSWER SECTION:
google.com. 5 IN MX 10 smtp.google.com.

;; ADDITIONAL SECTION:
smtp.google.com.  A  64.233.164.27
smtp.google.com.  A  142.251.1.27
```

Число `10` - приоритет. Чем меньше — тем приоритетнее. ADDITIONAL секция содержит IP-адреса почтовых серверов - DNS сервер добавил их сам, чтобы клиенту не пришлось делать дополнительный запрос.

### Шаг 4. NS запись - серверы имён зоны

```bash
dig google.com NS
```

![04_dig_ns](/handson/images/dns_net/04_dig_ns.png)

```
;; ANSWER SECTION:
google.com. IN NS ns1.google.com.
google.com. IN NS ns2.google.com.
google.com. IN NS ns3.google.com.
google.com. IN NS ns4.google.com.
```

Четыре NS-сервера - резервирование. Если один недоступен, запрос уйдёт к другому.

### Шаг 5. TXT запись - текстовые данные

```bash
dig google.com TXT
```

![05_dig_txt](/handson/images/dns_net/05_dig_txt.png)

```
;; ANSWER SECTION:
google.com. TXT "v=spf1 include:_spf.google.com -all"
google.com. TXT "google-site-verification=..."
google.com. TXT "apple-domain-verification=..."
```

TXT-записи содержат SPF-политику (правила откуда можно отправлять почту от имени домена) и токены верификации владельца домена для разных сервисов. DNS используется как публичное хранилище метаданных.

---

## Фаза 3. Трассировка рекурсии

### Шаг 6. Первый уровень - корневые серверы

```bash
dig +trace google.com
```

![06_dig_trace_1](/handson/images/dns_net/06_dig_trace_1.png)

Первый шаг трассировки - запрос к корневым серверам. Resolver спрашивает у `.` (корневой зоны) кто знает про зону `.com`. Ответ содержит все 13 корневых серверов (a–m.root-servers.net) с их RRSIG-подписями (DNSSEC).

### Шаг 7. Второй и третий уровень - TLD и авторитативный ответ

![07_dig_trace_2](/handson/images/dns_net/07_dig_trace_2.png)

Второй шаг — запрос к TLD серверам зоны `.com`. Ответ содержит 13 серверов `gtld-servers.net` которые знают NS-записи всех доменов в зоне `.com`:

```
com. 172800 IN NS a.gtld-servers.net.
com. 172800 IN NS b.gtld-servers.net.
...
com. 172800 IN NS m.gtld-servers.net.
;; Received 1170 bytes from 192.58.128.30#53(j.root-servers.net) in 3 ms
```

Видны также неудачные попытки подключения к IPv6 адресам (`network unreachable`) - в данной сети IPv6 не настроен. `dig +trace` пробует оба протокола и падает обратно на IPv4.

Третий шаг - запрос к авторитативному серверу `ns2.google.com`, который возвращает финальный ответ `172.217.19.238`.

> `dig +trace` обходит кэш и выполняет полный путь рекурсии вручную - от корневых серверов до авторитативного ответа. Именно так работает рекурсивный резолвер для каждого нового домена.

---

## Фаза 4. Запросы к конкретным серверам

### Шаг 8. Запрос к Google DNS (8.8.8.8)

```bash
dig @8.8.8.8 google.com
```

![09_dns_google](/handson/images/dns_net/09_dns_google.png)

```
;; ANSWER SECTION:
google.com. IN A 216.58.201.206   ← другой IP чем раньше (балансировка)
;; Query time: 133 msec            ← медленнее - удалённый сервер
;; SERVER: 8.8.8.8#53
```

### Шаг 9. Запрос к Cloudflare DNS (1.1.1.1)

```bash
dig @1.1.1.1 google.com
```

![10_dns_cloudflare](/handson/images/dns_net/10_dns_cloudflare.png)

```
;; Query time: 33 msec   ← быстрее 8.8.8.8 в данном тесте
;; SERVER: 1.1.1.1#53
```

### Шаг 10. Кэширование - эффект второго запроса

```bash
dig google.com | grep 'Query time'   # первый запрос
dig google.com | grep 'Query time'   # второй запрос - из кэша
```

![24_google_system](/handson/images/dns_net/24_google_system.png)

```
Query time: 30 msec   ← первый запрос - уходит на сервер
Query time:  3 msec   ← второй запрос - из кэша резолвера
```

Разница в 10 раз. DNS-сервер кэширует ответы до истечения TTL - именно поэтому изменения DNS-записей вступают в силу не мгновенно.

### Шаг 11. Сравнение публичных DNS серверов

```bash
for server in 8.8.8.8 1.1.1.1 9.9.9.9 208.67.222.222; do
    TIME=$(dig @$server google.com | grep 'Query time' | awk '{print $4}')
    echo "$server → ${TIME}ms"
done
```

![25_compare](/handson/images/dns_net/25_compare.png)

```
8.8.8.8          → 60 ms
1.1.1.1          → 23 ms   ← самый быстрый
9.9.9.9          → 26 ms
208.67.222.222   → 73 ms
```

Время зависит от физической близости серверов и загруженности. Cloudflare (1.1.1.1) в данном тесте оказался быстрее всех.

---

## Фаза 5. Обратный DNS

### Шаг 12. PTR запрос через -x

```bash
dig -x 8.8.8.8
dig -x 1.1.1.1
```

![13_ptr](/handson/images/dns_net/13_ptr.png)

```
;; ANSWER SECTION:
8.8.8.8.in-addr.arpa. IN PTR dns.google.
```

### Шаг 13. Как работает обратный DNS

```bash
dig PTR 8.8.8.8.in-addr.arpa
```

![14_ptr_long](/handson/images/dns_net/14_ptr_long.png)

Флаг `-x` - сокращение. Internally DNS переворачивает IP и добавляет `.in-addr.arpa`:
`8.8.8.8` → `8.8.8.8.in-addr.arpa` → PTR запрос → `dns.google`

Обратные зоны нужны для верификации серверов, почтовых систем и журналов безопасности.

---

## Фаза 6. Зонные передачи (AXFR)

### Шаг 14. AXFR на защищённых серверах

```bash
# example.com - защищён
dig axfr @a.iana-servers.net example.com

# google.com - тоже защищён
dig axfr @ns1.google.com google.com
```

![15_axfr_example](/handson/images/dns_net/15_axfr_example.png)

![16_axfr_google](/handson/images/dns_net/16_axfr_google.png)

Оба сервера возвращают `Transfer failed` - современные DNS-серверы запрещают AXFR для всех кроме авторизованных вторичных серверов. Это правильная конфигурация.

### Шаг 15. AXFR на уязвимом тестовом сервере

```bash
dig axfr @nsztm1.digi.ninja zonetransfer.me
```

![17_axfr_zonetransfer](/handson/images/dns_net/17_axfr_zonetransfer.png)

`zonetransfer.me` - домен специально созданный для демонстрации опасности открытых зонных передач. Вся зона отдаётся полностью:

```
zonetransfer.me. 7200 IN SOA    nsztm1.digi.ninja. robin.digi.ninja. ...
zonetransfer.me. 7200 IN DNSKEY 256 3 7 AwEAAapoL+...
zonetransfer.me.  301 IN TXT    "google-site-verification=..."
zonetransfer.me. 7200 IN MX     0  ASPMX.L.GOOGLE.COM.
zonetransfer.me. 7200 IN MX     10 ALT1.ASPMX.L.GOOGLE.COM.
zonetransfer.me. 7200 IN A      5.196.105.14
zonetransfer.me. 7200 IN NS     nsztm1.digi.ninja.
zonetransfer.me.  300 IN HINFO  "Casio fx-700G" "Windows XP"
_acme-challenge.zonetransfer.me. 301 IN TXT "60a05hbUJ9xSsvYy7pApQvwCUSSGgxvrbdizjePEsZI"
_sip._tcp.zonetransfer.me. 14000 IN SRV  0 0 5060 www.zonetransfer.me.
```

Из одного AXFR запроса атакующий получает: все A-записи (все серверы компании), MX (почтовую инфраструктуру), TXT (токены верификации), SRV (внутренние сервисы), HINFO (операционные системы серверов) и даже `CERT` записи с сертификатами.

> AXFR на production серверах без авторизации - серьёзная уязвимость. Проверяй свои DNS-серверы командой `dig axfr @ns1.yourdomain.com yourdomain.com` - ответ должен быть `Transfer failed`.

---

## Фаза 7. Анализ DNS в Wireshark

### Шаг 16. Захват DNS пакетов

Запускаем Wireshark с фильтром `dns` и выполняем запросы:

```bash
dig google.com A
dig google.com MX
dig @8.8.8.8 github.com
```

![20_dns_wireshark](/handson/images/dns_net/20_dns_wireshark.png)

В Wireshark видны пары Query/Response: запрос `google.com A` → ответ с `142.251.142.238`, запрос `google.com MX` → большой ответ 294 байта с MX и дополнительными записями, запрос `github.com` к `8.8.8.8` → ответ с `140.82.121.3`.

### Шаг 17. Структура DNS Query пакета

Кликаем на Query пакет и разворачиваем `Domain Name System`:

![22_query](/handson/images/dns_net/22_query.png)

```
Transaction ID: 0x88cb     ← уникальный ID, связывает запрос с ответом
Flags: 0x0120
  QR: Message is a query   ← 0 = запрос
  Opcode: Standard query
  RD: Do query recursively ← просим рекурсию
Questions: 1
Question: google.com, type A, class IN
[Response In: 5]           ← Wireshark связал с ответом
```

### Шаг 18. Структура DNS Response пакета

Кликаем на Response пакет:

![21_response_answers](/handson/images/dns_net/21_response_answers.png)

![23_response](/handson/images/dns_net/23_response.png)

```
Transaction ID: 0x88cb     ← тот же ID что в запросе
Flags: 0x8180
  QR: Message is a response  ← 1 = ответ
  RA: Server can do recursion
  RCODE: No error
Answer RRs: 1
Answers:
  google.com. A 142.251.142.238
  Time to live: 5
[Time: 0.020112798 seconds]  ← 20 мс
```

Transaction ID - ключевое поле. DNS работает по UDP без сессий, именно ID связывает запрос с ответом. Если злоумышленник угадает ID и успеет ответить раньше настоящего сервера - это DNS spoofing.

---

## Фаза 8. Локальный DNS сервер - dnsmasq

### Шаг 19. Проверка статуса dnsmasq

```bash
sudo systemctl status dnsmasq
```

![26_dnsmasq_active](images/lab06_dns/26_dnsmasq_active.png)

Статус `active (running)`, PID 1432, память 2.7 МБ - dnsmasq один из самых лёгких DNS-серверов.

### Шаг 20. Добавляем кастомные записи

```bash
sudo nano /etc/dnsmasq.conf
```

Добавляем в конец файла:

```
address=/mylab.local/127.0.0.1
address=/testserver.local/10.10.70.130
address=/devbox.local/192.168.1.100
```

![27_custom](/handson/images/dns_net/27_custom.png)

Синтаксис `address=/domain/ip` - самый простой способ добавить статическую запись в dnsmasq.

### Шаг 21. Перезапуск и проверка записей

```bash
sudo systemctl restart dnsmasq
sudo systemctl status dnsmasq
```

![28_restart](/handson/images/dns_net/28_restart.png)

```bash
dig @127.0.0.1 mylab.local
dig @127.0.0.1 testserver.local
dig @127.0.0.1 devbox.local
```

![29_dig_mylab](/handson/images/dns_net/29_dig_mylab.png)

![30_dig_testserver](/handson/images/dns_net/30_dig_testserver.png)

![31_dig_devbox](/handson/images/dns_net/31_dig_devbox.png)

```
mylab.local.      0 IN A 127.0.0.1
testserver.local. 0 IN A 10.10.70.130
devbox.local.     0 IN A 192.168.1.100
```

TTL=0 - dnsmasq не кэширует статические записи. Все три домена резолвятся локально без обращения к внешним серверам.

### Шаг 22. Переключаем системный resolver на dnsmasq

```bash
# Смотрим текущий resolver
cat /etc/resolv.conf
```

![32_resolve](/handson/images/dns_net/32_resolve.png)

```bash
# Добавляем localhost первым
sudo nano /etc/resolv.conf
# nameserver 127.0.0.1
```

![33_nameserver](/handson/images/dns_net/33_nameserver.png)

```bash
# Проверяем без явного @127.0.0.1
dig mylab.local
nslookup testserver.local
```

![34_dig_nslookup](/handson/images/dns_net/34_dig_nslookup.png)

Теперь все DNS-запросы системы проходят через dnsmasq. Локальные `.local` домены резолвятся мгновенно, внешние запросы dnsmasq проксирует на upstream сервер из оригинального `resolv.conf`.

---

## Фаза 9. Полезные флаги dig

### Шаг 23. Компактный вывод

```bash
# Только IP адрес
dig google.com +short

# Только секция Answer
dig google.com +noall +answer

# Все типы записей одной командой
for type in A AAAA MX NS TXT; do
    echo "=== $type ==="
    dig google.com $type +short
done
```

![35_short_flags](/handson/images/dns_net/35_short_flags.png)

Флаг `+short` незаменим в скриптах - возвращает только значение без служебной информации. `+noall +answer` показывает только секцию ответа в читаемом формате.

---

## Итоги и выводы

### Полный путь DNS запроса

```
Клиент
  → Локальный кэш (нет?)
  → Системный резолвер /etc/resolv.conf
  → Рекурсивный резолвер (ISP или 8.8.8.8)
      → Корневые серверы (.)     - кто знает .com?
      → TLD серверы (.com)       - кто знает google.com?
      → Авторитативный сервер    - какой IP у google.com?
  → Ответ кэшируется на TTL секунд
  → IP возвращается клиенту
```

### Что важно знать про безопасность DNS

| Уязвимость | Описание | Защита |
| --- | --- | --- |
| Открытый AXFR | Вся зона отдаётся по запросу | Ограничить AXFR по IP |
| DNS spoofing | Подмена ответа угадыванием Transaction ID | DNSSEC |
| DNS amplification | UDP позволяет усиливать DDoS через DNS | Ограничение рекурсии |
| DNS over HTTP | Запросы видны провайдеру | DoH / DoT |
| Cache poisoning | Отравление кэша подменными записями | DNSSEC, randomize ports |

### Шпаргалка по dig

| Команда | Что делает |
| --- | --- |
| `dig domain A` | IPv4 адрес |
| `dig domain MX` | Почтовые серверы |
| `dig domain NS` | Серверы имён |
| `dig domain TXT` | Текстовые записи |
| `dig -x IP` | Обратный DNS |
| `dig +trace domain` | Полный путь рекурсии |
| `dig @8.8.8.8 domain` | Запрос к конкретному серверу |
| `dig domain +short` | Только значение |
| `dig axfr @ns domain` | Зонная передача |
| `dig domain \| grep 'Query time'` | Время ответа |

В ходе данной работы был разобран DNS на всех уровнях: от структуры пакетов в Wireshark до полной трассировки рекурсии через корневые серверы. Настроен локальный резолвер dnsmasq с кастомными записями. Продемонстрирована опасность открытых зонных передач — из одного AXFR запроса можно получить полную карту инфраструктуры домена.
