---
title: "LVM, Partitions, Filesystems (ext4, xfs)"
date: "2026-05-07"
---

Disk management in Linux consists of three layers: physical partitions (partition table), LVM logical volumes (abstraction over physical disks), and filesystems (ext4, xfs - how data is stored on a volume).

Understanding all three layers is required for flexible storage management: resizing, snapshots, combining disks, replacing disks without downtime.

---

## Partitions and Partition Tables

A partition is a logical region on a physical disk. Each disk has a partition table at the beginning describing its partitions.

    Two partition table standards:
      MBR (Master Boot Record) - legacy, limitations: 4 primary partitions,
        max 2TB per partition. Stored in the first 512 bytes of the disk.
      GPT (GUID Partition Table) - modern, up to 128 partitions,
        disks > 2TB, built-in corruption protection (CRC32).

    Disk layout:
      MBR:
        [MBR 512 bytes: bootstrap code + partition table][Part 1][Part 2][Part 3]
        Max 4 primary. Or 3 primary + 1 extended (up to 255 logical).

      GPT:
        [Protective MBR][GPT Header][128 partition entries][Partitions...][GPT Backup]
        Backup GPT at end of disk - protection against corruption.

    Partition management tools:
      fdisk   - classic, MBR and GPT (text interface)
      gdisk   - GPT only (fdisk equivalent for GPT)
      parted  - MBR and GPT, supports scripting
      cfdisk  - pseudo-graphical interface (more user-friendly)
      lsblk   - view disks and partitions

### Viewing Disks

    # Show all block devices
    lsblk
    # NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
    # sda      8:0    0  100G  0 disk
    # ├─sda1   8:1    0    1G  0 part /boot
    # ├─sda2   8:2    0    2G  0 part [SWAP]
    # └─sda3   8:3    0   97G  0 part /

    lsblk -f    # show filesystems and UUIDs
    lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID

    # Show all disks
    fdisk -l
    fdisk -l /dev/sda    # specific disk

    # Partition table
    parted /dev/sda print

    # Device information
    blkid                     # UUID and FS type for all partitions
    blkid /dev/sda1           # specific partition

    # Disk usage
    df -h                     # filesystems and usage
    df -hT                    # + filesystem type
    du -sh /var/*             # directory sizes

### Working with Partitions (fdisk)

    # Create partitions on /dev/sdb
    fdisk /dev/sdb

    # fdisk commands:
    # m - help
    # p - print partition table
    # n - new partition
    # d - delete partition
    # t - change partition type
    # l - list partition types
    # w - write changes and exit
    # q - quit without saving
    # g - create new GPT table
    # o - create new MBR table

    # Example: create a partition using entire disk
    fdisk /dev/sdb
    > g       # create GPT
    > n       # new partition
    > 1       # partition number
    > Enter   # first sector (default)
    > Enter   # last sector (whole disk)
    > w       # write

    # Create a partition of specific size
    > n
    > 1
    > Enter
    > +50G    # 50 gigabytes
    > w

    # parted - scriptable alternative
    parted /dev/sdb mklabel gpt
    parted /dev/sdb mkpart primary 1MiB 100%
    parted /dev/sdb mkpart primary 1MiB 50GiB
    parted /dev/sdb print

    # Inform kernel about new partition table (without rebooting)
    partprobe /dev/sdb
    # or
    blockdev --rereadpt /dev/sdb

### Partition Types

    # Common types (GPT):
    # Linux filesystem  - 83 (MBR) / 0FC63DAF-... (GPT)
    # Linux swap        - 82 (MBR) / 0657FD6D-... (GPT)
    # Linux LVM         - 8e (MBR) / E6D6D379-... (GPT)
    # EFI System        - ef (MBR) / C12A7328-... (GPT)
    # Linux RAID        - fd (MBR) / A19D880F-... (GPT)

    # Set partition type in fdisk
    > t      # change type
    > 1      # partition number
    > 8e     # Linux LVM (MBR)
    # or
    > L      # list all types (GPT GUIDs)

    # In parted
    parted /dev/sdb set 1 lvm on     # mark as LVM
    parted /dev/sdb set 1 boot on    # mark as bootable

---

## LVM - Logical Volume Manager

LVM is an abstraction layer between physical disks and filesystems. It allows combining multiple disks into pools, creating volumes of arbitrary size, resizing without rebooting, and taking snapshots.

    Three LVM layers:
      PV (Physical Volume) - a physical disk or partition added to LVM.
      VG (Volume Group)    - a group of PVs pooled into storage.
      LV (Logical Volume)  - a virtual partition inside a VG, where a FS is created.

    Layout:
      Disk 1 (sdb) → PV /dev/sdb  ─┐
      Disk 2 (sdc) → PV /dev/sdc  ─┤→ VG "data_vg" → LV "data_lv" → ext4 → /data
      Partition    → PV /dev/sda3 ─┘                → LV "logs_lv" → xfs  → /logs

    Why LVM:
      Online volume resizing (without unmounting).
      Snapshots (point-in-time copy of a volume's state).
      Add disks to a VG without recreating partitions.
      Striping (RAID-0 across multiple PVs) for performance.
      Mirroring (RAID-1) for redundancy.
      Thin provisioning (over-commit storage space).

### Physical Volume (PV)

    # Create PV from a whole disk
    pvcreate /dev/sdb
    pvcreate /dev/sdc

    # Create PV from a partition
    pvcreate /dev/sdb1

    # View PVs
    pvs           # brief info
    pvdisplay     # detailed info
    pvdisplay /dev/sdb

    # Example pvs output:
    # PV         VG      Fmt  Attr PSize   PFree
    # /dev/sdb   data_vg lvm2 a--  100.00g 20.00g
    # /dev/sdc   data_vg lvm2 a--  200.00g 200.00g

    # Remove PV (only if not used by any VG)
    pvremove /dev/sdb

    # Move data off a PV to other PVs in the VG
    pvmove /dev/sdb              # move all data
    pvmove /dev/sdb /dev/sdc    # move specifically to sdc

    # Scan disks for PVs
    pvscan

### Volume Group (VG)

    # Create VG from one PV
    vgcreate data_vg /dev/sdb

    # Create VG from multiple PVs
    vgcreate data_vg /dev/sdb /dev/sdc

    # View VGs
    vgs           # brief info
    vgdisplay     # detailed info
    vgdisplay data_vg

    # Example vgs output:
    # VG      #PV #LV #SN Attr   VSize   VFree
    # data_vg   2   2   0 wz--n- 299.99g 219.99g

    # Add PV to VG (expand the pool)
    vgextend data_vg /dev/sdd

    # Remove PV from VG
    pvmove /dev/sdb              # move data off first
    vgreduce data_vg /dev/sdb   # then remove PV

    # Rename VG
    vgrename data_vg storage_vg

    # Remove VG (only if no LVs exist)
    vgremove data_vg

    # Export/import VG (move to another server)
    vgexport data_vg             # prepare for transfer
    # move the disks
    vgimport data_vg             # import on new server
    vgchange -ay data_vg         # activate

### Logical Volume (LV)

    # Create LV of specific size
    lvcreate -L 50G -n data_lv data_vg
    # -L 50G     - 50 gigabytes
    # -n data_lv - volume name
    # data_vg    - which VG to use

    # Create LV using % of VG
    lvcreate -l 100%FREE -n data_lv data_vg   # all free space
    lvcreate -l 50%VG    -n data_lv data_vg   # 50% of VG total
    lvcreate -l 80%FREE  -n logs_lv data_vg   # 80% of free space

    # View LVs
    lvs           # brief info
    lvdisplay     # detailed info
    lvdisplay /dev/data_vg/data_lv

    # Example lvs output:
    # LV      VG      Attr       LSize  Pool Origin
    # data_lv data_vg -wi-ao---- 50.00g
    # logs_lv data_vg -wi-ao---- 30.00g

    # LV path (two equivalent forms):
    /dev/data_vg/data_lv
    /dev/mapper/data_vg-data_lv

    # Rename LV
    lvrename data_vg data_lv new_data_lv

    # Remove LV
    lvremove /dev/data_vg/data_lv

    # Activate/deactivate LV
    lvchange -ay /dev/data_vg/data_lv    # activate
    lvchange -an /dev/data_vg/data_lv    # deactivate

### Resizing LVs

    # GROW LV (online, without unmounting)

    # Step 1: extend LV by 20GB
    lvextend -L +20G /dev/data_vg/data_lv
    # or to a specific size
    lvextend -L 100G /dev/data_vg/data_lv
    # or use all free space in VG
    lvextend -l +100%FREE /dev/data_vg/data_lv

    # Step 2: grow the filesystem
    resize2fs /dev/data_vg/data_lv          # ext4 (online)
    xfs_growfs /mount/point                  # xfs (must be mounted)

    # Both steps in one command (lvextend + resize FS)
    lvextend -L +20G -r /dev/data_vg/data_lv
    # -r = --resizefs, automatically resizes the FS

    # SHRINK LV (ext4 only, must be unmounted)
    # Shrinking xfs is NOT supported!

    # Step 1: unmount
    umount /data

    # Step 2: check filesystem
    e2fsck -f /dev/data_vg/data_lv

    # Step 3: shrink filesystem to target size
    resize2fs /dev/data_vg/data_lv 40G

    # Step 4: shrink LV
    lvreduce -L 40G /dev/data_vg/data_lv

    # Step 5: remount
    mount /data

    # Or all at once (with confirmation)
    lvreduce -L 40G -r /dev/data_vg/data_lv

### LVM Snapshots

    A snapshot is an instant copy of an LV at the moment of creation.
    Works via Copy-on-Write: when the original changes, old blocks are
    copied to the snapshot. The snapshot stores only the changes (deltas).

    # Create a snapshot
    lvcreate -L 5G -s -n data_snap /dev/data_vg/data_lv
    # -s = --snapshot
    # -L 5G = snapshot size (how many changes it can hold)
    # name: data_snap, source: data_lv

    # View snapshot
    lvs
    # LV        VG      Attr       LSize Origin  Snap%
    # data_lv   data_vg owi-ao---- 50.0g
    # data_snap data_vg swi-a-s--- 5.00g data_lv  12.50

    # Mount snapshot (read-only or read-write)
    mount -o ro /dev/data_vg/data_snap /mnt/snap

    # Restore LV from snapshot (merge)
    # WARNING: original LV must be unmounted
    umount /data
    lvconvert --merge /dev/data_vg/data_snap
    # After reboot or VG reactivation, snapshot is applied and removed

    # Backup via snapshot
    lvcreate -L 5G -s -n backup_snap /dev/data_vg/data_lv
    mount -o ro /dev/data_vg/backup_snap /mnt/snap
    rsync -avz /mnt/snap/ /backup/data/
    umount /mnt/snap
    lvremove /dev/data_vg/backup_snap

    # Important: if snapshot fills up (Snap% = 100) it becomes invalid.
    # Monitor snapshot usage and make it large enough.

    # Grow snapshot if filling up
    lvextend -L +2G /dev/data_vg/data_snap

### Thin Provisioning

    Thin Provisioning - allocate space on actual write, not upfront.
    Multiple LVs can together exceed the VG size (over-commit).

    # Create thin pool
    lvcreate -L 100G --thinpool thin_pool data_vg

    # Create thin LVs (200GB total in a 100GB pool - over-committed)
    lvcreate -V 50G --thin -n vm1_disk data_vg/thin_pool
    lvcreate -V 80G --thin -n vm2_disk data_vg/thin_pool
    lvcreate -V 70G --thin -n vm3_disk data_vg/thin_pool
    # Total: 200GB allocated, only 100GB physically in pool

    # View thin pool usage
    lvs -a data_vg

    # Snapshots of thin LVs (instant, no space needed upfront)
    lvcreate -s --name vm1_snap data_vg/vm1_disk

---

## ext4 Filesystem

ext4 (Fourth Extended Filesystem) - the standard Linux filesystem. Evolution of ext3, backward compatible. Journaling, supports up to 1 Exabyte volumes.

    ext4 characteristics:
      Max file size:    16 Tebibytes
      Max volume size:  1 Exabyte
      Max filename:     255 bytes
      Journaling:       yes (metadata or data+metadata)
      Extents:          yes (reduces fragmentation)
      Online defrag:    e4defrag
      Online shrink:    no (requires umount + resize2fs)
      Online grow:      yes (resize2fs)

### Creating ext4

    # Create ext4 on a partition
    mkfs.ext4 /dev/sdb1

    # Create ext4 on an LV
    mkfs.ext4 /dev/data_vg/data_lv

    # With options
    mkfs.ext4 -L "mydata" /dev/sdb1
    # -L = volume label

    mkfs.ext4 -b 4096 /dev/sdb1
    # -b = block size (1024, 2048, 4096) - default is 4096

    mkfs.ext4 -m 1 /dev/sdb1
    # -m = % of space reserved for root (default 5%)
    # For data disks (not root) can be reduced to 1%

    mkfs.ext4 -E lazy_itable_init=0 /dev/sdb1
    # Initialize inode table immediately (slower format,
    # but no background init after first mount)

    mkfs.ext4 -i 8192 /dev/sdb1
    # -i bytes-per-inode: one inode per 8192 bytes
    # Decrease for many small files, increase for large files

    # View filesystem parameters
    tune2fs -l /dev/sdb1
    dumpe2fs /dev/sdb1 | head -50

### ext4 Journaling Modes

    ext4 supports three journaling modes:

    journal (safest):
      Both data and metadata are journaled.
      Maximum protection against data loss on crash.
      Slowest - every write goes to journal first, then disk.
      mount -o data=journal /dev/sdb1 /data

    ordered (default):
      Only metadata is journaled.
      Data is written to disk before metadata (consistency guarantee).
      Good balance between safety and performance.
      mount -o data=ordered /dev/sdb1 /data

    writeback (fast, less safe):
      Only metadata is journaled.
      Data may be written after metadata (risk of corruption on crash).
      Fastest mode.
      mount -o data=writeback /dev/sdb1 /data

    # Change journaling mode
    tune2fs -o journal_data /dev/sdb1           # journal
    tune2fs -o journal_data_ordered /dev/sdb1   # ordered
    tune2fs -o journal_data_writeback /dev/sdb1 # writeback

### Tuning ext4 (tune2fs)

    # Change volume label
    tune2fs -L "newlabel" /dev/sdb1
    e2label /dev/sdb1 "newlabel"

    # Change reserved space percentage
    tune2fs -m 1 /dev/sdb1    # 1% instead of 5%

    # Change fsck check interval
    tune2fs -i 0 /dev/sdb1    # disable time-based check
    tune2fs -c 0 /dev/sdb1    # disable mount-count-based check

    # Enable/disable features
    tune2fs -O extents /dev/sdb1      # enable extents
    tune2fs -O ^has_journal /dev/sdb1 # disable journal (^= disable)
    tune2fs -O dir_index /dev/sdb1    # enable htree directory indexes

    # View and change UUID
    tune2fs -l /dev/sdb1 | grep UUID
    tune2fs -U random /dev/sdb1    # new random UUID
    tune2fs -U clear  /dev/sdb1   # clear UUID

### Checking and Repairing ext4 (e2fsck)

    # Check filesystem (must be unmounted or read-only)
    e2fsck /dev/sdb1
    e2fsck -f /dev/sdb1     # force check
    e2fsck -n /dev/sdb1     # read-only (do not repair)
    e2fsck -y /dev/sdb1     # automatically answer yes to all questions

    # Force fsck at boot
    touch /forcefsck         # create file → fsck on next boot
    shutdown -rF now         # -F = force fsck on reboot

    # Filesystem information
    dumpe2fs /dev/sdb1
    dumpe2fs -h /dev/sdb1   # superblock only

    # Superblock recovery
    # Superblock corrupted - find backup copy
    dumpe2fs /dev/sdb1 | grep "Backup superblock"
    mke2fs -n /dev/sdb1     # show where backup superblocks would be
    e2fsck -b 32768 /dev/sdb1   # use backup superblock

### Mounting ext4

    # Mount
    mount /dev/sdb1 /data
    mount -t ext4 /dev/sdb1 /data

    # Useful mount options
    mount -o noatime /dev/sdb1 /data
    # noatime: do not update access time on reads (speeds up I/O)

    mount -o relatime /dev/sdb1 /data
    # relatime: update atime only if atime < mtime (compromise)

    mount -o nodiratime /dev/sdb1 /data
    # do not update atime for directories

    mount -o ro /dev/sdb1 /data
    # read-only

    mount -o errors=remount-ro /dev/sdb1 /data
    # on error - remount as read-only

    mount -o discard /dev/sdb1 /data
    # TRIM for SSD (or use fstrim)

    # /etc/fstab entry
    # device           mountpoint  type  options         dump  pass
    /dev/sdb1          /data       ext4  defaults         0     2
    UUID=abc123...     /data       ext4  defaults,noatime 0     2
    /dev/data_vg/data_lv  /data   ext4  defaults         0     2

    # Mount everything from fstab
    mount -a

    # Remount with new options (without unmounting)
    mount -o remount,rw /data

    # Unmount
    umount /data
    umount -l /data    # lazy umount (detach now, release when idle)

---

## XFS Filesystem

XFS - a high-performance journaling filesystem developed by SGI in 1993. Default filesystem in RHEL/CentOS 7+. Optimized for large files and parallel I/O.

    XFS characteristics:
      Max file size:    8 Exibytes
      Max volume size:  8 Exibytes
      Journaling:       metadata only (no data journal mode)
      Online defrag:    xfs_fsr
      Online grow:      xfs_growfs (must be mounted)
      Online shrink:    NOT supported
      Freeze:           xfs_freeze (for consistent snapshots)
      Allocation Groups (AG): parallel I/O

    ext4 vs XFS:
      XFS is faster for large files and large volumes.
      ext4 is better for large numbers of small files.
      XFS cannot be shrunk, ext4 can.
      XFS is the default for RHEL, ext4 for Debian/Ubuntu.

### Creating XFS

    # Create XFS on a partition
    mkfs.xfs /dev/sdb1

    # Create XFS on an LV
    mkfs.xfs /dev/data_vg/data_lv

    # With options
    mkfs.xfs -L "mydata" /dev/sdb1
    # -L = volume label

    mkfs.xfs -b size=4096 /dev/sdb1
    # block size (512, 1024, 2048, 4096)

    mkfs.xfs -f /dev/sdb1
    # -f = force (overwrite existing filesystem)

    mkfs.xfs -m crc=1 /dev/sdb1
    # CRC32 metadata protection (enabled by default in modern XFS)

    # Allocation Groups - parallelism
    mkfs.xfs -d agcount=8 /dev/sdb1
    # agcount=8: 8 allocation groups (better parallelism on multi-core)
    # Default: one AG per 4GB, minimum 4

    # View XFS parameters
    xfs_info /dev/sdb1
    xfs_info /data       # or by mount point

### Tuning and Maintaining XFS

    # Change volume label
    xfs_admin -L "newlabel" /dev/sdb1    # must be unmounted
    # or online:
    xfs_admin -L "newlabel" /data        # by mount point

    # View and change UUID
    xfs_admin -lu /dev/sdb1              # show label and UUID
    xfs_admin -U generate /dev/sdb1      # new UUID

    # Freeze filesystem (for consistent snapshot)
    xfs_freeze -f /data      # freeze (I/O is blocked)
    # take snapshot...
    xfs_freeze -u /data      # unfreeze

    # Defragmentation (online)
    xfs_fsr /data            # defrag mounted filesystem
    xfs_fsr -v /data         # verbose output

    # Check fragmentation
    xfs_db -r -c frag /dev/sdb1

    # XFS Quotas
    # Mount with quota support
    mount -o uquota,gquota /dev/sdb1 /data
    # uquota = user quota, gquota = group quota

    # Set quota for a user
    xfs_quota -x -c 'limit -u bsoft=1g bhard=2g user1' /data
    # bsoft=1g: soft limit 1GB, bhard=2g: hard limit 2GB

    # Show quotas
    xfs_quota -c 'report -u' /data

### Checking and Repairing XFS (xfs_repair)

    # xfs_repair - more powerful than fsck.xfs
    # Filesystem must be unmounted
    xfs_repair /dev/sdb1

    # Check only (do not repair)
    xfs_repair -n /dev/sdb1

    # Verbose output
    xfs_repair -v /dev/sdb1

    # If journal is corrupted and xfs_repair cannot proceed
    xfs_repair -L /dev/sdb1    # zero the log (lose last transactions)

    # Diagnostics
    xfs_db /dev/sdb1           # interactive debugger
    xfs_db -r -c "version" /dev/sdb1    # filesystem version

    # Backup and restore via xfsdump/xfsrestore
    apt install xfsdump    # Debian/Ubuntu
    dnf install xfsdump    # Fedora/RHEL

    # Level 0 backup (full)
    xfsdump -l 0 -f /backup/data.dump /data

    # Restore
    xfsrestore -f /backup/data.dump /restore_point

    # Level 1 backup (incremental from level 0)
    xfsdump -l 1 -f /backup/data_inc.dump /data

### Mounting XFS

    # Mount
    mount /dev/sdb1 /data
    mount -t xfs /dev/sdb1 /data

    # Useful XFS mount options
    mount -o noatime /dev/sdb1 /data
    # noatime: do not update atime (recommended for XFS)

    mount -o logbufs=8 /dev/sdb1 /data
    # number of log buffers (2-8, more = faster journaling)

    mount -o logbsize=256k /dev/sdb1 /data
    # log buffer size (32k-256k)

    mount -o allocsize=64m /dev/sdb1 /data
    # pre-allocation size on write (for large files)

    mount -o discard /dev/sdb1 /data
    # TRIM for SSD

    # /etc/fstab entry
    UUID=abc123...  /data  xfs  defaults,noatime  0  2

---

## SWAP

SWAP (swap space) - disk space used by the kernel when RAM is insufficient.

    # Create a swap partition
    mkswap /dev/sdb2
    swapon /dev/sdb2          # enable
    swapoff /dev/sdb2         # disable

    # Create a swap file
    fallocate -l 4G /swapfile
    # or: dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # View swap
    swapon --show
    free -h
    cat /proc/swaps

    # /etc/fstab for auto-enable at boot
    /dev/sdb2  none  swap  sw  0  0
    /swapfile  none  swap  sw  0  0

    # Swappiness (0-100): how aggressively to use swap
    cat /proc/sys/vm/swappiness   # current value (usually 60)
    sysctl vm.swappiness=10       # reduce (recommended for servers)
    echo 'vm.swappiness=10' >> /etc/sysctl.conf   # persist

    # LVM swap (resizable)
    lvcreate -L 4G -n swap_lv data_vg
    mkswap /dev/data_vg/swap_lv
    swapon /dev/data_vg/swap_lv

---

## fstab and Auto-mounting

    # /etc/fstab format:
    # <device>  <mountpoint>  <type>  <options>  <dump>  <pass>
    #
    # dump: 0 = don't back up, 1 = back up (legacy)
    # pass: 0 = don't check, 1 = root (first), 2 = others

    # Example entries
    /dev/sda1                   /boot  ext4  defaults         0  2
    UUID=abc123-def456          /      ext4  defaults,noatime 0  1
    /dev/data_vg/data_lv        /data  xfs   defaults,noatime 0  2
    UUID=xyz789                 /data  xfs   defaults         0  2
    /swapfile                   none   swap  sw               0  0
    tmpfs                       /tmp   tmpfs defaults,size=2G  0  0

    # Find device UUID
    blkid /dev/sdb1
    ls -la /dev/disk/by-uuid/

    # Verify fstab without rebooting
    mount -a                 # mount everything from fstab
    findmnt --verify         # validate fstab entries

    # Mount options
    defaults    = rw,suid,dev,exec,auto,nouser,async
    noatime     - do not update access time (speeds up I/O)
    nodiratime  - do not update atime for directories
    ro          - read-only
    rw          - read-write (default)
    noexec      - deny execution of files (security for /tmp)
    nosuid      - deny setuid bits
    nodev       - deny special device files
    nofail      - do not error at boot if device is absent
    _netdev     - network device, wait for network before mounting
    x-systemd.automount - automount via systemd (mount on first access)

---

## Cheat Sheet

    Partitions:
      lsblk -f             - all disks with FS and UUID
      fdisk /dev/sdb       - manage partitions (interactive)
      parted /dev/sdb print - partition table
      blkid                - UUID of all devices
      partprobe /dev/sdb   - inform kernel of new partition table

    LVM - PV:
      pvcreate /dev/sdb    - create PV
      pvs                  - list PVs
      pvdisplay            - detailed info
      pvmove /dev/sdb      - move data off PV

    LVM - VG:
      vgcreate vg1 /dev/sdb /dev/sdc   - create VG
      vgs                               - list VGs
      vgextend vg1 /dev/sdd             - add PV to VG
      vgreduce vg1 /dev/sdb             - remove PV from VG

    LVM - LV:
      lvcreate -L 50G -n lv1 vg1        - create 50GB LV
      lvcreate -l 100%FREE -n lv1 vg1   - create LV using all free space
      lvs                                - list LVs
      lvextend -L +20G -r /dev/vg1/lv1  - grow LV + FS
      lvreduce -L 40G -r /dev/vg1/lv1   - shrink LV + FS (ext4 only)
      lvcreate -L 5G -s -n snap /dev/vg1/lv1  - snapshot

    ext4:
      mkfs.ext4 -L "label" /dev/sdb1    - create
      tune2fs -l /dev/sdb1              - FS parameters
      tune2fs -m 1 /dev/sdb1            - 1% reserved space
      e2fsck -f /dev/sdb1               - check (unmount first)
      resize2fs /dev/sdb1 50G           - resize FS

    xfs:
      mkfs.xfs -L "label" /dev/sdb1     - create
      xfs_info /data                    - FS parameters
      xfs_repair /dev/sdb1              - check (unmount first)
      xfs_growfs /data                  - grow FS (grow only)
      xfs_freeze -f /data               - freeze for snapshot
      xfs_freeze -u /data               - unfreeze

    Mounting:
      mount -o noatime /dev/sdb1 /data  - mount with noatime
      mount -o remount,rw /data         - remount rw
      umount /data                      - unmount
      df -hT                            - usage + FS type
      findmnt                           - mount tree

    Common workflows:
      Add a disk to LVM:
        pvcreate /dev/sdb → vgextend vg1 /dev/sdb → lvextend → resize FS

      Grow LV online (ext4):
        lvextend -L +20G -r /dev/vg1/lv1

      Grow LV online (xfs):
        lvextend -L +20G /dev/vg1/lv1 && xfs_growfs /data

      Snapshot for backup:
        lvcreate -L 5G -s -n snap /dev/vg1/lv1
        mount -o ro /dev/vg1/snap /mnt/snap
        rsync -avz /mnt/snap/ /backup/
        umount /mnt/snap && lvremove /dev/vg1/snap

---

## References

- [LVM2 HOWTO](https://tldp.org/HOWTO/LVM-HOWTO/) - comprehensive LVM guide
- [ext4 Wiki](https://ext4.wiki.kernel.org/) - kernel.org ext4 wiki
- [XFS FAQ](https://xfs.wiki.kernel.org/) - official XFS documentation
- [man lvm](https://linux.die.net/man/8/lvm) - LVM man page
- [man mkfs.ext4](https://linux.die.net/man/8/mkfs.ext4) - ext4 format options
- [man xfs](https://linux.die.net/man/5/xfs) - XFS documentation
- [Red Hat Storage Guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/managing_storage_devices/) - RHEL storage management
- [Arch Wiki LVM](https://wiki.archlinux.org/title/LVM) - practical Arch Linux LVM guide
