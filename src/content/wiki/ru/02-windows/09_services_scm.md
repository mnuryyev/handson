---
title: "Windows - Службы и SCM (Service Control Manager)"
date: "2026-05-13"
---

Служба Windows (Windows Service) - это фоновый процесс, который работает независимо от сессии пользователя. Службы могут стартовать до входа пользователя в систему, работать от имени специальных системных аккаунтов и автоматически перезапускаться при сбоях. Ближайший аналог в Linux - systemd unit.

SCM (Service Control Manager) - это системный процесс `services.exe`, который управляет всем жизненным циклом служб: запуском, остановкой, регистрацией, отслеживанием состояния.

---

## Зачем нужны службы

Обычный процесс vs служба:

```
Обычный процесс:
- Живёт пока открыта сессия пользователя
- Завершается при выходе из системы
- Запускается с правами пользователя
- Нет автоматического перезапуска при сбое

Служба:
- Запускается до входа пользователя (или вообще без него)
- Продолжает работать после выхода из системы
- Может работать от SYSTEM, LOCAL SERVICE, NETWORK SERVICE
- Поддерживает автоматический перезапуск при сбое
- Имеет зависимости от других служб
- Интегрирована с SCM и Event Log
```

Типичные примеры служб: Defender Antivirus, Print Spooler, Windows Update, DHCP Client, DNS Client, Remote Desktop Services.

---

## Service Control Manager (SCM)

SCM - это `%SystemRoot%\System32\services.exe`. Запускается одним из первых при загрузке Windows и живёт на протяжении всей работы системы.

### Что делает SCM

```
1. Читает список служб из реестра при загрузке
   HKLM\SYSTEM\CurrentControlSet\Services\

2. Запускает службы в нужном порядке (с учётом зависимостей)

3. Отслеживает состояние каждой службы

4. Принимает команды (старт, стоп, пауза, продолжить)
   - от пользователей через services.msc / sc.exe / PowerShell
   - от самих служб (например, служба сообщает что инициализировалась)

5. Реагирует на сбои (recovery actions):
   - перезапустить службу
   - запустить программу
   - перезагрузить компьютер

6. Ведёт журнал System Event Log
   EventID 7034 - служба аварийно завершилась
   EventID 7035 - отправлена команда старт/стоп
   EventID 7036 - служба запущена/остановлена
   EventID 7040 - изменён тип запуска
   EventID 7045 - установлена новая служба (важно для безопасности!)
```

### Как SCM общается со службами

SCM и служба общаются через специальный механизм: когда SCM запускает процесс службы, он передаёт ему дескриптор (handle) через который служба регистрирует свои функции (ServiceMain) и отправляет статусные обновления. Служба обязана уведомить SCM об успешном запуске в течение таймаута (по умолчанию 30 секунд), иначе SCM посчитает запуск неудачным.

```
Жизненный цикл запуска службы:

SCM                              Служба (процесс)
 │                                     │
 │  CreateProcess(ImagePath)           │
 │────────────────────────────────────►│
 │                                     │  ServiceMain() вызывается
 │                                     │  Служба инициализируется
 │                                     │  RegisterServiceCtrlHandler()
 │◄─ SetServiceStatus(START_PENDING) ──│
 │                                     │  ... продолжает инициализацию ...
 │◄─ SetServiceStatus(RUNNING) ────────│
 │                                     │
 │  Служба запущена, мониторинг...     │
 │                                     │
 │  SCM: Stop                          │
 │────────────────────────────────────►│
 │◄─ SetServiceStatus(STOP_PENDING) ───│
 │◄─ SetServiceStatus(STOPPED) ────────│
```

---

## Реестр служб

Каждая служба описана в реестре. Это главное место хранения конфигурации.

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\
```

### Ключевые параметры

```
Параметр          Тип         Значение / Описание
──────────────────────────────────────────────────────────────────────────
ImagePath         REG_EXPAND_SZ  Путь к исполняемому файлу (или драйверу)
                                 Пример: "C:\Windows\System32\svchost.exe -k netsvcs"
                                 Пример: "\SystemRoot\System32\drivers\tcpip.sys"

DisplayName       REG_SZ         Отображаемое имя (видно в services.msc)
                                 Пример: "Windows Update"

Description       REG_SZ         Описание службы

ObjectName        REG_SZ         Аккаунт, от которого запускается служба
                                 "LocalSystem"         = SYSTEM
                                 "NT AUTHORITY\LocalService"
                                 "NT AUTHORITY\NetworkService"
                                 "DOMAIN\svc-account"  = доменный аккаунт

Start             REG_DWORD      Тип запуска:
                                 0 = Boot    - драйвер, грузится ядром при загрузке
                                 1 = System  - драйвер, грузится после ядра
                                 2 = Auto    - автоматически при старте Windows
                                 3 = Manual  - вручную
                                 4 = Disabled - отключена

Type              REG_DWORD      Тип службы:
                                 1  = Kernel Driver
                                 2  = File System Driver
                                 16 = Win32 Own Process     (отдельный процесс)
                                 32 = Win32 Shared Process  (svchost, несколько служб в одном процессе)
                                 256 = Interactive Process  (может взаимодействовать с рабочим столом, устарело)

ErrorControl      REG_DWORD      Что делать при ошибке запуска:
                                 0 = Ignore  - игнорировать
                                 1 = Normal  - записать в лог, продолжить
                                 2 = Severe  - если возможно, откатить к последней удачной конфигурации
                                 3 = Critical - перезагрузить систему

DependOnService   REG_MULTI_SZ   Список служб, которые должны быть запущены раньше
DependOnGroup     REG_MULTI_SZ   Список групп служб, которые должны быть запущены раньше

Group             REG_SZ         Группа служб (для управления порядком загрузки)
```

### Параметры восстановления при сбое

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\

FailureActions    REG_BINARY     Закодированная структура SC_ACTION:
                                 - Действие 1 (после первого сбоя)
                                 - Действие 2 (после второго сбоя)
                                 - Действие 3 (после последующих сбоев)
                                 Возможные действия:
                                   SC_ACTION_NONE         - ничего
                                   SC_ACTION_RESTART      - перезапустить службу
                                   SC_ACTION_REBOOT       - перезагрузить компьютер
                                   SC_ACTION_RUN_COMMAND  - выполнить команду

FailureCommand    REG_SZ         Команда для SC_ACTION_RUN_COMMAND

ResetPeriod       REG_DWORD      Через сколько секунд сбросить счётчик отказов (в секундах)
```

### Параметры описания (подключ Description не всегда есть)

```
Для Win32 служб иногда хранится дополнительный подключ:

HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Parameters\
    - специфичные для службы настройки (у каждой свои)

HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Security\
    Security    REG_BINARY    Дескриптор безопасности (DACL) на саму службу
                              Определяет кто может управлять этой службой
```

---

## Типы запуска - подробнее

```
Boot (0):
  Используется только драйверами ядра.
  Загружается ядром Windows до запуска SCM.
  Пример: фильтр диска, антивирусный драйвер уровня ядра.

System (1):
  Используется только драйверами.
  Загружается SCM в самом начале его работы (фаза Session 0).
  Пример: драйвер файловой системы.

Automatic (2):
  Запускается SCM автоматически при старте.
  Существуют два варианта:
    - Обычный Auto:         запускается во время загрузки
    - Delayed Auto Start:   запускается через некоторое время ПОСЛЕ загрузки
                            (параметр DelayedAutostart = 1)
  Пример: Windows Update, Print Spooler, DHCP Client.

Manual (3):
  Не запускается автоматически.
  Запускается по требованию - другой службой, программой или вручную.
  Пример: Windows Search (запускается когда нужен поиск).

Disabled (4):
  Нельзя запустить никаким способом пока не изменить тип.
  Используется для отключения ненужных служб.
```

```
Delayed Auto Start - зачем:
При обычном Auto все службы стартуют одновременно → перегружают систему при загрузке.
Delayed позволяет разгрузить загрузку: некритичные службы стартуют позже, когда Desktop уже отображён.

Параметр в реестре:
HKLM\SYSTEM\CurrentControlSet\Services\<Name>\DelayedAutostart = 1
```

---

## Аккаунты служб

То, от имени кого работает служба, определяет её права в системе.

### Встроенные аккаунты

```
LocalSystem (SYSTEM):
  ObjectName: "LocalSystem" или ".\LocalSystem"
  - Самые высокие привилегии в локальной системе
  - При обращении к сети представляется как <COMPUTERNAME>$
  - Имеет доступ ко всем локальным ресурсам
  - Использовать только когда действительно необходимо
  - Пример служб: Windows Defender, BITS

LocalService (LOCAL SERVICE):
  ObjectName: "NT AUTHORITY\LocalService"
  - Урезанные привилегии (меньше, чем у обычного пользователя)
  - При обращении к сети использует анонимные учётные данные
  - Подходит для служб без сетевого доступа
  - Пример: Windows Time, LightweightDirectory Access Client

NetworkService (NETWORK SERVICE):
  ObjectName: "NT AUTHORITY\NetworkService"
  - Урезанные привилегии локально
  - При обращении к сети представляется как <COMPUTERNAME>$ (как SYSTEM)
  - Подходит для служб, которым нужна сетевая аутентификация
  - Пример: DNS Client, Remote Procedure Call (RPC)
```

### Managed Service Accounts (MSA) и Group Managed Service Accounts (gMSA)

```
MSA (Managed Service Account):
  - Привязан к одному компьютеру
  - Пароль управляется автоматически AD (128 символов, меняется каждые 30 дней)
  - Не нужно знать пароль - AD сам синхронизирует
  - Поддерживает автоматическую регистрацию SPN
  - Формат имени: DOMAIN\accountname$
  - В реестре: ObjectName = "DOMAIN\accountname$"

gMSA (Group Managed Service Account):
  - Работает на нескольких компьютерах (группа машин)
  - То же автоматическое управление паролем
  - Используется для кластеров, NLB, IIS-ферм
  - Требует Windows Server 2012+ DC
  - Рекомендуется использовать вместо обычных сервисных аккаунтов

Обычный доменный аккаунт (не рекомендуется):
  - Пароль нужно знать и вводить при установке
  - Пароль может истечь → служба упадёт
  - Если пароль попадает в руки атакующего - риск выше
  - Использовать только если MSA/gMSA не подходит
```

### Принцип минимальных привилегий для служб

```
Порядок предпочтений (от безопасного к менее безопасному):

1. gMSA / MSA                   - лучший выбор для большинства служб
2. NetworkService                - если нужна сетевая аутентификация
3. LocalService                  - если сеть не нужна
4. Обычный доменный аккаунт     - только если MSA не подходит
5. LocalSystem                   - только если необходимы максимальные права

Никогда не запускать службы от Domain Admin!
```

---

## Типы служб: Own Process vs Shared Process (svchost)

Большинство встроенных служб Windows не живут в отдельном процессе - они упакованы в DLL и запускаются внутри `svchost.exe`.

### Own Process (Type = 16)

```
Служба имеет собственный exe-файл и запускается как отдельный процесс.

ImagePath: "C:\Program Files\MyApp\myservice.exe"

Каждый такой процесс виден в диспетчере задач отдельно.
Примеры: SQL Server, Apache, nginx как служба.
```

### Shared Process - svchost (Type = 32)

```
Служба реализована в DLL и загружается внутрь svchost.exe.
Несколько служб могут работать в одном svchost процессе.

ImagePath службы: "C:\Windows\System32\svchost.exe -k <GroupName>"

Реальный код службы указан в подключе:
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Parameters\
    ServiceDll    REG_EXPAND_SZ    "C:\Windows\System32\wuaueng.dll"

Группы svchost задаются в:
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Svchost\
    netsvcs     REG_MULTI_SZ    (список служб в группе netsvcs)
    LocalService REG_MULTI_SZ   (список служб в группе LocalService)
    ...
```

### Изоляция svchost в Windows 10/Server 2019+

```
До Windows 10 1703 / Server 2016:
  Много служб в одном svchost → один сбой или компрометация DLL
  затрагивает все службы в группе.

Начиная с Windows 10 1703 на машинах с ≥3.5 ГБ RAM:
  Каждая служба запускается в отдельном svchost процессе.
  Это называется SvcHost Split или Service Isolation.
  Стало намного сложнее скрывать вредоносные DLL среди системных служб.

Как увидеть что в каком svchost:
  Tasklist /svc                    - показывает службы в каждом процессе
  services.msc → свойства процесса → путь к файлу
  Process Explorer (Sysinternals)  - лучший вариант
```

---

## Состояния служб

```
SERVICE_STOPPED          - остановлена
SERVICE_START_PENDING    - в процессе запуска
SERVICE_STOP_PENDING     - в процессе остановки
SERVICE_RUNNING          - запущена и работает
SERVICE_CONTINUE_PENDING - в процессе возобновления после паузы
SERVICE_PAUSE_PENDING    - в процессе паузы
SERVICE_PAUSED           - на паузе (не все службы поддерживают)

Не все переходы возможны. Например:
  RUNNING → STOP_PENDING → STOPPED
  STOPPED → START_PENDING → RUNNING
  RUNNING → PAUSE_PENDING → PAUSED → CONTINUE_PENDING → RUNNING
```

---

## Зависимости служб

Служба может объявить, что ей для работы нужны другие службы или группы служб. SCM гарантирует правильный порядок запуска.

```
DependOnService:
  Конкретные службы. Если зависимость не запущена и не может быть запущена -
  эта служба тоже не запустится.

DependOnGroup:
  Группа служб. Достаточно чтобы хоть одна служба из группы была запущена.

Пример: Рабочая станция (lanmanworkstation) зависит от:
  - NSI  (Network Store Interface)
  - MRxSmb20 (SMB2 Mini-Redirector)
  - Bowser (Network Browser Driver)
```

```
Посмотреть зависимости:
  services.msc → ПКМ на службе → Свойства → вкладка "Зависимости"
  sc qc <servicename>         -> показывает DependOnService
  Get-Service <name> | Select-Object -ExpandProperty DependentServices
  Get-Service <name> | Select-Object -ExpandProperty ServicesDependedOn
```

---

## Безопасность служб: DACL на службу

Каждая служба имеет свой дескриптор безопасности (Security Descriptor), отдельный от дескриптора файла exe. Он хранится в реестре:

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>\Security\
    Security    REG_BINARY    (бинарный DACL)
```

DACL службы определяет кто может:

```
SERVICE_QUERY_CONFIG       - читать конфигурацию
SERVICE_CHANGE_CONFIG      - изменять конфигурацию (тип запуска, ImagePath!)
SERVICE_QUERY_STATUS       - читать статус
SERVICE_ENUMERATE_DEPENDENTS - перечислять зависимые службы
SERVICE_START              - запускать
SERVICE_STOP               - останавливать
SERVICE_PAUSE_CONTINUE     - ставить на паузу
SERVICE_INTERROGATE        - запрашивать текущий статус
SERVICE_USER_DEFINED_CONTROL - пользовательские команды

SERVICE_ALL_ACCESS         - всё перечисленное
```

```
Важно для безопасности:
  SERVICE_CHANGE_CONFIG для непривилегированного пользователя = критическая уязвимость!
  Атакующий может изменить ImagePath → перенаправить на вредоносный exe.

Проверить DACL службы:
  sc sdshow <servicename>
  Результат: строка SDDL (Security Descriptor Definition Language)

Пример SDDL:
  D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)     - SYSTEM: полный доступ
     (A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)  - Administrators: полный доступ
     (A;;CCLCSWLOCRRC;;;IU)          - Interactive Users: старт/стоп/запрос

Проверить все службы с избыточными правами (инструмент):
  accesschk.exe -uwcv Everyone *     - из Sysinternals Suite
  accesschk.exe -uwcv "Users" *
```

---

## Путь до исполняемого файла (ImagePath) и кавычки

Классическая проблема безопасности - пути без кавычек (Unquoted Service Path).

```
Если ImagePath содержит пробелы и НЕ взят в кавычки:
  C:\Program Files\My Company\MyService\myservice.exe

Windows разбирает это слева направо, пробуя каждый токен как путь:
  1. C:\Program.exe                               <- если существует - запустит!
  2. C:\Program Files\My.exe                      <- если существует - запустит!
  3. C:\Program Files\My Company\MyService.exe    <- если существует - запустит!
  4. C:\Program Files\My Company\MyService\myservice.exe <- целевой файл

Атака: создать C:\Program.exe или C:\Program Files\My.exe
→ он запустится вместо настоящей службы, с правами той службы!

Правильно:
  ImagePath: "\"C:\Program Files\My Company\MyService\myservice.exe\""
  или:
  ImagePath: "C:\Program Files\My Company\MyService\myservice.exe"
  (в кавычках в реестре)

Найти уязвимые службы:
  wmic service get name,pathname | findstr /i /v "C:\Windows\\" | findstr /i /v "\""
```

---

## Файлы на диске

Помимо реестра, службы оставляют следы в нескольких местах:

```
Исполняемые файлы:
  C:\Windows\System32\         - системные службы Windows
  C:\Windows\SysWOW64\         - 32-битные системные компоненты на 64-бит Windows
  C:\Windows\System32\drivers\ - драйверы (kernel-mode службы, .sys файлы)
  C:\Program Files\            - сторонние службы (64-бит)
  C:\Program Files (x86)\      - сторонние службы (32-бит)

Логи:
  Системный журнал Windows Event Log (source: Service Control Manager):
  C:\Windows\System32\winevt\Logs\System.evtx
  EventID 7034 - аварийное завершение
  EventID 7036 - служба запущена/остановлена
  EventID 7045 - установка новой службы

  Собственные логи служб (у каждой свои):
  C:\Windows\System32\LogFiles\
  C:\ProgramData\<ProductName>\Logs\
  C:\Windows\Logs\
```

---

## Driver Signing и безопасность драйверов

Kernel-mode службы (драйверы) работают в кольце 0 и имеют полный доступ к системе.

```
Начиная с Windows 10 в режиме Secure Boot:
  Все драйверы должны быть подписаны Microsoft (WHQL или EV сертификат).
  Unsigned drivers = отказ загрузки.

Test Signing Mode:
  Режим разработки, где разрешены неподписанные драйверы.
  bcdedit /set testsigning on     <- включить (требует перезагрузки)
  bcdedit /set testsigning off    <- выключить

Driver Signature Enforcement отключается при загрузке F8 → Disable Driver Signature Enforcement.
  Только для одной сессии.
  Атакующие часто ищут способы обойти подпись → rootkits.

Проверить тестовый режим:
  bcdedit /enum | findstr testsigning
  При включённом - на рабочем столе видна надпись "Test Mode".

Защита ядра (Kernel Patch Protection, PatchGuard):
  В 64-бит Windows - защита критических структур ядра от патчинга.
  Активирована всегда, нельзя отключить через поддерживаемые интерфейсы.
```

---

## Как работает загрузка служб при старте Windows

Порядок загрузки важен для понимания того, что происходит при boot.

```
Фаза 1 - UEFI/BIOS и загрузчик:
  bootmgr → winload.exe (или winload.efi)
  Загружает ядро (ntoskrnl.exe) и HAL (hal.dll) в память.

Фаза 2 - Ядро инициализируется:
  ntoskrnl.exe инициализирует базовые подсистемы.
  Загружает Boot-драйверы (Start=0) - из реестра CurrentControlSet\Services.
  Примеры: disk.sys, storport.sys, volmgr.sys.

Фаза 3 - System драйверы:
  Загружаются System-драйверы (Start=1).
  Монтируются разделы, инициализируется файловая система.
  Примеры: ntfs.sys, tcpip.sys.

Фаза 4 - Сессия 0, SCM запускается:
  smss.exe → wininit.exe → services.exe (SCM)
  SCM запускает Auto-службы в порядке зависимостей.
  На этом этапе ещё нет Desktop/Explorer.

Фаза 5 - Вход пользователя:
  winlogon.exe → LogonUI → userinit.exe → explorer.exe
  Запускаются программы из Run/RunOnce.
  Delayed Auto Start службы запускаются после этого момента.
```

```
Понятие "Last Known Good Configuration":
  HKLM\SYSTEM\ содержит несколько ControlSet:
    ControlSet001    - первый набор (часто = текущий)
    ControlSet002    - второй набор (часто = последний удачный)
    CurrentControlSet - символическая ссылка на текущий

  При успешной загрузке системы - текущий ControlSet становится "Last Known Good".
  При загрузке с F8 → "Last Known Good Configuration":
    Windows переключается на последний удачный ControlSet,
    отменяя изменения драйверов/служб которые могли сломать систему.
```

---

## Управление службами - инструменты

### services.msc - графическая консоль

```
Запуск: Win+R → services.msc

Что можно:
  - Посмотреть все службы: имя, статус, тип запуска, аккаунт
  - Запустить, остановить, перезапустить, поставить на паузу
  - Изменить тип запуска
  - Настроить действия при сбое (вкладка "Восстановление")
  - Посмотреть зависимости
  - Изменить аккаунт (вкладка "Вход в систему")

Не отображает:
  - Kernel-mode службы (драйверы) - они там есть, но отфильтрованы
  - Детальный реестровый путь ImagePath
```

### sc.exe - основной CLI инструмент

```
sc - Service Control - прямая работа с SCM через API.

Основные команды:
  sc query                    - список запущенных служб
  sc query type= all          - все службы (в т.ч. остановленные)
  sc query <name>             - состояние конкретной службы
  sc qc <name>                - конфигурация службы (как в реестре)
  sc start <name>             - запустить
  sc stop <name>              - остановить
  sc config <name> start= auto  - изменить тип запуска
  sc config <name> obj= "NT AUTHORITY\LocalService"  - изменить аккаунт
  sc create <name> binPath= "C:\path\svc.exe" - создать службу
  sc delete <name>            - удалить службу
  sc sdshow <name>            - показать DACL службы (в формате SDDL)
  sc sdset <name> <SDDL>      - установить DACL
  sc failure <name> reset= 3600 actions= restart/5000/restart/10000  - настроить восстановление

Важно: пробел после = обязателен в sc.exe!
  sc config myservice start= auto   <- правильно
  sc config myservice start=auto    <- ОШИБКА
```

### Tasklist /svc

```
tasklist /svc
  Показывает: PID, имя процесса, и какие службы в нём работают.
  Особенно полезно для svchost.exe - видно какие службы сидят в каком PID.

Пример вывода:
  svchost.exe    1234    DcomLaunch, PlugPlay, Power
  svchost.exe    2345    AudioSrv, Audiosrv
  svchost.exe    3456    wuauserv, WaaSMedicSvc
```

---

## Службы в контексте безопасности

### Типичные векторы атак

```
1. Подмена ImagePath (если есть SERVICE_CHANGE_CONFIG):
   Атакующий меняет путь к исполняемому файлу на вредоносный.
   Следующий перезапуск службы → запуск вредоноса с правами службы.

2. Замена исполняемого файла:
   Если нет защиты от записи на файл exe службы,
   атакующий заменяет его вредоносным.

3. Unquoted Service Path (описано выше):
   Создание C:\Program.exe или аналогичного файла.

4. DLL Hijacking в svchost службах:
   Служба грузит DLL по небезопасному пути.
   Атакующий подкладывает вредоносную DLL раньше настоящей.

5. Вредоносная служба как персистентность:
   sc create MalSvc binPath= "C:\malware.exe" start= auto
   EventID 7045 в System log - признак установки новой службы.
   Популярный индикатор компрометации.
```

### Что проверять при расследовании

```
В реестре:
  HKLM\SYSTEM\CurrentControlSet\Services\
  Подозрительные признаки:
  - Незнакомые имена служб
  - ImagePath указывает на TEMP, AppData, корень диска
  - ImagePath без кавычек с пробелами (UQP уязвимость)
  - ObjectName = LocalSystem у службы которой это не нужно
  - Служба с Type=32 (svchost) но без ServiceDll в Parameters

В журнале событий:
  System.evtx:
    EventID 7045 - новая служба установлена
    EventID 7034 - аварийное завершение службы
    EventID 7040 - изменение типа запуска

На диске:
  Исполняемые файлы служб вне C:\Windows\ и C:\Program Files\
  .exe или .dll в нестандартных местах (Temp, AppData, корень C:\)

DACL служб:
  Запустить accesschk.exe (Sysinternals):
    accesschk.exe -uwcv "Users" *       - права группы Users на службы
    accesschk.exe -uwcv Everyone *      - права Everyone
  Найти службы где непривилегированные пользователи имеют
  SERVICE_CHANGE_CONFIG или GENERIC_WRITE.
```

---

## Шпаргалка

```
SCM = services.exe
  - читает конфигурацию служб из реестра
  - запускает службы в нужном порядке (зависимости)
  - мониторит состояние, реагирует на сбои
  - принимает команды от sc.exe / services.msc / PowerShell

Реестр служб:
  HKLM\SYSTEM\CurrentControlSet\Services\<Name>\
    ImagePath       - путь к exe / dll
    Start           - 0=Boot, 1=System, 2=Auto, 3=Manual, 4=Disabled
    Type            - 16=OwnProcess, 32=SharedProcess(svchost)
    ObjectName      - аккаунт запуска
    DependOnService - зависимости

Аккаунты (от безопасного к привилегированному):
  LocalService       - минимум прав, нет сети
  NetworkService     - минимум прав, есть сеть (как ComputerName$)
  gMSA / MSA         - автоматический пароль, best practice
  LocalSystem        - максимум прав (использовать осторожно)

Типы запуска:
  Auto              - при старте системы
  Delayed Auto      - после загрузки Desktop (DelayedAutostart=1)
  Manual            - по требованию
  Disabled          - нельзя запустить

svchost и ServiceDll:
  Тип 32 = служба живёт в svchost.exe
  Реальный код: Parameters\ServiceDll
  Группа svchost: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Svchost\

Безопасность - что проверять:
  Unquoted Service Path    - пути с пробелами без кавычек
  Weak service DACL        - accesschk.exe -uwcv Everyone *
  Нестандартный ImagePath  - вне Windows\ и Program Files\
  EventID 7045             - новая служба (возможная персистентность)

Инструменты:
  services.msc             - GUI управление
  sc.exe                   - CLI, прямая работа с SCM
  tasklist /svc            - какие службы в каком PID (svchost)
  accesschk.exe            - проверка DACL служб
  Process Explorer         - полная картина процессов и служб
```

---

## Ссылки

- [Microsoft Docs: Services](https://learn.microsoft.com/en-us/windows/win32/services/services) - официальная документация по Services API
- [Microsoft Docs: SCM](https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager) - Service Control Manager
- [Sysinternals: accesschk](https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk) - проверка прав на службы
- [Sysinternals: Process Explorer](https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer) - анализ процессов и служб
- [MITRE ATT&CK: New Service](https://attack.mitre.org/techniques/T1543/003/) - персистентность через службы
- [MITRE ATT&CK: Unquoted Service Path](https://attack.mitre.org/techniques/T1574/009/) - привилегии через UQP
