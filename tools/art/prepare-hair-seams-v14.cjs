const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const C = require('./common.cjs');
const {fs, path, ROOT, OUT, W, H, N, rgba, strokeMask, intersect, alpha, savePart} = C;

const plans = [
  {
    id: 'hair-under-ribbon',
    name: '右侧绶带背后的发束接缝',
    path: 'M950 525 C963 544 963 560 972 572 L1004 608 L1043 651 L1103 701 L1126 754',
    thickness: 62,
    // Use the dark hair immediately inward of the exposed ribbon cut.
    sourceOffset: [-20, 0],
    parentDeformer: 'RotationDeformerZJUHeadRotation',
    drawOrder: 96,
  },
  {
    id: 'hair-under-collar',
    name: '画面左侧发梢与衣领接缝',
    path: 'M410 832 C408 852 421 863 429 879 C435 894 446 905 462 909',
    thickness: 46,
    // Pick up the cool fabric at the collar without painting on the face.
    sourceOffset: [-10, 13],
    drawOrder: 98,
  },
];

function protectedInterior(data) {
  const source = alpha(data);
  const mask = Buffer.alloc(N);
  for (let y = 1; y + 1 < H; y++) {
    for (let x = 1; x + 1 < W; x++) {
      const i = y * W + x;
      if (source[i] === 255 && source[i - 1] === 255 && source[i + 1] === 255
          && source[i - W] === 255 && source[i + W] === 255) mask[i] = 255;
    }
  }
  return mask;
}

function sampleUnderpaint(source, coverage, offset) {
  const layer = Buffer.alloc(N * 4);
  for (let i = 0; i < coverage.length; i++) {
    if (!coverage[i]) continue;
    const x = i % W, y = Math.floor(i / W), sx = x + offset[0], sy = y + offset[1];
    const candidate = (sy * W + sx) * 4;
    const j = i * 4;
    const usable = sx >= 0 && sx < W && sy >= 0 && sy < H && source[candidate + 3] === 255;
    for (let channel = 0; channel < 3; channel++) {
      // A little of the local color retains the original shading gradient
      // while the neighbouring hair/fabric covers the split underneath.
      layer[j + channel] = usable
        ? Math.round(.8 * source[candidate + channel] + .2 * source[j + channel])
        : source[j + channel];
    }
    layer[j + 3] = 255;
  }
  return layer;
}

async function main() {
  const source = await rgba(path.join(ROOT, 'art/v14-psd-review/neutral.png'));
  const guard = protectedInterior(source);
  const parts = [];
  for (const plan of plans) {
    const coverage = intersect(await strokeMask(plan.path, plan.thickness), guard);
    assert.ok(coverage.filter(value => value !== 0).length > 200);
    const pixels = sampleUnderpaint(source, coverage, plan.sourceOffset);
    const asset = await savePart(plan.id, plan.name, pixels, coverage, 'hidden-hair-support');
    const file = fs.readFileSync(path.join(OUT, asset.file));
    parts.push({
      sourceLayer: asset.id, file: asset.file,
      name: `ZJU-v14-${asset.id}`,
      width: asset.width, height: asset.height, x: asset.x, y: asset.y,
      columns: Math.ceil(asset.width / 12),
      rows: Math.ceil(asset.height / 12),
      drawOrder: plan.drawOrder, ...(plan.parentDeformer ? {parentDeformer: plan.parentDeformer} : {}),
      sha256: crypto.createHash('sha256').update(file).digest('hex'),
    });
  }
  fs.writeFileSync(path.join(OUT, 'hair-seam-native-plan.json'), JSON.stringify(parts, null, 2) + '\n');
  console.log(JSON.stringify(parts));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
