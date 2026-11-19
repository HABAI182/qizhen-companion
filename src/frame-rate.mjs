export class FrameRate {
  fps = 0;
  next = 0;

  due(now, fps, force = false) {
    const period = 1000 / fps;
    if (force || this.fps !== fps) {
      this.fps = fps;
      this.next = now + period;
      return true;
    }
    if (now + .4 < this.next) return false;
    // Keep the target cadence on displays whose refresh is not a multiple of it.
    // After a pause, skip missed frames without rendering a catch-up burst.
    this.next = now - this.next >= period ? now + period : this.next + period;
    return true;
  }
}
