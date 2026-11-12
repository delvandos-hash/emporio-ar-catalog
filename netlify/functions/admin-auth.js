import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'emporio_admin_session';
const SESSION_SECONDS = 15 * 60;

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
    body: JSON.stringify(payload),
  };
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookieValue(headers = {}) {
  const raw = headers.cookie || headers.Cookie || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='));
  return item ? decodeURIComponent(item.slice(COOKIE_NAME.length + 1)) : '';
}

function validSession(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expires, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sign(expires, secret), signature);
}

export async function handler(event) {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password || password.length < 12 || !secret || secret.length < 32) {
    return json(503, { authenticated: false, error: 'admin_not_configured' });
  }

  const method = event.httpMethod || 'GET';
  const headers = event.headers || {};
  const clearCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

  if (method === 'GET') {
    const authenticated = validSession(cookieValue(headers), secret);
    return json(authenticated ? 200 : 401, { authenticated });
  }

  if (method !== 'POST') {
    return json(405, { authenticated: false }, { Allow: 'GET, POST' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return json(400, { authenticated: false, error: 'invalid_json' });
  }

  if (body.action === 'logout') {
    return json(200, { authenticated: false }, { 'Set-Cookie': clearCookie });
  }

  if (typeof body.password !== 'string' || !safeEqual(body.password, password)) {
    return json(401, { authenticated: false, error: 'invalid_credentials' });
  }

  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const token = `${expires}.${sign(expires, secret)}`;
  const sessionCookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
  return json(200, { authenticated: true, expiresIn: SESSION_SECONDS }, { 'Set-Cookie': sessionCookie });
}
