---
title: "Windows - WMI / CIM"
date: "2026-05-13"
---

WMI (Windows Management Instrumentation) — инфраструктура для управления и мониторинга Windows-систем. Позволяет читать конфигурацию системы, состояние оборудования, запущенные процессы, службы — и всё это единообразно, локально и удалённо, через один интерфейс.

CIM (Common Information Model) — международный стандарт (DMTF), на котором основан WMI. Начиная с PowerShell 3.0 Microsoft предоставляет CIM-командлеты (`Get-CimInstance` и др.) как современную замену старым WMI-командлетам (`Get-WmiObject`).

---

## Архитектура WMI

```
┌─────────────────────────────────────────────────────────────┐
│                   Клиентские приложения                     │
│   PowerShell  │  wmic.exe  │  WBEMTest  │  Сторонние утилиты│
└───────────────┴────────────┴────────────┴───────────────────┘
                          │
                          │  WMI API (COM/DCOM или WS-Man)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     WMI Service                             │
│                   winmgmt (winmgmt.exe)                     │
│                  Служба: winmgmt                            │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  WMI         │  │  CIM         │  │  WMI         │
│  Repository  │  │  Providers   │  │  Providers   │
│  (база данных│  │ (собирают    │  │ (Win32,      │
│  схемы)      │  │  данные)     │  │  MSFT_*, ...) │
└──────────────┘  └──────────────┘  └──────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Операционная система │
              │  Оборудование         │
              │  Реестр               │
              │  Файловая система     │
              └───────────────────────┘
```

### Ключевые компоненты

```
winmgmt.exe (winmgmt):
  Основная служба WMI. Работает внутри svchost.exe.
  Принимает запросы, маршрутизирует их к провайдерам, возвращает данные.
  При остановке winmgmt — WMI полностью недоступен.

WMI Repository:
  База данных схемы WMI: описание всех классов, пространств имён, свойств.
  Расположение: C:\Windows\System32\wbem\Repository\
  Файлы: OBJECTS.DATA, INDEX.BTR, MAPPING*.MAP
  Повреждение репозитория → WMI не работает (можно пересоздать: winmgmt /resetrepository)

WMI Providers:
  DLL-файлы, которые реально собирают данные.
  Каждый провайдер отвечает за свой набор классов.
  Расположение: C:\Windows\System32\wbem\*.dll
  Примеры:
    cimwin32.dll   - Win32_Process, Win32_Service, Win32_LogicalDisk, ...
    wmiprvse.exe   - хост-процесс для провайдеров (WMI Provider Host)
    wbemcons.dll   - WMI Event subscriptions
```

---

## Пространства имён (Namespaces)

WMI организован в иерархию пространств имён. Классы живут внутри пространств имён.

```
root\
├── root\CIMV2          ← основное, Win32_* классы здесь
│   ├── Win32_Process
│   ├── Win32_Service
│   ├── Win32_LogicalDisk
│   └── ... (сотни классов)
├── root\Microsoft
│   ├── root\Microsoft\Windows
│   │   ├── root\Microsoft\Windows\Storage    - диски, тома, разделы (MSFT_*)
│   │   ├── root\Microsoft\Windows\DNS        - DNS сервер
│   │   └── root\Microsoft\Windows\DHCP
│   └── root\Microsoft\SqlServer             - SQL Server
├── root\StandardCimv2  ← современные MSFT_Net* классы (сеть)
│   ├── MSFT_NetIPAddress
│   ├── MSFT_NetRoute
│   └── MSFT_NetTCPConnection
├── root\SecurityCenter2 ← антивирусы, фаервол, Windows Defender
│   ├── AntiVirusProduct
│   └── FirewallProduct
├── root\WMI             ← классы WDM (драйверы)
├── root\DEFAULT         ← системные классы
├── root\SECURITY        ← политики безопасности
└── root\subscription    ← WMI Event Subscriptions (постоянные подписки!)
```

```powershell
# Посмотреть все пространства имён
Get-CimInstance -Namespace root -ClassName __Namespace | Select-Object Name

# Рекурсивно все пространства имён
function Get-WmiNamespace {
    param([string]$Namespace = "root")
    Get-CimInstance -Namespace $Namespace -ClassName __Namespace |
        ForEach-Object {
            $child = "$Namespace\$($_.Name)"
            $child
            Get-WmiNamespace -Namespace $child
        }
}
```

---

## WMI vs CIM: в чём разница

```
Параметр              Get-WmiObject (старый)        Get-CimInstance (новый)
──────────────────────────────────────────────────────────────────────────────
Появился в            PowerShell v1                 PowerShell v3
Транспорт удалённый   DCOM (порт 135 + случайные)   WS-Man (порт 5985/5986)
Работает на           Windows only                  Windows + Linux + macOS
Возвращает            ManagementObject              CimInstance
Методы                Через .InvokeMethod()         Через Invoke-CimMethod
Сессии                Нет                           CimSession (переиспользование)
Скорость              Медленнее                     Быстрее
Рекомендуется         Нет (deprecated)              Да
```

```
DCOM vs WS-Man для удалённых запросов:
  DCOM (Get-WmiObject -ComputerName):
    - Требует порт 135 (RPC Endpoint Mapper) + случайные высокие порты
    - Сложно проходит через firewall
    - Старый протокол, меньше безопасности

  WS-Man (Get-CimInstance через CimSession):
    - Порт 5985 (HTTP) или 5986 (HTTPS)
    - Тот же транспорт что PowerShell Remoting
    - Современный, удобен для firewall
    - Требует включённый WinRM на целевой машине
```

---

## WQL — язык запросов WMI

WQL (WMI Query Language) — подмножество SQL для запросов к WMI. Используется внутри `Get-CimInstance -Query` и в Event Subscriptions.

```sql
-- Базовый синтаксис
SELECT * FROM Win32_Process
SELECT Name, ProcessId, WorkingSetSize FROM Win32_Process
SELECT * FROM Win32_Process WHERE Name = 'notepad.exe'
SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3
SELECT * FROM Win32_Service WHERE State = 'Running' AND StartMode = 'Auto'

-- LIKE с wildcards
SELECT * FROM Win32_Process WHERE Name LIKE 'chrome%'
SELECT * FROM Win32_Service WHERE Name LIKE '%sql%'

-- IS NULL / IS NOT NULL
SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPAddress IS NOT NULL

-- Вложенные запросы (ASSOCIATORS OF, REFERENCES OF)
-- Найти все диски для данного компьютера
ASSOCIATORS OF {Win32_ComputerSystem.Name='MYPC'}
    WHERE AssocClass = Win32_SystemDiskPartitions

-- Event Query (мониторинг событий)
SELECT * FROM __InstanceCreationEvent WITHIN 5
    WHERE TargetInstance ISA 'Win32_Process'

SELECT * FROM __InstanceModificationEvent WITHIN 10
    WHERE TargetInstance ISA 'Win32_Service'
    AND TargetInstance.Name = 'Spooler'
```

```powershell
# Использование WQL в PowerShell
Get-CimInstance -Query "SELECT * FROM Win32_Process WHERE Name = 'notepad.exe'"
Get-CimInstance -Query "SELECT * FROM Win32_LogicalDisk WHERE DriveType = 3" -Namespace root\CIMV2
```

---

## Ключевые классы: Win32 и MSFT

### Система и оборудование

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_OperatingSystem        ОС                            Caption, Version, BuildNumber,
                                                           LastBootUpTime, FreePhysicalMemory,
                                                           TotalVisibleMemorySize, OSArchitecture

Win32_ComputerSystem         Компьютер                     Name, Domain, Manufacturer, Model,
                                                           TotalPhysicalMemory, NumberOfProcessors,
                                                           UserName (текущий пользователь)

Win32_Processor              CPU                           Name, NumberOfCores,
                                                           NumberOfLogicalProcessors,
                                                           MaxClockSpeed, LoadPercentage,
                                                           SocketDesignation

Win32_PhysicalMemory         Физическая RAM (планки)       Capacity, Speed, MemoryType,
                                                           BankLabel, DeviceLocator

Win32_BIOS                   BIOS / UEFI                   Manufacturer, SMBIOSBIOSVersion,
                                                           ReleaseDate, SerialNumber

Win32_BaseBoard              Материнская плата             Manufacturer, Product, SerialNumber,
                                                           Version

Win32_SystemEnclosure        Корпус / форм-фактор          ChassisTypes (1=Other, 3=Desktop,
                                                           8=Notebook, 12=Docking, 23=Blade)

Win32_VideoController        Видеокарта                    Name, AdapterRAM, DriverVersion,
                                                           VideoModeDescription

Win32_SoundDevice            Звуковое устройство           Name, Manufacturer, Status
```

### Диски и хранилище

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_DiskDrive              Физический диск               Model, Size, InterfaceType,
                                                           MediaType, SerialNumber, Status

Win32_DiskPartition          Раздел диска                  DeviceID, DiskIndex, Index,
                                                           Size, Type, BootPartition

Win32_LogicalDisk            Логический диск (буква)       DeviceID, DriveType, Size,
                                                           FreeSpace, FileSystem, VolumeName
                                                           DriveType: 2=Removable, 3=Local,
                                                           4=Network, 5=CD, 6=RAM

Win32_Volume                 Том (включая без буквы)       Name, Capacity, FreeSpace,
                                                           DriveLetter, FileSystem, Label,
                                                           BootVolume, SystemVolume

MSFT_Disk                    Физический диск (новый)       FriendlyName, Size,
(root\Microsoft\Windows\Storage) OperationalStatus, PartitionStyle

MSFT_Partition               Раздел (новый)                DriveLetter, Size,
                                                           IsSystem, IsActive

MSFT_Volume                  Том (новый)                   DriveLetter, Size,
                                                           SizeRemaining, FileSystem
```

### Процессы и службы

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_Process                Процессы                      ProcessId, Name, CommandLine,
                                                           ExecutablePath, ParentProcessId,
                                                           WorkingSetSize, KernelModeTime,
                                                           UserModeTime, CreationDate,
                                                           SessionId, ThreadCount

Win32_Service                Службы                        Name, DisplayName, State,
                                                           StartMode, PathName, StartName,
                                                           ProcessId, Description

Win32_StartupCommand         Автозагрузка                  Name, Command, Location, User
                                                           (реестр Run, папки Startup)

Win32_ScheduledJob           Задания планировщика (AT)     JobId, Command, RunRepeatedly
                             (только старый формат AT)
```

### Сеть

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_NetworkAdapter         Сетевые адаптеры              Name, MACAddress, Speed,
                                                           AdapterType, NetEnabled,
                                                           PhysicalAdapter

Win32_NetworkAdapterConfiguration  Конфигурация адаптера   IPAddress, IPSubnet,
                                                           DefaultIPGateway, MACAddress,
                                                           DNSServerSearchOrder,
                                                           DHCPEnabled, DNSDomain

MSFT_NetIPAddress            IP адреса (новый)             IPAddress, PrefixLength,
(root\StandardCimv2)                                       InterfaceAlias, AddressFamily

MSFT_NetRoute                Таблица маршрутизации         DestinationPrefix, NextHop,
(root\StandardCimv2)                                       InterfaceAlias, RouteMetric

MSFT_NetTCPConnection        TCP соединения                LocalAddress, LocalPort,
(root\StandardCimv2)                                       RemoteAddress, RemotePort,
                                                           State, OwningProcess

Win32_NetworkConnection      Сетевые подключения           LocalName, RemoteName,
                             (mapped drives)               Status, UserName

Win32_Share                  Сетевые папки                 Name, Path, Type, Description,
                                                           AllowMaximum, MaximumAllowed
```

### Пользователи и безопасность

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_UserAccount            Локальные пользователи        Name, SID, Disabled, Lockout,
                                                           PasswordRequired, PasswordChangeable,
                                                           PasswordExpires, LocalAccount

Win32_Group                  Локальные группы              Name, SID, LocalAccount,
                                                           Description

Win32_GroupUser              Членство в группах            GroupComponent, PartComponent
                             (ассоциация)

Win32_LoggedOnUser           Кто сейчас залогинен          Antecedent (пользователь),
                                                           Dependent (сессия)

Win32_LogonSession           Активные сессии               LogonId, LogonType, StartTime
                                                           LogonType: 2=Interactive,
                                                           3=Network, 4=Batch, 5=Service,
                                                           7=Unlock, 10=RemoteInteractive

Win32_Account                Все аккаунты (users+groups)   Name, SID, SIDType, Domain
```

### Программное обеспечение

```
Класс                        Описание                      Ключевые свойства
────────────────────────────────────────────────────────────────────────────────
Win32_Product                Установленное ПО (MSI)        Name, Version, Vendor,
                             ВНИМАНИЕ: очень медленно!     InstallDate, InstallLocation
                             Вызывает reconfiguration      Caption, IdentifyingNumber
                             каждого MSI продукта.
                             Лучше читать реестр напрямую.

Win32_QuickFixEngineering    Установленные обновления      HotFixID, InstalledOn,
                             (то же что Get-HotFix)        Description, InstalledBy

Win32_PnPEntity              Plug and Play устройства      Name, DeviceID, Status,
                                                           ClassGuid, Manufacturer
```

---

## Практические примеры

### Системная информация

```powershell
# Полная информация об ОС
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber,
    OSArchitecture, InstallDate, LastBootUpTime,
    @{N="UptimeDays";    E={[math]::Round(((Get-Date) - $_.LastBootUpTime).TotalDays, 1)}},
    @{N="FreeRAM_GB";    E={[math]::Round($_.FreePhysicalMemory / 1MB, 2)}},
    @{N="TotalRAM_GB";   E={[math]::Round($_.TotalVisibleMemorySize / 1MB, 2)}}

# Производитель и модель
Get-CimInstance Win32_ComputerSystem |
    Select-Object Name, Manufacturer, Model, Domain,
        @{N="RAM_GB"; E={[math]::Round($_.TotalPhysicalMemory/1GB, 1)}}

# CPU детально
Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer,
    NumberOfCores, NumberOfLogicalProcessors,
    @{N="MaxGHz"; E={[math]::Round($_.MaxClockSpeed/1000, 2)}},
    LoadPercentage, SocketDesignation

# Планки памяти
Get-CimInstance Win32_PhysicalMemory |
    Select-Object BankLabel, DeviceLocator,
        @{N="Capacity_GB"; E={[math]::Round($_.Capacity/1GB, 0)}},
        Speed, MemoryType

# Форм-фактор (ноутбук или десктоп)
$chassis = (Get-CimInstance Win32_SystemEnclosure).ChassisTypes
# 3=Desktop, 4=LowProfile, 8=Notebook, 9=Laptop, 10=Notebook, 12=Docking, 23=Blade
```

### Диски

```powershell
# Логические диски — свободное место
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Select-Object DeviceID, VolumeName, FileSystem,
        @{N="Total_GB";   E={[math]::Round($_.Size/1GB, 1)}},
        @{N="Free_GB";    E={[math]::Round($_.FreeSpace/1GB, 1)}},
        @{N="Free_Pct";   E={[math]::Round($_.FreeSpace/$_.Size*100, 1)}},
        @{N="Status";     E={
            if ($_.FreeSpace/$_.Size -lt 0.05) {"CRITICAL"}
            elseif ($_.FreeSpace/$_.Size -lt 0.15) {"WARNING"}
            else {"OK"}
        }}

# Физические диски
Get-CimInstance Win32_DiskDrive |
    Select-Object Model, InterfaceType,
        @{N="Size_GB"; E={[math]::Round($_.Size/1GB, 0)}},
        MediaType, SerialNumber, Status

# Карта разделов
Get-CimInstance Win32_DiskPartition |
    Select-Object DiskIndex, Index, Type,
        @{N="Size_GB"; E={[math]::Round($_.Size/1GB, 1)}},
        BootPartition, PrimaryPartition
```

### Процессы

```powershell
# Все процессы с командной строкой (важно для безопасности)
Get-CimInstance Win32_Process |
    Select-Object ProcessId, Name, CommandLine,
        ExecutablePath, ParentProcessId,
        @{N="RAM_MB"; E={[math]::Round($_.WorkingSetSize/1MB, 1)}},
        CreationDate |
    Sort-Object RAM_MB -Descending

# Найти процесс по командной строке
Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%powershell%'"

# Получить владельца процесса (нужен метод)
Get-CimInstance Win32_Process -Filter "Name='notepad.exe'" | ForEach-Object {
    $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwner
    [PSCustomObject]@{
        PID    = $_.ProcessId
        Name   = $_.Name
        User   = "$($owner.Domain)\$($owner.User)"
        CmdLine = $_.CommandLine
    }
}

# Дерево процессов (parent-child)
$procs = Get-CimInstance Win32_Process
$procs | ForEach-Object {
    $parent = $procs | Where-Object ProcessId -eq $_.ParentProcessId
    [PSCustomObject]@{
        PID        = $_.ProcessId
        Name       = $_.Name
        ParentPID  = $_.ParentProcessId
        ParentName = $parent.Name
    }
} | Sort-Object ParentName, Name | Format-Table
```

### Сеть

```powershell
# IP конфигурация (только активные адаптеры)
Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" |
    Select-Object Description, MACAddress,
        @{N="IP";      E={$_.IPAddress -join ", "}},
        @{N="Mask";    E={$_.IPSubnet -join ", "}},
        @{N="Gateway"; E={$_.DefaultIPGateway -join ", "}},
        @{N="DNS";     E={$_.DNSServerSearchOrder -join ", "}},
        DHCPEnabled, DNSDomain

# Современный способ (MSFT классы)
Get-CimInstance -Namespace root\StandardCimv2 -ClassName MSFT_NetIPAddress |
    Where-Object { $_.AddressFamily -eq 2 } |   # 2=IPv4, 23=IPv6
    Select-Object IPAddress, PrefixLength, InterfaceAlias

# TCP соединения с именами процессов
Get-CimInstance -Namespace root\StandardCimv2 -ClassName MSFT_NetTCPConnection |
    Where-Object { $_.State -eq 5 } |   # 5=Established
    Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort,
        @{N="Process"; E={(Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)").Name}},
        OwningProcess

# Общие сетевые папки
Get-CimInstance Win32_Share |
    Select-Object Name, Path, Type, Description,
        @{N="TypeName"; E={
            switch ($_.Type) {
                0 {"Disk"}; 1 {"Print"}; 2 {"Device"};
                3 {"IPC"}; 2147483648 {"Admin Disk"}
            }
        }}
```

### Пользователи и сессии

```powershell
# Локальные пользователи
Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" |
    Select-Object Name, SID, Disabled, Lockout,
        PasswordRequired, PasswordChangeable, PasswordExpires

# Кто сейчас залогинен
Get-CimInstance Win32_LoggedOnUser | ForEach-Object {
    $session = [wmi]$_.Dependent
    $account = [wmi]$_.Antecedent
    [PSCustomObject]@{
        User      = $account.Name
        Domain    = $account.Domain
        LogonType = $session.LogonType
        LogonId   = $session.LogonId
    }
} | Select-Object -Unique Domain, User, LogonType

# Активные сессии (с типом входа)
Get-CimInstance Win32_LogonSession |
    Select-Object LogonId, StartTime,
        @{N="LogonType"; E={
            @{2="Interactive";3="Network";4="Batch";5="Service";
              7="Unlock";10="RemoteInteractive";11="CachedInteractive"}[$_.LogonType]
        }}
```

### Службы через WMI

```powershell
# Все службы с путями (для проверки безопасности)
Get-CimInstance Win32_Service |
    Select-Object Name, DisplayName, State, StartMode,
        PathName, StartName, ProcessId |
    Sort-Object State, Name

# Службы запущенные не от стандартных аккаунтов
Get-CimInstance Win32_Service |
    Where-Object {
        $_.StartName -notmatch "^(LocalSystem|NT AUTHORITY|NT SERVICE)" -and
        $_.State -eq "Running"
    } |
    Select-Object Name, StartName, PathName

# Службы с незакавыченным путём (Unquoted Service Path)
Get-CimInstance Win32_Service |
    Where-Object {
        $_.PathName -notmatch '^"' -and
        $_.PathName -match ' ' -and
        $_.PathName -notlike "C:\Windows\*"
    } |
    Select-Object Name, PathName
```

### Автозагрузка

```powershell
# WMI покрывает часть мест автозагрузки
Get-CimInstance Win32_StartupCommand |
    Select-Object Name, Command, Location, User

# Location содержит откуда взята команда:
# "HKU\<SID>\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
# "Startup"  (папка автозагрузки)
# "Common Startup"
```

---

## Методы WMI: вызов действий

Классы WMI не только читают данные — они могут выполнять действия через методы.

```powershell
# Посмотреть методы класса
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassMethods | Select-Object Name, Parameters

# Завершить процесс
$proc = Get-CimInstance Win32_Process -Filter "Name='notepad.exe'"
Invoke-CimMethod -InputObject $proc -MethodName Terminate

# Создать процесс
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
    -Arguments @{ CommandLine = "cmd.exe /c dir C:\ > C:\out.txt" }
# ReturnValue: 0 = успех, 2 = Access Denied, 9 = Path Not Found

# Изменить пароль локального пользователя
$user = Get-CimInstance Win32_UserAccount -Filter "Name='alice' AND LocalAccount=True"
Invoke-CimMethod -InputObject $user -MethodName SetPassword `
    -Arguments @{ Password = "NewPassword123!" }

# Управление службами
$svc = Get-CimInstance Win32_Service -Filter "Name='Spooler'"
Invoke-CimMethod -InputObject $svc -MethodName StopService
Invoke-CimMethod -InputObject $svc -MethodName StartService
Invoke-CimMethod -InputObject $svc -MethodName ChangeStartMode `
    -Arguments @{ StartMode = "Disabled" }

# Методы Win32_OperatingSystem
$os = Get-CimInstance Win32_OperatingSystem
Invoke-CimMethod -InputObject $os -MethodName Reboot
Invoke-CimMethod -InputObject $os -MethodName Shutdown
```

---

## WMI Event Subscriptions

WMI поддерживает подписку на события: уведомления о создании/изменении/удалении объектов WMI, изменениях реестра, файловой системы, и даже просто на периодические уведомления по расписанию.

Существуют два вида подписок:

```
Временные (Temporary):
  Живут только пока жива PowerShell сессия.
  Register-CimIndicationEvent / Register-WmiEvent
  Используются для мониторинга в скриптах.

Постоянные (Permanent):
  Хранятся в WMI Repository в root\subscription.
  Работают даже после перезагрузки, без залогиненного пользователя.
  Требуют три объекта: Filter + Consumer + Binding.
  ОЧЕНЬ ПОПУЛЯРНЫ У АТАКУЮЩИХ — надёжная персистентность.
```

### Временные подписки (мониторинг)

```powershell
# Мониторинг запуска новых процессов
$query = "SELECT * FROM __InstanceCreationEvent WITHIN 2
          WHERE TargetInstance ISA 'Win32_Process'"

Register-CimIndicationEvent -Query $query -SourceIdentifier "NewProcess" `
    -Action {
        $proc = $Event.SourceEventArgs.NewEvent.TargetInstance
        Write-Host "Новый процесс: $($proc.Name) PID=$($proc.ProcessId) CMD=$($proc.CommandLine)"
    }

# Мониторинг изменений реестра
$query = "SELECT * FROM RegistryValueChangeEvent
          WHERE Hive='HKEY_LOCAL_MACHINE'
          AND KeyPath='SYSTEM\\CurrentControlSet\\Services'
          AND ValueName='ImagePath'"

Register-WmiEvent -Query $query -SourceIdentifier "RegChange" `
    -Action { Write-Host "Изменён ImagePath службы!" }

# Посмотреть активные подписки
Get-EventSubscriber

# Удалить подписку
Unregister-Event -SourceIdentifier "NewProcess"
```

### Постоянные подписки (и почему это важно для безопасности)

```
Три объекта в root\subscription:

1. __EventFilter    — фильтр: какое событие слушать (WQL-запрос)
2. __EventConsumer  — потребитель: что делать при срабатывании
   - CommandLineEventConsumer  — выполнить команду
   - ActiveScriptEventConsumer — выполнить скрипт (VBScript/JScript)
   - NTEventLogEventConsumer   — записать в журнал
   - SMTPEventConsumer          — отправить email
   - LogFileEventConsumer       — записать в файл
3. __FilterToConsumerBinding — связь между Filter и Consumer
```

```powershell
# Пример постоянной подписки (persistence-техника!)
# Запускать cmd.exe каждые 60 секунд (пример для понимания механики)

# 1. Создать фильтр
$filterArgs = @{
    Name           = "MyFilter"
    EventNameSpace = "root\CIMV2"
    QueryLanguage  = "WQL"
    Query          = "SELECT * FROM __TimerEvent WHERE TimerID = 'MyTimer'"
}
$filter = New-CimInstance -Namespace root\subscription `
    -ClassName __EventFilter -Property $filterArgs

# 2. Создать таймер
$timerArgs = @{
    TimerID        = "MyTimer"
    IntervalBetweenEvents = 60000   # миллисекунды
}
New-CimInstance -Namespace root\subscription `
    -ClassName __IntervalTimerInstruction -Property $timerArgs

# 3. Создать consumer
$consumerArgs = @{
    Name            = "MyConsumer"
    CommandLineTemplate = "cmd.exe /c whoami > C:\out.txt"
}
$consumer = New-CimInstance -Namespace root\subscription `
    -ClassName CommandLineEventConsumer -Property $consumerArgs

# 4. Связать
$bindingArgs = @{
    Filter   = [ref]$filter
    Consumer = [ref]$consumer
}
New-CimInstance -Namespace root\subscription `
    -ClassName __FilterToConsumerBinding -Property $bindingArgs
```

### Обнаружение постоянных WMI подписок (Blue Team)

```powershell
# Проверить все постоянные фильтры
Get-CimInstance -Namespace root\subscription -ClassName __EventFilter |
    Select-Object Name, Query, EventNamespace

# Проверить всех consumers
Get-CimInstance -Namespace root\subscription -ClassName __EventConsumer |
    Select-Object Name, *Command*, *Script*

Get-CimInstance -Namespace root\subscription -ClassName CommandLineEventConsumer |
    Select-Object Name, CommandLineTemplate

Get-CimInstance -Namespace root\subscription -ClassName ActiveScriptEventConsumer |
    Select-Object Name, ScriptText, ScriptFileName

# Проверить все binding-и (связи)
Get-CimInstance -Namespace root\subscription -ClassName __FilterToConsumerBinding |
    Select-Object Filter, Consumer

# Удалить подозрительную подписку
$filter = Get-CimInstance -Namespace root\subscription -ClassName __EventFilter `
    -Filter "Name='SuspiciousFilter'"
Remove-CimInstance -InputObject $filter

# Лог событий для WMI активности
Get-WinEvent -LogName "Microsoft-Windows-WMI-Activity/Operational" -MaxEvents 50 |
    Where-Object { $_.Id -eq 5861 }   # 5861 - обнаружена постоянная подписка
```

---

## CimSession: эффективная работа с удалёнными машинами

```powershell
# Создать сессию (одно TCP-соединение, переиспользуется)
$session = New-CimSession -ComputerName Server01

# С другими учётными данными
$cred    = Get-Credential
$session = New-CimSession -ComputerName Server01 -Credential $cred

# Несколько машин
$sessions = New-CimSession -ComputerName "Server01", "Server02", "Server03"

# Использовать сессию для нескольких запросов
Get-CimInstance Win32_OperatingSystem -CimSession $session
Get-CimInstance Win32_LogicalDisk    -CimSession $session
Get-CimInstance Win32_Process        -CimSession $session

# Запрос сразу к нескольким сессиям (параллельно)
Get-CimInstance Win32_OperatingSystem -CimSession $sessions |
    Select-Object PSComputerName, Caption, LastBootUpTime

# Управление сессиями
Get-CimSession          # активные сессии
Remove-CimSession $session

# Принудительно использовать DCOM вместо WS-Man
$opt     = New-CimSessionOption -Protocol Dcom
$session = New-CimSession -ComputerName Server01 -SessionOption $opt
```

---

## wmic.exe — командная строка WMI

`wmic.exe` — встроенный CLI для WMI. В Windows 11 помечен как deprecated, но всё ещё работает и часто встречается в скриптах и атаках.

```cmd
:: Базовый синтаксис
wmic <alias> [where <filter>] get <property> [/format:<fmt>]

:: Информация об ОС
wmic os get Caption, Version, BuildNumber, LastBootUpTime

:: Процессы
wmic process list brief
wmic process where "name='notepad.exe'" get ProcessId, CommandLine
wmic process where "ProcessId=1234" delete     <- завершить процесс

:: Службы
wmic service list brief
wmic service where "name='Spooler'" get Name, State, PathName, StartName
wmic service where "name='Spooler'" call StartService
wmic service where "name='Spooler'" call StopService

:: Диски
wmic logicaldisk where "DriveType=3" get DeviceID, Size, FreeSpace, FileSystem

:: Установленное ПО
wmic product get Name, Version, Vendor, InstallDate

:: Обновления
wmic qfe get HotFixID, InstalledOn, Description

:: Пользователи
wmic useraccount list brief

:: Сетевые адаптеры
wmic nic get Name, MACAddress, Speed, NetEnabled

:: Запросы к удалённой машине
wmic /node:Server01 os get Caption, Version
wmic /node:Server01 /user:domain\admin /password:pass process list brief

:: Вывод в разных форматах
wmic os get Caption /format:csv
wmic os get Caption /format:value    <- key=value формат
wmic os get Caption /format:list     <- вертикальный список
wmic os get Caption /format:htable   <- HTML таблица

:: Вывод всех свойств
wmic os get /format:list
```

---

## Безопасность WMI

### WMI как вектор атаки

```
WMI используется атакующими для:

1. Разведка (Discovery):
   Get-CimInstance Win32_ComputerSystem  - имя, домен
   Get-CimInstance Win32_UserAccount     - локальные пользователи
   Get-CimInstance Win32_Share           - расшаренные папки
   Get-CimInstance Win32_Process         - запущенные процессы
   Стандартная техника - трудно отличить от легитимной активности

2. Lateral Movement (WMI Exec):
   Invoke-CimMethod -ClassName Win32_Process -MethodName Create
       -Arguments @{ CommandLine = "powershell.exe -enc ..." }
       -ComputerName TargetPC
   Аналог PsExec, но встроенный. Не создаёт новую службу.
   Процесс запускается в сессии 0.

3. Persistence (WMI Subscriptions):
   Постоянные подписки в root\subscription.
   Выживают после перезагрузки.
   Запускаются без пользователя.
   Сложно обнаружить без целенаправленной проверки.

4. Exfiltration через WMI:
   Данные кодируются и записываются в свойства WMI объектов.
   Читаются с другой машины через WMI запрос.
   C2 канал через WMI (Kali → WMI → Target).

MITRE ATT&CK:
   T1047  - Windows Management Instrumentation (exec)
   T1546.003 - Event Subscription (persistence)
```

### Защита и мониторинг WMI

```
Управление доступом к WMI:
  WMI использует собственные DACL (не NTFS).
  Настройка: wmimgmt.msc → ПКМ на "WMI Control" → Properties → Security
  
  Права по умолчанию:
    Administrators: полный доступ ко всем namespace
    NETWORK SERVICE: ограниченный доступ
    LOCAL SERVICE: ограниченный доступ

  Минимально необходимые права для удалённого WMI:
    - Enable Account  (для входа в namespace)
    - Remote Enable   (для удалённого доступа)
    - Read Security   (опционально)

Firewall для WMI:
  DCOM (Get-WmiObject): TCP 135 + динамические порты → сложно разрешить точечно
  WS-Man (Get-CimInstance): TCP 5985/5986 → точечно управляется

Логирование WMI активности:
  Журнал: Microsoft-Windows-WMI-Activity/Operational
  EventID 5857 - загрузка провайдера
  EventID 5858 - ошибка провайдера
  EventID 5859 - новый постоянный фильтр (!! — возможная атака)
  EventID 5860 - временная подписка
  EventID 5861 - постоянная подписка активирована (!! — важно!)

Детектирование WMI-based атак:
  1. Проверить root\subscription на нестандартные объекты
  2. Смотреть EventID 5861 в WMI-Activity/Operational
  3. Процесс WmiPrvSE.exe (WMI Provider Host) порождающий дочерние процессы
     → типичный признак WMI exec
  4. Sysmon EventID 19/20/21 — WMI Activity (если Sysmon установлен)
     19 - WmiEventFilter activity
     20 - WmiEventConsumer activity
     21 - WmiEventConsumerToFilter activity
```

---

## WMI Repository: структура на диске

```
C:\Windows\System32\wbem\
├── Repository\
│   ├── OBJECTS.DATA        - основная база данных WMI (объекты, классы)
│   ├── INDEX.BTR           - B-Tree индекс
│   ├── MAPPING1.MAP        - таблица маппинга страниц
│   ├── MAPPING2.MAP        - резервная таблица маппинга
│   └── MAPPING3.MAP
├── wbemcore.dll            - ядро WMI
├── cimwin32.dll            - провайдер Win32_* классов
├── wmiprvse.exe            - хост-процесс провайдеров
├── wmic.exe                - CLI утилита
├── mof\                    - MOF файлы (описание классов)
│   ├── cimwin32.mof
│   └── ...
└── AutoRecover\            - MOF файлы для восстановления репозитория
```

```
MOF (Managed Object Format):
  Текстовый язык описания WMI классов и их регистрации.
  При установке новых программ — их WMI классы регистрируются через MOF файлы.
  Компилятор MOF: mofcomp.exe

  mofcomp.exe myclass.mof   - зарегистрировать класс
  
  Атакующие используют mofcomp для регистрации вредоносных подписок:
  mofcomp.exe malicious.mof
```

```
Восстановление WMI репозитория:
  Если WMI не работает или повреждён:
  
  1. Остановить winmgmt:
     net stop winmgmt
  
  2. Пересоздать репозиторий:
     winmgmt /resetrepository
  
  3. Перерегистрировать провайдеры:
     for /f %s in ('dir /b /s %windir%\system32\wbem\*.dll') do regsvr32 /s %s
     for /f %s in ('dir /b /s %windir%\system32\wbem\*.mof') do mofcomp %s
  
  4. Запустить winmgmt:
     net start winmgmt
```

---

## Поиск классов и свойств

```powershell
# Найти классы по ключевому слову
Get-CimClass -ClassName "*disk*"     -Namespace root\CIMV2
Get-CimClass -ClassName "*network*"  -Namespace root\CIMV2
Get-CimClass -ClassName "*user*"     -Namespace root\CIMV2

# Все классы в namespace
Get-CimClass -Namespace root\CIMV2 | Where-Object CimClassName -like "Win32_*" |
    Select-Object CimClassName | Sort-Object CimClassName

# Свойства конкретного класса
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassProperties |
    Select-Object Name, CimType, Qualifiers |
    Sort-Object Name

# Методы класса
Get-CimClass -ClassName Win32_Process |
    Select-Object -ExpandProperty CimClassMethods

# Интерактивный браузер через wbemtest.exe
# Win+R → wbemtest → Connect → root\CIMV2 → OK
# Enumerate Classes → можно браузить всю схему WMI
```

---

## Шпаргалка

```
Архитектура:
  winmgmt (services.exe) — служба WMI
  WMI Repository — C:\Windows\System32\wbem\Repository\
  wmiprvse.exe — хост провайдеров (порождается winmgmt)
  cimwin32.dll — провайдер Win32_* классов

Namespace (основные):
  root\CIMV2             - Win32_* классы (основной)
  root\StandardCimv2     - MSFT_Net* (сеть, современный)
  root\Microsoft\Windows\Storage - MSFT_Disk, MSFT_Volume
  root\SecurityCenter2   - антивирусы, фаервол
  root\subscription      - постоянные подписки (! атаки !)

WMI vs CIM:
  Get-WmiObject    → Get-CimInstance   (DCOM → WS-Man)
  ManagementObject → CimInstance
  Старый, deprecated → новый, рекомендуется

Ключевые классы:
  Win32_OperatingSystem    - версия ОС, uptime, RAM
  Win32_ComputerSystem     - имя, домен, RAM, производитель
  Win32_Processor          - CPU, ядра, загрузка
  Win32_LogicalDisk        - диски, свободное место (DriveType=3)
  Win32_Process            - процессы, CommandLine, PID, владелец
  Win32_Service            - службы, PathName, StartName
  Win32_NetworkAdapterConfiguration - IP, MAC, DNS, DHCP
  Win32_UserAccount        - локальные пользователи
  Win32_LogonSession       - активные сессии

CimSession:
  New-CimSession -ComputerName / -Credential
  Get-CimInstance -CimSession $session
  Remove-CimSession

Методы:
  Invoke-CimMethod -InputObject $obj -MethodName "Create"
  Invoke-CimMethod -ClassName Win32_Process -MethodName "Create" -Arguments @{...}

WMI Subscriptions (persistence!):
  root\subscription: __EventFilter + __EventConsumer + __FilterToConsumerBinding
  Проверять: Get-CimInstance -Namespace root\subscription -ClassName __EventFilter
  EventID 5861 в Microsoft-Windows-WMI-Activity/Operational

Безопасность:
  WmiPrvSE.exe → дочерние процессы = подозрительно
  Sysmon EventID 19/20/21 = WMI activity
  wbemtest.exe = интерактивный браузер WMI
```

---

## Ссылки

- [Microsoft Docs: WMI](https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmi-start-page) - официальная документация
- [WMI Explorer](https://github.com/vinaypamnani/wmie2) - GUI браузер WMI классов
- [MITRE ATT&CK: T1047](https://attack.mitre.org/techniques/T1047/) - WMI для lateral movement
- [MITRE ATT&CK: T1546.003](https://attack.mitre.org/techniques/T1546/003/) - WMI Event Subscriptions
- [Sysmon configuration](https://github.com/SwiftOnSecurity/sysmon-config) - конфиг для детектирования WMI атак
- [WMI Attacks - FireEye](https://www.mandiant.com/resources/reports) - исследование WMI в атаках
