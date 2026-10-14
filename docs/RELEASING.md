# 发布 Windows 版本

目标仓库：`aemeath01/hongguo-desktop`。公开产物仅包含原创应用、原生控制脚本和依赖许可证，不包含用户数据、原客户端后端、mpv 二进制或 AI 模型。

## 签名与身份

Tauri 更新使用单独的 minisign 密钥。公钥在 `src-tauri/tauri.conf.json`；私钥、密码放在仓库外，通过环境变量加载。私钥丢失会影响既有客户端升级，请离线备份。

Git 提交姓名/邮箱可以使用项目身份，但 GitHub 推送者、Release 作者、资产上传者和 Actions 触发者可能公开关联认证账号。组织名下的仓库不等于匿名。若要求所有公开操作均不关联个人账号，必须使用独立发布账号或 GitHub App 身份，并检查实际公开记录。

## 准备

1. 同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 的版本。
2. 编写 `docs/releases/v版本号.md`。
3. 更新依赖锁文件后重新生成许可证。执行 `npm test` 与 `cargo test --manifest-path src-tauri/Cargo.toml`。
4. 执行 `npm run licenses`。生成结果包含依赖版权，不包含构建机器路径。

本地测试无需签名：`npm run desktop:build:local`。

## 正式构建

支持两种配置方式：

- 设置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，按 Tauri 约定提供密钥内容与密码。
- 设置 `HONGGUO_SIGNING_DIR` 为仓库外目录，其中保存 `updater.key` 和 `password.txt`。

```sh
npm ci
npm run licenses
npm run release:build
npm run release:package
```

`release:build` 会重映射 Rust 编译路径，避免把构建机器的用户目录写入诊断元数据。打包前仍应扫描公开源码及二进制，特别是绝对路径、个人身份、令牌和历史记录。

产物位于 `releases/v版本号/`：

| 文件 | 用途 |
| --- | --- |
| `Hongguo-版本号-windows-x64-setup.exe` | NSIS 安装包 |
| 同名 `.exe.sig` | Tauri 更新签名 |
| `Hongguo-版本号-windows-x64-portable.zip` | 白名单组装的便携包，含 `portable.json` |
| `latest.json` | Windows x64 更新索引，含完整签名 |
| `SHA256SUMS.txt` | 下载完整性清单 |

打包脚本会验证签名，并修改测试副本的一个字节确认篡改被拒绝。既有输出目录不自动覆盖，避免误删可用版本。`portable/` 仅为该版本的干净组装目录，上传 ZIP 即可，不上传目录本身。

## 发布顺序

1. 检查 Git 暂存区，确保没有 `data/`、`work/`、`releases/`、`runtime/`、签名私钥、原后端或本机配置。使用已确认的发布身份提交并推送。
2. 建立对应版本标签与草稿 Release，上传上述五个文件。
3. 核对上传后的大小和 SHA-256、更新索引 URL、版本及签名，再发布 Release 并设为最新稳定版。
4. 执行 `node scripts/verify-release.mjs --public`，从公开地址重新下载 `latest.json` 与安装包，验证签名与哈希。不带 `--public` 可核对草稿的五项 GitHub 资产。
5. 使用隔离测试数据验证旧版本检查、下载及安装，不能只凭“构建成功”声称整个更新链路已验证。

更新入口固定为：

```text
https://github.com/aemeath01/hongguo-desktop/releases/latest/download/latest.json
```

便携版只做更新检查与下载页跳转，不运行 NSIS 自动更新，以免把便携目录变成安装版。首次发布前该 URL 不存在，旧的未配置版本也无法自动发现它。
