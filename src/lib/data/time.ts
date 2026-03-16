export function subDays(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function addTradingDays(daysAhead: number) {
  const date = new Date();
  let remaining = daysAhead;

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}

const KATHMANDU_OFFSET_MINUTES = 345;

function toKathmandu(date = new Date()) {
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60_000;
  return new Date(utcTime + KATHMANDU_OFFSET_MINUTES * 60_000);
}

export function getTradingDay(date = new Date()) {
  return toKathmandu(date).toISOString().slice(0, 10);
}

export function getKathmanduTimeLabel(date = new Date()) {
  const kathmandu = toKathmandu(date);
  const hours = kathmandu.getHours().toString().padStart(2, "0");
  const minutes = kathmandu.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function getFiveMinuteBucket(date = new Date()) {
  const kathmandu = toKathmandu(date);
  const hours = kathmandu.getHours();
  const minutes = kathmandu.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  return `${hours.toString().padStart(2, "0")}:${roundedMinutes.toString().padStart(2, "0")}`;
}

export function isWithinLiveTradingWindow(date = new Date()) {
  const kathmandu = toKathmandu(date);
  const day = kathmandu.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const minutes = kathmandu.getHours() * 60 + kathmandu.getMinutes();
  // Extended trading window: 10:00 AM - 5:00 PM Kathmandu time
  return minutes >= 10 * 60 && minutes <= 17 * 60;
}

export function buildIntradayBuckets() {
  const buckets: string[] = [];
  for (let hour = 11; hour <= 15; hour += 1) {
    const maxMinute = hour === 15 ? 0 : 55;
    for (let minute = 0; minute <= maxMinute; minute += 5) {
      buckets.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    }
  }

  return buckets;
}
