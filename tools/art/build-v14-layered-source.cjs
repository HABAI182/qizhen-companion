const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {ColorMode, initializeCanvas, readPsd, writePsdBuffer} = require('ag-psd');
const {createCanvas} = require('@napi-rs/canvas');

initializeCanvas(createCanvas);

const root = path.resolve(__dirname, '../..');
const art = path.join(root, 'art');
const review = path.join(art, 'v14-psd-review');
const neutralAppearanceFile = 'v14-psd-review/native-neutral-appearance.json';
const psdFile = 'ZjuNiang-v14-layered-source.psd';
const readOptions = {useImageData: true, skipThumbnail: true, throwForMissingFeatures: true};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

const descriptions = {
  'face-native-complete': '完整脸底与隐藏额头',
  'front-hair-native': '原画刘海与前发',
  'back-hair-complete': '完整后发与饰品背后补绘',
  'back-hair-inset': '后发与饰品背后补绘 · 内收轮廓',
  'wrist-bridge-R': '鼠标手腕与袖口连接',
  'wrist-bridge-L': '键盘手腕与袖口连接',
  'eye-fringe-occlusion': '眼前刘海遮挡',
  'mouth-interior': '张口口腔',
  'hair-under-ribbon': '绶带后发束 · 初版补色',
  'hair-under-collar': '左发梢与衣领 · 初版补色',
  'hair-ribbon-seam-bridge': '绶带下方发束接缝补色',
  'hair-collar-seam-bridge': '左发梢与衣领接缝补色',
  'hair-collar-overlap-complete': '左发梢与衣领接缝补色 · 完整叠层',
  'hair-right-collar-overlap': '右发梢与袖口内缘叠层',
};
for (const [side, label] of [['left', '画面左眼'], ['right', '画面右眼']]) {
  for (const [part, name] of Object.entries({
    white: '完整眼白',
    iris: '虹膜与瞳孔',
    'upper-lash': '上睫毛',
    'lower-lash': '下睫毛',
    'closed-clean': '完全闭合睫毛',
  })) descriptions[`eye-screen-${side}-${part}`] = `${label} · ${name}`;
}

async function decodeLayer(asset, width, height) {
  const input = await fs.readFile(path.join(root, asset.sourceFile));
  const digest = sha256(input);
  if (asset.sha256) assert.equal(digest, asset.sha256, asset.id);
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.equal(info.channels, 4, asset.id);
  assert.equal(info.width, asset.width, asset.id);
  assert.equal(info.height, asset.height, asset.id);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x + asset.x >= width || y + asset.y >= height || x + asset.x < 0 || y + asset.y < 0)
        assert.equal(data[(y * info.width + x) * 4 + 3], 0, `Drawn pixels off canvas: ${asset.id}`);
    }
  }
  return {digest, imageData: {width: info.width, height: info.height, data: new Uint8ClampedArray(data)}};
}

function alphaMask(layer) {
  const {data, width, height} = layer.imageData;
  const gray = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    gray[i] = gray[i + 1] = gray[i + 2] = data[i + 3];
    gray[i + 3] = 255;
  }
  return {
    top: layer.top,
    left: layer.left,
    defaultColor: 0,
    disabled: false,
    positionRelativeToLayer: false,
    imageData: {width, height, data: gray},
  };
}

function maskFactor(mask, x, y) {
  if (mask == null || mask.disabled) return 1;
  const col = x - mask.left, row = y - mask.top;
  const {width, height, data} = mask.imageData;
  if (col < 0 || row < 0 || col >= width || row >= height) return mask.defaultColor / 255;
  return data[(row * width + col) * 4] / 255;
}

function compose(width, height, layers) {
  const result = new Float64Array(width * height * 4);
  for (const layer of layers) {
    if (layer.hidden) continue;
    assert.equal(layer.blendMode, 'normal');
    const {imageData, left, top, mask, opacity} = layer;
    for (let y = Math.max(top, 0); y < Math.min(top + imageData.height, height); y++) {
      for (let x = Math.max(left, 0); x < Math.min(left + imageData.width, width); x++) {
        const s = ((y - top) * imageData.width + x - left) * 4;
        const {data} = imageData;
        if (!data[s + 3]) continue;
        const a = data[s + 3] / 255 * opacity * maskFactor(mask, x, y);
        const d = (y * width + x) * 4;
        result[d] = data[s] * a + result[d] * (1 - a);
        result[d + 1] = data[s + 1] * a + result[d + 1] * (1 - a);
        result[d + 2] = data[s + 2] * a + result[d + 2] * (1 - a);
        result[d + 3] = a + result[d + 3] * (1 - a);
      }
    }
  }
  const data = new Uint8ClampedArray(result.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = result[i + 3];
    data[i + 3] = Math.round(alpha * 255);
    if (!data[i + 3]) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(result[i + c] / alpha);
  }
  return {width, height, data};
}

function verifyPixels(expected, actual, label) {
  assert.deepEqual([actual.width, actual.height], [expected.width, expected.height], label);
  assert.ok(Buffer.from(actual.data.buffer, actual.data.byteOffset, actual.data.byteLength)
    .equals(Buffer.from(expected.data.buffer, expected.data.byteOffset, expected.data.byteLength)), label);
}

function verifyLayer(before, after) {
  for (const key of ['name', 'left', 'top', 'hidden', 'opacity', 'blendMode'])
    assert.equal(after[key], before[key], `${before.name} ${key}`);
  verifyPixels(before.imageData, after.imageData, before.name);
  if (!before.mask) {
    assert.equal(after.mask, undefined, before.name);
    return;
  }
  for (const key of ['left', 'top', 'defaultColor', 'disabled', 'positionRelativeToLayer'])
    assert.equal(after.mask[key], before.mask[key], `${before.name} mask ${key}`);
  verifyPixels(before.mask.imageData, after.mask.imageData, `${before.name} mask pixels`);
}

function compareMerged(merged, original) {
  let maxPremultipliedError = 0;
  for (let i = 0; i < original.data.length; i += 4) {
    const alpha = original.data[i + 3];
    assert.equal(merged.data[i + 3], alpha, `Merged alpha at pixel ${i / 4}`);
    for (let c = 0; c < 3; c++) {
      const error = Math.abs(original.data[i + c] - merged.data[i + c]);
      if (alpha === 255) assert.equal(error, 0, `Merged opaque color at pixel ${i / 4}`);
      maxPremultipliedError = Math.max(maxPremultipliedError, error * alpha / 255);
    }
  }
  // The merged preview stores an 8-bit white matte. Writing may truncate by one
  // level and removing the matte may round by half a level.
  assert.ok(maxPremultipliedError <= 1.5, `PSD merged matte error: ${maxPremultipliedError}`);
  return maxPremultipliedError;
}

async function main() {
  const [legacy, legacyPsd, {state: appearance}, eyes, structure, backHairInset, mouth, closedPlan, closedBinding,
    firstHairSupport, hairBridges, completeCollar, rightCollar, marks] = await Promise.all([
    readJson(path.join(root, 'public/assets/parts/manifest.json')),
    fs.readFile(path.join(art, 'ZjuNiang-v13-parts.psd')).then(bytes => readPsd(bytes, readOptions)),
    readJson(path.join(art, neutralAppearanceFile)),
    readJson(path.join(art, 'native-eyes-v14/parts.json')),
    readJson(path.join(art, 'native-structure-v14/parts.json')),
    readJson(path.join(art, 'native-backhair-inset-v14/asset.json')),
    readJson(path.join(art, 'native-mouth-v14/asset.json')),
    readJson(path.join(art, 'parts-v14/closed-native-plan.json')),
    readJson(path.join(art, 'native-eyes-v14/closed-refined.json')).then(entry => entry.nativeClosedStrokes),
    readJson(path.join(art, 'native-hair-seams-v14/parts.json')),
    readJson(path.join(art, 'native-hair-seam-bridges-v14/parts.json')),
    readJson(path.join(art, 'native-hair-collar-overlap-v14/parts.json')),
    readJson(path.join(art, 'native-hair-right-collar-v14/parts.json')),
    readJson(path.join(art, 'source/official-marks/来源.json')),
  ]);
  for (const {id, value} of appearance.parameters)
    assert.equal(value, ['ParamEyeLOpen', 'ParamEyeROpen'].includes(id) ? 1 : 0, `Pose is not neutral: ${id}`);
  const {width, height} = legacy.canvas;
  assert.deepEqual([legacyPsd.width, legacyPsd.height], [width, height]);
  const nativeNames = new Map(appearance.items.map(mesh => [mesh.name, mesh.id]));
  const inherited = legacy.layers.map(layer => ({
    ...layer,
    nativeId: nativeNames.get(`${layer.name} [${layer.id}]`),
    layerName: `${layer.name} [${layer.id}]`,
    sourceFile: `public${layer.file}`,
    inherited: true,
  }));
  const closed = closedPlan.map(plan => ({
    ...plan, meshId: closedBinding.find(binding => binding.source === plan.file)?.meshId,
  }));
  const imported = [...eyes, ...structure, backHairInset, mouth, ...closed,
    ...firstHairSupport, ...hairBridges, ...completeCollar, ...rightCollar].map(layer => {
    const id = layer.sourceLayer ?? layer.id;
    return {
      ...layer,
      id,
      nativeId: layer.meshId,
      layerName: `${descriptions[id] ?? layer.name} [${id}]`,
      sourceFile: `art/parts-v14/${layer.file}`,
    };
  });
  const assets = [...inherited, ...imported];
  assert.equal(new Set(assets.map(asset => asset.nativeId)).size, appearance.items.length);
  assert.equal(assets.length, appearance.items.length);
  assert.deepEqual(assets.map(asset => asset.nativeId).sort(), appearance.items.map(mesh => mesh.id).sort());

  const artwork = await Promise.all(appearance.items.map(async mesh => {
    const asset = assets.find(input => input.nativeId === mesh.id);
    const {imageData, digest} = await decodeLayer(asset, width, height);
    if (asset.inherited) {
      const oldLayer = legacyPsd.children.find(layer => layer.name === asset.layerName);
      assert.equal(oldLayer.left, asset.x, asset.id);
      assert.equal(oldLayer.top, asset.y, asset.id);
      verifyPixels(imageData, oldLayer.imageData, asset.id);
    }
    return {
      asset, mesh, digest,
      layer: {
        name: asset.layerName,
        left: asset.x,
        top: asset.y,
        hidden: !mesh.visible || mesh.opacity === 0,
        opacity: mesh.opacity === 0 ? 1 : mesh.opacity,
        blendMode: 'normal',
        imageData,
      },
    };
  }));
  artwork.sort((a, b) => a.mesh.drawOrder - b.mesh.drawOrder);
  for (const {asset, mesh, layer} of artwork) {
    if (!mesh.masks.length) continue;
    assert.equal(mesh.masks.length, 1, mesh.id);
    const maskSource = artwork.find(candidate => candidate.mesh.id === mesh.masks[0]);
    assert.equal(maskSource.asset.id, asset.id.replace('-iris', '-white'));
    layer.mask = alphaMask(maskSource.layer);
    let hiddenIrisPixels = 0;
    for (let y = 0; y < layer.imageData.height; y++) {
      for (let x = 0; x < layer.imageData.width; x++) {
        if (layer.imageData.data[(y * layer.imageData.width + x) * 4 + 3] > 32
            && maskFactor(layer.mask, x + layer.left, y + layer.top) === 0) hiddenIrisPixels++;
      }
    }
    assert.ok(hiddenIrisPixels > 100, `No hidden iris coverage for ${mesh.id}`);
  }

  const layers = artwork.map(item => item.layer);
  assert.equal(new Set(layers.map(layer => layer.name)).size, layers.length);
  assert.equal(layers.filter(layer => layer.mask).length, 2);
  assert.ok(artwork.find(item => item.asset.id === 'official-eagle-hairpin').layer.hidden);
  assert.ok(artwork.filter(item => item.asset.id.startsWith('official-complete-')).every(item => !item.layer.hidden));
  const inset = artwork.find(item => item.asset.id === 'back-hair-inset');
  assert.ok(!inset.layer.hidden && inset.mesh.drawOrder < artwork.find(item => item.asset.id === 'torso').mesh.drawOrder);
  assert.ok(artwork.find(item => item.asset.id === 'back-hair-complete').layer.hidden);
  assert.ok(artwork.find(item => item.asset.id === 'mouth-interior').layer.hidden);
  assert.ok(!artwork.find(item => item.asset.id === 'mouth').layer.hidden);
  assert.ok(firstHairSupport.every(part => artwork.find(item => item.asset.id === part.sourceLayer).layer.hidden));
  assert.ok(artwork.find(item => item.asset.id === 'hair-collar-seam-bridge').layer.hidden);
  assert.ok(!artwork.find(item => item.asset.id === 'hair-ribbon-seam-bridge').layer.hidden);
  assert.ok(!artwork.find(item => item.asset.id === 'hair-collar-overlap-complete').layer.hidden);
  assert.ok(!artwork.find(item => item.asset.id === 'hair-right-collar-overlap').layer.hidden);
  const merged = compose(width, height, layers);
  const iccProfile = legacyPsd.imageResources.iccProfile;
  assert.ok(iccProfile.byteLength > 0);
  const bytes = writePsdBuffer({
    width, height, bitsPerChannel: 8, colorMode: ColorMode.RGB, children: layers, imageData: merged,
    imageResources: {
      iccProfile,
      versionInfo: {hasRealMergedData: true, writerName: 'ZJU Companion artwork', readerName: 'Adobe Photoshop'},
    },
  }, {noBackground: true, trimImageData: false});
  assert.equal(bytes.toString('ascii', 0, 4), '8BPS');
  const reopened = readPsd(bytes, readOptions);
  assert.deepEqual([reopened.width, reopened.height], [width, height]);
  assert.equal(reopened.bitsPerChannel, 8);
  assert.equal(reopened.colorMode, ColorMode.RGB);
  assert.deepEqual(reopened.imageResources.iccProfile, iccProfile);
  assert.equal(reopened.children.length, layers.length);
  layers.forEach((layer, index) => verifyLayer(layer, reopened.children[index]));
  const recomposed = compose(width, height, reopened.children);
  verifyPixels(merged, recomposed, 'Recomposed PSD layers');
  const maxPremultipliedError = compareMerged(reopened.imageData, merged);
  const originalVector = path.join(art, 'source/official-marks/官网组合标识-原文件.svg');
  assert.equal(sha256(await fs.readFile(originalVector)), marks.originalSha256);

  const checks = {
    file: `art/${psdFile}`,
    sha256: sha256(bytes),
    bytes: bytes.length,
    canvas: {width, height, colorSpace: 'sRGB', bitsPerChannel: 8},
    modelId: appearance.modelId,
    appearanceSnapshot: `art/${neutralAppearanceFile}`,
    layerCount: layers.length,
    inheritedLayerCount: inherited.length,
    shaVerifiedImportLayerCount: imported.length,
    hiddenLayerCount: layers.filter(layer => layer.hidden).length,
    editableNeutralMaskCount: layers.filter(layer => layer.mask).length,
    officialVector: {sourcePage: marks.sourcePage, sha256: marks.originalSha256},
    layerPixelOffsetMaskAndCompositeRoundTrip: true,
    maxMergedPremultipliedChannelError: maxPremultipliedError,
    cubismPsdReimportVerified: false,
    layers: artwork.map(({asset, mesh, digest, layer}) => ({
      id: asset.id,
      name: layer.name,
      meshId: mesh.id,
      source: asset.sourceFile,
      sourceSha256: digest,
      rectangle: {left: asset.x, top: asset.y, width: asset.width, height: asset.height},
      drawOrder: mesh.drawOrder,
      hiddenInPsd: layer.hidden,
      visibleInRig: mesh.visible,
      neutralRigOpacity: mesh.opacity,
      cubismMaskIds: mesh.masks,
      officialVectorRaster: asset.officialVector === true,
    })),
  };
  await fs.mkdir(review, {recursive: true});
  const png = await sharp(Buffer.from(recomposed.data), {raw: {width, height, channels: 4}}).png().toBuffer();
  await Promise.all([
    fs.writeFile(path.join(art, psdFile), bytes),
    fs.writeFile(path.join(review, 'neutral.png'), png),
    fs.writeFile(path.join(review, 'source-checks.json'), JSON.stringify(checks, null, 2) + '\n'),
  ]);
  console.log(JSON.stringify({
    psd: checks.file,
    bytes: checks.bytes,
    layers: checks.layerCount,
    hidden: checks.hiddenLayerCount,
    masks: checks.editableNeutralMaskCount,
    maxMergedPremultipliedChannelError: checks.maxMergedPremultipliedChannelError,
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
