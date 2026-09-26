export type StreamSmootherCallback = (visibleText: string, isDone: boolean) => void;

export class StreamSmoother {
  private targetText: string = '';
  private displayedLength: number = 0;
  private animFrameId: number | null = null;
  private isDone: boolean = false;
  private callback: StreamSmootherCallback;
  private lastTick: number = 0;

  constructor(callback: StreamSmootherCallback) {
    this.callback = callback;
  }

  public reset(initialText: string = '') {
    this.stopAnimation();
    this.targetText = initialText;
    this.displayedLength = initialText.length;
    this.isDone = false;
    this.lastTick = 0;
  }

  public append(chunk: string) {
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
    this.lastTick = Date.now();
    this.tick();
  }

  private stopAnimation() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick = () => {
    this.animFrameId = null;
    const remaining = this.targetText.length - this.displayedLength;

    if (remaining <= 0) {
      if (this.isDone) {
        this.callback(this.targetText, true);
        return;
      }
      return;
    }

    const now = Date.now();
    // Fluid 60fps animation cadence (18ms)
    if (now - this.lastTick < 18 && remaining < 40 && !this.isDone) {
      this.animFrameId = requestAnimationFrame(this.tick);
      return;
    }
    this.lastTick = now;

    // Check next characters for structural markdown:
    // If approaching a table row, heading, or code fence, advance by line
    // to prevent jittery half-rendered markdown states.
    const upcoming = this.targetText.slice(this.displayedLength, this.displayedLength + 80);
    const newlineIndex = upcoming.indexOf('\n');
    const isTableOrHeading = upcoming.startsWith('|') || upcoming.startsWith('#') || upcoming.startsWith('```');

    let nextLength: number;

    if (isTableOrHeading && newlineIndex !== -1 && newlineIndex <= 80) {
      nextLength = this.displayedLength + newlineIndex + 1;
    } else {
      // Find the next space or word boundary in upcoming text
      const nextSpace = this.targetText.indexOf(' ', this.displayedLength + 1);
      const nextNewline = this.targetText.indexOf('\n', this.displayedLength + 1);

      let boundary = -1;
      if (nextSpace !== -1 && nextNewline !== -1) boundary = Math.min(nextSpace, nextNewline);
      else if (nextSpace !== -1) boundary = nextSpace;
      else if (nextNewline !== -1) boundary = nextNewline;

      if (boundary !== -1 && boundary - this.displayedLength <= 24) {
        // Complete word boundary found
        nextLength = boundary + 1;
      } else if (remaining > 50) {
        // Fluid catch-up if model inference is ahead
        nextLength = Math.min(this.targetText.length, this.displayedLength + Math.ceil(remaining / 4));
      } else if (this.isDone) {
        // At the end, reveal the rest
        nextLength = this.targetText.length;
      } else {
        // If word is not complete yet, advance available sub-word chunk without stalling
        nextLength = Math.min(this.targetText.length, this.displayedLength + Math.min(remaining, 4));
      }
    }

    this.displayedLength = nextLength;
    const currentVisible = this.targetText.slice(0, nextLength);
    const completed = this.isDone && this.displayedLength >= this.targetText.length;

    this.callback(currentVisible, completed);

    if (this.displayedLength < this.targetText.length || (this.isDone && !completed)) {
      this.animFrameId = requestAnimationFrame(this.tick);
    }
  };
}
