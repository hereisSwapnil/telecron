import fs from 'fs';
import yaml from 'yaml';
import path from 'path';

export interface TaskConfig {
  name: string;
  command: string;
  cwd?: string;
  extract_log_regex?: string;
  auto_retry?: number;
  timeout?: string;  // e.g. "5 minutes", "30 seconds", "2 hours"
}

export interface JobConfig {
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

export function loadConfig(configPath: string): TelecronConfig {
  const unresolvedPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(unresolvedPath)) {
    throw new Error(`Configuration file not found at: ${unresolvedPath}`);
  }
  const fileContent = fs.readFileSync(unresolvedPath, 'utf8');
  try {
    return yaml.parse(fileContent) as TelecronConfig;
  } catch (err: any) {
    throw new Error(`Invalid YAML in ${unresolvedPath}: ${err.message}`);
  }
}

export function toggleJob(configPath: string, jobName: string, enabled: boolean) {
  const unresolvedPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(unresolvedPath)) {
    throw new Error(`Configuration file not found at: ${unresolvedPath}`);
  }
  const fileContent = fs.readFileSync(unresolvedPath, 'utf8');
  const doc = yaml.parseDocument(fileContent);
  
  if (!doc.hasIn(['jobs', jobName])) {
    throw new Error(`Job '${jobName}' not found in configuration.`);
  }
  
  doc.setIn(['jobs', jobName, 'enabled'], enabled);
  fs.writeFileSync(unresolvedPath, doc.toString(), 'utf8');
}

export function createDefaultConfig(targetPath: string) {
  const defaultConfig = `# ==========================================
# Telecron Configuration File
# ==========================================

telegram: {}
jobs: {}
`;
  fs.writeFileSync(targetPath, defaultConfig, 'utf8');
}
