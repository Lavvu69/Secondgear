document.addEventListener('DOMContentLoaded', async function() {
    const grid = document.getElementById('compare-grid');
    const clearBtn = document.getElementById('compare-clear');
    const COMPARE_KEY = 'compareCars';

    function getIdsFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const idsParam = params.get('ids');
        if (!idsParam) return [];
        return idsParam.split(',').map(id => parseInt(id, 10)).filter(Boolean);
    }

    function getStoredIds() {
        try {
            const raw = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
            if (Array.isArray(raw)) return raw.map(id => parseInt(id, 10)).filter(Boolean);
        } catch (e) {}
        return [];
    }

    function setStoredIds(ids) {
        localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
    }

    function formatValue(value, fallback = 'N/A') {
        if (value === null || value === undefined || value === '') return fallback;
        return value;
    }

    async function loadCars(ids) {
        const results = await Promise.all(ids.map(async (id) => {
            try {
                const res = await fetch(`/cars/${encodeURIComponent(id)}`);
                if (!res.ok) throw new Error('not found');
                return await res.json();
            } catch (e) {
                return null;
            }
        }));
        return results.filter(Boolean);
    }

    function renderTable(cars) {
        const headerCells = cars.map(car => `
            <td>
                <div class="compare-card">
                    <img src="${resolveImage(car)}" alt="${car.make} ${car.model}">
                    <h3>${car.make} ${car.model} (${car.year})</h3>
                    <div class="compare-price">₹${Number(car.price || 0).toLocaleString('en-IN')}</div>
                    <button class="compare-remove" data-remove="${car.id}">Remove</button>
                </div>
            </td>
        `).join('');

        const rows = [
            ['Price', car => `₹${Number(car.price || 0).toLocaleString('en-IN')}`],
            ['Year', car => formatValue(car.year)],
            ['Fuel', car => formatValue(car.fuel_type)],
            ['Transmission', car => formatValue(car.transmission)],
            ['Mileage', car => formatValue(car.mileage ? `${car.mileage} km` : null)],
            ['KM Driven', car => formatValue(car.km_driven ? `${car.km_driven} km` : null)],
            ['Owners', car => formatValue(car.num_owners)],
            ['Color', car => formatValue(car.color)],
            ['Registration City', car => formatValue(car.registration_city)],
            ['Registration No.', car => formatValue(car.registration_number)],
            ['VIN', car => formatValue(car.vin)],
            ['Insurance Validity', car => formatValue(car.insurance_validity)]
        ];

        const body = rows.map(([label, getter]) => `
            <tr>
                <th>${label}</th>
                ${cars.map(car => `<td>${getter(car)}</td>`).join('')}
            </tr>
        `).join('');

        grid.innerHTML = `
            <table class="compare-table">
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        ${cars.map(car => `<th>${car.make} ${car.model}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>Overview</th>
                        ${headerCells}
                    </tr>
                    ${body}
                </tbody>
            </table>
        `;

        grid.querySelectorAll('.compare-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-remove'), 10);
                const remaining = getStoredIds().filter(cid => cid !== id);
                setStoredIds(remaining);
                window.location.href = remaining.length ? `compare.html?ids=${remaining.join(',')}` : 'compare.html';
            });
        });
    }

    function resolveImage(car) {
        const PLACEHOLDER_IMG = 'images/cars/placeholder.png';
        let imageVal = car.image_url || car.image;
        if (!imageVal) return PLACEHOLDER_IMG;
        if (imageVal.startsWith('/')) imageVal = imageVal.substring(1);
        if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) return imageVal;
        if (imageVal.startsWith('images/cars/')) return imageVal;
        return 'images/cars/' + imageVal;
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            setStoredIds([]);
            window.location.href = 'compare.html';
        });
    }

    const ids = getIdsFromQuery();
    const stored = getStoredIds();
    const finalIds = ids.length ? ids : stored;
    if (!finalIds.length || !grid) return;

    const cars = await loadCars(finalIds);
    if (!cars.length) return;

    setStoredIds(cars.map(car => car.id));
    renderTable(cars);
});
