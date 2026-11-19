const C=require('./common.cjs'),crypto=require('node:crypto');
const {fs,path,SOURCE,OUT,ROOT,W,H,rgba,colorMask,alpha,intersect,largestComponent,bounds,cut,sharp,full,savePart}=C;
async function main(){
 const raw=await rgba(path.join(SOURCE,'v14/closed-lashes-raw.png')),parts=[];
 for(const [side,x,y,width,height] of [['left',347,703,191,35],['right',673,755,193,38]]){
  const region=colorMask(raw,(r,g,b,px)=>(side==='left'?px<627:px>=627)?1:0);
  const m=largestComponent(intersect(alpha(raw),region)),box=bounds(m,1,8);
  const piece=await sharp(cut(raw,m),{raw:{width:W,height:H,channels:4}}).extract(box).resize(width,height).png().toBuffer();
  const whole=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:piece,left:x,top:y}]).raw().toBuffer();
  const l=await savePart('eye-screen-'+side+'-closed-clean','v14 '+side+' 干净闭眼睫毛',whole,full(),'closed-lash');
  const pw=2**Math.ceil(Math.log2(l.width)),ph=2**Math.ceil(Math.log2(l.height));
  const file='native-padded/'+l.file;
  await sharp(path.join(OUT,l.file)).extend({left:0,top:0,right:pw-l.width,bottom:ph-l.height,background:'#00000000'}).png().toFile(path.join(OUT,file));
  parts.push({...l,file,width:pw,height:ph,x:l.x,y:l.y,columns:Math.ceil(pw/12),rows:Math.ceil(ph/10),drawOrder:640,visible:false,parentDeformer:'RotationDeformerZJUHeadRotation',name:'ZJU-v14-'+l.id,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,file))).digest('hex')});
 }
 fs.writeFileSync(path.join(OUT,'closed-native-plan.json'),JSON.stringify(parts,null,2));console.log('Prepared two isolated closed strokes; no face/hair pixels');
}
main().catch(e=>{console.error(e);process.exitCode=1});
