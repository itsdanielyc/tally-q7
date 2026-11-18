import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

const PRIVATE_FILE_MODE = 0o600;
const UNSUPPORTED_DIRECTORY_SYNC = new Set(["EINVAL", "ENOTSUP", "EOPNOTSUPP"]);

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(directory, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    // The new file is already visible. A failure returned here would leave the caller's state stale.
    if (!UNSUPPORTED_DIRECTORY_SYNC.has(errorCode(error) ?? "")) console.warn("Could not sync the destination directory.", error);
  }
}

/** Flushes a sibling file, atomically replaces the destination, and flushes its directory where supported. */
export async function writeAtomicFile(destination: string, staged: string, contents: string, replaceFile = rename): Promise<void> {
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  await rm(staged, { force: true });
  try {
    const file = await open(staged, "wx", PRIVATE_FILE_MODE);
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally { await file.close(); }
    await replaceFile(staged, destination);
  } catch (error) {
    await rm(staged, { force: true }).catch(() => undefined);
    throw error;
  }
  await syncDirectory(directory);
}
