// Same Muse admin session; the Letter service credential never reaches the browser.
import {Router} from 'express';
import {adminRequired} from '../auth.js';
import {db} from '../db.js';
const router=Router();router.use(adminRequired);
const base=String(process.env.LETTER_BASE_URL||'https://letter.imuse.chat').replace(/\/+$/,'');
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>res.status(e.status||502).json({code:50201,message:e.message||'纸上逢管理服务暂不可用'}));
async function forward(req,res,path,{method='GET',body,image=false}={}){
 if(!process.env.LETTER_FEEDBACK_TOKEN)throw Object.assign(new Error('服务端未配置 Letter 管理连接'),{status:503});
 const r=await fetch(base+'/api/v1/paper/admin'+path,{method,headers:{'Content-Type':'application/json','X-Admin-Token':process.env.LETTER_FEEDBACK_TOKEN,'X-Admin-Actor':req.admin.id},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 res.set('Cache-Control','no-store');
 if(image&&r.ok){res.type('image/webp').send(Buffer.from(await r.arrayBuffer()));return;}
 const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.message||'纸上逢请求失败'),{status:r.status===403?502:r.status});
 if(path.startsWith('/users?'))result.data.list=result.data.list.map(p=>{const u=db().users.find(u=>u.id===p.id);return {...p,account:u?{name:u.display_name,email:u.email,status:u.status||'active'}:null};});
 res.json(result);
}
for(const resource of ['stats','users','letters','reports','audit'])router.get('/paper/'+resource,wrap(async(req,res)=>{
 const q=new URLSearchParams();for(const key of ['q','page','status','user_id'])if(typeof req.query[key]==='string')q.set(key,req.query[key]);
 return forward(req,res,'/'+resource+'?'+q);
}));
router.get('/paper/letters/:id',wrap((req,res)=>forward(req,res,'/letters/'+encodeURIComponent(req.params.id))));
router.get('/paper/letters/:id/image',wrap((req,res)=>forward(req,res,'/letters/'+encodeURIComponent(req.params.id)+'/image',{image:true})));
for(const [resource,action] of [['users','suspension'],['letters','moderation'],['reports','resolve']])router.post('/paper/'+resource+'/:id/'+action,wrap((req,res)=>{
 const {active,days,hidden,reason,note}=req.body||{};
 const body=action==='suspension'?{active,days,reason}:action==='moderation'?{hidden,reason}:{note};
 return forward(req,res,'/'+resource+'/'+encodeURIComponent(req.params.id)+'/'+action,{method:'POST',body});
}));
export default router;
