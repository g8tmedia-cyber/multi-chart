import type { SymbolInfo } from '@mathieuc/tradingview';
import { candleEnd, duration, type Interval } from '../src/lib/trading-types';

const minute = 60_000;
const day = 86_400_000;
const weekdays = '23456';

type Hours = { start: number; end: number };
type Rule = { days?: string; hours: Hours[] };

function minuteOfSession(text: string) {
  const match = /^(\d{2})(\d{2})(F([1-6])?)?$/.exec(text);
  if (!match || Number(match[1]) > 47 || Number(match[2]) >= 60) return;
  const daysBefore = match[3] ? Number(match[4] ?? 1) : 0;
  return Number(match[1]) * 60 + Number(match[2]) - daysBefore * 1440;
}

function parseHours(text: string): Hours[] | undefined {
  const hours: Hours[] = [];
  for (const part of text.split(',')) {
    const [open, close, extra] = part.split('-');
    if (!close || extra !== undefined) return;
    let start = minuteOfSession(open), end = minuteOfSession(close);
    if (start === undefined || end === undefined) return;
    if (start === 0 && end === 0) end = 1440;
    else if (start >= end && !part.includes('F')) start -= 1440;
    if (end <= start) return;
    hours.push({ start, end });
  }
  return hours;
}

function parseRules(text: string): Rule[] | undefined {
  const rules: Rule[] = [];
  for (const period of text.split('|')) {
    const [times, days, extra] = period.split(':');
    if (extra !== undefined || (days !== undefined && !/^[1-7]+$/.test(days))) return;
    const hours = parseHours(times);
    if (!hours) return;
    rules.push({ days, hours });
  }
  return rules;
}

function wallClock(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return (time: number) => {
    const parts = formatter.formatToParts(time);
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  };
}

/** TradingView's guest bars expose opens. Derive the close from its exchange schedule. */
export function tradingViewCandleClose(info: SymbolInfo | undefined, time: number, interval: Interval): number | undefined {
  if (!info || typeof info.session !== 'string' || typeof info.timezone !== 'string') return;
  try {
    const subsession = info.subsessions?.find((session) => session.id === info.subsession_id);
    const schedule = (subsession?.session || info.session).split('/').at(-1)!;
    const intraday = duration(interval) < day;
    if (schedule === '24x7' && (intraday || ['Etc/UTC', 'UTC'].includes(info.timezone))) return candleEnd(time, interval);

    const wall = wallClock(info.timezone);
    const open = wall(time);
    const localDate = Math.floor(open / day) * day;
    const toUtc = (local: number) => {
      let guess = local + time - open;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const offset = local - wall(guess);
        if (offset === 0) return guess;
        guess += offset;
      }
    };
    const monthEnd = (date: number) => {
      const at = new Date(date);
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1);
    };
    if (schedule === '24x7') {
      return toUtc(interval === '1M' ? monthEnd(localDate) : open + duration(interval));
    }

    const customWeek = schedule.includes(';');
    const rules = parseRules(schedule.replace(/^\d;|;\d$/g, ''));
    if (!rules || (customWeek && interval === '1w')) return;
    const holidays = new Set(typeof info.session_holidays === 'string' ? info.session_holidays.split(',') : []);
    const corrections = new Map<string, Hours[] | undefined>();
    const adjusted = subsession?.['session-correction'] || (typeof info.corrections === 'string' ? info.corrections : '');
    for (const entry of adjusted.split(';')) {
      const match = /^(.*):(\d{8}(?:,\d{8})*)$/.exec(entry);
      if (match) {
        const hours = parseHours(match[1]);
        for (const date of match[2].split(',')) corrections.set(date, hours);
      }
    }

    const hoursOn = (date: number) => {
      const when = new Date(date);
      const key = when.toISOString().slice(0, 10).replaceAll('-', '');
      if (corrections.has(key)) return corrections.get(key);
      if (holidays.has(key)) return [];
      const weekday = String(when.getUTCDay() + 1);
      const rule = rules.find((item) => item.days?.includes(weekday)) ??
        (weekdays.includes(weekday) ? rules.find((item) => !item.days) : undefined);
      return rule?.hours ?? [];
    };

    let tradingDay: number | undefined;
    // An overnight session can start on a date before its assigned trading day.
    for (let offset = -1; offset <= 6; offset += 1) {
      const date = localDate + offset * day;
      const hours = hoursOn(date)?.find(({ start, end }) => open >= date + start * minute && open < date + end * minute);
      if (!hours) continue;
      if (intraday) {
        const sessionEnd = toUtc(date + hours.end * minute);
        return sessionEnd === undefined ? undefined : Math.min(candleEnd(time, interval), sessionEnd);
      }
      tradingDay = date;
      break;
    }
    if (intraday) return;
    // Some higher-timeframe feeds use UTC midnight for the trading date.
    if (tradingDay === undefined && time % day === 0) tradingDay = time;
    if (tradingDay === undefined) return;
    const first = new Date(tradingDay);
    const lastDate = interval === '1M' ? monthEnd(tradingDay) - day :
      interval === '1w' ? tradingDay + (6 - (first.getUTCDay() + 6) % 7) * day : tradingDay;
    for (let date = lastDate; date >= tradingDay; date -= day) {
      const hours = hoursOn(date);
      if (!hours) return;
      if (hours.length) return toUtc(date + Math.max(...hours.map(({ end }) => end)) * minute);
    }
  } catch { /* The feed does not provide a usable exchange schedule for this bar. */ }
}
