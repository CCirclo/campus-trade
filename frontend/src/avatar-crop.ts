export type CropGeometry={sourceX:number;sourceY:number;sourceSize:number};

export function avatarCropGeometry(imageWidth:number,imageHeight:number,viewport:number,zoom:number,offsetX:number,offsetY:number):CropGeometry{
  const baseScale=Math.max(viewport/imageWidth,viewport/imageHeight),scale=baseScale*zoom,displayWidth=imageWidth*scale,displayHeight=imageHeight*scale;
  const maxX=Math.max(0,(displayWidth-viewport)/2),maxY=Math.max(0,(displayHeight-viewport)/2),safeX=Math.max(-maxX,Math.min(maxX,offsetX)),safeY=Math.max(-maxY,Math.min(maxY,offsetY));
  return {sourceX:((displayWidth-viewport)/2-safeX)/scale,sourceY:((displayHeight-viewport)/2-safeY)/scale,sourceSize:viewport/scale};
}

export function clampCropOffset(imageWidth:number,imageHeight:number,viewport:number,zoom:number,x:number,y:number){
  const scale=Math.max(viewport/imageWidth,viewport/imageHeight)*zoom,maxX=Math.max(0,(imageWidth*scale-viewport)/2),maxY=Math.max(0,(imageHeight*scale-viewport)/2);
  return {x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
}
