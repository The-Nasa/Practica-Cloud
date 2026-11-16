export interface OpeningInterval { weekday: number; opensAt: string; closesAt: string }
export class InvalidOpeningIntervalsError extends Error {}
export function validateOpeningIntervals(intervals: OpeningInterval[]): void {
  const ordered = [...intervals].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt));
  for (let i = 0; i < ordered.length; i++) {
    const interval = ordered[i];
    if (interval.opensAt >= interval.closesAt || (i > 0 && ordered[i - 1].weekday === interval.weekday && ordered[i - 1].closesAt > interval.opensAt)) {
      throw new InvalidOpeningIntervalsError('Los horarios no pueden solaparse ni cruzar medianoche; divida el turno entre dos días.');
    }
  }
}
