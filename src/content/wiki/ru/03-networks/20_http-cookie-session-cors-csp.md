---
title: "HTTP - Cookie, Session, CORS, CSP"
date: "2026-05-03"
---

HTTP - протокол без состояния (stateless). Каждый запрос независим, сервер не помнит предыдущих. Cookie, Session, CORS и CSP - механизмы добавляющие состояние, безопасность и контроль доступа поверх этого базового протокола.

---

## Cookie

Cookie - небольшой кусок данных, который сервер отправляет браузеру, браузер хранит и автоматически прикрепляет к каждому следующему запросу к тому же домену.

### Как работают Cookie

```
Клиент                              Сервер
  │                                    │
  │  GET /login HTTP/1.1               │
  │───────────────────────────────────►│
  │                                    │  аутентификация прошла
  │  HTTP/1.1 200 OK                   │
  │  Set-Cookie: session_id=abc123;    │
  │              HttpOnly; Secure;     │
  │              SameSite=Strict;      │
  │              Max-Age=3600          │
  │◄───────────────────────────────────│
  │                                    │
  │  GET /dashboard HTTP/1.1           │
  │  Cookie: session_id=abc123         │  браузер добавляет сам
  │───────────────────────────────────►│
  │                                    │  знаем кто это → отдаём данные
  │  HTTP/1.1 200 OK                   │
  │◄───────────────────────────────────│
```

### Set-Cookie атрибуты

```
Set-Cookie: name=value; атрибуты...

Атрибут          Описание
---------        --------
Domain=          Для каких доменов отправлять cookie.
                 Domain=example.com → отправлять и на sub.example.com
                 Без Domain → только текущий хост (не поддомены)

Path=            Для каких путей отправлять.
                 Path=/ → для всех путей
                 Path=/api → только для /api/*

Expires=         Дата истечения (RFC 1123 формат).
                 После этой даты браузер удаляет cookie.
                 Expires=Wed, 09 Jun 2024 10:18:14 GMT

Max-Age=         Время жизни в секундах (приоритет над Expires).
                 Max-Age=3600 → 1 час
                 Max-Age=0 → удалить cookie немедленно
                 Max-Age=-1 → session cookie (удалить при закрытии вкладки)

HttpOnly         Cookie недоступна через JavaScript (document.cookie).
                 Защита от XSS кражи cookie.
                 [нет значения - просто флаг]

Secure           Cookie отправляется только по HTTPS.
                 [нет значения - просто флаг]

SameSite=        Контроль отправки при cross-site запросах:
  Strict         Только если origin совпадает (защита от CSRF)
  Lax            При навигации (клик на ссылку) - да.
                 При AJAX/iframe/img cross-site - нет. [по умолчанию]
  None           Всегда отправлять (нужен Secure!)

Partitioned      CHIPS (Cookies Having Independent Partitioned State).
                 Cookie изолированы по top-level сайту.
                 Для embedded content (третьи стороны).
```

```
Примеры Set-Cookie:

# Сессионный cookie (удаляется при закрытии браузера)
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax

# Постоянный cookie (30 дней)
Set-Cookie: user_pref=dark_mode; Max-Age=2592000; SameSite=Lax

# Cookie для поддоменов
Set-Cookie: auth=token; Domain=example.com; Secure; HttpOnly

# Cookie для стороннего контента (требует Secure + Partitioned или None)
Set-Cookie: tracking=id; SameSite=None; Secure; Partitioned

# Удалить cookie
Set-Cookie: session=; Max-Age=0
```

```
# Посмотреть cookie в браузере:
# DevTools → Application → Storage → Cookies

# curl: посмотреть Set-Cookie в ответе
curl -v https://example.com 2>&1 | grep -i "set-cookie"

# curl: отправить cookie
curl -b "session=abc123" https://example.com

# curl: сохранить и переиспользовать cookie (cookie jar)
curl -c cookies.txt -b cookies.txt https://example.com/login -d "user=a&pass=b"
curl -c cookies.txt -b cookies.txt https://example.com/dashboard
```

### Cookie в JavaScript

```javascript
// Читать cookie (HttpOnly недоступны!)
document.cookie
// "user=john; pref=dark; lang=en"

// Установить cookie
document.cookie = "user=john; max-age=3600; path=/; samesite=lax"
// Внимание: каждое присвоение добавляет или обновляет одну cookie,
// НЕ заменяет все cookie сразу

// Удалить cookie (установить истёкшую дату)
document.cookie = "user=; max-age=0; path=/"

// Удобная функция для чтения
function getCookie(name) {
  const match = document.cookie.match(
    new RegExp('(^| )' + name + '=([^;]+)')
  )
  return match ? match[2] : null
}

// Cookie API (современный, async)
// cookieStore.get('name')
// cookieStore.set('name', 'value')
// cookieStore.delete('name')
const cookie = await cookieStore.get('session')
```

### Ограничения Cookie

```
Размер:   ~4KB на cookie
Количество: ~50 cookie на домен (зависит от браузера)
Scope:    только для своего домена (нельзя читать чужие)

Третьи стороны (3rd party cookies):
  Сайт A включает iframe от tracker.com
  tracker.com ставит свою cookie
  При посещении сайта B (тоже включает tracker.com) -
  та же cookie отправляется tracker.com
  → трекинг пользователя между сайтами

  Chrome блокирует 3rd party cookies с 2024
  Firefox/Safari блокируют уже давно
  Альтернативы: Storage Access API, CHIPS, FedCM
```

---

## Session (Сессия)

Сессия - серверная концепция хранения состояния пользователя. Cookie хранит идентификатор сессии, а данные - на сервере.

### Cookie-based Session

```
Схема работы:

1. Пользователь логинится:
   POST /login {username, password}
   → Сервер проверяет credentials
   → Создаёт сессию: sessions["abc123"] = {user_id: 42, role: "admin"}
   → Set-Cookie: session_id=abc123; HttpOnly; Secure

2. Следующий запрос:
   GET /api/data
   Cookie: session_id=abc123
   → Сервер ищет sessions["abc123"]
   → Находит user_id=42 → знает кто это

3. Logout:
   POST /logout
   → Сервер удаляет sessions["abc123"]
   → Set-Cookie: session_id=; Max-Age=0
```

```
Хранение сессий на сервере:

In-memory (dict/map):
  + Быстро
  - Теряется при перезапуске
  - Не работает при нескольких серверах (нет shared state)

Redis:
  + Быстро, персистентно, работает с несколькими серверами
  + TTL встроен (auto-expire)
  - Дополнительный сервис

База данных:
  + Надёжно
  - Медленнее (disk I/O на каждый запрос)

Пример с Redis (Python/Flask):
  from flask import Flask, session
  from flask_session import Session
  import redis

  app.config['SESSION_TYPE'] = 'redis'
  app.config['SESSION_REDIS'] = redis.from_url('redis://localhost')
  Session(app)
```

### JWT (JSON Web Token) - Stateless Session

```
JWT - альтернатива серверным сессиям. Данные хранятся в токене,
подписанном сервером. Сервер не хранит состояние.

Структура JWT:
  header.payload.signature
  
  Header (base64url):
  {
    "alg": "HS256",   // алгоритм подписи
    "typ": "JWT"
  }
  
  Payload (base64url):
  {
    "sub": "42",           // user id
    "name": "John",
    "role": "admin",
    "iat": 1714000000,     // issued at (unix timestamp)
    "exp": 1714003600      // expires at
  }
  
  Signature:
  HMAC-SHA256(base64url(header) + "." + base64url(payload), secret)

Верификация: пересчитать подпись → если совпадает → токен не изменён.
```

```
JWT vs Cookie Session:

                Cookie Session      JWT
                ──────────────      ───
Хранение        Сервер (Redis)      Клиент (cookie/localStorage)
Размер запроса  Маленький (ID)      Больше (весь токен)
Revocation      Легко (удалить)     Сложно (нужен blacklist)
Масштабирование Нужен shared store  Нет (stateless)
Данные          Любые (сервер)      Только в токене (visible!)

Где хранить JWT на клиенте:
  HttpOnly Cookie:  безопасно (нет XSS), CSRF возможен
  localStorage:     XSS уязвимость (!), нет CSRF
  Memory (JS var):  безопасно, теряется при обновлении страницы

Рекомендация: HttpOnly Cookie + SameSite=Strict/Lax

Проблема revocation JWT:
  Пользователь разлогинился, но токен ещё действителен.
  Решение: короткий срок (15 мин) + refresh token.
  Refresh token хранится в HttpOnly cookie.
  Access token (JWT) краткосрочный, в памяти.
```

```bash
# Декодировать JWT (без проверки подписи)
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiJ9.xxx" | \
  cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool

# jwt-cli
jwt decode eyJ...
jwt encode --secret mysecret --alg HS256 '{"sub":"42","exp":9999999999}'

# Проверить JWT онлайн: jwt.io
```

### Session Fixation и другие атаки

```
Session Fixation:
  Атакующий знает session_id до логина (например, из URL).
  Жертва логинится → этот session_id становится аутентифицированным.
  Атакующий использует известный session_id.
  
  Защита: после логина всегда создавать НОВЫЙ session_id.
  (регенерация сессии)

Session Hijacking:
  Кража session_id (XSS, network sniffing).
  
  Защита:
  - HttpOnly (нет JS доступа)
  - Secure (только HTTPS)
  - IP binding (привязка к IP - ломает мобильных пользователей)
  - Short TTL + re-auth

Brute Force session_id:
  Если ID предсказуем (последовательный) → перебор.
  
  Защита: криптографически стойкий PRNG для генерации ID.
  Python: secrets.token_hex(32)
  Node.js: crypto.randomBytes(32).toString('hex')
```

---

## CORS - Cross-Origin Resource Sharing

CORS - браузерный механизм контроля cross-origin запросов. Позволяет или запрещает JavaScript на одном origin обращаться к ресурсам другого origin.

### Same-Origin Policy

```
Same-Origin Policy (SOP) - фундаментальная политика безопасности браузера.
Скрипт на странице может делать запросы только к тому же origin.

Origin = protocol + host + port
  https://example.com:443  ← один origin
  https://api.example.com  ← другой (другой host)
  http://example.com       ← другой (другой protocol)
  https://example.com:8080 ← другой (другой port)

Без SOP:
  Ты зашёл на evil.com
  JavaScript evil.com делает запрос к bank.com/api/balance
  С твоими cookie → получает данные → отправляет злоумышленнику

SOP предотвращает это: evil.com не может читать ответы от bank.com.

Но иногда cross-origin запросы нужны легитимно:
  frontend.example.com → api.example.com
  app.com → fonts.googleapis.com, cdn.cloudflare.com
  → Для этого CORS.
```

### Как работает CORS

```
Два типа CORS запросов:

1. Simple Request (простой запрос):
   Методы: GET, HEAD, POST
   Заголовки: только простые (Content-Type: text/plain, application/x-www-form-urlencoded, multipart/form-data)
   
   Браузер отправляет запрос сразу + заголовок Origin:

   GET /api/data HTTP/1.1
   Origin: https://frontend.example.com   ← браузер добавляет
   
   Сервер отвечает:
   Access-Control-Allow-Origin: https://frontend.example.com
   (или * для публичных API)
   
   Браузер проверяет → если origin разрешён → JS получает ответ.

2. Preflight Request (предварительный запрос):
   Нестандартные методы (PUT, DELETE, PATCH) или заголовки
   (Authorization, Content-Type: application/json и др.)
   
   Браузер сначала отправляет OPTIONS:

   OPTIONS /api/data HTTP/1.1
   Origin: https://frontend.example.com
   Access-Control-Request-Method: DELETE
   Access-Control-Request-Headers: Authorization, Content-Type
   
   Сервер: "OK, разрешаю":
   HTTP/1.1 204 No Content
   Access-Control-Allow-Origin: https://frontend.example.com
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE
   Access-Control-Allow-Headers: Authorization, Content-Type
   Access-Control-Max-Age: 86400   ← кэшировать preflight 24 часа
   
   Только после этого браузер отправляет реальный запрос.
```

### CORS заголовки

```
Запрос (браузер добавляет):
  Origin: https://frontend.example.com
  Access-Control-Request-Method: PUT        (в preflight)
  Access-Control-Request-Headers: Auth      (в preflight)

Ответ (сервер должен вернуть):
  Access-Control-Allow-Origin: https://frontend.example.com
    или * (для публичных API без credentials)

  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS

  Access-Control-Allow-Headers: Authorization, Content-Type, X-Custom

  Access-Control-Allow-Credentials: true
    Нужно если запрос с credentials (cookie, Authorization).
    При credentials нельзя использовать * в Allow-Origin!
    Нужно указывать конкретный origin.

  Access-Control-Max-Age: 86400
    Сколько секунд браузер кэширует preflight.

  Access-Control-Expose-Headers: X-Custom-Header
    Какие заголовки ответа доступны JS (по умолчанию: только базовые).
```

```
# Проверить CORS заголовки
curl -H "Origin: https://frontend.example.com" \
     -H "Access-Control-Request-Method: DELETE" \
     -X OPTIONS \
     https://api.example.com/resource -v 2>&1 | grep -i "access-control"

# Simulated browser preflight
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://api.example.com/data

# Проверить что API возвращает правильный origin
curl -H "Origin: https://evil.com" https://api.example.com/data -v 2>&1 | \
  grep "Access-Control-Allow-Origin"
# Не должен возвращать https://evil.com или *
```

### CORS на сервере

```nginx
# Nginx CORS конфигурация

# Простой вариант (публичный API)
add_header Access-Control-Allow-Origin *;

# Правильный вариант (с credentials и конкретными origins)
map $http_origin $cors_origin {
    default "";
    "https://app.example.com"    $http_origin;
    "https://admin.example.com"  $http_origin;
}

server {
    location /api/ {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin $cors_origin;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type";
            add_header Access-Control-Allow-Credentials true;
            add_header Access-Control-Max-Age 86400;
            return 204;
        }

        add_header Access-Control-Allow-Origin $cors_origin;
        add_header Access-Control-Allow-Credentials true;
        proxy_pass http://backend;
    }
}
```

```python
# FastAPI CORS
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Express.js CORS
const cors = require('cors')
app.use(cors({
    origin: ['https://app.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400
}))
```

### Частые CORS ошибки

```
Ошибка: "Access to fetch at '...' has been blocked by CORS policy"
  Причины:
  1. Нет заголовка Access-Control-Allow-Origin
  2. Origin не совпадает с Allow-Origin
  3. Allow-Origin: * + credentials: true (запрещено)
  4. Preflight вернул ошибку (4xx/5xx)
  5. Нет OPTIONS handler на сервере

Ошибка: "The value of 'Access-Control-Allow-Credentials' header
         in the response is '' which must be 'true'"
  Решение: добавить Access-Control-Allow-Credentials: true

Ошибка: wildcard + credentials
  Нельзя: Access-Control-Allow-Origin: *
           Access-Control-Allow-Credentials: true
  Нужно:  Access-Control-Allow-Origin: https://конкретный.домен
           Access-Control-Allow-Credentials: true

Опасная конфигурация (не делай так!):
  Access-Control-Allow-Origin: * + никакой аутентификации = OK для публичных API
  Access-Control-Allow-Origin: $http_origin без whitelist = любой origin разрешён
  → Все сайты могут делать запросы от имени пользователя
```

---

## CSP - Content Security Policy

CSP - HTTP заголовок (или meta тег) который указывает браузеру откуда можно загружать ресурсы. Основная защита от XSS (Cross-Site Scripting).

### Как работает CSP

```
Без CSP:
  <script src="https://evil.com/malware.js"></script>
  Или инъекция в HTML: <script>document.cookie → evil.com</script>
  Браузер выполняет всё.

С CSP:
  Content-Security-Policy: script-src 'self' https://cdn.example.com
  
  <script src="https://evil.com/malware.js"></script>
  → Браузер блокирует (evil.com не в whitelist)
  
  <script>document.cookie</script>
  → Браузер блокирует (inline scripts запрещены по умолчанию)
```

### Директивы CSP

```
Content-Security-Policy: директива1 'значения'; директива2 'значения'

Директивы для ресурсов:
  default-src    Fallback для всех типов (если нет специфичной директивы)
  script-src     JavaScript
  style-src      CSS
  img-src        Изображения
  font-src       Шрифты
  connect-src    fetch(), XMLHttpRequest, WebSocket
  media-src      audio, video
  frame-src      iframe
  child-src      iframe и Web Workers
  worker-src     Web Workers, Service Workers
  manifest-src   Web App Manifest
  object-src     <object>, <embed> (рекомендуется 'none')
  base-uri       <base> тег (защита от base tag injection)
  form-action    куда можно отправлять формы

Директивы навигации:
  frame-ancestors Кто может встраивать страницу в iframe
                  (замена X-Frame-Options)

Директивы отчётности:
  report-uri     URL для отправки нарушений (устарел)
  report-to      Группа из Reporting API (современный)

Специальные директивы:
  upgrade-insecure-requests  Заменить http:// на https:// автоматически
  block-all-mixed-content    Блокировать mixed content
```

### Значения источников CSP

```
'none'          Ничего не разрешено
'self'          Только тот же origin
'unsafe-inline' Разрешить inline scripts/styles (ослабляет CSP!)
'unsafe-eval'   Разрешить eval(), setTimeout(string) (ослабляет CSP!)
'strict-dynamic' Скрипты могут загружать другие скрипты (nonce-based)
'unsafe-hashes' Разрешить конкретные inline хэши

https:          Любой HTTPS источник
http:           Любой HTTP источник (не рекомендуется)

https://cdn.example.com        Конкретный домен
https://*.example.com          Поддомены example.com
https://cdn.example.com/libs/  Конкретный путь

'nonce-СЛУЧАЙНАЯ_СТРОКА'       Одноразовый токен для inline script
'sha256-ХЭШ_СОДЕРЖИМОГО'       Хэш конкретного inline script
```

### Примеры CSP политик

```
# Строгая политика (рекомендуется для большинства сайтов)
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';

# С nonce для inline scripts (строгий и удобный)
Content-Security-Policy:
  script-src 'nonce-{RANDOM}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';

  В HTML:
  <script nonce="RANDOM_VALUE">
    // этот script разрешён
  </script>

  Nonce - случайная строка, генерируется на каждый запрос сервером.
  Злоумышленник не знает nonce → не может инжектировать script с ним.

# С хэшами (для статических inline scripts)
Content-Security-Policy:
  script-src 'sha256-abc123=='
  
  Браузер вычисляет SHA-256 каждого inline script.
  Если совпадает → разрешает. Изменишь скрипт → хэш не совпадёт → блок.

# Report-Only режим (тестирование CSP без блокировки)
Content-Security-Policy-Report-Only:
  default-src 'self';
  report-uri /csp-violations

  Браузер НЕ блокирует, но отправляет отчёты о нарушениях.
  Используй для тестирования перед боевым внедрением.
```

### Nonce-based CSP (лучшая практика)

```
Проблема 'unsafe-inline': разрешает любой inline script.
Решение: nonce - уникальный токен на каждый запрос.

Nginx: генерировать nonce и добавлять в заголовок
  # В Nginx + Lua (OpenResty):
  set_by_lua $csp_nonce 'return require("crypto").hex(16)';
  add_header Content-Security-Policy
    "script-src 'nonce-$csp_nonce' 'strict-dynamic'; object-src 'none'";

Python/Flask:
  import secrets
  @app.before_request
  def set_csp_nonce():
      g.nonce = secrets.token_urlsafe(16)

  @app.after_request
  def add_csp_header(response):
      response.headers['Content-Security-Policy'] = \
          f"script-src 'nonce-{g.nonce}' 'strict-dynamic'; object-src 'none'"
      return response

  В шаблоне:
  <script nonce="{{ g.nonce }}">...</script>

'strict-dynamic':
  Скрипт с nonce может динамически загружать другие скрипты.
  Нужно для SPA (React, Vue) которые сами загружают модули.
```

### CSP и отчёты о нарушениях

```
Получение отчётов о нарушениях CSP:

report-uri (устарел, но поддерживается):
  Content-Security-Policy: ...; report-uri /csp-report

  Браузер POST'ит JSON при нарушении:
  {
    "csp-report": {
      "document-uri": "https://example.com/page",
      "violated-directive": "script-src",
      "blocked-uri": "https://evil.com/script.js",
      "source-file": "https://example.com/page",
      "line-number": 42,
      "column-number": 10
    }
  }

Reporting API (современный):
  Report-To: {"group":"csp-endpoint","max_age":86400,
              "endpoints":[{"url":"/csp-report"}]}
  Content-Security-Policy: ...; report-to csp-endpoint

Сервисы для сбора CSP отчётов:
  report-uri.com  (платный SaaS)
  Свой endpoint: логировать и анализировать нарушения
```

```
# Проверить CSP заголовок сайта
curl -s -I https://example.com | grep -i "content-security-policy"

# Подробно
curl -s -I https://google.com | grep -i "csp\|content-security"

# Проверить CSP в браузере:
# DevTools → Network → выбрать запрос → Response Headers → Content-Security-Policy

# Анализ CSP политики:
# csp-evaluator.withgoogle.com  (Google CSP Evaluator)
# report-uri.com/home/analyse
```

---

## Взаимодействие: Cookie + Session + CORS + CSP

```
Полная картина для типичного SPA приложения:

frontend.example.com          api.example.com
       │                            │
       │  1. Login (POST /auth)     │
       │──────────────────────────►│
       │                            │  создать сессию / JWT
       │  Set-Cookie: session=abc;  │
       │  HttpOnly; Secure; Lax     │
       │◄──────────────────────────│
       │                            │
       │  2. API запрос             │
       │  GET /api/data             │
       │  Cookie: session=abc       │  браузер добавляет сам
       │  Origin: https://frontend  │  браузер добавляет
       │──────────────────────────►│
       │                            │  CORS проверка:
       │                            │  Origin разрешён? ✓
       │                            │  Credentials? ✓
       │  Access-Control-Allow-Origin: https://frontend.example.com
       │  Access-Control-Allow-Credentials: true
       │  Content-Security-Policy: script-src 'self'; ...
       │◄──────────────────────────│

CSP от api.example.com защищает данные в ответе.
CORS контролирует доступ к API.
Session cookie - аутентификация.
HttpOnly - нельзя украсть через XSS.
SameSite=Lax - защита от CSRF.
```

---

## CSRF - Cross-Site Request Forgery

CSRF тесно связан с Cookie и SameSite.

```
Атака CSRF:
  1. Жертва залогинена на bank.com (есть session cookie)
  2. Жертва открывает evil.com
  3. evil.com содержит:
     <img src="https://bank.com/transfer?to=evil&amount=1000">
     или форму которая автоматически отправляется
  4. Браузер делает запрос к bank.com (и ПРИКРЕПЛЯЕТ cookie!)
  5. bank.com выполняет перевод

Защиты:
  SameSite=Strict:
    Cookie не отправляется при cross-site запросах.
    Полная защита от CSRF.
    Минус: ссылка с другого сайта тоже не отправит cookie
    (пользователь разлогинится при переходе по ссылке).

  SameSite=Lax (по умолчанию):
    Cookie отправляется при навигации (GET).
    Cookie НЕ отправляется при POST, img, iframe cross-site.
    Защищает от большинства CSRF атак.

  CSRF Token:
    Сервер генерирует случайный токен, встраивает в форму.
    При отправке формы токен проверяется.
    evil.com не знает токен → не может подделать запрос.

  Double Submit Cookie:
    Cookie + идентичное значение в заголовке/теле.
    Сервер сравнивает cookie и заголовок.
```

---

## Диагностика

```
# Просмотр всех security заголовков
curl -s -I https://example.com | grep -iE \
  "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions"

# Проверить CORS
curl -s -I \
  -H "Origin: https://test.com" \
  -X OPTIONS \
  https://api.example.com/endpoint | grep -i "access-control"

# Проверить cookie атрибуты
curl -c - -s https://example.com | head

# Анализ заголовков безопасности онлайн:
# securityheaders.com - оценка заголовков
# observatory.mozilla.org - Mozilla Observatory
# csp-evaluator.withgoogle.com - анализ CSP
```

---

## Шпаргалка

```
Cookie:
  Set-Cookie: name=value; HttpOnly; Secure; SameSite=Lax; Max-Age=3600
  HttpOnly    - нет доступа из JS (защита от XSS кражи)
  Secure      - только HTTPS
  SameSite=   Strict (строго)/Lax (навигация)/None (всегда, нужен Secure)
  Max-Age=0   - удалить cookie

Session:
  Cookie Session: ID на клиенте, данные на сервере (Redis)
  JWT:           данные в токене (stateless), нужен blacklist для revoke
  Хранение JWT:  HttpOnly Cookie (лучше) > память > localStorage (опасно)
  Регенерировать session_id после логина (fixation защита)

CORS:
  Простые запросы (GET/HEAD/POST simple): только Origin + проверка ответа
  Preflight (PUT/DELETE/custom headers): OPTIONS сначала
  Allow-Origin: *  - нельзя с credentials!
  Allow-Credentials: true - нужен конкретный origin
  Max-Age - кэшировать preflight (меньше OPTIONS запросов)

CSP:
  script-src 'self'          - только свои скрипты
  'unsafe-inline'            - опасно, избегать
  'nonce-XYZ'               - лучший вариант для inline
  'strict-dynamic'           - для SPA (nonce + динамические import)
  object-src 'none'          - всегда
  frame-ancestors 'none'     - запретить iframe (замена X-Frame-Options)
  Report-Only                - тестировать CSP без блокировки

CSRF защита:
  SameSite=Strict/Lax  - основная защита
  CSRF Token           - для форм (double-submit pattern)
  Origin check         - проверять заголовок Origin на сервере

Заголовки безопасности (минимум):
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  Content-Security-Policy: default-src 'self'; ...
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY  (или frame-ancestors 'none' в CSP)
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
```

---

## Ссылки

- [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265) - HTTP State Management Mechanism (Cookie)
- [RFC 6265bis](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis) - Cookie обновлённый (SameSite, Secure prefix)
- [Fetch Spec CORS](https://fetch.spec.whatwg.org/#cors-protocol) - CORS спецификация
- [CSP Level 3](https://www.w3.org/TR/CSP3/) - Content Security Policy Level 3
- [OWASP Session Management](https://owasp.org/www-project-cheat-sheets/cheatsheets/Session_Management_Cheat_Sheet) - сессии
- [OWASP CSRF](https://owasp.org/www-project-cheat-sheets/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet)
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com) - анализ CSP
- [securityheaders.com](https://securityheaders.com) - проверка заголовков
- [jwt.io](https://jwt.io) - декодер JWT
