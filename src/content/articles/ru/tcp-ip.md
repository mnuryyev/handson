---
title: "Анализ сетевого трафика TCP/IP в Wireshark"
description: "В данной работе захватим и разберём трафик: HTTP-запрос в открытом виде, DNS-резолвинг, ICMP-пинг, TCP three-way handshake, SSH-сессию и HTTPS"
image: "/images/tpc_ip_net/main.jpg"
date: "2026-04-18"
---

## Введение

Сетевые протоколы являются основной частью передачи данных в сети. При открытии веб-страниц, выполнении команды ping или подключении по SSH происходит обмен пакетами с заданной структурой. Для их анализа может использоваться Wireshark.

В данной работе будет произведён захват и анализ сетевого трафика различных типов: HTTP-запросов, DNS-запросов, ICMP (ping), установления TCP-соединения (three-way handshake), а также SSH и HTTPS. Для каждого протокола будут рассмотрены основные поля пакетов и сделаны выводы о передаваемой и доступной для анализа информации.


| Параметр | Значение |
| --- | --- |
| Машина | Parrot OS, 10.10.70.129 |
| Инструменты | Wireshark, curl, ping, nslookup, ssh |
| Тестовые ресурсы | httpbin.org, google.com, example.com |

---

## Теоретическая база

### Модель TCP/IP на практике

Каждый пакет в Wireshark - это несколько протоколов вложенных друг в друга. HTTP-запрос к сайту выглядит так:

| Уровень | Протокол | Что содержит |
| --- | --- | --- |
| Прикладной | HTTP | GET /page, заголовки, тело |
| Транспортный | TCP | Порты, флаги, номера последовательности |
| Сетевой | IP | IP-адреса источника и назначения, TTL |
| Канальный | Ethernet | MAC-адреса |

Wireshark показывает все уровни одновременно - можно раскрыть любой и увидеть каждое поле.

### Что зашифровано, что нет

| Протокол | Содержимое видно? | Метаданные видны? |
| --- | --- | --- |
| HTTP | Да — полностью | Да |
| DNS | Да — запросы и ответы | Да |
| ICMP | Да — payload | Да |
| HTTPS/TLS | Нет — зашифровано | Да — IP, порт, SNI |
| SSH | Нет — зашифровано | Да — IP, порт, версия |

---

## Фаза 1. HTTP трафик

### Шаг 1. Генерируем HTTP запрос

Запускаем Wireshark, выбираем интерфейс, начинаем захват. В терминале:

```bash
curl http://httpbin.org/get
```

![01_curl](/handson/images/tcp_ip_net/01_curl.png)

### Шаг 2. Полная картина HTTP сессии

В Wireshark без фильтра видна вся последовательность:

![02_wireshark](/handson/images/tcp_ip_net/02_wireshark.png)

Один запрос `curl http://httpbin.org/get` приводит к передаче примерно 15 сетевых пакетов:

| Пакеты | Протокол | Что происходит |
| --- | --- | --- |
| 1–4 | DNS | Резолвинг httpbin.org → IP (A и AAAA записи) |
| 5–7 | TCP | Three-way handshake (SYN → SYN-ACK → ACK) |
| 8 | HTTP | GET /get запрос |
| 10 | HTTP | 200 OK ответ с JSON |
| 11–15 | TCP | Закрытие соединения (FIN-ACK) |

### Шаг 3. Фильтр по протоколу HTTP

В Wireshark вводим фильтр `http`:

![03_http](/handson/images/tcp_ip_net/03_http.png)

Из 15 пакетов остаются только два: GET-запрос и 200 OK ответ.

### Шаг 4. Внутренности HTTP GET запроса

Кликаем на пакет с GET - разворачиваем `Hypertext Transfer Protocol`:

![04_get](/handson/images/tcp_ip_net/04_get.png)

В открытом виде видны все заголовки:

```
GET /get HTTP/1.1
Host: httpbin.org
User-Agent: curl/8.14.1
Accept: */*
```

`[Response in frame: 10]` - Wireshark автоматически связывает запрос с ответом. В HTTP нет шифрования - любой наблюдатель на пути пакета видит этот текст полностью.

### Шаг 5. Follow TCP Stream

Правая кнопка на GET-пакете → `Follow → TCP Stream`:

![05_tcp_stream](/handson/images/tcp_ip_net/05_tcp_stream.png)

![06_tcp_stream2](/handson/images/tcp_ip_net/06_tcp_stream2.png)

Wireshark реконструирует весь диалог - красным запрос клиента, синим ответ сервера. Виден полный HTTP-обмен: запрос со всеми заголовками и JSON-ответ с данными. Именно так выглядит HTTP для перехватчика.

---

## Фаза 2. ICMP - анатомия ping

### Шаг 6. Генерируем ICMP трафик

```bash
ping -c 4 google.com
```

![07_ping](/handson/images/tcp_ip_net/07_ping.png)

Фильтр в Wireshark: `icmp`

![08_icmp](/handson/images/tcp_ip_net/08_icmp.png)

Видны пары Request/Reply: от `10.10.0.102` к `142.251.142.238` (Google) и обратно. Задержка около 22 мс.

### Шаг 7. Структура ICMP пакетов

Разворачиваем Echo Request:

![09_request](/handson/images/tcp_ip_net/09_request.png)

```
Type: 8 (Echo request)
Identifier: 0xd966
Sequence number: 1
Timestamp: Apr 18...
[Response frame: 22]
```

Разворачиваем Echo Reply:

![10_reply](/handson/images/tcp_ip_net/10_reply.png)

```
Type: 0 (Echo reply)
Identifier: 0xd966  ← тот же что в запросе
Sequence number: 1  ← совпадает
Response time: 21.839 ms
Checksum: correct
```

Идентификатор и номер последовательности связывают каждый запрос с ответом. В IP-заголовке ответа TTL показывает сколько роутеров прошёл пакет от Google.

---

## Фаза 3. DNS - как имена становятся адресами

### Шаг 8. DNS запрос через nslookup

```bash
nslookup google.com
```

![11_nslookup](/handson/images/tcp_ip_net/11_nslookup.png)

Фильтр в Wireshark: `dns`

![12_dns](/handson/images/tcp_ip_net/12_dns.png)

Видны две транзакции: запрос A-записи (IPv4) с ID `0x24ac` и запрос AAAA-записи (IPv6) с ID `0xf98b`. Время ответа - 27 миллисекунд.

### Шаг 9. Внутренности DNS запроса и ответа

Разворачиваем DNS Query:

![13_query](/handson/images/tcp_ip_net/13_query.png)

```
Port: 53 (UDP)
Flags: Message is a query
Question: google.com, type A
[Response In: 2]
```

Разворачиваем DNS Response:

![14_response](/handson/images/tcp_ip_net/14_response.png)

```
Flags: Message is a response, No error
Answer: google.com → 172.217.19.238
Type: A (IPv4)
TTL: 3918 seconds (~65 минут)
```

DNS работает по UDP на порту 53 и полностью открыт, любой наблюдатель видит какие сайты ты посещаешь. TTL 3918 секунд означает что ответ можно кэшировать 65 минут.

---

## Фаза 4. TCP three-way handshake

### Шаг 10. Захват TCP соединения

```bash
curl http://example.com
```

![15_example](/handson/images/tcp_ip_net/15_example.png)

Фильтр: `tcp.port == 80`

![16_tcp_port](/handson/images/tcp_ip_net/16_tcp_port.png)

### Шаг 11. Три пакета handshake

Первые три пакета - это установка соединения.

**Пакет 1 — SYN:**

![17_syn](/handson/images/tcp_ip_net/17_syn.png)

```
Flags: 0x002 (SYN)
Sequence Number: 0 (relative), raw: 2244735208
Window: 64240
MSS option: 1460
```

Клиент `10.10.0.102:46590` предлагает соединение серверу `8.6.112.6:80`. Sequence Number - случайное число, с которого начнётся нумерация пакетов.

**Пакет 2 — SYN-ACK:**

![18_syn_ack](/handson/images/tcp_ip_net/18_syn_ack.png)

```
Flags: 0x012 (SYN, ACK)
Acknowledgment Number: 1  ← подтверждает SYN клиента
Sequence Number: 0         ← свой SYN
[Expert Info: Connection establish acknowledge (SYN+ACK)]
```

Сервер принимает соединение и одновременно отправляет свой SYN.

**Пакет 3 - ACK:**

![19_ack](/handson/images/tcp_ip_net/19_ack.png)

```
Flags: 0x010 (ACK)
Acknowledgment Number: 1  ← подтверждает SYN сервера
[TCP Flags: ....A....]
```

Клиент подтверждает SYN сервера. Соединение установлено - теперь можно передавать данные.

---

## Фаза 5. SSH - зашифрованный туннель

### Шаг 12. Подключение по SSH

```bash
ssh ubuntu@10.10.70.130
```

![20_ssh_connection](/handson/images/tcp_ip_net/20_ssh_connection.png)

Фильтр в Wireshark: `tcp.port == 22`

![21_ssh_22](/handson/images/tcp_ip_net/21_ssh_22.png)

В отличие от HTTP где всё открыто - здесь совсем другая картина:

| Пакеты | Что видно |
| --- | --- |
| 4–6 | TCP handshake (SYN, SYN-ACK, ACK) |
| 7 | `Client: Protocol (SSH-2.0-OpenSSH_10.0p2 Debian)` |
| 9 | `Server: Protocol (SSH-2.0-OpenSSH_10.0p2 Ubuntu)` |
| 11 | `Client: Key Exchange Init` |
| 14 | `Server: Key Exchange Init` |
| 15 | `Client: Diffie-Hellman Key Exchange Init` |
| 16 | `Server: Diffie-Hellman Key Exchange Reply, New Keys, Encrypted packet` |
| 18+ | `Client/Server: Encrypted packet` — содержимое недоступно |

После обмена ключами через Diffie-Hellman все последующие пакеты - `Encrypted packet`. Wireshark видит факт передачи данных и их размер, но не содержимое.

> Единственное что открыто в SSH - версии клиента и сервера в первых пакетах: `SSH-2.0-OpenSSH_10.0p2`. Это метаданные которые нельзя скрыть - они нужны для согласования протокола.

---

## Фаза 6. HTTPS - TLS поверх TCP

### Шаг 13. HTTPS запрос к Google

```bash
curl https://google.com
```

![22_curl_google](/handson/images/tcp_ip_net/22_curl_google.png)

Google вернул `301 Moved` - перенаправление на `https://www.google.com/`. Это стандартное поведение: запрос на корневой домен редиректится на www.

Фильтр в Wireshark: `tcp.port == 443`

![23_port_443](/handson/images/tcp_ip_net/23_port_443.png)

Полная картина HTTPS сессии:

| Пакеты | Протокол | Что происходит |
| --- | --- | --- |
| 7–9 | TCP | Three-way handshake на порту 443 |
| 10 | TLSv1.3 | `Client Hello (SNI=google.com)` |
| 13 | TLSv1.3 | `Server Hello, Change Cipher Spec` |
| 14–20 | TCP | ACK подтверждения |
| 21 | TLSv1.3 | `Application Data` — зашифровано |
| 25 | TLSv1.3 | `Change Cipher Spec, Application Data` |
| 27+ | TLSv1.3 | `Application Data` — только зашифрованные данные |
| 43 | TCP | `RST, ACK` — сброс соединения |

Ключевой момент - пакет 10: `Client Hello (SNI=google.com)`. **SNI (Server Name Indication)** - единственное поле которое остаётся открытым в HTTPS. Оно нужно чтобы сервер понял к какому сайту обращается клиент и выбрал правильный сертификат. Наблюдатель видит имя домена даже в зашифрованном HTTPS-соединении.

---

## Фаза 7. Сохранение и анализ PCAP

### Шаг 14. Сохраняем захват

В Wireshark: `File → Save As → lab_traffic.pcap`

```bash
ls -la ~/lab_traffic.pcap
```

PCAP-файл можно открыть в любое время, поделиться с коллегой или загрузить в другие инструменты анализа — `tcpdump`, `tshark`, `NetworkMiner`.

### Шаг 15. Statistics → Protocol Hierarchy

В Wireshark: `Statistics → Protocol Hierarchy`

Показывает дерево протоколов с процентами трафика - сколько байт пришлось на TCP, UDP, TLS, HTTP, DNS.

---

## Итоги и выводы

### HTTP vs HTTPS vs SSH — что видно снаружи

| Что видно | HTTP | HTTPS | SSH |
| --- | --- | --- | --- |
| IP-адреса | да | да | да |
| Порт | да | да | да |
| TCP handshake | да | да | да |
| Имя сайта (SNI) | в Host заголовке | в Client Hello | нет |
| Версия протокола | HTTP/1.1 | TLS 1.3 | SSH-2.0 |
| Версия клиента | User-Agent | нет | OpenSSH версия |
| URL запроса | полностью | зашифрован | нет |
| Заголовки | полностью | зашифрованы | нет |
| Тело ответа | полностью | зашифровано | нет |
| Cookies | видны | зашифрованы | нет |
| Объём данных | да | да | да |

### Полезные фильтры Wireshark

| Фильтр | Что показывает |
| --- | --- |
| `http` | Только HTTP трафик |
| `dns` | Только DNS запросы и ответы |
| `icmp` | Только ICMP (ping) |
| `tcp.port == 80` | TCP на порт 80 |
| `tcp.port == 443` | HTTPS трафик |
| `tcp.port == 22` | SSH трафик |
| `tcp.flags.syn == 1 && tcp.flags.ack == 0` | Только SYN пакеты |
| `tcp.flags.syn == 1 && tcp.flags.ack == 1` | Только SYN-ACK |
| `ip.src == 10.10.70.129` | Трафик от конкретного IP |
| `http.request.method == "GET"` | Только GET запросы |
| `frame.len > 1000` | Пакеты крупнее 1000 байт |

В ходе данной работы был исследован сетевой трафик на уровне пакетов: от DNS-резолвинга и ICMP до HTTP, TCP three-way handshake, SSH и HTTPS. Главный вывод - шифрование скрывает содержимое, но не метаданные. Наблюдатель всегда видит с кем вы общаетесь, когда и сколько данных передаётся.
