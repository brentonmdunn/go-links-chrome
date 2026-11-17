import test from "node:test";
import assert from "node:assert/strict";
import { MAX_LINKS, MAX_NAME_LENGTH, MAX_TARGET_LENGTH, MAX_INPUT_LENGTH, normalizeName, normalizeTarget, validateLinks, parseInput, resolve } from "../links.js";

const links = {
  calendar: "https://calendar.google.com",
  gh: "https://github.com/me/{*}",
  "gh/work": "https://github.com/company/{*}",
  catalog: "https://catalog.ucsd.edu/courses/{*upper}.html",
  lower: "https://example.com/{*lower}",
  drive: "https://drive.google.com",
  search: "https://example.com/find?q={*}&source=go#results",
  query: "https://example.com/base?source=go#section"
};

test("longest-prefix lookup preserves remainder case, and supports nested overrides", () => {
  assert.equal(resolve(links, "go/GH/MyRepo/pull/42"), "https://github.com/me/MyRepo/pull/42");
  assert.equal(resolve(links, "gh/work/Repo"), "https://github.com/company/Repo");
  assert.equal(resolve(links, "gh/worker"), "https://github.com/me/worker");
  assert.equal(resolve(links, "go/unknown"), null);
  assert.equal(resolve(links, "go/"), null);
});
test("templates fold case and fall back to the site root without remainder", () => {
  assert.equal(resolve(links, "catalog/cse"), "https://catalog.ucsd.edu/courses/CSE.html");
  assert.equal(resolve(links, "lower/AB/Cd"), "https://example.com/ab/cd");
  assert.equal(resolve(links, "catalog"), "https://catalog.ucsd.edu");
  assert.equal(resolve(links, "gh"), "https://github.com");
});
test("paths, encoded characters, queries and fragments stay in their proper components", () => {
  assert.equal(resolve(links, "http://go/gh/My%20Repo?tab=readme&x=%2F#intro"), "https://github.com/me/My%20Repo?tab=readme&x=%2F#intro");
  assert.equal(resolve(links, "drive/folder/abc"), "https://drive.google.com/folder/abc");
  assert.equal(resolve(links, "query/folder?x=1"), "https://example.com/base/folder?source=go&x=1#section");
  assert.equal(resolve(links, "search/hello%20world?lang=en"), "https://example.com/find?q=hello%20world&source=go&lang=en#results");
});
test("input parsing handles full and shorthand URLs", () => {
  assert.deepEqual(parseInput("https://go/GH/repo?x=1#readme"), { path: "GH/repo", query: "x=1", hash: "#readme" });
  assert.throws(() => parseInput("https://other.example/gh"));
  assert.equal(normalizeName(" /GH/Work/ "), "gh/work");
  assert.equal(normalizeTarget("github.com/me/{*}"), "https://github.com/me/{*}");
  assert.equal(normalizeTarget("localhost:8080/test"), "https://localhost:8080/test");
});
test("imports reject malformed entries, dangerous schemes, loop targets, and duplicate normalized names", () => {
  for (const target of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "https://", "https://go/foo", "https://user:pass@example.com", "https://{*}.example.com", "https://example.com/{bad}"]) assert.throws(() => normalizeTarget(target), target);
  for (const name of ["", "_save", "foo?x", "foo#x", "foo bar", "a//b", "a/../b"]) assert.throws(() => normalizeName(name), name);
  for (const input of [[], null, "hello", { foo: 42 }, { GH: "github.com", gh: "example.com" }]) assert.throws(() => validateLinks(input));
  // Reserved underscore names must not become object prototype properties.
  assert.throws(() => validateLinks(JSON.parse('{"__proto__":"https://example.com"}')));
});
test("inherited object properties are never shortcuts", () => {
  assert.equal(resolve({}, "constructor"), null);
  assert.equal(resolve({}, "toString"), null);
});

test("configuration and navigation input enforce resource limits", () => {
  assert.throws(() => validateLinks(Object.fromEntries(Array.from({ length: MAX_LINKS + 1 }, (_, i) => [`s${i}`, "https://example.com"]))), /maximum/);
  assert.throws(() => normalizeName("a".repeat(MAX_NAME_LENGTH + 1)), /at most/);
  assert.throws(() => normalizeTarget("https://example.com/" + "a".repeat(MAX_TARGET_LENGTH)), /at most/);
  assert.throws(() => parseInput("a".repeat(MAX_INPUT_LENGTH + 1)), /excessively long/);
  const large = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`s${i}`, "https://example.com/" + "a".repeat(5000)]));
  assert.throws(() => validateLinks(large), /5 MB/);
});
test("ambiguous URLs, disguised credentials, control characters and encoded loop hosts are rejected", () => {
  for (const target of ["https://example.com\\@evil.example", "https://user%40company@example.com/", "https://%67%6f/path", "https://example.com/\u007f", "https://example.com/a\nb"]) assert.throws(() => normalizeTarget(target), target);
  for (const input of [null, {}, "gh/repo\n", "gh/repo\u0000", "gh/repo\u007f", "https://user:pass@go/gh/repo"]) assert.throws(() => parseInput(input));
});
test("hostile template remainders cannot change destination scheme or origin", () => {
  const variants = { path: "https://trusted.example/{*}", query: "https://trusted.example/?q={*}" };
  for (const key of Object.keys(variants)) {
    for (const rest of ["//evil.example", "\\\\evil.example", "@evil.example", "javascript:alert(1)", "%2f%2fevil.example", "../../other"]) {
      const result = new URL(resolve(variants, `${key}/${rest}`));
      assert.equal(result.origin, "https://trusted.example");
      assert.equal(result.username, "");
    }
  }
});
