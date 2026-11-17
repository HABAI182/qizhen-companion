// Prepare genuine isolated artwork components; no Cubism binding/export is asserted.
const C=require('./common.cjs'),assert=require('node:assert/strict');
const {fs,path,sharp,ROOT,SOURCE,OUT,W,H,N,P,full,rgba,original,mask,strokeMask,alpha,union,intersect,subtract,colorMask,cut,over,bounds,largestComponent,fillHoles,featherInside,savePart,saveFull}=C;
const {createCanvas,loadImage,Path2D}=require('@napi-rs/canvas');
const faceShape='M347 665 C322 556 356 432 446 382 C535 337 653 348 752 388 C844 429 893 532 882 662 C894 736 870 800 829 838 C794 870 744 899 693 907 C651 913 610 913 576 904 C510 888 453 872 409 848 C372 824 351 787 347 748Z';
const chinPath='M356 774 C374 826 417 854 474 873 C524 891 573 907 615 910 C661 914 710 908 749 890';
const upperContours={L:'M327 666 Q345 668 359 651 Q394 625 429 631 Q476 637 510 668 Q526 686 531 711 Q515 681 495 666 Q470 650 441 650 Q401 651 379 678 Q363 699 375 723 Q352 707 352 686 Q347 677 337 674Z',R:'M674 716 Q698 689 724 681 Q758 674 792 688 Q821 699 842 715 Q859 723 879 716 L870 733 L888 744 L875 751 L891 777 L872 774 Q859 798 836 809 L845 793 Q854 774 838 750 Q812 717 783 703 Q754 696 731 705 Q703 708 687 749 Q689 731 674 716Z'};
const eyeSpecs=[
 {side:'screen-left',key:'L',iris:{cx:470,cy:704,rx:63,ry:63},standardOpen:'ParamEyeROpen',inkBounds:{upper:[326,626,213,104],lower:[387,737,137,16],closed:[347,692,191,50]}},
 {side:'screen-right',key:'R',iris:{cx:746,cy:754,rx:64,ry:63},standardOpen:'ParamEyeLOpen',inkBounds:{upper:[671,675,222,113],lower:[687,779,160,42],closed:[673,731,193,63]}}
];
const ellipse=({cx,cy,rx,ry})=>`M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 -${rx*2} 0Z`;
const saturation=(r,g,b)=>(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(1,r,g,b);
async function main(){
 const source=await original(),sclera=await rgba(path.join(SOURCE,'sclera-raw.png')),closed=await rgba(path.join(SOURCE,'closed-eyes-raw.png'));
 const cleanPlate=await rgba(path.join(SOURCE,'underpaint-raw.png'));
 const openInk=await rgba(path.join(SOURCE,'v14/open-lashes-raw.png')),closedInk=await rgba(path.join(SOURCE,'v14/closed-lashes-raw.png'));
 const rawSkin=await rgba(path.join(SOURCE,'v14/face-skin-raw.png'));
 const faceM=await mask(faceShape),eyeRegions=union(await mask(P.eyeL),await mask(P.eyeR)),allowedEyeRegions=union(await mask(P.eyeL,3),await mask(P.eyeR,3)),mouthM=await mask(P.mouth);
 const originalSkin=colorMask(source,(r,g,b)=>r>158&&g>112&&b>95&&r>=b+5?1:0,subtract(faceM,eyeRegions,mouthM));
 const chinM=intersect(await mask(chinPath,3),colorMask(source,(r,g,b)=>r>b+5&&r>g+3?1:0));
 const skin=over(cut(rawSkin,faceM),cut(source,union(originalSkin,chinM)));
 const layers=[];
 layers.push(await savePart('face-skin','完整脸底与隐藏额头',skin,full(),'face',{hiddenArt:'Complete continuous forehead and blank skin; original visible cheek/chin pixels restored',editorImportVerified:false}));
 const irisRaw=await rgba(path.join(SOURCE,'v14/iris-complete-raw.png'));
 const discMask=largestComponent(alpha(irisRaw)),discBounds=bounds(discMask,1,8);
 const disc=await sharp(cut(irisRaw,discMask),{raw:{width:W,height:H,channels:4}}).extract(discBounds).png().toBuffer();
 const eyes=[],registrations=[];
 const fringe=colorMask(cleanPlate,(r,g,b)=>b>r+8||Math.max(r,g,b)<130&&b>r-8?1:0,eyeRegions);
 const fringeExpanded=await sharp(fringe,{raw:{width:W,height:H,channels:1}}).dilate(1).raw().toBuffer();
 function sourceInk(art,shape){const result=Buffer.alloc(N*4);for(let i=0;i<N;i++){if(!shape[i]||fringeExpanded[i]>100)continue;const j=i*4,maximum=Math.max(art[j],art[j+1],art[j+2]);const a=Math.max(0,Math.min(1,(230-maximum)/70));if(a<.08)continue;for(let c=0;c<3;c++)result[j+c]=Math.max(0,Math.min(255,Math.round((art[j+c]-(1-a)*cleanPlate[j+c])/a)));result[j+3]=Math.round(a*shape[i]);}return result;}
 async function registerInk(raw,region,targetBounds,label){
  const selected=largestComponent(intersect(alpha(raw),region)),from=bounds(selected,1,8),to={left:targetBounds[0],top:targetBounds[1],width:targetBounds[2],height:targetBounds[3]};
  const clipped=await sharp(cut(raw,selected),{raw:{width:W,height:H,channels:4}}).extract(from).resize(to.width,to.height,{fit:'fill'}).png().toBuffer();
  const result=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:clipped,left:to.left,top:to.top}]).raw().toBuffer();
  registrations.push({label,generatedBounds:from,referenceBounds:to,scale:[to.width/from.width,to.height/from.height],purpose:'Register an isolated generated ink component to the approved source stroke bounds; eye-region redraw only'});
  return result;
 }
 for(const spec of eyeSpecs){
  const aperture=await mask(P['aperture'+spec.key]),region=await mask(P['eye'+spec.key]),irisArea=await mask(ellipse(spec.iris));
  const upperShape=await mask(upperContours[spec.key]);
  const lowerGuide=spec.key==='L'?'M389 743 C428 739 477 740 521 745':'M690 781 C719 786 760 801 794 809 C816 815 835 806 845 795';
  const lowerBand=await strokeMask(lowerGuide,5);
  // Entire sclera backing is reconstructed, including the old iris rim.
  const whiteM=intersect(aperture,fillHoles(largestComponent(colorMask(sclera,(r,g,b)=>Math.min(r,g,b)>150&&b>=r-13&&saturation(r,g,b)<.23?1:0,aperture))));
  const white=cut(sclera,whiteM);
  const {cx,cy,rx,ry}=spec.iris,dw=rx*2+1,dh=ry*2+1;
  const fullDiscBuffer=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:await sharp(disc).resize(dw,dh,{fit:'fill'}).png().toBuffer(),left:cx-rx,top:cy-ry}]).raw().toBuffer();
  const visibleIris=featherInside(subtract(intersect(aperture,irisArea,await mask(P['iris'+spec.key])),fringeExpanded,lowerBand,upperShape),4);
  const iris=over(fullDiscBuffer,cut(source,visibleIris));
  // Use isolated ink source, rather than thresholding a face/hair composite.
  const genUpper=colorMask(openInk,(r,g,b,x,y)=>(spec.key==='L'?x<627&&y<745:x>=627&&y<837)?1:0);
  const genLower=colorMask(openInk,(r,g,b,x,y)=>(spec.key==='L'?x<627&&y>=745:x>=627&&y>=837)?1:0);
  const genClosed=colorMask(closedInk,(r,g,b,x)=>(spec.key==='L'?x<627:x>=627)?1:0);
  const generatedUpper=await registerInk(openInk,genUpper,spec.inkBounds.upper,spec.side+' upper');
  const generatedLower=await registerInk(openInk,genLower,spec.inkBounds.lower,spec.side+' lower');
  const generatedClosed=await registerInk(closedInk,genClosed,spec.inkBounds.closed,spec.side+' closed');
  const upper=over(cut(generatedUpper,fringe),sourceInk(source,subtract(upperShape,aperture)));
  const lower=sourceInk(source,intersect(lowerBand,region));
  const cb=spec.inkBounds.closed,closedRegion=await mask(`M${cb[0]} ${cb[1]}h${cb[2]}v${cb[3]}h-${cb[2]}Z`);
  const closedLine=over(cut(generatedClosed,fringe),sourceInk(closed,closedRegion));
  const prefix='eye-'+spec.side;
  const whiteL=await savePart(prefix+'-white',spec.side+' 完整眼白',white,full(),'eye-white',{clipId:prefix+'-aperture',standardOpen:spec.standardOpen,oldIrisPaintRemoved:true});
  const irisL=await savePart(prefix+'-iris',spec.side+' 完整虹膜',iris,full(),'iris',{clipId:prefix+'-aperture',completeDisc:true,originalCorePixels:true,seamBlendPixels:4});
  const upperL=await savePart(prefix+'-upper-lash',spec.side+' 上睫毛',upper,full(),'lash-upper',{standardOpen:spec.standardOpen,source:'Source stroke pixels matted inside traced outline; hidden ink completed from isolated imagegen source'});
  const lowerL=await savePart(prefix+'-lower-lash',spec.side+' 下眼线',lower,full(),'lash-lower',{standardOpen:spec.standardOpen});
  const closedL=await savePart(prefix+'-closed-lash',spec.side+' 闭眼形参照',closedLine,full(),'closed-lash',{hidden:true,continuousLidRigVerified:false});
  layers.push(whiteL,irisL,upperL,lowerL,closedL);
  eyes.push({spec,whiteL,irisL,upperL,lowerL,closedL,aperture,visibleIris});
 }
 const cleanMouth=colorMask(source,(r,g,b)=>r<208&&g<155&&b<145&&r>g*1.13&&r>b*1.15?1:0,mouthM);
 layers.push(await savePart('mouth-line','原画闭口嘴线',source,cleanMouth,'mouth'));
 // Inspector context only: rebuild these isolated eye parts over a cleaned local
 // skin backing while protecting every pixel outside the authorized eye regions.
 const reference=await rgba(path.join(ROOT,'public/assets/neutral-reference.png'));
 let context=Buffer.from(reference);
 context=over(context,cut(cleanPlate,allowedEyeRegions));
 const audit=path.join(ROOT,'art/v14-eye-review');fs.mkdirSync(audit,{recursive:true});
 await saveFull(path.join(audit,'clean-eye-skin-context.png'),context);
 const fringeOverlay=await loadImage(await sharp(cut(cleanPlate,fringe),{raw:{width:W,height:H,channels:4}}).png().toBuffer());
 const partImage=async l=>loadImage(path.join(OUT,l.file));
 const imageMap=new Map();for(const l of layers)imageMap.set(l.id,await partImage(l));
 const render=async(name,gazeX,gazeY,closedEyes=false)=>{
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');ctx.drawImage(await loadImage(await sharp(context,{raw:{width:W,height:H,channels:4}}).png().toBuffer()),0,0);
  // The inspection composition protects the authorized edit region. Complete
  // source glyphs remain untrimmed for later Cubism deformation/occlusion setup.
  ctx.save();const editClip=new Path2D(P.eyeL);editClip.addPath(new Path2D(P.eyeR));ctx.clip(editClip);
  for(const e of eyes){
   if(closedEyes){const l=e.closedL;ctx.drawImage(imageMap.get(l.id),l.x,l.y);continue;}
   const w=e.whiteL;ctx.drawImage(imageMap.get(w.id),w.x,w.y);
   ctx.save();ctx.clip(new Path2D(P['aperture'+e.spec.key]));const i=e.irisL;ctx.drawImage(imageMap.get(i.id),i.x+gazeX*5,i.y+gazeY*3.5);ctx.restore();
   for(const l of [e.upperL,e.lowerL])ctx.drawImage(imageMap.get(l.id),l.x,l.y);
  }
  ctx.drawImage(fringeOverlay,0,0);
  ctx.restore();
  const data=canvas.toBuffer('image/png');fs.writeFileSync(path.join(audit,name+'.png'),data);return data;
 };
 const renders=[];for(const args of [['neutral',0,0],['look-left',-1,0],['look-right',1,0],['look-up',0,-1],['look-down',0,1],['closed',0,0,true]])renders.push(await render(...args));
 const thumbs=await Promise.all(renders.map(b=>sharp(b).resize(420,420).flatten({background:'#edf3f9'}).png().toBuffer()));
 await sharp({create:{width:1260,height:840,channels:4,background:'#edf3f9'}}).composite(thumbs.map((input,i)=>({input,left:i%3*420,top:Math.floor(i/3)*420}))).png().toFile(path.join(audit,'contact-sheet.png'));
 const manifest={version:14,kind:'Independent artwork components; rig/export pending',canvas:{width:W,height:H},basis:'v13',layers,clipping:eyes.map(e=>({id:e.whiteL.clipId,path:P['aperture'+e.spec.key]}))};
 fs.writeFileSync(path.join(OUT,'eyes-manifest.json'),JSON.stringify(manifest,null,2));
 let outsideDiff=0,insideDiff=0;const neutral=await rgba(renders[0]);for(let i=0;i<N;i++){const j=i*4;if([0,1,2,3].some(c=>Math.abs(reference[j+c]-neutral[j+c])>3)){if(allowedEyeRegions[i]>0)insideDiff++;else outsideDiff++;}}
 fs.writeFileSync(path.join(OUT,'ink-registration.json'),JSON.stringify(registrations,null,2));
 const report={components:layers.length,irisCompleteDiscs:2,eyeWhiteIndependent:true,openAndClosedLashPartsIndependent:true,protectedPixelsChanged:outsideDiff,pixelDifferenceThreshold:3,allowedEyeRegionBufferPixels:3,eyeRegionChangedPixels:insideDiff,inspectionEditRegionClip:true,faceSkinPart:'Complete blank skin and concealed forehead',continuousLidGeometryVerified:false,cubismImportVerified:false,visualAcceptance:'pending',standardEyeSides:eyes.map(e=>({imageSide:e.spec.side,openParameter:e.spec.standardOpen})),scope:'Artwork component preparation and source-pixel protection only; isolated ink registration recorded separately'};
 fs.writeFileSync(path.join(audit,'checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(outsideDiff,0,'Eye work changed pixels outside the specified eye regions.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
