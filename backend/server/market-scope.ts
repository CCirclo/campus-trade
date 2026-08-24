export type MarketScope={schoolId:string;campusId:string};
export function canViewItemInScope(viewer:MarketScope&{userId?:number},item:{userId:number;schoolId:string;campusId:string}){return viewer.userId===item.userId||(viewer.schoolId===item.schoolId&&viewer.campusId===item.campusId)}
