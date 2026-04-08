---
title: "Package Managers (apt, yum/dnf, pacman)"
date: "2026-04-08"
---

A package manager is a tool for installing, upgrading, removing, and managing software on Linux. Each distribution uses its own package manager and package format.

---

## Ecosystem Overview

| Distribution | Format | Low-level | High-level |
|-------------|--------|-----------|------------|
| Debian, Ubuntu, Mint | `.deb` | `dpkg` | `apt`, `apt-get` |
| RHEL, CentOS, Fedora | `.rpm` | `rpm` | `yum`, `dnf` |
| Arch, Manjaro, EndeavourOS | `.pkg.tar.zst` | `pacman` | `yay`, `paru` (AUR) |
| openSUSE | `.rpm` | `rpm` | `zypper` |
| Alpine | `.apk` | `apk` | `apk` |
| Gentoo | source | `portage` | `emerge` |

```
User
 │
 ▼
apt / dnf / pacman       ← high level (dependencies, repositories)
 │
 ▼
dpkg / rpm / pacman      ← low level (package installation)
 │
 ▼
.deb / .rpm / .pkg       ← package files
```

---

## apt - Debian / Ubuntu

`apt` is a modern interface combining `apt-get` and `apt-cache`. Recommended for interactive use.

### Core commands

```bash
# Update the package list from repositories
apt update

# Upgrade all installed packages
apt upgrade

# Upgrade with removal of obsolete dependencies
apt full-upgrade
apt dist-upgrade          # synonym (older)

# Install a package
apt install nginx
apt install nginx curl git # multiple at once
apt install nginx=1.24.0-1 # specific version

# Reinstall a package
apt reinstall nginx

# Remove a package (keep config files)
apt remove nginx

# Remove a package and its config files
apt purge nginx

# Remove unused dependencies
apt autoremove
apt autoremove --purge    # including config files

# Clean downloaded package cache
apt clean                 # everything
apt autoclean             # only outdated packages

# Search for a package
apt search nginx
apt search "web server"

# Package information
apt show nginx

# List installed packages
apt list --installed
apt list --installed | grep nginx

# Packages with available upgrades
apt list --upgradable
```

### Non-interactive mode (for scripts)

```bash
# -y - automatically answer "yes"
apt install -y nginx

# Suppress progress output
apt install -y -q nginx
DEBIAN_FRONTEND=noninteractive apt install -y nginx

# Dry run - preview what would happen
apt install -s nginx
apt install --simulate nginx

# Download without installing
apt download nginx

# Only upgrade a specific package
apt install --only-upgrade nginx
```

### apt-cache — package information

```bash
apt-cache search nginx           # search
apt-cache show nginx             # detailed info
apt-cache showpkg nginx          # dependencies and reverse deps
apt-cache depends nginx          # direct dependencies
apt-cache rdepends nginx         # reverse dependencies (who depends on nginx)
apt-cache policy nginx           # installed and available versions
apt-cache madison nginx          # all versions by source
```

### Repositories

```bash
# Configuration files
/etc/apt/sources.list             # main file
/etc/apt/sources.list.d/          # drop-in repository files

# Format of a sources.list line:
# deb [options] uri distribution component1 component2
deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb-src http://archive.ubuntu.com/ubuntu jammy main  # source packages

# Add a repository (modern way)
add-apt-repository ppa:nginx/stable
add-apt-repository "deb http://repo.example.com/ubuntu jammy main"

# Add manually
cat > /etc/apt/sources.list.d/nginx.list << 'EOF'
deb http://nginx.org/packages/ubuntu jammy nginx
EOF

# Repository signing keys (modern way — /etc/apt/keyrings/)
curl -fsSL https://nginx.org/keys/nginx_signing.key \
    | gpg --dearmor \
    | sudo tee /etc/apt/keyrings/nginx.gpg > /dev/null

# Attach repository with key
cat > /etc/apt/sources.list.d/nginx.list << 'EOF'
deb [signed-by=/etc/apt/keyrings/nginx.gpg] http://nginx.org/packages/ubuntu jammy nginx
EOF

apt update

# Legacy way (apt-key — deprecated since Ubuntu 22.04+)
curl -fsSL https://example.com/key.gpg | apt-key add -

# Remove a repository
add-apt-repository --remove ppa:nginx/stable
rm /etc/apt/sources.list.d/nginx.list
apt update
```

### dpkg - low-level operations

```bash
# Install a .deb file
dpkg -i package.deb

# Fix broken dependencies after dpkg -i
apt install -f

# Remove a package
dpkg -r nginx

# Remove with config files
dpkg -P nginx

# List installed packages
dpkg -l
dpkg -l | grep nginx
dpkg -l | grep "^ii"            # only installed (ii = installed)

# Package information
dpkg -s nginx                   # status
dpkg -L nginx                   # list files in package
dpkg -S /usr/sbin/nginx         # which package owns this file

# Unpack without installing
dpkg -x package.deb /tmp/extract/

# Inspect a .deb file
dpkg --contents package.deb
ar t package.deb                # archive structure
```

---

## yum / dnf — RHEL / CentOS / Fedora

`dnf` (Dandified YUM) is the modern replacement for `yum`. RHEL/CentOS 8+ and Fedora use `dnf`. Older systems use `yum`. The syntax is nearly identical.

### Core commands

```bash
# Check for available updates (auto-fetched during install)
dnf check-update
yum check-update

# Install a package
dnf install nginx
dnf install nginx curl git
dnf install nginx-1.24.0         # specific version

# Upgrade
dnf update                       # all packages
dnf update nginx                 # specific package
dnf upgrade                      # synonym for update

# Remove a package
dnf remove nginx
dnf erase nginx                  # synonym

# Remove orphaned dependencies
dnf autoremove

# Search
dnf search nginx
dnf search all nginx             # search descriptions too

# Information
dnf info nginx
dnf list installed               # installed packages
dnf list available               # available packages
dnf list all nginx               # all versions of nginx

# Which package provides a file
dnf provides /usr/sbin/nginx
dnf provides "*/nginx"

# Transaction history
dnf history
dnf history info 5               # details of transaction #5
dnf history undo 5               # undo transaction
dnf history redo 5               # redo transaction

# Clean cache
dnf clean all
dnf clean packages
dnf clean metadata
```

### Package groups

```bash
# List groups
dnf group list
dnf group list hidden            # including hidden groups

# Group information
dnf group info "Development Tools"

# Install a group
dnf group install "Development Tools"
dnf groupinstall "Development Tools"  # synonym

# Remove a group
dnf group remove "Development Tools"
```

### dnf repositories

```bash
# List repositories
dnf repolist
dnf repolist all                 # including disabled
dnf repolist enabled
dnf repolist disabled

# Repository details
dnf repoinfo baseos

# Enable / disable a repository
dnf config-manager --enable epel
dnf config-manager --disable epel

# Install from a specific repository
dnf install --repo=epel nginx

# Add EPEL (Extra Packages for Enterprise Linux)
dnf install epel-release         # RHEL/CentOS
# or
dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm

# Add a repository manually
cat > /etc/yum.repos.d/nginx.repo << 'EOF'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
EOF

dnf update

# Repository directory
ls /etc/yum.repos.d/
```

### rpm - low-level operations

```bash
# Install an .rpm file
rpm -ivh package.rpm             # i=install, v=verbose, h=progress

# Upgrade
rpm -Uvh package.rpm             # U=upgrade

# Remove
rpm -e nginx

# List installed packages
rpm -qa                          # all packages
rpm -qa | grep nginx
rpm -qi nginx                    # package information
rpm -ql nginx                    # package files
rpm -qf /usr/sbin/nginx         # which package owns this file
rpm -qR nginx                    # dependencies

# Verify integrity
rpm -V nginx                     # compare against database
rpm --checksig package.rpm       # verify signature

# Inspect without installing
rpm -qpl package.rpm             # list files
rpm -qpi package.rpm             # information
```

---

## pacman - Arch Linux

`pacman` is the package manager for Arch Linux and derivatives (Manjaro, EndeavourOS). Fast, straightforward, with excellent documentation.

### Core commands

```bash
# Sync databases and upgrade the entire system
pacman -Syu

# Sync databases only
pacman -Sy

# Upgrade packages only (without syncing — not recommended!)
pacman -Su

# Install a package
pacman -S nginx
pacman -S nginx curl git

# Install from a file
pacman -U package.pkg.tar.zst

# Remove a package
pacman -R nginx                  # package only

# Remove package + unneeded dependencies
pacman -Rs nginx

# Remove package + dependencies + config files
pacman -Rns nginx

# Search repositories
pacman -Ss nginx
pacman -Ss "web server"

# Package information (in repository)
pacman -Si nginx

# List installed packages
pacman -Q
pacman -Ql nginx                 # files in package
pacman -Qi nginx                 # info about installed package

# Search installed packages
pacman -Qs nginx

# Which package owns a file
pacman -Qo /usr/sbin/nginx

# Orphaned packages (nothing depends on them)
pacman -Qdt

# Explicitly installed packages (not as dependencies)
pacman -Qe

# Clean cache (keep 3 most recent versions)
paccache -r

# Clean all cache
pacman -Sc                       # outdated only
pacman -Scc                      # everything
```

### AUR - Arch User Repository

AUR contains community-maintained packages. They can't be installed directly with `pacman` - you need an AUR helper.

```bash
# yay - the most popular AUR helper
# Install yay
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si

# yay - same syntax as pacman + AUR support
yay -S package-from-aur
yay -Syu                         # upgrade everything including AUR
yay -Ss keyword                  # search AUR and official repos
yay -Si package                  # package information

# paru - alternative to yay (written in Rust)
paru -S package
paru -Syu

# Manual AUR install
git clone https://aur.archlinux.org/package.git
cd package
cat PKGBUILD                     # ALWAYS read this before installing!
makepkg -si                      # build and install
```

### pacman.conf

```bash
# Main config file
cat /etc/pacman.conf

# Key sections:
# [options]
# HoldPkg     = pacman glibc   # never remove these
# Color                         # colored output
# VerbosePkgLists               # verbose package lists
# ParallelDownloads = 5         # parallel downloads

# [core]   - core system packages
# [extra]  - additional packages
# [multilib] - 32-bit libraries

# Enable multilib (for 32-bit apps, Steam)
# Uncomment in /etc/pacman.conf:
# [multilib]
# Include = /etc/pacman.d/mirrorlist

pacman -Sy    # sync after changing conf
```

### Mirrorlist

```bash
# Mirror list file
cat /etc/pacman.d/mirrorlist

# Install reflector to optimize mirrors
pacman -S reflector

# Automatically pick the best mirrors
reflector --country Germany,Netherlands --sort rate --save /etc/pacman.d/mirrorlist

# With more options
reflector \
    --latest 20 \
    --country "Germany,Netherlands,France" \
    --protocol https \
    --sort rate \
    --save /etc/pacman.d/mirrorlist
```

---

## snap - Universal Packages

Snap is a self-contained package format from Canonical. Runs on most distributions.

```bash
# Install snapd
apt install snapd                # Ubuntu (usually pre-installed)
dnf install snapd                # Fedora

# Core commands
snap find nginx                  # search
snap info nginx                  # information
snap install nginx               # install (stable channel)
snap install nginx --channel=edge  # edge channel
snap install code --classic      # classic mode (no sandbox)

snap list                        # installed snaps
snap refresh                     # update all
snap refresh nginx               # update specific
snap remove nginx                # remove

# Snap services
snap services
snap start nginx
snap stop nginx
```

---

## flatpak - Universal Packages (Desktop)

Flatpak is an application delivery system with sandboxing. Popular for desktop apps.

```bash
# Install
apt install flatpak              # Debian/Ubuntu
dnf install flatpak              # Fedora (usually pre-installed)

# Add Flathub repository
flatpak remote-add --if-not-exists flathub \
    https://dl.flathub.org/repo/flathub.flatpakrepo

# Core commands
flatpak search firefox           # search
flatpak install flathub org.mozilla.firefox  # install
flatpak run org.mozilla.firefox  # run

flatpak list                     # installed
flatpak update                   # update all
flatpak update org.mozilla.firefox  # update specific
flatpak uninstall org.mozilla.firefox  # remove

flatpak info org.mozilla.firefox # information
flatpak remotes                  # list sources
```

---

## Cross-Distribution Patterns

### Detect package manager in a script

```bash
detect_pm() {
    if command -v apt &>/dev/null; then
        echo "apt"
    elif command -v dnf &>/dev/null; then
        echo "dnf"
    elif command -v yum &>/dev/null; then
        echo "yum"
    elif command -v pacman &>/dev/null; then
        echo "pacman"
    elif command -v zypper &>/dev/null; then
        echo "zypper"
    elif command -v apk &>/dev/null; then
        echo "apk"
    else
        echo "unknown"
    fi
}

install_package() {
    local pkg="$1"
    case $(detect_pm) in
        apt)    apt install -y "$pkg" ;;
        dnf)    dnf install -y "$pkg" ;;
        yum)    yum install -y "$pkg" ;;
        pacman) pacman -S --noconfirm "$pkg" ;;
        zypper) zypper install -y "$pkg" ;;
        apk)    apk add "$pkg" ;;
        *)      echo "Unknown package manager" >&2; return 1 ;;
    esac
}
```

### Docker / CI - non-interactive installation

```bash
# Debian/Ubuntu
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt install -y --no-install-recommends \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# RHEL/CentOS
RUN dnf install -y nginx curl \
    && dnf clean all

# Alpine (minimal image)
RUN apk add --no-cache nginx curl
```

---

## Useful One-liners

```bash
# apt
apt list --installed 2>/dev/null | wc -l          # package count
dpkg -l | awk '/^ii/ {print $2}' > packages.txt   # export list
apt install $(cat packages.txt | tr '\n' ' ')       # import list

# dnf
dnf list installed | wc -l
rpm -qa --qf "%{NAME}\n" | sort > packages.txt
dnf install $(cat packages.txt)

# pacman
pacman -Q | wc -l
pacman -Qqe > packages.txt                         # explicitly installed
pacman -S --needed $(cat packages.txt)             # restore
pacman -Qdt                                        # orphaned packages
pacman -Rns $(pacman -Qdtq)                       # remove orphans

# Find which package provides a command
apt-file search nginx           # Debian (requires apt-file)
dpkg -S $(which nginx)
rpm -qf $(which nginx)          # RHEL
pacman -Qo $(which nginx)       # Arch
```

---

## Comparison Cheat Sheet

| Task | apt | dnf | pacman |
|------|-----|-----|--------|
| Update package DB | `apt update` | `dnf check-update` | `pacman -Sy` |
| Upgrade all | `apt upgrade` | `dnf upgrade` | `pacman -Su` |
| Update DB + upgrade | `apt update && apt upgrade` | `dnf upgrade` | `pacman -Syu` |
| Install | `apt install pkg` | `dnf install pkg` | `pacman -S pkg` |
| Remove | `apt remove pkg` | `dnf remove pkg` | `pacman -R pkg` |
| Remove + configs | `apt purge pkg` | — | `pacman -Rn pkg` |
| Remove + deps | `apt autoremove` | `dnf autoremove` | `pacman -Rs pkg` |
| Search | `apt search` | `dnf search` | `pacman -Ss` |
| Info | `apt show pkg` | `dnf info pkg` | `pacman -Si pkg` |
| List files | `dpkg -L pkg` | `rpm -ql pkg` | `pacman -Ql pkg` |
| File owner | `dpkg -S /path` | `rpm -qf /path` | `pacman -Qo /path` |
| List installed | `dpkg -l` | `rpm -qa` | `pacman -Q` |
| Clean cache | `apt clean` | `dnf clean all` | `pacman -Scc` |

---

## References

- [apt man page](https://man7.org/linux/man-pages/man8/apt.8.html) - `man apt`
- [dnf documentation](https://dnf.readthedocs.io/) - DNF docs
- [pacman wiki](https://wiki.archlinux.org/title/Pacman) - Arch Wiki (excellent reference)
- [AUR](https://aur.archlinux.org/) - Arch User Repository
