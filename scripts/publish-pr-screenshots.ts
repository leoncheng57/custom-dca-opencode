import path from "node:path";
import { validateAndPublishBundle } from "./pr-screenshots.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const bundle = path.resolve(required("--bundle"));
const destination = path.resolve(required("--destination"));
const prNumber = Number(required("--pr-number"));
const sha = required("--sha");
const manifest = validateAndPublishBundle(bundle, destination, prNumber, sha);
console.log(JSON.stringify({ count: manifest.screenshots.length, files: manifest.screenshots.map(({ filename }) => filename) }));
