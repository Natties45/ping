/**
 * main.js
 * This is the main process for the Electron application. It handles window
 * creation, background tasks (like network checks), and native OS interactions.
 *
 * Version 2.1: Updated checkTarget to return more detailed results for the new UI.
 */

const { app, BrowserWindow, ipcMain, Notification, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ping = require('ping');
const tcpPing = require('tcp-ping');
const axios = require('axios');

// --- Global variables ---
let checkInterval;
let isCycleRunning = false;
let mainWindow = null;
let settingsWindow = null;
const targetStatusCache = new Map(); // Cache to track status changes

// --- Configuration file setup & Profile Management ---
const userDataPath = app.getPath('userData');
const settingsFilePath = path.join(userDataPath, 'settings.json');

function readSettings() {
    const defaultSettings = {
        interval: 10,
        timeout: 5,
        profiles: {
            "1": { name: "Profile 1", telegram_enabled: false, telegram_token: "", telegram_chat_id: "" },
            "2": { name: "Profile 2", telegram_enabled: false, telegram_token: "", telegram_chat_id: "" },
            "3": { name: "Profile 3", telegram_enabled: false, telegram_token: "", telegram_chat_id: "" }
        },
        windowBounds: { width: 1000, height: 700 }
    };
    try {
        if (fs.existsSync(settingsFilePath)) {
            const rawData = fs.readFileSync(settingsFilePath);
            const readData = JSON.parse(rawData.toString() || '{}');
            const settings = { ...defaultSettings, ...readData };
            settings.profiles = { ...defaultSettings.profiles, ...readData.profiles };
            for (const key in settings.profiles) {
                 settings.profiles[key] = { ...defaultSettings.profiles[key], ...readData.profiles?.[key] };
            }
            return settings;
        }
        fs.writeFileSync(settingsFilePath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    } catch (error) {
        console.error("[Main Process] Error reading settings file, restoring defaults:", error);
        fs.writeFileSync(settingsFilePath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    }
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
        buildMenu();
    } catch (error) {
        console.error("[Main Process] Error saving settings file:", error);
    }
}

function getProfilePath(profileId) { return path.join(userDataPath, `profile${profileId}.json`); }

function saveProfile(profileId, targetsText) {
    try {
        const profilePath = getProfilePath(profileId);
        fs.writeFileSync(profilePath, JSON.stringify({ targetsText }, null, 2));
        dialog.showMessageBox(null, {
            type: 'info', title: 'Profile Saved',
            message: `Profile has been saved successfully.`
        });
    } catch (error) { console.error(`[Main Process] ไม่สามารถบันทึก Profile ${profileId}:`, error); }
}

function loadProfile(profileId) {
    try {
        const profilePath = getProfilePath(profileId);
        if (fs.existsSync(profilePath)) {
            const rawData = fs.readFileSync(profilePath);
            return JSON.parse(rawData).targetsText;
        }
        return '';
    } catch (error) {
        console.error(`[Main Process] ไม่สามารถโหลด Profile ${profileId}:`, error);
        return '';
    }
}

function createWindow() {
    const settings = readSettings();
    const windowBounds = settings?.windowBounds || { width: 1000, height: 700 };
    mainWindow = new BrowserWindow({
        width: windowBounds.width, height: windowBounds.height,
        minWidth: 800, minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });
    mainWindow.on('close', () => {
        const currentSettings = readSettings();
        saveSettings({ ...currentSettings, windowBounds: mainWindow.getBounds() });
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadFile('src/index.html');
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 640, height: 580,
        resizable: false, parent: mainWindow, modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
        show: false, frame: false, backgroundColor: '#1e1e1e'
    });
    settingsWindow.loadFile('src/settings.html');
    settingsWindow.once('ready-to-show', () => { settingsWindow.show(); });
    settingsWindow.on('closed', () => { settingsWindow = null; });
}

function buildMenu() {
    const settings = readSettings();
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                { label: 'New Window', click: () => createWindow() },
                { type: 'separator' },
                {
                    label: 'Open Profile',
                    submenu: [1, 2, 3].map(id => ({
                        label: settings.profiles[id]?.name || `Profile ${id}`,
                        click: () => {
                            if (!mainWindow) return;
                            const targetsText = loadProfile(id);
                            mainWindow.webContents.send('load-profile-data', { profileId: id, targetsText });
                        }
                    }))
                },
                {
                    label: 'Save Profile',
                    submenu: [1, 2, 3].map(id => ({
                        label: settings.profiles[id]?.name || `Profile ${id}`,
                        click: () => {
                            if (!mainWindow) return;
                            mainWindow.webContents.send('trigger-save-profile', id);
                        }
                    }))
                },
                { type: 'separator' },
                { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => createSettingsWindow() },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }] },
        {
            label: 'Help',
            submenu: [
                { role: 'toggleDevTools' },
                {
                    label: 'About Network Monitor',
                    click: () => {
                        dialog.showMessageBox(null, {
                            type: 'info', title: 'About Network Monitor',
                            message: 'Network Monitor v2.1',
                            detail: 'Redesigned main UI with resizable panels and more detailed results.'
                        });
                    }
                }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-settings', async () => readSettings());
ipcMain.on('save-settings', (event, settings) => saveSettings(settings));
ipcMain.on('close-settings-window', () => { if (settingsWindow) settingsWindow.close(); });
ipcMain.on('save-profile-data', (event, { profileId, targetsText }) => saveProfile(profileId, targetsText));
ipcMain.on('stop-checks', () => {
    if (checkInterval) clearInterval(checkInterval);
    isCycleRunning = false;
    targetStatusCache.clear(); // Clear cache on stop
});

ipcMain.handle('parse-text-to-targets', async (event, rawText) => {
    const { default: CIDR } = await import('ip-cidr');
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    const targets = [];
    lines.forEach(line => {
        line = line.trim();
        if (CIDR.isValidCIDR(line)) {
            const cidr = new CIDR(line);
            const ips = cidr.toArray({ from: 1, limit: cidr.count() - 2 });
            ips.forEach(ip => targets.push({ id: ip, type: 'ping', host: ip }));
        } else {
            const hostPortMatch = line.match(/^([a-zA-Z0-9.-]+):([0-9,]+)\/?$/);
            if (hostPortMatch) {
                const host = hostPortMatch[1];
                const ports = hostPortMatch[2].split(',').map(p => p.trim()).filter(p => p);
                ports.forEach(port => targets.push({ id: `${host}:${port}`, type: 'tcp', host, port: parseInt(port, 10) }));
            } else {
                const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
                if (ipRegex.test(line)) {
                    targets.push({ id: line, type: 'ping', host: line });
                } else {
                    targets.push({ id: line, type: 'http', host: line });
                }
            }
        }
    });
    return targets;
});

ipcMain.on('run-checks', (event, { targets, settings, activeProfileId }) => {
    if (checkInterval) clearInterval(checkInterval);
    if (!targets || targets.length === 0) return;
    targetStatusCache.clear(); // Clear cache on new run

    const runCycle = () => {
        if (isCycleRunning) return;
        isCycleRunning = true;
        const queue = [...targets];
        const CONCURRENCY_LIMIT = 5;
        let activeChecks = 0;
        const processQueue = () => {
            while (queue.length > 0 && activeChecks < CONCURRENCY_LIMIT) {
                activeChecks++;
                const target = queue.shift();
                checkTarget(target, settings.timeout, activeProfileId)
                    .then(result => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('update-single-result', result);
                        }
                    })
                    .finally(() => {
                        activeChecks--;
                        if (queue.length === 0 && activeChecks === 0) {
                            isCycleRunning = false;
                        }
                        processQueue();
                    });
            }
        };
        processQueue();
    };
    runCycle();
    checkInterval = setInterval(runCycle, settings.interval * 1000);
});

async function sendTelegramNotification(message, profileId) {
    const settings = readSettings();
    const profile = settings.profiles[profileId];
    if (profile && profile.telegram_enabled && profile.telegram_token && profile.telegram_chat_id) {
        const url = `https://api.telegram.org/bot${profile.telegram_token}/sendMessage`;
        try {
            await axios.post(url, { chat_id: profile.telegram_chat_id, text: message, parse_mode: 'Markdown' });
        } catch (error) {
            console.error('[Main Process] Failed to send Telegram notification:', error.response?.data || error.message);
        }
    }
}

/**
 * UPDATED: Now returns a more detailed result object including type, lastChecked, and lastChange.
 */
async function checkTarget(target, timeout, activeProfileId) {
    const previousState = targetStatusCache.get(target.id) || {};
    let result = {
        id: target.id,
        type: target.type,
        status: 'Offline',
        rtt: -1,
        error: 'Unknown check type',
        lastChecked: new Date().toISOString(),
        lastChange: previousState.lastChange || null
    };

    try {
        switch (target.type) {
            case 'ping':
                const pingRes = await ping.promise.probe(target.host, { timeout });
                result = { ...result, status: pingRes.alive ? 'Online' : 'Offline', rtt: pingRes.alive ? Math.round(pingRes.time) : -1, error: pingRes.alive ? '' : 'No reply' };
                break;
            case 'tcp':
                const tcpRes = await new Promise(resolve => tcpPing.ping({ address: target.host, port: target.port, timeout: timeout * 1000 }, (err, data) => resolve({ err, data })));
                if (!tcpRes.err && !isNaN(tcpRes.data.avg)) {
                    result = { ...result, status: 'Online', rtt: Math.round(tcpRes.data.avg), error: '' };
                } else {
                    result.error = 'Connection refused or timed out';
                }
                break;
            case 'http':
                try {
                    const url = new URL(target.host.startsWith('http') ? target.host : `https://${target.host}`);
                    const httpPingRes = await ping.promise.probe(url.hostname, { timeout });
                    result = { ...result, status: httpPingRes.alive ? 'Online' : 'Offline', rtt: httpPingRes.alive ? Math.round(httpPingRes.time) : -1, error: httpPingRes.alive ? '' : 'No reply' };
                } catch (e) {
                    result.error = "Invalid URL for ping";
                }
                break;
        }
    } catch (error) {
        result.error = 'Check failed';
    }

    if (previousState.status && previousState.status !== result.status) {
        result.lastChange = new Date().toISOString(); // Update lastChange time
        const title = result.status === 'Offline' ? '🚨 Target Down' : '✅ Target Resolved';
        const body = `${target.id} is now ${result.status}.`;
        new Notification({ title, body, silent: false }).show();
        sendTelegramNotification(body, activeProfileId);
    }
    
    targetStatusCache.set(target.id, {
        status: result.status,
        lastChange: result.lastChange
    });

    return result;
}
