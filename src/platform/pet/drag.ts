import {command} from '../../shared/lib/bridge';
type Point={x:number;y:number};
/** Serialize native moves so an old pointer event cannot move a newer drag. */
export class PetDragController {
  private origin:Point|null=null;
  private id='';
  private queue:Promise<unknown>=Promise.resolve();
  dragged=false;
  constructor(private readonly onError:(error:unknown)=>void) {}
  start(point:Point){this.origin=point;this.id=crypto.randomUUID();this.dragged=false;}
  move(point:Point){
    if(!this.origin)return;
    if(!this.dragged){
      if(Math.hypot(point.x-this.origin.x,point.y-this.origin.y)<=5)return;
      this.dragged=true;this.send('start',this.origin);
    }
    this.send('move',point);
  }
  finish(){if(this.origin&&this.dragged)this.send('end',this.origin);this.origin=null;}
  private send(phase:'start'|'move'|'end',point:Point){
    const dragId=this.id;
    this.queue=this.queue.catch(()=>{}).then(()=>command('pet_drag',{dragId,phase,...point})).catch(this.onError);
  }
}
