---
title: "FTP, FTPS, SFTP - различия и уязвимости"
date: "2026-05-03"
---

Три протокола для передачи файлов с похожими названиями, но принципиально разной архитектурой. FTP (1971) - классика без шифрования. FTPS - FTP + TLS. SFTP - подсистема SSH, никакого отношения к FTP не имеет. Знание различий критично: выбор неправильного протокола означает передачу учётных данных и данных в открытом виде.

---

## FTP - File Transfer Protocol

### История и основы

```
FTP (RFC 959, 1985 - основной; RFC 354, 1972 — оригинал).
Один из старейших протоколов интернета.
Разработан для передачи файлов между хостами в ARPANET.

Особенности дизайна:
  - Разработан в эпоху до интернет-безопасности.
  - Нет шифрования: всё в открытом виде (логин, пароль, данные).
  - Два отдельных TCP соединения: управляющее и данных.
  - Поддержка бинарного и ASCII режима передачи.

Порты:
  TCP 21 — командный канал (control connection)
  TCP 20 — канал данных в активном режиме (data connection)
  Случайный порт > 1024 - канал данных в пассивном режиме
```

### Два канала FTP

```
Принципиальная особенность FTP: два отдельных TCP соединения.

Командный канал (Control Connection):
  - Порт 21 на сервере
  - Открывается клиентом при подключении
  - Остаётся открытым всю сессию
  - Передаёт команды (LIST, RETR, STOR...) и ответы (150, 200, 550...)
  - Текстовый протокол (читаемые команды)

Канал данных (Data Connection):
  - Создаётся заново для каждой операции с файлами или листинга
  - Закрывается после завершения передачи
  - Передаёт реальные данные (содержимое файлов, списки директорий)
  - В ASCII режиме: перевод строк (\r\n ↔ \n)
  - В Binary (IMAGE) режиме: байт в байт

Разделение каналов — причина многих проблем с NAT и файрволлами.
```

### Активный режим (Active Mode, PORT)

```
В активном режиме сервер инициирует канал данных к клиенту.

Клиент (192.168.1.10)          Сервер (1.2.3.4)
  │                                    │
  │── TCP SYN → 1.2.3.4:21 ──────────►│  (клиент подключается на 21)
  │◄── TCP SYN-ACK ────────────────────│
  │── Login, команды ─────────────────►│
  │◄── 220, 230, ... ──────────────────│
  │                                    │
  │── PORT 192,168,1,10,195,210 ──────►│  клиент говорит: "Подключись
  │   (говорит свой IP:port)           │   ко мне на 192.168.1.10:50130"
  │◄── 200 PORT command successful ────│
  │                                    │
  │── LIST ───────────────────────────►│
  │◄── 150 Opening data connection ────│
  │                                    │
  │   Сервер → TCP SYN на порт 50130   │
  │◄── TCP SYN (from 1.2.3.4:20) ──────│  (сервер подключается к клиенту!)
  │── TCP SYN-ACK ─────────────────────►│
  │                                    │
  │◄══ данные директории ═══════════════│  данные через новое соединение
  │◄── 226 Transfer complete ──────────│

Проблема активного режима:
  Сервер инициирует соединение К клиенту.
  Файрвол/NAT клиента блокирует входящие соединения.
  Результат: активный режим часто не работает за NAT.
```

### Пассивный режим (Passive Mode, PASV)

```
В пассивном режиме клиент инициирует оба соединения.

Клиент (192.168.1.10)          Сервер (1.2.3.4)
  │                                    │
  │── PASV ───────────────────────────►│  клиент запрашивает пассивный режим
  │◄── 227 Entering Passive Mode       │
  │    (1,2,3,4,195,150)  ─────────────│  сервер сообщает IP:port для данных
  │                                    │  IP: 1.2.3.4, Port: 195*256+150=50070
  │                                    │
  │── LIST ───────────────────────────►│
  │◄── 150 Opening data connection ────│
  │                                    │
  │── TCP SYN → 1.2.3.4:50070 ────────►│  (клиент подключается к серверу!)
  │◄── TCP SYN-ACK ────────────────────│
  │                                    │
  │◄══ данные директории ═══════════════│
  │◄── 226 Transfer complete ──────────│

Преимущество: клиент инициирует оба соединения.
Файрвол клиента пропускает исходящие → пассивный режим работает за NAT.

EPSV (Extended Passive Mode, RFC 2428):
  Для IPv6 и больших номеров портов.
  Ответ: 229 Entering Extended Passive Mode (|||50070|)
  Только порт, без IP (клиент использует уже известный IP сервера).
```

### FTP команды

```
Аутентификация:
  USER username    - отправить имя пользователя
  PASS password    - отправить пароль (ОТКРЫТЫЙ ТЕКСТ!)
  QUIT             - завершить сессию

Навигация:
  PWD              - текущая директория
  CWD directory    - сменить директорию
  CDUP             - перейти на уровень выше (..)
  MKD directory    - создать директорию
  RMD directory    - удалить директорию

Листинг:
  LIST             - список файлов (с деталями, как ls -l)
  NLST             - только имена файлов
  MLSD             - машиночитаемый листинг (RFC 3659)
  STAT             - статус сервера или файла

Передача файлов:
  RETR filename    - скачать файл (retrieve)
  STOR filename    - загрузить файл (store)
  STOU             - загрузить с уникальным именем
  APPE filename    - добавить к файлу (append)
  DELE filename    - удалить файл
  RNFR old_name   - переименовать (from)
  RNTO new_name   - переименовать (to)
  SIZE filename    - размер файла

Режим передачи:
  TYPE A           - ASCII режим (перевод строк)
  TYPE I           - Binary/Image режим (бинарный, по умолчанию для файлов)
  MODE S           - Stream mode (стандартный)

Соединение данных:
  PORT h1,h2,h3,h4,p1,p2  - активный режим (IP и порт клиента)
  PASV             - пассивный режим
  EPSV             - расширенный пассивный (IPv6)
  EPRT             - расширенный активный (IPv6)

Прочее:
  SYST             - тип системы сервера
  FEAT             - поддерживаемые расширения
  NOOP             - пустая команда (keepalive)
  ABOR             - прервать текущую передачу
  REST offset      - возобновить с позиции (для докачки)
```

### FTP коды ответов

```
1xx — предварительный положительный ответ:
  125 Data connection already open; transfer starting
  150 File status okay; about to open data connection

2xx — завершённый положительный ответ:
  200 Command okay
  220 Service ready for new user (приветствие сервера)
  221 Service closing control connection (QUIT)
  226 Closing data connection (передача завершена)
  227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
  229 Entering Extended Passive Mode
  230 User logged in, proceed
  250 Requested file action okay, completed

3xx — промежуточный ответ (нужно ещё действие):
  331 User name okay, need password
  350 Requested file action pending further information (REST)

4xx — временная ошибка:
  421 Service not available, closing control connection
  425 Can't open data connection
  426 Connection closed; transfer aborted
  450 Requested file action not taken (файл занят)
  451 Requested action aborted: local error in processing

5xx — постоянная ошибка:
  500 Syntax error, command unrecognized
  501 Syntax error in parameters or arguments
  502 Command not implemented
  503 Bad sequence of commands
  530 Not logged in (аутентификация не прошла)
  550 Requested action not taken (файл не найден, нет прав)
  553 Requested action not taken (неверное имя файла)
```

---

## FTPS - FTP over TLS

### Что такое FTPS

```
FTPS (RFC 4217) — FTP с добавлением TLS шифрования.
НЕ новый протокол — это FTP + TLS обёртка.
Сохраняет архитектуру FTP (два канала).
Добавляет шифрование команд и данных.

Два варианта FTPS:

FTPS Explicit (FTPS/E, AUTH TLS):
  Клиент подключается на стандартный порт 21.
  Явно запрашивает шифрование командой AUTH TLS.
  Сервер принимает — переходят на TLS.
  После TLS: нормальные FTP команды через шифрованный канал.
  Можно начать без шифрования и апгрейднуться.
  Порт: 21 (как обычный FTP).

FTPS Implicit (FTPIS):
  Шифрование с первого байта — TLS handshake сразу.
  Клиент подключается на порт 990.
  Нет возможности работать без TLS.
  Устаревший, многие клиенты не поддерживают.
  Порт: 990 (данные: 989).
```

### FTPS Explicit - процесс соединения

```
Клиент                              Сервер (порт 21)
  │── TCP SYN → порт 21 ────────────►│
  │◄── 220 FTP Server Ready ──────────│  (приветствие, без TLS)
  │                                   │
  │── AUTH TLS ─────────────────────►│  запросить TLS
  │◄── 234 AUTH TLS OK ───────────────│  сервер согласен
  │                                   │
  │══ TLS Handshake ════════════════════│  устанавливаем TLS
  │   (ClientHello, ServerHello,       │
  │    Certificate, Finished...)       │
  │                                   │
  │── USER username ────────────────►│  теперь всё зашифровано!
  │◄── 331 Password required ─────────│
  │── PASS password ────────────────►│  пароль зашифрован!
  │◄── 230 User logged in ─────────────│
  │                                   │
  │── PBSZ 0 ───────────────────────►│  Protection Buffer Size = 0
  │◄── 200 PBSZ=0 ────────────────────│
  │── PROT P ───────────────────────►│  канал данных тоже шифровать!
  │◄── 200 Protection level set to P ─│
  │                                   │
  │── PASV / EPSV ──────────────────►│
  │◄── 227 Entering Passive Mode... ──│
  │                                   │
  │── RETR file.txt ────────────────►│
  │◄── 150 Opening TLS data... ───────│
  │                                   │
  │══ TLS Handshake (data channel) ════│  отдельный TLS для данных!
  │◄══ зашифрованные данные файла ═════│
  │◄── 226 Transfer complete ─────────│

PBSZ и PROT команды:
  PBSZ 0 — Protection Buffer Size (размер 0 для TLS streaming)
  PROT C — Clear (данные НЕ шифруются, только команды)
  PROT P — Private (данные шифруются TLS)
  PROT E — Confidential (только шифрование, без integrity, устарел)
  PROT S — Safe (только integrity, без шифрования, устарел)
  
  Без PROT P → данные идут в открытом виде даже если команды зашифрованы!
```

### FTPS и NAT/Файрвол - главная проблема

```
FTPS наследует проблемы FTP с двумя каналами, плюс добавляет новые.

Проблема 1: файрвол не может инспектировать канал данных
  В обычном FTP: файрвол видит PASV ответ (IP:port) и открывает правило.
  В FTPS: канал команд зашифрован → файрвол не видит PASV ответ.
  → Файрвол не знает какой порт открыть для данных.
  → Канал данных блокируется.

Решения:
  1. Настроить FTPS сервер использовать фиксированный диапазон портов.
     Открыть этот диапазон на файрволе статически.
     
     vsftpd пример:
       pasv_min_port=50000
       pasv_max_port=50100
     
     Файрвол: разрешить TCP 50000-50100 входящие.

  2. Использовать SFTP вместо FTPS (нет проблемы двух каналов).

Проблема 2: несоответствие IP в PASV
  Сервер за NAT сообщает внутренний IP в PASV ответе.
  Клиент пытается подключиться к внутреннему IP → не работает.
  
  Решение vsftpd:
    pasv_address=1.2.3.4  (реальный внешний IP)
    pasv_addr_resolve=YES (если имя, а не IP)

Проблема 3: ALG (Application Layer Gateway)
  Некоторые маршрутизаторы имеют FTP ALG который "помогает" FTP через NAT.
  FTP ALG не понимает FTPS (зашифровано) → может ломать соединение.
  Отключить FTP ALG если используется FTPS.
```

---

## SFTP - SSH File Transfer Protocol

### Что такое SFTP

```
SFTP (SSH File Transfer Protocol, RFC draft) — НЕ FTP!
Это подсистема SSH для передачи файлов.
Разработан OpenSSH/IETF как часть SSH-2 протокола.

Ключевые отличия от FTP/FTPS:
  - Одно TCP соединение (нет разделения на командный и данных канал)
  - Всё шифруется SSH (нет отдельного TLS)
  - Работает поверх SSH туннеля (порт 22)
  - Бинарный протокол (не текстовый как FTP)
  - Нет пассивного/активного режима (не нужно!)
  - Нет проблем с NAT (одно соединение)
  - Поддержка символических ссылок, прав, владельца файлов
  - Атомарные операции, возобновление передачи
  - Встроена аутентификация по ключу (SSH keys)

Порт: TCP 22 (тот же что SSH).
```

### Архитектура SFTP

```
SFTP работает как SSH subsystem:

Клиент → SSH соединение (TCP 22) → SSH туннель → SFTP subsystem на сервере

SSH соединение:
  1. TCP handshake (порт 22)
  2. SSH handshake (key exchange, host key verification)
  3. Аутентификация (пароль или ключ)
  4. Открытие SSH канала с request "subsystem sftp"
  5. Сервер запускает sftp-server процесс
  6. Клиент и сервер обмениваются SFTP пакетами через SSH канал

SFTP протокол (поверх SSH):
  Версия 3 — наиболее распространена (OpenSSH).
  Версия 6 — расширенная (меньше поддержки).

  Пакет SFTP:
    uint32  length       (длина пакета)
    uint8   type         (тип сообщения)
    uint32  request-id   (идентификатор запроса, для matching)
    <данные зависят от типа>
```

### SFTP типы сообщений

```
Инициализация:
  SSH_FXP_INIT     (1)  - клиент → сервер, версия протокола
  SSH_FXP_VERSION  (2)  - сервер → клиент, версия + расширения

Файловые операции:
  SSH_FXP_OPEN     (3)  - открыть файл (read/write/append)
  SSH_FXP_CLOSE    (4)  - закрыть файл/директорию
  SSH_FXP_READ     (5)  - прочитать данные
  SSH_FXP_WRITE    (6)  - записать данные
  SSH_FXP_LSTAT    (7)  - stat (не следовать симлинкам)
  SSH_FXP_FSTAT    (8)  - stat по handle
  SSH_FXP_SETSTAT  (9)  - установить атрибуты
  SSH_FXP_FSETSTAT (10) - setstat по handle
  SSH_FXP_OPENDIR  (11) - открыть директорию
  SSH_FXP_READDIR  (12) - читать содержимое директории
  SSH_FXP_REMOVE   (13) - удалить файл
  SSH_FXP_MKDIR    (14) - создать директорию
  SSH_FXP_RMDIR    (15) - удалить директорию
  SSH_FXP_REALPATH (16) - получить абсолютный путь
  SSH_FXP_STAT     (17) - stat (следовать симлинкам)
  SSH_FXP_RENAME   (18) - переименовать файл
  SSH_FXP_READLINK (19) - читать симлинк
  SSH_FXP_SYMLINK  (20) - создать симлинк

Ответы:
  SSH_FXP_STATUS   (101) - статус операции (OK, ошибка, ...)
  SSH_FXP_HANDLE   (102) - handle для открытого файла/директории
  SSH_FXP_DATA     (103) - данные файла
  SSH_FXP_NAME     (104) - имена файлов/атрибуты
  SSH_FXP_ATTRS    (105) - атрибуты файла

Коды статуса (SSH_FXP_STATUS):
  SSH_FX_OK                (0)  - успех
  SSH_FX_EOF               (1)  - конец файла
  SSH_FX_NO_SUCH_FILE      (2)  - файл не найден
  SSH_FX_PERMISSION_DENIED (3)  - нет прав
  SSH_FX_FAILURE           (4)  - общая ошибка
  SSH_FX_BAD_MESSAGE       (5)  - плохой пакет
  SSH_FX_OP_UNSUPPORTED    (8)  - операция не поддерживается
```

---

## Сравнительная таблица

```
Характеристика       FTP           FTPS (Explicit)   SFTP
────────────────────────────────────────────────────────────────────────
Стандарт             RFC 959       RFC 4217          SSH subsystem (draft)
Порт(ы)              21 + динамич. 21 + динамич.     22 (один!)
Соединений           2 (команды+   2 (команды+       1 (SSH туннель)
                     данные)       данные)
Шифрование           НЕТ          TLS               SSH (AES, ChaCha20...)
Аутентификация       Логин/пароль  Логин/пароль      Логин/пароль,
                     (открытый     (зашифрован)      SSH ключи (лучше!)
                     текст!)
Заголовки открыты    Всё!         Нет               Нет
Сертификат           Нет          Да (TLS)          Нет (host key)
Проблемы NAT         Большие      Очень большие     НИКАКИХ
Файрвол              Сложно       Очень сложно      Один порт 22
Возобновление        Да (REST)    Да (REST)         Да
Симлинки             Нет          Нет               Да
Права файлов         Нет          Нет               Да
Бинарный протокол    Нет (текст)  Нет (текст)       Да
Производительность   Средняя      Ниже (TLS)        Хорошая
MITM без TLS         Уязвим       Защищён           Защищён
Пассивный режим      Нужен        Нужен             Не нужен
Широкая поддержка    Да           Частично          Да
```

---

## SCP - Secure Copy (бонус)

```
SCP (Secure Copy Protocol) — ещё один способ передачи файлов через SSH.
Старше SFTP, проще по функциональности.

Отличия от SFTP:
  - Только копирование файлов (нет листинга, нет навигации)
  - Нет возобновления передачи
  - Нет проверки существования файла на сервере до начала
  - Проблемы с пробелами и спецсимволами в именах файлов

Два режима SCP:
  Legacy SCP: использует rcp-совместимый протокол, уязвимости.
    Файл может "сбежать" из целевой директории.
    Уязвимости CVE-2019-6111, CVE-2019-6109.
  
  SCP с SFTP бэкендом: современные версии OpenSSH используют SFTP.
    ssh -o 'ProxyCommand scp ...' или scp -s (sftp subsystem).

Команды SCP:
  scp file.txt user@host:/remote/path/
  scp user@host:/remote/file.txt ./local/
  scp -r directory/ user@host:/remote/
  scp -P 2222 file.txt user@host:/path/   # нестандартный порт

Рекомендация: используйте SFTP вместо SCP для новых проектов.
OpenSSH 9.0+ (2022): устарел legacy SCP, по умолчанию SFTP бэкенд.
```

---

## Уязвимости и атаки

### FTP - открытый текст (критично)

```
Проблема 1: перехват учётных данных
  Все команды FTP в открытом тексте.
  tcpdump или любой сниффер в сети видит:
    USER admin
    PASS secretpassword123
  
  Атака:
    # Перехват FTP трафика
    tcpdump -i eth0 -A 'tcp port 21'
    # Мгновенно виден логин и пароль

    # Или через ARP spoofing (MITM в локальной сети)
    arpspoof -i eth0 -t 192.168.1.10 192.168.1.1
    tcpdump -i eth0 -A 'tcp port 21'

Проблема 2: перехват данных
  Файлы передаются в открытом виде.
  Конфиденциальные документы, базы данных, ключи → видны в сети.
  
  # Восстановить файл из tcpdump дампа
  tcpflow -r capture.pcap
  # Получаем отдельные файлы по потокам

Проблема 3: MITM атака
  Без шифрования MITM тривиален.
  Атакующий может подменить файлы на лету.
  Пользователь не заметит подмены.

Проблема 4: Bounce атака (FTP Bounce, RFC 2577)
  Использует команду PORT для заставить сервер подключиться к третьему хосту.
  PORT 10,0,0,1,0,80   → сервер подключается к 10.0.0.1:80
  Сервер FTP становится прокси для сканирования/атаки других хостов.
  
  Защита: отклонять PORT команды с IP, отличным от клиента.
  Современные серверы это делают по умолчанию.

Проблема 5: Anonymous FTP
  Многие серверы позволяют подключение без пароля (USER anonymous).
  Если неправильно настроено → доступ к файловой системе.
  Часто находят конфиги, резервные копии, чувствительные файлы.
  
  # Проверить anonymous FTP
  ftp target.com
  > USER anonymous
  > PASS anyemail@example.com
```

### Атаки на FTP брутфорс

```
FTP нет rate limiting из коробки.
Без защиты: тысячи попыток в секунду.

# Брутфорс FTP (Hydra)
hydra -l admin -P /usr/share/wordlists/rockyou.txt ftp://target.com
hydra -L users.txt -P passwords.txt ftp://target.com -t 4

# Защита:
  fail2ban для FTP:
    /etc/fail2ban/jail.conf:
    [vsftpd]
    enabled = true
    port = ftp
    filter = vsftpd
    logpath = /var/log/vsftpd.log
    maxretry = 3
    bantime = 3600
  
  Ограничить количество соединений:
    vsftpd: max_per_ip=3
  
  Белый список IP:
    /etc/hosts.allow:
    vsftpd: 192.168.1.0/24
    vsftpd: ALL EXCEPT ALL
```

### FTPS - уязвимости

```
Проблема 1: частичное шифрование (PROT C)
  Если не установлена PROT P — данные идут в открытом виде.
  Команды зашифрованы (USER, PASS защищены).
  Но содержимое файлов передаётся без шифрования!
  
  Проверить на сервере (vsftpd):
    force_local_data_ssl=YES    (принудительное SSL для данных)
    force_local_logins_ssl=YES  (принудительное SSL для логина)

Проблема 2: самоподписанные сертификаты
  Клиенты часто принимают любой сертификат.
  MITM с поддельным сертификатом → успех.
  
  Проверка сертификата в клиентах:
    FileZilla: Settings → FTP → FTP over TLS settings → "Require valid certificate"
    lftp: set ssl:verify-certificate true

Проблема 3: TLS downgrade
  Клиент пытается AUTH TLS → сервер/MITM говорит "не поддерживаю" → клиент fallback на FTP.
  Данные идут без шифрования.
  
  Защита: клиент должен отказываться если AUTH TLS не принята.
  FileZilla: "Require explicit FTP over TLS" в настройках.

Проблема 4: наследие FTP
  Все проблемы FTP с NAT остаются.
  Файрвол не видит PASV ответ (зашифровано).
  FTP bounce по-прежнему потенциально возможен.

Проблема 5: устаревшие TLS версии
  Старые FTPS серверы могут использовать TLS 1.0/1.1 или SSL 3.0.
  Нужно явно настраивать min версию TLS.
  
  vsftpd:
    ssl_tlsv1_2=YES   # включить TLS 1.2
    ssl_sslv2=NO
    ssl_sslv3=NO
```

### SFTP - уязвимости

```
SFTP значительно безопаснее FTP и FTPS, но не без проблем.

Проблема 1: слабые пароли + открытый порт 22
  Порт 22 сканируют боты 24/7.
  Brute force атаки на SSH пароли.
  
  Защита:
    - Отключить парольную аутентификацию, использовать SSH ключи
    - fail2ban для SSH
    - Изменить порт (security through obscurity, но снижает шум)
    - AllowUsers/AllowGroups в sshd_config

Проблема 2: Path traversal
  Если chroot не настроен — пользователь может выйти за пределы своей директории.
  Чтение /etc/passwd, /etc/shadow, конфигов.
  
  Защита (OpenSSH sshd_config):
    Match User ftpuser
        ChrootDirectory /var/sftp/%u
        ForceCommand internal-sftp
        AllowTcpForwarding no
        X11Forwarding no

Проблема 3: слабые SSH host keys
  Если host key утёк — MITM возможен.
  Клиент не проверяет host key (принял "yes" при первом подключении) → уязвим.
  
  Защита: строгая проверка host key.
  ~/.ssh/known_hosts должен содержать правильный ключ.
  TOFU (Trust On First Use) — приемлемо только при первом подключении.

Проблема 4: SSH-1 (устарел, небезопасен)
  SSH-1 содержит критические уязвимости.
  Все современные системы используют SSH-2.
  
  sshd_config:
    Protocol 2   # в старых версиях OpenSSH

Проблема 5: слабые алгоритмы SSH
  Старые алгоритмы (DH group 1, arcfour/RC4, DES) небезопасны.
  
  Проверить:
    ssh -vv user@host 2>&1 | grep -E "cipher|mac|kex"
  
  Рекомендуемые алгоритмы (/etc/ssh/sshd_config):
    KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512
    Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
    MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```

### CVE и известные уязвимости

```
FTP уязвимости:
  CVE-2010-4221  - ProFTPD 1.3.3c: удалённое выполнение кода через Telnet IAC
  CVE-2015-3306  - ProFTPD mod_copy: копирование файлов без аутентификации
                   Чтение/запись любых файлов на сервере!
                   EXPLOIT: SITE CPFR /etc/passwd, SITE CPTO /var/www/html/passwd.txt
  CVE-2011-1137  - vsftpd 2.3.4 backdoor (Trojanized версия)
  CVE-2019-12815 - ProFTPD mod_copy (снова): path traversal

FTPS уязвимости:
  Наследует уязвимости TLS (POODLE, BEAST, CRIME — если старые версии).
  CVE-2014-0224  - OpenSSL CCS Injection (затрагивает FTPS с OpenSSL)

SFTP/SSH уязвимости:
  CVE-2023-38408  - OpenSSH: Remote Code Execution через ssh-agent forwarding
  CVE-2024-6387   - OpenSSH regreSSHion: Remote Code Execution (race condition)
                    Критическая! Затронуты glibc Linux, OpenSSH < 9.8
  CVE-2019-6111   - OpenSSH SCP: файлы могут перезаписываться атакующим сервером
  CVE-2016-0777   - OpenSSH: утечка приватного ключа через roaming feature

# Проверить версию OpenSSH
ssh -V
# OpenSSH_9.9p1, OpenSSL 3.4.0

# Проверить CVE-2024-6387 (regreSSHion)
ssh -V | grep -oP '(?<=OpenSSH_)\d+\.\d+'
# Если < 9.8 → уязвимо!
```

---

## Настройка серверов

### vsftpd (Very Secure FTP Daemon)

```ini
# /etc/vsftpd.conf

# Основные настройки
listen=YES
listen_ipv6=NO
anonymous_enable=NO          # отключить anonymous
local_enable=YES             # разрешить локальных пользователей
write_enable=YES             # разрешить запись
local_umask=022

# Безопасность
chroot_local_user=YES        # заключить в chroot
chroot_list_enable=NO
allow_writeable_chroot=NO    # нельзя писать в chroot корень
userlist_enable=YES
userlist_file=/etc/vsftpd.userlist
userlist_deny=NO             # userlist = белый список

# TLS (для FTPS)
ssl_enable=YES
allow_anon_ssl=NO
force_local_data_ssl=YES     # данные тоже шифровать
force_local_logins_ssl=YES   # логин тоже шифровать
ssl_tlsv1=NO
ssl_sslv2=NO
ssl_sslv3=NO
ssl_tlsv1_1=NO
ssl_tlsv1_2=YES
ssl_tlsv1_3=YES
rsa_cert_file=/etc/ssl/certs/vsftpd.pem
rsa_private_key_file=/etc/ssl/private/vsftpd.key
ssl_ciphers=HIGH

# Пассивный режим (обязателен для FTPS через NAT)
pasv_enable=YES
pasv_min_port=50000
pasv_max_port=50100
pasv_address=1.2.3.4         # внешний IP

# Логирование
xferlog_enable=YES
xferlog_file=/var/log/vsftpd.log
log_ftp_protocol=YES

# Лимиты
max_clients=50
max_per_ip=5
idle_session_timeout=300
data_connection_timeout=120
```

### OpenSSH для SFTP

```bash
# /etc/ssh/sshd_config

# SFTP subsystem
Subsystem sftp /usr/lib/openssh/sftp-server

# Или internal-sftp (встроенный, без внешнего процесса)
Subsystem sftp internal-sftp

# Создать SFTP-only пользователя с chroot
groupadd sftpusers

Match Group sftpusers
    ChrootDirectory /var/sftp/%u    # %u = username
    ForceCommand internal-sftp -l INFO   # только SFTP, логировать
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    AllowAgentForwarding no

# Создать пользователя
useradd -m -G sftpusers -s /usr/sbin/nologin ftpuser1
passwd ftpuser1

# Настроить директории (chroot требования: владелец root, нет write)
mkdir -p /var/sftp/ftpuser1/uploads
chown root:root /var/sftp/ftpuser1      # владелец root!
chmod 755 /var/sftp/ftpuser1            # root не имеет group/other write
chown ftpuser1:ftpuser1 /var/sftp/ftpuser1/uploads
chmod 755 /var/sftp/ftpuser1/uploads

# Безопасные алгоритмы
KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com

# Отключить парольную аутентификацию (предпочесть ключи)
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no

# Логирование SFTP
LogLevel VERBOSE    # детальное логирование subsystem
```

```bash
# Проверить конфиг
sshd -t

# Перезапустить
systemctl restart sshd

# Тест подключения SFTP
sftp ftpuser1@server.com

# Логи SFTP операций (с LogLevel VERBOSE)
journalctl -u sshd | grep sftp
# session opened for local user ftpuser1
# opendir "/uploads"
# sent status Ok
```

---

## Клиенты

### Командная строка

```bash
# FTP клиент
ftp ftp.example.com
# > USER anonymous
# > PASS email@example.com
# > ls
# > get file.txt
# > put localfile.txt
# > bye

# Скачать файл без интерактивного режима
ftp -n <<EOF
open ftp.example.com
user ftpuser password
binary
get /path/to/file.txt /local/file.txt
bye
EOF

# SFTP клиент
sftp user@server.com
sftp -P 2222 user@server.com   # нестандартный порт
sftp -i ~/.ssh/mykey user@server.com  # с конкретным ключом

# SFTP команды:
# ls, cd, pwd, get, put, mget, mput, mkdir, rmdir, rm, rename, chmod, chown
sftp> ls -la
sftp> get remote_file.txt local_file.txt
sftp> put local_file.txt remote_file.txt
sftp> mget *.txt   # скачать все .txt
sftp> mput *.csv   # загрузить все .csv

# Передать один файл без интерактивного режима
sftp user@server.com:/remote/path/file.txt /local/path/
echo "put /local/file.txt /remote/file.txt" | sftp user@server.com

# lftp - продвинутый клиент (FTP, FTPS, SFTP, HTTP)
apt install lftp

# FTP через lftp
lftp -u user,password ftp://ftp.example.com
lftp> ls
lftp> mirror /remote/dir /local/dir   # скачать директорию рекурсивно
lftp> mirror -R /local/dir /remote/dir  # загрузить рекурсивно

# FTPS через lftp
lftp -u user,pass ftps://ftp.example.com
lftp ftp.example.com
lftp> set ftp:ssl-force true
lftp> set ssl:verify-certificate true

# SFTP через lftp
lftp sftp://user@server.com

# curl для FTP
curl ftp://ftp.example.com/file.txt --user user:password
curl -T localfile.txt ftp://ftp.example.com/ --user user:password
curl ftps://ftp.example.com/file.txt --user user:password  # FTPS
curl --ftp-ssl ftp://ftp.example.com/file.txt  # FTPS explicit

# wget для FTP
wget ftp://ftp.example.com/file.txt
wget --user=user --password=pass ftp://ftp.example.com/file.txt
```

### GUI клиенты

```
FileZilla (Linux/Windows/macOS):
  Бесплатный, кроссплатформенный.
  Поддерживает: FTP, FTPS (Explicit и Implicit), SFTP.
  Проверка сертификатов для FTPS.
  Настройки → FTP → FTP over TLS settings.

WinSCP (Windows):
  Специализируется на SFTP и FTPS.
  Очень удобный для Windows.
  Поддержка SSH ключей.
  Встроенный текстовый редактор.
  Скриптование и автоматизация.

Cyberduck (macOS, Windows):
  Красивый интерфейс.
  FTP, FTPS, SFTP, S3, WebDAV, и другие.
  Интеграция с Keychain macOS.
```

---

## Диагностика

### Диагностика FTP/FTPS

```bash
# Проверить подключение к FTP
telnet ftp.example.com 21
# 220 FTP Server Ready

# Проверить FTPS (openssl)
openssl s_client -connect ftp.example.com:21 -starttls ftp
# Должен начать TLS handshake после AUTH TLS

# Implicit FTPS
openssl s_client -connect ftp.example.com:990

# Захват FTP трафика
tcpdump -i eth0 -A 'tcp port 21'   # командный канал
tcpdump -i eth0 'tcp port 20'      # активный режим данных
tcpdump -i eth0 'tcp portrange 50000-50100'  # пассивный режим

# Проверить статус vsftpd
systemctl status vsftpd
journalctl -u vsftpd -f

# Просмотр лога vsftpd
tail -f /var/log/vsftpd.log
# Tue Apr 29 10:00:00 2026 [pid 1234] CONNECT: Client "192.168.1.10"
# Tue Apr 29 10:00:01 2026 [pid 1234] OK LOGIN: Client "192.168.1.10", "ftpuser"

# Проверить открытые порты
ss -tlnp | grep vsftpd
netstat -tlnp | grep :21

# Проверить пассивный диапазон
ftp ftp.example.com
> PASV
# 227 Entering Passive Mode (1,2,3,4,195,136)
# IP: 1.2.3.4, Port: 195*256+136 = 50056
```

### Диагностика SFTP

```bash
# Тест SFTP подключения с verbose
sftp -v user@server.com
# Показывает весь SSH handshake, алгоритмы, аутентификацию

# Ещё более подробно
sftp -vvv user@server.com

# Проверить SSH подключение
ssh -v user@server.com
ssh -vvv user@server.com 2>&1 | grep -E "kex|cipher|hmac|auth"

# Протестировать чтение директории
echo "ls -la" | sftp user@server.com

# Benchmark SFTP скорости
dd if=/dev/zero bs=1M count=100 | sftp user@server.com:/dev/null

# Проверить host key
ssh-keyscan server.com
ssh-keyscan -t rsa,ecdsa,ed25519 server.com

# Посмотреть known_hosts
cat ~/.ssh/known_hosts | grep server.com

# Сбросить known_hosts для хоста (если ключ изменился)
ssh-keygen -R server.com

# Логи SSH сервера
journalctl -u sshd -f
grep "sftp" /var/log/auth.log

# Типичные ошибки:
# "Connection refused" → SSH не запущен или порт не тот
# "Host key verification failed" → изменился ключ сервера
# "Permission denied (publickey)" → нет ключа или не добавлен
# "This service allows sftp connections only" → ForceCommand internal-sftp работает
# "bad ownership or modes for chroot directory" → ChrootDirectory не root:root
```

### Сравнение производительности

```bash
# Тест скорости FTP
time curl -s -o /dev/null ftp://ftp.example.com/1GB_file.bin --user user:pass

# Тест скорости SFTP
time sftp user@server.com:/path/1GB_file.bin /dev/null

# Тест скорости rsync over SSH (альтернатива SFTP для синхронизации)
time rsync -avz --progress user@server.com:/path/dir/ /local/dir/

# SFTP обычно медленнее чем rsync из-за шифрования каждого пакета
# но надёжнее и безопаснее чем FTP
```

---

## Шпаргалка

```
Протоколы:
  FTP  - порт 21 (команды) + 20/dynamic (данные)
         НЕТ шифрования, всё в открытом тексте
         Избегать! Использовать только в изолированных сетях.

  FTPS - порт 21 (Explicit AUTH TLS) или 990 (Implicit)
         FTP + TLS, два канала.
         PROT P обязательна для шифрования данных!
         Проблемы с NAT/файрволлом.

  SFTP - порт 22 (SSH)
         SSH подсистема, одно соединение.
         Нет проблем с NAT.
         Поддержка SSH ключей (лучше паролей).

Выбор:
  Всегда используй SFTP если возможно.
  FTPS только если требуется FTP совместимость.
  FTP — никогда в продакшне с интернетом.

Уязвимости FTP:
  - Пароль в открытом тексте
  - Данные в открытом тексте
  - FTP Bounce атака (PORT к третьему хосту)
  - Anonymous FTP (нет аутентификации)
  - Нет защиты от MITM

Уязвимости FTPS:
  - PROT C (забыли включить PROT P) → данные открытые
  - Самоподписанные/непроверенные сертификаты
  - TLS downgrade атака
  - Наследие FTP проблем с NAT

Уязвимости SFTP/SSH:
  - Слабые пароли + порт 22 открыт публично
  - Нет chroot → path traversal
  - Слабые SSH алгоритмы
  - CVE-2024-6387 regreSSHion (OpenSSH < 9.8)

Лучшие практики SFTP:
  PasswordAuthentication no       # только ключи
  ChrootDirectory /var/sftp/%u    # изолировать пользователей
  ForceCommand internal-sftp      # только SFTP, не shell
  AllowTcpForwarding no           # запретить туннели
  fail2ban для SSH
  Фиксированный порт не 22 (опционально)

Команды:
  sftp user@host                  подключиться
  sftp -P 2222 user@host          нестандартный порт
  sftp -i key user@host           с ключом
  lftp sftp://user@host           lftp SFTP
  lftp -u user,pass ftps://host   lftp FTPS
  curl ftps://host/file -u u:p    curl FTPS
  openssl s_client -connect host:21 -starttls ftp  тест FTPS
```

---

## Ссылки

- [RFC 959](https://www.rfc-editor.org/rfc/rfc959) - FTP (File Transfer Protocol), 1985
- [RFC 2228](https://www.rfc-editor.org/rfc/rfc2228) - FTP Security Extensions
- [RFC 2389](https://www.rfc-editor.org/rfc/rfc2389) - FEAT command (FTP extensions)
- [RFC 2428](https://www.rfc-editor.org/rfc/rfc2428) - FTP Extensions for IPv6 (EPSV, EPRT)
- [RFC 2577](https://www.rfc-editor.org/rfc/rfc2577) - FTP Security Considerations (Bounce attack)
- [RFC 4217](https://www.rfc-editor.org/rfc/rfc4217) - Securing FTP with TLS (FTPS)
- [RFC 3659](https://www.rfc-editor.org/rfc/rfc3659) - FTP Extensions (MLST, MLSD, SIZE, MDTM)
- [IETF SFTP draft](https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer) - SSH File Transfer Protocol
- [OpenSSH](https://www.openssh.com) - реализация SSH/SFTP
- [vsftpd](https://security.appspot.com/vsftpd.html) - Very Secure FTP Daemon
- [CVE-2024-6387](https://nvd.nist.gov/vuln/detail/CVE-2024-6387) - regreSSHion OpenSSH RCE
