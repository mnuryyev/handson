---
title: "HTTP/1.1 - методы, заголовки, статус коды"
date: "2026-05-01"
---

HTTP (HyperText Transfer Protocol) - протокол прикладного уровня (L7) для передачи гипертекста. Основа веба. HTTP/1.1 определён в RFC 7230-7235 (2014, обновление RFC 2616 от 1999). Работает поверх TCP, порт 80 (HTTP) и 443 (HTTPS). Текстовый протокол: запросы и ответы читаемы как обычный текст.

---

## Структура HTTP сообщения

### Запрос (Request)

```
GET /index.html HTTP/1.1\r\n
Host: www.example.com\r\n
User-Agent: Mozilla/5.0\r\n
Accept: text/html\r\n
Connection: keep-alive\r\n
\r\n
[тело запроса - для POST/PUT/PATCH]

Формат:
  [Метод] [URI] [Версия HTTP]\r\n   ← стартовая строка (Request Line)
  [Заголовок]: [Значение]\r\n       ← заголовки (Headers)
  ...                               ← ещё заголовки
  \r\n                              ← пустая строка (конец заголовков)
  [Тело]                            ← body (необязательно)

\r\n = CRLF (Carriage Return + Line Feed) = 0x0D 0x0A
Пустая строка отделяет заголовки от тела.
```

### Ответ (Response)

```
HTTP/1.1 200 OK\r\n
Content-Type: text/html; charset=UTF-8\r\n
Content-Length: 1234\r\n
Date: Tue, 29 Apr 2026 10:00:00 GMT\r\n
Server: nginx/1.24\r\n
\r\n
<!DOCTYPE html>
<html>...

Формат:
  [Версия HTTP] [Код статуса] [Фраза]\r\n  ← Status Line
  [Заголовок]: [Значение]\r\n              ← заголовки
  \r\n                                     ← пустая строка
  [Тело]                                   ← body (необязательно)
```

### URI - Uniform Resource Identifier

```
Полная форма URL:
  scheme://userinfo@host:port/path?query#fragment

  https://user:pass@www.example.com:8080/api/v1/users?page=2&limit=10#section

  scheme:    https
  userinfo:  user:pass (редко используется в URL)
  host:      www.example.com
  port:      8080 (если стандартный - 80/443 - можно не указывать)
  path:      /api/v1/users
  query:     page=2&limit=10 (параметры после ?)
  fragment:  section (якорь, после #, не отправляется на сервер!)

Абсолютный URI:  GET http://www.example.com/path HTTP/1.1
Относительный:  GET /path HTTP/1.1  (Host заголовок указывает сервер)
```

---

## HTTP методы

### Обзор методов

```
Метод     Безопасный  Идемпотентный  Кэшируемый  Тело запроса
──────────────────────────────────────────────────────────────
GET          да           да             да          нет*
HEAD         да           да             да          нет
POST         нет          нет            нет**       да
PUT          нет          да             нет         да
DELETE       нет          да             нет         нет*
CONNECT      нет          нет            нет         нет
OPTIONS      да           да             нет         нет*
TRACE        да           да             нет         нет
PATCH        нет          нет            нет         да

* технически можно, но не принято
** можно указать кэшируемость явно

Безопасный (Safe):
  Не изменяет состояние сервера. Только чтение.
  GET, HEAD, OPTIONS, TRACE.

Идемпотентный (Idempotent):
  Повторный вызов с теми же параметрами даёт тот же результат.
  GET, HEAD, PUT, DELETE, OPTIONS, TRACE.
  POST - НЕ идемпотентный (повтор создаёт новый ресурс).
```

### GET

```
Запрос ресурса. Самый распространённый метод.
Не должен изменять состояние сервера.
Тело запроса - не используется (технически возможно, но игнорируется).
Параметры передаются в URL (query string).

Запрос:
  GET /api/users?page=1&limit=20 HTTP/1.1
  Host: api.example.com
  Accept: application/json
  Authorization: Bearer token123

Ответ:
  HTTP/1.1 200 OK
  Content-Type: application/json
  Content-Length: 512

  {"users": [...]}

Кэширование:
  GET ответы кэшируются браузером и прокси.
  Заголовки Cache-Control, ETag, Last-Modified управляют кэшем.

Ограничения URL:
  Длина URL ограничена браузером/сервером (~2000-8000 символов).
  Данные видны в URL (логи, история браузера) → не подходит для секретов.
  Специальные символы кодируются: пробел = %20, & = %26.
```

### HEAD

```
Идентичен GET, но сервер не возвращает тело ответа.
Только заголовки.

Применение:
  - Проверить существует ли ресурс (без скачивания)
  - Узнать Content-Length перед скачиванием
  - Проверить свежесть кэша (Last-Modified, ETag)
  - Проверить поддерживаемые заголовки

Запрос:
  HEAD /big-file.zip HTTP/1.1
  Host: downloads.example.com

Ответ:
  HTTP/1.1 200 OK
  Content-Type: application/zip
  Content-Length: 1073741824    ← 1 ГБ, без скачивания узнали размер
  Last-Modified: Mon, 28 Apr 2026 12:00:00 GMT
                                ← тела нет!
```

### POST

```
Отправка данных на сервер для обработки.
Создание нового ресурса.
Не идемпотентный: повтор может создать дубликат.

Форматы тела (определяет Content-Type):
  application/x-www-form-urlencoded  - HTML формы
  multipart/form-data                - файлы + формы
  application/json                   - API запросы
  application/xml                    - SOAP, XML API
  text/plain                         - текст

HTML форма (application/x-www-form-urlencoded):
  POST /login HTTP/1.1
  Host: www.example.com
  Content-Type: application/x-www-form-urlencoded
  Content-Length: 29

  username=admin&password=secret

JSON API:
  POST /api/users HTTP/1.1
  Host: api.example.com
  Content-Type: application/json
  Content-Length: 45

  {"name": "Alice", "email": "alice@example.com"}

Ответ на успешное создание:
  HTTP/1.1 201 Created
  Location: /api/users/42    ← URI нового ресурса
  Content-Type: application/json

  {"id": 42, "name": "Alice", ...}
```

### PUT

```
Создание или полная замена ресурса по указанному URI.
Идемпотентный: повторный PUT с теми же данными = тот же результат.

Отличие от POST:
  POST /api/users             → сервер сам назначает URI нового ресурса
  PUT  /api/users/42          → клиент указывает конкретный URI

  PUT заменяет ресурс ЦЕЛИКОМ.
  Если поле не указано в теле PUT → оно будет удалено (или обнулено).

Запрос:
  PUT /api/users/42 HTTP/1.1
  Host: api.example.com
  Content-Type: application/json

  {"id": 42, "name": "Alice Updated", "email": "alice@example.com"}

Ответы:
  200 OK          - ресурс обновлён, тело с обновлёнными данными
  201 Created     - ресурс создан (не существовал)
  204 No Content  - успешно, тела нет
```

### PATCH

```
Частичное обновление ресурса.
Отличие от PUT: изменяет только указанные поля, остальные не трогает.

Запрос (изменить только email):
  PATCH /api/users/42 HTTP/1.1
  Host: api.example.com
  Content-Type: application/json

  {"email": "newemail@example.com"}

Сервер обновит только email, имя останется прежним.

JSON Patch (RFC 6902) - стандартный формат для PATCH:
  PATCH /api/users/42 HTTP/1.1
  Content-Type: application/json-patch+json

  [
    {"op": "replace", "path": "/email", "value": "new@example.com"},
    {"op": "add", "path": "/phone", "value": "+1234567890"},
    {"op": "remove", "path": "/nickname"}
  ]

  Операции: add, remove, replace, move, copy, test.
```

### DELETE

```
Удаление ресурса.
Идемпотентный: повторное удаление = тот же результат (ресурс не существует).

Запрос:
  DELETE /api/users/42 HTTP/1.1
  Host: api.example.com
  Authorization: Bearer token123

Ответы:
  200 OK          - удалён, тело с подтверждением
  204 No Content  - удалён, тела нет (предпочтительно)
  404 Not Found   - ресурс не существует
  403 Forbidden   - нет прав на удаление
```

### OPTIONS

```
Запрос разрешённых методов и возможностей сервера/ресурса.

Запрос:
  OPTIONS /api/users HTTP/1.1
  Host: api.example.com

Ответ:
  HTTP/1.1 200 OK
  Allow: GET, POST, OPTIONS
  Content-Length: 0

CORS Preflight (главное применение OPTIONS):
  Браузер перед "сложным" cross-origin запросом спрашивает сервер:
  "Разрешишь ли ты мне отправить POST с Content-Type: application/json
   с сайта https://app.frontend.com?"

  OPTIONS /api/data HTTP/1.1
  Host: api.backend.com
  Origin: https://app.frontend.com
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: Content-Type, Authorization

  HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: https://app.frontend.com
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Max-Age: 86400   ← кэшировать preflight 24 часа
```

### CONNECT

```
Создание туннеля через прокси-сервер.
Используется для HTTPS через HTTP прокси.

Клиент → Прокси:
  CONNECT www.example.com:443 HTTP/1.1
  Host: www.example.com:443

Прокси → Клиент:
  HTTP/1.1 200 Connection Established

Теперь клиент общается напрямую с www.example.com через туннель.
Прокси просто перекачивает байты (не видит HTTPS трафик).
```

### TRACE

```
Диагностический метод. Сервер возвращает полученный запрос обратно.
Позволяет видеть что изменили промежуточные прокси.

На практике отключён на большинстве серверов (безопасность).
Уязвимость XST (Cross-Site Tracing) - TRACE позволял красть cookies.

Пример (если включён):
  TRACE / HTTP/1.1
  Host: example.com

  HTTP/1.1 200 OK
  Content-Type: message/http

  TRACE / HTTP/1.1
  Host: example.com
  [тело = весь запрос, включая заголовки которые добавил прокси]
```

---

## HTTP заголовки

### Заголовки запроса

```
Host (обязательный в HTTP/1.1):
  Host: www.example.com
  Host: www.example.com:8080
  Определяет виртуальный хост (один IP - много сайтов).
  Без Host HTTP/1.1 запрос невалиден.

User-Agent:
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  Идентификатор клиента. Браузер, бот, curl.
  Сервер может менять поведение (мобильная версия, блокировка ботов).
  Легко подделывается.

Accept:
  Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
  Что клиент готов принять (MIME типы).
  q=0.9 = приоритет 0.9 (от 0 до 1, по умолчанию 1).

Accept-Language:
  Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7
  Предпочитаемые языки ответа.

Accept-Encoding:
  Accept-Encoding: gzip, deflate, br
  Поддерживаемые алгоритмы сжатия.
  br = Brotli (лучше gzip для веба).
  Сервер ответит с Content-Encoding: gzip если поддерживает.

Content-Type (для запросов с телом):
  Content-Type: application/json
  Content-Type: multipart/form-data; boundary=----FormBoundary123
  Content-Type: application/x-www-form-urlencoded

Content-Length:
  Content-Length: 348
  Размер тела в байтах. Обязателен если тело есть (кроме chunked).

Authorization:
  Authorization: Basic dXNlcjpwYXNz           (Basic Auth, base64)
  Authorization: Bearer eyJhbGciOiJIUzI1Ni... (JWT токен)
  Authorization: Digest username="user",...    (Digest Auth)
  Authorization: AWS4-HMAC-SHA256 ...          (AWS Signature)

Cookie:
  Cookie: session_id=abc123; theme=dark; lang=ru
  Отправка cookies на сервер.

Referer [sic]:
  Referer: https://www.google.com/search?q=example
  Откуда пришёл пользователь. Оригинальная опечатка в RFC (Referrer).
  Отсутствует при прямом вводе URL, приватном режиме, HTTPS→HTTP.

Origin:
  Origin: https://app.frontend.com
  Источник запроса для CORS. Без пути (только scheme + host + port).

If-Modified-Since:
  If-Modified-Since: Mon, 28 Apr 2026 10:00:00 GMT
  Условный запрос. Получить ресурс только если изменился после даты.
  Сервер отвечает 304 Not Modified если не изменился.

If-None-Match:
  If-None-Match: "abc123def456"
  Условный запрос по ETag.
  Получить ресурс только если ETag изменился.
  Сервер отвечает 304 если ETag совпадает (ресурс не изменился).

Range:
  Range: bytes=0-1023          (первые 1024 байта)
  Range: bytes=1024-2047       (следующие 1024 байта)
  Range: bytes=-500            (последние 500 байт)
  Частичная загрузка (HTTP range requests).
  Ответ: 206 Partial Content.

Connection:
  Connection: keep-alive       (HTTP/1.0 стиль, в 1.1 по умолчанию)
  Connection: close            (закрыть соединение после ответа)
  Connection: Upgrade          (сигнал об апгрейде протокола)

Upgrade:
  Upgrade: websocket
  Connection: Upgrade
  Запрос апгрейда до WebSocket или HTTP/2.

X-Forwarded-For:
  X-Forwarded-For: 1.2.3.4, 10.0.0.1
  Реальный IP клиента (добавляется прокси/балансировщиком).
  Список: первый = оригинальный клиент, остальные = прокси.
  Легко подделывается клиентом → не доверять слепо.
  Современная альтернатива: Forwarded (RFC 7239).
```

### Заголовки ответа

```
Content-Type:
  Content-Type: text/html; charset=UTF-8
  Content-Type: application/json
  Content-Type: image/png
  Content-Type: application/octet-stream   (бинарные данные)
  Тип и кодировка тела ответа.

Content-Length:
  Content-Length: 1234
  Размер тела в байтах.
  Если не указан - используется chunked encoding или соединение закрывается.

Content-Encoding:
  Content-Encoding: gzip
  Content-Encoding: br
  Алгоритм сжатия тела ответа.
  Клиент декомпрессирует перед обработкой.

Transfer-Encoding:
  Transfer-Encoding: chunked
  Тело передаётся частями (чанками). Размер неизвестен заранее.
  Каждый чанк: размер (hex)\r\n + данные\r\n.
  Конец: 0\r\n\r\n.

  Пример chunked:
    HTTP/1.1 200 OK
    Transfer-Encoding: chunked

    4\r\n
    Wiki\r\n
    5\r\n
    pedia\r\n
    0\r\n
    \r\n

Location:
  Location: /api/users/42            (относительный URI)
  Location: https://www.example.com/ (абсолютный URI)
  Используется с 3xx (редиректы) и 201 Created.

Set-Cookie:
  Set-Cookie: session=abc123; Path=/; HttpOnly; Secure; SameSite=Strict
  Set-Cookie: theme=dark; Path=/; Max-Age=2592000
  Установка cookies в браузере.
  Атрибуты:
    Path=/ - путь для которого действует cookie
    HttpOnly - недоступен через document.cookie (защита от XSS)
    Secure - отправлять только по HTTPS
    SameSite=Strict/Lax/None - защита от CSRF
    Max-Age=N - время жизни в секундах
    Expires=date - дата истечения

WWW-Authenticate:
  WWW-Authenticate: Basic realm="Admin Area"
  WWW-Authenticate: Bearer realm="api"
  Запрос аутентификации (ответ 401).

Server:
  Server: nginx/1.24.0
  Server: Apache/2.4.51 (Ubuntu)
  Идентификатор сервера. Часто скрывается из соображений безопасности.

ETag:
  ETag: "abc123def456"
  ETag: W/"weaketag"   (слабый ETag, W/)
  Идентификатор версии ресурса. Используется для кэширования.
  Клиент отправляет в If-None-Match для условных запросов.

Last-Modified:
  Last-Modified: Mon, 28 Apr 2026 12:00:00 GMT
  Дата последнего изменения ресурса.
  Клиент отправляет в If-Modified-Since.

Retry-After:
  Retry-After: 120          (секунды)
  Retry-After: Fri, 01 May 2026 10:00:00 GMT
  Используется с 503 Service Unavailable и 429 Too Many Requests.

Allow:
  Allow: GET, HEAD, POST, OPTIONS
  Разрешённые методы (в ответ на 405 Method Not Allowed).

Content-Disposition:
  Content-Disposition: inline                        (показать в браузере)
  Content-Disposition: attachment; filename="file.pdf" (скачать)
  Content-Disposition: form-data; name="field"       (в multipart)

Strict-Transport-Security (HSTS):
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Браузер должен всегда использовать HTTPS для этого домена.
  После получения - браузер блокирует HTTP на max-age секунд.

X-Content-Type-Options:
  X-Content-Type-Options: nosniff
  Запрет MIME sniffing (браузер не должен угадывать Content-Type).

X-Frame-Options:
  X-Frame-Options: DENY           (нельзя вставить в iframe)
  X-Frame-Options: SAMEORIGIN     (только с того же источника)
  Защита от Clickjacking. Заменяется CSP frame-ancestors.

Content-Security-Policy (CSP):
  Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com
  Политика безопасности контента. Защита от XSS.

Access-Control-Allow-Origin (CORS):
  Access-Control-Allow-Origin: *                       (все домены)
  Access-Control-Allow-Origin: https://app.example.com (конкретный)
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Expose-Headers: X-Custom-Header
  Access-Control-Max-Age: 86400
```

### Заголовки кэширования

```
Cache-Control (запрос и ответ):
  Директивы ответа:
    no-store           - не кэшировать вообще (приватные данные)
    no-cache           - кэшировать, но всегда валидировать с сервером
    private            - кэшировать только в браузере (не в прокси)
    public             - можно кэшировать в прокси
    max-age=3600       - кэшировать 3600 секунд (1 час)
    s-maxage=86400     - для shared кэшей (прокси)
    must-revalidate    - после истечения обязательно проверить у сервера
    immutable          - ресурс не изменится (навсегда кэшировать)
    stale-while-revalidate=60  - отдавать устаревший пока обновляется

  Директивы запроса:
    no-cache           - не брать из кэша без валидации
    no-store           - не сохранять запрос/ответ в кэш
    max-age=0          - требовать свежий ресурс
    max-stale=60       - принять ресурс устаревший не более чем на 60 сек

Expires (устаревший, заменён Cache-Control):
  Expires: Wed, 30 Apr 2026 10:00:00 GMT
  Если Cache-Control присутствует - Expires игнорируется.

Pragma (устаревший):
  Pragma: no-cache
  HTTP/1.0 эквивалент Cache-Control: no-cache.

Примеры политик кэширования:
  # Статические ресурсы с хэшем в имени (вечно):
  Cache-Control: public, max-age=31536000, immutable

  # HTML страницы (всегда проверять):
  Cache-Control: no-cache

  # API ответы (не кэшировать):
  Cache-Control: no-store

  # Публичные API данные (5 минут):
  Cache-Control: public, max-age=300, s-maxage=300
```

---

## HTTP статус коды

### 1xx - Информационные

```
100 Continue
  Сервер принял заголовки, клиент может отправить тело.
  Клиент отправляет Expect: 100-continue перед большим телом.
  Если сервер ответит 100 - отправляем тело.
  Если 417 Expectation Failed - тело не нужно.

101 Switching Protocols
  Сервер согласен на смену протокола (Upgrade).
  Используется при апгрейде до WebSocket или HTTP/2.

  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

102 Processing (WebDAV)
  Запрос принят, обрабатывается, ответа пока нет.
  Предотвращает таймаут клиента.

103 Early Hints
  Предварительные заголовки пока сервер готовит ответ.
  Позволяет браузеру начать загрузку ресурсов заранее (Link: preload).
```

### 2xx - Успех

```
200 OK
  Стандартный успешный ответ. Тело содержит запрошенные данные.
  GET → тело с ресурсом.
  POST → тело с результатом или созданным ресурсом.

201 Created
  Ресурс создан (ответ на POST или PUT).
  Location заголовок указывает URI нового ресурса.

202 Accepted
  Запрос принят, но обработка не завершена.
  Асинхронные операции: "задача поставлена в очередь".
  Нет гарантии что обработка успешна.

204 No Content
  Успешно, тела ответа нет.
  DELETE (удалено), PUT/PATCH (обновлено, результат не нужен).
  Браузер не меняет страницу (в отличие от 200 с пустым телом).

206 Partial Content
  Частичный ответ (range request).
  Content-Range: bytes 0-1023/10240 (что отдали / всего).

207 Multi-Status (WebDAV)
  Несколько операций, у каждой свой статус.

208 Already Reported (WebDAV)
  Ресурс уже включён в предыдущий ответ.

226 IM Used
  Сервер выполнил GET с instance manipulations (delta encoding).
```

### 3xx - Перенаправления

```
300 Multiple Choices
  Несколько вариантов ресурса (разные форматы, языки).
  Редко используется.

301 Moved Permanently
  Ресурс перемещён навсегда. Новый URI в Location.
  Браузер кэширует редирект.
  Поисковики передают PageRank новому URL.
  POST может стать GET при редиректе (часть браузеров).

302 Found (временный редирект)
  Ресурс временно по другому URI.
  Браузер не кэширует.
  POST может стать GET (спорное поведение, исправлено в 303/307).

303 See Other
  Ответ на запрос находится по другому URI.
  Всегда делать GET к новому URI (даже если был POST).
  Шаблон Post/Redirect/Get (PRG) для форм.

304 Not Modified
  Ресурс не изменился (ответ на If-Modified-Since / If-None-Match).
  Браузер использует кэшированную версию.
  Тела нет. Экономия трафика.

307 Temporary Redirect
  Временный редирект с сохранением метода.
  POST → POST к новому URI (в отличие от 302 где POST → GET).

308 Permanent Redirect
  Постоянный редирект с сохранением метода.
  POST → POST к новому URI (в отличие от 301 где POST → GET).

Сравнение редиректов:
  Постоянный + сохраняет метод:   308
  Постоянный + меняет на GET:     301
  Временный + сохраняет метод:    307
  Временный + меняет на GET:      302, 303
  Для форм (POST → GET):          303
```

### 4xx - Ошибки клиента

```
400 Bad Request
  Неверный запрос. Синтаксическая ошибка, невалидные параметры.
  JSON не парсится, отсутствует обязательное поле, неверный формат.

401 Unauthorized
  Требуется аутентификация. Не авторизован (неверное название).
  Ответ содержит WWW-Authenticate заголовок.
  Отличие от 403: 401 = "кто ты?", 403 = "знаю кто ты, но нельзя".

403 Forbidden
  Доступ запрещён. Аутентификация не поможет.
  Нет прав на ресурс. Или ресурс скрыт (лучше 404 для безопасности).

404 Not Found
  Ресурс не найден. Самый известный статус.
  Используется и когда ресурс существует но скрывается (безопасность).

405 Method Not Allowed
  Метод не разрешён для данного URI.
  Ответ должен содержать Allow заголовок с разрешёнными методами.

406 Not Acceptable
  Сервер не может вернуть контент в формате из Accept заголовка.

408 Request Timeout
  Клиент слишком долго отправлял запрос.
  Сервер закрывает соединение.

409 Conflict
  Конфликт состояний. Ресурс уже существует, версия устарела.
  PUT с устаревшей версией, создание дубликата уникальной записи.

410 Gone
  Ресурс удалён навсегда. В отличие от 404 - точно не вернётся.
  Поисковики должны убрать из индекса.

411 Length Required
  Content-Length обязателен для этого запроса.

413 Content Too Large (ранее: Payload Too Large)
  Тело запроса превышает лимит сервера.
  Типично: загрузка слишком большого файла.

414 URI Too Long
  URI слишком длинный. Обычно GET с огромным query string.

415 Unsupported Media Type
  Сервер не поддерживает Content-Type запроса.
  Ждёт JSON, получил XML.

416 Range Not Satisfiable
  Запрошенный Range за пределами ресурса.
  Content-Range: */10240 (нет данных / полный размер).

422 Unprocessable Content (ранее: Unprocessable Entity)
  Синтаксически верный запрос, но семантически неверный.
  JSON парсится, но данные не проходят валидацию.
  Популярен в REST API: поле обязательно, значение вне диапазона.

423 Locked (WebDAV)
  Ресурс заблокирован.

424 Failed Dependency (WebDAV)
  Запрос не выполнен из-за неудачи предыдущей зависимой операции.

425 Too Early
  Сервер не готов обрабатывать запрос из-за риска replay атаки (TLS).

429 Too Many Requests
  Превышен rate limit. Заголовок Retry-After указывает когда повторить.

431 Request Header Fields Too Large
  Заголовки запроса слишком большие.

451 Unavailable For Legal Reasons
  Ресурс недоступен по юридическим причинам (авторское право, цензура).
  Аллюзия на роман "451 градус по Фаренгейту".
```

### 5xx - Ошибки сервера

```
500 Internal Server Error
  Общая ошибка сервера. Что-то пошло не так.
  Необработанное исключение, падение приложения.

501 Not Implemented
  Метод не реализован сервером.
  Не то же что 405 (метод не разрешён для URI).

502 Bad Gateway
  Прокси/балансировщик получил неверный ответ от upstream сервера.
  Nginx/HAProxy не может получить ответ от backend.

503 Service Unavailable
  Сервер временно недоступен (перегрузка или обслуживание).
  Retry-After указывает когда попробовать снова.

504 Gateway Timeout
  Прокси/балансировщик не получил ответ от upstream вовремя.
  Backend завис или слишком медленный.

505 HTTP Version Not Supported
  Сервер не поддерживает версию HTTP в запросе.

507 Insufficient Storage (WebDAV)
  Недостаточно места для сохранения ресурса.

508 Loop Detected (WebDAV)
  Обнаружен бесконечный цикл при обработке.

511 Network Authentication Required
  Требуется аутентификация в сети (captive portal Wi-Fi).

Разница 502/503/504:
  502 Bad Gateway     - upstream вернул мусор или упал
  503 Unavailable     - сервер сам по себе недоступен (лимит соединений)
  504 Gateway Timeout - upstream слишком медленно отвечает
```

---

## HTTP/1.1 особенности

### Keep-Alive (Persistent Connections)

```
HTTP/1.0: каждый запрос = новое TCP соединение (медленно).
HTTP/1.1: соединение остаётся открытым для нескольких запросов.

Заголовки:
  Connection: keep-alive   (HTTP/1.0 style, в 1.1 по умолчанию)
  Keep-Alive: timeout=5, max=100
    timeout=5  - закрыть если 5 сек нет активности
    max=100    - максимум 100 запросов на это соединение

Закрытие соединения:
  Connection: close  (один из участников хочет закрыть)
  Сервер закрывает сам по таймауту.

Проблема HTTP/1.1 - Head-of-Line Blocking:
  Запросы по одному соединению идут по очереди (FIFO).
  Медленный ответ на запрос N блокирует запросы N+1, N+2...
  Решение: открыть несколько соединений (браузеры открывают 6-8 к хосту).
  Лучшее решение: HTTP/2 (мультиплексирование).
```

### Chunked Transfer Encoding

```
Когда размер тела неизвестен заранее (генерируется динамически).
Нет Content-Length → используется Transfer-Encoding: chunked.

Формат:
  HTTP/1.1 200 OK
  Transfer-Encoding: chunked
  Content-Type: text/plain

  7\r\n          ← размер чанка в hex (7 = 7 байт)
  Mozilla\r\n    ← данные
  9\r\n          ← следующий чанк (9 байт)
  Developer\r\n
  7\r\n
  Network\r\n
  0\r\n          ← нулевой чанк = конец
  \r\n           ← пустая строка завершает

Применение: стриминг данных, Server-Sent Events, большие файлы.
```

### Content Negotiation

```
Механизм выбора лучшего представления ресурса для конкретного клиента.

Клиент указывает предпочтения:
  Accept: text/html, application/json;q=0.9, */*;q=0.8
  Accept-Language: ru, en;q=0.8
  Accept-Encoding: gzip, br;q=0.9

Сервер выбирает лучшее совпадение и отвечает:
  Content-Type: text/html; charset=UTF-8
  Content-Language: ru
  Content-Encoding: gzip
  Vary: Accept, Accept-Language   ← кэш должен учитывать эти заголовки!

Vary заголовок:
  Указывает от каких заголовков запроса зависит ответ.
  Прокси/CDN кэшируют отдельные версии для разных значений Vary.
  Vary: Accept-Encoding → отдельный кэш для gzip и не-gzip.
  Vary: * → не кэшировать (ответ уникален для каждого запроса).
```

---

## Практика и диагностика

### curl - работа с HTTP

```
# GET запрос
curl https://example.com
curl -v https://example.com     # verbose (заголовки)
curl -I https://example.com     # только заголовки (HEAD)
curl -s https://example.com     # тихий режим (без прогресса)

# POST с JSON
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token123" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# POST с форм-данными
curl -X POST https://example.com/login \
  -d "username=admin&password=secret"

# Загрузка файла (multipart)
curl -X POST https://api.example.com/upload \
  -F "file=@/path/to/file.pdf" \
  -F "name=document"

# PUT запрос
curl -X PUT https://api.example.com/users/42 \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Updated"}'

# DELETE
curl -X DELETE https://api.example.com/users/42

# Следовать редиректам
curl -L https://example.com

# Сохранить в файл
curl -o output.html https://example.com
curl -O https://example.com/file.zip    # имя из URL

# Кастомные заголовки
curl -H "X-Custom-Header: value" https://example.com

# Базовая аутентификация
curl -u username:password https://example.com

# Игнорировать SSL
curl -k https://self-signed.example.com

# Показать только статус код
curl -s -o /dev/null -w "%{http_code}" https://example.com

# Показать время запроса
curl -s -o /dev/null -w "Time: %{time_total}s\n" https://example.com

# Полный формат вывода
curl -s -o /dev/null -w "
  DNS lookup:    %{time_namelookup}s
  TCP connect:   %{time_connect}s
  TLS handshake: %{time_appconnect}s
  TTFB:          %{time_starttransfer}s
  Total:         %{time_total}s
  HTTP code:     %{http_code}
" https://example.com
```

### httpie - удобная альтернатива curl

```
# Установка
pip install httpie

# GET запрос
http https://api.example.com/users

# POST с JSON (автоматически)
http POST https://api.example.com/users \
  name=Alice email=alice@example.com

# С заголовками
http GET https://api.example.com/users \
  Authorization:"Bearer token123" \
  Accept:application/json

# Файлы
http --multipart POST https://api.example.com/upload \
  file@/path/to/file.pdf

# Базовая аутентификация
http -a username:password https://example.com
```

### Захват HTTP в tcpdump / Wireshark

```
# tcpdump - HTTP трафик
tcpdump -i eth0 -A 'tcp port 80'
# -A = ASCII вывод (читаемый текст)

# Сохранить для Wireshark
tcpdump -i eth0 -w http.pcap 'tcp port 80 or tcp port 443'

# Wireshark фильтры:
http                           # весь HTTP трафик
http.request.method == "POST"  # только POST запросы
http.response.code == 404      # только 404 ответы
http.host == "example.com"     # конкретный хост
http.request.uri contains "/api" # URI содержит /api
http && ip.addr == 1.2.3.4     # HTTP от/к конкретному IP

# mitmproxy - интерактивный HTTP прокси
pip install mitmproxy
mitmproxy --listen-port 8080
# Настроить браузер на прокси 127.0.0.1:8080
# Позволяет просматривать/изменять запросы в реальном времени

# Простой HTTP сервер для тестирования
python3 -m http.server 8080   # текущая папка на :8080
```

### Типичные проблемы

```
Проблема: 301/302 редирект петля (redirect loop)
  Симптом: ERR_TOO_MANY_REDIRECTS в браузере
  Диагностика:
    curl -v --max-redirs 5 https://example.com
    # Смотреть Location заголовки - куда редиректит?
  Причины:
    - HTTPS редиректит на HTTP который опять редиректит на HTTPS
    - Балансировщик и приложение по-разному понимают X-Forwarded-Proto
    - Cookie с Secure флагом вызывает редирект на HTTPS

Проблема: CORS ошибки в браузере
  Симптом: "Access to fetch at '...' from origin '...' has been blocked"
  Диагностика:
    # Проверить preflight
    curl -X OPTIONS https://api.example.com/data \
      -H "Origin: https://app.frontend.com" \
      -H "Access-Control-Request-Method: POST" -v
  Решение на сервере:
    Access-Control-Allow-Origin: https://app.frontend.com
    Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
    Access-Control-Allow-Headers: Content-Type, Authorization

Проблема: медленный TTFB (Time To First Byte)
  Диагностика:
    curl -s -o /dev/null -w "%{time_starttransfer}" https://example.com
  Причины:
    - Долгая обработка запроса на сервере
    - База данных тормозит
    - Нет кэширования, пересчёт каждый раз
    - DNS resolution медленный

Проблема: 413 при загрузке файла
  nginx: client_max_body_size 100m;
  Apache: LimitRequestBody 104857600
  PHP: upload_max_filesize = 100M, post_max_size = 100M
```

---

## Шпаргалка

```
HTTP методы:
  GET    - получить ресурс (безопасный, идемпотентный, кэшируемый)
  HEAD   - только заголовки без тела
  POST   - создать ресурс / отправить данные (НЕ идемпотентный)
  PUT    - создать или заменить ресурс целиком (идемпотентный)
  PATCH  - частично обновить ресурс
  DELETE - удалить ресурс (идемпотентный)
  OPTIONS - узнать разрешённые методы (CORS preflight)

Ключевые заголовки запроса:
  Host              обязателен в HTTP/1.1
  Authorization     аутентификация (Basic, Bearer, Digest)
  Content-Type      тип тела запроса
  Accept            что клиент готов получить
  Cookie            cookies
  If-None-Match     условный запрос (ETag)
  If-Modified-Since условный запрос (дата)

Ключевые заголовки ответа:
  Content-Type      тип тела ответа
  Set-Cookie        установить cookie
  Location          редирект или созданный ресурс
  Cache-Control     политика кэширования
  ETag              версия ресурса
  WWW-Authenticate  запрос аутентификации (401)

Статус коды (самые важные):
  200 OK              успех с телом
  201 Created         ресурс создан
  204 No Content      успех без тела
  206 Partial         частичный контент (range)
  301 Moved Perm.     постоянный редирект (GET)
  302 Found           временный редирект (GET)
  303 See Other       редирект на GET (после POST)
  304 Not Modified    из кэша
  307 Temp. Redirect  временный редирект (метод сохраняется)
  308 Perm. Redirect  постоянный редирект (метод сохраняется)
  400 Bad Request     неверный запрос
  401 Unauthorized    нужна аутентификация
  403 Forbidden       доступ запрещён
  404 Not Found       не найдено
  405 Method NA       метод не разрешён
  409 Conflict        конфликт
  422 Unprocessable   ошибка валидации
  429 Too Many Req.   rate limit
  500 Server Error    ошибка сервера
  502 Bad Gateway     upstream вернул мусор
  503 Unavailable     сервер недоступен
  504 Gateway Timeout upstream не отвечает

curl быстрый старт:
  curl -v URL                           verbose
  curl -I URL                           HEAD запрос
  curl -X POST -H "CT: app/json" -d '{}' URL  POST с JSON
  curl -s -o /dev/null -w "%{http_code}" URL   только код
  curl -L URL                           следовать редиректам
```

---

## Ссылки

- [RFC 7230](https://www.rfc-editor.org/rfc/rfc7230) - HTTP/1.1: Message Syntax and Routing
- [RFC 7231](https://www.rfc-editor.org/rfc/rfc7231) - HTTP/1.1: Semantics and Content (методы, статусы, заголовки)
- [RFC 7232](https://www.rfc-editor.org/rfc/rfc7232) - HTTP/1.1: Conditional Requests (ETag, If-Modified-Since)
- [RFC 7233](https://www.rfc-editor.org/rfc/rfc7233) - HTTP/1.1: Range Requests
- [RFC 7234](https://www.rfc-editor.org/rfc/rfc7234) - HTTP/1.1: Caching
- [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) - HTTP/1.1: Authentication
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) - HTTP Semantics (объединённый, актуальный)
- [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902) - JSON Patch
- [MDN HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP) - подробная документация с примерами
- [HTTP Status Dogs](https://httpstatusdogs.com) / [HTTP Cats](https://http.cat) - визуальная памятка по кодам
