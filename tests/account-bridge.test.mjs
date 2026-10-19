import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('account handoff binds destination and PKCE, expires, rejects replay and disabled users',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'muse-bridge-'));process.env.DATA_DIR=dir;delete process.env.MYSQL_HOST;delete process.env.DB_HOST;
 const {default:express}=await import('../server/node_modules/express/index.js');
 const {initStorage,db}=await import('../server/src/db.js');await initStorage();
 const {signToken}=await import('../server/src/auth.js');const {default:bridge}=await import('../server/src/routes/account-bridge.js');
 db().users.push({id:'bridge-user',status:'active',display_name:'测试'});
 const app=express();app.use(express.json());app.use(bridge);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const verifier=crypto.randomBytes(32).toString('hex'),challenge=crypto.createHash('sha256').update(verifier).digest('hex');
 async function req(p,body,auth=false){const r=await fetch(`http://127.0.0.1:${server.address().port}${p}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+signToken({id:'bridge-user'})}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 const issue=()=>req('/bridge',{target:'paper',challenge},true);
 assert.equal((await req('/bridge',{target:'paper',challenge})).status,401);
 assert.equal((await req('/bridge',{target:'https://evil.invalid',challenge},true)).status,400);
 assert.equal((await req('/bridge',{target:'__proto__',challenge},true)).status,400);
 let ticket=await issue();assert.equal(ticket.status,200);assert.ok(ticket.data.url.startsWith('https://letter.imuse.chat/connect?'));
 let code=new URL(ticket.data.url).searchParams.get('code');
 assert.equal((await req('/bridge/exchange',{code,verifier:'wrong',target:'paper'})).status,401);
 assert.equal((await req('/bridge/exchange',{code,verifier,target:'muse'})).status,401);
 const result=await req('/bridge/exchange',{code,verifier,target:'paper'});assert.equal(result.data.user.id,'bridge-user');assert.ok(result.data.token);
 assert.equal((await req('/bridge/exchange',{code,verifier,target:'paper'})).status,401);
 ticket=await issue();code=new URL(ticket.data.url).searchParams.get('code');db().users[0].status='disabled';
 assert.equal((await req('/bridge/exchange',{code,verifier,target:'paper'})).status,401);
 db().users[0].status='active';ticket=await issue();code=new URL(ticket.data.url).searchParams.get('code');
 const old=Date.now;Date.now=()=>old()+121000;
 try{assert.equal((await req('/bridge/exchange',{code,verifier,target:'paper'})).status,401);}finally{Date.now=old;}
});
