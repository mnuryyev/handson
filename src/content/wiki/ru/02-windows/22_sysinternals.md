---
title: "Windows - Sysinternals Suite"
date: "2026-05-15"
---

Sysinternals Suite - коллекция утилит для диагностики, мониторинга и администрирования Windows. Создана Марком Руссиновичем и Брайсом Когсвеллом, с 2006 года принадлежит Microsoft. Де-факто стандарт для системных администраторов, форензиков и специалистов по безопасности. Многие инструменты не имеют аналогов в стандартном наборе Windows.

Скачать: https://learn.microsoft.com/en-us/sysinternals/downloads/sysinternals-suite
Live (без установки): https://live.sysinternals.com/

---

## Process Monitor (Procmon)

Process Monitor - мониторинг в реальном времени: файловые операции, реестр, процессы, сеть, профайлинг потоков. Незаменим при диагностике "почему программа не работает" и при форензике.

### Интерфейс и фильтры

```
Procmon перехватывает события через ETW (Event Tracing for Windows) и
минифильтр драйвер для файловой системы и реестра.

Типы событий (пять кнопок в тулбаре):
  Registry  - чтение/запись/создание/удаление ключей реестра
  File      - файловые операции (Create, Read, Write, SetInfo, QueryInfo...)
  Network   - сетевые соединения (TCP Connect, UDP Send/Receive)
  Process   - создание/завершение процессов, загрузка DLL
  Profiling - сэмплы CPU по потокам (для профилирования производительности)

Каждое событие содержит:
  Time        - время с микросекундной точностью
  Process     - имя и PID
  PID         - идентификатор процесса
  Operation   - тип операции
  Path        - путь (файл, ключ реестра, адрес)
  Result      - SUCCESS, NAME NOT FOUND, ACCESS DENIED, etc.
  Detail      - дополнительные параметры (что читали, что писали)
```

### Фильтры - самое важное

```
Без фильтров Procmon генерирует тысячи событий в секунду - всё бесполезно.
Фильтры - ключевой навык.

Открыть: Filter → Filter... (Ctrl+L)

Структура фильтра: [Column] [Condition] [Value] → [Include/Exclude]

Примеры полезных фильтров:

  Process Name  is        notepad.exe          Include
  → только события Notepad

  Path          contains  HKCU\Software\Bad    Include
  → только обращения к этому ключу реестра

  Result        is        ACCESS DENIED        Include
  → только отказы в доступе (для диагностики прав)

  Operation     is        RegSetValue          Include
  → только запись в реестр

  Path          contains  C:\Temp              Include
  → только операции в C:\Temp

  Process Name  is        System               Exclude
  → убрать события ядра (уменьшить шум)

  Process Name  is        svchost.exe          Exclude
  → убрать фоновые сервисы

Готовые фильтры (Filter → Load Filter) - Procmon поставляется с наборами.
Сохранить свой: Filter → Save Filter → *.pmc файл.

Быстрый фильтр: правый клик на событие → Include [значение] / Exclude [значение]
```

### Process Tree

```
Tools → Process Tree (Ctrl+T)

Показывает дерево процессов с хронологией создания и завершения.
Цвет: синий = живой процесс, серый = завершился.
Двойной клик на процесс → список событий этого процесса.

Полезно для:
  - Понять кто кого запустил (parent-child)
  - Увидеть короткоживущие процессы которые уже завершились
  - Обнаружить инъекцию (process запущен неожиданным родителем)
```

### Практические сценарии Procmon

```
Сценарий 1: Программа не запускается - "missing file or DLL"
  Фильтр: Process Name = myapp.exe, Result = NAME NOT FOUND
  Смотреть: какие файлы/DLL не найдены

Сценарий 2: Где программа хранит настройки
  Фильтр: Process Name = myapp.exe, Operation = RegSetValue
  Смотреть: куда пишет в реестр при сохранении настроек

Сценарий 3: COM Hijacking поиск
  Фильтр: Operation = RegOpenKey, Path contains HKCU\Software\Classes\CLSID, Result = NAME NOT FOUND
  → находим CLSID которые ищутся в HKCU но не найдены (кандидаты для hijacking)

Сценарий 4: Малварь - что делает подозрительный процесс
  Фильтр: Process Name = suspicious.exe
  Смотреть все: файлы которые создаёт, ключи реестра, сетевые соединения

Сценарий 5: Поиск причины медленной загрузки
  Tools → Process Monitor Boot Logging (записывать с момента загрузки)
  Найти долгие операции: View → Highlight I/O operations > 100ms

Сценарий 6: Кто трогает конкретный файл
  Фильтр: Path = C:\sensitive\file.txt, Include
  Смотреть: все процессы обращавшиеся к файлу
```

### Сохранение и экспорт

```
File → Save → Native Format (.pml) - сохранить для повторного открытия
File → Save → CSV / XML             - экспорт для анализа в Excel/скриптах

Опции захвата:
  File → Capture Events (F5)         - включить/остановить захват
  File → Drop Filtered Events        - не хранить отфильтрованные события (экономит RAM)
  Options → Enable Boot Logging      - захват с момента старта системы

Открыть .pml на другой машине:
  Procmon portable - можно запустить без установки, открыть .pml файл.
  Удобно для анализа в лаборатории.
```

---

## Autoruns

Autoruns - полный каталог всех точек автозапуска Windows. Показывает абсолютно всё что запускается при старте системы или входе пользователя. Стандартный инструмент для поиска malware persistence.

### Вкладки Autoruns

```
Каждая вкладка = категория точек автозапуска:

Everything     - все записи (объединение всех вкладок)
Logon          - HKCU/HKLM Run, RunOnce, Startup папки, Winlogon
Explorer       - Shell extensions, Browser Helper Objects (BHO), Toolbar
Internet Explorer - BHO, Toolbar, IE extensions
Scheduled Tasks - задачи планировщика
Services       - Windows сервисы
Drivers        - загружаемые драйверы
Codecs         - аудио/видео кодеки
Boot Execute   - программы запускающиеся ДО загрузки Windows (редко)
Image Hijacks  - IFEO (Image File Execution Options) - отладчики и замены
AppInit DLLs   - DLL загружаемые во все процессы (опасно!)
KnownDLLs      - переопределения системных DLL
Winlogon       - провайдеры уведомлений, GINA
Winsock        - Layered Service Providers (LSP)
Print Monitors - DLL в процессе spoolsv
LSA Providers  - провайдеры безопасности
Network Providers - сетевые провайдеры
Sidebar Gadgets - (устарело)
```

### Цветовая кодировка

```
Цвет строки в Autoruns = статус верификации:

Белый / Нет цвета  - подписан Microsoft, всё нормально
Жёлтый             - файл не найден (запись есть, файла нет!)
                     → удалённый malware оставил след
Красный            - не подписан (unsigned) ИЛИ подпись не верифицирована
                     → требует внимания, особенно в системных папках
Розовый/Pink       - файл не найден или нет информации об издателе

Важно: красный ≠ malware. Много легитимного ПО не подписано.
Красный = "требует ручной проверки". Смотри на путь и хеш.
```

### Ключевые настройки Autoruns

```
Options → Scan Options:
  Check VirusTotal.com             - проверить все хеши на VT (требует интернет)
  Submit Unknown Images            - загрузить неизвестные файлы на VT
  Hide Signed Microsoft Entries    - скрыть подписанные MS файлы (убрать шум)
  Hide Microsoft and Windows Entries - скрыть всё Microsoft
  Include 64-bit Images Only       - только 64-bit
  Scan Only Per-User Locations     - только пользовательские записи

Options → Scan Options → Check VirusTotal - самая полезная опция.
После применения: в колонке VirusTotal появятся детекции.
Красный score (например 3/72) = серьёзный повод для расследования.
```

### Autoruns из командной строки

```
autorunsc.exe - консольная версия Autoruns.

# Все записи автозапуска
autorunsc.exe -a * -c -h -s > autoruns_output.csv
# -a * = все категории
# -c   = CSV формат
# -h   = SHA256 хеши
# -s   = проверить подписи

# Только незнакомые (неподписанные) записи
autorunsc.exe -a * -c -h -s -u > autoruns_unsigned.csv
# -u = только unsigned

# Проверить с VirusTotal
autorunsc.exe -a * -c -h -s -vt > autoruns_vt.csv
# -vt = VirusTotal lookup

# Анализ удалённой машины (через административный доступ)
autorunsc.exe -a * -c \\REMOTE_PC\C$ -u

# Сравнить две выгрузки (до/после)
# Экспортировать baseline → после инцидента экспортировать снова → diff в Excel
```

### Что искать в Autoruns при расследовании

```
1. Жёлтые записи (файл не найден)
   Malware удалён, запись осталась. Нашли след.
   Особенно интересно в HKCU\...\Run

2. Нестандартные пути для системных файлов
   C:\Windows\System32\svchost.exe - норма
   C:\Users\user\AppData\svchost.exe - НЕ норма
   C:\Temp\winlogon.exe            - явно malware

3. Записи в нестандартных ветках реестра
   HKCU\...\Run - пользователь установил что-то
   HKLM\SOFTWARE\Wow6432Node\...\Run - 32-bit в 64-bit системе

4. AppInit DLLs (вкладка AppInit)
   Загружается в КАЖДЫЙ процесс использующий user32.dll.
   Любая запись здесь = очень подозрительно.

5. Image File Execution Options (IFEO) - вкладка Image Hijacks
   HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\
   Используется для: отладчиков и... замены исполняемых файлов malware.
   sethc.exe (Sticky Keys) → cmd.exe = классический backdoor.

6. Scheduled Tasks с нестандартными путями
   Задачи из C:\Users\, C:\Temp\ → подозрительно.

7. Services без описания и с нестандартными именами
   Случайные имена типа "xkbqpx" = malware сервис.

8. LSA Providers и Winlogon Notification Packages
   DLL загружаемые в lsass.exe или winlogon.exe.
   Используются для: легитимных продуктов и... credential theft.
```

---

## Process Explorer (ProcExp)

Process Explorer - продвинутый замена Task Manager. Показывает иерархию процессов, open handles, loaded DLL, CPU/память с детализацией, верификацию подписей.

### Основные возможности

```
Цветовая кодировка процессов:
  Синий        - процессы запущенные от имени текущего пользователя
  Розовый      - сервисы (запущены от SYSTEM или NetworkService)
  Тёмно-серый  - завершённые процессы (ещё видны в дереве)
  Фиолетовый   - .NET процессы
  Зелёный      - новый процесс (мигает)
  Красный      - завершающийся процесс

Колонки (View → Select Columns):
  CPU History  - мини-график CPU за последние секунды
  Private Bytes - память выделенная только этому процессу
  Working Set  - физическая память
  Handles      - количество открытых handles
  Threads      - количество потоков
  Company Name - имя компании из PE ресурсов
  Description  - описание
  Image Path   - полный путь к исполняемому файлу
  Command Line - командная строка запуска
  DEP Status   - включён ли DEP
  ASLR Status  - включён ли ASLR
  Integrity    - Integrity Level (Low/Medium/High/System)
  Verified Signer - статус цифровой подписи
  VirusTotal   - детекции (если включён VT lookup)
```

### Двойной клик на процесс - детальная информация

```
Вкладка Image:
  Полный путь, command line, parent process
  Автозапуск (если зарегистрирован)
  Версия, описание, подпись

Вкладка Performance:
  CPU/память графики в реальном времени
  Virtual Memory, Working Set, Paged/NonPaged Pool

Вкладка Performance Graph:
  Графики за время жизни процесса

Вкладка Threads:
  Список всех потоков с CPU usage и стеком вызовов
  Правый клик → Stack → посмотреть текущий стек потока
  Полезно для: понять что делает процесс прямо сейчас

Вкладка TCP/IP:
  Сетевые соединения процесса (аналог netstat -b но в реальном времени)

Вкладка Security:
  SID, группы, привилегии
  Integrity Level, Virtualization

Вкладка Environment:
  Переменные окружения процесса

Вкладка Strings:
  Строки из образа на диске и из памяти (in-memory)
  Сравни Disk vs Memory → если разные = process hollowing/injection подозрение

Вкладка .NET Assemblies:
  Загруженные .NET сборки (для managed процессов)
```

### Handles и DLLs

```
View → Lower Pane View → DLLs (Ctrl+D)
  Список всех загруженных DLL с путями, версиями, хешами.
  Нестандартные пути DLL = подозрительно.
  Правый клик → Check VirusTotal

View → Lower Pane View → Handles (Ctrl+H)
  Все открытые handles: файлы, ключи реестра, мьютексы, события, потоки.
  Полезно: найти кто держит файл открытым (File → Find Handle или Ctrl+F)

Поиск handle:
  Find → Find Handle or DLL (Ctrl+F)
  Ввести имя файла или части пути → найти все процессы с таким handle.
  Применение: файл "используется другим процессом" → найти кем.
```

### Верификация через VirusTotal

```
Options → VirusTotal.com → Check VirusTotal.com (включить)

После включения:
  В дереве процессов появится колонка VirusTotal.
  Зелёный 0/70 = чисто.
  Красный X/70 = детекции = расследовать.
  Серый (не проверен) = хеш не найден в VT (новый или не отправлялся).

Правый клик на процесс → Check VirusTotal (принудительно для одного).

Важно: VT проверяет хеш файла с диска, не памяти.
Packed/injected malware может иметь "чистый" хеш на диске.
```

---

## Process Hacker / System Informer

```
Process Hacker (переименован в System Informer) - open source альтернатива ProcExp.
Часто используется дополнительно к Sysinternals.

Ключевые преимущества над ProcExp:
  - Memory Editor: читать/писать память процесса напрямую
  - Highlight Injected Regions: выделять области памяти с нестандартными правами
    (RWX регионы в процессе = возможная инъекция)
  - Network connections с PID прямо в главном окне
  - Services с полными деталями
  - Open Source (можно изучить как работает)

Скачать: https://systeminformer.sourceforge.io/
```

---

## TCPView

TCPView - сетевые соединения в реальном времени с именами процессов. Наглядный аналог `netstat -b` с цветовой анимацией.

```
Интерфейс:
  Зелёный = новое соединение
  Красный = соединение закрылось
  Жёлтый = изменилось состояние

Колонки: Process, PID, Protocol, Local Address, Remote Address, State

Состояния TCP:
  ESTABLISHED  - активное соединение
  TIME_WAIT    - ожидание закрытия (нормально)
  LISTENING    - ждёт входящих
  CLOSE_WAIT   - ожидание закрытия со стороны приложения
  SYN_SENT     - попытка подключения

Правый клик на соединение:
  → Close Connection         - разорвать соединение
  → Process Properties       - открыть в ProcExp
  → Whois                    - whois запрос для remote IP

Что искать:
  Процессы с неожиданными исходящими соединениями
  ESTABLISHED к подозрительным IP
  Сервисы слушающие на 0.0.0.0 вместо localhost
  notepad.exe, calc.exe, svchost.exe → необычные порты

Командная строка: tcpvcon.exe -a -c > connections.csv
```

---

## Handle

Handle - вывод всех открытых handles по процессам. Консольная утилита.

```
# Найти все handles открытые конкретным процессом
handle.exe -p lsass.exe /accepteula

# Найти какой процесс держит файл
handle.exe "C:\file.txt" /accepteula

# Найти все handles типа pipe
handle.exe -a pipe /accepteula

# Все handles всех процессов (много вывода)
handle.exe -a /accepteula

# Только handles с конкретным типом
handle.exe -t Key /accepteula    # только ключи реестра
handle.exe -t File /accepteula   # только файлы

Типы handles: File, Key, Process, Thread, Event, Semaphore, Mutant,
              Section, Directory, Token, Desktop, WindowStation, Port, Timer

Полезный кейс: файл "used by another process" при удалении/перемещении
  handle.exe filename.ext
  # Показывает PID и имя процесса
  # Закрыть через: handle.exe -c <hex_handle> -p <PID> -y
```

---

## Listdlls

```
Listdlls - список загруженных DLL с путями, версиями, временем загрузки.

# Все DLL всех процессов
listdlls.exe /accepteula

# DLL конкретного процесса
listdlls.exe -p notepad.exe /accepteula
listdlls.exe -p 1234 /accepteula        # по PID

# Найти все процессы где загружена конкретная DLL
listdlls.exe evil.dll /accepteula

# Только DLL без верифицированной подписи
listdlls.exe -u /accepteula

Вывод включает:
  Base    - базовый адрес загрузки
  Size    - размер
  Path    - полный путь на диске
  Version - версия файла
```

---

## Accesschk

Accesschk - проверка прав доступа к объектам Windows: файлы, реестр, сервисы, процессы, объекты ядра, Named Pipes.

```
# Права на файлы/папки
accesschk.exe -l C:\Windows\Temp /accepteula
accesschk.exe -uwdq "Users" C:\             # папки с правами записи для Users
accesschk.exe -uwdqs "Everyone" C:\         # рекурсивно

# Права на ключи реестра
accesschk.exe -kquw "Users" HKLM\SYSTEM\CurrentControlSet\Services\

# Права на сервисы
accesschk.exe -uwcqv "Users" *              # сервисы изменяемые Users
accesschk.exe -ucqv wuauserv               # права на конкретный сервис

# Права на Named Pipes
accesschk.exe -l \pipe\lsass /accepteula

# Права на объекты ядра (мьютексы, события, секции)
accesschk.exe -o \BaseNamedObjects\*

# Права текущего пользователя на конкретный объект
accesschk.exe -l "C:\Program Files\MyApp" /accepteula

Флаги:
  -u = только объекты с правами для текущего/указанного пользователя
  -w = только объекты куда можно писать (writable)
  -d = только директории
  -f = только файлы
  -s = рекурсивно (subdirectories)
  -q = тихий режим (без баннера)
  -l = показать полный ACL
  -c = сервисы
  -k = ключи реестра
  -o = объекты ядра

Применение в аудите безопасности:
  # Найти сервисы с нестандартными ACL (LPE вектор)
  accesschk.exe -uwcqv "Authenticated Users" * /accepteula
  accesschk.exe -uwcqv "INTERACTIVE" * /accepteula
```

---

## PsTools

Набор консольных утилит для удалённого администрирования.

### PsExec

```
PsExec - выполнение процессов на удалённых машинах.

# Запустить cmd на удалённой машине
psexec.exe \\REMOTE cmd.exe

# Запустить от имени другого пользователя
psexec.exe \\REMOTE -u DOMAIN\admin -p password cmd.exe

# Запустить от имени SYSTEM локально
psexec.exe -s cmd.exe
psexec.exe -s -i powershell.exe   # -i = interactive (для GUI)

# Скопировать и запустить файл на удалённой машине
psexec.exe \\REMOTE -c C:\tool.exe

# Выполнить команду на нескольких машинах
psexec.exe \\MACHINE1,MACHINE2,MACHINE3 cmd.exe /c ipconfig

# Выполнить на всех машинах домена (из текстового файла)
psexec.exe @machines.txt cmd.exe /c systeminfo

# Запустить с SYSTEM привилегиями на удалённой машине
psexec.exe \\REMOTE -s cmd.exe

Флаги:
  -s    = запустить как SYSTEM
  -i    = интерактивный (показывать UI на desktop сессии)
  -d    = не ждать завершения
  -c    = скопировать файл перед выполнением
  -f    = принудительно скопировать (даже если уже есть)
  -h    = если Vista+, запустить с elevated token
  -l    = limited user (без admin прав)
  -u/-p = credentials
  -e    = не загружать профиль пользователя
```

### PsList, PsKill, PsInfo

```
PsList - список процессов (локально или удалённо):
  pslist.exe                         # локально
  pslist.exe \\REMOTE                # удалённо
  pslist.exe -t                      # дерево процессов
  pslist.exe -x                      # расширенный (память, потоки)
  pslist.exe -s 5 -r 3 notepad       # мониторинг notepad каждые 3 сек, 5 раз

PsKill - завершить процесс по имени или PID:
  pskill.exe notepad                  # по имени
  pskill.exe 1234                     # по PID
  pskill.exe \\REMOTE explorer        # на удалённой машине

PsInfo - информация о системе:
  psinfo.exe                          # локально
  psinfo.exe \\REMOTE                 # удалённо
  psinfo.exe -h                       # включить hotfixes
  psinfo.exe -s                       # включить установленное ПО
  # Выводит: имя компьютера, OS, SP, uptime, CPU, RAM, диски
```

### PsLogon, PsLogList, PsService

```
PsLogon - информация о текущих вошедших пользователях:
  pslogon.exe                         # локально
  pslogon.exe \\REMOTE               # удалённо

PsLogList - просмотр Event Log:
  psloglist.exe Security             # Security лог
  psloglist.exe -x Security          # с расшифровкой event data
  psloglist.exe -s \\REMOTE System   # System лог удалённой машины
  psloglist.exe -n 50 Application    # последние 50 записей

PsService - управление сервисами:
  psservice.exe query wuauserv        # статус сервиса
  psservice.exe start wuauserv        # запустить
  psservice.exe stop wuauserv         # остановить
  psservice.exe \\REMOTE query        # сервисы удалённой машины
```

---

## WinObj

WinObj - браузер пространства объектов ядра Windows (Object Manager namespace).

```
Object Manager namespace - глобальное пространство имён ядра.
Содержит объекты которые невидны в обычных инструментах:
  \Device\     - устройства (жёсткие диски, сетевые интерфейсы, виртуальные устройства)
  \Driver\     - объекты драйверов
  \BaseNamedObjects\ - именованные объекты (Mutex, Event, Semaphore, Section)
  \Sessions\   - объекты сессий
  \KnownDlls\  - системные DLL известные ядру
  \Windows\    - объекты оконной системы
  \RPC Control\ - RPC endpoints
  \Security\   - объекты LSA
  \GLOBAL??\   - символические ссылки (C:, D:, \\.\COM1 и т.д.)

Применение:
  Найти mutex malware (часть malware создаёт именованные объекты как "флаги")
  Изучить Device objects (какие устройства видны ядру)
  Исследовать KnownDlls (можно ли переопределить?)
  Символические ссылки устройств (GLOBALROOT доступ)

Пример: malware создаёт Mutex "Global\SystemMutex123"
  WinObj → \BaseNamedObjects → найти SystemMutex123 → есть = malware активен
```

---

## Strings

Strings - извлечение строк из бинарных файлов. Аналог Unix `strings` но для Windows.

```
# Строки из файла (по умолчанию: минимум 3 символа)
strings.exe C:\suspicious.exe

# Задать минимальную длину строки
strings.exe -n 8 C:\suspicious.exe

# Unicode строки (wide char)
strings.exe -u C:\suspicious.exe

# И ASCII и Unicode
strings.exe -a C:\suspicious.exe

# Из памяти процесса (по PID)
strings.exe -pid 1234

# Рекурсивно из папки
strings.exe -s C:\Malware\

# Найти URL в файле
strings.exe C:\suspicious.exe | findstr /i "http ftp smtp"

# Найти IP адреса
strings.exe C:\suspicious.exe | Select-String -Pattern "\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"

Что искать в strings вывода:
  URL (http://, https://, ftp://)    → C2 адреса
  IP адреса                          → hardcoded серверы
  Пути файлов                        → куда пишет/читает
  Имена функций API                  → какие API вызывает
  Mutex имена                        → идентификатор malware
  Имена реестровых ключей            → persistence механизм
  Имена сервисов                     → persistence через сервис
  Base64 строки                      → закодированный payload
  Ключевые слова: "password", "crypt", "inject", "shellcode"
```

---

## Другие утилиты

### Sigcheck

```
Sigcheck - верификация цифровых подписей файлов.

# Проверить подпись файла
sigcheck.exe C:\Windows\System32\notepad.exe /accepteula

# Проверить все файлы в папке рекурсивно
sigcheck.exe -r C:\Windows\System32\

# Только неподписанные файлы
sigcheck.exe -u -e C:\Windows\System32\  # -e = только .exe/.dll/etc.

# Проверить на VirusTotal
sigcheck.exe -vt C:\suspicious.exe

# Все незнакомые файлы в папке + VT
sigcheck.exe -u -e -vt C:\Windows\System32\

# Экспорт в CSV
sigcheck.exe -c -u C:\Program Files\ > unsigned.csv

Вывод включает:
  Verified/Not signed, Publisher, Company, Description,
  Product version, File version, SHA1, SHA256, PE структура

Применение:
  Найти unsigned DLL в системных папках
  Проверить хеш файла на VT
  Обнаружить файлы с поддельными подписями (неверный сертификат)
```

### Sysmon (System Monitor)

```
Sysmon - сервис и драйвер для расширенного логирования событий.
Не диагностический инструмент, а постоянный мониторинг.
Пишет в: Microsoft-Windows-Sysmon/Operational

Установка:
  sysmon.exe -accepteula -i sysmonconfig.xml
  sysmon.exe -c sysmonconfig.xml   # обновить конфиг
  sysmon.exe -u                    # удалить

Ключевые Event IDs Sysmon:
  1   - Process Create (CommandLine, Hashes, PPID)
  2   - File creation time changed (timestomping!)
  3   - Network connection (Process, IP, Port)
  5   - Process terminated
  6   - Driver loaded
  7   - Image (DLL) loaded
  8   - CreateRemoteThread (инъекция!)
  9   - RawAccessRead (прямое чтение диска)
  10  - ProcessAccess (handle к другому процессу - LSASS dump!)
  11  - FileCreate
  12  - Registry key/value created or deleted
  13  - Registry value set
  15  - FileCreateStreamHash (ADS создан)
  17  - Pipe Created
  18  - Pipe Connected
  22  - DNS Query
  23  - FileDelete
  25  - ProcessTampering (process hollowing detection)

Sysmon конфиг - SwiftOnSecurity (популярный готовый конфиг):
  https://github.com/SwiftOnSecurity/sysmon-config
  Сбалансирован: детальный без лишнего шума.

Olaf Hartong sysmon-modular (более продвинутый):
  https://github.com/olafhartong/sysmon-modular
```

### VMMap, RAMMap

```
VMMap - Virtual Memory Map. Детальная карта виртуальной памяти процесса.
  Запустить: vmmap.exe -p <PID> или выбрать процесс в GUI.
  Показывает: Private, Shareable, Heap, Stack, Image, Mapped File регионы.
  Цвет региона = тип. Размер = визуально пропорционально.
  Полезно: найти большие Private Data регионы (потенциальный shellcode/payload).

RAMMap - физическая память системы.
  Анализ использования RAM: Active, Standby, Modified, Free.
  Вкладки: Use Counts, Processes, Priority Summary, Physical Pages, File Summary.
  Полезно: понять почему система медленно работает после долгого uptime.

Применение в форензике:
  VMMap: найти RWX регионы памяти в подозрительном процессе.
  Регион с правами RWX в "дыре" между легитимными модулями = shellcode.
```

---

## Шпаргалка

```
БЫСТРЫЙ ВЫБОР ИНСТРУМЕНТА

Задача                                    Инструмент
─────────────────────────────────────────────────────────────────────
Что запускается при старте/логине?        Autoruns
Что сейчас запущено? Дерево процессов?    Process Explorer
Что делает конкретный процесс?            Process Monitor (фильтр по имени)
Какой процесс держит файл?                Handle.exe или ProcExp Find
Сетевые соединения процессов              TCPView
Права на объект (файл/реестр/сервис)?     Accesschk
Строки из бинарного файла?                Strings
Подпись файла / хеш на VT?                Sigcheck
Удалённое выполнение команды?             PsExec
Информация об удалённой системе?          PsInfo
Объекты ядра (mutex, device)?             WinObj
Постоянный мониторинг для SIEM?           Sysmon
Виртуальная память процесса?              VMMap

PROCMON КЛЮЧЕВЫЕ ФИЛЬТРЫ
  Result = ACCESS DENIED                  → диагностика прав
  Result = NAME NOT FOUND                 → missing files/DLL
  Operation = RegSetValue                 → куда пишет в реестр
  Path contains HKCU\Software\Classes\CLSID + NAME NOT FOUND → COM hijacking
  Process Name = <malware.exe>            → всё что делает процесс

AUTORUNS ЧТО ИСКАТЬ
  Жёлтый (файл не найден)                → след удалённого malware
  AppInit DLLs не пустые                 → DLL в каждом процессе
  IFEO подозрительные записи             → замена системных программ
  Сервисы со случайными именами          → malware persistence
  Run ключи с нестандартными путями      → %TEMP%, %APPDATA%

PSEXEC БЫСТРО
  psexec.exe -s cmd.exe                  → SYSTEM shell локально
  psexec.exe \\HOST cmd.exe              → shell на удалённой машине
  psexec.exe \\HOST -u usr -p pwd cmd    → с credentials

ACCESSCHK БЫСТРО
  accesschk.exe -uwdqs "Users" C:\       → папки куда Users могут писать
  accesschk.exe -uwcqv "Users" *         → сервисы изменяемые Users
  accesschk.exe -kquw "Users" HKLM\...\Services\ → ключи реестра сервисов

SYSMON ВАЖНЫЕ СОБЫТИЯ
  ID 1  → запуск процесса (с командной строкой и хешем)
  ID 3  → сетевое соединение
  ID 8  → CreateRemoteThread = инъекция!
  ID 10 → доступ к другому процессу = LSASS dump!
  ID 22 → DNS запрос (C2 по домену)
  ID 25 → Process tampering = hollowing!
```

---

## Ссылки

- [Sysinternals Suite Download](https://learn.microsoft.com/en-us/sysinternals/downloads/sysinternals-suite) - официальный сайт
- [Sysinternals Live](https://live.sysinternals.com/) - запуск напрямую из интернета
- [Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) - документация
- [Autoruns](https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns) - документация
- [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - документация
- [Sysmon config (SwiftOnSecurity)](https://github.com/SwiftOnSecurity/sysmon-config) - готовый конфиг
- [Sysmon Modular (Olaf Hartong)](https://github.com/olafhartong/sysmon-modular) - продвинутый конфиг
- [Mark Russinovich Blog](https://techcommunity.microsoft.com/t5/windows-blog-archive/bg-p/WindowsBlogArchive) - автор Sysinternals
- [Windows Internals (книга)](https://learn.microsoft.com/en-us/sysinternals/resources/windows-internals) - Марк Руссинович, Pavel Yosifovich
