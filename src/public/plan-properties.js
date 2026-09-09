(function(){
'use strict';
const E=RetireEngine,$=id=>document.getElementById(id);
let config,rentalTool,workspaceDirty=false,saving=false;

function render(){
  rentalTool?.invalidate?.();$('rental-comparison').replaceChildren();
  rentalTool=PlanComparison.mount($('rental-comparison'),{task:'rental',getConfig:()=>config,onApply:c=>{
    if(saving)return;
    config=E.normalizeConfig(c);workspaceDirty=true;$('save-status').textContent='Sale and CCA settings applied. Save plan to keep them.';
  }});
  $('debt-comparison').replaceChildren(advanced(debtComparisonSection(()=>config),'Compare extra debt payments with investing'));
}

function receivePlan(c){workspaceDirty=false;config=E.normalizeConfig(c);$('save-plan').disabled=false;render();}

$('save-plan').onclick=async()=>{
  if(!config||saving)return;
  saving=true;$('save-plan').disabled=true;rentalTool?.invalidate();
  try{
    const saved=await AppStorage.save(config);
    config=saved;workspaceDirty=false;$('save-status').textContent='Plan saved.';
  }catch(error){$('save-status').textContent=error.message;}
  finally{saving=false;$('save-plan').disabled=false;}
};

AppStorage.fetch('/api/config').then(r=>{if(!r.ok)throw new Error('Could not load plan');return r.json();}).then(c=>{if(!workspaceDirty)receivePlan(c);}).catch(error=>$('save-status').textContent=error.message);

AppStorage.bindState(()=>config,receivePlan);
AppStorage.subscribe(c=>{if(saving)return;if(workspaceDirty){$('save-status').textContent='The saved plan changed in another window. Your unsaved edits are kept here.';return;}receivePlan(c);});

})();
