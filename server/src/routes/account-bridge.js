import { Router } from 'express';
import crypto from 'node:crypto';
import { authRequired, findUserById, publicUser, signToken } from '../auth.js';
const router=Router(), tickets=new Map();
const destinations={letter:(process.env.LETTER_PUBLIC_URL||'https://letter.imuse.chat').replace(/\/$/,'' )+'/connect',paper:(process.env.LETTER_PUBLIC_URL||'https://letter.imuse.chat').replace(/\/$/,'' )+'/connect',muse:(process.env.MUSE_PUBLIC_URL||'https://imuse.chat').replace(/\/$/,'')+'/connect'};
router.post('/bridge',authRequired,(req,res)=>{
 const {target,challenge}=req.body||{};
 if(!Object.hasOwn(destinations,target)||!/^[a-f0-9]{64}$/.test(challenge||''))return res.status(400).json({code:40001,message:'登录接续参数无效'});
 const now=Date.now();for(const [k,v] of tickets)if(v.expires<now)tickets.delete(k);
 if(tickets.size>=10000)return res.status(429).json({code:42901,message:'请稍后重试'});
 const code=crypto.randomBytes(32).toString('hex');tickets.set(code,{user:req.user.id,challenge,target,expires:now+120000});
 res.set('Cache-Control','no-store').json({code:0,data:{url:destinations[target]+'?code='+code+'&target='+target}});
});
router.post('/bridge/exchange',(req,res)=>{
 const {code,verifier,target}=req.body||{},ticket=tickets.get(code);
 if(!ticket||ticket.expires<Date.now()||ticket.target!==target||typeof verifier!=='string'||verifier.length>128||crypto.createHash('sha256').update(verifier).digest('hex')!==ticket.challenge)
  return res.status(401).json({code:40101,message:'登录接续已过期，请重新进入'});
 tickets.delete(code);const user=findUserById(ticket.user);
 if(!user||user.status==='disabled')return res.status(401).json({code:40101,message:'账号不可用'});
 res.set('Cache-Control','no-store').json({code:0,data:{token:signToken(user),user:publicUser(user)}});
});
export default router;
