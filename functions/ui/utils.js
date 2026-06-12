export function truncateName(fullName) {
    if (fullName.length <= 35) return fullName;
    return fullName.substring(0, 32) + '...';
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
