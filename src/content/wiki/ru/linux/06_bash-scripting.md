---
title: "Bash Scripting - функции, массивы, regex"
date: "2026-04-03"
---

Здесь углублённо про функции, все виды массивов и работу с регулярными выражениями через встроенные средства bash и внешние утилиты.

---

## Функции - углублённо

### Объявление и вызов

```bash
# Два синтаксиса - оба валидны
greet() {
    echo "Hello, $1!"
}

function greet {
    echo "Hello, $1!"
}

# Вызов — просто имя
greet "Alice"
```

### Аргументы функций

```bash
show_args() {
    echo "Имя функции: ${FUNCNAME[0]}"
    echo "Количество аргументов: $#"
    echo "Все аргументы: $@"
    echo "Первый: $1"
    echo "Второй: $2"

    # Перебор всех аргументов
    for arg in "$@"; do
        echo "  - $arg"
    done
}

show_args "foo" "bar" "baz"
```

### local - область видимости

```bash
x="global"

outer() {
    local x="outer"

    inner() {
        local x="inner"
        echo "inner:  $x"   # inner
    }

    inner
    echo "outer:  $x"       # outer
}

outer
echo "global: $x"           # global

# Без local — переменная глобальная (опасно!)
bad_func() {
    result=42               # создаёт/перезаписывает глобальную переменную!
}

good_func() {
    local result=42
    echo "$result"
}
```

### Возвращаемые значения

Bash-функции не возвращают значения как в других языках. Есть два способа:

```bash
# Способ 1: через stdout (самый распространённый)
get_date() {
    date +%Y-%m-%d
}

today=$(get_date)
echo "Сегодня: $today"

# Способ 2: через глобальную переменную с nameref (bash 4.3+)
get_os_info() {
    local -n _result=$1     # nameref — ссылка на переменную по имени
    _result=$(uname -s)
}

get_os_info my_os
echo "ОС: $my_os"

# Код возврата: 0 = успех, 1-255 = ошибка
is_file() {
    [[ -f "$1" ]]           # возвращает 0 или 1
}

is_number() {
    [[ "$1" =~ ^[0-9]+$ ]]
}

if is_file "/etc/passwd"; then
    echo "файл существует"
fi

if is_number "42"; then
    echo "это число"
fi
```

### Рекурсия

```bash
# Факториал
factorial() {
    local n=$1
    if (( n <= 1 )); then
        echo 1
    else
        local sub
        sub=$(factorial $(( n - 1 )))
        echo $(( n * sub ))
    fi
}

echo "5! = $(factorial 5)"    # 120

# Обход директорий
walk_dir() {
    local dir="$1"
    local indent="${2:-}"

    for item in "$dir"/*; do
        echo "${indent}$(basename "$item")"
        if [[ -d "$item" ]]; then
            walk_dir "$item" "${indent}  "
        fi
    done
}

walk_dir /etc
```

### Функции как аргументы (callbacks)

```bash
# Передача имени функции как аргумента
apply() {
    local func="$1"
    shift
    "$func" "$@"             # вызов через имя
}

double() { echo $(( $1 * 2 )); }
square() { echo $(( $1 * $1 )); }

apply double 5              # 10
apply square 5              # 25

# Функция высшего порядка - map
map() {
    local func="$1"
    shift
    for item in "$@"; do
        "$func" "$item"
    done
}

map double 1 2 3 4 5        # 2 4 6 8 10
```

### Декораторы

```bash
# Обёртка вокруг функции (logging decorator)
log_call() {
    local func="$1"
    shift
    echo "[LOG] Вызов: $func $*" >&2
    "$func" "$@"
    local exit_code=$?
    echo "[LOG] Завершение: $func (код: $exit_code)" >&2
    return $exit_code
}

my_command() {
    echo "Выполняю работу..."
    return 0
}

log_call my_command arg1 arg2

# Мемоизация (кэширование результатов)
declare -A _memo_cache

memoize() {
    local func="$1"
    local key="$func:${*:2}"

    if [[ -v _memo_cache["$key"] ]]; then
        echo "${_memo_cache[$key]}"
        return
    fi

    local result
    result=$("$func" "${@:2}")
    _memo_cache["$key"]="$result"
    echo "$result"
}

slow_compute() {
    sleep 1
    echo $(( $1 * $1 ))
}

# Второй вызов мгновенный
memoize slow_compute 5      # ждёт 1 секунду
memoize slow_compute 5      # мгновенно из кэша
```

### FUNCNAME и call stack

```bash
# Стек вызовов
show_stack() {
    echo "Стек вызовов:"
    for i in "${!FUNCNAME[@]}"; do
        echo "  [$i] ${FUNCNAME[$i]} (${BASH_SOURCE[$i]}:${BASH_LINENO[$i-1]})"
    done
}

level3() { show_stack; }
level2() { level3; }
level1() { level2; }

level1
# Стек вызовов:
#   [0] show_stack (script.sh:3)
#   [1] level3 (script.sh:6)
#   [2] level2 (script.sh:7)
#   [3] level1 (script.sh:8)
#   [4] main (script.sh:10)
```

---

## Массивы - углублённо

### Индексированные массивы

```bash
# Объявление
declare -a fruits
fruits=("apple" "banana" "cherry" "date")

# Добавить элементы
fruits+=("elderberry")
fruits[10]="fig"            # разреженный массив!

# Обращение
echo "${fruits[0]}"         # apple
echo "${fruits[-1]}"        # последний элемент (bash 4.3+)
echo "${fruits[@]}"         # все элементы
echo "${!fruits[@]}"        # все индексы: 0 1 2 3 4 10
echo "${#fruits[@]}"        # количество элементов: 6

# Срез
echo "${fruits[@]:1:3}"     # banana cherry date (с индекса 1, длина 3)
echo "${fruits[@]: -2}"     # date elderberry (последние 2)

# Удаление
unset fruits[2]             # удалить элемент
unset fruits                # удалить весь массив
```

### Операции с массивами

```bash
arr=(10 5 8 3 9 1 7 2 6 4)

# Сортировка (через readarray)
readarray -t sorted < <(printf '%s\n' "${arr[@]}" | sort -n)
echo "${sorted[@]}"         # 1 2 3 4 5 6 7 8 9 10

# Сортировка строк
words=("banana" "apple" "cherry" "date")
readarray -t sorted_words < <(printf '%s\n' "${words[@]}" | sort)

# Уникальные элементы
arr=(1 2 2 3 3 3 4)
readarray -t unique < <(printf '%s\n' "${arr[@]}" | sort -u)
echo "${unique[@]}"         # 1 2 3 4

# Поиск элемента
contains() {
    local needle="$1"
    shift
    local item
    for item in "$@"; do
        [[ "$item" == "$needle" ]] && return 0
    done
    return 1
}

if contains "banana" "${fruits[@]}"; then
    echo "нашли banana"
fi

# Фильтрация
filter() {
    local predicate="$1"
    shift
    local result=()
    for item in "$@"; do
        if "$predicate" "$item"; then
            result+=("$item")
        fi
    done
    echo "${result[@]}"
}

is_long() { (( ${#1} > 5 )); }
long_fruits=($(filter is_long "${fruits[@]}"))
echo "${long_fruits[@]}"    # banana cherry elderberry

# Трансформация (map)
arr_map() {
    local func="$1"
    shift
    local result=()
    for item in "$@"; do
        result+=("$("$func" "$item")")
    done
    echo "${result[@]}"
}

to_upper() { echo "${1^^}"; }
upper=($(arr_map to_upper "${fruits[@]}"))
echo "${upper[@]}"          # APPLE BANANA CHERRY DATE
```

### Ассоциативные массивы

```bash
# Объявление - declare -A обязательно
declare -A config
config[host]="localhost"
config[port]="5432"
config[user]="postgres"
config[password]="secret"

# Или всё сразу
declare -A colors=(
    [red]="#FF0000"
    [green]="#00FF00"
    [blue]="#0000FF"
)

# Обращение
echo "${config[host]}"          # localhost
echo "${!config[@]}"            # все ключи
echo "${config[@]}"             # все значения
echo "${#config[@]}"            # количество пар

# Проверить наличие ключа
if [[ -v config[host] ]]; then
    echo "ключ host существует"
fi

# Удалить ключ
unset config[password]

# Перебор
for key in "${!config[@]}"; do
    echo "$key = ${config[$key]}"
done

# Перебор в отсортированном порядке
for key in $(echo "${!config[@]}" | tr ' ' '\n' | sort); do
    echo "$key = ${config[$key]}"
done
```

### Ассоциативный массив как база данных

```bash
# Сохранить данные пользователей
declare -A user_data

load_users() {
    while IFS=: read -r login _ uid gid _ home shell; do
        user_data["$login:uid"]="$uid"
        user_data["$login:home"]="$home"
        user_data["$login:shell"]="$shell"
    done < /etc/passwd
}

get_user_field() {
    local user="$1"
    local field="$2"
    echo "${user_data["$user:$field"]:-not found}"
}

load_users
echo "UID root: $(get_user_field root uid)"
echo "Home alice: $(get_user_field alice home)"
```

### Многомерные массивы (эмуляция)

```bash
# Bash не поддерживает многомерные массивы нативно
# Эмуляция через ключи

declare -A matrix

# Заполнить матрицу 3x3
for i in {0..2}; do
    for j in {0..2}; do
        matrix[$i,$j]=$(( i * 3 + j ))
    done
done

# Вывести матрицу
for i in {0..2}; do
    row=""
    for j in {0..2}; do
        row+="${matrix[$i,$j]} "
    done
    echo "$row"
done
# 0 1 2
# 3 4 5
# 6 7 8

# Вложенные массивы через JSON (с jq)
data='{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}'
mapfile -t names < <(echo "$data" | jq -r '.users[].name')
echo "${names[@]}"          # Alice Bob
```

### readarray / mapfile

```bash
# Загрузить файл в массив (каждая строка = элемент)
readarray -t lines < /etc/passwd
echo "Строк: ${#lines[@]}"
echo "Первая: ${lines[0]}"

# Загрузить вывод команды
readarray -t processes < <(ps aux | awk 'NR>1 {print $11}')

# Загрузить с разделителем
readarray -t -d ',' fields <<< "alice,30,admin,"
echo "${fields[@]}"

# mapfile - синоним readarray
mapfile -t hosts < /etc/hosts

# С индексом начала
mapfile -t -O 10 arr < file.txt    # начать с индекса 10
```

---

## Регулярные выражения

### =~ в [[ ]]

```bash
# Синтаксис: [[ string =~ pattern ]]
# Возвращает 0 (true) если совпадает

# Базовые паттерны
[[ "hello123" =~ [0-9]+ ]]      && echo "содержит цифры"
[[ "hello" =~ ^[a-z]+$ ]]       && echo "только строчные"
[[ "user@mail.com" =~ @ ]]      && echo "содержит @"

# BASH_REMATCH — результаты совпадения
str="Date: 2024-03-15"
if [[ "$str" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2}) ]]; then
    echo "Полное совпадение: ${BASH_REMATCH[0]}"   # 2024-03-15
    echo "Год:   ${BASH_REMATCH[1]}"               # 2024
    echo "Месяц: ${BASH_REMATCH[2]}"               # 03
    echo "День:  ${BASH_REMATCH[3]}"               # 15
fi
```

### Синтаксис регулярных выражений (ERE)

```bash
# Якоря
^           # начало строки
$           # конец строки
\b          # граница слова

# Классы символов
[abc]       # a, b или c
[^abc]      # не a, b и не c
[a-z]       # строчные буквы
[A-Z]       # заглавные буквы
[0-9]       # цифры
[a-zA-Z]    # любая буква
[a-zA-Z0-9] # буква или цифра

# Метасимволы
.           # любой символ кроме \n
\d          # цифра (не в bash =~, используй [0-9])
\w          # слово [a-zA-Z0-9_]
\s          # пробел [ \t\n]

# Квантификаторы
*           # 0 или больше
+           # 1 или больше
?           # 0 или 1 (опционально)
{n}         # ровно n раз
{n,}        # n или больше
{n,m}       # от n до m раз

# Группы и чередование
(abc)       # группа захвата
(a|b)       # a или b
(?:abc)     # группа без захвата (не в bash =~)
```

### Практические паттерны

```bash
# Валидация IPv4
is_valid_ip() {
    local ip="$1"
    local octet="(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    [[ "$ip" =~ ^${octet}\.${octet}\.${octet}\.${octet}$ ]]
}

is_valid_ip "192.168.1.1"   && echo "валидный IP"
is_valid_ip "256.0.0.1"     || echo "невалидный IP"
is_valid_ip "192.168.1"     || echo "невалидный IP"

# Валидация email (упрощённо)
is_valid_email() {
    [[ "$1" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]
}

is_valid_email "user@example.com"   && echo "валидный"
is_valid_email "not-an-email"       || echo "невалидный"

# Валидация номера порта
is_valid_port() {
    [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 ))
}

# Проверка версии (semver)
is_semver() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Извлечение чисел из строки
str="В файле 42 строки и 7 ошибок"
if [[ "$str" =~ ([0-9]+)\ строки ]]; then
    echo "Строк: ${BASH_REMATCH[1]}"    # 42
fi

# Проверка hex-цвета
is_hex_color() {
    [[ "$1" =~ ^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$ ]]
}

is_hex_color "#FF0000"  && echo "валидный"
is_hex_color "#GG0000"  || echo "невалидный"

# Парсинг URL
parse_url() {
    local url="$1"
    if [[ "$url" =~ ^(https?)://([^/:]+)(:([0-9]+))?(/.*)?$ ]]; then
        echo "Протокол: ${BASH_REMATCH[1]}"
        echo "Хост:     ${BASH_REMATCH[2]}"
        echo "Порт:     ${BASH_REMATCH[4]:-стандартный}"
        echo "Путь:     ${BASH_REMATCH[5]:-/}"
    fi
}

parse_url "https://example.com:8080/api/v1"
# Протокол: https
# Хост:     example.com
# Порт:     8080
# Путь:     /api/v1
```

---

## grep - поиск с regex

```bash
# Базовый поиск
grep "pattern" file.txt
grep "error" /var/log/syslog

# Флаги
grep -i "error" file.txt          # игнорировать регистр
grep -v "debug" file.txt          # инвертировать (не содержит)
grep -n "error" file.txt          # показать номера строк
grep -c "error" file.txt          # посчитать совпадения
grep -l "error" /var/log/*.log    # только имена файлов
grep -r "TODO" ./src/             # рекурсивный поиск
grep -w "port" file.txt           # целое слово
grep -A 3 "error" file.txt        # 3 строки после совпадения
grep -B 3 "error" file.txt        # 3 строки до
grep -C 3 "error" file.txt        # 3 строки до и после

# BRE (Basic RE) — по умолчанию
grep "^root" /etc/passwd
grep "bash$" /etc/passwd
grep "[0-9]\{3\}" file.txt        # BRE: фигурные скобки с backslash

# ERE (Extended RE) — grep -E или egrep
grep -E "error|warning" file.txt
grep -E "^[0-9]{4}-[0-9]{2}" log.txt
grep -E "(FAIL|ERROR|CRIT)" /var/log/syslog

# PCRE — grep -P (perl-совместимые, не везде есть)
grep -P "\d{4}-\d{2}-\d{2}" log.txt
grep -P "(?<=port=)\d+" config.txt    # lookbehind

# Полезные однострочники
grep -E "^[^#]" /etc/ssh/sshd_config  # только не комментарии
grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" access.log  # извлечь IP
grep -oE "\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b" file.txt  # email
```

---

## sed - замена и трансформация

```bash
# Базовая замена
sed 's/old/new/' file.txt           # первое вхождение в строке
sed 's/old/new/g' file.txt          # все вхождения
sed 's/old/new/gi' file.txt         # без учёта регистра

# Изменить файл на месте
sed -i 's/old/new/g' file.txt
sed -i.bak 's/old/new/g' file.txt   # с созданием бэкапа

# Адресация строк
sed '3s/old/new/' file.txt          # только 3-я строка
sed '1,5s/old/new/' file.txt        # строки 1-5
sed '/pattern/s/old/new/' file.txt  # строки с pattern

# Удаление строк
sed '3d' file.txt                   # удалить 3-ю строку
sed '/^#/d' file.txt                # удалить комментарии
sed '/^$/d' file.txt                # удалить пустые строки
sed '/pattern/d' file.txt           # удалить строки с pattern

# Вывод конкретных строк
sed -n '5,10p' file.txt             # строки 5-10
sed -n '/start/,/end/p' file.txt    # от start до end

# Группы захвата в sed
echo "2024-03-15" | sed 's/\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)/\3.\2.\1/'
# 15.03.2024

# ERE в sed
sed -E 's/([0-9]{4})-([0-9]{2})-([0-9]{2})/\3.\2.\1/' <<< "2024-03-15"
# 15.03.2024

# Многострочные выражения
sed -E 's/  +/ /g' file.txt         # несколько пробелов → один
sed 's/^[[:space:]]*//' file.txt    # убрать отступ слева
sed 's/[[:space:]]*$//' file.txt    # убрать пробелы справа

# Практические примеры
# Изменить порт в конфиге
sed -i 's/^Port .*/Port 2222/' /etc/ssh/sshd_config

# Закомментировать строку
sed -i 's/^PermitRootLogin/#PermitRootLogin/' /etc/ssh/sshd_config

# Раскомментировать строку
sed -i 's/^#Port/Port/' /etc/ssh/sshd_config
```

---

## awk - обработка текста

```bash
# Базовый синтаксис: awk 'pattern { action }' file

# Вывести колонки
awk '{print $1}' file.txt           # первая колонка
awk '{print $1, $3}' file.txt       # первая и третья
awk '{print NR, $0}' file.txt       # с номерами строк
awk '{print NF, $0}' file.txt       # количество полей

# Разделитель полей
awk -F: '{print $1}' /etc/passwd    # разделитель :
awk -F, '{print $2}' data.csv
awk 'BEGIN{FS=":"} {print $1}' /etc/passwd

# Условия
awk '$3 > 1000 {print $1}' /etc/passwd      # UID > 1000
awk '/bash$/ {print $1}' /etc/passwd        # строки с bash
awk '$1 ~ /^root/ {print}' /etc/passwd      # regex на поле

# BEGIN и END
awk 'BEGIN {print "=== Начало ==="} {print} END {print "=== Конец ==="}' file.txt

# Подсчёт
awk 'END {print NR}' file.txt               # количество строк
awk '{sum += $1} END {print sum}' nums.txt  # сумма первого поля

# Группировка и агрегация
awk -F: '{count[$7]++} END {for (shell in count) print count[shell], shell}' /etc/passwd \
    | sort -rn
# Количество пользователей по shell

# Извлечь процессы с высоким CPU
ps aux | awk 'NR>1 && $3>10 {printf "%-20s %s%%\n", $11, $3}'

# Обработка CSV
awk -F, 'NR>1 {
    sum += $3
    count++
}
END {
    print "Среднее:", sum/count
}' sales.csv
```

---

## Комплексные примеры

### Парсер конфиг-файла

```bash
#!/usr/bin/env bash
# Парсим INI-подобный конфиг

declare -A config

parse_config() {
    local file="$1"
    local section=""

    while IFS= read -r line; do
        # Пропустить пустые строки и комментарии
        [[ "$line" =~ ^[[:space:]]*(#|;|$) ]] && continue

        # Секция [section]
        if [[ "$line" =~ ^\[([^\]]+)\] ]]; then
            section="${BASH_REMATCH[1]}"
            continue
        fi

        # Ключ = значение
        if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
            local key="${BASH_REMATCH[1]// /}"    # убрать пробелы
            local val="${BASH_REMATCH[2]}"
            val="${val#"${val%%[![:space:]]*}"}"   # ltrim
            val="${val%"${val##*[![:space:]]}"}"   # rtrim

            if [[ -n "$section" ]]; then
                config["${section}.${key}"]="$val"
            else
                config["$key"]="$val"
            fi
        fi
    done < "$file"
}

# Тест
cat > /tmp/test.conf << 'EOF'
[database]
host = localhost
port = 5432
name = mydb

[server]
host = 0.0.0.0
port = 8080
EOF

parse_config /tmp/test.conf

echo "DB host: ${config[database.host]}"
echo "DB port: ${config[database.port]}"
echo "Server port: ${config[server.port]}"
```

### Валидатор входных данных

```bash
#!/usr/bin/env bash

# Библиотека валидации
validate_required() {
    local name="$1" val="$2"
    [[ -n "$val" ]] || { echo "Ошибка: $name обязательное поле" >&2; return 1; }
}

validate_integer() {
    local name="$1" val="$2"
    [[ "$val" =~ ^-?[0-9]+$ ]] || { echo "Ошибка: $name должно быть целым числом" >&2; return 1; }
}

validate_range() {
    local name="$1" val="$2" min="$3" max="$4"
    validate_integer "$name" "$val" || return 1
    (( val >= min && val <= max )) || { echo "Ошибка: $name должно быть от $min до $max" >&2; return 1; }
}

validate_email() {
    local name="$1" val="$2"
    [[ "$val" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] \
        || { echo "Ошибка: $name некорректный email" >&2; return 1; }
}

validate_url() {
    local name="$1" val="$2"
    [[ "$val" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$ ]] \
        || { echo "Ошибка: $name некорректный URL" >&2; return 1; }
}

validate_ip() {
    local name="$1" val="$2"
    local octet="(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    [[ "$val" =~ ^${octet}\.${octet}\.${octet}\.${octet}$ ]] \
        || { echo "Ошибка: $name некорректный IP адрес" >&2; return 1; }
}

# Использование
read -p "Email: " email
read -p "Порт: " port
read -p "IP: " ip

validate_required "email" "$email" || exit 1
validate_email "email" "$email" || exit 1
validate_range "порт" "$port" 1 65535 || exit 1
validate_ip "IP" "$ip" || exit 1

echo "Все данные валидны!"
```

### Обработка лог-файлов

```bash
#!/usr/bin/env bash
# Анализ nginx access.log

analyze_logs() {
    local logfile="$1"
    declare -A status_counts
    declare -A ip_counts
    local total=0

    # Паттерн nginx access log:
    # IP - - [дата] "метод путь протокол" статус байты
    local pattern='^([0-9.]+) .* "([A-Z]+) ([^ ]+) [^"]+" ([0-9]+) ([0-9]+)'

    while IFS= read -r line; do
        if [[ "$line" =~ $pattern ]]; then
            local ip="${BASH_REMATCH[1]}"
            local method="${BASH_REMATCH[2]}"
            local path="${BASH_REMATCH[3]}"
            local status="${BASH_REMATCH[4]}"
            local bytes="${BASH_REMATCH[5]}"

            ((total++))
            ((status_counts[$status]++))
            ((ip_counts[$ip]++))
        fi
    done < "$logfile"

    echo "=== Анализ: $logfile ==="
    echo "Всего запросов: $total"
    echo ""
    echo "Коды ответа:"
    for status in $(echo "${!status_counts[@]}" | tr ' ' '\n' | sort -n); do
        printf "  %s: %d\n" "$status" "${status_counts[$status]}"
    done
    echo ""
    echo "Топ-5 IP адресов:"
    for ip in "${!ip_counts[@]}"; do
        echo "${ip_counts[$ip]} $ip"
    done | sort -rn | head -5 | while read count ip; do
        printf "  %-20s %d запросов\n" "$ip" "$count"
    done
}

analyze_logs /var/log/nginx/access.log
```

### Шаблонизатор

```bash
#!/usr/bin/env bash
# Простой шаблонизатор — заменяет {{VAR}} на значения

render_template() {
    local template="$1"
    local output="$2"
    shift 2

    # Загружаем переменные из аргументов (KEY=VALUE)
    declare -A vars
    for pair in "$@"; do
        local key="${pair%%=*}"
        local val="${pair#*=}"
        vars["$key"]="$val"
    done

    local content
    content=$(<"$template")

    # Заменяем все {{VAR}} на значения
    for key in "${!vars[@]}"; do
        content="${content//\{\{${key}\}\}/${vars[$key]}}"
    done

    echo "$content" > "$output"
}

# Создать шаблон
cat > /tmp/nginx.conf.tpl << 'EOF'
server {
    listen {{PORT}};
    server_name {{DOMAIN}};
    root {{WEBROOT}};

    location / {
        proxy_pass http://{{BACKEND_HOST}}:{{BACKEND_PORT}};
    }
}
EOF

# Рендерить
render_template \
    /tmp/nginx.conf.tpl \
    /tmp/nginx.conf \
    "PORT=80" \
    "DOMAIN=example.com" \
    "WEBROOT=/var/www/html" \
    "BACKEND_HOST=127.0.0.1" \
    "BACKEND_PORT=8080"

cat /tmp/nginx.conf
```

---

## Шпаргалка

```bash
# Функции
func() { local x="$1"; echo "$x"; }
result=$(func arg)                      # захват вывода
[[ "${FUNCNAME[0]}" == "main" ]]        # имя текущей функции
declare -n ref=$varname                 # nameref (ссылка)

# Массивы индексированные
arr=(a b c)
arr+=("d")                              # добавить
echo "${arr[@]}"                        # все элементы
echo "${arr[0]}"                        # по индексу
echo "${arr[-1]}"                       # последний
echo "${#arr[@]}"                       # количество
echo "${!arr[@]}"                       # индексы
echo "${arr[@]:1:2}"                    # срез
readarray -t arr < file                 # загрузить из файла

# Ассоциативные массивы
declare -A map
map[key]="val"
echo "${map[key]}"
[[ -v map[key] ]]                       # проверить наличие ключа
echo "${!map[@]}"                       # все ключи

# Regex в bash
[[ "$str" =~ pattern ]]                 # проверка
[[ "$str" =~ (group) ]]                 # с захватом
echo "${BASH_REMATCH[0]}"               # полное совпадение
echo "${BASH_REMATCH[1]}"               # первая группа

# grep
grep -E "pat1|pat2" file                # ERE
grep -oE "pattern" file                 # только совпадение
grep -P "\d+" file                      # PCRE

# sed
sed 's/old/new/g' file                  # замена
sed -i.bak 's/old/new/g' file          # на месте с бэкапом
sed -E 's/(group)/\1/' file            # ERE с группой
sed '/pattern/d' file                   # удалить строки

# awk
awk '{print $1}' file                   # первое поле
awk -F: '{print $1}' file              # с разделителем
awk '/pat/ {print}' file               # с фильтром
awk '{sum+=$1} END{print sum}' file    # агрегация
```

---

## Ссылки

- [Bash Arrays](https://www.gnu.org/software/bash/manual/bash.html#Arrays) - официальная документация
- [Regex101](https://regex101.com/) - тестирование регулярных выражений
- [grep manual](https://www.gnu.org/software/grep/manual/grep.html) - все флаги grep
- [sed manual](https://www.gnu.org/software/sed/manual/sed.html) - документация sed
- [awk manual](https://www.gnu.org/software/gawk/manual/gawk.html) - руководство по awk
