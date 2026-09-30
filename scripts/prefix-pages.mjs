import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = "/3d-works-prototype";
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(html|css|js|txt)$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const file of walk("out")) {
  const text = readFileSync(file, "utf8");
  const next = text.replace(
    /(?<!\/3d-works-prototype)\/(green-bracket\.png|hero-bracket\.png|favicon\.svg)/g,
    `${base}/$1`,
  );
  if (next !== text) writeFileSync(file, next);
}

writeFileSync("out/.nojekyll", "");
console.log("prefixed");
