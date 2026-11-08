import express from 'express';
import path from 'node:path';
import { root } from './config.js';
import { token, digest, HttpError, text, email, password, hashPassword, verifyPassword, validateInquiry, validateCarOrder, rateLimit, statuses } from './security.js';

const COOKIE = 'f10_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const modelSelect = `SELECT m.id,m.slug,m.name,m.title,m.description,m.scope,
  m.consumption_scope AS "consumptionScope",m.release_url AS release,m.source_url AS source,
  s.fuel,s.cylinders,s.displacement,s.power,s.kw,s.torque,s.acceleration::float,s.consumption::float,s.speed,
  s.power_rpm AS "powerRpm",s.torque_rpm AS "torqueRpm",s.engine_code AS "engineCode"
  FROM vehicle_models m JOIN model_specs s ON s.model_id=m.id`;
const inquirySelect = `SELECT i.id,i.name,i.contact,i.message,i.status,i.created_at AS "createdAt",
  i.updated_at AS "updatedAt",t.label AS interest,m.slug AS modification
  FROM inquiries i JOIN inquiry_topics t ON t.id=i.topic_id LEFT JOIN vehicle_models m ON m.id=i.model_id`;

export function createApp({ pool, appOrigin = process.env.APP_ORIGIN || '', secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  if (!pool) throw new Error('A database pool is required.');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  const dummyHash = hashPassword(token());
  app.use((req,res,next) => {
    res.set({ 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin', 'X-Frame-Options':'DENY' });
    next();
  });
  app.use('/api', (req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.use('/api', rateLimit({ limit: 180 }));
  app.use('/api', express.json({ limit: '16kb', strict: true }));
  app.use('/api', (req,res,next) => {
    if (req.body == null) req.body = {};
    if (Array.isArray(req.body)) return next(new HttpError(400,'Требуется JSON-объект.'));
    next();
  });
  app.get('/api/health', (req,res) => res.json({ status:'ok', service:'F10 Anatomy' }));
  app.get('/api/ready', async (req,res) => {
    try {
      const result = await pool.query(`SELECT count(*)::int AS tables FROM information_schema.tables
        WHERE table_schema='public' AND table_name=ANY($1::text[])`,
      [['users','sessions','vehicle_models','model_specs','inquiry_topics','inquiries','inquiry_events','favorites','car_orders']]);
      if (result.rows[0].tables !== 9) return res.status(503).json({ status:'not_ready' });
      const seeded = await pool.query('SELECT (SELECT count(*) FROM model_specs)::int AS models, (SELECT count(*) FROM inquiry_topics)::int AS topics');
      if (seeded.rows[0].models < 3 || seeded.rows[0].topics < 4) return res.status(503).json({ status:'not_seeded' });
      res.json({ status:'ready', database:true, tables:9 });
    } catch { res.status(503).json({ status:'unavailable', database:false }); }
  });
  app.get('/api/models', async (req,res) => res.json({ models:(await pool.query(`${modelSelect} ORDER BY m.slug`)).rows }));
  app.get('/api/topics', async (req,res) => res.json({ topics:(await pool.query('SELECT id,slug,label FROM inquiry_topics ORDER BY id')).rows }));

  app.use('/api', async (req,res,next) => {
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
    const value = cookie?.slice(COOKIE.length + 1);
    if (value && /^[a-f0-9]{64}$/.test(value)) {
      const { rows } = await pool.query(`SELECT s.token_hash,s.csrf_token,s.user_id,u.email,u.name,u.role
        FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`, [digest(value)]);
      req.session = rows[0];
    }
    next();
  });
  async function newSession(req,res,userId = null) {
    const raw = token();
    const csrfToken = token();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (req.session) await client.query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);
      await client.query('DELETE FROM sessions WHERE expires_at <= now()');
      await client.query('INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,$4)',
        [digest(raw),userId,csrfToken,new Date(Date.now()+SESSION_MS)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    res.cookie(COOKIE,raw,{ httpOnly:true, secure:secureCookies, sameSite:'lax', path:'/', maxAge:SESSION_MS });
    return csrfToken;
  }
  function requireUser(req,res,next) {
    if (!req.session?.user_id) return next(new HttpError(401,'Войдите в личный кабинет.'));
    next();
  }
  function requireAdmin(req,res,next) {
    if (!req.session?.user_id) return next(new HttpError(401,'Войдите в личный кабинет.'));
    if (req.session.role !== 'admin') return next(new HttpError(403,'Доступ только для администратора.'));
    next();
  }
  const userFromSession = session => session?.user_id ? { id:session.user_id,email:session.email,name:session.name,role:session.role } : null;
  app.get('/api/auth/me', async (req,res) => {
    const csrfToken = req.session?.csrf_token || await newSession(req,res);
    res.json({ user:userFromSession(req.session),csrfToken });
  });
   
  app.use('/api', (req,res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const expected = appOrigin || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') !== expected || req.get('sec-fetch-site') === 'cross-site') {
      return next(new HttpError(403,'Запрос должен выполняться с этого сайта.'));
    }
    if (!req.is('application/json')) return next(new HttpError(415,'Используйте application/json.'));
    if (!req.session || req.get('x-csrf-token') !== req.session.csrf_token) return next(new HttpError(403,'Сессия истекла. Обновите страницу и повторите действие.'));
    next();
  });
  const authLimit = rateLimit({ limit:15,windowMs:15*60*1000 });
  app.post('/api/auth/register', authLimit, async (req,res) => {
    const address = email(req.body.email);
    const name = text(req.body.name,'имя',80);
    const hashed = await hashPassword(password(req.body.password));
    let user;
    try {
      user = (await pool.query("INSERT INTO users (email,name,password_hash) VALUES ($1,$2,$3) RETURNING id,email,name,role",[address,name,hashed])).rows[0];
    } catch (error) { if (error.code === '23505') throw new HttpError(409,'Этот email уже зарегистрирован.'); throw error; }
    const csrfToken = await newSession(req,res,user.id);
    res.status(201).json({ user,csrfToken });
  });
  app.post('/api/auth/login', authLimit, async (req,res) => {
    const address = email(req.body.email);
    const value = password(req.body.password);
    const user = (await pool.query('SELECT id,email,name,role,password_hash FROM users WHERE email=$1',[address])).rows[0];
    const valid = await verifyPassword(value,user?.password_hash || await dummyHash);
    if (!user || !valid) throw new HttpError(401,'Неверный email или пароль.');
    const csrfToken = await newSession(req,res,user.id);
    delete user.password_hash;
    res.json({ user,csrfToken });
  });
  app.post('/api/auth/logout', async (req,res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.session.token_hash]);
    res.clearCookie(COOKIE,{ httpOnly:true,secure:secureCookies,sameSite:'lax',path:'/' });
    res.json({ user:null });
  });
  app.post('/api/inquiries', rateLimit({ limit:10,windowMs:15*60*1000 }), async (req,res) => {
    const data = validateInquiry(req.body);
    const topic = (await pool.query('SELECT id FROM inquiry_topics WHERE label=$1 OR slug=$1',[data.interest])).rows[0];
    if (!topic) throw new HttpError(400,'Выберите существующую тему запроса.');
    const model = data.modification ? (await pool.query('SELECT id FROM vehicle_models WHERE slug=$1',[data.modification])).rows[0] : null;
    if (data.modification && !model) throw new HttpError(400,'Неизвестная модификация.');
    const ticketToken = token();
    const inquiry = (await pool.query(`INSERT INTO inquiries
      (user_id,topic_id,model_id,name,contact,message,public_token_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at AS "createdAt"`,
    [req.session.user_id,topic.id,model?.id || null,data.name,data.contact,data.message,digest(ticketToken)])).rows[0];
    res.status(201).json({ inquiry,ticketToken,message:'Запрос сохранён на сервере учебного проекта. Отправки дилеру или по email не было.' });
  });
  app.get('/api/tickets/:token', rateLimit({ limit:40 }), async (req,res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) throw new HttpError(404,'Запрос не найден.');
    const result = await pool.query('SELECT status FROM inquiries WHERE public_token_hash=$1',[digest(req.params.token)]);
    if (!result.rows[0]) throw new HttpError(404,'Запрос не найден.');
     
    res.json({ status:result.rows[0].status });
  });
  app.get('/api/inquiries', requireUser, async (req,res) => {
    res.json({ inquiries:(await pool.query(`${inquirySelect} WHERE i.user_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[req.session.user_id])).rows });
  });
  app.get('/api/favorites', requireUser, async (req,res) => {
    res.json({ favorites:(await pool.query(`${modelSelect} JOIN favorites f ON f.model_id=m.id WHERE f.user_id=$1 ORDER BY m.slug`,[req.session.user_id])).rows });
  });
  app.put('/api/favorites/:slug', requireUser, async (req,res) => {
    const model = (await pool.query('SELECT id FROM vehicle_models WHERE slug=$1',[req.params.slug])).rows[0];
    if (!model) throw new HttpError(404,'Модификация не найдена.');
    await pool.query('INSERT INTO favorites (user_id,model_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.session.user_id,model.id]);
    res.json({ saved:true });
  });
  app.delete('/api/favorites/:slug', requireUser, async (req,res) => {
    await pool.query('DELETE FROM favorites WHERE user_id=$1 AND model_id=(SELECT id FROM vehicle_models WHERE slug=$2)',[req.session.user_id,req.params.slug]);
    res.json({ saved:false });
  });
  app.get('/api/admin/inquiries', requireAdmin, async (req,res) => {
    const filter = req.query.status || null;
    if (filter && !statuses.includes(filter)) throw new HttpError(400,'Неизвестный статус.');
    const page = Math.max(1,Math.min(10000,Number.parseInt(req.query.page,10) || 1));
    const count = await pool.query('SELECT count(*)::int AS total FROM inquiries WHERE ($1::text IS NULL OR status=$1)',[filter]);
    const result = await pool.query(`${inquirySelect} WHERE ($1::text IS NULL OR i.status=$1) ORDER BY i.created_at DESC LIMIT 50 OFFSET $2`,[filter,(page-1)*50]);
    res.json({ inquiries:result.rows,total:count.rows[0].total,page,pageSize:50 });
  });
  app.get('/api/admin/inquiries/:id/events', requireAdmin, async (req,res) => {
    const id = text(req.params.id,'номер',20);
    if (!/^\d+$/.test(id)) throw new HttpError(400,'Некорректный номер запроса.');
    const result = await pool.query(`SELECT e.id,e.from_status AS "fromStatus",e.to_status AS "toStatus",
      e.note,e.created_at AS "createdAt",u.email AS "adminEmail" FROM inquiry_events e
      JOIN users u ON u.id=e.admin_id WHERE e.inquiry_id=$1 ORDER BY e.id`,[id]);
    res.json({ events:result.rows });
  });
  app.patch('/api/admin/inquiries/:id/status', requireAdmin, async (req,res) => {
    const id = text(req.params.id,'номер',20);
    if (!/^\d+$/.test(id) || !statuses.includes(req.body.status)) throw new HttpError(400,'Некорректный номер или статус.');
    const note = req.body.note === undefined ? '' : text(req.body.note,'примечание',500,0);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query('SELECT status FROM inquiries WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!current) throw new HttpError(404,'Запрос не найден.');
      if (current.status !== req.body.status) {
        await client.query('UPDATE inquiries SET status=$1,updated_at=now() WHERE id=$2',[req.body.status,id]);
        await client.query('INSERT INTO inquiry_events (inquiry_id,admin_id,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5)',
          [id,req.session.user_id,current.status,req.body.status,note]);
      }
      await client.query('COMMIT');
      res.json({ id,status:req.body.status,changed:current.status !== req.body.status });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.post('/api/car-orders', rateLimit({ limit:10,windowMs:15*60*1000 }), async (req,res) => {
    const data = validateCarOrder(req.body);
    const model = (await pool.query('SELECT id FROM vehicle_models WHERE slug=$1', [data.modification])).rows[0];
    if (!model) throw new HttpError(400, 'Выберите существующую модификацию автомобиля.');
    const order = (await pool.query(`INSERT INTO car_orders
      (user_id,model_id,name,phone,city,budget,message)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,status,created_at AS "createdAt"`,
    [req.session.user_id,model.id,data.name,data.phone,data.city,data.budget,data.message])).rows[0];
    res.status(201).json({ order,message:'Заявка на автомобиль сохранена.' });
  });
  app.use('/api', (req,res,next) => next(new HttpError(404,'API-маршрут не найден.')));

   
  const publicFiles = new Set(['index.html','exterior.html','interior.html','engine.html','tech.html','versions.html','contact.html','order.html','account.html','admin.html','intro.mp4','interior.mp4']);
  app.use((req,res,next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
    const parts = pathname.split('/').filter(Boolean);
    if (parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes(':'))) return res.sendStatus(404);
    const asset = /^(assets|img|frames|frames_interior|transition)\//.test(parts.join('/')) && /\.(css|js|png|jpg|jpeg|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i.test(pathname);
    if (pathname !== '/' && !publicFiles.has(parts.join('/')) && !asset) return res.sendStatus(404);
    next();
  });
  app.use(express.static(root,{ dotfiles:'deny',index:'index.html',redirect:false }));
  app.use((req,res) => res.sendStatus(404));
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    let status = error instanceof HttpError ? error.status : 500;
    let message = error instanceof HttpError ? error.message : 'Сервер недоступен. Действие не подтверждено; повторите позже.';
    if (error.type === 'entity.too.large') { status=413; message='Слишком большой запрос.'; }
    if (error.type === 'entity.parse.failed') { status=400; message='Некорректный JSON.'; }
    if (error.code === 'ECONNREFUSED' || error.code === '57P01') { status=503; message='База данных недоступна. Действие не подтверждено.'; }
     
    res.status(status).json({ error:message });
  });
  return app;
}
