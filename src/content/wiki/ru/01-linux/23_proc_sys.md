---
title: "/proc и /sys - что там лежит и зачем"
date: "2026-05-09"
---

/proc и /sys - виртуальные файловые системы ядра Linux. Файлов на диске нет - всё генерируется ядром в момент чтения. Через них можно читать состояние ядра, процессов, оборудования и менять параметры ядра прямо во время работы системы.

    /proc  - procfs.  Информация о процессах и ядре. Исторически первая.
             Монтируется автоматически при загрузке.
    /sys   - sysfs.   Структурированная информация об устройствах и драйверах.
             Появилась в ядре 2.6, более организована чем /proc.

    Оба не занимают место на диске.
    Всё что читаешь - генерируется ядром на лету.
    Запись в некоторые файлы - изменяет поведение ядра немедленно.

---

## /proc - обзор структуры

    /proc/
    ├── 1/                  # директория процесса с PID 1 (init/systemd)
    ├── 2/                  # PID 2
    ├── .../                # по одной директории на каждый процесс
    ├── cpuinfo             # информация о CPU
    ├── meminfo             # использование памяти
    ├── net/                # сетевая информация
    ├── sys/                # параметры ядра (sysctl)
    ├── mounts              # смонтированные ФС
    ├── filesystems         # поддерживаемые ФС
    ├── interrupts          # прерывания
    ├── ioports             # порты ввода-вывода
    ├── iomem               # карта памяти устройств
    ├── modules             # загруженные модули ядра
    ├── version             # версия ядра
    ├── uptime              # время работы
    ├── loadavg             # средняя загрузка
    ├── stat                # статистика CPU, прерываний
    ├── diskstats           # статистика дисков
    ├── swaps               # swap разделы
    ├── partitions          # разделы дисков
    ├── devices             # зарегистрированные устройства
    ├── cmdline             # параметры загрузки ядра
    ├── kallsyms            # символы ядра
    └── kcore               # образ памяти ядра (для gdb)

---

## /proc: информация о процессах

Каждый процесс имеет директорию /proc/<PID>/ со своей информацией.

    /proc/<PID>/
    ├── cmdline     # команда запуска процесса (аргументы через \0)
    ├── status      # состояние, UID/GID, использование памяти
    ├── stat        # статистика (для ps, top)
    ├── statm       # использование памяти в страницах
    ├── maps        # карта виртуальной памяти
    ├── smaps       # подробная карта памяти (RSS, PSS, Swap)
    ├── fd/         # открытые файловые дескрипторы (symlinks)
    ├── fdinfo/     # информация о файловых дескрипторах
    ├── exe         # symlink на исполняемый файл
    ├── cwd         # symlink на текущую директорию
    ├── root        # symlink на корень процесса (chroot)
    ├── environ     # переменные окружения (через \0)
    ├── io          # статистика I/O процесса
    ├── net/        # сетевые соединения процесса (в namespace)
    ├── ns/         # namespaces процесса
    ├── limits      # resource limits (ulimit)
    ├── oom_score   # OOM killer score (0-1000)
    ├── oom_adj     # OOM killer adjustment (устарело)
    ├── oom_score_adj  # OOM killer adjustment (-1000 до 1000)
    ├── wchan       # функция ядра где процесс спит
    ├── stack       # стек ядра процесса
    └── task/       # потоки (по одной директории на поток)

### Чтение информации о процессах

    # Команда запуска процесса
    cat /proc/1234/cmdline | tr '\0' ' '
    # \0 разделяет аргументы → tr заменяет на пробелы

    # Переменные окружения процесса
    cat /proc/1234/environ | tr '\0' '\n'

    # Открытые файлы процесса
    ls -la /proc/1234/fd
    # lrwxrwxrwx 1 root root 0 ... 0 -> /dev/null
    # lrwxrwxrwx 1 root root 0 ... 1 -> /var/log/app.log
    # lrwxrwxrwx 1 root root 0 ... 7 -> socket:[12345]

    # Исполняемый файл процесса
    readlink /proc/1234/exe
    # /usr/bin/python3

    # Текущая директория
    readlink /proc/1234/cwd

    # Статус процесса
    cat /proc/1234/status
    # Name:   nginx
    # State:  S (sleeping)
    # Tgid:   1234       ← thread group ID = PID
    # Pid:    1234
    # PPid:   1          ← родительский процесс
    # VmRSS:  4096 kB    ← реальная RAM
    # VmSize: 65536 kB   ← виртуальная память
    # Threads: 4          ← число потоков
    # voluntary_ctxt_switches:    100
    # nonvoluntary_ctxt_switches: 50

    # Статистика I/O процесса
    cat /proc/1234/io
    # rchar:  123456789   ← прочитано байт (включая кэш)
    # wchar:  987654321   ← записано байт
    # read_bytes:  65536  ← реально прочитано с диска
    # write_bytes: 32768  ← реально записано на диск

    # Карта памяти процесса
    cat /proc/1234/maps
    # 7f1234560000-7f1234570000 r-xp 00000000 08:01 123456 /usr/lib/libc.so.6
    # Поля: адрес_начала-адрес_конца права offset устройство inode файл

    # Подробная карта памяти (RSS реального использования)
    cat /proc/1234/smaps | grep -A 10 "heap"

    # OOM killer: чем выше score, тем вероятнее будет убит
    cat /proc/1234/oom_score      # текущий score (0-1000)
    cat /proc/1234/oom_score_adj  # текущий adjustment

    # Защитить процесс от OOM killer
    echo -1000 > /proc/1234/oom_score_adj
    # Сделать кандидатом №1 для убийства
    echo 1000 > /proc/1234/oom_score_adj

    # Limits процесса (ulimit)
    cat /proc/1234/limits
    # Limit                     Soft Limit  Hard Limit  Units
    # Max open files            1024        4096        files
    # Max processes             31234       31234       processes

    # /proc/self - всегда ссылается на текущий процесс
    cat /proc/self/status
    readlink /proc/self/exe

---

## /proc: информация о системе

### CPU

    cat /proc/cpuinfo
    # processor     : 0          ← номер ядра
    # vendor_id     : GenuineIntel
    # cpu family    : 6
    # model name    : Intel(R) Core(TM) i7-...
    # cpu MHz       : 3600.000
    # cache size    : 12288 KB
    # siblings      : 8          ← логических CPU (HT)
    # cpu cores     : 4          ← физических ядер
    # flags         : fpu vmx sse4_2 avx2 aes ...  ← возможности CPU

    # Число процессоров
    nproc
    grep -c processor /proc/cpuinfo

    # Частота CPU в реальном времени
    grep MHz /proc/cpuinfo

    # Флаги CPU (возможности)
    grep flags /proc/cpuinfo | head -1

### Память

    cat /proc/meminfo
    # MemTotal:       16384000 kB  ← всего RAM
    # MemFree:         2048000 kB  ← свободно (не используется вообще)
    # MemAvailable:    8192000 kB  ← доступно для приложений (включает кэш)
    # Buffers:          512000 kB  ← буферы ядра
    # Cached:          4096000 kB  ← page cache
    # SwapTotal:       4096000 kB
    # SwapFree:        4096000 kB
    # Dirty:             10240 kB  ← данные ожидающие записи на диск
    # Writeback:             0 kB  ← данные в процессе записи
    # AnonPages:       5120000 kB  ← анонимные страницы (heap, stack)
    # Mapped:           512000 kB  ← mmap файлы
    # Shmem:            102400 kB  ← разделяемая память
    # Slab:             409600 kB  ← кэш объектов ядра
    # HugePages_Total:       0     ← huge pages
    # HugePages_Free:        0

    # Реальное доступное место - MemAvailable, не MemFree!
    # MemFree - только полностью свободное, MemAvailable включает кэш.

### Загрузка и аптайм

    cat /proc/uptime
    # 86400.12 172800.34
    # Первое: секунд с загрузки. Второе: суммарное idle время (все CPU).

    cat /proc/loadavg
    # 0.52 0.38 0.25 2/456 12345
    # Поля: load 1min, load 5min, load 15min, running/total_threads, last_PID

    # load average > числа ядер CPU = система перегружена

### Статистика CPU

    cat /proc/stat
    # cpu  user nice system idle iowait irq softirq steal guest
    # cpu  123456 100 45678 9876543 1234 567 890 0 0
    # cpu0 30000 25 11000 2469135 308 142 222 0 0
    # cpu1 31000 25 11500 2469136 309 141 223 0 0
    # ...
    # intr 1234567 ...   ← прерывания
    # ctxt 9876543       ← переключения контекста
    # btime 1714985600   ← unix timestamp загрузки системы
    # processes 12345    ← создано процессов с загрузки
    # procs_running 2    ← процессов в состоянии R прямо сейчас
    # procs_blocked 0    ← ждут I/O

    # top, htop, vmstat читают /proc/stat для расчёта % CPU

### Диски

    cat /proc/diskstats
    # 8  0 sda 12345 678 234567 8901 23456 789 1234567 8901 0 12345 17802
    # Поля: major minor name reads_completed reads_merged sectors_read
    #        ms_reading writes_completed writes_merged sectors_written
    #        ms_writing io_in_progress ms_io ms_weighted_io

    # iostat, iotop, dstat читают /proc/diskstats

    cat /proc/partitions
    # major minor  #blocks  name
    #    8        0  104857600 sda
    #    8        1    1048576 sda1
    #    8        2  103809024 sda2

### Сеть

    cat /proc/net/dev
    # Inter-|   Receive                            |  Transmit
    #  face | bytes packets errs drop fifo frame ... | bytes packets ...
    #   eth0: 123456 1234  0    0    0    0   ...    98765  987   0 ...
    #     lo:   1234   12  0    0    0    0   ...     1234   12   0 ...

    cat /proc/net/tcp      # TCP соединения (IPv4)
    cat /proc/net/tcp6     # TCP соединения (IPv6)
    cat /proc/net/udp      # UDP сокеты
    cat /proc/net/if_inet6 # IPv6 адреса интерфейсов
    cat /proc/net/arp      # ARP таблица
    cat /proc/net/route    # таблица маршрутизации

    # ss, netstat, ip читают из /proc/net/

    cat /proc/net/snmp     # SNMP статистика (TCP/UDP/IP счётчики)
    cat /proc/net/netstat  # расширенная статистика TCP

    # conntrack
    cat /proc/net/nf_conntrack          # таблица соединений
    cat /proc/sys/net/netfilter/nf_conntrack_count  # текущее число соединений
    cat /proc/sys/net/netfilter/nf_conntrack_max    # максимум

### Прерывания и модули

    cat /proc/interrupts
    #           CPU0  CPU1  CPU2  CPU3
    #  0:          9     0     0     0  IO-APIC   2-edge      timer
    #  1:          0     0     3     0  IO-APIC   1-edge      i8042 (keyboard)
    # 28:      12345  6789  2345  1234  PCI-MSI   524288-edge xhci_hcd (USB)
    # NMI:         0     0     0     0  Non-maskable interrupts
    # LOC:   1234567 ...                Local timer interrupts

    cat /proc/modules
    # module_name size used_by_count used_by_modules state address
    # nf_nat      45056 2 iptable_nat,nft_chain_nat Live 0xffffffffc0123456

    lsmod   # красивый вывод /proc/modules

### Файловые системы и монтирование

    cat /proc/mounts       # смонтированные ФС (аналог mount)
    cat /proc/filesystems  # поддерживаемые ФС ядром

    # /proc/mounts формат:
    # device mountpoint fstype options dump pass
    # sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0
    # /dev/sda1 / ext4 rw,relatime 0 0

---

## /proc/sys - параметры ядра (sysctl)

/proc/sys содержит параметры ядра, изменяемые на лету. Каждый файл - один параметр.

    /proc/sys/
    ├── kernel/     # параметры ядра (имя хоста, лимиты, panic)
    ├── net/        # сетевые параметры
    ├── vm/         # управление памятью (Virtual Memory)
    ├── fs/         # файловые системы
    └── dev/        # параметры устройств

    # Читать параметр напрямую
    cat /proc/sys/net/ipv4/ip_forward

    # Изменить параметр напрямую
    echo 1 > /proc/sys/net/ipv4/ip_forward

    # Через sysctl (рекомендуется)
    sysctl net.ipv4.ip_forward         # прочитать
    sysctl -w net.ipv4.ip_forward=1    # записать
    sysctl -a                          # все параметры
    sysctl -a | grep ipv4             # фильтровать

    # Постоянные изменения - через /etc/sysctl.conf или /etc/sysctl.d/
    echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
    sysctl -p   # применить из файла

### Важные параметры kernel/

    # Имя хоста
    cat /proc/sys/kernel/hostname
    echo "newhost" > /proc/sys/kernel/hostname

    # Версия ядра
    cat /proc/sys/kernel/osrelease
    cat /proc/sys/kernel/version

    # Panic поведение
    cat /proc/sys/kernel/panic
    # 0 = зависнуть при panic (по умолчанию)
    # N = перезагрузиться через N секунд
    sysctl -w kernel.panic=10   # перезагружаться через 10 секунд

    # Panic при oops (ошибке ядра)
    sysctl -w kernel.panic_on_oops=1

    # Максимум открытых файлов для всей системы
    cat /proc/sys/fs/file-max
    sysctl -w fs.file-max=2097152

    # Текущее использование файловых дескрипторов
    cat /proc/sys/fs/file-nr
    # открытых  зарезервировано  максимум
    # 12345     0                2097152

    # PID максимум
    cat /proc/sys/kernel/pid_max
    sysctl -w kernel.pid_max=4194304

    # dmesg уровень сообщений
    cat /proc/sys/kernel/printk
    # current default minimum boot
    # 4       4       1       7

    # Magic SysRq (экстренные команды ядра)
    cat /proc/sys/kernel/sysrq
    # 0 = отключено, 1 = все команды, N = битовая маска
    sysctl -w kernel.sysrq=1
    # Использование: echo b > /proc/sysrq-trigger (немедленный ребут)
    # echo s > /proc/sysrq-trigger (sync дисков)
    # echo u > /proc/sysrq-trigger (remount read-only)

### Важные параметры net/

    # IPv4 forwarding (маршрутизация между интерфейсами)
    cat /proc/sys/net/ipv4/ip_forward
    sysctl -w net.ipv4.ip_forward=1

    # Защита от IP spoofing (rp_filter)
    cat /proc/sys/net/ipv4/conf/all/rp_filter
    # 0 = отключено, 1 = строгий, 2 = нестрогий
    sysctl -w net.ipv4.conf.all.rp_filter=1

    # SYN cookies (защита от SYN flood)
    sysctl -w net.ipv4.tcp_syncookies=1

    # Очередь соединений
    sysctl -w net.ipv4.tcp_max_syn_backlog=4096   # SYN backlog
    sysctl -w net.core.somaxconn=65535            # accept backlog

    # TIME_WAIT ускорение
    sysctl -w net.ipv4.tcp_tw_reuse=1    # переиспользовать TIME_WAIT сокеты

    # Keepalive
    sysctl -w net.ipv4.tcp_keepalive_time=600      # секунд до первого keepalive
    sysctl -w net.ipv4.tcp_keepalive_intvl=60      # интервал между keepalive
    sysctl -w net.ipv4.tcp_keepalive_probes=5      # число проб до разрыва

    # Размер буферов TCP
    sysctl -w net.core.rmem_max=16777216           # максимум receive buffer
    sysctl -w net.core.wmem_max=16777216           # максимум send buffer
    sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
    sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"

    # Локальный диапазон портов
    cat /proc/sys/net/ipv4/ip_local_port_range
    # 32768 60999 (по умолчанию)
    sysctl -w net.ipv4.ip_local_port_range="1024 65535"

    # ARP
    sysctl -w net.ipv4.neigh.default.gc_thresh3=8192   # максимум ARP записей

    # IPv6 forwarding
    sysctl -w net.ipv6.conf.all.forwarding=1

    # Отключить IPv6 (если не нужен)
    sysctl -w net.ipv6.conf.all.disable_ipv6=1
    sysctl -w net.ipv6.conf.default.disable_ipv6=1

### Важные параметры vm/

    # Swappiness: агрессивность использования swap (0-100)
    cat /proc/sys/vm/swappiness
    # 60 = по умолчанию
    sysctl -w vm.swappiness=10   # для серверов (меньше swap)

    # Dirty pages: когда сбрасывать кэш на диск
    sysctl -w vm.dirty_ratio=10           # % RAM когда процесс начинает писать сам
    sysctl -w vm.dirty_background_ratio=5 # % RAM когда flusher начинает фоновую запись

    # OOM killer
    sysctl -w vm.panic_on_oom=0      # 0 = убить процесс, 1 = panic
    sysctl -w vm.overcommit_memory=1 # 0=эвристика, 1=всегда разрешать, 2=строго

    # Прозрачные Huge Pages
    cat /sys/kernel/mm/transparent_hugepage/enabled
    # [always] madvise never
    echo madvise > /sys/kernel/mm/transparent_hugepage/enabled

    # Минимум свободной памяти
    sysctl -w vm.min_free_kbytes=65536

---

## /sys - sysfs структура

/sys организована по подсистемам ядра. Более структурирована чем /proc.

    /sys/
    ├── block/          # блочные устройства (диски)
    ├── bus/            # шины (PCI, USB, I2C, platform)
    ├── class/          # классы устройств (net, block, input)
    ├── dev/            # устройства по major:minor номерам
    ├── devices/        # дерево всех устройств системы
    ├── firmware/       # firmware интерфейсы (ACPI, EFI)
    ├── fs/             # файловые системы (cgroup, bpf, fuse)
    ├── kernel/         # параметры ядра (debug, mm, power)
    ├── module/         # загруженные модули и их параметры
    └── power/          # управление питанием

### /sys/block - блочные устройства

    ls /sys/block/
    # sda  sdb  nvme0n1  vda ...

    # Информация о диске
    cat /sys/block/sda/size              # размер в 512-байтных секторах
    cat /sys/block/sda/queue/rotational  # 1=HDD, 0=SSD/NVMe
    cat /sys/block/sda/queue/scheduler   # планировщик I/O
    cat /sys/block/sda/device/model      # модель диска
    cat /sys/block/sda/device/vendor     # производитель

    # Статистика диска
    cat /sys/block/sda/stat
    # reads_completed reads_merged sectors_read ms_read
    # writes_completed writes_merged sectors_written ms_write
    # io_in_progress ms_io ms_weighted_io

    # Планировщик I/O
    cat /sys/block/sda/queue/scheduler
    # [mq-deadline] kyber bfq none
    echo mq-deadline > /sys/block/sda/queue/scheduler   # изменить

    # Read-ahead (упреждающее чтение)
    cat /sys/block/sda/queue/read_ahead_kb
    echo 256 > /sys/block/sda/queue/read_ahead_kb

    # nr_requests (глубина очереди)
    cat /sys/block/sda/queue/nr_requests
    echo 128 > /sys/block/sda/queue/nr_requests

    # Для SSD: включить TRIM
    cat /sys/block/sda/queue/discard_granularity  # 0 = TRIM не поддерживается

    # Размер блока
    cat /sys/block/sda/queue/physical_block_size   # физический (обычно 4096)
    cat /sys/block/sda/queue/logical_block_size    # логический (обычно 512)
    cat /sys/block/sda/queue/optimal_io_size       # оптимальный I/O

### /sys/class/net - сетевые интерфейсы

    ls /sys/class/net/
    # eth0  lo  wlan0  docker0  br0 ...

    # Информация об интерфейсе
    cat /sys/class/net/eth0/speed          # скорость Mbps
    cat /sys/class/net/eth0/duplex         # half/full
    cat /sys/class/net/eth0/operstate      # up/down/unknown
    cat /sys/class/net/eth0/carrier        # 1=кабель подключён, 0=нет
    cat /sys/class/net/eth0/mtu            # MTU
    cat /sys/class/net/eth0/address        # MAC адрес
    cat /sys/class/net/eth0/tx_queue_len   # длина очереди передачи
    cat /sys/class/net/eth0/type           # тип интерфейса (1=Ethernet)

    # Статистика интерфейса
    cat /sys/class/net/eth0/statistics/rx_bytes
    cat /sys/class/net/eth0/statistics/tx_bytes
    cat /sys/class/net/eth0/statistics/rx_errors
    cat /sys/class/net/eth0/statistics/tx_dropped

    # Очереди и буферы
    ls /sys/class/net/eth0/queues/
    # rx-0  tx-0  tx-1  ...

    # Изменить MTU
    echo 9000 > /sys/class/net/eth0/mtu   # Jumbo frames

### /sys/class/power_supply - батарея/питание

    ls /sys/class/power_supply/
    # AC  BAT0  BAT1 ...

    cat /sys/class/power_supply/BAT0/status        # Charging/Discharging/Full
    cat /sys/class/power_supply/BAT0/capacity      # % заряда
    cat /sys/class/power_supply/BAT0/energy_now    # текущий заряд (uWh)
    cat /sys/class/power_supply/BAT0/energy_full   # полный заряд (uWh)
    cat /sys/class/power_supply/BAT0/voltage_now   # напряжение (uV)
    cat /sys/class/power_supply/BAT0/current_now   # ток (uA)

### /sys/devices - дерево устройств

    # Полное дерево устройств системы
    ls /sys/devices/

    # PCI устройства
    ls /sys/bus/pci/devices/
    # 0000:00:00.0  0000:00:02.0  0000:00:1f.2 ...

    # Информация о PCI устройстве
    cat /sys/bus/pci/devices/0000:00:02.0/vendor    # 0x8086 = Intel
    cat /sys/bus/pci/devices/0000:00:02.0/device    # device ID
    cat /sys/bus/pci/devices/0000:00:02.0/class     # класс устройства
    cat /sys/bus/pci/devices/0000:00:02.0/driver    # используемый драйвер (symlink)

    # USB устройства
    ls /sys/bus/usb/devices/

    # Температура (hwmon)
    ls /sys/class/hwmon/
    cat /sys/class/hwmon/hwmon0/name        # имя сенсора
    cat /sys/class/hwmon/hwmon0/temp1_input # температура в миллиградусах
    # temp1_input = 45000 → 45°C

### /sys/kernel - параметры ядра

    # cgroups v2
    cat /sys/fs/cgroup/cgroup.controllers   # доступные контроллеры
    cat /sys/fs/cgroup/memory.usage_in_bytes

    # BPF
    ls /sys/fs/bpf/

    # Huge Pages
    cat /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
    cat /sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages
    # Выделить huge pages:
    echo 128 > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages

    # NUMA топология
    ls /sys/devices/system/node/
    cat /sys/devices/system/node/node0/meminfo
    cat /sys/devices/system/node/node0/cpulist   # какие CPU в этом NUMA узле

    # CPU онлайн/оффлайн (отключить ядро)
    cat /sys/devices/system/cpu/cpu1/online   # 1=включено
    echo 0 > /sys/devices/system/cpu/cpu1/online  # отключить CPU1
    echo 1 > /sys/devices/system/cpu/cpu1/online  # включить обратно

    # CPU scaling (частота)
    ls /sys/devices/system/cpu/cpu0/cpufreq/
    cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
    # performance, powersave, ondemand, schedutil ...
    echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

    # Уровень кэша CPU
    cat /sys/devices/system/cpu/cpu0/cache/index0/size   # L1 кэш
    cat /sys/devices/system/cpu/cpu0/cache/index2/size   # L2 кэш
    cat /sys/devices/system/cpu/cpu0/cache/index3/size   # L3 кэш

---

## Практические примеры

### Мониторинг системы

    # Сводка памяти
    awk '/MemTotal|MemAvailable|MemFree|Cached|SwapTotal|SwapFree/ \
      {printf "%-15s %d MB\n", $1, $2/1024}' /proc/meminfo

    # Топ процессов по RSS памяти
    for pid in /proc/[0-9]*/status; do
        awk '/^(Name|VmRSS)/{printf "%s ", $2}' $pid
        echo
    done | sort -k2 -rn | head -10

    # Все открытые сокеты процесса
    ls -la /proc/1234/fd | grep socket
    # Найти порт по socket inode:
    grep $(ls -la /proc/1234/fd | awk '/socket/{print $NF}' | \
      grep -o '[0-9]*') /proc/net/tcp

    # Использование памяти всеми процессами
    awk '{sum += $2} END {print sum/1024 " MB"}' \
      /proc/*/status 2>/dev/null

    # Процессы в состоянии D (ждут I/O, uninterruptible)
    for pid in /proc/[0-9]*/stat; do
        state=$(awk '{print $3}' $pid 2>/dev/null)
        [ "$state" = "D" ] && cat ${pid%stat}cmdline | tr '\0' ' ' && echo
    done

### Настройка производительности

    # Быстрая настройка для веб-сервера
    cat >> /etc/sysctl.d/99-webserver.conf << 'EOF'
    # Сеть
    net.ipv4.ip_forward = 0
    net.ipv4.tcp_syncookies = 1
    net.core.somaxconn = 65535
    net.ipv4.tcp_max_syn_backlog = 8192
    net.core.rmem_max = 16777216
    net.core.wmem_max = 16777216
    net.ipv4.tcp_rmem = 4096 87380 16777216
    net.ipv4.tcp_wmem = 4096 65536 16777216
    net.ipv4.tcp_tw_reuse = 1
    net.ipv4.ip_local_port_range = 1024 65535
    # Память
    vm.swappiness = 10
    vm.dirty_ratio = 15
    vm.dirty_background_ratio = 5
    EOF
    sysctl -p /etc/sysctl.d/99-webserver.conf

    # Настройка SSD
    echo mq-deadline > /sys/block/sda/queue/scheduler
    echo 0 > /sys/block/sda/queue/rotational    # сообщить ядру что это SSD

---

## Шпаргалка

    /proc - процессы:
      /proc/<PID>/cmdline     - команда запуска (tr '\0' ' ')
      /proc/<PID>/status      - статус, память, UID
      /proc/<PID>/fd/         - открытые файловые дескрипторы
      /proc/<PID>/maps        - карта виртуальной памяти
      /proc/<PID>/io          - I/O статистика
      /proc/<PID>/environ     - переменные окружения
      /proc/<PID>/oom_score_adj - OOM приоритет (-1000 защита, 1000 жертва)
      /proc/self/             - текущий процесс

    /proc - система:
      /proc/cpuinfo           - CPU информация
      /proc/meminfo           - память (MemAvailable = реально доступно)
      /proc/loadavg           - средняя загрузка
      /proc/uptime            - аптайм в секундах
      /proc/stat              - статистика CPU (читает top/htop)
      /proc/diskstats         - статистика дисков (читает iostat)
      /proc/net/dev           - статистика интерфейсов
      /proc/net/tcp           - TCP соединения
      /proc/mounts            - смонтированные ФС
      /proc/modules           - загруженные модули (lsmod)
      /proc/interrupts        - аппаратные прерывания

    /proc/sys - параметры ядра:
      net.ipv4.ip_forward=1                    - включить маршрутизацию
      net.ipv4.tcp_syncookies=1                - защита от SYN flood
      net.core.somaxconn=65535                 - backlog соединений
      vm.swappiness=10                         - меньше swap
      kernel.panic=10                          - перезагрузка при panic
      fs.file-max=2097152                      - максимум файловых дескрипторов

    /sys - устройства:
      /sys/block/sda/queue/scheduler           - планировщик I/O
      /sys/block/sda/queue/rotational          - 0=SSD, 1=HDD
      /sys/class/net/eth0/speed                - скорость интерфейса
      /sys/class/net/eth0/statistics/rx_bytes  - трафик
      /sys/class/hwmon/hwmon0/temp1_input      - температура (мC)
      /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor  - CPU governor
      /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages  - huge pages

    Чтение и запись:
      cat /proc/sys/net/ipv4/ip_forward        - прочитать
      echo 1 > /proc/sys/net/ipv4/ip_forward   - записать (временно)
      sysctl -w net.ipv4.ip_forward=1          - записать через sysctl
      sysctl -p /etc/sysctl.conf               - применить из файла

---

## Ссылки

- [Linux Kernel /proc docs](https://www.kernel.org/doc/html/latest/filesystems/proc.html) - официальная документация /proc
- [sysfs documentation](https://www.kernel.org/doc/html/latest/filesystems/sysfs.html) - документация /sys
- [sysctl reference](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/) - параметры sysctl
- [man proc(5)](https://linux.die.net/man/5/proc) - man страница procfs
- [Arch Wiki sysctl](https://wiki.archlinux.org/title/sysctl) - практические параметры sysctl
- [Linux Performance](https://www.brendangregg.com/linuxperf.html) - Brendan Gregg, инструменты производительности
- [The /proc filesystem](https://tldp.org/LDP/Linux-Filesystem-Hierarchy/html/proc.html) - TLDP руководство
