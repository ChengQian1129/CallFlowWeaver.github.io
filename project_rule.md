# 项目规则（Project Rules）

## 项目概述
- 名称：CallFlowWeaver（5GC/IMS 等信令流程可视化与生成）
- 类型：纯前端静态站点（GitHub Pages 部署），无后端强依赖
- 目标：
  - 导入整理好的 JSONL 真值库（Truth）并在 Build 页构建信令流程
  - 通过 AI 生成/分析流程，按返回的消息顺序自动罗列步骤并应用 IE 建议

## 运行与部署
- 部署：GitHub Pages（仓库根目录发布），根目录包含 `index.html`、`bundle.js`、数据集 *.jsonl
- 缓存：页面加载 `bundle.js` 使用时间戳参数以尽量规避 CDN/浏览器缓存
- 预览：直接访问仓库 Pages 网址；必要时在 URL 追加 `?v=<timestamp>` 强制刷新

## 数据导入策略
- 默认数据集：根目录 `non5gc_rel18.final.rich.jsonl` 自动拉取导入
- 兼容 file://：本地打开时提供文件选择覆盖层，使用 `FileReader` 导入
- 存储与同步：
  - 大体积数据优先写入 IndexedDB；`localStorage` 用于轻量标记与 UI 状态
  - 应用挂载后监听导入事件并刷新左侧 Truth 统计，避免首帧竞态
- 初始画布种子：导入成功且当前画布为空时，默认放置 10 条消息作为示例步骤

## AI 集成功能
- API：OpenAI 兼容接口（`/v1/chat/completions`），支持流式（SSE）与普通模式
- 配置：
  - 默认启用 `aiApiUrl=https://x666.me/v1`、`aiModel=gemini-2.5-pro`、OpenAI 兼容、Streaming
  - 密钥不写入仓库；可通过页面表单或 URL 参数注入：`aiUrl`、`aiKey`、`aiModel`、`aiOpenAI`、`aiStream`
- Build 页交互：
  - AI Build 弹窗（`Ctrl+Alt+B`）输入需求，随附所有支持的消息 ID 给 AI；解析返回的 `message_ids` 或 Markdown 反引号中的 ID，按序构建步骤
  - AI Analyze 用于一致性建议并应用 IE 覆盖值
- 现行约束：按要求已移除离线兜底；AI失败时提示错误，不自动改动画布

## 开发协作规则
- 任何改动都必须同步到 Git 仓库：
  - 本地修改 → `git add` → `git commit`（规范信息）→ `git push origin main`
  - Pages 站点更新依赖于推送；完成改动后务必推送
- 避免在代码仓库写入任何敏感信息（API Key、Token 等）；仅支持运行时注入
- 避免引入阻塞 UI 的同步操作；优先异步 fetch 与事件驱动刷新
- 保持组件/函数命名清晰，禁止在生产日志中输出敏感字段

## 安全与密钥
- 密钥绝不硬编码到仓库或脚本中；仅通过：
  - 工具页表单一次性输入（存储于浏览器本地，仅用户侧）
  - URL 参数临时注入（仅浏览器侧可见；不进入仓库）
- HTTPS 站点调用非 HTTPS 端点会被浏览器阻止；建议统一使用 HTTPS

## 版本与提交规范
- 分支：`main`
- 提交信息：清晰说明改动类型与内容（如 `feat:`、`fix:`、`chore:` 等）
- 远端验证：推送后在 Pages 站点自查（必要时追加版本参数强制刷新）

## 验证与预览
- 工具页：`tools/test_ai_harness.html` 用于端到端验证生成/分析与流式回显
- 交互事件：
  - 导入完成事件触发 UI 重新读取数据并刷新统计
  - Build 页快捷键 `Ctrl+Alt+B` 打开 AI Build 弹窗；（FAB 小圆按钮也用于展开/收起）

## 变更记录要点（示例）
- `feat: AI Build modal (Ctrl+Alt+B) + 解析 Markdown 反引号 ID`
- `chore: remove offline AI fallbacks per request`
- `feat: seed more steps in default/autoload/fallback cases (10 items)`
- `fix: GitHub Pages 默认数据集导入竞态与存储配额防护`

## 约定总则
- 项目所有改动、需求实现与规则更新，必须在完成后第一时间推送到 Git 远端，并在 Pages 站点完成在线验证。
