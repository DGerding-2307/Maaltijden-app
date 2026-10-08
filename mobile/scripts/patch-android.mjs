// Past het gegenereerde Android-project aan:
// - camera (barcode scannen, foto's) en verbindingen via het thuisnetwerk (http) toestaan
// - versienummer uit de build (zodat een nieuwe APK over de oude heen geïnstalleerd kan worden)
import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.CAMERA')) {
  manifest = manifest.replace('<application', `<uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />

    <application`);
}
if (!manifest.includes('usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
}
fs.writeFileSync(manifestPath, manifest);

const gradlePath = 'android/app/build.gradle';
let gradle = fs.readFileSync(gradlePath, 'utf8');
const code = Number(process.env.VERSION_CODE || 1);
const name = process.env.VERSION_NAME || JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${name}"`);
fs.writeFileSync(gradlePath, gradle);
console.log(`Android-project aangepast (versie ${name}, code ${code})`);
