/**
 * renderer.js
 * This script runs in the renderer process (the browser window).
 * It handles user interactions, communicates with the main process via the
 * preload script, and updates the DOM.
 *
 * Version 3.0: Major UI overhaul with resizable panels and detailed results table.
 */

// --- DOM Elements ---
const targetsInputEl = document.getElementById('targets-input');
const startStopButton = document.getElementById('start-stop-button');
const buttonIcon = document.getElementById('button-icon');
const buttonText = document.getElementById('button-text');
const filterBar = document.querySelector('.filter-bar');
const resultsTbodyEl = document.getElementById('results-tbody');
const totalTargetsEl = document.getElementById('total-targets');
const onlineTargetsEl = document.getElementById('online-targets');
const offlineTargetsEl = document.getElementById('offline-targets');
const pendingTargetsEl = document.getElementById('pending-targets'); // Added

// --- State Management ---
let targetStates = {};
let isMonitoring = false;
let currentFilter = 'all';
let currentSettings = {};
let activeProfileId = '1';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    currentSettings = await window.electronAPI.getSettings();
    initializeTable([]);
    updateStatusBar();
    initializeSplitter(); // Setup the resizable panel logic

    // Event Listeners
    startStopButton.addEventListener('click', handleStartStopClick);
    filterBar.addEventListener('click', handleFilterClick);
});

// --- Event Handlers ---
async function handleStartStopClick() {
    isMonitoring = !isMonitoring;
    updateButtonState();

    if (isMonitoring) {
        currentSettings = await window.electronAPI.getSettings();
        const settingsForRun = {
            interval: currentSettings.interval,
            timeout: currentSettings.timeout
        };
        const targets = await window.electronAPI.parseTextToTargets(targetsInputEl.value);
        
        initializeTable(targets);
        updateStatusBar();
        window.electronAPI.runChecks({ targets, settings: settingsForRun, activeProfileId });
    } else {
        window.electronAPI.stopChecks();
    }
}

function handleFilterClick(event) {
    if (event.target.classList.contains('filter-button')) {
        currentFilter = event.target.dataset.filter;
        document.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        renderTable();
    }
}

// --- UI Logic ---

/**
 * Sets up the logic for the draggable splitter between top and bottom panels.
 */
function initializeSplitter() {
    const splitter = document.querySelector('.splitter');
    const topPanel = document.querySelector('.top-panel');
    const container = document.querySelector('.container');

    let isDragging = false;

    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const containerRect = container.getBoundingClientRect();
        let newTopPanelHeight = e.clientY - containerRect.top;

        const minHeight = 100;
        const maxHeight = container.clientHeight - 200;
        
        if (newTopPanelHeight < minHeight) newTopPanelHeight = minHeight;
        if (newTopPanelHeight > maxHeight) newTopPanelHeight = maxHeight;

        topPanel.style.height = `${newTopPanelHeight}px`;
    });
}

function updateButtonState() {
    if (isMonitoring) {
        startStopButton.className = 'stop';
        buttonIcon.className = 'ph-bold ph-stop';
        buttonText.textContent = 'Stop';
        targetsInputEl.disabled = true;
    } else {
        startStopButton.className = 'start';
        buttonIcon.className = 'ph-bold ph-play';
        buttonText.textContent = 'Start';
        targetsInputEl.disabled = false;
    }
}

/**
 * Initializes the state for all targets and renders the table for the first time.
 * @param {Array<object>} targets - An array of target objects from the main process.
 */
function initializeTable(targets) {
    targetStates = {};
    targets.forEach(target => {
        targetStates[target.id] = {
            id: target.id,
            type: target.type,
            status: 'Pending', // Start as Pending
            rtt: '-',
            error: 'Waiting for first check...',
            lastChange: null,
            lastChecked: null
        };
    });
    renderTable();
}

// --- IPC Listeners ---
window.electronAPI.onUpdateSingleResult((result) => {
    if (!targetStates[result.id]) return;
    
    // Merge the new result with the existing state
    targetStates[result.id] = { ...targetStates[result.id], ...result };
    
    renderTable();
    updateStatusBar();
});

window.electronAPI.onLoadProfileData(({ profileId, targetsText }) => {
    if (isMonitoring) {
        handleStartStopClick();
    }
    activeProfileId = profileId;
    targetsInputEl.value = targetsText;
    initializeTable([]);
    updateStatusBar();
});

window.electronAPI.onTriggerSaveProfile((profileId) => {
    const targetsText = targetsInputEl.value;
    window.electronAPI.saveProfileData({ profileId, targetsText });
});

// --- Rendering ---

/**
 * Renders the entire results table based on the current targetStates and filter.
 */
function renderTable() {
    resultsTbodyEl.innerHTML = '';

    const sortedTargets = Object.values(targetStates).sort((a, b) => {
        const statusOrder = { 'Offline': 0, 'Pending': 1, 'Unknown': 1, 'Online': 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        return a.id.localeCompare(b.id);
    });

    if (sortedTargets.length === 0) {
        resultsTbodyEl.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--secondary-text-color);"><i>ไม่มีเป้าหมาย...</i></td></tr>`;
        return;
    }

    sortedTargets.forEach(state => {
        const tr = document.createElement('tr');
        const status = state.status || 'Unknown';
        tr.dataset.status = status.toLowerCase();

        if (currentFilter !== 'all' && tr.dataset.status !== currentFilter) {
            tr.style.display = 'none';
        }

        const statusClass = `status-${status.toLowerCase()}`;
        const rttDisplay = status === 'Online' ? state.rtt : '-';
        
        tr.innerHTML = `
            <td>${state.id}</td>
            <td><span class="status-indicator ${statusClass}"></span>${status}</td>
            <td class="secondary">${state.type ? state.type.toUpperCase() : '-'}</td>
            <td>${rttDisplay}</td>
            <td class="secondary">${formatDateTime(state.lastChange)}</td>
            <td class="secondary">${formatDateTime(state.lastChecked)}</td>
            <td class="secondary">${state.error || ''}</td>
        `;
        resultsTbodyEl.appendChild(tr);
    });
}

/**
 * Updates the counts in the status bar.
 */
function updateStatusBar() {
    const allTargets = Object.values(targetStates);
    const total = allTargets.length;
    const online = allTargets.filter(t => t.status === 'Online').length;
    const offline = allTargets.filter(t => t.status === 'Offline').length;
    const pending = allTargets.filter(t => t.status === 'Pending' || t.status === 'Unknown').length;

    totalTargetsEl.textContent = `Targets: ${total}`;
    onlineTargetsEl.textContent = `Online: ${online}`;
    offlineTargetsEl.textContent = `Offline: ${offline}`;
    pendingTargetsEl.textContent = `Pending: ${pending}`;
}

/**
 * Formats an ISO date string into a more readable local format.
 * @param {string | null} isoString - The ISO date string to format.
 * @returns {string} The formatted date string or '-'.
 */
function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        const options = {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        return new Intl.DateTimeFormat('th-TH', options).format(date);
    } catch (e) {
        return '-';
    }
}
