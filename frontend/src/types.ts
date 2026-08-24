export type Campus = { id:string; name:string };
export type School = { id:string; name:string; emailDomains:string[]; campuses:Campus[] };
export type User = { id:number; email:string; nickname:string; avatarUrl:string; schoolId:string; campusId:string; schoolName:string; campusName:string; wechatId:string; verified:boolean; campusVerified:boolean; adminVerified:boolean; selfOperated:boolean; isSuperAdmin:boolean; emailMessageNotifications:boolean; role:'user'|'admin' };
export type Seller = { id:number; nickname:string; avatarUrl:string; verified:boolean };
export type PublicProfile = { id:number; nickname:string; avatarUrl:string; campusVerified:boolean; schoolId:string; campusId:string; schoolName:string; campusName:string };
export type Item = { id:number; userId:number; title:string; price:number; currency:string; rmbPrice:number|null; images:string[]; category:string; condition:string; kind:string; regions:string[]; easterEgg:string|null; description:string; schoolId:string; campusId:string; schoolName:string; campusName:string; status:string; createdAt:string; updatedAt:string; seller?:Seller; recommendationReasons?:string[] };
export type Comment = { id:number; content:string; createdAt:string; author:Seller & { isSeller:boolean } };
export type Conversation = { id:number; itemId:number; itemTitle:string; partner:{nickname:string;avatarUrl:string}; lastMessage:string; unreadCount:number; updatedAt:string };
export type ItemCardSnapshot = { id:number; title:string; price:number; currency?:string; rmbPrice?:number|null; image:string; condition:string; status:string };
export type ChatMessage = { id:number; content:string; type:'text'|'item_card'; item:ItemCardSnapshot|null; createdAt:string; mine:boolean; sender:{nickname:string;avatarUrl:string} };

export type AdminStats = { users:number; items:number; reports:number; reportsPending:number; schools:number };
export type AdminUser = { id:number; email:string; nickname:string; avatarUrl:string; role:'user'|'admin'; verified:boolean; emailVerified:boolean; adminVerified:boolean; selfOperated:boolean; campusVerified:boolean; isSchoolManager:boolean; isSuperAdmin:boolean; schoolId:string; campusId:string; schoolName:string; campusName:string; emailMessageNotifications:boolean; createdAt:string; lastSeenAt:string|null; itemCount:number };
export type AdminManager={id:number;email:string;nickname:string};
export type AdminSchool = { id:string; name:string; active:boolean; emailDomains:string[]; campuses:Array<Campus & {active:boolean;manager?:AdminManager|null}>; manager:AdminManager|null };
export type AdminContext = { isSuperAdmin:boolean; superAdminEmail:string; managedSchoolIds:string[]; managedCampuses:Array<{schoolId:string;campusId:string}>; schools:AdminSchool[] };
export type ScopeApplication={id:number;userId:number;nickname:string;email:string;requestedSchoolId:string;requestedCampusId:string;schoolName:string;campusName:string;evidenceName:string;note:string;status:'待审核'|'已通过'|'已驳回';reviewNote:string;reviewerNickname:string|null;createdAt:string;reviewedAt:string|null};
export type Report = { id:number; reason:string; detail:string; status:'待处理'|'已处理'|'已驳回'; createdAt:string; handledAt:string|null; handlerNickname:string|null; schoolId:string; campusId:string; schoolName:string; campusName:string; item:{id:number;title:string;price:number;image:string;status:string}; reporter:{id:number;nickname:string;email:string} };

export type WalletBalance = { code:string; name:string; description:string; balance:number };
export type WalletEntry = { id:number; currency:string; amount:number; balanceAfter:number; reason:string; operator:string; createdAt:string };
export type Wallet = { wallet:Record<string,WalletBalance>; entries:WalletEntry[] };
export type RewardSettings = { signupEnabled:boolean; signupCampusOnly:boolean; signupBonus:{originium:number;lungmen:number}; publishReward:number; purchaseReward:number };
export type Order = { id:number; itemId:number|null; itemTitle:string; itemImage:string; buyerId:number; sellerId:number; currency:string; amount:number; status:string; createdAt:string; paidAt:string|null; completedAt:string|null; role:'buyer'|'seller'; counterpart:{nickname:string;avatarUrl:string} };
export type Achievement = { code:string; name:string; description:string; symbol:string; color:string; value?:number };
