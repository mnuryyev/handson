---
title: "Windows - PowerShell основы"
date: "2026-05-13"
---

PowerShell - это командная оболочка и язык сценариев от Microsoft, построенный на .NET. В отличие от cmd.exe, который работает с текстом, PowerShell работает с объектами. Это принципиальное отличие: каждая команда возвращает не строку, а объект со свойствами и методами, которые можно передавать дальше по конвейеру.

PowerShell появился в 2006 году (v1.0) как инструмент для администрирования Windows. В 2016 году вышел PowerShell Core (v6) - кроссплатформенная версия на .NET Core, работающая на Linux и macOS. Сейчас актуальная линейка - PowerShell 7.x.

---

## Windows PowerShell vs PowerShell 7

```
Windows PowerShell (v1-v5.1):
  - Встроен в Windows, не требует установки
  - Только Windows
  - Основан на .NET Framework
  - Исполняемый файл: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
  - Цвет окна по умолчанию: синий
  - Будет поддерживаться, но новых версий не будет

PowerShell 7.x (PowerShell Core):
  - Устанавливается отдельно
  - Windows + Linux + macOS
  - Основан на .NET 6/7/8
  - Исполняемый файл: C:\Program Files\PowerShell\7\pwsh.exe
  - Цвет окна по умолчанию: чёрный
  - Активно развивается, получает новые функции

В Windows Server и корпоративных средах до сих пор чаще встречается v5.1.
Для новых скриптов рекомендуется PowerShell 7.
```

---

## Как запустить PowerShell

```
Способы запуска:
  Win+R → powershell           - Windows PowerShell
  Win+R → pwsh                 - PowerShell 7 (если установлен)
  Win+X → Windows PowerShell (Admin)
  Поиск → "PowerShell" → ПКМ → Запуск от имени администратора
  Из cmd.exe: powershell.exe или pwsh.exe

Запуск с параметрами:
  powershell.exe -NoProfile          - без загрузки профиля (быстрее)
  powershell.exe -ExecutionPolicy Bypass -File script.ps1
  powershell.exe -Command "Get-Process | Where CPU -gt 10"
  powershell.exe -NonInteractive     - без интерактивного режима
  powershell.exe -WindowStyle Hidden - скрытое окно
  powershell.exe -EncodedCommand <Base64>  - команда в Base64 (используется вредоносами!)

ISE (Integrated Scripting Environment):
  powershell_ise.exe             - встроенный редактор для v5.1
  Только Windows, только v5.1
  Для v7 рекомендуется VS Code + расширение PowerShell
```

---

## Политика выполнения скриптов (Execution Policy)

Execution Policy - это не средство защиты от вредоносов, а механизм предотвращения случайного запуска скриптов. Его легко обойти (см. ниже).

```
Уровни политики:
  Restricted      - скрипты нельзя запускать вообще (только интерактивные команды)
                    По умолчанию в клиентских Windows
  AllSigned       - разрешены только подписанные скрипты
  RemoteSigned    - локальные скрипты без подписи OK;
                    скачанные из сети требуют подписи
                    По умолчанию в Windows Server
  Unrestricted    - все скрипты разрешены, предупреждение для сетевых
  Bypass          - всё разрешено, никаких предупреждений
  Undefined       - политика не задана (применяется вышестоящая)
```

```
Scopes (области действия политики):
  MachinePolicy   - задана через GPO для компьютера (наивысший приоритет)
  UserPolicy      - задана через GPO для пользователя
  Process         - действует только для текущего процесса PowerShell
  CurrentUser     - задана для текущего пользователя в реестре
  LocalMachine    - задана для всей машины в реестре
                    HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell
                    ExecutionPolicy = "RemoteSigned"

Просмотреть текущую политику:
  Get-ExecutionPolicy
  Get-ExecutionPolicy -List     - все уровни и их значения

Изменить политику:
  Set-ExecutionPolicy RemoteSigned              - для LocalMachine
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

```
Обходы Execution Policy (для понимания, а не для обхода защит):
  powershell -ExecutionPolicy Bypass -File script.ps1
  Get-Content script.ps1 | Invoke-Expression
  . .\script.ps1   (dot-sourcing через обход)
  powershell -EncodedCommand <base64>

Снятие метки "Downloaded from Internet" с файла:
  Unblock-File .\script.ps1
  (Метка хранится как Alternate Data Stream - Zone.Identifier)
```

---

## Анатомия команды: Cmdlet

Основная единица PowerShell - **cmdlet** (читается "командлет"). Это скомпилированная команда, написанная на C# и следующая соглашению об именовании:

```
Глагол-Существительное

Глагол    - что делаем
Существительное - с чем

Примеры:
  Get-Process       - получить список процессов
  Stop-Service      - остановить службу
  New-Item          - создать новый элемент
  Remove-Item       - удалить элемент
  Set-ItemProperty  - установить свойство
  Invoke-Command    - выполнить команду
  Write-Output      - записать в вывод
  Export-Csv        - экспортировать в CSV
```

```
Стандартные глаголы (наиболее частые):
  Get      - получить/прочитать данные
  Set      - изменить существующий объект
  New      - создать новый объект
  Remove   - удалить объект
  Add      - добавить к существующему
  Clear    - очистить содержимое (не удалять)
  Copy     - скопировать
  Move     - переместить
  Rename   - переименовать
  Start    - запустить
  Stop     - остановить
  Restart  - перезапустить
  Enable   - включить
  Disable  - отключить
  Test     - проверить (возвращает True/False)
  Invoke   - выполнить
  Export   - экспортировать
  Import   - импортировать
  Format   - форматировать вывод
  Out      - направить вывод куда-либо
  Write    - записать/вывести
  Select   - выбрать
  Where    - отфильтровать
  Sort     - сортировать
  Group    - группировать
  Measure  - вычислить (count, sum, avg)
  Compare  - сравнить
  Convert  - преобразовать
  Join     - объединить
  Split    - разделить
```

---

## Получение справки

PowerShell имеет встроенную систему справки. Справка не предустановлена - её нужно скачать.

```
Обновить справку (нужны права администратора):
  Update-Help
  Update-Help -Force            - принудительно обновить
  Update-Help -UICulture en-US  - загрузить справку на английском

Просмотреть справку:
  Get-Help Get-Process          - краткая справка
  Get-Help Get-Process -Full    - полная справка
  Get-Help Get-Process -Examples    - только примеры
  Get-Help Get-Process -Online      - открыть в браузере
  Get-Help Get-Process -Parameter * - все параметры подробно

  help Get-Process              - справка постранично (через less)
  man Get-Process               - псевдоним для help

Поиск команд:
  Get-Command                   - все доступные команды
  Get-Command -Verb Get         - все команды с глаголом Get
  Get-Command -Noun Process     - все команды с существительным Process
  Get-Command *service*         - поиск по маске
  Get-Command -Module ActiveDirectory  - команды конкретного модуля

Изучить объект:
  Get-Process | Get-Member      - все свойства и методы объекта
  Get-Process | Get-Member -MemberType Property  - только свойства
  Get-Process | Get-Member -MemberType Method    - только методы
```

---

## Переменные

```
Объявление и использование:
  $name = "Alice"
  $count = 42
  $pi = 3.14159
  $isAdmin = $true

  Write-Host "Hello, $name"      - интерполяция в строке
  Write-Host "Hello, ${name}!"   - явные границы имени переменной

Типы данных:
  $str     = "text"             - [String]
  $num     = 42                 - [Int32]
  $float   = 3.14               - [Double]
  $bool    = $true / $false     - [Boolean]
  $null    = $null              - null (пустое значение)
  $arr     = @(1, 2, 3)        - [Array]
  $hash    = @{Key = "Value"}  - [Hashtable]

Явное указание типа:
  [int]$count = 42
  [string]$name = "Alice"
  [bool]$flag = $true
  [datetime]$date = "2026-01-01"

Специальные переменные:
  $_          - текущий объект в конвейере (pipe)
  $?          - результат последней команды ($true если успех)
  $LASTEXITCODE - код возврата последней внешней программы
  $Error      - массив последних ошибок ($Error[0] = последняя)
  $PSVersionTable - информация о версии PowerShell
  $env:PATH   - переменная среды (через $env:)
  $HOME       - домашняя директория пользователя
  $PWD        - текущая директория
  $args       - аргументы скрипта (в скрипте без param())
  $MyInvocation - информация о текущем скрипте/функции

Scope (область видимости):
  Переменные по умолчанию - локальные для текущего scope.
  $global:var  - глобальная переменная
  $script:var  - переменная уровня скрипта
  $local:var   - явно локальная
```

---

## Строки

```
Одинарные кавычки - литеральная строка, интерполяции нет:
  $name = 'Alice'
  'Hello, $name'       - выведет: Hello, $name

Двойные кавычки - с интерполяцией:
  "Hello, $name"       - выведет: Hello, Alice
  "Today: $(Get-Date)" - выражение в $() вычисляется
  "Path: $env:WINDIR"  - переменные среды тоже

Here-String (многострочная):
  $text = @"
  Строка 1
  Строка 2
  Привет, $name
  "@

  $literal = @'
  Строка без интерполяции: $name
  '@

Операции со строками:
  $s = "Hello, World"
  $s.Length            - длина (13)
  $s.ToUpper()         - "HELLO, WORLD"
  $s.ToLower()         - "hello, world"
  $s.Replace("World", "PowerShell")  - замена
  $s.Split(", ")       - разбить в массив: @("Hello", "World")
  $s.Trim()            - убрать пробелы с обеих сторон
  $s.TrimStart()       - убрать слева
  $s.TrimEnd()         - убрать справа
  $s.StartsWith("He")  - $true
  $s.EndsWith("ld")    - $true
  $s.Contains("World") - $true
  $s.Substring(7, 5)   - "World" (начало, длина)
  $s.IndexOf("W")      - 7 (позиция первого вхождения)
  $s -like "*World*"   - $true (wildcard)
  $s -match "W\w+"     - $true (regex)
  $Matches[0]          - "World" (результат последнего -match)

Форматирование:
  "Pi = {0:F2}" -f 3.14159    - "Pi = 3.14"
  "{0} + {1} = {2}" -f 1, 2, 3 - "1 + 2 = 3"
  [string]::Format("{0:D5}", 42) - "00042"
```

---

## Массивы

```
Создание:
  $arr = @(1, 2, 3, 4, 5)
  $arr = 1, 2, 3              - тоже массив
  $arr = @()                  - пустой массив
  $arr = 1..10                - диапазон: @(1, 2, 3, ..., 10)

Доступ по индексу:
  $arr[0]                     - первый элемент (1)
  $arr[-1]                    - последний элемент (5)
  $arr[1..3]                  - срез: @(2, 3, 4)

Свойства и методы:
  $arr.Count                  - количество элементов (5)
  $arr.Length                 - то же самое
  $arr -contains 3            - $true
  $arr -notcontains 6         - $true

Добавление элементов:
  $arr += 6                   - добавить элемент (создаёт новый массив!)
  [System.Collections.ArrayList]$list = @()
  $list.Add(1)                - эффективнее для частых добавлений
  $list.Add(2)

Перебор:
  foreach ($item in $arr) {
      Write-Host $item
  }
  $arr | ForEach-Object { Write-Host $_ }

Фильтрация:
  $arr | Where-Object { $_ -gt 2 }    - элементы больше 2: @(3, 4, 5)

Сортировка:
  $arr | Sort-Object                   - по возрастанию
  $arr | Sort-Object -Descending       - по убыванию

Многомерного массива нет, но есть массив массивов:
  $matrix = @(@(1,2), @(3,4), @(5,6))
  $matrix[0][1]    - 2
```

---

## Хэш-таблицы

```
Создание:
  $hash = @{
      Name    = "Alice"
      Age     = 30
      IsAdmin = $true
  }

Доступ к значениям:
  $hash["Name"]          - "Alice"
  $hash.Name             - "Alice" (то же)
  $hash.Age              - 30

Добавление/изменение:
  $hash["City"] = "Moscow"   - добавить ключ
  $hash.City = "Moscow"      - то же самое
  $hash["Age"] = 31          - изменить значение

Удаление:
  $hash.Remove("City")

Проверка наличия ключа:
  $hash.ContainsKey("Name")    - $true
  $hash.ContainsValue("Alice") - $true

Перебор:
  foreach ($key in $hash.Keys) {
      Write-Host "$key = $($hash[$key])"
  }
  $hash.GetEnumerator() | ForEach-Object {
      Write-Host "$($_.Key) = $($_.Value)"
  }

Свойства:
  $hash.Keys      - все ключи
  $hash.Values    - все значения
  $hash.Count     - количество пар

Упорядоченная хэш-таблица (порядок вставки сохраняется):
  $ordered = [ordered]@{
      First  = 1
      Second = 2
      Third  = 3
  }
```

---

## Конвейер (Pipeline)

Конвейер - главная идиома PowerShell. Объекты передаются от одной команды к другой без промежуточных файлов.

```
Базовый синтаксис:
  Command1 | Command2 | Command3

Пример:
  Get-Process | Where-Object { $_.CPU -gt 10 } | Sort-Object CPU -Descending | Select-Object -First 5

Как это работает:
  Get-Process        - возвращает коллекцию объектов [Process]
  |                  - каждый объект по одному передаётся следующей команде
  Where-Object       - фильтрует: оставляет только те, где CPU > 10
  Sort-Object        - сортирует по полю CPU убыванию
  Select-Object -First 5 - берёт первые 5 объектов

$_ - текущий объект в конвейере:
  Get-Service | Where-Object { $_.Status -eq "Running" }
  Get-ChildItem | Where-Object { $_.Extension -eq ".log" }
  Get-Process | ForEach-Object { $_.Kill() }

Альтернативный синтаксис (PowerShell 3+):
  Where-Object CPU -gt 10               - вместо { $_.CPU -gt 10 }
  Sort-Object -Property CPU             - явное указание свойства
  Where-Object Status -eq "Running"     - упрощённый синтаксис
```

---

## Фильтрация, сортировка, выборка

```
Where-Object - фильтрация:
  Get-Service | Where-Object { $_.Status -eq "Running" }
  Get-Service | Where-Object Status -eq "Running"        - краткий синтаксис
  Get-Process | Where-Object { $_.CPU -gt 5 -and $_.WorkingSet -gt 100MB }

Select-Object - выбор свойств / ограничение количества:
  Get-Process | Select-Object Name, CPU, Id        - только эти свойства
  Get-Process | Select-Object -First 10            - первые 10
  Get-Process | Select-Object -Last 5              - последние 5
  Get-Process | Select-Object -Skip 5              - пропустить первые 5
  Get-Process | Select-Object -Unique              - уникальные объекты
  Get-Process | Select-Object Name, @{N="MemMB"; E={$_.WorkingSet/1MB -as [int]}}
    - вычисляемое свойство: N=имя, E=выражение

Sort-Object - сортировка:
  Get-Process | Sort-Object CPU                    - по возрастанию
  Get-Process | Sort-Object CPU -Descending        - по убыванию
  Get-Process | Sort-Object @{E="CPU"; Descending=$true}, Name  - несколько полей

Group-Object - группировка:
  Get-Process | Group-Object Company
  Get-Service | Group-Object Status
  Get-EventLog -LogName System -Newest 100 | Group-Object Source | Sort-Object Count -Desc

Measure-Object - статистика:
  Get-Process | Measure-Object CPU -Sum -Average -Maximum -Minimum
  Get-ChildItem C:\Windows | Measure-Object Length -Sum    - суммарный размер файлов
  @(1,2,3,4,5) | Measure-Object -Average                  - среднее: 3

ForEach-Object - действие для каждого объекта:
  Get-Process | ForEach-Object { Write-Host $_.Name }
  Get-Service | ForEach-Object { $_.Stop() }
  1..5 | ForEach-Object { $_ * 2 }           - @(2, 4, 6, 8, 10)
```

---

## Форматирование вывода

```
Format-Table (ft) - таблица:
  Get-Process | Format-Table Name, CPU, Id
  Get-Process | Format-Table -AutoSize              - автоширина колонок
  Get-Process | Format-Table -Wrap                  - перенос текста
  Get-Process | ft Name, @{N="CPU(s)"; E={$_.CPU}; Width=10; Align="Right"}

Format-List (fl) - список свойств:
  Get-Process -Name chrome | Format-List *          - все свойства
  Get-Service -Name wuauserv | Format-List          - удобно для деталей

Format-Wide (fw) - широкий список (только одно поле):
  Get-Process | Format-Wide Name -Column 4

Out-GridView - интерактивная таблица с фильтром:
  Get-Process | Out-GridView                        - открыть в GUI
  Get-Process | Out-GridView -PassThru              - вернуть выбранные объекты
  Get-Service | Out-GridView -Title "Службы"

Важно:
  Format-* должны стоять последними в конвейере.
  После Format-Table объект становится форматированным текстом,
  а не оригинальным объектом - его нельзя передавать дальше для обработки.
```

---

## Вывод: Out-* и Export-*

```
Out-Host       - вывод в консоль (поведение по умолчанию)
Out-Null       - поглотить вывод (ничего не показывать и не сохранять)
Out-File       - записать в файл
Out-String     - преобразовать в строку
Out-GridView   - открыть в GUI-таблице

Файловый вывод:
  Get-Process | Out-File C:\procs.txt
  Get-Process | Out-File C:\procs.txt -Encoding UTF8 -Append

  Export-Csv     - экспорт в CSV (с заголовком)
  Get-Process | Export-Csv C:\procs.csv -NoTypeInformation -Encoding UTF8

  Export-Clixml  - сериализация в XML (сохраняет типы, можно импортировать обратно)
  Get-Process | Export-Clixml C:\procs.xml
  $procs = Import-Clixml C:\procs.xml

  ConvertTo-Json - преобразовать в JSON строку
  Get-Process | Select-Object Name, CPU | ConvertTo-Json
  ConvertFrom-Json - разобрать JSON строку

  ConvertTo-Csv / ConvertFrom-Csv - аналог Export/Import-Csv, но в строку

Write-Output vs Write-Host:
  Write-Output "text"    - записывает объект в конвейер (можно передавать дальше)
  Write-Host "text"      - выводит в консоль, минуя конвейер (нельзя перенаправить)
  Write-Host "Red!" -ForegroundColor Red -BackgroundColor Black
  Write-Verbose "debug"  - только если $VerbosePreference = "Continue"
  Write-Warning "warn"   - с префиксом WARNING:
  Write-Error "error"    - записывает в поток ошибок
  Write-Debug "debug"    - только если $DebugPreference = "Continue"
```

---

## Условия и циклы

```
if / elseif / else:
  if ($x -gt 10) {
      Write-Host "больше 10"
  } elseif ($x -eq 10) {
      Write-Host "равно 10"
  } else {
      Write-Host "меньше 10"
  }

switch:
  switch ($status) {
      "Running"  { Write-Host "Запущена" }
      "Stopped"  { Write-Host "Остановлена" }
      default    { Write-Host "Неизвестный статус" }
  }

  switch -Wildcard ($name) {      - поддерживает wildcards
      "svc*"  { Write-Host "Сервис: $name" }
      "app*"  { Write-Host "Приложение: $name" }
  }

  switch -Regex ($text) {         - поддерживает regex
      "^\d+"  { Write-Host "Начинается с числа" }
      "[a-z]" { Write-Host "Содержит строчные буквы" }
  }

for:
  for ($i = 0; $i -lt 10; $i++) {
      Write-Host $i
  }

foreach:
  foreach ($service in Get-Service) {
      Write-Host $service.Name
  }
  foreach ($item in @(1, 2, 3)) {
      Write-Host $item
  }

while:
  $i = 0
  while ($i -lt 5) {
      Write-Host $i
      $i++
  }

do-while / do-until:
  do {
      $input = Read-Host "Введите число"
  } while ($input -ne "0")

  do {
      $input = Read-Host "Введите число"
  } until ($input -eq "0")       - выполнять ПОКА условие ложно

Управление циклом:
  break      - выйти из цикла
  continue   - перейти к следующей итерации
  return     - выйти из функции (с возвращаемым значением)
```

---

## Операторы сравнения

PowerShell не использует `<`, `>`, `==` для сравнения - только текстовые операторы.

```
Сравнение:
  -eq    Equal               $a -eq $b        - равно
  -ne    Not Equal           $a -ne $b        - не равно
  -gt    Greater Than        $a -gt $b        - больше
  -lt    Less Than           $a -lt $b        - меньше
  -ge    Greater or Equal    $a -ge $b        - больше или равно
  -le    Less or Equal       $a -le $b        - меньше или равно

Строки и шаблоны:
  -like     wildcard        "Hello" -like "He*"    - $true
  -notlike                  "Hello" -notlike "He*" - $false
  -match    regex           "Hello" -match "H\w+"  - $true (результат в $Matches)
  -notmatch                 "Hello" -notmatch "X"  - $true
  -contains массив содержит $arr -contains 5        - $true
  -notcontains              $arr -notcontains 6     - $true
  -in       элемент в массиве  5 -in $arr           - $true
  -notin                    6 -notin $arr           - $true

По умолчанию сравнение без учёта регистра.
Добавьте c перед именем для case-sensitive:
  -ceq, -cne, -cgt, -clt, -cge, -cle, -clike, -cmatch

Логические:
  -and   Логическое И        $a -gt 0 -and $b -gt 0
  -or    Логическое ИЛИ      $a -gt 0 -or $b -gt 0
  -not   Логическое НЕ       -not $flag
  !      То же что -not       !$flag
  -xor   Исключающее ИЛИ     $a -xor $b

Тип объекта:
  $x -is [int]               - $true если $x является [int]
  $x -isnot [string]         - $true если $x не является [string]
  $x -as [int]               - преобразовать к типу (или $null если нельзя)
```

---

## Функции

```
Базовая функция:
  function Say-Hello {
      Write-Host "Hello!"
  }
  Say-Hello

Функция с параметрами:
  function Greet-User {
      param(
          $Name,
          $Greeting = "Hello"   - значение по умолчанию
      )
      Write-Host "$Greeting, $Name!"
  }
  Greet-User -Name "Alice"
  Greet-User -Name "Bob" -Greeting "Hi"

Типизированные и обязательные параметры:
  function Get-Square {
      param(
          [Parameter(Mandatory)]
          [int]$Number
      )
      return $Number * $Number
  }
  Get-Square -Number 5     - 25
  Get-Square               - запросит ввод (Mandatory!)

Advanced Function (полноценный cmdlet):
  function Get-UserInfo {
      [CmdletBinding()]    - включает -Verbose, -Debug, -ErrorAction и др.
      param(
          [Parameter(Mandatory, ValueFromPipeline)]
          [string]$UserName,

          [Parameter()]
          [switch]$Detailed    - switch: $true если указан, иначе $false
      )

      process {            - блок process выполняется для каждого объекта из конвейера
          Write-Verbose "Получаем информацию о $UserName"
          $user = Get-ADUser -Identity $UserName
          if ($Detailed) {
              return $user
          }
          return $user | Select-Object Name, SamAccountName
      }
  }
  "alice", "bob" | Get-UserInfo -Verbose

Возвращаемые значения:
  В PowerShell функция возвращает ВСЁ что не было перехвачено.
  Любая команда без | или = добавляет результат в вывод функции.

  function Get-Double {
      param([int]$x)
      return $x * 2      - явный return
  }

  function Get-Values {
      1                  - добавляется в вывод
      2                  - добавляется в вывод
      3                  - добавляется в вывод
  }
  $result = Get-Values   - $result = @(1, 2, 3)
```

---

## Обработка ошибок

```
Типы ошибок в PowerShell:
  Terminating error   - прерывает выполнение (throw, критические ошибки)
  Non-Terminating     - записывает в $Error, продолжает выполнение

$ErrorActionPreference - как реагировать на non-terminating ошибки:
  Continue            - показать ошибку и продолжить (по умолчанию)
  SilentlyContinue    - молча проигнорировать
  Stop                - превратить в terminating ошибку
  Inquire             - спросить пользователя

На уровне команды:
  Get-Item "нет такого файла" -ErrorAction SilentlyContinue
  Get-Item "нет такого файла" -ErrorAction Stop
  Get-Item "нет такого файла" -ErrorVariable myErr    - сохранить ошибку в $myErr

try / catch / finally:
  try {
      $result = Get-Item "C:\nonexistent.txt" -ErrorAction Stop
  }
  catch [System.IO.FileNotFoundException] {
      Write-Host "Файл не найден: $($_.Exception.Message)"
  }
  catch [System.UnauthorizedAccessException] {
      Write-Host "Нет доступа"
  }
  catch {
      Write-Host "Неизвестная ошибка: $($_.Exception.Message)"
      Write-Host "Тип: $($_.Exception.GetType().FullName)"
  }
  finally {
      Write-Host "Этот блок выполнится всегда"
  }

Генерировать ошибку:
  throw "Что-то пошло не так"
  throw [System.ArgumentException]::new("Неверный аргумент")

Объект ошибки ($_):
  $_.Exception.Message       - текст ошибки
  $_.Exception.GetType()     - тип исключения
  $_.InvocationInfo.Line     - строка кода, где произошла ошибка
  $_.ScriptStackTrace        - стек вызовов
  $_.CategoryInfo            - категория ошибки
```

---

## Провайдеры и диски (Providers and PSDrives)

PowerShell предоставляет доступ к различным хранилищам через единый интерфейс - как будто всё это файловая система.

```
Провайдеры (PSProvider):
  Get-PSProvider     - список всех провайдеров

  Встроенные провайдеры:
  FileSystem     - файлы и папки (C:\, D:\)
  Registry       - реестр Windows (HKLM:, HKCU:)
  Environment    - переменные среды (Env:)
  Alias          - псевдонимы команд (Alias:)
  Function       - функции (Function:)
  Variable       - переменные (Variable:)
  Certificate    - сертификаты (Cert:)

PSDrives (диски):
  Get-PSDrive    - список всех дисков

  Навигация как в файловой системе:
  Set-Location HKLM:\SOFTWARE\Microsoft   - перейти в раздел реестра
  Get-ChildItem HKLM:\SOFTWARE            - содержимое раздела реестра
  Set-Location Env:                        - перейти к переменным среды
  Get-ChildItem Env:                       - все переменные среды
  Get-Item Env:PATH                        - конкретная переменная среды

  $env:PATH                               - более удобный доступ к Env:
  $env:USERNAME
  $env:COMPUTERNAME
  $env:WINDIR
  $env:TEMP
```

---

## Работа с файловой системой

```
Навигация:
  Get-Location              - текущая директория (аналог pwd)
  Set-Location C:\Windows   - перейти (аналог cd)
  Set-Location ..           - на уровень вверх
  Push-Location             - запомнить текущую и перейти
  Pop-Location              - вернуться

  cd, sl                    - псевдонимы Set-Location
  pwd, gl                   - псевдонимы Get-Location

Просмотр содержимого:
  Get-ChildItem             - содержимое директории (аналог dir/ls)
  Get-ChildItem -Recurse    - рекурсивно
  Get-ChildItem -Filter *.log         - только .log файлы
  Get-ChildItem -Include *.log, *.txt - несколько расширений
  Get-ChildItem -Exclude *.bak        - исключить
  Get-ChildItem -Hidden               - скрытые файлы
  Get-ChildItem -Depth 2              - максимум 2 уровня вглубь
  Get-ChildItem | Where-Object { $_.Length -gt 1MB }  - файлы больше 1 МБ

  dir, ls, gci              - псевдонимы Get-ChildItem

Файлы:
  New-Item -ItemType File -Path C:\test.txt         - создать файл
  New-Item -ItemType Directory -Path C:\NewFolder   - создать папку
  Copy-Item C:\a.txt C:\b.txt                       - копировать
  Move-Item C:\a.txt C:\backup\a.txt                - переместить
  Rename-Item C:\old.txt C:\new.txt                 - переименовать
  Remove-Item C:\test.txt                           - удалить файл
  Remove-Item C:\folder -Recurse -Force             - удалить папку рекурсивно
  Test-Path C:\test.txt                             - $true если существует

Чтение и запись файлов:
  Get-Content C:\file.txt               - прочитать файл (массив строк)
  Get-Content C:\file.txt -Raw          - прочитать как одну строку
  Get-Content C:\file.txt -Tail 10      - последние 10 строк
  Get-Content C:\log.txt -Wait          - следить за файлом (как tail -f)

  Set-Content C:\file.txt "Hello"       - перезаписать файл
  Add-Content C:\file.txt "New line"    - дописать в конец

  "Text" | Out-File C:\file.txt -Encoding UTF8
  "Text" | Out-File C:\file.txt -Append -Encoding UTF8

  [System.IO.File]::ReadAllText("C:\file.txt")  - через .NET (быстрее для больших файлов)
  [System.IO.File]::WriteAllText("C:\file.txt", $content)
```

---

## Модули

Модуль - это пакет команд (cmdlet, функций, переменных, алиасов).

```
Работа с модулями:
  Get-Module                        - загруженные модули
  Get-Module -ListAvailable         - все доступные модули
  Get-Module -ListAvailable -All    - включая скрытые

  Import-Module ActiveDirectory     - загрузить модуль
  Remove-Module ActiveDirectory     - выгрузить модуль

  Import-Module C:\path\MyModule.psm1  - загрузить из файла

Auto-loading (PowerShell 3+):
  При вызове команды из модуля, PowerShell автоматически его загружает.
  Get-ADUser -Identity alice   - автоматически загрузит модуль ActiveDirectory

PowerShell Gallery:
  Find-Module -Name Pester         - найти модуль в галерее
  Install-Module -Name Pester      - установить из галереи
  Update-Module -Name Pester       - обновить
  Uninstall-Module -Name Pester    - удалить

Расположение модулей:
  $env:PSModulePath                - пути где PowerShell ищет модули

  Для текущего пользователя:
    C:\Users\<User>\Documents\PowerShell\Modules\    (PowerShell 7)
    C:\Users\<User>\Documents\WindowsPowerShell\Modules\ (v5.1)

  Для всей системы:
    C:\Program Files\PowerShell\Modules\             (PowerShell 7)
    C:\Windows\System32\WindowsPowerShell\v1.0\Modules\ (v5.1)
    C:\Program Files\WindowsPowerShell\Modules\

Структура модуля:
  MyModule\
    MyModule.psd1     - манифест (описание модуля, версия, зависимости)
    MyModule.psm1     - основной файл с кодом
    Public\           - публичные функции
    Private\          - приватные функции
```

---

## Remoting (удалённое выполнение)

```
WinRM (Windows Remote Management) - протокол для удалённого выполнения команд.
Основан на WS-Management (SOAP over HTTP/HTTPS).

Настройка:
  Enable-PSRemoting          - включить WinRM (нужны права Admin)
  Test-WSMan <computer>      - проверить доступность WinRM

Одиночные команды:
  Invoke-Command -ComputerName Server01 -ScriptBlock { Get-Process }
  Invoke-Command -ComputerName Server01 -ScriptBlock { param($name) Get-Service $name } -ArgumentList "wuauserv"
  Invoke-Command -ComputerName Server01, Server02 -ScriptBlock { hostname }  - сразу несколько машин

Постоянная сессия:
  $session = New-PSSession -ComputerName Server01
  Invoke-Command -Session $session -ScriptBlock { Get-Process }
  Enter-PSSession $session        - интерактивная сессия (как SSH)
  Exit-PSSession                  - выйти
  Remove-PSSession $session       - закрыть сессию

С другими учётными данными:
  $cred = Get-Credential
  Invoke-Command -ComputerName Server01 -Credential $cred -ScriptBlock { whoami }

Передача переменных в Invoke-Command:
  $localVar = "Hello"
  Invoke-Command -ComputerName Server01 -ScriptBlock { Write-Host $using:localVar }
  - $using:var - способ передать локальную переменную в удалённый блок

Порты и транспорт:
  HTTP:  порт 5985 (не шифруется на уровне транспорта, но payload шифруется)
  HTTPS: порт 5986 (рекомендуется)
```

---

## Профили PowerShell

Профиль - это скрипт, который автоматически выполняется при запуске PowerShell. Используется для настройки окружения, загрузки модулей, создания псевдонимов.

```
Расположение профилей:
  $PROFILE                         - профиль текущего пользователя, текущего хоста
  $PROFILE.AllUsersCurrentHost     - все пользователи, текущий хост
  $PROFILE.CurrentUserAllHosts     - текущий пользователь, все хосты
  $PROFILE.AllUsersAllHosts        - все пользователи, все хосты

  Типичные пути:
  Текущий пользователь, Windows PowerShell:
    C:\Users\<User>\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
  Текущий пользователь, PowerShell 7:
    C:\Users\<User>\Documents\PowerShell\Microsoft.PowerShell_profile.ps1

Создать/открыть профиль:
  notepad $PROFILE
  code $PROFILE                    - открыть в VS Code
  if (-not (Test-Path $PROFILE)) { New-Item -Path $PROFILE -Force }

Пример содержимого профиля:
  # Псевдонимы
  Set-Alias -Name ll -Value Get-ChildItem
  Set-Alias -Name touch -Value New-Item

  # Загрузить модули
  Import-Module Pester

  # Изменить приглашение (prompt)
  function prompt {
      $path = (Get-Location).Path
      "PS [$path]> "
  }

  # Переменные
  $MaxHistoryCount = 10000

Важно: если Execution Policy = Restricted - профиль не загружается.
```

---

## Псевдонимы (Aliases)

```
PowerShell включает много псевдонимов для совместимости с cmd и bash:

  ls, dir, gci   → Get-ChildItem
  cd, sl, chdir  → Set-Location
  pwd, gl        → Get-Location
  cat, gc, type  → Get-Content
  cp, copy       → Copy-Item
  mv, move       → Move-Item
  rm, del, erase → Remove-Item
  mkdir, md      → New-Item -ItemType Directory (или function md)
  cls, clear     → Clear-Host
  echo           → Write-Output
  sort           → Sort-Object
  where          → Where-Object
  select         → Select-Object
  fl             → Format-List
  ft             → Format-Table
  fw             → Format-Wide
  ogv            → Out-GridView
  measure        → Measure-Object
  foreach        → ForEach-Object
  ?              → Where-Object
  %              → ForEach-Object
  h, history     → Get-History
  r              → Invoke-History
  ps, gps        → Get-Process
  kill, spps     → Stop-Process
  sleep          → Start-Sleep
  date           → Get-Date

Управление псевдонимами:
  Get-Alias                  - все псевдонимы
  Get-Alias ls               - что скрывается за ls
  Set-Alias -Name touch -Value New-Item    - создать псевдоним
  New-Alias -Name np -Value notepad        - другой способ
  Export-Alias -Path aliases.txt           - экспорт
  Import-Alias -Path aliases.txt           - импорт

  Псевдонимы живут только в текущей сессии.
  Чтобы сохранить - добавить в $PROFILE.
```

---

## Полезные встроенные команды для работы с системой

```
Процессы:
  Get-Process               - список процессов
  Get-Process chrome        - конкретный процесс
  Stop-Process -Name chrome - завершить процесс
  Stop-Process -Id 1234     - завершить по PID
  Start-Process notepad     - запустить программу
  Start-Process cmd -Verb RunAs    - запустить от администратора

Службы:
  Get-Service               - все службы
  Get-Service wuauserv      - конкретная служба
  Start-Service wuauserv    - запустить
  Stop-Service wuauserv     - остановить
  Restart-Service wuauserv  - перезапустить
  Set-Service wuauserv -StartupType Disabled  - изменить тип запуска

Реестр (через PSDrive):
  Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir
  Set-ItemProperty HKCU:\Software\MyApp -Name "Theme" -Value "Dark"
  New-Item -Path HKCU:\Software\MyApp -Force
  Remove-Item -Path HKCU:\Software\MyApp -Recurse

Сеть:
  Test-NetConnection google.com -Port 443   - проверить TCP-соединение
  Test-NetConnection google.com             - проверить ping
  Resolve-DnsName google.com                - DNS-запрос
  Get-NetIPAddress                          - IP-адреса адаптеров
  Get-NetRoute                              - таблица маршрутизации
  Get-NetTCPConnection                      - активные TCP-соединения

Дата и время:
  Get-Date                          - текущая дата/время
  Get-Date -Format "yyyy-MM-dd"     - форматированная строка
  Get-Date -Format "HH:mm:ss"       - только время
  (Get-Date).AddDays(7)             - через 7 дней
  (Get-Date) - [datetime]"2026-01-01"  - разница в виде TimeSpan

Прочее:
  Get-ComputerInfo          - информация о системе
  Get-Hotfix                - установленные обновления
  Get-EventLog -LogName System -Newest 20   - последние события System Log
  Get-WinEvent -LogName Security -MaxEvents 10  - более современный вариант
  Invoke-WebRequest https://example.com     - HTTP-запрос (curl/wget аналог)
  Invoke-RestMethod https://api.example.com/data  - работа с REST API
  Start-Sleep -Seconds 5    - пауза
  Clear-Host                - очистить экран
  Get-History               - история команд сессии
  Invoke-History 5          - выполнить команду №5 из истории
```

---

## Шпаргалка

```
Философия PowerShell:
  Всё - это объект. Конвейер передаёт объекты, не строки.
  Cmdlets: Глагол-Существительное
  $_ - текущий объект в конвейере

Переменные:
  $var = value
  $_ = текущий объект в pipeline
  $? = результат последней команды
  $Error[0] = последняя ошибка
  $env:VAR = переменная среды

Типы данных:
  "str" / 'str'   [String]
  42              [Int32]
  $true / $false  [Boolean]
  @(1,2,3)        [Array]
  @{K="V"}        [Hashtable]
  1..10           диапазон

Операторы сравнения:
  -eq -ne -gt -lt -ge -le
  -like -match -contains -in
  -and -or -not

Конвейер:
  cmd1 | cmd2 | cmd3
  | Where-Object { $_.Prop -eq "val" }
  | Select-Object Name, CPU
  | Sort-Object Name -Descending
  | ForEach-Object { $_.DoSomething() }
  | Group-Object PropertyName
  | Measure-Object -Sum -Average

Файлы:
  Get-ChildItem / Get-Content / Set-Content / Add-Content
  New-Item / Copy-Item / Move-Item / Remove-Item / Test-Path

Помощь:
  Get-Help <cmdlet> -Examples
  Get-Command *keyword*
  Get-Member (для изучения объектов)
  Get-PSProvider / Get-PSDrive

Execution Policy:
  Get-ExecutionPolicy
  Set-ExecutionPolicy RemoteSigned
  powershell -ExecutionPolicy Bypass -File script.ps1

Версия:
  $PSVersionTable.PSVersion
  $PSVersionTable.PSEdition   - Desktop (v5.1) или Core (v7)
```

---

## Ссылки

- [Microsoft Docs: PowerShell](https://learn.microsoft.com/en-us/powershell/) - официальная документация
- [PowerShell GitHub](https://github.com/PowerShell/PowerShell) - исходный код PowerShell 7
- [PowerShell Gallery](https://www.powershellgallery.com/) - репозиторий модулей
- [SS64 PowerShell Reference](https://ss64.com/ps/) - краткий справочник по всем командам
- [PowerShell in a Month of Lunches](https://www.manning.com/books/learn-powershell-in-a-month-of-lunches) - книга для начинающих
