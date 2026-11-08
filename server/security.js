import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const statuses = ['new','in_progress','completed','rejected'];
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.length > max || value.trim().length < min) {
    throw new HttpError(400, `Поле «${name}»: требуется от ${min} до ${max} символов.`);
  }
  return value.trim();
}
export function email(value) {
  const result = text(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Укажите корректный email.');
  return result;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'Пароль должен содержать от 12 до 128 символов.');
  }
  return value;
}
export async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(value, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const expected = Buffer.from(parts[5], 'hex');
  const actual = await scrypt(value, parts[4], 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}
export function validateInquiry(body = {}) {
  if (body.consent !== true) throw new HttpError(400, 'Требуется согласие на сохранение запроса на сервере проекта.');
  const modification = body.modification == null || body.modification === '' || body.modification === 'Не определился' ? null : text(body.modification, 'модификация', 20);
  return {
    name: text(body.name,'имя',80), contact: text(body.contact,'контакт',160),
    interest: text(body.interest,'тема',80), modification, message: text(body.message,'сообщение',2000)
  };
}
export function validateCarOrder(body = {}) {
  if (body.consent !== true) throw new HttpError(400, 'Требуется согласие на сохранение заявки.');
  const phone = text(body.phone, 'телефон', 32);
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[0-9\s().-]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
    throw new HttpError(400, 'Укажите телефон: от 10 до 15 цифр.');
  }
  const budget = body.budget == null || body.budget === '' ? null : body.budget;
  if (budget !== null && (!Number.isSafeInteger(budget) || budget < 100000 || budget > 100000000)) {
    throw new HttpError(400, 'Бюджет должен быть целым числом от 100 000 до 100 000 000 ₽.');
  }
  return {
    name: text(body.name, 'имя', 80),
    phone,
    modification: text(body.modification, 'модификация', 20),
    city: text(body.city, 'город', 80),
    budget,
    message: body.message == null ? '' : text(body.message, 'пожелания', 2000, 0)
  };
}
export function rateLimit({ limit = 100, windowMs = 60000 } = {}) {
  const entries = new Map();
  return (req,res,next) => {
    const now = Date.now();
    if (entries.size > 10000) {
      for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
      if (entries.size > 10000) return res.status(429).json({ error: 'Слишком много запросов. Повторите позже.' });
    }
    const key = req.ip;
    let entry = entries.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + windowMs }; entries.set(key, entry); }
    if (++entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ error: 'Слишком много запросов. Повторите позже.' });
    }
    next();
  };
}
