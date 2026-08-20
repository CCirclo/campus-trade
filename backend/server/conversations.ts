export function canonicalPair(firstUserId:number,secondUserId:number):[number,number]{
  return firstUserId<secondUserId?[firstUserId,secondUserId]:[secondUserId,firstUserId];
}

export function shouldSendItemCard(latestItemId:unknown,currentItemId:number,sentSameItemWithinHour=false){
  return Number(latestItemId)!==currentItemId&&!sentSameItemWithinHour;
}

export function itemCardSnapshot(item:Record<string,unknown>){
  const rawImages=item.images;
  const images=Array.isArray(rawImages)?rawImages:JSON.parse(String(rawImages||'[]'));
  return {id:Number(item.id),title:String(item.title),price:Number(item.price),image:String(images[0]||''),condition:String(item.item_condition||''),status:String(item.status||'')};
}
