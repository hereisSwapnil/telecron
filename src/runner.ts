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

export async function runJob(jobName: string, jobConfig: JobConfig, notifier: TelegramNotifier) {
  const startTime = Date.now();
  console.log(pc.cyan(`\n🚀 Starting job: ${pc.bold(jobName)}`));

  if (jobConfig.notify_start) {
    const timeStr = new Date().toISOString().replace('T', ' ').split('.')[0];
    await notifier.sendMessage(`🚀 <b>Job Started:</b> ${jobName}\nTime: ${timeStr} UTC`);
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
    
    const logFilePath = path.join(logDir, `${String(i + 1).padStart(2, '0')}_${taskName.replace(/\s+/g, '_')}.log`);
    
    try {
      const exitCode = await new Promise<number>((resolve, reject) => {
        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        
        const child = spawn(task.command, {
          shell: true,
          cwd: task.cwd ? path.resolve(process.cwd(), task.cwd) : process.cwd(),
          env: process.env,
        });

        child.stdout?.pipe(logStream);
        child.stderr?.pipe(logStream);
        
        child.stdout?.on('data', (data: Buffer) => process.stdout.write(pc.gray(data.toString())));
        child.stderr?.on('data', (data: Buffer) => process.stderr.write(pc.red(data.toString())));

        child.on('close', (code: number | null) => {
          logStream.end();
          resolve(code || 0);
        });

        child.on('error', (err: Error) => {
          logStream.end();
          reject(err);
        });
      });

      const taskDuration = formatDuration(Date.now() - taskStartTime);

      if (exitCode !== 0) {
        const errMsg = `Task failed with exit code ${exitCode}`;
        console.error(pc.red(`❌ ${errMsg}`));
        const alertMsg = `❌ <b>Task Failed:</b> ${taskName}\nExit code: ${exitCode}\nDuration: ${taskDuration}\nCheck log: <code>${logFilePath}</code>`;
        await notifier.sendMessage(alertMsg);
        return; // Abort
      }

      console.log(pc.green(`✅ Finished ${taskName} in ${taskDuration}`));
      
      let extractedInfo = "Completed successfully.";
      if (task.extract_log_regex) {
        try {
          const content = fs.readFileSync(logFilePath, 'utf8');
          const regex = new RegExp(task.extract_log_regex, 'g');
          let match;
          let lastMatch = null;
          while ((match = regex.exec(content)) !== null) {
            lastMatch = match[0];
          }
          if (lastMatch) {
            extractedInfo = lastMatch;
          }
        } catch (err: any) {
          console.error(pc.yellow(`⚠️ Failed to extract regex from log: ${err.message}`));
        }
      }

      pipelineSummary.push(`✅ ${taskName} (<i>${taskDuration}</i>):\n<code>${extractedInfo}</code>`);

    } catch (err: any) {
      const taskDuration = formatDuration(Date.now() - taskStartTime);
      console.error(pc.red(`💥 Fatal error in ${taskName}: ${err.message}`));
      const alertMsg = `❌ <b>Fatal Error:</b> ${taskName}\nDuration: ${taskDuration}\nException: ${err.message}`;
      await notifier.sendMessage(alertMsg);
      return; // Abort
    }
  }

  const totalDuration = formatDuration(Date.now() - startTime);
  console.log(pc.magenta(`\n🎉 Job success: ${jobName} (Total time: ${totalDuration})`));

  if (jobConfig.notify_end !== false) {
    const finalMsg = `🎉 <b>Job Success:</b> ${jobName}\n⏱ <b>Total Time:</b> ${totalDuration}\n\n` + pipelineSummary.join('\n\n');
    await notifier.sendMessage(finalMsg);
  }
}
