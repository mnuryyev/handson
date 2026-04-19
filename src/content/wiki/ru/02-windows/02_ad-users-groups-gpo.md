---
title: "Active Directory - пользователи, группы, GPO"
date: "2026-04-19"
---

Продолжение темы Active Directory. Углублённо про управление пользователями и группами, стратегии вложенности, а также Group Policy Objects - главный инструмент централизованного управления настройками Windows.

---

## Управление пользователями

### Атрибуты объекта User

```powershell
# Получить все атрибуты пользователя
Get-ADUser -Identity "alice.smith" -Properties *

# Ключевые атрибуты:
# sAMAccountName      - логин (до 20 символов, обратная совместимость)
# UserPrincipalName   - UPN (alice@contoso.com), используется для входа
# DistinguishedName   - полный путь в AD (CN=Alice Smith,OU=IT,DC=contoso,DC=com)
# SID                 - уникальный идентификатор безопасности
# ObjectGUID          - глобальный уникальный идентификатор
# memberOf            - список групп
# pwdLastSet          - время последней смены пароля (Unix timestamp)
# badPwdCount         - количество неудачных попыток входа
# lastLogon           - последний вход (только на конкретном DC!)
# lastLogonTimestamp  - реплицируется между DC (точность ~14 дней)
# userAccountControl  - флаги учётной записи
```

### userAccountControl - флаги учётной записи

```powershell
# userAccountControl - битовое поле со множеством флагов

# Основные значения:
# 0x0002   (2)     - ACCOUNTDISABLE      - аккаунт отключён
# 0x0010   (16)    - LOCKOUT             - аккаунт заблокирован
# 0x0020   (32)    - PASSWD_NOTREQD      - пароль не требуется
# 0x0040   (64)    - PASSWD_CANT_CHANGE  - нельзя менять пароль
# 0x0200   (512)   - NORMAL_ACCOUNT      - обычный пользователь
# 0x0800   (2048)  - INTERDOMAIN_TRUST_ACCOUNT - доверие домена
# 0x1000   (4096)  - WORKSTATION_TRUST   - учётная запись компьютера
# 0x10000  (65536) - DONT_EXPIRE_PASSWD  - пароль не истекает
# 0x40000  (262144) - SMARTCARD_REQUIRED - требуется smartcard

# Обычный активный пользователь = 512 (0x0200)
# Отключённый пользователь = 514 (512 + 2)
# Активный с не истекающим паролем = 66048 (65536 + 512)

# Проверить флаги через PowerShell
Get-ADUser alice -Properties userAccountControl |
    Select-Object Name, userAccountControl,
    @{N="Disabled"; E={[bool]($_.userAccountControl -band 2)}},
    @{N="PasswordNeverExpires"; E={[bool]($_.userAccountControl -band 65536)}},
    @{N="LockedOut"; E={$_.LockedOut}}
```

### CRUD операции с пользователями

```powershell
# ─── CREATE ───
New-ADUser `
    -Name "Alice Smith" `
    -GivenName "Alice" `
    -Surname "Smith" `
    -SamAccountName "alice.smith" `
    -UserPrincipalName "alice.smith@contoso.com" `
    -Path "OU=IT,OU=Users,DC=contoso,DC=com" `
    -Department "Information Technology" `
    -Title "System Administrator" `
    -Company "Contoso" `
    -Office "Moscow" `
    -OfficePhone "+7-495-000-0001" `
    -EmailAddress "alice.smith@contoso.com" `
    -Manager "CN=Bob Jones,OU=IT,OU=Users,DC=contoso,DC=com" `
    -AccountPassword (ConvertTo-SecureString "TempP@ss123!" -AsPlainText -Force) `
    -Enabled $true `
    -ChangePasswordAtLogon $true `
    -Description "IT System Administrator"

# ─── READ ───
# Один пользователь
Get-ADUser -Identity "alice.smith"
Get-ADUser -Identity "alice.smith" -Properties Department, Title, Manager, MemberOf

# Поиск по фильтру
Get-ADUser -Filter {Department -eq "IT"} -Properties Title, EmailAddress
Get-ADUser -Filter {Enabled -eq $true -and PasswordNeverExpires -eq $true}
Get-ADUser -Filter {LastLogonDate -lt (Get-Date).AddDays(-90) -and Enabled -eq $true} `
    -Properties LastLogonDate

# LDAP фильтр (быстрее для больших доменов)
Get-ADUser -LDAPFilter "(&(objectClass=user)(department=IT)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
# Только активные пользователи из IT

# ─── UPDATE ───
Set-ADUser -Identity "alice.smith" `
    -Title "Senior System Administrator" `
    -Department "IT Operations" `
    -Office "Saint-Petersburg"

# Изменить несколько пользователей сразу
Get-ADUser -Filter {Department -eq "IT"} | Set-ADUser -Description "IT Department Staff"

# Добавить кастомный атрибут
Set-ADUser -Identity "alice.smith" -Add @{extensionAttribute1 = "EMP-001"}
Set-ADUser -Identity "alice.smith" -Replace @{extensionAttribute1 = "EMP-002"}
Set-ADUser -Identity "alice.smith" -Clear extensionAttribute1

# ─── DELETE ───
Remove-ADUser -Identity "alice.smith" -Confirm:$false

# Безопасное удаление - сначала отключить
Disable-ADAccount -Identity "alice.smith"
Move-ADObject -Identity "CN=Alice Smith,OU=IT,OU=Users,DC=contoso,DC=com" `
    -TargetPath "OU=Disabled,DC=contoso,DC=com"
# Через 30 дней:
Remove-ADUser -Identity "CN=Alice Smith,OU=Disabled,DC=contoso,DC=com"
```

### Управление паролями

```powershell
# Сбросить пароль
$newPassword = Read-Host -AsSecureString "New password"
Set-ADAccountPassword -Identity "alice.smith" -NewPassword $newPassword -Reset

# Сброс без интерактивного ввода (для скриптов)
Set-ADAccountPassword -Identity "alice.smith" `
    -NewPassword (ConvertTo-SecureString "NewP@ss123!" -AsPlainText -Force) `
    -Reset

# Принудить смену пароля при следующем входе
Set-ADUser -Identity "alice.smith" -ChangePasswordAtLogon $true

# Разблокировать аккаунт
Unlock-ADAccount -Identity "alice.smith"

# Массовый сброс — все пользователи конкретной OU
Get-ADUser -Filter * -SearchBase "OU=Contractors,DC=contoso,DC=com" |
    Set-ADAccountPassword -NewPassword (ConvertTo-SecureString "Temp@12345" -AsPlainText -Force) -Reset |
    Set-ADUser -ChangePasswordAtLogon $true

# Показать дату истечения пароля
Get-ADUser -Identity "alice.smith" -Properties PasswordLastSet, PasswordExpired, PasswordNeverExpires |
    Select-Object Name, PasswordLastSet, PasswordExpired, PasswordNeverExpires
```

### Политики паролей (Fine-Grained Password Policy)

```powershell
# Стандартная политика паролей домена задаётся в Default Domain Policy GPO
# Fine-Grained Password Policy (FGPP) - разные политики для разных групп

# Создать политику для администраторов (строже)
New-ADFineGrainedPasswordPolicy `
    -Name "AdminPasswordPolicy" `
    -Precedence 10 `
    -MinPasswordLength 16 `
    -PasswordHistoryCount 24 `
    -MaxPasswordAge "60.00:00:00" `
    -MinPasswordAge "1.00:00:00" `
    -ComplexityEnabled $true `
    -ReversibleEncryptionEnabled $false `
    -LockoutThreshold 3 `
    -LockoutDuration "00:30:00" `
    -LockoutObservationWindow "00:30:00" `
    -ProtectedFromAccidentalDeletion $true

# Назначить политику группе
Add-ADFineGrainedPasswordPolicySubject -Identity "AdminPasswordPolicy" -Subjects "Domain Admins"
Add-ADFineGrainedPasswordPolicySubject -Identity "AdminPasswordPolicy" -Subjects "alice.smith"

# Просмотреть политику для пользователя
Get-ADUserResultantPasswordPolicy -Identity "alice.smith"

# Список всех FGPP
Get-ADFineGrainedPasswordPolicy -Filter *
```

---

## Управление группами

### Типы и области групп

```
Типы групп:
┌────────────────┬──────────────────────────────────────────────────────┐
│ Security       │ Назначение прав доступа, членство в токене Kerberos  │
│ Distribution   │ Только для email рассылок (Exchange/365)             │
└────────────────┴──────────────────────────────────────────────────────┘

Области (Scope):
┌────────────────┬──────────┬────────────────────────────────────────────┐
│ Domain Local   │ DL       │ Члены: любой домен леса + внешние          │
│                │          │ Права: только в своём домене               │
│                │          │ Назначение: ресурсы (файлы, принтеры)      │
├────────────────┼──────────┼────────────────────────────────────────────┤
│ Global         │ G        │ Члены: только свой домен                   │
│                │          │ Права: любой домен леса                    │
│                │          │ Назначение: группировка пользователей      │
├────────────────┼──────────┼────────────────────────────────────────────┤
│ Universal      │ U        │ Члены: любой домен леса                    │
│                │          │ Права: любой домен леса                    │
│                │          │ Хранится в Global Catalog                  │
│                │          │ Назначение: кросс-доменные ресурсы         │
└────────────────┴──────────┴────────────────────────────────────────────┘
```

### Стратегия A-G-DL-P

Рекомендуемая Microsoft модель вложенности групп:

```
A  → Accounts (пользователи)
G  → Global Groups (по должности/подразделению)
DL → Domain Local Groups (по ресурсу)
P  → Permissions (права доступа)

Пример: доступ к файловому серверу

[alice] [bob]              ← Accounts
    ↓
[G-IT-Admins]              ← Global Group (все IT-администраторы)
    ↓
[DL-FileServer1-ReadWrite] ← Domain Local Group (доступ к этому ресурсу)
    ↓
[NTFS права на \\FS1\IT\]  ← Permissions

Преимущества:
- Добавить нового IT-admin → только добавить в G-IT-Admins
- Изменить права на сервер → только изменить DL группу
- G-группы можно использовать в нескольких DL-группах
```

### CRUD операции с группами

```powershell
# ─── CREATE ───
New-ADGroup `
    -Name "G-IT-Admins" `
    -SamAccountName "G-IT-Admins" `
    -GroupCategory Security `
    -GroupScope Global `
    -Path "OU=Groups,OU=IT,DC=contoso,DC=com" `
    -Description "IT Administrators"

# ─── ADD MEMBERS ───
# Один пользователь
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"

# Несколько пользователей
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith","bob.jones","carol.white"

# Все пользователи из OU
Get-ADUser -Filter * -SearchBase "OU=IT,OU=Users,DC=contoso,DC=com" |
    ForEach-Object { Add-ADGroupMember -Identity "G-IT-Admins" -Members $_ }

# Вложенная группа (группа в группу)
Add-ADGroupMember -Identity "DL-FileServer-IT" -Members "G-IT-Admins"

# ─── READ ───
# Все члены группы
Get-ADGroupMember -Identity "G-IT-Admins"
Get-ADGroupMember -Identity "G-IT-Admins" -Recursive  # включая вложенные группы

# Группы пользователя
Get-ADUser -Identity "alice.smith" -Properties MemberOf | Select-Object -ExpandProperty MemberOf
(Get-ADUser "alice.smith" -Properties MemberOf).MemberOf | Get-ADGroup | Select-Object Name, GroupScope

# Эффективное членство (включая nested)
Get-ADPrincipalGroupMembership -Identity "alice.smith" | Select-Object Name, GroupScope, GroupCategory

# ─── REMOVE MEMBER ───
Remove-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith" -Confirm:$false

# ─── DELETE GROUP ───
Remove-ADGroup -Identity "G-IT-Admins" -Confirm:$false
```

### Встроенные группы безопасности AD

```powershell
# Критичные встроенные группы:

# Domain Admins - полный контроль над доменом
# Не добавляй сюда обычных администраторов!
Get-ADGroupMember "Domain Admins"

# Enterprise Admins - полный контроль над лесом (только в Forest Root)
Get-ADGroupMember "Enterprise Admins"

# Schema Admins - могут изменять схему (только для особых случаев)
Get-ADGroupMember "Schema Admins"

# Administrators - локальные администраторы на DC
# Domain Users — все пользователи домена (автоматически)
# Computers — все компьютеры домена (автоматически)

# Проверить кто в привилегированных группах
foreach ($group in @("Domain Admins","Enterprise Admins","Schema Admins","Administrators")) {
    Write-Host "=== $group ===" -ForegroundColor Yellow
    Get-ADGroupMember $group -Recursive | Select-Object Name, ObjectClass
}
```

---

## Group Policy Objects (GPO)

GPO - механизм централизованного управления настройками Windows компьютеров и пользователей в домене.

### Что можно контролировать через GPO

```
Computer Configuration:
├── Software Settings        - установка ПО
├── Windows Settings
│   ├── Scripts             - скрипты запуска/выключения
│   ├── Security Settings   - парольная политика, аудит, права
│   │   ├── Account Policies - пароли, блокировки
│   │   ├── Local Policies  - аудит, привилегии, права
│   │   ├── Windows Firewall - правила брандмауэра
│   │   └── AppLocker       - контроль приложений
│   └── QoS Policy          - приоритизация трафика
└── Administrative Templates - тысячи настроек реестра
    ├── Windows Components  - IE, Edge, BitLocker, и т.д.
    ├── System              - входы, групповые политики
    └── Network             - DNS, offline files, и т.д.

User Configuration:
├── Software Settings        - установка ПО для пользователя
├── Windows Settings
│   ├── Scripts             - скрипты входа/выхода
│   ├── Folder Redirection  - перенаправление папок
│   └── Internet Explorer Maintenance
└── Administrative Templates - настройки для пользователя
    ├── Desktop             - обои, иконки
    ├── Start Menu          - настройки меню
    └── Control Panel       - ограничения панели управления
```

### Структура применения GPO

```
GPO применяются в следующем порядке (LSDOU):
1. Local Policy        - локальная политика компьютера
2. Site Policy         - политики сайта AD
3. Domain Policy       - политики домена
4. OU Policy           - политики OU (от родительских к дочерним)

Последняя применённая политика побеждает (если нет Block/Enforce).

Исключения:
- No Override (Enforced) - политика не может быть переопределена дочерними
- Block Inheritance - OU игнорирует политики родительских контейнеров
```

### Управление GPO через PowerShell (GPMC)

```powershell
# Установить модуль RSAT
Install-WindowsFeature -Name RSAT-Group-Policy
Import-Module GroupPolicy

# ─── CREATE ───
New-GPO -Name "IT Security Policy" -Comment "Политика безопасности для IT"

# ─── LINK (привязать к OU) ───
New-GPLink `
    -Name "IT Security Policy" `
    -Target "OU=IT,DC=contoso,DC=com" `
    -LinkEnabled Yes `
    -Enforced No `
    -Order 1                     # приоритет (1 = наивысший)

# ─── LIST ───
Get-GPO -All                     # все GPO
Get-GPO -Name "IT Security Policy"
Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com"  # наследование для OU
Get-GPLink -Name "IT Security Policy"                # где привязано

# Все GPO привязанные к конкретной OU
(Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com").GpoLinks

# ─── MODIFY ───
# Включить/отключить GPO
Set-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com" -LinkEnabled No
Set-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com" -Enforced Yes

# ─── BACKUP / RESTORE ───
Backup-GPO -Name "IT Security Policy" -Path "C:\GPOBackups"
Backup-GPO -All -Path "C:\GPOBackups"                # все GPO

Restore-GPO -Name "IT Security Policy" -Path "C:\GPOBackups"

# ─── DELETE ───
Remove-GPO -Name "Old Security Policy"
Remove-GPLink -Name "IT Security Policy" -Target "OU=IT,DC=contoso,DC=com"  # только отвязать
```

### Настройка параметров GPO через PowerShell

```powershell
# Set-GPRegistryValue - настройка через реестр

# Отключить USB накопители
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" `
    -ValueName "Start" `
    -Type DWord `
    -Value 4              # 4 = disabled, 3 = enabled

# Установить обои рабочего стола (User Configuration)
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" `
    -ValueName "Wallpaper" `
    -Type String `
    -Value "\\server\netlogon\wallpaper.jpg"

Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" `
    -ValueName "WallpaperStyle" `
    -Type String `
    -Value "2"           # 2 = stretched

# Отключить диспетчер задач
Set-GPRegistryValue `
    -Name "IT Security Policy" `
    -Key "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" `
    -ValueName "DisableTaskMgr" `
    -Type DWord `
    -Value 1

# Параметры паролей
Set-GPInheritance -Target "OU=IT,DC=contoso,DC=com" -IsBlocked No
```

### Политика паролей через GPO

```powershell
# Редактировать Default Domain Policy (основная политика паролей)
# Только через GPMC GUI или через Set-GPRegistryValue / ADMX файлы

# Просмотреть текущую политику паролей домена
Get-ADDefaultDomainPasswordPolicy

# PasswordPolicies через GPMC:
# Computer Configuration\Windows Settings\Security Settings\Account Policies\Password Policy
# - Enforce password history: 24
# - Maximum password age:     90 days
# - Minimum password age:     1 day
# - Minimum password length:  12
# - Password complexity:      Enabled

# Политика блокировки аккаунта:
# Computer Configuration\Windows Settings\Security Settings\Account Policies\Account Lockout Policy
# - Account lockout threshold:         3 attempts
# - Account lockout duration:          30 minutes
# - Reset account lockout counter:     30 minutes
```

### Security Settings в GPO

```powershell
# Через GUI (Group Policy Management Editor):
# Computer Configuration → Windows Settings → Security Settings

# Права пользователей (User Rights Assignment):
# "Deny log on locally"          - запрет локального входа
# "Allow log on through RDP"     - разрешить RDP
# "Act as part of OS"            - привилегия SYSTEM
# "Backup files and directories" - право на бэкап

# Параметры безопасности (Security Options):
# "Interactive logon: Message title for users attempting to log on" - баннер входа
# "Interactive logon: Don't display last user name"                  - скрыть имя
# "Network security: LAN Manager auth level"                         - NTLMv2 only

# Аудит (Audit Policy):
# "Audit account logon events"   - аутентификация
# "Audit logon events"           - входы/выходы
# "Audit object access"          - доступ к файлам
# "Audit policy change"          - изменения политик

# Настройка через PowerShell (требует модуль SecurityPolicy)
# или через secedit.exe
secedit /export /cfg C:\security.inf
notepad C:\security.inf
secedit /configure /db C:\security.sdb /cfg C:\security.inf /areas SECURITYPOLICY
```

### Security Filtering - применить GPO только к нужным объектам

```powershell
# По умолчанию GPO применяется ко всем компьютерам/пользователям в OU
# Security Filtering позволяет уточнить

# Убрать "Authenticated Users" (применяется ко всем по умолчанию)
Set-GPPermission -Name "IT Security Policy" -TargetName "Authenticated Users" `
    -TargetType Group -PermissionLevel GpoRead -Replace

# Добавить конкретную группу
Set-GPPermission -Name "IT Security Policy" -TargetName "G-IT-Admins" `
    -TargetType Group -PermissionLevel GpoApply

# WMI Filter — дополнительное условие (например, только Windows 10)
# Создать WMI Filter в GPMC:
# WMI Filter: SELECT * FROM Win32_OperatingSystem WHERE Version LIKE "10.%"
```

### Папки перенаправления (Folder Redirection)

```
GPO: User Configuration → Windows Settings → Folder Redirection

Перенаправлять:
Desktop  → \\fileserver\users\%USERNAME%\Desktop
Documents → \\fileserver\users\%USERNAME%\Documents
AppData  → \\fileserver\users\%USERNAME%\AppData

Преимущества:
- Данные пользователей хранятся на сервере
- Бэкап централизован
- Работает при смене компьютера
- Роумингпрофили работают лучше
```

---

## Результирующая политика (RSoP)

```powershell
# Расчёт результирующей политики для пользователя/компьютера

# Через PowerShell
Get-GPResultantSetOfPolicy `
    -ReportType Html `
    -Path "C:\RSoP-alice.html" `
    -User "contoso\alice.smith" `
    -Computer "WORKSTATION01"

# Открыть результат
Invoke-Item "C:\RSoP-alice.html"

# Через командную строку (на целевом компьютере)
gpresult /r                          # краткий отчёт в консоль
gpresult /h C:\gpresult.html        # полный HTML отчёт
gpresult /v                          # подробный текстовый
gpresult /scope user                 # только пользователь
gpresult /scope computer             # только компьютер

# Принудительное обновление политик
gpupdate /force                      # на целевом компьютере
gpupdate /force /target:user         # только пользовательские политики
gpupdate /force /target:computer     # только компьютерные

# Принудительное обновление через PowerShell (удалённо)
Invoke-GPUpdate -Computer "WORKSTATION01" -Force
Invoke-GPUpdate -Computer "WORKSTATION01" -RandomDelayInMinutes 0
```

---

## Praktические сценарии GPO

### Базовая политика безопасности рабочих станций

```
GPO: "Workstation Security Baseline"
OU: OU=Workstations,DC=contoso,DC=com

Computer Configuration:
  Security Settings:
    - Password Policy: min 12 символов, сложность вкл.
    - Account Lockout: 3 попытки, 30 мин блокировка
    - Audit: вход/выход, изменение политик, доступ к файлам
    - Windows Firewall: включить, заблокировать входящие
    - Windows Update: автоматическое обновление

  Administrative Templates:
    - BitLocker: включить шифрование диска
    - Windows Defender: включить защиту в реальном времени
    - User Account Control: включить UAC (требовать подтверждение)
    - Remote Desktop: разрешить только членам группы DL-RDP-Users
```

### Скрипт входа через GPO

```batch
rem GPO: User Configuration → Windows Settings → Scripts → Logon
rem Файл: \\contoso.com\NETLOGON\logon.bat

@echo off
rem Подключить сетевые диски
net use H: \\fileserver\users\%USERNAME% /persistent:no
net use I: \\fileserver\shared\IT /persistent:no

rem Синхронизировать время
net time \\dc01 /set /yes >nul 2>&1

rem Установить принтер
rundll32 printui.dll,PrintUIEntry /in /n "\\printserver\HP-LaserJet-IT"
```

```powershell
# PowerShell скрипт входа (лучше batch)
# GPO: User Configuration → Windows Settings → Scripts → Logon
# Файл: \\contoso.com\NETLOGON\logon.ps1

# Подключить диски
$drives = @{
    "H:" = "\\fileserver\users\$env:USERNAME"
    "I:" = "\\fileserver\shared\IT"
    "S:" = "\\fileserver\software"
}

foreach ($drive in $drives.GetEnumerator()) {
    if (-not (Test-Path $drive.Key)) {
        New-PSDrive -Name $drive.Key.TrimEnd(':') -PSProvider FileSystem `
            -Root $drive.Value -Persist -Scope Global 2>$null
    }
}
```

---

## Делегирование прав в AD

```powershell
# Делегировать сброс паролей для helpdesk
# Delegation of Control Wizard в ADUC или через PowerShell

$ou = "OU=Users,DC=contoso,DC=com"
$group = "CN=HelpDesk,OU=Groups,DC=contoso,DC=com"

# ACE: разрешить сброс пароля
$acl = Get-Acl "AD:$ou"
$identity = [System.Security.Principal.IdentityReference](New-Object System.Security.Principal.NTAccount($group))
$adRights = [System.DirectoryServices.ActiveDirectoryRights]::ExtendedRight
$type = [System.Security.AccessControl.AccessControlType]::Allow
$inheritanceType = [System.DirectoryServices.ActiveDirectorySecurityInheritance]::Descendents
$objectType = [GUID]"00299570-246d-11d0-a768-00aa006e0529"  # Reset Password
$ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $identity, $adRights, $type, $objectType, $inheritanceType
)
$acl.AddAccessRule($ace)
Set-Acl "AD:$ou" $acl

# Проверить делегирование
(Get-Acl "AD:OU=Users,DC=contoso,DC=com").Access |
    Where-Object {$_.IdentityReference -like "*HelpDesk*"} |
    Select-Object IdentityReference, ActiveDirectoryRights, ObjectType
```

---

## Диагностика GPO

```powershell
# Просмотреть все GPO с привязками
Get-GPO -All | ForEach-Object {
    $gpo = $_
    $links = Get-GPOReport -Guid $gpo.Id -ReportType Xml |
        Select-String "LinksTo" | ForEach-Object { $_.ToString().Trim() }
    [PSCustomObject]@{
        Name = $gpo.DisplayName
        Status = $gpo.GpoStatus
        Links = $links -join "; "
    }
}

# Найти GPO без привязок (orphaned)
Get-GPO -All | Where-Object {
    $links = (Get-GPInheritance -Target "DC=contoso,DC=com").GpoLinks |
        Where-Object {$_.DisplayName -eq $_.DisplayName}
    -not $links
}

# Проверить репликацию GPO (SYSVOL)
# GPO хранятся в SYSVOL: \\contoso.com\SYSVOL\contoso.com\Policies\{GUID}\
ls "\\contoso.com\SYSVOL\contoso.com\Policies\"

# Проверить конкретный DC
Invoke-Command -ComputerName DC1 -ScriptBlock {
    ls "C:\Windows\SYSVOL\sysvol\contoso.com\Policies\" | Select-Object Name, LastWriteTime
}

# Журнал применения GPO на клиенте
Get-WinEvent -LogName "Microsoft-Windows-GroupPolicy/Operational" -MaxEvents 50 |
    Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Найти все конфликтующие GPO
gpresult /v 2>&1 | Select-String "denied|blocked|filtered|not applied"
```

---

## Шпаргалка

```powershell
# Пользователи
New-ADUser -Name "..." -SamAccountName "..." -Enabled $true
Get-ADUser -Filter {Department -eq "IT"} -Properties *
Set-ADUser -Identity "..." -Title "Senior Admin"
Disable-ADAccount -Identity "..."
Unlock-ADAccount -Identity "..."
Set-ADAccountPassword -Identity "..." -Reset

# Группы
New-ADGroup -Name "G-IT-Admins" -GroupScope Global -GroupCategory Security
Add-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"
Remove-ADGroupMember -Identity "G-IT-Admins" -Members "alice.smith"
Get-ADGroupMember -Identity "G-IT-Admins" -Recursive
Get-ADPrincipalGroupMembership "alice.smith"

# GPO
New-GPO -Name "My Policy"
New-GPLink -Name "My Policy" -Target "OU=IT,DC=contoso,DC=com"
Get-GPInheritance -Target "OU=IT,DC=contoso,DC=com"
Invoke-GPUpdate -Computer "PC001" -Force
gpresult /h report.html    # на целевом компьютере

# Найти неактивных пользователей
Search-ADAccount -AccountInactive -TimeSpan 90 -UsersOnly

# Найти заблокированные аккаунты
Search-ADAccount -LockedOut | Select-Object Name, SamAccountName

# Найти просроченные пароли
Search-ADAccount -PasswordExpired | Select-Object Name, SamAccountName

# Экспорт пользователей в CSV
Get-ADUser -Filter * -Properties Title, Department, EmailAddress |
    Select-Object Name, SamAccountName, Title, Department, EmailAddress |
    Export-Csv C:\users.csv -NoTypeInformation
```

---

## Ссылки

- [AD PowerShell Module](https://learn.microsoft.com/en-us/powershell/module/activedirectory/) - документация
- [Group Policy PowerShell](https://learn.microsoft.com/en-us/powershell/module/grouppolicy/) - GPO модуль
- [Security Identifiers](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers) - SID справочник
- [AGDLP Strategy](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/implementing-least-privilege-administrative-models) - модель вложенности групп
