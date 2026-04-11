---
title: "Active Directory — домены, деревья, леса"
date: "2026-04-11"
---

Active Directory (AD) - служба каталогов Microsoft, являющаяся центральным компонентом управления идентификацией и доступом в корпоративных сетях Windows. Хранит информацию обо всех объектах сети: пользователях, компьютерах, группах, политиках.

---

## Зачем нужен Active Directory

Без AD (рабочая группа):
- Каждый компьютер управляет своими пользователями отдельно
- Нет централизованной аутентификации
- Нет единых политик безопасности
- При 50+ машинах — управление становится хаосом

С AD:
- Один вход для всех ресурсов сети (Single Sign-On)
- Централизованное управление политиками (GPO)
- Единая база пользователей и групп
- Аутентификация через Kerberos
- Аудит и логирование на уровне домена

---

## Основные компоненты

### Логическая структура

```
Лес (Forest)
└── Дерево (Tree): contoso.com
    ├── Домен (Domain): contoso.com        ← корневой домен дерева
    │   ├── OU: IT
    │   │   ├── OU: Servers
    │   │   └── OU: Workstations
    │   ├── OU: HR
    │   ├── OU: Finance
    │   └── Объекты: пользователи, группы, компьютеры
    │
    ├── Дочерний домен: europe.contoso.com
    │   ├── OU: London
    │   └── OU: Paris
    │
    └── Дочерний домен: asia.contoso.com
        ├── OU: Tokyo
        └── OU: Singapore

└── Дерево (Tree): fabrikam.com           ← другое дерево в том же лесу
    └── Домен: fabrikam.com
```

### Физическая структура

```
Лес
└── Сайт (Site): Moscow-HQ
    ├── DC1.contoso.com (Domain Controller)
    ├── DC2.contoso.com (Domain Controller)
    └── Клиентские машины

└── Сайт: London-Office
    ├── DC3.europe.contoso.com
    └── Клиентские машины

└── Связи между сайтами (Site Links)
    └── Moscow-HQ ←→ London-Office (репликация каждые 180 мин)
```

---

## Домен (Domain)

Домен - основная административная единица AD. Это граница безопасности, репликации и административного управления.

### Характеристики домена

```
Имя домена:        contoso.com (DNS имя)
NetBIOS имя:       CONTOSO (старый стиль, ≤15 символов)
SID:               S-1-5-21-xxxxxxxxxx (уникальный идентификатор)
Functional level:  Windows Server 2016 / 2019 / 2022
```

### Контроллер домена (Domain Controller, DC)

DC - сервер Windows Server с ролью Active Directory Domain Services (AD DS). Хранит полную копию базы данных домена (NTDS.dit).

```
NTDS.dit — основная база данных AD
Расположение: C:\Windows\NTDS\ntds.dit
Размер:       от нескольких МБ до десятков ГБ (зависит от размера домена)
Формат:       ESE (Extensible Storage Engine) — база данных Microsoft Jet
```

```powershell
# Установка роли AD DS и создание первого DC (нового леса)
Install-WindowsFeature -Name AD-Domain-Services -IncludeManagementTools

Import-Module ADDSDeployment
Install-ADDSForest `
    -DomainName "contoso.com" `
    -DomainNetbiosName "CONTOSO" `
    -ForestMode "WinThreshold" `
    -DomainMode "WinThreshold" `
    -InstallDns `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force

# Добавить DC в существующий домен
Install-ADDSDomainController `
    -DomainName "contoso.com" `
    -InstallDns `
    -Credential (Get-Credential) `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force

# Создать дочерний домен
Install-ADDSDomain `
    -NewDomainName "europe" `
    -ParentDomainName "contoso.com" `
    -DomainMode "WinThreshold" `
    -InstallDns `
    -Credential (Get-Credential) `
    -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Force
```

### Functional Level

Определяет доступные возможности домена/леса. Зависит от минимальной версии Windows Server среди всех DC.

| Functional Level | Минимальная ОС DC | Ключевые возможности |
|------------------|-------------------|----------------------|
| Windows Server 2008 R2 | WS 2008 R2 | Managed Service Accounts |
| Windows Server 2012 | WS 2012 | KDC поддержка claims |
| Windows Server 2012 R2 | WS 2012 R2 | Protected Users, Authentication Policies |
| Windows Server 2016 | WS 2016 | Privileged Access Management |
| Windows Server 2019 | WS 2019 | Нет новых возможностей AD |
| Windows Server 2022 | WS 2022 | - |

```powershell
# Посмотреть functional level
Get-ADDomain | Select-Object DomainMode
Get-ADForest | Select-Object ForestMode

# Повысить functional level (необратимо!)
Set-ADDomainMode -Identity "contoso.com" -DomainMode Windows2016Domain
Set-ADForestMode -Identity "contoso.com" -ForestMode Windows2016Forest
```

---

## Организационные единицы (OU)

OU (Organizational Unit) - контейнер внутри домена для организации объектов. Позволяет делегировать управление и применять GPO к группе объектов.

```
OU иерархия в домене contoso.com:
─────────────────────────────────────────────
contoso.com
├── Builtin          ← встроенные группы (не OU, нельзя применять GPO)
├── Computers        ← по умолчанию для новых компьютеров (не OU!)
├── Users            ← по умолчанию для новых пользователей (не OU!)
│
├── OU=Corporate     ← кастомные OU
│   ├── OU=IT
│   │   ├── OU=Admins
│   │   │   └── user: john.doe (CN=John Doe,OU=Admins,OU=IT,OU=Corporate,DC=contoso,DC=com)
│   │   └── OU=HelpDesk
│   ├── OU=HR
│   │   └── user: jane.smith
│   └── OU=Finance
│
└── OU=Servers
    ├── OU=Domain Controllers  ← автоматически создаётся
    ├── OU=File Servers
    └── OU=Web Servers
```

```powershell
# Управление OU
New-ADOrganizationalUnit -Name "IT" -Path "OU=Corporate,DC=contoso,DC=com"
New-ADOrganizationalUnit -Name "Admins" -Path "OU=IT,OU=Corporate,DC=contoso,DC=com"

# Защита от случайного удаления (рекомендуется включать)
New-ADOrganizationalUnit -Name "Finance" -Path "DC=contoso,DC=com" -ProtectedFromAccidentalDeletion $true

# Переместить объект в другую OU
Move-ADObject -Identity "CN=John Doe,OU=HR,DC=contoso,DC=com" `
              -TargetPath "OU=IT,DC=contoso,DC=com"

# Удалить OU (сначала снять защиту)
Set-ADOrganizationalUnit -Identity "OU=OldOU,DC=contoso,DC=com" -ProtectedFromAccidentalDeletion $false
Remove-ADOrganizationalUnit -Identity "OU=OldOU,DC=contoso,DC=com"

# Список OU
Get-ADOrganizationalUnit -Filter * | Select-Object Name, DistinguishedName
```

---

## Дерево (Tree)

Дерево - группа доменов с общим корневым DNS-пространством имён. Все домены в дереве имеют двусторонние транзитивные доверительные отношения.

```
Дерево contoso.com:

contoso.com                    ← корень дерева
├── europe.contoso.com         ← дочерний домен (поддомен DNS)
│   ├── uk.europe.contoso.com
│   └── de.europe.contoso.com
└── asia.contoso.com
    ├── jp.asia.contoso.com
    └── sg.asia.contoso.com

Доверие:
contoso.com ←──── двустороннее транзитивное доверие ────► europe.contoso.com
europe.contoso.com ←──────────────────────────────────► uk.europe.contoso.com

Транзитивность означает:
Если A доверяет B, и B доверяет C → A автоматически доверяет C
```

---

## Лес (Forest)

Лес - наивысший уровень иерархии AD. Содержит одно или несколько деревьев. Это **граница безопасности** — объекты одного леса не имеют автоматического доступа к ресурсам другого леса.

### Структура леса

```
Лес (Forest): contoso.com (имя корневого домена = имя леса)
│
├── Дерево 1: contoso.com
│   ├── contoso.com (Forest Root Domain)
│   └── europe.contoso.com
│
└── Дерево 2: fabrikam.com    ← другое DNS пространство имён
    ├── fabrikam.com
    └── uk.fabrikam.com

Между деревьями: двустороннее транзитивное доверие
```

### Forest Root Domain

Первый домен, созданный в лесу. Особый статус:
- Содержит группы **Schema Admins** и **Enterprise Admins**
- Хранит **Configuration** и **Schema** контексты именования
- Нельзя переименовать или удалить без пересоздания леса

### Разделяемые объекты в лесу

```
Объекты, общие для всего леса:
┌──────────────────────────────────────────────────────────┐
│  Schema     - определение всех классов и атрибутов       │
│  Configuration - конфигурация леса (сайты, репликация)   │
│  Forest Root DNS - корневое DNS пространство             │
│  Global Catalog - частичные реплики всех доменов         │
│  Enterprise Admins - администраторы всего леса           │
│  Schema Admins - могут изменять схему                    │
└──────────────────────────────────────────────────────────┘
```

---

## Доверительные отношения (Trusts)

Доверие позволяет пользователям одного домена/леса обращаться к ресурсам другого.

### Типы доверия

```
По направлению:
──────────────────────────────────────────────────────────────
Одностороннее (One-way):
  A ──[доверяет]──► B
  Пользователи B могут обращаться к ресурсам A
  Пользователи A НЕ могут обращаться к ресурсам B

Двустороннее (Two-way / Bidirectional):
  A ◄──[доверяют]──► B
  Пользователи обоих доменов могут обращаться к ресурсам друг друга

По транзитивности:
──────────────────────────────────────────────────────────────
Транзитивное:
  A доверяет B, B доверяет C → A автоматически доверяет C
  (все доверия внутри леса транзитивны)

Нетранзитивное:
  A доверяет B, B доверяет C → A НЕ доверяет C автоматически
```

### Типы доверительных отношений в AD

| Тип | Направление | Транзитивность | Автоматически? |
|-----|-------------|----------------|----------------|
| Parent-Child | Двустороннее | Транзитивное | Да (при создании дочернего домена) |
| Tree-Root | Двустороннее | Транзитивное | Да (при создании нового дерева) |
| Shortcut | Одно или двустороннее | Нетранзитивное | Нет (вручную) |
| Forest | Одно или двустороннее | Транзитивное | Нет (вручную) |
| External | Одно или двустороннее | Нетранзитивное | Нет (вручную) |
| Realm | Одно или двустороннее | Транзитивное/нет | Нет (для Kerberos V5) |

```powershell
# Просмотр доверий
Get-ADTrust -Filter *
Get-ADTrust -Identity "fabrikam.com"

# Создать лесное доверие (Forest Trust)
netdom trust contoso.com /domain:fabrikam.com /twoway /add

# Проверить доверие
netdom trust contoso.com /domain:fabrikam.com /verify

# Создать shortcut trust (ускоряет аутентификацию)
netdom trust europe.contoso.com /domain:asia.contoso.com /twoway /add
```

---

## Репликация Active Directory

AD - многомастерная база данных. Каждый DC хранит свою копию и реплицирует изменения на другие DC.

### Контексты именования (Naming Contexts / Partitions)

```
Раздел              Реплицируется                  Содержимое
──────────────────────────────────────────────────────────────────
Domain NC           Все DC одного домена            Пользователи, группы, компьютеры
Configuration NC    Все DC всего леса               Конфигурация сайтов, репликации
Schema NC           Все DC всего леса               Схема классов и атрибутов
Global Catalog      Выбранные DC (GC серверы)       Подмножество атрибутов всех объектов
DNS Application NC  DC с DNS ролью                  Зоны DNS
```

### Механизм репликации

```
Топология репликации строится автоматически алгоритмом KCC
(Knowledge Consistency Checker)

Внутри сайта (Intrasite):
- Уведомление об изменении: 15 секунд
- Использует RPC через IP
- Сжатие: нет

Между сайтами (Intersite):
- По расписанию: по умолчанию каждые 180 минут
- Использует RPC или SMTP
- Сжатие: да (для трафика >50 КБ)

USN (Update Sequence Number) — логические часы репликации
Каждое изменение объекта увеличивает USN на DC
```

```powershell
# Статус репликации
repadmin /showrepl
repadmin /replsummary
repadmin /showrepl DC1

# Принудительная репликация
repadmin /syncall /AdeP
repadmin /replicate DC2 DC1 "DC=contoso,DC=com"

# Найти ошибки репликации
repadmin /showrepl * /csv > replication.csv
repadmin /errorsonly

# Посмотреть партнёров репликации
repadmin /showconn

# Metadata объекта (история изменений)
repadmin /showobjmeta DC1 "CN=John Doe,OU=Users,DC=contoso,DC=com"
```

---

## FSMO роли

FSMO (Flexible Single Master Operations) - 5 специальных ролей, которые выполняет только один DC в каждом домене/лесу.

### Роли уровня леса (одна на весь лес)

| Роль | Что делает |
|------|------------|
| **Schema Master** | Единственный DC, который может изменять схему AD |
| **Domain Naming Master** | Контролирует добавление/удаление доменов в лес |

### Роли уровня домена (одна на каждый домен)

| Роль | Что делает |
|------|------------|
| **PDC Emulator** | Эмулятор PDC, синхронизация времени, блокировки, изменения паролей, GPO |
| **RID Master** | Выдаёт пулы RID (используются для создания SID) |
| **Infrastructure Master** | Обновляет межрезультатные ссылки (cross-domain references) |

```powershell
# Узнать владельцев ролей
netdom query fsmo
Get-ADDomain | Select-Object PDCEmulator, RIDMaster, InfrastructureMaster
Get-ADForest | Select-Object SchemaMaster, DomainNamingMaster

# Перенести роль (graceful transfer)
Move-ADDirectoryServerOperationMasterRole -Identity "DC2" `
    -OperationMasterRole PDCEmulator, RIDMaster

# Захватить роль (seize) — только если старый DC недоступен навсегда!
Move-ADDirectoryServerOperationMasterRole -Identity "DC2" `
    -OperationMasterRole PDCEmulator -Force

# Через ntdsutil (классический способ)
ntdsutil
# roles
# connections
# connect to server DC2
# quit
# seize PDC
```

---

## Global Catalog (GC)

Частичная реплика всех объектов из всех доменов леса. Содержит наиболее часто запрашиваемые атрибуты.

```
Зачем нужен GC:
1. Поиск объектов по всему лесу (без знания их домена)
2. Разрешение UPN при аутентификации (user@contoso.com)
3. Membership в Universal Groups
4. Exchange: поиск получателей по всему лесу

Порты GC:
3268  - LDAP для Global Catalog (нешифрованный)
3269  - LDAPS для Global Catalog (шифрованный)
```

```powershell
# Сделать DC сервером Global Catalog
Set-ADObject -Identity "CN=DC1,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=contoso,DC=com" `
    -Add @{options='1'}

# Проверить GC серверы
Get-ADDomainController -Filter {IsGlobalCatalog -eq $true}

# Поиск объектов через GC
$gc = New-Object DirectoryServices.DirectoryEntry("GC://contoso.com")
```

---

## Схема Active Directory (Schema)

Схема - набор правил, определяющих какие классы объектов и атрибуты существуют в AD.

```
Класс (objectClass):    Атрибуты (attributes):
─────────────────────────────────────────────────────
user                    sAMAccountName, userPrincipalName,
                        givenName, sn, mail, department,
                        memberOf, pwdLastSet, ...

computer                sAMAccountName, dNSHostName,
                        operatingSystem, operatingSystemVersion, ...

group                   sAMAccountName, groupType, member,
                        description, mail, ...

organizationalUnit      ou, description, gPLink, ...
```

```powershell
# Расширение схемы (например, для Exchange)
# Setup.exe /PrepareSchema   ← запускается от Schema Admins

# Просмотр схемы
Get-ADObject -SearchBase (Get-ADRootDSE).schemaNamingContext `
             -Filter {name -like "user"} `
             -Properties * | Select-Object lDAPDisplayName, adminDescription

# Добавить кастомный атрибут (через ADSI Edit или ldifde)
ldifde -i -f custom-attribute.ldf
```

---

## Объекты Active Directory

### Пользователи (User Objects)

```powershell
# Создать пользователя
New-ADUser `
    -Name "John Doe" `
    -GivenName "John" `
    -Surname "Doe" `
    -SamAccountName "john.doe" `
    -UserPrincipalName "john.doe@contoso.com" `
    -Path "OU=IT,DC=contoso,DC=com" `
    -AccountPassword (ConvertTo-SecureString "P@ssw0rd!" -AsPlainText -Force) `
    -Enabled $true `
    -PasswordNeverExpires $false `
    -ChangePasswordAtLogon $true

# Изменить пользователя
Set-ADUser -Identity "john.doe" -Department "IT" -Title "System Administrator"
Set-ADUser -Identity "john.doe" -EmailAddress "j.doe@contoso.com"

# Разблокировать
Unlock-ADAccount -Identity "john.doe"

# Сбросить пароль
Set-ADAccountPassword -Identity "john.doe" `
    -NewPassword (ConvertTo-SecureString "NewP@ss!" -AsPlainText -Force) `
    -Reset

# Отключить/включить
Disable-ADAccount -Identity "john.doe"
Enable-ADAccount -Identity "john.doe"

# Поиск пользователей
Get-ADUser -Filter {Department -eq "IT"} -Properties *
Get-ADUser -Filter {Enabled -eq $false} | Select-Object Name, SamAccountName
Get-ADUser -Identity "john.doe" -Properties MemberOf | Select-Object -ExpandProperty MemberOf
```

### Группы (Group Objects)

```
Типы групп:
┌─────────────────┬────────────────────────────────────────────────┐
│ Security        │ Используется для назначения прав доступа       │
│ Distribution    │ Только для email рассылок (Exchange)           │
└─────────────────┴────────────────────────────────────────────────┘

Области (Scope):
┌──────────────────┬──────────┬────────────────────────────────────┐
│ Domain Local     │ DL       │ Члены из любого домена леса        │
│                  │          │ Используется для назначения прав   │
│                  │          │ только в своём домене              │
├──────────────────┼──────────┼────────────────────────────────────┤
│ Global           │ G        │ Члены только из того же домена     │
│                  │          │ Используется для группировки       │
│                  │          │ пользователей одного домена        │
├──────────────────┼──────────┼────────────────────────────────────┤
│ Universal        │ U        │ Члены из любого домена леса        │
│                  │          │ Хранится в Global Catalog          │
│                  │          │ Для кросс-доменного назначения прав│
└──────────────────┴──────────┴────────────────────────────────────┘

Рекомендованная стратегия: A-G-DL-P
Accounts → Global Groups → Domain Local Groups → Permissions
```

```powershell
# Создать группу
New-ADGroup -Name "IT-Admins" `
    -GroupCategory Security `
    -GroupScope Global `
    -Path "OU=Groups,DC=contoso,DC=com"

# Добавить членов
Add-ADGroupMember -Identity "IT-Admins" -Members "john.doe", "jane.smith"
Add-ADGroupMember -Identity "IT-Admins" -Members (Get-ADUser -Filter {Department -eq "IT"})

# Вложенные группы
Add-ADGroupMember -Identity "DL-FileServer-Read" -Members "IT-Admins"

# Удалить члена
Remove-ADGroupMember -Identity "IT-Admins" -Members "john.doe" -Confirm:$false

# Список членов группы
Get-ADGroupMember -Identity "IT-Admins" -Recursive
```

### Компьютеры (Computer Objects)

```powershell
# Присоединить компьютер к домену (на самом компьютере)
Add-Computer -DomainName "contoso.com" -Credential (Get-Credential) -Restart

# Создать учётную запись компьютера заранее
New-ADComputer -Name "WKS001" -Path "OU=Workstations,DC=contoso,DC=com"

# Поиск компьютеров
Get-ADComputer -Filter {OperatingSystem -like "*Server*"} -Properties OperatingSystem
Get-ADComputer -Filter {LastLogonDate -lt (Get-Date).AddDays(-90)}  # неактивные 90+ дней

# Отключить учётную запись компьютера
Disable-ADAccount -Identity "WKS001$"
```

---

## Аутентификация в AD

### Kerberos

Основной протокол аутентификации в AD (порт 88).

```
Клиент          KDC (DC)              Ресурс
  │                │                     │
  │ 1. AS-REQ      │                     │
  │ (имя+доп.info) │                     │
  │───────────────►│                     │
  │                │                     │
  │ 2. AS-REP      │                     │
  │ (TGT + ключ)   │                     │
  │◄───────────────│                     │
  │                │                     │
  │ 3. TGS-REQ     │                     │
  │ (TGT + SPN)    │                     │
  │───────────────►│                     │
  │                │                     │
  │ 4. TGS-REP     │                     │
  │ (Service Ticket)│                    │
  │◄───────────────│                     │
  │                                      │
  │ 5. AP-REQ (Service Ticket)           │
  │─────────────────────────────────────►│
  │                                      │
  │ 6. Доступ разрешён                   │
  │◄─────────────────────────────────────│

TGT = Ticket Granting Ticket (живёт 10 часов по умолчанию)
SPN = Service Principal Name (идентификатор сервиса)
```

### NTLM - устаревший протокол

NTLM (NT LAN Manager) - используется когда Kerberos недоступен (нет DNS, нет DC, IP вместо имени).

```
Клиент          Сервер          DC
  │               │               │
  │ 1. Negotiate  │               │
  │──────────────►│               │
  │               │               │
  │ 2. Challenge  │               │
  │◄──────────────│               │
  │               │               │
  │ 3. Response   │               │
  │  (NTLM Hash)  │               │
  │──────────────►│               │
  │               │ 4. Verify     │
  │               │──────────────►│
  │               │               │
  │               │ 5. Success    │
  │               │◄──────────────│
  │               │               │
  │ 6. Доступ     │               │
  │◄──────────────│               │
```

---

## Диагностика AD

```powershell
# Основная диагностика
dcdiag                               # полная проверка DC
dcdiag /test:replications            # только репликация
dcdiag /test:dns                     # только DNS
dcdiag /s:DC1 /v                     # конкретный DC, verbose

# Репликация
repadmin /showrepl                   # статус репликации
repadmin /replsummary                # сводка
repadmin /showvector /latency DC1 "DC=contoso,DC=com"

# Информация о домене и лесе
Get-ADDomain
Get-ADForest
Get-ADDomainController -Filter *

# DNS проверка для AD
nslookup -type=SRV _ldap._tcp.contoso.com
nslookup -type=SRV _kerberos._tcp.contoso.com
nslookup -type=SRV _gc._tcp.contoso.com

# Kerberos тикеты
klist                                # текущие тикеты
klist purge                          # очистить тикеты
klist tgt                            # только TGT

# Время (критично для Kerberos — допуск ±5 минут)
w32tm /query /status                 # статус синхронизации
w32tm /resync                        # принудительная синхронизация
w32tm /monitor                       # мониторинг

# Проверить подключение к DC
nltest /dsgetdc:contoso.com
nltest /sc_verify:contoso.com        # проверить secure channel
nltest /sc_reset:contoso.com         # пересоздать secure channel

# Журнал событий AD
Get-WinEvent -LogName "Directory Service" -MaxEvents 50
Get-WinEvent -LogName "Security" | Where-Object {$_.Id -in 4624,4625,4634,4648}
```

---

## Полезные LDAP запросы

```powershell
# LDAP фильтры через Get-ADObject
# Все пользователи с устаревшими паролями (90+ дней)
$date = (Get-Date).AddDays(-90).ToFileTime()
Get-ADUser -LDAPFilter "(&(objectClass=user)(pwdLastSet<=$date)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"

# Пользователи с паролем "Password never expires"
Get-ADUser -Filter {PasswordNeverExpires -eq $true} -Properties PasswordNeverExpires

# Компьютеры под управлением Windows XP (угроза безопасности)
Get-ADComputer -Filter {OperatingSystem -like "*XP*"} -Properties OperatingSystem

# Пустые группы
Get-ADGroup -Filter * | Where-Object {-not (Get-ADGroupMember $_)}

# Пользователи, не входившие в систему более 90 дней
$date = (Get-Date).AddDays(-90)
Get-ADUser -Filter {LastLogonDate -lt $date -and Enabled -eq $true} `
    -Properties LastLogonDate | Select-Object Name, LastLogonDate
```

---

## Шпаргалка

```
Иерархия AD (сверху вниз):
Forest > Tree > Domain > OU > Object

Ключевые файлы DC:
C:\Windows\NTDS\ntds.dit          — база данных AD
C:\Windows\NTDS\*.log             — журналы транзакций
C:\Windows\SYSVOL\                — скрипты, GPT (GPO шаблоны)

Ключевые порты AD:
88    Kerberos
135   RPC Endpoint Mapper
389   LDAP
445   SMB (SYSVOL, NETLOGON)
464   Kerberos password change
636   LDAPS
3268  Global Catalog LDAP
3269  Global Catalog LDAPS
49152-65535  RPC Dynamic Ports

FSMO роли (помни их!):
Лес:  Schema Master, Domain Naming Master
Домен: PDC Emulator, RID Master, Infrastructure Master

Типы групп:
Security vs Distribution
Domain Local / Global / Universal

Доверие по умолчанию:
Parent↔Child:   двустороннее, транзитивное, автоматическое
Разные деревья: двустороннее, транзитивное, автоматическое
Разные леса:    настраивается вручную
```

---

## Ссылки

- [Microsoft Docs: AD DS](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview) - официальная документация
- [Active Directory PowerShell](https://learn.microsoft.com/en-us/powershell/module/activedirectory/) - модуль AD PowerShell
- [repadmin reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc770963(v=ws.11)) - repadmin команды
- [dcdiag reference](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc731968(v=ws.11)) - dcdiag команды
