---
title: "Namespaces and cgroups - The Foundation of Containers"
date: "2026-05-09"
---

Namespaces and cgroups are two kernel mechanisms that together form the foundation of all container technologies: Docker, Podman, LXC, Kubernetes. Namespaces provide isolation - each container sees its own "slice" of the system. cgroups provide resource limits - how much CPU, memory, and I/O a group of processes can use.

    Container = namespace isolation + cgroup limits + filesystem (rootfs)

    Without namespaces: all processes share the same PIDs, network, users, and files.
    Without cgroups: one process can consume all memory or CPU and crash the system.

---

## Namespaces

A namespace is an abstraction that wraps a global system resource and makes it private for a group of processes. Processes inside a namespace see only their own isolated resources.

Linux supports 8 namespace types:

    mnt    - mount points
    pid    - process identifiers
    net    - network interfaces, ports, routing tables
    ipc    - IPC: message queues, semaphores, shared memory
    uts    - hostname and domainname
    user   - UID/GID mapping (user privileges)
    cgroup - cgroup hierarchy (Linux 4.6+)
    time   - system time (Linux 5.6+)

### System Calls

    clone():
      Creates a new process (like fork) and optionally new namespaces.
      Flags: CLONE_NEWPID, CLONE_NEWNET, CLONE_NEWNS (mnt), etc.

    unshare():
      Detaches the current process from a namespace without forking.
      The unshare(1) command is the userspace wrapper.

    setns():
      Attaches the current thread to an existing namespace.
      Used by nsenter(1) and container runtimes.

    # View namespaces of the current process
    ls -la /proc/self/ns/
    # lrwxrwxrwx ... cgroup -> cgroup:[4026531835]
    # lrwxrwxrwx ... ipc    -> ipc:[4026531839]
    # lrwxrwxrwx ... mnt    -> mnt:[4026531841]
    # lrwxrwxrwx ... net    -> net:[4026531840]
    # lrwxrwxrwx ... pid    -> pid:[4026531836]
    # lrwxrwxrwx ... user   -> user:[4026531837]
    # lrwxrwxrwx ... uts    -> uts:[4026531838]

    # Namespaces of a specific process
    ls -la /proc/<pid>/ns/

    # List all namespaces in the system (lsns)
    lsns
    lsns -t pid     # only pid namespaces
    lsns -t net     # only net namespaces

---

## PID Namespace

Isolates the process ID space. Processes inside the namespace have their own PIDs starting from 1. PID 1 inside the container is the container's init.

    Key properties:
      - Processes inside the namespace cannot see processes outside
      - From outside, the "host" PID of the same process is visible
      - PID namespaces are nested: a child namespace sees only its own PIDs
      - If PID 1 (container init) exits, the namespace is destroyed
      - Signals from a parent namespace can reach child processes

    # Create a new PID namespace
    unshare --pid --fork --mount-proc bash

    # Inside - only its own processes
    ps aux
    # PID 1 - bash

    # From outside - both PIDs are visible
    # PID 1234 (host) = PID 1 (inside namespace)

    # Run a process in a new PID namespace
    unshare --pid --fork sleep 1000 &
    PID_OUTSIDE=$!
    echo "Host PID: $PID_OUTSIDE"

    # Enter the namespace of a process
    nsenter --pid=/proc/$PID_OUTSIDE/ns/pid ps aux

    # Docker example - PID 1 inside the container
    docker run --rm alpine ps aux
    # PID 1 = /bin/sh (or the entrypoint)

    # Share PID namespace with the host (insecure)
    docker run --pid=host alpine ps aux  # sees all host processes

    # Share PID namespace between containers
    docker run -d --name app1 nginx
    docker run --pid=container:app1 alpine ps aux  # sees app1's processes

---

## Network Namespace

Isolates the entire network stack: interfaces, IP addresses, routing tables, iptables rules, sockets.

    Key properties:
      - A new net namespace contains only loopback (lo)
      - Each container gets its own eth0
      - Communication between namespaces via veth pairs (virtual ethernet)
      - Or via macvlan, ipvlan
      - Docker bridge (docker0) is a virtual switch in the host namespace

    # Create a new network namespace
    ip netns add myns

    # List network namespaces
    ip netns list

    # Run a command inside the namespace
    ip netns exec myns ip addr show
    ip netns exec myns ip link show

    # Create a veth pair to connect the namespace to the host
    ip link add veth0 type veth peer name veth1

    # Move one end of the veth pair into the namespace
    ip link set veth1 netns myns

    # Configure addresses
    ip addr add 192.168.100.1/24 dev veth0
    ip link set veth0 up

    ip netns exec myns ip addr add 192.168.100.2/24 dev veth1
    ip netns exec myns ip link set veth1 up
    ip netns exec myns ip link set lo up

    # Test connectivity
    ping 192.168.100.2

    # Delete namespace
    ip netns delete myns

    # View network namespace of a process
    ls -la /proc/<pid>/ns/net

    # Persist a namespace to the filesystem
    ip netns add persistent_ns
    # A file is created at /var/run/netns/persistent_ns

    # How Docker creates networking for a container (simplified):
    # 1. clone(CLONE_NEWNET) - create the namespace
    # 2. ip link add vethXXX type veth peer name ethYYY
    # 3. ip link set ethYYY netns <container_ns>
    # 4. ip link set ethYYY name eth0 (inside the namespace)
    # 5. ip addr add <container_ip> dev eth0
    # 6. ip link set docker0 master vethXXX
    # 7. ip link set vethXXX up

---

## Mount Namespace

Isolates the mount point table. Each namespace has its own independent set of mount points.

    Key properties:
      - Changes to the mount namespace are not visible to other namespaces
      - Foundation for pivot_root and chroot in containers
      - Shared subtree: propagation types (shared, private, slave, unbindable)
      - /proc/mounts and /proc/self/mountinfo are per-namespace

    # Create a new mount namespace
    unshare --mount bash

    # Inside - mount without affecting the host
    mount --bind /tmp/mydir /mnt/test
    mount | grep test   # visible
    # In another terminal on the host - not visible

    # Create a minimal filesystem for a container
    mkdir -p /tmp/rootfs/{bin,lib,lib64,proc,sys,dev,tmp}
    # Copy needed binaries...

    # pivot_root - switch the root filesystem (used by container runtimes)
    unshare --mount --pid --fork bash
    mount --bind /tmp/rootfs /tmp/rootfs
    mkdir -p /tmp/rootfs/oldroot
    pivot_root /tmp/rootfs /tmp/rootfs/oldroot
    mount -t proc proc /proc
    umount -l /oldroot

    # Propagation types (important for bindmount behavior)
    # shared     - changes propagate in both directions
    # private    - changes are isolated (default in a new namespace)
    # slave      - host changes are visible inside, but not the reverse
    # unbindable - cannot be bind-mounted

    # Make a mount point private
    mount --make-private /mnt

    # Make the entire tree private (for isolation)
    mount --make-rprivate /

    # Kubernetes: tmpfs for secrets
    # /var/lib/kubelet/pods/<pod>/volumes/kubernetes.io~secret/<secret>
    # is mounted as tmpfs in the pod's separate mount namespace

---

## UTS Namespace

Isolates hostname and NIS domainname. Each container can have its own hostname.

    # Create a UTS namespace with a new hostname
    unshare --uts bash
    hostname mycontainer
    hostname    # mycontainer
    # On the host, the hostname is unchanged

    # Docker sets the container hostname via UTS namespace
    docker run --rm --hostname myapp alpine hostname
    # myapp

    # By default Docker uses the short container ID as the hostname
    docker run --rm alpine hostname
    # a3f2b1c4d5e6 (container ID)

---

## IPC Namespace

Isolates System V IPC objects (message queues, semaphores, shared memory segments) and POSIX message queues.

    # Create an IPC namespace
    unshare --ipc bash

    # Inside - its own IPC objects, not visible outside
    ipcmk -Q          # create a message queue
    ipcs -q           # visible

    # From outside
    ipcs -q           # empty, objects are isolated

    # Important for databases in containers:
    # PostgreSQL uses shared memory (shmem) for its buffer pool
    # Without IPC namespace - shmem segments are visible to all host processes
    # With IPC namespace - isolated inside the container

    # Docker creates a new IPC namespace by default
    # Share IPC namespace between containers (for shared memory)
    docker run -d --name app1 --ipc=shareable myapp
    docker run --ipc=container:app1 myapp-sidecar

    # Use the host IPC namespace (insecure)
    docker run --ipc=host myapp

---

## User Namespace

Isolates UID and GID. Allows a process to appear as root inside the namespace while remaining unprivileged outside. The foundation for rootless containers.

    Key properties:
      - UID 0 inside the namespace maps to an unprivileged UID outside
      - Capabilities inside the namespace do not work outside it
      - Does not require root to create (the only namespace without root)
      - Foundation for Podman rootless, Docker rootless, Buildah

    # Create a user namespace without root
    unshare --user --map-root-user bash
    # Now we are "root" inside the namespace
    id
    # uid=0(root) gid=0(root) groups=0(root),...

    # But outside - a regular user
    # In another terminal:
    ps aux | grep bash
    # Shows the process is running as a regular UID

    # UID mapping
    cat /proc/self/uid_map
    # 0  1000  1    (UID 0 inside = UID 1000 outside, 1 user)

    # Set mapping manually
    # /proc/<pid>/uid_map format: <inside_uid> <outside_uid> <count>
    echo "0 1000 1" > /proc/<pid>/uid_map
    echo "0 1000 1" > /proc/<pid>/gid_map

    # Range mapping (for containers)
    # UID 0-65535 inside = UID 100000-165535 outside
    echo "0 100000 65536" > /proc/<pid>/uid_map

    # /etc/subuid and /etc/subgid - UID ranges for users
    cat /etc/subuid
    # username:100000:65536
    # username gets UID 100000-165535 for user namespaces

    # Add a range to a user
    usermod --add-subuids 100000-165535 username
    usermod --add-subgids 100000-165535 username

    # Rootless Docker
    dockerd-rootless-setuptool.sh install
    docker context use rootless
    docker run --rm alpine id
    # uid=0(root) but outside this is a regular user

    # Rootless Podman (works out of the box)
    podman run --rm alpine id
    # uid=0(root) inside the container

    # View the UID mapping of a container
    podman unshare cat /proc/self/uid_map

---

## cgroup Namespace

Isolates the cgroup hierarchy. A process sees its cgroup as "/" instead of the real path.

    # Without cgroup namespace, the container sees the path:
    # /sys/fs/cgroup/memory/docker/<container_id>/

    # With cgroup namespace, the container sees:
    # /sys/fs/cgroup/memory/

    # Useful for security - does not expose the host cgroup structure
    # And for tools running inside the container (systemd, etc.)

    cat /proc/self/cgroup
    # Inside a container with cgroup namespace - shows / as the root

---

## Time Namespace

Isolates CLOCK_MONOTONIC and CLOCK_BOOTTIME. Allows a container to have its own "system uptime".

    # Linux 5.6+
    # Useful for:
    # - Checkpoint/restore (CRIU): restore time without jumps
    # - Testing uptime-dependent applications
    # - Container migration between hosts

    # Create a time namespace with a different offset
    unshare --time --monotonic-offset 3600 bash
    # uptime inside will differ by 1 hour

---

## Working with Namespaces - Tools

### unshare

    # Syntax: unshare [options] [program]

    # New UTS namespace
    unshare --uts bash

    # New network + UTS + PID namespace
    unshare --net --uts --pid --fork bash

    # New mount namespace
    unshare --mount bash

    # Full isolation (all namespaces)
    unshare --mount --uts --ipc --net --pid --user --map-root-user --fork bash

    # Create namespace and mount /proc (for correct ps output)
    unshare --pid --fork --mount-proc bash

### nsenter

    # Enter the namespaces of an existing process
    nsenter --target <pid> --mount --uts --ipc --net --pid

    # Enter only the net namespace
    nsenter --target <pid> --net

    # Enter all namespaces of a process
    nsenter -t <pid> -m -u -i -n -p

    # Enter the namespace of a Docker container
    docker inspect --format '{{.State.Pid}}' mycontainer
    nsenter -t <pid> -n ip addr show   # container's network interfaces

    # Enter namespace by file
    nsenter --net=/var/run/netns/myns ip addr show

    # Equivalent to docker exec
    nsenter -t $(docker inspect --format '{{.State.Pid}}' mycontainer) \
      -m -u -i -n -p -- bash

### lsns

    # Show all namespaces on the system
    lsns

    # Example output:
    # NS TYPE  NPROCS   PID USER       COMMAND
    # 4026531835 cgroup    120     1 root       /sbin/init
    # 4026531836 pid       120     1 root       /sbin/init
    # 4026531837 user      120     1 root       /sbin/init
    # 4026531838 uts       120     1 root       /sbin/init
    # 4026531839 ipc       120     1 root       /sbin/init
    # 4026531840 net       120     1 root       /sbin/init
    # 4026532xxx net         2  5678 root       nginx

    # Filter by type
    lsns -t net
    lsns -t pid

    # Filter by process
    lsns -p <pid>

---

## cgroups

cgroups (control groups) is a kernel mechanism for organizing processes into hierarchical groups and managing resource usage. Introduced in Linux 2.6.24 (cgroups v1), redesigned as cgroups v2 (Linux 4.5, mainstream since 5.2+).

    What cgroups control:
      - CPU: quota, weight, core pinning
      - Memory: RAM limit, swap, OOM behavior
      - I/O: throughput and IOPS for block devices
      - Network: traffic prioritization (tc/net_cls)
      - PIDs: maximum number of processes
      - Devices: access to /dev devices
      - Freezer: pause/resume a group of processes
      - Hugetlb: huge pages limit

---

## cgroups v1 vs v2

    cgroups v1:
      - Multiple independent hierarchies, one per subsystem (controller)
      - /sys/fs/cgroup/cpu/, /sys/fs/cgroup/memory/, etc. - separate trees
      - A process can be in different groups for different subsystems
      - Complex and inconsistent semantics
      - Problem: no single owner of a process group

    cgroups v2 (unified hierarchy):
      - One hierarchy for all controllers
      - /sys/fs/cgroup/ - a single tree
      - A process belongs to exactly one cgroup
      - Delegation: unprivileged users can manage their own cgroups
      - Better support in systemd, containerd, Docker (>= 20.10)

    # Check which cgroup version the system uses
    stat -fc %T /sys/fs/cgroup/
    # tmpfs    = cgroups v1
    # cgroup2fs = cgroups v2 (unified)

    # Most modern systems use v2 (Ubuntu 21.10+, Fedora 31+)
    # Or a hybrid mode (v1 + v2 simultaneously)

    mount | grep cgroup
    # cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)
    # or
    # tmpfs on /sys/fs/cgroup type tmpfs
    # cgroup on /sys/fs/cgroup/cpu type cgroup (...,cpu,cpuacct)
    # cgroup on /sys/fs/cgroup/memory type cgroup (...,memory)

---

## cgroups v2 - Structure and Usage

### Filesystem Structure

    /sys/fs/cgroup/           - root of unified hierarchy
    ├── cgroup.controllers    # available controllers
    ├── cgroup.procs          # PIDs of processes in this cgroup
    ├── cgroup.subtree_control # enabled controllers for children
    ├── cpu.stat              # CPU statistics
    ├── memory.current        # current memory usage
    ├── memory.max            # memory limit
    ├── io.stat               # I/O statistics
    └── mygroup/              # child cgroup
        ├── cgroup.procs
        ├── memory.max
        └── cpu.max

    # View available controllers
    cat /sys/fs/cgroup/cgroup.controllers
    # cpuset cpu io memory hugetlb pids rdma misc

    # View enabled controllers for child cgroups
    cat /sys/fs/cgroup/cgroup.subtree_control
    # cpu io memory pids

### Creating a cgroup and Managing Processes

    # Create a cgroup (just mkdir)
    mkdir /sys/fs/cgroup/myapp

    # Enable the needed controllers
    echo "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control

    # Move a process into the cgroup
    echo <pid> > /sys/fs/cgroup/myapp/cgroup.procs

    # Move the current shell
    echo $$ > /sys/fs/cgroup/myapp/cgroup.procs

    # View processes in the cgroup
    cat /sys/fs/cgroup/myapp/cgroup.procs

    # View all tasks (threads) in the cgroup
    cat /sys/fs/cgroup/myapp/cgroup.threads

    # View which cgroup a process belongs to
    cat /proc/<pid>/cgroup
    # 0::/myapp   (v2 unified: one line starting with 0::)

    # Delete the cgroup (must be empty first)
    rmdir /sys/fs/cgroup/myapp

### Memory Controller

    # RAM limit
    echo 512M > /sys/fs/cgroup/myapp/memory.max
    # or in bytes:
    echo 536870912 > /sys/fs/cgroup/myapp/memory.max

    # Swap limit (memory + swap together)
    echo 1G > /sys/fs/cgroup/myapp/memory.swap.max

    # Current usage
    cat /sys/fs/cgroup/myapp/memory.current

    # Detailed memory statistics
    cat /sys/fs/cgroup/myapp/memory.stat
    # anon 1234567      - anonymous memory (heap, stack)
    # file 2345678      - file cache
    # kernel 345678     - kernel memory
    # shmem 0           - shared memory

    # Soft limits - kernel tries to stay below but does not guarantee it
    echo 256M > /sys/fs/cgroup/myapp/memory.low
    echo 384M > /sys/fs/cgroup/myapp/memory.high  # throttle on excess

    # OOM behavior - what to do when OOM occurs
    cat /sys/fs/cgroup/myapp/memory.oom.group
    # 0 = kill only the offending process (default)
    # 1 = kill the entire cgroup atomically
    echo 1 > /sys/fs/cgroup/myapp/memory.oom.group

    # OOM events (inotify or epoll on memory.events)
    cat /sys/fs/cgroup/myapp/memory.events
    # low 0
    # high 0
    # max 0        - how many times memory.max was exceeded
    # oom 0        - number of OOM events
    # oom_kill 0   - number of processes killed by OOM killer

### CPU Controller

    # CPU quota (bandwidth throttling)
    # Format: <quota_us> <period_us>
    # Example: 50000 100000 = 50% of one core (50ms out of every 100ms)
    echo "50000 100000" > /sys/fs/cgroup/myapp/cpu.max
    # "max 100000" = no limit

    # 200% (2 cores):
    echo "200000 100000" > /sys/fs/cgroup/myapp/cpu.max

    # CPU weight (relative priority, replaces cpu.shares from v1)
    # Range: 1-10000, default 100
    echo 200 > /sys/fs/cgroup/myapp/cpu.weight  # twice the CPU of others

    # Pin to specific CPU cores (cpuset)
    echo 0-3 > /sys/fs/cgroup/myapp/cpuset.cpus       # use cores 0,1,2,3
    echo 0 > /sys/fs/cgroup/myapp/cpuset.mems          # use NUMA node 0

    # CPU statistics
    cat /sys/fs/cgroup/myapp/cpu.stat
    # usage_usec 1234567     - total CPU time in microseconds
    # user_usec 987654       - time in user space
    # system_usec 246913     - time in kernel space
    # nr_throttled 5         - how many times throttled
    # throttled_usec 50000   - total throttling time

### I/O Controller

    # I/O limit (requires knowing the major:minor device number)
    ls -la /dev/sda   # 8:0

    # Read limit: 50 MB/s
    echo "8:0 rbps=52428800" > /sys/fs/cgroup/myapp/io.max
    # Write limit: 20 MB/s
    echo "8:0 wbps=20971520" > /sys/fs/cgroup/myapp/io.max
    # IOPS limits
    echo "8:0 riops=1000 wiops=500" > /sys/fs/cgroup/myapp/io.max
    # All together
    echo "8:0 rbps=52428800 wbps=20971520 riops=1000 wiops=500" \
      > /sys/fs/cgroup/myapp/io.max

    # I/O weight (priority)
    echo "8:0 100" > /sys/fs/cgroup/myapp/io.weight  # 100 = default

    # I/O statistics
    cat /sys/fs/cgroup/myapp/io.stat
    # 8:0 rbytes=1234567 wbytes=2345678 rios=123 wios=456 dbytes=0 dios=0

### PID Controller

    # Limit on the number of processes/threads
    echo 100 > /sys/fs/cgroup/myapp/pids.max
    # "max" = no limit

    # Current count
    cat /sys/fs/cgroup/myapp/pids.current

    # Protection from fork bombs:
    echo 50 > /sys/fs/cgroup/myapp/pids.max
    # Attempting to create the 51st process returns EAGAIN

---

## cgroups v1 - Legacy but Still Encountered

### v1 Structure

    /sys/fs/cgroup/
    ├── cpu/              - CPU scheduling
    ├── cpuacct/          - CPU accounting
    ├── cpuset/           - CPU/NUMA pinning
    ├── memory/           - Memory limits
    ├── blkio/            - Block I/O
    ├── pids/             - PID limits
    ├── devices/          - Device access
    ├── freezer/          - Pause/resume
    ├── net_cls/          - Network class tagging
    ├── net_prio/         - Network priority
    └── hugetlb/          - Huge pages

### cgroups v1 - Memory

    # Create a cgroup
    mkdir /sys/fs/cgroup/memory/myapp

    # Set memory limit
    echo 536870912 > /sys/fs/cgroup/memory/myapp/memory.limit_in_bytes
    # 512M = 512 * 1024 * 1024 = 536870912

    # Swap limit
    echo 1073741824 > /sys/fs/cgroup/memory/myapp/memory.memsw.limit_in_bytes
    # 1G total (memory + swap)

    # Add a process
    echo <pid> > /sys/fs/cgroup/memory/myapp/tasks

    # OOM kill vs throttle
    echo 1 > /sys/fs/cgroup/memory/myapp/memory.oom_control
    # 0 = OOM killer enabled (default)
    # 1 = OOM killer disabled (process is paused instead)

    # Statistics
    cat /sys/fs/cgroup/memory/myapp/memory.usage_in_bytes
    cat /sys/fs/cgroup/memory/myapp/memory.stat

### cgroups v1 - CPU

    # Create a cgroup
    mkdir /sys/fs/cgroup/cpu/myapp

    # CPU shares (relative weight, not absolute)
    echo 512 > /sys/fs/cgroup/cpu/myapp/cpu.shares  # 512 vs default 1024

    # CPU quota (100ms period, 50ms quota = 50%)
    echo 100000 > /sys/fs/cgroup/cpu/myapp/cpu.cfs_period_us
    echo 50000 > /sys/fs/cgroup/cpu/myapp/cpu.cfs_quota_us
    # -1 in quota = no limit

    # cpuset - pin to specific cores
    mkdir /sys/fs/cgroup/cpuset/myapp
    echo 0-1 > /sys/fs/cgroup/cpuset/myapp/cpuset.cpus
    echo 0 > /sys/fs/cgroup/cpuset/myapp/cpuset.mems
    echo <pid> > /sys/fs/cgroup/cpuset/myapp/tasks

---

## systemd and cgroups

systemd is the primary cgroup manager on most Linux systems. Every service, user session, and transient unit gets its own cgroup.

    # systemd cgroup tree structure
    /sys/fs/cgroup/
    └── system.slice/                    # system services
        ├── nginx.service/
        ├── postgresql.service/
        ├── docker.service/
    └── user.slice/                      # user sessions
        └── user-1000.slice/
            └── session-1.scope/
    └── init.scope                       # PID 1 (systemd)

    # Show the cgroup tree
    systemd-cgls
    systemd-cgls /system.slice/nginx.service

    # Show resource usage
    systemd-cgtop
    systemd-cgtop --depth=3

    # View the cgroup of a service
    systemctl show nginx.service | grep -i cgroup
    # ControlGroup=/system.slice/nginx.service

    # Set limits via systemd (modifies the cgroup)
    systemctl set-property nginx.service MemoryMax=512M
    systemctl set-property nginx.service CPUQuota=50%
    systemctl set-property nginx.service TasksMax=100

    # Temporary (not persisted)
    systemctl set-property --runtime nginx.service MemoryMax=256M

    # Directly in the unit file:
    # /etc/systemd/system/myapp.service
    [Service]
    MemoryMax=512M
    MemorySwapMax=0        # disallow swap
    CPUQuota=100%          # 1 core
    CPUWeight=200          # double priority
    TasksMax=200           # max processes
    IOWeight=100           # I/O priority
    IOReadBandwidthMax=/dev/sda 50M
    IOWriteBandwidthMax=/dev/sda 20M

    # Run a temporary scope (e.g. to limit a command)
    systemd-run --scope --slice=myslice.slice \
      -p MemoryMax=256M -p CPUQuota=50% \
      bash -c "stress --cpu 4 --timeout 60"

    # Show current limits of a service
    systemctl show nginx.service | grep -E "Memory|CPU|Tasks|IO"

---

## Docker and Container Runtimes

### How Docker Uses Namespaces and cgroups

    On docker run, Docker (via containerd and runc) does:
      1. clone() with CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS |
                       CLONE_NEWIPC | CLONE_NEWUTS | CLONE_NEWUSER (rootless)
      2. Creates a cgroup at /sys/fs/cgroup/docker/<container_id>/
      3. Sets resource limits in the cgroup
      4. pivot_root into the container rootfs
      5. Runs the entrypoint

    # View namespaces of a container
    docker inspect <container> | grep -i pid
    docker inspect --format '{{.State.Pid}}' <container>
    ls -la /proc/<container_pid>/ns/

    # View cgroup of a container
    docker inspect --format '{{.HostConfig.CgroupParent}}' <container>
    cat /proc/<container_pid>/cgroup

    # Container cgroup on the host
    ls /sys/fs/cgroup/docker/   # cgroups v1
    ls /sys/fs/cgroup/system.slice/docker-*.scope/  # cgroups v2

### Docker - Resource Management

    # Memory limit
    docker run --memory 512m nginx
    docker run -m 512m nginx
    docker run --memory 512m --memory-swap 1g nginx  # + swap

    # CPU limit
    docker run --cpus 1.5 nginx              # 1.5 cores
    docker run --cpu-shares 512 nginx        # relative weight (default 1024)
    docker run --cpu-period 100000 --cpu-quota 50000 nginx  # 50%
    docker run --cpuset-cpus 0,1 nginx       # only cores 0 and 1

    # I/O limit
    docker run --device-read-bps /dev/sda:50mb nginx
    docker run --device-write-bps /dev/sda:20mb nginx
    docker run --device-read-iops /dev/sda:1000 nginx
    docker run --device-write-iops /dev/sda:500 nginx

    # PID limit
    docker run --pids-limit 100 nginx

    # View current limits and usage
    docker stats <container>
    docker stats --no-stream <container>

    # Update limits on a running container
    docker update --memory 1g <container>
    docker update --cpus 2 <container>

    # View limits in inspect
    docker inspect <container> | grep -A 30 '"HostConfig"'

### Kubernetes - resources and limits

    # pod.yaml
    spec:
      containers:
      - name: myapp
        image: myapp:latest
        resources:
          requests:            # what the scheduler reserves
            memory: "128Mi"
            cpu: "250m"        # 250 millicores = 0.25 core
          limits:              # maximum (cgroup limit)
            memory: "512Mi"
            cpu: "1000m"       # 1 core

    # CPU:
    #   requests - cpu.weight (guaranteed share)
    #   limits   - cpu.max (hard limit, causes throttling)

    # Memory:
    #   requests - used by the scheduler
    #   limits   - memory.max (OOM kill on excess)

    # View actual pod usage
    kubectl top pod <pod>
    kubectl top pod <pod> --containers

    # View pod cgroup on the node
    # /sys/fs/cgroup/kubepods/burstable/pod<uid>/<container_id>/

    # Kubernetes QoS classes:
    # Guaranteed:  requests == limits for all containers
    # Burstable:   requests < limits, or only limits are set
    # BestEffort:  neither requests nor limits are set
    # On OOM: BestEffort is killed first, Guaranteed last

---

## Monitoring and Diagnostics

### Observing Namespaces

    # All namespaces on the system
    lsns

    # Namespaces of a specific process
    ls -la /proc/<pid>/ns/

    # Compare namespaces of two processes (same inode = same namespace)
    stat -L /proc/1/ns/net
    stat -L /proc/<container_pid>/ns/net

    # Enter a namespace for debugging
    nsenter -t <pid> -n -- ip addr show
    nsenter -t <pid> -n -- ss -tlnp
    nsenter -t <pid> -m -- ls /

### Observing cgroups

    # cgroup tree (systemd)
    systemd-cgls

    # Real-time monitoring
    systemd-cgtop

    # Read cgroup files directly
    cat /sys/fs/cgroup/myapp/memory.current
    cat /sys/fs/cgroup/myapp/cpu.stat
    cat /sys/fs/cgroup/myapp/io.stat

    # Memory of all Docker containers
    for c in /sys/fs/cgroup/docker/*/memory.current; do
        container=$(basename $(dirname $c))
        mem=$(cat $c)
        echo "${container:0:12}: $(( mem / 1024 / 1024 )) MB"
    done

    # Find the cgroup of a process
    cat /proc/<pid>/cgroup

    # cgget (from cgroup-tools)
    cgget -g memory:myapp
    cgget -g cpu:myapp

    # cgexec - run a process in a cgroup
    cgexec -g memory:myapp /usr/bin/myprogram

    # View OOM events
    dmesg | grep -i "oom\|killed"
    journalctl -k | grep -i oom

---

## Practical Examples

### Protecting the System from Fork Bombs

    # Create a cgroup with a PID limit
    mkdir /sys/fs/cgroup/sandbox
    echo "+pids" > /sys/fs/cgroup/cgroup.subtree_control
    echo 50 > /sys/fs/cgroup/sandbox/pids.max
    echo $$ > /sys/fs/cgroup/sandbox/cgroup.procs
    # Now a fork bomb won't take down the system
    :(){ :|:& };:   # will try, hit the limit of 50, and stop

### Isolated Environment Without Docker

    # A fully isolated process using namespaces
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

    # Inside: root, own network (lo only), own PIDs, own hostname
    hostname isolated-env
    ip addr  # only lo

### Monitoring Container Memory from the Host

    CONTAINER_ID=$(docker inspect --format '{{.Id}}' mycontainer)

    # cgroups v2
    CGROUP_PATH="/sys/fs/cgroup/system.slice/docker-${CONTAINER_ID}.scope"

    watch -n 1 "
      echo 'Memory:' \$(cat $CGROUP_PATH/memory.current | numfmt --to=iec)
      echo 'Limit:'  \$(cat $CGROUP_PATH/memory.max | numfmt --to=iec)
      echo 'OOM events:' \$(grep oom_kill $CGROUP_PATH/memory.events | awk '{print \$2}')
    "

### Resource Limits Without Docker

    # systemd-run to launch with limits
    systemd-run \
      --scope \
      --property=MemoryMax=256M \
      --property=CPUQuota=50% \
      --property=TasksMax=50 \
      --property=PrivateTmp=yes \
      python3 heavy_script.py

---

## Quick Reference

    Namespaces:
      lsns                           - list all namespaces
      lsns -t <type>                 - filter by type (pid, net, mnt, ...)
      ls -la /proc/<pid>/ns/         - namespaces of a process
      unshare --<type> cmd           - create namespace and run cmd
      unshare --pid --fork --mount-proc bash  - isolated bash
      nsenter -t <pid> -n cmd        - enter net namespace of a process
      nsenter -t <pid> -m -n -p cmd  - enter mnt+net+pid namespaces
      ip netns add <name>            - create a network namespace
      ip netns exec <name> cmd       - run command in network namespace

    cgroups v2 - management:
      mkdir /sys/fs/cgroup/<name>                      - create cgroup
      echo <pid> > /sys/fs/cgroup/<name>/cgroup.procs  - add a process
      echo 512M > /sys/fs/cgroup/<name>/memory.max     - memory limit
      echo "50000 100000" > /sys/fs/cgroup/<name>/cpu.max  - 50% CPU limit
      echo 100 > /sys/fs/cgroup/<name>/pids.max        - PID limit
      cat /sys/fs/cgroup/<name>/memory.current         - current memory
      cat /sys/fs/cgroup/<name>/cpu.stat               - CPU stats
      rmdir /sys/fs/cgroup/<name>                      - delete (must be empty)

    systemd:
      systemd-cgls                   - cgroup tree
      systemd-cgtop                  - real-time monitoring
      systemctl set-property svc MemoryMax=512M  - set limit
      systemd-run --scope -p MemoryMax=256M cmd  - run with limit

    Docker:
      docker run -m 512m --cpus 1.5 img    - memory and CPU limits
      docker stats <container>              - resource monitoring
      docker update --memory 1g <container> - update limit

    Kubernetes:
      resources.requests.memory: "128Mi"   - request (for scheduler)
      resources.limits.memory: "512Mi"     - limit (cgroup)
      resources.limits.cpu: "1000m"        - 1 core
      kubectl top pod <pod>                - current usage

    Diagnostics:
      cat /proc/<pid>/cgroup         - cgroup of a process
      ls /proc/<pid>/ns/             - namespaces of a process
      dmesg | grep -i oom            - OOM events
      cat /sys/fs/cgroup/*/memory.events  - cgroup events

---

## References

- [man 7 namespaces](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [man 7 cgroups](https://man7.org/linux/man-pages/man7/cgroups.7.html)
- [man 1 unshare](https://man7.org/linux/man-pages/man1/unshare.1.html)
- [man 1 nsenter](https://man7.org/linux/man-pages/man1/nsenter.1.html)
- [Linux Kernel - cgroup v2 documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [runc - OCI container runtime](https://github.com/opencontainers/runc)
- [Containers from Scratch (Liz Rice)](https://www.youtube.com/watch?v=8fi7uSYlOdc)
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [Kubernetes - Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [systemd resource control](https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html)
- [Understanding cgroups v2 (Red Hat)](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/8/html/managing_monitoring_and_updating_the_kernel/using-cgroups-v2-to-control-distribution-of-cpu-time-for-applications_managing-monitoring-and-updating-the-kernel)
