import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { TelegramNotifier } from './notifier';
import { JobConfig, getGlobalLogDir } from './config';
import { jobEvents, JobEvents } from './events';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function parseTimeoutToMs(text: string): number {
  const match = text.trim().toLowerCase().match(/^(\d+)\s*(ms|millisecond|s|sec|second|m|min|minute|h|hour)s?$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith('ms') || unit.startsWith('milli')) return val;
  if (unit.startsWith('s')) return val * 1000;
  if (unit.startsWith('m')) return val * 60 * 1000;
  if (unit.startsWith('h')) return val * 60 * 60 * 1000;
  return 0;
}

export async function runJob(jobName: string, jobConfig: JobConfig, notifier: TelegramNotifier, globalTimezone?: string) {
  const displayName = jobConfig.name || jobName;
  const startTime = Date.now();
  console.log(pc.cyan(`\n🚀 Starting job: ${pc.bold(displayName)}`));
  const tz = jobConfig.timezone || globalTimezone;

  if (jobConfig.notify_start) {
    let timeStr = '';
    if (tz) {
      try {
        timeStr = new Intl.DateTimeFormat('en-US', { 
            timeZone: tz, 
            month: 'long', day: 'numeric', year: 'numeric', 
            hour: 'numeric', minute: '2-digit', hour12: true
        }).format(new Date()).replace(',', ' at');
        timeStr += ` (${tz})`;
      } catch (e) {
        timeStr = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
      }
    } else {
      timeStr = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
    }
    
    await notifier.sendMessage(`<b>Name:</b> ${displayName}\n<b>Status:</b> 🚀 Starting Pipeline\n<b>Date/Time:</b> ${timeStr}\n\n<i>by <a href="https://github.com/hereisSwapnil/telecron">telecron</a></i>`);
  }

  // Set up logs directory for this run (Centralized in Global-Only model)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.resolve(getGlobalLogDir(), jobName, timestamp);
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

          process.once('SIGINT', killChild);
          process.once('SIGTERM', killChild);

          let timeoutTimer: NodeJS.Timeout | null = null;
          if (task.timeout) {
            const ms = parseTimeoutToMs(task.timeout);
            if (ms > 0) {
              timeoutTimer = setTimeout(() => {
                console.log(pc.yellow(`\n⏱️ Task timeout reached (${task.timeout}). Killing...`));
                killChild();
              }, ms);
            }
          }

          const cleanup = () => {
            process.off('SIGINT', killChild);
            process.off('SIGTERM', killChild);
            if (timeoutTimer) clearTimeout(timeoutTimer);
          };

          child.stdout?.pipe(logStream);
          child.stderr?.pipe(logStream);
          
          if (process.stdout.isTTY) {
            child.stdout?.on('data', (data: Buffer) => process.stdout.write(pc.gray(data.toString())));
            child.stderr?.on('data', (data: Buffer) => process.stderr.write(pc.red(data.toString())));
          }

          child.on('close', (code: number | null) => {
            cleanup();
            logStream.end();
            resolve(code ?? 1);
          });

          child.on('error', (err: Error) => {
            cleanup();
            logStream.end();
            reject(err);
          });
        });
      } catch (err: any) {
        if (attempts >= maxAttempts) {
          const duration = formatDuration(Date.now() - taskStartTime);
          console.error(pc.red(`💥 Fatal error natively spawning ${taskName}: ${err.message}`));
          const alertMsg = `<b>Name:</b> ${displayName} (${taskName})\n<b>Status:</b> 💥 Fatal Spawn Error\n<b>Duration:</b> ${duration}\n<b>Exception:</b> ${err.message}\n\n<i>by <a href="https://github.com/hereisSwapnil/telecron">telecron</a></i>`;
          await notifier.sendMessage(alertMsg);
          jobEvents.emit(JobEvents.FAILURE, jobName);
          return; // Abort
        }
        exitCode = -1; // Force retry
      }
    }

    taskDuration = formatDuration(Date.now() - taskStartTime);

    if (exitCode !== 0) {
      const errMsg = `Task failed with exit code ${exitCode} after ${attempts} attempts`;
      console.error(pc.red(`❌ ${errMsg}`));
      const alertMsg = `<b>Name:</b> ${taskName}\n<b>Status:</b> 🛑 Task Failed (Exit ${exitCode}, Attempt ${attempts})\n<b>Duration:</b> ${taskDuration}\n<b>Check Log:</b> <code>${logFilePath}</code>\n\n<i>by <a href="https://github.com/hereisSwapnil/telecron">telecron</a></i>`;
      await notifier.sendMessage(alertMsg);
      jobEvents.emit(JobEvents.FAILURE, jobName);
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
          const MAX_EMBED_LEN = 2000;
          extractedInfo = lastMatch.length > MAX_EMBED_LEN ? lastMatch.slice(0, MAX_EMBED_LEN) + '\n…(truncated log)' : lastMatch;
        }
      } catch (err: any) {
        console.error(pc.yellow(`⚠️ Failed to extract regex from log: ${err.message}`));
      }
    }

    if (jobConfig.notify_end !== false && tasks.length > 1) {
      const taskMsg = `<b>Name:</b> ${taskName}\n<b>Status:</b> ▶️ Task Finished\n<b>Duration:</b> ${taskDuration}\n\n<code>${extractedInfo}</code>\n\n<i>by <a href="https://github.com/hereisSwapnil/telecron">telecron</a></i>`;
      await notifier.sendMessage(taskMsg);
    }

    pipelineSummary.push(`✅ ${taskName} (<i>${taskDuration}</i>):\n<code>${extractedInfo}</code>`);

  }

  const totalDuration = formatDuration(Date.now() - startTime);
  console.log(pc.magenta(`\n🎉 Job success: ${displayName} (Total time: ${totalDuration})`));

  if (jobConfig.notify_end !== false) {
    const summaryText = pipelineSummary.length > 0 
      ? `\n\n${pipelineSummary.map(s => {
          const splitIdx = s.indexOf(':\n');
          return splitIdx !== -1 ? s.substring(splitIdx + 2) : s;
        }).join('\n\n')}` 
      : '';
    const finalMsg = `<b>Name:</b> ${displayName}\n<b>Status:</b> ✅ Pipeline Success\n<b>Duration:</b> ${totalDuration}${summaryText}\n\n<i>by <a href="https://github.com/hereisSwapnil/telecron">telecron</a></i>`;
    await notifier.sendMessage(finalMsg);
  }

  // Emit success for chaining
  jobEvents.emit(JobEvents.SUCCESS, jobName);
}
