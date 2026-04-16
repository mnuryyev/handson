---
title: "SSH - ключи, config, туннели, port forwarding"
date: "2026-04-16"
---

SSH (Secure Shell) - криптографический протокол для безопасного удалённого доступа к серверам. Обеспечивает шифрование, аутентификацию и туннелирование трафика. Порт по умолчанию: **22**.

---

## Как работает SSH

```
Клиент                                    Сервер (порт 22)
  │                                           │
  │ 1. TCP SYN → TCP SYN-ACK → TCP ACK      │
  │──────────────────────────────────────────►│
  │                                           │
  │ 2. Protocol version exchange             │
  │──────────────────────────────────────────►│
  │◄──────────────────────────────────────────│
  │                                           │
  │ 3. Алгоритм шифрования (key exchange)    │
  │   - Diffie-Hellman / ECDH                │
  │   - Согласовать симметричный ключ сессии │
  │──────────────────────────────────────────►│
  │                                           │
  │ 4. Аутентификация сервера                │
  │   - Сервер присылает host key            │
  │   - Клиент проверяет ~./ssh/known_hosts  │
  │◄──────────────────────────────────────────│
  │                                           │
  │ 5. Аутентификация пользователя           │
  │   - password / public key / GSSAPI       │
  │──────────────────────────────────────────►│
  │                                           │
  │ 6. Шифрованный канал установлен          │
  │◄══════════════════════════════════════════►│
```

---

## Базовое подключение

```bash
# Простое подключение
ssh user@hostname
ssh user@192.168.1.10
ssh user@hostname -p 2222          # нестандартный порт

# Выполнить команду без интерактивной сессии
ssh user@host "uptime && df -h"
ssh user@host "sudo systemctl restart nginx"

# Запустить интерактивную команду (с псевдотерминалом)
ssh -t user@host "sudo htop"
ssh -t user@host "sudo bash"

# Копирование файлов
scp file.txt user@host:/remote/path/
scp user@host:/remote/file.txt ./local/
scp -r /local/dir/ user@host:/remote/dir/   # рекурсивно
scp -P 2222 file.txt user@host:/path/       # нестандартный порт

# rsync через SSH
rsync -avz /local/ user@host:/remote/
rsync -avz --delete /local/ user@host:/remote/
rsync -avz -e "ssh -p 2222" /local/ user@host:/remote/
```

---

## SSH ключи

### Генерация ключей

```bash
# Ed25519 - рекомендуемый (современный, быстрый, безопасный)
ssh-keygen -t ed25519 -C "comment"
ssh-keygen -t ed25519 -C "alice@work" -f ~/.ssh/id_ed25519_work

# RSA 4096 — для совместимости со старыми системами
ssh-keygen -t rsa -b 4096 -C "alice@laptop"

# ECDSA
ssh-keygen -t ecdsa -b 521 -C "comment"

# С конкретным именем файла
ssh-keygen -t ed25519 -f ~/.ssh/github_key -C "github"
ssh-keygen -t ed25519 -f ~/.ssh/prod_server -C "production"

# Сгенерировать без интерактивного режима (автоматизация)
ssh-keygen -t ed25519 -N "" -f /tmp/deploy_key -q
# -N "" — пустой passphrase
# -q    — тихий режим
```

### Структура ключевой пары

```bash
~/.ssh/
├── id_ed25519          # приватный ключ (600, только у владельца!)
├── id_ed25519.pub      # публичный ключ (644, можно делиться)
├── id_rsa              # старый RSA приватный ключ
├── id_rsa.pub          # старый RSA публичный ключ
├── known_hosts         # известные хосты (fingerprints серверов)
├── authorized_keys     # публичные ключи разрешённых клиентов
└── config              # конфигурация SSH клиента
```

```bash
# Правильные права на ключи (ОБЯЗАТЕЛЬНО!)
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/authorized_keys
chmod 644 ~/.ssh/known_hosts

# Если права неверные — SSH откажет в соединении с ошибкой:
# "Permissions 0644 for '~/.ssh/id_ed25519' are too open."
```

### Публичный ключ

```bash
# Просмотреть публичный ключ
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... alice@laptop

# Скопировать публичный ключ на сервер
ssh-copy-id user@host
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host
ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 2222 user@host

# Вручную (если ssh-copy-id нет)
cat ~/.ssh/id_ed25519.pub | ssh user@host "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Или одной командой
ssh user@host "echo '$(cat ~/.ssh/id_ed25519.pub)' >> ~/.ssh/authorized_keys"
```

### authorized_keys - формат

```bash
# ~/.ssh/authorized_keys на сервере
# Каждая строка — один разрешённый публичный ключ

# Простой ключ
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... alice@laptop

# Ключ с опциями
command="/opt/scripts/backup.sh" ssh-ed25519 AAAA...    # только одна команда
no-pty,no-port-forwarding ssh-ed25519 AAAA...           # только shell, без туннелей
from="192.168.1.*" ssh-ed25519 AAAA...                  # только с этих IP
restrict,command="rsync --server" ssh-ed25519 AAAA...   # только rsync

# Все опции вместе
from="10.0.0.1",command="/bin/bash",no-port-forwarding,no-X11-forwarding ssh-ed25519 AAAA...
```

### SSH Agent

```bash
# Запустить агент
eval "$(ssh-agent -s)"
# Agent pid 12345

# Добавить ключ в агент (не нужно вводить passphrase каждый раз)
ssh-add ~/.ssh/id_ed25519
ssh-add ~/.ssh/prod_server

# Добавить с временным хранением (8 часов)
ssh-add -t 8h ~/.ssh/id_ed25519

# Список загруженных ключей
ssh-add -l
# 256 SHA256:... alice@laptop (ED25519)

# Удалить все ключи из агента
ssh-add -D

# Автоматически при входе — добавить в ~/.bashrc или ~/.zshrc
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)" > /dev/null
    ssh-add ~/.ssh/id_ed25519 2>/dev/null
fi
```

### Fingerprint и known_hosts

```bash
# Просмотреть fingerprint ключа сервера
ssh-keyscan -t ed25519 hostname 2>/dev/null | ssh-keygen -lf -

# Fingerprint своего ключа
ssh-keygen -lf ~/.ssh/id_ed25519.pub
# 256 SHA256:xxxxxxxx alice@laptop (ED25519)

# known_hosts — хранит fingerprints серверов
cat ~/.ssh/known_hosts
# hostname ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...

# Добавить хост в known_hosts без подключения
ssh-keyscan -H hostname >> ~/.ssh/known_hosts
ssh-keyscan -p 2222 -H hostname >> ~/.ssh/known_hosts

# Удалить запись хоста (если сервер переустановлен)
ssh-keygen -R hostname
ssh-keygen -R 192.168.1.10

# Отключить проверку (ТОЛЬКО для тестов!)
ssh -o StrictHostKeyChecking=no user@host
ssh -o StrictHostKeyChecking=accept-new user@host  # принять новый, отклонить изменённый
```

---

## SSH Config (~/.ssh/config)

SSH config позволяет задавать параметры подключения для каждого хоста, избавляя от длинных командных строк.

### Базовый синтаксис

```
# ~/.ssh/config

Host alias              # псевдоним (то, что вводишь в ssh)
    HostName реальный-хост
    User имя-пользователя
    Port порт
    IdentityFile путь-к-ключу
    ...другие опции...

Host *                  # применяется ко всем хостам (дефолты)
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Примеры конфигураций

```
# ~/.ssh/config

# Рабочий сервер
Host work
    HostName 203.0.113.10
    User alice
    Port 22
    IdentityFile ~/.ssh/id_ed25519_work
    ForwardAgent yes

# Домашний сервер
Host home
    HostName 192.168.1.100
    User alice
    IdentityFile ~/.ssh/id_ed25519

# GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_key
    IdentitiesOnly yes      # использовать только этот ключ

# GitLab
Host gitlab.com
    HostName gitlab.com
    User git
    IdentityFile ~/.ssh/gitlab_key

# Джамп-хост (bastion)
Host bastion
    HostName bastion.example.com
    User alice
    Port 22
    IdentityFile ~/.ssh/id_ed25519

# Сервер за bastion через ProxyJump
Host internal
    HostName 10.0.0.50
    User alice
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519

# Wildcard для внутренней сети
Host 10.0.*
    User alice
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking no

# Глобальные настройки
Host *
    ServerAliveInterval 60    # keepalive каждые 60 сек
    ServerAliveCountMax 3     # 3 попытки перед отключением
    AddKeysToAgent yes        # автоматически добавлять ключи в агент
    IdentityFile ~/.ssh/id_ed25519
    Compression yes           # сжатие трафика
```

```bash
# Теперь вместо длинной команды:
ssh -i ~/.ssh/id_ed25519_work -p 22 alice@203.0.113.10

# Просто:
ssh work

# И scp тоже работает с псевдонимами:
scp file.txt work:/tmp/
```

### Все полезные опции config

```
HostName           — реальный hostname или IP
User               — имя пользователя
Port               — порт (по умолчанию 22)
IdentityFile       — путь к приватному ключу
IdentitiesOnly     — использовать только указанный ключ (не пробовать другие)
ForwardAgent       — пробросить SSH агент на сервер
ProxyJump          — подключиться через промежуточный хост
ProxyCommand       — произвольная команда для прокси
ServerAliveInterval — keepalive интервал (секунды)
ServerAliveCountMax — количество keepalive попыток
StrictHostKeyChecking — проверка host key (yes/no/accept-new)
AddKeysToAgent     — добавлять ключи в агент
Compression        — сжатие (yes/no)
LogLevel           — уровень логирования (DEBUG, INFO, VERBOSE...)
ConnectTimeout     — таймаут подключения (секунды)
BatchMode          — никогда не запрашивать пароль (для скриптов)
ControlMaster      — мультиплексирование соединений
ControlPath        — путь к control socket
ControlPersist     — как долго держать master connection
```

### Мультиплексирование соединений

```
# ~/.ssh/config — ускоряет повторные подключения к тому же хосту
Host *
    ControlMaster auto
    ControlPath ~/.ssh/cm_socket/%r@%h:%p
    ControlPersist 10m    # держать соединение 10 минут после выхода

# Создать директорию
mkdir -p ~/.ssh/cm_socket
chmod 700 ~/.ssh/cm_socket
```

---

## Port Forwarding (туннели)

SSH позволяет туннелировать любой TCP трафик через зашифрованное соединение.

### Local Port Forwarding (-L)

**Сценарий:** Доступ к удалённому ресурсу через локальный порт.

```
Твоя машина          SSH сервер          Целевой ресурс
   :8080  ──────────►   :22   ──────────►  :5432 (PostgreSQL)

Трафик идёт: localhost:8080 → SSH tunnel → сервер → postgres:5432
```

```bash
# Синтаксис: ssh -L [local_addr:]local_port:remote_host:remote_port user@ssh_server
# -N : не запускать команду (только туннель)
# -f : уйти в фон

# Доступ к PostgreSQL на удалённом сервере
ssh -L 5432:localhost:5432 user@server -N
# Теперь: psql -h localhost -p 5432 -U myuser mydb

# Доступ к веб-интерфейсу (например, внутренний Jenkins)
ssh -L 8080:jenkins.internal:8080 user@bastion -N

# Доступ к Redis на другом сервере через SSH
ssh -L 6379:redis-server:6379 user@ssh-server -N

# Несколько туннелей одновременно
ssh -L 5432:db:5432 -L 6379:redis:6379 -L 8080:web:80 user@bastion -N -f

# Доступен с других машин в локальной сети (bind на 0.0.0.0)
ssh -L 0.0.0.0:5432:db:5432 user@server -N
```

```
# В ~/.ssh/config:
Host db-tunnel
    HostName server.example.com
    User alice
    LocalForward 5432 localhost:5432
    LocalForward 6379 redis.internal:6379
```

### Remote Port Forwarding (-R)

**Сценарий:** Открыть доступ к локальному ресурсу с удалённого сервера.

```
Твоя машина          SSH сервер         Внешний пользователь
   :3000  ◄──────────   :8080  ◄──────── (клиент)

Трафик идёт: сервер:8080 → SSH tunnel → localhost:3000
```

```bash
# Синтаксис: ssh -R [remote_addr:]remote_port:local_host:local_port user@ssh_server

# Открыть локальное приложение (порт 3000) через сервер
ssh -R 8080:localhost:3000 user@server -N

# Обратный SSH туннель (доступ к машине за NAT)
# На машине за NAT:
ssh -R 2222:localhost:22 user@public-server -N -f
# Теперь с public-server: ssh -p 2222 localhost

# Открыть для всех интерфейсов на сервере
# (нужен GatewayPorts yes в sshd_config сервера)
ssh -R 0.0.0.0:8080:localhost:3000 user@server -N
```

### Dynamic Port Forwarding (-D) / SOCKS прокси

**Сценарий:** Использовать SSH сервер как SOCKS5 прокси для всего трафика.

```bash
# Синтаксис: ssh -D [local_addr:]local_port user@ssh_server

# Создать SOCKS5 прокси на порту 1080
ssh -D 1080 user@server -N -f

# Теперь в браузере указать SOCKS5 прокси: localhost:1080
# Весь трафик браузера пойдёт через сервер

# Curl через SOCKS прокси
curl --socks5 localhost:1080 http://example.com

# wget через SOCKS прокси
tsocks wget http://example.com  # или
ALL_PROXY=socks5://localhost:1080 wget http://example.com
```

### ProxyJump - подключение через бастион

```bash
# Одна промежуточная машина
ssh -J bastion.example.com user@internal-server

# Цепочка хостов
ssh -J bastion1,bastion2 user@final-server

# В ~/.ssh/config:
Host internal
    HostName 10.0.0.50
    User alice
    ProxyJump bastion

# ProxyCommand (более гибко, устаревший способ)
ssh -o ProxyCommand="ssh bastion nc %h %p" user@internal-server
# или
ssh -o ProxyCommand="ssh -W %h:%p bastion" user@internal-server
```

### Persistent tunnels с autossh

```bash
# autossh — автоматически пересоздаёт туннель при обрыве
apt install autossh

# Локальный туннель
autossh -M 0 -N -L 5432:localhost:5432 user@server

# Обратный туннель (systemd сервис)
cat > /etc/systemd/system/reverse-tunnel.service << 'EOF'
[Unit]
Description=Reverse SSH Tunnel
After=network-online.target

[Service]
User=tunnel
ExecStart=/usr/bin/autossh -M 0 -N \
    -o "ServerAliveInterval 30" \
    -o "ServerAliveCountMax 3" \
    -o "ExitOnForwardFailure yes" \
    -i /home/tunnel/.ssh/id_ed25519 \
    -R 2222:localhost:22 \
    user@public-server.example.com
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now reverse-tunnel
```

---

## Конфигурация SSH сервера (sshd_config)

```bash
# Основной конфиг
/etc/ssh/sshd_config

# Параметры по умолчанию
cat /etc/ssh/sshd_config

# Проверить конфиг на ошибки
sshd -t                    # тест конфига
sshd -T                    # показать все параметры с дефолтами

# Применить изменения
systemctl reload sshd
```

### Важные параметры sshd_config

```bash
# Порт
Port 22
Port 2222              # можно указать несколько

# Протокол и ключи
Protocol 2
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key

# Аутентификация
PermitRootLogin no                      # запретить вход root
PermitRootLogin prohibit-password       # root только по ключу
PasswordAuthentication no               # запретить вход по паролю (рекомендуется!)
PubkeyAuthentication yes                # разрешить по ключу
AuthorizedKeysFile .ssh/authorized_keys # где искать ключи

# Ограничения
MaxAuthTries 3                          # попыток аутентификации
MaxSessions 10                          # сессий на соединение
LoginGraceTime 30                       # секунд на аутентификацию
ClientAliveInterval 300                 # keepalive интервал
ClientAliveCountMax 3                   # количество keepalive

# Пользователи (выбрать одно из: AllowUsers/DenyUsers/AllowGroups)
AllowUsers alice bob deploy
DenyUsers badguy
AllowGroups sshusers admins
DenyGroups nologin

# Туннели и перенаправления
AllowTcpForwarding yes
GatewayPorts no                         # no = туннели только для localhost
X11Forwarding no
AllowStreamLocalForwarding yes

# SFTP
Subsystem sftp /usr/lib/openssh/sftp-server

# Ограничить до SFTP только (без shell)
Match User sftp-user
    ForceCommand internal-sftp
    ChrootDirectory /home/sftp-user
    AllowTcpForwarding no
    X11Forwarding no

# Разрешить вход только с определённых IP
Match Address 192.168.1.0/24
    PasswordAuthentication yes
```

### Усиление безопасности sshd

```bash
# /etc/ssh/sshd_config — hardened конфиг

Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers alice bob
X11Forwarding no
AllowTcpForwarding yes
GatewayPorts no
PermitEmptyPasswords no
IgnoreRhosts yes
HostbasedAuthentication no

# Современные алгоритмы шифрования
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com

# Проверить итоговый конфиг
sshd -T | grep -E "permitrootlogin|passwordauthentication|pubkeyauthentication"
```

---

## Практические сценарии

### Выполнение команд через SSH в скриптах

```bash
# Простое выполнение
ssh user@host "command"

# Несколько команд
ssh user@host "cd /app && git pull && npm install && pm2 restart all"

# Heredoc для многострочных команд
ssh user@host << 'EOF'
set -e
cd /app
git pull origin main
npm ci --production
systemctl restart myapp
echo "Деплой завершён"
EOF

# Передать переменные
VERSION="1.2.3"
ssh user@host "export VERSION=$VERSION; /opt/deploy.sh"

# Тихий режим (только stderr)
ssh -q user@host "command"

# Таймаут подключения
ssh -o ConnectTimeout=10 user@host "command"
```

### Деплой ключей автоматически

```bash
# Скрипт для деплоя публичного ключа на множество серверов
PUBKEY=$(cat ~/.ssh/id_ed25519.pub)
SERVERS=("server1.example.com" "server2.example.com" "server3.example.com")

for server in "${SERVERS[@]}"; do
    echo "Деплою ключ на $server..."
    ssh -o StrictHostKeyChecking=accept-new user@"$server" \
        "mkdir -p ~/.ssh && echo '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    echo "Готово: $server"
done
```

### SFTP - безопасная передача файлов

```bash
# Интерактивная SFTP сессия
sftp user@host
# sftp> ls
# sftp> cd /remote/path
# sftp> get remote-file.txt
# sftp> put local-file.txt
# sftp> mget *.log          # скачать несколько файлов
# sftp> mput *.csv          # загрузить несколько файлов
# sftp> bye

# Неинтерактивная передача файлов
sftp user@host <<< "get /remote/file.txt /local/path/"
sftp -b - user@host << 'EOF'
cd /uploads
put /local/file1.txt
put /local/file2.txt
EOF
```

### X11 Forwarding - GUI через SSH

```bash
# На сервере в /etc/ssh/sshd_config:
X11Forwarding yes

# Подключиться с X11 forwarding
ssh -X user@host           # ненадёжный X11 forwarding
ssh -Y user@host           # доверенный (быстрее, менее безопасно)

# Открыть GUI приложение
ssh -X user@host "firefox"
ssh -X user@host "gimp /path/to/image.png"
ssh -Y user@host "gedit"
```

---

## Диагностика SSH

```bash
# Подробный вывод (-v, -vv, -vvv)
ssh -v user@host
ssh -vv user@host        # больше деталей
ssh -vvv user@host       # максимум (уровень DEBUG3)

# Типичные ошибки и их причины:

# "Permission denied (publickey)"
# → Ключ не добавлен в authorized_keys
# → Неверные права на ~/.ssh/ или authorized_keys
# → PasswordAuthentication=no, ключа нет
ssh -v user@host 2>&1 | grep -E "Offering|Accepted|Trying"

# "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!"
# → Сервер переустановлен или MITM атака
ssh-keygen -R hostname      # удалить старый fingerprint
ssh-keyscan -H hostname >> ~/.ssh/known_hosts

# "Connection refused"
# → SSH демон не запущен
# → Неверный порт
# → Firewall блокирует
nc -zv hostname 22          # проверить порт
nmap -p 22 hostname

# "Connection timed out"
# → Нет маршрута до хоста
# → Firewall без ответа
ping hostname
traceroute hostname

# Логи SSH сервера
journalctl -u ssh -f              # Debian/Ubuntu
journalctl -u sshd -f             # RHEL/CentOS
tail -f /var/log/auth.log         # Debian/Ubuntu
tail -f /var/log/secure           # RHEL/CentOS

# Проверить текущих подключённых пользователей
who
w
ss -tnp | grep :22
```

---

## Безопасность SSH

```bash
# Посмотреть подозрительные подключения
grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn | head -20

grep "Invalid user" /var/log/auth.log | awk '{print $8}' | sort | uniq -c | sort -rn | head -20

grep "Accepted publickey" /var/log/auth.log | tail -20

# Заблокировать IP через fail2ban
apt install fail2ban

cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600    # 1 час
findtime = 600    # окно 10 минут
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
fail2ban-client unban 192.168.1.10

# 2FA для SSH (Google Authenticator)
apt install libpam-google-authenticator
# Добавить в /etc/pam.d/sshd:
# auth required pam_google_authenticator.so
# Добавить в sshd_config:
# ChallengeResponseAuthentication yes
# AuthenticationMethods publickey,keyboard-interactive
```

---

## Шпаргалка

```bash
# Ключи
ssh-keygen -t ed25519 -C "comment"     # создать ключ
ssh-copy-id user@host                  # скопировать ключ на сервер
ssh-add ~/.ssh/id_ed25519              # добавить в агент
ssh-add -l                             # список ключей в агенте
ssh-keygen -R hostname                 # убрать хост из known_hosts
ssh-keyscan -H host >> known_hosts     # добавить fingerprint

# Подключение
ssh user@host                          # просто подключиться
ssh -p 2222 user@host                  # нестандартный порт
ssh -i ~/.ssh/key user@host            # конкретный ключ
ssh -J bastion user@host               # через промежуточный хост
ssh -t user@host "sudo htop"           # принудительный псевдотерминал

# Туннели
ssh -L 8080:localhost:80 user@host -N  # local forward
ssh -R 8080:localhost:3000 user@host -N # remote forward
ssh -D 1080 user@host -N               # SOCKS прокси
ssh -L local:host:remote               # общая форма

# Флаги
-N     не выполнять команды (только туннель)
-f     уйти в фон
-v     verbose (отладка)
-t     принудительный псевдотерминал
-q     тихий режим
-C     сжатие
-A     форвардинг агента

# Права файлов (ОБЯЗАТЕЛЬНО)
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_*           # приватные ключи
chmod 644 ~/.ssh/*.pub          # публичные ключи
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/authorized_keys
```

---

## Ссылки

- [OpenSSH Manual](https://www.openssh.com/manual.html) - официальная документация
- [ssh_config man](https://man7.org/linux/man-pages/man5/ssh_config.5.html) - `man 5 ssh_config`
- [sshd_config man](https://man7.org/linux/man-pages/man5/sshd_config.5.html) - `man 5 sshd_config`
- [SSH Hardening Guide](https://infosec.mozilla.org/guidelines/openssh) - Mozilla рекомендации
