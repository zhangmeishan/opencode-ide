# Python 数据汇总示例

只使用 Python 3 标准库，无需 pip、虚拟环境或扩展。

在该目录的原生终端运行：

```bash
python3 main.py
```

程序读取 `data.csv`，输出 6 条记录的分类汇总，总量为 150，同时生成：

- `output/summary.json`：可在编辑器直接查看的统计结果。
- `output/report.html`：可下载后用浏览器打开；IDE 内 HTML 预览需要自行安装支持的预览扩展。

也可从命令面板运行 `Tasks: Run Task` → `Run Python demo`。

自定义输入/输出目录：

```bash
python3 main.py --input data.csv --output-dir output
```

可以让右侧 OpenCode 解释程序、增加平均值统计或调整报告样式。示例不会主动调用模型，生成的 `output/` 不提交到 Git。
