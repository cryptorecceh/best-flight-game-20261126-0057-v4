// Keyboard and pointer input. Held keys give steering / climb / throttle /
// NOS state; one-shot presses (start, restart, pause, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CLIMB = new Set(['ArrowUp', 'KeyW']);
const DESCEND = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const NOS = new Set(['KeyX', 'KeyN']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let left = false;
  let right = false;
  let climb = false;
  let descend = false;
  let throttleUp = false;
  let throttleDown = false;
  let nos = false;
  let actions = 0;
  /** -1 while the pointer is held on the left half, 1 on the right half. */
  let pointerSteer = 0;

  function onKeyDown(event) {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CLIMB.has(event.code)) climb = true;
    else if (DESCEND.has(event.code)) descend = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (NOS.has(event.code)) nos = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  }
  function onKeyUp(event) {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (CLIMB.has(event.code)) climb = false;
    else if (DESCEND.has(event.code)) descend = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (NOS.has(event.code)) nos = false;
  }
  function releaseAll() {
    left = right = climb = descend = false;
    throttleUp = throttleDown = nos = false;
    pointerSteer = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur.
  window.addEventListener('blur', releaseAll);
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    const rect = target.getBoundingClientRect();
    pointerSteer = event.clientX - rect.left < rect.width / 2 ? -1 : 1;
  });
  target.addEventListener('pointerup', () => { pointerSteer = 0; });
  target.addEventListener('pointerleave', () => { pointerSteer = 0; });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    steer() {
      const keys = (right ? 1 : 0) - (left ? 1 : 0);
      return keys !== 0 ? keys : pointerSteer;
    },
    /** -1 for descend, 1 for climb, 0 for neither or both. */
    climb() {
      return (climb ? 1 : 0) - (descend ? 1 : 0);
    },
    /** -1 for throttle down, 1 for throttle up, 0 for neither or both. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    nosHeld() {
      return nos;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
