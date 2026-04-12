---
title: "TCP - handshake, флаги, состояния, seq/ack"
date: "2026-04-12"
---

TCP (Transmission Control Protocol) - транспортный протокол, обеспечивающий надёжную, упорядоченную и с контролем ошибок доставку данных между приложениями. Определён в RFC 793 (1981) и уточнён в RFC 9293 (2022).

---

## Базовые свойства TCP

```
TCP гарантирует:
Доставку данных (повторная передача при потере)
Порядок байтов (reassembly на стороне получателя)
Контроль ошибок (контрольная сумма)
Управление потоком (flow control, sliding window)
Управление перегрузкой (congestion control)
Дуплексная передача (данные идут в обе стороны)

TCP НЕ гарантирует:
Скорость доставки
Задержку
Сохранение границ сообщений (TCP — поток байтов, не сообщений)
```

---

## Заголовок TCP

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌──────────────────────────────┬──────────────────────────────┐
│         Source Port          │       Destination Port       │
│           16 бит             │          16 бит              │
├─────────────────────────────────────────────────────────────┤
│                      Sequence Number                        │
│                           32 бита                           │
├─────────────────────────────────────────────────────────────┤
│                   Acknowledgment Number                     │
│                           32 бита                           │
├──────┬──────────┬─────────────────────────────────────────┤
│ Data │          │ C  E  U  A  P  R  S  F                  │
│Offset│ Reserved │ W  C  R  C  S  S  Y  I                  │
│ 4 б  │  4 бита  │ R  E  G  K  H  T  N  N                  │
│      │          │                  Flags                   │
├──────┴──────────┴──────────────────────────────────────────┤
│           Window Size          │          Checksum          │
│            16 бит              │           16 бит           │
├────────────────────────────────┴───────────────────────────┤
│          Urgent Pointer        │          Options           │
│            16 бит              │   (переменная длина)       │
└────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
                    Данные (Payload)
```

### Поля заголовка

| Поле | Размер | Описание |
|------|--------|----------|
| Source Port | 16 бит | Порт отправителя (0–65535) |
| Destination Port | 16 бит | Порт получателя (0–65535) |
| Sequence Number | 32 бита | Номер первого байта данных в этом сегменте |
| Acknowledgment Number | 32 бита | Следующий ожидаемый байт от партнёра |
| Data Offset | 4 бита | Длина заголовка в 32-битных словах (мин. 5 = 20 байт) |
| Flags | 9 бит | Управляющие биты (CWR, ECE, URG, ACK, PSH, RST, SYN, FIN) |
| Window Size | 16 бит | Размер окна приёма (байт, которые можно принять без ACK) |
| Checksum | 16 бит | Контрольная сумма заголовка + данных |
| Urgent Pointer | 16 бит | Смещение срочных данных (если URG=1) |
| Options | 0–40 байт | MSS, Window Scale, SACK, Timestamp и др. |

---

## TCP флаги

TCP использует 9 управляющих флагов (битов) в заголовке:

```
Бит:  8   7   6   5   4   3   2   1   0
Флаг: NS  CWR ECE URG ACK PSH RST SYN FIN
```

### Описание каждого флага

| Флаг | Полное имя | Описание |
|------|-----------|----------|
| **SYN** | Synchronize | Инициирование соединения. Синхронизирует Sequence Numbers. |
| **ACK** | Acknowledge | Подтверждение получения данных. ACK Number валиден. |
| **FIN** | Finish | Завершение соединения с одной стороны. Graceful close. |
| **RST** | Reset | Аварийный сброс соединения. Немедленное закрытие. |
| **PSH** | Push | Немедленно передать данные приложению, не буферизовать. |
| **URG** | Urgent | Данные содержат срочную информацию. Urgent Pointer валиден. |
| **ECE** | ECN-Echo | Уведомление об обнаружении перегрузки (RFC 3168). |
| **CWR** | Congestion Window Reduced | Отправитель уменьшил окно перегрузки. |
| **NS** | Nonce Sum | Защита от случайного скрытия флагов (RFC 3540). |

### Типичные комбинации флагов

```
[S]       SYN только           - первый пакет соединения
[S.] или [SA]  SYN+ACK         - ответ сервера на SYN
[.]       ACK только           - подтверждение (точка = ACK в tcpdump)
[P.]      PSH+ACK              - данные + подтверждение
[F.]      FIN+ACK              - завершение + подтверждение
[R.]      RST+ACK              - аварийный сброс
[R]       RST                  - сброс без ACK
[FP.]     FIN+PSH+ACK          - последние данные + завершение
```

```bash
# tcpdump показывает флаги в квадратных скобках
# [S]   = SYN
# [S.]  = SYN+ACK  (. означает ACK)
# [.]   = ACK
# [P.]  = PSH+ACK
# [F.]  = FIN+ACK
# [R.]  = RST+ACK
# [R]   = RST

tcpdump -i eth0 -n 'tcp[13] & 2 != 0'    # SYN пакеты   (бит 1)
tcpdump -i eth0 -n 'tcp[13] & 1 != 0'    # FIN пакеты   (бит 0)
tcpdump -i eth0 -n 'tcp[13] & 4 != 0'    # RST пакеты   (бит 2)
tcpdump -i eth0 -n 'tcp[13] = 0x12'      # SYN-ACK (0x12 = 0001 0010)
tcpdump -i eth0 -n 'tcp[13] = 0x18'      # PSH+ACK (0x18 = 0001 1000)
```

---

## Sequence Numbers и Acknowledgment Numbers

### Логика seq/ack

```
Sequence Number (seq) - номер первого байта данных в текущем сегменте.
Acknowledgment Number (ack) - следующий байт, который ОЖИДАЕТ получатель.

Смысл: "Я получил все байты до ack-1. Пришли мне байт ack."
```

### ISN - Initial Sequence Number

```
При установке соединения ISN выбирается СЛУЧАЙНО (не с 0 или 1).
Почему? Безопасность + избежание конфликтов со старыми соединениями.

RFC 793: ISN должен увеличиваться ~32000 раз в секунду
Linux: ISN генерируется с помощью криптографического PRNG
```

### Пример передачи данных

```
Клиент (ISN=1000)                        Сервер (ISN=5000)

SYN:      seq=1000, len=0
──────────────────────────────────────────►
                                           SYN-ACK: seq=5000, ack=1001, len=0
◄──────────────────────────────────────────
ACK:      seq=1001, ack=5001, len=0
──────────────────────────────────────────►

Клиент отправляет 300 байт данных:
DATA:     seq=1001, ack=5001, len=300, flags=PSH+ACK
──────────────────────────────────────────►

                                           ACK: seq=5001, ack=1301, len=0
◄──────────────────────────────────────────
         (сервер подтвердил 300 байт: ack = 1001 + 300 = 1301)

Сервер отправляет 500 байт ответа:
                                           DATA: seq=5001, ack=1301, len=500
◄──────────────────────────────────────────

ACK:      seq=1301, ack=5501, len=0
──────────────────────────────────────────►
         (клиент подтвердил 500 байт: ack = 5001 + 500 = 5501)
```

### Правило для SYN и FIN

```
SYN и FIN потребляют по ОДНОМУ байту в пространстве Sequence Numbers,
хотя они не несут данных.

SYN занимает seq=ISN, следующий байт = ISN+1
FIN занимает seq=N,   следующий байт = N+1

Поэтому:
  После SYN с seq=1000 → ACK должен быть ack=1001
  После FIN с seq=2000 → ACK должен быть ack=2001
```

---

## Three-Way Handshake (установка соединения)

### Полная схема

```
Клиент                                              Сервер
CLOSED                                              LISTEN
  │                                                    │
  │  ① SYN                                            │
  │  seq=ISNc (случайный, напр. 3274880045)           │
  │  flags=[SYN]                                      │
  │  win=65535, MSS=1460, SACK, wscale=7              │
  │──────────────────────────────────────────────────►│
  │                                                    │
SYN_SENT                                          SYN_RECEIVED
  │                                                    │
  │                       ② SYN-ACK                   │
  │                       seq=ISNs (напр. 1892347562)  │
  │                       ack=ISNc+1 (3274880046)      │
  │                       flags=[SYN,ACK]              │
  │                       win=65535, MSS=1460           │
  │◄──────────────────────────────────────────────────│
  │                                                    │
  │  ③ ACK                                            │
  │  seq=ISNc+1 (3274880046)                          │
  │  ack=ISNs+1 (1892347563)                          │
  │  flags=[ACK]                                      │
  │──────────────────────────────────────────────────►│
  │                                                    │
ESTABLISHED                                      ESTABLISHED
  │◄══════════════ Обмен данными ═════════════════════►│
```

### Почему три пакета, а не два?

```
Двух недостаточно, потому что нужно синхронизировать
Sequence Numbers в ОБОИХ направлениях:

① SYN    - клиент сообщает свой ISN → сервер его подтверждает в ②
② SYN-ACK - сервер сообщает свой ISN → клиент подтверждает в ③

Без ③ сервер не знает, что клиент получил его ISN.
```

### Параметры, согласуемые при handshake

```
MSS (Maximum Segment Size) - максимальный размер данных в сегменте.
  Обычно MTU - 40 байт = 1500 - 40 = 1460 байт для Ethernet.
  Каждая сторона сообщает свой MSS в SYN/SYN-ACK.
  Итоговый MSS = min(MSS клиента, MSS сервера).

Window Scale - масштабирование окна (до 14 сдвигов).
  Позволяет окну быть до 1 ГБ (65535 × 2^14).
  Важно для высоколатентных каналов (спутник, межконтинентальные WAN).

SACK (Selective Acknowledgment) - выборочные подтверждения.
  Позволяет подтверждать диапазоны байт, не только следующий ожидаемый.
  Ускоряет восстановление после потерь.

Timestamp - для измерения RTT и защиты от "ancient segments" (PAWS).
```

```bash
# Посмотреть handshake в реальном времени
tcpdump -i eth0 -n 'tcp[13] & 2 != 0' -v
# 192.168.1.10.52341 > 93.184.216.34.80: Flags [S],
#   seq 3274880045, win 65535,
#   options [mss 1460,sackOK,TS val 123456 ecr 0,nop,wscale 7], length 0

# Сымитировать handshake через hping3
hping3 -S -p 80 -c 1 example.com     # послать SYN
hping3 --traceroute -S -p 80 example.com  # TCP трассировка

# Захват полного handshake в файл
tcpdump -i eth0 -w handshake.pcap 'host example.com and tcp'
```

---

## Four-Way Teardown (корректное закрытие)

### Полная схема

```
Клиент                                              Сервер
ESTABLISHED                                      ESTABLISHED
  │                                                    │
  │  ① FIN+ACK  (Active Close)                       │
  │  seq=A, ack=B                                     │
  │  flags=[FIN,ACK]                                  │
  │──────────────────────────────────────────────────►│
  │                                                    │
FIN_WAIT_1                                       CLOSE_WAIT
  │                                                    │
  │                       ② ACK                       │
  │                       seq=B, ack=A+1              │
  │                       flags=[ACK]                 │
  │◄──────────────────────────────────────────────────│
  │                                                    │
FIN_WAIT_2                    (сервер ещё может слать данные)
  │                                                    │
  │                       ③ FIN+ACK  (Passive Close)  │
  │                       seq=B, ack=A+1              │
  │                       flags=[FIN,ACK]             │
  │◄──────────────────────────────────────────────────│
  │                                                    │
TIME_WAIT                                          LAST_ACK
  │                                                    │
  │  ④ ACK                                            │
  │  seq=A+1, ack=B+1                                 │
  │  flags=[ACK]                                      │
  │──────────────────────────────────────────────────►│
  │                                                    │
  │  [ждём 2×MSL = 60-240 секунд]                    │
  │                                                    │   CLOSED
CLOSED
```

### TIME_WAIT — почему это важно

```
TIME_WAIT длится 2×MSL (Maximum Segment Lifetime = 60 секунд в Linux).
2×MSL = 120 секунд (может быть 60-240 сек в зависимости от ОС).

Зачем ждать?
1. Последний ACK (④) мог потеряться. Если сервер пришлёт повторный FIN,
   клиент должен ответить ACK. Без TIME_WAIT ответит RST.

2. Защита от "заблудших" пакетов. Старые пакеты из предыдущего соединения
   с теми же портами не должны быть приняты новым соединением.

Проблема TIME_WAIT:
При высоком трафике (тысячи коротких соединений) TIME_WAIT
занимает много памяти и исчерпывает ephemeral ports.

Решения:
tcp_tw_reuse = 1   - повторно использовать TIME_WAIT сокеты (безопасно)
tcp_fin_timeout    - уменьшить время ожидания FIN_WAIT_2
SO_REUSEADDR       - опция сокета для переиспользования порта
```

```bash
# Посмотреть TIME_WAIT соединения
ss -tan state time-wait | wc -l
ss -tan state time-wait | head -20

# Настройки TIME_WAIT
cat /proc/sys/net/ipv4/tcp_fin_timeout     # время FIN_WAIT_2 (по умолчанию 60)
cat /proc/sys/net/ipv4/tcp_tw_reuse        # переиспользовать TIME_WAIT (0/1)

# Уменьшить TIME_WAIT проблему
echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse
```

### Одновременное закрытие (Simultaneous Close)

```
Обе стороны отправляют FIN одновременно:

Клиент                        Сервер
  │  FIN ──────────────────►  │
  │  ◄────────────────── FIN  │
CLOSING                    CLOSING
  │  ACK ──────────────────►  │
  │  ◄────────────────── ACK  │
TIME_WAIT                 TIME_WAIT
```

---

## RST — аварийный сброс

### Когда генерируется RST

```
1. Соединение с закрытым портом:
   Клиент → SYN на порт 12345 → Сервер (ничего не слушает) → RST+ACK

2. Приложение закрыло сокет с данными в буфере:
   Вместо FIN (graceful) → RST

3. Фаерволл/IDS сбрасывает соединение

4. Получение пакета для несуществующего соединения:
   ACK без соответствующего SYN → RST

5. Ошибка в соединении (duplicate SYN и т.д.)
```

### RST vs FIN

```
FIN - "Я закончил отправлять данные, но готов получать"
      Graceful, другая сторона может ещё отправить данные
      Требует квитирования (ACK + ответный FIN)

RST - "Соединение немедленно разорвано"
      Не graceful, данные в пути теряются
      Не требует квитирования, сразу CLOSED
      Получатель RST переходит в CLOSED без TIME_WAIT
```

```bash
# Пример: RST при подключении к закрытому порту
nmap -sT -p 12345 localhost

# Сгенерировать RST принудительно (через hping3)
hping3 -R -p 80 target            # послать RST на порт 80

# Захват RST пакетов
tcpdump -i eth0 'tcp[13] & 4 != 0' -n   # RST бит = бит 2
```

---

## Все состояния TCP

### Полная диаграмма состояний

```
                         ┌─────────┐
                         │  CLOSED │
                         └────┬────┘
                    passive   │  active
                    open      │  open
                         ┌────▼────┐
                         │  LISTEN │◄──────────────────────────────┐
                         └────┬────┘                               │
               SYN received   │  SYN sent                          │
                         ┌────▼──────┐                             │
                         │SYN_RECEIVED│                            │
                         └────┬──────┘                             │
                    ACK of SYN│                                     │
                         ┌────▼──────────┐    ┌───────────────┐    │
      ┌──────────────────►  ESTABLISHED  │    │  SYN_SENT     │    │
      │              ┌───└───────┬───────┘    └───────┬───────┘    │
      │              │  close/  │close               │SYN+ACK     │
      │              │  FIN     │FIN                 │received     │
      │              │          │                    │            │
┌─────┴──────┐  ┌────▼────┐ ┌───▼──────┐            │            │
│CLOSE_WAIT  │  │FIN_WAIT1│ │FIN_WAIT1 │            │            │
└─────┬──────┘  └────┬────┘ └───┬──────┘            │            │
 close│          ACK │     FIN  │ACK                │            │
      │         recv.│     recv.│                   │            │
┌─────▼──────┐  ┌────▼────┐ ┌───▼──────┐            │            │
│  LAST_ACK  │  │FIN_WAIT2│ │ CLOSING  │            │            │
└─────┬──────┘  └────┬────┘ └───┬──────┘            │            │
ACK   │          FIN │    ACK   │                   │            │
recv. │         recv.│    recv. │                   │            │
      │         ┌────▼──────────▼──────┐            │            │
      │         │      TIME_WAIT       │            │            │
      │         └─────────┬────────────┘            │            │
      │           2MSL    │ timeout                 │            │
┌─────▼──────────────────▼──────────────────────────▼───────────▼┐
│                          CLOSED                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Таблица состояний с описанием

| Состояние | Описание |
|-----------|----------|
| **CLOSED** | Нет соединения. Начальное и конечное состояние. |
| **LISTEN** | Сервер ожидает входящих SYN. `ss -tlnp` |
| **SYN_SENT** | Клиент отправил SYN, ждёт SYN-ACK |
| **SYN_RECEIVED** | Сервер получил SYN, отправил SYN-ACK, ждёт ACK |
| **ESTABLISHED** | Соединение установлено, данные передаются |
| **FIN_WAIT_1** | Инициатор закрытия отправил FIN, ждёт ACK |
| **FIN_WAIT_2** | ACK получен, ждёт FIN от другой стороны |
| **CLOSE_WAIT** | Получен FIN, приложение ещё не закрыло сокет |
| **CLOSING** | Обе стороны отправили FIN одновременно |
| **LAST_ACK** | Сторона ожидает ACK на свой FIN |
| **TIME_WAIT** | Ожидание 2×MSL перед окончательным закрытием |

```bash
# Мониторинг состояний TCP
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# Подробный вывод с состояниями
ss -tanp state established
ss -tanp state time-wait
ss -tanp state close-wait        # приложение не закрыло сокет!
ss -tanp state syn-recv           # входящие соединения в очереди

# Счётчик по состояниям
ss -s
# Total: 1234
# TCP:   342 (estab 300, closed 20, orphan 5, timewait 15, ...

# Netstat (устаревший, но везде есть)
netstat -an | grep ESTABLISHED | wc -l
netstat -an | grep TIME_WAIT | wc -l
```

### CLOSE_WAIT — типичная проблема

```
CLOSE_WAIT означает:
- Получили FIN от партнёра (партнёр закрыл свою сторону)
- НО приложение ещё не вызвало close() на сокете

Если CLOSE_WAIT соединений много - это BUG в приложении!
Приложение не закрывает сокет после получения EOF.

Диагностика:
ss -tanp state close-wait      # смотрим какой процесс
lsof -p <PID> | grep CLOSE_WAIT
```

---

## Управление потоком (Flow Control)

### Sliding Window

```
Отправитель не может послать больше данных, чем размер окна получателя.
Это предотвращает переполнение буфера получателя.

Window Size = количество байт, которые можно отправить без ACK

Состояние окна:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│  отправлено  │  отправлено  │  можно       │  нельзя      │  нет │
│  и           │  ожидаем ACK │  отправить   │  отправить   │  дан.│
│  подтверждено│              │  (в окне)    │  (за окном)  │      │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ↑ SND.UNA      ↑ SND.NXT    ↑ SND.UNA+WIN

При получении ACK окно сдвигается вправо (sliding).
```

### Zero Window

```
Если получатель перегружен, он объявляет Window Size = 0:
"Стоп! Буфер полон, не отправляй данные!"

Отправитель прекращает передачу и периодически отправляет
Window Probe (1 байт данных) для проверки — не освободился ли буфер.

Zero Window Probe:
Клиент ──── data (1 байт) ──────────────────► Сервер (win=0)
       ◄─── ACK, win=0 ─────────────────────
       [ждём TCP_KEEPALIVE_INTVL]
Клиент ──── probe (1 байт) ─────────────────►
       ◄─── ACK, win=8192 ──────────────────  (буфер освободился!)
       ══════════ продолжаем передачу ══════►

tcpdump покажет: [ZeroWindow] и [WindowProbe]
```

---

## Управление перегрузкой (Congestion Control)

### Алгоритмы

```
Congestion Window (cwnd) - сколько байт отправитель может послать
(дополнительно к ограничению flow control)

Реальный лимит = min(cwnd, rwnd)
где rwnd — окно получателя (flow control)

Алгоритмы congestion control:
TCP Reno       - классический (Linux до 2.6)
TCP CUBIC      - современный стандарт Linux
TCP BBR        - Google's Bottleneck Bandwidth and RTT (2016)
TCP Vegas      - latency-based
```

### Фазы TCP Reno / CUBIC

```
Throughput
   │                            /\
   │                           /  \
   │             ____________ /    \
   │            /             ← ssthresh
   │           /
   │          / ← линейный рост (Congestion Avoidance)
   │         /
   │────────/ ← экспоненциальный рост (Slow Start)
   └─────────────────────────────────────────── время

Slow Start:
- Начинаем с cwnd = 10 MSS (RFC 6928)
- Каждый ACK: cwnd += 1 MSS → экспоненциальный рост
- Достигаем ssthresh → переходим в Congestion Avoidance

Congestion Avoidance:
- cwnd += MSS²/cwnd на каждый ACK → линейный рост (1 MSS/RTT)

При потере пакета (три дублирующих ACK → Fast Retransmit):
- ssthresh = cwnd/2
- cwnd = ssthresh (TCP Reno) или остаётся high (CUBIC)
- Начинаем Congestion Avoidance

При timeout:
- ssthresh = cwnd/2
- cwnd = 1 MSS → Slow Start снова
```

```bash
# Проверить алгоритм congestion control
cat /proc/sys/net/ipv4/tcp_congestion_control
# cubic

# Доступные алгоритмы
cat /proc/sys/net/ipv4/tcp_available_congestion_control
# reno cubic bbr

# Включить BBR
echo "bbr" > /proc/sys/net/ipv4/tcp_congestion_control
modprobe tcp_bbr

# Посмотреть cwnd и rtt для соединения
ss -tni dst 8.8.8.8
# рcd rtt:22.483/5.234 rto:211 mss:1460 pmtu:1500
# rcvmss:1460 advmss:1460 cwnd:10 ssthresh:2147483647
```

---

## Повторная передача (Retransmission)

### Виды повторной передачи

```
1. Retransmission Timeout (RTO):
   Таймер истёк, ACK не получен → повторная отправка
   RTO = SRTT + 4×RTTVAR (адаптивный по RTT)
   После каждого timeout: RTO удваивается (backoff)

2. Fast Retransmit:
   3 дублирующих ACK → немедленная повторная передача
   (не ждём timeout, быстрее!)

3. SACK-based Retransmit:
   Selective ACK указывает точно какие диапазоны потеряны
   Передаём только потерянные сегменты (не всё от точки потери)
```

### Пример Fast Retransmit

```
Отправитель                          Получатель
seq=1-100  ──────────────────────►  ✓ (ACK=101)
seq=101-200 ─────────────── ✗       (потерян!)
seq=201-300 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-300)
seq=301-400 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-400)
seq=401-500 ──────────────────────►  ✓ (Dup ACK=101, SACK=201-500)
                                     ↑
             3 дублирующих ACK=101 → Fast Retransmit!
seq=101-200 ──────────────────────►  ✓ (ACK=501, SACK=None)
                     ↑
                   Сразу подтвердил всё до 501 (SACK помог)
```

```bash
# Посмотреть retransmissions
ss -tin | grep retrans
# rtt:5.123/1.234 rto:210 mss:1460 cwnd:10 retrans:0/2

# Статистика по интерфейсу
netstat -s | grep retransmit
# 234 segments retransmitted

# tcpdump показывает "TCP Retransmission"
tcpdump -i eth0 -nn
# Wireshark: tcp.analysis.retransmission
```

---

## TCP Keep-Alive

```
Механизм проверки живости соединения.
После периода простоя отправляются probe пакеты.

Параметры (Linux):
tcp_keepalive_time    = 7200   # сек простоя до первого probe (2 часа)
tcp_keepalive_intvl   = 75     # сек между probe пакетами
tcp_keepalive_probes  = 9      # количество probe до закрытия

Итого: 7200 + 75×9 = 7875 секунд (~2.2 часа) до детектирования "мёртвого" хоста
```

```bash
# Посмотреть keepalive настройки
cat /proc/sys/net/ipv4/tcp_keepalive_time
cat /proc/sys/net/ipv4/tcp_keepalive_intvl
cat /proc/sys/net/ipv4/tcp_keepalive_probes

# Уменьшить для быстрого детектирования мёртвых соединений
echo 60 > /proc/sys/net/ipv4/tcp_keepalive_time
echo 10 > /proc/sys/net/ipv4/tcp_keepalive_intvl
echo 3  > /proc/sys/net/ipv4/tcp_keepalive_probes

# Включить keepalive для конкретного сокета (в коде)
# SO_KEEPALIVE - включить
# TCP_KEEPIDLE, TCP_KEEPINTVL, TCP_KEEPCNT - параметры
```

---

## Практическая диагностика TCP

```bash
# Полный анализ соединения
ss -tniep                              # всё что есть
ss -tin dst 93.184.216.34             # конкретный хост

# Вывод ss -tin:
# State   Recv-Q  Send-Q  Local           Peer
# ESTAB   0       0       192.168.1.10:52341 93.184.216.34:80
#   rtt:22.483/5.234 rto:211 mss:1460 pmtu:1500
#   rcvmss:1460 advmss:1460 cwnd:10 ssthresh:2147483647
#   bytes_sent:1234 bytes_retrans:0 bytes_acked:1234
#   bytes_received:5678 segs_out:15 segs_in:12
#   send 533.1Mbps lastrcv:2ms lastack:2ms pacing_rate 1066.2Mbps

# Поля ss -tin:
# rtt:22.483/5.234   - RTT / RTTVAR (среднее/отклонение, мс)
# rto:211            - Retransmission Timeout (мс)
# mss:1460           - Maximum Segment Size
# cwnd:10            - Congestion Window (в MSS)
# ssthresh:...       - Slow Start threshold
# retrans:0/2        - retrans/total retrans

# Захват полной сессии
tcpdump -i eth0 -w session.pcap 'host example.com and tcp'

# Анализ проблем в tcpdump/Wireshark
# [R] RST            - соединение сброшено
# [ZeroWindow]       - буфер получателя переполнен
# [WindowProbe]      - проверка после ZeroWindow
# [TCP Dup ACK]      - дублирующий ACK (потеря?)
# [TCP Retransmission] - повторная передача
# [TCP Fast Retrans] - быстрая повторная передача
# [TCP Out-Of-Order] - пакет пришёл не по порядку

# Мониторинг TCP проблем в реальном времени
watch -n 1 'netstat -s | grep -E "retransmit|reset|fail|error"'
```

---

## Шпаргалка

```
TCP флаги:
SYN  - установить соединение (синхронизировать seq)
ACK  - подтвердить данные (ack number валиден)
FIN  - завершить соединение (graceful)
RST  - сбросить соединение (аварийный)
PSH  - передать немедленно (не буферизовать)
URG  - срочные данные

Состояния:
LISTEN       - ожидание входящих соединений
SYN_SENT     - клиент отправил SYN
SYN_RECEIVED - сервер получил SYN, ждёт ACK
ESTABLISHED  - соединение активно
FIN_WAIT_1/2 - активное закрытие (отправили FIN)
CLOSE_WAIT   - получили FIN (пассивная сторона)
LAST_ACK     - ждём ACK на FIN
TIME_WAIT    - ждём 2×MSL (120 сек по умолчанию)
CLOSING      - одновременное закрытие

Handshake:
[S] → [SA] → [.] → данные

Teardown:
[F.] → [.] → [F.] → [.] → TIME_WAIT → CLOSED

Правило seq/ack:
seq = номер первого байта в этом сегменте
ack = следующий байт, который ожидаем получить
SYN и FIN занимают по 1 байту в пространстве seq

Полезные команды:
ss -tan             - все TCP состояния
ss -tin             - детальная TCP инфо (rtt, cwnd)
tcpdump -i eth0 tcp - TCP трафик
```

---

## Ссылки

- [RFC 793](https://www.rfc-editor.org/rfc/rfc793) - оригинальный стандарт TCP (1981)
- [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293) - обновлённый стандарт TCP (2022)
- [RFC 2581](https://www.rfc-editor.org/rfc/rfc2581) - TCP Congestion Control
- [RFC 2018](https://www.rfc-editor.org/rfc/rfc2018) - TCP Selective Acknowledgment
- [TCP Illustrated, Vol. 1](https://www.kohala.com/start/tcpipiv1.html) - W. Richard Stevens
