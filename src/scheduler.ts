import cron from 'node-cron';
import pc from 'picocolors';
import { TelecronConfig } from './config';
import { TelegramNotifier } from './notifier';
import { runJob } from './runner';

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

export function startScheduler(config: TelecronConfig) {
  const telegram = config.telegram || { bot_token: '', chat_id: '' };
  const notifier = new TelegramNotifier(telegram.bot_token, telegram.chat_id);
  
  const jobs = Object.keys(config.jobs || {});
  if (jobs.length === 0) {
    console.log(pc.yellow('⚠️ No jobs found in configuration.'));
    return;
  }

  console.log(pc.green(`🚀 Starting telecron daemon. Listening for ${jobs.length} job(s)...`));
  
  for (const jobName of jobs) {
    const jobConfig = config.jobs[jobName];
    
    if (jobConfig.enabled === false) {
      console.log(pc.yellow(`[Skip] Job '${jobName}' is currently disabled.`));
      continue;
    }

    if (!jobConfig.schedule) {
      console.log(pc.yellow(`[Skip] Job '${jobName}' has no schedule defined.`));
      continue;
    }

    let cronExpression = '';
    try {
      cronExpression = parseScheduleToCron(jobConfig.schedule);
    } catch (err: any) {
      console.log(pc.red(`[Error] ${err.message}`));
      continue;
    }

    if (!cron.validate(cronExpression)) {
      console.log(pc.red(`[Error] Invalid translated cron expression for '${jobName}': ${cronExpression}`));
      continue;
    }

    const scheduleOpts: any = {};
    const tz = jobConfig.timezone || config.timezone;
    if (tz) {
        scheduleOpts.timezone = tz;
    }

    cron.schedule(cronExpression, async () => {
      try {
        await runJob(jobName, jobConfig, notifier);
      } catch (err: any) {
        console.error(pc.red(`Unhandled error in job scheduler for ${jobName}: ${err.message}`));
      }
    }, scheduleOpts);

    const tzLabel = tz ? ` (${tz})` : ' (System Time)';
    console.log(pc.cyan(`⏱ Scheduled [${pc.bold(jobName)}] runs at: ${cronExpression} (Rule: "${jobConfig.schedule}")${tzLabel}`));
  }
}
