# ROSA · O-Level English — 100-Day Sprint to A1

面向新加坡 O-Level 英文（syllabus 1184）的 **100 天冲刺** 互动学习应用，目标 **A1/A2**。
中英双语。每天含：知识点 · 参考材料（真实链接）· 考题练习（客观题自动批改 + 阅读/写作范文）· 30 个单词 · 错题本（间隔复习，答对 2 次才“毕业”）。

## 两种运行方式

### 1) 离线文件模式（最简单）
直接双击 `index.html` 打开。学习进度、错题本存在**浏览器本地 (localStorage)**。

### 2) 数据库模式（推荐 · 数据存 SQLite）
每天的内容和学生学习情况存进本机 **SQLite** 数据库，跨浏览器/清缓存不丢，还能做学情分析。

```bash
node server.js          # 默认端口 4600，可用 PORT=xxxx 覆盖
# 浏览器打开 http://localhost:4600
```

- 零依赖：仅用 Node 内置模块（`node:http` / `node:sqlite` / `node:fs`），**无需 npm install**（需 Node ≥ 22）。
- 数据库文件：首次启动自动创建 `db/rosa.db`（含建表 + 自动植入 Day 1）。
- 页面顶部会显示 “🗄️ 已连接本地数据库 SQLite” 即表示存储生效。
- 采用**写穿透缓存**：localStorage 做即时缓存，同时异步同步到 SQLite；开机时从 SQLite 恢复。

## 数据库结构（`db/rosa.db`）

| 表 | 用途 |
|---|---|
| `student` | 学生状态：当前天/已解锁天/起始日期 |
| `day_content` | 每天生成的完整内容 JSON |
| `notebook` | 错题本（题干/选项/答案/连对次数/是否掌握） |
| `attempt` | 每次答题记录（用于学情分析、薄弱知识点） |
| `essay` | 写作提交存档 |

## REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET/POST | `/api/state` | 学生进度 |
| GET | `/api/days` · `/api/day/:n` | 取全部/单天内容 |
| POST | `/api/day` | 保存某天内容 |
| GET/POST | `/api/notebook` | 错题本读/整体保存 |
| POST | `/api/attempt` | 记录一次答题 |
| POST | `/api/essay` | 保存作文 |
| GET | `/api/stats` | 学情汇总（正确率、薄弱知识点、已掌握错题数） |

## 每天如何生成新内容

点首页「生成下一天 →」→ 弹窗给出一段为当天定制的提示词（含当日课程重点 + 你错题本里的薄弱题型）→ 发给 Claude → 把返回的 JSON 粘回导入即可解锁。JSON 结构见 `buildPrompt()`（在 `index.html` 内）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
