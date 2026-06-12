# LLMAPIUI 

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)

I got tired of managing a dozen different LLM endpoints, hitting rate limits, and losing context across sessions. So, I built this. 

**LLMAPIUI** is a modern, self-hosted LLM gateway and chat interface. It acts as an intelligent orchestrator that aggregates your LLMs, automatically routes prompts to the fastest available model, remembers long-term context using Vector RAG, and can even run autonomous agent tools.

Plus, it looks really good. (Glassmorphism never dies).

---

## ✨ Features

- **🚀 Speed-Based Auto-Routing**: Constantly tracks model latency and automatically routes your prompt to the fastest, healthiest model.
- **🧠 Semantic Memory (Vector RAG)**: Runs `all-MiniLM-L6-v2` locally in Node.js to embed your chat history. It pulls highly relevant past conversations into the context window, so the LLM never forgets.
- **🤖 Agent Mode (ReAct Tools)**: Turn on Agent Mode and the LLM can autonomously execute Node.js tools (like fetching URLs or checking the time) to gather data before answering you.
- **🔄 Auto-Healing & Fallbacks**: If a model fails, times out, or hits a rate limit, the router instantly falls back to the next fastest model.
- **📁 Multi-Session Management**: Create, rename, and delete chat sessions. Everything is saved locally.
- **✂️ Cut-Off Recovery**: Automatically detects when an LLM stops mid-sentence and forces it to continue without breaking the UI.
- **🎨 Glassmorphic UI**: A sleek, dark-mode-first interface with micro-animations, Markdown rendering, and code syntax highlighting.

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/hanazonoarchive/llmapiui.git
cd llmapiui
npm install
```

### 2. Start the Backend Server
LLMAPIUI requires a local Node.js server to handle Vector embeddings, tool execution, and CORS proxying.
```bash
npm run dev
```
*(The server runs on `http://localhost:3000`)*

### 3. Configure Your Endpoint
Open `http://localhost:3000` in your browser. In the sidebar:
- Put in your unified **Base URL** (e.g. your LiteLLM or local endpoint).
- Put in your **API Key**.
- Hit **Save**. The orchestrator will automatically ping the endpoint, discover all available models, and start tracking their latency.

---

## 🧩 How the Tech Works

### The Routing Engine
Whenever you send a message, the frontend ranks all known models by their exponential moving average latency. It filters out any models currently on cooldown (rate-limited) or marked as dead (failed twice). It sends the request to the #1 model. If it fails, it instantly pivots to #2, and so on.

### The Memory System (RAG)
To keep the context window small while retaining long-term memory, the Node.js backend uses `transformers.js` to convert every chat turn into a 384-dimensional vector embedding. When you send a new message, the backend does a cosine-similarity search against your entire history and secretly injects the most relevant past messages into the LLM's system prompt.

### Adding Custom Tools
Want the LLM to control your smart home or query your database? 
1. Add the tool's description to `TOOL_INSTRUCTIONS` in `functions/api/call.js`.
2. Write the execution logic in the `POST /api/tools/execute` endpoint inside `server.js`.
3. Toggle "Agent Mode" ON in the UI.

---

## 🔒 Security Note
This is currently designed for **personal, local use**. API keys are stored in your browser's `localStorage` and sent directly to your configured endpoints. Do not host this publicly on the internet without putting it behind proper authentication!

---

## 🤝 Contributing
Contributions are absolutely welcome! Just open a PR. 

## 📄 License
MIT License. Do whatever you want with it.
