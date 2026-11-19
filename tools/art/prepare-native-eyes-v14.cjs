// Deterministic registration input for the native SDK. No binary model is written.
const C=require('./common.cjs'),crypto=require('node:crypto');
const {fs,path,ROOT,SOURCE,OUT,rgba,mask,union,colorMask,savePart,full}=C;
async function main(){
 const reference=fs.readFileSync(path.join(SOURCE,'zju-v13-reference.svg'),'utf8').replace(/<g id="official-eagle-hairpin"[^>]*>.*?<\/g>/,'<!-- Separate hairpin eagle removed at user request; full seal retained. -->');
 fs.writeFileSync(path.join(SOURCE,'zju-v14-reference.svg'),reference);
 const manifest=JSON.parse(fs.readFileSync(path.join(OUT,'eyes-manifest.json')));
 const clean=await rgba(path.join(SOURCE,'underpaint-raw.png'));
 const region=union(await mask(C.P.eyeL),await mask(C.P.eyeR));
 const fringe=colorMask(clean,(r,g,b)=>b>r+8||Math.max(r,g,b)<130&&b>r-8?1:0,region);
 const l=await savePart('eye-fringe-occlusion','v14 前发眼部遮挡',clean,fringe,'hair');
 const selected=manifest.layers.filter(l=>['eye-white','iris','lash-upper','lash-lower'].includes(l.group));selected.push(l);
 const requests=[];fs.mkdirSync(path.join(OUT,'native-padded'),{recursive:true});
 for(const l of selected){
  const width=2**Math.ceil(Math.log2(l.width)),height=2**Math.ceil(Math.log2(l.height));
  const file='native-padded/'+l.file;
  await C.sharp(path.join(OUT,l.file)).extend({left:0,top:0,right:width-l.width,bottom:height-l.height,background:'#00000000'}).png().toFile(path.join(OUT,file));
  requests.push({
  file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,file))).digest('hex'),
  width,height,x:l.x,y:l.y,name:'ZJU-v14-padded-'+l.id,
  columns:Math.min(40,Math.max(4,Math.ceil(width/12))),rows:Math.min(40,Math.max(2,Math.ceil(height/10))),
  drawOrder:l.group==='hair'?650:l.group==='eye-white'?610:l.group==='iris'?620:630,
  visible:false,parentDeformer:'RotationDeformerZJUHeadRotation',sourceLayer:l.id
 });}
 fs.writeFileSync(path.join(OUT,'native-import-plan.json'),JSON.stringify(requests,null,2));
 console.log(JSON.stringify({artworkParts:requests.length,gridVertices:requests.reduce((n,l)=>n+(l.columns+1)*(l.rows+1),0)}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
