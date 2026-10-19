import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('paper admin proxy requires a real admin, injects trusted actor and keeps service credentials on server',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'muse-paper-admin-'));process.env.DATA_DIR=dir;delete process.env.MYSQL_HOST;delete process.env.DB_HOST;
 const {default:express}=await import('../server/node_modules/express/index.js');
 const upstream=express();upstream.use(express.json());const calls=[];
 upstream.use((req,res)=>{calls.push({path:req.url,actor:req.get('x-admin-actor'),token:req.get('x-admin-token'),body:req.body});if(req.url.endsWith('/image'))return res.type('image/webp').send(Buffer.from('image-fixture'));res.json({code:0,data:{list:[{id:'paper-test-user',name:'笔名'}],ok:true}});});
 const source=upstream.listen(0,'127.0.0.1');await new Promise(r=>source.once('listening',r));
 process.env.LETTER_BASE_URL='http://127.0.0.1:'+source.address().port;process.env.LETTER_FEEDBACK_TOKEN='private-test-service-token';
 const {initStorage,db}=await import('../server/src/db.js');await initStorage();db().users.push({id:'paper-test-user',email:'fixture@example.invalid',display_name:'账户名'});
 const {signToken}=await import('../server/src/auth.js');const {default:router}=await import('../server/src/routes/paper-admin.js');const app=express();app.use(express.json());app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>source.close(r));await rm(dir,{recursive:true,force:true});});
 const admin=signToken({id:db().admin_users[0].id,role:'admin'}),user=signToken({id:'paper-test-user'});
 async function request(url,token,body){return fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Admin-Actor':'forged-browser-actor'},body:body?JSON.stringify(body):undefined});}
 assert.equal((await request('/paper/users','')).status,401);assert.equal((await request('/paper/users',user)).status,403);assert.equal(calls.length,0);
 const response=await request('/paper/users?q=笔名',admin);assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes('private-test-service-token'));assert.ok(text.includes('账户名'));assert.equal(calls.at(-1).actor,db().admin_users[0].id);
 assert.equal(calls.at(-1).token,'private-test-service-token');
 await request('/paper/users/paper-test-user/suspension',admin,{active:true,days:7,reason:'测试封禁',unexpected:'not-forwarded'});assert.equal(calls.at(-1).body.active,true);assert.equal(calls.at(-1).body.unexpected,undefined);
 const image=await request('/paper/letters/fixture/image',admin);assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(await image.text(),'image-fixture');
});
