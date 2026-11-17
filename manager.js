import { resolve, validateLinks } from "./links.js";

const $ = id => document.getElementById(id);
let links = {};
let previous = null;
function status(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Could not save changes. Reload the extension and try again.");
  await load();
}
function reset() {
  previous = null;
  $("link-form").reset();
  $("form-title").textContent = "Add a shortcut";
  $("save").textContent = "Add shortcut";
  $("cancel").hidden = true;
}
function button(text, action, className = "secondary") {
  const element = document.createElement("button");
  element.type = "button"; element.textContent = text; element.className = className;
  element.addEventListener("click", () => Promise.resolve().then(action).catch(error => status(error.message, true)));
  return element;
}
function render() {
  const query = $("filter").value.toLowerCase();
  const entries = Object.entries(links).sort(([a], [b]) => a.localeCompare(b));
  $("count").textContent = entries.length;
  $("links").replaceChildren();
  let shown = 0;
  for (const [name, target] of entries) {
    if (!`${name} ${target}`.toLowerCase().includes(query)) continue;
    shown++;
    const row = document.createElement("div"); row.className = "link-row";
    const text = document.createElement("div"); text.className = "link-text";
    const anchor = document.createElement("a"); anchor.className = "link-name";
    anchor.textContent = `go/${name}`; anchor.href = resolve(links, name);
    const destination = document.createElement("span"); destination.className = "link-target"; destination.textContent = target;
    text.append(anchor, destination);
    const actions = document.createElement("div"); actions.className = "row-actions";
    actions.append(button("Edit", () => {
      previous = name; $("name").value = name; $("target").value = target;
      $("form-title").textContent = `Edit go/${name}`; $("save").textContent = "Save changes"; $("cancel").hidden = false;
      $("target").focus(); $("link-form").scrollIntoView({ behavior: "smooth", block: "center" });
    }), button("Delete", async () => {
      if (!confirm(`Delete go/${name}?`)) return;
      await send({ type: "delete", name });
      if (previous === name) reset();
      status(`Deleted go/${name}.`);
    }, "secondary delete"));
    row.append(text, actions); $("links").append(row);
  }
  $("empty").hidden = shown > 0;
  $("empty").textContent = entries.length ? "No shortcuts match your filter." : "No shortcuts yet. Add your first one above.";
}
async function load() { links = validateLinks((await chrome.storage.local.get("links")).links || {}); render(); }

$("link-form").addEventListener("submit", async event => {
  event.preventDefault(); $("save").disabled = true;
  try {
    const name = $("name").value;
    await send({ type: "save", name, target: $("target").value, previous });
    reset(); status(`Saved go/${name.trim().toLowerCase()}.`);
  } catch (error) { status(error.message, true); }
  finally { $("save").disabled = false; }
});
$("cancel").addEventListener("click", reset);
$("filter").addEventListener("input", render);
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  try {
    const file = $("file").files[0]; if (!file) return;
    if (file.size > 5_000_000) throw new Error("Choose a JSON file smaller than 5 MB.");
    await send({ type: "import", links: validateLinks(JSON.parse(await file.text())), overwrite: $("overwrite").checked });
    status("Import complete. Existing shortcuts were " + ($("overwrite").checked ? "updated." : "kept."));
  } catch (error) { status(error.message, true); }
  finally { $("file").value = ""; }
});
$("export").addEventListener("click", async () => {
  try {
    await load();
    const blob = new Blob([JSON.stringify(links, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "links.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { status(error.message, true); }
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.links) load().catch(error => status(error.message, true)); });

try {
  // Starting the worker also initializes storage on a freshly loaded extension.
  await send({ type: "import", links: {} });
  const prefill = new URLSearchParams(location.search).get("name");
  if (prefill) { $("name").value = prefill; $("target").focus(); status(`go/${prefill} isn’t a link yet. Add a destination below.`); }
} catch (error) { status(error.message, true); }
