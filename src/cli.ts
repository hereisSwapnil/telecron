#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { loadConfig, createDefaultConfig } from './config';
import { startScheduler } from './scheduler';
import { runJob } from './runner';
import { TelegramNotifier } from './notifier';

const program = new Command();
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

program
  .name('telecron')
  .description(packageJson.description)
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize a default telecron.yml configuration file')
  .action(() => {
    const targetPath = path.resolve(process.cwd(), 'telecron.yml');
    if (fs.existsSync(targetPath)) {
      console.log(pc.yellow(`⚠️ Configuration file already exists at ${targetPath}`));
      return;
    }
    createDefaultConfig(targetPath);
    console.log(pc.green(`✅ Created default configuration at ${targetPath}`));
    console.log(pc.cyan(`Next steps: Edit the file, configure your Telegram credentials, and define your jobs.`));
  });

program
  .command('start')
  .description('Start the telecron daemon')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action((options) => {
    try {
      const config = loadConfig(options.config);
      startScheduler(config);
    } catch (err: any) {
      console.error(pc.red(`❌ Setup failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('run <jobName>')
  .description('Run a specific job once immediately (ignores cron schedule)')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action(async (jobName, options) => {
    try {
      const config = loadConfig(options.config);
      const jobDef = config.jobs[jobName];
      if (!jobDef) {
        console.error(pc.red(`❌ Job '${jobName}' not found in configuration.`));
        process.exit(1);
      }
      const telegram = config.telegram || { bot_token: '', chat_id: '' };
      const notifier = new TelegramNotifier(telegram.bot_token, telegram.chat_id);
      
      await runJob(jobName, jobDef, notifier);
    } catch (err: any) {
      console.error(pc.red(`❌ Execution failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
