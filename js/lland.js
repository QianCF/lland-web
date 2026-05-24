import {
  DAY, DRAWABLE_BASE, NIGHT, POPS, SKIES, SUNSET, TWILIGHT,
  clamp01, createParams, frand, hexColor, hsvToRgb, irand, lerp, rlerp,
} from "./params.js";
import { drawPopSprite, drawVectorDrawable, getPopSprite, getVectorDrawable } from "./vectorDrawable.js";

const HULL = [
  0.3, 0, 0.7, 0, 0.92, 0.33, 0.92, 0.75, 0.6, 1, 0.4, 1, 0.08, 0.75, 0.08, 0.33,
];

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** @param {number} t @param {number} a @param {number} b @param {number} dur @param {number} delay */
function animVal(t, a, b, dur, delay = 0) {
  if (t < delay) return a;
  const p = Math.min(1, (t - delay) / dur);
  return lerp(p, a, b);
}

export class LLand {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

    this.w = 0;
    this.h = 0;
    /** @type {ReturnType<createParams>} */
    this.P = createParams(640);

    this.t = 0;
    this.dt = 0;
    this.score = 0;
    this.lastPipeTime = 0;
    this.animating = false;
    this.playing = false;
    this.frozen = false;
    this.frozenUntil = 0;
    this.flipped = false;
    this.timeOfDay = 0;
    this.gameOver = false;

    /** @type {object[]} */
    this.scenery = [];
    /** @type {object[]} */
    this.obstacles = [];
    /** @type {object | null} */
    this.player = null;
    /** @type {object | null} */
    this.celestial = null;

    this.onScoreChange = /** @type {(n: number) => void} */ (() => {});
    this.onGameOver = /** @type {() => void} */ (() => {});
    this.onRestart = /** @type {() => void} */ (() => {});
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.P = createParams(h);
    this.reset();
    this.start(false);
  }

  reset() {
    this.timeOfDay = irand(0, SKIES.length);
    this.flipped = frand() > 0.5;
    this.score = 0;
    this.onScoreChange(0);
    this.gameOver = false;

    this.scenery = [];
    this.obstacles = [];
    this.celestial = null;

    const showingSun =
      (this.timeOfDay === DAY || this.timeOfDay === SUNSET) && frand() > 0.25;
    if (showingSun) {
      const size = this.P.SUN_SIZE;
      this.celestial = {
        type: "sun",
        x: frand(size, this.w - size),
        y:
          this.timeOfDay === DAY
            ? frand(size, this.h * 0.66)
            : frand(this.h * 0.66, this.h - size),
        w: size,
        h: size,
        tint: this.timeOfDay === SUNSET ? "#ff8000" : null,
        alpha: this.timeOfDay === SUNSET ? 0.75 : 1,
      };
    } else {
      const dark = this.timeOfDay === NIGHT || this.timeOfDay === TWILIGHT;
      const ff = frand();
      if ((dark && ff < 0.75) || ff < 0.5) {
        const size = this.P.SUN_SIZE;
        this.celestial = {
          type: "moon",
          x: frand(size, this.w - size),
          y: frand(size, this.h - size),
          w: size,
          h: size,
          alpha: dark ? 1 : 0.5,
          flipX: frand() > 0.5,
          rotation: (frand() > 0.5 ? -1 : 1) * frand(5, 30),
        };
      }
    }

    const mh = this.h / 6;
    const cloudless = frand() < 0.25;
    const N = 20;
    for (let i = 0; i < N; i++) {
      const r1 = frand();
      /** @type {object} */
      let s;
      if (r1 < 0.3 && this.timeOfDay !== DAY) {
        const sz = irand(this.P.STAR_SIZE_MIN, this.P.STAR_SIZE_MAX);
        s = {
          kind: "star",
          x: frand(-sz, this.w + sz),
          y: frand() * frand() * this.h,
          w: sz,
          h: sz,
          v: 0,
        };
      } else if (r1 < 0.6 && !cloudless) {
        const sz = irand(this.P.CLOUD_SIZE_MIN, this.P.CLOUD_SIZE_MAX);
        const r = frand();
        s = {
          kind: "cloud",
          x: frand(-sz, this.w + sz),
          y: (1 - r * r * (this.h / 2)) + this.h / 2,
          w: sz,
          h: sz,
          v: frand(0.15, 0.5),
          off: frand() < 0.01,
        };
      } else {
        const z = i / N;
        const bw = irand(this.P.BUILDING_WIDTH_MIN, this.P.BUILDING_WIDTH_MAX);
        const bh = irand(this.P.BUILDING_HEIGHT_MIN, mh);
        s = {
          kind: "building",
          x: frand(-bw, this.w + bw),
          y: this.h - bh,
          w: bw,
          h: bh,
          z,
          v: 0.85 * z,
          color: hsvToRgb(175, 0.25, z),
        };
      }
      this.scenery.push(s);
    }

    this.player = {
      x: this.w / 2,
      y: this.h / 2,
      dv: 0,
      boosting: false,
      scale: 1,
      rotation: 0,
      visible: false,
      corners: new Float32Array(HULL.length),
    };

    this.t = 0;
    this.lastPipeTime = -this.P.OBSTACLE_PERIOD;
    this.animating = true;
    this.playing = false;
  }

  /** @param {boolean} startPlaying */
  start(startPlaying) {
    if (startPlaying) {
      this.playing = true;
      this.gameOver = false;
      this.t = 0;
      this.lastPipeTime = -this.P.OBSTACLE_PERIOD;
      if (this.player) {
        this.player.visible = true;
        this.player.x = this.w / 2;
        this.player.y = this.h / 2;
        this.player.dv = 0;
      }
    } else if (this.player) {
      this.player.visible = false;
    }
    this.animating = true;
  }

  stop() {
    if (!this.animating) return;
    this.playing = false;
    this.gameOver = true;
    this.animating = false;
    this.timeOfDay = irand(0, SKIES.length);
    this.frozen = true;
    this.frozenUntil = performance.now() + 250;
    this.onGameOver();
  }

  poke() {
    if (this.frozen && performance.now() < this.frozenUntil) return;

    if (this.frozen && performance.now() >= this.frozenUntil) {
      this.frozen = false;
    }

    if (!this.animating || this.gameOver) {
      this.reset();
      this.start(true);
      this.onRestart();
    } else if (!this.playing) {
      this.start(true);
    }

    if (this.player?.visible) {
      this.player.boosting = true;
      this.player.dv = -this.P.BOOST_DV;
      this.player.scale = 1.25;
    }
  }

  unpoke() {
    if (this.frozen && performance.now() < this.frozenUntil) return;
    if (!this.animating || !this.player) return;
    this.player.boosting = false;
    this.player.scale = 1;
  }

  /** @param {number} dtSec */
  step(dtSec) {
    if (!this.animating) return;

    this.dt = dtSec;
    this.t += dtSec;

    const P = this.P;

    if (this.player?.visible) {
      const p = this.player;
      if (p.boosting) {
        p.dv = -P.BOOST_DV;
      } else {
        p.dv += P.G;
      }
      if (p.dv < -P.MAX_V) p.dv = -P.MAX_V;
      else if (p.dv > P.MAX_V) p.dv = P.MAX_V;

      p.y += p.dv * dtSec;
      if (p.y < 0) p.y = 0;

      p.rotation =
        ((90 + lerp(clamp01(rlerp(p.dv, P.MAX_V, -P.MAX_V)), 90, -90)) * Math.PI) / 180;

      this.updatePlayerCorners();
    }

    for (const ob of this.obstacles) {
      ob.x -= P.TRANSLATION_PER_SEC * dtSec;
      this.updateObstacleHitRect(ob);

      if (ob.kind === "pop" && ob.spin) {
        ob.rotation += dtSec * 45 * ob.spinDir;
      }

      if (ob.animDuration > 0) {
        ob.animT += dtSec;
      }
    }

    for (const s of this.scenery) {
      s.x -= P.TRANSLATION_PER_SEC * dtSec * s.v;
      if (s.x + s.w < 0) s.x = this.w;
    }

    if (this.playing && this.player?.visible && this.playerBelowFloor()) {
      this.stop();
    }

    let passedBarrier = false;
    if (this.playing && this.player?.visible) {
      for (const ob of this.obstacles) {
        if (!ob.inPlay) continue;
        if (this.obstacleHitsPlayer(ob)) {
          this.stop();
          break;
        }
        if (this.obstacleCleared(ob)) {
          if (ob.kind === "stem") passedBarrier = true;
          ob.inPlay = false;
        }
      }
    }

    // 与原版一致：通过障碍后仍继续滚动，直到完全离开屏幕才移除
    this.obstacles = this.obstacles.filter((ob) => this.obstacleOnScreen(ob));

    if (passedBarrier) {
      this.score++;
      this.onScoreChange(this.score);
    }

    if (this.playing && this.t - this.lastPipeTime > P.OBSTACLE_PERIOD) {
      this.lastPipeTime = this.t;
      this.spawnObstaclePair();
    }

    this.updateObstacleAnims();
  }

  playerBelowFloor() {
    const p = this.player;
    if (!p) return false;
    for (let i = 0; i < p.corners.length / 2; i++) {
      if (p.corners[i * 2 + 1] >= this.h) return true;
    }
    return false;
  }

  updatePlayerCorners() {
    const p = this.player;
    if (!p) return;
    const inset = (this.P.PLAYER_SIZE - this.P.PLAYER_HIT_SIZE) / 2;
    const scale = this.P.PLAYER_HIT_SIZE;
    const px = p.x + inset;
    const py = p.y + inset;
    const cos = Math.cos(p.rotation);
    const sin = Math.sin(p.rotation);
    const cx = p.x + this.P.PLAYER_SIZE / 2;
    const cy = p.y + this.P.PLAYER_SIZE / 2;
    const sc = p.scale;

    for (let i = 0; i < HULL.length / 2; i++) {
      let lx = scale * HULL[i * 2] + inset;
      let ly = scale * HULL[i * 2 + 1] + inset;
      lx = (lx - this.P.PLAYER_SIZE / 2) * sc + this.P.PLAYER_SIZE / 2;
      ly = (ly - this.P.PLAYER_SIZE / 2) * sc + this.P.PLAYER_SIZE / 2;
      const rx = lx - this.P.PLAYER_SIZE / 2;
      const ry = ly - this.P.PLAYER_SIZE / 2;
      p.corners[i * 2] = cx + rx * cos - ry * sin;
      p.corners[i * 2 + 1] = cy + rx * sin + ry * cos;
    }
  }

  /** @param {object} ob */
  updateObstacleHitRect(ob) {
    if (ob.kind === "pop") {
      ob.cx = ob.x + ob.w / 2;
      ob.cy = ob.y + ob.h / 2;
      ob.r = ob.w / 2;
    } else {
      ob.hitLeft = ob.x;
      ob.hitTop = ob.y;
      ob.hitRight = ob.x + ob.w;
      ob.hitBottom = ob.y + ob.h;
    }
  }

  /** @param {object} ob */
  obstacleHitsPlayer(ob) {
    const p = this.player;
    if (!p) return false;
    const N = p.corners.length / 2;
    if (ob.kind === "pop") {
      for (let i = 0; i < N; i++) {
        const x = p.corners[i * 2];
        const y = p.corners[i * 2 + 1];
        if (Math.hypot(x - ob.cx, y - ob.cy) <= ob.r) return true;
      }
    } else {
      for (let i = 0; i < N; i++) {
        const x = p.corners[i * 2];
        const y = p.corners[i * 2 + 1];
        if (
          x >= ob.hitLeft &&
          x <= ob.hitRight &&
          y >= ob.hitTop &&
          y <= ob.hitBottom
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /** @param {object} ob */
  obstacleCleared(ob) {
    const p = this.player;
    if (!p) return ob.x + ob.w < 0;
    for (let i = 0; i < p.corners.length / 2; i++) {
      if (ob.kind === "pop") {
        if (ob.cx + ob.r >= p.corners[i * 2]) return false;
      } else if (ob.hitRight >= p.corners[i * 2]) {
        return false;
      }
    }
    return true;
  }

  /** 障碍是否仍在屏幕内（含缩放后的棒棒糖可视范围） */
  obstacleOnScreen(ob) {
    if (ob.kind === "pop") {
      const sc = ob.scale ?? 1;
      const half = (ob.w * sc) / 2;
      const cx = ob.x + ob.w / 2;
      return cx + half >= 0;
    }
    return ob.x + ob.w >= 0;
  }

  spawnObstaclePair() {
    const P = this.P;
    const obstacley =
      Math.random() * (this.h - 2 * P.OBSTACLE_MIN - P.OBSTACLE_GAP) + P.OBSTACLE_MIN;
    const inset = (P.OBSTACLE_WIDTH - P.OBSTACLE_STEM_WIDTH) / 2;
    const yinset = P.OBSTACLE_WIDTH / 2;

    const d1 = irand(0, 250) / 1000;
    const topStemH = obstacley - yinset;
    this.obstacles.push({
      kind: "stem",
      x: this.w + inset,
      y: -topStemH - yinset,
      w: P.OBSTACLE_STEM_WIDTH,
      h: topStemH,
      shadow: false,
      spawnT: this.t,
      animDuration: 0.25,
      animDelay: d1,
      yFrom: -topStemH - yinset,
      yTo: 0,
      inPlay: true,
    });

    const popIdx1 = irand(0, POPS.length);
    const popDef1 = POPS[popIdx1];
    this.obstacles.push({
      kind: "pop",
      id: popDef1.id,
      x: this.w,
      y: -P.OBSTACLE_WIDTH,
      w: P.OBSTACLE_WIDTH,
      h: P.OBSTACLE_WIDTH,
      scale: 0.25,
      flipX: frand() < 0.5,
      spin: popDef1.spin,
      spinDir: frand() < 0.5 ? -1 : 1,
      rotation: 0,
      spawnT: this.t,
      animDuration: 0.25,
      animDelay: d1,
      yFrom: -P.OBSTACLE_WIDTH,
      yTo: topStemH - inset,
      inPlay: true,
    });

    const d2 = irand(0, 250) / 1000;
    const botStemH = this.h - obstacley - P.OBSTACLE_GAP - yinset;
    this.obstacles.push({
      kind: "stem",
      x: this.w + inset,
      y: this.h + yinset,
      w: P.OBSTACLE_STEM_WIDTH,
      h: botStemH,
      shadow: true,
      spawnT: this.t,
      animDuration: 0.4,
      animDelay: d2,
      yFrom: this.h + yinset,
      yTo: this.h - botStemH,
      inPlay: true,
    });

    const popIdx2 = irand(0, POPS.length);
    const popDef2 = POPS[popIdx2];
    this.obstacles.push({
      kind: "pop",
      id: popDef2.id,
      x: this.w,
      y: this.h,
      w: P.OBSTACLE_WIDTH,
      h: P.OBSTACLE_WIDTH,
      scale: 0.25,
      flipX: frand() >= 0.5,
      spin: popDef2.spin,
      spinDir: frand() < 0.5 ? -1 : 1,
      rotation: 0,
      spawnT: this.t,
      animDuration: 0.4,
      animDelay: d2,
      yFrom: this.h,
      yTo: this.h - botStemH - yinset,
      inPlay: true,
    });
  }

  /** 更新障碍物入场动画 */
  updateObstacleAnims() {
    for (const ob of this.obstacles) {
      if (!ob.animDuration) continue;
      const age = this.t - ob.spawnT;
      ob.y = animVal(age, ob.yFrom, ob.yTo, ob.animDuration, ob.animDelay);
      if (ob.kind === "pop") {
        ob.scale = animVal(age, 0.25, 1, ob.animDuration, ob.animDelay);
      }
      this.updateObstacleHitRect(ob);
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  drawSky(ctx) {
    const [c0, c1] = SKIES[this.timeOfDay];
    const g = ctx.createLinearGradient(0, this.h, 0, 0);
    g.addColorStop(0, hexColor(c0));
    g.addColorStop(1, hexColor(c1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  drawFrame(ctx) {
    ctx.save();
    if (this.flipped) {
      ctx.translate(this.w, 0);
      ctx.scale(-1, 1);
    }

    this.drawSky(ctx);

    for (const s of this.scenery) {
      if (s.kind === "building") {
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.w, s.h);
      } else if (s.kind === "cloud") {
        const vd = getVectorDrawable(
          `${DRAWABLE_BASE}/${s.off ? "l_cloud_off" : "l_cloud"}.xml`,
        );
        ctx.save();
        ctx.translate(s.x, s.y);
        drawVectorDrawable(ctx, vd, s.w, s.h, { alpha: 0.25 });
        ctx.restore();
      } else if (s.kind === "star") {
        const vd = getVectorDrawable(`${DRAWABLE_BASE}/l_star.xml`);
        ctx.save();
        ctx.translate(s.x, s.y);
        drawVectorDrawable(ctx, vd, s.w, s.h);
        ctx.restore();
      }
    }

    if (this.celestial) {
      const c = this.celestial;
      const vd = getVectorDrawable(
        `${DRAWABLE_BASE}/${c.type === "sun" ? "l_sun" : "l_moon"}.xml`,
      );
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.rotation) {
        ctx.translate(c.w / 2, c.h / 2);
        ctx.rotate((c.rotation * Math.PI) / 180);
        ctx.translate(-c.w / 2, -c.h / 2);
      }
      drawVectorDrawable(ctx, vd, c.w, c.h, {
        tint: c.tint ?? undefined,
        alpha: c.alpha ?? 1,
        flipX: c.flipX ?? false,
      });
      ctx.restore();
    }

    for (const ob of this.obstacles) {
      if (ob.kind === "stem") {
        this.drawStem(ctx, ob);
      } else {
        this.drawPop(ctx, ob);
      }
    }

    if (this.player?.visible) {
      this.drawPlayer(ctx, this.player);
    }

    ctx.restore();
  }

  /** @param {CanvasRenderingContext2D} ctx @param {object} ob */
  drawStem(ctx, ob) {
    const x = ob.x;
    const y = ob.y;
    const w = ob.w;
    const h = ob.h;
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#aaaaaa");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    if (ob.shadow) {
      ctx.fillStyle = "rgba(170,170,170,0.9)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + this.P.OBSTACLE_WIDTH / 2 + w * 1.5);
      ctx.lineTo(x, y + this.P.OBSTACLE_WIDTH / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** @param {CanvasRenderingContext2D} ctx @param {object} ob */
  drawPop(ctx, ob) {
    const url = `${DRAWABLE_BASE}/${ob.id}.xml`;
    const sc = ob.scale ?? 1;
    const w = ob.w * sc;
    const h = ob.h * sc;
    const cx = ob.x + ob.w / 2;
    const cy = ob.y + ob.h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((ob.rotation * Math.PI) / 180);

    const sprite = getPopSprite(url);
    if (sprite) {
      drawPopSprite(ctx, sprite, w, h, { flipX: ob.flipX });
    } else {
      const vd = getVectorDrawable(url);
      if (ob.flipX) ctx.scale(-1, 1);
      ctx.translate(-w / 2, -h / 2);
      drawVectorDrawable(ctx, vd, w, h);
    }

    ctx.restore();
  }

  /** @param {CanvasRenderingContext2D} ctx @param {object} p */
  drawPlayer(ctx, p) {
    const vd = getVectorDrawable(`${DRAWABLE_BASE}/l_android.xml`);
    ctx.save();
    ctx.translate(p.x + this.P.PLAYER_SIZE / 2, p.y + this.P.PLAYER_SIZE / 2);
    ctx.rotate(p.rotation);
    ctx.scale(p.scale, p.scale);
    ctx.translate(-this.P.PLAYER_SIZE / 2, -this.P.PLAYER_SIZE / 2);
    drawVectorDrawable(ctx, vd, this.P.PLAYER_SIZE, this.P.PLAYER_SIZE, {
      tint: "#00ff00",
    });
    ctx.restore();
  }
}

export async function preloadGameAssets() {
  const { preloadDrawables, preloadPopSprites } = await import("./vectorDrawable.js");
  const { DRAWABLES, DRAWABLE_BASE, POPS } = await import("./params.js");
  await preloadDrawables(DRAWABLE_BASE, DRAWABLES);
  await preloadPopSprites(
    DRAWABLE_BASE,
    POPS.map((p) => p.id),
  );
}
