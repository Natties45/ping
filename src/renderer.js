/**
 * renderer.js
 * This script runs in the renderer process (the browser window).
 * It handles user interactions, communicates with the main process via the
 * preload script, and updates the DOM.
 *
 * Version 3.1 (Optimized):
 * - Refactored table updates to be more performant.
 * - Instead of re-rendering the entire table on each update, it now finds
 * and updates only the specific row that has changed.
 * - Sorting is now handled by re-ordering existing DOM elements, which is
 * much faster than destroying and recreating them.
 * - Filtering is handled by toggling visibility, avoiding re-renders.
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
const pendingTargetsEl = document.getElementById('pending-targets');

// --- State Management ---
let targetStates = {};
let isMonitoring = false;
let currentFilter = 'all';
let currentSettings = {};
let activeProfileId = '1';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    currentSettings = await window.electronAPI.getSettings();
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
        applyFilter(); // Apply filter without re-rendering
    }
}

// --- UI Logic ---

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
 * Initializes the state and creates the initial table rows.
 * This is the only function that builds the table from scratch.
 * @param {Array<object>} targets - An array of target objects from the main process.
 */
function initializeTable(targets) {
    targetStates = {};
    resultsTbodyEl.innerHTML = ''; // Clear previous results

    if (targets.length === 0) {
        resultsTbodyEl.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--secondary-text-color);"><i>ไม่มีเป้าหมาย...</i></td></tr>`;
        return;
    }

    targets.forEach(target => {
        const state = {
            id: target.id,
            type: target.type,
            status: 'Pending',
            rtt: '-',
            error: 'Waiting for first check...',
            lastChange: null,
            lastChecked: null
        };
        targetStates[target.id] = state;

        const tr = document.createElement('tr');
        tr.id = `target-${state.id}`; // Assign a unique ID for direct access
        tr.dataset.status = state.status.toLowerCase();

        const statusClass = `status-${state.status.toLowerCase()}`;
        
        tr.innerHTML = `
            <td>${state.id}</td>
            <td><span class="status-indicator ${statusClass}"></span>${state.status}</td>
            <td class="secondary">${state.type ? state.type.toUpperCase() : '-'}</td>
            <td>${state.rtt}</td>
            <td class="secondary">${formatDateTime(state.lastChange)}</td>
            <td class="secondary">${formatDateTime(state.lastChecked)}</td>
            <td class="secondary">${state.error || ''}</td>
        `;
        resultsTbodyEl.appendChild(tr);
    });
    sortTable();
}

/**
 * OPTIMIZED: Updates a single row in the table without re-rendering everything.
 * @param {object} state - The updated state object for a single target.
 */
function updateRow(state) {
    const row = document.getElementById(`target-${state.id}`);
    if (!row) return;

    const oldStatus = row.dataset.status;
    const newStatus = state.status.toLowerCase();

    // Update data attribute for filtering and sorting
    row.dataset.status = newStatus;

    // Update cell content
    const statusClass = `status-${newStatus}`;
    const rttDisplay = state.status === 'Online' ? state.rtt : '-';

    row.cells[1].innerHTML = `<span class="status-indicator ${statusClass}"></span>${state.status}`;
    row.cells[3].textContent = rttDisplay;
    row.cells[4].textContent = formatDateTime(state.lastChange);
    row.cells[5].textContent = formatDateTime(state.lastChecked);
    row.cells[6].textContent = state.error || '';

    // If status changed, re-sort the table
    if (oldStatus !== newStatus) {
        sortTable();
    }
    
    // Re-apply the current filter to the updated row
    if (currentFilter !== 'all' && newStatus !== currentFilter) {
        row.style.display = 'none';
    } else {
        row.style.display = '';
    }
}

/**
 * OPTIMIZED: Sorts the table by moving existing DOM elements instead of rebuilding.
 */
function sortTable() {
    const rows = Array.from(resultsTbodyEl.querySelectorAll('tr'));
    const statusOrder = { 'offline': 0, 'pending': 1, 'unknown': 1, 'online': 2 };

    rows.sort((a, b) => {
        const statusA = a.dataset.status;
        const statusB = b.dataset.status;
        const orderA = statusOrder[statusA] ?? 99;
        const orderB = statusOrder[statusB] ?? 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        // If status is the same, sort by ID (original order)
        return a.id.localeCompare(b.id);
    });

    // Re-append rows in the new sorted order
    rows.forEach(row => resultsTbodyEl.appendChild(row));
}


/**
 * OPTIMIZED: Applies the current filter by changing row visibility.
 */
function applyFilter() {
    const rows = resultsTbodyEl.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.dataset.status) { // Ensure it's a data row
            if (currentFilter === 'all' || row.dataset.status === currentFilter) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}


// --- IPC Listeners ---
window.electronAPI.onUpdateSingleResult((result) => {
    if (!targetStates[result.id]) return;
    
    // Merge the new result with the existing state
    targetStates[result.id] = { ...targetStates[result.id], ...result };
    
    updateRow(targetStates[result.id]); // Call the optimized update function
    updateStatusBar();
});

window.electronAPI.onLoadProfileData(({ profileId, targetsText }) => {
    if (isMonitoring) {
        handleStartStopClick();
    }
    activeProfileId = profileId;
    targetsInputEl.value = targetsText;
    initializeTable([]); // Clear table
    updateStatusBar();
});

window.electronAPI.onTriggerSaveProfile((profileId) => {
    const targetsText = targetsInputEl.value;
    window.electronAPI.saveProfileData({ profileId, targetsText });
});

// --- Utility Functions ---

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
