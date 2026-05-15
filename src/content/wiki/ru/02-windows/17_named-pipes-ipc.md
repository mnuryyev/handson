---
title: "Windows - Named Pipes и IPC"
date: "2026-05-15"
---

IPC (Inter-Process Communication) - набор механизмов Windows для обмена данными между процессами. Named Pipes - один из главных таких механизмов, широко используемый системными сервисами, SMB протоколом, инструментами администрирования и, к сожалению, malware. Понимание IPC критично для системного программирования, администрирования и анализа безопасности.

---

## Обзор механизмов IPC в Windows

```
Windows предоставляет несколько механизмов IPC:

Named Pipes
  - Именованный канал с полнодуплексной передачей данных
  - Работает локально и по сети (через SMB \pipe\)
  - Поддерживает аутентификацию и impersonation
  - Используется: SMB, RPC, PsExec, WMI, Print Spooler и т.д.

Anonymous Pipes
  - Безымянный однонаправленный канал
  - Только между процессами с общим предком (parent → child)
  - Используется: перенаправление stdout/stderr дочернего процесса
  - cmd.exe | findstr, PowerShell pipeline

Mailslots
  - Односторонняя широковещательная передача данных
  - Поддерживает отправку одному или всем хостам в сети
  - Ограниченный размер сообщений (до 424 байт для сети)
  - Используется: Browser Service, NetBIOS broadcasts (устарело)

Shared Memory (File Mapping)
  - Раздел памяти доступный нескольким процессам одновременно
  - Самый быстрый IPC - нет копирования данных
  - Используется: DDE, COM out-of-process, антивирусы, clipboard

Sockets
  - TCP/UDP соединения (включая localhost loopback)
  - Стандарт для сетевого взаимодействия
  - AF_UNIX (Unix Domain Sockets) в Windows 10 1803+

RPC (Remote Procedure Call)
  - Высокоуровневый IPC поверх Named Pipes / TCP / HTTP
  - Автоматически управляет маршалингом данных
  - Используется: большинство Windows сервисов

COM / DCOM
  - Объектно-ориентированный IPC
  - DCOM: COM поверх RPC для удалённых объектов
  - Используется: WMI, Shell, Office Automation и т.д.

LPC / ALPC (Advanced Local Procedure Call)
  - Механизм ядра, используется Windows внутренне
  - Не доступен напрямую через Win32 API (только через ntdll)
  - Используется: csrss.exe, lsass.exe, системные сервисы

Clipboard
  - Обмен данными через буфер обмена
  - Поддерживает разные форматы (текст, изображения, файлы и т.д.)
  - Только локально

WM_COPYDATA
  - Передача данных через Windows сообщения
  - Только между процессами одной или разных integrity level
  - (UIPI ограничивает отправку от Low IL к Higher IL)
```

---

## Named Pipes - основы

### Что такое Named Pipe

```
Named Pipe (именованный канал) - объект ядра, реализующий
полнодуплексный канал передачи данных между процессами.

Пространство имён pipes:
  Локальные:  \\.\pipe\<name>
  Удалённые:  \\<server>\pipe\<name>

  Примеры реальных системных pipes:
    \\.\pipe\lsass               - LSASS (аутентификация)
    \\.\pipe\svcctl              - Service Control Manager
    \\.\pipe\winreg              - Remote Registry
    \\.\pipe\netlogon            - NetLogon
    \\.\pipe\spoolss             - Print Spooler
    \\.\pipe\epmapper            - RPC Endpoint Mapper
    \\.\pipe\wkssvc              - Workstation Service
    \\.\pipe\srvsvc              - Server Service
    \\.\pipe\atsvc               - Task Scheduler
    \\.\pipe\browser             - Computer Browser
    \\.\pipe\ROUTER              - Routing
    \\.\pipe\sql\query           - SQL Server (пример)
    \\.\pipe\psexecsvc           - PsExec сервис (при использовании)
    \\.\pipe\msagent_<random>    - Metasploit payload

Ключевые характеристики:
  - Двунаправленная передача (full-duplex)
  - Потоковый (byte stream) или сообщений (message) режим
  - Поддержка нескольких одновременных экземпляров (instances)
  - Поддержка Security Descriptor (ACL/DACL)
  - Поддержка impersonation клиента сервером
  - Работает через сеть по протоколу SMB (TCP 445)

Архитектура сервер-клиент:
  Server создаёт pipe → ждёт подключений
  Client подключается к pipe → обменивается данными
  Несколько клиентов → несколько экземпляров pipe
```

### Типы Named Pipes

```
По направлению передачи:
  PIPE_ACCESS_INBOUND    - только сервер читает (клиент пишет)
  PIPE_ACCESS_OUTBOUND   - только сервер пишет (клиент читает)
  PIPE_ACCESS_DUPLEX     - полнодуплексный (самый распространённый)

По режиму работы:
  PIPE_TYPE_BYTE         - поток байт (непрерывный, без границ сообщений)
  PIPE_TYPE_MESSAGE      - режим сообщений (каждое WriteFile = одно сообщение)

По режиму чтения:
  PIPE_READMODE_BYTE     - читать как поток байт
  PIPE_READMODE_MESSAGE  - читать как сообщения (с PIPE_TYPE_MESSAGE)

По режиму ожидания:
  PIPE_WAIT              - блокирующий (ReadFile ждёт данных)
  PIPE_NOWAIT            - неблокирующий (ReadFile возвращает немедленно)
  (PIPE_NOWAIT устарел, лучше использовать Overlapped I/O или I/O Completion Ports)

Комбинации:
  Типичный для RPC:
    PIPE_ACCESS_DUPLEX | PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT
  
  Типичный для потоковой передачи:
    PIPE_ACCESS_DUPLEX | PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT
```

---

## Named Pipes - программирование

### Серверная сторона (C / Win32)

```c
#include <windows.h>
#include <stdio.h>

#define PIPE_NAME  L"\\\\.\\pipe\\mypipe"
#define BUFFER_SIZE 4096

// Простой синхронный сервер (один клиент)
void simple_server() {
    HANDLE hPipe;
    char buffer[BUFFER_SIZE];
    DWORD bytesRead, bytesWritten;
    BOOL connected;

    // Создать pipe
    hPipe = CreateNamedPipe(
        PIPE_NAME,                           // имя pipe
        PIPE_ACCESS_DUPLEX,                  // сервер читает и пишет
        PIPE_TYPE_MESSAGE |                  // сообщения, не поток
        PIPE_READMODE_MESSAGE |              // читать как сообщения
        PIPE_WAIT,                           // блокирующий режим
        PIPE_UNLIMITED_INSTANCES,            // максимум экземпляров
        BUFFER_SIZE,                         // размер исходящего буфера
        BUFFER_SIZE,                         // размер входящего буфера
        0,                                   // таймаут по умолчанию (50мс)
        NULL                                 // атрибуты безопасности (NULL = default)
    );

    if (hPipe == INVALID_HANDLE_VALUE) {
        printf("CreateNamedPipe failed: %d\n", GetLastError());
        return;
    }

    printf("Pipe created, waiting for client...\n");

    // Ждать подключения клиента
    connected = ConnectNamedPipe(hPipe, NULL);  // NULL = синхронное ожидание
    if (!connected && GetLastError() != ERROR_PIPE_CONNECTED) {
        printf("ConnectNamedPipe failed: %d\n", GetLastError());
        CloseHandle(hPipe);
        return;
    }

    printf("Client connected!\n");

    // Читать данные от клиента
    while (ReadFile(hPipe, buffer, BUFFER_SIZE, &bytesRead, NULL)) {
        printf("Received (%d bytes): %.*s\n", bytesRead, bytesRead, buffer);

        // Отправить ответ
        const char* response = "Server got your message!";
        WriteFile(hPipe, response, strlen(response), &bytesWritten, NULL);
    }

    // Клиент отключился
    FlushFileBuffers(hPipe);
    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);
}

// Многопоточный сервер - создаёт новый поток для каждого клиента
DWORD WINAPI ClientHandler(LPVOID lpParam) {
    HANDLE hPipe = (HANDLE)lpParam;
    char buffer[BUFFER_SIZE];
    DWORD bytesRead, bytesWritten;

    while (ReadFile(hPipe, buffer, BUFFER_SIZE, &bytesRead, NULL)) {
        // обработать сообщение
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
            PIPE_UNLIMITED_INSTANCES,  // ключевое: позволяет несколько экземпляров
            BUFFER_SIZE, BUFFER_SIZE, 0, NULL
        );

        if (hPipe == INVALID_HANDLE_VALUE) break;

        // Ждать подключения (блокируемся здесь)
        BOOL connected = ConnectNamedPipe(hPipe, NULL);
        if (connected || GetLastError() == ERROR_PIPE_CONNECTED) {
            // Создать поток для обслуживания клиента
            HANDLE hThread = CreateThread(NULL, 0, ClientHandler, hPipe, 0, NULL);
            if (hThread) CloseHandle(hThread);  // отпустить handle потока
            // hPipe теперь в руках потока ClientHandler
        } else {
            CloseHandle(hPipe);
        }
    }
}
```

### Серверная сторона с Security Descriptor

```c
// Создать pipe с явным DACL
HANDLE create_secure_pipe() {
    // Создать дескриптор безопасности
    SECURITY_DESCRIPTOR sd;
    InitializeSecurityDescriptor(&sd, SECURITY_DESCRIPTOR_REVISION);

    // SDDL: D:(A;;GA;;;WD)  = DACL: Allow GenericAll for Everyone
    // Для ограниченного доступа:
    // D:(A;;0x12019f;;;WD)  = только ReadWrite + Synchronize для Everyone
    // D:(A;;GA;;;BA)        = Full Control только для Administrators

    PSECURITY_DESCRIPTOR pSD = NULL;
    ConvertStringSecurityDescriptorToSecurityDescriptor(
        L"D:(A;;GA;;;WD)",   // SDDL строка
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
        1,              // только один экземпляр
        4096, 4096, 0,
        &sa             // применить Security Descriptor
    );

    if (pSD) LocalFree(pSD);
    return hPipe;
}
```

### Клиентская сторона

```c
void pipe_client() {
    HANDLE hPipe;
    char buffer[4096];
    DWORD bytesRead, bytesWritten;

    // Ждать пока pipe станет доступен (если все экземпляры заняты)
    while (TRUE) {
        hPipe = CreateFile(
            L"\\\\.\\pipe\\mypipe",   // имя pipe
            GENERIC_READ | GENERIC_WRITE, // read + write
            0,                        // no sharing
            NULL,                     // default security
            OPEN_EXISTING,            // pipe уже должен существовать
            0,                        // file attributes (0 = синхронный)
            NULL                      // no template file
        );

        if (hPipe != INVALID_HANDLE_VALUE) break;  // успех

        if (GetLastError() != ERROR_PIPE_BUSY) {
            printf("CreateFile failed: %d\n", GetLastError());
            return;
        }

        // Все экземпляры заняты - ждать до 20 секунд
        if (!WaitNamedPipe(L"\\\\.\\pipe\\mypipe", 20000)) {
            printf("WaitNamedPipe timed out\n");
            return;
        }
    }

    // Установить режим чтения (MESSAGE)
    DWORD mode = PIPE_READMODE_MESSAGE;
    SetNamedPipeHandleState(hPipe, &mode, NULL, NULL);

    // Отправить данные
    const char* msg = "Hello from client!";
    WriteFile(hPipe, msg, strlen(msg), &bytesWritten, NULL);

    // Получить ответ
    ReadFile(hPipe, buffer, sizeof(buffer), &bytesRead, NULL);
    printf("Server replied: %.*s\n", bytesRead, buffer);

    CloseHandle(hPipe);
}
```

### PowerShell - работа с Named Pipes

```powershell
# Сервер на PowerShell (System.IO.Pipes)

# Серверная сторона
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

# Читать сообщения
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

# Клиентская сторона
$client = New-Object System.IO.Pipes.NamedPipeClientStream(
    ".",        # server ("." = local)
    "mypipe",   # pipe name
    [System.IO.Pipes.PipeDirection]::InOut
)

$client.Connect(5000)  # таймаут 5 секунд

$reader = New-Object System.IO.StreamReader($client)
$writer = New-Object System.IO.StreamWriter($client)
$writer.AutoFlush = $true

$writer.WriteLine("Hello from PowerShell client!")
$response = $reader.ReadLine()
Write-Host "Server says: $response"

$client.Dispose()

# -----------------------------------------------

# Подключиться к удалённому pipe (через SMB)
$client = New-Object System.IO.Pipes.NamedPipeClientStream(
    "SERVER01",    # имя сервера
    "mypipe",
    [System.IO.Pipes.PipeDirection]::InOut
)
$client.Connect(10000)
```

### Overlapped I/O (асинхронный режим)

```c
// Создать pipe с FILE_FLAG_OVERLAPPED для асинхронных операций
HANDLE hPipe = CreateNamedPipe(
    PIPE_NAME,
    PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,  // ключевой флаг
    PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
    PIPE_UNLIMITED_INSTANCES,
    BUFFER_SIZE, BUFFER_SIZE, 0, NULL
);

// Асинхронное подключение клиента
OVERLAPPED ol = {0};
ol.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

ConnectNamedPipe(hPipe, &ol);
// Не блокируется! Вернёт ERROR_IO_PENDING если клиента ещё нет

// Ждать событие (или делать что-то полезное пока ждём)
WaitForSingleObject(ol.hEvent, INFINITE);
// Клиент подключился

// Асинхронное чтение
char buffer[BUFFER_SIZE];
OVERLAPPED readOl = {0};
readOl.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

ReadFile(hPipe, buffer, BUFFER_SIZE, NULL, &readOl);
// Не блокируется! Продолжаем работу

WaitForSingleObject(readOl.hEvent, INFINITE);
DWORD bytesRead;
GetOverlappedResult(hPipe, &readOl, &bytesRead, FALSE);
// Данные в buffer
```

---

## Named Pipes - Impersonation

```
Impersonation - ключевая возможность Named Pipes.
Сервер может временно принять идентификацию подключённого клиента.

Это позволяет:
  - Выполнять операции от имени клиента
  - Проверять права доступа клиента
  - Ограничивать что клиент может делать через pipe

Требования для сервера:
  SeImpersonatePrivilege - привилегия "Impersonate a client after authentication"
  По умолчанию имеют: Local System, Network Service, Administrators

Уровни impersonation:
  SECURITY_ANONYMOUS      - клиент анонимен, сервер ничего не знает о клиенте
  SECURITY_IDENTIFICATION - сервер может идентифицировать клиента (читать его SID)
                            но НЕ может действовать от его имени
  SECURITY_IMPERSONATION  - сервер действует от имени клиента (только локально)
  SECURITY_DELEGATION     - сервер может делегировать (Kerberos delegation)
```

```c
// Impersonation на стороне сервера
void server_with_impersonation(HANDLE hPipe) {
    // Клиент подключился и прислал данные...

    // Начать impersonation
    if (!ImpersonateNamedPipeClient(hPipe)) {
        printf("ImpersonateNamedPipeClient failed: %d\n", GetLastError());
        return;
    }

    // Теперь поток выполняется с токеном клиента
    // Можно проверить кто подключился:
    HANDLE hToken;
    OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, TRUE, &hToken);

    // Получить имя пользователя из токена
    char username[256], domain[256];
    DWORD unLen = sizeof(username), dnLen = sizeof(domain);
    SID_NAME_USE snu;
    // ... GetTokenInformation → LookupAccountSid ...

    // Попробовать открыть файл от имени клиента
    // Если у клиента нет прав - CreateFile вернёт ошибку
    HANDLE hFile = CreateFileW(
        L"C:\\SensitiveFile.txt",
        GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL
    );

    // Завершить impersonation - вернуться к своему токену
    RevertToSelf();

    if (hFile != INVALID_HANDLE_VALUE) {
        // клиент имеет доступ к файлу
        CloseHandle(hFile);
    }
}
```

```powershell
# Impersonation в PowerShell через P/Invoke
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
    $null,  # PipeSecurity
    [System.IO.HandleInheritability]::None,
    [System.IO.Pipes.PipeAccessRights]::FullControl
)
$server.WaitForConnection()

# Impersonate
$handle = $server.SafePipeHandle.DangerousGetHandle()
[PipeImpersonation]::ImpersonateNamedPipeClient($handle)

# Теперь выполняется от имени клиента
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
Write-Host "Impersonating: $($identity.Name)"

[PipeImpersonation]::RevertToSelf()
```

### Token Impersonation Attacks (Named Pipe Potato)

```
Классическая атака: получить привилегированный токен через impersonation.

Если процесс имеет SeImpersonatePrivilege (типично для сервисов, IIS worker и т.д.):

1. Создать Named Pipe
2. Принудить привилегированный процесс (SYSTEM) подключиться к нашему pipe
   Методы принуждения:
   - PrintSpooler bug (MS-RPRN): SpoolService принуждает подключение к произвольному pipe
   - StorSvc bug
   - BITS COM escalation
3. Вызвать ImpersonateNamedPipeClient → получить SYSTEM токен
4. CreateProcessWithToken → запустить процесс как SYSTEM

Это основа "Potato" семейства атак:
  - HotPotato (2016): NBNS spoofing + NTLM relay + pipe
  - RottenPotato (2016): DCOM + pipe impersonation
  - JuicyPotato (2018): расширенный RottenPotato
  - PrintSpoofer (2020): SpoolSample + pipe
  - RoguePotato (2020): без COM restrictions
  - GodPotato (2023): работает на Windows 11 / Server 2022

Защита:
  SeImpersonatePrivilege только для необходимых сервисов
  Credential Guard снижает ценность получённых токенов
  Новые версии Windows закрывают конкретные векторы (PrintSpooler disabled)
```

---

## Anonymous Pipes

```
Anonymous Pipe - безымянный однонаправленный канал.
Создаётся парой: HANDLE (запись) + HANDLE (чтение).
Передаётся только через наследование handle дочерним процессом.

Типичное использование: перехват stdout/stderr дочернего процесса.
```

```c
#include <windows.h>
#include <stdio.h>

// Запустить дочерний процесс и перехватить его stdout
void capture_child_output() {
    HANDLE hReadPipe, hWritePipe;
    SECURITY_ATTRIBUTES sa = {sizeof(sa), NULL, TRUE};  // bInheritHandle = TRUE!

    // Создать anonymous pipe
    if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
        return;
    }

    // Конец записи НЕ должен наследоваться нашим процессом
    SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);

    // Настроить STARTUPINFO для перенаправления stdout
    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdOutput = hWritePipe;   // stdout дочернего → наш write конец pipe
    si.hStdError  = hWritePipe;   // stderr тоже перехватываем
    si.hStdInput  = GetStdHandle(STD_INPUT_HANDLE);

    PROCESS_INFORMATION pi = {0};

    // Запустить дочерний процесс
    BOOL ok = CreateProcessW(
        NULL,
        L"cmd.exe /c dir C:\\",  // команда
        NULL, NULL,
        TRUE,   // bInheritHandles = TRUE - дочерний наследует наш hWritePipe
        0, NULL, NULL,
        &si, &pi
    );

    // Закрыть write конец в нашем процессе (иначе ReadFile никогда не вернёт EOF)
    CloseHandle(hWritePipe);

    // Читать вывод дочернего
    char buffer[4096];
    DWORD bytesRead;
    while (ReadFile(hReadPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL)) {
        buffer[bytesRead] = '\0';
        printf("%s", buffer);
    }

    CloseHandle(hReadPipe);
    WaitForObjectAndClose(pi.hProcess);
    CloseHandle(pi.hThread);
}
```

```powershell
# PowerShell - перехват вывода через анонимный pipe (встроено)
$proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c dir C:\" `
    -NoNewWindow -Wait `
    -RedirectStandardOutput "C:\Temp\output.txt" `
    -PassThru

# Или через Process объект напрямую:
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
Mailslot - механизм для односторонней широковещательной передачи сообщений.
Клиент пишет, сервер читает. Только в одну сторону.
Поддерживает отправку на все компьютеры в сети (broadcast).

Особенности:
  - Сервер создаёт mailslot
  - Клиент открывает его по имени и пишет
  - Сервер не может ответить через тот же mailslot
  - Максимум 424 байта на сообщение (для сетевых, локально больше)
  - Доставка ненадёжна (UDP-like, без подтверждения)

Пространство имён:
  Локально:   \\.\mailslot\<name>
  Конкретный: \\<server>\mailslot\<name>
  Broadcast:  \\*\mailslot\<name>       (все машины в сети)
  Домен:      \\<domain>\mailslot\<name> (все машины домена)
```

```c
// Mailslot сервер (читает сообщения)
void mailslot_server() {
    HANDLE hMailslot = CreateMailslot(
        L"\\\\.\\mailslot\\mymailslot",
        0,             // максимальный размер сообщения (0 = любой)
        MAILSLOT_WAIT_FOREVER,  // ждать сообщений бесконечно
        NULL           // security attributes
    );

    char buffer[512];
    DWORD bytesRead, msgSize, msgCount;

    while (TRUE) {
        // Узнать сколько сообщений ожидает
        GetMailslotInfo(hMailslot, NULL, &msgSize, &msgCount, NULL);

        if (msgCount > 0) {
            ReadFile(hMailslot, buffer, sizeof(buffer), &bytesRead, NULL);
            printf("Message: %.*s\n", bytesRead, buffer);
        }
        Sleep(100);
    }
    CloseHandle(hMailslot);
}

// Mailslot клиент (пишет сообщения)
void mailslot_client(LPCWSTR target) {
    // target = L"\\\\.\\mailslot\\mymailslot"  (локально)
    //        = L"\\\\SERVER\\mailslot\\mymailslot"  (конкретный)
    //        = L"\\\\*\\mailslot\\mymailslot"  (broadcast)

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
Shared Memory - несколько процессов отображают один и тот же регион памяти.
Самый производительный IPC: данные не копируются между процессами.

Реализуется через File Mapping объекты:
  CreateFileMapping - создать маппинг (с INVALID_HANDLE_VALUE = без файла, только RAM)
  OpenFileMapping   - открыть существующий маппинг по имени
  MapViewOfFile     - отобразить в адресное пространство процесса
  UnmapViewOfFile   - убрать отображение
  CloseHandle       - закрыть маппинг

Пространство имён:
  Глобальный:  Global\<name>  (видно всем сессиям)
  Локальный:   Local\<name>   (только текущая сессия)
  (или просто <name> без префикса - обычно Local)
```

```c
// Процесс-производитель (создаёт shared memory)
void shared_memory_producer() {
    // Создать файловый маппинг (без файла - только в RAM)
    HANDLE hMapFile = CreateFileMapping(
        INVALID_HANDLE_VALUE,   // в RAM, не в файл
        NULL,                   // security attributes
        PAGE_READWRITE,         // права доступа
        0,                      // размер старший DWORD (0 для <4GB)
        1024,                   // размер младший DWORD (1KB)
        L"Global\\SharedMemDemo"  // имя (Global\ для cross-session)
    );

    if (!hMapFile) return;

    // Отобразить в адресное пространство
    LPVOID pView = MapViewOfFile(
        hMapFile,
        FILE_MAP_ALL_ACCESS,  // чтение + запись
        0, 0,                 // смещение (0 = с начала)
        1024                  // сколько байт отобразить
    );

    if (!pView) {
        CloseHandle(hMapFile);
        return;
    }

    // Записать данные в shared memory
    // (другой процесс увидит это немедленно)
    strcpy((char*)pView, "Hello from producer!");

    printf("Data written to shared memory. Press Enter to exit...\n");
    getchar();

    UnmapViewOfFile(pView);
    CloseHandle(hMapFile);
}

// Процесс-потребитель (читает shared memory)
void shared_memory_consumer() {
    // Открыть существующий маппинг по имени
    HANDLE hMapFile = OpenFileMapping(
        FILE_MAP_READ,           // только чтение
        FALSE,                   // не наследовать
        L"Global\\SharedMemDemo"  // имя маппинга
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
# Shared Memory в PowerShell через MemoryMappedFile
Add-Type -AssemblyName System.IO.MemoryMappedFiles

# Производитель
$mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::CreateNew(
    "SharedMemDemo",  # имя
    1024              # размер
)
$accessor = $mmf.CreateViewAccessor()
$text = [System.Text.Encoding]::UTF8.GetBytes("Hello from PowerShell!")
$accessor.WriteArray(0, $text, 0, $text.Length)
Write-Host "Written to shared memory"
# $mmf не закрывать пока нужен доступ!

# Потребитель (другой процесс)
$mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("SharedMemDemo")
$accessor = $mmf.CreateViewAccessor()
$buffer = New-Object byte[] 100
$accessor.ReadArray(0, $buffer, 0, $buffer.Length)
$text = [System.Text.Encoding]::UTF8.GetString($buffer).TrimEnd([char]0)
Write-Host "Read: $text"
$mmf.Dispose()
```

### Синхронизация Shared Memory

```c
// Shared Memory без синхронизации опасна: race conditions
// Нужны Mutex или Event для координации

HANDLE hMutex = CreateMutex(NULL, FALSE, L"Global\\SharedMemMutex");
HANDLE hDataReady = CreateEvent(NULL, FALSE, FALSE, L"Global\\DataReadyEvent");

// Производитель:
WaitForSingleObject(hMutex, INFINITE);  // взять мьютекс
// ... записать данные в shared memory ...
ReleaseMutex(hMutex);
SetEvent(hDataReady);  // сигнализировать потребителю

// Потребитель:
WaitForSingleObject(hDataReady, INFINITE);  // ждать сигнала
WaitForSingleObject(hMutex, INFINITE);      // взять мьютекс
// ... прочитать данные ...
ReleaseMutex(hMutex);
```

---

## RPC - Remote Procedure Call

```
RPC - высокоуровневый механизм вызова функций в других процессах или на других машинах.
Абстрагирует транспорт (Named Pipe, TCP, HTTP) и маршалинг данных.

Компоненты RPC:
  IDL (Interface Definition Language) - описание интерфейса
  MIDL compiler - компилирует IDL в stub код
  Client stub - маршалинг параметров на клиенте
  Server stub - анмаршалинг и вызов реальной функции
  RPC Runtime - транспорт, аутентификация, error handling

Транспорты (протоколы) RPC:
  ncalrpc   - Local RPC (ALPC, самый быстрый, только локально)
  ncacn_np  - Named Pipe (через SMB)
  ncacn_ip_tcp - TCP/IP (для сетевого RPC)
  ncacn_http - HTTP (через IIS)
  ncacn_nb_tcp - NetBIOS (устарело)

Endpoint Mapper (epmapper):
  Сервис на каждой машине (TCP 135)
  Клиент спрашивает: "Где находится интерфейс X?"
  Epmapper отвечает: "На pipe \\.\pipe\abc" или "TCP порт 49152"
  Клиент напрямую подключается к указанному endpoint
```

```c
// IDL файл для простого RPC интерфейса (hello.idl)
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

// После компиляции MIDL генерирует hello_s.c (server stub) и hello_c.c (client stub)

// Сервер:
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

// Клиент:
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
# Просмотр RPC endpoints на системе
# Показать все зарегистрированные RPC endpoints
Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\RpcSs"

# Через netstat - динамически выделенные RPC порты
netstat -ano | findstr "LISTEN" | findstr ":49"

# Через rpcdump (Impacket) удалённо:
# python rpcdump.py 192.168.1.10

# Локально через Windows встроенные средства:
# Process Monitor → Filter: "Operation=TCP Connect" AND "Path contains :135"
```

---

## Просмотр и анализ Named Pipes

### Встроенные инструменты

```powershell
# Просмотр всех открытых Named Pipes

# Способ 1: через .NET
[System.IO.Directory]::GetFiles("\\\\.\\pipe\\") | Sort-Object

# Способ 2: через реестр-подобный путь
Get-ChildItem \\.\pipe\ | Sort-Object Name

# Подробная информация о pipe (требует Sysinternals pipelist):
# pipelist.exe /accepteula

# Способ 3: WMI
Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "pipe" }

# Способ 4: через handle.exe (Sysinternals) - показать какие процессы держат pipes
# handle.exe -a -t pipe /accepteula

# PowerShell - найти pipe и его владельца (приблизительно через Process):
$pipes = [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")
foreach ($pipe in $pipes) {
    Write-Output $pipe.Replace("\\.\pipe\", "")
}

# Просмотр Security Descriptor pipe через PsSecTool (Sysinternals):
# AccessChk.exe -l \pipe\<name>
```

### Sysinternals инструменты

```
pipelist.exe
  Показывает список всех Named Pipes с количеством экземпляров.
  pipelist.exe /accepteula

  Вывод:
  Pipe Name                                    Instances  Max Instances
  ------------------------------------------------------------
  InitShutdown                                      3          -1
  lsass                                             4          -1
  ntsvcs                                            3          -1
  scerpc                                            1           1
  Winsock2\CatalogChangeListener-34c-0             1           1

handle.exe
  Показывает все открытые handles, включая pipe handles.
  handle.exe -a pipe /accepteula     # все handles типа pipe
  handle.exe -p lsass.exe /accepteula  # handles процесса lsass

accesschk.exe
  Проверить права доступа к pipe.
  accesschk.exe -l \pipe\lsass /accepteula     # DACL pipe lsass
  accesschk.exe -w \pipe\ /accepteula           # pipes доступные для записи

Process Monitor (procmon.exe)
  Фильтры для анализа IPC:
    Operation: CreatePipe, ConnectPipe, ReadFile, WriteFile
    Path: contains "pipe"
  Полезно для анализа: какие процессы создают/используют какие pipes.
```

### Process Monitor фильтры для IPC анализа

```
В Process Monitor (Sysinternals) настроить фильтры:

Для Named Pipes:
  Operation = CreatePipe      → создание новых pipes
  Operation = ConnectPipe     → подключение клиентов
  Path contains \\pipe\\      → любые операции с pipes

Для Shared Memory:
  Operation = CreateFileMapping → создание маппингов
  Operation = OpenFileMapping   → открытие существующих
  Path contains Global\\        → глобальные маппинги

Для RPC:
  Path contains epmapper        → обращения к endpoint mapper

Сохранить фильтры: Filter → Save Filter → *.pmc файл
```

---

## Безопасность Named Pipes

### Security Descriptor pipes

```
Named Pipes имеют Security Descriptor как и файлы.
При создании pipe можно задать DACL который определяет кто может подключиться.

Если Security Descriptor не задан (NULL):
  Default DACL применяется к pipe
  Default позволяет: создателю Full Control + Authenticated Users Read/Write

Проверить DACL pipe:
  # accesschk.exe -l \pipe\<name>
  # Или через Process Explorer: pipe handle → Security

Типичные DACL системных pipes:
  \\.\pipe\lsass:
    SYSTEM - Full Control
    Administrators - Full Control
    (остальные не имеют доступа)

  \\.\pipe\spoolss:
    Everyone - ReadWrite    ← часто используется в атаках!
    SYSTEM - Full Control
```

### Pipe Security - атаки и защита

```
Атака 1: Pipe Squatting / Pipe Pre-Creation
  Злоумышленник создаёт pipe с именем системного сервиса ДО того,
  как сервис стартует. Когда сервис стартует и пытается создать pipe -
  получит ошибку. Но если параметр nMaxInstances > 1 - оба экземпляра будут.
  
  Защита:
    - Использовать FILE_FLAG_FIRST_PIPE_INSTANCE при создании pipe
      (CreateNamedPipe возвращает ошибку если pipe уже существует)
    - Создавать pipes в правильном порядке при старте

  FILE_FLAG_FIRST_PIPE_INSTANCE:
    HANDLE hPipe = CreateNamedPipe(
        pipeName,
        PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,  // ← добавить флаг
        ...
    );
    // Вернёт ERROR_ACCESS_DENIED если pipe уже существует

Атака 2: Pipe Impersonation для LPE
  Описана выше (Potato family).
  Защита: ограничить SeImpersonatePrivilege, обновить ОС.

Атака 3: Malware использует pipes как C2 канал
  Особенно при использовании PsExec-like техник.
  Malware создаёт pipe с случайным именем для коммуникации с payload.
  
  Обнаружение: мониторинг создания новых pipes необычными процессами.
  Sysmon Event 17: Pipe Created
  Sysmon Event 18: Pipe Connected

Атака 4: Lateral Movement через Named Pipes (PsExec-style)
  PsExec создаёт сервис на удалённой машине → сервис создаёт pipe для I/O.
  Malware использует те же техники.
  
  Обнаружение: \\<server>\pipe\psexesvc, \\<server>\pipe\<random>
  Мониторинг: SMB подключения + создание сервисов (EventID 7045)
```

### Sysmon - мониторинг Named Pipes

```xml
<!-- Sysmon конфигурация для мониторинга pipes -->
<Sysmon schemaversion="4.82">
  <EventFiltering>

    <!-- Event 17: Pipe Created -->
    <RuleGroup name="PipeCreated" groupRelation="or">
      <PipeEvent onmatch="include">
        <!-- Подозрительные имена pipes (malware индикаторы) -->
        <PipeName condition="contains">msagent_</PipeName>
        <PipeName condition="contains">isapi_</PipeName>
        <PipeName condition="contains">postex_</PipeName>
        <PipeName condition="contains">mojo.</PipeName>
      </PipeEvent>
    </RuleGroup>

    <!-- Event 18: Pipe Connected -->
    <RuleGroup name="PipeConnected" groupRelation="or">
      <PipeEvent onmatch="include">
        <!-- Соединения с системными pipes от неожиданных процессов -->
        <PipeName condition="is">\lsass</PipeName>
        <PipeName condition="is">\spoolss</PipeName>
      </PipeEvent>
    </RuleGroup>

  </EventFiltering>
</Sysmon>
```

```powershell
# Мониторинг событий создания pipes через Sysmon
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
    Where-Object { $_.Id -in 17, 18 } |
    Select-Object TimeCreated, Id,
        @{N="PipeName"; E={$_.Properties[4].Value}},
        @{N="ProcessName"; E={$_.Properties[3].Value}} |
    Format-Table -AutoSize

# Найти все pipes созданные не системными процессами
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" |
    Where-Object { $_.Id -eq 17 } |
    Where-Object { $_.Properties[3].Value -notmatch "System|svchost|lsass|services" } |
    Select-Object TimeCreated,
        @{N="Process"; E={$_.Properties[3].Value}},
        @{N="Pipe"; E={$_.Properties[4].Value}} |
    Format-Table -AutoSize
```

---

## Практические сценарии

### Сценарий 1: Диагностика - найти все pipes и их владельцев

```powershell
# Скрипт: перечислить все Named Pipes с Security информацией

function Get-NamedPipeInfo {
    # Список всех pipes
    $pipes = [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")

    foreach ($pipe in $pipes) {
        $name = $pipe.Replace("\\.\pipe\", "").Replace("\\.\\pipe\\", "")
        
        try {
            # Попробовать получить Security Descriptor
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

# Или проще - просто список
[System.IO.Directory]::GetFiles("\\\\.\\pipe\\") |
    Sort-Object |
    ForEach-Object { $_.Replace("\\.\pipe\", "") }
```

### Сценарий 2: Простой IPC между двумя PowerShell скриптами

```powershell
# server.ps1 - запустить первым
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

# Обработать несколько сообщений
for ($i = 0; $i -lt 5; $i++) {
    $msg = $reader.ReadLine()
    Write-Host "[Server] Received: $msg"
    $writer.WriteLine("Server processed: $msg at $(Get-Date -Format 'HH:mm:ss')")
}

$server.Dispose()
Write-Host "[Server] Done"
```

```powershell
# client.ps1 - запустить вторым (после server.ps1)
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

### Сценарий 3: Проверка безопасности - поиск уязвимых pipes

```powershell
# Найти pipes доступные для записи Everyone/Users (потенциальная уязвимость)
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

                # Подозрительно: Everyone или Users имеют Write
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

## Шпаргалка

```
МЕХАНИЗМЫ IPC - БЫСТРЫЙ ВЫБОР
  Named Pipes    - двунаправленный, сетевой, аутентификация, impersonation
  Anonymous Pipes- stdout/stderr дочернего процесса
  Mailslots      - broadcast, односторонний, ненадёжный
  Shared Memory  - самый быстрый, нужна синхронизация
  RPC            - удалённые вызовы функций (поверх pipes / TCP)
  Sockets        - универсальный сетевой IPC
  COM/DCOM       - объектный IPC, поверх RPC

ПРОСТРАНСТВА ИМЁН
  \\.\pipe\<name>              - Named Pipe локально
  \\<server>\pipe\<name>       - Named Pipe удалённо (через SMB)
  \\.\mailslot\<name>          - Mailslot локально
  \\*\mailslot\<name>          - Mailslot broadcast
  Global\<name>                - Shared Memory глобально
  Local\<name>                 - Shared Memory локально

СОЗДАНИЕ NAMED PIPE (флаги)
  PIPE_ACCESS_DUPLEX           - двунаправленный
  FILE_FLAG_OVERLAPPED         - асинхронный режим
  FILE_FLAG_FIRST_PIPE_INSTANCE- только если pipe ещё не существует
  PIPE_TYPE_MESSAGE            - режим сообщений
  PIPE_READMODE_MESSAGE        - читать как сообщения
  PIPE_UNLIMITED_INSTANCES     - неограниченное число клиентов

ВАЖНЫЕ СИСТЕМНЫЕ PIPES
  \\.\pipe\lsass               - аутентификация
  \\.\pipe\svcctl              - Service Control Manager
  \\.\pipe\winreg              - Remote Registry
  \\.\pipe\spoolss             - Print Spooler
  \\.\pipe\epmapper            - RPC Endpoint Mapper
  \\.\pipe\netlogon            - NetLogon
  \\.\pipe\psexecsvc           - PsExec (индикатор использования)
  \\.\pipe\msagent_*           - Metasploit/C2 (подозрительно!)

IMPERSONATION УРОВНИ
  SECURITY_ANONYMOUS           - клиент анонимен
  SECURITY_IDENTIFICATION      - знать кто клиент, не действовать
  SECURITY_IMPERSONATION       - действовать от имени (локально)
  SECURITY_DELEGATION          - делегировать (сетевые ресурсы)

ИНСТРУМЕНТЫ
  pipelist.exe    - список pipes (Sysinternals)
  accesschk.exe   - права на pipes
  handle.exe      - открытые pipe handles
  procmon.exe     - операции с pipes в реальном времени
  Get-ChildItem \\.\pipe\ - список через PowerShell

SYSMON EVENT IDS (IPC)
  17  - Named Pipe Created
  18  - Named Pipe Connected

ОПАСНЫЕ КОНФИГУРАЦИИ
  Everyone: Write на pipe   - позволяет impersonation атаки
  SeImpersonatePrivilege    - вектор Potato атак
  Pipe без FILE_FLAG_FIRST_PIPE_INSTANCE - уязвим к squatting

PowerShell БЫСТРЫЕ КОМАНДЫ
  [System.IO.Directory]::GetFiles("\\\\.\\pipe\\")    - все pipes
  Get-Acl "\\.\pipe\<name>"                           - права pipe
  New-Object System.IO.Pipes.NamedPipeServerStream(...)- создать сервер
  New-Object System.IO.Pipes.NamedPipeClientStream(...)- создать клиент
```

---

## Ссылки

- [Named Pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipes) - официальная документация
- [Anonymous Pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipes) - анонимные каналы
- [Mailslots](https://learn.microsoft.com/en-us/windows/win32/ipc/mailslots) - mailslot документация
- [File Mapping](https://learn.microsoft.com/en-us/windows/win32/memory/file-mapping) - shared memory
- [RPC Guide](https://learn.microsoft.com/en-us/windows/win32/rpc/rpc-guide) - RPC программирование
- [ImpersonateNamedPipeClient](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient) - API impersonation
- [Sysmon Events 17/18](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) - мониторинг pipes
- [MITRE T1559: Inter-Process Communication](https://attack.mitre.org/techniques/T1559/) - IPC в контексте атак
- [PrintSpoofer](https://itm4n.github.io/printspoofer-abusing-impersonate-privileges/) - pipe impersonation LPE
- [Pipelist](https://learn.microsoft.com/en-us/sysinternals/downloads/pipelist) - Sysinternals pipelist
