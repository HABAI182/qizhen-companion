// Measure the artwork separately from the invisible parts of the native window
// and the toolbar, so desktop placement follows the drawing.
export function artworkAlpha(rgba,width,height,threshold=8){
 const occupied=new Uint8Array(width*height);
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;
  if(rgba[i*4+3]<threshold)continue;
  occupied[i]=1;
  left=Math.min(left,x);top=Math.min(top,y);
  right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
 }
 return {occupied,bounds:right&&bottom?[left,top,right,bottom]:null};
}

// Row runs keep IPC compact without exposing any pixel colors.
export function alphaRuns(occupied,width,height,hotspots=[]){
 // One sample of tolerance keeps fine, antialiased hair tips easy to touch.
 const mask=occupied.slice();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(occupied[y*width+x]){
  if(x)mask[y*width+x-1]=1;if(x+1<width)mask[y*width+x+1]=1;
  if(y)mask[(y-1)*width+x]=1;if(y+1<height)mask[(y+1)*width+x]=1;
 }
 for(const [x0,y0,x1,y1] of hotspots){
  const left=Math.max(0,Math.floor(x0)),right=Math.min(width,Math.ceil(x1));
  const top=Math.max(0,Math.floor(y0)),bottom=Math.min(height,Math.ceil(y1));
  if(right<=left||bottom<=top)continue;
  for(let y=top;y<bottom;y++)mask.fill(1,y*width+left,y*width+right);
 }
 const runs=[];let hash=2166136261;
 for(let y=0;y<height;y++)for(let x=0;x<width;){
  if(!mask[y*width+x]){x++;continue;}const start=x;while(x<width&&mask[y*width+x])x++;
  runs.push([y,start,x]);for(const n of [y,start,x])hash=Math.imul(hash^n,16777619);
 }
 return {runs,hash:hash>>>0};
}
