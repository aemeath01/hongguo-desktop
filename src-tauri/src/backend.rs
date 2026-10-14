use std::{fs, io::{BufRead, BufReader, Write}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, os::windows::{io::AsRawHandle, process::CommandExt}, sync::{mpsc, Arc}, time::{Duration, Instant}};
use serde_json::Value;
use windows_sys::Win32::{Foundation::{CloseHandle,HANDLE},System::JobObjects::*};

pub struct Job(HANDLE);
unsafe impl Send for Job {}
unsafe impl Sync for Job {}
impl Job {
    pub fn new() -> Result<Self,String> { unsafe {
        let h=CreateJobObjectW(std::ptr::null(),std::ptr::null());
        if h.is_null(){return Err("无法创建子进程管理器".into())}
        let mut info:JOBOBJECT_EXTENDED_LIMIT_INFORMATION=std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(h,JobObjectExtendedLimitInformation,&info as *const _ as _,std::mem::size_of_val(&info) as u32)==0 {CloseHandle(h);return Err("无法设置子进程清理策略".into())}
        Ok(Self(h))
    }}
    pub fn assign(&self, child:&Child)->Result<(),String>{unsafe{if AssignProcessToJobObject(self.0,child.as_raw_handle() as _)==0{Err("无法管理子进程".into())}else{Ok(())}}}
    pub fn terminate(&self){unsafe{TerminateJobObject(self.0,0);}}
}
impl Drop for Job { fn drop(&mut self){unsafe{CloseHandle(self.0);}} }

#[derive(Clone)]
pub struct Connection { pub port:u16, pub key:String, pub client:reqwest::blocking::Client }
impl Connection {
    pub fn request(&self,method:&str,path:&str,query:&[(String,String)]) -> Result<Value,String> {
        let method=method.parse::<reqwest::Method>().map_err(|_|"请求方式不支持")?;
        let response=self.client.request(method,format!("http://127.0.0.1:{}{}",self.port,path)).header("x-api-key",&self.key).query(query).send().map_err(|_|"播放服务连接超时，请重试")?;
        let status=response.status();
        if !status.is_success(){return Err(format!("播放服务返回 {}，请稍后重试",status.as_u16()))}
        response.json().map_err(|_|"播放服务返回格式无法识别".into())
    }
    pub fn delete_session(&self,id:&str){let _=self.client.delete(format!("http://127.0.0.1:{}/desktop/hls/{}",self.port,id)).header("x-api-key",&self.key).timeout(Duration::from_secs(4)).send();}
}
struct IpcDirectory(PathBuf);
fn short_path(path:&Path)->Result<PathBuf,String>{
    use std::os::windows::ffi::{OsStrExt,OsStringExt};
    let wide:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut buffer=vec![0u16;32768];
    let n=unsafe{windows_sys::Win32::Storage::FileSystem::GetShortPathNameW(wide.as_ptr(),buffer.as_mut_ptr(),buffer.len() as u32)};
    let short=if n>0&&(n as usize)<buffer.len(){PathBuf::from(std::ffi::OsString::from_wide(&buffer[..n as usize]))}else{path.to_path_buf()};
    if short.to_string_lossy().len()>78{return Err("数据目录过长，播放服务的通信路径受限。请在模块与存储中选择较短的自定义路径（例如 D:\\Hongguo）。".into())}
    Ok(short)
}
impl Drop for IpcDirectory{fn drop(&mut self){if let (Ok(target),Some(parent))=(fs::canonicalize(&self.0),self.0.parent()){if let Ok(base)=fs::canonicalize(parent){if target.starts_with(&base)&&target!=base{let _=fs::remove_dir_all(&self.0);}}}}}
pub struct Backend { pub connection:Connection, child:Child, _job:Arc<Job>,_ipc:IpcDirectory }
impl Drop for Backend {fn drop(&mut self){self._job.terminate();let _=self.child.wait();}}
impl Backend {
    pub fn start(data:&Path)->Result<Self,String>{
        let root=crate::storage::module_path(data,"backend");
        if !root.join("desktop_bootstrap.py").is_file(){return Err("未安装播放服务，请在设置的模块与存储中安装".into())}
        fs::create_dir_all(data.join("hls")).map_err(|_|"无法创建播放缓存")?;
        let content=data.join("content-config.json");
        if !content.exists(){fs::copy(root.join("guest-config.json"),&content).map_err(|_|"未找到后端游客配置")?;}
        let mut random=[0u8;32]; getrandom::fill(&mut random).map_err(|_|"无法生成会话凭据")?;
        let key=random.iter().map(|n|format!("{n:02x}")).collect::<String>();
        let ipc_dir=data.join("ipc").join(&key[..8]);
        fs::create_dir_all(&ipc_dir).map_err(|_|"无法创建通信缓存目录")?;
        let ipc=IpcDirectory(ipc_dir);
        let socket_path=short_path(&ipc.0)?;
        let job=Arc::new(Job::new()?);
        let mut child=Command::new(root.join("python/python.exe")).args(["-I","-B"]).arg(root.join("desktop_bootstrap.py"))
            .current_dir(&root).env("JAVA_TOOL_OPTIONS",format!("-Djdk.net.unixdomain.tmpdir=\"{}\"",socket_path.display())).env("TEMP",data.join("ipc")).env("TMP",data.join("ipc")).env("HONGGUO_SESSION_API_KEY",&key).env("HONGGUO_BACKEND_DATA_DIR",data).env("HONGGUO_CONTENT_CONFIG",&content).env("HONGGUO_HLS_WORK_DIR",data.join("hls"))
            .creation_flags(0x08000000).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_|"播放后端无法启动")?;
        if let Err(e)=job.assign(&child){let _=child.kill();return Err(e)}
        child.stdin.as_mut().ok_or("后端启动通道不可用")?.write_all(b"START\n").map_err(|_|"后端启动失败")?;
        let stdout=child.stdout.take().ok_or("后端响应通道不可用")?;
        let (tx,rx)=mpsc::channel();
        std::thread::spawn(move||{let mut line=String::new();let _=BufReader::new(stdout).read_line(&mut line);let _=tx.send(line);});
        let port=rx.recv_timeout(Duration::from_secs(15)).ok().and_then(|s|s.trim().strip_prefix("HONGGUO_PORT_V1 ").and_then(|p|p.parse::<u16>().ok())).ok_or("后端未能分配本机端口")?;
        let connection=Connection{port,key,client:reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(90)).build().map_err(|_|"网络组件不可用")?};
        let start=Instant::now();
        loop {
            if child.try_wait().map_err(|_|"无法读取后端状态")?.is_some(){return Err("后端启动失败，请检查 backend 目录和游客配置".into())}
            if connection.client.get(format!("http://127.0.0.1:{port}/openapi.json")).header("x-api-key",&connection.key).timeout(Duration::from_secs(1)).send().is_ok_and(|r|r.status().is_success()){break}
            if start.elapsed()>Duration::from_secs(70){return Err("播放后端启动超时，请重试".into())}
            std::thread::sleep(Duration::from_millis(300));
        }
        Ok(Self{connection,child,_job:job,_ipc:ipc})
    }
    pub fn alive(&mut self)->bool{matches!(self.child.try_wait(),Ok(None))}
}
