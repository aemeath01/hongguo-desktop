//! Only directories owned by this app can be removed. External backend sources are read-only.
use std::{fs, path::{Component, Path, PathBuf}, process::Command, sync::atomic::Ordering};
use std::os::windows::fs::MetadataExt;
use serde_json::{json, Value};
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;
use crate::Shared;

const OWNER: &str = "app.hongguo.personal/v1";
const MARKER: &str = ".hongguo-data";
const MODULES: [(&str, &str); 4] = [("backend", "services/backend"), ("mpv", "services/mpv"), ("anime4k", "enhancements/anime4k"), ("ai", "enhancements/ai")];
const WEB_CACHES: [&str; 5] = ["EBWebView/Default/Cache", "EBWebView/Default/Code Cache", "EBWebView/Default/GPUCache", "EBWebView/ShaderCache", "EBWebView/GrShaderCache"];
const PLAYBACK_CACHES: [&str; 6] = ["stream-cache", "hls", "cache", "staging", "ipc", "java-tmp"];

fn playback_cache_bytes(root: &Path) -> u64 {
    PLAYBACK_CACHES.iter().map(|name| size(&root.join(name))).sum()
}
fn clear_playback_caches(root: &Path) -> Result<(), String> {
    // Validate every target before removing any of them, including old source files.
    for name in PLAYBACK_CACHES { validate_tree(&checked(root, name)?)?; }
    for name in PLAYBACK_CACHES { remove_owned(root, name)?; }
    Ok(())
}

pub fn read_json(path: &Path) -> Value {
    fs::read(path).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).filter(Value::is_object).unwrap_or(json!({}))
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
    plain(path)?;
    let temp = path.with_extension("json.new"); plain(&temp)?;
    fs::write(&temp, serde_json::to_vec_pretty(value).unwrap()).map_err(|_| "配置保存失败，请检查目录写入权限")?;
    let from:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}==0 {let _=fs::remove_file(temp);return Err("配置保存失败，原配置保留".into());}
    Ok(())
}
fn plain(path: &Path) -> Result<(), String> {
    if let Ok(m) = fs::symlink_metadata(path) {
        if m.file_attributes() & 0x400 != 0 { return Err("目录包含链接或联接点，已停止操作".into()); }
    }
    Ok(())
}
fn validate_chain(path: &Path) -> Result<(), String> {
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) { return Err("请选择有效的绝对目录".into()); }
    for p in path.ancestors() { plain(p)?; }
    Ok(())
}
pub fn owned(root: &Path) -> Result<(), String> {
    validate_chain(root)?;
    if fs::read_to_string(root.join(MARKER)).ok().as_deref() != Some(OWNER) { return Err("该目录不是本软件管理的目录".into()); }
    Ok(())
}
pub fn init_root(root: &Path) -> Result<(), String> {
    validate_chain(root)?;
    if root.exists() && !root.join(MARKER).exists() && fs::read_dir(root).map_err(|_| "无法读取数据目录")?.next().is_some() {
        return Err("目标目录非空，请选择空目录，避免覆盖其他文件".into());
    }
    fs::create_dir_all(root).map_err(|_| "安装目录不可写，请将软件放在可写目录或选择自定义数据目录")?;
    if !root.join(MARKER).exists() { fs::write(root.join(MARKER), OWNER).map_err(|_| "数据目录不可写")?; }
    owned(root)
}
fn checked(root: &Path, relative: &str) -> Result<PathBuf, String> {
    owned(root)?;
    let rel = Path::new(relative);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) || relative.is_empty() { return Err("无效的管理路径".into()); }
    let path = root.join(rel);
    validate_chain(&path)?;
    Ok(path)
}
fn validate_tree(path: &Path) -> Result<(), String> {
    plain(path)?;
    if path.is_dir() { for entry in fs::read_dir(path).map_err(|_| "无法读取目录")? { validate_tree(&entry.map_err(|_| "无法读取文件")?.path())?; } }
    Ok(())
}
pub fn remove_owned(root: &Path, relative: &str) -> Result<(), String> {
    let path = checked(root, relative)?;
    if !path.exists() { return Ok(()); }
    validate_tree(&path)?;
    if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) }.map_err(|_| "文件正在使用或不可写，请关闭播放器后重试".into())
}
pub fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    plain(source)?; plain(target)?;
    if source.is_dir() {
        fs::create_dir_all(target).map_err(|_| "无法创建目标目录，请检查可用空间和权限")?;
        for entry in fs::read_dir(source).map_err(|_| "无法读取来源目录")? {
            let entry = entry.map_err(|_| "无法读取来源文件")?;
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else {
        let start=std::time::Instant::now();
        loop{match fs::copy(source,target){
            Ok(_)=>break,
            Err(e) if matches!(e.raw_os_error(),Some(5|32|33)) && start.elapsed()<std::time::Duration::from_secs(15)=>std::thread::sleep(std::time::Duration::from_millis(250)),
            Err(_)=>return Err("文件复制失败，请退出旧版软件并检查磁盘空间后重试".into()),
        }}
    }
    Ok(())
}
fn size(path: &Path) -> u64 {
    let Ok(m) = fs::symlink_metadata(path) else { return 0; };
    if m.file_attributes() & 0x400 != 0 { return 0; }
    if m.is_file() { return m.len(); }
    fs::read_dir(path).into_iter().flatten().filter_map(Result::ok).map(|e| size(&e.path())).sum()
}
pub fn module_relative(module: &str) -> Result<&'static str, String> {
    MODULES.iter().find(|(id, _)| *id == module).map(|(_, rel)| *rel).ok_or("未知模块".into())
}
fn rename_when_released(from:&Path,to:&Path)->Result<(),String>{
    let start=std::time::Instant::now();
    loop{match fs::rename(from,to){
        Ok(())=>return Ok(()),
        Err(e) if matches!(e.raw_os_error(),Some(5|32|33)) && start.elapsed()<std::time::Duration::from_secs(90)=>std::thread::sleep(std::time::Duration::from_millis(400)),
        Err(e)=>return Err(format!("Windows 暂未释放文件（错误 {}），请稍后重试",e.raw_os_error().unwrap_or(0))),
    }}
}
pub fn installed(root: &Path, module: &str) -> bool {
    let path=module_path(root,module);
    match module {
        "mpv" => path.join("mpv.exe").is_file(),
        "backend" => path.join("desktop_bootstrap.py").is_file() && path.join("python/python.exe").is_file(),
        "anime4k" => ["Anime4K_Restore_CNN_S.glsl", "Anime4K_Upscale_CNN_x2_S.glsl"].iter().all(|n| path.join(n).is_file()),
        "ai" => path.join("ready.json").is_file(), _ => false,
    }
}
pub fn module_path(root:&Path,module:&str)->PathBuf{
    let Ok(base)=module_relative(module) else{return root.join("missing-module")};
    let registry=read_json(&root.join("modules.json"));
    if registry["disabled"][module]==true{return root.join(base).join(".uninstalled")}
    if let Some(active)=registry["active"][module].as_str(){
        if active.starts_with(&format!("{base}/versions/")) {if let Ok(path)=checked(root,active){return path}}
        return root.join(base).join(".invalid-installation");
    }
    root.join(base) // v0.1.0 flat installations remain readable after migration.
}

// Each verified installation has its own directory. Only a small registry file is
// atomically switched: Windows file indexing must not block activation of a large runtime.
pub fn replace_module(root: &Path, module: &str, populate: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    let relative = module_relative(module)?;
    let mut random=[0u8;8];getrandom::fill(&mut random).map_err(|_|"无法分配安装目录")?;
    let id=random.iter().map(|b|format!("{b:02x}")).collect::<String>();
    let stage_rel = format!("{relative}/versions/{id}");
    let stage = checked(root, &stage_rel)?;
    let mut registry=read_json(&root.join("modules.json"));
    let previous=registry["active"][module].as_str().map(str::to_owned);
    fs::create_dir_all(&stage).map_err(|_| "无法创建安装目录")?;
    if let Err(error) = populate(&stage) { let _ = remove_owned(root, &stage_rel); return Err(error); }
    validate_tree(&stage)?;
    registry["active"][module]=json!(stage_rel);registry["disabled"][module]=json!(false);
    write_json(&root.join("modules.json"),&registry)?;
    if let Some(previous)=previous{if previous.starts_with(&format!("{relative}/versions/")){let _=remove_owned(root,&previous);}}
    let _=remove_owned(root,&format!("staging/{module}"));
    Ok(())
}

fn clear_unused_versions(root:&Path)->Result<(),String>{
    for (module,base) in MODULES {
        let active=module_path(root,module);
        let versions=checked(root,&format!("{base}/versions"))?;
        if versions.exists(){for entry in fs::read_dir(versions).map_err(|_|"无法读取旧版本目录")?{
            let entry=entry.map_err(|_|"无法读取旧版本")?;
            if entry.path()!=active {let rel=format!("{base}/versions/{}",entry.file_name().to_string_lossy());remove_owned(root,&rel)?;}
        }}
    }
    Ok(())
}
fn backend_source(root: &Path) -> PathBuf {
    let config = read_json(&root.join("desktop-config.json"));
    PathBuf::from(config["backendSource"].as_str().or(config["backendPath"].as_str()).unwrap_or(r"D:\Software\红果免费短剧\backend"))
}
pub fn import_backend(root: &Path, source: &Path) -> Result<(), String> {
    validate_chain(source)?;
    let source = fs::canonicalize(source).map_err(|_| "找不到播放服务来源，请重新选择 backend 文件夹")?;
    let base = fs::canonicalize(root).map_err(|_| "数据目录不可用")?;
    if source.starts_with(&base) || base.starts_with(&source) { return Err("请选择本软件数据目录以外的原始 backend 文件夹".into()); }
    if !source.join("desktop_bootstrap.py").is_file() || !source.join("python/python.exe").is_file() || !source.join("guest-config.json").is_file() { return Err("请选择包含 desktop_bootstrap.py、python 和 guest-config.json 的 backend 文件夹".into()); }
    replace_module(root, "backend", |target| copy_tree(&source, target))?;
    let mut config = read_json(&root.join("desktop-config.json"));
    config["backendSource"] = json!(source); config["backendDisabled"] = json!(false);
    config.as_object_mut().unwrap().remove("backendPath");
    write_json(&root.join("desktop-config.json"), &config)
}
pub fn ensure_backend(root: &Path) -> Result<(), String> {
    if installed(root, "backend") { return Ok(()); }
    if read_json(&root.join("desktop-config.json"))["backendDisabled"] == true { return Err("播放服务已卸载，请到「设置 → 模块与存储」重新安装".into()); }
    import_backend(root, &backend_source(root))
}

pub struct Storage { pub install: PathBuf, pub data: PathBuf, pub notice: String }
impl Storage {
    pub fn initialize(install: PathBuf, legacy: PathBuf) -> Result<Self, String> {
        let config_path = install.join("hongguo-storage.json");
        let mut config = read_json(&config_path);
        let data = config["directory"].as_str().map(PathBuf::from).unwrap_or_else(|| install.join("data"));
        init_root(&data)?;
        let mut notice = String::new();
        // Migration runs before WebView or playback processes open any files.
        let source = config["migrateFrom"].as_str().map(PathBuf::from).or_else(|| (!data.join("initialized.json").exists() && legacy.exists()).then_some(legacy));
        if let Some(source) = source {
            if source != data {
                validate_chain(&source)?;
                let id = config["migrationId"].as_str().map(str::to_owned).unwrap_or_else(||format!("{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
                config["directory"]=json!(data);config["migrateFrom"]=json!(source);config["migrationId"]=json!(id);
                write_json(&config_path,&config)?;
                let finished=read_json(&data.join("initialized.json"))["migrationId"]==id;
                if !finished {
                // Returning to a previous managed location preserves that location as a sibling backup.
                if data.join("initialized.json").exists() && config["replaceOwnedDirectory"]==true {
                    owned(&data)?;validate_tree(&data)?;
                    let backup=data.with_file_name(format!("{}-backup-{id}",data.file_name().unwrap().to_string_lossy()));
                    validate_chain(&backup)?;
                    if backup.exists(){return Err("备份目录已存在，迁移未开始".into());}
                    rename_when_released(&data,&backup)?;
                    init_root(&data)?;
                }
                let staged = checked(&data, "staging/migration")?;
                let journal=data.join("migration-ready.json");
                if read_json(&journal)["migrationId"]!=id {
                remove_owned(&data, "staging/migration")?;
                fs::create_dir_all(&staged).map_err(|_| "无法创建迁移目录")?;
                for name in ["EBWebView", "enhancements", "services", "modules.json", "content-config.json", "desktop-config.json", "clear-web-cache.json"] {
                    if source.join(name).exists() { copy_tree(&source.join(name), &staged.join(name))?; }
                }
                write_json(&journal,&json!({"migrationId":id}))?;
                }
                for entry in fs::read_dir(&staged).map_err(|_| "迁移目录不可读")? {
                    let entry = entry.map_err(|_| "迁移文件不可读")?;
                    // Windows can hold new directory handles while indexing. Copy the verified
                    // staging tree into this new, journal-owned destination instead of renaming it.
                    // The journal makes a partial copy retryable before any WebView opens the files.
                    copy_tree(&entry.path(), &data.join(entry.file_name()))?;
                }
                write_json(&data.join("initialized.json"),&json!({"schema":1,"migrationId":id}))?;
                }
                let _=remove_owned(&data, "staging/migration");
                remove_owned(&data, "migration-ready.json")?;
                notice = "已迁移收藏、历史、设置和已安装模块；旧数据保留为备份。".into();
                config.as_object_mut().unwrap().remove("migrateFrom");
                config.as_object_mut().unwrap().remove("migrationId");
                config.as_object_mut().unwrap().remove("replaceOwnedDirectory");
                config["previousDirectory"] = json!(source);
                write_json(&config_path, &config)?;
            }
        }
        write_json(&data.join("initialized.json"), &json!({"schema":1}))?;
        // Browser caches are deleted while WebView is closed, never its Local Storage/IndexedDB.
        if data.join("clear-web-cache.json").exists() {
            for name in WEB_CACHES { remove_owned(&data, name)?; }
            remove_owned(&data, "clear-web-cache.json")?;
            notice = "缓存已清理，收藏、历史和偏好均已保留。".into();
        }
        for (module, relative) in MODULES {
            let backup = data.join("rollback").join(module);
            if backup.exists() && !data.join(relative).exists() { fs::create_dir_all(data.join(relative).parent().unwrap()).map_err(|_| "恢复目录不可写")?; rename_when_released(&backup, &data.join(relative))?; }
        }
        Ok(Self { install, data, notice })
    }
}

#[tauri::command]
pub async fn storage_status(state: State<'_, Shared>) -> Result<Value, String> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let modules: Vec<Value> = MODULES.iter().map(|(id, rel)| json!({"id":id,"path":s.data.join(rel),"installed":installed(&s.data,id),"bytes":size(&s.data.join(rel))})).collect();
        let web_bytes: u64 = WEB_CACHES.iter().map(|p| size(&s.data.join(p))).sum();
        let config = read_json(&s.install.join("hongguo-storage.json"));
        let pending = config["directory"].as_str().filter(|p| Path::new(p) != s.data).map(str::to_owned);
        Ok(json!({"directory":s.data,"defaultDirectory":s.install.join("data"),"pendingDirectory":pending,"notice":s.storage_notice,"busy":s.maintenance.try_write().is_err(),"modules":modules,"backendSource":backend_source(&s.data),"cacheBytes":playback_cache_bytes(&s.data)+web_bytes,"videoCacheBytes":size(&s.data.join("stream-cache")),"webCachePending":s.data.join("clear-web-cache.json").exists()}))
    }).await.map_err(|_| "目录读取中断")?
}

#[tauri::command]
pub async fn choose_directory(app: tauri::AppHandle, purpose: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let title = if purpose == "backend" { "选择原客户端的 backend 文件夹" } else { "选择存储位置（将在其中创建 HongguoData）" };
        app.dialog().file().set_title(title).blocking_pick_folder().map(|f| f.into_path().map(|p| p.to_string_lossy().into_owned()).map_err(|_| "目录不可用".into())).transpose()
    }).await.map_err(|_| "目录选择中断")?
}

#[tauri::command]
pub async fn set_storage_directory(state: State<'_, Shared>, directory: Option<String>) -> Result<Value, String> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s.maintenance.try_write().map_err(|_| "有其他任务正在进行，请稍后重试")?;
        let target = directory.map(|p| PathBuf::from(p).join("HongguoData")).unwrap_or_else(|| s.install.join("data"));
        validate_chain(&target)?;
        if target == s.data { write_json(&s.install.join("hongguo-storage.json"), &json!({"directory":s.data}))?; return Ok(json!({"message":"已使用此目录"})); }
        if target.starts_with(&s.data) || s.data.starts_with(&target) { return Err("新旧数据目录不能互相包含".into()); }
        init_root(&target)?;
        let occupied=fs::read_dir(&target).map_err(|_| "无法读取目标目录")?.filter_map(Result::ok).any(|e| e.file_name() != MARKER);
        if occupied && !target.join("initialized.json").is_file(){return Err("目标目录已有数据，请选择新的空目录".into());}
        // Probe write permission before changing the pointer. Current session keeps its current root.
        fs::write(target.join("write-check"), b"ok").map_err(|_| "所选目录不可写")?;
        remove_owned(&target, "write-check")?;
        write_json(&s.install.join("hongguo-storage.json"), &json!({"directory":target,"migrateFrom":s.data,"replaceOwnedDirectory":occupied}))?;
        Ok(json!({"message":"目录已保存，重启时迁移收藏、历史与模块。旧目录保留为备份。"}))
    }).await.map_err(|_| "目录保存中断")?
}

#[tauri::command]
pub async fn open_managed_folder(state: State<'_, Shared>, target: String) -> Result<(), String> {
    let path = match target.as_str() {
        "data" => { owned(&state.data)?; state.data.clone() },
        "cache" => checked(&state.data, "hls")?,
        "videocache" => checked(&state.data, "stream-cache")?,
        "webcache" => checked(&state.data, "EBWebView/Default/Cache")?,
        _ => checked(&state.data, module_relative(&target)?)?,
    };
    fs::create_dir_all(&path).map_err(|_| "目录不可用或不可写")?;
    Command::new("explorer.exe").arg(path).spawn().map_err(|_| "无法打开资源管理器")?;
    Ok(())
}

#[tauri::command]
pub async fn manage_runtime(app: tauri::AppHandle, state: State<'_, Shared>, module: String, action: String, source: Option<String>) -> Result<Value, String> {
    let s = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = s.maintenance.try_write().map_err(|_| "已有安装或清理任务正在进行")?;
        owned(&s.data)?;
        if s.player.lock().map_err(|_| "播放状态异常")?.is_some() { return Err("请先关闭播放器，再管理模块或清理缓存".into()); }
        if module == "cache" && action == "clear" {
            s.generation.fetch_add(1, Ordering::SeqCst);
            s.backend.lock().map_err(|_| "播放服务状态异常")?.take();
            clear_playback_caches(&s.data)?;
            clear_unused_versions(&s.data)?;
            write_json(&s.data.join("clear-web-cache.json"), &json!({"requested":true}))?;
            return Ok(json!({"message":"视频文件、播放片段、着色器缓存与安装临时文件已清理；封面缓存将在重启后清理。收藏、历史与模块保留。"}));
        }
        let relative = module_relative(&module)?;
        if !["install", "reinstall", "uninstall"].contains(&action.as_str()) { return Err("未知管理操作".into()); }
        if module == "backend" { s.generation.fetch_add(1, Ordering::SeqCst); s.backend.lock().map_err(|_| "播放服务状态异常")?.take(); }
        if action == "uninstall" {
            if module == "backend" {
                let mut config = read_json(&s.data.join("desktop-config.json")); config["backendDisabled"] = json!(true);
                write_json(&s.data.join("desktop-config.json"), &config)?;
            }
            let mut registry=read_json(&s.data.join("modules.json"));registry["disabled"][&module]=json!(true);
            if let Some(active)=registry["active"].as_object_mut(){active.remove(&module);}
            write_json(&s.data.join("modules.json"),&registry)?;
            remove_owned(&s.data, relative)?;
            remove_owned(&s.data, &format!("staging/{module}"))?;
            remove_owned(&s.data, &format!("rollback/{module}"))?;
            return Ok(json!({"message":"已卸载本软件管理的模块，观看记录与原始来源保留。"}));
        }
        let _ = app.emit("module-progress", json!({"stage":if module == "backend" {"正在复制并安装播放服务…"} else {"正在准备安装…"}}));
        if module == "backend" { import_backend(&s.data, &source.map(PathBuf::from).unwrap_or_else(|| backend_source(&s.data)))?; }
        else { replace_module(&s.data, &module, |dir| crate::enhancement::install_into(&app, &module, dir))?; }
        Ok(json!({"message":if action == "reinstall" {"重新安装完成。"} else {"安装完成。增强模块需手动开启。"}}))
    }).await.map_err(|_| "管理任务中断")?
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Temp(PathBuf);
    impl Temp { fn new() -> Self { static NEXT:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0); let p = std::env::temp_dir().join(format!("hongguo-storage-test-{}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),NEXT.fetch_add(1,Ordering::SeqCst))); init_root(&p).unwrap(); Self(p) } }
    impl Drop for Temp { fn drop(&mut self) { if owned(&self.0).is_ok() { let _ = fs::remove_dir_all(&self.0); } } }
    #[test] fn refuses_escape_and_unowned_directories() {
        let t = Temp::new();
        assert!(remove_owned(&t.0,"../other").is_err());
        assert!(remove_owned(&t.0,"").is_err());
        assert!(remove_owned(&t.0,"C:/Windows").is_err());
        fs::create_dir(t.0.join("unowned")).unwrap();
        assert!(remove_owned(&t.0.join("unowned"),"child").is_err());
    }
    #[test] fn failed_reinstall_keeps_working_module() {
        let t = Temp::new(); let p=t.0.join("enhancements/anime4k"); fs::create_dir_all(&p).unwrap(); fs::write(p.join("old"),b"valid").unwrap();
        assert!(replace_module(&t.0,"anime4k",|stage| {fs::write(stage.join("partial"), b"bad").unwrap();Err("hash mismatch".into())}).is_err());
        assert_eq!(fs::read(p.join("old")).unwrap(),b"valid");
        replace_module(&t.0,"anime4k",|stage|fs::write(stage.join("new"),b"verified").map_err(|e|e.to_string())).unwrap();
        assert!(module_path(&t.0,"anime4k").join("new").exists());assert!(!module_path(&t.0,"anime4k").join("old").exists());
    }
    #[test] fn cache_cleanup_keeps_history_and_modules() {
        let t=Temp::new();
        for name in ["stream-cache/episode.mp4","hls/video","EBWebView/Default/Cache/data","EBWebView/Default/Local Storage/record","enhancements/ai/model"] {let p=t.0.join(name);fs::create_dir_all(p.parent().unwrap()).unwrap();fs::write(p,b"keep").unwrap();}
        assert_eq!(playback_cache_bytes(&t.0),8);
        clear_playback_caches(&t.0).unwrap();for p in WEB_CACHES{remove_owned(&t.0,p).unwrap();}
        assert_eq!(playback_cache_bytes(&t.0),0);
        assert!(t.0.join("EBWebView/Default/Local Storage/record").exists());assert!(t.0.join("enhancements/ai/model").exists());assert!(!t.0.join("hls").exists());assert!(!t.0.join("stream-cache").exists());
    }
    #[test] fn nonempty_custom_directory_is_rejected() {let t=Temp::new();let p=t.0.join("foreign");fs::create_dir(&p).unwrap();fs::write(p.join("file"),b"mine").unwrap();assert!(init_root(&p).is_err());assert!(p.join("file").exists());}
    #[test] fn junction_cannot_redirect_cleanup() {
        use std::os::windows::process::CommandExt;
        let t=Temp::new();let external=Temp::new();fs::write(external.0.join("keep"),b"safe").unwrap();
        let junction=t.0.join("hls");
        fs::create_dir(t.0.join("stream-cache")).unwrap();fs::write(t.0.join("stream-cache/episode.mp4"),b"keep until all paths are checked").unwrap();
        let result=Command::new("cmd.exe").args(["/c","mklink","/J"]).arg(&junction).arg(&external.0).creation_flags(0x08000000).output().unwrap();assert!(result.status.success());
        let refused=clear_playback_caches(&t.0).is_err();fs::remove_dir(&junction).unwrap();
        assert!(refused);assert_eq!(fs::read(external.0.join("keep")).unwrap(),b"safe");assert!(t.0.join("stream-cache/episode.mp4").exists());
    }
    #[test] fn migration_preserves_records_and_old_directory() {
        let app=Temp::new();let legacy=Temp::new();
        let record=legacy.0.join("EBWebView/Default/Local Storage/record");fs::create_dir_all(record.parent().unwrap()).unwrap();fs::write(&record,b"history").unwrap();
        let first=Storage::initialize(app.0.clone(),legacy.0.clone()).unwrap();
        assert_eq!(fs::read(first.data.join("EBWebView/Default/Local Storage/record")).unwrap(),b"history");assert!(record.exists());
        let custom=Temp::new();write_json(&app.0.join("hongguo-storage.json"),&json!({"directory":custom.0,"migrateFrom":first.data})).unwrap();
        let second=Storage::initialize(app.0.clone(),legacy.0.clone()).unwrap();assert!(second.data.join("EBWebView/Default/Local Storage/record").exists());
        write_json(&app.0.join("hongguo-storage.json"),&json!({"directory":first.data,"migrateFrom":second.data,"replaceOwnedDirectory":true})).unwrap();
        let restored=Storage::initialize(app.0.clone(),legacy.0.clone()).unwrap();assert!(restored.data.join("EBWebView/Default/Local Storage/record").exists());
        assert!(fs::read_dir(&app.0).unwrap().flatten().any(|e|e.file_name().to_string_lossy().starts_with("data-backup-")));
    }
    #[test] fn backend_uninstall_preserves_original_and_does_not_reimport() {
        let app=Temp::new();let source=Temp::new();fs::create_dir(source.0.join("python")).unwrap();
        for name in ["python/python.exe","desktop_bootstrap.py","guest-config.json"]{fs::write(source.0.join(name),b"fixture").unwrap();}
        import_backend(&app.0,&source.0).unwrap();assert!(installed(&app.0,"backend"));
        let mut config=read_json(&app.0.join("desktop-config.json"));config["backendDisabled"]=json!(true);write_json(&app.0.join("desktop-config.json"),&config).unwrap();remove_owned(&app.0,"services/backend").unwrap();
        assert!(ensure_backend(&app.0).is_err());assert!(source.0.join("python/python.exe").exists());
        import_backend(&app.0,&source.0).unwrap();assert!(installed(&app.0,"backend"));
    }
    #[test] fn interrupted_migration_resumes_without_overwriting_committed_files() {
        let app=Temp::new();let legacy=Temp::new();let target=app.0.join("data");init_root(&target).unwrap();
        fs::write(target.join("content-config.json"),b"already committed").unwrap();
        let stage=target.join("staging/migration/EBWebView/Default/Local Storage");fs::create_dir_all(&stage).unwrap();fs::write(stage.join("history"),b"saved").unwrap();
        write_json(&target.join("migration-ready.json"),&json!({"migrationId":"resume-test"})).unwrap();
        write_json(&app.0.join("hongguo-storage.json"),&json!({"directory":target,"migrateFrom":legacy.0,"migrationId":"resume-test"})).unwrap();
        Storage::initialize(app.0.clone(),legacy.0.clone()).unwrap();
        assert_eq!(fs::read(target.join("content-config.json")).unwrap(),b"already committed");
        assert_eq!(fs::read(target.join("EBWebView/Default/Local Storage/history")).unwrap(),b"saved");
        assert!(read_json(&app.0.join("hongguo-storage.json"))["migrateFrom"].is_null());
    }
}
