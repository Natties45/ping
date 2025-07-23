const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readSettings } = require('./main.js'); // Import the function to test

test('Architectural Test: readSettings should return default settings when file is corrupted', () => {
    // 1. Setup: Create a temporary corrupted settings file in the project directory
    const testDir = __dirname;
    const corruptedSettingsPath = path.join(testDir, 'settings.json');
    const corruptedJSON = '{"interval": 50, "timeout":'; // Intentionally broken JSON

    fs.writeFileSync(corruptedSettingsPath, corruptedJSON);
    console.log('-> Created corrupted settings.json for test.');

    // 2. Act: Call readSettings and tell it to look in our test directory
    const settings = readSettings(testDir);

    // 3. Assert: Check if the function correctly returned the default settings
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

    assert.deepStrictEqual(settings, defaultSettings, 'Function did not fall back to default settings on error.');
    console.log('-> Assertion passed: Function correctly returned default settings.');

    // 4. Teardown: Clean up the temporary file
    fs.unlinkSync(corruptedSettingsPath);
    console.log('-> Cleaned up temporary settings.json.');
});
