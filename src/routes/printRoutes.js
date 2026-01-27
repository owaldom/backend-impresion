const express = require('express');
const router = express.Router();
const { printTicket, openCashDrawer, testPrinter } = require('../controllers/printController');

// Ruta para imprimir ticket de venta
router.post('/print/ticket', printTicket);

// Ruta para abrir cajón de dinero
router.post('/print/open-drawer', openCashDrawer);

// Ruta para probar conexión con impresora
router.get('/print/test', testPrinter);

module.exports = router;