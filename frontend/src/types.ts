export type User = { id:number; email:string; nickname:string; avatarUrl:string; schoolId:string; wechatId:string; verified:boolean; campusVerified:boolean; adminVerified:boolean; emailMessageNotifications:boolean; role:'user'|'admin' };
export type Seller = { id:number; nickname:string; avatarUrl:string; verified:boolean };
export type PublicProfile = { id:number; nickname:string; avatarUrl:string; campusVerified:boolean };
export type Item = { id:number; userId:number; title:string; price:number; images:string[]; category:string; condition:string; description:string; schoolId:string; status:string; createdAt:string; updatedAt:string; seller?:Seller; recommendationReasons?:string[] };
export type Comment = { id:number; content:string; createdAt:string; author:Seller & { isSeller:boolean } };
export type Conversation = { id:number; itemId:number; itemTitle:string; partner:{nickname:string;avatarUrl:string}; lastMessage:string; unreadCount:number; updatedAt:string };
export type ItemCardSnapshot = { id:number; title:string; price:number; image:string; condition:string; status:string };
export type ChatMessage = { id:number; content:string; type:'text'|'item_card'; item:ItemCardSnapshot|null; createdAt:string; mine:boolean; sender:{nickname:string;avatarUrl:string} };

export type AdminStats = { users:number; items:number; reports:number; reportsPending:number };
export type AdminUser = { id:number; email:string; nickname:string; avatarUrl:string; role:'user'|'admin'; verified:boolean; emailVerified:boolean; adminVerified:boolean; campusVerified:boolean; emailMessageNotifications:boolean; createdAt:string; lastSeenAt:string|null; itemCount:number };
export type Report = { id:number; reason:string; detail:string; status:'待处理'|'已处理'|'已驳回'; createdAt:string; handledAt:string|null; handlerNickname:string|null; item:{id:number;title:string;price:number;image:string;status:string}; reporter:{id:number;nickname:string;email:string} };
