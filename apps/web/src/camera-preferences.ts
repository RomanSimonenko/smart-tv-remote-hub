export interface CameraPreferences{deviceId:string;height:720|1080}
const key='camera-preferences';
function preferenceKey(tvId?:string){return tvId?`${key}:${tvId}`:key;}
export function readCameraPreferences(tvId?:string):CameraPreferences{
 try{const value=JSON.parse(localStorage.getItem(preferenceKey(tvId))??'null');if(value&&typeof value.deviceId==='string'&&value.deviceId.length<=1000&&(value.height===720||value.height===1080))return{deviceId:value.deviceId,height:value.height};}catch{/* Invalid browser data leaves the camera unassigned. */}
 return{deviceId:'',height:1080};
}
export function saveCameraPreferences(value:CameraPreferences,tvId?:string){localStorage.setItem(preferenceKey(tvId),JSON.stringify(value));}
