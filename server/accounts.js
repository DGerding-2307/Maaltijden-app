// Accounts: ieder in het huishouden logt in met een eigen naam en wachtwoord en ziet zijn eigen dagboek,
// maatje en herinneringen. Recepten, planner en boodschappen zijn van het hele huishouden.
// Zolang er nog geen account is, werkt de app zonder inloggen (zoals vóór v4). Het eerste account wordt beheerder.
import crypto from 'node:crypto';
import { getDb } from './db.js';

const COOKIE = 'maaltijden_sessie';
const SESSION_DAYS = 365;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function accountsEnabled() {
  return !!getDb().prepare('SELECT 1 FROM people WHERE password_hash IS NOT NULL LIMIT 1').get();
}

const cleanUsername = (u) => String(u || '').trim().toLowerCase();

function checkCredentials(username, password) {
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw fail('Kies een gebruikersnaam van 2–32 tekens: letters, cijfers, punt, streepje of liggend streepje.');
  if (String(password || '').length < 8) throw fail('Kies een wachtwoord van minstens 8 tekens.');
  const taken = getDb().prepare('SELECT id FROM people WHERE username = ?').get(username);
  if (taken) throw fail('Deze gebruikersnaam is al in gebruik.', 409);
}

/** Openbare gegevens van een account (zonder wachtwoord). */
export function publicUser(p) {
  return p ? { id: p.id, name: p.name, username: p.username, is_admin: !!p.is_admin } : null;
}

export function listAccounts() {
  return getDb().prepare('SELECT * FROM people ORDER BY id').all().map((p) => ({ ...publicUser(p), has_account: !!p.password_hash }));
}

/**
 * Account maken. Het allereerste account mag iedereen maken (en wordt beheerder);
 * daarna alleen een beheerder. Koppelen aan een bestaande persoon houdt diens dagboek en gewicht.
 */
export function createAccount({ name, username, password, person_id, is_admin }, by = null) {
  const db = getDb();
  const first = !accountsEnabled();
  if (!first && !by?.is_admin) throw fail('Alleen een beheerder kan accounts toevoegen.', 403);
  const user = cleanUsername(username);
  checkCredentials(user, password);
  let personId = Number(person_id) || null;
  if (personId) {
    const p = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
    if (!p) throw fail('Persoon niet gevonden', 404);
    if (p.password_hash) throw fail(`${p.name} heeft al een account.`, 409);
    if (name) db.prepare('UPDATE people SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 40), personId);
  } else {
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw fail('Vul je naam in.');
    personId = Number(db.prepare('INSERT INTO people (name) VALUES (?)').run(n).lastInsertRowid);
  }
  db.prepare('UPDATE people SET username = ?, password_hash = ?, is_admin = ? WHERE id = ?')
    .run(user, hashPassword(password), first || is_admin ? 1 : 0, personId);
  return publicUser(db.prepare('SELECT * FROM people WHERE id = ?').get(personId));
}

export function login(username, password) {
  const p = getDb().prepare('SELECT * FROM people WHERE username = ?').get(cleanUsername(username));
  // Ook bij een onbekende naam even rekenen, zodat je aan de tijd niet ziet of een naam bestaat
  const ok = p ? verifyPassword(password, p.password_hash) : (verifyPassword(password, hashPassword('x')), false);
  if (!ok) throw fail('Gebruikersnaam of wachtwoord klopt niet.', 401);
  const token = crypto.randomBytes(32).toString('base64url');
  getDb().prepare('INSERT INTO sessions (token, person_id) VALUES (?, ?)').run(hashToken(token), p.id);
  return { token, user: publicUser(p) };
}

// In de database staat alleen een hash van de sessiecode
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function logout(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
}

export function userForToken(token) {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`SELECT p.* FROM sessions s JOIN people p ON p.id = s.person_id
    WHERE s.token = ? AND s.created_at > datetime('now', ?) AND p.password_hash IS NOT NULL`).get(hashToken(token), `-${SESSION_DAYS} days`);
  return row || null;
}

export function changePassword(user, { current, password }) {
  const p = getDb().prepare('SELECT * FROM people WHERE id = ?').get(user.id);
  if (!verifyPassword(current, p.password_hash)) throw fail('Je huidige wachtwoord klopt niet.', 401);
  if (String(password || '').length < 8) throw fail('Kies een wachtwoord van minstens 8 tekens.');
  getDb().prepare('UPDATE people SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  // Overal anders uitloggen
  getDb().prepare('DELETE FROM sessions WHERE person_id = ?').run(user.id);
}

/** Beheerder: wachtwoord van iemand anders opnieuw instellen, of het account opheffen (de persoon en het dagboek blijven). */
export function adminUpdate(by, personId, { password, remove, is_admin }) {
  if (!by?.is_admin) throw fail('Alleen een beheerder kan dit.', 403);
  const db = getDb();
  const p = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!p?.password_hash) throw fail('Account niet gevonden', 404);
  const admins = db.prepare('SELECT COUNT(*) c FROM people WHERE is_admin = 1 AND password_hash IS NOT NULL').get().c;
  if ((remove || is_admin === false) && p.is_admin && admins <= 1) throw fail('Er moet minstens één beheerder blijven.');
  if (remove) {
    db.prepare('UPDATE people SET username = NULL, password_hash = NULL, is_admin = 0 WHERE id = ?').run(personId);
    db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
    return { removed: true };
  }
  if (password) {
    if (String(password).length < 8) throw fail('Kies een wachtwoord van minstens 8 tekens.');
    db.prepare('UPDATE people SET password_hash = ? WHERE id = ?').run(hashPassword(password), personId);
    db.prepare('DELETE FROM sessions WHERE person_id = ?').run(personId);
  }
  if (is_admin !== undefined) db.prepare('UPDATE people SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, personId);
  return publicUser(db.prepare('SELECT * FROM people WHERE id = ?').get(personId));
}

// ---------- Express ----------

export function tokenFrom(req) {
  return (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || null;
}

export function sessionCookie(req, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return token
    ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
    : `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

// Routes die alleen over je eigen gegevens gaan: een gewone gebruiker kan hier niet bij iemand anders
const PERSONAL = /^\/(diary|buddy|reminders|weight|push|people)(\/|$)/;

/**
 * Middleware voor /api: wie ben je, en mag dit?
 * - Geen accounts: alles open (zoals vóór v4).
 * - Wel accounts, niet ingelogd: alleen /auth.
 * - Ingelogd zonder beheerder: persoonlijke routes gaan altijd over jezelf.
 */
export function apiGuard(req, res, next) {
  const user = userForToken(tokenFrom(req));
  req.user = user;
  if (!accountsEnabled() || req.path.startsWith('/auth/')) return next();
  if (!user) return res.status(401).json({ error: 'Log eerst in', login: true });
  if (user.is_admin) return next();
  // Gewone gebruiker: persoon in de vraag altijd vervangen door jezelf (ook de planner toont het dagboek)
  // (In Express 5 is req.query een getter: echt vervangen in plaats van aanpassen)
  if ('persoon' in req.query) Object.defineProperty(req, 'query', { value: { ...req.query, persoon: String(user.id) }, configurable: true, writable: true });
  if (req.body && typeof req.body === 'object' && 'person_id' in req.body) req.body.person_id = user.id;
  if (!PERSONAL.test(req.path)) return next();
  const m = req.path.match(/^\/(diary|weight|people)\/(\d+)/);
  if (m && (req.method !== 'GET' || m[1] === 'diary')) {
    const table = { diary: 'food_log', weight: 'weight_log' }[m[1]];
    const owner = table ? getDb().prepare(`SELECT person_id FROM ${table} WHERE id = ?`).get(Number(m[2]))?.person_id : Number(m[2]);
    if (owner != null && owner !== user.id) return res.status(403).json({ error: 'Dit is van iemand anders.' });
  }
  if (req.path === '/people' && req.method === 'POST') return res.status(403).json({ error: 'Alleen een beheerder kan personen toevoegen.' });
  return next();
}
