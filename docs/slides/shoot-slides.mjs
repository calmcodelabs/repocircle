import { writeFileSync, readFileSync } from 'node:fs';
const OUT = process.argv[2], PAGE = process.argv[3];
const order = JSON.parse(readFileSync(process.argv[4], 'utf8'));
let id=0, ws; const pending=new Map();
const send=(m,p={},s)=>new Promise((res,rej)=>{const g={id:++id,method:m,params:p};if(s)g.sessionId=s;pending.set(g.id,{res,rej});ws.send(JSON.stringify(g))});
const v=await (await fetch('http://127.0.0.1:9222/json/version')).json();
ws=new WebSocket(v.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}};
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const s=(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
for(const d of ['Page','Runtime']) await send(d+'.enable',{},s);
await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false},s);
await send('Page.navigate',{url:'file://'+PAGE},s);
await new Promise(r=>setTimeout(r,5000));
for (const {k} of order) {
  const box = (await send('Runtime.evaluate',{expression:`(()=>{const e=document.getElementById('${k}');const r=e.getBoundingClientRect();return JSON.stringify({x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height})})()`,returnByValue:true},s)).result.value;
  const b=JSON.parse(box);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:b.x,y:b.y,width:b.w,height:b.h,scale:1}},s);
  writeFileSync(`${OUT}/${k}.png`, Buffer.from(data,'base64'));
  console.log('slide', k, Math.round(b.w)+'x'+Math.round(b.h));
}
console.log('SLIDES DONE');
process.exit(0);
