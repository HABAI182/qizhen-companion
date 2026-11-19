import type {FrameOptions, Snapshot} from './pet-renderer';

const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ease = (value: number) => {
  const t = limit(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const nodCurve = [
  [0, 0], [65, -.10], [195, 1], [257, .91],
  [460, -.18], [635, .04], [810, 0],
] as const;
const touchEnd = 390;
const touchCurve = [
  // Time, compression and pitch.
  [0, 0, 0], [90, .92, -7.5], [218, -.23, 3.4], [touchEnd, 0, 0],
] as const;
const happyCurve = [
  // Time, smile form, eye aperture, mouth opening, and head lift.
  [0, 0, 1, 0, 0],
  [105, .20, .99, .05, -.22],
  [215, .89, .86, .29, -.12],
  [295, 1, 0, .46, .29],
  [343, 1, 0, .44, .17],
  [485, .94, .89, .34, -.13],
  [1130, .80, .94, .26, 0],
  [1660, .26, .99, .09, 0],
  [1930, 0, 1, 0, 0],
] as const;

function poseAt(keys: readonly (readonly number[])[], time: number): number[] {
  for (let i = 1; i < keys.length; i++) {
    const before = keys[i - 1], after = keys[i];
    if (time > after[0]) continue;
    const t = ease((time - before[0]) / (after[0] - before[0]));
    return before.slice(1).map((value, column) => value + (after[column + 1] - value) * t);
  }
  return keys[keys.length - 1].slice(1);
}

export class PetMotion {
  private lastFrame = 0;
  private nextBlink = 0;
  private blinkIndex = 0;
  private restAge = 0;
  private look = {x: 0, y: 0};
  private mouse = {x: 0, y: 0};
  private sleepy = 0;

  private blink(now: number, idle: boolean) {
    if (!idle) {
      this.nextBlink = 0;
      return 1;
    }
    if (!this.nextBlink) this.nextBlink = now + 2700;
    const age = now - this.nextBlink;
    if (age < 0) return 1;
    if (age < 108) return 1 - ease(age / 108);
    if (age < 157) return 0;
    if (age < 310) return ease((age - 157) / 153);
    const spacing = [3200, 5160, 4070, 5780, 3490];
    this.nextBlink = now + spacing[this.blinkIndex++ % spacing.length];
    return 1;
  }

  step(now: number, input: Snapshot, options: FrameOptions) {
    const dt = this.lastFrame ? limit((now - this.lastFrame) / 1000, 0, .08) : 1 / 60;
    this.lastFrame = now;
    const lookBlend = 1 - Math.exp(-dt * 14);
    const mouseBlend = 1 - Math.exp(-dt * 15);
    this.look.x += (options.gaze.x - this.look.x) * lookBlend;
    this.look.y += (options.gaze.y - this.look.y) * lookBlend;
    this.mouse.x += (options.pointer.x - this.mouse.x) * mouseBlend;
    this.mouse.y += (options.pointer.y - this.mouse.y) * mouseBlend;

    const sleeping = options.expression === 'sleepy';
    if (sleeping) {
      this.sleepy = ease((options.actionAge - 60) / 670);
    } else {
      this.sleepy *= Math.exp(-dt * 13);
      if (this.sleepy < .002) this.sleepy = 0;
    }
    const restBlend = 1 - Math.exp(-dt * 6);
    this.restAge += (Number(options.idle || sleeping) - this.restAge) * restBlend;
    const celebrating = options.expression === 'smile';
    const blink = this.blink(now, options.idle && !sleeping && !celebrating);
    const strength = options.intensity;
    const breathe = (.5 - .5 * Math.cos(now * Math.PI / 1870)) * this.restAge * strength;
    const nod = options.expression === 'nod' ? poseAt(nodCurve, options.actionAge)[0] * strength : 0;
    const [smile, smilingOpen, happyMouth, happyLift] = celebrating ? poseAt(happyCurve, options.actionAge) : [0, 1, 0, 0];
    const touchAge = options.touchAge;
    const touched = touchAge !== undefined;
    const touching = touched && touchAge < touchEnd;
    const bounce = touching ? 0 : limit(input.keyboardBounce + input.mouseBounce, -1.05, 1.05) * strength * options.headElasticity;
    const configuredTouchGain = strength * options.headElasticity / .6;
    const touchGain = configuredTouchGain <= 1 ? configuredTouchGain : 1 + .08 * (1 - 1 / configuredTouchGain);
    const [touchCompression, touchPitch] = touching ? poseAt(touchCurve, touchAge) : [0, 0];
    const reaction = touching ? touchCompression * touchGain : limit(1.6 * bounce, -.34, 1);
    const performedLift = touched ? 0 : happyLift * strength;
    const sleepy = this.sleepy;
    const open = smilingOpen * (1 - sleepy) * blink;
    const lookWeight = (1 - sleepy) * (1 - .18 * (touched ? 0 : smile));
    const keyboardReach = strength > 0 ? options.keyboardScale : 0;

    return {
      dt,
      values: {
        ParamAngleX: this.look.x * 24 * strength * lookWeight,
        ParamAngleY: -this.look.y * 18 * strength * lookWeight - 13 * sleepy - 14 * nod + bounce * 2 + touchPitch * touchGain,
        ParamAngleZ: this.look.x * 8 * strength * lookWeight + bounce * 3 + (touched ? 0 : 4 * smile) - 2 * sleepy,
        ParamHeadBounce: limit(reaction + .81 * nod + .53 * sleepy * strength + performedLift + (.06 + .09 * sleepy) * breathe, -.42, 1),
        ParamEyeLidForm: smile * (1 - sleepy) - sleepy,
        ParamEyeLOpen: open,
        ParamEyeROpen: Math.min(1, open * (1 + .037 * smile)),
        ParamEyeBallX: this.look.x * options.gazeScale / 2.1 * strength * lookWeight,
        ParamEyeBallY: (this.look.y - .28 * sleepy) * options.gazeScale / 2.1 * strength * lookWeight,
        ParamBrowLY: .50 * smile - .34 * sleepy,
        ParamBrowRY: .57 * smile - .35 * sleepy,
        ParamMouthForm: .91 * smile - .88 * sleepy,
        ParamMouthOpenY: happyMouth * (1 - sleepy) + (.081 + .021 * breathe) * sleepy,
        ParamBreath: (.8 + .20 * sleepy) * breathe,
        ParamHandLPress: input.keyboardPress * strength * options.keyboardScale,
        ParamHandLX: input.reach * keyboardReach,
        ParamHandLY: input.depth * keyboardReach,
        ParamHandRPress: input.mousePress * strength * options.mouseScale * Number(options.mouseEnabled),
        ParamHandRX: this.mouse.x * strength * options.mouseScale * Number(options.mouseEnabled),
        ParamHandRY: this.mouse.y * strength * options.mouseScale * Number(options.mouseEnabled),
        ParamMouseGrip: 1,
      },
    };
  }
}
