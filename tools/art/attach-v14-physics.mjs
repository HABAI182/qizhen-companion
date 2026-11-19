import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const exportDir = resolve(process.argv[2] ?? '');
const modelFile = join(exportDir, 'zju.model3.json');
const manifest = JSON.parse(readFileSync(modelFile, 'utf8'));
const authoring = JSON.parse(readFileSync(join(exportDir, 'parameters-authoring.json'), 'utf8'));
const parameters = new Set(authoring.parameters.map(({id}) => id));
const profile = [
  ['Forelock', 'ParamHairFront', 2.8, 3.1, .61, .15, false],
  ['SideLocks', 'ParamHairSide', 2.55, 3.7, .56, .18, false],
  ['BackHair', 'ParamHairBack', 2.35, 4.3, .54, .21, true],
  ['FeatherRibbons', 'ParamRibbonSway', 2.8, 4, .59, .23, true],
];

const physicsSettings = profile.map(([id, destination, scale, radius, mobility, delay, reflect]) => {
  const input = [
    ['ParamAngleX', 'Angle', 65, false],
    ['ParamAngleZ', 'Angle', 20, false],
    ['ParamHeadBounce', 'X', 15, reflect],
  ].map(([id, type, weight, reflect]) => ({
    Source: {Target: 'Parameter', Id: id}, Type: type, Weight: weight, Reflect: reflect,
  }));
  for (const parameter of [destination, ...input.map(({Source}) => Source.Id)]) {
    if (!parameters.has(parameter)) throw new Error(`Cubism 导出缺少 ${parameter}`);
  }
  return {
    Id: id,
    Input: input,
    Output: [{
      Destination: {Target: 'Parameter', Id: destination},
      VertexIndex: 2, Scale: scale, Weight: 100, Type: 'Angle', Reflect: reflect,
    }],
    Vertices: [
      {Position: {X: 0, Y: 0}, Mobility: 0, Delay: 0, Acceleration: 0, Radius: 0},
      {Position: {X: 0, Y: radius}, Mobility: .64, Delay: delay * .68, Acceleration: .94, Radius: radius},
      {Position: {X: 0, Y: radius * 2}, Mobility: mobility, Delay: delay, Acceleration: .88, Radius: radius},
    ],
    Normalization: {
      Position: {Minimum: -7, Default: 0, Maximum: 7},
      Angle: {Minimum: -22, Default: 0, Maximum: 22},
    },
  };
});

const physics = {
  Version: 3,
  Meta: {
    PhysicsSettingCount: physicsSettings.length,
    TotalInputCount: physicsSettings.reduce((sum, setting) => sum + setting.Input.length, 0),
    TotalOutputCount: physicsSettings.length,
    VertexCount: physicsSettings.reduce((sum, setting) => sum + setting.Vertices.length, 0),
    Fps: 60,
    EffectiveForces: {Gravity: {X: 0, Y: -1}, Wind: {X: 0, Y: 0}},
    PhysicsDictionary: physicsSettings.map(({Id}) => ({Id, Name: Id})),
  },
  PhysicsSettings: physicsSettings,
};

// Scale about the center of the authored canvas to leave room for deformed tips.
const scale = .96;
const current = manifest.Layout;
if (!current) throw new Error('接入前须保留原生导出的模型中心');
if (!manifest.FileReferences.Physics) {
  manifest.Layout = {width: current.width * scale, x: current.x * scale, y: current.y * scale};
}
manifest.FileReferences.Physics = 'zju.physics3.json';
writeFileSync(join(exportDir, manifest.FileReferences.Physics), JSON.stringify(physics, null, 2) + '\n');
writeFileSync(modelFile, JSON.stringify(manifest, null, 2) + '\n');
