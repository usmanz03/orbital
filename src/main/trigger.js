// Watches global mouse input for "drag while holding <modifier>".
// Uses modifier flags on mouse events, so no keyboard monitoring is needed.
const { systemPreferences } = require('electron');

const EVENT_MOUSE_PRESSED = 7;
const EVENT_MOUSE_RELEASED = 8;
const EVENT_MOUSE_MOVED = 9;
const EVENT_MOUSE_DRAGGED = 10;
const DRAG_THRESHOLD = 12;

let hook = null;
let running = false;
let modifier = 'shift';
let handlers = { onDragStart() {}, onDragEnd() {} };
const state = { down: false, x: 0, y: 0, fired: false };

const held = (e) => (modifier === 'alt' ? e.altKey : modifier === 'ctrl' ? e.ctrlKey : e.shiftKey);

function onInput(e) {
  switch (e.type) {
    case EVENT_MOUSE_PRESSED:
      if (e.button === 1) Object.assign(state, { down: true, x: e.x, y: e.y, fired: false });
      break;
    case EVENT_MOUSE_MOVED:
    case EVENT_MOUSE_DRAGGED:
      if (state.down && !state.fired && held(e) && Math.hypot(e.x - state.x, e.y - state.y) > DRAG_THRESHOLD) {
        state.fired = true;
        handlers.onDragStart();
      }
      break;
    case EVENT_MOUSE_RELEASED:
      if (e.button === 1) {
        if (state.fired) handlers.onDragEnd();
        state.down = false;
        state.fired = false;
      }
      break;
    default:
  }
}

// macOS requires Accessibility permission for a global event tap.
const hasPermission = () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false);
const requestPermission = () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(true);

// Wayland blocks global input hooks entirely; X11 sessions work.
const supported = () => !(process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland');

function start(opts) {
  handlers = opts;
  modifier = opts.modifier || 'shift';
  if (running || !supported() || !hasPermission()) return running;
  try {
    hook = hook || require('uiohook-napi').uIOhook;
    hook.on('input', onInput);
    hook.start();
    running = true;
  } catch (err) {
    console.error('Global hook failed to start:', err);
  }
  return running;
}

function stop() {
  if (!running) return;
  hook.off('input', onInput);
  hook.stop();
  running = false;
}

module.exports = {
  start, stop, hasPermission, requestPermission, supported,
  isRunning: () => running,
  setModifier: (m) => { modifier = m; },
};
