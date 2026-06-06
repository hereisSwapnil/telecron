# Coding & Architectural Patterns

- **Global Config & PID Management**: Primary configuration and states are centralized in the user's home directory (`~/.telecron`). The daemon writes its process ID to `~/.telecron.pid` to ensure idempotency and manage background execution.
- **Natural Language Parsing**: Translates human-readable scheduling ("every 30 minutes", "every day at 02:00") into standard cron syntax via Regex before passing it to `node-cron`.
- **Event-Driven Chaining**: Employs an internal Event Emitter (`events.ts`) tracking `JobEvents.SUCCESS` and `JobEvents.FAILURE`. If a job uses `depends_on`, the daemon listens for these events to conditionally trigger downstream pipelines.
- **Detached Subprocesses**: Tasks are spawned with `detached: true` in their own process groups. This ensures that the whole tree can be gracefully killed on `SIGINT`/`SIGTERM` or when a defined `timeout` is reached.
- **Log Streaming & Regex Extraction**: Task outputs are simultaneously piped to standard out and a rolling `.log` file. Upon completion, Telecron re-reads this log file, applies `extract_log_regex` to extract critical text snippets, and injects them into Telegram payloads.
- **Retry Mechanism (`auto_retry`)**: Tasks are wrapped in a `while` loop, checking `exitCode !== 0` against `maxAttempts`, handling transient failures without breaking the pipeline instantly.
