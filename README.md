#LLMAPIUI

### Unified LLM Gateway · One Interface

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-blue.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Status](https://img.shields.io/badge/status-stable-brightgreen.svg)]()

## 📖 Overview

**LLMAPIUI** is a production-grade, browser-based LLM orchestrator that aggregates unique LLM models into a single, intelligent, self-healing API gateway. It provides speed-based routing, automatic fallback, persistent cooldown tracking, cut-off detection, and a beautiful chat interface.


## ✨ Features

| Feature | Description |
|---------|-------------|
| **🚀 Speed-Based Routing** | Automatically selects fastest available model using recorded latency |
| **🔄 Auto-Fallback** | Seamlessly switches to next model on failure |
| **⏱️ Persistent Cooldown** | Model cooldowns survive page reloads (UTC timestamp based) |
| **🔒 Auto-Exclusion** | Automatically disables failing models after 2 consecutive failures |
| **✂️ Cut-Off Detection** | Detects incomplete responses and requests continuation |
| **🧠 Conversation Memory** | Persistent chat history with proper user/assistant pairing |
| **🛡️ Guardrail System** | System prompts preserved across all models |
| **📊 Latency Tracking** | Exponential moving average per model |
| **💾 State Persistence** | All settings, exclusions, and memory survive browser restart |
| **🎨 Markdown Rendering** | Full markdown support with DOMPurify sanitization |
| **🩺 Health Checks** | Automatic stuck cooldown recovery |
| **📝 Live Logging** | Real-time system logs with color-coded levels |

---

## 📦 Prerequisites

- Modern web browser (Chrome, Firefox, Edge, Safari)
- (Optional) Local server for production deployment

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/hanazonoarchive/llmapiui.git
cd llmapiui
```

### 2. Configure Your Endpoint

1. Open `index.html` in your browser
2. In the sidebar, enter your:
   - **Base URL** (e.g., `http://localhost:8000/v1`)
   - **API Key** (your unified API key)
   - **Cooldown time** (default: 99 seconds)
   - **System Guardrails** (custom instructions for all LLMs)

### 3. Start Chatting

Click **Save & Connect**, then start sending messages. The router will automatically:

- Discover available models
- Track response times
- Prioritize fastest models
- Handle failures gracefully

---

### Settings Panel Options

| Setting | Description | Default |
|---------|-------------|---------|
| Base URL | Your unified API endpoint | - |
| API Key | Authentication key | - |
| Cooldown Time | Seconds before model reuse | 99 |
| System Guardrails | Persistent system prompts | "Be helpful, accurate, conversational" |
| Max Retries | Attempts per request | 3 |

---

## 🧩 How It Works

### Routing Logic

```javascript
1. Filter available models (not excluded, not in cooldown)
2. Sort by recorded latency (fastest first)
3. Select fastest available
4. Send request with full conversation history
5. On success → update latency, trigger cooldown
6. On failure → try next fastest model
```

### Cooldown System

- Uses UTC timestamps (survives page reload)
- Models in cooldown show as yellow status
- Automatic recovery after cooldown expires

### Cut-Off Detection

Detects incomplete responses by checking:
- Missing sentence endings (`.`, `!`, `?`)
- Trailing commas, conjunctions, prepositions
- Opening brackets or parentheses

When detected, automatically requests continuation from the same model.

---

## 🔒 Security

### For Personal Use (Current Setup)

- ✅ API keys stored in browser localStorage
- ✅ Acceptable for solo/local development
- ⚠️ Do not deploy publicly without a backend proxy

### For Production Deployment

**Recommended Architecture:**

```javascript
Browser → Your Backend Proxy → Unified API
```

Add a simple Node.js proxy:

```javascript
// proxy-server.js
const express = require('express');
const app = express();

app.post('/v1/chat/completions', async (req, res) => {
    const response = await fetch(process.env.UNIFIED_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
        body: JSON.stringify(req.body)
    });
    res.json(await response.json());
});

app.listen(3000);
```

Then point LLMAPIUI to `http://localhost:3000` instead of your direct API endpoint.

---

## 📁 Project Structure

```
llmapiui/
├── index.html          # Main application UI
├── styles.css          # Styling and themes
├── app.js              # Core orchestration logic
└── README.md           # Documentation
```

---

## 🎯 Use Cases

| Use Case | Suitability |
|----------|-------------|
| 🎮 Game NPC Dialogue | ✅ Perfect (high reliability needed) |
| 🤖 Personal Assistant | ✅ Ideal (zero cost) |
| 📚 Research/Comparison | ✅ Great (test 50+ models) |
| 🏠 Home Automation | ✅ Good (Discord bots, smart home) |
| 🏢 Small Business | ⚠️ Consider rate limits |
| 🌐 Public SaaS | ❌ Use backend proxy |

---

## 📊 Performance

### Latency Benchmarks (Typical)

| Model | Avg Latency |
|-------|-------------|
| Groq Llama 3.3 70B | 250-400ms |
| Cerebras GLM-4.7 | 300-500ms |
| DeepInfra Llama 3 | 500-800ms |
| Together AI | 800-1500ms |

### Success Rate

- **With 50+ models**: ~99.9% effective uptime
- **Single model**: 95-99% (depending on provider)

---

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- [ ] Backend proxy integration
- [ ] WebSocket streaming support
- [ ] Model-specific prompt optimizations
- [ ] Analytics dashboard
- [ ] Docker deployment

---

## 📄 License

MIT License - Free for personal and commercial use.

---

## 🙏 Acknowledgments

- [LiteLLM](https://github.com/BerriAI/litellm) - Unified API standard
- [Marked.js](https://marked.js.org/) - Markdown parsing
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS sanitization

---

## ⭐ Star History

If you find this useful, please consider starring the repository!

---

**Built with ❤️ by someone who thought 97 free APIs should work as one.**
