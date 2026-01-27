const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../printer-settings.json');

const settingsController = {
    getSettings: (req, res) => {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
                res.json(JSON.parse(data));
            } else {
                res.json({ roles: { TICKET: "", FISCAL: "", REPORT: "" } });
            }
        } catch (error) {
            console.error('Error reading settings:', error);
            res.status(500).json({ error: 'Failed to read settings' });
        }
    },

    saveSettings: (req, res) => {
        try {
            const newSettings = req.body;
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 4));
            res.json({ success: true, message: 'Settings saved' });
        } catch (error) {
            console.error('Error saving settings:', error);
            res.status(500).json({ error: 'Failed to save settings' });
        }
    }
};

module.exports = settingsController;
