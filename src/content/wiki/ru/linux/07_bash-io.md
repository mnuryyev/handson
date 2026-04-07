# Bash Scripting — обработка файлов, stdin/stdout/stderr

Потоки ввода-вывода и работа с файлами — основа любого серьёзного скрипта. Понимание того, как данные текут между командами, файлами и процессами, открывает полную мощь Unix-философии.

---

## Файловые дескрипторы

Каждый процесс в Linux получает три стандартных потока:

| FD | Имя | Обозначение | Описание |
|----|-----|-------------|----------|
| `0` | stdin | Стандартный ввод | Откуда читает программа |
| `1` | stdout | Стандартный вывод | Куда пишет нормальный вывод |
| `2` | stderr | Стандартный вывод ошибок | Куда пишет ошибки |

```bash
# Визуализация
#
#          ┌─────────────┐
# stdin  ──►             ├──► stdout
#    [0]   │   процесс   │         [1]
# stderr ◄─┤             │
#    [2]   └─────────────┘
#

# Проверить открытые дескрипторы текущего shell
ls -la /proc/$$/fd
# lrwx------ 0 -> /dev/pts/0   (stdin  — терминал)
# lrwx------ 1 -> /dev/pts/0   (stdout — терминал)
# lrwx------ 2 -> /dev/pts/0   (stderr — терминал)
```

---

## Перенаправление вывода

```bash
# > — перезаписать файл
echo "hello" > file.txt

# >> — дозапись в конец файла
echo "world" >> file.txt

# Перезаписать несколькими строками
cat > file.txt << 'EOF'
строка 1
строка 2
EOF

# Перенаправить stderr
command 2> error.log

# Перенаправить оба потока в один файл
command > output.log 2>&1
command &> output.log         # короткий синтаксис (bash)

# stdout в файл, stderr в другой файл
command > out.log 2> err.log

# Выбросить вывод
command > /dev/null
command 2> /dev/null
command &> /dev/null

# stdout в файл и одновременно на экран
command | tee output.log
command | tee -a output.log   # tee с дозаписью
```

### Порядок перенаправлений важен

```bash
# НЕПРАВИЛЬНО — stderr не попадает в файл
command 2>&1 > file.txt
# Объяснение: сначала 2>&1 (stderr → текущий stdout = терминал),
#             потом > file.txt (stdout → файл, но stderr уже на терминале)

# ПРАВИЛЬНО — оба потока в файл
command > file.txt 2>&1
# Объяснение: сначала > file.txt (stdout → файл),
#             потом 2>&1 (stderr → текущий stdout = файл)
```

---

## Перенаправление ввода

```bash
# < — читать из файла вместо stdin
command < input.txt
sort < unsorted.txt
wc -l < /etc/passwd

# Передать строку как stdin (here-string)
grep "root" <<< "/etc/passwd содержит root"
base64 <<< "hello world"
read var <<< "значение"

# Heredoc — многострочный ввод
cat << 'EOF'
Эта строка: $HOME не будет раскрыта
EOF

cat << EOF
Эта строка: $HOME будет раскрыта — $HOME
EOF

# Heredoc с отступами (<<-)
if true; then
    cat <<- EOF
        Отступы табами убираются
        но только табы, не пробелы
    EOF
fi

# Heredoc в переменную
config=$(cat << EOF
host=localhost
port=8080
EOF
)
```

---

## Пайпы (каналы)

```bash
# | — stdout одной команды → stdin следующей
cat file.txt | grep "error"
ps aux | grep nginx | grep -v grep

# Пайп сохраняет только stdout (не stderr)
command1 | command2          # только stdout1 → stdin2
command1 2>&1 | command2     # stdout1 + stderr1 → stdin2

# Именованные каналы (FIFO)
mkfifo /tmp/mypipe
command1 > /tmp/mypipe &     # пишет в канал (в фоне)
command2 < /tmp/mypipe       # читает из канала
rm /tmp/mypipe

# Подстановка процессов — команда как файл
diff <(ls dir1) <(ls dir2)             # сравнить содержимое директорий
comm <(sort file1) <(sort file2)       # общие/уникальные строки
wc -l <(find . -name "*.py")           # посчитать файлы
while read line; do
    echo "$line"
done < <(find . -name "*.log")         # читать вывод find в while
```

### Код возврата пайпа

```bash
# По умолчанию — код возврата последней команды
false | true
echo $?    # 0 (true — последняя)

# pipefail — ошибка если любая команда в пайпе упала
set -o pipefail
false | true
echo $?    # 1

# PIPESTATUS — коды возврата каждой команды в пайпе
cat file | grep pattern | sort
echo "${PIPESTATUS[@]}"    # 0 0 0  (или где-то 1 если упало)
echo "${PIPESTATUS[0]}"    # код возврата cat
echo "${PIPESTATUS[1]}"    # код возврата grep
```

---

## Чтение файлов

### Построчное чтение

```bash
# Правильный способ — while + read
while IFS= read -r line; do
    echo "$line"
done < file.txt

# Разобрать поля в строке
while IFS=: read -r user _ uid gid _ home shell; do
    echo "User: $user, UID: $uid, Shell: $shell"
done < /etc/passwd

# Читать из вывода команды
while IFS= read -r line; do
    process "$line"
done < <(find . -name "*.log")

# Читать с номером строки
lineno=0
while IFS= read -r line; do
    ((lineno++))
    echo "$lineno: $line"
done < file.txt

# Пропустить первую строку (заголовок CSV)
{
    read header     # прочитать и отбросить заголовок
    while IFS=, read -r name age city; do
        echo "Имя: $name, Возраст: $age"
    done
} < data.csv
```

> ⚠️ Не используй `for line in $(cat file)` — ломается на пробелах и спецсимволах.

```bash
# ПЛОХО — разбивает по словам, не строкам
for line in $(cat file.txt); do
    echo "$line"   # слова, а не строки!
done

# ХОРОШО
while IFS= read -r line; do
    echo "$line"
done < file.txt
```

### Чтение в массив

```bash
# Каждая строка — элемент массива
readarray -t lines < file.txt
mapfile -t lines < file.txt    # синоним

echo "Строк: ${#lines[@]}"
echo "Первая: ${lines[0]}"
echo "Последняя: ${lines[-1]}"

for line in "${lines[@]}"; do
    echo "$line"
done

# Из вывода команды
readarray -t users < <(awk -F: '$3 >= 1000 {print $1}' /etc/passwd)
```

### Чтение бинарных данных

```bash
# xxd — hex dump
xxd file.bin | head
xxd -p file.bin              # только hex, без адресов
xxd -r hex.txt > file.bin    # обратная конвертация

# od — octal dump
od -c file.bin               # символьный вывод
od -x file.bin               # hex
od -A x -t x1z file.bin      # как xxd

# Чтение фиксированного количества байт
dd if=file.bin bs=1 count=4 2>/dev/null | xxd
head -c 4 file.bin | xxd
```

---

## Запись в файлы

```bash
# Перезаписать
echo "содержимое" > file.txt
printf "строка 1\nстрока 2\n" > file.txt

# Дозапись
echo "ещё строка" >> file.txt

# Записать несколько строк
cat > config.txt << 'EOF'
[server]
host = localhost
port = 8080
EOF

# Через printf (лучше для форматирования)
printf "%-10s %5d\n" "alice" 1001 >> users.txt

# Атомарная запись (через временный файл)
tmpfile=$(mktemp)
generate_content > "$tmpfile"
mv "$tmpfile" /etc/config    # атомарная операция

# Запись в несколько файлов через tee
echo "данные" | tee file1.txt file2.txt file3.txt > /dev/null

# Запись от root через sudo tee
echo "127.0.0.1 myhost" | sudo tee -a /etc/hosts > /dev/null
```

---

## Пользовательские файловые дескрипторы

```bash
# Открыть файл на дескрипторе 3
exec 3< input.txt         # открыть для чтения
exec 3> output.txt        # открыть для записи
exec 3>> output.txt       # открыть для дозаписи
exec 3<> file.txt         # открыть для чтения и записи

# Читать из дескриптора 3
while IFS= read -r line <&3; do
    echo "$line"
done

read -r line <&3           # прочитать одну строку

# Писать в дескриптор 3
echo "данные" >&3

# Закрыть дескриптор
exec 3<&-                  # закрыть вход
exec 3>&-                  # закрыть выход

# Сохранить и восстановить stdout
exec 4>&1                  # сохранить текущий stdout в fd4
exec 1> logfile.txt        # перенаправить stdout в файл
echo "это в файл"
exec 1>&4                  # восстановить stdout
exec 4>&-                  # закрыть fd4
echo "это на экран"

# Открыть несколько файлов одновременно
exec 3< file1.txt
exec 4< file2.txt

while IFS= read -r line1 <&3 && IFS= read -r line2 <&4; do
    echo "Файл1: $line1"
    echo "Файл2: $line2"
done

exec 3<&- 4<&-
```

---

## Управление stderr в скриптах

```bash
# Писать ошибки в stderr
error() {
    echo "[ERROR] $*" >&2
}

warn() {
    echo "[WARN]  $*" >&2
}

info() {
    echo "[INFO]  $*"
}

# Разделить stdout и stderr при запуске скрипта
./script.sh > output.log 2> errors.log

# Показать stderr на экране и сохранить stdout
./script.sh 2>&1 1>output.log | grep "ERROR"
# Объяснение: 2>&1 → stderr идёт туда же, куда сейчас stdout (на экран)
#             1>output.log → stdout перенаправляется в файл
#             | grep → получает stderr (теперь он на "экране" = stdout пайпа)

# Подавить только ошибки
command 2>/dev/null

# Показать только ошибки
command >/dev/null

# Поменять stdout и stderr местами
command 3>&1 1>&2 2>&3 3>&-
```

---

## find — поиск файлов

```bash
# Базовый поиск
find /path -name "*.txt"
find . -name "*.log" -type f
find /etc -type d -name "*.d"

# По типу
find . -type f              # файлы
find . -type d              # директории
find . -type l              # симлинки

# По размеру
find . -size +10M           # больше 10MB
find . -size -1k            # меньше 1KB
find . -size 100c           # ровно 100 байт
find . -empty               # пустые файлы/директории

# По времени
find . -mtime -7            # изменены за 7 дней
find . -mtime +30           # изменены более 30 дней назад
find . -newer reference.txt # новее чем reference.txt
find . -mmin -60            # изменены за последний час

# По правам и владельцу
find . -user alice
find . -group developers
find . -perm 644
find . -perm -u+x           # с битом выполнения для владельца
find . -perm /o+w           # world-writable (опасно!)

# Действия с найденными файлами
find . -name "*.tmp" -delete
find . -name "*.log" -exec gzip {} \;
find . -name "*.py" -exec chmod 644 {} +      # + быстрее чем \;
find . -type d -exec chmod 755 {} +

# Исключить директории
find . -path ./node_modules -prune -o -name "*.js" -print
find . -not -path "*/\.*"   # исключить скрытые файлы

# Комплексные условия
find . -type f \( -name "*.jpg" -o -name "*.png" \)
find . -type f -name "*.log" -size +1M -mtime +30

# xargs — передать список в команду
find . -name "*.txt" | xargs grep "error"
find . -name "*.txt" -print0 | xargs -0 grep "error"  # безопасно для имён с пробелами
find . -name "*.log" | xargs -P 4 -I {} gzip {}       # параллельно
```

---

## Операции с файлами и директориями

### Создание и удаление

```bash
# Создать файл
touch file.txt
touch -t 202401150930 file.txt    # с конкретной датой

# Создать директорию
mkdir mydir
mkdir -p /deep/nested/path        # создать всю цепочку

# Удалить
rm file.txt
rm -r directory/                  # рекурсивно
rm -f file.txt                    # без подтверждения
rm -rf directory/                 # ⚠️ опасно — без подтверждения

# Безопасное удаление
rm -i *.txt                       # интерактивное подтверждение
ls *.txt; rm *.txt                 # сначала посмотреть, потом удалить
```

### Копирование и перемещение

```bash
# cp — копирование
cp src.txt dst.txt
cp -r srcdir/ dstdir/
cp -a srcdir/ dstdir/             # архивный режим (сохраняет права, время)
cp -u src dst                     # только если src новее
cp -v src dst                     # verbose
cp --backup=numbered file.txt dst/  # с нумерованными бэкапами

# mv — перемещение/переименование
mv old.txt new.txt
mv file.txt /other/dir/
mv -i src dst                     # спрашивать при перезаписи
mv -u src dst                     # только если src новее

# rsync — синхронизация
rsync -av src/ dst/               # архивный режим + verbose
rsync -avz src/ user@host:dst/    # с сжатием через SSH
rsync --delete src/ dst/          # удалять лишнее в dst
rsync -n src/ dst/                # dry run — что будет сделано
```

### Ссылки

```bash
# Жёсткая ссылка — тот же inode
ln original.txt hardlink.txt
ls -li original.txt hardlink.txt  # одинаковый inode

# Символическая ссылка
ln -s /path/to/original symlink
ln -sf target symlink             # перезаписать если существует
ls -la symlink                    # symlink -> /path/to/original

# Найти все жёсткие ссылки на файл
find . -inum $(stat -c %i file.txt)
```

---

## stat и метаданные файлов

```bash
stat file.txt
# File: file.txt
# Size: 1234      Blocks: 8          IO Block: 4096   regular file
# Device: fd01h   Inode: 131073      Links: 1
# Access: (0644/-rw-r--r--)  Uid: (1001/alice)  Gid: (1001/alice)
# Access: 2024-03-15 10:22:30
# Modify: 2024-03-14 08:15:00
# Change: 2024-03-14 08:15:00

# Форматированный вывод
stat -c "%n %s %U %G %A" file.txt
# file.txt 1234 alice alice -rw-r--r--

stat -c "%y" file.txt             # дата модификации
stat -c "%i" file.txt             # inode
stat -c "%h" file.txt             # количество жёстких ссылок
stat -c "%f" file.txt             # тип файла в hex

# file — определить тип содержимого
file document.pdf                  # PDF document, version 1.7
file script.sh                     # Bourne-Again shell script, ASCII text
file image.jpg                     # JPEG image data
file /bin/ls                       # ELF 64-bit LSB shared object
file -b file.txt                   # без имени файла (brief)
file -i file.txt                   # MIME тип: text/plain; charset=utf-8
```

---

## Временные файлы

```bash
# mktemp — безопасное создание временных файлов
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
tmpfile=$(mktemp /tmp/myapp.XXXXXX)     # кастомный префикс
tmpfile=$(mktemp --suffix=.log)         # с расширением

# Автоудаление через trap
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
trap "rm -rf $tmpfile $tmpdir" EXIT

# Работа с временным файлом
generate_data > "$tmpfile"
process_data < "$tmpfile"

# Атомарное обновление конфига
update_config() {
    local config_file="$1"
    local tmpfile
    tmpfile=$(mktemp "${config_file}.XXXXXX")

    # Сгенерировать новый конфиг во временный файл
    generate_config > "$tmpfile"

    # Проверить что всё в порядке
    if validate_config "$tmpfile"; then
        mv "$tmpfile" "$config_file"   # атомарная замена
        echo "Конфиг обновлён"
    else
        rm "$tmpfile"
        echo "Ошибка валидации конфига" >&2
        return 1
    fi
}
```

---

## Блокировки файлов (flock)

```bash
# flock — файловые блокировки для синхронизации процессов

LOCKFILE="/var/lock/myscript.lock"

# Эксклюзивная блокировка (скрипт не запустится второй раз)
(
    flock -n 9 || { echo "Уже запущен" >&2; exit 1; }
    # ... основной код ...
    echo "Работаю"
    sleep 10
) 9>"$LOCKFILE"

# С таймаутом
(
    flock -w 5 9 || { echo "Не удалось получить блокировку за 5 сек" >&2; exit 1; }
    critical_section
) 9>"$LOCKFILE"

# Разделяемая блокировка (несколько читателей)
(
    flock -s 9        # shared lock
    read_shared_data
) 9<"$datafile"
```

---

## Обработка CSV и TSV

```bash
# Читать CSV построчно
while IFS=, read -r name age city email; do
    echo "Имя: $name, Город: $city"
done < data.csv

# Пропустить заголовок
{
    IFS=, read -r header
    while IFS=, read -r name age city email; do
        echo "$name -> $city"
    done
} < data.csv

# awk для CSV
awk -F, 'NR>1 {print $1, $3}' data.csv          # поля 1 и 3
awk -F, 'NR>1 && $2 > 25' data.csv              # фильтр по возрасту
awk -F, '{sum+=$2} END{print "Среднее:", sum/(NR-1)}' data.csv

# TSV (разделитель — таб)
while IFS=$'\t' read -r col1 col2 col3; do
    echo "$col1 | $col2"
done < data.tsv

# Генерировать CSV
{
    echo "name,age,city"
    echo "alice,30,москва"
    echo "bob,25,питер"
} > output.csv

printf "%s,%d,%s\n" "carol" 28 "казань" >> output.csv
```

---

## Логирование в скриптах

```bash
#!/usr/bin/env bash

# Полноценный модуль логирования
LOG_FILE="${LOG_FILE:-/var/log/myscript.log}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"

declare -A LOG_LEVELS=([DEBUG]=0 [INFO]=1 [WARN]=2 [ERROR]=3)

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Проверить уровень
    if (( ${LOG_LEVELS[$level]:-0} >= ${LOG_LEVELS[$LOG_LEVEL]:-1} )); then
        local line="[$timestamp] [$level] $message"

        # Ошибки и предупреждения — в stderr
        if [[ "$level" == "ERROR" || "$level" == "WARN" ]]; then
            echo "$line" >&2
        else
            echo "$line"
        fi

        # Все уровни — в файл
        echo "$line" >> "$LOG_FILE"
    fi
}

# Использование
log DEBUG "Начало обработки файла: $filename"
log INFO  "Обработано строк: $count"
log WARN  "Файл не найден, использую значение по умолчанию"
log ERROR "Критическая ошибка: $error_message"

# Запуск с разными уровнями
# LOG_LEVEL=DEBUG ./script.sh
# LOG_LEVEL=ERROR ./script.sh 2>errors.log
```

---

## Практические сценарии

### Ротация логов

```bash
#!/usr/bin/env bash
# Простая ротация логов

rotate_log() {
    local logfile="$1"
    local max_backups="${2:-5}"
    local max_size="${3:-10485760}"   # 10MB по умолчанию

    [[ -f "$logfile" ]] || return 0

    local size
    size=$(stat -c %s "$logfile")

    if (( size < max_size )); then
        return 0
    fi

    # Сдвинуть старые бэкапы
    for (( i=max_backups-1; i>=1; i-- )); do
        local prev=$((i-1))
        local old="${logfile}.${prev}"
        local new="${logfile}.${i}"
        [[ -f "$old" ]] && mv "$old" "$new"
    done

    # Переместить текущий лог
    mv "$logfile" "${logfile}.0"

    # Создать новый пустой лог
    touch "$logfile"
    chmod --reference="${logfile}.0" "$logfile"

    echo "Ротация выполнена: $logfile"
}

rotate_log /var/log/myapp.log 5 10485760
```

### Мониторинг файла в реальном времени

```bash
#!/usr/bin/env bash
# Следить за файлом и реагировать на паттерны

monitor_log() {
    local logfile="$1"
    local pattern="$2"
    local action="$3"

    tail -F "$logfile" | while IFS= read -r line; do
        if [[ "$line" =~ $pattern ]]; then
            echo "[ALERT] Найдено: $line"
            "$action" "$line"
        fi
    done
}

send_alert() {
    local message="$1"
    # mail -s "Alert" admin@example.com <<< "$message"
    echo "ALERT: $message" >> /var/log/alerts.log
}

monitor_log /var/log/nginx/error.log "crit|emerg" send_alert
```

### Безопасная обработка файлов

```bash
#!/usr/bin/env bash
set -euo pipefail

# Проверки перед работой с файлом
safe_read() {
    local file="$1"

    [[ -e "$file" ]] || { echo "Файл не существует: $file" >&2; return 1; }
    [[ -f "$file" ]] || { echo "Не является файлом: $file" >&2; return 1; }
    [[ -r "$file" ]] || { echo "Нет прав на чтение: $file" >&2; return 1; }
    [[ -s "$file" ]] || { echo "Файл пустой: $file" >&2; return 1; }

    cat "$file"
}

# Атомарное обновление файла
atomic_write() {
    local target="$1"
    local content="$2"
    local tmpfile
    tmpfile=$(mktemp "${target}.XXXXXX")

    echo "$content" > "$tmpfile"

    # Сохранить права оригинала если существует
    if [[ -f "$target" ]]; then
        chmod --reference="$target" "$tmpfile"
        chown --reference="$target" "$tmpfile" 2>/dev/null || true
    fi

    mv "$tmpfile" "$target"
}

# Diff перед обновлением
update_with_diff() {
    local target="$1"
    local new_content="$2"
    local tmpfile
    tmpfile=$(mktemp)
    echo "$new_content" > "$tmpfile"

    if [[ -f "$target" ]]; then
        if diff -q "$target" "$tmpfile" > /dev/null; then
            echo "Файл не изменился: $target"
            rm "$tmpfile"
            return 0
        fi
        echo "Изменения в $target:"
        diff "$target" "$tmpfile" || true
    fi

    mv "$tmpfile" "$target"
    echo "Обновлён: $target"
}
```

### Сканирование директории

```bash
#!/usr/bin/env bash
# Статистика директории

dir_stats() {
    local dir="${1:-.}"

    echo "=== Статистика: $dir ==="

    # Общий размер
    echo "Размер: $(du -sh "$dir" 2>/dev/null | cut -f1)"

    # Количество файлов и директорий
    local files dirs
    files=$(find "$dir" -maxdepth 1 -type f | wc -l)
    dirs=$(find "$dir" -maxdepth 1 -type d | wc -l)
    echo "Файлов: $files, Директорий: $((dirs - 1))"

    # Топ-5 самых больших файлов
    echo ""
    echo "Топ-5 больших файлов:"
    find "$dir" -type f -printf "%s\t%p\n" 2>/dev/null \
        | sort -rn \
        | head -5 \
        | awk '{printf "  %8.1f KB  %s\n", $1/1024, $2}'

    # Файлы по расширению
    echo ""
    echo "По расширению:"
    find "$dir" -maxdepth 1 -type f \
        | grep -oE "\.[^.]+$" \
        | sort | uniq -c | sort -rn \
        | head -10 \
        | awk '{printf "  %5d  %s\n", $1, $2}'
}

dir_stats "/var/log"
```

---

## Шпаргалка

```bash
# Потоки
command > file          # stdout → файл (перезапись)
command >> file         # stdout → файл (дозапись)
command 2> file         # stderr → файл
command &> file         # stdout + stderr → файл
command > file 2>&1     # то же самое (POSIX)
command 2>/dev/null     # выбросить stderr
command | tee file      # stdout → файл И на экран

# Ввод
command < file          # stdin из файла
command <<< "string"    # here-string
command << EOF          # heredoc
...
EOF

# Пайп
cmd1 | cmd2             # stdout → stdin
cmd1 2>&1 | cmd2        # stdout+stderr → stdin
cmd1 | tee f | cmd2     # разветвить поток
diff <(cmd1) <(cmd2)    # подстановка процессов

# Дескрипторы
exec 3< file            # открыть fd3 для чтения
exec 3> file            # открыть fd3 для записи
read -r line <&3        # читать из fd3
echo "data" >&3         # писать в fd3
exec 3<&-               # закрыть fd3

# Чтение файлов
while IFS= read -r line; do
    ...
done < file

readarray -t arr < file

# find + действия
find . -name "*.log" -delete
find . -type f -exec cmd {} +
find . -print0 | xargs -0 cmd

# Временные файлы
tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT
```

---

## Ссылки

- [Bash Redirections](https://www.gnu.org/software/bash/manual/bash.html#Redirections) — официальная документация
- [find manual](https://man7.org/linux/man-pages/man1/find.1.html) — `man find`
- [tee manual](https://man7.org/linux/man-pages/man1/tee.1.html) — `man tee`
- [flock manual](https://man7.org/linux/man-pages/man1/flock.1.html) — `man flock`
