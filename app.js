// ============================================================
// UNIVERSAL LLM ORCHESTRATOR - FULLY FIXED VERSION WITH TTS PIPELINE
// Fixed: API key warning, conversation trimming, retry depth, XSS protection
// Added: Markdown stripping, automated Kokoro-TTS port forwarding
// ============================================================

// ==================== APPLICATION STATE ====================
let API_KEY = "";
let BASE_URL = "";
let COOLDOWN_TIME = 99;
let GUARDRAILS = "";
let MAX_RETRIES = 3;
let ENABLE_HEALTH_CHECKS = true;

// Core data structures
let conversationHistory = [];
let models = [];
let modelLatency = new Map();
let modelLastTested = new Map();
let responseCache = new Map();
let healthCheckInterval = null;
let pendingUserMessage = null;

// Token limit tracking
let MAX_TOKENS_PER_MODEL = 2000;
let TOKEN_LIMIT_ERROR_CODES = [400, 413];

// Flag to track if system message has been added
let systemMessageAdded = false;

// Security warning flag
let securityWarningShown = false;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // Show security warning for local storage API keys (personal use only)
    if (!securityWarningShown) {
        console.warn('🔐 API Key stored in localStorage - This is safe for personal use only. Do not deploy publicly.');
        securityWarningShown = true;
    }
    
    loadSettings();
    fetchModels();
    if (ENABLE_HEALTH_CHECKS) startHealthChecks();
    
    const inputField = document.getElementById('user-input');
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});

// ==================== LOGGING ====================
function log(message, type = 'info') {
    const logsContainer = document.getElementById('logs');
    if (!logsContainer) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    
    let icon = '📘';
    if (type === 'error') icon = '❌';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'yellow') icon = '⏳';
    
    entry.innerHTML = `<span style="color:#6e6e8a">[${time}]</span> ${icon} ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    console.log(`[${type}] ${message}`);
}

function clearLogs() {
    const logsContainer = document.getElementById('logs');
    if (logsContainer) {
        logsContainer.innerHTML = '<div class="log-entry">🧹 Logs cleared.</div>';
    }
}

// ==================== SETTINGS ====================
function loadSettings() {
    API_KEY = localStorage.getItem('llmapiui_api_key') || "";
    BASE_URL = localStorage.getItem('llmapiui_base_url') || "";
    COOLDOWN_TIME = parseInt(localStorage.getItem('llmapiui_cooldown')) || 99;
    GUARDRAILS = localStorage.getItem('llmapiui_guardrails') || "Be helpful, accurate, and conversational. No disclaimers about being an AI. Use natural language. Your Name is Rei remember that. Keep it short, concise, put it under 70 words.";
    MAX_RETRIES = parseInt(localStorage.getItem('llmapiui_max_retries')) || 3;
    MAX_TOKENS_PER_MODEL = parseInt(localStorage.getItem('llmapiui_max_tokens')) || 2000;
    
    const savedHistory = localStorage.getItem('llmapiui_memory');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
            systemMessageAdded = conversationHistory.some(msg => msg.role === 'system');
            log(`Restored ${conversationHistory.filter(m => m.role !== 'system').length / 2} turns.`, 'success');
            renderSavedChat();
        } catch (e) {}
    }
    
    const savedLatency = localStorage.getItem('llmapiui_latency');
    if (savedLatency) {
        try {
            modelLatency = new Map(JSON.parse(savedLatency));
        } catch (e) {}
    }
    
    const savedLastTested = localStorage.getItem('llmapiui_last_tested');
    if (savedLastTested) {
        try {
            modelLastTested = new Map(JSON.parse(savedLastTested));
        } catch (e) {}
    }
    
    const urlInput = document.getElementById('input-url');
    const keyInput = document.getElementById('input-key');
    const cooldownInput = document.getElementById('input-cooldown');
    const guardrailsInput = document.getElementById('input-guardrails');
    const retriesInput = document.getElementById('input-retries');
    const maxTokensInput = document.getElementById('input-max-tokens');
    
    if (urlInput) urlInput.value = BASE_URL;
    if (keyInput) keyInput.value = API_KEY;
    if (cooldownInput) cooldownInput.value = COOLDOWN_TIME;
    if (guardrailsInput) guardrailsInput.value = GUARDRAILS;
    if (retriesInput) retriesInput.value = MAX_RETRIES;
    if (maxTokensInput) maxTokensInput.value = MAX_TOKENS_PER_MODEL;
    
    if (!API_KEY || !BASE_URL) {
        log("⚠️ Configure API credentials in sidebar.", "warning");
        return false;
    }
    
    log(`✅ Connected to: ${BASE_URL}`, "success");
    return true;
}

function saveSettings() {
    const urlInput = document.getElementById('input-url');
    const keyInput = document.getElementById('input-key');
    const cooldownInput = document.getElementById('input-cooldown');
    const guardrailsInput = document.getElementById('input-guardrails');
    const retriesInput = document.getElementById('input-retries');
    const maxTokensInput = document.getElementById('input-max-tokens');
    
    const newUrl = urlInput?.value.trim() || "";
    const newKey = keyInput?.value.trim() || "";
    const newCooldown = cooldownInput?.value.trim() || "99";
    const newGuardrails = guardrailsInput?.value || "";
    const newRetries = retriesInput?.value || "3";
    const newMaxTokens = maxTokensInput?.value.trim() || "2000";
    
    if (!newUrl || !newKey) {
        alert("Please fill in both Base URL and API Key.");
        return;
    }
    
    localStorage.setItem('llmapiui_base_url', newUrl);
    localStorage.setItem('llmapiui_api_key', newKey);
    localStorage.setItem('llmapiui_cooldown', newCooldown);
    localStorage.setItem('llmapiui_guardrails', newGuardrails);
    localStorage.setItem('llmapiui_max_retries', newRetries);
    localStorage.setItem('llmapiui_max_tokens', newMaxTokens);
    
    log("✅ Settings saved.", "success");
    loadSettings();
    fetchModels();
}

function saveExclusionState() {
    const excludedIds = models.filter(m => m.excluded).map(m => m.id);
    localStorage.setItem('llmapiui_excluded_models', JSON.stringify(excludedIds));
}

function saveLatencyHistory() {
    const latencyArray = Array.from(modelLatency.entries());
    localStorage.setItem('llmapiui_latency', JSON.stringify(latencyArray));
}

function saveLastTestedHistory() {
    const lastTestedArray = Array.from(modelLastTested.entries());
    localStorage.setItem('llmapiui_last_tested', JSON.stringify(lastTestedArray));
}

// ==================== PERSISTENT COOLDOWN (UTC TIMESTAMP) ====================
function saveCooldownState() {
    const cooldownState = {};
    models.forEach(model => {
        if (model.cooldownUntil) {
            cooldownState[model.id] = model.cooldownUntil;
        }
    });
    localStorage.setItem('llmapiui_cooldown_state', JSON.stringify(cooldownState));
}

function loadCooldownState() {
    const saved = localStorage.getItem('llmapiui_cooldown_state');
    if (!saved) return;
    
    try {
        const cooldownState = JSON.parse(saved);
        const now = Date.now();
        
        Object.keys(cooldownState).forEach(modelId => {
            const cooldownUntil = cooldownState[modelId];
            const model = models.find(m => m.id === modelId);
            if (model && cooldownUntil > now) {
                model.status = 'yellow';
                model.cooldownUntil = cooldownUntil;
                log(`⏳ Restored cooldown for [${model.id}] (${Math.round((cooldownUntil - now) / 1000)}s remaining)`, 'yellow');
            } else if (model && cooldownUntil <= now) {
                if (!model.excluded) {
                    model.status = 'green';
                }
                model.cooldownUntil = null;
            }
        });
        
        const updatedState = {};
        models.forEach(model => {
            if (model.cooldownUntil && model.cooldownUntil > now) {
                updatedState[model.id] = model.cooldownUntil;
            }
        });
        localStorage.setItem('llmapiui_cooldown_state', JSON.stringify(updatedState));
        
    } catch (e) {
        log(`Failed to load cooldown state: ${e.message}`, 'warning');
    }
}

function triggerCooldown(modelObj) {
    if (modelObj.excluded) return;
    
    const now = Date.now();
    const cooldownUntil = now + (COOLDOWN_TIME * 1000);
    
    modelObj.status = 'yellow';
    modelObj.cooldownUntil = cooldownUntil;
    
    renderModelList();
    saveCooldownState();
    
    log(`⏳ [${modelObj.id}] cooling down for ${COOLDOWN_TIME}s until ${new Date(cooldownUntil).toLocaleTimeString()}`, 'yellow');
    
    setTimeout(() => {
        if (modelObj.cooldownUntil && modelObj.cooldownUntil <= Date.now()) {
            if (!modelObj.excluded) {
                modelObj.status = 'green';
                modelObj.cooldownUntil = null;
                renderModelList();
                saveCooldownState();
                log(`✅ [${modelObj.id}] cooldown complete`, 'success');
            }
        }
        
        const activeCount = models.filter(m => m.status === 'green' && !m.excluded).length;
        const countSpan = document.getElementById('pool-count');
        if (countSpan) countSpan.innerText = `${activeCount}/${models.length}`;
    }, COOLDOWN_TIME * 1000);
}

function isModelAvailable(model) {
    if (model.excluded) return false;
    if (model.status === 'red') return false;
    if (model.cooldownUntil && model.cooldownUntil > Date.now()) return false;
    return true;
}

// ==================== MODEL MANAGEMENT ====================
async function fetchModels() {
    if (!API_KEY || !BASE_URL) return;
    
    log(`🔄 Syncing model cluster...`, 'info');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${BASE_URL}/models`, {
            method: 'GET',
            headers: { "Authorization": `Bearer ${API_KEY}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data?.data?.length > 0) {
            const savedExclusions = new Set(JSON.parse(localStorage.getItem('llmapiui_excluded_models') || '[]'));
            
            models = data.data.map(m => {
                const isExcluded = savedExclusions.has(m.id);
                return {
                    id: m.id,
                    status: isExcluded ? 'red' : 'green',
                    excluded: isExcluded,
                    lastLatency: modelLatency.get(m.id) || null,
                    lastTested: modelLastTested.get(m.id) || null,
                    failureCount: 0,
                    tokenLimitHits: 0,
                    cooldownUntil: null
                };
            });
            
            loadCooldownState();
            log(`✅ Synced ${models.length} models. Active: ${models.filter(m => m.status === 'green' && !m.excluded).length}`, 'success');
        } else {
            throw new Error("No models returned");
        }
    } catch (err) {
        log(`⚠️ Fetch failed: ${err.message}. Using fallback.`, 'warning');
        createMockModels();
    }
    
    renderModelList();
}

function createMockModels() {
    const mockPrefixes = [
        'meta-llama/llama-3-70b', 'mistralai/mixtral-8x7b', 'openai/gpt-4o-mini',
        'google/gemma-7b', 'anthropic/claude-3-haiku', 'cohere/command-r'
    ];
    
    const savedExclusions = new Set(JSON.parse(localStorage.getItem('llmapiui_excluded_models') || '[]'));
    
    models = [];
    for (let i = 0; i < 12; i++) {
        const mockId = `${mockPrefixes[i % mockPrefixes.length]}-${i+1}`;
        models.push({
            id: mockId,
            status: savedExclusions.has(mockId) ? 'red' : 'green',
            excluded: savedExclusions.has(mockId),
            lastLatency: null,
            lastTested: null,
            failureCount: 0,
            tokenLimitHits: 0,
            cooldownUntil: null
        });
    }
    
    loadCooldownState();
    log(`📋 Created ${models.length} mock models.`, 'yellow');
}

function renderModelList() {
    const container = document.getElementById('model-list');
    const countSpan = document.getElementById('pool-count');
    if (!container || !countSpan) return;
    
    container.innerHTML = '';
    const activeCount = models.filter(m => m.status === 'green' && !m.excluded).length;
    countSpan.innerText = `${activeCount}/${models.length}`;
    
    const sortedModels = [...models].sort((a, b) => {
        if (a.status !== b.status) {
            const order = { green: 0, yellow: 1, red: 2 };
            return (order[a.status] || 1) - (order[b.status] || 1);
        }
        const latA = modelLatency.get(a.id) ?? Infinity;
        const latB = modelLatency.get(b.id) ?? Infinity;
        return latA - latB;
    });
    
    sortedModels.forEach(model => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.id = `item-${CSS.escape(model.id)}`;
        
        const latency = modelLatency.get(model.id);
        const latencyText = latency ? `${Math.round(latency)}ms` : 'untested';
        
        let cooldownText = '';
        if (model.cooldownUntil && model.cooldownUntil > Date.now()) {
            const remaining = Math.round((model.cooldownUntil - Date.now()) / 1000);
            cooldownText = `<span class="cooldown-timer">⏳${remaining}s</span>`;
        }
        
        let tokenWarning = '';
        if (model.tokenLimitHits > 0) {
            tokenWarning = `<span class="token-warning" title="Hit token limit ${model.tokenLimitHits} times">⚠️📝</span>`;
        }
        
        div.innerHTML = `
            <div class="model-info">
                <input type="checkbox" class="model-checkbox" ${!model.excluded ? 'checked' : ''} 
                       onchange="toggleModelInclusion('${escapeHtml(model.id)}', this.checked)">
                <span class="model-name" title="${model.id}">${truncateName(model.id)}</span>
                <span class="model-latency">${latencyText}</span>
                ${tokenWarning}
                ${cooldownText}
            </div>
            <div class="status-dot status-${model.status}"></div>
        `;
        container.appendChild(div);
    });
}

function truncateName(fullName) {
    if (fullName.length <= 35) return fullName;
    return fullName.substring(0, 32) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.toggleModelInclusion = function(modelId, isIncluded) {
    const model = models.find(m => m.id === modelId);
    if (model) {
        model.excluded = !isIncluded;
        model.status = isIncluded ? 'green' : 'red';
        
        if (!isIncluded) {
            model.cooldownUntil = null;
        }
        
        log(`Model [${model.id}] ${isIncluded ? 'enabled' : 'disabled'}`, isIncluded ? 'success' : 'warning');
        saveExclusionState();
        saveCooldownState();
        renderModelList();
    }
};

// ==================== ROUTING WITH TESTED TIME PRIORITIZATION ====================
function getNextAvailableModel() {
    const readyPool = models.filter(m => !m.excluded && m.status !== 'red' && isModelAvailable(m));
    
    if (readyPool.length === 0) return null;
    
    readyPool.sort((a, b) => {
        const latA = modelLatency.get(a.id) ?? Infinity;
        const latB = modelLatency.get(b.id) ?? Infinity;
        if (latA !== latB) return latA - latB;
        
        const testedA = a.lastTested ?? 0;
        const testedB = b.lastTested ?? 0;
        return testedA - testedB;
    });
    
    const selected = readyPool[0];
    
    selected.lastTested = Date.now();
    modelLastTested.set(selected.id, selected.lastTested);
    saveLastTestedHistory();
    
    const latencyInfo = modelLatency.get(selected.id);
    log(`🎯 Router selected: ${selected.id} (${latencyInfo ? Math.round(latencyInfo) + 'ms' : 'untested'})`, 'info');
    
    return selected;
}

function recordLatency(modelId, responseTimeMs) {
    const existing = modelLatency.get(modelId);
    const newAvg = existing ? existing * 0.7 + responseTimeMs * 0.3 : responseTimeMs;
    modelLatency.set(modelId, newAvg);
    saveLatencyHistory();
    renderModelList();
}

function autoExcludeModel(modelId, reason) {
    const model = models.find(m => m.id === modelId);
    if (!model) return;
    
    if (model.excluded) {
        log(`[${model.id}] already excluded, skipping`, 'warning');
        return;
    }
    
    model.excluded = true;
    model.status = 'red';
    model.cooldownUntil = null;
    
    saveExclusionState();
    saveCooldownState();
    renderModelList();
    
    log(`🚫 AUTO-EXCLUDED [${model.id}] (${reason})`, 'error');
}

function handleTokenLimitExceeded(modelId, error) {
    const model = models.find(m => m.id === modelId);
    if (!model) return;
    
    model.tokenLimitHits = (model.tokenLimitHits || 0) + 1;
    
    log(`⚠️ Token limit hit on [${model.id}] (${model.tokenLimitHits}x)`, 'warning');
    
    if (model.tokenLimitHits >= 2) {
        autoExcludeModel(modelId, `Token limit exceeded ${model.tokenLimitHits} times`);
    } else {
        log(`📉 Reducing token limit preference for [${model.id}]`, 'warning');
    }
    
    renderModelList();
}

// ==================== VALIDATION WITH CUT-OFF DETECTION ====================
function isResponseCutOff(response) {
    if (!response || typeof response !== 'string') return false;
    
    const trimmed = response.trim();
    if (trimmed.length === 0) return true;
    
    const endsWithComplete = /[.!?)\]}'"]\s*$/.test(trimmed);
    
    const cutoffPatterns = [
        /\.\.\.$/m, /,\s*$/m, /and\s*$/mi, /or\s*$/mi, /the\s*$/mi,
        /a\s*$/mi, /an\s*$/mi, /to\s*$/mi, /of\s*$/mi, /in\s*$/mi,
        /for\s*$/mi, /with\s*$/mi, /that\s*$/mi, /this\s*$/mi,
        /from\s*$/mi, /by\s*$/mi, /at\s*$/mi, /:\s*$/m, /;\s*$/m,
        /-\s*$/m, /\[\s*$/m, /\(\s*$/m, /{\s*$/m
    ];
    
    if (!endsWithComplete && cutoffPatterns.some(pattern => pattern.test(trimmed))) {
        return true;
    }
    
    const lastChar = trimmed.charAt(trimmed.length - 1);
    if (/[a-zA-Z0-9]/.test(lastChar) && !endsWithComplete && trimmed.length > 100) {
        return true;
    }
    
    return false;
}

function validateResponse(response, rulesInjected) {
    if (!response || typeof response !== 'string') return null;
    
    const rules = rulesInjected.toLowerCase();
    const wordCount = response.split(/\s+/).length;
    
    if (wordCount > 30 && isResponseCutOff(response)) {
        log(`⚠️ Response appears cut-off (ends mid-sentence)`, 'warning');
        const error = new Error("Response cut-off detected");
        error.isCutOff = true;
        error.partialResponse = response;
        throw error;
    }
    
    if (wordCount > 600) {
        log(`Response too long: ${wordCount} words (max 600)`, 'warning');
        return null;
    }
    
    const bannedPatterns = [
        /\bas an ai\b/i, /\bas a language model\b/i, /\bdisclaimer\b/i,
        /\bi don't have personal\b/i, /\bunable to\b/i
    ];
    
    for (const pattern of bannedPatterns) {
        if (pattern.test(response)) {
            log(`Response contains banned disclaimer`, 'warning');
            return null;
        }
    }
    
    return response;
}

// ==================== FETCH WITH RETRY & MISMATCH HANDLING ====================
async function fetchWithRetry(url, options, maxRetries = 2) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            
            let text = '';
            try {
                text = await response.text();
            } catch (readError) {
                if (readError.message.includes('Unexpected end') || readError.message.includes('Content-Length')) {
                    throw new Error(`Incomplete response (content-length mismatch) - attempt ${attempt + 1}`);
                }
                throw readError;
            }
            
            try {
                return JSON.parse(text);
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
            }
            
        } catch (error) {
            lastError = error;
            log(`Fetch attempt ${attempt + 1} failed: ${error.message}`, 'warning');
            
            if (attempt < maxRetries) {
                await wait(1000 * (attempt + 1));
            }
        }
    }
    
    throw lastError;
}

// ==================== CONVERSATION TRIMMING (FIXED - Preserves pairs) ====================
function trimConversationHistory() {
    const maxMessages = 31; // system + 30 (15 complete pairs)
    
    if (conversationHistory.length <= maxMessages) return;
    
    // Find system message index
    const systemIndex = conversationHistory.findIndex(m => m.role === 'system');
    
    if (systemIndex === -1) {
        // No system message, trim from beginning maintaining pairs
        let trimCount = conversationHistory.length - maxMessages;
        // Ensure trimCount is even to preserve user/assistant pairs
        if (trimCount % 2 !== 0) trimCount++;
        conversationHistory = conversationHistory.slice(trimCount);
        return;
    }
    
    // Keep system message, then trim from after it
    const systemMessage = conversationHistory[systemIndex];
    let messagesAfterSystem = conversationHistory.slice(systemIndex + 1);
    
    if (messagesAfterSystem.length > 30) {
        // Keep last 30 messages (15 complete pairs)
        messagesAfterSystem = messagesAfterSystem.slice(-30);
    }
    
    // Rebuild history
    conversationHistory = [systemMessage, ...messagesAfterSystem];
}

// ==================== CORE MESSAGE SENDING ====================
async function sendMessage() {
    if (!API_KEY || !BASE_URL) {
        log("❌ Please configure API credentials first.", "error");
        alert("Please configure API credentials in the sidebar first.");
        return;
    }
    
    const inputField = document.getElementById('user-input');
    const prompt = inputField?.value.trim();
    if (!prompt) return;
    
    inputField.value = '';
    appendMessage(prompt, 'user');
    pendingUserMessage = prompt;
    showTypingIndicator();
    
    try {
        const response = await sendMessageWithRetry(prompt, null, 0);
        hideTypingIndicator();
        appendMessage(response, 'assistant');
        
        // 🚀 FIRE-AND-FORGET TO KOKORO-TTS FILTER CHAIN
        forwardToTTS(response);
        
        // Add system message only once at the beginning of conversation
        if (!systemMessageAdded && conversationHistory.length === 0) {
            const systemMessage = {
                role: "system",
                content: `SYSTEM RULES (PERMANENT):\n${GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`
            };
            conversationHistory.unshift(systemMessage);
            systemMessageAdded = true;
            log("📋 Permanent system guardrails added to conversation", 'success');
        }
        
        conversationHistory.push(
            { role: "user", content: prompt },
            { role: "assistant", content: response }
        );
        
        // Trim conversation while preserving pairs
        trimConversationHistory();
        
        localStorage.setItem('llmapiui_memory', JSON.stringify(conversationHistory));
        pendingUserMessage = null;
        
    } catch (error) {
        hideTypingIndicator();
        
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            const lastMessage = chatContainer.lastChild;
            if (lastMessage && lastMessage.classList?.contains('user')) {
                lastMessage.remove();
            }
        }
        
        log(`❌ All models failed: ${error.message}`, 'error');
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'message assistant';
        errorMsg.style.opacity = '0.7';
        errorMsg.style.fontStyle = 'italic';
        errorMsg.innerText = "⚠️ All LLM endpoints are currently unavailable. Please check your connection or wait for cooldowns.";
        chatContainer?.appendChild(errorMsg);
        chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        
        setTimeout(() => errorMsg.remove?.(), 5000);
        pendingUserMessage = null;
    }
}

// ==================== SEND MESSAGE WITH RETRY (FIXED - Depth limit) ====================
async function sendMessageWithRetry(prompt, previousPartialResponse = null, retryDepth = 0) {
    const MAX_DEPTH = 3;
    if (retryDepth > MAX_DEPTH) {
        log(`⚠️ Max retry depth reached (${MAX_DEPTH}), giving up`, 'error');
        throw new Error("Max retry depth exceeded");
    }
    
    const failedModels = new Set();
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const availableModels = models.filter(m => 
            !m.excluded && 
            m.status !== 'red' && 
            isModelAvailable(m) &&
            !failedModels.has(m.id)
        );
        
        if (availableModels.length === 0) {
            log(`No available models found`, 'warning');
            await wait(2000);
            continue;
        }
        
        availableModels.sort((a, b) => {
            const latA = modelLatency.get(a.id) ?? Infinity;
            const latB = modelLatency.get(b.id) ?? Infinity;
            return latA - latB;
        });
        
        const model = availableModels[0];
        
        const isContinuation = previousPartialResponse !== null;
        let finalPrompt = prompt;
        let maxTokensValue = MAX_TOKENS_PER_MODEL;
        
        if (isContinuation) {
            finalPrompt = `[CONTINUE DIRECTLY from where you stopped. Do not repeat. Start from the last word:]\n${previousPartialResponse}`;
            maxTokensValue = Math.min(MAX_TOKENS_PER_MODEL * 2, 8000);
            log(`📝 Continuation request (depth ${retryDepth + 1})`, 'info');
        }
        
        log(`📡 Attempt ${attempt + 1}/${MAX_RETRIES} on ${model.id}${isContinuation ? ' (continuation)' : ''}`, 'info');
        highlightModelInUI(model.id);
        
        const startTime = performance.now();
        
        try {
            const response = await callModel(model, finalPrompt, maxTokensValue);
            const latency = performance.now() - startTime;
            recordLatency(model.id, latency);
            
            let finalResponse = response;
            if (isContinuation && previousPartialResponse) {
                finalResponse = previousPartialResponse + ' ' + response;
                log(`🔗 Combined response (${previousPartialResponse.length} + ${response.length} chars)`, 'success');
            }
            
            const validated = validateResponse(finalResponse, GUARDRAILS);
            if (validated) {
                log(`✅ Success on ${model.id} (${Math.round(latency)}ms)`, 'success');
                triggerCooldown(model);
                return validated;
            } else {
                log(`⚠️ ${model.id} returned invalid response, marking failed`, 'warning');
                failedModels.add(model.id);
                
                model.failureCount = (model.failureCount || 0) + 1;
                if (model.failureCount >= 2) {
                    autoExcludeModel(model.id, `${model.failureCount} invalid responses`);
                }
            }
            
        } catch (error) {
            const latency = performance.now() - startTime;
            lastError = error;
            
            const modelObj = models.find(m => m.id === model.id);
            if (modelObj) {
                modelObj.failureCount = (modelObj.failureCount || 0) + 1;
            }
            
            // Handle token limit exceeded
            if (error.message.includes('maximum context length') || 
                error.message.includes('token limit') ||
                error.message.includes('too many tokens') ||
                TOKEN_LIMIT_ERROR_CODES.includes(error.status)) {
                handleTokenLimitExceeded(model.id, error);
                failedModels.add(model.id);
                continue;
            }
            
            // Handle cut-off with depth tracking (iterative, not recursive)
            if (error.isCutOff && error.partialResponse && !isContinuation && retryDepth < MAX_DEPTH) {
                log(`📦 Cut-off detected, retrying with continuation (depth ${retryDepth + 1})`, 'warning');
                // Recursive call with increased depth
                return sendMessageWithRetry(prompt, error.partialResponse, retryDepth + 1);
            }
            
            // Special handling for different error types
            if (error.message.includes('content-length') || error.message.includes('incomplete')) {
                log(`📦 ${model.id} returned incomplete response - auto-excluding`, 'error');
                autoExcludeModel(model.id, 'incomplete response (content-length mismatch)');
            } else if (error.status === 429 || error.message.includes('rate limit')) {
                log(`🚫 ${model.id} rate limited (${Math.round(latency)}ms)`, 'warning');
                triggerCooldown(model);
            } else if (error.status === 401 || error.status === 403) {
                autoExcludeModel(model.id, 'authentication failed');
            } else if (error.message.includes('timeout')) {
                log(`⏰ ${model.id} timeout (${Math.round(latency)}ms)`, 'warning');
            } else if (error.status === 500 || error.status === 502 || error.status === 503) {
                log(`⚠️ ${model.id} server error (${error.status})`, 'warning');
                if (modelObj && modelObj.failureCount >= 2) {
                    autoExcludeModel(model.id, `${modelObj.failureCount} server errors`);
                }
            } else {
                log(`❌ ${model.id} failed: ${error.message}`, 'error');
                if (modelObj && modelObj.failureCount >= 2) {
                    autoExcludeModel(model.id, `${modelObj.failureCount} consecutive failures`);
                }
            }
            
            failedModels.add(model.id);
        }
    }
    
    throw new Error(lastError?.message || "All models exhausted");
}

// ==================== CALL MODEL ====================
async function callModel(model, prompt, maxTokens = 2000) {
    let messagesPayload = [];
    
    // Check if history has a system message
    const existingSystemMessage = conversationHistory.find(msg => msg.role === 'system');
    
    if (existingSystemMessage) {
        messagesPayload = [
            ...conversationHistory,
            { role: "user", content: prompt }
        ];
    } else {
        messagesPayload = [
            { role: "system", content: `SYSTEM RULES (PERMANENT):\n${GUARDRAILS}\n\nThese rules apply to ALL responses. You must follow them strictly.` },
            ...conversationHistory,
            { role: "user", content: prompt }
        ];
    }
    
    const data = await fetchWithRetry(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: model.id,
            messages: messagesPayload,
            temperature: 0.7,
            max_tokens: maxTokens
        })
    });
    
    if (!data?.choices?.[0]?.message?.content) {
        throw new Error("Invalid response structure");
    }
    
    const modelObj = models.find(m => m.id === model.id);
    if (modelObj) {
        modelObj.failureCount = 0;
    }
    
    return data.choices[0].message.content;
}

// ==================== IMPROVED HEALTH CHECKS ====================
function startHealthChecks() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    
    healthCheckInterval = setInterval(async () => {
        if (!API_KEY || !BASE_URL) return;
        
        const now = Date.now();
        const stuckModels = models.filter(m => m.status === 'yellow' && m.cooldownUntil && m.cooldownUntil <= now && !m.excluded);
        
        for (const model of stuckModels) {
            model.status = 'green';
            model.cooldownUntil = null;
            renderModelList();
            saveCooldownState();
            log(`🩺 Fixed stuck cooldown for [${model.id}]`, 'success');
        }
        
    }, 120000);
}

// ==================== TTS UTILITIES & FORWARDING ====================
function stripMarkdownForSpeech(text) {
    if (!text) return "";

    let cleanText = text;

    // 1. Remove code blocks (```code```)
    cleanText = cleanText.replace(/```[\s\S]*?```/g, "");

    // 2. Remove inline code blocks (`code`)
    cleanText = cleanText.replace(/`([^`]+)`/g, "$1");

    // 3. Remove bold/italic markdown signs (***bolditalic***, **bold**, *italic*, __bold__, _italic_)
    cleanText = cleanText.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
    cleanText = cleanText.replace(/\*\*([^*]+)\*\*/g, "$1");
    cleanText = cleanText.replace(/\*([^*]+)\*/g, "$1");
    cleanText = cleanText.replace(/__([^_]+)__/g, "$1");
    cleanText = cleanText.replace(/_([^_]+)_/g, "$1");

    // 4. Remove headers (### Headers)
    cleanText = cleanText.replace(/^#+\s+(.*)$/gm, "$1");

    // 5. Remove bullet points or blockquote markers at start of lines (*, -, >, +)
    cleanText = cleanText.replace(/^[\s]*[-*+>]\s+/gm, "");

    // 6. Remove link formatting [text](url) -> keeps only the text part
    cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // 7. Clean up multiple whitespaces, lines or gaps left behind
    cleanText = cleanText.replace(/\s+/g, " ").trim();

    return cleanText;
}

async function forwardToTTS(textResponse) {
    const ttsEndpoint = "http://127.0.0.1:8000/generate-speech";
    
    // 🧼 Clean text from Markdown tags
    const cleanSpeechText = stripMarkdownForSpeech(textResponse);
    
    // Safety check: if text becomes empty after stripping, skip it
    if (!cleanSpeechText) {
        log(`⚠️ TTS skipped: Response text contains no speakable prose.`, 'warning');
        return;
    }

    log(`🗣️ Forwarding cleaned prose to Kokoro-TTS pipeline...`, 'info');
    console.log(`[TTS Plaintext Target]: "${cleanSpeechText}"`);

    try {
        const response = await fetch(ttsEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: cleanSpeechText })
        });

        if (!response.ok) {
            throw new Error(`TTS server responded with status: ${response.status}`);
        }

        const data = await response.json();
        log(`✅ TTS Audio Compiled: ${data.message || "Success"}`, 'success');

    } catch (error) {
        log(`🚨 TTS pipeline error: ${error.message}`, 'error');
        console.error("TTS Forwarding Failed:", error);
    }
}

// ==================== UI HELPERS ====================
let typingElement = null;

function showTypingIndicator() {
    hideTypingIndicator();
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    typingElement = document.createElement('div');
    typingElement.className = 'typing-indicator';
    typingElement.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    container.appendChild(typingElement);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    if (typingElement?.remove) {
        typingElement.remove();
        typingElement = null;
    }
}

function highlightModelInUI(modelId) {
    document.querySelectorAll('.model-item').forEach(el => el.classList.remove('active-llm'));
    const activeRow = document.getElementById(`item-${CSS.escape(modelId)}`);
    if (activeRow) activeRow.classList.add('active-llm');
}

// ==================== APPEND MESSAGE (FIXED - XSS Protection) ====================
function appendMessage(text, sender, modelLabel = null) {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const bubble = document.createElement('div');
    bubble.className = `message ${sender}`;
    
    if (sender === "assistant") {
        // SAFE: Only render markdown if BOTH libraries are available
        if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
            const rawHtml = marked.parse(text, { breaks: true, gfm: true });
            bubble.innerHTML = DOMPurify.sanitize(rawHtml);
        } else if (typeof marked !== "undefined" && typeof DOMPurify === "undefined") {
            // UNSAFE: Markdown loaded but no DOMPurify - use text content for security
            log(`⚠️ DOMPurify not loaded - rendering markdown as plain text for security`, 'warning');
            bubble.innerText = text;
        } else {
            // No markdown - plain text
            bubble.innerText = text;
        }
    } else {
        // User messages - always plain text (safe)
        bubble.innerText = text;
    }
    
    if (modelLabel && sender === 'assistant') {
        const meta = document.createElement('span');
        meta.className = 'message-meta';
        meta.innerText = `⚡ via ${modelLabel}`;
        bubble.appendChild(meta);
    }
    
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// ==================== RENDER SAVED CHAT ====================
function renderSavedChat() {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    if (conversationHistory.length > 0) {
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    
    // Filter out system messages for display
    const displayMessages = conversationHistory.filter(msg => msg.role !== 'system');
    
    displayMessages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;
        
        if (msg.role === 'assistant' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            const rawHtml = marked.parse(msg.content, { breaks: true, gfm: true });
            bubble.innerHTML = DOMPurify.sanitize(rawHtml);
        } else {
            bubble.innerText = msg.content;
        }
        
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== GLOBAL EXPORTS ====================
window.sendMessage = sendMessage;
window.saveSettings = saveSettings;
window.clearLogs = clearLogs;
window.toggleModelInclusion = toggleModelInclusion;