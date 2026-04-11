---
title: "SSH Hardening - настройка безопасного сервера"
description: "В данной работе настроим SSH: сгенерируем Ed25519-ключ, заблокируем вход по паролю и под root, сменим порт, установим fail2ban и проверим его работу симуляцией брутфорс-атаки"
image: "/images/ssh_hardening_sec/ssh_main.jpg"
date: "2026-04-11"
---

## Введение

SSH - основной способ удалённого управления Linux-серверами. По умолчанию он настроен для удобства, а не для безопасности: стандартный порт 22, разрешён вход под root, принимаются пароли. Именно поэтому порт 22 - один из самых сканируемых в интернете.

В данной работе настроим SSH: сгенерируем Ed25519-ключ, заблокируем вход по паролю и под root, сменим порт, установим fail2ban и проверим его работу симуляцией брутфорс-атаки. В финале посмотрим на SSH-трафик в Wireshark — что именно видно снаружи.

| Параметр | Значение |
| --- | --- |
| Сервер | Ubuntu Server, openssh-server |
| Клиент | Parrot OS |
| IP сервера | 10.10.70.130 |
| IP клиента | 10.10.70.129 |
| Итоговый порт | 2222 |

---

## Теоретическая база

### Почему Ed25519, а не RSA

Ed25519 - современный алгоритм на основе эллиптических кривых. Ключ длиной 256 бит обеспечивает безопасность сравнимую с RSA-3072, но генерируется быстрее, подписывает быстрее и короче по размеру. Все современные OpenSSH-клиенты поддерживают его.

### Что делает fail2ban

Fail2ban читает системные логи (`/var/log/auth.log`) и при обнаружении серии неудачных попыток входа добавляет IP-адрес атакующего в правила iptables/nftables - блокирует его на уровне сети. Каждый набор правил называется **jail** (тюрьма).

### Что видно в SSH-трафике снаружи

После TCP handshake SSH немедленно устанавливает зашифрованный канал. Снаружи виден только факт подключения: IP-адреса, порты и размеры пакетов. Содержимое - команды, пароли, данные — зашифровано и недоступно наблюдателю.

---

## Фаза 1. Установка и запуск SSH-сервера

### Шаг 1. Установка openssh-server

```bash
sudo apt install openssh-server -y
```

![01_openssh_install](/handson/images/ssh_hardening_sec/01_openssh_install.png)

### Шаг 2. Запуск и проверка статуса

По умолчанию сервис может быть отключён. Включаем автозапуск и стартуем:

```bash
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

![02_ssh_status](/handson/images/ssh_hardening_sec/02_ssh_status.png)

Статус `active (running)` - SSH принимает подключения. Создан симлинк в `/etc/systemd/system/` - сервис будет подниматься при каждой загрузке.

---

## Фаза 2. Генерация ключей и настройка беспарольного входа

### Шаг 3. Генерация Ed25519 ключа на клиенте

```bash
ssh-keygen -t ed25519 -C "lab-key"
# Путь - Enter (по умолчанию ~/.ssh/id_ed25519)
# Passphrase - задаем пароль
```

![03_lab_key](/handson/images/ssh_hardening_sec/03_lab_key.png)

### Шаг 4. Проверка созданных ключей

```bash
ls -la ~/.ssh/
cat ~/.ssh/id_ed25519.pub
```

![04_check](/handson/images/ssh_hardening_sec/04_check.png)

Созданы два файла: приватный ключ `id_ed25519` с правами `600` (только владелец) и публичный `id_ed25519.pub` с правами `644`. Приватный ключ никогда не покидает клиентскую машину.

### Шаг 5. Копирование публичного ключа на сервер

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@10.10.70.130
```

![05_public](/handson/images/ssh_hardening_sec/05_public.png)

`ssh-copy-id` подключается по паролю и добавляет публичный ключ в `~/.ssh/authorized_keys` на сервере. После этого пароль больше не нужен.

### Шаг 6. Проверка входа по ключу

```bash
ssh ubuntu@10.10.70.130
cat ~/.ssh/authorized_keys
```

![06_copy_pub_key](/handson/images/ssh_hardening_sec/06_copy_pub_key.png)

Вход прошёл без запроса пароля. В `authorized_keys` - публичный ключ с комментарием `lab-key`. Теперь можно отключать парольную аутентификацию.

---

## Фаза 3. Hardening sshd_config

### Шаг 7. Бэкап конфигурации

Перед любыми изменениями в конфиге - сохраняем оригинал:

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
ls -la /etc/ssh/
```

![07_backup](/handson/images/ssh_hardening_sec/07_backup.png)

Файл `sshd_config.backup` - страховка. Если после правок SSH не запустится, восстанавливаем оригинал командой `sudo cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config`.

### Шаг 8. Смена порта

```bash
sudo nano /etc/ssh/sshd_config
```

```
Port 2222
```

![08_port2222](/handson/images/ssh_hardening_sec/08_port2222.png)

Порт 22 сканируется автоматически миллионами ботов каждый день. Смена на нестандартный порт не даёт настоящей защиты, но убирает весь автоматический шум из логов.

### Шаг 9. Запрет входа под root

```
PermitRootLogin no
```

![09_permitrootlogin](/handson/images/ssh_hardening_sec/09_permitrootlogin.png)

Прямое подключение под root закрыто. Администраторы входят под своим пользователем и используют `sudo` - все привилегированные действия остаются в логах с именем реального пользователя.

### Шаг 10. Ограничение пользователей

```
AllowUsers ubuntu
```

![10_allowusers](/handson/images/ssh_hardening_sec/10_allowusers.png)

Даже если в системе появятся другие пользователи с ключами - они не смогут подключиться по SSH. Явный белый список лучше неявного разрешения.

### Шаг 11. Дополнительные параметры hardening

```
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
```

![11_extra_hardening](/handson/images/ssh_hardening_sec/11_extra_hardening.png)

| Параметр | Значение | Зачем |
| --- | --- | --- |
| `MaxAuthTries` | 3 | Меньше попыток до разрыва соединения |
| `LoginGraceTime` | 20 | Окно аутентификации — 20 секунд вместо 120 |
| `ClientAliveInterval` | 300 | Разрывает зависшие сессии |
| `X11Forwarding` | no | Закрывает проброс графических приложений |
| `AllowTcpForwarding` | no | Запрещает использование SSH как туннеля |

### Шаг 12. Проверка синтаксиса и перезапуск

Обязательная проверка перед перезапуском - один неверный символ в конфиге может заблокировать доступ к серверу навсегда:

```bash
sudo sshd -t
echo "Exit code: $?"   # 0 = конфиг валиден

sudo systemctl restart ssh
sudo systemctl status ssh
```

![12_restart](/handson/images/ssh_hardening_sec/12_restart.png)

Код возврата `0` - конфиг валиден. Сервис перезапустился и работает на порту 2222.

### Шаг 13. Проверка нового порта

С клиента проверяем оба порта:

```bash
ssh -p 2222 ubuntu@10.10.70.130   # работает
ssh ubuntu@10.10.70.130           # Connection refused
```

![13_2222_port](/handson/images/ssh_hardening_sec/13_2222_port.png)

Порт 22 закрыт - `Connection refused`. Подключение через 2222 с ключом проходит без пароля.

---

## Фаза 4. Установка и настройка fail2ban

### Шаг 14. Установка fail2ban

```bash
sudo apt install fail2ban -y
```

![14_fail2ban](/handson/images/ssh_hardening_sec/14_fail2ban.png)

### Шаг 15. Создание локального конфига

`jail.conf` перезаписывается при обновлении пакета. Все изменения вносим только в `jail.local`:

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

![15_fail2ban_create_config](/handson/images/ssh_hardening_sec/15_fail2ban_create_config.png)

### Шаг 16. Настройка jail для SSH

Находим секцию `[sshd]` и приводим к такому виду:

```ini
[sshd]
enabled  = true
port     = 2222
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 1h
findtime = 10m
```

![16_sshd](/handson/images/ssh_hardening_sec/16_sshd.png)

3 неудачные попытки в течение 10 минут - бан на 1 час. `port = 2222` обязательно совпадает с портом в `sshd_config`.

### Шаг 17. Запуск и проверка fail2ban

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo systemctl status fail2ban

sudo fail2ban-client status
sudo fail2ban-client status sshd
```

![17_fail2ban_start](/handson/images/ssh_hardening_sec/17_fail2ban_start.png)

Jail `sshd` активен. Currently banned: 0, Currently failed: 0 - система чистая, атак ещё не было.

---

## Фаза 5. Симуляция брутфорс-атаки

### Шаг 18. Запуск атаки с клиента

С машины `10.10.70.129` (Parrot OS) запускаем цикл попыток входа с неверным паролем:

```bash
for i in {1..5}; do
    echo "Attempt $i"
    ssh -p 2222 ubuntu@10.10.70.130
done
```

![18_bruteforce](/handson/images/ssh_hardening_sec/18_bruteforce.png)

### Шаг 19. Результат - IP заблокирован

```
Attempt 1: 2 неудачные попытки → Connection closed
Attempt 2: Too many authentication failures
Attempt 3: соединение отклонено - IP уже в бане
```

![19_fail](/handson/images/ssh_hardening_sec/19_fail.png)

После 3 неудачных попыток fail2ban добавил `10.10.70.129` в блокировку. Все последующие подключения с этого IP отклоняются на уровне сети - даже TCP handshake не завершается.

### Шаг 20. Проверка бана на сервере

```bash
sudo fail2ban-client status sshd
```

![20_fail2ban_look](/handson/images/ssh_hardening_sec/20_fail2ban_look.png)

```
Currently failed:  1
Total failed:      9
Currently banned:  1
Banned IP list:    10.10.70.129
```

### Шаг 21. Логи - как fail2ban принял решение о бане

```bash
sudo tail -50 /var/log/auth.log | grep -E "Failed|Invalid|Ban"
sudo tail -20 /var/log/fail2ban.log
```

![21_logs](/handson/images/ssh_hardening_sec/21_logs.png)

В `auth.log` - пять строк `Failed password for invalid user ubuntu from 10.10.70.129`. В `fail2ban.log` видна вся цепочка: `Found 10.10.70.129` несколько раз подряд, затем `NOTICE [sshd] Ban 10.10.70.129`. Fail2ban обнаружил паттерн и заблокировал IP.

---

## Фаза 6. Снятие бана и восстановление

### Шаг 22. Разбан IP вручную

```bash
sudo fail2ban-client set sshd unbanip 10.10.70.129
sudo fail2ban-client status sshd
```

![22_unban](/handson/images/ssh_hardening_sec/22_unban.png)

Команда вернула `1` - успешно. Currently banned: 0.

### Шаг 23. Проверка подключения после разбана

```bash
ssh -p 2222 ubuntu@10.10.70.130
```

![23_connecting](images/lab03_ssh/23_connecting.png)

Подключение снова разрешено.

---

## Фаза 7. Анализ трафика в Wireshark

### Шаг 24. TCP handshake на порту 2222

Запускаем Wireshark с фильтром `tcp.port == 2222` и подключаемся по SSH. В первых пакетах виден стандартный TCP handshake:

```
SYN     → 10.10.70.129:47504 → 10.10.70.130:2222
SYN-ACK ← 10.10.70.130:2222  → 10.10.70.129:47504
ACK     → подтверждение
```

![24_wireshark](/handson/images/ssh_hardening_sec/24_wireshark.png)

### Шаг 25. Что видно снаружи - и чего не видно

После TCP handshake SSH сразу переходит к обмену ключами и шифрованию. Все последующие пакеты - зашифрованные данные.

![25_syn](/handson/images/ssh_hardening_sec/25_syn.png)

В деталях пакета видно: `Flags: 0x002 (SYN)`, Destination Port: 2222. Это всё что доступно наблюдателю снаружи - факт подключения с конкретного IP на конкретный порт. Команды, пароли, данные зашифрованы и невидимы.

> Перехватчик видит: кто подключился, когда, на какой порт, и сколько данных передано. Что именно передавалось - недоступно без приватного ключа сервера.

---

## Фаза 8. Финальная проверка

### Шаг 26. Итоговый аудит конфигурации

```bash
# Что реально слушает SSH
sudo ss -tlnp | grep 2222

# Активная конфигурация — что применилось
sudo sshd -T | grep -E "port|permitroot|passwordauth|allowusers|maxauthtries"

# Статус fail2ban
sudo fail2ban-client status sshd

# Авторизованные ключи
cat ~/.ssh/authorized_keys
```

![26_final_check](/handson/images/ssh_hardening_sec/26_final_check.png)

Всё на месте: порт 2222, `permitrootlogin no`, `maxauthtries 3`, ключ `lab-key` в `authorized_keys`, fail2ban активен.

---

## Итоги и выводы

### Что изменили и зачем

| Параметр | Было | Стало | Эффект |
| --- | --- | --- | --- |
| `Port` | 22 | 2222 | Убирает автоматические сканеры |
| `PermitRootLogin` | yes | no | Root нельзя атаковать напрямую |
| `PasswordAuthentication` | yes | no | Брутфорс паролей невозможен |
| `MaxAuthTries` | 6 | 3 | Меньше попыток до разрыва |
| `LoginGraceTime` | 120 | 20 | Короче окно для атаки |
| `AllowUsers` | все | ubuntu | Явный белый список |
| `X11Forwarding` | yes | no | Закрыт проброс графики |
| `AllowTcpForwarding` | yes | no | Запрещено туннелирование |
| `fail2ban` | нет | bantime=1h, maxretry=3 | Автоблокировка атакующих IP |

### Что показал Wireshark

SSH шифрует трафик сразу после TCP handshake. Снаружи видны только метаданные: IP-адреса, порт назначения, время подключения и объём переданных данных. Содержимое сессии - команды, файлы, пароли - полностью зашифровано и недоступно перехватчику без приватного ключа сервера.

### Цепочка защиты

Настроенный сервер требует одновременного выполнения трёх условий для успешного входа: знать нестандартный порт, иметь приватный Ed25519-ключ и не быть заблокированным fail2ban. Каждый слой независимо усложняет атаку.
