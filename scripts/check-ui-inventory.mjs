import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(
  new URL("../docs/design/UI_SURFACE_INVENTORY.md", import.meta.url),
);
const visual = [
  "C2 COMPLETE",
  "LEGACY",
  "HYBRID",
  "NOT REVIEWED",
  "NOT APPLICABLE",
];
const validation = [
  "VISUALLY APPROVED",
  "TECHNICALLY VERIFIED",
  "STRUCTURALLY IDENTIFIED",
  "ENVIRONMENT BLOCKED",
  "NOT VALIDATED",
];
const start = "<!-- INVENTORY_COUNTS_START -->";
const end = "<!-- INVENTORY_COUNTS_END -->";
export function inventorySummary(document) {
  const rows = [];
  const ids = new Set();
  let canonical = false;
  for (const line of document.split("\n")) {
    if (!line.startsWith("|")) {
      canonical = false;
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((value) => value.trim());
    if (cells[0] === "ID") {
      canonical = cells.includes("Validation Status");
      continue;
    }
    if (!canonical || /^:?-/.test(cells[0])) continue;
    if (cells.length !== 19)
      throw new Error(`Inventory row has ${cells.length} columns: ${cells[0]}`);
    const id = cells[0].replaceAll("`", "");
    if (ids.has(id)) throw new Error(`Duplicate surface: ${id}`);
    if (!visual.includes(cells[14]) || !validation.includes(cells[15]))
      throw new Error(`Invalid status: ${id}`);
    ids.add(id);
    rows.push(cells);
  }
  if (!rows.length) throw new Error("Canonical inventory is empty");
  const count = (column, value) =>
    rows.filter((row) => row[column] === value).length;
  return `\n\n- Total surfaces: ${rows.length}\n${visual.map((value) => `- \`${value}\`: ${count(14, value)}`).join("\n")}\n\n| Domain | Total |\n| --- | ---: |\n${[
    ...new Set(rows.map((row) => row[1])),
  ]
    .sort()
    .map((domain) => `| ${domain} | ${count(1, domain)} |`)
    .join(
      "\n",
    )}\n\nValidation evidence:\n\n${validation.map((value) => `- \`${value}\`: ${count(15, value)}`).join("\n")}\n\n`;
}
export function validateInventory(document, update = false) {
  if (document.split(start).length !== 2 || document.split(end).length !== 2)
    throw new Error("Expected unique count markers");
  const left = document.indexOf(start) + start.length;
  const right = document.indexOf(end);
  if (right < left) throw new Error("Count markers out of order");
  const summary = inventorySummary(document);
  if (!update && document.slice(left, right) !== summary)
    throw new Error(
      "Inventory counts differ. Run node scripts/check-ui-inventory.mjs --write",
    );
  return document.slice(0, left) + summary + document.slice(right);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const document = readFileSync(path, "utf8");
  const updated = validateInventory(document, process.argv.includes("--write"));
  if (process.argv.includes("--write")) writeFileSync(path, updated);
  console.log("UI inventory: canonical rows, taxonomy and counts verified");
}
