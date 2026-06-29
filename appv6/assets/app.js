const $=s=>document.querySelector(s);const $$=s=>document.querySelectorAll(s);
const DB_NAME='alm_image_store_v4',DB_VERSION=1,IMG_STORE='images';
const tokenKey='alm_settings_v3';
const DEFAULT_GA_ID='G-2NPSQJGJ11';
const DEFAULT_FIREBASE_DB_URL='https://affiliate-landing-stats-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEFAULT_WORKSPACE_ID='main';
const workspaceKey='alm_workspace_v53';
let products=[];let currentImageBlob=null;let currentImageUrl='';let selectedIds=new Set();let db=null;let realtimeTimer=null;let realtimeRunning=false;let lastRealtimeStats=null;let statsRange={mode:'today',from:'',to:''};
function uid(){try{return crypto.randomUUID()}catch(e){return 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2)}}
function esc(s=''){return String(s).replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function enc(v=''){try{return btoa(unescape(encodeURIComponent(v)))}catch(e){return v}}
function dec(v=''){try{return decodeURIComponent(escape(atob(v)))}catch(e){return v||''}}
function openDb(){return new Promise((res,rej)=>{let r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{let d=e.target.result;if(!d.objectStoreNames.contains(IMG_STORE))d.createObjectStore(IMG_STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbPut(id,blob){return new Promise((res,rej)=>{if(!db)return res();let tx=db.transaction(IMG_STORE,'readwrite');tx.objectStore(IMG_STORE).put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function idbGet(id){return new Promise((res,rej)=>{if(!db)return res(null);let tx=db.transaction(IMG_STORE,'readonly');let r=tx.objectStore(IMG_STORE).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}
function idbDel(id){return new Promise((res,rej)=>{if(!db)return res();let tx=db.transaction(IMG_STORE,'readwrite');tx.objectStore(IMG_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function cleanWorkspaceId(v){return cleanSlug(v||DEFAULT_WORKSPACE_ID)||DEFAULT_WORKSPACE_ID}
function workspaceSettings(){try{let w=JSON.parse(localStorage.getItem(workspaceKey)||'{}')||{};return {userName:w.userName||'ผู้ใช้หลัก',userId:w.userId||('user-'+uid().slice(0,8)),workspaceId:cleanWorkspaceId(w.workspaceId||DEFAULT_WORKSPACE_ID),workspaceName:w.workspaceName||'งานหลัก'}}catch(e){return {userName:'ผู้ใช้หลัก',userId:'user-'+uid().slice(0,8),workspaceId:DEFAULT_WORKSPACE_ID,workspaceName:'งานหลัก'}}}
function saveWorkspaceSettings(w){let cur=workspaceSettings();let data={userName:(w.userName||cur.userName||'ผู้ใช้หลัก').trim(),userId:cleanSlug(w.userId||cur.userId||('user-'+uid().slice(0,8))),workspaceId:cleanWorkspaceId(w.workspaceId||cur.workspaceId||DEFAULT_WORKSPACE_ID),workspaceName:(w.workspaceName||cur.workspaceName||'งานหลัก').trim()};localStorage.setItem(workspaceKey,JSON.stringify(data));return data}
function currentWorkspace(){return workspaceSettings()}
function workspaceProductsKey(){return 'alm_products_ws_'+currentWorkspace().workspaceId}
function workspaceClickStatsKey(){return 'alm_click_stats_v1_'+currentWorkspace().workspaceId}
function firebaseWsPath(path){return 'workspaces/'+currentWorkspace().workspaceId+'/'+path.replace(/^\/+|\/+$/g,'')}
function updateWorkspaceBadge(){let w=currentWorkspace();let b=$('#currentWorkspaceBadge');if(b)b.textContent='Workspace: '+w.workspaceName+' ('+w.workspaceId+')'}
function loadProducts(){try{let key=workspaceProductsKey();let raw=localStorage.getItem(key);if(!raw&&currentWorkspace().workspaceId===DEFAULT_WORKSPACE_ID&&localStorage.getItem('alm_products')){raw=localStorage.getItem('alm_products');localStorage.setItem(key,raw)}let data=JSON.parse(raw||'[]');return Array.isArray(data)?data:[]}catch(e){return []}}
function stripImages(list){return list.map(p=>{let x={...p};delete x.image;delete x.imageData;return x})}
function save(){try{localStorage.setItem(workspaceProductsKey(),JSON.stringify(stripImages(products)));localStorage.setItem('alm_products_backup_last_'+currentWorkspace().workspaceId,JSON.stringify(stripImages(products)));return true}catch(e){alert('บันทึกข้อมูลไม่สำเร็จ แต่รอบนี้ไม่ควรเกี่ยวกับรูปแล้ว เพราะรูปย้ายไปเก็บใน IndexedDB แล้ว');console.error(e);return false}}
function settings(){let raw=JSON.parse(localStorage.getItem(tokenKey)||localStorage.getItem('alm_settings')||'{}'); if(raw.tokenEnc&&!raw.token) raw.token=dec(raw.tokenEnc); return raw}
function saveSettings(s){let old=settings();let remember=$('#rememberGh')?$('#rememberGh').checked:true;let data={owner:s.owner||old.owner||'',repo:s.repo||old.repo||'',branch:s.branch||old.branch||'main',customDomain:s.customDomain||old.customDomain||'',gaId:s.gaId||old.gaId||DEFAULT_GA_ID,firebaseDbUrl:s.firebaseDbUrl||old.firebaseDbUrl||DEFAULT_FIREBASE_DB_URL,firebaseRefreshSec:s.firebaseRefreshSec||old.firebaseRefreshSec||5,remember}; if(remember&&s.token)data.tokenEnc=enc(s.token); localStorage.setItem(tokenKey,JSON.stringify(data))}
function clearSettings(){localStorage.removeItem(tokenKey);localStorage.removeItem('alm_settings')}
async function init(){
  try{
    document.documentElement.dataset.theme=localStorage.getItem('alm_theme')||'dark';
    db=await openDb();
  }catch(dbErr){
    console.warn('IndexedDB เปิดไม่ได้ จะใช้โหมดสำรอง', dbErr);
    db=null;
  }
  products=loadProducts();
  await migrateOldImages().catch(console.warn);
  bind();
  loadSettings();
  updateWorkspaceBadge();
  renderWorkspaceSelector && renderWorkspaceSelector();
  await render();
  updatePreview();
  updateSlugStatus();
}
// init จะถูกเรียกท้ายไฟล์ หลังประกาศ Workspace Manager ครบแล้ว เพื่อกัน error before initialization
async function migrateOldImages(){let changed=false;for(const p of products){if(p.image&&String(p.image).startsWith('data:')){try{await idbPut(p.id,dataUrlToBlob(p.image));delete p.image;changed=true}catch(e){console.warn(e)}}}if(changed)save()}
function bind(){
  $$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$('#'+b.dataset.view).classList.add('active');if(b.dataset.view==='stats')renderStats()});
  $('#themeToggle').onclick=()=>{let t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;localStorage.setItem('alm_theme',t)};
  $('#newBtn').onclick=resetForm;$('#resetBtn').onclick=resetForm;
  ['slug','name','shopee','lazada'].forEach(id=>$('#'+id).addEventListener('input',()=>{updatePreview(); if(id==='slug')updateSlugStatus()}));
  $('#randomSlugBtn').onclick=()=>{$('#slug').value=randomSlug();updateSlugStatus();updatePreview()};
  $('#dropZone').onclick=()=>$('#imageInput').click();$('#imageInput').onchange=e=>handleFile(e.target.files[0]);
  ['dragover','drop','dragleave'].forEach(ev=>$('#dropZone').addEventListener(ev,e=>{e.preventDefault();$('#dropZone').classList.toggle('drag',ev==='dragover');if(ev==='drop')handleFile(e.dataTransfer.files[0])}));
  $('#productForm').onsubmit=submitForm;$('#exportBtn').onclick=exportZip;$('#selectAllBtn').onclick=async()=>{products.forEach(p=>selectedIds.add(p.id));await render()};$('#clearSelectBtn').onclick=async()=>{selectedIds.clear();await render()};
  $('#publishSelectedBtn').onclick=publishSelected;$('#deleteWebSelectedBtn').onclick=deleteSelectedFromWeb;$('#backupBtn').onclick=backupProducts;$('#restoreBtn').onclick=()=>$('#restoreInput').click();$('#restoreInput').onchange=e=>restoreFile(e.target.files[0]);
  document.addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('import-drag')});document.addEventListener('dragleave',e=>{if(e.target===document||e.clientX<=0||e.clientY<=0)document.body.classList.remove('import-drag')});document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('import-drag');let file=[...(e.dataTransfer.files||[])].find(f=>/\.json$|\.zip$/i.test(f.name));if(file)restoreFile(file)});
  $('#saveGhBtn').onclick=()=>{saveSettings(getGh());log('บันทึกค่า GitHub แล้ว')};$('#testGhBtn').onclick=testConnection;$('#logoutGhBtn').onclick=()=>{if(confirm('ล้างค่า GitHub และ Token ออกจากเครื่องนี้?')){clearSettings();['ghOwner','ghRepo','customDomain','ghToken'].forEach(id=>$('#'+id).value='');$('#ghBranch').value='main';log('ล้างค่า GitHub แล้ว')}};
  ['ghOwner','ghRepo','ghBranch','customDomain','ghToken'].forEach(id=>$('#'+id).addEventListener('input',async()=>{if($('#rememberGh')?.checked)saveSettings(getGh());await render()}));$('#rememberGh').addEventListener('change',()=>{if($('#rememberGh').checked)saveSettings(getGh()); else {let s=getGh(); s.token=''; saveSettings(s)}});$('#publishBtn').onclick=publishGitHub;if($('#saveGaBtn'))$('#saveGaBtn').onclick=()=>{saveSettings(getGh());alert('บันทึกการตั้งค่า Firebase แล้ว ✅')};if($('#testGaBtn'))$('#testGaBtn').onclick=()=>{let id=getDefaultGaId();alert(/^G-[A-Z0-9]+$/i.test(id)?'รูปแบบ Measurement ID ถูกต้อง ✅':'รูปแบบควรเป็น G-XXXXXXXXXX')};if($('#globalGa'))$('#globalGa').addEventListener('input',()=>saveSettings(getGh()));['firebaseDbUrl','firebaseRefreshSec'].forEach(id=>{if($('#'+id))$('#'+id).addEventListener('input',()=>saveSettings(getGh()))});if($('#refreshStatsBtn'))$('#refreshStatsBtn').onclick=()=>refreshRealtimeStats(true);if($('#toggleRealtimeBtn'))$('#toggleRealtimeBtn').onclick=toggleRealtime;if($('#resetStatsBtn'))$('#resetStatsBtn').onclick=resetClickStats;if($('#testRealtimeBtn'))$('#testRealtimeBtn').onclick=()=>refreshRealtimeStats(true);bindStatsRangeControls();bindWorkspaceControls();
}
function dataUrlToBlob(dataUrl){let [head,b64]=dataUrl.split(',');let mime=(head.match(/data:(.*?);/)||[])[1]||'image/jpeg';let bin=atob(b64);let arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
function blobToDataUrl(blob){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function handleFile(file){if(!file||!file.type.startsWith('image/'))return alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');resizeImageToBlob(file,1400,.86).then(blob=>{currentImageBlob=blob;if(currentImageUrl)URL.revokeObjectURL(currentImageUrl);currentImageUrl=URL.createObjectURL(blob);$('#imagePreview').src=currentImageUrl;$('#imagePreview').style.display='block';updatePreview()}).catch(err=>alert('อ่านรูปไม่สำเร็จ: '+err.message))}
function resizeImageToBlob(file,maxSize=1400,quality=.86){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('อ่านไฟล์รูปไม่ได้'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('ไฟล์รูปเสียหรือเบราว์เซอร์อ่านไม่ได้'));img.onload=()=>{let w=img.width,h=img.height;if(w>h&&w>maxSize){h=Math.round(h*maxSize/w);w=maxSize}else if(h>=w&&h>maxSize){w=Math.round(w*maxSize/h);h=maxSize}const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);c.toBlob(b=>b?resolve(b):reject(new Error('บีบอัดรูปไม่ได้')),'image/jpeg',quality)};img.src=reader.result};reader.readAsDataURL(file)})}
async function submitForm(e){e.preventDefault();let slug=cleanSlug($('#slug').value);$('#slug').value=slug;if(!slug)return alert('ใส่ Slug ก่อนครับ');let name=($('#name').value||'').trim();if(!name)return alert('ใส่ชื่อสินค้าก่อนครับ');let editId=$('#editId').value;let old=products.find(p=>p.id===editId);let item={id:editId||uid(),slug,name,shopee:$('#shopee').value.trim(),lazada:$('#lazada').value.trim(),pixel:$('#pixel').value.trim(),ga:$('#ga').value.trim(),updatedAt:new Date().toISOString()};let dup=products.find(p=>p.slug===slug&&p.id!==item.id);if(dup)return alert('Slug นี้มีแล้ว เปลี่ยนชื่อหน่อยครับ');if(currentImageBlob)await idbPut(item.id,currentImageBlob);else if(!old){await idbPut(item.id,placeholderBlob())}let i=products.findIndex(p=>p.id===item.id);if(i>=0)products[i]=item;else products.unshift(item);if(!save())return;selectedIds.add(item.id);await render();resetForm();alert('บันทึกแล้ว และเพิ่มเข้า “รายการ Landing Page” เรียบร้อย ✅')}
function cleanSlug(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙-_]/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')}
function randomSlug(){let chars='abcdefghijklmnopqrstuvwxyz0123456789';let s='';do{s='lp-';for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)]}while(products.some(p=>p.slug===s));return s}
function updateSlugStatus(){let el=$('#slugStatus');if(!el)return;let slug=cleanSlug($('#slug').value);let id=$('#editId').value;if(!slug){el.textContent='พิมพ์ Slug หรือกดสุ่ม';el.className='slug-status muted';return}let dup=products.find(p=>p.slug===slug&&p.id!==id);el.textContent=dup?'❌ Slug นี้ถูกใช้งานแล้ว':'✅ Slug นี้ใช้งานได้';el.className='slug-status '+(dup?'bad':'good')}
function resetForm(){['editId','slug','name','shopee','lazada','pixel','ga'].forEach(id=>$('#'+id).value='');currentImageBlob=null;if(currentImageUrl){URL.revokeObjectURL(currentImageUrl);currentImageUrl=''}$('#imagePreview').style.display='none';updatePreview();updateSlugStatus()}
async function edit(id){let p=products.find(x=>x.id===id);if(!p)return;$('#editId').value=p.id;$('#slug').value=p.slug;$('#name').value=p.name;$('#shopee').value=p.shopee||'';$('#lazada').value=p.lazada||'';$('#pixel').value=p.pixel||'';$('#ga').value=p.ga||'';currentImageBlob=await idbGet(p.id)||placeholderBlob();if(currentImageUrl)URL.revokeObjectURL(currentImageUrl);currentImageUrl=URL.createObjectURL(currentImageBlob);$('#imagePreview').src=currentImageUrl;$('#imagePreview').style.display='block';updatePreview();updateSlugStatus();window.scrollTo({top:0,behavior:'smooth'})}
async function del(id){if(confirm('ลบรายการนี้ใช่ไหม? รายการในเครื่องจะถูกลบ แต่ไฟล์บนเว็บไซต์จะไม่ถูกลบจนกว่าจะใช้เมนูลบจากเว็บไซต์')){products=products.filter(p=>p.id!==id);selectedIds.delete(id);await idbDel(id);save();await render()}}
async function imgUrl(id){let blob=await idbGet(id)||placeholderBlob();return URL.createObjectURL(blob)}
async function render(){let box=$('#productList');if(!box)return;if(!products.length){box.innerHTML='<p class="muted">ยังไม่มี Landing Page เพิ่มอันแรกได้เลย</p>';renderStats();return}let stats=getClickStats();let parts=[];for(const p of products){let url=landingUrl(p.slug);let src=await imgUrl(p.id);let st=stats[p.slug]||{};let sh=st.shopee||0,lz=st.lazada||0,total=sh+lz;parts.push(`<div class="item"><label class="select-line"><input type="checkbox" class="pick" data-id="${p.id}" ${selectedIds.has(p.id)?'checked':''}> เลือก</label><img src="${src}"><div><h3>${esc(p.name)}</h3><p>/${esc(p.slug)}</p><p class="pub-link">${esc(url||'ตั้งค่า GitHub เพื่อแสดงลิงก์เต็ม')}</p><p class="click-mini">คลิก: รวม ${total} • Shopee ${sh} • Lazada ${lz}</p></div><div class="item-actions"><button class="ghost" onclick="edit('${p.id}')">แก้ไข</button><button class="ghost danger" onclick="del('${p.id}')">ลบในโปรเจกต์</button><button class="ghost" onclick="copyLink('${p.slug}')">คัดลอกลิงก์</button><button class="ghost" onclick="openLink('${p.slug}')">เปิดหน้าเว็บ</button></div></div>`)}box.innerHTML=parts.join('');$$('.pick').forEach(c=>c.onchange=e=>{e.target.checked?selectedIds.add(e.target.dataset.id):selectedIds.delete(e.target.dataset.id)});renderStats()}

const localSessionId='sess-'+uid();
function getClickStats(){try{return JSON.parse(localStorage.getItem(workspaceClickStatsKey())||'{}')||{}}catch(e){return {}}}
function resetClickStats(){if(!confirm('ล้างสถิติที่เก็บในเครื่องนี้?\nหมายเหตุ: ข้อมูล Firebase จะไม่ถูกลบ'))return;localStorage.removeItem(workspaceClickStatsKey());render();renderStats();alert('ล้างสถิติในเครื่องแล้ว ✅')}
function pad2(n){return String(n).padStart(2,'0')}
function dateKey(d=new Date()){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
function todayKey(){return dateKey(new Date())}
function addDays(d,days){let x=new Date(d);x.setDate(x.getDate()+days);return x}
function parseDateKey(k){let [y,m,d]=String(k||'').split('-').map(Number);return new Date(y||1970,(m||1)-1,d||1)}
function getRangeKeys(from,to){let a=parseDateKey(from),b=parseDateKey(to),keys=[];if(a>b)[a,b]=[b,a];for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))keys.push(dateKey(d));return keys}
function currentRange(){let now=new Date(),from=todayKey(),to=todayKey(),label='วันนี้';if(statsRange.mode==='yesterday'){from=to=dateKey(addDays(now,-1));label='เมื่อวาน'}else if(statsRange.mode==='7'){from=dateKey(addDays(now,-6));to=todayKey();label='7 วันล่าสุด'}else if(statsRange.mode==='30'){from=dateKey(addDays(now,-29));to=todayKey();label='30 วันล่าสุด'}else if(statsRange.mode==='custom'){from=$('#statsFrom')?.value||statsRange.from||todayKey();to=$('#statsTo')?.value||statsRange.to||from;label='กำหนดเอง '+from+' ถึง '+to}else{from=to=todayKey();label='วันนี้'}return {from,to,label,keys:getRangeKeys(from,to)}}
function setRangeMode(mode){statsRange.mode=mode;let r=currentRange();statsRange.from=r.from;statsRange.to=r.to;if($('#statsFrom'))$('#statsFrom').value=r.from;if($('#statsTo'))$('#statsTo').value=r.to;$$('.stats-filter button').forEach(b=>b.classList.remove('active'));let id={today:'rangeTodayBtn',yesterday:'rangeYesterdayBtn','7':'range7Btn','30':'range30Btn',custom:'rangeCustomBtn'}[mode];if(id&&$('#'+id))$('#'+id).classList.add('active');refreshRealtimeStats(true)}
function bindStatsRangeControls(){if($('#rangeTodayBtn'))$('#rangeTodayBtn').onclick=()=>setRangeMode('today');if($('#rangeYesterdayBtn'))$('#rangeYesterdayBtn').onclick=()=>setRangeMode('yesterday');if($('#range7Btn'))$('#range7Btn').onclick=()=>setRangeMode('7');if($('#range30Btn'))$('#range30Btn').onclick=()=>setRangeMode('30');if($('#rangeCustomBtn'))$('#rangeCustomBtn').onclick=()=>setRangeMode('custom');if($('#exportStatsBtn'))$('#exportStatsBtn').onclick=exportStatsExcel;let r=currentRange();if($('#statsFrom'))$('#statsFrom').value=r.from;if($('#statsTo'))$('#statsTo').value=r.to}
function normalizeFirebaseUrl(u=''){return String(u||'').trim().replace(/\/+$/,'')}
function getRealtimeConfig(){let s=settings();return {dbUrl:normalizeFirebaseUrl($('#firebaseDbUrl')?.value||s.firebaseDbUrl||DEFAULT_FIREBASE_DB_URL),refreshSec:Math.max(2,parseInt($('#firebaseRefreshSec')?.value||s.firebaseRefreshSec||5,10)||5)}}
function firebasePath(path){let cfg=getRealtimeConfig();if(!cfg.dbUrl)throw new Error('กรุณาใส่ Firebase Realtime Database URL ในหน้าตั้งค่า');return cfg.dbUrl+'/'+path.replace(/^\/+|\/+$/g,'')+'.json'}
async function firebaseGet(path){let r=await fetch(firebasePath(path),{cache:'no-store'});if(!r.ok)throw new Error('Firebase อ่านข้อมูลไม่สำเร็จ: '+r.status);return await r.json()}
async function firebasePut(path,data){let r=await fetch(firebasePath(path),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error('Firebase บันทึกข้อมูลไม่สำเร็จ: '+r.status);return await r.json().catch(()=>null)}
function localStatsModel(){let stats=getClickStats();let total=0,shopee=0,lazada=0;let rows=products.map(p=>{let s=stats[p.slug]||{};let sh=s.shopee||0,lz=s.lazada||0,t=sh+lz;total+=t;shopee+=sh;lazada+=lz;return {slug:p.slug,name:p.name,total:t,shopee:sh,lazada:lz,activeUsers:0}});return {source:'local',activeUsers:0,total,shopee,lazada,rows,range:currentRange()}}
function renderStats(model=lastRealtimeStats||localStatsModel()){let list=$('#statsList'),sum=$('#statsSummary');if(!list||!sum)return;let range=model.range||currentRange();let src=model.source==='firebase'?'Firebase Realtime':'ในเครื่องนี้';if($('#statsRangeLabel'))$('#statsRangeLabel').textContent='ช่วงเวลา: '+range.label+' ('+range.from+' ถึง '+range.to+')';sum.innerHTML=`<div class="stat-box"><b>${model.total||0}</b><span>คลิกรวม • ${src} • ${esc(currentWorkspace().workspaceName)}</span></div><div class="stat-box"><b>${model.shopee||0}</b><span>Shopee</span></div><div class="stat-box"><b>${model.lazada||0}</b><span>Lazada</span></div><div class="stat-box"><b>${model.activeUsers||0}</b><span>ผู้ใช้งานออนไลน์</span></div>`;let rows=(model.rows||[]).sort((a,b)=>(b.total||0)-(a.total||0)).map(r=>`<div class="stat-row"><div><b>${esc(r.name||productNameBySlug(r.slug)||r.slug)}</b><span>/${esc(r.slug||'-')}</span></div><div><b>${r.total||0}</b><span>รวม</span></div><div><b>${r.shopee||0}</b><span>Shopee</span></div><div><b>${r.lazada||0}</b><span>Lazada</span></div><div><b>${r.activeUsers||0}</b><span>ออนไลน์</span></div></div>`).join('');list.innerHTML=rows||'<p class="muted">ยังไม่มีรายการให้แสดงสถิติในช่วงเวลานี้</p>'}
function setRealtimeStatus(msg,bad=false){let el=$('#realtimeStatus');if(el){el.textContent='สถานะ: '+msg;el.className='rt-status '+(bad?'bad':'good')}}
function aggregateClicks(clicks,range=currentRange()){let map={};let total=0,shopee=0,lazada=0;if(clicks&&typeof clicks==='object'){for(const key of range.keys){let day=clicks[key];if(!day||typeof day!=='object')continue;for(const [slug,events] of Object.entries(day)){map[slug]=map[slug]||{slug,total:0,shopee:0,lazada:0,activeUsers:0};if(events&&typeof events==='object'){for(const ev of Object.values(events)){if(!ev||typeof ev!=='object')continue;let p=String(ev.platform||'').toLowerCase();map[slug].total++;total++;if(p==='shopee'){map[slug].shopee++;shopee++}else if(p==='lazada'){map[slug].lazada++;lazada++}}}}}}let rows=products.map(p=>({slug:p.slug,name:p.name,total:0,shopee:0,lazada:0,activeUsers:0,...(map[p.slug]||{})}));for(const slug of Object.keys(map)){if(!products.some(p=>p.slug===slug))rows.push({name:slug,...map[slug]})}return {source:'firebase',total,shopee,lazada,rows,range}}
function countOnline(sessions){let now=Date.now(),n=0;if(sessions&&typeof sessions==='object'){for(const s of Object.values(sessions)){let t=Date.parse(s&&s.lastSeen||0);if(t&&now-t<120000)n++}}return n}
async function sendHeartbeat(){try{await firebasePut(firebaseWsPath('sessions/'+localSessionId),{lastSeen:new Date().toISOString(),page:'manager',userId:currentWorkspace().userId,userName:currentWorkspace().userName,workspaceId:currentWorkspace().workspaceId})}catch(e){}}
async function fetchFirebaseRealtime(){await sendHeartbeat();let [clicks,sessions]=await Promise.all([firebaseGet(firebaseWsPath('clicks')),firebaseGet(firebaseWsPath('sessions'))]);let model=aggregateClicks(clicks,currentRange());model.activeUsers=countOnline(sessions);return model}
async function refreshRealtimeStats(manual=false){try{let cfg=getRealtimeConfig();if(!cfg.dbUrl){lastRealtimeStats=null;renderStats(localStatsModel());setRealtimeStatus('ยังไม่ได้ตั้งค่า Firebase — แสดงยอดในเครื่องนี้แทน',true);return}setRealtimeStatus('กำลังดึงข้อมูลจาก Firebase...');lastRealtimeStats=await fetchFirebaseRealtime();renderStats(lastRealtimeStats);setRealtimeStatus('เชื่อมต่อ Firebase แล้ว • อัปเดตล่าสุด '+new Date().toLocaleTimeString('th-TH'))}catch(e){renderStats(localStatsModel());setRealtimeStatus(e.message+' — แสดงยอดในเครื่องนี้แทน',true);if(manual)alert('ดึง Realtime ไม่สำเร็จ: '+e.message)}}
function startRealtime(){let cfg=getRealtimeConfig();stopRealtime(false);realtimeRunning=true;if($('#toggleRealtimeBtn'))$('#toggleRealtimeBtn').textContent='หยุดเรียลไทม์';refreshRealtimeStats(false);realtimeTimer=setInterval(()=>refreshRealtimeStats(false),cfg.refreshSec*1000)}
function stopRealtime(renderMsg=true){if(realtimeTimer)clearInterval(realtimeTimer);realtimeTimer=null;realtimeRunning=false;if($('#toggleRealtimeBtn'))$('#toggleRealtimeBtn').textContent='เริ่มเรียลไทม์';if(renderMsg)setRealtimeStatus('หยุดเรียลไทม์แล้ว')}
function toggleRealtime(){realtimeRunning?stopRealtime():startRealtime()}

function excelEsc(v=''){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function exportStatsExcel(){let model=lastRealtimeStats||localStatsModel();let range=model.range||currentRange();let rows=(model.rows||[]).sort((a,b)=>(b.total||0)-(a.total||0));let html=`<html><head><meta charset="utf-8"></head><body><h2>Affiliate Landing Manager v5.3 - สถิติคลิก</h2><p>Workspace: ${excelEsc(currentWorkspace().workspaceName)} (${excelEsc(currentWorkspace().workspaceId)})</p><p>ผู้ส่งออก: ${excelEsc(currentWorkspace().userName)} (${excelEsc(currentWorkspace().userId)})</p><p>ช่วงเวลา: ${excelEsc(range.label)} (${excelEsc(range.from)} ถึง ${excelEsc(range.to)})</p><table border="1"><tr><th>Landing Page</th><th>Slug</th><th>รวม</th><th>Shopee</th><th>Lazada</th><th>ออนไลน์</th></tr>${rows.map(r=>`<tr><td>${excelEsc(r.name||productNameBySlug(r.slug)||r.slug)}</td><td>/${excelEsc(r.slug||'')}</td><td>${r.total||0}</td><td>${r.shopee||0}</td><td>${r.lazada||0}</td><td>${r.activeUsers||0}</td></tr>`).join('')}</table></body></html>`;let name='affiliate-click-stats-'+range.from+'-to-'+range.to+'.xls';downloadBlob(new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),name)}
function productNameBySlug(slug){let p=products.find(x=>x.slug===slug);return p?p.name:''}
function siteBase(){let s=getGh(); if(s.customDomain)return 'https://'+s.customDomain.replace(/^https?:\/\//,'').replace(/\/$/,'');if(s.owner&&s.repo){let repo=s.repo.toLowerCase();let userSite=repo===`${s.owner.toLowerCase()}.github.io`;return userSite?`https://${s.owner}.github.io`:`https://${s.owner}.github.io/${s.repo}`}return location.origin.includes('http')?location.origin:''}
function landingUrl(slug){let base=siteBase();return base?base+`/${slug}/`:`/${slug}/`}
function copyLink(slug){let url=landingUrl(slug);navigator.clipboard?.writeText(url);alert('คัดลอกแล้ว: '+url)}function openLink(slug){window.open(landingUrl(slug),'_blank')}
function updatePreview(){let img=currentImageUrl||'';$('#pvImage').src=img||placeholderDataUrl();$('#pvName').textContent=$('#name').value||'ชื่อสินค้า';$('#pvShopee').href=$('#shopee').value||'#';$('#pvLazada').href=$('#lazada').value||'#'}

function cleanGaId(v){return String(v||'').trim().toUpperCase()}
function getDefaultGaId(){let el=$('#globalGa');let fromInput=el?cleanGaId(el.value):'';let fromSettings=cleanGaId(settings().gaId);return fromInput||fromSettings||DEFAULT_GA_ID}
function gaSnippet(id){id=cleanGaId(id)||DEFAULT_GA_ID;if(!/^G-[A-Z0-9]+$/i.test(id))id=DEFAULT_GA_ID;return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(id)}"><\/script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${esc(id)}');
<\/script>`}

function placeholderDataUrl(){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" text-anchor="middle" font-size="42" font-family="Arial" fill="#6b7280">ไม่มีรูปภาพ</text></svg>')}
function placeholderBlob(){return dataUrlToBlob(placeholderDataUrl())}
async function landingImageSrc(p){let b=await idbGet(p.id);return b?'../images/'+p.slug+'.jpg':placeholderDataUrl()}
async function landingHtml(p){let img=await landingImageSrc(p);let gaId=cleanGaId(p.ga)||getDefaultGaId();let ga=gaSnippet(gaId);let fbDb=JSON.stringify(getRealtimeConfig().dbUrl||DEFAULT_FIREBASE_DB_URL);let ws=JSON.stringify(currentWorkspace().workspaceId);let wsName=JSON.stringify(currentWorkspace().workspaceName);return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)}</title>${ga}${p.pixel?`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(p.pixel)}');fbq('track','PageView');<\/script>`:''}<style>${landingCss()}</style></head><body><main class="wrap"><section class="card"><img src="${img}" alt="${esc(p.name)}"><h1>${esc(p.name)}</h1>${p.shopee?`<a class="btn shopee" href="${esc(p.shopee)}" target="_blank" onclick="trackAffiliate('shopee','${esc(p.slug)}',this.href)">ซื้อที่ Shopee</a>`:''}${p.lazada?`<a class="btn lazada" href="${esc(p.lazada)}" target="_blank" onclick="trackAffiliate('lazada','${esc(p.slug)}',this.href)">ซื้อที่ Lazada</a>`:''}<p class="note">เลือกช่องทางที่สะดวกได้เลย</p></section></main><script>var FIREBASE_DB=${fbDb};var WORKSPACE_ID=${ws};var WORKSPACE_NAME=${wsName};function dayKey(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}function sid(){var k='alm_session_id';var v=localStorage.getItem(k);if(!v){v='sess-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(k,v)}return v}function fbPut(path,obj){if(!FIREBASE_DB)return Promise.resolve();return fetch(FIREBASE_DB.replace(/\\/+$/,'')+'/'+path+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)}).catch(function(){})}function wsPath(p){return 'workspaces/'+(WORKSPACE_ID||'main')+'/'+p}function heartbeat(){fbPut(wsPath('sessions/'+sid()),{lastSeen:new Date().toISOString(),page:location.pathname,workspaceId:WORKSPACE_ID,workspaceName:WORKSPACE_NAME})}heartbeat();setInterval(heartbeat,30000);function trackAffiliate(platform,slug,url){try{var key='alm_click_stats_v1_'+(WORKSPACE_ID||'main');var data=JSON.parse(localStorage.getItem(key)||'{}');data[slug]=data[slug]||{};data[slug][platform]=(data[slug][platform]||0)+1;data[slug].total=(data[slug].total||0)+1;data[slug].lastClickAt=new Date().toISOString();localStorage.setItem(key,JSON.stringify(data));var id=Date.now()+'-'+Math.random().toString(36).slice(2);fbPut(wsPath('clicks/'+dayKey()+'/'+slug+'/'+id),{platform:platform,slug:slug,url:url,createdAt:new Date().toISOString(),path:location.pathname,ua:navigator.userAgent,sessionId:sid(),workspaceId:WORKSPACE_ID,workspaceName:WORKSPACE_NAME});if(window.fbq)fbq('trackCustom','Click'+platform);if(window.gtag){gtag('event','affiliate_click',{platform:platform,landing_slug:slug,link_url:url});gtag('event',platform+'_click',{landing_slug:slug,link_url:url});}}catch(e){}}<\/script></body></html>`}

function landingCss(){return `*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:linear-gradient(160deg,#0f172a,#312e81);color:#fff;min-height:100vh;display:grid;place-items:center;padding:20px}.wrap{width:min(480px,100%)}.card{background:rgba(255,255,255,.12);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.18);border-radius:32px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.35);text-align:center}.card img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:24px;background:#ddd}h1{font-size:clamp(26px,6vw,42px);line-height:1.1}.btn{display:block;text-decoration:none;color:#fff;font-weight:900;padding:18px;border-radius:20px;margin:14px 0;font-size:18px}.shopee{background:#ee4d2d}.lazada{background:#253cff}.note{color:rgba(255,255,255,.75)}`}
async function buildZip(list=products){let zip=new JSZip();zip.file('index.html','<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Affiliate Landing</title>'+gaSnippet(getDefaultGaId())+'<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:20px}</style></head><body><h1>Affiliate Landing</h1><p>เลือก path เช่น <code>/a/</code>, <code>/b/</code>, <code>/c/</code></p></body></html>');let backup=[];for(const p of list){zip.file(`${p.slug}/index.html`,await landingHtml(p));let b=await idbGet(p.id);let row={...p};if(b){zip.file(`images/${p.slug}.jpg`,b);row.image=await blobToDataUrl(b)}backup.push(row)}zip.file('alm-backup.json',JSON.stringify({version:'v5.3-workspace',workspace:currentWorkspace(),exportedAt:new Date().toISOString(),products:backup},null,2));let d=$('#customDomain').value.trim();if(d)zip.file('CNAME',d);return zip}
async function exportZip(){if(!products.length)return alert('ยังไม่มีสินค้า');let zip=await buildZip(products);let blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,'affiliate-landing-site.zip')}
function downloadBlob(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
async function backupProducts(){let rows=[];for(const p of products){let row={...p};let b=await idbGet(p.id);if(b)row.image=await blobToDataUrl(b);rows.push(row)}let blob=new Blob([JSON.stringify({version:'v5.3-workspace',workspace:currentWorkspace(),exportedAt:new Date().toISOString(),products:rows},null,2)],{type:'application/json'});downloadBlob(blob,'landing-backup-'+new Date().toISOString().slice(0,10)+'.json')}
async function restoreFile(file){if(!file)return;try{let imported=[];if(/\.zip$/i.test(file.name)){let zip=await JSZip.loadAsync(file);let f=zip.file('alm-backup.json')||zip.file('backup.json')||zip.file('landing-backup.json');if(!f)throw new Error('ZIP นี้ไม่มีไฟล์ Backup JSON สำหรับคืนค่ารายการ Landing Page');let json=JSON.parse(await f.async('string'));imported=Array.isArray(json)?json:(json.products||[])}else{let json=JSON.parse(await file.text());imported=Array.isArray(json)?json:(json.products||[])}if(!imported.length)throw new Error('ไม่พบรายการ Landing Page ในไฟล์นี้');let merge=confirm('กด OK = รวมรายการเข้ากับของเดิม\nกด Cancel = แทนที่ทั้งหมด');if(!merge){for(const p of products)await idbDel(p.id);products=[]}for(const raw of imported){let p={...raw,id:merge?uid():(raw.id||uid()),slug:cleanSlug(raw.slug)||randomSlug(),name:raw.name||'ไม่มีชื่อ',shopee:raw.shopee||'',lazada:raw.lazada||'',pixel:raw.pixel||'',ga:raw.ga||'',updatedAt:raw.updatedAt||new Date().toISOString()};while(products.some(x=>x.slug===p.slug))p.slug=p.slug+'-'+Math.floor(Math.random()*99);let img=raw.image||raw.imageData;if(img&&String(img).startsWith('data:'))await idbPut(p.id,dataUrlToBlob(img));else await idbPut(p.id,placeholderBlob());delete p.image;delete p.imageData;products.unshift(p)}save();selectedIds.clear();await render();alert('นำเข้าสำเร็จ '+imported.length+' รายการ')}catch(e){alert('นำเข้าไม่สำเร็จ: '+e.message)}finally{if($('#restoreInput'))$('#restoreInput').value=''}}
function getSelectedProducts(){return products.filter(p=>selectedIds.has(p.id))}function getGh(){return{owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',token:$('#ghToken').value.trim(),customDomain:$('#customDomain').value.trim(),gaId:$('#globalGa')?cleanGaId($('#globalGa').value):getDefaultGaId(),firebaseDbUrl:$('#firebaseDbUrl')?$('#firebaseDbUrl').value.trim():DEFAULT_FIREBASE_DB_URL,firebaseRefreshSec:$('#firebaseRefreshSec')?$('#firebaseRefreshSec').value.trim():5,userName:$('#userName')?$('#userName').value.trim():currentWorkspace().userName,userId:$('#userId')?$('#userId').value.trim():currentWorkspace().userId,workspaceId:$('#workspaceId')?$('#workspaceId').value.trim():currentWorkspace().workspaceId,workspaceName:$('#workspaceName')?$('#workspaceName').value.trim():currentWorkspace().workspaceName}}
function loadSettings(){let s=settings();$('#ghOwner').value=s.owner||'siamserverm';$('#ghRepo').value=s.repo||'siamserverm.github.io';$('#ghBranch').value=s.branch||'main';$('#customDomain').value=s.customDomain||'';$('#ghToken').value=s.token||'';if($('#globalGa'))$('#globalGa').value=cleanGaId(s.gaId)||DEFAULT_GA_ID;if($('#firebaseDbUrl'))$('#firebaseDbUrl').value=s.firebaseDbUrl||DEFAULT_FIREBASE_DB_URL;if($('#firebaseRefreshSec'))$('#firebaseRefreshSec').value=s.firebaseRefreshSec||5;let w=currentWorkspace();if($('#userName'))$('#userName').value=w.userName;if($('#userId'))$('#userId').value=w.userId;if($('#workspaceId'))$('#workspaceId').value=w.workspaceId;if($('#workspaceName'))$('#workspaceName').value=w.workspaceName;updateWorkspaceBadge();if($('#rememberGh'))$('#rememberGh').checked=s.remember!==false}

function bindWorkspaceControls(){
  if($('#saveWorkspaceBtn'))$('#saveWorkspaceBtn').onclick=async()=>{await switchWorkspaceFromForm()};
  if($('#newWorkspaceBtn'))$('#newWorkspaceBtn').onclick=()=>{let id='ws-'+Math.random().toString(36).slice(2,8);$('#workspaceId').value=id;$('#workspaceName').value='งาน '+id;alert('สร้าง Workspace ใหม่แล้ว กด “บันทึก / สลับ Workspace” เพื่อใช้งาน')};
}
async function switchWorkspaceFromForm(){
  let old=currentWorkspace().workspaceId;
  let w=saveWorkspaceSettings({userName:$('#userName')?.value,userId:$('#userId')?.value,workspaceId:$('#workspaceId')?.value,workspaceName:$('#workspaceName')?.value});
  saveSettings(getGh());
  products=loadProducts();selectedIds.clear();lastRealtimeStats=null;updateWorkspaceBadge();await render();renderStats();
  if(old!==w.workspaceId)alert('สลับ Workspace เป็น '+w.workspaceName+' ('+w.workspaceId+') แล้ว ✅\nรายการและสถิติจะแยกจากงานอื่น');
  else alert('บันทึก Workspace แล้ว ✅');
}

function log(t){$('#publishLog').textContent+=`\n${t}`}
async function putFile(s,path,content,base64=false){let url=`https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}`;let headers={Authorization:`Bearer ${s.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};let sha;let g=await fetch(url+`?ref=${s.branch}`,{headers});if(g.ok)sha=(await g.json()).sha;let body={message:`publish ${path}`,content:base64?content:btoa(unescape(encodeURIComponent(content))),branch:s.branch,...(sha?{sha}:{})};let r=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(path+': '+await r.text())}
async function blobToBase64(blob){let data=await blobToDataUrl(blob);return data.split(',')[1]}
async function publishItems(list,label='รายการ'){let s=getGh();$('#publishLog').textContent='';if(!s.owner||!s.repo||!s.token)return log('กรอก owner/repo/token ก่อนครับ');if(!list.length)return log('ยังไม่ได้เลือกรายการ');try{saveSettings(s);log('เริ่มเผยแพร่ '+label+'...');await putFile(s,'index.html','<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Affiliate Landing</title>'+gaSnippet(getDefaultGaId())+'<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:20px}</style></head><body><h1>Affiliate Landing</h1><p>เลือก path เช่น <code>/a/</code>, <code>/b/</code>, <code>/c/</code></p></body></html>');for(const p of list){log('อัปโหลด '+p.slug);await putFile(s,`${p.slug}/index.html`,await landingHtml(p));let b=await idbGet(p.id);if(b)await putFile(s,`images/${p.slug}.jpg`,await blobToBase64(b),true);log('ลิงก์เผยแพร่: '+landingUrl(p.slug))}if(s.customDomain)await putFile(s,'CNAME',s.customDomain);try{await enablePages(s);log('เปิด GitHub Pages สำเร็จ ✅')}catch(pageErr){log(pageErr.message)}log('เผยแพร่สำเร็จ ✅');log('ลิงก์หลัก: '+siteBase()+'/');log('หมายเหตุ: GitHub Pages อาจใช้เวลา 1–3 นาที ก่อนลิงก์จะเข้าได้')}catch(e){log('มีปัญหา: '+e.message)}}
async function publishGitHub(){await publishItems(products,'ทั้งหมด')}async function publishSelected(){await publishItems(getSelectedProducts(),'ที่เลือก')}
async function deleteFile(s,path){let url=`https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}`;let headers={Authorization:`Bearer ${s.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};let g=await fetch(url+`?ref=${s.branch}`,{headers});if(g.status===404){log('ไม่พบไฟล์บนเว็บ: '+path);return}if(!g.ok)throw new Error(path+': '+await g.text());let sha=(await g.json()).sha;let r=await fetch(url,{method:'DELETE',headers,body:JSON.stringify({message:`delete ${path}`,sha,branch:s.branch})});if(!r.ok)throw new Error(path+': '+await r.text())}
async function deleteSelectedFromWeb(){let list=getSelectedProducts();$('#publishLog').textContent='';if(!list.length)return log('ยังไม่ได้เลือกรายการที่จะลบจากเว็บไซต์');let word=prompt('ต้องการลบไฟล์บนเว็บไซต์จริง ๆ ให้พิมพ์คำว่า: ลบ');if(word!=='ลบ')return log('ยกเลิกการลบ: ต้องพิมพ์คำว่า ลบ เท่านั้น');let s=getGh();if(!s.owner||!s.repo||!s.token)return log('กรอก owner/repo/token ก่อนครับ');try{saveSettings(s);for(const p of list){log('กำลังลบจากเว็บไซต์: '+p.slug);await deleteFile(s,`${p.slug}/index.html`);await deleteFile(s,`images/${p.slug}.jpg`)}log('ลบจากเว็บไซต์สำเร็จ ✅ รายการในโปรเจกต์ยังคงอยู่')}catch(e){log('ลบไม่สำเร็จ: '+e.message)}}
async function testConnection(){let s=getGh();$('#publishLog').textContent='';if(!s.owner||!s.repo||!s.token)return log('กรอก owner/repo/token ก่อนครับ');try{saveSettings(s);log('กำลังเชื่อมต่อ GitHub...');let r=await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}`,{headers:{Authorization:`Bearer ${s.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});if(!r.ok)throw new Error(await r.text());let j=await r.json();log('เชื่อมต่อสำเร็จ ✅');log('Repository: '+j.full_name);log('Default branch: '+j.default_branch)}catch(e){log('เชื่อมต่อไม่สำเร็จ: '+e.message)}}
async function enablePages(s){let headers={Authorization:`Bearer ${s.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};let url=`https://api.github.com/repos/${s.owner}/${s.repo}/pages`;let body=JSON.stringify({source:{branch:s.branch,path:'/'}});let r=await fetch(url,{method:'POST',headers,body});if(r.status===409)r=await fetch(url,{method:'PUT',headers,body});if(!r.ok){let txt=await r.text();throw new Error('เปิด GitHub Pages ผ่าน API ไม่สำเร็จ กรุณาเปิดเองที่ Settings > Pages > Deploy from a branch > main > /(root). รายละเอียด: '+txt)}return await r.json().catch(()=>({}))}
window.edit=edit;window.del=del;window.copyLink=copyLink;window.openLink=openLink;


/* =========================================================
   v5.4 Desktop Workspace Manager patch
   เพิ่มโปรไฟล์งานให้เลือก/สลับได้ ไม่ให้ข้อมูลปนกัน
   ========================================================= */
const workspaceProfilesKey='alm_workspace_profiles_v54';
const activeWorkspaceKey='alm_active_workspace_v54';
function safeJson(raw,fallback){try{return JSON.parse(raw||'')}catch(e){return fallback}}
function makeWorkspace(input={}){
  const id=cleanWorkspaceId(input.workspaceId||input.id||DEFAULT_WORKSPACE_ID);
  return {
    workspaceId:id,
    workspaceName:String(input.workspaceName||input.name||(id===DEFAULT_WORKSPACE_ID?'งานหลัก':'งาน '+id)).trim(),
    userName:String(input.userName||'ผู้ใช้หลัก').trim(),
    userId:cleanSlug(input.userId||('user-'+uid().slice(0,8)))
  };
}
function getWorkspaceProfiles(){
  let list=safeJson(localStorage.getItem(workspaceProfilesKey),null);
  if(!Array.isArray(list)||!list.length){
    const old=safeJson(localStorage.getItem(workspaceKey),'{}')||{};
    const main=makeWorkspace(old&&typeof old==='object'?old:{});
    list=[main];
    localStorage.setItem(workspaceProfilesKey,JSON.stringify(list));
    localStorage.setItem(activeWorkspaceKey,main.workspaceId);
  }
  const seen=new Set();
  list=list.map(makeWorkspace).filter(w=>{if(seen.has(w.workspaceId))return false;seen.add(w.workspaceId);return true});
  if(!list.length)list=[makeWorkspace({})];
  localStorage.setItem(workspaceProfilesKey,JSON.stringify(list));
  if(!localStorage.getItem(activeWorkspaceKey)||!list.some(w=>w.workspaceId===localStorage.getItem(activeWorkspaceKey))){
    localStorage.setItem(activeWorkspaceKey,list[0].workspaceId);
  }
  return list;
}
function saveWorkspaceProfiles(list){
  const seen=new Set();
  const cleaned=(list||[]).map(makeWorkspace).filter(w=>{if(seen.has(w.workspaceId))return false;seen.add(w.workspaceId);return true});
  localStorage.setItem(workspaceProfilesKey,JSON.stringify(cleaned.length?cleaned:[makeWorkspace({})]));
  return getWorkspaceProfiles();
}
function workspaceSettings(){
  const list=getWorkspaceProfiles();
  const active=localStorage.getItem(activeWorkspaceKey)||DEFAULT_WORKSPACE_ID;
  return list.find(w=>w.workspaceId===active)||list[0]||makeWorkspace({});
}
function saveWorkspaceSettings(w){
  const data=makeWorkspace(w||{});
  let list=getWorkspaceProfiles();
  const i=list.findIndex(x=>x.workspaceId===data.workspaceId);
  if(i>=0)list[i]={...list[i],...data}; else list.push(data);
  saveWorkspaceProfiles(list);
  localStorage.setItem(activeWorkspaceKey,data.workspaceId);
  localStorage.setItem(workspaceKey,JSON.stringify(data));
  renderWorkspaceSelector();
  return data;
}
function currentWorkspace(){return workspaceSettings()}
function updateWorkspaceBadge(){
  const w=currentWorkspace();
  const b=$('#currentWorkspaceBadge');
  if(b)b.textContent='Workspace: '+w.workspaceName+' ('+w.workspaceId+')';
  const sel=$('#workspaceSelect');
  if(sel&&sel.value!==w.workspaceId)sel.value=w.workspaceId;
}
function renderWorkspaceSelector(){
  const list=getWorkspaceProfiles();
  const cur=currentWorkspace();
  const sel=$('#workspaceSelect');
  if(sel){
    sel.innerHTML=list.map(w=>`<option value="${esc(w.workspaceId)}">${esc(w.workspaceName)} — ${esc(w.workspaceId)}</option>`).join('');
    sel.value=cur.workspaceId;
  }
  const box=$('#workspaceListBox');
  if(box){
    box.innerHTML=list.map(w=>`<div class="workspace-card-row ${w.workspaceId===cur.workspaceId?'active':''}"><div><b>${esc(w.workspaceName)}</b><span>ID: ${esc(w.workspaceId)} • ผู้ใช้: ${esc(w.userName)}</span></div><div class="actions"><button class="ghost" type="button" onclick="switchWorkspaceById('${esc(w.workspaceId)}')">เลือก</button></div></div>`).join('')||'<p class="muted">ยังไม่มีโปรไฟล์งาน</p>';
  }
  updateWorkspaceBadge();
}
async function switchWorkspaceById(id){
  const list=getWorkspaceProfiles();
  const w=list.find(x=>x.workspaceId===id);
  if(!w)return alert('ไม่พบ Workspace นี้');
  localStorage.setItem(activeWorkspaceKey,w.workspaceId);
  localStorage.setItem(workspaceKey,JSON.stringify(w));
  if($('#userName'))$('#userName').value=w.userName;
  if($('#userId'))$('#userId').value=w.userId;
  if($('#workspaceId'))$('#workspaceId').value=w.workspaceId;
  if($('#workspaceName'))$('#workspaceName').value=w.workspaceName;
  products=loadProducts();selectedIds.clear();lastRealtimeStats=null;resetForm();
  updateWorkspaceBadge();renderWorkspaceSelector();await render();renderStats();
}
function createWorkspacePrompt(){
  const name=prompt('ตั้งชื่อโปรไฟล์งาน / Workspace ใหม่ เช่น งาน Shopee เดือนนี้');
  if(!name)return;
  let suggested=cleanWorkspaceId(name)||('ws-'+Math.random().toString(36).slice(2,8));
  let id=prompt('ตั้ง Workspace ID ภาษาอังกฤษ/ตัวเลข เช่น shopee-jan',suggested);
  if(!id)return;
  id=cleanWorkspaceId(id);
  if(getWorkspaceProfiles().some(w=>w.workspaceId===id))return alert('Workspace ID นี้มีแล้ว เลือกจากรายการได้เลย');
  const cur=currentWorkspace();
  const w=saveWorkspaceSettings({workspaceId:id,workspaceName:name,userName:cur.userName,userId:cur.userId});
  if($('#workspaceId'))$('#workspaceId').value=w.workspaceId;
  if($('#workspaceName'))$('#workspaceName').value=w.workspaceName;
  switchWorkspaceById(w.workspaceId);
}
function renameWorkspacePrompt(){
  const cur=currentWorkspace();
  const name=prompt('เปลี่ยนชื่อ Workspace',cur.workspaceName);
  if(!name)return;
  saveWorkspaceSettings({...cur,workspaceName:name});
  if($('#workspaceName'))$('#workspaceName').value=name;
  renderWorkspaceSelector();updateWorkspaceBadge();
}
function deleteWorkspacePrompt(){
  const cur=currentWorkspace();
  if(cur.workspaceId===DEFAULT_WORKSPACE_ID&&getWorkspaceProfiles().length===1)return alert('ลบ Workspace สุดท้ายไม่ได้ครับ');
  const word=prompt('ต้องการลบ Workspace นี้ออกจากรายการเท่านั้น ข้อมูล local/Firebase จะไม่ถูกลบทันที\nพิมพ์คำว่า ลบ เพื่อยืนยัน: '+cur.workspaceName);
  if(word!=='ลบ')return;
  let list=getWorkspaceProfiles().filter(w=>w.workspaceId!==cur.workspaceId);
  if(!list.length)list=[makeWorkspace({})];
  saveWorkspaceProfiles(list);
  localStorage.setItem(activeWorkspaceKey,list[0].workspaceId);
  switchWorkspaceById(list[0].workspaceId);
}
function duplicateWorkspacePrompt(){
  const cur=currentWorkspace();
  const name=prompt('ตั้งชื่อ Workspace ที่คัดลอก',cur.workspaceName+' copy');
  if(!name)return;
  let id=cleanWorkspaceId(name)||('ws-'+Math.random().toString(36).slice(2,8));
  while(getWorkspaceProfiles().some(w=>w.workspaceId===id))id=id+'-'+Math.floor(Math.random()*99);
  const newWs=saveWorkspaceSettings({...cur,workspaceId:id,workspaceName:name});
  const oldProducts=products.map(p=>({...p,id:uid(),updatedAt:new Date().toISOString()}));
  localStorage.setItem('alm_products_ws_'+newWs.workspaceId,JSON.stringify(stripImages(oldProducts)));
  switchWorkspaceById(newWs.workspaceId).then(()=>alert('คัดลอก Workspace แล้ว ✅\nหมายเหตุ: รูปภาพเดิมอาจต้องเลือกใหม่บางรายการถ้าเบราว์เซอร์หา image id เดิมไม่เจอ'));
}
function bindWorkspaceControls(){
  renderWorkspaceSelector();
  if($('#workspaceSelect'))$('#workspaceSelect').onchange=e=>switchWorkspaceById(e.target.value);
  if($('#quickNewWorkspaceBtn'))$('#quickNewWorkspaceBtn').onclick=createWorkspacePrompt;
  if($('#quickRenameWorkspaceBtn'))$('#quickRenameWorkspaceBtn').onclick=renameWorkspacePrompt;
  if($('#quickDeleteWorkspaceBtn'))$('#quickDeleteWorkspaceBtn').onclick=deleteWorkspacePrompt;
  if($('#saveWorkspaceBtn'))$('#saveWorkspaceBtn').onclick=async()=>{await switchWorkspaceFromForm()};
  if($('#newWorkspaceBtn'))$('#newWorkspaceBtn').onclick=createWorkspacePrompt;
  if($('#duplicateWorkspaceBtn'))$('#duplicateWorkspaceBtn').onclick=duplicateWorkspacePrompt;
}
async function switchWorkspaceFromForm(){
  const old=currentWorkspace().workspaceId;
  const w=saveWorkspaceSettings({userName:$('#userName')?.value,userId:$('#userId')?.value,workspaceId:$('#workspaceId')?.value,workspaceName:$('#workspaceName')?.value});
  saveSettings(getGh());
  products=loadProducts();selectedIds.clear();lastRealtimeStats=null;resetForm();
  updateWorkspaceBadge();renderWorkspaceSelector();await render();renderStats();
  if(old!==w.workspaceId)alert('สลับ Workspace เป็น '+w.workspaceName+' ('+w.workspaceId+') แล้ว ✅\nรายการและสถิติจะแยกจากงานอื่น');
  else alert('บันทึก Workspace แล้ว ✅');
}
window.switchWorkspaceById=switchWorkspaceById;


// เริ่มโปรแกรมหลังจากประกาศทุกตัวแปรและทุกฟังก์ชันครบแล้ว
init().catch(e=>{console.error(e);alert('เปิดโปรแกรมไม่สำเร็จ: '+(e&&e.message?e.message:e));});
