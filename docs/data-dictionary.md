# 平台数据与命令字典

日期：2026-10-15。当前平台 schemaVersion=4，墨稿独立 schemaVersion=2，正文 schemaVersion=1。本文描述已写入的基础契约，不代表 B01–B10 已完成。墨稿实体在独立模块内定义，平台仅维护通用引用和模块生命周期。

## 数据访问与所有权

一个 SQLite 数据库、一个数据库工作线程、有界队列容量 32。数据库工作线程拥有连接和工作空间独占锁；最后一个服务释放时先处理已入队请求，再关闭连接和释放锁。UI 只能调用以下语义命令。默认路径由 Tauri 的 app_data_dir 解析；Debug 构建可用 MOSHUB_DEV_WORKSPACE 指定隔离实测空间，Release 构建忽略该变量。路径及 SQLite 错误原文不进入 AppError。

SQL 见 `src-tauri/migrations/0001_platform.sql`、`0002_document_editing.sql` 、`0003_foundation.sql` 与新增 `0004_module_links.sql`；0001/0002 保持原有校验值。数据库开启 foreign_keys、WAL、synchronous=FULL。启动检查 user_version、迁移校验值、quick_check 与外键；拒绝未来版本、无关旧数据库和已变更迁移。已验证 0001 → 0002 的事务升级，保持工作空间 ID 和业务数据；检查历史迁移校验值，损坏的旧库升级前拒绝；v1/v2 升级至 v3 前建立完整保护备份。

## 表

| 表 | 关键字段与约束 | 当前使用情况 |
| --- | --- | --- |
| platform_meta / platform_migrations | workspace_id、schema_version；迁移编号、SHA-256、执行时间 | 已使用 |
| platform_projects | UUID、name、description、status、cover_blob_id、favorite、revision、时间、deleted_at | 创建、详情编辑、标签/收藏/封面、归档、软删除及恢复；筛选分页 UI |
| platform_folders | parent_id 外键、自引用拒绝；revision、时间、deleted_at | 创建、重命名/移动、后代循环检测；删除可将资料移到根目录或连同后代内容软删除 |
| platform_blobs | SHA-256 唯一、internal_path 唯一、size、MIME | Rust 托管、去重、预览/打开/导出前校验；永久删除后清理无引用字节；共享/封面/文件历史/会话引用保留 |
| platform_resources | file/link/note；类型约束 blob_id/url；文件夹、来源、收藏、revision、时间、软删除 | 三种资料、统一元数据、筛选分页、软删除与恢复 |
| platform_document_sessions | 唯一 resource_id、base_revision、source_blob_id、filename、format、markdown、edit_sequence | 持久编辑会话；Markdown 恢复草稿，Office 副本在 editing/sessionId 下，UI 无任意路径 |
| platform_file_versions | resource_id/source_revision 唯一、blob_id 外键；UPDATE 禁止 | 完整文件前后历史、归属校验导出与恢复；活动会话阻止历史恢复 |
| platform_notes | resource_id 外键、body_json、plain_text、schema_version、revision、时间 | 已使用 |
| platform_note_versions | source_revision、标题、正文、纯文本、格式版本、创建时间；UPDATE 被触发器拒绝 | 手动保存和版本恢复建立前后快照；版本浏览/恢复已接通 |
| platform_tasks | 状态、优先级、due_date、project_id、revision、时间、软删除 | 创建编辑、完成/重开、视图/筛选分页、项目关联、软删除撤销；本地日期校验已实现 |
| platform_tags / platform_entity_tags | 使用项目、资料、任务的具体外键，恰好一个归属，关联唯一 | 项目/资料标签已使用；B05 不引入任务标签功能 |
| platform_project_resources | 项目与资料具体外键、联合主键、创建时间 | 共享关联、幂等建立/解除；项目软删除保留关系 |
| platform_preferences / platform_module_states | 版本化 JSON 设置、模块启用状态 | 已使用 |
| platform_jobs / platform_search_projection | 明确任务状态与进度、来源版本；搜索投影联合主键 | 已使用 |
| ai_connections | endpoint、model、secret_ref，无密钥字段 | S05 表基础；无 AI 请求或配置入口 |

表没有删除共享内容的 ON DELETE CASCADE。章节、人物、作品等小说表尚未建立。辅助表不作为首版业务验收证据。

## 命令

所有命令的 input 都含 UUID requestId，未知字段拒绝；平台实体 ID 为 UUID 字符串，编译内置模块 ID 为受限小写 ASCII。修改请求包含 baseRevision。成功返回真实数据库结果，失败返回 AppError（code、message、retryable、requestId，可选 details），冲突 details 仅包含 currentRevision。

| 命令 | input（除 requestId） | 返回 |
| --- | --- | --- |
| workspace_status | 无 | workspaceId、schemaVersion、appVersion、projectCount、noteCount |
| list_projects | offset、limit | 有效项目列表，更新时间倒序，ID 作为稳定排序补充 |
| create_project | name、description | Project，revision=1 |
| update_project | id、baseRevision、name、description、status | Project，新 revision |
| set_project_deleted | id、baseRevision、deleted | Project；恢复不删关联，重复相同状态不增加 revision |
| list_notes | offset、limit | NoteSummary 列表，不传输全部正文 |
| create_note | title、projectId（可空） | Note，revision=1；关联项目无效时整体回滚 |
| get_note | id | Note，包括正文 JSON 和 Rust 生成的纯文本 |
| save_note | id、title、body、schemaVersion、baseRevision、clientEditSequence、createVersion | SaveReceipt |
| query_projects | offset、limit、keyword、status（可空）、favoriteOnly、tag（可空） | Project 列表，更新时间倒序/ID 补充 |
| get_project | id | Project（可包含软删除状态，用于当前操作撤销） |
| save_project_details | id、baseRevision、name、description、status、favorite、tags、changeCover、coverResourceId（可空） | Project；changeCover=false 保留封面，true+null 移除；选择图片资料时复用 blob |
| list_resources | offset、limit、keyword、kind（可空）、folderId（可空）、rootOnly、projectId（可空）、favoriteOnly、tag（可空） | Resource 列表；无正文、无内部路径 |
| get_resource | id | 有效 Resource |
| create_link | name、url、description、source、folderId（可空）、projectId（可空） | Resource；归属无效整体回滚 |
| import_file | folderId（可空）、projectId（可空） | Rust 原生选择文件后返回已托管 Resource；取消为 CANCELLED，不接受 UI 路径 |
| save_resource | id、baseRevision、name、description、source、folderId（可空）、url（仅链接非空）、favorite、tags | Resource；笔记标题改变时推进笔记 revision |
| set_resource_project | id（资料）、baseRevision（资料）、projectId、linked | Resource；重复相同关联状态不增加 revision |
| set_resource_deleted | id、baseRevision、deleted | Resource；保留附件和关联；恢复到已删除文件夹时移到根目录 |
| list_folders | offset、limit | Folder 元数据，名称/ID 排序 |
| create_folder | name、parentId（可空） | Folder |
| save_folder | id、baseRevision、name、parentId（可空） | Folder；拒绝自身或后代作为父节点 |
| delete_folder | id、baseRevision、mode（moveToRoot/trashContents） | null；全部后代在一事务内处理，不删除附件字节 |
| preview_file | id（文件资料） | FilePreview：text/image/unsupported，受限文本或图片 dataUrl，无路径 |
| read_document | id、baseRevision、offset、limit、sheetIndex、columnOffset、columnLimit | DocumentView；有效托管资料，解析前后校验 revision，无路径 |
| preview_project_cover | id（项目） | FilePreview；通过项目封面引用解析 blob |
| open_resource | id | null；HTTP(S) 系统浏览器或已校验文件的临时副本，笔记走编辑器 |
| export_file | id（文件资料） | Rust 原生目的选择与原子导出后 null；取消为 CANCELLED，不接受 UI 路径 |
| list_note_versions | id（笔记）、offset、limit | NoteVersionSummary 列表，创建时间/revision/ID 倒序 |
| get_note_version | id（笔记）、versionId | NoteVersion，校验版本属于该有效笔记 |
| restore_note_version | id、versionId、baseRevision | Note；旧版作为新 revision 保存，替换前后快照在同一事务内建立 |
| write_note_draft | draft | null；Rust 校验归属、正文、会话序号后原子替换草稿，不写正文表 |
| list_note_drafts | offset、limit | DraftEntry；损坏草稿显示脱敏 issue，保留文件 |
| get_note_draft | id（sessionId） | NoteDraft；校验格式版本、工作空间、SHA-256、实体 ID 与正文 |
| discard_note_draft | id（sessionId）、throughSequence（可空） | null；保存回执仅删除不超过已确认序号的草稿，null 为显式删除 |
| copy_note_draft | id（sessionId） | Note；事务建立独立恢复笔记及快照，允许原笔记已软删除，不继承元数据/关联，不自动清除源草稿 |
| export_note | id、baseRevision、format（txt/markdown） | Rust 原生目的选择与原子导出后 null；取消为 CANCELLED，对话框之后再次校验 revision，不接受 UI 路径 |
| query_tasks | offset、limit、view（all/today/overdue/completed）、status（可空）、dueDate（可空）、projectId（可空）、keyword | TaskPage（items、today、hasMore）；高到低优先级、截止日期、更新时间/ID 稳定排序 |
| get_task | id | Task；含软删除状态，供当前编辑器撤销 |
| create_task | title、description、status、priority、dueDate（可空）、projectId（可空） | Task，revision=1；项目无效时整体回滚 |
| save_task | id、baseRevision、title、description、status、priority、dueDate（可空）、projectId（可空） | Task，新 revision；不静默覆盖并发修改 |
| set_task_deleted | id、baseRevision、deleted | Task；保留项目关联，重复相同状态不增加 revision |

Project：id、name、description、status（active/archived）、favorite、tags、coverBlobId（可空）、revision、createdAt、updatedAt、deletedAt（可空）。coverBlobId 是不透明标识，不是磁盘路径。

Resource：id、kind（file/link/note）、name、description、source、folderId、originalName、url、favorite、tags、projectIds、size、mimeType、sha256、revision、createdAt、updatedAt、deletedAt。文件特有字段对非文件为空，隐藏已软删除项目的关联。Folder：id、parentId、name、revision；持久化表另保存创建/更新时间。Blob 的内部文件名只存在 Rust 与数据库。

Task：id、title、description、status（notStarted/inProgress/completed）、priority（low/medium/high）、dueDate、projectId、revision、createdAt、updatedAt、deletedAt、overdue。dueDate 为严格有效的 YYYY-MM-DD（0001–9999），不转换为 UTC 时间戳；overdue 是 Rust 按当前本地日期计算的派生值，不入库，已完成不逾期。今日视图包含截止日等于今日的任务，包括已完成；逾期视图只含未完成且截止日早于今日的任务。归档项目可关联；软删除项目不能新关联，原关联在无关编辑、任务删除及恢复时保留。

SaveReceipt：entityId、savedRevision、clientEditSequence、savedAt。前端只确认回执对应的快照，继续输入保持 dirty；请求在每个编辑会话内串行执行。保存失败不切页，冲突保留编辑稿并显示数据库稿；显式以对照 revision 提交合并稿，原数据库稿建立快照，再次冲突仍保留输入。恢复草稿不自动覆盖正文，必须对照提交或另存副本。

DocumentView：resourceId、sourceRevision、format、html（仅 Rust 生成的 Markdown HTML）、blocks、blockCount、sheets、table、warnings。blocks 为 paragraph（text、level）或 table（rows 字符串矩阵）；table 含 rowCount、columnCount、rowOffset、columnOffset、rows。DocumentCell 含 text、valueType、formula（可空，展示文本）。XLSX 保留原始行列位置，公式显示文件缓存值，不重算。阅读投影不入库，原件仍是内容权威；未修改 0001 迁移或新增文档表。

Rust 内置模块接口 `publish_generated_artifact(GeneratedArtifact)` 接受 filename、bytes、source、description、folderId、projectId。校验文件名和归属后，复用托管附件去重与短事务写入资料和来源；失败清理新孤立字节，成功返回独立 Resource。不是 Tauri 命令，UI 不提供任意路径或磁盘访问。文档编辑与 S03 命令见后文，当前基础命令 82 个，另有墨稿命令 24 个，共 106 个语义命令。

## 输入限制

- 名称去除首尾空白，1–200 Unicode 字符，拒绝 NUL；说明和来源各至多 32 KiB。标签最多 20 个，各 1–40 字符；输入去重，拒绝控制字符。
- limit=1–100，offset 至多 1,000,000；项目、资料、任务 UI 每页 20 条，关联/文件夹选择器按 100 条逐页读取；笔记、历史版本、恢复草稿 UI 每页 20 条，不再截断为最近 100 条。
- 关键字至多 200 字符，资料页搜索元数据，不搜索文件二进制或替代 S03 全局正文索引；`%` 与 `_` 按字面匹配。
- 资料 URL 解析后只允许 HTTP/HTTPS，须有主机且不含用户名/密码，至多 2048 字节；首尾空白去除，不自动抓取网页。
- 文件上限 100 MiB；检测 PNG/JPEG/GIF/WebP/PDF/UTF-8 文本，其他为 octet-stream。文本预览 ≤2 MiB、图片预览 ≤10 MiB；不预览 SVG/HTML 为可执行页面。预览失败不删除记录。
- 文档读取与生成文件 ≤20 MiB；Markdown UTF-8 ≤2 MiB；Office ZIP 每项实际解压 ≤16 MiB、总解压 ≤64 MiB、至多 4,096 项，拒绝路径穿越/符号链接/重复路径/DTD；不访问外部关系。DOCX 至多 20,000 块，每表 5,000 单元格；选定工作表或 CSV/TSV 至多 200,000 单元格，单格文字 ≤32 KiB，序列化投影 ≤4 MiB。Rust 读取串行执行并使用阻塞线程。
- read_document 行/块 offset ≤1,000,000，limit=1–100；sheetIndex=0–99，columnOffset=0–16,383，columnLimit=1–50。界面每页 50 行/块、每组 10 列；切换工作表重置分页，迟到回执不覆盖新页或新 revision。
- Markdown 原始 HTML 转义，外链/图片只保留标签文字；Word 不加载图片、宏或外部关系；Excel 不执行公式或宏。旧 DOC/XLS 提示转换或系统打开，解析失败不删除原件。
- 托管文件名为 SHA-256 加受限扩展名；导入在阻塞线程执行，通过共享串行锁避免失败清理竞争。提交失败清理新孤立字节，启动清理中断暂存与无 blob 引用的哈希文件；软删除不清理 blob。
- 读取、导出、系统打开前校验哈希与大小，拒绝符号链接和内部路径越界。导出不能覆盖工作空间内部文件；系统应用收到保留原文件扩展名的临时副本（只接受受限字母数字扩展名），副本由系统临时目录生命周期管理。
- baseRevision ≥1 且小于 JavaScript 最大安全整数；编辑序号不超过该整数。
- 正文 JSON 至多 2 MiB，结构深度 ≤32、节点 ≤100,000；schemaVersion=1。
- 允许 doc、paragraph、text、heading、bulletList、orderedList、listItem、blockquote、hardBreak、horizontalRule；格式限 bold、italic、strike、underline、link；链接允许 Tiptap 的 href/target/rel/class/title 属性，其余拒绝。链接仅接受 HTTP/HTTPS，禁止脚本节点及未知字段，HTML 不作为正文权威存储。
- 手动保存新正文、更新资料标题和建立保存前后快照在同一短事务内；自动保存不建立历史快照；任一步失败（含零行更新/插入）全部回滚。版本记录不可修改。
- 草稿不是 SQLite 正文：drafts 下以 UUID 会话命名，封套包含 formatVersion=1、workspaceId、NoteDraft 的 JSON 载荷与 SHA-256。NoteDraft 包含 sessionId/noteId/baseRevision/clientEditSequence/title/body/schemaVersion；可保留临时空标题。Rust 阻塞线程执行同步临时文件与原子替换，Unix 同步父目录；同一服务的草稿操作串行，拒绝符号链接与越界，不发送内部路径到 UI。有效载荷正文限 2 MiB，读取封套上限 8 MiB。
- 导出 TXT 含标题和纯文本；Markdown 含标题、段落、标题级别、粗体/斜体/删除线、列表、引用、换行、分隔线和 HTTP(S) 链接，并转义正文中的 HTML/Markdown 控制字符；下划线标记扁平为文字，不带标签、收藏与项目关系，不保证往返还原完整 JSON。

## 契约检查

Rust 与 TypeScript 共用 `tests/fixtures/contracts.json` 验证 camelCase、空值、枚举、UUID、错误与保存回执。Rust 反序列化同时拒绝未知字段；TypeScript strict 编译核对接口。没有引入代码生成器或任意 SQL/文件命令。


## 文档编辑命令

所有输入同样包含 requestId，未知字段拒绝。编辑会话的 id 不是磁盘路径；正文序号为 JavaScript 安全整数。

| 命令 | 输入（除 requestId） | 返回及约束 |
| --- | --- | --- |
| create_document | name、format、folderId、projectId | Resource；MD/DOCX/XLSX/CSV/TSV 空文档，保持归属校验 |
| begin_document_edit | id（资料）、baseRevision | DocumentSession；每份资料一个会话，已有草稿不覆盖 |
| get_document_session / list_document_sessions | id（会话） / offset、limit | 会话内容 / 元数据页；列表不重复返回 Markdown 正文 |
| write_markdown_draft | id、editSequence、text | DocumentSession；UTF-8/2 MiB，同序号仅同内容，旧序号拒绝 |
| preview_markdown | text | Rust 安全渲染 HTML；源文 2 MiB，HTML 4 MiB；不加载外部内容 |
| list_office_editors / open_document_editor | 无 / id（会话）、editorId | 本机编辑器列表 / 打开请求；完整编辑需本机对应应用 |
| commit_document_edit | id（会话）、baseRevision、editSequence | resource、session、SaveReceipt；原件校验、完整新文件托管、版本短事务 |
| copy_document_edit | id（会话） | 独立 Resource，保留原来源，不覆盖当前资料；20 MiB 上限 |
| end_document_edit | id（会话）、editSequence | 显式结束；Office 锁存在时拒绝；清理本会话文件 |
| list_file_versions | id（资料）、offset、limit | FileVersion 元数据页，含 sourceRevision、hash、size、createdAt |
| export_file_version | id（资料）、versionId | 原生保存对话框导出完整历史字节；校验版本归属 |
| restore_file_version | id（资料）、versionId、baseRevision | Resource；须先结束活动会话，恢复建立新 revision |

Office 编辑副本与提交限 100 MiB，DOCX/XLSX 主 XML 限 16 MiB；墨枢不转换、重建或重算 Office 文件。常见 Office 锁文件、读取时变动、主部分缺失或格式不符均拒绝提交，原件与会话保留。UI 只能发起打开请求，不能据此保证外部应用窗口已打开；外部内存中的未保存输入由所选编辑器管理。全文草稿与副本不进入默认日志；完整备份包含草稿、编辑会话与副本。


## S03 命令与格式

追加迁移 0003：platform_search_dirty 为 singleton=1 的持久脏标记；platform_recent_visits 以 entity_type/entity_id 为联合主键记录 visited_at。提交后触发器使搜索可重建，投影不是正文权威。

以下 26 个语义命令同样携带 requestId 并拒绝未知字段；空输入记为“无”。

| 命令 | 输入 | 返回与约束 |
| --- | --- | --- |
| startup_workspace | 无 | preferences、location、notice；删除/不可用入口回首页 |
| get_preferences / reset_preferences | 无 | Preferences；重置递增 revision、保留正文 |
| save_preferences | baseRevision、preferences | Preferences；冲突不覆盖 |
| save_location | location(page、entityId) | null；校验实体或模块 ready |
| search_workspace | keyword、kind、projectId、tag、offset、limit | items、hasMore、indexedAt；每项含真实 ID/revision 与有界摘要 |
| rebuild_search | 无 | null；可重建丢失的投影表 |
| dashboard | 无 | projects、notes、todayTasks、overdueTasks、today |
| list_trash | offset、limit、kind | TrashItem[]；项目/文件/链接/笔记/任务 |
| delete_impact | kind、id、baseRevision | item、resourceLinks、moduleLinks、tasks、versions、sessions、sharedBlobs |
| restore_trash / purge_trash | kind、id、baseRevision | null；活动会话阻止永久删除，共享引用保留 |
| storage_info / open_data_directory | 无 | StorageInfo / null；路径只在明确数据页展示，不进入日志 |
| export_diagnostics | 无 | 原生保存；只含版本、系统类型和错误编号 |
| list_backups / start_backup / automatic_backup | 无 | BackupRecord[] / Job / Job或null；每日成功自动备份去重、保留7份 |
| export_backup | id | null；原生外部目的选择，原子发布 |
| inspect_restore | 无 | RestorePreview；原生选择、检查后返回不透明票据 |
| start_restore | id（检查票据） | Job；先保护备份，屏障内完整替换 |
| list_jobs / cancel_job | 无 / id | Job[] / null；安全点取消，中断可见 |
| list_modules / set_module / module_access | 无 / id、enabled / id | ModuleInfo[] / ModuleInfo / ModuleInfo；访问须 ready |

Preferences 使用 platform_preferences 的 personal JSON，schema_version=1；字段为 revision、theme、fontSize、nickname、avatarResourceId、navigation、pinned、homeSections、shortcuts、onboardingComplete。主题 light/dark/system；字号14–24；昵称1–40字符；头像须有效图片资料；导航恰含10项基础入口，固定项和首页区域无重复。搜索/新笔记/保存快捷键为三个不同的单个大写字母，拒绝保留及编辑快捷键冲突。

备份 formatVersion=1，清单记录工作空间、schemaVersion、模块版本和每项路径/byteSize/SHA-256；仅 workspace.sqlite、attachments、drafts、editing 可进入包。数据库快照清空 secret_ref，排除作业和搜索派生投影；恢复前在暂存空间重建搜索。恢复展开总量≤10 GiB、项数≤100,000、清单≤16 MiB；拒绝未来格式、链接/路径越界/归一化冲突、实际大小或哈希不符、数据库完整性或外键失败、附件缺失和未知正文/偏好格式。保留的本机备份须另行导出到外部设备。

所有写入仍使用短事务、归属和 revision；长文件操作在阻塞线程，维护任务通过共享读写屏障保护。恢复票据只在当前进程有效，不接受 UI 自定义磁盘路径。模块为可信编译内置注册表，无动态插件加载；当前正式注册表交付 mogao（墨稿），默认停用，用户启用后提供页面与侧栏入口。

备份写包改为64 KiB流式读取/哈希/压缩，文件内部安全点取消；Unix恢复切换和日志发布追加目录同步。数据格式与备份格式未改变。

## S04 墨稿与通用模块引用

平台迁移 0004 新增 platform_module_links：module_id/entity_kind/entity_id/role/target_id 联合主键，project_id 或 resource_id 恰有一项。项目永久删除 CASCADE 仅解除引用；资料引用 RESTRICT，平台永久删除前明确提示先解除。可信内置模块通过 `platform::module_links` 的事务内类型接口增删查引用，不直接访问项目/资料表；封面引用须为有效图片资料。

墨稿独立迁移位于 `src-tauri/src/modules/mogao/migrations`，mogao_schema 保存每条校验值，拒绝未来版本和已变化迁移。0001 定义作品/卷章/版本/草稿/设定；0002 定义单例继续位置。平台迁移、模块迁移分开维护；完整备份检查在暂存库执行已注册模块迁移和验证，通过后才切换，再同步运行时启停状态。旧基础备份恢复时创建空墨稿并停用；墨稿迁移或校验失败不阻断平台启动。

| 表 | 权威字段与约束 |
| --- | --- |
| mogao_works | name/synopsis/goal/genre、favorite/archived、revision/settings_revision/tree_revision、时间和 deleted_at；项目/封面使用平台通用引用 |
| mogao_volumes | work_id、title、position、revision、deleted_at；有章节的卷须先移走章节才能删除 |
| mogao_chapters | work_id/volume_id、稳定 ID、title/position/status(draft/revising/final)、body_json/plain_text/schema_version=1、word_count、revision/时间/deleted_at；字数排除空白 Unicode 字符、包含标点 |
| mogao_versions | chapter_id/source_revision 唯一且不可变；title/body_json/plain_text/schema_version/created_at；手动保存和历史恢复保留前后快照 |
| mogao_drafts | 每章一个 session_id；base_revision/edit_sequence/title/body_json/schema_version/updated_at；不同会话不能覆盖，较旧序号不覆盖较新稿，清理须匹配会话和 throughSequence |
| mogao_settings | work_id/kind(character/world/outline)、title、严格 fields_json、parent_id/chapter_id、position/revision/updated_at/deleted_at；人物关联同作品，大纲父子不得循环，计划与正文事实分开 |
| mogao_location | singleton=1、work_id/chapter_id；归属校验，删除后失效位置回退 |

SettingFields 包含 aliases、description、goal、relationships、fixed、category、body、relatedCharacters、resourceIds。人物、世界观和大纲每次保存/删除/恢复递增作品 settingsRevision。引用资料由平台服务校验并保护；既有文件阅读复用 DocumentPreview，完整编辑仍使用平台资料库文档会话。

所有新增命令包含 requestId，拒绝未知字段；章节保存内层 save 使用既有 SaveNote 字段（含关联请求编号），外层 workId 再校验章节归属。

| 墨稿命令 | 关键输入与返回 |
| --- | --- |
| mogao_works / mogao_save_work / mogao_delete_work | 分页关键词/回收标志；字段及可选 id/baseRevision；软删除/恢复须作品归属与版本 |
| mogao_tree / mogao_create_node / mogao_move_node | workId；卷章类型/标题/volumeId/treeRevision；调整另带 id/baseRevision/position/status，返回元数据树 |
| mogao_delete_volume / mogao_delete_chapter | workId/id/baseRevision/deleted，保留历史与大纲关联 |
| mogao_chapter / mogao_save_chapter | workId/id → 完整当前章；workId/save → SaveReceipt，Rust 生成纯文本与字数 |
| mogao_versions / mogao_restore | workId/id → 最近100个版本；versionId/baseRevision → 新当前章 |
| mogao_draft / mogao_write_draft / mogao_clear_draft / mogao_copy_draft | 归属与会话/序号保护；恢复稿返回最后时间；另存为新章并清理原恢复稿在同一事务，失败整体回滚 |
| mogao_settings / mogao_save_setting / mogao_delete_setting | 作品设定列表；字段/父节点/关联章/位置与版本；软删除/恢复 |
| mogao_location / mogao_save_location | 无 → workId/chapterId；保存位置须同作品有效章 |
| mogao_preview_txt / mogao_import | 原生选择 UTF-8/20 MiB TXT → 分章预览；name/chapters 以整体事务创建，1–10000章，每章正文JSON仍限2 MiB |
| mogao_export | workId/chapterIds/format(txt/markdown/json)，读取保存稿一致快照，原生目的选择和临时文件原子替换 |

JSON 格式 `moshub-mogao-backup` / version=1 包含作品、卷、全部章（包括软删除）、全部历史、恢复稿与设定；关联资料使用当前空间 ID，附件字节及整库恢复使用平台 formatVersion=1 完整备份。没有旧 .mgao 或单作品 JSON 恢复命令。

ModuleLifecycle 提供通用内容类型/搜索/回收/备份校验/内容大小钩子；平台只调用接口。全局搜索回执增加可选 moduleId/workId 和 disabled，启用时搜索正文/设定，停用时仅作品名；模块页在 ready 后加载。平台和模块结果合并后分页；全局回收站依相应模块接口恢复/永久删除。

删除影响增加 moduleLinks：永久删除项目仅解除模块关联，模块内容保留；资料仍有模块引用时界面提示先解除并禁用永久删除提交，Rust 同样拒绝。


## 现有墨稿写作台 本模块格式 4

迁移 0003_studio 与 0004_studio_ai 为增量迁移，0001/0002 保持不变。平台格式仍为 4，平台不访问小说业务表。此前手动版表与入口保留。

| 表 | 持久字段与语义 |
| --- | --- |
| mogao_studio_entities | id、kind、project_id、revision、data JSON、deleted_at。kind 白名单为 projects、chapters、characters、world-settings、outlines、plot-threads、timeline-events、materials、short-stories；子项外键归属作品，读取/写入核对作用域与 revision |
| mogao_studio_versions | id、entity_id、source_revision、data。正文更新前与更新同事务保存原稿；原界面也可建立显式版本 |
| mogao_studio_state | key/value。原界面的偏好、恢复稿、角色会话与本地附录由内存快照提供同步读取，写入排队交由 Rust 保存；不使用浏览器磁盘存储保存正文，禁止密钥和令牌键 |
| mogao_studio_receipts | request_id、request_hash、response。写入幂等；同请求 ID 不同载荷拒绝 |
| mogao_studio_ai_runs | id、request_json、model、output、status、created_at、finished_at、error_code。候选与中断状态持久化；请求白名单不包含密钥，启动将 running 标记 interrupted |

正文在新的写作台中沿用原编辑器的受控 HTML 字符串；JSON 记录由模块格式管理。字数口径沿用原界面：汉字数加英文/数字词数，不含标点。章节目录列表不返回正文。之前手动版仍使用 Tiptap JSON 与非空白 Unicode 字符计数，两者不自动合并。

静态命令 `mogao_studio_request` 只接收 GET/POST/PATCH/DELETE、创作路由白名单、JSON 载荷、参数与 baseRevision；不接受 URL、SQL、通用文件路径或旧账号/计费接口。支持实体 CRUD、章节版本、人物经历命令、事实/问题命令、题材采用、作品/素材备份导入与导出、状态快照和最近生成记录。保存前后版本、revision 及来源失效处于短事务，错误完整回滚。人物经历和事实检查 SHA-256 与正文逐字引用；底色历史由 Rust 追加，旧表单不能覆写经历与历史。

`mogao_studio_ai_settings` 只返回接口、模型、凭据保存方式和是否可用；不会返回密钥。`mogao_studio_ai` 使用 Rust reqwest/OpenAI 兼容 chat/completions，Tauri Channel 传 SSE，`mogao_studio_ai_cancel` 取消指定请求。接口默认 HTTPS，仅 loopback 允许 HTTP；禁止重定向、用户信息和查询密钥。最多 2 个请求，连接/读间隔/总超时为 15/60/180 秒；消息最多 200 条、请求 2 MiB、响应 4 MiB、max_tokens 限 1–32000。单份创作记录/偏好限 4 MiB。

`mogao_studio_export` 只导出 TXT/MD/DOCX/JSON/.mgao，最大 64 MiB，原生保存对话框选目的位置，临时文件同步后替换。新写作台支持 .mgao 长篇格式 1–5、短篇格式 1 与独立素材包；导入重建 ID、在一个事务内创建作品，坏条目不会留下半本作品。作品备份只包含已采用素材，完整空间备份包括全部素材与恢复稿。平台全局搜索、模块停用和回收站均参与生命周期。

### 模块作品资料库阅读契约（2026-10-17）

静态命令 `list_module_library` 接收 keyword（200 字符内）、offset/limit（平台分页上限）；返回 items/hasMore/warnings。`read_module_library` 接收 moduleId/kind/id/sectionId，返回 entry、目录 sections、selectedId、title、纯文本 text、revision 和由模块生成的 editTarget。UUID、条目种类、作品/章节归属与软删除在 Rust 校验。平台从已注册 ModuleLifecycle 的 library/read_library 接口取得投影，不查询小说表。读取在同一数据库快照内，目录和正文不混用不同版本。

墨稿发布三类作品：mogao-studio-projects、mogao-studio-short-stories、mogao-work。章节按创作目录排序，一次只传选中章正文；HTML 仅在模块内转换为保留段落的纯文本，不改变原稿或来源哈希。空作品返回空目录与明确空态。停用时允许资料库只读，返回 disabled 标记并禁止编辑入口；数据故障拒绝读取并显示可见错误。目录无另存表、不需要 schema 迁移，作品删除/恢复/重命名及备份恢复直接反映在下一次查询。

窗口权限新增 is-fullscreen/set-fullscreen，仅供用户切换原生全屏；默认页面保留普通布局；用户点击全屏后才同步展开写作区，退出后恢复。切页/关闭保存保护不变。

## 2026-10-17 桌宠配置与命令

`platform_preferences.key='desktopPet'` 独立保存 `PetPreferences { revision, enabled, alwaysOnTop, size: small|medium|large }`，缺省 revision=1、关闭、置顶、标准。`save_pet_preferences` 在短事务校验 baseRevision 并递增版本，不修改 personal 偏好；无迁移，schema 仍为 4，完整备份包含该键。

`platform_preferences.key='desktopPetPosition'` 保存 `{ x: i32, y: i32 }`（物理像素、窗口左上角），schema_version=1，独立于 desktopPet 的 revision。写入前校验绝对值不超过 1,000,000；记录损坏或版本不符按“无位置”处理并回落到默认角落，不阻断桌宠显示。该键同样随完整备份保存和恢复。

桌面命令 `get_desktop_pet`（查询配置与实际 visible）、`save_desktop_pet`（baseRevision/preference 后应用窗口）、`pet_action`（openWorkspace/hide/recenter/greet）使用 Rust 语义接口。桌宠调用窗口仅允许查询/动作/拖动，主窗口可配置。`pet_drag` 按 dragId 串行处理 start/move/end，Rust 将逻辑指针距离换算为物理坐标并限制在所有显示器并集内，只能移动固定桌宠窗口；end 阶段尽力写入位置。所有业务正文命令对桌宠拒绝。新 page `pet` 可保存/恢复位置，但不混入旧 personal.navigation；五类导航把已有页面按职责收拢。

形象素材：`src/platform/pet/assets/<mood>-<n>.png|webp`，mood 取 idle/happy/sleeping/waving/dragging，n 从 1 递增；构建期收集为帧序列，按 idle 3fps、happy 7fps、sleeping 1.4fps、waving 8fps、dragging 1fps 播放，`prefers-reduced-motion` 时停在首帧。
