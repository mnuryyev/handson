---
title: "strace и ltrace - трассировка системных и библиотечных вызовов"
date: "2026-05-11"
---


Трассировка - это наблюдение за тем, что программа делает изнутри: какие системные вызовы делает, какие библиотечные функции вызывает, какие файлы открывает, с кем общается по сети. Незаменимый инструмент для отладки, анализа и reverse engineering.

---

## Что такое системный вызов

Программа не может напрямую работать с файлами, сетью или памятью - всё это делается через ядро. Системный вызов (syscall) - это контролируемый переход из пространства пользователя в пространство ядра.

```
Программа (user space)
    │
    │  read(), write(), open(), connect()...
    ▼
Ядро Linux (kernel space)
    │
    │  обращается к железу напрямую
    ▼
Устройства: диск, сеть, память
```

`strace` перехватывает эти переходы и показывает каждый системный вызов с аргументами и возвращаемым значением.

`ltrace` делает то же самое, но для вызовов библиотечных функций (libc и других shared libraries).

---

## strace - трассировка системных вызовов

### Установка

```bash
apt install strace        # Debian/Ubuntu
yum install strace        # RHEL/CentOS
pacman -S strace          # Arch
```

### Базовый запуск

```bash
# Запустить программу и трассировать
strace ls
strace cat /etc/hostname
strace curl https://example.com

# Подключиться к уже запущенному процессу
strace -p 1234
strace -p $(pgrep nginx)

# Подключиться к процессу и всем его потокам
strace -fp 1234
```

### Что выводит strace

```
openat(AT_FDCWD, "/etc/passwd", O_RDONLY) = 3
read(3, "root:x:0:0:root:/root:/bin/bash\n", 4096) = 32
close(3)                                = 0
```

Формат каждой строки:

```
syscall_name(аргументы) = возвращаемое_значение
```

- Если возвращаемое значение отрицательное - ошибка (`-1 ENOENT (No such file or directory)`)
- `=?` означает, что процесс завершился до возврата из вызова

### Ключевые флаги strace

| Флаг | Описание |
| --- | --- |
| `-e trace=syscall` | Фильтр по конкретному вызову или группе |
| `-e trace=file` | Только файловые операции |
| `-e trace=network` | Только сетевые вызовы |
| `-e trace=process` | Только вызовы управления процессами |
| `-e trace=signal` | Только сигналы |
| `-e trace=ipc` | Только IPC (pipes, sockets) |
| `-e trace=memory` | Только работа с памятью (mmap, brk) |
| `-o file.txt` | Записать вывод в файл |
| `-f` | Следить за дочерними процессами (fork/clone) |
| `-ff` | Следить за дочерними, каждый в отдельный файл |
| `-t` | Добавить время (HH:MM:SS) |
| `-tt` | Добавить время с микросекундами |
| `-T` | Показать время выполнения каждого вызова |
| `-c` | Только статистика в конце (без каждого вызова) |
| `-C` | Статистика + полный вывод |
| `-s N` | Максимальная длина строк в аргументах (по умолчанию 32) |
| `-x` | Hex-вывод для строк |
| `-v` | Verbose - полные структуры без сокращений |
| `-p PID` | Подключиться к существующему процессу |
| `-P path` | Фильтровать только вызовы, связанные с этим путём |
| `-y` | Показывать пути для файловых дескрипторов |
| `-yy` | Показывать и пути, и адреса сокетов |
| `-k` | Показать стек вызовов для каждого syscall |

---

## Практические примеры strace

### Узнать, какие файлы открывает программа

```bash
strace -e trace=openat,open ls /tmp 2>&1 | grep -v "= -1"
# Только успешные открытия (без ошибок)

strace -e trace=file ls 2>&1
# Все файловые операции: open, stat, access, unlink...
```

### Найти причину ошибки

```bash
# Программа не запускается? Смотрим что не так
strace ./myapp 2>&1 | grep -i "ENOENT\|EACCES\|EPERM"

# Или сразу с фильтром
strace -e trace=openat ./myapp 2>&1 | grep " = -1"
```

Типичные ошибки:

| Ошибка | Расшифровка |
| --- | --- |
| `ENOENT` | No such file or directory |
| `EACCES` | Permission denied |
| `EPERM` | Operation not permitted |
| `ECONNREFUSED` | Connection refused |
| `ETIMEDOUT` | Connection timed out |
| `EADDRINUSE` | Address already in use |

### Трассировать сетевые вызовы

```bash
strace -e trace=network curl https://example.com 2>&1 | head -30

# Посмотреть к каким адресам подключается программа
strace -e trace=connect -yy curl https://example.com 2>&1
# Флаг -yy покажет человекочитаемые адреса в connect()
```

### Статистика вызовов

```bash
strace -c ls /usr/bin
# Выведет таблицу: сколько раз вызван каждый syscall, суммарное время

# % time     seconds  usecs/call     calls    errors syscall
# ------ ----------- ----------- --------- --------- ----------------
#  38.44    0.000340          12        27           mmap
#  20.95    0.000185          18        10           openat
#  ...

strace -c -e trace=file nginx 2>&1
# Только файловые вызовы со статистикой
```

### Следить за дочерними процессами

```bash
# -f - следить за fork/clone
strace -f bash -c "ls | wc -l" 2>&1

# -ff - каждый процесс в отдельный файл
strace -ff -o /tmp/trace nginx
ls /tmp/trace.*      # trace.PID для каждого процесса
```

### Записать в файл

```bash
strace -o /tmp/trace.log ./myapp
cat /tmp/trace.log

# Отдельные файлы для каждого потока
strace -ff -o /tmp/trace ./myapp
```

### Подключиться к запущенному демону

```bash
# Nginx - смотрим что делает воркер
strace -p $(pgrep -n nginx) 2>&1
# Ctrl+C чтобы отключиться (процесс продолжит работу)

# PostgreSQL - смотрим SQL-запросы через системные вызовы
strace -e trace=read,write -s 4096 -p $(pgrep postgres | head -1) 2>&1

# MySQL
strace -e trace=read,write -s 4096 -p $(pgrep mysqld) 2>&1
```

### Отслеживать работу с конкретным файлом

```bash
# -P - только вызовы, связанные с этим путём
strace -P /etc/passwd cat /etc/passwd

# Кто пишет в файл лога?
strace -P /var/log/app.log -p $(pgrep myapp)
```

### Увеличить вывод строк

```bash
# По умолчанию strace обрезает строки до 32 символов
strace -s 1024 curl https://example.com 2>&1 | grep "write"
# Теперь видно полные HTTP-запросы и ответы
```

---

## Группы системных вызовов

При использовании `-e trace=` можно указывать не только конкретные вызовы, но и группы:

| Группа | Что включает |
| --- | --- |
| `file` | open, openat, stat, access, unlink, rename, chmod... |
| `network` | socket, connect, bind, accept, sendto, recvfrom... |
| `process` | fork, clone, execve, exit, wait4... |
| `signal` | kill, sigaction, sigprocmask, rt_sigreturn... |
| `ipc` | pipe, msgget, msgsnd, semget, shmget... |
| `memory` | mmap, munmap, mprotect, brk, mremap... |
| `desc` | read, write, close, dup, poll, select... |
| `%file` | то же что file (устаревший синтаксис) |

```bash
# Можно комбинировать
strace -e trace=file,network ./myapp

# Исключить вызов
strace -e trace=\!read ./myapp   # всё кроме read
```

---

## ltrace - трассировка библиотечных вызовов

`ltrace` перехватывает вызовы к динамическим библиотекам (.so). Полезно, когда системные вызовы не дают полной картины - например, когда нужно видеть `fopen()` вместо низкоуровневого `openat()`, или `malloc()`/`free()`.

### Установка

```bash
apt install ltrace         # Debian/Ubuntu
yum install ltrace         # RHEL/CentOS
```

### Базовый запуск

```bash
ltrace ls
ltrace cat /etc/hostname

# Подключиться к процессу
ltrace -p 1234
```

### Что выводит ltrace

```
fopen("/etc/passwd", "r")                        = 0x55a3d1234b60
fgets("root:x:0:0:root:/root:/bin/bash", 256, 0x55a3d1234b60) = 0x55a3d1234c80
fclose(0x55a3d1234b60)                           = 0
```

### Ключевые флаги ltrace

| Флаг | Описание |
| --- | --- |
| `-e func` | Фильтр по имени функции (поддерживает wildcards) |
| `-l library` | Трассировать только функции из этой библиотеки |
| `-C` | Деманглировать C++ имена |
| `-c` | Только статистика |
| `-f` | Следить за дочерними процессами |
| `-o file` | Вывод в файл |
| `-s N` | Максимальная длина строк |
| `-S` | Показывать также системные вызовы |
| `-x func` | Трассировать функцию даже если не библиотечная |
| `-n N` | Отступ для вложенных вызовов (по умолчанию 0) |

### Практические примеры ltrace

```bash
# Смотреть только вызовы malloc/free (утечки памяти)
ltrace -e malloc,free,realloc ./myapp 2>&1

# Функции с wildcards
ltrace -e "str*" ./myapp      # все str* функции: strcmp, strlen, strcpy...
ltrace -e "*open*" ./myapp    # всё что содержит "open"

# Статистика библиотечных вызовов
ltrace -c ./myapp
# % time     seconds  usecs/call     calls      function
# ------ ----------- ----------- --------- --------------------
#  35.12    0.000340          12        27 malloc
#  20.95    0.000185          18        10 fopen

# ltrace + strace одновременно
ltrace -S ./myapp 2>&1 | head -50

# Деманглировать C++
ltrace -C ./cpp_program 2>&1
```

---

## strace vs ltrace - когда что использовать

| Ситуация | Инструмент |
| --- | --- |
| Программа не может открыть файл | `strace -e trace=file` |
| Сетевые проблемы, к чему подключается | `strace -e trace=network -yy` |
| Какие переменные окружения читает | `strace -e trace=execve -v` |
| Проблемы с правами доступа | `strace -e trace=file` + смотреть EACCES |
| Утечки памяти | `ltrace -e malloc,free` |
| C++ программа, какие методы вызывает | `ltrace -C` |
| Программа зависает, в каком syscall | `strace -p PID` - сразу видно |
| Что делает демон прямо сейчас | `strace -p PID -T` |
| Производительность: медленные вызовы | `strace -c -T` |
| Reverse engineering бинаря | оба вместе |

---

## Расшифровка вывода strace

### Чтение из файла

```
openat(AT_FDCWD, "/etc/hosts", O_RDONLY) = 4
# открыть /etc/hosts только для чтения, получили дескриптор 4

fstat(4, {st_mode=S_IFREG|0644, st_size=221, ...}) = 0
# stat файла по дескриптору - размер 221 байт, права 0644

read(4, "127.0.0.1   localhost\n::1     lo", 4096) = 221
# прочитать до 4096 байт из дескриптора 4, прочли 221

close(4) = 0
# закрыть дескриптор
```

### Сетевое соединение

```
socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3
# создать TCP-сокет, получили дескриптор 3

connect(3, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("93.184.216.34")}, 16) = 0
# подключиться к 93.184.216.34:80, успешно

sendto(3, "GET / HTTP/1.1\r\nHost: example.co"..., 75, MSG_NOSIGNAL, NULL, 0) = 75
# отправить HTTP-запрос

recvfrom(3, "HTTP/1.1 200 OK\r\nAge: 529951\r\nCa"..., 16384, 0, NULL, NULL) = 1256
# получить ответ
```

### Запуск дочернего процесса

```
clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|SIGCHLD, ...) = 12345
# создать дочерний процесс, PID = 12345
# (в современном Linux fork() реализован через clone())

execve("/bin/ls", ["ls", "/tmp"], 0x... /* 23 vars */) = 0
# заменить образ процесса на /bin/ls с аргументами
```

### Сигналы в strace

```
--- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=1000, si_uid=1000} ---
# получен SIGTERM от PID 1000

+++ killed by SIGTERM +++
# процесс убит сигналом
```

---

## Продвинутые техники

### Найти медленные системные вызовы

```bash
# -T показывает время выполнения каждого вызова в угловых скобках
strace -T ls /usr/bin 2>&1 | sort -t'<' -k2 -rn | head -10

# Или через статистику
strace -c -S time ls /usr/bin 2>&1
# Отсортирует по времени - сразу видно узкое место
```

### Отслеживать запросы к DNS

```bash
strace -e trace=network -s 256 -yy curl https://example.com 2>&1 | grep "connect\|sendto\|recvfrom"
```

### Дамп всего трафика приложения

```bash
# Большой буфер для строк + все сетевые вызовы
strace -e trace=read,write,send,recv,sendto,recvfrom -s 65536 -p $(pgrep myapp) 2>&1
```

### Найти что читает конфиг

```bash
strace -e trace=openat -s 256 ./myapp 2>&1 | grep "= [0-9]"
# Показывает только успешно открытые файлы
```

### Перехват паролей (для тестирования)

```bash
# В тестовой среде - можно видеть что передаётся в SSL-функции
# до шифрования (у ltrace)
ltrace -e "SSL_write,SSL_read" -s 4096 curl https://example.com 2>&1
```

### strace для скрипта bash

```bash
# Трассировать bash-скрипт с дочерними процессами
strace -f -e trace=execve bash -x ./deploy.sh 2>&1 | grep execve
# Видно все команды которые запускает скрипт
```

---

## Работа с /proc/PID/syscall

Без strace можно быстро посмотреть в каком системном вызове завис процесс:

```bash
# Текущий системный вызов процесса
cat /proc/1234/syscall
# 0 0x3 0x7f... 0x1000 0x0 0x0 0x0 0x7ffee3a01000
# номер_syscall  аргументы...  указатель_стека

# Перевести номер в имя
ausyscall 0     # read
ausyscall 1     # write
ausyscall --dump | grep " 0$"  # все совпадения

# В каком ядерном коде завис (только для D-state)
cat /proc/1234/wchan
# poll_schedule_timeout  <- ждёт таймаут
# do_sys_poll            <- ждёт poll()
# pipe_wait              <- ждёт данных в pipe
```

---

## Ограничения и замечания

**Производительность.** strace значительно замедляет трассируемый процесс (иногда в 10-100 раз). Не используйте на продакшен-серверах без необходимости. Для минимального влияния используйте `-c` (только статистика).

**Безопасность.** Требует прав суперпользователя для подключения к чужим процессам. Обычный пользователь может трассировать только свои процессы.

**ptrace\_scope.** Некоторые системы ограничивают ptrace:

```bash
# Проверить текущий режим
cat /proc/sys/kernel/yama/ptrace_scope
# 0 - без ограничений
# 1 - только родительские процессы (по умолчанию в Ubuntu)
# 2 - только root
# 3 - полностью запрещено

# Временно разрешить (нужен root)
echo 0 > /proc/sys/kernel/yama/ptrace_scope
```

**ltrace и статические бинари.** ltrace не работает со статически скомпилированными программами - там нет динамических библиотек для перехвата.

**Потоки.** Для многопоточных программ используйте `-f`:

```bash
strace -f -p $(pgrep myapp)
# Потоки показываются с пометкой [pid XXXXX]
```

---

## Аналоги и смежные инструменты

| Инструмент | Описание |
| --- | --- |
| `perf trace` | Трассировка через perf, меньше накладных расходов |
| `auditd` | Системный аудит syscall'ов с записью в лог |
| `stap` (SystemTap) | Динамическая трассировка с написанием скриптов |
| `bpftrace` | Трассировка через eBPF - минимальный overhead |
| `dtrace` | Аналог для Solaris/macOS/FreeBSD |
| `ftrace` | Встроенная трассировка ядра Linux |
| `gdb` | Отладчик - можно также смотреть вызовы |
| `valgrind` | Анализ памяти, детектор утечек |

```bash
# perf trace - более быстрая альтернатива strace
perf trace ls
perf trace -e openat ls

# bpftrace - однострочники для трассировки
bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s\n", str(args->filename)); }'
```

---

## Шпаргалка

```bash
# strace - базовый запуск
strace ./program                         # запустить с трассировкой
strace -p PID                            # подключиться к процессу

# strace - фильтры
strace -e trace=file ./prog              # файловые операции
strace -e trace=network ./prog           # сетевые операции
strace -e trace=openat ./prog            # только openat
strace -e trace=\!read ./prog            # всё кроме read

# strace - вывод
strace -o trace.log ./prog               # в файл
strace -t ./prog                         # добавить время
strace -T ./prog                         # время выполнения вызова
strace -c ./prog                         # только статистика
strace -s 1024 ./prog                    # длинные строки

# strace - процессы
strace -f ./prog                         # следить за форками
strace -ff -o /tmp/t ./prog              # каждый поток в файл
strace -y ./prog                         # пути вместо дескрипторов
strace -yy ./prog                        # и адреса сокетов тоже

# ltrace - базовое
ltrace ./program                         # библиотечные вызовы
ltrace -e malloc,free ./prog             # только malloc/free
ltrace -e "str*" ./prog                  # функции по маске
ltrace -C ./prog                         # деманглировать C++
ltrace -c ./prog                         # статистика
ltrace -S ./prog                         # ltrace + системные вызовы

# Диагностика
strace -e trace=file ./prog 2>&1 | grep "= -1"          # все ошибки
strace -c -S time ./prog 2>&1                            # медленные вызовы
strace -e trace=openat -p PID 2>&1 | grep -v "= -1"     # что открывает демон
cat /proc/PID/syscall                                    # текущий syscall без strace
cat /proc/PID/wchan                                      # в каком ядерном коде завис
```

---

## Ссылки

- [strace man page](https://man7.org/linux/man-pages/man1/strace.1.html) - `man strace`
- [ltrace man page](https://man7.org/linux/man-pages/man1/ltrace.1.html) - `man ltrace`
- [syscalls man page](https://man7.org/linux/man-pages/man2/syscalls.2.html) - `man 2 syscalls`
- [strace GitHub](https://github.com/strace/strace) - исходный код и документация
- [Julia Evans - strace zine](https://jvns.ca/strace-zine-v2.pdf) - отличное визуальное объяснение
