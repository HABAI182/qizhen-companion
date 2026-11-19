// Split the existing approved head exactly; generated paint is used only behind it.
const C=require('./common.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fs,path,sharp,ROOT,SOURCE,OUT,W,H,N,alpha,rgba,mask,union,intersect,cut,over,full,savePart,saveFull}=C;
const old=JSON.parse(fs.readFileSync(path.join(ROOT,'public/assets/parts/manifest.json')));
async function plate(id){const l=old.layers.find(l=>l.id===id);return sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:path.join(ROOT,'public',l.file),left:l.x,top:l.y}]).raw().toBuffer();}
async function erode(m,pixels){return sharp(m,{raw:{width:W,height:H,channels:1}}).erode(pixels).greyscale().raw().toBuffer();}
async function main(){
 const head=await plate('head'),eyes=JSON.parse(fs.readFileSync(path.join(OUT,'eyes-manifest.json'))),f=eyes.layers.find(l=>l.id==='face-skin');
 const paintedFace=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:path.join(OUT,f.file),left:f.x,top:f.y}]).raw().toBuffer();
 const faceRegion=alpha(paintedFace),hair=Buffer.from(head),face=Buffer.alloc(N*4);
 for(let i=0;i<N;i++){
  const j=i*4,r=head[j],g=head[j+1],b=head[j+2],a=head[j+3];if(!faceRegion[i]||!a)continue;
  const isHair=b-r>5||(b>=r-5&&Math.max(r,g,b)<125);
  if(!isHair){head.copy(face,j,j,j+4);hair.fill(0,j,j+4);}
  else if(a===255){paintedFace.copy(face,j,j,j+4);}
 }
 const merged=over(face,hair);let splitDiff=0;
 for(let i=0;i<N;i++){const j=i*4;if(head[j+3]&&[0,1,2,3].some(c=>head[j+c]!==merged[j+c]))splitDiff++;}
 assert.equal(splitDiff,0,'Face/hair split changed visible source pixels');
 const layers=[];
 layers.push(await savePart('face-native-complete','v14 完整脸底与隐藏额头',face,full(),'face'));
 layers.push(await savePart('front-hair-native','v14 原画前发与侧发主体',hair,full(),'hair-front'));
 const sideL=await plate('side-hair-left'),sideR=await plate('side-hair-right'),featherL=await plate('feather-left'),featherR=await plate('feather-right'),ahoge=await plate('ahoge');
 const scalp=await mask('M195 620 C187 358 363 159 643 159 C920 151 1114 344 1124 601 C1125 809 1027 1017 821 1080 L399 1080 C271 989 192 816 195 620Z');
 const sourceCoverage=union(alpha(head),alpha(sideL),alpha(sideR),intersect(alpha(featherL),scalp),intersect(alpha(featherR),scalp),intersect(alpha(ahoge),scalp));
 const back=await rgba(path.join(SOURCE,'v14/back-hair-raw.png')),backMask=await erode(sourceCoverage,4);
 layers.push(await savePart('back-hair-complete','v14 完整后发与饰品后遮挡补全',back,backMask,'hair-back'));
 for(const [side,id,shape] of [
  ['R','palm-mouse','M160 907 C166 889 190 882 215 886 C239 889 258 908 261 930 L161 932Z'],
  ['L','palm-keyboard','M738 927 C742 908 760 900 780 902 C804 904 822 921 827 945 L739 946Z']]){
  const palm=await plate(id),m=intersect(await erode(alpha(palm),4),await mask(shape));
  layers.push(await savePart('wrist-bridge-'+side,'v14 '+side+' 手袖隐藏连接',palm,m,'wrist',{side,neutralCoveredBy:id}));
 }
 const requests=layers.map(l=>({file:l.file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,l.file))).digest('hex'),width:l.width,height:l.height,x:l.x,y:l.y,name:'ZJU-v14-'+l.id,columns:Math.min(40,Math.max(4,Math.ceil(l.width/14))),rows:Math.min(40,Math.max(3,Math.ceil(l.height/14))),visible:false,drawOrder:l.group==='face'?200:l.group==='hair-front'?201:l.group==='hair-back'?105:449,...(l.group==='wrist'?{}:{parentDeformer:'RotationDeformerZJUHeadRotation'}),sourceLayer:l.id,group:l.group,...(l.side?{side:l.side}:{})}));
 fs.writeFileSync(path.join(OUT,'structure-native-plan.json'),JSON.stringify(requests,null,2));
 const review=path.join(ROOT,'art/v14-structure-review');fs.mkdirSync(review,{recursive:true});
 await saveFull(path.join(review,'face-and-front-hair-recombined.png'),merged);
 fs.writeFileSync(path.join(review,'source-checks.json'),JSON.stringify({faceHairSplitVisiblePixelsChanged:splitDiff,sourceDimensions:[W,H],backHair:'Generated complete hair plate restricted to eroded original coverage; neutral scene occlusion and native import not yet checked',wrists:'Source-painted concealed bridge under original palms; continuous joint rig pending',nativeImportVerified:false,layers},null,2));
 console.log(JSON.stringify({components:layers.length,sourceSplitChangedPixels:splitDiff}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
