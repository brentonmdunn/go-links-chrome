const TEMPLATE = /\{\*(upper|lower)?\}/g;
const own = (object, key) => Object.hasOwn(object, key);

export function normalizeName(value) {
  if (typeof value !== "string") throw new Error("Shortcut must be text.");
  const name = value.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!name || name.startsWith("_") || /[\s?#\\\u0000-\u001f]/.test(name) || name.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Use a shortcut such as calendar or gh/work, without spaces, ? or #. Names starting with _ are reserved.");
  }
  return name;
}

export function normalizeTarget(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter a destination URL.");
  let target = value.trim();
  if (!target.includes("://")) {
    if (/^[^/]*:/.test(target) && !/^[^/:]+:\d+(?:\/|$)/.test(target)) throw new Error("Destination must use http:// or https://.");
    target = "https://" + target;
  }
  let url;
  try { url = new URL(target); } catch { throw new Error("Enter a valid destination URL."); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || /[\s\u0000-\u001f]/.test(target)) {
    throw new Error("Enter an http:// or https:// URL without credentials or spaces.");
  }
  if (url.hostname.toLowerCase() === "go") throw new Error("Destinations cannot point back to go/.");
  if (/[{}]/.test(target.replace(TEMPLATE, "")) || /[{}]/.test(url.host)) throw new Error("Supported templates: {*}, {*upper}, and {*lower}, after the hostname.");
  return target;
}

export function validateLinks(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object mapping shortcuts to URLs.");
  const links = Object.create(null);
  for (const [raw, value] of Object.entries(input)) {
    const name = normalizeName(raw);
    if (own(links, name)) throw new Error(`Duplicate shortcut: ${name}`);
    links[name] = normalizeTarget(value);
  }
  return links;
}

export function parseInput(input) {
  let text = input.trim();
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text);
    if (url.hostname !== "go" || url.username || url.password) throw new Error("Expected a go/ URL.");
    text = url.pathname + url.search + url.hash;
  } else text = text.replace(/^go\//i, "");
  const hashAt = text.indexOf("#");
  const hash = hashAt < 0 ? "" : text.slice(hashAt);
  if (hashAt >= 0) text = text.slice(0, hashAt);
  const queryAt = text.indexOf("?");
  const query = queryAt < 0 ? "" : text.slice(queryAt + 1);
  if (queryAt >= 0) text = text.slice(0, queryAt);
  return { path: text.replace(/^\/+|\/+$/g, ""), query, hash };
}

export function resolve(links, input) {
  const { path, query, hash } = parseInput(input);
  const parts = path ? path.split("/") : [];
  for (let count = parts.length; count > 0; count--) {
    const key = parts.slice(0, count).join("/").toLowerCase();
    if (!own(links, key)) continue;
    let target = normalizeTarget(links[key]);
    const rest = parts.slice(count).join("/");
    if (/\{\*(upper|lower)?\}/.test(target)) {
      target = rest ? target.replace(TEMPLATE, (_, mode) => mode === "upper" ? rest.toUpperCase() : mode === "lower" ? rest.toLowerCase() : rest) : new URL(target).origin;
    } else if (rest) {
      const url = new URL(target);
      url.pathname = url.pathname.replace(/\/+$/, "") + "/" + rest;
      target = url.href;
    }
    // Add the incoming query before a destination fragment, retaining raw escapes.
    const fragmentAt = target.indexOf("#");
    const fragment = hash || (fragmentAt >= 0 ? target.slice(fragmentAt) : "");
    if (fragmentAt >= 0) target = target.slice(0, fragmentAt);
    if (query) target += (target.includes("?") ? "&" : "?") + query;
    return target + fragment;
  }
  return null;
}
