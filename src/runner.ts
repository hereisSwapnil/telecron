import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { TelegramNotifier } from './notifier';
import { JobConfig } from './config';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

export async function runJob(jobName: string, jobConfig: JobConfig, notifier: TelegramNotifier, globalTimezone?: string) {
  const startTime = Date.now();
  console.log(pc.cyan(`\n🚀 Starting job: ${pc.bold(jobName)}`));
  const tz = jobConfig.timezone || globalTimezone;

  if (jobConfig.notify_start) {
    let timeStr = '';
    if (tz) {
      try {
        timeStr = new Intl.DateTimeFormat('en-US', { 
            timeZone: tz, 
            month: 'long', day: 'numeric', year: 'numeric', 
            hour: 'numeric', minute: '2-digit', hour12: true
        }).format(new Date());
        timeStr += ` (${tz})`;
      } catch (e) {
        timeStr = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
      }
    } else {
      timeStr = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
    }
    
    await notifier.sendMessage(`🚀 <b>Job Started:</b> ${jobName}\nTime: ${timeStr}`);
  }

  // Set up logs directory for this run
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.resolve(process.cwd(), 'logs', jobName, timestamp);
  fs.mkdirSync(logDir, { recursive: true });
  console.log(pc.gray(`📁 Logs routing to: ${logDir}`));

  const tasks = jobConfig.tasks || [];
  const pipelineSummary: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskName = task.name || `Task ${i + 1}`;
    const taskStartTime = Date.now();
    
    console.log(pc.blue(`\n▶ [${i + 1}/${tasks.length}] Running: ${pc.bold(taskName)}`));
    console.log(pc.gray(`  $ ${task.command}`));
    
    let exitCode = -1;
    let attempts = 0;
    let maxAttempts = (task.auto_retry || 0) + 1;
    let taskDuration = "0s";
    let logFilePath = "";

    while (attempts < maxAttempts && exitCode !== 0) {
      attempts++;
      logFilePath = path.join(logDir, `${String(i + 1).padStart(2, '0')}_${taskName.replace(/\s+/g, '_')}_try${attempts}.log`);
      
      if (attempts > 1) {
          console.log(pc.yellow(`⚠️ Retry attempt ${attempts}/${maxAttempts} for ${taskName}...`));
      }

      try {
        exitCode = await new Promise<number>((resolve, reject) => {
          const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
          
            const child = spawn(task.command, {
            shell: true,
            cwd: task.cwd ? path.resolve(process.cwd(), task.cwd) : process.cwd(),
            env: process.env,
            // Detach children with their own process group so we can kill the whole tree
            detached: true,
          });

          const killChild = () => {
             if (child.pid) {
               try {
                 process.kill(-child.pid, 'SIGTERM');
               } catch (e) {}
             }
          };

          process.on('SIGINT', killChild);
          process.on('SIGTERM', killChild);

          child.stdout?.pipe(logStream);
          child.stderr?.pipe(logStream);
          
          if (process.stdout.isTTY) {
            child.stdout?.on('data', (data: Buffer) => process.stdout.write(pc.gray(data.toString())));
            child.stderr?.on('data', (data: Buffer) => process.stderr.write(pc.red(data.toString())));
          }

          child.on('close', (code: number | null) => {
            process.off('SIGINT', killChild);
            process.off('SIGTERM', killChild);
            logStream.end();
            resolve(code || 0);
          });

          child.on('error', (err: Error) => {
            process.off('SIGINT', killChild);
            process.off('SIGTERM', killChild);
            logStream.end();
            reject(err);
          });
        });
      } catch (err: any) {
        if (attempts >= maxAttempts) {
          const duration = formatDuration(Date.now() - taskStartTime);
          console.error(pc.red(`💥 Fatal error natively spawning ${taskName}: ${err.message}`));
          const alertMsg = `❌ <b>Fatal Spawn Error:</b> ${taskName}\nDuration: ${duration}\nException: ${err.message}`;
          await notifier.sendMessage(alertMsg);
          return; // Abort
        }
        exitCode = -1; // Force retry
      }
    }

    taskDuration = formatDuration(Date.now() - taskStartTime);

    if (exitCode !== 0) {
      const errMsg = `Task failed with exit code ${exitCode} after ${attempts} attempts`;
      console.error(pc.red(`❌ ${errMsg}`));
      const alertMsg = `❌ <b>Task Failed:</b> ${taskName}\nExit code: ${exitCode}\nFinal Attempt: ${attempts}\nDuration: ${taskDuration}\nCheck log: <code>${logFilePath}</code>`;
      await notifier.sendMessage(alertMsg);
      return; // Abort
    }

    console.log(pc.green(`✅ Finished ${taskName} in ${taskDuration}`));
    
    let extractedInfo = "Completed successfully.";
    if (task.extract_log_regex) {
      try {
        const rawContent = fs.readFileSync(logFilePath, 'utf8');
        const content = rawContent.replace(/\x1b\[[0-9;]*m/g, ''); 
        
        const regex = new RegExp(task.extract_log_regex, 'g');
        let match;
        let lastMatch = null;
        while ((match = regex.exec(content)) !== null) {
          lastMatch = match[1] ? match[1] : match[0];
        }
        if (lastMatch) {
          extractedInfo = lastMatch;
        }
      } catch (err: any) {
        console.error(pc.yellow(`⚠️ Failed to extract regex from log: ${err.message}`));
      }
    }

    // --- NEW: Per-task notification ---
    if (jobConfig.notify_end !== false && tasks.length > 1) {
      const taskMsg = `▶️ <b>Task Finished:</b> ${taskName}\n⏱ <b>Duration:</b> ${taskDuration}\n\n<code>${extractedInfo}</code>`;
      await notifier.sendMessage(taskMsg);
    }

    pipelineSummary.push(`✅ ${taskName} (<i>${taskDuration}</i>):\n<code>${extractedInfo}</code>`);

  }

  const totalDuration = formatDuration(Date.now() - startTime);
  console.log(pc.magenta(`\n🎉 Job success: ${jobName} (Total time: ${totalDuration})`));

  if (jobConfig.notify_end !== false) {
    const finalMsg = `🎊 <b>Pipeline Complete:</b> ${jobName}\n⏳ <b>Total Duration:</b> ${totalDuration}`;
    await notifier.sendMessage(finalMsg);
  }
}
