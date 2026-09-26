# ChatWebLLM

A tiny OpenWebUI-inspired browser interface for chatting with an LLM running on the user's own machine.

The hosted server only serves static HTML/JavaScript. **Model traffic goes directly from the user's browser to their local Ollama or OpenAI-compatible endpoint**—there is no backend proxy, database, MCP bridge, or companion service.

## Features

- Ollama and OpenAI-compatible local endpoints
- model discovery and model selection
- streaming chat when tools are not in use
- reasoning controls for compatible models/APIs
- editable system message
- text/code file attachments up to 1 MB each
- native function/tool calling
- built-in calculator and current-time tools
- `web_search` with SearXNG or Tavily
- Web tools for opening pages, image/product/business search, PDFs, and optional restaurant availability
- GenUI cards for weather, currency, time, calculator, tables, and key/value data
- IndexedDB-backed local Files library with search/read/inspect/materialize/save/move/delete tools
- user-configurable HTTP / Streamable-HTTP MCP servers
- sandboxed `run_javascript` tool with a hard timeout
- optional Nerdamer symbolic math inside the JavaScript sandbox
- optional local `run_go` and `run_go_visible` tools
- chat history and settings stored in browser `localStorage`
- dark, light, and system themes
- no server-side user data

## Architecture

```text
Tiny hosted container
  └─ BusyBox httpd serves static application files
                 │
                 ▼
           User's browser
          /      |       \
         /       |        \
 local LLM    web tools     MCP servers
    |             |
 Go runner     IndexedDB
 (optional)    file library
```

`127.0.0.1` is resolved by the **browser**, not the Docker host. That lets one hosted WebUI connect to services running locally on each user's machine.

## Run with Docker Compose

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:8080
```

The included Compose file uses intentionally small limits because the container only serves static files:

```yaml
mem_limit: 16m
cpus: 0.10
```

## Run with Docker

```bash
docker build -t chatwebllm .

docker run --rm \
  -p 8080:8080 \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --memory=16m \
  --cpus=0.10 \
  chatwebllm
```

The runtime image is based on `busybox:1.37.0-musl` and contains only BusyBox plus the static application files.

## Connect to a local model

Open **Settings** in the WebUI.

For Ollama, the default endpoint is:

```text
http://127.0.0.1:11434
```

Then use **Load models** to discover installed models or enter a model name manually.

For another local OpenAI-compatible server, choose **OpenAI-compatible**, enter its local base URL, and add an API key only if that server requires one.

### Browser security

A remotely hosted HTTPS WebUI connecting to a local HTTP/private-network endpoint can be affected by CORS, mixed-content, and Private Network Access rules.

The local LLM, search, MCP, Go runner, restaurant-availability, webpage, and PDF endpoints must allow the WebUI origin when the browser accesses them directly. This project intentionally does not add a server-side bridge or proxy.

## Tools

When tool calling is enabled, compatible models can use the enabled browser tools.

### Calculator

Evaluates basic arithmetic locally in the browser.

### Current time

Returns the browser's current local time and timezone.

### Web search

Enable **Web search** in Settings. The model receives a `web_search` tool with a query and optional result limit.

Two providers are supported:

- **SearXNG** — recommended for local/self-hosted search. Enter the JSON search endpoint, for example `http://127.0.0.1:8080/search`.
- **Tavily** — enter a Tavily API key. Requests are made directly from the browser to Tavily.

Search credentials are stored only in browser `localStorage`. If the selected search service does not allow browser CORS requests, it will not work from a remotely hosted WebUI.

### Web suite

Enable **Web suite** under **Advanced tools** to expose additional model-callable browser tools:

- `web_open` — fetch a webpage and extract readable text
- `web_image_search` — image search through the configured search provider
- `web_product_search` — product-oriented web search
- `web_business_search` — local-business-oriented web search
- `web_pdf_inspect` — extract PDF text with PDF.js, up to the configured page limit
- `web_restaurant_availability` — call a user-configured HTTP JSON availability endpoint

Product and business results are search results rather than a purchasing or maps database. Restaurant availability is only considered live when a real availability endpoint is configured; ChatWebLLM does not fabricate slots from generic search results.

For restaurant availability, set the optional endpoint in **Settings → Advanced tools**. ChatWebLLM sends JSON like:

```json
{
  "restaurant": "Example Restaurant",
  "location": "Example City",
  "party_size": 2,
  "start_date_time": "2026-10-01T19:00:00"
}
```

The endpoint must return JSON (or text) and allow browser CORS.

### GenUI

Enable **GenUI** under **Advanced tools**. The model can call `show_widget` and request one of these UI types:

- `weather` — current + short forecast using Open-Meteo
- `currency` — conversion using Frankfurter
- `time` — local browser time/timezone card
- `calculator` — calculation result card
- `table` — structured rows/columns
- `key_value` — general structured data card

Widget results are rendered directly in the chat UI. They are local ChatWebLLM widgets, not the proprietary ChatGPT GenUI runtime.

### Files library

Enable **Files library** under **Advanced tools**. Imported files are stored locally in browser IndexedDB and are not uploaded to the ChatWebLLM server.

The model can use:

- `files_list`
- `files_search`
- `files_read`
- `files_inspect`
- `files_materialize`
- `files_save`
- `files_move`
- `files_delete`

`files_materialize` places the complete stored text into the tool result for the current model context. Folder organization is logical metadata inside IndexedDB.

The settings panel also includes a small local-library browser/import control. Clearing site storage removes this local library.

### MCP servers

Enable **MCP tools** and add one or more browser-accessible HTTP / Streamable-HTTP MCP servers as JSON:

```json
[
  {
    "name": "Local MCP",
    "url": "http://127.0.0.1:3001/mcp",
    "enabled": true,
    "headers": {}
  }
]
```

Use **Discover MCP tools** to test the connection. ChatWebLLM performs MCP `initialize`, `tools/list`, and `tools/call` directly from the browser and exposes discovered tools to the local model.

There is deliberately **no MCP bridge or companion process**. `stdio` MCP servers therefore cannot be launched by this WebUI; use an MCP server that exposes HTTP / Streamable-HTTP and allows the WebUI origin through CORS.

MCP configuration and custom headers are stored in browser `localStorage`.

### JavaScript sandbox

`run_javascript` executes model-generated JavaScript in a **Web Worker created inside a sandboxed iframe**. The iframe uses an opaque origin, the worker has common network APIs disabled, and every execution has a hard timeout.

Only the structured result/error is returned to the model.

### Symbolic math with Nerdamer

Enable **JavaScript sandbox** and then **Symbolic math (Nerdamer)**. The sandbox loads Nerdamer so the model can simplify, differentiate, integrate, solve equations, and perform other algebra/calculus operations.

### Private Go

Enable **Private Go** in Settings to expose `run_go` to the model. The WebUI sends the complete Go program directly to a Go runner on the user's machine. The result is returned to the model as a tool result and is not rendered as a user-visible artifact.

Start the included runner on the same machine as the browser:

```bash
cd go-runner
go run .
```

It listens on loopback by default:

```text
http://127.0.0.1:8787/run
```

The runner is deliberately conservative:

- loopback-only binding by default
- one execution at a time
- hard execution timeout
- request and output size limits
- `GOMAXPROCS=1`
- `GOMEMLIMIT=128MiB`
- external Go module downloads disabled
- CGO disabled
- standard-library import allowlist that excludes filesystem, process, network, syscall, plugin, and unsafe packages

This reduces risk but is **not a full OS/container sandbox**. Keep it bound to loopback and do not expose the runner to an untrusted network.

### Visible Go

Enable **Visible Go** to expose `run_go_visible`. It uses the same local runner but can render structured results as tables, charts, and downloadable files.

A Go program can print normal stdout and then emit one final protocol line:

```go
fmt.Println(`CHATWEBLLM_VISIBLE:{"outputs":[{"type":"table","title":"Scores","columns":["Name","Score"],"rows":[["A",12],["B",18]]}]}`)
```

Supported output objects:

- `table` — `title`, `columns`, and `rows`
- `chart` — `title`, `xKey`, `series`, and `data`
- `file` — `name`, optional `mime`, and either text `content` or `base64`

Example chart payload:

```json
{
  "outputs": [
    {
      "type": "chart",
      "title": "Requests",
      "xKey": "day",
      "series": [{"dataKey": "count", "label": "Count"}],
      "data": [{"day": "Mon", "count": 12}, {"day": "Tue", "count": 19}]
    }
  ]
}
```

The tiny ChatWebLLM Docker image does **not** include the Go compiler or runner. This keeps server RAM/image size low; Go execution remains an optional local capability on the user's machine.

## Files and persistence

One-off chat attachments are read in the browser and appended to the user's model context. They are not uploaded to the WebUI server.

The reusable Files library uses browser IndexedDB. Settings and conversations use browser `localStorage`. Clearing browser/site storage removes them.

## Static hosting without Docker

Any static server can host the project. For example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
