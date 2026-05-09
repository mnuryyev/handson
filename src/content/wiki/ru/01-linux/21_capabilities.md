---
title: "Linux Capabilities - cap_net_raw и другие"
date: "2026-05-09"
---

Linux Capabilities - механизм разделения привилегий суперпользователя на отдельные независимые единицы. Вместо того чтобы давать процессу полный root, можно выдать только нужную привилегию. Это ключевой инструмент принципа наименьших привилегий на уровне ядра.

До capabilities: либо процесс root (всё разрешено), либо обычный пользователь (многое запрещено). После capabilities: обычный процесс получает только cap_net_bind_service - и может слушать порт 80, больше ничего лишнего.

---

## Концепция и история

    До capabilities (классическая Unix модель):
      - Два уровня: root (UID 0) и все остальные
      - root может всё: монтировать FS, менять сеть, читать любые файлы
      - Если процесс работает от root и взломан - атакующий получает всё
      - SUID-бинарники: временное повышение до root для конкретных задач
        (ping, passwd, su) - но они тоже получают полный root

    С capabilities (Linux >= 2.2, стандарт POSIX 1003.1e):
      - root разбит на ~40 независимых привилегий
      - Процесс получает только нужные capabilities
      - Взлом процесса даёт атакующему только эти capabilities
      - ping может делать raw sockets без полного root (cap_net_raw)
      - Веб-сервер слушает :80 без root (cap_net_bind_service)

    Реализация в ядре:
      - Каждый процесс имеет несколько наборов capabilities
      - Каждый файл тоже может иметь capabilities (xattr)
      - Проверка при каждом системном вызове, требующем привилегий

---

## Наборы capabilities процесса

У каждого процесса есть 5 наборов (sets) capabilities:

    Permitted (P):
      Максимальный набор capabilities, которые процесс может активировать.
      Процесс не может добавить в Permitted то, чего там нет.
      Суперсет для Effective и Inheritable.

    Effective (E):
      Capabilities, которые ядро проверяет при системных вызовах.
      Только то, что в Effective - реально работает прямо сейчас.
      Процесс может убрать capability из Effective (но не добавить, если нет в Permitted).

    Inheritable (I):
      Capabilities, которые передаются дочернему процессу через exec().
      Пересечение Inheritable родителя и Inheritable файла.

    Bounding (B):
      Верхняя граница - ограничивает что процесс вообще может получить.
      Capabilities вне Bounding нельзя добавить в Permitted через exec().
      Можно только убирать из Bounding, но не добавлять.

    Ambient (A):
      Введён в Linux 4.3. Capabilities, которые передаются через exec()
      непривилегированным процессам без файловых capabilities.
      Удобен для контейнеров и служб без SUID.
      Capability в Ambient должна быть и в Permitted, и в Inheritable.

    Формула при exec() (упрощённо):
      P' = (P_файл & B) | (I_файл & I_процесс) | A
      E' = E_файл ? P' : (E_файл & P')
      I' = I_процесс & I_файл

    # Посмотреть capabilities текущего процесса
    cat /proc/self/status | grep Cap
    # CapInh: 0000000000000000
    # CapPrm: 0000000000000000
    # CapEff: 0000000000000000
    # CapBnd: 000001ffffffffff
    # CapAmb: 0000000000000000

    # Декодировать hex-значение
    capsh --decode=000001ffffffffff

    # Capabilities конкретного процесса
    cat /proc/<pid>/status | grep Cap
    capsh --decode=$(cat /proc/<pid>/status | grep CapEff | awk '{print $2}')

---

## Наборы capabilities файла

Исполняемые файлы тоже имеют capabilities (хранятся в xattr security.capability):

    Permitted (P_файл):
      Capabilities, которые файл добавляет в Permitted процесса при exec().
      Аналог SUID, но точечный - только нужные привилегии.

    Inheritable (I_файл):
      Маска для Inheritable capabilities процесса.

    Effective bit (E_файл):
      Один бит (не набор). Если установлен - все Permitted файла
      автоматически становятся Effective после exec().
      Для программ, которые не умеют работать с capabilities API.

    # Посмотреть capabilities файла
    getcap /usr/bin/ping
    # /usr/bin/ping cap_net_raw=ep
    # e = effective, p = permitted, i = inheritable

    # Показать capabilities рекурсивно
    getcap -r /usr/bin/ 2>/dev/null
    getcap -r /usr/sbin/ 2>/dev/null

    # Установить capabilities файлу
    setcap cap_net_raw+ep /usr/bin/ping
    setcap cap_net_bind_service+ep /usr/bin/node

    # Удалить capabilities с файла
    setcap -r /usr/bin/ping

    # Проверить
    getcap /usr/bin/ping

    Обозначения при setcap/getcap:
      +e  - добавить в effective
      +p  - добавить в permitted
      +i  - добавить в inheritable
      -e  - убрать из effective
      =ep - установить только effective и permitted (сбросить остальное)

---

## Полный список capabilities

### Сеть

    CAP_NET_RAW:
      - Создавать raw и packet сокеты (SOCK_RAW, SOCK_PACKET)
      - Использовать bind() для любого адреса в прозрачном прокси
      - Пинговать (ping использует ICMP через raw socket)
      Риск: позволяет перехватывать и подделывать сетевые пакеты.
      Кто использует: ping, traceroute, tcpdump, wireshark, nmap

    CAP_NET_BIND_SERVICE:
      - Слушать (bind) привилегированные порты (< 1024)
      Риск: минимальный, но процесс может занять порт 22/80/443.
      Кто использует: nginx, apache, sshd, любой веб-сервер

    CAP_NET_ADMIN:
      - Настраивать сетевые интерфейсы (ip link, ip addr)
      - Изменять таблицы маршрутизации
      - Настраивать iptables, nftables
      - Настраивать сетевой namespace
      - Управлять ARP, NDP, VLAN
      - Включать/выключать promiscuous mode
      Риск: высокий. Полный контроль над сетью.
      Кто использует: NetworkManager, OpenVPN, WireGuard, Docker

    CAP_NET_BROADCAST:
      - Отправлять broadcast и multicast пакеты
      - Слушать multicast
      Риск: невысокий, но позволяет флудить сеть broadcast.
      Кто использует: dhcpd, avahi

### Файловая система

    CAP_DAC_OVERRIDE:
      - Обходить проверки прав на чтение, запись, выполнение для файлов
      - DAC = Discretionary Access Control
      Риск: очень высокий. Читать и писать любые файлы системы.
      Кто использует: backup утилиты, антивирусы, некоторые системные демоны

    CAP_DAC_READ_SEARCH:
      - Обходить проверки прав на чтение файлов и выполнение директорий
      - Только чтение (в отличие от CAP_DAC_OVERRIDE)
      Риск: высокий. Читать любые файлы, включая /etc/shadow.
      Кто использует: backup утилиты

    CAP_FOWNER:
      - Обходить проверку владельца файла при операциях, требующих совпадения UID
      - Менять права (chmod) на файлы, которыми не владеешь
      - Устанавливать sticky bit
      Риск: высокий.

    CAP_FSETID:
      - Устанавливать SUID/SGID биты на файлы
      - SGID бит на директориях не сбрасывается при записи
      Риск: средний.

    CAP_CHOWN:
      - Менять владельца и группу любого файла (chown)
      Риск: высокий. Можно захватить любой файл.

    CAP_MKNOD:
      - Создавать специальные файлы устройств (mknod)
      Риск: высокий. Можно создать /dev/mem и получить доступ к памяти.

    CAP_LINUX_IMMUTABLE:
      - Устанавливать/снимать атрибуты FS_APPEND_FL и FS_IMMUTABLE_FL
      Риск: средний. Можно сделать файлы неизменяемыми или наоборот.

    CAP_LEASE:
      - Устанавливать lease на произвольные файлы (F_SETLEASE)
      Риск: низкий.

### Пользователи и привилегии

    CAP_SETUID:
      - Менять UID процесса (setuid, setreuid, setresuid)
      - Менять UID в Unix-сокетах
      Риск: критический. Можно стать root (UID 0) или любым другим пользователем.
      Кто использует: su, sudo, sshd, веб-серверы (для drop privileges)

    CAP_SETGID:
      - Менять GID процесса (setgid, setregid, setresgid)
      - Управлять дополнительными группами
      Риск: высокий.
      Кто использует: su, sudo, sshd

    CAP_SETPCAP:
      - Добавлять capabilities в bounding set других процессов
      - Передавать capabilities дочерним процессам
      - Управлять ambient capabilities
      Риск: высокий. Управление capabilities других процессов.

    CAP_SETFCAP:
      - Устанавливать capabilities на файлы (setcap)
      Риск: критический. Можно дать любому файлу любые capabilities.

### Система и ядро

    CAP_SYS_ADMIN:
      - Широкий набор административных операций:
        монтировать/размонтировать FS, работать с namespace,
        управлять квотами, настраивать audit, работать с keyring,
        управлять loop устройствами и многое другое
      Риск: критический. Фактически эквивалентен root.
      Описывают как "capability of last resort" и "root lite".
      Кто использует: контейнерные runtime, systemd, strace

    CAP_SYS_PTRACE:
      - Использовать ptrace() для отладки любого процесса
      - Читать /proc/<pid>/mem любого процесса
      Риск: критический. Можно инъектировать код в любой процесс.
      Кто использует: gdb, strace, ltrace, отладчики

    CAP_SYS_CHROOT:
      - Использовать chroot()
      Риск: высокий. Побег из chroot через вложенные chroot.

    CAP_SYS_BOOT:
      - Вызывать reboot() и kexec_load()
      Риск: средний (DoS - перезагрузка системы).

    CAP_SYS_MODULE:
      - Загружать и выгружать модули ядра (insmod, rmmod)
      Риск: критический. Можно загрузить любой код в ядро.

    CAP_SYS_RAWIO:
      - Прямой доступ к /dev/mem, /dev/kmem
      - Использовать ioperm(), iopl()
      - Работать с IDE raw командами
      Риск: критический. Прямой доступ к физической памяти.

    CAP_SYS_TIME:
      - Менять системное время (settimeofday, adjtimex)
      Риск: средний. Может нарушить аутентификацию (Kerberos, TLS).

    CAP_SYS_NICE:
      - Повышать приоритет процессов (nice, setpriority)
      - Менять scheduling class (SCHED_FIFO, SCHED_RR)
      Риск: низкий. DoS через захват CPU.

    CAP_SYS_RESOURCE:
      - Превышать ограничения ресурсов (ulimit)
      - Использовать зарезервированное пространство ext2
      - Управлять лимитами очередей
      Риск: средний.

    CAP_SYS_PACCT:
      - Включать/выключать учёт процессов (acct())
      Риск: низкий.

    CAP_SYS_TTY_CONFIG:
      - Использовать vhangup() и настраивать любые TTY
      Риск: низкий.

    CAP_SYSLOG:
      - Выполнять привилегированные операции syslog (klogctl)
      - Просматривать kernel addresses в /proc/kallsyms
      Риск: средний. Чтение kernel адресов может помочь в эксплуатации.

### Сигналы и процессы

    CAP_KILL:
      - Отправлять сигналы процессам с другим UID
      - Обходить UID-проверку при kill()
      Риск: средний. DoS - убивать процессы других пользователей.

    CAP_WAKE_ALARM:
      - Устанавливать будильники CLOCK_REALTIME_ALARM и CLOCK_BOOTTIME_ALARM
      Риск: низкий.

### IPC и память

    CAP_IPC_LOCK:
      - Блокировать страницы памяти в RAM (mlock, mlockall)
      - Использовать shared memory без ограничений
      Риск: средний. DoS через исчерпание RAM.
      Кто использует: базы данных (PostgreSQL, Oracle), HSM

    CAP_IPC_OWNER:
      - Обходить проверки прав на IPC объекты (message queues, semaphores)
      Риск: средний.

### Аудит

    CAP_AUDIT_CONTROL:
      - Включать/выключать kernel audit
      - Менять audit правила
      - Читать audit статус
      Риск: высокий. Можно скрывать активность от audit.

    CAP_AUDIT_READ:
      - Читать audit лог через netlink
      Риск: средний.

    CAP_AUDIT_WRITE:
      - Писать записи в kernel audit лог
      Риск: низкий (но может замусорить аудит).

### Прочее

    CAP_BLOCK_SUSPEND:
      - Блокировать переход системы в suspend
      Риск: низкий. DoS - система не уходит в sleep.

    CAP_PERFMON:
      - Использовать perf_event_open() и eBPF для мониторинга
      Введён в Linux 5.8, выделен из CAP_SYS_ADMIN.
      Риск: средний. Может читать kernel данные через eBPF.

    CAP_BPF:
      - Загружать и запускать eBPF программы
      - Создавать eBPF maps
      Введён в Linux 5.8.
      Риск: высокий. eBPF может читать память ядра и перехватывать трафик.

    CAP_CHECKPOINT_RESTORE:
      - Делать checkpoint и восстанавливать процессы (CRIU)
      Введён в Linux 5.9.
      Риск: высокий. Можно читать память произвольного процесса.

---

## Инструменты

### Установка

    # Debian/Ubuntu
    apt install libcap2-bin    # getcap, setcap, capsh

    # RHEL/Fedora
    dnf install libcap          # getcap, setcap
    dnf install libcap-ng-utils # capsh, pscap, filecap, netcap

### getcap и setcap

    # Посмотреть capabilities файла
    getcap /usr/bin/ping
    getcap /usr/bin/dumpcap

    # Рекурсивный поиск файлов с capabilities
    getcap -r / 2>/dev/null
    getcap -r /usr/ 2>/dev/null

    # Установить capability файлу
    setcap cap_net_raw+ep /usr/bin/ping
    setcap cap_net_bind_service+ep /usr/local/bin/myserver
    setcap cap_net_admin+ep /usr/sbin/wpa_supplicant

    # Несколько capabilities сразу
    setcap 'cap_net_raw,cap_net_admin+ep' /usr/bin/tcpdump

    # Удалить все capabilities с файла
    setcap -r /usr/bin/ping

    # Проверить
    getcap /usr/bin/ping

    Обозначения флагов:
      +e  добавить в effective
      +p  добавить в permitted
      +i  добавить в inheritable
      -e  убрать из effective
      -p  убрать из permitted
      -i  убрать из inheritable
      =   точная установка (сбросить всё и установить только указанное)

      Примеры:
        cap_net_raw+ep     - effective + permitted (самый частый)
        cap_net_raw+p      - только permitted (нужен API для активации)
        cap_net_raw=ep     - то же что +ep, но явный сброс остального
        cap_net_raw+eip    - все три набора

### capsh

    # Показать capabilities текущей оболочки
    capsh --print

    # Декодировать hex из /proc/pid/status
    capsh --decode=0000003fffffffff
    capsh --decode=$(grep CapEff /proc/self/status | cut -f2)

    # Запустить команду с конкретными capabilities
    capsh --caps="cap_net_raw+eip" --user=nobody -- -c "ping -c1 8.8.8.8"

    # Запустить оболочку с ограниченными capabilities
    capsh --drop=cap_net_raw -- -c bash

    # Показать все известные capability имена
    capsh --print | grep Current

### pscap и filecap

    # pscap - capabilities всех процессов (из libcap-ng-utils)
    pscap
    pscap -a    # показать все, включая те у кого нет capabilities

    # filecap - файлы с capabilities
    filecap /usr/bin/
    filecap -a    # все файлы в системе (медленно)

    # netcap - capabilities сетевых процессов
    netcap

### /proc filesystem

    # Capabilities процесса в hex
    cat /proc/self/status | grep Cap
    cat /proc/1234/status | grep Cap

    # Декодировать вручную (каждый бит = одна capability)
    # Бит 0 = CAP_CHOWN, бит 13 = CAP_NET_RAW и т.д.
    python3 -c "
    caps = {
        0: 'CAP_CHOWN', 1: 'CAP_DAC_OVERRIDE', 2: 'CAP_DAC_READ_SEARCH',
        3: 'CAP_FOWNER', 4: 'CAP_FSETID', 5: 'CAP_KILL',
        6: 'CAP_SETGID', 7: 'CAP_SETUID', 8: 'CAP_SETPCAP',
        9: 'CAP_LINUX_IMMUTABLE', 10: 'CAP_NET_BIND_SERVICE',
        11: 'CAP_NET_BROADCAST', 12: 'CAP_NET_ADMIN', 13: 'CAP_NET_RAW',
        14: 'CAP_IPC_LOCK', 15: 'CAP_IPC_OWNER', 16: 'CAP_SYS_MODULE',
        17: 'CAP_SYS_RAWIO', 18: 'CAP_SYS_CHROOT', 19: 'CAP_SYS_PTRACE',
        20: 'CAP_SYS_PACCT', 21: 'CAP_SYS_ADMIN', 22: 'CAP_SYS_BOOT',
        23: 'CAP_SYS_NICE', 24: 'CAP_SYS_RESOURCE', 25: 'CAP_SYS_TIME',
        26: 'CAP_SYS_TTY_CONFIG', 27: 'CAP_MKNOD', 28: 'CAP_LEASE',
        29: 'CAP_AUDIT_WRITE', 30: 'CAP_AUDIT_CONTROL', 31: 'CAP_SETFCAP',
        32: 'CAP_MAC_OVERRIDE', 33: 'CAP_MAC_ADMIN', 34: 'CAP_SYSLOG',
        35: 'CAP_WAKE_ALARM', 36: 'CAP_BLOCK_SUSPEND', 37: 'CAP_AUDIT_READ',
        38: 'CAP_PERFMON', 39: 'CAP_BPF', 40: 'CAP_CHECKPOINT_RESTORE'
    }
    val = int('000001ffffffffff', 16)
    active = [name for bit, name in caps.items() if val & (1 << bit)]
    print('\n'.join(active))
    "

---

## Практические примеры

### Веб-сервер на порту 80 без root

    # Проблема: nginx не может слушать порт 80 без root
    # Решение: cap_net_bind_service

    # Найти бинарник nginx
    which nginx
    ls -la /usr/sbin/nginx

    # Дать capability
    setcap cap_net_bind_service+ep /usr/sbin/nginx

    # Проверить
    getcap /usr/sbin/nginx
    # /usr/sbin/nginx cap_net_bind_service=ep

    # Теперь можно запускать от обычного пользователя
    # В конфиге nginx user www-data уже должен быть
    systemctl start nginx    # запустится без root

    # Аналогично для Node.js
    setcap cap_net_bind_service+ep $(which node)
    node server.js  # слушает :80 без sudo

### ping без SUID

    # Старый способ (небезопасно - полный root на время):
    ls -la /usr/bin/ping
    # -rwsr-xr-x ... /usr/bin/ping  (SUID бит)

    # Снять SUID и использовать capabilities
    chmod u-s /usr/bin/ping
    setcap cap_net_raw+ep /usr/bin/ping

    # Проверить
    ls -la /usr/bin/ping
    # -rwxr-xr-x ... /usr/bin/ping  (нет SUID)
    getcap /usr/bin/ping
    # /usr/bin/ping cap_net_raw=ep

    ping -c 1 8.8.8.8  # работает!

### tcpdump без root

    # tcpdump нужны cap_net_raw и cap_net_admin
    setcap 'cap_net_raw,cap_net_admin+ep' /usr/sbin/tcpdump

    # Теперь обычный пользователь может:
    tcpdump -i eth0 -n

    # wireshark/dumpcap
    setcap cap_net_raw+ep /usr/bin/dumpcap
    # или добавить пользователя в группу wireshark:
    usermod -aG wireshark $USER

### Systemd сервис с capabilities

    # /etc/systemd/system/myapp.service
    [Unit]
    Description=My Application
    After=network.target

    [Service]
    Type=simple
    User=myapp
    Group=myapp
    ExecStart=/opt/myapp/bin/myapp

    # Дать нужные capabilities сервису
    AmbientCapabilities=CAP_NET_BIND_SERVICE
    CapabilityBoundingSet=CAP_NET_BIND_SERVICE

    # Дополнительная изоляция
    NoNewPrivileges=yes
    PrivateTmp=yes
    ProtectSystem=strict
    ProtectHome=yes

    [Install]
    WantedBy=multi-user.target

    # Применить
    systemctl daemon-reload
    systemctl start myapp

    # Если нужны несколько capabilities
    AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_RAW
    CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_NET_RAW

    # Проверить capabilities работающего сервиса
    systemctl show myapp | grep -i cap
    cat /proc/$(systemctl show myapp -p MainPID | cut -d= -f2)/status | grep Cap

### Python приложение с capabilities

    # Способ 1: capabilities на интерпретаторе (не рекомендуется - даёт всем Python скриптам)
    setcap cap_net_raw+ep /usr/bin/python3

    # Способ 2: capabilities на конкретном скрипте (не работает для скриптов напрямую)
    # Python скрипты запускаются через интерпретатор, xattr на .py не работает

    # Способ 3: wrapper бинарник
    # Скомпилировать маленький C враппер который дропает capabilities после bind

    # Способ 4: использовать ambient capabilities через systemd (лучший вариант)
    # В .service файле:
    AmbientCapabilities=CAP_NET_RAW
    CapabilityBoundingSet=CAP_NET_RAW

    # Способ 5: использовать python-prctl или python-cap библиотеку
    pip install python-prctl
    # В коде:
    import prctl
    prctl.cap_effective.net_raw = True
    # ... делать raw socket ...
    prctl.cap_effective.net_raw = False  # дропнуть после использования

### Дроп привилегий в коде

    # Правильная практика: получить capabilities, сделать что нужно, дропнуть

    # C пример (capng из libcap-ng)
    #include <cap-ng.h>

    int main() {
        // Очистить все capabilities
        capng_clear(CAPNG_SELECT_BOTH);

        // Добавить только нужное
        capng_update(CAPNG_ADD, CAPNG_EFFECTIVE | CAPNG_PERMITTED,
                     CAP_NET_BIND_SERVICE);

        // Применить
        capng_apply(CAPNG_SELECT_BOTH);

        // Сменить пользователя на непривилегированного
        setgid(getgrnam("www-data")->gr_gid);
        setuid(getpwnam("www-data")->pw_uid);

        // Дропнуть оставшиеся capabilities
        capng_clear(CAPNG_SELECT_BOTH);
        capng_apply(CAPNG_SELECT_BOTH);

        // Дальнейшая работа без привилегий
        bind(sock, ...);  // уже не нужна capability
    }

---

## Capabilities в контейнерах

### Docker

    # По умолчанию Docker даёт контейнерам подмножество capabilities:
    # cap_chown, cap_dac_override, cap_fsetid, cap_fowner, cap_mknod,
    # cap_net_raw, cap_setgid, cap_setuid, cap_setfcap, cap_setpcap,
    # cap_net_bind_service, cap_sys_chroot, cap_kill, cap_audit_write

    # Посмотреть capabilities контейнера
    docker inspect <container> | grep -A 20 CapAdd

    # Запустить без всех capabilities (затем добавить нужные)
    docker run --cap-drop ALL --cap-add NET_BIND_SERVICE nginx

    # Добавить конкретную capability
    docker run --cap-add NET_RAW ubuntu ping 8.8.8.8
    docker run --cap-add SYS_PTRACE ubuntu strace ls

    # Полный набор (небезопасно, как root)
    docker run --privileged ubuntu

    # Проверить capabilities внутри контейнера
    docker run --rm ubuntu cat /proc/self/status | grep Cap
    docker run --cap-drop ALL --cap-add NET_BIND_SERVICE --rm ubuntu \
      cat /proc/self/status | grep Cap

    # Рекомендуемый минимум для большинства контейнеров:
    docker run \
      --cap-drop ALL \
      --cap-add CHOWN \
      --cap-add SETUID \
      --cap-add SETGID \
      --cap-add NET_BIND_SERVICE \
      nginx

### Docker Compose

    # docker-compose.yml
    services:
      nginx:
        image: nginx
        cap_drop:
          - ALL
        cap_add:
          - NET_BIND_SERVICE
          - CHOWN
          - SETUID
          - SETGID

      tcpdump:
        image: tcpdump
        cap_add:
          - NET_RAW
          - NET_ADMIN

### Kubernetes

    # pod.yaml - securityContext на уровне контейнера
    spec:
      containers:
      - name: myapp
        image: myapp:latest
        securityContext:
          capabilities:
            drop:
              - ALL
            add:
              - NET_BIND_SERVICE

    # Добавить несколько
    securityContext:
      capabilities:
        drop:
          - ALL
        add:
          - NET_BIND_SERVICE
          - NET_RAW

    # Запретить эскалацию привилегий
    securityContext:
      allowPrivilegeEscalation: false
      runAsNonRoot: true
      capabilities:
        drop:
          - ALL

    # Проверить capabilities пода
    kubectl exec <pod> -- cat /proc/1/status | grep Cap

### Podman

    # Аналогично Docker
    podman run --cap-drop ALL --cap-add NET_BIND_SERVICE nginx

    # По умолчанию Podman (rootless) даёт меньше capabilities, чем Docker

---

## Безопасность и аудит

### Опасные capabilities

    Критические (эквивалент root):
      CAP_SYS_ADMIN    - почти полный root
      CAP_SYS_PTRACE   - инъекция кода в любой процесс
      CAP_SYS_MODULE   - загрузка kernel модулей
      CAP_SYS_RAWIO    - доступ к /dev/mem
      CAP_SETUID       - стать root (UID 0)
      CAP_SETPCAP      - передать capabilities другим
      CAP_SETFCAP      - дать capabilities любому файлу

    Высокий риск:
      CAP_NET_RAW      - перехват и подделка пакетов
      CAP_NET_ADMIN    - полный контроль над сетью
      CAP_DAC_OVERRIDE - читать/писать любые файлы
      CAP_CHOWN        - захватить любой файл
      CAP_BPF          - читать память ядра через eBPF

    Средний риск:
      CAP_KILL         - убивать чужие процессы
      CAP_SYS_CHROOT   - побег из chroot
      CAP_AUDIT_CONTROL - скрытие от audit

### Поиск процессов с мощными capabilities

    # Найти все процессы с capabilities (pscap)
    pscap
    pscap -a | grep -v "^$"

    # Найти процессы с конкретной capability
    # CAP_SYS_ADMIN = бит 21 = 0x200000
    for pid in /proc/[0-9]*; do
        eff=$(grep CapEff $pid/status 2>/dev/null | awk '{print $2}')
        if [ -n "$eff" ] && [ $((16#$eff & 0x200000)) -ne 0 ]; then
            echo "PID $(basename $pid): $(cat $pid/comm 2>/dev/null) - CAP_SYS_ADMIN"
        fi
    done

    # Найти файлы с capabilities (для аудита)
    getcap -r / 2>/dev/null | grep -v "^$"

    # Файлы с SUID (старый способ, тоже важно аудитить)
    find / -perm -4000 -type f 2>/dev/null
    find / -perm -2000 -type f 2>/dev/null

### NoNewPrivileges

    # Запрещает процессу получать новые привилегии через SUID/capabilities
    # Важная защита: даже если файл имеет capabilities - процесс не получит их

    # В коде (C):
    prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);

    # В systemd:
    NoNewPrivileges=yes

    # В Docker (--security-opt no-new-privileges):
    docker run --security-opt no-new-privileges nginx

    # В Kubernetes:
    securityContext:
      allowPrivilegeEscalation: false

### Seccomp + Capabilities

    Capabilities и seccomp дополняют друг друга:
      - Capabilities контролируют что процесс может делать с привилегиями
      - Seccomp контролируют какие syscall процесс может вызывать

    # Проверить seccomp статус процесса
    cat /proc/self/status | grep Seccomp
    # Seccomp: 0  (0=нет, 1=strict, 2=filter)

    # Docker применяет оба механизма одновременно

### Аудит изменений capabilities

    # auditd: логировать setcap вызовы
    auditctl -a always,exit -F arch=b64 -S setxattr -k capabilities_change
    auditctl -a always,exit -F arch=b64 -S fsetxattr -k capabilities_change

    # Смотреть в audit логе
    ausearch -k capabilities_change

    # Логировать execve (запуск процессов с capabilities)
    auditctl -a always,exit -F arch=b64 -S execve -k exec_tracking

---

## Типичные ошибки и решения

    Ошибка: "Operation not permitted" при bind на порт 80
    Причина: нет CAP_NET_BIND_SERVICE
    Решение:
      setcap cap_net_bind_service+ep /path/to/binary
      # или в systemd:
      AmbientCapabilities=CAP_NET_BIND_SERVICE

    Ошибка: setcap не сохраняется после обновления пакета
    Причина: обновление заменяет бинарник, xattr теряется
    Решение:
      # Создать hook или скрипт после обновления:
      # /etc/apt/apt.conf.d/99-setcap-hook (Debian/Ubuntu)
      DPkg::Post-Invoke {"setcap cap_net_bind_service+ep /usr/sbin/nginx";};

    Ошибка: capabilities не работают для скриптов (Python, Bash)
    Причина: ядро не поддерживает capabilities для интерпретируемых файлов
    Решение:
      # Использовать ambient capabilities через systemd
      # Или написать маленький C враппер
      # Или использовать специализированные библиотеки (python-prctl)

    Ошибка: capability есть в Permitted но не работает
    Причина: capability не добавлена в Effective
    Решение:
      # Для файлов - использовать +ep а не только +p
      setcap cap_net_raw+ep /binary  # не +p
      # Или в коде активировать через prctl/cap_set_proc

    Ошибка: после setuid() теряются capabilities
    Причина: по умолчанию capabilities сбрасываются при смене UID
    Решение:
      # До смены UID вызвать:
      prctl(PR_SET_KEEPCAPS, 1);
      setuid(new_uid);
      # Затем восстановить нужные capabilities через cap_set_proc

    Ошибка: в контейнере Kubernetes нет нужной capability
    Причина: PodSecurityPolicy или SecurityContext их запрещает
    Решение:
      securityContext:
        capabilities:
          add: ["NET_BIND_SERVICE"]

---

## Шпаргалка

    Просмотр:
      getcap /path/to/binary              - capabilities файла
      getcap -r /usr/bin/ 2>/dev/null     - рекурсивно
      capsh --print                       - capabilities текущего процесса
      capsh --decode=<hex>                - декодировать hex
      cat /proc/<pid>/status | grep Cap   - capabilities процесса в hex
      pscap                               - capabilities всех процессов

    Управление файлами:
      setcap cap_net_raw+ep /bin          - установить capability
      setcap 'cap_net_raw,cap_net_admin+ep' /bin  - несколько сразу
      setcap -r /bin                      - удалить все capabilities

    Флаги:
      +e  effective (реально проверяется ядром)
      +p  permitted (максимум что может быть в effective)
      +i  inheritable (передаётся через exec)
      =ep установить только ep, сбросить остальное

    Systemd:
      AmbientCapabilities=CAP_NET_BIND_SERVICE   - дать capability сервису
      CapabilityBoundingSet=CAP_NET_BIND_SERVICE - ограничить bounding set
      NoNewPrivileges=yes                         - запретить эскалацию

    Docker:
      --cap-drop ALL                      - убрать все capabilities
      --cap-add NET_BIND_SERVICE          - добавить конкретную
      --privileged                        - полный набор (небезопасно)

    Kubernetes:
      capabilities: {drop: [ALL], add: [NET_BIND_SERVICE]}
      allowPrivilegeEscalation: false

    Часто используемые capabilities:
      CAP_NET_BIND_SERVICE  - слушать порты < 1024
      CAP_NET_RAW           - raw sockets (ping, tcpdump)
      CAP_NET_ADMIN         - настройка сети, iptables
      CAP_SYS_ADMIN         - всё остальное (избегать!)
      CAP_SETUID/SETGID     - смена пользователя (drop privileges)
      CAP_DAC_OVERRIDE      - обход прав файлов (избегать!)
      CAP_IPC_LOCK          - mlock (БД, HSM)
      CAP_SYS_PTRACE        - отладка (gdb, strace)

---

## Ссылки

- [man 7 capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html) - полная документация
- [man 8 setcap](https://man7.org/linux/man-pages/man8/setcap.8.html)
- [man 8 getcap](https://man7.org/linux/man-pages/man8/getcap.8.html)
- [man 1 capsh](https://man7.org/linux/man-pages/man1/capsh.1.html)
- [Linux Kernel - capabilities.h](https://github.com/torvalds/linux/blob/master/include/uapi/linux/capability.h)
- [Docker Security - Capabilities](https://docs.docker.com/engine/security/#linux-kernel-capabilities)
- [Kubernetes Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Systemd - Capabilities](https://www.freedesktop.org/software/systemd/man/systemd.exec.html#Capabilities)
- [A Guide to Linux Capabilities (Red Hat)](https://www.redhat.com/en/blog/linux-capabilities-part-0)
- [libcap-ng documentation](https://people.redhat.com/sgrubb/libcap-ng/)
