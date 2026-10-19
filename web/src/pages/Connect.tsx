import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
const LETTER_URL=import.meta.env.VITE_LETTER_URL||'https://letter.imuse.chat';
async function digest(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,'0')).join('');}
export default function Connect(){
 const [error,setError]=useState(''),started=useRef(false);
 useEffect(()=>{if(started.current)return;started.current=true;(async()=>{
  const p=new URLSearchParams(location.search),target=p.get('target'),code=p.get('code');
  if(code){
   const verifier=sessionStorage.getItem('am_bridge_verifier')||'';history.replaceState(null,'','/connect');
   const d=await api.post<{token:string}>('/auth/bridge/exchange',{code,verifier,target:'muse'},false);
   sessionStorage.removeItem('am_bridge_verifier');localStorage.setItem('am_token',d.token);location.replace('/');return;
  }
  if(target==='muse'&&!p.get('challenge')){
   const verifier=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem('am_bridge_verifier',verifier);
   location.replace(LETTER_URL+'/connect?target=muse&challenge='+await digest(verifier));return;
  }
  if(!['letter','paper','muse'].includes(target||''))throw new Error('请选择要前往的应用');
  if(!localStorage.getItem('am_token')){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));return;}
  try{const d=await api.post<{url:string}>('/auth/bridge',{target,challenge:p.get('challenge')});location.replace(d.url);}catch(e){if(e instanceof ApiError&&e.status===401){localStorage.removeItem('am_token');location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));return;}throw e;}
 })().catch(e=>setError(e.message));},[]);
 return <main className="mx-auto max-w-lg px-6 py-24"><h1 className="font-serif text-2xl">一封信，接续另一段灵感</h1><p className="my-6">{error||'正在用 Muse 账号为你接续登录…'}</p>{error&&<Link to="/">回到 Muse</Link>}</main>;
}
