import * as State from '../state.js';
import { log } from '../logger.js';

export function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isModelAvailable(model) {
    if (model.excluded) return false;
    if (model.status === 'red') return false;
    if (model.cooldownUntil && model.cooldownUntil > Date.now()) return false;
    return true;
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
    
    const uiModule = import('../ui.js');
    uiModule.then(m => m.renderModelList());
    
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
    
    const uiModule = import('../ui.js');
    uiModule.then(m => m.renderModelList());
}
