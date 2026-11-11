// Barcodescanner met de camera. Gebruikt de ingebouwde BarcodeDetector (Chrome/Android) en anders ZXing
// (werkt ook op iPhone/Safari en Firefox). Camera vereist HTTPS of localhost.
import { modal, esc } from './util.js';

let zxingLoading = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/zxing/index.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Scanner kon niet geladen worden'));
    document.head.append(s);
  });
  return zxingLoading;
}

/**
 * Open een venster dat de camera gebruikt (of handmatige invoer) en geef de barcode terug.
 * @returns Promise<string|null> null als de gebruiker annuleert
 */
export async function scanBarcode({ title = 'Barcode scannen' } = {}) {
  const native = window.Capacitor?.Plugins?.BarcodeScanner;
  if (native && window.Capacitor?.isNativePlatform?.()) return appScan({ title, native });
  return webScan({ title });
}

/** Live scannen met de scanner van Google (ML Kit). Geeft de code, null (geannuleerd) of undefined (lukt niet). */
async function googleScan(native) {
  try {
    const { available } = await native.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: true }));
    if (!available) await native.installGoogleBarcodeScannerModule().catch(() => {});
    const { barcodes } = await native.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
    return barcodes?.[0]?.rawValue || null;
  } catch (err) {
    return /cancel/i.test(err?.message || '') ? null : undefined;
  }
}

/**
 * Een barcode lezen uit een foto. De camera-app van de telefoon stelt zelf goed scherp en maakt een
 * scherpe foto op volle resolutie; daar halen we de streepjescode uit.
 */
export async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if ('BarcodeDetector' in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const found = await det.detect(img);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch { /* niet ondersteund: ZXing proberen */ }
    }
    const ZXing = await loadZxing();
    const hints = new Map([
      [ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]],
      [ZXing.DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new ZXing.BrowserMultiFormatReader(hints);
    // Grote foto's eerst verkleinen (sneller) – en als dat niets oplevert de volle grootte proberen
    // Ook een kwartslag gedraaid proberen (telefoon rechtop, streepjescode liggend)
    for (const max of [1600, 2400, Infinity]) for (const turn of [false, true]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = turn ? h : w;
      canvas.height = turn ? w : h;
      const g = canvas.getContext('2d');
      if (turn) { g.translate(h, 0); g.rotate(Math.PI / 2); }
      g.drawImage(img, 0, 0, w, h);
      try {
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
        const res = reader.decodeBitmap(bitmap);
        if (res) return res.getText();
      } catch { /* niet gevonden op deze grootte */ }
      if (scale === 1 && turn) break;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Knop die de camera-app opent; na de foto wordt de code eruit gehaald. */
function photoButton(root, { status, onCode, primary = false }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<input type="file" accept="image/*" capture="environment" hidden data-photo-input>
    <button type="button" class="btn ${primary ? 'btn-primary' : ''} scan-photo-btn" data-photo>📸 Foto maken met de camera</button>`;
  root.append(wrap);
  const input = wrap.querySelector('[data-photo-input]');
  wrap.querySelector('[data-photo]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    status.textContent = 'Streepjescode zoeken in de foto…';
    try {
      const code = await decodeImageFile(file);
      if (code) onCode(code);
      else status.textContent = 'Geen streepjescode gevonden. Maak de foto wat dichterbij, recht van voren en zonder schittering, of typ de cijfers.';
    } catch (err) {
      status.textContent = `Foto lezen lukte niet (${err.message}). Typ de cijfers hieronder.`;
    }
  });
}

/** In de Android-app: kiezen tussen een foto met de camera-app (scherpst) en live scannen. */
function appScan({ title, native }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      navigator.vibrate?.(80);
      md.close();
      resolve(code);
    };
    const md = modal(`
      <h2>📷 ${esc(title)}</h2>
      <div class="scan-choice" data-choice></div>
      <button type="button" class="btn scan-photo-btn" data-live>⚡ Live scannen</button>
      <p class="muted small" data-scan-status>Met een foto stelt je camera zelf scherp. Zorg dat de hele streepjescode in beeld is.</p>
      <form class="row" data-manual>
        <input class="input grow" name="code" inputmode="numeric" pattern="[0-9 ]{8,14}" placeholder="Of typ de cijfers onder de streepjescode" aria-label="Barcode">
        <button class="btn btn-primary">OK</button>
      </form>`, { onClose: () => { if (!done) { done = true; resolve(null); } } });
    const status = md.el.querySelector('[data-scan-status]');
    photoButton(md.el.querySelector('[data-choice]'), { status, onCode: finish, primary: true });
    md.el.querySelector('[data-live]').addEventListener('click', async () => {
      const code = await googleScan(native);
      if (code) finish(code);
      else if (code === undefined) status.textContent = 'Live scannen lukt nu niet. Maak een foto of typ de cijfers.';
    });
    md.el.querySelector('[data-manual]').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = e.target.code.value.replace(/\D/g, '');
      if (code.length >= 8) finish(code);
    });
  });
}

function webScan({ title }) {
  return new Promise((resolve) => {
    let done = false;
    let stream = null;
    let zxingReader = null;
    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      zxingReader?.reset();
      zxingReader = null;
    };
    const finish = (code) => {
      if (done) return;
      done = true;
      stop();
      navigator.vibrate?.(80);
      md.close();
      resolve(code);
    };
    const md = modal(`
      <h2>📷 ${esc(title)}</h2>
      <div class="scanner" data-viewport><video playsinline muted></video><div class="scan-line"></div><div class="focus-ring"></div></div>
      <div class="scan-controls" data-controls hidden>
        <button type="button" class="btn small" data-focus>🎯 Scherpstellen</button>
        <label class="scan-zoom" data-zoom-wrap hidden>🔍 <input type="range" data-zoom aria-label="Inzoomen"></label>
        <button type="button" class="btn small" data-torch hidden aria-pressed="false">🔦 Lamp</button>
      </div>
      <p class="muted small" data-scan-status>Camera starten… Houd de streepjescode rustig in beeld.</p>
      <form class="row" data-manual>
        <input class="input grow" name="code" inputmode="numeric" pattern="[0-9 ]{8,14}" placeholder="Of typ de cijfers onder de streepjescode" aria-label="Barcode">
        <button class="btn btn-primary">OK</button>
      </form>`, { onClose: () => { stop(); if (!done) { done = true; resolve(null); } } });
    const video = md.el.querySelector('video');
    const status = md.el.querySelector('[data-scan-status]');
    const photoBox = document.createElement('div');
    md.el.querySelector('[data-controls]').before(photoBox);
    photoButton(photoBox, { status, onCode: finish });
    md.el.querySelector('[data-manual]').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = e.target.code.value.replace(/\D/g, '');
      if (code.length >= 8) finish(code);
    });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Camera niet beschikbaar (de app moet via HTTPS geopend worden). Typ de barcode hieronder.';
        return;
      }
      try {
        stream = await openCamera();
        if (done) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        setupControls(md.el, stream.getVideoTracks()[0]);
        status.textContent = 'Zoeken naar een streepjescode… Wazig? Tik op het beeld of zoom wat in en houd het product iets verder weg.';
        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          const tick = async () => {
            if (done || !stream) return;
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]?.rawValue) finish(codes[0].rawValue);
            else setTimeout(tick, 120);
          };
          tick();
        } else {
          const ZXing = await loadZxing();
          if (done) return;
          const hints = new Map([
            [ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]],
            [ZXing.DecodeHintType.TRY_HARDER, true],
          ]);
          zxingReader = new ZXing.BrowserMultiFormatReader(hints);
          // Zelfde camerastream gebruiken, zodat scherpstellen en zoom ook voor ZXing werken
          await zxingReader.decodeFromStream(stream, video, (result) => {
            if (result) finish(result.getText());
          });
        }
      } catch (err) {
        status.textContent = `Camera niet beschikbaar (${err.message}). Typ de barcode hieronder.`;
      }
    })();
  });
}

/** Achtercamera in hoge resolutie met doorlopend scherpstellen (waar het toestel dat ondersteunt). */
async function openCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: {
      facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }],
    } });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  }
}

const capsOf = (track) => (typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {});
const apply = (track, c) => track.applyConstraints({ advanced: [c] }).catch(() => {});

/** Knoppen voor scherpstellen, zoom en lamp; tikken op het beeld stelt scherp op die plek. */
function setupControls(root, track) {
  if (!track) return;
  const c = capsOf(track);
  const modes = c.focusMode || [];
  const viewport = root.querySelector('[data-viewport]');
  const ring = root.querySelector('.focus-ring');
  root.querySelector('[data-controls]').hidden = false;

  // Eenmalig scherpstellen en daarna weer doorlopend. Kan het toestel dat niet, dan kort op dichtbij zetten.
  const refocus = async (x = 0.5, y = 0.5) => {
    const poi = 'pointsOfInterest' in c ? { pointsOfInterest: [{ x, y }] } : {};
    const back = () => setTimeout(() => modes.includes('continuous') && apply(track, { focusMode: 'continuous' }), 1500);
    if (modes.includes('single-shot')) {
      await apply(track, { focusMode: 'single-shot', ...poi });
      back();
    } else if (modes.includes('manual') && c.focusDistance) {
      const d = c.focusDistance;
      await apply(track, { focusMode: 'manual', focusDistance: Math.min(d.max, Math.max(d.min, 0.15)) });
      back();
    } else if (modes.includes('continuous')) {
      // Opnieuw instellen laat veel camera's opnieuw scherpstellen
      await apply(track, { focusMode: 'manual' });
      await apply(track, { focusMode: 'continuous', ...poi });
    }
  };
  root.querySelector('[data-focus]').addEventListener('click', () => refocus());
  viewport.addEventListener('click', (e) => {
    const r = viewport.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ring.style.left = `${x * 100}%`;
    ring.style.top = `${y * 100}%`;
    ring.classList.remove('pulse');
    void ring.offsetWidth;
    ring.classList.add('pulse');
    refocus(x, y);
  });

  // Zoom: veel hoofdcamera's kunnen niet dichtbij scherpstellen. Iets inzoomen (standaard ±2×)
  // en het product wat verder weg houden geeft dan een scherp beeld.
  if (c.zoom && c.zoom.max > c.zoom.min) {
    const input = root.querySelector('[data-zoom]');
    Object.assign(input, { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1 });
    input.value = Math.min(c.zoom.max, Math.max(c.zoom.min, 2));
    apply(track, { zoom: Number(input.value) });
    input.addEventListener('input', () => apply(track, { zoom: Number(input.value) }));
    root.querySelector('[data-zoom-wrap]').hidden = false;
  }

  if (c.torch) {
    const btn = root.querySelector('[data-torch]');
    let on = false;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      on = !on;
      apply(track, { torch: on });
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('btn-primary', on);
    });
  }
}
