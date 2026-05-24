/** 游戏参数，对应 lland_config.xml（按屏幕高度缩放 dp） */

/** @param {number} h 屏幕高度 px */
export function createParams(h) {
  const dp = h / 640;
  const dim = (v) => v * dp;

  const TRANSLATION_PER_SEC = dim(100);
  const OBSTACLE_SPACING = dim(380);

  return {
    dp,
    TRANSLATION_PER_SEC,
    OBSTACLE_SPACING,
    OBSTACLE_PERIOD: OBSTACLE_SPACING / TRANSLATION_PER_SEC,
    BOOST_DV: dim(550),
    PLAYER_HIT_SIZE: dim(40),
    PLAYER_SIZE: dim(40),
    OBSTACLE_WIDTH: dim(90),
    OBSTACLE_STEM_WIDTH: dim(12),
    OBSTACLE_GAP: dim(170),
    OBSTACLE_MIN: dim(40),
    BUILDING_WIDTH_MIN: dim(20),
    BUILDING_WIDTH_MAX: dim(250),
    BUILDING_HEIGHT_MIN: dim(20),
    CLOUD_SIZE_MIN: dim(10),
    CLOUD_SIZE_MAX: dim(100),
    SUN_SIZE: dim(45),
    STAR_SIZE_MIN: dim(3),
    STAR_SIZE_MAX: dim(5),
    G: dim(30),
    MAX_V: dim(1000),
  };
}

export const SKIES = [
  [0xc0c0ff, 0xa0a0ff], // DAY
  [0x000010, 0x000000], // NIGHT
  [0x000040, 0x000010], // TWILIGHT
  [0xa08020, 0x204080], // SUNSET
];

export const DAY = 0;
export const NIGHT = 1;
export const TWILIGHT = 2;
export const SUNSET = 3;

export const POPS = [
  { id: "l_pop_belt", spin: false },
  { id: "l_pop_droid", spin: false },
  { id: "l_pop_pizza", spin: true },
  { id: "l_pop_stripes", spin: false },
  { id: "l_pop_swirl", spin: true },
  { id: "l_pop_vortex", spin: true },
  { id: "l_pop_vortex2", spin: true },
];

export const DRAWABLE_BASE = "assets/drawable";

export const DRAWABLES = [
  "l_android",
  "l_cloud",
  "l_cloud_off",
  "l_star",
  "l_sun",
  "l_moon",
  "l_pop_belt",
  "l_pop_droid",
  "l_pop_pizza",
  "l_pop_stripes",
  "l_pop_swirl",
  "l_pop_vortex",
  "l_pop_vortex2",
];

export function lerp(x, a, b) {
  return (b - a) * x + a;
}

export function rlerp(v, a, b) {
  return (v - a) / (b - a);
}

export function clamp01(f) {
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

export function frand(a, b) {
  if (a === undefined) return Math.random();
  return lerp(Math.random(), a, b);
}

export function irand(a, b) {
  return Math.floor(lerp(Math.random(), a, b));
}

export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}

/** @param {number} color 0xRRGGBB */
export function hexColor(color) {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}
