// Fetch and display bookings for admin

document.addEventListener('DOMContentLoaded', function() {
        // --- Holiday Management Logic ---
        const holidaySection = document.getElementById('holidayManagementSection');
        const holidaysTable = document.getElementById('holidaysTable');
        const addHolidayForm = document.getElementById('addHolidayForm');
        if (holidaySection && holidaysTable && addHolidayForm) {
            // Fetch and display holidays
            async function fetchHolidays() {
                try {
                    const res = await fetch('/admin/holidays');
                    if (!res.ok) throw new Error('Failed to fetch holidays');
                    const holidays = await res.json();
                    const tbody = holidaysTable.querySelector('tbody');
                    tbody.innerHTML = '';
                    holidays.forEach(holiday => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${holiday.date}</td>
                            <td>${holiday.description || ''}</td>
                            <td><button class="remove-holiday-btn" data-id="${holiday.id}" style="background:#e74c3c;color:#fff;border:none;border-radius:5px;padding:6px 14px;font-weight:600;cursor:pointer;">Remove</button></td>
                        `;
                        tbody.appendChild(tr);
                    });
                    // Add event listeners for remove buttons
                    tbody.querySelectorAll('.remove-holiday-btn').forEach(btn => {
                        btn.addEventListener('click', async function() {
                            const holidayId = this.getAttribute('data-id');
                            if (!confirm('Remove this holiday?')) return;
                            try {
                                const res = await fetch(`/admin/holidays/${holidayId}`, { method: 'DELETE' });
                                if (res.ok) fetchHolidays();
                                else alert('Failed to remove holiday');
                            } catch (err) {
                                alert('Server error while removing holiday');
                            }
                        });
                    });
                } catch (err) {
                    // Optionally show error
                }
            }
            fetchHolidays();
            // Add holiday form submit
            addHolidayForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const date = document.getElementById('holidayDate').value;
                const description = document.getElementById('holidayDesc').value;
                if (!date) return alert('Please select a date');
                try {
                    const res = await fetch('/admin/holidays', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, description })
                    });
                    if (res.ok) {
                        addHolidayForm.reset();
                        fetchHolidays();
                        alert('Holiday added successfully!');
                    } else {
                        const data = await res.json().catch(() => ({}));
                        alert(data.message || 'Failed to add holiday');
                    }
                } catch (err) {
                    alert('Server error while adding holiday');
                }
            });
        }
    fetchBookings();

    async function fetchBookings() {
        try {
            const res = await fetch('/admin/bookings');
            if (!res.ok) return;
            const bookings = await res.json();
            const tbody = document.querySelector('#bookingsTable tbody');
            tbody.innerHTML = '';
            bookings.forEach(booking => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${booking.id}</td>
                    <td>${booking.user_id || 'Guest'}</td>
                    <td>${booking.vehicle_type}</td>
                    <td>${booking.service_type}</td>
                    <td>${new Date(booking.booking_date).toLocaleDateString()}</td>
                    <td>${booking.booking_time}</td>
                    <td>${booking.contact}</td>
                    <td>₹${Number(booking.price || 0).toLocaleString('en-IN')}</td>
                    <td class="status-cell status-${booking.status.toLowerCase()}">${booking.status}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            // Optionally handle error
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    fetchBookings();
    fetchMechanics();
    fetchWorkshops();
    fetchServices();
    setupOfflineWorkshopFilter();
    setupAdminSections();
    const addOfflineBookingForm = document.getElementById('addOfflineBookingForm');
    if (addOfflineBookingForm) {
        addOfflineBookingForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const form = e.currentTarget;
            const vehicle_type = form.vehicleType.value.trim();
            const service_type = form.serviceType.value.trim();
            const booking_date = form.bookingDate.value;
            const booking_time = form.bookingTime.value;
            const contact = form.contact.value.trim();
            const price = form.price.value;
            const notes = form.notes.value.trim();
            const workshop_id = form.workshopId.value || null;
            const mechanic_id = form.mechanicId.value || null;
            const status = form.fulfilled.checked ? 'fulfilled' : 'pending';
            const ignore_conflicts = !!form.ignoreConflicts.checked;

            if (!mechanic_id && !workshop_id) {
                alert('Please select a mechanic or a workshop.');
                return;
            }

            try {
                const res = await fetch('/admin/bookings/offline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicle_type,
                        service_type,
                        booking_date,
                        booking_time,
                        contact,
                        price,
                        notes: notes || null,
                        workshop_id,
                        mechanic_id,
                        status,
                        ignore_conflicts
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    alert(data.message || 'Failed to add offline booking.');
                    return;
                }
                form.reset();
                form.fulfilled.checked = true;
                fetchBookings();
                alert('Offline booking added.');
            } catch (err) {
                alert('Server error while adding offline booking.');
            }
        });
    }

    async function fetchBookings() {
        try {
            const res = await fetch('/admin/bookings');
            if (!res.ok) return;
            const bookings = await res.json();
            const tbody = document.querySelector('#bookingsTable tbody');
            tbody.innerHTML = '';
            bookings.forEach(booking => {
                const tr = document.createElement('tr');
                // Fix: parse date and time robustly
                let datePart = booking.booking_date;
                if (datePart && datePart.includes('T')) datePart = datePart.split('T')[0];
                let timePart = booking.booking_time;
                if (timePart && timePart.includes('T')) timePart = timePart.split('T')[1];
                if (timePart && timePart.includes('.')) timePart = timePart.split('.')[0];
                // Compose local datetime string
                const bookingDateTime = new Date(`${datePart}T${timePart}`);
                const now = new Date();
                    let statusCell = `<td class="status-cell status-${booking.status.toLowerCase()}">${booking.status}</td>`;
                    // Use the correct booking ID for the button
                    const fulfillId = booking.booking_id || booking.id || '';
                    if (booking.status === 'pending' && bookingDateTime < now) {
                        statusCell = `<td><button class="fulfill-btn" data-id="${fulfillId}">Mark as Fulfilled</button></td>`;
                    }
                tr.innerHTML = `
                    <td>${booking.booking_id || booking.id || ''}</td>
                    <td>${booking.user_id || 'Guest'}</td>
                    <td>${booking.vehicle_type}</td>
                    <td>${booking.service_type}</td>
                    <td>${new Date(datePart).toLocaleDateString()}</td>
                    <td>${timePart}</td>
                    <td>${booking.contact}</td>
                    <td>₹${Number(booking.price || 0).toLocaleString('en-IN')}</td>
                    ${statusCell}
                `;
                tbody.appendChild(tr);
            });
            // Add event listeners for fulfill buttons
            document.querySelectorAll('.fulfill-btn').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const bookingId = this.getAttribute('data-id');
                    if (!confirm('Mark this booking as fulfilled?')) return;
                    const res = await fetch(`/admin/fulfill-booking?booking_id=${bookingId}`, { method: 'POST' });
                    if (res.ok) {
                        this.closest('tr').remove();
                    } else {
                        alert('Failed to mark as fulfilled.');
                    }
                });
            });
        } catch (err) {
            // Optionally handle error
        }
    }

    async function fetchMechanics() {
        try {
            const res = await fetch('/admin/mechanics');
            if (!res.ok) {
                const errMsg = await res.text();
                alert('Failed to fetch mechanics. ' + errMsg);
                console.error('Fetch mechanics failed:', errMsg);
                return;
            }
            const mechanics = await res.json();
            const tbody = document.querySelector('#mechanicsTable tbody');
            tbody.innerHTML = '';
            mechanics.forEach(mechanic => {
                const workshopLabel = mechanic.workshop_address
                    ? `${mechanic.workshop_address} (#${mechanic.workshop_id})`
                    : (mechanic.workshop_id ?? '');
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${mechanic.mechanic_id}</td>
                    <td>${mechanic.name}</td>
                    <td>${mechanic.phone}</td>
                    <td>${workshopLabel}</td>
                `;
                tbody.appendChild(tr);
            });
            await populateOfflineMechanicsAll();
        } catch (err) {
            alert('Error fetching mechanics: ' + (err.message || err));
            console.error('Fetch mechanics error:', err);
        }
    }

    async function fetchWorkshops() {
        try {
            const res = await fetch('/admin/workshops');
            if (!res.ok) return;
            const workshops = await res.json();

            // Populate workshops table
            const tableBody = document.querySelector('#workshopsTable tbody');
            tableBody.innerHTML = '';
            workshops.forEach(workshop => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${workshop.workshop_id}</td>
                    <td>${workshop.name}</td>
                    <td>${workshop.address}</td>
                    <td>${workshop.phone}</td>
                `;
                tableBody.appendChild(tr);
            });

            // Populate workshop select dropdown for adding mechanics
            const workshopSelect = document.getElementById('mechanicWorkshopSelect');
            if (workshopSelect) {
                workshopSelect.innerHTML = '<option value="">Select Workshop</option>'; // Clear existing options and add a default
                workshops.forEach(workshop => {
                    const option = document.createElement('option');
                    option.value = workshop.workshop_id;
                    option.textContent = workshop.name + (workshop.address ? ` (${workshop.address})` : '');
                    workshopSelect.appendChild(option);
                });
            }

            const offlineWorkshopSelect = document.getElementById('offlineWorkshopSelect');
            if (offlineWorkshopSelect) {
                offlineWorkshopSelect.innerHTML = '<option value="">Select Workshop (optional)</option>';
                workshops.forEach(workshop => {
                    const option = document.createElement('option');
                    option.value = workshop.workshop_id;
                    option.textContent = workshop.name + (workshop.address ? ` (${workshop.address})` : '');
                    offlineWorkshopSelect.appendChild(option);
                });
            }
        } catch (err) {
            // Optionally handle error
            console.error('Error fetching workshops:', err);
        }
    }

    async function fetchServices() {
        try {
            const res = await fetch('/admin/services');
            if (!res.ok) return;
            const services = await res.json();
            const dataList = document.getElementById('offlineServiceList');
            if (dataList) {
                dataList.innerHTML = '';
                services.forEach(service => {
                    const opt = document.createElement('option');
                    opt.value = service.name;
                    opt.setAttribute('data-price', service.price);
                    dataList.appendChild(opt);
                });
            }

            const serviceInput = document.querySelector('#addOfflineBookingForm input[name="serviceType"]');
            const priceInput = document.querySelector('#addOfflineBookingForm input[name="price"]');
            if (serviceInput && priceInput) {
                const priceMap = new Map(
                    services.map(service => [String(service.name).toLowerCase(), service.price])
                );
                const applyPrice = () => {
                    const key = String(serviceInput.value || '').trim().toLowerCase();
                    if (priceMap.has(key)) {
                        priceInput.value = Number(priceMap.get(key)).toFixed(2);
                    }
                };
                serviceInput.addEventListener('change', applyPrice);
                serviceInput.addEventListener('blur', applyPrice);
            }
        } catch (err) {
            console.error('Error fetching services:', err);
        }
    }

    async function populateOfflineMechanicsAll() {
        try {
            const res = await fetch('/admin/mechanics');
            if (!res.ok) return;
            const mechanics = await res.json();
            const mechanicSelect = document.getElementById('offlineMechanicSelect');
            if (mechanicSelect) {
                mechanicSelect.innerHTML = '<option value="">Select Mechanic (optional)</option>';
                mechanics.forEach(mechanic => {
                    const option = document.createElement('option');
                    option.value = mechanic.mechanic_id;
                    option.textContent = `${mechanic.name} (#${mechanic.mechanic_id})`;
                    mechanicSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error('Error loading mechanics:', err);
        }
    }

    async function populateOfflineMechanicsByWorkshop(workshopId) {
        const mechanicSelect = document.getElementById('offlineMechanicSelect');
        if (!mechanicSelect) return;
        mechanicSelect.innerHTML = '<option value="">Select Mechanic (optional)</option>';
        if (!workshopId) {
            await populateOfflineMechanicsAll();
            return;
        }
        try {
            const res = await fetch(`/api/mechanics/${workshopId}`);
            if (!res.ok) return;
            const mechanics = await res.json();
            if (!mechanics.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No mechanics in this workshop';
                opt.disabled = true;
                mechanicSelect.appendChild(opt);
                return;
            }
            mechanics.forEach(m => {
                const option = document.createElement('option');
                option.value = m.mechanic_id;
                option.textContent = `${m.name} (#${m.mechanic_id})`;
                mechanicSelect.appendChild(option);
            });
        } catch (err) {
            console.error('Error loading mechanics by workshop:', err);
        }
    }

    function setupOfflineWorkshopFilter() {
        const workshopSelect = document.getElementById('offlineWorkshopSelect');
        const mechanicSelect = document.getElementById('offlineMechanicSelect');
        if (!workshopSelect || !mechanicSelect) return;
        workshopSelect.addEventListener('change', async (e) => {
            mechanicSelect.value = '';
            await populateOfflineMechanicsByWorkshop(e.target.value);
        });
    }

    function setupAdminSections() {
        const newsletterTab = document.getElementById('newsletterTab');
        const offersTab = document.getElementById('offersTab');

        if (newsletterTab) {
            newsletterTab.addEventListener('click', (e) => {
                e.preventDefault();
                showAdminSection('newsletter');
                fetchNewsletterSubscribers();
            });
        }

        if (offersTab) {
            offersTab.addEventListener('click', (e) => {
                e.preventDefault();
                showAdminSection('offers');
                fetchCarsForOffers();
                fetchOffers();
                fetchPreviousOffers();
            });
        }

        // Default to bookings section
        showAdminSection('bookings');
    }

    function showAdminSection(section) {
        const bookingsSection = document.getElementById('adminSectionBookings');
        const newsletterSection = document.getElementById('adminSectionNewsletter');
        const offersSection = document.getElementById('adminSectionOffers');

        if (bookingsSection) {
            bookingsSection.style.display = section === 'bookings' ? '' : 'none';
        }
        if (newsletterSection) {
            newsletterSection.style.display = section === 'newsletter' ? '' : 'none';
        }
        if (offersSection) {
            offersSection.style.display = section === 'offers' ? '' : 'none';
        }
    }

    async function fetchNewsletterSubscribers() {
        try {
            const res = await fetch('/admin/newsletter-subscribers');
            if (!res.ok) return;
            const subscribers = await res.json();
            const tbody = document.querySelector('#newsletterTable tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            subscribers.forEach(sub => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${sub.id}</td>
                    <td>${sub.email}</td>
                    <td>${new Date(sub.subscribed_at).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Fetch newsletter subscribers failed', err);
        }
    }

    async function fetchCarsForOffers() {
        const carOfferSelect = document.getElementById('carOfferSelect');
        const carOfferText = document.getElementById('carOfferText');
        if (!carOfferSelect) return;
        let carList = [];
        try {
            const res = await fetch('/admin/cars');
            if (!res.ok) return;
            carList = await res.json();
            carOfferSelect.innerHTML = '<option value="">Select a car...</option>';
            carList.forEach(car => {
                const opt = document.createElement('option');
                opt.value = car.id;
                opt.textContent = `${car.make} ${car.model} (${car.year}) - ₹${Number(car.price || 0).toLocaleString('en-IN')}`;
                carOfferSelect.appendChild(opt);
            });
        } catch (err) {
            carOfferSelect.innerHTML = '<option value="">Error loading cars</option>';
            return;
        }

        const updateOfferText = () => {
            const selectedId = carOfferSelect.value;
            const car = carList.find(c => String(c.id) === String(selectedId));
            const validFrom = document.getElementById('carOfferValidFrom')?.value || '';
            const validTo = document.getElementById('carOfferValidTo')?.value || '';
            let dateMsg = '';
            if (validFrom && validTo) dateMsg = ` (Valid: ${validFrom} to ${validTo})`;
            else if (validFrom) dateMsg = ` (Valid from: ${validFrom})`;
            else if (validTo) dateMsg = ` (Valid until: ${validTo})`;

            if (car && carOfferText) {
                carOfferText.value = `Get the ${car.make} ${car.model} (${car.year}) for just ₹${Number(car.price || 0).toLocaleString('en-IN')} On SecondGear!${dateMsg}`;
            } else if (carOfferText) {
                carOfferText.value = '';
            }
        };

        if (carOfferSelect.dataset.bound !== '1') {
            carOfferSelect.addEventListener('change', updateOfferText);
            const validFromInput = document.getElementById('carOfferValidFrom');
            const validToInput = document.getElementById('carOfferValidTo');
            if (validFromInput) validFromInput.addEventListener('change', updateOfferText);
            if (validToInput) validToInput.addEventListener('change', updateOfferText);

            const addCarOfferForm = document.getElementById('addCarOfferForm');
            if (addCarOfferForm) {
                addCarOfferForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const selectedId = carOfferSelect.value;
                if (!selectedId) return alert('Please select a car.');
                if (!carOfferText.value) return alert('Offer message missing.');
                const validFrom = document.getElementById('carOfferValidFrom').value || null;
                const validTo = document.getElementById('carOfferValidTo').value || null;
                try {
                    const res = await fetch('/admin/offers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: carOfferText.value, valid_from: validFrom, valid_to: validTo })
                    });
                    if (res.ok) {
                        addCarOfferForm.reset();
                        if (carOfferText) carOfferText.value = '';
                        fetchOffers();
                        fetchPreviousOffers();
                        alert('Car offer added!');
                    } else {
                        alert('Failed to add car offer.');
                    }
                } catch (err) {
                    alert('Server error while adding car offer.');
                }
                });
            }
            carOfferSelect.dataset.bound = '1';
        }
    }

    async function fetchOffers() {
        try {
            const res = await fetch('/admin/offers');
            if (!res.ok) return;
            const offers = await res.json();
            const tbody = document.querySelector('#offersTable tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            offers.forEach(offer => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${offer.id}</td>
                    <td>${offer.text}</td>
                    <td>${new Date(offer.created_at).toLocaleString()}</td>
                    <td><button class="delete-offer-btn" data-id="${offer.id}" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Delete</button></td>
                `;
                tbody.appendChild(tr);
            });
            tbody.querySelectorAll('.delete-offer-btn').forEach(btn => {
                btn.addEventListener('click', async function() {
                    const offerId = btn.getAttribute('data-id');
                    if (!confirm('Delete this offer?')) return;
                    const res = await fetch(`/admin/offers/${offerId}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchOffers();
                        fetchPreviousOffers();
                    } else {
                        alert('Failed to delete offer.');
                    }
                });
            });
        } catch (err) {
            console.error('Fetch offers failed', err);
        }
    }

    async function fetchPreviousOffers() {
        try {
            const res = await fetch('/admin/previous-offers');
            if (!res.ok) return;
            const offers = await res.json();
            const tbody = document.querySelector('#previousOffersTable tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            offers.forEach(offer => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${offer.id}</td>
                    <td>${offer.text}</td>
                    <td>${new Date(offer.created_at).toLocaleString()}</td>
                    <td>${new Date(offer.deleted_at).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Fetch previous offers failed', err);
        }
    }

    const addOfferForm = document.getElementById('addOfferForm');
    if (addOfferForm) {
        addOfferForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const offerText = addOfferForm.offerText.value.trim();
            const validFrom = addOfferForm.offerValidFrom.value || null;
            const validTo = addOfferForm.offerValidTo.value || null;
            if (!offerText) return alert('Offer text required.');
            try {
                const res = await fetch('/admin/offers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: offerText, valid_from: validFrom, valid_to: validTo })
                });
                if (res.ok) {
                    addOfferForm.reset();
                    fetchOffers();
                    fetchPreviousOffers();
                    alert('Offer added!');
                } else {
                    alert('Failed to add offer.');
                }
            } catch (err) {
                alert('Server error while adding offer.');
            }
        });
    }

    // Add Service Form Submission
    const addServiceForm = document.getElementById('addServiceForm');
    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(addServiceForm);
            const service = {
                serviceName: formData.get('serviceName'),
                serviceDescription: formData.get('serviceDescription'),
                servicePrice: formData.get('servicePrice')
            };
            try {
                const res = await fetch('/admin/add-service', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(service)
                });
                if (res.ok) {
                    alert('Service added successfully!');
                    addServiceForm.reset();
                } else {
                    alert('Failed to add service.');
                }
            } catch (err) {
                alert('Error adding service.');
            }
        });
    }

    // Add Mechanic Form Submission
    const addMechanicForm = document.getElementById('addMechanicForm');
    if (addMechanicForm) {
        let mechanicSubmitting = false;
        addMechanicForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (mechanicSubmitting) return;
            mechanicSubmitting = true;
            const submitBtn = addMechanicForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            const mechanicName = addMechanicForm.querySelector('input[name="mechanicName"]').value;
            const mechanicPhone = addMechanicForm.querySelector('input[name="mechanicPhone"]').value.trim();
            const workshopId = document.getElementById('mechanicWorkshopSelect').value;

            if (!workshopId) {
                alert('Please select a workshop for the mechanic.');
                submitBtn.disabled = false;
                mechanicSubmitting = false;
                return;
            }

            // Validate phone: must be 10 digits
            if (!/^[0-9]{10}$/.test(mechanicPhone)) {
                alert('Please enter a valid 10-digit phone number for the mechanic.');
                submitBtn.disabled = false;
                mechanicSubmitting = false;
                return;
            }
            const mechanic = { mechanicName, mechanicPhone, workshopId };
            try {
                const res = await fetch('/admin/add-mechanic', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mechanic)
                });
                if (res.ok) {
                    alert('Mechanic added successfully!');
                    addMechanicForm.reset();
                    await fetchMechanics();
                } else {
                    const errMsg = await res.text();
                    alert('Failed to add mechanic. ' + errMsg);
                    console.error('Add mechanic failed:', errMsg);
                }
            } catch (err) {
                alert('Error adding mechanic: ' + (err.message || err));
                console.error('Add mechanic error:', err);
            }
            submitBtn.disabled = false;
            mechanicSubmitting = false;
        });
    }

    // Add Workshop Form Submission
    const addWorkshopForm = document.getElementById('addWorkshopForm');
    if (addWorkshopForm) {
        let workshopSubmitting = false;
        addWorkshopForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (workshopSubmitting) return;
            workshopSubmitting = true;
            const submitBtn = addWorkshopForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            const formData = new FormData(addWorkshopForm);
            const workshopName = formData.get('workshopName');
            const workshopAddress = formData.get('workshopAddress');
            const workshopPhone = formData.get('workshopPhone').trim();
            // Validate phone: must be 10 digits
            if (!/^[0-9]{10}$/.test(workshopPhone)) {
                alert('Please enter a valid 10-digit phone number for the workshop.');
                submitBtn.disabled = false;
                workshopSubmitting = false;
                return;
            }
            const workshop = {
                workshopName,
                workshopAddress,
                workshopPhone
            };
            try {
                const res = await fetch('/admin/add-workshop', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(workshop)
                });
                if (res.ok) {
                    alert('Workshop added successfully!');
                    addWorkshopForm.reset();
                    await fetchWorkshops();
                } else {
                    const errMsg = await res.text();
                    alert('Failed to add workshop. ' + errMsg);
                }
            } catch (err) {
                alert('Error Adding Workshop: ' + (err.message || err));
            }
            submitBtn.disabled = false;
            workshopSubmitting = false;
        });
    }
});
