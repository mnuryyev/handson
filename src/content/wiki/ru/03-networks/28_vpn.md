---
title: "VPN - IPSec, OpenVPN, WireGuard"
date: "2026-05-07"
---

VPN (Virtual Private Network) - технология создания зашифрованного туннеля поверх публичной сети. Трафик между клиентом и сервером шифруется, IP-адрес источника скрыт от получателя.

Три основных протокола: IPSec (стандарт для site-to-site и корпоративных VPN), OpenVPN (гибкий, SSL/TLS-based), WireGuard (современный, минималистичный, высокая производительность).

---

## Зачем нужен VPN

    VPN решает несколько задач:

    Конфиденциальность трафика:
      Провайдер / Wi-Fi точка доступа видят зашифрованный трафик.
      Реальный IP клиента скрыт от сайтов и сервисов.

    Безопасный удалённый доступ:
      Сотрудник из дома подключается к корпоративной сети.
      Как будто находится в офисе - доступны все внутренние ресурсы.

    Обход ограничений:
      Геоблокировки, цензура, файрволлы.

    Site-to-site соединение:
      Объединение двух офисных сетей через интернет.
      Трафик между офисами идёт через зашифрованный туннель.

    Без VPN (открытая сеть):
      Кафе Wi-Fi → перехват трафика (MITM).
      Провайдер → логирование всех запросов.
      Корпоративный прокси → инспекция пакетов.

    Модели VPN:
      Client-to-Site (Remote Access VPN) - один клиент подключается к сети.
      Site-to-Site (LAN-to-LAN VPN) - две сети объединяются через туннель.
      Mesh VPN (полносвязная сеть) - каждый узел соединён с каждым напрямую.

---

## IPSec

IPSec (Internet Protocol Security, RFC 4301) - набор протоколов для защиты IP-трафика на сетевом уровне (L3). Стандарт для корпоративных VPN, поддерживается в каждом современном маршрутизаторе.

    IPSec состоит из:
      IKE (Internet Key Exchange) - согласование параметров и обмен ключами.
      AH (Authentication Header) - аутентификация и целостность (без шифрования).
      ESP (Encapsulating Security Payload) - шифрование + аутентификация + целостность.

    На практике используется ESP (AH не шифрует и не работает с NAT).

### Режимы IPSec

    Transport Mode (транспортный):
      Шифруется только payload (данные) IP-пакета.
      Оригинальный IP-заголовок не трогается.
      Применение: host-to-host соединение (два конкретных хоста).

      [IP заголовок][ESP заголовок][TCP/UDP + данные][ESP трейлер]
       ^^^^^^^^^^^^ не зашифрован   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ зашифровано

    Tunnel Mode (туннельный):
      Весь оригинальный IP-пакет помещается внутрь нового ESP-пакета.
      Новый внешний IP-заголовок добавляется (адреса VPN-шлюзов).
      Применение: site-to-site и remote access VPN.

      [Внешний IP][ESP заголовок][Оригинальный IP + TCP/UDP + данные][ESP трейлер]
       ^^^^^^^^^^^^не зашифрован  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ зашифровано

    Пример site-to-site:
      Офис A (192.168.1.0/24) ←→ VPN шлюз A (1.1.1.1)
                                  ~~~~~~~~~~~~~ туннель ~~~~~~~~~~~~~
                                  VPN шлюз B (2.2.2.2) ←→ Офис B (10.0.0.0/24)

      Пакет от 192.168.1.5 к 10.0.0.7:
        Оригинальный: [src:192.168.1.5 dst:10.0.0.7][TCP][данные]
        После IPSec:  [src:1.1.1.1 dst:2.2.2.2][ESP][зашифровано...]

### IKE - обмен ключами

    IKE (RFC 7296) работает на порту UDP 500 (и UDP 4500 при NAT).
    Два этапа:

    Фаза 1 (IKE SA - Security Association):
      Устанавливается защищённый канал между двумя узлами.
      Согласование параметров: алгоритм шифрования, хэш, DH группа.
      Аутентификация: Pre-Shared Key (PSK) или сертификаты X.509.
      Результат: IKE SA - зашифрованный канал для Фазы 2.

    Фаза 2 (IPSec SA / Child SA):
      Поверх защищённого канала Фазы 1 согласуются параметры туннеля.
      Выбираются алгоритмы ESP, ключи шифрования данных.
      Определяются селекторы трафика (какой трафик пойдёт в туннель).
      Результат: IPSec SA - два однонаправленных SA (входящий + исходящий).

    IKEv1 vs IKEv2:
      IKEv1: главный режим (6 пакетов) или агрессивный режим (3 пакета).
      IKEv2: всегда 4 пакета, проще, встроена мобильность (MOBIKE).
      IKEv2 поддерживает EAP-аутентификацию (логин/пароль пользователя).
      IKEv2 - современный стандарт, IKEv1 - устарел.

    Параметры IKE (пример):
      Encryption: AES-256-CBC или AES-256-GCM
      Integrity:  SHA-256 или SHA-384
      PRF:        PRF-HMAC-SHA-256
      DH Group:   Group 14 (2048-bit MODP) или Group 19 (256-bit ECP)
      Lifetime:   28800 секунд (8 часов) для IKE SA
                  3600 секунд (1 час) для IPSec SA

### Security Association (SA)

    SA (Security Association) - однонаправленное соглашение о параметрах защиты.
    Для двустороннего соединения нужны два SA.

    SA содержит:
      SPI (Security Parameter Index) - 32-битный идентификатор SA
      IP-адрес назначения
      Протокол (AH или ESP)
      Алгоритмы шифрования и аутентификации
      Ключи
      Время жизни (lifetime)
      Счётчик порядковых номеров (Sequence Number)

    SAD (Security Association Database) - база всех активных SA на узле.
    SPD (Security Policy Database) - правила: какой трафик обрабатывать IPSec.

    # Посмотреть активные SA (Linux)
    ip xfrm state     # SA database
    ip xfrm policy    # SPD - политики
    ip xfrm monitor   # следить за изменениями

    # Статистика IPSec
    ip -s xfrm state

### ESP - Encapsulating Security Payload

    ESP заголовок (RFC 4303):
      SPI (32 бит) - какой SA использовать
      Sequence Number (32 бит) - защита от replay атак
      Payload (переменный) - зашифрованные данные
      Padding - выравнивание
      Pad Length - длина padding
      Next Header - тип следующего заголовка (TCP=6, UDP=17, IP=4)
      ICV (Integrity Check Value) - аутентификационный тег (HMAC или GCM тег)

    Алгоритмы ESP (современные рекомендации):
      AES-256-GCM (AEAD)    - шифрование + аутентификация одним алгоритмом
      AES-128-GCM (AEAD)    - быстрее, достаточно безопасно
      ChaCha20-Poly1305     - без AES-NI (мобильные устройства)
      AES-256-CBC + SHA-256 - устаревший комбинированный режим

    # Устаревшие (не использовать):
    # DES, 3DES - слабые
    # MD5 HMAC  - сломан
    # NULL шифрование - нет конфиденциальности

### NAT-T (NAT Traversal)

    IPSec с NAT: проблема в том что ESP (IP протокол 50) не имеет портов.
    NAT-устройство не может транслировать ESP → туннель не устанавливается.

    Решение NAT-T (RFC 3948):
      IKE обнаруживает NAT (NAT-Detection payloads в IKE).
      ESP инкапсулируется в UDP:4500.
      NAT может транслировать UDP → ESP проходит.

      Без NAT:  [IP][ESP][данные]
      С NAT-T:  [IP][UDP:4500][ESP][данные]

    Keepalive:
      Через NAT нужно периодически слать пакеты чтобы NAT таблица не устарела.
      IKE keepalive: каждые 20 секунд NAT-keepalive UDP пакет.
      Настройка strongSwan: nat_keepalive = 20s

### Настройка IPSec (strongSwan)

    # Установка
    apt install strongswan strongswan-pki    # Debian/Ubuntu
    dnf install strongswan                   # Fedora/RHEL

    # Конфигурация /etc/ipsec.conf (старый стиль)
    config setup
        charondebug="ike 2, knl 2, cfg 2"   # уровень логирования

    conn site-to-site
        type=tunnel
        authby=secret              # PSK аутентификация
        left=1.1.1.1               # локальный адрес
        leftsubnet=192.168.1.0/24  # локальная сеть
        right=2.2.2.2              # удалённый адрес
        rightsubnet=10.0.0.0/24    # удалённая сеть
        ike=aes256-sha256-modp2048 # IKE параметры
        esp=aes256gcm16-modp2048   # ESP параметры
        keyexchange=ikev2
        auto=start                 # поднять при старте

    # PSK ключ /etc/ipsec.secrets
    1.1.1.1 2.2.2.2 : PSK "секретный-ключ-минимум-20-символов"

    # Конфигурация swanctl.conf (новый стиль IKEv2)
    connections {
        vpn-site {
            version = 2
            local_addrs  = 1.1.1.1
            remote_addrs = 2.2.2.2
            local {
                auth = psk
                id = 1.1.1.1
            }
            remote {
                auth = psk
                id = 2.2.2.2
            }
            proposals = aes256gcm16-sha256-modp2048
            children {
                net-net {
                    local_ts  = 192.168.1.0/24
                    remote_ts = 10.0.0.0/24
                    esp_proposals = aes256gcm16-modp2048
                    start_action = start
                }
            }
        }
    }

    secrets {
        ike-vpn {
            id-local  = 1.1.1.1
            id-remote = 2.2.2.2
            secret = "секретный-ключ-минимум-20-символов"
        }
    }

    # Управление
    ipsec start             # запустить
    ipsec status            # статус соединений
    ipsec statusall         # подробный статус
    ipsec up site-to-site   # поднять соединение
    ipsec down site-to-site # опустить
    ipsec reload            # перечитать конфиг
    swanctl --load-all      # загрузить swanctl конфиг
    swanctl --list-sas      # активные SA
    swanctl --initiate --child net-net  # инициировать

    # Диагностика
    ipsec statusall         # статус + счётчики
    ip xfrm state           # ядро: активные SA
    ip xfrm policy          # ядро: политики
    journalctl -u strongswan -f  # логи в реальном времени

### IPSec с сертификатами (PKI)

    # Генерация CA
    pki --gen --type rsa --size 4096 --outform pem > ca-key.pem
    pki --self --ca --lifetime 3650 --in ca-key.pem \
        --dn "CN=VPN CA" --outform pem > ca-cert.pem

    # Генерация сертификата сервера
    pki --gen --type rsa --size 2048 --outform pem > server-key.pem
    pki --issue --lifetime 730 \
        --cacert ca-cert.pem --cakey ca-key.pem \
        --dn "CN=vpn.example.com" \
        --san vpn.example.com \
        --flag serverAuth --flag ikeIntermediate \
        --outform pem < server-key.pem > server-cert.pem

    # Генерация сертификата клиента
    pki --gen --type rsa --size 2048 --outform pem > client-key.pem
    pki --issue --lifetime 730 \
        --cacert ca-cert.pem --cakey ca-key.pem \
        --dn "CN=client1" \
        --flag clientAuth \
        --outform pem < client-key.pem > client-cert.pem

    # Конфиг strongSwan с сертификатами
    connections {
        ikev2-cert {
            version = 2
            local_addrs = 0.0.0.0
            remote_addrs = %any
            local {
                auth = pubkey
                certs = server-cert.pem
                id = vpn.example.com
            }
            remote {
                auth = pubkey
                id = %any
            }
            pools = vpn-pool
            children {
                vpn {
                    local_ts = 0.0.0.0/0
                    esp_proposals = aes256gcm16-sha256-x25519
                }
            }
        }
    }

    pools {
        vpn-pool {
            addrs = 10.100.0.0/24
            dns = 8.8.8.8
        }
    }

---

## OpenVPN

OpenVPN - VPN решение на базе TLS/SSL. Работает в user space, не требует поддержки в ядре. Очень гибкий: TCP или UDP, любой порт, поддержка прокси.

    Версии протокола:
      OpenVPN 2.x - классический, TLS 1.0+, широко поддерживается.
      OpenVPN 3.x - переписан, только TLS 1.2+, улучшенная безопасность.
      OpenVPN Access Server - коммерческая версия с веб-GUI.

    Порт по умолчанию: UDP 1194 (или TCP 443 для обхода файрволлов).

### Архитектура OpenVPN

    OpenVPN создаёт виртуальный сетевой интерфейс:
      tun0 - Layer 3 (IP туннель) - роутинг пакетов
      tap0 - Layer 2 (Ethernet туннель) - бридж сетей

    tun (используется чаще):
      Каждый пакет - IP пакет.
      Подходит для remote access VPN.
      Клиент получает IP адрес из VPN пула.

    tap (редко):
      Каждый фрейм - Ethernet фрейм.
      Подходит для site-to-site бридж соединений.
      Клиент становится частью L2 сети.

    Поток данных:
      Приложение → ядро → tun интерфейс → OpenVPN процесс →
      TLS шифрование → UDP/TCP сокет → интернет →
      VPN сервер → TLS расшифровка → tun интерфейс → маршрутизация

### TLS в OpenVPN

    OpenVPN использует TLS для:
      Аутентификации (сертификаты X.509 или PSK)
      Согласования ключей сессии
      Защиты управляющего канала

    Два канала:
      Control Channel  - TLS: аутентификация, обмен ключами, управление.
      Data Channel     - зашифрованные данные (AES-GCM или AES-CBC + HMAC).

    Data Channel ключи генерируются через TLS и обновляются каждые N секунд.

    tls-auth (HMAC подпись пакетов):
      Дополнительный ключ для HMAC подписи всех TLS пакетов.
      Защита от DoS: пакеты без правильной подписи отбрасываются до TLS.
      openvpn --genkey secret ta.key

    tls-crypt (шифрование управляющего канала):
      Улучшение tls-auth: управляющий канал полностью зашифрован.
      Скрывает факт использования OpenVPN (против DPI).
      openvpn --genkey tls-crypt-v2-server server.pem

### Настройка OpenVPN сервера

    # Установка
    apt install openvpn easy-rsa    # Debian/Ubuntu
    dnf install openvpn easy-rsa   # Fedora/RHEL

    # Создание PKI через easy-rsa
    make-cadir /etc/openvpn/easy-rsa
    cd /etc/openvpn/easy-rsa

    # Инициализация
    ./easyrsa init-pki

    # Создание CA
    ./easyrsa build-ca nopass
    # Введите Common Name: например "OpenVPN CA"

    # Сертификат сервера
    ./easyrsa gen-req server nopass
    ./easyrsa sign-req server server

    # Сертификат клиента
    ./easyrsa gen-req client1 nopass
    ./easyrsa sign-req client client1

    # Параметры Diffie-Hellman (только для OpenVPN 2.x)
    ./easyrsa gen-dh

    # HMAC ключ
    openvpn --genkey secret /etc/openvpn/ta.key

    # Конфигурация сервера /etc/openvpn/server.conf
    port 1194
    proto udp
    dev tun

    ca   /etc/openvpn/easy-rsa/pki/ca.crt
    cert /etc/openvpn/easy-rsa/pki/issued/server.crt
    key  /etc/openvpn/easy-rsa/pki/private/server.key
    dh   /etc/openvpn/easy-rsa/pki/dh.pem

    server 10.8.0.0 255.255.255.0    # VPN пул адресов

    # Маршрут клиентам (весь трафик через VPN)
    push "redirect-gateway def1 bypass-dhcp"
    push "dhcp-option DNS 8.8.8.8"
    push "dhcp-option DNS 8.8.4.4"

    keepalive 10 120
    tls-auth /etc/openvpn/ta.key 0   # 0 = сервер, 1 = клиент
    key-direction 0

    cipher AES-256-GCM
    auth SHA256
    ncp-ciphers AES-256-GCM:AES-128-GCM   # согласование шифра

    user nobody
    group nogroup
    persist-key
    persist-tun

    status /var/log/openvpn/status.log
    log-append /var/log/openvpn/openvpn.log
    verb 3

    # Включить IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # NAT (если VPN клиенты должны выходить в интернет через сервер)
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

    # Запуск
    systemctl enable --now openvpn@server
    systemctl status openvpn@server

### Настройка OpenVPN клиента

    # Конфигурация клиента client.ovpn
    client
    dev tun
    proto udp
    remote vpn.example.com 1194

    resolv-retry infinite
    nobind
    persist-key
    persist-tun

    ca   ca.crt
    cert client1.crt
    key  client1.key

    tls-auth ta.key 1   # 1 = клиент
    key-direction 1

    cipher AES-256-GCM
    auth SHA256
    verb 3

    # Inline сертификаты (всё в одном .ovpn файле)
    <ca>
    -----BEGIN CERTIFICATE-----
    (содержимое ca.crt)
    -----END CERTIFICATE-----
    </ca>

    <cert>
    -----BEGIN CERTIFICATE-----
    (содержимое client1.crt)
    -----END CERTIFICATE-----
    </cert>

    <key>
    -----BEGIN PRIVATE KEY-----
    (содержимое client1.key)
    -----END PRIVATE KEY-----
    </key>

    <tls-auth>
    (содержимое ta.key)
    </tls-auth>
    key-direction 1

    # Подключение
    openvpn --config client.ovpn                  # в терминале
    openvpn3 session-start --config client.ovpn   # через OpenVPN 3

    # Проверить подключение
    ip addr show tun0          # VPN IP
    ip route                   # таблица маршрутов
    curl ifconfig.me           # внешний IP (должен быть IP сервера)

### Скрипты управления клиентами

    # Отзыв сертификата клиента
    cd /etc/openvpn/easy-rsa
    ./easyrsa revoke client1
    ./easyrsa gen-crl
    cp pki/crl.pem /etc/openvpn/

    # Добавить в конфиг сервера
    # crl-verify /etc/openvpn/crl.pem

    systemctl reload openvpn@server

    # Просмотр подключённых клиентов
    cat /var/log/openvpn/status.log

    # Скрипт создания клиента
    #!/bin/bash
    CLIENT=$1
    cd /etc/openvpn/easy-rsa
    ./easyrsa gen-req $CLIENT nopass
    ./easyrsa sign-req client $CLIENT
    # Создать .ovpn файл
    cat > /tmp/$CLIENT.ovpn <<EOF
    client
    dev tun
    proto udp
    remote vpn.example.com 1194
    ...
    EOF
    cat pki/ca.crt >> /tmp/$CLIENT.ovpn
    # и т.д.

### Диагностика OpenVPN

    # Логи в реальном времени
    journalctl -u openvpn@server -f

    # Подробный режим в конфиге
    verb 6    # 0-9, 3 стандартный, 6 подробный

    # Проверить порт
    ss -ulnp | grep 1194          # UDP сокет
    nmap -sU -p 1194 localhost    # проверить снаружи

    # Тест TLS рукопожатия
    openssl s_client -connect vpn.example.com:1194

    # Мониторинг трафика
    tcpdump -i eth0 -n 'udp port 1194'

    # Частые проблемы:
    # "TLS Error: TLS handshake failed" - несовпадение tls-auth ключа
    #   или сертификата. Проверить ca.crt и ta.key.
    # "VERIFY ERROR: depth=0, error=certificate has expired"
    #   - истёк сертификат. Перевыпустить через easyrsa.
    # "Connection timed out" - UDP заблокирован файрволлом.
    #   Переключиться на TCP 443: proto tcp / port 443.
    # "Initialization Sequence Completed" - успешное подключение.

---

## WireGuard

WireGuard - современный VPN протокол, разработан Джейсоном Доненфилдом. Включён в ядро Linux начиная с версии 5.6 (март 2020). Около 4000 строк кода против ~70000 у OpenVPN.

    Ключевые особенности:
      Встроен в ядро Linux (нет user space процесса для данных).
      Только UDP (нет TCP режима).
      Криптография зафиксирована (нет переговоров о шифре).
      Роуминг: IP адрес пира может меняться, туннель не разрывается.
      Stealth: нет ответа на неаутентифицированные пакеты.

    Криптография WireGuard (фиксированная):
      Обмен ключами:  Curve25519 (ECDH)
      Шифрование:     ChaCha20-Poly1305 (AEAD)
      Хэширование:    BLAKE2s
      Handshake:      Noise Protocol Framework (IKpsk2)
      Timestamp:      TAI64N (защита от replay)

### Модель ключей WireGuard

    Каждый узел имеет пару ключей:
      Приватный ключ (private key) - секрет, 32 байта
      Публичный ключ (public key)  - из приватного, 32 байта, передаётся пирам

    Peer (пир) - удалённый узел.
    Каждый пир идентифицируется своим публичным ключом.
    Список пиров хранится в конфигурации.

    Pre-shared key (PSK):
      Опциональный дополнительный симметричный ключ.
      Защита от квантового взлома (post-quantum).
      По одному PSK на каждую пару узлов.

    # Генерация ключей
    wg genkey | tee private.key | wg pubkey > public.key
    cat private.key   # приватный ключ - никому не показывать
    cat public.key    # публичный ключ - передать пирам

    # Генерация pre-shared key
    wg genpsk > psk.key

### Handshake WireGuard (Noise IKpsk2)

    WireGuard использует Noise Protocol Framework, паттерн IKpsk2.
    Handshake занимает 1 RTT (два сообщения).

    Инициатор                              Ответчик
        │                                      │
        │──── Initiation (msg1) ──────────────►│
        │     - Ephemeral public key (Eph_I)   │
        │     - Static public key зашифрован   │
        │     - Timestamp зашифрован           │
        │     - MAC1, MAC2                     │
        │                                      │
        │◄─── Response (msg2) ─────────────────│
        │     - Ephemeral public key (Eph_R)   │
        │     - Empty (подтверждение)          │
        │     - MAC1, MAC2                     │
        │                                      │
        │═══════════ Данные (зашифровано) ═════│

    Вывод ключей (упрощённо):
      Используются DH операции:
        DH(Eph_I, Eph_R)   - эфемерные ключи обоих сторон
        DH(Eph_I, Static_R) - эфемерный инициатора + статичный ответчика
        DH(Static_I, Eph_R) - статичный инициатора + эфемерный ответчика
        + PSK если задан
      Результат: два симметричных ключа (send_key, recv_key).
      Ротация: новый handshake каждые 3 минуты (или каждые 2^64 пакетов).

    Защита от Replay:
      Каждый пакет имеет счётчик (nonce).
      Принимающая сторона отслеживает скользящее окно счётчиков.
      Дубликаты и старые пакеты отбрасываются.

### Настройка WireGuard сервера

    # Установка
    apt install wireguard    # Debian/Ubuntu
    dnf install wireguard-tools   # Fedora/RHEL
    # Ядро Linux 5.6+ - встроен, старше - нужен модуль wireguard-dkms

    # Генерация ключей сервера
    cd /etc/wireguard
    wg genkey | tee server_private.key | wg pubkey > server_public.key
    chmod 600 server_private.key

    # Конфигурация сервера /etc/wireguard/wg0.conf
    [Interface]
    PrivateKey = <содержимое server_private.key>
    Address = 10.0.0.1/24          # IP сервера в VPN сети
    ListenPort = 51820             # UDP порт

    # DNS (опционально)
    # DNS = 8.8.8.8

    # IP forwarding + NAT (для выхода в интернет)
    PostUp   = iptables -A FORWARD -i %i -j ACCEPT; \
               iptables -A FORWARD -o %i -j ACCEPT; \
               iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    PreDown  = iptables -D FORWARD -i %i -j ACCEPT; \
               iptables -D FORWARD -o %i -j ACCEPT; \
               iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

    # Клиент 1
    [Peer]
    PublicKey = <публичный ключ клиента 1>
    AllowedIPs = 10.0.0.2/32      # только этот IP разрешён от этого пира
    # PresharedKey = <PSK> (опционально)

    # Клиент 2
    [Peer]
    PublicKey = <публичный ключ клиента 2>
    AllowedIPs = 10.0.0.3/32
    PersistentKeepalive = 25      # keepalive через NAT

    # Включить IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # Запуск
    wg-quick up wg0            # поднять интерфейс
    systemctl enable --now wg-quick@wg0   # автозапуск

    # Управление
    wg show                    # статус всех интерфейсов
    wg show wg0                # статус конкретного интерфейса
    wg-quick down wg0          # опустить интерфейс
    wg-quick up wg0            # поднять интерфейс

    # Добавить пира без перезапуска
    wg set wg0 peer <pubkey> allowed-ips 10.0.0.4/32
    wg-quick save wg0          # сохранить в конфиг

### Настройка WireGuard клиента

    # Генерация ключей клиента
    wg genkey | tee client_private.key | wg pubkey > client_public.key

    # Конфигурация клиента /etc/wireguard/wg0.conf
    [Interface]
    PrivateKey = <содержимое client_private.key>
    Address = 10.0.0.2/24         # IP клиента в VPN сети
    DNS = 8.8.8.8                 # DNS через VPN

    [Peer]
    PublicKey = <публичный ключ сервера>
    Endpoint = vpn.example.com:51820   # адрес сервера
    AllowedIPs = 0.0.0.0/0            # весь трафик через VPN
    # AllowedIPs = 10.0.0.0/24        # только VPN трафик (split tunnel)
    PersistentKeepalive = 25          # keepalive (нужен за NAT)

    # Подключение
    wg-quick up wg0

    # Проверить
    wg show                    # должен показать handshake время
    ping 10.0.0.1              # пинг сервера
    curl ifconfig.me           # внешний IP = IP сервера

    # AllowedIPs - и маршрутизация, и фильтрация:
    #   Исходящий трафик: пакеты для IP из AllowedIPs уходят в туннель.
    #   Входящий трафик:  только пакеты с IP из AllowedIPs принимаются от пира.

### Mesh VPN с WireGuard

    WireGuard изначально peer-to-peer: каждый узел может связываться с каждым.

    Топология:
      Node A (10.0.0.1) ←→ Node B (10.0.0.2)
                        ←→ Node C (10.0.0.3)
      Node B            ←→ Node C

    Каждый узел знает публичные ключи всех остальных.

    Автоматизация mesh:
      Tailscale  - управляемый WireGuard mesh (координатор в облаке).
      Headscale  - self-hosted замена координатору Tailscale.
      Netbird    - self-hosted WireGuard mesh с веб-UI.
      innernet   - CLI-based WireGuard mesh.

    # Пример 3-узловой mesh сети на Node A:
    [Interface]
    PrivateKey = <privkey_A>
    Address = 10.0.0.1/24
    ListenPort = 51820

    [Peer]  # Node B
    PublicKey = <pubkey_B>
    AllowedIPs = 10.0.0.2/32
    Endpoint = b.example.com:51820

    [Peer]  # Node C
    PublicKey = <pubkey_C>
    AllowedIPs = 10.0.0.3/32
    Endpoint = c.example.com:51820

### Диагностика WireGuard

    # Статус и статистика
    wg show wg0
    # interface: wg0
    #   public key: ...
    #   listening port: 51820
    #
    # peer: <pubkey>
    #   endpoint: 1.2.3.4:51820
    #   allowed ips: 10.0.0.2/32
    #   latest handshake: 30 seconds ago   ← есть соединение
    #   transfer: 1.20 MiB received, 3.45 MiB sent

    # Если "latest handshake" пустой - нет соединения.

    # Проверить маршруты
    ip route show table main
    ip route show table 51820   # wg-quick создаёт отдельную таблицу

    # Проверить firewall
    iptables -L FORWARD -n -v   # цепочка FORWARD

    # Дамп пакетов
    tcpdump -i eth0 -n 'udp port 51820'

    # Логи ядра
    dmesg | grep wireguard

    # Типичные проблемы:
    # Нет handshake - проверить:
    #   1. UDP 51820 открыт на файрволле сервера
    #   2. Правильный публичный ключ сервера у клиента
    #   3. Правильный Endpoint (IP:порт сервера)
    #   4. AllowedIPs включает нужные адреса

    # Есть handshake, нет трафика:
    #   1. ip_forward включён на сервере?
    #   2. iptables FORWARD разрешает?
    #   3. NAT настроен?
    #   4. Маршрут на сервере к клиентской сети?

---

## Сравнение IPSec, OpenVPN, WireGuard

                    IPSec               OpenVPN             WireGuard
    ──────────────────────────────────────────────────────────────────────
    Уровень OSI     L3 (ядро)           L3/L2 (user space)  L3 (ядро)
    Протокол        ESP/UDP             UDP/TCP             UDP only
    Стандарт        IETF RFC            OpenVPN Inc.        Kernel/RFC
    Код (строк)     сложно считать      ~70 000             ~4 000
    В ядре Linux    да                  нет (tun/tap)       с 5.6 (2020)
    Производит.     высокая             средняя             очень высокая
    Латентность     низкая              средняя             очень низкая
    Аутентификация  PSK / X.509 / EAP   X.509 / PSK         публичные ключи
    Крипто          настраивается       настраивается       фиксировано
    NAT проблемы    есть (NAT-T)        нет                 нет
    Роуминг IP      ограничен (MOBIKE)  нет                 да (встроен)
    Обход DPI       трудно              TCP 443 (сложно)    трудно
    Мобильные ОС    нативная поддержка  приложение          нативная (iOS/Android)
    Сложность       высокая             средняя             низкая
    Отладка         сложная             умеренная           простая
    Поддержка       везде               широко              растёт

    Когда выбирать IPSec:
      - Site-to-site между корпоративными маршрутизаторами (Cisco, Juniper...).
      - Нужна нативная поддержка на всех платформах без доп. ПО.
      - Требуется соответствие стандартам (FIPS, Common Criteria).
      - Интеграция с существующей PKI инфраструктурой.

    Когда выбирать OpenVPN:
      - Нужен TCP режим (обход строгих файрволлов, прокси).
      - Клиентов много, нужна гибкая раздача конфигов (.ovpn).
      - Нужна аутентификация логин/пароль (plugin-based).
      - Широкая совместимость (Windows XP и выше).

    Когда выбирать WireGuard:
      - Максимальная производительность.
      - Простота настройки и обслуживания.
      - Мобильные клиенты с частой сменой IP.
      - Mesh-сеть (Tailscale, Netbird).
      - Новый проект без legacy ограничений.

---

## Производительность и тесты

    # Тест пропускной способности iperf3
    # На сервере:
    iperf3 -s

    # На клиенте (через VPN):
    iperf3 -c 10.0.0.1 -t 30           # TCP тест 30 секунд
    iperf3 -c 10.0.0.1 -u -b 1G        # UDP тест

    # Типичные результаты (зависит от железа):
    # WireGuard:  ~3-10 Gbps (с AES-NI или без)
    # IPSec ESP:  ~1-5 Gbps (в ядре)
    # OpenVPN:    ~200-600 Mbps (user space)

    # Проверить загрузку CPU во время VPN трафика
    mpstat -P ALL 1    # по ядрам
    perf top           # горячие функции

    # Размер MTU:
    # Физический MTU: 1500 байт (Ethernet)
    # IPSec overhead:  ~50-60 байт → MTU туннеля ~1440
    # OpenVPN overhead: ~35-50 байт → MTU ~1450
    # WireGuard overhead: 60 байт (IPv4) / 80 байт (IPv6) → MTU ~1420

    # Установить MTU для WireGuard
    [Interface]
    MTU = 1420   # добавить в wg0.conf

    # Для OpenVPN
    tun-mtu 1420
    fragment 1300
    mssfix 1300

---

## Безопасность VPN

### Общие принципы

    Perfect Forward Secrecy (PFS):
      Компрометация долгосрочных ключей не раскрывает прошлые сессии.
      IPSec: включить PFS в политике (pfs=yes в strongSwan).
      OpenVPN: ECDHE автоматически обеспечивает PFS.
      WireGuard: PFS встроен (эфемерные ключи в каждом handshake).

    Kill Switch:
      Блокировать весь трафик если VPN отвалился.
      Без kill switch: приложения продолжат работать через обычный интернет.

      # WireGuard kill switch через AllowedIPs
      AllowedIPs = 0.0.0.0/0, ::/0   # весь трафик через VPN

      # WireGuard kill switch через iptables
      PostUp  = iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) \
                -m addrtype ! --dst-type LOCAL -j REJECT
      PreDown = iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) \
                -m addrtype ! --dst-type LOCAL -j REJECT

    DNS Leak:
      Запросы DNS могут идти мимо VPN к провайдерскому DNS.
      Решение: push DNS сервер клиенту через VPN.
      Проверка: dnsleaktest.com или dnsleak.sh

    Split Tunneling:
      Только часть трафика идёт через VPN.
      IPSec: traffic selectors определяют какой трафик в туннель.
      OpenVPN: маршруты через push или конфиг клиента.
      WireGuard: AllowedIPs = 10.0.0.0/24 (только VPN сеть).

### Атаки на VPN

    MITM атака на PSK:
      Слабый Pre-Shared Key можно брутфорсить из захваченного IKE трафика.
      Рекомендация: PSK минимум 32 случайных символа, или использовать сертификаты.

    Certificate Attack:
      Поддельный сертификат CA → MITM.
      Рекомендация: certificate pinning, private CA, DANE (DNS-based).

    Replay атака:
      Повторная отправка старых пакетов.
      IPSec: Sequence Number + Anti-Replay Window.
      WireGuard: TAI64N timestamp + sliding window.

    VPN Fingerprinting (DPI):
      Провайдер/файрволл определяет что используется VPN.
      IPSec: узнаваемые UDP 500, UDP 4500, ESP пакеты.
      OpenVPN: характерный TLS handshake, tls-crypt скрывает.
      WireGuard: узнаваемые пакеты handshake (нет stealth режима).
      Обфускация: obfs4, shadowsocks поверх VPN туннеля.

    VPN Leak через WebRTC:
      Браузер раскрывает реальный IP через WebRTC даже при VPN.
      Решение: отключить WebRTC в браузере или использовать расширение.

---

## Шпаргалка

    IPSec:
      Протоколы: IKEv2 (UDP 500/4500) + ESP (IP протокол 50)
      Режимы:    Transport (host-to-host) / Tunnel (site-to-site)
      Ключи:     PSK или X.509 сертификаты
      SA:        однонаправленное соглашение о параметрах защиты
      Инструменты: strongSwan, Libreswan, Openswan

      # Проверить SA
      ip xfrm state
      ip xfrm policy
      ipsec statusall   # strongSwan

    OpenVPN:
      Порт:    UDP 1194 (или TCP 443)
      Каналы:  Control (TLS) + Data (AES-GCM)
      Интерфейс: tun (L3) или tap (L2)
      PKI:     easy-rsa для управления сертификатами
      tls-auth / tls-crypt - защита управляющего канала

      # Запуск
      systemctl start openvpn@server
      # Статус клиентов
      cat /var/log/openvpn/status.log

    WireGuard:
      Порт:    UDP 51820
      Крипто:  Curve25519 + ChaCha20-Poly1305 + BLAKE2s (фиксировано)
      Ключи:   wg genkey | wg pubkey
      AllowedIPs: маршрутизация + ACL одновременно
      Роуминг: встроен, IP может меняться
      В ядре:  Linux 5.6+, macOS нативно, iOS/Android

      # Статус
      wg show
      # Запуск
      wg-quick up wg0

    Выбор протокола:
      Корпоративный site-to-site, legacy оборудование → IPSec IKEv2
      Много клиентов, гибкость, TCP обход файрволла  → OpenVPN
      Производительность, простота, мобильность      → WireGuard

    Проверка VPN:
      ip addr show tun0 / wg0    - VPN интерфейс
      ip route                   - таблица маршрутов
      ping 10.0.0.1              - пинг VPN сервера
      curl ifconfig.me           - внешний IP
      tcpdump -i wg0             - трафик в туннеле
      wg show                    - статус WireGuard

---

## Ссылки

- [RFC 4301](https://www.rfc-editor.org/rfc/rfc4301) - IPSec Architecture
- [RFC 7296](https://www.rfc-editor.org/rfc/rfc7296) - IKEv2
- [RFC 4303](https://www.rfc-editor.org/rfc/rfc4303) - ESP
- [RFC 3948](https://www.rfc-editor.org/rfc/rfc3948) - UDP Encapsulation of IPSec ESP (NAT-T)
- [WireGuard Whitepaper](https://www.wireguard.com/papers/wireguard.pdf) - оригинальная статья
- [Noise Protocol Framework](https://noiseprotocol.org) - основа handshake WireGuard
- [strongSwan Docs](https://docs.strongswan.org) - документация strongSwan
- [OpenVPN Docs](https://openvpn.net/community-resources/) - документация OpenVPN
- [WireGuard Quick Start](https://www.wireguard.com/quickstart/) - официальное руководство
- [Tailscale Blog](https://tailscale.com/blog/) - статьи о WireGuard mesh
