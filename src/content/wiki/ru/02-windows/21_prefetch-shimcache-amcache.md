---
title: "Windows - Prefetch, Shimcache, Amcache (Форензика)"
date: "2026-05-15"
---

При расследовании инцидентов один из ключевых вопросов: "Что запускалось на этой машине и когда?" Prefetch, Shimcache и Amcache - три артефакта Windows которые отвечают именно на этот вопрос. Каждый хранит разную информацию и имеет разные характеристики с точки зрения расследования.

---

## Обзор: три артефакта исполнения

```
Артефакт        Где хранится                    Что даёт
────────────────────────────────────────────────────────────────────────────
Prefetch        C:\Windows\Prefetch\*.pf        Имя, путь, дата последнего
                                                запуска, количество запусков,
                                                список загружённых файлов/DLL

Shimcache       HKLM\SYSTEM\CurrentControlSet\  Путь, дата модификации файла,
(AppCompatCache) Control\Session Manager\        флаг "был ли запущен" (в
                AppCompatibility\               старых версиях). Сохраняется
                AppCompatCache                  только при выключении/перезагрузке.

Amcache         C:\Windows\AppCompat\Programs\  SHA1 хеш файла, путь, имя,
                Amcache.hve                     издатель, версия, дата первого
                                                запуска, дата установки.

Используй все три вместе: каждый может заполнить пробел который оставил другой.
```

---

## Prefetch

### Что такое Prefetch и как работает

```
Prefetch - механизм оптимизации запуска программ.
Windows отслеживает к каким файлам обращается программа при запуске →
записывает список → при следующем запуске предзагружает эти файлы в RAM.

Расположение:    C:\Windows\Prefetch\
Формат файла:    <ИМЯПРОГРАММЫ>-<8HEX>.pf
Пример:          NOTEPAD.EXE-CF4C5227.pf
                 MIMIKATZ.EXE-D6F25AD8.pf

Хеш в имени файла: CRC32 от пути к исполняемому файлу.
Один exe с разных путей → разные .pf файлы!
  CMD.EXE из C:\Windows\System32\ → CMD.EXE-4A81B364.pf
  CMD.EXE из C:\Temp\             → CMD.EXE-87B96812.pf

Включён по умолчанию:
  Workstations: ДА
  Servers:      НЕТ (по умолчанию, из-за производительности SSD/сервера)

Проверить/включить:
  reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters"
  # EnablePrefetcher: 0=Off, 1=App only, 2=Boot only, 3=Both (default)

  # Включить на сервере:
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters" `
      -Name "EnablePrefetcher" -Value 3
```

### Что содержит .pf файл

```
Каждый .pf файл содержит:

  Executable name        - имя .exe файла
  Path hash              - хеш пути (8 hex символов в имени файла)
  Run count              - количество запусков (до 8 в зависимости от версии)
  Last run time(s)       - временные метки последних запусков:
                           WinXP/Vista/7: 1 временная метка (последний запуск)
                           Win8+:         до 8 временных меток (последние 8 запусков!)
  File size              - размер .pf файла
  Volume info            - информация о томе (serial number, device path)
  File references        - список всех файлов к которым обращалась программа
                           (DLL, конфиги, базы данных и т.д.)
  Directory strings      - пути директорий

Максимум .pf файлов:
  Windows XP/7:    128 файлов
  Windows 8+:      1024 файла

Если лимит достигнут - старые файлы удаляются (FIFO).
Это значит: отсутствие .pf не означает что программа не запускалась.
```

### Чтение Prefetch

```powershell
# Список всех .pf файлов с датами последнего изменения
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Sort-Object LastWriteTime -Descending |
    Select-Object Name, LastWriteTime, Length |
    Format-Table -AutoSize

# LastWriteTime ≈ время последнего запуска программы
# (не идеально, но быстрый способ)

# Найти конкретную программу
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Where-Object { $_.Name -match "MIMIKATZ" -or $_.Name -match "PSEXEC" }

# Найти программы запускавшиеся в диапазоне времени
Get-ChildItem "C:\Windows\Prefetch\*.pf" |
    Where-Object {
        $_.LastWriteTime -gt "2024-01-15 10:00" -and
        $_.LastWriteTime -lt "2024-01-15 18:00"
    } | Select-Object Name, LastWriteTime | Sort-Object LastWriteTime
```

```
Инструменты для полного парсинга .pf (включая все временные метки и файлы):

WinPrefetchView (NirSoft) - GUI, бесплатно
  https://www.nirsoft.net/utils/win_prefetch_view.html
  Показывает: все запуски, временные метки, список файлов

PECmd (Eric Zimmermann - EZ Tools) - консоль, самый мощный
  https://github.com/EricZimmermann/PECmd
  Команды:
    PECmd.exe -f "C:\Windows\Prefetch\NOTEPAD.EXE-CF4C5227.pf"
    PECmd.exe -d "C:\Windows\Prefetch" --csv "C:\Output" --csvf prefetch.csv
    PECmd.exe -d "C:\Windows\Prefetch" -q   # тихий режим, только CSV

  Пример вывода PECmd:
    Source file: NOTEPAD.EXE-CF4C5227.pf
    Executable: NOTEPAD.EXE
    Hash: CF4C5227
    Last run: 2024-01-15 14:32:11
    Other run times:
      2024-01-14 09:15:44
      2024-01-13 16:22:03
    Run count: 7
    
    Files referenced:
      \DEVICE\HARDDISKVOLUME3\WINDOWS\SYSTEM32\NOTEPAD.EXE
      \DEVICE\HARDDISKVOLUME3\WINDOWS\SYSTEM32\NTDLL.DLL
      \DEVICE\HARDDISKVOLUME3\WINDOWS\SYSTEM32\KERNEL32.DLL
      ...

Prefetch Parser (Python) - для Linux/offline анализа:
  pip install libprefetch
  # или использовать volatility с prefetch плагином

Оффлайн анализ (с примонтированного образа диска):
  PECmd.exe -d "E:\Windows\Prefetch" --csv "C:\Output"
```

### Форензическая ценность Prefetch

```
Что можно установить:

1. Факт запуска программы
   Даже если сама программа удалена - .pf файл остаётся.
   MIMIKATZ.EXE-D6F25AD8.pf → mimikatz точно запускался.

2. Когда запускалась программа
   Windows 8+: до 8 последних временных меток.
   Windows 7: только последний запуск.

3. Сколько раз запускалась
   Run count - ценный индикатор. 1 раз = возможно тест или разовая атака.
   47 раз = регулярное использование.

4. Откуда запускалась
   Хеш в имени файла = хеш пути → разные пути дают разные файлы.
   Можно восстановить путь через FileReferences.
   Запуск с USB: путь будет \DEVICE\HARDDISKVOLUME? где ? = внешний диск.

5. Что использовала программа
   Список FileReferences может показать:
   - Доступ к конкретным документам (C2 config, шифрованные файлы)
   - Загрузку нестандартных DLL (DLL hijacking)
   - Доступ к сетевым путям (\DEVICE\MUP\...)

6. Lateral movement
   Если на SERVER01 есть PSEXESVC.EXE-*.pf → кто-то использовал PsExec.
   Если есть MSIEXEC.EXE с нестандартным хешем → MSI запускался не из System32.

Ограничения:
   - Отсутствует на серверах (обычно)
   - Отсутствует на SSD при отключённом SuperFetch (редко)
   - Можно намеренно удалить (но сам факт удаления подозрителен)
   - Лимит 1024 файла: старые могут быть вытеснены
   - Временные метки можно подделать (timestomping)
```

---

## Shimcache (AppCompatCache)

### Что такое Shimcache

```
Application Compatibility Cache (Shimcache) - кэш совместимости приложений.
Изначальная цель: помочь старым программам работать на новых версиях Windows
через "shims" (прокладки совместимости).

Побочный эффект: Windows записывает в кэш информацию о каждом
исполняемом файле с которым взаимодействовала файловая система.

Расположение в реестре:
  HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatibility\AppCompatCache
  (на некоторых версиях: \AppCompatCache\AppCompatCache)

Важная особенность: данные записываются в реестр ТОЛЬКО при выключении
или перезагрузке системы. Записи в памяти теряются при crash/kill.
→ Если система была выключена некорректно - последние записи могут отсутствовать.

Количество записей:
  Windows XP:     96 записей
  Windows Vista/7: 1024 записей
  Windows 8+:     без лимита (практически)

Порядок записей: от новых к старым (индекс 0 = самое последнее).
```

### Что содержит Shimcache

```
Каждая запись содержит:

  File path      - полный путь к исполняемому файлу
  Last modified  - дата последней модификации файла (из $MTIME файловой системы)
  File size      - размер файла (Windows XP, Vista/7)
  Execution flag - был ли файл выполнен (ТОЛЬКО Windows XP и Vista/7!)

Execution flag (InsertFlag):
  Windows XP / Vista / 7: присутствует.
    TRUE  = файл был выполнен
    FALSE = файл существовал (был виден системе), но, возможно, не запускался
  
  Windows 8+: execution flag УБРАН.
  Запись в Shimcache = файл существовал и был проиндексирован.
  НЕ гарантирует что файл запускался!

Это критично для форензики:
  Win7: наличие записи + InsertFlag=TRUE → запускался с высокой вероятностью
  Win8+: наличие записи → только "файл существовал на этом пути"
```

### Чтение Shimcache

```powershell
# Shimcache хранится в бинарном формате в реестре
# Прямо в PowerShell прочитать сложно - нужны специальные инструменты

# Посмотреть сырые данные (бинарный blob):
$key = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache"
(Get-ItemProperty -Path $key).AppCompatCache | Format-Hex | Select-Object -First 5
```

```
Инструменты для парсинга Shimcache:

AppCompatCacheParser (Eric Zimmermann - EZ Tools) - лучший выбор:
  https://github.com/EricZimmermann/AppCompatCacheParser

  # Живая система
  AppCompatCacheParser.exe --csv "C:\Output" --csvf shimcache.csv

  # Оффлайн (примонтированный образ или извлечённый hive)
  AppCompatCacheParser.exe -f "E:\Windows\System32\config\SYSTEM" `
      --csv "C:\Output" --csvf shimcache.csv

  Вывод CSV содержит:
    ControlSet, CacheIndex, Path, LastModified, Executed (Win7-)

ShimCacheParser.py (Mandiant/FireEye) - Python, хорошо для Linux:
  python ShimCacheParser.py -i SYSTEM --output shimcache.txt

RegRipper плагин appcompatcache:
  rip.pl -r SYSTEM -p appcompatcache > shimcache.txt

Volatility (memory forensics) - читает из RAM образа:
  vol.py -f memory.raw --profile=Win7SP1x64 shimcache
```

### Форензическая ценность Shimcache

```
Что можно установить:

1. Файл существовал на системе (Windows 8+)
   Даже если файл удалён - запись в Shimcache остаётся.
   Путь + дата модификации → можно сравнить с другими артефактами.

2. Файл запускался (Windows XP/7 с InsertFlag=TRUE)
   Более сильное утверждение чем просто "существовал".

3. Временная привязка через LastModified
   LastModified = дата последней модификации файла (не запуска!).
   Если LastModified совпадает с другими артефактами инцидента - ценный индикатор.

4. Хронология через индекс CacheIndex
   Индекс 0 = последнее взаимодействие, растёт к более старым.
   Позволяет построить относительную хронологию даже без абсолютных дат.

5. Файлы с нестандартных путей
   C:\Users\Public\file.exe, C:\Temp\svc.exe, %APPDATA%\... → подозрительно.

6. Удалённые файлы
   Shimcache хранит записи о файлах которые уже удалены.
   Это один из ключевых источников для восстановления истории.

Ограничения:
   - Записывается только при shutdown/reboot → незаписанные события теряются
   - Win8+: нет гарантии выполнения (только существование)
   - Можно манипулировать реестром (но это требует SYSTEM привилегий)
   - Shimcache не содержит username → не знаем кто запустил
```

---

## Amcache

### Что такое Amcache

```
Amcache.hve - реестровый куст (hive) для отслеживания установленных
и запускавшихся приложений. Пришёл на смену RecentFileCache.bcf (Win7).

Расположение:    C:\Windows\AppCompat\Programs\Amcache.hve
Тип:             Реестровый куст (можно открыть через regedit или оффлайн)
Доступ:          Заблокирован системой → нужна теневая копия или оффлайн

Введён в:        Windows 8 (частично), полноценно - Windows 8.1 / 10
Обновлён в:      Windows 10 1709+ (новая структура InventoryApplication*)
```

### Структура Amcache

```
Amcache.hve содержит несколько ключевых разделов:

Старая структура (до Win10 1709):
  Root\File\{VolumeGUID}\{FileID}
    → Информация об исполняемых файлах

  Ключевые значения каждой записи:
    0              - Product Name
    1              - Company Name
    2              - File version number
    3              - Language
    5              - Checksum (PE header)
    6              - File size
    7              - PE size of image
    f              - Linker version
    11             - Last modified time (file)
    17             - Last modified time (Amcache entry)
    100            - Program ID
    101            - SHA1 hash файла  ← КЛЮЧЕВОЙ
    15             - Creation time
    16             - Last modified time 2

Новая структура (Win10 1709+):
  Root\InventoryApplication\{GUID}
    → Установленные приложения

  Root\InventoryApplicationFile\{Path|Hash}
    → Исполняемые файлы
    Ключевые поля:
      Name, FileId (SHA1), LowerCaseLongPath, BinaryType,
      ProductName, Publisher, Version, BinProductVersion,
      LinkDate (compile time!), IsPEFile, Language

  Root\InventoryDriverBinary\
    → Драйверы

  Root\InventoryDeviceContainer\
    → Устройства

SHA1 хеш в Amcache:
  Amcache хранит SHA1 хеш первых 30 MB файла (или всего файла если < 30 MB).
  Это позволяет:
    - Сравнить с базами VirusTotal / NSRL (Known Good)
    - Однозначно идентифицировать файл независимо от имени
    - Обнаружить переименованные malware файлы
```

### Чтение Amcache

```powershell
# Amcache.hve заблокирован - нельзя читать напрямую
# Способ 1: скопировать через Volume Shadow Copy

# Найти теневые копии
vssadmin list shadows

# Скопировать из теневой копии
$shadow = "\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve" "C:\Temp\Amcache.hve"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG1" "C:\Temp\"
Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG2" "C:\Temp\"

# Способ 2: reg save (требует SYSTEM или останавливать службы)
# Обычно недоступно для Amcache напрямую

# Открыть скопированный hive в regedit для ручного просмотра:
# regedit → HKLM → File → Load Hive → выбрать Amcache.hve
```

```
Инструменты для парсинга Amcache:

AmcacheParser (Eric Zimmermann - EZ Tools) - лучший выбор:
  https://github.com/EricZimmermann/AmcacheParser

  # Живая система (нужен shadow copy или эксклюзивный доступ)
  AmcacheParser.exe -f "C:\Temp\Amcache.hve" --csv "C:\Output"

  # С включением не-ОС файлов
  AmcacheParser.exe -f "C:\Temp\Amcache.hve" --csv "C:\Output" -i

  Создаёт несколько CSV:
    *_UnassociatedFileEntries.csv   - отдельные файлы
    *_AssociatedFileEntries.csv     - файлы привязанные к программе
    *_Programs.csv                  - установленные программы
    *_DriverBinaries.csv            - драйверы
    *_DriverPackages.csv            - пакеты драйверов

RegRipper плагин amcache:
  rip.pl -r Amcache.hve -p amcache

Python - python-registry + custom скрипт:
  from Registry import Registry
  reg = Registry.Registry("Amcache.hve")
  key = reg.open("Root\\InventoryApplicationFile")
  for subkey in key.subkeys():
      print(subkey.name())
      for val in subkey.values():
          print(f"  {val.name()}: {val.value()}")
```

### Форензическая ценность Amcache

```
Что можно установить:

1. SHA1 хеш файла (главная ценность!)
   Позволяет сравнить с:
   - VirusTotal: malware или clean?
   - NSRL (National Software Reference Library): известный good файл?
   - Внутренней базой IOC
   
   Команда для проверки хеша:
   Invoke-RestMethod "https://www.virustotal.com/vtapi/v2/file/report?apikey=KEY&resource=SHA1HASH"

2. Compile time (LinkDate)
   Когда был скомпилирован файл.
   Аномалия: compile time в 1970 или 2037 → timestamp forgery.
   Аномалия: compile time после даты инцидента → невозможно.

3. Publisher / Digital Signature
   Unsigned файлы в системных папках → подозрительно.
   Известный publisher но другой хеш → подмена файла.

4. Первое появление на системе
   Amcache timestamp ≈ когда файл впервые появился (не запустился).
   Комбинируй с Shimcache и Prefetch для полной картины.

5. Переименованные файлы
   SHA1 хеш неизменен при переименовании.
   mimikatz.exe переименован в svchost32.exe → хеш выдаст оригинал.

6. Дата компиляции vs дата появления
   Если файл появился через 30 секунд после compile time → скомпилирован прямо здесь
   (или compile time подделан для обхода).

Ограничения:
   - Не все файлы попадают в Amcache (только часть)
   - SHA1 устарел как криптографический алгоритм, но для идентификации подходит
   - Записи могут быть устаревшими (файл удалён, запись осталась)
   - Заблокирован во время работы системы
```

---

## Совместное использование трёх артефактов

### Сравнительная таблица

```
                    Prefetch        Shimcache           Amcache
─────────────────────────────────────────────────────────────────────
Тип хранилища       Файлы .pf       Реестр (SYSTEM)     Hive файл
Доступен живой      Да              Да (но в памяти)    Нет (заблокирован)
Факт выполнения     ДА (сильный)    Win7: да, Win8+: нет  Нет (факт существования)
Временные метки     До 8 запусков   Дата модификации    Дата первого появления
Хеш файла           Нет             Нет                 SHA1 (ключевое!)
Путь                Да              Да                  Да
Количество запусков Да              Нет                 Нет
Удалённые файлы     Да (факт)       Да (факт)           Да (факт)
Серверы             Обычно нет      Да                  Да
Запись              Постоянно       При shutdown        Постоянно
```

### Workflow форензического расследования

```
Шаг 1: Сбор артефактов

  # Живая система (минимальное воздействие):
  # Prefetch - просто скопировать
  Copy-Item "C:\Windows\Prefetch" "C:\ForensicOutput\Prefetch" -Recurse

  # Shimcache - через реестр
  reg save "HKLM\SYSTEM" "C:\ForensicOutput\SYSTEM.hive"

  # Amcache - через VSS
  $shadow = (Get-WmiObject Win32_ShadowCopy | Sort-Object InstallDate -Descending |
      Select-Object -First 1).DeviceObject
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve" "C:\ForensicOutput\"
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG1" "C:\ForensicOutput\"
  Copy-Item "$shadow\Windows\AppCompat\Programs\Amcache.hve.LOG2" "C:\ForensicOutput\"

  # Или использовать KAPE (Kroll Artifact Parser and Extractor) для автоматического сбора:
  # KAPE.exe --tsource C: --tdest C:\ForensicOutput --target Prefetch,Amcache,Shimcache

Шаг 2: Парсинг

  PECmd.exe -d "C:\ForensicOutput\Prefetch" --csv "C:\Analysis" --csvf prefetch.csv
  AppCompatCacheParser.exe -f "C:\ForensicOutput\SYSTEM.hive" --csv "C:\Analysis"
  AmcacheParser.exe -f "C:\ForensicOutput\Amcache.hve" --csv "C:\Analysis" -i

Шаг 3: Анализ в Timeline Explorer (EZ Tools)

  # Объединить все CSV в единый timeline:
  # Timeline Explorer поддерживает импорт из PECmd, AppCompatCacheParser, AmcacheParser
  # Сортировать по времени → видеть хронологическую картину

  # Или через PowerShell/Excel:
  $prefetch = Import-Csv "C:\Analysis\prefetch.csv"
  $shimcache = Import-Csv "C:\Analysis\shimcache.csv"
  $amcache = Import-Csv "C:\Analysis\amcache_UnassociatedFileEntries.csv"

  # Найти записи в период инцидента
  $incidentStart = [DateTime]"2024-01-15 10:00"
  $incidentEnd   = [DateTime]"2024-01-15 18:00"

  $prefetch | Where-Object {
      [DateTime]$_.LastRun -gt $incidentStart -and
      [DateTime]$_.LastRun -lt $incidentEnd
  } | Select-Object ExecutableName, LastRun, RunCount | Sort-Object LastRun
```

### Практический пример расследования

```
Сценарий: подозрение на использование credential dumping инструмента.

1. Проверить Prefetch:
   Get-ChildItem "C:\Windows\Prefetch" |
       Where-Object { $_.Name -match "MIMI|PROCDUMP|LSASS|SECRETSDUMP|WCES" } |
       Select-Object Name, LastWriteTime

   # Нашли: PROCDUMP64.EXE-7AB8F3D1.pf (LastWriteTime: 2024-01-15 14:32)

2. Распарсить найденный .pf:
   PECmd.exe -f "C:\Windows\Prefetch\PROCDUMP64.EXE-7AB8F3D1.pf"
   
   # Результат:
   # Last run: 2024-01-15 14:32:11
   # Other runs: 2024-01-15 14:28:44, 2024-01-15 14:27:09
   # Run count: 3
   # Files referenced: ...\LSASS.EXE, ...\PROCDUMP64.EXE, C:\TEMP\LSASS.DMP (!)
   
   # Файл C:\TEMP\LSASS.DMP в references → дамп LSASS был создан!

3. Shimcache - ищем дополнительные инструменты в тот же период:
   # Парсим SYSTEM hive, фильтруем по подозрительным путям
   # Находим: C:\Users\admin\Desktop\tools\mimikatz.exe (дата мод: 2024-01-15)
   # И: C:\Windows\Temp\srv64.exe (нестандартное место)

4. Amcache - получаем SHA1 хеши:
   # C:\Users\admin\Desktop\tools\mimikatz.exe → SHA1: a3b94f2e... 
   # Проверяем на VirusTotal → 68/72 антивируса детектируют как Mimikatz

5. Итог timeline:
   14:27 - первый запуск procdump64.exe (Prefetch)
   14:28 - второй запуск (Prefetch)
   14:32 - третий запуск, создан lsass.dmp (Prefetch + references)
   ~14:33 - mimikatz.exe (Shimcache, дата модификации)
   ~14:35 - lsass.dmp был прочитан (дополнительная проверка через другие артефакты)
```

---

## Дополнительные артефакты исполнения

```
Для полной картины форензик использует не только три основных артефакта:

UserAssist (реестр - NTUSER.DAT):
  HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\
  Программы запускавшиеся через Explorer (GUI), закодированы ROT13.
  Содержит: run count, last execution time, focus time.

RecentApps (реестр - NTUSER.DAT):
  HKCU\Software\Microsoft\Windows\CurrentVersion\Search\RecentApps\
  Список недавних приложений из панели поиска.

MUI Cache (реестр - NTUSER.DAT):
  HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache\
  Хранит friendly name для каждого .exe который когда-либо показывался в UI.
  Быстрый способ найти подозрительные программы.

BAM / DAM (Background Activity Monitor):
  HKLM\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\{SID}\
  Windows 10 1709+. Отслеживает запуск программ в background.
  Содержит: путь и дату последнего запуска. Не очищается при logout!

  # Прочитать BAM:
  $sid = (Get-LocalUser -Name $env:USERNAME).SID.Value
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\$sid"

LNK файлы (ярлыки):
  %APPDATA%\Microsoft\Windows\Recent\
  Создаются при открытии файлов. Содержат: путь, MAC times оригинала,
  volume serial, NetBIOS hostname (если сетевой путь).

Jump Lists:
  %APPDATA%\Microsoft\Windows\Recent\AutomaticDestinations\
  %APPDATA%\Microsoft\Windows\Recent\CustomDestinations\
  Недавние файлы для каждого приложения.

Sysmon EventID 1 (Process Creation):
  Самый детальный источник если Sysmon установлен.
  Содержит: командную строку, хеш, PPID, username, logon ID.
```

---

## Инструменты и ресурсы

```
Eric Zimmermann (EZ) Tools - стандарт де-факто для Windows форензики:
  https://ericzimmerman.github.io/
  PECmd          - Prefetch
  AppCompatCacheParser - Shimcache
  AmcacheParser  - Amcache
  Timeline Explorer - просмотр и фильтрация всех CSV в едином интерфейсе
  MFTECmd        - Master File Table
  LECmd          - LNK файлы
  JLECmd         - Jump Lists

KAPE (Kroll Artifact Parser and Extractor):
  https://www.kroll.com/en/services/cyber-risk/incident-response-litigation-support/kroll-artifact-parser-extractor-kape
  Автоматический сбор артефактов по заранее определённым таргетам.
  Target Prefetch, Amcache, Shimcache, BAM, UserAssist и т.д.

Volatility:
  https://github.com/volatilityfoundation/volatility3
  Плагины для Memory форензики включая shimcache и malfind.

SANS Poster - Windows Forensic Analysis:
  https://www.sans.org/posters/windows-forensic-analysis/
  Ламинированная шпаргалка для форензика.

Артефакты по версиям Windows - хорошая справка:
  https://github.com/libyal/winreg-kb/wiki/Application-compatibility-cache
```

---

## Шпаргалка

```
БЫСТРАЯ СПРАВКА

PREFETCH
  Путь:       C:\Windows\Prefetch\*.pf
  Формат:     PROGRAM.EXE-XXXXXXXX.pf (хеш = CRC32 от пути)
  Содержит:   временные метки (до 8 в Win8+), run count, список файлов
  Запись:     постоянно (при каждом запуске)
  Серверы:    отключён по умолчанию
  Инструмент: PECmd.exe -d "C:\Windows\Prefetch" --csv output\

SHIMCACHE
  Путь:       HKLM\SYSTEM\...\AppCompatCache
  Содержит:   путь, дата модификации файла, [Win7: execution flag]
  Запись:     только при shutdown/reboot!
  Win8+:      нет флага исполнения - только факт существования файла
  Инструмент: AppCompatCacheParser.exe -f SYSTEM.hive --csv output\

AMCACHE
  Путь:       C:\Windows\AppCompat\Programs\Amcache.hve
  Содержит:   SHA1 хеш, путь, publisher, compile time, версия
  Заблокирован: нужна VSS или оффлайн копия
  Ключевое:   SHA1 → VirusTotal / NSRL проверка
  Инструмент: AmcacheParser.exe -f Amcache.hve --csv output\ -i

ЧЕГО НЕТ В КАЖДОМ АРТЕФАКТЕ
  Prefetch:   нет хеша файла, нет username
  Shimcache:  нет run count, нет username, Win8+ нет факта запуска
  Amcache:    нет факта запуска, нет username, нет run count

СБОР ОДНОЙ КОМАНДОЙ (KAPE):
  kape.exe --tsource C: --tdest D:\Evidence `
      --target Prefetch,Amcache,Shimcache,BAM,RecentFiles

EZ TOOLS WORKFLOW:
  1. PECmd / AppCompatCacheParser / AmcacheParser → CSV файлы
  2. Timeline Explorer → загрузить все CSV
  3. Фильтр по времени инцидента
  4. Искать подозрительные пути, хеши, совпадения между источниками

ПОДОЗРИТЕЛЬНЫЕ ПАТТЕРНЫ
  Программа из %TEMP%, %APPDATA%, C:\Users\Public\ → не норма
  Высокий run count для неизвестной программы → регулярное использование
  Compile time = время инцидента → скомпилирован на месте
  SHA1 → VirusTotal детекция → malware
  Запись в Shimcache без .pf → запускалось на сервере (нет Prefetch)
  Shimcache имеет файл, Amcache не имеет → файл был недолго
```

---

## Ссылки

- [EZ Tools (Eric Zimmermann)](https://ericzimmerman.github.io/) - PECmd, AmcacheParser, AppCompatCacheParser
- [KAPE](https://www.kroll.com/kape) - автоматический сбор артефактов
- [Libyal AppCompat wiki](https://github.com/libyal/winreg-kb/wiki/Application-compatibility-cache) - структура Shimcache по версиям
- [Amcache.hve research (Mandiant)](https://www.mandiant.com/resources/blog/tracking-malware-amcache) - исследование Amcache
- [SANS Windows Forensic Analysis Poster](https://www.sans.org/posters/windows-forensic-analysis/) - шпаргалка форензика
- [Prefetch format (libprefetch)](https://github.com/libyal/libprefetch/blob/main/documentation/Windows%20Prefetch%20File%20(PF)%20format.asciidoc) - формат .pf файлов
- [ForensicsWiki: Prefetch](https://forensicswiki.xyz/wiki/index.php?title=Prefetch) - обзор артефакта
- [BAM/DAM research](https://www.group-ib.com/blog/bam/) - Background Activity Monitor
