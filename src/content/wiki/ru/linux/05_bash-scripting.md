# Bash Scripting — переменные, циклы, условия

Bash (Bourne Again Shell) — командный интерпретатор и язык сценариев, стандартный для большинства Linux-систем. Скрипты автоматизируют рутинные задачи, развёртывание, резервное копирование и администрирование.

---

## Первый скрипт

```bash
#!/usr/bin/env bash
# Shebang — указывает интерпретатор
# Комментарий начинается с #

echo "Hello, World!"
```

```bash
# Создать и запустить
nano hello.sh
chmod +x hello.sh
./hello.sh

# Или без chmod
bash hello.sh
```

### Лучшие практики в начале скрипта

```bash
#!/usr/bin/env bash
set -e          # выйти при ошибке (exit on error)
set -u          # ошибка при использовании необъявленной переменной
set -o pipefail # ошибка если падает команда в пайпе
set -x          # отладка: выводить каждую команду перед выполнением

# Короткая форма
set -euo pipefail
```

---

## Переменные

### Объявление и использование

```bash
# Присваивание — без пробелов вокруг =
name="Alice"
age=30
path=/home/alice

# Использование — $ перед именем
echo $name
echo "Hello, $name"
echo "Age: ${age}"        # фигурные скобки — явное ограничение имени

# Неправильно (пробелы создают ошибку)
name = "Alice"   # ошибка!
```

### Кавычки

```bash
name="Alice Smith"

echo $name          # Alice Smith (работает, но опасно)
echo "$name"        # Alice Smith (правильно, двойные кавычки)
echo '$name'        # $name (одинарные — без подстановки)
echo "${name}"      # Alice Smith (явные границы переменной)

# Пример опасности без кавычек
file="my file.txt"
rm $file            # попытается удалить "my" и "file.txt" — ошибка!
rm "$file"          # удалит "my file.txt" — правильно
```

### Специальные переменные

```bash
$0          # имя скрипта
$1, $2 ...  # аргументы командной строки
$#          # количество аргументов
$@          # все аргументы (как отдельные элементы)
$*          # все аргументы (как одна строка)
$?          # код возврата последней команды (0 = успех)
$$          # PID текущего процесса (скрипта)
$!          # PID последнего фонового процесса
$_          # последний аргумент предыдущей команды

# Пример использования аргументов
#!/usr/bin/env bash
echo "Скрипт: $0"
echo "Первый аргумент: $1"
echo "Второй аргумент: $2"
echo "Всего аргументов: $#"
echo "Все аргументы: $@"
```

```bash
# Запуск: ./script.sh foo bar baz
# Скрипт: ./script.sh
# Первый аргумент: foo
# Второй аргумент: bar
# Всего аргументов: 3
# Все аргументы: foo bar baz
```

### Подстановка команд

```bash
# Вывод команды → значение переменной
date_now=$(date +%Y-%m-%d)
user_count=$(wc -l < /etc/passwd)
hostname=$(hostname -f)

echo "Дата: $date_now"
echo "Пользователей: $user_count"

# Устаревший синтаксис (избегай)
date_now=`date +%Y-%m-%d`
```

### Арифметика

```bash
a=10
b=3

# Арифметическое раскрытие
echo $((a + b))     # 13
echo $((a - b))     # 7
echo $((a * b))     # 30
echo $((a / b))     # 3  (целочисленное деление)
echo $((a % b))     # 1  (остаток)
echo $((a ** b))    # 1000 (возведение в степень)

# Присваивание с вычислением
result=$((a * b + 5))
((result++))        # инкремент
((result--))        # декремент
((result += 10))    # сложение с присваиванием

# Дробные числа — через bc
echo "scale=2; 10 / 3" | bc    # 3.33
pi=$(echo "scale=10; 4*a(1)" | bc -l)
```

### Строковые операции

```bash
str="Hello, World!"

# Длина строки
echo ${#str}                    # 13

# Срез (подстрока)
echo ${str:0:5}                 # Hello
echo ${str:7}                   # World!
echo ${str: -6}                 # orld! (с конца, пробел обязателен)

# Замена
echo ${str/World/Linux}         # Hello, Linux!  (первое вхождение)
echo ${str//l/L}                # HeLLo, WorLd!  (все вхождения)

# Удаление паттерна
file="archive.tar.gz"
echo ${file%.gz}                # archive.tar    (удалить .gz с конца)
echo ${file%%.*}                # archive        (удалить всё от первой точки)
echo ${file#*.}                 # tar.gz         (удалить до первой точки)
echo ${file##*.}                # gz             (удалить до последней точки)

# Регистр (bash 4+)
echo ${str,,}                   # hello, world!  (нижний регистр)
echo ${str^^}                   # HELLO, WORLD!  (верхний регистр)
echo ${str^}                    # Hello, world!  (первая заглавная)

# Значение по умолчанию
echo ${name:-"Unknown"}         # Unknown если name пустая или не объявлена
echo ${name:="Default"}         # Default и присваивает переменной
echo ${name:?"Error: not set"}  # ошибка если name не задана
echo ${name:+"has value"}       # "has value" если name задана
```

---

## Массивы

```bash
# Индексированный массив
fruits=("apple" "banana" "cherry")
fruits[3]="date"

echo ${fruits[0]}               # apple
echo ${fruits[@]}               # все элементы
echo ${#fruits[@]}              # количество элементов
echo ${!fruits[@]}              # индексы

# Срез массива
echo ${fruits[@]:1:2}           # banana cherry (с 1, длина 2)

# Добавить элемент
fruits+=("elderberry")

# Удалить элемент
unset fruits[1]

# Перебор
for fruit in "${fruits[@]}"; do
    echo "$fruit"
done

# Ассоциативный массив (bash 4+)
declare -A user
user[name]="Alice"
user[age]=30
user[role]="admin"

echo ${user[name]}              # Alice
echo ${!user[@]}                # все ключи
echo ${user[@]}                 # все значения

for key in "${!user[@]}"; do
    echo "$key = ${user[$key]}"
done
```

---

## Условия

### if / elif / else

```bash
if [ условие ]; then
    команды
elif [ другое_условие ]; then
    команды
else
    команды
fi
```

```bash
age=25

if [ $age -lt 18 ]; then
    echo "несовершеннолетний"
elif [ $age -lt 65 ]; then
    echo "взрослый"
else
    echo "пенсионер"
fi
```

### Операторы сравнения

#### Числа

```bash
[ $a -eq $b ]    # a == b  (equal)
[ $a -ne $b ]    # a != b  (not equal)
[ $a -lt $b ]    # a < b   (less than)
[ $a -le $b ]    # a <= b  (less or equal)
[ $a -gt $b ]    # a > b   (greater than)
[ $a -ge $b ]    # a >= b  (greater or equal)
```

#### Строки

```bash
[ "$a" = "$b" ]     # строки равны
[ "$a" == "$b" ]    # то же самое (bash)
[ "$a" != "$b" ]    # строки не равны
[ -z "$a" ]         # строка пустая (zero length)
[ -n "$a" ]         # строка непустая (non-zero)
[ "$a" < "$b" ]     # лексикографически меньше
```

#### Файлы и директории

```bash
[ -e "$path" ]      # существует (exist)
[ -f "$path" ]      # является файлом (file)
[ -d "$path" ]      # является директорией (directory)
[ -L "$path" ]      # является симлинком (link)
[ -r "$path" ]      # доступен для чтения (readable)
[ -w "$path" ]      # доступен для записи (writable)
[ -x "$path" ]      # доступен для выполнения (executable)
[ -s "$path" ]      # существует и не пустой (size > 0)
[ -p "$path" ]      # является именованным каналом (pipe)
[ "$a" -nt "$b" ]   # a новее b (newer than)
[ "$a" -ot "$b" ]   # a старее b (older than)
```

#### Логические операторы

```bash
[ условие1 ] && [ условие2 ]   # AND
[ условие1 ] || [ условие2 ]   # OR
! [ условие ]                   # NOT

# Внутри [ ]
[ -f "$f" -a -r "$f" ]         # AND внутри скобок
[ -f "$f" -o -d "$f" ]         # OR внутри скобок

# [[ ]] — расширенные условия (bash, не POSIX)
[[ $a == "foo" && $b != "bar" ]]
[[ $str =~ ^[0-9]+$ ]]         # regex matching
[[ $str == *.txt ]]            # glob matching
```

### [ ] vs [[ ]] vs (( ))

```bash
# [ ]   — POSIX совместимый, осторожнее с кавычками
# [[ ]] — bash-специфичный, безопаснее, поддерживает regex и glob
# (( )) — только для арифметики

# Рекомендуется [[ ]] для bash-скриптов
if [[ -f "$file" && -r "$file" ]]; then
    cat "$file"
fi

# (( )) для чисел
if (( a > 10 && b < 20 )); then
    echo "в диапазоне"
fi
```

### case

```bash
read -p "Выбери ОС: " os

case "$os" in
    ubuntu|debian)
        echo "Debian-based"
        apt update
        ;;
    centos|rhel|fedora)
        echo "Red Hat-based"
        yum update
        ;;
    arch*)
        echo "Arch-based"
        pacman -Syu
        ;;
    *)
        echo "Неизвестная ОС: $os"
        exit 1
        ;;
esac
```

---

## Циклы

### for — перебор элементов

```bash
# Перебор списка
for name in Alice Bob Carol; do
    echo "Привет, $name!"
done

# Перебор файлов
for file in /var/log/*.log; do
    echo "Обрабатываю: $file"
    wc -l "$file"
done

# Числовой диапазон
for i in {1..10}; do
    echo "Итерация $i"
done

# С шагом
for i in {0..100..10}; do
    echo "$i"
done

# C-стиль
for ((i=0; i<10; i++)); do
    echo "i = $i"
done

# Перебор массива
fruits=("apple" "banana" "cherry")
for fruit in "${fruits[@]}"; do
    echo "$fruit"
done

# Перебор строк файла
for line in $(cat /etc/hosts); do
    echo "$line"
done
# Лучше — while read (см. ниже)
```

### while — цикл с условием

```bash
# Базовый while
count=0
while [ $count -lt 5 ]; do
    echo "count = $count"
    ((count++))
done

# Читать файл построчно (правильный способ)
while IFS= read -r line; do
    echo "$line"
done < /etc/passwd

# Читать вывод команды
while IFS= read -r line; do
    echo "Пользователь: $line"
done < <(getent passwd | grep "/bin/bash")

# Бесконечный цикл
while true; do
    echo "Работаю..."
    sleep 10
done

# Читать до EOF
while IFS=',' read -r name age city; do
    echo "Имя: $name, Возраст: $age, Город: $city"
done < users.csv
```

### until — цикл до истины

```bash
# Противоположность while — выполняется пока условие ЛОЖНО
count=0
until [ $count -ge 5 ]; do
    echo "count = $count"
    ((count++))
done

# Ждать пока сервис не запустится
until curl -s http://localhost:8080/health > /dev/null; do
    echo "Жду сервис..."
    sleep 2
done
echo "Сервис готов!"
```

### Управление циклами

```bash
# break — выйти из цикла
for i in {1..10}; do
    if [ $i -eq 5 ]; then
        break
    fi
    echo "$i"
done

# continue — пропустить итерацию
for i in {1..10}; do
    if (( i % 2 == 0 )); then
        continue         # пропустить чётные
    fi
    echo "$i"            # выведет только нечётные
done

# break/continue с уровнем (вложенные циклы)
for i in {1..3}; do
    for j in {1..3}; do
        if (( i == 2 && j == 2 )); then
            break 2      # выйти из ОБОИХ циклов
        fi
        echo "$i $j"
    done
done
```

---

## Функции

```bash
# Объявление функции
greet() {
    echo "Привет, $1!"          # $1 — первый аргумент функции
}

# Вызов
greet "Alice"
greet "World"

# Функция с возвращаемым значением
get_user_home() {
    local user="$1"             # local — переменная видна только внутри функции
    local home
    home=$(getent passwd "$user" | cut -d: -f6)
    echo "$home"                # "возврат" через stdout
}

home=$(get_user_home "alice")
echo "Домашняя директория: $home"

# Код возврата функции
is_root() {
    [ "$(id -u)" -eq 0 ]        # 0 = успех = true
}

if is_root; then
    echo "Запущен от root"
else
    echo "Не root"
fi

# Функция с локальными переменными
create_backup() {
    local src="$1"
    local dst="$2"
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local backup="${dst}/backup_${timestamp}.tar.gz"

    tar -czf "$backup" "$src"
    echo "$backup"
}

backup_path=$(create_backup /etc /tmp)
echo "Бэкап создан: $backup_path"
```

---

## Ввод и вывод

```bash
# read — чтение ввода
read -p "Введи имя: " name
read -s -p "Введи пароль: " password   # -s = скрытый ввод
echo ""                                 # новая строка после скрытого ввода
read -t 10 -p "У тебя 10 секунд: " answer  # таймаут

# read нескольких значений
read -p "Введи имя и возраст: " name age
echo "Имя: $name, Возраст: $age"

# Перенаправление вывода
echo "ошибка" >&2              # в stderr
echo "лог" >> /var/log/my.log  # дозапись в файл

# heredoc
cat << 'EOF'
Это многострочный
текст без подстановки переменных
EOF

cat << EOF
Имя: $name
Дата: $(date)
EOF

# Запись heredoc в файл
cat > /etc/myapp/config.conf << EOF
host=localhost
port=8080
user=$name
EOF
```

---

## Обработка ошибок

```bash
# Проверка кода возврата
if ! command -v git &>/dev/null; then
    echo "Ошибка: git не установлен" >&2
    exit 1
fi

# trap — перехват сигналов и ошибок
cleanup() {
    echo "Очистка временных файлов..."
    rm -f /tmp/myscript_*
}

trap cleanup EXIT              # выполнить при выходе
trap cleanup INT TERM          # выполнить при Ctrl+C или kill

# Обработка ошибок с exit кодами
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

some_command > "$TMPFILE" || {
    echo "Команда завершилась с ошибкой" >&2
    exit 1
}

# Функция для вывода ошибок
error() {
    echo "[ERROR] $*" >&2
    exit 1
}

warn() {
    echo "[WARN] $*" >&2
}

info() {
    echo "[INFO] $*"
}

# Использование
[ -f "$config" ] || error "Конфиг не найден: $config"
```

---

## Полезные паттерны

### Проверка аргументов

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Использование: $0 [опции] <файл>"
    echo ""
    echo "Опции:"
    echo "  -h, --help     показать эту справку"
    echo "  -v, --verbose  подробный вывод"
    echo "  -o DIR         выходная директория"
    exit 0
}

verbose=false
output_dir="."

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage ;;
        -v|--verbose) verbose=true ;;
        -o) output_dir="$2"; shift ;;
        -*) echo "Неизвестный флаг: $1" >&2; exit 1 ;;
        *) input_file="$1" ;;
    esac
    shift
done

[ -z "${input_file:-}" ] && { echo "Ошибка: укажи файл" >&2; exit 1; }
[ -f "$input_file" ] || { echo "Файл не найден: $input_file" >&2; exit 1; }
```

### Логирование

```bash
LOG_FILE="/var/log/myscript.log"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

log INFO "Скрипт запущен"
log WARN "Предупреждение"
log ERROR "Что-то пошло не так"
```

### Блокировка (один экземпляр)

```bash
LOCKFILE="/tmp/myscript.lock"

if [ -e "$LOCKFILE" ]; then
    echo "Скрипт уже запущен (PID: $(cat $LOCKFILE))" >&2
    exit 1
fi

echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT
```

### Прогресс-бар

```bash
progress() {
    local current=$1
    local total=$2
    local width=40
    local percent=$(( current * 100 / total ))
    local filled=$(( current * width / total ))
    local bar=$(printf "%${filled}s" | tr ' ' '█')
    local empty=$(printf "%$(( width - filled ))s" | tr ' ' '░')
    printf "\r[%s%s] %3d%%" "$bar" "$empty" "$percent"
}

total=100
for i in $(seq 1 $total); do
    progress $i $total
    sleep 0.05
done
echo ""
```

### Параллельное выполнение

```bash
# Запустить несколько задач параллельно
process_file() {
    local file="$1"
    echo "Обрабатываю $file"
    sleep 1  # имитация работы
}

export -f process_file          # экспортировать функцию для parallel/xargs

# С xargs
find /data -name "*.log" | xargs -P 4 -I {} bash -c 'process_file "$@"' _ {}

# С GNU parallel
find /data -name "*.log" | parallel -j 4 process_file {}

# Вручную с wait
for file in /data/*.log; do
    process_file "$file" &
done
wait        # ждать все фоновые задачи
echo "Все задачи завершены"
```

---

## Отладка

```bash
# Режим отладки: печатает каждую команду
bash -x script.sh

# Включить/выключить внутри скрипта
set -x      # включить трассировку
set +x      # выключить трассировку

# Только для части скрипта
set -x
критическая_функция
set +x

# Режим проверки без выполнения
bash -n script.sh

# Подробный режим (echo каждой строки)
bash -v script.sh

# shellcheck — статический анализатор bash
apt install shellcheck
shellcheck script.sh
```

---

## Шпаргалка

```bash
# Переменные
var="value"         # объявление
echo "$var"         # использование
echo "${var}text"   # явные границы
${var:-default}     # значение по умолчанию
${#var}             # длина строки
${var/old/new}      # замена

# Условия
[[ -f "$f" ]]       # файл существует
[[ -d "$d" ]]       # директория существует
[[ -z "$s" ]]       # строка пустая
[[ -n "$s" ]]       # строка непустая
[[ $a == $b ]]      # строки равны
(( a > b ))         # числовое сравнение

# Циклы
for i in {1..10}; do ... done
for f in *.txt; do ... done
while read -r line; do ... done < file
until [[ condition ]]; do ... done

# Функции
func() { local var="$1"; echo "$var"; }
result=$(func arg)

# Вывод ошибок
echo "error" >&2
exit 1
```

---

## Ссылки

- [Bash Manual](https://www.gnu.org/software/bash/manual/) — официальная документация
- [Bash Hackers Wiki](https://wiki.bash-hackers.org/) — подробный справочник
- [ShellCheck](https://www.shellcheck.net/) — онлайн-анализатор скриптов
- [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html) — стайлгайд
