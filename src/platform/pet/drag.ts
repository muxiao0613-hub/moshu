import {command} from '../../shared/lib/bridge';
type Point={x:number;y:number};
type DragSession={id:string;origin:Point;latest:Point|null;started:boolean;finished:boolean;queued:boolean;failed:boolean};
/** Keep only the newest unsent pointer position instead of accumulating IPC moves. */
export class PetDragController {
  private session:DragSession|null=null;
  private queue:Promise<unknown>=Promise.resolve();
  dragged=false;
  constructor(private readonly onError:(error:unknown)=>void) {}
  start(point:Point){
    this.finish();this.dragged=false;
    this.session={id:crypto.randomUUID(),origin:point,latest:null,started:false,finished:false,queued:false,failed:false};
  }
  move(point:Point){
    const session=this.session;if(!session||session.failed)return;
    if(!this.dragged){if(Math.hypot(point.x-session.origin.x,point.y-session.origin.y)<=5)return;this.dragged=true;}
    session.latest=point;this.flush(session);
  }
  finish(){
    const session=this.session;this.session=null;
    if(!session)return;session.finished=true;
    if(this.dragged&&!session.failed)this.flush(session);
  }
  private flush(session:DragSession){
    if(session.queued)return;session.queued=true;
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      try{
        if(!session.started){await command('pet_drag',{dragId:session.id,phase:'start',...session.origin});session.started=true;}
        while(session.latest){const point=session.latest;session.latest=null;await command('pet_drag',{dragId:session.id,phase:'move',...point});}
        if(session.finished){await command('pet_drag',{dragId:session.id,phase:'end',...session.origin});session.started=false;}
      }catch(error){
        session.failed=true;session.latest=null;this.onError(error);
        if(session.started)await command('pet_drag',{dragId:session.id,phase:'end',...session.origin}).catch(()=>{});
      }finally{session.queued=false;}
    });
  }
}
