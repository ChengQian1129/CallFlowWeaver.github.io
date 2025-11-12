import re
import pathlib

APP_REPLACEMENT = r"""
function App(){
  const [tab, setTab] = React.useState('build');
  const [text, setText] = React.useState('');
  const fileRef = React.useRef(null);
  const [truth, setTruth] = React.useState([]);
  const [byProto, setByProto] = React.useState({});
  const [importInfo, setImportInfo] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [canvas, setCanvas] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [inst, setInst] = React.useState(false);
  const [dragIdx, setDragIdx] = React.useState(null);
  const [compactMode, setCompactMode] = React.useState(false);
  const [globalEditMode, setGlobalEditMode] = React.useState(false);
  const [bindings, setBindings] = React.useState({});
  const [caseName, setCaseName] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(0);
  const [itemsPerPage, setItemsPerPage] = React.useState(20);

  const rm = (uid) => {
    setCanvas(prev => prev.filter(x => x.uid !== uid));
    setSelected(s => (s === uid ? null : s));
  };
  const moveFromTo = (from, to) => {
    setCanvas(prev => {
      if (from < 0 || from >= prev.length) return prev;
      const next = prev.slice();
      const item = next.splice(from, 1)[0];
      let pos = to;
      if (pos > from) pos--; // remove shift
      pos = Math.max(0, Math.min(pos, next.length));
      next.splice(pos, 0, item);
      return next;
    });
  };
  const addAfterSelected = (m) => {
    const ci = {
      uid: uid(),
      msg: { ...m },
      from_role: sanitizeRole(m.from_role || (m.from + '$A'), m, 'from'),
      to_role: sanitizeRole(m.to_role || (m.to + '$A'), m, 'to'),
      expanded: true,
      forceEdit: false
    };
    setCanvas(prev => {
      if (selected == null) return prev.concat(ci);
      const idx = prev.findIndex(x => x.uid === selected);
      if (idx < 0) return prev.concat(ci);
      const next = prev.slice();
      next.splice(idx + 1, 0, ci);
      return next;
    });
  };
  const addAt = (m, index) => {
    const ci = {
      uid: uid(),
      msg: { ...m },
      from_role: sanitizeRole(m.from_role || (m.from + '$A'), m, 'from'),
      to_role: sanitizeRole(m.to_role || (m.to + '$A'), m, 'to'),
      expanded: true,
      forceEdit: false
    };
    setCanvas(prev => {
      const next = prev.slice();
      const pos = Math.max(0, Math.min(index, next.length));
      next.splice(pos, 0, ci);
      return next;
    });
  };

  const onFile = (e) => {
    try{
      const f = e.target.files && e.target.files[0];
      if(!f){ if(window.showToast) window.showToast('No file selected', 'warn'); return; }
      const reader = new FileReader();
      reader.onload = function(ev){
        setText(String(ev.target.result || ''));
        if(window.showToast) window.showToast('File read complete', 'success');
      };
      reader.onerror = function(){ if(window.showToast) window.showToast('File read failed', 'error'); };
      reader.readAsText(f);
    }catch(_){ if(window.showToast) window.showToast('File read error', 'error'); }
  };
  const onImport = () => {
    try{
      const {items, errors} = parseJSONAny(text);
      const sanitized = (items || []).filter(Boolean);
      if(sanitized.length === 0){
        setImportInfo({ok:0, err:(errors||[]).length});
        setTruth([]);
        setByProto({});
        if(window.showToast) window.showToast('Import failed: no valid objects recognized', 'error');
        return;
      }
      setTruth(sanitized);
      setByProto(groupByProto(sanitized));
      setImportInfo({ok:sanitized.length, err:(errors||[]).length});
      if(window.showToast) window.showToast('Import succeeded: '+sanitized.length+' items', 'success');
    }catch(e){
      setImportInfo({ok:0, err:1});
      setTruth([]);
      setByProto({});
      if(window.showToast) window.showToast('Import error', 'error');
    }
  };

  const lanes = React.useCallback(() => {
    if(!inst){
      const s = new Set();
      for(let i=0;i<canvas.length;i++){ const c=canvas[i]; s.add(c.msg.from); s.add(c.msg.to); }
      return Array.from(s);
    }else{
      const s2 = new Set();
      for(let i=0;i<canvas.length;i++){
        const c2=canvas[i];
        s2.add(sanitizeRole(c2.from_role||c2.msg.from+'$A', c2.msg, 'from'));
        s2.add(sanitizeRole(c2.to_role||c2.msg.to+'$A', c2.msg, 'to'));
      }
      return Array.from(s2);
    }
  }, [canvas, inst]);
  const exportMessages = React.useMemo(() => {
    return canvas.map((c,i) => {
      const m=c.msg; const label=(i+1)+' '+(m.message||shortLabel(m));
      const fromLane = inst? sanitizeRole(c.from_role||m.from+'$A', m, 'from') : m.from;
      const toLane = inst? sanitizeRole(c.to_role||m.to+'$A', m, 'to') : m.to;
      return {
        id:m.id, from:fromLane, to:toLane, label,
        info:{ header:{msg:(m.message||shortLabel(m)),protocol:m.protocol,interface:m.interface||'',release:m.release||'',id:m.id||''}, payload:{} },
        primary_ref:m.primary_ref, ie_tree:m.ie_tree||[], ie_dict:m.ie_dict||{}, doc:m.doc||{},
        overrides:c.ie_overrides||{}, roles:{instance_mode:inst, from_role:fromLane,to_role:toLane, bindings:bindings, roleset:m.roleset||[], role_display_defaults:(m.role_display_defaults||{}) }
      };
    });
  }, [canvas, inst, bindings]);

  React.useEffect(() => {
    try{
      window.lanes = lanes;
      window.exportMessages = exportMessages;
    }catch(e){}
  }, [exportMessages, lanes]);

  function exportData(){
    try{
      const data = { nodes: lanes(), messages: exportMessages, bindings, timestamp: new Date().toISOString(), version: 'CallFlowWeaver Truth Base v4.1' };
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'callflowweaver-truth-export-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      alert('Data exported successfully!');
    }catch(e){ alert('Export error: '+((e&&e.message)||e)); }
  }
  function exportCaseSelected(){
    try{
      const ts = new Date().toISOString();
      const selUid = selected;
      const items = canvas.filter(c => !selUid || c.uid===selUid);
      if(items.length===0){ alert('Please select a message card to export first'); return; }
      const instMode = Boolean(lanes() && lanes().length);
      const exportMsgs = items.map((c,i)=>{
        const m=c.msg; const label=(i+1)+' '+(m.message||shortLabel(m));
        const fromLane = instMode? sanitizeRole(c.from_role||m.from+'$A', m, 'from') : m.from;
        const toLane = instMode? sanitizeRole(c.to_role||m.to+'$A', m, 'to') : m.to;
        return { id:m.id, from:fromLane, to:toLane, label,
          info:{ header:{msg:(m.message||shortLabel(m)),protocol:m.protocol,interface:m.interface||'',release:m.release||'',id:m.id||''}, payload:{} },
          primary_ref:m.primary_ref, ie_tree:m.ie_tree||[], ie_dict:m.ie_dict||{}, doc:m.doc||{},
          overrides:c.ie_overrides||{}, roles:{instance_mode:instMode, from_role:fromLane,to_role:toLane, bindings, roleset:m.roleset||[], role_display_defaults:(m.role_display_defaults||{}) }
        };
      });
      const safeName = String(caseName||'').trim().slice(0,50).replace(/[^a-zA-Z0-9._-]+/g,'_');
      const caseData = { name: (caseName||''), nodes: lanes(), messages: exportMsgs, bindings, timestamp: ts, version: 'CallFlowWeaver Case v1' };
      const jsonString = JSON.stringify(caseData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'callflowweaver-case-' + (safeName? safeName+'-' : '') + ts.slice(0,19).replace(/:/g,'-') + '.json';
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      alert('Case exported successfully');
    }catch(e){ alert('Export Case error: '+((e&&e.message)||e)); }
  }
  function importCase(){
    try{
      const txt = prompt('Paste Case JSON content:');
      if(!txt) return;
      const data = JSON.parse(txt);
      const name = (data && (data.name || data.caseName)) || '';
      if(name){ setCaseName(name); }
      const msgs = Array.isArray(data && data.messages) ? data.messages : [];
      if(msgs.length===0){ alert('No messages detected in Case'); return; }
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
      alert('Case imported: '+addItems.length+' messages');
    }catch(e){ alert('Import Case error: '+((e&&e.message)||e)); }
  }
  function copyOut(){
    try{
      const code='const nodes = ' + JSON.stringify(lanes(),null,2) + '\n\nconst messages = ' + JSON.stringify(exportMessages,null,2);
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(code).then(function(){ alert('Copied to clipboard.'); }).catch(function(){ alert('Copy failed.'); });
      }else{ alert('Clipboard API not available.'); }
    }catch(e){ alert('Copy error: '+((e&&e.message)||e)); }
  }
  function clearAll(){
    try{
      if (canvas.length > 0) {
        const confirmed = confirm('Are you sure you want to clear the canvas?');
        if (!confirmed) return;
      }
      setCanvas([]); setSelected(null); setDragIdx(null);
      alert('Canvas cleared successfully!');
    }catch(e){ alert('Clear error: '+((e&&e.message)||e)); }
  }
  function addMessage(){
    const timestamp = Date.now();
    const messageId = `msg_${timestamp}`;
    const newMessage = {
      id: messageId,
      message: 'New Message',
      name: 'New Message',
      family: '5GC',
      protocol: 'NGAP',
      interface: 'N2',
      type: 'Custom',
      from: 'gNB',
      to: 'AMF',
      release: 'Rel-18',
      roleset: ['gNB$A','AMF$A'],
      from_role: 'gNB$A',
      to_role: 'AMF$A',
      primary_ref: { ts: '', section: '', version: '', release: 'Rel-18', ref: '' },
      doc: { summary_en: '', comment_md: '', title: '' },
      ie_tree: [],
      ie_dict: {}
    };
    const newItem = { uid: 'auto_'+timestamp, msg: newMessage, ie_overrides: {}, x: 150, y: 150, expanded: true, forceEdit: true };
    setCanvas(prev => prev.concat(newItem));
    setSelected(newItem.uid);
  }
  function resetState(){
    if(confirm('Are you sure you want to reset all state and clear the canvas?')){
      setTab('build'); setText(''); setTruth([]); setImportInfo(null); setSearch(''); setCanvas([]);
      setSelected(null); setInst(false); setCompactMode(false); setCurrentPage(0); setBindings({}); setCaseName(''); setDragIdx(null); setGlobalEditMode(false);
      alert('State has been reset');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center"><span className="text-white text-sm font-bold">5G</span></div>
              <span className="text-white font-semibold text-lg">CallFlowWeaver</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button className={(tab==='build'? 'bg-blue-600 text-white ' : 'text-zinc-300 ') + 'px-3 py-1.5 rounded-lg flex items-center gap-2'} onClick={()=>setTab('build')}><Icon name="build" size={16}/>Build</button>
              <button className={(tab==='generate'? 'bg-emerald-600 text-white ' : 'text-zinc-300 ') + 'px-3 py-1.5 rounded-lg flex items-center gap-2'} onClick={()=>setTab('generate')}><Icon name="generate" size={16}/>Generate</button>
              <button className={(tab==='settings'? 'bg-purple-600 text-white ' : 'text-zinc-300 ') + 'px-3 py-1.5 rounded-lg flex items-center gap-2'} onClick={()=>setTab('settings')}><Icon name="settings" size={16}/>Settings</button>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/60">
              <div className="flex items-center gap-1"><span className="text-zinc-300">Truth:</span><span className="text-white font-semibold">{Array.isArray(truth)?truth.length:0}</span></div>
              <div className="w-px h-4 bg-zinc-600"></div>
              <div className="flex items-center gap-1"><span className="text-zinc-300">Canvas:</span><span className="text-white font-semibold">{Array.isArray(canvas)?canvas.length:0}</span></div>
            </div>
            <label className="text-sm text-zinc-400 flex items-center gap-2">
              <input type="checkbox" checked={inst} onChange={(e)=>setInst(e.target.checked)} />
              Show instance roles
            </label>
          </div>
        </div>
      </div>

      {tab==='build' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer" title="Instance lanes: use role instances instead of entities" role="switch" aria-checked={inst} onClick={()=>setInst(v=>!v)}>
                <span className="text-sm text-zinc-300">Instance lanes</span>
                <div className={"toggle "+(inst?'on':'')}></div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer" title="Global edit mode: expand cards to show edit forms" role="switch" aria-checked={globalEditMode} onClick={()=>setGlobalEditMode(prev=>{ const next=!prev; if(!next){ setCanvas(cs=>cs.map(ci=>({ ...ci, forceEdit:false }))); } return next; })}>
                <span className="text-sm text-zinc-300">Global Edit</span>
                <div className={"toggle "+(globalEditMode?'on':'')}></div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer" title="Compact mode: reduce padding and font size" role="switch" aria-checked={compactMode} onClick={()=>setCompactMode(v=>!v)}>
                <span className="text-sm text-zinc-300">Compact Mode</span>
                <div className={"toggle "+(compactMode?'on':'')}></div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <span className="text-sm text-zinc-300">Count:</span>
                <span className="text-white font-bold" aria-label="CanvasMessageCount">{Array.isArray(canvas)?canvas.length:0}</span>
              </div>
              <div className="flex items-center gap-2">
                <IconButton icon="plus" title="Add Message" onClick={addMessage} />
                <IconButton icon="trash" title="Clear Canvas" onClick={clearAll} />
                <IconButton icon="refresh" title="Reset State" onClick={resetState} />
              </div>
            </div>
          </div>
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
          />
        </div>
      )}

      {tab==='generate' && (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7 space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-zinc-100 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-400/30">
                      <Icon name="generate" size={16} className="text-blue-400" />
                    </div>
                    Preview Export (const nodes/messages)
                  </div>
                  <div className="flex items-center gap-2">
                    <IconButton icon="export" title="Export JSON" onClick={exportData} />
                    <IconButton icon="copy" title="Copy" onClick={copyOut} />
                  </div>
                </div>
                <textarea readOnly className="flex-1 bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 resize-none" value={'const nodes = ' + JSON.stringify(lanes(),null,2) + '\n\nconst messages = ' + JSON.stringify(exportMessages,null,2)}></textarea>
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
                compactMode={compactMode}
                groupMode={false} currentPage={currentPage} setCurrentPage={setCurrentPage}
                itemsPerPage={itemsPerPage} globalEditMode={globalEditMode}/>
            </div>
          </div>
        </div>
      )}

      {tab==='settings' && (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-7 space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                <div className="text-sm font-semibold text-zinc-100 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-400/30"><Icon name="settings" size={16} className="text-green-400" /></div>
                  Input Source (JSONL / JSON)
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-7"><input className="bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm w-full" placeholder="Case name (optional)" value={caseName} onChange={e=>setCaseName(e.target.value)} /></div>
                  <div className="col-span-5 flex items-center gap-2">
                    <IconButton icon="folder" title="Choose file" onClick={()=>fileRef.current && fileRef.current.click()} />
                    <input ref={fileRef} type="file" className="hidden" accept=".jsonl,.json,.*" onChange={onFile}/>
                  </div>
                </div>
                <textarea className="bg-zinc-900/80 border border-zinc-600/50 rounded-lg px-4 py-3 text-sm font-mono min-h-[180px] w-full resize-none" placeholder="Paste JSONL/JSON text or choose a file..." value={text} onChange={e=>setText(e.target.value)}></textarea>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconButton icon="import" title="Import" onClick={()=>onImport()} disabled={!text || !text.trim()} />
                    <div className="text-xs text-zinc-400">Tip: one JSON object per line; starts with { and ends with }.</div>
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
                <div className="text-xs text-zinc-400">Import/Export the current canvas Case (if a card is selected, exports only that card)</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"""


def main():
    p = pathlib.Path('__temp_script_extracted.js')
    src = p.read_text(encoding='utf-8', errors='ignore')
    m_app = re.search(r"\bfunction\s+App\s*\(\)\s*\{", src)
    m_bp = re.search(r"\bfunction\s+BuildPane\s*\(", src)
    if not m_app or not m_bp:
        print('Anchors not found:', bool(m_app), bool(m_bp))
        return
    s = m_app.start()
    e = m_bp.start()
    new_src = src[:s] + APP_REPLACEMENT + src[e:]
    # Alias BuildPane to BuildPane_old
    new_src = re.sub(r"function\s+BuildPane\s*\(\s*props\s*\)\s*\{[\s\S]*?\}", "function BuildPane(props){ return BuildPane_old(props); }", new_src, count=1)
    p.write_text(new_src, encoding='utf-8')
    print('App restored with tabs; BuildPane aliased to BuildPane_old')

if __name__ == '__main__':
    main()
