---
title: "VLAN, Trunk-порты, STP"
date: "2026-04-26"
---

VLAN (Virtual Local Area Network) - логическое разделение одной физической сети на несколько изолированных сегментов. Trunk-порты переносят трафик нескольких VLAN по одному кабелю. STP предотвращает петли в L2 сети. Вместе эти три технологии составляют основу любой корпоративной сети на коммутаторах.

---

## VLAN

### Зачем нужны VLAN

```
Проблема без VLAN:
  Все устройства в одном broadcast-домене.
  Broadcast от одного хоста получают все.
  Нет изоляции: бухгалтерия видит трафик разработчиков.
  Масштабирование: 500 устройств в одном сегменте = broadcast storm.

VLAN решает:
  - Изоляция трафика (бухгалтерия, разработка, гости - отдельно)
  - Уменьшение broadcast-домена (меньше шума, меньше ARP)
  - Безопасность (устройства в разных VLAN не видят друг друга без роутера)
  - Гибкость (перевести порт в другой VLAN = одна команда)
  - Экономия (один физический коммутатор = много логических сетей)

Без VLAN:               С VLAN:
┌─────────────────┐     ┌──────┐  ┌──────┐  ┌──────┐
│ все в одной сети│     │VLAN10│  │VLAN20│  │VLAN30│
│ broadcast везде │     │бухг. │  │разраб│  │гости │
└─────────────────┘     └──────┘  └──────┘  └──────┘
                         изолированы друг от друга
```

### Как работает VLAN (802.1Q)

```
Стандарт: IEEE 802.1Q (1998, обновлён в 2022).

Принцип: каждый кадр Ethernet маркируется тегом VLAN ID.
Коммутатор смотрит на тег и отправляет кадр только в нужный VLAN.

Тег 802.1Q (4 байта, вставляется в Ethernet кадр):
┌──────────────────┬─────┬─────┬──────────────────────┐
│  TPID (2 байта)  │ PCP │ DEI │    VID (12 бит)       │
│     0x8100       │(3б) │(1б) │      0 - 4095         │
└──────────────────┴─────┴─────┴──────────────────────┘

TPID: 0x8100 - идентификатор VLAN тега (всегда это значение)
PCP:  Priority Code Point (0-7) - приоритет QoS (CoS)
DEI:  Drop Eligible Indicator - можно ли дропнуть при перегрузке
VID:  VLAN ID (0-4095)
        0    - зарезервирован
        1    - default VLAN (обычно управляющий)
        2-4094 - пользовательские
        4095 - зарезервирован
      Итого: 4094 возможных VLAN

Кадр без тега (untagged):
┌────────┬────────┬──────────┬──────────┬──────┐
│Dst MAC │Src MAC │EtherType │ Payload  │ FCS  │
└────────┴────────┴──────────┴──────────┴──────┘

Кадр с тегом (tagged, 802.1Q):
┌────────┬────────┬────────┬──────────┬──────────┬──────┐
│Dst MAC │Src MAC │ 0x8100 │VLAN Tag  │ Payload  │ FCS  │
└────────┴────────┴────────┴──────────┴──────────┴──────┘
                    ↑ тег вставляется здесь
```

### Типы портов коммутатора

```
ACCESS порт:
  - Принадлежит одному VLAN.
  - Принимает untagged кадры от устройства.
  - Добавляет тег (VLAN ID) при отправке на другие порты.
  - Снимает тег при отправке устройству.
  - Устройство (ПК, принтер) не знает о VLAN.

  Подключают: рабочие станции, серверы, принтеры, IP-телефоны (data VLAN).

TRUNK порт:
  - Переносит кадры нескольких VLAN.
  - Кадры проходят с тегом 802.1Q.
  - Один исключительный VLAN - native VLAN (кадры идут без тега).
  - Подробно разобран в следующем разделе.

  Подключают: другие коммутаторы, маршрутизаторы (router-on-a-stick), серверы с несколькими VLAN.

HYBRID порт (не в Cisco, но в других вендорах):
  - Может принимать как tagged так и untagged кадры.
  - Используется на IP-телефонах (voice VLAN tagged, data VLAN untagged).

Схема:
  ПК ──────── access (VLAN 10) ──┐
  ПК ──────── access (VLAN 10) ──┤ SWITCH ──── trunk ──── другой коммутатор
  ПК ──────── access (VLAN 20) ──┤
  Принтер ─── access (VLAN 20) ──┘
```

### Настройка VLAN на Cisco

```
# Создать VLAN
vlan 10
  name Buhgalteriya
vlan 20
  name Razrabotka
vlan 30
  name Gosti

# Проверить
show vlan brief
# VLAN Name                             Status    Ports
# ---- -------------------------------- --------- ----------------------------
#    1 default                          active    Gi0/0, Gi0/3
#   10 Buhgalteriya                     active    Gi0/1
#   20 Razrabotka                       active    Gi0/2
#   30 Gosti                            active

# Настроить access порт
interface GigabitEthernet0/1
  switchport mode access
  switchport access vlan 10
  description PC-Buhgalteriya

# Несколько access портов сразу
interface range GigabitEthernet0/1 - 5
  switchport mode access
  switchport access vlan 10

# Проверить порт
show interfaces GigabitEthernet0/1 switchport
# Name: Gi0/1
# Administrative Mode: static access
# Operational Mode: static access
# Access Mode VLAN: 10 (Buhgalteriya)

# Удалить VLAN (осторожно - порты останутся без VLAN и потеряют связь)
no vlan 30
```

### Настройка VLAN на Linux

```
# Создать VLAN интерфейс (subinterface)
# eth0.10 = интерфейс eth0 для VLAN 10

# Способ 1: через ip (временно)
ip link add link eth0 name eth0.10 type vlan id 10
ip link set eth0.10 up
ip addr add 192.168.10.1/24 dev eth0.10

# Удалить
ip link del eth0.10

# Способ 2: через /etc/network/interfaces (Debian/Ubuntu, постоянно)
# Установить: apt install vlan
# Добавить в /etc/network/interfaces:
# auto eth0.10
# iface eth0.10 inet static
#   address 192.168.10.1
#   netmask 255.255.255.0
#   vlan-raw-device eth0

# Способ 3: через NetworkManager
nmcli connection add type vlan con-name eth0.10 dev eth0 id 10
nmcli connection modify eth0.10 ipv4.addresses 192.168.10.1/24
nmcli connection up eth0.10

# Посмотреть VLAN интерфейсы
cat /proc/net/vlan/config
# VLAN Dev name    | VLAN ID
# eth0.10          | 10  | eth0
# eth0.20          | 20  | eth0

ip -d link show eth0.10
# ... vlan protocol 802.1Q id 10 ...
```

### Voice VLAN (IP-телефоны)

```
IP-телефон обычно имеет встроенный мини-коммутатор:
  ПК ──── телефон ──── порт коммутатора

Порт настраивается одновременно для двух VLAN:
  Data VLAN  (access, untagged) - трафик ПК
  Voice VLAN (tagged) - трафик телефона

Cisco:
  interface GigabitEthernet0/1
    switchport mode access
    switchport access vlan 10         (data VLAN для ПК)
    switchport voice vlan 50          (voice VLAN для телефона)
    spanning-tree portfast            (быстрый старт)

  Проверить:
    show interfaces GigabitEthernet0/1 switchport
    # Voice VLAN: 50 (VoIP)
```

---

## Trunk-порты

### Что такое trunk

```
Trunk - порт коммутатора, по которому проходит трафик нескольких VLAN.
Кадры маркированы тегом 802.1Q с нужным VLAN ID.

Зачем:
  Два коммутатора, VLAN 10 и 20 на каждом.
  Без trunk: нужно 2 кабеля (по одному на каждый VLAN).
  С trunk: один кабель несёт оба VLAN.

  SW1 ──[VLAN10]──── SW2     без trunk: 2 кабеля
  SW1 ──[VLAN20]──── SW2

  SW1 ══[TRUNK]═════ SW2     с trunk: 1 кабель, оба VLAN
```

### Native VLAN

```
Native VLAN - единственный VLAN, кадры которого идут по trunk БЕЗ тега.

Зачем:
  Совместимость со старыми устройствами, не поддерживающими 802.1Q.
  Некоторые протоколы (CDP, PAgP) отправляют кадры без тега.

По умолчанию: VLAN 1.

Важные правила:
  Native VLAN должен совпадать на обоих концах trunk.
  Несовпадение → CDP предупреждение, трафик native VLAN может потеряться.

Безопасность (VLAN Hopping через native VLAN):
  Атака double-tagging:
    Атакующий в native VLAN отправляет кадр с двойным тегом:
    Внешний тег = native VLAN (снимается коммутатором)
    Внутренний тег = целевой VLAN
    Второй коммутатор видит внутренний тег и форвардит в целевой VLAN!

  Защита:
    1. Изменить native VLAN на неиспользуемый (например, VLAN 999)
    2. Явно запретить native VLAN на trunk портах:
       switchport trunk native vlan 999
       vlan 999
         name UNUSED_NATIVE
    3. Использовать "no negotiate" и явно задавать trunk
```

### Настройка trunk на Cisco

```
# Настроить trunk порт
interface GigabitEthernet0/0
  switchport trunk encapsulation dot1q    (на старых IOS, на новых не нужно)
  switchport mode trunk
  switchport trunk native vlan 999        (изменить native VLAN)
  switchport trunk allowed vlan 10,20,30  (разрешить только нужные VLAN)
  description TRUNK-to-SW2

# Добавить VLAN к trunk
switchport trunk allowed vlan add 40

# Удалить VLAN из trunk
switchport trunk allowed vlan remove 30

# Разрешить все VLAN
switchport trunk allowed vlan all

# Проверить trunk
show interfaces GigabitEthernet0/0 trunk
# Port        Mode             Encapsulation  Status        Native vlan
# Gi0/0       on               802.1q         trunking      999
#
# Port        Vlans allowed on trunk
# Gi0/0       10,20,30
#
# Port        Vlans allowed and active in management domain
# Gi0/0       10,20,30
#
# Port        Vlans in spanning tree forwarding state and not pruned
# Gi0/0       10,20,30

show interfaces trunk         (все trunk порты)
show interfaces status        (обзор всех портов)
```

### DTP - Dynamic Trunking Protocol

```
DTP - проприетарный протокол Cisco для автоматического согласования trunk.
Коммутаторы договариваются между собой - быть порту access или trunk.

Режимы DTP:
  dynamic auto    - пассивно ждёт, станет trunk если сосед active/desirable
  dynamic desirable - активно предлагает trunk, станет trunk если сосед auto/desirable
  trunk           - всегда trunk, шлёт DTP (согласование)
  access          - всегда access, шлёт DTP
  nonegotiate     - trunk без DTP (не шлёт DTP пакеты)

Рекомендуется:
  Явно задавать режим (trunk или access), DTP отключать.
  DTP - потенциальный вектор атаки (VLAN hopping через DTP negotiation).

  interface GigabitEthernet0/0
    switchport mode trunk
    switchport nonegotiate       (отключить DTP)

  interface GigabitEthernet0/1
    switchport mode access
    switchport nonegotiate

show dtp interface Gi0/0         (статус DTP)
show interfaces Gi0/0 switchport (режим и статус)
```

### Router-on-a-Stick (ROAS)

```
Маршрутизация между VLAN через один физический интерфейс маршрутизатора.
Маршрутизатор подключён к trunk-порту коммутатора.
На маршрутизаторе - subinterface для каждого VLAN.

Схема:
  VLAN10 ─┐
  VLAN20 ─┤── SW1 ══[trunk]══ R1 (subinterfaces)
  VLAN30 ─┘

Cisco router:
  interface GigabitEthernet0/0
    no shutdown
    no ip address           (родительский интерфейс без IP)

  interface GigabitEthernet0/0.10
    encapsulation dot1q 10
    ip address 192.168.10.1 255.255.255.0
    description Gateway-VLAN10

  interface GigabitEthernet0/0.20
    encapsulation dot1q 20
    ip address 192.168.20.1 255.255.255.0
    description Gateway-VLAN20

  interface GigabitEthernet0/0.30
    encapsulation dot1q 30
    ip address 192.168.30.1 255.255.255.0
    description Gateway-VLAN30

  interface GigabitEthernet0/0.999
    encapsulation dot1q 999 native   (native VLAN без тега)

Минус ROAS: единственный физический линк = единственная точка отказа.
Плюс: дёшево (один порт).

Современная альтернатива: Layer 3 switch (SVI - Switched Virtual Interface).

Layer 3 switch (SVI):
  vlan 10
  interface Vlan10
    ip address 192.168.10.1 255.255.255.0
    no shutdown
  vlan 20
  interface Vlan20
    ip address 192.168.20.1 255.255.255.0
    no shutdown

  ip routing    (включить маршрутизацию на коммутаторе!)
```

### VTP - VLAN Trunking Protocol

```
VTP - проприетарный протокол Cisco для синхронизации VLAN между коммутаторами.
Создал VLAN на одном коммутаторе → он автоматически появился на всех.

Режимы VTP:
  Server  - создаёт/изменяет/удаляет VLAN, рассылает обновления
  Client  - получает обновления, не может менять VLAN локально
  Transparent - не участвует в VTP, но пересылает VTP сообщения
  Off     - полностью отключён (VTPv3)

Опасность VTP:
  Подключил новый коммутатор с более высоким VTP revision number →
  он затёр всю базу VLAN на всех коммутаторах!
  Классическая авария: новый коммутатор из коробки уничтожает всю сеть.

  Защита:
    Перед подключением нового коммутатора: сбросить VTP на Transparent или Off.
    Использовать VTPv3 (более безопасный).
    Или вообще не использовать VTP.

show vtp status           (статус и revision number)
show vtp counters         (статистика VTP)
```

---

## STP - Spanning Tree Protocol

### Проблема L2 петель

```
Зачем нужна избыточность:
  В сети нужны резервные линки (если один упал - другой работает).
  Но два пути между двумя коммутаторами = петля (loop).

Что происходит при петле:
  1. Broadcast Storm:
     ПК отправляет ARP broadcast.
     SW1 флудит на все порты, включая линк к SW2.
     SW2 получает, флудит обратно на SW1.
     SW1 получает снова, флудит снова...
     Трафик удваивается каждый раз → сеть падает за секунды.

  2. MAC Flapping (нестабильность CAM-таблицы):
     Коммутатор видит один и тот же MAC с разных портов.
     CAM-таблица постоянно обновляется → пересылка нестабильна.

  3. Дублирование unicast кадров:
     Получатель получает один кадр дважды → проблемы L4.

STP решает: автоматически блокирует лишние порты, разрывая петли.
```

### Как работает STP (802.1D)

```
Алгоритм STP:

Шаг 1 - Выбор Root Bridge:
  Все коммутаторы обмениваются BPDU (Bridge Protocol Data Units).
  Побеждает коммутатор с наименьшим Bridge ID.
  Bridge ID = Priority (2Б) + MAC-адрес (6Б).
  Priority по умолчанию: 32768.
  Root Bridge = центр "дерева" без петель.

Шаг 2 - Выбор Root Port (RP):
  На каждом НЕ-root коммутаторе выбирается один порт
  с наименьшей стоимостью пути до Root Bridge.
  Root Port - порт "смотрящий" в сторону Root Bridge.

Шаг 3 - Выбор Designated Port (DP):
  На каждом сегменте (линке) выбирается один Designated Port.
  DP - порт с наименьшей стоимостью пути до Root Bridge в данном сегменте.
  Root Bridge имеет все порты Designated.

Шаг 4 - Блокировка лишних портов:
  Порт не Root и не Designated → Blocked (BLK).
  Заблокированный порт не пересылает трафик (только слушает BPDU).

Состояния порта STP:
  Blocking    - не пересылает кадры, слушает BPDU (20 сек)
  Listening   - не пересылает, участвует в выборе (15 сек)
  Learning    - не пересылает, учит MAC-адреса (15 сек)
  Forwarding  - нормальная работа, пересылает кадры
  Disabled    - административно выключен

Итого конвергенция STP: ~30-50 секунд (это очень долго!)
```

### Стоимость пути STP (Path Cost)

```
Стоимость порта зависит от скорости линка.
Меньше стоимость = лучший путь.

Скорость        Short cost (802.1D)   Long cost (802.1t)
─────────────────────────────────────────────────────────
10 Mbps              100                  2,000,000
100 Mbps              19                    200,000
1 Gbps                 4                     20,000
10 Gbps                2                      2,000
100 Gbps               1                        200

По умолчанию: short cost (802.1D).
Для 10G и выше рекомендуется long cost (802.1t), иначе все линки = 1.

Настроить стоимость:
  interface GigabitEthernet0/1
    spanning-tree cost 10          (изменить стоимость)
    spanning-tree port-priority 64 (изменить приоритет порта, default=128)
```

### Выбор Root Bridge

```
Bridge ID = Priority + MAC

Кто Root Bridge:
  Наименьший Bridge ID → Root Bridge.
  При равных Priority → наименьший MAC (меньший = лучший).

Изменить Priority чтобы стать Root:
  spanning-tree vlan 10 priority 4096     (явно задать)
  spanning-tree vlan 10 root primary      (автоматически выбрать оптимальный)
  spanning-tree vlan 20 root secondary    (запасной Root)

Priority должно быть кратно 4096:
  0, 4096, 8192, 12288, 16384, 20480, 24576, 28672,
  32768 (default), 36864, 40960, 45056, 49152, 53248, 57344, 61440

Проверить:
  show spanning-tree vlan 10
  # Root ID   Priority    4096
  #           Address     0011.2233.4455
  #           This bridge is the root   ← мы root!
  #           Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec
  #
  # Bridge ID Priority    32768
  #           Address     aabb.ccdd.eeff
  #
  # Interface           Role Sts Cost      Prio.Nbr Type
  # ────────────────────────────────────────────────────
  # Gi0/0               Desg FWD 4         128.1    P2p
  # Gi0/1               Root FWD 4         128.2    P2p
  # Gi0/2               Altn BLK 4         128.3    P2p  ← заблокирован
```

### RSTP - Rapid Spanning Tree (802.1W)

```
Проблема STP: конвергенция 30-50 секунд. При падении линка - 50 сек простоя!

RSTP (802.1W, 2001) - значительно быстрее (< 1-3 секунды).

Изменения в RSTP:

1. Роли портов:
   Root Port (RP)       - лучший путь к Root Bridge (как в STP)
   Designated Port (DP) - лучший порт в сегменте (как в STP)
   Alternate Port (AP)  - запасной путь к Root (был Blocked в STP)
   Backup Port (BP)     - запасной для Designated (в одном сегменте)
   Disabled             - выключен

2. Состояния портов (упрощены):
   Discarding  (= Blocking + Listening из STP)
   Learning
   Forwarding

3. Rapid Transition:
   Edge порты (подключены к конечным устройствам) сразу Forwarding.
   P2P линки (full duplex) быстро переходят без ожидания таймеров.
   Используется Proposal/Agreement механизм вместо таймеров.

4. Topology Change Notification:
   RSTP сам флудит TCN по всем портам (не ждёт Root Bridge).

Настройка (Cisco по умолчанию использует PVST+/Rapid PVST+):
  spanning-tree mode rapid-pvst        (включить Rapid PVST+)
  spanning-tree mode pvst              (старый STP)
  spanning-tree mode mst               (MSTP)

  show spanning-tree summary
  # Switch is in rapid-pvst mode
```

### PVST+ и MST

```
STP работает per-VLAN или для всех VLAN сразу - зависит от реализации:

STP (802.1D):
  Один экземпляр STP для всех VLAN.
  Все VLAN используют одно дерево.
  Минус: нет балансировки нагрузки между линками.

PVST+ (Cisco, Per-VLAN Spanning Tree):
  Отдельный экземпляр STP для каждого VLAN.
  VLAN10 может иметь Root на SW1, VLAN20 - на SW2.
  Позволяет балансировать нагрузку.
  Минус: много VLAN = много экземпляров STP = нагрузка на CPU.

Rapid PVST+:
  PVST+ + RSTP = быстрая конвергенция + per-VLAN.
  Cisco default.

MST - Multiple Spanning Tree (802.1S):
  Несколько VLAN маппятся на один экземпляр STP.
  VLAN 10,20,30 → Instance 1
  VLAN 40,50    → Instance 2
  Меньше экземпляров → меньше нагрузки.
  Сложнее в настройке.

Настройка MST:
  spanning-tree mode mst
  spanning-tree mst configuration
    name MY-MST-REGION
    revision 1
    instance 1 vlan 10,20,30
    instance 2 vlan 40,50
  spanning-tree mst 1 priority 4096    (Root для instance 1)
```

### PortFast и BPDU Guard

```
PortFast:
  Порт, подключённый к конечному устройству (ПК, сервер),
  не должен ждать 30-50 сек STP конвергенции.
  PortFast переводит порт сразу в Forwarding, минуя Listening/Learning.

  Использовать ТОЛЬКО на access портах (не на trunk, не к коммутаторам!).
  Если PortFast порт получает BPDU → значит подключили коммутатор → опасность петли.

  Настройка:
    interface GigabitEthernet0/1
      spanning-tree portfast        (на конкретном порту)

    spanning-tree portfast default  (на всех access портах глобально)

BPDU Guard:
  Защита для PortFast портов.
  Если PortFast порт получает BPDU → порт переходит в err-disabled.
  Предотвращает подключение неавторизованных коммутаторов.

  Настройка:
    interface GigabitEthernet0/1
      spanning-tree portfast
      spanning-tree bpduguard enable

    spanning-tree portfast bpduguard default  (глобально для всех PortFast)

  Восстановить err-disabled порт:
    interface GigabitEthernet0/1
      shutdown
      no shutdown

  Или автоматически через errdisable recovery:
    errdisable recovery cause bpduguard
    errdisable recovery interval 300   (секунды)

BPDU Filter:
  Запрещает отправку и приём BPDU на порту.
  Использовать осторожно! Может создать петли если подключить коммутатор.
  Применяется там где BPDU Guard слишком агрессивен.

    spanning-tree bpdufilter enable   (на порту)
```

### Root Guard и Loop Guard

```
Root Guard:
  Защищает позицию Root Bridge.
  Если порт с Root Guard получает Superior BPDU (лучший Bridge ID),
  порт переходит в root-inconsistent (блокируется).
  Предотвращает захват роли Root Bridge чужим устройством.

  Применять: на портах в сторону клиентских устройств и downlink портах.
  НЕ применять: на портах в сторону Root Bridge.

  interface GigabitEthernet0/1
    spanning-tree guard root

  Проверить:
    show spanning-tree inconsistentports

Loop Guard:
  Защита от однонаправленных отказов линков (unidirectional link failure).
  Если порт перестал получать BPDU но линк физически активен →
  без Loop Guard порт перейдёт в Forwarding (думает что нет петли).
  С Loop Guard → порт переходит в loop-inconsistent (блокируется).

  interface GigabitEthernet0/1
    spanning-tree guard loop

  Глобально:
    spanning-tree loopguard default

UDLD - UniDirectional Link Detection:
  Обнаружение однонаправленных отказов на физическом уровне.
  Дополняет Loop Guard.

  udld enable              (глобально)
  udld aggressive          (агрессивный режим - блокирует порт)
  interface GigabitEthernet0/1
    udld port aggressive
```

---

## Диагностика и типичные проблемы

### Проблема: нет связи между устройствами в одном VLAN

```
Шаг 1: Убедиться что VLAN существует
  show vlan brief
  # Если VLAN нет в списке - создать: vlan 10

Шаг 2: Проверить access порт
  show interfaces GigabitEthernet0/1 switchport
  # Administrative Mode: static access
  # Access Mode VLAN: 10
  # Убедиться что VLAN правильный

Шаг 3: Проверить trunk между коммутаторами
  show interfaces trunk
  # Убедиться что VLAN 10 есть в "allowed and active"
  # Если нет: switchport trunk allowed vlan add 10

Шаг 4: STP не блокирует ли порт?
  show spanning-tree vlan 10
  # Посмотреть статус порта: FWD (forwarding) или BLK (blocked)?
  # Если BLK - это нормально если это redundant путь.
  # Если BLK на единственном пути - проблема топологии STP.

Шаг 5: Захват трафика
  tcpdump -i eth0.10 -n   (на сервере с VLAN интерфейсом)
```

### Проблема: петля в сети (broadcast storm)

```
Симптомы:
  - Все интерфейсы коммутатора мигают одновременно
  - CPU коммутатора 100%
  - Сеть полностью недоступна
  - show interfaces: input errors, runts резко возросли

Быстрое решение:
  1. Физически отключать кабели по одному пока сеть не восстановится.
  2. Или отключить порты командой:
     interface GigabitEthernet0/2
       shutdown

Диагностика:
  show spanning-tree vlan 1           (проверить топологию)
  show mac address-table              (стабильна ли таблица?)
  show interfaces | include input rate (высокий входящий трафик?)
  show log | include STP              (изменения STP)

Причины:
  - Кто-то подключил кабель создав петлю
  - PortFast на trunk/uplink порту (BPDU не блокирует петлю)
  - STP отключён вручную
  - Неправильная топология

Профилактика:
  - BPDU Guard на всех access портах
  - Root Guard на downlink портах
  - Loop Guard на uplink портах
  - Мониторинг (SNMP трапы на STP topology change)
```

### Проблема: медленная конвергенция STP

```
Симптом: после отключения линка - 30-50 сек нет связи.

Решение:
  1. Включить Rapid PVST+:
     spanning-tree mode rapid-pvst

  2. PortFast на access портах:
     spanning-tree portfast default

  3. Убедиться что P2P линки работают в full-duplex:
     show interfaces GigabitEthernet0/0
     # Full-duplex, 1000Mb/s → RSTP использует Proposal/Agreement

  4. Правильно выбрать Root Bridge (не случайный коммутатор):
     spanning-tree vlan 10 root primary
```

### Проблема: неправильный Root Bridge

```
Симптом: трафик идёт неоптимальным путём, Root Bridge - случайный коммутатор.

Диагностика:
  show spanning-tree vlan 10 | include Root
  # Root ID   Priority    32768
  #           Address     aabb.ccdd.eeff   ← чей это MAC?
  #
  # Если "This bridge is the root" и это неправильный коммутатор →
  # у кого-то слишком низкий Priority или маленький MAC.

Решение:
  На правильном коммутаторе (например ядро сети):
    spanning-tree vlan 10 priority 4096       (или)
    spanning-tree vlan 10 root primary

  На всех остальных (чтобы не смогли стать Root случайно):
    Нужный коммутатор имеет priority 4096, остальные - 32768 (default).
    Дополнительно: Root Guard на портах в сторону "ненадёжных" устройств.
```

### Проблема: VLAN не проходит через trunk

```
Диагностика:
  show interfaces trunk
  # Port   Vlans allowed on trunk: 1-4094    (или конкретный список)
  # Port   Vlans allowed and active in management domain: 10,20
  # Port   Vlans in spanning tree forwarding state and not pruned: 10,20

  Если VLAN есть в "allowed" но нет в "active":
    → VLAN не создан командой "vlan XX"
    → Добавить: vlan 20

  Если VLAN не в "allowed":
    → switchport trunk allowed vlan add 20

  Если VLAN в "forwarding" но нет связи:
    → Проверить native VLAN на обоих концах (должен совпадать)
    → show cdp neighbors detail | include Native
```

---

## Шпаргалка

```
VLAN:
  Логическая изоляция в L2 сети.
  VLAN ID: 1-4094 (12 бит).
  Тег 802.1Q: 4 байта (TPID=0x8100, PCP, DEI, VID).
  Access порт: один VLAN, кадры без тега для устройства.
  Trunk порт: несколько VLAN, кадры с тегом.
  Native VLAN: единственный VLAN без тега на trunk (default=VLAN1, лучше изменить).

Команды VLAN (Cisco):
  vlan 10 → name NAME              создать VLAN
  show vlan brief                  список VLAN
  switchport mode access           access порт
  switchport access vlan 10        назначить VLAN
  switchport mode trunk            trunk порт
  switchport trunk allowed vlan 10,20   разрешённые VLAN
  switchport trunk native vlan 999      native VLAN

STP/RSTP:
  Цель: предотвратить L2 петли, блокировать лишние порты.
  Root Bridge: наименьший Bridge ID (Priority + MAC).
  Root Port: лучший путь к Root Bridge.
  Designated Port: лучший порт в сегменте.
  Blocked/Alternate: заблокированный резервный порт.

  STP (802.1D): конвергенция 30-50 сек.
  RSTP (802.1W): конвергенция < 3 сек.
  PVST+: per-VLAN STP (Cisco).
  Rapid PVST+: RSTP + per-VLAN (Cisco default).

Команды STP (Cisco):
  spanning-tree mode rapid-pvst             включить Rapid PVST+
  spanning-tree vlan 10 root primary        стать Root для VLAN 10
  spanning-tree vlan 10 priority 4096       задать приоритет
  show spanning-tree vlan 10                топология для VLAN
  spanning-tree portfast                    мгновенный старт access порта
  spanning-tree bpduguard enable            защита от чужих коммутаторов
  spanning-tree guard root                  защита позиции Root Bridge

Диагностика:
  show vlan brief                  список VLAN и портов
  show interfaces trunk            trunk порты и VLAN
  show spanning-tree vlan 10       STP топология
  show spanning-tree summary       общий статус STP
  show interfaces Gi0/1 switchport конфигурация порта
  show log | include STP           события STP
```

---

## Ссылки

- [IEEE 802.1Q](https://standards.ieee.org/ieee/802.1Q) - VLAN стандарт
- [IEEE 802.1D](https://standards.ieee.org/ieee/802.1D) - STP (Spanning Tree Protocol)
- [IEEE 802.1W](https://standards.ieee.org/ieee/802.1W) - RSTP (Rapid STP)
- [IEEE 802.1S](https://standards.ieee.org/ieee/802.1S) - MST (Multiple Spanning Tree)
- [RFC 5517](https://www.rfc-editor.org/rfc/rfc5517) - Cisco Systems' Private VLANs
- [Cisco STP Best Practices](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/28943-170.html)
