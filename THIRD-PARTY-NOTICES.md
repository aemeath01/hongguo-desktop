# 第三方说明

本项目原创代码使用 MIT。以下组件、模型与参考项目各自保留原许可证。本文件不授予对第三方软件或媒体内容的额外权利。

## 随应用构建的依赖

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| [Tauri 2](https://github.com/tauri-apps/tauri) 及插件 | Windows 窗口、更新、快捷键、对话框 | MIT / Apache-2.0 |
| [React](https://github.com/facebook/react) | 界面 | MIT |
| [Motion](https://github.com/motiondivision/motion) | 动效 | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) | 图标 | ISC |

锁定依赖清单与许可证文本位于 [docs/licenses/THIRD-PARTY.txt](docs/licenses/THIRD-PARTY.txt)，构建时由 `scripts/collect-licenses.mjs` 生成。Windows / WebView2 属于微软系统组件，适用其单独条款。

## 从上游按需下载，不包含在公开安装包 / ZIP 中

| 组件 | 固定版本 / 来源 | 许可证与用途 |
| --- | --- | --- |
| mpv / FFmpeg 等构建依赖 | [shinchiro 20261013](https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20261013)，mpv `9d144e57b6` | GPL-2.0-or-later 构建；独立进程播放器。mpv 的 LGPL 构建选项不代表此二进制是 LGPL |
| Anime4K | [v4.0.1](https://github.com/bloc97/Anime4K/tree/v4.0.1) | MIT；恢复与放大着色器 |
| VapourSynth | [R79](https://github.com/vapoursynth/vapoursynth/releases/tag/R79) | LGPL-2.1-or-later；视频滤镜运行时 |
| Python | [3.13.10](https://www.python.org/downloads/release/python-31310/) | PSF；可选滤镜脚本运行时 |
| vs-mlrt / VSNCNN | [v15.16](https://github.com/AmusementClub/vs-mlrt/releases/tag/v15.16) | MIT；模型推理封装，模型另有权利声明 |
| ncnn | [Tencent/ncnn](https://github.com/Tencent/ncnn) | BSD-3-Clause；Vulkan 推理 |
| RIFE | [ECCV2022-RIFE](https://github.com/hzwer/ECCV2022-RIFE) | MIT；插帧方法与模型来源，通过 vs-mlrt 使用 |
| Real-ESRGAN | [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | BSD-3-Clause；超分模型来源，通过 vs-mlrt 使用 |

下载源和 SHA-256 固定在 `src-tauri/src/enhancement.rs`；本地开发下载脚本是 `scripts/fetch-mpv.mjs`。用户安装的运行时、模型和原后端均不应从个人数据目录直接重新打包发布。自行再分发上述二进制时，需另行满足对应许可证的源码、版权和通知要求。

## 功能与交互参考

- [原红果桌面版](https://github.com/waligoraamodio288-rgb/hongguo-desktop-releases)：公开版本分发仓库，应用源码未公开。本项目参考其内容浏览与服务接入等功能；播放后端由用户自行提供和导入，不包含在本项目源代码或 Release 中。
- 播放器参考常见流媒体及哔哩哔哩桌面端的交互习惯，未使用其软件安装包、代码或品牌素材。

剧名、封面及视频内容的权利归对应权利人。本项目发布包不附带第三方封面或视频。README 横幅为本项目原创 SVG 界面示意。
