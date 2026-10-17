# 墨枢 Moshub

墨枢是独立可用的本地个人工作空间，基础平台包含项目、资料、MD/Word/Excel 阅读与编辑、笔记、任务、中文搜索、设置、回收站和完整备份。根据用户 2026-10-15 的确认，现已把同级墨稿的现有书架、章节写作、短篇、人物、设定、素材和完善台迁入墨枢，数据改接 Rust + SQLite，运行时不需要原墨稿、旧账号或服务器。原目录保持原样；接入前在墨枢创建的手动版作品仍有独立入口。

本地保存、历史、来源失效、模块启停和备份已有真实数据库验证，macOS 已验证长短篇创建、中文编辑、立即切页保存和重新进入。AI 请求改经 Rust，密钥使用会话内存或系统凭据，生成记录保存在本地；真实提供商、完整 N05–N08 和 Windows 尚未整体验收。详细范围与限制见 [接入证据](docs/evidence/s04-mogao-integration.md)。

## 已选定的技术方案

- Rust：桌面核心、领域服务、数据库、文件、备份和 AI 请求。
- TypeScript 与 React：界面、交互和富文本编辑器。
- Tauri 2：桌面框架；SQLite 与托管附件：本地存储。
- 首版单用户、单工作空间；基础平台与小说非 AI 功能离线可用。
- 按用户 2026-10-15 确认迁入现有墨稿界面与创作流程，改接 Rust/SQLite；原目录保持不变，不依赖旧服务、MySQL 或账号。

## 文档阅读顺序

1. docs/01产品需求.md：定位、范围、用户故事与完整基础功能。
2. docs/02技术架构.md：语言、实现分层、工程目录与界面规范。
3. docs/03数据与模块契约.md：模块接口、数据模型、保存、备份与恢复。
4. docs/04墨稿小说模块.md：全新小说模块、候选采用、来源与长篇上下文。
5. docs/05Codex实施与验收.md：AI、质量要求、验收矩阵与分阶段任务。
6. docs/06决策与参考依据.md：风险、默认值、技术决策与提炼记录。

这六份文件是按主题维护的执行依据；当前进度和验证结果见实施状态与 evidence 记录。不再维护重复的汇总 Markdown/Word 阅读版，历史版本可从 Git 恢复。

## 当前运行方式

需要 Node.js 24（本机验证 24.12.0）、npm、Rust 1.99.0 与系统桌面编译工具。macOS 本机已安装 Command Line Tools。Windows 需按 Tauri 官方前置要求准备 MSVC 与 WebView2，并独立验证；当前没有 Windows 实测结果。

```sh
npm ci
npm ci --prefix integrations/mogao
npm run tauri -- dev
```

`npm run dev` 只启动浏览器预览。浏览器没有 Rust 数据桥接，会明确显示本地数据不可用，不使用内存假数据或 localStorage 正文。

本机 Rust 安装在项目内 `.tools/cargo` 与 `.tools/rustup`，未修改全局 shell 配置。`scripts/tauri.mjs` 和 `scripts/rust.mjs` 自动使用该工具链；其他机器也可使用正常的 rustup 安装。依赖、缓存和构建产物不进入 Git。

正常运行使用系统应用数据目录（应用标识 `app.moshub.desktop`），含 workspace.sqlite、attachments、drafts、editing、backups、logs。附件已由 Rust 复制、校验并托管；单份上限 100 MiB，纯文本预览限 UTF-8/2 MiB，PNG/JPEG/GIF/WebP 预览限 10 MiB，MD/Markdown、DOCX、XLSX、CSV/TSV 可在资料详情阅读，并通过“编辑文档”修改，文档读取限 20 MiB（Markdown 另限 UTF-8/2 MiB）；表格支持工作表切换与行列分页。旧 DOC/XLS、超限或不支持的文件可系统打开或导出。“系统打开”提供临时阅读副本，不回收修改；“编辑文档”提供持久会话，Office 保存并关闭后在墨枢提交，保留原件和前后版本。DOC/XLS 可通过本机 Office 原格式编辑，不支持内容预览。Markdown 草稿每两秒保存到 SQLite，切页/正常关闭冲刷，恢复会话在首页与资料库显示。Word/Excel 编辑需本机已安装相应应用，发布包不包含 Office 引擎，也没有在墨枢页面内嵌完整 Office。未提交笔记每两秒由 Rust 原子写入带校验的恢复草稿，保存前也会落盘；重启在首页选择对照恢复或另存副本。手动保存建立前后快照，支持历史浏览与恢复、TXT/Markdown 原生导出。两秒之间尚未落盘的输入仍可能在异常退出时丢失，组合输入期间不提交半成品；完整备份恢复已接通，检查范围与已知限制见 S03 证据。Debug 桌面实测使用 `MOSHUB_DEV_WORKSPACE` 指定项目内隔离空间；Release 忽略该变量。

内置模块可调用 Rust 的 `PlatformService::publish_generated_artifact(GeneratedArtifact)`，提交文件名、字节、来源、说明及可选项目/文件夹，将生成结果保存为普通资料并使用同一阅读组件。接口已实现并经真实数据库测试；Markdown 源文编辑与受控预览、Word/Excel 的本机 Office 编辑会话及文件历史已实现；表格生成器和爬取模块尚未实现。DOCX/XLSX 在墨枢内仍展示正文/表格摘要；完整格式编辑与公式重算由本机 Word、Excel、WPS 或 LibreOffice 完成。

## 检查与构建

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run rust -- fmt --manifest-path src-tauri/Cargo.toml --check
npm run rust -- clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
npm run rust -- test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --debug --bundles app
```

只检查平台核心时，可给 `cargo test` 增加 `--no-default-features`。macOS/Windows 的真实凭据验证是显式探测，使用唯一随机测试项并在读取后删除，不读已有凭据：

```sh
npm run rust -- test --manifest-path src-tauri/Cargo.toml --no-default-features --locked real_system_credential_round_trip -- --ignored --exact
```

本机可运行 `npm run release:local` 生成带完整 ad-hoc 签名的 Release app 和 DMG，位置为 `src-tauri/target/release/bundle/macos/墨枢.app` 与 `src-tauri/target/release/bundle/dmg/墨枢_0.1.0_aarch64.dmg`。本地签名不等于 Developer ID 或公证，尚未公开发布。

Debug macOS 应用位于 `src-tauri/target/debug/bundle/macos/墨枢.app`。这是开发验证产物，未做正式签名、公证或公开发布。CI 配置覆盖 macOS/Windows 编译与测试，但尚未在远端执行，不能视为 Windows 验收。

## 开发顺序与证据

将此目录作为 Codex 工作目录，阅读 AGENTS.md，从 S00 技术验证开始。建议首次开发任务完成 S00 与 S01；用户要求全量实现时顺序推进到 S06。基础版在 S03 独立验收，小说模块在此之后开发。

项目中文名为墨枢，技术标识为 moshub。已初始化本地 Git 仓库，版本由 package-lock.json、src-tauri/Cargo.lock 与 rust-toolchain.toml 锁定。

- [实施状态](docs/implementation-status.md)：阶段状态、需求与验收映射、待验证事项。
- [测试与桌面操作记录](docs/evidence/s00-s01.md)：真实 SQLite 故障测试和 macOS 最小流程。
- [S02 项目与资料证据](docs/evidence/s02-content.md)：真实文件、关联、失败回滚与原生对话框验证；资料阶段的真实测试记录。
- [S02 笔记证据](docs/evidence/s02-notes.md)：恢复草稿、版本、冲突合并、导出及 macOS 流程。
- [S02 任务证据](docs/evidence/s02-tasks.md)：本地日期、时区重启、并发事务、任务视图、项目入口与桌面撤销删除。
- [S02 文档与表格证据](docs/evidence/s02-documents.md)：有界解析、真实 OOXML/CSV、生成结果入库与 macOS 阅读分页。
- [S02 文档编辑与样式证据](docs/evidence/s02-document-editing.md)：恢复会话、版本事务、样式与 Office 编辑验证。
- [S03 基础版证据](docs/evidence/s03-foundation.md)：工作台、中文搜索、设置、模块契约、回收站、完整备份与恢复日志，以及工程/实机结果。
- [S03 桌面与 Release 收尾](docs/evidence/s03-desktop-release.md)：图片/封面/头像、保存失败关闭与恢复、实际进程中断、分块备份、核心容量基准和本地安装包。
- [数据与命令字典](docs/data-dictionary.md)：已落地表结构、命令、输入上限与保存回执。
- [依赖选择记录](docs/dependency-decisions.md)：版本、兼容性与选择理由。

## 基础版数据与备份

设置中的数据页可创建完整备份、检查恢复和导出到外部位置；每日首次成功启动自动备份，保留最近 7 份成功自动备份。恢复采用完整替换并先备份当前空间，停止写入后切换，失败回退；历史版本、恢复草稿和已保存的 Office 副本纳入备份，密钥与日志排除。请先在 Office 保存并关闭。备份格式为 1，平台数据格式为 4，总展开上限 10 GiB。

主题、字号、昵称、头像、导航/首页和快捷键偏好保存到 SQLite。搜索使用中文规范化子串投影，损坏时可手动重建。模块中心提供内置墨稿的启用与停用；开发测试模块不在正式导航展示。文件夹删除后单份资料恢复到根目录；目录不自动复活。

Debug 实机验证可用 `MOSHUB_DEV_WINDOW_SIZE=1024x720` 或 `1440x900` 固定验收窗口；Release 忽略测试变量。完整阶段状态、测试与未验证项以实施状态和 S03 证据为准。

## 墨稿手动创作版

在“模块”中启用墨稿，再从侧栏进入。作品可以独立存在或关联项目，封面选择资料库图片；人物、世界观和大纲可引用平台资料。章节 JSON 与纯文本由墨稿独立保存，复用平台的保存会话保护；历史恢复建立新 revision，回收区可恢复作品、卷、章节和设定。停用不删除数据；平台搜索在停用时仅显示作品名称。

TXT 导入限 UTF-8 / 20 MiB，先预览并可手工拆分、合并，再以整份作品事务确认。TXT/Markdown 导出会先冲刷当前编辑稿，支持全书或勾选章节。结构化 JSON 包含作品、卷章、历史、恢复稿和设定，资料关联使用工作空间 ID；附件字节及完整工作空间恢复使用平台设置中的完整备份。当前不提供旧墨稿格式或 JSON 单作品恢复入口。

墨稿字段、迁移与语义命令见 [数据字典](docs/data-dictionary.md)，真实验证范围与剩余事项见 [S04 证据](docs/evidence/s04-mogao.md)。手动版无需密钥；AI 按 S05 后续实现。


## 现有墨稿写作台接入

从模块中心启用墨稿，侧栏进入写作台。长篇与短篇、人物、世界观、大纲、伏笔、时间线数据、素材、经历/事实与问题台账使用本模块独立 SQLite 表。原界面的 localStorage 访问已替换成启动时读取的 SQLite 快照和写入队列，正文不会依赖浏览器存储。完整空间备份包含这些记录、恢复稿、会话和生成历史；密钥排除。

写作台保留原来的界面与创作编排，独立编译为随应用交付的本地资源，使用受控同源 iframe 隔离 React 与 CSS。其命令只接受创作路由白名单，不能提交 SQL、任意磁盘路径或旧认证请求。普通保存携带基准版本，正文变更前建立历史快照；来源变更后经历、事实与评审过期。切到平台页面、正常退出、停用和导出会等待保存，输入中或有未保存表单时保留页面。

“打开此前手动版作品”保留旧入口；该入口的 JSON 正文与资料引用不被接入覆盖，两个入口目前不自动合并作品。写作台使用原编辑器受控 HTML 的保存契约；之前手动版使用 Tiptap JSON。迁入副本与原许可见 [integrations/mogao](integrations/mogao/README.md)。`npm run build` 会构建两套本地资源，安装包运行时不依赖相邻目录。

AI 在写作台的本地设置配置 OpenAI 兼容连接。会话密钥退出后失效；勾选系统凭据后可跨重启使用。测试连接会实际调用用户选定模型。生成与主动中断的候选在设置中的“最近生成记录”查看。本轮只使用本机 HTTP 协议服务验证传输，不把它描述为真实 AI 质量验收。

## 资料库阅读小说与放大写作台

资料库的“小说作品”自动显示墨稿长篇、短篇和此前手动版作品。点击即可在资料库按章节阅读最新保存稿，“进入墨稿编辑”回到对应作品/章节。停用模块仍可阅读，编辑须先启用；已删除作品不会出现在资料库，恢复后自动重新出现。条目是原稿的实时阅读入口，不是另存的一份文件；目前不参与普通附件的文件夹、项目、标签和收藏筛选，可用类型“小说作品”及名称/简介关键字查找。

进入墨稿默认与其他页面相同，保留侧栏和正常布局。点击“全屏”才展开写作区并进入系统全屏，点击“退出全屏”恢复；“返回资料库”会先保存，返回刚才阅读的章节并读取新稿。

## 分类导航与桌宠

侧栏收为五个入口：**首页、工作、资料、创作、工具**。项目/任务在工作内切换，资料库/笔记在资料内切换，墨稿与模块管理在创作内切换。全局搜索仍可从顶栏或原快捷键打开，工具内保留回收站、设置与帮助。原导航排序/固定偏好在各分类内继续生效。

从“工具 → 桌宠”开启小狐狸。独立透明小窗支持拖动、点击互动、右键/菜单休息与唤醒、返回墨枢和收起；可设置置顶和大小，找回按钮将窗口移回屏幕内。暂用本地可替换的 Q 版狐狸小女孩 SVG，后续再细化形象。配置保存在 SQLite，开启状态在下次启动墨枢时恢复；退出墨枢时桌宠一并退出，不在关闭主程序后驻留。坐标不跨重启保存，备份恢复后的窗口配置在下次启动或重新设置时应用。无模型请求或文稿读取。验证和具体限制见 [导航与桌宠记录](docs/evidence/navigation-desktop-pet.md)。
