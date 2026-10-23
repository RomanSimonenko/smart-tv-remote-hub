// @vitest-environment jsdom
import {test,expect} from 'vitest';
import {readCameraPreferences,saveCameraPreferences} from './camera-preferences.js';
test('camera preferences validate saved data and preserve no-upscale Full HD default',()=>{
 localStorage.clear();expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
 saveCameraPreferences({deviceId:'synthetic-camera',height:720});expect(readCameraPreferences()).toEqual({deviceId:'synthetic-camera',height:720});
 localStorage.setItem('camera-preferences',JSON.stringify({deviceId:42,height:9999}));expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
 localStorage.setItem('camera-preferences','broken');expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
});
test('TV cameras stay isolated and do not inherit the old shared camera',()=>{
 localStorage.clear();
 saveCameraPreferences({deviceId:'legacy',height:720});
 expect(readCameraPreferences('tv-one').deviceId).toBe('');
 saveCameraPreferences({deviceId:'camera-one',height:720},'tv-one');
 saveCameraPreferences({deviceId:'camera-two',height:1080},'tv-two');
 expect(readCameraPreferences('tv-one')).toEqual({deviceId:'camera-one',height:720});
 expect(readCameraPreferences('tv-two')).toEqual({deviceId:'camera-two',height:1080});
 expect(readCameraPreferences().deviceId).toBe('legacy');
});
