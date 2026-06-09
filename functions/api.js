import * as State from './state.js';
import { log } from './logger.js';
import { renderModelList } from './ui.js';

// ─── DEFINE YOUR HARDCODED EXCLUSIONS HERE ───────────────────────────────────
// You can add full exact model IDs, or generic keywords you want to auto-block.
const PRE_EXCLUDED_IDS = [
    'nemotron-3-ultra-free',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    'auto',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'qwen/qwen3-32b',
    '@cf/openai/gpt-oss-120b'
];

export function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isModelAvailable(model) {
    if (model.excluded) return false;
    if (model.status === 'red') return false;
    if (model.cooldownUntil && model.cooldownUntil > Date.now()) return false;
    return true;
}

export function loadCooldownState() {
    const saved = localStorage.getItem('llmapiui_cooldown_state');
    if (!saved) return;
    
    try {
        const cooldownState = JSON.parse(saved);
        const now = Date.now();
        
        Object.keys(cooldownState).forEach(modelId => {
            const cooldownUntil = cooldownState[modelId];
            const model = State.models.find(m => m.id === modelId);
            if (model && cooldownUntil > now) {
                model.status = 'yellow';
                model.cooldownUntil = cooldownUntil;
                log(`Restored cooldown for [${model.id}] (${Math.round((cooldownUntil - now) / 1000)}s remaining)`, 'yellow');
            } else if (model && cooldownUntil <= now) {
                if (!model.excluded) model.status = 'green';
                model.cooldownUntil = null;
            }
        });
    } catch (e) {
        log(`Failed to parse cooldown state: ${e.message}`, 'warning');
    }
}

export function triggerCooldown(modelObj) {
    if (modelObj.excluded) return;
    
    const now = Date.now();
    const cooldownUntil = now + (State.COOLDOWN_TIME * 1000);
    
    modelObj.status = 'yellow';
    modelObj.cooldownUntil = cooldownUntil;
    
    renderModelList();
    State.saveCooldownState();
    
    log(`[${modelObj.id}] cooling down for ${State.COOLDOWN_TIME}s until ${new Date(cooldownUntil).toLocaleTimeString()}`, 'yellow');
    
    setTimeout(() => {
        if (modelObj.cooldownUntil && modelObj.cooldownUntil <= Date.now()) {
            if (!modelObj.excluded) {
                modelObj.status = 'green';
                modelObj.cooldownUntil = null;
                renderModelList();
                State.saveCooldownState();
                log(`[${modelObj.id}] cooldown complete`, 'success');
            }
        }
        
        const activeCount = State.models.filter(m => m.status === 'green' && !m.excluded).length;
        const countSpan = document.getElementById('pool-count');
        if (countSpan) countSpan.innerText = `${activeCount}/${State.models.length}`;
    }, State.COOLDOWN_TIME * 1000);
}

export function createMockModels() {
    const mockPrefixes = [
        'meta-llama/llama-3-70b', 'mistralai/mixtral-8x7b', 'openai/gpt-4o-mini',
        'google/gemma-7b', 'anthropic/claude-3-haiku', 'cohere/command-r'
    ];
    
    const savedExclusions = new Set(JSON.parse(localStorage.getItem('llmapiui_excluded_models') || '[]'));
    
    const fallbackList = [];
    for (let i = 0; i < 12; i++) {
        const mockId = `${mockPrefixes[i % mockPrefixes.length]}-${i+1}`;
        
        // Check if the mock ID matches user's local storage OR hardcoded blacklist keywords
        const isPreExcluded = PRE_EXCLUDED_IDS.some(pattern => mockId.includes(pattern));
        const shouldExclude = savedExclusions.has(mockId) || isPreExcluded;

        fallbackList.push({
            id: mockId,
            status: shouldExclude ? 'red' : 'green',
            excluded: shouldExclude,
            lastLatency: null,
            lastTested: null,
            failureCount: 0,
            tokenLimitHits: 0,
            cooldownUntil: null,
            usageCount: 0
        });
    }
    State.setModels(fallbackList);
    loadCooldownState();
    log(`Created ${State.models.length} mock models.`, 'yellow');
}

export async function fetchModels() {
    if (!State.API_KEY || !State.BASE_URL) return;
    log(`Syncing model cluster...`, 'info');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${State.BASE_URL}/models`, {
            method: 'GET',
            headers: { "Authorization": `Bearer ${State.API_KEY}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data?.data?.length > 0) {
            const savedExclusions = new Set(JSON.parse(localStorage.getItem('llmapiui_excluded_models') || '[]'));
            
            const updatedModels = data.data.map(m => {
                // Determine if model matches localStorage toggles OR our hardcoded blacklist arrays
                const isPreExcluded = PRE_EXCLUDED_IDS.some(pattern => m.id.includes(pattern));
                const shouldExclude = savedExclusions.has(m.id) || isPreExcluded;
                
                return {
                    id: m.id,
                    status: shouldExclude ? 'red' : 'green',
                    excluded: shouldExclude,
                    lastLatency: State.modelLatency.get(m.id) || null,
                    lastTested: State.modelLastTested.get(m.id) || null,
                    failureCount: 0,
                    tokenLimitHits: 0,
                    cooldownUntil: null,
                    usageCount: 0
                };
            });
            State.setModels(updatedModels);
            loadCooldownState();
            log(`Synced ${State.models.length} models. Active: ${State.models.filter(m => m.status === 'green' && !m.excluded).length}`, 'success');
            
            // ─── PERSISTENT SEQUENTIAL BASERUNNER QUEUE RULE ─────────────────
            if (!State.hasCompletedInitialPings) {
                State.setHasCompletedInitialPings(true); 
                log("Starting sequential step-by-step latency baseline checks...", "info");
                
                (async () => {
                    for (const model of updatedModels) {
                        // Thanks to 'shouldExclude' logic above, pre-excluded models will be skipped entirely!
                        if (!model.excluded && model.status === 'green') {
                            await testModelLatency(model.id);
                        }
                    }
                    // Baseline is permanently completed. Store it in localStorage.
                    localStorage.setItem('llmapiui_baseline_done', 'true');
                    log("Baseline metric compilation complete. Token stored to LocalStorage.", "success");
                })();
            } else {
                log("Persistent baseline historical data loaded. Skipping startup network pings.", "info");
            }

        } else {
            throw new Error("No models returned");
        }
    } catch (err) {
        log(`Fetch failed: ${err.message}. Using fallback.`, 'warning');
        createMockModels();
    }
    renderModelList();
}

export function recordLatency(modelId, responseTimeMs) {
    const existing = State.modelLatency.get(modelId);
    const newAvg = existing ? existing * 0.7 + responseTimeMs * 0.3 : responseTimeMs;
    State.modelLatency.set(modelId, newAvg);
    State.saveLatencyHistory();
    renderModelList();
}

export function autoExcludeModel(modelId, reason) {
    const model = State.models.find(m => m.id === modelId);
    if (!model) return;
    
    if (model.excluded) {
        log(`[${model.id}] already excluded, skipping`, 'warning');
        return;
    }
    
    model.excluded = true;
    model.status = 'red';
    model.cooldownUntil = null;
    
    State.saveExclusionState();
    State.saveCooldownState();
    renderModelList();
    log(`AUTO-EXCLUDED [${model.id}] (${reason})`, 'error');
}

export function handleTokenLimitExceeded(modelId, error) {
    const model = State.models.find(m => m.id === modelId);
    if (!model) return;
    
    model.tokenLimitHits = (model.tokenLimitHits || 0) + 1;
    log(`Token limit hit on [${model.id}] (${model.tokenLimitHits}x)`, 'warning');
    
    if (model.tokenLimitHits >= 2) {
        autoExcludeModel(modelId, `Token limit exceeded ${model.tokenLimitHits} times`);
    } else {
        log(`<i class="fa-solid fa-chart-line-down" style="transform: scaleY(-1);"></i> Reducing token limit preference for [${model.id}]`, 'warning');
    }
    renderModelList();
}

export async function fetchWithRetry(url, options, maxRetries = 2) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, { ...options, signal: controller.signal });
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
            
            try { return JSON.parse(text); } catch (parseError) {
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
            }
            
        } catch (error) {
            lastError = error;
            log(`Fetch attempt ${attempt + 1} failed: ${error.message}`, 'warning');
            if (attempt < maxRetries) await wait(1000 * (attempt + 1));
        }
    }
    throw lastError;
}

export function trimConversationHistory() {
    const maxMessages = 31;
    if (State.conversationHistory.length <= maxMessages) return;
    
    const systemIndex = State.conversationHistory.findIndex(m => m.role === 'system');
    
    if (systemIndex === -1) {
        let trimCount = State.conversationHistory.length - maxMessages;
        if (trimCount % 2 !== 0) trimCount++;
        State.setConversationHistory(State.conversationHistory.slice(trimCount));
        return;
    }
    
    const systemMessage = State.conversationHistory[systemIndex];
    let messagesAfterSystem = State.conversationHistory.slice(systemIndex + 1);
    
    if (messagesAfterSystem.length > 30) {
        messagesAfterSystem = messagesAfterSystem.slice(-30);
    }
    
    State.setConversationHistory([systemMessage, ...messagesAfterSystem]);
}

export async function callModel(model, prompt, maxTokens = 2000) {
    let messagesPayload = [];
    const existingSystemMessage = State.conversationHistory.find(msg => msg.role === 'system');
    
    if (existingSystemMessage) {
        messagesPayload = [...State.conversationHistory, { role: "user", content: prompt }];
    } else {
        messagesPayload = [
            { role: "system", content: `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses. You must follow them strictly.` },
            ...State.conversationHistory,
            { role: "user", content: prompt }
        ];
    }
    
    const data = await fetchWithRetry(`${State.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${State.API_KEY}` },
        body: JSON.stringify({ model: model.id, messages: messagesPayload, temperature: 0.7, max_tokens: maxTokens })
    });
    
    if (!data?.choices?.[0]?.message?.content) throw new Error("Invalid response structure");
    
    const modelObj = State.models.find(m => m.id === model.id);
    if (modelObj) {
        modelObj.failureCount = 0;
        modelObj.usageCount = (modelObj.usageCount || 0) + 1;
    }
    
    return data.choices[0].message.content;
}

export async function testModelLatency(modelId) {
    const model = State.models.find(m => m.id === modelId);
    if (!model) return;

    log(`Testing latency ping for [${model.id}]...`, 'info');
    const startTime = performance.now();
    
    try {
        await fetchWithRetry(`${State.BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${State.API_KEY}` },
            body: JSON.stringify({
                model: model.id,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 1
            })
        });

        const latency = performance.now() - startTime;
        recordLatency(model.id, latency);
        
        State.modelLastTested.set(model.id, Date.now());
        State.saveLastTestedHistory();
        
        log(`Ping check successful [${model.id}]: ${Math.round(latency)}ms`, 'success');
    } catch (error) {
        log(`Ping check failed for [${model.id}]: ${error.message}`, 'error');
    }
}

export function startHealthChecks() {
    if (State.healthCheckInterval) clearInterval(State.healthCheckInterval);
    
    const interval = setInterval(async () => {
        if (!State.API_KEY || !State.BASE_URL) return;
        
        const now = Date.now();
        const stuckModels = State.models.filter(m => m.status === 'yellow' && m.cooldownUntil && m.cooldownUntil <= now && !m.excluded);
        
        for (const model of stuckModels) {
            model.status = 'green';
            model.cooldownUntil = null;
            renderModelList();
            State.saveCooldownState();
            log(`<i class="fa-solid fa-stethoscope"></i> Fixed stuck cooldown for [${model.id}]`, 'success');
        }

        State.models.forEach(model => {
            if (model.usageCount > 0) {
                model.usageCount = Math.floor(model.usageCount / 2);
            }
        });
        renderModelList();
        
    }, 120000);
    State.setHealthCheckInterval(interval);
}

window.toggleModelInclusion = function(modelId, isIncluded) {
    const model = State.models.find(m => m.id === modelId);
    if (model) {
        model.excluded = !isIncluded;
        model.status = isIncluded ? 'green' : 'red';
        if (!isIncluded) model.cooldownUntil = null;
        
        log(`Model [${model.id}] ${isIncluded ? 'enabled' : 'disabled'}`, isIncluded ? 'success' : 'warning');
        State.saveExclusionState();
        State.saveCooldownState();
        renderModelList();
    }
};

window.testModelLatency = testModelLatency;