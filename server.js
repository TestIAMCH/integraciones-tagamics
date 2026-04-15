import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');
const wellKnownPath = path.join(__dirname, 'public', '.well-known');

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
const paypalEnvironment = (process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase();
const paypalApiBaseUrl = paypalEnvironment === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const isPayPalConfigured = () => (
  Boolean(paypalClientId && paypalClientSecret) &&
  paypalClientId !== 'tu_client_id' &&
  paypalClientId !== 'TU_CLIENT_ID_AQUI' &&
  paypalClientSecret !== 'tu_client_secret' &&
  paypalClientSecret !== 'TU_CLIENT_SECRET_AQUI'
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json());
app.use('/.well-known', express.static(wellKnownPath, { dotfiles: 'allow' }));

const getPayPalErrorMessage = (data, fallbackMessage) => {
  if (data?.message) {
    return data.message;
  }

  if (Array.isArray(data?.details) && data.details.length > 0) {
    return data.details
      .map((detail) => detail.description || detail.issue)
      .filter(Boolean)
      .join(', ');
  }

  if (data?.error_description) {
    return data.error_description;
  }

  if (data?.error) {
    return data.error;
  }

  return fallbackMessage;
};

const assertPayPalConfig = () => {
  if (!isPayPalConfigured()) {
    const error = new Error('PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET deben estar configurados en el backend.');
    error.statusCode = 500;
    throw error;
  }
};

const getPayPalAccessToken = async () => {
  assertPayPalConfig();

  const credentials = Buffer
    .from(`${paypalClientId}:${paypalClientSecret}`)
    .toString('base64');

  const response = await fetch(`${paypalApiBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    const error = new Error(getPayPalErrorMessage(data, 'No se pudo obtener el token OAuth de PayPal.'));
    error.statusCode = response.status || 500;
    throw error;
  }

  return data.access_token;
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    paypalConfigured: isPayPalConfigured(),
    paypalEnvironment
  });
});

app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const amount = Number(req.body?.price);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'El precio debe ser un numero mayor a 0.' });
    }

    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${paypalApiBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2)
            }
          }
        ]
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.id) {
      return res.status(response.status || 500).json({
        error: getPayPalErrorMessage(data, 'No se pudo crear la orden de PayPal.'),
        details: data
      });
    }

    res.json({ id: data.id });
  } catch (error) {
    console.error('Error al crear orden de PayPal:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'No se pudo crear la orden de PayPal.'
    });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const orderID = req.body?.orderID;

    if (!orderID) {
      return res.status(400).json({ error: 'orderID es obligatorio.' });
    }

    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${paypalApiBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status || 500).json({
        error: getPayPalErrorMessage(data, 'No se pudo capturar la orden de PayPal.'),
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Error al capturar orden de PayPal:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'No se pudo capturar la orden de PayPal.'
    });
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/.well-known') || req.path === '/health') {
      next();
      return;
    }

    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin not allowed by CORS') {
    res.status(403).json({ error: 'Origen no permitido por CORS.' });
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
  console.log(`PayPal API configurada para ${paypalEnvironment}: ${paypalApiBaseUrl}`);
});
