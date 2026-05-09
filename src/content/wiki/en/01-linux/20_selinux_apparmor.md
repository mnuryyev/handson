---
title: "SELinux and AppArmor - Core Concepts"
date: "2026-05-09"
---

SELinux (Security-Enhanced Linux) and AppArmor are Mandatory Access Control (MAC) systems for Linux. They operate on top of standard Unix permissions (DAC) and restrict what processes and users can do - even when they have root privileges.

The core idea: least-privilege enforcement at the kernel level. Even if a process is compromised, it cannot do more than the policy allows.

---

## Why MAC Systems Exist

Standard Unix permissions (chmod/chown) are DAC (Discretionary Access Control). The file owner decides who gets access. The problem: if a root process is compromised, it gets full access to everything.

    Comparing DAC and MAC:

      DAC (standard Unix):
        - Permissions set by the object owner
        - root can do anything
        - Compromised root process = full system compromise
        - Example: nginx runs as www-data, but www-data can read /etc/shadow

      MAC (SELinux/AppArmor):
        - Permissions enforced by central policy (kernel)
        - Even root is constrained by policy
        - Compromised nginx cannot escape its domain/profile
        - Every process is isolated in its own security context

    Real-world example:
      Without MAC: nginx vulnerability -> attacker gets www-data shell ->
                   reads /etc/passwd, /etc/shadow, ssh keys, DB configs

      With MAC:    nginx vulnerability -> attacker is bound by nginx policy ->
                   can only touch /var/www, /tmp/nginx -> everything else DENIED

---

## SELinux

SELinux was developed by the NSA and Red Hat. It has been integrated into the Linux kernel since 2.6. Enabled by default on RHEL, CentOS, Fedora, AlmaLinux, Rocky Linux.

### Core Concepts

    Subject:
      A process requesting access to a resource.
      Every process in SELinux has a label - a security context.

    Object:
      A file, directory, socket, port, or device being accessed.
      Every object also has a label.

    Policy:
      A set of rules: which subject can access which object and how.
      Stored in the kernel. Loaded at system startup.

    Security Context:
      A label in the form: user:role:type:level
        user  - SELinux user (not the Unix user)
        role  - role (RBAC component)
        type  - type (main element for Type Enforcement policy)
        level - MLS/MCS level (optional)

      Example process context for nginx:
        system_u:system_r:httpd_t:s0

      Example file context:
        system_u:object_r:httpd_sys_content_t:s0

    Type Enforcement (TE):
      The primary SELinux mechanism. Rules look like:
        allow httpd_t httpd_sys_content_t:file { read open getattr };
      = processes of type httpd_t are allowed to read files of type httpd_sys_content_t.

### SELinux Modes

    Enforcing:
      Policy is active and applied.
      Denied actions are blocked and logged.
      Use this on production systems.

    Permissive:
      Policy is active but NOT enforced.
      Denied actions are only logged, not blocked.
      Used for debugging and policy development.

    Disabled:
      SELinux is completely off.
      No labels assigned, no logging.
      Switching from Disabled requires a reboot and full relabeling.

    # Check current mode
    getenforce
    sestatus

    # Temporarily switch to Permissive (no reboot needed)
    setenforce 0        # Permissive
    setenforce 1        # Enforcing

    # Permanent mode - /etc/selinux/config
    SELINUX=enforcing   # enforcing / permissive / disabled
    SELINUXTYPE=targeted

    # Switching to/from disabled requires a reboot

### SELinux Policy Types

    targeted (default):
      Only controls specific "targeted" processes (daemons).
      Everything else runs in unconfined_t (no restrictions).
      Balance of security and compatibility.
      Used on most RHEL/Fedora systems.

    strict:
      All processes are under SELinux control.
      No unconfined_t domain.
      Maximum security, complex to configure.

    mls (Multi-Level Security):
      Adds classification levels (s0-s15, c0-c1023).
      For government and military systems.
      Very complex configuration.

### Viewing Contexts and Status

    # Context of the current process
    id -Z
    # Example: unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023

    # Context of a file or directory
    ls -Z /var/www/html/
    ls -Z /etc/nginx/

    # Context of processes
    ps auxZ | grep nginx
    ps -eZ | grep httpd

    # Context of sockets / ports
    ss -tlnpZ

    # SELinux status
    sestatus
    sestatus -v    # verbose

    # Current mode
    getenforce

    # Active policy
    sestatus | grep "Loaded policy name"

### Managing File Labels

    # Show file type
    ls -Z /etc/nginx/nginx.conf
    # system_u:object_r:httpd_config_t:s0 /etc/nginx/nginx.conf

    # Change file type (temporary, until relabeling)
    chcon -t httpd_sys_content_t /var/www/mysite/index.html

    # Change recursively
    chcon -R -t httpd_sys_content_t /var/www/mysite/

    # Restore default context (from policy)
    restorecon /var/www/html/index.html
    restorecon -R -v /var/www/html/       # recursive with output

    # Set a permanent default context for a path
    semanage fcontext -a -t httpd_sys_content_t "/var/www/mysite(/.*)?"
    restorecon -R -v /var/www/mysite/

    # Show all fcontext rules
    semanage fcontext -l
    semanage fcontext -l | grep httpd

    # Full system relabeling (after policy change or switching from disabled)
    touch /.autorelabel
    reboot
    # On next boot, the system will relabel all files

### Booleans

Booleans are policy toggles that let you change behavior without writing new rules.

    # Show all booleans
    getsebool -a
    semanage boolean -l

    # Check a specific boolean
    getsebool httpd_can_network_connect
    # httpd_can_network_connect --> off

    # Enable (temporary, until reboot)
    setsebool httpd_can_network_connect on

    # Enable permanently (persists after reboot)
    setsebool -P httpd_can_network_connect on

    Commonly used booleans:

      httpd_can_network_connect         - nginx/apache can make outbound connections
      httpd_can_network_connect_db      - apache can connect to databases
      httpd_can_sendmail                - apache can send email
      httpd_execmem                     - apache can use execmem (some modules need this)
      httpd_read_user_content           - apache can read home directories
      ftpd_anon_write                   - anonymous FTP can write files
      samba_enable_home_dirs            - samba can share home directories
      ssh_sysadm_login                  - SSH allows sysadm_r logins
      allow_httpd_anon_write            - apache can write to anon_write directories
      nis_enabled                       - NIS/YP client enabled

    # Find booleans for a specific service
    semanage boolean -l | grep httpd
    semanage boolean -l | grep ftp

### Port Management

SELinux controls which port types can be bound by which process types.

    # Show all SELinux port types
    semanage port -l
    semanage port -l | grep http

    # Allow nginx to listen on a non-standard port (e.g. 8081)
    semanage port -a -t http_port_t -p tcp 8081

    # Modify type of an existing port
    semanage port -m -t http_port_t -p tcp 8081

    # Remove a custom port
    semanage port -d -t http_port_t -p tcp 8081

    Standard port types:
      http_port_t        - 80, 443, 8008, 8009, 8080, 8443
      ssh_port_t         - 22
      smtp_port_t        - 25, 465, 587
      dns_port_t         - 53
      mysql_port_t       - 3306
      postgresql_port_t  - 5432
      redis_port_t       - 6379

### Analyzing Denials and Audit Logs

    # View all SELinux denials
    ausearch -m avc -ts recent
    ausearch -m avc -ts today

    # Denials in journald
    journalctl -t setroubleshoot

    # sealert utility (setroubleshoot package)
    sealert -a /var/log/audit/audit.log

    # Analyze a specific AVC (Access Vector Cache denial)
    ausearch -m avc | audit2why

    # Automatically create a policy module from denials
    ausearch -m avc | audit2allow -M mymodule
    semodule -i mymodule.pp

    # Check generated rules before applying
    ausearch -m avc | audit2allow

    # Example AVC denial in audit.log:
    # type=AVC msg=audit(1234567890.123:456): avc: denied { read }
    # for pid=1234 comm="nginx" name="myfile.conf"
    # scontext=system_u:system_r:httpd_t:s0
    # tcontext=system_u:object_r:admin_home_t:s0 tclass=file permissive=0

    AVC breakdown:
      denied { read }        - the denied action
      comm="nginx"           - the process
      scontext               - source (process) context
      tcontext               - target (file/object) context
      tclass=file            - object class
      permissive=0           - enforcing mode (0=enforcing, 1=permissive)

### Custom Policy Modules

    # Create a module from AVC denials (basic workflow)
    ausearch -m avc -ts recent | audit2allow -M local_policy
    semodule -i local_policy.pp

    # List loaded modules
    semodule -l
    semodule -l | grep local

    # Disable a module
    semodule -d local_policy

    # Enable a module
    semodule -e local_policy

    # Remove a module
    semodule -r local_policy

    # Module priorities (SELinux >= 2.4)
    semodule -l -v                  # show with priorities
    semodule -X 300 -i custom.pp    # install with priority 300

### Common Problems and Solutions

    Problem: nginx cannot read files in /data/www/
    Symptom: 403 Forbidden, AVC denied in audit.log
    Fix:
      ls -Z /data/www/       # check file type
      semanage fcontext -a -t httpd_sys_content_t "/data/www(/.*)?"
      restorecon -R /data/www/

    Problem: nginx cannot connect to backend on 127.0.0.1:8000
    Symptom: Connection refused in logs, AVC denied { name_connect }
    Fix:
      setsebool -P httpd_can_network_connect on
      # or if only to a database:
      setsebool -P httpd_can_network_connect_db on

    Problem: nginx cannot bind to port 8081
    Symptom: bind() failed, AVC denied { name_bind }
    Fix:
      semanage port -a -t http_port_t -p tcp 8081

    Problem: app crashes only when SELinux is enabled
    Debugging approach:
      setenforce 0            # temporarily permissive
      systemctl restart app   # reproduce the problem
      ausearch -m avc -ts recent | audit2allow  # see what is needed
      setenforce 1            # restore enforcing
      ausearch -m avc -ts recent | audit2allow -M app_policy
      semodule -i app_policy.pp

---

## AppArmor

AppArmor was developed by Novell/SUSE. Simpler to configure than SELinux. Enabled by default on Ubuntu, Debian (since Debian 10), openSUSE.

### Core Concepts

    Profile:
      A text file with rules for a specific program.
      Stored in /etc/apparmor.d/
      Rules describe: which files to read/write, network access, capabilities.

    Confinement:
      A process running "inside a profile" is bound by its rules.
      If no profile exists for a process - it runs unrestricted.

    Path-based control:
      Unlike SELinux (labels), AppArmor works with file paths.
      Easier to understand, but AppArmor has no label-based control.

    Profile modes:
      enforce    - rules are applied, violations are blocked and logged
      complain   - rules are not applied, violations are only logged
      unconfined - profile is loaded but not applied (audit disabled)

### Profile Structure

    # /etc/apparmor.d/usr.sbin.nginx - example nginx profile

    #include <tunables/global>

    /usr/sbin/nginx {
      #include <abstractions/base>
      #include <abstractions/nameservice>

      capability setuid,
      capability setgid,
      capability net_bind_service,
      capability dac_override,

      # nginx binary
      /usr/sbin/nginx mr,

      # Config files
      /etc/nginx/ r,
      /etc/nginx/** r,

      # Logs
      /var/log/nginx/ rw,
      /var/log/nginx/** rw,

      # Web content
      /var/www/html/ r,
      /var/www/html/** r,

      # PID file
      /run/nginx.pid rw,

      # Temp files
      /tmp/ rw,
      /tmp/** rw,

      # Network
      network inet tcp,
      network inet6 tcp,
      network inet udp,
    }

    File access modes:
      r    - read
      w    - write
      a    - append
      x    - execute
      m    - mmap (memory mapping)
      k    - lock
      l    - link (create hard links)
      ix   - inherit execute (child process inherits profile)
      Px   - Profile execute (child runs in its own profile)
      Ux   - Unconfined execute (child runs without a profile)
      cx   - Child profile execute

    Path wildcards:
      *    - any characters except /
      **   - any characters including /
      ?    - any single character (except /)

### Managing AppArmor

    # Check status
    aa-status
    apparmor_status
    systemctl status apparmor

    # List all profiles
    aa-status | grep -E "enforce|complain"

    # Load a profile
    apparmor_parser -r /etc/apparmor.d/usr.sbin.nginx

    # Reload all profiles
    systemctl reload apparmor

    # Disable a specific profile (creates a symlink in disable/)
    aa-disable /etc/apparmor.d/usr.sbin.nginx

    # Enable a profile
    aa-enable /etc/apparmor.d/usr.sbin.nginx

    # Switch to complain mode
    aa-complain /usr/sbin/nginx
    aa-complain /etc/apparmor.d/usr.sbin.nginx

    # Switch to enforce mode
    aa-enforce /usr/sbin/nginx
    aa-enforce /etc/apparmor.d/usr.sbin.nginx

    # Unload a profile (without restarting AppArmor)
    apparmor_parser -R /etc/apparmor.d/usr.sbin.nginx

### Creating a Profile from Scratch

    # Install tools
    apt install apparmor-utils apparmor-profiles apparmor-profiles-extra

    # Method 1: generate with aa-genprof (interactive)
    aa-genprof /usr/bin/myapp
    # Runs the app, intercepts access attempts, builds a profile.
    # Uses complain mode to collect data.
    # Prompts you to add rules after testing.

    # Method 2: run in complain mode, analyze logs, add rules
    aa-complain /usr/bin/myapp
    # run the application and exercise it
    # then:
    aa-logprof   # analyzes /var/log/syslog and suggests rules to add
    aa-enforce /usr/bin/myapp

    # Method 3: write manually from a template

### Abstractions

Abstractions are reusable rule sets for common needs.

    # Location
    /etc/apparmor.d/abstractions/

    Commonly used:
      base              - base permissions (/etc/ld.so*, /proc/self/...)
      nameservice       - DNS, NSS (gethostbyname and similar)
      apache2-common    - common rights for Apache modules
      ssl_certs         - reading SSL certificates
      ssl_keys          - reading SSL private keys (use with care)
      user-tmp          - /tmp and /var/tmp for users
      python            - base permissions for Python applications
      php               - base permissions for PHP
      bash              - bash and its libraries
      cups-client       - printing permissions

    # Include in a profile
    #include <abstractions/base>
    #include <abstractions/nameservice>
    #include <abstractions/ssl_certs>

### Tunable Variables

    # /etc/apparmor.d/tunables/
    # Global variables available in profiles

    #include <tunables/global>
    # Provides:
    #   @{HOME}     = /home/*/ /root/
    #   @{PROC}     = /proc/
    #   @{sys}      = /sys/
    #   @{run}      = /run/ /var/run/
    #   @{HOMEDIRS} = /home/

    # Usage in a profile
    @{HOME}/.config/myapp/ r,
    @{HOME}/.config/myapp/** rw,

### Network Rules in AppArmor Profiles

    # Basic network rules
    network,                    # all networks
    network tcp,                # TCP
    network udp,                # UDP
    network inet tcp,           # IPv4 TCP
    network inet6 tcp,          # IPv6 TCP
    network inet stream,        # IPv4 stream (TCP)
    network inet dgram,         # IPv4 datagram (UDP)

    # With specific ports (AppArmor >= 2.8.95 with policy_version 2.8.95)
    # Requires nftables network rules or extended network rules:
    network (bind) tcp port 80,
    network (bind) tcp port 443,
    network (connect) tcp to port 443,

    # Standard setup for nginx:
    network inet tcp,
    network inet6 tcp,
    network inet udp,
    network unix stream,       # unix sockets (FastCGI)

### Capabilities in AppArmor

    # Linux capabilities are controlled inside the profile
    capability net_bind_service,   # listen on ports < 1024
    capability setuid,             # change UID
    capability setgid,             # change GID
    capability dac_override,       # bypass file permissions (use carefully)
    capability chown,              # change file ownership
    capability kill,               # send signals to other processes
    capability sys_ptrace,         # ptrace (debugging)
    capability sys_admin,          # broad admin rights (dangerous)

    # View all capabilities
    man capabilities

### Analyzing AppArmor Denials

    # Violations are written to syslog/journald
    journalctl -k | grep apparmor
    grep "apparmor=" /var/log/syslog | tail -20
    grep "DENIED" /var/log/syslog | tail -20

    # aa-logprof - analyze logs and add rules
    aa-logprof
    # Interactively suggests rules to add based on logs

    # Example log entry:
    # kernel: audit: type=1400 audit(1234567890.123:456):
    # apparmor="DENIED" operation="open" profile="/usr/sbin/nginx"
    # name="/data/secrets/key.pem" pid=1234 comm="nginx"
    # requested_mask="r" denied_mask="r" fsuid=33 ouid=0

    Breakdown:
      apparmor="DENIED"            - action was denied
      profile="/usr/sbin/nginx"    - active profile
      name="/data/secrets/key.pem" - what was accessed
      requested_mask="r"           - requested permission (read)
      denied_mask="r"              - what was specifically denied
      fsuid=33                     - filesystem UID (33 = www-data)

### Practical Example - Python App Profile

    # /etc/apparmor.d/opt.myapp.venv.bin.gunicorn

    #include <tunables/global>

    /opt/myapp/venv/bin/gunicorn {
      #include <abstractions/base>
      #include <abstractions/nameservice>
      #include <abstractions/python>
      #include <abstractions/ssl_certs>

      capability net_bind_service,
      capability setuid,
      capability setgid,

      # Python venv and app source
      /opt/myapp/ r,
      /opt/myapp/** r,
      /opt/myapp/venv/bin/gunicorn mr,
      /opt/myapp/venv/bin/python3* ix,

      # App temp files
      /tmp/myapp/ rw,
      /tmp/myapp/** rw,

      # Logs
      /var/log/myapp/ rw,
      /var/log/myapp/*.log rw,

      # Unix socket (for nginx upstream)
      /run/myapp.sock rw,

      # Read env file with secrets
      /opt/myapp/.env r,

      # Explicitly deny access to sensitive data
      deny /etc/shadow r,
      deny /root/ r,
      deny /home/ r,

      # Network
      network inet tcp,
      network inet6 tcp,
      network unix stream,

      # /proc needed by Python
      @{PROC}/@{pid}/mounts r,
      @{PROC}/@{pid}/status r,
    }

    # Load the profile
    apparmor_parser -r /etc/apparmor.d/opt.myapp.venv.bin.gunicorn
    aa-enforce /opt/myapp/venv/bin/gunicorn

---

## SELinux vs AppArmor - Comparison

    Architecture:
      SELinux   - labels on all objects, Type Enforcement
      AppArmor  - file paths, no labels

    Complexity:
      SELinux   - high. You need to understand contexts, types, policies, modules
      AppArmor  - low. Profiles read like plain text

    Flexibility:
      SELinux   - high. Controls renames, hard links, tmpfs, and more
      AppArmor  - lower. Path-based approach has limitations

    Distributions:
      SELinux   - RHEL, CentOS, AlmaLinux, Rocky, Fedora, Android
      AppArmor  - Ubuntu, Debian, openSUSE, Kali

    Tools:
      SELinux   - semanage, setsebool, restorecon, audit2allow, sealert
      AppArmor  - aa-status, aa-genprof, aa-logprof, aa-enforce, aa-complain

    Logs:
      SELinux   - /var/log/audit/audit.log (AVC denials)
      AppArmor  - /var/log/syslog, journald (apparmor="DENIED")

    When to choose:
      SELinux   - production RHEL/CentOS systems, maximum security
      AppArmor  - Ubuntu environments, containers, when simplicity matters

---

## Container Integration

### SELinux with Docker/Podman

    # Docker automatically uses the svirt_lxc_net_t type for containers
    # Containers are isolated via MCS (Multi-Category Security)

    # Check the context of a running container
    docker inspect --format '{{.HostConfig.SecurityOpt}}' <container>
    ps -eZ | grep container

    # Run a container with a custom SELinux type
    docker run --security-opt label=type:container_runtime_t nginx

    # Disable SELinux for a specific container (not recommended)
    docker run --security-opt label=disable nginx

    # Mount a volume with the correct context
    docker run -v /mydata:/data:Z nginx  # :Z = relabel for a private volume
    docker run -v /mydata:/data:z nginx  # :z = relabel for a shared volume

    # Podman works the same way
    podman run -v /mydata:/data:Z nginx

### AppArmor with Docker

    # Docker creates a docker-default profile for all containers
    cat /etc/apparmor.d/docker-default

    # Run a container with a custom profile
    docker run --security-opt apparmor=my_profile nginx

    # Run without AppArmor (not recommended)
    docker run --security-opt apparmor=unconfined nginx

    # Check the AppArmor profile for a container
    aa-status | grep docker

### Kubernetes and MAC

    # SELinux in Kubernetes - via securityContext
    # pod.yaml:
    spec:
      securityContext:
        seLinuxOptions:
          level: "s0:c123,c456"
          type: "container_t"

    # AppArmor in Kubernetes - via annotations (deprecated in K8s 1.30+)
    # New way via securityContext:
    spec:
      containers:
      - name: myapp
        securityContext:
          appArmorProfile:
            type: Localhost
            localhostProfile: my-profile

---

## Quick Diagnostics

    SELinux:
      getenforce                              - current mode
      sestatus                                - full status
      ausearch -m avc -ts recent              - recent denials
      ausearch -m avc -ts today | audit2why   - explanation of denials
      ls -Z <path>                            - file context
      ps -eZ | grep <proc>                    - process context
      semanage port -l | grep <port>          - port type
      getsebool -a | grep <name>              - booleans

    AppArmor:
      aa-status                               - status of all profiles
      journalctl -k | grep apparmor           - all AppArmor events
      grep DENIED /var/log/syslog             - denials
      aa-logprof                              - analyze and add rules

---

## SELinux Quick Reference

    Status and mode:
      getenforce                              - current mode
      sestatus                                - full status
      setenforce 0                            - permissive (temporary)
      setenforce 1                            - enforcing (temporary)

    Contexts:
      ls -Z <path>                            - file context
      ps -eZ                                  - process contexts
      id -Z                                   - current user context
      chcon -t <type> <file>                  - change file type
      restorecon -R <path>                    - restore context
      semanage fcontext -a -t <type> "<path>(/.*)?"  - set permanent context

    Booleans:
      getsebool -a                            - all booleans
      getsebool <name>                        - specific boolean
      setsebool -P <name> on/off              - change permanently

    Ports:
      semanage port -l                        - all port types
      semanage port -a -t <type> -p tcp <port>  - add a port

    Audit:
      ausearch -m avc -ts recent              - recent AVCs
      ausearch -m avc | audit2why             - explanation
      ausearch -m avc | audit2allow -M <name> - create a module
      semodule -i <name>.pp                   - install module
      semodule -l                             - list modules

---

## AppArmor Quick Reference

    Status:
      aa-status                               - state of all profiles
      systemctl status apparmor               - AppArmor service

    Profiles:
      aa-enforce /path/to/bin                 - set to enforce mode
      aa-complain /path/to/bin                - set to complain mode
      aa-disable /etc/apparmor.d/profile      - disable a profile
      apparmor_parser -r /etc/apparmor.d/profile  - load/reload profile

    Profile development:
      aa-genprof /path/to/bin                 - create profile interactively
      aa-logprof                              - add rules from logs

    Logs:
      journalctl -k | grep apparmor           - kernel events
      grep apparmor /var/log/syslog           - in syslog

    Access modes in profiles:
      r - read, w - write, a - append, x - execute
      m - mmap, k - lock, l - link
      ix - inherit execute (child uses same profile)
      Px - child gets its own profile
      Ux - child runs unconfined

---

## References

- [SELinux User's and Administrator's Guide (Red Hat)](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/using_selinux/index)
- [SELinux Project Wiki](https://selinuxproject.org/page/Main_Page)
- [man semanage](https://linux.die.net/man/8/semanage)
- [man audit2allow](https://linux.die.net/man/1/audit2allow)
- [AppArmor Wiki (Ubuntu)](https://wiki.ubuntu.com/AppArmor)
- [AppArmor Documentation](https://gitlab.com/apparmor/apparmor/-/wikis/Documentation)
- [Arch Wiki - SELinux](https://wiki.archlinux.org/title/SELinux)
- [Arch Wiki - AppArmor](https://wiki.archlinux.org/title/AppArmor)
- [Docker Security - AppArmor](https://docs.docker.com/engine/security/apparmor/)
- [Docker Security - SELinux](https://docs.docker.com/engine/security/protect-access/)
