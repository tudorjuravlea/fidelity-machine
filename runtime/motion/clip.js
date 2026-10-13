// Footage as numbered still frames (a screen recording exported frame by frame), addressed by index so that it
// obeys the same rule as everything else in the kit: frame n is a function of time.
//
//   const rec = clip({ url: n => `assets/rec/${String(n).padStart(4, '0')}.jpg`, frames: 240 });
//   live draw:   const bmp = rec.at(n)          → the closest decoded frame at or before n (never waits)
//   exact draw:  const bmp = await rec.exact(n) → frame n itself (stills, films and poses wait for it)
//   rec.warm(n)  starts decoding the window that follows n, before a beat needs it
//
// Decoded frames are ImageBitmaps (flipped vertically for WebGL unless flipY: false), kept in a small
// least-recently-used store; the frame most recently handed out is never closed while a draw may still hold it.
export function clip({ url, frames, ahead = 18, behind = 3, flipY = true }) {
  const capacity = ahead + behind + 2;
  const store = new Map();   // index → { bitmap | null, pending: Promise | null }, oldest use first
  let lent = null;           // the bitmap last returned by at() or exact()
  const clampIndex = n => Math.min(frames - 1, Math.max(0, Math.round(Number(n) || 0)));

  const touch = (index, slot) => { store.delete(index); store.set(index, slot); return slot; };
  function evict() {
    for (const [index, slot] of store) {
      if (store.size <= capacity) return;
      if (slot.pending || slot.bitmap === lent) continue;   // never drop work in flight or a frame on loan
      slot.bitmap?.close();
      store.delete(index);
    }
  }
  function request(index) {
    const known = store.get(index);
    if (known) return touch(index, known);
    const slot = { bitmap: null, pending: null };
    slot.pending = fetch(url(index))
      .then(res => (res.ok ? res.blob() : Promise.reject(new Error(`frame ${index}: HTTP ${res.status} for ${url(index)}`))))
      .then(blob => createImageBitmap(blob, flipY ? { imageOrientation: 'flipY' } : {}))
      .then(bitmap => {
        slot.pending = null;
        if (store.get(index) === slot) slot.bitmap = bitmap; else bitmap.close();   // evicted while decoding
        return bitmap;
      }, err => {
        if (store.get(index) === slot) store.delete(index);   // a failed frame may be asked for again
        throw err;
      });
    slot.pending.catch(() => {});   // at() never awaits; exact() reports the failure to its caller
    store.set(index, slot);
    evict();
    return slot;
  }
  function warm(n, count = ahead) {
    const first = clampIndex(n), last = Math.min(frames - 1, first + count);
    for (let index = first; index <= last; index++) request(index);
  }

  const api = { frames, warm };
  return Object.assign(api, {
    at(n) {
      const index = clampIndex(n);
      warm(index);
      for (let back = 0; back <= behind && index - back >= 0; back++) {
        const bitmap = store.get(index - back)?.bitmap;
        if (bitmap) return (lent = bitmap);
      }
      return lent;   // nothing near is decoded yet: keep showing what was shown
    },
    async exact(n) {
      const slot = request(clampIndex(n));
      lent = slot.bitmap ?? await slot.pending;
      return lent;
    },
  });
}
