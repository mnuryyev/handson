---
title: "SMTP, IMAP, POP3 - email протоколы"
date: "2026-05-03"
---

Email работает через три протокола с чёткими ролями. SMTP отправляет письма. IMAP и POP3 доставляют их клиенту. Понимание каждого помогает диагностировать проблемы с почтой, настраивать серверы и разбираться почему письмо попало в спам.

```
Общая схема движения письма:

Отправитель        MTA отправителя      MTA получателя     Получатель
(Outlook/        (mail.sender.com)    (mail.rcpt.com)    (Gmail/
 Thunderbird)          │                    │             Thunderbird)
     │                 │                   │                  │
     │  SMTP (587)     │                   │                  │
     │────────────────►│                   │                  │
     │                 │  SMTP (25)        │                  │
     │                 │──────────────────►│                  │
     │                 │                   │  IMAP/POP3       │
     │                 │                   │◄─────────────────│
     │                 │                   │                  │

MTA = Mail Transfer Agent (почтовый сервер)
MUA = Mail User Agent (почтовый клиент)
MDA = Mail Delivery Agent (доставка в почтовый ящик, напр. Dovecot)
```

---

## SMTP - Simple Mail Transfer Protocol

SMTP (RFC 5321) - протокол для отправки и передачи электронной почты. Работает поверх TCP.

### Порты SMTP

```
Порт 25:   MTA-to-MTA (сервер-сервер). Прямая передача между почтовыми серверами.
           Провайдеры блокируют исходящий 25 у домашних пользователей
           (защита от спама). Нет шифрования по умолчанию (STARTTLS опционально).

Порт 587:  Mail Submission (клиент → сервер). Клиент отправляет письмо
           на свой почтовый сервер. Требует аутентификации (AUTH).
           STARTTLS обязателен. Стандарт для MUA.

Порт 465:  SMTPS (SMTP over TLS, устарел но используется).
           Сразу TLS при подключении (Implicit TLS).
           Gmail и многие провайдеры поддерживают.

Порт 2525: Альтернативный submission (если 587 заблокирован).

Современная рекомендация для клиентов: 587 (STARTTLS) или 465 (Implicit TLS).
```

### SMTP сессия - команды и диалог

```
Клиент (MUA/MTA)                      Сервер (MTA)
  │                                        │
  │◄─── 220 mail.example.com ESMTP ready ──│  приветствие
  │                                        │
  │──── EHLO client.example.com ──────────►│  расширенный HELO
  │◄─── 250-mail.example.com               │
  │◄─── 250-SIZE 52428800                  │  макс. размер письма
  │◄─── 250-STARTTLS                       │  поддержка TLS
  │◄─── 250-AUTH LOGIN PLAIN XOAUTH2       │  методы аутентификации
  │◄─── 250-8BITMIME                       │  8-битные символы
  │◄─── 250 SMTPUTF8                       │  Unicode в адресах
  │                                        │
  │──── STARTTLS ─────────────────────────►│  запросить TLS
  │◄─── 220 Ready to start TLS ────────────│
  │     [TLS handshake]                    │
  │                                        │
  │──── EHLO client.example.com ──────────►│  повторить после TLS
  │◄─── 250-...                            │
  │                                        │
  │──── AUTH PLAIN base64(user:pass) ─────►│  аутентификация
  │◄─── 235 Authentication successful ─────│
  │                                        │
  │──── MAIL FROM:<sender@example.com> ───►│  отправитель (envelope)
  │◄─── 250 OK                             │
  │                                        │
  │──── RCPT TO:<rcpt@gmail.com> ─────────►│  получатель
  │◄─── 250 OK                             │
  │──── RCPT TO:<cc@gmail.com> ───────────►│  ещё получатель (CC)
  │◄─── 250 OK                             │
  │                                        │
  │──── DATA ─────────────────────────────►│  начало тела письма
  │◄─── 354 Start mail input               │
  │──── From: "John" <sender@example.com> ►│
  │──── To: <rcpt@gmail.com>              ►│
  │──── Subject: Hello                    ►│
  │──── Date: Mon, 26 Apr 2024 10:00:00   ►│
  │──── MIME-Version: 1.0                 ►│
  │──── Content-Type: text/plain          ►│
  │────                                   ►│  пустая строка = конец заголовков
  │──── Тело письма...                    ►│
  │──── . ────────────────────────────────►│  одна точка = конец DATA
  │◄─── 250 OK: queued as 1234567890 ──────│  письмо принято в очередь
  │                                        │
  │──── QUIT ─────────────────────────────►│
  │◄─── 221 Bye ───────────────────────────│
```

### Важное: Envelope vs Header

```
В письме есть два разных поля "From":

Envelope From (Return-Path):
  MAIL FROM:<sender@example.com>
  Используется для:
  - Bounce уведомлений (куда вернуть если не доставлено)
  - SPF проверки
  Не обязан совпадать с Header From

Header From:
  From: "John Doe" <john@example.com>
  То что видит пользователь в почтовом клиенте.
  Может отличаться от Envelope From.

Пример рассылки:
  Envelope From: bounce@mailinglist.com   (для bounce обработки)
  Header From:   newsletter@company.com   (что видит получатель)

Именно этот разрыв используют в фишинге:
  Envelope From: legit@example.com
  Header From:   admin@bank.com  ← выглядит как банк!

DMARC проверяет совпадение Header From с доменом SPF/DKIM.
```

### SMTP коды ответов

```
1xx - Информационные (редко используются)

2xx - Успех
  211  System status / help reply
  214  Help message
  220  Service ready (приветствие)
  221  Service closing (QUIT ответ)
  235  Authentication successful
  250  OK (команда выполнена)
  251  User not local, will forward
  354  Start mail input (ответ на DATA)

4xx - Временная ошибка (retry возможен)
  421  Service unavailable (перегрузка, попробуй позже)
  450  Mailbox unavailable (занят, попробуй позже)
  451  Local error in processing
  452  Insufficient storage
  454  TLS not available

5xx - Постоянная ошибка (retry бессмысленен)
  500  Syntax error, command unrecognized
  501  Syntax error in parameters
  502  Command not implemented
  503  Bad sequence of commands
  535  Authentication failed
  550  Mailbox unavailable (не существует, отклонено политикой)
  551  User not local
  552  Storage exceeded
  553  Mailbox name not allowed
  554  Transaction failed (часто: спам, blacklist)
```

```
# Ручной SMTP диалог через telnet
telnet mail.example.com 25
EHLO test.com
MAIL FROM:<test@test.com>
RCPT TO:<user@example.com>
DATA
Subject: Test
.
QUIT

# Через openssl (с TLS, порт 587 или 465)
openssl s_client -connect smtp.gmail.com:587 -starttls smtp
# или
openssl s_client -connect smtp.gmail.com:465

# После TLS:
EHLO test.com
AUTH LOGIN
# base64 username
# base64 password

# Быстрая проверка порта 25
nc -zv mail.example.com 25
telnet mail.example.com 25

# Проверить MX и попробовать подключиться
MX=$(dig MX example.com +short | sort -n | head -1 | awk '{print $2}')
telnet $MX 25
```

### SMTP Extensions (ESMTP)

```
EHLO вместо HELO активирует расширения ESMTP.
Сервер перечисляет что поддерживает.

Расширение      Описание
-----------     --------
STARTTLS        Апгрейд до TLS внутри соединения
SIZE n          Макс. размер сообщения в байтах
AUTH            Аутентификация (LOGIN, PLAIN, CRAM-MD5, XOAUTH2)
8BITMIME        8-битные символы в теле письма
SMTPUTF8        UTF-8 в email адресах (RFC 6531)
PIPELINING      Отправлять несколько команд без ожидания ответа
DSN             Delivery Status Notifications (уведомления о доставке)
CHUNKING        Отправка письма частями (BDAT команда)
BINARYMIME      Бинарные данные без base64
REQUIRETLS      Требовать TLS для передачи (RFC 8689)
```

---

## MIME - формат письма

SMTP передаёт текст. MIME (RFC 2045-2049) добавляет вложения, HTML, изображения.

```
Пример составного письма (multipart):

From: sender@example.com
To: rcpt@example.com
Subject: Hello with attachment
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_Part_1234"

------=_Part_1234
Content-Type: multipart/alternative; boundary="----=_Alt_5678"

------=_Alt_5678
Content-Type: text/plain; charset=UTF-8

Текст письма для клиентов без HTML.

------=_Alt_5678
Content-Type: text/html; charset=UTF-8

<html><body><p>HTML версия письма.</p></body></html>

------=_Alt_5678--

------=_Part_1234
Content-Type: application/pdf; name="document.pdf"
Content-Disposition: attachment; filename="document.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK...base64 данные...

------=_Part_1234--
```

```
Content-Type иерархия:
  multipart/mixed        - текст + вложения
  multipart/alternative  - несколько версий (plain + html)
  multipart/related      - HTML + встроенные изображения
  multipart/signed       - подписанное письмо (S/MIME)
  multipart/encrypted    - зашифрованное письмо

Content-Transfer-Encoding:
  7bit      - только ASCII (по умолчанию)
  8bit      - 8-битные символы (если сервер поддерживает 8BITMIME)
  base64    - бинарные данные, вложения
  quoted-printable - текст с не-ASCII символами (UTF-8 кириллица)
```

---

## POP3 - Post Office Protocol v3

POP3 (RFC 1939) - простой протокол для скачивания писем с сервера. Традиционная модель: скачал → удалил с сервера.

### Порты POP3

```
Порт 110:  POP3 (без шифрования / STARTTLS)
Порт 995:  POP3S (POP3 over TLS, Implicit TLS)
```

### POP3 сессия

```
Клиент                              Сервер
  │                                    │
  │◄─── +OK POP3 server ready ─────────│
  │                                    │
  │──── USER john@example.com ────────►│
  │◄─── +OK ───────────────────────────│
  │──── PASS mypassword ──────────────►│
  │◄─── +OK Logged in ─────────────────│
  │                                    │
  │──── STAT ─────────────────────────►│  сколько писем
  │◄─── +OK 3 2948 ────────────────────│  3 письма, 2948 байт
  │                                    │
  │──── LIST ─────────────────────────►│  список с размерами
  │◄─── +OK 3 messages                 │
  │◄─── 1 1024                         │  письмо 1: 1024 байт
  │◄─── 2 512                          │
  │◄─── 3 1412                         │
  │◄─── .                              │  конец списка
  │                                    │
  │──── RETR 1 ───────────────────────►│  получить письмо 1
  │◄─── +OK 1024 octets                │
  │◄─── [содержимое письма]            │
  │◄─── . ─────────────────────────────│
  │                                    │
  │──── DELE 1 ───────────────────────►│  пометить на удаление
  │◄─── +OK                            │
  │                                    │
  │──── QUIT ─────────────────────────►│  выйти (удаление применяется)
  │◄─── +OK Bye ───────────────────────│
```

### Команды POP3

```
Аутентификация:
  USER name      - имя пользователя
  PASS password  - пароль (в открытом виде! использовать TLS)
  APOP           - MD5 аутентификация (устарел)
  AUTH           - SASL аутентификация

Работа с письмами:
  STAT           - количество и общий размер
  LIST [n]       - список писем (или конкретного)
  RETR n         - получить письмо номер n
  DELE n         - пометить на удаление
  RSET           - отменить все DELE
  TOP n lines    - получить заголовки + первые lines строк
  UIDL [n]       - уникальный ID письма (для синхронизации)
  NOOP           - keepalive, ничего не делает
  QUIT           - выйти (применить DELE)
```

### POP3 vs IMAP

```
                POP3                    IMAP
                ----                    ----
Модель          Скачать и удалить       Работа на сервере
Несколько устр. Плохо (только один)     Отлично (синхронизация)
Папки           Нет                     Да (создание, управление)
Поиск           На клиенте (локально)   На сервере (быстро)
Частичная загр. Нет (только TOP)        Да (заголовки, части)
Offline режим   Да (всё локально)       Частично (кэш)
Состояние       На клиенте              На сервере
Хранение        Клиент (диск)           Сервер
Используй если  Один клиент, экономия   Несколько устройств
                места на сервере        (телефон + ПК)
```

---

## IMAP - Internet Message Access Protocol

IMAP (RFC 3501, IMAPv4) - полнофункциональный протокол для работы с почтой. Письма хранятся на сервере, клиент синхронизируется.

### Порты IMAP

```
Порт 143:  IMAP (без шифрования / STARTTLS)
Порт 993:  IMAPS (IMAP over TLS, Implicit TLS)
```

### IMAP сессия

```
Клиент                                    Сервер
  │                                          │
  │◄─── * OK IMAP server ready ──────────────│  untagged response
  │                                          │
  │──── A001 CAPABILITY ────────────────────►│
  │◄─── * CAPABILITY IMAP4rev1 STARTTLS      │
  │         IDLE NAMESPACE MOVE LITERAL+     │
  │◄─── A001 OK                              │
  │                                          │
  │──── A002 STARTTLS ──────────────────────►│
  │◄─── A002 OK Begin TLS                    │
  │     [TLS handshake]                      │
  │                                          │
  │──── A003 LOGIN user@ex.com password ────►│
  │◄─── A003 OK Logged in                    │
  │                                          │
  │──── A004 LIST "" "*" ───────────────────►│  список папок
  │◄─── * LIST (\HasNoChildren) "/" INBOX    │
  │◄─── * LIST (\HasNoChildren) "/" Sent     │
  │◄─── * LIST (\HasNoChildren) "/" Trash    │
  │◄─── A004 OK List completed               │
  │                                          │
  │──── A005 SELECT INBOX ─────────────────►│  открыть папку
  │◄─── * 42 EXISTS                          │  42 письма
  │◄─── * 3 RECENT                           │  3 новых
  │◄─── * OK [UNSEEN 40]                     │  первое непрочитанное
  │◄─── * OK [UIDVALIDITY 1234567890]        │  ID для синхронизации
  │◄─── * OK [UIDNEXT 43]                    │  следующий UID
  │◄─── * FLAGS (\Answered \Flagged          │
  │              \Deleted \Seen \Draft)      │
  │◄─── A005 OK SELECT completed             │
  │                                          │
  │──── A006 FETCH 1:5 (FLAGS ENVELOPE) ───►│  заголовки писем 1-5
  │◄─── * 1 FETCH (FLAGS (\Seen)             │
  │      ENVELOPE ("Mon, 26 Apr" "Subject"   │
  │      (("John" NIL "john" "ex.com"))...)) │
  │◄─── ...                                  │
  │◄─── A006 OK Fetch completed              │
  │                                          │
  │──── A007 FETCH 1 BODY[] ───────────────►│  полное письмо 1
  │◄─── * 1 FETCH (BODY[] {1024}            │
  │◄─── [содержимое письма]                  │
  │◄─── A007 OK Fetch completed              │
  │                                          │
  │──── A008 STORE 1 +FLAGS (\Seen) ───────►│  пометить как прочитанное
  │◄─── * 1 FETCH (FLAGS (\Seen))            │
  │◄─── A008 OK Store completed              │
  │                                          │
  │──── A009 IDLE ─────────────────────────►│  ждать новых писем
  │◄─── + idling                             │
  │◄─── * 43 EXISTS                          │  новое письмо пришло!
  │──── DONE ──────────────────────────────►│  выйти из IDLE
  │◄─── A009 OK IDLE terminated              │
  │                                          │
  │──── A010 LOGOUT ───────────────────────►│
  │◄─── * BYE IMAP server logging out        │
  │◄─── A010 OK Logout completed             │
```

### IMAP теги и типы ответов

```
Все IMAP команды имеют тег (A001, A002...).
Ответ с тем же тегом = завершение команды.

Типы ответов:
  A001 OK     - команда выполнена успешно
  A001 NO     - команда отклонена (нет прав, не найдено)
  A001 BAD    - синтаксическая ошибка
  * (untagged) - данные или уведомления сервера
  + (continue) - сервер ждёт продолжения (IDLE, APPEND)
```

### IMAP команды

```
Подключение и состояние:
  CAPABILITY     - список возможностей сервера
  STARTTLS       - апгрейд до TLS
  LOGIN / AUTHENTICATE - аутентификация
  LOGOUT         - выйти

Работа с папками (mailboxes):
  LIST           - список папок
  LSUB           - список подписанных папок
  SELECT         - открыть папку (read-write)
  EXAMINE        - открыть папку (read-only)
  CREATE         - создать папку
  DELETE         - удалить папку
  RENAME         - переименовать папку
  SUBSCRIBE/UNSUBSCRIBE - подписка на папку
  STATUS         - статистика папки (без SELECT)
  NAMESPACE      - пространства имён (INBOX, Personal...)

Работа с письмами:
  FETCH          - получить письма или части
  STORE          - изменить флаги письма
  COPY           - скопировать письма в другую папку
  MOVE           - переместить (расширение, RFC 6851)
  EXPUNGE        - физически удалить помеченные (Deleted)
  APPEND         - добавить письмо в папку
  SEARCH         - поиск писем по критериям
  SORT           - сортировка (расширение)

Push уведомления:
  IDLE           - ждать новых писем (push вместо polling)
  NOTIFY         - расширенные уведомления (RFC 5465)

Синхронизация:
  UID команды    - использовать постоянные UID вместо порядковых номеров
  CONDSTORE      - оптимизированная синхронизация по MODSEQ
  QRESYNC        - быстрая resync после переподключения
```

### IMAP FETCH - части письма

```
Можно загружать только нужные части, не всё письмо:

FETCH n ENVELOPE            - только заголовки (тема, от, кому, дата)
FETCH n FLAGS               - только флаги (\Seen, \Answered...)
FETCH n BODY[HEADER]        - заголовки письма
FETCH n BODY[TEXT]          - только тело
FETCH n BODY[]              - всё письмо
FETCH n BODY[1]             - первая часть MIME
FETCH n BODY[1.TEXT]        - текстовая часть первой части
FETCH n BODY[2]             - вторая часть MIME (например вложение)
FETCH n RFC822.SIZE         - только размер
FETCH n BODYSTRUCTURE       - MIME структура без скачивания

Пример экономной загрузки:
  Сначала FETCH ENVELOPE (список писем с темами)
  Потом FETCH BODY[] только для писем которые открыл
```

### IMAP SEARCH

```
SEARCH UNSEEN               - непрочитанные
SEARCH FROM "john"          - от john
SEARCH SUBJECT "invoice"    - с "invoice" в теме
SEARCH SINCE 26-Apr-2024    - после даты
SEARCH BEFORE 26-Apr-2024   - до даты
SEARCH LARGER 1000000       - больше 1MB
SEARCH SMALLER 1000         - меньше 1KB
SEARCH TEXT "hello"         - текст в теле
SEARCH HEADER X-Spam-Flag YES  - конкретный заголовок
SEARCH ALL                  - все письма
SEARCH NEW                  - новые (RECENT + UNSEEN)
SEARCH ANSWERED             - на которые ответили
SEARCH DELETED              - помеченные на удаление

# Комбинирование:
SEARCH UNSEEN FROM "boss"   - непрочитанные от boss
SEARCH OR FROM "a" FROM "b" - от a ИЛИ от b
SEARCH NOT SEEN             - непрочитанные
```

### IMAP флаги

```
Системные флаги (\ обязателен):
  \Seen       - прочитано
  \Answered   - ответ отправлен
  \Flagged    - отмечено (звёздочка в клиенте)
  \Deleted    - помечено на удаление (EXPUNGE удаляет)
  \Draft      - черновик
  \Recent     - новое с последней сессии (только сервер ставит)

Пользовательские флаги (ключевые слова):
  $Forwarded  - переслано
  $Phishing   - фишинг (некоторые клиенты)
  $Junk       - спам
  $NotJunk    - не спам

Работа с флагами (STORE):
  +FLAGS (\Seen)       - добавить флаг
  -FLAGS (\Seen)       - убрать флаг
  FLAGS (\Seen)        - установить именно эти флаги (заменить)
```

---

## Email аутентификация - SPF, DKIM, DMARC

Эти механизмы работают поверх DNS и защищают от подделки отправителя.

### SPF (Sender Policy Framework)

```
SPF - DNS TXT запись, перечисляющая IP адреса которые могут
отправлять почту от имени домена.

Запись:
  example.com. IN TXT "v=spf1 ip4:1.2.3.4 include:_spf.google.com -all"

Проверка получателем:
  1. Взять Envelope From (MAIL FROM) домен: example.com
  2. Запросить DNS TXT: example.com → SPF запись
  3. Проверить IP отправителя в SPF
  4. Результат: Pass / Fail / SoftFail / Neutral / None

Qualifier в конце (all):
  +all = всем разрешено (бессмысленно)
  ~all = SoftFail (не блокировать, но пометить как подозрительное)
  -all = Fail (отклонить письма с неизвестных IP)
  ?all = Neutral (без мнения)

Ограничение SPF:
  Проверяет Envelope From (не Header From).
  Не защищает при пересылке (forwarding ломает SPF).
  Max 10 DNS lookups в SPF (иначе PermerError).
```

```
# Проверить SPF запись домена
dig TXT example.com | grep spf
dig TXT gmail.com | grep spf

# Проверить SPF для конкретного IP
# (mxtoolbox.com/spf.aspx или командой:)
# install spf-tools:
python3 -m spf 1.2.3.4 sender@example.com example.com
```

### DKIM (DomainKeys Identified Mail)

```
DKIM - цифровая подпись письма. Гарантирует что письмо не изменено
в пути и отправлено с домена владеющего приватным ключом.

Как работает:
  1. Отправляющий сервер подписывает заголовки + тело RSA/Ed25519.
  2. Подпись помещается в заголовок DKIM-Signature.
  3. Публичный ключ хранится в DNS TXT:
     selector._domainkey.example.com → публичный ключ

  4. Получатель:
     - Берёт selector из DKIM-Signature заголовка
     - Запрашивает публичный ключ из DNS
     - Верифицирует подпись

Заголовок DKIM-Signature:
  DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
    d=example.com;       ← домен (должен совпадать с Header From)
    s=selector1;         ← selector (имя ключа)
    h=from:to:subject:date:message-id;  ← подписанные заголовки
    bh=base64(хэш тела);
    b=base64(подпись заголовков);

Canonicalization (c=):
  relaxed/relaxed  - нормализация пробелов (устойчив к пересылке)
  simple/simple    - строгий (ломается если что-то изменено)
```

```
# Проверить DKIM запись
# selector можно найти в заголовке DKIM-Signature входящего письма
dig TXT selector1._domainkey.example.com

# Онлайн проверка:
# mxtoolbox.com/dkim.aspx
# mail-tester.com (отправь письмо и получи отчёт)
```

### DMARC (Domain-based Message Authentication, Reporting & Conformance)

```
DMARC объединяет SPF и DKIM и задаёт политику что делать с письмами
которые не прошли проверку.

DNS TXT запись _dmarc.example.com:
  "v=DMARC1; p=reject; rua=mailto:dmarc@example.com;
   ruf=mailto:forensics@example.com; pct=100; adkim=s; aspf=s"

Параметры:
  p=        политика (none / quarantine / reject)
  sp=       политика для поддоменов (если отличается)
  rua=      куда слать aggregate отчёты (XML, ежедневно)
  ruf=      куда слать forensic отчёты (каждое нарушение)
  pct=      процент писем к которым применять политику (1-100)
  adkim=    строгость DKIM (s=strict, r=relaxed)
  aspf=     строгость SPF (s=strict, r=relaxed)

Выравнивание (alignment):
  relaxed: домен DKIM/SPF должен совпадать с Header From доменом
           ИЛИ быть его поддоменом.
  strict:  должен совпадать точно.

Политики:
  none:        мониторинг (отчёты приходят, ничего не блокируется)
  quarantine:  письма в спам
  reject:      отклонить письмо (не доставлять)

Рекомендуемый путь внедрения:
  1. p=none + rua= (собираем статистику, ничего не блокируем)
  2. Анализируем отчёты, исправляем легитимные источники
  3. p=quarantine pct=25 (начинаем с 25%)
  4. p=quarantine pct=100
  5. p=reject pct=100
```

```
# Проверить DMARC запись
dig TXT _dmarc.example.com
dig TXT _dmarc.gmail.com +short

# Полная проверка email аутентификации домена
# Онлайн: mxtoolbox.com/emailhealth/
# Онлайн: dmarcian.com/dmarc-inspector/

# Анализ DMARC отчётов
# Сервисы: dmarcian.com, valimail.com, postmarkapp.com/dmarc
```

---

## Заголовки письма - диагностика

```
Путь письма записывается в Received заголовках.
Читать снизу вверх (последний добавленный - сверху).

Received: from client.example.com (client.example.com [1.2.3.4])
        by mail.example.com with ESMTPS id abc123
        for <rcpt@gmail.com>; Mon, 26 Apr 2024 10:00:00 +0000

Received: from mail.example.com (mail.example.com [5.6.7.8])
        by mx.google.com with ESMTPS id xyz789
        for <rcpt@gmail.com>; Mon, 26 Apr 2024 10:00:05 +0000

Читаем снизу вверх:
  1. client.example.com → mail.example.com (отправка клиентом)
  2. mail.example.com → mx.google.com (MTA-to-MTA)

Другие важные заголовки:
  Return-Path:    Envelope From (bounce адрес)
  Message-ID:     Уникальный ID письма (генерируется отправителем)
  X-Spam-Score:   Оценка спама (SpamAssassin)
  X-Spam-Status:  Статус спам-фильтра
  Authentication-Results: Результаты SPF/DKIM/DMARC
  DKIM-Signature: Цифровая подпись
  X-Mailer:       Почтовый клиент отправителя
  X-Forwarded-To: Если письмо было переслано
```

```
# Посмотреть заголовки письма
# В Gmail: ⋮ → Показать оригинал
# В Outlook: Файл → Свойства
# В Thunderbird: Вид → Заголовки → Все

# Анализ заголовков онлайн:
# mxtoolbox.com/EmailHeaders.aspx
# toolbox.googleapps.com/apps/messageheader/
# MxToolbox Email Header Analyzer
```

---

## Диагностика email проблем

### Письмо не доставлено

```
Шаг 1 - проверить MX записи
  dig MX example.com
  dig MX example.com +short

Шаг 2 - подключиться к MX серверу вручную
  MX=$(dig MX example.com +short | sort -n | awk 'NR==1{print $2}')
  telnet $MX 25
  EHLO test.com
  # Смотрим что ответит сервер

Шаг 3 - проверить не в блэклисте ли IP
  # Онлайн: mxtoolbox.com/blacklists.aspx
  # Команда:
  IP="1.2.3.4"
  for bl in zen.spamhaus.org bl.spamcop.net b.barracudacentral.org; do
    result=$(dig +short ${IP%.*}.${IP##*.*.}.$(echo $IP | awk -F. '{print $2"."$1}').$bl)
    [ -n "$result" ] && echo "BLACKLISTED: $bl ($result)"
  done

Шаг 4 - проверить SPF/DKIM/DMARC
  dig TXT домен | grep spf
  dig TXT _dmarc.домен
  # Онлайн: mail-tester.com (отправить тестовое письмо)

Шаг 5 - проверить логи SMTP сервера
  # Postfix:
  tail -f /var/log/mail.log
  grep "status=" /var/log/mail.log | tail -20

  # Exim:
  tail -f /var/log/exim4/mainlog

  # Найти конкретное письмо:
  grep "rcpt@gmail.com" /var/log/mail.log | tail -10
```

### Письмо попадает в спам

```
Основные причины:
  1. Нет PTR записи (обратный DNS для IP сервера)
  2. Нет или неверный SPF
  3. Нет DKIM подписи
  4. Нет DMARC
  5. IP в блэклисте
  6. Низкий domain reputation (молодой домен)
  7. Подозрительный контент (слова, ссылки)
  8. Нет List-Unsubscribe заголовка (рассылки)
  9. Высокий bounce rate
  10. Жалобы на спам от получателей

Проверки:
  # Полная диагностика отправляющего домена
  # mail-tester.com - отправь письмо и получи оценку
  # mxtoolbox.com/emailhealth/ - проверка всех параметров

  # Проверить PTR запись
  dig -x 1.2.3.4 +short  # должен вернуть hostname
  # PTR должен совпадать с HELO/EHLO именем

  # Проверить blacklist
  # mxtoolbox.com/blacklists.aspx

  # Тест deliverability
  # glockapps.com
  # senderscore.org (репутация IP)
  # postmaster.google.com (если жалобы на Gmail)
```

### SMTP ошибки и их смысл

```
421 Service temporarily unavailable
  → Сервер перегружен. Повторить через несколько минут.
  → MTA добавит в очередь и повторит автоматически.

450 Requested mail action not taken
  → Временная ошибка, почтовый ящик занят.

451 Requested action aborted: local error
  → Внутренняя ошибка сервера. Повторить позже.

452 Too many emails sent or too many recipients
  → Превышен лимит. Повторить позже.

550 No such user here / User unknown
  → Адрес получателя не существует. Не повторять.

550 Message rejected as spam
  → Письмо расценено как спам. Проверить SPF/DKIM/DMARC/blacklist.

551 User not local; please try forwarding
  → Получатель не на этом сервере, нет форвардинга.

552 Message too large
  → Письмо превышает лимит SIZE. Уменьшить или разбить.

553 Mailbox name invalid
  → Неверный формат адреса получателя.

554 Relay access denied
  → Сервер не передаёт письма для данного домена.
  → При отправке через чужой сервер без аутентификации.
  → Или IP в блэклисте.
```

---

## Настройка Postfix (основы)

```
# /etc/postfix/main.cf - основные настройки

myhostname = mail.example.com      # FQDN почтового сервера
mydomain = example.com             # домен
myorigin = $mydomain               # From домен для локальной почты
inet_interfaces = all              # слушать на всех интерфейсах
inet_protocols = all               # IPv4 и IPv6

# Кто может отправлять без аутентификации (только localhost)
mynetworks = 127.0.0.0/8 [::1]/128

# Куда доставлять локально
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain

# TLS для входящих (MTA-to-MTA)
smtpd_tls_cert_file = /etc/ssl/certs/mail.crt
smtpd_tls_key_file = /etc/ssl/private/mail.key
smtpd_tls_security_level = may        # предлагать TLS, но не требовать
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# TLS для исходящих
smtp_tls_security_level = may          # использовать TLS если доступен
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# Аутентификация (SASL через Dovecot)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination

# Лимиты
message_size_limit = 52428800      # 50 MB макс. размер письма
mailbox_size_limit = 0             # без лимита почтового ящика
```

```
# Управление Postfix
postfix start / stop / reload / status
postfix check           # проверить конфигурацию
postfix flush           # немедленно отправить очередь

# Очередь
mailq                   # посмотреть очередь
postqueue -p            # то же самое
postqueue -f            # попробовать отправить все из очереди
postsuper -d ALL        # удалить все из очереди (осторожно!)
postsuper -d QUEUEID    # удалить конкретное письмо

# Логи
tail -f /var/log/mail.log
tail -f /var/log/mail.err
postcat -q QUEUEID      # посмотреть письмо в очереди
```

---

## Шпаргалка

```
Порты:
  25   - SMTP MTA-to-MTA (часто блокируется провайдерами)
  465  - SMTPS (TLS сразу, для клиентов)
  587  - SMTP Submission (STARTTLS, для клиентов)
  110  - POP3
  995  - POP3S (TLS)
  143  - IMAP
  993  - IMAPS (TLS)

SMTP команды:
  EHLO     - представиться (ESMTP)
  STARTTLS - запросить TLS
  AUTH     - аутентификация
  MAIL FROM - отправитель (envelope)
  RCPT TO  - получатель
  DATA     - начать тело письма (конец = строка с одной точкой)
  QUIT     - завершить сессию

POP3 команды:
  USER / PASS  - аутентификация
  STAT         - количество писем
  LIST         - список с размерами
  RETR n       - скачать письмо
  DELE n       - пометить на удаление
  QUIT         - применить удаления и выйти

IMAP команды:
  LOGIN          - аутентификация
  LIST "" "*"    - список папок
  SELECT INBOX   - открыть папку
  FETCH n BODY[] - скачать письмо
  STORE n +FLAGS (\Seen) - пометить прочитанным
  IDLE           - push уведомления о новых письмах
  LOGOUT         - выйти

Email аутентификация:
  SPF   - какие IP могут слать от имени домена (DNS TXT)
  DKIM  - цифровая подпись письма (DNS TXT + заголовок)
  DMARC - политика + отчёты (DNS TXT _dmarc.домен)

Диагностика:
  dig MX example.com               - MX записи
  telnet mail.example.com 25       - ручной SMTP
  openssl s_client -connect host:587 -starttls smtp
  dig TXT example.com | grep spf  - SPF запись
  dig TXT _dmarc.example.com      - DMARC запись
  tail -f /var/log/mail.log        - логи Postfix
  mailq                            - очередь отправки
  mxtoolbox.com                    - онлайн диагностика
  mail-tester.com                  - тест deliverability
```

---

## Ссылки

- [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321) - SMTP
- [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322) - Internet Message Format (заголовки письма)
- [RFC 1939](https://www.rfc-editor.org/rfc/rfc1939) - POP3
- [RFC 3501](https://www.rfc-editor.org/rfc/rfc3501) - IMAP4rev1
- [RFC 9051](https://www.rfc-editor.org/rfc/rfc9051) - IMAP4rev2 (2021, актуальный)
- [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208) - SPF
- [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376) - DKIM
- [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) - DMARC
- [RFC 2045-2049](https://www.rfc-editor.org/rfc/rfc2045) - MIME
- [mxtoolbox.com](https://mxtoolbox.com) - комплексная диагностика email
- [mail-tester.com](https://www.mail-tester.com) - тест deliverability
- [postmaster.google.com](https://postmaster.google.com) - статистика доставки в Gmail
