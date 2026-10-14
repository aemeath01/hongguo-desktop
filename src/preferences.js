import { useRef, useState } from 'react';
import packageInfo from '../package.json';

export const APP_VERSION = packageInfo.version;
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const DEFAULT_PREFERENCES = Object.freeze({
  carousel: true, recommendations: true, recordHistory: true,
  autoNext: true, speed: 1, holdSpeed: 2, seekSeconds: 5, resume: true, preload: 'off',
  keepAwake: true, pauseOnMinimize: false, decoding: 'auto',
  enhancement: 'original', adaptiveQuality: true,
  superResolution: 'off', interpolation: 'off', inferenceBackend: 'auto',
  bossEnabled: true, bossShortcut: 'Ctrl+Shift+B', closeAction: 'quit',
  checkUpdates: true, downloadUpdates: false,
});
const CHOICES = {speed:SPEEDS,holdSpeed:[1.5,2,2.5,3,4],seekSeconds:[5,10,15,30],preload:['off','smart'],decoding:['auto','software'],enhancement:['original','balanced','anime'],superResolution:['off','auto','realesrgan'],interpolation:['off','rife2x','rife60'],inferenceBackend:['auto','vulkan','openvino','tensorrt'],closeAction:['quit','tray']};
export function validShortcut(value) {
  if(typeof value!=='string'||! /^(?:(?:Ctrl|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(value))return false;
  const parts=value.split('+');
  if(new Set(parts).size!==parts.length)return false;
  return !['Alt+F4','Ctrl+W','Ctrl+T','Ctrl+R','Ctrl+L','Ctrl+N','Ctrl+K','Ctrl+Shift+T','Ctrl+Shift+N'].includes(value);
}
export function sanitizePreferences(raw) {
  const result={...DEFAULT_PREFERENCES};
  if(!raw||typeof raw!=='object')return result;
  for(const key of Object.keys(result)) {
    if(typeof result[key]==='boolean'&&typeof raw[key]==='boolean')result[key]=raw[key];
    else if(CHOICES[key]?.includes(raw[key]))result[key]=raw[key];
    else if(key==='bossShortcut'&&validShortcut(raw[key]))result[key]=raw[key];
  }
  return result;
}
export function usePreferences() {
  const [preferences,setPreferences]=useState(()=>{try{return sanitizePreferences(JSON.parse(localStorage.getItem('hongguo.settings')));}catch{return {...DEFAULT_PREFERENCES};}});
  const [storageError,setStorageError]=useState(false);
  const current=useRef(preferences);
  function updatePreference(key,value) {
    const next=sanitizePreferences({...current.current,[key]:value});
    // Super-resolution and the separate picture profiles are alternative pipelines.
    if(key==='superResolution'&&next.superResolution!=='off')next.enhancement='original';
    if(key==='enhancement'&&next.enhancement!=='original')next.superResolution='off';
    current.current=next;
    try{localStorage.setItem('hongguo.settings',JSON.stringify(next));setStorageError(false);}catch{setStorageError(true);}
    setPreferences(next);
  }
  return [preferences,updatePreference,storageError];
}
