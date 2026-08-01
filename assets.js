(() => {
  "use strict";

  const ROOT = "assets/runtime/";
  const manifest = Object.freeze({
    lobby: { src: `${ROOT}maps/lobby.png` },
    stage0: { src: `${ROOT}maps/stage0.png` },
    stage1: { src: `${ROOT}maps/stage1.png` },
    stage2: { src: `${ROOT}maps/stage2.png` },
    stage3: { src: `${ROOT}maps/stage3.png` },
    stage4: { src: `${ROOT}maps/stage4.png` },

    archer: { src: `${ROOT}job-archer.png`, pivot: [0.5, 0.92] },
    medic: { src: `${ROOT}job-medic.png`, pivot: [0.5, 0.92] },
    chairman: { src: `${ROOT}job-chairman.png`, pivot: [0.5, 0.92], pixelScale: 5 },
    fireman: { src: `${ROOT}job-fireman.png`, pivot: [0.5, 0.92] },

    crazy: { src: `${ROOT}motion-crazy.png`, frames: 4, fps: 10, pivot: [0.5, 0.93] },
    blind: { src: `${ROOT}motion-blind.png`, frames: 4, fps: 10, pivot: [0.5, 0.82] },
    girl: { src: `${ROOT}motion-girl.png`, frames: 4, fps: 6.67, pivot: [0.5, 0.93] },
    nurse: { src: `${ROOT}motion-nurse.png`, frames: 4, fps: 6.67, pivot: [0.5, 0.94] },
    giant: { src: `${ROOT}enemy-giant.png`, pivot: [0.5, 0.95] },
    athlete: { src: `${ROOT}enemy-athlete.png`, pivot: [0.5, 0.94] },
    chef: { src: `${ROOT}enemy-chef.png`, pivot: [0.5, 0.94] },
    bag: { src: `${ROOT}enemy-bag.png`, pivot: [0.5, 0.92] },
    glutton: { src: `${ROOT}enemy-glutton.png`, pivot: [0.5, 0.94] },
    rabbit: { src: `${ROOT}enemy-rabbit.png`, pivot: [0.5, 0.94] },
    liquid: { src: `${ROOT}enemy-liquid.png`, pivot: [0.5, 0.92] },
    tank: { src: `${ROOT}enemy-tank.png`, pivot: [0.5, 0.94] },
    facility: { src: `${ROOT}object-facility.png`, pivot: [0.5, 0.78] },
    boss: {
      src: "assets/reference/boss.png",
      crop: [110, 16, 720, 610],
      key: [151, 0, 42],
      tolerance: 44,
      pivot: [0.5, 0.92],
    },
  });

  const loaded = new Map();

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${source}`));
      image.src = source;
    });
  }

  function keyedCrop(image, definition) {
    if (!definition.crop && !definition.key) return image;
    const [sx, sy, sw, sh] = definition.crop || [0, 0, image.naturalWidth, image.naturalHeight];
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d", { willReadFrequently: Boolean(definition.key) });
    context.imageSmoothingEnabled = false;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    if (!definition.key) return canvas;
    const pixels = context.getImageData(0, 0, sw, sh);
    const [kr, kg, kb] = definition.key;
    const limit = (definition.tolerance || 24) ** 2 * 3;
    for (let index = 0; index < pixels.data.length; index += 4) {
      const dr = pixels.data[index] - kr;
      const dg = pixels.data[index + 1] - kg;
      const db = pixels.data[index + 2] - kb;
      if ((dr * dr) + (dg * dg) + (db * db) <= limit) pixels.data[index + 3] = 0;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  async function load(name) {
    if (loaded.has(name)) return loaded.get(name);
    const definition = manifest[name];
    if (!definition) return null;
    const promise = loadImage(definition.src).then((image) => keyedCrop(image, definition));
    loaded.set(name, promise);
    return promise;
  }

  async function preload() {
    const entries = await Promise.all(Object.keys(manifest).map(async (name) => [name, await load(name).catch(() => null)]));
    entries.forEach(([name, value]) => loaded.set(name, value));
    return entries;
  }

  function get(name) {
    const value = loaded.get(name);
    return value && typeof value.then !== "function" ? value : null;
  }

  function sourceFrame(name, now = 0) {
    const definition = manifest[name];
    const image = get(name);
    if (!image || !definition) return null;
    const count = definition.frames || 1;
    const width = image.width / count;
    const frame = count === 1 ? 0 : Math.floor((now / 1000) * definition.fps) % count;
    return { image, definition, sx: frame * width, sy: 0, sw: width, sh: image.height };
  }

  function draw(context, name, x, y, options = {}) {
    const frame = sourceFrame(name, options.now || performance.now());
    if (!frame) return false;
    const { image, definition, sx, sy, sw, sh } = frame;
    const scale = options.scale || definition.pixelScale || 1;
    const targetHeight = options.height || sh * scale;
    const targetWidth = options.width || (sw / sh) * targetHeight;
    const pivot = definition.pivot || [0.5, 1];
    context.save();
    context.imageSmoothingEnabled = false;
    context.globalAlpha = options.alpha ?? 1;
    context.translate(Math.round(x), Math.round(y));
    if (options.flipX) context.scale(-1, 1);
    context.drawImage(
      image,
      sx, sy, sw, sh,
      Math.round(-targetWidth * pivot[0]),
      Math.round(-targetHeight * pivot[1]),
      Math.round(targetWidth),
      Math.round(targetHeight),
    );
    context.restore();
    return true;
  }

  window.EP1_ASSETS = { manifest, preload, load, get, draw, sourceFrame };
})();
