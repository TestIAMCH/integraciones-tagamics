import './style.css'

const DEFAULT_PACKAGES = [
  { id: 1, price: '500', time: '5' },
  { id: 2, price: '1500', time: '10', featured: true },
  { id: 3, price: '2500', time: '15' }
];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY;

let isInitialized = false;

const paymentState = {
  mp: null,
  bricksBuilder: null,
  controller: null
};

const getPackages = () => {
  try {
    const savedData = localStorage.getItem('tagamics_prices');
    return savedData ? JSON.parse(savedData) : DEFAULT_PACKAGES;
  } catch (error) {
    console.warn('No se pudieron leer los paquetes guardados.', error);
    return DEFAULT_PACKAGES;
  }
};

const getApiUrl = (path) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const renderPaymentMessage = (container, message, color = '#ffffff') => {
  container.innerHTML = `<span style="color:${color}; font-weight:600;">${message}</span>`;
};

const unmountActiveBrick = async () => {
  if (!paymentState.controller) {
    return;
  }

  try {
    await paymentState.controller.unmount();
  } catch (error) {
    console.warn('No se pudo desmontar el Brick activo.', error);
  } finally {
    paymentState.controller = null;
  }
};

const ensureMercadoPago = () => {
  if (!window.MercadoPago) {
    throw new Error('La libreria de Mercado Pago no se cargo.');
  }

  if (!MP_PUBLIC_KEY || MP_PUBLIC_KEY === 'PEGAR_AQUI' || MP_PUBLIC_KEY === 'TU_PUBLIC_KEY_AQUI') {
    throw new Error('Falta configurar VITE_MP_PUBLIC_KEY en el archivo .env.');
  }

  if (!paymentState.mp) {
    paymentState.mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
    paymentState.bricksBuilder = paymentState.mp.bricks();
  }

  return paymentState.bricksBuilder;
};

const createPreference = async (price, time, purpose = 'wallet_purchase') => {
  const response = await fetch(getApiUrl('/create-preference'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price,
      title: `Paquete Tagamics ${time} min`,
      purpose,
      backUrl: window.location.origin
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    throw new Error(data.error || 'No se pudo crear la preferencia de pago.');
  }

  return data;
};

const init = () => {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  const packagesGrid = document.querySelector('#packages-grid');
  const paymentsGrid = document.querySelector('#payments-grid');
  const paymentBtns = document.querySelectorAll('.payment-btn');
  const dateElement = document.querySelector('#current-date');
  const paymentContainer = document.querySelector('#payment_container');

  if (!packagesGrid || !paymentsGrid || !paymentBtns.length || !dateElement || !paymentContainer) {
    return;
  }

  // Set current date
  const now = new Date();
  const options = { day: 'numeric', month: 'long' };
  dateElement.textContent = now.toLocaleDateString('es-AR', options);

  // Load Prices
  const packages = getPackages();

  // Render Packages
  packagesGrid.innerHTML = packages.map(pkg => `
    <button class="package-card ${pkg.featured ? 'featured' : ''}" 
            data-id="${pkg.id}" 
            data-price="${pkg.price}" 
            data-time="${pkg.time}">
      ${pkg.featured ? '<div class="badge">MÁS POPULAR</div>' : ''}
      <span class="price">$${pkg.price}</span>
      <span class="time">${pkg.time} minutos</span>
      <div class="icon-wrapper">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gamepad-2"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><rect width="20" height="12" x2="22" y2="18" rx="2"/><circle cx="17" cy="15" r="1"/><circle cx="14" cy="13" r="1"/></svg>
      </div>
    </button>
  `).join('');

  const packageCards = document.querySelectorAll('.package-card');

  // Package Selection Logic
  packageCards.forEach(card => {
    card.addEventListener('click', async () => {
      packageCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      paymentsGrid.classList.remove('disabled');
      await unmountActiveBrick();
      paymentContainer.innerHTML = '';

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  });

  // Payment Buttons Logic
  paymentBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (paymentsGrid.classList.contains('disabled')) return;

      const method = btn.getAttribute('data-method');
      const selectedCard = document.querySelector('.package-card.selected');
      const price = selectedCard?.getAttribute('data-price');
      const time = selectedCard?.getAttribute('data-time');

      if (!selectedCard || !price || !time) {
        alert('Selecciona un paquete antes de continuar.');
        return;
      }

      if (method === 'mercado-pago' || method === 'credit-card') {
        renderPaymentMessage(paymentContainer, 'Cargando integracion de pago...');

        try {
          const bricksBuilder = ensureMercadoPago();
          await unmountActiveBrick();

          if (method === 'mercado-pago') {
            const data = await createPreference(price, time, 'wallet_purchase');
            paymentContainer.innerHTML = '';
            paymentState.controller = await bricksBuilder.create('wallet', 'payment_container', {
              initialization: { preferenceId: data.id }
            });
          } else if (method === 'credit-card') {
            renderPaymentMessage(paymentContainer, 'Configurando opciones avanzadas...');
            const data = await createPreference(price, time, 'wallet_purchase');

            paymentContainer.innerHTML = '';

            const settings = {
              initialization: {
                amount: Number(price),
                preferenceId: data.id
              },
              customization: {
                visual: { style: { theme: 'dark' } },
                paymentMethods: {
                  creditCard: 'all',
                  debitCard: 'all',
                  prepaidCard: 'all',
                  mercadoPago: ['wallet_purchase']
                }
              },
              callbacks: {
                onReady: () => {
                  console.log('Payment Brick listo');
                },
                onSubmit: async ({ formData }) => {
                  const response = await fetch(getApiUrl('/process_payment'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...formData,
                      description: `Paquete Tagamics ${time} min`
                    })
                  });

                  const result = await response.json().catch(() => ({}));

                  if (!response.ok) {
                    throw new Error(result.error || 'No se pudo procesar el pago.');
                  }

                  if (result.status === 'approved') {
                    renderPaymentMessage(paymentContainer, 'Pago aprobado.', '#00ff99');
                    return result;
                  }

                  renderPaymentMessage(
                    paymentContainer,
                    `Pago rechazado o pendiente (${result.status_detail || result.status || 'sin detalle'}).`,
                    '#ff6b6b'
                  );

                  throw new Error(result.status_detail || 'El pago no fue aprobado.');
                },
                onError: (error) => {
                  console.error('Error visual del brick:', error);
                }
              }
            };

            paymentState.controller = await bricksBuilder.create(
              'payment',
              'payment_container',
              settings
            );
          }
        } catch (error) {
          console.error('Error Frontend:', error);
          renderPaymentMessage(paymentContainer, error.message || 'Asegurate de tener el backend corriendo.', 'orange');
        }
      } else {
        console.log(`Iniciando pago con ${method} por $${price} (${time} min)`);
        alert(`Pasarela no integrada aún: ${method.toUpperCase()}\nTotal: $${price}`);
      }
    });
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
