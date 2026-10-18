export class LiveScreenGate {
  private previous:readonly {x:number;y:number}[]|null=null;
  private count=0;
  private last=-Infinity;
  observe(corners:readonly {x:number;y:number}[]|null,now:number):boolean{
    const valid=corners?.length===4 && corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
    if(!valid){this.previous=null;this.count=0;this.last=-Infinity;return false;}
    // A processing gap expires the displayed pixels, not an established identity.
    // A fresh matching detection may resume tracking; missing or moved boundaries
    // still reset confirmation. Initial acquisition must remain consecutive.
    const agrees=now>=this.last && (this.count>=3||now-this.last<=1000) && this.previous && corners.every((p,i)=>Math.hypot(p.x-this.previous![i]!.x,p.y-this.previous![i]!.y)<=.02);
    this.count=agrees?this.count+1:1;this.previous=corners;this.last=now;
    return this.visible(now);
  }
  visible(now:number):boolean{return this.count>=3 && now>=this.last && now-this.last<=1000;}
}
