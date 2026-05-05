---
title: "SNMP - MIB, OID, Community Strings"
date: "2026-05-05"
---

SNMP (Simple Network Management Protocol) - протокол управления и мониторинга сетевых устройств. Позволяет опрашивать роутеры, коммутаторы, серверы, принтеры и получать данные о состоянии: загрузка CPU, трафик интерфейсов, использование памяти. Определён в RFC 1157 (v1), RFC 1901 (v2c), RFC 3411-3418 (v3).

```
Схема работы SNMP:

NMS (Network Management System)        Управляемое устройство
  (Zabbix, PRTG, Nagios, LibreNMS)           (роутер, свитч)
         │                                         │
         │  GET-REQUEST (OID)   UDP 161            │
         │────────────────────────────────────────►│
         │                                         │
         │  GET-RESPONSE (значение)                │
         │◄────────────────────────────────────────│
         │                                         │
         │◄─── TRAP (событие)     UDP 162 ─────────│
         │     (устройство само сообщает)           │
```

---

## Версии SNMP

```
SNMPv1 (RFC 1157, 1988):
  - Community string как единственная аутентификация
  - Пароль передаётся в открытом виде
  - 32-битные счётчики (переполнение на высокоскоростных каналах)
  - Устарел, но встречается в старом оборудовании

SNMPv2c (RFC 1901, 1995):
  - "c" = community-based (та же простая аутентификация)
  - 64-битные счётчики (Counter64 - не переполняется на 10G+)
  - Новые типы PDU: GetBulk (эффективный обход таблиц)
  - Лучшая обработка ошибок
  - Самая распространённая версия сегодня

SNMPv3 (RFC 3411, 2002):
  - Настоящая аутентификация (HMAC-MD5, HMAC-SHA)
  - Шифрование (DES, AES-128, AES-192, AES-256)
  - Контроль доступа (View-Based Access Control - VACM)
  - Нет community strings - есть пользователи с паролями
  - Рекомендуется для production
```

```
Сравнение версий:

                SNMPv1    SNMPv2c   SNMPv3
                -------   -------   ------
Аутентификация  Community Community Username+Auth
Шифрование      Нет       Нет       AES/DES
64-бит счётчик  Нет       Да        Да
GetBulk         Нет       Да        Да
Безопасность    Низкая    Низкая    Высокая
Сложность       Простой   Простой   Сложный
```

---

## OID - Object Identifier

OID - уникальный идентификатор объекта в иерархическом дереве MIB. Представляет собой последовательность чисел разделённых точками.

### Структура OID

```
OID записывается как последовательность чисел:
  1.3.6.1.2.1.1.1.0

Каждое число - ветка в дереве:
  1          - iso
  1.3        - iso.org
  1.3.6      - iso.org.dod
  1.3.6.1    - iso.org.dod.internet
  1.3.6.1.1  - directory
  1.3.6.1.2  - mgmt
  1.3.6.1.2.1 - mib-2 (стандартные MIB)
  1.3.6.1.4  - private (вендорские расширения)
  1.3.6.1.4.1 - enterprises (вендорские OID)
  1.3.6.1.4.1.9  - Cisco
  1.3.6.1.4.1.11 - HP
  1.3.6.1.4.1.2636 - Juniper

Дерево OID:
  iso(1)
  └── org(3)
      └── dod(6)
          └── internet(1)
              ├── mgmt(2)
              │   └── mib-2(1)
              │       ├── system(1)         ← sysDescr, sysUpTime...
              │       ├── interfaces(2)     ← ifTable, ifSpeed...
              │       ├── ip(4)             ← ipAddrTable...
              │       ├── tcp(6)
              │       ├── udp(7)
              │       └── snmp(11)
              └── private(4)
                  └── enterprises(1)
                      ├── cisco(9)
                      ├── hp(11)
                      └── juniper(2636)
```

### Важные OID (mib-2)

```
Группа system (1.3.6.1.2.1.1):
  1.3.6.1.2.1.1.1.0   sysDescr      - описание устройства
  1.3.6.1.2.1.1.2.0   sysObjectID   - OID типа устройства
  1.3.6.1.2.1.1.3.0   sysUpTime     - время работы (в сотых долях секунды)
  1.3.6.1.2.1.1.4.0   sysContact    - контакт администратора
  1.3.6.1.2.1.1.5.0   sysName       - имя устройства (hostname)
  1.3.6.1.2.1.1.6.0   sysLocation   - физическое расположение
  1.3.6.1.2.1.1.7.0   sysServices   - типы сервисов

Группа interfaces (1.3.6.1.2.1.2):
  1.3.6.1.2.1.2.1.0   ifNumber      - количество интерфейсов
  1.3.6.1.2.1.2.2     ifTable       - таблица интерфейсов
  1.3.6.1.2.1.2.2.1.1 ifIndex       - индекс интерфейса
  1.3.6.1.2.1.2.2.1.2 ifDescr       - описание (eth0, GigabitEthernet0/0)
  1.3.6.1.2.1.2.2.1.5 ifSpeed       - скорость (бит/сек)
  1.3.6.1.2.1.2.2.1.7 ifAdminStatus - административный статус (1=up, 2=down)
  1.3.6.1.2.1.2.2.1.8 ifOperStatus  - операционный статус (1=up, 2=down)
  1.3.6.1.2.1.2.2.1.10 ifInOctets   - входящих байт (32-бит, переполняется!)
  1.3.6.1.2.1.2.2.1.16 ifOutOctets  - исходящих байт (32-бит)

IF-MIB (64-битные счётчики, RFC 2863):
  1.3.6.1.2.1.31.1.1.1.6  ifHCInOctets   - входящих байт (64-бит)
  1.3.6.1.2.1.31.1.1.1.10 ifHCOutOctets  - исходящих байт (64-бит)
  1.3.6.1.2.1.31.1.1.1.15 ifHighSpeed    - скорость в Mbps

Группа ip (1.3.6.1.2.1.4):
  1.3.6.1.2.1.4.1.0    ipForwarding  - маршрутизация (1=да, 2=нет)
  1.3.6.1.2.1.4.20     ipAddrTable   - таблица IP адресов
  1.3.6.1.2.1.4.21     ipRouteTable  - таблица маршрутов
  1.3.6.1.2.1.4.3.0    ipInReceives  - входящих IP пакетов

Группа tcp (1.3.6.1.2.1.6):
  1.3.6.1.2.1.6.9.0    tcpCurrEstab  - текущих TCP соединений
  1.3.6.1.2.1.6.10.0   tcpInSegs     - входящих TCP сегментов
  1.3.6.1.2.1.6.11.0   tcpOutSegs    - исходящих TCP сегментов
```

### Финальный .0 в OID

```
.0 в конце OID означает скалярный объект (одно значение).
Без .0 - это объект в таблице или определение типа.

  1.3.6.1.2.1.1.1.0  - sysDescr (одно значение для устройства)
  1.3.6.1.2.1.2.2.1.2.1 - ifDescr для интерфейса с индексом 1
  1.3.6.1.2.1.2.2.1.2.2 - ifDescr для интерфейса с индексом 2

В таблицах последнее число - индекс строки:
  ifTable (1.3.6.1.2.1.2.2)
    ifEntry (1.3.6.1.2.1.2.2.1)
      ifDescr (1.3.6.1.2.1.2.2.1.2)
        ifDescr.1 = "eth0"      (1.3.6.1.2.1.2.2.1.2.1)
        ifDescr.2 = "eth1"      (1.3.6.1.2.1.2.2.1.2.2)
        ifDescr.3 = "lo"        (1.3.6.1.2.1.2.2.1.2.3)
```

---

## MIB - Management Information Base

MIB - база данных с описанием всех OID, их типов, значений и структуры. MIB файл написан на языке SMI (Structure of Management Information).

### Формат MIB файла

```
-- Пример из MIB-II (RFC 1213)
-- Файл: RFC1213-MIB.txt

RFC1213-MIB DEFINITIONS ::= BEGIN

IMPORTS
    mgmt, NetworkAddress, IpAddress, Counter, Gauge,
    TimeTicks FROM RFC1155-SMI
    OBJECT-TYPE FROM RFC-1212;

-- Определение группы system
system OBJECT IDENTIFIER ::= { mib-2 1 }

sysDescr OBJECT-TYPE
    SYNTAX  DisplayString (SIZE (0..255))
    ACCESS  read-only
    STATUS  mandatory
    DESCRIPTION
        "A textual description of the entity. This value
        should include the full name and version of the
        hardware, software, and firmware."
    ::= { system 1 }

sysUpTime OBJECT-TYPE
    SYNTAX  TimeTicks
    ACCESS  read-only
    STATUS  mandatory
    DESCRIPTION
        "The time (in hundredths of a second) since the
        network management portion of the system was last
        re-initialized."
    ::= { system 3 }

END
```

### Типы данных SNMP

```
Базовые типы:
  INTEGER       - целое число (со знаком, 32-бит)
  Integer32     - то же самое (SNMPv2)
  Unsigned32    - беззнаковое 32-бит
  Counter32     - монотонно возрастающий счётчик (32-бит, сбрасывается)
  Counter64     - монотонно возрастающий счётчик (64-бит)
  Gauge32       - значение которое может расти и убывать
  TimeTicks     - время в сотых долях секунды
  OctetString   - строка байт (тексты, MAC адреса и т.д.)
  DisplayString - текстовая строка (подтип OctetString)
  IpAddress     - IPv4 адрес (4 байта)
  OBJECT IDENTIFIER - OID
  Bits          - битовая маска

Значения статуса:
  ifAdminStatus / ifOperStatus:
    1 = up
    2 = down
    3 = testing
    4 = unknown
    5 = dormant
    6 = notPresent
    7 = lowerLayerDown
```

### Стандартные MIB файлы

```
MIB-II (RFC 1213):          Базовый набор - system, interfaces, ip, tcp, udp
IF-MIB (RFC 2863):          64-битные счётчики интерфейсов
HOST-RESOURCES-MIB:         CPU, память, диск, процессы (RFC 2790)
BRIDGE-MIB (RFC 4188):      Коммутаторы, MAC таблицы
Q-BRIDGE-MIB (RFC 4363):    VLAN
OSPF-MIB (RFC 1850):        Маршрутизация OSPF
BGP4-MIB (RFC 4273):        BGP
MPLS-MIB:                   MPLS
UCD-SNMP-MIB:               Расширения Net-SNMP (Linux CPU, диск, процессы)
Cisco-specific MIB:         CISCO-PROCESS-MIB, CISCO-MEMORY-POOL-MIB...
```

```
# Расположение MIB файлов
ls /usr/share/snmp/mibs/          # Linux (net-snmp)
ls /usr/share/mibs/               # альтернативное место

# Скачать дополнительные MIB
apt install snmp-mibs-downloader
download-mibs

# После установки разкомментировать строку в /etc/snmp/snmp.conf:
# mibs +ALL
# или
echo "mibs +ALL" >> ~/.snmp/snmp.conf
```

---

## Community Strings

Community string - это пароль для SNMPv1/v2c. Передаётся в открытом виде в каждом SNMP пакете.

### Типы доступа

```
Read-Only (RO) community - только чтение:
  Обычно называется "public"
  Позволяет делать GET, GETNEXT, GETBULK
  НЕ позволяет изменять конфигурацию

Read-Write (RW) community - чтение и запись:
  Обычно называется "private"
  Позволяет делать GET и SET
  SET может менять конфигурацию устройства!
  ОЧЕНЬ опасно если доступно снаружи

По умолчанию почти везде:
  RO community: "public"
  RW community: "private"
  - это огромная дыра безопасности
  - ВСЕГДА менять на сложные строки
```

```
# Пример пакета SNMPv2c (wireshark):
# SNMP version: v2c
# Community: public          ← видно в открытом виде!
# PDU type: GetRequest
# OID: 1.3.6.1.2.1.1.1.0

# Захват community strings из трафика:
tcpdump -i eth0 -n udp port 161 -A | grep -i "public\|private\|community"
```

### Безопасность Community Strings

```
Проблемы SNMPv1/v2c:
  - Community string в открытом виде в UDP пакете
  - Нет защиты от replay атак
  - Нет шифрования данных
  - "public" и "private" - дефолтные значения на большинстве устройств

Минимальные меры защиты для v1/v2c:
  1. Сменить "public" и "private" на случайные строки
  2. Ограничить доступ по IP (ACL на устройстве и файрволле)
  3. Отключить RW community если не нужен
  4. Использовать SNMP только в management VLAN
  5. Блокировать UDP 161/162 снаружи периметра

Лучшее решение: перейти на SNMPv3
```

---

## PDU - типы операций SNMP

```
PDU (Protocol Data Unit) - единица данных SNMP.

SNMPv1/v2c PDU типы:
  GetRequest      - запросить конкретные OID
  GetNextRequest  - получить следующий OID (обход таблицы)
  GetBulkRequest  - получить много OID за раз (v2c, эффективно)
  SetRequest      - установить значение OID
  GetResponse     - ответ от агента
  Trap            - уведомление от агента (v1)
  InformRequest   - подтверждаемый Trap (v2c)
  SNMPv2-Trap     - Trap в формате v2c

GetBulk параметры:
  non-repeaters: сколько OID запросить по одному разу
  max-repetitions: сколько раз повторить для остальных OID
  Используется для эффективного чтения таблиц.
```

```
Схема операций:

GET - получить конкретный OID:
  Manager → Agent: GET 1.3.6.1.2.1.1.5.0
  Agent → Manager: sysName = "router01"

GETNEXT - получить следующий в дереве:
  Manager → Agent: GETNEXT 1.3.6.1.2.1.1
  Agent → Manager: sysDescr.0 = "Cisco IOS..."

  GETNEXT 1.3.6.1.2.1.1.1.0
  → sysObjectID.0 = 1.3.6.1.4.1.9.1.1

  Используется для обхода (walk) всего дерева.

GETBULK - получить много OID:
  Manager → Agent: GETBULK max-repetitions=10 1.3.6.1.2.1.2.2.1.2
  Agent → Manager: ifDescr.1 = "eth0"
                   ifDescr.2 = "eth1"
                   ifDescr.3 = "lo"
                   ...

SET - изменить значение:
  Manager → Agent: SET sysName.0 = "new-router01"
  Agent → Manager: OK (или ошибка если нет прав)

TRAP - уведомление от устройства:
  Agent → Manager: Trap "linkDown" ifIndex=2
  (не требует ответа)

INFORM - подтверждаемое уведомление:
  Agent → Manager: InformRequest "linkDown"
  Manager → Agent: Response (подтверждение)
```

---

## SNMPv3 - безопасный SNMP

### Модели безопасности SNMPv3

```
SNMPv3 вводит три уровня безопасности:

noAuthNoPriv (noAuthNoPriv):
  - Нет аутентификации (только username)
  - Нет шифрования
  - Не безопаснее v2c

authNoPriv:
  - Аутентификация (HMAC-MD5 или HMAC-SHA)
  - Нет шифрования (данные видны в сети)
  - Защита от подделки пакетов

authPriv:
  - Аутентификация + шифрование
  - Данные зашифрованы (DES, AES-128, AES-192, AES-256)
  - Максимальная безопасность
  - Используй именно это в production

Алгоритмы аутентификации:
  MD5    - устарел (128-бит)
  SHA-1  - устарел (160-бит)
  SHA-256 - рекомендуется
  SHA-384, SHA-512 - для высокой безопасности

Алгоритмы шифрования:
  DES    - устарел (56-бит)
  AES-128 - минимально приемлемо
  AES-192, AES-256 - рекомендуется
```

### Настройка SNMPv3

```
# Net-SNMP конфигурация агента (Linux)
# /etc/snmp/snmpd.conf

# Создать пользователя SNMPv3
# (делается командой ПОКА snmpd остановлен)
# net-snmp-config --create-snmpv3-user -ro -A "authpass123" -X "privpass456" -a SHA-256 -x AES monuser

# Или добавить в /var/lib/snmp/snmpd.conf:
createUser monuser SHA-256 "authpass123" AES "privpass456"

# В /etc/snmp/snmpd.conf:
rouser monuser priv         # read-only с authPriv
rwuser adminuser priv       # read-write с authPriv

# Представление (что видит пользователь)
view systemview included .1.3.6.1.2.1.1   # только system group
view allview    included .1                 # всё дерево

# Дать доступ к allview
rouser monuser priv -V allview

systemctl restart snmpd
```

```
# Настройка SNMPv3 на Cisco IOS:
snmp-server group MON-GROUP v3 priv
snmp-server user monuser MON-GROUP v3 auth sha AuthPass123 priv aes 128 PrivPass456
snmp-server view ALL-VIEW iso included
snmp-server group MON-GROUP v3 priv read ALL-VIEW

# Проверить
show snmp user
show snmp group
```

---

## Утилиты SNMP - практика

### snmpget

```
# Получить один OID
snmpget -v2c -c public 192.168.1.1 1.3.6.1.2.1.1.1.0
# SNMPv2-MIB::sysDescr.0 = STRING: Cisco IOS Software...

# Использовать имя вместо OID (если загружены MIB)
snmpget -v2c -c public 192.168.1.1 sysDescr.0
snmpget -v2c -c public 192.168.1.1 sysName.0
snmpget -v2c -c public 192.168.1.1 sysUpTime.0

# Несколько OID за раз
snmpget -v2c -c public 192.168.1.1 sysName.0 sysLocation.0 sysUpTime.0

# SNMPv3
snmpget -v3 -l authPriv -u monuser -a SHA-256 -A "authpass123" \
        -x AES -X "privpass456" 192.168.1.1 sysDescr.0

# Только значение (без имени OID)
snmpget -v2c -c public -Ov 192.168.1.1 sysName.0
# STRING: router01

# Только тип и значение
snmpget -v2c -c public -Ovq 192.168.1.1 sysName.0
# router01
```

### snmpwalk

```
# Обойти всё дерево MIB
snmpwalk -v2c -c public 192.168.1.1

# Обойти конкретную ветку
snmpwalk -v2c -c public 192.168.1.1 1.3.6.1.2.1.1
snmpwalk -v2c -c public 192.168.1.1 system

# Обойти таблицу интерфейсов
snmpwalk -v2c -c public 192.168.1.1 ifDescr
snmpwalk -v2c -c public 192.168.1.1 ifOperStatus
snmpwalk -v2c -c public 192.168.1.1 interfaces

# Показать только OID числами (без имён)
snmpwalk -v2c -c public -On 192.168.1.1 system

# Показать только значения
snmpwalk -v2c -c public -Ov 192.168.1.1 system

# SNMPv3 walk
snmpwalk -v3 -l authPriv -u monuser -a SHA-256 -A "auth123" \
         -x AES -X "priv456" 192.168.1.1 system
```

### snmpbulkwalk

```
# Эффективный обход таблиц через GetBulk (только v2c/v3)
snmpbulkwalk -v2c -c public 192.168.1.1 ifTable

# Настроить размер ответа
snmpbulkwalk -v2c -c public -Cr25 192.168.1.1 ifTable
# -Cr25 = max-repetitions=25 (25 OID за запрос)

# Сравнение скорости:
time snmpwalk    -v2c -c public 192.168.1.1 ifTable
time snmpbulkwalk -v2c -c public 192.168.1.1 ifTable
# bulkwalk значительно быстрее на больших таблицах
```

### snmpset

```
# Изменить значение (нужен RW community или SNMPv3 rwuser)
snmpset -v2c -c private 192.168.1.1 sysName.0 s "new-router01"
# s = STRING тип

# Типы данных для snmpset:
# i = INTEGER
# u = Unsigned32
# s = STRING (OctetString)
# x = HEX STRING
# d = DECIMAL STRING
# n = NULL
# o = OID
# t = TimeTicks
# a = IpAddress
# b = BITS

# Примеры SET:
snmpset -v2c -c private 192.168.1.1 sysContact.0 s "admin@company.com"
snmpset -v2c -c private 192.168.1.1 sysLocation.0 s "Server Room A, Rack 3"

# Отключить интерфейс (ifAdminStatus: 1=up, 2=down)
snmpset -v2c -c private 192.168.1.1 ifAdminStatus.2 i 2
```

### snmptrap и snmptrapd

```
# Отправить trap вручную (для тестирования)
snmptrap -v2c -c public 192.168.1.100 "" linkDown.0

# Отправить SNMPv3 trap
snmptrap -v3 -l authPriv -u trapuser -a SHA -A "authpass" \
         -x AES -X "privpass" 192.168.1.100 \
         "" linkDown.0 ifIndex i 2

# Запустить trap receiver (snmptrapd)
# /etc/snmp/snmptrapd.conf:
authCommunity log,execute,net public
traphandle default /usr/bin/logger

snmptrapd -f -Lo -c /etc/snmp/snmptrapd.conf

# Логи трапов
tail -f /var/log/syslog | grep snmptrapd
tail -f /var/log/snmptrapd.log
```

### snmptranslate

```
# Перевести OID в имя
snmptranslate 1.3.6.1.2.1.1.1.0
# SNMPv2-MIB::sysDescr.0

# Перевести имя в OID
snmptranslate -On SNMPv2-MIB::sysDescr.0
# .1.3.6.1.2.1.1.1.0

# Подробная информация об объекте
snmptranslate -Td SNMPv2-MIB::sysDescr
# SNMPv2-MIB::sysDescr
# sysDescr OBJECT-TYPE
#   SYNTAX DisplayString (SIZE (0..255))
#   ACCESS read-only
#   ...

# Показать дерево MIB
snmptranslate -Tp 1.3.6.1.2.1.1
```

---

## Практические примеры мониторинга

### Мониторинг трафика интерфейса

```
# Шаг 1 - найти индексы интерфейсов
snmpwalk -v2c -c public 192.168.1.1 ifDescr
# IF-MIB::ifDescr.1 = STRING: eth0
# IF-MIB::ifDescr.2 = STRING: eth1

# Шаг 2 - получить счётчики для интерфейса 1
snmpget -v2c -c public 192.168.1.1 \
    ifHCInOctets.1 ifHCOutOctets.1 ifHighSpeed.1 ifOperStatus.1

# Шаг 3 - вычислить скорость (два замера с интервалом)
T1_IN=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifHCInOctets.1)
sleep 60
T2_IN=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifHCInOctets.1)
BPS=$(( (T2_IN - T1_IN) * 8 / 60 ))
echo "Входящий трафик: $BPS бит/сек"

# Скрипт мониторинга всех интерфейсов
snmpwalk -v2c -c public -Ovq 192.168.1.1 ifDescr | nl | while read i name; do
  status=$(snmpget -v2c -c public -Ovq 192.168.1.1 ifOperStatus.$i 2>/dev/null)
  [ "$status" = "1" ] && status="UP" || status="DOWN"
  echo "$i: $name - $status"
done
```

### Мониторинг ресурсов сервера (HOST-RESOURCES-MIB)

```
# CPU загрузка (UCD-SNMP-MIB)
snmpget -v2c -c public 192.168.1.10 \
    UCD-SNMP-MIB::ssCpuUser.0 \
    UCD-SNMP-MIB::ssCpuSystem.0 \
    UCD-SNMP-MIB::ssCpuIdle.0

# Или через OID:
# 1.3.6.1.4.1.2021.11.9.0  - CPU user %
# 1.3.6.1.4.1.2021.11.10.0 - CPU system %
# 1.3.6.1.4.1.2021.11.11.0 - CPU idle %

# Память (HOST-RESOURCES-MIB)
snmpwalk -v2c -c public 192.168.1.10 hrStorage
# hrStorageDescr.1 = STRING: Physical memory
# hrStorageSize.1 = INTEGER: 4096000   (KB)
# hrStorageUsed.1 = INTEGER: 2048000   (KB)

# Процессы
snmpwalk -v2c -c public 192.168.1.10 hrSWRunName
# hrSWRunName.1 = STRING: systemd
# hrSWRunName.2 = STRING: nginx
# ...

# Диск
snmpwalk -v2c -c public 192.168.1.10 dskTable
# UCD-SNMP-MIB::dskPath.1 = STRING: /
# UCD-SNMP-MIB::dskTotal.1 = INTEGER: 51200000
# UCD-SNMP-MIB::dskAvail.1 = INTEGER: 30720000
# UCD-SNMP-MIB::dskPercent.1 = INTEGER: 40
```

### Мониторинг Cisco оборудования

```
# Cisco CPU (CISCO-PROCESS-MIB)
snmpget -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.109.1.1.1.1.8.1    # 5 min CPU avg

# Cisco память
snmpget -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.48.1.1.1.5.1       # used memory
    1.3.6.1.4.1.9.9.48.1.1.1.6.1       # free memory

# Cisco температура
snmpwalk -v2c -c public cisco-router \
    1.3.6.1.4.1.9.9.13.1.3             # ciscoEnvMonTemperatureTable

# Cisco интерфейсы с описанием
snmpwalk -v2c -c public cisco-router ifAlias
# IF-MIB::ifAlias.1 = STRING: "Uplink to Core Switch"
```

---

## Конфигурация snmpd (Linux агент)

```
# /etc/snmp/snmpd.conf - минимальная безопасная конфигурация

# SNMPv2c read-only (только с конкретных IP)
rocommunity mys3cur3str 127.0.0.1
rocommunity mys3cur3str 10.0.0.0/24    # сеть мониторинга

# Запретить дефолтный "public"
# (убрать или закомментировать строку с public)

# SNMPv3 пользователь (добавляется через createUser в /var/lib/snmp/snmpd.conf)
rouser monitorv3 priv

# Что показывать
view systemonly included .1.3.6.1.2.1.1   # только system
view all        included .1               # всё

# Расширенный доступ для мониторинга
extend uptime   /bin/cat /proc/uptime
extend loadavg  /bin/cat /proc/loadavg

# Trap destination
trap2sink 10.0.0.5 community_string

# sysLocation и sysContact
sysLocation "Server Room, Rack 5, Unit 3"
sysContact "ops@company.com"
```

```
# Проверить конфигурацию
snmpd -f -Lo -C -c /etc/snmp/snmpd.conf

# Запустить
systemctl start snmpd
systemctl enable snmpd

# Проверить что слушает
ss -ulnp | grep 161

# Тест локально
snmpget -v2c -c mys3cur3str localhost sysName.0
snmpwalk -v2c -c mys3cur3str localhost system
```

---

## Диагностика SNMP проблем

```
Проблема: нет ответа на SNMP запрос

Шаг 1 - проверить доступность порта 161
  nc -uzv 192.168.1.1 161
  # Connection to 192.168.1.1 161 port [udp/snmp] succeeded

  # Если нет ответа:
  # - UDP не имеет явного "отказа" (в отличие от TCP)
  # - Можно только поймать ответный пакет или его отсутствие

Шаг 2 - захват трафика
  tcpdump -i eth0 -n udp port 161
  # Видим ли запрос и ответ?

Шаг 3 - проверить community string
  snmpget -v2c -c public 192.168.1.1 sysDescr.0
  # Ошибка: Timeout (No Response)
  # Попробовать другие строки: public, private, community, snmp

Шаг 4 - проверить ACL на устройстве
  # Cisco:
  show snmp community
  show ip access-list SNMP-ACL

  # Linux snmpd:
  grep -i "com2sec\|rocommunity\|rwcommunity" /etc/snmp/snmpd.conf

Шаг 5 - проверить файрволл
  # Linux iptables:
  iptables -L INPUT -n | grep 161
  # Должно быть правило разрешающее UDP 161 с IP мониторинга

Шаг 6 - проверить что snmpd запущен
  systemctl status snmpd
  ss -ulnp | grep 161
```

```
Проблема: OID возвращает "No Such Object"
  - OID не существует на данном устройстве
  - Не загружен MIB файл
  - Неверный синтаксис OID
  
  Диагностика:
  snmpwalk -v2c -c public device .1.3.6.1.2.1  # что вообще доступно?
  snmptranslate -Td OID-имя                     # проверить OID в MIB

Проблема: Counter32 переполняется
  - На интерфейсах 100Mbit+ счётчик переполняется за минуты
  - Использовать Counter64: ifHCInOctets / ifHCOutOctets
  
  snmpget -v2c -c public device ifHCInOctets.1
  # требует SNMPv2c или v3
```

---

## Шпаргалка

```
Порты:
  UDP 161 - SNMP агент (запросы)
  UDP 162 - SNMP trap receiver (уведомления)

Версии:
  v1  - устарел, нет Counter64
  v2c - самый распространённый, есть Counter64 и GetBulk
  v3  - безопасный, аутентификация + шифрование

Community strings (v1/v2c):
  Дефолты: public (RO), private (RW) - ВСЕГДА менять!
  Передаются в открытом виде - ограничить по IP

SNMPv3 уровни:
  noAuthNoPriv - только username
  authNoPriv   - +аутентификация (SHA-256)
  authPriv     - +шифрование (AES-256) - используй это!

Операции:
  GET      - получить конкретный OID
  GETNEXT  - следующий OID (обход дерева)
  GETBULK  - много OID за раз (эффективно, v2c/v3)
  SET      - изменить значение (нужен RW доступ)
  TRAP     - уведомление от устройства (без подтверждения)
  INFORM   - уведомление с подтверждением (v2c/v3)

Ключевые OID:
  1.3.6.1.2.1.1.1.0  sysDescr     - описание устройства
  1.3.6.1.2.1.1.3.0  sysUpTime    - время работы
  1.3.6.1.2.1.1.5.0  sysName      - имя (hostname)
  1.3.6.1.2.1.2.2.1.2.N ifDescr   - имя интерфейса N
  1.3.6.1.2.1.2.2.1.8.N ifOperStatus - статус интерфейса N
  1.3.6.1.2.1.31.1.1.1.6.N  ifHCInOctets  - входящий трафик (64-бит)
  1.3.6.1.2.1.31.1.1.1.10.N ifHCOutOctets - исходящий трафик (64-бит)

Команды:
  snmpget  -v2c -c public host OID          - получить OID
  snmpwalk -v2c -c public host OID          - обойти ветку
  snmpbulkwalk -v2c -c public host OID      - быстрый обход
  snmpset  -v2c -c private host OID t val   - установить значение
  snmptranslate OID                         - имя <-> OID
  snmpwalk -v2c -c public -On host system   - вывести числовые OID

SNMPv3 флаги:
  -v3 -l authPriv -u USER -a SHA-256 -A "authpass" -x AES -X "privpass"
```

---

## Ссылки

- [RFC 1157](https://www.rfc-editor.org/rfc/rfc1157) - SNMPv1
- [RFC 1901](https://www.rfc-editor.org/rfc/rfc1901) - SNMPv2c
- [RFC 3411](https://www.rfc-editor.org/rfc/rfc3411) - SNMPv3 Architecture
- [RFC 3414](https://www.rfc-editor.org/rfc/rfc3414) - SNMPv3 User-based Security Model
- [RFC 1213](https://www.rfc-editor.org/rfc/rfc1213) - MIB-II
- [RFC 2863](https://www.rfc-editor.org/rfc/rfc2863) - IF-MIB (64-bit counters)
- [RFC 2790](https://www.rfc-editor.org/rfc/rfc2790) - HOST-RESOURCES-MIB
- [Net-SNMP](http://www.net-snmp.org) - документация и утилиты
- [OID Repository](https://oidref.com) - поиск OID
- [LibreNMS](https://www.librenms.org) - open-source мониторинг на SNMP
