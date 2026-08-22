import {createHmac,timingSafeEqual} from 'node:crypto';

export interface RecommendationCandidate {
  id:number; userId:number; schoolId:string; status:string; category:string; price:number; createdAt:string|Date;
  impressions:number; clicks:number; favorites:number; conversations:number; recentlyExposed:boolean;
}
export interface RecommendationSignals {categoryAffinity:Readonly<Record<string,number>>;preferredPrice:number|null}
export interface RecommendationConfig {
  interestWeight:number;freshnessWeight:number;popularityWeight:number;priceWeight:number;explorationWeight:number;repeatPenalty:number;
  maxSellerConsecutive:number;maxCategoryPerWindow:number;diversityWindow:number;algorithmVersion:string;
}
export interface RecommendationScore {interest:number;freshness:number;popularity:number;price:number;exploration:number;repeatPenalty:number;total:number}
export interface RankedRecommendation<T extends RecommendationCandidate>{candidate:T;score:RecommendationScore;reasons:string[]}

export const DEFAULT_RECOMMENDATION_CONFIG:RecommendationConfig={interestWeight:0.30,freshnessWeight:0.25,popularityWeight:0.20,priceWeight:0.10,explorationWeight:0.15,repeatPenalty:0.35,maxSellerConsecutive:2,maxCategoryPerWindow:3,diversityWindow:6,algorithmVersion:'home-rules-v1'};
function bounded(raw:string|undefined,fallback:number,min:number,max:number){const value=Number(raw);return Number.isFinite(value)&&value>=min&&value<=max?value:fallback}
export function recommendationConfig(env:Record<string,string|undefined>):RecommendationConfig{return{
  interestWeight:bounded(env.RECOMMENDATION_WEIGHT_INTEREST,DEFAULT_RECOMMENDATION_CONFIG.interestWeight,0,2),freshnessWeight:bounded(env.RECOMMENDATION_WEIGHT_FRESHNESS,DEFAULT_RECOMMENDATION_CONFIG.freshnessWeight,0,2),popularityWeight:bounded(env.RECOMMENDATION_WEIGHT_POPULARITY,DEFAULT_RECOMMENDATION_CONFIG.popularityWeight,0,2),priceWeight:bounded(env.RECOMMENDATION_WEIGHT_PRICE,DEFAULT_RECOMMENDATION_CONFIG.priceWeight,0,2),explorationWeight:bounded(env.RECOMMENDATION_WEIGHT_EXPLORATION,DEFAULT_RECOMMENDATION_CONFIG.explorationWeight,0,2),repeatPenalty:bounded(env.RECOMMENDATION_REPEAT_PENALTY,DEFAULT_RECOMMENDATION_CONFIG.repeatPenalty,0,2),maxSellerConsecutive:Math.round(bounded(env.RECOMMENDATION_MAX_SELLER_CONSECUTIVE,2,1,5)),maxCategoryPerWindow:Math.round(bounded(env.RECOMMENDATION_MAX_CATEGORY_WINDOW,3,1,6)),diversityWindow:6,algorithmVersion:String(env.RECOMMENDATION_ALGORITHM_VERSION||DEFAULT_RECOMMENDATION_CONFIG.algorithmVersion).slice(0,64)||DEFAULT_RECOMMENDATION_CONFIG.algorithmVersion};}
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:0));
function deterministicUnit(seed:string,id:number){let hash=2166136261;for(const char of `${seed}:${id}`){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0)/4294967295}

export function scoreCandidate<T extends RecommendationCandidate>(candidate:T,signals:RecommendationSignals,config:RecommendationConfig,seed:string,now=new Date()):RankedRecommendation<T>{
  const affinity=clamp(signals.categoryAffinity[candidate.category]||0),ageHours=Math.max(0,(now.getTime()-new Date(candidate.createdAt).getTime())/3_600_000),freshness=Math.exp(-ageHours/(24*7));
  const ctr=(Math.max(0,candidate.clicks)+2)/(Math.max(0,candidate.impressions)+20),conversion=(Math.log1p(Math.max(0,candidate.favorites)+2*Math.max(0,candidate.conversations)))/Math.log(11),popularity=clamp(ctr*0.6+conversion*0.4);
  const preferred=signals.preferredPrice,price=preferred&&preferred>0&&candidate.price>0?Math.exp(-Math.abs(Math.log(candidate.price/preferred))):0.5;
  const cold=candidate.impressions+candidate.clicks+candidate.favorites+candidate.conversations===0,exploration=clamp((cold?0.7:0.1)+deterministicUnit(seed,candidate.id)*(cold?0.3:0.15));
  const repeatPenalty=candidate.recentlyExposed?config.repeatPenalty:0,total=affinity*config.interestWeight+freshness*config.freshnessWeight+popularity*config.popularityWeight+price*config.priceWeight+exploration*config.explorationWeight-repeatPenalty;
  const reasons:string[]=[];if(affinity>=0.5)reasons.push('符合近期兴趣');if(freshness>=0.6)reasons.push('近期发布');if(popularity>=0.35)reasons.push('同校热门');if(cold)reasons.push('探索新商品');if(!reasons.length)reasons.push('同校在售');
  return{candidate,score:{interest:affinity,freshness,popularity,price,exploration,repeatPenalty,total},reasons};
}

function allowedByDiversity<T extends RecommendationCandidate>(picked:RankedRecommendation<T>[],next:RankedRecommendation<T>,config:RecommendationConfig){
  const sellers=picked.slice(-config.maxSellerConsecutive);if(sellers.length===config.maxSellerConsecutive&&sellers.every(row=>row.candidate.userId===next.candidate.userId))return false;
  const window=picked.slice(-(config.diversityWindow-1)),same=window.filter(row=>row.candidate.category===next.candidate.category).length;return same<config.maxCategoryPerWindow;
}
export function rankCandidates<T extends RecommendationCandidate>(candidates:readonly T[],signals:RecommendationSignals,config:RecommendationConfig,options:{schoolId:string;userId?:number;seed:string;now?:Date}){
  const eligible=candidates.filter(row=>row.schoolId===options.schoolId&&row.status==='在售'&&row.userId!==options.userId);
  const remaining=eligible.map(row=>scoreCandidate(row,signals,config,options.seed,options.now)).sort((a,b)=>b.score.total-a.score.total||b.candidate.id-a.candidate.id),picked:RankedRecommendation<T>[]=[];
  while(remaining.length){let index=remaining.findIndex(row=>allowedByDiversity(picked,row,config));if(index<0)index=0;picked.push(remaining.splice(index,1)[0]);}
  return picked;
}

interface CursorPayload{v:1;offset:number;seed:string;issuedAt:number;context:string}
const b64=(value:string|Buffer)=>Buffer.from(value).toString('base64url');
export function encodeRecommendationCursor(payload:Omit<CursorPayload,'v'>,secret:string){if(secret.length<16)throw new Error('cursor secret must contain at least 16 characters');if(!Number.isSafeInteger(payload.offset)||payload.offset<0||payload.offset>10_000)throw new Error('invalid cursor offset');const body=b64(JSON.stringify({v:1,...payload}));return`${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;}
export function decodeRecommendationCursor(token:string,secret:string,expectedContext:string,now=Date.now(),ttlMs=30*60_000):CursorPayload|null{
  if(!token||token.length>1000||secret.length<16)return null;const [body,signature,...extra]=token.split('.');if(!body||!signature||extra.length)return null;
  const actual=Buffer.from(signature,'base64url'),expected=createHmac('sha256',secret).update(body).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{const value=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as CursorPayload;if(value.v!==1||!Number.isSafeInteger(value.offset)||value.offset<0||value.offset>10_000||typeof value.seed!=='string'||value.seed.length<1||value.seed.length>64||value.context!==expectedContext||!Number.isFinite(value.issuedAt)||value.issuedAt>now+60_000||now-value.issuedAt>ttlMs)return null;return value}catch{return null}
}
