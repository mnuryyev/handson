---
title: "Active Directory - ACL и права на объекты"
date: "2026-05-13"
---

Глубокое погружение в модель безопасности AD на уровне объектов. ACL (Access Control List) - это механизм, который определяет кто и что может делать с каждым объектом в Active Directory: пользователем, группой, OU, GPO, компьютером.

---

## Ключевые понятия

### Структура ACL

```
Объект AD (например, пользователь alice.smith)
└── Security Descriptor
    ├── Owner         - владелец объекта
    ├── DACL          - Discretionary ACL (кто что может делать)
    │   ├── ACE 1     - Allow: Domain Admins - Full Control
    │   ├── ACE 2     - Allow: HelpDesk - Reset Password
    │   └── ACE 3     - Deny:  Guest - Read
    └── SACL          - System ACL (аудит: кто что делал)
        ├── ACE 1     - Audit: Everyone - Write (Success, Failure)
        └── ACE 2     - Audit: Domain Admins - Full Control (Success)
```

```
Основные компоненты:

DACL (Discretionary ACL)
- Список ACE, которые разрешают или запрещают доступ
- Если DACL пустой - доступ запрещён для всех
- Если DACL отсутствует - полный доступ для всех (опасно!)

SACL (System ACL)
- Список ACE для аудита (логирования)
- Требует привилегию SeSecurityPrivilege для чтения/записи
- Записи попадают в Security Event Log (Event ID 4663 и др.)

ACE (Access Control Entry) - одна запись в ACL
- Principal   - кому (SID пользователя/группы)
- Type        - Allow / Deny
- Rights      - что разрешено/запрещено (битовая маска)
- Flags       - наследование
- Object Type - на какой тип объекта (для Object ACE)
```

### Типы прав доступа AD

```
# Стандартные права (Standard Access Rights):
# 0x00010000  DELETE           - удалить объект
# 0x00020000  READ_CONTROL     - читать DACL (нужно для любого чтения)
# 0x00040000  WRITE_DAC        - изменять DACL
# 0x00080000  WRITE_OWNER      - менять владельца
# 0x00100000  SYNCHRONIZE      - синхронизация (для файлов)
# 0x000F0000  STANDARD_DELETE_READ_WRITE_EXECUTE

# Специфичные права AD (Active Directory Rights):
# 0x00000001  DS-CREATE-CHILD  - создавать дочерние объекты
# 0x00000002  DS-DELETE-CHILD  - удалять дочерние объекты
# 0x00000004  ACTRL-DS-LIST    - просматривать дочерние объекты
# 0x00000008  DS-SELF          - запись самим собой (Self-write)
# 0x00000010  DS-READ-PROP     - читать атрибуты
# 0x00000020  DS-WRITE-PROP    - записывать атрибуты
# 0x00000040  DS-DELETE-TREE   - удалить дерево объектов
# 0x00000080  DS-LIST-OBJECT   - просматривать объект
# 0x00000100  DS-CONTROL-ACCESS - расширенные права (Extended Rights)

# Generic Rights (комбинации):
# GENERIC_READ    = READ_CONTROL + LIST + READ_PROP + LIST_OBJECT
# GENERIC_WRITE   = READ_CONTROL + SELF + WRITE_PROP
# GENERIC_EXECUTE = READ_CONTROL + LIST
# GENERIC_ALL     = CREATE + DELETE + READ + WRITE + EXEC + DELETE_TREE + CONTROL_ACCESS
```

### Extended Rights (расширенные права)

```
# Extended Rights - особые операции, не вписывающиеся в стандартные права
# Определяются GUID'ами в схеме AD

# Самые важные Extended Rights:

# User-Force-Change-Password  {00299570-246d-11d0-a768-00aa006e0529}
# - сбросить пароль без знания текущего
# - именно это делегируют HelpDesk

# User-Change-Password        {ab721a53-1e2f-11d0-9819-00aa0040529b}
# - сменить пароль зная текущий (пользователь сам себе)

# Receive-As                  {ab721a56-1e2f-11d0-9819-00aa0040529b}
# - читать почту как другой пользователь (Exchange)

# Send-As                     {ab721a54-1e2f-11d0-9819-00aa0040529b}
# - отправлять письма от имени другого пользователя

# DS-Replication-Get-Changes  {1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}
# - реплицировать изменения (нужно для DCSync атаки!)

# DS-Replication-Get-Changes-All {1131f6ad-9c07-11d1-f79f-00c04fc2dcd2}
# - реплицировать все изменения включая секреты

# Получить список всех Extended Rights из схемы
Get-ADObject -SearchBase "CN=Extended-Rights,CN=Configuration,DC=contoso,DC=com" `
    -Filter * -Properties DisplayName, RightsGuid |
    Select-Object DisplayName, RightsGuid | Sort-Object DisplayName
```

---

## Чтение ACL объектов AD

### Через PowerShell - Get-Acl

```
# ACL пользователя
$user = Get-ADUser -Identity "alice.smith"
$acl = Get-Acl "AD:$($user.DistinguishedName)"

# Все записи ACL
$acl.Access | Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType, IsInherited

# Только явно заданные (не унаследованные)
$acl.Access | Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType

# Только Allow записи
$acl.Access | Where-Object { $_.AccessControlType -eq "Allow" } |
    Format-Table IdentityReference, ActiveDirectoryRights -AutoSize

# Только Deny записи (опасно - проверяй!)
$acl.Access | Where-Object { $_.AccessControlType -eq "Deny" } |
    Format-Table IdentityReference, ActiveDirectoryRights -AutoSize
```

```
# ACL OU
$ou = Get-ADOrganizationalUnit -Identity "OU=IT,DC=contoso,DC=com"
$acl = Get-Acl "AD:$($ou.DistinguishedName)"
$acl.Access | Format-Table -AutoSize

# ACL Domain Root (самое интересное с точки зрения безопасности)
$domain = Get-ADDomain
$acl = Get-Acl "AD:$($domain.DistinguishedName)"

# Кто имеет права на репликацию (DCSync)?
$acl.Access | Where-Object {
    $_.ObjectType -eq "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2" -or
    $_.ObjectType -eq "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"
} | Select-Object IdentityReference, ActiveDirectoryRights

# ACL группы Domain Admins
$da = Get-ADGroup "Domain Admins"
$acl = Get-Acl "AD:$($da.DistinguishedName)"
$acl.Access | Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType
```

### Читабельный вывод прав

```
# Функция для расшифровки GUID объектных типов
function Get-ADRightName {
    param([string]$Guid)

    $guidMap = @{
        "00000000-0000-0000-0000-000000000000" = "All Objects"
        "00299570-246d-11d0-a768-00aa006e0529" = "User-Force-Change-Password"
        "ab721a53-1e2f-11d0-9819-00aa0040529b" = "User-Change-Password"
        "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2" = "DS-Replication-Get-Changes"
        "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2" = "DS-Replication-Get-Changes-All"
        "89e95b76-444d-4c62-991a-0facbeda640c" = "DS-Replication-Get-Changes-In-Filtered-Set"
        "bf9679c0-0de6-11d0-a285-00aa003049e2" = "Self-Membership (member attribute)"
        "72e39547-7b18-11d1-adef-00c04fd8d5cd" = "DNS-Host-Name-Attributes"
        "f3a64788-5306-11d1-a9c5-0000f80367c1" = "Validated-SPN"
    }

    if ($guidMap.ContainsKey($Guid)) { return $guidMap[$Guid] }
    else { return $Guid }
}

# Вывести ACL с расшифрованными именами
$dn = (Get-ADUser "alice.smith").DistinguishedName
(Get-Acl "AD:$dn").Access | ForEach-Object {
    [PSCustomObject]@{
        Principal    = $_.IdentityReference
        Type         = $_.AccessControlType
        Rights       = $_.ActiveDirectoryRights
        ObjectType   = Get-ADRightName $_.ObjectType.ToString()
        InheritedFrom = if ($_.IsInherited) { "Inherited" } else { "Explicit" }
    }
} | Format-Table -AutoSize
```

---

## Делегирование прав (Delegation)

### Что такое делегирование

```
Делегирование - назначение минимально необходимых прав
конкретной группе/пользователю на конкретные объекты.

Принцип минимальных привилегий:
- HelpDesk может сбрасывать пароли - но не читать атрибуты
- HR может создавать пользователей в OU=HR - но не в OU=IT
- Monitoring account может читать LastLogon - но не менять объекты

Лучше делегировать группе, а не пользователю напрямую!
```

### Delegation of Control Wizard (GUI)

```
Шаги в Active Directory Users and Computers (ADUC):
1. Правой кнопкой на OU или контейнер
2. "Delegate Control..."
3. Next
4. Add... - выбрать группу/пользователя
5. Next
6. Выбрать задачу:
   - "Reset user passwords and force password change at next logon"
   - "Read all user information"
   - "Create, delete, and manage user accounts"
   - "Modify the membership of a group"
   - "Manage Group Policy links"
   - "Create, delete and manage inetOrgPerson accounts"
   или "Create a custom task to delegate"
7. Finish
```

### Делегирование через PowerShell

```
# Вспомогательная функция добавления ACE
function Add-ADObjectACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName,
        [string]$Right,
        [string]$ObjectTypeGUID = "00000000-0000-0000-0000-000000000000",
        [string]$InheritedObjectTypeGUID = "00000000-0000-0000-0000-000000000000",
        [string]$AccessType = "Allow",
        [string]$Inheritance = "Descendents"
    )

    $principal = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity  = [System.Security.Principal.IdentityReference]$principal

    $adRight    = [System.DirectoryServices.ActiveDirectoryRights]$Right
    $type       = [System.Security.AccessControl.AccessControlType]$AccessType
    $objType    = [System.Guid]$ObjectTypeGUID
    $inhType    = [System.DirectoryServices.ActiveDirectorySecurityInheritance]$Inheritance
    $inhObjType = [System.Guid]$InheritedObjectTypeGUID

    $ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
        $identity, $adRight, $type, $objType, $inhType, $inhObjType
    )

    $acl = Get-Acl "AD:$TargetDN"
    $acl.AddAccessRule($ace)
    Set-Acl "AD:$TargetDN" $acl
    Write-Host "[+] ACE добавлен: $PrincipalName - $Right на $TargetDN"
}
```

```
# --- Сценарий 1: HelpDesk сбрасывает пароли ---
$ouDN    = "OU=Users,DC=contoso,DC=com"
$hdGroup = "CONTOSO\HelpDesk"

# Extended Right: User-Force-Change-Password
Add-ADObjectACE `
    -TargetDN $ouDN `
    -PrincipalName $hdGroup `
    -Right "ExtendedRight" `
    -ObjectTypeGUID "00299570-246d-11d0-a768-00aa006e0529" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
# bf967aba... = GUID класса User в схеме AD

# Extended Right: Read lockoutTime (для чтения статуса блокировки)
Add-ADObjectACE `
    -TargetDN $ouDN `
    -PrincipalName $hdGroup `
    -Right "ReadProperty" `
    -ObjectTypeGUID "28630ebf-41d5-11d1-a9c1-0000f80367c1" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
# 28630ebf... = lockoutTime attribute GUID
```

```
# --- Сценарий 2: HR создаёт/изменяет пользователей в своей OU ---
$hrOU    = "OU=HR,OU=Users,DC=contoso,DC=com"
$hrGroup = "CONTOSO\HR-Managers"

# Создавать объекты User в OU
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "CreateChild" `
    -ObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "All"

# Удалять объекты User
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "DeleteChild" `
    -ObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "All"

# Записывать все атрибуты пользователей
Add-ADObjectACE `
    -TargetDN $hrOU `
    -PrincipalName $hrGroup `
    -Right "WriteProperty" `
    -Inheritance "Descendents"
```

```
# --- Сценарий 3: Сервисный аккаунт читает атрибуты ---
$serviceDN = "CONTOSO\svc-monitoring"

# Только чтение всех свойств пользователей
Add-ADObjectACE `
    -TargetDN "DC=contoso,DC=com" `
    -PrincipalName $serviceDN `
    -Right "ReadProperty,ListChildren,ListObject" `
    -InheritedObjectTypeGUID "bf967aba-0de6-11d0-a285-00aa003049e2" `
    -Inheritance "Descendents"
```

### Удаление делегирования

```
function Remove-ADObjectACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName
    )

    $acl       = Get-Acl "AD:$TargetDN"
    $principal = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity  = [System.Security.Principal.IdentityReference]$principal

    $toRemove = $acl.Access | Where-Object {
        $_.IdentityReference -eq $identity -and
        $_.IsInherited -eq $false
    }

    foreach ($ace in $toRemove) {
        $acl.RemoveAccessRule($ace) | Out-Null
        Write-Host "[-] Удалён ACE: $PrincipalName из $TargetDN"
    }
    Set-Acl "AD:$TargetDN" $acl
}

# Пример использования
Remove-ADObjectACE `
    -TargetDN "OU=Users,DC=contoso,DC=com" `
    -PrincipalName "CONTOSO\OldHelpDesk"
```

---

## Наследование ACL

### Как работает наследование

```
Иерархия объектов AD:
DC=contoso,DC=com             [ACL применяется ко всем дочерним]
└── OU=Users
    ├── OU=IT
    │   ├── alice.smith       [наследует от OU=IT и OU=Users и DC=...]
    │   └── bob.jones
    └── OU=HR
        └── carol.white       [наследует от OU=HR и OU=Users и DC=...]

Флаги наследования ACE:
- None            - только этот объект
- All             - этот объект и все дочерние
- Descendents     - только дочерние (не сам объект)
- SelfAndChildren - сам объект и прямые дочерние
- Children        - только прямые дочерние
```

```
# Проверить наследование объекта
$dn = (Get-ADUser "alice.smith").DistinguishedName
$acl = Get-Acl "AD:$dn"

# Все унаследованные права
$acl.Access | Where-Object { $_.IsInherited -eq $true } |
    Select-Object IdentityReference, ActiveDirectoryRights, IsInherited |
    Group-Object IdentityReference |
    Select-Object Name, Count

# Сколько явных vs унаследованных
$acl.Access | Group-Object IsInherited |
    Select-Object @{N="Type"; E={if ($_.Name -eq "True") {"Inherited"} else {"Explicit"}}}, Count
```

### Блокировка наследования

```
# Отключить наследование для объекта (копируя или удаляя унаследованные ACE)

$dn  = (Get-ADUser "alice.smith").DistinguishedName
$acl = Get-Acl "AD:$dn"

# $true - сохранить копии унаследованных ACE как явные
# $false - удалить унаследованные ACE (объект остаётся без защиты!)
$acl.SetAccessRuleProtection($true, $true)

Set-Acl "AD:$dn" $acl
Write-Host "Наследование отключено, существующие ACE скопированы"

# Включить наследование обратно
$acl.SetAccessRuleProtection($false, $true)
Set-Acl "AD:$dn" $acl
```

---

## Аудит через SACL

### Настройка аудита объектов AD

```
# Шаг 1: Включить аудит доступа к объектам AD через GPO
# Computer Configuration → Windows Settings → Security Settings →
# Advanced Audit Policy Configuration → DS Access:
# - Audit Directory Service Access  - Success, Failure
# - Audit Directory Service Changes - Success

# Через PowerShell (auditpol)
auditpol /set /subcategory:"Directory Service Access" /success:enable /failure:enable
auditpol /set /subcategory:"Directory Service Changes" /success:enable /failure:enable
auditpol /get /subcategory:"Directory Service Access"
```

```
# Шаг 2: Настроить SACL на объекте

function Add-ADAuditACE {
    param(
        [string]$TargetDN,
        [string]$PrincipalName = "Everyone",
        [string]$Right = "WriteProperty",
        [string]$AuditFlags = "Success,Failure"
    )

    $principal  = New-Object System.Security.Principal.NTAccount($PrincipalName)
    $identity   = [System.Security.Principal.IdentityReference]$principal
    $adRight    = [System.DirectoryServices.ActiveDirectoryRights]$Right
    $auditFlag  = [System.Security.AccessControl.AuditFlags]$AuditFlags
    $inheritance = [System.DirectoryServices.ActiveDirectorySecurityInheritance]"All"

    $ace = New-Object System.DirectoryServices.ActiveDirectoryAuditRule(
        $identity, $adRight, $auditFlag, $inheritance
    )

    $acl = Get-Acl "AD:$TargetDN"
    $acl.AddAuditRule($ace)
    Set-Acl "AD:$TargetDN" $acl
    Write-Host "[+] SACL добавлен: аудит $Right для $PrincipalName на $TargetDN"
}

# Аудировать изменения атрибутов всех пользователей в OU=IT
Add-ADAuditACE `
    -TargetDN "OU=IT,OU=Users,DC=contoso,DC=com" `
    -PrincipalName "Everyone" `
    -Right "WriteProperty" `
    -AuditFlags "Success,Failure"

# Аудировать удаление объектов
Add-ADAuditACE `
    -TargetDN "DC=contoso,DC=com" `
    -PrincipalName "Everyone" `
    -Right "DeleteTree,Delete" `
    -AuditFlags "Success,Failure"
```

### Анализ событий аудита

```
# Event IDs в Security Log (на DC):
# 4662 - операция над объектом AD (чтение/запись через SACL)
# 4663 - попытка доступа к объекту
# 4741 - создан объект Computer
# 4742 - изменён объект Computer
# 4743 - удалён объект Computer
# 4720 - создан объект User
# 4722 - включена учётная запись
# 4723 - попытка изменить пароль
# 4724 - попытка сбросить пароль
# 4725 - учётная запись отключена
# 4726 - удалён объект User
# 4727 - создана Security Group
# 4730 - удалена Security Group
# 4731 - создана Security Group (local)
# 4732 - добавлен пользователь в группу
# 4733 - удалён пользователь из группы

# Читать события через PowerShell
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(4720, 4724, 4732, 4726)
    StartTime = (Get-Date).AddHours(-24)
} | Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Только изменения паролей за последний час
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = 4723, 4724
    StartTime = (Get-Date).AddHours(-1)
} | ForEach-Object {
    $xml = [xml]$_.ToXml()
    [PSCustomObject]@{
        Time      = $_.TimeCreated
        SubjectUser = $xml.Event.EventData.Data | Where-Object Name -eq "SubjectUserName" | Select-Object -Expand "#text"
        TargetUser  = $xml.Event.EventData.Data | Where-Object Name -eq "TargetUserName"  | Select-Object -Expand "#text"
        EventId     = $_.Id
    }
}
```

---

## Инструменты для анализа ACL

### ADACLScanner (встроенных инструментов мало)

```
# Нативные инструменты

# 1. dsacls.exe - классика, встроена в Windows
dsacls "OU=IT,DC=contoso,DC=com"                      # показать ACL
dsacls "OU=IT,DC=contoso,DC=com" /I:T                 # включая дочерние
dsacls "CN=alice.smith,OU=IT,DC=contoso,DC=com"       # конкретный объект

# Добавить право через dsacls
dsacls "OU=HR,DC=contoso,DC=com" /G "CONTOSO\HelpDesk:CA;Reset Password;user"
# G = Grant, CA = Control Access (Extended Right), user = класс объекта

# Удалить право
dsacls "OU=HR,DC=contoso,DC=com" /R "CONTOSO\OldGroup"

# Сбросить к умолчаниям (осторожно!)
dsacls "OU=Test,DC=contoso,DC=com" /S /T

# 2. Ldp.exe - встроена в RSAT
# Просматривает Security Descriptor в графическом интерфейсе
# Удобна для изучения отдельных объектов
```

```
# Через ADSI (COM-объекты) - без модуля ActiveDirectory
$entry = [ADSI]"LDAP://CN=alice.smith,OU=IT,DC=contoso,DC=com"
$sd    = $entry.psbase.ObjectSecurity

$sd.Access | Select-Object IdentityReference, ActiveDirectoryRights,
    AccessControlType, IsInherited | Format-Table -AutoSize

# Получить владельца
$sd.Owner
```

### Массовая проверка ACL в домене

```
# Найти все объекты с нестандартными (явными) ACE
function Find-CustomACEs {
    param(
        [string]$SearchBase = (Get-ADDomain).DistinguishedName,
        [string]$ExcludeIdentity = "BUILTIN|NT AUTHORITY|S-1-5-"
    )

    $results = @()
    Get-ADObject -Filter * -SearchBase $SearchBase -Properties * |
        ForEach-Object {
            $dn  = $_.DistinguishedName
            try {
                $acl = Get-Acl "AD:$dn" -ErrorAction Stop
                $explicit = $acl.Access | Where-Object {
                    $_.IsInherited -eq $false -and
                    $_.IdentityReference.Value -notmatch $ExcludeIdentity
                }
                if ($explicit) {
                    foreach ($ace in $explicit) {
                        $results += [PSCustomObject]@{
                            ObjectDN   = $dn
                            Principal  = $ace.IdentityReference
                            Rights     = $ace.ActiveDirectoryRights
                            Type       = $ace.AccessControlType
                        }
                    }
                }
            } catch {}
        }
    return $results
}

# Запустить на OU=IT
$customACEs = Find-CustomACEs -SearchBase "OU=IT,DC=contoso,DC=com"
$customACEs | Format-Table -AutoSize

# Экспорт в CSV
$customACEs | Export-Csv "C:\acl-audit.csv" -NoTypeInformation
```

---

## Опасные права с точки зрения безопасности

### WriteDACL и WriteOwner

```
# WriteDACL - может полностью изменить ACL объекта
# WriteOwner - может стать владельцем (владелец имеет WriteDACL)

# Это критически опасные права!
# Атакующий с WriteDACL может добавить себе полный доступ

# Пример атаки:
# 1. Атакующий имеет WriteDACL на Domain Object
# 2. Добавляет себе DS-Replication-Get-Changes-All
# 3. Выполняет DCSync - получает хеши всех паролей

# Поиск кто имеет WriteDACL на Domain Object
$domainDN = (Get-ADDomain).DistinguishedName
(Get-Acl "AD:$domainDN").Access |
    Where-Object {
        $_.ActiveDirectoryRights -match "WriteDacl|GenericAll|GenericWrite" -and
        $_.AccessControlType -eq "Allow" -and
        $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators"
    } |
    Select-Object IdentityReference, ActiveDirectoryRights
```

### GenericAll и GenericWrite

```
# GenericAll - полный контроль над объектом
# GenericWrite - запись любых атрибутов

# Если атакующий имеет GenericWrite на пользователя:
# - Может установить SPN и сделать Kerberoasting
# - Может изменить скрипт входа (scriptPath)
# - Может добавить в группу через member атрибут

# Если GenericAll на группу:
# - Может добавить себя в группу (включая Domain Admins!)

# Поиск аномальных GenericAll/GenericWrite прав
function Find-DangerousACEs {
    param([string]$SearchBase = (Get-ADDomain).DistinguishedName)

    $dangerousRights = "GenericAll|GenericWrite|WriteDacl|WriteOwner"
    $trustedPrincipals = "Domain Admins|Enterprise Admins|BUILTIN\\Administrators|NT AUTHORITY|S-1-5-18|S-1-5-32"

    Get-ADObject -Filter * -SearchBase $SearchBase |
        ForEach-Object {
            $dn = $_.DistinguishedName
            try {
                (Get-Acl "AD:$dn").Access |
                    Where-Object {
                        $_.ActiveDirectoryRights -match $dangerousRights -and
                        $_.AccessControlType -eq "Allow" -and
                        $_.IdentityReference.Value -notmatch $trustedPrincipals -and
                        $_.IsInherited -eq $false
                    } |
                    ForEach-Object {
                        [PSCustomObject]@{
                            Object    = $dn
                            Principal = $_.IdentityReference
                            Rights    = $_.ActiveDirectoryRights
                            Warning   = "POTENTIAL PRIVILEGE ESCALATION"
                        }
                    }
            } catch {}
        }
}

$dangerous = Find-DangerousACEs
if ($dangerous) {
    Write-Warning "Найдены потенциально опасные ACE!"
    $dangerous | Format-Table -AutoSize
} else {
    Write-Host "Опасных ACE не найдено" -ForegroundColor Green
}
```

### DCSync права

```
# DCSync - атака, при которой злоумышленник запрашивает репликацию паролей
# Требует два Extended Rights на объект домена:
# - DS-Replication-Get-Changes      {1131f6aa-...}
# - DS-Replication-Get-Changes-All  {1131f6ad-...}

# По умолчанию эти права есть только у:
# - Domain Controllers
# - Domain Admins
# - Enterprise Admins

# Проверка кто имеет права репликации
$domainDN = (Get-ADDomain).DistinguishedName
$replicationGuids = @(
    "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2",  # Get-Changes
    "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2",  # Get-Changes-All
    "89e95b76-444d-4c62-991a-0facbeda640c"   # Get-Changes-In-Filtered-Set
)

(Get-Acl "AD:$domainDN").Access |
    Where-Object {
        $_.ObjectType.Guid -in $replicationGuids -and
        $_.AccessControlType -eq "Allow"
    } |
    Select-Object IdentityReference, @{N="ExtRight"; E={$_.ObjectType.Guid}} |
    Format-Table -AutoSize

# Если в списке есть что-то кроме DC/DomainAdmins/EnterpriseAdmins - это ИНЦИДЕНТ
```

---

## Права на AdminSDHolder

### Что такое AdminSDHolder

```
AdminSDHolder - специальный объект:
CN=AdminSDHolder,CN=System,DC=contoso,DC=com

Каждые 60 минут SDProp (Security Descriptor Propagator) процесс
копирует ACL AdminSDHolder на все защищённые объекты:

Защищённые группы (AdminCount=1):
- Domain Admins
- Enterprise Admins
- Schema Admins
- Administrators
- Account Operators
- Backup Operators
- Print Operators
- Server Operators
- Replicator
- KRBTGT
- и их члены (атрибут adminCount=1)

Смысл: даже если кто-то изменит ACL на Domain Admin пользователе,
через 60 минут права будут восстановлены из AdminSDHolder.
```

```
# Просмотреть ACL AdminSDHolder
$adminSDHolder = "CN=AdminSDHolder,CN=System,DC=contoso,DC=com"
(Get-Acl "AD:$adminSDHolder").Access |
    Where-Object { $_.IsInherited -eq $false } |
    Select-Object IdentityReference, ActiveDirectoryRights, AccessControlType |
    Format-Table -AutoSize

# ВАЖНО: Backdoor через AdminSDHolder
# Атакующий с правами на AdminSDHolder добавляет себя туда
# Через 60 минут этот доступ распространится на всех Domain Admins!

# Проверить нестандартные записи в AdminSDHolder
(Get-Acl "AD:$adminSDHolder").Access |
    Where-Object {
        $_.IsInherited -eq $false -and
        $_.IdentityReference.Value -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators|SELF"
    } |
    Select-Object IdentityReference, ActiveDirectoryRights
```

---

## Практические сценарии

### Аудит делегирования перед пентестом / security review

```
# Полный аудит нестандартных ACL в домене
# Экспортировать в HTML для отчёта

$reportPath = "C:\AD-ACL-Audit-$(Get-Date -Format 'yyyyMMdd').html"

$allACEs = @()
$searchBases = @(
    (Get-ADDomain).DistinguishedName,
    "CN=AdminSDHolder,CN=System,$((Get-ADDomain).DistinguishedName)"
)

foreach ($base in $searchBases) {
    Get-ADObject -Filter * -SearchBase $base -SearchScope SubTree |
        ForEach-Object {
            $dn = $_.DistinguishedName
            try {
                (Get-Acl "AD:$dn").Access |
                    Where-Object {
                        $_.IsInherited -eq $false -and
                        $_.IdentityReference.Value -notmatch "BUILTIN|NT AUTHORITY|Domain Admins|Enterprise Admins|S-1-5-18"
                    } |
                    ForEach-Object {
                        $allACEs += [PSCustomObject]@{
                            Object      = $dn
                            Principal   = $_.IdentityReference
                            Rights      = $_.ActiveDirectoryRights
                            Type        = $_.AccessControlType
                            Inherited   = $_.IsInherited
                            ObjectType  = $_.ObjectType.Guid
                        }
                    }
            } catch {}
        }
}

$allACEs | Export-Csv "C:\acl-audit.csv" -NoTypeInformation
Write-Host "Найдено $($allACEs.Count) нестандартных ACE. Экспортировано в C:\acl-audit.csv"
```

### Восстановление ACL к умолчаниям

```
# Сбросить ACL объекта к унаследованному состоянию

function Reset-ADObjectACL {
    param([string]$DistinguishedName)

    $acl = Get-Acl "AD:$DistinguishedName"

    # Удалить все явные ACE
    $explicit = $acl.Access | Where-Object { $_.IsInherited -eq $false }
    foreach ($ace in $explicit) {
        $acl.RemoveAccessRule($ace) | Out-Null
    }

    # Включить наследование
    $acl.SetAccessRuleProtection($false, $false)
    Set-Acl "AD:$DistinguishedName" $acl

    Write-Host "[+] ACL сброшен к унаследованному состоянию: $DistinguishedName"
}

# Использование
Reset-ADObjectACL -DistinguishedName "CN=alice.smith,OU=IT,DC=contoso,DC=com"

# Осторожно! Сброс ACL на OU может нарушить делегирование.
# Всегда делай бэкап перед изменением:
(Get-Acl "AD:$dn").Access | Export-Csv "C:\backup-acl-$(Get-Date -Format 'yyyyMMdd-HHmm').csv"
```

---

## Шпаргалка

```
# Чтение ACL
$dn = (Get-ADUser "alice").DistinguishedName
(Get-Acl "AD:$dn").Access | Format-Table -AutoSize

# Только явные (не унаследованные)
(Get-Acl "AD:$dn").Access | Where-Object { $_.IsInherited -eq $false }

# Поиск опасных прав
(Get-Acl "AD:$dn").Access | Where-Object {
    $_.ActiveDirectoryRights -match "GenericAll|WriteDacl|WriteOwner"
}

# ACL Domain Root
$domain = (Get-ADDomain).DistinguishedName
(Get-Acl "AD:$domain").Access | Format-Table -AutoSize

# DCSync права на домене
(Get-Acl "AD:$domain").Access | Where-Object {
    $_.ObjectType.Guid -in @(
        "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2",
        "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"
    )
}

# dsacls - показать ACL через командную строку
dsacls "OU=IT,DC=contoso,DC=com"
dsacls "CN=alice.smith,OU=IT,DC=contoso,DC=com"

# Делегировать сброс пароля (Extended Right через dsacls)
dsacls "OU=Users,DC=contoso,DC=com" /G "CONTOSO\HelpDesk:CA;Reset Password;user"

# Включить аудит объектов
auditpol /set /subcategory:"Directory Service Changes" /success:enable /failure:enable

# Принудительное обновление SACL (SDProp)
# Реестровый ключ для немедленного запуска SDProp:
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "RunProtectAdminGroupsTask" -Value 1

# Читать события изменений объектов AD
Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4720,4724,4732,4726} |
    Select-Object TimeCreated, Id, Message
```

---

## Ссылки

- [Understanding AD ACL](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-descriptors) - официальная документация
- [Delegate Administration](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/delegating-administration-by-using-ou-objects) - делегирование через OU
- [Active Directory Rights](https://learn.microsoft.com/en-us/dotnet/api/system.directoryservices.activedirectoryrights) - справочник прав
- [AdminSDHolder](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/appendix-c--protected-accounts-and-groups-in-active-directory) - защищённые объекты
- [DCSync Attack](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse/dump-password-hashes-from-domain-controller-with-dcsync) - теория атаки (ired.team)
- [BloodHound](https://github.com/BloodHoundAD/BloodHound) - визуализация путей ACL-атак
