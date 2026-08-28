export type MarketScope={schoolId:string;campusId:string};
export function canViewItemInScope(viewer:MarketScope&{userId?:number},item:{userId:number;schoolId:string;campusId:string}){return viewer.userId===item.userId||(viewer.schoolId===item.schoolId&&viewer.campusId===item.campusId)}

/**
 * 商品管理（编辑 / 删除 / 状态变更）只允许资源所有者本人，与校区可见性是分离的：
 * 无论当前浏览校区如何，发布者始终能管理自己的商品，他人一律无权。
 */
export function canManageItem(viewerUserId:number|undefined,ownerUserId:number){return viewerUserId!=null&&Number(viewerUserId)===Number(ownerUserId)}
