function shanghaiParts(date:Date){
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
}

export function parseTimestamp(value:unknown){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
  if(typeof value!=='string'||!value.trim())return null;
  const direct=new Date(value);if(!Number.isNaN(direct.getTime()))return direct;
  const mysql=value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);if(!mysql)return null;
  const parsed=new Date(`${mysql[1]}-${mysql[2]}-${mysql[3]}T${mysql[4]}:${mysql[5]}:${mysql[6]}Z`);
  return Number.isNaN(parsed.getTime())?null:parsed;
}

export function formatTimestamp(value:unknown,now=Date.now()){
  const date=parseTimestamp(value);if(!date)return '时间未知';const diff=Math.max(0,now-date.getTime());
  if(diff<60_000)return '刚刚';if(diff<3_600_000)return `${Math.floor(diff/60_000)} 分钟前`;
  const current=shanghaiParts(new Date(now)),target=shanghaiParts(date),currentDay=Date.UTC(current.year,current.month-1,current.day)/86_400_000,targetDay=Date.UTC(target.year,target.month-1,target.day)/86_400_000,clock=`${String(target.hour).padStart(2,'0')}:${String(target.minute).padStart(2,'0')}`;
  if(currentDay===targetDay)return `今天 ${clock}`;if(currentDay-targetDay===1)return `昨天 ${clock}`;if(current.year===target.year)return `${target.month}月${target.day}日`;return `${target.year}年${target.month}月${target.day}日`;
}
