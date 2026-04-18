#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { loadConfig, createDefaultConfig, toggleJob } from './config';
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
  .command('list')
  .description('List all configured jobs and their tasks')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action((options) => {
    try {
      const config = loadConfig(options.config);
      const jobs = Object.keys(config.jobs || {});
      if (jobs.length === 0) {
        console.log(pc.yellow('⚠️ No jobs found in configuration.'));
        return;
      }
      
      console.log(pc.cyan(`\n📋 Loaded ${jobs.length} Job(s) from ${options.config}:\n`));
      
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
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action((jobName, options) => {
    try {
      toggleJob(options.config, jobName, false);
      console.log(pc.yellow(`⏸ Disabled job '${jobName}'. It will not run automatically until re-enabled.`));
    } catch(err: any) {
      console.error(pc.red(`❌ Failed to disable: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('enable <jobName>')
  .description('Re-enable a scheduled cron job')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action((jobName, options) => {
    try {
      toggleJob(options.config, jobName, true);
      console.log(pc.green(`▶️ Enabled job '${jobName}'. It will now run on schedule.`));
    } catch(err: any) {
      console.error(pc.red(`❌ Failed to enable: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the telecron daemon')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .option('-f, --foreground', 'Run in foreground (do not detach into background)')
  .action((options) => {
    try {
      if (!options.foreground) {
         const logStream = fs.openSync(path.resolve(process.cwd(), 'telecron-daemon.log'), 'a');
         const child = spawn(process.execPath, [__filename, 'start', '-c', options.config, '--foreground'], {
             detached: true,
             stdio: ['ignore', logStream, logStream]
         });
         
         child.unref(); // Let Node.js exit independently of the child
         fs.writeFileSync(path.resolve(process.cwd(), '.telecron.pid'), String(child.pid), 'utf8');
         
         console.log(pc.green(`🚀 Telecron daemon launched permanently in the background (PID: ${child.pid}).`));
         console.log(pc.gray(`Output redirected to ./telecron-daemon.log`));
         console.log(pc.cyan(`Next steps: You can safely close this terminal. Run 'npx telecron stop' anytime to kill it.`));
         process.exit(0);
      }
      
      const config = loadConfig(options.config);
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
     const pidFile = path.resolve(process.cwd(), '.telecron.pid');
     if (!fs.existsSync(pidFile)) {
         console.log(pc.yellow('⚠️ No .telecron.pid file found. Is the background daemon definitely running?'));
         return;
     }
     
     const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
     try {
         // Use -pid to kill the entire process group (daemon + all its tasks)
         process.kill(-pid); 
         console.log(pc.green(`🛑 Successfully terminated telecron daemon and all active tasks (Group PID: ${pid}).`));
     } catch (e: any) {
         if (e.code === 'ESRCH') {
             console.log(pc.yellow(`⚠️ PID ${pid} no longer exists. The daemon must have already stopped.`));
         } else {
             console.log(pc.red(`❌ Could not kill PID ${pid}: ${e.message}`));
         }
     }
     
     // Clean up pid
     fs.unlinkSync(pidFile);
  });

program
  .command('restart')
  .description('Restart the background telecron daemon (Reloads configuration)')
  .option('-c, --config <path>', 'path to config file', 'telecron.yml')
  .action((options) => {
     const pidFile = path.resolve(process.cwd(), '.telecron.pid');
     
     // 1. Terminate old process
     if (fs.existsSync(pidFile)) {
         const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
         try {
             process.kill(oldPid);
             console.log(pc.yellow(`🛑 Terminated existing daemon (PID: ${oldPid}).`));
         } catch (e: any) {
             // Ignore ESRCH, process already dead
         }
         try { fs.unlinkSync(pidFile); } catch(e) {}
     }

     // 2. Launch new detached process
     const logStream = fs.openSync(path.resolve(process.cwd(), 'telecron-daemon.log'), 'a');
     const child = spawn(process.execPath, [__filename, 'start', '-c', options.config, '--foreground'], {
         detached: true,
         stdio: ['ignore', logStream, logStream]
     });
     
     child.unref(); 
     fs.writeFileSync(pidFile, String(child.pid), 'utf8');
     
     console.log(pc.green(`🔄 Telecron daemon immediately rebooted in the background (New PID: ${child.pid}).`));
     console.log(pc.cyan(`Next steps: You can safely close this terminal.`));
     process.exit(0);
  });

program
  .command('clean')
  .description('Wipe old sequential logs to free up disk space')
  .option('-d, --days <number>', 'Amount of days to retain logs', '7')
  .action((options) => {
     try {
         const daysToKeep = parseInt(options.days, 10);
         const logsDir = path.resolve(process.cwd(), 'logs');
         
         if (!fs.existsSync(logsDir)) {
             console.log(pc.yellow(`⚠️ Log directory (${logsDir}) does not exist yet.`));
             return;
         }

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
         
         console.log(pc.green(`✅ Disk cleanup complete! Terminated ${deletedJobs} old execution logs.`));
     } catch(err: any) {
         console.error(pc.red(`❌ Failed to sweep old logs: ${err.message}`));
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
      
      await runJob(jobName, jobDef, notifier, config.timezone);
    } catch (err: any) {
      console.error(pc.red(`❌ Execution failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
