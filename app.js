let projects = [];
const state = { query: "", filter: "all", type: "all", amount: "all", view: "overview" };
const staticDeployment = document.querySelector('meta[name="deployment-mode"]')?.content === "static";
const publicDataUrl = "https://bill666-a.github.io/satcom-procurement-intelligence/data.json";
const manualUpdateUrl = "https://github.com/Bill666-a/satcom-procurement-intelligence/actions/workflows/pages.yml";
const favoritesStorageKey = "satcom-procurement-favorites-v1";
let publicDeployment = false;
let serviceModeReady = false;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function safeHref(value) { const url = String(value ?? ""); return /^https?:\/\//i.test(url) || url.startsWith("/api/") ? escapeHtml(url) : "#"; }
function loadFavoriteIds() { try { const value = JSON.parse(localStorage.getItem(favoritesStorageKey) || "[]"); return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []); } catch { return new Set(); } }
const favoriteIds = loadFavoriteIds();
function isFavorite(id) { return favoriteIds.has(String(id)); }
function saveFavoriteIds() { try { localStorage.setItem(favoritesStorageKey, JSON.stringify([...favoriteIds])); return true; } catch { showToast("当前浏览器无法保存关注记录"); return false; } }
function updateFavoriteCount() {
  const element = $("#watchlistNavCount");
  if (!element) return;
  element.textContent = projects.length
    ? projects.filter((project) => isFavorite(project.id)).length
    : favoriteIds.size;
}
function toggleFavorite(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  const adding = !isFavorite(id);
  if (adding) favoriteIds.add(id); else favoriteIds.delete(id);
  if (!saveFavoriteIds()) { if (adding) favoriteIds.delete(id); else favoriteIds.add(id); return; }
  renderTables();
  renderWatchlist();
  if ($("#detailDrawer")?.getAttribute("aria-hidden") === "false") openDrawer(id);
  showToast(adding ? "已加入重点关注" : "已取消关注");
}

function typeClass(type) { if (type.includes("中标") || type.includes("成交")) return "result"; if (type.includes("意向") || type.includes("征求")) return "intent"; return ""; }
function visibleProjects() {
  return projects.filter((project) => {
    const searchable = `${project.title} ${project.buyer} ${project.agency} ${project.content} ${project.winner} ${(project.candidates || []).join(" ")} ${project.source}`.toLowerCase();
    const queryMatch = !state.query || searchable.includes(state.query.toLowerCase());
    const statusMatch = state.filter === "all" || (state.filter === "high" && project.amountValue >= 500) || (state.filter === "watch" && ["watch", "urgent"].includes(project.status));
    const typeMatch = state.type === "all" || project.type === state.type;
    const amountMatch = state.amount === "all" || (state.amount === "high" && project.amountValue >= 100) || (state.amount === "low" && project.amountValue < 100);
    return queryMatch && statusMatch && typeMatch && amountMatch;
  });
}

function projectRow(project, library = false) {
  const favorite = isFavorite(project.id);
  const moreCell = `<td class="row-actions"><button class="favorite-button${favorite ? " active" : ""}" type="button" data-favorite-id="${escapeHtml(project.id)}" aria-label="${favorite ? "取消关注" : "加入关注"}" title="${favorite ? "取消关注" : "加入关注"}">${favorite ? "★" : "☆"}</button><span>→</span></td>`;
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
  $$('[data-favorite-id]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); toggleFavorite(button.dataset.favoriteId); }));
}

function openDrawer(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  const sourceHref = !staticDeployment && !publicDeployment && project.id.startsWith("ggzy-") ? `/api/projects/${encodeURIComponent(project.id)}/source` : project.sourceUrl;
  const rawSourceHref = project.sourceUrl;
  const candidateNotice = project.type === "中标候选人公示";
  const resultNotice = project.type === "中标公告" || project.type === "成交公告";
  const winner = resultNotice ? (project.winner || "未公布") : "无此信息";
  const winnerAmount = resultNotice ? (project.winnerAmount || "未公布") : "无此信息";
  const candidates = candidateNotice && Array.isArray(project.candidates) && project.candidates.length
    ? Array.from({ length: 3 }, (_, index) => `<span class="candidate-line"><b>${index + 1}</b>${escapeHtml(project.candidates[index] || "未公布")}</span>`).join("")
    : escapeHtml(candidateNotice ? "未公布" : "无此信息");
  const favorite = isFavorite(project.id);
  $("#drawerContent").innerHTML = `
    <div class="drawer-tags"><span class="type-badge ${escapeHtml(typeClass(project.type))}">${escapeHtml(project.type)}</span><span class="status-label ${escapeHtml(project.status)}">${escapeHtml(project.statusText)}</span><button class="drawer-favorite${favorite ? " active" : ""}" id="drawerFavoriteButton" type="button" aria-label="${favorite ? "取消关注" : "加入关注"}">${favorite ? "★ 已关注" : "☆ 加入关注"}</button></div>
    <h2 class="drawer-title">${escapeHtml(project.title)}</h2>
    <p class="drawer-subtitle">信息按公告原文字段分区展示，“未公布”与“无此信息”严格区分。</p>
    <section class="drawer-section"><h3>01 · 公告信息</h3><dl>
      <div class="drawer-field"><dt>公告类型</dt><dd>${escapeHtml(project.type)}</dd></div>
      <div class="drawer-field"><dt>发布日期</dt><dd>${escapeHtml(String(project.date).replaceAll("-", "."))}</dd></div>
    </dl></section>
    <section class="drawer-section"><h3>02 · 采购主体</h3><dl>
      <div class="drawer-field"><dt>采购人 / 招标人</dt><dd>${escapeHtml(project.buyer || "未公布")}</dd></div>
      <div class="drawer-field"><dt>代理机构</dt><dd>${escapeHtml(project.agency || "未公布")}</dd></div>
    </dl></section>
    <section class="drawer-section"><h3>03 · 采购标的与预算</h3><dl>
      <div class="drawer-field"><dt>采购内容</dt><dd>${escapeHtml(project.content || "未公布")}</dd></div>
      <div class="drawer-field"><dt>预算金额 / 最高限价</dt><dd class="amount">${escapeHtml(project.budgetAmount || "未公布")}</dd></div>
    </dl></section>
    <section class="drawer-section result-section"><h3>04 · 评审 / 中标结果</h3><dl>
      <div class="drawer-field"><dt>中标人 / 成交供应商</dt><dd>${escapeHtml(winner)}</dd></div>
      <div class="drawer-field"><dt>中标 / 成交金额</dt><dd class="amount">${escapeHtml(winnerAmount)}</dd></div>
      <div class="drawer-field"><dt>候选人前三名</dt><dd class="candidate-list">${candidates}</dd></div>
    </dl></section>
    <section class="drawer-section"><h3>05 · 来源核验</h3><p class="drawer-subtitle drawer-note">${escapeHtml(project.note || "未公布")}</p><p class="drawer-subtitle drawer-note">采集时间：${escapeHtml(project.collectedAt || "未公布")}</p></section>
    <section class="drawer-section"><h3>06 · 原始公告文件</h3><div class="drawer-source"><span>${escapeHtml(project.source)}</span><span class="drawer-source-links"><a href="${safeHref(sourceHref)}" target="_blank" rel="noreferrer">打开核验页 ↗</a>${sourceHref !== rawSourceHref ? `<a href="${safeHref(rawSourceHref)}" target="_blank" rel="noreferrer" title="${escapeHtml(rawSourceHref)}">原始公告链接 ↗</a>` : ""}</span></div></section>`;
  document.body.classList.add("drawer-open");
  $("#detailDrawer").setAttribute("aria-hidden", "false");
  $("#drawerFavoriteButton").addEventListener("click", () => toggleFavorite(project.id));
}
function closeDrawer() { document.body.classList.remove("drawer-open"); $("#detailDrawer").setAttribute("aria-hidden", "true"); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }
function switchView(view) { const target = $(`#${view}View`); if (!target) return; state.view = view; $$(".view").forEach((item) => item.classList.add("hidden")); target.classList.remove("hidden"); $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view)); const labels = { overview: "情报总览", projects: "项目库", watchlist: "重点关注", sources: "采集来源" }; $("#breadcrumbTitle").textContent = labels[view] || "卫星通信招标信息"; if (view === "watchlist") renderWatchlist(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function renderWatchlist() {
  const watched = projects.filter((project) => isFavorite(project.id));
  const pending = watched.filter((project) => ["watch", "urgent"].includes(project.status));
  const candidateRecords = watched.filter((project) => Array.isArray(project.candidates) && project.candidates.length > 0);
  $("#watchAmountCount").textContent = watched.length;
  $("#watchAmountNote").textContent = watched.length ? "可在项目列表或详情中取消" : "保存在当前浏览器";
  $("#watchCandidateCount").textContent = candidateRecords.length;
  $("#watchPendingCount").textContent = pending.length;
  $("#watchlistItems").innerHTML = watched.map((project) => `<button class="watch-item" data-id="${escapeHtml(project.id)}" type="button"><span class="insight-num">★</span><span class="watch-item-main"><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.buyer)} · ${escapeHtml(project.source)}</span></span><span class="watch-item-time">${escapeHtml(String(project.date).replaceAll("-", "."))}</span></button>`).join("") || `<div class="empty-state">暂未关注项目，请在项目列表中点击 ☆ 添加</div>`;
  $$(".watch-item").forEach((item) => item.addEventListener("click", () => openDrawer(item.dataset.id)));
  updateFavoriteCount();
}
function exportCsv() { const rows = visibleProjects(); const header = ["公告类型", "项目名称", "采购人/招标人", "代理机构", "采购内容", "预算金额/最高限价", "中标人/成交供应商", "中标/成交金额", "中标候选人前三名", "发布日期", "信息来源", "原始公告链接", "备注"]; const body = rows.map((project) => [project.type, project.title, project.buyer, project.agency || "未公布", project.content, project.budgetAmount || "未公布", project.winner || "无此信息", project.winnerAmount || "无此信息", Array.isArray(project.candidates) && project.candidates.length ? project.candidates.join("；") : (project.type === "中标候选人公示" ? "未公布" : "无此信息"), project.date, project.source, project.sourceUrl, project.note || "未公布"]); const csv = [header, ...body].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `卫星通信招标情报-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast(`已导出 ${rows.length} 条当前筛选记录`); }
function formatDataUpdateTime(value) { if (!value) return "未获取"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "时间不可用"; const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {}); return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`; }
function updateDataUpdateTime(value) { const element = $("#dataUpdateTime"); if (element) element.textContent = formatDataUpdateTime(value); }
function updateSummary(summary = {}) { const total = Number(summary.total) || projects.length; const newCount = Number(summary.newCount) || 0; const pending = projects.filter((project) => ["watch", "urgent"].includes(project.status)).length; const counts = document.querySelectorAll(".metric-number[data-metric]"); if (counts[0]) counts[0].textContent = total; if (counts[1]) counts[1].textContent = newCount; if (counts[2]) counts[2].textContent = pending; const amount = document.querySelector(".amount-number"); if (amount) amount.innerHTML = `¥ ${Number(summary.publicAmountWan || 0).toLocaleString("zh-CN")}<span>万</span>`; const overviewCount = $("#overviewNavCount"); const projectsCount = $("#projectsNavCount"); if (overviewCount) overviewCount.textContent = Math.min(total, 6); if (projectsCount) projectsCount.textContent = total; const allCount = $("#allFilterCount"); const highCount = $("#highFilterCount"); const watchCount = $("#watchFilterCount"); if (allCount) allCount.textContent = total; if (highCount) highCount.textContent = projects.filter((project) => Number(project.amountValue) > 0).length; if (watchCount) watchCount.textContent = pending; updateFavoriteCount(); renderWatchlist(); }
function renderSourceCatalog(catalog = [], sourceStates = {}) { const container = $("#sourceCatalogRows"); if (!container) return; const rows = Array.isArray(catalog) ? catalog : []; const colors = ["cyan", "blue", "orange", "purple"]; container.innerHTML = rows.length ? rows.map((source, index) => { const runtime = sourceStates[source.id]; let label = "已接入，待检查"; let statusClass = "pending-label"; let detail = source.method || "已登记官方入口"; if (source.status === "cataloged") { label = "已登记，待适配"; statusClass = "cataloged-label"; } else if (runtime?.status === "success") { label = "正常"; statusClass = "online-label"; detail = `${runtime.records || 0} 条记录 · ${runtime.pagesScanned || 0} 页`; } else if (runtime?.status === "blocked") { label = "验证码/访问受限"; detail = (runtime.warnings || []).join("；") || "未绕过访问限制"; } else if (runtime?.status === "partial") { label = "部分完成"; detail = `${runtime.records || 0} 条记录 · ${runtime.pagesScanned || 0} 页`; } return `<div class="source-table-row" data-source-id="${escapeHtml(source.id)}"><strong><span class="source-logo ${colors[index % colors.length]}">${escapeHtml(String(source.name || "源").slice(0, 1))}</span><a href="${safeHref(source.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a></strong><span>${escapeHtml(source.category)}</span><span class="${statusClass}">● ${escapeHtml(label)}</span><span title="${escapeHtml(detail)}">${escapeHtml(detail)}</span></div>`; }).join("") : `<div class="empty-state">暂无来源目录</div>`; }
function updateSourceStates(sourceStates = {}, catalog = []) { const entries = Object.entries(sourceStates); const success = entries.filter(([, state]) => state.status === "success").length; const configured = entries.length; const registered = Array.isArray(catalog) && catalog.length ? catalog.length : configured; const pending = Math.max(registered - success, 0); const values = { sourceSummaryCount: registered, sourceSummaryOnline: success, sourceSummaryPending: pending, sourceSummaryRecords: entries.reduce((sum, [, state]) => sum + (Number(state.records) || 0), 0) }; Object.entries(values).forEach(([id, value]) => { const element = $(`#${id}`); if (element) element.textContent = value; }); renderSourceCatalog(catalog, sourceStates); }
async function fetchDataPayload() {
  const urls = staticDeployment ? ["data.json", publicDataUrl] : ["/api/projects", publicDataUrl];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`数据接口 ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.projects)) throw new Error("数据文件格式不正确");
      if (url === publicDataUrl) publicDeployment = true;
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法读取真实数据文件");
}
async function loadApiData() { try { const payload = await fetchDataPayload(); updateDataUpdateTime(payload.meta?.lastUpdatedAt || payload.meta?.lastRunAt); updateSourceStates(payload.meta?.sourceStates, payload.sourceCatalog); const partial = payload.meta?.lastRunStatus === "partial"; $("#bannerLabel").textContent = partial ? "部分来源受限" : "数据已更新"; $("#bannerCopy").textContent = `${payload.meta?.dateRange ? `覆盖 ${payload.meta.dateRange}` : "已读取公开数据"}，共 ${payload.projects.length} 条可追溯记录。`; projects = payload.projects; updateSummary(payload.summary || {}); renderTables(); } catch (error) { updateDataUpdateTime(null); projects = []; $("#bannerLabel").textContent = "数据暂不可用"; $("#bannerCopy").textContent = "当前无法读取公开数据文件。"; updateSourceStates({}, []); updateSummary({}); renderTables(); showToast(error.message || "无法读取真实数据文件"); } }
async function loadServiceMode() { try { if (staticDeployment) publicDeployment = true; if (!publicDeployment) { const response = await fetch("/api/health", { cache: "no-store" }); if (response.ok) { const payload = await response.json(); publicDeployment = payload.publicDeployment === true; } } } catch {} finally { if (publicDeployment) { const button = $("#refreshButton"); button.disabled = false; button.title = "仓库所有者登录 GitHub 后可手动运行更新"; button.innerHTML = `<span class="refresh-glyph">↻</span> 手动更新`; } serviceModeReady = true; } }
async function requestCollection() { const button = $("#refreshButton"); if (!serviceModeReady) { showToast("正在确认更新状态，请稍候"); return; } if (publicDeployment) { const opened = window.open(manualUpdateUrl, "_blank"); if (opened) opened.opener = null; showToast("已打开 GitHub 更新页面，请登录后点击 Run workflow"); return; } button.classList.add("loading"); button.innerHTML = `<span class="refresh-glyph">↻</span> 更新中`; try { const response = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full: false }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || `采集服务返回 ${response.status}`); showToast(`${payload.message}，将在后台完成`); } catch (error) { showToast(error.message || "无法连接采集服务，请确认已用 npm run start 启动后端"); } finally { setTimeout(() => { button.classList.remove("loading"); button.innerHTML = `<span class="refresh-glyph">↻</span> ${publicDeployment ? "手动更新" : "立即更新"}`; }, 700); } }

$("#globalSearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderTables(); });
$("#librarySearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); $("#globalSearch").value = event.target.value; renderTables(); });
$("#typeFilter").addEventListener("change", (event) => { state.type = event.target.value; renderTables(); });
$("#amountFilter").addEventListener("change", (event) => { state.amount = event.target.value; renderTables(); });
$$('[data-filter]').forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; $$('[data-filter]').forEach((item) => item.classList.toggle("active", item === button)); renderTables(); }));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#closeDrawer").addEventListener("click", closeDrawer); $("#drawerBackdrop").addEventListener("click", closeDrawer); document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); } });
$("#refreshButton").addEventListener("click", requestCollection);
$("#sourceRefreshButton").addEventListener("click", async () => { try { const response = await fetch(staticDeployment ? "data.json" : "/api/health", { cache: "no-store" }); const payload = await response.json(); updateSourceStates(payload.meta?.sourceStates, payload.sourceCatalog); showToast("来源状态已刷新"); } catch { showToast("无法读取来源状态"); } }); $("#bannerClose").addEventListener("click", (event) => event.currentTarget.parentElement.remove()); $("#exportButton").addEventListener("click", exportCsv); $("#projectsExportButton").addEventListener("click", exportCsv);
async function initialize() {
  renderTables();
  await loadApiData();
  await loadServiceMode();
}
initialize();
