# S02 文档与表格证据

日期：2026-10-11。对应 B03-D01–D05、AC03 文档子验收及 AC25 的 macOS 文件阅读部分。按用户要求扩充基础平台；六份主题文档及汇总 Markdown/Word 阅读版同步为 v1.1。S02 与整个基础版尚未整体验收。

## 实际实现

Rust `read_document` 只接收有效资料 ID、baseRevision、工作表和行列页，读取前后校验资料版本，并校验托管字节的大小与哈希。解析在线程池中执行，串行限制峰值内存，不持有长数据库事务。React 共用 DocumentPreview，显示加载、错误、重试、只读说明和格式限制；迟到回执不会覆盖更新的页或资料版本。

| 格式 | 实际展示 | 当前边界 |
| --- | --- | --- |
| MD / Markdown | 标题、段落、强调、列表、代码、表格 | UTF-8；HTML 作为文本；外链/图片仅显示标签，不自动请求 |
| DOCX | 标题、正文段落、换行与空白、简单表格，文档块分页 | 不还原图片、字体、分页、页眉、合并单元格及完整修订布局；嵌套表格拒绝 |
| XLSX | 多工作表、原始行列位置、文本/数字/布尔/错误/日期、公式文本及缓存值；行列分页 | 不重算公式或执行宏，不还原图表、合并及全部数字格式；无缓存结果明确显示 |
| CSV / TSV | UTF-8/BOM、首行、空值、引号内逗号与换行、文字形式的公式 | 不自动推导列类型或执行公式；TSV 使用制表分隔 |

文件托管仍限 100 MiB；文档读取与生成结果入库限 20 MiB，Markdown 另限 2 MiB。Office 包每项实际解压限 16 MiB、总解压限 64 MiB、至多 4,096 项，拒绝越界路径、符号链接与重复项。每格文字限 32 KiB；选中工作表/CSV 至多 200,000 格，DOCX 至多 20,000 块、每表 5,000 格；响应限 4 MiB。不向磁盘解包，不读取外部关系或执行用户脚本。损坏、超限和旧 DOC/XLS 返回明确提示，资料原件仍可系统打开或原格式导出。

`PlatformService::publish_generated_artifact(GeneratedArtifact)` 已作为 Rust 内置模块接口实现。文件名、字节、来源、说明、项目/文件夹归属经校验后复用托管去重和短事务，创建普通独立资料；提交失败清理本次新孤立字节。此接口没有暴露为通用写盘 IPC。没有实现爬虫、AI 写作、Office 编辑器或生成器界面，不能将接口测试描述为这些业务模块已交付。

## 工程结果

以下检查均实际运行并通过：

- `npm run rust -- fmt --manifest-path src-tauri/Cargo.toml --check`。
- `npm run rust -- clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`。
- `npm run rust -- test --manifest-path src-tauri/Cargo.toml --locked` 与 `--no-default-features`：分别 48 个入口通过、1 个系统凭据显式探测默认忽略。48 个入口中为 45 个实际断言测试和 3 个辅助入口；辅助入口分别用于强制退出草稿、跨时区任务和生成原生读取文件，不作为额外业务验收。
- 最后补充生成 CSV 的逐字节导出校验及 TSV 引号内制表/换行断言后，重跑 `--test documents`：5 个入口通过（4 个实际测试、1 个文件辅助入口），格式与严格 clippy 再次通过。
- `npm test`：7 个文件、26 个测试通过，其中本轮文档组件 3 个。前端桥接采用测试替身，只作为组件验证；下面另列真实 Rust 与桌面证据。
- TypeScript strict、ESLint、Vite 生产构建通过；macOS Debug `.app` 构建成功，42.13 MiB。最终主 JS 288.02 kB、编辑器 405.42 kB、CSS 17.13 kB（未压缩）。

未修改已发布迁移。Cargo.toml 精确锁定 5 个新 Rust 依赖，Cargo.lock 同步；前端锁文件原有版本保留。

## 真实文件与数据库断言

`src-tauri/tests/documents.rs` 的四个实际测试使用独立 TempDir、真实 SQLite、托管附件和实际 ZIP/XML/CSV 字节，没有 mock 解析器。

1. `markdown_and_word_read_real_managed_files_without_changing_originals`：Markdown 中文、强调和表格正确，HTML/脚本转义、图片和 href 不进入可执行 HTML。DOCX 的中文标题、保留空白/换行、删除文本排除、2×2 表格和 Unicode 字符正确；按块分页；导出字节等于原件；重开数据库可读。
2. `excel_streaming_keeps_sheet_coordinates_types_dates_cached_and_uncached_formulas`：真实双工作表 XLSX，52 行、12 列。断言中文、3.5、true、#DIV/0!、2020-01-01 日期、SUM(B2,2) 的缓存 5.5、无缓存 1+2；行列分页保留第 52 行及 L 列位置，第二张工作表可读。
3. `csv_and_generated_artifacts_keep_source_owner_bytes_and_literal_formula_data`：生成 CSV 发布入真实资料库，来源、说明、项目关联保留；引号内逗号/跨行文字正确，=HYPERLINK 文本的 formula 为空；TSV 按制表读取。重启保留哈希与行数。无效项目提交失败，附件目录只有原来成功的一个文件，没有新孤立字节。
4. `invalid_packages_limits_old_revisions_and_deleted_resources_fail_without_losing_files`：损坏 DOCX/XLSX、旧 DOC、DTD 外部实体、../ 路径、错误根节点、非 UTF-8 CSV 和 16 MiB+ 压缩内容拒绝；逐个原格式导出保持字节一致。旧 baseRevision 冲突，软删除资料不可读取。

共享 Rust/TypeScript 契约 fixture 增加 DocumentView 检查。文档组件测试验证读取命令、工作表与行列分页、缓存公式、Word 文本转义、可见错误/重试，以及后来的 revision 结果不被旧请求覆盖。

## macOS 实机

环境：本机 macOS arm64、Tauri WKWebView、Debug app，隔离测试空间 `.tools/s02-documents`。测试文件通过 Rust 辅助入口生成实际 DOCX/XLSX/Markdown，再用应用原生文件选择器导入。以下操作在桌面应用实际完成：

1. 导入 `中文文档.docx`（1,018 字节），资料详情显示“中文文档 & 表格”、两行正文、春风/3 表格以及结束字符。
2. 导入 `采集结果.xlsx`（2,111 字节），详情显示 52 行、12 列，中文/数字/布尔/错误/日期、缓存与未缓存公式可辨认。点击下一页，显示第 52 行“第五十二行”；切换“说明”工作表，显示“第二张工作表”。
3. 导入 `阅读.md`（71 字节），显示标题“阅读测试”、强调“中文排版”和春风/3 表格。
4. 退出应用，以同一隔离空间启动最终构建；三份资料仍在列表。重新读取 Excel，下一组列显示 K–L 和“第十二列”，返回 A–J 再翻页仍显示第 52 行。截图确认表格独立滚动区域和行列分页按钮可见，主窗口没有表格引起的横向溢出。完成后退出测试应用。

桌面没有运行 CSV 生成业务界面；其发布与读取证据来自上面的真实 Rust/SQLite 测试。没有用中文粘贴替代系统输入法验收。

## 文档同步与待验证

主题文档、汇总 Markdown、Word 阅读版 v1.1 已同步。Word 使用 documents 技能的打包运行时进行 OOXML 编辑与 render_docx.py 渲染；首次渲染因打包 fontconfig 未找到系统中文字体而丢字，使用隔离字体配置引用系统 Arial Unicode 后解决，保留原文档字体和样式。最终 25 页逐页 PNG 检查中文、表格、页码与分页，没有缺字或裁切；渲染 PDF/PNG 只作内部 QA，不作为发布文件。

Windows 实机、系统 IME、文件拖入、缩放、其他页面原生确认、完整 AC03/AC25 和容量性能目标仍待验证。当前只提供基本文档内容只读视图，旧 DOC/XLS 需转换或系统打开，完整 Office 编辑和排版不在此次读取实现内。备份服务在 S03 实现，不能将原件托管描述为备份恢复已完成。
