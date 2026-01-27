const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

/**
 * Crea una instancia de impresora térmica según la configuración
 * @param {Object} config - Configuración de la impresora
 * @param {string} config.type - Tipo de conexión: 'USB' o 'NETWORK'
 * @param {string} config.interface - Interface de la impresora (nombre USB o IP)
 * @param {string} config.model - Modelo de impresora: 'EPSON' o 'STAR'
 * @returns {ThermalPrinter} Instancia de la impresora
 */
const fs = require('fs');
const path = require('path');
const SETTINGS_FILE = path.join(__dirname, '../../printer-settings.json');

const createPrinter = (config = {}) => {
    // Check for role-based configuration
    if (config.docType) {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
                if (settings.roles && settings.roles[config.docType]) {
                    const mappedPrinter = settings.roles[config.docType];
                    if (mappedPrinter && mappedPrinter.trim() !== '') {
                        config.interface = `printer:${mappedPrinter}`;
                        config.type = 'USB'; // Force USB type for Windows driver
                        console.log(`Using mapped printer for ${config.docType}: ${mappedPrinter}`);
                    }
                }
            }
        } catch (e) {
            console.error('Error reading printer settings:', e);
        }
    }

    const printerType = config.type || process.env.PRINTER_TYPE || 'USB';
    const printerModel = config.model || process.env.PRINTER_MODEL || 'EPSON';
    // If interface was set by role, use it; otherwise fallback to input or env
    const printerInterface = config.interface || process.env.PRINTER_INTERFACE;

    let interfaceConfig;

    if (printerType === 'USB') {
        // Para Windows, si no se especifica interface, usar printer por defecto
        // Ejemplos: 'printer:POS-80' o solo 'printer:' para auto-detect
        if (printerInterface && printerInterface.trim() !== '') {
            interfaceConfig = `printer:${printerInterface}`;
        } else {
            // Auto-detect: usar primera impresora disponible
            interfaceConfig = 'printer:';
        }
    } else {
        // Impresora de red
        const ip = printerInterface || process.env.DEFAULT_PRINTER_IP || '192.168.1.100';
        interfaceConfig = `tcp://${ip}:9100`;
    }

    const printerTypeEnum = printerModel === 'STAR' ? PrinterTypes.STAR : PrinterTypes.EPSON;

    return new ThermalPrinter({
        type: printerTypeEnum,
        interface: interfaceConfig,
        options: {
            timeout: 5000  // Timeout de conexión aumentado para USB
        },
        width: 48,  // Ancho del ticket en caracteres (ajustar según impresora)
        characterSet: 'PC437_USA',  // Juego de caracteres compatible con Windows
        removeSpecialCharacters: false,
        lineCharacter: "-",
    });
};

/**
 * Obtiene la configuración actual de la impresora desde variables de entorno
 * @returns {Object} Configuración de la impresora
 */
const getPrinterConfig = () => {
    return {
        type: process.env.PRINTER_TYPE || 'USB',
        interface: process.env.PRINTER_INTERFACE || '',
        model: process.env.PRINTER_MODEL || 'EPSON',
        enableCashDrawer: process.env.ENABLE_CASH_DRAWER === 'true',
        autoOpenDrawer: process.env.AUTO_OPEN_DRAWER === 'true'
    };
};

module.exports = { createPrinter, getPrinterConfig };