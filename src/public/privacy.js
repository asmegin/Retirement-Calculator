(function(root){
  'use strict';
  let active=false,observer;
  try{active=JSON.parse(localStorage.getItem('retirement-'+encodeURIComponent(new URL('.',document.currentScript.src).pathname)+'-pref-privacy'))===true;document.documentElement.classList.toggle('privacy-mode',active);}catch(_){}
  const money=/[+−-]?(?:CA)?\$\s?[\d,.]+[kKmMbB]?(?:\/mo|\/yr)?/g;
  function protect(container=document.body){
    observer?.disconnect();
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(!node.parentElement||node.parentElement.closest('script,style,option,textarea,.private-value,.private-field,.backup-dialog'))continue;
      const pattern=node.parentElement.closest('td,th')?/[+−-]?\$?\d[\d,.%]*[kKmMbB]?/g:money;
      const matches=[...node.textContent.matchAll(pattern)];if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let offset=0;
      for(const match of matches){
        fragment.append(document.createTextNode(node.textContent.slice(offset,match.index)));
        const span=document.createElement('span'),original=document.createElement('span'),mask=document.createElement('span');
        span.className='private-value';original.className='private-original';original.textContent=match[0];mask.className='private-mask';mask.textContent='••••••';mask.setAttribute('aria-label','Hidden figure');span.append(original,mask);fragment.append(span);offset=match.index+match[0].length;
      }
      fragment.append(document.createTextNode(node.textContent.slice(offset)));node.replaceWith(fragment);
    }
    container.querySelectorAll('input[type=number],input[type=range],select').forEach(input=>{
      if(input.tagName==='SELECT'&&!Array.from(input.options).some(option=>option.textContent.includes('$')))return;
      if(!input.parentElement.classList.contains('private-field')){const wrap=document.createElement('span');wrap.className='private-field';input.before(wrap);wrap.append(input);const mask=document.createElement('span');mask.className='private-input-mask';mask.textContent='••••••';wrap.append(mask);}
      input.inert=active;
    });
    observer?.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  async function apply(value,persist=true){
    active=!!value;document.documentElement.classList.toggle('privacy-mode',active);
    const button=document.getElementById('privacy-toggle');if(button){button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Show financial figures':'Hide financial figures');button.textContent=active?'\u{1F441} Show figures':'\u{1F441} Hide figures';}
    protect();if(persist)await AppStorage.setPreference('privacy',active);
  }
  function mountToggle(container,status){
    const button=document.createElement('button');button.id='privacy-toggle';button.className='btn ghost';button.title='Discreet display mode';
    button.onclick=()=>apply(!active).catch(e=>{const target=status||document.getElementById('file-status');if(target)target.textContent=e.message;});
    container.append(button);
    button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Show financial figures':'Hide financial figures');button.textContent=active?'\u{1F441} Show figures':'\u{1F441} Hide figures';
    return button;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    observer=new MutationObserver(()=>protect());
    AppStorage.getPreference('privacy').then(v=>apply(v===true,false)).catch(()=>apply(false,false));
    window.addEventListener('storage',()=>AppStorage.getPreference('privacy').then(v=>apply(v===true,false)).catch(()=>{}));
  });
  root.AppPrivacy={apply,mountToggle,get active(){return active;}};
})(window);
