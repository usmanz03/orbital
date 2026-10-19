const path = require('path');
const { EventEmitter } = require('events');
const { Notification, shell } = require('electron');
const { byId } = require('./catalog');

const events = new EventEmitter();
const history = [];
let queue = Promise.resolve();
let seq = 0;

function update(job, patch) {
  Object.assign(job, patch);
  events.emit('change', job);
}

function notify(job) {
  if (!Notification.isSupported()) return;
  const ok = job.status === 'done';
  const n = new Notification({
    title: ok ? `${job.label} — done` : `${job.label} failed`,
    body: ok ? job.outputs.map((o) => path.basename(o)).join(', ') : job.error,
    silent: ok,
  });
  if (ok) n.on('click', () => shell.showItemInFolder(job.outputs[0]));
  n.show();
}

// Jobs run one at a time: ffmpeg already uses every core.
function run(actionId, files, runner) {
  const action = byId.get(actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  const job = {
    id: ++seq,
    label: `${action.label}`,
    category: action.cat,
    files,
    status: 'queued',
    progress: 0,
    outputs: [],
    started: Date.now(),
  };
  history.unshift(job);
  history.length = Math.min(history.length, 50);
  events.emit('change', job);

  const tasks = action.mode === 'all' ? [files] : files.map((f) => f);
  const execute = runner || ((task, onProgress) => action.run(task, onProgress));
  queue = queue.then(async () => {
    update(job, { status: 'running' });
    try {
      for (let i = 0; i < tasks.length; i++) {
        const out = await execute(tasks[i], (p) => update(job, { progress: (i + p) / tasks.length }));
        job.outputs.push(out);
        update(job, { progress: (i + 1) / tasks.length });
      }
      update(job, { status: 'done', finished: Date.now() });
    } catch (err) {
      console.error(err);
      update(job, { status: 'error', error: err.message, finished: Date.now() });
    }
    notify(job);
  });
  return job;
}

module.exports = { run, events, history };
