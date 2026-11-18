import assert from 'node:assert/strict';
import test from 'node:test';
import { consultationClock } from '../src/lib/consultation-clock.ts';

test('clock waits for an actual start and clamps device time before server start', () => {
  assert.equal(consultationClock(null, 60, 10000).display, '60:00');
  assert.equal(consultationClock(10000, 60, 5000).display, '60:00');
  assert.equal(consultationClock(10000, 60, 5000).elapsedSeconds, 0);
});
test('same server start survives reconnect and crosses midnight without reset', () => {
  const started = Date.parse('2026-11-17T23:55:00+02:00');
  const now = Date.parse('2026-11-18T00:03:12+02:00');
  assert.equal(consultationClock(started, 10, now).display, '01:48');
  assert.equal(consultationClock(started, 10, now).elapsed, '08:12');
});
test('overtime is explicit positive elapsed overage and has no negative countdown', () => {
  const clock = consultationClock(0, 10, 631000);
  assert.equal(clock.display, '+00:31');
  assert.equal(clock.label, 'Depășire');
  assert.equal(clock.overtime, true);
  assert.equal(consultationClock(0, 10, 600000).display, '00:00');
  assert.equal(consultationClock(0, 10, 600000).overtime, false);
});
test('invalid duration and date cannot show NaN or a negative elapsed time', () => {
  assert.equal(consultationClock(Number.NaN, Number.NaN, 5000).display, '10:00');
  assert.equal(consultationClock(0, 0, Number.NaN).display, '10:00');
  assert.equal(consultationClock(0, 120, 5000).display, '119:55');
});
