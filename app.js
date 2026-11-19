(() => {
  const $ = (id) => document.getElementById(id);

  const input = $('qr-text');
  const qrBox = $('qr-code');
  const emptyState = $('empty-state');
  const statusEl = $('status');
  const hint = $('hint');
  const sizeRange = $('size-range');
  const sizeValue = $('size-value');
  const levelSelect = $('level');
  const colorDark = $('color-dark');
  const colorLight = $('color-light');
  const generateBtn = $('generate-btn');
  const clearBtn = $('clear-btn');
  const pngBtn = $('download-png');
  const svgBtn = $('download-svg');

  const MARGIN = 4; // Zona de silencio en módulos (estándar QR)
  const MAX_TEXT_LENGTH = 1800;
  let current = null;

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.toggle('online', Boolean(ok));
    statusEl.classList.toggle('offline', !ok);
  }

  function showHint(text, isError = false) {
    hint.hidden = !text;
    hint.textContent = text || '';
    hint.classList.toggle('error', Boolean(isError));
  }

  if (typeof window.qrcode === 'undefined') {
    setStatus('Error', false);
    showHint(
      'No se pudo cargar la librería local de QR (/vendor/qrcode.min.js). Verifica que el archivo exista.',
      true
    );
    return;
  }

  if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  }

  function sanitizarTexto(valor, maxLen = MAX_TEXT_LENGTH) {
    const limpio = String(valor ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .trim();
    return limpio.length > maxLen ? limpio.slice(0, maxLen) : limpio;
  }

  function xmlEscape(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function debounce(fn, ms) {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((idx) => {
      const c = parseInt(hex.slice(idx, idx + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastWarning(dark, light) {
    const lumDark = luminance(dark);
    const lumLight = luminance(light);
    if (lumDark > lumLight) {
      return 'El color principal es más claro que el fondo: muchos lectores podrían no escanear este QR.';
    }
    if ((lumLight + 0.05) / (lumDark + 0.05) < 3) {
      return 'El contraste entre colores es bajo y el QR podría fallar al escanearse.';
    }
    return '';
  }

  function getSettings() {
    return {
      text: sanitizarTexto(input.value),
      size: Number(sizeRange.value),
      dark: colorDark.value,
      light: colorLight.value,
      level: levelSelect.value,
    };
  }

  function draw(canvas, qr, cell, dark, light) {
    const count = qr.getModuleCount();
    canvas.width = canvas.height = (count + MARGIN * 2) * cell;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = dark;

    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + MARGIN) * cell, (r + MARGIN) * cell, cell, cell);
        }
      }
    }
  }

  function showEmpty() {
    current = null;
    qrBox.replaceChildren();
    qrBox.style.display = 'none';
    emptyState.style.display = 'flex';
    pngBtn.disabled = true;
    svgBtn.disabled = true;
    setStatus('Vacío', false);
  }

  function render() {
    const settings = getSettings();
    showHint(settings.text ? contrastWarning(settings.dark, settings.light) : '', false);

    if (!settings.text) {
      showEmpty();
      return;
    }

    let qr;
    try {
      qr = window.qrcode(0, settings.level);
      qr.addData(settings.text);
      qr.make();
    } catch {
      showEmpty();
      setStatus('Error', false);
      showHint(
        'El texto es demasiado largo para el nivel de corrección elegido. Acórtalo o usa un nivel menor.',
        true
      );
      return;
    }

    const totalModules = qr.getModuleCount() + MARGIN * 2;
    const dpr = window.devicePixelRatio || 1;
    const cell = Math.max(1, Math.ceil((settings.size * dpr) / totalModules));
    const canvas = document.createElement('canvas');

    draw(canvas, qr, cell, settings.dark, settings.light);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Código QR para: ${settings.text.slice(0, 120)}`);

    qrBox.replaceChildren(canvas);
    qrBox.style.display = 'flex';
    qrBox.style.width = `${settings.size}px`;
    qrBox.style.height = `${settings.size}px`;
    emptyState.style.display = 'none';
    pngBtn.disabled = false;
    svgBtn.disabled = false;
    current = { qr, settings };
    setStatus('Listo', true);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 45000);
  }

  function downloadPng() {
    if (!current) return;
    const { qr, settings } = current;
    const totalModules = qr.getModuleCount() + MARGIN * 2;
    const canvas = document.createElement('canvas');
    draw(canvas, qr, Math.max(1, Math.ceil(1024 / totalModules)), settings.dark, settings.light);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'codigo-qr.png');
    }, 'image/png');
  }

  function downloadSvg() {
    if (!current) return;
    const { qr, settings } = current;
    const count = qr.getModuleCount();
    const total = count + MARGIN * 2;
    let pathData = '';

    for (let r = 0; r < count; r += 1) {
      let c = 0;
      while (c < count) {
        if (qr.isDark(r, c)) {
          const start = c;
          while (c < count && qr.isDark(r, c)) c += 1;
          pathData += `M${start + MARGIN} ${r + MARGIN}h${c - start}v1h-${c - start}z`;
        } else {
          c += 1;
        }
      }
    }

    const svg = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.size}" height="${settings.size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img">`,
      `<title>${xmlEscape(settings.text)}</title>`,
      `<rect width="${total}" height="${total}" fill="${settings.light}"/>`,
      `<path d="${pathData}" fill="${settings.dark}"/>`,
      '</svg>',
    ].join('\n');

    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'codigo-qr.svg');
  }

  const renderSoon = debounce(render, 120);

  input.addEventListener('input', renderSoon);
  colorDark.addEventListener('input', renderSoon);
  colorLight.addEventListener('input', renderSoon);
  levelSelect.addEventListener('change', render);
  sizeRange.addEventListener('input', () => {
    sizeValue.textContent = `${sizeRange.value} px`;
    renderSoon();
  });

  generateBtn.addEventListener('click', render);
  clearBtn.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
  });

  pngBtn.addEventListener('click', downloadPng);
  svgBtn.addEventListener('click', downloadSvg);

  sizeValue.textContent = `${sizeRange.value} px`;
  render();
})();