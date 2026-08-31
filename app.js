let projects = [];
const state = { query: "", filter: "all", type: "all", amount: "all", view: "overview" };
const staticDeployment = document.querySelector('meta[name="deployment-mode"]')?.content === "static";
let publicDeployment = false;
let serviceModeReady = false;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function safeHref(value) { const url = String(value ?? ""); return /^https?:\/\//i.test(url) || url.startsWith("/api/") ? escapeHtml(url) : "#"; }

function typeClass(type) { if (type.includes("中标") || type.includes("成交")) return "result"; if (type.includes("意向") || type.includes("征求")) return "intent"; return ""; }
function visibleProjects() {
  return projects.filter((project) => {
    const searchable = `${project.title} ${project.buyer} ${project.content} ${project.source}`.toLowerCase();
    const queryMatch = !state.query || searchable.includes(state.query.toLowerCase());
    const statusMatch = state.filter === "all" || (state.filter === "high" && project.amountValue >= 500) || (state.filter === "watch" && ["watch", "urgent"].includes(project.status));
    const typeMatch = state.type === "all" || project.type === state.type;
    const amountMatch = state.amount === "all" || (state.amount === "high" && project.amountValue >= 100) || (state.amount === "low" && project.amountValue < 100);
    return queryMatch && statusMatch && typeMatch && amountMatch;
  });
}

function projectRow(project, library = false) {
  const moreCell = `<td class="row-more">→</td>`;
  const first = `<td><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.buyer)}</span></td>`;
  const type = `<td><span class="type-badge ${escapeHtml(typeClass(project.type))}">${escapeHtml(project.type)}</span></td>`;
  const amount = `<td class="amount-cell ${project.amount === "未公布" ? "undisclosed" : ""}">${escapeHtml(project.amount)}</td>`;
  const date = `<td class="date-cell">${escapeHtml(String(project.date).replaceAll("-", "."))}</td>`;
  const status = `<td><span class="status-label ${escapeHtml(project.status)}">${escapeHtml(project.statusText)}</span></td>`;
  if (library) return `<tr data-id="${escapeHtml(project.id)}">${first}${type}<td>${escapeHtml(project.content)}</td>${amount}${date}${status}${moreCell}</tr>`;
  return `<tr data-id="${escapeHtml(project.id)}">${first}${type}${amount}${date}${status}${moreCell}</tr>`;
}

function renderTables() {
  const results = visibleProjects();
  $("#projectRows").innerHTML = results.slice(0, 6).map((project) => projectRow(project)).join("") || `<tr><td colspan="6" class="empty-state">没有匹配的公开记录</td></tr>`;
  $("#libraryRows").innerHTML = results.map((project) => projectRow(project, true)).join("") || `<tr><td colspan="7" class="empty-state">没有匹配的公开记录</td></tr>`;
  $("#resultCount").textContent = projects.length ? `显示 ${Math.min(results.length, 6)} 条近期记录` : "暂无可核验的真实记录";
  $$('tr[data-id]').forEach((row) => row.addEventListener("click", () => openDrawer(row.dataset.id)));
  renderInsights();
  renderKeywords();
  renderTrend();
}

function renderInsights() {
  const container = $("#insightList");
  if (!container) return;
  const records = projects.filter((project) => Number(project.amountValue) > 0 && project.sourceUrl).sort((a, b) => Number(b.amountValue) - Number(a.amountValue)).slice(0, 3);
  container.innerHTML = records.length ? records.map((project, index) => `<button class="insight-item" data-id="${escapeHtml(project.id)}" type="button"><span class="insight-num">${String(index + 1).padStart(2, "0")}</span><span class="insight-content"><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.amount)} · ${escapeHtml(project.source)}</span><em>已公开金额</em></span><span class="insight-arrow">→</span></button>`).join("") : `<div class="empty-state">暂无包含公开金额的真实记录</div>`;
  $$("#insightList .insight-item").forEach((item) => item.addEventListener("click", () => openDrawer(item.dataset.id)));
}

function renderKeywords() {
  const rows = $$(".keyword-row[data-keyword]");
  const counts = rows.map((row) => projects.filter((project) => `${project.title} ${project.content}`.toLowerCase().includes(row.dataset.keyword.toLowerCase())).length);
  const max = Math.max(1, ...counts);
  rows.forEach((row, index) => { row.querySelector("i").style.width = `${Math.round((counts[index] / max) * 100)}%`; row.querySelector("strong").textContent = counts[index]; });
}

function renderTrend() {
  const bars = $("#trendBars");
  const note = $("#trendNote");
  if (!bars || !note) return;
  const dates = projects.map((project) => project.date).filter((date) => /^20\d{2}-\d{2}-\d{2}$/.test(date)).sort();
  if (!dates.length) { bars.innerHTML = `<div class="empty-state">暂无真实数据</div>`; note.textContent = "趋势仅根据已采集并可追溯的公告生成"; return; }
  const range = $("#trendRange")?.value.includes("12") ? 12 : 6;
  const latest = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const months = [];
  for (let offset = range - 1; offset >= 0; offset -= 1) { const month = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - offset, 1)); const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`; months.push({ key, label: `${String(month.getUTCMonth() + 1).padStart(2, "0")}月`, count: projects.filter((project) => project.date.startsWith(key)).length }); }
  const max = Math.max(1, ...months.map((month) => month.count));
  bars.innerHTML = months.map((month) => { const height = month.count ? Math.max(5, Math.round((month.count / max) * 100)) : 0; return `<div class="bar-col${month.key === months[months.length - 1].key ? " selected" : ""}"><span class="bar-value" style="bottom:calc(${height}% + 21px)">${month.count}</span><i style="height:${height}%"></i><small>${month.label}</small></div>`; }).join("");
  note.textContent = `趋势基于 ${projects.length} 条已收录且带原始公告链接的记录`;
}

function openDrawer(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  const sourceHref = !staticDeployment && project.id.startsWith("ggzy-") ? `/api/projects/${encodeURIComponent(project.id)}/source` : project.sourceUrl;
  const rawSourceHref = project.sourceUrl;
  $("#drawerContent").innerHTML = `<div class="drawer-tags"><span class="type-badge ${escapeHtml(typeClass(project.type))}">${escapeHtml(project.type)}</span><span class="status-label ${escapeHtml(project.status)}">${escapeHtml(project.statusText)}</span></div><h2 class="drawer-title">${escapeHtml(project.title)}</h2><p class="drawer-subtitle">${escapeHtml(project.buyer)}</p><section class="drawer-section"><h3>核心字段</h3><dl><div class="drawer-field"><dt>采购人 / 招标人</dt><dd>${escapeHtml(project.buyer)}</dd></div><div class="drawer-field"><dt>采购内容</dt><dd>${escapeHtml(project.content)}</dd></div><div class="drawer-field"><dt>预算 / 采购金额</dt><dd class="amount">${escapeHtml(project.amount)}</dd></div><div class="drawer-field"><dt>发布日期</dt><dd>${escapeHtml(String(project.date).replaceAll("-", "."))}</dd></div>${project.winner ? `<div class="drawer-field"><dt>中标人</dt><dd>${escapeHtml(project.winner)}</dd></div><div class="drawer-field"><dt>中标金额</dt><dd class="amount">${escapeHtml(project.winnerAmount)}</dd></div>` : ""}${project.candidates ? `<div class="drawer-field"><dt>候选人前三名</dt><dd>${project.candidates.map((candidate, index) => `${index + 1}. ${escapeHtml(candidate)}`).join("<br />")}</dd></div>` : ""}</dl></section><section class="drawer-section"><h3>来源核验</h3><p class="drawer-subtitle" style="line-height:1.8">${escapeHtml(project.note)}</p><p class="drawer-subtitle" style="line-height:1.8">采集时间：${escapeHtml(project.collectedAt || "未公布")}</p></section><section class="drawer-section"><h3>原始公告文件</h3><div class="drawer-source"><span>${escapeHtml(project.source)}</span><span class="drawer-source-links"><a href="${safeHref(sourceHref)}" target="_blank" rel="noreferrer">打开核验页 ↗</a>${sourceHref !== rawSourceHref ? `<a href="${safeHref(rawSourceHref)}" target="_blank" rel="noreferrer" title="${escapeHtml(rawSourceHref)}">原始公告链接 ↗</a>` : ""}</span></div></section>`;
  document.body.classList.add("drawer-open");
  $("#detailDrawer").setAttribute("aria-hidden", "false");
}
function closeDrawer() { document.body.classList.remove("drawer-open"); $("#detailDrawer").setAttribute("aria-hidden", "true"); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }
function switchView(view) { state.view = view; $$(".view").forEach((item) => item.classList.add("hidden")); $(`#${view}View`).classList.remove("hidden"); $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view)); const labels = { overview: "情报总览", projects: "项目库", watchlist: "重点关注", rules: "关键词规则", sources: "采集来源" }; $("#breadcrumbTitle").textContent = labels[view]; if (view === "watchlist") renderWatchlist(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function renderWatchlist() { const pending = projects.filter((project) => project.status === "watch"); const disclosed = projects.filter((project) => Number(project.amountValue) > 0); const candidateRecords = projects.filter((project) => Array.isArray(project.candidates) && project.candidates.length > 0); $("#watchAmountCount").textContent = disclosed.length; $("#watchAmountNote").textContent = disclosed.length ? `金额合计 ${disclosed.reduce((sum, project) => sum + Number(project.amountValue || 0), 0).toLocaleString("zh-CN")} 万元` : "暂无公开金额"; $("#watchCandidateCount").textContent = candidateRecords.length; $("#watchPendingCount").textContent = pending.length; $("#watchlistItems").innerHTML = pending.map((project) => `<button class="watch-item" data-id="${escapeHtml(project.id)}" type="button"><span class="insight-num">复核</span><span class="watch-item-main"><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.buyer)} · ${escapeHtml(project.source)}</span></span><span class="watch-item-time">${escapeHtml(String(project.date).replaceAll("-", "."))}</span></button>`).join("") || `<div class="empty-state">暂无待核验的真实记录</div>`; $$(".watch-item").forEach((item) => item.addEventListener("click", () => openDrawer(item.dataset.id))); }
function exportCsv() { const rows = visibleProjects(); const header = ["公告类型", "项目名称", "采购人/招标人", "采购内容", "预算/采购金额", "发布日期", "信息来源"]; const body = rows.map((project) => [project.type, project.title, project.buyer, project.content, project.amount, project.date, project.source]); const csv = [header, ...body].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `卫星通信招标情报-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast(`已导出 ${rows.length} 条当前筛选记录`); }
function formatDataUpdateTime(value) { if (!value) return "未获取"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "时间不可用"; const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {}); return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`; }
function updateDataUpdateTime(value) { const element = $("#dataUpdateTime"); if (element) element.textContent = formatDataUpdateTime(value); }
function updateSummary(summary = {}) { const total = Number(summary.total) || projects.length; const newCount = Number(summary.newCount) || 0; const pending = projects.filter((project) => ["watch", "urgent"].includes(project.status)).length; const counts = document.querySelectorAll(".metric-number[data-metric]"); if (counts[0]) counts[0].textContent = total; if (counts[1]) counts[1].textContent = newCount; if (counts[2]) counts[2].textContent = pending; const amount = document.querySelector(".amount-number"); if (amount) amount.innerHTML = `¥ ${Number(summary.publicAmountWan || 0).toLocaleString("zh-CN")}<span>万</span>`; const overviewCount = $("#overviewNavCount"); const projectsCount = $("#projectsNavCount"); if (overviewCount) overviewCount.textContent = Math.min(total, 6); if (projectsCount) projectsCount.textContent = total; const allCount = $("#allFilterCount"); const highCount = $("#highFilterCount"); const watchCount = $("#watchFilterCount"); if (allCount) allCount.textContent = total; if (highCount) highCount.textContent = projects.filter((project) => Number(project.amountValue) > 0).length; if (watchCount) watchCount.textContent = pending; renderWatchlist(); }
function renderSourceCatalog(catalog = [], sourceStates = {}) { const container = $("#sourceCatalogRows"); if (!container) return; const rows = Array.isArray(catalog) ? catalog : []; const colors = ["cyan", "blue", "orange", "purple"]; container.innerHTML = rows.length ? rows.map((source, index) => { const runtime = sourceStates[source.id]; let label = "已接入，待检查"; let statusClass = "pending-label"; let detail = source.method || "已登记官方入口"; if (source.status === "cataloged") { label = "已登记，待适配"; statusClass = "cataloged-label"; } else if (runtime?.status === "success") { label = "正常"; statusClass = "online-label"; detail = `${runtime.records || 0} 条记录 · ${runtime.pagesScanned || 0} 页`; } else if (runtime?.status === "blocked") { label = "验证码/访问受限"; detail = (runtime.warnings || []).join("；") || "未绕过访问限制"; } else if (runtime?.status === "partial") { label = "部分完成"; detail = `${runtime.records || 0} 条记录 · ${runtime.pagesScanned || 0} 页`; } return `<div class="source-table-row" data-source-id="${escapeHtml(source.id)}"><strong><span class="source-logo ${colors[index % colors.length]}">${escapeHtml(String(source.name || "源").slice(0, 1))}</span><a href="${safeHref(source.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a></strong><span>${escapeHtml(source.category)}</span><span class="${statusClass}">● ${escapeHtml(label)}</span><span title="${escapeHtml(detail)}">${escapeHtml(detail)}</span></div>`; }).join("") : `<div class="empty-state">暂无来源目录</div>`; }
function updateSourceStates(sourceStates = {}, catalog = []) { const entries = Object.entries(sourceStates); const success = entries.filter(([, state]) => state.status === "success").length; const configured = entries.length; const registered = Array.isArray(catalog) && catalog.length ? catalog.length : configured; const pending = Math.max(registered - success, 0); $("#sourceCountMetric").textContent = configured; $("#sourceSuccessCount").textContent = success; $("#sourcePendingCount").textContent = Math.max(configured - success, 0); $("#sourceHealthMetric").textContent = `${success}/${configured || 0} 正常`; $("#sourceSummaryCount").textContent = registered; $("#sourceSummaryOnline").textContent = success; $("#sourceSummaryPending").textContent = pending; $("#sourceSummaryRecords").textContent = entries.reduce((sum, [, state]) => sum + (Number(state.records) || 0), 0); renderSourceCatalog(catalog, sourceStates); entries.forEach(([id, state]) => { const row = document.querySelector(`.source-row[data-source-id="${id}"]`); if (!row) return; const detail = `${state.records || 0} 条记录 · ${state.pagesScanned || 0} 页`; const label = state.status === "success" ? "正常" : state.status === "blocked" ? "需人工验证" : "部分完成"; row.querySelector("div span").textContent = detail; row.querySelector("i").className = state.status === "success" ? "status-online" : "status-pending"; }); }
async function loadApiData() { try { const response = await fetch(staticDeployment ? "data.json" : "/api/projects", { cache: "no-store" }); if (!response.ok) throw new Error(`数据接口 ${response.status}`); const payload = await response.json(); updateDataUpdateTime(payload.meta?.lastUpdatedAt || payload.meta?.lastRunAt); updateSourceStates(payload.meta?.sourceStates, payload.sourceCatalog); const partial = payload.meta?.lastRunStatus === "partial"; $("#bannerLabel").textContent = partial ? "部分采集完成" : "真实数据已连接"; $("#bannerCopy").textContent = `${payload.meta?.lastRunMessage || "已读取公开采集数据"}。${payload.meta?.dateRange ? `覆盖范围：${payload.meta.dateRange}。` : ""}`; if (Array.isArray(payload.projects)) projects = payload.projects; updateSummary(payload.summary || {}); renderTables(); if (partial) showToast("本次采集部分完成，页面只展示已保存的真实记录"); } catch (error) { updateDataUpdateTime(null); projects = []; $("#bannerLabel").textContent = "真实数据服务不可用"; $("#bannerCopy").textContent = "当前未能读取数据文件，页面不会展示演示或虚构记录。"; updateSourceStates({}, []); updateSummary({}); renderTables(); showToast(error.message || "无法读取真实数据文件"); } }
async function loadServiceMode() { try { if (staticDeployment) { publicDeployment = true; } else { const response = await fetch("/api/health", { cache: "no-store" }); const payload = await response.json(); publicDeployment = payload.publicDeployment === true; } if (publicDeployment) { const button = $("#refreshButton"); button.disabled = true; button.title = "公网服务每日 00:00 自动更新"; button.innerHTML = `<span class="refresh-glyph">◷</span> 每日自动更新`; } } catch {} finally { serviceModeReady = true; } }
async function requestCollection() { const button = $("#refreshButton"); if (!serviceModeReady) { showToast("正在确认更新状态，请稍候"); return; } if (publicDeployment) { showToast("公网服务每天 00:00 自动更新，访客不能手动采集"); return; } button.classList.add("loading"); button.innerHTML = `<span class="refresh-glyph">↻</span> 更新中`; try { const response = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full: false }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || `采集服务返回 ${response.status}`); showToast(`${payload.message}，将在后台完成`); } catch (error) { showToast(error.message || "无法连接采集服务，请确认已用 npm run start 启动后端"); } finally { setTimeout(() => { button.classList.remove("loading"); if (publicDeployment) { button.disabled = true; button.title = "公网服务每日 00:00 自动更新"; button.innerHTML = `<span class="refresh-glyph">◷</span> 每日自动更新`; } else { button.innerHTML = `<span class="refresh-glyph">↻</span> 立即更新`; } }, 700); } }

$("#globalSearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderTables(); });
$("#librarySearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); $("#globalSearch").value = event.target.value; renderTables(); });
$("#typeFilter").addEventListener("change", (event) => { state.type = event.target.value; renderTables(); });
$("#amountFilter").addEventListener("change", (event) => { state.amount = event.target.value; renderTables(); });
$("#trendRange").addEventListener("change", renderTrend);
$$('[data-filter]').forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; $$('[data-filter]').forEach((item) => item.classList.toggle("active", item === button)); renderTables(); }));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#closeDrawer").addEventListener("click", closeDrawer); $("#drawerBackdrop").addEventListener("click", closeDrawer); document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); } });
$("#refreshButton").addEventListener("click", requestCollection);
$("#sourceRefreshButton").addEventListener("click", async () => { try { const response = await fetch(staticDeployment ? "data.json" : "/api/health", { cache: "no-store" }); const payload = await response.json(); updateSourceStates(payload.meta?.sourceStates, payload.sourceCatalog); showToast("来源状态已刷新"); } catch { showToast("无法读取来源状态"); } }); $("#bannerClose").addEventListener("click", (event) => event.currentTarget.parentElement.remove()); $("#exportButton").addEventListener("click", exportCsv); $("#projectsExportButton").addEventListener("click", exportCsv); $("#saveRulesButton").addEventListener("click", () => showToast("关键词规则已保存，下一次采集时生效")); $$(".add-rule").forEach((button) => button.addEventListener("click", () => showToast("规则编辑入口已准备，接入后可添加关键词"))); $("#tableFilterButton").addEventListener("click", () => switchView("projects"));
renderTables();
loadApiData();
loadServiceMode();
