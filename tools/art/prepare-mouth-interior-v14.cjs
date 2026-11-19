const {createHash} = require('node:crypto');
const {fs, path, sharp, OUT} = require('./common.cjs');

const rectangle = {x: 526, y: 788, width: 128, height: 64};
const mouth = 'M552.4 806.1 C555.3 804.8 562.5 810.2 575.4 812.4 C589.5 814.9 610.4 813.5 620.4 809.3 C622.3 808.5 624.2 809.5 623.1 812.1 C617.7 827.5 604.8 838.8 589.5 838.2 C573.3 837.6 558.3 827.8 552.6 811.1 C551.9 809.2 551.2 807.2 552.4 806.1 Z';
const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${rectangle.width}" height="${rectangle.height}" viewBox="${rectangle.x} ${rectangle.y} ${rectangle.width} ${rectangle.height}">
  <defs>
    <linearGradient id="interior" x1="0" y1="0" x2="0.1" y2="1">
      <stop offset="0" stop-color="#79483F"/>
      <stop offset=".52" stop-color="#A45D54"/>
      <stop offset="1" stop-color="#CE7D71"/>
    </linearGradient>
    <linearGradient id="tongue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DA8C82"/>
      <stop offset="1" stop-color="#F3A698"/>
    </linearGradient>
    <clipPath id="aperture"><path d="${mouth}"/></clipPath>
  </defs>
  <path d="${mouth}" fill="url(#interior)"/>
  <path d="M559 836 C567 827 581 823 589 826 C597 821 607 826 615 834 C615 841 601 845 585 844 C575 844 566 842 559 836 Z"
    fill="url(#tongue)" clip-path="url(#aperture)"/>
  <path d="M572 832 C581 829 589 829 598 831" fill="none" stroke="#F5AB9B"
    stroke-opacity=".48" stroke-width="1.3" stroke-linecap="round" clip-path="url(#aperture)"/>
  <path d="${mouth}" fill="none" stroke="#854D41" stroke-width="2.25" stroke-linejoin="round"/>
  <path d="M554 808 C568 813 585 817 600 814.5 C609 813.6 615 812.8 621 810"
    fill="none" stroke="#734339" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(source), {density: 144}).resize({
    width: rectangle.width, height: rectangle.height, kernel: 'lanczos3',
  }).png().toBuffer();
  const target = path.join(OUT, 'mouth-interior.png');
  if (fs.existsSync(target) && !fs.readFileSync(target).equals(png))
    throw new Error('Existing mouth artwork differs. Register an explicitly versioned image instead.');
  if (!fs.existsSync(target)) fs.writeFileSync(target, png, {flag: 'wx'});
  console.log(JSON.stringify({
    file: 'mouth-interior.png', ...rectangle,
    sha256: createHash('sha256').update(png).digest('hex'),
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
