// @vitest-environment jsdom
import {test,expect} from 'vitest';
import {readCameraPreferences,saveCameraPreferences} from './camera-preferences.js';
test('camera preferences validate saved data and preserve no-upscale Full HD default',()=>{
 localStorage.clear();expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
 saveCameraPreferences({deviceId:'synthetic-camera',height:720});expect(readCameraPreferences()).toEqual({deviceId:'synthetic-camera',height:720});
 localStorage.setItem('camera-preferences',JSON.stringify({deviceId:42,height:9999}));expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
 localStorage.setItem('camera-preferences','broken');expect(readCameraPreferences()).toEqual({deviceId:'',height:1080});
});
