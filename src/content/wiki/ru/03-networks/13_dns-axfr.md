---
title: "DNS - зонные передачи (AXFR/IXFR), записи, безопасность"
date: "2026-04-29"
---

DNS (Domain Name System) - распределённая иерархическая система преобразования доменных имён в IP-адреса и обратно. Определён в RFC 1034 и RFC 1035 (1987). Работает поверх UDP порт 53 (запросы до 512 байт), TCP порт 53 (большие ответы, зонные передачи, DNSSEC). DNS - фундамент интернета: без него не работает почти ничего.

---

## Иерархия DNS

### Структура доменного пространства

```
Корень (root, ".")
├── com.
│   ├── google.com.
│   │   ├── www.google.com.
│   │   └── mail.google.com.
│   └── github.com.
├── org.
│   └── wikipedia.org.
├── net.
├── ru.
│   └── yandex.ru.
└── (и тысячи других TLD)

FQDN (Fully Qualified Domain Name):
  www.google.com.   ← точка в конце = root
  Читается справа налево:
    . (root) → com → google → www

Уровни:
  Корень (root):      .
  TLD (Top Level):    .com, .org, .net, .ru, .uk
  Second Level:       google.com, yandex.ru
  Third Level:        www.google.com, mail.yandex.ru
  И так далее...

TLD типы:
  gTLD (generic):    .com, .org, .net, .info, .biz
  ccTLD (country):   .ru, .uk, .de, .cn, .us
  New gTLD:          .app, .dev, .io, .cloud, .tech
  Infrastructure:    .arpa (для обратного DNS)
```

### Типы DNS серверов

```
Авторитативный (Authoritative) сервер:
  Хранит зонные файлы (zone files) с реальными данными.
  Отвечает с флагом AA (Authoritative Answer).
  Не занимается рекурсией.
  Примеры: BIND, PowerDNS, NSD, Knot DNS.

  Primary (Master):
    Основная копия зоны.
    Администратор редактирует зонный файл здесь.
    Отвечает на AXFR/IXFR запросы от Secondary.

  Secondary (Slave):
    Копия зоны, полученная через зонную передачу.
    Только для чтения (нельзя редактировать).
    Автоматически синхронизируется с Primary.
    Служит для отказоустойчивости и балансировки нагрузки.

Рекурсивный резолвер (Recursive Resolver):
  Принимает запросы от клиентов.
  Проходит иерархию DNS от корня до ответа.
  Кэширует ответы (TTL).
  Примеры: 8.8.8.8 (Google), 1.1.1.1 (Cloudflare), unbound, dnsmasq.

Корневые серверы (Root Servers):
  13 групп серверов (a.root-servers.net - m.root-servers.net).
  Знают адреса TLD серверов.
  Физически сотни серверов по всему миру (Anycast).

Форвардер (Forwarder):
  Пересылает запросы другому резолверу.
  Используется в корпоративных сетях.
```

### Процесс DNS резолвинга

```
Клиент хочет узнать IP www.google.com:

Клиент → Рекурсивный резолвер (8.8.8.8)

  Резолвер проверяет кэш → нет записи

  Резолвер → Root Server (a.root-servers.net)
    Вопрос: "Где www.google.com?"
    Ответ:  "Не знаю, но вот TLD сервер для .com: a.gtld-servers.net"
    (Referral, тип NS)

  Резолвер → TLD Server (a.gtld-servers.net)
    Вопрос: "Где www.google.com?"
    Ответ:  "Не знаю, но вот NS сервер для google.com: ns1.google.com"
    (Referral, тип NS)

  Резолвер → Authoritative Server (ns1.google.com)
    Вопрос: "Где www.google.com?"
    Ответ:  "142.250.185.4" (A запись, AA флаг)

  Резолвер кэширует ответ (на время TTL)
  Резолвер → Клиент: "142.250.185.4"

Итерационный запрос: каждый шаг резолвера к серверу.
Рекурсивный запрос: клиент → резолвер (клиент просит полный ответ).
```

---

## DNS записи (Resource Records)

### Структура записи

```
Формат:
  name    TTL    class    type    rdata

  www     3600   IN       A       142.250.185.4
  ↑       ↑      ↑        ↑       ↑
  имя    время  Internet  тип    данные

name:  доменное имя (@ = текущая зона, * = wildcard)
TTL:   Time To Live (секунды) - как долго кэшировать
class: почти всегда IN (Internet)
type:  тип записи (A, AAAA, MX, CNAME, ...)
rdata: данные зависящие от типа
```

### Основные типы записей

```
A - IPv4 адрес
  www.example.com.  3600  IN  A  93.184.216.34
  Один домен может иметь несколько A записей (Round Robin DNS).

AAAA - IPv6 адрес
  www.example.com.  3600  IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

CNAME - Canonical Name (алиас)
  mail.example.com.  3600  IN  CNAME  ghs.google.com.
  Перенаправляет на другое имя (не IP!).
  Правила CNAME:
    - Не может быть для корня зоны (@)
    - Не может сочетаться с другими записями того же имени
    - Нельзя CNAME → CNAME → ... (цепочки нежелательны)
    - MX и NS не могут указывать на CNAME

MX - Mail Exchanger (почтовый сервер)
  example.com.  3600  IN  MX  10  mail1.example.com.
  example.com.  3600  IN  MX  20  mail2.example.com.
  Число = приоритет (меньше = выше приоритет).
  MX должен указывать на A/AAAA запись (не на CNAME!).

NS - Name Server (сервер имён зоны)
  example.com.  86400  IN  NS  ns1.example.com.
  example.com.  86400  IN  NS  ns2.example.com.
  Делегирует зону этим серверам.
  Должно быть минимум 2 NS записи (резервирование).

SOA - Start of Authority (начало зоны)
  Обязательная запись для каждой зоны. Одна на зону.
  Подробно разобрана в следующем разделе.

PTR - Pointer (обратный DNS, IP → имя)
  34.216.184.93.in-addr.arpa.  3600  IN  PTR  www.example.com.
  Используется для верификации почтовых серверов, логов, security.
  Управляется провайдером (кому принадлежит IP блок).

TXT - Текстовая запись (свободный текст)
  example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"
  Используется для:
    SPF   (Sender Policy Framework) - кто может слать почту
    DKIM  (DomainKeys Identified Mail) - подпись почты
    DMARC (Domain-based Message Authentication)
    Верификация владения доменом (Google, Cloudflare, ...)
    ACME (Let's Encrypt DNS-01 challenge)

SRV - Service (местонахождение сервиса)
  _service._proto.name  TTL  IN  SRV  priority  weight  port  target
  _sip._tcp.example.com.  3600  IN  SRV  10  20  5060  sip.example.com.
  _xmpp._tcp.example.com. 3600  IN  SRV  5   0  5269  xmpp.example.com.
  Используется: SIP, XMPP, LDAP, Kubernetes, service discovery.

CAA - Certification Authority Authorization
  example.com.  3600  IN  CAA  0  issue  "letsencrypt.org"
  example.com.  3600  IN  CAA  0  issuewild  ";"   (запретить wildcard)
  Кто может выпускать SSL сертификаты для домена.
  Проверяется CA перед выпуском сертификата.

NAPTR - Naming Authority Pointer
  Используется в VoIP (E.164 номера в SIP URI).
  Сложный формат, редко настраивается вручную.

ALIAS / ANAME (не стандартный, vendor-specific):
  Как CNAME, но разрешается для корня зоны (@).
  Поддерживается: Cloudflare (CNAME Flattening), Route53, PowerDNS.
  Позволяет: example.com → cdn.example.net (без A записи).
```

### SOA запись - Start of Authority

```
SOA содержит мета-информацию о зоне.
Критически важна для зонных передач.

Формат:
  example.com.  86400  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901  ; Serial   - версия зоны
    3600        ; Refresh  - как часто Secondary проверяет обновления
    900         ; Retry    - пауза при неудачной проверке
    604800      ; Expire   - когда Secondary считает зону устаревшей
    300         ; Minimum  - минимальный TTL (негативный кэш)
  )

Поля SOA:
  MNAME (Primary NS):
    Главный NS сервер зоны (ns1.example.com.).
    На него отправляются NOTIFY сообщения.
    Именно он авторитативен для SOA.

  RNAME (Responsible person):
    Email администратора зоны (@ заменяется точкой).
    admin.example.com. = admin@example.com
    Первая точка в имени = @.

  Serial:
    Номер версии зоны. Должен увеличиваться при каждом изменении.
    Формат YYYYMMDDNN (год+месяц+день+номер) - рекомендуется.
    2026042901 = 29 апреля 2026, первое изменение за день.
    Secondary сравнивает Serial: если у Primary больше → начинает передачу.
    Если Serial не увеличить → Secondary не узнает об изменениях!

  Refresh (секунды):
    Как часто Secondary проверяет SOA у Primary для выявления изменений.
    Типично: 3600-86400 (1-24 часа).
    NOTIFY заменяет polling но Refresh остаётся как fallback.

  Retry (секунды):
    Если Refresh запрос не удался, через сколько попробовать снова.
    Типично: 600-3600 (10 мин - 1 час). Должен быть меньше Refresh.

  Expire (секунды):
    Если Secondary не может связаться с Primary это время →
    Secondary перестаёт отвечать на запросы (зона считается устаревшей).
    Типично: 604800-2419200 (1-4 недели).
    Должен быть намного больше Refresh.

  Minimum TTL (негативный кэш):
    RFC 2308: теперь это TTL для NXDOMAIN (негативных ответов).
    Как долго кэшировать "запись не существует".
    Типично: 300-3600 (5 мин - 1 час).
```

---

## Зонные передачи (Zone Transfer)

### Что такое зонная передача

```
Зонная передача - механизм синхронизации зонных данных
между Primary (Master) и Secondary (Slave) DNS серверами.

Зачем:
  Primary держит основную копию зоны.
  Secondary - реплики для отказоустойчивости и распределения нагрузки.
  При изменении зоны на Primary → Secondary должны получить обновление.

Два типа:
  AXFR - полная передача (Full Zone Transfer)
  IXFR - инкрементальная передача (Incremental Zone Transfer)

Оба работают по TCP (порт 53).
AXFR: RFC 5936 (обновлён из RFC 1034/1035).
IXFR: RFC 1995.
```

### AXFR - полная зонная передача

```
AXFR передаёт полную копию зоны.
Используется при первоначальной синхронизации или если IXFR невозможен.

Процесс AXFR:
  Secondary                     Primary
      │                              │
      │── DNS Query: AXFR ──────────►│
      │   qtype=AXFR, name=zone      │
      │                              │
      │◄── SOA запись ───────────────│  первая запись ответа
      │◄── все записи зоны ──────────│  все RR по одному
      │◄── SOA запись ───────────────│  последняя запись (та же SOA)
      │                              │
      │  [Secondary сохраняет зону]  │

Детали:
  1. Secondary отправляет DNS запрос типа AXFR.
  2. Primary проверяет ACL (разрешена ли передача этому Secondary).
  3. Ответ начинается с SOA записи.
  4. Затем все записи зоны (в любом порядке).
  5. Ответ заканчивается той же SOA записью.
  6. Secondary заменяет свою зону полученной.

Проблема AXFR: при больших зонах - медленно и трафикоёмко.
Решение: IXFR.

TCP соединение:
  AXFR всегда по TCP (данных много, UDP не подходит).
  Ответ может быть разбит на несколько TCP сегментов/DNS сообщений.
```

### IXFR - инкрементальная зонная передача

```
IXFR передаёт только изменения с момента последней передачи.
Намного эффективнее AXFR для больших зон с частыми изменениями.

Процесс IXFR:
  Secondary                     Primary
      │                              │
      │── DNS Query: IXFR ──────────►│
      │   qtype=IXFR                 │
      │   + SOA с текущим Serial     │  Secondary сообщает свой Serial
      │                              │
      │◄── SOA (новая) ──────────────│  новый Serial Primary
      │◄── SOA (старая Secondary) ───│  начало diff блока
      │◄── удалённые записи ─────────│  что удалили
      │◄── SOA (промежуточная) ──────│
      │◄── добавленные записи ───────│  что добавили
      │◄── SOA (новая) ──────────────│  конец diff блока
      │                              │

Если Primary не поддерживает IXFR или разница слишком большая:
  Primary отвечает полным AXFR.

Secondary сам решает применять ли инкрементальные изменения
или запросить полный AXFR.

Хранение истории изменений:
  Primary должен хранить журнал изменений (journal) для IXFR.
  BIND: файл .jnl (journal) рядом с зонным файлом.
  Если история недоступна → fallback на AXFR.
```

### DNS NOTIFY

```
NOTIFY - механизм уведомления Secondary об изменениях зоны.
RFC 1996.

Без NOTIFY: Secondary опрашивает Primary с интервалом Refresh (часы).
С NOTIFY: Primary немедленно уведомляет Secondary об изменении.

Процесс:
  Primary              Secondary
      │── NOTIFY ──────────►│   "Зона изменилась, мой Serial = X"
      │◄── ACK ─────────────│   Secondary подтверждает
      │                     │
      │                     │   Secondary запрашивает SOA
      │◄── SOA Query ───────│
      │── SOA Response ─────►│
      │                     │   Serial у Primary > Serial у Secondary?
      │                     │   Да → начинаем IXFR/AXFR
      │◄── IXFR/AXFR ───────│

Настройка NOTIFY в BIND:
  options {
      notify yes;                    (включить глобально)
  };
  zone "example.com" {
      type master;
      notify yes;
      also-notify { 192.168.1.2; }; (явно указать Secondary)
  };
```

### Настройка зонных передач в BIND

```
# /etc/bind/named.conf.options (глобально)
options {
    # Запретить AXFR по умолчанию (безопасность)
    allow-transfer { none; };

    # Разрешить только определённым IP
    # allow-transfer { 192.168.1.2; 192.168.1.3; };
};

# /etc/bind/named.conf.local (конкретная зона)

# Primary (Master) зона
zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.db";

    # Разрешить передачу только Secondary серверам
    allow-transfer { 192.168.1.2; 192.168.1.3; };

    # Уведомлять Secondary об изменениях
    notify yes;
    also-notify { 192.168.1.2; 192.168.1.3; };

    # TSIG ключ для аутентификации (лучше чем IP ACL)
    # allow-transfer { key "transfer-key"; };
};

# Secondary (Slave) зона
zone "example.com" {
    type slave;
    masters { 192.168.1.1; };       (IP Primary)
    file "/var/cache/bind/example.com.db";  (кэш зоны)

    # Принимать NOTIFY от Primary
    # (по умолчанию принимает от masters)
};
```

### Настройка с TSIG (аутентификация передач)

```
TSIG (Transaction Signature, RFC 2845):
  Аутентификация DNS транзакций через HMAC-MD5/SHA.
  Безопаснее чем ACL по IP (IP можно подделать).

# Генерация TSIG ключа
tsig-keygen -a hmac-sha256 transfer-key > /etc/bind/transfer-key.conf
# Или вручную:
# dnssec-keygen -a hmac-sha256 -b 256 -n HOST transfer-key

# Содержимое ключевого файла:
# key "transfer-key" {
#     algorithm hmac-sha256;
#     secret "base64encodedkey==";
# };

# /etc/bind/named.conf (Primary)
include "/etc/bind/transfer-key.conf";

zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.db";
    allow-transfer { key "transfer-key"; };
    notify yes;
};

# /etc/bind/named.conf (Secondary)
include "/etc/bind/transfer-key.conf";

zone "example.com" {
    type slave;
    masters { 192.168.1.1 key "transfer-key"; };
    file "/var/cache/bind/example.com.db";
};
```

```
# Ручной AXFR запрос (диагностика)
dig @ns1.example.com example.com AXFR
dig @192.168.1.1 example.com AXFR

# IXFR запрос
dig @ns1.example.com example.com IXFR=2026042901
# 2026042901 = Serial с которого хотим обновления

# AXFR с TSIG ключом
dig @ns1.example.com example.com AXFR \
  -y hmac-sha256:transfer-key:base64key==

# Через host утилиту
host -t AXFR example.com ns1.example.com

# Через nslookup
nslookup
> server ns1.example.com
> set type=AXFR
> example.com

# Проверить SOA (Serial)
dig @ns1.example.com example.com SOA
dig @ns2.example.com example.com SOA
# Сравнить Serial - должны совпадать у всех NS
```

---

## Зонный файл (Zone File)

### Формат зонного файла

```
; Комментарии начинаются с ;
; Файл: /etc/bind/zones/example.com.db

$ORIGIN example.com.    ; суффикс для относительных имён
$TTL 3600               ; TTL по умолчанию (1 час)

; SOA запись
@  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901  ; Serial
    3600        ; Refresh
    900         ; Retry
    604800      ; Expire
    300         ; Minimum/Negative TTL
)

; NS записи (серверы имён)
@       IN  NS  ns1.example.com.
@       IN  NS  ns2.example.com.

; Glue записи (A для NS серверов, если они в этой же зоне)
ns1     IN  A   192.168.1.1
ns2     IN  A   192.168.1.2

; A записи
@       IN  A   93.184.216.34      ; example.com
www     IN  A   93.184.216.34      ; www.example.com
mail    IN  A   93.184.216.100
ftp     IN  A   93.184.216.101

; AAAA записи
www     IN  AAAA  2606:2800:220:1:248:1893:25c8:1946

; MX записи
@       IN  MX  10  mail.example.com.
@       IN  MX  20  mail2.example.com.
mail2   IN  A   93.184.216.101

; CNAME записи
blog    IN  CNAME  www.example.com.
shop    IN  CNAME  www.example.com.

; TXT записи
@       IN  TXT  "v=spf1 ip4:93.184.216.0/24 -all"
_dmarc  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"

; DKIM (длинные записи можно разбивать в скобках)
mail._domainkey  IN  TXT  (
    "v=DKIM1; k=rsa; "
    "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC..."
)

; SRV записи
_http._tcp   IN  SRV  10  0  80  www.example.com.
_https._tcp  IN  SRV  10  0  443  www.example.com.

; CAA записи
@   IN  CAA  0  issue  "letsencrypt.org"
@   IN  CAA  0  issuewild  ";"
@   IN  CAA  0  iodef  "mailto:security@example.com"

; Wildcard
*   IN  A   93.184.216.34    ; всё что не определено явно
```

### Зонный файл для обратного DNS

```
; Файл: /etc/bind/zones/1.168.192.in-addr.arpa.db
; Обратная зона для 192.168.1.0/24

$ORIGIN 1.168.192.in-addr.arpa.
$TTL 3600

@  IN  SOA  ns1.example.com.  admin.example.com. (
    2026042901
    3600
    900
    604800
    300
)

@   IN  NS  ns1.example.com.
@   IN  NS  ns2.example.com.

; PTR записи: последний октет → имя
1   IN  PTR  ns1.example.com.
2   IN  PTR  ns2.example.com.
10  IN  PTR  router.example.com.
50  IN  PTR  server1.example.com.
51  IN  PTR  server2.example.com.
100 IN  PTR  mail.example.com.
```

```
# Управление зонами BIND

# Проверить синтаксис конфига
named-checkconf /etc/bind/named.conf

# Проверить синтаксис зонного файла
named-checkzone example.com /etc/bind/zones/example.com.db

# Перезагрузить все зоны
rndc reload

# Перезагрузить конкретную зону
rndc reload example.com

# Заставить Secondary выполнить передачу
rndc retransfer example.com

# Обновить Serial и уведомить Secondary
rndc notify example.com

# Статус зоны
rndc zonestatus example.com

# Сбросить кэш резолвера
rndc flush

# Посмотреть что в кэше
rndc dumpdb -cache
cat /var/cache/bind/named_dump.db

# Логи BIND
journalctl -u named -f
tail -f /var/log/named/named.log
```

---

## AXFR как уязвимость

### Чем опасна открытая зонная передача

```
AXFR позволяет скачать весь зонный файл за один запрос.
Если сервер не ограничивает кто может запрашивать AXFR →
любой может получить полную карту вашей сети.

Что получает атакующий из AXFR:
  - Все хосты и их IP (серверы, роутеры, принтеры, ПК)
  - Внутренние субдомены (vpn.company.com, dev.company.com, admin.company.com)
  - Почтовые серверы (MX) → цели для спама/фишинга
  - Структуру сети (имена намекают на функцию: db01, ldap, monitoring)
  - Потенциально внутренние IP если они в зонном файле

Пример атаки (разведка перед пентестом):
  dig @ns1.company.com company.com AXFR

  Получаем:
    dev.company.com.     A  10.0.1.50    ← сервер разработки
    staging.company.com. A  10.0.1.51    ← staging окружение
    vpn.company.com.     A  203.0.113.10 ← VPN
    ldap.company.com.    A  10.0.0.5     ← LDAP/AD сервер
    db01.company.com.    A  10.0.1.100   ← база данных
    jenkins.company.com. A  10.0.1.200   ← CI/CD
    admin.company.com.   A  10.0.1.5     ← панель управления
    ...и так далее

Эта информация значительно упрощает следующие этапы атаки.
DNS разведка - стандартная часть OSINT и пентестинга.
```

### Инструменты для DNS разведки

```
# Проверить разрешён ли AXFR (зачастую нет)
dig @ns1.example.com example.com AXFR

# Если разрешён - ответ с записями
# Если нет:
# ; Transfer failed.
# или
# ;; XFR size: 0 records (messages 1, bytes 56)

# dnsenum - автоматическая DNS разведка
dnsenum example.com
dnsenum --dnsserver ns1.example.com example.com
# Пробует AXFR + brute-force субдоменов + обратный DNS

# dnsrecon - многофункциональный инструмент
dnsrecon -d example.com -t axfr
dnsrecon -d example.com -t std         (стандартные записи)
dnsrecon -d example.com -t brt -D /usr/share/dnsrecon/namelist.txt

# fierce - обнаружение субдоменов
fierce --domain example.com

# subfinder - поиск субдоменов через OSINT
subfinder -d example.com

# amass - полная DNS разведка
amass enum -d example.com
amass enum -active -d example.com

# theHarvester - OSINT (субдомены через поисковики)
theHarvester -d example.com -b all

# Проверить все NS серверы зоны
dig example.com NS
# Потом пробовать AXFR к каждому NS

for ns in $(dig +short example.com NS); do
    echo "=== $ns ==="
    dig @$ns example.com AXFR
done

# Zone Walking для DNSSEC (NSEC walking)
# Если зона подписана с NSEC (не NSEC3) - можно перебрать все записи
ldns-walk example.com
# Использует NSEC цепочки для получения всех имён зоны
```

### Защита от несанкционированного AXFR

```
1. Ограничить AXFR по IP (ACL):
   # BIND
   options {
       allow-transfer { none; };   (запретить всем по умолчанию)
   };
   zone "example.com" {
       allow-transfer { 192.168.1.2; 192.168.1.3; };  (только Secondary)
   };

2. TSIG аутентификация (лучше ACL):
   Сложнее подделать чем IP.
   Даже при перехвате трафика - без ключа не войти.
   (настройка см. раздел "Настройка с TSIG")

3. Разделить внешний и внутренний DNS (Split-horizon DNS):
   Внешний NS: только публичные записи (www, mail, vpn)
   Внутренний NS: все записи (dev, staging, db, ldap, ...)
   Внешний не знает о внутренних именах → AXFR бесполезен.

4. Проверить что сервер не даёт AXFR наружу:
   # С внешней машины:
   dig @your-public-ns.com yourdomain.com AXFR
   # Должно вернуть "Transfer failed" или отказ.

5. Мониторинг AXFR попыток:
   В BIND: логи будут содержать "denied zone transfer" или успешные передачи.
   Настроить алерты на AXFR запросы с неизвестных IP.

   # BIND logging
   logging {
       channel transfer_log {
           file "/var/log/named/transfer.log";
           severity info;
       };
       category xfer-out { transfer_log; };
       category xfer-in  { transfer_log; };
   };

6. Использовать NSEC3 вместо NSEC (если DNSSEC):
   NSEC позволяет "zone walking" - перебор всех записей.
   NSEC3 с opt-out защищает от этого (добавляет соль + хэш).
```

---

## DNS безопасность

### DNS Spoofing / Cache Poisoning

```
Атака на рекурсивный резолвер:
  Атакующий отправляет поддельные DNS ответы раньше настоящих.
  Резолвер кэширует поддельную запись.
  Все клиенты резолвера получают поддельный IP.

Атака Камински (2008):
  Серьёзная уязвимость в DNS.
  Атакующий отправлял тысячи поддельных ответов с разными ID.
  Из-за предсказуемых Transaction ID - удавалось угадать.
  Решение: рандомизация source port (разные порты для каждого запроса).

Защита от Cache Poisoning:
  - Рандомизация source port (0x ID APIPA, RFC 5452)
  - DNSSEC (криптографическая проверка ответов)
  - DNS over TLS (DoT) / DNS over HTTPS (DoH)
  - 0x20 encoding (случайный регистр в запросе)
```

### DNSSEC - DNS Security Extensions

```
DNSSEC добавляет криптографические подписи к DNS ответам.
Клиент проверяет: данные действительно с авторитативного сервера?

Записи DNSSEC:
  DNSKEY  - публичный ключ зоны (ZSK и KSK)
  RRSIG   - цифровая подпись каждой группы записей
  NSEC    - доказательство что имя НЕ существует (список соседних имён)
  NSEC3   - то же, но с хэшированием (защита от zone walking)
  DS      - хэш KSK дочерней зоны (в родительской зоне)
  CDS     - заявка на обновление DS (от дочерней зоны)
  CDNSKEY - заявка на обновление DNSKEY

Цепочка доверия:
  Root (.) подписан → ICANN управляет ключами корня.
  TLD (.com) подписан → Verisign.
  Зона (example.com) подписана → администратор.
  DS запись в .com указывает на ключ example.com.
  DS в . указывает на ключ .com.

Ключи:
  ZSK (Zone Signing Key) - подписывает записи зоны.
  KSK (Key Signing Key)  - подписывает ZSK.
  KSK меняется редко (раз в год), ZSK - чаще.

Проверка DNSSEC:
  dig +dnssec example.com A            (запрос с DNSSEC)
  dig +sigchase www.example.com A      (проверить цепочку)
  delv @8.8.8.8 example.com A          (DNS lookup + validation)
```

### DNS over TLS (DoT) и DNS over HTTPS (DoH)

```
Стандартный DNS - открытый текст → провайдер/атакующий видит все запросы.

DNS over TLS (DoT, RFC 7858):
  TCP порт 853.
  Шифрует DNS трафик через TLS.
  Клиент знает к какому серверу подключается (SNI).

DNS over HTTPS (DoH, RFC 8484):
  HTTPS порт 443.
  DNS запросы как HTTP POST/GET к /dns-query.
  Неотличим от обычного HTTPS трафика.
  Сложнее блокировать/мониторить.

DNS over QUIC (DoQ, RFC 9250):
  QUIC (UDP 853).
  Быстрее TLS рукопожатие, меньше задержки.

Популярные DoT/DoH серверы:
  Cloudflare: 1.1.1.1 (DoT), https://cloudflare-dns.com/dns-query (DoH)
  Google:     8.8.8.8 (DoT), https://dns.google/dns-query (DoH)
  Quad9:      9.9.9.9 (DoT), https://dns.quad9.net/dns-query (DoH)

Настройка DoT на Linux (systemd-resolved):
  /etc/systemd/resolved.conf:
  [Resolve]
  DNS=1.1.1.1#cloudflare-dns.com 9.9.9.9#dns.quad9.net
  DNSOverTLS=yes

Настройка DoH в Firefox:
  about:preferences#general → Network Settings → Enable DNS over HTTPS
```

---

## Диагностика DNS

### Основные команды

```
# dig - основной инструмент DNS диагностики
dig example.com                    (A запись)
dig example.com A                  (явно указать тип)
dig example.com AAAA               (IPv6)
dig example.com MX                 (почтовые серверы)
dig example.com NS                 (серверы имён)
dig example.com SOA                (SOA запись)
dig example.com TXT                (TXT записи)
dig example.com ANY                (все типы, но не всегда работает)

# Запросить у конкретного сервера
dig @8.8.8.8 example.com           (у Google DNS)
dig @1.1.1.1 example.com           (у Cloudflare)
dig @ns1.example.com example.com   (у авторитативного)

# Полезные флаги dig
dig +short example.com             (только ответ, без деталей)
dig +norecurse example.com         (без рекурсии, итеративный)
dig +trace example.com             (трассировка от root до ответа)
dig +dnssec example.com            (показать DNSSEC записи)
dig +time=2 +tries=1 example.com   (таймаут и попытки)
dig -4 example.com                 (только IPv4 транспорт)
dig -6 example.com                 (только IPv6 транспорт)

# Обратный DNS (PTR)
dig -x 8.8.8.8                     (обратный запрос)
dig 8.8.8.8.in-addr.arpa PTR       (то же вручную)

# Проследить путь резолвинга
dig +trace www.example.com
# . NS (корневые серверы)
# com. NS (TLD серверы)
# example.com. NS (авторитативные)
# www.example.com. A (ответ)

# nslookup (менее функциональный, но повсеместно доступен)
nslookup example.com
nslookup example.com 8.8.8.8
nslookup -type=MX example.com

# host - простой инструмент
host example.com
host -t MX example.com
host 8.8.8.8                       (обратный DNS)
```

### Проверка зонной передачи и синхронизации

```
# Проверить Serial на всех NS серверах (должен совпадать)
for ns in $(dig +short example.com NS); do
    serial=$(dig @$ns example.com SOA +short | awk '{print $3}')
    echo "$ns: Serial=$serial"
done

# Пример вывода:
# ns1.example.com.: Serial=2026042901
# ns2.example.com.: Serial=2026042901  ← синхронизированы

# Проверить AXFR
dig @ns1.example.com example.com AXFR | head -50

# Проверить количество записей в зоне
dig @ns1.example.com example.com AXFR | grep -c "IN"

# Сравнить зоны Primary и Secondary
diff <(dig @ns1.example.com example.com AXFR | sort) \
     <(dig @ns2.example.com example.com AXFR | sort)
# Разницы не должно быть

# Проверить синхронизацию BIND
rndc zonestatus example.com
# name: example.com
# type: master
# files: /etc/bind/zones/example.com.db
# serial: 2026042901
# nodes: 25
# last loaded: ...
# secure: no
```

### Типичные проблемы DNS

```
Проблема: Secondary не синхронизируется

Диагностика:
  # Проверить Serial у Primary и Secondary
  dig @primary example.com SOA +short
  dig @secondary example.com SOA +short
  # Если у Secondary меньше → нет синхронизации

  # Проверить AXFR вручную с Secondary на Primary
  dig @primary-ip example.com AXFR

  Причины:
  - ACL не разрешает Secondary делать AXFR
  - Firewall блокирует TCP 53 между серверами
  - Serial не увеличился на Primary после изменения зоны
  - TSIG ключи не совпадают

Проблема: DNS кэш устарел

  # Сбросить кэш резолвера
  rndc flush                       (BIND)
  systemd-resolve --flush-caches   (systemd-resolved)
  ipconfig /flushdns               (Windows)

  # Посмотреть TTL в ответе
  dig example.com A
  # ;; ANSWER SECTION:
  # example.com. 285 IN A 93.184.216.34
  #              ↑ остаток TTL в секундах (было 3600, прошло время)

  # Дождаться истечения TTL или уменьшить его заранее
  # Перед плановым изменением: снизить TTL до 300 сек за несколько часов.

Проблема: NXDOMAIN на существующий домен

  # Проверить у авторитативного сервера напрямую
  dig @ns1.example.com missinghost.example.com

  # Проверить NSEC/NSEC3 записи (DNSSEC)
  dig +dnssec +noadditional example.com NSEC

  Причины:
  - Запись не создана в зонном файле
  - Serial не обновлён → Secondary не обновился
  - DNSSEC проблема с подписью

Проблема: Медленный DNS резолвинг

  # Измерить время ответа
  dig example.com | grep "Query time"
  # ;; Query time: 2 msec    ← из кэша
  # ;; Query time: 234 msec  ← рекурсивный запрос

  # Найти медленное звено через трассировку
  dig +trace example.com

  Причины:
  - Рекурсивный резолвер далеко / перегружен
  - Авторитативный сервер медленно отвечает
  - TTL слишком маленький → кэш не помогает
  - Round-trip до DNS сервера большой
```

---

## Шпаргалка

```
DNS иерархия:
  Корень (.) → TLD (.com) → SLD (example.com) → хост (www.example.com)
  FQDN заканчивается на точку: www.example.com.

Ключевые типы записей:
  A     - IPv4 адрес
  AAAA  - IPv6 адрес
  CNAME - алиас на другое имя
  MX    - почтовый сервер (с приоритетом)
  NS    - серверы имён зоны
  SOA   - начало зоны (Serial, Refresh, Retry, Expire, Minimum)
  PTR   - обратный DNS (IP → имя)
  TXT   - текст (SPF, DKIM, DMARC, верификация)
  SRV   - адрес сервиса (priority weight port target)
  CAA   - кто может выдавать SSL сертификаты

SOA таймеры:
  Serial  - версия зоны (увеличивать при изменениях!)
  Refresh - как часто Secondary проверяет (сек)
  Retry   - пауза при неудаче (сек)
  Expire  - когда Secondary считает зону мёртвой (сек)
  Minimum - TTL для NXDOMAIN ответов (сек)

Зонные передачи:
  AXFR - полная передача (TCP 53)
  IXFR - инкрементальная передача (только изменения)
  NOTIFY - Primary уведомляет Secondary об изменениях
  Без ограничений AXFR → любой может скачать всю зону!

Безопасность:
  allow-transfer { none; };         запретить AXFR всем
  allow-transfer { 1.2.3.4; };     разрешить только Secondary
  TSIG ключи - лучше IP ACL
  Split-horizon DNS - разные зоны для внутри и снаружи
  DNSSEC - подписи для защиты от spoofing
  DoT/DoH - шифрование DNS трафика

Диагностика:
  dig example.com A                  простой запрос
  dig @ns1 example.com SOA           проверить Serial
  dig @ns1 example.com AXFR          запросить зону
  dig +trace example.com             трассировка от корня
  dig -x 8.8.8.8                     обратный DNS
  rndc reload example.com            перезагрузить зону
  rndc zonestatus example.com        статус зоны
  named-checkzone zone file          проверить синтаксис

Порты:
  UDP 53 - обычные DNS запросы (до 512 байт)
  TCP 53 - большие ответы, AXFR, DNSSEC
  TCP 853 - DNS over TLS (DoT)
  TCP 443 - DNS over HTTPS (DoH)
```

---

## Ссылки

- [RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) - Domain Names - Concepts and Facilities
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) - Domain Names - Implementation and Specification
- [RFC 1995](https://www.rfc-editor.org/rfc/rfc1995) - Incremental Zone Transfer (IXFR)
- [RFC 1996](https://www.rfc-editor.org/rfc/rfc1996) - DNS NOTIFY
- [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308) - Negative Caching of DNS Queries (NXDOMAIN TTL)
- [RFC 2845](https://www.rfc-editor.org/rfc/rfc2845) - Secret Key Transaction Authentication for DNS (TSIG)
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - DNSSEC Resource Records
- [RFC 5936](https://www.rfc-editor.org/rfc/rfc5936) - DNS Zone Transfer Protocol (AXFR)
- [RFC 7858](https://www.rfc-editor.org/rfc/rfc7858) - DNS over TLS (DoT)
- [RFC 8484](https://www.rfc-editor.org/rfc/rfc8484) - DNS over HTTPS (DoH)
- [BIND 9 Administrator Reference](https://bind9.readthedocs.io)
- [dnsviz.net](https://dnsviz.net) - визуализация DNSSEC цепочки доверия
