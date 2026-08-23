import path from "node:path";
import { stagePublicSite } from "./public-site.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const buildDirectory = path.resolve(required("--build"));
const pagesDirectory = path.resolve(required("--destination"));
const copied = stagePublicSite(buildDirectory, pagesDirectory);
console.log(JSON.stringify({ copied }));
