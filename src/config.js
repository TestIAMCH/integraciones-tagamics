import './style.css'

const DEFAULT_PACKAGES = [
  { id: 1, price: '500', time: '5' },
  { id: 2, price: '1500', time: '10', featured: true },
  { id: 3, price: '2500', time: '15' }
];

const initConfig = () => {
  const form = document.getElementById('config-form');
  const container = document.getElementById('packages-inputs');
  const toast = document.getElementById('toast');

  // Load existing data
  const savedData = localStorage.getItem('tagamics_prices');
  const packages = savedData ? JSON.parse(savedData) : DEFAULT_PACKAGES;

  // Render inputs
  container.innerHTML = packages.map((pkg, index) => `
    <div class="config-item" data-index="${index}">
      <h3>Paquete ${index + 1} ${pkg.featured ? '(Destacado)' : ''}</h3>
      <div class="input-group">
        <label>Precio ($)</label>
        <input type="text" value="${pkg.price}" class="input-price" placeholder="Ej: 500">
      </div>
      <div class="input-group">
        <label>Tiempo (minutos)</label>
        <input type="text" value="${pkg.time}" class="input-time" placeholder="Ej: 5">
      </div>
    </div>
  `).join('');

  // Handle Save
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const newPackages = Array.from(document.querySelectorAll('.config-item')).map((item, index) => {
      return {
        id: index + 1,
        price: item.querySelector('.input-price').value,
        time: item.querySelector('.input-time').value,
        featured: packages[index].featured // Preserve featured status
      };
    });

    localStorage.setItem('tagamics_prices', JSON.stringify(newPackages));

    // Show Toast
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  });
};

document.addEventListener('DOMContentLoaded', initConfig);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initConfig();
}
