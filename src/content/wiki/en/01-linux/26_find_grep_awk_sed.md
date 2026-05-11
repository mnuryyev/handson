---
title: "find, grep, awk, sed - Data Processing"
date: "2026-05-11"
---

Four tools that together cover 90% of text processing and search tasks in Linux. `find` searches files by metadata. `grep` filters lines by pattern. `awk` processes structured text by fields. `sed` edits a stream of text - replaces, deletes, inserts. Their real power is in combining them through pipes.

---

## find - searching files

### Basic syntax

    find [path] [conditions] [action]

    # Find everything in current directory and below
    find .

    # Find in /etc
    find /etc

    # Multiple paths at once
    find /etc /var/log -name "*.conf"

### Search by name

    # By name (case sensitive)
    find . -name "*.log"
    find . -name "access.log"
    find . -name "*.py"

    # Case insensitive
    find . -iname "*.LOG"
    find . -iname "readme*"

    # Directory by name
    find . -name "node_modules" -type d

    # Exclude directory from search
    find . -name "*.js" -not -path "*/node_modules/*"
    find . -path "*/node_modules" -prune -o -name "*.js" -print

### Search by type

    # -type f  regular file
    # -type d  directory
    # -type l  symbolic link
    # -type p  named pipe (FIFO)
    # -type s  socket
    # -type b  block device
    # -type c  character device

    find . -type f                     # only files
    find . -type d                     # only directories
    find . -type l                     # only symlinks

    # Find broken symlinks
    find . -type l ! -e

### Search by size

    # -size n[cwbkMG]
    # c  bytes
    # k  kilobytes (1024)
    # M  megabytes
    # G  gigabytes

    find . -size +100M                 # larger than 100 MB
    find . -size -1k                   # smaller than 1 KB
    find . -size 0                     # empty files
    find . -size +1G                   # larger than 1 GB

    # Size range
    find . -size +1M -size -100M       # from 1 MB to 100 MB

### Search by time

    # -mtime n  modified n days ago (modify time)
    # -atime n  accessed n days ago (access time)
    # -ctime n  metadata changed n days ago (change time)
    # -mmin n   modified n minutes ago
    # -newer f  newer than file f

    # + more than, - less than, no sign - exactly
    find . -mtime -7                   # modified in last 7 days
    find . -mtime +30                  # not modified in 30+ days
    find . -mtime +90 -type f          # old files

    # Modified in last hour
    find . -mmin -60

    # Newer than a specific file
    find /etc -newer /etc/passwd

    # Modified today
    find . -daystart -mtime -1

### Search by permissions

    # -perm mode  exact match
    # -perm -mode  all bits are set
    # -perm /mode  any of the bits is set

    find . -perm 777                   # exactly 777
    find . -perm -644                  # at least 644
    find . -perm /111                  # executable (any x bit)

    # Files with SUID
    find / -perm -4000 -type f 2>/dev/null

    # Files with SGID
    find / -perm -2000 -type f 2>/dev/null

    # SUID or SGID
    find / -perm /6000 -type f 2>/dev/null

    # World-writable files (dangerous!)
    find / -perm -o+w -type f 2>/dev/null

### Search by owner

    find . -user alice                 # files owned by alice
    find . -group www-data             # files owned by group www-data
    find . -uid 1000                   # by UID
    find . -gid 33                     # by GID

    # Orphaned files (no owner)
    find / -nouser 2>/dev/null
    find / -nogroup 2>/dev/null

### Logical operators

    # -and (or just a space) - AND
    # -or  - OR
    # -not (or !) - NOT

    # Files .log or .txt
    find . -name "*.log" -or -name "*.txt"
    find . \( -name "*.log" -o -name "*.txt" \)

    # .py files modified in last 7 days
    find . -name "*.py" -and -mtime -7

    # Not .git
    find . -not -path "*/.git/*"
    find . ! -path "*/.git/*"

### Actions

    # -print  print path (default)
    # -print0 with NUL separator (for xargs -0)
    # -delete  delete
    # -exec cmd {} \;  execute command for each file
    # -exec cmd {} +   pass all files in one command
    # -ls  verbose output like ls -l
    # -ok  like -exec but prompts for confirmation

    # Delete old logs
    find /var/log -name "*.log" -mtime +30 -delete

    # Run command for each file
    find . -name "*.py" -exec python3 -m py_compile {} \;

    # More efficient - pass all files at once
    find . -name "*.py" -exec python3 -m py_compile {} +

    # chmod all .sh files
    find . -name "*.sh" -exec chmod +x {} \;

    # Delete and show what was deleted
    find . -name "*.tmp" -exec echo "Removing: {}" \; -delete

    # With confirmation for each action
    find . -name "*.bak" -ok rm {} \;

    # xargs - more efficient for large volumes
    find . -name "*.log" -print0 | xargs -0 rm -f
    find . -name "*.py" -print0 | xargs -0 grep -l "import os"

### Depth limiting

    # -maxdepth n  no deeper than n levels
    # -mindepth n  no shallower than n levels

    find . -maxdepth 1             # current directory only
    find . -maxdepth 2 -name "*.conf"
    find . -mindepth 2 -maxdepth 3 -type f

### Useful patterns

    # Top 10 largest files
    find / -type f -printf "%s %p\n" 2>/dev/null | sort -rn | head -10

    # Total size by extension
    find . -name "*.log" -print0 | xargs -0 du -sh --total 2>/dev/null | tail -1

    # Find duplicates by md5
    find . -type f -exec md5sum {} \; | sort | uniq -w32 --all-repeated

    # Copy directory structure without files
    find . -type d -exec mkdir -p /backup/{} \;

    # All files modified in last 24 hours
    find / -mtime -1 -type f 2>/dev/null

    # Find configs with "password" (potential leak)
    find /etc -name "*.conf" -exec grep -l "password" {} \; 2>/dev/null

---

## grep - searching by content

### Basic syntax

    grep [options] pattern [files]

    grep "root" /etc/passwd
    grep "error" /var/log/syslog
    grep "listen" /etc/nginx/nginx.conf

### Main flags

    # -i  ignore case
    grep -i "error" /var/log/syslog

    # -v  invert - print lines NOT matching
    grep -v "^#" /etc/nginx/nginx.conf      # without comments
    grep -v "^$" /etc/hosts                  # without empty lines
    grep -v "^#" file | grep -v "^$"         # both

    # -n  line number
    grep -n "error" /var/log/app.log

    # -c  only count of matches
    grep -c "200" /var/log/nginx/access.log

    # -l  only filenames with matches
    grep -l "TODO" src/*.py

    # -L  files WITHOUT matches
    grep -L "version" *.json

    # -r  recursive search
    grep -r "password" /etc/ 2>/dev/null
    grep -r "TODO" ./src --include="*.py"

    # -R  recursive, following symlinks
    grep -R "config" /etc/

    # -w  whole word only
    grep -w "root" /etc/passwd             # not "chroot", only "root"

    # -x  entire line matches
    grep -x "root:.*" /etc/passwd

    # -o  only the matching part
    grep -oE "[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" access.log

    # -h  without filenames (when searching multiple files)
    grep -h "error" /var/log/*.log

    # -H  with filenames (default when multiple files)
    grep -H "error" /var/log/syslog

    # -q  quiet mode - only exit code
    grep -q "error" log.txt && echo "errors found"

    # --color  highlight match
    grep --color "error" /var/log/syslog

### Context around the match

    # -A n  n lines After match
    grep -A 3 "error" /var/log/app.log

    # -B n  n lines Before match
    grep -B 2 "FAILED" /var/log/auth.log

    # -C n  n lines Context (before and after)
    grep -C 5 "panic" /var/log/syslog

### Regex modes

    # grep    BRE - basic regex (brackets and + need escaping)
    # grep -E ERE - extended regex (egrep)
    # grep -F FRE - fixed strings, no regex (fgrep)
    # grep -P PRE - Perl-compatible regex (PCRE)

    # BRE - basic
    grep "root\|bin" /etc/passwd          # | needs escaping
    grep "[0-9]\+" /etc/passwd            # + needs escaping

    # ERE - extended (recommended for complex patterns)
    grep -E "root|bin" /etc/passwd
    grep -E "[0-9]+"
    grep -E "^[A-Z].*[0-9]$"

    # Perl regex - most powerful
    grep -P "\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"   # IP
    grep -P "(?<=user=)\w+"                            # lookbehind
    grep -P "\b(?:password|passwd|pwd)\b" -i

### Regex basics

    # Anchors
    ^   start of line
    $   end of line

    # Character classes
    .   any character except \n
    \d  digit (PCRE)
    \w  word [a-zA-Z0-9_]
    \s  whitespace

    # Quantifiers
    *   0 or more
    +   1 or more (ERE/PCRE)
    ?   0 or 1 (ERE/PCRE)
    {n} exactly n times
    {n,} n or more
    {n,m} between n and m

    # Groups and alternation
    (a|b)  a or b (ERE)
    [abc]  one of a,b,c
    [^abc] any except a,b,c
    [a-z]  range

    # Practical examples
    grep -E "^[0-9]{1,3}(\.[0-9]{1,3}){3}" /etc/hosts    # lines starting with IP
    grep -E "^\s*#" /etc/nginx.conf                         # only comments
    grep -E "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}" emails.txt  # email
    grep -E "https?://[^\s]+" links.txt                     # URLs

### Multiple patterns

    # -e  add pattern
    grep -e "error" -e "warning" -e "critical" /var/log/syslog

    # -f  patterns from file
    cat patterns.txt
    # error
    # warning
    # failed
    grep -f patterns.txt /var/log/syslog

### Excluding files and directories

    grep -r "TODO" ./src --include="*.py"           # only .py
    grep -r "error" /var --exclude="*.gz"           # exclude .gz
    grep -r "config" . --exclude-dir=".git"         # exclude directory
    grep -r "test" . --exclude-dir={".git","node_modules","vendor"}

### Practical patterns

    # Find processes by name
    ps aux | grep "[n]ginx"            # trick with [] - excludes grep itself

    # IPs from log
    grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" /var/log/nginx/access.log | sort | uniq -c | sort -rn

    # All HTTP errors (4xx, 5xx)
    grep -E '" [45][0-9]{2} ' /var/log/nginx/access.log

    # Failed SSH login attempts
    grep "Failed password" /var/log/auth.log | grep -oP "from \K\S+"

    # Configs without "version" line (possibly outdated)
    grep -rL "version" /etc/*/

    # Recursive search with match output
    grep -rn "password\s*=" ./config/ 2>/dev/null

    # Lines matching all patterns (AND)
    grep "error" log.txt | grep "database" | grep "connection"

    # Count unique matches
    grep -oE "[A-Z]+" file.txt | sort | uniq -c | sort -rn

---

## awk - processing structured text

### Execution model

awk reads the file line by line. Each line is checked against patterns. For matching lines - the action is executed.

    awk 'BEGIN { init } /pattern/ { action } END { summary }' file

    # BEGIN - runs before processing the file
    # END   - runs after processing the file
    # /pattern/ - line filter (optional)
    # { action } - what to do (optional, default is print)

### Fields and separators

    # $0   entire line
    # $1   first field
    # $2   second field
    # $NF  last field
    # $(NF-1)  second to last field
    # NR   current line number (Number Record)
    # NF   number of fields in line (Number Fields)
    # FS   field separator, default is whitespace
    # OFS  output field separator
    # RS   record separator, default is \n
    # ORS  output record separator
    # FILENAME  current filename
    # FNR  line number in current file (with multiple files)

    # Examples with /etc/passwd (separator :)
    awk -F: '{print $1}' /etc/passwd           # only logins
    awk -F: '{print $1, $3}' /etc/passwd       # login and UID
    awk -F: '{print $1 ":" $3}' /etc/passwd    # with explicit separator

    # Multiple separators (regex)
    awk -F'[,;:]' '{print $2}' file.txt

    # Set output separator
    awk -F: 'BEGIN {OFS="\t"} {print $1, $3, $6}' /etc/passwd

### Built-in variables

    # NR - line number
    awk '{print NR, $0}' file.txt           # number lines
    awk 'NR==5' file.txt                    # only line 5
    awk 'NR>=3 && NR<=7' file.txt           # lines 3-7
    awk 'NR%2==0' file.txt                  # even lines

    # NF - number of fields
    awk '{print NF}' file.txt              # field count per line
    awk 'NF>0' file.txt                    # remove empty lines (NF==0)
    awk '{print $(NF)}' file.txt           # last field
    awk '{print $(NF-1)}' file.txt         # second to last field

    # FILENAME
    awk '{print FILENAME, NR, $0}' *.log

    # FNR vs NR
    awk '{print FNR, NR, $0}' file1.txt file2.txt
    # FNR resets to 1 for each file, NR does not

### Patterns and conditions

    # Lines containing a word
    awk '/error/' /var/log/syslog
    awk '/^root/' /etc/passwd                # starts with root
    awk '!/^#/' /etc/hosts                   # without comments

    # Condition on field value
    awk -F: '$3 >= 1000' /etc/passwd         # users with UID >= 1000
    awk -F: '$3 == 0' /etc/passwd            # root and others with UID 0
    awk '$5 > 100' data.txt                  # 5th field greater than 100

    # Range: from pattern to pattern (inclusive)
    awk '/START/,/END/' file.txt
    awk '/BEGIN_SECTION/,/END_SECTION/{print}' config.txt

    # Multiple conditions
    awk '/error/ && /database/' log.txt
    awk '/warning/ || /error/' log.txt
    awk '!/^#/ && NF>0' config.txt          # not comment and not empty

### Variables and arithmetic

    # Variables (no declaration needed, initialized to 0 or "")
    awk '{sum += $1} END {print sum}' numbers.txt
    awk '{sum += $1; count++} END {print sum/count}' numbers.txt

    # Pass variable from outside (-v)
    awk -v threshold=100 '$1 > threshold' data.txt
    awk -v user="$USER" -F: '$1 == user' /etc/passwd

    # Built-in math functions
    awk '{print sqrt($1)}' numbers.txt
    awk '{print int($1)}' numbers.txt        # integer part
    awk '{printf "%.2f\n", $1/3}' numbers.txt

### Associative arrays

    # Count by key
    awk '{count[$1]++} END {for (k in count) print k, count[k]}' words.txt

    # Sum by group
    awk '{sum[$1] += $2} END {for (k in sum) print k, sum[k]}' data.txt

    # IPs with request count from nginx log
    awk '{count[$1]++} END {for (ip in count) print count[ip], ip}' access.log \
        | sort -rn | head -20

    # Top HTTP codes
    awk '{print $9}' access.log | sort | uniq -c | sort -rn

    # Check if key exists
    awk '{if ($1 in seen) print "duplicate:", $1; seen[$1]=1}' ids.txt

    # Delete array element
    awk '{a[$1]=$2} END {delete a["key"]; for (k in a) print k, a[k]}' file

### Conditions and loops

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

    # Loop over array
    awk '{a[$1]++} END {for (k in a) print k, a[k]}' file.txt

    # next - skip current line
    awk '/^#/{next} {print}' config.txt

    # exit - stop processing
    awk 'NR==100{exit} {print}' big_file.txt   # first 100 lines

### printf - formatted output

    awk '{printf "%-20s %5d %8.2f\n", $1, $2, $3}' data.txt

    # Formats
    # %s   string
    # %d   integer
    # %f   floating point
    # %e   scientific notation
    # %g   compact float
    # %-10s  left-align in 10 chars
    # %10s   right-align
    # %05d   zero-padded

### String functions

    # length() - string or array length
    awk '{print length($0), $0}' file.txt
    awk 'length($1) > 10' file.txt         # field longer than 10 chars

    # substr(str, start, len) - substring
    awk '{print substr($0, 1, 50)}' file.txt      # first 50 chars
    awk '{print substr($1, 1, 3)}' file.txt       # first 3 chars of field

    # index(str, sub) - position of substring (0 if not found)
    awk '{if (index($0, "error") > 0) print}' log.txt

    # split(str, arr, sep) - split string into array
    awk '{n=split($1, a, "."); print a[1]}' ips.txt    # first IP octet

    # sub(regex, repl, str) - replace first occurrence
    awk '{sub(/error/, "ERROR"); print}' log.txt

    # gsub(regex, repl, str) - replace all occurrences
    awk '{gsub(/\t/, "  "); print}' file.txt           # tabs to spaces
    awk '{gsub(/[[:space:]]+/, " "); print}' file.txt  # collapse spaces

    # match(str, regex) - find regex in string
    awk '{if (match($0, /[0-9]+\.[0-9]+/)) print substr($0, RSTART, RLENGTH)}' file

    # toupper/tolower
    awk '{print toupper($1), tolower($2)}' file.txt

    # sprintf - format into string
    awk '{out = sprintf("%05d", $1); print out}' file.txt

### BEGIN and END

    # BEGIN - initialization before processing
    awk 'BEGIN {
        FS=":"
        OFS="\t"
        print "Login\tUID\tHome"
        print "-----\t---\t----"
    } {print $1, $3, $6} END {
        print "-----"
        print "Total:", NR, "records"
    }' /etc/passwd

    # END - summary after processing
    awk '{sum+=$1; count++} END {
        if (count>0) printf "Sum: %d, Average: %.2f\n", sum, sum/count
    }' numbers.txt

### Multiple files and blocks

    # Different actions for different files
    awk 'FNR==1{print "=== File:", FILENAME} {print NR, $0}' file1.txt file2.txt

    # Join files by key (like SQL JOIN)
    # file1: id name
    # file2: id age
    awk '
        NR==FNR {name[$1]=$2; next}
        $1 in name {print $1, name[$1], $2}
    ' file1.txt file2.txt

### Practical recipes

    # Sum a column
    awk '{sum+=$1} END {print sum}' numbers.txt
    awk -F, '{sum+=$3} END {print sum}' data.csv

    # Average, min, max
    awk 'NR==1{min=max=$1} {sum+=$1; if($1<min)min=$1; if($1>max)max=$1} END {
        printf "min=%d max=%d avg=%.2f\n", min, max, sum/NR
    }' numbers.txt

    # Remove duplicate lines (preserve order)
    awk '!seen[$0]++' file.txt

    # Remove duplicates by field
    awk -F, '!seen[$1]++' data.csv

    # Print lines between N and M
    awk 'NR>=10 && NR<=20' file.txt

    # Transpose CSV
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

    # Words appearing more than 3 times
    awk '{for (i=1; i<=NF; i++) count[$i]++} END {
        for (w in count) if (count[w]>3) print count[w], w
    }' text.txt | sort -rn

    # Nginx: requests by hour
    awk '{
        match($4, /\[([0-9]{2})\//, a)
        hours[a[1]]++
    } END {
        for (h in hours) print h":00", hours[h]
    }' /var/log/nginx/access.log | sort

    # File sizes by extension
    find . -type f -printf "%f %s\n" | awk '
    {
        match($1, /\.([^.]+)$/, a)
        ext = (a[1] ? a[1] : "no_ext")
        size[ext] += $2
        count[ext]++
    }
    END {
        for (e in size) printf "%-15s %5d files  %10.1f KB\n", e, count[e], size[e]/1024
    }' | sort -k3 -rn

---

## sed - stream editor

### Basic syntax

    sed [options] 'script' [file]
    sed [options] -e 'script1' -e 'script2' [file]
    sed [options] -f script.sed [file]

### Line addressing

    # No address - apply to all lines
    sed 's/foo/bar/' file.txt

    # By line number
    sed '3s/foo/bar/' file.txt         # only line 3
    sed '1,5s/foo/bar/' file.txt       # lines 1-5
    sed '3,/END/s/foo/bar/' file.txt   # from line 3 to /END/

    # Relative addresses
    sed '5,+3s/foo/bar/' file.txt      # line 5 and next 3 (5-8)
    sed '1~2s/foo/bar/' file.txt       # every odd line (1,3,5,...)
    sed '0~2s/foo/bar/' file.txt       # every even line (2,4,6,...)

    # By pattern
    sed '/error/s/old/new/' file.txt   # lines with "error"
    sed '/start/,/end/s/foo/bar/' file.txt  # between patterns

    # Last line
    sed '$s/foo/bar/' file.txt
    sed '$d' file.txt                  # delete last line

    # Address inversion (!)
    sed '1!s/foo/bar/' file.txt        # all except first
    sed '/^#/!s/old/new/' file.txt     # except comments

### Command s - substitute

    s/pattern/replacement/flags

    # Flags:
    # g  all occurrences (global)
    # i  case insensitive (GNU sed)
    # p  print line (usually with -n)
    # n  replace nth occurrence (2 = second, 3g = from third onward)
    # w file  write changed lines to file
    # e  execute result as shell command

    sed 's/foo/bar/' file.txt           # first occurrence per line
    sed 's/foo/bar/g' file.txt          # all occurrences
    sed 's/foo/bar/gi' file.txt         # case insensitive
    sed 's/foo/bar/2' file.txt          # only second occurrence
    sed 's/foo/bar/3g' file.txt         # from third onward

    # Delimiter can be changed (handy with paths)
    sed 's|/usr/local|/opt|g' paths.txt
    sed 's#/etc/nginx#/etc/apache2#g' conf.txt
    sed 's,/old/path,/new/path,g' file.txt

    # Back-references \1, \2, ... (capture groups)
    sed 's/\(hello\) \(world\)/\2 \1/' file.txt    # swap words
    sed -E 's/(hello) (world)/\2 \1/' file.txt     # with ERE (cleaner)

    # & - entire match
    sed 's/[0-9]*/[&]/' file.txt       # wrap numbers in []
    sed 's/error/>>> & <<</' log.txt   # highlight error

    # Case modification (GNU sed 4.8+)
    # \u  next char uppercase
    # \l  next char lowercase
    # \U  all up to \E uppercase
    # \L  all up to \E lowercase
    sed 's/\b\w/\u&/g' file.txt        # capitalize first letter of each word

### Command d - delete

    sed '/^#/d' config.txt             # delete comments
    sed '/^$/d' file.txt               # delete empty lines
    sed '/^#/d; /^$/d' file.txt        # both
    sed '1d' file.txt                  # delete first line
    sed '$d' file.txt                  # delete last line
    sed '2,5d' file.txt                # delete lines 2-5
    sed '/START/,/END/d' file.txt      # delete range between patterns

### Command p - print

    # Usually used with -n (suppress default output)
    sed -n '5p' file.txt               # only line 5
    sed -n '5,10p' file.txt            # lines 5-10
    sed -n '/error/p' file.txt         # lines with error (like grep)
    sed -n '/START/,/END/p' file.txt   # range
    sed -n '$p' file.txt               # last line

    # Without -n, p duplicates matching lines
    sed '/error/p' file.txt            # error lines print twice

### Command q and Q - quit

    sed '5q' file.txt                  # print first 5 lines and quit
    sed '/error/q' file.txt            # quit at first error (inclusive)
    sed '10Q' file.txt                 # quit at line 10 (exclusive)

### Commands i, a, c - insert and replace lines

    # i  insert BEFORE line
    sed '3i\New line before 3rd' file.txt
    sed '/pattern/i\--- Header ---' file.txt

    # a  insert AFTER line
    sed '3a\New line after 3rd' file.txt
    sed '/pattern/a\--- End of section ---' file.txt

    # c  replace entire line
    sed '3c\Replaced third line' file.txt
    sed '/pattern/c\New content' file.txt

    # Multi-line insert
    sed '/pattern/a\
    Line 1\
    Line 2\
    Line 3' file.txt

    # GNU sed - cleaner
    sed '/pattern/a Line 1\nLine 2' file.txt

### Command y - transliterate (like tr)

    sed 'y/abc/ABC/' file.txt          # a->A, b->B, c->C
    sed 'y/abcdefghijklmnopqrstuvwxyz/ABCDEFGHIJKLMNOPQRSTUVWXYZ/' file.txt

### Command = - print line number

    sed '=' file.txt                   # print number before each line
    sed -n '/error/=' file.txt         # line numbers with error
    sed '=' file.txt | paste - -      # number and line side by side

### Commands r and w - read and write files

    sed '/pattern/r other.txt' file.txt    # insert file content after pattern
    sed -n '/error/w errors.txt' file.txt  # write matches to file

### In-place editing (-i)

    # -i  edit file in place
    sed -i 's/old/new/g' file.txt

    # -i.bak  make backup with suffix
    sed -i.bak 's/old/new/g' file.txt
    # Creates file.txt.bak and modifies file.txt

    # Multiple files at once
    sed -i 's/localhost/127.0.0.1/g' /etc/nginx/sites-enabled/*.conf

    # Recursive (with find)
    find ./src -name "*.py" -exec sed -i 's/old_import/new_import/g' {} \;

### Multi-line processing

    # N  append next line to buffer
    # P  print up to \n in buffer
    # D  delete up to \n and restart

    # Collapse multiple blank lines into one
    sed '/^$/{N; /^\n$/d}' file.txt

    # Remove line continuations with \
    sed ':a; /\\$/{N; s/\\\n//; ba}' file.txt

    # Replace pattern that may span two lines
    sed 'N; s/foo\nbar/replaced/; P; D' file.txt

### Labels and branches

    # b label  jump to label
    # t label  jump to label if substitution was made
    # T label  jump to label if substitution was NOT made (GNU sed)
    # :label   define label

    # Loop - remove all HTML tags
    sed ':a; s/<[^>]*>//g; /</{N; ba}' html.txt

    # Repeat substitution while there are matches
    sed ':a; s/  / /g; ta' file.txt    # collapse multiple spaces

### Hold space

    # Pattern space (normal buffer) - current line
    # Hold space - extra buffer for storing between lines

    # h  copy pattern -> hold
    # H  append pattern -> hold
    # g  copy hold -> pattern
    # G  append hold -> pattern
    # x  swap pattern and hold

    # Reverse file (like tac)
    sed -n '1!G; h; $p' file.txt

    # Delete last line of file
    sed -n '$!{h; d}; x; p' file.txt

### Practical recipes

    # Trim leading and trailing whitespace
    sed 's/^[[:space:]]*//; s/[[:space:]]*$//' file.txt
    sed -E 's/^\s+|\s+$//g' file.txt

    # Remove comments and empty lines
    sed '/^[[:space:]]*#/d; /^[[:space:]]*$/d' config.txt

    # Add line at start of file
    sed -i '1i\# Auto-generated - do not edit' file.txt

    # Add line at end of file
    sed -i '$ a\# End of file' file.txt

    # Replace entire line (search by pattern)
    sed -i '/^Port /c\Port 2222' /etc/ssh/sshd_config

    # Extract block between markers
    sed -n '/\[section\]/,/\[/p' config.ini | head -n -1

    # Add blank line after each line
    sed 'G' file.txt

    # Remove HTML tags
    sed 's/<[^>]*>//g' page.html

    # Convert Windows CRLF to Unix LF
    sed 's/\r//' file.txt
    sed -i 's/\r$//' file.txt

    # Add prefix to each line
    sed 's/^/PREFIX: /' file.txt

    # Number lines with alignment
    sed = file.txt | sed 'N; s/\n/\t/'

    # Insert blank line every N lines
    sed '0~3G' file.txt                # blank line after every 3rd

    # Replace only in a specific section
    sed '/\[database\]/,/\[/{s/host=.*/host=127.0.0.1/}' config.ini

---

## Combining the tools

### find + grep

    # Find files and search in them
    find /etc -name "*.conf" -exec grep -l "ssl" {} \;
    find . -name "*.py" | xargs grep -l "import os"

    # With context
    find . -name "*.log" | xargs grep -n "ERROR" | head -20

    # Only in recently modified
    find . -mtime -7 -name "*.py" -exec grep -H "TODO" {} \;

### find + awk

    # File count by extension
    find . -type f -printf "%f\n" | awk -F. '{print $NF}' | sort | uniq -c | sort -rn

    # Total size by extension
    find . -type f -printf "%f %s\n" | \
        awk '{match($1,/\.([^.]+)$/,a); size[a[1]]+=$2} END {for (e in size) print e, size[e]/1024 "K"}' | \
        sort -k2 -rn

### grep + awk

    # Only needed fields from matching lines
    grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn

    # Filter then count
    grep -E "^[^#]" /etc/hosts | awk '{print $1}' | sort | uniq

### awk + sed

    # awk for logic, sed for formatting
    awk -F: '$3>=1000{print $1}' /etc/passwd | sed 's/^/User: /'

    # Conditional processing
    awk '{print NR, $0}' file.txt | sed -n '/error/p'

### Full pipelines

    # Top-10 SSH attacking IPs
    grep "Failed password" /var/log/auth.log \
        | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' \
        | sort \
        | uniq -c \
        | sort -rn \
        | head -10 \
        | awk '{printf "%6d attempts  %s\n", $1, $2}'

    # Nginx log size by day
    find /var/log/nginx -name "*.log*" -printf "%TY-%Tm-%Td %f %s\n" \
        | sort \
        | awk '{date[$1]+=$3} END {for (d in date) printf "%s  %.1f MB\n", d, date[d]/1024/1024}' \
        | sort

    # HTTP status code report from access.log
    grep -v "^#" /var/log/nginx/access.log \
        | awk '{print $9}' \
        | grep -E "^[0-9]{3}$" \
        | sort \
        | uniq -c \
        | sort -rn \
        | awk '{printf "%6d  %s  %s\n", $1, $2,
            ($2~/^2/?"OK":$2~/^3/?"Redirect":$2~/^4/?"Client Error":"Server Error")}'

    # Find and replace across all configs
    find /etc/nginx -name "*.conf" -exec grep -l "server_name example.com" {} \; \
        | xargs sed -i 's/server_name example.com/server_name mysite.com/g'

    # Extract unique emails from all project files
    find ./src -type f -name "*.py" \
        | xargs grep -hoP "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" \
        | sort -u

---

## Cheat sheet

### find

    find . -name "*.log"               # by name
    find . -iname "*.LOG"              # case insensitive
    find . -type f/d/l                 # type
    find . -size +100M                 # size
    find . -mtime -7                   # modified in last 7 days
    find . -user alice                 # owner
    find . -perm -4000                 # SUID files
    find . -exec cmd {} \;             # execute command
    find . -exec cmd {} +              # pass all at once (faster)
    find . -delete                     # delete
    find . -maxdepth 2                 # limit depth
    find . -print0 | xargs -0 cmd      # safe with spaces in filenames

### grep

    grep -i                            # case insensitive
    grep -v                            # invert
    grep -n                            # line numbers
    grep -c                            # count only
    grep -l / -L                       # files with / without matches
    grep -r                            # recursive
    grep -w                            # whole word
    grep -o                            # only match
    grep -A/-B/-C n                    # context after/before/around
    grep -E                            # extended regex
    grep -P                            # Perl regex
    grep -F                            # fixed string (fast)
    grep -q                            # quiet mode (exit code only)

### awk

    awk '{print $1}'                   # first field
    awk '{print $NF}'                  # last field
    awk -F:                            # separator
    awk 'NR==5'                        # line 5
    awk 'NR>=3&&NR<=7'                 # line range
    awk '/pattern/'                    # lines with pattern
    awk '$2>100'                       # condition on field
    awk '{sum+=$1} END {print sum}'    # sum column
    awk '!seen[$0]++'                  # remove duplicates
    awk -v var=val                     # pass variable
    awk 'BEGIN{} {} END{}'             # blocks

### sed

    sed 's/old/new/'                   # replace first
    sed 's/old/new/g'                  # replace all
    sed 's/old/new/gi'                 # case insensitive
    sed -E 's/(a)(b)/\2\1/'           # capture groups (ERE)
    sed '/pattern/d'                   # delete lines
    sed '/^#/d; /^$/d'                 # delete comments and empty
    sed -n '5,10p'                     # print lines 5-10
    sed -n '/pat/p'                    # print matches
    sed '3i\text'                      # insert before line
    sed '3a\text'                      # insert after line
    sed -i 's/old/new/g' file          # edit in place
    sed -i.bak 's/old/new/g' file      # with backup

---

## References

- [GNU find manual](https://www.gnu.org/software/findutils/manual/html_mono/find.html)
- [GNU grep manual](https://www.gnu.org/software/grep/manual/grep.html)
- [GNU awk manual](https://www.gnu.org/software/gawk/manual/gawk.html)
- [GNU sed manual](https://www.gnu.org/software/sed/manual/sed.html)
- `man find`, `man grep`, `man awk`, `man sed`
- [The AWK Programming Language](https://ia903404.us.archive.org/0/items/pdfy-MgN0H1joIoDVoIC7/The_AWK_Programming_Language.pdf) - book by the authors of awk
