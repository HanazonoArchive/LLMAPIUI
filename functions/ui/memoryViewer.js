import * as State from '../state.js';

export function renderMemoryClusters() {
    const container = document.getElementById('memory-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!State.archiveContextClusters || State.archiveContextClusters.length === 0) {
        container.innerHTML = '<div class="empty-state" style="font-size: 0.75rem; color: var(--text-muted); width: 100%;">No semantic memory tags active.</div>';
        return;
    }
    
    State.archiveContextClusters.forEach(cluster => {
        const tag = typeof cluster === 'string' ? cluster : cluster.tag;
        const weight = typeof cluster === 'string' ? 1.0 : cluster.weight;
        
        const badge = document.createElement('div');
        badge.className = 'memory-tag-badge';
        // Scale opacity according to decay (range 0.4 to 1.0) so tags remain readable but visibly fade
        const opacity = 0.4 + (weight * 0.6);
        badge.style.opacity = opacity;
        
        // Dynamically set CSS variable for border/glow intensity
        badge.style.setProperty('--weight-intensity', weight);
        
        badge.innerHTML = `
            <span class="tag-name" title="${tag} (weight: ${weight.toFixed(2)})">${tag}</span>
            <span class="tag-delete" onclick="window.removeMemoryTag('${tag.replace(/'/g, "\\'")}')" title="Click to forget tag">&times;</span>
        `;
        container.appendChild(badge);
    });
}

// Bind removing tag logic to window
window.removeMemoryTag = function(tag) {
    State.removeArchiveContextTag(tag);
    renderMemoryClusters();
    import('../logger.js').then(m => {
        m.log(`Forgot memory cluster: "${tag}"`, 'warning');
    });
};
