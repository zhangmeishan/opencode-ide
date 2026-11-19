# OpenCode IDE Workbench

提供单编辑区、Projects 导航、按需结果预览和布局恢复。仅依赖同一仓库的 OpenCode IDE Chat（`opencode-ide.opencode-ide-chat`）；不依赖独立项目 OpenCode Enhanced UI。

专属启动器开启 `opencode-ide.initializeLayout`，每个工作区首次激活时初始化布局。之后使用 VS Code 自身的布局持久化；通过命令 `OpenCode IDE: Restore Default Layout` 手动恢复。

在文件树右键选择 `OpenCode IDE: Open in Result Group` 将真实结果文件交给已有预览扩展，在当前编辑组打开。
