# Google 高级搜索语法与运算符整理

最后核验：2026-04-02  
范围：优先采用 Google 官方资料，且把不同“官方性 / 当前性”层级分开写清楚。

## 结论先行

- 如果只看 Google 当前面向普通搜索用户的官方帮助页和 Search Central，明确写出来的核心行内语法主要是：`"..."`、`site:`、`-`、`filetype:`、`src:`、`imagesize:`
- Google 官方还保留了 `Advanced Search` 页面，提供“全部这些字词 / 完全匹配字词 / 任意这些字词 / 排除这些字词 / 数字范围 / 站点或域名 / 文件类型 / 词语出现位置”等字段
- Google 其他官方开发者文档还记录了 `OR`、`intitle:`、`allintitle:`、`inurl:`、`allinurl:`、`allintext:`、`link:`、`info:`、`-filetype:` 等语法
- 但这些“其他官方文档”很多来自 `Programmable Search` / `XML API reference`，不等于它们都仍然是今天 `google.com` 普通搜索里最稳定、最推荐依赖的语法，所以文中单独标注为“补充 / 偏旧 / 低一档置信度”

## 1. 当前在 Google Search Help / Search Central 中明确可见的语法

| 语法 | 含义 | 作用范围 | 例子 | 备注 |
| --- | --- | --- | --- | --- |
| `"..."` | 精确匹配一个词或短语 | Google Search | `"tallest building"` | 官方博客补充说明：引号匹配不只看正文，也可能命中 meta description、ALT、URL、iframe、JS 渲染内容 |
| `site:` | 限定域名、URL 或 URL 前缀 | Google Search 全属性 | `site:youtube.com cat videos` | `site:nytimes.com` 可行，但 `site: nytimes.com` 不行 |
| `-` | 排除某个词 | Google Search | `jaguar speed -car` | 当前帮助页明确示例是排除词 |
| `filetype:` | 限定文件类型 | Google Search | `filetype:pdf llm benchmark` | Search Central 说明它既可按 `content-type`，也可按扩展名工作 |
| `src:` | 查找引用某个图片 URL 的页面 | 仅 Google Images | `src:https://example.com/media/carrot.jpg` | 不限于该图片原域名 |
| `imagesize:` | 限定图片尺寸 | 仅 Google Images | `imagesize:1200x800` | 仅对 Google Images 生效 |

## 2. 当前官方帮助页明确提供的 Advanced Search 字段

Google 当前帮助页没有把所有字段都翻译成“行内 operator 语法”，但它明确给出了 Advanced Search 能做什么。

| Advanced Search 字段 | 官方含义 | 对应行内写法 |
| --- | --- | --- |
| All these words | 结果包含你输入的所有词 | 默认就是“所有词都参与匹配”，通常不需要显式 `AND` |
| This exact word or phrase | 结果包含一个精确词或短语 | `"..."` |
| Any of these words | 结果至少包含其中一个词 | `OR`，但 `OR` 的明确语法说明来自另一份 Google 官方文档，见下文“补充语法” |
| None of these words | 结果不包含这些词 | `-term` |
| Numbers ranging from | 结果包含某个数值区间 | 当前审阅到的官方页明确有该字段，但没有在同一页给出可直接照抄的文本 operator |
| Site or domain | 限定站点或域名 | `site:` |
| File type | 限定文件格式 | `filetype:` |
| Terms appearing | 让词出现在 title / text / URL 等位置 | 当前帮助页说明了这个过滤器，但没有在同页列出对应 operator 名称 |
| Language / Region / Last update / SafeSearch / Usage rights | 进一步按语言、地区、时间、安全过滤、许可过滤 | 这些更多体现为界面筛选项，不建议在没有单独官方 operator 文档时擅自写死为行内语法 |

## 3. Google 官方开发者文档中的补充语法

这一组也来自 Google 官方文档，但主要出现在 `Programmable Search` / `XML API reference`。  
我的判断是：它们“有官方出处”，但不如上面那组那样属于当前 Google Search Help / Search Central 的一线公开列表。

| 语法 | 官方文档中的含义 | 例子 | 当前使用建议 |
| --- | --- | --- | --- |
| `OR` | 至少命中其中一个词；官方文档要求大写 | `san francisco OR sf` | 可用，但建议大写 |
| `intitle:` | 某个词必须出现在标题中 | `intitle:google search` | 有官方出处，但不是当前 Search Help 的重点列举项 |
| `allintitle:` | 查询中的所有词都出现在标题中 | `allintitle:google search` | 同上 |
| `inurl:` | 某个词必须出现在 URL 中 | `inurl:google search` | 同上 |
| `allinurl:` | 查询中的所有词都出现在 URL 中 | `allinurl:google search` | 同上 |
| `allintext:` | 查询中的所有词都出现在正文中 | `allintext:google search` | 有官方出处；当前 Search Help 只说了 “Terms appearing” 过滤器 |
| `link:` | 返回链接到某个 URL 的页面 | `link:https://example.com/` | 偏旧，谨慎依赖 |
| `info:` | 返回某个 URL 的信息页 | `info:www.google.com` | 偏旧，谨慎依赖 |
| `-filetype:` | 排除某类文件扩展名 | `llm -filetype:pdf` | 有官方出处，但不是当前 Help 页重点列举 |

## 4. 关于引号搜索，Google 官方特别提醒的细节

Google 官方博客对引号搜索补充了几个很重要的行为边界：

- 命中的文本不一定是页面可见正文，也可能来自 meta description、图片 ALT、URL、iframe，或者延后加载的 JS 内容
- 搜索结果页里的 snippet 会尽量围绕引号内容来生成，但不保证所有引号词都同时显示在 snippet 里
- 某些标点会被系统看作空格，因此带标点的精确短语未必按肉眼看到的标点边界来匹配
- 如果页面在 Google 抓取后改版，当前页面里可能已经看不到当时命中的那段文本

这意味着：`"..."` 很有用，但不能简单理解成“只匹配当前页面肉眼可见的连续字符串”。

## 5. 关于 `site:`，Google 官方明确说过的限制

- `site:` 不保证返回该前缀下所有已索引 URL
- 对大站点来说，结果通常不是“完整清单”
- 更具体的 URL 前缀有时反而比更宽泛的域名拿到更多结果
- 纯 `site:example.com` 这类查询本身没有稳定的排序含义，结果顺序不适合当成“索引质量”或“重要性”判断依据

所以，`site:` 更适合做探索、排查、抽样，而不是当作严格统计工具。

## 6. 本项目 CLI 与这些语法的关系

当前项目把一部分 Google 高级语法做成了可组合参数：

| CLI 参数 | 生成的语法 | 定位 |
| --- | --- | --- |
| `--exact` | `"..."` | stable_official |
| `--exclude` | `-term` | stable_official |
| `--site` | `site:` | stable_official |
| `--exclude-site` | `-site:` | 兼容扩展 |
| `--filetype` | `filetype:` | stable_official |
| `--src` | `src:` | stable_official，仅 Google Images |
| `--imagesize` | `imagesize:` | stable_official，仅 Google Images |
| `--or` | `(... OR ...)` | 便捷封装；`OR` 有官方次级出处，括号分组属兼容行为 |
| `--group-start` / `--group-end` | `(` / `)` | 结构化布尔组合能力；兼容行为 |
| `--and` | 显式布尔与，最终编译成空格 | 结构化布尔组合能力 |
| `--or-op` | 显式布尔或，最终编译成大写 `OR` | 结构化布尔组合能力 |
| `--not` | 显式布尔非，最终编译成前缀 `-` | 结构化布尔组合能力 |
| `--intitle` | `intitle:` | official_but_secondary |
| `--allintitle` | `allintitle:` | official_but_secondary |
| `--inurl` | `inurl:` | official_but_secondary |
| `--allinurl` | `allinurl:` | official_but_secondary |
| `--allintext` | `allintext:` | official_but_secondary |
| `--exclude-filetype` | `-filetype:` | official_but_secondary |
| `--intext` | `intext:` | common_but_not_confirmed_in_current_official_docs |
| `--after` | `after:` | compatibility |
| `--before` | `before:` | compatibility |
| `--logic` | 编译成 `AND/OR/NOT` 对应的 Google 子句 | 实验特性；分组依赖括号 |
| `--raw` | 原样拼接 | 不做校验 |

其中有四点需要特别说明：

- `intext:` 这一“单词版本”我没有在本次审阅的官方来源中直接找到；我找到的是 `allintext:`。因此，`intext:` 在本项目里可以继续保留，但应视为“实践中常见、官方当前证据弱于 `allintext:` 的语法”
- `after:` / `before:` 在 SEO 与搜索实践里很常见，但本次我没有找到足够清晰的 Google 当前官方页面来把它列入“强官方清单”，因此它们更适合作为“兼容性特性”，而不是“官方强保证”
- `--logic` 是本项目提供的布尔表达便利层，不是 Google 官方直接公开的一套完整逻辑语法。它会把 `AND` 编译为空格、把 `OR` 编译成大写 `OR`、把 `NOT` 编译成前缀 `-`，必要时加括号保留分组语义
- 当前 CLI 还支持直接用结构化 flag 组合出同样的表达式：例如用 `--group-start --exact "a" --or-op --exact "b" --group-end --not c` 来表达 `( "a" OR "b" ) AND NOT c`。这比把一整段布尔表达式塞进 `--logic` 更符合本项目“参数化拼装查询”的定位

## 7. 实务建议

- 如果目标是“最稳的 Google 官方语法”，优先用：`"..."`、`site:`、`-`、`filetype:`、`src:`、`imagesize:`
- 如果目标是做更强的研究型搜索，可以再叠加：`OR`、`intitle:`、`inurl:`、`allintext:`，但应接受它们的稳定性和公开程度低一档
- 如果目标是产品化 CLI，最好把不同 operator 标成不同级别
- 当前项目已经在 JSON 输出的 `query.notes` 中补充这类说明，用来标记 compatibility / 次级官方 / 分组逻辑 等边界

## 8. 官方来源

### 当前一线官方来源

- Google Search Help: Refine Google searches  
  https://support.google.com/websearch/answer/2466433
- Google Search Help: Do an Advanced Search on Google  
  https://support.google.com/websearch/answer/35890
- Google Search Central: Overview of Google search operators  
  https://developers.google.com/search/docs/monitor-debug/search-operators
- Google Search Central: `site:` search operator  
  https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site
- Google Search Central: Google Images search operators  
  https://developers.google.com/search/docs/monitor-debug/search-operators/image-search
- Google 官方博客：How we're improving search results when you use quotes  
  https://blog.google/products-and-platforms/products/search/how-were-improving-search-results-when-you-use-quotes/

### 补充官方来源

- Google for Developers: Rewriting Queries  
  https://developers.google.com/custom-search/docs/queries
- Google for Developers: XML API reference  
  https://developers.google.com/custom-search/docs/xml_results
