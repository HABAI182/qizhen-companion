const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const C = require('./common.cjs');
const {fs, path, OUT, W, H, N, original, strokeMask, alpha, intersect, featherInside, savePart} = C;

const bridges = [
  {
    id: 'hair-ribbon-seam-bridge',
    name: '绶带下方发束接缝补色',
    path: 'M932 504 C946 531 964 548 970 572 C986 590 1006 611 1021 626 C1052 658 1072 677 1103 703 L1120 740',
    thickness: 44,
    offset: [-12, 0],
    tintWeight: .22,
    parentDeformer: 'RotationDeformerZJUHeadRotation',
    drawOrder: 96,
  },
  {
    id: 'hair-collar-seam-bridge',
    name: '左发梢与衣领接缝补色',
    path: 'M399 845 C416 848 430 853 444 858 S462 866 474 875',
    thickness: 24,
    offset: [-3, 14],
    tintWeight: .86,
    drawOrder: 98,
  },
];
const completeCollar = {
  ...bridges[1],
  id: 'hair-collar-overlap-complete',
  name: '左发梢与衣领接缝补色 · 完整叠层',
  path: 'M397 878 C414 874 421 853 438 854 C465 858 486 869 511 877 S537 888 568 897',
  thickness: 36,
  offset: [-3, 17],
};
const rightCollar = {
  ...completeCollar,
  id: 'hair-right-collar-overlap',
  name: '右发梢与袖口内缘叠层',
  path: 'M675 899 C698 896 717 888 732 875 C750 863 768 854 797 853',
  thickness: 39,
  offset: [3, 20],
};

async function main() {
  const source = await original();
  // The approved unsplit art uses alpha 253 in much of the interior.
  // Preserve its intentional openings and avoid painting on its silhouette.
  const interior = featherInside(alpha(source).map(value => value >= 246 ? 255 : 0), 3);
  const right = process.argv.includes('--right-collar');
  const completeLeft = process.argv.includes('--complete-collar');
  const selected = right ? [rightCollar] : completeLeft ? [completeCollar] : bridges;
  const plans = [];
  for (const bridge of selected) {
    const coverage = intersect(await strokeMask(bridge.path, bridge.thickness), interior);
    assert.ok(coverage.filter(value => value === 255).length > 600);
    const pixels = Buffer.alloc(N * 4);
    for (let index = 0; index < N; index++) {
      if (!coverage[index]) continue;
      const x = index % W, y = Math.floor(index / W);
      const sampleX = x + bridge.offset[0], sampleY = y + bridge.offset[1];
      assert.ok(sampleX >= 0 && sampleX < W && sampleY >= 0 && sampleY < H);
      const target = index * 4, sample = (sampleY * W + sampleX) * 4;
      const blend = source[sample + 3] >= 246 ? bridge.tintWeight : 0;
      for (let channel = 0; channel < 3; channel++)
        pixels[target + channel] = Math.round(source[target + channel] * (1 - blend) + source[sample + channel] * blend);
      pixels[target + 3] = 255;
    }
    const asset = await savePart(bridge.id, bridge.name, pixels, coverage, 'hair-seam-support');
    const bytes = fs.readFileSync(path.join(OUT, asset.file));
    plans.push({
      sourceLayer: asset.id, file: asset.file, name: `ZJU-v14-${asset.id}`,
      width: asset.width, height: asset.height, x: asset.x, y: asset.y,
      columns: Math.ceil(asset.width / 12), rows: Math.ceil(asset.height / 12),
      drawOrder: bridge.drawOrder,
      ...(bridge.parentDeformer ? {parentDeformer: bridge.parentDeformer} : {}),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const file = right ? 'hair-right-collar-native-plan.json' :
    completeLeft ? 'hair-collar-overlap-native-plan.json' : 'hair-seam-bridge-native-plan.json';
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(plans, null, 2) + '\n');
  console.log(JSON.stringify(plans));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
