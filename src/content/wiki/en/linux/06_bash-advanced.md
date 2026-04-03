# Bash Scripting — Functions, Arrays, Regex

A deep-dive continuation of Bash scripting. Covers advanced functions, all array types, and working with regular expressions using both built-in Bash facilities and external tools.

---

## Functions — In Depth

### Declaration and calling

```bash
# Two syntaxes — both valid
greet() {
    echo "Hello, $1!"
}

function greet {
    echo "Hello, $1!"
}

# Call — just the name
greet "Alice"
```

### Function arguments

```bash
show_args() {
    echo "Function name: ${FUNCNAME[0]}"
    echo "Argument count: $#"
    echo "All arguments: $@"
    echo "First: $1"
    echo "Second: $2"

    for arg in "$@"; do
        echo "  - $arg"
    done
}

show_args "foo" "bar" "baz"
```

### local — scoping

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

# Without local — the variable is global (dangerous!)
bad_func() {
    result=42               # creates/overwrites a global variable!
}

good_func() {
    local result=42
    echo "$result"
}
```

### Return values

Bash functions don't return values the way other languages do. Two common approaches:

```bash
# Approach 1: via stdout (most common)
get_date() {
    date +%Y-%m-%d
}

today=$(get_date)
echo "Today: $today"

# Approach 2: via a nameref variable (bash 4.3+)
get_os_info() {
    local -n _result=$1     # nameref — a reference to a variable by name
    _result=$(uname -s)
}

get_os_info my_os
echo "OS: $my_os"

# Exit code: 0 = success, 1-255 = failure
is_file() {
    [[ -f "$1" ]]           # returns 0 or 1
}

is_number() {
    [[ "$1" =~ ^[0-9]+$ ]]
}

if is_file "/etc/passwd"; then
    echo "file exists"
fi

if is_number "42"; then
    echo "it's a number"
fi
```

### Recursion

```bash
# Factorial
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

# Directory walker
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

### Functions as arguments (callbacks)

```bash
# Pass a function name as an argument
apply() {
    local func="$1"
    shift
    "$func" "$@"             # call via name
}

double() { echo $(( $1 * 2 )); }
square() { echo $(( $1 * $1 )); }

apply double 5              # 10
apply square 5              # 25

# Higher-order function — map
map() {
    local func="$1"
    shift
    for item in "$@"; do
        "$func" "$item"
    done
}

map double 1 2 3 4 5        # 2 4 6 8 10
```

### Decorators

```bash
# Wrap a function (logging decorator)
log_call() {
    local func="$1"
    shift
    echo "[LOG] Calling: $func $*" >&2
    "$func" "$@"
    local exit_code=$?
    echo "[LOG] Done: $func (code: $exit_code)" >&2
    return $exit_code
}

my_command() {
    echo "Doing work..."
    return 0
}

log_call my_command arg1 arg2

# Memoization (result caching)
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

# Second call is instant
memoize slow_compute 5      # waits 1 second
memoize slow_compute 5      # instant from cache
```

### FUNCNAME and the call stack

```bash
show_stack() {
    echo "Call stack:"
    for i in "${!FUNCNAME[@]}"; do
        echo "  [$i] ${FUNCNAME[$i]} (${BASH_SOURCE[$i]}:${BASH_LINENO[$i-1]})"
    done
}

level3() { show_stack; }
level2() { level3; }
level1() { level2; }

level1
# Call stack:
#   [0] show_stack (script.sh:3)
#   [1] level3 (script.sh:6)
#   [2] level2 (script.sh:7)
#   [3] level1 (script.sh:8)
#   [4] main (script.sh:10)
```

---

## Arrays — In Depth

### Indexed arrays

```bash
# Declaration
declare -a fruits
fruits=("apple" "banana" "cherry" "date")

# Add elements
fruits+=("elderberry")
fruits[10]="fig"            # sparse array!

# Access
echo "${fruits[0]}"         # apple
echo "${fruits[-1]}"        # last element (bash 4.3+)
echo "${fruits[@]}"         # all elements
echo "${!fruits[@]}"        # all indices: 0 1 2 3 4 10
echo "${#fruits[@]}"        # element count: 6

# Slice
echo "${fruits[@]:1:3}"     # banana cherry date (start at 1, length 3)
echo "${fruits[@]: -2}"     # last 2 elements

# Delete
unset fruits[2]             # delete one element
unset fruits                # delete the whole array
```

### Array operations

```bash
arr=(10 5 8 3 9 1 7 2 6 4)

# Sort (via readarray)
readarray -t sorted < <(printf '%s\n' "${arr[@]}" | sort -n)
echo "${sorted[@]}"         # 1 2 3 4 5 6 7 8 9 10

# Sort strings
words=("banana" "apple" "cherry" "date")
readarray -t sorted_words < <(printf '%s\n' "${words[@]}" | sort)

# Unique elements
arr=(1 2 2 3 3 3 4)
readarray -t unique < <(printf '%s\n' "${arr[@]}" | sort -u)
echo "${unique[@]}"         # 1 2 3 4

# Search for an element
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
    echo "found banana"
fi

# Filter
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

# Transform (map)
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

### Associative arrays

```bash
# Declaration — declare -A is required
declare -A config
config[host]="localhost"
config[port]="5432"
config[user]="postgres"
config[password]="secret"

# Or all at once
declare -A colors=(
    [red]="#FF0000"
    [green]="#00FF00"
    [blue]="#0000FF"
)

# Access
echo "${config[host]}"          # localhost
echo "${!config[@]}"            # all keys
echo "${config[@]}"             # all values
echo "${#config[@]}"            # number of pairs

# Check if a key exists
if [[ -v config[host] ]]; then
    echo "key host exists"
fi

# Delete a key
unset config[password]

# Iterate
for key in "${!config[@]}"; do
    echo "$key = ${config[$key]}"
done

# Iterate in sorted order
for key in $(echo "${!config[@]}" | tr ' ' '\n' | sort); do
    echo "$key = ${config[$key]}"
done
```

### Associative array as a simple database

```bash
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
echo "root UID: $(get_user_field root uid)"
echo "alice home: $(get_user_field alice home)"
```

### Multi-dimensional arrays (emulated)

```bash
# Bash doesn't support multi-dimensional arrays natively
# Emulate via composite keys

declare -A matrix

# Fill a 3x3 matrix
for i in {0..2}; do
    for j in {0..2}; do
        matrix[$i,$j]=$(( i * 3 + j ))
    done
done

# Print the matrix
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

# Nested data via JSON (with jq)
data='{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}'
mapfile -t names < <(echo "$data" | jq -r '.users[].name')
echo "${names[@]}"          # Alice Bob
```

### readarray / mapfile

```bash
# Load a file into an array (one line per element)
readarray -t lines < /etc/passwd
echo "Lines: ${#lines[@]}"
echo "First: ${lines[0]}"

# Load command output
readarray -t processes < <(ps aux | awk 'NR>1 {print $11}')

# Load with a custom delimiter
readarray -t -d ',' fields <<< "alice,30,admin,"
echo "${fields[@]}"

# mapfile — synonym for readarray
mapfile -t hosts < /etc/hosts

# With a starting index
mapfile -t -O 10 arr < file.txt    # start filling from index 10
```

---

## Regular Expressions

### =~ in [[ ]]

```bash
# Syntax: [[ string =~ pattern ]]
# Returns 0 (true) on match

# Basic patterns
[[ "hello123" =~ [0-9]+ ]]      && echo "contains digits"
[[ "hello" =~ ^[a-z]+$ ]]       && echo "only lowercase"
[[ "user@mail.com" =~ @ ]]      && echo "contains @"

# BASH_REMATCH — match results
str="Date: 2024-03-15"
if [[ "$str" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2}) ]]; then
    echo "Full match:  ${BASH_REMATCH[0]}"   # 2024-03-15
    echo "Year:  ${BASH_REMATCH[1]}"         # 2024
    echo "Month: ${BASH_REMATCH[2]}"         # 03
    echo "Day:   ${BASH_REMATCH[3]}"         # 15
fi
```

### Regex syntax (ERE)

```bash
# Anchors
^           # start of string
$           # end of string
\b          # word boundary

# Character classes
[abc]       # a, b, or c
[^abc]      # not a, b, or c
[a-z]       # lowercase letters
[A-Z]       # uppercase letters
[0-9]       # digits
[a-zA-Z]    # any letter
[a-zA-Z0-9] # letter or digit

# Metacharacters
.           # any character except \n
\d          # digit (not in bash =~, use [0-9])
\w          # word char [a-zA-Z0-9_]
\s          # whitespace [ \t\n]

# Quantifiers
*           # 0 or more
+           # 1 or more
?           # 0 or 1 (optional)
{n}         # exactly n times
{n,}        # n or more times
{n,m}       # between n and m times

# Groups and alternation
(abc)       # capturing group
(a|b)       # a or b
(?:abc)     # non-capturing group (not in bash =~)
```

### Practical patterns

```bash
# IPv4 validation
is_valid_ip() {
    local ip="$1"
    local octet="(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    [[ "$ip" =~ ^${octet}\.${octet}\.${octet}\.${octet}$ ]]
}

is_valid_ip "192.168.1.1"   && echo "valid IP"
is_valid_ip "256.0.0.1"     || echo "invalid IP"
is_valid_ip "192.168.1"     || echo "invalid IP"

# Email validation (simplified)
is_valid_email() {
    [[ "$1" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]
}

is_valid_email "user@example.com"   && echo "valid"
is_valid_email "not-an-email"       || echo "invalid"

# Port number validation
is_valid_port() {
    [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 ))
}

# Semver check
is_semver() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Extract numbers from a string
str="The file has 42 lines and 7 errors"
if [[ "$str" =~ ([0-9]+)\ lines ]]; then
    echo "Lines: ${BASH_REMATCH[1]}"    # 42
fi

# Hex color validation
is_hex_color() {
    [[ "$1" =~ ^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$ ]]
}

is_hex_color "#FF0000"  && echo "valid"
is_hex_color "#GG0000"  || echo "invalid"

# URL parsing
parse_url() {
    local url="$1"
    if [[ "$url" =~ ^(https?)://([^/:]+)(:([0-9]+))?(/.*)?$ ]]; then
        echo "Protocol: ${BASH_REMATCH[1]}"
        echo "Host:     ${BASH_REMATCH[2]}"
        echo "Port:     ${BASH_REMATCH[4]:-default}"
        echo "Path:     ${BASH_REMATCH[5]:-/}"
    fi
}

parse_url "https://example.com:8080/api/v1"
# Protocol: https
# Host:     example.com
# Port:     8080
# Path:     /api/v1
```

---

## grep — Pattern Search

```bash
# Basic search
grep "pattern" file.txt
grep "error" /var/log/syslog

# Flags
grep -i "error" file.txt          # case-insensitive
grep -v "debug" file.txt          # invert (lines NOT matching)
grep -n "error" file.txt          # show line numbers
grep -c "error" file.txt          # count matches
grep -l "error" /var/log/*.log    # only filenames
grep -r "TODO" ./src/             # recursive search
grep -w "port" file.txt           # whole word only
grep -A 3 "error" file.txt        # 3 lines after match
grep -B 3 "error" file.txt        # 3 lines before
grep -C 3 "error" file.txt        # 3 lines before and after

# BRE (Basic RE) — default
grep "^root" /etc/passwd
grep "bash$" /etc/passwd
grep "[0-9]\{3\}" file.txt        # BRE: escaped braces

# ERE (Extended RE) — grep -E or egrep
grep -E "error|warning" file.txt
grep -E "^[0-9]{4}-[0-9]{2}" log.txt
grep -E "(FAIL|ERROR|CRIT)" /var/log/syslog

# PCRE — grep -P (not available everywhere)
grep -P "\d{4}-\d{2}-\d{2}" log.txt
grep -P "(?<=port=)\d+" config.txt    # lookbehind

# Useful one-liners
grep -E "^[^#]" /etc/ssh/sshd_config      # non-comment lines only
grep -oE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" access.log   # extract IPs
grep -oE "\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b" file.txt  # emails
```

---

## sed — Stream Editing

```bash
# Basic substitution
sed 's/old/new/' file.txt           # first match per line
sed 's/old/new/g' file.txt          # all matches
sed 's/old/new/gi' file.txt         # case-insensitive

# Edit in place
sed -i 's/old/new/g' file.txt
sed -i.bak 's/old/new/g' file.txt   # with backup

# Line addressing
sed '3s/old/new/' file.txt          # line 3 only
sed '1,5s/old/new/' file.txt        # lines 1-5
sed '/pattern/s/old/new/' file.txt  # lines matching pattern

# Delete lines
sed '3d' file.txt                   # delete line 3
sed '/^#/d' file.txt                # delete comments
sed '/^$/d' file.txt                # delete empty lines
sed '/pattern/d' file.txt           # delete matching lines

# Print specific lines
sed -n '5,10p' file.txt             # lines 5-10
sed -n '/start/,/end/p' file.txt    # from start to end

# Capture groups in sed (BRE)
echo "2024-03-15" | sed 's/\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)/\3.\2.\1/'
# 15.03.2024

# ERE in sed
sed -E 's/([0-9]{4})-([0-9]{2})-([0-9]{2})/\3.\2.\1/' <<< "2024-03-15"
# 15.03.2024

# Practical examples
# Change port in a config
sed -i 's/^Port .*/Port 2222/' /etc/ssh/sshd_config

# Comment out a line
sed -i 's/^PermitRootLogin/#PermitRootLogin/' /etc/ssh/sshd_config

# Uncomment a line
sed -i 's/^#Port/Port/' /etc/ssh/sshd_config

# Remove leading/trailing whitespace
sed 's/^[[:space:]]*//' file.txt    # leading
sed 's/[[:space:]]*$//' file.txt    # trailing
```

---

## awk — Text Processing

```bash
# Basic syntax: awk 'pattern { action }' file

# Print columns
awk '{print $1}' file.txt           # first column
awk '{print $1, $3}' file.txt       # first and third
awk '{print NR, $0}' file.txt       # with line numbers
awk '{print NF, $0}' file.txt       # field count

# Field separator
awk -F: '{print $1}' /etc/passwd
awk -F, '{print $2}' data.csv
awk 'BEGIN{FS=":"} {print $1}' /etc/passwd

# Conditionals
awk '$3 > 1000 {print $1}' /etc/passwd      # UID > 1000
awk '/bash$/ {print $1}' /etc/passwd        # lines ending in bash
awk '$1 ~ /^root/ {print}' /etc/passwd      # regex on a field

# BEGIN and END
awk 'BEGIN {print "=== Start ==="} {print} END {print "=== End ==="}' file.txt

# Aggregation
awk 'END {print NR}' file.txt               # line count
awk '{sum += $1} END {print sum}' nums.txt  # sum of first field

# Group and count
awk -F: '{count[$7]++} END {for (shell in count) print count[shell], shell}' /etc/passwd \
    | sort -rn
# User count by shell

# Find high-CPU processes
ps aux | awk 'NR>1 && $3>10 {printf "%-20s %s%%\n", $11, $3}'

# Process CSV
awk -F, 'NR>1 {
    sum += $3
    count++
}
END {
    print "Average:", sum/count
}' sales.csv
```

---

## Complete Examples

### Config file parser

```bash
#!/usr/bin/env bash
# Parse an INI-style config file

declare -A config

parse_config() {
    local file="$1"
    local section=""

    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ "$line" =~ ^[[:space:]]*(#|;|$) ]] && continue

        # Section header [section]
        if [[ "$line" =~ ^\[([^\]]+)\] ]]; then
            section="${BASH_REMATCH[1]}"
            continue
        fi

        # key = value
        if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
            local key="${BASH_REMATCH[1]// /}"
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

# Test
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

### Input validator library

```bash
#!/usr/bin/env bash

validate_required() {
    local name="$1" val="$2"
    [[ -n "$val" ]] || { echo "Error: $name is required" >&2; return 1; }
}

validate_integer() {
    local name="$1" val="$2"
    [[ "$val" =~ ^-?[0-9]+$ ]] || { echo "Error: $name must be an integer" >&2; return 1; }
}

validate_range() {
    local name="$1" val="$2" min="$3" max="$4"
    validate_integer "$name" "$val" || return 1
    (( val >= min && val <= max )) || { echo "Error: $name must be between $min and $max" >&2; return 1; }
}

validate_email() {
    local name="$1" val="$2"
    [[ "$val" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] \
        || { echo "Error: $name is not a valid email" >&2; return 1; }
}

validate_url() {
    local name="$1" val="$2"
    [[ "$val" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$ ]] \
        || { echo "Error: $name is not a valid URL" >&2; return 1; }
}

validate_ip() {
    local name="$1" val="$2"
    local octet="(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    [[ "$val" =~ ^${octet}\.${octet}\.${octet}\.${octet}$ ]] \
        || { echo "Error: $name is not a valid IP address" >&2; return 1; }
}

# Usage
read -p "Email: " email
read -p "Port: " port
read -p "IP: " ip

validate_required "email" "$email" || exit 1
validate_email "email" "$email" || exit 1
validate_range "port" "$port" 1 65535 || exit 1
validate_ip "IP" "$ip" || exit 1

echo "All inputs are valid!"
```

### Log file analyzer

```bash
#!/usr/bin/env bash
# Analyze nginx access.log

analyze_logs() {
    local logfile="$1"
    declare -A status_counts
    declare -A ip_counts
    local total=0

    # nginx access log pattern:
    # IP - - [date] "METHOD path protocol" status bytes
    local pattern='^([0-9.]+) .* "([A-Z]+) ([^ ]+) [^"]+" ([0-9]+) ([0-9]+)'

    while IFS= read -r line; do
        if [[ "$line" =~ $pattern ]]; then
            local ip="${BASH_REMATCH[1]}"
            local status="${BASH_REMATCH[4]}"

            ((total++))
            ((status_counts[$status]++))
            ((ip_counts[$ip]++))
        fi
    done < "$logfile"

    echo "=== Analysis: $logfile ==="
    echo "Total requests: $total"
    echo ""
    echo "Status codes:"
    for status in $(echo "${!status_counts[@]}" | tr ' ' '\n' | sort -n); do
        printf "  %s: %d\n" "$status" "${status_counts[$status]}"
    done
    echo ""
    echo "Top 5 IP addresses:"
    for ip in "${!ip_counts[@]}"; do
        echo "${ip_counts[$ip]} $ip"
    done | sort -rn | head -5 | while read count ip; do
        printf "  %-20s %d requests\n" "$ip" "$count"
    done
}

analyze_logs /var/log/nginx/access.log
```

### Template engine

```bash
#!/usr/bin/env bash
# Simple template engine — replaces {{VAR}} with values

render_template() {
    local template="$1"
    local output="$2"
    shift 2

    declare -A vars
    for pair in "$@"; do
        local key="${pair%%=*}"
        local val="${pair#*=}"
        vars["$key"]="$val"
    done

    local content
    content=$(<"$template")

    for key in "${!vars[@]}"; do
        content="${content//\{\{${key}\}\}/${vars[$key]}}"
    done

    echo "$content" > "$output"
}

# Create a template
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

# Render it
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

## Cheat Sheet

```bash
# Functions
func() { local x="$1"; echo "$x"; }
result=$(func arg)                      # capture stdout
${FUNCNAME[0]}                          # current function name
declare -n ref=$varname                 # nameref

# Indexed arrays
arr=(a b c)
arr+=("d")                              # append
echo "${arr[@]}"                        # all elements
echo "${arr[0]}"                        # by index
echo "${arr[-1]}"                       # last element
echo "${#arr[@]}"                       # count
echo "${!arr[@]}"                       # indices
echo "${arr[@]:1:2}"                    # slice
readarray -t arr < file                 # load from file

# Associative arrays
declare -A map
map[key]="val"
echo "${map[key]}"
[[ -v map[key] ]]                       # check key exists
echo "${!map[@]}"                       # all keys

# Regex in bash
[[ "$str" =~ pattern ]]                 # test match
[[ "$str" =~ (group) ]]                 # with capture
echo "${BASH_REMATCH[0]}"               # full match
echo "${BASH_REMATCH[1]}"               # first group

# grep
grep -E "pat1|pat2" file                # ERE
grep -oE "pattern" file                 # match only
grep -P "\d+" file                      # PCRE

# sed
sed 's/old/new/g' file                  # replace all
sed -i.bak 's/old/new/g' file          # in-place with backup
sed -E 's/(group)/\1/' file            # ERE with group
sed '/pattern/d' file                   # delete lines

# awk
awk '{print $1}' file                   # first field
awk -F: '{print $1}' file              # custom separator
awk '/pat/ {print}' file               # filter
awk '{sum+=$1} END{print sum}' file    # aggregate
```

---

## References

- [Bash Arrays](https://www.gnu.org/software/bash/manual/bash.html#Arrays) — official docs
- [Regex101](https://regex101.com/) — test regular expressions
- [grep manual](https://www.gnu.org/software/grep/manual/grep.html) — all grep flags
- [sed manual](https://www.gnu.org/software/sed/manual/sed.html) — sed documentation
- [awk manual](https://www.gnu.org/software/gawk/manual/gawk.html) — gawk reference
