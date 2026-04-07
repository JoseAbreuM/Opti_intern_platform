const AUTH_DB = "opti-ams-auth";
const ACCESS_CACHE_KEY = "accessProfiles";
const SESSION_KEY = "activeSession";
const LEGACY_OFFLINE_TOKEN_KEY = "opti_ams_offline_token_hash";

const authStore = window.localforage
  ? window.localforage.createInstance({ name: AUTH_DB, storeName: "auth_cache" })
  : null;

export async function cacheOfflineCredential(token) {
  if (!token) {
    return;
  }
  const hash = await sha256(token);
  localStorage.setItem(LEGACY_OFFLINE_TOKEN_KEY, hash);
}

export async function canLoginOffline(inputToken) {
  const savedHash = localStorage.getItem(LEGACY_OFFLINE_TOKEN_KEY);
  if (!savedHash || !inputToken) {
    return false;
  }

  const inputHash = await sha256(inputToken);
  return inputHash === savedHash;
}

export async function cacheAccessProfiles(profiles = []) {
  const normalized = [];
  for (const profile of profiles) {
    const prepared = await prepareAccessProfile(profile);
    if (prepared.username && prepared.passwordHash) {
      normalized.push(prepared);
    }
  }

  await setStoredItem(ACCESS_CACHE_KEY, dedupeProfiles(normalized));
  return normalized;
}

export async function getCachedAccessProfiles() {
  const cached = (await getStoredItem(ACCESS_CACHE_KEY)) || [];
  return Array.isArray(cached) ? cached : [];
}

export async function persistUserSession(session) {
  if (!session?.username) {
    return null;
  }

  const payload = {
    username: normalizeUsername(session.username),
    displayName: firstNonEmpty(session.displayName, session.username),
    role: normalizeRole(session.role),
    permissions: toArray(session.permissions),
    views: toArray(session.views),
    loggedAt: session.loggedAt || new Date().toISOString(),
    source: session.source || "cache"
  };

  await setStoredItem(SESSION_KEY, payload);
  return payload;
}

export async function restoreUserSession() {
  const session = await getStoredItem(SESSION_KEY);
  return session?.username ? session : null;
}

export async function clearUserSession() {
  await removeStoredItem(SESSION_KEY);
}

export async function loginWithCredentials({ username, password, fetchProfiles } = {}) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) {
    return { ok: false, reason: "missing-credentials", message: "Usuario y clave son obligatorios." };
  }

  let profiles = [];
  let source = "cache";

  if (navigator.onLine && typeof fetchProfiles === "function") {
    try {
      const remoteProfiles = await fetchProfiles();
      if (Array.isArray(remoteProfiles) && remoteProfiles.length) {
        profiles = await cacheAccessProfiles(remoteProfiles);
        source = "remote";
      }
    } catch (error) {
      // Continuar con cache local.
    }
  }

  if (!profiles.length) {
    profiles = await getCachedAccessProfiles();
  }

  if (!profiles.length) {
    return { ok: false, reason: "missing-profiles", message: "No hay usuarios configurados o cacheados aun." };
  }

  const candidate = profiles.find((item) => item.username === normalizedUsername && item.active !== false);
  if (!candidate) {
    return { ok: false, reason: "unknown-user", message: "Usuario no encontrado o inactivo." };
  }

  const passwordHash = await sha256(password);
  if (passwordHash !== candidate.passwordHash) {
    return { ok: false, reason: "invalid-password", message: "Clave incorrecta." };
  }

  const session = await persistUserSession({
    username: candidate.username,
    displayName: candidate.displayName,
    role: candidate.role,
    permissions: candidate.permissions,
    views: candidate.views,
    source,
    loggedAt: new Date().toISOString()
  });

  return { ok: true, source, session };
}

export async function createInitialAccess({ username, displayName, password, role = "optimizacion", saveProfile } = {}) {
  const prepared = await prepareAccessProfile({
    username,
    displayName,
    password,
    role,
    active: true,
    permissions: ["*"],
    views: ["*"]
  });

  if (!prepared.username || !prepared.passwordHash) {
    throw new Error("No se pudo preparar el acceso inicial");
  }

  const cached = await getCachedAccessProfiles();
  await cacheAccessProfiles([...cached.filter((item) => item.username !== prepared.username), prepared]);

  if (navigator.onLine && typeof saveProfile === "function") {
    await saveProfile(prepared);
  }

  return persistUserSession({
    username: prepared.username,
    displayName: prepared.displayName,
    role: prepared.role,
    permissions: prepared.permissions,
    views: prepared.views,
    source: navigator.onLine ? "remote" : "cache",
    loggedAt: new Date().toISOString()
  });
}

export async function verifyOfflineLogin() {
  return Boolean(await restoreUserSession());
}

async function prepareAccessProfile(profile = {}) {
  const username = normalizeUsername(firstNonEmpty(profile.username, profile.usuario, profile.user, profile.email));
  const displayName = firstNonEmpty(profile.displayName, profile.nombre, profile.name, username);
  const role = normalizeRole(firstNonEmpty(profile.role, profile.rol, "consulta"));
  const active = ![false, "false", "0", 0].includes(profile.active);
  const rawHash = firstNonEmpty(
    profile.passwordHash,
    profile.password_hash,
    profile.tokenHash,
    profile.token_hash,
    profile.offlineTokenHash,
    profile.offline_token_hash
  );
  const passwordHash = rawHash || (profile.password ? await sha256(profile.password) : "");

  return {
    id: String(profile.id || username),
    username,
    displayName,
    role,
    active,
    passwordHash,
    permissions: toArray(profile.permissions),
    views: toArray(profile.views)
  };
}

function dedupeProfiles(profiles) {
  const byUser = new Map();
  profiles.forEach((profile) => {
    if (profile?.username) {
      byUser.set(profile.username, profile);
    }
  });
  return [...byUser.values()];
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value || "consulta").trim().toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

async function getStoredItem(key) {
  if (authStore) {
    return authStore.getItem(key);
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function setStoredItem(key, value) {
  if (authStore) {
    await authStore.setItem(key, value);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

async function removeStoredItem(key) {
  if (authStore) {
    await authStore.removeItem(key);
    return;
  }
  localStorage.removeItem(key);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
