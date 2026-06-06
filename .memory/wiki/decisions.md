# Architectural Decisions

- **Centralized Log Directory**: Decided to route all execution logs into the global `.telecron` directory rather than local `cwd` folders. This allows the `telecron clean` command to sweep old logs reliably and prevents cluttering the user's local projects.
- **YAML Configuration**: Chosen over JSON for the `telecron.yml` configuration because of its readability, comment support, and "product-first" design, which makes pipeline orchestration highly accessible to users.
- **Native Telegram Integration**: Rather than using generic webhooks, Telegram is deeply integrated natively using a Bot Token and Chat ID. This provides rich HTML formatting natively for pipeline summaries.
- **File-System over Database**: Decided against an embedded database (like SQLite). It relies purely on the filesystem for persistence (Logs, Configs, PIDs). This keeps the daemon lightweight and easy to clean up.
- **Fail-Fast Pipelines**: Designed the pipeline to halt immediately if a task in a sequence fails, preventing cascading errors in subsequent dependent tasks. It immediately alerts Telegram and emits `JobEvents.FAILURE`.
