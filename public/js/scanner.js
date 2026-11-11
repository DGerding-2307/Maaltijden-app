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
  // In de Android-app: de scanner van Google (ML Kit). Die stelt zelf scherp en kiest de goede camera.
  const native = window.Capacitor?.Plugins?.BarcodeScanner;
  if (native && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { available } = await native.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: true }));
      if (!available) await native.installGoogleBarcodeScannerModule().catch(() => {});
      const { barcodes } = await native.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
      const code = barcodes?.[0]?.rawValue;
      if (code) { navigator.vibrate?.(80); return code; }
      return null;
    } catch (err) {
      // Zelf geannuleerd: stoppen. Anders (bv. module nog niet gedownload): de scanner in de app gebruiken.
      if (/cancel/i.test(err?.message || '')) return null;
    }
  }
  return webScan({ title });
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
