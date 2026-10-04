/**
 * UI evidence: full-page PNGs at 360 / 768 / 1280 + the network cost of a Playground selection change.
 *   npm run ui:shots                       # against http://localhost:3000 (start the app first)
 *   npm run ui:shots -- --url http://localhost:3100
 * Browser: env CHROME_PATH, else the default Windows Chrome path, else Playwright's "chrome" channel.
 * Exit 1 if the selection change issued any http(s) request or the page logged a console error.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const BASE_URL = arg("--url") ?? "http://localhost:3000";
const OUT_DIR = path.resolve("out/ui");
const DEFAULT_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WIDTHS = [360, 768, 1280] as const;
const HEIGHT: Record<(typeof WIDTHS)[number], number> = { 360: 760, 768: 1024, 1280: 800 };
const CACHE_TIMEOUT_MS = 90_000;
const SETTLE_MS = 1500;

async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH ?? DEFAULT_CHROME;
  if (fs.existsSync(executablePath)) return chromium.launch({ executablePath });
  console.log(`Chrome not found at ${executablePath}; using Playwright channel "chrome".`);
  return chromium.launch({ channel: "chrome" });
}

function watchConsole(page: Page, label: string, errors: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
}

/**
 * Scroll the whole page so lazy media (posters, thumbnails) load before anything is measured.
 * behavior "instant" overrides the page's CSS smooth scrolling, which would still be animating at capture time.
 */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

/** Resolves when the pack cache indicator settles; a failed cache is reported, not waited out. */
async function waitForCache(page: Page) {
  const done = page.getByText(/assets cached|failed to cache/);
  await done.first().waitFor({ timeout: CACHE_TIMEOUT_MS });
  const text = (await done.first().textContent()) ?? "";
  console.log(`CACHE_STATE="${text.trim()}"`);
}

async function openPage(browser: Browser, width: (typeof WIDTHS)[number], errors: string[]) {
  const page = await browser.newPage({ viewport: { width, height: HEIGHT[width] }, deviceScaleFactor: 1 });
  watchConsole(page, `${width}px`, errors);
  await page.goto(BASE_URL, { waitUntil: "load" });
  await page.getByTestId("ad-player").waitFor({ timeout: 30_000 });
  await waitForCache(page);
  await scrollThrough(page);
  await page.waitForLoadState("networkidle");
  return page;
}

async function measureSelection(browser: Browser, errors: string[]) {
  const page = await openPage(browser, 1280, errors);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  const select = (group: string, name: RegExp) =>
    page.getByRole("group", { name: group, exact: true }).getByRole("button", { name }).click();
  await select("Hook", /^H2/);
  await select("Body", /^B2/);
  await select("CTA", /^C2/);
  await select("Style", /^Clean/);
  await select("Music", /^M2/);
  await page.waitForTimeout(SETTLE_MS);

  const network = requests.filter((u) => /^https?:/.test(u));
  const local = requests.length - network.length;
  const variant = (await page.getByTestId("variant-id").textContent())?.trim();
  console.log(`VARIANT_AFTER_SELECT=${variant}`);
  console.log(`NETWORK_REQUESTS_ON_SELECT=${network.length}`);
  if (local) console.log(`  (+${local} in-memory blob:/data: loads, not network)`);
  for (const u of network) console.log(`  ${u}`);

  await page.getByTestId("program-monitor").screenshot({ path: path.join(OUT_DIR, "after-select.png") });
  await page.close();
  return network.length;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await launch();
  const errors: string[] = [];
  try {
    for (const width of WIDTHS) {
      const page = await openPage(browser, width, errors);
      const file = path.join(OUT_DIR, `${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
      await page.close();
    }
    const network = await measureSelection(browser, errors);
    console.log(`CONSOLE_ERRORS=${errors.length}`);
    for (const e of errors) console.log(`  ${e}`);
    process.exitCode = network > 0 || errors.length > 0 ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
