---
title: "Windows - Named Pipes and IPC"
date: "2026-05-15"
---

IPC (Inter-Process Communication) is a set of Windows mechanisms for exchanging data between processes. Named Pipes are one of the primary mechanisms, widely used by system services, the SMB protocol, administration tools, and unfortunately malware as well. Understanding IPC is critical for system programming, administration, and security analysis.

---

## Overview of IPC Mechanisms in Windows

```
Windows provides several IPC mechanisms:

Named Pipes
  - Named channel with full-duplex data transfer
  - Works locally and over the network (via SMB \pipe\)
  - Supports authentication and impersonation
  - Used by: SMB, RPC, PsExec, WMI, Print Spooler, etc.

Anonymous Pipes
  - Unnamed, unidirectional channel
  - Only between processes with a common ancestor (parent → child)
  - Used for: redirecting child process stdout/stderr
  - cmd.exe | findstr, PowerShell pipeline

Mailslots
  - One-way broadcast data transfer
  - Supports sending to one host or all hosts on the network
  - Limited message size (up to 424 bytes for network)
  - Used by: Browser Service, NetBIOS broadcasts (legacy)

Shared Memory (File Mapping)
  - Memory region accessible to multiple processes simultaneously
  - Fastest IPC - no data copying between processes
  - Used by: DDE, COM out-of-process, antivirus, clipboard

Sockets
  - TCP/UDP connections (including localhost loopback)
  - Standard for network communication
  - AF_UNIX (Unix Domain Sockets) available on Windows 10 1803+

RPC (Remote Procedure Call)
  - High-level IPC built on top of Named Pipes / TCP / HTTP
  - Handles data marshaling automatically
  - Used by: most Windows services

COM / DCOM
  - Object-oriented IPC
  - DCOM: COM over RPC for remote objects
  - Used by: WMI, Shell, Office Automation, etc.

LPC / ALPC (Advanced Local Procedure Call)
  - Kernel mechanism used internally by Windows
  - Not directly accessible via Win32 API (only via ntdll)
  - Used by: csrss.exe, lsass.exe, system services

Clipboard
  - Data exchange through the clipboard
  - Supports different formats (text, images, files, etc.)
  - Local only

WM_COPYDATA
  - Data transfer via Windows messages
  - Between processes of the same or different integrity levels
  - (UIPI restricts sending from Low IL to Higher IL)
```

---

## Named Pipes - Basics

### What is a Named Pipe

```
Named Pipe - a kernel object implementing a full-duplex
data channel between processes.

Pipe namespace:
  Local:   \\.\pipe\<name>
  Remote:  \\<server>\pipe\<name>

  Examples of real system pipes:
    \\.\pipe\lsass               - LSASS (authentication)
    \\.\pipe\svcctl              - Service Control Manager
    \\.\pipe\winreg              - Remote Registry
    \\.\pipe\netlogon            - NetLogon
    \\.\pipe\spoolss             - Print Spooler
    \\.\pipe\epmapper            - RPC Endpoint Mapper
    \\.\pipe\wkssvc              - Workstation Service
    \\.\pipe\srvsvc              - Server Service
    \\.\pipe\atsvc               - Task Scheduler
    \\.\pipe\browser             - Computer Browser
    \\.\pipe\sql\query           - SQL Server (example)
    \\.\pipe\psexecsvc           - PsExec service (when in use)
    \\.\pipe\msagent_<random>    - Metasploit payload

Key characteristics:
  - Bidirectional transfer (full-duplex)
  - Byte stream or message mode
  - Multiple simultaneous instances supported
  - Security Descriptor (ACL/DACL) support
  - Server can impersonate the client
  - Works over the network via SMB (TCP 445)

Server-client architecture:
  Server creates pipe → waits for connections
  Client connects to pipe → exchanges data
  Multiple clients → multiple pipe instances
```

### Named Pipe Types

```
By transfer direction:
  PIPE_ACCESS_INBOUND    - server reads only (client writes)
  PIPE_ACCESS_OUTBOUND   - server writes only (client reads)
  PIPE_ACCESS_DUPLEX     - full-duplex (most common)

By operating mode:
  PIPE_TYPE_BYTE         - byte stream (continuous, no message boundaries)
  PIPE_TYPE_MESSAGE      - message mode (each WriteFile = one message)

By read mode:
  PIPE_READMODE_BYTE     - read as a byte stream
  PIPE_READMODE_MESSAGE  - read as messages (with PIPE_TYPE_MESSAGE)

By wait mode:
  PIPE_WAIT              - blocking (ReadFile waits for data)
  PIPE_NOWAIT            - non-blocking (ReadFile returns immediately)
  (PIPE_NOWAIT is deprecated; prefer Overlapped I/O or I/O Completion Ports)

Common combinations:
  Typical for RPC:
    PIPE_ACCESS_DUPLEX | PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT
  
  Typical for streaming:
    PIPE_ACCESS_DUPLEX | PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT
```

---

## Named Pipes - Programming

### Server Side (C / Win32)

```c
#include <windows.h>
#include <stdio.h>

#define PIPE_NAME  L"\\\\.\\pipe\\mypipe"
#define BUFFER_SIZE 4096

// Simple synchronous server (single client)
void simple_server() {
    HANDLE hPipe;
    char buffer[BUFFER_SIZE];
    DWORD bytesRead, bytesWritten;
    BOOL connected;

    // Create the pipe
    hPipe = CreateNamedPipe(
        PIPE_NAME,                           // pipe name
        PIPE_ACCESS_DUPLEX,                  // server reads and writes
        PIPE_TYPE_MESSAGE |                  // message mode
        PIPE_READMODE_MESSAGE |              // read as messages
        PIPE_WAIT,                           // blocking mode
        PIPE_UNLIMITED_INSTANCES,            // max instances
        BUFFER_SIZE,                         // outbound buffer size
        BUFFER_SIZE,                         // inbound buffer size
        0,                                   // default timeout (50ms)
        NULL                                 // security attributes (NULL = default)
    );

    if (hPipe == INVALID_HANDLE_VALUE) {
        printf("CreateNamedPipe failed: %d\n", GetLastError());
        return;
    }

    printf("Pipe created, waiting for client...\n");

    // Wait for client connection
    connected = ConnectNamedPipe(hPipe, NULL);  // NULL = synchronous wait
    if (!connected && GetLastError() != ERROR_PIPE_CONNECTED) {
        printf("ConnectNamedPipe failed: %d\n", GetLastError());
        CloseHandle(hPipe);
        return;
    }

    printf("Client connected!\n");

    // Read data from client
    while (ReadFile(hPipe, buffer, BUFFER_SIZE, &bytesRead, NULL)) {
        printf("Received (%d bytes): %.*s\n", bytesRead, bytesRead, buffer);

        // Send a response
        const char* response = "Server got your message!";
        WriteFile(hPipe, response, strlen(response), &bytesWritten, NULL);
    }

    // Client disconnected
    FlushFileBuffers(hPipe);
    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);
}

// Multi-threaded server - new thread per client
DWORD WINAPI ClientHandler(LPVOID lpParam) {
    HANDLE hPipe = (HANDLE)lpParam;
    char buffer[BUFFER_SIZE];
    DWORD bytesRead, bytesWritten;

    while (ReadFile(hPipe, buffer, BUFFER_SIZE, &bytesRead, NULL)) {
        // process message
        WriteFile(hPipe, buffer, bytesRead, &bytesWritten, NULL);  // echo
    }

    FlushFileBuffers(hPipe);
    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);
    return 0;
}

void multi_client_server() {
    while (TRUE) {
        HANDLE hPipe = CreateNamedPipe(
            PIPE_NAME,
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            PIPE_UNLIMITED_INSTANCES,  // key: allows multiple instances
            BUFFER_SIZE, BUFFER_SIZE, 0, NULL
        );

        if (hPipe == INVALID_HANDLE_VALUE) break;

        // Block waiting for a connection
        BOOL connected = ConnectNamedPipe(hPipe, NULL);
        if (connected || GetLastError() == ERROR_PIPE_CONNECTED) {
            // Spawn a thread to handle this client
            HANDLE hThread = CreateThread(NULL, 0, ClientHandler, hPipe, 0, NULL);
            if (hThread) CloseHandle(hThread);  // release thread handle
            // hPipe is now owned by the ClientHandler thread
        } else {
            CloseHandle(hPipe);
        }
    }
}
```

### Server Side with Security Descriptor

```c
// Create a pipe with an explicit DACL
HANDLE create_secure_pipe() {
    PSECURITY_DESCRIPTOR pSD = NULL;

    // SDDL: D:(A;;GA;;;WD)  = DACL: Allow GenericAll for Everyone
    // Restricted access:
    // D:(A;;0x12019f;;;WD)  = ReadWrite + Synchronize for Everyone only
    // D:(A;;GA;;;BA)        = Full Control for Administrators only

    ConvertStringSecurityDescriptorToSecurityDescriptor(
        L"D:(A;;GA;;;WD)",   // SDDL string
        SDDL_REVISION_1,
        &pSD,
        NULL
    );

    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.lpSecurityDescriptor = pSD;
    sa.bInheritHandle = FALSE;

    HANDLE hPipe = CreateNamedPipe(
        L"\\\\.\\pipe\\securepipe",
        PIPE_ACCESS_DUPLEX,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
        1,              // single instance only
        4096, 4096, 0,
        &sa             // apply Security Descriptor
    );

    if (pSD) LocalFree(pSD);
    return hPipe;
}
```

### Client Side

```c
void pipe_client() {
    HANDLE hPipe;
    char buffer[4096];
    DWORD bytesRead, bytesWritten;

    // Wait until the pipe becomes available (all instances may be busy)
    while (TRUE) {
        hPipe = CreateFile(
            L"\\\\.\\pipe\\mypipe",   // pipe name
            GENERIC_READ | GENERIC_WRITE, // read + write
            0,                        // no sharing
            NULL,                     // default security
            OPEN_EXISTING,            // pipe must already exist
            0,                        // file attributes (0 = synchronous)
            NULL                      // no template file
        );

        if (hPipe != INVALID_HANDLE_VALUE) break;  // success

        if (GetLastError() != ERROR_PIPE_BUSY) {
            printf("CreateFile failed: %d\n", GetLastError());
            return;
        }

        // All instances busy - wait up to 20 seconds
        if (!WaitNamedPipe(L"\\\\.\\pipe\\mypipe", 20000)) {
            printf("WaitNamedPipe timed out\n");
            return;
        }
    }

    // Set read mode to MESSAGE
    DWORD mode = PIPE_READMODE_MESSAGE;
    SetNamedPipeHandleState(hPipe, &mode, NULL, NULL);

    // Send data
    const char* msg = "Hello from client!";
    WriteFile(hPipe, msg, strlen(msg), &bytesWritten, NULL);

    // Receive response
    ReadFile(hPipe, buffer, sizeof(buffer), &bytesRead, NULL);
    printf("Server replied: %.*s\n", bytesRead, buffer);

    CloseHandle(hPipe);
}
```

### PowerShell - Working with Named Pipes

```powershell
# Server in PowerShell (System.IO.Pipes)

# Server side
$server = New-Object System.IO.Pipes.NamedPipeServerStream(
    "mypipe",
    [System.IO.Pipes.PipeDirection]::InOut,
    1,                                                    # maxNumberOfServerInstances
    [System.IO.Pipes.PipeTransmissionMode]::Message,
    [System.IO.Pipes.PipeOptions]::None
)

Write-Host "Waiting for connection..."
$server.WaitForConnection()
Write-Host "Client connected!"

$reader = New-Object System.IO.StreamReader($server)
$writer = New-Object System.IO.StreamWriter($server)
$writer.AutoFlush = $true

# Read messages
while ($server.IsConnected) {
    $line = $reader.ReadLine()
    if ($line) {
        Write-Host "Received: $line"
        $writer.WriteLine("Echo: $line")
    }
}

$server.Disconnect()
$server.Dispose()

# -----------------------------------------------

# Client side
$client = New-Object System.IO.Pipes.NamedPipeClientStream(
    ".",        # server ("." = local)
    "mypipe",   # pipe name
    [System.IO.Pipes.PipeDirection]::InOut
)

$client.Connect(5000)  # 5 second timeout

$reader = New-Object System.IO.StreamReader($client)
$writer = New-Object System.IO.StreamWriter($client)
$writer.AutoFlush = $true

$writer.WriteLine("Hello from PowerShell client!")
$response = $reader.ReadLine()
Write-Host "Server says: $response"

$client.Dispose()

# -----------------------------------------------

# Connect to a remote pipe (via SMB)
$client = New-Object System.IO.Pipes.NamedPipeClientStream(
    "SERVER01",    # server name
    "mypipe",
    [System.IO.Pipes.PipeDirection]::InOut
)
$client.Connect(10000)
```

### Overlapped I/O (Asynchronous Mode)

```c
// Create a pipe with FILE_FLAG_OVERLAPPED for async operations
HANDLE hPipe = CreateNamedPipe(
    PIPE_NAME,
    PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,  // key flag
    PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
    PIPE_UNLIMITED_INSTANCES,
    BUFFER_SIZE, BUFFER_SIZE, 0, NULL
);

// Async client connection
OVERLAPPED ol = {0};
ol.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

ConnectNamedPipe(hPipe, &ol);
// Does not block! Returns ERROR_IO_PENDING if no client yet

// Wait for the event (or do something useful in the meantime)
WaitForSingleObject(ol.hEvent, INFINITE);
// Client has connected

// Async read
char buffer[BUFFER_SIZE];
OVERLAPPED readOl = {0};
readOl.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

ReadFile(hPipe, buffer, BUFFER_SIZE, NULL, &readOl);
// Does not block! Continue doing work

WaitForSingleObject(readOl.hEvent, INFINITE);
DWORD bytesRead;
GetOverlappedResult(hPipe, &readOl, &bytesRead, FALSE);
// Data is in buffer
```

---

## Named Pipes - Impersonation

```
Impersonation - a key feature of Named Pipes.
The server can temporarily adopt the identity of the connected client.

This allows:
  - Performing operations on behalf of the client
  - Checking the client's access rights
  - Restricting what the client can do through the pipe

Server requirements:
  SeImpersonatePrivilege - "Impersonate a client after authentication"
  Held by default: Local System, Network Service, Administrators

Impersonation levels:
  SECURITY_ANONYMOUS      - client is anonymous; server knows nothing about them
  SECURITY_IDENTIFICATION - server can identify the client (read their SID)
                            but CANNOT act on their behalf
  SECURITY_IMPERSONATION  - server acts as the client (local only)
  SECURITY_DELEGATION     - server can delegate (Kerberos delegation)
```

```c
// Impersonation on the server side
void server_with_impersonation(HANDLE hPipe) {
    // Client is connected and has sent data...

    // Begin impersonation
    if (!ImpersonateNamedPipeClient(hPipe)) {
        printf("ImpersonateNamedPipeClient failed: %d\n", GetLastError());
        return;
    }

    // The thread now runs with the client's token
    // Check who connected:
    HANDLE hToken;
    OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, TRUE, &hToken);

    // Get username from token
    // ... GetTokenInformation → LookupAccountSid ...

    // Try to open a file as the client
    // If the client lacks rights - CreateFile will fail
    HANDLE hFile = CreateFileW(
        L"C:\\SensitiveFile.txt",
        GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL
    );

    // End impersonation - return to own token
    RevertToSelf();

    if (hFile != INVALID_HANDLE_VALUE) {
        // client has access to the file
        CloseHandle(hFile);
    }
}
```

```powershell
# Impersonation in PowerShell via P/Invoke
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;

public class PipeImpersonation {
    [DllImport("advapi32.dll", SetLastError=true)]
    public static extern bool ImpersonateNamedPipeClient(IntPtr hNamedPipe);
    
    [DllImport("advapi32.dll", SetLastError=true)]
    public static extern bool RevertToSelf();
}
"@
Add-Type -TypeDefinition $code

$server = New-Object System.IO.Pipes.NamedPipeServerStream("testpipe",
    [System.IO.Pipes.PipeDirection]::InOut, 1,
    [System.IO.Pipes.PipeTransmissionMode]::Byte,
    [System.IO.Pipes.PipeOptions]::None,
    1024, 1024,
    $null,
    [System.IO.HandleInheritability]::None,
    [System.IO.Pipes.PipeAccessRights]::FullControl
)
$server.WaitForConnection()

# Impersonate
$handle = $server.SafePipeHandle.DangerousGetHandle()
[PipeImpersonation]::ImpersonateNamedPipeClient($handle)

# Running as the client now
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
Write-Host "Impersonating: $($identity.Name)"

[PipeImpersonation]::RevertToSelf()
```

### Token Impersonation Attacks (Named Pipe Potato)

```
Classic attack: obtain a privileged token through impersonation.

If a process has SeImpersonatePrivilege (typical for services, IIS workers, etc.):

1. Create a Named Pipe
2. Force a privileged process (SYSTEM) to connect to our pipe.
   Forcing methods:
   - PrintSpooler bug (MS-RPRN): SpoolService forced to connect to arbitrary pipe
   - StorSvc bug
   - BITS COM escalation
3. Call ImpersonateNamedPipeClient → get a SYSTEM token
4. CreateProcessWithToken → launch a process as SYSTEM

This is the foundation of the "Potato" attack family:
  - HotPotato (2016): NBNS spoofing + NTLM relay + pipe
  - RottenPotato (2016): DCOM + pipe impersonation
  - JuicyPotato (2018): extended RottenPotato
  - PrintSpoofer (2020): SpoolSample + pipe
  - RoguePotato (2020): no COM restrictions
  - GodPotato (2023): works on Windows 11 / Server 2022

Defenses:
  SeImpersonatePrivilege only for services that genuinely need it
  Credential Guard reduces value of obtained tokens
  Newer Windows versions close specific vectors (PrintSpooler disabled)
```

---

## Anonymous Pipes

```
Anonymous Pipe - an unnamed, unidirectional channel.
Created as a pair: HANDLE (write end) + HANDLE (read end).
Transferred only via handle inheritance to child processes.

Typical use: capture stdout/stderr of a child process.
```

```c
#include <windows.h>
#include <stdio.h>

// Launch a child process and capture its stdout
void capture_child_output() {
    HANDLE hReadPipe, hWritePipe;
    SECURITY_ATTRIBUTES sa = {sizeof(sa), NULL, TRUE};  // bInheritHandle = TRUE!

    // Create anonymous pipe
    if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
        return;
    }

    // Read end must NOT be inherited by our process
    SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);

    // Configure STARTUPINFO to redirect stdout
    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdOutput = hWritePipe;   // child stdout → our write end
    si.hStdError  = hWritePipe;   // capture stderr too
    si.hStdInput  = GetStdHandle(STD_INPUT_HANDLE);

    PROCESS_INFORMATION pi = {0};

    // Launch the child process
    BOOL ok = CreateProcessW(
        NULL,
        L"cmd.exe /c dir C:\\",  // command
        NULL, NULL,
        TRUE,   // bInheritHandles = TRUE - child inherits hWritePipe
        0, NULL, NULL,
        &si, &pi
    );

    // Close write end in our process (otherwise ReadFile never gets EOF)
    CloseHandle(hWritePipe);

    // Read child output
    char buffer[4096];
    DWORD bytesRead;
    while (ReadFile(hReadPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL)) {
        buffer[bytesRead] = '\0';
        printf("%s", buffer);
    }

    CloseHandle(hReadPipe);
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
}
```

```powershell
# PowerShell - capture output via anonymous pipe (built-in support)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c ipconfig /all"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()

Write-Host $stdout
```

---

## Mailslots

```
Mailslot - a mechanism for one-way broadcast message delivery.
Client writes, server reads. One direction only.
Supports sending to all computers on the network (broadcast).

Characteristics:
  - Server creates the mailslot
  - Client opens it by name and writes
  - Server cannot reply through the same mailslot
  - Max 424 bytes per message (for network; larger locally)
  - Delivery is unreliable (UDP-like, no acknowledgment)

Namespace:
  Local:    \\.\mailslot\<name>
  Specific: \\<server>\mailslot\<name>
  Broadcast:  \\*\mailslot\<name>       (all machines on the network)
  Domain:   \\<domain>\mailslot\<name>  (all machines in the domain)
```

```c
// Mailslot server (reads messages)
void mailslot_server() {
    HANDLE hMailslot = CreateMailslot(
        L"\\\\.\\mailslot\\mymailslot",
        0,                      // max message size (0 = any)
        MAILSLOT_WAIT_FOREVER,  // wait indefinitely
        NULL                    // security attributes
    );

    char buffer[512];
    DWORD bytesRead, msgSize, msgCount;

    while (TRUE) {
        GetMailslotInfo(hMailslot, NULL, &msgSize, &msgCount, NULL);

        if (msgCount > 0) {
            ReadFile(hMailslot, buffer, sizeof(buffer), &bytesRead, NULL);
            printf("Message: %.*s\n", bytesRead, buffer);
        }
        Sleep(100);
    }
    CloseHandle(hMailslot);
}

// Mailslot client (writes messages)
void mailslot_client(LPCWSTR target) {
    // target = L"\\\\.\\mailslot\\mymailslot"          (local)
    //        = L"\\\\SERVER\\mailslot\\mymailslot"     (specific server)
    //        = L"\\\\*\\mailslot\\mymailslot"          (broadcast)

    HANDLE hFile = CreateFile(
        target,
        GENERIC_WRITE,
        FILE_SHARE_READ,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hFile == INVALID_HANDLE_VALUE) return;

    DWORD written;
    const char* msg = "Hello from mailslot client";
    WriteFile(hFile, msg, strlen(msg), &written, NULL);
    CloseHandle(hFile);
}
```

---

## Shared Memory (File Mapping)

```
Shared Memory - multiple processes map the same memory region.
Most performant IPC: data is not copied between processes.

Implemented via File Mapping objects:
  CreateFileMapping  - create a mapping (INVALID_HANDLE_VALUE = RAM only, no file)
  OpenFileMapping    - open an existing mapping by name
  MapViewOfFile      - map into the process address space
  UnmapViewOfFile    - unmap
  CloseHandle        - close the mapping

Namespace:
  Global:  Global\<name>  (visible to all sessions)
  Local:   Local\<name>   (current session only)
  (or just <name> without prefix - usually Local)
```

```c
// Producer process (creates shared memory)
void shared_memory_producer() {
    // Create file mapping (in RAM, not backed by a file)
    HANDLE hMapFile = CreateFileMapping(
        INVALID_HANDLE_VALUE,   // in RAM, not a file
        NULL,                   // security attributes
        PAGE_READWRITE,         // access rights
        0,                      // size high DWORD (0 for <4GB)
        1024,                   // size low DWORD (1KB)
        L"Global\\SharedMemDemo"  // name (Global\ for cross-session)
    );

    if (!hMapFile) return;

    // Map into the address space
    LPVOID pView = MapViewOfFile(
        hMapFile,
        FILE_MAP_ALL_ACCESS,  // read + write
        0, 0,                 // offset (0 = from the start)
        1024                  // how many bytes to map
    );

    if (!pView) {
        CloseHandle(hMapFile);
        return;
    }

    // Write data to shared memory
    // (another process will see this immediately)
    strcpy((char*)pView, "Hello from producer!");

    printf("Data written to shared memory. Press Enter to exit...\n");
    getchar();

    UnmapViewOfFile(pView);
    CloseHandle(hMapFile);
}

// Consumer process (reads shared memory)
void shared_memory_consumer() {
    // Open existing mapping by name
    HANDLE hMapFile = OpenFileMapping(
        FILE_MAP_READ,           // read only
        FALSE,                   // do not inherit
        L"Global\\SharedMemDemo"  // mapping name
    );

    if (!hMapFile) {
        printf("Cannot open shared memory: %d\n", GetLastError());
        return;
    }

    LPVOID pView = MapViewOfFile(hMapFile, FILE_MAP_READ, 0, 0, 1024);
    if (!pView) {
        CloseHandle(hMapFile);
        return;
    }

    printf("Read from shared memory: %s\n", (char*)pView);

    UnmapViewOfFile(pView);
    CloseHandle(hMapFile);
}
```

```powershell
# Shared Memory in PowerShell via MemoryMappedFile
Add-Type -AssemblyName System.IO.MemoryMappedFiles

# Producer
$mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::CreateNew(
    "SharedMemDemo",  # name
    1024              # size
)
$accessor = $mmf.CreateViewAccessor()
$text = [System.Text.Encoding]::UTF8.GetBytes("Hello from PowerShell!")
$accessor.WriteArray(0, $text, 0, $text.Length)
Write-Host "Written to shared memory"
# Do not dispose $mmf while access is needed!

# Consumer (in another process)
$mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("SharedMemDemo")
$accessor = $mmf.CreateViewAccessor()
$buffer = New-Object byte[] 100
$accessor.ReadArray(0, $buffer, 0, $buffer.Length)
$text = [System.Text.Encoding]::UTF8.GetString($buffer).TrimEnd([char]0)
Write-Host "Read: $text"
$mmf.Dispose()
```

### Synchronizing Shared Memory

```c
// Shared Memory without synchronization causes race conditions.
// Use Mutex or Event for coordination.

HANDLE hMutex = CreateMutex(NULL, FALSE, L"Global\\SharedMemMutex");
HANDLE hDataReady = CreateEvent(NULL, FALSE, FALSE, L"Global\\DataReadyEvent");

// Producer:
WaitForSingleObject(hMutex, INFINITE);  // acquire mutex
// ... write data to shared memory ...
ReleaseMutex(hMutex);
SetEvent(hDataReady);  // signal consumer

// Consumer:
WaitForSingleObject(hDataReady, INFINITE);  // wait for signal
WaitForSingleObject(hMutex, INFINITE);      // acquire mutex
// ... read data ...
ReleaseMutex(hMutex);
```

---

## RPC - Remote Procedure Call

```
RPC - a high-level mechanism for calling functions in other processes or on other machines.
Abstracts the transport (Named Pipe, TCP, HTTP) and data marshaling.

RPC components:
  IDL (Interface Definition Language) - interface description
  MIDL compiler  - compiles IDL into stub code
  Client stub    - marshals parameters on the client
  Server stub    - unmarshals and calls the real function
  RPC Runtime    - transport, authentication, error handling

RPC transports (protocols):
  ncalrpc      - Local RPC (ALPC, fastest, local only)
  ncacn_np     - Named Pipe (via SMB)
  ncacn_ip_tcp - TCP/IP (for network RPC)
  ncacn_http   - HTTP (via IIS)
  ncacn_nb_tcp - NetBIOS (legacy)

Endpoint Mapper (epmapper):
  Service on every machine (TCP 135)
  Client asks: "Where is interface X?"
  Epmapper replies: "On pipe \\.\pipe\abc" or "TCP port 49152"
  Client connects directly to the specified endpoint
```

```c
// IDL file for a simple RPC interface (hello.idl)
/*
[
    uuid(12345678-1234-1234-1234-123456789abc),
    version(1.0),
    endpoint("ncacn_np:[\\pipe\\hello]")
]
interface HelloInterface {
    void SayHello([in, string] wchar_t* name, [out, string] wchar_t** greeting);
}
*/

// After MIDL compilation: hello_s.c (server stub) and hello_c.c (client stub)

// Server implementation:
void SayHello(handle_t binding, wchar_t* name, wchar_t** greeting) {
    wchar_t buf[256];
    swprintf(buf, 256, L"Hello, %s!", name);
    *greeting = (wchar_t*)midl_user_allocate((wcslen(buf) + 1) * sizeof(wchar_t));
    wcscpy(*greeting, buf);
}

void rpc_server() {
    RpcServerUseProtseqEpW(L"ncacn_np", RPC_C_PROTSEQ_MAX_REQS_DEFAULT, L"\\pipe\\hello", NULL);
    RpcServerRegisterIf(HelloInterface_v1_0_s_ifspec, NULL, NULL);
    RpcServerListen(1, RPC_C_LISTEN_MAX_CALLS_DEFAULT, FALSE);
}

// Client:
void rpc_client() {
    RPC_WSTR binding;
    RpcStringBindingComposeW(NULL, L"ncacn_np", L"\\\\.", L"\\pipe\\hello", NULL, &binding);
    RpcBindingFromStringBindingW(binding, &hBinding);
    RpcStringFreeW(&binding);

    wchar_t* greeting = NULL;
    SayHello(hBinding, L"World", &greeting);
    wprintf(L"%s\n", greeting);
    midl_user_free(greeting);

    RpcBindingFree(&hBinding);
}
```

```powershell
# View RPC endpoints on the system

# Dynamic RPC ports in use (typically 49152+)
netstat -ano | findstr "LISTEN" | findstr ":49"

# View RPC service configuration
Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\RpcSs"

# Remote enumeration with Impacket:
# python rpcdump.py 192.168.1.10

# Use Process Monitor to capture RPC traffic:
# Filter: Operation=TCP Connect AND Path contains :135
```

---

## Viewing and Analyzing Named Pipes

### Built-in Tools

```powershell
# View all open Named Pipes

# Method 1: via .NET
[System.IO.Directory]::GetFiles("\\\\.\\pipe\\") | Sort-Object

# Method 2: via path
Get-ChildItem \\.\pipe\ | Sort-Object Name

# Method 3: detailed info with pipelist (Sysinternals)
# pipelist.exe /accepteula

# Method 4: list pipe names only
[System.IO.Directory]::GetFiles("\\\\.\\pipe\\") |
    ForEach-Object { $_.Replace("\\.\pipe\", "") } | Sort-Object

# Get DACL of a specific pipe
Get-Acl "\\.\pipe\lsass" | Format-List

# Find pipes accessible to specific user
accesschk.exe -l \pipe\spoolss /accepteula
```

### Sysinternals Tools

```
pipelist.exe
  Lists all Named Pipes with instance counts.
  pipelist.exe /accepteula

  Output:
  Pipe Name                                    Instances  Max Instances
  ------------------------------------------------------------
  InitShutdown                                      3          -1
  lsass                                             4          -1
  ntsvcs                                            3          -1
  scerpc                                            1           1
  Winsock2\CatalogChangeListener-34c-0             1           1

handle.exe
  Shows all open handles including pipe handles.
  handle.exe -a pipe /accepteula     # all handles of type pipe
  handle.exe -p lsass.exe /accepteula  # handles of the lsass process

accesschk.exe
  Check access rights on a pipe.
  accesschk.exe -l \pipe\lsass /accepteula     # DACL of lsass pipe
  accesschk.exe -w \pipe\ /accepteula           # pipes writable by current user

Process Monitor (procmon.exe)
  Filters for IPC analysis:
    Operation: CreatePipe, ConnectPipe, ReadFile, WriteFile
    Path: contains "pipe"
  Useful for: seeing which processes create/use which pipes.
```

### Process Monitor Filters for IPC Analysis

```
In Process Monitor (Sysinternals) set these filters:

For Named Pipes:
  Operation = CreatePipe      → creation of new pipes
  Operation = ConnectPipe     → client connections
  Path contains \\pipe\\      → any pipe operation

For Shared Memory:
  Operation = CreateFileMapping → mapping creation
  Operation = OpenFileMapping   → opening existing mappings
  Path contains Global\\        → global mappings

For RPC:
  Path contains epmapper        → endpoint mapper requests

Save filters: Filter → Save Filter → *.pmc file
```

---

## Named Pipe Security

### Pipe Security Descriptor

```
Named Pipes have a Security Descriptor just like files.
When creating a pipe you can set a DACL that controls who can connect.

If Security Descriptor is not set (NULL):
  Default DACL is applied to the pipe.
  Default allows: creator Full Control + Authenticated Users Read/Write

Check a pipe's DACL:
  accesschk.exe -l \pipe\<name>
  # Or via Process Explorer: pipe handle → Security

Typical DACLs for system pipes:
  \\.\pipe\lsass:
    SYSTEM - Full Control
    Administrators - Full Control
    (nobody else has access)

  \\.\pipe\spoolss:
    Everyone - ReadWrite    ← frequently targeted in attacks!
    SYSTEM - Full Control
```

### Pipe Security - Attacks and Defenses

```
Attack 1: Pipe Squatting / Pipe Pre-Creation
  Attacker creates a pipe with a system service name BEFORE the service starts.
  When the service starts and tries to create the pipe - it fails.
  But if nMaxInstances > 1 - both instances may coexist.
  
  Defense:
    - Use FILE_FLAG_FIRST_PIPE_INSTANCE when creating the pipe
      (CreateNamedPipe returns an error if the pipe already exists)
    - Create pipes in the correct order at startup.

  FILE_FLAG_FIRST_PIPE_INSTANCE:
    HANDLE hPipe = CreateNamedPipe(
        pipeName,
        PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,  // add flag
        ...
    );
    // Returns ERROR_ACCESS_DENIED if the pipe already exists

Attack 2: Pipe Impersonation for LPE
  Described above (Potato family).
  Defense: restrict SeImpersonatePrivilege, keep OS updated.

Attack 3: Malware using pipes as C2 channel
  Especially with PsExec-like techniques.
  Malware creates a pipe with a random name for communicating with its payload.
  
  Detection: monitor creation of new pipes by unusual processes.
  Sysmon Event 17: Pipe Created
  Sysmon Event 18: Pipe Connected

Attack 4: Lateral Movement via Named Pipes (PsExec-style)
  PsExec creates a service on the remote machine → service creates a pipe for I/O.
  Malware uses the same techniques.
  
  Detection: \\<server>\pipe\psexesvc, \\<server>\pipe\<random>
  Monitoring: SMB connections + service creation (EventID 7045)
```

### Sysmon - Named Pipe Monitoring

```xml
<!-- Sysmon configuration for pipe monitoring -->
<Sysmon schemaversion="4.82">
  <EventFiltering>

    <!-- Event 17: Pipe Created -->
    <RuleGroup name="PipeCreated" groupRelation="or">
      <PipeEvent onmatch="include">
        <!-- Suspicious pipe names (malware indicators) -->
        <PipeName condition="contains">msagent_</PipeName>
        <PipeName condition="contains">isapi_</PipeName>
        <PipeName condition="contains">postex_</PipeName>
        <PipeName condition="contains">mojo.</PipeName>
      </PipeEvent>
    </RuleGroup>

    <!-- Event 18: Pipe Connected -->
    <RuleGroup name="PipeConnected" groupRelation="or">
      <PipeEvent onmatch="include">
        <!-- Connections to system pipes from unexpected processes -->
        <PipeName condition="is">\lsass</PipeName>
        <PipeName condition="is">\spoolss</PipeName>
      </PipeEvent>
    </RuleGroup>

  </EventFiltering>
</Sysmon>
```

```powershell
# Monitor pipe creation events via Sysmon
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
    Where-Object { $_.Id -in 17, 18 } |
    Select-Object TimeCreated, Id,
        @{N="PipeName"; E={$_.Properties[4].Value}},
        @{N="ProcessName"; E={$_.Properties[3].Value}} |
    Format-Table -AutoSize

# Find pipes created by non-system processes
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
    Where-Object { $_.Id -eq 17 } |
    Where-Object { $_.Properties[3].Value -notmatch "System|svchost|lsass|services" } |
    Select-Object TimeCreated,
        @{N="Process"; E={$_.Properties[3].Value}},
        @{N="Pipe"; E={$_.Properties[4].Value}} |
    Format-Table -AutoSize
```

---

## Practical Scenarios

### Scenario 1: Diagnostics - Find All Pipes and Their Owners

```powershell
# Script: enumerate all Named Pipes with security info

function Get-NamedPipeInfo {
    $pipes = [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")

    foreach ($pipe in $pipes) {
        $name = $pipe.Replace("\\.\pipe\", "").Replace("\\.\\pipe\\", "")
        
        try {
            $acl = Get-Acl "\\.\pipe\$name" -ErrorAction SilentlyContinue
            $owner = $acl.Owner
            $access = ($acl.Access | ForEach-Object {
                "$($_.IdentityReference):$($_.FileSystemRights)"
            }) -join " | "
        } catch {
            $owner = "N/A"
            $access = "Access Denied"
        }

        [PSCustomObject]@{
            PipeName = $name
            Owner    = $owner
            Access   = $access
        }
    }
}

Get-NamedPipeInfo | Sort-Object PipeName | Format-Table -AutoSize

# Or just the list
[System.IO.Directory]::GetFiles("\\\\.\\pipe\\") |
    Sort-Object |
    ForEach-Object { $_.Replace("\\.\pipe\", "") }
```

### Scenario 2: Simple IPC Between Two PowerShell Scripts

```powershell
# server.ps1 - run first
$pipeName = "myapp_ipc"
$server = [System.IO.Pipes.NamedPipeServerStream]::new(
    $pipeName,
    [System.IO.Pipes.PipeDirection]::InOut,
    1,
    [System.IO.Pipes.PipeTransmissionMode]::Message
)

Write-Host "[Server] Waiting for client on \\.\pipe\$pipeName"
$server.WaitForConnection()
Write-Host "[Server] Client connected"

$reader = [System.IO.StreamReader]::new($server)
$writer = [System.IO.StreamWriter]::new($server)
$writer.AutoFlush = $true

for ($i = 0; $i -lt 5; $i++) {
    $msg = $reader.ReadLine()
    Write-Host "[Server] Received: $msg"
    $writer.WriteLine("Server processed: $msg at $(Get-Date -Format 'HH:mm:ss')")
}

$server.Dispose()
Write-Host "[Server] Done"
```

```powershell
# client.ps1 - run second (after server.ps1)
$pipeName = "myapp_ipc"
$client = [System.IO.Pipes.NamedPipeClientStream]::new(".", $pipeName,
    [System.IO.Pipes.PipeDirection]::InOut)

Write-Host "[Client] Connecting to \\.\pipe\$pipeName"
$client.Connect(10000)
Write-Host "[Client] Connected"

$reader = [System.IO.StreamReader]::new($client)
$writer = [System.IO.StreamWriter]::new($client)
$writer.AutoFlush = $true

for ($i = 1; $i -le 5; $i++) {
    $writer.WriteLine("Message #$i from client")
    $response = $reader.ReadLine()
    Write-Host "[Client] Got: $response"
    Start-Sleep -Milliseconds 500
}

$client.Dispose()
Write-Host "[Client] Done"
```

### Scenario 3: Security Audit - Find Vulnerable Pipes

```powershell
# Find pipes writable by Everyone/Users (potential vulnerability)
function Find-WeakPipes {
    $pipes = [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")
    $weakPipes = @()

    foreach ($pipe in $pipes) {
        $name = $pipe.Replace("\\.\pipe\", "").Replace("\\.\\pipe\\", "")

        try {
            $acl = Get-Acl "\\.\pipe\$name" -ErrorAction Stop
            
            foreach ($ace in $acl.Access) {
                $identity = $ace.IdentityReference.Value
                $rights = $ace.FileSystemRights
                $type = $ace.AccessControlType

                # Suspicious: Everyone or Users have Write
                if ($type -eq "Allow" -and
                    ($identity -match "Everyone|Users|Authenticated Users") -and
                    ($rights -match "Write|FullControl|Modify")) {
                    
                    $weakPipes += [PSCustomObject]@{
                        PipeName = $name
                        Identity = $identity
                        Rights   = $rights
                    }
                }
            }
        } catch {}
    }

    $weakPipes | Sort-Object PipeName | Format-Table -AutoSize
}

Find-WeakPipes
```

---

## Quick Reference

```
IPC MECHANISMS - QUICK SELECTION
  Named Pipes    - bidirectional, network-capable, authentication, impersonation
  Anonymous Pipes- stdout/stderr of child process
  Mailslots      - broadcast, one-way, unreliable
  Shared Memory  - fastest, requires synchronization
  RPC            - remote function calls (over pipes / TCP)
  Sockets        - general-purpose network IPC
  COM/DCOM       - object-oriented IPC, over RPC

NAMESPACES
  \\.\pipe\<name>              - Named Pipe local
  \\<server>\pipe\<name>       - Named Pipe remote (via SMB)
  \\.\mailslot\<name>          - Mailslot local
  \\*\mailslot\<name>          - Mailslot broadcast
  Global\<name>                - Shared Memory global
  Local\<name>                 - Shared Memory local

NAMED PIPE CREATION FLAGS
  PIPE_ACCESS_DUPLEX           - bidirectional
  FILE_FLAG_OVERLAPPED         - asynchronous mode
  FILE_FLAG_FIRST_PIPE_INSTANCE- fail if pipe already exists
  PIPE_TYPE_MESSAGE            - message mode
  PIPE_READMODE_MESSAGE        - read as messages
  PIPE_UNLIMITED_INSTANCES     - unlimited client connections

KEY SYSTEM PIPES
  \\.\pipe\lsass               - authentication
  \\.\pipe\svcctl              - Service Control Manager
  \\.\pipe\winreg              - Remote Registry
  \\.\pipe\spoolss             - Print Spooler
  \\.\pipe\epmapper            - RPC Endpoint Mapper
  \\.\pipe\netlogon            - NetLogon
  \\.\pipe\psexecsvc           - PsExec (indicator of use)
  \\.\pipe\msagent_*           - Metasploit/C2 (suspicious!)

IMPERSONATION LEVELS
  SECURITY_ANONYMOUS           - client is anonymous
  SECURITY_IDENTIFICATION      - identify client, don't act as them
  SECURITY_IMPERSONATION       - act as client (local only)
  SECURITY_DELEGATION          - delegate (network resources)

TOOLS
  pipelist.exe    - list pipes (Sysinternals)
  accesschk.exe   - pipe permissions
  handle.exe      - open pipe handles
  procmon.exe     - pipe operations in real time
  Get-ChildItem \\.\pipe\ - pipe list via PowerShell

SYSMON EVENT IDS (IPC)
  17  - Named Pipe Created
  18  - Named Pipe Connected

DANGEROUS CONFIGURATIONS
  Everyone: Write on pipe      - enables impersonation attacks
  SeImpersonatePrivilege       - vector for Potato attacks
  Pipe without FILE_FLAG_FIRST_PIPE_INSTANCE - vulnerable to squatting

POWERSHELL QUICK COMMANDS
  [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")     - all pipes
  Get-Acl "\\.\pipe\<name>"                            - pipe DACL
  New-Object System.IO.Pipes.NamedPipeServerStream(...) - create server
  New-Object System.IO.Pipes.NamedPipeClientStream(...) - create client
```

---

## References

- [Named Pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipes) - official documentation
- [Anonymous Pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipes) - anonymous pipe documentation
- [Mailslots](https://learn.microsoft.com/en-us/windows/win32/ipc/mailslots) - mailslot documentation
- [File Mapping (Shared Memory)](https://learn.microsoft.com/en-us/windows/win32/memory/file-mapping) - shared memory
- [RPC Guide](https://learn.microsoft.com/en-us/windows/win32/rpc/rpc-guide) - RPC programming guide
- [ImpersonateNamedPipeClient](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient) - impersonation API
- [Sysmon Events 17/18](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - pipe monitoring
- [MITRE T1559: Inter-Process Communication](https://attack.mitre.org/techniques/T1559/) - IPC in attack context
- [PrintSpoofer - abusing impersonation](https://itm4n.github.io/printspoofer-abusing-impersonate-privileges/) - pipe impersonation LPE
- [Pipelist](https://learn.microsoft.com/en-us/sysinternals/downloads/pipelist) - Sysinternals pipelist
