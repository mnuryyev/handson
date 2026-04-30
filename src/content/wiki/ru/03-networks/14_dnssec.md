---
title: "DNS - DNSSEC"
date: "2026-05-01"
---

DNSSEC (DNS Security Extensions) - набор расширений DNS, которые добавляют криптографическую подпись к DNS ответам. Защищает от подмены DNS данных (cache poisoning, man-in-the-middle). Определён в RFC 4033, 4034, 4035 (2005).

Главная идея: авторитативный сервер подписывает свои записи приватным ключом. Резолвер проверяет подпись публичным ключом. Подделать ответ без ключа невозможно.

---

## Зачем нужен DNSSEC

```
Без DNSSEC:

Клиент          Резолвер          Авторитативный NS
  │                 │                     │
  │  bank.com?      │                     │
  │────────────────►│  bank.com?          │
  │                 │────────────────────►│
  │                 │                     │
  │                 │   Атакующий перехватывает ответ
  │                 │   и подменяет IP:
  │                 │   bank.com → 1.3.3.7 (фишинг)
  │                 │◄────────────────────
  │  1.3.3.7        │
  │◄────────────────│
  │  (жертва идёт на фишинговый сайт)

С DNSSEC:
  Атакующий подменяет ответ, но подпись не совпадает.
  Резолвер отбрасывает ответ → SERVFAIL.
  Клиент не получает поддельный IP.
```

```
Что защищает DNSSEC:
  - Cache Poisoning (отравление кэша резолвера)
  - Man-in-the-middle (подмена ответов на пути)
  - DNS Spoofing (поддельные ответы)

Что НЕ защищает DNSSEC:
  - Конфиденциальность (запросы всё ещё видны в сети)
    → Для этого DoT/DoH
  - DDoS атаки на DNS серверы
  - Ошибки в самих DNS записях (если хозяин сам неправильно настроил)
  - Зоны без DNSSEC (если домен не подписан - нет защиты)
```

---

## Ключи DNSSEC - KSK и ZSK

```
DNSSEC использует два типа ключей (RSA или ECDSA):

ZSK (Zone Signing Key) - ключ подписи зоны:
  - Подписывает реальные записи (A, MX, AAAA и т.д.)
  - Меняется часто (раз в месяц - квартал)
  - Короче и быстрее (меньше нагрузка)

KSK (Key Signing Key) - ключ подписи ключей:
  - Подписывает только DNSKEY записи (в т.ч. ZSK)
  - Меняется редко (раз в год - два)
  - Длиннее и надёжнее
  - Его хэш хранится у родительской зоны (DS запись)

Зачем два ключа?
  Если бы был один ключ - при его смене нужно обновлять DS запись
  у родителя (медленно, требует взаимодействия с регистратором).
  
  С двумя ключами:
  - ZSK меняется часто → DS не нужно трогать
  - KSK меняется редко → DS обновляется редко
```

```
Аналогия:
  KSK = главный ключ от сейфа (меняется редко, хранится надёжно)
  ZSK = рабочий ключ (меняется часто, используется ежедневно)
  DS  = отпечаток KSK у родителя (позволяет проверить KSK)
```

---

## Записи DNSSEC

### DNSKEY - публичный ключ зоны

```
Хранит публичные ключи зоны (KSK и ZSK).

Формат:
  name  TTL  IN  DNSKEY  flags  protocol  algorithm  public-key

Флаги:
  256 = ZSK (Zone Signing Key)
  257 = KSK (Key Signing Key, он же SEP - Secure Entry Point)

Алгоритмы (algorithm):
  5   = RSA/SHA-1      (устарел)
  7   = RSASHA1-NSEC3-SHA1
  8   = RSA/SHA-256    (широко используется)
  10  = RSA/SHA-512
  13  = ECDSA P-256 / SHA-256  (рекомендуется, компактный)
  14  = ECDSA P-384 / SHA-384
  15  = Ed25519        (новый, очень компактный)
  16  = Ed448

Пример:
  example.com.  3600  IN  DNSKEY  256  3  13  (
    oJMRESz5E4gYzS/q6XDrvU1qMPYIjCWz
    JaOkcrws2N3A+pyMfOOKgzBJoWDFBnGM
    ...
  )
  example.com.  3600  IN  DNSKEY  257  3  13  (
    mdsswUyr3DPW132mOi8V9xESWE8jTo0d
    xCjjnopKl+GqJxpVXckHAeF+KkxLbxIL
    ...
  )
  ; 256 = ZSK, 257 = KSK
```

```
# Запросить DNSKEY записи
dig DNSKEY cloudflare.com
dig DNSKEY cloudflare.com +short

# Посмотреть флаги и алгоритм
dig DNSKEY example.com | grep DNSKEY
# 256 = ZSK, 257 = KSK
# algorithm 13 = ECDSA P-256

# Посчитать key tag (идентификатор ключа)
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+12345.key
```

### RRSIG - подпись набора записей

```
Цифровая подпись для каждого набора записей (RRset).
Каждый тип записи (A, MX, NS...) имеет свою RRSIG.

Формат:
  name  TTL  IN  RRSIG  type  algo  labels  orig-ttl
               sig-expiry  sig-inception  key-tag
               signer-name  signature

Поля:
  type          - тип подписанных записей (A, MX, NS...)
  algo          - алгоритм подписи (13 = ECDSA P-256)
  labels        - количество меток в имени (для wildcard)
  orig-ttl      - оригинальный TTL подписанных записей
  sig-expiry    - когда подпись истекает (YYYYMMDDHHMMSS)
  sig-inception - с какого момента подпись действительна
  key-tag       - ID ключа которым подписано
  signer-name   - зона которая подписала
  signature     - сама подпись (base64)

Пример:
  example.com.  3600  IN  RRSIG  A 13 2 3600 (
    20240526000000  ; expires
    20240426000000  ; inception
    12345           ; key tag
    example.com.    ; signer
    base64signature...
  )
```

```
# Запросить RRSIG
dig A cloudflare.com +dnssec
# В ANSWER SECTION будут и A и RRSIG записи

# Посмотреть срок действия подписи
dig A example.com +dnssec | grep RRSIG
# Дата в формате: 20240526000000 = 26 мая 2024 00:00:00

# Проверить что подпись валидна
dig A cloudflare.com +dnssec +short
```

### DS - Delegation Signer

```
Хранится у РОДИТЕЛЬСКОЙ зоны.
Содержит хэш KSK дочерней зоны.
Это "мост доверия" между зонами.

Формат:
  name  TTL  IN  DS  key-tag  algorithm  digest-type  digest

Digest типы:
  1 = SHA-1   (устарел)
  2 = SHA-256 (рекомендуется)
  4 = SHA-384

Пример:
  example.com.  3600  IN  DS  12345  13  2  (
    49FD46E6C4B45C55D4AC69CBD3CD34AC
    1B1E6B4B5C8A0A85DBE535D3DA7B6B94
  )
  ; 12345 = key tag
  ; 13 = ECDSA P-256
  ; 2 = SHA-256
  ; последнее = хэш KSK

Где хранится DS:
  DS для example.com хранится в зоне .com
  DS для cloudflare.com хранится в зоне .com
  DS для .com хранится в корневой зоне (.)
```

```
# Запросить DS запись
dig DS cloudflare.com
dig DS cloudflare.com +short
# 2371 13 2 32096BA... (key-tag алгоритм digest-type хэш)

# Запросить DS у TLD сервера (родителя)
dig DS cloudflare.com @a.gtld-servers.net

# Сгенерировать DS из DNSKEY (при настройке DNSSEC)
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+12345.key
```

### NSEC и NSEC3 - доказательство несуществования

```
Проблема: как доказать что домен НЕ существует?
  Если просто вернуть NXDOMAIN - атакующий может подделать NXDOMAIN
  для существующего домена.

NSEC (Next Secure):
  Содержит следующее существующее имя в зоне (алфавитный порядок).
  Доказывает что между A и C ничего нет → B не существует.

  Пример зоны: a.example.com, c.example.com, e.example.com
  NSEC для a.example.com: "следующее = c.example.com"
  Запрос b.example.com → NSEC говорит: "между a и c ничего нет"

  Проблема NSEC: Zone Walking
  Перебирая NSEC цепочку можно получить ВСЕ имена в зоне (утечка).
  a → c → e → a (вся зона).

NSEC3 (RFC 5155):
  Хэширует имена (SHA-1) перед включением в цепочку.
  Атакующий видит хэши, а не настоящие имена.
  Zone Walking невозможен (только перебор хэшей).

  Параметры NSEC3:
    Hash Algorithm: 1 = SHA-1
    Flags: 0 или 1 (Opt-Out - не подписывать делегирования без DS)
    Iterations: число итераций хэширования (рекомендуется 0-5)
    Salt: случайная соль (усложняет предвычисление)
```

```
# Запросить NSEC записи
dig A несуществующий.example.com +dnssec
# В AUTHORITY SECTION будут NSEC/NSEC3 записи

# Посмотреть NSEC цепочку (zone walking - только для зон с NSEC)
dig NSEC example.com @ns1.example.com
# example.com. IN NSEC mail.example.com. A MX NS SOA TXT RRSIG NSEC DNSKEY

# Запросить NSEC3PARAM (параметры хэширования для зоны)
dig NSEC3PARAM example.com
```

---

## Цепочка доверия - Chain of Trust

```
DNSSEC работает как иерархия доверия от корня до конечного домена.

Корневая зона (.) подписана IANA.
Публичный ключ корня ("Trust Anchor") захардкожен в каждом
DNSSEC-валидирующем резолвере.

Цепочка:
  . (root)
  │  DNSKEY (KSK root) ← Trust Anchor (знает резолвер)
  │  RRSIG подписывает DNSKEY
  │
  ├── DS для .com ← подписан ключом root
  │
  .com
  │  DNSKEY (KSK .com)  ← хэш совпадает с DS в root
  │  RRSIG подписывает DNSKEY
  │
  ├── DS для example.com ← подписан ключом .com
  │
  example.com
     DNSKEY (KSK example.com)  ← хэш совпадает с DS в .com
     DNSKEY (ZSK example.com)
     RRSIG на ZSK (подписан KSK)
     RRSIG на A записи (подписан ZSK)
     A 93.184.216.34
```

```
Процесс верификации резолвером:

1. Резолвер знает Trust Anchor (публичный KSK root).
2. Получает DNSKEY для .com → проверяет через DS в root зоне.
3. Получает DNSKEY для example.com → проверяет через DS в .com.
4. Получает A запись + RRSIG → проверяет RRSIG ключом ZSK.
5. Если всё ОК → флаг AD=1 в ответе клиенту.
6. Если что-то не так → SERVFAIL.
```

```
# Визуализировать цепочку доверия
# dnsviz.net - лучший инструмент

# Проверить цепочку через dig
dig A cloudflare.com +dnssec +cd   # +cd = не проверять (получить данные)
dig A cloudflare.com +dnssec       # проверить

# Флаг AD в ответе
dig A cloudflare.com | grep flags
# flags: qr rd ra ad  ← ad = authenticated data (DNSSEC ОК)
# flags: qr rd ra     ← нет ad = DNSSEC не проверен/не настроен

# Проверить DNSSEC конкретного домена
dig A домен.com +dnssec +short
# Если SERVFAIL и есть RRSIG → проблема с DNSSEC
# dig A домен.com +dnssec +cd +short  → получить ответ несмотря на ошибку
```

---

## Как настроить DNSSEC на своём домене

### Шаг 1 - генерация ключей

```
# Через BIND утилиты:

# Сгенерировать ZSK (ECDSA P-256, алгоритм 13)
dnssec-keygen -a ECDSAP256SHA256 -n ZONE example.com
# Создаёт два файла:
# Kexample.com.+013+12345.key        (публичный ключ)
# Kexample.com.+013+12345.private    (приватный ключ - хранить в безопасности!)

# Сгенерировать KSK (флаг -f KSK)
dnssec-keygen -a ECDSAP256SHA256 -f KSK -n ZONE example.com
# Kexample.com.+013+67890.key
# Kexample.com.+013+67890.private

# Рекомендуемые алгоритмы (2024):
#   13 = ECDSAP256SHA256 (компактный, быстрый)
#   15 = ED25519         (новейший, очень компактный)
#   8  = RSASHA256       (совместимость со старыми системами)
```

### Шаг 2 - подпись зоны

```
# Добавить публичные ключи в файл зоны
cat Kexample.com.+013+12345.key >> /etc/bind/zones/example.com
cat Kexample.com.+013+67890.key >> /etc/bind/zones/example.com

# Подписать зону (BIND):
dnssec-signzone -A -3 $(head -c 1000 /dev/random | sha1sum | cut -b 1-16) \
  -N INCREMENT -o example.com -t \
  /etc/bind/zones/example.com \
  Kexample.com.+013+12345.private \
  Kexample.com.+013+67890.private

# Создаёт: example.com.signed
# -A = добавить все DNSKEY записи
# -3 = использовать NSEC3 (вместо NSEC)
# -N INCREMENT = автоинкремент serial
# -o = origin (имя зоны)

# В named.conf использовать подписанный файл:
zone "example.com" {
    type master;
    file "/etc/bind/zones/example.com.signed";
    auto-dnssec maintain;    # автоматическое обслуживание ключей
    inline-signing yes;      # подписывать inline (рекомендуется)
};
```

### Шаг 3 - публикация DS у регистратора

```
# Получить DS запись для передачи регистратору
dnssec-dsfromkey -a SHA-256 Kexample.com.+013+67890.key
# example.com. IN DS 67890 13 2 ABC123...хэш...

# Передать регистратору:
# Key Tag:    67890
# Algorithm:  13 (ECDSA P-256)
# Digest Type: 2 (SHA-256)
# Digest:     ABC123...хэш...

# Регистратор добавит DS запись в зону .com
# После распространения (~24-48 часов) цепочка доверия замкнётся

# Проверить что DS появился
dig DS example.com @a.gtld-servers.net
```

### Автоматическая настройка (Cloudflare/современные DNS)

```
Большинство современных DNS провайдеров настраивают DNSSEC
одной кнопкой в панели управления:
  Cloudflare:  Dashboard → DNS → DNSSEC → Enable
  Route53:     Hosted Zone → DNSSEC signing → Enable
  GoDaddy:     DNS Management → DNSSEC → Add

После включения провайдер:
  - Генерирует ключи автоматически
  - Подписывает зону
  - Публикует DS запись у регистратора (если регистратор совместим)

Проверить после включения:
  dig DS example.com
  dig A example.com +dnssec | grep flags
  # Должен быть флаг "ad"
```

---

## Ротация ключей (Key Rollover)

```
Ключи нужно периодически менять. Процесс должен быть плавным,
иначе резолверы с кэшированными старыми ключами получат SERVFAIL.

ZSK Rollover (чаще, проще):
  Не требует изменения DS у родителя (DS указывает на KSK).

  Pre-Publication метод:
  1. Публикуем новый ZSK (добавляем DNSKEY для нового ZSK)
  2. Ждём пока старый ZSK TTL истечёт (все закэшируют новый ZSK)
  3. Начинаем подписывать новым ZSK
  4. Ждём пока старые RRSIG истекут
  5. Удаляем старый ZSK

  Временная шкала (при TTL=1 час, RRSIG validity=14 дней):
  День 0:   опубликовать новый ZSK
  День 1:   переключить подпись на новый ZSK
  День 15:  удалить старый ZSK
```

```
KSK Rollover (реже, требует DS обновления):
  Требует обновления DS у регистратора/родительской зоны.
  RFC 6781 описывает Double-DS и Double-KSK методы.

  Double-KSK метод:
  1. Публикуем новый KSK (добавляем в DNSKEY)
  2. Отправляем новый DS регистратору
  3. Ждём пока регистратор опубликует DS И старый DS TTL истечёт
  4. Подписываем DNSKEY набор новым KSK
  5. Удаляем старый KSK из DNSKEY
  6. Удаляем старый DS у регистратора

  Timeline:
  День 0:   опубликовать новый KSK, отправить DS регистратору
  День 2-3: новый DS распространился → переключиться на новый KSK
  День 4-5: удалить старый KSK и DS
```

```
# Автоматическая ротация в BIND (inline-signing):
# named.conf:
zone "example.com" {
    inline-signing yes;
    auto-dnssec maintain;
    key-directory "/etc/bind/keys/example.com/";
};

# Добавить новый ключ в key-directory - BIND сам сделает rollover
# по датам активации/деактивации в ключах.

# Посмотреть состояние ключей
rndc dnssec -status example.com

# Проверить дату истечения подписей
dig A example.com +dnssec | grep RRSIG
# Дата expiry: 20240526000000
```

---

## DNSSEC и проблемы

### SERVFAIL из-за DNSSEC

```
Самая частая жалоба: "домен не работает, dig говорит SERVFAIL".
Причина - невалидная DNSSEC подпись.

Диагностика:
  # Получить ответ без проверки DNSSEC
  dig A домен.com +cd           # cd = checking disabled
  # Если +cd даёт ответ, а без него SERVFAIL → проблема в DNSSEC

  # Проверить что именно не так
  dig A домен.com +dnssec +cd   # получить RRSIG без проверки
  
  # Онлайн диагностика (лучший инструмент)
  # dnsviz.net/d/домен.com
  # dnssec-analyzer.verisignlabs.com/домен.com

Типичные причины SERVFAIL:
  1. Истекли RRSIG подписи (забыли переподписать зону)
  2. DS не совпадает с DNSKEY (ключ сменили, DS не обновили)
  3. KSK ролловер сделан неправильно
  4. Зона не подписана но DS есть у родителя
  5. Часы на сервере сбиты (RRSIG inception/expiry проверяется по времени)
```

```
# Проверить срок действия подписей
dig A example.com +dnssec | grep "RRSIG A"
# example.com. 3600 IN RRSIG A 13 2 3600 20240526000000 20240426000000 ...
#                                        ^^^^^^^^^^^^^^^^
#                                        expiry (26 мая 2024)

# Быстрая проверка истечения RRSIG
dig RRSIG example.com @ns1.example.com | awk '/RRSIG/ {print $9}' | \
  while read d; do
    echo "$d = $(date -d "${d:0:8}" 2>/dev/null || date -j -f '%Y%m%d' ${d:0:8} '+%Y-%m-%d' 2>/dev/null)"
  done

# Проверить DS совпадает ли с DNSKEY
# DS у родителя:
dig DS example.com @a.gtld-servers.net +short
# DNSKEY в зоне:
dig DNSKEY example.com +short
# Хэш DNSKEY должен совпадать с digest в DS

# Если нет - нужно обновить DS у регистратора
```

### Истёкшие подписи

```
Самая частая реальная проблема DNSSEC: забыли переподписать зону.
Подписи действуют ограниченный срок (обычно 30 дней).

Мониторинг истечения:
  # Nagios/Zabbix check:
  check_dnssec_expiry.sh:
  #!/bin/bash
  DOMAIN=$1
  EXPIRY=$(dig RRSIG $DOMAIN @ns1.$DOMAIN +short | awk 'NR==1{print $5}')
  EXPIRY_TS=$(date -d "${EXPIRY:0:8}" +%s 2>/dev/null)
  NOW_TS=$(date +%s)
  DAYS=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
  echo "RRSIG expires in $DAYS days ($EXPIRY)"
  [ $DAYS -lt 7 ] && exit 2   # CRITICAL
  [ $DAYS -lt 14 ] && exit 1  # WARNING
  exit 0

  # Онлайн мониторинг: expiredns.com, zonemaster.net
```

```
# Переподписать зону вручную (BIND):
dnssec-signzone -A -3 $(head -c 1000 /dev/random | sha1sum | cut -b 1-16) \
  -N INCREMENT -o example.com \
  /etc/bind/zones/example.com

# Перезагрузить зону в BIND:
rndc reload example.com

# Inline signing автоматически переподписывает:
rndc sign example.com        # переподписать немедленно
rndc loadkeys example.com    # загрузить новые ключи

# Проверить что зона подписана
dig SOA example.com +dnssec | grep RRSIG
```

### Opt-Out в NSEC3

```
Opt-Out флаг в NSEC3 (флаг = 1):
  Позволяет не подписывать делегирования без DS записи.
  Используется на TLD зонах (.com, .net) где миллионы делегирований.
  Делегирования к неподписанным доменам не требуют NSEC3 записей.

Последствие для пользователей:
  Если домен без DNSSEC и TLD использует NSEC3 Opt-Out,
  то NXDOMAIN для этого домена не может быть аутентифицирован.
  (Небольшая, но существующая уязвимость.)

Проверить Opt-Out:
  dig NSEC3PARAM example.com
  # example.com. IN NSEC3PARAM 1 0 5 AB12
  #                               ^ флаг: 0 = Opt-Out выключен
  #                                       1 = Opt-Out включён
```

---

## Проверка DNSSEC - инструменты

```
# dig - основной инструмент

# Запросить с DNSSEC записями
dig A cloudflare.com +dnssec

# Проверить флаг AD (authenticated)
dig A cloudflare.com | grep flags
# flags: qr rd ra ad   ← DNSSEC верифицирован

# Запросить без проверки DNSSEC (debugging)
dig A домен.com +cd

# Запросить только RRSIG
dig RRSIG example.com

# Запросить DNSKEY
dig DNSKEY cloudflare.com

# Запросить DS (у родительской зоны)
dig DS cloudflare.com @a.gtld-servers.net

# delv - DNSSEC-aware dig (встроенная валидация)
delv A cloudflare.com
# ; fully validated
# cloudflare.com.  299  IN  A  104.16.132.229
# cloudflare.com.  299  IN  RRSIG  A 13 2 300 ...

# delv с явным trust anchor
delv @8.8.8.8 A cloudflare.com +root=/usr/share/dns/root.key

# drill (из ldns-utils)
drill -D cloudflare.com A    # DNSSEC drill
drill -TD cloudflare.com A   # trace + DNSSEC
```

```
# Онлайн инструменты:
# dnsviz.net              - лучшая визуализация цепочки доверия
# dnssec-analyzer.verisignlabs.com  - детальный анализ
# zonemaster.net          - полная проверка зоны
# dnschecker.org          - проверка с разных точек мира
# whatsmydns.net          - распространение DNS записей
```

---

## DNSSEC и отрицательные ответы

```
Проблема верификации NXDOMAIN:
  Как подписать "этого домена не существует"?
  Нельзя подписать несуществующую запись.

Решение - NSEC/NSEC3:
  Вместо подписания NXDOMAIN, подписываем ДИАПАЗОН несуществования.

  Запрос: b.example.com (не существует)
  Ответ содержит NSEC:
    a.example.com. IN NSEC c.example.com. A RRSIG NSEC
    "следующее имя после a - это c, между ними ничего нет"
  
  NSEC запись подписана RRSIG → подделать нельзя.
  Резолвер убеждён что b.example.com не существует.

NODATA (тип записи не существует):
  Запрос: AAAA для домена у которого только A запись
  NSEC содержит битмап типов у этого имени: A, MX, RRSIG, NSEC
  AAAA в битмапе нет → NODATA аутентифицировано
```

---

## Шпаргалка

```
Записи DNSSEC:
  DNSKEY   публичный ключ зоны (256=ZSK, 257=KSK)
  RRSIG    подпись набора записей (каждый RRset)
  DS       хэш KSK дочерней зоны (у родителя)
  NSEC     следующее имя (доказательство несуществования, zone walkable)
  NSEC3    хэш следующего имени (анонимизировано, против zone walking)

Алгоритмы (рекомендуемые):
  13 = ECDSAP256SHA256  (баланс безопасности и скорости)
  15 = ED25519          (наименьший размер, современный)
  8  = RSASHA256        (совместимость)

Цепочка доверия:
  Trust Anchor (root KSK) → DS(.com) → DNSKEY(.com)
  → DS(example.com) → DNSKEY(example.com) → RRSIG(A запись)

Флаги в ответе dig:
  ad = Authenticated Data (DNSSEC проверен и OK)
  cd = Checking Disabled  (проверка выключена)

Диагностика:
  dig A домен +dnssec              - запрос с DNSSEC
  dig A домен | grep flags         - проверить флаг ad
  dig A домен +cd                  - обойти проверку DNSSEC
  dig RRSIG домен                  - посмотреть подписи
  dig DS домен @родитель.ns        - DS у родительской зоны
  delv A домен                     - встроенная валидация
  dnsviz.net                       - визуализация цепочки

Если SERVFAIL:
  1. dig A домен +cd → получить ответ без DNSSEC
  2. Если работает → проблема в DNSSEC
  3. Проверить: истекли RRSIG? DS совпадает с DNSKEY? Время на сервере?
  4. dnsviz.net для визуальной диагностики

Ротация ключей:
  ZSK: раз в месяц-квартал (DS не нужно менять)
  KSK: раз в год-два (нужно обновить DS у регистратора)
  Метод: Pre-Publication (ZSK) / Double-KSK (KSK)
```

---

## Ссылки

- [RFC 4033](https://www.rfc-editor.org/rfc/rfc4033) - DNSSEC Introduction and Requirements
- [RFC 4034](https://www.rfc-editor.org/rfc/rfc4034) - Resource Records for DNSSEC (DNSKEY, RRSIG, NSEC, DS)
- [RFC 4035](https://www.rfc-editor.org/rfc/rfc4035) - Protocol Modifications for DNSSEC
- [RFC 5155](https://www.rfc-editor.org/rfc/rfc5155) - DNS Security (NSEC3)
- [RFC 6781](https://www.rfc-editor.org/rfc/rfc6781) - DNSSEC Operational Practices (Key Rollover)
- [RFC 8624](https://www.rfc-editor.org/rfc/rfc8624) - Algorithm Implementation Requirements for DNSSEC
- [dnsviz.net](https://dnsviz.net) - визуализация и диагностика DNSSEC
- [zonemaster.net](https://zonemaster.net) - полная проверка зоны
- [IANA DNSSEC Root](https://www.iana.org/dnssec/files) - корневые ключи доверия
