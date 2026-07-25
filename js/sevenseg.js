// Mostrador de 7 segmentos retrô (estilo calculadora/relógio digital antigo).

const SevenSeg = (function () {
  const SEG_MAP = {
    '0': ['a', 'b', 'c', 'd', 'e', 'f'],
    '1': ['b', 'c'],
    '2': ['a', 'b', 'g', 'e', 'd'],
    '3': ['a', 'b', 'g', 'c', 'd'],
    '4': ['f', 'g', 'b', 'c'],
    '5': ['a', 'f', 'g', 'c', 'd'],
    '6': ['a', 'f', 'g', 'e', 'c', 'd'],
    '7': ['a', 'b', 'c'],
    '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    '9': ['a', 'b', 'c', 'd', 'f', 'g'],
    ' ': []
  };
  const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  function buildDigit(char) {
    const digit = document.createElement('div');
    digit.className = 'seg-digit';
    const on = SEG_MAP[char] || [];
    for (const seg of SEGMENTS) {
      const el = document.createElement('div');
      el.className = `seg seg-${seg}` + (on.includes(seg) ? ' on' : '');
      digit.appendChild(el);
    }
    return digit;
  }

  function render(containerId, value, width = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const str = String(Math.max(0, Math.floor(value))).padStart(width, ' ').slice(-width);
    if (container.dataset.lastValue === str) return;
    container.dataset.lastValue = str;
    container.innerHTML = '';
    for (const ch of str) {
      container.appendChild(buildDigit(ch));
    }
  }

  return { render };
})();
