# ChatWebLLM

A tiny browser-based WebUI for chatting with an LLM running on the user's own machine.

The hosted server only serves static files. Model traffic goes directly from the user's browser to their local Ollama or OpenAI-compatible endpoint.

## Goals

- very small server footprint
- low RAM and CPU usage
- no backend proxy or database
- local model selection and streaming chat
- browser-side settings and chat persistence
- optional local tools and sandboxed JavaScript execution

More deployment and feature details will be added alongside the implementation.
