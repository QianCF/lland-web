/**
 * 解析 Android Vector Drawable XML，在 Canvas 上绘制（保持原始 pathData 不变）
 */

/** @typedef {{ viewportW: number, viewportH: number, paths: { d: string, rawD: string, color: string }[] }} VectorDrawable */

/** 将 Android pathData 规范化为 Path2D 可稳定解析的 SVG 路径 */
export function normalizePathData(d) {
  return d
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([-0-9])/g, "$1 $2")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} hex */
function fillColorToSvg(hex) {
  if (!hex.startsWith("#")) return hex;
  if (hex.length === 9) {
    const a = parseInt(hex.slice(1, 3), 16) / 255;
    const r = parseInt(hex.slice(3, 5), 16);
    const g = parseInt(hex.slice(5, 7), 16);
    const b = parseInt(hex.slice(7, 9), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return hex;
}

/** @param {string} hex @returns {{ css: string, alpha: number }} */
function parseFillColor(hex) {
  if (!hex.startsWith("#")) return { css: hex, alpha: 1 };
  if (hex.length === 9) {
    const a = parseInt(hex.slice(1, 3), 16) / 255;
    const r = parseInt(hex.slice(3, 5), 16);
    const g = parseInt(hex.slice(5, 7), 16);
    const b = parseInt(hex.slice(7, 9), 16);
    return { css: `rgb(${r},${g},${b})`, alpha: a };
  }
  return { css: hex, alpha: 1 };
}

/** @param {string} xml @returns {VectorDrawable} */
export function parseVectorXml(xml) {
  const viewportW = parseFloat(
    xml.match(/android:viewportWidth="([^"]+)"/)?.[1] ??
      xml.match(/viewportWidth="([^"]+)"/)?.[1] ??
      "48",
  );
  const viewportH = parseFloat(
    xml.match(/android:viewportHeight="([^"]+)"/)?.[1] ??
      xml.match(/viewportHeight="([^"]+)"/)?.[1] ??
      "48",
  );

  /** @type {VectorDrawable["paths"]} */
  const paths = [];
  const pathRe = /<path\b[^>]*\/?>/gs;
  let block;
  while ((block = pathRe.exec(xml)) !== null) {
    const tag = block[0];
    const rawD = tag.match(/android:pathData="([^"]+)"/)?.[1];
    const color = tag.match(/android:fillColor="([^"]+)"/)?.[1];
    if (rawD && color) {
      paths.push({ d: normalizePathData(rawD), rawD, color });
    }
  }
  return { viewportW, viewportH, paths };
}

/** 供 SVG / Path2D 使用的路径（命令字母与数字之间必须有空格） */
export function pathDataForSvg(d) {
  let s = normalizePathData(d);
  // 椭圆弧的第 4、5 参数为 large-arc / sweep 标志，必须是 0 或 1
  s = s.replace(
    /\b([aA])\s+((?:-?[\d.]+(?:\s+-?[\d.]+){6}))/g,
    (_match, cmd, group) => {
      const nums = group.trim().split(/\s+/);
      nums[3] = String(Math.round(parseFloat(nums[3])));
      nums[4] = String(Math.round(parseFloat(nums[4])));
      return `${cmd} ${nums.join(" ")}`;
    },
  );
  return s;
}

/** @param {VectorDrawable} vd @returns {string} */
export function vectorDrawableToSvg(vd) {
  const body = vd.paths
    .map(
      (p) =>
        `<path d="${pathDataForSvg(p.rawD)}" fill="${fillColorToSvg(p.color)}" fill-rule="nonzero"/>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${vd.viewportW} ${vd.viewportH}">` +
    body +
    `</svg>`
  );
}

/** @type {Map<string, VectorDrawable>} */
const cache = new Map();

/** @type {Map<string, HTMLCanvasElement>} */
export const popSpriteCache = new Map();

const POP_BAKE_SIZE = 200;

/** @param {string} url @returns {VectorDrawable} */
export function getVectorDrawable(url) {
  const vd = cache.get(url);
  if (!vd) throw new Error(`Drawable not preloaded: ${url}`);
  return vd;
}

/** @param {string} url @returns {HTMLCanvasElement | undefined} */
export function getPopSprite(url) {
  return popSpriteCache.get(url);
}

/** @param {string} url */
export async function loadVectorDrawable(url) {
  if (cache.has(url)) return cache.get(url);
  const xml = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}`);
    return r.text();
  });
  const vd = parseVectorXml(xml);
  cache.set(url, vd);
  return vd;
}

/** @param {CanvasRenderingContext2D} ctx @param {VectorDrawable} vd @param {number} w @param {number} h @param {object} [opts] */
export function drawVectorDrawable(ctx, vd, w, h, opts = {}) {
  const { tint, alpha = 1, flipX = false } = opts;
  ctx.save();
  if (flipX) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.scale(w / vd.viewportW, h / vd.viewportH);
  for (const p of vd.paths) {
    let path;
    try {
      path = new Path2D(p.d);
    } catch {
      continue;
    }
    if (tint != null) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tint;
      ctx.fill(path);
      continue;
    }
    const { css, alpha: ca } = parseFillColor(p.color);
    ctx.globalAlpha = alpha * ca;
    ctx.fillStyle = css;
    ctx.fill(path);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 通过浏览器 SVG 引擎光栅化，正确渲染弧线等 Path2D 无法解析的路径 */
/** @param {string} url @param {number} [size] */
export async function bakePopSprite(url, size = POP_BAKE_SIZE) {
  if (popSpriteCache.has(url)) return popSpriteCache.get(url);

  const vd = await loadVectorDrawable(url);
  const svg = vectorDrawableToSvg(vd);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  const img = new Image();
  img.decoding = "async";
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error(`SVG rasterize failed: ${url}`));
    img.src = blobUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(blobUrl);

  popSpriteCache.set(url, canvas);
  return canvas;
}

/** @param {string} base @param {string[]} names */
export async function preloadDrawables(base, names) {
  await Promise.all(names.map((n) => loadVectorDrawable(`${base}/${n}.xml`)));
}

/** @param {string} base @param {string[]} popIds */
export async function preloadPopSprites(base, popIds) {
  popSpriteCache.clear();
  await Promise.all(popIds.map((id) => bakePopSprite(`${base}/${id}.xml`)));
}

/** @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} sprite @param {number} w @param {number} h @param {object} [opts] */
export function drawPopSprite(ctx, sprite, w, h, opts = {}) {
  if (opts.flipX) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
}
