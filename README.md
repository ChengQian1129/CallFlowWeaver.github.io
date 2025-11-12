# CallFlowWeaver.github.io

## Project Rules（项目规则）

### 数据导入（JSON/JSONL）
- 必须完整导入，不允许截断；目标规模≥5000 条消息仍需保证完整性。
- 支持两种格式：
  - JSON 数组：整文件一次性 `JSON.parse`。
  - JSONL：逐行解析，自动跳过空行、`#` 与 `//` 注释，移除 BOM。
- 默认数据源：`./non5gc_rel18.final.rich.jsonl`；也可通过 URL 参数覆盖：
  - `dataset=<path>` 或 `autoload=<path>`
- 文件协议（`file://`）下因浏览器安全策略无法自动读取同目录文件，需使用页面引导的文件选择器导入。

### 存储与事件
- 原始文本持久化：`indexedDB('truth').raw` 与 `localStorage('5gc_import_text')`。
- 解析后数组持久化：`localStorage('5gc_imported_truth')`；并同时缓存至 `window.__truthCache`。
- 导入完成后派发事件：`document.dispatchEvent(new CustomEvent('truthcache-ready'))`（双发，避免首帧竞态）。

### UI 与分页
- UI 仅分页显示（默认 `itemsPerPage` 为 50），不影响数据完整性；任何分页都不应改变 `truth` 的总条数。
- 页面加载时不自动创建 Case（严格区分消息与 Case）；Case 仅由用户或 AI 操作生成。

### AI 能力（Build 页面）
- 左下角 AI 圆钮（FAB），点击弹出对话栏；再次点击收起为小圆钮，带优雅动效（渐变、弹簧曲线、遮罩过渡、模糊）。
- 支持 OpenAI 兼容接口与流式响应（SSE-like）：
  - 端点默认读取 `viewerAI` 设置（`apiUrl`/`apiKey`/`model`），可用 URL 参数覆盖：`aiUrl`、`aiKey`、`aiModel`、`openai=1`、`stream=1`。
- 生成流程：向模型发送用户需求及当前支持的 `message_ids`；解析返回 JSON 或 Markdown 反引号中的 `message_ids`，按序生成步骤。
- 优化 IE 值：AI 返回建议后实时合并到 `ie_overrides`，并在 Build 页面即时体现。
- 快捷键：
  - `Ctrl+Alt+B` 打开/关闭 AI 面板
  - `Ctrl+Enter` 提交
  - `Ctrl+Alt+G` 生成并优化
  - `Ctrl+Alt+I` 分析并应用

### 部署与 CORS
- 纯静态部署（GitHub Pages 可用）；AI 接口需满足 HTTPS 与 CORS 放行。
- 为避免 CDN 生产警告，Tailwind 将来迁移为本地构建（当前可暂用 CDN，不阻塞功能）。
- 建议启用 `.nojekyll` 以免 Pages 误处理资源路径。

### 安全要求
- 严禁在仓库中提交任何密钥（API Key 等）；仅通过运行时输入或 URL 参数传递。
- 不记录或回显敏感信息到日志或持久存储。

### 验证与测试
- 本地验证：`python -m http.server 8000` 或 `py -3 -m http.server 8000`，访问 `http://localhost:8000/`。
- 导入验证：观察页面 “Truth” 计数应与源数据条数一致；不应出现截断。
- 可选 5000 条验证入口（仅用于验证，不是正式数据源）：`?dataset=__synthetic5000`。
- AI Harness（工具页）可用于端到端测试（生成/分析/流式预览），并通过 `viewerAI` 接口与主页面交互。

### 配置约定
- 本地存储键：`5gc_import_text`、`5gc_imported_truth`、`viewerAI`、`viewerSettings`。
- 事件：`truthcache-ready`（导入后派发，供 UI 刷新）。
- 重要函数约定：
  - 解析：`parseJSONAny(text)`（支持混合文本、JSON、JSONL）。
  - 分组：`groupByProto(items)`、`groupByInterface(items)`（UI 视图分组）。
  - AI 构建流：解析 `message_ids` 并构建步骤；应用建议到 `ie_overrides`。

### 命名与位置
- AI 按钮位于左下角，与生成信令流程按钮风格一致，采用品牌化图标与动画。
- 默认数据文件位于仓库根目录：`non5gc_rel18.final.rich.jsonl`。
- 预览脚本 `bundle.js` 使用 UMD React，`index.html` 管理导入与加载逻辑。

### 性能与规模
- 解析与渲染需面向高规模消息集（≥5000）；在 UI 层采用分页与惰性刷新，避免一次性 DOM 过载。
- 流式 AI 解析时增量更新面板文本，限制面板窗口显示长度，不影响底层数据完整性。

### 工作流（建议）
- 先本地验证（导入/AI/渲染）再推送仓库，避免“盲推”。
- 提交信息指向变更目标与影响面（如 “fix: ingest JSONL skip comments; ensure autoload path ingests”）。

## 工作流细则：本地修改 → 本地验证 → 推送 GitHub → Pages 验证

### 本地修改
- 在仓库根目录进行代码更改（例如 `index.html`、`bundle.js`）。
- 任何改动都必须确保不引入数据截断；导入逻辑始终保留完整消息集合。
- 禁止在代码中写入密钥；AI 配置通过运行时设置或 URL 参数传入。

### 本地验证
- 在仓库根启动本地服务器：
  - `py -3 -m http.server 8000` 或 `python -m http.server 8000`
  - 访问 `http://localhost:8000/`
- 使用数据源参数验证：
  - `http://localhost:8000/?dataset=non5gc_rel18.final.rich.jsonl`
  - 观察页面 “Truth: <N>”，应与源数据条数一致；分页仅影响显示，不影响总量。
- 检查浏览器控制台：
  - 无 `CORS`/`Mixed Content`/`404` 等错误
  - 数据文件 `200 OK`，脚本 `bundle.js?v=<timestamp>` 正常加载
- 可选验证：`?dataset=__synthetic5000` 仅用于无截断验证（不是正式数据源）。

### 推送到 GitHub
- 使用 Git Credential Manager 登录；避免将令牌写入仓库。
- 初始化与推送：
  - `git init`
  - `git remote add origin https://github.com/ChengQian1129/CallFlowWeaver.github.io.git`
  - `git add -A`
  - `git commit -m "feat/fix: 描述本次改动"`
  - `git push -u origin main`
- 在仓库根放置 `.nojekyll`，避免 Pages 误处理资源路径。

### 启用并验证 GitHub Pages
- 启用：`Settings` → `Pages` → 选择 `Branch: main` 与 `Folder: /` → 保存。
- 访问：项目站点通常为 `https://<username>.github.io/<repo>/`。
- 验证：
  - 打开 `https://<username>.github.io/<repo>/?dataset=non5gc_rel18.final.rich.jsonl&v=<timestamp>`
  - 查看 “Truth: <N>” 与分组视图是否正确；Build 页面交互是否正常；AI 面板可按需测试（需 HTTPS+CORS）。
- 如出现缓存未更新，可在 URL 追加 `?v=<timestamp>` 强制缓存更新。

### 常见故障排查
- 404/路径不对：确认数据文件位于仓库根且大小写一致；Pages 设置分支与根目录正确。
- CORS/混合内容：AI 接口需 HTTPS 与允许跨域；不要在 Pages 中调用非 HTTPS 端点。
- 文件协议限制：不要用 `file://` 打开页面验证数据自动加载；改用本地 HTTP 服务或用文件选择器导入。

如需补充 ESLint/Prettier 等自动化规范，可在不引入构建链的前提下追加最小配置，并保持与现有代码风格一致。
