<h1 align="center">Telecron</h1>

<p align="center">
  <strong>The missing link between your scripts and your pocket.</strong><br>
  Stop watching terminals. Real-time orchestration, human-first scheduling, and intelligent feedback—delivered directly to Telegram.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/telecron"><img src="https://img.shields.io/npm/v/telecron.svg?style=flat-square&color=007bff" alt="NPM Version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-333333.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-00c853.svg?style=flat-square" alt="Node Version">
</p>

---

## Why Telecron?

Most cron jobs are "fire and forget"—until they fail silently. **Telecron** turns your background tasks into interactive shared experiences. It’s built for developers who need to chain complex logic, extract meaningful data from logs, and get notified the second something moves.

### ✦ Automation that talks back
Get rich HTML updates on your phone. Whether it's a successful extraction or a pipeline crash, you'll know exactly what happened and how long it took.

### ✦ Because you don't speak `* * * * *`
Schedule jobs using phrases you actually understand. `every day at 04:00` or `every 30 minutes`. Telecron handles the translation so you can focus on the logic.

### ✦ Pipelines without the "Glue"
Stop writing nested shell scripts to handle dependencies. Chain jobs together in YAML: *run the scraper, then the analyzer, then the backup.* One fails? The chain stops and alerts you.

### ✦ Deep Insights, Zero Effort
Telecron doesn't just run commands; it reads them. Use Regex to pull key stats from your logs (e.g., "Articles Scraped: 142") and display them in your Telegram notification automatically.

---

## 🚦 Quick Start

### 1. Grab the CLI
```bash
npm install -g telecron
```

### 2. Initialize & Configure
```bash
telecron init          # Generate your telecron.yml
telecron configure     # Visual UI to tweak your jobs
```

### 3. Launch the Hub
Keep the daemon running in the background. It manages the clock and your tasks silently.
```bash
telecron start
```

---

## 📋 The "Product-First" Config

```yaml
# telecron.yml
jobs:
  daily_intelligence:
    schedule: "every day at 02:00"
    notify_end: true
    tasks:
      - name: "Web Scraper"
        command: "npm start"
        cwd: "./agents/scraper"
        extract_log_regex: "Success: (\\d+) items" # Stats sent to Telegram!
        
      - name: "AI Classifier"
        command: "python3 main.py"
        cwd: "./agents/ai"
```

---

## 💻 CLI Tools

| Command              | Purpose                                           |
| :------------------- | :------------------------------------------------ |
| `init` / `configure` | Setup your environment and visual job management. |
| `start` / `stop`     | Manage the background engine.                     |
| `run <job>`          | Trigger a pipeline manually (skip the clock).     |
| `list`               | See what’s scheduled and what’s disabled.         |
| `clean`              | Wipe old logs and keep your server lean.          |

---

## ⚖️ License
Distributed under the **MIT License**. See [LICENSE](LICENSE) for the full text.

---

<p align="center">
  Built for developers who value their time and their notifications.
</p>
