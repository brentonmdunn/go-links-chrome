import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
test("permissions and exposed resources are limited to go navigation", () => {
  assert.deepEqual(manifest.permissions, ["storage", "declarativeNetRequestWithHostAccess"]);
  assert.deepEqual(manifest.host_permissions, ["http://go/*", "https://go/*"]);
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ["redirect.html"], matches: ["http://go/*", "https://go/*"] }]);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.content_scripts, undefined);
});
test("extension policy blocks external resources, frames, objects, base URLs and native form submissions", () => {
  const policy = manifest.content_security_policy.extension_pages;
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) assert.ok(policy.split(";").map(part => part.trim()).includes(directive), directive);
  assert.equal(policy.includes("unsafe-"), false);
});
