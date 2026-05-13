---
title: "Windows Registry - структура, ключи, работа с реестром"
date: "2026-05-13"
---

Windows Registry (реестр Windows) - централизованная иерархическая база данных, в которой хранится конфигурация операционной системы, установленных программ, оборудования и настроек пользователей. Реестр появился в Windows 3.1 и заменил хаотичное множество .ini файлов.

---

## Зачем нужен реестр

Без реестра (ранние версии Windows / Linux-подход):

- Конфигурация каждой программы в отдельном .ini файле
- Нет единого места для системных настроек
- Нет контроля доступа к конфигурации
- Сложно управлять централизованно через GPO

С реестром:

- Единое хранилище всех настроек системы и программ
- Иерархическая структура с контролем доступа (ACL)
- Управление через GPO в домене
- Поддержка нескольких пользователей (отдельные ветки)
- Аудит изменений через журнал событий

---

## Структура реестра

Реестр состоит из пяти корневых разделов (hives). Имена начинаются с `HKEY_` (Handle to a Key).

```
Реестр Windows
├── HKEY_LOCAL_MACHINE (HKLM)       - настройки системы и ПО (все пользователи)
│   ├── HARDWARE                    - данные об оборудовании (только в памяти)
│   ├── SAM                         - база учётных записей (защищённый)
│   ├── SECURITY                    - политики безопасности (защищённый)
│   ├── SOFTWARE                    - установленные программы
│   └── SYSTEM                      - конфигурация системы, драйверов
│
├── HKEY_CURRENT_USER (HKCU)        - настройки текущего пользователя
│   ├── AppEvents                   - звуки событий
│   ├── Console                     - настройки консоли
│   ├── Control Panel               - параметры панели управления
│   ├── Environment                 - переменные среды пользователя
│   ├── Network                     - сетевые диски
│   ├── Printers                    - принтеры
│   └── Software                    - программы для текущего пользователя
│
├── HKEY_USERS (HKU)                - профили всех пользователей системы
│   ├── .DEFAULT                    - профиль по умолчанию
│   ├── S-1-5-18                    - SYSTEM
│   ├── S-1-5-19                    - LOCAL SERVICE
│   ├── S-1-5-20                    - NETWORK SERVICE
│   └── S-1-5-21-...-1001           - профиль конкретного пользователя (SID)
│       └── (содержимое как у HKCU)
│
├── HKEY_CLASSES_ROOT (HKCR)        - ассоциации файлов и COM-объекты
│   ├── .txt                        - ассоциация расширения .txt
│   ├── .exe                        - ассоциация расширения .exe
│   └── CLSID                       - COM-объекты
│
└── HKEY_CURRENT_CONFIG (HKCC)      - текущий аппаратный профиль
```

### Алиасы (виртуальные ветки)

```
HKCU  =>  HKU\<SID текущего пользователя>
HKCR  =>  HKLM\SOFTWARE\Classes  +  HKCU\Software\Classes (объединяются)
HKCC  =>  HKLM\SYSTEM\CurrentControlSet\Hardware Profiles\Current
```

---

## Файлы реестра на диске (Hive Files)

Реестр хранится в файлах. Каждый файл - это "улей" (hive).

```
Ветка реестра                    Файл на диске
────────────────────────────────────────────────────────────────────────
HKLM\SYSTEM                      C:\Windows\System32\config\SYSTEM
HKLM\SOFTWARE                    C:\Windows\System32\config\SOFTWARE
HKLM\SAM                         C:\Windows\System32\config\SAM
HKLM\SECURITY                    C:\Windows\System32\config\SECURITY
HKLM\HARDWARE                    только в памяти (не на диске)
HKU\.DEFAULT                     C:\Windows\System32\config\DEFAULT
HKU\<SID>                        C:\Users\<Username>\NTUSER.DAT
HKU\<SID>_Classes                C:\Users\<Username>\AppData\Local\
                                  Microsoft\Windows\UsrClass.dat
```

```
Для каждого hive-файла Windows создаёт вспомогательные файлы:
SYSTEM.LOG   - журнал транзакций (для восстановления после сбоя)
SYSTEM.LOG1  - второй журнал
SYSTEM.LOG2  - третий журнал (при необходимости)
SYSTEM.SAV   - резервная копия после установки
```

---

## Типы данных (Value Types)

Каждый параметр (value) в реестре имеет имя, тип и значение.

```
Тип              Hex    Описание                      Пример
────────────────────────────────────────────────────────────────────────────
REG_SZ           0x01   Строка (Unicode)              "C:\Windows\system32"
REG_EXPAND_SZ    0x02   Строка с переменными среды    "%SystemRoot%\system32"
REG_BINARY       0x03   Бинарные данные               01 00 14 80 ...
REG_DWORD        0x04   32-битное целое число (LE)    0x00000001
REG_DWORD_BE     0x05   32-битное целое число (BE)    редко используется
REG_LINK         0x06   Символическая ссылка          (системное использование)
REG_MULTI_SZ     0x07   Список строк (через \0)       "Value1\0Value2\0"
REG_QWORD        0x0B   64-битное целое число         0x0000000100000000
REG_NONE         0x00   Нет типа                      (редко)
```

```
# Примеры в regedit:
# REG_SZ:        HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion -> ProductName = "Windows 11 Pro"
# REG_DWORD:     HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters -> TcpMaxDataRetransmissions = 5
# REG_EXPAND_SZ: HKCU\Environment -> TEMP = "%USERPROFILE%\AppData\Local\Temp"
# REG_MULTI_SZ:  HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters -> NullSessionPipes
# REG_BINARY:    HKLM\SAM\SAM\Domains\Account\Users\... -> F (хеш пароля и флаги)
```

---

## Работа с реестром: regedit и reg.exe

### regedit.exe - графический редактор

```
Запуск: Win+R -> regedit
       или: regedit.exe /s file.reg  (тихий импорт без диалогов)

Горячие клавиши:
  Ctrl+F         - поиск по реестру
  F5             - обновить
  F2             - переименовать ключ/параметр
  Del            - удалить
  Alt+F4         - закрыть

Подключение к реестру удалённой машины:
  Файл -> Подключить сетевой реестр -> <имя машины>
  (требует удалённый реестр: sc start RemoteRegistry)
```

### reg.exe - командная строка

```cmd
:: Просмотр ключа
reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion /v ProgramFilesDir
reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run
reg query HKLM\SYSTEM\CurrentControlSet\Services /s   :: рекурсивно

:: Добавить/изменить параметр
reg add HKCU\Software\MyApp /v Setting1 /t REG_SZ /d "HelloWorld" /f
reg add HKLM\SOFTWARE\MyApp /v Counter /t REG_DWORD /d 42 /f
reg add HKCU\Software\MyApp /v BinaryData /t REG_BINARY /d 0102030405 /f

:: Удалить параметр
reg delete HKCU\Software\MyApp /v Setting1 /f

:: Удалить ключ (рекурсивно)
reg delete HKCU\Software\MyApp /f

:: Экспорт в .reg файл
reg export HKCU\Software\MyApp C:\backup\myapp.reg

:: Импорт из .reg файла
reg import C:\backup\myapp.reg

:: Копировать ключ
reg copy HKCU\Software\MyApp HKCU\Software\MyAppBackup /s /f

:: Сравнение двух веток
reg compare HKLM\SOFTWARE\MyApp HKCU\Software\MyApp

:: Поиск значения во всей ветке
reg query HKLM /f "notepad" /t REG_SZ /s

:: Удалённое управление
reg query \\REMOTEPC\HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion /v ProductName
```

---

## Работа с реестром: PowerShell

PowerShell предоставляет работу с реестром как с файловой системой через PSDrive.

```powershell
# Реестр как диск
Get-PSDrive -PSProvider Registry
# HKLM и HKCU доступны по умолчанию как диски

# Навигация
Set-Location HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion
Get-ChildItem HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion

# Чтение параметров
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir
(Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion).ProgramFilesDir

# Читать одно значение
Get-ItemPropertyValue HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir

# Создать ключ
New-Item -Path HKCU:\Software\MyApp -Force

# Создать параметр
New-ItemProperty -Path HKCU:\Software\MyApp -Name "Version" -Value "1.0" -PropertyType String -Force
New-ItemProperty -Path HKCU:\Software\MyApp -Name "Count" -Value 42 -PropertyType DWord -Force

# Изменить параметр
Set-ItemProperty -Path HKCU:\Software\MyApp -Name "Version" -Value "2.0"

# Удалить параметр
Remove-ItemProperty -Path HKCU:\Software\MyApp -Name "Version"

# Удалить ключ (рекурсивно)
Remove-Item -Path HKCU:\Software\MyApp -Recurse -Force

# Проверить существование ключа
Test-Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion

# Поиск по реестру
Get-ChildItem -Path HKLM:\SOFTWARE -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -like "*notepad*" }

# Монтировать дополнительные ветки (например HKU)
New-PSDrive -Name HKU -PSProvider Registry -Root HKEY_USERS
Get-ChildItem HKU:\

# Читать реестр удалённого компьютера
$reg = [Microsoft.Win32.RegistryKey]::OpenRemoteBaseKey("LocalMachine", "REMOTEPC")
$key = $reg.OpenSubKey("SOFTWARE\Microsoft\Windows\CurrentVersion")
$key.GetValue("ProgramFilesDir")
```

---

## Важные ключи реестра

### Автозагрузка (Autorun)

Ключи, из которых программы запускаются при старте Windows или входе пользователя.

```
Запуск для всех пользователей (требуют права администратора):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx
HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run   (32-бит программы на 64-бит системе)

Запуск для текущего пользователя:
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce

Службы (Services):
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>
    Start:     0=Boot, 1=System, 2=Auto, 3=Manual, 4=Disabled
    Type:      1=Kernel Driver, 2=File System Driver, 16=Win32 Own Process, 32=Win32 Shared Process
    ImagePath: путь к исполняемому файлу

Политики автозапуска:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run
HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run

Запуск при входе (Winlogon):
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    Userinit:  "C:\Windows\system32\userinit.exe,"   <- вектор атаки!
    Shell:     "explorer.exe"                         <- вектор атаки!
```

```powershell
# Просмотреть автозагрузку
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run

# Добавить программу в автозагрузку
Set-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run `
    -Name "MyApp" -Value "C:\MyApp\myapp.exe"

# Удалить из автозагрузки
Remove-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run -Name "MyApp"
```

### Информация о системе

```
Версия Windows:
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion
    ProductName        - "Windows 11 Pro"
    CurrentVersion     - "6.3"
    CurrentBuild       - "22631"
    ReleaseId          - "2009"
    DisplayVersion     - "23H2"
    InstallDate        - (UNIX timestamp)
    RegisteredOwner    - имя владельца
    SystemRoot         - "C:\Windows"

Информация о компьютере:
HKLM\SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName
    ComputerName       - имя машины

Часовой пояс:
HKLM\SYSTEM\CurrentControlSet\Control\TimeZoneInformation
    TimeZoneKeyName    - "Russian Standard Time"
    Bias               - смещение в минутах от UTC
```

### Сеть

```
Сетевые адаптеры:
HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{GUID}
    IPAddress          - IP-адрес (если статический)
    SubnetMask         - маска подсети
    DefaultGateway     - шлюз
    NameServer         - DNS-серверы
    EnableDHCP         - 1=DHCP, 0=статический

Глобальные параметры TCP/IP:
HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
    Hostname           - имя хоста
    Domain             - DNS-суффикс
    TcpMaxDataRetransmissions  - кол-во повторных попыток TCP (default: 5)
    EnableICMPRedirect - разрешить ICMP-редиректы

Прокси (системный):
HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
    ProxyEnable        - 1=включён, 0=отключён
    ProxyServer        - "server:port"
    ProxyOverride      - исключения

Firewall:
HKLM\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\
    StandardProfile\EnableFirewall   - 1=включён
    DomainProfile\EnableFirewall
    PublicProfile\EnableFirewall
```

### Безопасность и политики

```
Политика паролей (SAM):
HKLM\SAM\SAM\Domains\Account
    F                  - флаги домена, политика паролей (бинарные данные)

Аудит:
HKLM\SECURITY\Policy\PolAdtEv

UAC (User Account Control):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
    EnableLUA          - 1=UAC включён (рекомендуется), 0=отключён
    ConsentPromptBehaviorAdmin    - поведение при запросе прав
    ConsentPromptBehaviorUser
    PromptOnSecureDesktop         - запрашивать на защищённом рабочем столе

Политики выполнения скриптов:
HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell
    ExecutionPolicy    - "Restricted" / "RemoteSigned" / "Unrestricted"

Защитник Windows:
HKLM\SOFTWARE\Policies\Microsoft\Windows Defender
    DisableAntiSpyware - 1=отключён (плохо!)

Защита LSA:
HKLM\SYSTEM\CurrentControlSet\Control\Lsa
    RunAsPPL           - 1=защита LSA процесса (anti-mimikatz)
    LmCompatibilityLevel  - уровень NTLMv1/v2 (рекомендуется 5)
    RestrictAnonymous  - 1=ограничить анонимный доступ
    NoLMHash           - 1=не хранить LM-хеши
```

### Программы и файловые ассоциации

```
Установленные программы (64-бит):
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>
    DisplayName        - название программы
    DisplayVersion     - версия
    InstallDate        - дата установки (YYYYMMDD)
    InstallLocation    - путь установки
    Publisher          - издатель
    UninstallString    - команда удаления
    QuietUninstallString - тихое удаление

Установленные программы (32-бит на 64-бит системе):
HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>

Программы пользователя:
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>

Ассоциации файлов:
HKCR\.txt                          - ProgID для .txt (например: "txtfile")
HKCR\txtfile\shell\open\command    - команда открытия
    (Default) = "C:\Windows\system32\NOTEPAD.EXE %1"

HKCR\.pdf
    (Default) = "AcroExch.Document"
HKCR\AcroExch.Document\shell\open\command
    (Default) = "C:\Program Files\Adobe\...\AcroRd32.exe %1"
```

---

## Разрядность реестра: 32-бит vs 64-бит

На 64-разрядных Windows существуют параллельные ветки для 32-битных приложений (WOW64 - Windows-on-Windows 64-bit).

```
64-битные программы читают/пишут:
HKLM\SOFTWARE\...                           (основная ветка)

32-битные программы на 64-бит Windows читают/пишут:
HKLM\SOFTWARE\WOW6432Node\...              (перенаправление через WOW64)

Аналогично для HKCU:
HKCU\Software\...                          (64-бит)
HKCU\Software\Classes\WOW6432Node\...     (32-бит)

Узнать, является ли процесс 32-битным:
[System.Environment]::Is64BitProcess       # PowerShell
IsWow64Process()                           # WinAPI
```

```powershell
# Открыть 32-битную ветку из 64-битного PowerShell
$reg = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::LocalMachine,
    [Microsoft.Win32.RegistryView]::Registry32
)
$key = $reg.OpenSubKey("SOFTWARE\MyApp32")
$key.GetValue("Version")
```

---

## .reg файлы

Файлы с расширением `.reg` - текстовый формат экспорта/импорта реестра.

```reg
Windows Registry Editor Version 5.00

; Это комментарий

; Создать ключ и добавить параметры
[HKEY_CURRENT_USER\Software\MyApp]
"StringValue"="Hello, World!"
"ExpandString"=hex(2):25,00,55,00,53,00,45,00,52,00,50,00,52,00,4f,00,46,00,49,00,4c,00,45,00,25,00,00,00
"DWordValue"=dword:0000002a
"QWordValue"=hex(b):01,00,00,00,00,00,00,00
"BinaryValue"=hex:01,02,03,04,05
"MultiString"=hex(7):56,00,61,00,6c,00,31,00,00,00,56,00,61,00,6c,00,32,00,00,00,00,00

; Удалить параметр (минус перед именем)
"OldValue"=-

; Удалить ключ целиком (минус перед путём)
[-HKEY_CURRENT_USER\Software\OldApp]

; Создать вложенный ключ
[HKEY_CURRENT_USER\Software\MyApp\SubKey]
"SubValue"="test"
```

```cmd
:: Импорт .reg файла
regedit /s myfile.reg

:: Экспорт ветки в .reg
regedit /e C:\export.reg HKEY_CURRENT_USER\Software\MyApp

:: Через reg.exe
reg import myfile.reg
reg export HKCU\Software\MyApp C:\export.reg
```

---

## Резервное копирование реестра

### Теневые копии и точки восстановления

```powershell
# Создать точку восстановления системы
Checkpoint-Computer -Description "Before registry changes" -RestorePointType MODIFY_SETTINGS

# Восстановить систему
# Панель управления -> Восстановление -> Запустить восстановление системы
```

### Экспорт через reg.exe

```cmd
:: Экспортировать всю ветку HKLM\SOFTWARE
reg export HKLM\SOFTWARE C:\backup\software.reg /y

:: Экспортировать конкретный ключ
reg export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" C:\backup\winver.reg /y
```

### Резервное копирование hive файлов

```powershell
# Через reg save (сохранить в бинарный hive-формат)
reg save HKLM\SOFTWARE C:\backup\software.hiv
reg save HKLM\SYSTEM   C:\backup\system.hiv

# Восстановить hive
reg restore HKLM\SOFTWARE C:\backup\software.hiv

# Загрузить чужой hive (например с другой системы)
reg load HKLM\TEMP C:\Users\OtherUser\NTUSER.DAT
# ... работа с HKLM\TEMP ...
reg unload HKLM\TEMP
```

---

## Права доступа (ACL) на ключи реестра

Каждый ключ реестра имеет дескриптор безопасности, как файл NTFS.

```
Стандартные права:
  Query Value         - читать значение параметра
  Set Value           - записывать параметр
  Create Subkey       - создавать вложенные ключи
  Enumerate Subkeys   - перечислять вложенные ключи
  Notify              - получать уведомления об изменениях
  Create Link         - создавать символические ссылки (системное)
  Delete              - удалять ключ
  Write DAC           - изменять права доступа
  Write Owner         - менять владельца
  Read Control        - читать дескриптор безопасности

Комбинированные права:
  KEY_READ    = Query Value + Enumerate Subkeys + Notify + Read Control
  KEY_WRITE   = Set Value + Create Subkey + Write DAC (в рамках ключа)
  KEY_ALL_ACCESS = все права
```

```powershell
# Просмотр прав на ключ
$acl = Get-Acl -Path "HKLM:\SOFTWARE\MyApp"
$acl.Access | Format-Table IdentityReference, RegistryRights, AccessControlType

# Добавить право на чтение для группы
$acl = Get-Acl "HKLM:\SOFTWARE\MyApp"
$rule = New-Object System.Security.AccessControl.RegistryAccessRule(
    "DOMAIN\GroupName",
    "ReadKey",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl -Path "HKLM:\SOFTWARE\MyApp" -AclObject $acl

# Через reg.exe
reg query HKLM\SOFTWARE\MyApp /se   # нет прямой команды для ACL
# Используй subinacl.exe или PowerShell

# Через icacls (не работает напрямую с реестром, только файлы)
# Для реестра - только PowerShell или secedit
```

---

## Мониторинг изменений реестра

### Process Monitor (Sysinternals)

Лучший инструмент для мониторинга обращений к реестру в реальном времени.

```
Скачать: https://learn.microsoft.com/sysinternals/downloads/procmon

Фильтры для реестра:
  Operation is RegSetValue    - только запись
  Operation is RegQueryValue  - только чтение
  Path contains "Run"         - только ключи автозагрузки
  Process Name is notepad.exe - только от конкретного процесса

Горячие клавиши:
  Ctrl+E  - включить/выключить захват
  Ctrl+X  - очистить
  Ctrl+F  - поиск
```

### Встроенный аудит событий

```powershell
# Включить аудит реестра (через групповые политики или напрямую)
# Политика: Аудит объектов -> Успех и Отказ

# Установить аудит на конкретный ключ
$acl = Get-Acl "HKLM:\SOFTWARE\MyApp"
$audit = New-Object System.Security.AccessControl.RegistryAuditRule(
    "Everyone",
    "SetValue,CreateSubKey,DeleteSubKey",
    "ContainerInherit,ObjectInherit",
    "None",
    "Success,Failure"
)
$acl.SetAuditRule($audit)
Set-Acl -Path "HKLM:\SOFTWARE\MyApp" -AclObject $acl

# Смотреть события в журнале
Get-WinEvent -LogName Security | Where-Object { $_.Id -eq 4657 }
# 4657 - изменение значения параметра реестра
# 4656 - запрос дескриптора ключа реестра
# 4658 - закрытие дескриптора
# 4660 - удаление ключа реестра
# 4663 - обращение к объекту реестра
```

### reg.exe - сравнение

```cmd
:: Сохранить состояние до изменений
reg export HKLM\SOFTWARE\MyApp before.reg

:: ... сделать что-то ...

:: Сохранить состояние после
reg export HKLM\SOFTWARE\MyApp after.reg

:: Сравнить (через fc или diff)
fc before.reg after.reg
```

---

## Реестр в контексте безопасности

Реестр - частая цель атак. Знание важных с точки зрения безопасности ключей обязательно.

### Векторы атак через реестр

```
1. Персистентность (Persistence)
─────────────────────────────────────────────────────────────────────
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run           <- классика
HKCU\Software\Microsoft\Windows\CurrentVersion\Run           <- пользовательский уровень
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    Userinit = "userinit.exe, C:\malware.exe"                <- подмена
    Shell    = "explorer.exe, C:\malware.exe"                <- подмена
HKLM\SYSTEM\CurrentControlSet\Services\<Name>
    ImagePath = "C:\malware.exe"                             <- вредоносная служба
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\<exe>
    Debugger = "C:\malware.exe"                              <- IFEO hijack

2. Привилегии и обход UAC
─────────────────────────────────────────────────────────────────────
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
    EnableLUA = 0                                            <- отключение UAC
HKCU\Software\Classes\ms-settings\shell\open\command        <- UAC bypass (eventvwr)

3. DLL Hijacking через реестр
─────────────────────────────────────────────────────────────────────
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs  <- список известных DLL
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows
    AppInit_DLLs = ""                                        <- загрузка DLL в каждый процесс!
    LoadAppInit_DLLs = 0                                     <- должно быть 0

4. Credentials в реестре
─────────────────────────────────────────────────────────────────────
HKLM\SAM\SAM\...                                             <- NTLM-хеши (нужен SYSTEM)
HKLM\SECURITY\Policy\Secrets\...                             <- LSA Secrets
HKCU\Software\SimonTatham\PuTTY\Sessions\...                 <- сохранённые сессии PuTTY
```

### Проверки безопасности

```powershell
# Проверить AutoRuns (Sysinternals autorunsc.exe лучше)
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run

# Проверить Winlogon на подмену
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" |
    Select-Object Userinit, Shell

# AppInit_DLLs должно быть пустым
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows" |
    Select-Object AppInit_DLLs, LoadAppInit_DLLs

# LM-хеши должны быть отключены
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").NoLMHash
# Должно быть: 1

# Уровень NTLMv2
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").LmCompatibilityLevel
# Рекомендуется: 5 (только NTLMv2)

# Защита LSA процесса (PPL)
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa").RunAsPPL
# Рекомендуется: 1

# Image File Execution Options (подозрительные записи)
Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options" |
    ForEach-Object {
        $debugger = (Get-ItemProperty $_.PSPath).Debugger
        if ($debugger) { Write-Host "$($_.PSChildName): $debugger" }
    }
```

---

## Оффлайн-анализ реестра

При расследовании инцидентов или анализе чужой системы работают с hive-файлами напрямую.

```powershell
# Загрузить hive с другой машины (из образа, USB)
reg load HKLM\ANALYSIS C:\Evidence\NTUSER.DAT

# Работать как обычно
Get-ItemProperty "HKLM:\ANALYSIS\Software\Microsoft\Windows\CurrentVersion\Run"

# Обязательно выгрузить после работы!
[gc]::Collect()   # освободить дескрипторы PowerShell
reg unload HKLM\ANALYSIS
```

```cmd
:: Скопировать заблокированные hive-файлы с живой системы
:: (используй Volume Shadow Copy)
vssadmin create shadow /for=C:
:: Затем скопировать из теневой копии:
copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SYSTEM C:\backup\
copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SAM C:\backup\
```

Популярные инструменты для оффлайн-анализа:

- **RegRipper** - автоматический анализ hive-файлов, вывод артефактов
- **Registry Explorer** (Eric Zimmerman) - графический просмотрщик hive с поддержкой транзакционных логов
- **regipy** (Python) - программный анализ hive-файлов
- **Volatility** - анализ реестра из дампов памяти

---

## Шпаргалка

```
Корневые разделы:
HKLM   - Local Machine (всё, кроме пользователей)
HKCU   - Current User (текущий пользователь = HKU\<SID>)
HKU    - все профили пользователей
HKCR   - ассоциации файлов + COM (HKLM\SOFTWARE\Classes + HKCU\Software\Classes)
HKCC   - текущий аппаратный профиль

Файлы на диске:
HKLM\SYSTEM    -> C:\Windows\System32\config\SYSTEM
HKLM\SOFTWARE  -> C:\Windows\System32\config\SOFTWARE
HKLM\SAM       -> C:\Windows\System32\config\SAM
HKCU           -> C:\Users\<User>\NTUSER.DAT

Типы данных:
REG_SZ         - строка
REG_EXPAND_SZ  - строка с %переменными%
REG_DWORD      - 32-бит число
REG_QWORD      - 64-бит число
REG_BINARY     - бинарные данные
REG_MULTI_SZ   - список строк

Ключевые места автозапуска:
HKLM\...\CurrentVersion\Run
HKCU\...\CurrentVersion\Run
HKLM\...\Winlogon  (Userinit, Shell)
HKLM\SYSTEM\...\Services\<Name>

Безопасность - что проверять:
EnableLUA = 1          (UAC включён)
NoLMHash = 1           (LM-хеши отключены)
LmCompatibilityLevel=5 (только NTLMv2)
RunAsPPL = 1           (защита LSA)
AppInit_DLLs = ""      (пустое!)

Команды:
reg query / add / delete / export / import / load / unload / compare
regedit /s file.reg    (тихий импорт)
Get-ItemProperty / Set-ItemProperty / New-Item / Remove-Item  (PowerShell)
```

---

## Ссылки

- [Microsoft Docs: Registry](https://learn.microsoft.com/en-us/windows/win32/sysinfo/registry) - официальная документация
- [Sysinternals Autoruns](https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns) - анализ автозапуска
- [Sysinternals Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) - мониторинг реестра
- [Registry Explorer (Zimmerman)](https://ericzimmerman.github.io/) - оффлайн-просмотрщик hive
- [RegRipper](https://github.com/keydet89/RegRipper3.0) - форензика реестра
- [MITRE ATT&CK: Registry Run Keys](https://attack.mitre.org/techniques/T1547/001/) - персистентность через реестр
