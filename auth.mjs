import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<14||password.length>256)throw new Error('Use a password between 14 and 256 characters.');
 const salt=randomBytes(16).toString('hex');
 const hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length>256)return false;
 const [method,salt,hex]=String(encoded).split(':');if(method!=='scrypt'||!salt||!hex)return false;
 const expected=Buffer.from(hex,'hex');const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
