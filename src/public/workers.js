(function(root){
  'use strict';
  const base=new URL('.',document.currentScript.src);
  const files={comparison:'comparison-worker',retirement:'planner-worker',status:'status-worker',optimization:'optimization-worker'};
  root.AppWorkers={create(kind){
    if(!files[kind])throw new Error('Unknown calculation task.');
    if(location.protocol!=='file:')return new Worker(new URL(files[kind]+'.js',base));
    const handler='self.onmessage=event=>runRetirementTask('+JSON.stringify(kind)+',event.data);';
    const url=URL.createObjectURL(new Blob([root.RetirementWorkerSource,handler],{type:'text/javascript'}));
    try{return new Worker(url);}finally{URL.revokeObjectURL(url);}
  }};
})(window);
