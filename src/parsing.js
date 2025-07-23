async function parseTextToTargets(rawText) {
    const { default: CIDR } = await import('ip-cidr');
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    const targets = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (CIDR.isValidCIDR(trimmedLine)) {
            const cidr = new CIDR(trimmedLine);
            const ips = cidr.toArray();
            ips.forEach(ip => targets.push({ id: ip, type: 'ping', host: ip }));
        } else {
            const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (ipRegex.test(trimmedLine)) {
                targets.push({ id: trimmedLine, type: 'ping', host: trimmedLine });
            } else {
                targets.push({ id: trimmedLine, type: 'http', host: trimmedLine });
            }
        }
    }
    return targets;
}

module.exports = { parseTextToTargets };
