---
title: "Active Directory - NTLM аутентификация"
date: "2026-04-21"
---


NTLM (NT LAN Manager) - устаревший протокол аутентификации Microsoft, предшественник Kerberos. Несмотря на устаревание, NTLM активно используется в корпоративных сетях и является целью многих атак.

---

## История и версии NTLM

```
LM (LAN Manager, 1987):
  - Слабейший, пароль разбивается на 2 части по 7 символов
  - Хэш вычисляется независимо для каждой части
  - Отключён по умолчанию с Windows Vista

NTLMv1 (1993):
  - Использует NT Hash (MD4 от Unicode пароля)
  - 8-байтовый challenge
  - Уязвим к Pass-the-Hash, offline атакам

NTLMv2 (1998):
  - Улучшенный алгоритм ответа
  - Включает timestamp и client challenge
  - Сложнее взломать, но всё ещё уязвим

NTLMv2 Session (NTLM2):
  - Комбинация NTLMv1 + NTLMv2 challenge
  - Редко используется
```

---

## Как NTLM работает - три шага

### Challenge-Response механизм

```
Клиент                    Сервер                     DC (KDC)
  │                          │                           │
  │ 1. NEGOTIATE_MESSAGE     │                           │
  │──────────────────────────►│                          │
  │   (поддерживаемые флаги) │                           │
  │                          │                           │
  │ 2. CHALLENGE_MESSAGE     │                           │
  │◄──────────────────────────│                          │
  │   (server challenge,     │                           │
  │    server flags,         │                           │
  │    target name)          │                           │
  │                          │                           │
  │ 3. AUTHENTICATE_MESSAGE  │                           │
  │──────────────────────────►│                          │
  │   (NT Response,          │                           │
  │    LM Response,          │                           │
  │    username, domain,     │                           │
  │    workstation)          │                           │
  │                          │ 4. NetLogon (Pass-Through)│
  │                          │──────────────────────────►│
  │                          │   (username, challenge,   │
  │                          │    NT Response)           │
  │                          │                           │
  │                          │ 5. Проверка + ответ      │
  │                          │◄──────────────────────────│
  │                          │   (Success + session key) │
  │                          │                           │
  │ 6. Доступ разрешён       │                           │
  │◄──────────────────────────│                          │
```

### Детали каждого шага

#### Шаг 1: NEGOTIATE_MESSAGE (Type 1)

```
Клиент сообщает:
- Поддерживаемые NTLM флаги
- Версию NTLM (v1 или v2)
- Domain name клиента
- Workstation name

Пример флагов:
NTLMSSP_NEGOTIATE_56               - 56-битное шифрование
NTLMSSP_NEGOTIATE_128              - 128-битное шифрование
NTLMSSP_NEGOTIATE_NTLM2           - поддержка NTLMv2
NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY - расширенная безопасность
```

#### Шаг 2: CHALLENGE_MESSAGE (Type 2)

```
Сервер отправляет:
- Server Challenge: 8 случайных байт (nonce)
- Target name: имя домена или сервера
- Target info: DNS имена, флаги
- Поддерживаемые флаги

Server Challenge: AA BB CC DD EE FF 00 11  (пример)
```

#### Шаг 3: AUTHENTICATE_MESSAGE (Type 3)

```
Клиент вычисляет ответ:

Для NTLMv1:
NT Hash = MD4(UTF-16LE(password))
NT Response = HMAC-MD5(NT Hash, ServerChallenge + ClientChallenge)

Для NTLMv2:
NT Hash = MD4(UTF-16LE(password))
NTLMv2 Hash = HMAC-MD5(NT Hash, UTF-16LE(uppercase(username) + domain))
Client Challenge = 8 случайных байт
Blob = timestamp + ClientChallenge + TargetInfo
NT Response = HMAC-MD5(NTLMv2 Hash, ServerChallenge + Blob) + Blob

Клиент отправляет:
- NT Response (зашифрован ответ на challenge)
- LM Response (устарел)
- Username
- Domain
- Workstation
- Encrypted random session key (опционально)
```

---

## NT Hash - основа NTLM

```
NT Hash = MD4(UTF-16LE(password))

Примеры:
Пароль          NT Hash
────────────────────────────────────────────────────
"password"   → 8846F7EAEE8FB117AD06BDD830B7586C
"Password1"  → 64F12CDDAA88057E06A81B54E73B949B
"Admin@123"  → A6B1E3B33C9C8B3D6CE3B42C9F1E65B0

Особенности:
- Не используется соль (salt)!
- Один и тот же пароль = один и тот же хэш на всех машинах
- Поэтому Pass-the-Hash работает
- MD4 - быстрый алгоритм → быстрый брутфорс
```

```powershell
# Получить NT Hash через PowerShell (для понимания, не для злоупотреблений)
$password = "Password1"
$md4 = [System.Security.Cryptography.MD4]::Create()
$ntHash = [System.BitConverter]::ToString(
    $md4.ComputeHash([System.Text.Encoding]::Unicode.GetBytes($password))
).Replace("-","")
```

---

## Когда используется NTLM вместо Kerberos

```
NTLM используется когда Kerberos невозможен:

1. Подключение по IP адресу (не по hostname)
   ssh user@192.168.1.10          - NTLM (нет SPN для IP)
   \\192.168.1.10\share           - NTLM
   \\SERVER\share                 - Kerberos (если SPN зарегистрирован)

2. DNS не работает или hostname не резолвится в AD имя
   Kerberos требует DNS для поиска KDC

3. Сервис не зарегистрирован в AD (нет SPN)
   Некорректно настроенные сервисы

4. NTLM явно запрошен клиентом или сервером

5. Workgroup компьютеры (не в домене)

6. Локальная аутентификация на компьютере
   Вход через локальный аккаунт (.\Administrator)

7. Приложения, написанные с явным использованием NTLM API

8. Кросс-доменная аутентификация (если нет лесных доверий)
```

---

## NTLM Pass-Through аутентификация

```
Когда клиент подключается к ресурсному серверу:

FS01 (файловый сервер) не хранит пароли пользователей.
Он передаёт challenge/response на DC для проверки.

Клиент ──► FS01 ──► DC (NetLogon) ──► Ответ

NetLogon — служба на DC, принимает запросы от серверов.
FS01 является Passthrough Server.

Проблема: сервер видит challenge/response → можно захватить и взломать.
```

---

## Управление NTLM через политики

### LM Authentication Level - ключевая политика

```
Computer Configuration → Windows Settings → Security Settings
→ Local Policies → Security Options
→ "Network security: LAN Manager authentication level"

Уровни (от небезопасного к безопасному):
0 — Send LM & NTLM responses           (ЗАПРЕЩЕНО)
1 — Send LM & NTLM, use NTLMv2 if negotiated
2 — Send NTLM response only
3 — Send NTLMv2 response only
4 — Send NTLMv2 only; refuse LM
5 — Send NTLMv2 only; refuse LM & NTLM (РЕКОМЕНДУЕТСЯ)
```

```powershell
# Установить через реестр
# 5 = NTLMv2 only, refuse LM и NTLM
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "LmCompatibilityLevel" `
    -Value 5 `
    -Type DWord

# Проверить текущий уровень
Get-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "LmCompatibilityLevel"

# Через GPO (рекомендуется для домена):
# Computer Config → Windows Settings → Security Settings
# → Local Policies → Security Options
# → Network security: LAN Manager authentication level = 5
```

### Дополнительные настройки безопасности NTLM

```powershell
# Отключить LM Hash хранение
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
    -Name "NoLMHash" `
    -Value 1 `
    -Type DWord

# Требовать подпись NTLM (защита от relay атак)
# Клиент:
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord

Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" `
    -Name "EnableSecuritySignature" `
    -Value 1 -Type DWord

# Сервер:
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord

Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
    -Name "EnableSecuritySignature" `
    -Value 1 -Type DWord
```

### Ограничение NTLM через GPO

```
Computer Configuration → Windows Settings → Security Settings
→ Local Policies → Security Options

Полезные политики:

"Network security: Restrict NTLM: Outgoing NTLM traffic to remote servers"
  - Allow all (по умолчанию)
  - Audit all
  - Deny all  ← Запрет исходящего NTLM

"Network security: Restrict NTLM: Incoming NTLM traffic"
  - Allow all
  - Deny all domain accounts (запрет для доменных аккаунтов)
  - Deny all accounts

"Network security: Restrict NTLM: NTLM authentication in this domain"
  - Disable
  - Deny for domain accounts to domain servers
  - Deny for domain accounts
  - Deny for domain servers
  - Deny all
```

```powershell
# Аудит использования NTLM
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0" `
    -Name "AuditReceivingNTLMTraffic" `
    -Value 2 `  # 2 = Audit All
    -Type DWord

Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0" `
    -Name "RestrictReceivingNTLMTraffic" `
    -Value 0 `  # 0 = Allow All (начать с аудита!)
    -Type DWord

# Просмотр NTLM аудита в журнале
Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" -MaxEvents 100 |
    Select-Object TimeCreated, Message | Format-Table -Wrap
```

---

## Атаки на NTLM

### Pass-the-Hash (PtH)

```
Суть:
NT Hash = MD4(password) - один и тот же на всех компьютерах.
Если захватить NT Hash, не нужен исходный пароль.
Hash можно использовать напрямую в NTLM аутентификации.

Инструменты (для понимания): Mimikatz, Impacket

Захват хэшей:
Windows: LSASS процесс хранит NT Hash в памяти.
Linux: файлы /etc/shadow (другой формат, но похожая концепция).
```

```powershell
# Защита от Pass-the-Hash

# 1. Credential Guard — изолирует LSASS в Hyper-V контейнере
# (требует UEFI, Secure Boot, виртуализация)
# Группа: Computer Configuration → Administrative Templates
#         → System → Device Guard → Turn On Virtualization Based Security

# 2. Protected Users Security Group
# Члены группы:
# - Не могут использовать NTLM (только Kerberos)
# - Тикеты не кэшируются
# - DES и RC4 запрещены
# - Нет делегирования
Add-ADGroupMember -Identity "Protected Users" -Members "alice.smith"

# 3. Local Administrator Password Solution (LAPS)
# Уникальные пароли локальных администраторов → PtH не перемещается по сети

# 4. Отключить NTLM там где не нужен
# GPO: Network security: Restrict NTLM: Outgoing NTLM traffic = Deny all
```

### NTLM Relay

```
Суть:
1. Жертва пытается аутентифицироваться на сервере A
2. Атакующий перехватывает NTLM handshake
3. Атакующий ретранслирует его на сервер B
4. Сервер B видит легитимные credentials жертвы
5. Атакующий получает доступ к серверу B от имени жертвы

Ключевое: атакующий не знает пароль, просто пересылает NTLM сообщения.

Условия для атаки:
- SMB Signing отключён (по умолчанию на workstations!)
- HTTP/LDAP Signing отключён

Популярные векторы:
- NBT-NS / LLMNR poisoning (ответить на broadcast запросы)
- IPv6 DNS спуфинг
- WPAD атаки
- Печать через MS-RPRN (PrintSpooler bug)
```

```powershell
# Защита от NTLM Relay

# 1. Включить SMB Signing (ОБЯЗАТЕЛЬНО!)
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
    -Name "RequireSecuritySignature" `
    -Value 1 -Type DWord

# Через GPO:
# Computer Config → Windows Settings → Security Settings
# → Local Policies → Security Options
# "Microsoft network server: Digitally sign communications (always)" = Enabled
# "Microsoft network client: Digitally sign communications (always)" = Enabled

# 2. Отключить LLMNR
# Computer Config → Administrative Templates → Network
# → DNS Client → Turn off multicast name resolution = Enabled

# 3. Отключить NBT-NS
# Через NIC настройки или DHCP опцию 001

# 4. Включить EPA (Extended Protection for Authentication)
# Защищает HTTP аутентификацию от relay

# 5. Включить LDAP Signing на DC
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LDAPServerIntegrity" `
    -Value 2 -Type DWord  # 2 = Required

# 6. Включить LDAPS Channel Binding
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters" `
    -Name "LdapEnforceChannelBinding" `
    -Value 2 -Type DWord  # 2 = Always
```

### NTLM Brute Force / Offline Cracking

```
Захваченные NT Hashes или NTLMv2 responses можно взламывать оффлайн.

Скорость взлома на современном GPU (RTX 3090):
NT Hash (MD4):        70 BILLION hashes/sec → "Password1" — мгновенно
NTLMv2 response:      5 BILLION hashes/sec  → словарные атаки

Защита:
Длинные пароли (>14 символов)
Passphrase вместо Password+число
Многофакторная аутентификация
Отключить NTLM где возможно
```

---

## Просмотр и анализ NTLM трафика

### Wireshark

```
Фильтры Wireshark для NTLM:
ntlmssp              - весь NTLM трафик
ntlmssp.messagetype == 1  - NEGOTIATE
ntlmssp.messagetype == 2  - CHALLENGE
ntlmssp.messagetype == 3  - AUTHENTICATE

Что искать в AUTHENTICATE:
- ntlmssp.auth.username
- ntlmssp.auth.domain
- ntlmssp.auth.ntresponse  (можно захватить для взлома)
- ntlmssp.ntlmserverchallenge (из CHALLENGE)
```

### Логирование NTLM на DC

```powershell
# Event ID для NTLM аутентификации:
# 4776 - Компьютер пытался проверить credentials аккаунта (NTLM)
# 4624 - Успешный вход (тип 3 = сетевой = часто NTLM)
# 4625 - Неудачный вход

# Просмотреть NTLM аутентификации
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    Id = 4776
} -MaxEvents 100 | ForEach-Object {
    [PSCustomObject]@{
        Time = $_.TimeCreated
        User = $_.Properties[1].Value
        Workstation = $_.Properties[2].Value
        ErrorCode = $_.Properties[3].Value
    }
}

# Включить аудит NTLM аутентификации
auditpol /set /subcategory:"Credential Validation" /success:enable /failure:enable

# Найти где используется NTLM (для постепенного отключения)
# Оперативный журнал NTLM
Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" |
    Select-Object TimeCreated,
    @{N="ProcessName"; E={$_.Properties[0].Value}},
    @{N="TargetServer"; E={$_.Properties[3].Value}} |
    Group-Object TargetServer | Sort-Object Count -Descending
```

---

## Поэтапное отключение NTLM

Резкое отключение NTLM ломает legacy приложения. Правильная стратегия:

```
Шаг 1: Аудит — выяснить где используется NTLM
─────────────────────────────────────────────────────────────
GPO: "Restrict NTLM: Outgoing NTLM traffic to remote servers" = Audit All
GPO: "Restrict NTLM: Audit Incoming NTLM Traffic" = Enable auditing all accounts

Смотрим Event Log → Microsoft-Windows-NTLM/Operational

Шаг 2: Исправить - настроить Kerberos там где можно
─────────────────────────────────────────────────────────────
- Подключаться по hostname, не IP
- Зарегистрировать SPN для сервисов
- Исправить приложения которые явно требуют NTLM

Шаг 3: Исключения - добавить allowlist
─────────────────────────────────────────────────────────────
GPO: "Restrict NTLM: Add server exceptions in this domain"
Добавить серверы которые ДОЛЖНЫ использовать NTLM (legacy)

Шаг 4: Ограничение — начать блокировать
─────────────────────────────────────────────────────────────
Начать с не критичных OU, расширять постепенно
"Restrict NTLM: NTLM authentication in this domain" = Deny for domain accounts

Шаг 5: Полное отключение
─────────────────────────────────────────────────────────────
"Restrict NTLM: Incoming NTLM traffic" = Deny all accounts
```

```powershell
# Быстрый аудит: топ серверов использующих NTLM
Get-WinEvent -LogName "Microsoft-Windows-NTLM/Operational" -MaxEvents 10000 |
    Where-Object {$_.Id -eq 4001} |
    ForEach-Object {
        [PSCustomObject]@{
            Time     = $_.TimeCreated
            Process  = $_.Properties[0].Value
            Target   = $_.Properties[3].Value
        }
    } |
    Group-Object Target | Sort-Object Count -Descending | Select-Object -First 20

# Включить NTLM аудит журнал
wevtutil sl "Microsoft-Windows-NTLM/Operational" /e:true

# Добавить исключение для конкретного сервера (чтобы NTLM разрешён только к нему)
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0"
$exceptions = @("legacyserver.contoso.com", "oldapp.contoso.com")
Set-ItemProperty -Path $regPath -Name "ClientAllowedNTLMServers" -Value $exceptions -Type MultiString
```

---

## NTLM vs Kerberos - сравнение

| Характеристика | NTLM | Kerberos |
|----------------|------|----------|
| Алгоритм | MD4 + HMAC-MD5 | AES-256 / RC4 |
| Передача пароля | Никогда | Никогда |
| DC участвует в каждом запросе | ДА (Pass-Through) | Нет (только TGT) |
| Взаимная аутентификация | Нет | Да (AP-REP) |
| Single Sign-On | Ограниченно | Полноценный |
| Делегирование | Нет | Да (constrained/unconstrained) |
| Работа по IP | Да | Нет (нужен hostname) |
| Workgroup | Да | Нет (нужен DC) |
| Pass-the-Hash | Уязвим | Устойчив |
| Relay атаки | Уязвим | Устойчив |
| Offline крекинг | Уязвим (MD4 быстрый) | Устойчив (AES) |

---

## Диагностика NTLM

```powershell
# Определить используемый протокол для конкретного подключения
# Через Wireshark или:
net use \\SERVER\share /user:domain\alice  # поймать в логах

# Event ID 4624 — поле "Authentication Package"
# NTLM  - использован NTLM
# Kerberos - использован Kerberos
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} |
    Where-Object {$_.Properties[10].Value -eq 'NTLM'} |
    Select-Object TimeCreated,
    @{N="User"; E={$_.Properties[5].Value}},
    @{N="WorkStation"; E={$_.Properties[11].Value}},
    @{N="Protocol"; E={$_.Properties[10].Value}}

# Статистика: сколько входов через NTLM vs Kerberos
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 1000 |
    Group-Object {$_.Properties[10].Value} | Select-Object Name, Count

# Проверить настройки NTLM на локальной машине
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" |
    Select-Object LmCompatibilityLevel, NoLMHash

# Тест — использует ли подключение NTLM
$cred = Get-Credential
$session = New-PSSession -ComputerName SERVER -Credential $cred
Invoke-Command -Session $session -ScriptBlock {
    [System.Security.Principal.WindowsIdentity]::GetCurrent().AuthenticationType
}
# "NTLM" или "Kerberos"
```

---

## Managed Service Accounts (MSA / gMSA)

Специальные аккаунты которые решают проблемы с NTLM/паролями сервисных аккаунтов:

```powershell
# gMSA (group Managed Service Account) - рекомендуется
# Пароль управляется AD автоматически (120 символов, меняется каждые 30 дней)
# Не требует NTLM — использует Kerberos
# Защищён от Kerberoasting (пароль нельзя взломать за разумное время)

# Создать gMSA
New-ADServiceAccount `
    -Name "gMSA-WebApp" `
    -DNSHostName "webapp.contoso.com" `
    -PrincipalsAllowedToRetrieveManagedPassword "WebApp-Servers" `
    -KerberosEncryptionType AES256 `
    -ServicePrincipalNames @("HTTP/webapp.contoso.com", "HTTP/webapp")

# Установить на сервере
Add-ADComputerServiceAccount -Computer "WebServer01" -ServiceAccount "gMSA-WebApp"
Install-ADServiceAccount -Identity "gMSA-WebApp"

# Проверить установку
Test-ADServiceAccount -Identity "gMSA-WebApp"

# Настроить сервис использовать gMSA
# В свойствах сервиса: Аккаунт = CONTOSO\gMSA-WebApp$
# (с $ в конце, пароль оставить пустым)
```

---

## Шпаргалка

```
Версии NTLM:
LM     - устарел, отключить!
NTLMv1 - уязвим, отключить!
NTLMv2 - минимум допустимого (всё равно рискованно)

Политика LmCompatibilityLevel:
0-2 - небезопасно
3   - NTLMv2 только клиент
4   - NTLMv2 + отказ LM на сервере
5   - только NTLMv2 (рекомендуется)

Главные защиты:
SMB Signing       - обязательно включить
Protected Users   - группа для привилегированных аккаунтов
Credential Guard  - изолирует LSASS
gMSA              - для сервисных аккаунтов вместо NTLM
Отключить LLMNR   - убирает вектор relay атак
Отключить NBT-NS  - убирает вектор relay атак

Event ID для мониторинга:
4776 — NTLM Credential Validation (на DC)
4624 тип 3 — сетевой вход (может быть NTLM)
4625 — неудачный вход

Ключевые реестровые ключи:
HKLM\SYSTEM\...\Lsa\LmCompatibilityLevel
HKLM\SYSTEM\...\Lsa\NoLMHash
HKLM\SYSTEM\...\LanmanServer\Parameters\RequireSecuritySignature
HKLM\SYSTEM\...\LanmanWorkstation\Parameters\RequireSecuritySignature
```

---

## Ссылки

- [MS-NLMP Specification](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-nlmp) - официальная спецификация
- [NTLM Relay Attacks](https://attack.mitre.org/techniques/T1557/001/) - MITRE ATT&CK
- [Pass-the-Hash](https://attack.mitre.org/techniques/T1550/002/) - MITRE ATT&CK
- [Mitigating Pass-the-Hash](https://www.microsoft.com/en-us/download/details.aspx?id=36036) - Microsoft whitepaper
- [Protected Users](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - Protected Users группа
