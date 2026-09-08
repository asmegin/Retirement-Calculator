'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'src','public'),target=path.join(root,'dist','pages');
require('../src/build-client');
// Resolve and verify the generated target before any recursive delete.
if(path.relative(root,target)!==path.join('dist','pages'))throw new Error('Unsafe build output path');
for(const dir of [path.join(root,'dist'),target]){if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw new Error('Build output cannot be a symlink');}
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
fs.cpSync(source,target,{recursive:true,filter:file=>!fs.lstatSync(file).isSymbolicLink()});
fs.writeFileSync(path.join(target,'.nojekyll'),'');
console.log('Built serverless site in dist/pages. Serve at / or a project subpath.');
