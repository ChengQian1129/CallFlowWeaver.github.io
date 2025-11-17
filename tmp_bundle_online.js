(function(){
  try{
    var v = String(Date.now());
    var s = document.createElement('script');
    s.src = './bundle.js?v=' + v;
    s.charset = 'utf-8';
    s.onload = function(){ try{ if(window.__setBootStatus) window.__setBootStatus('Delegated to bundle.js'); }catch(_){} };
    s.onerror = function(){ try{ console.error('Failed to load bundle.js'); if(window.__setBootStatus) window.__setBootStatus('bundle.js load failed'); }catch(_){} };
    document.body.appendChild(s);
  }catch(e){ try{ console.error('tmp_bundle_online loader error:', e); }catch(_){} }
})();
