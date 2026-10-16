export interface Region{x:number;y:number;width:number;height:number}
export interface Box{x:number;y:number;width:number;height:number}
export function pixelRegion(region:Region,width:number,height:number):Box{
 if(!Object.values(region).every(Number.isFinite)||region.x<0||region.y<0||region.width<=0||region.height<=0||region.x+region.width>1||region.y+region.height>1)throw new Error('Invalid region');
 const x=Math.floor(region.x*width),y=Math.floor(region.y*height);
 const w=Math.floor((region.x+region.width)*width)-x,h=Math.floor((region.y+region.height)*height)-y;
 if(w<1||h<1)throw new Error('Empty pixel region');
 return{x,y,width:w,height:h};
}
