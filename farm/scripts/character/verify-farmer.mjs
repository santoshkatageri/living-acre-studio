/**
 * Screenshot the farmer *in the running app*.
 *
 * The brief is explicit that a Blender viewport does not count: the character
 * has to be checked inside the hectare, with the real camera, the real walk and
 * the real light. This drives the app in headless Chromium — using the stills
 * rig in `src/hectare/render/farmer-inspect.ts` for the posed views, and the
 * real controls for the gameplay ones — and writes the set into
 * `reports/character/`.
 *
 * A development tool, not part of the build. It needs two packages that are
 * deliberately not in `package.json`:
 *
 *     npm install --no-save puppeteer-core @sparticuz/chromium
 *     npm run dev -- --port 5175          # in another shell
 *     node scripts/character/verify-farmer.mjs
 *
 * On a bare container Chromium will not start without the X11/NSS client
 * libraries; `bpy_shim.py` in this folder is the same trick applied to Blender.
 * Point `LD_LIBRARY_PATH` at empty stand-ins and it runs headless.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "reports", "character");
const BASE = process.env.FARM_URL ?? "http://127.0.0.1:5175/";
const VIEW = { width: 900, height: 700, deviceScaleFactor: 1.5 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Posed stills, taken through the in-app stills rig. */
const STILLS = [
  { name: "world-front", query: "inspect=farmer&orbit=0&distance=8", settle: 2500 },
  { name: "world-three-quarter", query: "inspect=farmer&orbit=40&distance=8", settle: 2500 },
  { name: "world-side", query: "inspect=farmer&orbit=270&distance=8", settle: 2500 },
  { name: "world-back", query: "inspect=farmer&orbit=180&distance=8", settle: 2500 },
  { name: "world-walk", query: "inspect=farmer&orbit=40&distance=8&clip=Walk&phase=0.25", settle: 2500 },
  { name: "world-run", query: "inspect=farmer&orbit=40&distance=8&clip=Run&phase=0.3", settle: 2500 },
  { name: "world-gesture", query: "inspect=farmer&orbit=350&distance=8&clip=Gesture", settle: 1500 },
  { name: "world-feed", query: "inspect=farmer&orbit=320&distance=8&clip=FeedCattle", settle: 1600 },
  { name: "world-water", query: "inspect=farmer&orbit=30&distance=8&clip=WaterCrops", settle: 1400 },
  { name: "world-bend", query: "inspect=farmer&orbit=320&distance=8&clip=BendDown", settle: 1200 },
  { name: "world-look", query: "inspect=farmer&orbit=340&distance=8&clip=LookAround", settle: 2400 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: VIEW,
  });
  const problems = [];

  const open = async (query) => {
    const page = await browser.newPage();
    await page.setViewport(VIEW);
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("requestfailed", (request) => problems.push(`${request.url()} failed`));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" || /farmer|model/i.test(text)) problems.push(`${message.type()}: ${text}`);
    });
    const url = query ? `${BASE}?${query}` : BASE;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
    return page;
  };

  // The character is small in a 900×700 frame, so each still is cropped to him:
  // the stills rig keeps him dead centre, a third of the way down.
  const crop = { x: VIEW.width * 0.29, y: VIEW.height * 0.10, width: VIEW.width * 0.42, height: VIEW.height * 0.82 };

  for (const still of STILLS) {
    const page = await open(still.query);
    await wait(still.settle);
    await page.screenshot({ path: join(OUT, `farmer-${still.name}.png`), clip: crop });
    console.log(`wrote farmer-${still.name}.png`);
    await page.close();
  }

  // And the real thing: the follow camera, a click to walk, an arrival.
  const page = await open("");
  await wait(4500);
  await page.setViewport({ ...VIEW });
  // The page opens in third person, on the farmer's shoulder: step in closer.
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowUp");
  await wait(1500);
  await page.screenshot({ path: join(OUT, "farmer-world-gameplay-walk.png") });
  console.log("wrote farmer-world-gameplay-walk.png");

  const box = await (await page.$("canvas")).boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.36);
  await wait(1400);
  await page.screenshot({ path: join(OUT, "farmer-world-gameplay-stride.png") });
  console.log("wrote farmer-world-gameplay-stride.png");

  await wait(12_000);
  await page.screenshot({ path: join(OUT, "farmer-world-gameplay-arrived.png") });
  console.log("wrote farmer-world-gameplay-arrived.png");

  // The farm camera too: this is the view the whole farm is designed around.
  await page.keyboard.press("c");
  await wait(1500);
  await page.screenshot({ path: join(OUT, "farmer-world-farm-view.png") });
  console.log("wrote farmer-world-farm-view.png");

  const facts = await page.evaluate(() => ({
    place: document.querySelector(".hud-place, [data-place]")?.textContent ?? "",
    canvas: (() => {
      const element = document.querySelector("canvas");
      return element ? `${element.width}×${element.height}` : "none";
    })(),
  }));
  console.log("page:", JSON.stringify(facts));
  console.log(problems.length ? `--- problems ---\n${[...new Set(problems)].join("\n")}` : "no console problems");

  await browser.close();
  if (problems.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
