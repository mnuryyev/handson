---
title: "Windows - SMB: протокол, версии, уязвимости"
date: "2026-05-15"
---

SMB (Server Message Block) - сетевой протокол для совместного доступа к файлам, принтерам и другим ресурсам. Основа Windows-сетей: без SMB не работают сетевые диски, DFS, Active Directory Sysvol, а также большинство инструментов администрирования. При этом SMB - исторически один из самых атакуемых протоколов в Windows.

---

## Основы SMB

```
Транспорт:
  TCP 445   - прямой SMB (Windows 2000+, основной)
  TCP 139   - SMB поверх NetBIOS Session Service (legacy)
  UDP 137   - NetBIOS Name Service (NBNS)
  UDP 138   - NetBIOS Datagram Service

Пространство имён UNC (Universal Naming Convention):
  \\<server>\<share>             - доступ к шаре
  \\<server>\<share>\<path>      - путь внутри шары
  \\<server>\C$                  - административная шара (диск C)
  \\<server>\ADMIN$              - %SystemRoot%
  \\<server>\IPC$                - межпроцессное взаимодействие (Named Pipes)
  \\<server>\PRINT$              - драйверы принтеров
  \\<server>\SYSVOL              - домен: политики и скрипты входа
  \\<server>\NETLOGON            - домен: скрипты входа

Компоненты Windows SMB:
  Server service (LanmanServer)  - хозяин шар, принимает входящие SMB
  Workstation service (LanmanWorkstation) - клиент, подключается к шарам
  mrxsmb.sys, mrxsmb20.sys       - SMB клиентские редиректоры (драйверы)
  srv.sys, srv2.sys               - SMB серверные драйверы
```

---

## Версии SMB

### SMB 1.0 (CIFS)

```
Год: 1983-1996 (IBM/Microsoft)
Также известен как: CIFS (Common Internet File System)

Особенности:
  - Примитивная архитектура: один запрос = одно соединение
  - NetBIOS зависимость (изначально)
  - Plaintext пароли в ранних версиях
  - NT LM 0.12 диалект - финальная версия SMB 1
  - Нет шифрования трафика
  - Нет message signing по умолчанию
  - Нет защиты от man-in-the-middle
  - Broadcast зависимость (Browser service, NBNS)

Статус: ОТКЛЮЧИТЬ НЕМЕДЛЕННО
  - EternalBlue (MS17-010) эксплуатирует SMB 1
  - WannaCry, NotPetya, и десятки других атак
  - Microsoft отключила по умолчанию в Windows 10 1709
  - Полностью убрана из Windows Server 2019/Windows 11 (не установлена)

Проверить/отключить SMB1:
  # Проверить статус
  Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol
  Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol

  # Отключить (сервер)
  Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force

  # Отключить (клиент - отдельная фича)
  Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol-Client -NoRestart

  # Реестр (если нет PowerShell)
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      SMB1 -Type DWORD -Value 0
```

### SMB 2.0 / 2.1

```
SMB 2.0:  Windows Vista / Server 2008
SMB 2.1:  Windows 7 / Server 2008 R2

Ключевые улучшения над SMB 1:
  - Компактный бинарный формат (вместо text-like CIFS)
  - Pipelining: несколько запросов без ожидания ответа
  - Компаундинг (compound requests): несколько операций в одном пакете
  - Больший MTU: меньше пакетов для больших файлов
  - Durable handles: восстановление после обрыва соединения
  - Leasing: кэширование на клиенте с уведомлением от сервера
  - Message signing (опционально)
  
SMB 2.1 добавил:
  - Opportunistic Locking improvements
  - BranchCache support (кэширование в филиалах)
  - Большие кредиты (больше одновременных запросов)
```

### SMB 3.0 / 3.0.2 / 3.1.1

```
SMB 3.0:   Windows 8 / Server 2012
SMB 3.0.2: Windows 8.1 / Server 2012 R2
SMB 3.1.1: Windows 10 / Server 2016 (текущая)

Революционные изменения в SMB 3:

SMB Direct (RDMA):
  Работает поверх RDMA сетевых карт (InfiniBand, RoCE, iWARP)
  Обходит CPU и OS - данные напрямую между NIC и памятью
  Минимальная задержка, максимальная пропускная способность

SMB Multichannel:
  Несколько TCP сессий одновременно (несколько NIC или RSS)
  Автоматическая балансировка нагрузки
  Отказоустойчивость: при отказе одного канала - переключается на другой

Сквозное шифрование (End-to-end encryption):
  AES-128-CCM (SMB 3.0)
  AES-128-GCM (SMB 3.1.1, быстрее чем CCM)
  AES-256-CCM / AES-256-GCM (Windows Server 2022)
  Шифрование на уровне share или всего сервера

Pre-authentication Integrity (SMB 3.1.1):
  HMAC-SHA512 хеш всего negotiate handshake
  Защита от downgrade атак (нельзя заставить использовать SMB 1)
  Каждое соединение привязано к конкретным negotiate параметрам

SMB 3.0.2 добавил:
  Возможность отключить SMB 1 на конкретном сервере
  Улучшения для Scale-Out File Server (SoFS)

Что проверять на продакшне:
  Get-SmbServerConfiguration | Select-Object `
      EnableSMB2Protocol,
      EncryptData,
      RequireSecuritySignature,
      EnableSMB1Protocol
```

### Таблица сравнения версий

```
Функция                      SMB 1   SMB 2   SMB 2.1  SMB 3.0  SMB 3.1.1
─────────────────────────────────────────────────────────────────────────
Шифрование трафика            -       -       -        AES-CCM  AES-GCM
Pre-auth Integrity            -       -       -        -        +
Signing (опционально)         +       +       +        +        +
Pipelining                    -       +       +        +        +
Multichannel                  -       -       -        +        +
SMB Direct (RDMA)             -       -       -        +        +
Durable Handles               -       +       +        +        +
Leasing (client cache)        -       -       +        +        +
Compound Requests             -       +       +        +        +
EternalBlue уязвим            ДА      -       -        -        -
```

---

## Диалект Negotiation

```
При установке соединения клиент и сервер договариваются о диалекте.
Клиент предлагает список поддерживаемых диалектов, сервер выбирает лучший.

Диалекты и их идентификаторы:
  0x0002   PC NETWORK PROGRAM 1.0    - SMB 1 (старейший)
  0x0003   XENIX CORE
  0x000A   DOS LM1.2X002
  0x000D   DOS LANMAN2.1
  0x0200   NT LM 0.12               - SMB 1 NT (CIFS)
  0x0202   SMB 2.0.2                - SMB 2.0
  0x0210   SMB 2.1                  - SMB 2.1
  0x0300   SMB 3.0                  - SMB 3.0
  0x0302   SMB 3.0.2                - SMB 3.0.2
  0x0311   SMB 3.1.1                - SMB 3.1.1

Downgrade атака:
  Раньше: man-in-the-middle мог изменить Negotiate и заставить клиента
  использовать SMB 1 вместо SMB 3.
  SMB 3.1.1 закрыл это: Pre-authentication Integrity (хеш negotiate пакетов)
  делает любое изменение обнаруживаемым.

Проверить диалект активного соединения:
  Get-SmbConnection | Select-Object ServerName, Dialect, Encrypted, Signed
  # Dialect 3.1.1 = хорошо, 1.0 = немедленно разобраться почему
```

---

## Аутентификация в SMB

```
SMB поддерживает несколько механизмов аутентификации через SPNEGO:

1. Kerberos (предпочтительный в домене)
   - Используется когда клиент подключается по hostname (не IP)
   - Взаимная аутентификация
   - Нет передачи пароля/хеша по сети

2. NTLM / NTLMv2 (fallback)
   - Используется при подключении по IP
   - Или если Kerberos недоступен
   - Pass-Through: сервер пересылает challenge/response на DC
   - Уязвим к relay атакам если нет Signing

3. Anonymous (гостевой)
   - Вход без credentials
   - Отключён по умолчанию в Windows 10 / Server 2016+
   - Проверить: Get-SmbServerConfiguration | Select EnableGuestLogon

4. Null Session
   - Подключение к IPC$ без credentials
   - Исторически использовалось для enumeration (пользователи, группы, шары)
   - Ограничено с Windows XP SP2+, почти полностью заблокировано в Server 2016+

Session Setup - порядок:
  1. TCP connect → port 445
  2. SMB Negotiate (выбор диалекта)
  3. Session Setup (SPNEGO: Kerberos или NTLM)
  4. Tree Connect (подключиться к конкретной шаре \\server\share)
  5. Операции (Create, Read, Write, Close, ...)
  6. Tree Disconnect → Session Logoff
```

---

## SMB Signing

```
SMB Signing - цифровая подпись каждого SMB пакета.
Защищает от NTLM Relay и man-in-the-middle атак.

Как работает:
  Каждый пакет подписывается HMAC-SHA256 (SMB 2/3) или MD5 (SMB 1)
  с ключом производным от сессионного ключа аутентификации.
  Подмена/изменение пакета невозможна без ключа.

Настройки (две стороны - клиент и сервер):

  RequireSecuritySignature = $true   # signing обязателен, unsigned отклоняется
  EnableSecuritySignature  = $true   # signing поддерживается (но не обязателен)
  RequireSecuritySignature = $false  # signing не требуется
  EnableSecuritySignature  = $false  # signing отключён полностью

По умолчанию в Windows:
  DC (Domain Controller):    RequireSecuritySignature = $true  (всегда требует)
  Server (Member server):    EnableSecuritySignature = $true   (поддерживает, не требует)
  Workstation:               EnableSecuritySignature = $true   (поддерживает, не требует)

Включить обязательный Signing (рекомендуется везде):
  # Сервер
  Set-SmbServerConfiguration -RequireSecuritySignature $true -Force

  # Клиент
  Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

  # Или через реестр:
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      RequireSecuritySignature -Type DWORD -Value 1
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" `
      RequireSecuritySignature -Type DWORD -Value 1

Проверить статус Signing на соединениях:
  Get-SmbConnection | Select-Object ServerName, Dialect, Signed, Encrypted

Важно: если RequireSecuritySignature = $true с обеих сторон -
соединение установится только если оба поддерживают signing.
Если сервер требует, а клиент не поддерживает - Access Denied.
```

---

## SMB Encryption

```
SMB Encryption - шифрование всего SMB трафика.
Доступно с SMB 3.0 (Windows 8 / Server 2012).
Защищает от прослушивания и packet capture атак.

Алгоритмы:
  SMB 3.0:    AES-128-CCM
  SMB 3.1.1:  AES-128-GCM (быстрее, предпочтительно)
  Server 2022: AES-256-CCM, AES-256-GCM

Уровни применения:
  1. Весь сервер:
     Set-SmbServerConfiguration -EncryptData $true -Force
     Все соединения ко всем шарам зашифрованы.
     Клиент должен поддерживать SMB 3.0+ иначе - отказ.

  2. Конкретная шара:
     Set-SmbShare -Name "Finance" -EncryptData $true
     Только эта шара требует шифрования.

  3. Клиент может запросить шифрование:
     Set-SmbClientConfiguration -EncryptionCiphers "AES_256_GCM,AES_128_GCM"

Проверить шифрование:
  Get-SmbServerConfiguration | Select EncryptData
  Get-SmbShare | Select Name, EncryptData
  Get-SmbConnection | Select ServerName, Encrypted, Dialect

Важно: шифрование SMB не бесплатно.
  AES-128-GCM: ~2-5% overhead на современном CPU с AES-NI
  AES-128-CCM: ~5-10% overhead
  На старом железе без AES-NI - заметный удар по производительности.
  Проверить AES-NI: (Get-WmiObject Win32_Processor).Description -match "AES"
```

---

## Управление шарами

### Создание и настройка

```powershell
# Создать шару
New-SmbShare -Name "Data" -Path "C:\SharedData" `
    -Description "Shared data folder" `
    -FullAccess "DOMAIN\Admins" `
    -ReadAccess "DOMAIN\Users" `
    -ChangeAccess "DOMAIN\Editors"

# Создать шару с шифрованием
New-SmbShare -Name "Finance" -Path "C:\Finance" `
    -EncryptData $true `
    -FullAccess "DOMAIN\FinanceTeam"

# Создать скрытую шару ($ в конце - не отображается в сети)
New-SmbShare -Name "Backup$" -Path "C:\Backups" `
    -FullAccess "DOMAIN\BackupAdmins"

# Изменить права существующей шары
Grant-SmbShareAccess -Name "Data" -AccountName "DOMAIN\NewUser" -AccessRight Read -Force
Revoke-SmbShareAccess -Name "Data" -AccountName "DOMAIN\OldUser" -Force
Block-SmbShareAccess -Name "Data" -AccountName "DOMAIN\Blocked" -Force

# Просмотр шар
Get-SmbShare
Get-SmbShare -Name "Data" | Select-Object *
Get-SmbShareAccess -Name "Data"

# Удалить шару (файлы не удаляются)
Remove-SmbShare -Name "Data" -Force
```

### Share vs NTFS права

```
ИТОГОВЫЙ ДОСТУП = пересечение Share прав И NTFS прав (наиболее ограничивающее).

Пример:
  Share:  Users = Full Control
  NTFS:   Users = Read Only
  Итог:   Users = Read Only  (NTFS ограничивает)

  Share:  Users = Read Only
  NTFS:   Users = Full Control
  Итог:   Users = Read Only  (Share ограничивает)

Рекомендация:
  Share права:  Authenticated Users = Full Control (или Change)
  NTFS права:   детальная настройка для каждой группы
  Причина: NTFS права работают и при локальном доступе, Share только по сети.

Административные скрытые шары (C$, ADMIN$, IPC$):
  Создаются автоматически.
  Только Administrators имеют доступ.
  C$ = корень диска C, ADMIN$ = %SystemRoot%
  Отключить C$, ADMIN$: не рекомендуется (ломает WMI, PsExec, remote management)
  IPC$: нельзя отключить (критично для SMB)

  Если очень нужно отключить административные шары:
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      AutoShareWks -Type DWORD -Value 0   # для workstations (C$, D$ и т.д.)
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      AutoShareServer -Type DWORD -Value 0  # для серверов
  # Потребуется перезагрузка или restart LanmanServer
```

---

## SMB Enumeration

```
Без credentials (анонимно) - современные Windows ограничены, но попробовать стоит:
  net view \\TARGET /all          # список шар (может потребовать auth)
  smbclient -L //TARGET -N        # Linux: список шар анонимно

С credentials:
  # Windows - подключить шару
  net use \\TARGET\share /user:DOMAIN\user password
  net use * \\TARGET\C$ /user:Administrator password

  # PowerShell
  $cred = Get-Credential
  Get-SmbShare -CimSession (New-CimSession -ComputerName TARGET -Credential $cred)

  # Просмотр открытых файлов на сервере
  Get-SmbOpenFile
  Get-SmbSession

  # Просмотр с удалённой машины
  Get-SmbOpenFile -CimSession TARGET

Через CrackMapExec (Linux, пентест):
  crackmapexec smb TARGET -u user -p password --shares    # список шар
  crackmapexec smb TARGET -u user -p password --sessions  # активные сессии
  crackmapexec smb 192.168.1.0/24 -u user -p pass         # сканировать подсеть

Через nmap:
  nmap -p 445 --script smb-enum-shares,smb-enum-users TARGET
  nmap -p 445 --script smb-security-mode TARGET           # signing, auth level
  nmap -p 445 --script smb-vuln-ms17-010 TARGET           # проверить EternalBlue
  nmap -p 445 --script smb2-security-mode TARGET          # SMB2 настройки

Проверить версии SMB на хосте:
  nmap -p 445 --script smb-protocols TARGET
  # или через PowerShell на самом хосте:
  Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol, EnableSMB2Protocol
```

---

## Уязвимости SMB

### MS17-010 / EternalBlue

```
CVE-2017-0144 (и несколько смежных CVE)
Обнаружена: АНБ (NSA), опубликована Shadow Brokers (апрель 2017)

Затронуто: Windows XP, Vista, 7, 8, Server 2003, 2008, 2008 R2, 2012 (без патча)
Протокол: SMB 1 ТОЛЬКО

Суть уязвимости:
  Уязвимость в обработке транзакций SMB1.
  SetupAndX + Trans2 запросы с некорректными параметрами → 
  heap/pool corruption в srv.sys (ядро) →
  Remote Code Execution без аутентификации.

Импакт: полный SYSTEM через сеть, без аутентификации.

Использование в атаках:
  WannaCry (май 2017): ransomware, заразил 200,000+ машин в 150 странах
  NotPetya (июнь 2017): wiper, ущерб >$10 млрд
  TrickBot, Emotet и сотни других использовали EternalBlue для распространения

Защита:
  1. Отключить SMB 1 (главная мера)
  2. Установить MS17-010 патч (если SMB 1 нельзя отключить)
  3. Блокировать TCP 445 на периметре (но не внутри ЛВС)
  4. WFAS: запретить входящий SMB от не-доверенных хостов

Проверить уязвимость:
  nmap -p 445 --script smb-vuln-ms17-010 TARGET
  # Python PoC: https://github.com/worawit/MS17-010

Проверить что патч установлен:
  Get-HotFix -Id KB4012212, KB4012215  # Windows 7 / Server 2008 R2
  # (номер KB зависит от ОС, искать по MS17-010)
```

### MS08-067 / NetAPI

```
CVE-2008-4250
Сервис: Server service (netapi32.dll)
Затронуто: Windows XP, Server 2003, Vista, Server 2008 (без патча)

Remote Code Execution без аутентификации через SMB.
Использовался Conficker worm (заразил 9-15 млн машин).
Сегодня актуален только для legacy систем без патча.

Проверить:
  nmap -p 445 --script smb-vuln-ms08-067 TARGET
```

### CVE-2020-0796 / SMBGhost

```
CVE-2020-0796 (март 2020)
Версия: SMB 3.1.1 ТОЛЬКО
Затронуто: Windows 10 1903, 1909, Server 1903, Server 1909

Уязвимость в обработке сжатых пакетов SMB3 (новая функция компрессии).
Integer overflow при декомпрессии → heap overflow в ядре.
Локальная эскалация привилегий → SYSTEM (LPE часть хорошо задокументирована)
Remote Code Execution (RCE часть: теоретически, PoC появились позже)

Особенность: требует SMB 3.1.1 compression capability.
Windows Server 2019 и Windows 10 версии до 1903 НЕ уязвимы.

Защита:
  Установить патч KB4551762
  Временно: отключить SMB3 компрессию
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" `
      DisableCompression -Type DWORD -Value 1

Проверить:
  nmap -p 445 --script smb-vuln-cve-2020-0796 TARGET
```

### CVE-2021-36942 / PetitPotam

```
CVE-2021-36942 (июль 2021)
Не классическая "дыра" в SMB, но использует SMB/LSARPC.

Суть: LSARPC интерфейс (через \pipe\lsarpc в SMB) позволял
НЕАУТЕНТИФИЦИРОВАННЫМ пользователям принудить DC аутентифицироваться
на произвольном сервере через NTLM (MS-EFSRPC, EfsRpcOpenFileRaw).

Это использовалось в связке с NTLM Relay:
  PetitPotam → DC аутентифицируется → relay на AD CS → получить сертификат DC →
  DCSync → дамп всех хешей домена.

Патч (август 2021): KB5005413
Защита:
  Установить патч
  Отключить WebClient service (убирает HTTP relay вектор)
  Включить EPA (Extended Protection for Authentication) на AD CS
  Настроить LDAP Signing + Channel Binding на DC
```

### NTLM Relay через SMB

```
Не CVE, а архитектурная уязвимость. Актуальна до сих пор.

Суть:
  SMB без Signing → man-in-the-middle может ретранслировать NTLM аутентификацию.
  Жертва подключается к серверу A → атакующий перехватывает → ретранслирует на B →
  получает доступ к B от имени жертвы.

Условия:
  SMB Signing отключён (по умолчанию на workstations!)
  Атакующий в той же подсети (или контролирует DNS/LLMNR)

Инструменты атаки (для понимания):
  Responder - отравляет LLMNR/NBT-NS, перехватывает NTLM
  ntlmrelayx.py (Impacket) - ретранслирует на другие SMB серверы

Векторы для получения NTLM:
  LLMNR poisoning (Link-Local Multicast Name Resolution)
  NBT-NS poisoning (NetBIOS Name Service)
  IPv6 DNS takeover (если IPv6 активен)
  PrinterBug (SpoolService принуждает DC аутентифицироваться)
  PetitPotam

Защита:
  1. Включить SMB Signing везде (ключевая мера)
     Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
     Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

  2. Отключить LLMNR:
     GPO: Computer Config → Admin Templates → Network → DNS Client
     → Turn off Multicast Name Resolution = Enabled

  3. Отключить NBT-NS:
     Через DHCP option 001 или NIC settings

  4. Включить SMB Encryption (дополнительная защита)

  5. Сеть: разделить клиентский и серверный трафик (VLAN)
```

### Pass-the-Hash через SMB

```
SMB поддерживает аутентификацию NT Hash напрямую (через NTLM).
Если у атакующего есть NT Hash пользователя - пароль не нужен.

Использование (Impacket):
  smbclient.py -hashes :NTHash DOMAIN/user@TARGET
  psexec.py -hashes :NTHash DOMAIN/Administrator@TARGET
  secretsdump.py -hashes :NTHash DOMAIN/user@TARGET

Использование (Windows / CrackMapExec):
  crackmapexec smb TARGET -u Administrator -H NTHash --shares
  crackmapexec smb 192.168.1.0/24 -u Administrator -H NTHash  # скан сети

Защита:
  Credential Guard (изолирует хеши от извлечения)
  Protected Users group (запрещает NTLM для членов группы)
  LAPS (уникальные пароли локальных admin → PtH не работает горизонтально)
  Network logon restrictions (отказывать в сетевом входе для локальных аккаунтов)

  # Запретить сетевой вход для локальных аккаунтов (KB2871997):
  # GPO: Computer Config → Windows Settings → Security Settings → Local Policies
  # → User Rights Assignment → Deny access to this computer from the network
  # Добавить: BUILTIN\Administrators (для локальных admin)
  # Или через реестр (создать LocalAccountTokenFilterPolicy = 0):
  Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" `
      LocalAccountTokenFilterPolicy -Type DWORD -Value 0
```

---

## SMB Hardening - чеклист

```powershell
# ============================================================
# 1. ОТКЛЮЧИТЬ SMB 1 (абсолютный приоритет)
# ============================================================
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart
# Проверить:
Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol

# ============================================================
# 2. ВКЛЮЧИТЬ ОБЯЗАТЕЛЬНЫЙ SIGNING
# ============================================================
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
Set-SmbClientConfiguration -RequireSecuritySignature $true -Force

# ============================================================
# 3. ВКЛЮЧИТЬ ШИФРОВАНИЕ (если все клиенты Windows 8+/Server 2012+)
# ============================================================
Set-SmbServerConfiguration -EncryptData $true -Force
# Или только для чувствительных шар:
Set-SmbShare -Name "Finance" -EncryptData $true

# ============================================================
# 4. ОТКЛЮЧИТЬ ГОСТЕВОЙ ВХОД
# ============================================================
Set-SmbServerConfiguration -EnableGuestLogon $false -Force

# ============================================================
# 5. ОТКЛЮЧИТЬ НЕБЕЗОПАСНЫЕ ФУНКЦИИ
# ============================================================
# Отключить LLMNR через реестр:
New-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" `
    EnableMulticast -Type DWORD -Value 0 -Force

# Отключить NetBIOS over TCP/IP (через WMI для всех адаптеров):
$adapters = Get-WmiObject Win32_NetworkAdapterConfiguration
$adapters | Where-Object { $_.IPEnabled } | ForEach-Object {
    $_.SetTcpipNetbios(2)  # 2 = Disable NetBIOS
}

# ============================================================
# 6. АУДИТ SMB
# ============================================================
# Включить аудит подключений к шарам
Set-SmbServerConfiguration -AuditSmb1Access $true -Force
# Аудит доступа к объектам (EventID 5140, 5145):
auditpol /set /subcategory:"File Share" /success:enable /failure:enable
auditpol /set /subcategory:"Detailed File Share" /success:enable /failure:enable

# ============================================================
# 7. ПРОВЕРКА ИТОГОВОГО СОСТОЯНИЯ
# ============================================================
Get-SmbServerConfiguration | Select-Object `
    EnableSMB1Protocol,
    EnableSMB2Protocol,
    EnableGuestLogon,
    RequireSecuritySignature,
    EncryptData,
    AuditSmb1Access |
    Format-List
```

---

## Мониторинг SMB

### Event IDs

```
Security Log:
  5140  - Доступ к сетевому ресурсу (подключение к шаре)
  5142  - Объект сетевого ресурса добавлен (шара создана)
  5143  - Объект сетевого ресурса изменён (шара изменена)
  5144  - Объект сетевого ресурса удалён
  5145  - Доступ к объекту сетевого ресурса (к файлу/папке внутри шары)
  4624  - Успешная аутентификация (тип 3 = Network = SMB)
  4625  - Неуспешная аутентификация
  4776  - NTLM Credential Validation (при SMB+NTLM аутентификации)

System Log:
  7045  - Новый сервис установлен (PsExec-style атаки создают сервис)

Microsoft-Windows-SMBServer/Audit:
  3000  - SMB1 доступ (если включён AuditSmb1Access)

Microsoft-Windows-SMBClient/Security:
  31017 - Отклонён небезопасный гостевой вход

PowerShell - мониторинг:
  # Последние подключения к шарам
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5140} -MaxEvents 50 |
      ForEach-Object {
          [PSCustomObject]@{
              Time       = $_.TimeCreated
              User       = $_.Properties[1].Value
              Source     = $_.Properties[3].Value
              Share      = $_.Properties[7].Value
          }
      } | Format-Table -AutoSize

  # Обнаружить SMB1 активность
  Get-WinEvent -LogName "Microsoft-Windows-SMBServer/Audit" |
      Where-Object { $_.Id -eq 3000 } |
      Select-Object TimeCreated, Message | Format-Table -Wrap

  # Активные SMB сессии прямо сейчас
  Get-SmbSession | Select-Object ClientUserName, ClientComputerName, NumOpens
  Get-SmbOpenFile | Select-Object ClientUserName, Path
```

---

## Диагностика

```powershell
# Проверить подключение к SMB ресурсу
Test-NetConnection -ComputerName SERVER01 -Port 445
Test-Path "\\SERVER01\SYSVOL"

# Посмотреть активные SMB соединения (клиент)
Get-SmbConnection
# ServerName, ShareName, UserName, Dialect, Encrypted, Signed

# Отключить зависшую сессию
Get-SmbSession | Where-Object { $_.ClientComputerName -eq "WORKSTATION01" } |
    Remove-SmbSession -Force

# Закрыть открытый файл (если заблокирован)
Get-SmbOpenFile | Where-Object { $_.Path -match "report.xlsx" } |
    Close-SmbOpenFile -Force

# Замерить производительность SMB
# (через perfmon или встроенные счётчики)
Get-Counter "\SMB Server\Bytes Received/sec"
Get-Counter "\SMB Server\Bytes Sent/sec"
Get-Counter "\SMB Server\Work Items/sec"

# Трассировка SMB (ETW трейс)
netsh trace start capture=yes provider=Microsoft-Windows-SMBClient
# ... воспроизвести проблему ...
netsh trace stop
# Открыть .etl файл в Windows Performance Analyzer или Microsoft Message Analyzer

# Проверить какие шары доступны с текущей машины
Get-SmbShare                              # локальные шары
net view \\SERVER01 /all                  # шары удалённого сервера
net use                                   # текущие подключения
```

---

## Шпаргалка

```
ВЕРСИИ SMB
  1.0 / CIFS  - ОТКЛЮЧИТЬ. EternalBlue, устаревший, небезопасный.
  2.0 / 2.1   - Vista/7. Нормально, но нет шифрования.
  3.0 / 3.0.2 - Server 2012. Шифрование, Multichannel.
  3.1.1       - Server 2016/Win10+. Pre-auth integrity, AES-GCM. Используй это.

КЛЮЧЕВЫЕ НАСТРОЙКИ
  EnableSMB1Protocol = $false      - ОБЯЗАТЕЛЬНО
  RequireSecuritySignature = $true - важно (защита от relay)
  EncryptData = $true              - если возможно (SMB 3.0+)
  EnableGuestLogon = $false        - ОБЯЗАТЕЛЬНО

КРИТИЧНЫЕ УЯЗВИМОСТИ
  MS17-010 (EternalBlue)  - SMB1, RCE без auth. Патч или отключить SMB1.
  SMBGhost (CVE-2020-0796)- SMB 3.1.1 компрессия, Win10 1903/1909. Патч KB4551762.
  NTLM Relay              - нет Signing. Включить RequireSecuritySignature.
  Pass-the-Hash           - NTLM + NT Hash. Credential Guard, LAPS.
  PetitPotam              - LSARPC принуждает NTLM auth. Патч KB5005413.

АДМИНИСТРАТИВНЫЕ ШАРЫ
  C$, D$   - диски (только Administrators)
  ADMIN$   - %SystemRoot% (только Administrators)
  IPC$     - Named Pipes (нельзя удалить)
  SYSVOL   - домен: политики (DC only)
  NETLOGON - домен: скрипты (DC only)

КОМАНДЫ
  Get-SmbServerConfiguration          - конфигурация сервера
  Get-SmbShare                        - список шар
  Get-SmbSession                      - активные сессии
  Get-SmbOpenFile                     - открытые файлы
  Get-SmbConnection                   - подключения (клиент)
  Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
  Set-SmbServerConfiguration -RequireSecuritySignature $true -Force
  Set-SmbServerConfiguration -EncryptData $true -Force
  New-SmbShare -Name X -Path Y -FullAccess "DOMAIN\Grp"

EVENT IDS
  5140  - подключение к шаре
  5145  - доступ к файлу в шаре
  4624 тип 3  - сетевой вход (SMB)
  7045  - новый сервис (PsExec-style)
  3000 (SMBServer/Audit) - SMB1 активность
```

---

## Ссылки

- [SMB Overview](https://learn.microsoft.com/en-us/windows-server/storage/file-server/troubleshoot/windows-server-smb-overview) - обзор SMB
- [SMB security enhancements](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security) - хардение SMB
- [Disable SMB1](https://learn.microsoft.com/en-us/windows-server/storage/file-server/troubleshoot/detect-enable-and-disable-smbv1-v2-v3) - как отключить SMB1
- [MS17-010](https://support.microsoft.com/en-us/topic/ms17-010-security-update-for-windows-smb-server-814bd487-b7c3-bf79-b9d8-b42ce4c5d44f) - патч EternalBlue
- [CVE-2020-0796 (SMBGhost)](https://msrc.microsoft.com/update-guide/en-US/vulnerability/CVE-2020-0796) - SMBGhost
- [NTLM Relay Attack](https://attack.mitre.org/techniques/T1557/001/) - MITRE ATT&CK
- [MITRE T1021.002: SMB/Windows Admin Shares](https://attack.mitre.org/techniques/T1021/002/) - SMB LM
- [CrackMapExec](https://github.com/Pennyw0rth/NetExec) - NetExec (форк CrackMapExec)
