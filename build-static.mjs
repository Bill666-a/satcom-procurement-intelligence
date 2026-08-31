import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_SOURCE_CATALOG, readStore } from "./collector.mjs";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(ROOT_DIR, "public");

function summary(projects) {
  const amounts = projects.map((project) => Number(project.amountValue) || 0).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: projects.length,
    newCount: projects.filter((project) => project.date === today).length,
    publicAmountWan: amounts.reduce((sum, value) => sum + value, 0),
    maxAmountWan: Math.max(0, ...amounts),
    undisclosed: projects.filter((project) => project.amount === "未公布").length,
    typeCounts: projects.reduce((counts, project) => {
      counts[project.type] = (counts[project.type] || 0) + 1;
      return counts;
    }, {})
  };
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const indexHtml = (await fs.readFile(path.join(ROOT_DIR, "index.html"), "utf8")).replace('name="deployment-mode" content="server"', 'name="deployment-mode" content="static"');
await Promise.all([
  fs.writeFile(path.join(OUTPUT_DIR, "index.html"), indexHtml, "utf8"),
  ...["app.js", "styles.css"].map((file) => fs.copyFile(path.join(ROOT_DIR, file), path.join(OUTPUT_DIR, file)))
]);
const store = await readStore();
const payload = { projects: store.projects, summary: summary(store.projects), sourceCatalog: OFFICIAL_SOURCE_CATALOG, meta: store.meta };
await Promise.all([
  fs.writeFile(path.join(OUTPUT_DIR, "data.json"), JSON.stringify(payload), "utf8"),
  fs.writeFile(path.join(OUTPUT_DIR, ".nojekyll"), "", "utf8")
]);
console.log(`Static site built with ${store.projects.length} records.`);
