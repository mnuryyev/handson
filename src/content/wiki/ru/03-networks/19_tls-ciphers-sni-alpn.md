---
title: "TLS - Cipher Suites, SNI, ALPN"
date: "2026-05-03"
---

Продолжение темы TLS. Здесь - детальный разбор трёх механизмов: Cipher Suites (наборы криптоалгоритмов), SNI (Server Name Indication, выбор сертификата по имени хоста) и ALPN (Application-Layer Protocol Negotiation, согласование протокола приложения). Все три работают внутри TLS handshake и напрямую влияют на безопасность, производительность и совместимость.

---

## Cipher Suites

### Что такое Cipher Suite

```
Cipher Suite — упорядоченный набор криптографических алгоритмов,
определяющих все аспекты защищённого соединения.

Один suite описывает:
  1. Алгоритм обмена ключами (Key Exchange)
  2. Алгоритм аутентификации сервера (Authentication)
  3. Симметричный алгоритм шифрования (Bulk Cipher)
  4. Алгоритм проверки целостности (MAC / AEAD)

Клиент и сервер согласовывают один suite в ClientHello/ServerHello.
Если нет общего suite → handshake невозможен → соединение рвётся.
```

### Анатомия Cipher Suite (TLS 1.2)

```
TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
 ↑    ↑      ↑    ↑    ↑    ↑    ↑
 │    │      │    │    │    │    └── MAC / AEAD хэш (SHA-384)
 │    │      │    │    │    └─────── Режим блочного шифра (GCM)
 │    │      │    │    └──────────── Размер ключа шифрования (256 бит)
 │    │      │    └───────────────── Симметричный шифр (AES)
 │    │      └────────────────────── Аутентификация сервера (RSA)
 │    └───────────────────────────── Обмен ключами (ECDHE)
 └────────────────────────────────── Протокол (TLS)

Ещё примеры:
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  TLS_DHE_RSA_WITH_AES_256_CBC_SHA256
  TLS_RSA_WITH_AES_128_CBC_SHA        ← устаревший, нет PFS
```

### TLS 1.3 - упрощённые Cipher Suites

```
В TLS 1.3 cipher suite описывает ТОЛЬКО шифр + хэш.
Обмен ключами и аутентификация вынесены отдельно
(всегда ECDHE или DHE, всегда сертификатный/PSK).

Доступные suite в TLS 1.3:
  TLS_AES_256_GCM_SHA384          (рекомендуется)
  TLS_CHACHA20_POLY1305_SHA256    (рекомендуется, особенно мобильные)
  TLS_AES_128_GCM_SHA256          (приемлемо)
  TLS_AES_128_CCM_SHA256          (встроенные системы)
  TLS_AES_128_CCM_8_SHA256        (встроенные системы, укороченный тег)

Почему упрощение?
  В TLS 1.2 было >300 cipher suite → комбинаторный взрыв → уязвимости.
  Все TLS 1.3 суиты используют AEAD (нет отдельного MAC → безопаснее).
  Нет suite с известными слабостями по дизайну.
```

### Компоненты Cipher Suite

#### Key Exchange - обмен ключами

```
Цель: безопасно установить shared secret между клиентом и сервером
без его передачи по сети. Из shared secret выводятся сессионные ключи.

RSA Key Exchange (УСТАРЕЛ в TLS 1.3):
  Клиент генерирует pre-master secret.
  Шифрует его публичным ключом сервера (RSA).
  Отправляет серверу.
  Сервер расшифровывает своим приватным ключом.

  Проблема: нет Forward Secrecy.
  Если приватный ключ сервера скомпрометирован потом →
  весь записанный трафик расшифровывается.

DHE — Diffie-Hellman Ephemeral:
  Клиент и сервер генерируют одноразовые DH ключи.
  Обмениваются публичными частями.
  Вычисляют общий секрет независимо.
  Ephemeral = одноразовые ключи → Forward Secrecy.

  Параметры DH: группа (prime p) и генератор (g).
  Слабые DH (512, 768, 1024 бит) → Logjam атака.
  Рекомендуется: >= 2048 бит.

ECDHE — Elliptic Curve DHE:
  То же что DHE, но на эллиптических кривых.
  Короче ключи при той же стойкости (256 бит ECDH ≈ 3072 бит RSA).
  Быстрее DHE.
  Рекомендуемые кривые:
    X25519    (Curve25519, современная, быстрая, нет patent)
    P-256     (secp256r1, широко поддерживается)
    P-384     (secp384r1, более высокая стойкость)
    P-521     (secp521r1, максимальная стойкость, медленная)

  Кривые которые НЕ использовать:
    P-224     (слишком короткая)
    B-163, K-163 (бинарные кривые, слабости)
    Кривые с известными backdoor рисками (NIST спорные)

PSK — Pre-Shared Key (TLS 1.3):
  Клиент и сервер заранее знают общий секрет.
  Используется для session resumption (0-RTT / 1-RTT).
  Ticket-based PSK: сервер выдаёт session ticket после хендшейка.
```

#### Authentication - аутентификация

```
Цель: доказать что сервер (и опционально клиент) владеет ключом
соответствующим сертификату.

RSA:
  Сервер подписывает данные handshake своим RSA приватным ключом.
  Клиент проверяет подпись публичным ключом из сертификата.
  Размер ключа: минимум 2048 бит (рекомендуется 4096).
  Медленнее ECDSA при больших размерах ключей.

ECDSA — Elliptic Curve Digital Signature Algorithm:
  Сервер подписывает ECDSA ключом.
  Быстрее RSA.
  Короче ключи.
  Требует ECDSA сертификат (не RSA).
  Кривые: P-256, P-384, P-521.

EdDSA / Ed25519 (TLS 1.3):
  Современный алгоритм подписи.
  Детерминированный (нет зависимости от ГПСЧ).
  Очень быстрый.
  Ed25519 (Curve25519) → широкое применение.
  Ed448 (Curve448) → более высокая стойкость.

anon (анонимные suite — ЗАПРЕЩЕНЫ):
  TLS_DH_anon_WITH_AES_...
  Нет аутентификации → man-in-the-middle тривиален.
  Никогда не использовать.
```

#### Bulk Cipher - симметричное шифрование

```
Шифрует основной поток данных после согласования сессионных ключей.

AES-GCM (рекомендуется):
  AES — Advanced Encryption Standard.
  GCM — Galois/Counter Mode (режим AEAD).
  AEAD = Authenticated Encryption with Associated Data.
  Шифрование + аутентификация за один проход.
  Hardware acceleration (AES-NI инструкции процессора).
  Размеры ключей: 128 или 256 бит.

ChaCha20-Poly1305 (рекомендуется):
  ChaCha20 — потоковый шифр от Бернштейна.
  Poly1305 — MAC алгоритм (AEAD вместе с ChaCha20).
  Быстрее AES на устройствах без AES-NI (мобильные).
  Не уязвим к timing атакам по кэшу.
  Нет patent, свободный дизайн.

AES-CCM (для IoT):
  CCM — Counter with CBC-MAC.
  AEAD, но медленнее GCM.
  Подходит для встроенных систем с ограниченными ресурсами.

Устаревшие (отключить!):
  AES-CBC  — нет встроенной аутентификации → нужен отдельный HMAC
             → padding oracle атаки (POODLE, BEAST, Lucky 13)
  3DES-CBC — 64-бит блок → Sweet32 атака (ЗАПРЕТИТЬ)
  RC4      — статистические слабости → ЗАПРЕТИТЬ (RFC 7465)
  DES      — 56-бит ключ → полный перебор за часы → ЗАПРЕТИТЬ
  NULL     — нет шифрования → ЗАПРЕТИТЬ
```

#### MAC / AEAD - целостность

```
Защита от модификации данных.

HMAC (Hash-based MAC):
  Используется с CBC cipher suite.
  HMAC-SHA256, HMAC-SHA384.
  Отдельная операция после шифрования.
  Encrypt-then-MAC (TLS 1.3) vs MAC-then-Encrypt (TLS 1.2 CBC).
  MAC-then-Encrypt → padding oracle → уязвимости.

AEAD (Authenticated Encryption with Associated Data):
  Шифрование и аутентификация в одной операции.
  GCM, CCM, Poly1305 — все AEAD.
  В TLS 1.3: ТОЛЬКО AEAD suite (CBC/MAC запрещены).
  Нет отдельного поля MAC → нет проблем с порядком операций.

Алгоритмы хэша для PRF (псевдослучайная функция):
  SHA-256 → TLS_*_SHA256
  SHA-384 → TLS_*_SHA384
  Используется для вывода ключей из master secret.
```

### Выбор Cipher Suite

```
Порядок предпочтения (от лучшего к приемлемому):

TLS 1.3 (все хороши, выбирает клиент):
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256

TLS 1.2 (только ECDHE + AEAD):
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384  ← лучший (ECDSA cert)
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384    ← лучший (RSA cert)
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256

Приемлемо (TLS 1.2, есть PFS но CBC):
  TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384
  TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256

Запрещено (отключить немедленно!):
  TLS_RSA_WITH_*                 (нет PFS)
  TLS_*_WITH_RC4_*               (RC4 сломан)
  TLS_*_WITH_3DES_*              (Sweet32)
  TLS_*_WITH_DES_*               (слишком слабый)
  TLS_*_WITH_NULL_*              (нет шифрования)
  TLS_DH_anon_*                  (нет аутентификации)
  TLS_*_EXPORT_*                 (экспортные, 40-56 бит)
  TLS_*_MD5                      (MD5 сломан)
  TLS_ECDHE_RSA_WITH_AES_*_CBC_SHA  (SHA-1 → запретить для новых)
```

### Настройка Cipher Suites

```nginx
# nginx - рекомендуемые cipher suites
ssl_protocols TLSv1.2 TLSv1.3;

# TLS 1.3 suite настраиваются отдельно (OpenSSL >= 1.1.1)
ssl_conf_command Ciphersuites TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256;

# TLS 1.2 cipher suites
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';

ssl_prefer_server_ciphers off;   # TLS 1.3: пусть клиент выбирает
                                 # TLS 1.2: можно on (server decides)

# ECDH кривые
ssl_ecdh_curve X25519:prime256v1:secp384r1;
```

```apache
# Apache
SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:\
               ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:\
               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
SSLHonorCipherOrder off
SSLOpenSSLConfCmd Curves X25519:prime256v1:secp384r1
```

```bash
# Проверить поддерживаемые cipher suites сервера
nmap --script ssl-enum-ciphers -p 443 example.com

# testssl.sh - детальный анализ
bash testssl.sh --cipher-per-proto example.com

# openssl - проверить конкретный suite
openssl s_client -connect example.com:443 \
  -cipher ECDHE-RSA-AES256-GCM-SHA384

# Посмотреть все доступные suite в OpenSSL
openssl ciphers -v 'ALL:COMPLEMENTOFALL'

# Посмотреть только сильные
openssl ciphers -v 'HIGH:!aNULL:!MD5:!3DES'

# Посмотреть что реально согласовано
openssl s_client -connect example.com:443 2>/dev/null \
  | grep "Cipher is"
# Cipher is ECDHE-RSA-AES256-GCM-SHA384

# Проверить TLS 1.3 ciphers
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null \
  | grep "Cipher is"
```

### Cipher Suite IDs

```
Каждый suite имеет 2-байтовый идентификатор (в TLS ClientHello/ServerHello).

TLS 1.3:
  0x1301 = TLS_AES_128_GCM_SHA256
  0x1302 = TLS_AES_256_GCM_SHA384
  0x1303 = TLS_CHACHA20_POLY1305_SHA256

TLS 1.2 (примеры):
  0xC02C = TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
  0xC030 = TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  0xCCA9 = TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256
  0xCCA8 = TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
  0xC02B = TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
  0xC02F = TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256

Устаревшие (не использовать):
  0x0035 = TLS_RSA_WITH_AES_256_CBC_SHA
  0x002F = TLS_RSA_WITH_AES_128_CBC_SHA
  0x000A = TLS_RSA_WITH_3DES_EDE_CBC_SHA

GREASE (RFC 8701):
  0x?A?A значения (0x0A0A, 0x1A1A, 0x2A2A, ...) = фиктивные значения.
  Chrome и другие клиенты отправляют GREASE suite в ClientHello.
  Цель: убедиться что сервер не падает при неизвестных значениях.
  Правильный сервер должен игнорировать GREASE → выбрать реальный suite.
```

---

## SNI - Server Name Indication

### Проблема без SNI

```
Один сервер может обслуживать тысячи доменов (виртуальный хостинг).
Каждый домен должен иметь свой TLS сертификат.

Проблема: TLS handshake происходит ДО HTTP запроса.
Сервер должен выбрать сертификат ещё на этапе TLS.
Без подсказки от клиента — сервер не знает какой сертификат отдать.

Без SNI (старый подход):
  Каждому домену — отдельный IP адрес.
  example.com     → 1.2.3.4
  other.com       → 1.2.3.5
  another.com     → 1.2.3.6
  При нехватке IPv4 адресов — проблема.
```

### Что такое SNI

```
SNI (Server Name Indication) — расширение TLS (RFC 6066).
Клиент указывает имя хоста в самом начале TLS handshake (ClientHello).
Сервер читает SNI → выбирает нужный сертификат.

Место в handshake:
  ClientHello {
    ...
    extensions: [
      server_name: "example.com"    ← SNI
      supported_versions: [TLS 1.3]
      supported_groups: [X25519, P-256]
      signature_algorithms: [ecdsa_secp256r1_sha256, ...]
      ...
    ]
  }

Важно:
  SNI — в открытом тексте в TLS 1.2 (виден в сети!).
  TLS 1.3 — Certificate зашифрован, но SNI всё равно открыт.
  ESNI/ECH решает эту проблему (см. ниже).
```

### SNI в деталях

```
Структура расширения server_name (тип 0x0000):
  ServerNameList {
    NameType:   host_name (0)
    HostName:   "example.com"  (без порта, без http://)
  }

Правила:
  - Только DNS имя (не IP адрес)
  - Без порта
  - Без схемы (http:// или https://)
  - Строчные буквы, без trailing dot
  - Максимум 255 символов (DNS ограничение)

Что делает сервер при получении SNI:
  1. Ищет виртуальный хост с этим именем.
  2. Находит → отдаёт соответствующий сертификат.
  3. Не находит → отдаёт default сертификат (или закрывает соединение).

Поведение при отсутствии SNI:
  Старые клиенты (IE 6, XP) не поддерживали SNI.
  Сервер отдаёт default сертификат.
  Если имя не совпадает с default сертификатом → ошибка у клиента.
  Сегодня SNI поддерживается повсеместно (>99% браузеров).
```

### SNI и безопасность - проблема утечки

```
Критическая проблема: SNI виден в открытом тексте!

Даже при использовании HTTPS, наблюдатель (ISP, корпоративный прокси,
правительство, атакующий в той же сети) видит:
  - Какой домен вы посещаете (из SNI)
  - Какой IP вы посещаете
  - Время и длительность соединений

Не видит:
  - Конкретный URL (путь, параметры)
  - Содержимое запросов и ответов
  - Заголовки HTTP

Пример захвата tcpdump:
  tcpdump -i eth0 -A 'tcp port 443' | grep -a "server_name"
  # Без дешифровки видно: "example.com"

Почему SNI открытый:
  TLS record layer — зашифрован.
  TLS handshake — частично открытый (до согласования ключей).
  ClientHello — первый пакет, ключей ещё нет → шифровать нечем.
```

### ESNI и ECH - зашифрованный SNI

```
ESNI (Encrypted SNI) — черновик, экспериментальный (2018-2020).
ECH (Encrypted Client Hello) — замена ESNI, RFC 9258 (2023).

Идея ECH:
  Публичный ключ сервера для шифрования ClientHello — в DNS (HTTPS запись).
  Клиент шифрует "внутренний" ClientHello (с реальным SNI) публичным ключом.
  "Внешний" ClientHello — только общедоступная информация.
  Сервер расшифровывает и видит реальный SNI.

DNS HTTPS запись для ECH:
  example.com.  IN  HTTPS  1  .  ech=<base64 ech config>

Два ClientHello:
  Outer ClientHello (виден в сети):
    SNI: "cloudflare-esni.com" (или общий ECH provider)
    Encrypted ClientHello расширение (содержит inner ClientHello)

  Inner ClientHello (зашифрован):
    SNI: "example.com" (реальный)
    Все остальные расширения

Статус ECH (2026):
  Firefox: включён по умолчанию (for trusted HTTPS records)
  Chrome:  включён по умолчанию
  Cloudflare: поддерживает ECH для всех сайтов на своей CDN
  Требует: TLS 1.3 + DoH/DoT (DNS тоже должен быть защищён!)

Ограничения ECH:
  DNS запрос к HTTPS записи должен быть зашифрован (DoH/DoT).
  Иначе: ISP видит DNS запрос → узнаёт домен.
  Требует поддержки на сервере + DNS + клиенте.
```

### Настройка SNI

```nginx
# nginx — разные сертификаты для разных доменов на одном IP

server {
    listen 443 ssl;
    server_name example.com www.example.com;
    ssl_certificate     /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;
}

server {
    listen 443 ssl;
    server_name other.com www.other.com;
    ssl_certificate     /etc/ssl/other.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/other.com/privkey.pem;
}

# Default сервер (если SNI не совпало)
server {
    listen 443 ssl default_server;
    ssl_certificate     /etc/ssl/default/fullchain.pem;
    ssl_certificate_key /etc/ssl/default/privkey.pem;
    return 444;   # закрыть соединение без ответа
}
```

```bash
# Проверить SNI в ClientHello (tcpdump)
tcpdump -i eth0 -A -s 0 'tcp port 443' 2>/dev/null \
  | grep -a "server_name\|SNI"

# Wireshark: фильтр tls.handshake.extensions_server_name
# Видно имя хоста в открытом тексте в ClientHello

# Проверить что сервер правильно обрабатывает SNI
openssl s_client -connect 1.2.3.4:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject
# Должен показать CN=example.com

# Без SNI (что отдаёт сервер по умолчанию)
openssl s_client -connect example.com:443 -noservername 2>/dev/null \
  | openssl x509 -noout -subject

# curl с явным SNI (если IP ≠ домен)
curl --resolve example.com:443:1.2.3.4 https://example.com

# Проверить несколько доменов на одном IP
for domain in example.com other.com third.com; do
    echo -n "$domain: "
    echo | openssl s_client -connect 1.2.3.4:443 \
      -servername $domain 2>/dev/null \
      | openssl x509 -noout -subject -issuer 2>/dev/null
done
```

### SNI в других контекстах

```
HAProxy — SNI роутинг (L4, без расшифровки):
  frontend https_in
      bind *:443
      mode tcp
      tcp-request inspect-delay 5s
      tcp-request content accept if { req_ssl_hello_type 1 }

      use_backend be_example if { req_ssl_sni -i example.com }
      use_backend be_other   if { req_ssl_sni -i other.com }

  backend be_example
      mode tcp
      server s1 192.168.1.10:443

  backend be_other
      mode tcp
      server s2 192.168.1.20:443

  # HAProxy читает SNI из ClientHello не расшифровывая TLS!
  # Это L4 (TCP) load balancing на основе SNI.

nginx stream (аналог HAProxy SNI routing):
  stream {
      map $ssl_preread_server_name $backend {
          example.com  192.168.1.10:443;
          other.com    192.168.1.20:443;
          default      192.168.1.30:443;
      }
      server {
          listen 443;
          ssl_preread on;
          proxy_pass $backend;
      }
  }

Kubernetes Ingress + cert-manager:
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
  spec:
    tls:
    - hosts: [example.com]
      secretName: example-tls
    - hosts: [other.com]
      secretName: other-tls
    rules:
    - host: example.com
      ...
    # cert-manager автоматически выдаёт сертификаты по SNI
```

---

## ALPN - Application-Layer Protocol Negotiation

### Что такое ALPN

```
ALPN (Application-Layer Protocol Negotiation) — расширение TLS (RFC 7301).
Позволяет согласовать протокол прикладного уровня в рамках TLS handshake.

Без ALPN:
  Клиент подключается на порт 443.
  После TLS handshake начинает говорить HTTP.
  Отдельный round-trip для согласования протокола — медленно.
  Или отдельные порты для разных протоколов.

С ALPN:
  Клиент в ClientHello: "Я поддерживаю h2, http/1.1"
  Сервер в ServerHello: "Выбираю h2"
  После TLS handshake сразу говорят на h2.
  Нет дополнительного round-trip.
```

### ALPN в TLS Handshake

```
ClientHello {
  extensions: [
    application_layer_protocol_negotiation: [
      "h2",        ← HTTP/2 (предпочтительно)
      "http/1.1"   ← HTTP/1.1 (fallback)
    ]
    server_name: "example.com"
    ...
  ]
}

ServerHello {
  extensions: [
    application_layer_protocol_negotiation: "h2"   ← выбрал h2
  ]
}

Если сервер не поддерживает ни один из предложенных протоколов:
  TLS Alert: no_application_protocol (120)
  Соединение закрывается.

Если ALPN расширения нет вообще:
  Сервер молчит об ALPN → клиент использует свой default.
  Обычно HTTP/1.1.
```

### ALPN идентификаторы

```
Реестр IANA ALPN Protocol IDs:

Веб протоколы:
  "http/1.0"      HTTP/1.0
  "http/1.1"      HTTP/1.1 (ALPN по умолчанию)
  "h2"            HTTP/2 over TLS (RFC 7540)
  "h2c"           HTTP/2 over cleartext TCP (не через ALPN)
  "h3"            HTTP/3 (RFC 9114)
  "h3-29"         HTTP/3 draft 29 (legacy)

gRPC:
  "grpc-exp"      gRPC (экспериментальный идентификатор)
  gRPC использует HTTP/2 → обычно "h2"

WebSockets:
  Нет отдельного ALPN для WebSocket.
  WebSocket работает поверх HTTP/1.1 (Upgrade) или HTTP/2.

ACME (Let's Encrypt):
  "acme-tls/1"    TLS-ALPN-01 challenge (RFC 8737)
  Сервер Let's Encrypt проверяет домен через TLS на порту 443.
  Клиент отвечает специальным сертификатом на ALPN "acme-tls/1".

Другие протоколы:
  "ftp"           FTP over TLS
  "imap"          IMAP over TLS
  "pop3"          POP3 over TLS
  "dot"           DNS over TLS (RFC 7858)
  "stun.nat-discovery" STUN
  "webrtc"        WebRTC
  "c-webrtc"      Confidential WebRTC
  "spdy/1"        SPDY 1 (устарел)
  "spdy/2"        SPDY 2 (устарел)
  "spdy/3"        SPDY 3 (устарел, предшественник HTTP/2)

Формат идентификатора:
  ASCII строка, 1-255 байт.
  Регистрируется в IANA.
  Нет пространства имён (flat namespace).
```

### ALPN для HTTP/2 - ключевой сценарий

```
Согласование HTTP/2 через ALPN:

Клиент (браузер) → example.com:443:
  TLS ClientHello:
    extensions.ALPN: ["h2", "http/1.1"]

Сервер (nginx с http2 on) → клиент:
  TLS ServerHello:
    extensions.ALPN: "h2"

После этого:
  Клиент отправляет HTTP/2 Connection Preface:
    "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
  HTTP/2 SETTINGS фрейм.
  Начинается HTTP/2 общение.

Если сервер выбирает "http/1.1":
  Клиент начинает HTTP/1.1 общение.
  Обычная TCP keep-alive сессия.

Если сервер не поддерживает ALPN вообще:
  Нет ALPN в ServerHello.
  Клиент (браузер) → fallback на HTTP/1.1.
  HTTP/2 НЕ используется (браузеры не используют HTTP/2 без ALPN).
```

### ALPN для TLS-ALPN-01 (ACME Challenge)

```
Let's Encrypt проверяет владение доменом через TLS на порту 443.
Используется когда HTTP-01 (порт 80) недоступен.

Процесс:
  1. Let's Encrypt → клиент ACME: "Нужен challenge token"
  2. ACME клиент создаёт временный TLS сертификат:
     - Самоподписанный
     - CN = домен для проверки
     - SAN = домен
     - ASN.1 расширение acmeIdentifier = хэш key authorization
  3. ACME клиент настраивает TLS сервер на порту 443
     отвечать этим сертификатом на ALPN "acme-tls/1"
  4. Let's Encrypt → домен:443 с ALPN: ["acme-tls/1"]
  5. Сервер → специальный сертификат
  6. Let's Encrypt проверяет acmeIdentifier расширение → успех

Certbot поддерживает TLS-ALPN-01:
  certbot certonly --standalone --preferred-challenges tls-alpn-01 \
    -d example.com

Преимущества TLS-ALPN-01:
  - Нет нужды в порте 80
  - Нет нужды в DNS записях
  - Работает с любым TLS сервером на порту 443
```

### Настройка ALPN

```nginx
# nginx — ALPN настраивается через ssl_protocols и http2
server {
    listen 443 ssl;
    http2 on;          # включает ALPN "h2"
    server_name example.com;
    ssl_certificate     /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;
    # nginx автоматически объявляет ALPN ["h2", "http/1.1"]
}

# Только HTTP/1.1 (отключить HTTP/2)
server {
    listen 443 ssl;
    # http2 off; (или просто не включать)
    # ALPN будет только "http/1.1"
}

# HTTP/3 ALPN (h3)
server {
    listen 443 quic reuseport;
    add_header Alt-Svc 'h3=":443"; ma=86400';
    # QUIC/HTTP/3 ALPN = "h3" (встроено в QUIC)
}
```

```apache
# Apache — ALPN управляется mod_http2
LoadModule http2_module modules/mod_http2.so
Protocols h2 h2c http/1.1
# Порядок важен: h2 предпочтительнее http/1.1
```

```go
// Go — явная настройка ALPN
tlsConfig := &tls.Config{
    NextProtos: []string{"h2", "http/1.1"},
    // tls.Config.NextProtos = ALPN список
}
ln, _ := tls.Listen("tcp", ":443", tlsConfig)
```

```python
# Python — через ssl модуль
import ssl
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('cert.pem', 'key.pem')
ctx.set_alpn_protocols(['h2', 'http/1.1'])
```

```bash
# Проверить ALPN согласование
openssl s_client -connect example.com:443 -alpn h2,http/1.1 2>/dev/null \
  | grep ALPN
# ALPN protocol: h2  ← сервер выбрал h2

# Проверить что сервер поддерживает h2
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
  | grep "ALPN\|Protocol"

# curl — проверить протокол
curl -v --http2 https://example.com 2>&1 | grep -E "ALPN|h2|HTTP/"

# Если ALPN не поддерживается
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
  | grep ALPN
# (ничего — нет ALPN в ответе сервера)

# Полный вывод TLS handshake с ALPN
openssl s_client -connect example.com:443 \
  -alpn h2,http/1.1 -servername example.com -state 2>&1 \
  | grep -E "ALPN|SNI|Cipher|Protocol|Verify"
```

---

## Взаимодействие SNI, ALPN, Cipher Suites

### Полная картина ClientHello

```
ClientHello (TLS 1.3 пример):
  ┌─────────────────────────────────────────────────────┐
  │ Version: TLS 1.0 (compat) + supported_versions: 1.3  │
  │ Random: 32 случайных байта                           │
  │ Session ID: <пусто или старый ID>                    │
  │ Cipher Suites:                                       │
  │   0x1302  TLS_AES_256_GCM_SHA384        ← TLS 1.3   │
  │   0x1303  TLS_CHACHA20_POLY1305_SHA256  ← TLS 1.3   │
  │   0x1301  TLS_AES_128_GCM_SHA256        ← TLS 1.3   │
  │   0xC02C  ECDHE_ECDSA_AES256_GCM_SHA384 ← TLS 1.2  │
  │   0xC030  ECDHE_RSA_AES256_GCM_SHA384   ← TLS 1.2  │
  │   0xCCA9  ECDHE_ECDSA_CHACHA20_POLY1305 ← TLS 1.2  │
  │   0xCCA8  ECDHE_RSA_CHACHA20_POLY1305   ← TLS 1.2  │
  │   0x0A0A  GREASE                         ← fuzz     │
  │ Extensions:                                          │
  │   server_name:             "example.com"   ← SNI    │
  │   supported_versions:      [0x0304, 0x0303]  (1.3, 1.2)│
  │   supported_groups:        [x25519, P-256, P-384]   │
  │   key_share:               [x25519 public key]      │
  │   signature_algorithms:    [ecdsa_sha256, rsa_pss_sha256, ...]│
  │   application_layer_protocol_negotiation: ["h2", "http/1.1"] ← ALPN│
  │   session_ticket:          <ticket data>             │
  │   psk_key_exchange_modes:  [psk_dhe_ke]             │
  │   pre_shared_key:          <PSK identity>           │
  └─────────────────────────────────────────────────────┘

ServerHello (ответ):
  ┌─────────────────────────────────────────────────────┐
  │ Version: TLS 1.2 (compat) + selected_version: 1.3   │
  │ Random: 32 байта                                     │
  │ Cipher Suite: 0x1302 TLS_AES_256_GCM_SHA384         │
  │ Extensions:                                          │
  │   supported_versions:      0x0304 (TLS 1.3)         │
  │   key_share:               x25519 public key        │
  │   application_layer_protocol_negotiation: "h2" ← ALPN│
  │   (SNI не повторяется в ServerHello — уже известен) │
  └─────────────────────────────────────────────────────┘
```

### Порядок принятия решений сервером

```
Входящий ClientHello:

1. SNI → выбор виртуального хоста и сертификата
   SNI: "example.com" → загрузить cert для example.com

2. Cipher Suites → выбор алгоритмов
   Пересечение {client suites} ∩ {server suites}
   Если пусто → alert handshake_failure

3. Версия TLS → выбор протокола
   Из supported_versions клиента и сервера
   Если нет пересечения → alert protocol_version

4. ALPN → выбор протокола приложения
   Пересечение {client ALPN} ∩ {server ALPN}
   Если пусто и ALPN обязателен → alert no_application_protocol
   Если ALPN расширения нет → без ALPN в ответе

5. key_share → выбор кривой/группы для ECDHE
   Если клиент не предложил нужную группу → HelloRetryRequest
```

---

## Диагностика и отладка

### Wireshark - анализ TLS handshake

```
Wireshark фильтры для TLS:
  tls                              - весь TLS трафик
  tls.handshake                    - только handshake
  tls.handshake.type == 1          - ClientHello
  tls.handshake.type == 2          - ServerHello
  tls.handshake.extensions_server_name  - SNI
  tls.handshake.extensions.alpn   - ALPN расширение
  tls.handshake.ciphersuite        - Cipher Suites список

Поля ClientHello в Wireshark:
  Transport Layer Security
    TLSv1.3 Record Layer: Handshake Protocol: Client Hello
      Handshake Protocol: Client Hello
        Version: TLS 1.0 (0x0301)
        Random: ...
        Session ID: ...
        Cipher Suites (18 suites)
          Cipher Suite: TLS_AES_256_GCM_SHA384 (0x1302)
          Cipher Suite: TLS_CHACHA20_POLY1305_SHA256 (0x1303)
          ...
        Extensions
          Extension: server_name (len=14)
            Server Name: example.com        ← SNI (plaintext!)
          Extension: application_layer_protocol_negotiation (len=14)
            ALPN Protocol: h2
            ALPN Protocol: http/1.1
          Extension: supported_versions (len=7)
            Supported Version: TLS 1.3 (0x0304)
            Supported Version: TLS 1.2 (0x0303)
```

### Команды для диагностики

```bash
# Полный TLS handshake с подробностями
openssl s_client -connect example.com:443 \
  -servername example.com \
  -alpn h2,http/1.1 \
  -state -debug 2>&1 | head -100

# Что видно в сети (SNI утечка)
tcpdump -i eth0 -A -s 0 'tcp port 443' 2>/dev/null | \
  grep -oP '(?<=\x00\x00)[\x00-\xFF]{1,253}(?=[\x00\xFF])' 2>/dev/null
# (упрощённый пример, реально нужен tshark или Wireshark)

# tshark — разбор SNI и ALPN
tshark -i eth0 -Y 'tls.handshake.type == 1' \
  -T fields \
  -e tls.handshake.extensions_server_name \
  -e tls.handshake.extensions.alpn \
  2>/dev/null

# Все cipher suites которые предлагает клиент
tshark -i eth0 -Y 'tls.handshake.type == 1' \
  -T fields -e tls.handshake.ciphersuites 2>/dev/null

# Проверить что сервер правильно отвечает на ALPN
openssl s_client -connect example.com:443 \
  -alpn h2,http/1.1 -servername example.com 2>/dev/null | \
  grep -E "ALPN|Cipher|Protocol"
# ALPN protocol: h2
# Cipher is TLS_AES_256_GCM_SHA384
# Protocol  : TLSv1.3

# nmap — сканирование cipher suites
nmap --script ssl-enum-ciphers -p 443 example.com
# Показывает: все поддерживаемые suites, оценку (A/B/C/F)

# testssl.sh — полный отчёт
bash testssl.sh --cipher-per-proto --protocols example.com
bash testssl.sh -E example.com   # все cipher suites
bash testssl.sh -P example.com   # протоколы
```

### Типичные проблемы

```
Проблема: HTTP/2 не работает, хотя сервер настроен

  Диагностика:
    curl -v --http2 https://example.com 2>&1 | grep ALPN
    # Если нет ALPN → сервер не поддерживает или неправильно настроен

    openssl s_client -connect example.com:443 -alpn h2 2>/dev/null \
      | grep ALPN
    # Если пусто → нет ALPN ответа от сервера

  Причины:
    - nginx: нет "http2 on" (или "listen 443 ssl http2" в старом синтаксисе)
    - Apache: mod_http2 не загружен, нет Protocols h2
    - Промежуточный прокси/балансировщик не проксирует h2
    - Клиент не отправляет ALPN

Проблема: неправильный сертификат (SNI не работает)

  Диагностика:
    openssl s_client -connect ip:443 -servername target.domain 2>/dev/null \
      | openssl x509 -noout -subject
    # CN должен совпадать с target.domain

    # Без SNI — что отдаёт?
    openssl s_client -connect ip:443 -noservername 2>/dev/null \
      | openssl x509 -noout -subject

  Причины:
    - Неправильный server_name в nginx конфиге
    - ssl_certificate в default server (перекрывает все)
    - Клиент не отправляет SNI (очень старый клиент)

Проблема: handshake failure (no shared cipher)

  Диагностика:
    openssl s_client -connect example.com:443 2>&1 | grep -E "alert|error"
    # alert handshake failure → нет общего cipher suite

    # Посмотреть что поддерживает сервер
    nmap --script ssl-enum-ciphers -p 443 example.com

    # Принудительно старый cipher для диагностики
    openssl s_client -connect example.com:443 \
      -cipher TLSv1.2+FIPS:kRSA+FIPS:!eNULL:!aNULL

  Причины:
    - Сервер требует только TLS 1.3, клиент не поддерживает
    - Сервер отключил все поддерживаемые клиентом suites
    - Firewall/IDS вмешивается в handshake

Проблема: SNI не передаётся (некоторые инструменты)

  curl по умолчанию отправляет SNI = hostname из URL.
  wget — аналогично.
  openssl s_client — нужно явно -servername.
  Старые Java приложения — могут не поддерживать SNI (Java 6).

  Проверить:
    openssl s_client -connect example.com:443   # SNI = нет (старое поведение)
    openssl s_client -connect example.com:443 -servername example.com  # SNI = есть
```

---

## Шпаргалка

```
Cipher Suite:
  TLS 1.2: Key Exchange + Auth + Cipher + MAC
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  TLS 1.3: только Cipher + Hash (KE и Auth отдельно)
    TLS_AES_256_GCM_SHA384

  Хорошие KE:  ECDHE (X25519, P-256), DHE >= 2048 бит
  Плохие KE:   RSA (нет PFS), анонимные DH
  Хорошие шифры: AES-GCM, ChaCha20-Poly1305
  Плохие шифры:  RC4, 3DES, DES, NULL, CBC без AEAD
  Forward Secrecy = ECDHE или DHE (обязательно!)

SNI:
  Расширение TLS, клиент указывает домен в ClientHello.
  Позволяет один IP → много TLS сертификатов.
  ОТКРЫТЫЙ ТЕКСТ → ISP/наблюдатель видит домен.
  ECH = шифрованный SNI (TLS 1.3 + DoH).
  nginx: server_name → автоматически по SNI.

ALPN:
  Расширение TLS, согласование протокола приложения.
  ClientHello: ["h2", "http/1.1"]
  ServerHello: "h2"
  Нет лишнего round-trip.
  "h2" = HTTP/2, "http/1.1" = HTTP/1.1, "h3" = HTTP/3
  "acme-tls/1" = Let's Encrypt TLS-ALPN-01 challenge
  "dot" = DNS over TLS

nginx:
  http2 on;         → ALPN ["h2", "http/1.1"]
  ssl_ciphers ...;  → список TLS 1.2 suites
  ssl_ecdh_curve X25519:prime256v1; → кривые для ECDHE

Диагностика:
  openssl s_client -connect host:443 -servername host -alpn h2,http/1.1
  nmap --script ssl-enum-ciphers -p 443 host
  testssl.sh host
  tshark -Y 'tls.handshake.type==1' -e tls.handshake.extensions_server_name
  curl -v --http2 https://host 2>&1 | grep -E "ALPN|HTTP/"
```

---

## Ссылки

- [RFC 6066](https://www.rfc-editor.org/rfc/rfc6066) - TLS Extensions (SNI, MaxFragmentLength, ...)
- [RFC 7301](https://www.rfc-editor.org/rfc/rfc7301) - ALPN (Application-Layer Protocol Negotiation)
- [RFC 7465](https://www.rfc-editor.org/rfc/rfc7465) - Prohibiting RC4 Cipher Suites
- [RFC 8701](https://www.rfc-editor.org/rfc/rfc8701) - GREASE for TLS
- [RFC 8737](https://www.rfc-editor.org/rfc/rfc8737) - ACME TLS-ALPN-01 Challenge
- [RFC 9258](https://www.rfc-editor.org/rfc/rfc9258) - ECH (Encrypted Client Hello)
- [IANA TLS Cipher Suites](https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-4)
- [IANA ALPN Protocol IDs](https://www.iana.org/assignments/tls-extensiontype-values/tls-extensiontype-values.xhtml#alpn-protocol-ids)
- [Mozilla SSL Config Generator](https://ssl-config.mozilla.org)
- [Cipher Suite Info](https://ciphersuite.info) - база данных cipher suites с оценками
- [SSL Labs Cipher Suites](https://www.ssllabs.com/ssltest/) - проверка конфигурации
- [Cloudflare ECH](https://blog.cloudflare.com/encrypted-client-hello) - статья о ECH
