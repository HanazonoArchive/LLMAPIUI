export function log(message, type = 'info') {
    const logsContainer = document.getElementById('logs');
    if (!logsContainer) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    
    // Determine the Font Awesome icon based on the log type
    let iconClass = 'fa-solid fa-circle-info'; // Default blue info icon
    switch (type) {
        case 'error':
            iconClass = 'fa-solid fa-circle-xmark';
            break;
        case 'success':
            iconClass = 'fa-solid fa-circle-check';
            break;
        case 'warning':
            iconClass = 'fa-solid fa-triangle-exclamation';
            break;
        case 'yellow':
            iconClass = 'fa-solid fa-hourglass-half';
            break;
    }
    
    // Create the icon HTML string
    const iconHtml = `<i class="${iconClass} log-icon-${type}"></i>`;
    
    // Inject into the entry template
    entry.innerHTML = `<span style="color:#6e6e8a">[${time}]</span> ${iconHtml} ${message}`;
    
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    console.log(`[${type}] ${message}`);
}

export function clearLogs() {
    const logsContainer = document.getElementById('logs');
    if (logsContainer) {
        // Added a little trash can icon to the cleared message for consistency!
        logsContainer.innerHTML = '<div class="log-entry"><i class="fa-solid fa-trash-can"></i> Logs cleared.</div>';
    }
}