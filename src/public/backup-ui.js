(function(root){
  'use strict';
  let dialog,pending;
  function promptPassword(unlock,work){
    if(pending)return Promise.reject(new Error('Finish or cancel the current backup dialog first.'));
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='backup-dialog';dialog.id='backup-dialog';dialog.setAttribute('aria-labelledby','backup-title');
      dialog.innerHTML='<form><h2 id="backup-title"></h2><p id="backup-help">Passwords are never saved. Keep your password separately; it cannot be recovered.</p><label>Password<input id="backup-password" type="password" autocomplete="new-password" maxlength="1024" required></label><label id="backup-confirm-label">Confirm password<input id="backup-confirm" type="password" autocomplete="new-password" maxlength="1024"></label><p id="backup-error" role="alert"></p><div class="dialog-actions"><button class="btn ghost" type="button" id="backup-cancel">Cancel</button><button class="btn" id="backup-submit" type="submit"></button></div></form>';
      document.body.append(dialog);
      const cancel=()=>{if(pending?.busy)return;pending?.resolve(null);pending=null;dialog.querySelector('form').reset();dialog.close();};
      dialog.querySelector('#backup-cancel').onclick=cancel;dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
      dialog.querySelector('form').onsubmit=async event=>{
        event.preventDefault();if(!pending||pending.busy)return;
        const job=pending,password=dialog.querySelector('#backup-password'),confirm=dialog.querySelector('#backup-confirm'),error=dialog.querySelector('#backup-error');
        error.textContent='';if(!job.unlock&&password.value!==confirm.value){error.textContent='Passwords do not match.';return;}
        job.busy=true;dialog.querySelector('#backup-submit').disabled=true;
        try{const result=await job.work(password.value);job.resolve(result);pending=null;dialog.querySelector('form').reset();dialog.close();}
        catch(e){error.textContent=e.message;password.select();}
        finally{job.busy=false;dialog.querySelector('#backup-submit').disabled=false;}
      };
    }
    dialog.querySelector('form').reset();dialog.querySelector('#backup-error').textContent='';
    dialog.querySelector('#backup-title').textContent=unlock?'Enter password to decrypt this backup':'Encrypt backup with a password';
    dialog.querySelector('#backup-confirm-label').hidden=unlock;dialog.querySelector('#backup-confirm').required=!unlock;
    dialog.querySelector('#backup-password').autocomplete=unlock?'current-password':'new-password';
    dialog.querySelector('#backup-submit').textContent=unlock?'Unlock backup':'Export encrypted plan';
    return new Promise(resolve=>{pending={resolve,work,unlock,busy:false};dialog.showModal();dialog.querySelector('#backup-password').focus();});
  }
  root.PlanBackupUI={
    async export(config,encrypted){return encrypted?promptPassword(false,async password=>{await AppStorage.download(config,password);return true;}):AppStorage.download(config).then(()=>true);},
    async read(file){
      if(file.size>4*1024*1024)throw new Error('Choose a backup smaller than 4 MB.');
      const value=JSON.parse(await file.text());
      return PlanBackup.inspect(value)==='encrypted'?promptPassword(true,password=>PlanBackup.decode(value,password)):PlanBackup.decode(value);
    }
  };
})(window);
