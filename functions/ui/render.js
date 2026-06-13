import * as State from '../state.js';
import { truncateName, escapeHtml } from './utils.js';

export function updateConnectionStatusUI() {
    const dot = document.getElementById('connection-state-dot');
    const text = document.getElementById('connection-state-text');
    const urlDisp = document.getElementById('connection-url-display');
    
    if (!dot || !text || !urlDisp) return;
    
    if (State.BASE_URL && State.API_KEY) {
        dot.className = 'status-dot status-green';
        text.innerText = 'Connected';
        urlDisp.innerText = State.BASE_URL;
        urlDisp.title = State.BASE_URL;
    } else {
        dot.className = 'status-dot status-red';
        text.innerText = 'Disconnected';
        urlDisp.innerText = 'No endpoint connected';
        urlDisp.title = '';
    }
}

export function renderModelList() {
    const container = document.getElementById('model-list');
    const countSpan = document.getElementById('pool-count');
    if (!container || !countSpan) return;
    
    container.innerHTML = '';
    const activeCount = State.models.filter(m => m.status === 'green' && !m.excluded).length;
    countSpan.innerText = `${activeCount}/${State.models.length}`;

    updateConnectionStatusUI();

    if (State.models.length === 0) {
        container.innerHTML = '<div class="empty-state">No models loaded. Check your API connection.</div>';
        return;
    }

    if (activeCount === 0 && State.models.length > 0) {
        container.innerHTML = '<div class="empty-state">All models are offline, excluded, or cooling down.</div>';
        return;
    }

    const sortedModels = [...State.models].sort((a, b) => {
        if (a.status !== b.status) {
            const order = { green: 0, yellow: 1, red: 2 };
            return (order[a.status] || 1) - (order[b.status] || 1);
        }
        const latA = State.modelLatency.get(a.id) ?? Infinity;
        const latB = State.modelLatency.get(b.id) ?? Infinity;
        return latA - latB;
    });
    
    sortedModels.forEach(model => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.id = `item-${CSS.escape(model.id)}`;
        
        const latency = State.modelLatency.get(model.id);
        const latencyText = latency ? `${Math.round(latency)}ms` : 'untested';
        
        let cooldownText = '';
        if (model.cooldownUntil && model.cooldownUntil > Date.now()) {
            const remaining = Math.round((model.cooldownUntil - Date.now()) / 1000);
            cooldownText = `<span class="cooldown-timer"><i class="fa-solid fa-hourglass-half"></i> ${remaining}s</span>`;
        }
        
        let tokenWarning = '';
        if (model.tokenLimitHits > 0) {
            tokenWarning = `<span class="token-warning" title="Hit token limit ${model.tokenLimitHits} times" style="color: var(--warning); margin-right: 4px;"><i class="fa-solid fa-triangle-exclamation"></i><i class="fa-solid fa-file-lines"></i></span>`;
        }
        
        div.innerHTML = `
            <div class="model-info">
                <input type="checkbox" class="model-checkbox" ${!model.excluded ? 'checked' : ''} 
                       onchange="window.toggleModelInclusion('${escapeHtml(model.id)}', this.checked)">
                <span class="model-name" title="${model.id}">${truncateName(model.id)}</span>
                <span class="model-latency">${latencyText}</span>
                ${tokenWarning}
                ${cooldownText}
            </div>
            <div class="status-dot status-${model.status}"></div>
        `;
        container.appendChild(div);
    });
}

export function highlightModelInUI(modelId) {
    document.querySelectorAll('.model-item').forEach(el => el.classList.remove('active-llm'));
    const activeRow = document.getElementById(`item-${CSS.escape(modelId)}`);
    if (activeRow) activeRow.classList.add('active-llm');
}

export function renderSessionsDropdown() {
    const menu = document.getElementById('session-dropdown-menu');
    const label = document.getElementById('session-dropdown-label');
    if (!menu || !label) return;
    
    // Update trigger button label to show the active session name
    const active = State.sessions.find(s => s.id === State.currentSessionId);
    if (active) {
        label.innerText = active.name;
    }
    
    // Rebuild the items list
    menu.innerHTML = '';
    State.sessions.forEach(sess => {
        const item = document.createElement('div');
        item.className = 'dropdown-item' + (sess.id === State.currentSessionId ? ' active' : '');
        item.innerHTML = `
            <i class="fa-solid fa-circle-dot"></i>
            <span>${sess.name}</span>
        `;
        item.onclick = () => {
            window.switchSession(sess.id);
            closeSessionDropdown();
        };
        menu.appendChild(item);
    });
}

function closeSessionDropdown() {
    const menu = document.getElementById('session-dropdown-menu');
    const trigger = document.getElementById('session-dropdown-trigger');
    if (menu) menu.classList.remove('open');
    if (trigger) trigger.classList.remove('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('session-dropdown-container');
    if (container && !container.contains(e.target)) {
        closeSessionDropdown();
    }
});


export function updateTokenThermometer() {
    const fill = document.getElementById('token-thermometer-fill');
    const text = document.getElementById('token-thermometer-text');
    if (!fill || !text) return;
    
    const tokenCount = State.estimateTokenCount(State.conversationHistory);
    const maxTokens = State.MAX_TOKENS_PER_MODEL || 2000;
    const percentage = Math.min(Math.round((tokenCount / maxTokens) * 100), 100);
    
    fill.style.width = `${percentage}%`;
    text.innerText = `${tokenCount.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${percentage}%)`;
    
    fill.className = 'token-thermometer-fill';
    if (percentage >= 85) {
        fill.classList.add('danger');
    } else if (percentage >= 60) {
        fill.classList.add('warning');
    }
}
