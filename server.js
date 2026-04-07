import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

const app = express();
const port = Number(process.env.PORT || 3000);
const accessToken = process.env.MP_ACCESS_TOKEN || '';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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

const getClient = () => {
  if (!accessToken) {
    const error = new Error('MP_ACCESS_TOKEN no esta configurado en el backend.');
    error.statusCode = 500;
    throw error;
  }

  return new MercadoPagoConfig({ accessToken });
};

const getErrorMessage = (error, fallbackMessage) => {
  if (error?.message?.includes('Acess_token')) {
    return 'Token de acceso invalido o no configurado.';
  }

  if (Array.isArray(error?.cause) && error.cause.length > 0) {
    return error.cause.map((item) => item.description || item.code).filter(Boolean).join(', ');
  }

  if (error?.errors) {
    return JSON.stringify(error.errors);
  }

  return error?.message || fallbackMessage;
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mercadopagoConfigured: Boolean(accessToken)
  });
});

app.post('/create-preference', async (req, res) => {
  try {
    const { price, title, purpose, backUrl } = req.body ?? {};
    const amount = Number(price);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'El precio debe ser un numero mayor a 0.' });
    }

    const preferenceBody = {
      items: [
        {
          id: 'item-ID-1234',
          title: title || 'Servicio Tagamics',
          quantity: 1,
          unit_price: amount,
          currency_id: 'ARS'
        }
      ]
    };

    if (purpose === 'wallet_purchase' || purpose === 'onboarding_credits') {
      preferenceBody.purpose = purpose;
    }

    if (backUrl) {
      preferenceBody.back_urls = {
        success: backUrl,
        failure: backUrl,
        pending: backUrl
      };
      preferenceBody.auto_return = 'approved';
    }

    const preference = new Preference(getClient());
    const result = await preference.create({
      body: preferenceBody
    });

    res.json({ id: result.id });
  } catch (error) {
    console.error('Error al crear preferencia:', error);

    res.status(error.statusCode || 500).json({
        error: getErrorMessage(error, 'No se pudo crear la preferencia.'),
        details: 'Revisa la consola del backend para mas informacion.'
    });
  }
});

app.post('/process_payment', async (req, res) => {
  try {
    const payer = req.body?.payer ?? {};
    const identification = payer.identification ?? {};
    const transactionAmount = Number(req.body?.transaction_amount);
    const installments = Number(req.body?.installments);

    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({ error: 'transaction_amount es obligatorio y debe ser valido.' });
    }

    if (!req.body?.token || !req.body?.payment_method_id || !payer.email) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para procesar el pago.' });
    }

    const payment = new Payment(getClient());
    const body = {
      transaction_amount: transactionAmount,
      token: req.body.token,
      description: req.body.description || 'Compra en Tagamics',
      installments: Number.isFinite(installments) && installments > 0 ? installments : 1,
      payment_method_id: req.body.payment_method_id,
      issuer_id: req.body.issuer_id,
      payer: {
        email: payer.email
      }
    };

    if (identification.type && identification.number) {
      body.payer.identification = {
        type: identification.type,
        number: identification.number
      };
    }

    const result = await payment.create({ body });
    res.json({
        status: result.status,
        status_detail: result.status_detail,
        id: result.id
    });
  } catch (error) {
    console.error('Error al procesar el pago con tarjeta:', error);
    res.status(error.statusCode || 500).json({
      error: getErrorMessage(error, 'No se pudo procesar el pago.')
    });
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/create-preference') || req.path.startsWith('/process_payment') || req.path === '/health') {
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
  console.log('Esperando peticiones de Mercado Pago...');
});
