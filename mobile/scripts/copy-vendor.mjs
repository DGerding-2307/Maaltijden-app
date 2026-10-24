// Zet de JavaScript van Capacitor en de plug-ins in www/vendor/, zodat het beginscherm van de app
// (zonder bundler) de meldingen-plug-in kan gebruiken. Draait vóór `cap add`/`cap sync`.
import fs from 'node:fs';

const FILES = [
  ['node_modules/@capacitor/core/dist/capacitor.js', 'www/vendor/capacitor.js'],
  ['node_modules/@capacitor/local-notifications/dist/plugin.js', 'www/vendor/local-notifications.js'],
];

fs.mkdirSync('www/vendor', { recursive: true });
for (const [from, to] of FILES) {
  if (!fs.existsSync(from)) throw new Error(`${from} ontbreekt: eerst npm ci`);
  fs.copyFileSync(from, to);
}
console.log(`Capacitor-scripts gekopieerd naar www/vendor (${FILES.length})`);
