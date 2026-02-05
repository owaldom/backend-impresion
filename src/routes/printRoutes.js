const express = require('express');
const router = express.Router();
const { printTicket, openCashDrawer, testPrinter, getPrinters } = require('../controllers/printController');

// Ruta para imprimir ticket de venta
router.post('/print/ticket', printTicket);

// Ruta para abrir cajón de dinero
router.post('/print/open-drawer', openCashDrawer);

// Ruta para probar conexión con impresora
router.post('/print/test', testPrinter);
router.get('/print/test', testPrinter); // Mantener GET para compatibilidad con health checks

// Ruta para obtener lista de impresoras del sistema
router.get('/print', getPrinters);

module.exports = router;