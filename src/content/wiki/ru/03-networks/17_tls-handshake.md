---
title: "HTTPS - TLS handshake (1.2 и 1.3)"
date: "2026-05-02"
---

TLS (Transport Layer Security) - криптографический протокол, обеспечивающий шифрование, аутентификацию и целостность данных поверх TCP. HTTPS = HTTP + TLS. TLS 1.2 определён в RFC 5246 (2008), TLS 1.3 - в RFC 8446 (2018).

Главные улучшения TLS 1.3: handshake за 1 RTT вместо 2, убраны слабые алгоритмы, 0-RTT для повторных соединений.

---

## Что даёт TLS

```
TLS обеспечивает три свойства:

Конфиденциальность (Confidentiality):
  Данные зашифрованы → перехватчик видит шифротекст.
  AES-GCM, ChaCha20-Poly1305.

Аутентификация (Authentication):
  Клиент убеждается что говорит с настоящим сервером.
  Сертификат X.509 + цифровая подпись сервера.
  Опционально: mutual TLS (mTLS) - сервер тоже проверяет клиента.

Целостность (Integrity):
  Данные не изменены в пути.
  HMAC или AEAD (Authenticated Encryption with Associated Data).

Без TLS:
  Провайдер, кафе Wi-Fi, корпоративный прокси - видят всё.
  MITM атака: подменить ответ сервера.
  Инъекция: добавить скрипт в HTML ответ.
```

---

## TLS 1.2 Handshake

TLS 1.2 требует **2 RTT** до начала передачи данных.

```
Клиент                                              Сервер
  │                                                    │
  │──── ClientHello ──────────────────────────────────►│  RTT 1 →
  │     - TLS версия (1.2)                             │
  │     - случайное число (Client Random, 32 байта)    │
  │     - список cipher suites                         │
  │     - список расширений (SNI, ALPN...)             │
  │                                                    │
  │◄─── ServerHello ───────────────────────────────────│
  │     - выбранная версия TLS                         │
  │     - случайное число (Server Random, 32 байта)    │
  │     - выбранный cipher suite                       │
  │◄─── Certificate ───────────────────────────────────│
  │     - цепочка сертификатов X.509                   │
  │◄─── ServerKeyExchange (опц.) ──────────────────────│  ← RTT 1 ←
  │     - параметры DH (если DHE/ECDHE)                │
  │     - подпись сервера                              │
  │◄─── ServerHelloDone ───────────────────────────────│
  │                                                    │
  │  Клиент проверяет сертификат                       │
  │  Клиент генерирует pre-master secret               │
  │                                                    │
  │──── ClientKeyExchange ────────────────────────────►│  RTT 2 →
  │     - зашифрованный pre-master secret (RSA)        │
  │     - или DH публичный ключ (DHE/ECDHE)            │
  │──── ChangeCipherSpec ─────────────────────────────►│
  │     - "переключаюсь на шифрование"                 │
  │──── Finished ─────────────────────────────────────►│
  │     - HMAC всего handshake (зашифрован)            │
  │                                                    │
  │◄─── ChangeCipherSpec ──────────────────────────────│
  │◄─── Finished ──────────────────────────────────────│  ← RTT 2 ←
  │                                                    │
  │══════════ Зашифрованные данные (HTTP) ════════════►│
  │◄═════════ Зашифрованные данные (HTTP) ════════════│
```

### Cipher Suite в TLS 1.2

```
Cipher Suite - набор алгоритмов для handshake, шифрования и MAC.
Формат: TLS_KeyExchange_Auth_WITH_Cipher_MAC

Пример:
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
       │      │        │          │
       │      │        │          └── MAC: HMAC-SHA256
       │      │        └── Шифр: AES-128 в режиме GCM
       │      └── Аутентификация сертификата: RSA подпись
       └── Обмен ключами: ECDHE (эллиптические кривые DH)

Популярные cipher suites TLS 1.2:
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256    ← рекомендуется
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384    ← рекомендуется
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305     ← для мобильных
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 ← с ECDSA сертификатами

Устаревшие (не использовать!):
  TLS_RSA_WITH_AES_128_CBC_SHA     ← нет Forward Secrecy
  TLS_RSA_WITH_RC4_128_MD5         ← RC4 сломан
  TLS_DHE_RSA_WITH_DES_CBC_SHA     ← DES сломан
  *_WITH_NULL_*                    ← нет шифрования (!)
```

### Генерация ключей в TLS 1.2

```
Pre-Master Secret → Master Secret → Session Keys

1. Pre-Master Secret:
   - RSA: клиент генерирует 48 байт, шифрует публичным ключом сервера
   - DHE/ECDHE: обе стороны вычисляют общий секрет через DH

2. Master Secret (48 байт):
   master_secret = PRF(pre_master_secret,
                       "master secret",
                       ClientRandom + ServerRandom)
   PRF = Pseudo-Random Function (HMAC-SHA256 или SHA-384)

3. Key Material (из Master Secret):
   key_block = PRF(master_secret,
                   "key expansion",
                   ServerRandom + ClientRandom)

   Из key_block нарезаются:
   - client_write_MAC_key   (HMAC ключ клиента)
   - server_write_MAC_key   (HMAC ключ сервера)
   - client_write_key       (ключ шифрования клиента)
   - server_write_key       (ключ шифрования сервера)
   - client_write_IV        (IV для клиента, если нужен)
   - server_write_IV        (IV для сервера)
```

### Forward Secrecy (совершенная прямая секретность)

```
Проблема без Forward Secrecy (RSA key exchange):
  Если атакующий записал весь трафик сегодня,
  а завтра получил приватный ключ сервера →
  он может расшифровать ВСЕ старые сессии.

Forward Secrecy (DHE/ECDHE):
  Для каждой сессии генерируются новые временные DH ключи.
  Долгосрочный ключ сервера используется только для подписи.
  Компрометация долгосрочного ключа не раскрывает старые сессии.
  Временные ключи уничтожаются после сессии.

  cipher suites с FS: все с DHE или ECDHE
  cipher suites без FS: TLS_RSA_* (устарели)
```

---

## TLS 1.3 Handshake

TLS 1.3 требует **1 RTT** до начала данных (0-RTT для повторных).

```
Клиент                                              Сервер
  │                                                    │
  │──── ClientHello ──────────────────────────────────►│  RTT 1 →
  │     - TLS 1.3 (через supported_versions extension) │
  │     - Client Random                                │
  │     - список cipher suites (только AEAD)           │
  │     - key_share: DH публичный ключ                 │
  │       (угадываем группу - обычно X25519)           │
  │     - supported_groups, signature_algorithms       │
  │     - (SNI, ALPN, pre_shared_key...)               │
  │                                                    │
  │◄─── ServerHello ───────────────────────────────────│
  │     - выбранный cipher suite                       │
  │     - key_share: DH публичный ключ сервера         │
  │     [всё что дальше - уже зашифровано!]            │
  │◄─── EncryptedExtensions ───────────────────────────│
  │◄─── Certificate ───────────────────────────────────│
  │◄─── CertificateVerify ─────────────────────────────│
  │     - подпись handshake приватным ключом           │
  │◄─── Finished ──────────────────────────────────────│  ← RTT 1 ←
  │     - HMAC всего handshake                        │
  │                                                    │
  │  Клиент проверяет сертификат и подпись             │
  │                                                    │
  │──── Finished ─────────────────────────────────────►│
  │                                                    │
  │══════════ Зашифрованные данные (HTTP) ════════════►│
  │◄═════════ Зашифрованные данные (HTTP) ════════════│
```

```
Ключевые отличия от TLS 1.2:
  1. Сервер отправляет Certificate прямо в RTT 1 (нет отдельного RTT)
  2. Всё после ServerHello уже зашифровано (меньше метаданных в открытом виде)
  3. DH ключи в ClientHello (не ждём ServerHello чтобы начать DH)
  4. Нет RSA key exchange (только ECDHE/DHE - Forward Secrecy всегда)
  5. Нет ChangeCipherSpec (шифрование включается неявно)
  6. CertificateVerify: подпись самого handshake (а не только данных)
```

### Cipher Suites в TLS 1.3

```
В TLS 1.3 cipher suite упрощён - только AEAD алгоритм + хэш.
Key exchange и аутентификация вынесены отдельно.

TLS 1.3 cipher suites (всего 5):
  TLS_AES_128_GCM_SHA256          ← стандартный
  TLS_AES_256_GCM_SHA384          ← усиленный
  TLS_CHACHA20_POLY1305_SHA256    ← для мобильных / без AES-NI
  TLS_AES_128_CCM_SHA256          ← IoT
  TLS_AES_128_CCM_8_SHA256        ← IoT (укороченный тег)

Группы для key_share (DH параметры):
  x25519      ← рекомендуется (эллиптическая кривая Curve25519)
  secp256r1   ← NIST P-256
  secp384r1   ← NIST P-384
  x448        ← Curve448 (высокая безопасность)
  ffdhe2048   ← классический DH 2048 бит
```

### Генерация ключей в TLS 1.3 (HKDF)

```
TLS 1.3 использует HKDF (HMAC-based Key Derivation Function, RFC 5869).
Ключи выводятся поэтапно через "transcript hash" handshake.

Упрощённая схема:
  Early Secret  ← из PSK (pre-shared key) или нуля
       │
       ▼
  Handshake Secret ← из ECDHE shared secret
       │
       ├── client_handshake_traffic_secret  → ключ для шифрования handshake
       └── server_handshake_traffic_secret  → ключ для шифрования handshake
       │
       ▼
  Master Secret
       │
       ├── client_application_traffic_secret → ключ для данных
       └── server_application_traffic_secret → ключ для данных

  Каждый секрет = HKDF(входной_материал, transcript_hash)
  transcript_hash = хэш всего handshake до этой точки
  → подмена любого сообщения меняет все последующие ключи
```

---

## 0-RTT в TLS 1.3

```
0-RTT (Zero Round Trip Time Resumption) - для повторных соединений.
Клиент отправляет данные вместе с первым пакетом handshake.

Как работает:
  Первое соединение (обычный 1-RTT):
    Сервер отправляет NewSessionTicket после Finished.
    Содержит PSK (pre-shared key) и ticket.

  Повторное соединение (0-RTT):
    Клиент отправляет ClientHello + early_data одновременно.
    Early data зашифрован PSK из предыдущей сессии.
    Сервер расшифровывает early data сразу, без ожидания.

Схема:
  Клиент                            Сервер
    │  ClientHello                    │
    │  + pre_shared_key               │
    │  + early_data (HTTP запрос!)   ──►│  0 RTT!
    │                                 │
    │◄─ ServerHello                   │
    │◄─ EncryptedExtensions           │
    │◄─ Finished                      │
    │──► Finished                     │
    │◄══════════ HTTP ответ ══════════│
```

```
Ограничения и риски 0-RTT:
  - Replay атаки: early data можно повторить (replay)
    Атакующий перехватил 0-RTT пакет → отправил снова →
    сервер выполнил запрос дважды (например, оплата)
  - НЕ использовать для не-идемпотентных запросов (POST, PUT, DELETE)
  - Безопасно только для GET запросов (идемпотентные)
  - Сервер может отклонить early data (вернуть early_data_rejected)
  - Нет Forward Secrecy для 0-RTT данных (PSK долгосрочный)

Защита от replay:
  - Сервер хранит список использованных PSK (stateful)
  - Ограничение по времени (age check)
  - Single-use tickets
```

---

## Сертификаты X.509

```
Сертификат - электронный документ, связывающий публичный ключ с идентичностью.
Подписан Certificate Authority (CA).

Поля сертификата:
  Version:            3 (текущая версия X.509)
  Serial Number:      уникальный номер от CA
  Signature Algorithm: sha256WithRSAEncryption или ecdsa-with-SHA256
  Issuer:             кто выпустил (CA)
  Validity:           Not Before / Not After (срок действия)
  Subject:            для кого (CN=example.com, O=Example Inc...)
  Public Key:         RSA или ECDSA публичный ключ
  Extensions:
    Subject Alt Name (SAN): список доменов (example.com, www.example.com)
    Key Usage:         что можно делать с ключом (digitalSignature, keyEncipherment)
    Extended Key Usage: serverAuth (TLS сервер), clientAuth (TLS клиент)
    Basic Constraints: isCA: false (не CA сертификат)
    CRL Distribution:  где проверить отзыв (CRL)
    OCSP:              URL для онлайн проверки отзыва
    CT Logs:           Certificate Transparency (SCT)
```

```
# Посмотреть сертификат сайта
openssl s_client -connect google.com:443 -showcerts 2>/dev/null | \
  openssl x509 -noout -text

# Только основные поля
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -subject -issuer -dates -fingerprint

# Проверить SAN (Subject Alternative Names)
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -ext subjectAltName

# Срок истечения
openssl s_client -connect google.com:443 2>/dev/null | \
  openssl x509 -noout -enddate
# notAfter=Jun 30 08:00:00 2024 GMT

# Проверить всю цепочку сертификатов
openssl s_client -connect google.com:443 -showcerts 2>/dev/null
# Покажет все сертификаты от leaf до root
```

### Цепочка сертификатов (Chain of Trust)

```
Браузер/клиент доверяет Root CA (захардкожены в ОС/браузере).
Intermediate CA подписан Root CA.
Leaf сертификат (сайта) подписан Intermediate CA.

Root CA (DigiCert, Let's Encrypt ISRG Root, Sectigo...)
  └── Intermediate CA (Let's Encrypt R3)
        └── Leaf Certificate (example.com)

Верификация:
  1. Leaf подписан Intermediate? → проверить подпись публичным ключом Intermediate
  2. Intermediate подписан Root? → проверить подпись публичным ключом Root
  3. Root в хранилище доверия? → ОК

Почему Intermediate CA?
  Root CA ключ хранится offline (в HSM, физически защищён).
  Если Intermediate скомпрометирован - отозвать только Intermediate.
  Root CA не трогается.
```

```
# Проверить всю цепочку
curl -v https://example.com 2>&1 | grep -E "subject|issuer|expire"

# Проверить цепочку через openssl
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt \
  -untrusted intermediate.pem leaf.pem

# Посмотреть что в системном хранилище
ls /etc/ssl/certs/
update-ca-certificates --fresh   # обновить хранилище (Debian/Ubuntu)
```

### OCSP - проверка отзыва сертификата

```
OCSP (Online Certificate Status Protocol) - онлайн проверка
не отозван ли сертификат.

Запрос:
  Клиент → OCSP сервер CA: "статус сертификата с serial 12345?"
  OCSP сервер → клиент: "good" / "revoked" / "unknown"

Проблема: клиент делает запрос к CA при каждом TLS соединении
  → задержка
  → CA видит все ваши соединения (privacy leak)

OCSP Stapling (решение):
  Сервер заранее запрашивает OCSP ответ у CA.
  Прикрепляет (staples) его к TLS handshake.
  Клиент получает OCSP ответ в составе handshake → нет отдельного запроса.
  OCSP ответ подписан CA → нельзя подделать.

Проверить OCSP Stapling:
  openssl s_client -connect google.com:443 -status 2>/dev/null | \
    grep -A 10 "OCSP response"
  # OCSP Response Status: successful (0x0)
```

```
# Проверить отзыв через OCSP вручную
# 1. Получить URL OCSP из сертификата
openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -ocsp_uri
# http://ocsp.example-ca.com

# 2. Запросить OCSP
openssl ocsp -issuer intermediate.pem -cert leaf.pem \
  -url http://ocsp.example-ca.com -resp_text

# Nginx OCSP Stapling:
# ssl_stapling on;
# ssl_stapling_verify on;
# ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
# resolver 8.8.8.8;
```

---

## SNI - Server Name Indication

```
Проблема: один IP может хостить много доменов.
В TLS handshake нет HTTP заголовков (они зашифрованы).
Как сервер знает какой сертификат отправить?

SNI (RFC 6066):
  Клиент добавляет имя домена в ClientHello (до шифрования).
  Сервер читает SNI → выбирает нужный сертификат.

  ClientHello:
    server_name: "example.com"  ← SNI

Проблема SNI с конфиденциальностью:
  SNI видно в открытом виде (до шифрования).
  Провайдер / ISP видит к каким сайтам ты подключаешься.

Решение: ECH (Encrypted Client Hello, RFC draft):
  SNI зашифрован публичным ключом сервера.
  Outer ClientHello: SNI = "encrypted" (публичный cloudflare.com например)
  Inner ClientHello: настоящий SNI, зашифрован
  Cloudflare/Google поддерживают ECH с 2023-2024.
```

```
# Посмотреть SNI в захвате
tcpdump -i eth0 -n 'tcp port 443' -w capture.pcap
# В Wireshark: TLSv1.3 → Client Hello → Extension: server_name

# Проверить поддержку ECH
curl -v https://crypto.cloudflare.com/cdn-cgi/trace 2>&1 | grep -i ech
dig HTTPS cloudflare.com    # ECH публичный ключ в HTTPS записи DNS

# Тест ECH
openssl s_client -connect cloudflare.com:443 -ech_config_list ...
```

---

## ALPN - Application-Layer Protocol Negotiation

```
ALPN (RFC 7301) - договорённость о протоколе приложения внутри TLS.
Без ALPN нельзя различить HTTP/1.1, HTTP/2, HTTP/3 на одном порту.

ClientHello включает ALPN extension:
  alpn_protocols: ["h2", "http/1.1"]  ← клиент поддерживает HTTP/2 и HTTP/1.1

ServerHello отвечает:
  alpn_protocol: "h2"  ← сервер выбрал HTTP/2

Типичные значения:
  "http/1.1"   - HTTP/1.1
  "h2"         - HTTP/2
  "h3"         - HTTP/3 (QUIC)
  "acme-tls/1" - Let's Encrypt ACME проверка
  "dot"        - DNS over TLS
```

```
# Проверить ALPN
openssl s_client -connect google.com:443 -alpn h2 2>/dev/null | \
  grep ALPN
# ALPN protocol: h2

# curl показывает протокол
curl -v https://google.com 2>&1 | grep "< HTTP"
# < HTTP/2 200

# Проверить поддержку HTTP/2
curl --http2 -v https://example.com 2>&1 | grep "^*"
```

---

## Расширения TLS (Extensions)

```
TLS Extensions - механизм добавления новой функциональности без
изменения базового протокола. Добавляются в ClientHello/ServerHello.

Основные расширения:

  server_name (0x0000)     SNI - имя сервера
  max_fragment_length      ограничение размера фрагмента
  status_request           запрос OCSP stapling
  supported_groups         поддерживаемые DH группы (x25519, P-256...)
  signature_algorithms     поддерживаемые алгоритмы подписи
  use_srtp                 Secure RTP (WebRTC)
  heartbeat                heartbeat (небезопасно! CVE-2014-0160 Heartbleed)
  alpn (0x0010)            ALPN - протокол приложения
  signed_certificate_timestamp  Certificate Transparency
  session_ticket           TLS session tickets (resumption)
  pre_shared_key           PSK для 0-RTT
  early_data               0-RTT early data
  supported_versions       поддерживаемые версии TLS
  cookie                   cookie для HelloRetryRequest
  psk_key_exchange_modes   режимы PSK
  key_share                DH публичные ключи (TLS 1.3)
  renegotiation_info       безопасное переговорование
  encrypted_client_hello   ECH (черновик)
```

---

## Session Resumption - возобновление сессии

### Session Tickets (TLS 1.2 и 1.3)

```
После завершения handshake сервер шифрует параметры сессии
и отправляет клиенту как session ticket (NewSessionTicket).

Ключ шифрования ticket хранится на сервере (ticket key).

Повторное соединение:
  Клиент отправляет ticket в ClientHello.
  Сервер расшифровывает → восстанавливает параметры сессии → сокращённый handshake.

Проблема с Forward Secrecy:
  Ticket key долгосрочный → компрометация раскрывает все сессии.
  Решение: ротировать ticket key каждые 24-48 часов.
  Nginx: ssl_session_ticket_key (можно задать несколько ключей)

Настройка в Nginx:
  ssl_session_tickets on;
  ssl_session_ticket_key /etc/nginx/ticket.key;
  ssl_session_timeout 1d;
```

### Session ID (TLS 1.2, устаревает)

```
Старый механизм: сервер хранит параметры сессии по Session ID.
Проблема: нужно shared state между серверами (балансировка нагрузки).
Session Tickets решают эту проблему (клиент хранит зашифрованные данные).
```

---

## Диагностика TLS

### Проверка сервера

```
# Полная информация о TLS соединении
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null
openssl s_client -connect example.com:443 2>/dev/null

# Вывод openssl s_client:
# Protocol: TLSv1.3
# Cipher: TLS_AES_256_GCM_SHA384
# Session-ID: ...
# Session-ID-ctx:
# Resumption PSK: ... (для TLS 1.3)

# Проверить конкретную версию TLS
openssl s_client -connect example.com:443 -tls1_2 2>/dev/null | grep Protocol
openssl s_client -connect example.com:443 -tls1_3 2>/dev/null | grep Protocol

# Проверить cipher suite
openssl s_client -connect example.com:443 2>/dev/null | grep Cipher

# Список поддерживаемых cipher suites сервера
nmap --script ssl-enum-ciphers -p 443 example.com

# sslyze - комплексная проверка
pip install sslyze
sslyze example.com:443
# Проверяет: версии TLS, cipher suites, сертификат, OCSP, HSTS, ...

# testssl.sh - bash скрипт проверки
testssl.sh example.com
testssl.sh --fast example.com   # быстрый режим
```

### Захват TLS трафика

```
# Захват с расшифровкой (если есть SSLKEYLOGFILE)
# В браузере или приложении:
export SSLKEYLOGFILE=/tmp/ssl-keys.log
chromium --ssl-key-log-file=/tmp/ssl-keys.log

# В Wireshark: Edit → Preferences → Protocols → TLS
# Pre-Master-Secret log filename: /tmp/ssl-keys.log
# Теперь Wireshark расшифрует TLS трафик

# Захват только TLS handshake
tcpdump -i eth0 -n 'tcp port 443 and (tcp[tcpflags] & tcp-syn != 0)'

# Посмотреть SNI из трафика
tcpdump -i eth0 -n 'tcp port 443' -A 2>/dev/null | grep -a "\.com\|\.org\|\.net"

# curl с подробным выводом TLS
curl -v --tlsv1.3 https://example.com 2>&1 | grep -E "SSL|TLS|cipher|protocol"
```

### Проверка сертификата

```
# Срок действия
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Все поля сертификата
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -text | head -50

# Только CN и SAN
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -subject -ext subjectAltName

# Проверить цепочку
echo | openssl s_client -connect example.com:443 -showcerts 2>/dev/null | \
  grep -E "subject=|issuer="

# Fingerprint сертификата
echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -fingerprint -sha256

# Мониторинг истечения (для скрипта)
EXPIRY=$(echo | openssl s_client -connect example.com:443 2>/dev/null | \
  openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_TS=$(date -d "$EXPIRY" +%s)
NOW_TS=$(date +%s)
DAYS=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
echo "Сертификат истекает через $DAYS дней"
[ $DAYS -lt 14 ] && echo "ВНИМАНИЕ: пора обновить!"
```

### Частые проблемы

```
Проблема: SSL_ERROR_RX_RECORD_TOO_LONG
  Причина: клиент подключился на HTTP порт (80) через HTTPS.
  Решение: убедиться что порт 443, не 80.

Проблема: ERR_CERT_AUTHORITY_INVALID
  Причина: сертификат подписан неизвестным CA (самоподписанный
           или внутренний CA не добавлен в хранилище).
  Решение: curl -k (обойти), или добавить CA в хранилище.
  curl --cacert my-ca.pem https://example.com

Проблема: ERR_CERT_DATE_INVALID
  Причина: сертификат истёк или часы клиента/сервера неверны.
  Решение: обновить сертификат (Let's Encrypt: certbot renew)
           или синхронизировать время (chronyc makestep).

Проблема: SSL handshake timeout / connection reset
  Причина: файрволл блокирует порт 443, или MTU проблема (PMTUD).
  Диагностика:
    telnet example.com 443          # проверить TCP
    curl -v https://example.com     # подробный вывод

Проблема: ERR_SSL_VERSION_OR_CIPHER_MISMATCH
  Причина: нет общих cipher suites или версий TLS.
  Диагностика:
    nmap --script ssl-enum-ciphers -p 443 example.com
    openssl s_client -connect example.com:443 -tls1_2

Проблема: сертификат не совпадает с именем (CN mismatch)
  Причина: SAN не содержит запрошенный домен.
  Диагностика:
    openssl s_client -connect example.com:443 2>/dev/null | \
      openssl x509 -noout -ext subjectAltName
```

---

## Настройка TLS на сервере

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/nginx/ssl/example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    # Только TLS 1.2 и 1.3
    ssl_protocols TLSv1.2 TLSv1.3;

    # Современные cipher suites
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
                ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
                ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;  # в TLS 1.3 клиент выбирает

    # DH параметры для DHE (TLS 1.2)
    ssl_dhparam /etc/nginx/dhparam.pem;  # openssl dhparam -out dhparam.pem 2048

    # Session resumption
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;  # отключить для Forward Secrecy

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    resolver 8.8.8.8 valid=300s;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Дополнительные заголовки безопасности
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}

# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

```
# Генерация DH параметров
openssl dhparam -out /etc/nginx/dhparam.pem 2048

# Проверить конфигурацию
nginx -t

# Перезагрузить без downtime
nginx -s reload

# Проверить после настройки
curl -I https://example.com | grep -E "Strict|X-Frame|Content-Type"
openssl s_client -connect example.com:443 2>/dev/null | grep -E "Protocol|Cipher"
```

### Let's Encrypt / Certbot

```
# Установить certbot
apt install certbot python3-certbot-nginx  # Ubuntu/Debian
dnf install certbot python3-certbot-nginx  # Fedora/RHEL

# Получить сертификат (Nginx плагин)
certbot --nginx -d example.com -d www.example.com

# Certonly (только сертификат, без правки конфига)
certbot certonly --nginx -d example.com

# DNS challenge (для wildcard сертификатов)
certbot certonly --manual --preferred-challenges dns -d "*.example.com"

# Авто-обновление (cron или systemd timer)
certbot renew --dry-run    # тест обновления
# Cron: 0 0,12 * * * certbot renew --quiet

# Проверить статус сертификатов
certbot certificates
# Found the following certs:
#   Certificate Name: example.com
#   Domains: example.com www.example.com
#   Expiry Date: 2024-07-01 (VALID: 89 days)
#   Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
```

---

## HSTS - HTTP Strict Transport Security

```
HSTS (RFC 6797) - браузер запоминает что сайт только HTTPS.
Защита от SSL stripping атак.

Заголовок:
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

  max-age:          сколько секунд браузер помнит (63072000 = 2 года)
  includeSubDomains: применять и к поддоменам
  preload:          включить в браузерный HSTS preload список

После получения HSTS:
  Браузер → example.com:80 → редирект на HTTPS (локально, не делая запрос!)
  Атакующий не может перехватить HTTP запрос → HTTPS downgrade невозможен.

HSTS Preload:
  Список доменов захардкожен в Chrome, Firefox, Safari.
  Даже при первом посещении - только HTTPS.
  Подать домен: hstspreload.org
  ОСТОРОЖНО: сложно отменить (нужны месяцы на удаление из списка).
```

---

## TLS 1.2 vs TLS 1.3 - сравнение

```
                    TLS 1.2                  TLS 1.3
                    ──────────               ──────────
RTT до данных       2                        1 (0 для resumption)
Forward Secrecy     опционально              обязательно (всегда ECDHE)
Шифрование handshake частичное              полное (после ServerHello)
RSA key exchange    разрешён                 удалён
CBC cipher modes    разрешены                удалены
SHA-1 / MD5        разрешены                удалены
Renegotiation       есть                     удалена
Compression         есть (CRIME атака!)      удалена
Session resumption  Session ID / Tickets     PSK / Tickets
0-RTT               нет                     есть (с осторожностью)
Алгоритмов выбор    клиент/сервер            только AEAD + хэш
Размер ClientHello  меньше                   больше (key_share)
```

---

## Шпаргалка

```
TLS обеспечивает:
  Конфиденциальность (шифрование)
  Аутентификацию (сертификат X.509)
  Целостность (AEAD / HMAC)

TLS 1.2 handshake: 2 RTT
  ClientHello → ServerHello + Certificate + ServerHelloDone
  ClientKeyExchange + ChangeCipherSpec + Finished
  ← ChangeCipherSpec + Finished

TLS 1.3 handshake: 1 RTT
  ClientHello (+ key_share DH ключ)
  ← ServerHello (+ key_share) + [зашифровано] Certificate + CertificateVerify + Finished
  → Finished
  [данные сразу]

TLS 1.3 0-RTT: 0 RTT (с PSK, только идемпотентные запросы)

Cipher suite:
  TLS 1.2: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS 1.3: TLS_AES_128_GCM_SHA256 (только AEAD)

Ключевые понятия:
  Forward Secrecy   - компрометация ключа не раскрывает старые сессии
  SNI               - имя домена в ClientHello (до шифрования)
  ALPN              - выбор протокола (h2, http/1.1, dot)
  OCSP Stapling     - проверка отзыва сертификата без запроса к CA
  HSTS              - браузер помнит HTTPS-only
  ECH               - зашифрованный SNI (черновик)
  0-RTT             - данные в первом пакете (replay риск)

Диагностика:
  openssl s_client -connect host:443           - TLS соединение
  openssl s_client -connect host:443 -tls1_3   - только TLS 1.3
  openssl x509 -noout -text -in cert.pem       - посмотреть сертификат
  nmap --script ssl-enum-ciphers -p 443 host   - cipher suites
  sslyze host:443                              - полная проверка
  testssl.sh host                             - bash проверка
  certbot renew --dry-run                      - тест обновления

Проблемы:
  SERVFAIL TLS     → nmap или sslyze для диагностики cipher/версии
  Cert expired     → certbot renew
  Cert mismatch    → проверить SAN в сертификате
  Handshake fail   → проверить версии TLS и cipher suites
```

---

## Ссылки

- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2
- [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797) - HSTS
- [RFC 7301](https://www.rfc-editor.org/rfc/rfc7301) - ALPN
- [RFC 6066](https://www.rfc-editor.org/rfc/rfc6066) - SNI и другие TLS Extensions
- [RFC 6960](https://www.rfc-editor.org/rfc/rfc6960) - OCSP
- [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869) - HKDF (используется в TLS 1.3)
- [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) - онлайн проверка TLS конфигурации
- [hstspreload.org](https://hstspreload.org) - HSTS preload список
- [testssl.sh](https://testssl.sh) - bash инструмент проверки TLS
- [The Illustrated TLS 1.3 Connection](https://tls13.xargs.org) - побайтовый разбор TLS 1.3
