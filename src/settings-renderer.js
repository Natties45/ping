/**
 * settings-renderer.js
 * This script runs in the settings window's renderer process.
 * It handles loading settings into the form, saving them, and interacting
 * with the main process for settings-related tasks.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const subTabButtons = document.querySelectorAll('.sub-tab-button');
    const profileContents = document.querySelectorAll('.profile-content');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    // General settings inputs
    const intervalInput = document.getElementById('interval-input');
    const timeoutInput = document.getElementById('timeout-input');

    let originalSettings = {};

    /**
     * Populates the entire form with data from the settings object.
     * @param {object} settings - The settings object from the main process.
     */
    function populateForm(settings) {
        originalSettings = settings; // Store original settings for comparison or cancellation

        // Populate General tab
        intervalInput.value = settings.interval || 10;
        timeoutInput.value = settings.timeout || 5;

        // Populate Profiles tab
        profileContents.forEach(profileDiv => {
            const id = profileDiv.dataset.profileId;
            const profileData = settings.profiles[id];

            if (profileData) {
                document.getElementById(`profile-${id}-name`).value = profileData.name || '';
                const toggle = document.getElementById(`profile-${id}-telegram-enable`);
                toggle.checked = profileData.telegram_enabled || false;
                document.getElementById(`profile-${id}-token`).value = profileData.telegram_token || '';
                document.getElementById(`profile-${id}-chatid`).value = profileData.telegram_chat_id || '';
                
                // Trigger change to update input disabled state
                toggle.dispatchEvent(new Event('change'));
            }
        });

        // Update sub-tab button labels
        subTabButtons.forEach(btn => {
            const id = btn.dataset.subtab.match(/profile-(\d+)/)[1];
            btn.textContent = settings.profiles[id]?.name || `Profile ${id}`;
        });
    }

    /**
     * Collects all data from the form and structures it into a settings object.
     * @returns {object} The complete, new settings object.
     */
    function collectSettingsFromForm() {
        const newSettings = {
            ...originalSettings, // Start with original to preserve keys like windowBounds
            interval: parseInt(intervalInput.value, 10),
            timeout: parseInt(timeoutInput.value, 10),
            profiles: {}
        };

        profileContents.forEach(profileDiv => {
            const id = profileDiv.dataset.profileId;
            const nameInput = document.getElementById(`profile-${id}-name`);
            
            newSettings.profiles[id] = {
                name: nameInput.value.trim() || `Profile ${id}`, // Use default if empty
                telegram_enabled: document.getElementById(`profile-${id}-telegram-enable`).checked,
                telegram_token: document.getElementById(`profile-${id}-token`).value.trim(),
                telegram_chat_id: document.getElementById(`profile-${id}-chatid`).value.trim()
            };
        });

        return newSettings;
    }

    /**
     * Sets up all event listeners for the settings window.
     */
    function setupEventListeners() {
        // Main tab switching
        tabButtons.forEach(tab => {
            tab.addEventListener('click', () => {
                tabButtons.forEach(item => item.classList.remove('active'));
                tab.classList.add('active');
                tabContents.forEach(content => content.style.display = 'none');
                document.getElementById(tab.dataset.tab).style.display = 'block';
            });
        });

        // Profile sub-tab switching
        subTabButtons.forEach(subTab => {
            subTab.addEventListener('click', () => {
                subTabButtons.forEach(item => item.classList.remove('active'));
                subTab.classList.add('active');
                profileContents.forEach(content => content.style.display = 'none');
                document.getElementById(subTab.dataset.subtab).style.display = 'block';
            });
        });

        // Telegram enable/disable toggle logic
        // FIX: Corrected the selector to properly target the checkbox inside the switch.
        document.querySelectorAll('.profile-content .switch input[type="checkbox"]').forEach(toggle => {
            toggle.addEventListener('change', (event) => {
                const id = event.target.id.match(/profile-(\d+)/)[1];
                const tokenInput = document.getElementById(`profile-${id}-token`);
                const chatIdInput = document.getElementById(`profile-${id}-chatid`);
                const isDisabled = !event.target.checked;
                tokenInput.disabled = isDisabled;
                chatIdInput.disabled = isDisabled;
            });
        });

        // Save and Cancel buttons
        saveButton.addEventListener('click', () => {
            const newSettings = collectSettingsFromForm();
            window.electronAPI.saveSettings(newSettings);
            window.electronAPI.closeSettingsWindow();
        });

        cancelButton.addEventListener('click', () => {
            window.electronAPI.closeSettingsWindow();
        });
    }

    // --- Main Execution ---
    async function initialize() {
        // Event listeners must be set up BEFORE the form is populated,
        // so that the dispatched 'change' event can be caught.
        setupEventListeners();
        const settings = await window.electronAPI.getSettings();
        populateForm(settings);
    }

    initialize();
});
