---
title: "Active Directory - разворачивание домена с нуля"
description: "В данной работе развернём домен с нуля: установим роль AD DS, создадим OU-структуру, пользователей и группы, введём Windows 10 в домен, настроим GPO, разберём LDAP-структуру изнутри и включим аудит входов"
image: "/images/ad_net/main.jpg"
date: "2026-05-09"
---

## Введение

AD - это центральная система корпоративной инфраструктуры: единая точка аутентификации, централизованное управление политиками, контроль над каждой машиной в сети.

В данной работе развернём домен с нуля: установим роль AD DS, создадим OU-структуру, пользователей и группы, введём Windows 10 в домен, настроим GPO, разберём LDAP-структуру изнутри и включим аудит входов.

| Параметр | Значение |
| --- | --- |
| Домен | lab.local |
| Контроллер домена | Windows Server 2022 |
| Клиентская машина | Windows 10 |
| IP контроллера | 10.10.70.132 |
| IP клиента | 10.10.70.134 |
| Инструменты | Server Manager, ADUC, GPMC, ldp.exe, Event Viewer |

---

## Теоретическая база

### Что такое Active Directory

AD - это служба каталогов от Microsoft, основанная на протоколе **LDAP** и аутентификации через **Kerberos**. Хранит информацию об объектах домена: пользователях, компьютерах, группах, политиках.

### Ключевые понятия

| Объект | Что это |
| --- | --- |
| **Domain** | Административная граница. Все объекты внутри подчиняются одной политике |
| **DC (Domain Controller)** | Сервер, хранящий базу AD и обрабатывающий аутентификацию |
| **OU (Organizational Unit)** | Папка внутри домена для группировки объектов |
| **GPO (Group Policy Object)** | Набор политик, применяемых к OU, пользователям или компьютерам |
| **LDAP** | Протокол запросов к базе AD (порт 389 / 636 TLS) |
| **Kerberos** | Протокол аутентификации (порт 88). Вместо паролей — тикеты |
| **SID** | Уникальный идентификатор каждого объекта в домене |
| **Forest** | Верхний уровень иерархии AD. Один или несколько доменов |

### Как работает вход в домен

```
Пользователь вводит пароль
    → Windows отправляет запрос на DC (Kerberos AS-REQ)
    → DC проверяет credentials, выдаёт TGT-тикет
    → TGT используется для получения сервисных тикетов
    → Доступ к ресурсам без повторного ввода пароля (SSO)
```

---

## Фаза 1. Установка роли AD DS

### Шаг 1. Вход в систему

Запускаем виртуальную машину с Windows Server. Входим под учётной записью `Administrator`.

![01_start](/handson/images/ad_net/01_start.png)

### Шаг 2. Server Manager

После входа автоматически открывается **Server Manager** - главный инструмент управления Windows Server. Именно отсюда добавляются роли и компоненты.

Нажимаем **"Add roles and features"**.

![02_start](/handson/images/ad_net/02_start.png)

### Шаг 3. Мастер добавления ролей

Открывается **Add Roles and Features Wizard**. На первом экране - предварительные требования: статический IP-адрес, актуальные обновления безопасности.

Нажимаем **Next**.

![03_add_roles](/handson/images/ad_net/03_add_roles.png)

### Шаг 4. Тип установки

Выбираем **"Role-based or feature-based installation"** - стандартный вариант для установки ролей на один конкретный сервер.

Нажимаем **Next**.

![04_role_based](/handson/images/ad_net/04_role_based.png)

### Шаг 5. Выбор сервера

Из пула серверов выбираем наш - **`WIN-H5P0PJB7B3A`** с IP `10.10.70.132`. Это будущий контроллер домена.

Нажимаем **Next**.

![05_ip](/handson/images/ad_net/05_ip.png)

### Шаг 6. Выбор роли AD DS

В списке ролей отмечаем **"Active Directory Domain Services"**. В правой части - описание: AD DS хранит информацию об объектах сети и обеспечивает единую аутентификацию (SSO).

Во всплывающем окне нажимаем **"Add Features"** - это добавит необходимые инструменты управления (ADUC, GPMC, ldp.exe).

Нажимаем **Next → Next → Install**.

![06_add_features](/handson/images/ad_net/06_add_features.png)

Роль установлена, но домен ещё не создан. AD DS — это только механизм. Сейчас нужно его настроить.

### Шаг 7. Установка завершена

Появляется уведомление: **"Additional steps are required to make this machine a domain controller"** и ссылка **"Promote this server to a domain controller"**.

Это ключевой момент: роль есть, но сервер ещё не является контроллером домена.

![07_completed](/handson/images/ad_net/07_completed.png)

### Шаг 8. Повышение до контроллера домена

В Server Manager вверху появляется жёлтый флаг с уведомлением. Нажимаем на него и кликаем **"Promote this server to a domain controller"**.

![08_promote](/handson/images/ad_net/08_promote.png)

---

## Фаза 2. Создание домена

### Шаг 9. Создание нового леса

Открывается **Active Directory Domain Services Configuration Wizard**.

Выбираем **"Add a new forest"** - создаём новую инфраструктуру AD с нуля. Root domain name: **`lab.local`**.

Нажимаем **Next**.

![09_add_forest](/handson/images/ad_net/09_add_forest.png)

> Forest - это верхний контейнер AD. Все домены внутри одного леса доверяют друг другу автоматически.

### Шаг 10. Параметры контроллера домена

Настраиваем уровни функциональности:
- Forest functional level: **Windows Server 2016**
- Domain functional level: **Windows Server 2016**
- Галки: ✓ DNS Server, ✓ Global Catalog

Задаём пароль **DSRM** (Directory Services Restore Mode) - используется для аварийного восстановления AD. Без него не восстановить домен при сбое.

![10_dsrm](/handson/images/ad_net/10_dsrm.png)

### Шаг 11. NetBIOS-имя

Мастер автоматически предлагает NetBIOS-имя **LAB** - сокращение от `lab.local`. Это имя используется для обратной совместимости со старыми клиентами и для входа в формате `LAB\username`.

Оставляем **LAB**, нажимаем **Next**.

![11_netbios](/handson/images/ad_net/11_netbios.png)

### Шаг 12. Пути к базам данных

Оставляем пути по умолчанию:
- `C:\Windows\NTDS` - база данных AD и журналы транзакций
- `C:\Windows\SYSVOL` - папка с политиками и скриптами, реплицируется между DC

Нажимаем **Next → Next → Install**.

![12_paths](/handson/images/ad_net/12_paths.png)

Сервер автоматически перезагрузится. После перезагрузки домен `lab.local` существует.

### Шаг 13. Проверка результата

После перезагрузки сервер проверяет конфигурацию. Предупреждения о статическом IP и делегировании DNS - нормальны для лабораторной среды.

Нажимаем **Close**.

![13_success](/handson/images/ad_net/13_success.png)

---

## Фаза 3. OU-структура и объекты домена

### Шаг 14. Вход под доменной учётной записью

После перезагрузки на экране входа видим `LAB\Administrator` - вход уже под учётной записью домена, а не локального администратора. Домен работает.

![14_login](/handson/images/ad_net/14_login.png)

### Шаг 15. Открываем ADUC и создаём OU

Start → Windows Administrative Tools → **Active Directory Users and Computers**.

В левом дереве: ПКМ на `lab.local` → **New → Organizational Unit**.

![15_ou](/handson/images/ad_net/15_ou.png)

> OU - это не просто папки для порядка. GPO применяются именно к OU. Правильная структура = гибкое управление политиками.

### Шаг 16. Создаём OU "IT"

Name: **IT** → OK.

![16_it](/handson/images/ad_net/16_it.png)

### Шаг 17. Создаём OU "HR"

ПКМ на `lab.local` → New → Organizational Unit → Name: **HR** → OK.

![17_hr](/handson/images/ad_net/17_hr.png)

### Шаг 18. Создаём OU "Management"

ПКМ на `lab.local` → New → Organizational Unit → Name: **Management** → OK.

![18_management](/handson/images/ad_net/18_management.png)

В дереве слева теперь три OU: IT, HR, Management. Структура отражает отделы компании - к каждому можно применять отдельную политику.

---

## Фаза 4. Создание пользователей и групп

### Шаг 19. Начинаем создание пользователя

ПКМ на OU **IT** → **New → User**.

![19_user1](/handson/images/ad_net/19_user1.png)

### Шаг 20. Параметры пользователя Ivan Petrov

Заполняем:
- First name: `Ivan`, Last name: `Petrov`
- User logon name: **`petrov.i`**

Нажимаем **Next**.

![20_user1](/handson/images/ad_net/20_user1.png)

### Шаг 21. Пароль пользователя

Задаём пароль. Снимаем галку **"User must change password at next logon"**, ставим **"Password never expires"**.

Нажимаем **Next → Finish**.

![21_user1_pass](/handson/images/ad_net/21_user1_pass.png)

### Шаг 22. Создаём Anna Sidorova (HR)

ПКМ на OU **HR** → New → User.
- First name: `Anna`, Last name: `Sidorova`
- User logon name: **`sidorova.a`**

Те же настройки пароля → Finish.

![22_user2](/handson/images/ad_net/22_user2.png)

### Шаг 23. Создаём пользователя Admin (IT)

ПКМ на OU **IT** → New → User.
- User logon name: **`admin`**

Пароль → Finish.

![23_admin](/handson/images/ad_net/23_admin.png)

### Шаг 24. Добавляем admin в Domain Admins

`lab.local` → **Users** → двойной клик на **Domain Admins** → вкладка **Members** → **Add** → вводим `admin` → **Check Names** → OK → OK.

Теперь `admin` имеет полные права администратора домена.

![24_domain_admin](/handson/images/ad_net/24_domain_admin.png)

### Шаг 25. Создаём группу безопасности

ПКМ на OU **IT** → **New → Group**.

![25_new_group](/handson/images/ad_net/25_new_group.png)

### Шаг 26. Группа IT-Staff

- Group name: **IT-Staff**
- Group scope: **Global**
- Group type: **Security**

OK.

![26_it_staff](/handson/images/ad_net/26_it_staff.png)

> Security-группы используются для назначения прав доступа. Distribution-группы — только для рассылок. Нам нужна Security.

### Шаг 27. Добавляем участников в IT-Staff

Двойной клик на **IT-Staff** → вкладка **Members** → **Add** → добавляем `admin` и `Ivan Petrov` → OK.

![27_added_members](/handson/images/ad_net/27_added_members.png)

### Шаг 28. Группа HR-Staff

ПКМ на OU **HR** → New → Group → **HR-Staff**, Global, Security → OK.

Двойной клик на **HR-Staff** → Members → Add → `Anna Sidorova` → OK.

![28_hr_staff](/handson/images/ad_net/28_hr_staff.png)

---

## Фаза 5. Ввод клиента в домен

### Шаг 29. Настраиваем DNS на клиенте

На Windows 10: сетевые настройки → TCP/IPv4 → **Preferred DNS server: `10.10.70.132`** (IP нашего DC).

Без этого шага ввод в домен невозможен - клиент не найдёт `lab.local`.

![29_address_dc](/handson/images/ad_net/29_address_dc.png)

### Шаг 30. Указываем домен

ПКМ на **This PC** → Properties → **Change settings** → вкладка Computer Name → **Change** → переключаем на **Domain** → вводим `lab.local` → OK.

![30_lab_local](/handson/images/ad_net/30_lab_local.png)

### Шаг 31. Авторизация

Система запрашивает учётные данные для присоединения к домену. Вводим `Administrator` и пароль.

После успешной аутентификации появится сообщение "Welcome to the lab.local domain".

![31_pass_admin](/handson/images/ad_net/31_pass_admin.png)

### Шаг 32. Первый вход доменного пользователя

После перезагрузки клиента: **Other user** → вводим `sidorova.a` с паролем. На экране входа видно домен **LAB**.

Клиент теперь аутентифицируется через DC по протоколу Kerberos.

![32_user2_login](/handson/images/ad_net/32_user2_login.png)

---

## Фаза 6. GPO — блокировка CMD для HR

### Шаг 33. Создаём GPO в OU HR

Start → Windows Administrative Tools → **Group Policy Management**.

В дереве: `lab.local` → OU **HR** → ПКМ → **"Create a GPO in this domain, and Link it here..."**.

![33_gpo](/handson/images/ad_net/33_gpo.png)

### Шаг 34. Называем GPO

Name: **HR - Block CMD** → OK.

GPO создан и автоматически привязан к OU HR - политика будет применяться ко всем пользователям и компьютерам внутри этого OU.

![34_hr_block_cmd](/handson/images/ad_net/34_hr_block_cmd.png)

### Шаг 35. Настраиваем политику

ПКМ на **HR - Block CMD** → **Edit**.

Идём по дереву:
**User Configuration → Policies → Administrative Templates → System**

Находим **"Prevent access to the command prompt"** → двойной клик → **Enabled** → "Disable the command prompt script processing also?" → **Yes** → OK.

![35_enabled](/handson/images/ad_net/35_enabled.png)

> Блокируем именно через User Configuration - политика следует за пользователем, а не за компьютером. Куда бы `sidorova.a` ни вошла, cmd будет заблокирован.

### Шаг 36. Применяем GPO принудительно

На клиентской машине под `sidorova.a` открываем PowerShell (пока ещё доступен) и выполняем:

```
gpupdate /force
```

![36_gpupdate](/handson/images/ad_net/36_gpupdate.png)

### Шаг 37. Проверка - cmd заблокирован

Start → вводим `cmd` → Enter.

Появляется сообщение: **"The command prompt has been disabled by your administrator."**

GPO применилась. Пользователь `sidorova.a` из OU HR не может открыть командную строку. Пользователь `petrov.i` из OU IT - может.

![37_disabled_cmd](/handson/images/ad_net/37_disabled_cmd.png)

---

## Фаза 7. LDAP-структура изнутри

### Шаг 38. Подключаемся через ldp.exe

Start → вводим `ldp` → Enter.

**Connection → Connect** → Server: `WIN-H5P0PJB7B3A.lab.local`, Port: `389` → OK.

**Connection → Bind** → **"Bind as currently logged on user"** → OK.

В правой части появляется информация о сервере: `namingContexts`, `supportedLDAPVersion`, `supportedSASLMechanisms` — всё что DC сообщает при первом контакте.

![38_ldp](/handson/images/ad_net/38_ldp.png)

### Шаг 39. Смотрим дерево домена

**View → Tree** → BaseDN: `DC=lab, DC=local` → OK.

В левой части разворачивается LDAP-дерево домена. Разворачиваем `OU=HR` → `CN=Anna Sidorova` - видим все атрибуты объекта в правой части.

![39_tree_biew](/handson/images/ad_net/39_tree_biew.png)

> Именно так AD хранит каждый объект - набор атрибутов в LDAP. `DN` (Distinguished Name) - уникальный путь: `CN=Anna Sidorova,OU=HR,DC=lab,DC=local`.

### Шаг 40. Атрибуты пользователя

В ldp.exe разворачиваем объект `Anna Sidorova`. Ключевые атрибуты:

| Атрибут | Значение | Что означает |
| --- | --- | --- |
| `lastLogon` | 5/9/2026 4:14:29 AM | Последний успешный вход |
| `logonCount` | 3 | Количество входов |
| `userAccountControl` | 0x10200 | NORMAL_ACCOUNT + DONT_EXPIRE_PASSWORD |

![40_user2](/handson/images/ad_net/40_user2.png)

---

## Фаза 8. Аудит входов

### Шаг 41. Включаем Audit Logon

В **Group Policy Management** → ПКМ на **Default Domain Policy** → **Edit**.

**Computer Configuration → Policies → Windows Settings → Security Settings → Advanced Audit Policy Configuration → Audit Policies → Logon/Logoff**

Двойной клик на **"Audit Logon"** → ✓ **Success**, ✓ **Failure** → OK.

![41_audit_1](/handson/images/ad_net/41_audit_1.png)

### Шаг 42. Включаем Audit Logoff

Двойной клик на **"Audit Logoff"** → ✓ **Success** → OK.

![42_logoff](/handson/images/ad_net/42_logoff.png)

### Шаг 43. Включаем Audit Kerberos Authentication

В разделе **Account Logon** → двойной клик на **"Audit Kerberos Authentication Service"** → ✓ **Success**, ✓ **Failure** → OK.

![43_aduit_kerberos](/handson/images/ad_net/43_aduit_kerberos.png)

> Kerberos-аудит фиксирует TGT-запросы. Это важно: Pass-the-Ticket и Golden Ticket атаки видны именно здесь — в событиях 4768 и 4769.

### Шаг 44. Генерируем событие неудачного входа

На клиентской машине пробуем войти под `sidorova.a` с **неверным паролем** несколько раз подряд.

Система отвечает: **"The password is incorrect"** - это генерирует Event ID 4625 в Security Log на DC.

![44_incorrect](/handson/images/ad_net/44_incorrect.png)

### Шаг 45. Event Viewer - фильтрация по Event ID

На DC: Start → **Event Viewer** → Windows Logs → **Security** → справа **"Filter Current Log"** → Event ID: `4624` → OK.

Видим все успешные входы в систему с момента включения аудита.

![45_event_viewer](/handson/images/ad_net/45_event_viewer.png)

### Шаг 46. Детали события - кто, откуда, как

Двойной клик на событие 4624. Ключевые поля:

| Поле | Значение | Что означает |
| --- | --- | --- |
| `Account Name` | sidorova.a | Кто вошёл |
| `LogonProcessName` | Kerberos | Протокол аутентификации |
| `AuthenticationPackageName` | Kerberos | Подтверждение: использован Kerberos |
| `IpAddress` | 10.10.70.134 | С какой машины выполнен вход |
| `LogonType` | 10 | RemoteInteractive (RDP) |

![46_ip_user2](/handson/images/ad_net/46_ip_user2.png)

> В реальном SOC Event 4625 с одного IP несколько раз подряд - сигнал брутфорса. Event 4624 с `LogonType: 10` в нерабочее время - подозрительный удалённый вход. Именно с этих событий начинается расследование инцидента.

---

## Итоги и выводы

### Что построили

| Компонент | Результат |
| --- | --- |
| Домен lab.local | Поднят на Windows Server 2022 |
| OU: IT, HR, Management | Структура создана |
| Ivan Petrov (petrov.i) | Создан в OU IT, входит в IT-Staff |
| Anna Sidorova (sidorova.a) | Создана в OU HR, входит в HR-Staff |
| admin | Создан в OU IT, добавлен в Domain Admins |
| Клиент WIN10 | Введён в домен lab.local |
| GPO: HR - Block CMD | Применён к OU HR, cmd заблокирован |
| LDAP-исследование | Структура изучена через ldp.exe |
| Аудит входов | Event ID 4624/4625 фиксируются |

### Карта событий безопасности

| Event ID | Событие | Где смотреть |
| --- | --- | --- |
| 4624 | Успешный вход | Security Log на DC |
| 4625 | Неудачная попытка входа | Security Log на DC |
| 4768 | Kerberos TGT запрос | Security Log на DC |
| 4769 | Kerberos TGS запрос | Security Log на DC |
| 4728 | Добавление в глобальную группу | Security Log на DC |
| 4720 | Создание пользователя | Security Log на DC |

### Что дальше

Эта лаба - фундамент. Следующий уровень:

**BloodHound** - картографирование AD, поиск путей эскалации привилегий через цепочки доверия.

**Kerberoasting** - атака на сервисные аккаунты через SPN. Злоумышленник запрашивает TGS-тикет и брутфорсит его офлайн.

**Pass-the-Hash / Pass-the-Ticket** - движение по домену без знания пароля, только с хешем или тикетом.

**Wazuh SIEM** - централизованный сбор всех Event ID с DC и клиентов, корреляция и алёрты в реальном времени.
