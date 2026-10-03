import {openDatabase} from '../database.mjs';
import {hashPassword} from '../auth.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){console.error('Usage: npm run setup -- editor@example.com\nRun on your own server. Password entry is hidden.');process.exit(1)}
async function hidden(prompt){
 if(!process.stdin.isTTY)throw new Error('Run account setup from an interactive terminal.');
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';function cleanup(){process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')}
 function read(buffer){for(const char of buffer.toString('utf8')){if(char==='\u0003'){cleanup();reject(new Error('Cancelled'));return}if(char==='\r'||char==='\n'){cleanup();resolve(value);return}if(char==='\u007f'||char==='\b'){value=value.slice(0,-1)}else if(char>=' '){value+=char}}}process.stdin.on('data',read)})
}
try{console.log('Create or reset the ATHENA editor. Existing sessions will be signed out.');const password=await hidden('Password (at least 14 characters): ');const confirm=await hidden('Repeat password: ');if(password!==confirm)throw new Error('Passwords do not match.');const hash=await hashPassword(password);const dataDir=resolve(process.env.DATA_DIR||fileURLToPath(new URL('../data',import.meta.url)));const db=openDatabase(dataDir);db.exec('BEGIN');try{db.prepare('INSERT INTO admin VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash').run(email,hash);db.exec('DELETE FROM sessions; DELETE FROM login_limits; COMMIT')}catch(e){db.exec('ROLLBACK');throw e}db.close();console.log('Editor account saved. You can now sign in at /login.')}catch(e){console.error(e.message);process.exit(1)}
