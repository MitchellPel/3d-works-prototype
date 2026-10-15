import { fileURLToPath } from "node:url";

// Match the live Pages base path and the backend's permitted localhost origin.
process.env.PAGES = "1";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), "dev", "--port", "3000"];
await import(cli.href);
