# Integraciones Tagamics

Aplicacion web de Tagamics con frontend Vite y backend Node.js para integracion de pagos con PayPal Complete Payments.

## Estado actual

- URL activa: `https://20.203.244.104.nip.io/`
- VM activa de despliegue: `20.203.244.104`
- Usuario SSH de la VM activa: `azureuser`
- VM vieja retirada para esta app: `20.208.128.225`
- La VM vieja ya no debe usarse para desplegar este proyecto.

## Arquitectura

- `src/main.js`: frontend principal
- `src/config.js`: pantalla de configuracion local de paquetes
- `server.js`: backend Express para crear y capturar ordenes de PayPal
- `Dockerfile`: imagen de la app Node
- `docker-compose.yml`: levanta `app` + `caddy`
- `Caddyfile`: proxy reverso con HTTPS automatico
- `.github/workflows/deploy.yml`: deploy automatico a la VM activa

## Como funciona el despliegue

Cada `push` a `main` dispara GitHub Actions.

El workflow:

1. Carga el secret `Tagamics_secret`
2. Valida que existan las variables de PayPal
3. Ejecuta `npm install`
4. Ejecuta `npm run build`
5. Copia archivos a `~/integraciones-tagamics` en la VM activa
6. Genera `.env` remoto desde `Tagamics_secret`
7. Ejecuta `sudo docker-compose down || true`
8. Ejecuta `sudo docker-compose up -d --build`

## Secrets requeridos en GitHub

### `MV_AZURE`

IP publica de la VM activa.

Valor actual:

```txt
20.203.244.104
```

### `SSH_PRIVATE_KEY`

Clave privada SSH que corresponde a la VM activa.

### `Tagamics_secret`

Bundle completo en formato `.env`.

Contenido esperado:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
VITE_PAYPAL_CLIENT_ID=...
PAYPAL_ENVIRONMENT=sandbox
PUBLIC_SITE_URL=https://20.203.244.104.nip.io
ALLOWED_ORIGINS=https://20.203.244.104.nip.io
SITE_HOST=20.203.244.104.nip.io
```

## Desarrollo local

### Frontend

```bash
npm install
npm run dev
```

### Backend local

```bash
npm run server
```

### Variables locales minimas

En `.env` local:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
VITE_PAYPAL_CLIENT_ID=...
PAYPAL_ENVIRONMENT=sandbox
```

Opcionales:

```env
VITE_API_BASE_URL=http://localhost:3000
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
PUBLIC_SITE_URL=https://20.203.244.104.nip.io
SITE_HOST=20.203.244.104.nip.io
```

## Operacion en la VM activa

Ruta remota de la app:

```txt
~/integraciones-tagamics
```

Servicios:

- `tagamics-app`
- `tagamics-caddy`

Comandos utiles:

```bash
cd ~/integraciones-tagamics
sudo docker-compose ps
sudo docker-compose logs -f app
sudo docker-compose logs -f caddy
sudo docker-compose up -d --build
sudo docker-compose down
```

## Reglas para evitar errores

- No volver a desplegar este proyecto en `20.208.128.225`
- No cambiar `MV_AZURE` sin actualizar tambien `SSH_PRIVATE_KEY`
- No editar el `Tagamics_secret` sin mantener `PUBLIC_SITE_URL`, `ALLOWED_ORIGINS` y `SITE_HOST` alineados
- Mantener `PAYPAL_ENVIRONMENT=sandbox` durante pruebas y cambiarlo a `live` solo con credenciales productivas
- Si se cambia la VM o el dominio, actualizar:

`MV_AZURE`

`SSH_PRIVATE_KEY`

`Tagamics_secret`

`README.md`

## Verificaciones rapidas

### Sitio publico

```bash
curl -I https://20.203.244.104.nip.io/
```

### Healthcheck backend

```bash
curl -sS https://20.203.244.104.nip.io/health
```

Respuesta esperada:

```json
{"ok":true,"paypalConfigured":true,"paypalEnvironment":"sandbox"}
```

## Pendiente recomendado

- Migrar `actions/checkout@v4` y `actions/setup-node@v4` cuando actualicemos el workflow, porque GitHub ya muestra advertencias por deprecacion futura de Node 20 en actions.
