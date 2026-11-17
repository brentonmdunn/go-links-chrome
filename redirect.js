import { parseInput, resolve } from "./links.js";

try {
  const input = location.hash.slice(1);
  // This page is web-accessible; only accept URLs for the go hostname.
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "go") throw new Error("Invalid go/ URL.");
  const { links = {} } = await chrome.storage.local.get("links");
  const target = resolve(links, input);
  const path = parseInput(input).path.toLowerCase();
  location.replace(target || chrome.runtime.getURL("manager.html") + (path ? "?name=" + encodeURIComponent(path) : ""));
} catch (error) {
  document.getElementById("status").textContent = error.message;
}
