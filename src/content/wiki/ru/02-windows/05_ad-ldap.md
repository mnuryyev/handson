---
title: "Active Directory - LDAP: структура и запросы"
date: "2026-04-25"
---

LDAP (Lightweight Directory Access Protocol) - протокол доступа к каталогу, через который приложения взаимодействуют с Active Directory. Весь AD по сути - это LDAP-совместимый каталог с расширениями Microsoft.

---

## Основы LDAP в контексте AD

```
Порты:
389   - LDAP (нешифрованный или STARTTLS)
636   - LDAPS (SSL/TLS, устаревший способ)
3268  - Global Catalog LDAP (поиск по всему лесу)
3269  - Global Catalog LDAPS

Версия: LDAP v3 (RFC 4511)

Транспорт:
LDAP  → TCP/UDP 389 (UDP только для connectionless simple bind)
LDAPS → TCP 636 (TLS поверх TCP)
```

---

## Структура каталога - DIT и DN

### Directory Information Tree (DIT)

AD хранит объекты в виде дерева. Каждый объект имеет уникальный Distinguished Name (DN).

```
DC=contoso,DC=com                           ← корень домена
├── CN=Users                                ← встроенный контейнер
│   ├── CN=Alice Smith                      ← пользователь
│   ├── CN=Domain Admins                    ← группа
│   └── CN=Administrator                   ← пользователь
├── CN=Computers                            ← встроенный контейнер
│   └── CN=WORKSTATION01                    ← компьютер
├── OU=IT                                   ← организационная единица
│   ├── OU=Servers
│   │   └── CN=WEB01                        ← компьютер
│   └── OU=Users
│       └── CN=Bob Jones                    ← пользователь
├── CN=System                               ← системный контейнер
└── CN=Configuration                        ← конфигурация (отдельный NC)
```

### Distinguished Name (DN)

```
DN строится справа налево от корня:

CN=Alice Smith,OU=Users,OU=IT,DC=contoso,DC=com
│              │         │    └────────────────── суффикс домена (Naming Context)
│              │         └───────────────────── OU "IT"
│              └─────────────────────────────── OU "Users" внутри IT
└────────────────────────────────────────────── сам объект пользователя

Компоненты RDN (Relative Distinguished Name):
CN  — Common Name     (имена объектов, групп, пользователей)
OU  — Organizational Unit
DC  — Domain Component  (части доменного имени)
O   — Organization
L   — Locality
C   — Country
```

### Naming Contexts (NC) в AD

```
Каждый DC хранит несколько разделов:

DC=contoso,DC=com                           ← Domain NC (основной)
CN=Configuration,DC=contoso,DC=com          ← Configuration NC (весь лес)
CN=Schema,CN=Configuration,DC=contoso,DC=com ← Schema NC (весь лес)
DC=DomainDnsZones,DC=contoso,DC=com         ← Application NC (DNS)
DC=ForestDnsZones,DC=contoso,DC=com         ← Application NC (DNS лес)
```

```bash
# Получить rootDSE — информация о сервере
ldapsearch -H ldap://dc01.contoso.com -x -b "" -s base "(objectClass=*)"
# Ответ:
# namingContexts: DC=contoso,DC=com
# namingContexts: CN=Configuration,DC=contoso,DC=com
# namingContexts: CN=Schema,CN=Configuration,DC=contoso,DC=com
# defaultNamingContext: DC=contoso,DC=com
# schemaNamingContext: CN=Schema,CN=Configuration,DC=contoso,DC=com
# configurationNamingContext: CN=Configuration,DC=contoso,DC=com
# rootDomainNamingContext: DC=contoso,DC=com
# dnsHostName: dc01.contoso.com
# ldapServiceName: contoso.com:dc01$@CONTOSO.COM
# supportedLDAPVersion: 3
```

---

## Объекты и атрибуты

### Основные классы объектов

```
objectClass определяет тип объекта и набор допустимых атрибутов.

user           - пользователь домена
computer       - компьютер в домене  (наследует от user!)
group          - группа безопасности или рассылки
organizationalUnit - контейнер OU
contact        - контакт (без учётной записи)
container      - обычный контейнер (CN=Users, CN=Computers)
domainDNS      - домен
builtinDomain  - встроенный контейнер (CN=Builtin)
trustedDomain  - доверие домена
serviceConnectionPoint - точка подключения сервиса
```

### Ключевые атрибуты объекта user

```
Идентификация:
sAMAccountName     - логин (CONTOSO\alice)
userPrincipalName  - UPN (alice@contoso.com)
distinguishedName  - полный DN
objectSID          - SID безопасности (S-1-5-21-...)
objectGUID         - GUID (неизменяемый идентификатор)

Личные данные:
cn                 - Common Name (Alice Smith)
givenName          - имя (Alice)
sn                 - фамилия (Smith)
displayName        - отображаемое имя
mail               - email
telephoneNumber    - телефон
department         - отдел
title              - должность
company            - компания
manager            - ссылка на DN менеджера
memberOf           - список DN групп (многозначный)

Аутентификация:
userAccountControl - флаги аккаунта (disabled, locked, etc.)
pwdLastSet         - дата смены пароля (FILETIME)
accountExpires     - дата истечения аккаунта (FILETIME)
lockoutTime        - время блокировки (FILETIME)
badPwdCount        - неверных попыток
lastLogon          - последний вход (только локальный DC!)
lastLogonTimestamp - последний вход (реплицируется, ~14 дней)

Технические:
objectClass        - классы объекта (многозначный)
whenCreated        - дата создания (GeneralizedTime)
whenChanged        - дата изменения
uSNCreated         - USN создания (для репликации)
uSNChanged         - USN изменения
```

### Синтаксис атрибутов

```
Важные типы значений:

FILETIME          - 100-нс интервалы с 01.01.1601
                    0 = "никогда" (для accountExpires)
                    9999999999999999 = "никогда не истекает"
                    Конвертация: (значение / 10000000) - 11644473600 = Unix timestamp

GeneralizedTime   - YYYYMMDDHHmmSS.0Z
                    Пример: 20240115102233.0Z

Boolean           - TRUE / FALSE

Integer           - целое число

BitString         - битовое поле (userAccountControl)

DN                - Distinguished Name ссылка на другой объект

SID               - Binary (16+ байт)

GUID              - Binary (16 байт), отображается как {xxxxxxxx-xxxx-...}
```

---

## LDAP запросы - синтаксис фильтров

### Базовый синтаксис фильтра

```
(атрибут=значение)         - точное равенство
(атрибут>=значение)        - больше или равно
(атрибут<=значение)        - меньше или равно
(атрибут=*)                - атрибут существует (присутствует)
(атрибут~=значение)        - приближённое совпадение
(!(фильтр))                - NOT
(&(фильтр1)(фильтр2))      - AND
(|(фильтр1)(фильтр2))      - OR
(атрибут=*подстрока*)      - поиск подстроки
(атрибут=начало*)          - начинается с
(атрибут=*конец)           - заканчивается на
```

### Специальный синтаксис OID (битовые операции)

```
Для битовых полей (userAccountControl):
атрибут:1.2.840.113556.1.4.803:=значение   - AND (бит установлен)
атрибут:1.2.840.113556.1.4.804:=значение   - OR (любой бит установлен)
атрибут:1.2.840.113556.1.4.1941:=DN        - рекурсивное членство в группе

Примеры:
(userAccountControl:1.2.840.113556.1.4.803:=2)      - аккаунт отключён (бит 2)
(userAccountControl:1.2.840.113556.1.4.803:=65536)  - пароль не истекает
(member:1.2.840.113556.1.4.1941:=CN=alice,DC=...)   - рекурсивно член группы
```

### Практические фильтры

```ldap
# Все пользователи домена
(objectClass=user)

# Все пользователи (не компьютеры — они тоже objectClass=user)
(&(objectClass=user)(objectCategory=person))

# Только компьютеры
(objectClass=computer)

# Только группы
(objectClass=group)

# Только OU
(objectClass=organizationalUnit)

# Активные пользователи (не отключённые)
(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))

# Отключённые аккаунты
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))

# Пользователи с паролем "никогда не истекает"
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=65536))

# Заблокированные аккаунты
(&(objectClass=user)(lockoutTime>=1))

# Пользователи без PreAuth (уязвимы к AS-REP Roasting)
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))

# Пользователи с SPN (уязвимы к Kerberoasting)
(&(objectClass=user)(servicePrincipalName=*))

# Пользователи в конкретном отделе
(&(objectClass=user)(department=IT))

# Пользователи с именем начинающимся на "Al"
(&(objectClass=user)(sAMAccountName=Al*))

# Пользователи с email в домене
(&(objectClass=user)(mail=*@contoso.com))

# Пользователи не входившие более 90 дней
# lastLogonTimestamp в FILETIME: текущее время - 90 дней
(&(objectClass=user)(lastLogonTimestamp<=133500000000000000))

# Компьютеры под управлением Windows Server
(&(objectClass=computer)(operatingSystem=Windows Server*))

# Члены конкретной группы (прямые)
(memberOf=CN=Domain Admins,CN=Users,DC=contoso,DC=com)

# Рекурсивное членство (включая вложенные группы)
(memberOf:1.2.840.113556.1.4.1941:=CN=Domain Admins,CN=Users,DC=contoso,DC=com)

# Найти объекты изменённые за последние N дней
(whenChanged>=20240101000000.0Z)

# SPN для HTTP сервисов (Kerberoasting цели)
(&(objectClass=user)(servicePrincipalName=http/*))

# Пользователи с неограниченным делегированием
(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=524288))
```

---

## Параметры поиска LDAP

### Base DN, Scope, Filter, Attributes

```
LDAP запрос состоит из:
1. Base DN   - откуда искать
2. Scope     - глубина поиска
3. Filter    - что искать
4. Attributes - какие атрибуты вернуть

Scope:
base        - только сам объект Base DN
one         - только непосредственные дочерние объекты
sub (subtree) - всё поддерево (по умолчанию, рекурсивно)
```

---

## Инструменты LDAP запросов

### ldapsearch (Linux)

```bash
# Установка
apt install ldap-utils

# Синтаксис:
ldapsearch -H ldap://server -D "bindDN" -w password -b "baseDN" -s scope "filter" attributes

# Анонимный запрос (как правило запрещён в AD)
ldapsearch -H ldap://dc01.contoso.com -x -b "" -s base "(objectClass=*)"

# Аутентификация по паролю
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" \
    -w "MyPassword" \
    -b "DC=contoso,DC=com" \
    "(objectClass=user)" \
    sAMAccountName displayName mail

# Kerberos аутентификация (через ccache)
kinit alice@CONTOSO.COM
ldapsearch -H ldap://dc01.contoso.com \
    -Y GSSAPI \
    -b "DC=contoso,DC=com" \
    "(&(objectClass=user)(department=IT))" \
    sAMAccountName displayName

# LDAPS (SSL)
ldapsearch -H ldaps://dc01.contoso.com \
    -D "alice@contoso.com" \
    -w "MyPassword" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=alice)"

# Получить конкретного пользователя
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=bob.jones)" \
    "*"                          # все атрибуты

# Найти группы пользователя
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(sAMAccountName=alice)" \
    memberOf

# Пагинация результатов (PagedResultsControl)
ldapsearch -H ldap://dc01.contoso.com \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    -E pr=1000/noprompt \        # страницы по 1000 объектов
    "(objectClass=user)" \
    sAMAccountName

# Global Catalog (поиск по всему лесу)
ldapsearch -H ldap://dc01.contoso.com:3268 \
    -D "alice@contoso.com" -w "password" \
    -b "DC=contoso,DC=com" \
    "(mail=bob@fabrikam.com)" \
    sAMAccountName

# Атрибуты только для чтения сервера (rootDSE)
ldapsearch -H ldap://dc01.contoso.com -x -b "" -s base "+" 
# + запрашивает operational attributes
```

### PowerShell - Get-ADObject (самый удобный в домене)

```powershell
Import-Module ActiveDirectory

# ─── Поиск через Get-ADUser ───
# Базовый поиск
Get-ADUser -Filter {SamAccountName -eq "alice.smith"}

# LDAP фильтр (быстрее для сложных запросов)
Get-ADUser -LDAPFilter "(&(objectClass=user)(department=IT))"

# Все атрибуты
Get-ADUser -Identity "alice.smith" -Properties *

# Конкретные атрибуты
Get-ADUser -Filter * -Properties DisplayName, Department, Mail, LastLogonDate |
    Select-Object Name, DisplayName, Department, Mail, LastLogonDate

# ─── Поиск через Get-ADObject (универсальный) ───
# Найти любой тип объекта
Get-ADObject -LDAPFilter "(objectClass=*)" -SearchBase "OU=IT,DC=contoso,DC=com"

# Найти пользователей с SPN
Get-ADObject -LDAPFilter "(&(objectClass=user)(servicePrincipalName=*))" `
    -Properties servicePrincipalName

# ─── Прямой LDAP через .NET ───
$searcher = New-Object DirectoryServices.DirectorySearcher
$searcher.SearchRoot = New-Object DirectoryServices.DirectoryEntry("LDAP://DC=contoso,DC=com")
$searcher.Filter = "(&(objectClass=user)(department=IT))"
$searcher.PropertiesToLoad.AddRange(@("sAMAccountName","displayName","mail","memberOf"))
$searcher.PageSize = 1000   # пагинация
$searcher.SizeLimit = 0     # без лимита

$results = $searcher.FindAll()
foreach ($result in $results) {
    [PSCustomObject]@{
        Login   = $result.Properties["samaccountname"][0]
        Name    = $result.Properties["displayname"][0]
        Email   = $result.Properties["mail"][0]
        Groups  = $result.Properties["memberof"] -join "; "
    }
}
$results.Dispose()

# ─── Global Catalog поиск ───
$gc = New-Object DirectoryServices.DirectoryEntry("GC://contoso.com")
$gcSearcher = New-Object DirectoryServices.DirectorySearcher($gc)
$gcSearcher.Filter = "(mail=bob@fabrikam.com)"
$gcSearcher.FindOne()
```

### Python - ldap3

```python
import ldap3
from ldap3 import Server, Connection, ALL, NTLM, KERBEROS, SASL

# Подключение с паролем
server = ldap3.Server("dc01.contoso.com", port=636, use_ssl=True, get_info=ALL)
conn = ldap3.Connection(
    server,
    user="contoso\\alice",
    password="MyPassword",
    authentication=ldap3.NTLM,
    auto_bind=True
)

# Простой поиск
conn.search(
    search_base="DC=contoso,DC=com",
    search_filter="(&(objectClass=user)(department=IT))",
    attributes=["sAMAccountName", "displayName", "mail", "memberOf"]
)

for entry in conn.entries:
    print(f"Login: {entry.sAMAccountName}")
    print(f"Name:  {entry.displayName}")
    print(f"Email: {entry.mail}")
    print(f"Groups: {entry.memberOf}")
    print()

# Kerberos аутентификация
conn = ldap3.Connection(
    server,
    authentication=SASL,
    sasl_mechanism=KERBEROS,
    auto_bind=True
)

# Поиск с пагинацией
from ldap3 import SUBTREE
conn.search(
    search_base="DC=contoso,DC=com",
    search_filter="(objectClass=user)",
    search_scope=SUBTREE,
    attributes=["*"],
    paged_size=1000
)

# Изменить атрибут
conn.modify(
    "CN=Alice Smith,OU=IT,DC=contoso,DC=com",
    {"telephoneNumber": [ldap3.MODIFY_REPLACE, ["+7-495-000-0001"]]}
)

# Создать пользователя
conn.add(
    "CN=New User,OU=IT,DC=contoso,DC=com",
    object_class=["top", "person", "organizationalPerson", "user"],
    attributes={
        "sAMAccountName": "new.user",
        "userPrincipalName": "new.user@contoso.com",
        "displayName": "New User",
        "givenName": "New",
        "sn": "User",
    }
)

conn.unbind()
```

### ADSI Edit (GUI) и LDP.exe

```
ADSI Edit (adsiedit.msc):
- GUI инструмент для просмотра и редактирования любых атрибутов AD
- Может редактировать скрытые атрибуты
- Опасен: нет проверок валидности значений

LDP.exe:
- Встроенный LDAP клиент Microsoft
- Показывает raw LDAP операции и ответы
- Полезен для отладки

Запуск:
adsiedit.msc    → ADSI Edit
ldp.exe         → LDP
```

---

## Примеры практических запросов

### Инвентаризация

```powershell
# Все пользователи с деталями в CSV
Get-ADUser -Filter * -Properties * |
    Select-Object sAMAccountName, DisplayName, EmailAddress, Department, `
        Title, Manager, Enabled, PasswordLastSet, LastLogonDate, `
        PasswordNeverExpires, LockedOut |
    Export-Csv -Path "C:\users_inventory.csv" -NoTypeInformation -Encoding UTF8

# Все компьютеры с ОС
Get-ADComputer -Filter * -Properties OperatingSystem, OperatingSystemVersion, `
    LastLogonDate, IPv4Address |
    Select-Object Name, OperatingSystem, OperatingSystemVersion, `
        LastLogonDate, IPv4Address |
    Export-Csv "C:\computers.csv" -NoTypeInformation

# Все группы с членами
Get-ADGroup -Filter * | ForEach-Object {
    $group = $_
    Get-ADGroupMember $group -Recursive | ForEach-Object {
        [PSCustomObject]@{
            GroupName = $group.Name
            MemberName = $_.Name
            MemberType = $_.objectClass
        }
    }
} | Export-Csv "C:\group_members.csv" -NoTypeInformation
```

### Безопасность и аудит

```powershell
# Найти пользователей с опасными настройками
$dangerous = Get-ADUser -Filter * -Properties * | Where-Object {
    $_.PasswordNeverExpires -eq $true -or
    $_.DoesNotRequirePreAuth -eq $true -or
    ($_.ServicePrincipalNames -ne $null -and $_.ServicePrincipalNames.Count -gt 0)
} | Select-Object sAMAccountName, Enabled,
    PasswordNeverExpires, DoesNotRequirePreAuth, ServicePrincipalNames

$dangerous | Format-Table

# Найти аккаунты компьютеров с Unconstrained Delegation
Get-ADComputer -Filter * -Properties TrustedForDelegation |
    Where-Object {$_.TrustedForDelegation -eq $true} |
    Select-Object Name, DistinguishedName

# Найти пользователей с adminCount=1 (защищены AdminSDHolder)
Get-ADUser -LDAPFilter "(adminCount=1)" -Properties adminCount |
    Select-Object sAMAccountName, DistinguishedName

# Сравнить членство в группе между датами (экспорт и diff)
Get-ADGroupMember "Domain Admins" -Recursive |
    Select-Object Name, SamAccountName |
    Export-Csv "C:\domain_admins_$(Get-Date -Format yyyyMMdd).csv" -NoTypeInformation
```

### Работа с FILETIME датами

```powershell
# Конвертировать lastLogonTimestamp в дату
function Convert-FileTime {
    param([long]$fileTime)
    if ($fileTime -eq 0 -or $fileTime -eq 9223372036854775807) {
        return "Never"
    }
    [DateTime]::FromFileTime($fileTime)
}

# Пользователи не входившие более 90 дней
$cutoff = (Get-Date).AddDays(-90).ToFileTime()
Get-ADUser -Filter * -Properties lastLogonTimestamp |
    Where-Object {
        $_.lastLogonTimestamp -lt $cutoff -or
        $_.lastLogonTimestamp -eq $null
    } |
    Select-Object sAMAccountName, @{
        N="LastLogon"
        E={ Convert-FileTime ($_.lastLogonTimestamp) }
    }

# Через LDAP фильтр (быстрее для больших доменов)
$cutoffLDAP = $cutoff.ToString()
Get-ADUser -LDAPFilter "(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(lastLogonTimestamp<=$cutoffLDAP))" `
    -Properties lastLogonTimestamp |
    Select-Object sAMAccountName, @{N="LastLogon"; E={[DateTime]::FromFileTime($_.lastLogonTimestamp)}}
```

---

## LDAP через Python для интеграций

```python
#!/usr/bin/env python3
"""
Модуль для работы с AD через LDAP
"""
import ldap3
from datetime import datetime, timezone

class ADConnector:
    def __init__(self, server: str, username: str, password: str,
                 base_dn: str, use_ssl: bool = True):
        self.base_dn = base_dn
        srv = ldap3.Server(server, port=636 if use_ssl else 389,
                           use_ssl=use_ssl, get_info=ldap3.ALL)
        self.conn = ldap3.Connection(
            srv, user=username, password=password,
            authentication=ldap3.NTLM, auto_bind=True
        )

    def get_user(self, username: str) -> dict | None:
        self.conn.search(
            self.base_dn,
            f"(sAMAccountName={username})",
            attributes=["sAMAccountName", "displayName", "mail",
                        "department", "title", "memberOf",
                        "userAccountControl", "pwdLastSet", "lastLogonTimestamp"]
        )
        if not self.conn.entries:
            return None
        entry = self.conn.entries[0]
        return {
            "login":       str(entry.sAMAccountName),
            "name":        str(entry.displayName),
            "email":       str(entry.mail),
            "department":  str(entry.department),
            "title":       str(entry.title),
            "groups":      [str(g) for g in entry.memberOf],
            "enabled":     not bool(int(str(entry.userAccountControl)) & 2),
            "pwd_last_set": self._filetime_to_datetime(entry.pwdLastSet.value),
        }

    def find_users(self, filter_str: str, attributes: list = None) -> list:
        attrs = attributes or ["sAMAccountName", "displayName", "mail", "department"]
        self.conn.search(
            self.base_dn,
            f"(&(objectClass=user)(objectCategory=person){filter_str})",
            attributes=attrs,
            paged_size=1000
        )
        return self.conn.entries

    def is_member_of(self, username: str, group_dn: str) -> bool:
        """Рекурсивная проверка членства в группе"""
        self.conn.search(
            self.base_dn,
            f"(&(sAMAccountName={username})"
            f"(memberOf:1.2.840.113556.1.4.1941:={group_dn}))",
            attributes=["sAMAccountName"]
        )
        return len(self.conn.entries) > 0

    @staticmethod
    def _filetime_to_datetime(filetime) -> datetime | None:
        if filetime is None or filetime == 0:
            return None
        try:
            ts = int(str(filetime))
            unix_ts = (ts / 10_000_000) - 11_644_473_600
            return datetime.fromtimestamp(unix_ts, tz=timezone.utc)
        except (ValueError, OSError):
            return None

    def close(self):
        self.conn.unbind()


# Использование:
ad = ADConnector(
    server="dc01.contoso.com",
    username="contoso\\svc-app",
    password="ServiceP@ss!",
    base_dn="DC=contoso,DC=com"
)

user = ad.get_user("alice.smith")
print(user)

it_users = ad.find_users("(department=IT)")
for u in it_users:
    print(u.sAMAccountName, u.displayName)

is_admin = ad.is_member_of("alice.smith",
    "CN=Domain Admins,CN=Users,DC=contoso,DC=com")
print(f"Is Domain Admin: {is_admin}")

ad.close()
```

---

## Безопасность LDAP в AD

```powershell
# LDAP Signing - защита от MITM атак
# Без signing: атакующий может изменить LDAP ответы
# Без channel binding: relay атаки на LDAPS

# Включить обязательное подписывание LDAP на DC
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LDAPServerIntegrity" `
    -Value 2 -Type DWord   # 0=None, 1=Negotiate, 2=Require

# Включить Channel Binding для LDAPS
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LdapEnforceChannelBinding" `
    -Value 2 -Type DWord   # 0=Never, 1=When Supported, 2=Always

# Аудит LDAP запросов (для выявления credential harvest)
# Event 2889 - unsigned LDAP bind attempt
# Event 3040 - unsigned LDAP operations

# Включить логирование LDAP
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics" `
    -Name "16 LDAP Interface Events" `
    -Value 2 -Type DWord

# Мониторинг подозрительных LDAP запросов
Get-WinEvent -FilterHashtable @{
    LogName = "Directory Service"
    Id = 2889
} | Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## Шпаргалка по LDAP фильтрам

```ldap
# Объекты
(objectClass=user)                          - все user объекты (вкл. компьютеры)
(&(objectClass=user)(objectCategory=person)) - только пользователи
(objectClass=computer)                       - компьютеры
(objectClass=group)                          - группы
(objectClass=organizationalUnit)             - OU

# Состояние аккаунта
(!(userAccountControl:1.2.840.113556.1.4.803:=2))  - активные
(userAccountControl:1.2.840.113556.1.4.803:=2)     - отключённые
(lockoutTime>=1)                                    - заблокированные
(pwdLastSet=0)                                      - никогда не меняли пароль

# Безопасность
(servicePrincipalName=*)                  — есть SPN (Kerberoasting)
(userAccountControl:1.2.840.113556.1.4.803:=4194304)  - нет PreAuth
(userAccountControl:1.2.840.113556.1.4.803:=524288)   - unconstrained delegation
(adminCount=1)                            — защищён AdminSDHolder

# Группы
(memberOf=CN=Group,DC=domain,DC=com)      — прямой член
(memberOf:1.2.840.113556.1.4.1941:=CN=Group,DC=...)  — рекурсивный член

# Поиск
(sAMAccountName=alice*)                   — логин начинается с alice
(displayName=*Smith*)                     — имя содержит Smith
(mail=*@contoso.com)                      — email в домене

# Время
(whenChanged>=20240101000000.0Z)          — изменены после 01.01.2024
(lastLogonTimestamp<=133500000000000000)  — давно не входили
```

---

## Ссылки

- [RFC 4511](https://www.rfc-editor.org/rfc/rfc4511) - LDAP v3 спецификация
- [MS-ADTS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts) - AD Technical Specification
- [ldap3 Python](https://ldap3.readthedocs.io/) - документация ldap3
- [AD LDAP Filters](https://ldapwiki.com/wiki/LDAP%20Query%20Examples) - примеры фильтров
- [UserAccountControl](https://support.microsoft.com/en-us/topic/how-to-use-the-useraccountcontrol-flags-to-manipulate-user-account-properties-902d9292-a06e-5ca5-c4e7-b01e7b71e2c6) - флаги userAccountControl
