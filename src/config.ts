import fs from 'fs';
import yaml from 'yaml';
import path from 'path';

export interface TaskConfig {
  name: string;
  command: string;
  cwd?: string;
  extract_log_regex?: string;
}

export interface JobConfig {
  schedule?: string;
  notify_start?: boolean;
  notify_end?: boolean;
  tasks: TaskConfig[];
}

export interface TelecronConfig {
  telegram?: {
    bot_token: string;
    chat_id: string;
  };
  jobs: Record<string, JobConfig>;
}

export function loadConfig(configPath: string): TelecronConfig {
  const unresolvedPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(unresolvedPath)) {
    throw new Error(`Configuration file not found at: ${unresolvedPath}`);
  }
  const fileContent = fs.readFileSync(unresolvedPath, 'utf8');
  return yaml.parse(fileContent) as TelecronConfig;
}

export function createDefaultConfig(targetPath: string) {
  const defaultConfig = `# ==========================================
# Telecron Configuration File
# ==========================================
# This file dictates what tasks to run, when to run them,
# where they should execute, and who to notify via Telegram.

telegram:
  bot_token: "YOUR_BOT_TOKEN_HERE"
  chat_id: "YOUR_CHAT_ID_HERE"

jobs:
  # 'example_pipeline' is the name of this job sequence. 
  # You can create multiple jobs by duplicating this block.
  example_pipeline:
  
    # 1. WHEN TO RUN:
    # We support plain English schedules! 
    # Examples: "every day at 02:00", "every hour", "every 15 minutes", "every 5 hours"
    # (You can also still use standard CRON syntax like "0 2 * * *" if you prefer).
    # Leave empty or remove this line to disable automatic scheduling.
    schedule: "every day at 02:00" 

    notify_start: true
    notify_end: true

    # 2. WHAT TO RUN:
    # A sequence of shell tasks that run sequentially. 
    # If one task fails, the pipeline aborts.
    tasks:
      - name: "Data Fetcher"
        command: "echo 'Scraping data... Batch complete: 15 articles'"
        
        # Where to execute the command. Defaults to the folder telecron was launched from.
        cwd: "."  
        
        # (Optional) Regex to search in the final log file to extract a one-liner 
        # summary for your Telegram notification.
        extract_log_regex: "Batch complete.*"

      # - name: "Data Processor"
      #   command: "npm run start"
      #   cwd: "/path/to/my/repo"
`;
  fs.writeFileSync(targetPath, defaultConfig, 'utf8');
}
