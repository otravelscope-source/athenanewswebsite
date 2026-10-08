import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from '../server.mjs';
test('reader lifecycle, privacy, persistence and news preferences',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'athena-reader-test-'));const app=await createApp({dataDir:dir,siteUrl:'http://localhost',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';
 async function request(path,data,headers={}){const r=await fetch(base+path,{redirect:'manual',headers:{Cookie:cookie,Origin:'http://localhost','Content-Type':'application/json','X-CSRF-Token':csrf,...headers},...(data!==undefined?{method:'POST',body:JSON.stringify(data)}:{})});const content=r.headers.get('content-type')||'';return {status:r.status,body:content.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')}}
 try{
 assert.equal((await request('/account')).status,303);
 assert.equal((await request('/api/reader/me')).status,401);
 assert.equal((await request('/api/reader/signup',{email:'reader@example.test',password:'Very-long-password-123',consent:true},{Origin:'https://evil.test'})).status,403);
 let r=await request('/api/reader/signup',{email:'reader@example.test',password:'Very-long-password-123',consent:true});assert.equal(r.status,200);let recovery=r.body.recovery;cookie=r.cookie.split(';')[0];assert.match(r.cookie,/HttpOnly/);
 r=await request('/api/reader/me');csrf=r.body.csrf;assert.equal(r.body.email,'reader@example.test');assert(!('password_hash' in r.body));
 assert.equal((await request('/api/articles')).status,401);
 assert.equal((await request('/api/reader/preferences',{sections:['Culture']},{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await request('/api/reader/preferences',{sections:['Culture']})).status,200);
 r=await request('/api/reader/feed');assert(r.body.articles.length);assert(r.body.articles.every(a=>a.category==='Culture'));
 const id=r.body.articles[0].id;await request('/api/reader/read',{ids:[id]});assert.equal((await request('/api/reader/feed')).body.articles.find(a=>a.id===id).unread,0);
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM readers').get().n,1);
 const oldCookie=cookie;await request('/api/reader/logout',{});assert.equal((await request('/api/reader/me')).status,401);
 r=await request('/api/reader/recover',{email:'reader@example.test',recovery,newPassword:'Another-long-password-123'});assert.equal(r.status,200);cookie=r.cookie.split(';')[0];csrf=(await request('/api/reader/me')).body.csrf;
 assert.equal((await request('/api/reader/recover',{email:'reader@example.test',recovery,newPassword:'Another-long-password-123'})).status,401);
 assert.equal((await request('/api/reader/me',undefined,{Cookie:oldCookie})).status,401);
 r=await request('/api/reader/password',{password:'Another-long-password-123',newPassword:'Newest-long-password-123'});assert.equal(r.status,200);cookie=r.cookie.split(';')[0];csrf=(await request('/api/reader/me')).body.csrf;
 assert.equal((await request('/api/reader/delete',{password:'wrong',confirm:true})).status,401);
 assert.equal((await request('/api/reader/delete',{password:'Newest-long-password-123',confirm:true})).status,200);
 assert.equal(app.db.prepare('SELECT count(*) AS n FROM readers').get().n,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM reader_reads').get().n,0);assert.equal(app.db.prepare('SELECT count(*) AS n FROM reader_sessions').get().n,0);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
