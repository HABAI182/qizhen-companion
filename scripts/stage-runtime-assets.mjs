import {cpSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {modelEntry} from '../src/runtime-assets.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const source = join(app, 'public');
const destination = join(app, 'dist');
const modelPath = modelEntry.slice(1);
const modelDir = dirname(modelPath);
const refs = JSON.parse(readFileSync(join(source, modelPath), 'utf8')).FileReferences;

mkdirSync(join(destination, modelDir), {recursive: true});
cpSync(join(source, modelPath), join(destination, modelPath));
for (const file of new Set([refs.Moc, ...refs.Textures, refs.Physics])) {
  if (typeof file !== 'string' || !/^[\w.-]+$/.test(file) || file.includes('..')) {
    throw new Error('无效的 Cubism 运行资源路径');
  }
  const relative = join(modelDir, file);
  cpSync(join(source, relative), join(destination, relative));
}
const core = join('vendor', 'live2d');
cpSync(join(source, core), join(destination, core), {recursive: true});
