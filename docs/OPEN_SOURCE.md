# 开源评估报告

> 评估时间：2026-11-23 · 评估对象：`yhemeo613/freqtrade-suite`
> 结论：**具备开源条件**，审计发现的 3 项问题已全部处理（详见下文「修复记录」）。

## 一、结论摘要

| 维度 | 结论 | 说明 |
|---|---|---|
| 凭证/密钥泄露 | ✅ 未发现 | git 历史全量 blob 扫描：0 个 Telegram token / 私钥 / OKX key / 真实 JWT |
| 敏感文件 | ✅ 未入库 | `config.json`、`*.sqlite`、`data/`、`logs/`、`.env`、构建产物均在 `.gitignore` |
| 内网信息 | ✅ 已修复 | `package-lock.json` 的 145 处内网 registry 地址已替换为公共源；开源发布使用干净历史 |
| 截图/文档 | ✅ 干净 | 登录页截图密码已掩码、无真实地址/凭据 |
| 许可证 | ✅ 已补 | 根目录 GPL-3.0 `LICENSE`；8 个无上游 LICENSE 的策略已移出仓库、改为按需获取 |
| 运行安全 | ✅ 良好 | 默认 dry_run、服务绑定 127.0.0.1、占位符 fail-fast、安全响应头、镜像 digest 钉版 |

## 二、已执行的检查与修复

### 修复 1：lockfile 内网地址（145 处）

`frontend-web/package-lock.json` 的 `resolved` 字段曾指向内网 npm registry（私有网段地址），
泄露内部基础设施信息。已全部替换为 `https://registry.npmmirror.com/`，`npm ci` 验证通过。

> 该内网地址仍存在于早期私有 git 历史中；本次开源发布采用「孤儿提交」方式，
> 公开仓库不包含任何旧历史（见第四节）。

### 修复 2：根目录 LICENSE

- 新增根目录 `LICENSE`（GPL-3.0 全文，与 freqtrade 一致）
- README「License」章节补充依赖与第三方策略许可说明

### 修复 3：无 LICENSE 的第三方策略

8 个上游无 LICENSE 的策略（`ClucHAnix`、`ClucHAnix_5m`、`E0V1E`、`E0V1EN`、
`MarketStructureCHOCH`、`NASOSv4`、`NASOSv5_mod3`、`TrendLines`）已移出仓库，
不做再分发；需要时通过 `scripts/fetch_optional_strategies.py` 由用户在本机自行获取
（脚本自动应用兼容补丁，文件被 `.gitignore` 忽略）。

### 检查 4：历史扫描（1098 个 blob）

使用 `git cat-file --batch` 遍历全部历史对象，匹配以下模式，结果均为 **0 命中**：
Telegram bot token、私钥、OKX API key（UUID 形态）、真实 JWT secret、`config.json` / `*.sqlite` / `.env` 提交记录。

## 三、遗留风险与建议

### 3.1 无 LICENSE 的第三方策略（已处理）

已从仓库移出并改为按需获取（见「修复 3」）。可选后续动作：联系上游作者取得授权后重新收录。

### 3.2 文档中的内部环境信息（低风险）

- `AGENTS.md` / `CHANGELOG.md` 提及回环地址代理（`127.0.0.1`），非敏感信息
- `AGENTS.md` 为团队内部作业手册，已保留（对贡献者有参考价值）

### 3.3 旧历史（已隔离）

早期私有历史中的内网 npm registry 地址只存在于旧仓库（已归档为私有），
公开仓库以「孤儿提交」发布，不包含任何旧历史。

### 3.4 开源后的使用安全提示（写入 README 已有）

- 用户必须替换 `api_server.username/password`、`jwt_secret_key`、Telegram token
- 保持 `dry_run: true`，实盘前复核仓位/杠杆/风控
- 不提交本地 `config.json`

## 四、公开仓库发布方式（已执行）

采用「孤儿提交 + 新公开仓库」方式，公开仓库不携带私有历史：

```powershell
# 1) 备份私有历史
git bundle create freqtrade-suite-private.bundle --all

# 2) 旧仓库归档(改名 + 保持 private),新建同名 public 仓库
gh repo rename freqtrade-suite-archive --repo yhemeo613/freqtrade-suite
gh repo create yhemeo613/freqtrade-suite --public

# 3) 从清理后的工作区构建孤儿提交并推送
git checkout --orphan public-main
git add -A
git commit -m "chore: initial public release v1.0.0"
git push public public-main:main
git push public public-main:develop

# 4) 打 tag 并创建 Release
git tag -a v1.0.0 -m "v1.0.0"
git push public v1.0.0
gh release create v1.0.0 --repo yhemeo613/freqtrade-suite
```

发布后建议：

1. 开启 GitHub 分支保护（`main` / `develop`）+ 必需 CI 检查
2. 启用 Dependabot / code scanning
3. 在 README 顶部加 License / CI / 安全提示徽章
4. 对策略文件逐个核对上游许可（`_SOURCES.md` 已记录 commit 与许可）
