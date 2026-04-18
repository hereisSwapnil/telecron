# Telecron Agent Map

## Service Map

- `Telecron` -> Global Orchestrator & Job Scheduler (Manages external downstream agents, scripts, pipelines, and notifications blindly via YAML configs)

## Pipeline Orchestration Example

By configuring Telecron, you can automate any suite of microservices or agents across your server without writing custom daemon loops. 

Telecron sequentially passes control along the pipeline, stopping and alerting if any single agent fails in the chain.

Example orchestration sequence handled entirely by `telecron`:
`Extraction Agent` (Scraping/Fetching) -> `Processing Agent` (Transformation/Routing) -> `Intelligence Agent` (Summarization/Vectorization) -> `Persistence Agent` (Database Write)

## Telecron Quick Reference

- **Stages**: `PARSE SCHEDULER -> SPAWN BASH PROCESS -> STREAM LOGS -> EXTRACT REGEX STATS -> NOTIFY TELEGRAM`
- **Inputs**:
  - `telecron.yml` configuration
  - Shell commands mapped to specific agents/folders (e.g., `npm start`, `python run.py`)
  - Explicit execution directories (`cwd`)
- **Outputs**:
  - Local chronological logs mapped securely in `./logs/<job_name>/<timestamp>`
  - Instant Telegram notifications parsing out failures, durations, or success lines
- **Commands**:
  - `telecron init` - Initialize environment template securely.
  - `telecron start` - Keep daemon alive referencing scheduling times.
  - `telecron run <job_name>` - Fire immediate bypass to trigger the sequence without waiting for the clock.
