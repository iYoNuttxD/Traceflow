#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
if (process.versions.node.split(".")[0] !== "22") {
  console.error("Node.js 22 is required.");
  process.exit(1);
}
const result = spawnSync(
  "python3",
  [
    fileURLToPath(new URL("./package_release.py", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
