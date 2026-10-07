import {readdirSync,readFileSync} from 'node:fs';
export function importArticles(db,dir=new URL('./published-articles/',import.meta.url)){
 let files;try{files=readdirSync(dir).filter(f=>/^[a-zA-Z0-9-]+\.json$/.test(f)).sort()}catch(e){if(e.code==='ENOENT')return;throw e}
 const insert=db.prepare('INSERT OR IGNORE INTO articles(id,title,subtitle,category,author,body,image,credit,status,updated,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
 db.exec('CREATE TABLE IF NOT EXISTS article_image_backfills (id TEXT PRIMARY KEY)');
 const backfill=db.prepare("UPDATE articles SET image=?, credit=? WHERE id=? AND image='' AND status='published'");
 const imageDone=db.prepare('SELECT id FROM article_image_backfills WHERE id=?');
 const markImage=db.prepare('INSERT OR IGNORE INTO article_image_backfills(id) VALUES (?)');
 const titles=new Set(db.prepare('SELECT title FROM articles').all().map(a=>a.title.trim().toLowerCase()));
 for(const f of files){try{
 const a=JSON.parse(readFileSync(new URL(f,dir),'utf8'));
 if(!a||!/^libfile_[a-f0-9]+$/.test(a.sourceLibraryId)||a.id!==a.sourceLibraryId.replace('_','-'))throw Error('Invalid source identity');
 for(const k of ['title','subtitle','category','author','body','image','credit','updated'])if(typeof a[k]!=='string')throw Error('Missing '+k);
 if(!a.title.trim()||!a.body.trim()||a.title.length>250||a.body.length>150000||!Number.isFinite(Date.parse(a.updated))||!['World','Health','Justice','Culture','Children','Perspectives'].includes(a.category))throw Error('Invalid article');
 if(a.image&&!/^https:\/\//.test(a.image)&&!/^\/images\/[a-zA-Z0-9_.-]+$/.test(a.image))throw Error('Invalid image');
 if(a.fillMissingImage===true && a.image && !imageDone.get(a.id)){
 db.exec('BEGIN');
 try{backfill.run(a.image,a.credit,a.id);markImage.run(a.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
 if(titles.has(a.title.trim().toLowerCase()))continue;
 insert.run(a.id,a.title,a.subtitle,a.category,a.author,a.body,a.image,a.credit,'published',a.updated,a.updated);
 titles.add(a.title.trim().toLowerCase());
 }catch(e){console.error('Article import skipped',f,e.message)}
 }
}
