---
title: "Linux Capabilities - cap_net_raw and Others"
date: "2026-05-09"
---

Linux Capabilities are a mechanism for splitting superuser privileges into smaller, independent units. Instead of giving a process full root access, you can grant only the specific privilege it needs. This is a key tool for implementing the principle of least privilege at the kernel level.

Before capabilities: a process was either root (everything allowed) or a regular user (many things denied). With capabilities: a regular process gets only cap_net_bind_service - it can listen on port 80 and nothing more.

---

## Concept and History

    Before capabilities (classic Unix model):
      - Two levels: root (UID 0) and everyone else
      - root can do anything: mount filesystems, configure networks, read any file
      - A compromised root process means full system compromise
      - SUID binaries: temporary elevation to root for specific tasks
        (ping, passwd, su) - but they also get full root

    With capabilities (Linux >= 2.2, POSIX 1003.1e standard):
      - root is split into ~40 independent privileges
      - A process gets only the capabilities it needs
      - Compromising a process gives the attacker only those capabilities
      - ping can use raw sockets without full root (cap_net_raw)
      - A web server listens on :80 without root (cap_net_bind_service)

    Kernel implementation:
      - Every process has several capability sets
      - Files can also have capabilities (stored as xattr)
      - Checked on every syscall that requires privileges

---

## Process Capability Sets

Every process has 5 capability sets:

    Permitted (P):
      The maximum set of capabilities a process can activate.
      A process cannot add to Permitted what is not already there.
      Superset of Effective and Inheritable.

    Effective (E):
      Capabilities the kernel checks on syscalls.
      Only what is in Effective actually works right now.
      A process can remove a capability from Effective (but not add one unless it is in Permitted).

    Inheritable (I):
      Capabilities passed to a child process via exec().
      Intersection of the parent's Inheritable and the file's Inheritable.

    Bounding (B):
      An upper limit - restricts what a process can ever gain.
      Capabilities outside Bounding cannot be added to Permitted via exec().
      Can only be removed from Bounding, never added.

    Ambient (A):
      Introduced in Linux 4.3. Capabilities passed through exec()
      to unprivileged processes without file capabilities.
      Useful for containers and services without SUID.
      A capability in Ambient must also be in Permitted and Inheritable.

    Formula at exec() (simplified):
      P' = (P_file & B) | (I_file & I_process) | A
      E' = E_file ? P' : (E_file & P')
      I' = I_process & I_file

    # View capabilities of the current process
    cat /proc/self/status | grep Cap
    # CapInh: 0000000000000000
    # CapPrm: 0000000000000000
    # CapEff: 0000000000000000
    # CapBnd: 000001ffffffffff
    # CapAmb: 0000000000000000

    # Decode a hex value
    capsh --decode=000001ffffffffff

    # Capabilities of a specific process
    cat /proc/<pid>/status | grep Cap
    capsh --decode=$(cat /proc/<pid>/status | grep CapEff | awk '{print $2}')

---

## File Capability Sets

Executables can also have capabilities (stored in the xattr security.capability):

    Permitted (P_file):
      Capabilities the file adds to the process's Permitted set on exec().
      Like SUID, but targeted - only the needed privileges.

    Inheritable (I_file):
      A mask for the process's Inheritable capabilities.

    Effective bit (E_file):
      A single bit (not a set). When set, all of the file's Permitted capabilities
      automatically become Effective after exec().
      For programs that do not use the capabilities API themselves.

    # View capabilities of a file
    getcap /usr/bin/ping
    # /usr/bin/ping cap_net_raw=ep
    # e = effective, p = permitted, i = inheritable

    # Recursive search for files with capabilities
    getcap -r /usr/bin/ 2>/dev/null
    getcap -r /usr/sbin/ 2>/dev/null

    # Set capabilities on a file
    setcap cap_net_raw+ep /usr/bin/ping
    setcap cap_net_bind_service+ep /usr/bin/node

    # Remove capabilities from a file
    setcap -r /usr/bin/ping

    # Verify
    getcap /usr/bin/ping

    Flag notation in setcap/getcap:
      +e  add to effective
      +p  add to permitted
      +i  add to inheritable
      -e  remove from effective
      =ep set only effective and permitted (clear the rest)

---

## Full List of Capabilities

### Network

    CAP_NET_RAW:
      - Create raw and packet sockets (SOCK_RAW, SOCK_PACKET)
      - Use bind() for any address in transparent proxying
      - Send ICMP pings (ping uses raw sockets)
      Risk: allows capturing and forging network packets.
      Used by: ping, traceroute, tcpdump, wireshark, nmap

    CAP_NET_BIND_SERVICE:
      - Bind to privileged ports (below 1024)
      Risk: minimal, but the process can occupy port 22/80/443.
      Used by: nginx, apache, sshd, any web server

    CAP_NET_ADMIN:
      - Configure network interfaces (ip link, ip addr)
      - Modify routing tables
      - Configure iptables, nftables
      - Manage network namespaces
      - Control ARP, NDP, VLAN
      - Enable/disable promiscuous mode
      Risk: high. Full control over networking.
      Used by: NetworkManager, OpenVPN, WireGuard, Docker

    CAP_NET_BROADCAST:
      - Send broadcast and multicast packets
      - Listen to multicast
      Risk: low, but allows flooding the network with broadcasts.
      Used by: dhcpd, avahi

### Filesystem

    CAP_DAC_OVERRIDE:
      - Bypass read, write, execute permission checks on files
      - DAC = Discretionary Access Control
      Risk: very high. Read and write any file on the system.
      Used by: backup tools, antivirus, some system daemons

    CAP_DAC_READ_SEARCH:
      - Bypass read permission checks on files and execute checks on directories
      - Read-only (unlike CAP_DAC_OVERRIDE)
      Risk: high. Read any file including /etc/shadow.
      Used by: backup tools

    CAP_FOWNER:
      - Bypass owner checks when performing operations requiring UID match
      - chmod files you do not own
      - Set the sticky bit
      Risk: high.

    CAP_FSETID:
      - Set SUID/SGID bits on files
      - SGID bit on directories is not cleared on write
      Risk: medium.

    CAP_CHOWN:
      - Change the owner and group of any file (chown)
      Risk: high. Can take over any file.

    CAP_MKNOD:
      - Create special device files (mknod)
      Risk: high. Can create /dev/mem and access physical memory.

    CAP_LINUX_IMMUTABLE:
      - Set/clear FS_APPEND_FL and FS_IMMUTABLE_FL attributes
      Risk: medium. Can make files immutable or remove that protection.

    CAP_LEASE:
      - Set leases on arbitrary files (F_SETLEASE)
      Risk: low.

### Users and Privileges

    CAP_SETUID:
      - Change the process UID (setuid, setreuid, setresuid)
      - Forge UID credentials in Unix domain sockets
      Risk: critical. Can become root (UID 0) or any other user.
      Used by: su, sudo, sshd, web servers (for privilege dropping)

    CAP_SETGID:
      - Change the process GID (setgid, setregid, setresgid)
      - Manage supplementary groups
      Risk: high.
      Used by: su, sudo, sshd

    CAP_SETPCAP:
      - Add capabilities to or remove them from the bounding set of other processes
      - Pass capabilities to child processes
      - Manage ambient capabilities
      Risk: high. Controls capabilities of other processes.

    CAP_SETFCAP:
      - Set file capabilities (setcap)
      Risk: critical. Can give any capability to any file.

### System and Kernel

    CAP_SYS_ADMIN:
      - A broad set of administrative operations:
        mount/unmount filesystems, work with namespaces,
        manage quotas, configure audit, work with keyrings,
        manage loop devices, and much more
      Risk: critical. Effectively equivalent to root.
      Often described as "capability of last resort" and "root lite".
      Used by: container runtimes, systemd, strace

    CAP_SYS_PTRACE:
      - Use ptrace() to debug any process
      - Read /proc/<pid>/mem of any process
      Risk: critical. Can inject code into any process.
      Used by: gdb, strace, ltrace, debuggers

    CAP_SYS_CHROOT:
      - Use chroot()
      Risk: high. Can escape chroot via nested chroot calls.

    CAP_SYS_BOOT:
      - Call reboot() and kexec_load()
      Risk: medium (DoS - can reboot the system).

    CAP_SYS_MODULE:
      - Load and unload kernel modules (insmod, rmmod)
      Risk: critical. Can load arbitrary code into the kernel.

    CAP_SYS_RAWIO:
      - Direct access to /dev/mem, /dev/kmem
      - Use ioperm(), iopl()
      - Work with IDE raw commands
      Risk: critical. Direct access to physical memory.

    CAP_SYS_TIME:
      - Change system time (settimeofday, adjtimex)
      Risk: medium. Can break authentication (Kerberos, TLS cert validation).

    CAP_SYS_NICE:
      - Raise process priority (nice, setpriority)
      - Change scheduling class (SCHED_FIFO, SCHED_RR)
      Risk: low. DoS by monopolizing CPU.

    CAP_SYS_RESOURCE:
      - Exceed resource limits (ulimit)
      - Use reserved ext2 space
      - Manage queue limits
      Risk: medium.

    CAP_SYS_PACCT:
      - Enable/disable process accounting (acct())
      Risk: low.

    CAP_SYS_TTY_CONFIG:
      - Use vhangup() and configure any TTY
      Risk: low.

    CAP_SYSLOG:
      - Perform privileged syslog operations (klogctl)
      - View kernel addresses in /proc/kallsyms
      Risk: medium. Reading kernel addresses can assist in exploitation.

### Signals and Processes

    CAP_KILL:
      - Send signals to processes owned by other UIDs
      - Bypass UID checks in kill()
      Risk: medium. DoS by killing other users' processes.

    CAP_WAKE_ALARM:
      - Set CLOCK_REALTIME_ALARM and CLOCK_BOOTTIME_ALARM timers
      Risk: low.

### IPC and Memory

    CAP_IPC_LOCK:
      - Lock memory pages in RAM (mlock, mlockall)
      - Use shared memory without limits
      Risk: medium. DoS by exhausting RAM.
      Used by: databases (PostgreSQL, Oracle), HSMs

    CAP_IPC_OWNER:
      - Bypass permission checks on IPC objects (message queues, semaphores)
      Risk: medium.

### Audit

    CAP_AUDIT_CONTROL:
      - Enable/disable kernel audit
      - Modify audit rules
      - Read audit status
      Risk: high. Can hide activity from the audit subsystem.

    CAP_AUDIT_READ:
      - Read the audit log via netlink
      Risk: medium.

    CAP_AUDIT_WRITE:
      - Write records to the kernel audit log
      Risk: low (but can pollute audit logs).

### Other

    CAP_BLOCK_SUSPEND:
      - Block the system from entering suspend
      Risk: low. DoS - system won't sleep.

    CAP_PERFMON:
      - Use perf_event_open() and eBPF for monitoring
      Introduced in Linux 5.8, split from CAP_SYS_ADMIN.
      Risk: medium. Can read kernel data via eBPF.

    CAP_BPF:
      - Load and run eBPF programs
      - Create eBPF maps
      Introduced in Linux 5.8.
      Risk: high. eBPF can read kernel memory and intercept network traffic.

    CAP_CHECKPOINT_RESTORE:
      - Checkpoint and restore processes (CRIU)
      Introduced in Linux 5.9.
      Risk: high. Can read the memory of arbitrary processes.

---

## Tools

### Installation

    # Debian/Ubuntu
    apt install libcap2-bin    # getcap, setcap, capsh

    # RHEL/Fedora
    dnf install libcap          # getcap, setcap
    dnf install libcap-ng-utils # capsh, pscap, filecap, netcap

### getcap and setcap

    # View capabilities on a file
    getcap /usr/bin/ping
    getcap /usr/bin/dumpcap

    # Recursive search for files with capabilities
    getcap -r / 2>/dev/null
    getcap -r /usr/ 2>/dev/null

    # Set a capability on a file
    setcap cap_net_raw+ep /usr/bin/ping
    setcap cap_net_bind_service+ep /usr/local/bin/myserver
    setcap cap_net_admin+ep /usr/sbin/wpa_supplicant

    # Set multiple capabilities at once
    setcap 'cap_net_raw,cap_net_admin+ep' /usr/bin/tcpdump

    # Remove all capabilities from a file
    setcap -r /usr/bin/ping

    # Verify
    getcap /usr/bin/ping

    Flag notation:
      +e  add to effective
      +p  add to permitted
      +i  add to inheritable
      -e  remove from effective
      -p  remove from permitted
      -i  remove from inheritable
      =   exact assignment (clear everything then set only what is listed)

      Examples:
        cap_net_raw+ep     - effective + permitted (most common)
        cap_net_raw+p      - permitted only (app must activate via API)
        cap_net_raw=ep     - same as +ep but explicit clear of the rest
        cap_net_raw+eip    - all three sets

### capsh

    # Show capabilities of the current shell
    capsh --print

    # Decode a hex value from /proc/pid/status
    capsh --decode=0000003fffffffff
    capsh --decode=$(grep CapEff /proc/self/status | cut -f2)

    # Run a command with specific capabilities
    capsh --caps="cap_net_raw+eip" --user=nobody -- -c "ping -c1 8.8.8.8"

    # Run a shell with reduced capabilities
    capsh --drop=cap_net_raw -- -c bash

### pscap and filecap

    # pscap - capabilities of all running processes (from libcap-ng-utils)
    pscap
    pscap -a    # show all, including processes with no capabilities

    # filecap - files with capabilities
    filecap /usr/bin/
    filecap -a    # all files on the system (slow)

    # netcap - capabilities of network-related processes
    netcap

### /proc filesystem

    # Process capabilities in hex
    cat /proc/self/status | grep Cap
    cat /proc/1234/status | grep Cap

    # Decode manually (each bit = one capability)
    # Bit 0 = CAP_CHOWN, bit 13 = CAP_NET_RAW, etc.
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

## Practical Examples

### Web Server on Port 80 Without Root

    # Problem: nginx cannot bind to port 80 without root
    # Solution: cap_net_bind_service

    # Find the nginx binary
    which nginx
    ls -la /usr/sbin/nginx

    # Grant the capability
    setcap cap_net_bind_service+ep /usr/sbin/nginx

    # Verify
    getcap /usr/sbin/nginx
    # /usr/sbin/nginx cap_net_bind_service=ep

    # Now nginx can be started as a regular user
    # Make sure the nginx config has: user www-data;
    systemctl start nginx    # starts without root

    # Same for Node.js
    setcap cap_net_bind_service+ep $(which node)
    node server.js  # listens on :80 without sudo

### ping Without SUID

    # Old approach (insecure - grants full root temporarily):
    ls -la /usr/bin/ping
    # -rwsr-xr-x ... /usr/bin/ping  (SUID bit set)

    # Remove SUID and use capabilities instead
    chmod u-s /usr/bin/ping
    setcap cap_net_raw+ep /usr/bin/ping

    # Verify
    ls -la /usr/bin/ping
    # -rwxr-xr-x ... /usr/bin/ping  (no SUID)
    getcap /usr/bin/ping
    # /usr/bin/ping cap_net_raw=ep

    ping -c 1 8.8.8.8  # works!

### tcpdump Without Root

    # tcpdump needs cap_net_raw and cap_net_admin
    setcap 'cap_net_raw,cap_net_admin+ep' /usr/sbin/tcpdump

    # Now a regular user can:
    tcpdump -i eth0 -n

    # wireshark/dumpcap
    setcap cap_net_raw+ep /usr/bin/dumpcap
    # or add the user to the wireshark group:
    usermod -aG wireshark $USER

### Systemd Service with Capabilities

    # /etc/systemd/system/myapp.service
    [Unit]
    Description=My Application
    After=network.target

    [Service]
    Type=simple
    User=myapp
    Group=myapp
    ExecStart=/opt/myapp/bin/myapp

    # Grant the capabilities the service needs
    AmbientCapabilities=CAP_NET_BIND_SERVICE
    CapabilityBoundingSet=CAP_NET_BIND_SERVICE

    # Additional hardening
    NoNewPrivileges=yes
    PrivateTmp=yes
    ProtectSystem=strict
    ProtectHome=yes

    [Install]
    WantedBy=multi-user.target

    # Apply
    systemctl daemon-reload
    systemctl start myapp

    # Multiple capabilities
    AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_RAW
    CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_NET_RAW

    # Check capabilities of the running service
    systemctl show myapp | grep -i cap
    cat /proc/$(systemctl show myapp -p MainPID | cut -d= -f2)/status | grep Cap

### Python Application with Capabilities

    # Option 1: set on the interpreter (not recommended - affects all Python scripts)
    setcap cap_net_raw+ep /usr/bin/python3

    # Option 2: set on the script directly (does not work)
    # Python scripts are run by the interpreter - xattr on .py files is not supported

    # Option 3: write a small C wrapper binary

    # Option 4: use ambient capabilities via systemd (best approach)
    # In the .service file:
    AmbientCapabilities=CAP_NET_RAW
    CapabilityBoundingSet=CAP_NET_RAW

    # Option 5: use python-prctl or python-cap library
    pip install python-prctl
    # In your code:
    import prctl
    prctl.cap_effective.net_raw = True
    # ... do raw socket work ...
    prctl.cap_effective.net_raw = False  # drop after use

### Dropping Privileges in Code

    # Best practice: acquire capabilities, use them, drop them

    # C example using capng from libcap-ng
    #include <cap-ng.h>

    int main() {
        // Clear all capabilities
        capng_clear(CAPNG_SELECT_BOTH);

        // Add only what is needed
        capng_update(CAPNG_ADD, CAPNG_EFFECTIVE | CAPNG_PERMITTED,
                     CAP_NET_BIND_SERVICE);

        // Apply
        capng_apply(CAPNG_SELECT_BOTH);

        // Switch to an unprivileged user
        setgid(getgrnam("www-data")->gr_gid);
        setuid(getpwnam("www-data")->pw_uid);

        // Drop remaining capabilities
        capng_clear(CAPNG_SELECT_BOTH);
        capng_apply(CAPNG_SELECT_BOTH);

        // Proceed without privileges
        bind(sock, ...);  // capability no longer needed
    }

---

## Capabilities in Containers

### Docker

    # By default Docker gives containers a subset of capabilities:
    # cap_chown, cap_dac_override, cap_fsetid, cap_fowner, cap_mknod,
    # cap_net_raw, cap_setgid, cap_setuid, cap_setfcap, cap_setpcap,
    # cap_net_bind_service, cap_sys_chroot, cap_kill, cap_audit_write

    # Check capabilities of a container
    docker inspect <container> | grep -A 20 CapAdd

    # Drop all capabilities then add only what is needed
    docker run --cap-drop ALL --cap-add NET_BIND_SERVICE nginx

    # Add a specific capability
    docker run --cap-add NET_RAW ubuntu ping 8.8.8.8
    docker run --cap-add SYS_PTRACE ubuntu strace ls

    # Full capability set (insecure, equivalent to root)
    docker run --privileged ubuntu

    # Check capabilities inside a container
    docker run --rm ubuntu cat /proc/self/status | grep Cap
    docker run --cap-drop ALL --cap-add NET_BIND_SERVICE --rm ubuntu \
      cat /proc/self/status | grep Cap

    # Recommended minimum for most containers:
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

    # pod.yaml - securityContext at the container level
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

    # Multiple capabilities
    securityContext:
      capabilities:
        drop:
          - ALL
        add:
          - NET_BIND_SERVICE
          - NET_RAW

    # Prevent privilege escalation
    securityContext:
      allowPrivilegeEscalation: false
      runAsNonRoot: true
      capabilities:
        drop:
          - ALL

    # Check capabilities of a pod
    kubectl exec <pod> -- cat /proc/1/status | grep Cap

### Podman

    # Same syntax as Docker
    podman run --cap-drop ALL --cap-add NET_BIND_SERVICE nginx

    # By default Podman (rootless mode) grants fewer capabilities than Docker

---

## Security and Auditing

### Dangerous Capabilities

    Critical (root equivalent):
      CAP_SYS_ADMIN    - nearly full root
      CAP_SYS_PTRACE   - inject code into any process
      CAP_SYS_MODULE   - load kernel modules
      CAP_SYS_RAWIO    - access to /dev/mem
      CAP_SETUID       - become root (UID 0)
      CAP_SETPCAP      - transfer capabilities to other processes
      CAP_SETFCAP      - give capabilities to any file

    High risk:
      CAP_NET_RAW      - capture and forge packets
      CAP_NET_ADMIN    - full network control
      CAP_DAC_OVERRIDE - read/write any file
      CAP_CHOWN        - take over any file
      CAP_BPF          - read kernel memory via eBPF

    Medium risk:
      CAP_KILL         - kill other users' processes
      CAP_SYS_CHROOT   - chroot escape
      CAP_AUDIT_CONTROL - hide activity from audit

### Finding Processes with Powerful Capabilities

    # List all processes with capabilities (pscap)
    pscap
    pscap -a | grep -v "^$"

    # Find processes with a specific capability
    # CAP_SYS_ADMIN = bit 21 = 0x200000
    for pid in /proc/[0-9]*; do
        eff=$(grep CapEff $pid/status 2>/dev/null | awk '{print $2}')
        if [ -n "$eff" ] && [ $((16#$eff & 0x200000)) -ne 0 ]; then
            echo "PID $(basename $pid): $(cat $pid/comm 2>/dev/null) - CAP_SYS_ADMIN"
        fi
    done

    # Find files with capabilities (for auditing)
    getcap -r / 2>/dev/null | grep -v "^$"

    # Find SUID files (also important to audit)
    find / -perm -4000 -type f 2>/dev/null
    find / -perm -2000 -type f 2>/dev/null

### NoNewPrivileges

    # Prevents a process from gaining new privileges via SUID or capabilities.
    # Important protection: even if a file has capabilities, the process won't receive them.

    # In C code:
    prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);

    # In systemd:
    NoNewPrivileges=yes

    # In Docker:
    docker run --security-opt no-new-privileges nginx

    # In Kubernetes:
    securityContext:
      allowPrivilegeEscalation: false

### Seccomp + Capabilities

    Capabilities and seccomp complement each other:
      - Capabilities control what privileged operations a process can perform
      - Seccomp controls which syscalls a process can make at all

    # Check seccomp status of a process
    cat /proc/self/status | grep Seccomp
    # Seccomp: 0  (0=none, 1=strict, 2=filter)

    # Docker applies both mechanisms simultaneously

### Auditing Capability Changes

    # auditd: log setcap calls
    auditctl -a always,exit -F arch=b64 -S setxattr -k capabilities_change
    auditctl -a always,exit -F arch=b64 -S fsetxattr -k capabilities_change

    # Search the audit log
    ausearch -k capabilities_change

    # Log execve (process execution with capabilities)
    auditctl -a always,exit -F arch=b64 -S execve -k exec_tracking

---

## Common Mistakes and Solutions

    Error: "Operation not permitted" when binding to port 80
    Cause: CAP_NET_BIND_SERVICE is missing
    Fix:
      setcap cap_net_bind_service+ep /path/to/binary
      # or in systemd:
      AmbientCapabilities=CAP_NET_BIND_SERVICE

    Error: setcap does not survive a package upgrade
    Cause: the upgrade replaces the binary, losing the xattr
    Fix:
      # Create a post-install hook or script:
      # /etc/apt/apt.conf.d/99-setcap-hook (Debian/Ubuntu)
      DPkg::Post-Invoke {"setcap cap_net_bind_service+ep /usr/sbin/nginx";};

    Error: capabilities do not work for scripts (Python, Bash)
    Cause: the kernel does not support capabilities on interpreted files
    Fix:
      # Use ambient capabilities via systemd
      # Or write a small C wrapper binary
      # Or use specialized libraries (python-prctl)

    Error: capability is in Permitted but has no effect
    Cause: the capability was not added to Effective
    Fix:
      # Use +ep instead of only +p when calling setcap
      setcap cap_net_raw+ep /binary  # not just +p
      # Or activate it in code via prctl/cap_set_proc

    Error: capabilities are lost after setuid()
    Cause: by default, capabilities are cleared when the UID changes
    Fix:
      # Call before changing the UID:
      prctl(PR_SET_KEEPCAPS, 1);
      setuid(new_uid);
      # Then restore the needed capabilities via cap_set_proc

    Error: a Kubernetes container is missing a needed capability
    Cause: PodSecurityPolicy or SecurityContext is blocking it
    Fix:
      securityContext:
        capabilities:
          add: ["NET_BIND_SERVICE"]

---

## Quick Reference

    Viewing:
      getcap /path/to/binary              - capabilities of a file
      getcap -r /usr/bin/ 2>/dev/null     - recursive search
      capsh --print                       - capabilities of the current process
      capsh --decode=<hex>                - decode a hex value
      cat /proc/<pid>/status | grep Cap   - raw hex capabilities of a process
      pscap                               - capabilities of all running processes

    File management:
      setcap cap_net_raw+ep /bin          - set a capability
      setcap 'cap_net_raw,cap_net_admin+ep' /bin  - set multiple at once
      setcap -r /bin                      - remove all capabilities

    Flags:
      +e  effective (checked by the kernel on syscalls)
      +p  permitted (maximum that can be in effective)
      +i  inheritable (passed through exec)
      =ep set only ep, clear the rest

    Systemd:
      AmbientCapabilities=CAP_NET_BIND_SERVICE   - grant capability to service
      CapabilityBoundingSet=CAP_NET_BIND_SERVICE - restrict the bounding set
      NoNewPrivileges=yes                         - prevent privilege escalation

    Docker:
      --cap-drop ALL                      - remove all capabilities
      --cap-add NET_BIND_SERVICE          - add a specific capability
      --privileged                        - full set (insecure)

    Kubernetes:
      capabilities: {drop: [ALL], add: [NET_BIND_SERVICE]}
      allowPrivilegeEscalation: false

    Commonly used capabilities:
      CAP_NET_BIND_SERVICE  - listen on ports below 1024
      CAP_NET_RAW           - raw sockets (ping, tcpdump)
      CAP_NET_ADMIN         - network configuration, iptables
      CAP_SYS_ADMIN         - everything else (avoid!)
      CAP_SETUID/SETGID     - change user (privilege dropping)
      CAP_DAC_OVERRIDE      - bypass file permissions (avoid!)
      CAP_IPC_LOCK          - mlock (databases, HSMs)
      CAP_SYS_PTRACE        - debugging (gdb, strace)

---

## References

- [man 7 capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html) - full documentation
- [man 8 setcap](https://man7.org/linux/man-pages/man8/setcap.8.html)
- [man 8 getcap](https://man7.org/linux/man-pages/man8/getcap.8.html)
- [man 1 capsh](https://man7.org/linux/man-pages/man1/capsh.1.html)
- [Linux Kernel - capabilities.h](https://github.com/torvalds/linux/blob/master/include/uapi/linux/capability.h)
- [Docker Security - Capabilities](https://docs.docker.com/engine/security/#linux-kernel-capabilities)
- [Kubernetes Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Systemd - Capabilities](https://www.freedesktop.org/software/systemd/man/systemd.exec.html#Capabilities)
- [A Guide to Linux Capabilities (Red Hat)](https://www.redhat.com/en/blog/linux-capabilities-part-0)
- [libcap-ng documentation](https://people.redhat.com/sgrubb/libcap-ng/)
