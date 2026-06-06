# Tech Stack

The Telecron project is built on the following stack:

- **Runtime Engine**: Node.js (>= 20.0.0)
- **Language**: TypeScript
- **CLI Framework**: `commander` for managing CLI arguments and commands (`init`, `start`, `configure`, etc.)
- **Scheduling**: `node-cron` for executing scheduled cron tasks.
- **Configuration**: `yaml` for reading and parsing the `telecron.yml` config file.
- **Terminal UI & Styling**: `picocolors` for colored terminal output and `prompts` for interactive UI setup (`telecron configure`).
- **Network / API**: `axios` for interacting with the Telegram Bot API (`TelegramNotifier`).
- **Process Management**: Native Node.js `child_process` (`spawn`) for executing external bash commands/pipelines.
