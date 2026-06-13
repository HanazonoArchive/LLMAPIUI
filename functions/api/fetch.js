import * as State from '../state.js';
import { log } from '../logger.js';
import { loadCooldownState } from './cooldown.js';
import { testModelLatency } from './latency.js';

const PRE_EXCLUDED_IDS = [
    'nemotron-3-ultra-free',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    'auto',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'qwen/qwen3-32b',
    '@cf/openai/gpt-oss-120b'
];

export function createMockModels() {
    // Only create mocks when we have no real models — never overwrite
    if (State.models.length > 0) return;

    const mockPrefixes = [
        'meta-llama/llama-3-70b', 'mistralai/mixtral-8x7b', 'openai/gpt-4o-mini',
        'google/gemma-7b', 'anthropic/claude-3-haiku', 'cohere/command-r'
    ];
    
    const savedExclusions = new Set(JSON.parse(localStorage.getItem('llmapiui_excluded_models') || '[]'));
    const keywords = State.EXCLUDE_KEYWORDS ? State.EXCLUDE_KEYWORDS.split(',').map(kw => kw.trim().toLowerCase()).filter(Boolean) : [];
    
    const fallbackList = [];
    for (let i = 0; i < 12; i++) {
        const mockId = `${mockPrefixes[i % mockPrefixes.length]}-${i+1}`;
        
        const isPreExcluded = PRE_EXCLUDED_IDS.some(pattern => mockId.includes(pattern));
        const isCustomExcluded = keywords.some(keyword => mockId.toLowerCase().includes(keyword));
        const shouldExclude = savedExclusions.has(mockId) || isPreExcluded || isCustomExcluded;

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
            const keywords = State.EXCLUDE_KEYWORDS ? State.EXCLUDE_KEYWORDS.split(',').map(kw => kw.trim().toLowerCase()).filter(Boolean) : [];
            
            const updatedModels = data.data.map(m => {
                const isPreExcluded = PRE_EXCLUDED_IDS.some(pattern => m.id.includes(pattern));
                const isCustomExcluded = keywords.some(keyword => m.id.toLowerCase().includes(keyword));
                const shouldExclude = savedExclusions.has(m.id) || isPreExcluded || isCustomExcluded;
                
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
            
            if (!State.hasCompletedInitialPings) {
                State.setHasCompletedInitialPings(true); 
                log("Starting sequential step-by-step latency baseline checks...", "info");
                
                (async () => {
                    for (const model of updatedModels) {
                        if (!model.excluded && model.status === 'green') {
                            await testModelLatency(model.id);
                        }
                    }
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
        const reason = (err?.message || String(err)).slice(0, 120);
        if (State.models.length === 0) {
            log(`API unreachable (${reason}) — generating mock models for UI continuity only. These models will fail when called. Check your connection and Base URL.`, 'warning');
            createMockModels();
        } else {
            log(`Model refresh failed (${reason}) — keeping previously loaded models.`, 'warning');
        }
    }
    
    import('../ui.js').then(m => m.renderModelList());
}
