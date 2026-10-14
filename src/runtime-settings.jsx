import React from 'react';
import {useUpdateState,checkUpdate,downloadUpdate,installUpdate,openRelease} from './update-service.jsx';
import {RefreshCw,Download,ShieldCheck} from 'lucide-react';
import {desktop} from './desktop-api.js';
import {PressButton} from './motion-system.jsx';
import {APP_VERSION} from './preferences.js';

export {RuntimeSettings} from './runtime-manager.jsx';

export function UpdatePanel(){
 const {status,busy,update,downloaded,portable}=useUpdateState();
 return <section className="update-panel">
  <div className="update-intro"><div className="update-symbol"><Download size={23}/></div><div><h2>在线更新</h2><p>当前版本 {APP_VERSION}</p></div><span className="status-pill">签名校验</span></div>
  <div className="update-status"><div><strong>{update?`新版本 ${update.version}`:'应用更新'}</strong><p role="status">{status}</p></div><PressButton className="settings-button" disabled={!desktop||busy||downloaded} onClick={()=>checkUpdate(false)}><RefreshCw size={14}/>检查更新</PressButton></div>
  {update&&<div className="release-notes"><p>{update.body||'此版本未提供更新说明。'}</p><PressButton className="settings-button" disabled={busy} onClick={()=>portable?openRelease():downloaded?installUpdate():downloadUpdate()}>{portable?'前往下载便携版':downloaded?'安装并重启':'下载更新'}</PressButton></div>}
  <div className="update-trust"><ShieldCheck size={15}/><span>{portable?'便携版请下载 ZIP 后覆盖程序文件；保留 data 和 hongguo-storage.json。':'仅安装通过签名校验的更新；下载完成后由你决定何时安装。'}</span></div>
 </section>;
}
