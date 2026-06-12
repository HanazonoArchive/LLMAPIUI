import * as State from '../state.js';
import { log } from '../logger.js';

export function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    
    // Populate form fields with current state values
    const fields = {
        'input-url': State.BASE_URL,
        'input-key': State.API_KEY,
        'input-remember-key': State.REMEMBER_KEY,
        'input-cooldown': State.COOLDOWN_TIME,
        'input-exclude-keywords': State.EXCLUDE_KEYWORDS,
        'input-guardrails': State.GUARDRAILS,
        'input-retries': State.MAX_RETRIES,
        'input-max-tokens': State.MAX_TOKENS_PER_MODEL,
        'input-tts-enabled': State.TTS_ENABLED,
        'input-tts-url': State.TTS_ENDPOINT,
        'input-memory-threshold': State.MEMORY_THRESHOLD_TURNS
    };
    
    Object.keys(fields).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = fields[id];
        } else {
            el.value = fields[id];
        }
    });
    
    // Reset tabs: active connection tab
    switchSettingsTab('tab-connection', document.querySelector('.modal-tab-btn'));
    
    modal.classList.add('active');
}

export function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');
}

export function switchSettingsTab(tabId, tabBtn) {
    document.querySelectorAll('.modal-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activePanel = document.getElementById(tabId);
    if (activePanel) activePanel.classList.add('active');
    if (tabBtn) tabBtn.classList.add('active');
}

export function clearMemoryArchiveUI() {
    if (confirm("Are you sure you want to clear all semantic memory context tags?")) {
        State.clearArchiveContext();
        log("Semantic memory archive tags cleared.", "success");
        alert("Memory archive tags successfully cleared.");
    }
}
