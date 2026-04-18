# Telecron (Task-Runner)

A production-grade job runner CLI powered by Node.js. Define sequential CLI tasks mapped to cron expressions via an elegant YAML configuration file, capture the exact elapsed time for each pipeline block, extract insights using Regex, and stream rich HTML updates to your Telegram bot natively.

## Installation

Install globally on your system so you can execute `telecron` anywhere:
```bash
npm install
npm run build
npm link
```
*(If you do not want to install it globally, navigate to the folder and use `npx telecron`).*

## Quick Start
1. **Initialize configuration**
   ```bash
   telecron init
   ```
   This generates a `telecron.yml` file gracefully in your current directory.

2. **Configure your Telegram Keys**
   Get your bot token from BotFather and find your Chat ID. Under the `telegram:` section, fill them in safely.

3. **Start the daemon**
   Keep this running in `tmux`, `screen`, or a Systemd file block.
   ```bash
   telecron start
   ```

4. **Trigger Manually**
   ```bash
   telecron run my_pipeline
   ```

## Configuration Examples (`telecron.yml`)

### Human-Readable Schedules
Telecron magically translates human strings into valid CRON constraints behind the scenes!

```yaml
jobs:
  daily_sync:
    schedule: "every day at 02:00"  # Translates to "0 2 * * *"
    notify_end: true
    tasks:
      - name: "Database Backup"
        command: "pg_dump -U postgres > backup.sql"
```

```yaml
jobs:
  hourly_ping:
    schedule: "every hour"  # Translates to "0 * * * *"
    tasks: 
      - name: "Network check"
        command: "ping -c 4 8.8.8.8"
```

### Complex Sequential Pipelines
If a single task crashes, the pipeline successfully halts and instantly fires an emergency notification. Because Telecron accepts explicit `cwd` definitions, you can trigger processes spanning your entire computer.

```yaml
jobs:
  data_pipeline:
    schedule: "every day at 04:00"  # Or standard cron like "0 4 * * *"
    notify_start: true
    notify_end: true
    tasks:
      - name: "Data Extraction"
        command: "npm run extract"
        cwd: "/path/to/extracted/module"
        extract_log_regex: "Success.*"   # Automatically extracts the completion summary from the log output dynamically for Telegram!
        
      - name: "Data Transformation"
        command: "python3 transform.py"
        cwd: "/path/to/transformation/module"
        
      - name: "Final Validation"
        command: "pytest tests/"
        cwd: "/path/to/validation/module"
```

## Logs & Transparency
Instead of obfuscated shell execution, `telecron` beautifully streams Standard Out and Error right to your terminal concurrently while dumping full `.log` files cleanly to dynamic `logs/<job_name>/<timestamp>` directories. You never lose execution history!
