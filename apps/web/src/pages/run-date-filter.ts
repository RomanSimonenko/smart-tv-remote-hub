/** Local calendar boundaries preserve the existing history filter contract. */
export function parseRunDateFilter(value:string,endOfDay=false):number|null|undefined {
 if(!value)return undefined;
 const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
 if(!match)return null;
 const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
 const date=new Date(0);
 date.setFullYear(year,month-1,day);
 date.setHours(0,0,0,0);
 if(year<1||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
 if(endOfDay)date.setHours(23,59,59,999);
 return date.getTime();
}
