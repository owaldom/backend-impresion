# Backend de Impresión Térmica - MangoPOS

Servidor Node.js para gestionar la impresión en impresoras térmicas USB y apertura de cajón de dinero.

## Requisitos

- Node.js 14 o superior
- Impresora térmica compatible (Epson, Star, etc.)
- Puerto USB disponible (Windows)

## Instalación

```bash
cd backend-impresion
npm install
```

## Configuración

Editar el archivo `.env` con la configuración de tu impresora:

```env
# Puerto del servidor
PORT=3000

# Tipo de impresora: USB o NETWORK
PRINTER_TYPE=USB

# Para impresoras USB en Windows:
# - Dejar vacío para auto-detectar la primera impresora disponible
# - O especificar el nombre exacto de la impresora (ej: "POS-80")
PRINTER_INTERFACE=

# Para impresoras de red (si PRINTER_TYPE=NETWORK):
DEFAULT_PRINTER_IP=192.168.1.100

# Modelo de impresora: EPSON o STAR
PRINTER_MODEL=EPSON

# Configuración del cajón de dinero
ENABLE_CASH_DRAWER=true
AUTO_OPEN_DRAWER=true
```

### Encontrar el nombre de tu impresora en Windows

1. Abrir "Dispositivos e impresoras" en el Panel de Control
2. Buscar tu impresora térmica
3. El nombre que aparece es el que debes usar en `PRINTER_INTERFACE`
4. Si dejas vacío, se usará la primera impresora disponible

## Uso

### Iniciar el servidor

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Endpoints disponibles

#### 1. Probar conexión con la impresora
```
GET /api/print/test
```

Respuesta exitosa:
```json
{
  "success": true,
  "message": "Impresora conectada correctamente",
  "config": {
    "type": "USB",
    "interface": "",
    "model": "EPSON",
    "enableCashDrawer": true,
    "autoOpenDrawer": true
  }
}
```

#### 2. Imprimir ticket de venta
```
POST /api/print/ticket
Content-Type: application/json

{
  "ticket": {
    "company_name": "MI NEGOCIO",
    "company_address": "Calle Principal #123",
    "ticket_number": "001234",
    "date": "2026-01-08T15:30:00",
    "cashier_name": "Juan Pérez",
    "customer_name": "Cliente VIP",
    "notes": "Entrega a domicilio",
    "lines": [
      {
        "product_name": "Producto 1",
        "units": 2,
        "price": 10.50,
        "discount": 0,
        "discount_type": "PERCENT",
        "total": 21.00
      }
    ],
    "subtotal": 21.00,
    "taxes": [
      {
        "percentage": 0.16,
        "amount": 3.36
      }
    ],
    "globalDiscount": 0,
    "globalDiscountType": "PERCENT",
    "total": 24.36,
    "exchange_rate": 36.50,
    "payments": [
      {
        "payment": "CASH_MONEY",
        "total": 24.36
      }
    ]
  }
}
```

#### 3. Abrir cajón de dinero
```
POST /api/print/open-drawer
```

## Solución de Problemas

### La impresora no se detecta

1. Verificar que la impresora esté encendida y conectada por USB
2. Verificar que los drivers estén instalados correctamente
3. Probar con el endpoint `/api/print/test` para ver el error específico
4. Si usa Windows, verificar en "Dispositivos e impresoras" que la impresora esté lista

### Error "No se pudo conectar a la impresora"

1. Verificar la configuración en `.env`
2. Si `PRINTER_INTERFACE` está vacío, el sistema intentará auto-detectar
3. Si especificaste un nombre, verificar que sea exacto (case-sensitive)
4. Reiniciar el servidor después de cambiar `.env`

### El cajón no se abre

1. Verificar que `ENABLE_CASH_DRAWER=true` en `.env`
2. Verificar que el cajón esté conectado al puerto correcto de la impresora
3. Algunas impresoras requieren configuración adicional para habilitar el puerto del cajón

### Errores de caracteres especiales

1. Verificar que `characterSet` en `printerConfig.js` sea compatible con tu región
2. Para Windows, `PC437_USA` suele funcionar bien
3. Otras opciones: `PC850_MULTILINGUAL`, `WPC1252`

## Integración con Frontend

El frontend Angular debe apuntar a este servidor:

```typescript
// En thermal-printer.service.ts
private baseUrl = 'http://localhost:3000/api';
```

Si el backend corre en otra máquina, cambiar a la IP correspondiente:
```typescript
private baseUrl = 'http://192.168.1.100:3000/api';
```

## Comandos ESC/POS

El sistema usa comandos ESC/POS estándar para:
- Formateo de texto (negrita, tamaño, alineación)
- Corte de papel
- Apertura de cajón (ESC p m t1 t2)

## Licencia

MIT
