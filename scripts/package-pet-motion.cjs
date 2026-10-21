const fs=require('node:fs');
const path=require('node:path');
// Asset authoring only: use an existing Sharp installation; no runtime app dependency.
const sharp=require(process.env.MOSHU_SHARP_MODULE||'sharp');
function boundaries(projection,count){
 const size=projection.length;const result=[0];
 for(let i=1;i<count;i++){
  const expected=size*i/count;const reach=size/count*.24;
  let best=Math.round(expected),score=Infinity;
  for(let p=Math.max(result.at(-1)+1,Math.floor(expected-reach));p<Math.min(size,expected+reach);p++){
   const value=projection[p]+Math.abs(p-expected)*.025;
   if(value<score){best=p;score=value;}
  }
  result.push(best);
 }
 result.push(size);return result;
}
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 const root=path.resolve('src/platform/pet/assets/motion');const manifestPath=path.join(root,'manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const clip=manifest.clips[input.id];
 if(!clip)throw new Error('Unknown motion');
 const {data,info}=await sharp(input.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const horizontal=Array(info.height).fill(0),vertical=Array(info.width).fill(0);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>64){horizontal[y]++;vertical[x]++;}
 const xs=boundaries(vertical,clip.columns),ys=boundaries(horizontal,clip.rows);
 const cells=[];
 for(let i=0;i<clip.frames;i++){
  const column=i%clip.columns,row=Math.floor(i/clip.columns);const left=xs[column],top=ys[row];
  const width=xs[column+1]-left,height=ys[row+1]-top;let minX=width,minY=height,maxX=0,maxY=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[((top+y)*info.width+left+x)*4+3]>96){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  cells.push({left,top,width,height,minX,minY,maxX,maxY});
 }
 // Preserve the cell-relative anchor across frames, while fitting the union of
 // every silhouette. Centering the raw source cells clipped off-center tails.
 const minX=Math.min(...cells.map(cell=>cell.minX-cell.width/2));
 const maxX=Math.max(...cells.map(cell=>cell.maxX-cell.width/2));
 const anchor=-(minX+maxX)/2;
 const scale=Math.min(294/(maxX-minX+1),...cells.map(cell=>442/Math.max(1,cell.maxY-cell.minY+1)));
 const overlays=[];
 for(let i=0;i<cells.length;i++){
  const cell=cells[i];const width=Math.max(1,Math.round(cell.width*scale));const height=Math.max(1,Math.round(cell.height*scale));
  const resized=await sharp(input.path).extract({left:cell.left,top:cell.top,width:cell.width,height:cell.height}).resize(width,height).png().toBuffer();
  const x=Math.round(160+(anchor-cell.width/2)*scale),y=Math.round(456-cell.maxY*scale);
  const sourceLeft=Math.max(0,-x),sourceTop=Math.max(0,-y),destX=Math.max(0,x),destY=Math.max(0,y);
  const cropped=await sharp(resized).extract({left:sourceLeft,top:sourceTop,width:Math.min(width-sourceLeft,320-destX),height:Math.min(height-sourceTop,480-destY)}).png().toBuffer();
  overlays.push({input:cropped,left:(i%clip.columns)*320+destX,top:Math.floor(i/clip.columns)*480+destY});
 }
 await sharp({create:{width:320*clip.columns,height:480*clip.rows,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(overlays).webp({lossless:true,effort:4}).toFile(path.join(root,`${input.id}.webp`));
 Object.assign(clip,{file:`${input.id}.webp`,prompt:input.prompt,sourceWidth:info.width,sourceHeight:info.height,frameWidth:320,frameHeight:480});
 manifest.status='in-production-not-tested';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({id:input.id,frames:clip.frames,bytes:fs.statSync(path.join(root,clip.file)).size}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
