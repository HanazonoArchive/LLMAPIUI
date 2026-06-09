// Core application configuration state
export let API_KEY = "";
export let BASE_URL = "";
export let COOLDOWN_TIME = 99;
export let GUARDRAILS = "";
export let MAX_RETRIES = 3;
export let ENABLE_HEALTH_CHECKS = true;

// Core data structures
export let conversationHistory = [];
export let models = [];
export let modelLatency = new Map();
export let modelLastTested = new Map();
export let responseCache = new Map();
export let healthCheckInterval = null;
export let pendingUserMessage = null;

// Token limit tracking
export let MAX_TOKENS_PER_MODEL = 2000;
export const TOKEN_LIMIT_ERROR_CODES = [400, 413];

// Status tracking flags
export let systemMessageAdded = false;
export let securityWarningShown = false;

// ==================== STATE MUTATORS (CRITICAL FOR MODULES) ====================
export function setAPIKey(val) { API_KEY = val; }
export function setBaseURL(val) { BASE_URL = val; }
export function setCooldownTime(val) { COOLDOWN_TIME = parseInt(val) || 99; }
export function setGuardrails(val) { GUARDRAILS = val; }
export function setMaxRetries(val) { MAX_RETRIES = parseInt(val) || 3; }
export function setMaxTokens(val) { MAX_TOKENS_PER_MODEL = parseInt(val) || 2000; }
export function setModels(val) { models = val; }
export function setSystemMessageAdded(val) { systemMessageAdded = val; }
export function setSecurityWarningShown(val) { securityWarningShown = val; }
export function setPendingUserMessage(val) { pendingUserMessage = val; }
export function setHealthCheckInterval(val) { healthCheckInterval = val; }
export function setConversationHistory(val) { conversationHistory = val; }

export function loadSettings() {
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
        } catch (e) {}
    }
    
    const savedLatency = localStorage.getItem('llmapiui_latency');
    if (savedLatency) {
        try { modelLatency = new Map(JSON.parse(savedLatency)); } catch (e) {}
    }
    
    const savedLastTested = localStorage.getItem('llmapiui_last_tested');
    if (savedLastTested) {
        try { modelLastTested = new Map(JSON.parse(savedLastTested)); } catch (e) {}
    }
    
    return !!(API_KEY && BASE_URL);
}

export function saveExclusionState() {
    const excludedIds = models.filter(m => m.excluded).map(m => m.id);
    localStorage.setItem('llmapiui_excluded_models', JSON.stringify(excludedIds));
}

export function saveLatencyHistory() {
    localStorage.setItem('llmapiui_latency', JSON.stringify(Array.from(modelLatency.entries())));
}

export function saveLastTestedHistory() {
    localStorage.setItem('llmapiui_last_tested', JSON.stringify(Array.from(modelLastTested.entries())));
}

export function saveCooldownState() {
    const cooldownState = {};
    models.forEach(model => {
        if (model.cooldownUntil) {
            cooldownState[model.id] = model.cooldownUntil;
        }
    });
    localStorage.setItem('llmapiui_cooldown_state', JSON.stringify(cooldownState));
}