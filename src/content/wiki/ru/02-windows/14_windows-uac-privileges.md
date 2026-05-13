---
title: "Windows - UAC и механизмы повышения привилегий"
date: "2026-05-13"
---

UAC (User Account Control) - механизм Windows, который отделяет обычную работу пользователя от административных действий. Даже если пользователь состоит в группе Administrators, его процессы по умолчанию работают с урезанными привилегиями. Для совершения административных действий требуется явное подтверждение. Понимание UAC критично и для администрирования, и для безопасности - большинство атак на локальную систему так или иначе связаны с обходом этого механизма.

---

## Проблема которую решает UAC

```
До появления UAC (до Vista) ситуация была такой:

Пользователь входит в систему как Administrator
→ Каждый запущенный процесс - браузер, текстовый редактор, почта -
  работает с полными правами Administrator
→ Посетил вредоносный сайт - браузер загрузил и запустил malware
→ Malware работает с правами Administrator
→ Полная компрометация системы

UAC решает это через разделение токенов:
  Администратор входит → Windows создаёт ДВА токена:
    Filtered Token  (стандартный) - без привилегий, без членства в Admins
    Elevated Token  (полный)      - все привилегии, полное членство в Admins

  Обычная работа идёт через Filtered Token
  Повышение запрашивается явно - только тогда выдаётся Elevated Token
```

---

## Архитектура UAC

### Токены доступа

```
Токен доступа (Access Token) - структура данных в ядре Windows,
которая прикрепляется к каждому процессу и потоку.
Содержит: SID пользователя, SID групп, привилегии, уровень целостности.

При входе администратора создаются два токена:

Filtered Token (ограниченный):
  - Удалены группы: Administrators, Backup Operators и другие
    привилегированные группы (они есть в списке но помечены как USE_FOR_DENY_ONLY)
  - Удалены опасные привилегии: SeDebugPrivilege, SeImpersonatePrivilege и др.
  - Integrity Level: Medium (средний)
  - Именно этот токен используется для Explorer и всех дочерних процессов

Full/Elevated Token (полный):
  - Все группы активны
  - Все привилегии присутствуют
  - Integrity Level: High (высокий)
  - Выдаётся только при UAC elevation (с подтверждением пользователя)

Для обычного пользователя (не администратора):
  - Создаётся только один токен
  - Integrity Level: Medium
  - Нет привилегированных групп
  - Для elevation требуется ввод credentials администратора
```

### Integrity Levels (уровни целостности)

```
Integrity Level (IL) - механизм Mandatory Integrity Control (MIC),
добавленный в Windows Vista. Каждый объект и каждый процесс
имеет уровень целостности. Процесс не может записывать в объект
с более высоким IL, чем у самого процесса.

Уровни (от низшего к высшему):

Untrusted (0x0000)
  - Анонимные процессы
  - Практически никакого доступа к ресурсам

Low (0x1000)
  - Protected Mode браузеры (IE Protected Mode, Edge sandbox)
  - Процессы-песочницы
  - Могут писать только в Low IL папки:
    %USERPROFILE%\AppData\Local\Temp\Low\
    %USERPROFILE%\AppData\LocalLow\
  - Не могут писать на рабочий стол, в реестр обычного пользователя

Medium (0x2000)
  - Стандартный уровень для обычных пользователей
  - Стандартный уровень для ограниченных администраторов (Filtered Token)
  - Explorer, Office, браузер (не в sandbox)
  - Могут читать/писать в профиль пользователя
  - Не могут писать в HKLM, Program Files, Windows

High (0x3000)
  - Elevated процессы (UAC elevation)
  - Процессы запущенные "от имени администратора"
  - Могут писать в HKLM, Program Files, Windows
  - Могут взаимодействовать с System-процессами через некоторые API

System (0x4000)
  - Процессы службы Windows (SYSTEM аккаунт)
  - Драйверы ядра
  - Полный доступ к системным ресурсам

Protected (0x5000)
  - Защищённые процессы (антивирусы, DRM)
  - Anti-Malware Light (PPL) процессы
  - Lsass.exe в режиме Protected Process Light

Где хранится IL объекта:
  В дескрипторе безопасности объекта, в SACL
  Специальный ACE типа SYSTEM_MANDATORY_LABEL_ACE
```

```
Практические последствия IL:

Процесс с Medium IL НЕ МОЖЕТ:
  - Писать в C:\Windows\, C:\Program Files\
  - Писать в HKLM\SOFTWARE\
  - Изменять системные файлы
  - Запускать другой процесс с High IL без UAC

Процесс с High IL МОЖЕТ:
  - Всё вышеперечисленное
  - Читать память Medium-процессов
  - Внедряться в Medium-процессы (если есть привилегии)

Процесс с Low IL НЕ МОЖЕТ:
  - Взаимодействовать с Medium-процессами через IPC
  - Записывать в большинство мест файловой системы
  - Открывать окна большинства других процессов (UIPI защита)
```

### UIPI (User Interface Privilege Isolation)

```
UIPI - механизм, запрещающий процессам с более низким IL
отправлять сообщения окнам процессов с более высоким IL.

Без UIPI:
  Malware с Low IL мог бы:
  - Отправить WM_SETTEXT в диалог UAC и ввести туда произвольный текст
  - Симулировать нажатие кнопки "Да" в диалоге
  - Получить повышение привилегий без ведома пользователя

С UIPI:
  Процесс с Low IL не может отправить Windows-сообщение
  процессу с Medium или High IL
  Диалог UAC работает в изолированном desktop (Secure Desktop)
```

---

## Secure Desktop

```
Secure Desktop - отдельный рабочий стол (Desktop object) в котором
отображается диалог подтверждения UAC.

Обычный рабочий стол пользователя: WinSta0\Default
Secure Desktop для UAC:           WinSta0\Winlogon

Почему это важно:
  На Secure Desktop работают только процессы с System IL.
  Никакой пользовательский процесс (включая malware) не может:
  - Делать скриншоты Secure Desktop
  - Вводить текст в поля Secure Desktop
  - Симулировать нажатия кнопок
  - "Видеть" содержимое диалога

При показе UAC диалога:
  1. Экран затемняется (это и есть переключение на Secure Desktop)
  2. Диалог рисуется в Winlogon desktop
  3. Пользователь нажимает "Да" или "Нет"
  4. Управление возвращается в Default desktop

Если UAC настроен на "не затемнять" (prompt на обычном desktop):
  Secure Desktop отключён - это снижает безопасность
  Malware может взаимодействовать с диалогом через UI Automation API
```

---

## UAC Elevation - процесс повышения

### Что происходит при запуске "от администратора"

```
Когда пользователь нажимает "Запуск от имени администратора"
или процесс запрашивает elevation через ShellExecute с "runas":

1. Windows проверяет манифест исполняемого файла
   (requestedExecutionLevel в embedded XML манифесте)

2. Application Information Service (AIS) - служба appinfo.dll -
   получает запрос на elevation

3. Создаётся новый процесс consent.exe
   Consent.exe работает в Secure Desktop под SYSTEM аккаунтом

4. Consent.exe проверяет:
   - Подпись исполняемого файла (подписан ли Microsoft или доверенным издателем)
   - Настройки UAC политики

5. В зависимости от политики UAC:
   - Показывает диалог подтверждения (Yes/No для Admin)
   - Или запрашивает credentials (для стандартного пользователя)
   - Или молча повышает (Auto-elevation)

6. При подтверждении: создаётся новый процесс с Elevated Token

Ключевые компоненты:
  consent.exe              - процесс диалога UAC (работает как SYSTEM)
  appinfo.dll              - Application Information Service
  shell32.dll              - ShellExecute/ShellExecuteEx (инициирует запрос)
  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\ - конфигурация UAC
```

### Манифест приложения и requestedExecutionLevel

```
Каждый исполняемый файл (.exe) может содержать XML манифест.
В нём указывается требуемый уровень привилегий:

<trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
  <security>
    <requestedPrivileges>
      <requestedExecutionLevel
        level="asInvoker"           ← запустить с тем же уровнем что у родителя
        uiAccess="false"/>
    </requestedPrivileges>
  </security>
</trustInfo>

Значения level:
  asInvoker           - запустить с тем же токеном что у запустившего процесса
                        (никакого UAC диалога)
  highestAvailable    - запросить наивысший доступный уровень
                        (для Admin - High; для обычного - Medium; без диалога)
  requireAdministrator - ТРЕБУЕТ elevation
                        (всегда вызывает UAC диалог если нет Auto-elevation)

Если манифест отсутствует:
  Windows применяет эвристику (Installer Detection):
  Если имя файла содержит setup, install, update, patch - может запросить elevation
  Для остальных - asInvoker

Посмотреть манифест файла:
  sigcheck.exe -m <file.exe>   (Sysinternals)
  mt.exe -inputresource:<file.exe> -manifest   (Windows SDK)
  Resource Hacker (GUI)
```

### Режимы UAC (настройки политики)

```
UAC имеет несколько уровней настройки. Хранится в реестре:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\

Ключевые параметры:
  EnableLUA              = 1  (0 = полностью отключить UAC - очень плохо!)
  ConsentPromptBehaviorAdmin   - поведение для Администраторов
  ConsentPromptBehaviorUser    - поведение для Пользователей
  PromptOnSecureDesktop        - использовать Secure Desktop (1) или нет (0)

ConsentPromptBehaviorAdmin значения:
  0 = Elevate without prompting        (Auto-elevate, без диалога - небезопасно)
  1 = Prompt for credentials on secure desktop
  2 = Prompt for consent on secure desktop  ← DEFAULT (показывает диалог Yes/No)
  3 = Prompt for credentials
  4 = Prompt for consent
  5 = Prompt for consent for non-Windows binaries  ← DEFAULT (менее строго)

ConsentPromptBehaviorUser значения:
  0 = Automatically deny elevation requests  (пользователь не может получить elevation)
  1 = Prompt for credentials on secure desktop  ← рекомендуется
  3 = Prompt for credentials  ← DEFAULT

Предустановленные уровни в GUI (secpol.msc или Control Panel):

Всегда уведомлять (максимальная защита):
  ConsentPromptBehaviorAdmin = 2
  PromptOnSecureDesktop = 1

Уведомлять только при изменениях приложений (DEFAULT):
  ConsentPromptBehaviorAdmin = 5
  PromptOnSecureDesktop = 1

Уведомлять только при изменениях без Secure Desktop (меньше защиты):
  ConsentPromptBehaviorAdmin = 5
  PromptOnSecureDesktop = 0

Никогда не уведомлять (UAC практически отключён):
  ConsentPromptBehaviorAdmin = 0
  EnableLUA = 1 (всё ещё технически включён, но не показывает диалог)
```

---

## Auto-elevation

```
Auto-elevation - механизм, при котором НЕКОТОРЫЕ исполняемые файлы
повышаются АВТОМАТИЧЕСКИ без показа диалога UAC.

Условия Auto-elevation (все три должны выполняться):
  1. Исполняемый файл подписан Microsoft (не сторонние!)
  2. Находится в "trusted directory": C:\Windows\, C:\Windows\System32\
  3. В манифесте: level="highestAvailable" или "requireAdministrator"
     И установлен специальный флаг autoElevate=true в манифесте

Примеры Auto-elevate бинарей:
  C:\Windows\System32\eventvwr.exe   (Event Viewer)
  C:\Windows\System32\mmc.exe        (Microsoft Management Console)
  C:\Windows\System32\CompMgmt.exe
  C:\Windows\System32\fodhelper.exe
  C:\Windows\System32\sdclt.exe
  C:\Windows\System32\cleanmgr.exe

Посмотреть autoElevate в манифесте:
  sigcheck.exe -m C:\Windows\System32\eventvwr.exe | findstr autoElevate

Почему это важно для атак:
  Auto-elevate бинари - это ЗОЛОТО для UAC bypass техник.
  Если атакующий может заставить такой бинарь выполнить нужный код -
  он получит High IL без диалога UAC.
  Именно поэтому большинство UAC bypass техник завязаны на auto-elevate EXE.
```

---

## UAC Bypass техники

```
Важно понимать: UAC bypass НЕ является уязвимостью в понимании Microsoft.
Microsoft считает UAC "convenience feature" а не "security boundary".
Это значит UAC bypass техники НЕ патчатся как критические уязвимости.

Все bypass техники работают только если:
  - Атакующий уже выполняет код в контексте пользователя-администратора
    (но с Medium IL, т.е. через Filtered Token)
  - UAC настроен НЕ на максимальный уровень (что обычно и есть)

Основные классы техник:
```

### 1. COM Object Hijacking / Registry Hijacking

```
Концепция:
  Auto-elevate бинарь при запуске ищет что-то в реестре.
  Порядок поиска: сначала HKCU (пользователь может писать без elevation!),
  потом HKLM.
  Если подсунуть нужное значение в HKCU - бинарь подхватит его.

Классический пример - eventvwr.exe:
  1. eventvwr.exe запускается (auto-elevate, High IL, без диалога)
  2. Ищет ассоциацию для MSC файлов в реестре
  3. Сначала смотрит HKCU\Software\Classes\mscfile\shell\open\command
  4. В HKCU пользователь МОЖЕТ писать (Medium IL достаточно)
  5. Атакующий записывает туда путь к своей программе
  6. eventvwr.exe запускает эту программу с High IL

После атаки ключ нужно убрать, иначе MSC файлы будут ломаться.

Другие бинари с похожей техникой:
  fodhelper.exe  → HKCU\Software\Classes\ms-settings\shell\open\command
  sdclt.exe      → HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\control.exe
  ComputerDefaults.exe → HKCU\Software\Classes\ms-settings\shell\open\command
```

### 2. DLL Hijacking через Auto-Elevate EXE

```
Концепция:
  Auto-elevate EXE при загрузке ищет DLL.
  Если в папке рядом с EXE (или в PATH до System32) есть подменная DLL -
  EXE загрузит её с High IL.

Пример:
  C:\Windows\System32\cleanmgr.exe ищет dismapi.dll
  Если положить вредоносную dismapi.dll в директорию из PATH,
  которую пользователь может писать - cleanmgr загрузит её с High IL.

Ограничение: нужна директория которую пользователь может писать
  и которая стоит в PATH перед System32. Такие места становятся редкостью.
```

### 3. Elevated COM Objects

```
Концепция:
  Некоторые COM объекты зарегистрированы как "Elevation Moniker" -
  их можно создать с High IL из Medium процесса.
  Если такой COM объект имеет метод для выполнения команд -
  это готовый UAC bypass.

Как это работает:
  HKLM\SOFTWARE\Classes\CLSID\{...}\Elevation\Enabled = 1
  Это маркирует COM объект как "elevatable"
  При создании через CoCreateInstance с CLSCTX_LOCAL_SERVER -
  Windows показывает UAC (или повышает автоматически если объект от Microsoft)

Пример - ICMLuaUtil interface:
  COM объект {3E5FC7F9-9A51-4367-9063-A120244FBEC7}
  Имеет метод ShellExec для запуска процессов
  Создаётся с elevation, выполняет команды с High IL
```

### 4. Token Impersonation / Parent Process Spoofing

```
Концепция:
  При создании процесса можно указать ДРУГОЙ процесс как "родительский".
  Новый процесс унаследует токен указанного родителя.
  Если в системе уже есть High IL процесс - его можно "одолжить".

Детали:
  Windows API CreateProcess позволяет указать PROC_THREAD_ATTRIBUTE_PARENT_PROCESS
  Новый процесс появится в дереве процессов как дочерний к указанному
  и унаследует его токен (если у создателя есть PROCESS_CREATE_PROCESS доступ)

Ограничение: требует SeDebugPrivilege или доступа к целевому процессу.
  Но некоторые Medium IL процессы имеют доступ к ряду High IL процессов.
```

### 5. BYOVD и эксплуатация уязвимостей ядра

```
Если все UAC bypass не работают (максимальный UAC, Secure Desktop),
атакующий идёт другим путём:

Уязвимость в ядре (kernel exploit):
  Ядро работает с Ring 0 привилегиями выше любого UAC
  Эксплойт ядра → System IL → обход UAC
  Примеры: PrintNightmare, HiveNightmare и другие LPE (Local Privilege Escalation)

BYOVD (Bring Your Own Vulnerable Driver):
  Загрузить уязвимый легитимный драйвер (с действительной подписью)
  Использовать уязвимость в нём для выполнения кода в Ring 0
  Обход UAC и любых защит на уровне пользователя
```

---

## Runas и явное указание credentials

### Runas

```
runas.exe - встроенный инструмент Windows для запуска программ
от имени другого пользователя.

Как работает:
  runas /user:DOMAIN\Administrator cmd.exe
  → Windows запрашивает пароль Administrator
  → Создаётся новый процесс с токеном Administrator
  → Новый процесс НЕ наследует переменные окружения и Drive mapping'и исходного

Ключевые параметры:
  /user:domain\username     - от чьего имени запустить
  /savecred                 - сохранить credentials в Credential Manager
                              (опасно! credentials остаются в системе)
  /netonly                  - использовать credentials только для сетевого доступа
                              (локально процесс работает от исходного пользователя)
                              Аналог -NetOnly в PowerShell
  /noprofile                - не загружать профиль (быстрее, но некоторые
                              приложения могут не работать)
```

### Credential Manager

```
Credential Manager - хранилище credentials Windows.
GUI: Control Panel → Credential Manager
     (или rundll32.exe keymgr.dll, KRShowKeyMgr)

Два типа credentials:
  Windows Credentials   - для сетевых ресурсов (серверы, шары), NTLM/Kerberos
  Certificate Credentials - клиентские сертификаты
  Generic Credentials   - приложения (GitHub, Teams и т.д.)

Физическое хранение:
  C:\Users\<username>\AppData\Roaming\Microsoft\Credentials\
  C:\Users\<username>\AppData\Local\Microsoft\Credentials\
  Файлы зашифрованы через DPAPI (Data Protection API)

DPAPI:
  Шифрование привязано к учётной записи пользователя и машине.
  Ключи шифрования хранятся:
    C:\Users\<username>\AppData\Roaming\Microsoft\Protect\<SID>\
  Для расшифровки нужен мастер-ключ пользователя (доступен пока пользователь вошёл).
  Mimikatz умеет расшифровывать DPAPI blob'ы с помощью мастер-ключа из LSASS.
```

---

## Protected Users и Credentials Protection

### Protected Users Security Group

```
Protected Users - специальная группа безопасности в AD (появилась в 2012 R2).
Члены этой группы получают дополнительные ограничения:

  - Нельзя использовать NTLM (только Kerberos)
  - Нельзя использовать DES или RC4 шифрование Kerberos (только AES)
  - Нет кэширования credentials на клиенте (нельзя войти без DC)
  - Нет делегирования Kerberos (ни Unconstrained, ни Constrained)
  - TGT живёт максимум 4 часа (не продлевается)
  - Credentials НЕ хранятся в lsass в виде plaintext или слабо зашифрованном виде

Кому добавлять: Domain Admins, Enterprise Admins, Schema Admins
Кому НЕ добавлять: сервисным аккаунтам (сломается Kerberos delegation),
                   аккаунтам которым нужен NTLM

Ограничение: только для доменных аккаунтов, локальные администраторы не затрагиваются.
```

### Credential Guard

```
Credential Guard - аппаратная защита credentials в памяти.
Использует Virtualization Based Security (VBS) и Hyper-V гипервизор.

Проблема без Credential Guard:
  LSASS (Local Security Authority Subsystem Service) хранит credentials в памяти.
  Mimikatz (sekurlsa::logonpasswords) может их вытащить из памяти LSASS.
  Любой процесс с SeDebugPrivilege может прочитать память LSASS.

Как работает Credential Guard:
  Credentials переносятся в изолированную виртуальную машину (Isolated LSA / LSAIso).
  Эта VM работает на уровне гипервизора, ниже ядра Windows.
  Даже компрометированное ядро не может напрямую получить credentials из LSAIso.
  LSASS в обычном контексте работает как "прокси" к LSAIso.

Что защищает:
  - NT hashes
  - Kerberos TGT и ключи сессии
  - NTLMv2 challenge-response (ограниченно)

Что НЕ защищает:
  - Credentials в момент ввода пользователем
  - Credentials в SAM базе (для локальных аккаунтов)
  - Cached credentials (DCC2 хеши в реестре)
  - Credentials в Credential Manager (DPAPI)

Требования:
  64-битная Windows (Enterprise или Education)
  UEFI Secure Boot
  Virtualization (Intel VT-x или AMD-V)
  TPM (желательно)
  Windows 10 1511+ / Server 2016+

Где проверить статус:
  msinfo32.exe → System Summary → "Virtualization-based security"
  HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\CredentialGuard\
    Enabled  = 1
    Running  = 1
```

---

## Локальные привилегии и их значение

### Привилегии Windows

```
Привилегия - специальное право, присвоенное аккаунту или группе,
позволяющее выполнять конкретное системное действие.
Привилегии отличаются от прав доступа (ACL): они применяются ко всей системе.

Просмотр своих привилегий:
  whoami /priv

Опасные привилегии (могут использоваться для LPE):

SeDebugPrivilege
  - Открыть любой процесс (включая SYSTEM) для чтения/записи памяти
  - Читать LSASS → получить все credentials (Mimikatz)
  - По умолчанию: только Administrator (в elevated сессии)

SeImpersonatePrivilege
  - Олицетворять другого пользователя после аутентификации
  - Использовать токен аутентифицированного пользователя
  - Атака "Potato" (PrintSpoofer, RoguePotato, GodPotato):
    сервис с этой привилегией → привлекает SYSTEM токен → выполняет код как SYSTEM
  - По умолчанию: Network Service, Local Service, IIS worker processes

SeAssignPrimaryTokenPrivilege
  - Заменить токен процесса
  - Комбинируется с SeImpersonatePrivilege

SeTakeOwnershipPrivilege
  - Стать владельцем любого объекта (файл, реестр, процесс)
  - Как владелец → можно изменить ACL → получить доступ

SeLoadDriverPrivilege
  - Загрузить драйвер ядра
  - Может использоваться для BYOVD атак

SeBackupPrivilege и SeRestorePrivilege
  - Читать/записывать ЛЮБЫЕ файлы независимо от ACL (bypass через backup API)
  - Прочитать SAM, SYSTEM, SECURITY кусты реестра → извлечь хеши

SeTcbPrivilege
  - "Act as part of operating system"
  - Создавать токены с произвольным содержимым
  - Одна из наиболее опасных привилегий

SeCreateTokenPrivilege
  - Создавать произвольные токены доступа
  - Создать токен с любыми SID и привилегиями

SeEnableDelegationPrivilege
  - Настраивать Kerberos делегирование объектов в AD
```

### Whoami и проверка текущих привилегий

```
whoami /all     - полная информация (пользователь, группы, привилегии)
whoami /priv    - только привилегии
whoami /groups  - только группы

Вывод whoami /priv показывает:
  PRIVILEGES INFORMATION
  ----------------------
  Privilege Name                Description                    State
  ============================= ============================== ========
  SeShutdownPrivilege           Shut down the system           Disabled
  SeChangeNotifyPrivilege       Bypass traverse checking       Enabled
  SeUndockPrivilege             Remove computer from docking   Disabled
  SeIncreaseWorkingSetPrivilege Increase a process working set Disabled

State:
  Enabled  - привилегия активна прямо сейчас
  Disabled - привилегия есть в токене, но не активна
             (можно включить через AdjustTokenPrivileges API)

Даже если привилегия Disabled - она всё равно есть в токене
и может быть включена программно без повторного elevation.
```

---

## Local Admin и его ограничения в домене

### Pass-the-Hash и Remote UAC

```
Даже если у атакующего есть хеш локального администратора другой машины,
это не всегда означает полный доступ.

LocalAccountTokenFilterPolicy - политика, которая влияет на
Remote UAC для локальных аккаунтов:

LocalAccountTokenFilterPolicy = 0 (DEFAULT):
  При удалённом входе (через WinRM, SMB, PsExec) локальные аккаунты
  (даже Administrator) получают Filtered Token (Medium IL).
  Это Remote UAC - защита от lateral movement через локальные аккаунты.

LocalAccountTokenFilterPolicy = 1:
  Локальные аккаунты получают Full Token при удалённом входе.
  Нужно для некоторых сценариев управления (но снижает безопасность).

Исключения (всегда получают Full Token удалённо):
  - Встроенная учётная запись Administrator (SID S-1-5-21-...-500) - НЕ фильтруется!
  - Доменные аккаунты - НЕ фильтруются (только локальные)

Реестр:
  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
    LocalAccountTokenFilterPolicy = 0 или 1

Проверить:
  reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
    /v LocalAccountTokenFilterPolicy
```

---

## Конфигурация UAC - где смотреть и что менять

### Реестр и GPO

```
Все настройки UAC хранятся в реестре:
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\

Параметр                          Тип    Описание
────────────────────────────────────────────────────────────────────
EnableLUA                         DWORD  1 = UAC включён, 0 = выключен
ConsentPromptBehaviorAdmin        DWORD  Поведение для администраторов (0-5)
ConsentPromptBehaviorUser         DWORD  Поведение для пользователей (0,1,3)
PromptOnSecureDesktop             DWORD  1 = Secure Desktop, 0 = обычный desktop
EnableInstallerDetection          DWORD  1 = определять установщики, 0 = нет
ValidateAdminCodeSignatures       DWORD  1 = только подписанные приложения (строго)
EnableSecureUIAPaths              DWORD  1 = UIPI для UI Automation
FilterAdministratorToken          DWORD  1 = фильтровать встроенный Admin (редко нужно)

Через GPO:
Computer Configuration → Windows Settings → Security Settings →
Local Policies → Security Options → "User Account Control: ..."

Или через LGPO/Group Policy на домене:
Computer Configuration → Windows Settings → Security Settings →
Local Policies → Security Options → UAC настройки
```

### Рекомендации по безопасной конфигурации

```
Максимальная защита (рекомендуется для критичных серверов и рабочих станций):
  EnableLUA = 1
  ConsentPromptBehaviorAdmin = 2   (Prompt for consent на Secure Desktop)
  ConsentPromptBehaviorUser  = 1   (Prompt for credentials на Secure Desktop)
  PromptOnSecureDesktop      = 1
  ValidateAdminCodeSignatures = 1  (только подписанные - строго)

Стандартная конфигурация (корпоративный баланс):
  EnableLUA = 1
  ConsentPromptBehaviorAdmin = 5   (prompt только для не-Windows бинарей)
  ConsentPromptBehaviorUser  = 3   (prompt for credentials)
  PromptOnSecureDesktop      = 1

Плохая конфигурация (избегать!):
  EnableLUA = 0                    (UAC выключен - нет разделения токенов)
  ConsentPromptBehaviorAdmin = 0   (auto-elevate без диалога)
  PromptOnSecureDesktop = 0        (без Secure Desktop - UIPI не работает)
```

---

## Шпаргалка

```
КЛЮЧЕВЫЕ КОМПОНЕНТЫ
  consent.exe        - процесс диалога UAC (System IL, Secure Desktop)
  appinfo.dll        - Application Information Service (обрабатывает запросы elevation)
  lsass.exe          - хранит credentials в памяти (цель Mimikatz)
  LSAIso             - изолированный процесс (Credential Guard)

INTEGRITY LEVELS
  Untrusted < Low < Medium < High < System < Protected
  Процессы с токеном Filtered Token → Medium IL
  Процессы после UAC elevation → High IL
  Системные службы → System IL

РЕЕСТР
  UAC настройки:
    HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
      EnableLUA
      ConsentPromptBehaviorAdmin (0-5)
      PromptOnSecureDesktop (0/1)

  Remote UAC для локальных аккаунтов:
    HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\
      LocalAccountTokenFilterPolicy (0/1)

  Credential Guard:
    HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\CredentialGuard\

AUTO-ELEVATE БИНАРИ (цели UAC bypass)
  C:\Windows\System32\eventvwr.exe
  C:\Windows\System32\fodhelper.exe
  C:\Windows\System32\sdclt.exe
  C:\Windows\System32\CompMgmtLauncher.exe
  C:\Windows\System32\ComputerDefaults.exe

ПРОВЕРКА ПРИВИЛЕГИЙ
  whoami /all       - всё сразу
  whoami /priv      - только привилегии
  whoami /groups    - только группы

ОПАСНЫЕ ПРИВИЛЕГИИ
  SeDebugPrivilege          → читать LSASS (Mimikatz)
  SeImpersonatePrivilege    → Potato атаки → SYSTEM
  SeTakeOwnershipPrivilege  → взять любой объект
  SeLoadDriverPrivilege     → загрузить драйвер
  SeBackupPrivilege         → читать SAM/SYSTEM напрямую
  SeTcbPrivilege            → создавать произвольные токены

ДИАГНОСТИКА
  msinfo32.exe      - Virtualization-based security (Credential Guard)
  whoami /priv      - текущие привилегии процесса
  sigcheck.exe -m <exe> - манифест и autoElevate флаг
  Process Explorer (Sysinternals) - IL процессов в реальном времени
```

---

## Ссылки

- [UAC Architecture](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works) - официальная документация
- [Integrity Levels](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) - Mandatory Integrity Control
- [Credential Guard](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/) - документация по Credential Guard
- [Protected Users](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - группа Protected Users
- [UACME](https://github.com/hfiref0x/UACME) - база UAC bypass техник (исследовательский проект)
- [Sigcheck](https://learn.microsoft.com/en-us/sysinternals/downloads/sigcheck) - Sysinternals для анализа манифестов
- [Windows Privileges](https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants) - справочник привилегий
