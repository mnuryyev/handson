---
title: "find, grep, awk, sed - обработка данных"
date: "2026-05-11"
---

Четыре инструмента, которые вместе закрывают 90% задач по обработке текста и поиску в Linux. `find` ищет файлы по метаданным. `grep` фильтрует строки по паттерну. `awk` обрабатывает структурированный текст по полям. `sed` редактирует поток текста - заменяет, удаляет, вставляет. Их сила - в комбинации через пайпы.

---

## find - поиск файлов

### Базовый синтаксис

    find [путь] [условия] [действие]

    # Найти всё в текущей директории и ниже
    find .

    # Найти в /etc
    find /etc

    # Несколько путей сразу
    find /etc /var/log -name "*.conf"

### Поиск по имени

    # По имени (чувствительно к регистру)
    find . -name "*.log"
    find . -name "access.log"
    find . -name "*.py"

    # Без учёта регистра
    find . -iname "*.LOG"
    find . -iname "readme*"

    # По имени директории
    find . -name "node_modules" -type d

    # Исключить директорию из поиска
    find . -name "*.js" -not -path "*/node_modules/*"
    find . -path "*/node_modules" -prune -o -name "*.js" -print

### Поиск по типу

    # -type f  обычный файл
    # -type d  директория
    # -type l  символическая ссылка
    # -type p  именованный канал (FIFO)
    # -type s  сокет
    # -type b  блочное устройство
    # -type c  символьное устройство

    find . -type f                     # только файлы
    find . -type d                     # только директории
    find . -type l                     # только симлинки

    # Найти битые симлинки
    find . -type l ! -e

### Поиск по размеру

    # -size n[cwbkMG]
    # c  байты
    # k  килобайты (1024)
    # M  мегабайты
    # G  гигабайты

    find . -size +100M                 # больше 100 МБ
    find . -size -1k                   # меньше 1 КБ
    find . -size 0                     # пустые файлы
    find . -size +1G                   # больше 1 ГБ

    # Диапазон размеров
    find . -size +1M -size -100M       # от 1 МБ до 100 МБ

### Поиск по времени

    # -mtime n  изменён n дней назад (modify time)
    # -atime n  открыт n дней назад (access time)
    # -ctime n  изменены метаданные n дней назад (change time)
    # -mmin n   изменён n минут назад
    # -newer f  новее чем файл f

    # + больше чем, - меньше чем, без знака - ровно
    find . -mtime -7                   # изменён за последние 7 дней
    find . -mtime +30                  # не изменялся более 30 дней
    find . -mtime +90 -type f          # старые файлы

    # Изменён за последний час
    find . -mmin -60

    # Новее чем конкретный файл
    find /etc -newer /etc/passwd

    # Найти файлы, изменённые сегодня
    find . -daystart -mtime -1

### Поиск по правам доступа

    # -perm mode  точное совпадение
    # -perm -mode все биты установлены
    # -perm /mode  любой из битов установлен

    find . -perm 777                   # ровно 777
    find . -perm -644                  # как минимум 644
    find . -perm /111                  # исполняемые (любой из rwx x-бит)

    # Файлы с SUID
    find / -perm -4000 -type f 2>/dev/null

    # Файлы с SGID
    find / -perm -2000 -type f 2>/dev/null

    # SUID или SGID
    find / -perm /6000 -type f 2>/dev/null

    # World-writable файлы (опасно!)
    find / -perm -o+w -type f 2>/dev/null

### Поиск по владельцу

    find . -user alice                 # файлы пользователя alice
    find . -group www-data             # файлы группы www-data
    find . -uid 1000                   # по UID
    find . -gid 33                     # по GID

    # Файлы без владельца (orphaned)
    find / -nouser 2>/dev/null
    find / -nogroup 2>/dev/null

### Логические операторы

    # -and (или просто пробел) - И
    # -or  - ИЛИ
    # -not (или !) - НЕ

    # Файлы .log или .txt
    find . -name "*.log" -or -name "*.txt"
    find . \( -name "*.log" -o -name "*.txt" \)

    # Файлы .py, изменённые за 7 дней
    find . -name "*.py" -and -mtime -7

    # Не .git
    find . -not -path "*/.git/*"
    find . ! -path "*/.git/*"

### Действия

    # -print  вывести путь (по умолчанию)
    # -print0 с NUL-разделителем (для xargs -0)
    # -delete  удалить
    # -exec cmd {} \;  выполнить команду для каждого файла
    # -exec cmd {} +   передать все файлы одной командой
    # -ls  подробный вывод как ls -l
    # -ok  как -exec, но с подтверждением

    # Удалить старые логи
    find /var/log -name "*.log" -mtime +30 -delete

    # Запустить команду для каждого файла
    find . -name "*.py" -exec python3 -m py_compile {} \;

    # Эффективнее - передать все файлы сразу
    find . -name "*.py" -exec python3 -m py_compile {} +

    # chmod всем .sh файлам
    find . -name "*.sh" -exec chmod +x {} \;

    # Удалить и показать что удалено
    find . -name "*.tmp" -exec echo "Удаляю: {}" \; -delete

    # С подтверждением каждого действия
    find . -name "*.bak" -ok rm {} \;

    # xargs - эффективнее для больших объёмов
    find . -name "*.log" -print0 | xargs -0 rm -f
    find . -name "*.py" -print0 | xargs -0 grep -l "import os"

### Ограничение глубины

    # -maxdepth n  не глубже n уровней
    # -mindepth n  не меньше n уровней

    find . -maxdepth 1             # только текущая директория
    find . -maxdepth 2 -name "*.conf"
    find . -mindepth 2 -maxdepth 3 -type f

### Полезные паттерны

    # Топ-10 самых больших файлов
    find / -type f -printf "%s %p\n" 2>/dev/null | sort -rn | head -10

    # Суммарный размер по расширению
    find . -name "*.log" -print0 | xargs -0 du -sh --total 2>/dev/null | tail -1

    # Найти дубликаты по md5
    find . -type f -exec md5sum {} \; | sort | uniq -w32 --all-repeated

    # Скопировать структуру директорий без файлов
    find . -type d -exec mkdir -p /backup/{} \;

    # Все файлы, изменённые за последние 24 часа
    find / -mtime -1 -type f 2>/dev/null

    # Найти конфиги с "password" (потенциальная утечка)
    find /etc -name "*.conf" -exec grep -l "password" {} \; 2>/dev/null

---

## grep - поиск по содержимому

### Базовый синтаксис

    grep [опции] паттерн [файлы]

    grep "root" /etc/passwd
    grep "error" /var/log/syslog
    grep "listen" /etc/nginx/nginx.conf

### Основные флаги

    # -i  игнорировать регистр
    grep -i "error" /var/log/syslog

    # -v  инвертировать - вывести НЕ совпадающие строки
    grep -v "^#" /etc/nginx/nginx.conf      # без комментариев
    grep -v "^$" /etc/hosts                  # без пустых строк
    grep -v "^#" file | grep -v "^$"         # без комментариев и пустых

    # -n  номер строки
    grep -n "error" /var/log/app.log

    # -c  только количество совпадений
    grep -c "200" /var/log/nginx/access.log

    # -l  только имена файлов с совпадением
    grep -l "TODO" src/*.py

    # -L  файлы БЕЗ совпадения
    grep -L "version" *.json

    # -r  рекурсивно по директории
    grep -r "password" /etc/ 2>/dev/null
    grep -r "TODO" ./src --include="*.py"

    # -R  рекурсивно, следуя симлинкам
    grep -R "config" /etc/

    # -w  целое слово
    grep -w "root" /etc/passwd             # не "chroot", только "root"

    # -x  вся строка целиком
    grep -x "root:.*" /etc/passwd

    # -o  только совпавшая часть
    grep -oE "[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" access.log

    # -h  без имён файлов (при поиске по нескольким)
    grep -h "error" /var/log/*.log

    # -H  с именами файлов (по умолчанию при нескольких файлах)
    grep -H "error" /var/log/syslog

    # -q  тихий режим - только код возврата
    grep -q "error" log.txt && echo "есть ошибки"

    # --color  подсветить совпадение
    grep --color "error" /var/log/syslog

### Контекст вокруг совпадения

    # -A n  n строк После совпадения (After)
    grep -A 3 "error" /var/log/app.log

    # -B n  n строк До совпадения (Before)
    grep -B 2 "FAILED" /var/log/auth.log

    # -C n  n строк До и После (Context)
    grep -C 5 "panic" /var/log/syslog

### Режимы регулярных выражений

    # grep    BRE - базовые regex (скобки и + надо экранировать)
    # grep -E ERE - расширенные regex (egrep)
    # grep -F FRE - фиксированные строки, без regex (fgrep)
    # grep -P PRE - Perl-совместимые regex (PCRE)

    # BRE - базовые
    grep "root\|bin" /etc/passwd          # | надо экранировать
    grep "[0-9]\+" /etc/passwd            # + надо экранировать

    # ERE - расширенные (рекомендуется для сложных паттернов)
    grep -E "root|bin" /etc/passwd
    grep -E "[0-9]+"
    grep -E "^[A-Z].*[0-9]$"

    # Perl regex - самые мощные
    grep -P "\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"   # IP
    grep -P "(?<=user=)\w+"                            # lookbehind
    grep -P "\b(?:password|passwd|pwd)\b" -i

### Регулярные выражения - основы

    # Якоря
    ^   начало строки
    $   конец строки

    # Классы символов
    .   любой символ кроме \n
    \d  цифра (PCRE)
    \w  слово [a-zA-Z0-9_]
    \s  пробельный символ

    # Квантификаторы
    *   0 или более
    +   1 или более (ERE/PCRE)
    ?   0 или 1 (ERE/PCRE)
    {n} ровно n раз
    {n,} n или более
    {n,m} от n до m

    # Группы и альтернатива
    (a|b)  a или b (ERE)
    [abc]  один из a,b,c
    [^abc] любой кроме a,b,c
    [a-z]  диапазон

    # Практические примеры
    grep -E "^[0-9]{1,3}(\.[0-9]{1,3}){3}" /etc/hosts    # строки начинающиеся с IP
    grep -E "^\s*#" /etc/nginx.conf                         # только комментарии
    grep -E "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}" emails.txt  # email
    grep -E "https?://[^\s]+" links.txt                     # URLs

### Несколько паттернов

    # -e  добавить паттерн
    grep -e "error" -e "warning" -e "critical" /var/log/syslog

    # -f  паттерны из файла
    cat patterns.txt
    # error
    # warning
    # failed
    grep -f patterns.txt /var/log/syslog

### Исключения файлов и директорий

    grep -r "TODO" ./src --include="*.py"           # только .py
    grep -r "error" /var --exclude="*.gz"           # исключить .gz
    grep -r "config" . --exclude-dir=".git"         # исключить директорию
    grep -r "test" . --exclude-dir={".git","node_modules","vendor"}

### Практические паттерны

    # Найти процессы по имени
    ps aux | grep "[n]ginx"            # трюк с [] - исключить сам grep из результата

    # IP из лога
    grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" /var/log/nginx/access.log | sort | uniq -c | sort -rn

    # Все HTTP ошибки (4xx, 5xx)
    grep -E '" [45][0-9]{2} ' /var/log/nginx/access.log

    # Неудачные попытки SSH входа
    grep "Failed password" /var/log/auth.log | grep -oP "from \K\S+"

    # Конфиги без строк version (возможно устаревшие)
    grep -rL "version" /etc/*/

    # Рекурсивный поиск с выводом совпадений
    grep -rn "password\s*=" ./config/ 2>/dev/null

    # Строки, соответствующие всем паттернам (AND)
    grep "error" log.txt | grep "database" | grep "connection"

    # Подсчёт уникальных совпадений
    grep -oE "[A-Z]+" file.txt | sort | uniq -c | sort -rn

---

## awk - обработка структурированного текста

### Модель выполнения

awk читает файл построчно. Каждая строка проверяется против паттернов. Для совпадающих - выполняется действие.

    awk 'BEGIN { init } /паттерн/ { действие } END { итог }' файл

    # BEGIN - выполняется до обработки файла
    # END   - выполняется после обработки файла
    # /паттерн/ - фильтр строк (необязателен)
    # { действие } - что делать (необязательно, по умолчанию print)

### Поля и разделители

    # $0   вся строка
    # $1   первое поле
    # $2   второе поле
    # $NF  последнее поле
    # $NF-1  предпоследнее (не работает, нужно: $(NF-1))
    # NR   номер текущей строки (Number Record)
    # NF   число полей в строке (Number Fields)
    # FS   разделитель полей (Field Separator), по умолчанию пробел/таб
    # OFS  разделитель в выводе (Output Field Separator)
    # RS   разделитель записей (Record Separator), по умолчанию \n
    # ORS  разделитель записей в выводе
    # FILENAME  имя текущего файла
    # FNR  номер строки в текущем файле (при нескольких файлах)

    # Примеры с /etc/passwd (разделитель :)
    awk -F: '{print $1}' /etc/passwd           # только логины
    awk -F: '{print $1, $3}' /etc/passwd       # логин и UID
    awk -F: '{print $1 ":" $3}' /etc/passwd    # с явным разделителем

    # Несколько разделителей (regex)
    awk -F'[,;:]' '{print $2}' file.txt

    # Установить разделитель вывода
    awk -F: 'BEGIN {OFS="\t"} {print $1, $3, $6}' /etc/passwd

### Встроенные переменные

    # NR - номер строки
    awk '{print NR, $0}' file.txt           # пронумеровать строки
    awk 'NR==5' file.txt                    # только 5я строка
    awk 'NR>=3 && NR<=7' file.txt           # строки 3-7
    awk 'NR%2==0' file.txt                  # чётные строки

    # NF - число полей
    awk '{print NF}' file.txt              # количество полей в каждой строке
    awk 'NF>0' file.txt                    # убрать пустые строки (NF==0)
    awk '{print $(NF)}' file.txt           # последнее поле
    awk '{print $(NF-1)}' file.txt         # предпоследнее поле

    # FILENAME
    awk '{print FILENAME, NR, $0}' *.log

    # FNR vs NR
    awk '{print FNR, NR, $0}' file1.txt file2.txt
    # FNR сбрасывается на 1 для каждого файла, NR - нет

### Паттерны и условия

    # Строки содержащие слово
    awk '/error/' /var/log/syslog
    awk '/^root/' /etc/passwd                # начинается с root
    awk '!/^#/' /etc/hosts                   # без комментариев

    # Условие по значению поля
    awk -F: '$3 >= 1000' /etc/passwd         # пользователи с UID >= 1000
    awk -F: '$3 == 0' /etc/passwd            # root и другие с UID 0
    awk '$5 > 100' data.txt                  # 5е поле больше 100

    # Диапазон строк: от паттерна до паттерна (включительно)
    awk '/START/,/END/' file.txt
    awk '/BEGIN_SECTION/,/END_SECTION/{print}' config.txt

    # Несколько условий
    awk '/error/ && /database/' log.txt
    awk '/warning/ || /error/' log.txt
    awk '!/^#/ && NF>0' config.txt          # не комментарий и не пустая

### Переменные и арифметика

    # Переменные (не нужно объявлять, инициализируются в 0 или "")
    awk '{sum += $1} END {print sum}' numbers.txt
    awk '{sum += $1; count++} END {print sum/count}' numbers.txt

    # Передать переменную снаружи (-v)
    awk -v threshold=100 '$1 > threshold' data.txt
    awk -v user="$USER" -F: '$1 == user' /etc/passwd

    # Встроенные математические функции
    awk '{print sqrt($1)}' numbers.txt
    awk '{print int($1)}' numbers.txt        # целая часть
    awk '{printf "%.2f\n", $1/3}' numbers.txt

### Ассоциативные массивы

    # Подсчёт по ключу
    awk '{count[$1]++} END {for (k in count) print k, count[k]}' words.txt

    # Суммирование по группе
    awk '{sum[$1] += $2} END {for (k in sum) print k, sum[k]}' data.txt

    # IP с количеством запросов из nginx лога
    awk '{count[$1]++} END {for (ip in count) print count[ip], ip}' access.log \
        | sort -rn | head -20

    # Топ HTTP кодов
    awk '{print $9}' access.log | sort | uniq -c | sort -rn

    # Проверить наличие ключа
    awk '{if ($1 in seen) print "дубликат:", $1; seen[$1]=1}' ids.txt

    # Удалить элемент массива
    awk '{a[$1]=$2} END {delete a["key"]; for (k in a) print k, a[k]}' file

### Условия и циклы

    # if/else
    awk '{if ($1 > 100) print "big:", $0; else print "small:", $0}' data.txt
    awk '{
        if ($3 >= 1000) print "user:", $1
        else if ($3 == 0) print "root:", $1
        else print "system:", $1
    }' /etc/passwd

    # for
    awk '{for (i=1; i<=NF; i++) printf "%s ", $i; print ""}' file.txt

    # while
    awk 'BEGIN {i=1; while (i<=10) {print i; i++}}'

    # Цикл по массиву
    awk '{a[$1]++} END {for (k in a) print k, a[k]}' file.txt

    # next - пропустить текущую строку
    awk '/^#/{next} {print}' config.txt

    # exit - прекратить обработку
    awk 'NR==100{exit} {print}' big_file.txt   # первые 100 строк

### printf - форматированный вывод

    awk '{printf "%-20s %5d %8.2f\n", $1, $2, $3}' data.txt

    # Форматы
    # %s   строка
    # %d   целое число
    # %f   число с плавающей точкой
    # %e   научная нотация
    # %g   компактный float
    # %-10s  выровнять влево на 10 символов
    # %10s   выровнять вправо
    # %05d   заполнить нулями

### Работа со строками

    # length() - длина строки или массива
    awk '{print length($0), $0}' file.txt
    awk 'length($1) > 10' file.txt         # поле длиннее 10 символов

    # substr(str, start, len) - подстрока
    awk '{print substr($0, 1, 50)}' file.txt      # первые 50 символов
    awk '{print substr($1, 1, 3)}' file.txt       # первые 3 символа поля

    # index(str, sub) - позиция подстроки (0 если нет)
    awk '{if (index($0, "error") > 0) print}' log.txt

    # split(str, arr, sep) - разбить строку в массив
    awk '{n=split($1, a, "."); print a[1]}' ips.txt    # первый октет IP

    # sub(regex, repl, str) - заменить первое вхождение
    awk '{sub(/error/, "ERROR"); print}' log.txt

    # gsub(regex, repl, str) - заменить все вхождения
    awk '{gsub(/\t/, "  "); print}' file.txt           # табы в пробелы
    awk '{gsub(/[[:space:]]+/, " "); print}' file.txt  # сжать пробелы

    # match(str, regex) - найти regex в строке
    awk '{if (match($0, /[0-9]+\.[0-9]+/)) print substr($0, RSTART, RLENGTH)}' file

    # toupper/tolower
    awk '{print toupper($1), tolower($2)}' file.txt

    # sprintf - форматировать в строку
    awk '{out = sprintf("%05d", $1); print out}' file.txt

### BEGIN и END

    # BEGIN - инициализация до обработки файла
    awk 'BEGIN {
        FS=":"
        OFS="\t"
        print "Логин\tUID\tHome"
        print "------\t---\t----"
    } {print $1, $3, $6} END {
        print "------"
        print "Всего:", NR, "записей"
    }' /etc/passwd

    # END - итоги после обработки
    awk '{sum+=$1; count++} END {
        if (count>0) printf "Сумма: %d, Среднее: %.2f\n", sum, sum/count
    }' numbers.txt

### Несколько файлов и блоков

    # Разные действия для разных файлов
    awk 'FNR==1{print "=== Файл:", FILENAME} {print NR, $0}' file1.txt file2.txt

    # Соединение файлов по ключу (аналог JOIN)
    # file1: id name
    # file2: id age
    awk '
        NR==FNR {name[$1]=$2; next}
        $1 in name {print $1, name[$1], $2}
    ' file1.txt file2.txt

### Встроенные переменные OFMT и CONVFMT

    awk 'BEGIN {OFMT="%.2f"} {print $1+0}' numbers.txt   # форматировать числа

### Практические рецепты

    # Сумма столбца
    awk '{sum+=$1} END {print sum}' numbers.txt
    awk -F, '{sum+=$3} END {print sum}' data.csv

    # Среднее, мин, макс
    awk 'NR==1{min=max=$1} {sum+=$1; if($1<min)min=$1; if($1>max)max=$1} END {
        printf "min=%d max=%d avg=%.2f\n", min, max, sum/NR
    }' numbers.txt

    # Удалить дублирующиеся строки (сохранить порядок)
    awk '!seen[$0]++' file.txt

    # Удалить дубликаты по полю
    awk -F, '!seen[$1]++' data.csv

    # Вывести строки между N и M
    awk 'NR>=10 && NR<=20' file.txt

    # Транспонировать CSV
    awk -F, '
    {
        for (i=1; i<=NF; i++) m[NR][i]=$i
        if (NF>max) max=NF
    }
    END {
        for (i=1; i<=max; i++) {
            for (j=1; j<=NR; j++) printf "%s%s", m[j][i], (j<NR ? "," : "")
            print ""
        }
    }' data.csv

    # Слова встречающиеся более 3 раз
    awk '{for (i=1; i<=NF; i++) count[$i]++} END {
        for (w in count) if (count[w]>3) print count[w], w
    }' text.txt | sort -rn

    # Nginx: запросы по часам
    awk '{
        match($4, /\[([0-9]{2})\//, a)
        hours[a[1]]++
    } END {
        for (h in hours) print h":00", hours[h]
    }' /var/log/nginx/access.log | sort

    # Размер файлов по расширению
    find . -type f -printf "%f %s\n" | awk '
    {
        match($1, /\.([^.]+)$/, a)
        ext = (a[1] ? a[1] : "no_ext")
        size[ext] += $2
        count[ext]++
    }
    END {
        for (e in size) printf "%-15s %5d файлов  %10.1f КБ\n", e, count[e], size[e]/1024
    }' | sort -k3 -rn

---

## sed - потоковый редактор

### Базовый синтаксис

    sed [опции] 'скрипт' [файл]
    sed [опции] -e 'скрипт1' -e 'скрипт2' [файл]
    sed [опции] -f script.sed [файл]

### Адресация строк

    # Без адреса - применить ко всем строкам
    sed 's/foo/bar/' file.txt

    # По номеру строки
    sed '3s/foo/bar/' file.txt         # только строка 3
    sed '1,5s/foo/bar/' file.txt       # строки 1-5
    sed '3,/END/s/foo/bar/' file.txt   # от строки 3 до /END/

    # Относительные адреса
    sed '5,+3s/foo/bar/' file.txt      # строка 5 и следующие 3 (5-8)
    sed '1~2s/foo/bar/' file.txt       # каждая нечётная (1,3,5,...)
    sed '0~2s/foo/bar/' file.txt       # каждая чётная (2,4,6,...)

    # По паттерну
    sed '/error/s/old/new/' file.txt   # строки с "error"
    sed '/start/,/end/s/foo/bar/' file.txt  # между паттернами

    # Последняя строка
    sed '$s/foo/bar/' file.txt
    sed '$d' file.txt                  # удалить последнюю

    # Инверсия адреса (!)
    sed '1!s/foo/bar/' file.txt        # все кроме первой
    sed '/^#/!s/old/new/' file.txt     # кроме комментариев

### Команда s - замена (substitute)

    s/паттерн/замена/флаги

    # Флаги:
    # g  все вхождения в строке (глобально)
    # i  без учёта регистра (GNU sed)
    # p  вывести строку (обычно с -n)
    # n  заменить n-е вхождение (2 = второе, 3g = с третьего и далее)
    # w file  записать изменённые строки в файл
    # e  выполнить результат как команду shell

    sed 's/foo/bar/' file.txt           # первое вхождение в каждой строке
    sed 's/foo/bar/g' file.txt          # все вхождения
    sed 's/foo/bar/gi' file.txt         # без учёта регистра
    sed 's/foo/bar/2' file.txt          # только второе вхождение
    sed 's/foo/bar/3g' file.txt         # с третьего и далее

    # Разделитель можно менять (удобно при работе с путями)
    sed 's|/usr/local|/opt|g' paths.txt
    sed 's#/etc/nginx#/etc/apache2#g' conf.txt
    sed 's,/old/path,/new/path,g' file.txt

    # Обратные ссылки \1, \2, ... (группы захвата)
    sed 's/\(hello\) \(world\)/\2 \1/' file.txt    # поменять местами
    sed -E 's/(hello) (world)/\2 \1/' file.txt     # с ERE (проще)

    # & - всё совпадение целиком
    sed 's/[0-9]*/[&]/' file.txt       # обернуть числа в []
    sed 's/error/>>> & <<</' log.txt   # выделить error

    # Замена с сохранением регистра (GNU sed 4.8+)
    # \u  следующий символ uppercase
    # \l  следующий символ lowercase
    # \U  всё до \E uppercase
    # \L  всё до \E lowercase
    sed 's/\b\w/\u&/g' file.txt        # Заглавная первая буква каждого слова

### Команда d - удаление (delete)

    sed '/^#/d' config.txt             # удалить комментарии
    sed '/^$/d' file.txt               # удалить пустые строки
    sed '/^#/d; /^$/d' file.txt        # оба условия
    sed '1d' file.txt                  # удалить первую строку
    sed '$d' file.txt                  # удалить последнюю
    sed '2,5d' file.txt                # удалить строки 2-5
    sed '/START/,/END/d' file.txt      # удалить диапазон между паттернами

### Команда p - вывод (print)

    # Обычно используется с -n (подавить дефолтный вывод)
    sed -n '5p' file.txt               # только строка 5
    sed -n '5,10p' file.txt            # строки 5-10
    sed -n '/error/p' file.txt         # строки с error (аналог grep)
    sed -n '/START/,/END/p' file.txt   # диапазон
    sed -n '$p' file.txt               # последняя строка

    # Без -n p дублирует совпавшие строки
    sed '/error/p' file.txt            # строки с error выведутся дважды

### Команда q и Q - выход (quit)

    sed '5q' file.txt                  # вывести первые 5 строк и выйти
    sed '/error/q' file.txt            # выйти на первом error (включая)
    sed '10Q' file.txt                 # выйти на строке 10 (не включая)

### Команда i, a, c - вставка и замена строк

    # i  вставить ПЕРЕД строкой
    sed '3i\Новая строка перед 3й' file.txt
    sed '/pattern/i\--- Заголовок ---' file.txt

    # a  вставить ПОСЛЕ строки
    sed '3a\Новая строка после 3й' file.txt
    sed '/pattern/a\--- Конец секции ---' file.txt

    # c  заменить строку целиком
    sed '3c\Заменённая третья строка' file.txt
    sed '/pattern/c\Новое содержимое' file.txt

    # Многострочная вставка
    sed '/pattern/a\
    Строка 1\
    Строка 2\
    Строка 3' file.txt

    # GNU sed - чище с одной командой
    sed '/pattern/a Строка 1\nСтрока 2' file.txt

### Команда y - транслитерация (как tr)

    sed 'y/abc/ABC/' file.txt          # a→A, b→B, c→C
    sed 'y/abcdefghijklmnopqrstuvwxyz/ABCDEFGHIJKLMNOPQRSTUVWXYZ/' file.txt

### Команда = - вывод номера строки

    sed '=' file.txt                   # напечатать номер перед каждой строкой
    sed -n '/error/=' file.txt         # номера строк с error
    sed '=' file.txt | paste - -      # номер и строка рядом

### Команда r и w - чтение и запись файлов

    sed '/pattern/r other.txt' file.txt    # вставить содержимое файла после паттерна
    sed -n '/error/w errors.txt' file.txt  # записать совпадения в файл

### Редактирование на месте (-i)

    # -i  редактировать файл на месте
    sed -i 's/old/new/g' file.txt

    # -i.bak  сделать резервную копию с суффиксом
    sed -i.bak 's/old/new/g' file.txt
    # Создаст file.txt.bak и изменит file.txt

    # Несколько файлов сразу
    sed -i 's/localhost/127.0.0.1/g' /etc/nginx/sites-enabled/*.conf

    # Рекурсивно (с find)
    find ./src -name "*.py" -exec sed -i 's/old_import/new_import/g' {} \;

### Многострочная обработка

    # N  добавить следующую строку в буфер
    # P  вывести до \n в буфере
    # D  удалить до \n и начать заново

    # Объединить пустые строки (несколько пустых -> одна)
    sed '/^$/{N; /^\n$/d}' file.txt

    # Удалить переносы строк с \
    sed ':a; /\\$/{N; s/\\\n//; ba}' file.txt

    # Заменить паттерн, который может быть на двух строках
    sed 'N; s/foo\nbar/replaced/; P; D' file.txt

### Метки и переходы

    # b label  перейти к метке
    # t label  перейти к метке если была замена
    # T label  перейти к метке если замены НЕ было (GNU sed)
    # :label   определить метку

    # Цикл - удалить все теги HTML
    sed ':a; s/<[^>]*>//g; /</{N; ba}' html.txt

    # Повторять замену пока есть совпадение
    sed ':a; s/  / /g; ta' file.txt    # сжать множественные пробелы

### Hold space - буфер хранения

    # Обычный буфер (pattern space) - текущая строка
    # Hold space - дополнительный буфер для хранения между строками

    # h  копировать pattern -> hold
    # H  дописать pattern -> hold
    # g  копировать hold -> pattern
    # G  дописать hold -> pattern
    # x  поменять pattern и hold местами

    # Перевернуть файл (аналог tac)
    sed -n '1!G; h; $p' file.txt

    # Удалить последнюю строку файла
    sed -n '$!{h; d}; x; p' file.txt

    # Вывести строки в обратном порядке и добавить нумерацию
    sed -n '1!G; h; $!d; =; G' file.txt

### Практические рецепты

    # Удалить начальные и конечные пробелы (trim)
    sed 's/^[[:space:]]*//; s/[[:space:]]*$//' file.txt
    sed -E 's/^\s+|\s+$//g' file.txt

    # Убрать комментарии и пустые строки
    sed '/^[[:space:]]*#/d; /^[[:space:]]*$/d' config.txt

    # Добавить строку в начало файла
    sed -i '1i\# Автогенерировано - не редактировать' file.txt

    # Добавить строку в конец файла
    sed -i '$ a\# Конец файла' file.txt

    # Заменить строку целиком (с поиском по паттерну)
    sed -i '/^Port /c\Port 2222' /etc/ssh/sshd_config

    # Извлечь блок между маркерами
    sed -n '/\[section\]/,/\[/p' config.ini | head -n -1

    # Добавить разрыв строки после каждой строки
    sed 'G' file.txt

    # Удалить HTML теги
    sed 's/<[^>]*>//g' page.html

    # Превратить Windows CRLF в Unix LF
    sed 's/\r//' file.txt
    sed -i 's/\r$//' file.txt

    # Добавить prefix к каждой строке
    sed 's/^/PREFIX: /' file.txt

    # Пронумеровать строки с выравниванием
    sed = file.txt | sed 'N; s/\n/\t/'

    # Вставить пустую строку через каждые N строк
    sed '0~3G' file.txt                # пустая строка после каждой 3-й

    # Заменить только в определённой секции
    sed '/\[database\]/,/\[/{s/host=.*/host=127.0.0.1/}' config.ini

---

## Комбинирование инструментов

### find + grep

    # Найти файлы и искать в них
    find /etc -name "*.conf" -exec grep -l "ssl" {} \;
    find . -name "*.py" | xargs grep -l "import os"

    # С контекстом
    find . -name "*.log" | xargs grep -n "ERROR" | head -20

    # Только в недавно изменённых
    find . -mtime -7 -name "*.py" -exec grep -H "TODO" {} \;

### find + awk

    # Статистика файлов по расширению
    find . -type f -printf "%f\n" | awk -F. '{print $NF}' | sort | uniq -c | sort -rn

    # Суммарный размер по расширению
    find . -type f -printf "%f %s\n" | \
        awk '{match($1,/\.([^.]+)$/,a); size[a[1]]+=$2} END {for (e in size) print e, size[e]/1024 "K"}' | \
        sort -k2 -rn

### grep + awk

    # Только нужные поля из совпавших строк
    grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn

    # Фильтр + подсчёт
    grep -E "^[^#]" /etc/hosts | awk '{print $1}' | sort | uniq

### awk + sed

    # awk для логики, sed для форматирования
    awk -F: '$3>=1000{print $1}' /etc/passwd | sed 's/^/User: /'

    # Условная обработка
    awk '{print NR, $0}' file.txt | sed -n '/error/p'

### Полный конвейер

    # Топ-10 IP атакующих SSH
    grep "Failed password" /var/log/auth.log \
        | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' \
        | sort \
        | uniq -c \
        | sort -rn \
        | head -10 \
        | awk '{printf "%6d попыток  %s\n", $1, $2}'

    # Размер логов nginx по дням
    find /var/log/nginx -name "*.log*" -printf "%TY-%Tm-%Td %f %s\n" \
        | sort \
        | awk '{date[$1]+=$3} END {for (d in date) printf "%s  %.1f MB\n", d, date[d]/1024/1024}' \
        | sort

    # Отчёт по HTTP кодам из access.log
    grep -v "^#" /var/log/nginx/access.log \
        | awk '{print $9}' \
        | grep -E "^[0-9]{3}$" \
        | sort \
        | uniq -c \
        | sort -rn \
        | awk '{printf "%6d  %s  %s\n", $1, $2,
            ($2~/^2/?"OK":$2~/^3/?"Redirect":$2~/^4/?"Client Error":"Server Error")}'

    # Найти и заменить во всех конфигах
    find /etc/nginx -name "*.conf" -exec grep -l "server_name example.com" {} \; \
        | xargs sed -i 's/server_name example.com/server_name mysite.com/g'

    # Извлечь уникальные email из всех файлов проекта
    find ./src -type f -name "*.py" \
        | xargs grep -hoP "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" \
        | sort -u

---

## Шпаргалка

### find

    find . -name "*.log"               # по имени
    find . -iname "*.LOG"              # без регистра
    find . -type f/d/l                 # тип
    find . -size +100M                 # размер
    find . -mtime -7                   # изменён за 7 дней
    find . -user alice                 # владелец
    find . -perm -4000                 # SUID файлы
    find . -exec cmd {} \;             # выполнить команду
    find . -exec cmd {} +              # передать всё сразу (быстрее)
    find . -delete                     # удалить
    find . -maxdepth 2                 # ограничить глубину
    find . -print0 | xargs -0 cmd      # безопасно с пробелами в именах

### grep

    grep -i                            # без регистра
    grep -v                            # инвертировать
    grep -n                            # номера строк
    grep -c                            # только счётчик
    grep -l / -L                       # файлы с / без совпадений
    grep -r                            # рекурсивно
    grep -w                            # целое слово
    grep -o                            # только совпадение
    grep -A/-B/-C n                    # контекст после/до/вокруг
    grep -E                            # расширенный regex
    grep -P                            # Perl regex
    grep -F                            # фиксированная строка (быстро)
    grep -q                            # тихий режим (только exit code)

### awk

    awk '{print $1}'                   # первое поле
    awk '{print $NF}'                  # последнее поле
    awk -F:                            # разделитель
    awk 'NR==5'                        # строка 5
    awk 'NR>=3&&NR<=7'                 # диапазон строк
    awk '/pattern/'                    # строки с паттерном
    awk '$2>100'                       # условие по полю
    awk '{sum+=$1} END {print sum}'    # сумма
    awk '!seen[$0]++'                  # удалить дубликаты
    awk -v var=val                     # передать переменную
    awk 'BEGIN{} {} END{}'             # блоки

### sed

    sed 's/old/new/'                   # заменить первое
    sed 's/old/new/g'                  # заменить все
    sed 's/old/new/gi'                 # без регистра
    sed -E 's/(a)(b)/\2\1/'           # группы захвата (ERE)
    sed '/pattern/d'                   # удалить строки
    sed '/^#/d; /^$/d'                 # удалить комментарии и пустые
    sed -n '5,10p'                     # вывести строки 5-10
    sed -n '/pat/p'                    # вывести совпадения
    sed '3i\текст'                     # вставить перед строкой
    sed '3a\текст'                     # вставить после строки
    sed -i 's/old/new/g' file          # редактировать на месте
    sed -i.bak 's/old/new/g' file      # с резервной копией

---

## Ссылки

- [GNU find manual](https://www.gnu.org/software/findutils/manual/html_mono/find.html)
- [GNU grep manual](https://www.gnu.org/software/grep/manual/grep.html)
- [GNU awk manual](https://www.gnu.org/software/gawk/manual/gawk.html)
- [GNU sed manual](https://www.gnu.org/software/sed/manual/sed.html)
- `man find`, `man grep`, `man awk`, `man sed`
- [The AWK Programming Language](https://ia903404.us.archive.org/0/items/pdfy-MgN0H1joIoDVoIC7/The_AWK_Programming_Language.pdf) - книга от авторов awk
