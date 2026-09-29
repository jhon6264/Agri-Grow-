export type StreamSmootherCallback = (visibleText: string, isDone: boolean) => void;

const FRAME_INTERVAL_MS = 32;

function codePointLength(value: number) {
  return value > 0xffff ? 2 : 1;
}

function isGraphemeContinuation(value: number) {
  return value === 0x200d || value === 0xfe0e || value === 0xfe0f
    || value >= 0x1f3fb && value <= 0x1f3ff
    || value >= 0x0300 && value <= 0x036f
    || value >= 0x1ab0 && value <= 0x1aff
    || value >= 0x1dc0 && value <= 0x1dff
    || value >= 0x20d0 && value <= 0x20ff
    || value >= 0xfe20 && value <= 0xfe2f;
}

function nextGraphemeEnd(text: string, start: number) {
  const first = text.codePointAt(start);
  if (first === undefined) return start;
  if (first >= 0xd800 && first <= 0xdbff) return start; // Wait for the low surrogate.
  if (first === 0x200d && start + 1 === text.length) return start;
  let end = start + codePointLength(first);
  if (first >= 0x1f1e6 && first <= 0x1f1ff) {
    const flagEnd = text.codePointAt(end);
    if (flagEnd !== undefined && flagEnd >= 0x1f1e6 && flagEnd <= 0x1f1ff) end += codePointLength(flagEnd);
  }
  while (end < text.length) {
    const next = text.codePointAt(end)!;
    if (next === 0x200d) {
      const joined = text.codePointAt(end + 1);
      if (joined === undefined || joined >= 0xd800 && joined <= 0xdbff) break;
      end += 1 + codePointLength(joined);
    } else if (isGraphemeContinuation(next)) {
      end += codePointLength(next);
    } else {
      break;
    }
  }
  return end;
}

function safeAdvance(text: string, start: number, desired: number) {
  let end = start;
  while (end < desired && end < text.length) {
    const next = nextGraphemeEnd(text, end);
    if (next === end) break;
    end = next;
  }
  return end;
}

export class StreamSmoother {
  private targetText = '';
  private displayedLength = 0;
  private animFrameId: number | null = null;
  private isDone = false;
  private lastTick = 0;
  private doneFrames = 0;
  private callback: StreamSmootherCallback;

  constructor(callback: StreamSmootherCallback) {
    this.callback = callback;
  }

  public reset(initialText = '') {
    this.stopAnimation();
    this.targetText = initialText;
    this.displayedLength = initialText.length;
    this.isDone = false;
    this.lastTick = 0;
    this.doneFrames = 0;
  }

  public append(chunk: string) {
    if (!chunk) return;
    this.targetText += chunk;
    this.startAnimation();
  }

  public markDone() {
    this.isDone = true;
    this.startAnimation();
  }

  public flush() {
    this.stopAnimation();
    this.displayedLength = this.targetText.length;
    this.callback(this.targetText, true);
  }

  private startAnimation() {
    if (this.animFrameId !== null) return;
    this.tick();
  }

  private stopAnimation() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
  }

  private tick = () => {
    this.animFrameId = null;
    const remaining = this.targetText.length - this.displayedLength;
    if (remaining <= 0) {
      if (this.isDone) this.callback(this.targetText, true);
      return;
    }

    const now = Date.now();
    if (this.lastTick && now - this.lastTick < FRAME_INTERVAL_MS && !this.isDone) {
      this.animFrameId = requestAnimationFrame(this.tick);
      return;
    }
    this.lastTick = now;

    const start = this.displayedLength;
    let desired: number;
    if (this.isDone) {
      this.doneFrames++;
      desired = this.doneFrames >= 3 ? this.targetText.length : start + Math.ceil(remaining / (4 - this.doneFrames));
    } else {
      const nextSpace = this.targetText.indexOf(' ', start + 1);
      const nextNewline = this.targetText.indexOf('\n', start + 1);
      const boundary = nextSpace < 0 ? nextNewline : nextNewline < 0 ? nextSpace : Math.min(nextSpace, nextNewline);
      const step = remaining > 120 ? Math.min(64, Math.ceil(remaining / 5)) : remaining > 48 ? 20 : 8;
      desired = boundary >= 0 && boundary - start <= step + 8 ? boundary + 1 : start + Math.min(remaining, step);
    }
    const next = safeAdvance(this.targetText, start, Math.min(this.targetText.length, desired));
    if (next > start) {
      this.displayedLength = next;
      const completed = this.isDone && next === this.targetText.length;
      this.callback(this.targetText.slice(0, next), completed);
      if (completed) return;
    } else if (this.isDone) {
      // A malformed final chunk must still finish the request instead of spinning forever.
      this.displayedLength = this.targetText.length;
      this.callback(this.targetText, true);
      return;
    }
    this.animFrameId = requestAnimationFrame(this.tick);
  };
}
