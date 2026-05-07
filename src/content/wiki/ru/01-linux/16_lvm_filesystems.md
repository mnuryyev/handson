---
title: "LVM, Разделы, Файловые системы (ext4, xfs)"
date: "2026-05-07"
---

Управление дисками в Linux состоит из трёх уровней: физические разделы (partition table), логические тома LVM (абстракция над физическими дисками), и файловые системы (ext4, xfs - как данные хранятся на томе).

Понимание всех трёх уровней необходимо для гибкого управления хранилищем: изменения размеров, снапшоты, объединение дисков, замена дисков без downtime.

---

## Разделы и таблицы разделов

Раздел (partition) - логическая область на физическом диске. Каждый диск имеет таблицу разделов (partition table) в начале, которая описывает разделы.

    Два стандарта таблиц разделов:
      MBR (Master Boot Record) - старый, ограничения: 4 первичных раздела,
        максимум 2TB на раздел. Хранится в первых 512 байт диска.
      GPT (GUID Partition Table) - современный, до 128 разделов,
        диски > 2TB, встроена защита от повреждений (CRC32).

    Схема диска:
      MBR:
        [MBR 512 байт: bootstrap code + partition table][Раздел 1][Раздел 2][Раздел 3]
        Максимум 4 первичных. Или 3 первичных + 1 расширенный (до 255 логических).

      GPT:
        [Protective MBR][GPT Header][128 записей разделов][Разделы...][GPT Backup]
        Backup GPT в конце диска - защита от повреждений.

    Инструменты управления разделами:
      fdisk   - классический, для MBR и GPT (текстовый интерфейс)
      gdisk   - только GPT (аналог fdisk для GPT)
      parted  - MBR и GPT, поддерживает скриптование
      cfdisk  - псевдографический интерфейс (удобнее fdisk)
      lsblk   - просмотр дисков и разделов

### Просмотр дисков

    # Показать все блочные устройства
    lsblk
    # NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
    # sda      8:0    0  100G  0 disk
    # ├─sda1   8:1    0    1G  0 part /boot
    # ├─sda2   8:2    0    2G  0 part [SWAP]
    # └─sda3   8:3    0   97G  0 part /

    lsblk -f    # показать файловые системы и UUID
    lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID

    # Показать все диски
    fdisk -l
    fdisk -l /dev/sda    # конкретный диск

    # Таблица разделов
    parted /dev/sda print

    # Информация об устройстве
    blkid                     # UUID и тип ФС всех разделов
    blkid /dev/sda1           # конкретный раздел

    # Использование дисков
    df -h                     # файловые системы и использование
    df -hT                    # + тип файловой системы
    du -sh /var/*             # размер директорий

### Работа с разделами (fdisk)

    # Создание разделов на /dev/sdb
    fdisk /dev/sdb

    # Команды внутри fdisk:
    # m - помощь
    # p - показать таблицу разделов
    # n - создать новый раздел
    # d - удалить раздел
    # t - изменить тип раздела
    # l - список типов разделов
    # w - записать изменения и выйти
    # q - выйти без сохранения
    # g - создать новую GPT таблицу
    # o - создать новую MBR таблицу

    # Пример: создать раздел на весь диск
    fdisk /dev/sdb
    > g       # создать GPT
    > n       # новый раздел
    > 1       # номер раздела
    > Enter   # первый сектор (по умолчанию)
    > Enter   # последний сектор (весь диск)
    > w       # записать

    # Создать раздел конкретного размера
    > n
    > 1
    > Enter
    > +50G    # 50 гигабайт
    > w

    # parted - скриптуемый вариант
    parted /dev/sdb mklabel gpt
    parted /dev/sdb mkpart primary 1MiB 100%
    parted /dev/sdb mkpart primary 1MiB 50GiB
    parted /dev/sdb print

    # Обновить ядро о новой таблице разделов (без перезагрузки)
    partprobe /dev/sdb
    # или
    blockdev --rereadpt /dev/sdb

### Типы разделов

    # Основные типы (GPT):
    # Linux filesystem  - 83 (MBR) / 0FC63DAF-... (GPT)
    # Linux swap        - 82 (MBR) / 0657FD6D-... (GPT)
    # Linux LVM         - 8e (MBR) / E6D6D379-... (GPT)
    # EFI System        - ef (MBR) / C12A7328-... (GPT)
    # Linux RAID        - fd (MBR) / A19D880F-... (GPT)

    # Установить тип раздела в fdisk
    > t      # изменить тип
    > 1      # номер раздела
    > 8e     # Linux LVM (MBR)
    # или
    > L      # посмотреть все типы (GPT GUID)

    # В parted
    parted /dev/sdb set 1 lvm on     # пометить как LVM
    parted /dev/sdb set 1 boot on    # пометить как загрузочный

---

## LVM - Logical Volume Manager

LVM - прослойка абстракции между физическими дисками и файловыми системами. Позволяет объединять несколько дисков в пулы, создавать тома произвольного размера, изменять размеры без перезагрузки, делать снапшоты.

    Три уровня LVM:
      PV (Physical Volume) - физический диск или раздел, добавленный в LVM.
      VG (Volume Group)    - группа PV, объединённых в пул хранилища.
      LV (Logical Volume)  - виртуальный раздел внутри VG, на котором создаётся ФС.

    Схема:
      Диск 1 (sdb) → PV /dev/sdb  ─┐
      Диск 2 (sdc) → PV /dev/sdc  ─┤→ VG "data_vg" → LV "data_lv" → ext4 → /data
      Раздел (sda3)→ PV /dev/sda3 ─┘                → LV "logs_lv" → xfs  → /logs

    Зачем LVM:
      Изменение размера тома онлайн (без размонтирования).
      Снапшоты (копия состояния тома в момент времени).
      Добавление дисков в VG без пересоздания разделов.
      Striping (RAID-0 поверх нескольких PV) для производительности.
      Mirroring (RAID-1) для отказоустойчивости.
      Thin provisioning (over-commit пространства).

### Physical Volume (PV)

    # Создать PV из диска (весь диск)
    pvcreate /dev/sdb
    pvcreate /dev/sdc

    # Создать PV из раздела
    pvcreate /dev/sdb1

    # Посмотреть PV
    pvs           # краткая информация
    pvdisplay     # подробная информация
    pvdisplay /dev/sdb

    # Пример вывода pvs:
    # PV         VG      Fmt  Attr PSize   PFree
    # /dev/sdb   data_vg lvm2 a--  100.00g 20.00g
    # /dev/sdc   data_vg lvm2 a--  200.00g 200.00g

    # Удалить PV (только если не используется VG)
    pvremove /dev/sdb

    # Переместить данные с PV на другие PV в VG
    pvmove /dev/sdb              # переместить всё
    pvmove /dev/sdb /dev/sdc    # переместить конкретно на sdc

    # Сканировать диски на наличие PV
    pvscan

### Volume Group (VG)

    # Создать VG из одного PV
    vgcreate data_vg /dev/sdb

    # Создать VG из нескольких PV
    vgcreate data_vg /dev/sdb /dev/sdc

    # Посмотреть VG
    vgs           # краткая информация
    vgdisplay     # подробная информация
    vgdisplay data_vg

    # Пример вывода vgs:
    # VG      #PV #LV #SN Attr   VSize   VFree
    # data_vg   2   2   0 wz--n- 299.99g 219.99g

    # Добавить PV в VG (расширить пул)
    vgextend data_vg /dev/sdd

    # Удалить PV из VG
    pvmove /dev/sdb              # сначала переместить данные
    vgreduce data_vg /dev/sdb   # затем убрать PV

    # Переименовать VG
    vgrename data_vg storage_vg

    # Удалить VG (только если нет LV)
    vgremove data_vg

    # Экспорт/импорт VG (перенос на другой сервер)
    vgexport data_vg             # подготовить к переносу
    # перенести диски
    vgimport data_vg             # импортировать на новом сервере
    vgchange -ay data_vg         # активировать

### Logical Volume (LV)

    # Создать LV конкретного размера
    lvcreate -L 50G -n data_lv data_vg
    # -L 50G     - размер 50 гигабайт
    # -n data_lv - имя тома
    # data_vg    - из какой VG

    # Создать LV используя % от VG
    lvcreate -l 100%FREE -n data_lv data_vg   # весь свободный размер
    lvcreate -l 50%VG    -n data_lv data_vg   # 50% от VG
    lvcreate -l 80%FREE  -n logs_lv data_vg   # 80% свободного

    # Посмотреть LV
    lvs           # краткая информация
    lvdisplay     # подробная информация
    lvdisplay /dev/data_vg/data_lv

    # Пример вывода lvs:
    # LV      VG      Attr       LSize  Pool Origin
    # data_lv data_vg -wi-ao---- 50.00g
    # logs_lv data_vg -wi-ao---- 30.00g

    # Путь к LV (два варианта, одно и то же):
    /dev/data_vg/data_lv
    /dev/mapper/data_vg-data_lv

    # Переименовать LV
    lvrename data_vg data_lv new_data_lv

    # Удалить LV
    lvremove /dev/data_vg/data_lv

    # Активировать/деактивировать LV
    lvchange -ay /dev/data_vg/data_lv    # активировать
    lvchange -an /dev/data_vg/data_lv    # деактивировать

### Изменение размера LV

    # УВЕЛИЧИТЬ LV (онлайн, без размонтирования)

    # Шаг 1: расширить LV на 20GB
    lvextend -L +20G /dev/data_vg/data_lv
    # или до конкретного размера
    lvextend -L 100G /dev/data_vg/data_lv
    # или на весь свободный в VG
    lvextend -l +100%FREE /dev/data_vg/data_lv

    # Шаг 2: расширить файловую систему
    resize2fs /dev/data_vg/data_lv          # ext4 (онлайн)
    xfs_growfs /mount/point                  # xfs (только смонтированная)

    # Всё одной командой (lvextend + resize ФС)
    lvextend -L +20G -r /dev/data_vg/data_lv
    # -r = --resizefs, автоматически расширяет ФС

    # УМЕНЬШИТЬ LV (только ext4, только размонтированная)
    # Уменьшение xfs НЕ поддерживается!

    # Шаг 1: размонтировать
    umount /data

    # Шаг 2: проверить ФС
    e2fsck -f /dev/data_vg/data_lv

    # Шаг 3: уменьшить ФС до нужного размера
    resize2fs /dev/data_vg/data_lv 40G

    # Шаг 4: уменьшить LV
    lvreduce -L 40G /dev/data_vg/data_lv

    # Шаг 5: смонтировать обратно
    mount /data

    # Или всё вместе (с подтверждением)
    lvreduce -L 40G -r /dev/data_vg/data_lv

### Снапшоты LVM

    Снапшот (snapshot) - мгновенная копия LV в момент создания.
    Работает через Copy-on-Write: при изменении оригинала, старые блоки
    копируются в снапшот. Снапшот хранит только изменения.

    # Создать снапшот
    lvcreate -L 5G -s -n data_snap /dev/data_vg/data_lv
    # -s = --snapshot
    # -L 5G = размер снапшота (сколько изменений он может хранить)
    # Имя: data_snap, источник: data_lv

    # Посмотреть снапшот
    lvs
    # LV        VG      Attr       LSize Origin  Snap%
    # data_lv   data_vg owi-ao---- 50.0g
    # data_snap data_vg swi-a-s--- 5.00g data_lv  12.50

    # Смонтировать снапшот (только для чтения или записи)
    mount -o ro /dev/data_vg/data_snap /mnt/snap

    # Восстановить LV из снапшота (merge)
    # ВНИМАНИЕ: оригинальный LV должен быть размонтирован
    umount /data
    lvconvert --merge /dev/data_vg/data_snap
    # После перезагрузки или активации VG снапшот применится и удалится

    # Резервная копия через снапшот
    lvcreate -L 5G -s -n backup_snap /dev/data_vg/data_lv
    mount -o ro /dev/data_vg/backup_snap /mnt/snap
    rsync -avz /mnt/snap/ /backup/data/
    umount /mnt/snap
    lvremove /dev/data_vg/backup_snap

    # Важно: если снапшот заполнится (Snap% = 100) - он становится невалидным.
    # Мониторить размер снапшота и делать достаточно большим.

    # Увеличить снапшот если заполняется
    lvextend -L +2G /dev/data_vg/data_snap

### Thin Provisioning

    Thin Provisioning - выделение пространства по факту записи, а не заранее.
    Несколько LV могут суммарно превышать размер VG (over-commit).

    # Создать thin pool
    lvcreate -L 100G --thinpool thin_pool data_vg

    # Создать thin LV (200GB в 100GB пуле - over-commit)
    lvcreate -V 50G --thin -n vm1_disk data_vg/thin_pool
    lvcreate -V 80G --thin -n vm2_disk data_vg/thin_pool
    lvcreate -V 70G --thin -n vm3_disk data_vg/thin_pool
    # Итого: 200GB выделено, реально в пуле 100GB

    # Посмотреть использование thin pool
    lvs -a data_vg

    # Снапшоты thin LV (мгновенные, не требуют доп. места заранее)
    lvcreate -s --name vm1_snap data_vg/vm1_disk

---

## Файловая система ext4

ext4 (Fourth Extended Filesystem) - стандартная файловая система Linux. Развитие ext3, обратно совместима. Журналирование, поддержка до 1 Exabyte томов.

    Характеристики ext4:
      Максимальный размер файла:  16 Tebibytes
      Максимальный размер тома:   1 Exabyte
      Максимальный размер имени:  255 байт
      Журналирование:             есть (metadata или data+metadata)
      Extents:                    да (снижает фрагментацию)
      Онлайн дефрагментация:      e4defrag
      Онлайн уменьшение:          нет (только resize2fs с umount)
      Онлайн увеличение:          да (resize2fs)

### Создание ext4

    # Создать ext4 на разделе
    mkfs.ext4 /dev/sdb1

    # Создать ext4 на LV
    mkfs.ext4 /dev/data_vg/data_lv

    # С параметрами
    mkfs.ext4 -L "mydata" /dev/sdb1
    # -L = метка тома (label)

    mkfs.ext4 -b 4096 /dev/sdb1
    # -b = размер блока (1024, 2048, 4096) - по умолчанию 4096

    mkfs.ext4 -m 1 /dev/sdb1
    # -m = % зарезервированного места для root (по умолчанию 5%)
    # Для дисков с данными (не root) можно снизить до 1%

    mkfs.ext4 -E lazy_itable_init=0 /dev/sdb1
    # Инициализировать inode таблицу сразу (медленнее форматирование,
    # но не будет фонового init после первого монтирования)

    mkfs.ext4 -i 8192 /dev/sdb1
    # -i bytes-per-inode: один inode на каждые 8192 байт
    # Уменьшить если много мелких файлов, увеличить если крупные файлы

    # Просмотр параметров ФС
    tune2fs -l /dev/sdb1
    dumpe2fs /dev/sdb1 | head -50

### Журналирование ext4

    ext4 поддерживает три режима журналирования:

    journal (самый безопасный):
      Журналируются и данные, и метаданные.
      Максимальная защита от потери данных при сбое.
      Самый медленный - каждая запись идёт сначала в журнал, потом на диск.
      mount -o data=journal /dev/sdb1 /data

    ordered (по умолчанию):
      Журналируются только метаданные.
      Данные записываются на диск перед метаданными (гарантия консистентности).
      Хороший баланс безопасность/производительность.
      mount -o data=ordered /dev/sdb1 /data

    writeback (быстрый, небезопасный):
      Журналируются только метаданные.
      Данные могут записаться после метаданных (риск потери при сбое).
      Самый быстрый режим.
      mount -o data=writeback /dev/sdb1 /data

    # Изменить режим журналирования
    tune2fs -o journal_data /dev/sdb1          # journal
    tune2fs -o journal_data_ordered /dev/sdb1  # ordered
    tune2fs -o journal_data_writeback /dev/sdb1 # writeback

### Настройка ext4 (tune2fs)

    # Изменить метку тома
    tune2fs -L "newlabel" /dev/sdb1
    e2label /dev/sdb1 "newlabel"

    # Изменить % зарезервированного места
    tune2fs -m 1 /dev/sdb1    # 1% вместо 5%

    # Изменить интервал проверки (fsck)
    tune2fs -i 0 /dev/sdb1    # отключить проверку по интервалу
    tune2fs -c 0 /dev/sdb1    # отключить проверку по числу монтирований

    # Включить/отключить функции
    tune2fs -O extents /dev/sdb1      # включить extents
    tune2fs -O ^has_journal /dev/sdb1 # отключить журнал (^= отключить)
    tune2fs -O dir_index /dev/sdb1    # включить htree индексы директорий

    # Просмотр и изменение UUID
    tune2fs -l /dev/sdb1 | grep UUID
    tune2fs -U random /dev/sdb1    # новый случайный UUID
    tune2fs -U clear  /dev/sdb1   # убрать UUID

### Проверка и восстановление ext4 (fsck/e2fsck)

    # Проверить ФС (должна быть размонтирована или read-only)
    e2fsck /dev/sdb1
    e2fsck -f /dev/sdb1     # принудительная проверка
    e2fsck -n /dev/sdb1     # только чтение (не исправлять)
    e2fsck -y /dev/sdb1     # автоматически отвечать yes на все вопросы

    # Проверить при загрузке системы
    touch /forcefsck         # создать файл → fsck при следующей загрузке
    shutdown -rF now         # -F = force fsck при перезагрузке

    # Информация о ФС
    dumpe2fs /dev/sdb1
    dumpe2fs -h /dev/sdb1   # только суперблок

    # Восстановление суперблока
    # Суперблок повреждён → найти резервную копию
    dumpe2fs /dev/sdb1 | grep "Backup superblock"
    mke2fs -n /dev/sdb1     # показать где будут резервные суперблоки
    e2fsck -b 32768 /dev/sdb1   # использовать резервный суперблок

### Монтирование ext4

    # Монтировать
    mount /dev/sdb1 /data
    mount -t ext4 /dev/sdb1 /data

    # Полезные опции монтирования
    mount -o noatime /dev/sdb1 /data
    # noatime: не обновлять время доступа при чтении (ускоряет I/O)

    mount -o relatime /dev/sdb1 /data
    # relatime: обновлять atime только если atime < mtime (компромисс)

    mount -o nodiratime /dev/sdb1 /data
    # не обновлять atime для директорий

    mount -o ro /dev/sdb1 /data
    # только для чтения

    mount -o errors=remount-ro /dev/sdb1 /data
    # при ошибке - перемонтировать в read-only

    mount -o discard /dev/sdb1 /data
    # TRIM для SSD (или использовать fstrim)

    # /etc/fstab запись
    # device           mountpoint  type  options        dump  pass
    /dev/sdb1          /data       ext4  defaults        0     2
    UUID=abc123...     /data       ext4  defaults,noatime 0    2
    /dev/data_vg/data_lv  /data   ext4  defaults        0     2

    # Смонтировать всё из fstab
    mount -a

    # Перемонтировать с новыми опциями (без размонтирования)
    mount -o remount,rw /data

    # Размонтировать
    umount /data
    umount -l /data    # lazy umount (отсоединить сразу, освободить когда не занят)

---

## Файловая система XFS

XFS - высокопроизводительная журналируемая ФС, разработана SGI в 1993 году. Стандартная ФС в RHEL/CentOS 7+. Оптимизирована для больших файлов и параллельного I/O.

    Характеристики XFS:
      Максимальный размер файла:  8 Exibytes
      Максимальный размер тома:   8 Exibytes
      Журналирование:             только метаданные (нет режима data journal)
      Онлайн дефрагментация:      xfs_fsr
      Онлайн увеличение:          xfs_growfs (только смонтированная)
      Онлайн уменьшение:          НЕ поддерживается
      Заморозка:                  xfs_freeze (для консистентных снапшотов)
      Allocation Groups (AG):     параллелизм I/O

    ext4 vs XFS:
      XFS быстрее на крупных файлах и больших объёмах.
      ext4 лучше на множестве мелких файлов.
      XFS нельзя уменьшить, ext4 можно.
      XFS стандарт для RHEL, ext4 стандарт для Debian/Ubuntu.

### Создание XFS

    # Создать XFS на разделе
    mkfs.xfs /dev/sdb1

    # Создать XFS на LV
    mkfs.xfs /dev/data_vg/data_lv

    # С параметрами
    mkfs.xfs -L "mydata" /dev/sdb1
    # -L = метка тома

    mkfs.xfs -b size=4096 /dev/sdb1
    # размер блока (512, 1024, 2048, 4096)

    mkfs.xfs -f /dev/sdb1
    # -f = force (перезаписать существующую ФС)

    mkfs.xfs -m crc=1 /dev/sdb1
    # CRC32 защита метаданных (включено по умолчанию в modern XFS)

    # Allocation Groups - параллелизм
    mkfs.xfs -d agcount=8 /dev/sdb1
    # agcount=8: 8 групп выделения (лучше параллелизм на многоядерных системах)
    # По умолчанию: одна AG на 4GB, минимум 4

    # Просмотр параметров XFS
    xfs_info /dev/sdb1
    xfs_info /data       # или по точке монтирования

### Настройка и обслуживание XFS

    # Изменить метку тома
    xfs_admin -L "newlabel" /dev/sdb1    # ФС должна быть размонтирована
    # или онлайн:
    xfs_admin -L "newlabel" /data        # по точке монтирования

    # Просмотр и изменение UUID
    xfs_admin -lu /dev/sdb1              # показать label и UUID
    xfs_admin -U generate /dev/sdb1      # новый UUID

    # Заморозить ФС (для консистентного снапшота)
    xfs_freeze -f /data      # заморозить (I/O блокируется)
    # делаем снапшот...
    xfs_freeze -u /data      # разморозить

    # Дефрагментация (онлайн)
    xfs_fsr /data            # дефрагментировать смонтированную ФС
    xfs_fsr -v /data         # с подробным выводом

    # Проверить фрагментацию
    xfs_db -r -c frag /dev/sdb1

    # Квоты XFS
    # Монтировать с поддержкой квот
    mount -o uquota,gquota /dev/sdb1 /data
    # uquota = user quota, gquota = group quota

    # Установить квоту для пользователя
    xfs_quota -x -c 'limit -u bsoft=1g bhard=2g user1' /data
    # bsoft=1g: мягкий лимит 1GB, bhard=2g: жёсткий 2GB

    # Показать квоты
    xfs_quota -c 'report -u' /data

### Проверка и восстановление XFS (xfs_repair)

    # xfs_repair - более мощный чем fsck.xfs
    # ФС должна быть размонтирована
    xfs_repair /dev/sdb1

    # Только проверка (не исправлять)
    xfs_repair -n /dev/sdb1

    # С подробным выводом
    xfs_repair -v /dev/sdb1

    # Если журнал повреждён и xfs_repair не может смонтировать
    xfs_repair -L /dev/sdb1    # сбросить журнал (потеря последних транзакций)

    # Диагностика
    xfs_db /dev/sdb1           # интерактивный отладчик
    xfs_db -r -c "version" /dev/sdb1    # версия ФС

    # Бэкап и восстановление через xfsdump/xfsrestore
    apt install xfsdump    # Debian/Ubuntu
    dnf install xfsdump    # Fedora/RHEL

    # Бэкап уровня 0 (полный)
    xfsdump -l 0 -f /backup/data.dump /data

    # Восстановить
    xfsrestore -f /backup/data.dump /restore_point

    # Бэкап уровня 1 (инкрементальный от уровня 0)
    xfsdump -l 1 -f /backup/data_inc.dump /data

### Монтирование XFS

    # Монтировать
    mount /dev/sdb1 /data
    mount -t xfs /dev/sdb1 /data

    # Полезные опции XFS
    mount -o noatime /dev/sdb1 /data
    # noatime: не обновлять atime (рекомендуется для XFS)

    mount -o logbufs=8 /dev/sdb1 /data
    # количество буферов журнала (2-8, больше = быстрее журналирование)

    mount -o logbsize=256k /dev/sdb1 /data
    # размер буфера журнала (32k-256k)

    mount -o allocsize=64m /dev/sdb1 /data
    # размер предвыделения при записи (для крупных файлов)

    mount -o discard /dev/sdb1 /data
    # TRIM для SSD

    # /etc/fstab
    UUID=abc123...  /data  xfs  defaults,noatime  0  2

---

## SWAP

SWAP (раздел подкачки) - дисковое пространство используемое ядром когда не хватает RAM.

    # Создать swap раздел
    mkswap /dev/sdb2
    swapon /dev/sdb2          # включить
    swapoff /dev/sdb2         # выключить

    # Создать swap файл
    fallocate -l 4G /swapfile
    # или: dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Посмотреть swap
    swapon --show
    free -h
    cat /proc/swaps

    # /etc/fstab для автозапуска
    /dev/sdb2  none  swap  sw  0  0
    /swapfile  none  swap  sw  0  0

    # Swappiness (0-100): насколько агрессивно использовать swap
    cat /proc/sys/vm/swappiness   # текущее значение (обычно 60)
    sysctl vm.swappiness=10       # уменьшить (рекомендуется для серверов)
    echo 'vm.swappiness=10' >> /etc/sysctl.conf   # постоянно

    # LVM swap (при необходимости изменить размер)
    lvcreate -L 4G -n swap_lv data_vg
    mkswap /dev/data_vg/swap_lv
    swapon /dev/data_vg/swap_lv

---

## fstab и автомонтирование

    # Формат /etc/fstab:
    # <device>  <mountpoint>  <type>  <options>  <dump>  <pass>
    #
    # dump: 0 = не бэкапить, 1 = бэкапить (устарело)
    # pass: 0 = не проверять, 1 = root (первый), 2 = остальные

    # Примеры записей
    /dev/sda1                   /boot  ext4  defaults        0  2
    UUID=abc123-def456          /      ext4  defaults,noatime 0  1
    /dev/data_vg/data_lv        /data  xfs   defaults,noatime 0  2
    UUID=xyz789                 /data  xfs   defaults        0  2
    /swapfile                   none   swap  sw              0  0
    tmpfs                       /tmp   tmpfs defaults,size=2G 0  0

    # Найти UUID устройства
    blkid /dev/sdb1
    ls -la /dev/disk/by-uuid/

    # Проверить fstab без перезагрузки
    mount -a                 # смонтировать всё из fstab
    findmnt --verify         # проверить корректность fstab

    # Опции монтирования
    defaults    = rw,suid,dev,exec,auto,nouser,async
    noatime     - не обновлять время доступа (ускоряет I/O)
    nodiratime  - не обновлять время доступа для директорий
    ro          - только чтение
    rw          - чтение и запись (по умолчанию)
    noexec      - запретить выполнение файлов (безопасность для /tmp)
    nosuid      - запретить setuid биты
    nodev       - запретить специальные файлы устройств
    nofail      - не ошибаться при загрузке если устройство отсутствует
    _netdev     - устройство в сети, ждать сети перед монтированием
    x-systemd.automount - automount через systemd (монтировать при первом обращении)

---

## Шпаргалка

    Разделы:
      lsblk -f             - все диски с ФС и UUID
      fdisk /dev/sdb       - управление разделами (интерактивно)
      parted /dev/sdb print - таблица разделов
      blkid                - UUID всех устройств
      partprobe /dev/sdb   - обновить ядро о новых разделах

    LVM - PV:
      pvcreate /dev/sdb    - создать PV
      pvs                  - список PV
      pvdisplay            - подробно
      pvmove /dev/sdb      - переместить данные с PV

    LVM - VG:
      vgcreate vg1 /dev/sdb /dev/sdc   - создать VG
      vgs                               - список VG
      vgextend vg1 /dev/sdd             - добавить PV в VG
      vgreduce vg1 /dev/sdb             - убрать PV из VG

    LVM - LV:
      lvcreate -L 50G -n lv1 vg1        - создать LV 50GB
      lvcreate -l 100%FREE -n lv1 vg1   - создать LV на весь свободный
      lvs                                - список LV
      lvextend -L +20G -r /dev/vg1/lv1  - расширить LV + ФС
      lvreduce -L 40G -r /dev/vg1/lv1   - уменьшить LV + ФС (только ext4)
      lvcreate -L 5G -s -n snap /dev/vg1/lv1  - снапшот

    ext4:
      mkfs.ext4 -L "label" /dev/sdb1    - создать
      tune2fs -l /dev/sdb1              - параметры ФС
      tune2fs -m 1 /dev/sdb1            - зарезервировано 1%
      e2fsck -f /dev/sdb1               - проверка (размонтировать)
      resize2fs /dev/sdb1 50G           - изменить размер ФС

    xfs:
      mkfs.xfs -L "label" /dev/sdb1     - создать
      xfs_info /data                    - параметры ФС
      xfs_repair /dev/sdb1              - проверка (размонтировать)
      xfs_growfs /data                  - расширить ФС (только увеличить)
      xfs_freeze -f /data               - заморозить для снапшота
      xfs_freeze -u /data               - разморозить

    Монтирование:
      mount -o noatime /dev/sdb1 /data  - монтировать с noatime
      mount -o remount,rw /data         - перемонтировать rw
      umount /data                      - размонтировать
      df -hT                            - использование + тип ФС
      findmnt                           - дерево монтирования

    Типичные сценарии:
      Добавить диск в LVM:
        pvcreate /dev/sdb → vgextend vg1 /dev/sdb → lvextend → resize ФС

      Расширить LV онлайн (ext4):
        lvextend -L +20G -r /dev/vg1/lv1

      Расширить LV онлайн (xfs):
        lvextend -L +20G /dev/vg1/lv1 && xfs_growfs /data

      Создать снапшот для бэкапа:
        lvcreate -L 5G -s -n snap /dev/vg1/lv1
        mount -o ro /dev/vg1/snap /mnt/snap
        rsync -avz /mnt/snap/ /backup/
        umount /mnt/snap && lvremove /dev/vg1/snap

---

## Ссылки

- [LVM2 HOWTO](https://tldp.org/HOWTO/LVM-HOWTO/) - подробное руководство по LVM
- [ext4 Wiki](https://ext4.wiki.kernel.org/) - вики ядра по ext4
- [XFS FAQ](https://xfs.wiki.kernel.org/) - официальная документация XFS
- [man lvm](https://linux.die.net/man/8/lvm) - man страница LVM
- [man mkfs.ext4](https://linux.die.net/man/8/mkfs.ext4) - опции форматирования ext4
- [man xfs](https://linux.die.net/man/5/xfs) - документация XFS
- [Red Hat Storage Guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/managing_storage_devices/) - управление хранилищем RHEL
- [Arch Wiki LVM](https://wiki.archlinux.org/title/LVM) - практическое руководство Arch Linux
