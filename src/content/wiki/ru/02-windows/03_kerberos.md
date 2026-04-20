---
title: "Active Directory - Kerberos аутентификация (TGT, TGS)"
date: "2026-04-20"
---

Kerberos - протокол сетевой аутентификации, основанный на симметричном шифровании и доверенной третьей стороне (KDC). В Active Directory Kerberos v5 является основным протоколом аутентификации, заменившим NTLM.

---

## Зачем Kerberos - проблемы которые он решает

```
Без Kerberos (NTLM):
─────────────────────────────────────────────────────────────────
Клиент → пароль/хэш → Сервер → пересылает → DC → проверяет → OK

Проблемы NTLM:
Сервер знает хэш пользователя
Каждый ресурс обращается к DC для проверки
Pass-the-Hash атаки
Нет взаимной аутентификации (сервер не аутентифицируется клиенту)
Нет авторизации - только "ты — это ты"

С Kerberos:
─────────────────────────────────────────────────────────────────
Пароль никогда не передаётся по сети
Single Sign-On - один раз вошёл, доступ ко всем ресурсам
Взаимная аутентификация - и клиент, и сервер подтверждают друг друга
Делегирование - сервис может действовать от имени пользователя
Ограниченные тикеты - права ограничены временем и ресурсом
DC не участвует в каждом запросе к ресурсу
```

---

## Ключевые компоненты

```
KDC (Key Distribution Center) - центр распределения ключей
├── AS (Authentication Service)  - выдаёт TGT
└── TGS (Ticket Granting Service) - выдаёт Service Tickets

В Active Directory KDC = Domain Controller

TGT (Ticket Granting Ticket)    - "пропуск" для получения других тикетов
                                  Шифруется ключом krbtgt аккаунта DC
Service Ticket (ST)             - тикет для доступа к конкретному сервису
                                  Шифруется ключом сервисного аккаунта

SPN (Service Principal Name)    - уникальный идентификатор сервиса
                                  Формат: ServiceClass/Host:Port/ServiceName
                                  Пример: HTTP/webserver.contoso.com:80

krbtgt                          - специальный аккаунт KDC
                                  Его пароль шифрует все TGT в домене
                                  Сброс krbtgt инвалидирует все TGT
```

---

## Полный процесс Kerberos аутентификации

### Шаг 1: AS-REQ - запрос TGT

```
Клиент (alice)                              KDC (DC)
                                        AS - Auth Service

1. Пользователь вводит пароль
2. Клиент вычисляет ключ = PBKDF2(пароль + salt)

alice ──── AS-REQ ──────────────────────────────► KDC
           ┌────────────────────────────────────┐
           │ Username: alice                    │
           │ Timestamp (зашифрован ключом alice)│  ← PreAuth
           │ Realm: CONTOSO.COM                 │
           │ Requested ticket lifetime: 10h     │
           └────────────────────────────────────┘

Важно: PreAuthentication
Клиент шифрует временную метку своим ключом.
KDC расшифровывает → убеждается что клиент знает пароль.
Защита от offline атак на хэш (AS-REP Roasting без PreAuth).
```

### Шаг 2: AS-REP - получение TGT

```
KDC (AS) ──── AS-REP ──────────────────────────► alice
              ┌──────────────────────────────────────────┐
              │ Часть 1: зашифровано ключом alice:       │
              │   - Session Key (TGS Session Key)        │
              │   - TGT lifetime                         │
              │   - Информация о пользователе            │
              │                                          │
              │ Часть 2: TGT (зашифровано ключом krbtgt):│
              │   - Username: alice                      │
              │   - Client IP/realm                      │
              │   - Timestamp                            │
              │   - TGT lifetime (обычно 10 часов)       │
              │   - Session Key                          │
              │   - PAC (Privilege Attribute Certificate) │
              └──────────────────────────────────────────┘

TGT хранится в памяти клиента.
Клиент НЕ может расшифровать TGT (он зашифрован krbtgt).
```

### PAC - Privilege Attribute Certificate

```
PAC вложен в TGT и содержит:
┌──────────────────────────────────────────────────────────┐
│ User SID:             S-1-5-21-xxx-1001                  │
│ Group SIDs:           Domain Users, IT-Admins, ...       │
│ Account flags:        enabled, not locked, ...           │
│ Account expiry:       date                               │
│ Password last changed: date                              │
│ Logon hours                                              │
│ Подписан цифровой подписью KDC                           │
└──────────────────────────────────────────────────────────┘

PAC содержит информацию о членстве в группах →
используется для авторизации к ресурсам.
При изменении членства в группах нужно получить новый TGT!
(выйти и войти снова)
```

### Шаг 3: TGS-REQ - запрос Service Ticket

```
alice ──── TGS-REQ ─────────────────────────────► KDC
           ┌─────────────────────────────────────┐    TGS
           │ TGT (непрозрачен для клиента)        │
           │ Authenticator:                       │
           │   Username: alice                    │
           │   Timestamp: now                     │
           │   (зашифрован TGS Session Key)       │
           │ SPN: HTTP/webserver.contoso.com      │
           │ Requested lifetime                   │
           └─────────────────────────────────────┘

KDC расшифровывает TGT ключом krbtgt →
извлекает TGS Session Key →
расшифровывает Authenticator →
проверяет timestamp (должен быть свежим, ±5 минут).
```

### Шаг 4: TGS-REP - получение Service Ticket

```
KDC (TGS) ──── TGS-REP ────────────────────────► alice
               ┌────────────────────────────────────────────┐
               │ Часть 1: зашифровано TGS Session Key:      │
               │   - Service Session Key                    │
               │   - Service Ticket lifetime                │
               │                                            │
               │ Часть 2: Service Ticket                    │
               │   (зашифровано ключом сервиса):            │
               │   - Username: alice                        │
               │   - Client IP/realm                        │
               │   - Timestamp                              │
               │   - Lifetime                               │
               │   - Service Session Key                    │
               │   - PAC (копия из TGT)                     │
               └────────────────────────────────────────────┘
```

### Шаг 5: AP-REQ - доступ к ресурсу

```
alice ──── AP-REQ ──────────────────────────────► WebServer
           ┌────────────────────────────────────┐
           │ Service Ticket (непрозрачен)        │
           │ Authenticator:                      │
           │   Username: alice                   │
           │   Timestamp: now                    │
           │   (зашифрован Service Session Key)  │
           └────────────────────────────────────┘

WebServer расшифровывает Service Ticket своим ключом →
извлекает Service Session Key →
расшифровывает Authenticator →
проверяет timestamp →
читает PAC → проверяет права.
```

### Шаг 6: AP-REP — взаимная аутентификация

```
WebServer ──── AP-REP ──────────────────────────► alice
               ┌──────────────────────────────────┐
               │ Timestamp + 1                    │
               │ (зашифровано Service Session Key)│
               └──────────────────────────────────┘

Alice проверяет что сервер знает Service Session Key →
убеждается что говорит с настоящим сервером, а не MITM.
```

### Полная схема в одной картине

```
alice           KDC (DC)         FileServer
  │                │                  │
  │──AS-REQ───────►│                  │
  │◄──AS-REP──────│ (TGT)            │
  │                │                  │
  │──TGS-REQ──────►│                  │
  │   (TGT + SPN)  │                  │
  │◄──TGS-REP─────│ (Service Ticket) │
  │                │                  │
  │──AP-REQ──────────────────────────►│
  │   (Service Ticket + Authenticator)│
  │◄──AP-REP──────────────────────────│
  │   (Mutual Auth)                   │
  │                                   │
  │◄══════════ Работаем ══════════════►│
  │        (DC больше не нужен)        │
```

---

## Кэширование тикетов

```
TGT (Ticket Granting Ticket):
- Время жизни: 10 часов (по умолчанию в AD)
- Renewable: до 7 дней (можно обновить без пароля)
- Хранится в LSASS (memory) на Windows
- Хранится в ccache файле на Linux (/tmp/krb5cc_<uid>)

Service Ticket:
- Время жизни: 10 часов
- Кэшируется в Kerberos Ticket Cache
- При следующем обращении к тому же ресурсу используется кэш

Клиентский кэш тикетов:
Windows: C:\Windows\System32\lsass.exe (в памяти)
Linux:   /tmp/krb5cc_1000 (или $KRB5CCNAME)
```

---

## Работа с тикетами в Windows

```powershell
# Просмотреть тикеты в текущей сессии
klist

# Вывод:
# Cached Tickets: (4)
#
# #0>     Client: alice @ CONTOSO.COM
#         Server: krbtgt/CONTOSO.COM @ CONTOSO.COM
#         KerbTicket Encryption Type: AES-256-CTS-HMAC-SHA1-96
#         Ticket Flags 0x40e10000 -> forwardable renewable initial
#         Start Time: 1/15/2024 10:00:00 (local)
#         End Time:   1/15/2024 20:00:00 (local)
#         Renew Time: 1/22/2024 10:00:00 (local)
#
# #1>     Client: alice @ CONTOSO.COM
#         Server: HTTP/webserver.contoso.com @ CONTOSO.COM
#         KerbTicket Encryption Type: AES-256-CTS-HMAC-SHA1-96
#         Ticket Flags 0x40a10000 -> forwardable renewable
#         Start Time: 1/15/2024 10:05:00 (local)
#         End Time:   1/15/2024 20:05:00 (local)

# Очистить тикеты (принудить переаутентификацию)
klist purge

# Только TGT
klist tgt

# Тикеты конкретной сессии
klist sessions
klist -li 0x3e7     # Local System сессия

# Информация о Kerberos в домене
nltest /sc_query:CONTOSO
```

---

## SPN - Service Principal Names

SPN - идентификатор сервиса в AD. KDC использует SPN чтобы найти нужный сервисный аккаунт и зашифровать Service Ticket.

### Формат SPN

```
ServiceClass/Host:Port/ServiceName

Примеры:
HTTP/webserver.contoso.com              - веб-сервис
HTTP/webserver.contoso.com:8080        - нестандартный порт
HOST/pc001.contoso.com                  - общий хост сервис
MSSQLSvc/sql01.contoso.com:1433        - SQL Server
SMTP/mail.contoso.com                   - почтовый сервер
LDAP/dc01.contoso.com                   - LDAP на DC
GC/dc01.contoso.com                     - Global Catalog
RestrictedKrbHost/pc001.contoso.com     - ограниченное делегирование
```

### Управление SPN

```powershell
# Просмотреть SPN пользователя/компьютера
Get-ADUser -Identity "svc-webapp" -Properties ServicePrincipalNames |
    Select-Object -ExpandProperty ServicePrincipalNames

Get-ADComputer -Identity "webserver" -Properties ServicePrincipalNames |
    Select-Object -ExpandProperty ServicePrincipalNames

# Добавить SPN
Set-ADUser -Identity "svc-webapp" -Add @{ServicePrincipalNames = "HTTP/webapp.contoso.com"}
Set-ADUser -Identity "svc-webapp" -Add @{ServicePrincipalNames = "HTTP/webapp.contoso.com:8080"}

# Через setspn.exe
setspn -S HTTP/webapp.contoso.com svc-webapp    # -S проверяет дубли!
setspn -L svc-webapp                             # список SPN
setspn -D HTTP/webapp.contoso.com svc-webapp     # удалить

# Найти дублирующиеся SPN (проблема!)
setspn -X
setspn -F -X     # по всему лесу

# Найти все HTTP SPN в домене
Get-ADUser -Filter {ServicePrincipalNames -like "HTTP/*"} -Properties ServicePrincipalNames |
    Select-Object Name, ServicePrincipalNames

Get-ADComputer -Filter {ServicePrincipalNames -like "MSSQLSvc/*"} -Properties ServicePrincipalNames
```

---

## Делегирование Kerberos

Делегирование позволяет сервису выступать от имени пользователя при обращении к другим ресурсам.

### Типы делегирования

```
Unconstrained Delegation (Неограниченное делегирование):
───────────────────────────────────────────────────────
Сервер может делегировать к ЛЮБОМУ сервису.
TGT пользователя хранится на сервере.

ОПАСНО! Компрометация сервера = все TGT скомпрометированы.
Использовать только на DC (где это неизбежно).

Constrained Delegation (Ограниченное делегирование):
───────────────────────────────────────────────────────
Сервер может делегировать только к УКАЗАННЫМ сервисам.
TGT НЕ хранится. Используется S4U2Proxy.

Resource-Based Constrained Delegation (RBCD):
───────────────────────────────────────────────────────
Разрешение настраивается на ресурсе (не на делегирующем сервере).
Введено в Windows Server 2012.
Используется в Kubernetes, cloud сценариях.
```

### Настройка делегирования

```powershell
# Unconstrained Delegation - разрешить серверу делегировать куда угодно
# Не использовать без острой необходимости
Set-ADComputer -Identity "AppServer" -TrustedForDelegation $true

# Constrained Delegation - только к указанным сервисам
Set-ADUser -Identity "svc-webapp" `
    -Add @{"msDS-AllowedToDelegateTo" = "MSSQLSvc/sql01.contoso.com:1433"}

# Включить "Use any authentication protocol" (S4U2Self + S4U2Proxy)
# Нужно через ADUC GUI или через атрибут:
Set-ADAccountControl -Identity "svc-webapp" -TrustedToAuthForDelegation $true

# Resource-Based Constrained Delegation
# Разрешить webapp-server выступать от имени пользователей при обращении к sql01
$webAppComputer = Get-ADComputer "webapp-server"
Set-ADComputer "sql01" -PrincipalsAllowedToDelegateToAccount $webAppComputer

# Просмотреть настройки делегирования
Get-ADUser -Identity "svc-webapp" -Properties TrustedForDelegation, `
    TrustedToAuthForDelegation, "msDS-AllowedToDelegateTo" |
    Select-Object Name, TrustedForDelegation, TrustedToAuthForDelegation, `
    "msDS-AllowedToDelegateTo"

# Найти аккаунты с Unconstrained Delegation (угроза!)
Get-ADComputer -Filter {TrustedForDelegation -eq $true -and primaryGroupID -eq 515} |
    Select-Object Name, DistinguishedName
# primaryGroupID 515 = Domain Computers (исключаем DC которые имеют это по умолчанию)
```

---

## Алгоритмы шифрования в Kerberos

```
Поддерживаемые алгоритмы (в порядке предпочтения):
───────────────────────────────────────────────────
AES256-CTS-HMAC-SHA1-96  - рекомендуется (AES-256)
AES128-CTS-HMAC-SHA1-96  - рекомендуется (AES-128)
RC4-HMAC                  - NTLM Hash = RC4 ключ, УСТАРЕЛ
DES-CBC-MD5               - полностью устарел, отключить!
DES-CBC-CRC               - полностью устарел, отключить!
```

```powershell
# Проверить какие алгоритмы поддерживает аккаунт
Get-ADUser -Identity "alice" -Properties "msDS-SupportedEncryptionTypes" |
    Select-Object Name, "msDS-SupportedEncryptionTypes"

# 0x7     = DES + RC4 + AES128 + AES256
# 0x18    = AES128 + AES256 (рекомендуется)
# 0x1C    = RC4 + AES128 + AES256

# Включить только AES для аккаунта (отключить RC4 и DES)
Set-ADUser -Identity "alice" -KerberosEncryptionType AES128, AES256
# или для компьютера:
Set-ADComputer -Identity "webserver" -KerberosEncryptionType AES128, AES256

# Найти аккаунты использующие RC4 (устаревший алгоритм)
Get-ADUser -Filter {-not (msDS-SupportedEncryptionTypes -band 16)} -Properties "msDS-SupportedEncryptionTypes"
```

---

## Kerberos на Linux (MIT Kerberos)

### Конфигурация клиента

```ini
# /etc/krb5.conf

[libdefaults]
    default_realm = CONTOSO.COM
    dns_lookup_realm = true
    dns_lookup_kdc = true
    ticket_lifetime = 24h
    renew_lifetime = 7d
    forwardable = true
    default_tgs_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96
    default_tkt_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96
    permitted_enctypes = aes256-cts-hmac-sha1-96 aes128-cts-hmac-sha1-96

[realms]
    CONTOSO.COM = {
        kdc = dc01.contoso.com
        kdc = dc02.contoso.com
        admin_server = dc01.contoso.com
        default_domain = contoso.com
    }

[domain_realm]
    .contoso.com = CONTOSO.COM
    contoso.com = CONTOSO.COM
```

### Работа с тикетами на Linux

```bash
# Получить TGT
kinit alice@CONTOSO.COM
kinit -f alice@CONTOSO.COM        # forwardable TGT
kinit -kt /etc/alice.keytab alice@CONTOSO.COM  # через keytab

# Просмотреть тикеты
klist
# Credentials cache: FILE:/tmp/krb5cc_1000
# Principal: alice@CONTOSO.COM
#   Issued           Expires          Principal
#   Jan 15 10:00:00  Jan 15 20:00:00  krbtgt/CONTOSO.COM@CONTOSO.COM

# Обновить TGT (не вводя пароль повторно)
kinit -R

# Уничтожить тикеты
kdestroy

# Переменные окружения
echo $KRB5CCNAME                  # путь к ccache файлу
export KRB5CCNAME=/tmp/my_ccache  # использовать конкретный файл

# Несколько ccache (например, для разных аккаунтов)
KRB5CCNAME=/tmp/alice.ccache kinit alice@CONTOSO.COM
KRB5CCNAME=/tmp/svc.ccache   kinit svc-webapp@CONTOSO.COM

# Тест аутентификации
kvno HTTP/webserver.contoso.com   # получить Service Ticket
kvno -u alice MSSQLSvc/sql.contoso.com
```

### Keytab файлы

```bash
# Keytab - файл с ключами аккаунта (без пароля)
# Используется для аутентификации сервисов

# Создать keytab на Windows DC
ktpass -princ HTTP/webapp.contoso.com@CONTOSO.COM `
       -mapuser svc-webapp@contoso.com `
       -crypto AES256-SHA1 `
       -ptype KRB5_NT_PRINCIPAL `
       -pass MyPassword123! `
       -out C:\webapp.keytab

# Скопировать keytab на Linux сервер
scp webapp.keytab root@webapp:/etc/webapp.keytab
chmod 400 /etc/webapp.keytab
chown webapp:webapp /etc/webapp.keytab

# Просмотреть содержимое keytab
klist -kte /etc/webapp.keytab
# KVNO  Encryption type          Principal
# 5     aes256-cts-hmac-sha1-96  HTTP/webapp.contoso.com@CONTOSO.COM

# Тест аутентификации через keytab
kinit -kt /etc/webapp.keytab HTTP/webapp.contoso.com@CONTOSO.COM
klist

# Создать keytab через MIT kadmin (для MIT KDC)
kadmin -q "ktadd -k /etc/webapp.keytab HTTP/webapp.contoso.com"
```

---

## Атаки на Kerberos

### Kerberoasting

Атака на сервисные аккаунты: запросить Service Ticket для SPN и взломать оффлайн.

```
Суть атаки:
1. Любой пользователь домена может запросить Service Ticket для любого SPN
2. Service Ticket зашифрован ПАРОЛЕМ сервисного аккаунта
3. Атакующий может взламывать тикет оффлайн (без риска блокировки)
4. Слабые пароли сервисных аккаунтов → взлом за минуты/часы
```

```powershell
# Защита: длинные случайные пароли для сервисных аккаунтов
# или использование Managed Service Accounts (MSA/gMSA)

# Найти уязвимые аккаунты (SPN + обычный пользователь, не компьютер)
Get-ADUser -Filter {ServicePrincipalNames -ne "$null"} `
    -Properties ServicePrincipalNames, PasswordLastSet, PasswordNeverExpires |
    Select-Object Name, ServicePrincipalNames, PasswordLastSet, PasswordNeverExpires

# Использовать gMSA вместо обычных сервисных аккаунтов
New-ADServiceAccount -Name "gMSA-WebApp" `
    -DNSHostName "webapp.contoso.com" `
    -PrincipalsAllowedToRetrieveManagedPassword "webapp-servers" `
    -ServicePrincipalNames "HTTP/webapp.contoso.com"

# Обнаружить Kerberoasting атаку
# Event ID 4769 - запрос Service Ticket с шифрованием RC4 (0x17)
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    Id = 4769
} | Where-Object {$_.Message -like "*Encryption Type:*0x17*"} |
    Select-Object TimeCreated, @{N="User"; E={$_.Properties[0].Value}},
    @{N="Service"; E={$_.Properties[2].Value}}
```

### AS-REP Roasting

Атака на аккаунты без Pre-Authentication:

```powershell
# Если DoesNotRequirePreAuth = true - можно запросить AS-REP без пароля
# и взламывать оффлайн

# Найти уязвимые аккаунты
Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true} -Properties DoesNotRequirePreAuth |
    Select-Object Name, SamAccountName

# Исправить - включить Pre-Authentication
Set-ADAccountControl -Identity "alice" -DoesNotRequirePreAuth $false

# Event ID 4768 с Pre-Authentication Type = 0 - подозрительно
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4768} |
    Where-Object {$_.Properties[5].Value -eq 0}
```

### Pass-the-Ticket

```
Атака: украсть TGT из памяти одного компьютера и использовать на другом.
Инструмент: Mimikatz

Mimikatz (для понимания атаки, не для использования):
privilege::debug
sekurlsa::tickets /export   # экспортировать тикеты в файлы
kerberos::ptt ticket.kirbi  # загрузить тикет в память

Защита:
Protected Users security group — тикеты нельзя форвардить
Credential Guard (Virtualization Based Security)
Privileged Access Workstations (PAW)
Ограничить права локального администратора
```

### Golden Ticket

```
Атака: компрометация krbtgt пароля → подделка TGT
Позволяет: доступ ко ВСЕМ ресурсам домена с любыми правами

Условие: нужен NTLM hash krbtgt аккаунта (достаётся при компрометации DC)

Признаки:
- Event ID 4768, 4769 с нетипичными параметрами
- TGT с нестандартным временем жизни (>10 часов)
- TGT с несуществующим SID

Защита:
Дважды сбросить пароль krbtgt (нужно два сброса из-за истории)
Защитить DC: минимальный доступ, PAW, мониторинг
Microsoft ATA / Defender for Identity - детектирует Golden Ticket

# Сброс krbtgt - инвалидирует все существующие TGT!
# Все пользователи должны переаутентифицироваться
Set-ADAccountPassword -Identity "krbtgt" `
    -NewPassword (ConvertTo-SecureString (New-Guid).Guid -AsPlainText -Force) -Reset
# Подождать репликацию, затем снова:
Set-ADAccountPassword -Identity "krbtgt" `
    -NewPassword (ConvertTo-SecureString (New-Guid).Guid -AsPlainText -Force) -Reset
```

### Silver Ticket

```
Атака: компрометация пароля СЕРВИСНОГО аккаунта → подделка Service Ticket
Позволяет: доступ к конкретному сервису без взаимодействия с KDC

Тише Golden Ticket - не проходит через DC, сложнее обнаружить.

Защита:
Длинные случайные пароли сервисных аккаунтов
gMSA - автоматически меняют пароль
PAC Validation на серверах (включено по умолчанию в новых ОС)
```

---

## Диагностика Kerberos

```powershell
# Проверить SPN регистрацию
setspn -L CONTOSO\alice
setspn -L CONTOSO\webserver$      # для компьютерного аккаунта ($)

# Проверить репликацию KDC
nltest /dclist:CONTOSO.COM
nltest /sc_verify:CONTOSO.COM

# Синхронизация времени (КРИТИЧНО — ±5 минут!)
w32tm /query /status
w32tm /resync /force
net time /querysntp

# Тестировать Kerberos аутентификацию
# PowerShell
[System.Net.NetworkCredential]::new("alice", "password", "CONTOSO").GetNetworkCredential()

# Kerbtray.exe - GUI инструмент для просмотра тикетов
# klist - командная строка

# Ошибки Kerberos - Event Log
Get-WinEvent -LogName "System" | Where-Object {$_.Id -in 14,15,16,17}
Get-WinEvent -LogName "Security" | Where-Object {$_.Id -in 4768,4769,4770,4771,4776}

# Коды ошибок Event 4768/4769/4771 (Result Code):
# 0x6  - Unknown username              - нет такого пользователя
# 0x7  - Account not found             - аккаунт не найден
# 0x12 - Account disabled/expired/locked
# 0x17 - Password expired              - пароль истёк
# 0x18 - Wrong password                - неверный пароль
# 0x19 - Too early (clock skew)        - время рассинхронизировано
# 0x1F - Integrity check failed        - ошибка целостности
# 0x20 - Ticket expired                - тикет истёк
# 0x25 - Clock skew too great          - разница времени >5 минут
# 0x32 - No S4U2Self proxy             - нет прав для делегирования
# 0x37 - Bad option                    - неправильные флаги запроса
# 0x3C - Generic error
```

```bash
# Диагностика на Linux
# Включить логирование Kerberos
export KRB5_TRACE=/dev/stdout
kinit alice@CONTOSO.COM

# Проверить время
ntpq -pn
timedatectl

# Тест DNS (KDC должен резолвиться)
nslookup -type=SRV _kerberos._tcp.contoso.com
nslookup -type=SRV _kerberos._udp.contoso.com
nslookup -type=SRV _kpasswd._tcp.contoso.com

# Проверить достижимость KDC (порт 88)
nc -zv dc01.contoso.com 88
telnet dc01.contoso.com 88
```

---

## Мониторинг событий Kerberos

```powershell
# Ключевые Event ID:
# 4768 - Kerberos TGT request (AS-REQ)
# 4769 - Kerberos Service Ticket request (TGS-REQ)
# 4770 - Kerberos Service Ticket renewal
# 4771 - Kerberos Pre-Authentication failed
# 4772 - Kerberos authentication ticket request failed
# 4773 - Kerberos service ticket request failed

# Мониторинг Kerberoasting (много TGS запросов с RC4)
$events = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} -MaxEvents 1000
$events | Where-Object {
    $_.Properties[5].Value -eq '0x17'  # RC4 encryption type
} | Group-Object {$_.Properties[0].Value} | Sort-Object Count -Descending

# Мониторинг неудачных аутентификаций
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4771} |
    Select-Object TimeCreated,
    @{N="User"; E={$_.Properties[0].Value}},
    @{N="IP"; E={$_.Properties[6].Value}},
    @{N="FailCode"; E={$_.Properties[4].Value}} |
    Group-Object User | Sort-Object Count -Descending | Select-Object -First 10

# Включить расширенный аудит Kerberos
# Audit Account Logon → Kerberos Authentication Service
# Audit Account Logon → Kerberos Service Ticket Operations
auditpol /set /subcategory:"Kerberos Authentication Service" /success:enable /failure:enable
auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable /failure:enable
```

---

## Шпаргалка

```
Основные компоненты:
KDC  = Domain Controller
AS   = Authentication Service (выдаёт TGT)
TGS  = Ticket Granting Service (выдаёт Service Tickets)
TGT  = Ticket Granting Ticket (шифрован krbtgt)
ST   = Service Ticket (шифрован ключом сервиса)
SPN  = Service Principal Name (идентификатор сервиса)
PAC  = Privilege Attribute Certificate (членство в группах)

Поток аутентификации:
1. AS-REQ: клиент → KDC (PreAuth = timestamp зашифрован ключом клиента)
2. AS-REP: KDC → клиент (TGT + TGS Session Key)
3. TGS-REQ: клиент → KDC (TGT + SPN + Authenticator)
4. TGS-REP: KDC → клиент (Service Ticket + Service Session Key)
5. AP-REQ: клиент → сервис (Service Ticket + Authenticator)
6. AP-REP: сервис → клиент (взаимная аутентификация)

Время жизни тикетов:
TGT:            10 часов (renew до 7 дней)
Service Ticket: 10 часов
Допустимое расхождение часов: ±5 минут

Windows команды:
klist           - просмотр тикетов
klist purge     - очистить тикеты
klist tgt       - только TGT
nltest /sc_query:DOMAIN — статус Kerberos

Linux команды:
kinit user@REALM    - получить TGT
klist               - просмотр тикетов
kdestroy            - удалить тикеты
kvno SPN            - получить Service Ticket

Атаки и защита:
Kerberoasting  → gMSA / длинные пароли / мониторинг Event 4769+RC4
AS-REP Roast   → включить PreAuth (DoesNotRequirePreAuth=false)
Pass-the-Ticket → Credential Guard / Protected Users group
Golden Ticket  → защитить DC / сбросить krbtgt (дважды!)
Silver Ticket  → gMSA / PAC validation
```

---

## Ссылки

- [RFC 4120](https://www.rfc-editor.org/rfc/rfc4120) - Kerberos V5 спецификация
- [Microsoft Kerberos](https://learn.microsoft.com/en-us/windows-server/security/kerberos/kerberos-authentication-overview) - обзор Kerberos в Windows
- [MIT Kerberos](https://web.mit.edu/kerberos/) - MIT Kerberos документация
- [Kerberoasting attack](https://attack.mitre.org/techniques/T1558/003/) - MITRE ATT&CK
- [Defender for Identity](https://learn.microsoft.com/en-us/defender-for-identity/) - обнаружение атак
