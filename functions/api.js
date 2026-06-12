// ESM Barrel Export for API Modules
export { wait, isModelAvailable, fetchWithRetry, autoExcludeModel, handleTokenLimitExceeded } from './api/utils.js';
export { loadCooldownState, triggerCooldown, startHealthChecks } from './api/cooldown.js';
export { recordLatency, testModelLatency } from './api/latency.js';
export { createMockModels, fetchModels } from './api/fetch.js';
export { callModel, callModelStream } from './api/call.js';
export { trimConversationHistory } from './api/trim.js';

import { testModelLatency } from './api/latency.js';
import * as State from './state.js';
import { log } from './logger.js';

// Global window event bindings
window.toggleModelInclusion = function(modelId, isIncluded) {
    const model = State.models.find(m => m.id === modelId);
    if (model) {
        model.excluded = !isIncluded;
        model.status = isIncluded ? 'green' : 'red';
        if (!isIncluded) model.cooldownUntil = null;
        
        log(`Model [${model.id}] ${isIncluded ? 'enabled' : 'disabled'}`, isIncluded ? 'success' : 'warning');
        State.saveExclusionState();
        State.saveCooldownState();
        
        // Render model list dynamically
        import('./ui.js').then(m => m.renderModelList());
    }
};

window.testModelLatency = testModelLatency;