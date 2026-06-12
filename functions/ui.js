// ESM Barrel Export for UI Rendering Modules
export { truncateName, escapeHtml } from './ui/utils.js';
export { forwardToTTS } from './ui/tts.js';
export { appendMessage, renderSavedChat, showTypingIndicator, hideTypingIndicator } from './ui/message.js';
export { renderModelList, updateConnectionStatusUI, highlightModelInUI } from './ui/render.js';
export { openSettingsModal, closeSettingsModal, switchSettingsTab, clearMemoryArchiveUI } from './ui/modal.js';
export { renderMemoryClusters } from './ui/memoryViewer.js';

import { openSettingsModal, closeSettingsModal, switchSettingsTab, clearMemoryArchiveUI } from './ui/modal.js';
import { updateConnectionStatusUI } from './ui/render.js';
import { renderMemoryClusters } from './ui/memoryViewer.js';

// Global window event bindings
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.switchSettingsTab = switchSettingsTab;
window.updateConnectionStatusUI = updateConnectionStatusUI;
window.clearMemoryArchiveUI = clearMemoryArchiveUI;
window.renderMemoryClusters = renderMemoryClusters;