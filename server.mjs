import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DATA_DIR, HISTORY_START_DATE, OFFICIAL_SOURCE_CATALOG, readStore, runCollection } from "./collector.mjs";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DEPLOYMENT = process.env.PUBLIC_DEPLOYMENT === "true";
const SOURCE_CACHE_DIR = path.join(DATA_DIR, "source-cache");
const SOURCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE_FAILURE_CACHE_TTL_MS = 10 * 60 * 1000;
const SOURCE_REQUEST_GAP_MS = 2500;
let collectionRunning = false;
let lastSourceRequestAt = 0;
let sourceRequestQueue = Promise.resolve();
const sourceMemoryCache = new Map();

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function json(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function summary(projects) {
  const amounts = projects.map((project) => Number(project.amountValue) || 0).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return { total: projects.length, newCount: projects.filter((project) => project.date === today).length, publicAmountWan: amounts.reduce((sum, value) => sum + value, 0), maxAmountWan: Math.max(0, ...amounts), undisclosed: projects.filter((project) => project.amount === "未公布").length, typeCounts: projects.reduce((counts, project) => { counts[project.type] = (counts[project.type] || 0) + 1; return counts; }, {}) };
}

async function body(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  try { return data ? JSON.parse(data) : {}; } catch { return {}; }
}

function sourceCacheKey(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function friendlySourcePage(project, reason, cacheAge = null) {
  const ageText = cacheAge ? `；已缓存版本距今 ${Math.round(cacheAge / 86400000)} 天` : "";
  const safeTitle = escapeHtml(project.title || "项目来源");
  const safeReason = escapeHtml(reason);
  const sourceUrl = /^https?:\/\//i.test(project.sourceUrl || "") ? escapeHtml(project.sourceUrl) : "#";
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>来源暂时不可用 · ${safeTitle}</title><style>body{margin:0;padding:48px 24px;color:#173238;background:#f7faf9;font-family:Arial,"Microsoft YaHei",sans-serif}.box{max-width:680px;margin:auto;padding:32px;border:1px solid #dce8e4;border-radius:8px;background:#fff;box-shadow:0 12px 30px #17323812}h1{font-size:22px;font-weight:700}p{color:#6d8385;line-height:1.8;font-size:14px}.tag{display:inline-block;padding:6px 9px;color:#a46e29;background:#fff3dd;border-radius:4px;font-size:12px}a{color:#0b6b70;font-weight:700}</style><div class="box"><span class="tag">来源访问提示</span><h1>${safeTitle}</h1><p>来源平台暂时没有返回公告正文，系统没有把错误 JSON 当作原文展示。</p><p>原因：${safeReason}${ageText}</p><p>请稍后从工作台重新打开。系统会优先使用已缓存的公开正文；原始来源：<a href="${sourceUrl}" target="_blank" rel="noreferrer">打开 ${escapeHtml(project.source)}</a></p></div></html>`;
}

async function readCachedSource(project) {
  const key = sourceCacheKey(project.sourceUrl);
  const memory = sourceMemoryCache.get(key);
  const memoryTtl = memory?.ok ? SOURCE_CACHE_TTL_MS : SOURCE_FAILURE_CACHE_TTL_MS;
  if (memory && Date.now() - memory.fetchedAt < memoryTtl) return { ...memory, cached: true };
  const cachePath = path.join(SOURCE_CACHE_DIR, `${key}.html`);
  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < SOURCE_CACHE_TTL_MS) {
      const html = await fs.readFile(cachePath, "utf8");
      const cached = { ok: true, html, fetchedAt: stat.mtimeMs, cached: true };
      sourceMemoryCache.set(key, cached);
      return cached;
    }
  } catch {}
  return null;
}

async function fetchSource(project) {
  const cached = await readCachedSource(project);
  if (cached) return cached;
  const key = sourceCacheKey(project.sourceUrl);
  const request = sourceRequestQueue.then(async () => {
    const queuedCache = await readCachedSource(project);
    if (queuedCache) return queuedCache;
    const elapsed = Date.now() - lastSourceRequestAt;
    if (elapsed < SOURCE_REQUEST_GAP_MS) await new Promise((resolve) => setTimeout(resolve, SOURCE_REQUEST_GAP_MS - elapsed));
    lastSourceRequestAt = Date.now();
    try {
      const response = await fetch(project.sourceUrl, { headers: { "User-Agent": "SatcomProcurementIntelligence/1.0", Accept: "text/html,application/xhtml+xml,application/json" } });
      const text = await response.text();
      let result;
      if (!response.ok) result = { ok: false, reason: `HTTP ${response.status}`, fetchedAt: Date.now() };
      else {
        let payload;
        try { payload = JSON.parse(text); } catch {}
        if (payload?.code && payload.code !== 200) result = { ok: false, reason: payload.message || `来源返回 code ${payload.code}`, fetchedAt: Date.now() };
        else if (/访问过于频繁|频繁访问|系统繁忙|请稍后再试/.test(text)) result = { ok: false, reason: "来源平台触发了访问频率限制", fetchedAt: Date.now() };
      }
      if (result) {
        sourceMemoryCache.set(key, result);
        return result;
      }
      await fs.mkdir(SOURCE_CACHE_DIR, { recursive: true });
      await fs.writeFile(path.join(SOURCE_CACHE_DIR, `${key}.html`), text, "utf8");
      result = { ok: true, html: text, fetchedAt: Date.now(), cached: false };
      sourceMemoryCache.set(key, result);
      return result;
    } catch (error) {
      const result = { ok: false, reason: error.message, fetchedAt: Date.now() };
      sourceMemoryCache.set(key, result);
      return result;
    }
  });
  sourceRequestQueue = request.catch(() => {});
  return request;
}

async function serveProjectSource(res, project) {
  const result = await fetchSource(project);
  const sourceHeaders = { ...SECURITY_HEADERS, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:; object-src 'none'; frame-ancestors 'none'" };
  if (!result.ok) {
    res.writeHead(200, { ...sourceHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Source-Cache": "unavailable" });
    res.end(friendlySourcePage(project, result.reason));
    return;
  }
  let html = result.html;
  if (/<head[^>]*>/i.test(html) && !/<base\b/i.test(html)) html = html.replace(/<head[^>]*>/i, `$&<base href="${escapeHtml(project.sourceUrl)}">`);
  res.writeHead(200, { ...sourceHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Source-Cache": result.cached ? "hit" : "miss" });
  res.end(html);
}

async function serveStatic(req, res, pathname) {
  const publicFiles = new Set(["/index.html", "/app.js", "/styles.css"]);
  const requested = pathname === "/" ? "/index.html" : pathname;
  if (!publicFiles.has(requested)) return json(res, 404, { error: "not_found" });
  const filePath = path.resolve(ROOT_DIR, `.${requested}`);
  if (!filePath.startsWith(ROOT_DIR)) return json(res, 403, { error: "forbidden" });
  try {
    const content = await fs.readFile(filePath);
    const type = filePath.endsWith(".html") ? "text/html; charset=utf-8" : filePath.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(content);
  } catch { json(res, 404, { error: "not found" }); }
}

function collectionAuthorized(req) {
  if (!PUBLIC_DEPLOYMENT && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return true;
  const expected = process.env.COLLECT_TOKEN || "";
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname === "/api/health") {
      const store = await readStore();
      return json(res, 200, { ok: true, collectionRunning, publicDeployment: PUBLIC_DEPLOYMENT, sourceCatalog: OFFICIAL_SOURCE_CATALOG, meta: store.meta });
    }
    if (url.pathname === "/api/projects" && req.method === "GET") {
      const store = await readStore();
      const query = (url.searchParams.get("q") || "").trim().toLowerCase();
      const projects = query ? store.projects.filter((project) => `${project.title} ${project.buyer} ${project.content}`.toLowerCase().includes(query)) : store.projects;
      return json(res, 200, { projects, summary: summary(store.projects), sourceCatalog: OFFICIAL_SOURCE_CATALOG, meta: store.meta });
    }
    const sourceMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/source$/);
    if (sourceMatch && req.method === "GET") {
      const projectId = decodeURIComponent(sourceMatch[1]);
      const store = await readStore();
      const project = store.projects.find((item) => item.id === projectId);
      if (!project) return json(res, 404, { error: "project_not_found" });
      return serveProjectSource(res, project);
    }
    if (url.pathname === "/api/collect" && req.method === "POST") {
      if (!collectionAuthorized(req)) return json(res, 403, { ok: false, message: "公网手动采集已禁用" });
      if (collectionRunning) return json(res, 409, { ok: false, message: "采集任务正在运行" });
      const payload = await body(req);
      collectionRunning = true;
      runCollection({ full: Boolean(payload.full), startDate: payload.startDate || (payload.full ? HISTORY_START_DATE : undefined), endDate: payload.endDate || undefined }).then(() => { collectionRunning = false; }).catch((error) => { collectionRunning = false; console.error(`[collector] ${error.message}`); });
      return json(res, 202, { ok: true, message: "采集任务已加入队列" });
    }
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(`[server] ${error.stack || error.message}`);
    return json(res, 500, { error: "internal_error", message: error.message });
  }
});

function scheduleDaily() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const wait = next.getTime() - now.getTime();
  setTimeout(() => { runScheduledCollection(); setInterval(runScheduledCollection, 24 * 60 * 60 * 1000); }, wait);
  console.log(`[scheduler] next collection: ${next.toLocaleString("zh-CN")}`);
}

async function runScheduledCollection() {
  if (collectionRunning) return;
  collectionRunning = true;
  try { const store = await runCollection({ full: false }); console.log(`[collector] ${store.meta.lastRunMessage}`); }
  catch (error) { console.error(`[collector] failed: ${error.message}`); }
  finally { collectionRunning = false; }
}

server.listen(PORT, HOST, () => {
  console.log(`Satcom intelligence desk: http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
  scheduleDaily();
  if (process.env.COLLECT_ON_START === "true") setTimeout(runScheduledCollection, 1200);
});
