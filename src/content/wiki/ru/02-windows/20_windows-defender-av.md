---
title: "Windows - Windows Defender и AV механизмы"
date: "2026-05-15"
---

Windows Defender (официально - Microsoft Defender Antivirus) - встроенный антивирус Windows, который давно вырос из простого сканера в многоуровневую платформу защиты. Defender Antivirus - лишь одна из компонент Microsoft Defender suite. Понимание архитектуры, механизмов обнаружения и способов управления нужно и для защиты, и для понимания как malware от него уклоняется.

---

## Архитектура Microsoft Defender

```
Microsoft Defender Suite - набор взаимосвязанных компонентов:

Microsoft Defender Antivirus (MDAV)
  Встроенный AV. Работает всегда если нет стороннего AV.
  Компоненты: Real-time protection, On-demand scan, Cloud protection, ASR

Microsoft Defender SmartScreen
  Проверка загружаемых файлов и URL по репутационной базе.
  Интегрирован в Edge, Explorer, Windows Security.

Microsoft Defender Firewall
  Встроенный файрвол с фильтрацией по приложениям, портам, профилям.

Microsoft Defender for Endpoint (MDE) / бывший Defender ATP
  Корпоративное EDR решение (Endpoint Detection & Response).
  Требует лицензию Microsoft 365 / Defender for Endpoint P1/P2.
  Добавляет: поведенческий анализ, hunting, timeline событий, auto-remediation.

Microsoft Defender for Identity (MDI) / бывший Azure ATP
  Анализ AD трафика (Kerberos, LDAP, NTLM) на аномалии.
  Сенсоры на DC, обнаружение атак: Pass-the-Hash, DCSync, Kerberoasting.

Windows Defender Application Guard (WDAG)
  Изолированный браузер Edge в Hyper-V контейнере.
  Untrusted сайты открываются в изолированной VM.

Windows Defender Credential Guard
  Изоляция LSASS в Hyper-V (Virtual Secure Mode).
  NT Hashes недоступны даже для kernel-level malware.

Windows Defender Application Control (WDAC) / AppLocker
  Whitelist - разрешить запуск только подписанных/доверенных файлов.

Основные процессы MDAV:
  MsMpEng.exe   - Antimalware Service Executable (движок сканирования)
  MpCmdRun.exe  - командная строка управления
  NisSrv.exe    - Network Inspection Service (сетевой IDS)
  MpDefenderCoreService.exe - ядро Defender (Server 2022 / Win 11)
  SecurityHealthService.exe - Windows Security Center
  WdNisDrv.sys  - сетевой драйвер инспекции
  WdFilter.sys  - минифильтр файловой системы (реальное время)
  WdBoot.sys    - ранний запуск Anti-Malware (ELAM)
```

---

## Механизмы обнаружения

### Сигнатурное обнаружение

```
Классика: сравнить файл / область памяти с базой известных сигнатур.

База сигнатур:
  Расположение: C:\ProgramData\Microsoft\Windows Defender\Definition Updates\
  Обновляется: через Windows Update, Defender Update, WSUS, SCCM
  Формат: .vdm файлы (mpasbase.vdm, mpavbase.vdm, mpavdlta.vdm)
  Частота: несколько раз в день (срочные обновления - каждые несколько часов)

Что детектируется:
  - Хеши известных malware файлов (MD5/SHA1/SHA256)
  - Байтовые последовательности (byte patterns) внутри файлов
  - Строки (имена функций, URL, mutex имена из malware)

Проверить версию сигнатур:
  Get-MpComputerStatus | Select-Object `
      AntivirusSignatureVersion,
      AntivirusSignatureLastUpdated,
      AntispywareSignatureVersion

Обновить вручную:
  Update-MpSignature
  # Или:
  MpCmdRun.exe -SignatureUpdate

Ограничения сигнатурного метода:
  - Не работает против unknown/zero-day malware
  - Обход: небольшие модификации файла меняют хеш/паттерн
  - Packers и обфускация скрывают сигнатуры
```

### Эвристика и ML

```
Статический анализ без запуска:
  Defender анализирует структуру PE файла, импорты, строки,
  энтропию (высокая энтропия → возможно упаковано/зашифровано),
  метаданные и поведенческие индикаторы.

ML модели:
  Defender использует несколько уровней ML моделей:
    Клиентская модель (offline): работает без интернета
    Облачная модель (MAPS): более мощная, требует cloud protection

  Клиентская модель детектирует по признакам:
    - Аномальные PE структуры
    - Подозрительные комбинации импортов (CreateRemoteThread + VirtualAllocEx)
    - Характерные паттерны shellcode
    - Entropy anomalies в секциях PE

Поведенческий анализ в памяти (AMSI + ETW):
  Defender перехватывает выполнение через AMSI (Antimalware Scan Interface).
  Скрипты (PowerShell, VBScript, JScript, .NET) сканируются ДО выполнения.
```

### AMSI - Antimalware Scan Interface

```
AMSI - API для интеграции AV с приложениями.
Позволяет скриптовым движкам передавать контент на сканирование AV до выполнения.

Поддерживают AMSI:
  PowerShell (v5+)
  Windows Script Host (VBScript, JScript)
  .NET Framework (v4.8+) / .NET Core
  Office VBA макросы
  User Account Control (UAC)
  MHTML документы
  Windows Management Instrumentation (WMI)

Как работает AMSI:
  1. PowerShell получает скрипт
  2. Вызывает AmsiScanBuffer() через amsi.dll
  3. amsi.dll передаёт буфер зарегистрированным AV провайдерам
  4. Если AV говорит "malicious" - выполнение блокируется
  5. Если "clean" - выполнение продолжается

  Важно: AMSI сканирует финальный деобфусцированный контент.
  Даже если скрипт многократно обфусцирован - перед выполнением
  он будет раскрыт и передан в AMSI.

Пример C# - вызов AMSI напрямую:
  [DllImport("amsi.dll")]
  static extern uint AmsiScanBuffer(IntPtr amsiContext, byte[] buffer,
      uint length, string contentName, IntPtr session, out AMSI_RESULT result);
  // AMSI_RESULT: 0=Clean, 1=NotDetected, 32768=BlockedByAdminPolicy, 32768+=Detected

Проверить что AMSI работает (тест строка):
  # В PowerShell - это должно быть заблокировано:
  'AMSI Test Sample: X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  # Если Defender активен - PowerShell скажет "This script contains malicious content"
```

### Cloud Protection (MAPS)

```
MAPS (Microsoft Active Protection Service) - облачный анализ.
Когда Defender встречает подозрительный файл - отправляет метаданные в облако.

Уровни отправки (SpynetReporting):
  0 = Disabled    - не отправлять ничего
  1 = Basic       - базовые метаданные (рекомендуется минимум)
  2 = Advanced    - дополнительные данные (семплы)

Что отправляется:
  - Хеш файла, путь, имя процесса
  - Metadata PE заголовка
  - При Advanced: сам файл (если не содержит PII)

Block at First Sight:
  Если файл неизвестен и облако говорит "подозрительно" -
  файл блокируется до получения ответа от облака (< 1 секунды обычно).
  Требует: CloudBlockLevel и CloudExtendedTimeout.

Настройка:
  Set-MpPreference -MAPSReporting Advanced
  Set-MpPreference -SubmitSamplesConsent SendAllSamples
  Set-MpPreference -CloudBlockLevel High
  Set-MpPreference -CloudExtendedTimeout 50  # секунд

Проверить:
  Get-MpPreference | Select-Object MAPSReporting, CloudBlockLevel, SubmitSamplesConsent
```

### Real-Time Protection

```
WdFilter.sys - файловый минифильтр. Перехватывает:
  - Создание / запись файлов (IRP_MJ_CREATE, IRP_MJ_WRITE)
  - Создание процессов
  - Загрузку DLL
  - Изменения реестра (ключевые ветки)

Что сканируется в реальном времени:
  Файлы при создании/изменении/доступе (configurable)
  Скачиваемые файлы (через Mark of the Web)
  Сетевые файлы (через сетевой провайдер)
  Процессы при запуске

Mark of the Web (MotW / Zone.Identifier):
  Файлы из интернета получают ADS Zone.Identifier:
  [ZoneTransfer]
  ZoneId=3  (3=Internet, 1=Intranet, 2=Trusted, 4=Restricted)
  
  Defender и SmartScreen уделяют особое внимание файлам с ZoneId=3/4.
  Именно поэтому LNK файлы из ZIP архива детектируются иначе чем просто .exe.

  Посмотреть MotW:
  Get-Item C:\Downloads\file.exe -Stream Zone.Identifier | Get-Content
  
  Убрать MotW (Unblock-File):
  Unblock-File -Path C:\Downloads\file.exe
  # или: правый клик → Properties → Unblock
```

---

## Attack Surface Reduction (ASR)

```
ASR - набор правил которые блокируют конкретные техники атак.
Не сигнатуры - именно поведенческие правила.
Требует: Windows 10 1709+, Microsoft Defender активен.

Режимы каждого правила:
  0 = Disabled         - правило выключено
  1 = Block            - блокировать и писать в Event Log
  2 = Audit            - только писать в Event Log (не блокировать)
  6 = Warn             - предупреждать пользователя с возможностью обойти

Ключевые ASR правила (GUID: описание):

  BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550
  Block executable content from email client and webmail

  D4F940AB-401B-4EFC-AADC-AD5F3C50688A
  Block all Office applications from creating child processes

  3B576869-A4EC-4529-8536-B80A7769E899
  Block Office applications from creating executable content

  75668C1F-73B5-4CF0-BB93-3ECF5CB7CC84
  Block Office applications from injecting code into other processes

  D3E037E1-3EB8-44C8-A917-57927947596D
  Block JavaScript or VBScript from launching downloaded executable content

  5BEB7EFE-FD9A-4556-801D-275E5FFC04CC
  Block execution of potentially obfuscated scripts  ← обфускация!

  92E97FA1-2EDF-4476-BDD6-9DD0B4DDDC7B
  Block Win32 API calls from Office macro

  01443614-CD74-433A-B99E-2ECDC07BFC25
  Block executable files from running unless they meet a prevalence, age, or trusted list criterion

  9E6C4E1F-7D60-472F-BA1A-A39EF669E4B0
  Block credential stealing from the Windows local security authority subsystem  ← LSASS dump!

  D1E49AAC-8F56-4280-B9BA-993A6D77406C
  Block process creations originating from PSExec and WMI commands

  B2B3F03D-6A65-4F7B-A9C7-1C7EF74A9BA4
  Block untrusted and unsigned processes that run from USB

  26190899-1602-49E8-8B27-EB1D0A1CE869
  Block Office communication application from creating child processes

  7674BA52-37EB-4A4F-A9A1-F0F9A1619A2C
  Block Adobe Reader from creating child processes

  E6DB77E5-3DF2-4CF1-B95A-636979351E5B
  Block persistence through WMI event subscription

Управление ASR:
  # Включить правило (Block mode)
  Add-MpPreference -AttackSurfaceReductionRules_Ids "9E6C4E1F-..." `
      -AttackSurfaceReductionRules_Actions Enabled

  # Включить в Audit mode (сначала тестировать так!)
  Add-MpPreference -AttackSurfaceReductionRules_Ids "9E6C4E1F-..." `
      -AttackSurfaceReductionRules_Actions AuditMode

  # Посмотреть все правила
  Get-MpPreference | Select-Object AttackSurfaceReductionRules_Ids,
      AttackSurfaceReductionRules_Actions

  # Исключить конкретный путь из правила
  Add-MpPreference -AttackSurfaceReductionOnlyExclusions "C:\LegacyApp\app.exe"

Event Log для ASR:
  Microsoft-Windows-Windows Defender/Operational
  EventID 1121 - ASR rule blocked
  EventID 1122 - ASR rule audit (не заблокировано, но зафиксировано)
  EventID 1131 - ASR rule blocked network connection

  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -in 1121, 1122 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## Controlled Folder Access

```
Controlled Folder Access - защита папок от ransomware.
Разрешает записывать в защищённые папки только доверенным приложениям.
Если неизвестное приложение пытается записать - блокируется.

Защищённые папки по умолчанию:
  %USERPROFILE%\Documents
  %USERPROFILE%\Desktop
  %USERPROFILE%\Pictures
  %USERPROFILE%\Videos
  %USERPROFILE%\Music
  %PUBLIC%\Documents и другие

Включить:
  Set-MpPreference -EnableControlledFolderAccess Enabled
  # Режимы: Enabled, AuditMode, Disabled, BlockDiskModificationOnly, AuditDiskModificationOnly

Добавить защищённую папку:
  Add-MpPreference -ControlledFolderAccessProtectedFolders "D:\ImportantData"

Добавить исключение (доверенное приложение):
  Add-MpPreference -ControlledFolderAccessAllowedApplications "C:\MyApp\app.exe"

Event Log:
  EventID 1123 - Controlled Folder Access blocked
  EventID 1124 - Controlled Folder Access audit

Проверить:
  Get-MpPreference | Select-Object EnableControlledFolderAccess,
      ControlledFolderAccessProtectedFolders,
      ControlledFolderAccessAllowedApplications
```

---

## Исключения (Exclusions)

```
Исключения - файлы/папки/процессы которые Defender не сканирует.
Нужны для производительности (базы данных, IDE, виртуальные машины).
Опасны: malware активно использует исключения как технику обхода.

Типы исключений:
  Path exclusions    - исключить папку/файл
  Extension          - исключить файлы с расширением
  Process            - файлы открытые этим процессом не сканируются
  Temporary (автогенерируемые) - Defender сам создаёт для некоторых сервисов

Управление:
  # Добавить
  Add-MpPreference -ExclusionPath "C:\SQLData"
  Add-MpPreference -ExclusionExtension ".log"
  Add-MpPreference -ExclusionProcess "sqlservr.exe"

  # Просмотреть
  Get-MpPreference | Select-Object ExclusionPath, ExclusionExtension, ExclusionProcess

  # Удалить
  Remove-MpPreference -ExclusionPath "C:\SQLData"

Реестр исключений (читается malware для обнаружения "безопасных мест"):
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths\
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Extensions\
  HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Processes\

  # Прочитать исключения через реестр (требует admin):
  Get-Item "HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths"

Исключения GPO (переопределяют локальные):
  Computer Config → Admin Templates → Windows Components → Microsoft Defender Antivirus
  → Exclusions

ВАЖНО: исключения по пути используются malware.
  Техника: дроппер записывает payload в папку из списка исключений
  (узнав их из реестра) → Defender не сканирует → выполнение проходит.
  Аудит: мониторинг реестровых ключей исключений (EventID 4657).
```

---

## Управление Defender

### PowerShell (основной способ)

```powershell
# ---- Статус и информация ----
Get-MpComputerStatus
# Возвращает: AntivirusEnabled, RealTimeProtectionEnabled, OnAccessProtectionEnabled,
# NISEnabled, AMServiceEnabled, AntispywareEnabled, BehaviorMonitorEnabled,
# SignatureVersion, SignatureLastUpdated, и т.д.

Get-MpThreat                     # история обнаружений
Get-MpThreatDetection            # детальные детекции
Get-MpThreatCatalog              # база известных угроз

# ---- Сканирование ----
# Быстрое сканирование (frequently targeted locations)
Start-MpScan -ScanType QuickScan

# Полное сканирование
Start-MpScan -ScanType FullScan

# Сканировать конкретный путь
Start-MpScan -ScanType CustomScan -ScanPath "C:\Suspicious"

# Запустить оффлайн сканирование (перезагрузка + скан до загрузки Windows)
Start-MpWDOScan

# ---- Настройки защиты ----
# Включить/отключить real-time protection
Set-MpPreference -DisableRealtimeMonitoring $false  # включить
Set-MpPreference -DisableRealtimeMonitoring $true   # отключить (требует admin, временно)

# Настроить уровень защиты
Set-MpPreference -MAPSReporting Advanced
Set-MpPreference -CloudBlockLevel High
Set-MpPreference -CloudExtendedTimeout 50

# Включить защиту от PUA (Potentially Unwanted Applications)
Set-MpPreference -PUAProtection Enabled

# Настроить расписание сканирования
Set-MpPreference -ScanScheduleDay Everyday
Set-MpPreference -ScanScheduleTime "02:00"
Set-MpPreference -ScanParameters QuickScan

# ---- Обновления ----
Update-MpSignature                           # обновить сигнатуры
Update-MpSignature -UpdateSource MicrosoftUpdateServer  # с конкретного источника

# ---- Действия с угрозами ----
Get-MpThreat | Where-Object { $_.IsActive } # активные угрозы
Remove-MpThreat                              # удалить активные угрозы
```

### MpCmdRun.exe - командная строка

```
MpCmdRun.exe расположен в:
  C:\Program Files\Windows Defender\MpCmdRun.exe
  или C:\ProgramData\Microsoft\Windows Defender\Platform\<version>\MpCmdRun.exe

Основные команды:
  # Обновить сигнатуры
  MpCmdRun.exe -SignatureUpdate

  # Сканирование
  MpCmdRun.exe -Scan -ScanType 1    # Quick
  MpCmdRun.exe -Scan -ScanType 2    # Full
  MpCmdRun.exe -Scan -ScanType 3 -File "C:\Suspicious\file.exe"  # Custom

  # Удалить карантин (осторожно!)
  MpCmdRun.exe -RemoveDefinitions -All

  # Проверить статус
  MpCmdRun.exe -GetFiles             # собрать диагностические файлы

  # Restore из карантина
  MpCmdRun.exe -Restore -Name "TrojanSpy:Win32/..."

  # Добавить сигнатурный файл из папки
  MpCmdRun.exe -SignatureUpdate -Path "\\share\definitions"

Карантин Defender:
  C:\ProgramData\Microsoft\Windows Defender\Quarantine\
  Файлы зашифрованы (XOR). Нельзя просто скопировать и запустить.
  MpCmdRun.exe -Restore -Name <threat_name> [-All] [-Path <restore_path>]
```

### Управление через GPO

```
Computer Configuration → Administrative Templates → Windows Components
  → Microsoft Defender Antivirus

Ключевые политики:

Turn off Microsoft Defender Antivirus
  → Disabled: Defender включён (рекомендуется)
  → Enabled: Defender отключён (ТОЛЬКО если есть сторонний AV)

Real-time Protection:
  Turn off real-time protection
  Turn on process scanning whenever real-time protection is enabled
  Monitor file and program activity on your computer

Reporting:
  Configure the 'Block at First Sight' feature
  Join Microsoft MAPS

Scan:
  Specify the scan type to use for a scheduled scan
  Specify the time of day to run a scheduled scan
  Turn on catch-up full scan

Exclusions:
  Path Exclusions, Extension Exclusions, Process Exclusions

MAPS/Cloud:
  Join Microsoft MAPS
  Configure the 'Block at First Sight' feature

Реестровые ключи GPO политик:
  HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\
  (политики GPO имеют приоритет над локальными настройками)
```

---

## Defender в корпоративной среде

### Windows Security Center / Windows Security Health

```
Windows Security Center - служба отслеживающая статус защиты.
Агрегирует информацию от Defender, firewall, сторонних AV.

При установке стороннего AV:
  Сторонний AV регистрируется в WMI → SecurityCenter2
  Windows переводит Defender в Passive Mode (сканирует, но не блокирует)
  Или Disabled Mode (полностью отключён)

Режимы Defender:
  Active Mode   - основной AV, все функции
  Passive Mode  - работает рядом со сторонним AV, не блокирует
               но отправляет данные в MDE (EDR функции работают)
  Disabled Mode - полностью выключен

Проверить режим:
  Get-MpComputerStatus | Select-Object AMRunningMode
  # Normal = Active, Passive = Passive

Смотреть зарегистрированные AV через WMI:
  Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct |
      Select-Object displayName, pathToSignedProductExe, productState
  # productState: биты кодируют статус (enabled/disabled/up-to-date)
```

### WDAC - Windows Defender Application Control

```
WDAC - замена AppLocker для контроля запускаемых приложений.
Работает на уровне ядра (CI.dll). Сложнее обойти чем AppLocker.

Политика WDAC:
  XML файл описывающий что разрешено запускать:
    - По подписи (Publishers)
    - По хешу файла
    - По пути
    - По Product/File attributes

Режимы:
  Audit Mode  - разрешить всё, логировать что было бы заблокировано
  Enforce Mode - блокировать всё не соответствующее политике

Пример создания базовой политики:
  # Создать политику разрешающую только подписанные MS и Store приложения
  New-CIPolicy -Level Publisher -FilePath "C:\Policy\BasePolicy.xml" `
      -UserPEs -MultiplePolicyFormat

  # Добавить разрешение для конкретного приложения
  New-CIPolicyRule -Level Hash -FilePath "C:\MyApp\app.exe" |
      Add-SignerRule -FilePath "C:\Policy\BasePolicy.xml" -User

  # Скомпилировать
  ConvertFrom-CIPolicy "C:\Policy\BasePolicy.xml" "C:\Policy\BasePolicy.bin"

  # Применить (копировать в нужное место)
  Copy-Item "C:\Policy\BasePolicy.bin" `
      "C:\Windows\System32\CodeIntegrity\SIPolicy.p7b"

Event Log:
  Microsoft-Windows-CodeIntegrity/Operational
  EventID 3076 - Audit: файл бы был заблокирован
  EventID 3077 - Block: файл заблокирован
```

---

## Диагностика и Event Log

```
Главный лог Defender:
  Microsoft-Windows-Windows Defender/Operational

Ключевые Event ID:

  1000  - Scan started
  1001  - Scan finished
  1002  - Scan cancelled
  1005  - Scan failed

  1006  - Malware detected (обнаружен при сканировании)
  1007  - Action taken on malware
  1008  - Action failed
  1009  - Item restored from quarantine
  1013  - Malware history deleted
  1015  - Suspicious behavior detected (behavioral detection)
  1116  - Malware detected (realtime protection)
  1117  - Action taken on malware (realtime)
  1118  - Action failed (realtime)
  1119  - Critical action succeeded
  1120  - Critical action failed

  1121  - ASR rule blocked
  1122  - ASR rule audit
  1123  - Controlled Folder Access blocked
  1124  - Controlled Folder Access audit
  1125  - Network protection blocked
  1126  - Network protection audit

  2000  - Signature updated
  2001  - Signature update failed
  2002  - Signature database update
  2010  - Using emergency signature database
  2011  - Emergency signature database expired

  3002  - Real-time protection failed (проблема с движком)
  5004  - Real-time protection enabled
  5007  - Configuration changed  ← важно для security мониторинга!
  5008  - Engine failure

PowerShell - анализ логов Defender:
  # Все детекции за последние 24 часа
  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -in 1006, 1116 -and
          $_.TimeCreated -gt (Get-Date).AddHours(-24) } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # Изменения конфигурации (подозрительно если не ты менял)
  Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" |
      Where-Object { $_.Id -eq 5007 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # История всех угроз через PowerShell
  Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending |
      Select-Object -First 20 ThreatName, InitialDetectionTime,
          ActionSuccess, RemediationTime | Format-Table

  # Проверить что real-time protection не отключена
  Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled,
      AMServiceEnabled, OnAccessProtectionEnabled, IoavProtectionEnabled
```

---

## Техники обхода Defender (для понимания защиты)

```
Понимание техник обхода нужно для настройки правильной защиты и обнаружения.

1. AMSI Bypass
   AMSI живёт в amsi.dll загруженной в каждый скриптовый процесс.
   Техники (все детектируются современным Defender):
   - Patch AmsiScanBuffer() в памяти (изменить первые байты функции)
   - Unload amsi.dll через COM
   - Obfuscation (Invoke-Expression, string splitting, base64 + decode)
   - Reflection-based bypass (System.Management.Automation.AmsiUtils)

   Защита: Tamper Protection (не позволяет патчить защитные функции),
   обновлённые сигнатуры, ETW телеметрия.

2. Обход сигнатур
   - Изменить несколько байт в известном файле (сменить хеш)
   - Упаковать/зашифровать (packer) - payload расшифровывается в памяти
   - Stageless vs staged payloads

   Защита: поведенческий анализ, сканирование памяти при загрузке.

3. Living off the Land (LOLBins)
   Использование легитимных Windows утилит вместо malware:
   certutil.exe, regsvr32.exe, mshta.exe, wscript.exe, rundll32.exe и т.д.
   
   Защита: ASR правила, WDAC, мониторинг командных строк (Sysmon EventID 1).

4. Process Hollowing / Injection
   Запустить легитимный процесс → заменить его код на malware код.
   Обход: malware "выглядит" как notepad.exe или svchost.exe.
   
   Защита: Kernel Patch Protection, Credential Guard, ASR правил,
   Sysmon EventID 8 (CreateRemoteThread), EventID 10 (ProcessAccess).

5. Отключение Defender
   - Tamper Protection защищает от изменения настроек через реестр/PowerShell
   - Если Tamper Protection выключена: Set-MpPreference -DisableRealtimeMonitoring $true
   - Malware пытается отключить Defender до выполнения основного payload
   
   Защита: включить Tamper Protection (нельзя отключить без интерактивного входа).
   Мониторинг: EventID 5007 (Configuration changed), EventID 5004/5001.

Tamper Protection:
  Блокирует изменения Defender через реестр, PowerShell, инструменты.
  Включить: Windows Security → Virus & Threat Protection → Settings → Tamper Protection ON
  
  Через Intune/MDE для домена:
    Управляется централизованно, нельзя отключить локально.
  
  Проверить:
    Get-MpComputerStatus | Select-Object IsTamperProtected
```

---

## Шпаргалка

```
КОМПОНЕНТЫ DEFENDER
  MDAV (MsMpEng.exe)   - сканер malware
  NisSrv.exe           - Network Inspection Service
  WdFilter.sys         - файловый минифильтр (realtime)
  WdBoot.sys           - ELAM (ранний старт)
  AMSI (amsi.dll)      - сканирование скриптов перед выполнением

МЕХАНИЗМЫ ОБНАРУЖЕНИЯ
  Сигнатуры            - хеши и паттерны известного malware
  Эвристика / ML       - статический анализ PE, энтропия
  AMSI                 - PowerShell / VBScript / .NET перед запуском
  Поведение            - что процесс делает (inject, hollowing)
  Cloud (MAPS)         - облако для неизвестных файлов
  ASR                  - правила против конкретных техник атак

КЛЮЧЕВЫЕ КОМАНДЫ
  Get-MpComputerStatus                         - общий статус
  Get-MpThreatDetection                        - история детекций
  Start-MpScan -ScanType QuickScan             - быстрое сканирование
  Update-MpSignature                           - обновить сигнатуры
  Set-MpPreference -DisableRealtimeMonitoring $false  - вкл RTP
  Get-MpPreference                             - все настройки
  Add-MpPreference -ExclusionPath "C:\..."     - добавить исключение
  Add-MpPreference -AttackSurfaceReductionRules_Ids GUID -Actions Enabled

ASR ПРАВИЛА (важнейшие GUID)
  9E6C4E1F-7D60-472F-BA1A-A39EF669E4B0  - Block LSASS dump
  D1E49AAC-8F56-4280-B9BA-993A6D77406C  - Block PSExec/WMI process creation
  5BEB7EFE-FD9A-4556-801D-275E5FFC04CC  - Block obfuscated scripts
  BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550  - Block executable from email
  E6DB77E5-3DF2-4CF1-B95A-636979351E5B  - Block WMI persistence

EVENT IDS (Windows Defender/Operational)
  1116  - Malware detected (realtime)
  1117  - Action taken
  1121  - ASR blocked
  1122  - ASR audit
  1123  - Controlled Folder Access blocked
  2000  - Signature updated
  5007  - Configuration changed (!) мониторить обязательно
  5004  - Realtime protection enabled

HARDENING ПРИОРИТЕТЫ
  1. Tamper Protection = ON (нельзя отключить снаружи)
  2. Cloud Protection = Advanced + Block at First Sight
  3. ASR правила в Audit, затем Block (особенно LSASS, PSExec, Office)
  4. Controlled Folder Access = Enabled (для важных папок)
  5. PUA Protection = Enabled
  6. Исключения = минимум, аудировать изменения

ПУТИ
  Сигнатуры:  C:\ProgramData\Microsoft\Windows Defender\Definition Updates\
  Карантин:   C:\ProgramData\Microsoft\Windows Defender\Quarantine\
  Логи:       C:\ProgramData\Microsoft\Windows Defender\Support\
  MpCmdRun:   C:\Program Files\Windows Defender\MpCmdRun.exe
```

---

## Ссылки

- [Microsoft Defender Antivirus documentation](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/microsoft-defender-antivirus-windows) - официальная документация
- [AMSI documentation](https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-portal) - AMSI API
- [ASR rules reference](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference) - все ASR правила с GUID
- [Controlled Folder Access](https://learn.microsoft.com/en-us/defender-endpoint/controlled-folders) - защита папок
- [Tamper Protection](https://learn.microsoft.com/en-us/defender-endpoint/prevent-changes-to-security-settings-with-tamper-protection) - Tamper Protection
- [WDAC overview](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/appcontrol-and-applocker-overview) - Application Control
- [Defender for Endpoint](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/) - корпоративный EDR
- [MITRE ATT&CK: Defense Evasion](https://attack.mitre.org/tactics/TA0005/) - техники уклонения
