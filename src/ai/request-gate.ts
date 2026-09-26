/** A stop invalidates completions but never unlocks still-running native work. */
export class RequestGate {
  private revision = 0;
  private active: number | null = null;
  begin() {
    if (this.active !== null) throw new Error('Please wait for the current message.');
    this.active = ++this.revision;
    return this.active;
  }
  stop() { this.revision++; }
  accepts(ticket: number) { return ticket === this.active && ticket === this.revision; }
  finish(ticket: number) { if (ticket === this.active) this.active = null; }
}
