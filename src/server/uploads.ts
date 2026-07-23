// Upload constants and hostile-input checks: size
// cap, MIME allowlist, magic-byte verification, and the stored-name shape.
// Pure functions and constants only — filesystem work stays in the routes.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Slack for the early Content-Length DoS guard: a multipart body carrying a
 * legal max-size file exceeds the file size by boundary/header overhead, so
 * the early check only rejects clearly-oversized bodies. file.size is the
 * authoritative 413.
 */
export const UPLOAD_CONTENT_LENGTH_SLACK = 64 * 1024;

function startsWithBytes(data: Uint8Array, prefix: number[]): boolean {
  if (data.length < prefix.length) return false;
  return prefix.every((byte, i) => data[i] === byte);
}

function asciiAt(data: Uint8Array, start: number, text: string): boolean {
  if (data.length < start + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (data[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

interface UploadType {
  extension: string;
  contentType: string;
  matchesMagic: (data: Uint8Array) => boolean;
}

/** Allowlist keyed by *claimed* MIME; SVG/HTML (scriptable) never appear. */
export const UPLOAD_TYPES: Record<string, UploadType> = {
  "image/png": {
    extension: "png",
    contentType: "image/png",
    matchesMagic: (d) =>
      startsWithBytes(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  "image/jpeg": {
    extension: "jpg",
    contentType: "image/jpeg",
    matchesMagic: (d) => startsWithBytes(d, [0xff, 0xd8, 0xff]),
  },
  "image/webp": {
    extension: "webp",
    contentType: "image/webp",
    matchesMagic: (d) => asciiAt(d, 0, "RIFF") && asciiAt(d, 8, "WEBP"),
  },
  "image/gif": {
    extension: "gif",
    contentType: "image/gif",
    matchesMagic: (d) => asciiAt(d, 0, "GIF87a") || asciiAt(d, 0, "GIF89a"),
  },
};

/**
 * Extensions accepted in stored /uploads/ paths. Superset of what the upload
 * route generates ("jpeg" appears for hand-placed files like seed data) —
 * stored paths are validated by shape, not provenance.
 */
export const UPLOAD_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

const STORED_NAME = new RegExp(
  `^[A-Za-z0-9._-]+\\.(${UPLOAD_EXTENSIONS.join("|")})$`,
  "i",
);

/**
 * Windows reserved device names: a path whose stem is one of these refers to
 * a device (CON, COM1, …) regardless of extension, so "CON.png" opens the
 * console rather than a file. Rejected case-insensitively, including
 * multi-dot stems like "CON.x.png".
 */
const WINDOWS_DEVICE_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

/**
 * One path segment, safe charset, allowlisted extension, and never a Windows
 * device stem — used by the screenshot-payload validator, the upload-serving
 * route, and uploadFilePath() itself. ".." can't traverse (no "/" or "\\"
 * allowed) but is rejected outright anyway.
 */
export function isStoredUploadName(name: string): boolean {
  return (
    STORED_NAME.test(name) &&
    !name.includes("..") &&
    !WINDOWS_DEVICE_STEM.test(name)
  );
}

export function contentTypeForStoredName(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return `image/${extension}`;
}
