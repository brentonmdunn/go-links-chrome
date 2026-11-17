import { normalizeName, normalizeTarget, parseInput, resolve, validateLinks } from "./links.js";

export function redirectRule() {
  return {
    id: 1,
    priority: 1,
    action: { type: "redirect", redirect: { regexSubstitution: chrome.runtime.getURL("redirect.html") + "#\\0" } },
    condition: { regexFilter: "^https?://go(?::[0-9]+)?(/.*)?$", resourceTypes: ["main_frame"] }
  };
}

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1], addRules: [redirectRule()] });
  const { links } = await chrome.storage.local.get("links");
  if (links === undefined) {
    await chrome.storage.local.set({ links: {} });
  }
  await chrome.omnibox.setDefaultSuggestion({ description: "Open go/%s · leave blank to manage links" });
}

let ready;
function ensureReady() { return ready ??= initialize().catch(error => { ready = undefined; throw error; }); }
chrome.runtime.onInstalled.addListener(() => { ensureReady().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { ensureReady().catch(console.error); });
chrome.action.onClicked.addListener(() => { chrome.runtime.openOptionsPage().catch(console.error); });

function managerURL(input = "") {
  return chrome.runtime.getURL("manager.html") + (input ? "?name=" + encodeURIComponent(parseInput(input).path.toLowerCase()) : "");
}

// One writer prevents simultaneous manager tabs from losing each other's edits.
let mutations = Promise.resolve();
async function mutate(message) {
  await ensureReady();
  const { links: stored = {} } = await chrome.storage.local.get("links");
  const links = validateLinks(stored);
  if (message.type === "save") {
    const name = normalizeName(message.name);
    const previous = message.previous ? normalizeName(message.previous) : null;
    if (Object.hasOwn(links, name) && name !== previous) throw new Error(`go/${name} already exists. Edit that shortcut to change it.`);
    const target = normalizeTarget(message.target);
    if (previous && previous !== name) delete links[previous];
    links[name] = target;
  } else if (message.type === "delete") delete links[normalizeName(message.name)];
  else if (message.type === "import") {
    const incoming = validateLinks(message.links);
    for (const [name, target] of Object.entries(incoming)) {
      if (message.overwrite || !Object.hasOwn(links, name)) links[name] = target;
    }
  } else throw new Error("Unknown operation.");
  await chrome.storage.local.set({ links: validateLinks(links) });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url || sender.frameId > 0) return;
  let source;
  try { source = new URL(sender.url); } catch { return; }
  if (source.protocol !== "chrome-extension:" || source.host !== chrome.runtime.id || source.pathname !== "/manager.html") return;
  if (!message || typeof message !== "object" || !["save", "delete", "import"].includes(message.type)) {
    respond({ ok: false, error: "Unknown operation." });
    return;
  }
  if (message.overwrite !== undefined && typeof message.overwrite !== "boolean") {
    respond({ ok: false, error: "Overwrite must be a boolean." });
    return;
  }
  const task = mutations.then(() => mutate(message));
  mutations = task.catch(() => {});
  task.then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  ensureReady().then(async () => {
    const { links = {} } = await chrome.storage.local.get("links");
    const query = parseInput(text).path.toLowerCase();
    const escape = value => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
    suggest(Object.entries(links).filter(([key]) => key.startsWith(query)).sort(([a], [b]) => a.localeCompare(b)).slice(0, 6).map(([key, target]) => ({ content: key, description: `<match>go/${escape(key)}</match> <dim>→ ${escape(target)}</dim>` })));
  }).catch(console.error);
});
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  ensureReady().then(async () => {
    const { links = {} } = await chrome.storage.local.get("links");
    const url = resolve(links, text) || managerURL(text);
    if (disposition === "currentTab") await chrome.tabs.update({ url });
    else await chrome.tabs.create({ url, active: disposition !== "newBackgroundTab" });
  }).catch(console.error);
});
