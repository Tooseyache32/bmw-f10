import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validateInquiry, validateCarOrder, password, email, digest, token, HttpError, rateLimit } from '../server/security.js';
import { assertProjectDatabase } from '../server/config.js';

test('scrypt uses random salts, verifies correct passwords and rejects malformed hashes',async () => {
  const first=await hashPassword('A-test-password-2026');
  const second=await hashPassword('A-test-password-2026');
  assert.notEqual(first,second);
  assert.match(first,/^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('A-test-password-2026',first),true);
  assert.equal(await verifyPassword('wrong-password',first),false);
  assert.equal(await verifyPassword('anything','not-a-hash'),false);
});
test('inquiry validation matches existing form lengths, trims fields and requires explicit consent',() => {
  const valid={name:' Test ',contact:' messenger @test ',interest:'Другое',modification:'Не определился',message:' Message ',consent:true};
  assert.deepEqual(validateInquiry(valid),{name:'Test',contact:'messenger @test',interest:'Другое',modification:null,message:'Message'});
  for (const [key,length] of [['name',81],['contact',161],['message',2001]]) assert.throws(() => validateInquiry({...valid,[key]:'x'.repeat(length)}),HttpError);
  assert.throws(() => validateInquiry({...valid,consent:'on'}),HttpError);
  assert.throws(() => validateInquiry({...valid,message:'   '}),HttpError);
});
test('car order validation accepts optional budget and rejects invalid phones, consent and fields',() => {
  const data={name:' Покупатель ',phone:'+7 (999) 123-45-67',modification:'535i',city:' Оренбург ',budget:2500000,consent:true};
  assert.deepEqual(validateCarOrder(data),{name:'Покупатель',phone:data.phone,modification:'535i',city:'Оренбург',budget:2500000,message:''});
  assert.equal(validateCarOrder({...data,budget:''}).budget,null);
  for (const invalid of [{phone:'123'},{phone:'9999999999999999'},{phone:'8999letters'},{consent:'on'},{budget:'2500000'},{budget:2500000.5},{budget:99999},{budget:100000001},{name:'x'.repeat(81)},{city:'   '},{message:'x'.repeat(2001)}]) {
    assert.throws(() => validateCarOrder({...data,...invalid}),HttpError);
  }
});
test('credentials have bounded lengths and email normalization',() => {
  assert.equal(email('TEST@Example.test'),'test@example.test');
  assert.throws(() => email('bad'),HttpError);
  assert.throws(() => password('short'),HttpError);
  assert.throws(() => password('x'.repeat(129)),HttpError);
});
test('ticket/session tokens have 256-bit entropy and stored digests differ from raw tokens',() => {
  const value=token(); assert.match(value,/^[a-f0-9]{64}$/); assert.notEqual(digest(value),value);
});
test('rate limiter rejects excess requests for the same IP and leaves another IP separate',() => {
  const limit=rateLimit({limit:2,windowMs:10000});
  let allowed=0; let code=0; let retry='';
  const res={set:(name,value) => { retry=value; },status:value => { code=value; return res; },json:() => {}};
  const next=() => allowed++;
  limit({ip:'127.0.0.1'},res,next); limit({ip:'127.0.0.1'},res,next); limit({ip:'127.0.0.1'},res,next);
  assert.equal(allowed,2); assert.equal(code,429); assert.ok(Number(retry)>0);
  limit({ip:'127.0.0.2'},res,next); assert.equal(allowed,3);
});
test('migration/test guards refuse unrelated databases and non-test names',() => {
  assertProjectDatabase('postgresql://localhost/f10_anatomy_test',true);
  assertProjectDatabase('postgresql://localhost/f10_anatomy');
  assert.throws(() => assertProjectDatabase('postgresql://localhost/postgres'));
  assert.throws(() => assertProjectDatabase('postgresql://localhost/f10_anatomy',true));
  assert.throws(() => assertProjectDatabase('postgresql://localhost/customer_test',true));
});
