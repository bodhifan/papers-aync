# Zotero-Dify PDF 同步插件需求分析

## 1. 项目背景与目标

### 1.1 项目背景
Zotero 是一款优秀的文献管理软件，广泛用于学术研究和知识管理。Dify 是一款强大的大型语言模型（LLM）应用开发平台，支持通过知识库增强 AI 应用的能力。目前，用户手动将 Zotero 中的文献 PDF 导入 Dify 知识库的过程繁琐且效率低下。

### 1.2 项目目标
开发一个 Zotero 插件，实现以下核心目标：
*   **自动化同步**：允许用户选择 Zotero 中的特定分类（Collection），将其中的 PDF 文档及其元数据自动同步到用户指定的 Dify 应用知识库中。
*   **提升效率**：简化文献资料从 Zotero 到 Dify 的导入流程，节省用户时间。
*   **知识赋能**：帮助用户便捷地利用 Dify 的 AI 能力对 Zotero 文献库进行深度分析、问答和内容生成。

## 2. 用户故事

*   **US1 (科研人员)**：作为一名科研人员，我希望能将 Zotero 中“我的课题A”分类下的所有 PDF 文献自动同步到 Dify 的“课题A知识库”，以便我可以通过 Dify 快速查询文献内容、总结研究进展。
*   **US2 (学生)**：作为一名学生，我希望能将 Zotero 中“课程B文献”分类下的 PDF 自动同步到 Dify 的“课程B复习资料”知识库，方便我期末时针对这些资料进行提问和学习。
*   **US3 (知识工作者)**：作为一名行业分析师，我希望能将 Zotero 中收集的行业报告、资讯PDF 同步到 Dify 的“行业洞察知识库”，用于构建我的行业知识图谱和快速生成分析摘要。

## 3. 功能需求 (Functional Requirements)

### 3.1 Zotero 插件端

#### 3.1.1 Dify 连接配置
*   **FR1.1.1**: 用户应能在 Zotero 插件设置界面输入并保存 Dify 应用的 API Key。
*   **FR1.1.2**: 用户应能在 Zotero 插件设置界面输入并保存 Dify 应用的基础 URL (例如 `https://api.dify.ai/v1`)。
*   **FR1.1.3**: 用户应能在 Zotero 插件设置界面输入并保存目标 Dify 知识库的 ID。
*   **FR1.1.4**: 插件应提供一个“测试连接”按钮，验证 API Key、URL 和知识库 ID 的有效性，并给出明确的成功或失败反馈。
*   **FR1.1.5**: API Key 等敏感信息应在本地安全存储。

#### 3.1.2 Zotero 分类选择
*   **FR1.2.1**: 插件界面应能清晰展示用户 Zotero 库中的所有分类 (Collections) 及其层级结构。
*   **FR1.2.2**: 用户应能选择一个或多个 Zotero 分类进行同步。
*   **FR1.2.3**: (可选) 用户应能选择是否包含所选分类的子分类中的文献。

#### 3.1.3 同步触发与控制
*   **FR1.3.1**: 用户应能手动触发“立即同步”操作，将选定分类中的 PDF 同步到 Dify。
*   **FR1.3.2**: (可选) 用户应能配置自动同步的频率（例如：每天、每周、从不）。
*   **FR1.3.3**: 用户应能暂停或取消正在进行的同步任务。

#### 3.1.4 同步内容与处理
*   **FR1.4.1**: 插件应能识别所选分类下条目 (Item) 的 PDF 附件。如果一个条目有多个 PDF 附件，默认同步第一个，或提供选择。
*   **FR1.4.2**: 插件应能提取 PDF 文档的以下元数据（如果存在）：
    *   标题 (Title)
    *   作者 (Creators)
    *   年份 (Year)
    *   发表刊物/出版社 (Publication Title / Publisher)
    *   摘要 (Abstract)
    *   标签 (Tags)
    *   Zotero 条目链接 (Zotero Item URI/Link) 或唯一标识符 (Item Key)
*   **FR1.4.3**: 用户应能配置哪些元数据字段被包含在同步到 Dify 的文本内容中（例如，作为文档开头的描述信息）。

#### 3.1.5 同步状态与反馈
*   **FR1.5.1**: 插件界面应实时显示同步进度（例如：正在同步 X/Y 个文档）。
*   **FR1.5.2**: 插件应为每个同步的文档显示其同步状态（等待中、上传中、处理中、成功、失败）。
*   **FR1.5.3**: 对于同步失败的文档，应提供明确的错误原因（例如：API错误、文件过大、Dify端错误信息）。
*   **FR1.5.4**: 用户应能查看详细的同步日志，包含成功和失败的条目信息及时间戳。
*   **FR1.5.5**: (可选) 插件应能提供“重试失败条目”的功能。

### 3.2 Dify API 交互

#### 3.2.1 文档上传与创建
*   **FR2.1.1**: 插件应使用 Dify 的“文件上传并创建文档”API (`/datasets/{dataset_id}/documents/upload`) 将 PDF 文件上传到指定的知识库。
*   **FR2.1.2**: 上传时，应能指定文件名。
*   **FR2.1.3**: 上传时，应能选择 Dify 知识库的处理设置（例如，默认使用知识库的预设处理规则）。

#### 3.2.2 文档元数据处理 (Dify 侧)
*   **FR2.2.1**: Zotero 提取的元数据（如标题、作者、年份等）应与 PDF 内容一同传递给 Dify。这可以通过将元数据格式化为文本，附加到 PDF 文本内容的开头，或利用 Dify 未来可能支持的自定义元数据字段。
*   **FR2.2.2**: 使用 Zotero 条目的唯一标识符 (Item Key) 或 PDF 文件的哈希值作为在 Dify 中识别文档来源和避免重复的依据。

#### 3.2.3 文档去重与更新
*   **FR2.3.1**: 在同步前，插件应检查该 Zotero 条目对应的文档是否已存在于 Dify 知识库中（基于 Zotero Item Key 或内容哈希）。
*   **FR2.3.2**: 如果文档已存在：
    *   **选项 A (默认跳过)**: 默认跳过已存在的文档，不重新上传。
    *   **选项 B (覆盖更新)**: 用户可选择覆盖 Dify 中的旧版本（如果 Zotero 中的 PDF 或元数据有更新）。这可能需要先删除 Dify 中的旧文档，再上传新版本。
*   **FR2.3.3**: 用户应能在插件设置中配置去重策略（跳过/覆盖）。

#### 3.2.4 文档删除 (可选)
*   **FR2.4.1**: (可选) 当 Zotero 中的某个条目从被监控的分类中移除或被删除时，插件应能提示用户是否要在 Dify 知识库中也删除对应的文档。

### 3.3 同步逻辑

*   **FR3.1 (首次同步)**: 用户首次对一个分类执行同步时，该分类下的所有符合条件的 PDF 文档都将被同步。
*   **FR3.2 (增量同步)**:
    *   在后续的同步中，插件应仅同步自上次成功同步以来新增或修改过的文献（基于 Zotero 条目的修改时间戳 `dateModified`）。
    *   插件需要记录每个分类上次成功同步的时间戳。
*   **FR3.3 (冲突处理)**: 明确定义当 Zotero 条目更新时，Dify 端文档的更新策略（如 FR2.3.2 所述）。

## 4. 非功能需求 (Non-Functional Requirements)

### 4.1 性能 (Performance)
*   **NFR1.1**: 插件在后台同步时不应显著影响 Zotero 的正常使用流畅度。
*   **NFR1.2**: 对于包含大量文献（例如 500+ 篇）的分类，首次同步应在合理的时间内完成。应考虑分批处理和异步操作。
*   **NFR1.3**: API 请求应有合理的超时设置和重试机制。

### 4.2 易用性 (Usability)
*   **NFR2.1**: 插件的用户界面应集成在 Zotero 界面中，风格应与 Zotero 保持一致。
*   **NFR2.2**: 配置过程应简单直观，关键信息（如 API Key, Dify 知识库 ID）有明确的输入提示。
*   **NFR2.3**: 用户操作应有清晰的反馈和引导。

### 4.3 兼容性 (Compatibility)
*   **NFR3.1**: 插件应兼容最新版本的 Zotero (Windows, macOS, Linux)。需要明确支持的 Zotero 最低版本。
*   **NFR3.2**: 插件应能正确处理常见的 PDF 文件格式和编码。
*   **NFR3.3**: 插件应遵循 Dify API 的版本规范，并考虑 API 未来可能的变更。

### 4.4 安全性 (Security)
*   **NFR4.1**: Dify API Key 必须使用 Zotero 提供的安全凭据存储机制进行加密存储，不能以明文形式存储在配置文件中。
*   **NFR4.2**: 所有与 Dify API 的通信都必须通过 HTTPS 进行。

### 4.5 可靠性与错误处理 (Reliability & Error Handling)
*   **NFR5.1**: 插件应能妥善处理网络中断、Dify API 返回错误、磁盘空间不足等异常情况。
*   **NFR5.2**: 发生错误时，应向用户提供清晰、可操作的错误信息，并记录到日志中。
*   **NFR5.3**: 避免因插件错误导致 Zotero 主程序崩溃或数据丢失。

### 4.6 资源占用 (Resource Consumption)
*   **NFR6.1**: 插件在空闲时不应占用过多 CPU 或内存资源。
*   **NFR6.2**: 同步过程中资源占用应控制在合理范围内。

## 5. 技术选型与架构考虑

### 5.1 Zotero 插件开发
*   **语言**: JavaScript
*   **核心技术**: Zotero Plugin SDK, XUL (或 HTML/JS for newer Zotero versions if applicable for UI), Zotero 对象模型 (Zotero.Items, Zotero.Collections, Zotero.Attachments, Zotero.Notifier, Zotero.Prefs, Zotero.HTTP).
*   **界面**: 考虑使用 Zotero 内置的 UI 组件或轻量级 Web 技术构建设置和状态界面。

### 5.2 Dify API 集成
*   **通信**: 使用 `Zotero.HTTP.request()` 或 Zotero 提供的其他异步 HTTP 请求方法。
*   **数据格式**: `multipart/form-data` 用于文件上传，JSON 用于其他 API 交互。
*   **API 端点**: 严格遵循 Dify 官方 API 文档。

### 5.3 数据存储 (插件内部)
*   **配置信息**: 使用 `Zotero.Prefs` 存储 API Key (安全存储), Dify URL, 知识库 ID, 同步设置等。
*   **同步状态/日志**: 可考虑使用 Zotero 内置的 SQLite 数据库或简单的 JSON 文件存储每个分类的最后同步时间、失败条目等信息（需注意 Zotero 数据目录的读写权限和策略）。

### 5.4 任务管理
*   使用 Zotero 的异步任务机制处理耗时的同步操作，避免阻塞主线程。

## 6. 未来展望 (Optional Enhancements)

*   **FE1**: 支持更细致的元数据字段映射，允许用户自定义哪些 Zotero 字段同步到 Dify 文档的哪个部分。
*   **FE2**: 支持同步 Zotero 笔记 (Notes) 到 Dify。
*   **FE3**: 支持选择 Dify 知识库的分段策略、清洗规则等高级参数。
*   **FE4**: 双向同步：当 Dify 中的知识（例如通过 AI 生成的摘要或注释）与 Zotero 条目关联时，可以考虑将其同步回 Zotero 的笔记或标签中（复杂度较高）。
*   **FE5**: 支持同步文献的关联文件（如 supplementary materials），而不仅仅是主 PDF。


curl --location --request POST 'http://www.orsalab.cn/v1/datasets/7ca56c9c-1864-4ee1-bce4-da9de88d2786/document/create_by_file' \
--header 'Authorization: Bearer dataset-SjC8WTpFOK3qj7ygFgZyBBAn' \
--form 'data={"indexing_technique":"economy","process_rule":{"rules": {"pre_processing_rules":[{"id":"remove_extra_spaces","enabled":true},{"id":"remove_urls_emails","enabled":true}],"segmentation":{"separator":"\n\n","max_tokens":500}},"mode":"custom"}};type=text/plain' \
--form 'file=@"/home/donglin/test.pdf"'