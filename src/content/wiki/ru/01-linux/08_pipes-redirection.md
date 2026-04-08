---
title: "Пайпы и перенаправление ввода-вывода"
date: "2026-04-07"
---

В Unix каждая программа проектируется так, чтобы выполнять ограниченную функцию максимально эффективно. Сложные задачи достигаются за счёт комбинации нескольких таких специализированных программ посредством механизмов передачи данных между ними, что позволяет строить мощные и гибкие конвейеры обработки информации без необходимости разработки новой комплексной программы

---

## Файловые дескрипторы (FD)

Каждый процесс в Linux имеет таблицу открытых файлов. Первые три - стандартные потоки:

```
Процесс
┌──────────────────────────────────────┐
│  FD 0  stdin   ◄── клавиатура/файл  │
│  FD 1  stdout  ──► терминал/файл    │
│  FD 2  stderr  ──► терминал/файл    │
│  FD 3+ ...     пользовательские     │
└──────────────────────────────────────┘
```

```bash
# Посмотреть дескрипторы текущего процесса
ls -la /proc/$$/fd
# lrwx------ 0 -> /dev/pts/0   stdin
# lrwx------ 1 -> /dev/pts/0   stdout
# lrwx------ 2 -> /dev/pts/0   stderr

# Посмотреть дескрипторы конкретного процесса
ls -la /proc/$(pgrep nginx | head -1)/fd
```

---

## Перенаправление вывода

### Основные операторы

```bash
# > перезапись файла
echo "hello" > file.txt
ls -la > listing.txt
date > /tmp/timestamp

# >> дозапись в конец
echo "line 1" > file.txt
echo "line 2" >> file.txt
echo "line 3" >> file.txt

# Разница: > создаёт файл заново, >> добавляет к существующему
# Если файл не существует — оба создают его

# 2> перенаправить stderr
ls /nonexistent 2> error.log
find / -name "passwd" 2> /dev/null   # скрыть ошибки Permission denied

# 2>> дозапись stderr
command1 2>> errors.log
command2 2>> errors.log              # оба пишут в один файл

# &> или >& перенаправить оба потока
command &> all_output.log
command >& all_output.log            # синоним (менее распространён)

# Раздельное перенаправление
command > stdout.log 2> stderr.log
```

### Порядок операторов

Это наиболее часто путают. Перенаправления применяются **слева направо**:

```bash
# ОШИБКА - stderr остаётся на терминале
command 2>&1 > file.txt

# Шаг 1: 2>&1   stderr → туда же куда stdout (терминал)
# Шаг 2: > file  stdout → файл
# Результат: stdout в файл, stderr на терминал

# ПРАВИЛЬНО - оба потока в файл
command > file.txt 2>&1

# Шаг 1: > file  stdout → файл
# Шаг 2: 2>&1   stderr → туда же куда stdout (файл)
# Результат: оба в файл
```

```bash
# Практические примеры
make 2>&1 | tee build.log           # видеть и сохранять вывод сборки
./script.sh > output.log 2>&1       # всё в один файл
./script.sh > out.log 2> err.log    # раздельные файлы
./script.sh 2>/dev/null             # только stdout, скрыть ошибки
./script.sh >/dev/null 2>&1         # скрыть всё
./script.sh >/dev/null              # только ошибки на экран
```

### /dev/null - чёрная дыра

```bash
# Всё записанное в /dev/null теряется навсегда
echo "test" > /dev/null             # вывод выброшен
command 2> /dev/null                # ошибки выброшены
command &> /dev/null                # всё выброшено

# Типичные сценарии
crontab -e 2>/dev/null              # скрыть сообщение об отсутствии crontab
find / -name "file" 2>/dev/null     # без "Permission denied"
service nginx status &>/dev/null && echo "running"  # тихая проверка
```

---

## Перенаправление ввода

```bash
# < читать stdin из файла
sort < unsorted.txt
wc -l < /etc/passwd
grep "root" < /etc/passwd
tr '[:lower:]' '[:upper:]' < input.txt > output.txt   # преобразовать регистр

# Цепочка: из файла, преобразовать, в файл
sort < names.txt > sorted_names.txt
```

### Here-String `<<<`

```bash
# Передать строку как stdin — без создания файла
wc -w <<< "hello world linux"           # 3
base64 <<< "secret"                     # c2VjcmV0Cg==
rev <<< "Hello"                         # olleH
md5sum <<< "password"

# Чтение переменной
read first rest <<< "one two three"
echo "$first"   # one
echo "$rest"    # two three

# Особенно удобно вместо echo | command
# Вместо:
echo "hello" | wc -c
# Лучше:
wc -c <<< "hello"
```

### Here-Document `<<`

```bash
# Многострочный ввод прямо в скрипте
cat << EOF
Строка 1
Строка 2
Переменная: $HOME
EOF

# Без подстановки переменных (одинарные кавычки вокруг метки)
cat << 'EOF'
Переменная $HOME не раскрывается
Символ \n тоже буквальный
EOF

# Heredoc в команду
grep "pattern" << EOF
эта строка содержит pattern
эта не содержит
эта тоже pattern
EOF

# Передать heredoc в ssh
ssh user@server << 'EOF'
    hostname
    uptime
    df -h
EOF

# Heredoc с отступами - <<- убирает ведущие ТАБЫ (не пробелы)
if true; then
    cat <<- EOF
        Эта строка с отступом табом
        Отступ убирается
    EOF
fi

# Heredoc в переменную
config=$(cat << EOF
[database]
host = $DB_HOST
port = $DB_PORT
EOF
)

# Heredoc в файл
cat > /etc/myapp/config.conf << EOF
host = localhost
port = 8080
debug = false
EOF

# Heredoc через sudo (без прав на запись напрямую)
sudo tee /etc/nginx/sites-available/mysite << 'EOF'
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
}
EOF
```

---

## Пайпы

### Базовый пайп `|`

```bash
# stdout одной команды → stdin следующей
ls -la | grep "^d"                  # только директории
ps aux | grep nginx                  # найти процессы nginx
cat /etc/passwd | cut -d: -f1       # только логины
df -h | grep -v tmpfs               # без tmpfs

# Цепочки пайпов
cat /etc/passwd \
    | grep "/bin/bash" \
    | cut -d: -f1 \
    | sort \
    | head -5

# Пайп НЕ передаёт stderr
ls /nonexistent | wc -l             # stderr на экран, stdout (пустой) в wc
ls /nonexistent 2>&1 | wc -l        # stderr тоже в пайп
```

### tee — разветвление потока

```bash
# Записать в файл И передать дальше
cat file.txt | tee copy.txt | wc -l
command | tee output.log            # на экран и в файл

# Дозапись
command | tee -a existing.log

# Несколько файлов одновременно
echo "data" | tee file1.txt file2.txt file3.txt

# В середине цепочки
ps aux | tee snapshot.txt | grep nginx

# Запись от root
echo "127.0.0.1 myhost" | sudo tee -a /etc/hosts
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-forward.conf

# tee без вывода на экран
command | tee file.txt > /dev/null
```

### Код возврата пайпа

```bash
# Код возврата - это код ПОСЛЕДНЕЙ команды в пайпе
true | false | true
echo $?   # 0 - последняя команда (true) успешна

# pipefail - ошибка если ЛЮБАЯ команда в пайпе упала
set -o pipefail

false | true
echo $?   # 1

true | false | true
echo $?   # 1 (false вернул 1, pipefail это поймал)

# PIPESTATUS — коды возврата каждой команды
cat file.txt | grep "pattern" | sort | uniq
echo "${PIPESTATUS[@]}"     # 0 0 0 0
echo "${PIPESTATUS[0]}"     # код cat
echo "${PIPESTATUS[1]}"     # код grep
echo "${PIPESTATUS[2]}"     # код sort

# Проверить конкретную команду в пайпе
cat big_file.txt | grep "error" | wc -l
grep_exit=${PIPESTATUS[1]}
if [[ $grep_exit -eq 1 ]]; then
    echo "Ошибки не найдены"
fi
```

---

## Подстановка процессов `<()` и `>()`

Позволяет использовать **вывод команды как файл**.

```bash
# <(cmd) - команда как файл для чтения
diff <(ls dir1) <(ls dir2)                  # сравнить содержимое директорий
diff <(sort file1.txt) <(sort file2.txt)    # сравнить отсортированные файлы
comm <(sort a.txt) <(sort b.txt)            # общие/уникальные строки

# Работает везде где ожидается имя файла
wc -l <(find . -name "*.py")               # посчитать Python файлы
grep "pattern" <(curl -s http://example.com/data)  # поиск в URL

# Читать несколько команд одновременно
while IFS= read -r line; do
    echo "Обрабатываю: $line"
done < <(find . -name "*.log" -newer /tmp/marker)

# >(cmd) - команда как файл для записи
command > >(tee file.txt)                  # писать в команду как в файл
tee >(gzip > file.gz) >(wc -l) > /dev/null  # разветвить в несколько команд

# Практический пример — логирование с временными метками
./script.sh > >(while read line; do echo "$(date): $line"; done > app.log)

# Сравнить два файла, игнорируя пустые строки и комментарии
diff \
    <(grep -v "^#" file1.conf | grep -v "^$") \
    <(grep -v "^#" file2.conf | grep -v "^$")
```

---

## Именованные каналы (FIFO)

```bash
# Создать именованный канал
mkfifo /tmp/mypipe
ls -la /tmp/mypipe
# prw-r--r-- 1 alice alice 0 Mar 15 10:00 /tmp/mypipe
# p — pipe

# Базовое использование
echo "hello" > /tmp/mypipe &         # записать (в фоне — блокирует до чтения)
cat < /tmp/mypipe                    # прочитать

# Двусторонняя связь между процессами
mkfifo /tmp/req /tmp/resp

# Процесс-сервер
while true; do
    request=$(cat /tmp/req)
    echo "Обработано: $request" > /tmp/resp
done &

# Процесс-клиент
echo "запрос 1" > /tmp/req
cat /tmp/resp

# Удалить
rm /tmp/mypipe /tmp/req /tmp/resp
```

---

## Пользовательские файловые дескрипторы

```bash
# Открыть файл на пользовательском дескрипторе
exec 3< input.txt         # FD 3 для чтения
exec 4> output.txt        # FD 4 для записи
exec 5>> append.txt       # FD 5 для дозаписи
exec 6<> readwrite.txt    # FD 6 для чтения и записи

# Читать из FD 3
while IFS= read -r line <&3; do
    echo "Строка: $line"
done
read -r first_line <&3    # одну строку

# Писать в FD 4
echo "данные" >&4
printf "форматированно: %d\n" 42 >&4

# Закрыть дескрипторы
exec 3<&-    # закрыть вход
exec 4>&-    # закрыть выход

# Сохранить и восстановить stdout
exec 3>&1              # сохранить stdout в FD 3
exec 1> /tmp/log.txt   # перенаправить stdout в файл
echo "это в файл"      # идёт в файл
exec 1>&3              # восстановить stdout
exec 3>&-              # закрыть FD 3
echo "это на экран"    # снова на экран

# Читать два файла параллельно
exec 3< file1.txt
exec 4< file2.txt
while IFS= read -r a <&3 && IFS= read -r b <&4; do
    echo "file1: $a  |  file2: $b"
done
exec 3<&- 4<&-
```

---

## Продвинутые паттерны

### Фильтрация и трансформация

```bash
# Топ-10 процессов по памяти
ps aux --sort=-%mem | head -11

# Уникальные IP из лога (отсортированные по частоте)
awk '{print $1}' /var/log/nginx/access.log \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -20

# Все 4xx и 5xx коды из nginx лога
awk '$9 ~ /^[45]/' /var/log/nginx/access.log \
    | awk '{print $9}' \
    | sort | uniq -c | sort -rn

# Размер директорий, отсортированный
du -sh /var/log/* 2>/dev/null | sort -h | tail -10

# Найти дубликаты файлов по хэшу
find . -type f -exec md5sum {} \; \
    | sort \
    | uniq -w32 -d

# Статистика кодов HTTP из лога
awk '{print $9}' /var/log/nginx/access.log \
    | sort | uniq -c | sort -rn \
    | awk '{printf "%6d  %s\n", $1, $2}'
```

### Параллельная обработка

```bash
# xargs -P - параллельное выполнение
find . -name "*.jpg" | xargs -P 4 -I {} convert {} -resize 800x600 {}.resized

# Безопасно для файлов с пробелами
find . -name "*.log" -print0 | xargs -0 -P 4 gzip

# GNU parallel (если установлен)
find . -name "*.csv" | parallel -j 4 python3 process.py {}

# Ручной параллелизм через &
for file in *.log; do
    gzip "$file" &
done
wait    # дождаться всех

# С ограничением параллелизма
max_jobs=4
job_count=0
for file in *.log; do
    gzip "$file" &
    ((job_count++))
    if (( job_count >= max_jobs )); then
        wait -n 2>/dev/null || wait   # ждать любой завершившийся job
        ((job_count--))
    fi
done
wait
```

### Мониторинг в реальном времени

```bash
# Следить за несколькими логами сразу
tail -f /var/log/syslog \
       /var/log/nginx/error.log \
       /var/log/auth.log \
    | grep --line-buffered -E "error|crit|warn"

# С временными метками
tail -f /var/log/app.log | while IFS= read -r line; do
    echo "$(date '+%H:%M:%S') $line"
done

# Мониторить и отправлять алёрты
tail -F /var/log/nginx/error.log | grep --line-buffered "crit" | while read line; do
    echo "ALERT: $line" | mail -s "Nginx Critical Error" admin@example.com
done &

# watch — периодически выполнять команду
watch -n 2 'ps aux | grep nginx | grep -v grep'
watch -d -n 1 'df -h'                  # -d подсвечивает изменения
watch -n 0.5 'cat /proc/loadavg'       # нагрузка 2 раза в секунду
```

### Обработка текста в конвейерах

```bash
# Извлечь emails из файла
grep -oE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" contacts.txt | sort -u

# Извлечь IP адреса из лога
grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" access.log | sort | uniq -c | sort -rn

# Извлечь URLs
grep -oE "https?://[^ \"]+" page.html | sort -u

# Подсчёт слов в нескольких файлах
cat *.txt | tr -s '[:space:]' '\n' | sort | uniq -c | sort -rn | head -20

# Найти строки только в file1, но не в file2
comm -23 <(sort file1.txt) <(sort file2.txt)

# Найти общие строки
comm -12 <(sort file1.txt) <(sort file2.txt)

# Слияние CSV файлов
(head -1 file1.csv; tail -n +2 file1.csv; tail -n +2 file2.csv) > merged.csv

# Транспонировать таблицу
awk '
{
    for (i=1; i<=NF; i++) {
        matrix[NR][i] = $i
    }
}
END {
    for (j=1; j<=NF; j++) {
        for (i=1; i<=NR; i++) printf "%s%s", matrix[i][j], (i<NR?" ":"\n")
    }
}' table.txt
```

### Конвейеры для системного администрирования

```bash
# Найти занятые порты
ss -tlnp | awk 'NR>1 {print $4}' | awk -F: '{print $NF}' | sort -n | uniq

# Топ-10 директорий по размеру
du -a /var 2>/dev/null | sort -rn | head -10 | awk '{printf "%8.1f MB  %s\n", $1/1024, $2}'

# Пользователи, вошедшие за последние N дней
last | awk 'NF>2 && $1!="reboot" && $1!="wtmp" {print $1}' | sort -u

# Подозрительные попытки входа по SSH
grep "Failed password" /var/log/auth.log \
    | awk '{print $(NF-3)}' \
    | sort | uniq -c | sort -rn \
    | head -20

# Список открытых TCP соединений с группировкой по состоянию
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# Файлы, изменённые за последний час
find /etc -newer /tmp/marker -type f 2>/dev/null \
    | xargs stat -c "%y %n" 2>/dev/null \
    | sort -r

# Быстрая проверка конфигов nginx
nginx -T 2>/dev/null | grep -E "^\s*(server_name|listen|root|location)" | sed 's/^[[:space:]]*//'
```

---

## Встроенные возможности bash

### Подстановка команд как ввод

```bash
# $() - вывод команды в переменную
files=$(ls *.txt)
count=$(wc -l < /etc/passwd)
date=$(date +%Y-%m-%d)

# В пайпе через подстановку процессов
while read user; do
    id "$user"
done < <(awk -F: '$3 >= 1000 {print $1}' /etc/passwd)
```

### coproc - двусторонние пайпы

```bash
# coproc - запустить команду с двусторонним каналом
coproc bc -l    # запустить калькулятор

# Писать в bc
echo "2 + 2" >&${COPROC[1]}
echo "sqrt(2)" >&${COPROC[1]}

# Читать из bc
read result <&${COPROC[0]}
echo "2 + 2 = $result"    # 4

read result <&${COPROC[0]}
echo "sqrt(2) = $result"   # 1.41421356...

# Завершить
kill $COPROC_PID 2>/dev/null
```

---

## Типичные ошибки

```bash
# 1. Неправильный порядок перенаправлений
cmd 2>&1 > file     # ОШИБКА: stderr на терминал, stdout в файл
cmd > file 2>&1     # ПРАВИЛЬНО: оба в файл

# 2. Потеря pipefail
set -o pipefail
false | true        # без pipefail: код возврата 0 (скрытая ошибка!)
# С pipefail: код возврата 1

# 3. Изменение переменных внутри пайпа
count=0
cat file | while read line; do
    ((count++))
done
echo $count         # 0! Пайп создаёт subshell
# Решение: подстановка процессов
while IFS= read -r line; do
    ((count++))
done < <(cat file)
echo $count         # правильно

# 4. Потеря exit кода после пайпа
grep "pattern" file | head -5
echo $?             # код head, не grep!

# 5. Небезопасные имена файлов в пайпе
find . -name "*.txt" | xargs rm          # ЛОМАЕТСЯ на файлах с пробелами
find . -name "*.txt" -print0 | xargs -0 rm   # ПРАВИЛЬНО

# 6. Неожиданное поведение cat | grep
cat file | grep pattern   # бесполезный cat
grep pattern file          # лучше напрямую
```

---

## Шпаргалка

```bash
# Перенаправление вывода
>   перезапись                  echo "x" > f
>>  дозапись                   echo "x" >> f
2>  stderr в файл              cmd 2> err
2>> дозапись stderr            cmd 2>> err
&>  оба потока в файл          cmd &> all
>/dev/null скрыть stdout       cmd > /dev/null
2>&1 stderr→stdout             cmd > f 2>&1  ← правильный порядок

# Перенаправление ввода
<   из файла                   cmd < f
<<< here-string                cmd <<< "str"
<<  heredoc                    cmd << EOF
                               ...
                               EOF

# Пайпы
|   stdout→stdin               cmd1 | cmd2
|&  stdout+stderr→stdin        cmd1 |& cmd2
tee разветвить поток           cmd | tee f | cmd2

# Подстановка процессов
<() команда как файл на чтение diff <(cmd1) <(cmd2)
>() команда как файл на запись cmd > >(tee f)

# Коды возврата пайпа
$?           код последней команды
${PIPESTATUS[@]}  все коды пайпа
set -o pipefail   ошибка если любая команда упала

# Дескрипторы
exec N< f    открыть N для чтения
exec N> f    открыть N для записи
cmd <&N      читать из N
cmd >&N      писать в N
exec N<&-    закрыть N
```

---

## Ссылки

- [Bash Redirections](https://www.gnu.org/software/bash/manual/bash.html#Redirections) - официальная документация
- [Advanced Bash Scripting: I/O](https://tldp.org/LDP/abs/html/io-redirection.html) - подробный гайд
- [pipe man page](https://man7.org/linux/man-pages/man2/pipe.2.html) - `man 2 pipe`
- [mkfifo man page](https://man7.org/linux/man-pages/man1/mkfifo.1.html) - `man mkfifo`
