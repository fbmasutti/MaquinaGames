// Teclado + alavancas de arcade (touch/mouse) — Escapa Buraco.

const Input = (function () {
  const state = { leftUp: false, leftDown: false, rightUp: false, rightDown: false };
  let hooks = { onMotorChange: () => {}, onPrimary: () => {}, onInteract: () => {} };

  const KEY_MAP = {
    w: "leftUp", W: "leftUp",
    s: "leftDown", S: "leftDown",
    ArrowUp: "rightUp",
    ArrowDown: "rightDown",
  };

  function anyAxis() {
    return state.leftUp || state.leftDown || state.rightUp || state.rightDown;
  }

  // Mantém a alavanca visual em sincronia com o estado, não importa a
  // origem (teclado, toque/mouse na própria alavanca).
  function syncLeverVisual(side) {
    const el = document.getElementById(side === "left" ? "lever-left" : "lever-right");
    if (!el) return;
    const up = side === "left" ? state.leftUp : state.rightUp;
    const down = side === "left" ? state.leftDown : state.rightDown;
    el.classList.toggle("tilt-up", up);
    el.classList.toggle("tilt-down", down);
  }

  function setKey(key, down) {
    const before = anyAxis();
    state[key] = down;
    syncLeverVisual(key.startsWith("left") ? "left" : "right");
    hooks.onMotorChange(before, anyAxis());
  }

  function onKeyDown(e) {
    if (e.key === " ") {
      e.preventDefault();
      hooks.onPrimary();
      return;
    }
    const k = KEY_MAP[e.key];
    if (!k) return;
    e.preventDefault();
    setKey(k, true);
  }

  function onKeyUp(e) {
    const k = KEY_MAP[e.key];
    if (!k) return;
    setKey(k, false);
  }

  // Alavanca de arcade: um único corpo que bascula pra cima ou pra baixo
  // conforme a metade em que o dedo/mouse pressiona — solta e volta ao centro.
  function bindLever(el, side) {
    let activeKey = null;

    const resolveKey = (clientY) => {
      const r = el.getBoundingClientRect();
      const upper = clientY - r.top < r.height / 2;
      return {
        key: side === "left" ? (upper ? "leftUp" : "leftDown") : (upper ? "rightUp" : "rightDown"),
        upper,
      };
    };

    const press = (clientY) => {
      hooks.onInteract();
      const { key } = resolveKey(clientY);
      if (key !== activeKey) {
        if (activeKey) setKey(activeKey, false);
        setKey(key, true);
        activeKey = key;
      }
    };

    const release = () => {
      if (!activeKey) return;
      setKey(activeKey, false);
      activeKey = null;
    };

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      press(e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (activeKey == null) return;
      press(e.clientY);
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function attach(options) {
    hooks = { ...hooks, ...options };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const leverLeft = document.getElementById("lever-left");
    const leverRight = document.getElementById("lever-right");
    if (leverLeft) bindLever(leverLeft, "left");
    if (leverRight) bindLever(leverRight, "right");
  }

  function reset() {
    state.leftUp = state.leftDown = state.rightUp = state.rightDown = false;
    syncLeverVisual("left");
    syncLeverVisual("right");
  }

  return { state, attach, reset };
})();
