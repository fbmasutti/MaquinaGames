// Teclado + botões de toque: flippers e lançador — Toca o Sino.

const GameInput = (function () {
  let hooks = {
    onFlipper: () => {},
    onChargeStart: () => {},
    onChargeRelease: () => {},
    onInteract: () => {},
  };
  let charging = false;

  const KEY_FLIPPER = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  function setFlipperVisual(side, active) {
    const el = document.getElementById(`btn-flipper-${side}`);
    if (el) el.classList.toggle('active', active);
  }

  function startCharge() {
    if (charging) return;
    charging = true;
    hooks.onChargeStart();
    const el = document.getElementById('btn-launch');
    if (el) el.classList.add('active');
  }

  function releaseCharge() {
    if (!charging) return;
    charging = false;
    hooks.onChargeRelease();
    const el = document.getElementById('btn-launch');
    if (el) el.classList.remove('active');
  }

  function onKeyDown(e) {
    if (e.key === ' ') {
      e.preventDefault();
      hooks.onInteract();
      startCharge();
      return;
    }
    const side = KEY_FLIPPER[e.key];
    if (!side) return;
    e.preventDefault();
    hooks.onInteract();
    hooks.onFlipper(side, true);
    setFlipperVisual(side, true);
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
      releaseCharge();
      return;
    }
    const side = KEY_FLIPPER[e.key];
    if (!side) return;
    hooks.onFlipper(side, false);
    setFlipperVisual(side, false);
  }

  function bindFlipperButton(el, side) {
    const press = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      hooks.onInteract();
      hooks.onFlipper(side, true);
      el.classList.add('active');
    };
    const release = () => {
      hooks.onFlipper(side, false);
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function bindLaunchButton(el) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      hooks.onInteract();
      startCharge();
    });
    el.addEventListener('pointerup', releaseCharge);
    el.addEventListener('pointercancel', releaseCharge);
    el.addEventListener('pointerleave', releaseCharge);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function attach(options) {
    hooks = { ...hooks, ...options };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const left = document.getElementById('btn-flipper-left');
    const right = document.getElementById('btn-flipper-right');
    const launch = document.getElementById('btn-launch');
    if (left) bindFlipperButton(left, 'left');
    if (right) bindFlipperButton(right, 'right');
    if (launch) bindLaunchButton(launch);
  }

  function reset() {
    charging = false;
    hooks.onFlipper('left', false);
    hooks.onFlipper('right', false);
    setFlipperVisual('left', false);
    setFlipperVisual('right', false);
    const el = document.getElementById('btn-launch');
    if (el) el.classList.remove('active');
  }

  return { attach, reset, isCharging: () => charging };
})();
