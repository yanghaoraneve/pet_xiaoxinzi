import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import {
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

type Direction = "left" | "right";
type PetState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

interface RowMetadata {
  frame_count: number;
  duration_ms_per_frame: number;
}

interface PetMetadata {
  rows: Record<PetState, RowMetadata>;
}

interface SkinDefinition {
  name: string;
  frame_base: string;
}

interface SkinManifest {
  default_skin: string;
  skins: Record<string, SkinDefinition>;
}

const appWindow = getCurrentWindow();
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const petImage = requiredElement<HTMLImageElement>("#pet-frame");
const loading = requiredElement<HTMLElement>("#loading");
const menu = requiredElement<HTMLElement>("#pet-menu");
const versionInfo = requiredElement<HTMLElement>("#version-info");
const updateButton = requiredElement<HTMLButtonElement>('button[data-action="check-update"]');

const ACTIONS: PetState[] = [
  "waving",
  "jumping",
  "waiting",
  "running",
  "review",
  "failed",
];
const WINDOW_SIZES = [330, 400, 480];
const AUTO_WALK_MIN_MS = 4_500;
const AUTO_WALK_MAX_MS = 7_500;
const AUTO_REST_MIN_MS = 3_500;
const AUTO_REST_MAX_MS = 6_500;
const SKIN_STORAGE_KEY = "pet-xiaoxinzi-skin";
const UPDATE_LAST_CHECK_KEY = "pet-xiaoxinzi-update-last-check";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

let metadata: PetMetadata;
let skinManifest: SkinManifest;
let currentSkin = "";
let currentState: PetState = "idle";
let currentFrame = 0;
let frameTimer: number | null = null;
let actionTimer: number | null = null;
let roamTimer: number | null = null;
let autoWalk = true;
let walking = false;
let currentDirection: Direction = "left";
let sizeIndex = 1;
let pointerDown = false;
let dragging = false;
let downX = 0;
let downY = 0;
let lastWindowX: number | null = null;
let dragIdleTimer: number | null = null;
let clickIndex = 0;
let currentVersion = "";
let updateCheckRunning = false;
let updateInstallRunning = false;
let noticeTimer: number | null = null;
const preloadedSkins = new Set<string>();

function frameUrl(state: PetState, index: number, skin = currentSkin): string {
  const base = skinManifest.skins[skin]?.frame_base;
  if (!base) throw new Error(`Unknown skin: ${skin}`);
  return `${base}/${state}/${String(index).padStart(2, "0")}.png`;
}

function showFrame(): void {
  petImage.src = frameUrl(currentState, currentFrame);
}

function clearFrameTimer(): void {
  if (frameTimer !== null) window.clearTimeout(frameTimer);
  frameTimer = null;
}

function startAnimation(state: PetState, restart = false): void {
  if (!restart && currentState === state && frameTimer !== null) return;
  clearFrameTimer();
  currentState = state;
  currentFrame = 0;
  showFrame();

  const tick = () => {
    const row = metadata.rows[currentState];
    currentFrame = (currentFrame + 1) % row.frame_count;
    showFrame();
    frameTimer = window.setTimeout(tick, row.duration_ms_per_frame);
  };
  frameTimer = window.setTimeout(tick, metadata.rows[state].duration_ms_per_frame);
}

function playAction(state: PetState, loops = 2): void {
  if (actionTimer !== null) window.clearTimeout(actionTimer);
  clearRoamTimer();
  void stopWalking(false);
  startAnimation(state, true);
  const row = metadata.rows[state];
  actionTimer = window.setTimeout(() => {
    actionTimer = null;
    startAnimation("idle");
    scheduleRoam();
  }, row.duration_ms_per_frame * row.frame_count * loops);
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function clearRoamTimer(): void {
  if (roamTimer !== null) window.clearTimeout(roamTimer);
  roamTimer = null;
}

function scheduleRoam(): void {
  clearRoamTimer();
  if (!autoWalk || dragging || actionTimer !== null) return;
  roamTimer = window.setTimeout(() => {
    const direction: Direction = Math.random() < 0.5 ? "left" : "right";
    void beginWalking(direction);
    roamTimer = window.setTimeout(() => {
      void stopWalking(true);
      scheduleRoam();
    }, randomBetween(AUTO_WALK_MIN_MS, AUTO_WALK_MAX_MS));
  }, randomBetween(AUTO_REST_MIN_MS, AUTO_REST_MAX_MS));
}

async function beginWalking(direction: Direction): Promise<void> {
  if (dragging || actionTimer !== null) return;
  currentDirection = direction;
  walking = true;
  startAnimation(direction === "left" ? "running-left" : "running-right");
  await invoke("set_walking", { enabled: true, direction });
}

async function stopWalking(returnToIdle: boolean): Promise<void> {
  walking = false;
  await invoke("set_walking", { enabled: false, direction: currentDirection }).catch(() => {});
  if (returnToIdle && !dragging && actionTimer === null) startAnimation("idle");
}

async function preloadFrames(skin: string): Promise<void> {
  if (preloadedSkins.has(skin)) return;
  const tasks: Promise<boolean>[] = [];
  for (const [state, row] of Object.entries(metadata.rows) as [PetState, RowMetadata][]) {
    for (let index = 0; index < row.frame_count; index += 1) {
      tasks.push(new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = frameUrl(state, index, skin);
      }));
    }
  }
  const results = await Promise.all(tasks);
  if (results.some((loaded) => !loaded)) {
    throw new Error(`Unable to preload every frame for skin: ${skin}`);
  }
  preloadedSkins.add(skin);
}

function updateSkinButtons(): void {
  menu.querySelectorAll<HTMLButtonElement>("button[data-skin]").forEach((button) => {
    const skin = button.dataset.skin ?? "";
    const selected = skin === currentSkin;
    button.textContent = `${selected ? "✓ " : ""}${skinManifest.skins[skin]?.name ?? skin}`;
    button.setAttribute("aria-pressed", String(selected));
  });
}

function showNotice(message: string, durationMs = 2_200): void {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  loading.textContent = message;
  loading.hidden = false;
  if (durationMs > 0) {
    noticeTimer = window.setTimeout(() => {
      loading.hidden = true;
      noticeTimer = null;
    }, durationMs);
  }
}

function updateVersionInfo(latestVersion?: string): void {
  const current = currentVersion ? `v${currentVersion}` : "未知";
  versionInfo.textContent = latestVersion
    ? `当前 ${current} · 可更新至 v${latestVersion}`
    : `当前版本：${current}`;
}

async function installUpdate(update: Update): Promise<void> {
  const notes = update.body?.trim();
  const message = [
    `发现新版本 v${update.version}，是否现在下载并安装？`,
    notes ? `\n更新说明：\n${notes}` : "",
    "\n安装完成后萌宠小欣子会自动重启。",
  ].join("");
  if (!window.confirm(message)) {
    await update.close();
    return;
  }

  updateInstallRunning = true;
  updateButton.disabled = true;
  let downloaded = 0;
  let contentLength = 0;
  try {
    showNotice(`正在准备更新至 v${update.version}…`, 0);
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? 0;
        showNotice(`正在下载 v${update.version}…`, 0);
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const percent = contentLength > 0
          ? Math.min(100, Math.round((downloaded / contentLength) * 100))
          : null;
        showNotice(percent === null ? "正在下载更新…" : `正在下载更新… ${percent}%`, 0);
      } else if (event.event === "Finished") {
        showNotice("更新下载完成，正在安装…", 0);
      }
    });
    showNotice("更新完成，正在重新启动…", 0);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    await relaunch();
  } finally {
    updateInstallRunning = false;
    updateButton.disabled = false;
  }
}

async function checkForUpdates(interactive: boolean): Promise<void> {
  if (updateCheckRunning || updateInstallRunning) {
    if (interactive) showNotice("更新任务正在进行中");
    return;
  }

  updateCheckRunning = true;
  updateButton.disabled = true;
  updateButton.textContent = "正在检查…";
  if (interactive) showNotice("正在检查新版本…", 0);

  try {
    const update = await check({ timeout: 30_000 });
    localStorage.setItem(UPDATE_LAST_CHECK_KEY, String(Date.now()));
    if (!update) {
      updateVersionInfo();
      updateButton.textContent = "检查更新";
      if (interactive) showNotice(`当前 v${currentVersion} 已是最新版本`);
      return;
    }

    updateVersionInfo(update.version);
    updateButton.textContent = `更新至 v${update.version}`;
    if (interactive) {
      await installUpdate(update);
    } else {
      showNotice(`发现新版本 v${update.version}，右键可更新`, 4_000);
      await update.close();
    }
  } catch (error) {
    updateVersionInfo();
    updateButton.textContent = "重新检查更新";
    console.error("Unable to check for updates", error);
    if (interactive) showNotice("暂时无法检查更新，请稍后重试");
  } finally {
    updateCheckRunning = false;
    updateButton.disabled = updateInstallRunning;
  }
}

async function setupUpdater(): Promise<void> {
  currentVersion = await getVersion();
  updateVersionInfo();
  const lastCheck = Number(localStorage.getItem(UPDATE_LAST_CHECK_KEY) ?? "0");
  if (!Number.isFinite(lastCheck) || Date.now() - lastCheck >= UPDATE_CHECK_INTERVAL_MS) {
    window.setTimeout(() => void checkForUpdates(false), 1_500);
  }
}

async function selectSkin(skin: string): Promise<void> {
  if (!skinManifest.skins[skin] || skin === currentSkin) {
    updateSkinButtons();
    return;
  }

  loading.textContent = `正在换上${skinManifest.skins[skin].name}…`;
  loading.hidden = false;
  try {
    await preloadFrames(skin);
    currentSkin = skin;
    currentFrame = 0;
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
    showFrame();
    updateSkinButtons();
    loading.hidden = true;
  } catch (error) {
    loading.textContent = "皮肤资源加载失败";
    console.error(error);
    window.setTimeout(() => {
      loading.hidden = true;
    }, 1_800);
  }
}

function setupPointerInteractions(): void {
  const DRAG_THRESHOLD = 7;

  petImage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerDown = true;
    dragging = false;
    downX = event.clientX;
    downY = event.clientY;
    petImage.setPointerCapture(event.pointerId);
  });

  petImage.addEventListener("pointermove", (event) => {
    if (!pointerDown || dragging) return;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragging = true;
    lastWindowX = null;
    clearRoamTimer();
    void stopWalking(false);
    currentDirection = dx < 0 ? "left" : "right";
    startAnimation(currentDirection === "left" ? "running-left" : "running-right");
    void appWindow.startDragging();
  });

  const finishPointer = (event: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    try {
      petImage.releasePointerCapture(event.pointerId);
    } catch {
      // Native window dragging may release pointer capture first.
    }
    if (dragging) {
      dragging = false;
      startAnimation("idle");
      scheduleRoam();
      return;
    }
    playAction(ACTIONS[clickIndex % ACTIONS.length]);
    clickIndex += 1;
  };

  petImage.addEventListener("pointerup", finishPointer);
  petImage.addEventListener("pointercancel", finishPointer);

  void appWindow.onMoved(({ payload }) => {
    if (!dragging) {
      lastWindowX = payload.x;
      return;
    }
    if (lastWindowX !== null) {
      const dx = payload.x - lastWindowX;
      if (Math.abs(dx) >= 1) {
        currentDirection = dx < 0 ? "left" : "right";
        startAnimation(currentDirection === "left" ? "running-left" : "running-right");
      }
    }
    lastWindowX = payload.x;
    if (dragIdleTimer !== null) window.clearTimeout(dragIdleTimer);
    dragIdleTimer = window.setTimeout(() => {
      if (dragging) startAnimation("idle");
    }, 220);
  });
}

function placeMenu(x: number, y: number): void {
  menu.hidden = false;
  menu.style.visibility = "hidden";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  requestAnimationFrame(() => {
    const margin = 8;
    const width = menu.offsetWidth;
    const height = Math.min(menu.scrollHeight, window.innerHeight - margin * 2);
    menu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - height - margin))}px`;
    menu.style.visibility = "visible";
  });
}

function setupMenu(): void {
  petImage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    placeMenu(event.clientX, event.clientY);
  });

  menu.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target) return;
    const state = target.dataset.state as PetState | undefined;
    const skin = target.dataset.skin;
    const action = target.dataset.action;
    menu.hidden = true;

    if (skin) {
      void selectSkin(skin);
      return;
    }
    if (state) {
      playAction(state, state === "idle" ? 1 : 2);
      return;
    }
    if (action === "toggle-walk") {
      autoWalk = !autoWalk;
      target.textContent = autoWalk ? "暂停自动移动" : "开启自动移动";
      if (autoWalk) scheduleRoam();
      else {
        clearRoamTimer();
        void stopWalking(true);
      }
      return;
    }
    if (action === "check-update") {
      void checkForUpdates(true);
      return;
    }
    if (action === "resize") {
      sizeIndex = (sizeIndex + 1) % WINDOW_SIZES.length;
      const size = WINDOW_SIZES[sizeIndex];
      void appWindow.setSize(new LogicalSize(size, size));
      return;
    }
    if (action === "reset-position") {
      void invoke("reset_position");
      return;
    }
    if (action === "quit") void invoke("quit_app");
  });

  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node)) menu.hidden = true;
  });
  window.addEventListener("blur", () => {
    menu.hidden = true;
  });
}

async function main(): Promise<void> {
  const [metadataResponse, skinsResponse] = await Promise.all([
    fetch("/assets/metadata.json"),
    fetch("/assets/skins.json"),
  ]);
  if (!metadataResponse.ok) throw new Error("Unable to load pet metadata");
  if (!skinsResponse.ok) throw new Error("Unable to load skin metadata");
  metadata = await metadataResponse.json() as PetMetadata;
  skinManifest = await skinsResponse.json() as SkinManifest;

  const storedSkin = localStorage.getItem(SKIN_STORAGE_KEY);
  currentSkin = storedSkin && skinManifest.skins[storedSkin]
    ? storedSkin
    : skinManifest.default_skin;
  if (!skinManifest.skins[currentSkin]) throw new Error("Default skin is missing");

  await preloadFrames(currentSkin);
  loading.hidden = true;
  startAnimation("idle");
  setupPointerInteractions();
  setupMenu();
  updateSkinButtons();
  await setupUpdater();

  await listen<{ direction: Direction }>("walk-direction", (event) => {
    if (!walking) return;
    currentDirection = event.payload.direction;
    startAnimation(currentDirection === "left" ? "running-left" : "running-right");
  });
  scheduleRoam();
}

void main().catch((error) => {
  loading.textContent = "资源加载失败";
  console.error(error);
});
