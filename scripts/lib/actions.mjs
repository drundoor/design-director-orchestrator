import fs from "node:fs/promises";
import path from "node:path";
import { relativeArtifactPath, slug } from "./browser-utils.mjs";

function locatorFor(page, selector = "body") {
  return page.locator(selector).first();
}

async function waitForStableLayout(page, ms = 250) {
  await page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let last = "";
        let stableSince = performance.now();
        const tick = () => {
          const current = `${document.documentElement.scrollWidth}:${document.documentElement.scrollHeight}:${document.body?.innerText?.length || 0}`;
          const now = performance.now();
          if (current !== last) {
            last = current;
            stableSince = now;
          }
          if (now - stableSince >= duration) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    ms,
  );
}

async function scrollBoundaryCheck(page, action) {
  const selector = action.selector || action.container || "body";
  const deltaY = action.y ?? action.deltaY ?? -240;
  const before = await page.locator(selector).first().evaluate((el) => ({
    elementTop: el.scrollTop,
    pageTop: window.scrollY,
    elementMax: el.scrollHeight - el.clientHeight,
    pageMax: Math.max(0, Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
    ) - window.innerHeight),
  }));
  await page.locator(selector).first().hover({ timeout: action.timeout });
  await page.mouse.wheel(action.x ?? action.deltaX ?? 0, deltaY);
  await page.waitForTimeout(action.waitMs ?? 120);
  const after = await page.locator(selector).first().evaluate((el) => ({
    elementTop: el.scrollTop,
    pageTop: window.scrollY,
    elementMax: el.scrollHeight - el.clientHeight,
    pageMax: Math.max(0, Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
    ) - window.innerHeight),
  }));
  const atBoundaryBefore = deltaY < 0 ? before.elementTop <= 0 : before.elementTop >= before.elementMax - 1;
  const pageCanScroll = deltaY < 0 ? before.pageTop > 0 : before.pageTop < before.pageMax - 1;
  const pageMoved = after.pageTop !== before.pageTop;
  if (atBoundaryBefore && pageCanScroll && !pageMoved) {
    throw new Error(`scrollBoundaryCheck failed for ${selector}: nested scroll was at boundary but page did not continue scrolling`);
  }
}

export async function runActions(page, actions = [], options = {}) {
  const timeout = options.timeout ?? 15000;
  const artifacts = options.artifacts || [];
  for (const [actionIndex, action] of actions.entries()) {
    const type = action.type || action.action;
    if (type === "wait") {
      await page.waitForTimeout(action.ms ?? action.waitMs ?? 250);
    } else if (type === "waitForSelector") {
      await page.waitForSelector(action.selector, { timeout: action.timeout ?? timeout, state: action.state || "visible" });
    } else if (type === "waitForNetworkIdle") {
      await page.waitForLoadState("networkidle", { timeout: action.timeout ?? timeout });
    } else if (type === "reload") {
      await page.reload({ waitUntil: action.waitUntil || "domcontentloaded", timeout: action.timeout ?? timeout });
    } else if (type === "waitForStableLayout") {
      await waitForStableLayout(page, action.ms ?? action.waitMs ?? 250);
    } else if (type === "click") {
      await locatorFor(page, action.selector).click({ timeout: action.timeout ?? timeout, button: action.button || "left" });
    } else if (type === "fill") {
      await locatorFor(page, action.selector).fill(action.value ?? "", { timeout: action.timeout ?? timeout });
    } else if (type === "type") {
      await locatorFor(page, action.selector).type(action.value ?? "", { delay: action.delay ?? 0, timeout: action.timeout ?? timeout });
    } else if (type === "focus") {
      await locatorFor(page, action.selector).focus({ timeout: action.timeout ?? timeout });
    } else if (type === "blur") {
      await locatorFor(page, action.selector).evaluate((el) => el.blur());
    } else if (type === "hover") {
      await locatorFor(page, action.selector).hover({ timeout: action.timeout ?? timeout });
    } else if (type === "press" || type === "keyboardShortcut") {
      if (action.selector) await locatorFor(page, action.selector).press(action.key || action.value, { timeout: action.timeout ?? timeout });
      else await page.keyboard.press(action.key || action.value);
    } else if (type === "select") {
      await locatorFor(page, action.selector).selectOption(action.value, { timeout: action.timeout ?? timeout });
    } else if (type === "check") {
      await locatorFor(page, action.selector).check({ timeout: action.timeout ?? timeout });
    } else if (type === "uncheck") {
      await locatorFor(page, action.selector).uncheck({ timeout: action.timeout ?? timeout });
    } else if (type === "scrollIntoView") {
      await locatorFor(page, action.selector).scrollIntoViewIfNeeded({ timeout: action.timeout ?? timeout });
    } else if (type === "scrollBy") {
      await page.evaluate(({ x = 0, y = 0 }) => window.scrollBy(x, y), { x: action.x, y: action.y });
    } else if (type === "scrollTo") {
      await page.evaluate(({ x = 0, y = 0 }) => window.scrollTo(x, y), { x: action.x, y: action.y });
    } else if (type === "wheel") {
      await page.mouse.wheel(action.x ?? action.deltaX ?? 0, action.y ?? action.deltaY ?? 0);
    } else if (type === "drag") {
      const start = action.from || { x: action.startX, y: action.startY };
      const end = action.to || { x: action.endX, y: action.endY };
      if (!start || !end) throw new Error("drag requires from/to or startX/startY/endX/endY");
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: action.steps ?? 8 });
      await page.mouse.up();
    } else if (type === "resizeViewport" || type === "setViewport") {
      await page.setViewportSize({ width: Number(action.width), height: Number(action.height) });
    } else if (type === "setLocalStorage" || type === "setSessionStorage") {
      const storageName = type === "setLocalStorage" ? "localStorage" : "sessionStorage";
      await page.evaluate(({ key, value, storageName }) => window[storageName].setItem(key, value), {
        key: action.key,
        value: String(action.value ?? ""),
        storageName,
      });
    } else if (type === "clearStorage") {
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
    } else if (type === "assertVisible") {
      try {
        await locatorFor(page, action.selector).waitFor({ state: "visible", timeout: action.timeout ?? timeout });
      } catch {
        throw new Error(`Expected visible selector: ${action.selector}`);
      }
    } else if (type === "assertHidden") {
      try {
        await locatorFor(page, action.selector).waitFor({ state: "hidden", timeout: action.timeout ?? timeout });
      } catch {
        throw new Error(`Expected hidden selector: ${action.selector}`);
      }
    } else if (type === "assertText") {
      const text = await locatorFor(page, action.selector).innerText({ timeout: action.timeout ?? timeout });
      if (!text.includes(action.value ?? action.text ?? "")) {
        throw new Error(`Expected text in ${action.selector}: ${action.value ?? action.text}`);
      }
    } else if (type === "assertNoHorizontalOverflow") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1);
      if (overflow) throw new Error("Expected no horizontal overflow");
    } else if (type === "screenshotElement") {
      const screenshotDir = options.screenshotDir || action.outDir || ".design-director/screenshots";
      await fs.mkdir(screenshotDir, { recursive: true });
      const viewportSlug = options.viewport ? `${options.viewport.width}x${options.viewport.height}` : "viewport";
      const nameSlug = slug(action.name || action.selector || "element");
      const stateSlug = slug(options.stateName || "state");
      const stateIndexSlug = Number.isInteger(options.stateIndex) ? String(options.stateIndex + 1) : "state-index";
      const routeHash = options.routeHash || "route";
      const fileName = `${stateSlug}-${stateIndexSlug}-${routeHash}-${viewportSlug}-action-${actionIndex + 1}-${nameSlug}.png`;
      const file = path.join(screenshotDir, fileName);
      await locatorFor(page, action.selector).screenshot({ path: file, timeout: action.timeout ?? timeout });
      const artifactPath = options.artifactPathBase ? relativeArtifactPath(options.artifactPathBase, file) : file;
      artifacts.push({ type: "element-screenshot", path: artifactPath, selector: action.selector, actionIndex, viewport: options.viewport || null, action });
    } else if (type === "scrollBoundaryCheck") {
      await scrollBoundaryCheck(page, { ...action, timeout: action.timeout ?? timeout });
    } else {
      throw new Error(`Unknown state action: ${type}`);
    }
  }
  return artifacts;
}
