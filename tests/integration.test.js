import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createPool, assertProjectDatabase } from '../server/config.js';
import { migrate } from '../server/migrate.js';
import { seed } from '../server/seed.js';
import { hashPassword, digest } from '../server/security.js';

const url=process.env.TEST_DATABASE_URL;
test('real PostgreSQL client/server integration (dedicated test database only)',{skip:!url?'TEST_DATABASE_URL is not set':false},async t => {
  assertProjectDatabase(url,true); // Before any connection or mutation.
  const pool=createPool(url);
  pool.on('error',() => {});
  let server;
  const users=[];
  const inquiries=[];
  let failEvent=false;
  const appPool={
    query:(...args) => pool.query(...args),
    connect:async () => {
      const client=await pool.connect();
      return {
        query:(sql,...args) => {
          if (failEvent && String(sql).startsWith('INSERT INTO inquiry_events')) throw new Error('Simulated test-only event failure');
          return client.query(sql,...args);
        },
        release:() => client.release()
      };
    }
  };
  try {
    await migrate(pool); await seed(pool);
    server=createApp({pool:appPool,appOrigin:'',secureCookies:false}).listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    function client() {
      let cookie=''; let csrf='';
      return {
        get cookie() { return cookie; }, get csrf() { return csrf; },
        async request(path,{method='GET',body,headers={}}={}) {
          const response=await fetch(origin+path,{method,redirect:'manual',headers:{
            ...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...headers
          },...(body!==undefined?{body:JSON.stringify(body)}:{})});
          const setCookie=response.headers.get('set-cookie');
          if (setCookie) cookie=setCookie.split(';')[0];
          const contentType=response.headers.get('content-type') || '';
          const data=contentType.includes('application/json')?await response.json():await response.text();
          if (data.csrfToken) csrf=data.csrfToken;
          return {status:response.status,data,headers:response.headers};
        }
      };
    }
    const guest=client(); const user=client(); const other=client(); const admin=client();
    const suffix=randomUUID();
    const pass='Integration-test-only-2026';
    const payload={name:'Тестовый запрос',contact:'@test-contact',interest:'Подбор F10',modification:'528i',message:"Test with SQL-like text: '; DROP TABLE users; --",consent:true};
    let ownId; let ticket; let guestId;
    await t.test('health, readiness, exactly eight tables and idempotent catalog seed',async () => {
      assert.equal((await guest.request('/api/health')).status,200);
      assert.equal((await guest.request('/api/ready')).data.status,'ready');
      const tables=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
      assert.deepEqual(tables.rows.map(row => row.table_name).sort(),['favorites','inquiries','inquiry_events','inquiry_topics','model_specs','sessions','users','vehicle_models'].sort());
      const models=(await guest.request('/api/models')).data.models;
      assert.deepEqual(models.map(m => [m.slug,m.power,m.torque,m.acceleration,m.consumption,m.displacement,m.kw]),[
        ['520d',184,380,7.9,4.5,1995,135],['528i',245,350,6.3,6.1,1997,180],['535i',306,400,5.7,7.2,2979,225]
      ]);
      assert.equal((await guest.request('/api/topics')).data.topics.length,4);
      await seed(pool); assert.equal((await pool.query('SELECT count(*)::int AS n FROM vehicle_models')).rows[0].n,3);
    });
    await t.test('anonymous session has HttpOnly SameSite cookie, stored only as hash',async () => {
      const response=await guest.request('/api/auth/me');
      assert.equal(response.data.user,null); assert.match(response.data.csrfToken,/^[a-f0-9]{64}$/);
      assert.match(response.headers.get('set-cookie'),/HttpOnly/); assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
      const raw=guest.cookie.split('=')[1];
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash=$1',[digest(raw)])).rows[0].n,1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash=$1',[raw])).rows[0].n,0);
    });
    await t.test('CSRF, origin, consent and input-length failures reject without inserts',async () => {
      const before=(await pool.query('SELECT count(*)::int AS n FROM inquiries')).rows[0].n;
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:payload,headers:{'X-CSRF-Token':'wrong'}})).status,403);
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:payload,headers:{Origin:'https://attacker.example'}})).status,403);
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:{...payload,consent:false}})).status,400);
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:{...payload,message:'x'.repeat(2001)}})).status,400);
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:{...payload,modification:'bad'}})).status,400);
      assert.equal((await guest.request('/api/inquiries',{method:'POST',body:{...payload,interest:'bad'}})).status,400);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM inquiries')).rows[0].n,before);
    });
    await t.test('guest POST returns 201 and a limited public status ticket, not PII',async () => {
      const response=await guest.request('/api/inquiries',{method:'POST',body:payload});
      assert.equal(response.status,201); guestId=response.data.inquiry.id; inquiries.push(guestId); ticket=response.data.ticketToken;
      const stored=(await pool.query('SELECT * FROM inquiries WHERE id=$1',[guestId])).rows[0];
      assert.equal(stored.user_id,null); assert.equal(stored.message,payload.message);
      assert.equal(stored.public_token_hash,digest(ticket)); assert.notEqual(stored.public_token_hash,ticket);
      assert.deepEqual((await guest.request(`/api/tickets/${ticket}`)).data,{status:'new'});
      assert.equal((await guest.request(`/api/tickets/${'a'.repeat(64)}`)).status,404);
      assert.equal((await guest.request('/api/inquiries')).status,401);
    });
    await t.test('registration, session rotation, duplicate email, wrong password and login',async () => {
      await user.request('/api/auth/me'); const oldCookie=user.cookie;
      const response=await user.request('/api/auth/register',{method:'POST',body:{email:`user-${suffix}@example.test`,name:'Тест',password:pass,role:'admin'}});
      assert.equal(response.status,201); assert.equal(response.data.user.role,'user'); users.push(response.data.user.id);
      assert.notEqual(user.cookie,oldCookie);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash=$1',[digest(oldCookie.split('=')[1])])).rows[0].n,0);
      assert.equal((await user.request('/api/auth/register',{method:'POST',body:{email:`USER-${suffix}@example.test`,name:'Повтор',password:pass}})).status,409);
      assert.equal((await user.request('/api/auth/login',{method:'POST',body:{email:`user-${suffix}@example.test`,password:'incorrect-password'}})).status,401);
      assert.equal((await user.request('/api/auth/login',{method:'POST',body:{email:`user-${suffix}@example.test`,password:pass}})).status,200);
    });
    await t.test('authenticated requests linked to user; second account cannot read them',async () => {
      const response=await user.request('/api/inquiries',{method:'POST',body:payload});
      assert.equal(response.status,201); ownId=response.data.inquiry.id; inquiries.push(ownId);
      const own=(await user.request('/api/inquiries')).data.inquiries;
      assert.equal(own.length,1); assert.equal(own[0].id,ownId); assert.notEqual(own[0].id,guestId);
      await other.request('/api/auth/me');
      const second=await other.request('/api/auth/register',{method:'POST',body:{email:`other-${suffix}@example.test`,name:'Другой',password:pass}});
      users.push(second.data.user.id);
      assert.deepEqual((await other.request('/api/inquiries')).data.inquiries,[]);
      assert.equal((await user.request('/api/admin/inquiries')).status,403);
      assert.equal((await user.request(`/api/admin/inquiries/${ownId}/status`,{method:'PATCH',body:{status:'completed'}})).status,403);
    });
    await t.test('favorites are persisted, unique, and isolated per user',async () => {
      assert.equal((await user.request('/api/favorites/520d',{method:'PUT',body:{}})).status,200);
      await user.request('/api/favorites/520d',{method:'PUT',body:{}});
      assert.equal((await user.request('/api/favorites')).data.favorites.length,1);
      assert.equal((await other.request('/api/favorites')).data.favorites.length,0);
      assert.equal((await user.request('/api/favorites/missing',{method:'PUT',body:{}})).status,404);
      await user.request('/api/favorites/520d',{method:'DELETE',body:{}});
      assert.equal((await user.request('/api/favorites')).data.favorites.length,0);
    });
    await t.test('admin role protection, transactional status events and no duplicate event',async () => {
      const adminId=(await pool.query("INSERT INTO users (email,name,password_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id",[`admin-${suffix}@example.test`,'Test Admin',await hashPassword(pass)])).rows[0].id;
      users.push(adminId); await admin.request('/api/auth/me');
      assert.equal((await admin.request('/api/auth/login',{method:'POST',body:{email:`admin-${suffix}@example.test`,password:pass}})).status,200);
      assert.equal((await admin.request('/api/admin/inquiries')).status,200);
      assert.equal((await admin.request(`/api/admin/inquiries/${ownId}/status`,{method:'PATCH',body:{status:'in_progress',note:'Started'}})).status,200);
      assert.equal((await admin.request(`/api/admin/inquiries/${ownId}/status`,{method:'PATCH',body:{status:'in_progress'}})).data.changed,false);
      const events=(await admin.request(`/api/admin/inquiries/${ownId}/events`)).data.events;
      assert.equal(events.length,1); assert.equal(events[0].fromStatus,'new'); assert.equal(events[0].toStatus,'in_progress');
      assert.equal((await admin.request(`/api/admin/inquiries/${ownId}/status`,{method:'PATCH',body:{status:'invalid'}})).status,400);
      assert.equal((await admin.request('/api/admin/inquiries/999999999999/status',{method:'PATCH',body:{status:'completed'}})).status,404);
      assert.equal((await admin.request('/api/admin/inquiries?status=in_progress')).data.inquiries.some(item => item.id===ownId),true);
    });
    await t.test('failed event insert rolls back status and hides internal errors',async () => {
      failEvent=true;
      const response=await admin.request(`/api/admin/inquiries/${ownId}/status`,{method:'PATCH',body:{status:'completed'}});
      failEvent=false;
      assert.equal(response.status,500); assert.equal(JSON.stringify(response.data).includes('Simulated'),false);
      assert.equal((await pool.query('SELECT status FROM inquiries WHERE id=$1',[ownId])).rows[0].status,'in_progress');
      assert.equal((await admin.request(`/api/admin/inquiries/${ownId}/events`)).data.events.length,1);
      assert.equal((await admin.request(`/api/admin/inquiries/${guestId}/status`,{method:'PATCH',body:{status:'completed'}})).status,200);
      assert.deepEqual((await guest.request(`/api/tickets/${ticket}`)).data,{status:'completed'});
    });
    await t.test('static allowlist blocks source, SQL, tests, environment and dependency files',async () => {
      for (const target of ['/.env','/.env.example','/.git/config','/server/app.js','/db/001_schema.sql','/tests/integration.test.js','/node_modules/express/package.json','/package.json','/README.md','/index.html.bak_redesign_20261028_024440','/assets/.secret.js']) {
        assert.equal((await guest.request(target)).status,404,target);
      }
      assert.equal((await guest.request('/account.html')).status,200);
      assert.equal((await guest.request('/admin.html')).status,200);
      assert.equal((await guest.request('/assets/js/api-client.js')).status,200);
      assert.equal((await guest.request('/api/missing')).status,404);
    });
    await t.test('JSON size limit, malformed JSON and logout invalidation',async () => {
      const oversized=await user.request('/api/inquiries',{method:'POST',body:{...payload,message:'x'.repeat(20000)}});
      assert.equal(oversized.status,413);
      const invalid=await fetch(origin+'/api/inquiries',{method:'POST',headers:{Cookie:user.cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':user.csrf},body:'{'});
      assert.equal(invalid.status,400);
      const oldCookie=user.cookie;
      assert.equal((await user.request('/api/auth/logout',{method:'POST',body:{}})).status,200);
      assert.equal((await user.request('/api/inquiries')).status,401);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash=$1',[digest(oldCookie.split('=')[1])])).rows[0].n,0);
    });
  } finally {
    failEvent=false;
    if (server) await new Promise(resolve => server.close(resolve));
    // Cleanup only IDs generated by this run. Never TRUNCATE or DROP a database/table.
    if (inquiries.length) await pool.query('DELETE FROM inquiries WHERE id=ANY($1::bigint[])',[inquiries]);
    if (users.length) await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[users]);
    await pool.end();
  }
});
