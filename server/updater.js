// Direct updaten vanuit de app.
// - Nieuwste versie: de laatste geslaagde Docker-build op GitHub (dat image staat klaar als :latest).
// - Updaten: de updater-container (Watchtower) heeft een HTTP API; die haalt het nieuwe image op en herstart de app.
//   Instellen in docker-compose.yml: UPDATER_URL en UPDATER_TOKEN bij de app, dezelfde token bij de updater.
const repo = () => process.env.UPDATE_REPO || 'DGerding-2307/Maaltijden-app';
const github = () => process.env.UPDATE_GITHUB_API || 'https://api.github.com';
const raw = () => process.env.UPDATE_GITHUB_RAW || 'https://raw.githubusercontent.com';
const CACHE_MS = 15 * 60 * 1000;

let cache = null; // { at, latest }

export function updaterConfigured() {
  return !!(process.env.UPDATER_URL && process.env.UPDATER_TOKEN);
}

/** Commit uit de versie van het Docker-image, bv. "3.2.3+fe4de15" → "fe4de15". */
export function commitOf(version) {
  return String(version || '').split('+')[1] || null;
}

async function getJson(url, timeout = 8000) {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Maaltijden-app' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/**
 * Nieuwste beschikbare versie, of null als GitHub niet bereikbaar is.
 * @returns {{ version: string, commit: string, date: string } | null}
 */
export async function latestVersion({ refresh = false } = {}) {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.latest;
  let latest = null;
  try {
    const info = await getJson(`${github()}/repos/${repo()}`);
    const runs = await getJson(`${github()}/repos/${repo()}/actions/workflows/docker.yml/runs?branch=${encodeURIComponent(info.default_branch)}&status=success&per_page=1`);
    const run = runs.workflow_runs?.[0];
    if (run) {
      const pkg = await getJson(`${raw()}/${repo()}/${run.head_sha}/package.json`);
      const commit = run.head_sha.slice(0, 7);
      latest = { version: `${pkg.version}+${commit}`, commit, date: run.updated_at || run.created_at };
    }
  } catch {
    latest = null;
  }
  cache = { at: Date.now(), latest };
  return latest;
}

/** Status voor Instellingen: huidige en nieuwste versie, en of direct updaten kan. */
export async function updateStatus(current, opts) {
  const latest = await latestVersion(opts);
  const cur = commitOf(current);
  return {
    current,
    latest: latest?.version || null,
    latest_date: latest?.date || null,
    update_available: !!(latest && cur && latest.commit !== cur),
    can_update: updaterConfigured(),
  };
}

/** De updater opdracht geven om nu te updaten. De app herstart daarna vanzelf. */
export async function triggerUpdate() {
  if (!updaterConfigured()) {
    throw Object.assign(new Error('Direct updaten is nog niet ingesteld. Zie Instellingen → Versie en updates.'), { status: 400 });
  }
  const url = `${process.env.UPDATER_URL.replace(/\/+$/, '')}/v1/update?async=true`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPDATER_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('De updater is niet bereikbaar. Draait de container ‘maaltijden-updater’ en staat UPDATER_URL goed?'), { status: 502 });
  }
  if (res.status === 202 || res.ok) return { started: true };
  if (res.status === 429) return { started: true, already_running: true };
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('De updater weigert de opdracht: UPDATER_TOKEN is niet gelijk aan WATCHTOWER_HTTP_API_TOKEN.'), { status: 502 });
  }
  if (res.status === 404) {
    throw Object.assign(new Error('De updater heeft de update-functie niet aan. Zet WATCHTOWER_HTTP_API_ENDPOINTS: update bij de updater.'), { status: 502 });
  }
  throw Object.assign(new Error(`De updater gaf een fout (${res.status}).`), { status: 502 });
}

/** Voor tests. */
export function _resetCache() {
  cache = null;
}
