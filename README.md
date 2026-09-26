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
- user-configurable HTTP / Streamable-HTTP MCP servers
- sandboxed `run_javascript` tool with a hard timeout
- optional Nerdamer symbolic math inside the JavaScript sandbox
- chat history and settings stored in browser `localStorage`
- dark, light, and system themes
- no server-side user data

## Architecture

```text
Tiny hosted container
  └─ BusyBox httpd serves index.html + app.js
                 │
                 ▼
           User's browser
          /      |       \
         /       |        \
 local LLM    web search    MCP servers
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

The local LLM, search, and MCP servers must allow the WebUI origin. This project intentionally does not add a server-side bridge or proxy.

## Tools

When tool calling is enabled, compatible models can use the enabled browser tools.

### Calculator

Evaluates basic arithmetic locally in the browser.

### Current time

Returns the browser's current local time and timezone.

### Web search

Enable **Web search** in Settings. The model receives a `web_search` tool with a query and optional result limit.

Two providers are supported:

- **SearXNG** — recommended for local/self-hosted search. Enter the JSON search endpoint, for example `http://127.0.0.1:8080/search`. ChatWebLLM adds `q`, `format=json`, and `categories=general`.
- **Tavily** — enter a Tavily API key. Requests are made directly from the browser to Tavily.

Search credentials are stored only in browser `localStorage`. If the selected search service does not allow browser CORS requests, it will not work from a remotely hosted WebUI.

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

You can also provide request headers, for example:

```json
[
  {
    "name": "Private MCP",
    "url": "https://mcp.example.com/mcp",
    "enabled": true,
    "headers": {
      "Authorization": "Bearer your-token"
    }
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

Enable **JavaScript sandbox** and then **Symbolic math (Nerdamer)**. The sandbox loads Nerdamer so the model can perform symbolic operations such as:

- simplify
- differentiate
- integrate
- solve equations
- algebra and calculus operations

## Files and persistence

Attachments are read in the browser and appended to the user's model context. They are not uploaded to the WebUI server.

Settings and conversations are stored in browser `localStorage`. Clearing browser storage removes them.

## Static hosting without Docker

Any static server can host the project. For example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
