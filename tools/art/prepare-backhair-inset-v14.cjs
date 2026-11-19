const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {fs, path, sharp, ROOT, OUT, SOURCE, W, H, rgba, alpha, mask, union, intersect, cut} = require('./common.cjs');

const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/parts/manifest.json'), 'utf8'));
const registeredHash = '5cbfb32ee7c436413117006cc8107c8a0ae138c59e2a89d4da28695e448b4970';
const registeredRect = {left: 1, top: 155, width: 1253, height: 970};

async function originalOpacity(id) {
  const layer = legacy.layers.find(candidate => candidate.id === id);
  const file = path.join(ROOT, 'public', layer.file);
  const {data} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const result = Buffer.alloc(W * H);
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++)
      result[(layer.y + y) * W + layer.x + x] = data[(y * layer.width + x) * 4 + 3];
  }
  return result;
}

async function main() {
  const [head, left, right, featherL, featherR, ahoge, scalp, neutral, painted] = await Promise.all([
    ...['head', 'side-hair-left', 'side-hair-right', 'feather-left', 'feather-right', 'ahoge'].map(originalOpacity),
    mask('M195 620 C187 358 363 159 643 159 C920 151 1114 344 1124 601 C1125 809 1027 1017 821 1080 L399 1080 C271 989 192 816 195 620Z'),
    rgba(path.join(ROOT, 'art/parts-neutral.png')),
    rgba(path.join(SOURCE, 'v14/back-hair-raw.png')),
  ]);
  const solid = alpha(neutral).map(value => value === 255 ? 255 : 0);
  const coverage = union(head, left, right, intersect(featherL, scalp), intersect(featherR, scalp), intersect(ahoge, scalp));
  // libvips dilate expands dark areas. For a white opacity mask that
  // contracts the opaque side, protecting the thin strands and air gaps.
  const inset = await sharp(coverage, {raw: {width: W, height: H, channels: 1}})
    .dilate(4).greyscale().raw().toBuffer();
  const pixels = cut(painted, intersect(solid, inset));
  const png = await sharp(pixels, {raw: {width: W, height: H, channels: 4}})
    .extract(registeredRect).png().toBuffer();
  const hash = createHash('sha256').update(png).digest('hex');
  assert.equal(hash, registeredHash, 'Prepared pixels differ from the registered Cubism image');
  const output = path.join(OUT, 'back-hair-inset.png');
  if (fs.existsSync(output)) assert.ok(fs.readFileSync(output).equals(png), 'Existing source differs');
  else fs.writeFileSync(output, png, {flag: 'wx'});
  console.log(JSON.stringify({
    art: 'art/parts-v14/back-hair-inset.png',
    registeredRect,
    sha256: hash,
    coveredPixels: alpha(pixels).filter(value => value > 0).length,
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
