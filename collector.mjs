import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "projects.json");
const SEED_DATA_FILE = path.join(ROOT_DIR, "data", "projects.json");
const USER_AGENT = "SatcomProcurementIntelligence/1.0 (+public-data-collector)";
const SEARCH_PAGES = 40;
const REQUEST_TIMEOUT_MS = 30000;
export const HISTORY_START_DATE = "2025-01-01";
const REQUEST_GAP_MS = 1800;
const FULL_BATCH_PAGES = 2;
const FULL_BATCH_WINDOWS = 6;
const ZHEJIANG_PAGE_SIZE = 20;

export const KEYWORDS = [
  "卫星通信", "卫星通信服务", "卫星物联", "卫星物联网", "卫星电话", "卫星宽带",
  "卫星终端", "卫星便携站", "车载卫星终端", "船载卫星终端", "机载卫星终端",
  "VSAT", "高通量卫星", "卫星物联网终端", "卫星通信设备", "应急通信卫星"
];

export const SOURCE_DEFINITIONS = [
  { id: "ccgp", name: "中国政府采购网", category: "政府采购", homepage: "https://www.ccgp.gov.cn/", method: "公开搜索与公告归档" },
  { id: "ggzy", name: "全国公共资源交易平台", category: "公共资源", homepage: "https://www.ggzy.gov.cn/", method: "官方历史查询接口" },
  { id: "ceb", name: "中国招标投标公共服务平台", category: "招投标服务", homepage: "https://www.cebpubservice.com/", method: "公开公告/API（验证码保护）" },
  { id: "china-post", name: "中国邮政电子采购与供应平台", category: "央国企", homepage: "https://cg.11185.cn/", method: "官网公开公告搜索与分页" },
  { id: "zhejiang-ggzy", name: "浙江省公共资源交易服务平台", category: "地方", homepage: "https://ggzy.zj.gov.cn/", method: "官方全文检索接口与公告详情" },
  { id: "shandong-ccgp", name: "山东省政府采购信息公开平台", category: "地方", homepage: "https://www.ccgp-shandong.gov.cn/", method: "官方公开检索接口与公告详情" }
];

export const OFFICIAL_SOURCE_CATALOG = [
  ...SOURCE_DEFINITIONS.map((source) => ({ ...source, status: "active" })),
  { id: "chinatelecom", name: "中国电信阳光采购网", category: "央国企", homepage: "https://caigou.chinatelecom.com.cn/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "china-mobile", name: "中国移动采购与招标网", category: "央国企", homepage: "https://b2b.10086.cn/", method: "官方采购门户，需遵守站点访问策略", status: "cataloged" },
  { id: "china-unicom", name: "中国联通采购与招标网", category: "央国企", homepage: "https://www.chinaunicombidding.cn/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "chinatower", name: "中国铁塔电子采购平台", category: "央国企", homepage: "https://ebidding.chinatowercom.cn/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "petrochina", name: "中国石油招标投标网", category: "央国企", homepage: "https://www.cnpcbidding.com/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "sinopec", name: "中国石化物资电子招标投标交易平台", category: "央国企", homepage: "https://bidding.sinopec.com/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "cnooc", name: "中国海油采办业务管理与交易系统", category: "央国企", homepage: "https://buy.cnooc.com.cn/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "sgcc", name: "国家电网电子商务平台", category: "央国企", homepage: "https://ecp.sgcc.com.cn/", method: "官方采购门户，待公开检索适配", status: "cataloged" },
  { id: "beijing-ggzy", name: "北京市公共资源交易服务平台", category: "地方", homepage: "https://ggzyfw.beijing.gov.cn/", method: "地方公共资源交易官网，待检索适配", status: "cataloged" },
  { id: "shanghai-ccgp", name: "上海政府采购网", category: "地方", homepage: "https://www.ccgp-shanghai.gov.cn/", method: "地方政府采购官网，待检索适配", status: "cataloged" },
  { id: "guangdong-ccgp", name: "广东省政府采购网", category: "地方", homepage: "https://gdgpo.czt.gd.gov.cn/", method: "地方政府采购官网，待检索适配", status: "cataloged" },
  { id: "sichuan-ccgp", name: "四川政府采购网", category: "地方", homepage: "https://www.ccgp-sichuan.gov.cn/", method: "地方政府采购官网，待检索适配", status: "cataloged" }
];

const CCGP_SEARCH = "https://search.ccgp.gov.cn/bxsearch";
const CCGP_HOME = "https://www.ccgp.gov.cn/";

function emptyStore() {
  return { projects: [], meta: { lastRunAt: null, lastRunMode: null, lastRunStatus: "never", lastRunMessage: null, sourceCount: 0 } };
}

export async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    return { ...emptyStore(), ...parsed, meta: { ...emptyStore().meta, ...(parsed.meta || {}) }, projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    if (DATA_FILE !== SEED_DATA_FILE) {
      try {
        const seed = JSON.parse(await fs.readFile(SEED_DATA_FILE, "utf8"));
        const store = { ...emptyStore(), ...seed, meta: { ...emptyStore().meta, ...(seed.meta || {}) }, projects: Array.isArray(seed.projects) ? seed.projects : [] };
        await writeStore(store);
        return store;
      } catch {}
    }
    return emptyStore();
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function decodeHtml(value = "") {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ").trim();
}

function absoluteUrl(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitedPage(html) {
  return /访问过于频繁|频繁访问|请稍后再试/.test(String(html));
}

function isRelevant(text) {
  const normalized = String(text).replace(/\s+/g, "");
  if (/应急通信/.test(normalized) && !/(卫星|卫通)/.test(normalized)) return false;
  return KEYWORDS.some((keyword) => normalized.toLowerCase().includes(keyword.toLowerCase()));
}

function parseDate(text) {
  const match = String(text).match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "未公布";
}

function parseAmount(text) {
  const match = String(text).replace(/,/g, "").match(/(?:[¥￥]\s*)?(\d+(?:\.\d+)?)\s*(亿元|万元|万|元)/);
  if (!match) return { amount: "未公布", amountValue: 0 };
  const value = Number(match[1]);
  const amountValue = match[2] === "亿元" ? value * 10000 : match[2] === "元" ? value / 10000 : value;
  return { amount: `¥ ${Number(match[1]).toLocaleString("zh-CN")} ${match[2]}`, amountValue };
}

function parseLabeledAmount(text, labels) {
  const label = labels.join("|");
  const match = String(text).match(new RegExp(`(?:${label})\\s*[：:]?\\s*([\\s\\S]{0,100})`, "i"));
  return match ? parseAmount(match[1]) : { amount: "未公布", amountValue: 0 };
}

function classifyType(text) {
  if (/中标候选人|评标结果/.test(text)) return "中标候选人公示";
  if (/中标公告/.test(text)) return "中标公告";
  if (/成交公告/.test(text)) return "成交公告";
  if (/采购意向/.test(text)) return "采购意向";
  if (/征求意见/.test(text)) return "征求意见";
  if (/询价/.test(text)) return "询价公告";
  if (/磋商/.test(text)) return "竞争性磋商";
  if (/招标/.test(text)) return "招标公告";
  return "其他";
}

function classifyGgzyType(text) {
  if (/中标候选人|评标结果|交易结果公示/.test(text)) return "中标候选人公示";
  if (/中标|成交/.test(text)) return /成交/.test(text) ? "成交公告" : "中标公告";
  if (/意向/.test(text)) return "采购意向";
  if (/询比|询价/.test(text)) return "询价公告";
  if (/磋商/.test(text)) return "竞争性磋商";
  if (/招标|采购/.test(text)) return "招标公告";
  return "其他";
}

function extractLabeled(text, labels) {
  const label = labels.join("|");
  const boundary = "采购代理机构|代理机构|采购人|采购单位|招标人|项目编号|采购项目|采购组织|采购方式|采购内容|地址|联系人|电话|预算金额|采购预算|最高限价|中标人|中标供应商|成交供应商|供应商名称|中标金额|成交金额|中标（成交）金额|第一中标候选人|第二中标候选人|第三中标候选人|第1中标候选人|第2中标候选人|第3中标候选人";
  const match = text.match(new RegExp(`(?:${label})\\s*[：:]\\s*([\\s\\S]{2,160}?)(?=(?:${boundary})\\s*[：:]|$)`));
  if (!match) return "未公布";
  return match[1].replace(/^名称\s*[：:]\s*/, "").trim() || "未公布";
}

function cleanOrganization(value) {
  const raw = String(value || "").trim();
  const matches = [...raw.matchAll(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,120}?(?:有限责任公司|股份有限公司|有限公司|研究院|研究所|中心|厂|合作社)(?:[\u4e00-\u9fa5]{0,12}分公司)?)/g)];
  return matches[0]?.[1]?.trim() || raw;
}

function extractCandidates(text) {
  const ranks = [
    ["第一中标候选人", "第1中标候选人", "第一成交候选人", "第1成交候选人"],
    ["第二中标候选人", "第2中标候选人", "第二成交候选人", "第2成交候选人"],
    ["第三中标候选人", "第3中标候选人", "第三成交候选人", "第3成交候选人"]
  ];
  return ranks.map((labels) => {
    const match = String(text).match(new RegExp(`(?:${labels.join("|")})\\s*[：:]?\\s*([\\s\\S]{2,240})`));
    return match ? cleanOrganization(match[1]) : "未公布";
  }).filter((value) => value !== "未公布");
}

function extractWinner(text) {
  const labeled = extractLabeled(text, ["中标人", "中标供应商", "成交供应商", "供应商名称"]);
  if (labeled !== "未公布") return cleanOrganization(labeled);
  const zhejiangResult = String(text).match(/定标\s*\/\s*成交结果\s*[：:]\s*([^（(]{2,120}?)(?=\s*[（(])/);
  if (zhejiangResult) return cleanOrganization(zhejiangResult[1]);
  const tableResult = String(text).match(/供应商名称\s+供应商地址\s+(?:供应商编码|统一社会信用代码)\s+([\u4e00-\u9fa5A-Za-z0-9（）()·\s]{2,120}?(?:有限责任公司|股份有限公司|有限公司|公司|研究院|研究所|中心|厂|合作社))(?=\s)/);
  return tableResult ? cleanOrganization(tableResult[1]) : "未公布";
}

function extractProcurementFields(text, type) {
  const candidateNotice = type === "中标候选人公示";
  const resultNotice = !candidateNotice && (type === "中标公告" || type === "成交公告");
  const budget = parseLabeledAmount(text, ["预算金额", "采购预算", "项目预算", "预算", "最高限价", "采购控制价"]);
  let award = parseLabeledAmount(text, ["总中标金额", "总成交金额", "中标（成交）金额", "中标金额", "成交金额", "中标价", "成交价"]);
  const zhejiangResult = String(text).match(/定标\s*\/\s*成交结果\s*[：:]\s*[^（(]{2,120}?[（(]([^）)]{1,80})[）)]/);
  if (award.amount === "未公布" && zhejiangResult) award = parseAmount(zhejiangResult[1]);
  return {
    budgetAmount: budget.amount,
    budgetAmountValue: budget.amountValue,
    winner: resultNotice ? extractWinner(text) : "无此信息",
    winnerAmount: resultNotice ? award.amount : "无此信息",
    winnerAmountValue: resultNotice ? award.amountValue : 0,
    candidates: candidateNotice ? extractCandidates(text) : [],
    candidatesDisclosure: candidateNotice ? "公告披露字段" : "无此信息"
  };
}

function defaultProcurementFields(type) {
  const candidateNotice = type === "中标候选人公示";
  const resultNotice = type === "中标公告" || type === "成交公告";
  return {
    budgetAmount: "未公布",
    budgetAmountValue: 0,
    winner: resultNotice ? "未公布" : "无此信息",
    winnerAmount: resultNotice ? "未公布" : "无此信息",
    winnerAmountValue: 0,
    candidates: [],
    candidatesDisclosure: candidateNotice ? "未公布" : "无此信息"
  };
}

function snippet(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  const hit = KEYWORDS.find((keyword) => compact.toLowerCase().includes(keyword.toLowerCase()));
  if (!hit) return compact.slice(0, 180) || "未公布";
  const index = compact.toLowerCase().indexOf(hit.toLowerCase());
  return compact.slice(Math.max(0, index - 45), index + 150);
}

function parseSearchResults(html) {
  const results = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const title = decodeHtml(match[2]);
    const href = absoluteUrl(match[1], CCGP_HOME);
    if (title.length < 8 || !isRelevant(title) || !/^https?:/i.test(href)) continue;
    const context = decodeHtml(html.slice(Math.max(0, match.index - 250), Math.min(html.length, match.index + match[0].length + 500)));
    const date = parseDate(context);
    if (!results.some((item) => item.url === href || item.title === title)) results.push({ title, url: href, date });
  }
  return results.slice(0, 40);
}

function parseGgzyRecords(payload, sourcePath, keyword) {
  const records = payload?.data?.records || [];
  return records.filter((item) => isRelevant(`${item.title || ""} ${keyword}`)).map((item) => {
    const type = classifyGgzyType(`${item.title || ""} ${item.informationTypeText || ""}`);
    return {
      id: `ggzy-${item.id}`,
      title: item.title || "未公布",
      buyer: "未公布",
      agency: "未公布",
      type,
      date: item.publishTime || "未公布",
      amount: "未公布",
      amountValue: 0,
      ...defaultProcurementFields(type),
      content: "未公布（请打开全国公共资源交易平台原文核验采购清单）",
      status: /中标|成交/.test(`${item.title || ""} ${item.informationTypeText || ""}`) ? "normal" : "watch",
      statusText: /中标|成交/.test(`${item.title || ""} ${item.informationTypeText || ""}`) ? "已发布" : "待研判",
      source: "全国公共资源交易平台",
      sourceUrl: absoluteUrl(item.url, "https://www.ggzy.gov.cn/"),
      note: `来源平台：${item.transactionSourcesPlatformText || "未公布"}；业务类型：${item.businessTypeText || "未公布"}`,
      collectedAt: new Date().toISOString(),
      sourcePath
    };
  });
}

function dateWindows(startDate, endDate, days = 10) {
  const windows = [];
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  let cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  while (cursor <= end) {
    const windowEnd = new Date(cursor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + days - 1);
    if (windowEnd > end) windowEnd.setTime(end.getTime());
    windows.push({ start: cursor.toISOString().slice(0, 10), end: windowEnd.toISOString().slice(0, 10) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

function isHistoricalWindow(windowEnd) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  return new Date(`${windowEnd}T00:00:00Z`) < cutoff;
}

async function fetchText(url, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, retries = 3, ...fetchOptions } = options;
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchOptions, headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", ...(fetchOptions.headers || {}) }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (isRateLimitedPage(html)) throw new Error("来源站点触发访问频率限制");
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await sleep(4000 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function parseDetail(result, html) {
  const text = decodeHtml(html);
  const titleFromPage = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || result.title).replace(/[-_｜|].*$/, "").trim();
  const amount = parseAmount(text);
  const type = classifyType(`${titleFromPage} ${text.slice(0, 1200)}`);
  const procurementFields = extractProcurementFields(text, type);
  const candidateText = extractLabeled(text, ["中标候选人", "第一中标候选人"]);
  return {
    id: `ccgp-${crypto.createHash("sha1").update(result.url).digest("hex").slice(0, 18)}`,
    title: titleFromPage || result.title,
    buyer: extractLabeled(text, ["采购人", "采购单位", "招标人"]),
    agency: extractLabeled(text, ["代理机构", "采购代理机构"]),
    type,
    date: parseDate(text),
    amount: amount.amount,
    amountValue: amount.amountValue,
    ...procurementFields,
    content: snippet(text),
    status: type.includes("招标") || type.includes("意向") ? "watch" : type.includes("中标") || type.includes("成交") ? "normal" : "watch",
    statusText: type.includes("中标") || type.includes("成交") ? "已发布" : "待研判",
    source: "中国政府采购网",
    sourceUrl: result.url,
    note: candidateText === "未公布" ? "字段由公开公告正文自动提取，请打开原文复核。" : `候选人字段已命中：${candidateText}`,
    collectedAt: new Date().toISOString()
  };
}

async function collectCcgp({ full = false, startDate = HISTORY_START_DATE, endDate = new Date().toISOString().slice(0, 10), cursor = { queryIndex: 0, page: 1 } } = {}) {
  const candidates = [];
  const warnings = [];
  let pagesScanned = 0;
  let nextCursor = cursor;
  const queries = ["卫星通信", "卫星终端", "卫星电话", "卫星物联网", "应急通信卫星"];
  const maxPages = full ? Math.min(SEARCH_PAGES, FULL_BATCH_PAGES) : 2;
  for (let queryIndex = cursor.queryIndex; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    const firstPage = queryIndex === cursor.queryIndex ? cursor.page : 1;
    const pageLimit = full ? Math.min(SEARCH_PAGES, firstPage + FULL_BATCH_PAGES - 1) : maxPages;
    for (let page = firstPage; page <= pageLimit; page += 1) {
      try {
        const url = `${CCGP_SEARCH}?searchtype=1&page_index=${page}&bidSort=0&buyerName=&projectId=&pinMu=&bidType=&dbselect=bidx&kw=${encodeURIComponent(query)}`;
        const html = await fetchText(url);
        const pageResults = parseSearchResults(html);
        pagesScanned += 1;
        candidates.push(...pageResults);
        if (!pageResults.length || !full) {
          nextCursor = queryIndex + 1 < queries.length ? { queryIndex: queryIndex + 1, page: 1 } : { queryIndex: queries.length, page: 1 };
          break;
        }
        nextCursor = page < SEARCH_PAGES ? { queryIndex, page: page + 1 } : (queryIndex + 1 < queries.length ? { queryIndex: queryIndex + 1, page: 1 } : { queryIndex: queries.length, page: 1 });
        await sleep(REQUEST_GAP_MS);
      } catch (error) {
        const warning = `${query} 第 ${page} 页：${error.message}`;
        warnings.push(warning);
        console.warn(`[collector] search failed: ${warning}`);
        break;
      }
    }
    break;
  }
  const uniqueCandidates = candidates.filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index).slice(0, full ? 160 : 40);
  const records = [];
  for (const candidate of uniqueCandidates) {
    try {
      const detailHtml = await fetchText(candidate.url);
      const record = parseDetail(candidate, detailHtml);
      if (isRelevant(`${record.title} ${record.content}`) && record.date !== "未公布" && record.date >= startDate && record.date <= endDate) records.push(record);
      await sleep(REQUEST_GAP_MS);
    } catch (error) {
      records.push({
        id: `ccgp-${crypto.createHash("sha1").update(candidate.url).digest("hex").slice(0, 18)}`,
        title: candidate.title, buyer: "未公布", agency: "未公布", type: classifyType(candidate.title), date: "未公布",
        amount: "未公布", amountValue: 0, content: "原文暂时无法解析，请打开来源页面核验。", status: "watch", statusText: "待核验",
        source: "中国政府采购网", sourceUrl: candidate.url, note: `正文抓取失败：${error.message}`, collectedAt: new Date().toISOString()
      });
    }
  }
  return { records, warnings, pagesScanned, candidatesFound: uniqueCandidates.length, nextCursor, complete: nextCursor.queryIndex >= queries.length };
}

async function collectGgzy({ full = false, startDate = HISTORY_START_DATE, endDate = new Date().toISOString().slice(0, 10), cursor = { windowIndex: 0, queryIndex: 0, page: 1 } } = {}) {
  const windows = dateWindows(startDate, endDate);
  const queries = ["卫星", "VSAT"];
  const warnings = [];
  const candidates = [];
  let nextCursor = cursor;
  let pagesScanned = 0;
  const windowLimit = full ? Math.min(FULL_BATCH_WINDOWS, windows.length - cursor.windowIndex) : 1;
  const pageLimit = full ? FULL_BATCH_PAGES : 1;
  for (let w = cursor.windowIndex; w < Math.min(cursor.windowIndex + windowLimit, windows.length); w += 1) {
    const window = windows[w];
    const firstQuery = w === cursor.windowIndex ? cursor.queryIndex : 0;
    for (let q = firstQuery; q < queries.length; q += 1) {
      const firstPage = w === cursor.windowIndex && q === cursor.queryIndex ? cursor.page : 1;
      for (let page = firstPage; page <= pageLimit; page += 1) {
        try {
          const historical = isHistoricalWindow(window.end);
          const form = full
            ? new URLSearchParams({ DEAL_TIME: "06", TIMEBEGIN: window.start, TIMEEND: window.end, FINDTXT: queries[q], PAGENUMBER: String(page) })
            : new URLSearchParams({ DEAL_TIME: "01", FINDTXT: queries[q], PAGENUMBER: String(page) });
          const endpoint = historical ? "https://www.ggzy.gov.cn/his/information/pubTradingInfo/getTradList" : "https://www.ggzy.gov.cn/information/pubTradingInfo/getTradList";
          const response = await fetchText(endpoint, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } });
          const payload = JSON.parse(response);
          pagesScanned += 1;
          if (payload.code !== 200) throw new Error(payload.message || `API code ${payload.code}`);
          candidates.push(...parseGgzyRecords(payload, "history", queries[q]));
          nextCursor = page < Number(payload.data?.pages || pageLimit) && page < pageLimit ? { windowIndex: w, queryIndex: q, page: page + 1 } : q + 1 < queries.length ? { windowIndex: w, queryIndex: q + 1, page: 1 } : { windowIndex: w + 1, queryIndex: 0, page: 1 };
          await sleep(REQUEST_GAP_MS);
        } catch (error) {
          warnings.push(`全国公共资源交易平台 ${window.start}~${window.end} / ${queries[q]} 第 ${page} 页：${error.message}`);
          break;
        }
      }
      if (warnings.length) break;
    }
    if (warnings.length) break;
  }
  const unique = candidates.filter((item, index, array) => array.findIndex((other) => other.sourceUrl === item.sourceUrl) === index);
  return { records: unique, warnings, pagesScanned, candidatesFound: unique.length, nextCursor, complete: nextCursor.windowIndex >= windows.length };
}

async function collectCeb() {
  try {
    const html = await fetchText("https://www.cebpubservice.com/");
    if (/验证码|NECaptcha|captcha/i.test(html)) return { records: [], warnings: ["中国招标投标公共服务平台公开检索受验证码保护，未绕过验证"], pagesScanned: 1, candidatesFound: 0, blocked: true };
    return { records: [], warnings: ["中国招标投标公共服务平台未提供可直接使用的公开历史检索接口"], pagesScanned: 1, candidatesFound: 0, blocked: true };
  } catch (error) {
    return { records: [], warnings: [`中国招标投标公共服务平台：${error.message}`], pagesScanned: 0, candidatesFound: 0, blocked: true };
  }
}

function parseChinaPostSearchResults(html) {
  const results = [];
  const pattern = /<a\s+href=["'](https:\/\/cg\.11185\.cn\/biddingBulletin\/[^"']+)["'][\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = decodeHtml(match[2]);
    const dateMatch = match[1].match(/\/biddingBulletin\/(20\d{2}-\d{2}-\d{2})\//);
    const date = dateMatch ? dateMatch[1] : "未公布";
    if (!title || !isRelevant(title) || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) continue;
    if (!results.some((item) => item.url === match[1])) results.push({ title, url: match[1], date });
  }
  return results;
}

function parseChinaPostDetail(candidate, html) {
  const text = decodeHtml(html);
  const titleFromPage = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || candidate.title).replace(/[-_｜|].*$/, "").trim();
  const title = titleFromPage.includes("中国邮政电子采购") ? candidate.title : titleFromPage;
  const amount = parseAmount(text);
  const type = classifyType(`${candidate.title} ${text.slice(0, 1200)}`);
  const procurementFields = extractProcurementFields(text, type);
  return {
    id: `china-post-${crypto.createHash("sha1").update(candidate.url).digest("hex").slice(0, 18)}`,
    title: title || candidate.title,
    buyer: extractLabeled(text, ["采购人", "采购单位", "招标人"]),
    agency: extractLabeled(text, ["代理机构", "采购代理机构"]),
    type,
    date: candidate.date,
    amount: amount.amount,
    amountValue: amount.amountValue,
    ...procurementFields,
    content: snippet(text),
    status: type.includes("招标") || type.includes("意向") ? "watch" : type.includes("中标") || type.includes("成交") ? "normal" : "watch",
    statusText: type.includes("中标") || type.includes("成交") ? "已发布" : "待研判",
    source: "中国邮政电子采购与供应平台",
    sourceUrl: candidate.url,
    note: "字段由中国邮政官网公开公告正文自动提取，请打开原文复核。",
    collectedAt: new Date().toISOString(),
    sourcePath: "official-search"
  };
}

async function collectChinaPost({ full = false, startDate = HISTORY_START_DATE, endDate = new Date().toISOString().slice(0, 10) } = {}) {
  const warnings = [];
  const candidates = [];
  const queries = ["卫星通信", "卫星电话", "卫星终端", "卫星物联网", "VSAT"];
  const maxPages = full ? 10 : 1;
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      try {
        const url = `https://cg.11185.cn/zgyzcms/category/searchBulletinList.html?searchDate=2001-01-01&dates=300&page=${page}&goSearch=${encodeURIComponent(query)}&categoryId=88&tabName=`;
        const html = await fetchText(url);
        candidates.push(...parseChinaPostSearchResults(html).filter((candidate) => candidate.date >= startDate && candidate.date <= endDate));
        await sleep(REQUEST_GAP_MS);
      } catch (error) {
        warnings.push(`${query} 第 ${page} 页：${error.message}`);
        break;
      }
    }
  }
  const uniqueCandidates = candidates.filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index).slice(0, full ? 160 : 40);
  const records = [];
  for (const candidate of uniqueCandidates) {
    try {
      const html = await fetchText(candidate.url);
      const record = parseChinaPostDetail(candidate, html);
      if (isRelevant(`${record.title} ${record.content}`)) records.push(record);
      await sleep(REQUEST_GAP_MS);
    } catch (error) {
      records.push({ id: `china-post-${crypto.createHash("sha1").update(candidate.url).digest("hex").slice(0, 18)}`, title: candidate.title, buyer: "未公布", agency: "未公布", type: classifyType(candidate.title), date: candidate.date, amount: "未公布", amountValue: 0, content: "原文暂时无法解析，请打开来源页面核验。", status: "watch", statusText: "待核验", source: "中国邮政电子采购与供应平台", sourceUrl: candidate.url, note: `正文抓取失败：${error.message}`, collectedAt: new Date().toISOString(), sourcePath: "official-search" });
    }
  }
  return { records, warnings, pagesScanned: queries.length * maxPages, candidatesFound: uniqueCandidates.length, complete: true };
}

const ZHEJIANG_SEARCH_URL = "https://ggzy.zj.gov.cn/inteligentsearch/rest/esinteligentsearch/getFullTextDataNew";
const ZHEJIANG_HOME = "https://ggzy.zj.gov.cn/";
const ZHEJIANG_QUERIES = ["卫星通信", "卫星终端", "卫星电话", "卫星物联网", "VSAT", "应急通信卫星"];

function parseZhejiangDate(value) {
  const match = String(value || "").match(/(20\d{2})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "未公布";
}

function zhejiangSearchPayload(query, page, startDate, endDate) {
  return {
    token: "", pn: (page - 1) * ZHEJIANG_PAGE_SIZE, rn: String(ZHEJIANG_PAGE_SIZE),
    sdt: "", edt: "", wd: query, inc_wd: "", exc_wd: "", fields: "title",
    cnum: "001", sort: '{"webdate":"0"}', ssort: "title", cl: 500, terminal: "",
    condition: null, time: [{ fieldName: "webdate", startTime: `${startDate} 00:00:00`, endTime: `${endDate} 23:59:59` }],
    highlights: "", statistics: null, unionCondition: null, accuracy: "", noParticiple: "0",
    searchRange: null, isBusiness: "1"
  };
}

function parseZhejiangCandidates(payload, query, startDate, endDate) {
  const records = payload?.result?.records || [];
  return records.filter((item) => {
    const date = parseZhejiangDate(item.webdate || item.infodate);
    return date !== "未公布" && date >= startDate && date <= endDate && isRelevant(`${item.title || ""} ${item.content || ""} ${query}`);
  }).map((item) => ({
    title: item.title || item.titlenew || "未公布",
    date: parseZhejiangDate(item.webdate || item.infodate),
    url: absoluteUrl(item.linkurl, ZHEJIANG_HOME),
    listContent: decodeHtml(item.content || "")
  })).filter((item) => /^https?:\/\//i.test(item.url));
}

function parseZhejiangDetail(candidate, html) {
  const text = decodeHtml(html);
  const titleFromPage = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || candidate.title).replace(/[-_｜|].*$/, "").trim();
  const amount = parseAmount(text);
  const type = classifyType(`${titleFromPage} ${text.slice(0, 1800)}`);
  const procurementFields = extractProcurementFields(text, type);
  return {
    id: `zhejiang-ggzy-${crypto.createHash("sha1").update(candidate.url).digest("hex").slice(0, 18)}`,
    title: candidate.title || titleFromPage,
    buyer: extractLabeled(text, ["采购人", "采购单位", "招标人"]),
    agency: extractLabeled(text, ["采购代理机构", "代理机构"]),
    type,
    date: candidate.date,
    amount: amount.amount,
    amountValue: amount.amountValue,
    ...procurementFields,
    content: snippet(text),
    status: type.includes("招标") || type.includes("意向") ? "watch" : type.includes("中标") || type.includes("成交") ? "normal" : "watch",
    statusText: type.includes("中标") || type.includes("成交") ? "已发布" : "待研判",
    source: "浙江省公共资源交易服务平台",
    sourceUrl: candidate.url,
    note: "字段由浙江省公共资源交易服务平台公开公告正文自动提取，请打开原文复核。",
    collectedAt: new Date().toISOString(),
    sourcePath: "official-search"
  };
}

async function collectZhejiang({ full = false, startDate = HISTORY_START_DATE, endDate = new Date().toISOString().slice(0, 10) } = {}) {
  const warnings = [];
  const candidates = [];
  const pagesPerQuery = full ? 10 : 2;
  let pagesScanned = 0;
  for (const query of ZHEJIANG_QUERIES) {
    for (let page = 1; page <= pagesPerQuery; page += 1) {
      try {
        const response = await fetchText(ZHEJIANG_SEARCH_URL, { method: "POST", body: JSON.stringify(zhejiangSearchPayload(query, page, startDate, endDate)), headers: { "Content-Type": "application/json;charset=utf-8", Accept: "application/json" } });
        const payload = JSON.parse(response);
        if (!payload?.result) throw new Error("浙江平台返回数据格式异常");
        const pageCandidates = parseZhejiangCandidates(payload, query, startDate, endDate);
        pagesScanned += 1;
        candidates.push(...pageCandidates);
        const total = Number(payload.result.totalcount || 0);
        if (!pageCandidates.length || page * ZHEJIANG_PAGE_SIZE >= total) break;
        await sleep(REQUEST_GAP_MS);
      } catch (error) {
        warnings.push(`${query} 第 ${page} 页：${error.message}`);
        break;
      }
    }
  }
  const uniqueCandidates = candidates.filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index).slice(0, full ? 300 : 100);
  const records = [];
  for (const candidate of uniqueCandidates) {
    try {
      const detailHtml = await fetchText(candidate.url);
      const record = parseZhejiangDetail(candidate, detailHtml);
      if (isRelevant(`${record.title} ${record.content}`)) records.push(record);
      await sleep(REQUEST_GAP_MS);
    } catch (error) {
      records.push({
        id: `zhejiang-ggzy-${crypto.createHash("sha1").update(candidate.url).digest("hex").slice(0, 18)}`,
        title: candidate.title, buyer: "未公布", agency: "未公布", type: classifyType(candidate.title), date: candidate.date,
        amount: "未公布", amountValue: 0, content: "原文暂时无法解析，请打开来源页面核验。", status: "watch", statusText: "待核验",
        source: "浙江省公共资源交易服务平台", sourceUrl: candidate.url, note: `正文抓取失败：${error.message}`, collectedAt: new Date().toISOString(), sourcePath: "official-search"
      });
    }
  }
  return { records, warnings, pagesScanned, candidatesFound: uniqueCandidates.length, complete: true };
}

const SHANDONG_API = "https://www.ccgp-shandong.gov.cn:8087/api";
const SHANDONG_HOME = "https://www.ccgp-shandong.gov.cn/";
const SHANDONG_QUERIES = ["卫星通信", "卫星电话", "卫星终端", "卫星便携站", "卫星物联网", "VSAT", "应急通信卫星"];

function shandongSearchPayload(query, page, startDate, endDate) {
  return {
    type: "01", colCode: "", area: "", cityType: "", title: query, projectCode: "", currentPage: page,
    pageSize: 20, buyKind: "", buyType: "", unitName: "", startTime: `${startDate} 00:00:00`,
    endTime: `${endDate} 23:59:59`, oldData: 0, homePage: 0, mergeType: 0
  };
}

function parseShandongCandidates(payload, startDate, endDate) {
  const data = payload?.data?.data;
  const rows = data?.records || [];
  return rows.filter((item) => {
    const date = parseDate(item.date || "");
    return date !== "未公布" && date >= startDate && date <= endDate && isRelevant(item.title || "");
  }).map((item) => ({
    title: item.title || "未公布",
    date: parseDate(item.date || ""),
    id: item.id,
    colCode: item.colCode || "",
    url: `${SHANDONG_HOME}detail?id=${encodeURIComponent(item.id)}&colCode=${encodeURIComponent(item.colCode || "")}`,
    listContent: item.userName || ""
  })).filter((item) => item.id && /^https?:\/\//i.test(item.url));
}

function decodeShandongBody(value) {
  const raw = String(value || "");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.includes("<") ? decoded : raw;
  } catch {
    return raw;
  }
}

async function fetchShandongDetail(candidate) {
  const url = `${SHANDONG_API}/website/site/getDetail?id=${encodeURIComponent(candidate.id)}&colCode=${encodeURIComponent(candidate.colCode)}`;
  const payload = JSON.parse(await fetchText(url, { headers: { Accept: "application/json" } }));
  const article = payload?.data?.data;
  if (!article?.body) throw new Error(payload?.data?.message || "山东平台未返回公告正文");
  return { ...article, body: decodeShandongBody(article.body) };
}

function parseShandongDetail(candidate, article) {
  const text = decodeHtml(article.body || "");
  const title = article.title || candidate.title;
  const type = classifyType(`${title} ${text.slice(0, 1800)}`);
  const amount = parseAmount(text);
  const procurementFields = extractProcurementFields(text, type);
  return {
    id: `shandong-ccgp-${crypto.createHash("sha1").update(candidate.id).digest("hex").slice(0, 18)}`,
    title,
    buyer: extractLabeled(text, ["采购人", "采购单位", "招标人"]),
    agency: extractLabeled(text, ["采购代理机构", "代理机构"]),
    type,
    date: candidate.date,
    amount: amount.amount,
    amountValue: amount.amountValue,
    ...procurementFields,
    content: snippet(text),
    status: type.includes("招标") || type.includes("意向") ? "watch" : type.includes("中标") || type.includes("成交") ? "normal" : "watch",
    statusText: type.includes("中标") || type.includes("成交") ? "已发布" : "待研判",
    source: "山东省政府采购信息公开平台",
    sourceUrl: candidate.url,
    note: "字段由山东省政府采购信息公开平台公开公告正文自动提取，请打开原文复核。",
    collectedAt: new Date().toISOString(),
    sourcePath: "official-search"
  };
}

async function collectShandong({ full = false, startDate = HISTORY_START_DATE, endDate = new Date().toISOString().slice(0, 10) } = {}) {
  const warnings = [];
  const candidates = [];
  const pagesPerQuery = full ? 10 : 2;
  let pagesScanned = 0;
  for (const query of SHANDONG_QUERIES) {
    for (let page = 1; page <= pagesPerQuery; page += 1) {
      try {
        const url = `${SHANDONG_API}/website/site/searchAllByCode`;
        const response = await fetchText(url, { method: "POST", body: JSON.stringify(shandongSearchPayload(query, page, startDate, endDate)), headers: { "Content-Type": "application/json;charset=utf-8", Accept: "application/json" } });
        const payload = JSON.parse(response);
        if (payload?.data?.code !== 100) throw new Error(payload?.data?.message || "山东平台检索失败");
        const pageCandidates = parseShandongCandidates(payload, startDate, endDate);
        pagesScanned += 1;
        candidates.push(...pageCandidates);
        const totalPages = Number(payload.data.data?.pages || page);
        if (!pageCandidates.length || page >= totalPages) break;
        await sleep(REQUEST_GAP_MS);
      } catch (error) {
        warnings.push(`${query} 第 ${page} 页：${error.message}`);
        break;
      }
    }
  }
  const uniqueCandidates = candidates.filter((candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index).slice(0, full ? 400 : 120);
  const records = [];
  for (const candidate of uniqueCandidates) {
    try {
      const article = await fetchShandongDetail(candidate);
      const record = parseShandongDetail(candidate, article);
      if (isRelevant(`${record.title} ${record.content}`)) records.push(record);
      await sleep(REQUEST_GAP_MS);
    } catch (error) {
      records.push({
        id: `shandong-ccgp-${crypto.createHash("sha1").update(candidate.id).digest("hex").slice(0, 18)}`,
        title: candidate.title, buyer: "未公布", agency: "未公布", type: classifyType(candidate.title), date: candidate.date,
        amount: "未公布", amountValue: 0, content: "原文暂时无法解析，请打开来源页面核验。", status: "watch", statusText: "待核验",
        source: "山东省政府采购信息公开平台", sourceUrl: candidate.url, note: `正文抓取失败：${error.message}`, collectedAt: new Date().toISOString(), sourcePath: "official-search"
      });
    }
  }
  return { records, warnings, pagesScanned, candidatesFound: uniqueCandidates.length, complete: true };
}

export function mergeProjects(existing, incoming) {
  const isMeaningful = (value) => value !== undefined && value !== null && value !== "" && value !== "未公布" && value !== "无此信息";
  const normalizeProject = (project) => ({
    ...defaultProcurementFields(project.type),
    ...project,
    agency: project.agency || "未公布",
    candidates: Array.isArray(project.candidates) ? project.candidates : []
  });
  const merged = new Map(existing.map((project) => {
    const normalized = normalizeProject(project);
    return [normalized.sourceUrl || normalized.id, normalized];
  }));
  incoming.forEach((project) => {
    const key = project.sourceUrl || project.id;
    const previous = merged.get(key) || {};
    const combined = { ...previous, ...project, updatedAt: new Date().toISOString() };
    for (const field of ["budgetAmount", "winner", "winnerAmount"]) {
      if (!isMeaningful(project[field]) && isMeaningful(previous[field])) combined[field] = previous[field];
    }
    if (!isMeaningful(project.budgetAmount) && isMeaningful(previous.budgetAmount)) combined.budgetAmountValue = previous.budgetAmountValue;
    if (!isMeaningful(project.winnerAmount) && isMeaningful(previous.winnerAmount)) combined.winnerAmountValue = previous.winnerAmountValue;
    if ((!Array.isArray(project.candidates) || !project.candidates.length) && Array.isArray(previous.candidates) && previous.candidates.length) {
      combined.candidates = previous.candidates;
      combined.candidatesDisclosure = previous.candidatesDisclosure;
    }
    merged.set(key, normalizeProject(combined));
  });
  return [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function enrichStoredResults() {
  const store = await readStore();
  const enrichable = store.projects.filter((project) =>
    ["中标公告", "成交公告", "中标候选人公示"].includes(project.type)
    && /^https?:\/\//i.test(project.sourceUrl || "")
  );
  const updates = new Map();
  const warnings = [];
  const enrichProject = async (project) => {
    try {
      let text;
      if (project.source === "山东省政府采购信息公开平台") {
        const url = new URL(project.sourceUrl);
        const article = await fetchShandongDetail({ id: url.searchParams.get("id"), colCode: url.searchParams.get("colCode") });
        text = decodeHtml(article.body || "");
      } else {
        const detailUrl = project.source === "全国公共资源交易平台" ? project.sourceUrl.replace("/html/a/", "/html/b/") : project.sourceUrl;
        text = decodeHtml(await fetchText(detailUrl, { timeoutMs: 8000, retries: 1 }));
      }
      const fields = extractProcurementFields(text, project.type);
      const buyer = extractLabeled(text, ["采购人", "采购单位", "招标人"]);
      const agency = extractLabeled(text, ["采购代理机构", "代理机构"]);
      const updated = { ...project };
      if (buyer !== "未公布") updated.buyer = buyer;
      if (agency !== "未公布") updated.agency = agency;
      if (fields.budgetAmount !== "未公布") {
        updated.budgetAmount = fields.budgetAmount;
        updated.budgetAmountValue = fields.budgetAmountValue;
      }
      if (fields.winner !== "未公布" && fields.winner !== "无此信息") updated.winner = fields.winner;
      if (fields.winnerAmount !== "未公布" && fields.winnerAmount !== "无此信息") {
        updated.winnerAmount = fields.winnerAmount;
        updated.winnerAmountValue = fields.winnerAmountValue;
      }
      if (fields.candidates.length) {
        updated.candidates = fields.candidates;
        updated.candidatesDisclosure = "公告披露字段";
      }
      updates.set(project.sourceUrl, { ...updated, updatedAt: new Date().toISOString() });
    } catch (error) {
      warnings.push(`${project.title}：${error.message}`);
    }
  };
  const batchSize = 6;
  for (let index = 0; index < enrichable.length; index += batchSize) {
    await Promise.all(enrichable.slice(index, index + batchSize).map(enrichProject));
    if (index + batchSize < enrichable.length) await sleep(500);
  }
  const projects = store.projects.map((project) => updates.get(project.sourceUrl) || project);
  const enrichedCount = [...updates.values()].filter((project) =>
    (project.winner && !["未公布", "无此信息"].includes(project.winner))
    || (project.winnerAmount && !["未公布", "无此信息"].includes(project.winnerAmount))
    || (Array.isArray(project.candidates) && project.candidates.length)
  ).length;
  const nextStore = {
    ...store,
    projects,
    meta: { ...store.meta, lastEnrichedAt: new Date().toISOString(), enrichmentScanned: enrichable.length, enrichmentMatched: enrichedCount, enrichmentWarnings: warnings }
  };
  await writeStore(nextStore);
  return { scanned: enrichable.length, matched: enrichedCount, warnings: warnings.length };
}

function projectDateRange(projects, fallbackStart, fallbackEnd) {
  const dates = projects.map((project) => project.date).filter((date) => /^20\d{2}-\d{2}-\d{2}$/.test(date)).sort();
  return { start: dates[0] || fallbackStart, end: dates[dates.length - 1] || fallbackEnd };
}

export async function runCollection({ full = false, startDate = full ? HISTORY_START_DATE : new Date().toISOString().slice(0, 10), endDate = new Date().toISOString().slice(0, 10) } = {}) {
  const store = await readStore();
  const startedAt = new Date().toISOString();
  try {
    const ccgpCursor = full && store.meta.ccgpHistoryCursor && !store.meta.ccgpHistoryComplete ? store.meta.ccgpHistoryCursor : { queryIndex: 0, page: 1 };
    const ggzyCursor = full && store.meta.ggzyHistoryCursor && !store.meta.ggzyHistoryComplete ? store.meta.ggzyHistoryCursor : { windowIndex: 0, queryIndex: 0, page: 1 };
    const [ccgpResult, ggzyResult, cebResult, chinaPostResult, zhejiangResult, shandongResult] = await Promise.all([
      collectCcgp({ full, startDate, endDate, cursor: ccgpCursor }),
      collectGgzy({ full, startDate, endDate, cursor: ggzyCursor }),
      collectCeb(),
      collectChinaPost({ full, startDate, endDate }),
      collectZhejiang({ full, startDate, endDate }),
      collectShandong({ full, startDate, endDate })
    ]);
    const incoming = [...ccgpResult.records, ...ggzyResult.records, ...chinaPostResult.records, ...zhejiangResult.records, ...shandongResult.records];
    const projects = mergeProjects(store.projects, incoming);
    const coverage = projectDateRange(projects, startDate, endDate);
    const completedAt = new Date().toISOString();
    const warnings = [...ccgpResult.warnings.map((item) => `中国政府采购网：${item}`), ...ggzyResult.warnings, ...cebResult.warnings, ...chinaPostResult.warnings.map((item) => `中国邮政电子采购与供应平台：${item}`), ...zhejiangResult.warnings.map((item) => `浙江省公共资源交易服务平台：${item}`), ...shandongResult.warnings.map((item) => `山东省政府采购信息公开平台：${item}`)];
    const partial = warnings.length > 0 || (full && (!ccgpResult.complete || !ggzyResult.complete || !chinaPostResult.complete || !zhejiangResult.complete || !shandongResult.complete));
    const message = `本次从 ${SOURCE_DEFINITIONS.length} 个公开来源适配器执行采集，解析 ${incoming.length} 条，当前累计 ${projects.length} 条${partial ? "；任务部分完成，可继续执行" : "；当前批次已完成"}`;
    const sourceStates = {
      ccgp: { status: ccgpResult.warnings.length ? "partial" : "success", records: ccgpResult.records.length, warnings: ccgpResult.warnings, pagesScanned: ccgpResult.pagesScanned },
      ggzy: { status: ggzyResult.warnings.length ? "partial" : "success", records: ggzyResult.records.length, warnings: ggzyResult.warnings, pagesScanned: ggzyResult.pagesScanned },
      ceb: { status: cebResult.blocked ? "blocked" : "success", records: cebResult.records.length, warnings: cebResult.warnings, pagesScanned: cebResult.pagesScanned },
      "china-post": { status: chinaPostResult.warnings.length ? "partial" : "success", records: chinaPostResult.records.length, warnings: chinaPostResult.warnings, pagesScanned: chinaPostResult.pagesScanned }
      ,"zhejiang-ggzy": { status: zhejiangResult.warnings.length ? "partial" : "success", records: zhejiangResult.records.length, warnings: zhejiangResult.warnings, pagesScanned: zhejiangResult.pagesScanned },
      "shandong-ccgp": { status: shandongResult.warnings.length ? "partial" : "success", records: shandongResult.records.length, warnings: shandongResult.warnings, pagesScanned: shandongResult.pagesScanned }
    };
    const nextStore = { projects, meta: { ...store.meta, lastRunAt: startedAt, lastUpdatedAt: completedAt, lastRunMode: full ? "full" : "incremental", lastRunStatus: partial ? "partial" : "success", lastRunMessage: message, warnings, sourceStates, pagesScanned: ccgpResult.pagesScanned + ggzyResult.pagesScanned + cebResult.pagesScanned + chinaPostResult.pagesScanned + zhejiangResult.pagesScanned + shandongResult.pagesScanned, candidatesFound: ccgpResult.candidatesFound + ggzyResult.candidatesFound + chinaPostResult.candidatesFound + zhejiangResult.candidatesFound + shandongResult.candidatesFound, ccgpHistoryCursor: full ? ccgpResult.nextCursor : store.meta.ccgpHistoryCursor || null, ccgpHistoryComplete: full ? ccgpResult.complete : store.meta.ccgpHistoryComplete || false, ggzyHistoryCursor: full ? ggzyResult.nextCursor : store.meta.ggzyHistoryCursor || null, ggzyHistoryComplete: full ? ggzyResult.complete : store.meta.ggzyHistoryComplete || false, chinaPostHistoryComplete: full ? chinaPostResult.complete : store.meta.chinaPostHistoryComplete || false, sourceCount: SOURCE_DEFINITIONS.length, searchDateRange: `${startDate} 至 ${endDate}`, coverageStartDate: coverage.start, coverageEndDate: coverage.end, dateRange: `${coverage.start} 至 ${coverage.end}` } };
    await writeStore(nextStore);
    return { ...nextStore, incomingCount: incoming.length };
  } catch (error) {
    const nextStore = { ...store, meta: { ...store.meta, lastRunAt: startedAt, lastRunMode: full ? "full" : "incremental", lastRunStatus: "partial", lastRunMessage: `采集未完成：${error.message}`, warnings: [error.message], historyCursor: full ? (store.meta.historyCursor || { queryIndex: 0, page: 1 }) : store.meta.historyCursor || null, historyComplete: false, sourceCount: 1, dateRange: `${startDate} 至 ${endDate}` } };
    await writeStore(nextStore);
    return { ...nextStore, incomingCount: 0 };
  }
}

if (process.argv.includes("--enrich-results")) {
  enrichStoredResults().then((result) => console.log(`结果字段补充完成：扫描 ${result.scanned} 条，提取到 ${result.matched} 条，失败 ${result.warnings} 条`)).catch((error) => { console.error(error); process.exitCode = 1; });
} else if (process.argv.includes("--full")) {
  const startArgIndex = process.argv.indexOf("--start-date");
  const startDate = startArgIndex > -1 ? process.argv[startArgIndex + 1] : HISTORY_START_DATE;
  runCollection({ full: true, startDate }).then((store) => console.log(store.meta.lastRunMessage)).catch((error) => { console.error(error); process.exitCode = 1; });
} else if (process.argv.includes("--incremental")) {
  runCollection({ full: false }).then((store) => console.log(store.meta.lastRunMessage)).catch((error) => { console.error(error); process.exitCode = 1; });
}
