import cron from 'node-cron';
import pc from 'picocolors';
import { TelecronConfig, JobConfig } from './config';
import { TelegramNotifier } from './notifier';
import { runJob } from './runner';
import { jobEvents, JobEvents } from './events';

function parseScheduleToCron(text: string): string {
  // If it already looks like a standard 5-part cron string, return it as-is
  if (/^([0-9*/,-]+)\s+([0-9*/,-]+)\s+([0-9*/,-]+)\s+([0-9*/,-]+)\s+([0-9*/,-]+)$/.test(text)) {
    return text;
  }

  const lower = text.trim().toLowerCase();
  
  if (lower === 'every hour') return '0 * * * *';
  if (lower === 'every minute') return '* * * * *';
  
  const minMatch = lower.match(/^every\s+(\d+)\s+minutes?$/);
  if (minMatch) return `*/${minMatch[1]} * * * *`;
  
  const hrMatch = lower.match(/^every\s+(\d+)\s+hours?$/);
  if (hrMatch) return `0 */${hrMatch[1]} * * *`;

  const dayMatch = lower.match(/^every\s+day\s+at\s+(\d{1,2}):(\d{2})$/);
  if (dayMatch) {
    const hours = parseInt(dayMatch[1], 10);
    const mins = parseInt(dayMatch[2], 10);
    return `${mins} ${hours} * * *`; // Minute Hour * * *
  }

  throw new Error(`Cannot parse schedule: '${text}'. Please use standard cron or supported English phrases (e.g. 'every day at 02:00', 'every hour', 'every 30 minutes').`);
}

function parseDelayToMs(text: string): number {
  const lower = text.trim().toLowerCase();
  const match = lower.match(/^(\d+)\s*(ms|millisecond|s|sec|second|m|min|minute|h|hour)s?$/);
  
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  if (unit.startsWith('ms') || unit.startsWith('milli')) return value;
  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60 * 1000;
  if (unit.startsWith('h')) return value * 60 * 60 * 1000;
  
  return 0;
}

export function startScheduler(config: TelecronConfig) {
  const telegram = config.telegram || { bot_token: '', chat_id: '' };
  const notifier = new TelegramNotifier(telegram.bot_token, telegram.chat_id);
  
  const jobs = Object.keys(config.jobs || {});
  if (jobs.length === 0) {
    console.log(pc.yellow('⚠️ No jobs found in configuration.'));
    return;
  }

  // Track which dependencies have been met for each job
  const dependencyStatus = new Map<string, Set<string>>();
  for (const name of jobs) {
    dependencyStatus.set(name, new Set<string>());
  }

  console.log(pc.green(`🚀 Starting telecron daemon. Listening for ${jobs.length} job(s)...`));
  
  for (const jobName of jobs) {
    const jobConfig = config.jobs[jobName];
    
    if (jobConfig.enabled === false) {
      console.log(pc.yellow(`[Skip] Job '${jobName}' is currently disabled.`));
      continue;
    }

    // --- SETUP CHRON TRIGGER ---
    if (jobConfig.schedule) {
      let cronExpression = '';
      try {
        cronExpression = parseScheduleToCron(jobConfig.schedule);
      } catch (err: any) {
        console.log(pc.red(`[Error] ${err.message}`));
      }

      if (cron.validate(cronExpression)) {
        const scheduleOpts: any = {};
        const tz = jobConfig.timezone || config.timezone;
        if (tz) scheduleOpts.timezone = tz;

        cron.schedule(cronExpression, async () => {
          try {
            await runJob(jobName, jobConfig, notifier, config.timezone);
          } catch (err: any) {
            console.error(pc.red(`Unhandled error in job scheduler for ${jobName}: ${err.message}`));
          }
        }, scheduleOpts);

        const tzLabel = tz ? ` (${tz})` : ' (System Time)';
        console.log(pc.cyan(`⏱ Scheduled [${pc.bold(jobName)}] runs at: ${cronExpression} (Rule: "${jobConfig.schedule}")${tzLabel}`));
      }
    }

    // --- SETUP DEPENDENCY TRIGGER ---
    if (jobConfig.depends_on) {
      const dependencies = Array.isArray(jobConfig.depends_on) 
        ? jobConfig.depends_on 
        : [jobConfig.depends_on];

      console.log(pc.magenta(`🔗 Job [${pc.bold(jobName)}] will trigger after: ${dependencies.join(', ')}`));

      jobEvents.on(JobEvents.SUCCESS, async (finishedJobName: string) => {
        if (dependencies.includes(finishedJobName)) {
          const met = dependencyStatus.get(jobName)!;
          met.add(finishedJobName);

          if (met.size === dependencies.length) {
            met.clear(); // Reset for next cycle
            
            const delayMs = jobConfig.delay ? parseDelayToMs(jobConfig.delay) : 0;
            if (delayMs > 0) {
              console.log(pc.gray(`[Chain] Dependency met for ${jobName}. Waiting ${jobConfig.delay}...`));
              await new Promise(r => setTimeout(r, delayMs));
            }

            console.log(pc.magenta(`[Chain] Triggering dependent job: ${pc.bold(jobName)}`));
            try {
              await runJob(jobName, jobConfig, notifier, config.timezone);
            } catch (err: any) {
              console.error(pc.red(`Unhandled error in chained job execution for ${jobName}: ${err.message}`));
            }
          } else {
             console.log(pc.gray(`[Chain] Partial dependency met for ${jobName} (${met.size}/${dependencies.length}).`));
          }
        }
      });
    }
  }
}
