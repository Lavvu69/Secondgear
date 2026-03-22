document.addEventListener('DOMContentLoaded', function() {
    // Get sell request ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const form = document.getElementById('confirmForm');

    // Show car details inside form (with visibility toggles)
    const detailsDiv = document.createElement('div');
    detailsDiv.id = 'carDetails';
    form.insertBefore(detailsDiv, form.firstChild);

    // Fetch car details and store for later use
    let sellRequestDetails = null;
    let agreedPriceValue = 0;
    const profitValueEl = document.getElementById('profitValue');
    fetch(`/admin/sell-requests`)
        .then(res => res.json())
        .then(requests => {
            const req = requests.find(r => r.id == id);
            if (req) {
                sellRequestDetails = req;
                const detailRow = (label, value, toggleId) => {
                    const safeValue = value || '-';
                    if (!toggleId) {
                        return `
                            <div class="detail-row">
                                <div class="detail-label">${label}</div>
                                <div class="detail-value">${safeValue}</div>
                            </div>
                        `;
                    }
                    const isChecked = value ? 'checked' : '';
                    return `
                        <div class="detail-row">
                            <div class="detail-label">${label}</div>
                            <div class="detail-value">${safeValue}</div>
                            <label class="detail-toggle">
                                <input type="checkbox" id="${toggleId}" ${isChecked}>
                                Show
                            </label>
                        </div>
                    `;
                };
                detailsDiv.innerHTML = `
                    <div class="details-header">
                        <div>
                            <h2>Sell Request Details</h2>
                            <p>Toggle the details you want to show on the listing.</p>
                        </div>
                        <div class="details-image">
                            <img src="${req.image_url || req.image}" alt="${req.make} ${req.model}">
                        </div>
                    </div>
                    <div class="details-grid">
                        ${detailRow('Email', req.email || '', null)}
                        ${detailRow('Make', req.make, null)}
                        ${detailRow('Model', req.model, null)}
                        ${detailRow('Year', req.year, null)}
                        ${detailRow('KM Driven', req.km_driven, null)}
                        ${detailRow('Type', req.type, null)}
                        ${detailRow('Color', req.color || '', 'show_color')}
                        ${detailRow('Fuel Type', req.fuel_type || '', 'show_fuel_type')}
                        ${detailRow('Mileage', req.mileage || '', 'show_mileage')}
                        ${detailRow('Number of Owners', req.num_owners || '', 'show_num_owners')}
                        ${detailRow('Registration City', req.registration_city || '', 'show_registration_city')}
                        ${detailRow('Registration Number', req.registration_number || '', 'show_registration_number')}
                        ${detailRow('Transmission', req.transmission || '', 'show_transmission')}
                        ${detailRow('VIN', req.vin || '', 'show_vin')}
                        ${detailRow('Insurance Validity', req.insurance_validity || '', 'show_insurance_validity')}
                        ${detailRow('Description', req.description || '', 'show_description')}
                        ${detailRow('Estimated Price', `₹${Number(req.estimated_price).toLocaleString('en-IN')}`, null)}
                        ${detailRow('Admin Offer', req.admin_offer_price ? `₹${Number(req.admin_offer_price).toLocaleString('en-IN')}` : '-', null)}
                        ${detailRow('Final Agreed Price', req.final_agreed_price ? `₹${Number(req.final_agreed_price).toLocaleString('en-IN')}` : '-', null)}
                        ${detailRow('Status', req.status || '', null)}
                    </div>
                `;
                const priceInput = form.querySelector('input[name="price"]');
                const preferredPrice = req.final_agreed_price || req.admin_offer_price || req.estimated_price || '';
                agreedPriceValue = Number(req.final_agreed_price || req.admin_offer_price || req.estimated_price || 0);
                if (priceInput && preferredPrice) {
                    priceInput.value = preferredPrice;
                }
                updateProfitDisplay();
            } else {
                detailsDiv.innerHTML = '<b>Could not load car details.</b>';
            }
        });

    function updateProfitDisplay() {
        if (!profitValueEl) return;
        const priceInput = form.querySelector('input[name="price"]');
        const listingPrice = priceInput ? Number(priceInput.value || 0) : 0;
        const profit = listingPrice - (agreedPriceValue || 0);
        const safeProfit = Number.isFinite(profit) ? profit : 0;
        profitValueEl.textContent = `₹${safeProfit.toLocaleString('en-IN')}`;
        profitValueEl.style.color = safeProfit >= 0 ? '#166534' : '#991b1b';
    }

    form.addEventListener('input', function(e) {
        if (e.target && e.target.name === 'price') {
            updateProfitDisplay();
        }
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const price = form.price.value;
        if (!id || !price) {
            alert('Missing required fields');
            return;
        }
        if (!sellRequestDetails) {
            alert('Car details not loaded. Please try again.');
            return;
        }
        const carData = {
            price: price,
            image_url: sellRequestDetails.image_url || sellRequestDetails.image,
            show_color: !!document.getElementById('show_color')?.checked,
            show_fuel_type: !!document.getElementById('show_fuel_type')?.checked,
            show_mileage: !!document.getElementById('show_mileage')?.checked,
            show_num_owners: !!document.getElementById('show_num_owners')?.checked,
            show_registration_city: !!document.getElementById('show_registration_city')?.checked,
            show_registration_number: !!document.getElementById('show_registration_number')?.checked,
            show_transmission: !!document.getElementById('show_transmission')?.checked,
            show_vin: !!document.getElementById('show_vin')?.checked,
            show_insurance_validity: !!document.getElementById('show_insurance_validity')?.checked,
            show_description: !!document.getElementById('show_description')?.checked
        };
        fetch(`/admin/sell-request/${id}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(carData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Vehicle confirmed and added to buy page!');
                window.location.href = '/buy';
            } else {
                alert('Error: ' + (data.message || 'Could not confirm request'));
            }
        })
        .catch(() => {
            alert('Network error');
        });
    });
});
