import { db } from './db.js';

// 轻量配额执行：基于内存计数（重启清零，MVP 够用）
const counts = {};

function key(kind, userId, bucket) {
  return `${kind}:${userId}:${bucket}`;
}

export function checkQuota(kind, userId) {
  const s = db().settings.quota;
  const now = new Date();
  let limit = Infinity;
  let bucket = '';
  if (kind === 'message') {
    limit = s.daily_messages;
    bucket = now.toISOString().slice(0, 10); // 每日
  } else if (kind === 'message_minute') {
    limit = s.messages_per_minute || 30;
    bucket = now.toISOString().slice(0, 16); // 每分钟
  } else if (kind === 'tts') {
    limit = s.tts_per_hour;
    bucket = now.toISOString().slice(0, 13); // 每小时
  } else if (kind === 'stt') {
    limit = s.stt_minutes_per_day;
    bucket = now.toISOString().slice(0, 10);
  }
  const k = key(kind, userId, bucket);
  const used = counts[k] || 0;
  if (used >= limit) return { allowed: false, used, limit };
  return { allowed: true, used, limit };
}

export function consumeQuota(kind, userId, amount = 1) {
  const now = new Date();
  let bucket = '';
  if (kind === 'message' || kind === 'message_minute') bucket = kind === 'message' ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 16);
  else if (kind === 'tts') bucket = now.toISOString().slice(0, 13);
  else bucket = now.toISOString().slice(0, 10);
  const k = key(kind, userId, bucket);
  counts[k] = (counts[k] || 0) + amount;
  return counts[k];
}

// 登录/注册按 IP 限流（内存滑动窗口，默认 10 次/分钟）
const ipHits = {};
export function checkIpRate(ip, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const arr = (ipHits[ip] || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    ipHits[ip] = arr;
    return { allowed: false, retryAfter };
  }
  arr.push(now);
  ipHits[ip] = arr;
  return { allowed: true };
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

export function quotaStatus(userId) {
  return {
    messages: checkQuota('message', userId),
    tts: checkQuota('tts', userId),
    stt: checkQuota('stt', userId),
  };
}
