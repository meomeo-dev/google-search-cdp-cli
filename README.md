# google-search-cdp-cli

English | [简体中文](README.zh-CN.md)

Google Search and page-fetch CLI built on top of a local Chrome CDP session.

The primary installed command is `google-search-cdp-cli`.
For shorter typing and backward compatibility, the package also exposes `google-search-cdp` and `google-cdp`.

## What It Does

- Builds Google advanced-search queries from structured CLI flags
- Runs Google searches through Chrome CDP and returns structured JSON
- Fetches arbitrary pages through the same Chrome session
- Converts fetched HTML into Markdown, plain text, and metadata
- Supports managed Chrome launch by cloning your current local Chrome profile into a temporary CDP session

## Requirements

- Node.js 20+
- Either:
  - an existing local Chrome started with remote debugging enabled
  - or `--clone-chrome-profile`, which clones your current Chrome user-data-dir into a temporary directory and launches a managed local CDP Chrome for the command

Default CDP endpoint:

```text
http://127.0.0.1:9222
```

Example manual Chrome launch:

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.google-search-cdp-cli-profile"
```

## Install

### Global install from a local checkout

`prepare` runs the build automatically, so you do not need to run `npm run build` first.

```sh
npm install
npm install -g .
google-search-cdp-cli --help
```

### Link during development

```sh
npm install
npm link
google-search-cdp-cli --help
```

### Publish-ready package flow

```sh
npm pack
npm publish
```

After you publish the package to npm, the expected install command is:

```sh
npm install -g google-search-cdp-cli
```

## Query Model

The `search` command treats [docs/google-advanced-search-syntax-official.md](docs/google-advanced-search-syntax-official.md) as the syntax source of truth.

- Stable official operators: `"..."`, `site:`, `-`, `filetype:`, `src:`, `imagesize:`
- Secondary official operators: `OR`, `intitle:`, `allintitle:`, `inurl:`, `allinurl:`, `allintext:`, `-filetype:`
- Compatibility operators: `intext:`, `after:`, `before:`

For grouped boolean expressions, the recommended path is structured query mode:

- atomic flags like `--exact`, `--site`, `--filetype`, `--exclude`
- grouping and logic flags like `--group-start`, `--group-end`, `--or-op`, `--not`

The CLI returns the final query string, the assembled tokens, and `query.notes` when a search depends on compatibility or grouped boolean behavior.

## Usage

### Search with structured flags

```sh
google-search-cdp-cli search chrome devtools protocol \
  --exact "remote debugging" \
  --site developer.chrome.com \
  --site pptr.dev \
  --exclude selenium \
  --filetype pdf \
  --num 5
```

### Reuse your current Chrome login and cookies safely

```sh
google-search-cdp-cli search llm agents \
  --clone-chrome-profile \
  --headless \
  --proxy socks5://127.0.0.1:1080 \
  --cdp-url http://127.0.0.1:9333 \
  --site openai.com \
  --filetype pdf
```

This clones your current Chrome user-data-dir into a temporary directory, launches a dedicated local CDP Chrome on the requested port, runs the command, then cleans up the temp profile. `--headless` and `--proxy` only apply to this managed Chrome launch path.

### Compose grouped boolean logic with flags

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

This compiles into grouped Google syntax using uppercase `OR`, implicit `AND`, and unary `-`.

### Use documented secondary operators

```sh
google-search-cdp-cli search google search \
  --allintitle "google search" \
  --allinurl "docs api" \
  --allintext "crawler indexing" \
  --exclude-filetype pdf
```

### Use `--logic` as a shortcut over the same compiler

```sh
google-search-cdp-cli search llm agents \
  --logic '("context window" | "long context") & !jobs' \
  --site openai.com
```

`--logic` is available, but it is treated as a shortcut rather than the primary query-building path.

### Append raw Google clauses

```sh
google-search-cdp-cli search llm ranking \
  --raw "AROUND(3)" \
  --raw "\"eval benchmark\""
```

### Fetch a page through Chrome CDP

```sh
google-search-cdp-cli fetch https://developer.chrome.com/docs/devtools/ \
  --selector main \
  --format markdown
```

### Development mode

```sh
npm run dev -- search chrome devtools --num 3
npm run dev -- fetch https://developer.chrome.com/docs/devtools/ --selector main
```

## Useful Flags

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
- `--intext <term>` compatibility alias
- `--allintext <clause>`
- `--src <url>` Google Images only
- `--imagesize <width>x<height>` Google Images only
- `--logic <expr>` shortcut over the grouped boolean compiler
- `--or <term>` legacy grouped OR shortcut
- `--after <YYYY-MM-DD>` compatibility
- `--before <YYYY-MM-DD>` compatibility
- `--raw <clause>`
- `--tbm <vertical>`
- `--num <count>`
- `--start <offset>`
- `--hl <lang>`
- `--gl <country>`
- `--safe <off|active>`
- `--verbatim`
- `--clone-chrome-profile`
- `--headless` managed Chrome only, requires `--clone-chrome-profile`
- `--proxy <server>` managed Chrome only, requires `--clone-chrome-profile`
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
- `--headless` managed Chrome only, requires `--clone-chrome-profile`
- `--proxy <server>` managed Chrome only, requires `--clone-chrome-profile`
- `--chrome-user-data-dir <dir>`
- `--chrome-executable-path <path>`
- `--keep-temp-chrome-profile`

## Output

Both `search` and `fetch` write JSON to stdout.

Search output includes:

- built query string
- query tokens assembled from CLI flags
- query notes about operator stability and compatibility
- Google search URL
- final URL
- result stats
- warnings
- extracted results

Fetch output includes:

- requested and final URL
- response status and headers
- page title
- HTML, text, or Markdown payloads
- extracted links

## Operational Notes

- Google may return consent, captcha, or `sorry` pages. The CLI surfaces this via `warnings` and may return zero organic results in that case.
- `--clone-chrome-profile` helps reuse your existing Chrome login and cookie state without pointing CDP at the live profile directory. It does not guarantee that Google will never return a restriction page.
- `--headless` only affects the managed Chrome launched by `--clone-chrome-profile`. It does not modify an external browser already exposed through `--cdp-url`.
- `--proxy` only affects the managed Chrome launched by `--clone-chrome-profile`. It is passed through to Chrome as `--proxy-server=...` and does not modify an external browser already exposed through `--cdp-url`.
- When using `--clone-chrome-profile`, choose an unused local `--cdp-url` port if another Chrome debug instance is already listening on the default `9222`.
- The fetched page content is DOM-based. JavaScript-rendered pages are supported as long as the page loads correctly in the connected Chrome session.
- Output may reflect the language, cookies, login state, and geo context of the Chrome profile you connect to.

## References

- [docs/google-advanced-search-syntax-official.md](docs/google-advanced-search-syntax-official.md)
