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
                 │ direct request
                 ▼
      User's own machine / local LLM
```

`127.0.0.1` is resolved by the **browser**, not the Docker host. That lets one hosted WebUI connect to an LLM running locally on each user's machine.

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

The runtime image is based on `busybox:1.37.0-musl` and contains only BusyBox plus the two static application files.

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

The local LLM server must allow the WebUI origin. This project intentionally does not add a server-side bridge or proxy.

## Tools

When tool calling is enabled, compatible models can use the enabled browser tools.

### Calculator

Evaluates basic arithmetic locally in the browser.

### Current time

Returns the browser's current local time and timezone.

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
