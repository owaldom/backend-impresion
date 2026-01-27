const { createPrinter, getPrinterConfig } = require('../config/printerConfig');

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
        const printer = createPrinter();

        const isConnected = await printer.isPrinterConnected();

        if (!isConnected) {
            return res.status(503).json({
                success: false,
                error: 'No se pudo conectar a la impresora',
                config: getPrinterConfig()
            });
        }

        // Imprimir ticket de prueba
        printer.alignCenter();
        printer.bold(true);
        printer.setTextSize(1, 1);
        printer.println('PRUEBA DE IMPRESORA');
        printer.bold(false);
        printer.newLine();
        printer.alignLeft();
        printer.println(`Fecha: ${formatDate(new Date())}`);
        printer.println('Conexion exitosa!');
        printer.newLine();
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
    const { ticket, docType } = req.body;

    // Validar datos
    if (!ticket) {
        return res.status(400).json({ error: 'Datos del ticket no proporcionados' });
    }

    try {
        const config = getPrinterConfig();
        const printer = createPrinter({ docType: docType || 'TICKET' });

        // Verificar conexión
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            throw new Error('No se pudo conectar a la impresora');
        }

        // ============ ENCABEZADO ============
        printer.alignCenter();
        printer.bold(true);
        printer.setTextSize(2, 2);
        printer.println(ticket.company_name || 'MANGOPOS');
        printer.setTextSize(1, 1);
        printer.bold(false);

        if (ticket.company_address) {
            printer.println(ticket.company_address);
        }
        if (ticket.company_phone) {
            printer.println(`Tel: ${ticket.company_phone}`);
        }
        if (ticket.company_tax_id) {
            printer.println(`RIF: ${ticket.company_tax_id}`);
        }

        printer.newLine();
        printer.drawLine();

        // ============ INFORMACIÓN DEL TICKET ============
        printer.alignLeft();
        printer.bold(true);
        printer.println(`TICKET #${ticket.ticket_number || 'N/A'}`);
        printer.bold(false);
        printer.println(`Fecha: ${formatDate(ticket.date || new Date())}`);
        printer.println(`Cajero: ${ticket.cashier_name || 'N/A'}`);
        printer.println(`Cliente: ${ticket.customer_name || 'Publico General'}`);

        if (ticket.notes && ticket.notes.trim() !== '') {
            printer.drawLine();
            printer.println(`Nota: ${ticket.notes}`);
        }

        printer.drawLine();

        // ============ LÍNEAS DE PRODUCTOS ============
        if (ticket.lines && Array.isArray(ticket.lines)) {
            ticket.lines.forEach(line => {
                const productName = (line.product_name || '').substring(0, 40);
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
                const qtyStr = `${formatCurrency(quantity, 3)} x Bs.${formatCurrency(priceBs, 2)}`;
                const totalStr = `Bs.${formatCurrency(lineTotalBs, 2)}`;

                printer.tableCustom([
                    { text: qtyStr, align: 'LEFT', width: 0.7 },
                    { text: totalStr, align: 'RIGHT', width: 0.3 }
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
            { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
            { text: `Bs.${formatCurrency(subtotalBs, 2)}`, align: 'RIGHT', width: 0.3 }
        ]);

        // Impuestos en Bs.
        if (ticket.taxes && Array.isArray(ticket.taxes)) {
            ticket.taxes.forEach(tax => {
                const taxName = `IVA (${formatCurrency(tax.percentage * 100, 0)}%):`;
                const taxAmountBs = tax.amount * exchangeRate;
                printer.tableCustom([
                    { text: taxName, align: 'LEFT', width: 0.7 },
                    { text: `Bs.${formatCurrency(taxAmountBs, 2)}`, align: 'RIGHT', width: 0.3 }
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

        // Total en Bolívares (más grande y destacado)
        printer.bold(true);
        printer.setTextSize(2, 2);
        printer.tableCustom([
            { text: 'TOTAL:', align: 'LEFT', width: 0.7 },
            { text: `Bs.${formatCurrency(totalBs, 2)}`, align: 'RIGHT', width: 0.3 }
        ]);
        printer.setTextSize(1, 1);
        printer.bold(false);
        printer.drawLine();

        // ============ PAGOS ============
        if (ticket.payments && Array.isArray(ticket.payments)) {
            printer.bold(true);
            printer.println('PAGOS:');
            printer.bold(false);

            ticket.payments.forEach(payment => {
                const methodNames = {
                    'CASH_MONEY': 'Efectivo',
                    'CARD': 'Tarjeta',
                    'TRANSFER': 'Transferencia',
                    'CASH_REFUND': 'Devolucion'
                };
                const methodName = methodNames[payment.payment] || payment.payment;
                const paymentAmountBs = payment.amount_base_currency;

                printer.tableCustom([
                    { text: methodName, align: 'LEFT', width: 0.7 },
                    { text: `Bs.${formatCurrency(paymentAmountBs, 2)}`, align: 'RIGHT', width: 0.3 }
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
        printer.newLine();
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
        console.error('Error al imprimir ticket:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error desconocido al imprimir'
        });
    }
};

module.exports = { printTicket, openCashDrawer, testPrinter };