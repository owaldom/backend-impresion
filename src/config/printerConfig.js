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
const os = require('os');
const RawPrinter = require('../utils/rawPrinter');

const SETTINGS_FILE = path.join(__dirname, '../../printer-settings.json');

const createPrinter = (config = {}) => {
    // Check for role-based configuration
    if (config.docType) {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
                if (settings.roles && settings.roles[config.docType]) {
                    const mappedSetting = settings.roles[config.docType];
                    const mappedPrinter = typeof mappedSetting === 'string' ? mappedSetting : (mappedSetting ? mappedSetting.name : '');

                    // Width mapping: 
                    // 58mm -> 32 chars
                    // 76mm -> 42 chars
                    // 80mm -> 48 chars (default)
                    let mappedWidth = 48;
                    if (mappedSetting && mappedSetting.width) {
                        if (mappedSetting.width === 58) mappedWidth = 32;
                        else if (mappedSetting.width === 76) mappedWidth = 42;
                        else mappedWidth = 48;
                    }

                    if (mappedPrinter && mappedPrinter.trim() !== '') {
                        config.interface = `printer:${mappedPrinter}`;
                        config.type = 'USB'; // Force USB type for Windows driver
                        config.width = mappedWidth;
                        console.log(`Using mapped printer for ${config.docType}: ${mappedPrinter} (Width: ${mappedWidth} chars)`);
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
    let isWindowsUSB = false;
    let windowPrinterName = '';

    if (printerType === 'USB' && os.platform() === 'win32') {
        isWindowsUSB = true;
        // En Windows, extraemos el nombre de la impresora
        if (printerInterface && printerInterface.trim() !== '') {
            windowPrinterName = printerInterface.startsWith('printer:') ? printerInterface.replace('printer:', '') : printerInterface;
        } else {
            // Auto-detect no soportado directamente por RawPrinter, requiere nombre
            windowPrinterName = '';
        }
        // Usamos una interfaz de archivo dummy para evitar que node-thermal-printer intente cargar el driver nativo de impresión
        interfaceConfig = path.join(os.tmpdir(), 'printer_buffer.bin');
    } else if (printerType === 'USB') {
        // Otros SO (Linux/Mac)
        if (printerInterface && printerInterface.trim() !== '') {
            interfaceConfig = printerInterface.startsWith('printer:') ? printerInterface : `printer:${printerInterface}`;
        } else {
            interfaceConfig = 'printer:';
        }
    } else {
        // Impresora de red
        const ip = printerInterface || process.env.DEFAULT_PRINTER_IP || '192.168.1.100';
        interfaceConfig = `tcp://${ip}:9100`;
    }

    const printerTypeEnum = printerModel === 'STAR' ? PrinterTypes.STAR : PrinterTypes.EPSON;

    const printer = new ThermalPrinter({
        type: printerTypeEnum,
        interface: interfaceConfig,
        options: {
            timeout: 5000  // Timeout de conexión aumentado para USB
        },
        width: config.width || 48,  // Ancho del ticket en caracteres (ajustar según impresora)
        characterSet: 'PC437_USA',  // Juego de caracteres compatible con Windows
        removeSpecialCharacters: false,
        lineCharacter: "-",
    });

    // Exponer el ancho en la instancia para que el controlador pueda leerlo
    printer.width = config.width || 48;

    // Sobrescribir el método execute para usar RawPrinter en Windows USB
    if (isWindowsUSB) {
        const originalExecute = printer.execute.bind(printer);
        printer.execute = async () => {
            if (!windowPrinterName) {
                throw new Error('No se ha especificado el nombre de la impresora para Windows USB');
            }
            try {
                const buffer = printer.getBuffer();
                await RawPrinter.printRaw(windowPrinterName, buffer);
                printer.clear();
                return { success: true };
            } catch (error) {
                console.error('Error en RawPrinter workaround:', error);
                throw error;
            }
        };

        // Sobrescribir isPrinterConnected para Windows USB
        printer.isPrinterConnected = async () => {
            if (!windowPrinterName) return false;
            try {
                return await RawPrinter.isPrinterAvailable(windowPrinterName);
            } catch (e) {
                console.error('Error checking connection in config:', e);
                return false;
            }
        };
    }

    return printer;
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