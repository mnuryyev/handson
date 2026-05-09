---
title: "SELinux и AppArmor - базовые концепции"
date: "2026-05-09"
---

SELinux (Security-Enhanced Linux) и AppArmor - системы обязательного контроля доступа (MAC, Mandatory Access Control) для Linux. Они работают поверх стандартных прав Unix (DAC) и ограничивают действия процессов и пользователей даже при наличии root-привилегий.

Ключевая идея: принцип наименьших привилегий на уровне ядра. Даже если процесс взломан - он не может сделать больше, чем разрешает политика.

---

## Зачем нужны MAC-системы

Стандартные права Unix (chmod/chown) - это DAC (Discretionary Access Control). Владелец файла сам решает кто имеет доступ. Проблема: если root-процесс скомпрометирован - он получает полный доступ ко всему.

    Сравнение DAC и MAC:

      DAC (стандартный Unix):
        - Права определяет владелец объекта
        - root может всё
        - Взломанный процесс с правами root = полная компрометация
        - Пример: nginx запущен от www-data, но www-data может читать /etc/shadow

      MAC (SELinux/AppArmor):
        - Права определяет центральная политика (ядро)
        - Даже root ограничен политикой
        - Взломанный nginx не может выйти за рамки своего домена/профиля
        - Каждый процесс изолирован в своём контексте

    Реальный пример:
      Без MAC: уязвимость в nginx → атакующий получает shell www-data →
               читает /etc/passwd, /etc/shadow, ssh-ключи, конфиги БД

      С MAC:   уязвимость в nginx → атакующий ограничен политикой nginx →
               может работать только с /var/www, /tmp/nginx → остальное DENIED

---

## SELinux

SELinux разработан NSA и Red Hat. Интегрирован в ядро Linux начиная с 2.6. По умолчанию включён в RHEL, CentOS, Fedora, AlmaLinux, Rocky Linux.

### Основные концепции

    Субъект (Subject):
      Процесс, которому нужен доступ к ресурсу.
      В SELinux каждый процесс имеет метку (label) - security context.

    Объект (Object):
      Файл, директория, сокет, порт, устройство - к чему обращаются.
      Каждый объект тоже имеет метку.

    Политика (Policy):
      Набор правил: какой субъект к какому объекту и как может обращаться.
      Хранится в ядре. Загружается при старте системы.

    Контекст безопасности (Security Context):
      Метка вида: user:role:type:level
        user  - SELinux пользователь (не Unix пользователь)
        role  - роль (RBAC компонент)
        type  - тип (главный элемент для политики Type Enforcement)
        level - уровень MLS/MCS (опционально)

      Пример контекста процесса nginx:
        system_u:system_r:httpd_t:s0

      Пример контекста файла:
        system_u:object_r:httpd_sys_content_t:s0

    Type Enforcement (TE):
      Основной механизм SELinux. Правила вида:
        allow httpd_t httpd_sys_content_t:file { read open getattr };
      = процессам с типом httpd_t разрешено читать файлы с типом httpd_sys_content_t.

### Режимы работы SELinux

    Enforcing:
      Политика активна и применяется.
      Запрещённые действия блокируются и логируются.
      Рабочий режим на production.

    Permissive:
      Политика активна но НЕ применяется.
      Запрещённые действия только логируются, не блокируются.
      Используется для отладки и разработки политик.

    Disabled:
      SELinux полностью отключён.
      Метки не присваиваются, нет логирования.
      Переход из Disabled требует перезагрузки и relabeling.

    # Проверить текущий режим
    getenforce
    sestatus

    # Временно переключить в Permissive (без перезагрузки)
    setenforce 0        # Permissive
    setenforce 1        # Enforcing

    # Постоянный режим - /etc/selinux/config
    SELINUX=enforcing   # enforcing / permissive / disabled
    SELINUXTYPE=targeted

    # После изменения на disabled или с disabled - нужна перезагрузка

### Типы политик SELinux

    targeted (по умолчанию):
      Контролирует только определённые "целевые" процессы (демоны).
      Всё остальное работает в домене unconfined_t (без ограничений).
      Баланс безопасности и совместимости.
      Используется в большинстве RHEL/Fedora систем.

    strict:
      Все процессы под контролем SELinux.
      Нет unconfined_t.
      Максимальная безопасность, сложная настройка.

    mls (Multi-Level Security):
      Добавляет уровни секретности (s0-s15, c0-c1023).
      Для правительственных и военных систем.
      Очень сложная конфигурация.

### Просмотр контекстов и статуса

    # Контекст текущего процесса
    id -Z
    # Пример: unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023

    # Контекст файла или директории
    ls -Z /var/www/html/
    ls -Z /etc/nginx/

    # Контекст процессов
    ps auxZ | grep nginx
    ps -eZ | grep httpd

    # Контекст сокета / порта
    ss -tlnpZ

    # Статус SELinux
    sestatus
    sestatus -v    # подробно

    # Текущий режим
    getenforce

    # Политика
    sestatus | grep "Loaded policy name"

### Управление метками файлов

    # Показать тип файла
    ls -Z /etc/nginx/nginx.conf
    # system_u:object_r:httpd_config_t:s0 /etc/nginx/nginx.conf

    # Изменить тип файла (временно, до relabeling)
    chcon -t httpd_sys_content_t /var/www/mysite/index.html

    # Изменить рекурсивно
    chcon -R -t httpd_sys_content_t /var/www/mysite/

    # Восстановить контекст по умолчанию (из policy)
    restorecon /var/www/html/index.html
    restorecon -R -v /var/www/html/       # рекурсивно с выводом

    # Установить постоянный контекст по умолчанию для пути
    semanage fcontext -a -t httpd_sys_content_t "/var/www/mysite(/.*)?"
    restorecon -R -v /var/www/mysite/

    # Показать все fcontext правила
    semanage fcontext -l
    semanage fcontext -l | grep httpd

    # Полный relabeling всей системы (при смене политики или после disabled)
    touch /.autorelabel
    reboot
    # При следующей загрузке система переметит все файлы

### Булевы переменные (Booleans)

Booleans - переключатели в политике, позволяют менять поведение без написания новых правил.

    # Показать все booleans
    getsebool -a
    semanage boolean -l

    # Показать конкретный boolean
    getsebool httpd_can_network_connect
    # httpd_can_network_connect --> off

    # Включить (временно, до перезагрузки)
    setsebool httpd_can_network_connect on

    # Включить постоянно (сохраняется после перезагрузки)
    setsebool -P httpd_can_network_connect on

    Часто используемые booleans:

      httpd_can_network_connect         - nginx/apache могут делать исходящие соединения
      httpd_can_network_connect_db      - apache может подключаться к БД
      httpd_can_sendmail                - apache может отправлять почту
      httpd_execmem                     - apache может использовать execmem (для некоторых модулей)
      httpd_read_user_content           - apache может читать домашние директории
      ftpd_anon_write                   - анонимный FTP может записывать файлы
      samba_enable_home_dirs            - samba может расшаривать домашние директории
      ssh_sysadm_login                  - SSH разрешает sysadm_r логин
      allow_httpd_anon_write            - apache может писать в anon_write директории
      nis_enabled                       - NIS/YP клиент включён

    # Найти booleans для конкретного сервиса
    semanage boolean -l | grep httpd
    semanage boolean -l | grep ftp

### Управление портами

SELinux контролирует какие порты могут слушать какие типы процессов.

    # Показать все SELinux типы портов
    semanage port -l
    semanage port -l | grep http

    # Разрешить nginx слушать нестандартный порт (например 8081)
    semanage port -a -t http_port_t -p tcp 8081

    # Изменить тип существующего порта
    semanage port -m -t http_port_t -p tcp 8081

    # Удалить нестандартный порт
    semanage port -d -t http_port_t -p tcp 8081

    Стандартные типы портов:
      http_port_t      - 80, 443, 8008, 8009, 8080, 8443
      ssh_port_t       - 22
      smtp_port_t      - 25, 465, 587
      dns_port_t       - 53
      mysql_port_t     - 3306
      postgresql_port_t - 5432
      redis_port_t     - 6379

### Анализ отказов и аудит

    # Смотреть все SELinux отказы
    ausearch -m avc -ts recent
    ausearch -m avc -ts today

    # Отказы в journald
    journalctl -t setroubleshoot

    # Утилита sealert (пакет setroubleshoot)
    sealert -a /var/log/audit/audit.log

    # Анализировать конкретный AVC (Access Vector Cache denial)
    ausearch -m avc | audit2why

    # Автоматически создать модуль политики из отказов
    ausearch -m avc | audit2allow -M mymodule
    semodule -i mymodule.pp

    # Проверить сгенерированные правила перед применением
    ausearch -m avc | audit2allow

    # Пример вывода AVC отказа в audit.log:
    # type=AVC msg=audit(1234567890.123:456): avc: denied { read }
    # for pid=1234 comm="nginx" name="myfile.conf"
    # scontext=system_u:system_r:httpd_t:s0
    # tcontext=system_u:object_r:admin_home_t:s0 tclass=file permissive=0

    Расшифровка AVC:
      denied { read }        - запрещённое действие
      comm="nginx"           - процесс
      scontext               - контекст субъекта (процесса)
      tcontext               - контекст объекта (файла)
      tclass=file            - класс объекта
      permissive=0           - режим enforcing (0=enforcing, 1=permissive)

### Пользовательские модули политики

    # Создать модуль из AVC отказов (базовый workflow)
    ausearch -m avc -ts recent | audit2allow -M local_policy
    semodule -i local_policy.pp

    # Показать загруженные модули
    semodule -l
    semodule -l | grep local

    # Отключить модуль
    semodule -d local_policy

    # Включить модуль
    semodule -e local_policy

    # Удалить модуль
    semodule -r local_policy

    # Приоритеты модулей (SELinux >= 2.4)
    semodule -l -v         # показать с приоритетами
    semodule -X 300 -i custom.pp  # установить с приоритетом 300

### Типовые проблемы и решения

    Проблема: nginx не может читать файлы в /data/www/
    Симптом: 403 Forbidden, в audit.log есть AVC denied
    Решение:
      ls -Z /data/www/       # смотрим тип файлов
      semanage fcontext -a -t httpd_sys_content_t "/data/www(/.*)?"
      restorecon -R /data/www/

    Проблема: nginx не может подключиться к backend на 127.0.0.1:8000
    Симптом: Connection refused в логах, AVC denied { name_connect }
    Решение:
      setsebool -P httpd_can_network_connect on
      # или если только к БД:
      setsebool -P httpd_can_network_connect_db on

    Проблема: nginx не может слушать порт 8081
    Симптом: bind() failed, AVC denied { name_bind }
    Решение:
      semanage port -a -t http_port_t -p tcp 8081

    Проблема: приложение падает только когда SELinux включён
    Решение для отладки:
      setenforce 0            # временно permissive
      systemctl restart app   # воспроизвести проблему
      ausearch -m avc -ts recent | audit2allow   # посмотреть что нужно
      setenforce 1            # вернуть enforcing
      ausearch -m avc -ts recent | audit2allow -M app_policy
      semodule -i app_policy.pp

---

## AppArmor

AppArmor разработан Novell/SUSE. Проще в настройке, чем SELinux. По умолчанию включён в Ubuntu, Debian (с Debian 10), openSUSE.

### Основные концепции

    Профиль (Profile):
      Текстовый файл с правилами для конкретной программы.
      Хранится в /etc/apparmor.d/
      Правила описывают: какие файлы читать/писать, какие сети, capabilities.

    Конфайнмент (Confinement):
      Процесс запущен "в профиле" - ограничен его правилами.
      Если профиля нет - процесс работает без ограничений.

    Путь-ориентированный контроль:
      В отличие от SELinux (метки), AppArmor работает с путями файлов.
      Проще понять, но у AppArmor нет контроля меток.

    Режимы профиля:
      enforce    - правила применяются, нарушения блокируются и логируются
      complain   - правила не применяются, нарушения только логируются
      unconfined - профиль загружен, но не применяется (audit выключен)

### Структура профиля

    # /etc/apparmor.d/usr.sbin.nginx - пример профиля nginx

    #include <tunables/global>

    /usr/sbin/nginx {
      #include <abstractions/base>
      #include <abstractions/nameservice>

      capability setuid,
      capability setgid,
      capability net_bind_service,
      capability dac_override,

      # Бинарник nginx
      /usr/sbin/nginx mr,

      # Конфиги
      /etc/nginx/ r,
      /etc/nginx/** r,

      # Логи
      /var/log/nginx/ rw,
      /var/log/nginx/** rw,

      # Веб-контент
      /var/www/html/ r,
      /var/www/html/** r,

      # PID файл
      /run/nginx.pid rw,

      # Временные файлы
      /tmp/ rw,
      /tmp/** rw,

      # Сеть
      network inet tcp,
      network inet6 tcp,
      network inet udp,
    }

    Режимы доступа к файлам:
      r    - read (чтение)
      w    - write (запись)
      a    - append (добавление)
      x    - execute (выполнение)
      m    - mmap (отображение в память)
      k    - lock (блокировка файла)
      l    - link (создание жёстких ссылок)
      ix   - inherit execute (дочерний процесс наследует профиль)
      Px   - Profile execute (дочерний запускается в отдельном профиле)
      Ux   - Unconfined execute (дочерний запускается без профиля)
      cx   - Child profile execute

    Wildcards в путях:
      *    - любые символы, кроме /
      **   - любые символы, включая /
      ?    - любой один символ (кроме /)

### Управление AppArmor

    # Проверить статус
    aa-status
    apparmor_status
    systemctl status apparmor

    # Показать все профили
    aa-status | grep -E "enforce|complain"

    # Загрузить профиль
    apparmor_parser -r /etc/apparmor.d/usr.sbin.nginx

    # Перезагрузить все профили
    systemctl reload apparmor

    # Отключить конкретный профиль (символическая ссылка в disable)
    aa-disable /etc/apparmor.d/usr.sbin.nginx
    # создаёт симлинк /etc/apparmor.d/disable/usr.sbin.nginx

    # Включить профиль
    aa-enable /etc/apparmor.d/usr.sbin.nginx

    # Переключить в режим complain
    aa-complain /usr/sbin/nginx
    aa-complain /etc/apparmor.d/usr.sbin.nginx

    # Переключить в режим enforce
    aa-enforce /usr/sbin/nginx
    aa-enforce /etc/apparmor.d/usr.sbin.nginx

    # Выгрузить профиль (без рестарта AppArmor)
    apparmor_parser -R /etc/apparmor.d/usr.sbin.nginx

### Создание профиля с нуля

    # Установить инструменты
    apt install apparmor-utils apparmor-profiles apparmor-profiles-extra

    # Метод 1: генерация с помощью aa-genprof (интерактивно)
    aa-genprof /usr/bin/myapp
    # Запускает приложение, перехватывает обращения, строит профиль.
    # Использует режим complain для сбора данных.
    # После тестирования предлагает добавить правила.

    # Метод 2: запуск в complain, анализ логов, добавление правил
    aa-complain /usr/bin/myapp
    # запустить приложение и поработать с ним
    # затем:
    aa-logprof   # анализирует /var/log/syslog и предлагает добавить правила
    aa-enforce /usr/bin/myapp

    # Метод 3: написать вручную на основе шаблона

### Абстракции (Abstractions)

Абстракции - переиспользуемые наборы правил для типовых нужд.

    # Расположение
    /etc/apparmor.d/abstractions/

    Часто используемые:
      base              - базовые разрешения (/etc/ld.so*, /proc/self/...)
      nameservice       - DNS, NSS (gethostbyname и подобные)
      apache2-common    - типовые права для Apache модулей
      ssl_certs         - чтение SSL сертификатов
      ssl_keys          - чтение SSL ключей (осторожно)
      user-tmp          - /tmp, /var/tmp пользователя
      python             - базовые права для Python приложений
      php               - базовые права для PHP
      bash              - bash и его библиотеки
      cups-client       - права для печати

    # Подключение в профиле
    #include <abstractions/base>
    #include <abstractions/nameservice>
    #include <abstractions/ssl_certs>

### Tunable переменные

    # /etc/apparmor.d/tunables/
    # Глобальные переменные для профилей

    #include <tunables/global>
    # Предоставляет:
    #   @{HOME}    = /home/*/ /root/
    #   @{PROC}    = /proc/
    #   @{sys}     = /sys/
    #   @{run}     = /run/ /var/run/
    #   @{HOMEDIRS} = /home/

    # Использование в профиле
    @{HOME}/.config/myapp/ r,
    @{HOME}/.config/myapp/** rw,

### Сеть в профилях AppArmor

    # Базовые сетевые правила
    network,                    # все сети
    network tcp,                # TCP
    network udp,                # UDP
    network inet tcp,           # IPv4 TCP
    network inet6 tcp,          # IPv6 TCP
    network inet stream,        # IPv4 stream (TCP)
    network inet dgram,         # IPv4 datagram (UDP)

    # С конкретными портами (AppArmor >= 2.8.95 с policy_version 2.8.95)
    # Требует сетевые правила nftables или extended network rules:
    network (bind) tcp port 80,
    network (bind) tcp port 443,
    network (connect) tcp to port 443,

    # Стандартный вариант для nginx:
    network inet tcp,
    network inet6 tcp,
    network inet udp,
    network unix stream,       # unix sockets (FastCGI)

### Capabilities в AppArmor

    # Linux capabilities контролируются в профиле
    capability net_bind_service,   # слушать порты < 1024
    capability setuid,             # менять UID
    capability setgid,             # менять GID
    capability dac_override,       # обходить права файлов (осторожно)
    capability chown,              # менять владельца файлов
    capability kill,               # отправлять сигналы чужим процессам
    capability sys_ptrace,         # ptrace (отладка)
    capability sys_admin,          # широкие административные права (опасно)

    # Посмотреть все capabilities
    man capabilities

### Анализ нарушений AppArmor

    # Нарушения пишутся в syslog/journald
    journalctl -k | grep apparmor
    grep "apparmor=" /var/log/syslog | tail -20
    grep "DENIED" /var/log/syslog | tail -20

    # aa-logprof - анализ и добавление правил
    aa-logprof
    # Интерактивно предлагает добавить правила на основе логов

    # Пример записи в логе:
    # kernel: audit: type=1400 audit(1234567890.123:456):
    # apparmor="DENIED" operation="open" profile="/usr/sbin/nginx"
    # name="/data/secrets/key.pem" pid=1234 comm="nginx"
    # requested_mask="r" denied_mask="r" fsuid=33 ouid=0

    Расшифровка:
      apparmor="DENIED"         - действие отклонено
      profile="/usr/sbin/nginx" - активный профиль
      name="/data/secrets/key.pem" - к чему обращались
      requested_mask="r"        - запрошенное право (read)
      denied_mask="r"           - что конкретно запрещено
      fsuid=33                  - UID файловой системы (33 = www-data)

### Практический пример - профиль для Python-приложения

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

      # Python venv и исходники приложения
      /opt/myapp/ r,
      /opt/myapp/** r,
      /opt/myapp/venv/bin/gunicorn mr,
      /opt/myapp/venv/bin/python3* ix,

      # Временные файлы приложения
      /tmp/myapp/ rw,
      /tmp/myapp/** rw,

      # Логи
      /var/log/myapp/ rw,
      /var/log/myapp/*.log rw,

      # Unix socket (для nginx upstream)
      /run/myapp.sock rw,

      # Чтение env файла с секретами
      /opt/myapp/.env r,

      # Запрет доступа к чувствительным данным
      deny /etc/shadow r,
      deny /root/ r,
      deny /home/ r,

      # Сеть
      network inet tcp,
      network inet6 tcp,
      network unix stream,

      # /proc для работы Python
      @{PROC}/@{pid}/mounts r,
      @{PROC}/@{pid}/status r,
    }

    # Загрузить профиль
    apparmor_parser -r /etc/apparmor.d/opt.myapp.venv.bin.gunicorn
    aa-enforce /opt/myapp/venv/bin/gunicorn

---

## SELinux vs AppArmor - сравнение

    Архитектура:
      SELinux   - метки (labels) на всех объектах, Type Enforcement
      AppArmor  - пути к файлам, нет меток

    Сложность:
      SELinux   - высокая. Нужно понять контексты, типы, политики, модули
      AppArmor  - низкая. Профили читаются как обычный текст

    Гибкость:
      SELinux   - высокая. Контролирует переименования, hardlinks, tmpfs
      AppArmor  - ниже. Путь-ориентированный подход имеет ограничения

    Дистрибутивы:
      SELinux   - RHEL, CentOS, AlmaLinux, Rocky, Fedora, Android
      AppArmor  - Ubuntu, Debian, openSUSE, Kali

    Инструменты:
      SELinux   - semanage, setsebool, restorecon, audit2allow, sealert
      AppArmor  - aa-status, aa-genprof, aa-logprof, aa-enforce, aa-complain

    Логи:
      SELinux   - /var/log/audit/audit.log (AVC denials)
      AppArmor  - /var/log/syslog, journald (apparmor="DENIED")

    Что выбрать:
      SELinux   - production RHEL/CentOS системы, максимальная безопасность
      AppArmor  - Ubuntu окружения, контейнеры, когда нужна простота

---

## Интеграция с контейнерами

### SELinux и Docker/Podman

    # Docker автоматически использует тип svirt_lxc_net_t для контейнеров
    # Контейнеры изолированы через MCS (Multi-Category Security)

    # Проверить контекст работающего контейнера
    docker inspect --format '{{.HostConfig.SecurityOpt}}' <container>
    ps -eZ | grep container

    # Запустить контейнер с кастомным SELinux типом
    docker run --security-opt label=type:container_runtime_t nginx

    # Отключить SELinux для конкретного контейнера (не рекомендуется)
    docker run --security-opt label=disable nginx

    # Пробросить том с правильным контекстом
    docker run -v /mydata:/data:Z nginx  # :Z = relabel для приватного тома
    docker run -v /mydata:/data:z nginx  # :z = relabel для общего тома

    # Podman аналогично
    podman run -v /mydata:/data:Z nginx

### AppArmor и Docker

    # Docker создаёт профиль docker-default для всех контейнеров
    cat /etc/apparmor.d/docker-default

    # Запустить контейнер с кастомным профилем
    docker run --security-opt apparmor=my_profile nginx

    # Запустить без AppArmor (не рекомендуется)
    docker run --security-opt apparmor=unconfined nginx

    # Посмотреть профиль для контейнера
    aa-status | grep docker

### Kubernetes и MAC

    # SELinux в Kubernetes - через securityContext
    # pod.yaml:
    spec:
      securityContext:
        seLinuxOptions:
          level: "s0:c123,c456"
          type: "container_t"

    # AppArmor в Kubernetes - через аннотации (deprecated в K8s 1.30+)
    # Новый способ через securityContext:
    spec:
      containers:
      - name: myapp
        securityContext:
          appArmorProfile:
            type: Localhost
            localhostProfile: my-profile

---

## Быстрая диагностика

    SELinux:
      getenforce                          - режим работы
      sestatus                            - статус
      ausearch -m avc -ts recent          - последние отказы
      ausearch -m avc -ts today | audit2why  - объяснение отказов
      ls -Z <path>                        - контекст файла
      ps -eZ | grep <proc>                - контекст процесса
      semanage port -l | grep <port>      - тип порта
      getsebool -a | grep <name>          - booleans

    AppArmor:
      aa-status                           - статус всех профилей
      journalctl -k | grep apparmor       - все события AppArmor
      grep DENIED /var/log/syslog         - отказы
      aa-logprof                          - анализ и добавление правил

---

## Шпаргалка SELinux

    Статус и режим:
      getenforce                          - текущий режим
      sestatus                            - полный статус
      setenforce 0                        - permissive (временно)
      setenforce 1                        - enforcing (временно)

    Контексты:
      ls -Z <path>                        - контекст файла
      ps -eZ                              - контекст процессов
      id -Z                               - контекст текущего пользователя
      chcon -t <type> <file>              - изменить тип файла
      restorecon -R <path>                - восстановить контекст
      semanage fcontext -a -t <type> "<path>(/.*)?"  - постоянный контекст

    Booleans:
      getsebool -a                        - все booleans
      getsebool <name>                    - конкретный boolean
      setsebool -P <name> on/off          - изменить постоянно

    Порты:
      semanage port -l                    - все типы портов
      semanage port -a -t <type> -p tcp <port>  - добавить порт

    Аудит:
      ausearch -m avc -ts recent          - последние AVC
      ausearch -m avc | audit2why         - объяснение
      ausearch -m avc | audit2allow -M <name>  - создать модуль
      semodule -i <name>.pp               - установить модуль
      semodule -l                         - список модулей

---

## Шпаргалка AppArmor

    Статус:
      aa-status                           - состояние всех профилей
      systemctl status apparmor           - сервис AppArmor

    Профили:
      aa-enforce /path/to/bin             - включить enforce
      aa-complain /path/to/bin            - включить complain
      aa-disable /etc/apparmor.d/profile  - отключить профиль
      apparmor_parser -r /etc/apparmor.d/profile  - загрузить/перезагрузить

    Разработка профилей:
      aa-genprof /path/to/bin             - создать профиль интерактивно
      aa-logprof                          - добавить правила из логов

    Логи:
      journalctl -k | grep apparmor       - события ядра
      grep apparmor /var/log/syslog       - в syslog

    Права в профиле:
      r  - read, w - write, a - append, x - execute
      m  - mmap, k - lock, l - link
      ix - inherit execute (дочерний в том же профиле)
      Px - дочерний в собственном профиле
      Ux - дочерний без профиля (unconfined)

---

## Ссылки

- [SELinux User's and Administrator's Guide (Red Hat)](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/using_selinux/index)
- [SELinux Project Wiki](https://selinuxproject.org/page/Main_Page)
- [man semanage](https://linux.die.net/man/8/semanage)
- [man audit2allow](https://linux.die.net/man/1/audit2allow)
- [AppArmor Wiki (Ubuntu)](https://wiki.ubuntu.com/AppArmor)
- [AppArmor Documentation](https://gitlab.com/apparmor/apparmor/-/wikis/Documentation)
- [AppArmor Abstractions (Ubuntu)](https://bazaar.launchpad.net/~apparmor-dev/apparmor/master/files/head:/profiles/apparmor.d/abstractions/)
- [Arch Wiki - SELinux](https://wiki.archlinux.org/title/SELinux)
- [Arch Wiki - AppArmor](https://wiki.archlinux.org/title/AppArmor)
- [Docker Security - AppArmor](https://docs.docker.com/engine/security/apparmor/)
- [Docker Security - SELinux](https://docs.docker.com/engine/security/protect-access/)
