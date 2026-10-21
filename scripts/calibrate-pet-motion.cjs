const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require(process.env.MOSHU_SHARP_MODULE||'sharp');
// Analyse existing artwork only. No image pixels are rewritten or invented.
const root=path.resolve('src/platform/pet/assets/motion');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
(async()=>{
 const clips={};const report={};
 for(const [id,clip] of Object.entries(manifest.clips)){
  const file=path.join(root,clip.file);const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const frames=[];
  for(let n=0;n<clip.frames;n++){
   const ox=n%clip.columns*320,oy=Math.floor(n/clip.columns)*480;
   let minX=320,minY=480,maxX=-1,maxY=-1;
   for(let y=0;y<480;y++)for(let x=0;x<320;x++)if(data[((oy+y)*info.width+ox+x)*4+3]>96){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   if(maxX<0)throw Error(`${id}: empty frame ${n}`);
   // The top quarter contains the head and ears; tail/hands below it do not
   // pull the horizontal anchor as a silhouette-centre calculation would.
   const bottom=Math.round(minY+(maxY-minY)*.24);let weight=0,cx=0,cy=0;
   for(let y=minY;y<=bottom;y++)for(let x=minX;x<=maxX;x++){
    const alpha=data[((oy+y)*info.width+ox+x)*4+3]/255;
    if(alpha<.5)continue;weight+=alpha;cx+=x*alpha;cy+=y*alpha;
   }
   frames.push({minX,minY,maxX,maxY,headX:cx/weight,headY:cy/weight});
  }
  const headY=median(frames.map(f=>f.headY));
  // All actions share a screen-space head anchor, including seated clips whose
  // renderScale differs. Reserve room on both sides instead of clipping tails.
  const headX=160-16/clip.renderScale;
  // Preserve intentional bending/nodding in one-shot actions. Only steady
  // breathing loops receive the tiny vertical baseline correction.
  const lockHeight=['idle','sitting','reading'].includes(id);
  const aligned=frames.map(f=>{
   const sy=lockHeight?Math.max(.96,Math.min(1.04,(456-headY)/(456-f.headY))):1;
   return {x:headX-f.headX,y:456*(1-sy),scaleY:sy};
  });
  // Reserve enough transparent margin for the complete aligned silhouettes.
  const minX=Math.min(...frames.map((f,i)=>f.minX+aligned[i].x));
  const maxX=Math.max(...frames.map((f,i)=>f.maxX+aligned[i].x));
  const minY=Math.min(...frames.map((f,i)=>f.minY*aligned[i].scaleY+aligned[i].y));
  const fit=Math.min(1,304/(maxX-minX+1),448/(456-minY));
  const anchor=Math.max(8-(minX-headX)*fit,Math.min(312-(maxX-headX)*fit,headX));
  const placements=aligned.map(f=>({x:Number((anchor+(f.x-headX)*fit).toFixed(4)),y:Number((456+(f.y-456)*fit).toFixed(4)),scaleX:Number(fit.toFixed(6)),scaleY:Number((f.scaleY*fit).toFixed(6))}));
  const registeredHeads=frames.map((f,i)=>f.headX*placements[i].scaleX+placements[i].x);
  for(let i=0;i<frames.length;i++){
   const f=frames[i],p=placements[i];
   if(f.minX*p.scaleX+p.x<7.99||f.maxX*p.scaleX+p.x>312.01||f.minY*p.scaleY+p.y<7.99||f.maxY*p.scaleY+p.y>472.01)throw Error(`${id}: aligned frame ${i} clipped`);
  }
  clips[id]={sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),anchorX:Number(anchor.toFixed(4)),frames:placements};
  report[id]={beforeHorizontalDrift:Number((Math.max(...frames.map(f=>f.headX))-Math.min(...frames.map(f=>f.headX))).toFixed(2)),afterHorizontalDrift:Number((Math.max(...registeredHeads)-Math.min(...registeredHeads)).toFixed(4)),fit:Number(fit.toFixed(4))};
 }
 fs.writeFileSync(path.join(root,'registration.json'),JSON.stringify({version:1,frameWidth:320,frameHeight:480,clips},null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
