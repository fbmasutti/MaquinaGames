// Teclado + botões de toque: flippers e lançador — Pinball.
//
// Flippers no padrão de fliperama: Shift esquerdo e Shift direito. As letras
// E e D funcionam como alternativa (teclados/notebooks onde segurar os dois
// Shifts é desconfortável).

const GameInput = (function () {
  let hooks = {
    onFlipper: () => {},
    onChargeStart: () => {},
    onChargeRelease: () => {},
    onInteract: () => {},
  };
  let charging = false;

  // e.code distingue os dois Shifts; e.key não (ambos são 'Shift').
  function flipperSideFor(e) {
    switch (e.code) {
      case 'ShiftLeft': return 'left';
      case 'ShiftRight': return 'right';
      case 'KeyE': return 'left';
      case 'KeyD': return 'right';
      default: return null;
    }
  }

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
    if (e.code === 'Space') {
      e.preventDefault();
      hooks.onInteract();
      startCharge();
      return;
    }
    const side = flipperSideFor(e);
    if (!side) return;
    e.preventDefault();
    if (e.repeat) return;
    hooks.onInteract();
    hooks.onFlipper(side, true);
    setFlipperVisual(side, true);
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      releaseCharge();
      return;
    }
    const side = flipperSideFor(e);
    if (!side) return;
    hooks.onFlipper(side, false);
    setFlipperVisual(side, false);
  }

  // Se a janela perde o foco com uma tecla presa, o keyup nunca chega —
  // solta tudo para o flipper não ficar travado em cima.
  function releaseAll() {
    ['left', 'right'].forEach((side) => {
      hooks.onFlipper(side, false);
      setFlipperVisual(side, false);
    });
    releaseCharge();
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
    window.addEventListener('blur', releaseAll);

    const left = document.getElementById('btn-flipper-left');
    const right = document.getElementById('btn-flipper-right');
    const launch = document.getElementById('btn-launch');
    if (left) bindFlipperButton(left, 'left');
    if (right) bindFlipperButton(right, 'right');
    if (launch) bindLaunchButton(launch);
  }

  function reset() {
    charging = false;
    releaseAll();
  }

  return { attach, reset, isCharging: () => charging };
})();
