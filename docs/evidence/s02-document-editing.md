# S02 文档编辑与界面证据

日期：2026-10-12。对应 B03-D01–D07、AC03 的文档子流程及 AC12/AC25 的界面部分。六份主题文档、汇总 Markdown 与 Word 阅读版已同步为 v1.2。此记录补充上一轮 [读取证据](s02-documents.md)，不表示 S02 或基础版整体完成。

## 已实现的行为

- 资料库可新建 MD、DOCX、XLSX、CSV、TSV，保留项目/文件夹归属；MD 源文在墨枢内编辑，安全排版预览与两秒恢复草稿共用持久会话。
- Word、Excel、CSV/TSV 的编辑入口打开持久副本，使用本机已安装的 Office 应用。保存并关闭文档后由墨枢提交完整文件；内容摘要不重建 Office 文件。公式重算由 Office 完成。发布包不包含 Office 引擎，也没有在线文档服务。
- 会话在重启后可继续或另存；保存校验 baseRevision、草稿序号、归属和文件完整性。迟到回执保留后续输入；另存等待期间新增输入不会被标记为已保存或自动切页。
- 不可变历史保留初始文件及提交前后文件，支持导出和恢复。恢复创建新 revision，活动编辑会话阻止覆盖。失败的数据库更新/快照整体回滚，不返回成功；新孤立字节清理。
- 所有操作使用资料/会话/版本 ID 的语义命令，前端没有任意文件路径或 SQL 接口。新增 14 个命令，累计 56 个。新增迁移 0002，0001 未改；旧库身份、正文与附件保持。
- 统一 24/18/16/15/14/13 px 字号层级、40 px 控件和 24 px 面板间距。macOS 原生 select 使用统一外观与高度，避免仅有 min-height 时仍显得短小；筛选标签、底边和收藏项对齐。标题仍按层级区分字号。

托管和提交完整文件上限 100 MiB；DOCX/XLSX 提交只检查主 XML 的实际内容与 CRC，主部分上限 16 MiB，其他部分原样保存。旧 DOC/XLS 检查 OLE 标识，格式兼容性由外部应用决定。MD 为 UTF-8、2 MiB；安全预览响应 4 MiB。内容摘要与另存普通资料沿用 20 MiB 上限，超限工作副本仍保留。路径越界、符号链接和缺失副本拒绝；常见 Office 锁存在时拒绝提交或结束。未从外部应用内存读取尚未保存内容。

## 工程检查

以下检查在最终源码实际通过：

| 检查 | 结果 |
| --- | --- |
| Rust fmt / clippy all-targets，锁文件与离线依赖，warnings 视作错误 | 通过；最后一处开发环境启动分支的 collapsible_if 已修复 |
| Rust default 与 no-default-features 全套测试 | 两次各 53 个入口通过、1 个系统凭据探测忽略；其中 50 个实际断言测试、3 个已有辅助入口，不重复计数 |
| ESLint / 前端组件测试 | 8 个文件、32 个测试通过，新增文档编辑测试 6 个 |
| TypeScript strict / Vite 生产构建 | 通过；主 JS 302.89 kB、笔记编辑器 405.42 kB、CSS 21.08 kB，均为未压缩大小 |
| macOS arm64 Debug app | 构建成功，46.64 MiB；构建不等于公开签名分发或全阶段验收 |

复现命令：

```sh
npm run rust -- fmt --manifest-path src-tauri/Cargo.toml --check
npm run rust -- clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings
npm run rust -- test --manifest-path src-tauri/Cargo.toml --locked --offline
npm run rust -- test --manifest-path src-tauri/Cargo.toml --no-default-features --locked --offline
npm run lint
npm test
npm run tauri -- build --debug --bundles app
```

前端桥接使用测试替身，仅用于交互与回执行为；不能替代下面真实 SQLite、文件及 Office 实机检查。jsdom 的 window.scrollTo 未实现提示不影响断言。

## 真实数据断言

新增 `src-tauri/tests/document_editing.rs` 的 5 个测试使用 TempDir、实际 SQLite、托管字节和真实迁移：

1. Markdown 修改、草稿与文件版本重启恢复；共享原件不改；相同文件提交不推进版本；历史导出逐字节一致，恢复创建新版本。
2. 旧序号、同序号不同正文、旧 revision 与跨归属访问拒绝；忽略更新或快照的触发器造成事务失败并回滚；修改和会话保留，孤立字节清理；冲突可另存独立资料。
3. Office 包含媒体、样式、页眉、图表、合并及公式缓存的文件完整字节回收；原件不改、相同提交幂等；Office 锁与结束序号校验。此项是完整容器保留测试，本身不证明编辑器能生成或编辑这些元素。
4. Office 会话重启保留；缺失、符号链接、错误格式或损坏提交拒绝，原有托管内容和会话不丢失。
5. 实际版本 1 数据库升级到版本 2，保持工作空间身份与内容，并拒绝两份迁移的校验和篡改。

新增前端测试覆盖保存过程后续输入、串行 baseRevision/序号、冲突/错误回执、组合输入事件不提交、安全预览入口、结束后不再次保存已删除会话、Office 先提交后结束、新建 Word 的项目归属，以及另存过程后续输入不被清除。系统 IME 实测仍单独待验证。

## macOS 原生桌面与真实 Office

使用 Tauri WKWebView 的 Debug app，隔离空间 `.tools/s02-editing`，没有操作用户生产资料。完整 LibreOffice 26.8.0 Apple Silicon 取自官方发行文件镜像，并与发行服务器 SHA-256 核对；仅保存在忽略的 `.tools/office-preview` 下用于验证，没有加入发布包。其测试配置位于隔离工作空间，通过 debug-only 配置启动；Release 不接受此测试配置。

实际完成以下操作：

1. 在墨枢新建 `编辑与恢复测试.md`，输入中文标题、强调和春风/7 表格，保存为 revision 2。退出/重开后源文与预览一致。源文、预览双列在逻辑 1280×800 窗口显示，侧栏和顶栏保持可见。结束会话不因相同提交推进版本。
2. 展开 MD 文件历史，先将初始空文件恢复为 revision 3，再将 revision 2 的 97 字节正文恢复为 revision 4。界面保留 1–4 四个版本，正文与春风/7 表格再次出现，证明恢复产生新版本并保留双方内容。
3. 新建 `Office 正文验证.docx`，由墨枢打开完整 LibreOffice Writer。编辑中文正文、插入实际 PNG，并通过编辑器分页操作建立两页内容；保存为 DOCX、关闭文档，再回墨枢提交为 revision 2。内容摘要显示中文段落。独立只读核对文件含实际 media、分页 XML 和第二页文字，托管文件与 Office 工作副本逐字节相同，SHA-256 与数据库一致。
4. 新建 `公式与图表验证.xlsx`，由墨枢打开完整 LibreOffice Calc。在 A1 输入中文标题并合并 A1:D1；K17:L19 输入项目/数量、甲/3、乙/4，插入实际柱状图；L20 输入 `SUM(L18:L19)`，重算结果为 7。保存 XLSX、关闭，再提交为 revision 2。墨枢摘要切换 K–L 列后显示合计 7。独立只读核对 merge A1:D1、chart 部件、L20 公式与缓存 7，托管文件与副本逐字节相同，数据库 quick_check 为 ok。
5. 原生检查项目页筛选区，与用户截图对应的关键字、状态、标签控件均为统一 40 px，高度和底边一致，收藏项居中；任务页下拉、日期和文字筛选同高。桌面截图没有此区域引起的横向溢出。修复针对共享 CSS，资料页控件使用同一规则。

此处 Office 图片、分页、合并、图表和重算确由实际编辑器生成并保存，不以测试 ZIP 中放入字符串替代完整编辑验收。验证的编辑器为 macOS LibreOffice；未将其结果推广为 Microsoft Word/Excel、WPS 或所有复杂格式都已通过。

## 文档与剩余事项

六份主题文档、数据字典、依赖决策与汇总阅读版同步为 v1.2。Word 阅读版使用 documents 技能与隔离中文字体配置渲染，最终 26 页 PNG 已逐页原尺寸检查，中文、表格、页码和分页无裁切或缺字。渲染文件仅用于 QA。

Windows、系统中文 IME、1024 窗口与 125%/150% 系统缩放、Word/Excel/WPS 实机兼容、文件拖入、其他页面原生确认、完整 AC03/AC12/AC25 仍待验证。没有内嵌 Office 引擎，也没有实现爬虫、生成器业务界面或真实 AI。设置/搜索/完整回收站/备份恢复属于 S03，小说属于 S04 以后。文件历史不等于独立备份；S03 备份必须包含所引用的完整历史文件与持久会话。Debug app 未签名公证，容量与性能数字仍是验收目标。
