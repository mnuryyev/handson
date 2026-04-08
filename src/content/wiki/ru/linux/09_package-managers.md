---
title: "Пакетные менеджеры (apt, yum/dnf, pacman)"
date: "2026-04-08"
---

Пакетный менеджер - инструмент для установки, обновления, удаления и управления программным обеспечением в Linux. Каждый дистрибутив использует свой пакетный менеджер и формат пакетов.

---

## Обзор экосистем

| Дистрибутив | Формат | Низкий уровень | Высокий уровень |
|------------|--------|----------------|-----------------|
| Debian, Ubuntu, Mint | `.deb` | `dpkg` | `apt`, `apt-get` |
| RHEL, CentOS, Fedora | `.rpm` | `rpm` | `yum`, `dnf` |
| Arch, Manjaro, EndeavourOS | `.pkg.tar.zst` | `pacman` | `yay`, `paru` (AUR) |
| openSUSE | `.rpm` | `rpm` | `zypper` |
| Alpine | `.apk` | `apk` | `apk` |
| Gentoo | исходники | `portage` | `emerge` |

```
Пользователь
     │
     ▼
  apt / dnf / pacman       ← высокий уровень (зависимости, репозитории)
     │
     ▼
  dpkg / rpm / pacman      ← низкий уровень (установка пакетов)
     │
     ▼
  .deb / .rpm / .pkg       ← файлы пакетов
```

---

## apt - Debian / Ubuntu

`apt` - современный интерфейс, объединяющий `apt-get` и `apt-cache`. Рекомендуется для интерактивного использования.

### Основные команды

```bash
# Обновить список пакетов из репозиториев
apt update

# Обновить все установленные пакеты
apt upgrade

# Обновить с удалением устаревших зависимостей
apt full-upgrade
apt dist-upgrade          # синоним (устаревший)

# Установить пакет
apt install nginx
apt install nginx curl git # несколько сразу
apt install nginx=1.24.0-1 # конкретная версия

# Переустановить пакет
apt reinstall nginx

# Удалить пакет (сохранить конфиги)
apt remove nginx

# Удалить пакет вместе с конфигами
apt purge nginx

# Удалить ненужные зависимости
apt autoremove
apt autoremove --purge    # с конфигами

# Очистить кэш скачанных пакетов
apt clean                 # всё
apt autoclean             # только устаревшие пакеты

# Поиск пакета
apt search nginx
apt search "web server"

# Информация о пакете
apt show nginx

# Список установленных пакетов
apt list --installed
apt list --installed | grep nginx

# Обновляемые пакеты
apt list --upgradable
```

### Неинтерактивный режим (для скриптов)

```bash
# -y - автоматически отвечать "yes"
apt install -y nginx

# Без вывода прогресса
apt install -y -q nginx
DEBIAN_FRONTEND=noninteractive apt install -y nginx

# Dry run — посмотреть что будет сделано
apt install -s nginx
apt install --simulate nginx

# Скачать без установки
apt download nginx

# Только обновить конкретный пакет
apt install --only-upgrade nginx
```

### apt-cache - информация о пакетах

```bash
apt-cache search nginx           # поиск
apt-cache show nginx             # подробная информация
apt-cache showpkg nginx          # зависимости и кто зависит
apt-cache depends nginx          # прямые зависимости
apt-cache rdepends nginx         # обратные зависимости (кто зависит от nginx)
apt-cache policy nginx           # установленная и доступная версия
apt-cache madison nginx          # все доступные версии по источникам
```

### Репозитории

```bash
# Файлы конфигурации
/etc/apt/sources.list             # основной файл
/etc/apt/sources.list.d/          # дополнительные репозитории

# Формат строки в sources.list
# deb [options] uri distribution component1 component2
deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb-src http://archive.ubuntu.com/ubuntu jammy main  # исходники

# Добавить репозиторий (современный способ)
add-apt-repository ppa:nginx/stable
add-apt-repository "deb http://repo.example.com/ubuntu jammy main"

# Добавить вручную
cat > /etc/apt/sources.list.d/nginx.list << 'EOF'
deb http://nginx.org/packages/ubuntu jammy nginx
EOF

# Ключи репозиториев (современный способ — /etc/apt/keyrings/)
curl -fsSL https://nginx.org/keys/nginx_signing.key \
    | gpg --dearmor \
    | sudo tee /etc/apt/keyrings/nginx.gpg > /dev/null

# Подключить репозиторий с ключом
cat > /etc/apt/sources.list.d/nginx.list << 'EOF'
deb [signed-by=/etc/apt/keyrings/nginx.gpg] http://nginx.org/packages/ubuntu jammy nginx
EOF

apt update

# Устаревший способ (apt-key — не рекомендуется с Ubuntu 22.04+)
curl -fsSL https://example.com/key.gpg | apt-key add -

# Удалить репозиторий
add-apt-repository --remove ppa:nginx/stable
rm /etc/apt/sources.list.d/nginx.list
apt update
```

### dpkg — низкоуровневые операции

```bash
# Установить .deb файл
dpkg -i package.deb

# После dpkg -i - исправить зависимости
apt install -f

# Удалить пакет
dpkg -r nginx

# Удалить с конфигами
dpkg -P nginx

# Список установленных пакетов
dpkg -l
dpkg -l | grep nginx
dpkg -l | grep "^ii"            # только установленные (ii = installed)

# Информация о пакете
dpkg -s nginx                   # статус
dpkg -L nginx                   # список файлов пакета
dpkg -S /usr/sbin/nginx         # какому пакету принадлежит файл

# Распаковать без установки
dpkg -x package.deb /tmp/extract/

# Просмотр содержимого .deb
dpkg --contents package.deb
ar t package.deb                # структура архива
```

---

## yum / dnf - RHEL / CentOS / Fedora

`dnf` (Dandified YUM) - современная замена `yum`. В RHEL/CentOS 8+ и Fedora используется `dnf`. В старых системах - `yum`. Синтаксис практически идентичен.

### Основные команды

```bash
# Обновить метаданные (автоматически при install)
dnf check-update
yum check-update

# Установить пакет
dnf install nginx
dnf install nginx curl git
dnf install nginx-1.24.0         # конкретная версия

# Обновить
dnf update                       # все пакеты
dnf update nginx                 # конкретный пакет
dnf upgrade                      # синоним update

# Удалить пакет
dnf remove nginx
dnf erase nginx                  # синоним

# Удалить пакет и сиротские зависимости
dnf remove nginx
dnf autoremove                   # отдельно убрать ненужные

# Поиск
dnf search nginx
dnf search all nginx             # поиск в описаниях тоже

# Информация
dnf info nginx
dnf list installed               # установленные
dnf list available               # доступные
dnf list all nginx               # все версии nginx

# Какой пакет предоставляет файл
dnf provides /usr/sbin/nginx
dnf provides "*/nginx"

# История
dnf history
dnf history info 5               # подробности транзакции №5
dnf history undo 5               # отменить транзакцию
dnf history redo 5               # повторить

# Очистить кэш
dnf clean all
dnf clean packages
dnf clean metadata
```

### Группы пакетов

```bash
# Список групп
dnf group list
dnf group list hidden            # включая скрытые

# Информация о группе
dnf group info "Development Tools"

# Установить группу
dnf group install "Development Tools"
dnf groupinstall "Development Tools"  # синоним

# Удалить группу
dnf group remove "Development Tools"
```

### Репозитории dnf

```bash
# Список репозиториев
dnf repolist
dnf repolist all                 # включая отключённые
dnf repolist enabled
dnf repolist disabled

# Информация о репозитории
dnf repoinfo baseos

# Включить/отключить репозиторий
dnf config-manager --enable epel
dnf config-manager --disable epel

# Установить из конкретного репозитория
dnf install --repo=epel nginx

# Добавить репозиторий EPEL (Extra Packages for Enterprise Linux)
dnf install epel-release         # RHEL/CentOS
# или
dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm

# Добавить репозиторий вручную
cat > /etc/yum.repos.d/nginx.repo << 'EOF'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
EOF

dnf update

# Директория с репозиториями
ls /etc/yum.repos.d/
```

### rpm - низкоуровневые операции

```bash
# Установить .rpm файл
rpm -ivh package.rpm             # i=install, v=verbose, h=progress

# Обновить
rpm -Uvh package.rpm             # U=upgrade

# Удалить
rpm -e nginx

# Список установленных
rpm -qa                          # все пакеты
rpm -qa | grep nginx
rpm -qi nginx                    # информация о пакете
rpm -ql nginx                    # файлы пакета
rpm -qf /usr/sbin/nginx         # какому пакету принадлежит файл
rpm -qR nginx                    # зависимости

# Проверить целостность
rpm -V nginx                     # сравнить с базой
rpm --checksig package.rpm       # проверить подпись

# Просмотреть содержимое без установки
rpm -qpl package.rpm             # список файлов
rpm -qpi package.rpm             # информация
```

---

## pacman - Arch Linux

`pacman` - пакетный менеджер Arch Linux и производных (Manjaro, EndeavourOS). Быстрый, простой, с отличной документацией.

### Основные команды

```bash
# Синхронизировать базы данных и обновить всю систему
pacman -Syu

# Только обновить базы данных
pacman -Sy

# Только обновить пакеты (без обновления БД — не рекомендуется!)
pacman -Su

# Установить пакет
pacman -S nginx
pacman -S nginx curl git

# Установить из файла
pacman -U package.pkg.tar.zst

# Удалить пакет
pacman -R nginx                  # только пакет

# Удалить пакет с зависимостями (которые не нужны другим)
pacman -Rs nginx

# Удалить пакет, зависимости и конфиги
pacman -Rns nginx

# Поиск в репозиториях
pacman -Ss nginx
pacman -Ss "web server"

# Информация о пакете в репозитории
pacman -Si nginx

# Список установленных пакетов
pacman -Q
pacman -Ql nginx                 # файлы пакета
pacman -Qi nginx                 # информация об установленном

# Поиск среди установленных
pacman -Qs nginx

# Какому пакету принадлежит файл
pacman -Qo /usr/sbin/nginx

# Осиротевшие пакеты (нет зависящих)
pacman -Qdt

# Явно установленные пакеты (не как зависимости)
pacman -Qe

# Очистить кэш (оставить 3 последние версии)
paccache -r

# Очистить весь кэш
pacman -Sc                       # только устаревшие
pacman -Scc                      # всё
```

### AUR - Arch User Repository

AUR содержит пакеты, созданные сообществом. Нельзя установить через `pacman` напрямую - нужны AUR helpers.

```bash
# AUR helpers - yay (наиболее популярный)
# Установка yay
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si

# yay - синтаксис как у pacman + AUR
yay -S package-from-aur
yay -Syu                         # обновить всё включая AUR
yay -Ss keyword                  # поиск в AUR и репозиториях
yay -Si package                  # информация

# paru - альтернатива yay (написан на Rust)
paru -S package
paru -Syu

# Ручная установка из AUR
git clone https://aur.archlinux.org/package.git
cd package
cat PKGBUILD                     # ВСЕГДА читай перед установкой!
makepkg -si                      # собрать и установить
```

### pacman.conf

```bash
# Основной конфиг
cat /etc/pacman.conf

# Ключевые секции:
# [options]
# HoldPkg     = pacman glibc   # не удалять эти пакеты
# Color                         # цветной вывод
# VerbosePkgLists               # подробный список
# ParallelDownloads = 5         # параллельные загрузки

# [core]   - основные пакеты системы
# [extra]  - дополнительные пакеты
# [community] - пакеты сообщества (merged в extra с 2023)
# [multilib] - 32-битные библиотеки

# Включить multilib (для 32-бит приложений, Steam)
# Раскомментировать в /etc/pacman.conf:
# [multilib]
# Include = /etc/pacman.d/mirrorlist

pacman -Sy    # обновить после изменения conf
```

### Mirrorlist

```bash
# Файл с зеркалами
cat /etc/pacman.d/mirrorlist

# Обновить и оптимизировать зеркала
pacman -S reflector

# Автоматически выбрать лучшие зеркала
reflector --country Russia,Germany --sort rate --save /etc/pacman.d/mirrorlist

# С параметрами
reflector \
    --latest 20 \
    --country "Russia,Germany,Netherlands" \
    --protocol https \
    --sort rate \
    --save /etc/pacman.d/mirrorlist
```

---

## snap - универсальные пакеты

Snap - формат самодостаточных пакетов от Canonical. Работает на большинстве дистрибутивов.

```bash
# Установка snapd
apt install snapd                # Ubuntu (уже установлен)
dnf install snapd                # Fedora

# Основные команды
snap find nginx                  # поиск
snap info nginx                  # информация
snap install nginx               # установить (stable канал)
snap install nginx --channel=edge  # edge канал
snap install code --classic      # классический режим (нет изоляции)

snap list                        # установленные snap-пакеты
snap refresh                     # обновить все
snap refresh nginx               # обновить конкретный
snap remove nginx                # удалить

# Snap сервисы
snap services                    # список сервисов
snap start nginx
snap stop nginx

# Каналы пакета
snap info --verbose code | grep channels
```

---

## flatpak - универсальные пакеты (десктоп)

Flatpak - система доставки приложений, изолированных в sandbox. Популярен для десктоп-приложений.

```bash
# Установка
apt install flatpak              # Debian/Ubuntu
dnf install flatpak              # Fedora (обычно уже есть)

# Добавить Flathub репозиторий
flatpak remote-add --if-not-exists flathub \
    https://dl.flathub.org/repo/flathub.flatpakrepo

# Основные команды
flatpak search firefox           # поиск
flatpak install flathub org.mozilla.firefox  # установить
flatpak run org.mozilla.firefox  # запустить

flatpak list                     # установленные
flatpak update                   # обновить всё
flatpak update org.mozilla.firefox  # обновить конкретный
flatpak uninstall org.mozilla.firefox  # удалить

flatpak info org.mozilla.firefox # информация
flatpak remotes                  # список источников
```

---

## Кросс-дистрибутивные паттерны

### Определить пакетный менеджер в скрипте

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
        *)      echo "Неизвестный пакетный менеджер" >&2; return 1 ;;
    esac
}
```

### Установка в Docker/CI без интерактивности

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

# Alpine (минимальный образ)
RUN apk add --no-cache nginx curl
```

---

## Полезные однострочники

```bash
# apt
apt list --installed 2>/dev/null | wc -l          # количество пакетов
apt list --installed 2>/dev/null | grep "^lib"    # только библиотеки
dpkg -l | awk '/^ii/ {print $2}' > packages.txt   # экспорт списка
apt install $(cat packages.txt | tr '\n' ' ')       # импорт списка

# dnf
dnf list installed | wc -l
rpm -qa --qf "%{NAME}\n" | sort > packages.txt
dnf install $(cat packages.txt)

# pacman
pacman -Q | wc -l
pacman -Qqe > packages.txt                         # явно установленные
pacman -S --needed $(cat packages.txt)             # восстановить
pacman -Qdt                                        # осиротевшие пакеты
pacman -Rns $(pacman -Qdtq)                       # удалить осиротевшие

# Найти какой пакет предоставляет команду
apt-file search nginx           # Debian (нужен apt-file)
dpkg -S $(which nginx)
rpm -qf $(which nginx)          # RHEL
pacman -Qo $(which nginx)       # Arch
```

---

## Шпаргалка сравнения

| Задача | apt | dnf | pacman |
|--------|-----|-----|--------|
| Обновить базы | `apt update` | `dnf check-update` | `pacman -Sy` |
| Обновить всё | `apt upgrade` | `dnf upgrade` | `pacman -Su` |
| Обновить базы + всё | `apt update && apt upgrade` | `dnf upgrade` | `pacman -Syu` |
| Установить | `apt install pkg` | `dnf install pkg` | `pacman -S pkg` |
| Удалить | `apt remove pkg` | `dnf remove pkg` | `pacman -R pkg` |
| Удалить + конфиги | `apt purge pkg` | — | `pacman -Rn pkg` |
| Удалить + зависимости | `apt autoremove` | `dnf autoremove` | `pacman -Rs pkg` |
| Поиск | `apt search` | `dnf search` | `pacman -Ss` |
| Информация | `apt show pkg` | `dnf info pkg` | `pacman -Si pkg` |
| Список файлов | `dpkg -L pkg` | `rpm -ql pkg` | `pacman -Ql pkg` |
| Владелец файла | `dpkg -S /path` | `rpm -qf /path` | `pacman -Qo /path` |
| Список установленных | `dpkg -l` | `rpm -qa` | `pacman -Q` |
| Очистить кэш | `apt clean` | `dnf clean all` | `pacman -Scc` |

---

## Ссылки

- [apt man page](https://man7.org/linux/man-pages/man8/apt.8.html) - `man apt`
- [dnf documentation](https://dnf.readthedocs.io/) - документация DNF
- [pacman wiki](https://wiki.archlinux.org/title/Pacman) - Arch Wiki (лучшая документация)
- [AUR](https://aur.archlinux.org/) - Arch User Repository
