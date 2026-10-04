const KEY = "terpplan:popularity-sharing";
const EVENT = "terpplan:popularity-sharing-changed";

function read() {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { enabled?: boolean; id?: string } | null; } catch { return null; }
}
export function sharingEnabled() { return read()?.enabled === true && sharingId() !== null; }
export function sharingId() {
  const id = read()?.id;
  return typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) ? id : null;
}
export function setSharing(enabled: boolean) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ enabled, id: sharingId() ?? window.crypto.randomUUID() })); } catch { /* Sharing stays off if storage is blocked. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeSharing(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}
