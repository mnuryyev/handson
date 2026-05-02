---
title: "TLS - сертификаты, PKI, цепочки доверия"
date: "2026-05-03"
---

TLS (Transport Layer Security) - криптографический протокол защиты соединений. Преемник SSL (Secure Sockets Layer). Обеспечивает конфиденциальность, целостность и аутентификацию. TLS 1.3 (RFC 8446, 2018) - актуальная версия. TLS 1.2 (RFC 5246, 2008) - всё ещё широко используется. SSL и TLS 1.0/1.1 считаются устаревшими и небезопасными.

---

## Основы TLS

### Что обеспечивает TLS

```
Конфиденциальность (Confidentiality):
  Данные зашифрованы. Перехватчик видит шифрованный трафик,
  не может прочитать содержимое.

Целостность (Integrity):
  MAC (Message Authentication Code) защищает от модификации.
  Если пакет изменён в пути → обнаруживается, соединение рвётся.

Аутентификация (Authentication):
  Сертификат подтверждает: сервер действительно тот, за кого себя выдаёт.
  Клиент проверяет: "example.com? Да, это действительно example.com."
  Опционально: взаимная аутентификация (mTLS) - сервер проверяет клиента.

Non-repudiation (неотказуемость):
  При взаимной аутентификации - стороны не могут отрицать участие.
```

### TLS в стеке протоколов

```
Приложение (HTTP, SMTP, FTP, LDAP...)
       ↕
     TLS
       ↕
     TCP
       ↕
     IP

TLS работает поверх TCP, ниже прикладного уровня.
HTTPS = HTTP + TLS.
SMTPS = SMTP + TLS.
LDAPS = LDAP + TLS.

QUIC = TLS 1.3 встроен в транспортный уровень (UDP).
```

### Версии TLS

```
Версия    RFC         Год   Статус
──────────────────────────────────────────────────────
SSL 2.0   -           1995  ЗАПРЕЩЁН (RFC 6176)
SSL 3.0   RFC 6101    1996  ЗАПРЕЩЁН (RFC 7568, POODLE атака)
TLS 1.0   RFC 2246    1999  УСТАРЕЛ  (RFC 8996, 2021)
TLS 1.1   RFC 4346    2006  УСТАРЕЛ  (RFC 8996, 2021)
TLS 1.2   RFC 5246    2008  АКТИВЕН  (широкое использование)
TLS 1.3   RFC 8446    2018  АКТИВЕН  (рекомендуется)

Ключевые улучшения TLS 1.3:
  - Удалены устаревшие алгоритмы (RSA key exchange, MD5, SHA-1, DES, RC4)
  - 1-RTT handshake (вместо 2-RTT в TLS 1.2)
  - 0-RTT для повторных соединений (с ограничениями)
  - Forward Secrecy обязателен (только ECDHE/DHE)
  - Зашифрован Certificate фрейм (нет утечки SNI через cert)
  - Упрощены cipher suites (нет комбинаторного взрыва)
```

---

## TLS Handshake

### TLS 1.2 Handshake (2-RTT)

```
Клиент                                           Сервер
  │── ClientHello ────────────────────────────────►│
  │   TLS версия, случайное число (client_random)  │
  │   Поддерживаемые cipher suites                 │
  │   Расширения (SNI, ALPN, ...)                  │
  │                                                │
  │◄── ServerHello ─────────────────────────────────│
  │   Выбранная TLS версия                         │
  │   server_random                                │
  │   Выбранный cipher suite                       │
  │◄── Certificate ─────────────────────────────────│
  │   Сертификат сервера (и цепочка)               │
  │◄── ServerKeyExchange ───────────────────────────│
  │   Параметры обмена ключами (если нужно)        │
  │◄── ServerHelloDone ─────────────────────────────│
  │                                                │
  │   [Клиент проверяет сертификат]                │
  │                                                │
  │── ClientKeyExchange ───────────────────────────►│
  │   Pre-master secret (зашифрован публичным ключом│
  │   или параметры DH/ECDH)                       │
  │── ChangeCipherSpec ────────────────────────────►│
  │── Finished ────────────────────────────────────►│
  │   Хэш всего handshake (зашифрован)             │
  │                                                │
  │◄── ChangeCipherSpec ────────────────────────────│
  │◄── Finished ────────────────────────────────────│
  │                                                │
  │══ Зашифрованные данные приложения ═════════════│

Итого: 2 RTT до начала данных (+ 1 RTT TCP handshake = 3 RTT).
```

### TLS 1.3 Handshake (1-RTT)

```
Клиент                                           Сервер
  │── ClientHello ────────────────────────────────►│
  │   + key_share (публичные ключи ECDH)           │
  │   + supported_versions: TLS 1.3                │
  │   + SNI, ALPN, ...                             │
  │                                                │
  │◄── ServerHello ─────────────────────────────────│
  │   + key_share (публичный ключ сервера ECDH)    │
  │◄── {EncryptedExtensions} ───────────────────────│  } всё зашифровано
  │◄── {Certificate} ───────────────────────────────│  } после ServerHello!
  │◄── {CertificateVerify} ─────────────────────────│
  │◄── {Finished} ──────────────────────────────────│
  │                                                │
  │   [Клиент проверяет сертификат]                │
  │                                                │
  │── {Finished} ──────────────────────────────────►│
  │══ {Зашифрованные данные} ═══════════════════════│

Итого: 1 RTT до начала данных (+ 1 RTT TCP = 2 RTT).

Ключевые отличия от TLS 1.2:
  - Клиент уже в ClientHello отправляет ключи ECDH (не ждёт ServerHello)
  - Сервер сразу вычисляет shared secret после ClientHello
  - Certificate зашифрован (нет утечки имени домена через cert)
  - Нет ChangeCipherSpec (упрощён протокол)
  - Forward Secrecy гарантирован (только ECDHE)
```

### TLS 1.3 - 0-RTT (Early Data)

```
При повторном соединении с известным сервером:

Клиент                                           Сервер
  │── ClientHello ────────────────────────────────►│
  │   + early_data (PSK ticket из предыдущей сессии)│
  │   + {Early Data (HTTP запрос)} ────────────────►│  данные сразу!
  │                                                │
  │◄── ServerHello + ... + Finished ────────────────│
  │◄── {Ответ на early data} ───────────────────────│

Ограничения 0-RTT:
  - Уязвим к replay атакам (тот же запрос можно повторить)
  - Использовать только для идемпотентных запросов (GET)
  - Сервер должен сам защититься от replay (anti-replay tokens)
  - PSK ticket действует ограниченное время
```

### Cipher Suites

```
Cipher suite определяет набор алгоритмов для TLS соединения.

Формат TLS 1.2:
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  ↑   ↑      ↑   ↑    ↑   ↑   ↑
  │   │      │   │    │   │   └─ Хэш для HMAC (SHA-384)
  │   │      │   │    │   └───── Режим шифрования (GCM)
  │   │      │   │    └───────── Размер ключа (256 бит)
  │   │      │   └────────────── Алгоритм шифрования (AES)
  │   │      └────────────────── Алгоритм подписи серверного ключа (RSA)
  │   └───────────────────────── Алгоритм обмена ключами (ECDHE)
  └───────────────────────────── Протокол (TLS)

Формат TLS 1.3 (упрощён - нет key exchange и auth в suite):
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_GCM_SHA256

Алгоритмы обмена ключами:
  ECDHE  - Elliptic Curve Diffie-Hellman Ephemeral (современный)
  DHE    - Diffie-Hellman Ephemeral (старше, медленнее)
  RSA    - прямое шифрование RSA ключом (ЗАПРЕЩЁН в TLS 1.3, нет FS)

Forward Secrecy (Perfect Forward Secrecy, PFS):
  Каждая сессия использует одноразовые ключи (ephemeral).
  Компрометация долгосрочного ключа сервера не раскрывает старые сессии.
  Только ECDHE и DHE обеспечивают PFS.
  RSA key exchange не обеспечивает PFS.

Рекомендуемые cipher suites (TLS 1.2):
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256

Устаревшие (отключить!):
  TLS_RSA_WITH_AES_*             (нет PFS)
  TLS_*_WITH_3DES_*              (SWEET32 атака)
  TLS_*_WITH_RC4_*               (RC4 сломан)
  *_MD5                          (MD5 сломан)
```

---

## Сертификаты X.509

### Структура сертификата

```
X.509 сертификат - ASN.1/DER бинарный формат.
PEM = Base64(DER) в обёртке -----BEGIN CERTIFICATE-----.

Поля сертификата:
  Version:            3 (X.509 v3)
  Serial Number:      уникальный номер у данного CA (hex)
  Signature Algorithm: алгоритм подписи CA (sha256WithRSAEncryption)
  Issuer:             кто выдал сертификат (DN = Distinguished Name)
  Validity:           Not Before / Not After (срок действия)
  Subject:            кому выдан (DN)
  Public Key:         публичный ключ и алгоритм (RSA, ECDSA, ...)
  Extensions:         расширения X.509 v3

Distinguished Name (DN):
  CN  = Common Name      (example.com или "Let's Encrypt R3")
  O   = Organization     (Example Corp)
  OU  = Organizational Unit (IT Department)
  C   = Country          (US, RU, DE)
  ST  = State/Province   (California)
  L   = Locality/City    (San Francisco)
  Email = emailAddress

Subject Alternative Name (SAN, расширение):
  DNS: www.example.com
  DNS: example.com
  DNS: *.example.com      (wildcard)
  IP:  93.184.216.34
  Email: admin@example.com
  URI:  https://example.com

  Современные браузеры используют SAN, CN для доменов устарел.
  Wildcard: *.example.com покрывает sub.example.com,
            НО НЕ sub.sub.example.com (один уровень).
```

### Расширения X.509 v3

```
Basic Constraints:
  CA: TRUE   → это CA сертификат, может подписывать другие
  CA: FALSE  → это конечный (leaf) сертификат
  pathLenConstraint: N  → максимальная глубина цепочки

Key Usage (критическое):
  digitalSignature  - подписывать данные
  keyEncipherment   - шифровать ключи (RSA)
  keyAgreement      - согласование ключей (DH, ECDH)
  keyCertSign       - подписывать сертификаты (только CA)
  cRLSign           - подписывать CRL (только CA)

Extended Key Usage (EKU):
  serverAuth    (1.3.6.1.5.5.7.3.1) - TLS сервер
  clientAuth    (1.3.6.1.5.5.7.3.2) - TLS клиент
  codeSigning   (1.3.6.1.5.5.7.3.3) - подпись кода
  emailProtection (1.3.6.1.5.5.7.3.4) - S/MIME

Subject Key Identifier (SKI):
  Хэш публичного ключа субъекта.
  Используется для идентификации ключа.

Authority Key Identifier (AKI):
  Хэш публичного ключа издателя (CA).
  Связывает сертификат с ключом CA.

CRL Distribution Points:
  URL для загрузки Certificate Revocation List.
  http://crl.example.com/ca.crl

Authority Information Access (AIA):
  OCSP responder URL: http://ocsp.example.com
  CA Issuers URL: http://ca.example.com/ca.crt
  (для скачивания промежуточного сертификата)

Certificate Policies:
  OID политики, под которой выдан сертификат.
  2.23.140.1.2.1 = Domain Validated (DV)
  2.23.140.1.2.2 = Organization Validated (OV)
  2.23.140.1.2.3 = Extended Validation (EV)

SCT - Signed Certificate Timestamp (Certificate Transparency):
  Доказательство что сертификат добавлен в CT лог.
  Браузеры могут требовать SCT для доверия.
```

### Типы сертификатов по валидации

```
DV - Domain Validated (проверка домена):
  CA проверяет только владение доменом.
  Способы проверки:
    - HTTP-01: файл по URL http://example.com/.well-known/acme-challenge/TOKEN
    - DNS-01: TXT запись _acme-challenge.example.com
    - TLS-ALPN-01: специальный TLS сертификат на порту 443
  Быстро (минуты). Бесплатно (Let's Encrypt).
  Браузер показывает замок, нет имени организации.

OV - Organization Validated (проверка организации):
  CA проверяет домен + существование организации + право на домен.
  Проверка через государственные реестры, телефон.
  Занимает дни. Платно.
  Браузер: замок (как DV). Данные организации в сертификате.

EV - Extended Validation (расширенная проверка):
  Строгая проверка организации (юридическое лицо, адрес, телефон).
  Стандарт CA/Browser Forum.
  Занимает недели. Дорого.
  Старые браузеры: зелёная адресная строка с именем организации.
  Современные браузеры (2019+): убрали визуальное отличие от OV.
  Актуально для: банки, финансы, государственные сайты.

Wildcard (*.example.com):
  Покрывает один уровень поддоменов.
  Может быть DV, OV или EV.
  Один сертификат для всех поддоменов.
  Минус: компрометация = все поддомены под угрозой.

Multi-SAN (Subject Alternative Names):
  Один сертификат для нескольких доменов.
  Пример: example.com, www.example.com, api.example.com.
  Let's Encrypt: до 100 SAN на сертификат.
```

### Форматы файлов сертификатов

```
PEM (Privacy Enhanced Mail):
  Base64 кодирование DER, обёртка -----BEGIN/END-----.
  Расширения: .pem, .crt, .cer, .key
  Может содержать: сертификат, ключ, цепочку.
  -----BEGIN CERTIFICATE-----
  MIIDazCCAlOgAwIBAgIUExam...
  -----END CERTIFICATE-----

DER (Distinguished Encoding Rules):
  Бинарный формат ASN.1.
  Расширения: .der, .cer
  Не читаемый человеком.
  Используется в Java, Android.

PKCS#12 / PFX:
  Контейнер для сертификата + приватного ключа + цепочки.
  Расширения: .p12, .pfx
  Защищён паролем.
  Используется в Windows, браузерах.
  Экспорт из Windows Certificate Store.

PKCS#7 / P7B:
  Контейнер для сертификата + цепочки (без ключа).
  Расширения: .p7b, .p7c
  Используется в Windows для импорта цепочек.

JKS (Java KeyStore):
  Формат Java.
  Расширение: .jks
  Заменяется на PKCS#12 в новых версиях Java.

Конвертация форматов:
  # PEM → DER
  openssl x509 -in cert.pem -out cert.der -outform DER

  # DER → PEM
  openssl x509 -in cert.der -out cert.pem -inform DER

  # PEM → PKCS#12 (с ключом и цепочкой)
  openssl pkcs12 -export -out cert.p12 \
    -inkey key.pem -in cert.pem -certfile chain.pem

  # PKCS#12 → PEM
  openssl pkcs12 -in cert.p12 -out cert.pem -nodes

  # Просмотр PEM
  openssl x509 -in cert.pem -text -noout

  # Просмотр PKCS#12
  openssl pkcs12 -in cert.p12 -info
```

---

## PKI - Public Key Infrastructure

### Компоненты PKI

```
PKI - система управления цифровыми сертификатами.

Компоненты:
  CA (Certificate Authority) - удостоверяющий центр
  RA (Registration Authority) - регистрационный центр
  CRL (Certificate Revocation List) - список отозванных сертификатов
  OCSP (Online Certificate Status Protocol) - проверка статуса
  Certificate Repository - хранилище сертификатов

CA выполняет:
  - Проверку заявителя (identity verification)
  - Подпись сертификатов (цифровая подпись своим приватным ключом)
  - Публикацию CRL
  - Поддержку OCSP responder

Типы CA:
  Root CA:
    Верхний уровень иерархии.
    Самоподписанный сертификат (self-signed).
    Хранится в Trust Store браузера/ОС.
    Приватный ключ в HSM, офлайн (air-gapped).
    Никогда не выдаёт сертификаты конечным пользователям напрямую.

  Intermediate CA (Subordinate CA):
    Подписан Root CA.
    Выдаёт сертификаты конечным пользователям.
    Онлайн (но ключ защищён HSM).
    Несколько Intermediate CA = изоляция рисков.

  Leaf Certificate (End Entity):
    Конечный сертификат (ваш сайт).
    Подписан Intermediate CA.
    CA: FALSE в Basic Constraints.
```

### Цепочка доверия (Chain of Trust)

```
Полная цепочка сертификатов:

  Root CA (самоподписан, в Trust Store)
    └── Intermediate CA (подписан Root CA)
          └── Leaf Certificate (подписан Intermediate CA)
                └── ваш сайт

Пример (Let's Encrypt):
  ISRG Root X1  (Root CA, самоподписан)
    └── Let's Encrypt R11 (Intermediate CA)
          └── *.example.com (Leaf, ваш сертификат)

Пример (DigiCert):
  DigiCert Global Root CA
    └── DigiCert SHA2 Secure Server CA
          └── www.example.com

Проверка цепочки браузером:
  1. Получает leaf сертификат от сервера.
  2. Проверяет подпись: кто подписал этот сертификат?
  3. Ищет Intermediate CA (в ответе сервера или AIA).
  4. Проверяет подпись Intermediate: кто подписал его?
  5. Доходит до Root CA → проверяет в Trust Store.
  6. Если Root найден и всё валидно → ДОВЕРЯЕТ.

Обязательно отдавать полную цепочку!
  Сервер должен отправить: leaf + все intermediate CA.
  Root CA НЕ включается (он есть в Trust Store клиента).
  Если цепочка неполная → браузер не может построить путь → ошибка.
```

### Trust Store

```
Trust Store - хранилище доверенных корневых CA.
Браузер/ОС/приложение проверяет сертификаты относительно Trust Store.

Системные Trust Store:
  Windows:  Управление компьютером → Сертификаты
            certmgr.msc (только текущий пользователь)
            certlm.msc  (компьютер)

  macOS:    Keychain Access → Системные корневые сертификаты
            /System/Library/Keychains/SystemRootCertificates.keychain

  Linux:    /etc/ssl/certs/ (Ubuntu/Debian)
            /etc/pki/ca-trust/ (RHEL/CentOS)
            update-ca-certificates (Debian/Ubuntu)
            update-ca-trust (RHEL/CentOS)

  Java:     $JAVA_HOME/lib/security/cacerts (JKS)
            keytool -list -keystore cacerts

Браузерные Trust Store:
  Firefox:  свой Trust Store (Mozilla NSS), НЕ системный
            about:preferences#privacy → View Certificates
  Chrome:   использует системный Trust Store (Windows/macOS)
            На Linux: использует NSS (certutil)

Добавить корневой CA (для корпоративного PKI):
  # Ubuntu/Debian
  cp my-ca.crt /usr/local/share/ca-certificates/
  update-ca-certificates

  # RHEL/CentOS
  cp my-ca.crt /etc/pki/ca-trust/source/anchors/
  update-ca-trust extract

  # macOS
  sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain my-ca.crt

  # Windows (PowerShell)
  Import-Certificate -FilePath "my-ca.crt" \
    -CertStoreLocation Cert:\LocalMachine\Root
```

---

## Отзыв сертификатов

### CRL - Certificate Revocation List

```
CRL - список отозванных сертификатов, подписанный CA.
Содержит Serial Number отозванных сертификатов + причину + дату.

Причины отзыва (Reason Code):
  0 - unspecified (не указана)
  1 - keyCompromise (ключ скомпрометирован)
  2 - cACompromise (CA скомпрометирован)
  3 - affiliationChanged (смена организации)
  4 - superseded (заменён новым сертификатом)
  5 - cessationOfOperation (прекращение деятельности)
  6 - certificateHold (временная приостановка)
  9 - privilegeWithdrawn (отзыв привилегий)

Формат CRL:
  Версия, Issuer, дата выпуска, дата следующего обновления,
  список: [Serial, дата отзыва, reason code]
  Подпись CA.

Проблемы CRL:
  - Большой размер (мегабайты для крупных CA)
  - Клиент должен скачать CRL (HTTP запрос при каждом соединении)
  - Кэшируется до nextUpdate (до суток)
  - Медленно обновляется

Проверка CRL вручную:
  openssl crl -in ca.crl -text -noout   (просмотр)
  openssl verify -crl_check -CRLfile ca.crl cert.pem
```

### OCSP - Online Certificate Status Protocol

```
OCSP (RFC 6960) - онлайн проверка статуса сертификата.
Более оперативно чем CRL.

Процесс OCSP:
  Клиент                          OCSP Responder
    │── OCSP Request ─────────────►│
    │   Serial Number сертификата  │
    │   Issuer DN + Issuer Key Hash│
    │                              │
    │◄── OCSP Response ────────────│
    │   good / revoked / unknown   │
    │   Время проверки             │
    │   Подпись Responder'а        │

OCSP Response статусы:
  good    - сертификат действителен
  revoked - отозван (с причиной и датой)
  unknown - CA не знает такого сертификата

Проблемы OCSP:
  - Приватность: CA узнаёт какие сайты вы посещаете
  - Производительность: дополнительный HTTP запрос при каждом соединении
  - Доступность: если OCSP сервер недоступен → soft-fail (пропускать)

Проверка OCSP вручную:
  openssl ocsp \
    -issuer intermediate.pem \
    -cert cert.pem \
    -url http://ocsp.example.com \
    -text
```

### OCSP Stapling

```
OCSP Stapling решает проблемы обычного OCSP:

Без stapling:
  Браузер → OCSP сервер CA (при каждом соединении)
  Приватность нарушена, медленно.

С OCSP Stapling:
  Сервер сам периодически запрашивает OCSP ответ у CA.
  Кэширует подписанный OCSP ответ (обычно 24-48 часов).
  При TLS handshake "прикрепляет" (staples) OCSP ответ к Certificate.
  Браузер не обращается к CA напрямую.

Преимущества:
  - Нет приватности проблем (браузер не знает о OCSP)
  - Быстрее (нет дополнительного соединения)
  - Работает даже если OCSP сервер недоступен (кэш)

OCSP Must-Staple:
  Расширение сертификата (RFC 7633).
  Говорит браузеру: "Этот сертификат ВСЕГДА должен иметь OCSP Staple".
  Если staple отсутствует → браузер отказывает в соединении.
  Защита от атак с отключением OCSP.

Настройка nginx:
  ssl_stapling on;
  ssl_stapling_verify on;
  resolver 8.8.8.8 8.8.4.4 valid=300s;   (для OCSP запросов)
  ssl_trusted_certificate /etc/ssl/chain.pem;  (полная цепочка)

Настройка Apache:
  SSLUseStapling On
  SSLStaplingCache "shmcb:logs/stapling-cache(150000)"

Проверить stapling:
  openssl s_client -connect example.com:443 -status 2>/dev/null \
    | grep -A 10 "OCSP Response"
  # OCSP Response Status: successful (0x0)
  # Response verify OK
```

---

## Certificate Transparency (CT)

```
Certificate Transparency (RFC 9162) - публичные логи всех выданных сертификатов.
Google запустил в 2013 после взлома DigiNotar.

Цель:
  Любой сертификат должен быть в публичном CT логе.
  Владелец домена может проверить: не выдан ли мошеннический сертификат?
  CA не может тайно выдать сертификат для example.com.

Процесс:
  1. CA выдаёт сертификат.
  2. CA отправляет сертификат в CT лог.
  3. CT лог возвращает SCT (Signed Certificate Timestamp).
  4. SCT встраивается в сертификат или передаётся через TLS.
  5. Браузер проверяет SCT (с 2018 Chrome требует 2+ SCT).

SCT хранится в:
  - Расширении сертификата (embedded SCT)
  - TLS расширении (TLS handshake)
  - OCSP stapling ответе

Публичные CT логи:
  Google Argon, Google Xenon, DigiCert Yeti, Sectigo Mammoth, ...
  crt.sh - поиск по CT логам (удобный UI)
  Реализованы как Merkle дерево (append-only, доказуемо).

Мониторинг CT:
  # Все сертификаты для домена (через crt.sh API)
  curl "https://crt.sh/?q=%.example.com&output=json" | jq '.[].name_value'

  # Инструменты мониторинга
  certspotter (SSLMate) - уведомления о новых сертификатах
  Facebook CT Monitor - monitor.cert.transparency.dev
```

---

## Создание и управление сертификатами

### Генерация ключей и CSR

```bash
# Генерация RSA ключа (2048 или 4096 бит)
openssl genrsa -out private.key 4096
openssl genrsa -aes256 -out private.key 4096  # с паролем

# Генерация ECDSA ключа (рекомендуется)
openssl ecparam -name prime256v1 -genkey -noout -out private.key  # P-256
openssl ecparam -name secp384r1  -genkey -noout -out private.key  # P-384

# CSR (Certificate Signing Request)
openssl req -new -key private.key -out request.csr \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Example Corp/CN=example.com"

# CSR с SAN расширениями
cat > san.conf << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = RU
ST = Moscow
O = Example Corp
CN = example.com

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = example.com
DNS.2 = www.example.com
DNS.3 = api.example.com
IP.1  = 93.184.216.34
EOF

openssl req -new -key private.key -out request.csr -config san.conf

# Просмотр CSR
openssl req -in request.csr -text -noout
openssl req -in request.csr -verify   (проверить подпись)

# Самоподписанный сертификат (для тестов)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### Let's Encrypt / ACME

```bash
# certbot - самый популярный ACME клиент
apt install certbot python3-certbot-nginx

# Получить сертификат (nginx)
certbot --nginx -d example.com -d www.example.com

# Получить сертификат (standalone, остановить nginx)
certbot certonly --standalone -d example.com

# DNS-01 challenge (для wildcard)
certbot certonly --manual --preferred-challenges dns \
  -d "*.example.com" -d example.com

# Автообновление (cron или systemd timer)
certbot renew --dry-run   (тест)
certbot renew             (реальное обновление)

# Файлы Let's Encrypt:
/etc/letsencrypt/live/example.com/
  cert.pem       - сертификат (leaf)
  chain.pem      - промежуточный CA
  fullchain.pem  - cert.pem + chain.pem (для nginx/apache)
  privkey.pem    - приватный ключ

# acme.sh - альтернативный клиент
curl https://get.acme.sh | sh
acme.sh --issue -d example.com --webroot /var/www/html
acme.sh --issue -d example.com --nginx
acme.sh --issue -d "*.example.com" --dns dns_cf  # Cloudflare DNS
```

### Просмотр и проверка сертификатов

```bash
# Просмотр сертификата
openssl x509 -in cert.pem -text -noout
openssl x509 -in cert.pem -noout -subject -issuer -dates -fingerprint

# Проверить цепочку
openssl verify -CAfile root.pem -untrusted intermediate.pem cert.pem

# Проверить сертификат на сервере
openssl s_client -connect example.com:443 -servername example.com

# Показать всю цепочку
openssl s_client -connect example.com:443 -showcerts 2>/dev/null

# Проверить соответствие ключа и сертификата
openssl x509 -in cert.pem -noout -modulus | md5sum
openssl rsa -in private.key -noout -modulus | md5sum
# Хэши должны совпасть!

# Когда истекает сертификат
openssl x509 -in cert.pem -noout -enddate
openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# SSL Labs тест (онлайн)
# https://www.ssllabs.com/ssltest/

# testssl.sh - локальное тестирование
bash testssl.sh example.com
bash testssl.sh --severity HIGH example.com   (только HIGH и выше)

# Быстрая проверка cipher suites
nmap --script ssl-enum-ciphers -p 443 example.com

# Проверить HSTS
curl -sI https://example.com | grep -i strict-transport

# Проверить Certificate Transparency
curl "https://crt.sh/?q=example.com&output=json" | jq '.[0]'
```

### Корпоративный PKI (Internal CA)

```bash
# Создать корневой CA
mkdir -p /ca/root/{certs,crl,newcerts,private}
chmod 700 /ca/root/private
touch /ca/root/index.txt
echo 1000 > /ca/root/serial

# Ключ Root CA (защищён паролем!)
openssl genrsa -aes256 -out /ca/root/private/ca.key 4096
chmod 400 /ca/root/private/ca.key

# Самоподписанный сертификат Root CA
openssl req -config /ca/root/openssl.conf \
  -key /ca/root/private/ca.key \
  -new -x509 -days 7300 -sha256 \
  -extensions v3_ca \
  -out /ca/root/certs/ca.crt

# Создать Intermediate CA
openssl genrsa -aes256 -out /ca/intermediate/private/intermediate.key 4096
openssl req -config /ca/intermediate/openssl.conf \
  -key /ca/intermediate/private/intermediate.key \
  -new -sha256 -out /ca/intermediate/csr/intermediate.csr

# Подписать Intermediate CA корневым CA
openssl ca -config /ca/root/openssl.conf \
  -extensions v3_intermediate_ca \
  -days 3650 -notext -md sha256 \
  -in /ca/intermediate/csr/intermediate.csr \
  -out /ca/intermediate/certs/intermediate.crt

# Подписать сертификат сервера
openssl ca -config /ca/intermediate/openssl.conf \
  -extensions server_cert \
  -days 365 -notext -md sha256 \
  -in request.csr \
  -out server.crt

# Создать bundle (цепочка для nginx)
cat server.crt /ca/intermediate/certs/intermediate.crt > fullchain.crt
```

---

## Безопасность TLS

### Типичные уязвимости и атаки

```
POODLE (CVE-2014-3566):
  Атака на SSL 3.0 (padding oracle для CBC).
  Решение: отключить SSL 3.0 полностью.

BEAST (CVE-2011-3389):
  Атака на CBC в TLS 1.0.
  Решение: TLS 1.1+ или prefer RC4 (RC4 тоже сломан, лучше 1.1+).

CRIME/BREACH:
  Атака на TLS компрессию / HTTP компрессию.
  CRIME: отключить TLS компрессию.
  BREACH: отключить HTTP компрессию для секретных данных.

Heartbleed (CVE-2014-0160):
  Уязвимость в OpenSSL HeartBeat расширении.
  Утечка памяти сервера (включая приватный ключ).
  Решение: обновить OpenSSL, перевыпустить сертификаты.

FREAK (CVE-2015-0204):
  Понижение до экспортных (40-бит) ключей.
  Решение: отключить экспортные cipher suites.

Logjam (CVE-2015-4000):
  Атака на DHE с 512-бит ключами.
  Решение: использовать DH параметры >= 2048 бит или ECDHE.

Sweet32 (CVE-2016-2183):
  64-битные блочные шифры (3DES) - атака дня рождения.
  Решение: отключить 3DES.

ROBOT (CVE-2017-13099):
  Return Of Bleichenbacher's Oracle Threat.
  RSA PKCS#1 v1.5 padding oracle.
  Решение: не использовать RSA key exchange (всегда ECDHE).

Downgrade атаки:
  Атакующий заставляет использовать слабый протокол/cipher.
  Защита: TLS_FALLBACK_SCSV, отключить старые версии.
```

### Рекомендуемая конфигурация TLS

```nginx
# nginx - современная безопасная конфигурация

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;   # TLS 1.3: клиент выбирает

# TLS 1.2 ciphers (только ECDHE, только AEAD)
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
            ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
            ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

# DH параметры для DHE (если нужно)
ssl_dhparam /etc/ssl/dhparam4096.pem;   # openssl dhparam -out dhparam4096.pem 4096

# Кривые для ECDHE
ssl_ecdh_curve X25519:prime256v1:secp384r1;

# Сессионный кэш
ssl_session_cache shared:SSL:50m;
ssl_session_timeout 1d;
ssl_session_tickets off;   # отключить для PFS (спорно)

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/ssl/fullchain.pem;
resolver 1.1.1.1 8.8.8.8 valid=300s;

# Безопасные заголовки
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

```bash
# Генерация сильных DH параметров
openssl dhparam -out /etc/ssl/dhparam4096.pem 4096

# Проверка конфигурации (Mozilla Observatory)
# https://observatory.mozilla.org

# testssl.sh - полная проверка
bash testssl.sh --full example.com

# Проверить cipher suites
openssl s_client -connect example.com:443 \
  -cipher 'ECDHE-RSA-AES256-GCM-SHA384' 2>/dev/null | grep Cipher
```

---

## Диагностика TLS

```bash
# Базовое подключение
openssl s_client -connect example.com:443

# С указанием SNI (для виртуальных хостов)
openssl s_client -connect example.com:443 -servername example.com

# Показать всю цепочку
openssl s_client -connect example.com:443 -showcerts 2>/dev/null \
  | openssl x509 -noout -text

# Проверить конкретную TLS версию
openssl s_client -connect example.com:443 -tls1_2
openssl s_client -connect example.com:443 -tls1_3

# Проверить cipher suite
openssl s_client -connect example.com:443 \
  -cipher ECDHE-RSA-AES256-GCM-SHA384 2>/dev/null

# Проверить ALPN (HTTP/2)
openssl s_client -connect example.com:443 -alpn h2,http/1.1 \
  2>/dev/null | grep ALPN

# Срок истечения сертификата
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# Fingerprint сертификата
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256

# Скрипт мониторинга истечения
DAYS_WARN=30
DOMAIN=example.com
EXPIRY=$(echo | openssl s_client -connect $DOMAIN:443 2>/dev/null \
  | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))
echo "$DOMAIN: $DAYS_LEFT days until expiry"
if [ $DAYS_LEFT -lt $DAYS_WARN ]; then
    echo "WARNING: Certificate expires soon!"
fi

# curl с проверкой TLS
curl -v https://example.com 2>&1 | grep -E "TLS|SSL|cipher|certificate"

# Проверить mTLS (клиентский сертификат)
curl --cert client.pem --key client.key https://api.example.com
openssl s_client -connect api.example.com:443 \
  -cert client.pem -key client.key
```

---

## Шпаргалка

```
TLS версии:
  TLS 1.0/1.1 → УСТАРЕЛ (запрещать!)
  TLS 1.2     → Активен (поддерживать)
  TLS 1.3     → Рекомендуется (включить первым)

Handshake:
  TLS 1.2: 2-RTT (+ 1-RTT TCP = 3 RTT до данных)
  TLS 1.3: 1-RTT (+ 1-RTT TCP = 2 RTT)
  TLS 1.3 0-RTT: 0 RTT (только для повторных, только GET!)

Сертификаты:
  DV - проверка домена (быстро, бесплатно)
  OV - проверка организации (дни, платно)
  EV - расширенная проверка (недели, дорого)
  Wildcard: *.example.com (один уровень)

Цепочка доверия:
  Root CA (в Trust Store) → Intermediate CA → Leaf cert
  Сервер отдаёт: leaf + intermediate (Root НЕ нужен)
  Если цепочка неполная → ошибка у клиента

Отзыв:
  CRL - список (медленно, кэшируется)
  OCSP - онлайн проверка (быстро, приватность)
  OCSP Stapling - сервер кэширует OCSP ответ (лучший вариант)

Файлы:
  cert.pem     - сертификат
  chain.pem    - промежуточный CA
  fullchain.pem - cert + chain (для nginx)
  privkey.pem  - приватный ключ
  .p12/.pfx    - ключ + сертификат + цепочка (Windows)

Команды:
  openssl x509 -in cert.pem -text -noout        просмотр сертификата
  openssl s_client -connect host:443             подключиться
  openssl verify -CAfile ca.pem cert.pem         проверить цепочку
  openssl x509 -in cert.pem -noout -dates        сроки действия
  certbot --nginx -d example.com                 Let's Encrypt
  testssl.sh example.com                         полный тест

nginx:
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers ECDHE-...:...;
  ssl_stapling on;
  add_header HSTS ...;

Безопасность:
  Отключить: SSL 3.0, TLS 1.0, TLS 1.1
  Отключить: RC4, 3DES, DES, MD5, SHA-1 (для подписи)
  Использовать: ECDHE (Forward Secrecy)
  Включить: OCSP Stapling, HSTS, CT
```

---

## Ссылки

- [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) - TLS 1.3
- [RFC 5246](https://www.rfc-editor.org/rfc/rfc5246) - TLS 1.2
- [RFC 8996](https://www.rfc-editor.org/rfc/rfc8996) - Deprecating TLS 1.0 and TLS 1.1
- [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280) - X.509 PKI Certificates and CRL
- [RFC 6960](https://www.rfc-editor.org/rfc/rfc6960) - OCSP
- [RFC 7633](https://www.rfc-editor.org/rfc/rfc7633) - OCSP Must-Staple
- [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162) - Certificate Transparency
- [RFC 7541](https://www.rfc-editor.org/rfc/rfc7541) - HPACK
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org) - готовые конфиги
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/) - онлайн анализ
- [crt.sh](https://crt.sh) - поиск по CT логам
- [testssl.sh](https://testssl.sh) - локальный TLS тест
- [badssl.com](https://badssl.com) - тесты для браузера
