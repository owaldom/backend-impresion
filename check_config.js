const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'printer-settings.json');
console.log('Checking settings at:', SETTINGS_FILE);

if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        console.log('Settings loaded:', JSON.stringify(settings, null, 2));

        const docType = 'TICKET';
        const mappedSetting = settings.roles[docType];
        console.log('Mapped setting for TICKET:', mappedSetting);

        const mappedWidth = (mappedSetting && mappedSetting.width) ? (mappedSetting.width === 58 ? 32 : (mappedSetting.width === 76 ? 42 : 48)) : null;
        console.log('Calculated mappedWidth:', mappedWidth);

        const finalChars = mappedWidth || 48;
        console.log('Final charsPerLine (simulated):', finalChars);

        if (finalChars <= 32) {
            console.log('RESULT: Correctly identified as 58mm (Small Font)');
        } else {
            console.log('RESULT: Identified as 80mm (Large Font/Double Size allowed)');
        }
    } catch (e) {
        console.error('Error parsing settings:', e);
    }
} else {
    console.log('Settings file NOT FOUND');
}
