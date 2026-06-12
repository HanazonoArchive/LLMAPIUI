import * as State from '../state.js';
import { log } from '../logger.js';
import { fetchWithRetry } from './utils.js';

export function recordLatency(modelId, responseTimeMs) {
    const existing = State.modelLatency.get(modelId);
    const newAvg = existing ? existing * 0.7 + responseTimeMs * 0.3 : responseTimeMs;
    State.modelLatency.set(modelId, newAvg);
    State.saveLatencyHistory();
    
    import('../ui.js').then(m => m.renderModelList());
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
