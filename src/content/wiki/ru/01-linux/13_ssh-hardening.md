---
title: "SSH - hardening, fail2ban, authorized_keys"
date: "2026-04-19"
---

Продолжение темы SSH. Здесь - углублённо про защиту SSH сервера: усиление конфигурации, защита от брутфорса, управление ключами и аудит безопасности.

---

## Модель угроз SSH

```
Типичные атаки на SSH:
──────────────────────────────────────────────────────────────────
Brute Force     - перебор паролей (боты сканируют весь интернет)
Dictionary      - атака по словарю на пользователей/пароли
Credential Stuff - использование утёкших пар логин/пароль
MITM            - подмена сервера при первом подключении
Key Theft       - кража приватного ключа с рабочей машины
Insider         - скомпрометированный авторизованный пользователь

Статистика: сервер с SSH на порту 22 получает тысячи
попыток брутфорса в день уже через несколько минут после запуска.
```

---

## Базовый чеклист безопасности

```
Отключить вход по паролю (PasswordAuthentication no)
Отключить вход root (PermitRootLogin no)
Использовать только Ed25519/RSA-4096 ключи
Ограничить пользователей (AllowUsers)
Сменить порт (опционально, security through obscurity)
Настроить fail2ban или аналог
Настроить firewall (UFW/nftables)
Обновлять OpenSSH регулярно
Мониторить логи аутентификации
Использовать современные алгоритмы шифрования
```

---

## Hardening sshd_config - полный конфиг

```bash
# Проверить текущую версию OpenSSH
ssh -V
# OpenSSH_8.9p1 Ubuntu-3ubuntu0.6, OpenSSL 3.0.2

# Расположение конфига
/etc/ssh/sshd_config

# Всегда делать бэкап перед изменениями
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Проверить конфиг на ошибки
sshd -t && echo "Config OK"
```

### Минимально защищённый конфиг

```ini
# /etc/ssh/sshd_config

#──────────── Сеть ────────────
Port 22
AddressFamily inet              # только IPv4 (или any для IPv4+IPv6)
ListenAddress 0.0.0.0

#──────────── Хостовые ключи ────────────
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
# Убрать слабые алгоритмы
# НЕ использовать: ssh_host_dsa_key, ssh_host_ecdsa_key (NIST curves)

#──────────── Криптография ────────────
# Только современные алгоритмы
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512

Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr

MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com

HostKeyAlgorithms ssh-ed25519,ssh-ed25519-cert-v01@openssh.com,rsa-sha2-512,rsa-sha2-256

#──────────── Аутентификация ────────────
LoginGraceTime 20               # 20 сек на аутентификацию
PermitRootLogin no              # запрет входа root
StrictModes yes                 # проверка прав файлов ~/.ssh
MaxAuthTries 3                  # 3 попытки аутентификации
MaxSessions 5                   # 5 параллельных сессий

PubkeyAuthentication yes        # ключи разрешены
AuthorizedKeysFile .ssh/authorized_keys  # файл ключей

PasswordAuthentication no       # ПАРОЛИ ЗАПРЕЩЕНЫ
PermitEmptyPasswords no         # пустые пароли запрещены
ChallengeResponseAuthentication no  # keyboard-interactive запрещён

UsePAM yes                      # использовать PAM (для 2FA, если нужно)

#──────────── Доступ ────────────
AllowUsers alice bob deploy     # только эти пользователи
# DenyUsers badguy              # или запретить конкретных

#──────────── Forwarding ────────────
AllowAgentForwarding no         # агент форвардинг (разрешить если нужно)
AllowTcpForwarding no           # туннели TCP (разрешить если нужно)
GatewayPorts no                 # порты только на localhost
X11Forwarding no                # X11 запрещён
PermitTunnel no                 # tun-устройства запрещены

#──────────── Прочее ────────────
PrintMotd no                    # не показывать /etc/motd
AcceptEnv LANG LC_*             # разрешить только языковые переменные
Subsystem sftp /usr/lib/openssh/sftp-server

# Keepalive
ClientAliveInterval 300         # 5 минут
ClientAliveCountMax 2           # 2 попытки → отключить

# Логирование
LogLevel VERBOSE                # логировать fingerprints ключей
# LogLevel DEBUG — только для диагностики!
```

```bash
# Применить изменения
sshd -t                         # проверить синтаксис
systemctl reload sshd           # применить

# Проверить что настроено правильно
sshd -T | grep -E "permitrootlogin|passwordauth|pubkeyauth|allowusers|maxauthtries|logingracetime"
```

### Match-блоки - разные правила для разных случаев

```ini
# Разрешить вход по паролю только из локальной сети
Match Address 192.168.1.0/24,10.0.0.0/8
    PasswordAuthentication yes

# SFTP-only пользователь в chroot jail
Match User sftp-backup
    ForceCommand internal-sftp
    ChrootDirectory /srv/sftp/%u
    AllowTcpForwarding no
    X11Forwarding no
    PasswordAuthentication no

# Группа ops может использовать туннели
Match Group ops
    AllowTcpForwarding yes
    AllowAgentForwarding yes

# Ограничить admin только с определённого IP
Match User admin Address 203.0.113.1
    PasswordAuthentication no
    PubkeyAuthentication yes
```

---

## Современные алгоритмы шифрования

### Проверка поддерживаемых алгоритмов

```bash
# Что поддерживает клиент
ssh -Q kex         # алгоритмы обмена ключами
ssh -Q cipher      # шифры
ssh -Q mac         # алгоритмы MAC
ssh -Q key         # типы ключей

# Проверить что использует активное соединение
ssh -vvv user@host 2>&1 | grep -E "kex_init|cipher|mac"
# kex: server->client cipher: chacha20-poly1305@openssh.com MAC: <implicit>

# Тест с конкретными алгоритмами
ssh -c aes256-gcm@openssh.com -m hmac-sha2-256-etm@openssh.com user@host

# ssh-audit — анализатор безопасности SSH
pip3 install ssh-audit
ssh-audit hostname
# или
ssh-audit -p 22 hostname
```

### Что НЕ использовать

```
Устаревшие KexAlgorithms (запрещаем):
diffie-hellman-group1-sha1     - Logjam атака
diffie-hellman-group14-sha1    - SHA-1 уязвим

Устаревшие шифры (запрещаем):
3des-cbc                       - Triple DES, медленный
aes*-cbc                       - уязвим к Lucky13
arcfour*                       - RC4, сломан
blowfish-cbc                   - 64-битный блок

Устаревшие MAC (запрещаем):
hmac-md5*                      - MD5 сломан
hmac-sha1                      - SHA-1 уязвим
umac-64*                       - 64-битный тег

Устаревшие HostKey (запрещаем):
ssh-dss (DSA)                  - 1024 бит, сломан
ecdsa-sha2-nistp256/384/521    - NIST curves подозрительны (backdoor?)
```

---

## authorized_keys - детальное управление

### Опции ключей

```bash
# Формат строки authorized_keys:
# [options] keytype base64key [comment]

# Ограничение по IP
from="192.168.1.10" ssh-ed25519 AAAA...

# Несколько IP/подсетей
from="192.168.1.0/24,10.0.0.*,!10.0.0.5" ssh-ed25519 AAAA...
# ! - исключение

# Только одна команда (полезно для деплоя)
command="/usr/local/bin/deploy.sh" ssh-ed25519 AAAA...

# Команда + запрет всего остального
command="/usr/local/bin/deploy.sh",no-port-forwarding,no-agent-forwarding,no-x11-forwarding,no-pty ssh-ed25519 AAAA...

# restrict - запрещает всё кроме явно разрешённого (OpenSSH 7.4+)
restrict,command="/usr/local/bin/deploy.sh" ssh-ed25519 AAAA...

# restrict + разрешить только port forwarding
restrict,port-forwarding ssh-ed25519 AAAA...

# Максимальное ограничение для ci/cd ключа
restrict,command="/opt/ci/deploy.sh ${SSH_ORIGINAL_COMMAND}" ssh-ed25519 AAAA...

# Переменная SSH_ORIGINAL_COMMAND — исходная команда пользователя
command='if [ "$SSH_ORIGINAL_COMMAND" = "backup" ]; then /opt/backup.sh; fi' ssh-ed25519 AAAA...
```

### Все опции authorized_keys

| Опция | Описание |
|-------|----------|
| `from="pattern"` | Разрешить только с этих IP/хостов |
| `command="cmd"` | Выполнить только эту команду |
| `restrict` | Запретить всё (pty, forwarding, etc.) |
| `no-pty` | Не выделять псевдотерминал |
| `no-port-forwarding` | Запретить port forwarding |
| `no-agent-forwarding` | Запретить форвардинг агента |
| `no-x11-forwarding` | Запретить X11 |
| `no-user-rc` | Не выполнять ~/.ssh/rc |
| `port-forwarding` | Явно разрешить (с restrict) |
| `agent-forwarding` | Явно разрешить (с restrict) |
| `pty` | Явно разрешить pty (с restrict) |
| `environment="KEY=VAL"` | Установить переменную окружения |
| `expiry-time="YYYYMMDD"` | Срок действия ключа (OpenSSH 8.2+) |
| `tunnel="N"` | Разрешить tun-туннель N |
| `principals="name"` | Для certificate auth |

### Практические применения

```bash
# Ключ для деплоя (только deploy скрипт)
restrict,command="/opt/deploy.sh" ssh-ed25519 AAAA... ci-deploy@github

# Ключ для резервного копирования (только rsync)
restrict,command="rsync --server --sender -logDtprze.iLsfxC . /backup/" ssh-ed25519 AAAA... backup@nas

# Ключ для мониторинга (только несколько команд)
restrict,command="/opt/monitoring/collect.sh" ssh-ed25519 AAAA... prometheus@monitoring

# Ключ с истечением срока
expiry-time="20251231",restrict,command="/opt/temp-access.sh" ssh-ed25519 AAAA... contractor

# Ключ только для SFTP с конкретного IP
from="10.0.0.100",restrict ssh-ed25519 AAAA... sftp-client

# Администраторский ключ — только с офисной сети
from="203.0.113.0/24" ssh-ed25519 AAAA... alice@work
```

### Скрипты управления authorized_keys

```bash
#!/usr/bin/env bash
# Добавить ключ с ограничениями

add_deploy_key() {
    local keyfile="$1"
    local user="$2"
    local authorized_keys="/home/$user/.ssh/authorized_keys"

    if [ ! -f "$keyfile" ]; then
        echo "Ключ не найден: $keyfile" >&2
        return 1
    fi

    local pubkey
    pubkey=$(cat "$keyfile")
    local key_comment
    key_comment=$(echo "$pubkey" | awk '{print $3}')

    # Проверить что ключа ещё нет
    if grep -qF "$pubkey" "$authorized_keys" 2>/dev/null; then
        echo "Ключ уже добавлен: $key_comment"
        return 0
    fi

    # Добавить с ограничениями
    echo "restrict,command=\"/opt/deploy.sh\" $pubkey" >> "$authorized_keys"
    chmod 600 "$authorized_keys"
    echo "Ключ добавлен: $key_comment"
}

# Удалить ключ по комментарию
remove_key_by_comment() {
    local comment="$1"
    local authorized_keys="$2"

    grep -v " $comment$" "$authorized_keys" > /tmp/ak_tmp
    mv /tmp/ak_tmp "$authorized_keys"
    chmod 600 "$authorized_keys"
    echo "Ключ удалён: $comment"
}

# Показать все ключи
list_keys() {
    local authorized_keys="$1"
    awk '{
        # Парсить опции, тип ключа и комментарий
        if ($0 ~ /^ssh-/ || $0 ~ /^ecdsa-/) {
            printf "Тип: %-20s Комментарий: %s\n", $1, $3
        } else {
            # Есть опции
            n = split($0, parts, " ")
            printf "Опции: %-30s Тип: %-20s Комментарий: %s\n", parts[1], parts[2], parts[4]
        }
    }' "$authorized_keys"
}

list_keys ~/.ssh/authorized_keys
```

---

## fail2ban - защита от брутфорса

fail2ban анализирует лог-файлы и блокирует IP с подозрительной активностью через iptables/nftables.

### Установка и базовая настройка

```bash
# Установка
apt install fail2ban                    # Debian/Ubuntu
dnf install fail2ban                    # RHEL/CentOS
pacman -S fail2ban                      # Arch

# Запуск
systemctl enable --now fail2ban

# Проверить статус
fail2ban-client status
fail2ban-client status sshd
```

### Конфигурация

```bash
# Никогда не редактировать /etc/fail2ban/jail.conf !
# Создать /etc/fail2ban/jail.local — переопределяет jail.conf

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
# Глобальные настройки
bantime  = 3600          # 1 час бана по умолчанию
findtime = 600           # окно поиска (10 минут)
maxretry = 3             # количество попыток

# Игнорировать свои IP (ОБЯЗАТЕЛЬНО!)
ignoreip = 127.0.0.1/8 ::1 192.168.1.0/24 10.0.0.0/8

# Отправлять уведомления на почту
# destemail = admin@example.com
# sender = fail2ban@example.com
# mta = sendmail
# action = %(action_mwl)s  # ban + email с логами

# Backend для чтения логов
backend = systemd

[sshd]
enabled = true
port    = ssh,2222       # порт(ы) SSH
filter  = sshd
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime  = 86400         # 24 часа за 3 попытки
findtime = 3600          # окно 1 час

# Агрессивный режим (блокировать даже pre-auth попытки)
mode = aggressive
EOF

# Применить
systemctl restart fail2ban
```

### Кастомный фильтр

```bash
# /etc/fail2ban/filter.d/sshd-aggressive.conf
# Блокировать уже после сканирования (до авторизации)
[Definition]
failregex = ^%(__prefix_line)sDisconnect(ed)? from (invalid |authenticating )?user .* <HOST> port \d+ \[preauth\]$
            ^%(__prefix_line)sConnection (closed|reset) by (authenticating |invalid )?user .* <HOST> port \d+ \[preauth\]$
            ^%(__prefix_line)sInvalid user .* from <HOST>
            ^%(__prefix_line)sFailed password for .* from <HOST>
            ^%(__prefix_line)sFailed publickey for .* from <HOST>

ignoreregex =
```

### Управление fail2ban

```bash
# Статус
fail2ban-client status              # все jails
fail2ban-client status sshd         # конкретный jail
# Status for the jail: sshd
# |- Filter
# |  |- Currently failed: 3
# |  |- Total failed: 127
# |  `- Journal matches: _SYSTEMD_UNIT=sshd.service + _COMM=sshd
# `- Actions
#    |- Currently banned: 2
#    |- Total banned: 15
#    `- Banned IP list: 185.220.101.42 45.33.32.156

# Разблокировать IP
fail2ban-client unban 185.220.101.42

# Заблокировать IP вручную
fail2ban-client set sshd banip 192.168.1.50

# Проверить заблокированные IP
fail2ban-client get sshd banip
iptables -n -L f2b-sshd                    # через iptables

# Посмотреть лог fail2ban
tail -f /var/log/fail2ban.log
journalctl -u fail2ban -f

# Тестировать фильтр
fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf
fail2ban-regex "Jun 10 10:10:10 server sshd[1234]: Failed password for root from 1.2.3.4 port 12345 ssh2" sshd
```

### Длительный бан для злостных нарушителей

```bash
# /etc/fail2ban/jail.local

[sshd-recidive]
# Блокировать навсегда тех кто уже был забанен 5 раз
enabled  = true
filter   = recidive
logpath  = /var/log/fail2ban.log
action   = iptables-allports[name=recidive]
bantime  = -1            # -1 = бессрочно
findtime = 86400         # 24 часа
maxretry = 5
```

---

## UFW / nftables - ограничение доступа к SSH

### UFW (Uncomplicated Firewall)

```bash
# Установка UFW
apt install ufw

# Включить с базовыми правилами
ufw default deny incoming
ufw default allow outgoing

# Разрешить SSH только с определённых IP
ufw allow from 192.168.1.0/24 to any port 22
ufw allow from 203.0.113.1 to any port 22

# Разрешить SSH со всех (менее безопасно)
ufw allow ssh
ufw allow 22/tcp

# Ограничить частоту подключений (rate limiting)
ufw limit ssh
ufw limit 22/tcp
# Блокирует IP после 6 подключений за 30 секунд

# Включить
ufw enable
ufw status verbose

# Удалить правило
ufw delete allow from 192.168.1.0/24 to any port 22
```

### nftables

```bash
# /etc/nftables.conf - ограничить SSH

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        # Разрешить loopback
        iifname "lo" accept

        # Разрешить установленные соединения
        ct state established,related accept

        # SSH rate limiting - не более 3 новых подключений в 60 сек с одного IP
        tcp dport 22 ct state new \
            limit rate 3/minute burst 5 packets \
            accept

        # Или разрешить только с определённых IP
        tcp dport 22 ip saddr { 192.168.1.0/24, 203.0.113.1 } accept
        tcp dport 22 drop      # остальным запрещено
    }
}
```

---

## Двухфакторная аутентификация (2FA)

### TOTP через Google Authenticator

```bash
# Установка
apt install libpam-google-authenticator

# Настройка для пользователя (от имени пользователя, НЕ root)
google-authenticator
# Ответить на вопросы:
# - Time-based: yes
# - Update ~/.google_authenticator: yes
# - Disallow multiple uses: yes
# - Window size 1: yes
# - Rate limiting: yes

# Настроить PAM
# /etc/pam.d/sshd - ДОБАВИТЬ СТРОКУ (в начало, после @include):
auth required pam_google_authenticator.so nullok
# nullok — позволяет входить без 2FA если не настроено (убрать на проде!)

# Настроить sshd_config
UsePAM yes
ChallengeResponseAuthentication yes
# Требовать И ключ И TOTP:
AuthenticationMethods publickey,keyboard-interactive
# Или только TOTP (без ключа):
# AuthenticationMethods keyboard-interactive

# Перезапустить sshd
systemctl restart sshd

# Теперь при входе:
# Verification code: (6-значный код из приложения)
```

### YubiKey через PAM

```bash
# Установка
apt install libpam-yubico

# /etc/pam.d/sshd
auth required pam_yubico.so id=CLIENT_ID key=SECRET_KEY

# sshd_config
AuthenticationMethods publickey,keyboard-interactive
```

---

## Аудит и мониторинг

### Анализ логов аутентификации

```bash
# Последние успешные входы
grep "Accepted" /var/log/auth.log | tail -20
# Jun 10 10:22:33 server sshd[1234]: Accepted publickey for alice from 192.168.1.5 port 52341 ssh2: ED25519 SHA256:xxxxxxxx

# Все неудачные попытки
grep "Failed\|Invalid\|Connection closed\|Disconnected" /var/log/auth.log | tail -50

# Топ атакующих IP
grep "Failed password\|Invalid user" /var/log/auth.log \
    | grep -oP 'from \K[\d.]+' \
    | sort | uniq -c | sort -rn | head -20

# Топ перебираемых логинов
grep "Invalid user" /var/log/auth.log \
    | awk '{print $8}' \
    | sort | uniq -c | sort -rn | head -20

# Статистика по дням
grep "Failed password" /var/log/auth.log \
    | awk '{print $1, $2}' \
    | sort | uniq -c | sort -rn

# Через journald
journalctl _COMM=sshd --since "24 hours ago" | grep "Failed"
journalctl _COMM=sshd --since "24 hours ago" | grep "Accepted" | grep -v "from 192.168"

# Все ключи которые были использованы для входа (если LogLevel VERBOSE)
grep "Accepted publickey" /var/log/auth.log | grep -oP 'ED25519 SHA256:\K\S+'
```

### Скрипт для ежедневного отчёта

```bash
#!/usr/bin/env bash
# /etc/cron.daily/ssh-report

LOGFILE="/var/log/auth.log"
REPORT="/tmp/ssh-report-$(date +%Y%m%d).txt"

{
echo "=== SSH Security Report — $(date) ==="
echo ""

echo "--- Успешные входы (последние 24ч) ---"
grep "Accepted" "$LOGFILE" | grep "$(date '+%b %d')" \
    | awk '{print $1,$2,$3,"user="$9,"from="$11,"key="$17}' \
    | sort | uniq -c

echo ""
echo "--- Топ атакующих IP ---"
grep "Failed password\|Invalid user" "$LOGFILE" | grep "$(date '+%b %d')" \
    | grep -oP 'from \K[\d.]+' \
    | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- Топ перебираемых логинов ---"
grep "Invalid user" "$LOGFILE" | grep "$(date '+%b %d')" \
    | awk '{print $8}' \
    | sort | uniq -c | sort -rn | head -10

echo ""
echo "--- fail2ban статус ---"
fail2ban-client status sshd 2>/dev/null || echo "fail2ban не запущен"

} > "$REPORT"

# Отправить на почту (если настроена)
# mail -s "SSH Report $(hostname)" admin@example.com < "$REPORT"

cat "$REPORT"
```

### Auditd - расширенный аудит

```bash
# Установка
apt install auditd

# Отслеживать попытки входа SSH
auditctl -a always,exit -F arch=b64 -S execve -F path=/usr/sbin/sshd -k ssh_exec
auditctl -w /etc/ssh/sshd_config -p wa -k sshd_config   # изменение конфига
auditctl -w /root/.ssh/ -p wa -k root_ssh                 # изменение ключей root

# Постоянные правила
cat >> /etc/audit/rules.d/ssh.rules << 'EOF'
-w /etc/ssh/sshd_config -p wa -k sshd_config
-w /root/.ssh/ -p wa -k root_ssh
-w /home -p wa -k user_ssh
EOF

# Просмотр событий
ausearch -k sshd_config
ausearch -k root_ssh
aureport --auth                        # отчёт по аутентификации
aureport --login                       # отчёт по входам
```

---

## Защита приватных ключей

### Passphrase для ключей

```bash
# Всегда использовать passphrase для приватных ключей!
ssh-keygen -t ed25519 -C "alice@work"
# Enter passphrase: (надёжная фраза)

# Изменить passphrase существующего ключа
ssh-keygen -p -f ~/.ssh/id_ed25519

# Проверить есть ли passphrase у ключа
ssh-keygen -y -P "" -f ~/.ssh/id_ed25519 2>&1 | grep -q "incorrect passphrase" && echo "Passphrase SET" || echo "NO passphrase"
```

### Безопасное хранение ключей

```bash
# Права файлов (уже разбирали, но повторим для clarity)
chmod 700 ~/.ssh/
chmod 600 ~/.ssh/id_ed25519          # приватный ключ
chmod 644 ~/.ssh/id_ed25519.pub      # публичный ключ
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/config
chmod 644 ~/.ssh/known_hosts

# Проверить права одной командой
ls -la ~/.ssh/
# Если права неверны — сразу исправить:
find ~/.ssh -name "id_*" ! -name "*.pub" -exec chmod 600 {} \;
find ~/.ssh -name "*.pub" -exec chmod 644 {} \;

# Проверить что файл принадлежит правильному пользователю
ls -la ~/.ssh/authorized_keys
# -rw------- 1 alice alice 567 Jun 10 10:00 /home/alice/.ssh/authorized_keys

# Проверить authorized_keys на подозрительные ключи
cat ~/.ssh/authorized_keys | while read line; do
    echo "$line" | ssh-keygen -lf -
done
```

### Certificate Authority для SSH (SSH CA)

SSH CA позволяет подписывать ключи вместо управления authorized_keys на каждом сервере.

```bash
# Создать CA ключ (хранить в сейфе!)
ssh-keygen -t ed25519 -f /etc/ssh/ca_key -C "SSH Certificate Authority"

# Настроить sервер доверять CA
# /etc/ssh/sshd_config:
TrustedUserCAKeys /etc/ssh/ca_key.pub

# Подписать ключ пользователя (на CA машине)
ssh-keygen -s /etc/ssh/ca_key \
    -I "alice@laptop" \              # identity
    -n alice,admin \                 # разрешённые usernames
    -V +52w \                        # срок действия 52 недели
    ~/.ssh/id_ed25519.pub

# Создаётся файл: ~/.ssh/id_ed25519-cert.pub
ssh-keygen -Lf ~/.ssh/id_ed25519-cert.pub
# Type: ssh-ed25519-cert-v01@openssh.com user certificate
# Public key: ED25519-CERT SHA256:...
# Valid: from 2024-01-01T00:00:00 to 2025-01-01T00:00:00
# Principals: alice,admin

# Теперь alice может войти на ЛЮБОЙ сервер с этим CA без authorized_keys!
ssh alice@any-server-with-ca
```

---

## Распространённые атаки и защита

### Brute Force

```
Атака: миллионы попыток паролей
Защита:
PasswordAuthentication no
fail2ban с bantime > 1 часа
UFW rate limiting
Смена порта (уменьшает шум, не безопасность)
```

### MITM (Man-in-the-Middle)

```bash
# Атака: поддельный SSH сервер при первом подключении
# "The authenticity of host can't be established..."
# → Пользователь жмёт "yes" → MITM

# Защита:
# 1. Предварительно добавить fingerprint в known_hosts
ssh-keyscan -H server.example.com >> ~/.ssh/known_hosts

# 2. Проверить fingerprint вручную (по другому каналу)
ssh -o FingerprintHash=sha256 user@host
# SHA256:xxxxxxxxxxxxxxx

# 3. Запретить принятие новых хостов в скриптах
BatchMode yes                    # в ~/.ssh/config
StrictHostKeyChecking yes        # отклонять неизвестные хосты

# 4. SSHFP DNS записи
# На сервере:
ssh-keygen -r server.example.com
# Добавить SSHFP записи в DNS зону

# Клиент проверит DNS:
ssh -o VerifyHostKeyDNS=yes user@server.example.com
```

### Credential Stuffing

```
Атака: использование утёкших пар логин/пароль
Защита:
PasswordAuthentication no (главная защита)
AllowUsers (ограничить круг пользователей)
fail2ban (дополнительный слой)
```

---

## Шпаргалка безопасности

```bash
# Самое важное в sshd_config:
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3
AllowUsers alice bob
LogLevel VERBOSE

# fail2ban статус:
fail2ban-client status sshd

# Посмотреть кто входит:
journalctl _COMM=sshd | grep "Accepted\|Failed" | tail -20

# Топ атакующих IP:
grep "Failed" /var/log/auth.log | grep -oP 'from \K[\d.]+' | sort | uniq -c | sort -rn | head

# Проверить права ~/.ssh/:
ls -la ~/.ssh/

# Проверить конфиг sshd:
sshd -T | grep -E "permitroot|passwordauth|maxauth|allowusers"

# Разблокировать себя в fail2ban:
fail2ban-client unban MY_IP

# Проверить блокировки iptables:
iptables -n -L INPUT | grep DROP

# Аудит authorized_keys:
for f in /home/*/.ssh/authorized_keys /root/.ssh/authorized_keys; do
    [ -f "$f" ] && echo "=== $f ===" && cat "$f" | while read line; do
        echo "$line" | ssh-keygen -lf - 2>/dev/null
    done
done
```

---

## Ссылки

- [OpenSSH Security](https://www.openssh.com/security.html) - история CVE OpenSSH
- [ssh-audit](https://github.com/jtesta/ssh-audit) - аудит SSH сервера
- [Mozilla SSH Guidelines](https://infosec.mozilla.org/guidelines/openssh) - рекомендации Mozilla
- [fail2ban docs](https://www.fail2ban.org/wiki/index.php/MANUAL_0_8) - документация fail2ban
- [SSH Certificate Authority](https://engineering.fb.com/2016/09/12/security/scalable-and-secure-access-with-ssh/) - FB статья про SSH CA
