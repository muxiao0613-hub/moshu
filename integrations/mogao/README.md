# 墨稿写作界面在墨枢中的接入副本

按用户 2026-10-15 确认，从同级墨稿的现有 client 迁入书架、写作台、短篇、素材、人物与完善台界面和创作编排。原项目目录保持原样。该目录随墨枢编译，运行时无需原墨稿或任何旧服务。

安装与构建：`npm ci --prefix integrations/mogao`；根目录 `npm run build` 先构建该界面，再打包平台。`package-lock.json` 独立锁定 React 18；样式在受控同源 iframe 中隔离，避免修改平台 React 19 与普通文档编辑器。编辑器已适配 Tiptap 3，路由、HTTP 客户端与构建依赖已升级。

`src/host` 将原语义 API、同步偏好、恢复稿、AI 与导出改接父页面。Rust 只允许明确的创作路由和命令，负责 SQLite、版本、归属、快照、逐字引用、备份及网络。前端原有 localStorage 调用在启动前被 SQLite 快照与写入队列替代，未将正文保存到浏览器存储。AI SDK 仅保留类型，运行时不直接请求提供商；密钥只在输入时临时交给 Rust，使用系统凭据或会话内存。

原作者版权与非商业许可全文见 [LICENSE](LICENSE)，源码清单及校验值见 [PROVENANCE.json](PROVENANCE.json)。修改文件已标注适配日期，许可证也随应用资源交付。实际验收和剩余事项见工程 docs/evidence/s04-mogao-integration.md。
