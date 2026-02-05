const { createPrinter, getPrinterConfig } = require('../config/printerConfig');
const { exec } = require('child_process');
const os = require('os');

/**
 * Formatea un número como moneda
 */
const formatCurrency = (amount, decimals = 2) => {
    return parseFloat(amount || 0).toFixed(decimals);
};

/**
 * Formatea una fecha
 */
const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Abre el cajón de dinero
 */
const openCashDrawer = async (req, res) => {
    try {
        const config = getPrinterConfig();

        if (!config.enableCashDrawer) {
            return res.status(400).json({
                success: false,
                error: 'Cajón de dinero deshabilitado en configuración'
            });
        }

        const printer = createPrinter();

        // Verificar conexión
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            throw new Error('No se pudo conectar a la impresora');
        }

        // Comando ESC/POS para abrir cajón: ESC p m t1 t2
        // ESC = 0x1B, p = 0x70, m = 0 (pin 2), t1 = 50 (500ms), t2 = 50 (500ms)
        printer.openCashDrawer();

        await printer.execute();

        res.json({
            success: true,
            message: 'Cajón de dinero abierto'
        });

    } catch (error) {
        console.error('Error al abrir cajón:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al abrir cajón de dinero'
        });
    }
};

/**
 * Prueba la conexión con la impresora
 */
const testPrinter = async (req, res) => {
    try {
        const { printerName, width } = req.body;
        const printerWidthConfig = parseInt(width || 80);

        // Determinar caracteres por línea según el ancho
        // 58mm -> ~32 chars
        // 80mm -> ~48 chars
        const charsPerLine = printerWidthConfig === 58 ? 32 : (printerWidthConfig === 76 ? 42 : 48);

        const printer = createPrinter({
            interface: printerName ? `printer:${printerName}` : undefined
        });

        // Configurar ancho dinámico si la librería lo permite o ajustar nuestro diseño
        printer.width = charsPerLine;

        const isConnected = await printer.isPrinterConnected();

        if (!isConnected) {
            return res.status(503).json({
                success: false,
                error: 'No se pudo conectar a la impresora',
                config: getPrinterConfig()
            });
        }

        // Limpiar buffer y asegurar estado inicial normal
        printer.raw(Buffer.from([0x1b, 0x40]));

        // Usar fuente compacta (Font B) para impresoras de 58mm
        if (printerWidthConfig === 58) {
            printer.setTypeFontB();
        } else {
            printer.setTypeFontA();
        }

        printer.setTextNormal();
        printer.alignLeft();
        printer.bold(false);

        // Imprimir ticket de prueba
        printer.alignCenter();
        printer.bold(true);
        printer.setTextSize(1, 1);
        printer.println('PRUEBA DE IMPRESORA');
        printer.println('MANGOPOS SYSTEM');
        printer.bold(false);
        printer.newLine();
        printer.alignLeft();
        printer.println(`Fecha: ${formatDate(new Date())}`);
        printer.println(`Imp: ${printerName || 'Predeterminada'}`);
        printer.println(`Ancho: ${printerWidthConfig}mm (${charsPerLine} chars)`);
        printer.drawLine();
        printer.println('SI PUEDE LEER ESTO, LA');
        printer.println('CONFIGURACION ES CORRECTA');
        printer.drawLine();
        printer.newLine();
        printer.cut();

        await printer.execute();

        res.json({
            success: true,
            message: 'Impresora conectada correctamente',
            config: getPrinterConfig()
        });

    } catch (error) {
        console.error('Error al probar impresora:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error al conectar con la impresora',
            config: getPrinterConfig()
        });
    }
};

/**
 * Imprime un ticket de venta completo
 */
const printTicket = async (req, res) => {
    const { ticket, docType, width } = req.body;
    try {
        const config = getPrinterConfig();
        const printer = createPrinter({ docType: docType || 'TICKET' });

        // Determinar ancho: 
        // 1. Usar el ancho (width) pasado en el body si existe (ej. desde el test)
        // 2. Si no, usar el ancho configurado en la instancia de la impresora (vía rol)
        // 3. Fallback a 48 caracteres (80mm)
        const charsPerLine = width ? (parseInt(width) === 58 ? 32 : (parseInt(width) === 76 ? 42 : 48)) : (printer.width || 48);
        const printerWidthConfig = charsPerLine === 32 ? 58 : (charsPerLine === 42 ? 76 : 80);

        console.log(`Printing ${docType || 'TICKET'} with width: ${printerWidthConfig}mm (${charsPerLine} chars). Width from body: ${width || 'N/A'}`);

        printer.width = charsPerLine;

        // Verificar conexión
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            throw new Error('No se pudo conectar a la impresora');
        }

        // Limpiar buffer y asegurar estado inicial normal
        // ESC @ (Reset) + Normalizar texto
        printer.raw(Buffer.from([0x1b, 0x40]));
        printer.setTextNormal();
        printer.alignLeft();
        printer.bold(false);

        // ============ ENCABEZADO ============
        printer.alignCenter();
        if (charsPerLine <= 32) {
            printer.setTypeFontB(); // Asegurar fuente B para tickets pequeños
            printer.bold(true);
            printer.println(ticket.company_name || 'MANGOPOS');
            printer.bold(false);
        } else {
            printer.setTypeFontA();
            printer.bold(true);
            // Tamaño ligeramente mayor para cabecera en impresoras grandes, pero no exagerado
            printer.setTextDoubleHeight();
            printer.println(ticket.company_name || 'MANGOPOS');
            printer.setTextNormal();
            printer.bold(false);
        }

        if (ticket.company_address) {
            printer.println(ticket.company_address);
        }
        if (ticket.company_phone || ticket.company_tax_id) {
            let info = [];
            if (ticket.company_phone) info.push(`Tel: ${ticket.company_phone}`);
            if (ticket.company_tax_id) info.push(`RIF: ${ticket.company_tax_id}`);
            printer.println(info.join(' - '));
        }

        printer.newLine();
        printer.drawLine();

        // ============ INFORMACIÓN DEL TICKET ============
        printer.alignLeft();
        printer.bold(true);
        printer.println(`TICKET #${ticket.ticket_number || 'N/A'}`);
        printer.bold(false);

        // Compactar info de fecha y cajero
        printer.println(`Fecha: ${formatDate(ticket.date || new Date())}`);
        printer.println(`Cajero/Cli: ${ticket.cashier_name || 'N/A'} / ${ticket.customer_name || 'P.G.'}`);

        if (ticket.notes && ticket.notes.trim() !== '') {
            printer.println(`Nota: ${ticket.notes}`);
        }

        printer.drawLine();

        // ============ LÍNEAS DE PRODUCTOS ============
        if (ticket.lines && Array.isArray(ticket.lines)) {
            ticket.lines.forEach(line => {
                // Truncar nombre según ancho
                const maxNameLen = charsPerLine === 32 ? 30 : 40;
                const productName = (line.product_name || '').substring(0, maxNameLen);

                const quantity = parseFloat(line.units || 0);
                const priceUSD = parseFloat(line.price || 0);
                const discount = parseFloat(line.discount || 0);
                const discountType = line.discount_type;
                const exchangeRate = parseFloat(ticket.exchange_rate || 1);

                // Calcular precio unitario con descuento en USD
                let unitPriceUSD = priceUSD;
                if (discount > 0) {
                    if (discountType === 'FIXED') {
                        unitPriceUSD = Math.max(0, priceUSD - discount);
                    } else if (discountType === 'FIXED_VES') {
                        unitPriceUSD = Math.max(0, priceUSD - (discount / exchangeRate));
                    } else {
                        // Porcentaje
                        unitPriceUSD = priceUSD * (1 - discount);
                    }
                }

                // Convertir a Bolívares
                const priceBs = priceUSD * exchangeRate;
                const unitPriceBs = unitPriceUSD * exchangeRate;
                const lineTotalBs = quantity * unitPriceBs;

                // Nombre del producto
                printer.bold(true);
                printer.println(productName);
                printer.bold(false);

                // Cantidad x Precio = Total (en Bs.)
                // En 58mm (32 chars), acortamos los textos
                const qtyPrefix = charsPerLine === 32 ? '' : 'Bs.';
                const qtyStr = `${formatCurrency(quantity, 2)} x ${qtyPrefix}${formatCurrency(priceBs, 2)}`;
                const totalStr = `Bs.${formatCurrency(lineTotalBs, 2)}`;

                // Ajustar proporciones de tabla según ancho
                const tableProportions = charsPerLine === 32 ? [0.6, 0.4] : [0.7, 0.3];

                printer.tableCustom([
                    { text: qtyStr, align: 'LEFT', width: tableProportions[0] },
                    { text: totalStr, align: 'RIGHT', width: tableProportions[1] }
                ]);

                // Mostrar descuento si existe
                if (discount > 0) {
                    let discountText = '';
                    if (discountType === 'FIXED') {
                        const discountBs = discount * exchangeRate;
                        discountText = `Desc: -Bs.${formatCurrency(discountBs, 2)}`;
                    } else if (discountType === 'FIXED_VES') {
                        discountText = `Desc: -Bs.${formatCurrency(discount, 2)}`;
                    } else {
                        discountText = `Desc: -${formatCurrency(discount * 100, 0)}%`;
                    }
                    printer.println(`  ${discountText}`);
                }
            });
        }

        printer.drawLine();

        // ============ TOTALES ============
        const subtotal = parseFloat(ticket.subtotal || 0);
        const total = parseFloat(ticket.total || 0);
        const exchangeRate = parseFloat(ticket.exchange_rate || 1);

        // Convertir todos los montos a Bolívares
        const subtotalBs = subtotal * exchangeRate;
        const totalBs = total * exchangeRate;

        // Subtotal en Bs.
        printer.tableCustom([
            { text: 'Subtotal:', align: 'LEFT', width: charsPerLine <= 32 ? 0.6 : 0.7 },
            { text: `Bs.${formatCurrency(subtotalBs, 2)}`, align: 'RIGHT', width: charsPerLine <= 32 ? 0.4 : 0.3 }
        ]);

        // Impuestos en Bs.
        if (ticket.taxes && Array.isArray(ticket.taxes)) {
            ticket.taxes.forEach(tax => {
                const taxName = `IVA (${formatCurrency(tax.percentage * 100, 0)}%):`;
                const taxAmountBs = tax.amount * exchangeRate;
                printer.tableCustom([
                    { text: taxName, align: 'LEFT', width: charsPerLine <= 32 ? 0.6 : 0.7 },
                    { text: `Bs.${formatCurrency(taxAmountBs, 2)}`, align: 'RIGHT', width: charsPerLine <= 32 ? 0.4 : 0.3 }
                ]);
            });
        }

        // Descuento global en Bs.
        if (ticket.globalDiscount && ticket.globalDiscount > 0) {
            let discountLabel = 'Descuento Global:';
            let discountAmountBs = 0;

            if (ticket.globalDiscountType === 'FIXED') {
                discountAmountBs = ticket.globalDiscount * exchangeRate;
            } else if (ticket.globalDiscountType === 'FIXED_VES') {
                discountAmountBs = ticket.globalDiscount;
            } else {
                // Calcular descuento porcentual
                const subtotalWithTaxes = subtotal + (ticket.taxes || []).reduce((sum, t) => sum + t.amount, 0);
                const discountAmountUSD = subtotalWithTaxes * ticket.globalDiscount;
                discountAmountBs = discountAmountUSD * exchangeRate;
            }

            printer.tableCustom([
                { text: discountLabel, align: 'LEFT', width: 0.7 },
                { text: `-Bs.${formatCurrency(discountAmountBs, 2)}`, align: 'RIGHT', width: 0.3 }
            ]);
        }

        printer.drawLine();

        // Total en Bolívares
        printer.bold(true);
        if (charsPerLine > 32) {
            printer.setTextDoubleHeight();
        }

        printer.tableCustom([
            { text: 'TOTAL:', align: 'LEFT', width: 0.5 },
            { text: `Bs.${formatCurrency(totalBs, 2)}`, align: 'RIGHT', width: 0.5 }
        ]);

        if (charsPerLine > 32) {
            printer.setTextNormal();
        }
        printer.bold(false);
        printer.drawLine();

        // ============ PAGOS ============
        if (ticket.payments && Array.isArray(ticket.payments)) {
            ticket.payments.forEach(payment => {
                const methodNames = {
                    'CASH_MONEY': 'Efectivo',
                    'CASH': 'Efectivo',
                    'cash': 'Efectivo',
                    'CARD': 'Tarjeta',
                    'TRANSFER': 'Transf.',
                    'CASH_REFUND': 'Devol.',
                    'debt': 'Credito'
                };
                const methodName = methodNames[payment.payment] || payment.payment;
                const paymentAmountBs = payment.amount_base_currency;

                printer.tableCustom([
                    { text: methodName, align: 'LEFT', width: 0.6 },
                    { text: `Bs.${formatCurrency(paymentAmountBs, 2)}`, align: 'RIGHT', width: 0.4 }
                ]);
            });
            printer.drawLine();
        }

        // ============ PIE DE PÁGINA ============
        printer.newLine();
        printer.alignCenter();
        printer.println('Gracias por su compra!');
        printer.println('MangoPOS System');
        printer.newLine();

        // Cortar papel
        printer.cut();

        // Ejecutar impresión
        await printer.execute();

        // Abrir cajón si está configurado
        if (config.enableCashDrawer && config.autoOpenDrawer) {
            try {
                const drawerPrinter = createPrinter();
                drawerPrinter.openCashDrawer();
                await drawerPrinter.execute();
            } catch (drawerError) {
                console.error('Error al abrir cajón:', drawerError);
                // No fallar la impresión si el cajón falla
            }
        }

        res.json({
            success: true,
            message: 'Ticket impreso correctamente',
            ticketNumber: ticket.ticket_number
        });

    } catch (error) {
        console.error('CRITICAL ERROR IN PRINTING:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error desconocido al imprimir',
            stack: error.stack
        });
    }
};

/**
 * Obtiene la lista de impresoras instaladas en el sistema
 */
const getPrinters = async (req, res) => {
    try {
        const platform = os.platform();

        if (platform === 'win32') {
            // Windows: Usar PowerShell para obtener impresoras
            exec('powershell "Get-Printer | Select-Object Name, PrinterStatus, DriverName | ConvertTo-Json"', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error al ejecutar comando: ${error}`);
                    return res.status(500).json({ error: 'No se pudo listar las impresoras' });
                }

                try {
                    const printers = JSON.parse(stdout);
                    // Asegurar que el resultado es un array
                    const printerList = Array.isArray(printers) ? printers : [printers];

                    const formatted = printerList.filter(p => p && p.Name).map(p => ({
                        name: p.Name,
                        displayName: p.Name,
                        status: p.PrinterStatus === 'Normal' || p.PrinterStatus === 0 ? 'Ready' : 'Unknown',
                        driver: p.DriverName
                    }));

                    res.json(formatted);
                } catch (e) {
                    console.error('Error al parsear JSON de impresoras:', e);
                    res.status(500).json({ error: 'Error al procesar la lista de impresoras' });
                }
            });
        } else {
            // Linux/Unix (lpstat)
            exec('lpstat -e', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error al ejecutar comando: ${error}`);
                    return res.status(500).json({ error: 'No se pudo listar las impresoras' });
                }

                const printers = stdout.split('\n')
                    .filter(line => line.trim())
                    .map(name => ({
                        name: name,
                        displayName: name,
                        status: 'Ready',
                        driver: 'CUPS'
                    }));

                res.json(printers);
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener impresoras' });
    }
};

module.exports = { printTicket, openCashDrawer, testPrinter, getPrinters };