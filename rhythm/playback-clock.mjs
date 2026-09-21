// Output latency is a browser estimate, not a trustworthy timeline anchor.
const MAX_LATENCY = .5;
const validLatency = value => Number.isFinite(value) && value >= 0 && value <= MAX_LATENCY;

export class PlaybackClock {
  constructor() { this.latency = 0; }

  reset({from, currentTime, startAt, resumeAt}) {
    this.position = from;
    this.rawTime = currentTime;
    this.startAt = startAt;
    this.resumeAt = resumeAt;
    this.interrupted = false;
  }

  read(context, now) {
    const current = context.currentTime;
    if (!Number.isFinite(current) || current < this.rawTime - .05) this.interrupted = true;
    if (this.interrupted) return {time:this.position, waiting:false, countdown:0, interrupted:true};
    this.rawTime = Math.max(this.rawTime, current);
    const waiting = current < this.resumeAt;
    if (!waiting) {
      let latency;
      try {
        const stamp = context.getOutputTimestamp?.();
        const age = (now - stamp?.performanceTime) / 1000;
        const measured = current - (stamp?.contextTime + age);
        if (stamp?.contextTime > 0 && stamp?.performanceTime > 0 &&
            age >= -.05 && age <= .5 && validLatency(measured)) latency = measured;
      } catch { /* Some interrupted audio devices cannot supply a timestamp. */ }
      if (latency === undefined && validLatency(context.outputLatency)) latency = context.outputLatency;
      if (latency !== undefined) this.latency = latency;
      // An invalid estimate keeps the last valid correction; it must never rewind a chart.
      this.position = Math.max(this.position, current - this.latency - this.startAt);
    }
    const remaining = waiting ? Math.max(-this.position, this.resumeAt - current) : -this.position;
    return {time:this.position, waiting, countdown:remaining > 0 ? Math.ceil(remaining) : 0, interrupted:false};
  }
}
