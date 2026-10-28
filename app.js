import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const state = {
  type: 'house', landWidth: 20, landLength: 30, houseWidth: 10, houseLength: 12, floors: 1,
  rooms: [], objects: [], selected: null, activeObject: null, view: '2d', zoom: 1, style: 'modern',
  showRoof: false, showLand: true, projectName: 'Mon projet de maison', nextId: 1
};
const roomDefaults = {
  'Salon': [4,4,'#dce8d6'], 'Cuisine': [3,3,'#e9dfc9'], 'Chambre': [3.5,3.5,'#d9e7ee'],
  'Salle de bain': [2,2.5,'#dce8eb'], 'Bureau': [2.5,3,'#e9e0ed'], 'Garage': [3,6,'#e6e7e8']
};
const objectDefaults = {
  sofa:{w:2.2,l:.9,h:.75,color:'#8b9b87',label:'Canapé'}, bed:{w:1.8,l:2,h:.45,color:'#d5c4a8',label:'Lit'},
  table:{w:1.5,l:.9,h:.75,color:'#b99a75',label:'Table'}, chair:{w:.5,l:.5,h:.85,color:'#8a9caa',label:'Chaise'},
  plant:{w:.6,l:.6,h:1.1,color:'#71956b',label:'Plante'}, kitchen:{w:2.4,l:.65,h:.9,color:'#a9b4b6',label:'Meuble cuisine'},
  pool:{w:4,l:7,h:.25,color:'#73bdcf',label:'Piscine'}, tree:{w:1.5,l:1.5,h:3,color:'#71966c',label:'Arbre'}
};
let drag = null, toastTimer = null, three = null;
const undoStack = [], redoStack = [];
const HISTORY_LIMIT = 40;
function snapshotData(){ return JSON.stringify({type:state.type,landWidth:state.landWidth,landLength:state.landLength,houseWidth:state.houseWidth,houseLength:state.houseLength,floors:state.floors,rooms:state.rooms,objects:state.objects,style:state.style,showRoof:state.showRoof,showLand:state.showLand,nextId:state.nextId,projectName:$('projectName')?.value||state.projectName}); }
function pushHistory(){ const snap=snapshotData(); if(undoStack[undoStack.length-1]!==snap)undoStack.push(snap); if(undoStack.length>HISTORY_LIMIT)undoStack.shift(); redoStack.length=0; updateHistoryButtons(); }
function updateHistoryButtons(){ const u=$('undoBtn'),r=$('redoBtn'); if(u)u.disabled=undoStack.length<2; if(r)r.disabled=redoStack.length===0; }
function restoreSnapshot(snap){ const d=JSON.parse(snap); Object.assign(state,d); state.selected=null;state.activeObject=null; $('projectName').value=d.projectName||'Mon projet de maison'; for(const id of ['landWidth','landLength','houseWidth','houseLength','floors'])$(id).value=state[id]; $('styleSelect').value=state.style; $('showRoof').checked=state.showRoof; $('showLand').checked=state.showLand; document.querySelectorAll('.type-card').forEach(b=>b.classList.toggle('selected',b.dataset.type===state.type)); renderPlan();updateStats();renderInspector();updateThree(); }
function undo(){if(undoStack.length<2)return;redoStack.push(undoStack.pop());restoreSnapshot(undoStack[undoStack.length-1]);updateHistoryButtons();notify('Modification annulée.')}
function redo(){if(!redoStack.length)return;const snap=redoStack.pop();undoStack.push(snap);restoreSnapshot(snap);updateHistoryButtons();notify('Modification rétablie.')}

function notify(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function newId(){return state.nextId++}
function totalArea(){return state.type==='land'?0:state.houseWidth*state.houseLength*state.floors}
function setStep(step){
  document.querySelectorAll('.step').forEach(b=>b.classList.toggle('active',b.dataset.step===step));
  ['terrain','structure','amenagement','rendu'].forEach(s=>$(`${s}Panel`).classList.toggle('hidden',s!==step));
}
function setView(view){
  state.view=view;
  $('canvas2d').classList.toggle('hidden',view!=='2d'); $('canvas3d').classList.toggle('hidden',view!=='3d');
  document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('modeLabel').textContent=view==='2d'?"PLAN D'AMÉNAGEMENT":'VOLUME 3D';
  if(view==='3d'){initThree(); updateThree(); $('loading3d').classList.add('hidden')}
  else renderPlan();
}
function updateStats(){
  $('areaStat').textContent=`${Math.round(totalArea())} m² habitables`;
  $('roomStat').textContent=`${state.rooms.length} pièce${state.rooms.length===1?'':'s'} ajoutée${state.rooms.length===1?'':'s'}`;
  $('landStat').textContent=`Terrain ${state.landWidth*state.landLength} m²`;
  $('selectionStatus').textContent=state.selected?getSelectedLabel():'Aucun élément sélectionné';
  $('deleteSelected').disabled=!state.selected;
}
function getSelected(){
  if(!state.selected)return null;
  const [kind,id]=state.selected.split(':');
  return kind==='room'?state.rooms.find(x=>x.id===+id):state.objects.find(x=>x.id===+id);
}
function getSelectedLabel(){const o=getSelected();return o?(o.name||objectDefaults[o.type]?.label||o.type):'Élément sélectionné'}
function svgEl(tag,attrs={},text=''){
  const e=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;return e;
}
function mapMetrics(){
  const W=900,H=650,pad=75;
  const scale=Math.min((W-pad*2)/state.landWidth,(H-pad*2)/state.landLength)*state.zoom;
  return {scale, ox:(W-state.landWidth*scale)/2, oy:(H-state.landLength*scale)/2};
}
function renderPlan(){
  const g=$('planDrawing');g.replaceChildren();const {scale,ox,oy}=mapMetrics();
  const px=(x)=>ox+x*scale, py=(y)=>oy+y*scale;
  const add=(tag,attrs,text)=>g.appendChild(svgEl(tag,attrs,text));
  const hx=(state.landWidth-state.houseWidth)/2,hy=Math.max(0,(state.landLength-state.houseLength)/2);
  add('rect',{x:px(0),y:py(0),width:state.landWidth*scale,height:state.landLength*scale,fill:state.showLand?'#e5eee1':'#f4f6f5',stroke:'#8e9c8d','stroke-width':2,'stroke-dasharray':state.type==='apartment'?'5 5':'none'});
  if(state.showLand){
    for(let x=0;x<=state.landWidth;x+=5)add('line',{x1:px(x),y1:py(0),x2:px(x),y2:py(state.landLength),stroke:'#cbd8c8','stroke-width':.7});
    for(let y=0;y<=state.landLength;y+=5)add('line',{x1:px(0),y1:py(y),x2:px(state.landWidth),y2:py(y),stroke:'#cbd8c8','stroke-width':.7});
  }
  if(state.type!=='land'){
    add('rect',{x:px(hx),y:py(hy),width:state.houseWidth*scale,height:state.houseLength*scale,fill:'#fffdf8',stroke:'#45555c','stroke-width':4,rx:1});
    add('rect',{x:px(hx)+5,y:py(hy)+5,width:Math.max(1,state.houseWidth*scale-10),height:Math.max(1,state.houseLength*scale-10),fill:'none',stroke:'#a5afb1','stroke-width':1});
    add('text',{x:px(hx)+8,y:py(hy)-12,fill:'#536168','font-size':11,'font-weight':700},`${state.type==='apartment'?'APPARTEMENT':state.type==='building'?'BÂTIMENT':'MAISON'} · ${state.houseWidth} × ${state.houseLength} m`);
    add('text',{x:px(hx)+state.houseWidth*scale/2,y:py(hy+state.houseLength)+18,fill:'#879197','font-size':10,'text-anchor':'middle'},`${state.floors} niveau${state.floors>1?'x':''}`);
  }
  state.rooms.forEach(r=>{
    const x=px(hx+r.x),y=py(hy+r.y),w=r.w*scale,h=r.l*scale;
    add('rect',{x,y,width:w,height:h,fill:r.color,stroke:'#65747a','stroke-width':2,rx:2,'data-kind':'room','data-id':r.id,opacity:state.selected===`room:${r.id}`?1:.9});
    if(state.selected===`room:${r.id}`)add('rect',{x:x-3,y:y-3,width:w+6,height:h+6,fill:'none',stroke:'#91ac2a','stroke-width':2,'stroke-dasharray':'5 3','pointer-events':'none'});
    add('text',{x:x+w/2,y:y+h/2-2,'text-anchor':'middle','dominant-baseline':'middle',fill:'#3f4a4f','font-size':Math.min(12,Math.max(8,scale*.55)),'font-weight':700,'pointer-events':'none'},r.name);
    add('text',{x:x+w/2,y:y+h/2+12,'text-anchor':'middle',fill:'#657278','font-size':Math.min(9,Math.max(7,scale*.38)),'pointer-events':'none'},`${r.w} × ${r.l} m`);
  });
  state.objects.forEach(o=>{
    const d=objectDefaults[o.type],outdoor=['pool','tree'].includes(o.type),x=px(outdoor?o.x:hx+o.x),y=py(outdoor?o.y:hy+o.y),w=o.w*scale,h=o.l*scale;
    add('rect',{x:x-w/2,y:y-h/2,width:w,height:h,fill:d.color,stroke:state.selected===`object:${o.id}`?'#758c1d':'#fff','stroke-width':state.selected===`object:${o.id}`?3:1.5,rx:o.type==='plant'||o.type==='tree'?Math.min(w,h)/2:3,'data-kind':'object','data-id':o.id,transform:`rotate(${o.rotation||0} ${x} ${y})`});
    if(['plant','tree'].includes(o.type))add('circle',{cx:x,cy:y,r:Math.min(w,h)*.3,fill:'#557e53','pointer-events':'none'});
    else add('text',{x,y:y+3,'text-anchor':'middle',fill:'#344047','font-size':Math.max(7,Math.min(12,scale*.42)),'font-weight':700,'pointer-events':'none'},o.type==='pool'?'PISCINE':d.label.toUpperCase());
    if(state.selected===`object:${o.id}`)add('rect',{x:x-w/2-3,y:y-h/2-3,width:w+6,height:h+6,fill:'none',stroke:'#91ac2a','stroke-width':2,'stroke-dasharray':'4 3','pointer-events':'none'});
  });
  add('text',{x:830,y:43,fill:'#8d979b','font-size':11,'font-weight':700,'text-anchor':'middle'},'N ↑');
  $('scaleLabel').textContent=`Échelle indicative · 1 m ≈ ${Math.round(scale)} px`;
}
function addRoom(name){
  pushHistory();const [w0,l0,color]=roomDefaults[name]||[3,3,'#e5e5e5'];const w=Math.min(w0,state.houseWidth),l=Math.min(l0,state.houseLength);
  // Find the first available non-overlapping spot inside the building footprint.
  let x=0,y=0,found=false;
  for(let ty=0;ty<=state.houseLength-l+.001&&!found;ty+=.5){for(let tx=0;tx<=state.houseWidth-w+.001;tx+=.5){
    const overlaps=state.rooms.some(q=>tx<q.x+q.w-.05&&tx+w>q.x+.05&&ty<q.y+q.l-.05&&ty+l>q.y+.05);
    if(!overlaps){x=tx;y=ty;found=true;break}
  }}
  if(!found){notify('Il ne reste pas assez de place pour ajouter cette pièce. Agrandissez la maison ou déplacez une pièce.');return}
  const r={id:newId(),name,w,l,color,x,y};
  state.rooms.push(r);state.selected=`room:${r.id}`;renderPlan();updateStats();renderInspector();updateThree();pushHistory();notify(`${name} ajoutée au plan.`);
}
function addObject(type,x,y){
  const d=objectDefaults[type];if(!d)return;pushHistory();const outdoor=['pool','tree'].includes(type);
  const o={id:newId(),type,name:d.label,w:d.w,l:d.l,h:d.h,x,y,rotation:0};
  if(!outdoor){o.x=clamp(x,o.w/2,Math.max(o.w/2,state.houseWidth-o.w/2));o.y=clamp(y,o.l/2,Math.max(o.l/2,state.houseLength-o.l/2))}else{o.x=clamp(x,o.w/2,Math.max(o.w/2,state.landWidth-o.w/2));o.y=clamp(y,o.l/2,Math.max(o.l/2,state.landLength-o.l/2))}
  state.objects.push(o);state.selected=`object:${o.id}`;state.activeObject=null;
  renderPlan();updateStats();renderInspector();updateThree();pushHistory();notify(`${d.label} ajouté.`);
}
function selectBy(kind,id){state.selected=`${kind}:${id}`;renderPlan();updateStats();renderInspector()}
function deleteSelected(){
  if(!state.selected)return;pushHistory();const [kind,id]=state.selected.split(':');
  if(kind==='room')state.rooms=state.rooms.filter(x=>x.id!==+id);else state.objects=state.objects.filter(x=>x.id!==+id);
  state.selected=null;renderPlan();updateStats();renderInspector();updateThree();pushHistory();notify('Élément supprimé.');
}
function renderInspector(){
  const content=$('inspectorContent'), selected=getSelected();
  $('inspectorTitle').textContent=selected?(selected.name||objectDefaults[selected.type]?.label||selected.type):'Votre projet';
  if(!selected){content.innerHTML=`<div class="preview-card"><div class="preview-mini"><span class="mini-roof"></span><span class="mini-house"></span><span class="mini-window"></span></div><div><b>Projet en cours</b><p>Construisez votre plan étape par étape.</p></div></div><div class="property-block"><h3>Raccourcis</h3><button class="quick-action" id="quickRoom"><span>＋</span> Ajouter une pièce <b>›</b></button><button class="quick-action" id="quickFurniture"><span>＋</span> Ajouter du mobilier <b>›</b></button><button class="quick-action" id="quick3d"><span>◈</span> Voir en 3D <b>›</b></button></div><div class="property-block"><h3>Assistant d'aménagement</h3><p class="muted">Décrivez ce que vous souhaitez, en français. L'assistant interprète les demandes courantes pour préparer votre espace.</p><textarea id="promptInput" rows="4" placeholder="Ex. : ajoute un salon, deux chambres et une piscine dans le jardin…"></textarea><button class="btn btn-primary full-btn" id="promptApply">Appliquer ma demande ↗</button><p class="tiny-note">Assistant intégré sans clé API : les commandes courantes sont interprétées localement.</p></div>`;
    wireInspectorActions();return;
  }
  const isRoom=state.selected.startsWith('room:');
  content.innerHTML=`<div class="property-block"><h3>Dimensions et position</h3><div class="property-editor">
  <label>Nom<input id="propName" value="${escapeAttr(selected.name||objectDefaults[selected.type]?.label||'Objet')}"></label>
  <div class="field-grid"><label>Largeur (m)<input id="propW" type="number" min=".3" max="100" step=".1" value="${selected.w}"></label><label>Longueur (m)<input id="propL" type="number" min=".3" max="100" step=".1" value="${selected.l}"></label></div>
  <div class="field-grid"><label>Position X (m)<input id="propX" type="number" step=".1" value="${selected.x}"></label><label>Position Y (m)<input id="propY" type="number" step=".1" value="${selected.y}"></label></div>
  ${isRoom?`<label>Couleur de la pièce<input id="propColor" type="color" value="${selected.color}"></label>`:`<label>Type d'objet<input value="${objectDefaults[selected.type]?.label||selected.type}" disabled></label><label>Rotation (degrés)<input id="propRotation" type="number" min="0" max="359" step="15" value="${selected.rotation||0}"></label>`}
  <button class="btn btn-primary full-btn" id="applyProps">Appliquer les modifications</button><button class="btn btn-outline full-btn" id="duplicateSelected">Dupliquer cet élément</button></div></div><p class="tiny-note">Déplacez l'élément en faisant glisser sa forme sur le plan 2D.</p>`;
  $('applyProps').onclick=()=>{
    pushHistory();selected.name=$('propName').value.trim()||selected.name;
    selected.w=clamp(parseFloat($('propW').value)||selected.w,.3,100);selected.l=clamp(parseFloat($('propL').value)||selected.l,.3,100);
    const isOutdoor=!isRoom&&['pool','tree'].includes(selected.type);const minX=isRoom?0:selected.w/2,minY=isRoom?0:selected.l/2;const maxX=isOutdoor?Math.max(minX,state.landWidth-selected.w/2):isRoom?Math.max(0,state.houseWidth-selected.w):Math.max(minX,state.houseWidth-selected.w/2);const maxY=isOutdoor?Math.max(minY,state.landLength-selected.l/2):isRoom?Math.max(0,state.houseLength-selected.l):Math.max(minY,state.houseLength-selected.l/2);
    selected.x=clamp(parseFloat($('propX').value)||0,minX,maxX);selected.y=clamp(parseFloat($('propY').value)||0,minY,maxY);
    if(isRoom)selected.color=$('propColor').value;else selected.rotation=clamp(parseFloat($('propRotation').value)||0,0,359);
    renderPlan();updateStats();renderInspector();updateThree();pushHistory();notify('Propriétés mises à jour.');
  };
  $('duplicateSelected').onclick=()=>{pushHistory();const copy={...selected,id:newId(),x:Math.min(state.landWidth,selected.x+1),y:Math.min(state.landLength,selected.y+1)};(isRoom?state.rooms:state.objects).push(copy);state.selected=`${isRoom?'room':'object'}:${copy.id}`;renderPlan();updateStats();renderInspector();updateThree();pushHistory();notify('Élément dupliqué.')};
}
function escapeAttr(s){return String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}
function wireInspectorActions(){
  $('quickRoom')?.addEventListener('click',()=>{setStep('structure');addRoom('Salon')});
  $('quickFurniture')?.addEventListener('click',()=>{setStep('amenagement');state.activeObject='sofa';document.querySelectorAll('.object-card').forEach(b=>b.classList.toggle('selected',b.dataset.object==='sofa'));notify('Canapé sélectionné : cliquez sur le plan pour le placer.')});
  $('quick3d')?.addEventListener('click',()=>setView('3d'));
  $('promptApply')?.addEventListener('click',applyPrompt);
}
function applyDimensions(){
  pushHistory();state.landWidth=clamp(parseFloat($('landWidth').value)||20,5,200);state.landLength=clamp(parseFloat($('landLength').value)||30,5,200);
  state.houseWidth=clamp(parseFloat($('houseWidth').value)||10,3,state.landWidth);state.houseLength=clamp(parseFloat($('houseLength').value)||12,3,state.landLength);state.floors=+ $('floors').value;
  state.houseWidth=Math.min(state.houseWidth,state.landWidth);state.houseLength=Math.min(state.houseLength,state.landLength);
  $('houseWidth').value=state.houseWidth;$('houseLength').value=state.houseLength;
  renderPlan();updateStats();if(three)three.needsFit=true;updateThree();pushHistory();notify('Dimensions du projet mises à jour.');
}
function applyPrompt(){
  const input=$('promptInput');if(!input)return;const text=input.value.trim().toLowerCase();if(!text){notify('Décrivez ce que vous souhaitez aménager.');return}
  pushHistory();let count=0;
  const roomPatterns=[['Salon',/salon|séjour|living/],['Cuisine',/cuisine/],['Chambre',/chambre|suite parentale/],['Salle de bain',/salle de bain|salle d'eau|douche/],['Bureau',/bureau|télétravail/],['Garage',/garage/]];
  for(const [name,regex] of roomPatterns){const m=text.match(new RegExp(`(?:${regex.source})`,'i'));if(m){let n=1;const prefix=text.match(new RegExp(`(\\d+)\\s*(?:${name.toLowerCase()}|${name==='Chambre'?'chambres':'pièces'})`,'i'));if(prefix)n=clamp(+prefix[1],1,8);else if(name==='Chambre'&&/deux chambres|2 chambres/.test(text))n=2;else if(name==='Chambre'&&/trois chambres|3 chambres/.test(text))n=3;for(let i=0;i<n;i++){addRoom(name);count++}}}
  for(const [type,regex] of Object.entries({pool:/piscine/,tree:/arbre|arbres/,plant:/plante|plantes/,sofa:/canapé|canape/,bed:/lit|lits/,table:/table à manger|table/,kitchen:/meuble de cuisine|îlot de cuisine/})){
    if(regex.test(text)){let n=1;if(type==='tree'&&/arbres/.test(text))n=3;for(let i=0;i<n;i++){const x=type==='pool'?state.landWidth*.72:state.landWidth*.2+(i%3)*2;const y=type==='pool'?state.landLength*.72:state.landLength*.25+Math.floor(i/3)*2;addObject(type,x,y);count++}}
  }
  const dim=text.match(/(\d+(?:[.,]\d+)?)\s*(?:mètres|m)\s*(?:de\s*)?(large|largeur)/);if(dim){state.houseWidth=+dim[1].replace(',','.');$('houseWidth').value=state.houseWidth;applyDimensions()}
  if(/moderne/.test(text)){$('styleSelect').value='modern';state.style='modern'}if(/scandinave/.test(text)){$('styleSelect').value='scandi';state.style='scandi'}if(/industriel/.test(text)){$('styleSelect').value='industrial';state.style='industrial'}if(/méditerranéen|mediterraneen/.test(text)){$('styleSelect').value='mediterranean';state.style='mediterranean'}
  if(count===0)notify("Je n'ai pas reconnu d'élément précis. Essayez « ajoute un salon, deux chambres et une piscine ».");
  else {renderPlan();updateStats();updateThree();pushHistory();notify(`${count} élément(s) ajouté(s) selon votre demande.`)}
}
function autoFurnish(){
  pushHistory();
  if(state.type==='land'){notify('Pour aménager automatiquement un intérieur, choisissez Maison, Appartement ou Bâtiment.');return}
  if(!state.rooms.length){const [w,l,color]=roomDefaults['Salon'];state.rooms.push({id:newId(),name:'Salon',w:Math.min(w,state.houseWidth),l:Math.min(l,state.houseLength),color,x:0,y:0});}
  let added=0;
  const existingRoomObjects=new Set();
  state.rooms.forEach(r=>{
    const name=r.name.toLowerCase();let types=[];
    if(name.includes('salon')||name.includes('séjour'))types=['sofa','table','plant'];
    else if(name.includes('cuisine'))types=['kitchen','table'];
    else if(name.includes('chambre'))types=['bed','plant'];
    else if(name.includes('bureau'))types=['table','chair','plant'];
    else if(name.includes('bain'))types=['plant'];
    else if(name.includes('garage'))types=[];
    if(!types.length)return;
    const already=state.objects.some(o=>!['pool','tree'].includes(o.type)&&o.x>=r.x&&o.x<=r.x+r.w&&o.y>=r.y&&o.y<=r.y+r.l);
    if(already)return;
    types.forEach((type,i)=>{const d=objectDefaults[type];const positions=type==='sofa'?[r.x+r.w*.5,r.y+r.l*.35]:type==='table'?[r.x+r.w*.5,r.y+r.l*.68]:type==='bed'?[r.x+r.w*.5,r.y+r.l*.52]:type==='kitchen'?[r.x+r.w*.5,r.y+r.l*.2]:type==='chair'?[r.x+r.w*.68,r.y+r.l*.68]:[r.x+r.w*.78,r.y+r.l*.25];
      const outdoor=false;const o={id:newId(),type,name:d.label,w:d.w,l:d.l,h:d.h,x:clamp(positions[0],d.w/2,Math.max(d.w/2,state.houseWidth-d.w/2)),y:clamp(positions[1],d.l/2,Math.max(d.l/2,state.houseLength-d.l/2)),rotation:0};state.objects.push(o);added++;
    });
  });
  state.selected=null;renderPlan();updateStats();renderInspector();updateThree();pushHistory();
  notify(added?`${added} meuble(s) placé(s) automatiquement.`:'Les pièces sont déjà aménagées ou aucun meuble standard ne convient.');
}

function serialize(){
  return {app:'Maison3D Studio',version:1,projectName:$('projectName').value||state.projectName,createdAt:new Date().toISOString(),...state};
}
function saveLocal(){try{localStorage.setItem('maison3d-project',JSON.stringify(serialize()));notify('Projet enregistré sur cet appareil.')}catch(e){notify('Enregistrement impossible : stockage navigateur indisponible.')}}
function exportJSON(){const blob=new Blob([JSON.stringify(serialize(),null,2)],{type:'application/json'});downloadBlob(blob,`${slug($('projectName').value||'mon-projet')}.json`);notify('Fichier projet exporté.')}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mon-projet'}
function importProject(data){
  if(!data||data.app!=='Maison3D Studio')throw new Error('Fichier non reconnu');
  for(const k of ['type','landWidth','landLength','houseWidth','houseLength','floors','rooms','objects','style','showRoof','showLand','nextId'])if(data[k]!==undefined)state[k]=data[k];
  state.selected=null;state.activeObject=null;$('projectName').value=data.projectName||'Mon projet de maison';
  $('landWidth').value=state.landWidth;$('landLength').value=state.landLength;$('houseWidth').value=state.houseWidth;$('houseLength').value=state.houseLength;$('floors').value=state.floors;$('styleSelect').value=state.style;
  document.querySelectorAll('.type-card').forEach(b=>b.classList.toggle('selected',b.dataset.type===state.type));
  renderPlan();updateStats();renderInspector();updateThree();notify('Projet importé avec succès.');
}
function exportPlanSVG(){
  const svg=$('planSvg').cloneNode(true);svg.setAttribute('xmlns',svgNS);const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});downloadBlob(blob,`${slug($('projectName').value)}-plan.svg`);notify('Plan 2D exporté en SVG.');
}
function export3DImage(){
  if(!three){setView('3d');setTimeout(export3DImage,700);return}
  three.renderer.render(three.scene,three.camera);
  three.renderer.domElement.toBlob(blob=>{if(blob)downloadBlob(blob,`${slug($('projectName').value)}-rendu-3d.png`);else notify('Export image indisponible dans ce navigateur.')},'image/png');
}
function initThree(){
  if(three)return;
  const host=$('threeHost');const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf0f1');scene.fog=new THREE.Fog('#eaf0f1',50,110);
  const camera=new THREE.PerspectiveCamera(42,host.clientWidth/Math.max(1,host.clientHeight),.1,300);camera.position.set(24,23,27);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x87928b,2));
  const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(15,28,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(state.landWidth/2,0,state.landLength/2);controls.maxPolarAngle=Math.PI*.49;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(250,250),new THREE.MeshStandardMaterial({color:'#eaf0e8',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.05;ground.receiveShadow=true;scene.add(ground);
  three={scene,camera,renderer,controls,groups:[],host,needsFit:true};
  const resize=()=>{if(!three)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)};
  new ResizeObserver(resize).observe(host);
  const animate=()=>{if(!three)return;requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();
}
function clearThree(){if(!three)return;for(const g of three.groups){three.scene.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}three.groups=[]}
function mat(color,roughness=.82){return new THREE.MeshStandardMaterial({color,roughness})}
function addBox(group,x,y,z,w,h,d,color,opts={}){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,w),Math.max(.05,h),Math.max(.05,d)),mat(color,opts.roughness??.82));mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function updateThree(){
  if(!three)return;clearThree();const g=new THREE.Group();three.scene.add(g);three.groups.push(g);
  const W=state.landWidth,L=state.landLength,hw=state.houseWidth,hl=state.houseLength,hx=(W-hw)/2,hz=(L-hl)/2,wallH=2.8;
  if(state.showLand){
    const land=new THREE.Mesh(new THREE.BoxGeometry(W,.12,L),mat('#9fb995'));land.position.set(W/2,-.08,L/2);land.receiveShadow=true;g.add(land);
    const lineMat=mat('#73896b');const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W,.15,L)),new THREE.LineBasicMaterial({color:'#7c9275'}));edges.position.set(W/2,-.005,L/2);g.add(edges);
  }
  if(state.type!=='land'){
    const floorMat=mat(state.style==='industrial'?'#a9a49c':state.style==='mediterranean'?'#c9b08a':state.style==='scandi'?'#d9d1c1':'#c9c8bd');
    const floor=new THREE.Mesh(new THREE.BoxGeometry(hw,.18,hl),floorMat);floor.position.set(hx,.04,hz+hl/2);floor.receiveShadow=true;g.add(floor);
    // Four walls with a low cutaway on the front so the interior remains visible.
    const wallColor=state.style==='mediterranean'?'#e6d5b8':state.style==='industrial'?'#9ca3a3':'#f4f1e9';
    const wallHActual=state.showRoof?wallH:2.35;
    addBox(g,hx+hw/2,0,hz,hw,wallHActual,.16,wallColor);
    if(state.showRoof)addBox(g,hx+hw/2,0,hz+hl,hw,wallHActual,.16,wallColor);else{addBox(g,hx+hw*.2,0,hz+hl,hw*.4,wallHActual,.16,wallColor);addBox(g,hx+hw*.8,0,hz+hl,hw*.4,wallHActual,.16,wallColor);}
    addBox(g,hx,0,hz+hl/2,.16,wallHActual,hl,wallColor);
    addBox(g,hx+hw,0,hz+hl/2,.16,wallHActual,hl,wallColor);
    // Interior partitions derived from room rectangles.
    state.rooms.forEach(r=>{
      const rx=hx+r.x,rz=hz+r.y;
      const roomColor=r.color||'#dce8d6';
      const roomFloor=new THREE.Mesh(new THREE.BoxGeometry(r.w,.025,r.l),mat(roomColor));roomFloor.position.set(rx+r.w/2,.15,rz+r.l/2);g.add(roomFloor);
      // Subtle low walls give room outlines while preserving cutaway readability.
      const pm=mat('#e7e5dc');
      const parts=[[rx+r.w/2,.18,rz,r.w,.42,.07],[rx+r.w/2,.18,rz+r.l,r.w,.42,.07],[rx,.18,rz+r.l/2,.07,.42,r.l],[rx+r.w,.18,rz+r.l/2,.07,.42,r.l]];
      parts.forEach(([x,y,z,w,h,d])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),pm);m.position.set(x,y+h/2,z);g.add(m)});
    });
    if(state.showRoof){
      const roofColor=state.style==='mediterranean'?'#b66f56':state.style==='industrial'?'#59656a':'#626d70';
      // Flat roof with a shallow slab keeps the model lightweight and readable.
      addBox(g,hx+hw/2,wallHActual,hz+hl/2,hw+.35,.22,hl+.35,roofColor);
    }
    // Doors and windows as recognizable facade details.
    const glass=mat('#8fc1d1',.3),doorMat=mat('#96765a');
    const win1=new THREE.Mesh(new THREE.BoxGeometry(1.35,1.05,.06),glass);win1.position.set(hx+hw*.3,1.45,hz-.095);g.add(win1);
    const win2=new THREE.Mesh(new THREE.BoxGeometry(1.35,1.05,.06),glass);win2.position.set(hx+hw*.7,1.45,hz-.095);g.add(win2);
    const door=new THREE.Mesh(new THREE.BoxGeometry(.9,2.05,.08),doorMat);door.position.set(hx+hw*.5,1.08,hz+hl+.08);g.add(door);
    // Interior furniture is grouped around its own pivot so rotation works in 3D.
    state.objects.filter(o=>o.type!=='pool'&&o.type!=='tree').forEach(o=>{
      const c=objectDefaults[o.type].color;const fg=new THREE.Group();fg.position.set(hx+o.x,0,hz+o.y);fg.rotation.y=-(o.rotation||0)*Math.PI/180;g.add(fg);
      if(o.type==='sofa'){
        addBox(fg,0,.18,0,o.w,.55,o.l,c);addBox(fg,0,.73,-o.l*.38,o.w,.65,.18,c);
        for(let i=-1;i<=1;i++)addBox(fg,i*o.w*.27,.2,0,o.w*.23,.12,o.l*.72,'#c2c8b7');
      }else if(o.type==='bed'){
        addBox(fg,0,.18,0,o.w,.25,o.l,'#d8c8ae');addBox(fg,0,.43,-o.l*.12,o.w,.22,o.l*.28,'#f3eee4');addBox(fg,0,.47,-o.l*.44,o.w,.45,.12,'#b69c7b');
      }else if(o.type==='table'){
        addBox(fg,0,.72,0,o.w,.12,o.l,c);for(const dx of [-.42,.42])for(const dz of [-.35,.35])addBox(fg,dx*o.w,.2,dz*o.l,.08,.52,.08,'#765f48');
      }else if(o.type==='chair'){
        addBox(fg,0,.48,0,o.w,.12,o.l,c);addBox(fg,0,.85,-o.l*.42,o.w,.7,.09,c);
      }else if(o.type==='kitchen'){
        addBox(fg,0,.18,0,o.w,.8,o.l,c);addBox(fg,0,.98,0,o.w,.08,o.l,'#dedbd2');
      }else if(o.type==='plant'){
        const pot=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,.32,12),mat('#b78d6b'));pot.position.set(0,.32,0);fg.add(pot);
        const leaves=new THREE.Mesh(new THREE.SphereGeometry(.42,12,10),mat('#679367'));leaves.position.set(0,.85,0);leaves.scale.set(.85,1.2,.85);fg.add(leaves);
      }
    });
  }
  state.objects.filter(o=>o.type==='pool'||o.type==='tree').forEach(o=>{
    if(o.type==='pool'){
      const edge=new THREE.Mesh(new THREE.BoxGeometry(o.w+.3,.22,o.l+.3),mat('#d8d7c8'));edge.position.set(o.x,.05,o.y);g.add(edge);
      const water=new THREE.Mesh(new THREE.BoxGeometry(o.w,.12,o.l),new THREE.MeshStandardMaterial({color:'#64b9d0',roughness:.2,metalness:.05}));water.position.set(o.x,.18,o.y);g.add(water);
    }else{
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,o.h*.45,8),mat('#8a684d'));trunk.position.set(o.x,o.h*.225,o.y);g.add(trunk);
      const crown=new THREE.Mesh(new THREE.SphereGeometry(o.h*.28,12,10),mat('#63885e'));crown.position.set(o.x,o.h*.65,o.y);crown.scale.set(1,1.15,1);crown.castShadow=true;g.add(crown);
    }
  });
  const maxDim=Math.max(W,L,hw,hl);
  if(three.needsFit){three.controls.target.set(W/2,0,L/2);three.camera.position.set(W/2+maxDim*.85,maxDim*.85,L/2+maxDim*.9);three.needsFit=false;}
  const view=$('cameraView')?.value||'perspective';
  if(view==='top'){three.camera.position.set(W/2,maxDim*1.8,L/2+.01);three.controls.target.set(W/2,0,L/2)}
  else if(view==='front'){three.camera.position.set(W/2+0.01,maxDim*.5,L/2+maxDim*1.8);three.controls.target.set(W/2,1,L/2)}
  else if(three.lastView!=='perspective'){three.camera.position.set(W/2+maxDim*.85,maxDim*.85,L/2+maxDim*.9);three.controls.target.set(W/2,0,L/2)}
  three.lastView=view;three.controls.update();three.renderer.render(three.scene,three.camera);
}
function init(){
  document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>setStep(b.dataset.step)));
  document.querySelectorAll('.type-card').forEach(b=>b.addEventListener('click',()=>{pushHistory();state.type=b.dataset.type;document.querySelectorAll('.type-card').forEach(c=>c.classList.toggle('selected',c===b));if(state.type==='land')notify('Mode terrain : ajoutez une piscine, des arbres et des espaces extérieurs.');else notify(`Modèle ${b.querySelector('b').textContent.toLowerCase()} sélectionné.`);renderPlan();updateStats();updateThree();pushHistory()}));
  document.querySelectorAll('.room-add').forEach(b=>b.addEventListener('click',()=>addRoom(b.dataset.room)));
  document.querySelectorAll('.object-card').forEach(b=>b.addEventListener('click',()=>{state.activeObject=b.dataset.object;document.querySelectorAll('.object-card').forEach(c=>c.classList.toggle('selected',c===b));notify(`${objectDefaults[state.activeObject].label} sélectionné : cliquez sur le plan pour le placer.`)}));
  document.querySelectorAll('.view-tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('applyDimensions').addEventListener('click',applyDimensions);$('autoFurnish').addEventListener('click',autoFurnish);
  $('styleSelect').addEventListener('change',e=>{pushHistory();state.style=e.target.value;updateThree();pushHistory();notify('Style de décoration actualisé.')});
  $('showRoof').addEventListener('change',e=>{pushHistory();state.showRoof=e.target.checked;updateThree();pushHistory()});
  $('showLand').addEventListener('change',e=>{pushHistory();state.showLand=e.target.checked;renderPlan();updateThree();pushHistory()});
  $('cameraView').addEventListener('change',()=>updateThree());
  $('saveBtn').addEventListener('click',saveLocal);$('exportBtn').addEventListener('click',exportJSON);$('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{importProject(JSON.parse(await f.text()))}catch(err){notify('Import impossible : fichier JSON invalide.')}e.target.value=''});
  $('downloadImage').addEventListener('click',export3DImage);$('downloadPlan').addEventListener('click',exportPlanSVG);
  $('deleteSelected').addEventListener('click',deleteSelected);
  $('zoomIn').addEventListener('click',()=>{state.zoom=clamp(state.zoom*1.15,.5,3);renderPlan()});
  $('zoomOut').addEventListener('click',()=>{state.zoom=clamp(state.zoom/1.15,.5,3);renderPlan()});
  $('resetView').addEventListener('click',()=>{state.zoom=1;renderPlan();if(three){three.needsFit=true;updateThree()}});
  $('planSvg').addEventListener('pointerdown',onPlanDown);$('planSvg').addEventListener('pointermove',onPlanMove);$('planSvg').addEventListener('pointerup',onPlanUp);$('planSvg').addEventListener('pointercancel',()=>drag=null);
  $('projectName').addEventListener('change',()=>{state.projectName=$('projectName').value});
  wireInspectorActions();
  // Restore the last saved project automatically if present.
  try{const saved=localStorage.getItem('maison3d-project');if(saved){const d=JSON.parse(saved);if(d.app==='Maison3D Studio')importProject(d)}}catch(e){}
  renderPlan();updateStats();renderInspector();pushHistory();updateHistoryButtons();
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==='y'||(e.shiftKey&&e.key.toLowerCase()==='z'))){e.preventDefault();redo()}else if(e.key==='Delete'&&state.selected&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){deleteSelected()}});
}
function svgPoint(evt){
  const svg=$('planSvg'),p=svg.createSVGPoint();p.x=evt.clientX;p.y=evt.clientY;const ctm=svg.getScreenCTM();if(!ctm)return{x:0,y:0};const q=p.matrixTransform(ctm.inverse());return{x:q.x,y:q.y};
}
function onPlanDown(evt){
  const target=evt.target.closest('[data-kind]');const p=svgPoint(evt);const {scale,ox,oy}=mapMetrics();const hx=(state.landWidth-state.houseWidth)/2,hy=Math.max(0,(state.landLength-state.houseLength)/2);
  if(target){
    const kind=target.dataset.kind,id=+target.dataset.id;selectBy(kind,id);const item=getSelected();const outdoor=kind==='object'&&['pool','tree'].includes(item.type);const ax=kind==='room'||(kind==='object'&&!outdoor)?hx:0,ay=kind==='room'||(kind==='object'&&!outdoor)?hy:0;
    drag={kind,id,dx:p.x-(ox+(ax+item.x)*scale),dy:p.y-(oy+(ay+item.y)*scale),startX:p.x,startY:p.y,moved:false,ax,ay,outdoor};
    $('planSvg').setPointerCapture?.(evt.pointerId);evt.preventDefault();return;
  }
  if(state.activeObject){
    let x=(p.x-ox)/scale,y=(p.y-oy)/scale;const outdoor=['pool','tree'].includes(state.activeObject);
    if(outdoor){const d=objectDefaults[state.activeObject];x=clamp(x,d.w/2,Math.max(d.w/2,state.landWidth-d.w/2));y=clamp(y,d.l/2,Math.max(d.l/2,state.landLength-d.l/2))}else{const d=objectDefaults[state.activeObject];x=clamp(x-hx,d.w/2,Math.max(d.w/2,state.houseWidth-d.w/2));y=clamp(y-hy,d.l/2,Math.max(d.l/2,state.houseLength-d.l/2))}
    addObject(state.activeObject,x,y);state.activeObject=null;document.querySelectorAll('.object-card').forEach(b=>b.classList.remove('selected'));return;
  }
  state.selected=null;renderPlan();updateStats();renderInspector();
}
function onPlanMove(evt){
  if(!drag)return;const p=svgPoint(evt),{scale,ox,oy}=mapMetrics();const item=drag.kind==='room'?state.rooms.find(x=>x.id===drag.id):state.objects.find(x=>x.id===drag.id);if(!item)return;
  if(Math.abs(p.x-drag.startX)+Math.abs(p.y-drag.startY)>3)drag.moved=true;if(!drag.moved)return;
  const x=(p.x-drag.dx-ox)/scale-drag.ax,y=(p.y-drag.dy-oy)/scale-drag.ay;
  const minX=drag.kind==='room'?0:item.w/2,minY=drag.kind==='room'?0:item.l/2;const maxX=drag.outdoor?Math.max(minX,state.landWidth-item.w/2):drag.kind==='room'?Math.max(0,state.houseWidth-item.w):Math.max(minX,state.houseWidth-item.w/2);
  const maxY=drag.outdoor?Math.max(minY,state.landLength-item.l/2):drag.kind==='room'?Math.max(0,state.houseLength-item.l):Math.max(minY,state.houseLength-item.l/2);
  item.x=clamp(Math.round(x*10)/10,minX,maxX);item.y=clamp(Math.round(y*10)/10,minY,maxY);renderPlan();updateStats();
}
function onPlanUp(){if(drag?.moved){pushHistory();renderInspector();updateThree()}drag=null}
init();
