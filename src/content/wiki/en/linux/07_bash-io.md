---
title: "Bash Scripting - File Handling, stdin/stdout/stderr"
date: "2026-04-06"
---

I/O streams and file handling are the backbone of any serious script.

---

## File Descriptors

Every process in Linux gets three standard streams:

| FD | Name | Symbol | Description |
|----|------|--------|-------------|
| `0` | stdin | Standard input | Where the program reads from |
| `1` | stdout | Standard output | Where normal output goes |
| `2` | stderr | Standard error | Where error messages go |

```bash
# Visualized
#
#          ┌─────────────┐
# stdin  ──►             ├──► stdout
#    [0]   │   process   │         [1]
# stderr ◄─┤             │
#    [2]   └─────────────┘
#

# Check the open descriptors of the current shell
ls -la /proc/$$/fd
# lrwx------ 0 -> /dev/pts/0   (stdin  — terminal)
# lrwx------ 1 -> /dev/pts/0   (stdout — terminal)
# lrwx------ 2 -> /dev/pts/0   (stderr — terminal)
```

---

## Output Redirection

```bash
# > - overwrite file
echo "hello" > file.txt

# >> - append to file
echo "world" >> file.txt

# Write multiple lines
cat > file.txt << 'EOF'
line 1
line 2
EOF

# Redirect stderr
command 2> error.log

# Redirect both streams to one file
command > output.log 2>&1
command &> output.log         # short syntax (bash)

# stdout to one file, stderr to another
command > out.log 2> err.log

# Discard output
command > /dev/null
command 2> /dev/null
command &> /dev/null

# stdout to file AND to screen
command | tee output.log
command | tee -a output.log   # tee with append
```

### Order of redirections matters

```bash
# WRONG - stderr does NOT go to the file
command 2>&1 > file.txt
# Explanation: first 2>&1 (stderr → current stdout = terminal),
#              then > file.txt (stdout → file, but stderr is already on terminal)

# CORRECT — both streams go to the file
command > file.txt 2>&1
# Explanation: first > file.txt (stdout → file),
#              then 2>&1 (stderr → current stdout = file)
```

---

## Input Redirection

```bash
# < - read from file instead of stdin
command < input.txt
sort < unsorted.txt
wc -l < /etc/passwd

# Pass a string as stdin (here-string)
grep "root" <<< "this string contains root"
base64 <<< "hello world"
read var <<< "some value"

# Heredoc - multi-line input
cat << 'EOF'
This line: $HOME will NOT be expanded
EOF

cat << EOF
This line: $HOME WILL be expanded — $HOME
EOF

# Heredoc with indentation (<<-)
if true; then
    cat <<- EOF
        Leading tabs are stripped
        but only tabs, not spaces
    EOF
fi

# Heredoc into a variable
config=$(cat << EOF
host=localhost
port=8080
EOF
)
```

---

## Pipes

```bash
# | - stdout of one command → stdin of the next
cat file.txt | grep "error"
ps aux | grep nginx | grep -v grep

# A pipe carries only stdout (not stderr)
command1 | command2          # only stdout1 → stdin2
command1 2>&1 | command2     # stdout1 + stderr1 → stdin2

# Named pipes (FIFO)
mkfifo /tmp/mypipe
command1 > /tmp/mypipe &     # write to pipe (background)
command2 < /tmp/mypipe       # read from pipe
rm /tmp/mypipe

# Process substitution — command as a file
diff <(ls dir1) <(ls dir2)             # compare directory contents
comm <(sort file1) <(sort file2)       # common/unique lines
wc -l <(find . -name "*.py")           # count files
while read line; do
    echo "$line"
done < <(find . -name "*.log")         # read find output in while
```

### Pipe exit codes

```bash
# Default - exit code of the last command
false | true
echo $?    # 0 (true is last)

# pipefail — fail if any command in the pipe fails
set -o pipefail
false | true
echo $?    # 1

# PIPESTATUS — exit codes of each command in the pipe
cat file | grep pattern | sort
echo "${PIPESTATUS[@]}"    # 0 0 0  (or 1 somewhere if it failed)
echo "${PIPESTATUS[0]}"    # cat exit code
echo "${PIPESTATUS[1]}"    # grep exit code
```

---

## Reading Files

### Line by line

```bash
# The correct way - while + read
while IFS= read -r line; do
    echo "$line"
done < file.txt

# Parse fields within a line
while IFS=: read -r user _ uid gid _ home shell; do
    echo "User: $user, UID: $uid, Shell: $shell"
done < /etc/passwd

# Read from command output
while IFS= read -r line; do
    process "$line"
done < <(find . -name "*.log")

# Read with line number
lineno=0
while IFS= read -r line; do
    ((lineno++))
    echo "$lineno: $line"
done < file.txt

# Skip the first line (CSV header)
{
    read header
    while IFS=, read -r name age city; do
        echo "Name: $name, Age: $age"
    done
} < data.csv
```

> Never use `for line in $(cat file)` - it breaks on spaces and special characters.

```bash
# BAD — splits on words, not lines
for line in $(cat file.txt); do
    echo "$line"   # words, not lines!
done

# GOOD
while IFS= read -r line; do
    echo "$line"
done < file.txt
```

### Read into an array

```bash
# One line per array element
readarray -t lines < file.txt
mapfile -t lines < file.txt    # synonym

echo "Lines: ${#lines[@]}"
echo "First: ${lines[0]}"
echo "Last:  ${lines[-1]}"

for line in "${lines[@]}"; do
    echo "$line"
done

# From command output
readarray -t users < <(awk -F: '$3 >= 1000 {print $1}' /etc/passwd)
```

### Reading binary data

```bash
# xxd - hex dump
xxd file.bin | head
xxd -p file.bin              # hex only, no addresses
xxd -r hex.txt > file.bin    # reverse conversion

# od — octal dump
od -c file.bin               # character output
od -x file.bin               # hex
od -A x -t x1z file.bin      # like xxd

# Read a fixed number of bytes
dd if=file.bin bs=1 count=4 2>/dev/null | xxd
head -c 4 file.bin | xxd
```

---

## Writing Files

```bash
# Overwrite
echo "content" > file.txt
printf "line 1\nline 2\n" > file.txt

# Append
echo "another line" >> file.txt

# Write multiple lines
cat > config.txt << 'EOF'
[server]
host = localhost
port = 8080
EOF

# With printf (better for formatting)
printf "%-10s %5d\n" "alice" 1001 >> users.txt

# Atomic write (via temp file)
tmpfile=$(mktemp)
generate_content > "$tmpfile"
mv "$tmpfile" /etc/config    # atomic operation

# Write to multiple files with tee
echo "data" | tee file1.txt file2.txt file3.txt > /dev/null

# Write as root using sudo tee
echo "127.0.0.1 myhost" | sudo tee -a /etc/hosts > /dev/null
```

---

## Custom File Descriptors

```bash
# Open a file on descriptor 3
exec 3< input.txt         # open for reading
exec 3> output.txt        # open for writing
exec 3>> output.txt       # open for appending
exec 3<> file.txt         # open for reading and writing

# Read from descriptor 3
while IFS= read -r line <&3; do
    echo "$line"
done

read -r line <&3           # read one line

# Write to descriptor 3
echo "data" >&3

# Close the descriptor
exec 3<&-                  # close input
exec 3>&-                  # close output

# Save and restore stdout
exec 4>&1                  # save current stdout to fd4
exec 1> logfile.txt        # redirect stdout to file
echo "this goes to file"
exec 1>&4                  # restore stdout
exec 4>&-                  # close fd4
echo "this goes to screen"

# Open multiple files simultaneously
exec 3< file1.txt
exec 4< file2.txt

while IFS= read -r line1 <&3 && IFS= read -r line2 <&4; do
    echo "File1: $line1"
    echo "File2: $line2"
done

exec 3<&- 4<&-
```

---

## Managing stderr in Scripts

```bash
# Write errors to stderr
error() {
    echo "[ERROR] $*" >&2
}

warn() {
    echo "[WARN]  $*" >&2
}

info() {
    echo "[INFO]  $*"
}

# Separate stdout and stderr when running a script
./script.sh > output.log 2> errors.log

# Show stderr on screen and save stdout to file
./script.sh 2>&1 1>output.log | grep "ERROR"
# Explanation: 2>&1 → stderr goes where stdout currently is (screen)
#              1>output.log → stdout is redirected to file
#              | grep → receives stderr (which is now on the "screen" = pipe stdout)

# Suppress only errors
command 2>/dev/null

# Show only errors
command >/dev/null

# Swap stdout and stderr
command 3>&1 1>&2 2>&3 3>&-
```

---

## find - File Search

```bash
# Basic search
find /path -name "*.txt"
find . -name "*.log" -type f
find /etc -type d -name "*.d"

# By type
find . -type f              # files
find . -type d              # directories
find . -type l              # symlinks

# By size
find . -size +10M           # larger than 10MB
find . -size -1k            # smaller than 1KB
find . -size 100c           # exactly 100 bytes
find . -empty               # empty files/directories

# By time
find . -mtime -7            # modified in the last 7 days
find . -mtime +30           # modified more than 30 days ago
find . -newer reference.txt # newer than reference.txt
find . -mmin -60            # modified in the last hour

# By permissions and owner
find . -user alice
find . -group developers
find . -perm 644
find . -perm -u+x           # has execute bit for owner
find . -perm /o+w           # world-writable (dangerous!)

# Actions on found files
find . -name "*.tmp" -delete
find . -name "*.log" -exec gzip {} \;
find . -name "*.py" -exec chmod 644 {} +      # + is faster than \;
find . -type d -exec chmod 755 {} +

# Exclude directories
find . -path ./node_modules -prune -o -name "*.js" -print
find . -not -path "*/\.*"   # exclude hidden files

# Compound conditions
find . -type f \( -name "*.jpg" -o -name "*.png" \)
find . -type f -name "*.log" -size +1M -mtime +30

# xargs - pass list to a command
find . -name "*.txt" | xargs grep "error"
find . -name "*.txt" -print0 | xargs -0 grep "error"  # safe for filenames with spaces
find . -name "*.log" | xargs -P 4 -I {} gzip {}       # parallel
```

---

## File and Directory Operations

### Creating and removing

```bash
# Create a file
touch file.txt
touch -t 202401150930 file.txt    # with a specific timestamp

# Create a directory
mkdir mydir
mkdir -p /deep/nested/path        # create entire chain

# Delete
rm file.txt
rm -r directory/                  # recursive
rm -f file.txt                    # no prompt
rm -rf directory/                 # dangerous - no prompt

# Safe removal
rm -i *.txt                       # confirm each file
ls *.txt; rm *.txt                 # look before you delete
```

### Copying and moving

```bash
# cp - copy
cp src.txt dst.txt
cp -r srcdir/ dstdir/
cp -a srcdir/ dstdir/             # archive mode (preserves permissions and times)
cp -u src dst                     # only if src is newer
cp -v src dst                     # verbose
cp --backup=numbered file.txt dst/  # with numbered backups

# mv - move / rename
mv old.txt new.txt
mv file.txt /other/dir/
mv -i src dst                     # prompt before overwriting
mv -u src dst                     # only if src is newer

# rsync - synchronize
rsync -av src/ dst/               # archive mode + verbose
rsync -avz src/ user@host:dst/    # with compression over SSH
rsync --delete src/ dst/          # delete extras in dst
rsync -n src/ dst/                # dry run - preview what will happen
```

### Links

```bash
# Hard link - same inode
ln original.txt hardlink.txt
ls -li original.txt hardlink.txt  # same inode number

# Symbolic link
ln -s /path/to/original symlink
ln -sf target symlink             # overwrite if exists
ls -la symlink                    # symlink -> /path/to/original

# Find all hard links to a file
find . -inum $(stat -c %i file.txt)
```

---

## stat and File Metadata

```bash
stat file.txt
# File: file.txt
# Size: 1234      Blocks: 8          IO Block: 4096   regular file
# Device: fd01h   Inode: 131073      Links: 1
# Access: (0644/-rw-r--r--)  Uid: (1001/alice)  Gid: (1001/alice)
# Access: 2024-03-15 10:22:30
# Modify: 2024-03-14 08:15:00
# Change: 2024-03-14 08:15:00

# Formatted output
stat -c "%n %s %U %G %A" file.txt
# file.txt 1234 alice alice -rw-r--r--

stat -c "%y" file.txt             # modification date
stat -c "%i" file.txt             # inode number
stat -c "%h" file.txt             # hard link count
stat -c "%f" file.txt             # file type in hex

# file — identify content type
file document.pdf                  # PDF document, version 1.7
file script.sh                     # Bourne-Again shell script, ASCII text
file image.jpg                     # JPEG image data
file /bin/ls                       # ELF 64-bit LSB shared object
file -b file.txt                   # without filename (brief)
file -i file.txt                   # MIME type: text/plain; charset=utf-8
```

---

## Temporary Files

```bash
# mktemp - create temporary files safely
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
tmpfile=$(mktemp /tmp/myapp.XXXXXX)     # custom prefix
tmpfile=$(mktemp --suffix=.log)         # with extension

# Auto-delete via trap
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
trap "rm -rf $tmpfile $tmpdir" EXIT

# Working with a temp file
generate_data > "$tmpfile"
process_data < "$tmpfile"

# Atomic config update
update_config() {
    local config_file="$1"
    local tmpfile
    tmpfile=$(mktemp "${config_file}.XXXXXX")

    generate_config > "$tmpfile"

    if validate_config "$tmpfile"; then
        mv "$tmpfile" "$config_file"   # atomic replacement
        echo "Config updated"
    else
        rm "$tmpfile"
        echo "Config validation failed" >&2
        return 1
    fi
}
```

---

## File Locking (flock)

```bash
LOCKFILE="/var/lock/myscript.lock"

# Exclusive lock (prevent concurrent execution)
(
    flock -n 9 || { echo "Already running" >&2; exit 1; }
    echo "Working..."
    sleep 10
) 9>"$LOCKFILE"

# With timeout
(
    flock -w 5 9 || { echo "Could not acquire lock within 5 seconds" >&2; exit 1; }
    critical_section
) 9>"$LOCKFILE"

# Shared lock (multiple readers)
(
    flock -s 9        # shared lock
    read_shared_data
) 9<"$datafile"
```

---

## CSV and TSV Processing

```bash
# Read CSV line by line
while IFS=, read -r name age city email; do
    echo "Name: $name, City: $city"
done < data.csv

# Skip the header
{
    IFS=, read -r header
    while IFS=, read -r name age city email; do
        echo "$name -> $city"
    done
} < data.csv

# awk for CSV
awk -F, 'NR>1 {print $1, $3}' data.csv          # fields 1 and 3
awk -F, 'NR>1 && $2 > 25' data.csv              # filter by age
awk -F, '{sum+=$2} END{print "Average:", sum/(NR-1)}' data.csv

# TSV (tab-separated)
while IFS=$'\t' read -r col1 col2 col3; do
    echo "$col1 | $col2"
done < data.tsv

# Generate CSV
{
    echo "name,age,city"
    echo "alice,30,london"
    echo "bob,25,paris"
} > output.csv

printf "%s,%d,%s\n" "carol" 28 "berlin" >> output.csv
```

---

## Logging in Scripts

```bash
#!/usr/bin/env bash

LOG_FILE="${LOG_FILE:-/var/log/myscript.log}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"

declare -A LOG_LEVELS=([DEBUG]=0 [INFO]=1 [WARN]=2 [ERROR]=3)

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    if (( ${LOG_LEVELS[$level]:-0} >= ${LOG_LEVELS[$LOG_LEVEL]:-1} )); then
        local line="[$timestamp] [$level] $message"

        if [[ "$level" == "ERROR" || "$level" == "WARN" ]]; then
            echo "$line" >&2
        else
            echo "$line"
        fi

        echo "$line" >> "$LOG_FILE"
    fi
}

log DEBUG "Processing file: $filename"
log INFO  "Processed lines: $count"
log WARN  "File not found, using default"
log ERROR "Critical error: $error_message"

# Run with different levels:
# LOG_LEVEL=DEBUG ./script.sh
# LOG_LEVEL=ERROR ./script.sh 2>errors.log
```

---

## Practical Scenarios

### Log rotation

```bash
#!/usr/bin/env bash

rotate_log() {
    local logfile="$1"
    local max_backups="${2:-5}"
    local max_size="${3:-10485760}"   # 10MB default

    [[ -f "$logfile" ]] || return 0

    local size
    size=$(stat -c %s "$logfile")

    if (( size < max_size )); then
        return 0
    fi

    for (( i=max_backups-1; i>=1; i-- )); do
        local prev=$((i-1))
        local old="${logfile}.${prev}"
        local new="${logfile}.${i}"
        [[ -f "$old" ]] && mv "$old" "$new"
    done

    mv "$logfile" "${logfile}.0"
    touch "$logfile"
    chmod --reference="${logfile}.0" "$logfile"

    echo "Rotated: $logfile"
}

rotate_log /var/log/myapp.log 5 10485760
```

### Real-time file monitoring

```bash
#!/usr/bin/env bash

monitor_log() {
    local logfile="$1"
    local pattern="$2"
    local action="$3"

    tail -F "$logfile" | while IFS= read -r line; do
        if [[ "$line" =~ $pattern ]]; then
            echo "[ALERT] Found: $line"
            "$action" "$line"
        fi
    done
}

send_alert() {
    local message="$1"
    echo "ALERT: $message" >> /var/log/alerts.log
}

monitor_log /var/log/nginx/error.log "crit|emerg" send_alert
```

### Safe file handling

```bash
#!/usr/bin/env bash
set -euo pipefail

safe_read() {
    local file="$1"

    [[ -e "$file" ]] || { echo "File does not exist: $file" >&2; return 1; }
    [[ -f "$file" ]] || { echo "Not a regular file: $file" >&2; return 1; }
    [[ -r "$file" ]] || { echo "No read permission: $file" >&2; return 1; }
    [[ -s "$file" ]] || { echo "File is empty: $file" >&2; return 1; }

    cat "$file"
}

atomic_write() {
    local target="$1"
    local content="$2"
    local tmpfile
    tmpfile=$(mktemp "${target}.XXXXXX")

    echo "$content" > "$tmpfile"

    if [[ -f "$target" ]]; then
        chmod --reference="$target" "$tmpfile"
        chown --reference="$target" "$tmpfile" 2>/dev/null || true
    fi

    mv "$tmpfile" "$target"
}

update_with_diff() {
    local target="$1"
    local new_content="$2"
    local tmpfile
    tmpfile=$(mktemp)
    echo "$new_content" > "$tmpfile"

    if [[ -f "$target" ]]; then
        if diff -q "$target" "$tmpfile" > /dev/null; then
            echo "File unchanged: $target"
            rm "$tmpfile"
            return 0
        fi
        echo "Changes in $target:"
        diff "$target" "$tmpfile" || true
    fi

    mv "$tmpfile" "$target"
    echo "Updated: $target"
}
```

### Directory scanner

```bash
#!/usr/bin/env bash

dir_stats() {
    local dir="${1:-.}"

    echo "=== Stats: $dir ==="
    echo "Size: $(du -sh "$dir" 2>/dev/null | cut -f1)"

    local files dirs
    files=$(find "$dir" -maxdepth 1 -type f | wc -l)
    dirs=$(find "$dir" -maxdepth 1 -type d | wc -l)
    echo "Files: $files, Directories: $((dirs - 1))"

    echo ""
    echo "Top 5 largest files:"
    find "$dir" -type f -printf "%s\t%p\n" 2>/dev/null \
        | sort -rn \
        | head -5 \
        | awk '{printf "  %8.1f KB  %s\n", $1/1024, $2}'

    echo ""
    echo "By extension:"
    find "$dir" -maxdepth 1 -type f \
        | grep -oE "\.[^.]+$" \
        | sort | uniq -c | sort -rn \
        | head -10 \
        | awk '{printf "  %5d  %s\n", $1, $2}'
}

dir_stats "/var/log"
```

---

## Cheat Sheet

```bash
# Streams
command > file          # stdout → file (overwrite)
command >> file         # stdout → file (append)
command 2> file         # stderr → file
command &> file         # stdout + stderr → file
command > file 2>&1     # same (POSIX)
command 2>/dev/null     # discard stderr
command | tee file      # stdout → file AND to screen

# Input
command < file          # stdin from file
command <<< "string"    # here-string
command << EOF          # heredoc
...
EOF

# Pipes
cmd1 | cmd2             # stdout → stdin
cmd1 2>&1 | cmd2        # stdout+stderr → stdin
cmd1 | tee f | cmd2     # split the stream
diff <(cmd1) <(cmd2)    # process substitution

# Descriptors
exec 3< file            # open fd3 for reading
exec 3> file            # open fd3 for writing
read -r line <&3        # read from fd3
echo "data" >&3         # write to fd3
exec 3<&-               # close fd3

# Reading files
while IFS= read -r line; do
    ...
done < file

readarray -t arr < file

# find + actions
find . -name "*.log" -delete
find . -type f -exec cmd {} +
find . -print0 | xargs -0 cmd

# Temp files
tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT
```

---

## References

- [Bash Redirections](https://www.gnu.org/software/bash/manual/bash.html#Redirections) - official docs
- [find manual](https://man7.org/linux/man-pages/man1/find.1.html) - `man find`
- [tee manual](https://man7.org/linux/man-pages/man1/tee.1.html) - `man tee`
- [flock manual](https://man7.org/linux/man-pages/man1/flock.1.html) - `man flock`
