/**
 * preload.js
 * This script runs in a privileged environment before the renderer process is loaded.
 * It uses the contextBridge to securely expose specific IPC channels from the
 * main process to the renderer process, rather than exposing the entire ipcRenderer module.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Renderer to Main (one-way or invoke/handle) ---
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    runChecks: (data) => ipcRenderer.send('run-checks', data),
    stopChecks: () => ipcRenderer.send('stop-checks'),
    showNotification: (notification) => ipcRenderer.send('show-notification', notification),
    saveProfileData: (data) => ipcRenderer.send('save-profile-data', data),
    // ADDED: For parsing text in the main process
    parseTextToTargets: (rawText) => ipcRenderer.invoke('parse-text-to-targets', rawText),

    // --- Main to Renderer (one-way) ---
    onUpdateSingleResult: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-single-result', subscription);
        
        return () => ipcRenderer.removeListener('update-single-result', subscription);
    },
    onLoadProfileText: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('load-profile-text', subscription);

        return () => ipcRenderer.removeListener('load-profile-text', subscription);
    },
    onTriggerSaveProfile: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('trigger-save-profile', subscription);

        return () => ipcRenderer.removeListener('trigger-save-profile', subscription);
    }
});
