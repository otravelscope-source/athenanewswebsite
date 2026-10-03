import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hashPassword} from '../auth.mjs';
const origin='http://localhost:3000';
async function launch(dataDir,production=false){const app=await createApp({dataDir,production,siteUrl:production?'https://news.example.test':origin});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));app.base='http://127.0.0.1:'+app.server.address().port;return app}
const password='Temporary-test-password-7391';
async function admin(app){app.db.prepare('INSERT INTO admin VALUES (1,?,?)').run('editor@example.test',await hashPassword(password))}
async function login(app,production=false){const r=await fetch(app.base+'/api/login',{method:'POST',headers:{Origin:production?'https://news.example.test':origin,'Content-Type':'application/json'},body:JSON.stringify({email:'editor@example.test',password})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const html=await (await fetch(app.base+'/studio',{headers:{Cookie:cookie}})).text();const csrf=html.match(/name="csrf-token" content="([^"]+)"/)[1];return {cookie,csrf,header:r.headers.get('set-cookie')}}
const fields={title:'A test story <script>alert(1)</script>',subtitle:'A <b>subtitle</b>',category:'World',author:'ATHENA',body:'A private draft.\n\n## Source context\n\nEvidence at https://example.com\n\n<script>alert(1)</script>',image:'',credit:'',status:'draft'};
test('Independent editor, publishing, images, export, conflicts, restart and logout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'athena-test-'));let app=await launch(dir);
 try{
  assert.equal((await fetch(app.base+'/health')).status,200);
  const notConfigured=await (await fetch(app.base+'/login')).text();assert.match(notConfigured,/not been configured/);
  await admin(app);const stored=app.db.prepare('SELECT password_hash FROM admin').get();assert.ok(!stored.password_hash.includes(password));
  assert.equal((await fetch(app.base+'/api/articles')).status,401);
  assert.equal((await fetch(app.base+'/api/export')).status,401);
  assert.equal((await fetch(app.base+'/api/articles',{headers:{'oai-authenticated-user-email':'editor@example.test','oai-authenticated-user-id':'fake'}})).status,401);
  assert.equal((await fetch(app.base+'/studio',{redirect:'manual'})).status,303);
  const auth=await login(app);assert.match(auth.header,/HttpOnly/);assert.match(auth.header,/SameSite=Strict/);
  const session=app.db.prepare('SELECT id_hash FROM sessions').get();assert.ok(!auth.cookie.includes(session.id_hash));
  const headers={'Content-Type':'application/json',Origin:origin,Cookie:auth.cookie,'X-CSRF-Token':auth.csrf};
  const post=(a,h=headers)=>fetch(app.base+'/api/articles',{method:'POST',headers:h,body:JSON.stringify(a)});
  assert.equal((await post(fields,{...headers,Origin:'https://other.example'})).status,403);
  assert.equal((await post(fields,{...headers,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await post({...fields,image:'javascript:alert(1)'})).status,400);
  assert.equal((await post({...fields,title:''})).status,400);
  let r=await post(fields);assert.equal(r.status,200);let a=await r.json();assert.equal(a.status,'draft');
  assert.equal((await fetch(app.base+'/article/'+a.id)).status,404);
  const saved=await (await fetch(app.base+'/api/articles',{headers:{Cookie:auth.cookie}})).json();assert.ok(saved.some(x=>x.id===a.id&&x.body===fields.body));
  const oldDraft=a;r=await post({...a,status:'published'});assert.equal(r.status,200);a=await r.json();assert.equal(a.revision,2);
  assert.equal((await post({...oldDraft,status:'published'})).status,409);
  const read=await (await fetch(app.base+'/article/'+a.id)).text();assert.ok(read.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!read.includes('<script>alert(1)</script>'));assert.match(read,/<h2>Source context<\/h2>/);assert.match(read,/rel="canonical"/);
  const html=await (await fetch(app.base+'/?section=World')).text();assert.ok(html.includes(a.id));assert.ok(!html.includes('chatgpt.site'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBbkAAAAASUVORK5CYII=','base64');
  r=await fetch(app.base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:png});assert.equal(r.status,201);const upload=await r.json();assert.ok(upload.url.startsWith('/uploads/'));assert.deepEqual(Buffer.from(await (await fetch(app.base+upload.url)).arrayBuffer()),png);
  assert.equal((await fetch(app.base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'image/svg+xml'},body:'<svg onload="alert(1)"/>'})).status,415);
  assert.equal((await fetch(app.base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:Buffer.alloc(5*1024*1024+1)})).status,413);
  r=await post({...a,image:upload.url});a=await r.json();assert.equal(a.image,upload.url);
  const archive=await (await fetch(app.base+'/api/export',{headers:{Cookie:auth.cookie}})).json();assert.ok(archive.articles.some(x=>x.id===a.id));assert.ok(!JSON.stringify(archive).includes('password_hash'));assert.ok(!JSON.stringify(archive).includes(auth.csrf));
  a=await (await post({...a,status:'archived'})).json();assert.equal((await fetch(app.base+'/article/'+a.id)).status,404);
  assert.ok(!(await (await fetch(app.base+'/sitemap.xml')).text()).includes(a.id));
  await app.close();app=await launch(dir);
  assert.equal((await fetch(app.base+'/article/'+a.id)).status,404);
  assert.ok((await (await fetch(app.base+'/api/articles',{headers:{Cookie:auth.cookie}})).json()).some(x=>x.id===a.id&&x.status==='archived'));
  assert.equal((await fetch(app.base+upload.url)).status,200);
  const republish=await fetch(app.base+'/api/articles',{method:'POST',headers,body:JSON.stringify({...a,status:'published'})});assert.equal(republish.status,200);
  const logout=await fetch(app.base+'/api/logout',{method:'POST',headers});assert.equal(logout.status,200);assert.equal((await fetch(app.base+'/api/articles',{headers:{Cookie:auth.cookie}})).status,401);
 }finally{await app.close();await rm(dir,{recursive:true,force:true})}
});
test('Production cookies, closed configuration and persistent login throttling',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'athena-security-'));let app=await launch(dir,true);
 try{await admin(app);const auth=await login(app,true);assert.match(auth.header,/__Host-athena_session=/);assert.match(auth.header,/; Secure/);
 for(let i=0;i<8;i++){const r=await fetch(app.base+'/api/login',{method:'POST',headers:{Origin:'https://news.example.test','Content-Type':'application/json'},body:JSON.stringify({email:'editor@example.test',password:'wrong password'})});assert.equal(r.status,401)}
 await app.close();app=await launch(dir,true);
 const denied=await fetch(app.base+'/api/login',{method:'POST',headers:{Origin:'https://news.example.test','Content-Type':'application/json'},body:JSON.stringify({email:'editor@example.test',password})});assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
 await assert.rejects(createApp({production:true,siteUrl:origin,dataDir:dir}),/requires HTTPS/);
 }finally{await app.close();await rm(dir,{recursive:true,force:true})}
});
test('One-time setup requires secret, origin and expiry, then stays closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'athena-setup-'));const key='a'.repeat(64);
 const app=await createApp({dataDir:dir,siteUrl:origin,setupToken:key,setupExpires:Date.now()+60000});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const post=(token=key,from=origin)=>fetch(base+'/api/setup',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify({token,email:'editor@example.test',password})});
 try{assert.equal((await post('wrong')).status,403);assert.equal((await post(key,'https://evil.test')).status,403);assert.equal((await post()).status,201);assert.equal((await post()).status,404);assert.equal((await fetch(base+'/setup')).status,404);assert.ok(app.db.prepare('SELECT password_hash FROM admin').get().password_hash.startsWith('scrypt:'));}finally{await app.close();await rm(dir,{recursive:true,force:true});}
 const expired=await createApp({dataDir:await mkdtemp(join(tmpdir(),'athena-expired-')),siteUrl:origin,setupToken:key,setupExpires:1});
 await new Promise(r=>expired.server.listen(0,'127.0.0.1',r));try{assert.equal((await fetch('http://127.0.0.1:'+expired.server.address().port+'/setup')).status,404);}finally{await expired.close();await rm(expired.dataDir,{recursive:true,force:true});}
});
