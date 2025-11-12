const fs=require('fs');
const s=fs.readFileSync('c:\\Users\\50427\\Desktop\\viewer\\bundle.js','utf8');
let open=0; let iError=-1; let inStr=false, quote='', esc=false;
for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(inStr){
    if(esc){ esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(ch===quote){ inStr=false; quote=''; }
    continue;
  }
  if(ch==='\''||ch==='\"'||ch==='\`'){ inStr=true; quote=ch; continue; }
  if(ch==='('){ open++; }
  else if(ch===')'){
    if(open===0){ iError=i; break; }
    open--;
  }
}
console.log('parenBalance', open, 'firstExtraCloseIndex', iError);