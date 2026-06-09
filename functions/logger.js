export function log(message, type = 'info') {
    const logsContainer = document.getElementById('logs');
    if (!logsContainer) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    
    let icon = '📘';
    if (type === 'error') icon = '❌';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'yellow') icon = '⏳';
    
    entry.innerHTML = `<span style="color:#6e6e8a">[${time}]</span> ${icon} ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    console.log(`[${type}] ${message}`);
}

export function clearLogs() {
    const logsContainer = document.getElementById('logs');
    if (logsContainer) {
        logsContainer.innerHTML = '<div class="log-entry">Logs cleared.</div>';
    }
}