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
export function scanBarcode({ title = 'Barcode scannen' } = {}) {
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
      <div class="scanner"><video playsinline muted></video><div class="scan-line"></div></div>
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
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.srcObject = stream;
          await video.play();
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          status.textContent = 'Zoeken naar een streepjescode…';
          const tick = async () => {
            if (done || !stream) return;
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]?.rawValue) finish(codes[0].rawValue);
            else setTimeout(tick, 150);
          };
          tick();
        } else {
          const ZXing = await loadZxing();
          if (done) return;
          const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]]]);
          zxingReader = new ZXing.BrowserMultiFormatReader(hints);
          status.textContent = 'Zoeken naar een streepjescode…';
          await zxingReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
            if (result) finish(result.getText());
          });
        }
      } catch (err) {
        status.textContent = `Camera niet beschikbaar (${err.message}). Typ de barcode hieronder.`;
      }
    })();
  });
}
