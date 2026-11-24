# 开发流程规范(GitFlow)

> freqtrade-suite 采用 GitFlow 分支模型 + GitHub PR 驱动的协作方式。
> 所有智能体与开发者必须按此流程操作。命令示例以 PowerShell / bash 双写。

## 1. 分支模型

```text
main ──────────────●───(v0.2.0)────●───(v0.3.0)──►  可发布、仅打 tag
                    \             /
develop ──●───●───●─/──●───●───●─/──►               集成分支
           \       /   \       /
feature ──► PR ──►    feature ──► PR ──►
```

- `main`:`git tag vX.Y.Z` 指向的每一个提交都是可发布版本。
- `develop`:日常开发集散地,永远存在。
- `feature/*`:一次只做一件事。
- `release/vX.Y.Z`:发布前从 `develop` 切出,只允许修复缺陷与版本号,禁止新增功能。
- `hotfix/*`:线上紧急修复,从 `main` 切出。

## 2. 功能开发流程

```bash
git fetch origin
git checkout develop && git pull origin develop          # 确保基于最新
git checkout -b feature/<short-name>                     # 例如 feature/ci-quality
# ... 实现 + 本地验证(见第 4 节) ...
git add <files>
git commit -m "feat: 描述本次改动"                        # Conventional Commits 前缀
git push -u origin feature/<short-name>
gh pr create --base develop --head feature/<short-name> \
  --title "feat: 描述" --body "动机 / 改动 / 验证方式"
# 等 CI 通过(或本地验证充分)后:
gh pr merge --squash --delete-branch                     # 全自动合并(本项目已授权)
```

> PR 描述一律用中文;`--squash` 保证 develop 历史整洁。

## 3. 发布流程(release)

触发条件:develop 相对最近 tag 已合并足够变更(修复 / 功能 / 优化),且本地验证与 CI 均通过。

```bash
# 1. 确定新版本号(遵循语义化版本)
#    主版本.次版本.补丁,例如上次 v0.2.0 → 本次 v0.3.0

# 2. 从 develop 切 release 分支,只允许 bump 版本号与修 bug
git checkout develop && git pull origin develop
git checkout -b release/v0.3.0
# 更新 frontend-web/package.json 的 version、README 徽章等

# 3. 验证 + 收尾
#    跑第 4 节全部验证,确认无回归

# 4. 合并到 main 并打 tag
#    关键:release → main 必须使用 merge commit(--merge),禁止 squash
#    否则 main 与 develop 的历史分叉,后续发布/合并会产生整树冲突
gh pr create --base main --head release/v0.3.0 --title "chore: release v0.3.0"
gh pr merge <PR号> --merge
git checkout main && git pull origin main
git tag -a v0.3.0 -m "Release v0.3.0: <摘要>"
git push origin main --tags

# 5. 创建 GitHub Release(写中文变更日志)
gh release create v0.3.0 --title "v0.3.0" --notes "<变更摘要>"

# 6. 合并回 develop(使用 release 分支,此时为干净合并)
gh pr create --base develop --head release/v0.3.0 --title "chore: release v0.3.0 合并回 develop"
gh pr merge <PR号> --merge --delete-branch
```

> **为什么不用 squash**:squash 会让 main 与 develop 各自持有内容相同但 SHA 不同的提交,
> 两个分支从此没有共同祖先(只剩最初提交),下一次 release 合并会触发整树冲突。
> 统一使用 merge commit 可让两分支始终共享历史。feature → develop 仍可使用 squash。

> **注意:仓库已开启 `delete_branch_on_merge`**。`release/*` 通过 PR 合入 `main` 后,
> GitHub 会**自动删除远端的 release 分支**,于是第 6 步「release → develop」就没有 head 分支可用了
> (`gh pr create --head release/vX.Y.Z` 会报找不到分支)。标准做法:
>
> ```bash
> # 合并到 main 之前确认本地分支还在(合并 PR 不会删本地分支)
> git branch --list 'release/*'
> # 需要时把本地分支重新推上去,再开合回 develop 的 PR
> git push origin release/v0.3.0
> gh pr create --base develop --head release/v0.3.0 --title "chore: release v0.3.0 合并回 develop"
> gh pr merge <PR号> --merge --delete-branch
> ```
>
> 不要在 release PR 合并后 `git pull` 才发现分支没了就改用 squash,也不要把 main 直接 merge 进 develop
> 绕过 PR —— 两者都会破坏开发流程或分支保护。


## 4. 验证清单(合并前必须全过)

| 检查项 | 命令 | 说明 |
|---|---|---|
| 前端类型检查 | `cd frontend-web && npm run typecheck` | vue-tsc 严格模式 |
| 前端代码规范 | `cd frontend-web && npm run lint` | ESLint 扁平配置 |
| 前端格式检查 | `cd frontend-web && npm run format:check` | Prettier 基线 |
| 前端单测 | `cd frontend-web && npm run test` | Vitest(纯函数层) |
| 前端构建 | `cd frontend-web && npm run build` | 产出 dist |
| 服务端语法 | `python -m compileall -q frontend-server/freqtrade` | 中文化补丁不引入语法错误 |
| 编排配置 | `docker compose config --quiet` | compose 合法 |
| 全栈冒烟 | `python scripts/smoke_test.py` | 部署后 / 发布前验证分流、安全头、gzip、健康状态 |
| Nginx 语法 | 改动 nginx.conf 时用容器或本地 nginx 校验 | — |

> GitHub Actions(`.github/workflows/ci.yml`)会在每个 PR 上自动执行前端检查,
> 以 **CI 绿勾 + 本地验证** 双保险为合并标准。

## 5. 热修复流程(hotfix)

```bash
git fetch origin
git checkout main && git pull origin main
git checkout -b hotfix/<short-name>
# 修复 → 本地验证 → push
git push -u origin hotfix/<short-name>
gh pr create --base main --head hotfix/<short-name> --title "fix: ..."
gh pr merge --squash --delete-branch
git tag -a vX.Y.Z+1 -m "Hotfix vX.Y.Z+1: ..."   # 补丁号递增
git push origin main --tags
# 再把修复同步到 develop
git checkout develop && git pull origin develop
git merge main --no-edit && git push origin develop
```

## 6. 提交信息规范

| 前缀 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `refactor` | 不改变行为的重构 |
| `perf` | 性能优化 |
| `ci` | CI / 构建配置 |
| `test` | 测试 |
| `chore` | 杂项(依赖、配置) |
| `style` | 格式(无逻辑变化) |

示例:`fix: 修复 WebSocket 断线重连的竞态`, `perf: Nginx 开启静态资源 gzip 与缓存`, `ci: 增加前端 typecheck/lint/test 流水线`。

## 7. 质量红线

- 真实密钥 / 数据库 / 日志 / 回测结果绝不入库(`.gitignore` 已排除,勿手动 add)。
- 不破坏上游 freqtrade 行为:中文化补丁保持最小侵入,命令名 / 配置键 / URL / 枚举值保持英文。
- 大改动拆小 PR;每个 PR 只解决一个问题。
- 没有值得做的改动时,如实报告,不做无意义提交。
