---
title: "Windows - PowerShell Basics"
date: "2026-05-13"
---

PowerShell is a command shell and scripting language from Microsoft built on top of .NET. Unlike cmd.exe, which works with text, PowerShell works with objects. This is the fundamental difference: every command returns not a string but an object with properties and methods that can be passed down the pipeline.

PowerShell appeared in 2006 (v1.0) as a Windows administration tool. In 2016, PowerShell Core (v6) was released - a cross-platform version built on .NET Core that runs on Linux and macOS. The current active line is PowerShell 7.x.

---

## Windows PowerShell vs PowerShell 7

```
Windows PowerShell (v1-v5.1):
  - Built into Windows, no installation needed
  - Windows only
  - Based on .NET Framework
  - Executable: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
  - Default window color: blue
  - Will be maintained but receives no new versions

PowerShell 7.x (PowerShell Core):
  - Requires separate installation
  - Windows + Linux + macOS
  - Based on .NET 6/7/8
  - Executable: C:\Program Files\PowerShell\7\pwsh.exe
  - Default window color: black
  - Actively developed, receives new features

Windows Server and enterprise environments still commonly run v5.1.
For new scripts, PowerShell 7 is recommended.
```

---

## How to Launch PowerShell

```
Launch methods:
  Win+R → powershell           - Windows PowerShell
  Win+R → pwsh                 - PowerShell 7 (if installed)
  Win+X → Windows PowerShell (Admin)
  Search → "PowerShell" → right-click → Run as Administrator
  From cmd.exe: powershell.exe or pwsh.exe

Launch with parameters:
  powershell.exe -NoProfile          - skip profile loading (faster startup)
  powershell.exe -ExecutionPolicy Bypass -File script.ps1
  powershell.exe -Command "Get-Process | Where CPU -gt 10"
  powershell.exe -NonInteractive     - no interactive prompts
  powershell.exe -WindowStyle Hidden - hidden window
  powershell.exe -EncodedCommand <Base64>  - command encoded as Base64 (used by malware!)

ISE (Integrated Scripting Environment):
  powershell_ise.exe             - built-in editor for v5.1
  Windows only, v5.1 only
  For v7 use VS Code + PowerShell extension instead
```

---

## Script Execution Policy

Execution Policy is not a security boundary against malware - it is a convenience mechanism to prevent accidental script execution. It is trivially bypassed (see below).

```
Policy levels:
  Restricted      - no scripts at all (interactive commands only)
                    Default on Windows client editions
  AllSigned       - only signed scripts allowed
  RemoteSigned    - local unsigned scripts OK;
                    scripts downloaded from the internet require a signature
                    Default on Windows Server
  Unrestricted    - all scripts allowed, warning for internet-downloaded files
  Bypass          - everything allowed, no warnings
  Undefined       - no policy set here (falls through to higher scope)
```

```
Scopes (policy levels by precedence):
  MachinePolicy   - set via GPO for the machine (highest priority)
  UserPolicy      - set via GPO for the user
  Process         - applies only to the current PowerShell process
  CurrentUser     - set for the current user in the registry
  LocalMachine    - set machine-wide in the registry
                    HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell
                    ExecutionPolicy = "RemoteSigned"

View current policy:
  Get-ExecutionPolicy
  Get-ExecutionPolicy -List     - all scopes and their values

Change the policy:
  Set-ExecutionPolicy RemoteSigned              - for LocalMachine
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

```
Execution Policy bypasses (for awareness, not circumvention):
  powershell -ExecutionPolicy Bypass -File script.ps1
  Get-Content script.ps1 | Invoke-Expression
  powershell -EncodedCommand <base64>

Remove "Downloaded from Internet" mark from a file:
  Unblock-File .\script.ps1
  (The mark is stored as an Alternate Data Stream - Zone.Identifier)
```

---

## Anatomy of a Command: Cmdlet

The basic unit of PowerShell is a **cmdlet** (pronounced "command-let"). It is a compiled command written in C# following a strict naming convention:

```
Verb-Noun

Verb  - what we are doing
Noun  - what we are doing it to

Examples:
  Get-Process       - retrieve a list of processes
  Stop-Service      - stop a service
  New-Item          - create a new item
  Remove-Item       - delete an item
  Set-ItemProperty  - set a property value
  Invoke-Command    - execute a command
  Write-Output      - write to the output stream
  Export-Csv        - export to a CSV file
```

```
Standard verbs (most common):
  Get      - retrieve/read data
  Set      - modify an existing object
  New      - create a new object
  Remove   - delete an object
  Add      - add to an existing object
  Clear    - clear content (without deleting)
  Copy     - copy
  Move     - move
  Rename   - rename
  Start    - start
  Stop     - stop
  Restart  - restart
  Enable   - enable
  Disable  - disable
  Test     - check something (returns True/False)
  Invoke   - execute
  Export   - export data
  Import   - import data
  Format   - format output for display
  Out      - send output somewhere
  Write    - write/display
  Select   - select properties or objects
  Where    - filter objects
  Sort     - sort
  Group    - group
  Measure  - calculate (count, sum, average)
  Compare  - compare
  Convert  - convert
  Join     - join
  Split    - split
```

---

## Getting Help

PowerShell has a built-in help system. Help content is not pre-installed - it needs to be downloaded.

```
Update help (requires administrator rights):
  Update-Help
  Update-Help -Force            - force update even if recently updated
  Update-Help -UICulture en-US  - download English help

View help:
  Get-Help Get-Process          - brief help
  Get-Help Get-Process -Full    - full help
  Get-Help Get-Process -Examples    - examples only
  Get-Help Get-Process -Online      - open in the browser
  Get-Help Get-Process -Parameter * - all parameters in detail

  help Get-Process              - paged help (through a pager)
  man Get-Process               - alias for help

Discover commands:
  Get-Command                   - all available commands
  Get-Command -Verb Get         - all commands with the Get verb
  Get-Command -Noun Process     - all commands targeting Process
  Get-Command *service*         - wildcard search
  Get-Command -Module ActiveDirectory  - commands from a specific module

Explore an object:
  Get-Process | Get-Member      - all properties and methods of the object
  Get-Process | Get-Member -MemberType Property  - properties only
  Get-Process | Get-Member -MemberType Method    - methods only
```

---

## Variables

```
Declaration and use:
  $name = "Alice"
  $count = 42
  $pi = 3.14159
  $isAdmin = $true

  Write-Host "Hello, $name"      - string interpolation
  Write-Host "Hello, ${name}!"   - explicit variable boundaries

Data types:
  $str     = "text"             - [String]
  $num     = 42                 - [Int32]
  $float   = 3.14               - [Double]
  $bool    = $true / $false     - [Boolean]
  $null    = $null              - null (empty value)
  $arr     = @(1, 2, 3)        - [Array]
  $hash    = @{Key = "Value"}  - [Hashtable]

Explicit type annotation:
  [int]$count = 42
  [string]$name = "Alice"
  [bool]$flag = $true
  [datetime]$date = "2026-01-01"

Special variables:
  $_          - current object in the pipeline
  $?          - result of the last command ($true if successful)
  $LASTEXITCODE - exit code of the last external program
  $Error      - array of recent errors ($Error[0] = most recent)
  $PSVersionTable - PowerShell version information
  $env:PATH   - environment variable (accessed via $env:)
  $HOME       - user home directory
  $PWD        - current directory
  $args       - script arguments (in scripts without param())
  $MyInvocation - info about the current script/function

Scope:
  Variables are local to the current scope by default.
  $global:var  - global variable
  $script:var  - script-level variable
  $local:var   - explicitly local
```

---

## Strings

```
Single quotes - literal string, no interpolation:
  $name = 'Alice'
  'Hello, $name'       - outputs: Hello, $name

Double quotes - with interpolation:
  "Hello, $name"       - outputs: Hello, Alice
  "Today: $(Get-Date)" - expression inside $() is evaluated
  "Path: $env:WINDIR"  - environment variables work too

Here-String (multiline):
  $text = @"
  Line 1
  Line 2
  Hello, $name
  "@

  $literal = @'
  No interpolation here: $name
  '@

String operations:
  $s = "Hello, World"
  $s.Length            - length (13)
  $s.ToUpper()         - "HELLO, WORLD"
  $s.ToLower()         - "hello, world"
  $s.Replace("World", "PowerShell")  - replacement
  $s.Split(", ")       - split into array: @("Hello", "World")
  $s.Trim()            - remove leading and trailing whitespace
  $s.TrimStart()       - remove leading whitespace
  $s.TrimEnd()         - remove trailing whitespace
  $s.StartsWith("He")  - $true
  $s.EndsWith("ld")    - $true
  $s.Contains("World") - $true
  $s.Substring(7, 5)   - "World" (start index, length)
  $s.IndexOf("W")      - 7 (position of first occurrence)
  $s -like "*World*"   - $true (wildcard)
  $s -match "W\w+"     - $true (regex); result stored in $Matches
  $Matches[0]          - "World" (last -match result)

Formatting:
  "Pi = {0:F2}" -f 3.14159    - "Pi = 3.14"
  "{0} + {1} = {2}" -f 1, 2, 3 - "1 + 2 = 3"
  [string]::Format("{0:D5}", 42) - "00042"
```

---

## Arrays

```
Creating:
  $arr = @(1, 2, 3, 4, 5)
  $arr = 1, 2, 3              - also an array
  $arr = @()                  - empty array
  $arr = 1..10                - range: @(1, 2, 3, ..., 10)

Index access:
  $arr[0]                     - first element (1)
  $arr[-1]                    - last element (5)
  $arr[1..3]                  - slice: @(2, 3, 4)

Properties and methods:
  $arr.Count                  - number of elements (5)
  $arr.Length                 - same
  $arr -contains 3            - $true
  $arr -notcontains 6         - $true

Adding elements:
  $arr += 6                   - add element (creates a new array internally!)
  [System.Collections.ArrayList]$list = @()
  $list.Add(1)                - more efficient for frequent additions
  $list.Add(2)

Iteration:
  foreach ($item in $arr) {
      Write-Host $item
  }
  $arr | ForEach-Object { Write-Host $_ }

Filtering:
  $arr | Where-Object { $_ -gt 2 }    - elements greater than 2: @(3, 4, 5)

Sorting:
  $arr | Sort-Object                   - ascending
  $arr | Sort-Object -Descending       - descending

No true multidimensional array, but arrays of arrays work:
  $matrix = @(@(1,2), @(3,4), @(5,6))
  $matrix[0][1]    - 2
```

---

## Hash Tables

```
Creating:
  $hash = @{
      Name    = "Alice"
      Age     = 30
      IsAdmin = $true
  }

Accessing values:
  $hash["Name"]          - "Alice"
  $hash.Name             - "Alice" (same thing)
  $hash.Age              - 30

Adding/modifying:
  $hash["City"] = "London"   - add a new key
  $hash.City = "London"      - same thing
  $hash["Age"] = 31          - modify a value

Removing:
  $hash.Remove("City")

Checking for keys:
  $hash.ContainsKey("Name")    - $true
  $hash.ContainsValue("Alice") - $true

Iteration:
  foreach ($key in $hash.Keys) {
      Write-Host "$key = $($hash[$key])"
  }
  $hash.GetEnumerator() | ForEach-Object {
      Write-Host "$($_.Key) = $($_.Value)"
  }

Properties:
  $hash.Keys      - all keys
  $hash.Values    - all values
  $hash.Count     - number of key-value pairs

Ordered hash table (insertion order preserved):
  $ordered = [ordered]@{
      First  = 1
      Second = 2
      Third  = 3
  }
```

---

## The Pipeline

The pipeline is the central idiom of PowerShell. Objects flow from one command to the next without intermediate files.

```
Basic syntax:
  Command1 | Command2 | Command3

Example:
  Get-Process | Where-Object { $_.CPU -gt 10 } | Sort-Object CPU -Descending | Select-Object -First 5

How it works:
  Get-Process        - returns a collection of [Process] objects
  |                  - each object is passed one at a time to the next command
  Where-Object       - filters: keeps only those where CPU > 10
  Sort-Object        - sorts by the CPU field, descending
  Select-Object -First 5 - takes the first 5 objects

$_ is the current object in the pipeline:
  Get-Service | Where-Object { $_.Status -eq "Running" }
  Get-ChildItem | Where-Object { $_.Extension -eq ".log" }
  Get-Process | ForEach-Object { $_.Kill() }

Simplified syntax (PowerShell 3+):
  Where-Object CPU -gt 10               - instead of { $_.CPU -gt 10 }
  Sort-Object -Property CPU             - explicit property name
  Where-Object Status -eq "Running"     - simplified comparison form
```

---

## Filtering, Sorting, Selection

```
Where-Object - filtering:
  Get-Service | Where-Object { $_.Status -eq "Running" }
  Get-Service | Where-Object Status -eq "Running"        - short syntax
  Get-Process | Where-Object { $_.CPU -gt 5 -and $_.WorkingSet -gt 100MB }

Select-Object - picking properties / limiting count:
  Get-Process | Select-Object Name, CPU, Id        - only these properties
  Get-Process | Select-Object -First 10            - first 10
  Get-Process | Select-Object -Last 5              - last 5
  Get-Process | Select-Object -Skip 5              - skip the first 5
  Get-Process | Select-Object -Unique              - unique objects only
  Get-Process | Select-Object Name, @{N="MemMB"; E={$_.WorkingSet/1MB -as [int]}}
    - calculated property: N=name, E=expression

Sort-Object - sorting:
  Get-Process | Sort-Object CPU                    - ascending
  Get-Process | Sort-Object CPU -Descending        - descending
  Get-Process | Sort-Object @{E="CPU"; Descending=$true}, Name  - multiple fields

Group-Object - grouping:
  Get-Process | Group-Object Company
  Get-Service | Group-Object Status
  Get-EventLog -LogName System -Newest 100 | Group-Object Source | Sort-Object Count -Desc

Measure-Object - statistics:
  Get-Process | Measure-Object CPU -Sum -Average -Maximum -Minimum
  Get-ChildItem C:\Windows | Measure-Object Length -Sum    - total file size
  @(1,2,3,4,5) | Measure-Object -Average                  - average: 3

ForEach-Object - action for each object:
  Get-Process | ForEach-Object { Write-Host $_.Name }
  Get-Service | ForEach-Object { $_.Stop() }
  1..5 | ForEach-Object { $_ * 2 }           - @(2, 4, 6, 8, 10)
```

---

## Formatting Output

```
Format-Table (ft) - table:
  Get-Process | Format-Table Name, CPU, Id
  Get-Process | Format-Table -AutoSize              - auto column widths
  Get-Process | Format-Table -Wrap                  - wrap long text
  Get-Process | ft Name, @{N="CPU(s)"; E={$_.CPU}; Width=10; Align="Right"}

Format-List (fl) - property list:
  Get-Process -Name chrome | Format-List *          - all properties
  Get-Service -Name wuauserv | Format-List          - good for detailed inspection

Format-Wide (fw) - wide view (single column):
  Get-Process | Format-Wide Name -Column 4

Out-GridView - interactive GUI table with filter:
  Get-Process | Out-GridView                        - open in GUI
  Get-Process | Out-GridView -PassThru              - return selected objects
  Get-Service | Out-GridView -Title "Services"

Important:
  Format-* commands must come last in the pipeline.
  After Format-Table the object becomes formatted display text,
  not the original object - it cannot be processed further downstream.
```

---

## Output: Out-* and Export-*

```
Out-Host       - output to the console (default behavior)
Out-Null       - discard output (show and save nothing)
Out-File       - write to a file
Out-String     - convert to a string
Out-GridView   - open in a GUI table

File output:
  Get-Process | Out-File C:\procs.txt
  Get-Process | Out-File C:\procs.txt -Encoding UTF8 -Append

  Export-Csv     - export to CSV (with a header row)
  Get-Process | Export-Csv C:\procs.csv -NoTypeInformation -Encoding UTF8

  Export-Clixml  - serialize to XML (preserves types, can be re-imported)
  Get-Process | Export-Clixml C:\procs.xml
  $procs = Import-Clixml C:\procs.xml

  ConvertTo-Json - convert to a JSON string
  Get-Process | Select-Object Name, CPU | ConvertTo-Json
  ConvertFrom-Json - parse a JSON string

  ConvertTo-Csv / ConvertFrom-Csv - like Export/Import-Csv but to/from a string

Write-Output vs Write-Host:
  Write-Output "text"    - writes the object into the pipeline (can be piped further)
  Write-Host "text"      - writes to the console, bypassing the pipeline (cannot be redirected)
  Write-Host "Red!" -ForegroundColor Red -BackgroundColor Black
  Write-Verbose "debug"  - only if $VerbosePreference = "Continue"
  Write-Warning "warn"   - prefixed with WARNING:
  Write-Error "error"    - writes to the error stream
  Write-Debug "debug"    - only if $DebugPreference = "Continue"
```

---

## Conditionals and Loops

```
if / elseif / else:
  if ($x -gt 10) {
      Write-Host "greater than 10"
  } elseif ($x -eq 10) {
      Write-Host "equal to 10"
  } else {
      Write-Host "less than 10"
  }

switch:
  switch ($status) {
      "Running"  { Write-Host "Running" }
      "Stopped"  { Write-Host "Stopped" }
      default    { Write-Host "Unknown status" }
  }

  switch -Wildcard ($name) {      - supports wildcards
      "svc*"  { Write-Host "Service: $name" }
      "app*"  { Write-Host "App: $name" }
  }

  switch -Regex ($text) {         - supports regex
      "^\d+"  { Write-Host "Starts with a digit" }
      "[a-z]" { Write-Host "Contains lowercase letters" }
  }

for:
  for ($i = 0; $i -lt 10; $i++) {
      Write-Host $i
  }

foreach:
  foreach ($service in Get-Service) {
      Write-Host $service.Name
  }
  foreach ($item in @(1, 2, 3)) {
      Write-Host $item
  }

while:
  $i = 0
  while ($i -lt 5) {
      Write-Host $i
      $i++
  }

do-while / do-until:
  do {
      $input = Read-Host "Enter a number"
  } while ($input -ne "0")

  do {
      $input = Read-Host "Enter a number"
  } until ($input -eq "0")       - loop UNTIL the condition becomes true

Loop control:
  break      - exit the loop
  continue   - jump to the next iteration
  return     - exit the function (optionally with a return value)
```

---

## Comparison Operators

PowerShell does not use `<`, `>`, or `==` for comparison - only text-based operators.

```
Comparison:
  -eq    Equal               $a -eq $b        - equal
  -ne    Not Equal           $a -ne $b        - not equal
  -gt    Greater Than        $a -gt $b        - greater than
  -lt    Less Than           $a -lt $b        - less than
  -ge    Greater or Equal    $a -ge $b        - greater than or equal
  -le    Less or Equal       $a -le $b        - less than or equal

Strings and patterns:
  -like     wildcard        "Hello" -like "He*"    - $true
  -notlike                  "Hello" -notlike "He*" - $false
  -match    regex           "Hello" -match "H\w+"  - $true (result in $Matches)
  -notmatch                 "Hello" -notmatch "X"  - $true
  -contains array contains  $arr -contains 5        - $true
  -notcontains              $arr -notcontains 6     - $true
  -in       element in array  5 -in $arr            - $true
  -notin                    6 -notin $arr           - $true

All comparisons are case-insensitive by default.
Prefix with c for case-sensitive variants:
  -ceq, -cne, -cgt, -clt, -cge, -cle, -clike, -cmatch

Logical:
  -and   Logical AND         $a -gt 0 -and $b -gt 0
  -or    Logical OR          $a -gt 0 -or $b -gt 0
  -not   Logical NOT         -not $flag
  !      Same as -not         !$flag
  -xor   Exclusive OR        $a -xor $b

Type operators:
  $x -is [int]               - $true if $x is an [int]
  $x -isnot [string]         - $true if $x is not a [string]
  $x -as [int]               - cast to type (or $null if cast fails)
```

---

## Functions

```
Basic function:
  function Say-Hello {
      Write-Host "Hello!"
  }
  Say-Hello

Function with parameters:
  function Greet-User {
      param(
          $Name,
          $Greeting = "Hello"   - default value
      )
      Write-Host "$Greeting, $Name!"
  }
  Greet-User -Name "Alice"
  Greet-User -Name "Bob" -Greeting "Hi"

Typed and mandatory parameters:
  function Get-Square {
      param(
          [Parameter(Mandatory)]
          [int]$Number
      )
      return $Number * $Number
  }
  Get-Square -Number 5     - 25
  Get-Square               - prompts for input (Mandatory!)

Advanced Function (full-featured cmdlet):
  function Get-UserInfo {
      [CmdletBinding()]    - enables -Verbose, -Debug, -ErrorAction, etc.
      param(
          [Parameter(Mandatory, ValueFromPipeline)]
          [string]$UserName,

          [Parameter()]
          [switch]$Detailed    - switch: $true if specified, $false otherwise
      )

      process {            - process block runs once per pipeline object
          Write-Verbose "Getting info for $UserName"
          $user = Get-ADUser -Identity $UserName
          if ($Detailed) {
              return $user
          }
          return $user | Select-Object Name, SamAccountName
      }
  }
  "alice", "bob" | Get-UserInfo -Verbose

Return values:
  In PowerShell, a function returns EVERYTHING that is not captured.
  Any command whose output is not piped or assigned gets added to the function's output.

  function Get-Double {
      param([int]$x)
      return $x * 2      - explicit return
  }

  function Get-Values {
      1                  - added to output
      2                  - added to output
      3                  - added to output
  }
  $result = Get-Values   - $result = @(1, 2, 3)
```

---

## Error Handling

```
Types of errors in PowerShell:
  Terminating error   - stops execution (throw, critical failures)
  Non-Terminating     - records in $Error, execution continues

$ErrorActionPreference - how to react to non-terminating errors:
  Continue            - display the error and continue (default)
  SilentlyContinue    - silently ignore
  Stop                - treat as a terminating error
  Inquire             - ask the user what to do

Per-command override:
  Get-Item "no such file" -ErrorAction SilentlyContinue
  Get-Item "no such file" -ErrorAction Stop
  Get-Item "no such file" -ErrorVariable myErr    - store error in $myErr

try / catch / finally:
  try {
      $result = Get-Item "C:\nonexistent.txt" -ErrorAction Stop
  }
  catch [System.IO.FileNotFoundException] {
      Write-Host "File not found: $($_.Exception.Message)"
  }
  catch [System.UnauthorizedAccessException] {
      Write-Host "Access denied"
  }
  catch {
      Write-Host "Unexpected error: $($_.Exception.Message)"
      Write-Host "Type: $($_.Exception.GetType().FullName)"
  }
  finally {
      Write-Host "This block always runs"
  }

Throwing errors:
  throw "Something went wrong"
  throw [System.ArgumentException]::new("Invalid argument")

Error object ($_):
  $_.Exception.Message       - error message text
  $_.Exception.GetType()     - exception type
  $_.InvocationInfo.Line     - line of code where the error occurred
  $_.ScriptStackTrace        - call stack
  $_.CategoryInfo            - error category
```

---

## Providers and PSDrives

PowerShell provides unified access to various data stores through a common interface - as if everything were a file system.

```
Providers (PSProvider):
  Get-PSProvider     - list all providers

  Built-in providers:
  FileSystem     - files and folders (C:\, D:\)
  Registry       - Windows registry (HKLM:, HKCU:)
  Environment    - environment variables (Env:)
  Alias          - command aliases (Alias:)
  Function       - functions (Function:)
  Variable       - variables (Variable:)
  Certificate    - certificates (Cert:)

PSDrives:
  Get-PSDrive    - list all drives

  Navigate like a file system:
  Set-Location HKLM:\SOFTWARE\Microsoft   - navigate into a registry key
  Get-ChildItem HKLM:\SOFTWARE            - list contents of a registry key
  Set-Location Env:                        - navigate to environment variables
  Get-ChildItem Env:                       - list all environment variables
  Get-Item Env:PATH                        - get a specific environment variable

  $env:PATH                               - more convenient Env: access
  $env:USERNAME
  $env:COMPUTERNAME
  $env:WINDIR
  $env:TEMP
```

---

## Working with the File System

```
Navigation:
  Get-Location              - current directory (like pwd)
  Set-Location C:\Windows   - change directory (like cd)
  Set-Location ..           - go up one level
  Push-Location             - save current location and change
  Pop-Location              - return to saved location

  cd, sl                    - aliases for Set-Location
  pwd, gl                   - aliases for Get-Location

Listing contents:
  Get-ChildItem             - directory contents (like dir/ls)
  Get-ChildItem -Recurse    - recursive
  Get-ChildItem -Filter *.log         - only .log files
  Get-ChildItem -Include *.log, *.txt - multiple extensions
  Get-ChildItem -Exclude *.bak        - exclude a pattern
  Get-ChildItem -Hidden               - hidden files
  Get-ChildItem -Depth 2              - max 2 levels deep
  Get-ChildItem | Where-Object { $_.Length -gt 1MB }  - files larger than 1 MB

  dir, ls, gci              - aliases for Get-ChildItem

File operations:
  New-Item -ItemType File -Path C:\test.txt         - create a file
  New-Item -ItemType Directory -Path C:\NewFolder   - create a folder
  Copy-Item C:\a.txt C:\b.txt                       - copy
  Move-Item C:\a.txt C:\backup\a.txt                - move
  Rename-Item C:\old.txt C:\new.txt                 - rename
  Remove-Item C:\test.txt                           - delete a file
  Remove-Item C:\folder -Recurse -Force             - delete a folder recursively
  Test-Path C:\test.txt                             - $true if it exists

Reading and writing files:
  Get-Content C:\file.txt               - read file (returns array of lines)
  Get-Content C:\file.txt -Raw          - read as a single string
  Get-Content C:\file.txt -Tail 10      - last 10 lines
  Get-Content C:\log.txt -Wait          - watch the file for changes (like tail -f)

  Set-Content C:\file.txt "Hello"       - overwrite the file
  Add-Content C:\file.txt "New line"    - append to the end

  "Text" | Out-File C:\file.txt -Encoding UTF8
  "Text" | Out-File C:\file.txt -Append -Encoding UTF8

  [System.IO.File]::ReadAllText("C:\file.txt")  - via .NET (faster for large files)
  [System.IO.File]::WriteAllText("C:\file.txt", $content)
```

---

## Modules

A module is a package of commands (cmdlets, functions, variables, aliases).

```
Working with modules:
  Get-Module                        - currently loaded modules
  Get-Module -ListAvailable         - all available modules
  Get-Module -ListAvailable -All    - including hidden ones

  Import-Module ActiveDirectory     - load a module
  Remove-Module ActiveDirectory     - unload a module

  Import-Module C:\path\MyModule.psm1  - load from a file

Auto-loading (PowerShell 3+):
  When you call a command from a module, PowerShell loads it automatically.
  Get-ADUser -Identity alice   - automatically loads the ActiveDirectory module

PowerShell Gallery:
  Find-Module -Name Pester         - find a module in the gallery
  Install-Module -Name Pester      - install from the gallery
  Update-Module -Name Pester       - update
  Uninstall-Module -Name Pester    - remove

Module locations:
  $env:PSModulePath                - paths where PowerShell looks for modules

  For the current user:
    C:\Users\<User>\Documents\PowerShell\Modules\        (PowerShell 7)
    C:\Users\<User>\Documents\WindowsPowerShell\Modules\ (v5.1)

  System-wide:
    C:\Program Files\PowerShell\Modules\                 (PowerShell 7)
    C:\Windows\System32\WindowsPowerShell\v1.0\Modules\  (v5.1)
    C:\Program Files\WindowsPowerShell\Modules\

Module structure:
  MyModule\
    MyModule.psd1     - manifest (description, version, dependencies)
    MyModule.psm1     - main code file
    Public\           - public functions
    Private\          - private functions
```

---

## Remoting

```
WinRM (Windows Remote Management) - the protocol for remote command execution.
Based on WS-Management (SOAP over HTTP/HTTPS).

Setup:
  Enable-PSRemoting          - enable WinRM (requires Admin)
  Test-WSMan <computer>      - verify WinRM availability

One-off commands:
  Invoke-Command -ComputerName Server01 -ScriptBlock { Get-Process }
  Invoke-Command -ComputerName Server01 -ScriptBlock { param($name) Get-Service $name } -ArgumentList "wuauserv"
  Invoke-Command -ComputerName Server01, Server02 -ScriptBlock { hostname }  - multiple machines at once

Persistent sessions:
  $session = New-PSSession -ComputerName Server01
  Invoke-Command -Session $session -ScriptBlock { Get-Process }
  Enter-PSSession $session        - interactive session (like SSH)
  Exit-PSSession                  - exit
  Remove-PSSession $session       - close the session

With alternate credentials:
  $cred = Get-Credential
  Invoke-Command -ComputerName Server01 -Credential $cred -ScriptBlock { whoami }

Passing variables into Invoke-Command:
  $localVar = "Hello"
  Invoke-Command -ComputerName Server01 -ScriptBlock { Write-Host $using:localVar }
  - $using:var - the way to pass a local variable into a remote script block

Ports and transport:
  HTTP:  port 5985 (transport not encrypted, but the payload is)
  HTTPS: port 5986 (recommended)
```

---

## PowerShell Profiles

A profile is a script that runs automatically when PowerShell starts. Used to configure the environment, load modules, and create aliases.

```
Profile locations:
  $PROFILE                         - current user, current host
  $PROFILE.AllUsersCurrentHost     - all users, current host
  $PROFILE.CurrentUserAllHosts     - current user, all hosts
  $PROFILE.AllUsersAllHosts        - all users, all hosts

  Typical paths:
  Current user, Windows PowerShell:
    C:\Users\<User>\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
  Current user, PowerShell 7:
    C:\Users\<User>\Documents\PowerShell\Microsoft.PowerShell_profile.ps1

Create/open a profile:
  notepad $PROFILE
  code $PROFILE                    - open in VS Code
  if (-not (Test-Path $PROFILE)) { New-Item -Path $PROFILE -Force }

Example profile content:
  # Aliases
  Set-Alias -Name ll -Value Get-ChildItem
  Set-Alias -Name touch -Value New-Item

  # Load modules
  Import-Module Pester

  # Custom prompt
  function prompt {
      $path = (Get-Location).Path
      "PS [$path]> "
  }

  # Settings
  $MaxHistoryCount = 10000

Important: if Execution Policy is Restricted, the profile does not load.
```

---

## Aliases

```
PowerShell ships with many aliases for compatibility with cmd and bash:

  ls, dir, gci   → Get-ChildItem
  cd, sl, chdir  → Set-Location
  pwd, gl        → Get-Location
  cat, gc, type  → Get-Content
  cp, copy       → Copy-Item
  mv, move       → Move-Item
  rm, del, erase → Remove-Item
  mkdir, md      → New-Item -ItemType Directory (or the md function)
  cls, clear     → Clear-Host
  echo           → Write-Output
  sort           → Sort-Object
  where          → Where-Object
  select         → Select-Object
  fl             → Format-List
  ft             → Format-Table
  fw             → Format-Wide
  ogv            → Out-GridView
  measure        → Measure-Object
  foreach        → ForEach-Object
  ?              → Where-Object
  %              → ForEach-Object
  h, history     → Get-History
  r              → Invoke-History
  ps, gps        → Get-Process
  kill, spps     → Stop-Process
  sleep          → Start-Sleep
  date           → Get-Date

Managing aliases:
  Get-Alias                  - all aliases
  Get-Alias ls               - what ls maps to
  Set-Alias -Name touch -Value New-Item    - create an alias
  New-Alias -Name np -Value notepad        - another way
  Export-Alias -Path aliases.txt           - export
  Import-Alias -Path aliases.txt           - import

  Aliases only live in the current session.
  To persist them, add them to $PROFILE.
```

---

## Useful Built-in Commands

```
Processes:
  Get-Process               - list processes
  Get-Process chrome        - a specific process
  Stop-Process -Name chrome - terminate a process
  Stop-Process -Id 1234     - terminate by PID
  Start-Process notepad     - launch a program
  Start-Process cmd -Verb RunAs    - launch as administrator

Services:
  Get-Service               - all services
  Get-Service wuauserv      - a specific service
  Start-Service wuauserv    - start
  Stop-Service wuauserv     - stop
  Restart-Service wuauserv  - restart
  Set-Service wuauserv -StartupType Disabled  - change start type

Registry (via PSDrive):
  Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion -Name ProgramFilesDir
  Set-ItemProperty HKCU:\Software\MyApp -Name "Theme" -Value "Dark"
  New-Item -Path HKCU:\Software\MyApp -Force
  Remove-Item -Path HKCU:\Software\MyApp -Recurse

Networking:
  Test-NetConnection google.com -Port 443   - test TCP connectivity
  Test-NetConnection google.com             - test ping
  Resolve-DnsName google.com                - DNS query
  Get-NetIPAddress                          - IP addresses on adapters
  Get-NetRoute                              - routing table
  Get-NetTCPConnection                      - active TCP connections

Date and time:
  Get-Date                          - current date and time
  Get-Date -Format "yyyy-MM-dd"     - formatted string
  Get-Date -Format "HH:mm:ss"       - time only
  (Get-Date).AddDays(7)             - date 7 days from now
  (Get-Date) - [datetime]"2026-01-01"  - difference as a TimeSpan

Other:
  Get-ComputerInfo          - system information
  Get-Hotfix                - installed updates
  Get-EventLog -LogName System -Newest 20   - recent System Log events
  Get-WinEvent -LogName Security -MaxEvents 10  - newer alternative
  Invoke-WebRequest https://example.com     - HTTP request (like curl/wget)
  Invoke-RestMethod https://api.example.com/data  - REST API calls
  Start-Sleep -Seconds 5    - pause
  Clear-Host                - clear the screen
  Get-History               - session command history
  Invoke-History 5          - run command #5 from history
```

---

## Cheat Sheet

```
PowerShell philosophy:
  Everything is an object. The pipeline passes objects, not strings.
  Cmdlets: Verb-Noun
  $_ = current object in the pipeline

Variables:
  $var = value
  $_ = current pipeline object
  $? = result of the last command
  $Error[0] = most recent error
  $env:VAR = environment variable

Data types:
  "str" / 'str'   [String]
  42              [Int32]
  $true / $false  [Boolean]
  @(1,2,3)        [Array]
  @{K="V"}        [Hashtable]
  1..10           range

Comparison operators:
  -eq -ne -gt -lt -ge -le
  -like -match -contains -in
  -and -or -not

Pipeline:
  cmd1 | cmd2 | cmd3
  | Where-Object { $_.Prop -eq "val" }
  | Select-Object Name, CPU
  | Sort-Object Name -Descending
  | ForEach-Object { $_.DoSomething() }
  | Group-Object PropertyName
  | Measure-Object -Sum -Average

Files:
  Get-ChildItem / Get-Content / Set-Content / Add-Content
  New-Item / Copy-Item / Move-Item / Remove-Item / Test-Path

Help:
  Get-Help <cmdlet> -Examples
  Get-Command *keyword*
  Get-Member                  (explore object structure)
  Get-PSProvider / Get-PSDrive

Execution Policy:
  Get-ExecutionPolicy
  Set-ExecutionPolicy RemoteSigned
  powershell -ExecutionPolicy Bypass -File script.ps1

Version:
  $PSVersionTable.PSVersion
  $PSVersionTable.PSEdition   - Desktop (v5.1) or Core (v7)
```

---

## References

- [Microsoft Docs: PowerShell](https://learn.microsoft.com/en-us/powershell/) - official documentation
- [PowerShell GitHub](https://github.com/PowerShell/PowerShell) - PowerShell 7 source code
- [PowerShell Gallery](https://www.powershellgallery.com/) - module repository
- [SS64 PowerShell Reference](https://ss64.com/ps/) - quick reference for all commands
- [Learn PowerShell in a Month of Lunches](https://www.manning.com/books/learn-powershell-in-a-month-of-lunches) - beginner book
