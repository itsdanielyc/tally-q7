import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { compareGeometry, GEOMETRY_TOLERANCE } from "../tests/ui/geometry.ts";

const [incomingArgument = "incoming", destinationArgument = "tests/ui/__snapshots__"] = process.argv.slice(2);
const incoming = resolve(incomingArgument);
const destination = resolve(destinationArgument);
const runnerPlatforms = { ubuntu: "linux", windows: "win32", macos: "darwin" };
const captures = readdirSync(incoming, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("snapshots-"))
  .map(({ name }) => name).sort();

if (captures.length === 0) throw new Error("No per-runner snapshot captures were downloaded.");

const sharedGeometry = new Map();
const copied = new Set();

function copySnapshot(source, name) {
  const target = join(destination, name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copied.add(name);
}

for (const capture of captures) {
  const platform = runnerPlatforms[capture.split("-")[1]];
  if (!platform) throw new Error(`Unknown snapshot runner ${capture}.`);
  const directory = join(incoming, capture);
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = join(entry.parentPath, entry.name);
    const filename = relative(directory, source);
    if (entry.name.endsWith(".geometry.json")) {
      const measurements = sharedGeometry.get(filename) ?? [];
      measurements.push({ source, value: JSON.parse(readFileSync(source, "utf8")), capture });
      sharedGeometry.set(filename, measurements);
    } else if (entry.name.endsWith(`-${platform}.png`) || (entry.name.endsWith(".aria.yml") && !copied.has(filename))) {
      copySnapshot(source, filename);
    }
  }
}

for (const [filename, measurements] of sharedGeometry) {
  if (measurements.length !== captures.length) throw new Error(`Some runners did not capture ${filename}.`);
  const reference = measurements.find(({ value }) => measurements.every((capture) =>
    compareGeometry(value, capture.value, GEOMETRY_TOLERANCE).length === 0));
  if (!reference) throw new Error(`No capture of ${filename} is within ${GEOMETRY_TOLERANCE}px on all runners.`);
  console.log(`Shared geometry for ${filename} comes from ${reference.capture}.`);
  copySnapshot(reference.source, filename);
}
