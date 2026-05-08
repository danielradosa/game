const SAVE_PREFIX = 'drift:save:';
const MANIFEST_KEY = 'drift:save_manifest';

export function fetchManifest() {
  try { const raw = localStorage.getItem(MANIFEST_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
export function persistManifest(m) {
  try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(m)); return true; } catch (e) { return false; }
}
export function getSave(id) {
  try { const raw = localStorage.getItem(SAVE_PREFIX + id); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
export function setSave(id, data) {
  try { localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(data)); return true; } catch (e) { return false; }
}
export function deleteSave(id) {
  try { localStorage.removeItem(SAVE_PREFIX + id); return true; } catch (e) { return false; }
}
