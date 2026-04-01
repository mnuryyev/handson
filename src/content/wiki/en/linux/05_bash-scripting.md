---
title: "Bash Scripting - Variables, Loops, Conditionals"
date: "2026-04-01"
---

Bash (Bourne Again Shell) is a command interpreter and scripting language, the standard shell on most Linux systems. Scripts automate routine tasks: deployment, backups, system administration, and more.

---

## First Script

```bash
#!/usr/bin/env bash
# Shebang — specifies the interpreter
# Comments start with #

echo "Hello, World!"
```

```bash
# Create and run
nano hello.sh
chmod +x hello.sh
./hello.sh

# Or without chmod
bash hello.sh
```

### Best practices at the top of every script

```bash
#!/usr/bin/env bash
set -e          # exit on error
set -u          # error on unset variables
set -o pipefail # catch errors in pipes
set -x          # debug: print each command before executing

# Short form
set -euo pipefail
```

---

## Variables

### Declaring and using

```bash
# Assignment - no spaces around =
name="Alice"
age=30
path=/home/alice

# Using — $ prefix
echo $name
echo "Hello, $name"
echo "Age: ${age}"        # braces make the boundary explicit

# Wrong (spaces cause an error)
name = "Alice"   # error!
```

### Quoting

```bash
name="Alice Smith"

echo $name          # Alice Smith (works, but risky)
echo "$name"        # Alice Smith (correct, double quotes)
echo '$name'        # $name (single quotes — no substitution)
echo "${name}"      # Alice Smith (explicit variable boundary)

# Why quoting matters
file="my file.txt"
rm $file            # tries to remove "my" and "file.txt" — error!
rm "$file"          # removes "my file.txt" — correct
```

### Special variables

```bash
$0          # script name
$1, $2 ...  # command-line arguments
$#          # number of arguments
$@          # all arguments (as separate words)
$*          # all arguments (as a single string)
$?          # exit code of the last command (0 = success)
$$          # PID of the current process (script)
$!          # PID of the last background process
$_          # last argument of the previous command

# Example
#!/usr/bin/env bash
echo "Script: $0"
echo "First arg: $1"
echo "Second arg: $2"
echo "Arg count: $#"
echo "All args: $@"
```

```bash
# Run: ./script.sh foo bar baz
# Script: ./script.sh
# First arg: foo
# Second arg: bar
# Arg count: 3
# All args: foo bar baz
```

### Command substitution

```bash
# Capture command output into a variable
date_now=$(date +%Y-%m-%d)
user_count=$(wc -l < /etc/passwd)
hostname=$(hostname -f)

echo "Date: $date_now"
echo "Users: $user_count"

# Legacy syntax (avoid)
date_now=`date +%Y-%m-%d`
```

### Arithmetic

```bash
a=10
b=3

# Arithmetic expansion
echo $((a + b))     # 13
echo $((a - b))     # 7
echo $((a * b))     # 30
echo $((a / b))     # 3  (integer division)
echo $((a % b))     # 1  (remainder)
echo $((a ** b))    # 1000 (exponentiation)

# Assignment with calculation
result=$((a * b + 5))
((result++))        # increment
((result--))        # decrement
((result += 10))    # add and assign

# Floating point — use bc
echo "scale=2; 10 / 3" | bc    # 3.33
pi=$(echo "scale=10; 4*a(1)" | bc -l)
```

### String operations

```bash
str="Hello, World!"

# String length
echo ${#str}                    # 13

# Substring
echo ${str:0:5}                 # Hello
echo ${str:7}                   # World!
echo ${str: -6}                 # orld! (from end, space required)

# Substitution
echo ${str/World/Linux}         # Hello, Linux!  (first match)
echo ${str//l/L}                # HeLLo, WorLd!  (all matches)

# Pattern removal
file="archive.tar.gz"
echo ${file%.gz}                # archive.tar    (remove .gz from end)
echo ${file%%.*}                # archive        (remove from first dot)
echo ${file#*.}                 # tar.gz         (remove up to first dot)
echo ${file##*.}                # gz             (remove up to last dot)

# Case conversion (bash 4+)
echo ${str,,}                   # hello, world!  (lowercase)
echo ${str^^}                   # HELLO, WORLD!  (uppercase)
echo ${str^}                    # Hello, world!  (capitalize first)

# Default values
echo ${name:-"Unknown"}         # Unknown if name is empty or unset
echo ${name:="Default"}         # Default and assigns to the variable
echo ${name:?"Error: not set"}  # error if name is not set
echo ${name:+"has value"}       # "has value" if name is set
```

---

## Arrays

```bash
# Indexed array
fruits=("apple" "banana" "cherry")
fruits[3]="date"

echo ${fruits[0]}               # apple
echo ${fruits[@]}               # all elements
echo ${#fruits[@]}              # element count
echo ${!fruits[@]}              # indices

# Array slice
echo ${fruits[@]:1:2}           # banana cherry (start at 1, length 2)

# Append an element
fruits+=("elderberry")

# Delete an element
unset fruits[1]

# Iterate
for fruit in "${fruits[@]}"; do
    echo "$fruit"
done

# Associative array (bash 4+)
declare -A user
user[name]="Alice"
user[age]=30
user[role]="admin"

echo ${user[name]}              # Alice
echo ${!user[@]}                # all keys
echo ${user[@]}                 # all values

for key in "${!user[@]}"; do
    echo "$key = ${user[$key]}"
done
```

---

## Conditionals

### if / elif / else

```bash
if [ condition ]; then
    commands
elif [ other_condition ]; then
    commands
else
    commands
fi
```

```bash
age=25

if [ $age -lt 18 ]; then
    echo "minor"
elif [ $age -lt 65 ]; then
    echo "adult"
else
    echo "senior"
fi
```

### Comparison operators

#### Numbers

```bash
[ $a -eq $b ]    # a == b  (equal)
[ $a -ne $b ]    # a != b  (not equal)
[ $a -lt $b ]    # a < b   (less than)
[ $a -le $b ]    # a <= b  (less or equal)
[ $a -gt $b ]    # a > b   (greater than)
[ $a -ge $b ]    # a >= b  (greater or equal)
```

#### Strings

```bash
[ "$a" = "$b" ]     # strings are equal
[ "$a" == "$b" ]    # same (bash)
[ "$a" != "$b" ]    # strings are not equal
[ -z "$a" ]         # string is empty (zero length)
[ -n "$a" ]         # string is non-empty
[ "$a" < "$b" ]     # lexicographically less than
```

#### Files and directories

```bash
[ -e "$path" ]      # exists
[ -f "$path" ]      # is a regular file
[ -d "$path" ]      # is a directory
[ -L "$path" ]      # is a symlink
[ -r "$path" ]      # readable
[ -w "$path" ]      # writable
[ -x "$path" ]      # executable
[ -s "$path" ]      # exists and is non-empty (size > 0)
[ -p "$path" ]      # is a named pipe
[ "$a" -nt "$b" ]   # a is newer than b
[ "$a" -ot "$b" ]   # a is older than b
```

#### Logical operators

```bash
[ cond1 ] && [ cond2 ]   # AND
[ cond1 ] || [ cond2 ]   # OR
! [ condition ]           # NOT

# Inside [ ]
[ -f "$f" -a -r "$f" ]   # AND inside brackets
[ -f "$f" -o -d "$f" ]   # OR inside brackets

# [[ ]] - extended conditionals (bash, not POSIX)
[[ $a == "foo" && $b != "bar" ]]
[[ $str =~ ^[0-9]+$ ]]          # regex matching
[[ $str == *.txt ]]             # glob matching
```

### [ ] vs [[ ]] vs (( ))

```bash
# [ ]   - POSIX compatible, requires careful quoting
# [[ ]] - bash-specific, safer, supports regex and glob
# (( )) - arithmetic evaluation only

# Recommended: [[ ]] in bash scripts
if [[ -f "$file" && -r "$file" ]]; then
    cat "$file"
fi

# (( )) for numbers
if (( a > 10 && b < 20 )); then
    echo "in range"
fi
```

### case

```bash
read -p "Choose your OS: " os

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
        echo "Unknown OS: $os"
        exit 1
        ;;
esac
```

---

## Loops

### for — iterate over items

```bash
# Iterate over a list
for name in Alice Bob Carol; do
    echo "Hello, $name!"
done

# Iterate over files
for file in /var/log/*.log; do
    echo "Processing: $file"
    wc -l "$file"
done

# Numeric range
for i in {1..10}; do
    echo "Iteration $i"
done

# With a step
for i in {0..100..10}; do
    echo "$i"
done

# C-style
for ((i=0; i<10; i++)); do
    echo "i = $i"
done

# Iterate over an array
fruits=("apple" "banana" "cherry")
for fruit in "${fruits[@]}"; do
    echo "$fruit"
done
```

### while - loop with condition

```bash
# Basic while
count=0
while [ $count -lt 5 ]; do
    echo "count = $count"
    ((count++))
done

# Read a file line by line (the correct way)
while IFS= read -r line; do
    echo "$line"
done < /etc/passwd

# Read command output
while IFS= read -r line; do
    echo "User: $line"
done < <(getent passwd | grep "/bin/bash")

# Infinite loop
while true; do
    echo "Running..."
    sleep 10
done

# Parse CSV
while IFS=',' read -r name age city; do
    echo "Name: $name, Age: $age, City: $city"
done < users.csv
```

### until - loop until true

```bash
# Opposite of while — runs while condition is FALSE
count=0
until [ $count -ge 5 ]; do
    echo "count = $count"
    ((count++))
done

# Wait for a service to become ready
until curl -s http://localhost:8080/health > /dev/null; do
    echo "Waiting for service..."
    sleep 2
done
echo "Service is up!"
```

### Loop control

```bash
# break — exit the loop
for i in {1..10}; do
    if [ $i -eq 5 ]; then
        break
    fi
    echo "$i"
done

# continue — skip to next iteration
for i in {1..10}; do
    if (( i % 2 == 0 )); then
        continue         # skip even numbers
    fi
    echo "$i"            # prints odd numbers only
done

# break/continue with a level (nested loops)
for i in {1..3}; do
    for j in {1..3}; do
        if (( i == 2 && j == 2 )); then
            break 2      # exit BOTH loops
        fi
        echo "$i $j"
    done
done
```

---

## Functions

```bash
# Declare a function
greet() {
    echo "Hello, $1!"          # $1 - first argument to the function
}

# Call it
greet "Alice"
greet "World"

# Function with a return value
get_user_home() {
    local user="$1"            # local - variable is scoped to the function
    local home
    home=$(getent passwd "$user" | cut -d: -f6)
    echo "$home"               # "return" via stdout
}

home=$(get_user_home "alice")
echo "Home directory: $home"

# Return code from a function
is_root() {
    [ "$(id -u)" -eq 0 ]       # 0 = success = true
}

if is_root; then
    echo "Running as root"
else
    echo "Not root"
fi

# Function with local variables
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
echo "Backup created: $backup_path"
```

---

## Input and Output

```bash
# read — read user input
read -p "Enter name: " name
read -s -p "Enter password: " password   # -s = silent input
echo ""                                   # newline after silent input
read -t 10 -p "You have 10 seconds: " answer  # timeout

# Read multiple values
read -p "Enter name and age: " name age
echo "Name: $name, Age: $age"

# Redirect output
echo "error message" >&2           # to stderr
echo "log entry" >> /var/log/my.log # append to file

# heredoc
cat << 'EOF'
This is multi-line text
with no variable substitution
EOF

cat << EOF
Name: $name
Date: $(date)
EOF

# Write heredoc to a file
cat > /etc/myapp/config.conf << EOF
host=localhost
port=8080
user=$name
EOF
```

---

## Error Handling

```bash
# Check return code
if ! command -v git &>/dev/null; then
    echo "Error: git is not installed" >&2
    exit 1
fi

# trap — intercept signals and errors
cleanup() {
    echo "Cleaning up temporary files..."
    rm -f /tmp/myscript_*
}

trap cleanup EXIT              # run on any exit
trap cleanup INT TERM          # run on Ctrl+C or kill

# Error handling with exit codes
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

some_command > "$TMPFILE" || {
    echo "Command failed" >&2
    exit 1
}

# Helper functions for output
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

# Usage
[ -f "$config" ] || error "Config not found: $config"
```

---

## Practical Patterns

### Argument parsing

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 [options] <file>"
    echo ""
    echo "Options:"
    echo "  -h, --help     show this help"
    echo "  -v, --verbose  verbose output"
    echo "  -o DIR         output directory"
    exit 0
}

verbose=false
output_dir="."

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage ;;
        -v|--verbose) verbose=true ;;
        -o) output_dir="$2"; shift ;;
        -*) echo "Unknown flag: $1" >&2; exit 1 ;;
        *) input_file="$1" ;;
    esac
    shift
done

[ -z "${input_file:-}" ] && { echo "Error: specify a file" >&2; exit 1; }
[ -f "$input_file" ] || { echo "File not found: $input_file" >&2; exit 1; }
```

### Logging

```bash
LOG_FILE="/var/log/myscript.log"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

log INFO "Script started"
log WARN "Something looks off"
log ERROR "Something went wrong"
```

### Lock file (single instance)

```bash
LOCKFILE="/tmp/myscript.lock"

if [ -e "$LOCKFILE" ]; then
    echo "Script already running (PID: $(cat $LOCKFILE))" >&2
    exit 1
fi

echo $$ > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT
```

### Progress bar

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

### Parallel execution

```bash
# Run tasks in parallel
process_file() {
    local file="$1"
    echo "Processing $file"
    sleep 1  # simulate work
}

export -f process_file

# With xargs
find /data -name "*.log" | xargs -P 4 -I {} bash -c 'process_file "$@"' _ {}

# With GNU parallel
find /data -name "*.log" | parallel -j 4 process_file {}

# Manually with wait
for file in /data/*.log; do
    process_file "$file" &
done
wait        # wait for all background jobs
echo "All tasks complete"
```

---

## Debugging

```bash
# Debug mode: prints every command
bash -x script.sh

# Enable/disable inside script
set -x      # enable tracing
set +x      # disable tracing

# Wrap only a section
set -x
critical_function
set +x

# Syntax check without executing
bash -n script.sh

# Verbose mode (echo every line)
bash -v script.sh

# shellcheck — static bash analyzer
apt install shellcheck
shellcheck script.sh
```

---

## Cheat Sheet

```bash
# Variables
var="value"         # declare
echo "$var"         # use
echo "${var}text"   # explicit boundary
${var:-default}     # default value
${#var}             # string length
${var/old/new}      # replace

# Conditionals
[[ -f "$f" ]]       # file exists
[[ -d "$d" ]]       # directory exists
[[ -z "$s" ]]       # string is empty
[[ -n "$s" ]]       # string is non-empty
[[ $a == $b ]]      # strings equal
(( a > b ))         # numeric comparison

# Loops
for i in {1..10}; do ... done
for f in *.txt; do ... done
while IFS= read -r line; do ... done < file
until [[ condition ]]; do ... done

# Functions
func() { local var="$1"; echo "$var"; }
result=$(func arg)

# Error output
echo "error" >&2
exit 1
```

---

## References

- [Bash Manual](https://www.gnu.org/software/bash/manual/) - official documentation
- [Bash Hackers Wiki](https://wiki.bash-hackers.org/) - in-depth reference
- [ShellCheck](https://www.shellcheck.net/) - online script analyzer
- [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html) - style guide
