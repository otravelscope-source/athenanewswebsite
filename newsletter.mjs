import {randomUUID} from 'node:crypto';
import {digest,token} from './auth.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=n=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n));
const date=n=>new Date(n).toLocaleDateString('en-GB',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
export function createNewsletter({db,siteUrl,config={}}){
 const apiKey=config.apiKey??process.env.RESEND_API_KEY??'';
 const from=config.from??process.env.NEWSLETTER_FROM??'';
 const enabled=config.enabled??process.env.NEWSLETTER_ENABLED==='true';
 const replyTo=config.replyTo??process.env.NEWSLETTER_REPLY_TO??'otravelscope@gmail.com';
 const fetchEmail=config.fetch??fetch;
 const configured=!!apiKey&&/^[^\r\n]+@[^\s<>]+\.[^\s<>]+>?$/.test(from)&&!/[\r\n]/.test(replyTo);
 const available=enabled&&configured;
 db.exec(`CREATE TABLE IF NOT EXISTS reader_mail(reader_id TEXT PRIMARY KEY REFERENCES readers(id) ON DELETE CASCADE,opt_in INTEGER NOT NULL DEFAULT 0,verified_at TEXT,consent_at TEXT,confirmation_hash TEXT,confirmation_expires INTEGER,unsubscribe_token TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS mail_publications(article_id TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS mail_jobs(id TEXT PRIMARY KEY,reader_id TEXT NOT NULL REFERENCES readers(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('confirmation','story')),article_id TEXT,payload TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','sending','accepted','cancelled','failed')),attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,due_at INTEGER NOT NULL,first_attempt_at INTEGER,leased_at INTEGER,accepted_at INTEGER,provider_id TEXT,error_code TEXT);
 CREATE INDEX IF NOT EXISTS mail_jobs_due ON mail_jobs(state,due_at);`);
 // Establish a baseline once: turning on email must not blast the existing archive.
 if(!db.prepare("SELECT value FROM metadata WHERE key='mail-baseline'").get()){
  db.exec('BEGIN');try{db.prepare("INSERT OR IGNORE INTO mail_publications SELECT id FROM articles WHERE status='published'").run();db.prepare("INSERT INTO metadata VALUES('mail-baseline','1')").run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
 let running=null,stopped=false,timer;
 function fail(status,message){const e=new Error(message);e.status=status;throw e}
 function state(id){const m=db.prepare('SELECT opt_in,verified_at FROM reader_mail WHERE reader_id=?').get(id);return {available,optedIn:!!m?.opt_in,verified:!!m?.verified_at};}
 function cancel(id){db.prepare("UPDATE mail_jobs SET state='cancelled' WHERE reader_id=? AND state IN ('pending','sending','failed')").run(id);}
 function payload(to,subject,html,text,unsub){return {from,to:[to],subject,html,text,...(replyTo?{reply_to:replyTo}:{}),...(unsub?{headers:{'List-Unsubscribe':'<'+unsub+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})};}
 function enqueue(id,readerId,kind,articleId,message){const now=Date.now();db.prepare("INSERT OR IGNORE INTO mail_jobs(id,reader_id,kind,article_id,payload,state,created_at,due_at) VALUES (?,?,?,?,?,'pending',?,?)").run(id,readerId,kind,articleId,JSON.stringify(message),now,now);}
 function unsubscribe(id){db.prepare('UPDATE reader_mail SET opt_in=0,confirmation_hash=NULL,confirmation_expires=NULL WHERE reader_id=?').run(id);cancel(id);}
 function subscribe(id){
  if(!available)fail(503,'Email updates are not active yet. Your reader account and news feed still work.');
  const reader=db.prepare('SELECT email FROM readers WHERE id=?').get(id);if(!reader)fail(404,'Reader account not found.');
  const old=db.prepare('SELECT * FROM reader_mail WHERE reader_id=?').get(id);
  if(old?.opt_in&&old.verified_at)return state(id);
  if(old?.opt_in&&old.confirmation_expires>Date.now()&&db.prepare("SELECT id FROM mail_jobs WHERE reader_id=? AND kind='confirmation' AND state IN ('pending','sending')").get(id))return state(id);
  if(old?.opt_in&&old.confirmation_expires>Date.now()+47*3600000)fail(429,'Please wait before requesting another confirmation email.');
  const raw=token(),now=Date.now(),unsub=old?.unsubscribe_token||token();cancel(id);
  db.prepare('INSERT INTO reader_mail(reader_id,opt_in,verified_at,consent_at,confirmation_hash,confirmation_expires,unsubscribe_token) VALUES (?,1,NULL,?,?,?,?) ON CONFLICT(reader_id) DO UPDATE SET opt_in=1,verified_at=NULL,consent_at=excluded.consent_at,confirmation_hash=excluded.confirmation_hash,confirmation_expires=excluded.confirmation_expires').run(id,new Date(now).toISOString(),digest(raw),now+48*3600000,unsub);
  const link=siteUrl+'/email/confirm?token='+raw,stop=siteUrl+'/email/unsubscribe?token='+unsub;
  const text='Confirm your ATHENA email updates\n\nYou asked for new stories from your chosen news sections. Confirm within 48 hours:\n'+link+'\n\nIf you did not request this, ignore this email. No news updates will be sent until you confirm.\nStop this request: '+stop;
  enqueue('confirm-'+randomUUID(),id,'confirmation',null,payload(reader.email,'Confirm your ATHENA email updates','<h1>ATHENA</h1><h2>Confirm your news updates</h2><p>You asked for new stories from your chosen sections. This link expires in 48 hours.</p><p><a href="'+esc(link)+'">Confirm email updates</a></p><p>If you did not request this, ignore this message. We will not send news until you confirm.</p><p><a href="'+esc(stop)+'">Stop this request</a></p>',text));
  return state(id);
 }
 function confirmation(raw){if(!/^[a-f0-9]{64}$/.test(raw||''))return null;return db.prepare('SELECT * FROM reader_mail WHERE confirmation_hash=? AND confirmation_expires>? AND opt_in=1').get(digest(raw),Date.now())||null;}
 function confirm(raw){const m=confirmation(raw);if(!m)fail(400,'This confirmation link has expired or was already used. Sign in to request a new one.');db.prepare('UPDATE reader_mail SET verified_at=?,confirmation_hash=NULL,confirmation_expires=NULL WHERE reader_id=?').run(new Date().toISOString(),m.reader_id);db.prepare("UPDATE mail_jobs SET state='cancelled' WHERE reader_id=? AND kind='confirmation' AND state IN ('pending','sending')").run(m.reader_id);return true;}
 function unsubscribeToken(raw){if(!/^[a-f0-9]{64}$/.test(raw||''))return false;const m=db.prepare('SELECT reader_id FROM reader_mail WHERE unsubscribe_token=?').get(raw);if(!m)return false;unsubscribe(m.reader_id);return true;}
 function scan(){
  const stories=db.prepare("SELECT a.* FROM articles a LEFT JOIN mail_publications p ON p.article_id=a.id WHERE a.status='published' AND p.article_id IS NULL ORDER BY a.published_at").all();
  db.exec('BEGIN');try{for(const a of stories){db.prepare('INSERT OR IGNORE INTO mail_publications VALUES(?)').run(a.id);if(!available)continue;
   const readers=db.prepare('SELECT r.id,r.email,r.sections,m.unsubscribe_token FROM readers r JOIN reader_mail m ON m.reader_id=r.id WHERE m.opt_in=1 AND m.verified_at IS NOT NULL').all();
   for(const r of readers){if(!JSON.parse(r.sections).includes(a.category))continue;const original=a.published_at||a.updated,archive=day(original)<day(Date.now());const link=siteUrl+'/article/'+encodeURIComponent(a.id),unsub=siteUrl+'/email/unsubscribe?token='+r.unsubscribe_token;
    const subject=(archive?'ATHENA archive: ':'ATHENA: ')+a.title;const label=(archive?'Archive report · Originally reported ':'Reported ')+date(original);
    const text='ATHENA\n'+label+'\n\n'+a.title+'\n\n'+a.subtitle+'\n\nRead the story: '+link+'\n\nYou receive this because you confirmed updates for '+a.category+'.\nPreferences: '+siteUrl+'/account\nUnsubscribe: '+unsub;
    const html='<h1>ATHENA</h1><p>'+esc(label)+' · '+esc(a.category)+'</p><h2>'+esc(a.title)+'</h2><p>'+esc(a.subtitle)+'</p><p><a href="'+esc(link)+'">Read the full story</a></p><p>You confirmed news updates for '+esc(a.category)+'.</p><p><a href="'+esc(siteUrl+'/account')+'">Change preferences</a> · <a href="'+esc(unsub)+'">Unsubscribe</a></p>';
    enqueue('story-'+digest(a.id+':'+r.id),r.id,'story',a.id,payload(r.email,subject,html,text,unsub));
   }
  }db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
 async function processJobs(){
  if(stopped)return;scan();if(!available)return;
  const now=Date.now();db.prepare("UPDATE mail_jobs SET state='pending',leased_at=NULL WHERE state='sending' AND leased_at<?").run(now-5*60000);
  const jobs=db.prepare("SELECT * FROM mail_jobs WHERE state='pending' AND due_at<=? ORDER BY created_at LIMIT 5").all(now);
  for(const job of jobs){if(stopped)break;const m=db.prepare('SELECT * FROM reader_mail WHERE reader_id=?').get(job.reader_id),a=job.article_id?db.prepare('SELECT status,category FROM articles WHERE id=?').get(job.article_id):null,r=db.prepare('SELECT sections FROM readers WHERE id=?').get(job.reader_id);
   if(!m?.opt_in||!r||(job.kind==='story'&&(!m.verified_at||a?.status!=='published'||!JSON.parse(r.sections).includes(a.category)))||(job.kind==='confirmation'&&(!m.confirmation_hash||m.confirmation_expires<=now))){db.prepare("UPDATE mail_jobs SET state='cancelled' WHERE id=?").run(job.id);continue;}
   // Resend deduplicates for 24h. Hold ambiguous retries before that window expires.
   if(job.first_attempt_at&&Date.now()-job.first_attempt_at>=23*3600000){db.prepare("UPDATE mail_jobs SET state='failed',error_code='retry-window-expired' WHERE id=?").run(job.id);continue;}
   const claimed=db.prepare("UPDATE mail_jobs SET state='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),leased_at=? WHERE id=? AND state='pending'").run(Date.now(),Date.now(),job.id);if(!claimed.changes)continue;
   try{
    const response=await fetchEmail('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'athena-'+job.id},body:job.payload,signal:AbortSignal.timeout(10000)});
    let result={};try{result=await response.json()}catch{}
    if(!response.ok||typeof result.id!=='string'){const e=new Error('Provider request failed');e.status=response.status;e.retryable=response.status===429||response.status>=500||response.ok;throw e;}
    db.prepare("UPDATE mail_jobs SET state='accepted',accepted_at=?,provider_id=?,error_code=NULL WHERE id=?").run(Date.now(),result.id,job.id);
   }catch(e){const retryable=e.retryable??!e.status,nextAttempt=job.attempts+1;db.prepare('UPDATE mail_jobs SET state=?,due_at=?,error_code=? WHERE id=?').run(retryable&&nextAttempt<8?'pending':'failed',Date.now()+Math.min(30*60000,30000*2**job.attempts),e.status?'provider-http-'+e.status:'network-error',job.id);}
   if(!stopped)await new Promise(resolve=>{const t=setTimeout(resolve,600);t.unref();});
  }
 }
 function tick(){if(running)return running;running=processJobs().catch(()=>console.error('Newsletter processing failed; queued messages are retained.')).finally(()=>{running=null});return running;}
 function start(){if(timer)return;stopped=false;timer=setInterval(tick,30000);timer.unref();tick();}
 async function close(){stopped=true;if(timer)clearInterval(timer);await running;}
 function status(){return {enabled,configured,available,optedIn:db.prepare('SELECT COUNT(*) AS n FROM reader_mail WHERE opt_in=1').get().n,confirmed:db.prepare('SELECT COUNT(*) AS n FROM reader_mail WHERE opt_in=1 AND verified_at IS NOT NULL').get().n,jobs:db.prepare('SELECT state,COUNT(*) AS count FROM mail_jobs GROUP BY state').all()};}
 return {available,state,subscribe,unsubscribe,confirmation,confirm,unsubscribeToken,scan,tick,start,close,status};
}
