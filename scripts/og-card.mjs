#!/usr/bin/env node
// Generate a post's 1200x630 social card from the skill's og-card.html template.
//
//   node scripts/og-card.mjs <slug> [--out <path>]
//
// Fills the template from the post's front matter (title, date, category) and
// the built page's "N min read", renders it at exactly 1200x630 with a headless
// Chrome/Edge over the DevTools protocol, and writes src/img/og/<slug>.png.
// No npm dependencies: it serves _site itself, drives whatever Chromium-family
// browser is installed, and talks CDP over Node's built-in WebSocket.
//
// Prereqs: `npm run build` first (the read time and fonts come from _site), and
// Chrome or Edge on PATH or in a standard location (override with $OG_BROWSER).
//
// Run it for every new post; AGENTS.md requires a card before the post ships.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(repo, "_site");
const TEMPLATE = path.join(repo, "scripts/og-card.html");

function die(msg) { console.error("og-card: " + msg); process.exit(1); }

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("-"));
if (!slug) die("usage: node scripts/og-card.mjs <slug> [--out <path>]");
const out = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(repo, "src/img/og", slug + ".png"));
if (!fs.existsSync(SITE)) die("no _site/; run `npm run build` first");

// ---- find the source markdown anywhere under src/ (its fileSlug === slug) ----
function findMd(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "_site" || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findMd(full); if (hit) return hit; }
    else if (e.name.endsWith(".md") && e.name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "") === slug) return full;
  }
  return null;
}
const mdPath = findMd(path.join(repo, "src"));
if (!mdPath) die(`no source file for slug "${slug}" under src/`);

// ---- front matter (minimal: key: "value") ----
const rawMd = fs.readFileSync(mdPath, "utf8").replace(/\r\n/g, "\n");
const fm = rawMd.startsWith("---\n") ? rawMd.slice(4, rawMd.indexOf("\n---", 4)) : "";
const field = (k) => { const m = fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
const title = field("title"), dateStr = field("date"), catKey = field("category");
if (!title || !dateStr || !catKey) die("front matter needs title, date, category");
const permalink = field("permalink");

const site = JSON.parse(fs.readFileSync(path.join(repo, "src/_data/site.json"), "utf8"));
const catName = site.categories?.[catKey]?.name;
if (!catName) die(`unknown category "${catKey}" (not in site.json)`);

const date = new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

let readTime = "";
const builtPages = [];
if (permalink) builtPages.push(path.join(SITE, permalink.replace(/\/+$/, ""), "index.html"));
builtPages.push(path.join(SITE, "blog", slug, "index.html"), path.join(SITE, slug, "index.html"));
for (const c of builtPages) {
  if (fs.existsSync(c)) { const m = fs.readFileSync(c, "utf8").match(/(\d+)\s*min read/); if (m) { readTime = m[0]; break; } }
}
if (!readTime) {
  const body = rawMd.slice(rawMd.indexOf("\n---", 4) + 4).replace(/<[^>]+>/g, " ");
  readTime = `${Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220))} min read`;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const card = fs.readFileSync(TEMPLATE, "utf8")
  .replaceAll("{{CATEGORY_KEY}}", catKey).replaceAll("{{CATEGORY_NAME}}", esc(catName))
  .replaceAll("{{TITLE}}", esc(title)).replaceAll("{{DATE}}", esc(date)).replaceAll("{{READ_TIME}}", esc(readTime));
const ogDir = path.join(SITE, "__og");
fs.mkdirSync(ogDir, { recursive: true });
const cardHtml = path.join(ogDir, slug + ".html");
fs.writeFileSync(cardHtml, card);

// ---- tiny static server over _site so CSS, fonts and images resolve ----
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let fp = path.join(SITE, decodeURIComponent(req.url.split("?")[0]));
  if (fp.endsWith(path.sep) || !path.extname(fp)) fp = path.join(fp, "index.html");
  if (!fp.startsWith(SITE)) return res.writeHead(403).end();
  fs.readFile(fp, (err, buf) => err ? res.writeHead(404).end() : res.writeHead(200, { "content-type": MIME[path.extname(fp)] || "application/octet-stream" }).end(buf));
});

function findBrowser() {
  if (process.env.OG_BROWSER && fs.existsSync(process.env.OG_BROWSER)) return process.env.OG_BROWSER;
  const byPlatform = {
    win32: ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  }[process.platform];
  if (byPlatform) { for (const c of byPlatform) if (fs.existsSync(c)) return c; return null; }
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    const w = spawnSync("which", [c]); if (w.status === 0) return String(w.stdout).trim().split("\n")[0];
  }
  return null;
}
function pngSize(file) { const b = fs.readFileSync(file); return b.length >= 24 && b.toString("ascii", 1, 4) === "PNG" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; }

// one request/response round-trip over a CDP WebSocket
function cdp(ws, pending, method, params = {}) {
  const id = cdp.n = (cdp.n || 0) + 1;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/__og/${slug}.html`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "og-card-"));
let child;
try {
  const browser = findBrowser();
  if (!browser) die("no Chrome/Edge found; set $OG_BROWSER to the executable");
  child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

  // the browser writes its chosen CDP port to DevToolsActivePort once ready
  const portFile = path.join(profile, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); if (fs.existsSync(portFile)) port = fs.readFileSync(portFile, "utf8").split("\n")[0].trim(); }
  if (!port) die("browser did not expose a DevTools port");

  const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  if (!target?.webSocketDebuggerUrl) die("no page target");

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const pending = new Map();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const loaded = new Promise((res) => { ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === "Page.loadEventFired") res();
  }); });
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", () => rej(new Error("CDP socket error"))); });

  await cdp(ws, pending, "Page.enable");
  await cdp(ws, pending, "Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await cdp(ws, pending, "Page.navigate", { url });
  await Promise.race([loaded, sleep(8000)]);
  await cdp(ws, pending, "Runtime.evaluate", { expression: "document.fonts ? document.fonts.ready.then(()=>true) : true", awaitPromise: true }).catch(() => {});
  await sleep(300);
  const shot = await cdp(ws, pending, "Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
  fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
  ws.close();

  const size = pngSize(out);
  if (!size) die("render produced no PNG");
  if (size.w !== 1200 || size.h !== 630) console.error(`og-card: WARNING ${size.w}x${size.h}, expected 1200x630. Resize before committing.`);
  console.log(`og-card: wrote ${path.relative(repo, out)} (${size.w}x${size.h})`);
  console.log(`         ${catName} / ${date} / ${readTime}`);
} finally {
  try { child?.kill(); } catch {}
  fs.rmSync(cardHtml, { force: true });
  try { fs.rmdirSync(ogDir); } catch {}
  try { await sleep(500); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  server.close();
}
