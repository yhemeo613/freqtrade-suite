# AGENTS.md · freqtrade-suite 团队开发手册

> 本文件是运行于本仓库的所有智能体(含每日定时审查会话)必须遵守的作业规范。
> 详细流程与命令示例见 [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)。

## 1. 仓库速览

- **frontend-web**:Vue 3 + TypeScript + Tailwind 4 + shadcn-vue(reka-ui)+ lightweight-charts 的中文 Web 控制台。
- **frontend-server**:freqtrade 源码(含既定范围的中文化补丁)+ `user_data`(策略、配置模板)。
- **docker-compose.yml**:ft-trade(交易 8080)/ ft-ws(webserver 8081)/ ft-web(Nginx 同源入口 5173)。
- 架构与配置说明见 `README.md`。

## 2. GitFlow 分支模型(强制)

| 分支 | 用途 |
|---|---|
| `main` | 仅存放可发布版本;每次发布打 tag `vX.Y.Z` |
| `develop` | 日常集成分支,所有功能最终汇入 |
| `feature/<name>` | 从 `develop` 拉出;完成后以 PR 合并回 `develop` |
| `release/vX.Y.Z` | 从 `develop` 拉出;验证后合并到 `main` 并打 tag,再合并回 `develop` |
| `hotfix/<name>` | 从 `main` 拉出;修复后合并回 `main` 与 `develop`,并打补丁 tag |

## 3. 提交与 PR 规范

- 提交信息使用 Conventional Commits 前缀:`feat` `fix` `docs` `refactor` `perf` `ci` `test` `chore` `style`。
- 每个逻辑变更 = 一个 `feature` 分支 + 一个 PR;PR 标题同样带前缀,描述用中文(动机 / 改动 / 验证方式)。
- 合并一律通过 GitHub PR(`gh pr create` / `gh pr merge`),禁止本地直接合并共享分支。
- 先 `gh pr list` 检查是否已有未合并的 PR:优先收尾旧 PR,再开新 PR。

## 4. 验证清单(PR 合并前必须执行)

```bash
# 前端(在 frontend-web 目录)
npm ci && npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build
# 服务端(仓库根目录)
python -m compileall -q frontend-server/freqtrade
# 编排
docker compose config --quiet
# 全栈冒烟(部署后 / 发布前,需容器已启动)
python scripts/smoke_test.py
```

- 改动涉及 `nginx.conf` / `Dockerfile` / `docker-compose.yml` 时,额外检查对应语法。
- 前端 PR 由 GitHub Actions CI(workflow 见 `.github/workflows/ci.yml`)自动验证,CI 通过视为验证充分。

## 5. 铁律

1. 操作前先 `git fetch origin`;`feature` 分支必须基于最新 `origin/develop`。
2. 禁止 force-push 共享分支(`main` / `develop` / `release/*` / `hotfix/*`)。
3. 禁止提交任何密钥:`frontend-server/user_data/config.json` 等已被 `.gitignore` 排除,绝不可 `git add`。
4. 不破坏上游 freqtrade 语义:仅允许既定范围的中文化补丁(`frontend-server/freqtrade/rpc` 等),不重写上游逻辑。
5. 发布流程必须:版本号 bump → 打 annotated tag → 创建 GitHub Release。
6. **发布合并方式**:`release/*` / `hotfix/*` → `main` 与 `release/*` → `develop` 必须使用
   merge commit(`gh pr merge --merge`),**禁止 squash**;否则 main 与 develop 历史分叉,
   后续发布会触发整树冲突。`feature/*` → `develop` 可使用 squash。
7. 不要为了刷存在感而强行改代码:没有值得做的改动时,如实汇报即可。
8. **Windows 工具注意**:修改含中文的文件时,避免用 PowerShell `Get-Content`/`Set-Content`
   正则批量改写(编码往返会破坏 UTF-8 中文,且 git 不报错);优先使用编辑工具逐处修改,
   批量改写后必须抽查 `git diff` 中的中文是否完好。网络间歇中断时,git/gh 操作要带重试。
9. **GitHub 网络代理**:本机通过 `http://127.0.0.1:7890` 访问 GitHub。git 已全局配置
   github.com 专用代理(`http.https://github.com.proxy`);`gh` CLI 命令需先在会话中设置
   `$env:HTTPS_PROXY = "http://127.0.0.1:7890"`(及 `$env:HTTP_PROXY`),否则可能连接超时。
10. **分支保护**:`main` 与 `develop` 已开启保护——必须走 PR 合并且 CI 两项检查
    (`前端(typecheck / lint / test / build)`、`服务端(Python 语法 / Compose / 配置模板校验)`)
    通过后才能合并;禁止 force-push、禁止删除分支。合并前先 `gh pr checks <num>` 等待检查完成,
    不要创建 PR 后立即合并。


## 6. 每轮周期(每日定时任务)流程

1. `git fetch origin` → 同步最新 `origin/develop` / `origin/main`。
2. 检查 GitHub 上未合并的 PR,可验证的先收尾(验证 → 合并)。
3. 审查最新代码,找出可落地的改进(缺陷 / 性能 / 视图 / 架构 / 文档 / CI)。
4. 按主题拆 `feature` 分支 → 实现 → 本地验证 → `gh pr create --base develop`。
5. 等待 CI 两项检查通过(`gh pr checks <num>`),再 `gh pr merge --squash --delete-branch`。
6. 当 `develop` 相对最近 tag 积累足够变更时,执行发布流程(见 DEVELOPMENT_WORKFLOW.md)。
7. 汇报本轮中文摘要:审查结论、PR 清单、验证结果、发布/tag 信息、下一步建议。
