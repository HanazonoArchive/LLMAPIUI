/**
 * sidebar.js
 * Handles sidebar-specific interactions: toggling visibility,
 * rendering any sidebar-level state that isn't model pool specific.
 * The model pool rendering lives in render.js.
 */

/**
 * Animates the sidebar in or out (future collapsible sidebar support).
 * @param {boolean} visible
 */
export function setSidebarVisible(visible) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.style.width = visible ? 'var(--sidebar-w)' : '0';
    sidebar.style.overflow = visible ? '' : 'hidden';
}
