import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {layout} from '../views.mjs';

async function launch(extra={}){const dir=await mkdtemp(join(tmpdir(),'athena-visibility-'));const app=await createApp({dataDir:dir,siteUrl:'http://localhost',production:false,newsletter:{autoStart:false},...extra});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return {...app,base:'http://127.0.0.1:'+app.server.address().port,cleanup:async()=>{await app.close();await rm(dir,{recursive:true,force:true})}};}
function story(app,{id='search-story',status='published',date=new Date().toISOString(),category='World'}={}){app.db.prepare('INSERT INTO articles(id,title,subtitle,category,author,body,image,credit,status,updated,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'Children & reporting </script><script>unsafe()</script>','Evidence and context.',category,'ATHENA','A report.\n\nThe Athena Perspective.','https://example.test/photo.jpg','Context photo.',status,date,date);}
test('Public discovery: canonical pages, structured data, crawler routes, dates and private exclusions',async()=>{
 const app=await launch();try{story(app,{date:'2026-10-02T00:00:00.000Z'});story(app,{id:'private-draft',status:'draft'});story(app,{id:'archived-story',status:'archived'});
 const r=await fetch(app.base+'/article/search-story'),html=await r.text();assert.equal(r.status,200);assert.match(html,/Originally reported 2 October 2026/);assert.match(html,/og:type" content="article/);assert.match(html,/og:image" content="https:\/\/example.test\/photo.jpg/);
 const ld=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1],data=JSON.parse(ld);assert.equal(data['@type'],'NewsArticle');assert.equal(data.headline,'Children & reporting </script><script>unsafe()</script>');assert.equal(data.datePublished,'2026-10-02T00:00:00.000Z');assert.equal(data.author['@type'],'Organization');assert.equal(data.mainEntityOfPage['@id'],'http://localhost/article/search-story');assert(!html.includes('<script>unsafe()</script>'));assert(r.headers.get('content-security-policy').includes('sha256-'+createHash('sha256').update(ld).digest('base64')));assert(!r.headers.get('content-security-policy').includes('unsafe-inline'));
 const sitemap=await (await fetch(app.base+'/sitemap.xml')).text();assert(sitemap.includes('/about</loc>'));assert(sitemap.includes('/contact</loc>'));assert(sitemap.includes('/section/health</loc>'));assert(sitemap.includes('search-story'));assert(!sitemap.includes('private-draft'));assert(!sitemap.includes('archived-story'));assert(!sitemap.includes('/account'));assert(!sitemap.includes('/email/'));
 const robots=await (await fetch(app.base+'/robots.txt')).text();assert.match(robots,/Allow: \//);assert.match(robots,/Disallow: \/email\//);assert.match(robots,/Sitemap: http:\/\/localhost\/news-sitemap.xml/);
 const feed=await fetch(app.base+'/feed.xml');assert.equal(feed.headers.get('content-type'),'application/rss+xml; charset=utf-8');const rss=await feed.text();assert(rss.includes('Children &amp; reporting &lt;/script&gt;'));assert(rss.includes('Fri, 02 Oct 2026 00:00:00 GMT'));assert(!rss.includes('private-draft'));
 story(app,{id:'fresh-news'});const news=await (await fetch(app.base+'/news-sitemap.xml')).text();assert(news.includes('fresh-news'));assert(!news.includes('/article/search-story</loc>'));
 const old=await fetch(app.base+'/?section=Health',{redirect:'manual'});assert.equal(old.status,308);assert.equal(old.headers.get('location'),'/section/health');assert.equal((await fetch(app.base+'/section/health')).status,200);assert.equal((await fetch(app.base+'/section/nonexistent')).status,404);
 const signup=await (await fetch(app.base+'/subscribe')).text();assert.match(signup,/canonical" href="http:\/\/localhost\/subscribe/);assert.match(signup,/name="emailUpdates" type="checkbox" disabled/);assert.match(signup,/Email alerts are coming soon/);assert.match(signup,/src="\/members\.js\?v=/);assert.equal((await fetch(app.base+'/members.js?v=test')).headers.get('cache-control'),'no-cache');assert.equal((await fetch(app.base+'/api/site-status')).status,401);
 const authPage=await fetch(app.base+'/signin');assert.match(authPage.headers.get('x-robots-tag'),/noindex/);assert.match(await authPage.text(),/noindex,nofollow/);const headerOnly=await fetch(app.base+'/sitemap.xml',{method:'HEAD'});assert.equal(headerOnly.status,200);assert.equal(await headerOnly.text(),'');
 const visits=app.db.prepare('SELECT * FROM site_daily_views').all();assert(visits.length>0);assert(visits.every(v=>Object.keys(v).join(',')==='day,path,referrer_host,views'));
 const verified=layout('Example',{canonical:'https://news.example.test/',verification:'valid_google_token-123'});assert.match(verified,/google-site-verification" content="valid_google_token-123/);assert(!layout('',{verification:'bad"><script>bad</script>'}).includes('google-site-verification'));
 }finally{await app.cleanup()}
});
test('Canonical domain redirects preserve paths and queries without redirecting mutations',async()=>{
 const app=await launch({siteUrl:'https://www.news.example.test',production:true});
 const request=(path,method='GET')=>new Promise((resolve,reject)=>{const req=httpRequest(app.base+path,{method,headers:{Host:'old.up.railway.app',Origin:'https://old.up.railway.app','Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res))});req.on('error',reject);req.end(method==='POST'?'{}':undefined)});
 try{const r=await request('/about?ref=story');assert.equal(r.statusCode,308);assert.equal(r.headers.location,'https://www.news.example.test/about?ref=story');assert.equal((await request('/health')).statusCode,200);const mutation=await request('/api/reader/signup','POST');assert.equal(mutation.statusCode,403);assert.equal(mutation.headers.location,undefined);}finally{await app.cleanup()}
});
