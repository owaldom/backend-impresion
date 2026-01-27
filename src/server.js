const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const printRoutes = require('./routes/printRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api', printRoutes);
app.get('/api/settings', require('./controllers/settingsController').getSettings);
app.post('/api/settings', require('./controllers/settingsController').saveSettings);

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Servidor de impresión funcionando');
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});