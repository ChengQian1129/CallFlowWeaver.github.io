/* Style A toolbar bridge: adds a visible button into the "Open Preview / Download HTML" toolbar,
   and wires it to send the current flow to preview/styleA_pure.html */
(function(){
  'use strict';

  function inferInterface(proto){
    switch((proto||'').toUpperCase()){
      case 'NGAP': return 'N2';
      case 'PFCP': return 'N4';
      case 'NAS-5G': return 'N1';
      case 'RRC': return 'Uu';
      case 'HTTP/SBI': return 'Nn';
      // EPC / non-5GC common protocols
      case 'S1AP': return 'S1';
      case 'NAS-EPS': return 'S1';
      case 'SGSAP': return 'SGs'; // SGsAP
      default: return '';
    }
  }
  function sliceBracketed(text, startIdx){
    const i0 = text.indexOf('[', startIdx); if(i0<0) return null;
    let i=i0, d=0, inStr=false, q='', esc=false;
    for(; i<text.length; i++){
      const ch=text[i];
      if(inStr){
        if(esc){esc=false; continue;}
        if(ch==="'" && q==="'") inStr=false;
        else if(ch==='"' && q=== '"') inStr=false;
        else if(ch==='\\') esc=true;
      }else{
        if(ch==="'"||ch=== '"'){inStr=true; q=ch;}
        else if(ch==='[') d++;
        else if(ch===']'){ if(--d===0) return text.slice(i0, i+1); }
      }
    }
    return null;
  }
  function evalArray(snippet){ return (new Function('return ('+snippet+');'))(); }
  function getExportText(){
    const label = Array.from(document.querySelectorAll('div,span,h2,h3'))
      .find(el => /Preview\s+export\s*\(const\s+nodes\/messages\)/i.test(el.textContent||''));
    const ta = label ? (label.closest('div')||document.body).querySelector('textarea,pre,code') : null;
    return (ta && (ta.value || ta.textContent)) || '';
  }
  function flowFromTextarea(){
    try{
      const txt = getExportText();
      const nx = txt.indexOf('const nodes'), mx = txt.indexOf('const messages');
      if(nx<0 || mx<0) return null;
      const nodes = evalArray(sliceBracketed(txt, nx));
      const msgRaw = evalArray(sliceBracketed(txt, mx));
      const messages = (msgRaw||[]).map((m,i)=>{
        const h=(m&&m.info&&m.info.header)||m.header||{};
        const proto=h.protocol||m.protocol||'';
        const iface=h.interface||inferInterface(proto);
        const release=h.release||m.release||'';
        const id=h.id||m.id||'';
        const doc=(m&&m.info&&m.info.doc) || m.doc || {};
        const nameRaw=h.msg||m.message||'';
        const msgName=((doc&&typeof doc.title==='string'&&doc.title.trim())?doc.title.trim():nameRaw).replace(/[_-]+/g,' ').trim();
        const label=m.label||((i+1)+' '+(msgName||'Message'));
        const comment=m.comment || doc.comment_md || '';
        const primary = m.primary_ref || (m.info && m.info.primary_ref) || null;
        if(primary){ if(primary.section) primary.section=String(primary.section).replace(/搂/g,'§'); if(primary.ref) primary.ref=String(primary.ref).replace(/搂/g,'§'); }
        return {from:m.from,to:m.to,label,
          info:{header:{msg:msgName,protocol:proto,interface:iface,release,id},payload:(m.info&&m.info.payload)||m.payload||{}},
          doc,
          comment,
          primary_ref: primary,
          ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
          ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{}),
          overrides: (m.info && m.info.overrides) || m.overrides || {}
        };
      });
      const set=new Set(Array.isArray(nodes)?nodes:[]);
      messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
      return {nodes:Array.from(set), messages};
    }catch(e){ return null; }
  }
  function flowFromGlobals(){
    const lanes = (typeof window.lanes==='function') ? (window.lanes()||[]) : [];
    const raw = Array.isArray(window.exportMessages) ? window.exportMessages : [];
      const messages = (raw||[]).map((m,i)=>{
        const h=(m&&m.info&&m.info.header)||{};
        const proto=h.protocol||m.protocol||'';
        const iface=h.interface||inferInterface(proto);
        const release=h.release||m.release||'';
        const id=h.id||m.id||'';
        const doc=(m&&m.info&&m.info.doc) || m.doc || {};
        const nameRaw=h.msg||m.message||'';
        const msgName=((doc&&typeof doc.title==='string'&&doc.title.trim())?doc.title.trim():nameRaw).replace(/[_-]+/g,' ').trim();
        const label=m.label||((i+1)+' '+(msgName||'Message'));
        const comment=m.comment || doc.comment_md || '';
      const primary = m.primary_ref || (m.info && m.info.primary_ref) || null;
      if(primary){ if(primary.section) primary.section=String(primary.section).replace(/搂/g,'§'); if(primary.ref) primary.ref=String(primary.ref).replace(/搂/g,'§'); }
      return {from:m.from,to:m.to,label,
        info:{header:{msg:msgName,protocol:proto,interface:iface,release,id},payload:(m.info&&m.info.payload)||{}},
        doc,
        comment,
        primary_ref: primary,
        ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
        ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{}),
        overrides: (m.info && m.info.overrides) || m.overrides || {}
      };
      });
    const set=new Set(lanes); messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
    return {nodes:Array.from(set), messages};
  }
  function flowFromCase(){
    try{
      const caseRaw = localStorage.getItem('5gc_current_case')||'';
      const caseObj = caseRaw ? JSON.parse(caseRaw) : null;
      const canvas = (caseObj && Array.isArray(caseObj.canvas)) ? caseObj.canvas : [];
      if(!canvas.length) return null;
      const messages = canvas.map((it, i)=>{
        const m = it.msg || {};
        const h = (m && m.info && m.info.header) || m.header || {};
        const proto = h.protocol || m.protocol || m.family || '';
        const iface = h.interface || m.interface || inferInterface(proto);
        const release = h.release || m.release || '';
        const id = h.id || m.id || '';
        const doc = (m && m.info && m.info.doc) || m.doc || {};
        const nameRaw = h.msg || m.message || m.name || '';
        const msgName = ((doc&&typeof doc.title==='string'&&doc.title.trim())?doc.title.trim():nameRaw).replace(/[_-]+/g,' ').trim();
        const label = m.label || ((i+1)+' '+(msgName||'Message'));
        const comment = m.comment || doc.comment_md || '';
        return {
          from: m.from || (it.from_role ? String(it.from_role).split('$')[0] : undefined),
          to: m.to || (it.to_role ? String(it.to_role).split('$')[0] : undefined),
          label,
          info:{ header:{ msg: msgName, protocol: proto, interface: iface, release, id }, payload: (m.info && m.info.payload) || m.payload || {} },
          doc,
          comment,
          primary_ref: (function(p){ if(!p) return p; if(p.section) p.section=String(p.section).replace(/搂/g,'§'); if(p.ref) p.ref=String(p.ref).replace(/搂/g,'§'); return p; })(m.primary_ref || (m.info && m.info.primary_ref) || null),
          ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
          ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{})
        };
      });
      const set=new Set(); messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
      return {nodes:Array.from(set), messages};
    }catch(e){ return null; }
  }
  function getFlow(){ return flowFromTextarea() || flowFromGlobals() || flowFromCase(); }
  function flowFromLocalStorage(){
    try{
      const txt = localStorage.getItem('5gc_import_text')||'';
      const arr = JSON.parse(localStorage.getItem('5gc_imported_truth')||'[]');
      const src = Array.isArray(arr) && arr.length ? arr : (function(){
        if(!txt) return [];
        return txt.split(/\r?\n/).map(s=>{ try{ return JSON.parse(s) }catch(e){ return null } }).filter(Boolean);
      })();
      if(!src.length) return null;
      const messages = src.map((m,i)=>{
        const h=(m&&m.info&&m.info.header)||m.header||{};
        const proto=h.protocol||m.protocol||m.family||'';
        const iface=h.interface||m.interface||inferInterface(proto);
        const release=h.release||m.release||'';
        const id=h.id||m.id||'';
        const doc=(m&&m.info&&m.info.doc) || m.doc || {};
        const nameRaw=h.msg||m.message||m.name||'';
        const msgName=((doc&&typeof doc.title==='string'&&doc.title.trim())?doc.title.trim():nameRaw).replace(/[_-]+/g,' ').trim();
        const label=m.label||((i+1)+' '+(msgName||'Message'));
        const comment=m.comment || doc.comment_md || '';
        const primary = m.primary_ref || (m.info && m.info.primary_ref) || null;
        if(primary){ if(primary.section) primary.section=String(primary.section).replace(/搂/g,'§'); if(primary.ref) primary.ref=String(primary.ref).replace(/搂/g,'§'); }
        return {from:m.from,to:m.to,label,
          info:{header:{msg:msgName,protocol:proto,interface:iface,release,id},payload:(m.info&&m.info.payload)||m.payload||{}},
          doc,
          comment,
          primary_ref: primary,
          ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
          ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{}),
          overrides: (m.info && m.info.overrides) || m.overrides || {}
        };
      });
      const set=new Set(); messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
      return {nodes:Array.from(set), messages};
    }catch(e){ return null; }
  }
  function flowFromImportText(){
    try{
      const ta = Array.from(document.querySelectorAll('textarea,input')).find(el=>{
        const ph=(el.getAttribute('placeholder')||'');
        return /Paste\s+JSONL\/JSON\s+text/i.test(ph);
      });
      const raw = ta ? (ta.value||'') : '';
      if(!raw) return null;
      const lines = String(raw).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const arr = lines.map(s=>{ try{ return JSON.parse(s) }catch(e){ return null } }).filter(Boolean);
      if(!arr.length) return null;
      const messages = arr.map((m,i)=>{
        const h=(m&&m.info&&m.info.header)||m.header||{};
        const proto=h.protocol||m.protocol||m.family||'';
        const iface=h.interface||m.interface||inferInterface(proto);
        const release=h.release||m.release||'';
        const id=h.id||m.id||'';
        const doc=(m&&m.info&&m.info.doc) || m.doc || {};
        const nameRaw=h.msg||m.message||m.name||'';
        const msgName=((doc&&typeof doc.title==='string'&&doc.title.trim())?doc.title.trim():nameRaw).replace(/[_-]+/g,' ').trim();
        const label=m.label||((i+1)+' '+(msgName||'Message'));
        const comment=m.comment || doc.comment_md || '';
        const primary = m.primary_ref || (m.info && m.info.primary_ref) || null;
        if(primary){ if(primary.section) primary.section=String(primary.section).replace(/搂/g,'§'); if(primary.ref) primary.ref=String(primary.ref).replace(/搂/g,'§'); }
        return {from:m.from,to:m.to,label,
          info:{header:{msg:msgName,protocol:proto,interface:iface,release,id},payload:(m.info&&m.info.payload)||m.payload||{}},
          doc,
          comment,
          primary_ref: primary,
          ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
          ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{}),
          overrides: (m.info && m.info.overrides) || m.overrides || {}
        };
      });
      const set=new Set(); messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
      return {nodes:Array.from(set), messages};
    }catch(e){ return null; }
  }
  function getFlowRobust(){ return flowFromTextarea() || flowFromGlobals() || flowFromImportText() || flowFromLocalStorage() || flowFromCase(); }
  function buildFlowFromArray(arr){
    const messages = (arr||[]).map((m,i)=>{
      const h=(m&&m.info&&m.info.header)||m.header||{};
      const proto=h.protocol||m.protocol||m.family||'';
      const iface=h.interface||m.interface||inferInterface(proto);
      const release=h.release||m.release||'';
      const id=h.id||m.id||'';
      const msgName=h.msg||m.message||m.name||'';
      const label=m.label||((i+1)+' '+(msgName||'Message'));
      const doc=(m&&m.info&&m.info.doc) || m.doc || {};
      const comment=m.comment || doc.comment_md || '';
      return {from:m.from,to:m.to,label,
        info:{header:{msg:msgName,protocol:proto,interface:iface,release,id},payload:(m.info&&m.info.payload)||m.payload||{}},
        doc,
        comment,
        primary_ref: m.primary_ref || (m.info && m.info.primary_ref) || null,
        ie_tree: m.ie_tree || ((m.info && m.info.ie_tree)||[]),
        ie_dict: m.ie_dict || ((m.info && m.info.ie_dict)||{})
      };
    });
    const set=new Set(); messages.forEach(mm=>{ if(mm.from) set.add(mm.from); if(mm.to) set.add(mm.to); });
    return {nodes:Array.from(set), messages};
  }
  function getFlow(){ return flowFromTextarea() || flowFromGlobals() || flowFromImportText() || flowFromLocalStorage() || flowFromCase(); }

  async function openStyleAPreview(){
    let flow = getFlowRobust();
    if(!flow || !Array.isArray(flow.nodes) || !flow.nodes.length || !Array.isArray(flow.messages) || !flow.messages.length){
      try{
        const params = new URLSearchParams(location.search);
        const auto = params.get('autoload');
        if(auto){
          const resp = await fetch(auto);
          const txt = await resp.text();
          const lines = String(txt).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
          const arr = lines.map(s=>{ try{ return JSON.parse(s) }catch(e){ return null } }).filter(Boolean);
          if(arr && arr.length){ flow = buildFlowFromArray(arr); }
        }
        if((!flow || !Array.isArray(flow.messages) || !flow.messages.length)){
          const flowSrc = params.get('flowSrc');
          if(flowSrc){
            try{
              const r = await fetch(flowSrc);
              const ct = (r.headers && r.headers.get && r.headers.get('Content-Type')) ? String(r.headers.get('Content-Type')||'') : '';
              let obj = null;
              if(/json/i.test(ct)) obj = await r.json(); else obj = JSON.parse(await r.text());
              if(obj && Array.isArray(obj.nodes) && Array.isArray(obj.messages)) flow = obj;
            }catch(_){ }
          }
        }
        if((!flow || !Array.isArray(flow.messages) || !flow.messages.length)){
          const api = params.get('api');
          if(api){
            try{
              const mode = params.get('mode') || 'create';
              const prompt = params.get('prompt') || '';
              let cur = getFlowRobust();
              try{ const cf = params.get('currentFlow'); if(cf) cur = JSON.parse(cf); }catch(_){ }
              const res = await fetch(api, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode, prompt, currentFlow: cur }) });
              if(res && res.ok){
                const data = await res.json();
                if(data && Array.isArray(data.nodes) && Array.isArray(data.messages)) flow = data;
              }
            }catch(_){ }
          }
        }
      }catch(e){}
    }
    if(!flow || !Array.isArray(flow.nodes) || !flow.nodes.length || !Array.isArray(flow.messages) || !flow.messages.length){
      try{ if(window.showToast) window.showToast('No previewable nodes/messages detected','warning'); }catch(_){ }
      return;
    }
    const url = './preview/styleA_pure.html#' + encodeURIComponent(JSON.stringify(flow));
    try{
      const params = new URLSearchParams(location.search||'');
      if(params.has('forceSelf')){ location.href = url; return; }
    }catch(_){}
    location.href = url;
  }

  function injectButton(){
    // Find the "Open Preview / Download HTML" button group container
    const btns = Array.from(document.querySelectorAll('button'));
    const hostBtn = btns.find(b => /Open\s+Preview/i.test(b.textContent||''));
    if(!hostBtn) return false;
    const btn = hostBtn.cloneNode(true);
    btn.textContent = 'StyleA Preview';
    btn.title = 'Open StyleA preview in a new window using current exported nodes/messages';
    btn.addEventListener('click', openStyleAPreview);
    hostBtn.parentNode.insertBefore(btn, hostBtn.nextSibling);
    return true;
  }

  function injectFallback(){
    if(document.getElementById('stylea-fixed')) return;
    const el = document.createElement('button');
    el.id = 'stylea-fixed';
    el.textContent = 'StyleA Preview';
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483602;background:#111827;color:#fff;border:none;border-radius:999px;padding:10px 14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer';
    el.addEventListener('click', openStyleAPreview);
    document.body.appendChild(el);
  }

  function boot(){
    if (injectButton()) return;
    injectFallback();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 1800);
  
})();
