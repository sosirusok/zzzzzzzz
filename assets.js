(() => {
  const manifest = {
    fireman: { src: 'assets/reference/fireman.png', crop: [48, 60, 112, 185], key: [112, 111, 102], tolerance: 38 },
    medic: { src: 'assets/reference/medic.png', crop: [5, 78, 76, 140], key: [112, 113, 107], tolerance: 38 },
    archer: { src: 'assets/reference/archer.png', crop: [35, 59, 84, 108], key: [35, 45, 48], tolerance: 30 },
    chairman: { src: 'assets/reference/chairman-job.png', crop: [180, 180, 900, 780], key: [0, 255, 0], tolerance: 1 },

    crazy: { src: 'assets/reference/stage1-enemies.png', crop: [235, 370, 145, 240], key: [52, 48, 52], tolerance: 14 },
    giant: { src: 'assets/reference/stage1-enemies.png', crop: [963, 270, 184, 340], key: [52, 48, 52], tolerance: 14 },
    blind: { src: 'assets/reference/stage1-enemies.png', crop: [1320, 448, 215, 170], key: [52, 48, 52], tolerance: 14 },

    athlete: { src: 'assets/reference/stage2-enemies.png', crop: [105, 135, 205, 320], key: [52, 48, 52], tolerance: 14 },
    chef: { src: 'assets/reference/stage2-enemies.png', crop: [495, 165, 190, 300], key: [38, 38, 38], tolerance: 14 },
    bag: { src: 'assets/reference/stage2-enemies.png', crop: [845, 275, 165, 190], key: [52, 48, 52], tolerance: 14 },
    glutton: { src: 'assets/reference/stage2-enemies.png', crop: [1195, 160, 220, 305], key: [52, 48, 52], tolerance: 14 },
    facility: { src: 'assets/reference/facility.png', crop: [115, 35, 365, 325], key: [75, 51, 17], tolerance: 32 },

    girl: { src: 'assets/reference/stage3-enemies-a.png', crop: [56, 462, 170, 305], key: [52, 48, 52], tolerance: 14 },
    rabbit: { src: 'assets/reference/stage3-enemies-a.png', crop: [612, 238, 225, 530], key: [52, 48, 52], tolerance: 14 },
    nurse: { src: 'assets/reference/stage3-enemies-b.png', crop: [258, 105, 250, 470], key: [38, 38, 38], tolerance: 14 },
    liquid: { src: 'assets/reference/stage3-enemies-b.png', crop: [790, 305, 235, 270], key: [52, 48, 52], tolerance: 14 },

    tank: { src: 'assets/reference/stage4-enemies.png', crop: [0, 210, 455, 445], key: [52, 48, 52], tolerance: 14 },
    liquidBoss: { src: 'assets/reference/stage4-enemies.png', crop: [645, 365, 270, 300], key: [52, 48, 52], tolerance: 14 }
  };

  const sprites = new Map();
  const sourceImages = new Map();

  function loadImage(src) {
    if (sourceImages.has(src)) return sourceImages.get(src);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
    sourceImages.set(src, promise);
    return promise;
  }

  function colorKey(canvas, key, tolerance) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    const toleranceSquared = tolerance * tolerance * 3;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] - key[0];
      const green = data[index + 1] - key[1];
      const blue = data[index + 2] - key[2];
      if ((red * red) + (green * green) + (blue * blue) <= toleranceSquared) data[index + 3] = 0;
    }
    context.putImageData(pixels, 0, 0);
  }

  async function load(name) {
    if (sprites.has(name)) return sprites.get(name);
    const definition = manifest[name];
    if (!definition) return null;
    const image = await loadImage(definition.src);
    const [sourceX, sourceY, width, height] = definition.crop;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
    colorKey(canvas, definition.key, definition.tolerance);
    sprites.set(name, canvas);
    return canvas;
  }

  async function preload(names = Object.keys(manifest)) {
    await Promise.all(names.map((name) => load(name).catch(() => null)));
    return sprites;
  }

  window.ZOMBIE_ASSETS = { manifest, load, preload, get: (name) => sprites.get(name) || null };
})();
