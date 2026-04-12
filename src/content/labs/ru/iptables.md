---
title: "iptables - построй свой firewall с нуля"
description: "В данной работе построим firewall с нуля: от сброса правил до защиты от SYN-flood, блокировки сканирования портов и логирования всего подозрительного"
image: "/images/iptables_sec/main.jpg"
date: "2026-04-12"
---

## Введение

Большинство Linux-систем поставляются без настроенного firewall. Весь входящий трафик принимается по умолчанию. iptables позволяет полностью контролировать что попадает на сервер, что отправляется наружу и что пересылается дальше.

В данной работе построим firewall с нуля: от сброса правил до защиты от SYN-flood, блокировки сканирования портов и логирования всего подозрительного. В финале проверим результат через nmap с другой машины - посмотрим что видно снаружи.

| Параметр | Значение |
| --- | --- |
| Сервер | Ubuntu, 10.10.70.130 |
| Атакующая машина | Parrot OS, 10.10.70.129 |
| Инструменты | iptables, nmap, curl, journalctl |

---

## Теоретическая база

### Как работают цепочки iptables

iptables обрабатывает пакеты через три основные цепочки:

**INPUT** - пакеты, адресованные самому серверу. Именно здесь решается кто может подключиться к SSH, HTTP, и другим сервисам.

**FORWARD** - пакеты, которые сервер пересылает дальше (работа маршрутизатора). Для обычного сервера закрывается полностью.

**OUTPUT** - пакеты, исходящие от сервера. Обычно остаётся открытым — сервер должен инициировать соединения сам.

### Политика DROP vs REJECT

**DROP** - пакет молча выбрасывается. Отправитель не получает никакого ответа и не знает существует ли хост. Лучше для безопасности — скрывает топологию сети.

**REJECT** - отправитель получает ICMP-ошибку. Честнее, но раскрывает факт существования хоста и наличие firewall.

### Отслеживание состояний

Модуль `state` позволяет понимать контекст пакета:

| Состояние | Значение |
| --- | --- |
| NEW | Первый пакет нового соединения |
| ESTABLISHED | Пакет уже установленного соединения |
| RELATED | Связанное соединение (например, FTP data) |
| INVALID | Пакет не принадлежит ни одному соединению |

---

## Фаза 1. Начальное состояние

### Шаг 1. Проверяем правила до изменений

```bash
sudo iptables -L -v -n
sudo iptables -L -v -n --line-numbers
sudo iptables-save
```

![01_iptables_now](/handson/images/iptables_sec/01_iptables_now.png)

По умолчанию все цепочки имеют политику `ACCEPT` и не содержат правил. Firewall не блокирует ничего - любой пакет проходит свободно.

---

## Фаза 2. Сброс и базовая политика

### Шаг 2. Сброс всех правил

```bash
sudo iptables -F   # очищаем все цепочки (Flush)
sudo iptables -X   # удаляем пользовательские цепочки
sudo iptables -Z   # обнуляем счётчики пакетов и байт
```

![02_reset](/handson/images/iptables_sec/02_reset.png)

После сброса цепочки пусты. Политика осталась `ACCEPT` - сервер по-прежнему принимает всё, но уже без каких-либо правил.

### Шаг 3. Устанавливаем политику DROP

```bash
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT
```

![03_drop](/handson/images/iptables_sec/03_drop.png)

Теперь любой пакет, не подпадающий под явное разрешение - молча выбрасывается. Сервер стал полностью закрытым. Следующие шаги будут открывать ровно то, что нужно.

> После установки DROP без разрешающих правил SSH-сессия прервётся. В лабе мы работаем локально - на VM с прямым доступом.

### Шаг 4. Проверяем политики

```bash
sudo iptables -P OUTPUT ACCEPT
sudo iptables -L -v -n
```

![04_check](/handson/images/iptables_sec/04_check.png)

В выводе видно: `Chain INPUT (policy DROP 3 packets, 732 bytes)` - три пакета уже отброшено с момента установки политики. Firewall работает.

---

## Фаза 3. Базовые разрешающие правила

### Шаг 5. Разрешаем loopback

```bash
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -L INPUT -v -n --line-numbers
```

![05_loopback](/handson/images/iptables_sec/05_loopback.png)

Без этого правила сломаются все локальные сервисы - базы данных, веб-серверы, межпроцессное взаимодействие. Всё что общается через `127.0.0.1` должно работать без ограничений.

### Шаг 6. Разрешаем ESTABLISHED соединения

```bash
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
```

![06_established](/handson/images/iptables_sec/06_established.png)

Без этого правила сервер не получал бы ответы на свои исходящие запросы - `apt update`, `curl`, DNS-запросы всё перестало бы работать. Правило разрешает входящие пакеты только тех соединений, которые сервер сам инициировал.

### Шаг 7. Разрешаем SSH только из своей подсети

```bash
# Узнаём свою подсеть
ip route | grep src

# Разрешаем SSH только из локальной сети
sudo iptables -A INPUT -s 10.10.70.0/24 -p tcp --dport 22 -j ACCEPT
```

![07_ssh](/handson/images/iptables_sec/07_ssh.png)

SSH открыт только для подсети `10.10.70.0/24`. Попытки подключиться с любого другого IP будут молча дропнуты.

### Шаг 8. Разрешаем HTTP и HTTPS

```bash
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

sudo iptables -L INPUT -v -n --line-numbers
```

![08_http-s](/handson/images/iptables_sec/08_http-s.png)

Веб-трафик открыт для всех - это публичные порты. В отличие от SSH, здесь ограничение по IP не нужно.

---

## Фаза 4. Защита от атак

### Шаг 9. Rate limiting - защита от SYN flood

```bash
sudo iptables -A INPUT -p tcp --syn \
    -m limit --limit 25/minute --limit-burst 100 \
    -j ACCEPT
```

![09_rate_limiting](/handson/images/iptables_sec/09_rate_limiting.png)

SYN flood - классическая DoS-атака: атакующий отправляет миллионы TCP SYN-пакетов, исчерпывая таблицу соединений сервера. Правило разрешает не более 25 новых соединений в минуту, с буфером до 100 в пике. Всё сверх лимита падает на дефолтный DROP.

### Шаг 10. Блокировка сканирования портов

```bash
# NULL-пакеты (все флаги выключены) - Nmap -sN
sudo iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP

# XMAS-пакеты (все флаги включены) - Nmap -sX
sudo iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
```

![10_sec_scan](/handson/images/iptables_sec/10_sec_scan.png)

Nmap использует нестандартные комбинации TCP-флагов для определения открытых портов в обход простых firewall. NULL-пакеты (без флагов) и XMAS-пакеты (все флаги) не встречаются в нормальном трафике - блокируем оба.

### Шаг 11. ICMP с лимитом

```bash
sudo iptables -A INPUT -p icmp \
    --icmp-type echo-request \
    -m limit --limit 1/second \
    -j ACCEPT
```

![11_icmp_limit](/handson/images/iptables_sec/11_icmp_limit.png)

Ping нужен для проверки доступности сервера - полностью блокировать ICMP не стоит. Лимит в 1 пакет в секунду делает ICMP flood бессмысленным.

---

## Фаза 5. Логирование и сохранение

### Шаг 12. Проверяем полный набор правил

```bash
sudo iptables -L INPUT -v -n --line-numbers
```

![12_check](/handson/images/iptables_sec/12_check.png)

Итоговый набор правил INPUT:

| № | Действие | Условие |
| --- | --- | --- |
| 1 | ACCEPT | Loopback (lo) |
| 2 | ACCEPT | ESTABLISHED, RELATED |
| 3 | ACCEPT | TCP 22, только 10.10.70.0/24 |
| 4 | ACCEPT | TCP 80 (HTTP) |
| 5 | ACCEPT | TCP 443 (HTTPS) |
| 6 | ACCEPT | TCP SYN, лимит 25/мин |
| 7 | DROP | TCP флаги ALL NONE (NULL scan) |
| 8 | DROP | TCP флаги ALL ALL (XMAS scan) |
| 9 | ACCEPT | ICMP echo-request, лимит 1/сек |

Политика по умолчанию: **DROP**

### Шаг 13. Добавляем логирование дропнутых пакетов

```bash
# Правило LOG добавляем последним - оно не блокирует пакет, только пишет в лог
sudo iptables -A INPUT -j LOG \
    --log-prefix 'IPTABLES-DROPPED: ' \
    --log-level 4
```

![13_drop_logs](/handson/images/iptables_sec/13_drop_logs.png)

Правило `LOG` не является терминальным - пакет после логирования продолжает обработку и падает на дефолтный DROP. Все заблокированные пакеты теперь пишутся в `/var/log/kern.log` с префиксом `IPTABLES-DROPPED:`.

### Шаг 14. Установка iptables-persistent

```bash
sudo apt install iptables-persistent -y
# Во время установки спросит сохранить текущие правила - Yes
```

![14_install](/handson/images/iptables_sec/14_install.png)

`iptables-persistent` автоматически загружает правила из файлов при загрузке системы. Пакет `ufw` удаляется - он конфликтует с ручным управлением iptables.

### Шаг 15. Сохранение правил в файл

```bash
sudo mkdir -p /etc/iptables
sudo iptables-save | sudo tee /etc/iptables/rules.v4
cat /etc/iptables/rules.v4
```

![15_save](/handson/images/iptables_sec/15_save.png)

Файл `rules.v4` содержит все правила в текстовом формате - можно редактировать вручную и читать как документацию:

```
*filter
:INPUT DROP [6:1342]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [56:8387]
-A INPUT -i lo -j ACCEPT
-A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
-A INPUT -s 10.10.70.0/24 -p tcp -m tcp --dport 22 -j ACCEPT
...
COMMIT
```

---

## Фаза 6. Проверка с внешней машины

### Шаг 16. Сканирование версий сервисов

С Parrot OS запускаем целевое сканирование ключевых портов:

```bash
sudo nmap -sV -p 22,80,443,8080 10.10.70.130
```

![16_nmap](/handson/images/iptables_sec/16_nmap.png)

Результат сканирования:

| Порт | Состояние | Сервис | Версия |
| --- | --- | --- | --- |
| 22/tcp | open | ssh | OpenSSH 10.0p2 Ubuntu |
| 80/tcp | closed | http | - |
| 443/tcp | closed | https | - |
| 8080/tcp | closed | http-proxy | - |

Порт 22 открыт - Parrot находится в подсети `10.10.70.0/24`. Порты 80 и 443 показывают `closed`, а не `filtered` - nginx ещё не запущен, сами порты разрешены firewall но сервис не слушает.

### Шаг 17. UDP-сканирование

```bash
sudo nmap -sU --top-ports 20 10.10.70.130
```

![17_udp_ports](/handson/images/iptables_sec/17_udp_ports.png)

Все 20 популярных UDP-портов показывают `open|filtered`. Это характерное поведение при политике DROP - Nmap не получает ни ответа ни ICMP-ошибки и не может определить открыт порт или закрыт.

### Шаг 18. FIN и NULL сканирование

```bash
sudo nmap -sF 10.10.70.130   # FIN scan
sudo nmap -sN 10.10.70.130   # NULL scan
```

![18_scan](/handson/images/iptables_sec/18_scan.png)

998 портов - `open|filtered`. Порты 80 и 443 - `closed` (нет сервиса, но firewall пропускает). NULL-пакеты блокируются правилом 7, FIN-пакеты - дефолтным DROP. Сканер не получает информации о сервере.

### Шаг 19. XMAS-сканирование

```bash
sudo nmap -sX 10.10.70.130
```

![19_scan_sx](/handson/images/iptables_sec/19_scan_sx.png)

XMAS-пакеты (флаги FIN+PSH+URG) блокируются правилом 8. Результат идентичен NULL-сканированию - `open|filtered` везде.

### Шаг 20. Логи заблокированных пакетов

```bash
sudo journalctl -k | grep IPTABLES-DROPPED | tail -30
```

![20_logs_dropped_scan](/handson/images/iptables_sec/20_logs_dropped_scan.png)

В логах видна вся история сканирования:

```
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=1863 ... URG PSH FIN
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=990  ... URG PSH FIN
IPTABLES-DROPPED: SRC=10.10.70.129 DST=10.10.70.130 PROTO=TCP DPT=1503 ... URG PSH FIN
```

Флаги `URG PSH FIN` - характерная подпись XMAS-сканирования. В реальной системе такие логи — сигнал для расследования.

---

## Фаза 7. Проверка веб-сервера и финал

### Шаг 21. Проверка nginx через curl

```bash
curl -I http://localhost
```

![21_curl_i](/handson/images/iptables_sec/21_curl_i.png)

```
HTTP/1.1 200 OK
Server: nginx/1.28.0 (Ubuntu)
Content-Type: text/html
```

Nginx работает локально. Firewall пропускает loopback-трафик и не мешает локальным сервисам.

### Шаг 22. SSH из запрещённой подсети

```bash
ssh ubuntu@10.10.70.130
```

![22_another_net](/handson/images/iptables_sec/22_another_net.png)

Попытка SSH с машины за пределами `10.10.70.0/24` - соединение не устанавливается. Пакет дропается без ответа - атакующий не знает существует ли хост.

### Шаг 23. Проверка правил после перезагрузки

```bash
sudo reboot
# После перезагрузки:
sudo iptables -L -v -n --line-numbers
```

![23_after_reboot](/handson/images/iptables_sec/23_after_reboot.png)

Все правила на месте. Счётчики пакетов показывают реальную статистику работы firewall:

| № | pkts | Правило |
| --- | --- | --- |
| 1 | 48 | ACCEPT loopback |
| 2 | 1042 | ACCEPT ESTABLISHED |
| 3 | 13 | ACCEPT SSH |
| 6 | 182 | ACCEPT SYN limit |
| 7 | 1994 | DROP NULL scan |
| 10 | 6123 | LOG dropped |

Правило 7 обработало 1994 пакета - это следы сканирования. Правило LOG зафиксировало 6123 заблокированных пакета.

---

## Итоги и выводы

### Полная карта firewall

| Правило | Протокол | Источник | Порт | Действие | Защищает от |
| --- | --- | --- | --- | --- | --- |
| Loopback | all | 127.0.0.1 | any | ACCEPT | - |
| ESTABLISHED | all | any | any | ACCEPT | - |
| SSH | TCP | 10.10.70.0/24 | 22 | ACCEPT | SSH brute-force извне |
| HTTP | TCP | any | 80 | ACCEPT | - |
| HTTPS | TCP | any | 443 | ACCEPT | - |
| SYN limit | TCP SYN | any | any | ACCEPT | SYN flood DoS |
| NULL drop | TCP | any | any | DROP | Nmap -sN |
| XMAS drop | TCP | any | any | DROP | Nmap -sX |
| ICMP limit | ICMP | any | - | ACCEPT | ICMP flood |
| LOG | all | any | any | LOG | Аудит |

### Что показал nmap снаружи

Firewall с политикой DROP эффективно скрывает информацию о сервере. Атакующий видит только то, что явно разрешено. NULL, FIN и XMAS-сканирование возвращают `open|filtered` - никакой полезной информации о топологии сети.
