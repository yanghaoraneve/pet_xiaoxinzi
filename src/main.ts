import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";

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

const appWindow = getCurrentWindow();
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const petImage = requiredElement<HTMLImageElement>("#pet-frame");
const loading = requiredElement<HTMLElement>("#loading");
const menu = requiredElement<HTMLElement>("#pet-menu");

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

let metadata: PetMetadata;
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

function frameUrl(state: PetState, index: number): string {
  return `/assets/frames/${state}/${String(index).padStart(2, "0")}.png`;
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

async function preloadFrames(): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const [state, row] of Object.entries(metadata.rows) as [PetState, RowMetadata][]) {
    for (let index = 0; index < row.frame_count; index += 1) {
      tasks.push(new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = frameUrl(state, index);
      }));
    }
  }
  await Promise.all(tasks);
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
    const action = target.dataset.action;
    menu.hidden = true;

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
  const response = await fetch("/assets/metadata.json");
  if (!response.ok) throw new Error("Unable to load pet metadata");
  metadata = await response.json() as PetMetadata;
  await preloadFrames();
  loading.hidden = true;
  startAnimation("idle");
  setupPointerInteractions();
  setupMenu();

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
