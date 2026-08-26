export function canonicalPair(firstUserId:number,secondUserId:number):[number,number]{
  return firstUserId<secondUserId?[firstUserId,secondUserId]:[secondUserId,firstUserId];
}

export function shouldSendItemCard(latestItemId:unknown,currentItemId:number,sentSameItemWithinHour=false){
  return Number(latestItemId)!==currentItemId&&!sentSameItemWithinHour;
}

export function itemCardSnapshot(item:Record<string,unknown>){
  const rawImages=item.images;
  const images=Array.isArray(rawImages)?rawImages:JSON.parse(String(rawImages||'[]'));
  return {id:Number(item.id),title:String(item.title),price:Number(item.price),currency:String(item.currency||'cny'),rmbPrice:item.rmb_price?Number(item.rmb_price):null,image:String(images[0]||''),condition:String(item.item_condition||''),status:String(item.status||'')};
}

export function errandCardSnapshot(errand:Record<string,unknown>){
  const parse=(raw:unknown)=>{if(Array.isArray(raw))return raw.map(String);try{const p=JSON.parse(String(raw||'[]'));return Array.isArray(p)?p.map(String):[]}catch{return[]}};
  return {id:Number(errand.id),title:String(errand.title||''),cargoType:String(errand.cargo_type||''),side:String(errand.side||''),priceMin:errand.price_min==null?null:Number(errand.price_min),priceMax:errand.price_max==null?null:Number(errand.price_max),pickupLocations:parse(errand.pickup_locations),deliveryLocations:parse(errand.delivery_locations)};
}
