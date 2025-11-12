// Wrap in IIFE to avoid globals
(function(){
// --- React hooks shortcut ---
const { useState, useMemo, useRef } = React;

// --- helpers (no optional chaining / no nullish coalescing for compatibility) ---
const uid = () => Math.random().toString(36).slice(2, 9);
function hasOwn(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }
function refToKey(r){ if(!r) return ''; return r.indexOf('#')===0 ? r.slice(1) : r; }
function shortLabel(m){
  // Prefer message.name when available
  if(m && typeof m.message==='object' && m.message && m.message.name){
    return m.message.name;
  }
  if(m && m.protocol==='HTTP/SBI' && m.interface){
    return m.operation ? (m.interface + ' ' + m.operation) : m.interface;
  }
  return m && (typeof m.message==='string' ? m.message : m.id) || '';
}
function defaultOf(n, meta){
 if(n && hasOwn(n,'val_default')) return n.val_default;
 if(meta && hasOwn(meta,'default')) return meta.default;
 return '';
}
// Build human-readable presence label
function presenceLabel(p){
  switch((p||'').toUpperCase()){
    case 'M': return 'Mandatory';
    case 'C': return 'Conditional';
    default: return 'Optional';
  }
}
// Derive nested payload object from IE tree/dict and overrides
function derivePayload(tree, dict, overrides){
  function walk(nodes){
    var out = {};
    (nodes||[]).forEach(function(n){
      var key = n.key || n.name || '';
      if(!key) return;
      var meta = dict && dict[key] || {};
      var label = presenceLabel(n.presence || (meta && meta.presence) || '');
      var k = String(key).trim() + ' [' + label + ']';
      var children = n.children || n.items || [];
      if(children && children.length){
        out[k] = walk(children);
      } else {
        var defv = defaultOf(n, meta);
        var ov = (overrides && hasOwn(overrides, key)) ? overrides[key] : '';
        out[k] = (ov !== '') ? ov : defv;
      }
    });
    return out;
  }
  return walk(tree || []);
}
function inputTypeOf(n, meta){
 var t = (n && n.type) ? n.type : (meta && meta.format ? meta.format : '');
 var hasEnum = (n && Array.isArray(n.enum) && n.enum.length) || (meta && meta.enum_doc && meta.enum_doc.length);
 if( (t.indexOf('uint')>=0 || t==='number') && !hasEnum ) return 'number';
 if( hasEnum ) return 'select';
 if( t.indexOf('octets')>=0 || ((meta && meta.pattern) ? meta.pattern : '').indexOf('^[0-9A-F]')===0 ) return 'hex';
 return 'text';
}

// -------- role restriction helpers --------
function allowedRolesForSide(msg, side){
 var base = (side==='from') ? msg.from : msg.to;
 var rs = Array.isArray(msg.roleset) ? msg.roleset : ((msg.roles && msg.roles.roleset) || []);
 var filtered = rs.filter(function(v){ return typeof v === 'string' && v.indexOf(base+'$')===0; });
 return filtered.length ? Array.from(new Set(filtered)) : [base + '$A'];
}
function sanitizeRole(role, msg, side){
 var allowed = allowedRolesForSide(msg, side);
 return allowed.indexOf(role)>=0 ? role : allowed[0];
}

// -------- JSON object extractor (multi-line & mixed text safe) --------
function extractJSONObjects(text){
 var s = String(text||'').replace(/^\uFEFF/,''); // strip BOM
 var res=[], errs=[];
 var depth=0, start=-1, inStr=false, esc=false;
 for(var i=0;i<s.length;i++){
 var ch=s[i];
 if(inStr){
 if(esc){ esc=false; continue; }
 if(ch==='\\'){ esc=true; continue; }
 if(ch=='"'){ inStr=false; continue; }
 continue;
 }else{
 if(ch=='"'){ inStr=true; continue; }
 if(ch=='{'){
 if(depth===0) start=i;
 depth++; continue;
 }
 if(ch=='}'){
 depth--;
 if(depth===0 && start!==-1){
 var slice = s.slice(start, i+1);
 try{
 var obj = JSON.parse(slice);
 res.push({obj:obj, range:[start,i+1]});
 }catch(e){
 errs.push({pos:start, msg:(e&&e.message)||'parse error'});
 }
 start=-1;
 }
 }
 }
 }
 return {res:res, errs:errs};
}
function parseJSONAny(t){
 var r = extractJSONObjects(t);
 var res = r.res, errs = r.errs;
 var items=[], errors=[];
 for(var i=0;i<res.length;i++){
  var x = res[i].obj;
  if(Array.isArray(x)){
    for(var k=0;k<x.length;k++){
      var y = x[k];
      if(y && (y.schema_version || y.id) && (y.ie_tree||y.message||y.interface)){
        // 瑙勮寖 message锛氳嫢涓哄璞′笖鍖呭惈 name锛屽垯褰掍竴鍖栦负瀛楃涓?        if(y && typeof y.message==='object' && y.message && y.message.name){ y.message = y.message.name; }
        // 纭繚 id 涓哄瓧绗︿覆閿?        y.id = String(y.id||'');
        // 鍩虹瀹炰綋缂虹渷
        y.from = y.from || 'Unknown';
        y.to = y.to || 'Unknown';
        y.from_role = sanitizeRole(y.from_role || (y.from+'$A'), y, 'from');
        y.to_role = sanitizeRole(y.to_role || (y.to+'$A'), y, 'to');
        items.push(y);
      }else{
        errors.push({i:(i+1)+'.'+(k+1),msg:'missing required fields in array item'});
      }
    }
  }else if(x && (x.schema_version || x.id) && (x.ie_tree||x.message||x.interface)){
   if(x && typeof x.message==='object' && x.message && x.message.name){ x.message = x.message.name; }
   x.id = String(x.id||'');
   x.from = x.from || 'Unknown';
   x.to = x.to || 'Unknown';
   x.from_role = sanitizeRole(x.from_role || (x.from+'$A'), x, 'from');
   x.to_role = sanitizeRole(x.to_role || (x.to+'$A'), x, 'to');
   items.push(x);
  }else{
   errors.push({i:i+1,msg:'missing required fields'});
  }
 }
 if(items.length===0){
 var lines = String(t||'').split(/\r?\n/);
 for(var j=0;j<lines.length;j++){
 var s = lines[j].trim(); if(!s || s[0]!=='{' || s[s.length-1]!=='}') continue;
 try{ var x2=JSON.parse(s); if(x2 && (x2.schema_version || x2.id)){ items.push(x2);} }catch(e){ errors.push({i:j+1,msg:(e&&e.message)||'parse error'}); }
 }
 }
 return {items:items, errors: errors.concat(errs)};
}
function groupByProto(a){
 var m={};
 for(var i=0;i<a.length;i++){
 var x=a[i];
 if(!m[x.protocol]) m[x.protocol]=[];
 m[x.protocol].push(x);
 }
 for(var k in m){
 m[k].sort(function(a,b){ return (a.message||a.id).localeCompare(b.message||b.id); });
 }
 return m;
}

// ---------- Preview builder (NO literal </scr'+'ipt> anywhere) ----------
// Safe global fallbacks to avoid ReferenceError from free-variable usage
// Some legacy code paths may reference `compactMode` as a free variable.
// Define a harmless IIFE-scoped fallback to prevent ReferenceError.
var compactMode; // fallback only; App defines its own scoped state


// ---------- App (builder UI) ----------
// Small icon component (no deps), unified button visuals and labels
function Icon({name, size=16, className}){
 const props = {width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round', className};
 switch(name){
  case 'plus': return (<svg {...props}><path d="M12 5v14"/><path d="M5 12h14"/></svg>);
  case 'trash': return (<svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>);
  case 'pencil': return (<svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>);
  case 'check': return (<svg {...props}><path d="M20 6L9 17l-5-5"/></svg>);
  case 'x': return (<svg {...props}><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>);
  case 'copy': return (<svg {...props}><rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/></svg>);
  case 'export': return (<svg {...props}><path d="M12 5v14"/><path d="M5 12l7-7 7 7"/></svg>);
  case 'import': return (<svg {...props}><path d="M12 19V5"/><path d="M5 12l7 7 7-7"/></svg>);
  case 'folder': return (<svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z"/></svg>);
  case 'arrow-down': return (<svg {...props}><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>);
  case 'refresh': return (<svg {...props}><path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5 8a7 7 0 0 1 12-3"/><path d="M19 16a7 7 0 0 1-12 3"/></svg>);
  case 'settings': return (<svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
  case 'build': return (<svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>);
  case 'generate': return (<svg {...props}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>);
  case 'clock': return (<svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>);
  case 'database': return (<svg {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>);
  case 'layers': return (<svg {...props}><polygon points="12,2 2,7 12,12 22,7 12,2"/><polyline points="2,17 12,22 22,17"/><polyline points="2,12 12,17 22,12"/></svg>);
  default: return null;
 }
}
function IconButton({icon, title, onClick, className, size='sm', primary=false, disabled=false}){
 const base = 'btn ' + (size==='xs'?'btn-xs': (size==='sm'?'btn-sm':'')) + (primary?' btn-primary':'');
 return (<button className={base+(className?(' '+className):'')} title={title} aria-label={title} onClick={onClick} disabled={disabled}><Icon name={icon} size={16}/></button>);
}
function App(){
 var useStateRef = React.useState;
 
 // 
 const loadState = (key, defaultValue) => {
 try {
 const saved = localStorage.getItem(`5gc_viewer_${key}`);
 return saved ? JSON.parse(saved) : defaultValue;
 } catch (e) {
 return defaultValue;
 }
 };
 
 const saveState = (key, value) => {
 try {
 localStorage.setItem(`5gc_viewer_${key}`, JSON.stringify(value));
 } catch (e) {
 console.warn(':', e);
 }
 };
 
 // ?
 const [tab,setTab]=useStateRef(loadState('tab', 'build'));
 const [text,setText]=useStateRef(loadState('text', ''));
 const [truth,setTruth]=useStateRef(loadState('truth', []));
 const [importInfo,setImportInfo]=useStateRef(loadState('importInfo', null));
 const [search,setSearch]=useStateRef(loadState('search', ''));
 const [canvas,setCanvas]=useStateRef(loadState('canvas', []));
 const [inst,setInst]=useStateRef(loadState('inst', false));
 const [bindings,setBindings]=useStateRef(loadState('bindings', {}));
 const [selected,setSelected]=useStateRef(loadState('selected', null));
 const [dragIdx,setDragIdx]=useStateRef(loadState('dragIdx', null));
 const [compactMode,setCompactMode]=useStateRef(loadState('compactMode', false)); // 
 const [groupMode,setGroupMode]=useStateRef(false); // 寮哄埗鍏抽棴鍒嗙粍
 const [currentPage,setCurrentPage]=useStateRef(loadState('currentPage', 0)); // 
 const [itemsPerPage,setItemsPerPage]=useStateRef(loadState('itemsPerPage', 50));
 const [globalEditMode,setGlobalEditMode]=useStateRef(loadState('globalEditMode', false));
 const [caseName,setCaseName]=useStateRef(loadState('caseName', ''));
 const [casesMap,setCasesMap]=useStateRef(loadState('casesMap', {}));
 const [showErrorExamples,setShowErrorExamples]=useStateRef(false);
 const [idsText,setIdsText]=useStateRef('');
 const fileRef = React.useRef(null);
 const byProto=useMemo(function(){ return groupByProto(truth); },[truth]);

 // Compute import stats for JSONL/JSON text area
 const importStats = useMemo(function(){
   const t = (text && text.trim()) ? text : '';
   if(!t) return null;
   try{
     const lines = String(t||'').split(/\r?\n/);
     let valid=0, err=0; const samples=[];
     for(let i=0;i<lines.length;i++){
       const src = lines[i];
       const line = src.trim(); if(!line) continue;
       if(line[0] !== '{' || line[line.length-1] !== '}'){ err++; if(samples.length<3) samples.push(`[${i+1}] ${src.slice(0,200)}`); continue; }
       try{ JSON.parse(line); valid++; }catch(_){ err++; if(samples.length<3) samples.push(`[${i+1}] ${src.slice(0,200)}`); }
     }
     return { est: { totalLines: lines.length, validCount: valid, errorCount: err }, samples };
   }catch(_){ return { est: { totalLines: 0, validCount: 0, errorCount: 0 }, samples: [], error:true }; }
 }, [text]);

 // 渚濇嵁 truth 鏋勫缓 id->message 鏄犲皠锛屼究浜庢寜 id 鍒涘缓 Case
 const idMap = useMemo(function(){
   const m={};
   (Array.isArray(truth)?truth:[]).forEach(function(x){ if(x && hasOwn(x,'id')){ m[String(x.id)]=x; } });
   return m;
 }, [truth]);

 // 鏆撮湶 truth 鍒?window 渚夸簬妗ユ帴/璋冭瘯
 React.useEffect(function(){
   try{ window.truth = truth; window.idMapSize = Object.keys(idMap||{}).length; }catch(_){}
 }, [truth, idMap]);
 
 // localStorage
 React.useEffect(() => { saveState('tab', tab); }, [tab]);
 React.useEffect(() => { saveState('text', text); }, [text]);
 React.useEffect(() => { saveState('truth', truth); }, [truth]);
 React.useEffect(() => { saveState('importInfo', importInfo); }, [importInfo]);
 React.useEffect(() => { saveState('search', search); }, [search]);
 React.useEffect(() => { saveState('canvas', canvas); }, [canvas]);
 React.useEffect(() => { saveState('inst', inst); }, [inst]);
 React.useEffect(() => { saveState('bindings', bindings); }, [bindings]);
 React.useEffect(() => { saveState('selected', selected); }, [selected]);
 React.useEffect(() => { saveState('dragIdx', dragIdx); }, [dragIdx]);
 React.useEffect(() => { saveState('compactMode', compactMode); }, [compactMode]);
 React.useEffect(() => { saveState('groupMode', groupMode); }, [groupMode]);
 React.useEffect(() => { saveState('currentPage', currentPage); }, [currentPage]);
 React.useEffect(() => { saveState('itemsPerPage', itemsPerPage); }, [itemsPerPage]);
 React.useEffect(() => { saveState('globalEditMode', globalEditMode); }, [globalEditMode]);
 React.useEffect(() => { saveState('caseName', caseName); }, [caseName]);
 React.useEffect(() => { saveState('casesMap', casesMap); }, [casesMap]);

 // 閿洏蹇嵎閿細Shift+E 瀵煎嚭 JSON锛孲hift+A 娣诲姞娑堟伅锛孲hift+C 娓呯┖鐢诲竷
 React.useEffect(function(){
   function onKey(e){
     if(!e.shiftKey) return;
     const k = (e.key||'').toLowerCase();
     if(k==='e'){
       try{ exportData(); e.preventDefault(); }catch(_){}
     }else if(k==='a'){
       try{ addMessage(); e.preventDefault(); }catch(_){}
     }else if(k==='c'){
       try{ clearAll(); e.preventDefault(); }catch(_){}
     }
   }
   window.addEventListener('keydown', onKey);
  return function(){ window.removeEventListener('keydown', onKey); };
 }, [exportData, addMessage, clearAll]);

 // 鐢诲竷鍙樻洿鏃惰Е鍙戣鏁版洿鏂板洖璋冿紙鑻ュ畾涔夛級
 React.useEffect(function(){
   try{
     if(typeof window.updateCanvasCount === 'function'){
       window.updateCanvasCount(Array.isArray(canvas)?canvas.length:0);
     }
   }catch(_){ }
 }, [canvas]);

 function addAt(m, index){
  var fr = sanitizeRole(m.from_role || (m.from+'$A'), m, 'from');
  var to = sanitizeRole(m.to_role || (m.to+'$A'), m, 'to');
  var u = (typeof uid === 'function') ? uid() : ('auto_' + Date.now());
  var item = {uid:u,msg:m,expanded:true,forceEdit:true,from_role:fr,to_role:to,ie_overrides:{}};
  setCanvas(function(p){
   var a=p.slice();
   if(index==null || index<0 || index>a.length) a.push(item); else a.splice(index,0,item);
   return a;
  });
  if (window.showToast) { window.showToast('Message added; entering edit mode', 'success'); }
 }
 function addAfterSelected(m){
  var idx = canvas.findIndex(function(x){ return x.uid===selected; });
  addAt(m, idx>=0 ? idx+1 : canvas.length);
 }

 // 鎸夎緭鍏ョ殑涓€涓?id 鎵归噺鍒涘缓 Case锛堜繚鎸佽緭鍏ラ『搴忥級
 function createCaseByIdsFromText(){
   try{
     var raw = String(idsText||'');
    var tokens = raw.split(/[\s,;，；、]+/).map(function(s){ return s.trim(); }).filter(Boolean);
     if(!tokens.length){ alert('璇疯緭鍏ヨ嚦灏戜竴涓?id'); return; }
     var addItems = []; var missing = [];
    for(var i=0;i<tokens.length;i++){
      var id = tokens[i]; var m = idMap[id];
      if(!m){ missing.push(id); continue; }
      var fallbackFrom = (m && (m.from_role || m.from)) ? (m.from_role || (m.from+'$A')) : 'Unknown$A';
      var fallbackTo = (m && (m.to_role || m.to)) ? (m.to_role || (m.to+'$A')) : 'Unknown$B';
      var fr = (typeof sanitizeRole==='function') ? sanitizeRole(fallbackFrom, m, 'from') : fallbackFrom;
      var to = (typeof sanitizeRole==='function') ? sanitizeRole(fallbackTo, m, 'to') : fallbackTo;
      var u = (typeof uid === 'function') ? uid() : ('auto_' + Date.now() + '_' + i);
      addItems.push({ uid:u, msg:m, ie_overrides:{}, x:150+Math.random()*300, y:150+Math.random()*200, expanded:true, forceEdit:true, from_role:fr, to_role:to });
    }
     if(addItems.length){
       setCanvas(function(prev){ return prev.concat(addItems); });
       setSelected(addItems[addItems.length-1].uid);
       if(window.showToast){
         window.showToast('Added '+addItems.length+' messages'+(missing.length?('; missing '+missing.length+' ids'):'') , missing.length?'warning':'success');
       }
     }else{
       alert('鏈尮閰嶅埌浠讳綍 id');
     }
   }catch(e){ alert('鎸?ID 鍒涘缓 Case 鍑洪敊: '+((e&&e.message)||e)); }
 }
 function onImport(){
 var parsed = parseJSONAny(text);
 var items = parsed.items; var errors = parsed.errors;
 setTruth(items);
 var totalObj = items.length;
 var skipped = errors.length;
 setImportInfo({total: totalObj+skipped, ok: totalObj, err: skipped, sample: errors.slice(0,5)});
 
 // Show toast notification
 if (window.showToast) {
 if (errors.length === 0) {
 window.showToast(` ${totalObj} `, 'success');
 } else if (totalObj > 0) {
 window.showToast(` ${totalObj} ${errors.length} `, 'warning');
 } else {
 window.showToast(``, 'error');
 }
 }
 }
 function onFile(e){
 var files = (e && e.target && e.target.files) ? e.target.files : null;
 var f = files && files[0]; if(!f) return;
 var r=new FileReader();
 r.onload=function(){ 
 setText(String(r.result||'')); 
 // Show toast notification for file load
 if (window.showToast) {
 window.showToast(` "${f.name}" `, 'success', 2500);
 }
 };
 r.onerror=function(){
 if (window.showToast) {
 window.showToast(``, 'error', 3000);
 }
 };
 r.readAsText(f);
 }
 function rm(id){ 
 setCanvas(function(p){ return p.filter(function(x){return x.uid!==id;}); }); 
 if(selected===id) setSelected(null); 
 
 // Show toast notification
 if (window.showToast) {
 window.showToast('鎿嶄綔鎴愬姛', 'success', 2000);
 }
 }
 function moveFromTo(fromIdx,toIdx){
 setCanvas(function(p){
 var a=p.slice(); if(fromIdx<0 || fromIdx>=a.length) return p;
 var t = Math.max(0, Math.min(toIdx, a.length));
 var it=a[fromIdx]; a.splice(fromIdx,1);
 if(fromIdx < t) t -= 1;
 a.splice(t,0,it); return a;
 });
 
 // Show toast notification for drag and drop
 if (window.showToast && fromIdx !== toIdx) {
 window.showToast('鎿嶄綔鎴愬姛', 'success', 1500);
 }
 }
 function lanes(){
 if(!inst){
 var s = new Set();
 for(var i=0;i<canvas.length;i++){ var c=canvas[i]; s.add(c.msg.from); s.add(c.msg.to); }
 return Array.from(s);
 }else{
 var s2=new Set();
 for(var i=0;i<canvas.length;i++){
 var c2=canvas[i];
 s2.add(sanitizeRole(c2.from_role||c2.msg.from+'$A', c2.msg, 'from'));
 s2.add(sanitizeRole(c2.to_role||c2.msg.to+'$A', c2.msg, 'to'));
 }
 return Array.from(s2);
 }
 }
 const exportMessages = useMemo(function(){ return canvas.map(function(c,i){
  var m=c.msg; var label=(i+1)+' '+(m.message||shortLabel(m));
  var fromLane = inst? sanitizeRole(c.from_role||m.from+'$A', m, 'from') : m.from;
  var toLane = inst? sanitizeRole(c.to_role||m.to+'$A', m, 'to') : m.to;
 return { id:m.id, from:fromLane, to:toLane, label:label,
  info:{ header:{msg:(m.message||shortLabel(m)),protocol:m.protocol,interface:m.interface||inferInterface(m.protocol||''),release:m.release||'',id:m.id||''}, payload:derivePayload(m.ie_tree||[], m.ie_dict||{}, c.ie_overrides||{}),
  primary_ref:m.primary_ref, ie_tree:m.ie_tree||[], ie_dict:m.ie_dict||{}, doc:m.doc||{},
  overrides:c.ie_overrides||{}, roles:{instance_mode:inst, from_role:fromLane,to_role:toLane, bindings:bindings, roleset:m.roleset||[], role_display_defaults:(m.role_display_defaults||{}) }
  }
  };
  }); }, [canvas,inst,bindings]);

  // Expose current lanes() and exportMessages to window for StyleA bridge
  React.useEffect(function(){
    try{
      window.lanes = lanes;
      window.exportMessages = exportMessages;
    }catch(e){}
  }, [exportMessages, lanes]);

 function exportData(){
 try{
 // 缁勮瀵煎嚭鏁版嵁锛岄伩鍏嶄笌鍑芥暟鍚嶅悓鍚嶇殑鍙橀噺閬斀
 const data = {
  nodes: lanes(),
  messages: exportMessages,
  bindings: bindings,
  timestamp: new Date().toISOString(),
  version: '5GC Truth Base v4.1'
  };
 
 // JSON 瀛楃涓? const jsonString = JSON.stringify(data, null, 2);
 
 // Blob
 const blob = new Blob([jsonString], { type: 'application/json' });
 
 // 
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = '5gc-truth-base-export-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
 
 // 
 document.body.appendChild(link);
 link.click();
 
 // 
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
 
  alert('Data exported successfully!');
 }catch(e){ 
  alert('Export error: '+((e&&e.message)||e)); 
 }
 }

 // Export only the selected message(s) as a compact Case JSON
 function exportCaseSelected(){
  try{
   const ts = new Date().toISOString();
   const selUid = selected;
   const items = canvas.filter(c => !selUid || c.uid===selUid);
   if(items.length===0){ alert('Please select messages to export'); return; }
   const inst = Boolean(window && typeof lanes==='function' && lanes() && lanes().length);
   const exportMsgs = items.map(function(c,i){
     var m=c.msg; var label=(i+1)+' '+(m.message||shortLabel(m));
     var fromLane = inst? sanitizeRole(c.from_role||m.from+'$A', m, 'from') : m.from;
     var toLane = inst? sanitizeRole(c.to_role||m.to+'$A', m, 'to') : m.to;
     return { id:m.id, from:fromLane, to:toLane, label:label,
        info:{ header:{msg:(m.message||shortLabel(m)),protocol:m.protocol,interface:m.interface||'',release:m.release||'',id:m.id||''}, payload:derivePayload(m.ie_tree||[], m.ie_dict||{}, c.ie_overrides||{}) },
        primary_ref:m.primary_ref, ie_tree:m.ie_tree||[], ie_dict:m.ie_dict||{}, doc:m.doc||{},
        overrides:c.ie_overrides||{}, roles:{instance_mode:inst, from_role:fromLane,to_role:toLane, bindings:bindings, roleset:m.roleset||[], role_display_defaults:(m.role_display_defaults||{}) }
      };
   });
   const safeName = String(caseName||'').trim().slice(0,50).replace(/[^a-zA-Z0-9._-]+/g,'_');
   const caseData = { name: (caseName||''), nodes: lanes(), messages: exportMsgs, bindings: bindings, timestamp: ts, version: '5GC Case v1' };
   const jsonString = JSON.stringify(caseData, null, 2);
   const blob = new Blob([jsonString], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = '5gc-case-' + (safeName? safeName+'-' : '') + ts.slice(0,19).replace(/:/g,'-') + '.json';
   document.body.appendChild(link);
   link.click();
   document.body.removeChild(link);
   URL.revokeObjectURL(url);
   alert('Case exported successfully');
  }catch(e){ alert('Export case error: '+((e&&e.message)||e)); }
 }

 // Import Case JSON (paste JSON) and add messages to canvas
 function importCase(){
  try{
   const txt = prompt('Paste Case JSON content:');
   if(!txt) return;
   const data = JSON.parse(txt);
   const name = (data && (data.name || data.caseName)) || '';
   if(name){ try{ setCaseName(name); }catch(_){ } }
   const msgs = Array.isArray(data && data.messages) ? data.messages : [];
   if(msgs.length===0){ alert('No messages detected in case'); return; }
   const addItems = msgs.map(function(em){
     const h = (em && em.info && em.info.header) || {};
     const m0 = {
       id: h.id || em.id || ('case_'+Date.now()),
       message: h.msg || em.message || 'Imported Message',
       name: h.msg || em.message || 'Imported Message',
       family: em.family || '5GC',
       protocol: h.protocol || em.protocol || 'NGAP',
       interface: h.interface || em.interface || '',
       type: em.type || 'Custom',
       from: em.from || 'gNB',
       to: em.to || 'AMF',
       release: h.release || em.release || 'Rel-18',
       roleset: (em.roles && em.roles.roleset) || em.roleset || [],
       from_role: (em.roles && em.roles.from_role) || em.from || 'gNB$A',
       to_role: (em.roles && em.roles.to_role) || em.to || 'AMF$A',
       primary_ref: em.primary_ref || {},
       doc: em.doc || {},
       ie_tree: em.ie_tree || ((em.info && em.info.ie_tree) || []),
       ie_dict: em.ie_dict || ((em.info && em.info.ie_dict) || {})
     };
     return {
       uid: 'case_'+Math.random().toString(36).slice(2),
       msg: m0,
       ie_overrides: em.overrides || ((em.info && em.info.overrides) || {}),
       x: 120 + Math.random()*280,
       y: 120 + Math.random()*160,
       expanded: true,
       forceEdit: true
     };
   });
   setCanvas(prev=> prev.concat(addItems));
   if(window.showToast){ window.showToast('Case imported: '+addItems.length+' messages', 'success'); }
   else{ alert('Case imported: '+addItems.length+' messages'); }
  }catch(e){ alert('Import Case 鍑洪敊: '+((e&&e.message)||e)); }
 }

 function copyOut(){
 try{
 var code='const nodes = ' + JSON.stringify(lanes(),null,2) + '\\n\\nconst messages = ' + JSON.stringify(exportMessages,null,2);
 if(navigator.clipboard && navigator.clipboard.writeText){
 navigator.clipboard.writeText(code).then(function(){ alert('Copied to clipboard.'); }).catch(function(){ alert('Copy failed.'); });
 }else{ alert('Clipboard API not available in this context.'); }
 }catch(e){ alert('Copy error: '+((e&&e.message)||e)); }
 }

 function clearAll() {
 try {
 // ?
 if (canvas.length > 0) {
 const confirmed = confirm('Are you sure you want to clear all messages from the canvas?');
 if (!confirmed) return;
 }
 
 // ?
 setCanvas([]);
 setSelected(null);
 setDragIdx(null);
 
 // 
 if (canvas.length > 0) {
 alert('Canvas cleared successfully!');
 }
 } catch (e) {
 alert('Clear error: ' + ((e && e.message) || e));
 }
 }



function addMessage(){
  const timestamp = Date.now();
  const messageId = `msg_${timestamp}`;
  const protocol = 'NGAP';
  const fromEntity = 'gNB';
  const toEntity = 'AMF';
  const newMessage = {
    id: messageId,
    message: 'New Message',
    name: 'New Message',
    family: '5GC',
    protocol: protocol,
    interface: 'N2',
    type: 'Custom',
    from: fromEntity,
    to: toEntity,
    release: 'Rel-18',
    roleset: [fromEntity+'$A', toEntity+'$A'],
    from_role: fromEntity+'$A',
    to_role: toEntity+'$A',
    primary_ref: { ts: '', section: '', version: '', release: 'Rel-18', ref: '' },
    doc: { summary_en: '', comment_md: '', title: '' },
    ie_tree: [],
    ie_dict: {}
  };
  const newItem = {
    uid: 'auto_' + timestamp,
    msg: newMessage,
    ie_overrides: {},
    x: 150 + Math.random() * 300,
    y: 150 + Math.random() * 200,
    expanded: true,
    forceEdit: true
  };
  setCanvas(prev => [...prev, newItem]);
  setSelected(newItem.uid);
  if(window.showToast){ window.showToast('Added new message, entering edit mode', 'success'); }
}

 function resetState(){
 if(confirm('纭閲嶇疆鍏ㄩ儴鐘舵€佸苟娓呯┖鐢诲竷鍚楋紵')){
 // localStorage
 localStorage.removeItem('5gc_app_state');
 
 // ?
 setTab('build');
 setText('');
 setTruth([]);
 setImportInfo(null);
 setSearch('');
 setCanvas([]);
 setSelected(null);
 setInst(false);
 setCompactMode(false);
 setGroupMode(false);
 setCurrentPage(0);
 setBindings({});
 
 // ?
 if(window.showToast){
 window.showToast('閲嶇疆瀹屾垚', 'success');
 }else{
 alert('鎻愮ず');
 }
 }
 }

 function validateJSONL(jsonlText){
 try{
 const lines = String(jsonlText||'').split(/\r?\n/);
 const errors = [];
 const validItems = [];
 
 for(let i = 0; i < lines.length; i++){
 const line = lines[i].trim();
 if(!line) continue; // 
 
 // JSON
 if(line[0] !== '{' || line[line.length-1] !== '}'){
 errors.push({line: i+1, error: 'Invalid JSON format - must start with { and end with }'});
 continue;
 }
 
 try{
 const parsed = JSON.parse(line);
 
 // 
 if(!parsed.id && !parsed.schema_version){
 errors.push({line: i+1, error: 'Missing required field: id or schema_version'});
 continue;
 }
 
 // 
 if(typeof parsed !== 'object' || parsed === null){
 errors.push({line: i+1, error: 'Parsed content is not a valid object'});
 continue;
 }
 
 validItems.push(parsed);
 }catch(parseError){
 errors.push({line: i+1, error: 'JSON parse error: ' + (parseError.message || 'Unknown error')});
 }
 }
 
 return {
 valid: errors.length === 0,
 validItems: validItems,
 errors: errors,
 totalLines: lines.length,
 validCount: validItems.length,
 errorCount: errors.length
 };
 }catch(e){
 return {
 valid: false,
 validItems: [],
 errors: [{line: 0, error: 'Unexpected validation error: ' + (e.message || 'Unknown error')}],
 totalLines: 0,
 validCount: 0,
 errorCount: 1
 };
 }
 }

 return (<div className="min-h-screen bg-zinc-900 animate-float"></div>);/*
  {/* 绯荤粺鏍?- 鐜颁唬鍖栬璁?*/}
  <div className="bg-gradient-to-r from-zinc-900/95 to-zinc-800/95 border-b border-zinc-700/60 backdrop-blur-xl px-6 py-3 shadow-lg shadow-black/10 hover-lift">
   <div className="flex items-center justify-between">
    <div className="flex items-center gap-6">
     <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 ring-1 ring-blue-400/20">
       <span className="text-white text-sm font-bold">5G</span>
      </div>
      <span className="text-white font-semibold text-lg tracking-tight">CallFlowWeaver</span>
     </div>
    <div className="flex items-center gap-2 text-sm">
     <button className={"group relative px-5 py-2.5 rounded-xl font-medium transition-all duration-300 transform flex items-center gap-2 " + (tab==='build'?'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105 ring-1 ring-blue-400/30':'text-zinc-300 hover:text-white hover:bg-gradient-to-r hover:from-zinc-700/80 hover:to-zinc-600/80 hover:scale-105 hover:shadow-lg hover:shadow-black/20 active:scale-95')} onClick={()=>setTab('build')}>
      <Icon name="build" size={16} className="transition-transform duration-300 group-hover:scale-110" />
      Build
      {tab==='build' && <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-blue-500/20 rounded-xl animate-pulse"></div>}
     </button>
     <button className={"group relative px-5 py-2.5 rounded-xl font-medium transition-all duration-300 transform flex items-center gap-2 " + (tab==='generate'?'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-105 ring-1 ring-emerald-400/30':'text-zinc-300 hover:text-white hover:bg-gradient-to-r hover:from-zinc-700/80 hover:to-zinc-600/80 hover:scale-105 hover:shadow-lg hover:shadow-black/20 active:scale-95')} onClick={()=>setTab('generate')}>
      <Icon name="generate" size={16} className="transition-transform duration-300 group-hover:scale-110" />
      Generate
      {tab==='generate' && <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-emerald-500/20 rounded-xl animate-pulse"></div>}
     </button>
     <button className={"group relative px-5 py-2.5 rounded-xl font-medium transition-all duration-300 transform flex items-center gap-2 " + (tab==='settings'?'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 scale-105 ring-1 ring-purple-400/30':'text-zinc-300 hover:text-white hover:bg-gradient-to-r hover:from-zinc-700/80 hover:to-zinc-600/80 hover:scale-105 hover:shadow-lg hover:shadow-black/20 active:scale-95')} onClick={()=>setTab('settings')}>
      <Icon name="settings" size={16} className="transition-transform duration-300 group-hover:scale-110" />
      Settings
      {tab==='settings' && <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-purple-500/20 rounded-xl animate-pulse"></div>}
     </button>
    </div>
   </div>
   <div className="flex items-center gap-6 text-sm">
    <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50 backdrop-blur-sm">
     <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
      <span className="text-zinc-300 font-medium">Truth:</span>
      <span className="text-white font-semibold">{Array.isArray(truth)?truth.length:0}</span>
     </div>
     <div className="w-px h-4 bg-zinc-600"></div>
     <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
      <span className="text-zinc-300 font-medium">Canvas:</span>
      <span className="text-white font-semibold">{Array.isArray(canvas)?canvas.length:0}</span>
     </div>
    </div>
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
     <Icon name="clock" size={16} className="text-zinc-400" />
     <span className="text-xs text-zinc-400 font-mono">
      {new Date().toLocaleString()}
     </span>
    </div>
   </div>
  </div>

  {/* 涓诲唴瀹瑰尯鍩?- 浼樺寲闂磋窛鍜屽懠鍚告劅 */}
  <div className="flex-1 overflow-hidden">
  {tab==='build' && (
   <div className="h-full flex flex-col">
    {/* Build椤甸潰鏍囬鏍?- 绠€鍖栬璁?*/}
    <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-6 py-4">
    <div className="flex items-center gap-4">
     <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-400/30">
      <Icon name="layers" size={20} className="text-blue-400" />
     </div>
     <div>
      <div className="text-lg font-semibold text-white">Build Flow Canvas</div>
      <div className="text-sm text-zinc-400">鏋勫缓鍜岀鐞嗘秷鎭祦鐢诲竷</div>
     </div>
    </div>
    <div className="flex items-center gap-6">
     <div className="flex items-center gap-4">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10" title="Instance lanes: map From/To to role instances; affects export and preview">
       <span className="text-sm text-zinc-300 font-medium">Instance lanes</span>
       <div className={"toggle "+(inst?'on':'')} onClick={()=>setInst(v=>!v)}></div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10" title="Global edit mode: expand cards and show editable forms">
       <span className="text-sm text-zinc-300 font-medium">Global Edit</span>
       <div className={"toggle "+(globalEditMode?'on':'')} onClick={()=>setGlobalEditMode(v=>{ const next=!v; if(!next){ try{ setCanvas(prev=> Array.isArray(prev)? prev.map(ci=> ({...ci, forceEdit:false})) : prev); }catch(_){ } } return next; })}></div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10" title="绱у噾妯″紡锛氬噺灏忓崱鐗囧唴杈硅窛鍜屽瓧鍙凤紝渚夸簬瀵嗛泦娴忚">
        <span className="text-sm text-zinc-300 font-medium">Compact Mode</span>
        <div className={"toggle "+(compactMode?'on':'')} onClick={()=>setCompactMode(v=>!v)}></div>
       </div>
     </div>
      <div className="w-px h-6 bg-white/20"></div>
      <div className="flex items-center gap-4">
        {/* 娑堟伅璁℃暟涓庢粴鍔ㄥ埌鐢诲竷 */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10" title="Current canvas message count">
         <span className="text-sm text-zinc-300 font-medium">Count:</span>
         <span className="text-white font-bold" aria-label="CanvasMessageCount">{Array.isArray(canvas)?canvas.length:0}</span>
         <IconButton icon="arrow-down" size="xs" aria-label="ScrollToCanvas" title="Scroll to canvas" onClick={()=>{
           try{
             const el = document.getElementById('flow-canvas-root');
             if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); }
           }catch(_){ }
         }} />
       </div>
       <div className="flex items-center gap-2">
         <IconButton icon="plus" title="Add Message" onClick={addMessage} />
         <IconButton icon="trash" title="Clear Canvas" onClick={clearAll} />
         <IconButton icon="refresh" title="Reset State" onClick={resetState} />
       </div>
      </div>
     </div>
   </div>
   {/* Build椤甸潰涓昏鍐呭鍖哄煙 */}
   <div className="flex-1 overflow-hidden">
     <BuildPane
     text={text} setText={setText}
     fileRef={fileRef}
     onFile={onFile} onImport={onImport}
     byProto={byProto}
     search={search} setSearch={setSearch}
     addAfterSelected={addAfterSelected}
     importInfo={importInfo}
     canvas={canvas} setCanvas={setCanvas}
     selected={selected} setSelected={setSelected}
     inst={inst} rm={rm}
     dragIdx={dragIdx} setDragIdx={setDragIdx}
     moveFromTo={moveFromTo}
     addAt={addAt}
     globalEditMode={globalEditMode}
     lanesFn={lanes}
     bindings={bindings} setBindings={setBindings}
     caseName={caseName} setCaseName={setCaseName}
     casesMap={casesMap} setCasesMap={setCasesMap}
     compactMode={compactMode}
     groupMode={false}
     currentPage={currentPage} setCurrentPage={setCurrentPage}
     itemsPerPage={itemsPerPage}
     exportData={exportData}
     exportCaseSelected={exportCaseSelected}
     importCase={importCase}
     idsText={idsText} setIdsText={setIdsText}
     createCaseByIdsFromText={createCaseByIdsFromText}
     setTab={setTab}
   />
  </div>
 )}

 {tab==='generate' && (
  <div className="flex-1 overflow-hidden">
   <div className="grid grid-cols-12 gap-6 h-full p-6">
    <div className="col-span-7 space-y-4">
     <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
       <div className="font-semibold text-zinc-100 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-400/30">
         <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
         </svg>
        </div>
        Preview Export: const nodes/messages       </div>
       <div className="flex items-center gap-2">
        <IconButton icon="export" title="Export JSON" onClick={exportData} />
        <IconButton icon="copy" title="Copy" onClick={copyOut} />
       </div>
      </div>
      <textarea readOnly className="flex-1 bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50 resize-none backdrop-blur-sm shadow-inner" placeholder="Read-only: after build, use this area to export/copy" value={'const nodes = ' + JSON.stringify(lanes(),null,2) + '\n\nconst messages = ' + JSON.stringify(exportMessages,null,2)}></textarea>
     </div>
    </div>
    <div className="col-span-5 space-y-4" id="flow-canvas-root">
     <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
      <div className="font-medium text-zinc-100">Role bindings</div>
      <RoleBindings bindings={bindings} setBindings={setBindings} truth={truth} canvas={canvas}/>
     </div>
     <CanvasPane canvas={canvas} setCanvas={setCanvas} selected={selected} setSelected={setSelected}
   inst={inst} rm={rm}
   dragIdx={dragIdx} setDragIdx={setDragIdx}
   moveFromTo={moveFromTo}
   compactMode={compactMode} groupMode={false} currentPage={currentPage} setCurrentPage={setCurrentPage}
   itemsPerPage={itemsPerPage} globalEditMode={globalEditMode}/>
    </div>
   </div>
  </div>
 )}

 {tab==='settings' && (
  <div className="flex-1 overflow-hidden">
   <div className="grid grid-cols-12 gap-6 h-full p-6">
    <div className="col-span-7 space-y-4">
     <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
       <div className="text-sm font-semibold text-zinc-100 flex items-center gap-3">
         <div className="p-2 rounded-lg bg-green-500/20 border border-green-400/30">
           <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
           </svg>
         </div>
         Input Source: JSONL / JSON       </div>
       <div className="text-xs text-zinc-300 bg-zinc-800/30 rounded-lg p-3 border-l-4 border-green-400/50">Paste JSONL/JSON text or choose a file as input. Case name is used for export filename.</div>
       <div className="grid grid-cols-12 gap-3">
         <div className="col-span-7">
           <input className="bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400/50 w-full transition-all duration-200 backdrop-blur-sm" placeholder="Case name (optional)" value={caseName} onChange={e=>setCaseName(e.target.value)} />
         </div>
         <div className="col-span-5 flex items-center gap-2">
           <IconButton icon="folder" title="Choose file" onClick={()=>fileRef.current && fileRef.current.click()} />
           <input ref={fileRef} type="file" className="hidden" accept=".jsonl,.json,.*" onChange={onFile}/>
         </div>
       </div>
       <textarea className="bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400/50 min-h-[180px] leading-6 w-full resize-none transition-all duration-200 backdrop-blur-sm shadow-inner" placeholder="Paste JSONL/JSON text or choose a file..." value={text} onChange={e=>setText(e.target.value)}></textarea>
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           <IconButton icon="import" primary size="sm" title="Import" onClick={()=>onImport()} className="" disabled={!text || !text.trim()} />
           <div className="text-xs text-zinc-400">Tip: one JSON object per line; starts with {'{'} and ends with {'}' }.</div>
         </div>
         
       </div>
     
      </div>
     </div>
     <div className="col-span-5 space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
       <div className="font-medium text-zinc-100">Case Import / Export</div>
       <div className="flex items-center gap-2">
        <IconButton icon="export" title="Export Case" onClick={exportCaseSelected} />
        <IconButton icon="import" title="Import Case" onClick={importCase} />
       </div>
       <div className="text-xs text-zinc-400">瀵煎叆/瀵煎嚭褰撳墠鐢诲竷鐨?Case锛堣嫢閫変腑鍗＄墖鍒欎粎瀵煎嚭璇ュ崱鐗囷級銆?/div>
      </div>
     </div>
    </div>
   </div>
  )}
  
  {/* Toast removed temporarily to isolate JSX parsing * /}}
 */
};

/* function BuildPane(props){
  // NOTE: temporarily avoid multi-line destructuring to isolate Babel parse state
  const pack = props;

  // 安全回退：如存在内部代码直接引用 compactMode，统一映射到 isCompact
  const isCompact = (typeof cmpMode !== 'undefined') ? cmpMode : false;
  // 映射别名，保持变量语义清晰
  const compactMode = isCompact;
  try{ console.log('[BuildPane] isCompact:', isCompact, 'alias compactMode typeof:', typeof compactMode); }catch(_){}

 // DnD helpers
 function onDragStartLeft(e, m){
 e.stopPropagation();
 e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'left', id:m.id}));
 e.dataTransfer.effectAllowed='copy';
 try{ window.__dragFromLeftId = m.id; }catch(_){ }
 }
 function onDragStartRight(e, uid){
 e.stopPropagation();
 e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'right', uid}));
 e.dataTransfer.effectAllowed='move';
 }
 function onDropAt(index, e){
 e.preventDefault(); e.stopPropagation();
 const raw = e.dataTransfer.getData('application/x-5gc'); setDragIdx(null);
 if(!raw) return;
 try{
 const data = JSON.parse(raw);
 if(data.src==='left'){
 const arrays = Object.values(byProto);
 let merged = [];
 for(let i=0;i<arrays.length;i++){ merged = merged.concat(arrays[i]); }
 const m = merged.find(x=>x.id===data.id);
 if(m) addAt(m, index);
 }else if(data.src==='right'){
 const from = canvas.findIndex(x=>x.uid===data.uid);
 if(from>=0) moveFromTo(from, index);
 }
 }catch(_){}
 }
 function handleDrop(e){
 e.preventDefault(); e.stopPropagation();
 const raw = e.dataTransfer.getData('application/x-5gc');
 if(!raw) return;
 try{
 const data = JSON.parse(raw);
 if(data.src==='left'){
 const arrays = Object.values(byProto);
 let merged = [];
 for(let i=0;i<arrays.length;i++){ merged = merged.concat(arrays[i]); }
 const m = merged.find(x=>x.id===data.id);
 if(m) addAt(m, canvas.length);
 }else if(data.src==='right'){
 const from = canvas.findIndex(x=>x.uid===data.uid);
 if(from>=0) moveFromTo(from, canvas.length);
 }
 }catch(_){}
 }

  // 瀵煎叆鍏ュ彛宸茶縼绉昏嚦 Settings

  function canvasToCaseMessages(){
    const instMode = Boolean(window && typeof lanesFn==='function' && lanesFn() && lanesFn().length);
    return canvas.map(function(c,i){
      var m=c.msg; var label=(i+1)+' '+(m.message||shortLabel(m));
      var fromLane = instMode? sanitizeRole(c.from_role||m.from+'$A', m, 'from') : m.from;
      var toLane = instMode? sanitizeRole(c.to_role||m.to+'$A', m, 'to') : m.to;
      return { id:m.id, from:fromLane, to:toLane, label:label,
        info:{ header:{msg:(m.message||shortLabel(m)),protocol:m.protocol,interface:m.interface||'',release:m.release||'',id:m.id||''}, payload:{} },
        primary_ref:m.primary_ref, ie_tree:m.ie_tree||[], ie_dict:m.ie_dict||{}, doc:m.doc||{},
        overrides:c.ie_overrides||{}, roles:{instance_mode:instMode, from_role:fromLane,to_role:toLane, bindings:bindings, roleset:m.roleset||[], role_display_defaults:(m.role_display_defaults||{}) }
      };
    });
  }

  function exportCaseAll(){
    try{
      const ts = new Date().toISOString();
      const safeName = String(caseName||'').trim().slice(0,50).replace(/[^a-zA-Z0-9._-]+/g,'_');
      const caseData = { name: (caseName||''), nodes: (typeof lanesFn==='function')? lanesFn():[], messages: canvasToCaseMessages(), bindings: bindings, timestamp: ts, version: '5GC Case v1' };
      const jsonString = JSON.stringify(caseData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '5gc-case-' + (safeName? safeName+'-' : '') + ts.slice(0,19).replace(/:/g,'-') + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
   alert('Case exported successfully');
 }catch(e){ alert('Export case error: '+((e&&e.message)||e)); }
  }

  function importCaseData(data){
    try{
      const name = (data && (data.name || data.caseName)) || '';
      if(name){ try{ setCaseName(name); }catch(_){ } }
      const msgs = Array.isArray(data && data.messages) ? data.messages : [];
      if(msgs.length===0){ alert('No messages detected in case'); return; }
      const addItems = msgs.map(function(em){
        const h = (em && em.info && em.info.header) || {};
        const m0 = {
          id: h.id || em.id || ('case_'+Date.now()),
          message: h.msg || em.message || 'Imported Message',
          name: h.msg || em.message || 'Imported Message',
          family: em.family || '5GC',
          protocol: h.protocol || em.protocol || 'NGAP',
          interface: h.interface || em.interface || '',
          type: em.type || 'Custom',
          from: em.from || 'gNB',
          to: em.to || 'AMF',
          release: h.release || em.release || 'Rel-18',
          roleset: (em.roles && em.roles.roleset) || em.roleset || [],
          from_role: (em.roles && em.roles.from_role) || em.from || 'gNB$A',
          to_role: (em.roles && em.roles.to_role) || em.to || 'AMF$A',
          primary_ref: em.primary_ref || {},
          doc: em.doc || {},
          ie_tree: em.ie_tree || ((em.info && em.info.ie_tree) || []),
          ie_dict: em.ie_dict || ((em.info && em.info.ie_dict) || {})
        };
        return {
          uid: 'case_'+Math.random().toString(36).slice(2),
          msg: m0,
          ie_overrides: em.overrides || ((em.info && em.info.overrides) || {}),
          x: 120 + Math.random()*280,
          y: 120 + Math.random()*160,
          expanded: true,
          forceEdit: true
        };
      });
      setCanvas(prev=> prev.concat(addItems));
      if(window.showToast){ window.showToast('Case 瀵煎叆瀹屾垚锛?+addItems.length+' 鏉℃秷鎭?, 'success'); }
      else{ alert('Case 瀵煎叆瀹屾垚锛?+addItems.length+' 鏉℃秷鎭?); }
    }catch(e){ alert('瀵煎叆 Case 鍑洪敊锛?+((e&&e.message)||e)); }
  }

  function saveCase(){
    try{
      const nm = String(caseName||'').trim() || prompt('Enter a new case name');
      if(!nm){ alert('Please enter a valid name'); return; }
      const ts = new Date().toISOString();
      const data = { name:nm, nodes:(typeof lanesFn==='function')? lanesFn():[], messages:canvasToCaseMessages(), bindings:bindings, timestamp:ts, version:'5GC Case v1' };
      setCasesMap(function(prev){ var m=Object.assign({}, prev||{}); m[nm]=data; return m; });
      alert('Case saved: '+nm);
    }catch(e){ alert('Save case error: '+((e&&e.message)||e)); }
  }

  function loadCase(nm){
    try{
      const data = casesMap && casesMap[nm];
      if(!data){ alert('Case not found: '+nm); return; }
      setCaseName(data.name||nm);
      if(data.bindings){ try{ setBindings(data.bindings); }catch(_){} }
      const msgs = Array.isArray(data.messages)? data.messages : [];
      const addItems = msgs.map(function(em){
        const h = (em && em.info && em.info.header) || {};
        const m0 = {
          id: h.id || em.id || ('case_'+Date.now()),
          message: h.msg || em.message || 'Imported Message',
          name: h.msg || em.message || 'Imported Message',
          family: em.family || '5GC',
          protocol: h.protocol || em.protocol || 'NGAP',
          interface: h.interface || em.interface || '',
          type: em.type || 'Custom',
          from: em.from || 'gNB',
          to: em.to || 'AMF',
          release: h.release || em.release || 'Rel-18',
          roleset: (em.roles && em.roles.roleset) || em.roleset || [],
          from_role: (em.roles && em.roles.from_role) || em.from || 'gNB$A',
          to_role: (em.roles && em.roles.to_role) || em.to || 'AMF$A',
          primary_ref: em.primary_ref || {},
          doc: em.doc || {},
          ie_tree: em.ie_tree || ((em.info && em.info.ie_tree) || []),
          ie_dict: em.ie_dict || ((em.info && em.info.ie_dict) || {})
        };
        return {
          uid: 'case_'+Math.random().toString(36).slice(2),
          msg: m0,
          ie_overrides: em.overrides || ((em.info && em.info.overrides) || {}),
          x: 120 + Math.random()*280,
          y: 120 + Math.random()*160,
          expanded: true,
          forceEdit: true
        };
      });
      setCanvas(addItems);
      try{ setSelected(addItems.length? addItems[addItems.length-1].uid : null); }catch(_){}
      alert('宸插姞杞?Case锛?+(data.name||nm)+'锛?+addItems.length+' 鏉℃秷鎭級');
    }catch(e){ alert('鍔犺浇 Case 鍑洪敊锛?+((e&&e.message)||e)); }
  }

  function deleteCase(nm){
    try{
      const ok = confirm('纭鍒犻櫎 Case锛?+nm+'锛?);
      if(!ok) return;
      setCasesMap(function(prev){ var m=Object.assign({}, prev||{}); delete m[nm]; return m; });
      alert('宸插垹闄?Case锛?+nm);
    }catch(e){ alert('鍒犻櫎 Case 鍑洪敊锛?+((e&&e.message)||e)); }
  }

  return (
    <div className="flex h-full gap-6 p-6">
     {/* 宸︿晶锛氭秷鎭簱妫€绱㈤潰鏉?*/}
     <div className="w-80 flex flex-col space-y-4">
     <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 backdrop-blur-sm shadow-lg">
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <div className="p-2.5 rounded-lg bg-blue-500/20 border border-blue-400/30">
          <Icon name="database" size={20} className="text-blue-400" />
        </div>
        <div className="text-base font-semibold text-white">Message Library Search</div>
      </div>
      <div className="text-xs text-zinc-300 bg-zinc-800/40 rounded-lg p-4 border-l-4 border-blue-400/50">
        Import entry moved to Settings. Please go to Settings to paste JSONL or choose a file.
      </div>
      <div className="flex items-center gap-3">
        <IconButton icon="import" title="Goto Settings to import" onClick={()=>{ try{ (setTab||props.setTab)('settings'); }catch(_){ } }} />
        <input className="input flex-1 text-sm bg-white/5 border-white/10" placeholder="Search message name..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      {importInfo && (
        <div className={"text-xs px-4 py-3 rounded-lg border "+(importInfo.err?"text-amber-300 bg-amber-500/10 border-amber-400/30":"text-emerald-300 bg-emerald-500/10 border-emerald-400/30")}>
          Imported {importInfo.ok} objects. Skipped {importInfo.err}.
        </div>
      )}
     </div>
     <div className="flex-1 overflow-auto space-y-3 pr-2">
      {Object.entries(byProto).map(([proto, items])=>{
       const filtered = items.filter(m=>(m.message||m.id).toLowerCase().indexOf(search.toLowerCase())>=0);
       return (
        <div key={proto} className="bg-white/5 border border-white/10 rounded-xl shadow-sm">
         <details open>
          <summary className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5 rounded-t-xl border-b border-white/10 transition-all duration-200">
           <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></div>
            <span className="font-semibold text-white text-sm">{proto}</span>
           </div>
           <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-500/20 border border-blue-400/30 px-3 py-1.5 rounded-full text-blue-300 font-medium">{filtered.length}</span>
           </div>
          </summary>
          <div className="p-4 space-y-2">
           {filtered.map((m, i)=> (
            <div key={m.id} className="group flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-200 leftitem shadow-sm hover:shadow-md"
             draggable onDragStart={(e)=>onDragStartLeft(e,m)} role="button" aria-label={"LeftItem "+i} data-id={String(m.id)}
             onClick={()=>{ try{ window.__dragFromLeftId = m.id; }catch(_){ } }}>
             <div className="text-sm truncate min-w-0 flex-1" title={m.id}>
              <div className="font-semibold text-white truncate mb-2 text-sm">{m.message||shortLabel(m)}</div>
              <div className="text-xs text-zinc-400 truncate flex items-center gap-2">
                <span className="px-2.5 py-1 bg-zinc-700/50 rounded-md text-zinc-300 font-medium">{m.from}</span>
                <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="px-2.5 py-1 bg-zinc-700/50 rounded-md text-zinc-300 font-medium">{m.to}</span>
                <span className="text-zinc-500">鈥?/span>
                <span className="text-zinc-400 font-medium">{m.release}</span>
              </div>
             </div>
             <div className="opacity-0 group-hover:opacity-100 transition-all duration-200">
              <IconButton icon="plus" title="Add" onClick={()=>addAfterSelected(m)} />
             </div>
            </div>
           ))}
           {filtered.length===0 && <div className="text-xs text-zinc-400 px-6 py-8 text-center italic bg-white/5 rounded-lg border border-white/10">
             <div className="text-3xl mb-3">馃攳</div>
             <div className="font-medium">No matches found</div>
           </div>}
          </div>
         </details>
        </div>
       );
      })}
      {Object.keys(byProto).length===0 && <div className="text-sm text-zinc-400 px-8 py-16 text-center bg-white/5 rounded-xl border border-white/10">
       <div className="text-5xl mb-6 opacity-50">馃搧</div>
       <div className="font-semibold text-zinc-300 mb-3 text-base">No Data Available</div>
       <div className="text-xs text-zinc-500">Import a truth base to start building flows</div>
      </div>}
     </div>
     </div>

     {/* 涓棿锛欳ase 绠＄悊闈㈡澘 */}
     <div className="w-80 flex flex-col space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-500/20 border border-green-400/30">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="font-semibold text-white text-base">Case 绠＄悊</div>
          </div>
          <IconButton icon="export" title="Save Case" onClick={saveCase} />
        </div>
        <div className="space-y-4">
          <input className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400/50 w-full transition-all duration-200 backdrop-blur-sm shadow-sm" placeholder="Case 鍚嶇О" value={caseName} onChange={e=>setCaseName(e.target.value)} />
          <div className="flex items-center gap-3">
            <input className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400/50 flex-1 transition-all duration-200 backdrop-blur-sm shadow-sm" placeholder="鎸?ID 鍒涘缓锛氱┖鏍?閫楀彿鍒嗛殧" value={idsText} onChange={(e)=>setIdsText(e.target.value)} />
            <div className="p-2.5 rounded-lg bg-green-500/20 border border-green-400/30 hover:bg-green-500/30 transition-all duration-200 cursor-pointer" onClick={createCaseByIdsFromText} title="Create Case by IDs">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto space-y-3 pr-2">
        {Object.keys(casesMap||{}).length>0 ? (
          Object.keys(casesMap||{}).sort().map(function(nm){
            return (
              <div key={nm} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-200 shadow-sm hover:shadow-md">
                <div className="text-sm font-semibold text-white truncate flex items-center gap-3" title={nm}>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div>
                  <span className="truncate">{nm}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-400/30 hover:bg-blue-500/30 transition-all duration-200 cursor-pointer" onClick={()=>loadCase(nm)} title="Load">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </div>
                  <div className="p-2 rounded-lg bg-red-500/20 border border-red-400/30 hover:bg-red-500/30 transition-all duration-200 cursor-pointer" onClick={()=>deleteCase(nm)} title="Delete">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-zinc-400 px-6 py-12 text-center bg-white/5 rounded-lg border border-white/10">
            <div className="text-4xl mb-4 opacity-50">馃搵</div>
            <div className="font-medium text-zinc-300 mb-2">鏆傛棤宸蹭繚瀛?Case</div>
            <div className="text-zinc-500">鍒涘缓骞朵繚瀛樻偍鐨勭涓€涓祴璇曟渚?/div>
          </div>
        )}
      </div>
     </div>

     {/* 鍙充晶锛欶low Canvas 鐢诲竷 */}
     <div className="flex-1 flex flex-col">
      <CanvasPane inBuild
        canvas={canvas} setCanvas={setCanvas} selected={selected} setSelected={setSelected}
        inst={inst} rm={rm}
        dragIdx={dragIdx} setDragIdx={setDragIdx}
        moveFromTo={moveFromTo}
        onDragStartRight={onDragStartRight}
        onDropAt={onDropAt}
        compactMode={isCompact} groupMode={groupMode}
        currentPage={currentPage} setCurrentPage={setCurrentPage}
        itemsPerPage={itemsPerPage} globalEditMode={globalEditMode}
        onExportJSON={exportData}
        onExportCase={exportCaseSelected}
        onImportCase={importCase}
        caseName={caseName} setCaseName={setCaseName}
        onExportCaseAll={function(){ try{ exportCaseAll(); }catch(_){ } }}
        onImportCaseData={function(data){ try{ importCaseData(data); }catch(_){ } }}
        onDeleteCase={function(name){ try{ deleteCase(name); }catch(_){ } }}
        onNewCase={function(){ try{ setCanvas([]); setSelected(null); setCaseName(''); }catch(_){ } }}
      />
    </div>
   </div>
  );
}

function CanvasPane({inBuild=false, canvas=[], setCanvas, selected, setSelected, inst, rm, dragIdx, setDragIdx, moveFromTo, onDragStartRight, onDropAt, compactMode=false, groupMode=false, currentPage=0, setCurrentPage, itemsPerPage=50, globalEditMode=false, onExportJSON, onExportCase, onImportCase, caseName, setCaseName, onDeleteCase, onImportCaseData, onNewCase, onExportCaseAll}){
 // 
 const groupedCanvas = useMemo(function(){
 if (!groupMode) return [{title: '', items: canvas}];
 
 const groups = {};
 canvas.forEach((item, index) => {
 const protocol = item.msg.protocol || '';
 if (!groups[protocol]) groups[protocol] = [];
 groups[protocol].push({...item, originalIndex: index});
 });
 
 return Object.entries(groups).map(([protocol, items]) => ({
 title: protocol,
 items: items
 }));
 }, [canvas, groupMode]);
 
 // 
 const paginatedGroups = useMemo(function(){
  if (groupMode) {
  const startIdx = currentPage * itemsPerPage;
  return groupedCanvas.map(function(group){
   return {
    ...group,
    items: group.items.slice(startIdx, startIdx + itemsPerPage),
    totalPages: Math.ceil(group.items.length / itemsPerPage),
    currentPage: currentPage
   };
  });
  } else {
  // 
  const startIdx = currentPage * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  return [{
   title: '',
   items: canvas.slice(startIdx, endIdx),
   totalPages: Math.ceil(canvas.length / itemsPerPage),
   currentPage: currentPage
  }];
  }
 }, [groupedCanvas, currentPage, itemsPerPage, groupMode, canvas]);

 // 涓夌偣鑿滃崟鐘舵€佷笌鏂囦欢鎵撳紑澶勭悊
 const [menuOpen, setMenuOpen] = React.useState(false);
 const menuRef = React.useRef(null);
 const fileRefLocal = React.useRef(null);
 React.useEffect(function(){
   function onDocClick(e){ try{ if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }catch(_){ }
   }
   document.addEventListener('click', onDocClick);
   return function(){ document.removeEventListener('click', onDocClick); };
 }, []);
 function onOpenFile(){ try{ if(fileRefLocal.current) fileRefLocal.current.click(); }catch(_){} }
 function onSave(){
   try{
     var nmNow = String(caseName||'').trim();
     if(!nmNow){
       var nm = prompt('Enter case name', '');
       if(nm==null || !String(nm).trim()) return;
       if(setCaseName) setCaseName(String(nm).trim());
     }
     if(typeof onExportCaseAll==='function'){ onExportCaseAll(); setMenuOpen(false); }
   }catch(_){}
 }
 function onSaveAs(){
   try{
     var nm = prompt('Enter a new case name', String(caseName||''));
     if(nm==null) return;
     if(setCaseName) setCaseName(nm);
     if(typeof onExportCaseAll==='function'){ onExportCaseAll(); setMenuOpen(false); }
   }catch(_){}
 }
 function onDelete(){
   try{
     var nm = String(caseName||'').trim();
     if(!nm){ alert('Current case name is empty; cannot delete'); return; }
     if(confirm('Confirm delete case: '+nm+' ?')){ if(onDeleteCase) onDeleteCase(nm); setMenuOpen(false); }
   }catch(_){}
 }
 function onNew(){ try{ if(onNewCase) onNewCase(); setMenuOpen(false); }catch(_){} }
 function onFileChange(e){
   try{
     const f = e.target.files && e.target.files[0];
     if(!f) return;
     const reader = new FileReader();
     reader.onload = function(ev){
       try{
         const data = JSON.parse(String(ev.target.result||''));
         if(onImportCaseData) onImportCaseData(data);
         const name = (data && (data.name || data.caseName)) || '';
         if(name && setCaseName) setCaseName(name);
         setMenuOpen(false);
       }catch(err){ alert('瀵煎叆 Case 鏂囦欢鍑洪敊: '+(((err&&err.message)||err))); }
     };
     reader.readAsText(f);
     try{ e.target.value=''; }catch(_){}
   }catch(_){}
 }
 
 function _onDragStartRight(e, uid){
 if(onDragStartRight){ onDragStartRight(e, uid); return; }
 e.stopPropagation(); e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'right', uid}));
 e.dataTransfer.effectAllowed='move';
 try{ window.__dragFromUid = uid; }catch(_){}
 }
 function _onDropAt(index, e){
 if(onDropAt){ onDropAt(index, e); return; }
 e.preventDefault(); e.stopPropagation();
 }
 
 // 
 function goToPage(page) {
 if (setCurrentPage) setCurrentPage(Math.max(0, page));
 }
 
 function nextPage() {
 const totalPages = paginatedGroups.length > 0 ? paginatedGroups[0].totalPages : 1;
 if (currentPage < totalPages - 1) goToPage(currentPage + 1);
 }
 
 function prevPage() {
 if (currentPage > 0) goToPage(currentPage - 1);
 }
 return (<div className={(inBuild?'col-span-7':'col-span-5')+" space-y-3"}>
 <div className="flex items-center justify-between">
 <div className="text-lg font-medium flex items-center gap-2">
 <span>Flow Canvas</span>
  </div>
 <div className="flex items-center gap-2">
  <div className="relative" ref={menuRef}>
   <button className="btn px-2 py-1" title="Case 绠＄悊鑿滃崟" onClick={function(e){ e.stopPropagation(); setMenuOpen(function(v){ return !v; }); }}>鈰?/button>
   {menuOpen && (
     <div className="absolute right-0 mt-2 w-40 bg-black text-zinc-200 border border-zinc-700 shadow-lg p-2">
       <div className="text-xs text-zinc-400 mb-1">{String(caseName||'鏈懡鍚?)}</div>
       <button className="btn w-full mb-1" onClick={onOpenFile}>open</button>
       <button className="btn w-full mb-1" onClick={onSave}>save</button>
       <button className="btn w-full mb-1" onClick={onSaveAs}>save as</button>
       <button className="btn w-full mb-1" onClick={onDelete}>delete</button>
      <button className="btn w-full" onClick={onNew}>new</button>
    </div>
  )}
  <input type="file" accept="application/json,.json" className="hidden" ref={fileRefLocal} onChange={onFileChange} />
 </div>
 <IconButton icon="export" title="Export JSON" onClick={onExportJSON} disabled={!(canvas.length>0 && typeof onExportJSON==='function')} />
 {canvas.length > 0 && (
  <div className="flex items-center gap-2 text-sm">
 <span className="text-zinc-400"> {paginatedGroups.reduce((sum, g) => sum + g.items.length, 0)} / {canvas.length}</span>
 {paginatedGroups.length > 0 && paginatedGroups[0].totalPages > 1 && (
 <div className="flex items-center gap-1">
 <button className="btn px-2 py-1 text-xs" onClick={prevPage} disabled={currentPage === 0}>Prev</button>
 <span className="text-xs">{currentPage + 1} / {paginatedGroups[0].totalPages}</span>
 <button className="btn px-2 py-1 text-xs" onClick={nextPage} disabled={currentPage >= paginatedGroups[0].totalPages - 1}>Next</button>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 <div className="space-y-1 min-h-[50vh] rounded-2xl border border-zinc-800 p-3 bg-zinc-900/20"
 onDragOver={(e)=>{e.preventDefault(); if(dragIdx===null) setDragIdx(canvas.length);}}
 onDrop={(e)=>{_onDropAt(canvas.length,e);}}>
 {canvas.length===0 && <div className="text-sm text-zinc-500">Drag messages here or click Add</div>}

 {paginatedGroups.map((group, groupIdx) => (
 <React.Fragment key={group.title}>
 {groupMode && (
 <div className="flex items-center justify-between px-2 py-1 bg-zinc-800/40 rounded-lg mb-2">
 <span className="text-sm font-medium text-zinc-300">{group.title}</span>
 <span className="text-xs text-zinc-400">{group.items.length}</span>
 </div>
 )}
 
 {group.items.map((ci, idx) => {
 const actualIdx = groupMode ? ci.originalIndex : (currentPage * itemsPerPage + idx);
 return (
 <React.Fragment key={ci.uid}>
 <DropZone index={actualIdx} active={dragIdx===actualIdx} setActive={setDragIdx} onDrop={_onDropAt}/>
 <CanvasCard ci={ci} idx={actualIdx} selected={selected===ci.uid} setSelected={setSelected}
 inst={inst} rm={rm} onDragStartRight={(e)=>_onDragStartRight(e,ci.uid)}
 compactMode={compactMode} globalEditMode={globalEditMode} onUpdateMessage={(updatedMsg) => {
 setCanvas(prev => prev.map(item => 
 item.uid === ci.uid ? {...item, msg: updatedMsg} : item
 ));
 }}/>
 </React.Fragment>
 );
 })}
 </React.Fragment>
 ))}
 {canvas.length>0 && <DropZone index={canvas.length} active={dragIdx===canvas.length} setActive={setDragIdx} onDrop={_onDropAt}/>}
 </div>
 </div>);
}

 function DropZone({index,active,setActive,onDrop}){
  const counterRef = React.useRef(0);
  return (<div className={"dropzone "+(active?'active':'')}
   role="button" aria-label={"DropZone "+index} data-index={String(index)}
   onDragOver={(e)=>{e.preventDefault(); if(active!==index) setActive(index);}}
   onDragEnter={(e)=>{e.preventDefault(); counterRef.current++; setActive(index);}}
   onDragLeave={(e)=>{counterRef.current--; if(counterRef.current<=0) setActive(null);}}
  onDrop={(e)=>{counterRef.current=0; onDrop(index,e);}}
  onMouseUp={(e)=>{ // 鍏滃簳锛氳嫢鑷姩鍖栨嫋鎷芥湭瑙﹀彂 drop锛屽垯鐢ㄩ紶鏍囨姮璧锋墽琛?   try{
      const uid = window.__dragFromUid;
      const leftId = window.__dragFromLeftId;
      if(uid || leftId){
        if(window.showToast){ window.showToast('DropZone 鐐瑰嚮鍥為€€瑙﹀彂: '+(uid?('uid '+uid):('leftId '+leftId)), 'info', 1200); }
        const payload = uid ? {src:'right', uid} : {src:'left', id:leftId};
        const fake = {
          preventDefault: ()=>{}, stopPropagation: ()=>{}, dataTransfer: {
            getData: ()=> JSON.stringify(payload)
          }
        };
        onDrop(index, fake);
        window.__dragFromUid = null;
        window.__dragFromLeftId = null;
      }
    }catch(_){}
   }}
  />);
 }

function CanvasCard({ci,idx,selected,setSelected,inst,rm,onDragStartRight,compactMode=false,onUpdateMessage,globalEditMode=false}){
 const m=ci.msg;
 const [open,setOpen]=React.useState(Boolean(ci && ci.expanded));

 React.useEffect(function(){
  if(globalEditMode){ setOpen(true); }
 }, [globalEditMode]);
 

 
 const collapsed = (idx+1)+'. '+(m.message||shortLabel(m))+' '+(inst? (ci.from_role||m.from+'$A'):m.from)+' '+(inst? (ci.to_role||m.to+'$A'):m.to);

    return (<div className={"card "+(selected?'selected':'')+(compactMode?' compact':'')} style={{position: 'relative', overflow: 'visible', zIndex: 'auto'}}>
    <div className={(compactMode?"px-2 py-1":"px-3 py-2")+" flex items-center justify-between"}>
    <div className="handle" draggable onDragStart={onDragStartRight} role="button" aria-label={"CardHandle "+idx} data-idx={String(idx)}
     onClick={()=>{ try{ window.__dragFromUid = ci.uid; }catch(_){ } }}>
 <span className="grip" title="Drag to reorder"></span>
 <button className="text-left font-medium" onClick={()=>{ 
 setSelected(ci.uid); 
 setOpen(o=>!o); 
 }}>{collapsed}</button>
 </div>
 <div className="flex items-center gap-1">
 <IconButton icon="trash" title="Remove" onClick={()=>rm(ci.uid)} />
 </div>
 </div>
 {open && (<div className="px-3 py-2">
 <CardBody ci={ci} inst={inst} compactMode={compactMode} onUpdateMessage={onUpdateMessage} globalEditMode={globalEditMode}/>
 </div>)}
 </div>);
}

function CardBody({ci,inst,compactMode=false,onUpdateMessage,globalEditMode=false}){
 const m=ci.msg;
 const [isEditing, setIsEditing] = React.useState(Boolean((ci && ci.forceEdit)) || Boolean(globalEditMode)); 
 React.useEffect(function(){
  setIsEditing(Boolean((ci && ci.forceEdit)) || Boolean(globalEditMode));
 }, [globalEditMode, ci]);
 const [editedMsg, setEditedMsg] = React.useState({...m});
 const [rawText, setRawText] = React.useState(JSON.stringify(m, null, 2));
 function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[c] || c; }); }
 function mdToHtml(md){
  let t = String(md||'');
  t = t.replace(/```([\s\S]*?)```/g, (_, code)=>'<pre><code>'+escapeHtml(code)+'</code></pre>');
  t = t.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  t = t.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  t = t.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\n{2,}/g, '<br/><br/>');
  t = t.replace(/\n/g, '<br/>');
  return t;
 }
 const [jsonError, setJsonError] = React.useState('');
 
 // - 
 const DEBUG_FORCE_SHOW_EDIT = false;
 
 const summary = (m.doc && m.doc.summary_en) ? m.doc.summary_en : '(none)';
 const commentMd = (m.doc && m.doc.comment_md) ? m.doc.comment_md : '';
 
 const handleSave = () => {
  const updatedMsg = {...editedMsg};
  ci.msg = updatedMsg; // 
  if (onUpdateMessage) {
  onUpdateMessage(updatedMsg); // ?
  }
  setIsEditing(Boolean(globalEditMode));
 };
 
 const handleCancel = () => {
  setEditedMsg({...m});
  setIsEditing(Boolean(globalEditMode));
 };

 const validateRaw = () => {
  try{
   const parsed = parseJSONAny(rawText);
   if(parsed.items && parsed.items.length===1){ setJsonError(''); if(window.showToast) window.showToast('JSON validation passed', 'success'); }
   else{ setJsonError('Please provide a single valid message object (current '+(parsed.items?parsed.items.length:0)+' items)'); if(window.showToast) window.showToast('JSON validation failed', 'warning'); }
  }catch(e){ setJsonError('JSON validation error: '+((e && e.message)||e)); }
 };
 const applyRaw = () => {
  try{
   const parsed = parseJSONAny(rawText);
   if(parsed.items && parsed.items.length===1){
    const updatedMsg = parsed.items[0];
    setEditedMsg({...updatedMsg});
    setJsonError('');
    if(window.showToast) window.showToast('宸插簲鐢?JSON 鍒拌〃鍗?, 'success');
   }else{
    setJsonError('JSON 瑙ｆ瀽澶辫触鎴栨湭鎵惧埌鏈夋晥瀵硅薄');
    if(window.showToast) window.showToast('JSON 瑙ｆ瀽澶辫触', 'error');
   }
  }catch(e){ setJsonError('JSON 搴旂敤寮傚父: '+((e && e.message)||e)); }
 };
 const syncRawFromForm = () => { try{ setRawText(JSON.stringify(editedMsg, null, 2)); if(window.showToast) window.showToast('宸插悓姝ヨ〃鍗曞埌 JSON', 'info'); }catch(e){} };
 
 if (compactMode) {
  return (<div className="p-2 space-y-2 text-sm">
 <div className="grid grid-cols-2 gap-2">
 <div><div className="text-zinc-400 text-xs">Protocol</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.protocol} 
 onChange={(e) => setEditedMsg({...editedMsg, protocol: e.target.value})}
 />
 ) : (
 <div className="font-medium text-xs">{m.protocol}</div>
 )}
 </div>
 <div><div className="text-zinc-400 text-xs">Release</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.release} 
 onChange={(e) => setEditedMsg({...editedMsg, release: e.target.value})}
 />
 ) : (
 <div className="font-medium text-xs">{m.release}</div>
 )}
 </div>
 </div>
 {inst && (<div className="grid grid-cols-2 gap-2">
  <div><div className="text-xs text-zinc-400">From</div><RoleSelectRestricted ci={ci} side="from"/></div>
  <div><div className="text-xs text-zinc-400">To</div><RoleSelectRestricted ci={ci} side="to"/></div>
 </div>)}
 <div className="flex gap-2 mt-2">
 {!isEditing ? (
  <IconButton icon="pencil" size="sm" title="Edit" onClick={() => { setEditedMsg({...m}); setIsEditing(true); }} />
 ) : (
  <>
   <IconButton icon="check" size="sm" primary title="Save" onClick={handleSave} />
   <IconButton icon="x" size="sm" title="Cancel" onClick={handleCancel} />
  </>
 )}
  </div>
  </div>)};
 
 
 return (<div className="p-3 space-y-4" style={{position: 'relative', zIndex: '1001'}}>
 <div className="flex justify-between items-center">
 <div className="font-medium text-lg">{m.name || 'Message'}</div>
 <div style={{position: 'relative', zIndex: '1002'}}>
  {!isEditing ? (
   <IconButton icon="pencil" size="sm" title="Edit" onClick={() => { setEditedMsg({...m}); setIsEditing(true); }} />
  ) : (
   <div className="flex gap-2">
    <IconButton icon="check" size="sm" primary title="Save" onClick={handleSave} />
    <IconButton icon="x" size="sm" title="Cancel" onClick={handleCancel} />
   </div>
  )}
  </div>
  </div>
 
 <div className="grid grid-cols-2 gap-3">
 <div><div className="text-zinc-400 text-sm">Name</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.name || ''} 
 onChange={(e) => setEditedMsg({...editedMsg, name: e.target.value})}
 placeholder="Message name"
 />
 ) : (
 <div className="font-medium">{m.name || 'N/A'}</div>
 )}
 </div>
 <div><div className="text-zinc-400 text-sm">Protocol</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.protocol} 
 onChange={(e) => setEditedMsg({...editedMsg, protocol: e.target.value})}
 />
 ) : (
 <div className="font-medium">{m.protocol}</div>
 )}
 </div>
 <div><div className="text-zinc-400 text-sm">Release</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.release} 
 onChange={(e) => setEditedMsg({...editedMsg, release: e.target.value})}
 />
 ) : (
 <div className="font-medium">{m.release}</div>
 )}
 </div>
 <div><div className="text-zinc-400 text-sm">From</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.from || ''} 
 onChange={(e) => setEditedMsg({...editedMsg, from: e.target.value})}
 placeholder="From role"
 />
 ) : (
 <div className="font-medium">{m.from}</div>
 )}
 </div>
 <div><div className="text-zinc-400 text-sm">To</div>
 {isEditing ? (
 <input 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full" 
 value={editedMsg.to || ''} 
 onChange={(e) => setEditedMsg({...editedMsg, to: e.target.value})}
 placeholder="To role"
 />
 ) : (
 <div className="font-medium">{m.to}</div>
 )}
 </div>
 <div className="col-span-2"><div className="text-zinc-400 text-sm mb-1">Summary</div>
 {isEditing ? (
 <textarea 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[60px] w-full resize-none" 
 value={editedMsg.doc?.summary_en || ''} 
 onChange={(e) => setEditedMsg({...editedMsg, doc: {...editedMsg.doc, summary_en: e.target.value}})}
 placeholder="Summary description"
 />
 ) : (
 <div className="leading-relaxed whitespace-pre-wrap">{summary}</div>
 )}
 </div>
 <div className="col-span-2"><div className="text-zinc-400 text-sm mb-1">Comment</div>
 {isEditing ? (
 <textarea 
 className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] w-full resize-none" 
 value={editedMsg.doc?.comment_md || ''} 
 onChange={(e) => setEditedMsg({...editedMsg, doc: {...editedMsg.doc, comment_md: e.target.value}})}
 placeholder="Comment in Markdown"
 />
 ) : (
 <MarkdownBlock text={commentMd}/>
 )}
 </div>
 </div>
 {inst && (<div className="grid grid-cols-2 gap-3">
  <div><div className="text-xs text-zinc-400 mb-1">From role</div><RoleSelectRestricted ci={ci} side="from"/></div>
  <div><div className="text-xs text-zinc-400 mb-1">To role</div><RoleSelectRestricted ci={ci} side="to"/></div>
 </div>)}
 <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-3 space-y-3">
  <div className="font-medium text-zinc-200 flex items-center gap-2">
   <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
   </svg>
   Information Elements (grouped & nested)
  </div>
  <IEGroups ci={ci}/>
 </div>
 {isEditing && (
  <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-3 space-y-2">
   <div className="flex items-center justify-between">
    <div className="font-medium text-zinc-200 flex items-center gap-2">
     <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
     </svg>
     Raw JSON
    </div>
    <div className="flex items-center gap-2">
     <button className="btn btn-sm" onClick={syncRawFromForm}>Sync from form</button>
     <button className="btn btn-sm" onClick={validateRaw}>Validate</button>
     <button className="btn btn-sm btn-primary" onClick={applyRaw}>Apply JSON</button>
    </div>
   </div>
   <textarea className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm font-mono text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[180px] w-full resize-none" value={rawText} onChange={(e)=>setRawText(e.target.value)}></textarea>
   {jsonError && <div className="text-xs text-red-400">{jsonError}</div>}
  </div>
 )}
 </div>);
}

function RoleSelectRestricted({ci,side}){
 const [_,force]=React.useState(0);
 const m=ci.msg;
 const allowed = allowedRolesForSide(m, side);
 const current = side==='from' ? (ci.from_role || (m.from+'$A')) : (ci.to_role || (m.to+'$A'));
 const safeVal = allowed.indexOf(current)>=0 ? current : allowed[0];
 if (safeVal !== current){
 if(side==='from') ci.from_role = safeVal; else ci.to_role = safeVal; force(x=>x+1);
 }
 return (<select className="input" value={safeVal} onChange={(e)=>{
 if(side==='from') ci.from_role = e.target.value; else ci.to_role = e.target.value; force(x=>x+1);
 }}>
 {allowed.map(r=> <option key={r} value={r}>{r}</option>)}
 </select>);
}

// ------------- IE tree grouped by presence and nested -------------
function IEGroups({ci}){
 const [_,force]=React.useState(0);
const m=ci.msg, dict=(m.ie_dict||(m.info&&m.info.ie_dict))||{};
const top = (m.ie_tree||(m.info&&m.info.ie_tree))||[];
 const byP = {M:[], O:[], C:[]};
 top.forEach(n => (byP[n.presence]||byP.O).push(n));
 const groups = [
 {key:'M', title:'Mandatory IE', color:'M', icon:'馃敶'},
 {key:'C', title:'Conditional IE', color:'C', icon:'馃煛'},
 {key:'O', title:'Optional IE', color:'O', icon:'馃煝'}
 ];

 function addTopIE(pres){
  const nn = {presence: pres||'O', name: 'NewIE', $ref: '', children: []};
  m.ie_tree = Array.isArray(top) ? top.concat([nn]) : [nn];
  force(x=>x+1);
 }

 return (<div className="space-y-3">
 {groups.map(g=>(
 <div key={g.key} className="border border-zinc-800 rounded-lg bg-zinc-900/30">
 <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/20 rounded-t-lg border-b border-zinc-800/50">
  <div className="flex items-center gap-2">
   <span className="text-sm">{g.icon}</span>
   <span className="font-medium text-zinc-200">{g.title}</span>
  </div>
  <div className="flex items-center gap-2">
   <span className="text-xs bg-zinc-700 px-2 py-1 rounded-full">{byP[g.key].length}</span>
   <button className="btn btn-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200" title="Add top-level IE" onClick={()=>addTopIE(g.key)}>+ Add</button>
  </div>
 </div>
 <div className="p-3 space-y-2">
 {byP[g.key].map((node,idx)=>(<IETreeNode key={g.key+'-'+idx} ci={ci} node={node} dict={dict} depth={0} force={force} parentChildren={top} nodeIndex={top.indexOf(node)}/>))}
 {byP[g.key].length===0 && <div className="text-xs text-zinc-500 text-center py-4 italic">No {g.title.toLowerCase()} defined</div>}
 </div>
 </div>
 ))}
 </div>);
}

function IETreeNode({ci,node,dict,depth,force,parentChildren,nodeIndex}){
 const [editing,setEditing]=React.useState(false);
 const key = refToKey(node.$ref);
 const meta = (dict && dict[key]) ? dict[key] : {};
 const hasChildren = Array.isArray(node.children) && node.children.length>0;
 function _ensureChildren(){ if(!Array.isArray(node.children)) node.children=[]; }
 function _reRender(){ force(x=>x+1); }
 function _delete(){ if(Array.isArray(parentChildren)){ parentChildren.splice(nodeIndex,1); _reRender(); } }
 function _move(delta){ if(!Array.isArray(parentChildren)) return; var i=nodeIndex; var j=i+delta; if(j<0||j>=parentChildren.length) return; const tmp=parentChildren[i]; parentChildren[i]=parentChildren[j]; parentChildren[j]=tmp; _reRender(); }
 function _addChild(){ _ensureChildren(); node.children.push({presence:'O', name:'NewChild', $ref:'', children:[]}); _reRender(); }

 const title = (<div className="flex items-center gap-2 items-center">
  <span className={'inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full ' + 
    (node.presence === 'M' ? 'bg-red-600 text-white' : 
     node.presence === 'C' ? 'bg-yellow-600 text-white' : 
    'bg-green-600 text-white')}>{node.presence||'O'}</span>
 <span className="font-medium text-zinc-100">{node.name||'(unnamed)'}</span>
 {(node.$ref) && <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">$ref: {node.$ref}</span>}
 <div className="flex gap-1 ml-auto">
   <button className="btn btn-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200" onClick={()=>setEditing(v=>!v)}>{editing?'鉁?Done':'鉁忥笍 Edit'}</button>
   {editing && <>
    <button className="btn btn-xs bg-blue-600 hover:bg-blue-500 text-white" title="Add child" onClick={_addChild}>+ Child</button>
    <button className="btn btn-xs bg-zinc-600 hover:bg-zinc-500 text-white" title="Move up" onClick={()=>_move(-1)}>鈫?/button>
    <button className="btn btn-xs bg-zinc-600 hover:bg-zinc-500 text-white" title="Move down" onClick={()=>_move(1)}>鈫?/button>
    <button className="btn btn-xs bg-red-600 hover:bg-red-500 text-white" title="Delete" onClick={_delete}>馃棏锔?/button>
   </>}
  </div>
  {meta && meta.proto_tags && <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">proto: {Object.entries(meta.proto_tags).map(([k,v])=>k+':'+v).join(', ')}</span>}
 </div>);

 function setOV(anchor, val){
 ci.ie_overrides = Object.assign({}, (ci.ie_overrides||{}), {[anchor]:val});
 force(x=>x+1);
 }
 function LeafEditor(){
 const t = inputTypeOf(node, meta);
 const anchor = key;
 const cur0 = (ci.ie_overrides||{})[anchor];
 const cur = (cur0===undefined || cur0===null) ? '' : cur0;
 const ph = String(defaultOf(node, meta));
 if(t==='select'){
 const opts = ((meta && meta.enum_doc) ? meta.enum_doc.map(e=>e && e.name).filter(Boolean) : ((node && node.enum) ? node.enum.map(e=>e && e.name).filter(Boolean) : []));
 return (<select className="input" value={cur} onChange={(e)=>setOV(anchor, e.target.value)}><option value="">(use default)</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>);
 }else if(t==='number'){
 return (
 <input
 type="number"
 className="input"
 value={cur === '' ? '' : Number(cur)}
 placeholder={ph}
 onChange={(e) => {
 const v = e.target.value;
 setOV(anchor, v === '' ? '' : (isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber));
 }}
 />
 );
 }
 return (<input className="input" value={cur} placeholder={ph} onChange={(e)=>setOV(anchor, e.target.value)} />);
 }

 if(!hasChildren){
  return (<div className="border border-zinc-800/50 rounded-lg bg-zinc-900/20 p-3">
   {title}
   <div className="grid grid-cols-12 gap-3 mt-3">
    <div className="col-span-6">
     <div className="text-xs text-zinc-400 mb-1 font-medium">Default Value</div>
     <div className="text-sm mono break-all bg-zinc-800/30 p-2 rounded border text-zinc-300">{String(defaultOf(node, meta))}</div>
    </div>
    <div className="col-span-6">
     <div className="text-xs text-zinc-400 mb-1 font-medium">Override Value</div>
     <div className="bg-zinc-800/30 p-2 rounded border">
      <LeafEditor/>
     </div>
    </div>
    {meta && meta.desc_en && <div className="col-span-12 text-xs text-zinc-400 mt-2 p-2 bg-zinc-800/20 rounded border-l-2 border-blue-500/50">{meta.desc_en}</div>}
   </div>
   {editing && (
    <details open className="border border-zinc-700 rounded-lg p-3 mt-3 bg-zinc-800/20">
     <summary className="select-none font-medium text-zinc-300 cursor-pointer">Edit Properties</summary>
     <div className="flex items-center gap-2 mt-3">
      <select className="input input-xs w-20 bg-zinc-800 border-zinc-600" value={node.presence||'O'} onChange={(e)=>{ node.presence=e.target.value; _reRender(); }}>
       <option value="M">M</option>
       <option value="C">C</option>
       <option value="O">O</option>
      </select>
      <input className="input input-xs bg-zinc-800 border-zinc-600" style={{width:'12rem'}} value={node.name||''} placeholder="IE name" onChange={(e)=>{ node.name=e.target.value; _reRender(); }}/>
      <input className="input input-xs bg-zinc-800 border-zinc-600" style={{width:'12rem'}} value={node.$ref||''} placeholder="$ref (dict key)" onChange={(e)=>{ node.$ref=e.target.value; _reRender(); }}/>
     </div>
    </details>
   )}
  </div>)};
 
 // 闈炲彾瀛愶細濮嬬粓鏄剧ず瀛愯妭鐐癸紝缂栬緫闈㈡澘鎶樺彔灞曞紑
 return (<div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30">
  {title}
  {meta && meta.desc_en && <div className="text-xs text-zinc-400 mt-2 p-2 bg-zinc-800/20 rounded border-l-2 border-blue-500/50">{meta.desc_en}</div>}
  <div className="mt-3 pl-4 border-l-2 border-zinc-700/50 space-y-2">
   {node.children.map((ch, i)=>(<IETreeNode key={(key||node.name)+'-'+i} ci={ci} node={ch} dict={dict} depth={depth+1} force={force} parentChildren={node.children} nodeIndex={i}/>))}
  </div>
  {editing && (
   <details open className="border border-zinc-700 rounded-lg p-3 mt-3 bg-zinc-800/20">
    <summary className="select-none font-medium text-zinc-300 cursor-pointer">馃敡 Edit Properties</summary>
    <div className="flex items-center gap-2 mt-3">
     <select className="input input-xs w-20 bg-zinc-800 border-zinc-600" value={node.presence||'O'} onChange={(e)=>{ node.presence=e.target.value; _reRender(); }}>
      <option value="M">M</option>
      <option value="C">C</option>
      <option value="O">O</option>
     </select>
     <input className="input input-xs bg-zinc-800 border-zinc-600" style={{width:'12rem'}} value={node.name||''} placeholder="IE name" onChange={(e)=>{ node.name=e.target.value; _reRender(); }}/>
     <input className="input input-xs bg-zinc-800 border-zinc-600" style={{width:'12rem'}} value={node.$ref||''} placeholder="$ref (dict key)" onChange={(e)=>{ node.$ref=e.target.value; _reRender(); }}/>
    </div>
   </details>
  )}
 </div>);
}

*/
function BuildPane(props){
  return (<div className="text-zinc-300 text-sm">BuildPane temporarily disabled</div>);
}

function RoleBindings({bindings,setBindings,truth,canvas}){
 const known = useMemo(()=>{
 const s=new Set();
 truth.forEach(m=>{
 const rs = (m.roleset || (m.roles && m.roles.roleset) || []);
 rs.forEach(v=>s.add(v));
 });
 canvas.forEach(c=>{ s.add(c.from_role||c.msg.from+'$A'); s.add(c.to_role||c.msg.to+'$A');});
 return Array.from(s).sort();
 },[truth,canvas]);
 return (<div className="space-y-2 max-h-[40vh] overflow-auto">
 {known.map(v=>(
 <div key={v} className="grid grid-cols-12 gap-2 items-center">
 <div className="col-span-5 text-sm mono">{v}</div>
 <div className="col-span-7"><input className="input" placeholder={'Label for '+v} value={bindings[v]||''} onChange={(e)=>setBindings(Object.assign({}, bindings, {[v]:e.target.value}))}/></div>
 </div>
 ))}
 {known.length===0 && <div className="text-xs text-zinc-500">No roles detected yet.</div>}
 </div>);
}
function buildPreviewHTML(lanesArr, messagesArr){
 var dataJS = 'const nodes = ' + JSON.stringify(lanesArr, null, 2) + ';\n' +
 'const messages = ' + JSON.stringify(messagesArr, null, 2) + ';';
 var closeScript = '<'+'/'+'script>';
 var parts = [];
 parts.push('<!DOCTYPE html>');
 parts.push('<html lang="zh-CN">');
 parts.push('<head>');
 parts.push(' <meta charset="UTF-8" />');
 parts.push(' <meta name="viewport" content="width=device-width,initial-scale=1" />');
 parts.push(' <title>5GC - </title>');
 parts.push(' <style>');
 parts.push(' *{box-sizing:border-box}');
 parts.push(' html,body{min-width:0;min-height:0;margin:0;padding:0;height:100vh;width:100vw;background:#0c0c0c;overflow:hidden}');
 parts.push(' body{display:flex;flex-direction:column;font-size:14px;color:#f2f2f2;font-family:Ericsson Hilda,Helvetica,Arial,sans-serif;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}');
 parts.push(' #container{display:flex;height:100vh;background:#0c0c0c;color:#f2f2f2}');
 parts.push(' #diagram-container{flex:1;position:relative;background:#0c0c0c}');
 parts.push(' #header-names{position:absolute;top:0;left:0;right:0;height:50px;background:#0c0c0c;border-bottom:1px solid #27272a;overflow:hidden;pointer-events:none;}');
 parts.push(' #header-names-inner{position:absolute;top:0;left:0;height:100%;}');
 parts.push(' #header-names-inner .node-name{position:absolute;top:50%;transform:translate(-50%,-50%);font-size:14px;color:#f2f2f2;}');
 parts.push(' #diagram-body{position:absolute;top:50px;bottom:0;left:0;right:0;overflow:auto;}');
 parts.push(' #diagram{display:block;}');
 parts.push(' #vertical-divider{width:5px;background:#27272a;cursor:col-resize;user-select:none;}');
 parts.push(' #viewer-wrapper{width:400px;display:flex;flex-direction:column;overflow:hidden;}');
 parts.push(' #viewer-header{flex:none;padding:10px 12px;background:#18181b;border-bottom:1px solid #27272a;font-weight:bold;color:#f2f2f2;}');
 parts.push(' #right-detail{position:relative;flex:1;min-height:0;}');
 parts.push(' #json-viewer {position:absolute;left:0;right:0;padding:10px;font-size:14px;line-height:1.4;overflow-y:auto;box-sizing:border-box;top:0;height:50%;background:#0c0c0c;color:#f2f2f2;}');
 parts.push(' #comment-viewer {position:absolute;left:0;right:0;padding:10px;font-size:14px;line-height:1.4;overflow-y:auto;box-sizing:border-box;top:calc(50% + 5px);height:calc(50% - 5px);background:#0c0c0c;color:#f2f2f2;}');
 parts.push(' #horizontal-divider{position:absolute;left:0;right:0;height:5px;background:#27272a;top:50%;margin-top:-2px;cursor:row-resize;user-select:none;}');
 parts.push(' .message-label{cursor:default;fill:#f2f2f2;} .message-label:hover{fill:#22c55e;}');
 parts.push(' .badge{display:inline-block;font-size:11px;border-radius:999px;padding:2px 6px;border:1px solid #27272a;margin-right:6px;background:#18181b;color:#f2f2f2}');
 parts.push(' .badge.M{background:#064e3b;color:#bbf7d0;border-color:#047857} .badge.O{background:#1e3a8a;color:#93c5fd;border-color:#3b82f6} .badge.C{background:#7f1d1d;color:#fecdd3;border-color:#ef4444}');
 parts.push(' .leaf{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:8px;margin:6px 0;color:#f2f2f2}');
 parts.push(' details{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:6px;margin:6px 0;color:#f2f2f2}');
 parts.push(' details>summary{cursor:pointer;list-style:none;color:#f2f2f2} details>summary::-webkit-details-marker{display:none}');
 parts.push(' .path{font-family:Consolas, \\"Courier New\\", monospace;font-size:12px;color:#a1a1aa}');
 parts.push(' #comment-content{max-width:800px;margin:0 auto;word-wrap:break-word;overflow-wrap:break-word;color:#f2f2f2;}');
 parts.push(' #comment-content code{font-family:Consolas,\\"Courier New\\",monospace;background:#18181b;padding:2px 4px;border-radius:3px;color:#f2f2f2;}');
 parts.push(' #comment-content pre{background:#18181b;padding:10px;border-radius:3px;overflow-x:auto;color:#f2f2f2;}');
 parts.push(' #comment-viewer::-webkit-scrollbar{width:8px;height:8px;}');
 parts.push(' #comment-viewer::-webkit-scrollbar-thumb{background-color:rgba(255,255,255,0.3);border-radius:4px;}');
 parts.push(' #comment-viewer::-webkit-scrollbar-track{background-color:#18181b;}');
 parts.push(' </style>');
 parts.push('</head>');
 parts.push('<body>');
 parts.push(' <div id="container">');
 parts.push(' <div id="diagram-container">');
 parts.push(' <div id="header-names"><div id="header-names-inner"></div></div>');
 parts.push(' <div id="diagram-body"><svg id="diagram"></svg></div>');
 parts.push(' </div>');
 parts.push(' <div id="vertical-divider"></div>');
 parts.push(' <div id="viewer-wrapper">');
 parts.push(' <div id="viewer-header">Message Details</div>');
 parts.push(' <div id="right-detail">');
 parts.push(' <div id="json-viewer"></div>');
 parts.push(' <div id="horizontal-divider"></div>');
 parts.push(' <div id="comment-viewer"><div id="comment-content"></div></div>');
 parts.push(' </div>');
 parts.push(' </div>');
 parts.push(' </div>');
 parts.push(' <scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/marked/16.1.1/lib/marked.umd.min.js"></scr'+'ipt>');
 parts.push(' <scr'+'ipt>');
 var needle = '</scr'+'ipt>';
 var safeData = dataJS.split(needle).join('<\\/script>');
 parts.push(safeData);
 parts.push(' (function(){');
 parts.push(" function hasOwn(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }");
 parts.push(" function defaultOf(n, meta){");
 parts.push(" if(n && hasOwn(n,'val_default')) return n.val_default;");
 parts.push(" if(meta && hasOwn(meta,'default')) return meta.default;");
 parts.push(" return '';");
 parts.push(" }");
 parts.push(' var headerInner=document.getElementById("header-names-inner");');
 parts.push(' var bodyDiv=document.getElementById("diagram-body");');
 parts.push(' var svg=document.getElementById("diagram");');
 parts.push(' var diagramContainer=document.getElementById("diagram-container");');
 parts.push(' var verticalDivider=document.getElementById("vertical-divider");');
 parts.push(' var viewerWrapper=document.getElementById("viewer-wrapper");');
 parts.push(' var rightDetail=document.getElementById("right-detail");');
 parts.push(' var jsonViewer=document.getElementById("json-viewer");');
 parts.push(' var commentViewer=document.getElementById("comment-viewer");');
 parts.push(' var commentContent=document.getElementById("comment-content");');
 parts.push(' var hDivider=document.getElementById("horizontal-divider");');
 parts.push(' var headerHeight=50;');
 parts.push(' var margin={top:headerHeight,bottom:50,left:100,right:100};');
 parts.push(' var xStep=200, msgSpacing=80;');
 parts.push(' var totalHeight=margin.top+msgSpacing*(messages.length+1)+margin.bottom;');
 parts.push(' var totalWidth=margin.left+xStep*(nodes.length-1)+margin.right;');
 parts.push(' svg.setAttribute("width", totalWidth);');
 parts.push(' svg.setAttribute("height", totalHeight);');
 parts.push(' headerInner.style.width=totalWidth+"px";');
 parts.push(' var xs={};');
 parts.push(' for(var i=0;i<nodes.length;i++){');
 parts.push(' var n=nodes[i]; var x=margin.left+i*xStep; xs[n]=x;');
 parts.push(' var d=document.createElement("div"); d.className="node-name"; d.textContent=n; d.style.left=x+"px"; headerInner.appendChild(d);');
 parts.push(' var line=document.createElementNS("http://www.w3.org/2000/svg","line");');
 parts.push(' line.setAttribute("x1",x); line.setAttribute("y1",margin.top);');
 parts.push(' line.setAttribute("x2",x); line.setAttribute("y2",totalHeight-margin.bottom);');
 parts.push(' line.setAttribute("stroke","#aaa"); line.setAttribute("stroke-dasharray","4 2");');
 parts.push(' svg.appendChild(line);');
 parts.push(' }');
 parts.push(' var defs=document.createElementNS("http://www.w3.org/2000/svg","defs");');
 parts.push(' var marker=document.createElementNS("http://www.w3.org/2000/svg","marker");');
 parts.push(' marker.setAttribute("id","arrow"); marker.setAttribute("markerWidth","8"); marker.setAttribute("markerHeight","8");');
 parts.push(' marker.setAttribute("refX","6"); marker.setAttribute("refY","3"); marker.setAttribute("orient","auto");');
 parts.push(' var path=document.createElementNS("http://www.w3.org/2000/svg","path");');
 parts.push(' path.setAttribute("d","M0,0 L0,6 L6,3 Z"); path.setAttribute("fill","#000");');
 parts.push(' marker.appendChild(path); defs.appendChild(marker); svg.appendChild(defs);');
 parts.push(' function renderJSON(obj,container){');
 parts.push(' container.innerHTML="";');
 parts.push(' function walk(k,v,parent){');
 parts.push(' if(v && typeof v==="object" && !Array.isArray(v)){');
 parts.push(' var d=document.createElement("details"); d.open=true;');
 parts.push(' var s=document.createElement("summary"); s.textContent=k; d.appendChild(s);');
 parts.push(' for(var kk in v){ if(hasOwn(v,kk)) walk(kk, v[kk], d);}');
 parts.push(' parent.appendChild(d);');
 parts.push(' }else{ var div=document.createElement("div"); div.textContent=k+": "+String(v); parent.appendChild(div);}');
 parts.push(' }');
 parts.push(' for(var key in obj){ if(hasOwn(obj,key)) walk(key, obj[key], container);}');
 parts.push(' }');
 parts.push(' function renderIETree(nodeArr, dict, overrides, parent, path){');
 parts.push(' if(!nodeArr || !nodeArr.length) return;');
 parts.push(' for(var i=0;i<nodeArr.length;i++){');
 parts.push(' var n=nodeArr[i]; var key=(n && n.$ref)? String(n.$ref).replace(/^#/,"") : ""; var meta= (key && dict && dict[key]) ? dict[key] : {};');
 parts.push(' var hasChildren = n && n.children && n.children.length;');
 parts.push(' var title = document.createElement("div");');
 parts.push(' var badge = document.createElement("span"); badge.className="badge "+(n.presence||"O"); badge.textContent=(n.presence||"O");');
 parts.push(' var nm = document.createElement("span"); nm.style.fontWeight="600"; nm.textContent = " " + (n.name || key || "(unnamed)");');
 parts.push(' title.appendChild(badge); title.appendChild(nm);');
 parts.push(' var seg = (n.name || key || "");');
 parts.push(' var curPath = path ? (path + "." + seg) : seg;');
 parts.push(' var defv = defaultOf(n, meta);');
 parts.push(' var ov = overrides && hasOwn(overrides,key) ? overrides[key] : "";');
 parts.push(' if(!hasChildren){');
 parts.push(' var leaf = document.createElement("div"); leaf.className="leaf"; leaf.appendChild(title);');
 parts.push(' var info = document.createElement("div"); info.className="path"; info.textContent = curPath + " default: " + String(defv) + (ov!==""? (" override: "+ov):"");');
 parts.push(' leaf.appendChild(info);');
 parts.push(' if(meta && meta.desc_en){ var d=document.createElement("div"); d.style.color="#6b7280"; d.style.fontSize="12px"; d.textContent=meta.desc_en; leaf.appendChild(d);}');
 parts.push(' parent.appendChild(leaf);');
 parts.push(' }else{');
 parts.push(' var det = document.createElement("details"); det.open = true; var sum=document.createElement("summary"); sum.appendChild(title); det.appendChild(sum);');
 parts.push(' if(meta && meta.desc_en){ var d2=document.createElement("div"); d2.style.color="#6b7280"; d2.style.fontSize="12px"; d2.textContent=meta.desc_en; det.appendChild(d2);}');
 parts.push(' var inner=document.createElement("div"); inner.style.marginLeft="12px"; det.appendChild(inner);');
 parts.push(' parent.appendChild(det);');
 parts.push(' renderIETree(n.children, dict, overrides, inner, curPath);');
 parts.push(' }');
 parts.push(' }');
 parts.push(' }');
 parts.push(' function flattenIE(nodeArr, dict, path, out){');
 parts.push(' if(!nodeArr || !nodeArr.length) return;');
 parts.push(' for(var i=0;i<nodeArr.length;i++){');
 parts.push(' var n=nodeArr[i]; var seg = (n.name || (n.$ref? String(n.$ref).replace(/^#/,"") : "")); var key=(n && n.$ref)? String(n.$ref).replace(/^#/,"") : ""; var meta=(dict && dict[key]) ? dict[key] : {};');
 parts.push(' var curPath = path ? (path + "." + seg) : seg;');
 parts.push(' out.push({path:curPath, presence:n.presence||"O", key:key, meta:meta});');
 parts.push(' if(n && n.children && n.children.length) flattenIE(n.children, dict, curPath, out);');
 parts.push(' }');
 parts.push(' }');
 parts.push(' for(var i=0;i<messages.length;i++){ (function(i){');
 parts.push(' var m=messages[i]; var y=margin.top+msgSpacing*(i+1); var x1=xs[m.from],x2=xs[m.to];');
 parts.push(' var ln=document.createElementNS("http://www.w3.org/2000/svg","line");');
 parts.push(' ln.setAttribute("x1",x1); ln.setAttribute("y1",y); ln.setAttribute("x2",x2); ln.setAttribute("y2",y);');
 parts.push(' ln.setAttribute("stroke","#000"); ln.setAttribute("marker-end","url(#arrow)"); svg.appendChild(ln);');
 parts.push(' var lbl=document.createElementNS("http://www.w3.org/2000/svg","text");');
 parts.push(' lbl.setAttribute("x",(x1+x2)/2); lbl.setAttribute("y",y-6); lbl.setAttribute("text-anchor","middle"); lbl.setAttribute("class","message-label");');
 parts.push(' var inner = (i+1) + " " + (m.info && m.info.header && m.info.header.msg ? m.info.header.msg : ""); lbl.textContent = m.label || inner;');
 parts.push(' lbl.addEventListener("click", function(){');
 parts.push(' var info = m.info || {}; var dict = info.ie_dict || {}; var tree = info.ie_tree || []; var overrides = info.overrides || {};');
 parts.push(' var show = {};');
 parts.push(' if(info.http || info.status!==undefined || info.body!==undefined){');
 parts.push(' if(info.http && (info.http.method || info.http.uri)) show.http = { method: info.http.method, uri: info.http.uri };');
 parts.push(' if(info.status!==undefined) show.status = info.status;');
 parts.push(' if(info.body!==undefined) show.body = info.body;');
 parts.push(' }else{');
 parts.push(' if(info.header) show.header = info.header;');
 parts.push(' if(info.payload) show.payload = info.payload;');
 parts.push(' if(info.primary_ref) show.primary_ref = info.primary_ref;');
 parts.push(' }');
 parts.push(' jsonViewer.innerHTML="";');
 parts.push(' var h=document.createElement("div"); h.style.fontWeight="600"; h.style.marginBottom="6px"; h.textContent=(m.from + " " + m.to + " " + (m.info && m.info.header && m.info.header.msg ? m.info.header.msg : "")); jsonViewer.appendChild(h);');
 parts.push(' renderJSON(show, jsonViewer);');
 parts.push(' var ieTitle=document.createElement("div"); ieTitle.style.fontWeight="600"; ieTitle.style.margin="10px 0 6px"; ieTitle.textContent="IE"; jsonViewer.appendChild(ieTitle);');
 parts.push(' var holder=document.createElement("div"); jsonViewer.appendChild(holder);');
 parts.push(' renderIETree(tree, dict, overrides, holder, "");');
 parts.push(' var docRef = (m.doc || (m.info && m.info.doc) || {});');
 parts.push(' var summaryText = (docRef.summary_en || (m.summary_en || ""));');
 parts.push(' var commentMd = (m.comment_md || docRef.comment_md || (m.comment || ""));');
 parts.push(' var stepsRaw = (docRef.steps !== undefined ? docRef.steps : (m.steps !== undefined ? m.steps : ""));');
 parts.push(' var combined = [];');
 parts.push(' if(summaryText) combined.push("## Summary\\n\\n" + String(summaryText));');
 parts.push(' if(Array.isArray(stepsRaw) ? stepsRaw.length : String(stepsRaw).trim()){');
 parts.push('   var stepsText = Array.isArray(stepsRaw) ? stepsRaw.map(String).join("\\n") : String(stepsRaw);');
 parts.push('   combined.push("## Steps\\n\\n" + stepsText);');
 parts.push(' }');
 parts.push(' if(commentMd) combined.push("## Comment\\n\\n" + String(commentMd));');
 parts.push(' var md = combined.join("\\n\\n");');
 parts.push(' if(window.marked && window.marked.parse){ commentContent.innerHTML = marked.parse(md || "(No additional documentation.)"); } else { commentContent.textContent = md; }');
 parts.push(' });');
 parts.push(' svg.appendChild(lbl);');
 parts.push(' })(i);}');
 parts.push(' bodyDiv.addEventListener("scroll", function(){ headerInner.style.transform = "translateX(" + (-bodyDiv.scrollLeft) + "px)"; });');
 parts.push(' headerInner.style.transform = "translateX(0px)";');
 parts.push(' verticalDivider.addEventListener("mousedown", function(e){ e.preventDefault(); var startX=e.clientX, startW=viewerWrapper.offsetWidth;');
 parts.push(' function onMove(ev){ viewerWrapper.style.width=(startW-(ev.clientX-startX))+"px"; }');
 parts.push(' function stop(){ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",stop); }');
 parts.push(' document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",stop);');
 parts.push(' });');
 parts.push(' hDivider.addEventListener("mousedown", function(e){ e.preventDefault(); var startY=e.clientY, startH=jsonViewer.offsetHeight;');
 parts.push(' function onMove(ev){ var newH=startH+(ev.clientY-startY); jsonViewer.style.height=newH+"px"; hDivider.style.top=newH+"px"; commentViewer.style.top=(newH+5)+"px"; commentViewer.style.height=(rightDetail.clientHeight-newH-5)+"px"; }');
 parts.push(' function stop(){ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",stop); }');
 parts.push(' document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",stop);');
 parts.push(' });');
 parts.push(' var originalW=totalWidth, originalH=totalHeight; var scale=1; svg.setAttribute("viewBox","0 0 "+originalW+" "+originalH);');
 parts.push(' var dragging=false, sx=0, sy=0;');
 parts.push(' diagramContainer.addEventListener("mousedown", function(e){ dragging=true; sx=e.clientX; sy=e.clientY; e.preventDefault(); });');
 parts.push(' document.addEventListener("mousemove", function(e){ if(!dragging) return; diagramContainer.scrollLeft-=e.clientX-sx; diagramContainer.scrollTop -=e.clientY-sy; sx=e.clientX; sy=e.clientY; });');
 parts.push(' document.addEventListener("mouseup", function(){ dragging=false; });');
 parts.push(' diagramContainer.addEventListener("wheel", function(e){');
 parts.push(' if(!e.ctrlKey)return; e.preventDefault();');
 parts.push(' var factor=(Math.abs(e.deltaY)<50)?(e.deltaY<0?1.05:0.95):(e.deltaY<0?1.2:0.8);');
 parts.push(' var newScale=scale*factor; if(newScale<0.1||newScale>10)return;');
 parts.push(' var rect=diagramContainer.getBoundingClientRect(); var cx=e.clientX-rect.left, cy=e.clientY-rect.top;');
 parts.push(' var contentX=(diagramContainer.scrollLeft+cx)/scale; var contentY=(diagramContainer.scrollTop+cy)/scale;');
 parts.push(' scale=newScale; svg.setAttribute("width",originalW*scale); svg.setAttribute("height",originalH*scale); headerInner.style.width=(originalW*scale)+"px";');
 parts.push(' for(var i=0;i<nodes.length;i++){ headerInner.children[i].style.left=((margin.left+i*xStep)*scale)+"px"; }');
 parts.push(' diagramContainer.scrollLeft=contentX*scale-cx; diagramContainer.scrollTop =contentY*scale-cy;');
 parts.push(' },{passive:false});');
 parts.push(' })();');
 parts.push(closeScript);
 parts.push(' <scr'+'ipt>');
 parts.push(' (function(){');
 parts.push(' function onReady(fn){ if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", fn); } else { fn(); } }');
 parts.push(' onReady(function(){');
 parts.push(' var labels = Array.prototype.slice.call(document.querySelectorAll(".message-label"));');
 parts.push(' var currentIdx = -1;');
 parts.push(' function select(idx, viaKey){ if(idx<0 || idx>=labels.length) return; if(currentIdx>=0) labels[currentIdx].classList.remove("selected"); currentIdx=idx; var lbl=labels[currentIdx]; lbl.classList.add("selected"); if(viaKey){ lbl.scrollIntoView({block:"center", inline:"center"}); } lbl.dispatchEvent(new Event("click")); }');
 parts.push(' labels.forEach(function(lbl, idx){ lbl.addEventListener("click", function(){ if(currentIdx>=0) labels[currentIdx].classList.remove("selected"); currentIdx=idx; lbl.classList.add("selected"); }); });');
 parts.push(' document.addEventListener("keydown", function(e){ if(e.key==="ArrowDown"){ e.preventDefault(); select(currentIdx+1,true);} else if(e.key==="ArrowUp"){ e.preventDefault(); select(currentIdx-1,true);} });');
 parts.push(' });');
 parts.push(' })();');
 parts.push(closeScript);
 parts.push('</body>');
 parts.push('</html>');
 return parts.join('\n');
}



function BuildPane_old(props){
 const {text,setText,fileRef,onFile,onImport,byProto,search,setSearch,addAfterSelected,
 importInfo,canvas,setCanvas,selected,setSelected,inst,rm,dragIdx,setDragIdx,moveFromTo,addAt} = props;

 // DnD helpers
 function onDragStartLeft(e, m){
 e.stopPropagation();
 e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'left', id:m.id}));
 e.dataTransfer.effectAllowed='copy';
 }
 function onDragStartRight(e, uid){
 e.stopPropagation();
 e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'right', uid}));
 e.dataTransfer.effectAllowed='move';
 }
 function onDropAt(index, e){
 e.preventDefault(); e.stopPropagation();
 const raw = e.dataTransfer.getData('application/x-5gc'); setDragIdx(null);
 if(!raw) return;
 try{
 const data = JSON.parse(raw);
 if(data.src==='left'){
 const arrays = Object.values(byProto);
 let merged = [];
 for(let i=0;i<arrays.length;i++){ merged = merged.concat(arrays[i]); }
 const m = merged.find(x=>x.id===data.id);
 if(m) addAt(m, index);
 }else if(data.src==='right'){
 const from = canvas.findIndex(x=>x.uid===data.uid);
 if(from>=0) moveFromTo(from, index);
 }
 }catch(_){}
 }

 return (<div className="grid grid-cols-12 gap-4">
  <div className="col-span-5 space-y-3">
  <div className="card p-4 space-y-3">
   <div className="flex items-center gap-2">
    <input className="input" placeholder="Case 鍚嶇О锛堝彲閫夛級" value={caseName} onChange={e=>setCaseName(e.target.value)} />
    <textarea className="input mono min-h-[140px]" placeholder="Paste JSONL/JSON text or choose a file..." value={text} onChange={e=>setText(e.target.value)}></textarea>
    <IconButton icon="folder" title="Choose file" onClick={()=>fileRef.current && fileRef.current.click()} />
    <input ref={fileRef} type="file" className="hidden" accept=".jsonl,.json,.*" onChange={onFile}/>
    <IconButton icon="import" title="Import" onClick={()=>onImport()} />
    </div>
    {fileRef.current && fileRef.current.files && fileRef.current.files.length>0 && (
      <div className="text-xs text-zinc-400">Selected file: {fileRef.current.files[0].name} ({(fileRef.current.files[0].size/1024).toFixed(1)} KB)</div>
    )}
    {text && text.trim() && (()=>{ 
      try{
        const lines = String(text||'').split(/\r?\n/);
        let valid=0, err=0;
        for(let i=0;i<lines.length;i++){
          const line = lines[i].trim(); if(!line) continue;
          if(line[0] !== '{' || line[line.length-1] !== '}'){ err++; continue; }
          try{ JSON.parse(line); valid++; }catch(_){ err++; }
        }
        const est = { totalLines: lines.length, validCount: valid, errorCount: err };
        return (<div className={"text-xs "+(est.errorCount>0?"text-amber-400":"text-emerald-400")}>Estimate: total lines {est.totalLines}, valid {est.validCount}, errors {est.errorCount}</div>);
      }catch(_){
       return (<div className="text-xs text-amber-400">Estimate: error</div>);
     }
   })()}
   <input className="input" placeholder="Search message name..." value={search} onChange={e=>setSearch(e.target.value)}/>
   {importInfo && <div className="text-xs text-zinc-400">Imported {importInfo.ok} objects. Skipped {importInfo.err}.</div>}
  </div>
  <div className="max-h-[64vh] overflow-auto pr-1 space-y-3">
 {Object.entries(byProto).map(([proto, items])=>{
  const filtered = items.filter(m=>(m.message||m.id).toLowerCase().indexOf(search.toLowerCase())>=0);
  return (
   <div key={proto} className="card">
   <details open><summary className="px-4 py-2 flex items-center justify-between cursor-pointer"><span className="font-semibold">{proto}</span><span className="text-xs text-zinc-400">{filtered.length}</span></summary>
   <div className="px-2 pb-3 space-y-2">
    {filtered.map(m=>(
     <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 leftitem"
      draggable onDragStart={(e)=>onDragStartLeft(e,m)}>
      <div className="text-sm truncate" title={m.id}>
       <div className="font-medium">{m.message||shortLabel(m)}</div>
       <div className="text-xs text-zinc-400">{m.from} {m.to} {m.release}</div>
      </div>
      <IconButton icon="plus" title="Add" onClick={()=>addAfterSelected(m)} />
     </div>
    ))}
    {filtered.length===0 && <div className="text-xs text-zinc-400 px-3 py-2">No matches.</div>}
   </div></details>
   </div>
  );
 })}
 {Object.keys(byProto).length===0 && <div className="text-sm text-zinc-500 px-2">Import a truth base to start.</div>}
 </div>
 </div>

 <CanvasPane inBuild
 canvas={canvas} setCanvas={setCanvas} selected={selected} setSelected={setSelected}
 inst={inst} rm={rm}
 dragIdx={dragIdx} setDragIdx={setDragIdx} moveFromTo={moveFromTo}
 onDragStartRight={onDragStartRight} onDropAt={onDropAt}
 />
 </div>);
}

function CanvasPane_old({inBuild=false, canvas=[], setCanvas, selected, setSelected, inst, rm, dragIdx, setDragIdx, moveFromTo, onDragStartRight, onDropAt}){
 function _onDragStartRight(e, uid){
 if(onDragStartRight){ onDragStartRight(e, uid); return; }
 e.stopPropagation(); e.dataTransfer.clearData();
 e.dataTransfer.setData('application/x-5gc', JSON.stringify({src:'right', uid}));
 e.dataTransfer.effectAllowed='move';
 }
 function _onDropAt(index, e){
 if(onDropAt){ onDropAt(index, e); return; }
 e.preventDefault(); e.stopPropagation();
 }
 return (<div className={(inBuild?'col-span-7':'col-span-5')+" space-y-3"}>
 <div className="text-lg font-medium">Flow Canvas</div>
 <div className="space-y-1 min-h-[50vh] rounded-2xl border border-zinc-800 p-3 bg-zinc-900/20"
 onDragOver={(e)=>{e.preventDefault(); if(dragIdx===null) setDragIdx(canvas.length);}}
 onDrop={(e)=>{_onDropAt(canvas.length,e);}}>
 {canvas.length===0 && <div className="text-sm text-zinc-500">Drag messages here or click Add</div>}

 {canvas.map((ci,idx)=>(
 <React.Fragment key={ci.uid}>
 <DropZone index={idx} active={dragIdx===idx} setActive={setDragIdx} onDrop={_onDropAt}/>
 <CanvasCard ci={ci} idx={idx} selected={selected===ci.uid} setSelected={setSelected}
 inst={inst} rm={rm} onDragStartRight={(e)=>_onDragStartRight(e,ci.uid)}
 onUpdateMessage={(updatedMsg) => {
 setCanvas(prev => prev.map(item => 
 item.uid === ci.uid ? {...item, msg: updatedMsg} : item
 ));
 }}/>
 </React.Fragment>
 ))}
 {canvas.length>0 && <DropZone index={canvas.length} active={dragIdx===canvas.length} setActive={setDragIdx} onDrop={_onDropAt}/>}
 </div>
 </div>);
}

function DropZone({index,active,setActive,onDrop}){
 const counterRef = React.useRef(0);
 return (<div
  className={"dropzone "+(active?'active':'')}
  role="button"
  aria-label={"DropZone "+index}
  data-index={String(index)}
  onDragOver={(e)=>{e.preventDefault(); if(active!==index) setActive(index);}}
  onDragEnter={(e)=>{e.preventDefault(); counterRef.current++; setActive(index);}}
  onDragLeave={(e)=>{counterRef.current--; if(counterRef.current<=0) setActive(null);}}
  onDrop={(e)=>{counterRef.current=0; onDrop(index,e);}}
  onMouseUp={(e)=>{ // 鍏滃簳锛氳嫢鑷姩鍖栨嫋鎷芥湭瑙﹀彂 drop锛屽垯鐢ㄩ紶鏍囨姮璧锋墽琛?    try{
      const uid = window.__dragFromUid;
      const leftId = window.__dragFromLeftId;
      if(uid || leftId){
        const payload = uid ? {src:'right', uid} : {src:'left', id:leftId};
        const fake = {
          preventDefault: ()=>{}, stopPropagation: ()=>{}, dataTransfer: {
            getData: ()=> JSON.stringify(payload)
          }
        };
        onDrop(index, fake);
        window.__dragFromUid = null;
        window.__dragFromLeftId = null;
      }
    }catch(_){}
  }}
 />);
}

function CanvasCard_old({ci,idx,selected,setSelected,inst,rm,onDragStartRight,onUpdateMessage,globalEditMode=false}){
 const m=ci.msg;
 const [open,setOpen]=React.useState(Boolean(ci && ci.expanded));
 React.useEffect(function(){ if(globalEditMode){ setOpen(true); } }, [globalEditMode]);
 const collapsed = (idx+1)+'. '+(m.message||shortLabel(m))+' '+(inst? (ci.from_role||m.from+'$A'):m.from)+' '+(inst? (ci.to_role||m.to+'$A'):m.to);

 return (<div className={"card "+(selected?'selected':'')}>
 <div className="px-3 py-2 flex items-center justify-between">
 <div className="handle" draggable onDragStart={onDragStartRight}>
 <span className="grip" title="Drag to reorder"></span>
 <button className="text-left font-medium" onClick={()=>{ setSelected(ci.uid); setOpen(o=>!o); }}>{collapsed}</button>
 </div>
 <div className="flex items-center gap-1">
  <IconButton icon="trash" title="Remove" onClick={()=>rm(ci.uid)} />
 </div>
 </div>
 {open && (<CardBody ci={ci} inst={inst} onUpdateMessage={onUpdateMessage} globalEditMode={globalEditMode} />)}
 </div>);
}

function CardBody_old({ci,inst,onUpdateMessage,globalEditMode=false}){
 const m=ci.msg;
 const [isEditing, setIsEditing] = React.useState(Boolean(ci && ci.forceEdit) || Boolean(globalEditMode));
 React.useEffect(function(){ setIsEditing(Boolean(ci && ci.forceEdit) || Boolean(globalEditMode)); }, [globalEditMode, ci]);
 const [editedMsg, setEditedMsg] = React.useState({...m});
 const [primaryRefText, setPrimaryRefText] = React.useState(JSON.stringify(m.primary_ref||{}, null, 2));
 const summary = (m.doc && m.doc.summary_en) ? m.doc.summary_en : '(none)';
 const commentMd = (m.doc && m.doc.comment_md) ? m.doc.comment_md : '';
 const handleSave = () => {
  let parsedPrimary = {};
  try{ parsedPrimary = primaryRefText? JSON.parse(primaryRefText) : {}; }catch(e){ alert('primary_ref 瑙ｆ瀽澶辫触锛岃妫€鏌?JSON'); return; }
  const updated = {...editedMsg, primary_ref: parsedPrimary};
  ci.msg = updated;
  if (onUpdateMessage) onUpdateMessage(updated);
  setIsEditing(Boolean(globalEditMode));
 };
 const handleCancel = () => { setEditedMsg({...m}); setIsEditing(Boolean(globalEditMode)); };
 return (<div className="p-3 space-y-4">
  <div className="flex justify-between items-center">
   <div className="text-lg font-medium">{m.message || shortLabel(m)}</div>
   <div>
    {!isEditing ? (
     <IconButton icon="pencil" size="sm" title="Edit" onClick={()=>{ setEditedMsg({...m}); setIsEditing(true); }} />
    ) : (
     <div className="flex gap-2">
      <IconButton icon="check" size="sm" primary title="Save" onClick={handleSave} />
      <IconButton icon="x" size="sm" title="Cancel" onClick={handleCancel} />
     </div>
    )}
   </div>
  </div>
 <div className="grid grid-cols-2 gap-3">
  <div>
   <div className="text-zinc-400 text-sm">Message</div>
   {isEditing ? (
    <input className="input" value={editedMsg.message||''} onChange={(e)=>setEditedMsg({...editedMsg, message:e.target.value, name:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.message||shortLabel(m)}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">Name</div>
   {isEditing ? (
    <input className="input" value={editedMsg.name||''} onChange={(e)=>setEditedMsg({...editedMsg, name:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.name||''}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">Protocol</div>
   {isEditing ? (
    <input className="input" value={editedMsg.protocol||''} onChange={(e)=>setEditedMsg({...editedMsg, protocol:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.protocol}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">Release</div>
   {isEditing ? (
    <input className="input" value={editedMsg.release||''} onChange={(e)=>setEditedMsg({...editedMsg, release:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.release}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">Interface</div>
   {isEditing ? (
    <input className="input" value={editedMsg.interface||''} onChange={(e)=>setEditedMsg({...editedMsg, interface:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.interface||''}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">Type</div>
   {isEditing ? (
    <input className="input" value={editedMsg.type||''} onChange={(e)=>setEditedMsg({...editedMsg, type:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.type||''}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">ID</div>
   {isEditing ? (
    <input className="input" value={editedMsg.id||''} onChange={(e)=>setEditedMsg({...editedMsg, id:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.id||''}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">From</div>
   {isEditing ? (
    <input className="input" value={editedMsg.from||''} onChange={(e)=>setEditedMsg({...editedMsg, from:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.from||''}</div>
   )}
  </div>
  <div>
   <div className="text-zinc-400 text-sm">To</div>
   {isEditing ? (
    <input className="input" value={editedMsg.to||''} onChange={(e)=>setEditedMsg({...editedMsg, to:e.target.value})}/>
   ) : (
    <div className="font-medium">{m.to||''}</div>
   )}
  </div>
   <div className="col-span-2">
    <div className="text-zinc-400 text-sm mb-1">Summary</div>
    {isEditing ? (
     <textarea className="input min-h-[80px]" value={(editedMsg.doc && editedMsg.doc.summary_en) || ''} onChange={(e)=>setEditedMsg({...editedMsg, doc:{...(editedMsg.doc||{}), summary_en:e.target.value}})}></textarea>
    ) : (
     <div className="leading-relaxed whitespace-pre-wrap">{summary}</div>
    )}
   </div>
 <div className="col-span-2">
  <div className="text-zinc-400 text-sm mb-1">Comment</div>
  {isEditing ? (
   <textarea className="input min-h-[100px]" value={(editedMsg.doc && editedMsg.doc.comment_md) || ''} onChange={(e)=>setEditedMsg({...editedMsg, doc:{...(editedMsg.doc||{}), comment_md:e.target.value}})}></textarea>
  ) : (
   <textarea readOnly className="input min-h-[100px]" value={commentMd.replace(/\n/g,'\n')}></textarea>
  )}
 </div>
 <div className="col-span-2">
  <div className="text-zinc-400 text-sm mb-1">Primary Ref (JSON)</div>
  {isEditing ? (
   <textarea className="input min-h-[80px]" value={primaryRefText} onChange={(e)=>setPrimaryRefText(e.target.value)}></textarea>
  ) : (
   <textarea readOnly className="input min-h-[80px]" value={primaryRefText}></textarea>
  )}
 </div>
  </div>
  {inst && (<div className="grid grid-cols-2 gap-3">
  <div><div className="text-xs text-zinc-400 mb-1">From role</div><RoleSelectRestricted ci={ci} side="from"/></div>
  <div><div className="text-xs text-zinc-400 mb-1">To role</div><RoleSelectRestricted ci={ci} side="to"/></div>
 </div>)}
 <div className="card p-3 space-y-3">
   <div className="font-medium">Information Elements (grouped & nested)</div>
   <IEGroups ci={ci}/>
  </div>
 </div>);
}

function RoleSelectRestricted({ci,side}){
 const [_,force]=useState(0);
 const m=ci.msg;
 const allowed = allowedRolesForSide(m, side);
 const current = side==='from' ? (ci.from_role || (m.from+'$A')) : (ci.to_role || (m.to+'$A'));
 const safeVal = allowed.indexOf(current)>=0 ? current : allowed[0];
 if (safeVal !== current){
 if(side==='from') ci.from_role = safeVal; else ci.to_role = safeVal; force(x=>x+1);
 }
 return (<select className="input" value={safeVal} onChange={(e)=>{
 if(side==='from') ci.from_role = e.target.value; else ci.to_role = e.target.value; force(x=>x+1);
 }}>
 {allowed.map(r=> <option key={r} value={r}>{r}</option>)}
 </select>);
}

// ------------- IE tree grouped by presence and nested -------------
function IEGroups({ci}){
 const [_,force]=useState(0);
 const m=ci.msg, dict=m.ie_dict||{};
 const top = m.ie_tree||[];
 const byP = {M:[], O:[], C:[]};
 top.forEach(n => (byP[n.presence]||byP.O).push(n));
 const groups = [
 {key:'M', title:'Mandatory IE', color:'M'},
 {key:'C', title:'Conditional IE', color:'C'},
 {key:'O', title:'Optional IE', color:'O'}
 ];
 function addTopIE(pres){ const nn={presence:pres||'O', name:'NewIE', $ref:'', children:[]}; m.ie_tree=Array.isArray(top)? top.concat([nn]) : [nn]; force(x=>x+1); }
 return (<div className="space-y-4">
 {groups.map(g=>(
 <div key={g.key} className="space-y-2">
 <div className="flex items-center gap-2">
  <span className={"badge "+g.color}>{g.title}</span>
  <span className="text-xs text-zinc-500">{byP[g.key].length}</span>
  <button className="btn btn-xs" title="Add top-level IE" onClick={()=>addTopIE(g.key)}>Add +</button>
 </div>
 <div className="space-y-2">
 {byP[g.key].map((node,idx)=>(<IETreeNode key={g.key+'-'+idx} ci={ci} node={node} dict={dict} depth={0} force={force} parentChildren={top} nodeIndex={top.indexOf(node)}/>))}
 {byP[g.key].length===0 && <div className="text-xs text-zinc-500">None</div>}
 </div>
 </div>
 ))}
 </div>);
}

function IETreeNode({ci,node,dict,depth,force,parentChildren,nodeIndex}){
 const [editing,setEditing]=React.useState(false);
 const key = refToKey(node.$ref);
 const meta = (dict && dict[key]) ? dict[key] : {};
 const hasChildren = Array.isArray(node.children) && node.children.length>0;
 function _ensureChildren(){ if(!Array.isArray(node.children)) node.children=[]; }
 function _reRender(){ force(x=>x+1); }
 function _delete(){ if(Array.isArray(parentChildren)){ parentChildren.splice(nodeIndex,1); _reRender(); } }
 function _move(delta){ if(!Array.isArray(parentChildren)) return; var i=nodeIndex; var j=i+delta; if(j<0||j>=parentChildren.length) return; const tmp=parentChildren[i]; parentChildren[i]=parentChildren[j]; parentChildren[j]=tmp; _reRender(); }
 function _addChild(){ _ensureChildren(); node.children.push({presence:'O', name:'NewChild', $ref:'', children:[]}); _reRender(); }
 const title = (
  <div className="flex items-center gap-2 items-center">
  <span className={'badge '+(node.presence||'O')}>{node.presence||'O'}</span>
  <span className="font-medium">{node.name||'(unnamed)'}</span>
  {(node.$ref) && <span className="text-[10px] text-zinc-400">$ref: {node.$ref}</span>}
  <div className="flex gap-1 ml-auto">
    <button className="btn btn-xs" onClick={()=>setEditing(v=>!v)}>{editing?'Done':'Edit'}</button>
    {editing && <>
     <button className="btn btn-xs" title="Add child" onClick={_addChild}>+Child</button>
     <button className="btn btn-xs" title="Move up" onClick={()=>_move(-1)}>Up</button>
     <button className="btn btn-xs" title="Move down" onClick={()=>_move(1)}>Down</button>
     <button className="btn btn-xs" title="Delete" onClick={_delete}>Delete</button>
    </>}
   </div>
   {meta && meta.proto_tags && <span className="text-[10px] text-zinc-400">proto: {Object.entries(meta.proto_tags).map(([k,v])=>k+':'+v).join(', ')}</span>}
  </div>
 );

 function setOV(anchor, val){
 ci.ie_overrides = Object.assign({}, (ci.ie_overrides||{}), {[anchor]:val});
 force(x=>x+1);
 }
 function LeafEditor(){
 const t = inputTypeOf(node, meta);
 const anchor = key;
 const cur0 = (ci.ie_overrides||{})[anchor];
 const cur = (cur0===undefined || cur0===null) ? '' : cur0;
 const ph = String(defaultOf(node, meta));
 if(t==='select'){
 const opts = ((meta && meta.enum_doc) ? meta.enum_doc.map(e=>e && e.name).filter(Boolean) : ((node && node.enum) ? node.enum.map(e=>e && e.name).filter(Boolean) : []));
 return (<select className="input" value={cur} onChange={(e)=>setOV(anchor, e.target.value)}><option value="">(use default)</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>);
 }else if(t==='number'){
 return (
 <input
 type="number"
 className="input"
 value={cur === '' ? '' : Number(cur)}
 placeholder={ph}
 onChange={(e) => {
 const v = e.target.value;
 setOV(anchor, v === '' ? '' : (isNaN(e.target.valueAsNumber) ? '' : e.target.valueAsNumber));
 }}
 />
 );
 }
 return (<input className="input" value={cur} placeholder={ph} onChange={(e)=>setOV(anchor, e.target.value)} />);
 }

 if(!hasChildren){
  return (<div className="leaf">
   {title}
   <div className="grid grid-cols-12 gap-3 mt-2">
    <div className="col-span-6">
     <div className="text-xs text-zinc-400">Default</div>
     <div className="text-sm mono break-all">{String(defaultOf(node, meta))}</div>
    </div>
    <div className="col-span-6">
     <div className="text-xs text-zinc-400">Override</div>
     <LeafEditor/>
    </div>
    {meta && meta.desc_en && <div className="col-span-12 text-xs text-zinc-400 mt-1">{meta.desc_en}</div>}
   </div>
   {editing && (
    <details open className="border border-zinc-800 rounded-xl p-3 mt-2">
     <summary className="select-none">缂栬緫灞炴€?/summary>
     <div className="flex items-center gap-2 mt-2">
      <select className="input input-xs w-16" value={node.presence||'O'} onChange={(e)=>{ node.presence=e.target.value; _reRender(); }}>
       <option value="M">M</option>
       <option value="C">C</option>
       <option value="O">O</option>
      </select>
      <input className="input input-xs" style={{width:'12rem'}} value={node.name||''} placeholder="IE name" onChange={(e)=>{ node.name=e.target.value; _reRender(); }}/>
      <input className="input input-xs" style={{width:'12rem'}} value={node.$ref||''} placeholder="$ref (dict key)" onChange={(e)=>{ node.$ref=e.target.value; _reRender(); }}/>
     </div>
    </details>
   )}
   </div>)};
 
 
 return (<details open className="border border-zinc-800 rounded-xl p-3">
  <summary className="select-none">{title}</summary>
   {meta && meta.desc_en && <div className="text-xs text-zinc-400 mt-1">{meta.desc_en}</div>}
   {editing && (
    <details open className="rounded-xl p-3 mt-2 border border-zinc-800">
     <summary className="select-none">缂栬緫灞炴€?/summary>
     <div className="flex items-center gap-2 mt-2">
      <select className="input input-xs w-16" value={node.presence||'O'} onChange={(e)=>{ node.presence=e.target.value; _reRender(); }}>
       <option value="M">M</option>
       <option value="C">C</option>
       <option value="O">O</option>
      </select>
      <input className="input input-xs" style={{width:'12rem'}} value={node.name||''} placeholder="IE name" onChange={(e)=>{ node.name=e.target.value; _reRender(); }}/>
      <input className="input input-xs" style={{width:'12rem'}} value={node.$ref||''} placeholder="$ref (dict key)" onChange={(e)=>{ node.$ref=e.target.value; _reRender(); }}/>
      <div className="flex gap-1">
       <button className="btn btn-xs" title="Add child" onClick={_addChild}>+Child</button>
       <button className="btn btn-xs" title="Move up" onClick={()=>_move(-1)}>Up</button>
       <button className="btn btn-xs" title="Move down" onClick={()=>_move(1)}>Down</button>
       <button className="btn btn-xs" title="Delete" onClick={_delete}>Delete</button>
      </div>
    </div>
   </details>
  )}
  <div className="tree-line mt-2 space-y-2">
   {node.children.map((ch, i)=>(<IETreeNode key={(key||node.name)+'-'+i} ci={ci} node={ch} dict={dict} depth={depth+1} force={force} parentChildren={node.children} nodeIndex={i}/>))}
   </div>
   </details>);
}

function RoleBindings({bindings,setBindings,truth,canvas}){
 const known = useMemo(()=>{
 const s=new Set();
 truth.forEach(m=>{
 const rs = (m.roleset || (m.roles && m.roles.roleset) || []);
 rs.forEach(v=>s.add(v));
 });
 canvas.forEach(c=>{ s.add(c.from_role||c.msg.from+'$A'); s.add(c.to_role||c.msg.to+'$A');});
 return Array.from(s).sort();
 },[truth,canvas]);
 return (<div className="space-y-2 max-h-[40vh] overflow-auto">
 {known.map(v=>(
 <div key={v} className="grid grid-cols-12 gap-2 items-center">
 <div className="col-span-5 text-sm mono">{v}</div>
 <div className="col-span-7"><input className="input" placeholder={'Label for '+v} value={bindings[v]||''} onChange={(e)=>setBindings(Object.assign({}, bindings, {[v]:e.target.value}))}/></div>
 </div>
 ))}
 {known.length===0 && <div className="text-xs text-zinc-500">No roles detected yet.</div>}
 </div>);
}

// ---------- Clean Toast Notification System ----------
 function Toast({ message, type = 'info', duration = 3000, onClose }) {
 const [isVisible, setIsVisible] = React.useState(false);
 const [isHovered, setIsHovered] = React.useState(false);
 
 React.useEffect(() => {
 setIsVisible(true);
 const timer = setTimeout(() => {
 setIsVisible(false);
 setTimeout(onClose, 250);
 }, duration);
 
 return () => clearTimeout(timer);
 }, [duration, onClose]);
 
  const getIcon = () => {
   switch (type) {
   case 'success': return '鉁?;
   case 'error': return '鉁?;
   case 'warning': return '!';
   default: return 'i';
   }
  };
 
 const getStyle = () => {
 switch (type) {
 case 'success': 
 return {
 background: 'rgba(34, 197, 94, 0.08)',
 border: '1px solid rgba(34, 197, 94, 0.15)',
 color: '#16a34a',
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(34, 197, 94, 0.12)'
 };
 case 'error': 
 return {
 background: 'rgba(239, 68, 68, 0.08)',
 border: '1px solid rgba(239, 68, 68, 0.15)',
 color: '#dc2626',
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(239, 68, 68, 0.12)'
 };
 case 'warning': 
 return {
 background: 'rgba(245, 158, 11, 0.08)',
 border: '1px solid rgba(245, 158, 11, 0.15)',
 color: '#d97706',
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(245, 158, 11, 0.12)'
 };
 default: 
 return {
 background: 'rgba(59, 130, 246, 0.08)',
 border: '1px solid rgba(59, 130, 246, 0.15)',
 color: '#2563eb',
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(59, 130, 246, 0.12)'
 };
 }
 };
 
 const style = getStyle();
 
 return (
 <div 
 className={`toast ${isVisible ? 'toast-enter' : 'toast-exit'}`} 
 style={{
 ...style,
 position: 'fixed',
 top: '24px',
 right: '24px',
 zIndex: 9999,
 padding: '14px 18px',
 borderRadius: '8px',
 backdropFilter: 'blur(12px)',
 display: 'flex',
 alignItems: 'center',
 gap: '10px',
 minWidth: '280px',
 maxWidth: '500px', // width: 'auto', // 
 maxHeight: '120px', // fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
 fontSize: '13px',
 fontWeight: '450',
 lineHeight: '1.4',
 position: 'relative',
 boxSizing: 'border-box',
 cursor: 'pointer',
 transition: 'all 0.2s ease-out'
 }}
 onMouseEnter={() => setIsHovered(true)}
 onMouseLeave={() => setIsHovered(false)}
 onClick={onClose}
 >
 <div style={{
 width: '20px',
 height: '20px',
 borderRadius: '50%',
 background: 'rgba(255, 255, 255, 0.2)',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 fontSize: '11px',
 fontWeight: '600',
 flexShrink: 0
 }}>{getIcon()}</div>
 <span style={{ 
 flex: 1, 
 wordBreak: 'break-word',
 overflowWrap: 'break-word',
 hyphens: 'auto'
 }}>{message}</span>
 <div className="toast-progress"></div>
 </div>
 );
}

// Elegant Toast System - Fixed top-right position
function ToastContainer() {
 const [toasts, setToasts] = React.useState([]);
 
 // Simple and clean showToast function
 window.showToast = function(message, type = 'info', duration = 3000) {
 const id = Date.now() + Math.random();
 setToasts(prev => [...prev, { id, message, type, duration }]);
 return id;
 };
 
 // Clean all toasts
 window.clearAllToasts = function() {
 setToasts([]);
 };
 
 const removeToast = (id) => {
 setToasts(prev => prev.filter(toast => toast.id !== id));
 };
 
 return (
 <div style={{
 position: 'fixed',
 top: '24px',
 right: '24px',
 zIndex: 9999,
 display: 'flex',
 flexDirection: 'column',
 gap: '12px',
 maxHeight: 'calc(100vh - 48px)',
 overflow: 'visible'
 }}>
 {toasts.map((toast, index) => (
 <div key={toast.id} style={{
 transform: `translateY(${index * 0}px)`,
 transition: 'all 0.3s ease-out'
 }}>
 <Toast
 message={toast.message}
 type={toast.type}
 duration={toast.duration}
 onClose={() => removeToast(toast.id)}
 />
 </div>
 ))}
 </div>
 );
}

// Enhanced App with Toast support
function AppWithToast() {
 // Add CSS animations
 React.useEffect(() => {
 const style = document.createElement('style');
 style.textContent = `
 @keyframes slideInRight {
 from {
 transform: translateX(100%) translateY(-10px);
 opacity: 0;
 }
 to {
 transform: translateX(0) translateY(0);
 opacity: 1;
 }
 }
 
 @keyframes slideOutRight {
 from {
 transform: translateX(0) translateY(0);
 opacity: 1;
 }
 to {
 transform: translateX(100%) translateY(-10px);
 opacity: 0;
 }
 }
 
 @keyframes fadeProgress {
 from {
 width: 100%;
 opacity: 0.6;
 }
 to {
 width: 0%;
 opacity: 0;
 }
 }
 
 .toast-enter {
 animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
 }
 
 .toast-exit {
 animation: slideOutRight 0.25s ease-out forwards;
 }
 
 .toast-progress {
 position: absolute;
 bottom: 0;
 left: 0;
 height: 2px;
 background: currentColor;
 border-radius: 0 0 8px 8px;
 animation: fadeProgress ${3000}ms linear forwards;
 opacity: 0.3;
 }
 
 .toast:hover .toast-progress {
 animation-play-state: paused;
 }
 
 `;
 document.head.appendChild(style);
 
 return () => {
 document.head.removeChild(style);
 };
 }, []);
 
  return (
   <React.Fragment>
    <App />
    <ToastContainer />
   </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<AppWithToast/>);
})();


 const TEMPLATE = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n <meta charset=\"UTF-8\" />\n <title>5GC \u4fe1\u4ee4\u6d41\u7a0b\u56fe - \u53ef\u8c03\u5e03\u5c40 (\u652f\u6301\u7f29\u653e/\u5e73\u79fb)</title>\n <style>\n /* ===== \u57fa\u7840\u5e03\u5c40 ===== */\n html,body{margin:0;padding:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;}\n #container{display:flex;height:100vh;overflow:hidden;}\n\n /* ===== \u5de6\u4fa7\u4fe1\u4ee4\u56fe\u5bb9\u5668 =====\n \u4fee\u590d\uff1a\u53bb\u6389\u539f\u5148\u7684 cursor:grab; \u4ee5\u514d\u5728\u5de6\u4fa7\u7a7a\u767d\u533a\u57df\u51fa\u73b0\u201c\u5c0f\u624b\u638c\u201d\u6307\u9488 */\n #diagram-container{flex:1;position:relative;overflow:hidden;}\n\n #header-names{position:absolute;top:0;left:0;right:0;height:50px;background:#fff;border-bottom:1px solid #eee;overflow:hidden;pointer-events:none;}\n #header-names-inner{position:absolute;top:0;left:0;height:100%;}\n #header-names-inner .node-name{position:absolute;top:50%;transform:translate(-50%,-50%);font-size:14px;color:#333;}\n #diagram-body{position:absolute;top:50px;bottom:0;left:0;right:0;overflow:auto;}\n #diagram{display:block;}\n\n /* ===== \u5782\u76f4\u5206\u9694\u6761 ===== */\n #vertical-divider{width:5px;background:#ddd;cursor:col-resize;user-select:none;}\n\n /* ===== \u53f3\u4fa7\u9762\u677f ===== */\n #viewer-wrapper{width:400px;display:flex;flex-direction:column;overflow:hidden;}\n #viewer-header{flex:none;padding:10px 12px;background:#f5f5f5;border-bottom:1px solid #ccc;font-weight:bold;}\n\n /* ===== \u53f3\u4fa7\u4e0a\u4e0b\u5206\u533a\u7236\u5bb9\u5668 ===== */\n #right-detail{position:relative;flex:1;min-height:0;}\n\n /* ===== \u53f3\u4fa7\u4e0a\u4e0b\u5185\u5bb9\u533a ===== */\n #json-viewer {\n position:absolute;left:0;right:0;\n padding:10px;font-size:14px;line-height:1.4;\n overflow-y:auto;box-sizing:border-box;\n }\n #comment-viewer {\n position:absolute;left:0;right:0;\n padding:10px;font-size:14px;line-height:1.4;\n overflow-y:auto;box-sizing:border-box;\n }\n #json-viewer details{margin-left:12px;margin-bottom:4px;}\n #json-viewer summary{cursor:pointer;}\n\n /* ===== \u6c34\u5e73\u5206\u9694\u6761 ===== */\n #horizontal-divider{\n position:absolute;left:0;right:0;height:5px;background:#ddd;\n cursor:row-resize;user-select:none;\n }\n\n /* ===== \u4fe1\u4ee4\u6587\u5b57\u6807\u7b7e ===== */\n .message-label{cursor:default;}\n .message-label:hover{fill:#007ACC;}\n\n #comment-content {\n max-width: 800px;\n margin: 0 auto;\n word-wrap: break-word;\n overflow-wrap: break-word;\n }\n #comment-content code {\n font-family: Consolas,\"Courier New\",monospace;\n background-color: #f5f5f5;\n padding: 2px 4px;\n border-radius: 3px;\n }\n #comment-content pre code {\n background-color: transparent;\n padding: 0;\n }\n #comment-content pre {\n background-color: #f5f5f5;\n padding: 10px;\n border-radius: 3px;\n overflow-x: auto;\n }\n #comment-content ul, #comment-content ol {\n margin: 0.5em 0;\n padding-left: 1.5em;\n }\n #comment-content li {\n margin: 0.2em 0;\n }\n #comment-viewer::-webkit-scrollbar {\n width: 8px;\n height: 8px;\n }\n #comment-viewer::-webkit-scrollbar-thumb {\n background-color: rgba(0,0,0,0.3);\n border-radius: 4px;\n }\n #comment-viewer::-webkit-scrollbar-track {\n background-color: #f5f5f5;\n }\n </style>\n\n <style id=\"addon-style\">\n .message-label.selected{fill:#ff5722;font-weight:bold;}\n </style>\n</head>\n<body>\n<script>window.__FLOW__={\"nodes\": [\"gNB\", \"AMF\"], \"messages\": [{\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"1 NG Setup Request\", \"info\": {\"header\": {\"msg\": \"NG Setup Request\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.NGSetupRequest.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"ngSetupRequest\", \"Global RAN Node ID [Mandatory]\": {\"Global gNB ID [C]\": {\"PLMN Identity [Mandatory]\": \"0010F1\", \"gNB ID [Mandatory]\": {\"gNB-ID [C]\": \"000001\"}}}, \"RAN Node Name [Optional]\": \"gNB-Site-123\", \"Supported TA List [Mandatory]\": {\"Supported TAI Item [Mandatory]\": {\"TAI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"0010F1\", \"TAC [Mandatory]\": \"000001\"}, \"Broadcast PLMN List [Mandatory]\": {\"Broadcast PLMN Item [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"0010F1\", \"TAI Slice Support List [Mandatory]\": {\"S-NSSAI [Mandatory]\": {\"SST [Mandatory]\": \"01\", \"SD [Optional]\": \"000001\"}}}}}}, \"Default Paging DRX [Mandatory]\": \"v128\"}}, \"comment\": \"**NG Setup Request** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends the NG Setup Request to an AMF to establish the NG interface instance between them. This message initializes the N2 interface by providing the gNB's identity, its supported tracking areas, and default paging configuration.\\n\\n### Purpose\\n\\\"The NG Setup procedure is used to initialise the NG interface. This procedure exchanges application level data needed for the NG-RAN node and the AMF to interoperate correctly on the NG interface.\\\" (TS 38.413 \u00a78.7.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"An NG-RAN node initiates the procedure by sending the NG SETUP REQUEST message to an AMF.\\\" This is the first NGAP message sent on a new SCTP association towards an AMF. (TS 38.413 \u00a78.7.1.2 V18.4.0)\\n\\n### Key IEs\\n- **Global RAN Node ID**: Uniquely identifies the gNB within the PLMN. (TS 38.413 \u00a79.3.1.1 V18.4.0)\\n- **Supported TA List**: Informs the AMF which Tracking Areas the gNB serves, allowing the AMF to build its TA-to-gNB mapping. (TS 38.413 \u00a79.3.1.3 V18.4.0)\\n- **Default Paging DRX**: Specifies the default paging cycle length the gNB will use for UEs in RRC_IDLE. (TS 38.413 \u00a79.3.1.16 V18.4.0)\\n\\n### Error Handling\\n\\\"If the AMF cannot accept the setup it shall respond with an NG SETUP FAILURE message and appropriate cause value.\\\" Common reasons include \\\"RAN node unknown\\\" or \\\"Unsupported TAI\\\". (TS 38.413 \u00a78.7.1.3 V18.4.0)\\n\\n### State Management\\nUpon successful completion, the NG interface is considered operational, and the AMF can start sending other NGAP messages to the gNB. (TS 38.413 \u00a78.7.1.3 V18.4.0)\\n\\n### Procedure Steps\\n1. The gNB establishes an SCTP association with a selected AMF. (TS 38.413 \u00a78.7.1.2)\\n2. The gNB sends the NG SETUP REQUEST message, including its Global RAN Node ID and a list of supported TAs. (TS 38.413 \u00a78.7.1.2)\\n3. The AMF verifies if it can support the gNB (e.g., based on the Global RAN Node ID and supported TAs). (TS 38.413 \u00a78.7.1.3)\\n4. If accepted, the AMF responds with NG SETUP RESPONSE. If not, it sends NG SETUP FAILURE. (TS 38.413 \u00a78.7.1.3)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"2 NG Setup Response\", \"info\": {\"header\": {\"msg\": \"NG Setup Response\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.NGSetupResponse.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"successfulOutcome\", \"AMF Name [Mandatory]\": \"amf-01.example.com\", \"Served GUAMI List [Mandatory]\": {\"Served GUAMI Item [Mandatory]\": {\"GUAMI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"AMF Region ID [Mandatory]\": \"11001100\", \"AMF Set ID [Mandatory]\": \"0000000001\", \"AMF Pointer [Mandatory]\": \"000001\"}}}, \"Relative AMF Capacity [Mandatory]\": 100, \"PLMN Support List [Mandatory]\": {\"PLMN Support Item [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"Slice Support List [Mandatory]\": {\"Slice Support Item [Mandatory]\": {\"S-NSSAI [Mandatory]\": {\"SST [Mandatory]\": \"01\", \"SD [Optional]\": \"000001\"}}}}}, \"UE Retention Information [Optional]\": \"ues-retained\"}}, \"comment\": \"**NG Setup Response** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the NG Setup Response to a gNB to acknowledge the NG Setup Request. This message finalizes the establishment of the N2 interface by providing the gNB with essential AMF configuration details, including its name, served GUAMIs, relative capacity, and supported PLMNs with their associated network slices.\\n\\n### Purpose\\n\\\"The purpose of the NG Setup procedure is to exchange application level data needed for the NG-RAN node and the AMF to interoperate correctly on the NG interface.\\\" (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"If the AMF can accept the setup, it shall respond with the NG SETUP RESPONSE message.\\\" (TS 38.413 \u00a78.2.1.3 V18.4.0)\\n\\n### Key IEs\\n- **AMF Name**: A human-readable name for the AMF.\\n- **Served GUAMI List**: The list of Globally Unique AMF Identifiers (GUAMIs) served by this AMF. This allows the gNB to perform AMF selection for UEs.\\n- **Relative AMF Capacity**: An integer value indicating the relative capacity of the AMF, used by the gNB for load balancing.\\n- **PLMN Support List**: A list of PLMNs supported by the AMF, along with the S-NSSAIs supported within each PLMN.\\n\\n### Error Handling\\nThis message represents the successful outcome of the NG Setup procedure. The failure case is handled by the NG SETUP FAILURE message, which includes a Cause IE (e.g., 'Miscellaneous', 'RAN node unknown'). (TS 38.413 \u00a78.2.1.4 V18.4.0)\\n\\n### State Transition\\nUpon successful completion of this procedure, the N2 interface between the gNB and the AMF is considered operational and ready for UE-associated and non-UE-associated signaling. (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Procedure Steps\\n1. The gNB initiates the procedure by sending an NG SETUP REQUEST message to the AMF. (TS 38.413 \u00a78.2.1.2)\\n2. If the AMF can accept the setup, it responds with the NG SETUP RESPONSE message, including its configuration data. (TS 38.413 \u00a78.2.1.3)\\n3. The gNB stores the received information and considers the N2 interface operational. It can now initiate other procedures, such as RAN Configuration Update if needed. (TS 38.413 \u00a78.2.1.3)\\n4. If the AMF cannot accept the setup, it sends an NG SETUP FAILURE message with a cause value. (TS 38.413 \u00a78.2.1.4)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"3 Initial UE Message\", \"info\": {\"header\": {\"msg\": \"Initial UE Message\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.InitialUEMessage.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"initiatingMessage\", \"Procedure Code [Mandatory]\": 15, \"RAN UE NGAP ID [Mandatory]\": 1, \"NAS-PDU [Mandatory]\": \"7e004179000d0102f600000000000000000000\", \"User Location Information [Mandatory]\": {\"User Location Information NR [C]\": {\"NR CGI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"001f01\", \"NR Cell Identity [Mandatory]\": \"000000001\"}, \"TAI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"001f01\", \"TAC [Mandatory]\": \"000001\"}}}, \"RRC Establishment Cause [Mandatory]\": \"mo-Data\", \"UE Context Request [Optional]\": \"requested\"}}, \"comment\": \"**Initial UE Message** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB initiates this procedure to establish a UE-associated logical NG-connection with the AMF. It forwards the first uplink NAS message received from the UE, along with UE location and radio context information, enabling the AMF to create a UE context.\\n\\n### Purpose\\n\\\"The Initial UE Message procedure is used when the NG-RAN node has received from the radio interface the first uplink NAS message to be forwarded to an AMF.\\\" (TS 38.413 \u00a78.6.1.1 V18.4.0)\\n\\n### Triggers\\nThis procedure is triggered when a UE, for which no UE-associated logical NG-connection exists, sends its first NAS message (e.g., Registration Request) to the gNB. \\\"The NG-RAN node initiates the procedure by sending an INITIAL UE MESSAGE message to the AMF. When sending the INITIAL UE MESSAGE message, the NG-RAN node shall allocate a unique RAN UE NGAP ID...\\\" (TS 38.413 \u00a78.6.1.2 V18.4.0)\\n\\n### Key Information Elements\\n- **RAN UE NGAP ID**: Uniquely identifies the UE on the gNB.\\n- **NAS-PDU**: The transparent container for the NAS message from the UE.\\n- **User Location Information**: Provides the UE's current cell (NR-CGI) and Tracking Area (TAI).\\n- **RRC Establishment Cause**: Informs the AMF about the reason for the RRC connection (e.g., mobile originating data, emergency).\\n- **5G-S-TMSI (Optional)**: If available from the RRC procedure, it helps the AMF to find an existing UE context.\\n- **UE Context Request (Optional)**: Indicates that the gNB requests the AMF to establish a UE context and respond with an INITIAL CONTEXT SETUP REQUEST.\\n\\n### AMF Actions\\nUpon receiving the Initial UE Message, the AMF uses the information to identify the UE and create a UE context. If the `UE Context Request` IE is present, the AMF will initiate the Initial Context Setup procedure. If a `5G-S-TMSI` is included, the AMF uses it to locate the UE's context. If the AMF is not the correct one to serve the UE, it may reroute the message to another AMF based on the `AMF Set ID` or `GUAMI`. (TS 38.413 \u00a78.6.1.2 V18.4.0)\\n\\n### Error Handling\\n\\\"If the 5G-S-TMSI is not received in the INITIAL UE MESSAGE message whereas the AMF expected it, the AMF shall consider the procedure as failed.\\\" (TS 38.413 \u00a78.6.1.3 V18.4.0) Other failures can occur due to resource unavailability or protocol errors, leading to the procedure's failure and potential release of the UE connection.\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"4 Downlink NAS Transport\", \"info\": {\"header\": {\"msg\": \"Downlink NAS Transport\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.DownlinkNASTransport.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"downlinkNASTransport\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"NAS-PDU [Mandatory]\": \"7E025D01...\", \"Mobility Restriction List [Optional]\": {\"Serving PLMN [Mandatory]\": \"00101\", \"Equivalent PLMNs [Optional]\": \"absent\"}, \"UE Aggregate Maximum Bit Rate [Optional]\": {\"UE Aggregate Maximum Bit Rate Downlink [Mandatory]\": 2000000000, \"UE Aggregate Maximum Bit Rate Uplink [Mandatory]\": 1000000000}}}, \"comment\": \"**Downlink NAS Transport** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends this message to the gNB to transparently forward a NAS message to the UE. This is a fundamental message for any downlink communication initiated by the core network towards a UE in CM-CONNECTED state.\\n\\n### Purpose\\n\\\"This procedure is used to carry a NAS message transparently from the AMF to the UE over the NG-RAN.\\\" (TS 38.413 \u00a78.6.2.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF initiates the procedure by sending a DOWNLINK NAS TRANSPORT message.\\\" (TS 38.413 \u00a78.6.2.2 V18.4.0). This is triggered whenever the AMF has a NAS message to deliver to a specific UE that has an active N2 connection.\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: A pair of identifiers that uniquely locate the UE context on the N2 interface. (TS 38.413 \u00a79.3.3.1, \u00a79.3.3.2)\\n- **NAS-PDU**: The encapsulated NAS message, which is opaque to the gNB. (TS 38.413 \u00a79.3.1.2)\\n- **Mobility Restriction List**: Optionally included to update the UE's mobility restrictions (e.g., forbidden TAs). (TS 38.413 \u00a79.3.1.13)\\n- **UE Aggregate Maximum Bit Rate**: Optionally included to update the UE's aggregate bit rate limits for all its non-GBR PDU sessions. (TS 38.413 \u00a79.3.1.15)\\n\\n### Error Handling\\n\\\"If the NG-RAN node receives a DOWNLINK NAS TRANSPORT message for a UE for which no UE-associated logical NG-connection exists on the NG-RAN node instance, the NG-RAN node shall send an ERROR INDICATION message to the AMF with an appropriate cause value.\\\" (TS 38.413 \u00a78.6.2.3 V18.4.0)\\n\\n### Security\\nThe NAS-PDU is transported transparently by the NGAP protocol. Security (integrity protection and ciphering) of the NAS message is handled by the NAS layer between the UE and the AMF as specified in TS 24.501 and TS 33.501.\\n\\n### Procedure Steps\\n1. The AMF needs to send a NAS message (e.g., Registration Accept, Security Mode Command, PDU Session Establishment Accept) to a UE in CM-CONNECTED state. (TS 23.502)\\n2. The AMF constructs the DOWNLINK NAS TRANSPORT message, including the AMF UE NGAP ID and RAN UE NGAP ID to identify the UE-associated logical connection, and embeds the NAS message in the NAS-PDU IE. (TS 38.413 \u00a78.6.2.2)\\n3. The AMF sends the message to the serving gNB.\\n4. The gNB uses the NGAP IDs to retrieve the UE context and forwards the NAS-PDU to the UE via an RRC DownlinkInformationTransfer message. (TS 38.331)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"5 Uplink NAS Transport\", \"info\": {\"header\": {\"msg\": \"Uplink NAS Transport\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.UplinkNASTransport.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"uplinkNASTransport\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"NAS-PDU [Mandatory]\": \"00\", \"User Location Information [Optional]\": {\"NR user location information [C]\": {\"NR CGI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"NR Cell Identity [Mandatory]\": \"0000000001\"}, \"TAI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"TAC [Mandatory]\": \"000001\"}, \"Age of Location [Optional]\": \"2025-09-10T00:00:00Z\"}}}}, \"comment\": \"**Uplink NAS Transport** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB uses this procedure to forward a NAS message from the UE to the AMF over an existing UE-associated logical NG-connection. This message is used for subsequent uplink NAS signaling after the initial context has been established.\\n\\n### Purpose\\n\\\"The purpose of the Uplink NAS Transport procedure is to carry NAS information over the NG interface.\\\" (TS 38.413 \u00a78.6.3.1 V18.4.0)\\n\\n### Triggers\\n\\\"The NG-RAN node initiates the procedure by sending an UPLINK NAS TRANSPORT message to the AMF. The NG-RAN node shall use the UE-associated logical NG-connection for this procedure.\\\" (TS 38.413 \u00a78.6.3.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: These two IDs together uniquely identify the UE-associated logical connection over the N2 interface. (TS 38.413 \u00a78.6.3.2)\\n- **NAS-PDU**: Contains the NAS message from the UE, which is transferred transparently by the gNB.\\n- **User Location Information**: Provides the AMF with the UE's current location (cell and tracking area).\\n\\n### Error Handling\\nIf the AMF UE NGAP ID is unknown to the AMF, the AMF will send an ERROR INDICATION message to the gNB with the cause \\\"Unknown AMF UE NGAP ID\\\". (TS 38.413 \u00a78.6.3.3)\\n\\n### Relationship to other messages\\nThis message is paired with the Downlink NAS Transport message, which is used by the AMF to send NAS messages to the UE via the gNB. It is used after the Initial UE Message and Initial Context Setup procedures have successfully established a UE context in both the gNB and AMF.\\n\\n### Procedure Steps\\n1) The UE sends an uplink NAS message to the gNB (e.g., a PDU Session Modification Request). (TS 24.501) 2) The gNB encapsulates the NAS message into the NAS-PDU IE of an Uplink NAS Transport message. 3) The gNB includes the AMF UE NGAP ID and its own RAN UE NGAP ID to identify the UE context. (TS 38.413 \u00a78.6.3.2) 4) The gNB sends the Uplink NAS Transport message to the AMF. 5) The AMF processes the NAS message and may respond with a Downlink NAS Transport message.\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"6 Initial Context Setup Request\", \"info\": {\"header\": {\"msg\": \"Initial Context Setup Request\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.InitialContextSetupRequest.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"initialContextSetupRequest\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"UE Aggregate Maximum Bit Rate [Mandatory]\": {\"UE Aggregate Maximum Bit Rate DL [Mandatory]\": \"1000000000\", \"UE Aggregate Maximum Bit Rate UL [Mandatory]\": \"500000000\"}, \"GUAMI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"AMF Region ID [Mandatory]\": \"10\", \"AMF Set ID [Mandatory]\": \"01\", \"AMF Pointer [Mandatory]\": \"01\"}, \"PDU Session Resource Setup Request List [Mandatory]\": {\"PDU Session Resource Setup Request Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 1, \"S-NSSAI [Mandatory]\": {\"SST [Mandatory]\": \"01\", \"SD [Optional]\": \"000001\"}, \"PDU Session Type [Mandatory]\": \"ipv4\", \"QoS Flow Setup Request List [Mandatory]\": {\"QoS Flow Setup Request Item [Mandatory]\": {\"QoS Flow Identifier [Mandatory]\": 9, \"QoS Flow Level QoS Parameters [Mandatory]\": \"present\"}}}}, \"Allowed NSSAI [Mandatory]\": {\"Allowed NSSAI Item [Mandatory]\": {\"S-NSSAI [Mandatory]\": \"present\"}}, \"UE Security Capabilities [Mandatory]\": {\"NR encryption algorithms [Mandatory]\": \"10\", \"NR integrity protection algorithms [Mandatory]\": \"10\", \"E-UTRA encryption algorithms [Mandatory]\": \"10\", \"E-UTRA integrity protection algorithms [Mandatory]\": \"10\"}, \"Security Key [Mandatory]\": \"0000000000000000000000000000000000000000000000000000000000000000\"}}, \"comment\": \"**Initial Context Setup Request** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the Initial Context Setup Request to the gNB to establish the UE context. This message carries essential information for setting up the user plane, including PDU session resources, QoS flows, and security parameters, thereby creating the UE-associated logical N2 connection. (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Purpose\\n\\\"The purpose of the Initial Context Setup procedure is to establish the UE Context in the NG-RAN node, if not already established, and to provide the NG-RAN node with the necessary information to set up the radio resources for the UE.\\\" (TS 38.413 \u00c2\u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF initiates the procedure by sending the INITIAL CONTEXT SETUP REQUEST message.\\\" This typically happens after the AMF has processed an Initial UE Message and has sufficient information to create a UE context. (TS 38.413 \u00c2\u00a78.2.1.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Correlate the UE context between AMF and gNB.\\n- **PDU Session Resource Setup Request List**: Defines the PDU sessions and their associated QoS flows to be set up.\\n- **UE Security Capabilities & Security Key**: Used to establish AS security between the UE and gNB.\\n- **Allowed NSSAI**: Informs the gNB of the slices the UE is permitted to use.\\n- **UE Aggregate Maximum Bit Rate**: Enforces an overall data rate limit for the UE.\\n\\n### Error Handling\\n\\\"If the NG-RAN node is not able to establish a UE context, it shall reject the request by sending the INITIAL CONTEXT SETUP FAILURE message to the AMF.\\\" Reasons can include resource unavailability or radio link issues. Partial success/failure (at the PDU session or QoS flow level) is reported in the INITIAL CONTEXT SETUP RESPONSE message. (TS 38.413 \u00c2\u00a78.2.1.3 V18.4.0)\\n\\n### Procedure Steps\\n1. After receiving an Initial UE Message, the AMF decides to establish a UE context. It allocates an AMF UE NGAP ID. (TS 38.413 \u00c2\u00a78.2.1.2)\\n2. The AMF sends the Initial Context Setup Request to the gNB, including the AMF and RAN UE NGAP IDs for correlation.\\n3. The message contains the PDU Session Resource Setup Request List, which details each PDU session to be established, including S-NSSAI, QoS flow parameters, and the UL NG-U transport layer information (GTP Tunnel Endpoint).\\n4. It also includes UE-level information like UE Security Capabilities, the Security Key (K_gNB), UE Aggregate Maximum Bit Rate, and the Allowed NSSAI. (TS 38.413 \u00c2\u00a79.2.2.1)\\n5. Upon receiving this message, the gNB attempts to establish the requested radio resources and user plane resources. It then responds with an Initial Context Setup Response or Failure message. (TS 38.413 \u00c2\u00a78.2.1.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"7 Initial Context Setup Response\", \"info\": {\"header\": {\"msg\": \"Initial Context Setup Response\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.InitialContextSetupResponse.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"initialContextSetupResponse\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource Setup List SURes [Optional]\": {\"PDU Session Resource Setup Item SURes [Mandatory]\": {\"PDU Session ID [Mandatory]\": 1, \"PDU Session Resource Setup Response Transfer [Mandatory]\": \"00\"}}, \"PDU Session Resource Failed to Setup List SURes [Optional]\": {\"PDU Session Resource Failed to Setup Item SURes [Mandatory]\": {\"PDU Session ID [Mandatory]\": 2, \"Cause [Mandatory]\": {\"Radio Network [C]\": \"radio-resources-not-available\"}}}, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**Initial Context Setup Response** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends the Initial Context Setup Response to the AMF to confirm the setup of a UE context. It indicates which PDU sessions were successfully established and which failed, providing failure causes for the latter.\\n\\n### Purpose\\n\\\"This message is sent by the NG-RAN node to inform the AMF that the UE context has been established in the NG-RAN node.\\\" (TS 38.413 \u00a78.7.2.1 V18.4.0)\\n\\n### Triggers\\n\\\"The NG-RAN node initiates the INITIAL CONTEXT SETUP RESPONSE procedure after it has successfully configured the UE with the security information and the UE capabilities are established.\\\" (TS 38.413 \u00a78.7.2.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Correlate the UE context between AMF and gNB.\\n- **PDU Session Resource Setup List SURes**: Reports successfully established PDU sessions, each with a transparent container carrying setup results for the SMF.\\n- **PDU Session Resource Failed to Setup List SURes**: Reports PDU sessions that could not be established, each with a specific cause.\\n\\n### Error Handling\\nIf the gNB cannot establish any UE context, it sends an Initial Context Setup Failure message instead. Partial success/failure is handled within this response message by populating the two lists accordingly. (TS 38.413 \u00a78.7.3.1 V18.4.0)\\n\\n### Procedure Steps\\n1) The gNB receives an Initial Context Setup Request from the AMF. 2) The gNB attempts to establish the requested PDU session resources and configure the UE with the provided security context and configuration. 3) The gNB sends the Initial Context Setup Response, including the AMF and RAN UE NGAP IDs. 4) For each PDU session, the gNB includes it in either the 'PDU Session Resource Setup List' (if successful) or the 'PDU Session Resource Failed to Setup List' (if failed). 5) A successful setup item includes a transparent transfer container with radio resource configuration results. A failed item includes a cause value. (TS 38.413 \u00a78.7.2.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"8 Initial Context Setup Failure\", \"info\": {\"header\": {\"msg\": \"Initial Context Setup Failure\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.InitialContextSetupFailure.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"initialContextSetup\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"Cause [Mandatory]\": {\"Radio Network [C]\": \"radio-resources-not-available\"}, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**Initial Context Setup Failure** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends this message to the AMF to indicate that the setup of the UE context could not be completed successfully. This is a response to an Initial Context Setup Request.\\n\\n### Purpose\\n\\\"The Initial Context Setup procedure is used by the NG-RAN node to indicate to the AMF that the setup of the UE context could not be completed successfully.\\\" (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\nThis message is sent by the gNB if it cannot fulfill the Initial Context Setup Request from the AMF. Common reasons include failure to establish required radio resources, invalid PDU Session or QoS Flow configurations provided by the AMF, or other internal gNB errors. (TS 38.413 \u00a78.2.1.3 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID / RAN UE NGAP ID**: Correlate the procedure to a specific UE.\\n- **Cause**: Provides the specific reason for the failure, categorized into groups like Radio Network, Transport, NAS, Protocol, or Miscellaneous.\\n- **Criticality Diagnostics**: Included if the failure is due to a protocol error, helping to debug mismatched specifications or implementations. (TS 38.413 \u00a79.2.2.3 V18.4.0)\\n\\n### Consequence\\nUpon receiving this failure message, the AMF will typically abort the ongoing connection setup for the UE and may release the N2 signaling connection. (TS 38.413 \u00a78.2.1.3 V18.4.0)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"9 UE Context Release Request\", \"info\": {\"header\": {\"msg\": \"UE Context Release Request\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.UEContextReleaseRequest.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"uEContextReleaseRequest\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource List [Mandatory]\": {\"PDU Session Resource Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5}}, \"Cause [Mandatory]\": {\"Radio Network Cause [C]\": \"user-inactivity\"}}}, \"comment\": \"**UE Context Release Request** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends this message to the AMF to request the release of the UE-associated logical NG-connection and its associated resources.\\n\\n### Purpose\\n\\\"The purpose of the UE Context Release Request procedure is to enable the NG-RAN node to request the AMF to release the UE-associated logical NG-connection.\\\" (TS 38.413 \u00a78.3.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The NG-RAN node initiates the procedure by sending a UE CONTEXT RELEASE REQUEST message. This message is sent when the NG-RAN node has determined that the UE-associated logical NG-connection should be released.\\\" (TS 38.413 \u00a78.3.2.2 V18.4.0)\\nCommon reasons include:\\n- User inactivity\\n- Radio connection with UE lost\\n- Successful handover to another system\\n- Completion of a procedure (e.g., Deregistration)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Uniquely identify the UE context to be released.\\n- **PDU Session Resource List**: Lists the PDU sessions that were established for the UE, which will be released.\\n- **Cause**: Specifies the reason for the release request, categorized into Radio Network, Transport, NAS, Protocol, or Miscellaneous.\\n\\n### Error Handling\\nIf the AMF receives this message for an unknown UE context (i.e., unknown AMF UE NGAP ID), it shall send an ERROR INDICATION message to the NG-RAN node with an appropriate cause value. (TS 38.413 \u00a78.3.2.3)\\n\\n### Subsequent Action\\nAfter sending this request, the gNB should expect a UE CONTEXT RELEASE COMMAND from the AMF to confirm the release and clean up the remaining resources. (TS 38.413 \u00a78.3.2.2)\\n\\n### Procedure Steps\\n1. The gNB decides to release the UE context for a specific reason (e.g., UE inactivity, radio link loss, successful handover). (TS 38.413 \u00a78.3.2.2)\\n2. The gNB sends the UE CONTEXT RELEASE REQUEST message to the AMF, including the UE NGAP IDs and a cause value indicating the reason for release. (TS 38.413 \u00a79.2.3.3)\\n3. The message must include a list of PDU sessions that were active for the UE. (TS 38.413 \u00a79.2.3.3)\\n4. Upon receiving this message, the AMF initiates the release of the UE context by sending a UE CONTEXT RELEASE COMMAND back to the gNB. (TS 38.413 \u00a78.3.2.3)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"10 UE Context Release Command\", \"info\": {\"header\": {\"msg\": \"UE Context Release Command\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.UEContextReleaseCommand.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"ueContextReleaseCommand\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource List [Optional]\": {\"PDU Session Resource Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"PDU Session Resource Release Command Transfer [Mandatory]\": \"00\"}}, \"Cause [Mandatory]\": {\"nas [C]\": \"user-inactivity\"}}}, \"comment\": \"**UE Context Release Command** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the UE Context Release Command to the gNB to initiate the release of the UE-associated logical NG-connection and all associated signaling and user-plane resources at the NG-RAN node.\\n\\n### Purpose\\n\\\"The purpose of the UE Context Release procedure is to enable the AMF to request the NG-RAN node to release the UE-associated logical NG-connection.\\\" (TS 38.413 \u00a78.3.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF initiates the procedure by sending the UE CONTEXT RELEASE COMMAND message.\\\" This can be triggered by various events, including: \\\"the UE-associated logical NG-connection is lost\\\", \\\"the UE's entry into CM-IDLE state\\\", \\\"the initiation of the handover procedure to a target NG-RAN node\\\", or \\\"handover to a non-3GPP access network\\\". (TS 38.413 \u00a78.3.1.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Uniquely identify the UE context to be released.\\n- **Cause**: Specifies the reason for the release (e.g., NAS reason, Radio Network reason).\\n- **PDU Session Resource List**: An optional list of PDU sessions to be released, each containing a transparent container from the SMF.\\n\\n### Error Handling\\n\\\"If the NG-RAN node receives a UE CONTEXT RELEASE COMMAND message for a UE for which no UE context exists, the NG-RAN node shall reply with a UE CONTEXT RELEASE COMPLETE message and ignore the content of the UE CONTEXT RELEASE COMMAND message.\\\" (TS 38.413 \u00a78.3.1.4 V18.4.0)\\n\\n### Procedure Steps\\n1. The AMF decides to release the UE context (e.g., UE moves to CM-IDLE, handover to non-3GPP, abnormal condition). (TS 38.413 \u00a78.3.1.2)\\n2. The AMF sends the UE CONTEXT RELEASE COMMAND message to the gNB, including the AMF and RAN UE NGAP IDs for correlation and a Cause value.\\n3. If there are active PDU sessions, the AMF includes the PDU Session Resource List, containing PDU Session Resource Release Command Transfer IEs received from the SMF(s).\\n4. Upon receiving this command, the gNB releases all related resources for the UE, including the RRC connection and radio bearers. (TS 38.413 \u00a78.3.1.3)\\n5. The gNB responds with a UE CONTEXT RELEASE COMPLETE message to confirm the release.\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"11 UE Context Release Complete\", \"info\": {\"header\": {\"msg\": \"UE Context Release Complete\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.UEContextReleaseComplete.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"uEContextReleaseComplete\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"User Location Information [Optional]\": \"absent\", \"Info on Recommended Cells and RAN Nodes for Paging [Optional]\": \"absent\", \"PDU Session Resource List [Optional]\": {\"PDU Session Resource Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 1, \"UE Context Release Complete Transfer [Mandatory]\": \"00\"}}, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**UE Context Release Complete** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends this message to the AMF to confirm the release of the UE-associated logical NG-connection and all related resources in the NG-RAN node.\\n\\n### Purpose\\n\\\"This message is sent by the NG-RAN node to confirm the release of the UE context.\\\" (TS 38.413 \u00a79.2.3.3 V18.4.0)\\n\\n### Triggers\\n\\\"After releasing the UE-associated logical NG-connection, the NG-RAN node shall send the UE CONTEXT RELEASE COMPLETE message to the AMF.\\\" This follows the reception of a UE CONTEXT RELEASE COMMAND from the AMF. (TS 38.413 \u00a78.3.1.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: These are mandatory for the AMF and gNB to uniquely identify the UE context being released.\\n- **User Location Information**: Provides the AMF with the UE's last known location, which can be used for subsequent paging. (TS 38.413 \u00a78.3.1.2)\\n- **PDU Session Resource List**: Confirms which PDU sessions were released at the NG-RAN node.\\n- **Info on Recommended Cells and RAN Nodes for Paging**: Provides paging optimization information to the AMF. (TS 38.413 \u00a78.3.1.2)\\n\\n### Error Handling\\nIf the gNB receives a UE CONTEXT RELEASE COMMAND with a content error (e.g., semantically incorrect IE), it may include the `Criticality Diagnostics` IE in the response. If the gNB cannot release the context for other reasons, the procedure may fail, and this message would not be sent, leading to a timeout at the AMF. (TS 38.413 \u00a78.3.1.3)\\n\\n### Procedure Steps\\n1. The AMF initiates the UE Context Release procedure by sending a UE CONTEXT RELEASE COMMAND message to the gNB. (TS 38.413 \u00a78.3.1.2)\\n2. The gNB releases the UE context, which includes the RRC connection and all NG-RAN resources related to the UE-associated logical NG-connection.\\n3. After successful release, the gNB sends the UE CONTEXT RELEASE COMPLETE message to the AMF, including the UE NGAP IDs for correlation. (TS 38.413 \u00a78.3.1.2)\\n4. The message may optionally include the UE's last known location, a list of released PDU sessions, and paging optimization information.\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"12 PDU Session Resource Setup Response\", \"info\": {\"header\": {\"msg\": \"PDU Session Resource Setup Response\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.PDUSessionResourceSetupResponse.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"pduSessionResourceSetupResponse\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource Setup List [Optional]\": {\"Item 1 [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"PDU Session Resource Setup Response Transfer [Mandatory]\": \"00\"}}, \"PDU Session Resource Failed to Setup List [Optional]\": {\"Item 1 [Mandatory]\": {\"PDU Session ID [Mandatory]\": 6, \"Cause [Mandatory]\": {\"Radio Network [C]\": \"radio-resources-not-available\"}}}, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**PDU Session Resource Setup Response** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends the PDU Session Resource Setup Response to the AMF to report the outcome of the request to establish resources for one or more PDU sessions. It indicates which sessions were successfully set up and which failed, providing a cause for each failure.\\n\\n### Purpose\\n\\\"This message is sent by the NG-RAN node to report the outcome of the request to setup PDU Session resources.\\\" (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The NG-RAN node initiates the PDU Session Resource Setup procedure by sending the PDU SESSION RESOURCE SETUP RESPONSE message to the AMF after it has successfully established the resources for the PDU session(s).\\\" (TS 38.413 \u00a78.2.1.2 V18.4.0)\\n\\n### Key IEs\\n- **PDU Session Resource Setup List**: Contains a list of PDU sessions for which resources were successfully allocated. Each item includes the PDU Session ID and a transparent transfer container with setup results (e.g., gNB tunnel info).\\n- **PDU Session Resource Failed to Setup List**: Contains a list of PDU sessions for which resource allocation failed, along with a cause value for each failure.\\n\\n### Error Handling\\nFailures are reported on a per-PDU session basis within the 'PDU Session Resource Failed to Setup List'. This allows the procedure to be partially successful. The AMF will then inform the SMF about the failed PDU sessions. (TS 38.413 \u00a78.2.1.3 V18.4.0)\\n\\n### State Transitions\\nUpon successful setup, the UE context in the gNB is updated with the new DRB configurations, and the PDU session becomes active over the radio interface. The AMF updates its UE context and forwards the result to the corresponding SMF. (TS 23.502 \u00a74.3.2.2.2)\\n\\n### Procedure Steps\\n1. The gNB receives a PDU Session Resource Setup Request from the AMF. (TS 38.413 \u00a78.2.1.2)\\n2. The gNB attempts to establish the necessary radio resources (e.g., Data Radio Bearers) for each PDU session listed in the request.\\n3. The gNB constructs the PDU Session Resource Setup Response message, populating the 'PDU Session Resource Setup List' for successful sessions and the 'PDU Session Resource Failed to Setup List' for unsuccessful ones.\\n4. For each successful session, the gNB includes a 'PDU Session Resource Setup Response Transfer' octet string, which contains information like the gNB's GTP-U Tunnel Endpoint Identifier (GTP-TEID) for the user plane. (TS 38.413 \u00a79.3.1.2)\\n5. For each failed session, a 'Cause' IE is included to inform the AMF of the reason for failure. (TS 38.413 \u00a79.3.1.3)\\n6. The gNB sends the response to the AMF, completing the procedure on the N2 interface.\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"13 PDU Session Resource Modify Request\", \"info\": {\"header\": {\"msg\": \"PDU Session Resource Modify Request\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.PDUSessionResourceModifyRequest.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"pduSessionResourceModifyRequest\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"RAN Paging Priority [Optional]\": null, \"PDU Session Resource Modify List ModReq [Mandatory]\": {\"PDU Session Resource Modify Item ModReq [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"NAS-PDU [Optional]\": null, \"UL NG-U UP TNL Information [Optional]\": {\"GTP Tunnel [C]\": {\"Transport Layer Address [Mandatory]\": \"192.0.2.1\", \"GTP-TEID [Mandatory]\": \"00000001\"}}}}}}, \"comment\": \"**PDU Session Resource Modify Request** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the PDU Session Resource Modify Request to the gNB to request the modification of resources for one or more PDU sessions associated with a UE. This can include changes to QoS flows, transport network layer information, and security context.\\n\\n### Purpose\\n\\\"The purpose of the PDU Session Resource Modify procedure is to modify the resources for one or more PDU sessions for a specific UE.\\\" (TS 38.413 \u00a78.3.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF initiates the procedure by sending the PDU SESSION RESOURCE MODIFY REQUEST message.\\\" (TS 38.413 \u00a78.3.1.2 V18.4.0) This is typically triggered by the SMF to modify an existing PDU Session, for example, due to a policy change from the PCF or a change in subscribed QoS.\\n\\n### Key IEs\\n- **PDU Session Resource Modify List ModReq**: A list containing modification details for each PDU session.\\n- **PDU Session ID**: Identifies the PDU session to be modified.\\n- **NAS-PDU**: Transparently carries the PDU Session Modification Command from the SMF to the UE.\\n- **UL NG-U UP TNL Information**: Provides the new uplink transport layer information (GTP Tunnel endpoint) for the user plane.\\n- **PDU Session Aggregate Maximum Bit Rate**: Updates the maximum bit rate for the PDU session.\\n\\n### Error Handling\\n\\\"If the NG-RAN node fails to modify any of the PDU session resources, it shall report the unsuccessful PDU session(s) in the PDU Session Resource Modify List ModFail IE of the PDU SESSION RESOURCE MODIFY RESPONSE message with an appropriate cause value.\\\" (TS 38.413 \u00a78.3.1.3 V18.4.0)\\n\\n### Security\\nThe optional Security Indication IE can be used to request a change in the integrity or confidentiality protection for the PDU session's user plane traffic. (TS 38.413 \u00a79.3.1.11 V18.4.0)\\n\\n### Procedure Steps\\n1. The AMF receives a trigger to modify a PDU session, typically from an SMF via an Nsmf_PDUSession_UpdateSMContext Request. (TS 23.502 \u00a74.3.3.2)\\n2. The AMF constructs the PDU SESSION RESOURCE MODIFY REQUEST message, including a list of PDU sessions to be modified.\\n3. For each PDU session, the AMF includes the PDU Session ID and may include a NAS PDU (PDU Session Modification Command from SMF), new UL NG-U transport layer information, updated aggregate bit rates, or security indications. (TS 38.413 \u00a78.3.1.2)\\n4. The gNB receives the request and attempts to apply the modifications for each PDU session listed.\\n5. The gNB responds with a PDU Session Resource Modify Response, indicating which sessions were successfully modified and which failed. (TS 38.413 \u00a78.3.1.3)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"14 PDU Session Resource Modify Response\", \"info\": {\"header\": {\"msg\": \"PDU Session Resource Modify Response\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.PDUSessionResourceModifyResponse.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"pDUSessionResourceModify:successfulOutcome\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource Modify List [Optional]\": {\"Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"PDU Session Resource Modify Response Transfer [Mandatory]\": \"00\"}}, \"PDU Session Resource Failed to Modify List [Optional]\": {\"Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 6, \"Cause [Mandatory]\": \"Radio Network:unspecified\"}}}}, \"comment\": \"**PDU Session Resource Modify Response** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends this message to the AMF to report the outcome of a request to modify resources for one or more PDU sessions. It indicates which sessions were successfully modified and which failed, providing necessary details for each.\\n\\n### Purpose\\n\\\"This message is sent by the NG-RAN node to report the successful outcome of the request to modify PDU session resources for a UE.\\\" (TS 38.413 \u00a78.2.2.1 V18.4.0)\\n\\n### Triggers\\nTriggered by the reception of a PDU SESSION RESOURCE MODIFY REQUEST message from the AMF. The NG-RAN node reports the result of the resource modification for the requested PDU sessions. (TS 38.413 \u00a78.2.2.2 V18.4.0)\\n\\n### Key IEs\\n- **PDU Session Resource Modify List**: Contains a list of PDU Session IDs that were successfully modified, each with a `PDU Session Resource Modify Response Transfer` IE. This transfer IE is generated by the gNB and forwarded by the AMF to the SMF.\\n- **PDU Session Resource Failed to Modify List**: Contains a list of PDU Session IDs for which modification failed, along with a `Cause` IE for each failure.\\n\\n### Error Handling\\nIndividual PDU session modification failures are reported within this message. If the NG-RAN node cannot modify any of the requested PDU sessions, it may send a PDU SESSION RESOURCE MODIFY INDICATION message with a general failure cause instead. (TS 38.413 \u00a78.2.2.3 V18.4.0)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"15 PDU Session Resource Release Command\", \"info\": {\"header\": {\"msg\": \"PDU Session Resource Release Command\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.PDUSessionResourceReleaseCommand.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"pDUSessionResourceReleaseCommand\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource To Be Released List Rel Cmd [Mandatory]\": {\"PDU Session Resource To Be Released Item Rel Cmd [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"PDU Session Resource Release Command Transfer [Mandatory]\": \"00\"}}, \"UE Aggregate Maximum Bit Rate [Optional]\": {\"UE Aggregate Maximum Bit Rate Downlink [Mandatory]\": \"1000000000\", \"UE Aggregate Maximum Bit Rate Uplink [Mandatory]\": \"500000000\"}}}, \"comment\": \"**PDU Session Resource Release Command** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends this message to the gNB to command the release of resources for one or more PDU Sessions for a specific UE. This is typically triggered by the SMF or due to mobility events. (TS 38.413 \u00a78.2.2.1 V18.4.0)\\n\\n### Purpose\\n\\\"The purpose of the PDU Session Resource Release procedure is to release the PDU session resources for a UE.\\\" (TS 38.413 \u00c2\u00a78.2.2.1 V18.4.0). The AMF initiates this procedure by sending the PDU SESSION RESOURCE RELEASE COMMAND message.\\n\\n### Triggers\\nThis procedure is triggered by the AMF when it receives a request from an SMF to release a PDU session, or due to mobility procedures like handover to non-3GPP access where the PDU session cannot be transferred, or other internal AMF logic. (TS 23.502 \u00c2\u00a74.3.4.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Uniquely identify the UE-associated logical NG-connection.\\n- **PDU Session Resource To Be Released List Rel Cmd**: A list containing one or more PDU sessions to be released.\\n- **PDU Session ID**: Identifies the specific PDU session within the list.\\n- **PDU Session Resource Release Command Transfer**: An OCTET STRING containing the NAS message (5GS PDU Session Release Command) to be transparently forwarded to the UE. (TS 38.413 \u00c2\u00a79.3.1.10 V18.4.0)\\n- **UE Aggregate Maximum Bit Rate**: Optional IE to provide an updated UE-AMBR to the gNB.\\n\\n### Error Handling\\n\\\"If the NG-RAN node receives a PDU SESSION RESOURCE RELEASE COMMAND message containing a PDU Session ID that is not established, the NG-RAN node shall respond with a PDU SESSION RESOURCE RELEASE RESPONSE message with a cause value 'Unknown PDU Session ID' for that PDU Session ID.\\\" (TS 38.413 \u00c2\u00a78.2.2.3 V18.4.0)\\n\\n### State & Ordering\\nThis command is sent by the AMF to the gNB. The gNB must reply with a PDU Session Resource Release Response message to conclude the procedure on the N2 interface for the specified PDU sessions.\\n\\n### Procedure Steps\\n1. The AMF determines that PDU session resources for a UE need to be released (e.g., based on a request from the SMF). (TS 23.502 \u00c2\u00a74.3.4.2)\\n2. The AMF sends the PDU Session Resource Release Command message to the gNB, including the AMF and RAN UE NGAP IDs for UE identification.\\n3. The message contains a list of PDU sessions to be released, each identified by its PDU Session ID. For each session, a NAS PDU (PDU Session Release Command) is included to be forwarded to the UE. (TS 38.413 \u00c2\u00a78.2.2.2)\\n4. Optionally, the AMF can include an updated UE Aggregate Maximum Bit Rate (UE-AMBR) if the release of PDU sessions affects the total allowed bitrate for the UE. (TS 38.413 \u00c2\u00a79.2.1.3)\\n5. Upon reception, the gNB releases the specified radio and N3 tunnel resources and forwards the NAS PDU to the UE. It then responds with a PDU Session Resource Release Response message. (TS 38.413 \u00c2\u00a78.2.2.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"16 PDU Session Resource Release Response\", \"info\": {\"header\": {\"msg\": \"PDU Session Resource Release Response\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.PDUSessionResourceReleaseResponse.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"pDUSessionResourceReleaseResponse\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resource Released List RelResCmpl [Mandatory]\": {\"PDU Session Resource Released Item RelResCmpl [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"PDU Session Resource Release Response Transfer [Mandatory]\": \"00\"}}, \"User Location Information [Optional]\": \"absent\", \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**PDU Session Resource Release Response** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe gNB sends this message to the AMF to confirm the successful release of resources for one or more PDU Sessions, completing the PDU Session Resource Release procedure initiated by the AMF.\\n\\n### Purpose\\n\\\"This message is sent by the NG-RAN node to confirm the release of the resources for PDU session(s).\\\" (TS 38.413 \u00a78.2.2.1 V18.4.0)\\n\\n### Triggers\\n\\\"If the NG-RAN node successfully releases all the resources associated to the PDU session(s) indicated in the PDU Session ID IE in the PDU SESSION RESOURCE RELEASE COMMAND message, it shall reply with a PDU SESSION RESOURCE RELEASE RESPONSE message.\\\" (TS 38.413 \u00a78.2.2.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID / RAN UE NGAP ID**: Identify the UE context.\\n- **PDU Session Resource Released List RelResCmpl**: A list containing items for each PDU session whose resources were successfully released. Each item includes the PDU Session ID and a transparent container for a NAS message.\\n\\n### Error Handling\\nThis message only reports successful releases. If the gNB fails to release resources for some PDU sessions requested in the command, it simply omits them from the `PDU Session Resource Released List RelResCmpl`. The AMF then infers failure for any missing PDU sessions. \\\"If the PDU Session Resource Released List RelResCmpl IE does not contain all the PDU sessions that were requested to be released, the AMF shall consider that the release of the resources for the missing PDU sessions has failed.\\\" (TS 38.413 \u00a78.2.2.3 V18.4.0)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"17 Paging\", \"info\": {\"header\": {\"msg\": \"Paging\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.Paging.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"paging\", \"UE Paging Identity [Mandatory]\": {\"5G-S-TMSI [C]\": \"0123456789AB\", \"IMSI [C]\": \"absent\"}, \"Paging DRX [Optional]\": \"v128\", \"TAI List for Paging [Mandatory]\": {\"TAI Item [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"TAC [Mandatory]\": \"000001\"}}, \"Paging Priority [Optional]\": \"priolevel8\", \"Paging Origin [Optional]\": \"fivegc\"}}, \"comment\": \"**Paging** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the Paging message to one or several NG-RAN nodes to request the paging of a UE in RRC_IDLE or RRC_INACTIVE state. This is typically triggered by downlink data or signaling for a UE in CM-IDLE state.\\n\\n### Purpose\\n\\\"The Paging procedure is used to page a UE in RRC_IDLE or RRC_INACTIVE state. The AMF initiates the Paging procedure to request the NG-RAN to page a UE for which an NG connection does not exist for the access associated with the NG-RAN node, or the UE is in CM-IDLE state in N1 mode.\\\" (TS 38.413 \u00a78.8.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF initiates the procedure by sending the PAGING message.\\\" (TS 38.413 \u00a78.8.1.2 V18.4.0). This is typically triggered by the SMF notifying the AMF of pending downlink data for a UE in CM-IDLE state.\\n\\n### Key IEs\\n- **UE Paging Identity**: The UE's temporary (5G-S-TMSI) or permanent (IMSI) identifier used for paging.\\n- **TAI List for Paging**: The list of Tracking Areas in which the UE shall be paged.\\n- **Paging DRX**: The UE-specific DRX cycle to be used for paging.\\n- **Paging Priority**: Priority level for the paging message.\\n- **Paging Origin**: Indicates if the paging originates from 5GC or is due to EPS fallback.\\n\\n### Error Handling\\n\\\"If the NG-RAN node receives a PAGING message, and the UE Paging Identity IE is not set to a value that can be used to address the UE over the radio interface, the NG-RAN node shall ignore the message.\\\" (TS 38.413 \u00a78.8.1.3 V18.4.0). There is no failure response message; success is determined by the UE's subsequent access attempt.\\n\\n### Procedure Steps\\n1. AMF determines the need to contact a UE in CM-IDLE state (e.g., due to incoming data from UPF). (TS 23.502 \u00a74.2.3.3)\\n2. AMF identifies the TAs where the UE was last registered and constructs a TAI List for Paging.\\n3. AMF sends the PAGING message to all gNBs serving cells within the identified TAs. The message includes the UE's paging identity (5G-S-TMSI or IMSI) and other parameters like Paging DRX. (TS 38.413 \u00a78.8.1.2)\\n4. Upon receiving the PAGING message, the gNB pages the UE in the indicated cells. (TS 38.331)\\n5. If the UE receives the page, it initiates the RRC Connection Establishment procedure, followed by sending an Initial UE Message to the AMF. (TS 38.413 \u00a78.6.1.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"18 Handover Required\", \"info\": {\"header\": {\"msg\": \"Handover Required\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverRequired.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverRequired\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"Handover Type [Mandatory]\": \"intra5gs\", \"Cause [Mandatory]\": {\"Radio Network [C]\": \"tx2reloc-overall-expiry\"}, \"Target ID [Mandatory]\": {\"Target RAN Node ID [C]\": {\"Global RAN Node ID [Mandatory]\": \"gNB\", \"Selected TAI [Mandatory]\": \"present\"}}, \"PDU Session Resource List [Mandatory]\": {\"PDU Session Resource Handover Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 1, \"Handover Command Transfer [Mandatory]\": \"00\"}}, \"Source to Target Transparent Container [Mandatory]\": \"00\"}}, \"comment\": \"**Handover Required** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe source gNB sends the Handover Required message to the AMF to request the preparation of a handover for a UE to a target NG-RAN node. This message contains necessary information for the AMF to contact the target node and set up resources.\\n\\n### Purpose\\n\\\"The purpose of the Handover Required procedure is to request the CN to prepare for a handover of a UE to a target NG-RAN node.\\\" (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The source NG-RAN node initiates the procedure by sending a HANDOVER REQUIRED message to the AMF.\\\" This is triggered by the source NG-RAN node's decision to hand over a UE. (TS 38.413 \u00a78.2.1.2 V18.4.0)\\n\\n### Key IEs\\n- **Handover Type**: Specifies the type of handover (e.g., intra-5GS, 5GS-to-EPS).\\n- **Cause**: Indicates the reason for the handover (e.g., radio network reason like 'tx2reloc-overall-expiry').\\n- **Target ID**: Identifies the target cell/node for the handover.\\n- **PDU Session Resource List**: Lists all PDU sessions to be handed over.\\n- **Source to Target Transparent Container**: Carries information from the source gNB to the target gNB, which is transparent to the AMF.\\n\\n### Error Handling\\nIf the AMF cannot accept the handover request, it shall send a HANDOVER PREPARATION FAILURE message to the source NG-RAN node. Reasons can include 'no-radio-resources-available-in-target-cell' or 'unknown-targetID'. (TS 38.413 \u00a78.2.1.3 V18.4.0)\\n\\n### References\\n- TS 38.413 \u00a78.2.1 (Procedure)\\n- TS 38.413 \u00a79.2.1.1 (PDU Description)\\n- TS 23.502 \u00a74.9.1 (Mobility Procedures)\\n\\n### Procedure Steps\\n1. The source gNB decides to initiate a handover for a UE (e.g., due to radio conditions). (TS 38.300 \u00a79.2.3.2)\\n2. The source gNB sends the Handover Required message to the serving AMF. This message includes the Target ID, the Cause for the handover, and a transparent container with information for the target gNB. (TS 38.413 \u00a78.2.1.2)\\n3. The message also includes a list of PDU Sessions to be handed over, each with a transparent container carrying the handover command for the UE. (TS 38.413 \u00a79.2.1.1)\\n4. Upon receiving this message, the AMF identifies the target AMF (if necessary) and forwards the handover request to the target gNB via the Handover Request message. (TS 23.502 \u00a74.9.1.3.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"19 Handover Request Acknowledge\", \"info\": {\"header\": {\"msg\": \"Handover Request Acknowledge\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverRequestAcknowledge.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverRequestAcknowledge\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"PDU Session Resources Admitted List [Mandatory]\": {\"PDU Session Resources Admitted Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"Handover Request Acknowledge Transfer [Mandatory]\": \"00\"}}, \"PDU Session Resources Failed to be Admitted List [Optional]\": \"absent\", \"Handover Command [Mandatory]\": \"00\", \"Target to Source Transparent Container [Optional]\": \"absent\", \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**Handover Request Acknowledge** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe target gNB sends this message to the AMF to confirm that resources for the handover have been successfully prepared. It includes the Handover Command to be sent to the UE and lists of PDU sessions for which resources were admitted or failed to be admitted. (TS 38.413 \u00a78.2.1.1 V18.4.0)\\n\\n### Purpose\\n\\\"This message is sent by the target NG-RAN node to the AMF to confirm that the resources for the handover have been prepared successfully.\\\" (TS 38.413 \u00c2\u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"The target NG-RAN node initiates the procedure by sending a HANDOVER REQUEST ACKNOWLEDGE message to the AMF. This is triggered after the target NG-RAN node has successfully prepared the resources for the requested PDU sessions.\\\" (TS 38.413 \u00c2\u00a78.2.1.3 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID / RAN UE NGAP ID**: Unambiguously identify the UE context at both ends.\\n- **PDU Session Resources Admitted List**: Confirms which PDU sessions are ready for handover, including a transparent transfer container for each session to be forwarded to the SMF.\\n- **Handover Command**: An RRC container, generated by the target gNB, to be sent transparently to the UE to execute the handover.\\n- **PDU Session Resources Failed to be Admitted List**: Optionally indicates which PDU sessions could not be set up and why.\\n\\n### Error Handling\\n\\\"If the target NG-RAN node is not able to prepare any of the requested resources, or if none of the requested PDU sessions can be admitted, it shall send a HANDOVER PREPARATION FAILURE message to the AMF.\\\" (TS 38.413 \u00c2\u00a78.2.1.4 V18.4.0)\\n\\n### Note on Message Type\\nThis message is a 'Successful Outcome' of the Handover Preparation procedure, effectively acting as a response to the Handover Request message. The user-provided `type: Request` has been corrected to `type: Response` to reflect its role in the procedure.\\n\\n### Procedure Steps\\n1. The AMF sends a HANDOVER REQUEST to the target gNB to initiate handover preparation for a UE. (TS 38.413 \u00c2\u00a78.2.1.2)\\n2. The target gNB successfully allocates the necessary radio and C-plane resources for the UE.\\n3. The target gNB constructs the HANDOVER REQUEST ACKNOWLEDGE message, including the RRC Handover Command in the Handover Command IE and details of admitted PDU sessions. (TS 38.413 \u00c2\u00a78.2.1.3)\\n4. The target gNB sends the HANDOVER REQUEST ACKNOWLEDGE message to the AMF.\\n5. The AMF uses the information, particularly the Handover Command, to command the UE to perform the handover via the source gNB. (TS 38.413 \u00c2\u00a78.2.1.3)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"20 Handover Command\", \"info\": {\"header\": {\"msg\": \"Handover Command\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverCommand.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverCommand\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"Handover Type [Mandatory]\": \"intra5gs\", \"Target to Source Transparent Container [Mandatory]\": \"00\", \"PDU Session Resource Handover List [Mandatory]\": {\"PDU Session Resource Handover Item [Mandatory]\": {\"PDU Session ID [Mandatory]\": 5, \"Handover Command Transfer [Mandatory]\": \"00\"}}, \"PDU Session Resource to be Released List [Optional]\": \"absent\"}}, \"comment\": \"**Handover Command** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the Handover Command to the source gNB to provide the UE with the necessary information to perform the handover to the target gNB. This message contains the RRC Handover Command generated by the target gNB.\\n\\n### Purpose\\n\\\"The purpose of the Handover Command procedure is to provide the UE with all the necessary information to successfully perform the handover to the target NG-RAN node.\\\" (TS 38.413 \u00a78.2.2.1 V18.4.0)\\n\\n### Triggers\\n\\\"The source AMF initiates the procedure by sending the HANDOVER COMMAND message to the source NG-RAN node after a successful handover preparation.\\\" (TS 38.413 \u00a78.2.2.2 V18.4.0). This follows the reception of a HANDOVER REQUEST ACKNOWLEDGE message.\\n\\n### Key IEs\\n- **Target to Source Transparent Container**: Contains the RRC Handover Command from the target gNB, which is opaque to the AMF and source gNB.\\n- **PDU Session Resource Handover List**: Specifies which PDU sessions are to be handed over and includes per-session information for the UE.\\n- **Handover Type**: Indicates the type of handover, e.g., within 5GS or inter-system to EPS.\\n\\n### Error Handling\\n\\\"If the source NG-RAN node cannot successfully initiate the handover command towards the UE, the source NG-RAN node shall trigger the Handover Failure procedure.\\\" (TS 38.413 \u00a78.2.2.3 V18.4.0)\\n\\n### Procedure Steps\\n1. The source AMF receives a HANDOVER REQUEST ACKNOWLEDGE from the target AMF, which includes the Target to Source Transparent Container from the target gNB. (TS 38.413 \u00a78.2.2.2)\\n2. The source AMF constructs the HANDOVER COMMAND message, including the UE context identifiers, handover type, and the transparent container.\\n3. The AMF sends the HANDOVER COMMAND to the source gNB.\\n4. The source gNB extracts the Target to Source Transparent Container and sends the contained RRC Handover Command message to the UE to initiate the handover. (TS 38.331)\\n5. If the source gNB fails to trigger the handover in the UE, it initiates the Handover Failure procedure. (TS 38.413 \u00a78.2.2.3)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"21 Handover Preparation Failure\", \"info\": {\"header\": {\"msg\": \"Handover Preparation Failure\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverPreparationFailure.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverPreparationFailure\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"Cause [Mandatory]\": {\"Radio Network Layer Cause [C]\": \"ho-target-not-allowed\"}, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**Handover Preparation Failure** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThis message is sent by the AMF to the source gNB to indicate that the handover preparation procedure has failed. This can be due to a failure at the target gNB, resource unavailability, or other reasons detailed in the Cause IE.\\n\\n### Purpose\\n\\\"The Handover Preparation Failure procedure is used to inform the source NG-RAN node that the AMF was not able to prepare the handover to the target side.\\\" (TS 38.413 \u00c2\u00a78.2.1.1 V18.4.0)\\n\\n### Triggers\\n\\\"If the AMF or the target NG-RAN node is not able to prepare the handover, or if the handover is cancelled by the AMF, the AMF shall send the HANDOVER PREPARATION FAILURE message to the source NG-RAN node.\\\" (TS 38.413 \u00c2\u00a78.2.1.3 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID / RAN UE NGAP ID**: Identify the UE context for which the handover failed.\\n- **Cause**: A mandatory IE that provides the specific reason for the failure, such as 'ho-target-not-allowed' or 'no-radio-resources-available-in-target-cell'.\\n\\n### Error Handling\\nThis message itself is the error handling mechanism for an unsuccessful Handover Preparation procedure. The source gNB uses the information in the Cause IE to determine its next course of action.\\n\\n### References\\n- TS 38.413 \u00c2\u00a78.2.1 Handover Preparation\\n- TS 38.413 \u00c2\u00a79.2.1.3 HANDOVER PREPARATION FAILURE message content\\n- TS 38.413 \u00c2\u00a79.3.1.2 Cause IE definition\\n\\n### Procedure Steps\\n1. The source gNB sends a HANDOVER REQUIRED message to the AMF. (TS 38.413 \u00c2\u00a78.2.1.2)\\n2. The AMF attempts to prepare the handover with the target NG-RAN node. \\n3. If the AMF or the target NG-RAN node cannot prepare the handover (e.g., target rejects the request, resources are unavailable), the AMF initiates the Handover Preparation Failure procedure. (TS 38.413 \u00c2\u00a78.2.1.3)\\n4. The AMF sends the HANDOVER PREPARATION FAILURE message to the source gNB, including a Cause IE explaining the reason for the failure.\\n5. Upon receiving this message, the source gNB considers the handover preparation as failed and may decide on alternative actions, such as attempting handover to a different target or maintaining the connection. (TS 38.413 \u00c2\u00a78.2.1.3)\"}, {\"from\": \"AMF\", \"to\": \"gNB\", \"label\": \"22 Handover Cancel Acknowledge\", \"info\": {\"header\": {\"msg\": \"Handover Cancel Acknowledge\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverCancelAcknowledge.AMF->gNB@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverCancelAcknowledge\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"Criticality Diagnostics [Optional]\": \"absent\"}}, \"comment\": \"**Handover Cancel Acknowledge** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe AMF sends the Handover Cancel Acknowledge message to the source gNB to confirm that a previously initiated handover procedure has been successfully cancelled. This stops any further handover-related actions for the specified UE context.\\n\\n### Purpose\\n\\\"This message is sent by the AMF to the NG-RAN node to acknowledge the cancellation of a handover.\\\" (TS 38.413 \u00a78.2.5.1 V18.4.0)\\n\\n### Triggers\\n\\\"The AMF shall, if supported, acknowledge the cancellation of the handover by sending the HANDOVER CANCEL ACKNOWLEDGE message to the NG-RAN node.\\\" This is triggered by the reception of a HANDOVER CANCEL message from the source NG-RAN node. (TS 38.413 \u00a78.2.5.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID**: Identifies the UE context at the AMF. (TS 38.413 \u00a79.3.1.1 V18.4.0)\\n- **RAN UE NGAP ID**: Identifies the UE context at the gNB. (TS 38.413 \u00a79.3.1.2 V18.4.0)\\n\\n### Error Handling\\n\\\"If the AMF receives a HANDOVER CANCEL message for a UE for which no ongoing handover procedure exists, the AMF shall ignore the message.\\\" (TS 38.413 \u00a78.2.5.3 V18.4.0). In this case, no Handover Cancel Acknowledge is sent.\\n\\n### References\\n- TS 38.413 \u00a78.2.5 Handover Cancel\\n- TS 38.413 \u00a79.2.2.6 HANDOVER CANCEL ACKNOWLEDGE message content\\n\\n### Procedure Steps\\n1. The source gNB determines that an ongoing handover must be cancelled (e.g., UE returns to source cell). It sends a Handover Cancel message to the AMF. (TS 38.413 \u00a78.2.5.2)\\n2. Upon receiving the Handover Cancel message, the AMF identifies the UE context using the NGAP IDs.\\n3. The AMF stops the handover procedure. If it had already sent a Handover Request to the target gNB, it will also send a Handover Preparation Failure message to the target gNB. (TS 38.413 \u00a78.2.5.2)\\n4. The AMF confirms the cancellation to the source gNB by sending the Handover Cancel Acknowledge message. (TS 38.413 \u00a78.2.5.2)\"}, {\"from\": \"gNB\", \"to\": \"AMF\", \"label\": \"23 Handover Notify\", \"info\": {\"header\": {\"msg\": \"Handover Notify\", \"protocol\": \"NGAP\", \"interface\": \"N2\", \"release\": \"Rel-18\", \"id\": \"5GC.NGAP.HandoverNotify.gNB->AMF@Rel-18\"}, \"payload\": {\"Message Type [Mandatory]\": \"handoverNotify\", \"AMF UE NGAP ID [Mandatory]\": 1, \"RAN UE NGAP ID [Mandatory]\": 1, \"User Location Information [Mandatory]\": {\"NR user location information [C]\": {\"NR CGI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"NR Cell Identity [Mandatory]\": \"0000000001\"}, \"TAI [Mandatory]\": {\"PLMN Identity [Mandatory]\": \"00101\", \"TAC [Mandatory]\": \"000001\"}, \"Age of Location [Optional]\": null}}}}, \"comment\": \"**Handover Notify** \\nProtocol: `NGAP` \u00b7 Interface: `N2` \u00b7 Release: `Rel-18`\\n\\nThe target gNB sends the Handover Notify message to the AMF to inform it that the UE has successfully accessed the target cell following a handover procedure. This allows the AMF to trigger the path switch for the user plane.\\n\\n### Purpose\\n\\\"The Handover Notify procedure is used to inform the AMF that the UE has been successfully handed over to the target NG-RAN node.\\\" (TS 38.413 \u00a78.2.4.1 V18.4.0)\\n\\n### Triggers\\n\\\"The target NG-RAN node initiates the procedure by sending the HANDOVER NOTIFY message to the AMF after the UE has successfully accessed the target cell.\\\" (TS 38.413 \u00a78.2.4.2 V18.4.0)\\n\\n### Key IEs\\n- **AMF UE NGAP ID & RAN UE NGAP ID**: Identify the UE context on the N2 interface.\\n- **User Location Information**: Provides the AMF with the UE's new location (NR CGI and TAI of the target cell).\\n\\n### Error Handling\\n\\\"If the AMF UE NGAP ID IE is not known to the AMF, the AMF shall ignore the message.\\\" (TS 38.413 \u00a78.2.4.3 V18.4.0)\\n\\n### Ordering & State\\nThis message is sent by the target gNB after the UE has synchronized with it, and it precedes the Path Switch procedure initiated by the AMF. It confirms the successful completion of the execution phase of an intra-AMF or inter-AMF handover.\\n\\n### Procedure Steps\\n1. A UE successfully completes the random access procedure to the target cell after receiving a Handover Command. (TS 38.300 \u00a79.2.3.3)\\n2. The target gNB sends the HANDOVER NOTIFY message to the AMF, including the UE's new location information. (TS 38.413 \u00a78.2.4.2)\\n3. Upon receiving this notification, the AMF knows the handover is complete on the access stratum and initiates a Path Switch Request towards the SMF/UPF to reroute the user plane traffic to the target gNB. (TS 23.502 \u00a74.9.1.3.3)\"}]};<\\/script>\n\n <div id=\"container\">\n <!-- \u5de6\u4fa7\u4fe1\u4ee4\u56fe -->\n <div id=\"diagram-container\">\n <div id=\"header-names\"><div id=\"header-names-inner\"></div></div>\n <div id=\"diagram-body\"><svg id=\"diagram\"></svg></div>\n </div>\n\n <!-- \u5782\u76f4\u5206\u9694\u6761 -->\n <div id=\"vertical-divider\"></div>\n\n <!-- \u53f3\u4fa7\u6d88\u606f\u8be6\u60c5 -->\n <div id=\"viewer-wrapper\">\n <div id=\"viewer-header\">\u6d88\u606f\u8be6\u60c5</div>\n <div id=\"right-detail\">\n <div id=\"json-viewer\">\u8bf7\u70b9\u51fb\u5de6\u4fa7\u6d88\u606f\u67e5\u770b\u8be6\u60c5</div>\n <div id=\"horizontal-divider\"></div>\n <div id=\"comment-viewer\">\n <div id=\"comment-content\">\u8bf7\u70b9\u51fb\u5de6\u4fa7\u6d88\u606f\u67e5\u770b\u6ce8\u91ca</div>\n </div>\n </div>\n </div>\n </div>\n\n <script src=\"https://cdnjs.cloudflare.com/ajax/libs/marked/16.1.1/lib/marked.umd.min.js\"><\\/script>\n <script>\n document.addEventListener('DOMContentLoaded', () => {\n function md(text){\n if(!text) return '';\n let s=String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n s=s.replace(/^######\\s+(.*)$/gm,'<h6>$1</h6>')\n .replace(/^#####\\s+(.*)$/gm,'<h5>$1</h5>')\n .replace(/^####\\s+(.*)$/gm,'<h4>$1</h4>')\n .replace(/^###\\s+(.*)$/gm,'<h3>$1</h3>')\n .replace(/^##\\s+(.*)$/gm,'<h2>$1</h2>')\n .replace(/^#\\s+(.*)$/gm,'<h1>$1</h1>')\n .replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>')\n .replace(/\\*(.*?)\\*/g,'<em>$1</em>')\n .replace(/`([^`]+)`/g,'<code>$1</code>')\n .replace(/\\n\\n/g,'</p><p>');\n return '<p>'+s+'</p>';\n }\n\n /* ====== \u6570\u636e ====== */\n const __INCOMING=(window.__FLOW__||{});\nconst nodes = __INCOMING.nodes || [\"UE\",\"gNB\",\"AMF\",\"NRF\",\"AUSF\",\"UDM\",\"UDR\",\"NSSF\",\"PCF\",\"EIR\"]\n const messages = __INCOMING.messages || [\n {from: \"UE\", to: \"gNB\", label: \"1 RRCConnectionRequest\", info: {\n header: {msg: \"RRCConnectionRequest\", protocol: \"RRC\"},\n payload: {\n \"ueIdentity [Mandatory]\": {randomValue: \"0xABCDEF\"},\n \"establishmentCause [Mandatory]\": \"mo-Signalling\"\n }\n }, comment: \"UE initiates RRC connection establishment by sending an RRC Connection Request with a random UE identity (for contention resolution) and cause mo-Signalling. \\n- **ueIdentity** [Mandatory]: Initial UE identity used for this connection. It can be an S-TMSI (if the UE has a valid previous ID) or a random value. Here the UE sends a random value since it\u2019s the first attach or no valid S-TMSI is available:contentReference[oaicite:0]{index=0}.\\n- **establishmentCause** [Mandatory]: Indicates the reason for establishing the RRC connection. \u201cmo-Signalling\u201d means the UE initiated the connection for mobile-originated signalling (i.e. to send NAS signaling for registration):contentReference[oaicite:1]{index=1}.\"\n },\n {from: \"gNB\", to: \"UE\", label: \"2 RRCSetup\", info: {\n header: {msg: \"RRCSetup\", protocol: \"RRC\"},\n payload: {\n \"rrcTransactionIdentifier [Mandatory]\": 0,\n \"radioBearerConfig [Mandatory]\": {\n \"srb_ToAddModList [Optional]\": [\n {\"srb_Identity [Mandatory]\": 1}\n ]\n },\n \"masterCellGroup [Mandatory]\": {\n \"cellGroupId [Mandatory]\": 0,\n \"rlc_BearerToAddModList [Optional]\": [],\n \"mac_CellGroupConfig [Optional]\": {},\n \"physicalCellGroupConfig [Optional]\": {}\n }\n }\n }, comment: \"gNB responds with RRC Setup, configuring SRB1 for signaling and initial radio parameters (Master Cell Group configuration). \\n- **rrcTransactionIdentifier** [Mandatory]: Identifier for this RRC transaction (0 for the initial transaction).\\n- **radioBearerConfig** [Mandatory]: Configuration of radio bearers dedicated to this connection (corresponds to the radioResourceConfigDedicated in RRC Setup). This includes the setup of SRB1 for signaling:contentReference[oaicite:2]{index=2}.\\n - **srb_ToAddModList** [Optional]: List of Signaling Radio Bearers to add or modify. Present here to set up SRB1 (the primary signaling bearer):contentReference[oaicite:3]{index=3}.\\n - **srb_Identity** [Mandatory]: The identifier of the SRB being configured (value 1 for SRB1).\\n- **masterCellGroup** [Mandatory]: Configuration of the Master Cell Group (the primary cell group for NR). Contains MAC and PHY layer settings for the UE\u2019s connection.\\n - **cellGroupId** [Mandatory]: Identifier of the cell group (0 for the primary cell group).\\n - **rlc_BearerToAddModList** [Optional]: List of RLC bearers to add or modify. Omitted or empty if no additional RLC bearers are configured (empty here, as no DRB is configured in RRC Setup).\\n - **mac_CellGroupConfig** [Optional]: MAC layer configuration for the cell group. An empty object here indicates default or no special MAC configuration is provided (using spec defaults).\\n - **physicalCellGroupConfig** [Optional]: Physical layer configuration for the cell group. An empty object means default PHY configuration is assumed.\"\n },\n {from: \"UE\", to: \"gNB\", label: \"3 RRCSetupComplete\", info: {\n header: {msg: \"RRCSetupComplete\", protocol: \"RRC\"},\n payload: {\n \"rrcTransactionIdentifier [Mandatory]\": 0,\n \"selectedPLMN_Identity [Mandatory]\": \"001/01\",\n \"dedicatedNAS_Message [Optional]\": {\n \"messageType\": \"RegistrationRequest\",\n \"registrationType\": \"Initial Registration\",\n \"nasKeySetIdentifier\": {tsc: \"native\", value: 0},\n \"fiveGMMCapability\": \"0xE0\",\n \"ueSecurityCapability\": {\n nrEncryptionAlgorithms: [\"NEA0\", \"NEA1\", \"NEA2\"],\n nrIntegrityAlgorithms: [\"NIA1\", \"NIA2\", \"NIA3\"],\n eutraEncryptionAlgorithms: [\"EEA0\", \"EEA1\", \"EEA2\"],\n eutraIntegrityAlgorithms: [\"EIA1\", \"EIA2\"]\n },\n \"fiveGSMobileIdentity\": {\n type: \"5G-GUTI\",\n plmnId: \"001/01\",\n amfRegionId: 1,\n amfSetId: 1,\n amfPointer: 1,\n tmsi: \"0xABCDEF12\"\n },\n \"requestedNSSAI\": [{sst: 1, sd: \"010203\"}]\n }\n }\n }, comment: \"UE confirms RRC setup and includes the NAS Registration Request (with initial registration type, old GUTI, capabilities, etc.). \\n- **rrcTransactionIdentifier** [Mandatory]: Echoes the transaction identifier from the RRC Setup (0), indicating this message completes that transaction.\\n- **selectedPLMN_Identity** [Mandatory]: Index of the PLMN that the UE has selected from the broadcast list (here \u20181\u2019 corresponds to PLMN 001/01). This field is used when multiple PLMNs are available in the cell:contentReference[oaicite:4]{index=4}.\\n- **dedicatedNAS_Message** [Optional]: Contains a NAS message to be delivered to the core network. Here it carries the UE\u2019s **Registration Request** for 5G NAS.\\n - **messageType** [Mandatory]: *Registration Request* \u2013 the NAS message by which the UE requests to register with the network.\\n - **registrationType** [Mandatory]: Indicates the type of registration. *Initial Registration* is used for the first attach or when no valid 5G core context exists:contentReference[oaicite:5]{index=5}.\\n - **nasKeySetIdentifier** [Mandatory]: An identifier for the UE\u2019s NAS security context. It includes a *Type of Security Context* (TSC, here \u201cnative\u201d) and a key set identifier value (here 0) to indicate the currently used NAS key set:contentReference[oaicite:6]{index=6}.\\n - **fiveGMMCapability** [Optional]: The UE\u2019s 5G MM capability information (0xE0). This IE contains capability bits (e.g. for periodic DRX, Positioning, etc.).\\n - **ueSecurityCapability** [Mandatory]: The set of security algorithms supported by the UE for NAS signaling and ciphering. It lists supported NR encryption (NEA) and integrity (NIA) algorithms, and also E-UTRA algorithms for interworking:contentReference[oaicite:8]{index=8}. This allows the network to choose mutually supported algorithms.\\n - **fiveGSMobileIdentity** [Mandatory]: The UE\u2019s identity for 5G core network registration. Here it is a *5G-GUTI* (Globally Unique Temporary Identifier) from a previous registration, which includes the PLMN ID and AMF identifiers and the UE\u2019s TMSI. Providing the old GUTI allows the network to retrieve the UE\u2019s context if it exists:contentReference[oaicite:9]{index=9}.\\n - **requestedNSSAI** [Optional]: The Network Slice Selection Assistance Information the UE requests. This is the list of slice identifiers (S-NSSAIs) the UE wants service from. Here the UE requests slice with SST 1 and SD \u201c010203\u201d:contentReference[oaicite:10]{index=10}.\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"4 InitialUEMessage\", info: {\n header: {msg: \"InitialUEMessage\", protocol: \"NGAP\"},\n payload: {\n \"ranUeNgapId [Mandatory]\": 1,\n \"nasPdu [Mandatory]\": {\n \"messageType\": \"RegistrationRequest\",\n \"registrationType\": \"Initial Registration\",\n \"nasKeySetIdentifier\": {tsc: \"native\", value: 0},\n \"fiveGMMCapability\": \"0xE0\",\n \"ueSecurityCapability\": {\n nrEncryptionAlgorithms: [\"NEA0\", \"NEA1\", \"NEA2\"],\n nrIntegrityAlgorithms: [\"NIA1\", \"NIA2\", \"NIA3\"],\n eutraEncryptionAlgorithms: [\"EEA0\", \"EEA1\", \"EEA2\"],\n eutraIntegrityAlgorithms: [\"EIA1\", \"EIA2\"]\n },\n \"fiveGSMobileIdentity\": {\n type: \"5G-GUTI\",\n plmnId: \"001/01\",\n amfRegionId: 1,\n amfSetId: 1,\n amfPointer: 1,\n tmsi: \"0xABCDEF12\"\n },\n \"requestedNSSAI\": [{sst: 1, sd: \"010203\"}]\n },\n \"userLocationInformation [Mandatory]\": {\n tai: {plmnId: \"001/01\", tac: \"000A\"}\n },\n \"ueContextRequest [Optional]\": \"requested\",\n \"rrcEstablishmentCause [Mandatory]\": \"mo-Signalling\",\n \"fivegSTmsi [Optional]\": \"0xABCDEF12\",\n \"amfSetId [Optional]\": 1\n }\n }, comment: \"gNB forwards the UE's Registration Request to the AMF in an Initial UE Message, including the RAN UE NGAP ID, user location (TAI), the 5G-S-TMSI from the GUTI, and indicating that a UE context is requested. \\n- **ranUeNgapId** [Mandatory]: The UE\u2019s RAN-assigned ID for NGAP (gNB UE NGAP ID). This identifier (1) was allocated by the gNB to represent the UE over the NG interface, and the AMF will use it to refer to the UE\u2019s context:contentReference[oaicite:11]{index=11}.\\n- **nasPdu** [Mandatory]: The NAS PDU carried transparently to the AMF \u2013 here the Registration Request message from the UE.\\n - **messageType** [Mandatory]: *Registration Request* \u2013 same NAS message type as described above.\\n - **registrationType** [Mandatory]: *Initial Registration*, indicating a full attach to the 5G core:contentReference[oaicite:12]{index=12}.\\n - **nasKeySetIdentifier** [Mandatory]: NAS security context identifier (TSC \u201cnative\u201d, value 0) as provided by the UE:contentReference[oaicite:13]{index=13}.\\n - **fiveGMMCapability** [Optional]: UE\u2019s 5G mobility management capability information (0xE0), provided only if the UE has additional capabilities to convey:contentReference[oaicite:14]{index=14}.\\n - **ueSecurityCapability** [Mandatory]: UE-supported NAS encryption and integrity algorithms (same values as in RRC Setup Complete):contentReference[oaicite:15]{index=15}.\\n - **fiveGSMobileIdentity** [Mandatory]: UE\u2019s identity for registration, here the old 5G-GUTI (with PLMN 001/01 and AMF IDs) to help the AMF retrieve any stored context:contentReference[oaicite:16]{index=16}.\\n - **requestedNSSAI** [Optional]: UE\u2019s requested network slice(s) (SST 1, SD 010203) for service:contentReference[oaicite:17]{index=17}.\\n- **userLocationInformation** [Mandatory]: The UE\u2019s location info, specifically the Tracking Area Identity (TAI). Here it indicates PLMN 001/01 and TAC 0x000A, identifying the cell\u2019s tracking area:contentReference[oaicite:18]{index=18}.\\n- **ueContextRequest** [Optional]: Indicates that the gNB requests the AMF to set up a UE context (i.e., the gNB is asking the AMF to initiate Initial Context Setup for this UE):contentReference[oaicite:19]{index=19}.\\n- **rrcEstablishmentCause** [Mandatory]: The cause for RRC connection establishment as passed to the AMF. \u201cmo-Signalling\u201d informs the AMF that the UE\u2019s RRC connection was initiated for signaling purposes (registration):contentReference[oaicite:20]{index=20}.\\n- **fivegSTmsi** [Optional]: The 5G-S-TMSI (short form of the UE\u2019s GUTI) as provided by the UE. If the UE\u2019s Registration Request included a GUTI, the gNB extracts the 5G-S-TMSI and includes it so the AMF can recognize the UE (e.g., for context retrieval):contentReference[oaicite:21]{index=21}.\\n- **amfSetId** [Optional]: The AMF Set Identifier associated with the UE\u2019s GUTI, helping route the message to the correct AMF set or pool (included if a GUTI was present):contentReference[oaicite:22]{index=22}.\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"5 DownlinkNASTransport (IdentityRequest)\", info: {\n header: {msg: \"DownlinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {\n messageType: \"IdentityRequest\",\n identityType: \"SUCI\"\n }\n }\n }, comment: \"AMF initiates the identity procedure, asking the UE to provide its SUCI (Subscription Concealed Identifier). \\n- **nasPdu** [Mandatory]: Contains the NAS *Identity Request* message sent by the AMF.\\n - **messageType** [Mandatory]: *Identity Request*, indicating a NAS request for the UE\u2019s identity.\\n - **identityType** [Mandatory]: Specifies which identity is requested. Here it is *SUCI*, meaning the AMF is asking for the UE\u2019s Subscription Concealed Identifier (the protected form of the SUPI).\"\n },\n {from: \"gNB\", to: \"UE\", label: \"6 DLInformationTransfer (IdentityRequest)\", info: {\n header: {msg: \"DLInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"IdentityRequest\",\n identityType: \"SUCI\"\n }\n }\n }, comment: \"gNB delivers the Identity Request NAS message to the UE. \\n- **dedicatedNAS_Message** [Optional]: The NAS Identity Request conveyed in an RRC message to the UE.\\n - **messageType** [Mandatory]: *Identity Request* (NAS message as above).\\n - **identityType** [Mandatory]: *SUCI*, indicating the UE should respond with its SUCI (encrypted subscriber identity).\"\n },\n {from: \"UE\", to: \"gNB\", label: \"7 ULInformationTransfer (IdentityResponse)\", info: {\n header: {msg: \"ULInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"IdentityResponse\",\n fiveGSMobileIdentity: {type: \"SUCI\", value: \"suci-0-001-01-XXXXXXXXXXXXXXXX\"}\n }\n }\n }, comment: \"UE responds with an Identity Response containing its SUCI (encrypted SUPI). \\n- **dedicatedNAS_Message** [Optional]: The NAS *Identity Response* sent by the UE, carried via RRC.\\n - **messageType** [Mandatory]: *Identity Response*.\\n - **fiveGSMobileIdentity** [Mandatory]: The identity data provided by the UE. Here it is of type *SUCI*, including the SUCI string (concealed SUPI). The SUCI is the UE\u2019s subscriber identity encrypted with the home network\u2019s public key, so that the UE\u2019s IMSI is not sent in cleartext.\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"8 UplinkNASTransport (IdentityResponse)\", info: {\n header: {msg: \"UplinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {\n messageType: \"IdentityResponse\",\n fiveGSMobileIdentity: {type: \"SUCI\", value: \"suci-0-001-01-XXXXXXXXXXXXXXXX\"}\n }\n }\n }, comment: \"gNB forwards the Identity Response (with SUCI) to the AMF. \\n- **nasPdu** [Mandatory]: Contains the NAS *Identity Response* message from the UE.\\n - **messageType** [Mandatory]: *Identity Response*.\\n - **fiveGSMobileIdentity** [Mandatory]: The identity provided by the UE \u2013 in this case, the SUCI (encrypted SUPI), which the AMF will use to derive the actual subscriber identity.\"\n },\n {from: \"AMF\", to: \"NRF\", label: \"9 Nnrf_NFDiscovery (AUSF)\", info: {\n http: {method: \"GET\", uri: \"/nnrf-nfm/v1/nf-instances?targetNfType=AUSF&requesterNfType=AMF&serviceNames=nausf-auth\"}\n }, comment: \"AMF uses NRF to discover a suitable AUSF for authentication. \\n- **method**: GET (NF discovery query).\\n- **uri**: Contains query parameters for NF discovery \u2013 **targetNfType=AUSF** (the AMF is looking for an AUSF NF instance) and **requesterNfType=AMF** (identifying itself for filtering). The AMF also specifies **serviceNames=nausf-auth** to find an AUSF that provides the authentication service.\"\n },\n {from: \"NRF\", to: \"AMF\", label: \"10 Nnrf_NFDiscovery Response\", info: {\n status: 200,\n body: {\n nfInstances: [{\n nfType: \"AUSF\",\n nfInstanceId: \"ausf1\",\n endpoint: \"https://ausf.example.com/nausf-auth/v1\"\n }]\n }\n }, comment: \"NRF returns the AUSF's NF profile (API endpoint) to the AMF. \\n- **nfInstances** [Mandatory]: List of NF instances matching the query. Here a single AUSF instance is returned.\\n - **nfType** [Mandatory]: Type of the NF (AUSF).\\n - **nfInstanceId** [Mandatory]: Identifier of the discovered AUSF instance (e.g., \u201causf1\u201d).\\n - **endpoint** [Mandatory]: The base URL of the AUSF\u2019s service API (for the UE authentication service).\"\n },\n {from: \"AMF\", to: \"AUSF\", label: \"11 Nausf_UEAuthentication Request\", info: {\n http: {method: \"POST\", uri: \"/nausf-auth/v1/ue-authentications\"},\n body: {suci: \"suci-0-001-01-...\", servingNetworkName: \"5G:mnc001.mcc001.3gppnetwork.org\"}\n }, comment: \"AMF requests UE authentication vectors and algorithm information from the AUSF. \\n- **method**: POST (initiates an authentication procedure at the AUSF).\\n- **uri**: */ue-authentications* endpoint of the AUSF\u2019s service.\\n- **body**: \\n - **suci** [Mandatory]: The UE\u2019s Subscription Concealed Identifier (the UE\u2019s encrypted SUPI) that will be used for generating authentication vectors.\\n - **servingNetworkName** [Mandatory]: The identifier of the serving network (PLMN) \u2013 here `5G:mnc001.mcc001.3gppnetwork.org` \u2013 used by the AUSF/UDM to derive authentication data specific to that network.\"\n },\n {from: \"AUSF\", to: \"UDM\", label: \"12 Nudm_Authentication_Get Request\", info: {\n http: {method: \"POST\", uri: \"/nudm-ueau/v1/{supi}/security-information/generate-auth-data\"},\n body: {supi: \"imsi-001010000000001\", authType: \"5G-AKA\"}\n }, comment: \"AUSF requests an authentication vector from the UDM. \\n- **supi** [Mandatory]: The subscriber\u2019s permanent identity (IMSI) for which authentication data is being requested. (The AUSF has derived this from the SUCI.)\\n- **authType** [Mandatory]: The authentication method to use \u2013 here *5G-AKA*, indicating that 5G AKA authentication vectors are needed.\"\n },\n {from: \"UDM\", to: \"UDR\", label: \"13 Nudr_DM_Query (AuthData)\", info: {\n http: {method: \"POST\", uri: \"/nudr-dr/v1/subscription-data/{supi}/authentication-data\"},\n body: {supi: \"imsi-001010000000001\", servingNetworkName: \"001-01\"}\n }, comment: \"UDM retrieves the subscriber's authentication data from the UDR. \\n- **supi** [Mandatory]: The subscriber\u2019s unique ID (IMSI) for which auth data is requested.\\n- **servingNetworkName** [Mandatory]: The serving network\u2019s identifier (MCC/MNC in this query \u2013 001/01) to fetch network-specific authentication info.\"\n },\n {from: \"UDR\", to: \"UDM\", label: \"14 Nudr_DM_Query Response\", info: {\n status: 200,\n body: {authenticationVector: {rand: \"0x1234567890ABCDEF...\", hxresStar: \"HXRES*\", autn: \"AUTN\", k: \"K\"}}\n }, comment: \"UDR returns the authentication vector (RAND, XRES*, AUTN, K etc) to the UDM. \\n- **authenticationVector** [Mandatory]: The components of the authentication vector retrieved for the subscriber:\\n - **rand** [Mandatory]: A 128-bit Random challenge generated for 5G-AKA.\\n - **hxresStar** [Mandatory]: The hashed expected response (XRES*) for the challenge (used by the AUSF to verify the UE\u2019s response).\\n - **autn** [Mandatory]: The authentication token for the UE (allows the UE to verify the network and derive the response).\\n - **k** [Mandatory]: The subscriber\u2019s master key (K) or key material needed for deriving session keys. (This is the secret from the UDR used by the UDM\u2019s auth function to compute K_SEAF and XRES*.)\"\n },\n {from: \"UDM\", to: \"AUSF\", label: \"15 Nudm_Authentication_Get Response\", info: {\n status: 200,\n body: {authVector: {rand: \"0x1234567890ABCDEF...\", autn: \"AUTN\", xresStar: \"XRES*\", kseaf: \"K_SEAF\"}}\n }, comment: \"UDM returns the authentication vector to the AUSF. \\n- **authVector** [Mandatory]: The authentication data for the UE:\\n - **rand**: Random challenge (same RAND as sent in the request).\\n - **autn**: Authentication token for the UE.\\n - **xresStar**: The expected response XRES* (unhashed) for the challenge, to be used by AUSF for verification.\\n - **kseaf**: The key K_SEAF derived from the master key, which will be used as the anchor key for deriving session keys between UE and AMF.\"\n },\n {from: \"AUSF\", to: \"AMF\", label: \"16 Nausf_UEAuthentication Response\", info: {\n status: 200,\n body: {rand: \"0x1234567890ABCDEF...\", autn: \"AUTN\", hxresStar: \"HXRES*\", kseaf: \"K_SEAF\"}\n }, comment: \"Once the UE is authenticated, AUSF provides the challenge (RAND, AUTN) and key material (HXRES*, K_SEAF) to the AMF. \\n- **rand** [Mandatory]: The random challenge that was sent to the UE.\\n- **autn** [Mandatory]: The authentication token for the UE corresponding to that RAND.\\n- **hxresStar** [Mandatory]: The hashed expected response that the AUSF will use to compare with the UE\u2019s actual response (RES*).\\n- **kseaf** [Mandatory]: The anchor key (K_SEAF) derived for this UE, which the AMF will use to derive further keys (e.g., K_AMF) for NAS security.\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"17 DownlinkNASTransport (AuthenticationRequest)\", info: {\n header: {msg: \"DownlinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {\n messageType: \"AuthenticationRequest\",\n rand: \"0x1234567890ABCDEF1234567890ABCDEF\",\n autn: \"0xABCDEF1234567890ABCDEF1234567890\"\n }\n }\n }, comment: \"AMF sends a NAS Authentication Request to initiate authentication (includes RAND and AUTN). \\n- **nasPdu** [Mandatory]: NAS *Authentication Request* message sent to the UE (encapsulated over NGAP).\\n - **messageType** [Mandatory]: *Authentication Request*.\\n - **rand** [Mandatory]: The random challenge generated for 5G-AKA (here shown as a 128-bit value) that the UE must use to compute its response.\\n - **autn** [Mandatory]: The authentication token corresponding to that RAND, which allows the UE to verify the network\u2019s authenticity and derive the correct response.\"\n },\n {from: \"gNB\", to: \"UE\", label: \"18 DLInformationTransfer (AuthenticationRequest)\", info: {\n header: {msg: \"DLInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"AuthenticationRequest\",\n rand: \"0x1234567890ABCDEF1234567890ABCDEF\",\n autn: \"0xABCDEF1234567890ABCDEF1234567890\"\n }\n }\n }, comment: \"gNB delivers the Authentication Request (RAND, AUTN challenge) to the UE. \\n- **dedicatedNAS_Message** [Optional]: The NAS Authentication Request forwarded to the UE over RRC.\\n - **messageType** [Mandatory]: *Authentication Request*.\\n - **rand** [Mandatory]: Random challenge from the core network for AKA (same value as provided by AMF).\\n - **autn** [Mandatory]: Authentication token for the challenge (as provided by AMF).\"\n },\n {from: \"UE\", to: \"gNB\", label: \"19 ULInformationTransfer (AuthenticationResponse)\", info: {\n header: {msg: \"ULInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"AuthenticationResponse\",\n resStar: \"0xXXXXXXXXXXXXXXXX\"\n }\n }\n }, comment: \"UE calculates the authentication response and sends an Authentication Response (containing RES*). \\n- **dedicatedNAS_Message** [Optional]: The NAS *Authentication Response* generated by the UE, sent over RRC.\\n - **messageType** [Mandatory]: *Authentication Response*.\\n - **resStar** [Mandatory]: The UE\u2019s computed response (RES*) to the RAND challenge, in its truncated/hash form as expected by the network.\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"20 UplinkNASTransport (AuthenticationResponse)\", info: {\n header: {msg: \"UplinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {messageType: \"AuthenticationResponse\", resStar: \"0xXXXXXXXXXXXXXXXX\"}\n }\n }, comment: \"gNB forwards the UE's Authentication Response (RES*) to the AMF. \\n- **nasPdu** [Mandatory]: Contains the NAS *Authentication Response* from the UE.\\n - **messageType** [Mandatory]: *Authentication Response*.\\n - **resStar** [Mandatory]: The UE\u2019s authentication response (RES*), which the AMF/AUSF will compare with the expected XRES* to verify authentication.\"\n },\n {from: \"AMF\", to: \"AUSF\", label: \"21 Nausf_UEAuthentication_Confirm Request\", info: {\n http: {method: \"PUT\", uri: \"/nausf-auth/v1/ue-authentications/{authId}\"},\n body: {resStar: \"RES*\"}\n }, comment: \"AMF provides the UE's authentication response (RES*) to the AUSF for verification. \\n- **resStar** [Mandatory]: The UE\u2019s computed RES* (response) for the authentication challenge, delivered to the AUSF so it can confirm whether it matches the expected value (XRES*).\"\n },\n {from: \"AUSF\", to: \"AMF\", label: \"22 Nausf_UEAuthentication_Confirm Response\", info: {\n status: 200,\n body: {authResult: \"SUCCESS\"}\n }, comment: \"AUSF confirms the authentication result to the AMF (successful or failure). \\n- **authResult** [Mandatory]: Indicates the outcome of the authentication verification. \u201cSUCCESS\u201d means the RES* provided by the UE matched the expected value (XRES*), i.e. the UE is authenticated.\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"23 DownlinkNASTransport (SecurityModeCommand)\", info: {\n header: {msg: \"DownlinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {\n messageType: \"SecurityModeCommand\",\n selectedNAS_Algorithms: {ciphering: \"NEA0\", integrity: \"NIA1\"},\n imeisvRequest: true\n }\n }\n }, comment: \"AMF initiates NAS security mode setup, selecting NAS ciphering/integrity algorithms and requesting the UE's IMEISV. \\n- **nasPdu** [Mandatory]: NAS *Security Mode Command* message sent to establish NAS security.\\n - **messageType** [Mandatory]: *Security Mode Command* (NAS).\\n - **selectedNAS_Algorithms** [Mandatory]: The NAS protection algorithms chosen by the AMF for this UE. Here it specifies ciphering algorithm **NEA0** and integrity algorithm **NIA1** (NEA0 indicates no NAS encryption in this example, and NIA1 is an integrity algorithm).\\n - **imeisvRequest** [Optional]: A flag indicating whether the UE\u2019s IMEISV (device identity) is requested by the network. `true` means the AMF is instructing the UE to provide its IMEISV as part of security mode completion.\"\n },\n {from: \"gNB\", to: \"UE\", label: \"24 DLInformationTransfer (SecurityModeCommand)\", info: {\n header: {msg: \"DLInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"SecurityModeCommand\",\n selectedNAS_Algorithms: {ciphering: \"NEA0\", integrity: \"NIA1\"},\n imeisvRequest: true\n }\n }\n }, comment: \"gNB delivers the NAS Security Mode Command to the UE. \\n- **dedicatedNAS_Message** [Optional]: The NAS *Security Mode Command* transmitted via RRC.\\n - **messageType** [Mandatory]: *Security Mode Command*.\\n - **selectedNAS_Algorithms** [Mandatory]: Indicates the NAS encryption and integrity algorithms that the AMF has selected for use (ciphering: NEA0, integrity protection: NIA1 as chosen by the AMF).\\n - **imeisvRequest** [Optional]: The UE\u2019s IMEISV (device identity) is requested by the network (since the AMF set the flag, the UE must send its IMEISV in the Security Mode Complete).\"\n },\n {from: \"UE\", to: \"gNB\", label: \"25 ULInformationTransfer (SecurityModeComplete)\", info: {\n header: {msg: \"ULInformationTransfer\", protocol: \"RRC\"},\n payload: {\n \"dedicatedNAS_Message [Optional]\": {\n messageType: \"SecurityModeComplete\",\n imeisv: \"0123456789012345\"\n }\n }\n }, comment: \"UE confirms the NAS security mode setup (Security Mode Complete, including the IMEISV). \\n- **dedicatedNAS_Message** [Optional]: NAS *Security Mode Complete* message, indicating the UE has applied the NAS security settings.\\n - **messageType** [Mandatory]: *Security Mode Complete*.\\n - **imeisv** [Optional]: The UE\u2019s International Mobile Equipment Identity (IMEI) with software version, provided because the network requested it (this field is present since **imeisvRequest** was true).\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"26 UplinkNASTransport (SecurityModeComplete)\", info: {\n header: {msg: \"UplinkNASTransport\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu [Mandatory]\": {messageType: \"SecurityModeComplete\", imeisv: \"0123456789012345\"}\n }\n }, comment: \"gNB forwards the Security Mode Complete (with IMEISV) to the AMF. \\n- **nasPdu** [Mandatory]: Contains the NAS *Security Mode Complete* message.\\n - **messageType** [Mandatory]: *Security Mode Complete*.\\n - **imeisv** [Optional]: The IMEISV of the UE, included because the network requested the device identity (this value confirms the UE\u2019s device identity to the network).\"\n },\n {from: \"AMF\", to: \"EIR\", label: \"27 N5g-eir_EquipmentIdentityCheck Request\", info: {\n http: {method: \"POST\", uri: \"/5g-eir/v1/equipment-status\"},\n body: {pei: \"IMEI:0123456789012345\", supi: \"imsi-001010000000001\"}\n }, comment: \"AMF checks the UE's device ID (PEI/IMEI) with the EIR to see if it is blacklisted. \\n- **pei** [Mandatory]: The Permanent Equipment Identifier of the UE (here given as an IMEI with SV). This is the device\u2019s identity that the AMF wants to verify.\\n- **supi** [Optional]: The subscriber\u2019s identity (IMSI) provided alongside the request (the EIR primarily checks the equipment identity; the SUPI may be included for logging or additional policies).\"\n },\n {from: \"EIR\", to: \"AMF\", label: \"28 N5g-eir_EquipmentIdentityCheck Response\", info: {\n status: 200,\n body: {status: \"whitelist\"}\n }, comment: \"The EIR returns the equipment check result (e.g., indicating the PEI is not blacklisted). \\n- **status** [Mandatory]: The result of the equipment identity check. \u201cwhitelist\u201d indicates the device is recognized as allowed (not blacklisted).\"\n },\n {from: \"AMF\", to: \"UDM\", label: \"29 Nudm_UEContextManagement_Registration Request\", info: {\n http: {method: \"PUT\", uri: \"/nudm-uecm/v1/{ueId}/registrations/amf-3gpp-access\"},\n body: {\n amfInstanceId: \"AMF1\",\n guami: {plmnId: \"00101\", amfId: \"abcdef\"},\n deregCallbackUri: \"https://amf.example.com/namf-comm/v1/{ueId}/dereg-notify\"\n }\n }, comment: \"AMF registers the UE's context in the UDM (AMF information, access type, etc.). \\n- **amfInstanceId** [Mandatory]: The unique identifier of the AMF instance (here \u201cAMF1\u201d) now serving the UE:contentReference[oaicite:23]{index=23}.\\n- **guami** [Mandatory]: The Globally Unique AMF Identifier for this AMF (and the UE). It includes the serving PLMN (00101) and AMF ID (\\\"abcdef\\\"), identifying the AMF\u2019s region/set/pointer that is serving the UE:contentReference[oaicite:24]{index=24}.\\n- **deregCallbackUri** [Mandatory]: The callback URI that UDM should call if this UE\u2019s registration is removed (de-registered). It points to the AMF\u2019s API for de-registration notifications for this UE.\"\n },\n {from: \"UDM\", to: \"UDR\", label: \"30 Nudr_DM_Update (AMF3GPPAccess)\", info: {\n http: {method: \"PUT\", uri: \"/nudr-dr/v1/subscription-data/{supi}/ue-context\"},\n body: {servingAmf: \"AMF1\", accessType: \"3GPP\"}\n }, comment: \"UDM updates the UDR with the UE's current serving AMF and access type. \\n- **servingAmf** [Mandatory]: Identifier of the currently serving AMF for the UE (\u201cAMF1\u201d).\\n- **accessType** [Mandatory]: The access type through which the UE is registered (\\\"3GPP\\\" indicating 5G NR access).\"\n },\n {from: \"UDR\", to: \"UDM\", label: \"31 Nudr_DM_Update Response\", info: {\n status: 204\n }, comment: \"UDR confirms storage of the registration data (HTTP 204 No Content). *(No content in the body indicates the update was successful.)*\"\n },\n {from: \"UDM\", to: \"AMF\", label: \"32 Nudm_UEContextManagement_Registration Response\", info: {\n status: 204\n }, comment: \"UDM confirms the UE context registration (success, no content).\"\n },\n {from: \"AMF\", to: \"UDM\", label: \"33 Nudm_SubscriberDataManagement_Get Request\", info: {\n http: {method: \"GET\", uri: \"/nudm-sdm/v1/{supi}/subscription-data?dataset=AMData,SMFSelectData\"}\n }, comment: \"AMF retrieves the UE's subscription data from UDM (e.g., subscribed S-NSSAIs and default DNN). \\n- **dataset**: Specifies which subscription data to fetch. Here `AMData,SMFSelectData` indicates the AMF is requesting Access & Mobility subscription data (Allowed NSSAI, etc.) and SMF Selection data (default slice/DNN information).\"\n },\n {from: \"UDM\", to: \"UDR\", label: \"34 Nudr_DM_Query (SubscriptionData)\", info: {\n http: {method: \"GET\", uri: \"/nudr-dr/v1/subscription-data/{supi}/subscription-information\"}\n }, comment: \"UDM queries the UDR for the UE's subscription profile (allowed slices, default services, etc.).\"\n },\n {from: \"UDR\", to: \"UDM\", label: \"35 Nudr_DM_Query Response\", info: {\n status: 200,\n body: {\n amData: {allowedNSSAI: [{sst: 1, sd: \"010203\"}]},\n smfSelData: {defaultSingleNssai: {sst: 1, sd: \"010203\"}, defaultDnn: \"internet\"}\n }\n }, comment: \"UDR returns the subscription data (e.g., allowed NSSAI and default DNN). \\n- **amData** [Optional]: Access and Mobility subscription data for the UE.\\n - **allowedNSSAI** [Optional]: The list of S-NSSAIs (slices) the UE is allowed to use in this PLMN. Here it includes SST 1, SD 010203 (the same slice requested by the UE) as an allowed slice.\\n- **smfSelData** [Optional]: Session Management subscription data (used for SMF selection).\\n - **defaultSingleNssai** [Optional]: The default S-NSSAI for the UE\u2019s default PDU session in this network (SST 1, SD 010203 in this case).\\n - **defaultDnn** [Optional]: The default Data Network Name (APN) for the UE \u2013 here `internet` \u2013 which is the default PDN the UE should use if it doesn\u2019t specify one.\"\n },\n {from: \"UDM\", to: \"AMF\", label: \"36 Nudm_SubscriberDataManagement_Get Response\", info: {\n status: 200,\n body: {\n allowedNSSAI: [{sst: 1, sd: \"010203\"}],\n defaultDNN: \"internet\",\n smsSubscribed: true,\n smsfId: null\n }\n }, comment: \"UDM responds with the UE's subscription data (Allowed S-NSSAI, default DNN, etc.). \\n- **allowedNSSAI** [Optional]: The Allowed NSSAI for the UE \u2013 i.e., the slices the UE is permitted to use (here slice SST 1, SD 010203). This reflects the subscription\u2019s allowed slice list.\\n- **defaultDNN** [Optional]: The default Data Network Name (e.g., \u201cinternet\u201d) that the UE should use for its default PDU session on the allowed slice.\\n- **smsSubscribed** [Optional]: Indicates whether the UE\u2019s subscription includes SMS-over-NAS service. `true` means the subscriber is allowed to use SMS in 5G NAS.\\n- **smsfId** [Optional]: Identifies the SMSF currently handling the UE (if any). `null` here means no SMSF was previously assigned (no existing SMS context).\"\n },\n {from: \"AMF\", to: \"UDM\", label: \"37 Nudm_SubscriberDataManagement_Subscribe Request\", info: {\n http: {method: \"POST\", uri: \"/nudm-sdm/v1/{supi}/subscription-data/subscription\"},\n body: {dataset: \"AMData,SMFSelectData\"}\n }, comment: \"AMF subscribes with UDM to be notified if the subscription data changes. \\n- **dataset**: The set of subscription data for which the AMF wants change notifications. Here the AMF subscribes to updates for AMData and SMFSelectData (so it will be alerted if the allowed NSSAI, default DNN, etc., change for this UE).\"\n },\n {from: \"UDM\", to: \"UDR\", label: \"38 Nudr_DM_Subscribe (SubscriptionData)\", info: {\n http: {method: \"POST\", uri: \"/nudr-dr/v1/subscription-data/{supi}/subscription-data-subscribe\"}\n }, comment: \"UDM subscribes to UDR for changes in the UE's subscription data. *(This allows UDM to get notifications from UDR, and in turn inform AMF.)*\"\n },\n {from: \"UDR\", to: \"UDM\", label: \"39 Nudr_DM_Subscribe Response\", info: {\n status: 204\n }, comment: \"UDR confirms the subscription to data change notifications (204 No Content).\"\n },\n {from: \"UDM\", to: \"AMF\", label: \"40 Nudm_SubscriberDataManagement_Subscribe Response\", info: {\n status: 204\n }, comment: \"UDM confirms the AMF's data subscription request (HTTP 204 No Content).\"\n },\n {from: \"AMF\", to: \"NSSF\", label: \"41 Nnssf_NSSelection_Get Request\", info: {\n http: {method: \"GET\", uri: \"/nnssf-nsselection/v1/network-slice-information?homeSnssai={sst:1,sd:'010203'}&tai=001-01-000A\"}\n }, comment: \"AMF requests allowed slice(s) and configuration from the NSSF for the UE's subscribed S-NSSAI. \\n- **homeSnssai** [Optional]: The S-NSSAI from the UE\u2019s home subscription (SST 1, SD 010203) that the UE is attempting to use. This is provided to NSSF so it can consider roaming slice mappings if needed.\\n- **tai** [Mandatory]: The Tracking Area Identity (001-01-000A) indicating the UE\u2019s location. NSSF uses the TAI to determine which slices are available/allowed in that area.\"\n },\n {from: \"NSSF\", to: \"AMF\", label: \"42 Nnssf_NSSelection_Get Response\", info: {\n status: 200,\n body: {allowedNssai: [{sst: 1, sd: \"010203\"}], targetAmfSet: \"AMF_SET_1\"}\n }, comment: \"NSSF returns the Allowed NSSAI for the UE (and possibly target AMF set or candidate AMFs). \\n- **allowedNssai** [Mandatory]: The list of S-NSSAIs that the UE is allowed to use in the current serving area. In this case, it returns SST 1, SD 010203 (the slice is allowed as is).\\n- **targetAmfSet** [Optional]: A suggested AMF Set ID (or target AMF) for serving the UE\u2019s slice. Here \u201cAMF_SET_1\u201d indicates that if needed, the UE could be served by AMFs in set 1 (often used if the slice is only handled by a specific AMF set).\"\n },\n {from: \"AMF\", to: \"PCF\", label: \"43 Npcf_AMPolicyControl_Create Request\", info: {\n http: {method: \"POST\", uri: \"/npcf-am-policy-control/v1/policies\"},\n body: {supi: \"imsi-001010000000001\", accessType: \"3GPP\", allowedNssai: [{sst: 1, sd: \"010203\"}]}\n }, comment: \"AMF establishes an AM Policy association with the PCF for the UE. \\n- **supi** [Mandatory]: The subscriber\u2019s identity for which an access and mobility policy is being created.\\n- **accessType** [Mandatory]: The access type (\u201c3GPP\u201d for cellular) that the UE is using.\\n- **allowedNssai** [Optional]: The Allowed NSSAI that the UE has in the serving network. The AMF provides the list of allowed slice(s) (here SST 1/SD 010203) so that PCF can take slice-based policy decisions.\"\n },\n {from: \"PCF\", to: \"AMF\", label: \"44 Npcf_AMPolicyControl_Create Response\", info: {\n status: 201,\n body: {\n policyAssociationId: \"PA-001\",\n amPolicy: {\n policyControlReqTriggers: [\"LOC_CH\"],\n policyConstraints: {}\n }\n }\n }, comment: \"PCF confirms the creation of the AM Policy Association and returns a Policy Association ID. \\n- **policyAssociationId** [Mandatory]: An identifier for the policy association that has been created (e.g., \u201cPA-001\u201d). The AMF will use this ID for subsequent policy updates.\\n- **amPolicy** [Optional]: The details of the policy rules and triggers.\\n - **policyControlReqTriggers** [Optional]: A list of events that should trigger the AMF to report to PCF. Here it includes \u201cLOC_CH\u201d (location change), meaning PCF wants to be informed if the UE\u2019s location changes.\\n - **policyConstraints** [Optional]: Any specific constraints on the policy. (Empty in this case, indicating default or no special constraints.)\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"45 InitialContextSetupRequest\", info: {\n header: {msg: \"InitialContextSetupRequest\", protocol: \"NGAP\"},\n payload: {\n \"nasPdu\": {\n \"messageType\": \"RegistrationAccept\",\n \"guti\": {plmnId: \"001/01\", amfRegionId: 1, amfSetId: 1, amfPointer: 2, tmsi: \"0x11111111\"},\n \"taiList\": [{plmnId: \"001/01\", tac: \"000A\"}],\n \"allowedNSSAI\": [{sst: 1, sd: \"010203\"}],\n \"smsAllowed\": true\n }\n }\n }, comment: \"AMF establishes the UE's context at the gNB, sending the Registration Accept NAS message (with new 5G-GUTI, allowed NSSAI, TAI list, etc.). \\n- **nasPdu** (Registration Accept): The NAS Registration Accept message for the UE\u2019s attach.\\n - **messageType** [Mandatory]: *Registration Accept* \u2013 indicating the NAS procedure acceptance for registration.\\n - **guti** [Optional]: The new 5G-GUTI assigned to the UE. It includes the PLMN (001/01) and the AMF\u2019s region/Set/pointer and TMSI components. The UE will use this GUTI for future identifications in this network.\\n - **taiList** [Mandatory]: The list of Tracking Areas the UE is registered in. Here it contains the current TA (PLMN 001/01, TAC 000A).\\n - **allowedNSSAI** [Mandatory]: The Allowed NSSAI provided to the UE \u2013 i.e., the list of slices it can use in this registration area. Here the slice {SST=1, SD=010203} is indicated, matching the UE\u2019s subscribed/requested slice.\\n - **smsAllowed** [Mandatory]: An indicator in the Registration Accept showing whether SMS-over-NAS is allowed for the UE. *True* means the UE is allowed to send/receive SMS via NAS in this network.\"\n },\n {from: \"gNB\", to: \"UE\", label: \"46 RRCSecurityModeCommand\", info: {\n header: {msg: \"RRCSecurityModeCommand\", protocol: \"RRC\"},\n payload: {\n securityAlgorithmConfig: {ciphering: \"NEA2\", integrity: \"NIA2\"}\n }\n }, comment: \"gNB activates AS security, configuring the RRC and user-plane encryption/integrity algorithms. \\n- **securityAlgorithmConfig** [Mandatory]: Contains the selected Access-Stratum security algorithms for RRC and UP traffic:\\n - **ciphering** [Mandatory]: *NEA2* \u2013 the ciphering algorithm for RRC/user-plane (NEA2 is a specific 128-bit AES encryption algorithm for NR).\\n - **integrity** [Mandatory]: *NIA2* \u2013 the integrity protection algorithm for RRC signaling (NIA2 is a 128-bit AES CMAC algorithm).\"\n },\n {from: \"UE\", to: \"gNB\", label: \"47 RRCSecurityModeComplete\", info: {\n header: {msg: \"RRCSecurityModeComplete\", protocol: \"RRC\"},\n payload: {}\n }, comment: \"UE acknowledges the activation of AS security (RRC Security Mode Complete). *(No payload \u2013 this message is just a confirmation.)*\"\n },\n {from: \"gNB\", to: \"UE\", label: \"48 DLInformationTransfer (RegistrationAccept)\", info: {\n header: {msg: \"DLInformationTransfer\", protocol: \"RRC\"},\n payload: {\n dedicatedNAS_Message: {\n messageType: \"RegistrationAccept\",\n guti: {plmnId: \"001/01\", amfRegionId: 1, amfSetId: 1, amfPointer: 2, tmsi: \"0x11111111\"},\n taiList: [{plmnId: \"001/01\", tac: \"000A\"}],\n allowedNSSAI: [{sst: 1, sd: \"010203\"}],\n smsAllowed: true\n }\n }\n }, comment: \"gNB delivers the Registration Accept (with assigned GUTI, allowed NSSAI, etc.) to the UE. \\n- **Registration Accept** (NAS message):\\n - **messageType** [Mandatory]: *Registration Accept*.\\n - **guti** [Optional]: The new 5G-GUTI assigned to the UE (PLMN 001/01, AMF IDs, and TMSI) that the UE will use for future identification in this network.\\n - **taiList** [Mandatory]: List of Tracking Areas the UE is registered in (here one TA: 001/01 TAC 000A). The UE will consider itself registered in these areas.\\n - **allowedNSSAI** [Mandatory]: Allowed slice list for the UE in this area (SST=1, SD=010203) \u2013 the network\u2019s confirmation of slices the UE can use.\\n - **smsAllowed** [Mandatory]: Indicates SMS-over-NAS is allowed for the UE in this network (set to true, matching the earlier indication).\"\n },\n {from: \"UE\", to: \"gNB\", label: \"49 ULInformationTransfer (RegistrationComplete)\", info: {\n header: {msg: \"ULInformationTransfer\", protocol: \"RRC\"},\n payload: {dedicatedNAS_Message: {messageType: \"RegistrationComplete\"}}\n }, comment: \"UE indicates the completion of the registration procedure (Registration Complete). \\n- **dedicatedNAS_Message** [Optional]: NAS *Registration Complete* message, indicating the UE has finished the registration process and no further NAS messages are pending.\\n - **messageType** [Mandatory]: *Registration Complete*.\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"50 UplinkNASTransport (RegistrationComplete)\", info: {\n header: {msg: \"UplinkNASTransport\", protocol: \"NGAP\"},\n payload: {nasPdu: {messageType: \"RegistrationComplete\"}}\n }, comment: \"gNB forwards the Registration Complete NAS message to the AMF. *(This informs the AMF that the UE has acknowledged the Registration Accept and that the initial registration procedure is complete on the UE side.)*\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"51 InitialContextSetupResponse\", info: {\n header: {msg: \"InitialContextSetupResponse\", protocol: \"NGAP\"},\n payload: {}\n }, comment: \"gNB confirms successful setup of the context to the AMF. *(No PDU session was included in this procedure.)*\"\n },\n {from: \"AMF\", to: \"gNB\", label: \"52 UEContextReleaseCommand\", info: {\n header: {msg: \"UEContextReleaseCommand\", protocol: \"NGAP\"},\n payload: {cause: \"UE-NormalRelease\"}\n }, comment: \"AMF instructs the gNB to release the UE's RAN context (e.g., after successful registration, UE moving to idle). \\n- **cause** [Mandatory]: The reason for the release. \u201cUE-NormalRelease\u201d indicates a normal release (e.g., the registration procedure is complete and the UE can be moved to idle, or requested by UE).\"\n },\n {from: \"gNB\", to: \"UE\", label: \"53 RRCRelease\", info: {\n header: {msg: \"RRCRelease\", protocol: \"RRC\"},\n payload: {releaseCause: \"normal\"}\n }, comment: \"gNB releases the RRC connection; UE goes idle. \\n- **releaseCause** [Optional]: The reason for RRC release as given by gNB. \u201cnormal\u201d indicates a normal release (no error). (If not provided, the UE assumes normal release by default.)\"\n },\n {from: \"gNB\", to: \"AMF\", label: \"54 UEContextReleaseComplete\", info: {\n header: {msg: \"UEContextReleaseComplete\", protocol: \"NGAP\"},\n payload: {}\n }, comment: \"gNB confirms the UE context release to the AMF; the registration procedure is fully complete. *(No payload; this message signals that the gNB has released radio resources and the UE\u2019s NGAP context is cleared.)*\"\n }\n ]\n\n\n /* ====== \u9875\u9762\u5143\u7d20 ====== */\n const headerInner=document.getElementById('header-names-inner');\n const bodyDiv=document.getElementById('diagram-body');\n const svg=document.getElementById('diagram');\n const diagramContainer=document.getElementById('diagram-container');\n const verticalDivider=document.getElementById('vertical-divider');\n const viewerWrapper=document.getElementById('viewer-wrapper');\n\n const rightDetail=document.getElementById('right-detail');\n const jsonViewer=document.getElementById('json-viewer');\n const commentViewer=document.getElementById('comment-viewer');\n const commentContent=document.getElementById('comment-content');\n const hDivider=document.getElementById('horizontal-divider');\n\n /* ====== \u7ed8\u5236\u4fe1\u4ee4\u56fe ====== */\n const headerHeight=50;\n const margin={top:headerHeight,bottom:50,left:100,right:100};\n const xStep=200,msgSpacing=80;\n const totalHeight=margin.top+msgSpacing*(messages.length+1)+margin.bottom;\n const totalWidth=margin.left+xStep*(nodes.length-1)+margin.right;\n svg.setAttribute('width',totalWidth);\n svg.setAttribute('height',totalHeight);\n headerInner.style.width=totalWidth+'px';\n\n /* X \u5750\u6807 */\n const xs={};\n nodes.forEach((n,i)=>{\n const x=margin.left+i*xStep;\n xs[n]=x;\n const d=document.createElement('div');\n d.className='node-name';\n d.textContent=n;\n d.style.left=x+'px';\n headerInner.appendChild(d);\n const line=document.createElementNS('http://www.w3.org/2000/svg','line');\n line.setAttribute('x1',x);line.setAttribute('y1',margin.top);\n line.setAttribute('x2',x);line.setAttribute('y2',totalHeight-margin.bottom);\n line.setAttribute('stroke','#aaa');line.setAttribute('stroke-dasharray','4 2');\n svg.appendChild(line);\n });\n\n /* \u7bad\u5934 marker */\n const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');\n const marker=document.createElementNS('http://www.w3.org/2000/svg','marker');\n marker.setAttribute('id','arrow');marker.setAttribute('markerWidth','8');marker.setAttribute('markerHeight','8');\n marker.setAttribute('refX','6');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');\n const path=document.createElementNS('http://www.w3.org/2000/svg','path');\n path.setAttribute('d','M0,0 L0,6 L6,3 Z');path.setAttribute('fill','#000');\n marker.appendChild(path);defs.appendChild(marker);svg.appendChild(defs);\n\n /* \u6e32\u67d3\u6d88\u606f\u7ebf\u6761\u548c\u6807\u7b7e */\n messages.forEach((m,i)=>{\n const y=margin.top+msgSpacing*(i+1);\n const x1=xs[m.from],x2=xs[m.to];\n if(!(Number.isFinite(x1)&&Number.isFinite(x2))) return;\n const ln=document.createElementNS('http://www.w3.org/2000/svg','line');\n ln.setAttribute('x1',x1);ln.setAttribute('y1',y);\n ln.setAttribute('x2',x2);ln.setAttribute('y2',y);\n ln.setAttribute('stroke','#000');ln.setAttribute('marker-end','url(#arrow)');\n svg.appendChild(ln);\n const lbl=document.createElementNS('http://www.w3.org/2000/svg','text');\n lbl.setAttribute('x',(x1+x2)/2);lbl.setAttribute('y',y-6);\n lbl.setAttribute('text-anchor','middle');lbl.classList.add('message-label');\n lbl.textContent=m.label;\n lbl.addEventListener('click',()=>{\n renderJSON(m.info,jsonViewer);\n commentContent.innerHTML=(window.marked?marked.parse:md)(m.comment);\n });\n svg.appendChild(lbl);\n });\n\n /* ====== JSON \u6e32\u67d3\u51fd\u6570 ====== */\n function renderJSON(obj,container){\n container.innerHTML='';\n function walk(k,v,parent){\n if(v&&typeof v==='object'){\n const d=document.createElement('details');d.open=true;\n const s=document.createElement('summary');s.textContent=k;d.appendChild(s);\n for(const kk in v)walk(kk,v[kk],d);\n parent.appendChild(d);\n }else{\n const div=document.createElement('div');\n div.textContent=k+': '+v;parent.appendChild(div);\n }\n }\n for(const key in obj)walk(key,obj[key],container);\n }\n\n \n /* ====== \u540c\u6b65\u6c34\u5e73\u6eda\u52a8\uff0c\u4fdd\u6301\u8282\u70b9\u6807\u9898\u4e0e\u7ad6\u7ebf\u5bf9\u9f50 ===== */\n bodyDiv.addEventListener('scroll', () => {\n headerInner.style.transform = `translateX(${-bodyDiv.scrollLeft}px)`;\n });\n /* \u521d\u59cb\u5316\u4e00\u6b21\uff0c\u907f\u514d\u521a\u52a0\u8f7d\u65f6\u9519\u4f4d */\n headerInner.style.transform = 'translateX(0px)';\n /* ====== \u53f3\u4fa7\u9762\u677f\u62d6\u62fd ===== */\n verticalDivider.addEventListener('mousedown',e=>{\n e.preventDefault();\n const startX=e.clientX,startW=viewerWrapper.offsetWidth;\n function onMove(ev){viewerWrapper.style.width=(startW-(ev.clientX-startX))+'px';}\n function stop(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',stop);}\n document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',stop);\n });\n\n function initVertical(){const h=rightDetail.clientHeight/2;jsonViewer.style.top='0';jsonViewer.style.height=h+'px';hDivider.style.top=h+'px';commentViewer.style.top=(h+5)+'px';commentViewer.style.height=(h-5)+'px';}\n initVertical();window.addEventListener('resize',initVertical);\n hDivider.addEventListener('mousedown',e=>{\n e.preventDefault();\n const startY=e.clientY,startH=jsonViewer.offsetHeight;\n function onMove(ev){\n const newH=startH+(ev.clientY-startY);\n jsonViewer.style.height=newH+'px';hDivider.style.top=newH+'px';\n commentViewer.style.top=(newH+5)+'px';commentViewer.style.height=(rightDetail.clientHeight-newH-5)+'px';\n }\n function stop(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',stop);}\n document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',stop);\n });\n\n /* ====== \u7f29\u653e\u4e0e\u5e73\u79fb ===== */\n const originalW=totalWidth,originalH=totalHeight;let scale=1;\n svg.setAttribute('viewBox',`0 0 ${originalW} ${originalH}`);\n\n /* \u62d6\u62fd\u5e73\u79fb\uff08\u4fdd\u6301\u529f\u80fd\uff0c\u4e0d\u6539\u53d8\u6307\u9488\u6837\u5f0f\uff09 */\n let dragging=false,sx=0,sy=0;\n diagramContainer.addEventListener('mousedown',e=>{\n dragging=true;sx=e.clientX;sy=e.clientY;e.preventDefault();});\n document.addEventListener('mousemove',e=>{\n if(!dragging) return;\n diagramContainer.scrollLeft-=e.clientX-sx;\n diagramContainer.scrollTop -=e.clientY-sy;\n sx=e.clientX;sy=e.clientY;\n });\n document.addEventListener('mouseup',()=>{dragging=false;});\n\n /* \u7f29\u653e */\n diagramContainer.addEventListener('wheel',e=>{\n if(!e.ctrlKey)return;\n e.preventDefault();\n const factor=(Math.abs(e.deltaY)<50)?(e.deltaY<0?1.05:0.95):(e.deltaY<0?1.2:0.8);\n const newScale=scale*factor;if(newScale<0.1||newScale>10)return;\n const rect=diagramContainer.getBoundingClientRect();\n const cx=e.clientX-rect.left,cy=e.clientY-rect.top;\n const contentX=(diagramContainer.scrollLeft+cx)/scale;\n const contentY=(diagramContainer.scrollTop+cy)/scale;\n scale=newScale;\n svg.setAttribute('width',originalW*scale);svg.setAttribute('height',originalH*scale);\n headerInner.style.width=(originalW*scale)+'px';\n nodes.forEach((n,i)=>{headerInner.children[i].style.left=((margin.left+i*xStep)*scale)+'px';});\n diagramContainer.scrollLeft=contentX*scale-cx;\n diagramContainer.scrollTop =contentY*scale-cy;\n },{passive:false});\n });\n <\\/script>\n\n <script id=\"addon-script\">\n document.addEventListener('DOMContentLoaded', function(){\n const labels = Array.from(document.querySelectorAll('.message-label'));\n let currentIdx = -1;\n const select = (idx, viaKey=false) => {\n if(idx < 0 || idx >= labels.length) return;\n if(currentIdx >= 0) labels[currentIdx].classList.remove('selected');\n currentIdx = idx;\n const lbl = labels[currentIdx];\n lbl.classList.add('selected');\n if(viaKey) {\n lbl.scrollIntoView({block:'center', inline:'center'});\n }\n lbl.dispatchEvent(new Event('click'));\n };\n labels.forEach((lbl, idx) => {\n lbl.addEventListener('click', () => {\n if(currentIdx >= 0) labels[currentIdx].classList.remove('selected');\n currentIdx = idx;\n lbl.classList.add('selected');\n });\n });\n document.addEventListener('keydown', (e) => {\n if(e.key === 'ArrowDown'){\n e.preventDefault();\n select(currentIdx + 1, true);\n } else if(e.key === 'ArrowUp'){\n e.preventDefault();\n select(currentIdx - 1, true);\n }\n });\n });\n <\\/script>\n</body>\n</html>\n";

 function inferInterface(proto){ switch((proto||'').toUpperCase()){ case 'NGAP':return 'N2'; case 'PFCP':return 'N4'; case 'NAS-5G':return 'N1'; case 'RRC':return 'Uu'; case 'HTTP/SBI':return 'Nn'; default:return ''; } }

 function sliceBracketed(text, startIdx){
 const i0 = text.indexOf('[', startIdx); if(i0<0) return null;
 let i = i0, depth = 0, inStr = false, chQuote = '', esc = false;
 for(; i<text.length; i++){
 const ch = text[i];
 if(inStr){
 if(esc){ esc=false; continue; }
 if(ch==='\\'){ esc=true; continue; }
 if(ch===chQuote){ inStr=false; continue; }
 continue;
 }
 if(ch==='"' || ch==='\''){ inStr=true; chQuote=ch; continue; }
 if(ch==='[') depth++;
 else if(ch===']'){ depth--; if(depth===0) return text.slice(i0, i+1); }
 }
 return null;
 }

 function getExportTextarea(){
 const tas = Array.from(document.querySelectorAll('textarea'));
 if(!tas.length) return null;
 tas.sort((a,b)=> (b.value||b.textContent||'').length - (a.value||a.textContent||'').length);
 return tas[0];
 }

 function evalArray(snippet){
 const fn = new Function('return (' + snippet + ');');
 return fn();
 }

 function parseFromTextarea(){
  const ta = getExportTextarea();
  if(!ta) throw new Error('Generate & Inject preview first: Copy/Export to textarea');
  const txt = ta.value || ta.textContent || '';
  const nx = txt.indexOf('const nodes'); const mx = txt.indexOf('const messages');
  if(nx<0 || mx<0) throw new Error('Missing const nodes/messages in the textarea');
  const nodesStr = sliceBracketed(txt, nx);
  const msgsStr = sliceBracketed(txt, mx);
  if(!nodesStr || !msgsStr) throw new Error('Failed to slice nodes/messages arrays');
  const nodes = evalArray(nodesStr);
  const messages = evalArray(msgsStr);
  if(!Array.isArray(nodes) || !Array.isArray(messages)) throw new Error('nodes/messages must be arrays');
  return {nodes, messages};
 }

 function buildHTML(nodes, exportMessages){
 const messages = (exportMessages||[]).map((m,i)=>{
 const h=(m && m.info && m.info.header)||{};
 const id=m.id || h.id || ''; const release=(id && id.includes('@'))? id.split('@').pop() : (h.release||'Rel-18');
 const label=m.label || ((i+1)+' '+(h.msg||'Message'));
 return { from:m.from, to:m.to, label,
 info:{ header:{ msg:h.msg||'', protocol:h.protocol||'', interface:h.interface||inferInterface(h.protocol), release, id }, payload:(m.info && m.info.payload)||{} },
 comment:(m.info && m.info.doc && m.info.doc.comment_md)||'' };
 });
 return TEMPLATE.replace('__FLOW_JSON__', JSON.stringify({nodes, messages}));
 }

})();
