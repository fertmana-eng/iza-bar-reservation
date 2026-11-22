// Compare two screenshot folders pixel by pixel; writes diff-*.png images for differences.
// Usage:  node tests/visual/compare.js tests/visual/out/before tests/visual/out/after
const fs=require('fs'),path=require('path'),{PNG}=require('pngjs'),pm=require('pixelmatch');
const [A,B]=process.argv.slice(2);let bad=0,n=0;
for(const f of fs.readdirSync(A).filter(f=>f.endsWith('.png')).sort()){n++;
 const a=PNG.sync.read(fs.readFileSync(path.join(A,f)));if(!fs.existsSync(path.join(B,f))){console.log('MISSING',f);bad++;continue;}
 const b=PNG.sync.read(fs.readFileSync(path.join(B,f)));
 if(a.width!==b.width||a.height!==b.height){console.log('SIZE',f,a.width+'x'+a.height,'->',b.width+'x'+b.height);bad++;continue;}
 const d=new PNG({width:a.width,height:a.height});const px=pm(a.data,b.data,d.data,a.width,a.height,{threshold:0});
 if(px){bad++;console.log('DIFF',f,px,'px');fs.writeFileSync(path.join(B,'diff-'+f),PNG.sync.write(d));}
}
console.log(`${n} screenshots compared, ${bad} different`);
