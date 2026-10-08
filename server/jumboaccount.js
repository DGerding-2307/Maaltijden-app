// Boodschappenlijst overzetten naar de Jumbo-app, via jumbo-wrapper (onofficiële wrapper rond de API van de Jumbo-app).
// De Jumbo-app gebruikt één lijst/mandje per account: wat we hier toevoegen verschijnt in de app onder "Boodschappenlijst".
// Let op: Jumbo heeft geen officiële API. Als Jumbo het inloggen wijzigt, kan dit zonder aankondiging stoppen met werken;
// de rest van de app blijft dan gewoon werken.
import jumboWrapper from 'jumbo-wrapper';
import { getSetting, setSetting } from './db.js';

const { Jumbo } = jumboWrapper;

function client(token) {
  const jumbo = new Jumbo({ apiVersion: 17 });
  const base = process.env.JUMBO_API_BASE;
  if (base) jumbo.endpoint = base.endsWith('/') ? base : `${base}/`;
  if (token) jumbo.loginWithToken(token);
  return jumbo;
}

/** Zet fouten van axios/jumbo-wrapper om naar een duidelijke Nederlandse melding. */
export function jumboError(err, action) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) {
    return Object.assign(new Error(action === 'login'
      ? 'Inloggen bij Jumbo is mislukt. Controleer je e-mailadres en wachtwoord.'
      : 'Je Jumbo-sessie is verlopen. Log opnieuw in bij Jumbo.'), { status: 401, jumboLoggedOut: action !== 'login' });
  }
  if (status === 404 || status === 410) {
    return Object.assign(new Error('Jumbo heeft deze functie in de app-API gewijzigd of uitgezet. Gebruik de links naar Jumbo per artikel of kopieer de lijst.'), { status: 502 });
  }
  if (status) return Object.assign(new Error(`Jumbo antwoordde met status ${status}`), { status: 502 });
  return Object.assign(new Error(`Jumbo is niet bereikbaar (${err?.code || err?.message || 'onbekende fout'})`), { status: 502 });
}

export function jumboAccountStatus() {
  return { connected: !!getSetting('jumbo_token', null), email: getSetting('jumbo_email', null) };
}

/** Inloggen met e-mail en wachtwoord. Alleen de sessietoken wordt bewaard, nooit het wachtwoord. */
export async function loginJumbo(email, password) {
  if (!email || !password) throw Object.assign(new Error('Vul je Jumbo e-mailadres en wachtwoord in'), { status: 400 });
  const jumbo = client();
  jumbo.login(String(email).trim(), String(password));
  try {
    await jumbo.tokenHandler.Ready;
  } catch (err) {
    throw jumboError(err, 'login');
  }
  const token = jumbo.tokenHandler.getToken();
  if (!token) throw Object.assign(new Error('Jumbo gaf geen sessie terug. Mogelijk is de inlogmethode van Jumbo gewijzigd.'), { status: 502 });
  setSetting('jumbo_token', token);
  setSetting('jumbo_email', String(email).trim());
  return jumboAccountStatus();
}

/** Inloggen met een bestaande sessietoken (x-jumbo-token), als inloggen met wachtwoord niet meer werkt. */
export function loginJumboWithToken(token, email = null) {
  if (!token || String(token).length < 10) throw Object.assign(new Error('Ongeldige token'), { status: 400 });
  setSetting('jumbo_token', String(token).trim());
  setSetting('jumbo_email', email || 'via token');
  return jumboAccountStatus();
}

export function logoutJumbo() {
  setSetting('jumbo_token', null);
  setSetting('jumbo_email', null);
  return jumboAccountStatus();
}

/**
 * Voeg producten toe aan de boodschappenlijst in de Jumbo-app.
 * De Jumbo-API vervangt de hele lijst bij opslaan; daarom halen we eerst de huidige lijst op en voegen we samen,
 * zodat wat je al in de app had staan bewaard blijft.
 * @param items [{ sku, quantity }]
 */
export async function addToJumboList(items) {
  const token = getSetting('jumbo_token', null);
  if (!token) throw Object.assign(new Error('Log eerst in bij Jumbo'), { status: 401 });
  const jumbo = client(token);
  // jumbo-wrapper 2.1.0 stuurt bij basket-aanroepen de token niet mee (authRequired ontbreekt);
  // daarom geven we de header zelf mee.
  const auth = { headers: { 'x-jumbo-token': token } };
  let basket;
  try {
    basket = await jumbo.basket().getMyBasket(auth);
  } catch (err) {
    const e = jumboError(err, 'basket');
    if (e.jumboLoggedOut) logoutJumbo();
    throw e;
  }
  const merged = new Map();
  for (const p of basket?.products || []) {
    merged.set(p.sku, { sku: p.sku, unit: p.unit || 'pieces', quantity: Number(p.quantity) || 1 });
  }
  const before = merged.size;
  let added = 0;
  for (const item of items) {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const existing = merged.get(item.sku);
    if (existing) existing.quantity += quantity;
    else merged.set(item.sku, { sku: item.sku, unit: 'pieces', quantity });
    added += quantity;
  }
  try {
    await jumbo.basket().updateBasket({ items: [...merged.values()], vagueTerms: basket?.vagueTerms || [] }, auth);
  } catch (err) {
    const e = jumboError(err, 'basket');
    if (e.jumboLoggedOut) logoutJumbo();
    throw e;
  }
  return { products: items.length, pieces: added, new_products: merged.size - before, total_products: merged.size };
}
