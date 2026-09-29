import { WHOLE_FRAME } from './calendar-whole-motion.ts';

/** Shared by the overlay and the calendar text reservation. */
export function calendarCornerLayout(width: number) {
  const size = Math.max(68, Math.min(80, Math.round(width * 0.19)));
  const height = size * WHOLE_FRAME.viewHeight / WHOLE_FRAME.viewWidth;
  return {
    size,
    height,
    headerOverlap: 0,
    textReservation: 0,
    right: 0,
    contentHeight: 0,
  };
}
