import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
export function openDatabase(dataDir){
 mkdirSync(dataDir,{recursive:true,mode:0o700});mkdirSync(join(dataDir,'uploads'),{recursive:true,mode:0o700});
 const db=new DatabaseSync(join(dataDir,'athena.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY,title TEXT NOT NULL,subtitle TEXT NOT NULL,category TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',credit TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),updated TEXT NOT NULL,published_at TEXT,revision INTEGER NOT NULL DEFAULT 1);
 CREATE INDEX IF NOT EXISTS articles_status_date ON articles(status,published_at DESC);
 CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,until_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 if(!db.prepare("SELECT value FROM metadata WHERE key='seeded'").get()){
  const seeds=JSON.parse(readFileSync(new URL('./seed-articles.json',import.meta.url),'utf8'));
  const insert=db.prepare('INSERT OR IGNORE INTO articles(id,title,subtitle,category,author,body,image,credit,status,updated,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');try{for(const a of seeds)insert.run(a.id,a.title,a.subtitle,a.category,a.author,a.body,a.image,a.credit,a.status,a.updated,a.status==='published'?a.updated:null);db.prepare("INSERT INTO metadata VALUES ('seeded','1')").run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }
 return db;
}
export function articleJSON(a){return {id:a.id,title:a.title,subtitle:a.subtitle,category:a.category,author:a.author,body:a.body,image:a.image,credit:a.credit,status:a.status,updated:a.updated,publishedAt:a.published_at,revision:a.revision}}
