#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { 
  loadConfig, 
  createDefaultConfig, 
  toggleJob, 
  resolveConfigPath, 
  getGlobalConfigPath, 
  getGlobalLogDir 
} from './config';
import { startScheduler } from './scheduler';
import { runJob } from './runner';
import { TelegramNotifier } from './notifier';
import { startInteractiveConfig } from './configure';

const program = new Command();
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// Helper to get global PID and Daemon log paths
const getGlobalDaemonInfo = () => {
  const dir = path.resolve(os.homedir(), '.telecron');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return {
    pidFile: path.join(dir, '.telecron.pid'),
    logFile: path.join(dir, 'daemon.log')
  };
};

program
  .name('telecron')
  .description(packageJson.description)
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize the master telecron.yml configuration file at ~/.telecron.yml')
  .action(() => {
    const targetPath = getGlobalConfigPath();
    
    if (fs.existsSync(targetPath)) {
      console.log(pc.yellow(`⚠️ Global configuration already exists at ${pc.bold(targetPath)}`));
      return;
    }
    
    createDefaultConfig(targetPath);
    console.log(pc.green(`✅ Created GLOBAL configuration at ${pc.bold(targetPath)}`));
    console.log(pc.cyan(`Next steps: Edit the file, configure your Telegram credentials, and define your jobs.`));
  });

program
  .command('configure')
  .description('Interactively configure jobs and settings via a visual terminal UI')
  .option('-c, --config <path>', 'path to config file (defaults to ~/.telecron.yml)')
  .action(async (options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      await startInteractiveConfig(configPath);
    } catch (err: any) {
      console.error(pc.red(`❌ Configuration failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all configured jobs and their tasks')
  .option('-c, --config <path>', 'path to config file (defaults to ~/.telecron.yml)')
  .action((options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      const config = loadConfig(configPath);
      const jobs = Object.keys(config.jobs || {});
      
      console.log(pc.cyan(`\n📋 Loaded ${jobs.length} Job(s) from ${pc.bold(configPath)}:\n`));
      
      if (jobs.length === 0) {
        console.log(pc.yellow('⚠️ No jobs found in configuration.'));
        return;
      }
      
      for (const jobName of jobs) {
        const jobDef = config.jobs[jobName];
        const status = jobDef.enabled === false ? pc.red(' (DISABLED)') : '';
        const tzLabel = jobDef.timezone || config.timezone ? pc.magenta(` (${jobDef.timezone || config.timezone})`) : '';
        console.log(pc.bold(pc.green(`🔹 Job: ${jobName}`)) + status);
        console.log(pc.gray(`   Schedule  : `) + (jobDef.schedule || 'None (Manual Only)') + tzLabel);
        console.log(pc.gray(`   Tasks     :`));
        
        const tasks = jobDef.tasks || [];
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          console.log(`     ${i + 1}. ${t.name || 'Unnamed Task'} ${pc.gray(`[${t.command}]`)}`);
        }
        console.log('');
      }
    } catch (err: any) {
      console.error(pc.red(`❌ Setup failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('disable <jobName>')
  .description('Disable a scheduled cron job permanently')
  .option('-c, --config <path>', 'path to config file')
  .action((jobName, options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      toggleJob(configPath, jobName, false);
      console.log(pc.yellow(`⏸ Disabled job '${jobName}' in ${configPath}.`));
    } catch(err: any) {
      console.error(pc.red(`❌ Failed to disable: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('enable <jobName>')
  .description('Re-enable a scheduled cron job')
  .option('-c, --config <path>', 'path to config file')
  .action((jobName, options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      toggleJob(configPath, jobName, true);
      console.log(pc.green(`▶️ Enabled job '${jobName}' in ${configPath}.`));
    } catch(err: any) {
      console.error(pc.red(`❌ Failed to enable: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the telecron daemon')
  .option('-c, --config <path>', 'path to config file')
  .option('-f, --foreground', 'Run in foreground (do not detach into background)')
  .action((options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      const { pidFile, logFile } = getGlobalDaemonInfo();

      if (!options.foreground) {
         const logStream = fs.openSync(logFile, 'a');
         const child = spawn(process.execPath, [__filename, 'start', '-c', configPath, '--foreground'], {
             detached: true,
             stdio: ['ignore', logStream, logStream]
         });
         
         child.unref(); 
         fs.writeFileSync(pidFile, String(child.pid), 'utf8');
         
         console.log(pc.green(`🚀 Telecron daemon launched from ${pc.bold(configPath)} (PID: ${child.pid}).`));
         console.log(pc.gray(`Output redirected to ${logFile}`));
         process.exit(0);
      }
      
      const config = loadConfig(configPath);
      startScheduler(config);
    } catch (err: any) {
      console.error(pc.red(`❌ Setup failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the background telecron daemon')
  .action(() => {
     const { pidFile } = getGlobalDaemonInfo();
     if (!fs.existsSync(pidFile)) {
         console.log(pc.yellow('⚠️ No pid file found. Is the background daemon definitely running?'));
         return;
     }
     
     const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
     try {
         process.kill(-pid); 
         console.log(pc.green(`🛑 Successfully terminated telecron daemon and all active tasks (Group PID: ${pid}).`));
     } catch (e: any) {
         if (e.code === 'ESRCH') {
             console.log(pc.yellow(`⚠️ PID ${pid} no longer exists. The daemon must have already stopped.`));
         } else {
             console.log(pc.red(`❌ Could not kill PID ${pid}: ${e.message}`));
         }
     }
     
     try { fs.unlinkSync(pidFile); } catch(e) {}
  });

program
  .command('restart')
  .description('Restart the background telecron daemon')
  .option('-c, --config <path>', 'path to config file')
  .action((options) => {
     const configPath = resolveConfigPath(options.config);
     const { pidFile, logFile } = getGlobalDaemonInfo();
     
     if (fs.existsSync(pidFile)) {
         const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
         try {
             process.kill(oldPid);
             console.log(pc.yellow(`🛑 Terminated existing daemon (PID: ${oldPid}).`));
         } catch (e: any) {}
         try { fs.unlinkSync(pidFile); } catch(e) {}
     }

     const logStream = fs.openSync(logFile, 'a');
     const child = spawn(process.execPath, [__filename, 'start', '-c', configPath, '--foreground'], {
         detached: true,
         stdio: ['ignore', logStream, logStream]
     });
     
     child.unref(); 
     fs.writeFileSync(pidFile, String(child.pid), 'utf8');
     
     console.log(pc.green(`🔄 Telecron daemon rebooted from ${pc.bold(configPath)} (New PID: ${child.pid}).`));
     process.exit(0);
  });

program
  .command('clean')
  .description('Wipe old sequential logs to free up disk space')
  .option('-d, --days <number>', 'Amount of days to retain logs', '7')
  .action((options) => {
     try {
         const daysToKeep = parseInt(options.days, 10);
         const logsDir = getGlobalLogDir();
         
         const cutoffMs = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
         let deletedJobs = 0;
         
         const jobFolders = fs.readdirSync(logsDir);
         for (const job of jobFolders) {
            const jobPath = path.join(logsDir, job);
            if (!fs.statSync(jobPath).isDirectory()) continue;
            
            const runs = fs.readdirSync(jobPath);
            for (const run of runs) {
               const runPath = path.join(jobPath, run);
               if (!fs.statSync(runPath).isDirectory()) continue;
               
               const stats = fs.statSync(runPath);
               if (stats.mtimeMs < cutoffMs) {
                   fs.rmSync(runPath, { recursive: true, force: true });
                   deletedJobs++;
               }
            }
         }
         
         console.log(pc.green(`✅ Disk cleanup complete! Terminated ${deletedJobs} old execution logs from ${logsDir}.`));
     } catch(err: any) {
         console.error(pc.red(`❌ Failed to sweep old logs: ${err.message}`));
     }
  });

program
  .command('run <jobName>')
  .description('Run a specific job once immediately (ignores cron schedule)')
  .option('-c, --config <path>', 'path to config file')
  .action(async (jobName, options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      const config = loadConfig(configPath);
      const jobDef = config.jobs[jobName];
      if (!jobDef) {
        console.error(pc.red(`❌ Job '${jobName}' not found in configuration.`));
        process.exit(1);
      }
      const telegram = config.telegram || { bot_token: '', chat_id: '' };
      const notifier = new TelegramNotifier(telegram.bot_token, telegram.chat_id);
      
      await runJob(jobName, jobDef, notifier, config.timezone);
    } catch (err: any) {
      console.error(pc.red(`❌ Execution failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);


