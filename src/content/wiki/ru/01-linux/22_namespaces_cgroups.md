---
title: "Namespaces и cgroups - основа контейнеров"
date: "2026-05-09"
---

Namespaces и cgroups - два механизма ядра Linux, которые вместе образуют фундамент всех контейнерных технологий: Docker, Podman, LXC, Kubernetes. Namespaces обеспечивают изоляцию - каждый контейнер видит свой "срез" системы. cgroups обеспечивают ограничение ресурсов - сколько CPU, памяти, I/O может использовать группа процессов.

    Контейнер = namespace изоляция + cgroup ограничения + filesystem (rootfs)

    Без namespaces: все процессы видят одни и те же PID, сеть, пользователей, файлы.
    Без cgroups: один процесс может занять всю память или CPU и убить систему.

---

## Namespaces

Namespace - это абстракция, которая оборачивает глобальный системный ресурс и делает его приватным для группы процессов. Процессы внутри namespace видят только свои изолированные ресурсы.

Linux поддерживает 8 типов namespaces:

    mnt   - точки монтирования (mount points)
    pid   - идентификаторы процессов
    net   - сетевые интерфейсы, порты, таблицы маршрутизации
    ipc   - IPC: очереди сообщений, семафоры, shared memory
    uts   - hostname и domainname
    user  - UID/GID маппинг (привилегии пользователей)
    cgroup - иерархия cgroups (Linux 4.6+)
    time  - системное время (Linux 5.6+)

### Системные вызовы

    clone():
      Создаёт новый процесс (как fork) и опционально новые namespaces.
      Флаги: CLONE_NEWPID, CLONE_NEWNET, CLONE_NEWNS (mnt), и т.д.

    unshare():
      Отсоединяет текущий процесс от namespace без создания нового процесса.
      Команда unshare(1) - userspace обёртка.

    setns():
      Присоединяет текущий поток к существующему namespace.
      Используется nsenter(1) и контейнерными runtime.

    # Посмотреть namespaces текущего процесса
    ls -la /proc/self/ns/
    # lrwxrwxrwx ... cgroup -> cgroup:[4026531835]
    # lrwxrwxrwx ... ipc    -> ipc:[4026531839]
    # lrwxrwxrwx ... mnt    -> mnt:[4026531841]
    # lrwxrwxrwx ... net    -> net:[4026531840]
    # lrwxrwxrwx ... pid    -> pid:[4026531836]
    # lrwxrwxrwx ... user   -> user:[4026531837]
    # lrwxrwxrwx ... uts    -> uts:[4026531838]

    # Namespaces конкретного процесса
    ls -la /proc/<pid>/ns/

    # Посмотреть какие namespaces используют процессы (lsns)
    lsns
    lsns -t pid     # только pid namespaces
    lsns -t net     # только net namespaces

---

## PID Namespace

Изолирует пространство идентификаторов процессов. Процессы внутри namespace имеют свои PID, начиная с 1. PID 1 внутри контейнера - это init контейнера.

    Ключевые свойства:
      - Процесс внутри namespace не видит процессы снаружи
      - Снаружи виден "внешний" PID того же процесса
      - PID namespace вложены: дочерний namespace видит только свои PID
      - Если PID 1 (init контейнера) завершается - namespace уничтожается
      - Сигналы от родительского namespace могут достигать дочерних процессов

    # Создать новый PID namespace
    unshare --pid --fork --mount-proc bash

    # Внутри - только свои процессы
    ps aux
    # PID 1 - bash

    # Снаружи - видны оба PID
    # PID 1234 (внешний) = PID 1 (внутри namespace)

    # Пример: запустить процесс в новом PID namespace
    unshare --pid --fork sleep 1000 &
    PID_OUTSIDE=$!
    echo "Внешний PID: $PID_OUTSIDE"

    # Войти в namespace процесса
    nsenter --pid=/proc/$PID_OUTSIDE/ns/pid ps aux

    # Docker пример - PID 1 в контейнере
    docker run --rm alpine ps aux
    # PID 1 = /bin/sh (или точка входа)

    # Поделиться PID namespace с хостом (небезопасно)
    docker run --pid=host alpine ps aux  # видит все процессы хоста

    # Поделиться PID namespace между контейнерами
    docker run -d --name app1 nginx
    docker run --pid=container:app1 alpine ps aux  # видит процессы app1

---

## Network Namespace

Изолирует весь сетевой стек: интерфейсы, IP адреса, таблицы маршрутизации, правила iptables, сокеты.

    Ключевые свойства:
      - Новый net namespace содержит только loopback (lo)
      - Каждый контейнер получает свой eth0
      - Связь между namespaces через veth пары (virtual ethernet)
      - Или через macvlan, ipvlan
      - Docker bridge (docker0) - это виртуальный свитч в хостовом namespace

    # Создать новый network namespace
    ip netns add myns

    # Список network namespaces
    ip netns list

    # Выполнить команду в namespace
    ip netns exec myns ip addr show
    ip netns exec myns ip link show

    # Создать veth пару для связи namespace с хостом
    ip link add veth0 type veth peer name veth1

    # Переместить один конец veth в namespace
    ip link set veth1 netns myns

    # Настроить адреса
    ip addr add 192.168.100.1/24 dev veth0
    ip link set veth0 up

    ip netns exec myns ip addr add 192.168.100.2/24 dev veth1
    ip netns exec myns ip link set veth1 up
    ip netns exec myns ip link set lo up

    # Проверить связность
    ping 192.168.100.2

    # Удалить namespace
    ip netns delete myns

    # Посмотреть network namespace процесса
    ls -la /proc/<pid>/ns/net

    # Связать persistent namespace с файловой системой
    ip netns add persistent_ns
    # Файл создаётся в /var/run/netns/persistent_ns

    # Как Docker создаёт сеть для контейнера (упрощённо):
    # 1. clone(CLONE_NEWNET) - создать namespace
    # 2. ip link add vethXXX type veth peer name ethYYY
    # 3. ip link set ethYYY netns <container_ns>
    # 4. ip link set ethYYY name eth0 (внутри namespace)
    # 5. ip addr add <container_ip> dev eth0
    # 6. ip link set docker0 master vethXXX
    # 7. ip link set vethXXX up

---

## Mount Namespace

Изолирует таблицу точек монтирования. Каждый namespace имеет свой независимый набор mount points.

    Ключевые свойства:
      - Изменения в mount namespace не видны другим namespace
      - Основа для pivot_root и chroot в контейнерах
      - Shared subtree: propagation типы (shared, private, slave, unbindable)
      - /proc/mounts и /proc/self/mountinfo - своя таблица для каждого namespace

    # Создать новый mount namespace
    unshare --mount bash

    # Внутри - можно монтировать без влияния на хост
    mount --bind /tmp/mydir /mnt/test
    mount | grep test   # видно
    # В другом терминале на хосте - не видно

    # Создать минимальную filesystem для контейнера
    mkdir -p /tmp/rootfs/{bin,lib,lib64,proc,sys,dev,tmp}
    # Скопировать нужные бинарники...

    # pivot_root - сменить корневую FS (используется контейнерными runtime)
    unshare --mount --pid --fork bash
    mount --bind /tmp/rootfs /tmp/rootfs
    mkdir -p /tmp/rootfs/oldroot
    pivot_root /tmp/rootfs /tmp/rootfs/oldroot
    mount -t proc proc /proc
    umount -l /oldroot

    # Propagation типы (важно для bindmount поведения)
    # shared  - изменения распространяются в оба направления
    # private - изменения изолированы (по умолчанию в namespace)
    # slave   - изменения с хоста видны внутри, но не наоборот
    # unbindable - не может быть bind-mounted

    # Сделать точку монтирования private
    mount --make-private /mnt

    # Сделать всё дерево private (для изоляции)
    mount --make-rprivate /

    # Kubernetes: tmpfs для secrets
    # /var/lib/kubelet/pods/<pod>/volumes/kubernetes.io~secret/<secret>
    # монтируется как tmpfs в отдельном mount namespace пода

---

## UTS Namespace

Изолирует hostname и NIS domainname. Каждый контейнер может иметь своё имя хоста.

    # Создать UTS namespace с новым hostname
    unshare --uts bash
    hostname mycontainer
    hostname    # mycontainer
    # На хосте hostname не изменился

    # Docker устанавливает hostname контейнера через UTS namespace
    docker run --rm --hostname myapp alpine hostname
    # myapp

    # По умолчанию Docker использует короткий container ID как hostname
    docker run --rm alpine hostname
    # a3f2b1c4d5e6 (container ID)

---

## IPC Namespace

Изолирует System V IPC объекты (очереди сообщений, семафоры, shared memory сегменты) и POSIX message queues.

    # Создать IPC namespace
    unshare --ipc bash

    # Внутри - свои IPC объекты, не видны снаружи
    ipcmk -Q          # создать message queue
    ipcs -q           # видим

    # Снаружи
    ipcs -q           # пусто, объекты изолированы

    # Важно для баз данных в контейнерах:
    # PostgreSQL использует shared memory (shmem) для буферного пула
    # Без IPC namespace - shmem сегменты видны всем процессам хоста
    # С IPC namespace - изолированы внутри контейнера

    # Docker по умолчанию создаёт новый IPC namespace
    # Поделиться IPC namespace между контейнерами (для shared memory)
    docker run -d --name app1 --ipc=shareable myapp
    docker run --ipc=container:app1 myapp-sidecar

    # Использовать IPC namespace хоста (небезопасно)
    docker run --ipc=host myapp

---

## User Namespace

Изолирует UID и GID. Позволяет процессу иметь root внутри namespace, оставаясь непривилегированным снаружи. Основа для rootless контейнеров.

    Ключевые свойства:
      - UID 0 внутри namespace маппится на непривилегированный UID снаружи
      - Capabilities внутри namespace не работают снаружи
      - Не требует root для создания (единственный namespace без root)
      - Основа Podman rootless, Docker rootless mode, Buildah

    # Создать user namespace без root
    unshare --user --map-root-user bash
    # Теперь мы "root" внутри namespace
    id
    # uid=0(root) gid=0(root) groups=0(root),...

    # Но снаружи - обычный пользователь
    # В другом терминале:
    ps aux | grep bash
    # Видно что процесс запущен от обычного UID

    # UID маппинг
    cat /proc/self/uid_map
    # 0  1000  1    (UID 0 внутри = UID 1000 снаружи, 1 пользователь)

    # Установить маппинг вручную
    # /proc/<pid>/uid_map формат: <внутренний_uid> <внешний_uid> <кол-во>
    echo "0 1000 1" > /proc/<pid>/uid_map
    echo "0 1000 1" > /proc/<pid>/gid_map

    # Диапазонный маппинг (для контейнеров)
    # UID 0-65535 внутри = UID 100000-165535 снаружи
    echo "0 100000 65536" > /proc/<pid>/uid_map

    # /etc/subuid и /etc/subgid - диапазоны UID для пользователей
    cat /etc/subuid
    # username:100000:65536
    # username получает UID 100000-165535 для user namespaces

    # Добавить диапазон пользователю
    usermod --add-subuids 100000-165535 username
    usermod --add-subgids 100000-165535 username

    # Rootless Docker
    dockerd-rootless-setuptool.sh install
    docker context use rootless
    docker run --rm alpine id
    # uid=0(root) но снаружи это обычный пользователь

    # Rootless Podman (работает из коробки)
    podman run --rm alpine id
    # uid=0(root) внутри контейнера

    # Посмотреть маппинг контейнера
    podman unshare cat /proc/self/uid_map

---

## cgroup Namespace

Изолирует иерархию cgroup. Процесс видит свою cgroup как корень "/" вместо реального пути.

    # Без cgroup namespace контейнер видит путь:
    # /sys/fs/cgroup/memory/docker/<container_id>/

    # С cgroup namespace контейнер видит:
    # /sys/fs/cgroup/memory/

    # Полезно для безопасности - не раскрывает структуру хостовых cgroup
    # И для инструментов внутри контейнера (systemd, etc.)

    cat /proc/self/cgroup
    # Внутри контейнера с cgroup namespace - показывает / как корень

---

## Time Namespace

Изолирует CLOCK_MONOTONIC и CLOCK_BOOTTIME. Позволяет контейнеру иметь своё "время работы" системы.

    # Linux 5.6+
    # Полезно для:
    # - Чекпоинт/рестор (CRIU): восстановить время без прыжков
    # - Тестирование приложений зависящих от uptime
    # - Миграция контейнеров между хостами

    # Создать time namespace с другим offset
    unshare --time --monotonic-offset 3600 bash
    # uptime внутри будет отличаться на 1 час

---

## Работа с namespaces - утилиты

### unshare

    # Синтаксис: unshare [опции] [программа]

    # Новый UTS namespace
    unshare --uts bash

    # Новый network + UTS + PID namespace
    unshare --net --uts --pid --fork bash

    # Новый mount namespace
    unshare --mount bash

    # Полная изоляция (все namespaces)
    unshare --mount --uts --ipc --net --pid --user --map-root-user --fork bash

    # Создать namespace и примонтировать /proc (для корректного ps)
    unshare --pid --fork --mount-proc bash

### nsenter

    # Войти в namespace существующего процесса
    nsenter --target <pid> --mount --uts --ipc --net --pid

    # Войти только в net namespace
    nsenter --target <pid> --net

    # Войти в все namespaces процесса
    nsenter -t <pid> -m -u -i -n -p

    # Войти в namespace Docker контейнера
    docker inspect --format '{{.State.Pid}}' mycontainer
    nsenter -t <pid> -n ip addr show   # сетевые интерфейсы контейнера

    # Войти в namespace по файлу
    nsenter --net=/var/run/netns/myns ip addr show

    # Эквивалент docker exec
    nsenter -t $(docker inspect --format '{{.State.Pid}}' mycontainer) \
      -m -u -i -n -p -- bash

### lsns

    # Показать все namespaces системы
    lsns

    # Пример вывода:
    # NS TYPE  NPROCS   PID USER       COMMAND
    # 4026531835 cgroup    120     1 root       /sbin/init
    # 4026531836 pid       120     1 root       /sbin/init
    # 4026531837 user      120     1 root       /sbin/init
    # 4026531838 uts       120     1 root       /sbin/init
    # 4026531839 ipc       120     1 root       /sbin/init
    # 4026531840 net       120     1 root       /sbin/init
    # 4026532xxx net         2  5678 root       nginx

    # Фильтр по типу
    lsns -t net
    lsns -t pid

    # Фильтр по процессу
    lsns -p <pid>

---

## cgroups

cgroups (control groups) - механизм ядра для организации процессов в иерархические группы и управления использованием ресурсов. Введён в Linux 2.6.24 (cgroups v1), переработан в cgroups v2 (Linux 4.5, основной с 5.2+).

    Что контролируют cgroups:
      - CPU: квота, доля, привязка к ядрам
      - Memory: лимит RAM, swap, OOM поведение
      - I/O: пропускная способность и IOPS для блочных устройств
      - Network: приоритизация трафика (tc/net_cls)
      - PIDs: максимальное количество процессов
      - Devices: доступ к /dev устройствам
      - Freezer: пауза/возобновление группы процессов
      - Hugetlb: лимит huge pages

---

## cgroups v1 vs v2

    cgroups v1:
      - Несколько независимых иерархий, по одной на subsystem (controller)
      - /sys/fs/cgroup/cpu/, /sys/fs/cgroup/memory/, и т.д. - отдельные деревья
      - Процесс может быть в разных группах для разных subsystems
      - Сложная и непоследовательная семантика
      - Проблема: нет единого владельца группы процессов

    cgroups v2 (unified hierarchy):
      - Одна иерархия для всех controllers
      - /sys/fs/cgroup/ - единое дерево
      - Процесс принадлежит ровно одной cgroup
      - Делегирование: непривилегированные пользователи могут управлять своими cgroup
      - Лучшая поддержка в systemd, containerd, Docker (>= 20.10)

    # Проверить версию cgroup на системе
    stat -fc %T /sys/fs/cgroup/
    # tmpfs   = cgroups v1
    # cgroup2fs = cgroups v2 (unified)

    # Большинство современных систем используют v2 (Ubuntu 21.10+, Fedora 31+)
    # Или гибридный режим (v1 + v2 одновременно)

    mount | grep cgroup
    # cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)
    # или
    # tmpfs on /sys/fs/cgroup type tmpfs
    # cgroup on /sys/fs/cgroup/cpu type cgroup (...,cpu,cpuacct)
    # cgroup on /sys/fs/cgroup/memory type cgroup (...,memory)

---

## cgroups v2 - структура и использование

### Filesystem структура

    /sys/fs/cgroup/           - корень unified hierarchy
    ├── cgroup.controllers    # доступные controllers
    ├── cgroup.procs          # PID процессов в этой cgroup
    ├── cgroup.subtree_control # включённые controllers для дочерних
    ├── cpu.stat              # статистика CPU
    ├── memory.current        # текущее использование памяти
    ├── memory.max            # лимит памяти
    ├── io.stat               # I/O статистика
    └── mygroup/              # дочерняя cgroup
        ├── cgroup.procs
        ├── memory.max
        └── cpu.max

    # Посмотреть доступные controllers
    cat /sys/fs/cgroup/cgroup.controllers
    # cpuset cpu io memory hugetlb pids rdma misc

    # Посмотреть включённые controllers для дочерних cgroup
    cat /sys/fs/cgroup/cgroup.subtree_control
    # cpu io memory pids

### Создание cgroup и управление процессами

    # Создать cgroup (просто mkdir)
    mkdir /sys/fs/cgroup/myapp

    # Включить нужные controllers
    echo "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control

    # Переместить процесс в cgroup
    echo <pid> > /sys/fs/cgroup/myapp/cgroup.procs

    # Переместить текущую оболочку
    echo $$ > /sys/fs/cgroup/myapp/cgroup.procs

    # Посмотреть процессы в cgroup
    cat /sys/fs/cgroup/myapp/cgroup.procs

    # Посмотреть все tasks (потоки) в cgroup
    cat /sys/fs/cgroup/myapp/cgroup.threads

    # Посмотреть в какой cgroup находится процесс
    cat /proc/<pid>/cgroup
    # 0::/myapp   (v2 unified: одна строка начинается с 0::)

    # Удалить cgroup (должна быть пустой)
    rmdir /sys/fs/cgroup/myapp

### Memory controller

    # Лимит RAM
    echo 512M > /sys/fs/cgroup/myapp/memory.max
    # или в байтах:
    echo 536870912 > /sys/fs/cgroup/myapp/memory.max

    # Лимит swap (memory + swap вместе)
    echo 1G > /sys/fs/cgroup/myapp/memory.swap.max

    # Текущее использование
    cat /sys/fs/cgroup/myapp/memory.current

    # Статистика памяти (детальная)
    cat /sys/fs/cgroup/myapp/memory.stat
    # anon 1234567      - анонимная память (heap, stack)
    # file 2345678      - файловый кэш
    # kernel 345678     - kernel память
    # shmem 0           - shared memory
    # ...

    # Лимит "мягкий" - ядро пробует держать ниже, но не гарантирует
    echo 256M > /sys/fs/cgroup/myapp/memory.low
    echo 384M > /sys/fs/cgroup/myapp/memory.high  # при превышении - throttle

    # OOM поведение - что делать при OOM
    cat /sys/fs/cgroup/myapp/memory.oom.group
    # 0 = убить только нарушителя (по умолчанию)
    # 1 = убить всю cgroup (атомарно)
    echo 1 > /sys/fs/cgroup/myapp/memory.oom.group

    # События OOM (inotify или epoll на memory.events)
    cat /sys/fs/cgroup/myapp/memory.events
    # low 0
    # high 0
    # max 0        - сколько раз превысили memory.max
    # oom 0        - сколько OOM событий
    # oom_kill 0   - сколько процессов убито OOM killer

### CPU controller

    # CPU квота (bandwidth throttling)
    # Формат: <quota_us> <period_us>
    # Пример: 50000 100000 = 50% одного ядра (50ms из каждых 100ms)
    echo "50000 100000" > /sys/fs/cgroup/myapp/cpu.max
    # "max 100000" = без ограничений

    # 200% (2 ядра):
    echo "200000 100000" > /sys/fs/cgroup/myapp/cpu.max

    # CPU weight (относительный приоритет, заменяет cpu.shares в v1)
    # Диапазон: 1-10000, по умолчанию 100
    echo 200 > /sys/fs/cgroup/myapp/cpu.weight  # вдвое больше CPU чем другие

    # Привязка к CPU ядрам (cpuset)
    echo 0-3 > /sys/fs/cgroup/myapp/cpuset.cpus       # использовать ядра 0,1,2,3
    echo 0 > /sys/fs/cgroup/myapp/cpuset.mems           # использовать NUMA node 0

    # Статистика CPU
    cat /sys/fs/cgroup/myapp/cpu.stat
    # usage_usec 1234567     - суммарное время CPU в микросекундах
    # user_usec 987654       - время в user space
    # system_usec 246913     - время в kernel space
    # nr_throttled 5         - сколько раз был throttled
    # throttled_usec 50000   - суммарное время throttling

### I/O controller

    # Лимит I/O (требует знать major:minor номер устройства)
    ls -la /dev/sda   # 8:0

    # Лимит чтения: 50 MB/s
    echo "8:0 rbps=52428800" > /sys/fs/cgroup/myapp/io.max
    # Лимит записи: 20 MB/s
    echo "8:0 wbps=20971520" > /sys/fs/cgroup/myapp/io.max
    # IOPS лимиты
    echo "8:0 riops=1000 wiops=500" > /sys/fs/cgroup/myapp/io.max
    # Всё вместе
    echo "8:0 rbps=52428800 wbps=20971520 riops=1000 wiops=500" \
      > /sys/fs/cgroup/myapp/io.max

    # I/O weight (приоритет)
    echo "8:0 100" > /sys/fs/cgroup/myapp/io.weight  # 100 = default

    # Статистика I/O
    cat /sys/fs/cgroup/myapp/io.stat
    # 8:0 rbytes=1234567 wbytes=2345678 rios=123 wios=456 dbytes=0 dios=0

### PID controller

    # Лимит на количество процессов/потоков
    echo 100 > /sys/fs/cgroup/myapp/pids.max
    # "max" = без ограничений

    # Текущее количество
    cat /sys/fs/cgroup/myapp/pids.current

    # Защита от fork bomb:
    echo 50 > /sys/fs/cgroup/myapp/pids.max
    # При попытке создать 51-й процесс - EAGAIN

---

## cgroups v1 - устаревший но ещё встречается

### Структура v1

    /sys/fs/cgroup/
    ├── cpu/              - CPU scheduling
    ├── cpuacct/          - CPU accounting
    ├── cpuset/           - привязка к CPU/NUMA
    ├── memory/           - Memory limits
    ├── blkio/            - Block I/O
    ├── pids/             - PID limits
    ├── devices/          - Device access
    ├── freezer/          - Pause/resume
    ├── net_cls/          - Network class tagging
    ├── net_prio/         - Network priority
    └── hugetlb/          - Huge pages

### cgroups v1 - Memory

    # Создать cgroup
    mkdir /sys/fs/cgroup/memory/myapp

    # Установить лимит памяти
    echo 536870912 > /sys/fs/cgroup/memory/myapp/memory.limit_in_bytes
    # 512M = 512 * 1024 * 1024 = 536870912

    # Лимит swap
    echo 1073741824 > /sys/fs/cgroup/memory/myapp/memory.memsw.limit_in_bytes
    # 1G total (memory + swap)

    # Добавить процесс
    echo <pid> > /sys/fs/cgroup/memory/myapp/tasks

    # OOM kill вместо throttle
    echo 1 > /sys/fs/cgroup/memory/myapp/memory.oom_control
    # 0 = OOM killer включён (по умолчанию)
    # 1 = OOM killer выключен (процесс приостанавливается)

    # Статистика
    cat /sys/fs/cgroup/memory/myapp/memory.usage_in_bytes
    cat /sys/fs/cgroup/memory/myapp/memory.stat

### cgroups v1 - CPU

    # Создать cgroup
    mkdir /sys/fs/cgroup/cpu/myapp

    # CPU shares (относительный вес, не абсолютный)
    echo 512 > /sys/fs/cgroup/cpu/myapp/cpu.shares  # 512 vs default 1024

    # CPU квота (100ms период, 50ms квота = 50%)
    echo 100000 > /sys/fs/cgroup/cpu/myapp/cpu.cfs_period_us
    echo 50000 > /sys/fs/cgroup/cpu/myapp/cpu.cfs_quota_us
    # -1 в quota = без ограничений

    # cpuset - привязать к ядрам
    mkdir /sys/fs/cgroup/cpuset/myapp
    echo 0-1 > /sys/fs/cgroup/cpuset/myapp/cpuset.cpus
    echo 0 > /sys/fs/cgroup/cpuset/myapp/cpuset.mems
    echo <pid> > /sys/fs/cgroup/cpuset/myapp/tasks

---

## systemd и cgroups

systemd является основным менеджером cgroups на большинстве Linux систем. Каждый сервис, пользовательская сессия и transient unit получает свою cgroup.

    # Структура cgroup дерева systemd
    /sys/fs/cgroup/
    └── system.slice/                    # системные сервисы
        ├── nginx.service/
        ├── postgresql.service/
        ├── docker.service/
    └── user.slice/                      # пользовательские сессии
        └── user-1000.slice/
            └── session-1.scope/
    └── init.scope                       # PID 1 (systemd)

    # Показать cgroup дерево
    systemd-cgls
    systemd-cgls /system.slice/nginx.service

    # Показать потребление ресурсов
    systemd-cgtop
    systemd-cgtop --depth=3

    # Посмотреть cgroup сервиса
    systemctl show nginx.service | grep -i cgroup
    # ControlGroup=/system.slice/nginx.service

    # Установить лимиты через systemd (изменяют cgroup)
    systemctl set-property nginx.service MemoryMax=512M
    systemctl set-property nginx.service CPUQuota=50%
    systemctl set-property nginx.service TasksMax=100

    # Временно (не сохраняется)
    systemctl set-property --runtime nginx.service MemoryMax=256M

    # В unit файле напрямую:
    # /etc/systemd/system/myapp.service
    [Service]
    MemoryMax=512M
    MemorySwapMax=0        # запретить swap
    CPUQuota=100%          # 1 ядро
    CPUWeight=200          # двойной приоритет
    TasksMax=200           # максимум процессов
    IOWeight=100           # I/O приоритет
    IOReadBandwidthMax=/dev/sda 50M
    IOWriteBandwidthMax=/dev/sda 20M

    # Запустить временный scope (например для ограничения команды)
    systemd-run --scope --slice=myslice.slice \
      -p MemoryMax=256M -p CPUQuota=50% \
      bash -c "stress --cpu 4 --timeout 60"

    # Показать лимиты сервиса
    systemctl show nginx.service | grep -E "Memory|CPU|Tasks|IO"

---

## Docker и контейнерные runtime

### Как Docker использует namespaces и cgroups

    При docker run Docker (через containerd и runc) делает:
      1. clone() с флагами CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS |
                         CLONE_NEWIPC | CLONE_NEWUTS | CLONE_NEWUSER (rootless)
      2. Создаёт cgroup в /sys/fs/cgroup/docker/<container_id>/
      3. Устанавливает лимиты ресурсов в cgroup
      4. pivot_root в rootfs контейнера
      5. Запускает entrypoint

    # Посмотреть namespaces контейнера
    docker inspect <container> | grep -i pid
    docker inspect --format '{{.State.Pid}}' <container>
    ls -la /proc/<container_pid>/ns/

    # Посмотреть cgroup контейнера
    docker inspect --format '{{.HostConfig.CgroupParent}}' <container>
    cat /proc/<container_pid>/cgroup

    # Cgroup контейнера на хосте
    ls /sys/fs/cgroup/docker/   # cgroups v1
    ls /sys/fs/cgroup/system.slice/docker-*.scope/  # cgroups v2

### Docker - управление ресурсами

    # Лимит памяти
    docker run --memory 512m nginx
    docker run -m 512m nginx
    docker run --memory 512m --memory-swap 1g nginx  # + swap

    # Лимит CPU
    docker run --cpus 1.5 nginx              # 1.5 ядра
    docker run --cpu-shares 512 nginx        # относительный вес (default 1024)
    docker run --cpu-period 100000 --cpu-quota 50000 nginx  # 50%
    docker run --cpuset-cpus 0,1 nginx       # только ядра 0 и 1

    # Лимит I/O
    docker run --device-read-bps /dev/sda:50mb nginx
    docker run --device-write-bps /dev/sda:20mb nginx
    docker run --device-read-iops /dev/sda:1000 nginx
    docker run --device-write-iops /dev/sda:500 nginx

    # Лимит PID
    docker run --pids-limit 100 nginx

    # Посмотреть текущие лимиты и потребление
    docker stats <container>
    docker stats --no-stream <container>

    # Обновить лимиты работающего контейнера
    docker update --memory 1g <container>
    docker update --cpus 2 <container>

    # Посмотреть лимиты в inspect
    docker inspect <container> | grep -A 30 '"HostConfig"'

### Kubernetes - resources и limits

    # pod.yaml
    spec:
      containers:
      - name: myapp
        image: myapp:latest
        resources:
          requests:            # сколько scheduler резервирует
            memory: "128Mi"
            cpu: "250m"        # 250 millicores = 0.25 ядра
          limits:              # максимум (cgroup лимит)
            memory: "512Mi"
            cpu: "1000m"       # 1 ядро

    # CPU:
    #   requests - cpu.weight (гарантированная доля)
    #   limits   - cpu.max (жёсткий лимит, throttling)

    # Memory:
    #   requests - используется scheduler
    #   limits   - memory.max (при превышении - OOM kill)

    # Посмотреть реальное потребление пода
    kubectl top pod <pod>
    kubectl top pod <pod> --containers

    # Посмотреть cgroup пода на ноде
    # /sys/fs/cgroup/kubepods/burstable/pod<uid>/<container_id>/

    # QoS классы Kubernetes:
    # Guaranteed:  requests == limits для всех контейнеров
    # Burstable:   requests < limits, или только limits заданы
    # BestEffort:  requests и limits не заданы вообще
    # При OOM: BestEffort убивается первым, Guaranteed - последним

---

## Мониторинг и диагностика

### Наблюдение за namespaces

    # Все namespaces системы
    lsns

    # Namespaces конкретного процесса
    ls -la /proc/<pid>/ns/

    # Сравнить namespaces двух процессов (одинаковые inode = один namespace)
    stat -L /proc/1/ns/net
    stat -L /proc/<container_pid>/ns/net

    # Войти в namespace для отладки
    nsenter -t <pid> -n -- ip addr show
    nsenter -t <pid> -n -- ss -tlnp
    nsenter -t <pid> -m -- ls /

### Наблюдение за cgroups

    # Дерево cgroups (systemd)
    systemd-cgls

    # Мониторинг в реальном времени
    systemd-cgtop

    # Прямое чтение cgroup файлов
    cat /sys/fs/cgroup/myapp/memory.current
    cat /sys/fs/cgroup/myapp/cpu.stat
    cat /sys/fs/cgroup/myapp/io.stat

    # Память всех Docker контейнеров
    for c in /sys/fs/cgroup/docker/*/memory.current; do
        container=$(basename $(dirname $c))
        mem=$(cat $c)
        echo "${container:0:12}: $(( mem / 1024 / 1024 )) MB"
    done

    # Найти cgroup процесса
    cat /proc/<pid>/cgroup

    # cgget (из cgroup-tools)
    cgget -g memory:myapp
    cgget -g cpu:myapp

    # cgexec - запустить процесс в cgroup
    cgexec -g memory:myapp /usr/bin/myprogram

    # Посмотреть OOM события
    dmesg | grep -i "oom\|killed"
    journalctl -k | grep -i oom

    # cgroup события через inotify (advanced)
    # memory.events обновляется при каждом OOM событии

---

## Практические примеры

### Защита системы от fork bomb

    # Создать cgroup с лимитом PID
    mkdir /sys/fs/cgroup/sandbox
    echo "+pids" > /sys/fs/cgroup/cgroup.subtree_control
    echo 50 > /sys/fs/cgroup/sandbox/pids.max
    echo $$ > /sys/fs/cgroup/sandbox/cgroup.procs
    # Теперь fork bomb не уничтожит систему
    :(){ :|:& };:   # попробует, упрётся в лимит 50

### Изолированная среда без Docker

    # Полностью изолированный процесс через namespaces
    unshare \
      --mount \
      --uts \
      --ipc \
      --net \
      --pid \
      --fork \
      --user \
      --map-root-user \
      --mount-proc \
      bash

    # Внутри: root, своя сеть (только lo), свои PID, свой hostname
    hostname isolated-env
    ip addr  # только lo

### Мониторинг памяти контейнера из хоста

    CONTAINER_ID=$(docker inspect --format '{{.Id}}' mycontainer)

    # cgroups v2
    CGROUP_PATH="/sys/fs/cgroup/system.slice/docker-${CONTAINER_ID}.scope"

    watch -n 1 "
      echo 'Memory:' $(cat $CGROUP_PATH/memory.current | numfmt --to=iec)
      echo 'Limit:' $(cat $CGROUP_PATH/memory.max | numfmt --to=iec)
      echo 'OOM events:' $(grep oom_kill $CGROUP_PATH/memory.events | awk '{print \$2}')
    "

### Ограничение ресурсов без Docker

    # systemd-run для запуска с ограничениями
    systemd-run \
      --scope \
      --property=MemoryMax=256M \
      --property=CPUQuota=50% \
      --property=TasksMax=50 \
      --property=PrivateTmp=yes \
      python3 heavy_script.py

---

## Шпаргалка

    Namespaces:
      lsns                           - список всех namespaces
      lsns -t <type>                 - фильтр по типу (pid, net, mnt, ...)
      ls -la /proc/<pid>/ns/         - namespaces процесса
      unshare --<type> cmd           - создать namespace и запустить cmd
      unshare --pid --fork --mount-proc bash  - изолированный bash
      nsenter -t <pid> -n cmd        - войти в net namespace процесса
      nsenter -t <pid> -m -n -p cmd  - войти в mnt+net+pid namespaces
      ip netns add <name>            - создать network namespace
      ip netns exec <name> cmd       - выполнить в network namespace

    cgroups v2 - управление:
      mkdir /sys/fs/cgroup/<name>                    - создать cgroup
      echo <pid> > /sys/fs/cgroup/<name>/cgroup.procs  - добавить процесс
      echo 512M > /sys/fs/cgroup/<name>/memory.max   - лимит памяти
      echo "50000 100000" > /sys/fs/cgroup/<name>/cpu.max  - лимит CPU 50%
      echo 100 > /sys/fs/cgroup/<name>/pids.max      - лимит PID
      cat /sys/fs/cgroup/<name>/memory.current       - текущая память
      cat /sys/fs/cgroup/<name>/cpu.stat             - статистика CPU
      rmdir /sys/fs/cgroup/<name>                    - удалить (должна быть пустой)

    systemd:
      systemd-cgls                   - дерево cgroups
      systemd-cgtop                  - мониторинг в реальном времени
      systemctl set-property svc MemoryMax=512M  - установить лимит
      systemd-run --scope -p MemoryMax=256M cmd  - запустить с лимитом

    Docker:
      docker run -m 512m --cpus 1.5 img    - лимиты памяти и CPU
      docker stats <container>              - мониторинг ресурсов
      docker update --memory 1g <container> - обновить лимит

    Kubernetes:
      resources.requests.memory: "128Mi"   - запрос (для scheduler)
      resources.limits.memory: "512Mi"     - лимит (cgroup)
      resources.limits.cpu: "1000m"        - 1 ядро
      kubectl top pod <pod>                - текущее потребление

    Диагностика:
      cat /proc/<pid>/cgroup         - cgroup процесса
      cat /proc/<pid>/ns/            - namespaces процесса
      dmesg | grep -i oom            - OOM события
      cat /sys/fs/cgroup/*/memory.events  - события cgroup

---

## Ссылки

- [man 7 namespaces](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [man 7 cgroups](https://man7.org/linux/man-pages/man7/cgroups.7.html)
- [man 1 unshare](https://man7.org/linux/man-pages/man1/unshare.1.html)
- [man 1 nsenter](https://man7.org/linux/man-pages/man1/nsenter.1.html)
- [Linux Kernel - cgroup v2 documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [Linux Kernel - namespaces documentation](https://www.kernel.org/doc/html/latest/userspace-api/unshare.html)
- [runc - OCI container runtime](https://github.com/opencontainers/runc)
- [Containers from Scratch (Liz Rice)](https://www.youtube.com/watch?v=8fi7uSYlOdc)
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [Kubernetes - Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [systemd cgroup management](https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html)
- [Understanding cgroups v2 (Red Hat)](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/8/html/managing_monitoring_and_updating_the_kernel/using-cgroups-v2-to-control-distribution-of-cpu-time-for-applications_managing-monitoring-and-updating-the-kernel)
