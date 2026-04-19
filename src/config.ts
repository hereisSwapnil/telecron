import fs from 'fs';
import yaml from 'yaml';
import path from 'path';
import os from 'os';

export interface TaskConfig {
  name: string;
  command: string;
  cwd?: string;
  extract_log_regex?: string;
  auto_retry?: number;
  timeout?: string;  // e.g. "5 minutes", "30 seconds", "2 hours"
}

export interface JobConfig {
  name?: string;
  schedule?: string;
  timezone?: string;
  enabled?: boolean;
  notify_start?: boolean;
  notify_end?: boolean;
  depends_on?: string | string[];
  delay?: string;
  tasks: TaskConfig[];
}

export interface TelecronConfig {
  timezone?: string;
  telegram?: {
    bot_token: string;
    chat_id: string;
  };
  jobs: Record<string, JobConfig>;
}

export function getGlobalConfigPath(): string {
  return path.resolve(os.homedir(), '.telecron.yml');
}

export function getGlobalLogDir(): string {
  const dir = path.resolve(os.homedir(), '.telecron', 'logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolves the configuration path to the global ~/.telecron.yml.
 * Enforces centralized management as per user requirements.
 */
export function resolveConfigPath(specifiedPath?: string): string {
  if (specifiedPath && specifiedPath !== 'telecron.yml') {
    return path.resolve(process.cwd(), specifiedPath);
  }

  return getGlobalConfigPath();
}

export function loadConfig(resolvedPath: string): TelecronConfig {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found at: ${resolvedPath}`);
  }
  const fileContent = fs.readFileSync(resolvedPath, 'utf8');
  try {
    return yaml.parse(fileContent) as TelecronConfig;
  } catch (err: any) {
    throw new Error(`Invalid YAML in ${resolvedPath}: ${err.message}`);
  }
}

export function toggleJob(resolvedPath: string, jobName: string, enabled: boolean) {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found at: ${resolvedPath}`);
  }
  const fileContent = fs.readFileSync(resolvedPath, 'utf8');
  const doc = yaml.parseDocument(fileContent);
  
  if (!doc.hasIn(['jobs', jobName])) {
    throw new Error(`Job '${jobName}' not found in configuration.`);
  }
  
  doc.setIn(['jobs', jobName, 'enabled'], enabled);
  fs.writeFileSync(resolvedPath, doc.toString(), 'utf8');
}

export function createDefaultConfig(targetPath: string) {
  const defaultConfig = `# ==========================================
# Telecron Configuration File
# ==========================================

telegram:
  bot_token: ""
  chat_id: ""

jobs:
  ping_example:
    name: "Heartbeat check"
    schedule: "every minute"
    tasks:
      - name: "Google Ping"
        command: "ping -c 4 8.8.8.8"
`;
  
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(targetPath, defaultConfig, 'utf8');
}

