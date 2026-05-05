---
title: "BGP, OSPF, RIP - принципы маршрутизации"
date: "2026-05-05"
---

Протоколы динамической маршрутизации позволяют роутерам автоматически обмениваться информацией о сетях и строить таблицы маршрутов. Без них каждый маршрут нужно было бы прописывать вручную.

---

## Классификация протоколов маршрутизации

```
Протоколы маршрутизации
├── IGP (Interior Gateway Protocol) - внутри автономной системы
│   ├── Distance Vector
│   │   ├── RIP (Routing Information Protocol)
│   │   └── EIGRP (Cisco, гибридный)
│   └── Link State
│       ├── OSPF (Open Shortest Path First)
│       └── IS-IS (Intermediate System to Intermediate System)
└── EGP (Exterior Gateway Protocol) - между автономными системами
    └── BGP (Border Gateway Protocol)
```

### Автономная система (AS)

    Автономная система (AS) - группа сетей под единым административным управлением,
    использующая единую политику маршрутизации.

    Примеры AS:
    - AS15169 - Google
    - AS32934 - Meta (Facebook)
    - AS8075  - Microsoft
    - AS13335 - Cloudflare

    Номер AS (ASN):
    - 16-битные: 1 - 65535 (старые, публичные)
    - 32-битные: 1 - 4294967295 (новые, RFC 4893)
    - Приватные: 64512 - 65534 (аналог RFC 1918 для IP)

    # Узнать ASN по IP
    whois 8.8.8.8 | grep origin
    curl https://ipinfo.io/8.8.8.8

---

## RIP - Routing Information Protocol

### Что такое RIP

RIP - один из старейших протоколов динамической маршрутизации. Работает по принципу **Distance Vector** - каждый роутер знает только расстояние до сети и через кого идти, но не видит всю топологию.

**Метрика RIP** = количество хопов (hop count)
- Максимум 15 хопов
- 16 хопов = бесконечность (сеть недостижима)

### Версии RIP

| Параметр | RIPv1 | RIPv2 |
| --- | --- | --- |
| RFC | 1058 | 2453 |
| Маски подсетей | Нет (classful) | Да (classless, CIDR) |
| Аутентификация | Нет | Да (MD5) |
| Multicast | Нет (broadcast) | 224.0.0.9 |
| Суммаризация | Автоматическая | Ручная и авто |
| VLSM | Не поддерживает | Поддерживает |

RIPng - версия для IPv6 (RFC 2080).

### Как работает RIP

```
Алгоритм Беллмана-Форда (Distance Vector):

Роутер R1:
  "Мои прямые соседи: R2 через eth0 (1 хоп), R3 через eth1 (1 хоп)"

R1 рассылает таблицу R2 и R3 каждые 30 секунд:
  Network 10.1.0.0/24 - 1 хоп
  Network 10.2.0.0/24 - 1 хоп

R2 получает таблицу R1 и добавляет +1 хоп:
  "Через R1 я могу достичь 10.2.0.0/24 за 2 хопа"
```

### Таймеры RIP

```
Update Timer:       30 сек  - как часто рассылаются обновления
Invalid Timer:     180 сек  - через сколько маршрут помечается недостижимым
Holddown Timer:    180 сек  - игнорируем обновления с худшей метрикой
Flush Timer:       240 сек  - через сколько маршрут удаляется из таблицы

Сходимость RIP медленная - может занять несколько минут.
```

### Проблема петель маршрутизации

```
Сеть: R1 - R2 - R3, сеть N подключена к R3

R3 отключается. Что происходит?

1. R2 знает о сети N через R3 (метрика 1)
2. R1 знает о N через R2 (метрика 2)
3. R3 упал, R2 ещё не знает об этом
4. R1 сообщает R2: "я знаю N за 2 хопа"
5. R2 думает: "отлично, через R1 за 3 хопа!" (забывает про R3)
6. R2 сообщает R1: "я знаю N за 3 хопа"
7. R1 обновляет: "через R2 за 4 хопа"
8. Метрика растёт до 16 = count to infinity
```

**Механизмы борьбы с петлями в RIP:**

```
1. Split Horizon
   - Не рекламируй маршрут обратно через интерфейс, откуда он получен
   - R2 не будет говорить R3 о маршруте, который получил от R3

2. Split Horizon with Poison Reverse
   - Рекламируй маршрут обратно, но с метрикой 16 (недостижимо)
   - Явно говоришь: "через меня туда не ходи"

3. Route Poisoning
   - При падении сети сразу объявляет метрику 16
   - Быстрее, чем ждать Invalid Timer

4. Triggered Updates
   - При изменении топологии отправить обновление немедленно
   - Не ждать 30 секунд
```

### Настройка RIP (Cisco IOS)

```
! Включение RIP
router rip
  version 2
  no auto-summary           ! Отключить автосуммаризацию
  network 192.168.1.0       ! Объявить сеть
  network 10.0.0.0          ! Объявить сеть
  passive-interface eth0    ! Не рассылать на этом интерфейсе
  redistribute static       ! Добавить статические маршруты в RIP

! Проверка
show ip rip database
show ip route rip
debug ip rip
```

### Настройка RIP (Linux / FRR)

```bash
# FRRouting (FRR) - современная реализация для Linux
# Установка
apt install frr

# /etc/frr/frr.conf
router rip
  network 192.168.1.0/24
  network 10.0.0.0/8
  version 2
  no auto-summary
!

# Запуск
systemctl start frr

# Просмотр таблицы RIP
vtysh -c "show ip rip"
vtysh -c "show ip route"
```

### Когда использовать RIP

```
Подходит:
- Маленькие сети (< 15 роутеров)
- Простые топологии без резервирования
- Учебные лабораторные стенды

Не подходит:
- Большие сети (ограничение 15 хопов)
- Сети, где важна скорость сходимости
- Современные корпоративные сети
- Сети с неравностоимыми каналами (метрика только в хопах)
```

---

## OSPF - Open Shortest Path First

### Что такое OSPF

OSPF - протокол состояния каналов (Link State). Каждый роутер знает **полную топологию** сети и самостоятельно рассчитывает кратчайшие пути с помощью алгоритма Дейкстры (SPF).

- RFC 2328 (OSPFv2 для IPv4)
- RFC 5340 (OSPFv3 для IPv6)
- Метрика = cost (стоимость) на основе пропускной способности

### Алгоритм Дейкстры (SPF)

```
Топология:
        10          5
R1 ─────────── R2 ────── R3
│                        │
│        20              │
└────────────────────────┘
                 15

R1 строит дерево кратчайших путей (SPT):
- R1 -> R2: cost 10
- R1 -> R3: min(10+5, 20) = 15 через R2 (а не 20 напрямую)

Стоимость интерфейса (cost) = 100 / bandwidth (Mbps)
- FastEthernet 100Mbps: cost = 1
- T1 1.544Mbps: cost = 64
- Serial 64kbps: cost = 1562
```

### База данных OSPF - LSDB

```
Каждый роутер строит LSDB (Link State Database):

Link State Advertisement (LSA) - объявление о состоянии канала
Каждый роутер рассылает свои LSA всем остальным.
LSDB = коллекция всех LSA в зоне.

При одинаковой LSDB у всех роутеров -> сеть сошлась (converged).
```

### Типы LSA

| Тип | Название | Описание |
| --- | --- | --- |
| 1 | Router LSA | Каждый роутер о своих интерфейсах |
| 2 | Network LSA | DR описывает broadcast-сегмент |
| 3 | Summary LSA | ABR анонсирует маршруты между зонами |
| 4 | ASBR Summary LSA | ABR анонсирует ASBR |
| 5 | External LSA | ASBR анонсирует внешние маршруты |
| 7 | NSSA External | Внешние маршруты в NSSA зоне |

### Зоны OSPF

```
OSPF делит сеть на зоны для уменьшения нагрузки SPF:

                    [Area 0 - Backbone]
                   /         |         \
            Area 1        Area 2      Area 3
         (Regular)      (Stub)       (NSSA)

Правила:
- Area 0 (Backbone) - обязательно должна существовать
- Все остальные зоны должны быть подключены к Area 0
- Трафик между зонами идёт через Area 0

Типы зон:
- Regular Area     - принимает все типы LSA
- Stub Area        - не принимает LSA тип 5 (внешние маршруты)
                     вместо них - default route от ABR
- NSSA             - Not So Stubby Area, может иметь ASBR
                     использует LSA тип 7 вместо 5
- Totally Stub     - только LSA 1,2 + default route (Cisco)
```

### Роли роутеров в OSPF

```
Router (обычный роутер)
- Участвует в OSPF в своей зоне
- Поддерживает LSDB только своей зоны

ABR (Area Border Router)
- Соединяет две или более зон
- Имеет LSDB для каждой зоны
- Генерирует Summary LSA (тип 3)

ASBR (Autonomous System Boundary Router)
- Соединяет OSPF сеть с другим протоколом (BGP, RIP, статика)
- Генерирует External LSA (тип 5)

DR/BDR (Designated Router / Backup DR)
- Выбирается в broadcast-сегментах (Ethernet)
- DR собирает и рассылает LSA для сегмента
- Уменьшает количество adjacencies: N*(N-1)/2 -> N
```

### Процесс установления соседства

```
Этапы OSPF Neighbor State Machine:

Down         - нет пакетов от соседа
Init         - получен Hello, но своего Router ID нет в нём
2-Way        - свой Router ID есть в Hello соседа
               (DR/BDR выбирается здесь)
ExStart      - определение Master/Slave для обмена LSDB
Exchange     - обмен Database Description (DBD) пакетами
Loading      - запрос недостающих LSA через LSR
Full         - LSDB синхронизирована, сосед установлен

OSPF Multicast адреса:
224.0.0.5  - AllSPFRouters (все OSPF роутеры)
224.0.0.6  - AllDRRouters (только DR и BDR)
```

### Hello пакет OSPF

```
Hello пакет содержит:
- Router ID           - уникальный ID роутера (обычно IP)
- Area ID             - зона
- Hello Interval      - как часто шлём (default: 10 сек)
- Dead Interval       - когда считаем соседа мёртвым (default: 40 сек)
- Network Mask        - маска подсети
- Priority            - приоритет для выбора DR (default: 1)
- DR / BDR            - адреса текущих DR и BDR
- Authentication      - данные аутентификации

Соседство не установится если не совпадают:
- Area ID
- Hello и Dead Interval
- Authentication
- Network Mask (на broadcast-сегментах)
- Stub flag
```

### Выбор DR и BDR

```
На broadcast-сегментах (Ethernet) OSPF выбирает DR и BDR:

Критерии выбора DR (по убыванию приоритета):
1. Наибольший OSPF Priority (0-255, default 1)
   Priority = 0 -> роутер не участвует в выборах
2. Наибольший Router ID (если Priority одинаков)

Router ID = наибольший IP адрес:
1. Если настроен явно: router-id X.X.X.X
2. Иначе: наибольший IP loopback интерфейса
3. Иначе: наибольший IP активного интерфейса

Внимание: DR/BDR не перевыбирается при добавлении нового
          роутера с более высоким приоритетом (non-preemptive)
```

### Настройка OSPF (Cisco IOS)

```
! Базовая настройка
router ospf 1                          ! process ID (локальный, не совпадает у всех)
  router-id 1.1.1.1                   ! явный Router ID
  network 192.168.1.0 0.0.0.255 area 0  ! wildcard mask!
  network 10.0.0.0 0.0.0.3 area 0

! Настройка интерфейса
interface GigabitEthernet0/0
  ip ospf 1 area 0                    ! привязка к OSPF напрямую
  ip ospf cost 10                     ! ручная стоимость
  ip ospf priority 200                ! приоритет DR
  ip ospf hello-interval 5            ! Hello каждые 5 сек
  ip ospf dead-interval 20            ! Dead через 20 сек
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 SECRET

! Пассивный интерфейс (не рассылать Hello)
router ospf 1
  passive-interface GigabitEthernet0/1

! Редистрибуция
router ospf 1
  redistribute bgp 65000 metric 100 metric-type 2 subnets
  redistribute static subnets
  default-information originate         ! анонсировать default route

! Проверка
show ip ospf neighbor                  ! соседи
show ip ospf database                  ! LSDB
show ip ospf database router           ! LSA тип 1
show ip ospf interface                 ! параметры интерфейсов
show ip route ospf                     ! маршруты от OSPF
debug ip ospf events                   ! отладка событий
debug ip ospf adj                      ! отладка adjacency
```

### Настройка OSPF (Linux / FRR)

```bash
# /etc/frr/frr.conf
interface eth0
  ip ospf area 0.0.0.0
  ip ospf cost 10
  ip ospf hello-interval 10
  ip ospf dead-interval 40
!

router ospf
  ospf router-id 1.1.1.1
  network 192.168.1.0/24 area 0.0.0.0
  network 10.0.0.0/8 area 0.0.0.0
  passive-interface eth1
!

# Просмотр
vtysh -c "show ip ospf neighbor"
vtysh -c "show ip ospf database"
vtysh -c "show ip route ospf"
```

### Аутентификация OSPF

```
Типы аутентификации:
0 - None (нет)
1 - Plain text (небезопасно!)
2 - MD5 (рекомендуется)

Настройка MD5 на Cisco:
interface GigabitEthernet0/0
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 MySecretKey

router ospf 1
  area 0 authentication message-digest  ! на уровне зоны
```

### Проблемы и диагностика OSPF

```bash
# Соседство не устанавливается - проверить:
# 1. Одинаковая Area ID?
show ip ospf interface GigabitEthernet0/0

# 2. Одинаковые Hello/Dead timers?
show ip ospf neighbor detail

# 3. Одинаковая аутентификация?
debug ip ospf adj

# 4. MTU совпадает?
# Несовпадение MTU -> зависает на Exchange/Loading
ip ospf mtu-ignore                     ! обходное решение

# 5. Одинаковые subnet/mask?
show ip ospf database router

# Маршруты OSPF не появляются:
show ip route ospf
show ip ospf database summary          ! LSA тип 3
```

---

## BGP - Border Gateway Protocol

### Что такое BGP

BGP - единственный EGP протокол в интернете. Используется для обмена маршрутами между автономными системами. Управляет маршрутизацией **всего интернет-трафика**.

- RFC 4271 (BGP-4, текущая версия)
- Протокол Path Vector (путь через AS)
- Работает поверх TCP порт 179
- Метрика - не простое число, а набор атрибутов

### iBGP vs eBGP

```
eBGP (External BGP) - между разными AS
  - Обычно прямое соединение (TTL=1 по умолчанию)
  - Administrative Distance: 20
  - Next-hop меняется на IP интерфейса

iBGP (Internal BGP) - внутри одной AS
  - Может быть через множество хопов (TTL=255)
  - Administrative Distance: 200
  - Next-hop НЕ меняется (проблема!)
  - Full mesh или Route Reflector / Confederation

Full mesh iBGP:
N роутеров = N*(N-1)/2 сессий
10 роутеров = 45 сессий (много!)
```

### Route Reflector

```
Решение проблемы full mesh в iBGP:

                    [Route Reflector]
                   /        |         \
               RR Client  RR Client  RR Client
               (R1)       (R2)       (R3)

Route Reflector пересылает маршруты от одного клиента другим.
Нарушает правило "маршруты iBGP не пересылаются другим iBGP соседям".

Атрибуты для предотвращения петель:
- ORIGINATOR_ID  - Router ID оригинального отправителя
- CLUSTER_LIST   - список кластеров (RR), через которые прошёл маршрут
```

### BGP атрибуты (Path Attributes)

```
Well-known Mandatory (обязательные, все понимают):
- ORIGIN           - происхождение маршрута (IGP=i, EGP=e, incomplete=?)
- AS_PATH          - список AS на пути (защита от петель)
- NEXT_HOP         - следующий хоп

Well-known Discretionary (необязательные, все понимают):
- LOCAL_PREF       - предпочтение для выхода из AS (только iBGP)
- ATOMIC_AGGREGATE - маршрут был суммаризован

Optional Transitive (передаётся дальше, не все понимают):
- COMMUNITY        - метки для группировки маршрутов
- AGGREGATOR       - кто суммаризовал маршрут

Optional Non-Transitive (не передаётся):
- MED (MULTI_EXIT_DISC) - подсказка соседней AS, какой вход предпочтительнее
- ORIGINATOR_ID    - для Route Reflector
- CLUSTER_LIST     - для Route Reflector
```

### Алгоритм выбора лучшего маршрута BGP

```
BGP Best Path Selection (по порядку, первое различие = победитель):

1.  Weight (Cisco-specific)           - наибольший предпочтительнее
2.  LOCAL_PREF                        - наибольший предпочтительнее
3.  Locally originated                - локальные маршруты предпочтительнее
4.  AS_PATH length                    - кратчайший предпочтительнее
5.  ORIGIN                            - IGP < EGP < Incomplete
6.  MED                               - наименьший предпочтительнее
7.  eBGP over iBGP                    - eBGP предпочтительнее
8.  IGP metric to NEXT_HOP            - наименьшая метрика
9.  Oldest eBGP route                 - более старый маршрут (стабильнее)
10. Lowest Router ID                  - наименьший Router ID
11. Shortest Cluster List             - для Route Reflector
12. Lowest neighbor IP                - наименьший IP соседа

Мнемоника: "We Love Oranges AS Oranges Mean Pure Refreshment"
           Weight, Local_pref, Originated, AS_path, Origin, Med,
           Peer(eBGP), Routing metric, Remaining tiebreakers
```

### BGP Community

```
BGP Community - 32-битное значение (AA:NN формат)
Используется для группировки маршрутов и применения политик.

Well-known communities:
- NO_EXPORT (65535:65281)     - не экспортировать за пределы AS
- NO_ADVERTISE (65535:65282)  - не рекламировать никаким соседям
- NO_EXPORT_SUBCONFED         - не экспортировать за пределы sub-AS
- INTERNET (0:0)              - рекламировать всем

Пример использования:
Провайдер говорит клиенту: "отметь маршруты community 65000:100
и мы не будем передавать их в upstream"

Large Community (RFC 8092):
- 96 бит (3x32 бит): ASN:Function:Parameter
- Пример: 65000:1:100
```

### BGP сессия - установление соединения

```
BGP State Machine:

Idle         - не пытается подключиться
Connect      - TCP соединение устанавливается
Active        - TCP соединение не удалось, повтор
OpenSent     - OPEN сообщение отправлено
OpenConfirm  - OPEN получено, ждём KEEPALIVE
Established  - сессия установлена, обмен маршрутами

Сообщения BGP:
OPEN         - установление сессии (AS, Router ID, Hold time)
UPDATE       - анонс новых / отзыв маршрутов
KEEPALIVE    - поддержание сессии (каждые 60 сек, hold time 180 сек)
NOTIFICATION - ошибка, сессия закрывается

TCP порт 179 (BGP server слушает на нём)
```

### Настройка BGP (Cisco IOS)

```
! Базовая eBGP сессия
router bgp 65001
  bgp router-id 1.1.1.1
  neighbor 203.0.113.2 remote-as 65002    ! eBGP сосед
  neighbor 203.0.113.2 description ISP1
  neighbor 203.0.113.2 password SECRET
  !
  ! Анонсировать свою сеть
  network 198.51.100.0 mask 255.255.255.0
  !
  address-family ipv4 unicast
    neighbor 203.0.113.2 activate
    neighbor 203.0.113.2 soft-reconfiguration inbound
    neighbor 203.0.113.2 route-map FILTER-IN in
    neighbor 203.0.113.2 route-map FILTER-OUT out

! iBGP сессия
router bgp 65001
  neighbor 10.0.0.2 remote-as 65001       ! тот же AS = iBGP
  neighbor 10.0.0.2 update-source Loopback0

! Route Reflector
router bgp 65001
  neighbor 10.0.0.2 route-reflector-client
  neighbor 10.0.0.3 route-reflector-client

! Route Map для управления атрибутами
route-map FILTER-OUT permit 10
  match ip address prefix-list MY-PREFIXES
  set local-preference 150
  set community 65001:100 additive

ip prefix-list MY-PREFIXES seq 10 permit 198.51.100.0/24

! Проверка
show bgp summary
show bgp neighbors 203.0.113.2
show bgp ipv4 unicast
show bgp ipv4 unicast 198.51.100.0
show ip route bgp
debug ip bgp 203.0.113.2 events
```

### Настройка BGP (Linux / FRR)

```bash
# /etc/frr/frr.conf
router bgp 65001
  bgp router-id 1.1.1.1
  neighbor 203.0.113.2 remote-as 65002
  neighbor 203.0.113.2 description "ISP Uplink"
  !
  address-family ipv4 unicast
    network 198.51.100.0/24
    neighbor 203.0.113.2 activate
    neighbor 203.0.113.2 route-map FILTER-IN in
    neighbor 203.0.113.2 route-map FILTER-OUT out
  exit-address-family
!

route-map FILTER-OUT permit 10
  match ip address prefix-list MY-NETS
  set community 65001:100
!

ip prefix-list MY-NETS seq 10 permit 198.51.100.0/24
!

# Просмотр
vtysh -c "show bgp summary"
vtysh -c "show bgp ipv4 unicast"
vtysh -c "show bgp neighbors 203.0.113.2"
vtysh -c "show ip route bgp"
```

### BGP Security - проблемы и защита

```
Проблема: BGP Route Hijacking
Любой AS может анонсировать чужие префиксы (ошибочно или злонамеренно).

Случаи:
- 2008: Pakistan Telecom "уронила" YouTube (AS17557 анонсировала 208.65.153.0/24)
- 2010: China Telecom перехватила ~15% интернет-трафика на 18 минут
- 2019: Cloudflare downtime из-за утечки маршрутов через Verizon

Защита:
1. IRR (Internet Routing Registry) - регистрация своих префиксов
   Базы: RIPE, ARIN, APNIC, RADB

2. RPKI (Resource Public Key Infrastructure)
   - Криптографически подписанные ROA (Route Origin Authorization)
   - ROA: "только AS65001 может анонсировать 198.51.100.0/24"
   - BGP Origin Validation: Valid / Invalid / NotFound

3. BGPSEC (RFC 8205)
   - Криптографическая подпись всего AS_PATH
   - Не широко развёрнут

4. Prefix filtering
   - Принимать только ожидаемые префиксы от соседей
   - Отфильтровывать bogon prefixes и RFC 1918

5. GTSM (Generalized TTL Security Mechanism)
   - TTL = 255 для iBGP, 254 для eBGP
   - Защита от атак не от прямого соседа
```

---

## Сравнительная таблица

| Параметр | RIP | OSPF | BGP |
| --- | --- | --- | --- |
| Тип | Distance Vector | Link State | Path Vector |
| Применение | IGP (устарел) | IGP | EGP |
| Метрика | Хопы (max 15) | Cost (bandwidth) | Атрибуты |
| Сходимость | Медленная (мин) | Быстрая (сек) | Медленная (контролируемая) |
| Масштаб | Малые сети | Средние и большие | Весь интернет |
| Топология | Не знает | Полная карта зоны | AS_PATH |
| Протокол | UDP 520 | IP протокол 89 | TCP 179 |
| Аутентификация | MD5 (v2) | Plaintext, MD5 | MD5, TCP-AO |
| Политики | Нет | Ограниченные | Полный контроль |
| Административная дистанция (Cisco) | 120 | 110 | eBGP 20, iBGP 200 |

---

## Administrative Distance

```
Administrative Distance (AD) - предпочтение источника маршрута.
Используется, когда несколько протоколов знают маршрут в одну сеть.
Меньше = лучше.

Cisco IOS значения по умолчанию:
Connected interface    0
Static route           1
eBGP                  20
EIGRP (internal)      90
OSPF                 110
IS-IS                115
RIP                  120
EIGRP (external)     170
iBGP                 200
Unknown/Untrusted    255  (не используется для маршрутизации)
```

---

## Редистрибуция между протоколами

```
Перераспределение маршрутов между протоколами (Cisco):

! RIP -> OSPF
router ospf 1
  redistribute rip metric 20 metric-type 2 subnets

! OSPF -> BGP
router bgp 65001
  redistribute ospf 1 match internal external 1 external 2

! BGP -> OSPF
router ospf 1
  redistribute bgp 65001 metric 100 metric-type 2 subnets

! Статика -> OSPF
router ospf 1
  redistribute static subnets

Внимание: при двустороннем редистрибуции возможны петли!
Используй route-map и tag для контроля.
```

---

## Диагностика маршрутизации

```bash
# Общие команды (Linux)
ip route show                           # таблица маршрутов
ip route show table all                 # все таблицы маршрутов
ip route get 8.8.8.8                   # какой маршрут используется
traceroute 8.8.8.8                      # путь до цели
mtr 8.8.8.8                            # интерактивная трассировка

# Посмотреть BGP маршруты из интернета
# (используй BGP looking glass серверы)
# https://lg.he.net/
# https://bgpview.io/

# RPKI проверка
# https://rpki.cloudflare.com/

# Поиск AS и префиксов
whois -h whois.radb.net 8.8.8.8
curl https://api.bgpview.io/ip/8.8.8.8

# Tcpdump для BGP (порт 179)
tcpdump -i eth0 tcp port 179 -v

# FRR / Quagga (Linux)
vtysh
  show ip route                         # таблица маршрутов
  show ip ospf neighbor                 # OSPF соседи
  show ip bgp summary                   # BGP сводка
  show ip rip                           # RIP таблица

# Полезные утилиты
apt install -y frr bird2 quagga
```

---

## Шпаргалка

```
RIP
  Тип:        Distance Vector
  Метрика:    Хопы (max 15, 16 = inf)
  Обновления: каждые 30 сек (broadcast/multicast)
  Таймеры:    Update=30, Invalid=180, Flush=240
  Защита:     Split Horizon, Poison Reverse, Triggered Updates
  UDP порт:   520 (RIPv1/v2), 521 (RIPng)

OSPF
  Тип:        Link State (алгоритм Дейкстры)
  Метрика:    Cost = 100/bandwidth
  Обновления: только при изменениях (flood LSA)
  Hello:      10 сек (P2P/broadcast), 30 сек (NBMA)
  Dead:        40 сек (broadcast), 120 сек (NBMA)
  Multicast:  224.0.0.5 (all OSPF), 224.0.0.6 (DR/BDR)
  IP протокол: 89

BGP
  Тип:        Path Vector
  Метрика:    Набор атрибутов (AS_PATH, LOCAL_PREF, MED...)
  Транспорт:  TCP порт 179
  Keepalive:  60 сек (Hold time 180 сек)
  Best path:  Weight > LP > Origin > AS_PATH > Origin-type >
              MED > eBGP>iBGP > IGP metric > Router ID
  Защита:     RPKI, IRR, prefix filtering
```

---

## Ссылки

- [RFC 2453](https://www.rfc-editor.org/rfc/rfc2453) - RIPv2
- [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328) - OSPFv2
- [RFC 4271](https://www.rfc-editor.org/rfc/rfc4271) - BGP-4
- [RFC 8205](https://www.rfc-editor.org/rfc/rfc8205) - BGPsec
- [FRRouting Documentation](https://docs.frrouting.org/) - FRR для Linux
- [BGPView](https://bgpview.io/) - визуализация BGP топологии
- [Cloudflare RPKI](https://rpki.cloudflare.com/) - RPKI валидатор
- [BGP Looking Glass HE](https://lg.he.net/) - Hurricane Electric LG
