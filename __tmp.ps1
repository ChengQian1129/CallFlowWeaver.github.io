(() => {
 const inBuild = false;
 const renderedGroups = [<div key="demo" />];
 const canvas = [];
 const renderDropZone = () => null;
 const dragIdx = null;
 const _onDropAt = () => {};
 const menuOpen = false;
 const menuRef = { current: null };
 const fileRefLocal = { current: null };
 const caseName = '';
 const onFileChange = () => {};
 const onExportJSON = () => {};
 const paginatedGroups = [{items:[], totalPages:1}];
 const prevPage = () => {};
 const nextPage = () => {};
 return (
  <div className={(inBuild?'col-span-7':'col-span-5')+" space-y-3"}>
   <div className="flex items-center justify-between">
    <div className="text-lg font-medium flex items-center gap-2">
     <span>Flow Canvas</span>
    </div>
    <div className="flex items-center gap-2">
     <div className="relative" ref={menuRef}>
      <button className="btn px-2 py-1" title="Case menu" onClick={function(e){ e.stopPropagation(); }}>?</button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-black text-zinc-200 border border-zinc-700 shadow-lg p-2">
          <div className="text-xs text-zinc-400 mb-1">{String(caseName||'Untitled')}</div>
          <button className="btn w-full mb-1">open</button>
          <button className="btn w-full mb-1">save</button>
          <button className="btn w-full mb-1">save as</button>
          <button className="btn w-full mb-1">delete</button>
         <button className="btn w-full">new</button>
       </div>
     )}
     <input type="file" accept="application/json,.json" className="hidden" ref={fileRefLocal} onChange={onFileChange} />
    </div>
    <button className="btn" onClick={onExportJSON} />
    {canvas.length > 0 && (
     <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400"> 0 / 0</span>
      {paginatedGroups.length > 0 && paginatedGroups[0].totalPages > 1 && (
       <div className="flex items-center gap-1">
        <button className="btn px-2 py-1 text-xs" onClick={prevPage} disabled={true}>Prev</button>
        <span className="text-xs">1 / 1</span>
        <button className="btn px-2 py-1 text-xs" onClick={nextPage} disabled={true}>Next</button>
       </div>
      )}
     </div>
    )}
   </div>
   <div className="space-y-1 min-h-[50vh] rounded-2xl border border-zinc-800 p-3 bg-zinc-900/20"
    onDragOver={(e)=>{e.preventDefault(); if(dragIdx===null) {}}}
    onDrop={(e)=>{_onDropAt(canvas.length,e);}}>
    {canvas.length===0 && <div className="text-sm text-zinc-500">Drag messages here or click Add</div>}

    {renderedGroups}
    {canvas.length>0 && renderDropZone(canvas.length)}
   </div>
  </div>
 );
})();
