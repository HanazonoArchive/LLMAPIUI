// Core application configuration state
export let API_KEY = "";
export let BASE_URL = "";
export let COOLDOWN_TIME = 99;
export let GUARDRAILS = "";
export let MAX_RETRIES = 3;
export let ENABLE_HEALTH_CHECKS = true;

// New modular configuration variables
export let REMEMBER_KEY = true;
export let TTS_ENABLED = false;
export let TTS_ENDPOINT = "http://127.0.0.1:8000/generate-speech";
export let EXCLUDE_KEYWORDS = "";
export let archiveContextClusters = [];
export let MEMORY_THRESHOLD_TURNS = 12;
export let TEMPERATURE = 0.7;
export let TOP_P = 0.9;

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
export let hasCompletedInitialPings = false;

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
export function setHasCompletedInitialPings(val) { hasCompletedInitialPings = val; }
export function setRememberKey(val) { REMEMBER_KEY = val === true || val === 'true'; }
export function setTTSEnabled(val) { TTS_ENABLED = val === true || val === 'true'; }
export function setTTSEndpoint(val) { TTS_ENDPOINT = val; }
export function setExcludeKeywords(val) { EXCLUDE_KEYWORDS = val; }
export function setArchiveContextClusters(val) { 
    archiveContextClusters = Array.isArray(val) ? val.map(c => {
        if (typeof c === 'string') return { tag: c, weight: 1.0 };
        if (c && typeof c === 'object' && c.tag) return { tag: c.tag, weight: typeof c.weight === 'number' ? c.weight : 1.0 };
        return null;
    }).filter(Boolean) : []; 
}
export function removeArchiveContextTag(tag) {
    archiveContextClusters = archiveContextClusters.filter(c => (typeof c === 'string' ? c : c.tag) !== tag);
    saveArchiveContext();
}
export function setMemoryThresholdTurns(val) { MEMORY_THRESHOLD_TURNS = parseInt(val) || 12; }
export function setTemperature(val) { TEMPERATURE = !isNaN(parseFloat(val)) ? parseFloat(val) : 0.7; }
export function setTopP(val) { TOP_P = !isNaN(parseFloat(val)) ? parseFloat(val) : 0.9; }

export function loadSettings() {
    REMEMBER_KEY = localStorage.getItem('llmapiui_remember_key') !== 'false';
    API_KEY = localStorage.getItem('llmapiui_api_key') || API_KEY || "";
    BASE_URL = localStorage.getItem('llmapiui_base_url') || "";
    COOLDOWN_TIME = parseInt(localStorage.getItem('llmapiui_cooldown')) || 99;
    GUARDRAILS = localStorage.getItem('llmapiui_guardrails') || "Be helpful, accurate, and conversational. Don't Mentiond your an AI or mentioned what are based off. Use natural language. Your Name is Rei remember that, you don't need to mentioned it until it explicitly asked. Keep it short, concise, put it under 70 words.";
    MAX_RETRIES = parseInt(localStorage.getItem('llmapiui_max_retries')) || 3;
    MAX_TOKENS_PER_MODEL = parseInt(localStorage.getItem('llmapiui_max_tokens')) || 2000;
    TTS_ENABLED = localStorage.getItem('llmapiui_tts_enabled') === 'true';
    TTS_ENDPOINT = localStorage.getItem('llmapiui_tts_url') || "http://127.0.0.1:8000/generate-speech";
    EXCLUDE_KEYWORDS = localStorage.getItem('llmapiui_exclude_keywords') || "";
    MEMORY_THRESHOLD_TURNS = parseInt(localStorage.getItem('llmapiui_memory_threshold')) || 12;
    
    const savedContext = localStorage.getItem('llmapiui_archive_context');
    if (savedContext) {
        try { 
            const parsed = JSON.parse(savedContext);
            archiveContextClusters = parsed.map(c => {
                if (typeof c === 'string') return { tag: c, weight: 1.0 };
                if (c && typeof c === 'object' && c.tag) return { tag: c.tag, weight: typeof c.weight === 'number' ? c.weight : 1.0 };
                return null;
            }).filter(Boolean);
        } catch (e) {}
    }
    
    TEMPERATURE = parseFloat(localStorage.getItem('llmapiui_temperature'));
    if (isNaN(TEMPERATURE)) TEMPERATURE = 0.7;
    TOP_P = parseFloat(localStorage.getItem('llmapiui_top_p'));
    if (isNaN(TOP_P)) TOP_P = 0.9;
    
    // Check persistent storage to see if we have already compiled a baseline history
    const baselineFlag = localStorage.getItem('llmapiui_baseline_done');
    hasCompletedInitialPings = (baselineFlag === 'true');

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

export function saveArchiveContext() {
    localStorage.setItem('llmapiui_archive_context', JSON.stringify(archiveContextClusters));
}

export function clearArchiveContext() {
    archiveContextClusters = [];
    localStorage.removeItem('llmapiui_archive_context');
}