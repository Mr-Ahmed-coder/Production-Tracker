import { dateInZone } from "./calendar.js";
export const LEASE_MS = 45000;
export const SESSION_MS = 24 * 60 * 60 * 1000;
export function intervals(session, now = new Date()) {
  const result = session.segments.map((s) => ({
    start: new Date(s.start),
    end: new Date(s.end),
  }));
  if (
    session.state === "running" &&
    session.runningSince &&
    session.leaseUntil
  ) {
    result.push({
      start: new Date(session.runningSince),
      end: new Date(Math.min(+now, +session.leaseUntil)),
    });
  }
  return result.filter((s) => +s.end > +s.start);
}
export function durationMs(session, now = new Date()) {
  return intervals(session, now).reduce(
    (total, s) => total + (+s.end - +s.start),
    0,
  );
}
export function closeInterval(session, now) {
  if (session.runningSince) {
    const end = new Date(Math.min(+now, +session.leaseUntil));
    if (+end > +session.runningSince)
      session.segments.push({ start: session.runningSince, end });
  }
  session.runningSince = null;
  session.leaseUntil = null;
}
export function expire(session, now = new Date()) {
  if (session.state === "running" && +session.leaseUntil <= +now) {
    closeInterval(session, now);
    session.state = "paused";
    return true;
  }
  return false;
}
// Locate the next local calendar boundary by binary search. Handles DST and non-hour offsets.
export function splitInterval(start, end, timeZone) {
  const result = [];
  let cursor = +new Date(start),
    stop = +new Date(end);
  if (!Number.isFinite(cursor) || !Number.isFinite(stop) || stop <= cursor)
    return result;
  while (cursor < stop) {
    const date = dateInZone(timeZone, new Date(cursor));
    let boundary = stop;
    if (dateInZone(timeZone, new Date(stop - 1)) !== date) {
      let lo = cursor + 1,
        hi = Math.min(stop, cursor + 48 * 3600000);
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (dateInZone(timeZone, new Date(mid)) === date) lo = mid + 1;
        else hi = mid;
      }
      boundary = lo;
    }
    result.push({ date, milliseconds: boundary - cursor });
    cursor = boundary;
  }
  return result;
}
