# 多设备协作指南

## 工作约定

- 以 GitHub 仓库为代码和文档的共同来源，聊天上下文本身不会通过 Git 自动同步。
- `main` 保存可接续的版本。具体功能使用 `codex/功能名` 分支。
- 换设备前提交并推送；另一设备开工前拉取。
- 避免两台设备同时在同一分支修改相同文件；并行时各用功能分支，通过合并整合。
- 提交只包含相关改动，不提交认证凭据、原题 PDF、依赖目录和临时输出。

## 首次在另一台设备上使用

安装 Git、GitHub CLI 和与项目 `.nvmrc` 一致的 Node.js（原型阶段添加版本文件）。在你自己的终端完成 GitHub 登录：

```sh
gh auth login
gh repo clone jiuxiaoyijian/mora-fireline
cd mora-fireline
```

原型的 `package.json` 与锁文件提交后，再运行：

```sh
npm ci
npm run dev
```

不要把访问令牌复制进聊天、脚本或仓库。

## 日常接续

开始前先检查本地改动，再拉取：

```sh
git status
git pull --ff-only
```

若有未提交工作，先提交到当前功能分支；若拉取报告分叉，检查差异并正常合并，不用强推覆盖另一台设备的工作。

新功能示例：

```sh
git switch -c codex/fire-feedback
```

完成后检查差异、执行适当验证、更新开发记录，再显式暂存相关文件并提交：

```sh
git diff
git add src docs
git commit -m "Improve fire spread feedback"
git push -u origin HEAD
```

## 给下一台设备上的 AI

先读 `README.md`、`AGENTS.md`、`docs/02-decisions.md`、`docs/04-devlog.md` 和实际规则文档（建立后为 `docs/07-rules.md`），再检查 Git 状态。继续处理记录中的未完成事项，不把原始提案当作已经实现的功能。

## GitHub Pages 发布阶段

初始仓库为私有。免费账号通常需要公开仓库才能使用 Pages；支持私有仓库 Pages 的付费方案需核实。私有仓库的 Pages 站点也可能公开访问。

正式发布前需要：构建通过、子路径资源正确、Pages 发布方式可用，并验证线上完整游戏流程。仓库中不存在游玩链接时，不将推测 URL 标成可玩。
