# 线上部署（免费 · 常在线 · 带数据库 + 口令门）

两种运行方式，各自独立、互不影响：

| 运行方式 | 数据存哪 | 说明 |
|---|---|---|
| 本机 `node server.js` | 本机 `db/rosa.db`（SQLite） | 你自己电脑上用，功能最全 |
| **Cloudflare Pages（本指南）** | **Cloudflare D1（云端 SQLite）** | 线上常在线、跨设备同步、免费、带口令门 |
| GitHub Pages（已有） | 浏览器 localStorage | 纯离线版，没有数据库，可留作备用 |

孩子日常在线用，走 **Cloudflare Pages** 这个即可。全程免费、无需信用卡。

---

## 一次性准备

1. 注册一个 **Cloudflare** 免费账号（https://dash.cloudflare.com/sign-up ，免信用卡）。
2. 安装 Node（已装）后，装 Wrangler 命令行工具：
   ```bash
   npm install -g wrangler
   ```
3. 登录（会打开浏览器授权一次）：
   ```bash
   wrangler login
   ```

## 第 1 步 · 创建云数据库 D1

```bash
cd ~/ROSA-O-LEVEL
wrangler d1 create rosa
```
命令会输出一段 `database_id = "xxxxxxxx-...."`。把这个 id **粘贴进 `wrangler.toml`**，替换掉 `PUT-YOUR-DATABASE-ID-HERE`。（这个 id 不是密码，可以照常提交到仓库。）

## 第 2 步 · 建表

```bash
wrangler d1 execute rosa --remote --file=./schema.sql
```

## 第 3 步 · 部署站点

```bash
wrangler pages deploy .
```
第一次会让你确认项目名（用 `rosa-olevel`）。完成后给你一个网址，形如
**https://rosa-olevel.pages.dev** —— 这就是带数据库的线上地址。

## 第 4 步 · 设置访问口令（开启口令门）

```bash
wrangler pages secret put APP_PASSCODE --project-name rosa-olevel
```
按提示输入你想用的口令（例如孩子名字拼音+数字）。然后**再部署一次让口令生效**：
```bash
wrangler pages deploy .
```
之后打开网址会先要求输入口令，输对了才能进入；口令记在浏览器里（一年），不用每次输。

> 想改口令：重复第 4 步输入新口令再 deploy 即可。
> 临时关掉口令门：在 Cloudflare 后台把 `APP_PASSCODE` 这个变量删掉再 deploy。

---

## 以后更新内容

改完代码后，重新部署一条命令：
```bash
wrangler pages deploy .
```
（数据库里的学习记录不受影响，只更新页面与题库。）

## 备选：网页后台点选部署（不想用命令行）

Cloudflare 后台 → **Workers & Pages → Create → Pages → 连接 GitHub 仓库 `rosa-en`**：
- **Build command** 留空；**Build output directory** 填 `/`（根目录）。
- 部署后进入项目 **Settings**：
  - **Bindings → 添加 D1 database**：变量名 `DB`，选 `rosa`。
  - **Environment variables → 添加**：`APP_PASSCODE` = 你的口令（选 Encrypt 加密）。
- 回到 Deployments 点 **Retry/Redeploy** 一次。之后每次 `git push` 会自动重新部署。

---

## 常见问题

- **看不到「已同步」/数据没进库？** 确认第 1 步的 `database_id` 已正确填入 `wrangler.toml`，且第 2 步建表成功。打开 `你的网址/api/health` 应返回 `{"ok":true,"db":"d1"}`。
- **一直跳口令页？** 用部署后的 `https://...pages.dev` 地址访问（口令 Cookie 需要 HTTPS）。本机 `wrangler pages dev`（http）下口令门可能循环，属正常。
- **本机数据要搬到云端吗？** 不必。云端是全新起点；本机 `node server.js` 版继续独立使用。需要迁移我可以帮你导出/导入。
