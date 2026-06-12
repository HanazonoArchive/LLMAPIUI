import * as State from '../state.js';
import { log } from '../logger.js';

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
    
    // Dynamic import to avoid circular dependency locks
    import('../ui.js').then(m => {
        m.renderModelList();
        State.saveCooldownState();
        
        log(`[${modelObj.id}] cooling down for ${State.COOLDOWN_TIME}s until ${new Date(cooldownUntil).toLocaleTimeString()}`, 'yellow');
        
        setTimeout(() => {
            if (modelObj.cooldownUntil && modelObj.cooldownUntil <= Date.now()) {
                if (!modelObj.excluded) {
                    modelObj.status = 'green';
                    modelObj.cooldownUntil = null;
                    m.renderModelList();
                    State.saveCooldownState();
                    log(`[${modelObj.id}] cooldown complete`, 'success');
                }
            }
            
            const activeCount = State.models.filter(m => m.status === 'green' && !m.excluded).length;
            const countSpan = document.getElementById('pool-count');
            if (countSpan) countSpan.innerText = `${activeCount}/${State.models.length}`;
        }, State.COOLDOWN_TIME * 1000);
    });
}

export function startHealthChecks() {
    if (State.healthCheckInterval) clearInterval(State.healthCheckInterval);
    
    const interval = setInterval(async () => {
        if (!State.API_KEY || !State.BASE_URL) return;
        
        const now = Date.now();
        const stuckModels = State.models.filter(m => m.status === 'yellow' && m.cooldownUntil && m.cooldownUntil <= now && !m.excluded);
        
        const uiModule = await import('../ui.js');
        
        for (const model of stuckModels) {
            model.status = 'green';
            model.cooldownUntil = null;
            uiModule.renderModelList();
            State.saveCooldownState();
            log(`<i class="fa-solid fa-stethoscope"></i> Fixed stuck cooldown for [${model.id}]`, 'success');
        }

        State.models.forEach(model => {
            if (model.usageCount > 0) {
                model.usageCount = Math.floor(model.usageCount / 2);
            }
        });
        uiModule.renderModelList();
        
    }, 120000);
    State.setHealthCheckInterval(interval);
}
