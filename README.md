# AI 想法图谱

记录我对 AI 的想法、已查到的相关研究，以及想法之间的演化链；做成一个**零克隆就能看、网页端就能扩展**的交互式图谱。

- 想法是节点，受启发/衍生关系是边（`inspiredBy` / `leadsTo`），现有研究连到论文节点。
- 访客打开页面直接看到可交互图谱：拖拽、缩放、搜索、按状态/标签筛选、点节点看详情。
- 协作者不用 clone：在 GitHub 网页端编辑 `data/ideas.json` 提 PR，或开 Issue 提议想法。

## 本地预览

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

（直接双击 `index.html` 会被浏览器的 CORS 策略拦住，因为页面要用 `fetch` 读取 `data/ideas.json`，所以必须经静态服务器或 GitHub Pages 访问。）

## 部署到 GitHub Pages

1. 把本仓库推到 GitHub。
2. 仓库 Settings → Pages → Source 选 `main` 分支、根目录（`/root`），保存。
3. 几分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`。
4. 把 `data/ideas.json` 里的 `meta.repo` 改成 `你的用户名/仓库名`，这样「提议新想法 / 参与研究」按钮才能正确跳到本仓库的 Issue 页。

## 目录结构

```
.
├── index.html              # 交互视图入口
├── assets/
│   ├── style.css           # 深色主题
│   └── app.js              # 力导向图谱 + 卡片 + 搜索/筛选/详情（零依赖）
├── data/
│   └── ideas.json          # 想法源数据（唯一需要维护的文件）
├── CONTRIBUTING.md         # 协作者怎么扩展
└── .github/
    └── ISSUE_TEMPLATE/     # 「提议新想法」模板
```

## 扩展这个图谱

只需编辑 `data/ideas.json`，按 `CONTRIBUTING.md` 的字段说明加对象即可。图谱、筛选、详情全部由数据自动生成，无需改代码。
