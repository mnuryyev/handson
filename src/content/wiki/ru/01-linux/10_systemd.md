---
title: "Systemd и юниты сервисов"
date: "2026-04-13"
---

Systemd - система инициализации и менеджер сервисов для Linux, пришедшая на смену SysV init и Upstart. Запускается как PID 1, управляет всем жизненным циклом системы: от загрузки до выключения.

---

## Зачем systemd

```
SysV init (старый способ):        systemd (современный):
───────────────────────────────   ──────────────────────────────
Последовательный запуск           Параллельный запуск сервисов
shell скрипты (/etc/init.d/)      декларативные unit файлы
Нет отслеживания зависимостей     Явные зависимости (After=, Requires=)
Нет автоматического перезапуска   Встроенный Restart=on-failure
Логи в /var/log/syslog            Централизованный journald
Нет изоляции сервисов             Cgroups, namespaces, seccomp
```

---

## Архитектура systemd

```
PID 1: systemd
├── systemd-journald    — сбор логов
├── systemd-logind      — сессии пользователей
├── systemd-networkd    — управление сетью
├── systemd-resolved    — DNS резолвер
├── systemd-udevd       — управление устройствами
├── systemd-timesyncd   — синхронизация времени
└── все остальные сервисы (nginx, sshd, postgresql, ...)

Конфигурация:
/lib/systemd/system/       — юниты пакетного менеджера (не редактировать!)
/etc/systemd/system/       — кастомные и переопределённые юниты
/run/systemd/system/       — runtime юниты (временные)
~/.config/systemd/user/    — пользовательские юниты
```

---

## Типы юнитов

| Тип | Расширение | Описание |
|-----|-----------|----------|
| Service | `.service` | Запуск и управление процессом/демоном |
| Timer | `.timer` | Аналог cron, запуск по расписанию |
| Socket | `.socket` | Socket activation — запуск сервиса при подключении |
| Target | `.target` | Группировка юнитов (аналог runlevel) |
| Mount | `.mount` | Монтирование файловых систем |
| Automount | `.automount` | Автомонтирование при обращении |
| Path | `.path` | Мониторинг файлов/директорий |
| Slice | `.slice` | Иерархия cgroups для управления ресурсами |
| Scope | `.scope` | Управление внешне запущенными процессами |
| Device | `.device` | Устройства из udev |
| Swap | `.swap` | Swap пространство |

---

## systemctl — управление сервисами

### Основные команды

```bash
# Запуск, остановка, перезапуск
systemctl start nginx
systemctl stop nginx
systemctl restart nginx
systemctl reload nginx          # перечитать конфиг без остановки (SIGHUP)
systemctl try-restart nginx     # перезапустить только если запущен
systemctl reload-or-restart nginx  # reload если поддерживает, иначе restart

# Статус и информация
systemctl status nginx
systemctl is-active nginx       # active / inactive / failed
systemctl is-enabled nginx      # enabled / disabled
systemctl is-failed nginx

# Автозапуск
systemctl enable nginx          # создать symlink в target
systemctl disable nginx         # удалить symlink
systemctl enable --now nginx    # enable + немедленный запуск
systemctl disable --now nginx   # disable + немедленная остановка

# Маскировка (полный запрет запуска)
systemctl mask nginx            # symlink на /dev/null
systemctl unmask nginx

# Перечитать юниты после изменений
systemctl daemon-reload
```

### Просмотр юнитов

```bash
# Список всех юнитов
systemctl list-units
systemctl list-units --type=service
systemctl list-units --type=service --state=running
systemctl list-units --state=failed

# Список всех установленных юнитов (включая неактивные)
systemctl list-unit-files
systemctl list-unit-files --type=service
systemctl list-unit-files --state=enabled

# Зависимости юнита
systemctl list-dependencies nginx
systemctl list-dependencies --reverse nginx   # кто зависит от nginx

# Показать содержимое юнит-файла
systemctl cat nginx
```

### Управление системой

```bash
# Выключение и перезагрузка
systemctl poweroff
systemctl reboot
systemctl suspend
systemctl hibernate

# Targets (аналог runlevel)
systemctl get-default                    # текущий default target
systemctl set-default multi-user.target  # установить default
systemctl isolate rescue.target          # переключиться в rescue mode

# Аварийный режим
systemctl rescue
systemctl emergency
```

---

## Анатомия юнит-файла .service

```ini
[Unit]
Description=My Application
Documentation=https://example.com/docs
After=network.target postgresql.service
Requires=postgresql.service
Wants=redis.service
BindsTo=postgresql.service
Conflicts=other.service

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStartPre=/opt/myapp/scripts/check-config.sh
ExecStart=/opt/myapp/bin/myapp --config /etc/myapp/config.yaml
ExecStartPost=/opt/myapp/scripts/notify-started.sh
ExecStop=/bin/kill -TERM $MAINPID
ExecStopPost=/opt/myapp/scripts/cleanup.sh
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

---

## Секция [Unit]

### Директивы описания

```ini
Description=Nginx HTTP Server          # человекочитаемое описание
Documentation=man:nginx(8)             # ссылки на документацию
Documentation=https://nginx.org/docs
```

### Директивы зависимостей

```ini
# После — юнит запускается ПОСЛЕ перечисленных
After=network.target
After=network-online.target nss-lookup.target

# До — юнит запускается ДО перечисленных
Before=httpd.service

# Требует — жёсткая зависимость (если зависимость упала — этот тоже)
Requires=postgresql.service

# Хочет — мягкая зависимость (попытается запустить, но не упадёт если не вышло)
Wants=redis.service

# Привязан — если зависимость остановлена/упала — этот тоже останавливается
BindsTo=some-device.device

# Конфликты — не могут работать одновременно
Conflicts=apache2.service

# Зависит от — если зависимость не запущена, этот тоже не запускается
# (менее строго чем Requires)
Requisite=network.target
```

### Разница After/Requires/Wants

```
Requires=B  →  "Запусти B перед мной. Если B упал, останови меня."
After=B     →  "Запускай меня только ПОСЛЕ того, как B запущен."
Wants=B     →  "Попробуй запустить B, но мне всё равно, вышло ли это."

Типичная комбинация:
After=postgresql.service
Requires=postgresql.service
→  "Запустить postgres перед мной, и если postgres упал — я тоже падаю."

After без Requires:
After=postgresql.service
→  "Дождись запуска postgres, но я запущусь даже если postgres не работает."
```

---

## Секция [Service]

### Тип сервиса (Type=)

```ini
Type=simple     # По умолчанию. ExecStart — основной процесс.
                # systemd считает сервис запущенным сразу.

Type=exec       # Как simple, но ждёт завершения fork(). Более точный.

Type=forking    # Процесс делает fork() и родитель завершается.
                # Классические демоны (nginx, apache).
                # Нужен PIDFile= для отслеживания.

Type=oneshot    # Процесс завершается после работы.
                # Для одноразовых задач (миграции, настройка).
                # RemainAfterExit=yes — считать "активным" после завершения.

Type=notify     # Как simple, но процесс уведомляет systemd через
                # sd_notify() когда готов. systemd ждёт уведомления.

Type=dbus       # Сервис регистрирует имя на D-Bus.

Type=idle       # Как simple, но запуск откладывается пока не завершатся
                # другие задачи (для не срочных сервисов).
```

```ini
# Пример forking сервиса (nginx)
[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t        # проверить конфиг
ExecStart=/usr/sbin/nginx
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s QUIT $MAINPID

# Пример oneshot (миграция БД)
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/myapp/manage.py migrate
User=myapp
```

### Команды запуска

```ini
ExecStartPre=/path/to/script   # до запуска (можно несколько)
ExecStart=/path/to/binary      # основная команда (обязательна!)
ExecStartPost=/path/to/script  # после успешного запуска

ExecStop=/bin/kill -TERM $MAINPID     # при остановке
ExecStopPost=/path/to/cleanup         # всегда после остановки

ExecReload=/bin/kill -HUP $MAINPID    # при reload

# Префиксы перед командой:
ExecStartPre=-/path/to/script  # - игнорировать ошибку (exit code != 0)
ExecStart=!/path/to/privileged # ! повышение привилегий через PolicyKit
```

### Перезапуск

```ini
Restart=no               # не перезапускать (по умолчанию)
Restart=on-success       # только при clean exit (code 0)
Restart=on-failure       # при ошибке (ненулевой код, сигнал, timeout)
Restart=on-abnormal      # при сигнале, timeout, watchdog
Restart=on-watchdog      # только при watchdog timeout
Restart=on-abort         # только при uncaught signal
Restart=always           # всегда, кроме systemctl stop

RestartSec=5s            # пауза перед перезапуском
RestartSec=5             # секунды (5s, 5min, 500ms)

StartLimitBurst=5        # максимум 5 перезапусков
StartLimitIntervalSec=10s # за 10 секунд (защита от restart loop)
```

### Окружение и пользователь

```ini
User=nginx              # запускать от имени пользователя
Group=nginx             # группа
WorkingDirectory=/var/www  # рабочая директория

# Переменные окружения
Environment="NODE_ENV=production" "PORT=3000"
EnvironmentFile=/etc/myapp/env        # файл с переменными
EnvironmentFile=-/etc/myapp/env.local # (-) игнорировать если файл отсутствует

# Стандартные потоки
StandardOutput=journal   # stdout → journald (по умолчанию)
StandardError=journal    # stderr → journald
StandardOutput=append:/var/log/myapp.log  # в файл
StandardOutput=null      # /dev/null
```

### Тайм-ауты

```ini
TimeoutStartSec=30       # максимум ожидания запуска (0 = бесконечно)
TimeoutStopSec=30        # максимум ожидания остановки
TimeoutSec=30            # оба сразу

TimeoutStartSec=infinity # никогда не прерывать запуск
```

---

## Секция [Install]

Определяет, в каком target юнит должен быть активирован при `systemctl enable`.

```ini
[Install]
WantedBy=multi-user.target    # обычно для серверных сервисов
WantedBy=graphical.target     # для десктоп приложений
RequiredBy=some.target        # жёсткая зависимость
Alias=myapp.service           # альтернативное имя
Also=myapp-watcher.service    # включить вместе с этим юнитом
```

### Стандартные targets

```
poweroff.target    →   runlevel 0 (выключение)
rescue.target      →   runlevel 1 (single user)
multi-user.target  →   runlevel 2,3,4 (многопользовательский, без GUI)
graphical.target   →   runlevel 5 (с GUI)
reboot.target      →   runlevel 6 (перезагрузка)

Специальные:
network.target          — сеть настроена (но не обязательно онлайн)
network-online.target   — сеть точно онлайн
sysinit.target          — ранняя инициализация системы
basic.target            — базовая инициализация завершена
```

---

## Переопределение юнитов (Drop-in files)

Не редактируй системные юниты напрямую — они перезапишутся при обновлении.

```bash
# Создать drop-in файл
systemctl edit nginx

# Это создаёт /etc/systemd/system/nginx.service.d/override.conf
# Редактор откроется автоматически

# Пример override.conf:
[Service]
Environment="NGINX_OPTS=-g 'daemon off;'"
Restart=always
RestartSec=3s
LimitNOFILE=65536

# Посмотреть итоговый юнит с override
systemctl cat nginx

# Удалить override
systemctl revert nginx
```

```bash
# Вручную создать drop-in
mkdir -p /etc/systemd/system/nginx.service.d/
cat > /etc/systemd/system/nginx.service.d/override.conf << 'EOF'
[Service]
Restart=always
RestartSec=5
Environment="EXTRA_OPTS=--debug"
EOF

systemctl daemon-reload
systemctl restart nginx
```

---

## Таймеры (Timer Units)

Таймеры — замена cron в systemd.

### Пример: резервное копирование каждую ночь

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Backup Service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
User=backup
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily Backup Timer
Requires=backup.service

[Timer]
OnCalendar=*-*-* 02:30:00    # каждый день в 02:30
AccuracySec=1min              # точность (по умолчанию 1 минута)
Persistent=true               # запустить если пропустили (после перезагрузки)
RandomizedDelaySec=15min      # случайная задержка до 15 минут

[Install]
WantedBy=timers.target
```

```bash
# Управление таймерами
systemctl enable --now backup.timer
systemctl list-timers                  # все таймеры
systemctl list-timers --all

# Тестирование расписания
systemd-analyze calendar "*-*-* 02:30:00"
systemd-analyze calendar "Mon *-*-* 04:00:00"   # каждый понедельник

# Расписание OnCalendar:
# daily               = *-*-* 00:00:00
# weekly              = Mon *-*-* 00:00:00
# monthly             = *-*-01 00:00:00
# hourly              = *-*-* *:00:00
# minutely            = *-*-* *:*:00
# *-*-* 14:00,20:00   = два раза в день
```

### Монотонные таймеры

```ini
[Timer]
OnBootSec=5min          # через 5 минут после загрузки
OnActiveSec=1h          # каждый час после активации таймера
OnUnitActiveSec=6h      # каждые 6 часов после последнего запуска сервиса
OnStartupSec=10min      # через 10 минут после старта systemd
```

---

## Socket Activation

Socket activation - запуск сервиса только при поступлении первого запроса.

```ini
# /etc/systemd/system/myapp.socket
[Unit]
Description=MyApp Socket

[Socket]
ListenStream=8080         # TCP порт
Accept=no                 # один процесс обрабатывает все соединения

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=MyApp Service

[Service]
ExecStart=/opt/myapp/bin/myapp
# Получает сокет через файловый дескриптор 3 (LISTEN_FDS)
StandardInput=socket
```

---

## Безопасность и изоляция

Systemd предоставляет мощные механизмы изоляции сервисов:

```ini
[Service]
# Файловая система
ProtectSystem=strict           # /usr, /boot, /etc только для чтения
ProtectSystem=full             # /usr, /boot только для чтения
ProtectHome=true               # /home, /root, /run/user недоступны
PrivateTmp=true                # изолированный /tmp
ReadOnlyPaths=/etc             # только чтение
ReadWritePaths=/var/lib/myapp  # разрешить запись только сюда
InaccessiblePaths=/proc/sys    # полностью запретить доступ
NoNewPrivileges=true           # нельзя повысить привилегии
TemporaryFileSystem=/var       # tmpfs вместо реальной директории

# Сеть
PrivateNetwork=true            # изолированная сеть (только loopback)
IPAddressDeny=any              # запрет сетевых соединений
IPAddressAllow=192.168.1.0/24  # разрешить только эту сеть

# Пользователь и capabilities
User=myapp
Group=myapp
DynamicUser=true               # создать временного пользователя (автоматически)
AmbientCapabilities=CAP_NET_BIND_SERVICE   # слушать порт < 1024 без root
CapabilityBoundingSet=CAP_NET_BIND_SERVICE # ограничить набор capabilities

# Системные вызовы (seccomp)
SystemCallFilter=@system-service   # стандартный набор
SystemCallFilter=~@debug @mount    # запретить debug и mount syscalls
SystemCallArchitectures=native     # только нативная архитектура

# Ресурсы
LimitNOFILE=65536              # макс. открытых файлов
LimitNPROC=512                 # макс. процессов
MemoryLimit=512M               # (устарело, лучше MemoryMax)
MemoryMax=512M                 # максимум памяти (cgroup v2)
CPUQuota=50%                   # максимум 50% CPU
```

```bash
# Проверить безопасность юнита
systemd-analyze security nginx
# EXPOSED: по умолчанию
# ...подробный список проблем...

# Анализ exposure score (0 = безопасно, 10 = небезопасно)
systemd-analyze security nginx | tail -5
```

---

## journald - просмотр логов

```bash
# Основные команды
journalctl                              # все логи
journalctl -u nginx                     # только nginx
journalctl -u nginx -f                  # follow (в реальном времени)
journalctl -u nginx -n 50               # последние 50 строк
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since "2024-01-01" --until "2024-01-02"
journalctl -u nginx -p err              # только ошибки
journalctl -u nginx -p warning..err     # warning и выше

# Приоритеты (как syslog):
# 0=emerg, 1=alert, 2=crit, 3=err, 4=warning, 5=notice, 6=info, 7=debug

# По времени
journalctl --since today
journalctl --since yesterday
journalctl --since "2024-01-15 10:00:00"
journalctl -b                           # с текущей загрузки
journalctl -b -1                        # с предыдущей загрузки
journalctl --list-boots                 # список загрузок

# Вывод в разных форматах
journalctl -o json-pretty               # JSON
journalctl -o short-iso                 # с ISO временем
journalctl -o verbose                   # максимум полей
journalctl -o cat                       # только сообщения

# Дисковое пространство логов
journalctl --disk-usage
journalctl --vacuum-size=1G            # удалить старые логи до 1GB
journalctl --vacuum-time=2weeks        # удалить старше 2 недель
```

---

## systemd-analyze - анализ загрузки

```bash
# Общее время загрузки
systemd-analyze time
# Startup finished in 1.234s (kernel) + 3.456s (userspace) = 4.690s

# Цепочка критического пути
systemd-analyze critical-chain

# Граф загрузки (SVG)
systemd-analyze plot > boot.svg

# Время каждого юнита
systemd-analyze blame
# 2.345s postgresql.service
# 1.234s networking.service
# ...

# Проверить юнит-файл на ошибки
systemd-analyze verify /etc/systemd/system/myapp.service

# Тест расписания таймера
systemd-analyze calendar "Mon,Wed,Fri *-*-* 10:00:00"
```

---

## Создание кастомного сервиса - полный пример

### Node.js приложение

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js Application
Documentation=https://github.com/myorg/myapp
After=network-online.target
Wants=network-online.target
After=postgresql.service redis.service
Requires=postgresql.service

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp

# Переменные окружения
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/etc/myapp/env

# Команды
ExecStartPre=/usr/bin/node /opt/myapp/scripts/preflight.js
ExecStart=/usr/bin/node /opt/myapp/server.js
ExecReload=/bin/kill -USR2 $MAINPID

# Перезапуск
Restart=on-failure
RestartSec=5s
StartLimitBurst=3
StartLimitIntervalSec=30s

# Безопасность
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/myapp/logs /var/lib/myapp

# Ресурсы
LimitNOFILE=65536
MemoryMax=512M
CPUQuota=80%

# Логирование
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

# Таймауты
TimeoutStartSec=60
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
# Развернуть
systemctl daemon-reload
systemctl enable --now myapp
systemctl status myapp
journalctl -u myapp -f
```

### Python/Django приложение с gunicorn

```ini
# /etc/systemd/system/gunicorn.service
[Unit]
Description=Gunicorn Django App
After=network.target postgresql.service

[Service]
Type=notify
NotifyAccess=all
User=www-data
Group=www-data
WorkingDirectory=/var/www/myproject
RuntimeDirectory=gunicorn
EnvironmentFile=/var/www/myproject/.env

ExecStart=/var/www/myproject/venv/bin/gunicorn \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind unix:/run/gunicorn/gunicorn.sock \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log \
    myproject.wsgi:application

ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## Пользовательские юниты (User Services)

```bash
# Директория для пользовательских юнитов
~/.config/systemd/user/

# Управление (без sudo!)
systemctl --user start myapp
systemctl --user enable myapp
systemctl --user status myapp
journalctl --user -u myapp

# Запустить пользовательские сервисы без активной сессии (после logout)
loginctl enable-linger username
```

---

## Полезные однострочники

```bash
# Найти упавшие сервисы
systemctl list-units --state=failed

# Рестартовать все упавшие
systemctl reset-failed
systemctl start $(systemctl list-units --state=failed --no-legend | awk '{print $1}')

# Смотреть логи в реальном времени всей системы
journalctl -f

# Сколько места занимают логи
journalctl --disk-usage

# Проверить, когда последний раз запускался сервис
systemctl show nginx --property=ActiveEnterTimestamp

# ExecStart команда сервиса
systemctl show nginx --property=ExecStart

# Переменные окружения сервиса
systemctl show nginx -p Environment

# Все properties юнита
systemctl show nginx

# Какие юниты изменились после последнего daemon-reload
systemctl --state=active,failed list-units

# Дерево cgroups (процессы сервисов)
systemd-cgls
systemd-cgtop    # топ по cgroups
```

---

## Шпаргалка

```
Основные команды:
systemctl start|stop|restart|reload <unit>
systemctl enable|disable|mask|unmask <unit>
systemctl status <unit>
systemctl daemon-reload          ← после изменения юнит-файлов!

Просмотр:
systemctl list-units --state=failed
systemctl list-timers
journalctl -u <unit> -f
journalctl -u <unit> -n 100

Конфигурация:
/lib/systemd/system/    — системные юниты (не трогать)
/etc/systemd/system/    — кастомные юниты
systemctl edit <unit>   — безопасное переопределение

Типы:
Type=simple    — обычный процесс
Type=forking   — классический демон с fork()
Type=oneshot   — одноразовая задача
Type=notify    — сервис сообщает о готовности

Рестарт:
Restart=on-failure   — перезапустить при ошибке
Restart=always       — всегда (кроме systemctl stop)

Безопасность:
PrivateTmp=true
NoNewPrivileges=true
ProtectSystem=strict
DynamicUser=true
```

---

## Ссылки

- [systemd.service man](https://www.freedesktop.org/software/systemd/man/systemd.service.html) - документация .service
- [systemd.timer man](https://www.freedesktop.org/software/systemd/man/systemd.timer.html) - документация .timer
- [systemd.exec man](https://www.freedesktop.org/software/systemd/man/systemd.exec.html) - все директивы [Service]
- [Arch Wiki systemd](https://wiki.archlinux.org/title/systemd) - лучший справочник
