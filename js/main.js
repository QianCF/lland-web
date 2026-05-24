import { LLand, preloadGameAssets } from "./lland.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");
const scoreEl = /** @type {HTMLElement} */ (document.getElementById("score"));
const loadingEl = /** @type {HTMLElement} */ (document.getElementById("loading"));

/** @type {LLand | null} */
let game = null;
let lastTime = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) game.resize(w, h);
}

function updateScore(score) {
  scoreEl.textContent = String(score);
}

function frame(now) {
  if (!game) {
    requestAnimationFrame(frame);
    return;
  }

  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
  lastTime = now;

  game.step(dt);
  game.drawFrame(ctx);

  requestAnimationFrame(frame);
}

function poke() {
  if (!game) return;
  const wasIdle = !game.playing;
  game.poke();
  if (wasIdle && game.playing) {
    scoreEl.classList.add("visible");
    scoreEl.classList.remove("game-over");
  }
}

function unpoke() {
  game?.unpoke();
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  poke();
});

canvas.addEventListener("pointerup", () => unpoke());
canvas.addEventListener("pointercancel", () => unpoke());

window.addEventListener("keydown", (e) => {
  if ([" ", "Enter", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    poke();
  }
});

window.addEventListener("keyup", (e) => {
  if ([" ", "Enter", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    unpoke();
  }
});

window.addEventListener("resize", resize);

async function init() {
  await preloadGameAssets();
  loadingEl.classList.add("hidden");

  game = new LLand(canvas);
  game.onScoreChange = updateScore;
  game.onGameOver = () => {
    scoreEl.classList.add("game-over");
  };
  game.onRestart = () => {
    scoreEl.classList.remove("game-over");
    scoreEl.classList.add("visible");
  };

  resize();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

init().catch((err) => {
  loadingEl.textContent = `加载失败: ${err.message}`;
  console.error(err);
});
