import test from "node:test";
import assert from "node:assert/strict";

const listeners = {};
const event = name => ({ addListener: callback => { listeners[name] = callback; } });
let state = {};
let rule;
let accessLevel;
const navigations = [];
globalThis.chrome = {
  runtime: {
    id: "test-id", getURL: path => `chrome-extension://test-id/${path}`,
    onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
    openOptionsPage: async () => {}
  },
  declarativeNetRequest: { updateDynamicRules: async options => { rule = options.addRules[0]; } },
  storage: { local: {
    setAccessLevel: async options => { accessLevel = options.accessLevel; },
    get: async () => { await new Promise(resolve => setImmediate(resolve)); return structuredClone(state); },
    set: async value => { state = structuredClone(value); }
  } },
  action: { onClicked: event("clicked") },
  omnibox: { setDefaultSuggestion: async () => {}, onInputChanged: event("changed"), onInputEntered: event("entered") },
  tabs: { update: async options => navigations.push(options), create: async options => navigations.push(options) }
};
await import("../background.js");
const sender = { id: "test-id", url: "chrome-extension://test-id/manager.html" };
function message(payload) { return new Promise(resolve => listeners.message(payload, sender, resolve)); }

test("worker initializes a narrow, persistent redirect rule and an empty link list", async () => {
  assert.deepEqual(await message({ type: "import", links: {} }), { ok: true });
  assert.deepEqual(state.links, {});
  assert.equal(accessLevel, "TRUSTED_CONTEXTS");
  assert.equal(rule.action.redirect.regexSubstitution, "chrome-extension://test-id/redirect.html#\\0");
  const pattern = new RegExp(rule.condition.regexFilter, "i");
  for (const url of ["http://go/", "https://go/gh/repo?tab=readme", "http://go:80/calendar"]) assert.ok(pattern.test(url));
  for (const url of ["https://google.com/", "http://go.evil.test/", "http://example.com/go/foo"]) assert.equal(pattern.test(url), false);
  assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
});
test("simultaneous saves retain both edits; duplicate names require editing", async () => {
  const results = await Promise.all([
    message({ type: "save", name: "one", target: "one.example" }),
    message({ type: "save", name: "two", target: "two.example" })
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(state.links.one, "https://one.example");
  assert.equal(state.links.two, "https://two.example");
  assert.equal((await message({ type: "save", name: "one", target: "other.example" })).ok, false);
});
test("imports merge without overwrite, validate atomically, and can explicitly overwrite", async () => {
  await message({ type: "import", links: { one: "new.example", three: "three.example" } });
  assert.equal(state.links.one, "https://one.example");
  assert.equal(state.links.three, "https://three.example");
  const before = structuredClone(state);
  assert.equal((await message({ type: "import", links: { four: "four.example", bad: "javascript:alert(1)" } })).ok, false);
  assert.deepEqual(state, before);
  await message({ type: "import", links: { one: "new.example" }, overwrite: true });
  assert.equal(state.links.one, "https://new.example");
});
test("rename, collision rejection, and deletion operate without losing unrelated data", async () => {
  await message({ type: "save", previous: "one", name: "renamed", target: "renamed.example" });
  assert.equal(state.links.one, undefined);
  assert.equal(state.links.renamed, "https://renamed.example");
  assert.equal((await message({ type: "save", previous: "renamed", name: "two", target: "collision.example" })).ok, false);
  assert.ok(state.links.renamed);
  await message({ type: "delete", name: "renamed" });
  assert.equal(state.links.renamed, undefined);
  assert.ok(state.links.two);
});
test("messages from outside the manager cannot modify storage", () => {
  for (const untrusted of [
    { id: "other", url: sender.url },
    { id: "test-id", url: "https://example.com/manager.html" },
    { id: "test-id", url: "chrome-extension://test-id/manager.html.evil" },
    { id: "test-id", url: "chrome-extension://test-id/redirect.html" },
    { id: "test-id", url: "chrome-extension://other/manager.html" },
    { ...sender, frameId: 1 },
    { id: "test-id", url: "invalid URL" }
  ]) assert.equal(listeners.message({ type: "delete", name: "two" }, untrusted, () => assert.fail()), undefined);
});
test("malformed messages cannot modify storage and valid messages still work afterwards", async () => {
  const before = structuredClone(state);
  for (const payload of [null, {}, { type: "unknown" }, { type: "import", links: {}, overwrite: "false" }, { type: "save", name: {}, target: "https://example.com" }]) {
    assert.equal((await message(payload)).ok, false);
    assert.deepEqual(state, before);
  }
  assert.equal((await message({ type: "import", links: {} })).ok, true);
});
test("combined configuration limits are enforced before imports are committed", async () => {
  const before = structuredClone(state);
  const incoming = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`imported${i}`, "https://example.com"]));
  const response = await message({ type: "import", links: incoming });
  assert.equal(response.ok, false);
  assert.match(response.error, /maximum/);
  assert.deepEqual(state, before);
});
