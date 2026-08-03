const EP='https://non-somm.polished-snow-7889.workers.dev/somm';
const QS=[['What does NON1 taste like?','NON1'],['Is NON3 sweet?','NON3'],['How many calories in NON5?','NON5'],
['Does NON7 have caffeine?','NON7'],['Is it vegan?','NON1'],['How long does it keep?','NON2'],
['Where is NON made?',null],['What is NONHQ?',null],['Is it wine?',null],['Who started NON?',null]];
const f=[],t=[];
for(const [q,c] of QS){
  const t0=Date.now(); let first=null; const body={query:q}; if(c) body.code=c;
  const r=await fetch(EP,{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify(body)});
  const rd=r.body.getReader(); const dec=new TextDecoder(); let buf='';
  for(;;){ const {value,done}=await rd.read(); if(done) break;
    buf+=dec.decode(value,{stream:true}); const fr=buf.split('\n\n'); buf=fr.pop();
    for(const x of fr){ const l=x.replace(/^data:\s*/,'').trim(); if(!l||l==='[DONE]')continue;
      try{ const p=JSON.parse(l); if(p.token&&first===null) first=Date.now()-t0; }catch{} } }
  const tot=Date.now()-t0; f.push(first); t.push(tot);
  console.log(`ttft=${String(first).padStart(5)}ms total=${String(tot).padStart(5)}ms  ${q}`);
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
console.log(`\nTTFT median ${med(f)}ms   total median ${med(t)}ms`);
