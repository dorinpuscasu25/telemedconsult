function mmss(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function consultationClock(startedAt: number | null, durationMinutes: number, now: number) {
  const limitSeconds = Math.round((Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 10) * 60);
  const elapsedSeconds = startedAt !== null && Number.isFinite(startedAt) && Number.isFinite(now) ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const remainingSeconds = limitSeconds - elapsedSeconds;
  const overtime = remainingSeconds < 0;
  return {
    elapsedSeconds, remainingSeconds, overtime,
    elapsed: mmss(elapsedSeconds), limit: mmss(limitSeconds),
    display: `${overtime ? '+' : ''}${mmss(Math.abs(remainingSeconds))}`,
    label: overtime ? 'Depășire' : 'Timp rămas',
  };
}
