---
title: "Part-4. Installing Wazuh Agent and Sysmon on Windows 10"
description: "Deploying Wazuh SIEM for monitoring and detecting network attacks in Active Directory domain environment"
---
[In the previous part](https://mnuryyev.github.io/handson/ru/projects/soc-project/part_3) we installed and configured Wazuh on Ubuntu Server - our SIEM is running and waiting for data. Now we're moving on to Windows 10, our victim machine. In this part, we'll connect it to Wazuh through an agent, install Sysmon for extended logging, and configure the agent to transmit Sysmon events to our server.

Without these steps, Wazuh will only see basic Windows events, and that's not enough to detect real attacks. Sysmon gives us depth: process creation, network connections, registry changes, and much more that the standard log simply doesn't capture.



## Step 1. Renaming the Computer

Before connecting the machine to monitoring, let's give it an understandable name. By default, Windows generates a random name like *DESKTOP-7OR8R9R*, which is extremely inconvenient when working with multiple hosts in one interface.

We open Settings → System → About and click **Rename this PC**. We enter a new name.

![10_rename_pc](/handson/images/soc_project/part_4/10_rename_pc.png)

After reboot, we check the result - in the Device Specifications section the name **target-PC** is now displayed.

![11_renamed_pc](/handson/images/soc_project/part_4/11_renamed_pc.png)

Now in the Wazuh interface we'll immediately understand which exact machine we're working with.



## Step 2. Deploying Wazuh Agent

We return to the browser and open Wazuh Dashboard at **https://10.10.70.30**. On the main page we see the familiar message "This instance has no agents registered". We click the "Deploy new agent" button.

![01_deploy_agent](/handson/images/soc_project/part_4/01_deploy_agent.png)

The agent installation wizard opens before us. On the first step, we need to choose the operating system, we select Windows and the MSI 32/64 bits option.

![02_select_windows](/handson/images/soc_project/part_4/02_select_windows.png)

On the next step, we enter the IP address of our Wazuh server - **10.10.70.30**. Exactly to this address the agent will send all events and receive commands from the server.

![03_server_ip](/handson/images/soc_project/part_4/03_server_ip.png)

Next, we set the agent name - we enter Windows10. This name will be displayed in the Wazuh interface and allow us to easily identify the host among other machines.

![04_agent_name](/handson/images/soc_project/part_4/04_agent_name.png)

After filling in all fields, the wizard generates a ready command for installing the agent through PowerShell. We copy it.

![05_command_for_win](/handson/images/soc_project/part_4/05_command_for_win.png)



## Step 3. Installing the Agent on Windows 10

We switch to the **target-PC** virtual machine. We open PowerShell as administrator and paste the copied command. The command automatically downloads the agent MSI file and installs it in the background with the needed parameters - server address and agent name.

![06_run_command](/handson/images/soc_project/part_4/06_run_command.png)

After installation completes, we start the agent service:
```
NET START WazuhSvc
```

![07_started](/handson/images/soc_project/part_4/07_started.png)

We see two key messages: "The Wazuh service is starting" and "The wazuh service was started successfully". The agent is installed and connecting to server **10.10.70.30**.



## Step 4. Checking Agent Connection

We return to **Wazuh Dashboard**. In the Agents Summary section, Active (1) is now displayed. In the last 24 hours widget, the first events have already appeared: 270 medium-level events and 144 low-level events. The agent connected and started transmitting data.

![08_active](/handson/images/soc_project/part_4/08_active.png)

We go to the Endpoints section for detailed verification. Here we see our machine in the agents table: **ID 001**, name **Windows10**, IP address **10.10.70.134**, status **active**, operating system **Microsoft Windows 10 Pro**, agent version **v4.10.3**.

![09_agent_wazuh](/handson/images/soc_project/part_4/09_agent_wazuh.png)

The agent is working correctly. Moving on to the next step, Sysmon installation.



## Step 5. Downloading Sysmon

The standard Windows event log captures far from everything. For example, it doesn't record details about running processes, doesn't track network connections at the process level, and doesn't capture file hashes. Exactly for this, Sysmon exists - a tool from Microsoft Sysinternals that significantly expands logging capabilities.

We open a browser and go to the official Microsoft Learn site, search for Sysmon, and download the current version.

![19_sysmon_download](/handson/images/soc_project/part_4/19_sysmon_download.png)

Sysmon alone is not enough. We need a configuration file that will tell it exactly what to log. Without configuration, Sysmon generates a huge amount of noise. We'll use a ready-made configuration from **Olaf Hartong**, the sysmon-modular project.

We search in the browser for **olaf sysmon modular github** and go to the repository page.

![20_sysmon_olaf_config](/handson/images/soc_project/part_4/20_sysmon_olaf_config.png)

On the repository page, we find ready configuration files for different monitoring scenarios.

![21_xml](/handson/images/soc_project/part_4/21_xml.png)

We open the needed file in Raw mode, this allows us to see pure XML content without GitHub formatting.

![22_xml_raw](/handson/images/soc_project/part_4/22_xml_raw.png)

We save the file under the name **sysmonconfig**.

![22_xml_download](/handson/images/soc_project/part_4/22_xml_download.png)



## Step 6. Installing Sysmon

In the downloads folder, we now have two files: the **Sysmon** archive and the **sysmonconfig.xml** configuration file. We extract the contents of the **Sysmon** archive.

![23_extract_sysmon](/handson/images/soc_project/part_4/23_extract_sysmon.png)

We copy the file path

![24_copy_path](/handson/images/soc_project/part_4/24_copy_path.png)

We open **PowerShell** as administrator and navigate to the folder with extracted files:

``` cd C:\Users\User\Downloads\Sysmon ```

![25_powershell](/handson/images/soc_project/part_4/25_powershell.png)

We launch **Sysmon** installation with specification of our configuration file:

``` .\Sysmon64.exe -i ..\sysmonconfig.xml ```

The **-i** flag means installation using a configuration file. **Sysmon** outputs the Sysinternals license agreement, we click Agree.

![26_agree](/handson/images/soc_project/part_4/26_agree.png)

After accepting the license, installation completes. In the output we see a sequence of steps: **configuration loading, SysmonDrv driver installation, its startup, and the final message "Sysmon64 started"**.

![27_installed](/handson/images/soc_project/part_4/27_installed.png)

**Sysmon** is installed and working. Now Windows has started generating much more detailed security events. But for Wazuh to see them, we need to do one more step.



## Step 7. Configuring ossec.conf to Collect Sysmon Events

By default, Wazuh Agent doesn't know that **Sysmon** is installed on the machine. We need to explicitly tell the agent to read the Sysmon event log and send them to the server. For this, we open the agent configuration file.

We navigate to the path ``` C:\Program Files (x86)\ossec-agent\ ``` and open the **ossec.conf** file in Notepad as administrator. At the end of the **<ossec_config>** section, we add the following block:

```
<localfile>
    <location>Microsoft-Windows-Sysmon/Operational</location>
    <log_format>eventchannel</log_format>
</localfile>
```

![28_ossec_config](/handson/images/soc_project/part_4/28_ossec_config.png)

This block tells the agent: read events from the **Microsoft-Windows-Sysmon/Operational** channel and transmit them to **Wazuh server** in **eventchannel** format. We save the file.



## Step 8. Restarting Wazuh Agent Service

Any changes in ossec.conf take effect only after restarting the agent service. We execute in PowerShell:

``` Restart-Service -Name Wazuh ```

![29_restart](/handson/images/soc_project/part_4/29_restart.png)

The service restarted and is now reading the updated configuration. From this moment, all Sysmon events: process creation, network connections, registry changes - will arrive at our Wazuh server and be displayed in the Dashboard.
