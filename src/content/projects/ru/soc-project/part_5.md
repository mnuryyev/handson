---
title: "Part-5. Настройка Active Directory и ввод Windows 10 в домен"
description: "Развертывание Wazuh SIEM для мониторинга и выявления сетевых атак в доменной среде Active Directory"
---
[В предыдущей части](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_4) мы подключили Windows 10 к Wazuh и установили Sysmon, наша машина-жертва теперь полностью под мониторингом. В этой части мы переходим к Windows Server 2022 и разворачиваем на нём **Active Directory**. Мы создадим домен **handson.local**, настроим организационную структуру, создадим тестового пользователя и введём **target-PC** в домен. 

Доменная среда является основной целью атакующих в реальных инфраструктурах. А события аутентификации домена, которые мы начнём видеть в Wazuh после этого шага, станут ключевыми уликами при обнаружении атак в следующей части.


## Фаза 1: Настройка Windows Server

### Шаг 1. Знакомство с Server Manager

После входа на Windows Server нас встречает Server Manager - центральная консоль управления сервером. Пока здесь минимум ролей: только базовая File and Storage Services, которая присутствует по умолчанию. Именно отсюда мы будем устанавливать Active Directory.

![01_starting_winser](/handson/images/soc_project_part_5/01_starting_winser.png)



### Шаг 2. Настройка статического IP-адреса

Перед установкой AD серверу необходимо присвоить статический IP-адрес. Контроллер домена не может работать с динамическим адресом - клиентские машины и другие серверы должны всегда знать, где его найти.
Открываем свойства сетевого адаптера, переходим в IPv4 и вручную задаём следующие параметры в соответствии с нашей диаграммой:

- IP-адрес: 10.10.70.25
- Маска подсети: 255.255.255.0
- Основной шлюз: 10.10.70.2
- Предпочитаемый DNS: 8.8.8.8

![02_change_ip](/handson/images/soc_project_part_5/02_change_ip.png)

DNS пока указываем внешний, после того как мы установим Active Directory, сервер станет DNS-сервером сам для себя и для всех машин в домене. Это мы исправим позже.



### Шаг 3. Проверка сетевых настроек

Открываем командную строку и проверяем, что всё настроено корректно. Выполняем **ipconfig**, видим статический адрес **10.10.70.25**. Затем проверяем доступ в интернет командой ping google.com.

![03_checking](/handson/images/soc_project_part_5/03_checking.png)

Пинг проходит успешно - сеть работает. Теперь проверяем связь с нашим Wazuh сервером:

``` ping 10.10.70.30 ```

![04_ping_wazuh](/handson/images/soc_project_part_5/04_ping_wazuh.png)

Пинг до **10.10.70.30** проходит с минимальной задержкой - контроллер домена и Wazuh сервер видят друг друга. Это означает, что когда мы подключим агент Wazuh на этот сервер, события будут доходить до SIEM без проблем. Сеть настроена корректно, переходим к установке Active Directory.

* * *

## Фаза 2: Установка Active Directory Domain Services

### Шаг 4. Запуск мастера добавления ролей

Возвращаемся в **Server Manager** и нажимаем **"Add roles and features"**.

![05_add_rules](/handson/images/soc_project_part_5/05_add_rules.png)

Открывается мастер добавления ролей. На первом экране нас встречает страница с рекомендациями — убедиться, что задан пароль администратора и настроен статический IP. Всё это мы уже сделали. Ставим галочку **"Skip this page by default"** и нажимаем **Next**.

![06_next](/handson/images/soc_project_part_5/06_next.png)



### Шаг 5. Выбор типа установки и целевого сервера

На следующем экране выбираем тип установки **"Role-based or feature-based installation"**. Это стандартный выбор при настройке конкретного сервера.

![07_role](/handson/images/soc_project_part_5/07_role.png)

Далее мастер предлагает выбрать целевой сервер. В списке отображается наш сервер **DC** с IP `10.10.70.25` - выбираем его и нажимаем **Next**.

![08_next](/handson/images/soc_project_part_5/08_next.png)



### Шаг 6. Выбор роли Active Directory Domain Services

На экране выбора ролей находим и отмечаем галочкой **"Active Directory Domain Services"**. Появляется всплывающее окно с предложением добавить необходимые компоненты управления - соглашаемся и нажимаем **Add Features**, затем **Next**.

![09_installing_ad](/handson/images/soc_project_part_5/09_installing_ad.png)

На следующем экране с дополнительными компонентами ничего не меняем и нажимаем **Next**.

![09_next](/handson/images/soc_project_part_5/09_next.png)



### Шаг 7. Завершение установки роли

Нажимаем **Install** и ждём завершения установки. После окончания мастер выводит результат с важным уведомлением внизу экрана:

> *"Additional steps are required to make this machine a domain controller. Promote this server to a domain controller."*

![10_installed](/handson/images/soc_project_part_5/10_installed.png)

Установка роли - это только первый шаг. Сам по себе сервер ещё не является контроллером домена. Нажимаем на ссылку **"Promote this server to a domain controller"**.

![11_install_domain](/handson/images/soc_project_part_5/11_install_domain.png)

* * *

## Фаза 3: Создание домена handson.local

### Шаг 8. Создание нового леса

Запускается мастер настройки Active Directory. Так как мы разворачиваем домен с нуля, никакого домена до этого не существовало, выбираем опцию **"Add a new forest"** и вводим имя корневого домена: **`handson.local`**.

![12_adding_new_forest](/handson/images/soc_project_part_5/12_adding_new_forest.png)



### Шаг 9. Настройка параметров контроллера домена

На следующем экране задаём ключевые параметры. Уровни функциональности леса и домена оставляем **Windows Server 2016** это стандартный выбор, обеспечивающий совместимость. Галочки **DNS server** и **Global Catalog** оставляем отмеченными, они обязательны для первого контроллера домена. Задаём пароль **DSRM** (Directory Services Restore Mode) - это аварийный пароль для восстановления AD в случае сбоя. Запоминаем его.

![13_pass](/handson/images/soc_project_part_5/13_pass.png)

![14_next](/handson/images/soc_project_part_5/14_next.png)



### Шаг 10. Пути к базе данных

Мастер предлагает указать пути для хранения базы данных NTDS, журналов и папки SYSVOL. Оставляем пути по умолчанию — `C:\Windows\NTDS` и `C:\Windows\SYSVOL`.

![15_paths](/handson/images/soc_project_part_5/15_paths.png)



### Шаг 11. Установка и перезагрузка

Нажимаем **Install**. Начинается процесс установки и настройки Active Directory. Система создаёт лес `handson.local`, настраивает DNS и репликацию. После завершения сервер автоматически перезагружается.

![16_installing](/handson/images/soc_project_part_5/16_installing.png)

После перезагрузки экран входа изменился - в левом нижнем углу теперь отображается **`HANDSON\Administrator`**. Это означает, что сервер успешно стал контроллером домена `handson.local`.

![17_login_page](/handson/images/soc_project_part_5/17_login_page.png)

Входим под учётными данными администратора домена.

* * *

## Фаза 4: Создание организационной структуры и пользователя

### Шаг 12. Открытие Active Directory Users and Computers

После входа открываем **Server Manager**, переходим в меню **Tools** и выбираем **Active Directory Users and Computers**.

![18_tools](/handson/images/soc_project_part_5/18_tools.png)

Перед нами открывается оснастка управления доменом. Здесь мы будем создавать организационные единицы и пользователей.



### Шаг 13. Создание организационной единицы IT

Кликаем правой кнопкой мыши на домен **handson.local**, выбираем **New → Organizational Unit**.

![19_ou](/handson/images/soc_project_part_5/19_ou.png)

В поле имени вводим **`IT`** это будет наш отдел информационных технологий. Галочку **"Protect container from accidental deletion"** оставляем включённой для защиты от случайного удаления.

![20_it](/handson/images/soc_project_part_5/20_it.png)



### Шаг 14. Создание тестового пользователя

В левой панели выбираем только что созданную единицу **IT**. Кликаем правой кнопкой мыши по правой панели и выбираем **New → User**.

![21_new_user](/handson/images/soc_project_part_5/21_new_user.png)

Заполняем поля нового пользователя: **First name** - `Test`, **Last name** - `User`, **User logon name** - `testuser`. Именно это имя будет использоваться для входа в домен.

![22_test_user](/handson/images/soc_project_part_5/22_test_user.png)

На следующем шаге задаём пароль для пользователя. Снимаем галочку **"User must change password at next logon"** - это упростит первый тестовый вход в систему. Нажимаем **Next** и **Finish**.

![23_pass](/handson/images/soc_project_part_5/23_pass.png)

В организационной единице **IT** теперь отображается созданный пользователь **Test User**. Домен настроен, пользователь готов.

![24_set_user](/handson/images/soc_project_part_5/24_set_user.png)

* * *

## Фаза 5: Ввод Windows 10 в домен

### Шаг 15. Смена DNS на Windows 10

Переключаемся на машину **target-PC**. Чтобы компьютер мог найти домен `handson.local`, он должен использовать DNS нашего контроллера домена, а не внешний DNS. Без этого шага компьютер просто не увидит домен.

Открываем настройки сетевого адаптера, переходим в свойства **IPv4** и меняем адрес DNS-сервера на IP контроллера домена — **`10.10.70.25`**.

![27_dns_win10](/handson/images/soc_project_part_5/27_dns_win10.png)

Сохраняем настройки.



### Шаг 16. Присоединение к домену

Открываем **Settings → System → About** и нажимаем **"Advanced system settings"**.

![25_win10](/handson/images/soc_project_part_5/25_win10.png)

В открывшемся окне **System Properties** на вкладке **Computer Name** нажимаем **"Change..."**.

![26_change](/handson/images/soc_project_part_5/26_change.png)

В разделе **Member of** переключаемся с **Workgroup** на **Domain** и вводим имя нашего домена - **`handson.local`**.

Система запрашивает учётные данные для присоединения к домену. Вводим логин **Administrator** и пароль администратора домена.

![28_ad_login](/handson/images/soc_project_part_5/28_ad_login.png)



### Шаг 17. Успешный ввод в домен

Появляется окно с сообщением:

> **"Welcome to the handson.local domain."**

![29_success](/handson/images/soc_project_part_5/29_success.png)

Компьютер `target-PC` успешно введён в домен. Перезагружаем машину.



### Шаг 18. Вход под доменным пользователем

После перезагрузки экран входа изменился. В левом нижнем углу появилась опция **"Other user"** нажимаем на неё.

![30_testuser](/handson/images/soc_project_part_5/30_testuser.png)

Вводим логин созданного нами доменного пользователя - **`testuser`** — и его пароль. Вход выполнен успешно.

![31_success](/handson/images/soc_project_part_5/31_success.png)

`target-PC` теперь является полноценным членом домена **handson.local** и входит под доменной учётной записью.

* * *

## Итог

На этом пятая часть завершена. Мы развернули Active Directory на Windows Server 2022 и создали домен **handson.local**, настроили статический IP и проверили связь со всеми узлами лаборатории, создали организационную единицу **IT** и тестового пользователя **testuser**, а также успешно ввели `target-PC` в домен и проверили вход под доменной учётной записью.
