# 依赖选择记录

选择日期：2026-10-11。通过 npm registry、crates.io 与 Rust 官方 stable manifest 核对后解析依赖，前端直接依赖精确版本在 package.json；Rust 直接依赖使用 `=`；全部间接依赖分别由 package-lock.json 与 src-tauri/Cargo.lock 锁定。

| 组件 | 选定版本 | 理由 |
| --- | --- | --- |
| Rust | 1.99.0 | 选择当日官方稳定版本，统一 edition 2024、rustfmt、clippy；工具链文件锁定 |
| Node / npm | 验证环境 24.12.0 / 11.6.2 | 已安装；满足 Vite 8 的 Node 要求（20.19+ 或 22.12+）；CI 固定 Node 24.12.0 |
| Tauri Rust / API / CLI / build | 2.12.3 / 2.12.3 / 2.12.2 / 2.7.2 | Tauri 2 固定大版本，API 与 Rust 同补丁；不同子包独立版本，已通过 CLI 检查和 macOS 构建 |
| 单实例插件 | 2.5.3 | 官方插件；再用工作空间 OS 文件锁防止同库双写 |
| React / React DOM | 19.3.0 | 当日稳定版本，编辑器兼容性经 npm 解析及构建验证 |
| Vite / React 插件 | 8.3.4 / 6.1.2 | 当日稳定工具链，配合本机 Node 24 |
| TypeScript | 6.0.3 | 最新 7.0.2 超出 typescript-eslint 8.71.1 的支持范围 `>=4.8.4 <6.1.0`，退到受支持版本；没有使用 force 或忽略 peer dependencies |
| ESLint / typescript-eslint | 10.12.0 / 8.71.1 | 后者声明支持 ESLint 10；避免使用已提示停止支持的 ESLint 9 |
| Tiptap React / PM / StarterKit | 3.31.4 | 三包统一版本；结构化 JSON、撤销及基础富文本，禁用尚未支持的代码节点 |
| Tailwind / Vite 插件 | 4.3.3 | 统一样式基础；界面用语义颜色变量和普通 CSS 管理组件状态 |
| Vitest | 5.0.3 | 使用真实保存会话测试回执、并发和输入法组合保护 |
| rusqlite | 0.40.2 | 当日稳定版本；bundled 固定 SQLite 来源，backup 为后续一致性快照准备 |
| Tokio | 1.53.2 | 仅用 async 回执通道与桌面运行时，不在 async 线程执行阻塞 SQL |
| serde / serde_json | 1.0.229 / 1.0.152 | 明确 DTO 与 JSON 格式边界，拒绝未知输入字段 |
| uuid / chrono | 1.28.0 / 0.4.45 | UUID 身份和 UTC 时间序列化 |
| fs2 / sha2 | 0.4.3 / 0.11.0 | 工作空间 OS 锁和迁移 SHA-256 校验 |
| keyring | 3.6.3 | 选择显式 apple-native/windows-native 后端的已知 Entry API；4.2.0 已拆分生态，不在 S00 引入新的凭据抽象；S05 前重新核对维护及迁移方案 |
| tempfile | 3.27.0 | 独立真实数据库及文件故障测试空间；S02 提升为正式依赖，用于同目录暂存、原子导出和不覆盖的附件落盘 |
| rfd | 0.17.2 | S02 原生异步文件选择/导出对话框，仅 Rust desktop feature 引用；前端不获得任意文件路径 API |
| opener | 0.9.0 | S02 Rust 校验资料归属后打开文件副本或 HTTP(S) 链接；不暴露通用 shell 命令 |
| url | 2.5.8 | 复用锁文件中的 URL 解析器，拒绝非 HTTP(S)、无主机和内嵌凭据的资料链接 |
| base64 | 0.22.1 | 使用稳定 Engine API 编码受限图片预览；仅用于 Rust 返回的数据 URL，不开放本地文件协议 |

TypeScript strict 开启。Tauri 权限只授权主窗口的事件、关闭与销毁，没有文件、SQL、shell 或网络的前端通用权限；CSP 禁止远程页面与脚本。自定义命令通过注册列表静态暴露、Rust 内再次校验。

本机 Rust 工具链通过官方 rustup 安装在项目 `.tools` 内；没有复制旧墨稿的依赖或源码，没有修改旁边的项目。React 编辑器单独按需加载，S02 笔记与任务构建输出主入口约 284 kB、编辑器约 405 kB（未压缩 JS），不以这些数字代替启动或输入性能验收。

官方依据：

- [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)
- [Tauri 单实例插件](https://v2.tauri.app/plugin/single-instance/)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [rusqlite](https://docs.rs/rusqlite/0.40.2/rusqlite/)
- [keyring 3.6.3 的平台功能说明](https://docs.rs/keyring/3.6.3/keyring/)
- [keyring 4.2.0 的生态拆分说明](https://docs.rs/keyring/4.2.0/keyring/)
- [Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react)
- [rfd 异步原生对话框](https://docs.rs/rfd/0.17.2/rfd/struct.AsyncFileDialog.html)
- [opener 系统应用打开](https://docs.rs/opener/0.9.0/opener/)

S02 笔记恢复、版本和导出复用已有 SHA-256、tempfile、SQLite、rfd 与 Tiptap 依赖，没有新增依赖或修改已发布迁移。链接 JSON 接受当前 Tiptap 附带的 title（可空），并在 Rust 解析和校验 HTTP(S) URL；编辑器程序切换状态不触发用户更新。

S02 任务复用 chrono 校验日历日期和读取系统本地今日，复用 SQLite revision 事务；不引入日期 UI 库或时区数据库。跨时区测试通过子进程切换 TZ 并重开真实数据库。任务删除及放弃修改使用 React 应用内确认：本机 WKWebView 的 window.confirm 未显示对话框，不能依赖浏览器确认作为此流程入口。


## S02 文档与表格

2026-10-11 按用户要求新增下列 Rust 依赖并锁定 Cargo.lock；前端复用 React，没有新增解析库。解析放在 Rust，React 只接收有界只读视图。

| 组件 | 精确版本 | 理由 |
| --- | --- | --- |
| pulldown-cmark | 0.13.4 | CommonMark 及表格解析；逐事件转义原始 HTML、移除图片/链接目的后生成阅读 HTML |
| quick-xml | 0.41.0 | 流式提取 Word 标题、段落和简单表格；与 calamine 依赖版本对齐，显式拒绝 DTD |
| calamine | 0.36.1 | 读取 XLSX 工作表、值、日期和公式缓存；单元格流避免稀疏大坐标触发稠密分配；开启 chrono |
| zip | 8.6.0 | 与 calamine 对齐；只启用 deflate，限制 ZIP 项数、路径与实际解压字节，不解包到磁盘 |
| csv | 1.4.0 | 正确读取引号、逗号、换行及 TSV；不将公式形文本执行为公式 |

已通过 Rust 1.99.0、默认/无桌面核心测试、严格 clippy 和 macOS Debug app 构建。应用约 42.13 MiB；Vite 主入口约 288.02 kB、编辑器约 405.42 kB、CSS 17.13 kB（未压缩），不作为性能验收。

官方依据：[pulldown-cmark](https://docs.rs/pulldown-cmark/0.13.4/pulldown_cmark/)、[quick-xml](https://docs.rs/quick-xml/0.41.0/quick_xml/)、[calamine](https://docs.rs/calamine/0.36.1/calamine/)、[zip](https://docs.rs/zip/8.6.0/zip/)、[csv](https://docs.rs/csv/1.4.0/csv/)。


## S02 文档编辑与统一样式

2026-10-11 沿用既有 Rust/React/SQLite/tempfile/zip/pulldown-cmark/opener/rfd 依赖，没有新增 Office 模型或服务器库；Cargo.lock 与 package-lock.json 无需改变。0002 为追加迁移，0001 校验值不变。Markdown 在墨枢内编辑，Word/Excel 调用已安装的本机应用编辑持久副本；完整文件原样托管，避免从轻量阅读视图重建而丢失图片、排版或表格格式。Office 的许可、兼容性及重算由用户选择的应用提供，不将测试运行时打入发布包。

样式统一使用页面/区域/小标题/正文/控件/辅助字号变量 24/18/16/15/14/13 px，统一 40 px 控件与 24 px 面板间距；文档自有标题层级保留。正文编辑的保存保护复用语义回执，Office 外部窗口的未保存内容由 Office 自行管理。


## S03 基础平台

2026-10-13 复用固定 SQLite backup、zip、SHA-256、tempfile、Tokio、React 和原生对话框，没有新增依赖或 Office 运行时。数据库追加 0003，备份另有 formatVersion=1；不修改历史迁移。搜索使用规范化中文子串投影，避免引入未经中文验收的默认分词器，容量与性能仍留待发布验收。模块选择编译内置清单和页面注册表，独立迁移与生命周期通过平台接口运行，不引入通用容器、微服务或动态插件运行时。

完整恢复先在暂存空间验证内容/数据库并重建搜索，再建立当前空间保护备份和持久切换日志；SQLite 工作线程与维护屏障拥有写入权限。长任务记录进度、稳定错误和安全取消，不由 UI 操作任意文件。应用内确认统一管理焦点与取消，避免本机 WebView 未显示 window.confirm 的已观察问题。


## 本地 Release 与恢复收尾

2026-10-13 未新增依赖。备份复用zip/SHA-256改为64KiB分块，文件内部响应取消；Unix恢复追加目录同步，实际切换中断用独立子进程和SQLite排他锁验证，不将其等同硬件断电。当前目录订阅既有原生拖入结果事件，保留筛选及未提交字段。

本地 macOS Release 构建使用独立脚本以 signingIdentity=- 对整个 bundle 作ad-hoc签名，避免只有链接器签名而未封装应用资源；严格签名校验和DMG校验通过。没有配置Developer ID或公证凭据，不把本地签名当作公开发行资质。


## 2026-10-17 现有墨稿接入依赖

现有墨稿前端作为独立构建副本保留 React 18.3.1，避免影响平台 React 19.3.0。编辑器升级到 Tiptap 3.31.4，适配 setContent 的 emitUpdate 选项；React Router 7.18.4、Axios 1.20.0、Vite 6.4.4、Tailwind 4.3.3、PostCSS 8.5.30 均在独立 package-lock 中锁定。原 OpenAI 4.104.0 只用于类型声明，运行时代码改用受控桥接，不允许浏览器带密钥联网。原源码许可与校验清单保留在 integrations/mogao。

Rust 新增 reqwest 0.13.5（json/stream/native-tls），复用系统 TLS；Tokio 加入 time/net，取消轮询与连接/读/总超时明确。版本依据本机安装、类型/构建与协议测试；前端依赖升级后 `npm audit --prefix integrations/mogao` 报告 0 项漏洞。审计是当次锁文件结果，不承诺未来无公告。CI 新增独立前端 npm ci 步骤。

## 2026-10-17 桌宠透明窗口

沿用锁定的 Tauri 2.12.3，不新增桌宠或动画依赖。macOS 透明窗口使用 Tauri 的 macos-private-api feature 与配置开关；小狐狸使用本地 SVG/CSS，支持 reduced-motion。feature 不改变锁文件的依赖版本。公开签名、公证与 App Store 可用性不在本轮承诺内。
