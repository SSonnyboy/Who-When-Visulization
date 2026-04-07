# Who&When数据可视化 Dashboard

这是一个用于Who&When（多Agent错误归因研究项目）的交互式可视化Dashboard，提供数据集概览、错误分析、案例详情、流程可视化等功能。

## 功能特性

### 🔄 数据集切换
- **顶部数据集切换器**：在全部数据、算法生成、手工标注三个数据集之间快速切换
- **实时更新**：切换数据集时，所有统计信息、图表和案例列表会自动更新
- **数据计数**：每个数据集按钮显示该数据集的案例数量

### 📊 数据概览
- **统计卡片**：显示当前数据集的案例总数、算法生成数量、手工标注数量、错误Agent类型数
- **难度等级分布**：饼图展示不同难度等级的分布情况
- **错误Agent分布**：横向柱状图展示Top 10错误Agent
- **错误步骤分布**：折线图展示错误发生的步骤分布
- **数据集类型分布**：饼图对比算法生成和手工标注数据

### 🔍 详细分析
- **交互式筛选**：按数据集类型、难度等级、错误Agent、错误步骤进行筛选
- **统计指标**：显示筛选结果的匹配案例数、平均错误步骤、最常见错误Agent
- **错误原因分析**：展示每个错误Agent的常见错误原因

### 📋 案例详情
- **案例列表**：可搜索、分页的案例列表
- **详细信息**：查看单个案例的完整信息，包括问题描述、正确答案、错误Agent、错误步骤、错误原因
- **对话流程**：可视化展示完整的对话历史，标记错误步骤

### 🔄 流程可视化（新功能）
- **案例选择器**：通过搜索和数据集筛选快速选择要可视化的案例
- **任务描述面板**：清晰展示案例的任务描述
- **Agent流程图**：
  - 生动的流程图展示多Agent系统的执行过程
  - 每个步骤显示Agent名称、角色和执行内容
  - 错误步骤用红色高亮显示，带有脉冲动画效果
  - 步骤之间用箭头连接，展示执行顺序
- **错误分析面板**：
  - 错误Agent名称
  - 错误步骤编号
  - 详细的错误原因说明
- **正确答案面板**：显示案例的正确答案

## 技术栈

- **HTML5**：页面结构
- **CSS3**：现代化样式，包括：
  - 深色主题
  - 渐变色设计
  - 玻璃态效果（Glassmorphism）
  - 微动画效果
  - 响应式布局
- **JavaScript (ES6+)**：交互逻辑和数据处理
- **Chart.js**：数据可视化图表

## 安装和使用

### 方法一：Cloudflare Workers 本地开发（推荐）

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **启动 Worker**：
   ```bash
   npm run dev
   ```

3. **打开 Dashboard**：
   访问 `http://127.0.0.1:8787/who_when/`

### 方法二：静态预览

如果只想预览前端页面，也可以直接启动一个 Node.js 静态服务器：

```bash
npx serve public
```

### 方法三：Cloudflare Workers JavaScript 后端部署

当前仓库使用 Cloudflare Workers 的 JavaScript 模块后端，不再依赖 Python Worker：

- `wrangler.toml`：Worker 配置文件
- `src/index.mjs`：Workers JavaScript 入口
- `package.json`：Node.js 依赖和 npm scripts
- `public/who_when/`：标准化的静态资源目录

#### 路由说明

- 目标访问地址：`https://vis.102465.xyz/who_when`
- Wrangler 中实际配置为：`vis.102465.xyz/who_when*`
- 这里使用的是 **Route**，不是 `custom_domain = true`

原因是 Cloudflare 的 Custom Domain 只能绑定整个域名或子域名，而这里要求的是子路径 `/who_when`，因此必须使用 Route。

静态资源放在 `public/who_when/` 下，Cloudflare 会直接按子目录提供页面与资源；Worker 只负责 `/who_when/api/*` 这组接口。

#### 部署前准备

1. 确保 Cloudflare 中已接入 `102465.xyz` 区域
2. 确保 `vis.102465.xyz` 有对应 DNS 记录，并且是 Cloudflare 代理状态（橙云）
3. 安装 Node.js 依赖：

   ```bash
   npm install
   ```

#### 本地开发

```bash
npm run dev
```

本地启动后，访问：

- `http://127.0.0.1:8787/who_when/`

#### 部署命令

```bash
npm run deploy
```

#### 后端 API

- `GET /who_when/api/health`：健康检查
- `GET /who_when/api/summary?lang=cn`：返回数据集摘要
- `GET /who_when/api/cases?lang=cn&dataset=all&limit=20&offset=0&search=`：分页案例列表
- `GET /who_when/api/cases/A1?lang=cn`：单案例详情

其中 `lang` 支持：

- `cn`：读取 `all-data-cn.json`
- `en`：读取 `all-data.json`

## 数据结构

每个数据案例包含以下字段：

```json
{
  "id": "案例ID",
  "dataset": "algorithm | handcrafted",
  "question": "问题描述",
  "question_ID": "问题唯一标识",
  "level": "难度等级 (1-3)",
  "ground_truth": "正确答案",
  "history": [
    {
      "content": "对话内容",
      "role": "角色",
      "name": "Agent名称",
      "step": "步骤编号"
    }
  ],
  "mistake_agent": "错误Agent",
  "mistake_step": "错误步骤",
  "mistake_reason": "错误原因",
  "system_prompt": {
    "Agent名称": "Agent系统提示"
  }
}
```

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 功能说明

### 数据集切换
点击顶部数据集切换器的按钮，在以下选项中切换：
- **全部数据**：显示所有184个案例
- **算法生成**：显示126个算法生成的案例
- **手工标注**：显示58个手工标注的案例

切换后，所有面板的数据都会相应更新。

### 导航切换
点击顶部导航栏的按钮切换不同面板：
- **概览**：查看数据集统计信息和图表
- **分析**：进行详细的数据分析和筛选
- **案例**：浏览和查看案例详情
- **流程可视化**：生动展示Agent执行流程

### 流程可视化使用
1. **选择案例**：
   - 使用搜索框输入案例ID或描述关键词
   - 选择数据集类型（全部/算法生成/手工标注）
   - 从下拉菜单中选择具体的案例

2. **查看流程**：
   - 任务描述面板显示案例的具体任务
   - Agent流程图按步骤展示执行过程
   - 红色高亮和脉冲动画标记错误步骤
   - 箭头指示执行顺序

3. **查看分析**：
   - 错误分析面板显示详细的错误信息
   - 正确答案面板显示预期的正确结果

### 筛选功能
在"分析"面板中，使用下拉菜单选择筛选条件，然后点击"应用筛选"按钮。点击"重置"按钮清除所有筛选条件。

### 案例搜索
在"案例"面板中，使用搜索框输入关键词（案例ID、问题描述、错误Agent）来搜索案例。

### 对话流程查看
在案例详情中，点击"查看完整对话流程"按钮，打开模态框查看完整的对话历史。错误步骤会用红色标记。

## 自定义样式

可以通过修改 `styles.css` 文件来自定义样式：

### 修改颜色主题
在 `:root` 部分修改颜色变量：
```css
:root {
    --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --bg-dark: #0f0f1e;
    /* ... 其他颜色变量 */
}
```

### 修改字体
修改 `--font-primary` 变量：
```css
:root {
    --font-primary: 'Your Font', sans-serif;
}
```

## 性能优化建议

1. **使用预加载数据**：对于大型数据集，建议使用 `data-loader.js` 预加载数据
2. **分页加载**：案例列表使用分页机制，避免一次性加载过多数据
3. **懒加载**：图表和详情按需加载

## 故障排除

### 数据无法加载
- 检查数据文件路径是否正确
- 确保使用本地服务器打开（直接打开HTML文件可能会遇到CORS问题）
- 检查浏览器控制台是否有错误信息

### 图表不显示
- 确保已正确加载 Chart.js 库
- 检查数据格式是否正确
- 查看浏览器控制台是否有错误信息

### 样式问题
- 清除浏览器缓存
- 检查CSS文件是否正确加载
- 确认浏览器版本是否支持使用的CSS特性

## 项目结构

```
Who-When-Visulization/
├── data-loader.js      # 数据加载器（Node.js）
├── wrangler.toml       # Cloudflare Worker 配置
├── package.json        # Node.js 依赖和 npm scripts
├── public/
│   └── who_when/
│       ├── index.html       # 主页面
│       ├── styles.css       # 样式文件
│       ├── app.js           # 应用逻辑
│       ├── all-data.json    # 英文合并数据
│       └── all-data-cn.json # 中文合并数据
├── src/
│   └── index.mjs       # JavaScript Worker 后端入口
└── README.md           # 本文档
```

## 贡献

欢迎提交问题和改进建议！
