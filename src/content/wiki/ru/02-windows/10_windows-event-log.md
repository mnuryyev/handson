---
title: "Windows - Event Log (Security, System, Application)"
date: "2026-05-13"
---

Event Log - централизованная система логирования Windows. Операционная система, драйверы, службы и приложения пишут в неё структурированные записи о том, что происходит: ошибки, предупреждения, входы пользователей, изменения политик, сбои служб. Без понимания Event Log невозможно ни диагностировать проблемы, ни расследовать инциденты.

---

## Где хранятся логи

```
Физически файлы логов лежат здесь:
C:\Windows\System32\winevt\Logs\

Основные файлы:
├── Application.evtx       - лог Application
├── Security.evtx          - лог Security
├── System.evtx            - лог System
├── Setup.evtx             - лог Setup
├── Microsoft-Windows-*    - сотни специализированных каналов
│   ├── TaskScheduler%4Operational.evtx
│   ├── PowerShell%4Operational.evtx
│   ├── TerminalServices-LocalSessionManager%4Operational.evtx
│   └── ...
└── ForwardedEvents.evtx   - пересланные события с других машин

Формат файлов: .evtx (бинарный XML формат, появился в Vista)
Старый формат: .evt (до Vista, до Windows Server 2003)
```

```
Реестровые ключи конфигурации логов:
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\

Каждый лог имеет свой подраздел:
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Security\
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\System\
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Application\

Важные параметры в каждом подразделе:
  File        - путь к .evtx файлу
  MaxSize     - максимальный размер (байты)
  Retention   - политика перезаписи
```

---

## Структура события (Event)

```
Каждое событие в логе содержит следующие поля:

┌─────────────────────────────────────────────────────────────────┐
│ Log Name:      Security                                          │
│ Source:        Microsoft-Windows-Security-Auditing              │
│ Date:          2026-05-12 14:32:11                               │
│ Event ID:      4624                                              │
│ Task Category: Logon                                             │
│ Level:         Information                                       │
│ Keywords:      Audit Success                                     │
│ User:          SYSTEM                                            │
│ Computer:      DC01.contoso.com                                  │
│ Description:   An account was successfully logged on.           │
│                                                                  │
│ Subject:                                                         │
│   Security ID:      SYSTEM                                       │
│   Account Name:     DC01$                                        │
│   Account Domain:   CONTOSO                                      │
│   Logon ID:         0x3E7                                        │
│                                                                  │
│ Logon Information:                                               │
│   Logon Type:       3                                            │
│   ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

```
Описание полей:

Log Name       - к какому логу относится (Security / System / Application / ...)
Source         - кто сгенерировал событие (программа, служба, компонент ОС)
Event ID       - числовой идентификатор типа события
                 Один и тот же Event ID всегда означает одно и то же
Task Category  - категория события внутри источника
Level          - серьёзность:
                   Information  - штатная работа
                   Warning      - потенциальная проблема
                   Error        - что-то сломалось
                   Critical     - критический сбой (используется редко)
                   Verbose      - подробный вывод (в операционных логах)
Keywords       - теги события:
                   Audit Success  - успешное действие с аудитом
                   Audit Failure  - неудачная попытка с аудитом
                   Classic        - событие старого формата
User           - пользователь, в контексте которого сгенерировано событие
Computer       - имя компьютера, на котором произошло событие
Description    - текстовое описание + XML-данные (EventData)
```

```
Внутри каждого события есть XML-структура с полями данных (EventData).
Это самая полезная часть - именно там хранятся детали:
имена пользователей, IP адреса, типы операций, пути к файлам и т.д.

Пример XML события 4624:
<Event>
  <System>
    <EventID>4624</EventID>
    <TimeCreated SystemTime="2026-05-12T14:32:11.123456789Z"/>
    <Computer>DC01.contoso.com</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-18</Data>
    <Data Name="SubjectUserName">DC01$</Data>
    <Data Name="SubjectDomainName">CONTOSO</Data>
    <Data Name="TargetUserSid">S-1-5-21-...-1234</Data>
    <Data Name="TargetUserName">alice.smith</Data>
    <Data Name="TargetDomainName">CONTOSO</Data>
    <Data Name="LogonType">3</Data>
    <Data Name="IpAddress">192.168.1.55</Data>
    <Data Name="IpPort">49152</Data>
    <Data Name="WorkstationName">WKS001</Data>
    <Data Name="AuthenticationPackageName">Kerberos</Data>
  </EventData>
</Event>
```

---

## Три основных лога

### Security Log

```
Назначение: аудит безопасности - кто вошёл, кто что сделал, кто пытался и не смог.
Источник:   Microsoft-Windows-Security-Auditing
Записывает: только ядро Windows (Local Security Authority, LSA)
            Никакое приложение не может писать в Security от своего имени

Два вида записей:
  Audit Success  - действие выполнено успешно (зелёный замок)
  Audit Failure  - попытка неудачна (красный замок)

Кто управляет тем, что туда пишется: политика аудита (Audit Policy)
  Без включённой политики аудита - Security Log пустой!

Расположение файла:
  C:\Windows\System32\winevt\Logs\Security.evtx

Размер по умолчанию: 20 MB (мало! на DC нужно минимум 1-4 GB)
```

```
Категории аудита и что они логируют:

Account Logon
  - Kerberos аутентификация (на DC)
  - NTLM аутентификация (на DC)
  - Проверка credentials

Logon/Logoff
  - Интерактивный вход/выход
  - Сетевой вход
  - Удалённый рабочий стол
  - Screensaver lock/unlock

Account Management
  - Создание/удаление/изменение пользователей
  - Изменение паролей
  - Создание/удаление групп
  - Добавление/удаление из групп

Directory Service Access (только на DC)
  - Обращения к объектам AD
  - Изменение объектов AD

Object Access
  - Доступ к файлам (если настроен SACL на файлах)
  - Доступ к реестру
  - Доступ к принтерам

Policy Change
  - Изменение политики аудита
  - Изменение прав пользователей
  - Изменение политики IPSec / Kerberos

Privilege Use
  - Использование привилегий (SeDebugPrivilege, SeTakeOwnershipPrivilege и др.)

Process Tracking
  - Создание и завершение процессов
  - Загрузка DLL
  - Активность процессов

System
  - Запуск/выключение системы
  - Изменение системного времени
  - Очистка Security Log (важно!)
```

### System Log

```
Назначение: события ядра Windows, драйверов и системных служб.
            Проблемы с оборудованием, сбои служб, сетевые события.
Источник:   Windows-компоненты, драйверы, службы

Что там интересного:
  - Запуск и остановка служб (Service Control Manager)
  - Сбои драйверов
  - Ошибки диска (Disk errors)
  - Изменения конфигурации сети
  - NTP синхронизация времени
  - Изменения групповых политик (применение GPO)
  - BSOD (Stop Error) - запись перед перезагрузкой
  - Неожиданные перезагрузки / выключения
  - Изменения NTP (критично для Kerberos!)

Расположение: C:\Windows\System32\winevt\Logs\System.evtx
Размер по умолчанию: 20 MB
```

### Application Log

```
Назначение: события приложений и программных компонентов.
Источник:   любое приложение, которое умеет писать в Event Log

Что там пишут:
  - Microsoft SQL Server - ошибки, запуск/остановка
  - IIS - ошибки, предупреждения (хотя у IIS есть свои логи)
  - .NET Framework - необработанные исключения
  - COM/DCOM ошибки
  - Windows Installer - установка/удаление программ
  - Антивирусы, агенты мониторинга

Особенность: ЛЮБОЕ приложение может писать в Application Log.
             Источник (Source) определяет кто написал.
             Одно и то же Event ID от разных источников означает разное!

Расположение: C:\Windows\System32\winevt\Logs\Application.evtx
Размер по умолчанию: 20 MB
```

### Setup Log

```
Назначение: события установки Windows и компонентов.
Источник:   Windows Setup, Windows Update

Что там:
  - Установка / удаление ролей и компонентов Windows
  - Установка Windows Updates
  - Этапы установки ОС

Расположение: C:\Windows\System32\winevt\Logs\Setup.evtx
```

---

## Специализированные каналы (Operational Logs)

```
Помимо четырёх классических логов, Windows содержит сотни
специализированных каналов. Они живут в папке:
C:\Windows\System32\winevt\Logs\

И в Event Viewer: Applications and Services Logs → Microsoft → Windows

Наиболее полезные для диагностики и расследований:
```

```
Microsoft-Windows-PowerShell/Operational
  - Команды PowerShell (если включён Script Block Logging)
  - Загрузка модулей
  - Ошибки выполнения скриптов
  Файл: ...PowerShell%4Operational.evtx

Microsoft-Windows-PowerShell/Admin
  - Критические ошибки PowerShell engine

Microsoft-Windows-TaskScheduler/Operational
  - Запуск и завершение задач планировщика
  - Ошибки выполнения задач
  Файл: ...TaskScheduler%4Operational.evtx

Microsoft-Windows-TerminalServices-LocalSessionManager/Operational
  - Подключение/отключение RDP сессий
  - Теневые сессии
  Файл: ...TerminalServices-LocalSessionManager%4Operational.evtx

Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational
  - Входящие RDP подключения
  - Network Level Authentication (NLA)

Microsoft-Windows-WinRM/Operational
  - WinRM (PowerShell Remoting) сессии
  - Входящие и исходящие соединения

Microsoft-Windows-Bits-Client/Operational
  - BITS задачи (фоновая передача файлов)
  - Часто используется malware для загрузки payload

Microsoft-Windows-DNS-Client/Operational
  - DNS запросы клиента (очень подробно)
  - Полезно для расследования C2 коммуникаций

Microsoft-Windows-Sysmon/Operational
  - Если установлен Sysmon (Sysinternals)
  - Создание процессов, сетевые соединения, изменения реестра
  - Золотой стандарт для threat hunting
```

---

## Политика аудита

```
Security Log пустой или почти пустой = политика аудита не настроена.
Это наиболее частая причина отсутствия нужных событий.

Два способа настройки политики аудита:

1. Basic Audit Policy (старый)
   GPO: Computer Configuration → Windows Settings →
        Security Settings → Local Policies → Audit Policy
   9 категорий, грубое управление

2. Advanced Audit Policy (рекомендуется)
   GPO: Computer Configuration → Windows Settings →
        Security Settings → Advanced Audit Policy Configuration
   58 подкатегорий, тонкое управление
   Появилась в Windows Vista / Server 2008

Просмотр текущей политики аудита:
  auditpol /get /category:*           - все категории
  auditpol /get /subcategory:*        - все подкатегории
  auditpol /get /subcategory:"Logon"  - конкретная подкатегория

Результат:
  Machine Name: DC01
  System audit policy
  Category/Subcategory        Setting
  Logon/Logoff
    Logon                     Success and Failure
    Logoff                    Success
  Account Logon
    Kerberos Authentication Service  Success and Failure
```

```
Минимальные рекомендуемые настройки (Advanced Audit Policy):

Account Logon:
  Credential Validation              - Success, Failure
  Kerberos Authentication Service    - Success, Failure
  Kerberos Service Ticket Operations - Success, Failure

Account Management:
  User Account Management            - Success, Failure
  Security Group Management          - Success, Failure
  Computer Account Management        - Success, Failure

Logon/Logoff:
  Logon                              - Success, Failure
  Logoff                             - Success
  Special Logon                      - Success
  Account Lockout                    - Failure

Object Access:
  File System                        - Success, Failure (только на важных папках через SACL)

Policy Change:
  Audit Policy Change                - Success, Failure

Privilege Use:
  Sensitive Privilege Use            - Success, Failure

Process Tracking (опционально, шумно):
  Process Creation                   - Success

DS Access (только на DC):
  Directory Service Access           - Success, Failure
  Directory Service Changes          - Success
```

---

## Самые важные Event ID

### Security Log - Аутентификация и вход

```
4624  Успешный вход в систему
      Поля: TargetUserName, LogonType, IpAddress, WorkstationName, AuthenticationPackage
      LogonType:
        2  = Interactive (физический вход)
        3  = Network (сетевой вход, SMB, UNC)
        4  = Batch (задачи планировщика)
        5  = Service (вход службы)
        7  = Unlock (разблокировка экрана)
        8  = NetworkCleartext (WinRM с Basic, IIS Basic Auth)
        9  = NewCredentials (runas /netonly)
        10 = RemoteInteractive (RDP)
        11 = CachedInteractive (вход по кэшированным credentials при недоступности DC)

4625  Неудачная попытка входа
      Поля: TargetUserName, FailureReason, Status, SubStatus
      Status/SubStatus коды:
        0xC000006A = неверный пароль
        0xC0000064 = пользователь не существует
        0xC0000234 = учётная запись заблокирована
        0xC0000072 = учётная запись отключена
        0xC000006F = вход за пределами разрешённого времени
        0xC0000070 = запрещённая рабочая станция
        0xC0000193 = срок действия учётной записи истёк
        0xC0000071 = срок действия пароля истёк

4634  Завершение сессии (Logoff)
      Сопоставляется с 4624 через LogonID

4647  Инициированный пользователем выход (Logoff)

4648  Вход с явным указанием credentials (runas, Network Drive с другими credentials)
      Поля: TargetUserName, TargetServerName, TargetInfo

4672  Особые привилегии назначены новой сессии
      Происходит сразу после 4624 для привилегированных аккаунтов
      Поля: SubjectUserName, PrivilegeList
      Если видишь SeDebugPrivilege, SeImpersonatePrivilege - это интересно

4768  Запрос Kerberos TGT (AS-REQ / AS-REP) - только на DC
      Поля: TargetUserName, IpAddress, TicketEncryptionType, Status
      EncryptionType 0x17 (RC4) = потенциальный Kerberoasting / AS-REP roasting

4769  Запрос Kerberos Service Ticket (TGS-REQ) - только на DC
      Поля: ServiceName, TicketEncryptionType, IpAddress
      EncryptionType 0x17 + ServiceName не krbtgt = подозрительный Kerberoasting

4771  Неудачный запрос Kerberos TGT (pre-auth failed)
      Поля: ClientAddress, FailureCode
      Много 4771 с одного IP = брутфорс Kerberos

4776  Попытка NTLM аутентификации - только на DC
      Поля: TargetUserName, Workstation, Status
      Даже если аутентификация через Kerberos, при pass-through это видно здесь
```

### Security Log - Управление учётными записями

```
4720  Создана учётная запись пользователя
      Поля: SubjectUserName (кто создал), TargetUserName (кого создали)

4722  Учётная запись включена (enabled)

4723  Попытка изменить пароль (пользователь меняет свой)
      Поля: TargetUserName, SubjectUserName

4724  Попытка сбросить пароль (администратор сбрасывает чужой)
      Поля: TargetUserName, SubjectUserName

4725  Учётная запись отключена (disabled)

4726  Учётная запись удалена

4738  Учётная запись изменена
      Поля: TargetUserName + список изменённых атрибутов

4740  Учётная запись заблокирована
      Поля: TargetUserName, CallerComputerName (с какой машины была попытка)
      CallerComputerName помогает найти источник блокировки

4767  Учётная запись разблокирована

4781  Переименована учётная запись

4732  Пользователь добавлен в группу (Security Group)
      Поля: MemberName, GroupName, SubjectUserName

4733  Пользователь удалён из группы

4727  Создана глобальная Security Group
4731  Создана локальная Security Group
4754  Создана Universal Group

4728  Добавлен в глобальную группу
4729  Удалён из глобальной группы
4756  Добавлен в Universal группу
```

### Security Log - Система и политики

```
1102  Security Log очищен
      Поля: SubjectUserName
      Очистка лога - серьёзный сигнал!
      На обычной машине не должно быть вообще

4616  Изменено системное время
      Поля: SubjectUserName, PreviousTime, NewTime
      Изменение времени может нарушить Kerberos

4697  Установлена новая служба
      Поля: ServiceName, ServiceFileName, ServiceStartType, SubjectUserName
      Новая служба = потенциальный persistence механизм

4698  Создана задача планировщика
4699  Удалена задача планировщика
4702  Задача планировщика изменена
      Поля: TaskName, SubjectUserName, TaskContent

4688  Создан новый процесс
      (нужно включить Process Creation в Audit Policy)
      Поля: NewProcessName, ProcessId, ParentProcessId, CommandLine (если включено)
      CommandLine логируется отдельно - нужно включить через GPO или реестр

4689  Процесс завершён

4657  Изменён параметр реестра
      (нужен SACL на ключ реестра)
      Поля: ObjectName, OldValue, NewValue

4663  Попытка доступа к объекту (файл, реестр, AD объект)
      (нужен SACL на объект)

4670  Изменены разрешения объекта (ACL изменён)

4907  Изменены параметры аудита объекта (SACL изменён)
```

### System Log - Ключевые события

```
7045  Установлена новая служба
      (это дубль 4697 из Security, но в System видно даже без политики аудита)
      Поля: ServiceName, ImagePath, ServiceType, StartType, ServiceAccount

7036  Служба изменила состояние (запущена / остановлена)
      Поля: ServiceName, param2 (running / stopped)

7034  Служба неожиданно завершилась (crashed)

7031  Служба неожиданно завершилась, будут попытки перезапуска

6005  Служба Event Log запущена (= система загрузилась)

6006  Служба Event Log остановлена (= система выключается корректно)

6008  Предыдущее выключение было неожиданным (BSOD / выдёргивание питания)
      Поля: time (время последнего нормального события перед падением)

41    Система была перезагружена без корректного выключения
      (Kernel-Power) - внезапное отключение питания или BSOD

1074  Система выключена / перезагружена
      Поля: кто инициировал, причина, тип (выключение/перезагрузка)

4199  Обнаружен конфликт IP адресов

20    Ошибка диска (Disk)

4226 / 4227  Проблемы с временем (W32Time)
```

### Application Log - Ключевые события

```
Источник: MsiInstaller
  1033  Установка приложения завершена
  1034  Удаление приложения завершено
  11707 / 11708  Установка через MSI успешна / неудача

Источник: Windows Error Reporting
  1001  Crash report (приложение упало)
        Поля: AppName, AppPath, ModuleName
        Полезно для диагностики повторяющихся падений

Источник: .NET Runtime
  1026  Необработанное исключение .NET приложения
        Поля: stack trace

Источник: Application Error
  1000  Сбой приложения (App Crash)
        Поля: AppName, AppVersion, ModuleName, FaultOffset

Источник: MSSQLSERVER (SQL Server)
  17111 SQL Server запущен
  18452 Неудачный вход в SQL Server
  33090 SQL Server остановлен
```

---

## Event Viewer - интерфейс

```
Запуск: eventvwr.msc  (или Win+R → eventvwr)

Структура дерева в Event Viewer:

Event Viewer (Local)
├── Custom Views                  ← кастомные фильтры (очень удобно!)
│   ├── Administrative Events    ← показывает Warning+Error из всех логов
│   └── (твои фильтры)
├── Windows Logs
│   ├── Application
│   ├── Security
│   ├── Setup
│   ├── System
│   └── Forwarded Events
└── Applications and Services Logs
    ├── Hardware Events
    ├── Internet Explorer
    ├── Microsoft
    │   └── Windows
    │       ├── PowerShell
    │       │   ├── Admin
    │       │   └── Operational
    │       ├── TaskScheduler
    │       │   └── Operational
    │       ├── TerminalServices-LocalSessionManager
    │       │   └── Operational
    │       └── ...сотни других...
    └── Subscriptions
```

```
Фильтрация событий в Event Viewer:

Правая кнопка на логе → Filter Current Log

Поля фильтра:
  Logged:     диапазон дат (Last hour / 12 hours / 24 hours / 7 days / 30 days / Custom)
  Event level: Critical / Error / Warning / Information / Verbose
  Event sources: конкретный источник (например, Security-Auditing)
  Event IDs:  4624, 4625, 4740   (через запятую или диапазон 4620-4640)
  Computer:   имя компьютера (для Forwarded Events)
  User:       конкретный пользователь (через XML фильтр)

XML фильтр (мощнее GUI):
  Вкладка XML → Edit query manually → вставить XPath запрос

Пример XPath: найти Event 4625 от конкретного пользователя
<QueryList>
  <Query Id="0" Path="Security">
    <Select Path="Security">
      *[System[EventID=4625]]
      and
      *[EventData[Data[@Name='TargetUserName']='alice.smith']]
    </Select>
  </Query>
</QueryList>
```

---

## Размер логов и политика перезаписи

```
По умолчанию Windows настроена очень консервативно.
Для серьёзных систем эти настройки недостаточны.

Настройка через GPO:
Computer Configuration → Administrative Templates →
Windows Components → Event Log Service → Security (или System/Application)

Параметры:
  Maximum Log Size (KB)           - максимальный размер лога
  Log Access                      - права доступа к логу
  Retain old events               - поведение при заполнении

Поведение при заполнении (три режима):
  Overwrite events as needed      - перезаписывать старые (по умолчанию)
  Archive log when full           - архивировать при заполнении
  Do not overwrite events         - не перезаписывать (рискованно - лог просто переполнится)

Рекомендуемые размеры:
  Security.evtx на DC      - 4 GB minimum, лучше 16 GB
  Security.evtx на сервере - 512 MB - 1 GB
  Security.evtx на клиенте - 128 - 256 MB
  System.evtx              - 128 - 256 MB
  Application.evtx         - 128 - 256 MB
```

```
Почему маленькие логи - это проблема:

При атаке на DC с активным аудитом Security Log может заполняться
со скоростью 100 MB+ в час.
При размере 20 MB (default) лог перезапишется полностью через 12 минут.
Это значит что следы атаки будут безвозвратно потеряны.

Настройка реестра напрямую (эквивалентно GPO):
HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Security\
  MaxSize = 0x40000000  (1 GB в hex = 1073741824 байт)

HKLM\SYSTEM\CurrentControlSet\Services\EventLog\System\
  MaxSize = 0x8000000   (128 MB)
```

---

## Centralized Logging - Windows Event Forwarding

```
Windows Event Forwarding (WEF) - встроенный механизм для пересылки событий
с множества машин на централизованный коллектор.

Без WEF: нужно заходить на каждую машину и смотреть лог локально.
С WEF:   все события собираются на одном Windows Event Collector (WEC) сервере,
          видны в разделе "Forwarded Events" Event Viewer.

Архитектура:
  ┌──────────────────────────────────────────────────────────────┐
  │  Source Machines (десятки или тысячи)                        │
  │  WKS001, WKS002, SERVER01, DC01 ...                          │
  └──────────────┬───────────────────────────────────────────────┘
                 │ WinRM (порт 5985 / 5986)
                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Windows Event Collector (WEC)                               │
  │  Один или несколько серверов-коллекторов                     │
  │  C:\Windows\System32\winevt\Logs\ForwardedEvents.evtx        │
  └──────────────────────────────────────────────────────────────┘

Два режима подписки:
  Collector-Initiated (Push):  коллектор опрашивает источники
  Source-Initiated (Pull):     источники сами отправляют через GPO
  На практике чаще используется Source-Initiated через GPO.

Важно понимать:
  WEF - это только транспорт. Для поиска по собранным логам
  нужен дополнительный инструмент: SIEM (Splunk, Elastic, Sentinel) или
  хотя бы PowerShell / wevtutil на коллекторе.
```

---

## Инструменты работы с логами

### Event Viewer (GUI)

```
Встроенный инструмент Windows.
Достаточен для разовой диагностики и просмотра отдельных событий.
Неудобен для анализа больших объёмов или поиска по нескольким машинам.
```

### wevtutil (командная строка)

```
wevtutil - встроенная утилита командной строки для работы с Event Log.

# Список всех логов
wevtutil el

# Информация о логе (размер, количество событий)
wevtutil gl Security

# Экспорт лога в файл
wevtutil epl Security C:\backup\security.evtx

# Очистить лог (с архивированием)
wevtutil cl Security /bu:C:\backup\security_backup.evtx

# Запрос событий (вывод в текст)
wevtutil qe Security /q:"*[System[EventID=4624]]" /c:10 /f:text

# Запрос с XPath фильтром
wevtutil qe Security /q:"*[System[(EventID=4625) and TimeCreated[timediff(@SystemTime) <= 3600000]]]"
# timediff в миллисекундах: 3600000 = 1 час

# Просмотр лога с удалённой машины
wevtutil qe Security /r:SERVER01 /u:admin /p:password
```

### Sysmon (Sysinternals)

```
Sysmon (System Monitor) - бесплатный инструмент Sysinternals/Microsoft.
Устанавливается как драйвер и служба Windows.
Пишет подробные события в:
  Microsoft-Windows-Sysmon/Operational

Что логирует Sysmon (выборочно):
  Event 1   - Process Create (с полным CommandLine и хешами)
  Event 2   - File creation time changed
  Event 3   - Network Connection (TCP/UDP с процессом-инициатором)
  Event 4   - Sysmon service state changed
  Event 5   - Process Terminated
  Event 6   - Driver Loaded (с хешем)
  Event 7   - Image Loaded (DLL с хешем)
  Event 8   - CreateRemoteThread (инъекция кода!)
  Event 10  - Process Access (OpenProcess - dump LSASS!)
  Event 11  - File Created
  Event 12/13/14 - Registry changes
  Event 15  - File stream created (ADS - Alternate Data Streams)
  Event 17/18 - Named Pipe
  Event 22  - DNS Query (процесс + запрошенное имя)
  Event 23  - File Deleted

Sysmon Event 10 (ProcessAccess) с TargetImage=lsass.exe -
почти всегда означает попытку дампа credentials (Mimikatz и аналоги).
```

---

## Практические сценарии

### Расследование неудачных входов и блокировки

```
Сценарий: пользователь alice.smith заблокирована. Откуда идут попытки?

Что искать:
1. Event 4740 (Account Locked Out) на DC
   → поле CallerComputerName = имя машины, с которой шли попытки

2. Event 4625 (Failed Logon) на DC и на машине из п.1
   → поля: IpAddress, WorkstationName, LogonType

3. Если LogonType = 3 (Network) - проверить запланированные задачи,
   службы, mapped drives с сохранёнными credentials на той машине

Типичные причины блокировки:
  - Старый пароль в запланированной задаче
  - Служба запускается от имени пользователя со старым паролем
  - Мобильное устройство с сохранённым паролём
  - Приложение с hardcoded credentials
  - Реальный брутфорс
```

### Расследование подозрительного входа

```
Сценарий: обнаружен вход в 3 часа ночи из необычной страны

Что искать в Security Log:
1. Event 4624 с LogonType 10 (RDP) или 3 (Network)
   → поля: IpAddress, TargetUserName, LogonID

2. По LogonID найти Event 4647 или 4634 (когда вышли)
   → вычислить продолжительность сессии

3. Event 4672 после 4624 → были ли привилегии?

4. Event 4688 (Process Creation) с тем же LogonID
   → что запускали в этой сессии?

5. В Microsoft-Windows-TerminalServices-LocalSessionManager/Operational
   → Event 21 (Logon), 23 (Logoff), 24 (Disconnect), 25 (Reconnect)
   → там видна полная история RDP сессий с IP
```

### Обнаружение нового persistence-механизма

```
Сценарий: на машине появилась подозрительная служба

Что искать:
1. Security Log - Event 4697 (Service installed)
   → ServiceName, ServiceFileName, SubjectUserName

2. System Log - Event 7045 (New service installed)
   → то же самое, дублируется без необходимости включения аудита

3. Security Log - Event 4698 (Scheduled task created)
   → TaskName, TaskContent (содержит XML с командой!)

4. Application Log - MsiInstaller Event 1033
   → если установлено через MSI

По ServiceFileName проверить:
   - путь нестандартный (не C:\Windows\System32\)?
   - имя похоже на легитимное но чуть изменено (svchost32.exe)?
   - в пути есть temp, appdata, users?
```

---

## Шпаргалка по Event ID

```
АУТЕНТИФИКАЦИЯ
  4624  Успешный вход
  4625  Неудачный вход
  4634  Logoff
  4647  Инициированный Logoff
  4648  Вход с явными credentials
  4672  Привилегированная сессия открыта
  4768  Kerberos TGT запрос (DC)
  4769  Kerberos ST запрос (DC)
  4771  Kerberos pre-auth failed (DC)
  4776  NTLM аутентификация (DC)
  4740  Аккаунт заблокирован
  4767  Аккаунт разблокирован

УПРАВЛЕНИЕ АККАУНТАМИ
  4720  Создан пользователь
  4722  Аккаунт включён
  4723  Пользователь меняет пароль
  4724  Сброс пароля администратором
  4725  Аккаунт отключён
  4726  Аккаунт удалён
  4738  Аккаунт изменён
  4732  Добавлен в группу
  4733  Удалён из группы

СИСТЕМА / ПРОЦЕССЫ
  4688  Создан процесс (нужен аудит)
  4689  Процесс завершён
  4697  Новая служба установлена
  4698  Задача планировщика создана
  4616  Изменено системное время
  1102  Security Log очищен (!)

SYSTEM LOG
  7045  Новая служба (без аудита)
  7036  Служба запущена/остановлена
  6005  Система загружена
  6006  Система выключена
  6008  Неожиданное выключение
  1074  Инициированное выключение/перезагрузка

SYSMON (если установлен)
  1     Создание процесса
  3     Сетевое подключение
  8     CreateRemoteThread (инъекция!)
  10    Доступ к процессу (lsass dump!)
  22    DNS запрос
```

---

## Ссылки

- [Windows Security Log Encyclopedia](https://www.ultimatewindowssecurity.com/securitylog/encyclopedia/) - расшифровка всех Event ID
- [Event Log Best Practices](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/audit-policy-recommendations) - рекомендации Microsoft
- [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - установка и документация
- [NSA Event Forwarding Guidance](https://github.com/nsacyber/Event-Forwarding-Guidance) - что именно собирать через WEF
- [EVTX Attack Samples](https://github.com/sbousseaden/EVTX-ATTACK-SAMPLES) - реальные примеры логов атак
- [Audit Policy Recommendations](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/audit-policy-recommendations) - политика аудита
