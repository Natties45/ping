/**
 * main.js
 * This is the main process for the Electron application. It handles window
 * creation, background tasks (like network checks), and native OS interactions.
 */

const { app, BrowserWindow, ipcMain, Notification, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ping = require('ping');
const tcpPing = require('tcp-ping');
const puppeteer = require('puppeteer');
const axios = require('axios');
// const CIDR = require('ip-cidr'); // REMOVED: We will import it dynamically

// --- Global variables ---
let checkInterval;
let browserInstance;
let isCycleRunning = false;

// --- Puppeteer Setup ---
async function initializeBrowser() {
    if (browserInstance) return;
    try {
        console.log('[Main Process] กำลังเริ่มต้นเบราว์เซอร์ (Puppeteer)...');
        browserInstance = await puppeteer.launch({ headless: true });
        console.log('[Main Process] เบราว์เซอร์เริ่มต้นสำเร็จแล้ว');
    } catch (error) {
        console.error('[Main Process] ไม่สามารถเริ่มต้น Puppeteer ได้:', error);
    }
}

// --- Configuration file setup & Profile Management ---
const userDataPath = app.getPath('userData');
const settingsFilePath = path.join(userDataPath, 'settings.json');

function readSettings() {
    try {
        if (fs.existsSync(settingsFilePath)) {
            const rawData = fs.readFileSync(settingsFilePath);
            return rawData.length > 0 ? JSON.parse(rawData) : {};
        }
        const defaultSettings = {
            interval: 10, timeout: 10,
            windowBounds: { width: 1000, height: 700 }
        };
        fs.writeFileSync(settingsFilePath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    } catch (error) {
        console.error("[Main Process] Error reading settings file:", error);
        return {};
    }
}

function saveSettings(settings) {
    try {
        const settingsToSave = {
            interval: settings.interval,
            timeout: settings.timeout,
            windowBounds: settings.windowBounds
        };
        fs.writeFileSync(settingsFilePath, JSON.stringify(settingsToSave, null, 2));
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
            message: `Profile ${profileId} has been saved successfully.`
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

    const newWindow = new BrowserWindow({
        width: windowBounds.width, height: windowBounds.height,
        minWidth: 800, minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    newWindow.on('close', () => {
        if (BrowserWindow.getAllWindows().length === 1) {
            const currentSettings = readSettings();
            saveSettings({ ...currentSettings, windowBounds: newWindow.getBounds() });
        }
    });

    newWindow.loadFile('src/index.html');
}

// --- Custom Menu Setup ---
const menuTemplate = [
    {
        label: 'File',
        submenu: [
            { label: 'New Window', click: () => createWindow() },
            { type: 'separator' },
            {
                label: 'Open Profile',
                submenu: [1, 2, 3].map(id => ({
                    label: `Profile ${id}`,
                    click: (menuItem, browserWindow) => {
                        browserWindow.webContents.send('load-profile-text', loadProfile(id));
                    }
                }))
            },
            {
                label: 'Save Profile',
                submenu: [1, 2, 3].map(id => ({
                    label: `Profile ${id}`,
                    click: (menuItem, browserWindow) => {
                        browserWindow.webContents.send('trigger-save-profile', id);
                    }
                }))
            },
            { type: 'separator' },
            { role: 'quit' }
        ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }] },
    {
        label: 'Help',
        submenu: [
            { label: 'Toggle Developer Tools', role: 'toggleDevTools' },
            {
                label: 'About Network Monitor',
                click: () => {
                    dialog.showMessageBox(null, {
                        type: 'info', title: 'About Network Monitor',
                        message: 'Network Monitor v1.2',
                        detail: 'Added Subnet Ping, Start/Stop control, and status filters.'
                    });
                }
            }
        ]
    }
];
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

// --- App Lifecycle Events ---
app.whenReady().then(async () => {
    await initializeBrowser();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', async () => {
    if (browserInstance) await browserInstance.close();
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.handle('get-settings', async () => readSettings());
ipcMain.on('save-settings', (event, settings) => saveSettings(settings));
ipcMain.on('show-notification', (event, { title, body }) => new Notification({ title, body, silent: false }).show());
ipcMain.on('save-profile-data', (event, { profileId, targetsText }) => saveProfile(profileId, targetsText));
ipcMain.on('stop-checks', () => {
    if (checkInterval) clearInterval(checkInterval);
    isCycleRunning = false;
});

// --- MODIFIED: Changed to async and uses dynamic import() ---
ipcMain.handle('parse-text-to-targets', async (event, rawText) => {
    const { default: CIDR } = await import('ip-cidr'); // Dynamic import
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    const targets = [];
    
    lines.forEach(line => {
        line = line.trim();
        
        if (CIDR.isValidCIDR(line)) {
            const cidr = new CIDR(line);
            const ips = cidr.toArray({ from: 1, limit: cidr.count() - 2 });
            ips.forEach(ip => {
                targets.push({ id: ip, type: 'ping', host: ip });
            });
        } else {
            const hostPortMatch = line.match(/^([a-zA-Z0-9.-]+):([0-9,]+)\/?$/);
            if (hostPortMatch) {
                const host = hostPortMatch[1];
                const ports = hostPortMatch[2].split(',').map(p => p.trim()).filter(p => p);
                ports.forEach(port => {
                    targets.push({ id: `${host}:${port}`, type: 'tcp', host, port: parseInt(port, 10) });
                });
            } else {
                const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
                if (ipRegex.test(line)) {
                    targets.push({ id: line, type: 'ping', host: line });
                } else {
                    let host = line;
                    if (!host.startsWith('http')) host = 'https://' + host;
                    targets.push({ id: line, type: 'http', host });
                }
            }
        }
    });
    return targets;
});


ipcMain.on('run-checks', (event, { targets, settings }) => {
    if (checkInterval) clearInterval(checkInterval);
    if (!targets || targets.length === 0) return;

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
                
                checkTarget(target, settings.timeout)
                    .then(result => {
                        BrowserWindow.getAllWindows().forEach(win => {
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('update-single-result', result);
                            }
                        });
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

// --- Core Checking Logic ---
async function checkTarget(target, timeout) {
    let result = { id: target.id, status: 'Offline', rtt: -1, error: 'Unknown check type' };
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
                    const url = new URL(target.host);
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
    return result;
}
