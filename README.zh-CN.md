# google-search-cdp-cli

[English](README.md) | 简体中文

一个基于本地 Chrome CDP 会话的 Google 搜索与网页抓取 CLI。

主命令名是 `google-search-cdp-cli`。
为了更短的输入和向后兼容，包里也保留了 `google-search-cdp` 和 `google-cdp` 这两个别名。

## 功能

- 通过结构化参数生成 Google 高级搜索查询
- 通过 Chrome CDP 执行 Google 搜索并返回结构化 JSON
- 通过同一个 Chrome 会话抓取任意网页
- 将抓取到的 HTML 转换为 Markdown、纯文本和元数据
- 支持复制当前本地 Chrome profile 到临时目录，再启动受控 CDP Chrome

## 环境要求

- Node.js 20+
- 满足以下任一条件：
  - 已有一个开启 remote debugging 的本地 Chrome
  - 使用 `--clone-chrome-profile`，把当前 Chrome 的 `user-data-dir` 复制到临时目录，再为这次命令启动一个受控的本地 CDP Chrome

默认 CDP 地址：

```text
http://127.0.0.1:9222
```

手动启动 Chrome 示例：

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.google-search-cdp-cli-profile"
```

## 安装

### 从本地仓库全局安装

`prepare` 会自动执行构建，因此不需要先手工 `npm run build`。

```sh
npm install
npm install -g .
google-search-cdp-cli --help
```

### 开发阶段使用 `npm link`

```sh
npm install
npm link
google-search-cdp-cli --help
```

### 面向发布的打包流程

```sh
npm pack
npm publish
```

发布到 npm 之后，预期安装方式是：

```sh
npm install -g google-search-cdp-cli
```

## 查询模型

`search` 命令以 [docs/google-advanced-search-syntax-official.md](docs/google-advanced-search-syntax-official.md) 作为语法基准。

- 稳定官方语法：`"..."`、`site:`、`-`、`filetype:`、`src:`、`imagesize:`
- 次级官方语法：`OR`、`intitle:`、`allintitle:`、`inurl:`、`allinurl:`、`allintext:`、`-filetype:`
- 兼容语法：`intext:`、`after:`、`before:`

对于带括号的布尔表达式，推荐使用结构化参数模式：

- 原子参数：`--exact`、`--site`、`--filetype`、`--exclude`
- 逻辑和分组参数：`--group-start`、`--group-end`、`--or-op`、`--not`

CLI 会返回最终 query string、拼装 token，以及在使用兼容语法或分组布尔逻辑时输出 `query.notes`。

## 用法

### 使用结构化参数搜索

```sh
google-search-cdp-cli search chrome devtools protocol \
  --exact "remote debugging" \
  --site developer.chrome.com \
  --site pptr.dev \
  --exclude selenium \
  --filetype pdf \
  --num 5
```

### 安全复用当前 Chrome 的登录态和 cookies

```sh
google-search-cdp-cli search llm agents \
  --clone-chrome-profile \
  --headless \
  --proxy socks5://127.0.0.1:1080 \
  --cdp-url http://127.0.0.1:9333 \
  --site openai.com \
  --filetype pdf
```

这会把当前 Chrome 的 `user-data-dir` 复制到临时目录，启动一个独立的本地 CDP Chrome，执行命令，然后默认清理临时 profile。`--headless` 和 `--proxy` 都只作用于这条托管启动路径。

### 通过参数组合括号和布尔逻辑

```sh
google-search-cdp-cli search llm agents \
  --group-start \
  --exact "context window" \
  --or-op \
  --exact "long context" \
  --group-end \
  --not jobs \
  --site openai.com
```

这会被编译为带大写 `OR`、隐式 `AND` 和前缀 `-` 的 Google 查询语法。

### 使用次级官方 operator

```sh
google-search-cdp-cli search google search \
  --allintitle "google search" \
  --allinurl "docs api" \
  --allintext "crawler indexing" \
  --exclude-filetype pdf
```

### 使用 `--logic` 作为同一编译器的快捷写法

```sh
google-search-cdp-cli search llm agents \
  --logic '("context window" | "long context") & !jobs' \
  --site openai.com
```

`--logic` 仍然可用，但它被视为快捷写法，而不是主要的查询构造路径。

### 追加原始 Google 子句

```sh
google-search-cdp-cli search llm ranking \
  --raw "AROUND(3)" \
  --raw "\"eval benchmark\""
```

### 通过 Chrome CDP 抓取页面

```sh
google-search-cdp-cli fetch https://developer.chrome.com/docs/devtools/ \
  --selector main \
  --format markdown
```

### 开发模式

```sh
npm run dev -- search chrome devtools --num 3
npm run dev -- fetch https://developer.chrome.com/docs/devtools/ --selector main
```

## 常用参数

Search:

- `--exact <phrase>`
- `--or-op`
- `--and`
- `--not`
- `--group-start`
- `--group-end`
- `--exclude <term>`
- `--site <domain>`
- `--exclude-site <domain>`
- `--filetype <ext>`
- `--exclude-filetype <ext>`
- `--intitle <term>`
- `--allintitle <clause>`
- `--inurl <term>`
- `--allinurl <clause>`
- `--intext <term>` 兼容别名
- `--allintext <clause>`
- `--src <url>` 仅 Google Images
- `--imagesize <width>x<height>` 仅 Google Images
- `--logic <expr>` 分组布尔编译器的快捷入口
- `--or <term>` 旧的分组 OR 快捷方式
- `--after <YYYY-MM-DD>` 兼容语法
- `--before <YYYY-MM-DD>` 兼容语法
- `--raw <clause>`
- `--tbm <vertical>`
- `--num <count>`
- `--start <offset>`
- `--hl <lang>`
- `--gl <country>`
- `--safe <off|active>`
- `--verbatim`
- `--clone-chrome-profile`
- `--headless` 仅作用于托管 Chrome，且必须配合 `--clone-chrome-profile`
- `--proxy <server>` 仅作用于托管 Chrome，且必须配合 `--clone-chrome-profile`
- `--chrome-user-data-dir <dir>`
- `--chrome-executable-path <path>`
- `--keep-temp-chrome-profile`

Fetch:

- `--selector <css>`
- `--format <markdown|text|html|all>`
- `--wait-until <load|domcontentloaded|networkidle0|networkidle2>`
- `--timeout <ms>`
- `--max-links <count>`
- `--clone-chrome-profile`
- `--headless` 仅作用于托管 Chrome，且必须配合 `--clone-chrome-profile`
- `--proxy <server>` 仅作用于托管 Chrome，且必须配合 `--clone-chrome-profile`
- `--chrome-user-data-dir <dir>`
- `--chrome-executable-path <path>`
- `--keep-temp-chrome-profile`

## 输出

`search` 和 `fetch` 都会把 JSON 写到 stdout。

Search 输出包括：

- 最终 query string
- 由 CLI 参数拼装出的 query token
- 关于语法级别和兼容性的 query notes
- Google search URL
- 最终落地 URL
- 结果统计
- warnings
- 抽取到的搜索结果

Fetch 输出包括：

- 请求 URL 和最终 URL
- 响应状态与响应头
- 页面标题
- HTML / text / Markdown 内容
- 抽取到的链接

## 运行说明

- Google 可能返回 consent、captcha 或 `sorry` 页面。CLI 会通过 `warnings` 暴露这类情况，并可能返回 0 条自然结果。
- `--clone-chrome-profile` 可以复用你当前 Chrome 的登录态和 cookies，同时避免把 CDP 直接指向正在使用的真实 profile 目录。但这并不保证 Google 永远不会返回限制页。
- `--headless` 只影响由 `--clone-chrome-profile` 启动的托管 Chrome，不会修改一个已经通过 `--cdp-url` 暴露出来的外部浏览器。
- `--proxy` 只影响由 `--clone-chrome-profile` 启动的托管 Chrome。它会被透传为 Chrome 的 `--proxy-server=...` 启动参数，不会修改一个已经通过 `--cdp-url` 暴露出来的外部浏览器。
- 使用 `--clone-chrome-profile` 时，如果默认 `9222` 已被占用，请显式指定一个空闲的本地 `--cdp-url` 端口。
- 页面抓取基于 DOM，前提是页面能在连接的 Chrome 会话中正常加载，因此支持大部分 JS 渲染页面。
- 输出结果会受到所连接 Chrome profile 的语言、cookies、登录状态和地理环境影响。

## 参考

- [docs/google-advanced-search-syntax-official.md](docs/google-advanced-search-syntax-official.md)
