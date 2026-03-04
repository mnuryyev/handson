---
title: "Part-4. Установка Wazuh Agent и Sysmon на Windows 10"
description: "Развертывание Wazuh SIEM для мониторинга и выявления сетевых атак в доменной среде Active Directory"
---
[В предыдущей части](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_3) мы установили и настроили Wazuh на Ubuntu Server - наш SIEM запущен и ждёт данных. Теперь переходим к Windows 10, нашей машине-жертве. В этой части мы подключим её к Wazuh через агент, установим Sysmon для расширенного логирования и настроим агент так, чтобы он передавал события Sysmon на наш сервер.

Без этих шагов Wazuh будет видеть только базовые события Windows, а этого недостаточно для обнаружения реальных атак. Sysmon даёт нам глубину: создание процессов, сетевые подключения, изменения в реестре и многое другое, чего стандартный журнал просто не фиксирует.



## Шаг 1. Переименование компьютера

Прежде чем подключать машину к мониторингу, дадим ей понятное имя. По умолчанию Windows генерирует случайное имя вида *DESKTOP-7OR8R9R*, что крайне неудобно при работе с несколькими хостами в одном интерфейсе.

Открываем Settings → System → About и нажимаем **Rename this PC**. Вводим новое имя.

![10_rename_pc](/handson/images/soc_project/part_4/10_rename_pc.png)

После перезагрузки проверяем результат — в разделе Device Specifications теперь отображается имя **target-PC**.

![11_renamed_pc](/handson/images/soc_project/part_4/11_renamed_pc.png)

Теперь в интерфейсе Wazuh мы сразу будем понимать, с какой именно машиной работаем.



## Шаг 2. Развёртывание Wazuh Agent

Возвращаемся в браузер и открываем Wazuh Dashboard по адресу **https://10.10.70.30**. На главной странице мы видим знакомое сообщение "This instance has no agents registered". Нажимаем кнопку "Deploy new agent".

![01_deploy_agent](/handson/images/soc_project/part_4/01_deploy_agent.png)

Перед нами открывается мастер установки агента. На первом шаге нам нужно выбрать операционную систему, выбираем Windows и опцию MSI 32/64 bits.

![02_select_windows](/handson/images/soc_project/part_4/02_select_windows.png)

На следующем шаге вводим IP-адрес нашего Wazuh сервера - **10.10.70.30**. Именно на этот адрес агент будет отправлять все события и получать команды от сервера.

![03_server_ip](/handson/images/soc_project/part_4/03_server_ip.png)

Далее задаём имя агента - вводим Windows10. Это имя будет отображаться в интерфейсе Wazuh и позволит нам легко идентифицировать хост среди других машин.

![04_agent_name](/handson/images/soc_project/part_4/04_agent_name.png)

После заполнения всех полей мастер генерирует готовую команду для установки агента через PowerShell. Копируем её.

![05_command_for_win](/handson/images/soc_project/part_4/05_command_for_win.png)



## Шаг 3. Установка агента на Windows 10

Переключаемся на виртуальную машину Windows 10. Открываем PowerShell от имени администратора и вставляем скопированную команду. Команда автоматически скачивает MSI-файл агента и устанавливает его в фоновом режиме с нужными параметрами - адресом сервера и именем агента.

![06_run_command](/handson/images/soc_project/part_4/06_run_command.png)

После завершения установки запускаем службу агента:
```
NET START WazuhSvc
```

![07_started](/handson/images/soc_project/part_4/07_started.png)

Мы видим два ключевых сообщения: "The Wazuh service is starting" и "The wazuh service was started successfully". Агент установлен и подключается к серверу **10.10.70.30**.



## Шаг 4. Проверка подключения агента

Возвращаемся в **Wazuh Dashboard**. В разделе Agents Summary теперь отображается Active (1). В виджете последних 24 часов уже появились первые события: 270 событий среднего уровня и 144 события низкого уровня. Агент подключился и начал передавать данные.

![08_active](/handson/images/soc_project/part_4/08_active.png)

Переходим в раздел Endpoints для детальной проверки. Здесь мы видим нашу машину в таблице агентов: **ID 001**, имя **Windows10**, IP-адрес **10.10.70.134**, статус **active**, операционная система **Microsoft Windows 10 Pro**, версия агента **v4.10.3**.

![09_agent_wazuh](/handson/images/soc_project/part_4/09_agent_wazuh.png)

Агент работает корректно. Переходим к следующему шагу, установке Sysmon.



## Шаг 5. Загрузка Sysmon

Стандартный журнал событий Windows фиксирует далеко не всё. Например, он не записывает детали о запущенных процессах, не отслеживает сетевые подключения на уровне процессов и не фиксирует хэши файлов. Именно для этого существует Sysmon, это инструмент от Microsoft Sysinternals, который существенно расширяет возможности логирования.

Открываем браузер и переходим на официальный сайт Microsoft Learn, ищем Sysmon и скачиваем актуальную версию.

![19_sysmon_download](/handson/images/soc_project/part_4/19_sysmon_download.png)

Одного Sysmon недостаточно. Нам нужен конфигурационный файл, который скажет ему, что именно логировать. Без конфигурации Sysmon генерирует огромное количество шума. Мы будем использовать готовую конфигурацию от **Olaf Hartong**, проект sysmon-modular.

Ищем в браузере **olaf sysmon modular github** и переходим на страницу репозитория.

![20_sysmon_olaf_config](/handson/images/soc_project/part_4/20_sysmon_olaf_config.png)

На странице репозитория находим готовые конфигурационные файлы для разных сценариев мониторинга.

![21_xml](/handson/images/soc_project/part_4/21_xml.png)

Открываем нужный файл в режиме Raw, это позволяет нам видеть чистое содержимое XML без оформления GitHub.

![22_xml_raw](/handson/images/soc_project/part_4/22_xml_raw.png)

Сохраняем файл под именем **sysmonconfig**.

![22_xml_download](/handson/images/soc_project/part_4/22_xml_download.png)



## Шаг 6. Установка Sysmon

В папке загрузок у нас теперь есть два файла: архив **Sysmon** и конфигурационный файл **sysmonconfig.xml**. Извлекаем содержимое архива **Sysmon**.

![23_extract_sysmon](/handson/images/soc_project/part_4/23_extract_sysmon.png)

Копируем путь к файлу

![24_copy_path](/handson/images/soc_project/part_4/24_copy_path.png)

Открываем **PowerShell** от имени администратора и переходим в папку с извлечёнными файлами:

``` cd C:\Users\User\Downloads\Sysmon ```

![25_powershell](/handson/images/soc_project/part_4/25_powershell.png)

Запускаем установку **Sysmon** с указанием нашего конфигурационного файла:

``` .\Sysmon64.exe -i ..\sysmonconfig.xml ```

Флаг **-i** означает установку с использованием конфигурационного файла. **Sysmon** выводит лицензионное соглашение Sysinternals, нажимаем Agree.

![26_agree](/handson/images/soc_project/part_4/26_agree.png)

После принятия лицензии установка завершается. В выводе мы видим последовательность шагов: **загрузка конфигурации, установка драйвера SysmonDrv, его запуск и финальное сообщение "Sysmon64 started"**.

![27_installed](/handson/images/soc_project/part_4/27_installed.png)

**Sysmon** установлен и работает. Теперь Windows начала генерировать гораздо более детальные события безопасности. Но чтобы Wazuh их видел, нам нужно сделать ещё один шаг.



## Шаг 7. Настройка ossec.conf для сбора событий Sysmon

По умолчанию Wazuh Agent не знает о том, что на машине установлен **Sysmon**. Нам нужно явно указать агенту читать журнал событий Sysmon и отправлять их на сервер. Для этого открываем конфигурационный файл агента.

Переходим по пути ``` C:\Program Files (x86)\ossec-agent\ ``` и открываем файл **ossec.conf** в Блокноте от имени администратора. В конец секции **<ossec_config>** добавляем следующий блок:

```
<localfile>
    <location>Microsoft-Windows-Sysmon/Operational</location>
    <log_format>eventchannel</log_format>
</localfile>
```

![28_ossec_config](/handson/images/soc_project/part_4/28_ossec_config.png)

Этот блок говорит агенту: читать события из канала **Microsoft-Windows-Sysmon/Operational** и передавать их на **Wazuh сервер** в формате **eventchannel**. Сохраняем файл.



## Шаг 8. Перезапуск службы Wazuh Agent

Любые изменения в ossec.conf вступают в силу только после перезапуска службы агента. Выполняем в PowerShell:

``` Restart-Service -Name Wazuh ```

![29_restart](/handson/images/soc_project/part_4/29_restart.png)

Служба перезапустилась и теперь читает обновлённую конфигурацию. С этого момента все события Sysmon: создание процессов, сетевые подключения, изменения в реестре - будут поступать на наш Wazuh сервер и отображаться в Dashboard.

