export interface CameraPreferences{deviceId:string;height:720|1080}
const key='camera-preferences';
export function readCameraPreferences():CameraPreferences{
 try{const value=JSON.parse(localStorage.getItem(key)??'null');if(value&&typeof value.deviceId==='string'&&value.deviceId.length<=1000&&(value.height===720||value.height===1080))return{deviceId:value.deviceId,height:value.height};}catch{/* Untrusted browser data uses the default capture request. */}
 return{deviceId:'',height:1080};
}
export function saveCameraPreferences(value:CameraPreferences){localStorage.setItem(key,JSON.stringify(value));}
