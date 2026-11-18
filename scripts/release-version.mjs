import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const version = app.version;
const requested = process.argv[2];

if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("The package version must be a numeric major.minor.patch version.");
}
if (lock.version !== version || lock.packages?.[""]?.version !== version) {
  throw new Error(`package-lock.json does not match package version ${version}.`);
}
if (requested && requested !== "--notes" && requested !== `v${version}`) {
  throw new Error(`Tag ${requested} does not match package version v${version}.`);
}

const sections = read("CHANGELOG.md").split(/(?=^## )/m);
const heading = `## [${version}] - `;
const matches = sections.filter((section) => section.startsWith(heading));
if (matches.length !== 1 || !/^\d{4}-\d{2}-\d{2}(?:\r?\n|$)/.test(matches[0].slice(heading.length))) {
  throw new Error(`The changelog needs one dated section for ${version}.`);
}
console.log(requested === "--notes" ? matches[0].trimEnd() : `Tally ${version} package, lockfile and changelog agree.`);
