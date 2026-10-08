import {createMembers} from './members.mjs';
import http from 'node:http';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openDatabase,articleJSON} from './database.mjs';
import {digest,token,verifyPassword,hashPassword} from './auth.mjs';
import {home,articlePage,loginPage,studioPage,errorPage,setupPage,categories,esc} from './views.mjs';
const root=dirname(fileURLToPath(import.meta.url));
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
export async function createApp(options={}){
 const production=(options.production??process.env.NODE_ENV==='production');
 const siteUrl=(options.siteUrl??process.env.SITE_URL??'http://localhost:3000').replace(/\/$/,'');
 const origin=new URL(siteUrl).origin;
 if(origin!==siteUrl||!['http:','https:'].includes(new URL(siteUrl).protocol))throw new Error('SITE_URL must be an origin, such as https://news.example.com');
 if(production&&!siteUrl.startsWith('https://'))throw new Error('Production requires HTTPS in SITE_URL.');
 const setupToken=options.setupToken??process.env.SETUP_TOKEN??'';
 const setupExpires=Number(options.setupExpires??process.env.SETUP_EXPIRES??0);
 const setupEnabled=()=>/^[a-f0-9]{64}$/.test(setupToken)&&Date.now()<setupExpires;
 const dataDir=resolve(options.dataDir??process.env.DATA_DIR??join(root,'data'));
 const db=openDatabase(dataDir);
 const secure=siteUrl.startsWith('https://');
 const cookieName=secure?'__Host-athena_session':'athena_session';
 const dummyHash=await hashPassword(token());
 const stmt={session:db.prepare('SELECT * FROM sessions WHERE id_hash=? AND expires>?'),admin:db.prepare('SELECT * FROM admin WHERE id=1')};
 function session(req){const cookie=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));if(!cookie)return null;const raw=cookie.slice(cookieName.length+1);if(!/^[a-f0-9]{64}$/.test(raw))return null;return stmt.session.get(digest(raw),Date.now())??null}
 function requireSession(req){const s=session(req);if(!s)throw new HttpError(401,'Your session has expired. Sign in again; your unsaved text is still in this tab.');return s}
 function originCheck(req){if(req.headers.origin!==origin)throw new HttpError(403,'Request origin is not allowed.');if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site request rejected.')}
 function csrfCheck(req,s){originCheck(req);if(req.headers['x-csrf-token']!==s.csrf)throw new HttpError(403,'Your editor session changed. Save your text elsewhere, then reload this page.')}
 async function readBytes(req,max){if(Number(req.headers['content-length'])>max)throw new HttpError(413,'This upload is too large.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw new HttpError(413,'The request is too large.');chunks.push(chunk)}return Buffer.concat(chunks)}
 async function jsonBody(req,max=700000){if(!String(req.headers['content-type']).startsWith('application/json'))throw new HttpError(415,'JSON is required.');try{return JSON.parse((await readBytes(req,max)).toString('utf8'))}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'The submitted content could not be read.')}}
 function send(res,status,body,type='text/html; charset=utf-8',extra={}){res.writeHead(status,{'Content-Type':type,...extra});res.end(body)}
 function json(res,status,obj,headers={}){send(res,status,JSON.stringify(obj),'application/json; charset=utf-8',headers)}
 function authCookie(raw,maxAge){return `${cookieName}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`}
 function published(section){return section?db.prepare("SELECT * FROM articles WHERE status='published' AND category=? ORDER BY published_at DESC,updated DESC").all(section):db.prepare("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC,updated DESC").all()}
 const handleMembers=await createMembers({db,siteUrl,production,send,json,readJSON:jsonBody,originCheck});
 const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
 let path='';try{
 const url=new URL(req.url,siteUrl);path=url.pathname;
 if(await handleMembers(req,res,path))return;
 if(path==='/health'&&req.method==='GET'){db.prepare('SELECT 1').get();return json(res,200,{status:'ok'})}
 if(req.method==='GET'&&(path==='/style.css'||path==='/login.js'||path==='/setup.js'||path==='/studio.js'||path==='/members.js'||path==='/reader.js'||path==='/article-format.js'||path==='/favicon.svg'||/^\/images\/[a-zA-Z0-9_.-]+$/.test(path)||/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path))){
 const file=path.startsWith('/uploads/')?join(dataDir,path.slice(1)):join(root,'public',path.slice(1));const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[extname(file)];try{return send(res,200,await readFile(file),mime,{'Cache-Control':'public, max-age=3600'})}catch(e){if(e.code==='ENOENT')throw new HttpError(404,'Image or file not found.');throw e}
 }
 if(path==='/'&&req.method==='GET'){const section=categories.includes(url.searchParams.get('section'))?url.searchParams.get('section'):'All stories';return send(res,200,home(published(section==='All stories'?null:section),section,siteUrl))}
 if(path.startsWith('/article/')&&req.method==='GET'){const id=decodeURIComponent(path.slice(9));const a=db.prepare("SELECT * FROM articles WHERE id=? AND status='published'").get(id);if(!a)throw new HttpError(404,'This story is not available.');return send(res,200,articlePage(a,siteUrl))}
 if(path==='/robots.txt'&&req.method==='GET')return send(res,200,`User-agent: *\nAllow: /\nDisallow: /studio\nDisallow: /login\nDisallow: /account\nDisallow: /signin\nDisallow: /recover\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`,'text/plain; charset=utf-8');
 if(path==='/sitemap.xml'&&req.method==='GET')return send(res,200,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(siteUrl)}/</loc></url>${published().map(a=>`<url><loc>${esc(siteUrl)}/article/${encodeURIComponent(a.id)}</loc><lastmod>${esc(a.updated)}</lastmod></url>`).join('')}</urlset>`,'application/xml; charset=utf-8');
 if(path==='/setup'&&req.method==='GET'){
 if(stmt.admin.get()||!setupEnabled())throw new HttpError(404,'Setup is not available.');
 res.setHeader('Referrer-Policy','no-referrer');return send(res,200,setupPage());
 }
 if(path==='/api/setup'&&req.method==='POST'){
 originCheck(req);if(stmt.admin.get()||!setupEnabled())throw new HttpError(404,'Setup is not available.');
 const p=await jsonBody(req,10000);
 if(typeof p?.token!=='string'||digest(p.token)!==digest(setupToken))throw new HttpError(403,'The setup key is not valid.');
 const email=typeof p.email==='string'?p.email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new HttpError(400,'Enter a valid email address.');
 if(typeof p.password!=='string'||p.password.length<14||p.password.length>256)throw new HttpError(400,'Use a password between 14 and 256 characters.');
 const hash=await hashPassword(p.password);
 const result=db.prepare('INSERT OR IGNORE INTO admin VALUES(1,?,?)').run(email,hash);
 if(!result.changes)throw new HttpError(409,'Setup is already complete. Sign in instead.');
 return json(res,201,{ok:true});
 }
 if(path==='/login'&&req.method==='GET'){if(session(req))return send(res,303,'','text/plain',{Location:'/studio'});return send(res,200,loginPage(!!stmt.admin.get()))}
 if(path==='/studio'&&req.method==='GET'){const s=session(req);if(!s)return send(res,303,'','text/plain',{Location:'/login'});return send(res,200,studioPage(s.csrf,stmt.admin.get().email))}
 if(path==='/api/login'&&req.method==='POST'){
 originCheck(req);const p=await jsonBody(req,10000);if(!p||typeof p.email!=='string'||typeof p.password!=='string'||p.email.length>254)throw new HttpError(400,'Enter your email and password.');
 const admin=stmt.admin.get();if(!admin)throw new HttpError(503,'The editor account has not been configured.');
 const key='editor-login';const now=Date.now();const limit=db.prepare('SELECT * FROM login_limits WHERE key=?').get(key);
 if(limit&&limit.until_at>now&&limit.attempts>=8){res.setHeader('Retry-After',Math.ceil((limit.until_at-now)/1000));throw new HttpError(429,'Too many sign-in attempts. Please try again in 15 minutes.')}
 // One editor: a persistent global limit also prevents concurrent password guessing.
 db.prepare('INSERT INTO login_limits(key,attempts,until_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,until_at=excluded.until_at').run(key,limit&&limit.until_at>now?limit.attempts+1:1,limit&&limit.until_at>now?limit.until_at:now+15*60*1000);
 const email=p.email.trim().toLowerCase();const valid=await verifyPassword(p.password,email===admin.email?admin.password_hash:dummyHash);
 if(!valid||email!==admin.email)throw new HttpError(401,'Email or password is incorrect.');
 db.prepare('DELETE FROM login_limits WHERE key=?').run(key);db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
 const old=session(req);if(old)db.prepare('DELETE FROM sessions WHERE id_hash=?').run(old.id_hash);
 const raw=token();db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(raw),token(),now+8*60*60*1000);
 return json(res,200,{ok:true},{'Set-Cookie':authCookie(raw,8*60*60)});
 }
 if(path==='/api/logout'&&req.method==='POST'){const s=requireSession(req);csrfCheck(req,s);db.prepare('DELETE FROM sessions WHERE id_hash=?').run(s.id_hash);return json(res,200,{ok:true},{'Set-Cookie':authCookie('',0)})}
 if(path==='/api/articles'&&req.method==='GET'){requireSession(req);return json(res,200,db.prepare('SELECT * FROM articles ORDER BY updated DESC').all().map(articleJSON))}
 if(path==='/api/export'&&req.method==='GET'){requireSession(req);return json(res,200,{publication:'ATHENA',formatVersion:1,exportedAt:new Date().toISOString(),articles:db.prepare('SELECT * FROM articles ORDER BY updated DESC').all().map(articleJSON)},{'Content-Disposition':'attachment; filename="athena-articles.json"'})}
 if(path==='/api/articles'&&req.method==='POST'){
 const s=requireSession(req);csrfCheck(req,s);const a=await jsonBody(req);
 if(!a||typeof a!=='object'||Array.isArray(a))throw new HttpError(400,'Invalid article.');
 for(const [k,max] of Object.entries({title:250,subtitle:3000,category:40,author:250,body:150000,image:3000,credit:3000}))if(typeof a[k]!=='string'||a[k].length>max)throw new HttpError(400,`Please check the ${k} field.`);
 if(!a.title.trim()||!categories.includes(a.category)||!['draft','published','archived'].includes(a.status))throw new HttpError(400,'Add a headline and choose a section and status.');
 if(a.status==='published'&&!a.body.trim())throw new HttpError(400,'Add article text before publishing.');
 if(a.image&&!/^\/images\/[a-zA-Z0-9_.-]+$/.test(a.image)&&!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(a.image)){let u;try{u=new URL(a.image)}catch{}if(!u||u.protocol!=='https:'||u.username||u.password)throw new HttpError(400,'Use an HTTPS image address or upload a cover image.')}
 const id=a.id||randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new HttpError(400,'Invalid article ID.');
 const old=db.prepare('SELECT * FROM articles WHERE id=?').get(id);if(old&&a.revision!==old.revision)throw new HttpError(409,'This article changed in another tab. Copy your text before reloading to review the latest version.');
 const now=new Date().toISOString();const publishedAt=a.status==='published'?(old?.published_at??now):(old?.published_at??null);
 if(old){const result=db.prepare('UPDATE articles SET title=?,subtitle=?,category=?,author=?,body=?,image=?,credit=?,status=?,updated=?,published_at=?,revision=revision+1 WHERE id=? AND revision=?').run(a.title.trim(),a.subtitle,a.category,a.author,a.body,a.image,a.credit,a.status,now,publishedAt,id,a.revision);if(!result.changes)throw new HttpError(409,'This article changed in another tab. Copy your text, then reload.');}
 else db.prepare('INSERT INTO articles(id,title,subtitle,category,author,body,image,credit,status,updated,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,a.title.trim(),a.subtitle,a.category,a.author,a.body,a.image,a.credit,a.status,now,publishedAt);
 return json(res,200,articleJSON(db.prepare('SELECT * FROM articles WHERE id=?').get(id)));
 }
 if(path==='/api/uploads'&&req.method==='POST'){
 const s=requireSession(req);csrfCheck(req,s);const bytes=await readBytes(req,5*1024*1024);let ext='';
 if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';
 else if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
 else if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')ext='webp';
 if(!ext)throw new HttpError(415,'Choose a JPEG, PNG or WebP image. SVG and other file types are not accepted.');
 const filename=randomUUID()+'.'+ext;const tmp=join(dataDir,'uploads',filename+'.tmp');await writeFile(tmp,bytes,{flag:'wx',mode:0o600});await rename(tmp,join(dataDir,'uploads',filename));return json(res,201,{url:'/uploads/'+filename});
 }
 throw new HttpError(404,'Page not found.');
 }catch(e){const status=e instanceof HttpError?e.status:500;if(status===500)console.error('Request failed:',e.message);const message=status===500?'Something went wrong. Your saved articles are safe. Please try again.':e.message;if(!res.headersSent){if(path.startsWith('/api/'))json(res,status,{error:message});else send(res,status,errorPage(status,message))}else res.end()}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,dataDir,close:()=>new Promise((resolve,reject)=>server.close(e=>{db.close();e?reject(e):resolve()}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();const port=Number(process.env.PORT||3000);const host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>console.log(`ATHENA is running on ${host}:${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await app.close();process.exit(0)});
}
