// The scripted walkthrough (research R11-7, SC-007): run -> pause ->
// speed change -> reset -> second run, in both themes at 1280x800,
// asserting every current widget is present and nothing is clipped.
import { test, expect } from "@playwright/test";

const WIDGETS = [
  "run-controls", "prompt-tokens", "gen-text", "token-strip", "kv-meter",
  "embed-wave", "layer-stack", "nucleus", "loopback", "model-facts",
  "bpe-micro",
];
const N = 6; // small run keeps the walk fast

async function setTheme(page: any, theme: string) {
  const cur = await page.evaluate(() => document.documentElement.dataset.theme);
  if (cur !== theme) await page.getByTestId("theme-toggle").click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(theme);
}

async function contrastRatio(page: any): Promise<number> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".app")!);
    const rgb = (c: string) => c.match(/[\d.]+/g)!.map(Number).slice(0, 3);
    const lum = (v: number[]) => {
      const [r, g, b] = v.map((x) => {
        x /= 255;
        return x > 0.03928 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const L1 = lum(rgb(cs.color)), L2 = lum(rgb(cs.backgroundColor));
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  });
}

async function noClipping(page: any) {
  for (const id of WIDGETS) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `${id} is visible`).toBeTruthy();
    expect(box!.x, `${id} left`).toBeGreaterThanOrEqual(0);
    expect(box!.y, `${id} top`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${id} right`).toBeLessThanOrEqual(1280);
    expect(box!.y + box!.height, `${id} bottom`).toBeLessThanOrEqual(800);
  }
}

for (const theme of ["dark", "light"] as const) {
  test(`walkthrough in ${theme}: run -> pause -> speed -> reset -> second run`, async ({ page }) => {
    await page.goto("/");
    await setTheme(page, theme);

    // every current widget is present
    for (const id of WIDGETS) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // contrast check (FR-012): foreground vs background from theme tokens
    expect(await contrastRatio(page)).toBeGreaterThanOrEqual(3);

    // arm a small run
    await page.getByTestId("max-tokens").fill(String(N));
    await page.getByTestId("run-btn").click();

    // pause mid-run: the queue keeps filling, the display freezes
    await page.waitForTimeout(500);
    await page.getByTestId("pause-btn").click();
    await page.waitForTimeout(200);
    const q1 = await page.evaluate(() => (window as any).__runStore.queue.length);
    const shown1 = await page.evaluate(
      () => (window as any).__runStore.get().generated.length);
    await page.waitForTimeout(600);
    const q2 = await page.evaluate(() => (window as any).__runStore.queue.length);
    const shown2 = await page.evaluate(
      () => (window as any).__runStore.get().generated.length);
    expect(shown2).toBe(shown1);            // display frozen while paused
    expect(q2).toBeGreaterThanOrEqual(q1);  // queue is the source of truth
    await page.getByTestId("pause-btn").click(); // resume

    // speed change mid-run
    await page.getByTestId("speed-seg").getByText("2×").click();
    await page.waitForFunction(
      () => (window as any).__runStore.get().phase === "finished");

    // populated lanes: still nothing clipped
    await noClipping(page);
    const n1 = await page.evaluate(() => (window as any).__runStore.get().nTokens);
    expect(n1).toBe(N);

    // weights drawer opens and closes (US4)
    await page.getByTestId("weights-btn").click();
    await expect(page.getByTestId("weights-drawer")).toBeVisible();
    await page.getByTestId("drawer-close").click();
    await expect(page.getByTestId("weights-drawer")).toHaveCount(0);

    // US4: clicking a LayerStack layer opens the drawer for that layer
    await page.getByTestId("layer-stack").getByText("L0", { exact: true }).click();
    await expect(page.getByTestId("weights-drawer")).toBeVisible();
    await page.getByTestId("drawer-close").click();

    // US5: vector space overlay — on, pick a layer, still not clipped, off
    await page.getByTestId("vs-toggle").click();
    await expect(page.getByTestId("vector-space")).toBeVisible();
    await page.getByTestId("vector-space").getByText("L0", { exact: true }).click();
    await page.waitForTimeout(200);
    const vsBox = await page.getByTestId("vector-space").boundingBox();
    expect(vsBox, "vector space visible").toBeTruthy();
    expect(vsBox!.x + vsBox!.width, "vs right").toBeLessThanOrEqual(1280);
    expect(vsBox!.y + vsBox!.height, "vs bottom").toBeLessThanOrEqual(800);
    await page.getByTestId("vs-toggle").click();
    await expect(page.getByTestId("vector-space")).toHaveCount(0);

    // reset clears all lanes
    await page.getByTestId("reset-btn").click();
    await expect(page.getByTestId("gen-text")).toContainText("generated text");
    expect(await page.evaluate(() => (window as any).__runStore.get().phase)).toBe("idle");

    // second run starts fresh and completes
    await page.getByTestId("run-btn").click();
    await page.waitForFunction(
      () => (window as any).__runStore.get().phase === "finished");
    const n2 = await page.evaluate(() => (window as any).__runStore.get().nTokens);
    expect(n2).toBe(N);
  });
}
