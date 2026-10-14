/**
 * Sanitize an uploader-chosen filename before handing it to a save sink
 * (`a.download`, showSaveFilePicker). Browsers already strip path
 * components, but control characters, reserved glyphs, trailing dots/spaces
 * (Windows), overlong names, and bidi-override spoofing
 * ("invoice.pdf<U+202E>exe") still get through on some engines.
 * Display strings are NOT routed through here: React escapes those, so the
 * UI keeps showing the original name.
 */
export function sanitizeDownloadFilename(name: string, fallback = 'download'): string {
  if (typeof name !== 'string') {
    return fallback;
  }
  let out = name
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  if (!out || out === '.' || out === '..') {
    return fallback;
  }
  if (out.length > 200) {
    const dot = out.lastIndexOf('.');
    const ext = dot > 0 ? out.slice(dot, dot + 21) : '';
    out = out.slice(0, 200 - ext.length).replace(/[. ]+$/, '') + ext;
  }
  return out || fallback;
}
