// Tests only: exercise unchanged controllers from the generated package.
const fs=require('node:fs'),path=require('node:path');const original=fs.readFileSync;const root=path.resolve(__dirname,'..'),source=path.join(root,'src')+path.sep,out=path.join(root,'dist/pages');
fs.readFileSync=function(file,...args){if(typeof file==='string'){const absolute=path.resolve(file);if(absolute.startsWith(source))file=path.join(out,path.relative(source,absolute));}return original.call(fs,file,...args);};
