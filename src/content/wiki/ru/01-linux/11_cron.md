---
title: "Cron и планировщики задач"
date: "2026-04-14"
---


Планировщики задач позволяют выполнять команды автоматически по расписанию. В Linux основным инструментом исторически является cron, в современных системах - systemd timers, в облаке - специализированные сервисы.

---

## Cron - обзор

Cron - классический демон планировщика задач. Работает в фоне, просыпается каждую минуту, проверяет расписание и выполняет задачи.

```
Демоны cron:
crond       — RHEL, CentOS, Fedora
cron        — Debian, Ubuntu
fcron       — альтернатива с дополнительными возможностями
anacron     — для систем, которые не работают 24/7
```

---

## Синтаксис crontab

```
# ┌───────── минута (0–59)
# │ ┌─────── час (0–23)
# │ │ ┌───── день месяца (1–31)
# │ │ │ ┌─── месяц (1–12 или jan–dec)
# │ │ │ │ ┌─ день недели (0–7, 0 и 7 = воскресенье, или sun–sat)
# │ │ │ │ │
# * * * * *  команда_для_выполнения
```

### Специальные символы

| Символ | Описание | Пример |
|--------|----------|--------|
| `*` | Любое значение | `* * * * *` — каждую минуту |
| `,` | Список значений | `0 9,17 * * *` — в 9:00 и 17:00 |
| `-` | Диапазон | `0 9-17 * * *` — каждый час с 9 до 17 |
| `/` | Шаг | `*/15 * * * *` — каждые 15 минут |
| `L` | Последний | `0 0 L * *` — последний день месяца (не везде) |
| `#` | N-й день недели | `0 0 * * 1#2` — второй понедельник (не везде) |

### Примеры расписаний

```bash
# Каждую минуту
* * * * *

# Каждые 5 минут
*/5 * * * *

# Каждые 15 минут
*/15 * * * *

# Каждый час (в 0 минут)
0 * * * *

# Каждые 2 часа
0 */2 * * *

# Каждый день в 2:30 ночи
30 2 * * *

# По рабочим дням в 9:00
0 9 * * 1-5

# По выходным в 10:00
0 10 * * 6,7

# Каждый понедельник в 8:00
0 8 * * 1

# Каждые 6 часов
0 */6 * * *

# 1-го числа каждого месяца в полночь
0 0 1 * *

# 1-го января в полночь
0 0 1 1 *

# Каждые 10 минут с 9:00 до 18:00 по будням
*/10 9-18 * * 1-5

# Дважды в день — в 8:00 и 20:00
0 8,20 * * *

# Каждые 30 минут с 6:00 до 23:00
*/30 6-23 * * *
```

### Специальные строки (макросы)

```bash
@reboot     # при каждой перезагрузке
@yearly     # раз в год  = 0 0 1 1 *
@annually   # то же что @yearly
@monthly    # раз в месяц = 0 0 1 * *
@weekly     # раз в неделю = 0 0 * * 0
@daily      # раз в день = 0 0 * * *
@midnight   # то же что @daily
@hourly     # каждый час = 0 * * * *
```

---

## Управление crontab

### Пользовательский crontab

```bash
# Редактировать crontab текущего пользователя
crontab -e

# Просмотреть crontab текущего пользователя
crontab -l

# Удалить crontab текущего пользователя
crontab -r

# Управлять crontab другого пользователя (root)
crontab -u alice -e
crontab -u alice -l
crontab -u alice -r

# Импортировать из файла
crontab /path/to/cronfile

# Экспортировать в файл
crontab -l > ~/my_crontab_backup.txt
```

### Системный crontab (/etc/crontab)

```bash
# /etc/crontab - системный crontab (с полем пользователя)
# мин час д.м. месяц д.н. пользователь  команда
  17 *  *  *  *   root    cd / && run-parts --report /etc/cron.hourly
  25 6  *  *  *   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.daily)
  47 6  *  *  7   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.weekly)
  52 6  1  *  *   root    test -x /usr/sbin/anacron || (cd / && run-parts /etc/cron.monthly)
```

### Директории для скриптов

```bash
/etc/cron.d/          # отдельные файлы расписаний (формат как /etc/crontab)
/etc/cron.hourly/     # скрипты, запускаемые каждый час
/etc/cron.daily/      # ежедневные скрипты
/etc/cron.weekly/     # еженедельные скрипты
/etc/cron.monthly/    # ежемесячные скрипты

# Скрипт в /etc/cron.daily/ — просто исполняемый файл без расширения
cat > /etc/cron.daily/cleanup-temp << 'EOF'
#!/bin/bash
find /tmp -type f -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/cleanup-temp
```

### /etc/cron.d/ - отдельные файлы

```bash
# Формат как /etc/crontab — нужно указывать пользователя
cat > /etc/cron.d/myapp << 'EOF'
# Резервное копирование каждую ночь в 3:00
0 3 * * * myapp /opt/myapp/scripts/backup.sh

# Очистка сессий каждый час
0 * * * * www-data /opt/myapp/scripts/cleanup-sessions.php
EOF
```

---

## Вывод и логирование

```bash
# По умолчанию cron отправляет stdout/stderr на почту владельца задачи
# Отключить почтовые уведомления:
MAILTO=""

# Перенаправить вывод в файл
0 2 * * * /path/to/script.sh >> /var/log/myscript.log 2>&1

# Перенаправить только ошибки
0 2 * * * /path/to/script.sh 2>> /var/log/errors.log

# Отбросить весь вывод
0 2 * * * /path/to/script.sh &>/dev/null

# С временной меткой
0 2 * * * echo "$(date): старт" >> /var/log/myscript.log && /path/to/script.sh >> /var/log/myscript.log 2>&1

# Логировать через logger (в syslog)
0 2 * * * /path/to/script.sh 2>&1 | logger -t myscript
```

```bash
# Посмотреть логи cron
grep CRON /var/log/syslog          # Debian/Ubuntu
grep CRON /var/log/cron            # RHEL/CentOS
journalctl -u cron                 # systemd
journalctl _CRON_ACTION=start      # только запуски
```

---

## Переменные окружения в crontab

```bash
# В начале crontab можно задавать переменные
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
MAILTO=""
HOME=/root

# Важно: окружение cron минимально!
# Нет: .bashrc, .bash_profile, .profile
# PATH обычно очень короткий

# Решение: задавать полный PATH или использовать абсолютные пути
0 2 * * * PATH=/usr/local/bin:/usr/bin:/bin; /opt/myapp/backup.sh
0 2 * * * /usr/local/bin/python3 /opt/myapp/script.py

# Загрузить переменные из файла
0 2 * * * . /etc/myapp/env && /opt/myapp/script.sh
0 2 * * * env $(cat /etc/myapp/env | xargs) /opt/myapp/script.sh
```

---

## Практические сценарии

### Резервное копирование

```bash
# Ежедневный backup базы данных в 2:00
0 2 * * * /usr/bin/pg_dump mydb | gzip > /backup/mydb-$(date +\%Y\%m\%d).sql.gz

# Еженедельный полный backup файлов
0 3 * * 0 tar -czf /backup/files-$(date +\%Y\%m\%d).tar.gz /var/www

# Backup с ротацией — хранить только последние 7 дней
0 2 * * * /usr/bin/pg_dump mydb | gzip > /backup/mydb-$(date +\%A).sql.gz
# (Mon, Tue, Wed... — каждый день перезаписывает файл семидневной давности)
```

### Очистка и обслуживание

```bash
# Удалить временные файлы старше 7 дней
0 4 * * * find /tmp -type f -mtime +7 -delete 2>/dev/null

# Ротация логов (если logrotate не настроен)
0 0 * * 0 gzip /var/log/myapp.log && mv /var/log/myapp.log.gz /var/log/archive/ && touch /var/log/myapp.log

# Очистить Docker мусор
0 3 * * 0 /usr/bin/docker system prune -f >> /var/log/docker-cleanup.log 2>&1

# Обновить Let's Encrypt сертификаты
0 3 */2 * * /usr/bin/certbot renew --quiet >> /var/log/certbot.log 2>&1
```

### Мониторинг и алёрты

```bash
# Проверить доступность сервиса каждые 5 минут
*/5 * * * * curl -sf http://localhost:8080/health || echo "SERVICE DOWN $(date)" | mail -s "Alert" admin@example.com

# Проверить свободное место на диске
0 * * * * [ $(df / | awk 'NR==2 {print $5}' | tr -d '%') -gt 90 ] && echo "Disk almost full!" | mail -s "Disk Alert" admin@example.com

# Мониторинг памяти
*/10 * * * * free -m | awk 'NR==2 {printf "RAM: %.1f%% used\n", $3/$2*100}' >> /var/log/mem.log
```

### Синхронизация и обработка данных

```bash
# Синхронизация с S3 каждые 15 минут
*/15 * * * * /usr/local/bin/aws s3 sync /var/data/ s3://mybucket/data/ >> /var/log/s3sync.log 2>&1

# Обработка новых файлов каждую минуту
* * * * * find /incoming -name "*.csv" -newer /tmp/last_processed -exec /opt/process.sh {} \; && touch /tmp/last_processed

# Рассылка ежедневных отчётов в 8:00 по будням
0 8 * * 1-5 /opt/reports/generate.sh | mail -s "Daily Report" team@example.com
```

---

## Лучшие практики cron

```bash
# 1. Всегда используй абсолютные пути
0 2 * * * /usr/bin/python3 /opt/myapp/script.py 
0 2 * * * python3 script.py                       # PATH может не содержать python3

# 2. Перенаправляй вывод
0 2 * * * /path/script.sh >> /var/log/script.log 2>&1  
0 2 * * * /path/script.sh                              # вывод пропадёт или придёт на почту

# 3. Используй блокировку для долгих задач
0 * * * * flock -n /tmp/myscript.lock /path/script.sh   # не запускать если уже работает

# 4. Тестируй скрипты вручную с тем же окружением
env -i HOME=/root SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin /path/script.sh

# 5. Устанавливай таймаут для долгих задач
0 2 * * * timeout 3600 /path/backup.sh  # убить через 1 час

# 6. Добавляй временные метки в логи
0 2 * * * { echo "=== $(date) ==="; /path/script.sh; } >> /var/log/script.log 2>&1

# 7. MAILTO="" для тихих задач
MAILTO=""
*/5 * * * * /path/health-check.sh
```

---

## anacron - для систем без постоянной работы

Anacron запускает пропущенные задачи после перезагрузки. Не гарантирует точное время, но гарантирует что задача выполнится.

```
/etc/anacrontab:
# период(дни)  задержка(мин)  идентификатор  команда
1              5              cron.daily      run-parts /etc/cron.daily
7              10             cron.weekly     run-parts /etc/cron.weekly
@monthly       15             cron.monthly    run-parts /etc/cron.monthly
```

```bash
# Запустить anacron вручную
anacron -n          # немедленно (без задержки)
anacron -f          # принудительно (даже если уже запускалось)
anacron -d          # debug режим

# Anacron хранит метки времени в
ls /var/spool/anacron/
# cron.daily  cron.monthly  cron.weekly
```

---

## at - однократное выполнение

`at` - выполнить задачу один раз в указанное время.

```bash
# Синтаксис времени
at now + 5 minutes
at now + 2 hours
at 15:00
at 15:00 tomorrow
at 15:00 Jul 4
at midnight
at noon
at teatime     # 16:00
at midnight + 1 day

# Ввести команды интерактивно
at 15:00 tomorrow
at> /path/to/script.sh
at> Ctrl+D      (завершить ввод)

# Передать через pipe
echo "/path/to/script.sh" | at 15:00 tomorrow
echo "reboot" | at now + 10 minutes

# Batch — выполнить при низкой нагрузке (load average < 0.8)
batch << 'EOF'
/path/to/heavy-task.sh
EOF

# Управление очередью at
atq                    # показать очередь
at -l                  # то же что atq
atrm 3                 # удалить задание №3
at -c 3                # показать содержимое задания №3
```

---

## systemd timers - современная альтернатива

Подробно разобраны в теме [Systemd и юниты сервисов], здесь краткое сравнение.

### Почему systemd timers лучше cron в большинстве случаев

```
Преимущества systemd timers:
Логи в journald — journalctl -u myapp.timer
Зависимости — After=network-online.target
Отслеживание выполнения — systemctl list-timers
Нет потери задач при пропуске — Persistent=true
Случайная задержка — RandomizedDelaySec=
Изоляция — User=, PrivateTmp=, MemoryMax=
Мониторинг — статус через systemctl

Когда лучше использовать cron:
✓ Простые одноразовые задачи
✓ Когда нет доступа к systemd (контейнеры, старые системы)
✓ Пользовательские задачи без прав sudo
✓ Совместимость между дистрибутивами
```

### Создание systemd timer (краткий пример)

```bash
# /etc/systemd/system/backup.service
[Unit]
Description=Database Backup

[Service]
Type=oneshot
ExecStart=/opt/backup.sh
User=backup
```

```bash
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily Database Backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now backup.timer
systemctl list-timers
journalctl -u backup.service
```

---

## fcron - расширенный cron

fcron добавляет возможности которых нет в стандартном cron:

```bash
# Установка
apt install fcron   # Debian/Ubuntu

# Особенности fcron синтаксиса:
# @ — запускать через N минут после перезагрузки или последнего запуска
@ 60 /path/to/script.sh    # каждые 60 минут с момента последнего запуска

# Ограничение по ресурсам
%lavg(1.5) * * * * /path/heavy-script.sh  # запускать если load < 1.5

# Запустить один раз при следующем включении
&/5 * * * * /path/script.sh  # до 5 минут после перезагрузки

# Сериализация — не запускать параллельно
!serial * * * * /path/script.sh
```

---

## Cron в контейнерах и облаке

### Docker + cron

```dockerfile
# Dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y cron

# Копировать crontab
COPY crontab /etc/cron.d/myapp-cron
RUN chmod 0644 /etc/cron.d/myapp-cron

# Создать лог файл
RUN touch /var/log/cron.log

# Запустить cron как foreground процесс
CMD ["cron", "-f"]
```

```bash
# Запустить cron внутри уже работающего контейнера
docker exec -it mycontainer crontab -e

# Использовать суперvisord для управления несколькими процессами
apt install supervisor
```

### Kubernetes CronJob

```yaml
# k8s-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
spec:
  schedule: "0 2 * * *"         # тот же синтаксис что cron!
  timeZone: "Europe/Moscow"     # часовой пояс
  concurrencyPolicy: Forbid     # не запускать если предыдущий ещё работает
  failedJobsHistoryLimit: 3
  successfulJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: myapp:latest
            command: ["/backup.sh"]
            env:
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: host
```

---

## Мониторинг и отладка cron задач

```bash
# Смотреть выполнение cron в реальном времени
tail -f /var/log/syslog | grep CRON         # Debian/Ubuntu
journalctl -f _COMM=cron                    # systemd

# Проверить синтаксис расписания онлайн
# https://crontab.guru — интерактивный редактор

# Тест расписания через Python
python3 -c "
import datetime
# Проверить следующее выполнение
from croniter import croniter
c = croniter('*/15 9-18 * * 1-5', datetime.datetime.now())
for i in range(5):
    print(c.get_next(datetime.datetime))
"
# pip install croniter

# Посмотреть все crontab задачи на системе
for user in $(cut -f1 -d: /etc/passwd); do
    crontab -u "$user" -l 2>/dev/null && echo "=== $user ==="
done

# Или через getent
getent passwd | cut -d: -f1 | while read user; do
    tasks=$(crontab -u "$user" -l 2>/dev/null | grep -v "^#" | grep -v "^$")
    [ -n "$tasks" ] && echo "=== $user ===" && echo "$tasks"
done

# Найти все cron файлы в системе
find /etc/cron* -type f 2>/dev/null
find /var/spool/cron -type f 2>/dev/null
```

---

## Распространённые проблемы

```bash
# 1. Скрипт работает вручную, но не из cron
# Причина: разное окружение (PATH, HOME, и т.д.)
# Решение: логировать env
* * * * * env > /tmp/cron-env.txt

# 2. Специальные символы % нужно экранировать
0 2 * * * date +\%Y-\%m-\%d  # % нужно писать как \%

# 3. Часовые пояса
# cron использует системный часовой пояс
date                                    # проверить текущую TZ
timedatectl | grep "Time zone"          # посмотреть TZ
TZ=UTC crontab -e                       # для UTC
# Или задать в crontab:
CRON_TZ=America/New_York
0 9 * * * /path/script.sh

# 4. Cron не запускается при перезагрузке
# Проверить что демон запущен
systemctl status cron                   # Debian/Ubuntu
systemctl status crond                  # RHEL/CentOS

# 5. Права доступа
# Файлы в /etc/cron.d/ должны принадлежать root и иметь права 644
chown root:root /etc/cron.d/myapp
chmod 644 /etc/cron.d/myapp

# 6. Пользователь в /etc/cron.allow и /etc/cron.deny
cat /etc/cron.allow   # если существует — только эти пользователи могут использовать cron
cat /etc/cron.deny    # эти пользователи не могут использовать cron
```

---

## Шпаргалка по синтаксису

```
Формат: мин час д.м. мес д.н. команда

Примеры:
* * * * *           — каждую минуту
*/5 * * * *         — каждые 5 минут
0 * * * *           — каждый час
0 0 * * *           — каждый день в полночь
0 0 * * 0           — каждое воскресенье
0 0 1 * *           — 1-е число каждого месяца
0 9-17 * * 1-5      — каждый час с 9 до 17 по будням
0 9 * * 1,3,5       — в понедельник, среду, пятницу в 9:00
30 2 * * *          — каждый день в 2:30

Специальные:
@reboot             — при перезагрузке
@daily              — раз в день
@weekly             — раз в неделю
@monthly            — раз в месяц
@hourly             — каждый час

Управление:
crontab -e          — редактировать
crontab -l          — просмотреть
crontab -r          — удалить
crontab -u alice -l — crontab другого пользователя

Файлы:
/etc/crontab        — системный crontab (с полем user)
/etc/cron.d/        — отдельные файлы расписаний
/etc/cron.daily/    — ежедневные скрипты
/var/spool/cron/    — пользовательские crontab

Полезно:
>> log.txt 2>&1     — логировать в файл
&>/dev/null         — тихий режим
flock -n lock cmd   — блокировка от параллельного запуска
timeout 3600 cmd    — таймаут выполнения
```

---

## Ссылки

- [crontab.guru](https://crontab.guru/) - онлайн редактор расписаний
- [cron man page](https://man7.org/linux/man-pages/man8/cron.8.html) - `man 8 cron`
- [crontab man page](https://man7.org/linux/man-pages/man5/crontab.5.html) - `man 5 crontab`
- [anacron man page](https://man7.org/linux/man-pages/man8/anacron.8.html) - `man 8 anacron`
- [at man page](https://man7.org/linux/man-pages/man1/at.1.html) - `man at`
