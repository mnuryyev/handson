---
title: "Pipes and I/O Redirection"
date: "2026-04-07"
---

In Unix, each program is designed to perform a single function as efficiently as possible. Complex tasks are accomplished by combining several such specialized programs through data-passing mechanisms, enabling the construction of powerful and flexible processing pipelines without the need to develop a new, comprehensive program.

---

## File Descriptors (FD)

Every process in Linux has a table of open files. The first three are the standard streams:

```
Process
┌──────────────────────────────────────┐
│  FD 0  stdin   ◄── keyboard/file    │
│  FD 1  stdout  ──► terminal/file    │
│  FD 2  stderr  ──► terminal/file    │
│  FD 3+ ...     user-defined         │
└──────────────────────────────────────┘
```

```bash
# View file descriptors of the current process
ls -la /proc/$$/fd
# lrwx------ 0 -> /dev/pts/0   stdin
# lrwx------ 1 -> /dev/pts/0   stdout
# lrwx------ 2 -> /dev/pts/0   stderr

# View file descriptors of a specific process
ls -la /proc/$(pgrep nginx | head -1)/fd
```

---

## Output Redirection

### Core operators

```bash
# > overwrite file
echo "hello" > file.txt
ls -la > listing.txt
date > /tmp/timestamp

# >> append to end
echo "line 1" > file.txt
echo "line 2" >> file.txt
echo "line 3" >> file.txt

# 2> redirect stderr
ls /nonexistent 2> error.log
find / -name "passwd" 2> /dev/null   # hide "Permission denied"

# 2>> append stderr
command1 2>> errors.log
command2 2>> errors.log              # both write to the same file

# &> redirect both streams
command &> all_output.log
command >& all_output.log            # synonym (less common)

# Separate redirection
command > stdout.log 2> stderr.log
```

### Order of redirections matters

This is the most commonly confused part. Redirections are applied **left to right**:

```bash
# WRONG - stderr stays on the terminal
command 2>&1 > file.txt

# Step 1: 2>&1   stderr → wherever stdout currently points (terminal)
# Step 2: > file  stdout → file
# Result: stdout in file, stderr on terminal

# CORRECT - both streams go to the file
command > file.txt 2>&1

# Step 1: > file  stdout → file
# Step 2: 2>&1   stderr → wherever stdout currently points (file)
# Result: both in file
```

```bash
# Practical examples
make 2>&1 | tee build.log           # see and save build output
./script.sh > output.log 2>&1       # everything in one file
./script.sh > out.log 2> err.log    # separate files
./script.sh 2>/dev/null             # stdout only, hide errors
./script.sh >/dev/null 2>&1         # hide everything
./script.sh >/dev/null              # only errors on screen
```

### /dev/null - the black hole

```bash
# Everything written to /dev/null is gone forever
echo "test" > /dev/null             # output discarded
command 2> /dev/null                # errors discarded
command &> /dev/null                # everything discarded

# Typical scenarios
crontab -e 2>/dev/null              # hide "no crontab" message
find / -name "file" 2>/dev/null     # no "Permission denied" noise
service nginx status &>/dev/null && echo "running"  # silent check
```

---

## Input Redirection

```bash
# < read stdin from file
sort < unsorted.txt
wc -l < /etc/passwd
grep "root" < /etc/passwd
tr '[:lower:]' '[:upper:]' < input.txt > output.txt   # convert case

# Chain: from file, transform, to file
sort < names.txt > sorted_names.txt
```

### Here-String `<<<`

```bash
# Pass a string as stdin - no file needed
wc -w <<< "hello world linux"           # 3
base64 <<< "secret"                     # c2VjcmV0Cg==
rev <<< "Hello"                         # olleH
md5sum <<< "password"

# Reading into variables
read first rest <<< "one two three"
echo "$first"   # one
echo "$rest"    # two three

# Cleaner than echo | command
# Instead of:
echo "hello" | wc -c
# Better:
wc -c <<< "hello"
```

### Here-Document `<<`

```bash
# Multi-line input directly in the script
cat << EOF
Line 1
Line 2
Variable: $HOME
EOF

# Without variable expansion (single quotes around marker)
cat << 'EOF'
The variable $HOME is not expanded here
Neither is \n
EOF

# Pipe heredoc to a command
grep "pattern" << EOF
this line contains pattern
this one does not
this also has pattern
EOF

# Pipe heredoc over SSH
ssh user@server << 'EOF'
    hostname
    uptime
    df -h
EOF

# Heredoc with indentation — <<- strips leading TABS (not spaces)
if true; then
    cat <<- EOF
        This line has a leading tab
        The tab is stripped from output
    EOF
fi

# Heredoc into a variable
config=$(cat << EOF
[database]
host = $DB_HOST
port = $DB_PORT
EOF
)

# Heredoc to file
cat > /etc/myapp/config.conf << EOF
host = localhost
port = 8080
debug = false
EOF

# Heredoc via sudo (when you can't write directly)
sudo tee /etc/nginx/sites-available/mysite << 'EOF'
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
}
EOF
```

---

## Pipes

### Basic pipe `|`

```bash
# stdout of one command → stdin of the next
ls -la | grep "^d"                  # directories only
ps aux | grep nginx                  # find nginx processes
cat /etc/passwd | cut -d: -f1       # usernames only
df -h | grep -v tmpfs               # without tmpfs entries

# Chained pipelines
cat /etc/passwd \
    | grep "/bin/bash" \
    | cut -d: -f1 \
    | sort \
    | head -5

# A pipe does NOT carry stderr
ls /nonexistent | wc -l             # stderr on terminal, stdout (empty) to wc
ls /nonexistent 2>&1 | wc -l        # stderr goes into the pipe too
```

### tee — stream splitter

```bash
# Write to file AND pass downstream
cat file.txt | tee copy.txt | wc -l
command | tee output.log            # to screen and to file

# Append mode
command | tee -a existing.log

# Multiple files at once
echo "data" | tee file1.txt file2.txt file3.txt

# In the middle of a pipeline
ps aux | tee snapshot.txt | grep nginx

# Write as root
echo "127.0.0.1 myhost" | sudo tee -a /etc/hosts
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-forward.conf

# tee without printing to screen
command | tee file.txt > /dev/null
```

### Pipe exit codes

```bash
# Exit code = code of the LAST command in the pipe
true | false | true
echo $?   # 0 - last command (true) succeeded

# pipefail - fail if ANY command in the pipe fails
set -o pipefail

false | true
echo $?   # 1

true | false | true
echo $?   # 1 (false returned 1, pipefail caught it)

# PIPESTATUS — exit codes of each command
cat file.txt | grep "pattern" | sort | uniq
echo "${PIPESTATUS[@]}"     # 0 0 0 0
echo "${PIPESTATUS[0]}"     # cat's exit code
echo "${PIPESTATUS[1]}"     # grep's exit code
echo "${PIPESTATUS[2]}"     # sort's exit code

# Check a specific command in the pipe
cat big_file.txt | grep "error" | wc -l
grep_exit=${PIPESTATUS[1]}
if [[ $grep_exit -eq 1 ]]; then
    echo "No errors found"
fi
```

---

## Process Substitution `<()` and `>()`

Lets you use the **output of a command as a file**.

```bash
# <(cmd) - command as a readable file
diff <(ls dir1) <(ls dir2)                  # compare directory contents
diff <(sort file1.txt) <(sort file2.txt)    # compare sorted files
comm <(sort a.txt) <(sort b.txt)            # common/unique lines

# Works anywhere a filename is expected
wc -l <(find . -name "*.py")               # count Python files
grep "pattern" <(curl -s http://example.com/data)  # search URL content

# Read from command output in a while loop
while IFS= read -r line; do
    echo "Processing: $line"
done < <(find . -name "*.log" -newer /tmp/marker)

# >(cmd) - command as a writable file
command > >(tee file.txt)                  # write to a command as a file
tee >(gzip > file.gz) >(wc -l) > /dev/null  # split into multiple commands

# Add timestamps to script output
./script.sh > >(while read line; do echo "$(date): $line"; done > app.log)

# Compare config files ignoring comments and blank lines
diff \
    <(grep -v "^#" file1.conf | grep -v "^$") \
    <(grep -v "^#" file2.conf | grep -v "^$")
```

---

## Named Pipes (FIFO)

```bash
# Create a named pipe
mkfifo /tmp/mypipe
ls -la /tmp/mypipe
# prw-r--r-- 1 alice alice 0 Mar 15 10:00 /tmp/mypipe
# p — pipe type

# Basic usage
echo "hello" > /tmp/mypipe &         # write (background — blocks until read)
cat < /tmp/mypipe                    # read

# Two-way communication between processes
mkfifo /tmp/req /tmp/resp

# Server process
while true; do
    request=$(cat /tmp/req)
    echo "Processed: $request" > /tmp/resp
done &

# Client process
echo "request 1" > /tmp/req
cat /tmp/resp

# Clean up
rm /tmp/mypipe /tmp/req /tmp/resp
```

---

## Custom File Descriptors

```bash
# Open a file on a custom descriptor
exec 3< input.txt         # FD 3 for reading
exec 4> output.txt        # FD 4 for writing
exec 5>> append.txt       # FD 5 for appending
exec 6<> readwrite.txt    # FD 6 for reading and writing

# Read from FD 3
while IFS= read -r line <&3; do
    echo "Line: $line"
done
read -r first_line <&3    # read one line

# Write to FD 4
echo "data" >&4
printf "formatted: %d\n" 42 >&4

# Close descriptors
exec 3<&-    # close input
exec 4>&-    # close output

# Save and restore stdout
exec 3>&1              # save stdout to FD 3
exec 1> /tmp/log.txt   # redirect stdout to file
echo "this goes to file"
exec 1>&3              # restore stdout
exec 3>&-              # close FD 3
echo "this goes to screen"

# Read two files in parallel
exec 3< file1.txt
exec 4< file2.txt
while IFS= read -r a <&3 && IFS= read -r b <&4; do
    echo "file1: $a  |  file2: $b"
done
exec 3<&- 4<&-
```

---

## Advanced Patterns

### Filtering and transformation

```bash
# Top 10 processes by memory
ps aux --sort=-%mem | head -11

# Unique IPs from log, sorted by frequency
awk '{print $1}' /var/log/nginx/access.log \
    | sort \
    | uniq -c \
    | sort -rn \
    | head -20

# All 4xx and 5xx status codes from nginx log
awk '$9 ~ /^[45]/' /var/log/nginx/access.log \
    | awk '{print $9}' \
    | sort | uniq -c | sort -rn

# Directory sizes, sorted
du -sh /var/log/* 2>/dev/null | sort -h | tail -10

# Find duplicate files by hash
find . -type f -exec md5sum {} \; \
    | sort \
    | uniq -w32 -d

# HTTP status code statistics
awk '{print $9}' /var/log/nginx/access.log \
    | sort | uniq -c | sort -rn \
    | awk '{printf "%6d  %s\n", $1, $2}'
```

### Parallel processing

```bash
# xargs -P - parallel execution
find . -name "*.jpg" | xargs -P 4 -I {} convert {} -resize 800x600 {}.resized

# Safe for filenames with spaces
find . -name "*.log" -print0 | xargs -0 -P 4 gzip

# GNU parallel (if installed)
find . -name "*.csv" | parallel -j 4 python3 process.py {}

# Manual parallelism via &
for file in *.log; do
    gzip "$file" &
done
wait    # wait for all

# With a concurrency limit
max_jobs=4
job_count=0
for file in *.log; do
    gzip "$file" &
    ((job_count++))
    if (( job_count >= max_jobs )); then
        wait -n 2>/dev/null || wait
        ((job_count--))
    fi
done
wait
```

### Real-time monitoring

```bash
# Follow multiple logs at once
tail -f /var/log/syslog \
       /var/log/nginx/error.log \
       /var/log/auth.log \
    | grep --line-buffered -E "error|crit|warn"

# With timestamps
tail -f /var/log/app.log | while IFS= read -r line; do
    echo "$(date '+%H:%M:%S') $line"
done

# Monitor and send alerts
tail -F /var/log/nginx/error.log | grep --line-buffered "crit" | while read line; do
    echo "ALERT: $line" | mail -s "Nginx Critical Error" admin@example.com
done &

# watch — periodically re-run a command
watch -n 2 'ps aux | grep nginx | grep -v grep'
watch -d -n 1 'df -h'                  # -d highlights changes
watch -n 0.5 'cat /proc/loadavg'       # load average twice per second
```

### Text processing pipelines

```bash
# Extract emails from a file
grep -oE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" contacts.txt | sort -u

# Extract IP addresses from log
grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" access.log | sort | uniq -c | sort -rn

# Extract URLs
grep -oE "https?://[^ \"]+" page.html | sort -u

# Word frequency across files
cat *.txt | tr -s '[:space:]' '\n' | sort | uniq -c | sort -rn | head -20

# Lines only in file1, not in file2
comm -23 <(sort file1.txt) <(sort file2.txt)

# Common lines between two files
comm -12 <(sort file1.txt) <(sort file2.txt)

# Merge CSV files (preserve header from first file only)
(head -1 file1.csv; tail -n +2 file1.csv; tail -n +2 file2.csv) > merged.csv

# Transpose a table
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

### Sysadmin pipelines

```bash
# Find used ports
ss -tlnp | awk 'NR>1 {print $4}' | awk -F: '{print $NF}' | sort -n | uniq

# Top 10 directories by disk usage
du -a /var 2>/dev/null | sort -rn | head -10 | awk '{printf "%8.1f MB  %s\n", $1/1024, $2}'

# Users who have logged in
last | awk 'NF>2 && $1!="reboot" && $1!="wtmp" {print $1}' | sort -u

# Suspicious SSH login attempts
grep "Failed password" /var/log/auth.log \
    | awk '{print $(NF-3)}' \
    | sort | uniq -c | sort -rn \
    | head -20

# TCP connection states summary
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# Files modified in the last hour
find /etc -newer /tmp/marker -type f 2>/dev/null \
    | xargs stat -c "%y %n" 2>/dev/null \
    | sort -r

# Quick nginx config audit
nginx -T 2>/dev/null | grep -E "^\s*(server_name|listen|root|location)" | sed 's/^[[:space:]]*//'
```

---

## Built-in Bash Facilities

### Command substitution as input

```bash
# $() - capture command output
files=$(ls *.txt)
count=$(wc -l < /etc/passwd)
date=$(date +%Y-%m-%d)

# With process substitution
while read user; do
    id "$user"
done < <(awk -F: '$3 >= 1000 {print $1}' /etc/passwd)
```

### coproc - bidirectional pipes

```bash
# coproc - launch a command with a two-way channel
coproc bc -l    # start the calculator

# Write to bc
echo "2 + 2" >&${COPROC[1]}
echo "sqrt(2)" >&${COPROC[1]}

# Read from bc
read result <&${COPROC[0]}
echo "2 + 2 = $result"    # 4

read result <&${COPROC[0]}
echo "sqrt(2) = $result"   # 1.41421356...

# Shut down
kill $COPROC_PID 2>/dev/null
```

---

## Common Mistakes

```bash
# 1. Wrong redirection order
cmd 2>&1 > file     # WRONG: stderr on terminal, stdout to file
cmd > file 2>&1     # CORRECT: both to file

# 2. Missing pipefail
set -o pipefail
false | true        # without pipefail: exit code 0 (silent failure!)
# With pipefail: exit code 1

# 3. Variable modification inside a pipe subshell
count=0
cat file | while read line; do
    ((count++))
done
echo $count         # 0! The pipe creates a subshell
# Solution: process substitution
while IFS= read -r line; do
    ((count++))
done < <(cat file)
echo $count         # correct

# 4. Losing exit code after a pipe
grep "pattern" file | head -5
echo $?             # head's code, not grep's!

# 5. Unsafe filenames in pipes
find . -name "*.txt" | xargs rm          # BREAKS on filenames with spaces
find . -name "*.txt" -print0 | xargs -0 rm   # CORRECT

# 6. Useless use of cat
cat file | grep pattern   # unnecessary cat
grep pattern file          # use directly
```

---

## Cheat Sheet

```bash
# Output redirection
>   overwrite                  echo "x" > f
>>  append                     echo "x" >> f
2>  stderr to file             cmd 2> err
2>> append stderr              cmd 2>> err
&>  both streams to file       cmd &> all
>/dev/null  discard stdout     cmd > /dev/null
2>&1 stderr→stdout             cmd > f 2>&1  ← correct order

# Input redirection
<   from file                  cmd < f
<<< here-string                cmd <<< "str"
<<  heredoc                    cmd << EOF
                               ...
                               EOF

# Pipes
|   stdout→stdin               cmd1 | cmd2
|&  stdout+stderr→stdin        cmd1 |& cmd2
tee split the stream           cmd | tee f | cmd2

# Process substitution
<() command as readable file   diff <(cmd1) <(cmd2)
>() command as writable file   cmd > >(tee f)

# Pipe exit codes
$?               last command's code
${PIPESTATUS[@]} all pipe exit codes
set -o pipefail  fail if any command fails

# Descriptors
exec N< f    open N for reading
exec N> f    open N for writing
cmd <&N      read from N
cmd >&N      write to N
exec N<&-    close N
```

---

## References

- [Bash Redirections](https://www.gnu.org/software/bash/manual/bash.html#Redirections) - official docs
- [Advanced Bash Scripting: I/O](https://tldp.org/LDP/abs/html/io-redirection.html) - in-depth guide
- [pipe man page](https://man7.org/linux/man-pages/man2/pipe.2.html) - `man 2 pipe`
- [mkfifo man page](https://man7.org/linux/man-pages/man1/mkfifo.1.html) - `man mkfifo`
