/**
 * preload.js
 * This script runs in a privileged environment before the renderer process is loaded.
 * It uses the contextBridge to securely expose specific IPC channels from the
 * main process to the renderer process, rather than exposing the entire ipcRenderer module.
 *
 * Version 2.0: Added channels for the new Settings window.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Renderer to Main (one-way or invoke/handle) ---
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    runChecks: (data) => ipcRenderer.send('run-checks', data),
    stopChecks: () => ipcRenderer.send('stop-checks'),
    saveProfileData: (data) => ipcRenderer.send('save-profile-data', data),
    parseTextToTargets: (rawText) => ipcRenderer.invoke('parse-text-to-targets', rawText),
    
    // --- New APIs for Settings Window ---
    closeSettingsWindow: () => ipcRenderer.send('close-settings-window'),

    // --- Main to Renderer (one-way) ---
    onUpdateSingleResult: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-single-result', subscription);
        
        return () => ipcRenderer.removeListener('update-single-result', subscription);
    },
    // UPDATED: Now sends an object with profileId and targetsText
    onLoadProfileData: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('load-profile-data', subscription);

        return () => ipcRenderer.removeListener('load-profile-data', subscription);
    },
    onTriggerSaveProfile: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('trigger-save-profile', subscription);

        return () => ipcRenderer.removeListener('trigger-save-profile', subscription);
    }
});
