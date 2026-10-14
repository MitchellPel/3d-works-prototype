import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Static files for a normal domain. No GitHub Pages subfolder.
process.env.HOST = "1";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(cli), "build"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
