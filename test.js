
const test = require('node:test');
const assert = require('node:assert');
const { parseTextToTargets } = require('./src/parsing.js');

test('Normal Case: Mixed valid inputs', async () => {
    const inputText = `
        192.168.1.1
        google.com
        10.0.0.0/30
    `;
    const expected = [
        { id: '192.168.1.1', type: 'ping', host: '192.168.1.1' },
        { id: 'google.com', type: 'http', host: 'google.com' },
        { id: '10.0.0.0', type: 'ping', host: '10.0.0.0' },
        { id: '10.0.0.1', type: 'ping', host: '10.0.0.1' },
        { id: '10.0.0.2', type: 'ping', host: '10.0.0.2' },
        { id: '10.0.0.3', type: 'ping', host: '10.0.0.3' },
    ];
    const result = await parseTextToTargets(inputText);
    assert.deepStrictEqual(result, expected);
});

test('Edge Case: Empty input', async () => {
    const inputText = '';
    const expected = [];
    const result = await parseTextToTargets(inputText);
    assert.deepStrictEqual(result, expected);
});

test('Edge Case: Input with only whitespace', async () => {
    const inputText = '  \n \t ';
    const expected = [];
    const result = await parseTextToTargets(inputText);
    assert.deepStrictEqual(result, expected);
});

test('Invalid Case: Malformed IP and invalid CIDR', async () => {
    const inputText = `
        999.999.999.999
        192.168.1.1/33
        not a domain
    `;
    const expected = [
        { id: '999.999.999.999', type: 'http', host: '999.999.999.999' },
        { id: '192.168.1.1/33', type: 'http', host: '192.168.1.1/33' },
        { id: 'not a domain', type: 'http', host: 'not a domain' },
    ];
    const result = await parseTextToTargets(inputText);
    assert.deepStrictEqual(result, expected);
});
