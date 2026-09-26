export const GREETINGS = [
  'Unsay ato part?',
  'bulahan unta ta karon',
  'Maayong adlaw',
  'Kumusta imong tanom?',
  'Okay raka? Pahulay sad',
  'Paldo ka karon part?',
] as const;
export const GREETING_INTERVAL = 10000;

/** Return the next visible change; no timer ticks are needed during the hold. */
export function greetingAt(elapsed: number, reducedMotion: boolean) {
  const time = Math.max(0, elapsed);
  const phrase = GREETINGS[Math.floor(time / GREETING_INTERVAL) % GREETINGS.length];
  const local = time % GREETING_INTERVAL;
  const eraseStart = GREETING_INTERVAL - phrase.length * 30;
  if (reducedMotion) return { phrase, text: phrase, nextIn: GREETING_INTERVAL - local };
  if (local < phrase.length * 45) {
    return { phrase, text: phrase.slice(0, Math.floor(local / 45)), nextIn: 45 - local % 45 };
  }
  if (local < eraseStart) return { phrase, text: phrase, nextIn: eraseStart - local };
  const erased = Math.floor((local - eraseStart) / 30) + 1;
  return {
    phrase,
    text: phrase.slice(0, Math.max(0, phrase.length - erased)),
    nextIn: 30 - (local - eraseStart) % 30,
  };
}
