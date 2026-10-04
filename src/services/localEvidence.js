/**
 * DHARAWATCH — evidence kept in the user's browser (localStorage).
 * There is no permanent database on the deployed site, so every evidence record a user creates is
 * also stored here; the Evidence page merges these with whatever the server still has.
 */
const KEY = 'dharawatch.evidence.v1';
const MAX_RECORDS = 200;

export function loadLocalEvidence() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
}

export function saveLocalEvidence(record) {
  if (!record?.id) return;
  try {
    const list = loadLocalEvidence().filter((e) => e.id !== record.id);
    list.unshift({ ...record, storedInBrowser: true });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
  } catch (e) {
    console.warn('[localEvidence] could not save (storage full or blocked):', e.message);
  }
}

export function deleteLocalEvidence(id) {
  try { localStorage.setItem(KEY, JSON.stringify(loadLocalEvidence().filter((e) => e.id !== id))); } catch (_) { /* ignore */ }
}

/** Small JPEG data URL of an image so the record keeps its photo after the server copy is gone. */
export async function imageThumbnail(url, max = 480) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (_) {
    return null;
  }
}
