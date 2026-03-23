// car-details.js
// Fetch car details by ID from URL and display all info, with auto-generated description

document.addEventListener('DOMContentLoaded', async function() {
    const carDetailsContainer = document.getElementById('car-details-container');
    const carTitle = document.getElementById('car-title');
    const carImage = document.getElementById('car-image');
    const galleryPrev = document.getElementById('gallery-prev');
    const galleryNext = document.getElementById('gallery-next');
    const galleryCounter = document.getElementById('gallery-counter');
    const carAutogenDescription = document.getElementById('car-autogen-description');
    const carInfoTable = document.getElementById('car-info-table');
    const proceedToBuyButton = document.getElementById('proceed-to-buy');
    const quickPrice = document.getElementById('quick-price');
    const quickYear = document.getElementById('quick-year');
    const quickFuel = document.getElementById('quick-fuel');
    const quickOwners = document.getElementById('quick-owners');
    const quickMileage = document.getElementById('quick-mileage');
    const listingBadge = document.getElementById('listing-badge');
    const verifiedSellerBadge = document.getElementById('verified-seller-badge');
    const chatSellerBtn = document.getElementById('chat-seller-btn');
    const queryForm = document.getElementById('car-query-form');
    const querySubject = document.getElementById('query-subject');
    const queryMessage = document.getElementById('query-message');
    const queryStatus = document.getElementById('query-status');
    const detailsShell = document.getElementById('details-shell');
    const toggleQueryBtn = document.getElementById('toggle-query');

    const urlParams = new URLSearchParams(window.location.search);
    const carId = urlParams.get('id');

    if (!carId) {
        if (carDetailsContainer) {
            carDetailsContainer.innerHTML = '<h1>Car ID not provided.</h1><p>Please go back to the "Buy" page and select a car.</p>';
        }
        return;
    }

    // Show loading state
    if(carTitle) carTitle.textContent = 'Loading...';
    if(carDetailsContainer) carDetailsContainer.style.opacity = '0.5';
    if(proceedToBuyButton) proceedToBuyButton.disabled = true;

    const PLACEHOLDER_IMG = 'images/cars/about.jpg';
    const normalizeImageUrl = (url) => {
        if (!url) return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return url;
        return `/${url}`;
    };

    const updateGalleryUI = () => {
        if (!carImage) return;
        const total = galleryImages.length || 1;
        if (!galleryImages.length) {
            galleryImages = [PLACEHOLDER_IMG];
            galleryIndex = 0;
        } else {
            galleryIndex = Math.min(Math.max(galleryIndex, 0), total - 1);
        }
        carImage.src = galleryImages[galleryIndex];
        carImage.onerror = () => {
            carImage.onerror = null;
            carImage.src = PLACEHOLDER_IMG;
        };
        if (galleryCounter) {
            galleryCounter.textContent = `${galleryIndex + 1} / ${total}`;
        }
        const disableNav = total <= 1;
        if (galleryPrev) galleryPrev.disabled = disableNav;
        if (galleryNext) galleryNext.disabled = disableNav;
        if (galleryCounter) galleryCounter.style.display = total <= 1 ? 'none' : 'inline-flex';
    };

    if (galleryPrev) {
        galleryPrev.addEventListener('click', () => {
            if (galleryImages.length <= 1) return;
            galleryIndex = (galleryIndex - 1 + galleryImages.length) % galleryImages.length;
            updateGalleryUI();
        });
    }
    if (galleryNext) {
        galleryNext.addEventListener('click', () => {
            if (galleryImages.length <= 1) return;
            galleryIndex = (galleryIndex + 1) % galleryImages.length;
            updateGalleryUI();
        });
    }

    let carData = null;
    let galleryImages = [];
    let galleryIndex = 0;
    try {
        const res = await fetch(`/cars/${carId}`);
        if (!res.ok) {
            throw new Error('Car not found');
        }
        const car = await res.json();
        carData = car;

        // --- Populate car details ---

        // Set image gallery (manual navigation)
        const baseImageUrl = normalizeImageUrl(car.image_url || car.image || PLACEHOLDER_IMG);
        try {
            const imgRes = await fetch(`/cars/${carId}/images`);
            if (imgRes.ok) {
                const imgData = await imgRes.json();
                if (Array.isArray(imgData) && imgData.length) {
                    galleryImages = imgData.map(img => normalizeImageUrl(img.image_url)).filter(Boolean);
                }
            }
        } catch (e) {
            // ignore gallery fetch errors
        }
        if (!galleryImages.length) {
            galleryImages = [baseImageUrl];
        } else if (!galleryImages.includes(baseImageUrl)) {
            galleryImages.unshift(baseImageUrl);
        }
        if (carImage) {
            carImage.alt = `${car.make} ${car.model}`;
        }
        updateGalleryUI();

        // Set title
        if(carTitle) carTitle.textContent = `${car.make} ${car.model} (${car.year})`;
        if (listingBadge) {
            const hasSeller = !!(car.seller_user_id || (car.seller_email && String(car.seller_email).trim()));
            const label = hasSeller ? 'User Listing' : 'SecondGear Direct';
            const title = hasSeller ? 'Listed by a SecondGear user' : 'Sold directly by SecondGear';
            listingBadge.textContent = label;
            listingBadge.title = title;
            listingBadge.classList.remove('user', 'direct');
            listingBadge.classList.add(hasSeller ? 'user' : 'direct');
            if (verifiedSellerBadge) {
                const isVerified = !!car.seller_is_verified;
                if (hasSeller && isVerified) {
                    verifiedSellerBadge.style.display = 'inline-flex';
                    verifiedSellerBadge.title = 'Verified Seller';
                } else {
                    verifiedSellerBadge.style.display = 'none';
                }
            }
        }
        if (querySubject && car.make) {
            querySubject.value = `Query about ${car.make} ${car.model} (${car.year})`;
        }

        // Auto-generate description
        if(carAutogenDescription) carAutogenDescription.textContent = generateCarDescription(car);

        // Fill quick summary card to use left-side space intentionally
        if (quickPrice) quickPrice.textContent = car.price ? `₹${Number(car.price).toLocaleString('en-IN')}` : 'Price on request';
        if (quickYear) quickYear.textContent = car.year || '--';
        if (quickFuel) quickFuel.textContent = car.fuel_type || '--';
        if (quickOwners) quickOwners.textContent = car.num_owners || '--';
        if (quickMileage) quickMileage.textContent = car.mileage ? `${car.mileage} km` : '--';

        // Fill info table
        if(carInfoTable){
            carInfoTable.innerHTML = ''; // Clear previous data
            const fields = [
                ['Price', car.price ? `₹${Number(car.price).toLocaleString('en-IN')}` : 'N/A'],
                ['Color', car.color],
                ['Fuel Type', car.fuel_type],
                ['Mileage', car.mileage ? `${car.mileage} km` : 'N/A'],
                ['Number of Owners', car.num_owners],
                ['Registration City', car.registration_city],
                ['Registration Number', car.registration_number],
                ['Transmission', car.transmission],
                ['VIN', car.vin],
                ['Insurance Validity', car.insurance_validity],
                ['Description', car.description]
            ];

            for (const [label, value] of fields) {
                if (value && value !== 'N/A') {
                    const row = document.createElement('tr');
                    row.innerHTML = `<th>${label}</th><td>${value}</td>`;
                    carInfoTable.appendChild(row);
                }
            }
        }


        // Set up buy button
        if(proceedToBuyButton){
            proceedToBuyButton.onclick = function() {
                window.location.href = `purchase.html?car_id=${car.id}`;
            };
            proceedToBuyButton.disabled = false;
        }

        if (chatSellerBtn) {
            chatSellerBtn.style.display = 'none';
            try {
                const sessionRes = await fetch('/user/session');
                const sessionData = sessionRes.ok ? await sessionRes.json() : null;
                const isLoggedIn = !!(sessionData && sessionData.loggedIn);
                const userId = sessionData && sessionData.user ? sessionData.user.id : null;
                const sellerId = car.seller_user_id || null;
                if (isLoggedIn && sellerId && userId && Number(userId) !== Number(sellerId)) {
                    chatSellerBtn.style.display = 'inline-flex';
                    chatSellerBtn.addEventListener('click', async function() {
                        chatSellerBtn.disabled = true;
                        const originalText = chatSellerBtn.textContent;
                        chatSellerBtn.textContent = 'Sending...';
                        try {
                            const res = await fetch('/chat/request', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ car_id: car.id })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.message || 'Unable to send chat request.');
                            alert(data.message || 'Chat request sent.');
                            window.location.href = `chat.html?car_id=${encodeURIComponent(car.id)}`;
                        } catch (err) {
                            alert(err.message || 'Unable to send chat request.');
                        } finally {
                            chatSellerBtn.disabled = false;
                            chatSellerBtn.textContent = originalText;
                        }
                    });
                }
            } catch (e) {
                // ignore
            }
        }


    } catch (err) {
        // Handle errors (e.g., car not found, network issue)
        if(carDetailsContainer) carDetailsContainer.innerHTML = '<h1>Car not found.</h1><p>The car you are looking for might have been sold or does not exist.</p>';
    } finally {
        // Restore opacity
        if(carDetailsContainer) carDetailsContainer.style.opacity = '1';
    }

    if (toggleQueryBtn && detailsShell) {
        toggleQueryBtn.addEventListener('click', function() {
            const isOpen = detailsShell.classList.toggle('open');
            toggleQueryBtn.textContent = isOpen ? 'Close Query' : 'Ask a Question';
            if (isOpen && querySubject) {
                setTimeout(() => querySubject.focus(), 200);
            }
        });
    }

    // Query form handling
    if (queryForm) {
        const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);
        let isLoggedIn = false;
        try {
            const sessionRes = await fetch('/user/session');
            if (sessionRes.ok) {
                const sessionData = await sessionRes.json();
                isLoggedIn = !!(sessionData && sessionData.loggedIn);
            }
        } catch (e) {
            isLoggedIn = getAuthItem('userLoggedIn') === 'true';
        }

        if (!isLoggedIn) {
            if (queryStatus) queryStatus.textContent = 'Please log in to submit a query.';
            if (querySubject) querySubject.disabled = true;
            if (queryMessage) queryMessage.disabled = true;
            const submitBtn = queryForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        queryForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!carData) return;
            if (queryStatus) queryStatus.textContent = 'Submitting...';
            const subject = querySubject ? querySubject.value.trim() : '';
            const message = queryMessage ? queryMessage.value.trim() : '';
            if (!subject || !message) {
                if (queryStatus) queryStatus.textContent = 'Please fill in subject and message.';
                return;
            }
            try {
                const res = await fetch('/user/car-queries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ car_id: carData.id, subject, message })
                });
                const result = await res.json();
                if (!res.ok) {
                    throw new Error(result.message || 'Failed to submit query.');
                }
                if (queryStatus) queryStatus.textContent = result.message || 'Query submitted.';
                if (queryMessage) queryMessage.value = '';
            } catch (err) {
                if (queryStatus) queryStatus.textContent = err.message || 'Error submitting query.';
            }
        });
    }
});

// Simple auto-description generator
function generateCarDescription(car) {
    let desc = `This ${car.year} ${car.make} ${car.model}`;
    if (car.fuel_type) desc += ` runs on ${car.fuel_type}`;
    if (car.transmission) desc += ` with a ${car.transmission} transmission`;
    if (car.mileage) desc += ` and has covered about ${car.mileage} km`;
    if (car.color) desc += `, finished in ${car.color}`;
    desc += '.';
    if (car.num_owners) desc += ` It has had ${car.num_owners} owner${car.num_owners > 1 ? 's' : ''}.`;
    if (car.insurance_validity) desc += ` Insurance valid till ${car.insurance_validity}.`;
    if (car.registration_city) desc += ` Registered in ${car.registration_city}.`;
    return desc;
}
