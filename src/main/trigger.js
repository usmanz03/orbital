// Watches global mouse input for "drag while holding <modifier>".
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

// uiohook only learns modifier state from keyboard events, which macOS often withholds.
// Ask the OS directly instead; neither call needs extra permissions.
const nativeModifiers = (() => {
  try {
    const koffi = require('koffi');
    if (process.platform === 'darwin') {
      const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
      const flagsState = cg.func('uint64_t CGEventSourceFlagsState(int32_t)');
      const MASK = { shift: 0x20000, ctrl: 0x40000, alt: 0x80000 };
      return (m) => (Number(flagsState(0)) & MASK[m]) !== 0; // 0 = combined session state
    }
    if (process.platform === 'win32') {
      const getAsyncKeyState = koffi.load('user32.dll').func('int16_t __stdcall GetAsyncKeyState(int32_t)');
      const VK = { shift: 0x10, ctrl: 0x11, alt: 0x12 };
      return (m) => (getAsyncKeyState(VK[m]) & 0x8000) !== 0;
    }
  } catch (err) {
    console.warn('Native modifier lookup unavailable:', err.message);
  }
  return null;
})();

const held = (e) => (nativeModifiers && nativeModifiers(modifier))
  || (modifier === 'alt' ? e.altKey : modifier === 'ctrl' ? e.ctrlKey : e.shiftKey);

const debug = process.env.ORBITAL_DEBUG ? (...a) => console.log('[trigger]', ...a) : () => {};

function onInput(e) {
  switch (e.type) {
    case EVENT_MOUSE_PRESSED:
      debug('press', { button: e.button, held: held(e) });
      if (e.button === 1) Object.assign(state, { down: true, x: e.x, y: e.y, fired: false });
      break;
    case EVENT_MOUSE_MOVED:
    case EVENT_MOUSE_DRAGGED:
      if (state.down && !state.fired && held(e) && Math.hypot(e.x - state.x, e.y - state.y) > DRAG_THRESHOLD) {
        state.fired = true;
        debug('drag with modifier -> show picker');
        handlers.onDragStart();
      }
      break;
    case EVENT_MOUSE_RELEASED:
      debug('release', { button: e.button, fired: state.fired, held: held(e) });
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
    debug('hook started; native modifiers:', !!nativeModifiers);
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
