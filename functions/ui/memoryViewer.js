import * as State from '../state.js';
import { fetchMemoriesList } from '../rag/client.js';

export async function renderMemoryClusters() {
    const container = document.getElementById('memory-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Fetch memories list from backend
    const memories = await fetchMemoriesList(State.currentSessionId);
    
    if (!memories || memories.length === 0) {
        container.innerHTML = '<div class="empty-state" style="font-size: 0.75rem; color: var(--text-muted); width: 100%;">No semantic memories archived.</div>';
        return;
    }
    
    // Sort from newest to oldest
    const sorted = [...memories].reverse();
    
    sorted.forEach((mem, index) => {
        const card = document.createElement('div');
        card.className = 'memory-tag-badge';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'flex-start';
        card.style.padding = '8px 12px';
        card.style.width = '100%';
        card.style.height = 'auto';
        card.style.borderRadius = 'var(--radius-md)';
        card.style.border = '1px solid var(--border)';
        card.style.background = 'var(--bg-elevated)';
        card.style.marginBottom = '8px';
        card.style.cursor = 'help';
        card.style.animation = 'tagAppear 0.3s ease forwards';
        
        // Truncate text for user query and response
        const queryTruncated = mem.user.length > 50 ? mem.user.substring(0, 50) + '...' : mem.user;
        const answerTruncated = mem.assistant.length > 60 ? mem.assistant.substring(0, 60) + '...' : mem.assistant;
        
        card.title = `Full Memory Turn:\nUser: ${mem.user}\nAssistant: ${mem.assistant}`;
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.68rem; color: var(--accent-light); font-weight: 600; margin-bottom: 4px; font-family: 'JetBrains Mono', monospace;">
                <i class="fa-solid fa-brain" style="font-size: 0.65rem;"></i> MEMORY #${memories.length - index}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-primary); font-weight: 500; margin-bottom: 2px;">
                "${queryTruncated}"
            </div>
            <div style="font-size: 0.65rem; color: var(--text-muted); line-height: 1.3;">
                ${answerTruncated}
            </div>
        `;
        container.appendChild(card);
    });
}
