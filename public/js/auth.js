const OFFLINE_TOKEN_KEY = "opti_ams_offline_token_hash";

export async function cacheOfflineCredential(token) {
  if (!token) {
    return;
  }
  const hash = await sha256(token);
  localStorage.setItem(OFFLINE_TOKEN_KEY, hash);
}

export async function canLoginOffline(inputToken) {
  const savedHash = localStorage.getItem(OFFLINE_TOKEN_KEY);
  if (!savedHash || !inputToken) {
    return false;
  }

  const inputHash = await sha256(inputToken);
  return inputHash === savedHash;
}

export function verifyOfflineLogin() {
  // Hook inicial: integrar con flujo Firebase Auth para primer login online.
  return true;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
