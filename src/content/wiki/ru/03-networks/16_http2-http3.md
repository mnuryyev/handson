---
title: "HTTP/2 и HTTP/3 (QUIC) - различия"
date: "2026-05-02"
---

HTTP/2 (RFC 9113, 2022 / оригинал RFC 7540, 2015) - бинарный протокол с мультиплексированием, сжатием заголовков и server push. HTTP/3 (RFC 9114, 2022) - следующее поколение, работает поверх QUIC вместо TCP. Оба совместимы по семантике с HTTP/1.1: те же методы, заголовки, статус коды. Меняется только транспортный механизм.

---

## Эволюция HTTP

```
HTTP/1.0 (1996, RFC 1945)
  - Одно соединение = один запрос
  - Новое TCP соединение для каждого ресурса
  - Нет keep-alive по умолчанию

HTTP/1.1 (1997/2014, RFC 7230-7235)
  + Keep-Alive (персистентные соединения)
  + Chunked transfer encoding
  + Виртуальный хостинг (заголовок Host)
  - Head-of-Line Blocking (запросы в очереди)
  - Заголовки в открытом тексте (дублируются в каждом запросе)
  - Нет приоритизации запросов

HTTP/2 (2015/2022, RFC 7540 → RFC 9113)
  + Бинарный протокол (не текстовый)
  + Мультиплексирование (много запросов в одном TCP)
  + Сжатие заголовков (HPACK)
  + Server Push
  + Приоритизация потоков
  - Всё ещё TCP: Head-of-Line Blocking на уровне TCP
  - TLS обязателен на практике (хотя не по стандарту)

HTTP/3 (2022, RFC 9114)
  + Поверх QUIC (UDP, не TCP)
  + Нет TCP Head-of-Line Blocking
  + 0-RTT / 1-RTT соединение (быстрее TLS 1.2/1.3 over TCP)
  + Connection migration (смена IP без разрыва)
  + QPACK (улучшенный HPACK для QUIC)
  + TLS 1.3 встроен в QUIC
```

---

## HTTP/2

### Ключевые концепции

```
Фрейм (Frame):
  Минимальная единица данных в HTTP/2.
  Всё - заголовки, данные, управление - передаётся как фреймы.
  Заголовок фрейма: 9 байт (длина, тип, флаги, Stream ID).

Поток (Stream):
  Независимая двунаправленная последовательность фреймов.
  Каждый запрос/ответ = отдельный поток.
  ID потока: клиент → нечётные (1, 3, 5...), сервер → чётные (2, 4, 6...).
  Потоки мультиплексированы в одном TCP соединении.

Соединение (Connection):
  Одно TCP соединение = много потоков одновременно.
  Нет смысла открывать несколько соединений к одному хосту.

Жизненный цикл потока:
  idle → open → half-closed (local/remote) → closed

  Клиент открывает поток: HEADERS фрейм.
  Данные передаются: DATA фреймы.
  Поток закрывается: флаг END_STREAM.
```

### Типы фреймов

```
Тип    Код   Описание
──────────────────────────────────────────────────────────
DATA       0x0  Данные тела запроса/ответа
HEADERS    0x1  Заголовки запроса/ответа (сжатые HPACK)
PRIORITY   0x2  Приоритет потока (устарел в RFC 9113)
RST_STREAM 0x3  Принудительное завершение потока
SETTINGS   0x4  Параметры соединения
PUSH_PROMISE 0x5 Обещание сервера отправить ресурс
PING       0x6  Проверка RTT и keep-alive
GOAWAY     0x7  Завершение соединения (последний обработанный Stream ID)
WINDOW_UPDATE 0x8 Управление потоком данных (flow control)
CONTINUATION 0x9 Продолжение блока заголовков

Фрейм SETTINGS (важные параметры):
  HEADER_TABLE_SIZE:      4096    (размер таблицы HPACK)
  ENABLE_PUSH:            1       (разрешить Server Push)
  MAX_CONCURRENT_STREAMS: ∞       (макс. одновременных потоков)
  INITIAL_WINDOW_SIZE:    65535   (начальное окно flow control)
  MAX_FRAME_SIZE:         16384   (макс. размер фрейма)
  MAX_HEADER_LIST_SIZE:   ∞       (макс. размер списка заголовков)
```

### Мультиплексирование

```
HTTP/1.1 - проблема:
  Запросы на одном соединении идут строго по очереди.
  Медленный запрос (большое изображение) блокирует все последующие.
  Браузеры обходят это, открывая 6-8 соединений к хосту.

HTTP/2 - решение:
  Все запросы идут по одному TCP соединению одновременно.
  Каждый запрос - независимый поток.
  Медленный поток не блокирует другие.

HTTP/1.1:                    HTTP/2:
  Соединение 1:               Одно соединение:
    GET /style.css              Поток 1: GET /style.css
    (ждём ответа...)            Поток 3: GET /script.js
    GET /script.js              Поток 5: GET /image.png
    (ждём ответа...)            (все одновременно!)
    GET /image.png

  Соединение 2: ...
  Соединение 3: ...
  Соединение 4-6: ...

Результат:
  - Один TCP handshake вместо нескольких
  - Нет лимита 6-8 соединений
  - Лучше использование TCP окна перегрузки
  - Нет overhead на установку новых соединений
```

### Сжатие заголовков - HPACK

```
Проблема HTTP/1.1:
  Заголовки - текстовые, повторяются в каждом запросе.
  Cookie, Authorization, User-Agent - одинаковые для всех запросов.
  Overhead на сжатие заголовков = сотни байт каждый раз.

HPACK (RFC 7541) решает:

1. Статическая таблица (Static Table):
   61 предопределённая запись (часто используемые заголовки).
   Пример: индекс 2 = ":method: GET", индекс 7 = ":scheme: https".
   Заголовок кодируется одним байтом (индекс) вместо полного текста.

2. Динамическая таблица (Dynamic Table):
   Заголовки, отправленные в текущем соединении.
   Клиент и сервер поддерживают синхронные копии.
   Новый заголовок добавляется в таблицу.
   Повторное использование = только индекс (1-2 байта).

3. Huffman кодирование:
   Строки кодируются по частоте символов (как в HTTP контексте).
   Сжатие ~30% дополнительно к индексированию.

Пример сжатия:
  Первый запрос (без сжатия, заголовок добавляется в таблицу):
    :method: GET          → 0x82 (индекс 2 из статической таблицы)
    :path: /index.html    → literal + Huffman + добавить в dynamic
    :scheme: https        → 0x87 (индекс 7)
    :authority: example.com → literal + добавить в dynamic

  Второй запрос к тому же хосту:
    :method: GET          → 0x82 (1 байт!)
    :path: /style.css     → только изменившийся путь
    :scheme: https        → 0x87 (1 байт!)
    :authority: example.com → индекс из dynamic table (1-2 байта)

  Экономия: сотни байт → единицы байт для неизменных заголовков.

HPACK уязвимость - CRIME/BREACH:
  Сжатие + секреты в заголовках (Cookie, Authorization) →
  атака по побочному каналу (измерение размера сжатого трафика).
  Защита: не смешивать секреты и контролируемый атакующим контент.
```

### Server Push

```
Server Push позволяет серверу отправить ресурсы которые клиент
ещё не запросил, но точно запросит.

Классический сценарий:
  Клиент: GET /index.html
  Сервер думает: "Клиент потом запросит style.css и script.js"
  Сервер отправляет PUSH_PROMISE фрейм
  Сервер сразу начинает отправлять style.css и script.js

  Клиент получает /index.html и видит ссылки на CSS/JS,
  но они уже в кэше (получены через push) → не нужны новые запросы.

PUSH_PROMISE фрейм:
  Содержит заголовки "будущего" запроса (как будто клиент его сделал).
  Ассоциирован с текущим потоком.
  Новый поток (чётный ID) создаётся для push данных.

Проблемы Server Push:
  - Клиент может уже иметь ресурс в кэше → push лишний
  - Трудно предсказать что нужно push
  - Может конкурировать с реальными запросами
  - Chrome удалил поддержку Server Push в 2022
  - Лучшая альтернатива: HTTP Link preload заголовок

Клиент может отклонить push:
  RST_STREAM с кодом CANCEL → "спасибо, не надо"

Альтернативы Server Push:
  <link rel="preload" href="style.css" as="style">   (HTML)
  Link: </style.css>; rel=preload; as=style           (заголовок)
  103 Early Hints + Link заголовки
```

### Приоритизация потоков

```
HTTP/2 (RFC 7540) имел сложную систему приоритетов:
  - Дерево зависимостей (dependency tree)
  - Вес потока (1-256)
  - Эксклюзивные зависимости

На практике: реализации часто игнорировали или плохо поддерживали.
RFC 9113 (HTTP/2 2022) убрал приоритизацию через PRIORITY фреймы.

Взамен: Extensible Priorities (RFC 9218)
  Priority: u=3, i  (urgency + incremental)
  u = urgency (0 = самый важный, 7 = самый низкий)
  i = incremental (данные можно обрабатывать по мере получения)

Типичные значения urgency:
  u=0 - блокирующий критический ресурс (inline скрипты)
  u=1 - важные ресурсы (основной CSS)
  u=2 - ресурсы выше fold
  u=3 - default (большинство ресурсов)
  u=4 - спекулятивная предзагрузка
  u=7 - фоновая загрузка
```

### HTTP/2 и TLS

```
По стандарту HTTP/2 может работать без TLS (h2c - cleartext).
На практике: все браузеры требуют TLS для HTTP/2.

Согласование протокола через ALPN (TLS расширение):
  Клиент в TLS ClientHello: "Я поддерживаю h2, http/1.1"
  Сервер выбирает протокол: "Выбираю h2"
  Нет дополнительного round-trip для согласования.

ALPN идентификаторы:
  h2    - HTTP/2 over TLS
  h2c   - HTTP/2 cleartext (без TLS, только для тестов)
  http/1.1 - HTTP/1.1
  http/1.0 - HTTP/1.0

Upgrade механизм (для cleartext, редко):
  GET / HTTP/1.1
  Host: example.com
  Upgrade: h2c
  HTTP2-Settings: AAMAAABkAAQAAP__...

  HTTP/1.1 101 Switching Protocols
  Upgrade: h2c
```

### Connection Preface

```
После установки TLS (или plaintext) соединения:

Клиент отправляет Connection Preface:
  PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n  (magic string, 24 байта)
  + SETTINGS фрейм (параметры клиента)

Сервер отвечает:
  SETTINGS фрейм (параметры сервера)
  SETTINGS ACK (подтверждение параметров клиента)

Клиент подтверждает:
  SETTINGS ACK (подтверждение параметров сервера)

После этого - нормальный обмен запросами/ответами.
```

---

## HTTP/3 и QUIC

### Что такое QUIC

```
QUIC (Quick UDP Internet Connections) - транспортный протокол.
Разработан Google (2012), стандартизирован IETF (RFC 9000, 2021).

Работает поверх UDP (не TCP).
Включает: надёжность, управление потоком, мультиплексирование, TLS 1.3.

QUIC решает главную проблему HTTP/2:
  HTTP/2 устранил Head-of-Line Blocking на уровне HTTP.
  Но TCP Head-of-Line Blocking остался!
  Потерянный TCP пакет → все HTTP/2 потоки ждут retransmit.
  QUIC - независимые потоки на уровне транспорта.
  Потерянный QUIC пакет → ждёт только затронутый поток.

Порт: UDP 443 (основной для HTTP/3).
Идентификатор: Alt-Svc заголовок указывает клиенту что доступен HTTP/3.
```

### QUIC vs TCP

```
Характеристика      TCP + TLS 1.3         QUIC (TLS 1.3 встроен)
────────────────────────────────────────────────────────────────────
Handshake           1-RTT (TLS) + 1-RTT   1-RTT (QUIC+TLS вместе)
                    = 2 round-trips        = 1 round-trip
0-RTT reconnect     Нет (нужен handshake)  Да (для известных серверов)
HoL Blocking        Да (на TCP уровне)     Нет (потоки независимы)
Мультиплексирование Через HTTP/2 над TCP   Встроено в QUIC
Connection ID       Нет (IP:port)          Да (survives IP change)
Смена сети          Разрыв соединения      Прозрачная миграция
Flow control        TCP window             QUIC connection + stream
Шифрование          TLS отдельно           TLS 1.3 встроен
Заголовки payload   Открытый текст!*       Зашифровано
Порядок пакетов     Строгий               Нет строгого порядка
Реализация          ОС уровень (kernel)    User space (обычно)

* TCP заголовки не шифруются даже с TLS → метаданные видны.
  QUIC шифрует всё кроме минимального заголовка QUIC пакета.
```

### QUIC соединение и рукопожатие

```
Новое соединение (1-RTT):
  Клиент                              Сервер
     │── Initial (ClientHello TLS) ──►│
     │                                │
     │◄── Initial (ServerHello) ──────│
     │◄── Handshake (TLS cert,...) ───│
     │◄── 1-RTT (HTTP/3 данные) ──────│  (сервер уже может отвечать!)
     │── Handshake (Finished) ────────►│
     │── 1-RTT (HTTP/3 запрос) ───────►│
     │◄── 1-RTT (HTTP/3 ответ) ────────│

  Итого: 1 round-trip до первых данных.
  Сравни с TCP+TLS1.3: TCP SYN+SYN-ACK + TLS = 2 round-trips.

0-RTT (для повторного соединения):
  Клиент знает параметры сервера (PSK из предыдущей сессии).

  Клиент                              Сервер
     │── Initial + 0-RTT data ────────►│  запрос вместе с handshake!
     │◄── Initial + 1-RTT data ─────────│  ответ без ожидания

  0 round-trips до данных!
  Предупреждение: 0-RTT уязвим к replay атакам.
  Использовать только для идемпотентных запросов (GET).
```

### QUIC Connection ID

```
TCP идентифицирует соединение по: (src IP, src port, dst IP, dst port).
Смена IP (Wi-Fi → мобильный) = разрыв соединения.

QUIC использует Connection ID:
  Случайный идентификатор, независимый от IP и порта.
  Один или несколько Connection ID на соединение.
  Клиент и сервер могут иметь разные Connection ID.

Connection Migration:
  Клиент меняет Wi-Fi на мобильный интернет → меняется IP.
  QUIC продолжает соединение с тем же Connection ID.
  Сервер видит тот же Connection ID → продолжает без разрыва.

  Практическое применение:
    - Видеозвонок не прерывается при смене сети
    - Загрузка файла продолжается
    - HTTP/3 сессия не сбрасывается

  Мобильные устройства с нестабильным подключением - главный бенефициар.

Preferred Address:
  Сервер может предложить другой адрес для переключения.
  QUIC: перейди на IP:port где больше ресурсов.
```

### QPACK - сжатие заголовков в HTTP/3

```
HPACK для HTTP/2 работал с предположением строгого порядка потоков TCP.
QUIC доставляет потоки независимо → HPACK не подходит.

QPACK (RFC 9204) - адаптация HPACK для QUIC:

Два специальных однонаправленных потока:
  Encoder stream: отправляет обновления таблицы (новые записи).
  Decoder stream: отправляет подтверждения что записи получены.

Статическая таблица: 99 записей (больше чем в HPACK - 61).

Два режима кодирования:
  Without indexing: заголовок не добавляется в динамическую таблицу.
    Безопасно для любого потока, нет head-of-line.
  With indexing: ждать пока динамическая таблица синхронизируется.
    Лучшее сжатие, но поток зависит от encoder stream.

На практике:
  Большинство реализаций используют without indexing для минимизации HoL.
  Динамическая таблица менее полезна чем в HTTP/2.
```

### HTTP/3 фреймы

```
HTTP/3 использует QUIC потоки, не TCP.

Типы потоков QUIC в HTTP/3:
  Bidirectional streams: запрос/ответ (один на каждый HTTP обмен).
  Unidirectional streams:
    Control stream    (управляющий, один на сторону)
    QPACK encoder stream
    QPACK decoder stream
    Push stream       (Server Push)

Типы HTTP/3 фреймов (подмножество HTTP/2):
  DATA       0x0  - тело запроса/ответа
  HEADERS    0x1  - заголовки (QPACK сжатие)
  CANCEL_PUSH 0x3 - отмена Server Push
  SETTINGS   0x4  - параметры соединения
  PUSH_PROMISE 0x5 - обещание push
  GOAWAY     0x7  - завершение соединения
  MAX_PUSH_ID 0xD - лимит Push ID

Удалённые из HTTP/3 (не нужны - QUIC сам управляет):
  PRIORITY   → QUIC приоритизация или Extensible Priorities
  RST_STREAM → QUIC RESET_STREAM
  WINDOW_UPDATE → QUIC flow control
  PING       → QUIC PING

HTTP/3 запрос:
  Поток 0 (bidirectional):
    HEADERS фрейм (QPACK метод, путь, заголовки)
    DATA фрейм (тело, если есть)

  Поток 0 в обратную сторону:
    HEADERS фрейм (статус, заголовки ответа)
    DATA фрейм (тело ответа)
```

### Обнаружение HTTP/3 (Alt-Svc)

```
Браузер не знает заранее что сервер поддерживает HTTP/3.
Первое соединение всегда TCP (HTTP/1.1 или HTTP/2).
Сервер сообщает о HTTP/3 через Alt-Svc заголовок:

  Alt-Svc: h3=":443"; ma=86400
  Alt-Svc: h3=":443"; ma=86400, h3-29=":443"; ma=86400

  h3       = HTTP/3 (финальная версия)
  h3-29    = HTTP/3 draft 29 (для совместимости со старыми клиентами)
  :443     = тот же хост, порт 443
  ma=86400 = max-age в секундах (кэшировать это знание 24 часа)

Процесс:
  1. Браузер → сервер: HTTP/2 over TLS (первый раз)
  2. Сервер → Alt-Svc: h3=":443"
  3. Браузер кэширует: "example.com поддерживает HTTP/3"
  4. Следующий запрос → HTTP/3 over QUIC (UDP 443)

Happy Eyeballs для HTTP/3:
  Браузер пробует HTTP/3 (UDP) и HTTP/2 (TCP) одновременно.
  Кто первый ответит - тот и используется.
  Если UDP заблокирован (firewall) - автоматически HTTP/2.

DNS HTTPS запись (альтернатива Alt-Svc):
  example.com.  IN  HTTPS  1  .  alpn="h3,h2" port=443
  Браузер узнаёт о HTTP/3 до первого соединения (из DNS).
  Нет холодного старта через HTTP/2.
```

---

## Сравнение HTTP/1.1, HTTP/2, HTTP/3

### Таблица характеристик

```
Характеристика        HTTP/1.1      HTTP/2         HTTP/3
────────────────────────────────────────────────────────────────────
Транспорт             TCP           TCP            QUIC (UDP)
Формат                Текстовый     Бинарный       Бинарный
Соединений на хост    6-8           1              1
Мультиплексирование   Нет*          Да             Да
HoL Blocking (HTTP)   Да            Нет            Нет
HoL Blocking (TCP)    Да            Да             Нет (нет TCP!)
Сжатие заголовков     Нет           HPACK          QPACK
Server Push           Нет           Да (устарел)   Да (редко)
TLS                   Опционально   Обязателен**   Обязателен (встроен)
Handshake             1-RTT TCP     1-RTT TCP      1-RTT QUIC
                      + 1-RTT TLS   + 1-RTT TLS    (или 0-RTT)
0-RTT                 Нет           Нет            Да
Connection Migration  Нет           Нет            Да
Приоритизация         Нет           Да             Extensible Priorities

* HTTP/1.1 pipelining - теоретически да, на практике нет
** Браузеры требуют TLS, стандарт допускает без TLS
```

### Когда что выбирать

```
HTTP/1.1:
  - Простые API без браузерных клиентов
  - Системы с жёсткими требованиями совместимости
  - Отладка (человекочитаемый формат)
  - Внутренние сервисы без TLS (осторожно!)

HTTP/2:
  - Веб-сайты (особенно с множеством ресурсов)
  - REST API с браузерными клиентами
  - gRPC (использует HTTP/2 обязательно)
  - Все современные веб-приложения

HTTP/3:
  - Мобильные пользователи (нестабильная сеть)
  - Высоколатентные сети (спутник, мобильный)
  - Медиастриминг (видео, аудио)
  - CDN (Cloudflare, Fastly, Google - все поддерживают)
  - Приложения чувствительные к задержке
```

### Производительность: реальные цифры

```
Улучшения HTTP/2 vs HTTP/1.1:
  Множество маленьких ресурсов: -50-60% времени загрузки
  Большой файл (один): ~0% (нет преимуществ для одного потока)
  Сайт с 100+ ресурсами: значительное улучшение

Улучшения HTTP/3 vs HTTP/2:
  Стабильная сеть (LAN, хорошая проводная): ~0-5%
  Wi-Fi с потерями пакетов 1%: -10-30%
  Мобильная сеть со сменой: значительное улучшение
  High-latency (спутник 600ms RTT): заметное улучшение (0-RTT)

Когда HTTP/3 не помогает:
  - Потери пакетов < 0.1% (типичные проводные сети)
  - UDP заблокирован (firewall, VPN)
  - Одиночные большие запросы (нет мультиплексирования)

WebTransport (будущее):
  API поверх HTTP/3 для bidirectional потоков в браузере.
  Альтернатива WebSocket с лучшей производительностью.
```

---

## Настройка серверов

### nginx

```nginx
# /etc/nginx/nginx.conf или конфиг сайта

# HTTP/2
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;                    # nginx >= 1.25.1 (новый синтаксис)
    # Старый синтаксис: listen 443 ssl http2;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    # ALPN автоматически через SSL
    ssl_protocols TLSv1.2 TLSv1.3;
}

# HTTP/3 (QUIC)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    listen 443 quic reuseport;   # UDP для QUIC/HTTP/3
    listen [::]:443 quic reuseport;

    # Сообщить клиентам о поддержке HTTP/3
    add_header Alt-Svc 'h3=":443"; ma=86400';

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    # Требуется для QUIC
    ssl_protocols TLSv1.3;      # QUIC требует TLS 1.3
}

# Server Push (HTTP/2, устарел но работает)
location / {
    http2_push /style.css;
    http2_push /script.js;

    # Или через заголовок (лучше)
    add_header Link "</style.css>; rel=preload; as=style";
    add_header Link "</script.js>; rel=preload; as=script";
}

# Проверить HTTP/2
curl -v --http2 https://example.com 2>&1 | grep "HTTP/2"
# * Using HTTP2, server supports multiplexing
# < HTTP/2 200
```

### Caddy (поддерживает HTTP/2 и HTTP/3 из коробки)

```
# Caddyfile
example.com {
    root * /var/www/html
    file_server

    # HTTP/2 и HTTP/3 включены автоматически!
    # TLS автоматически через Let's Encrypt

    # Явно включить HTTP/3
    # (по умолчанию включён при наличии TLS)
}

# Проверить версии
curl -sv https://example.com 2>&1 | grep -E "HTTP/[23]|Alt-Svc|alpn"
```

### Apache

```apache
# Apache >= 2.4.17 для HTTP/2
# Требует: mod_http2

# /etc/apache2/mods-enabled/http2.conf или в VirtualHost:
Protocols h2 h2c http/1.1

<VirtualHost *:443>
    ServerName example.com
    SSLEngine on
    SSLCertificateFile /etc/ssl/cert.pem
    SSLCertificateKeyFile /etc/ssl/key.pem

    # HTTP/2 Server Push
    <Location "/index.html">
        Header add Link "</style.css>; rel=preload; as=style"
    </Location>
</VirtualHost>

# Проверить что HTTP/2 включён
apachectl -M | grep http2
```

### HAProxy (балансировщик)

```
frontend https_front
    bind *:443 ssl crt /etc/ssl/cert.pem alpn h2,http/1.1
    bind *:443 quic crt /etc/ssl/cert.pem alpn h3   # HTTP/3

    # Определить протокол для backend
    use_backend http2_backend if { ssl_fc_alpn -i h2 }
    default_backend http1_backend

backend http2_backend
    server app1 127.0.0.1:8080 proto h2   # HTTP/2 к backend

# Alt-Svc для HTTP/3
http-response add-header Alt-Svc 'h3=":443"; ma=86400'
```

---

## Диагностика

### Проверка версии протокола

```bash
# curl - указать версию
curl --http1.1 https://example.com    # HTTP/1.1
curl --http2   https://example.com    # HTTP/2
curl --http3   https://example.com    # HTTP/3

# Показать используемый протокол
curl -v --http2 https://example.com 2>&1 | grep "HTTP/"
# * h2 state: IDLE => OPEN
# < HTTP/2 200

# Полная информация с таймингом
curl -s -o /dev/null -w "
Protocol: %{http_version}
Time DNS:  %{time_namelookup}s
Time TCP:  %{time_connect}s
Time TLS:  %{time_appconnect}s
TTFB:      %{time_starttransfer}s
Total:     %{time_total}s
" https://example.com

# Проверить Alt-Svc заголовок (HTTP/3 реклама)
curl -sI https://example.com | grep -i alt-svc
# alt-svc: h3=":443"; ma=86400

# Проверить ALPN согласование
openssl s_client -connect example.com:443 -alpn h2 2>/dev/null | grep ALPN
# ALPN protocol: h2

# Список поддерживаемых ALPN
openssl s_client -connect example.com:443 2>/dev/null | grep "ALPN"

# nghttp2 - HTTP/2 клиент
apt install nghttp2-client
nghttp -v https://example.com                    # verbose
nghttp -v -m 10 https://example.com              # мультиплексирование
nghttp --stat https://example.com                # статистика потоков

# h2spec - тест соответствия HTTP/2
h2spec -h example.com -p 443 -t -k

# HTTP/3 проверка
# Браузер: Developer Tools → Network → Protocol колонка
# chrome://net-internals/#http2  - HTTP/2 сессии в Chrome
# chrome://net-internals/#quic   - QUIC сессии в Chrome
```

### Wireshark / tcpdump для HTTP/2 и HTTP/3

```bash
# tcpdump - захват HTTP/2 (TLS, но можно декриптовать)
tcpdump -i eth0 -w http2.pcap 'tcp port 443'

# HTTP/3 / QUIC (UDP 443)
tcpdump -i eth0 -w http3.pcap 'udp port 443'

# Wireshark фильтры:
http2                          # HTTP/2 фреймы (если ключ есть)
quic                           # QUIC пакеты
http3                          # HTTP/3 фреймы

# Декриптовать TLS в Wireshark:
# Preferences → Protocols → TLS → (Pre)-Master-Secret log filename
# В браузере: SSLKEYLOGFILE=/tmp/ssl-keys.log firefox
# Wireshark использует этот файл для декрипции

# Экспорт ключей из браузера (Chrome/Firefox)
export SSLKEYLOGFILE=/tmp/ssl-keys.log
google-chrome https://example.com

# Захват + ключи
tcpdump -i eth0 -w capture.pcap 'tcp port 443 or udp port 443'
# Открыть в Wireshark с SSLKEYLOGFILE → видим HTTP/2 фреймы

# qvis.quictools.dev - онлайн визуализатор QUIC трассировок
# qlog формат для QUIC отладки (RFC 9001)
```

### Типичные проблемы

```
Проблема: HTTP/2 не работает (fallback на HTTP/1.1)
  Диагностика:
    curl -v --http2 https://example.com 2>&1 | grep -E "HTTP/|h2|alpn"
  Причины:
    - Сервер не включил http2 в конфиге
    - Неправильный ALPN (нет "h2" в списке)
    - TLS версия < 1.2 (HTTP/2 требует TLS 1.2+)
    - Промежуточный прокси не поддерживает HTTP/2

Проблема: HTTP/3 не работает
  Диагностика:
    curl -v --http3 https://example.com
    # Если ошибка - UDP заблокирован или нет поддержки на сервере
  Причины:
    - UDP 443 заблокирован на firewall
    - Сервер не настроен для QUIC (нет listen quic)
    - Alt-Svc не передаётся
    - OpenSSL версия без QUIC поддержки (нужен BoringSSL или OpenSSL 3.3+)
  Проверить:
    # Открыт ли UDP 443?
    nc -u -v example.com 443
    # Wireshark: есть ли QUIC пакеты в ответ?

Проблема: Head-of-Line Blocking в HTTP/2
  Симптом: один медленный ресурс тормозит остальные
  Это проблема TCP, не HTTP/2.
  Решение:
    - Перейти на HTTP/3 (QUIC нет HoL)
    - Использовать несколько доменов (sharding) - не рекомендуется для HTTP/2
    - Оптимизировать медленные ресурсы

Проблема: высокое потребление памяти при HTTP/2
  Каждый поток имеет состояние → много соединений = много памяти.
  MAX_CONCURRENT_STREAMS ограничивает количество потоков.
  nginx: http2_max_concurrent_streams 128;
  Балансировщик: ограничить на уровне балансировщика.
```

---

## Шпаргалка

```
HTTP/2:
  Транспорт: TCP
  Формат: бинарный (фреймы)
  Ключевые фичи:
    - Мультиплексирование (много запросов в одном TCP)
    - HPACK (сжатие заголовков)
    - Server Push (отправка без запроса)
    - Один коннект вместо 6-8
  Проблема: TCP HoL Blocking остался
  TLS: обязателен в браузерах (ALPN: h2)

HTTP/3:
  Транспорт: QUIC (UDP)
  Формат: бинарный (HTTP/3 фреймы поверх QUIC потоков)
  Ключевые фичи:
    - Нет TCP HoL Blocking (потоки независимы)
    - 1-RTT или 0-RTT handshake
    - Connection Migration (смена IP без разрыва)
    - TLS 1.3 встроен в QUIC
    - QPACK (сжатие заголовков для QUIC)
  Обнаружение: Alt-Svc заголовок или DNS HTTPS запись
  TLS: обязателен (TLS 1.3)

QUIC vs TCP:
  QUIC = UDP + надёжность + мультиплексирование + TLS 1.3
  Handshake: 1-RTT (vs 2-RTT для TCP+TLS 1.3)
  0-RTT: для повторных соединений (только идемпотентные!)
  Connection ID: переживает смену IP/порта

Настройка nginx:
  http2 on;                           HTTP/2
  listen 443 quic reuseport;          HTTP/3
  add_header Alt-Svc 'h3=":443"';    объявить HTTP/3

Диагностика:
  curl --http2 -v URL                 HTTP/2
  curl --http3 -v URL                 HTTP/3
  curl -w "%{http_version}" URL       версия протокола
  nghttp -v URL                       HTTP/2 детали
  chrome://net-internals/#quic        QUIC в Chrome
  curl -sI URL | grep Alt-Svc        реклама HTTP/3
```

---

## Ссылки

- [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113) - HTTP/2 (2022, актуальный)
- [RFC 7540](https://www.rfc-editor.org/rfc/rfc7540) - HTTP/2 (2015, оригинал)
- [RFC 7541](https://www.rfc-editor.org/rfc/rfc7541) - HPACK: Header Compression for HTTP/2
- [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000) - QUIC: A UDP-Based Multiplexed and Secure Transport
- [RFC 9001](https://www.rfc-editor.org/rfc/rfc9001) - Using TLS to Secure QUIC
- [RFC 9002](https://www.rfc-editor.org/rfc/rfc9002) - QUIC Loss Detection and Congestion Control
- [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114) - HTTP/3
- [RFC 9204](https://www.rfc-editor.org/rfc/rfc9204) - QPACK: Field Compression for HTTP/3
- [RFC 9218](https://www.rfc-editor.org/rfc/rfc9218) - Extensible Prioritization Scheme for HTTP
- [HTTP/2 explained (Daniel Stenberg)](https://http2-explained.haxx.se)
- [HTTP/3 explained (Daniel Stenberg)](https://http3-explained.haxx.se)
- [QUIC Working Group](https://quicwg.org)
- [quic.nginx.org](https://quic.nginx.org) - nginx QUIC/HTTP3 документация
