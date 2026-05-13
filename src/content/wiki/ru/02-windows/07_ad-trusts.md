---
title: "Active Directory - Trust отношения"
date: "2026-05-13"
---

Trust (доверительные отношения) - механизм, который позволяет пользователям одного домена или леса аутентифицироваться и получать доступ к ресурсам другого домена или леса. Это фундамент межорганизационного взаимодействия и основа многих векторов атак в AD.

---

## Основные понятия

### Что такое Trust

```
Доверие устанавливается между двумя сторонами:

Trusting Domain  (доверяющий домен)  - предоставляет доступ к ресурсам
Trusted Domain   (доверенный домен)  - пользователи которого получают доступ

Пример:
  contoso.com ──[trusts]──► fabrikam.com

  Читать: "contoso.com доверяет fabrikam.com"
  Значит: пользователи fabrikam.com могут обращаться к ресурсам contoso.com
  contoso = Trusting, fabrikam = Trusted
```

```
Важно понять:
- Доверие НЕ означает автоматический доступ ко всему
- Доверие лишь позволяет аутентифицироваться через KDC чужого домена
- Фактический доступ к ресурсу всё равно контролируется ACL объекта
- Нужно отдельно назначить права группам/пользователям чужого домена
```

### Ключевые характеристики Trust

```
По направлению:
──────────────────────────────────────────────────────────────────
Одностороннее (One-way Incoming):
  A ──[trusts]──► B
  - A является Trusting, B является Trusted
  - Пользователи B могут входить в ресурсы A
  - Пользователи A НЕ могут входить в ресурсы B
  - В AD: B имеет incoming trust, A имеет outgoing trust

Двустороннее (Two-way / Bidirectional):
  A ◄──[trusts]──► B
  - Оба домена одновременно Trusting и Trusted
  - Пользователи обоих доменов получают взаимный доступ
  - Реализуется как два односторонних в обе стороны

По транзитивности:
──────────────────────────────────────────────────────────────────
Транзитивное:
  A доверяет B, B доверяет C → A автоматически доверяет C
  Все trust внутри одного леса транзитивны

Нетранзитивное:
  A доверяет B, B доверяет C → A НЕ доверяет C автоматически
  External trust и Shortcut trust нетранзитивны
```

---

## Типы доверительных отношений

### Сравнительная таблица

```
Тип            Направление      Транзитивность   Создание     Использование
─────────────────────────────────────────────────────────────────────────────
Parent-Child   Двустороннее     Транзитивное     Авто         Дочерние домены
Tree-Root      Двустороннее     Транзитивное     Авто         Новое дерево в лесу
Shortcut       Одно/двустороннее Нетранзитивное  Вручную      Ускорение auth в лесу
Forest         Одно/двустороннее Транзитивное    Вручную      Между лесами (полное)
External       Одно/двустороннее Нетранзитивное  Вручную      К домену в другом лесу
Realm          Одно/двустороннее Оба варианта    Вручную      Unix/MIT Kerberos
```

### Parent-Child Trust

```
Автоматически создаётся при добавлении дочернего домена в дерево.

contoso.com (Parent)
└── europe.contoso.com (Child)

- Направление: двустороннее
- Транзитивность: транзитивное
- Тип в AD: ParentChild
- Создаётся: автоматически при Install-ADDSDomain

Следствие транзитивности:
contoso.com доверяет europe.contoso.com
europe.contoso.com доверяет uk.europe.contoso.com
→ contoso.com автоматически доверяет uk.europe.contoso.com
```

### Tree-Root Trust

```
Создаётся автоматически при добавлении нового дерева в лес.

Лес: contoso.com
├── contoso.com (Forest Root)
└── fabrikam.com (Tree Root)   ← отдельное дерево, другое DNS-пространство

- Направление: двустороннее
- Транзитивность: транзитивное
- Тип в AD: TreeRoot
- Создаётся: автоматически при Install-ADDSDomain с новым деревом

Все домены в fabrikam.com автоматически получают transitive trust
через Tree-Root trust к Forest Root (contoso.com)
```

### Shortcut Trust

```
Создаётся вручную для ускорения аутентификации между доменами
одного леса, которые далеко друг от друга в иерархии.

Проблема без Shortcut:
  uk.europe.contoso.com → europe.contoso.com → contoso.com → asia.contoso.com → jp.asia.contoso.com
  Длинная цепочка referral запросов = медленная аутентификация

С Shortcut Trust:
  uk.europe.contoso.com ──[shortcut]──► jp.asia.contoso.com
  Прямой путь аутентификации

- Направление: одно или двустороннее (на выбор)
- Транзитивность: нетранзитивное
- Создание: вручную через netdom или PowerShell
- Использование: оптимизация, не новые возможности
```

### Forest Trust

```
Соединяет два РАЗНЫХ леса. Требует Forest Functional Level 2003+.

Лес A: contoso.com          Лес B: fabrikam.com
├── contoso.com     ◄───────────────► fabrikam.com
└── europe.contoso.com              └── uk.fabrikam.com

- Направление: одно или двустороннее
- Транзитивность: транзитивное ВНУТРИ каждого леса, но NOT между третьими лесами
- Создание: вручную на Forest Root доменах обоих лесов
- Требует: Forest FL 2003, DNS разрешение между лесами
- SID Filtering: включён по умолчанию (защита)

Транзитивность Forest Trust:
  Если Лес A доверяет Лесу B, и Лес B доверяет Лесу C,
  это НЕ означает что Лес A доверяет Лесу C
  (каждый Forest Trust создаётся отдельно)
```

### External Trust

```
Соединяет домен из одного леса с доменом из другого леса
(или с доменом Windows NT 4.0).

contoso.com ──[external]──► partner.org (отдельный лес)

- Направление: одно или двустороннее
- Транзитивность: нетранзитивное
- Создание: вручную
- SID Filtering: включён по умолчанию
- Использование: доступ к конкретному домену, не всему лесу

Отличие от Forest Trust:
- Forest Trust - всем доменам обоих лесов
- External Trust - только к одному конкретному домену
```

### Realm Trust

```
Доверие между доменом AD и non-Windows Kerberos realm
(Linux/Unix MIT Kerberos, Apple macOS Server).

contoso.com ◄──[realm trust]──► UNIX.EXAMPLE.COM

- Направление: одно или двустороннее
- Транзитивность: транзитивное или нетранзитивное (настраивается)
- Создание: вручную
- Использование: интеграция с Linux/Unix инфраструктурой

Требования:
- Оба Kerberos realm должны использовать одинаковый encryption type
- DNS: SRV записи для Kerberos realm
- NTP: синхронизация времени (Kerberos чувствителен к времени)
```

---

## Аутентификация через Trust

### Как работает Kerberos через Trust

```
Сценарий: alice@contoso.com хочет доступ к ресурсу в fabrikam.com

alice           DC (contoso.com)    DC (fabrikam.com)    Ресурс (fabrikam.com)
  │                    │                    │                      │
  │ 1. TGT Request     │                    │                      │
  │   (AS-REQ)         │                    │                      │
  │───────────────────►│                    │                      │
  │                    │                    │                      │
  │ 2. TGT             │                    │                      │
  │   (AS-REP)         │                    │                      │
  │◄───────────────────│                    │                      │
  │                    │                    │                      │
  │ 3. TGS-REQ         │                    │                      │
  │   (TGT + SPN ресурса из fabrikam)       │                      │
  │───────────────────►│                    │                      │
  │                    │                    │                      │
  │ 4. Referral TGT    │                    │                      │
  │   (ticket для KDC fabrikam.com)         │                      │
  │◄───────────────────│                    │                      │
  │                    │                    │                      │
  │ 5. TGS-REQ         │                    │                      │
  │   (Referral TGT)   │                    │                      │
  │───────────────────────────────────────►│                      │
  │                    │                    │                      │
  │ 6. Service Ticket  │                    │                      │
  │   (для ресурса в fabrikam)              │                      │
  │◄───────────────────────────────────────│                      │
  │                                                               │
  │ 7. AP-REQ (Service Ticket)                                    │
  │──────────────────────────────────────────────────────────────►│
  │                                                               │
  │ 8. Доступ разрешён / запрещён (на основе ACL)                 │
  │◄──────────────────────────────────────────────────────────────│

Inter-realm key - общий секрет между двумя KDC, установленный при создании Trust
Referral TGT - билет для KDC чужого домена, шифрованный inter-realm ключом
```

### NTLM через Trust

```
NTLM аутентификация через Trust (Pass-through authentication):

Клиент          Сервер-ресурс     DC ресурса    DC пользователя
  │                   │                │               │
  │ 1. NTLM Negotiate │                │               │
  │──────────────────►│                │               │
  │                   │                │               │
  │ 2. Challenge      │                │               │
  │◄──────────────────│                │               │
  │                   │                │               │
  │ 3. Response       │                │               │
  │──────────────────►│                │               │
  │                   │                │               │
  │                   │ 4. NetLogon Pass-through        │
  │                   │────────────────────────────────►│
  │                   │                │               │
  │                   │ 5. Validation  │               │
  │                   │◄────────────────────────────────│
  │                   │                │               │
  │ 6. Доступ         │                │               │
  │◄──────────────────│                │               │

Netlogon Secure Channel используется для передачи credentials
```

---

## Управление Trust через PowerShell

### Просмотр существующих Trust

```
# Все Trust для текущего домена
Get-ADTrust -Filter *

# Подробная информация о конкретном Trust
Get-ADTrust -Identity "fabrikam.com"

# Форматированный вывод с важными атрибутами
Get-ADTrust -Filter * | Select-Object `
    Name,
    Direction,
    TrustType,
    TrustAttributes,
    DisallowTransivity,
    SIDFilteringQuarantined,
    SIDFilteringForestAware,
    SelectiveAuthentication

# Расшифровка Direction:
# BiDirectional    = 3 (двустороннее)
# Inbound          = 1 (входящее - мы Trusted)
# Outbound         = 2 (исходящее - мы Trusting)

# Расшифровка TrustType:
# Uplevel           = 2  (Windows 2000+)
# Downlevel         = 1  (NT 4.0)
# MIT               = 3  (Kerberos Realm)
# DCE               = 4  (DCE)

# Расшифровка TrustAttributes (битовое поле):
# 0x01  NON_TRANSITIVE           - нетранзитивный
# 0x02  UPLEVEL_ONLY             - только Windows 2000+
# 0x04  QUARANTINED_DOMAIN       - SID Filtering включён
# 0x08  FOREST_TRANSITIVE        - Forest Trust
# 0x10  CROSS_ORGANIZATION       - Selective Authentication
# 0x20  WITHIN_FOREST            - внутри леса
# 0x40  TREAT_AS_EXTERNAL        - обработать как External
# 0x80  USES_RC4_ENCRYPTION      - RC4 шифрование (устаревшее)
```

```
# Trust через .NET (больше деталей)
$domain = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
$domain.GetAllTrustRelationships()

# Trust на уровне леса
$forest = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest()
$forest.GetAllTrustRelationships()

# Через ADSI
$domainDN = (Get-ADDomain).DistinguishedName
Get-ADObject -Filter {objectClass -eq "trustedDomain"} `
    -SearchBase $domainDN `
    -Properties * | Select-Object Name, TrustDirection, TrustType, TrustAttributes
```

### Создание Trust

```
# --- Forest Trust (двусторонний) ---
# Выполнять от имени Enterprise Admins ОБОИХ лесов

# Вариант 1: netdom (классика)
netdom trust contoso.com /domain:fabrikam.com /twoway /add /passwordt:TrustP@ss123

# Вариант 2: PowerShell через .NET
$localForest  = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest()
$remoteForest = [System.DirectoryServices.ActiveDirectory.Forest]::GetForest(
    (New-Object System.DirectoryServices.ActiveDirectory.DirectoryContext(
        "Forest", "fabrikam.com", "fabrikam\admin", "P@ssw0rd"
    ))
)
$localForest.CreateTrustRelationship($remoteForest, "Bidirectional")

# --- External Trust (односторонний, входящий) ---
# contoso.com доверяет partner.org (пользователи partner.org -> ресурсы contoso.com)
netdom trust contoso.com /domain:partner.org /oneside:trusted /add /passwordt:TrustSecret

# --- Shortcut Trust ---
netdom trust europe.contoso.com /domain:asia.contoso.com /twoway /add /passwordt:ShortcutPass

# --- Realm Trust ---
netdom trust contoso.com /domain:UNIX.EXAMPLE.COM /realmtrust /twoway /add
```

### Изменение и удаление Trust

```
# Изменить направление Trust
netdom trust contoso.com /domain:fabrikam.com /twoway

# Включить Selective Authentication
netdom trust contoso.com /domain:fabrikam.com /quarantine:no /selectiveauth:yes

# Отключить SID Filtering (осторожно - снижает безопасность!)
netdom trust contoso.com /domain:fabrikam.com /quarantine:no

# Включить SID Filtering обратно
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

# Удалить Trust
netdom trust contoso.com /domain:fabrikam.com /remove /twoway
Remove-ADTrust -Identity "CN=fabrikam.com,CN=System,DC=contoso,DC=com" -Confirm:$false

# Проверить Trust
netdom trust contoso.com /domain:fabrikam.com /verify
Test-ComputerSecureChannel -Server DC01
```

---

## SID Filtering и SID History

### SID Filtering

```
SID Filtering (SID Quarantine) - механизм безопасности, который
отфильтровывает SID из другого леса/домена в Kerberos билетах.

Проблема без SID Filtering:
  1. Атакующий компрометирует Trusted домен (fabrikam.com)
  2. Добавляет SID группы "Domain Admins" из contoso.com
     в атрибут SIDHistory своей учётной записи
  3. При получении Service Ticket в contoso.com,
     этот SID включается в PAC (Privilege Attribute Certificate)
  4. Сервер в contoso.com видит SID Domain Admins → даёт полный доступ!

SID Filtering решает эту проблему:
  DC contoso.com фильтрует все SID из чужого леса в PAC
  Оставляет только SID из доверенного домена

Статус по умолчанию:
- Forest Trust:   SID Filtering ВКЛЮЧЁН (TrustAttributes: QUARANTINED_DOMAIN)
- External Trust: SID Filtering ВКЛЮЧЁН
- Parent-Child:   SID Filtering ВЫКЛЮЧЕН (внутри одного леса - доверяем)
```

```
# Проверить статус SID Filtering
Get-ADTrust -Filter * | Select-Object Name, SIDFilteringQuarantined, SIDFilteringForestAware

# SIDFilteringQuarantined = True  → SID Filtering включён (безопасно)
# SIDFilteringQuarantined = False → SID Filtering выключен (риск!)

# Включить SID Filtering (рекомендуется для всех внешних trust)
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

# Выключить SID Filtering (нужно для SIDHistory миграции - временно!)
netdom trust contoso.com /domain:fabrikam.com /quarantine:no
```

### SID History

```
SIDHistory - атрибут объекта пользователя, содержащий старые SID.
Используется при миграции доменов для сохранения доступа к ресурсам.

Легитимное использование:
  1. Пользователь мигрирует из old.corp → new.corp
  2. В new.corp у него новый SID: S-1-5-21-NEW-1234
  3. В SIDHistory добавляют старый SID: S-1-5-21-OLD-5678
  4. Файловый сервер в old.corp видит старый SID → даёт доступ
  5. Постепенно переназначают права на новый SID, потом убирают SIDHistory

Атака через SIDHistory (SIDHistory Injection):
  1. Атакующий компрометирует DC доверенного домена
  2. Добавляет SID Enterprise Admins / Domain Admins леса-жертвы
     в SIDHistory своей учётной записи
  3. При SID Filtering ВЫКЛЮЧЕН - полный доступ к лесу-жертве

# Просмотр SIDHistory пользователя
Get-ADUser "alice" -Properties SIDHistory | Select-Object Name, SIDHistory

# Проверить нет ли чужих SID в SIDHistory (аудит безопасности)
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object { $_.SIDHistory -ne $null } |
    Select-Object Name, SamAccountName, SIDHistory

# Найти SIDHistory с SID из другого домена (подозрительно!)
$domainSID = (Get-ADDomain).DomainSID.Value
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object {
        $_.SIDHistory | Where-Object { $_.Value -notlike "$domainSID*" }
    } |
    Select-Object Name, SamAccountName, SIDHistory
```

---

## Selective Authentication

```
Selective Authentication - более строгий режим Forest Trust или External Trust,
при котором доступ к ресурсам разрешён только явно авторизованным пользователям.

Без Selective Authentication (стандартный Trust):
  Любой пользователь trusted домена может аутентифицироваться на любом сервере

С Selective Authentication:
  Пользователь trusted домена может войти на сервер ТОЛЬКО если
  на объекте-компьютере ему явно выдано право "Allowed to Authenticate"

Когда использовать:
- Forest Trust с партнёром (не полное доверие)
- Нужно разрешить доступ только к конкретным серверам
- Принцип минимальных привилегий для межлесовых соединений
```

```
# Включить Selective Authentication при создании Trust
netdom trust contoso.com /domain:fabrikam.com /twoway /add /selectiveauth:yes

# Включить на существующем Trust
Set-ADObject -Identity "CN=fabrikam.com,CN=System,DC=contoso,DC=com" `
    -Replace @{trustAttributes = 80}
# 80 = 0x50 = QUARANTINED_DOMAIN (0x04) + FOREST_TRANSITIVE (0x08) +
#             CROSS_ORGANIZATION (0x10) + WITHIN_FOREST... нет, считаем точнее:
# Лучше через netdom:
netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

# Выдать право "Allowed to Authenticate" на конкретном сервере
# 1. Открыть ADUC на сервере (или через PowerShell)
# 2. Объект компьютера → Properties → Security → Add

# Через PowerShell:
$server   = Get-ADComputer "FILESERVER01"
$user     = Get-ADUser -Server "fabrikam.com" -Identity "bob.jones"
$acl      = Get-Acl "AD:$($server.DistinguishedName)"

$identity = [System.Security.Principal.IdentityReference](
    New-Object System.Security.Principal.NTAccount("fabrikam.com\bob.jones")
)
$adRights     = [System.DirectoryServices.ActiveDirectoryRights]::ExtendedRight
$type         = [System.Security.AccessControl.AccessControlType]::Allow
$objectType   = [System.Guid]"68b1d179-0d15-4d4f-ab71-46152e79a7bc" # Allowed-To-Authenticate
$inheritance  = [System.DirectoryServices.ActiveDirectorySecurityInheritance]::None

$ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $identity, $adRights, $type, $objectType, $inheritance
)
$acl.AddAccessRule($ace)
Set-Acl "AD:$($server.DistinguishedName)" $acl
Write-Host "[+] Allowed to Authenticate выдано bob.jones на FILESERVER01"
```

---

## Netlogon и Secure Channel

```
Secure Channel - защищённый канал между DC и клиентом/сервером,
по которому передаются credentials при NTLM pass-through аутентификации.

Каждый компьютер и каждый DC имеет Secure Channel к DC своего домена.
При Trust: DC trusting домена имеет Secure Channel к DC trusted домена.

Пароль Secure Channel:
- Меняется автоматически каждые 30 дней
- Хранится в LSA секретах
- При разрыве канала - проблемы с аутентификацией через Trust
```

```
# Проверить состояние Secure Channel
nltest /sc_verify:fabrikam.com         # проверить канал к trusted домену
nltest /sc_query:fabrikam.com          # запросить состояние
nltest /sc_reset:fabrikam.com          # сбросить и пересоздать канал

# Проверить Trust с DC
nltest /domain_trusts                   # список всех Trust
nltest /domain_trusts /all_trusts       # включая indirect
nltest /dsgetdc:fabrikam.com           # найти DC trusted домена
nltest /dsgetdc:fabrikam.com /kdc      # найти KDC

# Тест репликации Inter-Domain Trust Account (INTERDOMAIN_TRUST_ACCOUNT)
# Для каждого Trust создаётся специальная учётная запись:
# fabrikam$  в contoso.com (outgoing trust account)
# contoso$   в fabrikam.com

# Найти Trust Accounts
Get-ADUser -Filter {Name -like "*$"} -Properties userAccountControl |
    Where-Object { $_.userAccountControl -band 2048 } |
    Select-Object Name, SamAccountName, userAccountControl
# userAccountControl bit 2048 = INTERDOMAIN_TRUST_ACCOUNT
```

---

## Практические сценарии

### Сценарий 1: Forest Trust с партнёром

```
Задача: предоставить пользователям fabrikam.com доступ к SharePoint
в contoso.com, но не ко всей инфраструктуре.

Решение:
1. Создать Forest Trust с Selective Authentication
2. На компьютере SharePoint выдать "Allowed to Authenticate" нужным группам

# Шаг 1: DNS - настроить Conditional Forwarder
# В DNS Manager contoso.com добавить Conditional Forwarder для fabrikam.com
# (или настроить stub zone)

# Проверить DNS разрешение до Trust
Resolve-DnsName fabrikam.com -Server 8.8.8.8  # должен разрешаться
nslookup fabrikam.com <IP DC fabrikam>

# Шаг 2: Создать Forest Trust
# На DC contoso.com:
netdom trust contoso.com /domain:fabrikam.com `
    /twoway /add /selectiveauth:yes /passwordt:TrustSecret123!

# Шаг 3: Выдать "Allowed to Authenticate" на SharePoint сервере
# для группы G-SharePoint-Users из fabrikam.com
$sp  = Get-ADComputer "SHAREPOINT01"
$acl = Get-Acl "AD:$($sp.DistinguishedName)"
# ... добавить ACE как показано в разделе Selective Authentication

# Шаг 4: В SharePoint добавить группу fabrikam\G-SharePoint-Users
# и назначить нужные права

# Проверить
netdom trust contoso.com /domain:fabrikam.com /verify
Get-ADTrust -Identity "fabrikam.com" | Select-Object *
```

### Сценарий 2: Shortcut Trust для ускорения аутентификации

```
Ситуация: пользователи из uk.europe.contoso.com часто обращаются
к ресурсам asia.contoso.com. Аутентификация медленная.

Путь Kerberos без Shortcut:
uk.europe.contoso.com → europe.contoso.com → contoso.com → asia.contoso.com

Каждый hop = дополнительный Referral TGT запрос.

# Создать Shortcut Trust
netdom trust uk.europe.contoso.com /domain:asia.contoso.com `
    /twoway /add /passwordt:ShortcutPass123

# После создания путь Kerberos:
uk.europe.contoso.com → asia.contoso.com (прямой referral)

# Проверить
nltest /dsgetdc:asia.contoso.com /server:DC.uk.europe.contoso.com
```

### Сценарий 3: Миграция домена с SIDHistory

```
Задача: мигрировать пользователей из old.local в new.corp
с сохранением доступа к ресурсам old.local

# Шаг 1: Создать External Trust (old.local доверяет new.corp)
netdom trust old.local /domain:new.corp /twoway /add /passwordt:MigrationSecret

# Шаг 2: Отключить SID Filtering ВРЕМЕННО для миграции
netdom trust old.local /domain:new.corp /quarantine:no

# Шаг 3: Мигрировать пользователей (ADMT или PowerShell)
# При миграции SIDHistory автоматически заполняется старыми SID

# Шаг 4: Проверить доступ мигрированных пользователей к ресурсам old.local

# Шаг 5: После завершения миграции - включить SID Filtering обратно!
netdom trust old.local /domain:new.corp /quarantine:yes

# Шаг 6: Когда все права переназначены на новые SID - очистить SIDHistory
Get-ADUser -Filter * -Properties SIDHistory |
    Where-Object { $_.SIDHistory } |
    ForEach-Object {
        Set-ADUser $_ -Remove @{SIDHistory = $_.SIDHistory}
        Write-Host "Cleared SIDHistory for $($_.Name)"
    }

# Шаг 7: Удалить Trust после полной миграции
netdom trust old.local /domain:new.corp /remove /twoway
```

---

## Диагностика Trust

### Основные команды

```
# --- Проверка Trust ---
netdom trust contoso.com /domain:fabrikam.com /verify
nltest /domain_trusts /all_trusts
Get-ADTrust -Filter * | Format-Table Name, Direction, TrustType, TrustAttributes -AutoSize

# --- DNS диагностика (критично для Trust!) ---
# Trust требует взаимного DNS разрешения между доменами

# Проверить SRV записи trusted домена
nslookup -type=SRV _ldap._tcp.fabrikam.com
nslookup -type=SRV _kerberos._tcp.fabrikam.com
nslookup -type=SRV _gc._tcp.fabrikam.com

# Найти DC trusted домена
nltest /dsgetdc:fabrikam.com
nltest /dsgetdc:fabrikam.com /kdc
nltest /dsgetdc:fabrikam.com /force   # игнорировать кэш

# --- Kerberos диагностика ---
# Посмотреть текущие тикеты (включая Referral TGT)
klist
klist tickets
klist -li 0x3e7   # тикеты LocalSystem

# Очистить тикеты и получить новые
klist purge
gpupdate /force

# --- Netlogon лог (подробная диагностика) ---
# Включить Netlogon логирование на DC
nltest /dbflag:0x2080ffff    # включить подробный лог
# Лог: C:\Windows\debug\netlogon.log

# После диагностики выключить:
nltest /dbflag:0x0

# --- Порты для Trust ---
# Между DC trusting и trusted домена должны быть открыты:
# 53   TCP/UDP  DNS
# 88   TCP/UDP  Kerberos
# 135  TCP      RPC Endpoint Mapper
# 137  UDP      NetBIOS Name
# 138  UDP      NetBIOS Datagram
# 139  TCP      NetBIOS Session
# 389  TCP/UDP  LDAP
# 445  TCP      SMB
# 464  TCP/UDP  Kerberos password change
# 636  TCP      LDAPS
# 3268 TCP      Global Catalog
# 49152-65535 TCP  RPC Dynamic Ports

# Проверить портовую доступность
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 88
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 389
Test-NetConnection fabrikam-dc01.fabrikam.com -Port 445
```

### Типичные проблемы и решения

```
Проблема: "The trust relationship between this workstation and the primary domain failed"
Причина:  Нарушен Secure Channel компьютера с DC
Решение:
  Test-ComputerSecureChannel -Repair -Credential (Get-Credential)
  nltest /sc_reset:contoso.com

Проблема: Аутентификация через Trust не работает
Проверки:
  1. DNS: nslookup -type=SRV _ldap._tcp.fabrikam.com  (должен разрешаться)
  2. Время: |time(contoso) - time(fabrikam)| < 5 минут
     w32tm /monitor - проверить синхронизацию
  3. Firewall: порты 88, 389, 445 открыты между DC
  4. Trust счёт: проверить что InterDomain Trust Account не заблокирован
     Get-ADUser -Filter {Name -eq "fabrikam$"}
  5. Netlogon лог: nltest /dbflag:0x2080ffff → воспроизвести проблему → смотреть лог

Проблема: SID Filtering блокирует Universal Group членство
Причина:  Forest Trust с SID Filtering обрезает SID из другого леса в PAC
Решение:  Использовать Domain Local Groups в каждом лесу,
          добавлять туда Global Groups из доверенного леса

Проблема: Selective Authentication - пользователь видит "Access Denied" на сервере
Причина:  Нет права "Allowed to Authenticate" на объекте-компьютере
Решение:  Выдать Extended Right на объект Computer в AD
          (Security → Add → Allowed to Authenticate)
```

### Event Log диагностика

```
# События связанные с Trust и аутентификацией (Security Log на DC)
# 4768  Kerberos TGT Request (AS-REQ / AS-REP)
# 4769  Kerberos Service Ticket Request (TGS-REQ)
# 4770  Kerberos Service Ticket Renewal
# 4771  Kerberos pre-auth failed
# 4772  Kerberos AS-REQ failed
# 4773  Kerberos TGS-REQ failed
# 4820  Kerberos TGT denied (account restrictions)
# 4821  Kerberos Service Ticket denied (account restrictions)
# 5136  Directory Service object modified (изменение Trust)
# 5137  Directory Service object created (создание Trust)
# 5139  Directory Service object moved
# 5141  Directory Service object deleted (удаление Trust)

# Найти все события аутентификации через Trust (cross-domain)
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(4768, 4769)
    StartTime = (Get-Date).AddHours(-1)
} | Where-Object {
    $_.Message -match "fabrikam"   # фильтр по trusted домену
} | Select-Object TimeCreated, Id, Message | Format-Table -Wrap

# Изменения Trust объектов (аудит)
Get-WinEvent -ComputerName DC01 -FilterHashtable @{
    LogName   = "Security"
    Id        = @(5136, 5137, 5141)
} | Where-Object {
    $_.Message -match "trustedDomain"
} | Select-Object TimeCreated, Id, Message

# Netlogon log: ошибки Trust
Get-Content "C:\Windows\debug\netlogon.log" |
    Select-String "fabrikam|TRUST|ERROR|FAIL" |
    Select-Object -Last 50
```

---

## Безопасность Trust - атаки и защита

### Опасные конфигурации

```
РИСК 1: SID Filtering выключен на Forest Trust
  Позволяет атаку SIDHistory Injection
  Проверка:
    Get-ADTrust -Filter * | Where-Object { $_.SIDFilteringQuarantined -eq $false }
  Исправление:
    netdom trust contoso.com /domain:fabrikam.com /quarantine:yes

РИСК 2: Двустороннее Forest Trust без Selective Authentication
  Все пользователи trusted леса могут аутентифицироваться на любом сервере
  Проверка:
    Get-ADTrust -Filter * | Where-Object {
        $_.TrustAttributes -notmatch "CrossOrganization" -and
        $_.TrustType -eq "Uplevel"
    }
  Исправление:
    netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

РИСК 3: Устаревшие Trust к доменам Windows NT 4.0
  NT 4.0 домены используют LM/NTLM, не поддерживают Kerberos
  Проверка:
    Get-ADTrust -Filter {TrustType -eq "Downlevel"}
  Исправление:
    Удалить если NT 4.0 домен больше не используется
    netdom trust contoso.com /domain:nt4domain /remove

РИСК 4: Shortcut Trust к поддомену с низкой защитой
  Если поддомен скомпрометирован, Shortcut Trust даёт прямой путь
  к ресурсам другой ветки леса
  Проверка:
    Get-ADTrust -Filter {TrustType -eq "Shortcut"}
  Оценить: нужен ли этот Trust? Какой риск компрометации?
```

### Аудит Trust безопасности

```
# Полный аудит Trust в домене
function Invoke-TrustAudit {
    $trusts = Get-ADTrust -Filter * -Properties *
    $report = @()

    foreach ($trust in $trusts) {
        $risks = @()

        # Проверка SID Filtering
        if (-not $trust.SIDFilteringQuarantined -and $trust.TrustType -ne "ParentChild") {
            $risks += "SID Filtering DISABLED"
        }

        # Проверка Selective Authentication
        if (-not ($trust.TrustAttributes -band 0x10) -and $trust.TrustType -eq "Uplevel") {
            $risks += "No Selective Authentication"
        }

        # NT4 доверия
        if ($trust.TrustType -eq "Downlevel") {
            $risks += "Legacy NT4 Trust (NTLM only)"
        }

        # RC4 шифрование
        if ($trust.TrustAttributes -band 0x80) {
            $risks += "RC4 encryption (weak)"
        }

        $report += [PSCustomObject]@{
            TrustName        = $trust.Name
            Direction        = $trust.Direction
            Type             = $trust.TrustType
            SIDFiltering     = $trust.SIDFilteringQuarantined
            SelectiveAuth    = [bool]($trust.TrustAttributes -band 0x10)
            Transitive       = -not $trust.DisallowTransivity
            Risks            = ($risks -join " | ")
        }
    }

    return $report
}

$audit = Invoke-TrustAudit
$audit | Format-Table -AutoSize

# Выделить проблемные Trust
$audit | Where-Object { $_.Risks -ne "" } |
    Format-Table TrustName, Direction, Risks -AutoSize
```

---

## Шпаргалка

```
# Просмотр Trust
Get-ADTrust -Filter *
Get-ADTrust -Filter * | Select-Object Name, Direction, TrustType, TrustAttributes
netdom trust contoso.com /domain:fabrikam.com /verify
nltest /domain_trusts /all_trusts

# Создание Trust
netdom trust contoso.com /domain:fabrikam.com /twoway /add /passwordt:Secret
netdom trust contoso.com /domain:fabrikam.com /oneside:trusted /add    # входящее
netdom trust contoso.com /domain:fabrikam.com /oneside:trusting /add   # исходящее

# Включить/выключить SID Filtering
netdom trust contoso.com /domain:fabrikam.com /quarantine:yes    # включить
netdom trust contoso.com /domain:fabrikam.com /quarantine:no     # выключить (осторожно!)

# Selective Authentication
netdom trust contoso.com /domain:fabrikam.com /selectiveauth:yes

# Удалить Trust
netdom trust contoso.com /domain:fabrikam.com /remove /twoway

# Диагностика
nltest /sc_verify:fabrikam.com          # проверить Secure Channel
nltest /sc_reset:fabrikam.com           # сбросить Secure Channel
nltest /dsgetdc:fabrikam.com            # найти DC
nslookup -type=SRV _ldap._tcp.fabrikam.com  # DNS проверка

# SIDHistory
Get-ADUser -Filter * -Properties SIDHistory | Where-Object { $_.SIDHistory }
# Очистить SIDHistory
Set-ADUser "alice" -Remove @{SIDHistory = (Get-ADUser "alice" -Properties SIDHistory).SIDHistory}

# Типы Trust (TrustType enum):
# ParentChild / TreeRoot = внутри леса (авто)
# Shortcut               = внутри леса (вручную, ускорение)
# Forest                 = между лесами (вручную, полное)
# External               = к домену в другом лесу (вручную, точечное)
# Realm                  = к Kerberos realm (MIT/Unix)

# Direction enum:
# BiDirectional = 3
# Inbound       = 1 (мы Trusted - наши пользователи идут ВО-ВНЕ)
# Outbound      = 2 (мы Trusting - чужие пользователи идут К-НАМ)
```

---

## Ссылки

- [AD Trust Types](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/trust-types) - официальная документация
- [Forest Trusts](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/forest-design-models) - проектирование лесов
- [SID Filtering](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/how-domain-and-forest-trusts-work) - механизм фильтрации SID
- [Selective Authentication](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/plan/security-best-practices/best-practices-for-securing-active-directory) - лучшие практики
- [netdom reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc835085(v=ws.11)) - команды netdom
- [Trust Attacks (ired.team)](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse) - атаки через Trust
