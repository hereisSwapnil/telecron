import prompts from 'prompts';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import pc from 'picocolors';
import { TelecronConfig, JobConfig, TaskConfig, createDefaultConfig } from './config';

export async function startInteractiveConfig(configName: string) {
  const unresolvedPath = path.resolve(process.cwd(), configName);
  
  if (!fs.existsSync(unresolvedPath)) {
      console.log(pc.yellow(`⚠️ Configuration file not found at: ${unresolvedPath}`));
      const { create } = await prompts({
          type: 'confirm',
          name: 'create',
          message: 'Would you like to initialize an empty one now?',
          initial: true
      });
      if (!create) {
          console.log(pc.red('Aborting configuration.'));
          return;
      }
      createDefaultConfig(unresolvedPath);
  }

  // Load raw YAML and parse it
  let fileContent = fs.readFileSync(unresolvedPath, 'utf8');
  let config: TelecronConfig;
  try {
      config = yaml.parse(fileContent) || { telegram: {}, jobs: {} };
  } catch (err: any) {
      console.error(pc.red(`❌ Invalid YAML: ${err.message}`));
      return;
  }
  
  if (!config.telegram) config.telegram = { bot_token: '', chat_id: '' };
  if (!config.jobs) config.jobs = {};

  let modified = false;

  while (true) {
      console.log();
      const { action } = await prompts({
          type: 'select',
          name: 'action',
          message: pc.cyan(pc.bold('Telecron Interactive Configuration')),
          choices: [
              { title: '📝 Telegram Setup', value: 'telegram' },
              { title: '💼 Manage Jobs', value: 'jobs' },
              { title: '💾 Save & Exit', value: 'save' },
              { title: '❌ Exit Without Saving', value: 'exit' }
          ]
      });

      if (!action || action === 'exit') {
          console.log(pc.yellow('Exiting without saving.'));
          return;
      }

      if (action === 'save') {
          break;
      }

      if (action === 'telegram') {
          console.log(pc.gray('\\n--- Telegram Configuration ---'));
          const tg = await prompts([
              {
                  type: 'text',
                  name: 'bot_token',
                  message: 'Bot Token:',
                  initial: config.telegram.bot_token || ''
              },
              {
                  type: 'text',
                  name: 'chat_id',
                  message: 'Chat ID:',
                  initial: config.telegram.chat_id || ''
              }
          ]);
          if (tg.bot_token !== undefined) {
              config.telegram.bot_token = tg.bot_token;
              config.telegram.chat_id = tg.chat_id;
              modified = true;
              console.log(pc.green('✅ Telegram settings updated.'));
          }
      }

      if (action === 'jobs') {
          await manageJobs(config);
          modified = true;
      }
  }

  // Save the modified config back to file
  if (modified) {
      const newYaml = yaml.stringify(config);
      fs.writeFileSync(unresolvedPath, newYaml, 'utf8');
      console.log(pc.green(`\\n🎉 Configuration successfully saved to ${unresolvedPath}`));
      console.log(pc.gray(`Note: Any previously hand-written YAML comments have been overwritten.`));
  } else {
      console.log(pc.gray('\\nNo changes made.'));
  }
}

async function manageJobs(config: TelecronConfig) {
  while (true) {
      const jobKeys = Object.keys(config.jobs);
      
      const choices = jobKeys.map(k => {
          const isEnabled = config.jobs[k].enabled !== false;
          return { title: `${isEnabled ? '🟢' : '🔴'} ${k}`, value: k };
      });
      choices.push({ title: '➕ Add New Job', value: '__new__' });
      choices.push({ title: '⬅️ Back to Main Menu', value: '__back__' });

      console.log();
      const { jobAction } = await prompts({
          type: 'select',
          name: 'jobAction',
          message: 'Select a job to configure:',
          choices
      });

      if (!jobAction || jobAction === '__back__') return;

      if (jobAction === '__new__') {
          const { newJobName } = await prompts({
              type: 'text',
              name: 'newJobName',
              message: 'Enter a name for the new job (e.g. database_backup):',
              validate: text => !text ? 'Name required' : (config.jobs[text] ? 'Name already exists' : true)
          });
          
          if (newJobName) {
              config.jobs[newJobName] = { 
                  enabled: true, 
                  notify_start: true, 
                  notify_end: true, 
                  tasks: [] 
              };
              await editJob(config.jobs[newJobName], newJobName);
          }
      } else {
          await editJob(config.jobs[jobAction], jobAction);
      }
  }
}

async function editJob(job: JobConfig, jobName: string) {
  while (true) {
      console.log();
      const { action } = await prompts({
          type: 'select',
          name: 'action',
          message: `Editing Job: ${pc.bold(jobName)}`,
          choices: [
              { title: `Toggle Status (${job.enabled === false ? 'Disabled' : 'Enabled'})`, value: 'toggle' },
              { title: `Edit Schedule (Current: ${job.schedule || 'None'})`, value: 'schedule' },
              { title: `Edit Timezone (Current: ${job.timezone || 'System Default'})`, value: 'timezone' },
              { title: `Manage Tasks (${job.tasks.length} tasks)`, value: 'tasks' },
              { title: '⬅️ Go Back', value: 'back' }
          ]
      });

      if (!action || action === 'back') return;

      if (action === 'toggle') {
          job.enabled = job.enabled === false ? true : false;
      }
      
      if (action === 'schedule') {
          const { schedule } = await prompts({
              type: 'text',
              name: 'schedule',
              message: 'Enter new schedule (e.g. "every day at 02:00", or leave blank for disabled):',
              initial: job.schedule || ''
          });
          if (schedule !== undefined) {
              if (schedule.trim() === '') delete job.schedule;
              else job.schedule = schedule;
          }
      }

      if (action === 'timezone') {
          const { tz } = await prompts({
              type: 'text',
              name: 'tz',
              message: 'Enter timezone (e.g. "UTC", "Asia/Kolkata", or leave blank):',
              initial: job.timezone || ''
          });
          if (tz !== undefined) {
              if (tz.trim() === '') delete job.timezone;
              else job.timezone = tz;
          }
      }

      if (action === 'tasks') {
          await manageTasks(job);
      }
  }
}

async function manageTasks(job: JobConfig) {
  if (!job.tasks) job.tasks = [];

  while (true) {
      const choices = job.tasks.map((t, idx) => ({
          title: `${idx + 1}. ${t.name || 'Unnamed'} [${t.command}]`,
          value: idx
      }));
      choices.push({ title: '➕ Add New Task', value: -1 });
      choices.push({ title: '⬅️ Go Back', value: -2 });

      console.log();
      const { taskIdx } = await prompts({
          type: 'select',
          name: 'taskIdx',
          message: 'Manage Tasks:',
          choices
      });

      if (taskIdx === undefined || taskIdx === -2) return;

      if (taskIdx === -1) {
          // Add new
          const tName = await prompts({ type: 'text', name: 'val', message: 'Task Name:' });
          const tCmd = await prompts({ type: 'text', name: 'val', message: 'Shell Command:' });
          const tCwd = await prompts({ type: 'text', name: 'val', message: 'Working Directory (cwd):', initial: '.' });
          
          if (tName.val && tCmd.val) {
              job.tasks.push({
                  name: tName.val,
                  command: tCmd.val,
                  cwd: tCwd.val
              });
          }
      } else {
          // Edit existing
          const t = job.tasks[taskIdx];
          console.log(pc.gray(`\\n--- Editing Task: ${t.name} ---`));
          
          const editTask = await prompts([
              { type: 'text', name: 'name', message: 'Task Name:', initial: t.name },
              { type: 'text', name: 'command', message: 'Command:', initial: t.command },
              { type: 'text', name: 'cwd', message: 'Working Directory:', initial: t.cwd || '.' },
              { type: 'text', name: 'extract_log_regex', message: 'Extract Regex (optional):', initial: t.extract_log_regex || '' },
              { type: 'number', name: 'auto_retry', message: 'Auto Retries:', initial: t.auto_retry || 0 },
              { type: 'text', name: 'timeout', message: 'Timeout (optional, e.g. "5m"):', initial: t.timeout || '' }
          ]);

          if (editTask.name) {
              t.name = editTask.name;
              t.command = editTask.command;
              t.cwd = editTask.cwd;
              if (editTask.extract_log_regex) t.extract_log_regex = editTask.extract_log_regex; else delete t.extract_log_regex;
              if (editTask.auto_retry > 0) t.auto_retry = editTask.auto_retry; else delete t.auto_retry;
              if (editTask.timeout) t.timeout = editTask.timeout; else delete t.timeout;
          }
      }
  }
}
