---
title: "Windows - NTFS права и ACE/DACL/SACL"
date: "2026-05-15"
---

NTFS - файловая система Windows с богатой моделью разграничения доступа. В отличие от Linux, где права задаются тремя битами (rwx) для owner/group/other, Windows использует гибкую систему ACL (Access Control List), позволяющую задать точные права для любого количества пользователей и групп. Понимание этой модели критично для администрирования, аудита безопасности и пентеста.

---

## Основные понятия: Security Descriptor

```
Каждый объект Windows (файл, папка, раздел реестра, процесс, сервис и т.д.)
имеет Security Descriptor - структуру данных, описывающую кто и что может делать с объектом.

Security Descriptor содержит четыре компонента:

  Owner SID      - SID владельца объекта
                   Владелец всегда может изменить DACL объекта (даже без явного права)
                   Владелец может взять права обратно если их случайно убрал

  Group SID      - основная группа (наследие POSIX, почти не используется в Windows)

  DACL           - Discretionary Access Control List
                   Список кто что МОЖЕТ делать с объектом
                   "Discretionary" = владелец (или администратор) сам решает кто имеет доступ

  SACL           - System Access Control List
                   Список что нужно АУДИРОВАТЬ (записывать в Security Log)
                   Настраивается системным администратором
                   Записи попадают в Event Log (EventID 4663 и другие)

Если DACL отсутствует (NULL DACL):
  Доступ РАЗРЕШЁН всем - полный доступ без ограничений
  Это не то же самое что пустой DACL!

Если DACL пустой (Empty DACL):
  Доступ ЗАПРЕЩЁН всем - никто не может обратиться к объекту
  Даже владелец (хотя владелец может изменить DACL и восстановить доступ)

Если DACL есть (с записями):
  Доступ определяется записями ACE внутри DACL
```

---

## SID - Security Identifier

```
SID (Security Identifier) - уникальный идентификатор субъекта безопасности.
Каждый пользователь, группа, компьютер, сервис имеет свой SID.

Формат SID:
  S-1-5-21-<domain_identifier>-<RID>

  S        - префикс "Security"
  1        - версия (всегда 1)
  5        - identifier authority (5 = NT Authority)
  21-...   - sub-authority, идентификатор домена/машины
  RID      - Relative Identifier, уникальный номер внутри домена

Примеры реальных SID:

  S-1-5-21-1234567890-1234567890-1234567890-1000
    - обычный пользователь (RID >= 1000 для пользователей домена)
    - первый созданный пользователь обычно получает RID 1000

  S-1-5-21-1234567890-1234567890-1234567890-500
    - встроенная учётная запись Administrator (RID 500 всегда)
    - именно SID определяет это - даже если переименовать аккаунт

  S-1-5-21-1234567890-1234567890-1234567890-512
    - группа Domain Admins (RID 512 всегда)

Хорошо известные (Well-known) SID - одинаковые на всех машинах:

  S-1-1-0            Everyone            - все (включая анонимных)
  S-1-5-11           Authenticated Users - прошедшие аутентификацию
  S-1-5-18           SYSTEM              - системный аккаунт
  S-1-5-19           LOCAL SERVICE       - локальная служба
  S-1-5-20           NETWORK SERVICE     - сетевая служба
  S-1-5-32-544       Administrators      - локальная группа Administrators
  S-1-5-32-545       Users               - локальная группа Users
  S-1-5-32-546       Guests              - локальная группа Guests
  S-1-16-4096        Low IL              - Integrity Level: Low
  S-1-16-8192        Medium IL           - Integrity Level: Medium
  S-1-16-12288       High IL             - Integrity Level: High
  S-1-16-16384       System IL           - Integrity Level: System

Посмотреть SID текущего пользователя:
  whoami /user

Найти SID по имени:
  wmic useraccount where name='username' get sid
  Get-LocalUser -Name username | Select-Object SID     # PowerShell
  Get-ADUser -Identity username | Select-Object SID    # AD PowerShell module

Найти имя по SID:
  wmic useraccount where sid='S-1-5-21-...' get name
```

---

## ACL - Access Control List

```
ACL - это список записей ACE, применённый к объекту.
Два типа ACL:

  DACL - кто имеет доступ (управляется владельцем/администратором)
  SACL - что аудируется (управляется только SeSecurityPrivilege)

Порядок проверки DACL Windows:
  При запросе доступа к объекту Windows проходит по ACE в DACL сверху вниз:

  1. Проверяет каждый ACE поочерёдно (порядок ВАЖЕН)
  2. Если ACE типа Deny - запрещает немедленно и ОСТАНАВЛИВАЕТСЯ
  3. Если ACE типа Allow - накапливает разрешённые права
  4. Когда запрошенные права набраны - разрешает доступ
  5. Если прошёл весь список и права не набраны - ЗАПРЕЩАЕТ

  ВАЖНО: Deny ACE обрабатываются ПЕРВЫМИ (если расположены в начале списка).
  При неправильном порядке - Deny может не сработать!
  Windows размещает явные Deny ACE перед Allow ACE автоматически при стандартных операциях.
  Но при ручном редактировании порядок надо контролировать самому.

Алгоритм проверки доступа (упрощённо):
  Запрос: открыть файл на чтение
  
  ACE 1: Allow DOMAIN\alice  Read   → alice? да → добавить Read
  ACE 2: Allow BUILTIN\Users Read   → входит? да → Read уже есть, продолжаем
  ACE 3: Deny  DOMAIN\bob    Write  → bob? нет → пропускаем
  ACE 4: Allow Administrators Full  → входит в Administrators? да → добавить All
  
  Итог: если запрошено только Read - есть. Разрешить.
```

---

## ACE - Access Control Entry

```
ACE (Access Control Entry) - одна запись в ACL.
Каждый ACE описывает права одного субъекта на данный объект.

Структура ACE:

  [ACE Type] [ACE Flags] [Access Mask] [SID]

  ACE Type  - тип записи (Allow, Deny, Audit и т.д.)
  ACE Flags - флаги наследования и аудита
  Access Mask - битовая маска с конкретными правами
  SID       - кому относится этот ACE

ACE Types (типы):

  ACCESS_ALLOWED_ACE       (0x00) - разрешить
  ACCESS_DENIED_ACE        (0x01) - запретить
  SYSTEM_AUDIT_ACE         (0x02) - аудировать (в SACL)
  ACCESS_ALLOWED_OBJECT_ACE (0x05) - разрешить на конкретный тип объекта AD
  ACCESS_DENIED_OBJECT_ACE  (0x06) - запретить на конкретный тип объекта AD
  SYSTEM_MANDATORY_LABEL_ACE (0x11) - Integrity Level метка (в SACL)

ACE Flags (флаги наследования):

  OBJECT_INHERIT_ACE        (0x01) OI - применять к дочерним файлам
  CONTAINER_INHERIT_ACE     (0x02) CI - применять к дочерним папкам
  NO_PROPAGATE_INHERIT_ACE  (0x04) NP - не передавать наследование глубже
  INHERIT_ONLY_ACE          (0x08) IO - только для наследования, не для самого объекта
  INHERITED_ACE             (0x10) I  - этот ACE унаследован (а не задан явно)

  Комбинации флагов:
  OI + CI     - наследовать на файлы и папки (самый частый случай)
  IO + CI     - только субпапки наследуют, сам объект - нет
  IO + OI + CI - наследовать на все дочерние объекты

ACE Flags (флаги аудита, только в SACL):

  SUCCESSFUL_ACCESS_ACE_FLAG (0x40) SA - аудировать успешный доступ
  FAILED_ACCESS_ACE_FLAG     (0x80) FA - аудировать неуспешный доступ
```

---

## Access Mask - маска доступа

```
Access Mask - 32-битное число, где каждый бит = конкретное право.
Делится на несколько зон:

Биты 0-15:   Object-specific rights (специфичны для типа объекта)
Биты 16-23:  Standard rights (одинаковы для всех объектов)
Биты 24-31:  Generic rights (абстрактные права, маппируются в specific)

Standard Rights (одинаковы для всех объектов):
  Бит 16  DELETE              (0x00010000) - удалить объект
  Бит 17  READ_CONTROL        (0x00020000) - читать Security Descriptor (кроме SACL)
  Бит 18  WRITE_DAC           (0x00040000) - изменять DACL
  Бит 19  WRITE_OWNER         (0x00080000) - изменять владельца
  Бит 20  SYNCHRONIZE         (0x00100000) - синхронизация (для файлов: обязательно для чтения/записи)

Generic Rights (маппируются в конкретные):
  GENERIC_ALL     (0x10000000) GA
  GENERIC_EXECUTE (0x20000000) GX
  GENERIC_WRITE   (0x40000000) GW
  GENERIC_READ    (0x80000000) GR

File/Directory Specific Rights (биты 0-15 для файлов):
  Для файлов:
    FILE_READ_DATA         (0x0001) - читать содержимое файла
    FILE_WRITE_DATA        (0x0002) - записывать в файл (изменять содержимое)
    FILE_APPEND_DATA       (0x0004) - добавлять в конец файла
    FILE_READ_EA           (0x0008) - читать Extended Attributes
    FILE_WRITE_EA          (0x0010) - писать Extended Attributes
    FILE_EXECUTE           (0x0020) - выполнить файл
    FILE_READ_ATTRIBUTES   (0x0080) - читать атрибуты (hidden, system, архив и т.д.)
    FILE_WRITE_ATTRIBUTES  (0x0100) - изменять атрибуты

  Для директорий:
    FILE_LIST_DIRECTORY    (0x0001) - просмотр содержимого директории
    FILE_ADD_FILE          (0x0002) - создавать файлы в директории
    FILE_ADD_SUBDIRECTORY  (0x0004) - создавать поддиректории
    FILE_DELETE_CHILD      (0x0040) - удалять файлы внутри директории
                                      (даже если нет прав Delete на сам файл!)

Составные (агрегированные) права для файлов:

  FILE_GENERIC_READ  = READ_CONTROL + SYNCHRONIZE +
                       FILE_READ_DATA + FILE_READ_ATTRIBUTES + FILE_READ_EA

  FILE_GENERIC_WRITE = READ_CONTROL + SYNCHRONIZE + WRITE_DAC +
                       FILE_WRITE_DATA + FILE_APPEND_DATA +
                       FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA

  FILE_ALL_ACCESS    = всё вышеперечисленное + DELETE + все остальные биты

Стандартные права Windows (в GUI): что они означают реально

  Full Control      = FILE_ALL_ACCESS
                      Включает WRITE_DAC и WRITE_OWNER - опасно давать!

  Modify            = FILE_GENERIC_READ + FILE_GENERIC_WRITE +
                      FILE_EXECUTE + DELETE
                      Нет WRITE_DAC и WRITE_OWNER - нельзя менять права

  Read & Execute    = FILE_GENERIC_READ + FILE_EXECUTE

  List Folder Contents = FILE_LIST_DIRECTORY + FILE_READ_ATTRIBUTES +
                         FILE_READ_EA + READ_CONTROL + SYNCHRONIZE
                         (только для папок)

  Read              = FILE_GENERIC_READ

  Write             = FILE_WRITE_DATA + FILE_APPEND_DATA +
                      FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA +
                      READ_CONTROL
```

---

## DACL - Discretionary Access Control List

### Наследование DACL

```
Наследование - механизм автоматической передачи ACE от родительской папки
к дочерним объектам. Позволяет не выставлять права на каждый файл вручную.

Типы ACE с точки зрения наследования:

  Явные (Explicit) ACE:
    Заданы непосредственно на объекте вручную
    Имеют приоритет над унаследованными
    НЕ имеют флага INHERITED_ACE (0x10)

  Унаследованные (Inherited) ACE:
    Переданы от родительского объекта
    Имеют флаг INHERITED_ACE (0x10)
    Обрабатываются ПОСЛЕ явных ACE

Порядок ACE в DACL (Windows сортирует автоматически):
  1. Явные Deny ACE
  2. Явные Allow ACE
  3. Унаследованные Deny ACE
  4. Унаследованные Allow ACE

Флаги наследования на примерах:

  Флаги на родительской папке C:\Data\:
  (OI)(CI) Allow Users Read
    OI = Object Inherit - наследовать на файлы
    CI = Container Inherit - наследовать на папки
    → файлы в C:\Data\ получат Allow Users Read
    → подпапки в C:\Data\ получат Allow Users Read + OI + CI (передают дальше)

  (OI)(CI)(IO) Allow Users Read
    IO = Inherit Only - только для наследования, НЕ применяется к C:\Data\ сама
    → C:\Data\ сама этого права НЕ имеет
    → файлы и папки внутри получат

  (OI)(CI)(NP) Allow Users Read
    NP = No Propagate - не передавать флаги наследования глубже
    → C:\Data\ имеет право
    → C:\Data\subdir\ получит право (без флагов OI/CI)
    → C:\Data\subdir\file.txt НЕ получит (наследование остановлено)

Блокировка наследования:
  Можно прервать наследование на любом объекте.
  При блокировке можно выбрать:
    - Скопировать унаследованные ACE как явные (рекомендуется)
    - Удалить все унаследованные ACE (объект остаётся с явными только)

  PowerShell:
    $acl = Get-Acl "C:\Data\secret"
    $acl.SetAccessRuleProtection($true, $true)  # заблокировать + скопировать
    Set-Acl "C:\Data\secret" $acl

  icacls:
    icacls C:\Data\secret /inheritance:d    # d = disable (block + keep)
    icacls C:\Data\secret /inheritance:r    # r = remove (block + delete inherited)
    icacls C:\Data\secret /inheritance:e    # e = enable (restore inheritance)
```

### Владелец (Owner)

```
Владелец объекта - особый субъект с неотъемлемыми правами:
  - Всегда может читать DACL (READ_CONTROL неявно)
  - Всегда может изменять DACL (WRITE_DAC неявно)
  - Даже если явно убрать его из DACL - он сможет вернуть права обратно

Кто становится владельцем:
  При создании файла/папки - пользователь, создавший объект
  Если создаёт администратор - владельцем становится группа BUILTIN\Administrators,
  а не конкретный пользователь (если включена политика SE_DEBUG или стандартная)

Смена владельца:
  Требует SeTakeOwnershipPrivilege или уже быть администратором.
  Владелец может передать владение - другому пользователю или группе.

  icacls:
    takeown /f C:\file.txt /a          # взять владение (ты становишься владельцем)
    takeown /f C:\folder /r /d y       # рекурсивно для папки

  PowerShell:
    $acl = Get-Acl "C:\file.txt"
    $owner = New-Object System.Security.Principal.NTAccount("DOMAIN\user")
    $acl.SetOwner($owner)
    Set-Acl "C:\file.txt" $acl

Атака через владение:
  SeRestorePrivilege или SeTakeOwnershipPrivilege позволяют взять любой файл.
  Пример: взять SAM файл → добавить права → прочитать → дамп хешей.
  (Но SAM и SYSTEM заблокированы ядром, нужен Volume Shadow Copy)
```

---

## SACL - System Access Control List

```
SACL - список аудита. Определяет что записывать в Security Event Log.
Требует привилегию SeSecurityPrivilege для чтения/изменения.

ACE в SACL:

  SYSTEM_AUDIT_ACE - аудировать доступ субъекта
    Флаги:
      SUCCESSFUL_ACCESS_ACE_FLAG (SA) - записывать успешный доступ
      FAILED_ACCESS_ACE_FLAG     (FA) - записывать неуспешный доступ

  SYSTEM_MANDATORY_LABEL_ACE - метка Integrity Level
    Находится тоже в SACL, но это не аудит - это IL метка объекта

Пример настройки аудита через PowerShell:
  $acl = Get-Acl "C:\Data\sensitive"

  # аудировать: все попытки удаления (успешные и неуспешные) от Everyone
  $auditRule = New-Object System.Security.AccessControl.FileSystemAuditRule(
    "Everyone",
    "Delete",
    "ContainerInherit, ObjectInherit",
    "None",
    "Success, Failure"
  )
  $acl.AddAuditRule($auditRule)
  Set-Acl "C:\Data\sensitive" $acl

icacls для аудита:
  icacls C:\Data\sensitive /setaudit Everyone:D /T /C
  # D = Delete, /T = рекурсивно, /C = продолжать при ошибках

Что попадает в Event Log:
  EventID 4663 - попытка доступа к объекту (файл, реестр и т.д.)
  EventID 4656 - дескриптор объекта запрошен
  EventID 4660 - объект удалён
  EventID 4670 - права на объект изменены
  EventID 4907 - SACL изменён

Важно: для работы SACL-аудита надо включить политику аудита объектов:
  Local Security Policy → Audit Policy → Audit object access = Success, Failure
  Или через GPO: Computer Configuration → Windows Settings → Security Settings →
  Advanced Audit Policy Configuration → Object Access → Audit File System
```

---

## Инструменты работы с правами

### icacls - командная строка

```
icacls - основной инструмент командной строки для работы с NTFS правами.

Просмотр прав:
  icacls C:\Data\file.txt
  icacls C:\Data\ /T              # рекурсивно

  Вывод примерный:
  C:\Data\file.txt
    NT AUTHORITY\SYSTEM:(I)(F)       I=Inherited, F=Full Control
    BUILTIN\Administrators:(I)(F)
    BUILTIN\Users:(I)(RX)            RX = Read & Execute
    DOMAIN\alice:(R)                 R = Read

Обозначения прав в icacls:
  F  - Full Control
  M  - Modify
  RX - Read & Execute
  R  - Read
  W  - Write
  D  - Delete
  X  - Execute
  N  - No access (явный Deny - редко, но бывает)

Флаги наследования в icacls:
  (OI) - Object Inherit
  (CI) - Container Inherit
  (IO) - Inherit Only
  (NP) - No Propagate
  (I)  - Inherited (показывается при просмотре)

Назначение прав:
  # дать alice Full Control рекурсивно
  icacls C:\Data /grant "DOMAIN\alice:(OI)(CI)F" /T

  # дать Users право Read (только чтение)
  icacls C:\Data\reports /grant "BUILTIN\Users:(OI)(CI)R"

  # запретить bob запись (Deny)
  icacls C:\Data /deny "DOMAIN\bob:(W)"

  # убрать права alice (не Deny, а удалить запись)
  icacls C:\Data /remove "DOMAIN\alice"

  # сохранить права в файл и восстановить
  icacls C:\Data /save permissions.txt /T
  icacls C:\Data /restore permissions.txt

  # сбросить к унаследованным (убрать явные ACE)
  icacls C:\Data\file.txt /reset

  # заменить все права (опасно!)
  icacls C:\Data /grant:r "DOMAIN\alice:(OI)(CI)F" /T
  # /grant:r = replace (заменяет существующие для этого пользователя)
  # без :r = добавляет дополнительный ACE

Работа с владельцем:
  takeown /f C:\Data\file.txt
  takeown /f C:\Data /r /d y     # рекурсивно, согласие на всё
```

### PowerShell - Get-Acl / Set-Acl

```
PowerShell даёт полный контроль над ACL через .NET классы.

Просмотр прав:
  # базовый просмотр
  Get-Acl "C:\Data\file.txt" | Format-List

  # детальный просмотр всех ACE
  (Get-Acl "C:\Data\file.txt").Access | Format-Table IdentityReference,
    FileSystemRights, AccessControlType, IsInherited, InheritanceFlags -AutoSize

  # только явные (не унаследованные) ACE
  (Get-Acl "C:\Data\file.txt").Access | Where-Object { -not $_.IsInherited }

  # поиск файлов с правами для конкретного пользователя
  Get-ChildItem C:\Data -Recurse | ForEach-Object {
    $acl = Get-Acl $_.FullName
    $acl.Access | Where-Object { $_.IdentityReference -match "alice" } |
    Select-Object @{n='Path';e={$_.Path}}, IdentityReference, FileSystemRights
  }

Назначение прав:
  $acl = Get-Acl "C:\Data\reports"

  # создать правило
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "DOMAIN\alice",                              # пользователь
    "ReadAndExecute",                            # права
    "ContainerInherit, ObjectInherit",           # наследование
    "None",                                      # propagation flags
    "Allow"                                      # тип
  )

  $acl.AddAccessRule($rule)
  Set-Acl "C:\Data\reports" $acl

  # убрать правило
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "DOMAIN\alice", "ReadAndExecute", "Allow"
  )
  $acl.RemoveAccessRule($rule)
  Set-Acl "C:\Data\reports" $acl

Права доступа (FileSystemRights enum):
  FullControl, Modify, ReadAndExecute, Read, Write, Delete,
  ReadPermissions, ChangePermissions, TakeOwnership,
  ListDirectory, CreateFiles, CreateDirectories,
  AppendData, ReadExtendedAttributes, WriteExtendedAttributes,
  ExecuteFile, DeleteSubdirectoriesAndFiles,
  ReadAttributes, WriteAttributes, Synchronize

Наследование (InheritanceFlags):
  None                        - только для этого объекта
  ContainerInherit (CI)       - на дочерние папки
  ObjectInherit (OI)          - на дочерние файлы

Propagation (PropagationFlags):
  None                        - стандартное поведение
  InheritOnly (IO)            - только для наследования
  NoPropagateInherit (NP)     - не передавать наследование глубже
```

### Просмотр через GUI (Explorer + Security Tab)

```
Правый клик на файл/папку → Properties → Security вкладка

Что видно:
  Список пользователей/групп с их правами
  Кнопка Edit - изменить DACL
  Кнопка Advanced - полный Security Descriptor (владелец, SACL, наследование)

В Advanced Security Settings:
  Вкладка Permissions:
    Список всех ACE с флагами наследования
    Кнопка Show inherited permissions - показать унаследованные ACE
    Галочка "Disable inheritance" - заблокировать наследование

  Вкладка Auditing:
    SACL - записи аудита
    Требует прав администратора для изменения

  Вкладка Effective Access:
    Рассчитать реальные права для конкретного пользователя
    Учитывает членство в группах, Integrity Level
    Очень полезно при диагностике

  Вкладка Owner:
    Кто владелец, кнопка Change для смены владельца
```

### accesschk.exe (Sysinternals)

```
accesschk - мощный инструмент аудита прав, часть Sysinternals Suite.
Особенно полезен для пентеста и обнаружения слабых мест.

Скачать: https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk

Проверить права конкретного пользователя на файл:
  accesschk.exe -l C:\Data\file.txt         # показать DACL
  accesschk.exe DOMAIN\alice C:\Data\       # что может alice

Поиск папок с правами на запись для всех (например, Users):
  accesschk.exe -uwdq "Users" C:\           # -w = writable, -d = dirs, -q = no banner
  accesschk.exe -uwdq "Everyone" C:\
  accesschk.exe -uwdq "Authenticated Users" C:\

Поиск слабых мест в системе (LPE аудит):
  # папки доступные для записи всем (часто используются в LPE)
  accesschk.exe -uwdqs "Everyone" C:\
  accesschk.exe -uwdqs "Users" C:\

  # сервисы с нестандартными путями и слабыми правами
  accesschk.exe -uwcqv "Everyone" *          # права на сервисы
  accesschk.exe -uwcqv "Users" *

  # реестр - ключи доступные для записи
  accesschk.exe -uwkqs "Users" HKLM\SYSTEM\CurrentControlSet\Services\

Примеры из пентеста:
  # найти папки в Program Files где Users могут писать (DLL hijacking)
  accesschk.exe -uwdq "Users" "C:\Program Files\" /accepteula

  # найти сервисы где Users могут изменять binPath (unquoted service path / service hijack)
  accesschk.exe -uwcqv "Users" * /accepteula
```

---

## Специальные права и расширенные концепции

### FILE_DELETE_CHILD - удаление через родителя

```
FILE_DELETE_CHILD - право удалять файлы ВНУТРИ директории.
Даже если у пользователя нет права Delete на сам файл.

Если у папки C:\Shared\ есть:
  Allow Users FILE_DELETE_CHILD

То пользователь из Users может удалить C:\Shared\file.txt,
даже если на C:\Shared\file.txt у него вообще нет прав.

Почему это так работает:
  Windows при удалении файла проверяет ОБА варианта:
  1. Есть ли DELETE право на файл? ИЛИ
  2. Есть ли FILE_DELETE_CHILD на родительскую папку?
  Если любой из них - разрешить.

Это используется в атаках на слабые права директорий.
Аудит: проверяй FILE_DELETE_CHILD на чувствительные папки.
```

### CreateFile флаги и права доступа

```
При открытии файла через CreateFile() указывается DesiredAccess:
  GENERIC_READ     (0x80000000) - открыть для чтения
  GENERIC_WRITE    (0x40000000) - открыть для записи
  GENERIC_EXECUTE  (0x20000000) - открыть для выполнения
  GENERIC_ALL      (0x10000000) - все права

Windows маппирует GENERIC_* в file-specific права:
  GENERIC_READ    → FILE_READ_DATA + FILE_READ_ATTRIBUTES + FILE_READ_EA + READ_CONTROL + SYNCHRONIZE
  GENERIC_WRITE   → FILE_WRITE_DATA + FILE_WRITE_ATTRIBUTES + FILE_WRITE_EA + READ_CONTROL + SYNCHRONIZE + APPEND_DATA + WRITE_DAC
  GENERIC_EXECUTE → FILE_EXECUTE + FILE_READ_ATTRIBUTES + READ_CONTROL + SYNCHRONIZE
```

### Alternate Data Streams (ADS)

```
NTFS поддерживает Alternate Data Streams - дополнительные потоки данных
прикреплённые к файлу. Основной поток - unnamed stream.

Создание ADS:
  echo "hidden data" > C:\file.txt:hidden_stream
  Set-Content -Path "C:\file.txt:hidden_stream" -Value "secret"

Чтение ADS:
  Get-Content "C:\file.txt:hidden_stream"
  type "C:\file.txt:hidden_stream"

Просмотр всех потоков файла:
  Get-Item C:\file.txt -Stream *
  dir /r C:\file.txt       # в CMD

Удаление ADS:
  Remove-Item "C:\file.txt" -Stream "hidden_stream"

Права на ADS:
  ADS наследует права основного файла.
  Отдельно задать права на ADS нельзя.
  Если есть права на чтение файла - есть права на чтение его ADS.

Применение в malware:
  Malware прячет пейлоад в ADS легитимного файла.
  При стандартном просмотре директории ADS не видны.
  wscript.exe C:\legit.txt:payload.vbs - выполнить скрипт из ADS.
  
  Обнаружение:
    Get-ChildItem -Recurse | Get-Item -Stream * | Where-Object Stream -ne ':$DATA'
    streams.exe -s C:\  (Sysinternals)
```

### Жёсткие ссылки (Hard Links) и права

```
Hard Link - несколько записей в директории указывают на один и тот же inode.
  mklink /h C:\link.txt C:\original.txt

Права и hard links:
  Hard link и оригинальный файл - ЭТО ОДИН ОБЪЕКТ.
  У них общий Security Descriptor.
  Изменение прав через один путь = изменение прав для другого.
  
  Атака через hard links:
    Если программа создаёт файл и сразу устанавливает права -
    между созданием и установкой прав можно создать hard link.
    Права будут выставлены на чужой файл.
    (TOCTOU - Time of Check Time of Use уязвимость)

Символические ссылки (Symlinks) и права:
  mklink C:\symlink.txt C:\target.txt        # требует SeCreateSymbolicLinkPrivilege

  При доступе через symlink - проверяются права ЦЕЛЕВОГО файла.
  Права на саму ссылку не используются при обращении к данным.
  
  Junction Points (для директорий):
    mklink /j C:\junction C:\target_dir
    Права папки-источника не влияют на содержимое target_dir.
```

---

## Integrity Level и NTFS

```
Integrity Level (IL) - отдельный механизм контроля (MIC - Mandatory Integrity Control).
Работает ПОВЕРХ и ВМЕСТЕ с DACL.

Правило MIC: "No Write Up"
  Процесс с Medium IL не может записывать в объект с High IL.
  Даже если DACL явно разрешает Write.

IL метка хранится в SACL объекта:
  Специальный SYSTEM_MANDATORY_LABEL_ACE.

По умолчанию IL метки файлов:
  C:\Windows\         - Medium (системные файлы доступны High и System процессам через DACL)
  C:\Program Files\   - Medium
  Файлы пользователя  - Medium
  Temp\Low\           - Low (специально для Protected Mode браузеров)

Посмотреть IL метку объекта:
  icacls C:\file.txt   # в конце строки показывает IL если не Medium

  PowerShell:
    $acl = Get-Acl "C:\file.txt" -Audit
    # IL хранится в SACL как SYSTEM_MANDATORY_LABEL_ACE

Изменить IL метку:
  icacls C:\file.txt /setintegritylevel Low
  icacls C:\file.txt /setintegritylevel Medium
  icacls C:\file.txt /setintegritylevel High

Комбинация DACL + MIC:
  Файл с IL=High + DACL Allow Everyone FullControl:
    Процесс с Medium IL пытается записать → MIC ЗАПРЕЩАЕТ (No Write Up)
    DACL не рассматривается для Write операций если MIC блокирует

  Файл с IL=Low + DACL Allow Everyone FullControl:
    Процесс с Medium IL может читать (No Read Down = нет, чтение разрешено)
    Процесс с Medium IL может писать (IL не выше, MIC не блокирует)
    Но Low IL процесс не может записывать в Medium IL файл
```

---

## Права реестра

```
Реестр Windows также использует ACL модель. Те же принципы, другие права.

Registry-specific rights (вместо File-specific):
  KEY_QUERY_VALUE        (0x0001) - читать значения ключа
  KEY_SET_VALUE          (0x0002) - устанавливать значения
  KEY_CREATE_SUB_KEY     (0x0004) - создавать подключи
  KEY_ENUMERATE_SUB_KEYS (0x0008) - перечислять подключи
  KEY_NOTIFY             (0x0010) - уведомления об изменениях
  KEY_CREATE_LINK        (0x0020) - создавать символические ссылки в реестре
  KEY_WOW64_64KEY        (0x0100) - работать с 64-bit представлением
  KEY_WOW64_32KEY        (0x0200) - работать с 32-bit представлением

Составные права реестра:
  KEY_READ  = KEY_QUERY_VALUE + KEY_ENUMERATE_SUB_KEYS + KEY_NOTIFY + READ_CONTROL
  KEY_WRITE = KEY_SET_VALUE + KEY_CREATE_SUB_KEY + READ_CONTROL
  KEY_ALL_ACCESS = всё + DELETE + WRITE_DAC + WRITE_OWNER

Просмотр прав реестра:
  # cmd
  reg query HKLM\SOFTWARE\MyApp /v *    # просмотр значений (не прав)

  # PowerShell
  Get-Acl "HKLM:\SOFTWARE\MyApp" | Format-List

  # accesschk
  accesschk.exe -kquw "Users" HKLM\SYSTEM\CurrentControlSet\Services\

Назначение прав реестра в PowerShell:
  $acl = Get-Acl "HKLM:\SOFTWARE\MyApp"

  $rule = New-Object System.Security.AccessControl.RegistryAccessRule(
    "DOMAIN\alice",
    "ReadKey",          # или "FullControl", "WriteKey", etc.
    "ContainerInherit",
    "None",
    "Allow"
  )
  $acl.AddAccessRule($rule)
  Set-Acl "HKLM:\SOFTWARE\MyApp" $acl

Критичные ключи с ограниченным доступом:
  HKLM\SAM\SAM\                          # база локальных аккаунтов (только SYSTEM)
  HKLM\SECURITY\                         # политики безопасности (только SYSTEM)
  HKLM\SYSTEM\CurrentControlSet\         # конфигурация системы
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\  # загрузка системы

Поиск слабых прав (LPE аудит):
  # ключи сервисов где Users могут писать
  accesschk.exe -kquwsv "Users" "HKLM\SYSTEM\CurrentControlSet\Services\" /accepteula

  # ключи автозапуска
  accesschk.exe -kquw "Users" "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
```

---

## Диагностика и типичные проблемы

### Алгоритм отладки проблем с доступом

```
Пользователь не может открыть файл - что проверить:

Шаг 1 - Проверить Effective Access (самый быстрый способ):
  Свойства файла → Security → Advanced → Effective Access
  Выбрать пользователя → View effective access
  Windows сам посчитает все права с учётом групп

Шаг 2 - Посмотреть ACL:
  icacls C:\path\to\file.txt
  (Get-Acl "C:\path\to\file.txt").Access | ft -AutoSize

Шаг 3 - Проверить группы пользователя:
  whoami /groups    # от имени пользователя
  Get-ADPrincipalGroupMembership username | Select Name

Шаг 4 - Проверить наследование:
  icacls C:\path\to\file.txt
  # смотреть флаг (I) - если нет, права явные, если есть - унаследованные
  # смотреть родительскую папку если права пришли оттуда

Шаг 5 - Проверить Deny ACE:
  # Deny переопределяет Allow
  # искать Deny ACE для пользователя или его групп
  (Get-Acl "C:\path").Access | Where-Object { $_.AccessControlType -eq "Deny" }

Шаг 6 - Проверить Integrity Level:
  # если процесс Medium IL пытается писать в High IL объект
  icacls C:\path  # IL показывается в конце если не Medium

Шаг 7 - Включить аудит и смотреть Event Log:
  # EventID 4663 - попытка доступа
  # EventID 4656 - запрос дескриптора (с причиной отказа)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4663} |
    Where-Object { $_.Message -match "C:\\path\\to\\file" } |
    Select-Object -First 10 | Format-List
```

### Типичные ошибки с правами

```
Проблема: "Access Denied" хотя права выставлены правильно

Причина 1: Deny ACE от группы
  Пользователь в группе Contractors, на папке Deny Contractors Write.
  Пользователю лично дан Allow Write.
  Deny от группы перебивает Allow персональный.
  Решение: убрать Deny или убрать из группы.

Причина 2: Integrity Level
  Процесс Low IL (браузер в protected mode) пытается писать в Medium IL файл.
  Решение: понять зачем Low IL процессу нужны права на Medium IL файл.

Причина 3: Владение объектом (Owner сам заблокировал)
  Владелец убрал себя из DACL и не может получить доступ.
  Решение: владелец может восстановить права через Advanced → Change permissions.

Причина 4: Пустой DACL (не NULL, а Empty)
  Никого в DACL нет → никто не имеет доступа.
  Решение: нужны административные права чтобы изменить DACL (через владение).

Причина 5: Права есть, но шара (Share) ограничивает
  NTFS права + Share permissions работают вместе.
  Итоговый доступ = пересечение (наиболее ограничивающие).
  Пример: NTFS Full Control + Share Read Only = Read Only через сеть.
  Решение: проверить оба набора прав.

Проблема: Права выставлены но не применились к дочерним файлам

Причина: Флаги наследования
  Если указали право без CI/OI - оно только для папки, не для содержимого.
  Или наследование заблокировано на дочерних объектах.
  Решение: icacls C:\folder /grant "user:(OI)(CI)R" /T /C
```

---

## Практические сценарии

### Сценарий 1: Настроить доступ к корпоративной папке

```
Задача: папка C:\Projects\Finance\
  - Группа Finance может читать и писать
  - Группа Management только читает
  - IT Admins Full Control
  - Все остальные - нет доступа

Шаг 1: Убрать наследование (чтобы Everyone/Users не мешали):
  icacls C:\Projects\Finance /inheritance:d

Шаг 2: Убрать лишние унаследованные права (оставить явные):
  icacls C:\Projects\Finance /remove:g "BUILTIN\Users"
  icacls C:\Projects\Finance /remove:g "Everyone"

Шаг 3: Назначить права:
  icacls C:\Projects\Finance /grant "BUILTIN\Administrators:(OI)(CI)F"
  icacls C:\Projects\Finance /grant "DOMAIN\IT-Admins:(OI)(CI)F"
  icacls C:\Projects\Finance /grant "DOMAIN\Finance:(OI)(CI)M"
  icacls C:\Projects\Finance /grant "DOMAIN\Management:(OI)(CI)R"
  # Обязательно: SYSTEM должен иметь доступ для системных операций
  icacls C:\Projects\Finance /grant "NT AUTHORITY\SYSTEM:(OI)(CI)F"

Шаг 4: Проверить:
  icacls C:\Projects\Finance
  # Проверить effective access для каждой группы
```

### Сценарий 2: Аудит слабых прав (пентест / LPE)

```
Ищем пути эскалации привилегий через слабые права.

1. Папки с правами записи для обычных пользователей:
  # Места где лежат исполняемые файлы
  accesschk.exe -uwdqs "Users" "C:\Program Files" /accepteula
  accesschk.exe -uwdqs "Everyone" "C:\Program Files (x86)" /accepteula
  accesschk.exe -uwdqs "BUILTIN\Users" "C:\" /accepteula

2. Сервисы с нестандартными путями и правами:
  # Unquoted Service Paths - пути без кавычек с пробелами
  wmic service get name,displayname,pathname,startmode |
    findstr /i "auto" | findstr /i /v "c:\windows\\" | findstr /i /v """

  # Слабые права на папки где лежат бинари сервисов
  sc qc ServiceName    # узнать путь бинаря сервиса
  accesschk.exe -uwdq "Users" "C:\path\to\service\"

3. Реестр - права на ключи сервисов:
  accesschk.exe -kquwsv "Users" HKLM\SYSTEM\CurrentControlSet\Services\ /accepteula
  # если пользователь может писать в ключ сервиса - может изменить ImagePath

4. DLL Hijacking - ищем папки в PATH доступные для записи:
  # получить PATH
  $env:PATH -split ';'
  # проверить каждую папку
  accesschk.exe -uwdq "Users" "C:\SomePath\InPATH"

5. Scheduled Tasks с слабыми путями:
  Get-ScheduledTask | Where-Object { $_.Principal.RunLevel -eq "Highest" } |
    Select-Object TaskName, @{n='Path';e={$_.Actions.Execute}}
  # затем проверить права на папку бинаря
```

### Сценарий 3: Восстановление прав после ошибки

```
Ситуация: случайно убрали все права на папку C:\Important\
  Теперь "Access Denied" даже для администратора.

Шаг 1: Взять владение (как администратор, через elevated cmd):
  takeown /f C:\Important /r /d y

Шаг 2: Вернуть права администраторам:
  icacls C:\Important /grant Administrators:F /T

Шаг 3: Восстановить стандартные права:
  icacls C:\Important /reset /T              # сбросить к унаследованным
  # или назначить вручную нужные права

Шаг 4: Восстановить наследование если нужно:
  icacls C:\Important /inheritance:e         # включить наследование от родителя

Ситуация 2: нет доступа к файлу который нужно прочитать, но есть SeBackupPrivilege:
  # SeBackupPrivilege позволяет читать файлы игнорируя DACL через backup API
  # Используется утилитами резервного копирования

  # PowerShell с SeBackupPrivilege:
  # Нужно включить привилегию и использовать специальный флаг
  # (стандартный Get-Content не поможет, нужен специальный код)

  # Через robocopy (использует backup API):
  robocopy C:\Restricted\ C:\Backup\ /B    # /B = backup mode, игнорирует DACL
  # работает если у тебя есть SeBackupPrivilege
```

---

## Шпаргалка

```
СТРУКТУРА SECURITY DESCRIPTOR
  Owner SID   - кто владелец (всегда может изменить DACL)
  Group SID   - основная группа (редко используется)
  DACL        - кто что МОЖЕТ делать
  SACL        - что АУДИРОВАТЬ (+ IL метки)

ТИПЫ ACE
  ACCESS_ALLOWED_ACE   - разрешить
  ACCESS_DENIED_ACE    - запретить (Deny)
  SYSTEM_AUDIT_ACE     - аудит (в SACL)
  SYSTEM_MANDATORY_LABEL_ACE - IL метка (в SACL)

ПОРЯДОК ОБРАБОТКИ DACL
  1. Явные Deny
  2. Явные Allow
  3. Унаследованные Deny
  4. Унаследованные Allow
  → первый Deny = стоп
  → Allow накапливается пока не набраны все запрошенные права

ФЛАГИ НАСЛЕДОВАНИЯ ACE
  OI  Object Inherit        - наследовать на файлы
  CI  Container Inherit     - наследовать на папки
  IO  Inherit Only          - только для наследования (сам объект - нет)
  NP  No Propagate          - не передавать флаги наследования глубже
  I   Inherited             - этот ACE унаследован (флаг при просмотре)

СТАНДАРТНЫЕ ПРАВА ФАЙЛОВ
  F   Full Control          - всё, включая WRITE_DAC и WRITE_OWNER
  M   Modify                - всё кроме смены прав и владельца
  RX  Read & Execute        - чтение + выполнение
  R   Read                  - только чтение
  W   Write                 - запись (без удаления!)
  D   Delete                - удаление

ИНСТРУМЕНТЫ
  icacls path               - просмотр/изменение прав (cmd)
  Get-Acl / Set-Acl         - PowerShell
  takeown /f path           - взять владение
  accesschk.exe             - аудит прав (Sysinternals)
  Get-Item -Stream *        - просмотр Alternate Data Streams
  dir /r                    - просмотр ADS в CMD

КЛЮЧЕВЫЕ КОМАНДЫ ICACLS
  icacls path /grant "user:(OI)(CI)F" /T    - дать Full Control рекурсивно
  icacls path /remove "user"                - убрать права
  icacls path /deny "user:(W)"              - Deny запись
  icacls path /inheritance:d                - заблокировать наследование
  icacls path /inheritance:e                - включить наследование
  icacls path /reset /T                     - сбросить к наследованию

EVENT IDS (АУДИТ)
  4663  - попытка доступа к объекту
  4656  - запрос дескриптора (с кодом ошибки)
  4660  - объект удалён
  4670  - права на объект изменены
  4907  - SACL изменён
  4672  - специальные привилегии при входе

ПРИВИЛЕГИИ СВЯЗАННЫЕ С ПРАВАМИ
  SeTakeOwnershipPrivilege  - взять любой объект
  SeBackupPrivilege         - читать файлы игнорируя DACL (через backup API)
  SeRestorePrivilege        - писать файлы игнорируя DACL
  SeSecurityPrivilege       - читать/изменять SACL
  SeCreateSymbolicLinkPrivilege - создавать символические ссылки
```

---

## Ссылки

- [File Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights) - официальная документация
- [Access Control Lists](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-lists) - модель ACL
- [Security Descriptor](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptors) - структура Security Descriptor
- [Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) - Integrity Levels
- [Well-known SIDs](https://learn.microsoft.com/en-us/windows/win32/secauthz/well-known-sids) - таблица известных SID
- [icacls documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) - справка по icacls
- [Accesschk](https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk) - Sysinternals accesschk
- [FileSystemRights Enum](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights) - PowerShell права
- [SDDL (Security Descriptor Definition Language)](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-definition-language) - текстовое представление SD
