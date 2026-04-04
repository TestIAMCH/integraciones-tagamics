import './style.css'

const DEFAULT_PACKAGES = [
  { id: 1, price: '500', time: '5' },
  { id: 2, price: '1500', time: '10', featured: true },
  { id: 3, price: '2500', time: '15' }
];

const init = () => {
  const packagesGrid = document.querySelector('#packages-grid');
  const paymentsGrid = document.querySelector('#payments-grid');
  const paymentBtns = document.querySelectorAll('.payment-btn');
  const dateElement = document.querySelector('#current-date');

  // Set current date
  const now = new Date();
  const options = { day: 'numeric', month: 'long' };
  dateElement.textContent = now.toLocaleDateString('es-ES', options);

  // Load Prices
  const savedData = localStorage.getItem('tagamics_prices');
  const packages = savedData ? JSON.parse(savedData) : DEFAULT_PACKAGES;

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
    card.addEventListener('click', () => {
      packageCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      paymentsGrid.classList.remove('disabled');

      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    });
  });

  // Payment Buttons Logic
  paymentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (paymentsGrid.classList.contains('disabled')) return;
      const method = btn.getAttribute('data-method');
      const selectedCard = document.querySelector('.package-card.selected');
      const price = selectedCard?.getAttribute('data-price');
      const time = selectedCard?.getAttribute('data-time');
      console.log(`Iniciando pago con ${method} por $${price} (${time} min)`);
      alert(`Integrando pasarela: ${method.toUpperCase()}\nTotal: $${price}`);
    });
  });
};

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
}
