(function(root){
  'use strict';
  const ITERATIONS=250000,MAX_BYTES=2*1024*1024;
  function cryptoAPI(){if(!root.crypto?.subtle)throw new Error('Password encryption requires HTTPS, localhost, or a supported offline browser. Open a secure copy of the app.');return root.crypto;}
  function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(value);}
  function bytes(value,length){
    if(typeof value!=='string'||value.length>4*1024*1024||value.length%4!==0||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid backup encoding.');
    const result=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    if(base64(result)!==value||(length&&result.length!==length))throw new Error('Invalid backup encoding.');return result;
  }
  async function key(password,salt,iterations,usage){
    if(typeof password!=='string'||password.length===0||password.length>1024)throw new Error('Enter a password between 1 and 1,024 characters.');
    const api=cryptoAPI(),material=await api.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    return api.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,[usage]);
  }
  async function encode(config,password){
    const data=root.PlanSchema.validate(config),payload=new TextEncoder().encode(JSON.stringify(data));
    if(payload.length>MAX_BYTES)throw new Error('The plan exceeds the 2 MB limit.');
    if(password===undefined)return {version:1,encrypted:false,data};
    const api=cryptoAPI(),salt=api.getRandomValues(new Uint8Array(16)),iv=api.getRandomValues(new Uint8Array(12));
    const encryptionKey=await key(password,salt,ITERATIONS,'encrypt');
    const encrypted=await api.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},encryptionKey,payload);
    return {version:1,encrypted:true,salt:base64(salt),iv:base64(iv),iterations:ITERATIONS,data:base64(new Uint8Array(encrypted))};
  }
  function inspect(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Choose a retirement plan JSON backup.');
    if(!Object.hasOwn(value,'encrypted')&&!Object.hasOwn(value,'version'))return 'legacy';
    if(value.version!==1||typeof value.encrypted!=='boolean')throw new Error('Unsupported backup version or format.');
    if(!value.encrypted)return 'plain';
    if(!Number.isSafeInteger(value.iterations)||value.iterations<100000||value.iterations>1000000)throw new Error('Unsupported backup iteration count.');
    bytes(value.salt,16);bytes(value.iv,12);const ciphertext=bytes(value.data);
    if(ciphertext.length<17||ciphertext.length>MAX_BYTES+16)throw new Error('Invalid encrypted backup size.');
    return 'encrypted';
  }
  async function decode(value,password){
    const format=inspect(value);
    if(format==='legacy')return root.PlanSchema.validate(value);
    if(format==='plain')return root.PlanSchema.validate(value.data);
    const api=cryptoAPI(),decryptionKey=await key(password,bytes(value.salt,16),value.iterations,'decrypt');
    let plaintext;
    try{plaintext=await api.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv,12),tagLength:128},decryptionKey,bytes(value.data));}
    catch(_){throw new Error('Incorrect password');}
    try{return root.PlanSchema.validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext)));}
    finally{new Uint8Array(plaintext).fill(0);}
  }
  root.PlanBackup={encode,decode,inspect};
})(typeof window!=='undefined'?window:globalThis);
