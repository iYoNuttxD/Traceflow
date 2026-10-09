import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateInventory } from "./check-ui-inventory.mjs";
const document = readFileSync(
  new URL("../docs/design/UI_SURFACE_INVENTORY.md", import.meta.url),
  "utf8",
);
test("canonical inventory, including unquoted IDs, matches its summary", () => {
  assert.equal(validateInventory(document), document);
});
test("rejects stale counts instead of silently accepting documentation drift", () => {
  assert.throws(
    () =>
      validateInventory(
        document.replace(/Total surfaces: \d+/, "Total surfaces: 1"),
      ),
    /counts differ/,
  );
});
test("rejects noncanonical validation status and malformed rows", () => {
  assert.throws(
    () =>
      validateInventory(
        document.replace(
          "| TECHNICALLY VERIFIED |",
          "| VISUALLY APPROVED LOCAL |",
        ),
      ),
    /Invalid status/,
  );
  assert.throws(
    () =>
      validateInventory(
        document.replace(
          "| `INDICATORS-WORKSPACE` | Indicators |",
          "| `INDICATORS-WORKSPACE` |",
        ),
      ),
    /columns/,
  );
});
