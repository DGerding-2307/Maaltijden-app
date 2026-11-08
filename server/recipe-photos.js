// Receptfoto's: een afbeelding ophalen (link) of aannemen (base64), verkleinen en bewaren in de map met uploads
// (naast de database, dus in het data-volume: blijft staan na een herstart of update van de container).
// - Een link wordt meteen opgehaald: links van Instagram en YouTube verlopen, dus we bewaren nooit de externe link.
// - Beveiliging: alleen https, geen interne/lokale adressen (ook niet via DNS of een redirect), max. 3 redirects,
//   10 seconden, max. 5 MB, alleen JPEG/PNG/WebP (gecontroleerd op de inhoud, niet alleen op de header).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { uploadDir } from './paths.js';

export const MAX_BYTES = 5 * 1024 * 1024;
export const FULL_WIDTH = 1200;
export const THUMB_WIDTH = 400;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SHARP_FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const fail = (message) => Object.assign(new Error(message), { status: 400, toolError: true });

// ---------- Adressen controleren ----------

const v4ToInt = (ip) => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
const inV4 = (ip, base, bits) => bits === 0 || (v4ToInt(ip) >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits));
const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** Is dit een intern, lokaal of anderszins niet-openbaar adres? */
export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return BLOCKED_V4.some(([base, bits]) => inV4(ip, base, bits));
  if (v !== 6) return true;
  const a = ip.toLowerCase().split('%')[0];
  if (a === '::' || a === '::1') return true;
  const mapped = a.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/) || a.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (/^::ffff:/.test(a)) return true; // ::ffff:7f00:1 enz.
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (privé)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** DNS-opzoeking die interne adressen weigert; draait bij het verbinden zelf, dus ook DNS-trucs (rebinding) helpen niet. */
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error('blocked'), { code: 'EBLOCKED' }));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function checkUrl(raw, { allowHttp = false, allowPrivate = false } = {}) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw fail('De foto-link is geen geldige link.'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw fail('Alleen https-links naar een foto zijn toegestaan.');
  if (url.username || url.password) throw fail('Een foto-link met gebruikersnaam of wachtwoord is niet toegestaan.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
    || (net.isIP(host) && isPrivateAddress(host)))) {
    throw fail('Deze link wijst naar een intern of lokaal adres; dat is niet toegestaan.');
  }
  return url;
}

// ---------- Ophalen ----------

function getOnce(url, opts, signal) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.get(url, {
      signal,
      lookup: opts.allowPrivate ? undefined : safeLookup,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Maaltijden-app; receptfoto)',
        Accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1',
      },
    }, (res) => resolve(res));
    req.on('error', reject);
  });
}

function readBody(res, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    res.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        res.destroy();
        reject(fail('De foto is groter dan 5 MB.'));
        return;
      }
      chunks.push(c);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

/**
 * Haal een afbeelding op. Geeft { buffer, type }.
 * @param opts alleen voor tests: { allowHttp, allowPrivate, timeoutMs }
 */
export async function fetchImage(rawUrl, opts = {}) {
  let url = checkUrl(rawUrl, opts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(fail('Het ophalen van de foto duurde langer dan 10 seconden.')), opts.timeoutMs || TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      let res;
      try {
        res = await getOnce(url, opts, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (err.code === 'EBLOCKED' || err.cause?.code === 'EBLOCKED') throw fail('Deze link wijst naar een intern of lokaal adres; dat is niet toegestaan.');
        if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') throw fail(`De website ${url.hostname} is niet gevonden.`);
        throw fail(`De foto kon niet worden opgehaald (${err.code || err.message}).`);
      }
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (hop >= MAX_REDIRECTS) throw fail('De foto-link stuurt te vaak door (meer dan 3 keer).');
        const next = res.headers.location;
        if (!next) throw fail('De foto-link stuurt door zonder nieuw adres.');
        url = checkUrl(new URL(next, url).href, opts);
        continue;
      }
      if (res.statusCode !== 200) {
        res.resume();
        throw fail(res.statusCode === 404 ? 'De foto is niet (meer) te vinden op deze link (404). Links van Instagram en YouTube verlopen soms; haal een nieuwe link op.'
          : `De foto kon niet worden opgehaald: de website antwoordde met ${res.statusCode}.`);
      }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!TYPES.includes(type)) {
        res.resume();
        throw fail(type === 'text/html'
          ? 'Deze link is een webpagina, geen afbeelding. Geef de directe link naar de foto (bv. de thumbnail), die eindigt meestal op .jpg, .png of .webp.'
          : `Dit bestandstype (${type || 'onbekend'}) wordt niet ondersteund; alleen JPEG, PNG of WebP.`);
      }
      if (Number(res.headers['content-length']) > MAX_BYTES) {
        res.resume();
        throw fail('De foto is groter dan 5 MB.');
      }
      const buffer = await readBody(res, controller.signal);
      return { buffer, type };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Base64 (los of als data-URL ‘data:image/png;base64,…’) naar een buffer. */
export function decodeBase64(input, mimeType) {
  const s = String(input || '').trim();
  const m = s.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  const type = (m ? m[1] : mimeType || '').toLowerCase();
  if (type && !TYPES.includes(type)) throw fail(`Dit bestandstype (${type}) wordt niet ondersteund; alleen JPEG, PNG of WebP.`);
  const data = (m ? m[2] : s).replace(/\s+/g, '');
  if (!data || !/^[A-Za-z0-9+/_-]+=*$/.test(data)) throw fail('foto_base64 is geen geldige base64-afbeelding.');
  if (data.length * 0.75 > MAX_BYTES + 4) throw fail('De foto is groter dan 5 MB.');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw fail('foto_base64 is leeg.');
  if (buffer.length > MAX_BYTES) throw fail('De foto is groter dan 5 MB.');
  return { buffer, type };
}

// ---------- Verkleinen en bewaren ----------

const FILE_RE = /^\/uploads\/(recept-[a-f0-9]{24})(?:-400)?\.jpg$/;

/** Verklein naar max. 1200 px breed (+ 400 px voor lijsten), sla op als JPEG. Geeft de links en groottes. */
export async function storeImage(buffer) {
  // Pas hier laden: mocht de beeldbibliotheek op een server niet werken, dan start de rest van de app gewoon
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (err) {
    console.warn(`Receptfoto: beeldbibliotheek niet beschikbaar: ${err.message}`);
    throw Object.assign(new Error('Foto’s verwerken lukt op deze server niet (beeldbibliotheek ontbreekt).'), { status: 500, toolError: true });
  }
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw fail('Dit bestand is geen leesbare afbeelding.');
  }
  if (!SHARP_FORMATS[meta.format]) throw fail(`Dit bestandstype (${meta.format || 'onbekend'}) wordt niet ondersteund; alleen JPEG, PNG of WebP.`);
  const base = sharp(buffer, { limitInputPixels: 50_000_000 }).rotate().flatten({ background: '#ffffff' });
  const full = await base.clone().resize({ width: FULL_WIDTH, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const name = `recept-${crypto.createHash('sha256').update(full.data).digest('hex').slice(0, 24)}`;
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.jpg`), full.data);
  fs.writeFileSync(path.join(dir, `${name}-400.jpg`), thumb.data);
  return {
    image_url: `/uploads/${name}.jpg`,
    image_thumb: `/uploads/${name}-400.jpg`,
    breedte: full.info.width, hoogte: full.info.height, bytes: full.data.length,
    klein: { breedte: thumb.info.width, hoogte: thumb.info.height, bytes: thumb.data.length },
    origineel: { formaat: SHARP_FORMATS[meta.format], breedte: meta.width, hoogte: meta.height, bytes: buffer.length },
  };
}

/** Bestanden van een receptfoto weghalen (alleen onze eigen ‘recept-…’-bestanden), als geen ander recept ze nog gebruikt. */
export function removeFiles(imageUrl, stillUsed) {
  const m = String(imageUrl || '').match(FILE_RE);
  if (!m || stillUsed(`/uploads/${m[1]}.jpg`)) return;
  for (const f of [`${m[1]}.jpg`, `${m[1]}-400.jpg`]) fs.rmSync(path.join(uploadDir(), f), { force: true });
}
