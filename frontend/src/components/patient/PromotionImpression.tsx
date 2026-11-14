import { useEffect, useRef } from 'react';
import { apiRequest } from '../../lib/api';
export function PromotionImpression({token}:{token:string}) {
  const ref=useRef<HTMLSpanElement>(null);
  useEffect(()=>{const element=ref.current?.closest('article');if(!element)return;let sent=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const observer=new IntersectionObserver(entries=>{clearTimeout(timer);if(!sent&&entries[0]?.intersectionRatio>=0.5)timer=setTimeout(()=>{if(document.visibilityState!=='visible')return;sent=true;void apiRequest('/patient/promotion-impression',{method:'POST',body:JSON.stringify({token})}).catch(()=>undefined);},1000);},{threshold:[0,0.5]});observer.observe(element);return()=>{observer.disconnect();clearTimeout(timer);};},[token]);
  return <span ref={ref} className="self-start rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Promovat</span>;
}
