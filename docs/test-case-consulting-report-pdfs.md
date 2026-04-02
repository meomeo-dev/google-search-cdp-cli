# 测试用例：咨询公司 PDF 图表型报告检索

最后执行：2026-04-02

## 目标

把下面这段查询后缀和站点范围，转换为 `google-cdp-cli` 的结构化 CLI 参数，并执行一次：

```ts
const DEFAULT_QUERY_SUFFIX =
  'filetype:pdf -tax -notice -audit -privacy -careers ' +
  '(report OR outlook OR trends OR survey OR insights OR infographic ' +
  'OR "fact sheet" OR "one-pager" OR placemat OR "at a glance") ' +
  '(chart OR graph OR figure OR exhibit)';
```

网站范围：

- `bain.com`
- `bainandcompany.com`
- `bcg.com`
- `bcg-group.com`
- `analysisgroup.com`

## 等价 CLI 命令

```sh
node dist/cli.js search \
  --num 5 \
  --hl en \
  --gl us \
  --group-start \
  --site bain.com \
  --or-op \
  --site bainandcompany.com \
  --or-op \
  --site bcg.com \
  --or-op \
  --site bcg-group.com \
  --or-op \
  --site analysisgroup.com \
  --group-end \
  --filetype pdf \
  --not tax \
  --not notice \
  --not audit \
  --not privacy \
  --not careers \
  --group-start \
  report \
  --or-op \
  outlook \
  --or-op \
  trends \
  --or-op \
  survey \
  --or-op \
  insights \
  --or-op \
  infographic \
  --or-op \
  --exact "fact sheet" \
  --or-op \
  --exact "one-pager" \
  --or-op \
  placemat \
  --or-op \
  --exact "at a glance" \
  --group-end \
  --group-start \
  chart \
  --or-op \
  graph \
  --or-op \
  figure \
  --or-op \
  exhibit \
  --group-end
```

## 生成的查询字符串

```text
(site:bain.com OR site:bainandcompany.com OR site:bcg.com OR site:bcg-group.com OR site:analysisgroup.com) filetype:pdf -tax -notice -audit -privacy -careers (report OR outlook OR trends OR survey OR insights OR infographic OR "fact sheet" OR "one-pager" OR placemat OR "at a glance") (chart OR graph OR figure OR exhibit)
```

## 本次执行结果

- 执行方式：本地 Chrome CDP，`http://127.0.0.1:9222`
- 结果：查询构造正确
- Google 页面结果：命中 `https://www.google.com/sorry/...`
- CLI warning：
  - `Google may be rate-limiting this browser session.`
  - `No organic results were extracted from the current page.`

## 说明

- 这个用例展示了为什么结构化括号能力是必要的：多个 `site:` 条件必须放在同一个 `OR` 分组中，否则会被隐式 `AND` 拼接，语义不对。
- 第二组和第三组关键词也需要各自的括号分组，否则会丢失原始查询的布尔结构。
- 如果后续要把它做成正式自动化测试，更适合断言“生成的 query string 是否与预期一致”，而不是依赖 Google 在线返回结果。
