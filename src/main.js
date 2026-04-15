import './style.css'

const DEFAULT_PACKAGES = [
  { id: 1, price: '500', time: '5' },
  { id: 2, price: '1500', time: '10', featured: true },
  { id: 3, price: '2500', time: '15' }
];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

let isInitialized = false;
let paypalSdkPromise = null;

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

const isMissingPayPalClientId = () => (
  !PAYPAL_CLIENT_ID ||
  PAYPAL_CLIENT_ID === 'tu_client_id' ||
  PAYPAL_CLIENT_ID === 'TU_CLIENT_ID_AQUI'
);

const loadPayPalSdk = () => {
  if (window.paypal) {
    return Promise.resolve(window.paypal);
  }

  if (paypalSdkPromise) {
    return paypalSdkPromise;
  }

  if (isMissingPayPalClientId()) {
    return Promise.reject(new Error('Falta configurar VITE_PAYPAL_CLIENT_ID en el archivo .env.'));
  }

  paypalSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('#paypal-sdk');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.paypal), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar el SDK de PayPal.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&components=buttons,applepay,googlepay&enable-funding=card`;
    script.async = true;
    script.addEventListener('load', () => resolve(window.paypal), { once: true });
    script.addEventListener('error', () => reject(new Error('No se pudo cargar el SDK de PayPal.')), { once: true });

    document.head.appendChild(script);
  });

  return paypalSdkPromise;
};

const createPayPalOrder = async (price) => {
  const response = await fetch(getApiUrl('/api/paypal/create-order'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    throw new Error(data.error || 'No se pudo crear la orden de PayPal.');
  }

  return data.id;
};

const capturePayPalOrder = async (orderID) => {
  const response = await fetch(getApiUrl('/api/paypal/capture-order'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderID })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo capturar la orden de PayPal.');
  }

  return data;
};

const getSelectedPackage = () => {
  const selectedCard = document.querySelector('.package-card.selected');

  if (!selectedCard) {
    return null;
  }

  return {
    price: selectedCard.getAttribute('data-price'),
    time: selectedCard.getAttribute('data-time')
  };
};

const renderPayPalButton = async (paypal, container, fundingSource) => {
  const buttons = paypal.Buttons({
    fundingSource,
    style: {
      height: 48,
      shape: 'rect'
    },
    createOrder: async () => {
      const selectedPackage = getSelectedPackage();

      if (!selectedPackage?.price) {
        throw new Error('Selecciona un paquete antes de continuar.');
      }

      return createPayPalOrder(selectedPackage.price);
    },
    onApprove: async (data) => {
      const captureData = await capturePayPalOrder(data.orderID);

      if (captureData.status !== 'COMPLETED') {
        throw new Error(`El pago quedo en estado ${captureData.status || 'desconocido'}.`);
      }

      alert('¡Pago exitoso! La máquina se está activando.');
    },
    onError: (error) => {
      console.error('Error de PayPal:', error);
      renderPaymentMessage(container, error.message || 'No se pudo completar el pago con PayPal.', 'orange');
    }
  });

  if (!buttons.isEligible()) {
    return false;
  }

  await buttons.render(container);
  return true;
};

const initializePayPalButtons = async () => {
  const container = document.getElementById('smart-payment-container');

  if (!container) {
    return;
  }

  renderPaymentMessage(container, 'Cargando opciones de pago...');

  try {
    const paypal = await loadPayPalSdk();

    container.innerHTML = '';

    let renderedButtons = 0;
    const fundingSources = [
      paypal.FUNDING.APPLEPAY,
      paypal.FUNDING.GOOGLEPAY,
      paypal.FUNDING.PAYPAL,
      paypal.FUNDING.CARD
    ].filter(Boolean);

    for (const fundingSource of fundingSources) {
      const wrapper = document.createElement('div');
      wrapper.className = 'standalone-button-wrapper';
      container.appendChild(wrapper);

      const wasRendered = await renderPayPalButton(paypal, wrapper, fundingSource);

      if (wasRendered) {
        renderedButtons += 1;
      } else {
        wrapper.remove();
      }
    }

    if (renderedButtons === 0) {
      renderPaymentMessage(container, 'PayPal no esta disponible en este navegador.', 'orange');
    }
  } catch (error) {
    console.error('Error Frontend PayPal:', error);
    renderPaymentMessage(container, error.message || 'Asegurate de tener el backend corriendo.', 'orange');
  }
};

const init = () => {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  const packagesGrid = document.querySelector('#packages-grid');
  const dateElement = document.querySelector('#current-date');
  const paymentStack = document.querySelector('#smart-payment-container');

  if (!packagesGrid || !dateElement || !paymentStack) {
    return;
  }

  const now = new Date();
  const options = { day: 'numeric', month: 'long' };
  dateElement.textContent = now.toLocaleDateString('es-AR', options);

  const packages = getPackages();

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

  initializePayPalButtons();

  packageCards.forEach(card => {
    card.addEventListener('click', () => {
      packageCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      paymentStack.classList.remove('disabled-stack');

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
