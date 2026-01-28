import fs from "fs";
import path from "path";

/**
 * Sanitizes a URI by ensuring it has a protocol.
 * If no protocol is present, "https://" is prepended.
 * @param uri - The URI to sanitize
 * @returns The sanitized URI with protocol
 */
export function sanitizeUri(uri: string): string {
  uri = uri.trim();
  // If no protocol, add "https://"
  if (!uri.includes("://")) uri = "https://" + uri;
  return uri;
}

/**
 * Resolves a file path and verifies it exists.
 * @param filepath - The file path to sanitize
 * @returns The resolved absolute path if it exists, null otherwise
 */
export function sanitizePath(filepath: string): string | null {
  filepath = path.resolve(filepath);
  const exists = fs.existsSync(filepath);
  if (exists) {
    return filepath;
  } else {
    return null;
  }
}
