/**
 * renderer.js
 * This script runs in the renderer process (the browser window).
 * It handles user interactions, communicates with the main process via the
 * preload script, and updates the DOM.
 */
// const CIDR = require('ip-cidr'); // REMOVED: This logic is now in the main process.

// --- DOM Elements ---
const targetsInputEl = document.getElementById('targets-input');
const intervalInputEl = document.getElementById('interval-input');
const timeoutInputEl = document.getElementById('timeout-input');
const startStopButton = document.getElementById('start-stop-button');
const buttonIcon = document.getElementById('button-icon');
const buttonText = document.getElementById('button-text');
const warningMessage = document.getElementById('warning-message');
const warningText = document.getElementById('warning-text');
const filterBar = document.querySelector('.filter-bar');
const resultsTbodyEl = document.getElementById('results-tbody');
const totalTargetsEl = document.getElementById('total-targets');
const onlineTargetsEl = document.getElementById('online-targets');
const offlineTargetsEl = document.getElementById('offline-targets');

// --- State Management ---
let targetStates = {};
let isMonitoring = false;
let currentFilter = 'all';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await window.electronAPI.getSettings();
    intervalInputEl.value = settings.interval || 10;
    timeoutInputEl.value = settings.timeout || 10;

    initializeTable([]);
    updateStatusBar();

    // Event Listeners
    startStopButton.addEventListener('click', handleStartStopClick);
    filterBar.addEventListener('click', handleFilterClick);
    targetsInputEl.addEventListener('input', checkSubnetWarnings);
});

// --- Event Handlers ---
async function handleStartStopClick() {
    isMonitoring = !isMonitoring;
    updateButtonState();

    if (isMonitoring) {
        const settings = {
            interval: parseInt(intervalInputEl.value, 10),
            timeout: parseInt(timeoutInputEl.value, 10)
        };
        // MODIFIED: Parsing is now done in the main process
        const targets = await window.electronAPI.parseTextToTargets(targetsInputEl.value);
        
        initializeTable(targets);
        updateStatusBar();
        window.electronAPI.runChecks({ targets, settings });
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

// Warning check is now simpler, just based on text, not full parsing
function checkSubnetWarnings() {
    const lines = targetsInputEl.value.trim().split('\n');
    let hasLargeSubnet = false;

    lines.forEach(line => {
        const match = line.match(/\/(\d+)$/);
        if (match && parseInt(match[1], 10) < 24) {
            hasLargeSubnet = true;
        }
    });

    if (hasLargeSubnet) {
        warningText.textContent = `การสแกน Subnet ขนาดใหญ่อาจใช้เวลานานมาก`;
        warningMessage.style.display = 'flex';
    } else {
        warningMessage.style.display = 'none';
    }
}

// --- Core Logic ---
function updateButtonState() {
    if (isMonitoring) {
        startStopButton.className = 'stop';
        buttonIcon.className = 'ph-bold ph-stop';
        buttonText.textContent = 'Stop';
        targetsInputEl.disabled = true;
        intervalInputEl.disabled = true;
        timeoutInputEl.disabled = true;
    } else {
        startStopButton.className = 'start';
        buttonIcon.className = 'ph-bold ph-play';
        buttonText.textContent = 'Start';
        targetsInputEl.disabled = false;
        intervalInputEl.disabled = false;
        timeoutInputEl.disabled = false;
    }
}

function initializeTable(targets) {
    targetStates = {};
    targets.forEach(target => {
        targetStates[target.id] = {
            id: target.id,
            status: 'Unknown',
            rtt: '-',
            error: 'Waiting for first check...',
            lastChange: null
        };
    });
    renderTable();
}

// --- IPC Listeners ---
window.electronAPI.onUpdateSingleResult((result) => {
    if (!targetStates[result.id]) return;

    const previousState = targetStates[result.id];
    const hasChanged = previousState.status !== result.status && previousState.status !== 'Unknown';

    targetStates[result.id] = {
        ...result,
        lastChange: hasChanged ? new Date() : previousState.lastChange,
    };
    
    if (hasChanged) {
        handleNotifications([{
            id: result.id,
            oldStatus: previousState.status,
            newStatus: result.status,
            error: result.error
        }]);
    }
    
    renderTable();
    updateStatusBar();
});

window.electronAPI.onLoadProfileText((text) => {
    if (isMonitoring) {
        handleStartStopClick();
    }
    targetsInputEl.value = text;
    initializeTable([]);
    updateStatusBar();
    checkSubnetWarnings();
});

window.electronAPI.onTriggerSaveProfile((profileId) => {
    const targetsText = targetsInputEl.value;
    window.electronAPI.saveProfileData({ profileId, targetsText });
});

// --- Rendering ---
function renderTable() {
    resultsTbodyEl.innerHTML = '';

    const sortedTargets = Object.values(targetStates).sort((a, b) => {
        const statusOrder = { 'Offline': 0, 'Unknown': 1, 'Online': 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        return a.id.localeCompare(b.id);
    });

    if (sortedTargets.length === 0) {
        resultsTbodyEl.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--secondary-text-color);"><i>ไม่มีเป้าหมาย...</i></td></tr>`;
        return;
    }

    sortedTargets.forEach(state => {
        const tr = document.createElement('tr');
        tr.dataset.status = state.status.toLowerCase();

        if (currentFilter !== 'all' && tr.dataset.status !== currentFilter) {
            tr.style.display = 'none';
        }

        const statusClass = `status-${(state.status || 'unknown').toLowerCase()}`;
        const rttDisplay = state.status === 'Online' ? `<span class="rtt-value">${state.rtt}</span>` : '-';
        
        tr.innerHTML = `
            <td>${state.id}</td>
            <td><span class="status-indicator ${statusClass}"></span>${state.status}</td>
            <td>${rttDisplay}</td>
            <td>${state.error || ''}</td>
        `;
        resultsTbodyEl.appendChild(tr);
    });
}

function updateStatusBar() {
    const allTargets = Object.values(targetStates);
    const total = allTargets.length;
    const online = allTargets.filter(t => t.status === 'Online').length;
    const offline = total - online;

    totalTargetsEl.textContent = `Targets: ${total}`;
    onlineTargetsEl.textContent = `Online: ${online}`;
    offlineTargetsEl.textContent = `Offline: ${offline}`;
}

function handleNotifications(changes) {
    changes.forEach(change => {
        let notification;
        if (change.newStatus === 'Offline') {
            notification = {
                title: '🚨 Target Down',
                body: `${change.id} is now offline. Reason: ${change.error}`
            };
        } else if (change.newStatus === 'Online' && change.oldStatus === 'Offline') {
            notification = {
                title: '✅ Target Resolved',
                body: `${change.id} is back online.`
            };
        }
        if (notification) window.electronAPI.showNotification(notification);
    });
}
