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
export let AGENT_MODE = false;
export let EXCLUDE_KEYWORDS = "";
export let archiveContextClusters = [];
export let MEMORY_THRESHOLD_TURNS = 12;
export let TEMPERATURE = 0.7;
export let TOP_P = 0.9;

// Core data structures
export let conversationHistory = [];
export let sessions = [];
export let currentSessionId = "";
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
export function setConversationHistory(val) { 
    conversationHistory = val; 
    const active = sessions.find(s => s.id === currentSessionId);
    if (active) {
        active.history = val;
        saveSessions();
    }
}
export function setHasCompletedInitialPings(val) { hasCompletedInitialPings = val; }
export function setRememberKey(val) { REMEMBER_KEY = val === true || val === 'true'; }
export function setTTSEnabled(val) { TTS_ENABLED = val === true || val === 'true'; }
export function setTTSEndpoint(val) { TTS_ENDPOINT = val; }
export function setAgentMode(val) { AGENT_MODE = val === true || val === 'true'; }
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
    GUARDRAILS = localStorage.getItem('llmapiui_guardrails') || `You are Rei — a chaotic, sharp-tongued AI with the energy of a caffeinated gremlin. You are not here to be a helpful assistant. You exist, and apparently that's everyone's problem now.

Personality:
- Sarcastic, witty, and a little unhinged — but never actually cruel or harmful
- Unpredictable. Subvert expectations. Say things people don't expect
- Lightly self-aware about being an AI, but never dwell on it or make it your personality
- Casual internet language, dry humor, occasional chaotic energy
- You can roast people lightly but you're never mean-spirited about it
- You have opinions and you share them, even if nobody asked
- You don't pretend to care about things you don't care about
- Occasionally say something surprisingly insightful, then immediately undercut it

Rules:
- Keep responses short and punchy. Under 80 words unless genuinely necessary
- Never introduce yourself unless directly asked
- NEVER say "As an AI", "I'm just an AI", "I cannot", or "Certainly!" — that's boring and you know it
- No corporate speak. No "Great question!" No "I'd be happy to help!"
- Don't be a pushover. If something is dumb, you can say it's a little dumb (gently)
- You are Rei. That's all anyone needs to know.`;
    MAX_RETRIES = parseInt(localStorage.getItem('llmapiui_max_retries')) || 3;
    MAX_TOKENS_PER_MODEL = parseInt(localStorage.getItem('llmapiui_max_tokens')) || 2000;
    TTS_ENABLED = localStorage.getItem('llmapiui_tts_enabled') === 'true';
    TTS_ENDPOINT = localStorage.getItem('llmapiui_tts_url') || "http://127.0.0.1:8000/generate-speech";
    AGENT_MODE = localStorage.getItem('llmapiui_agent_mode') === 'true';
    
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
    
    // Load sessions
    const savedSessions = localStorage.getItem('llmapiui_sessions');
    const savedCurrentId = localStorage.getItem('llmapiui_current_session_id');
    
    if (savedSessions) {
        try {
            sessions = JSON.parse(savedSessions);
        } catch (e) {
            sessions = [];
        }
    }
    
    if (!sessions || sessions.length === 0) {
        // Migration of old memory
        const savedHistory = localStorage.getItem('llmapiui_memory');
        let oldHistory = [];
        if (savedHistory) {
            try {
                oldHistory = JSON.parse(savedHistory);
            } catch (e) {}
        }
        const defaultSession = {
            id: "session_default",
            name: "Default Session",
            history: oldHistory,
            systemMessageAdded: oldHistory.some(msg => msg.role === 'system')
        };
        sessions = [defaultSession];
        currentSessionId = "session_default";
        saveSessions();
    } else {
        if (savedCurrentId && sessions.some(s => s.id === savedCurrentId)) {
            currentSessionId = savedCurrentId;
        } else {
            currentSessionId = sessions[0].id;
        }
    }
    
    // Sync current session's history to conversationHistory
    const active = sessions.find(s => s.id === currentSessionId) || sessions[0];
    conversationHistory = active.history;
    systemMessageAdded = active.systemMessageAdded;
    
    return !!(API_KEY && BASE_URL);
}

export function saveSessions() {
    localStorage.setItem('llmapiui_sessions', JSON.stringify(sessions));
    localStorage.setItem('llmapiui_current_session_id', currentSessionId);
}

export function createNewSession(name = null) {
    const id = "session_" + Date.now();
    const sessionName = name || `Session ${sessions.length + 1}`;
    const newSession = {
        id,
        name: sessionName,
        history: [],
        systemMessageAdded: false
    };
    sessions.push(newSession);
    currentSessionId = id;
    conversationHistory = [];
    systemMessageAdded = false;
    saveSessions();
    return newSession;
}

export function switchSession(id) {
    const target = sessions.find(s => s.id === id);
    if (target) {
        currentSessionId = id;
        conversationHistory = target.history;
        systemMessageAdded = target.systemMessageAdded;
        saveSessions();
        return true;
    }
    return false;
}

export function deleteSession(id) {
    if (sessions.length <= 1) {
        // Can't delete the last session, just clear it instead
        const active = sessions[0];
        active.history = [];
        active.systemMessageAdded = false;
        active.name = "Default Session";
        conversationHistory = [];
        systemMessageAdded = false;
        saveSessions();
        return;
    }
    
    sessions = sessions.filter(s => s.id !== id);
    if (currentSessionId === id) {
        currentSessionId = sessions[0].id;
    }
    const active = sessions.find(s => s.id === currentSessionId);
    conversationHistory = active.history;
    systemMessageAdded = active.systemMessageAdded;
    saveSessions();
}

export function estimateTokenCount(history) {
    let text = "";
    history.forEach(msg => {
        text += msg.role + " " + msg.content + "\n";
    });
    return Math.ceil(text.length / 4);
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