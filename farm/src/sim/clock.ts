/*  In-game clock. One day per `day_seconds` of real time; dawns drive growth. */

export interface ClockConfig {
  daySeconds: number;
  startHour: number;
}

export interface ClockState {
  /** Seconds since this day began. */
  secondsInDay: number;
  day: number;
}

export function createClock(config: ClockConfig): ClockState {
  return { secondsInDay: config.startHour * (config.daySeconds / 24), day: 1 };
}

export interface ClockTick {
  clock: ClockState;
  daysPassed: number;
}

export function advanceClock(clock: ClockState, dt: number, config: ClockConfig): ClockTick {
  const total = clock.secondsInDay + dt;
  const daysPassed = Math.floor(total / config.daySeconds);
  return {
    clock: { secondsInDay: total % config.daySeconds, day: clock.day + daysPassed },
    daysPassed,
  };
}

/** HH:MM, 24-hour, from the start hour. */
export function formatClock(clock: ClockState, config: ClockConfig): string {
  const hours = (clock.secondsInDay / config.daySeconds) * 24;
  const hh = Math.floor(hours) % 24;
  const mm = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 0 at 00:00, 0.5 at noon, 1 at midnight. */
export function dayProgress(clock: ClockState, config: ClockConfig): number {
  return clock.secondsInDay / config.daySeconds;
}
