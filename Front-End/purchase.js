// purchase.js
// Handles purchase form submission and payment details

document.addEventListener('DOMContentLoaded', function () {
    const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);
    // Autofill address, city, and zip using geolocation
    function autofillLocationFields() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(async function (position) {
            const { latitude, longitude } = position.coords;
            try {
                // Use Nominatim OpenStreetMap API for reverse geocoding
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                if (data && data.address) {
                    if (data.address.road && document.getElementById('address')) {
                        document.getElementById('address').value = data.address.road + (data.address.house_number ? (', ' + data.address.house_number) : '');
                    }
                    if (data.address.city && document.getElementById('city')) {
                        document.getElementById('city').value = data.address.city;
                    } else if (data.address.town && document.getElementById('city')) {
                        document.getElementById('city').value = data.address.town;
                    } else if (data.address.village && document.getElementById('city')) {
                        document.getElementById('city').value = data.address.village;
                    }
                    if (data.address.postcode && document.getElementById('zip')) {
                        document.getElementById('zip').value = data.address.postcode;
                    }
                }
            } catch (err) {
                // Ignore geolocation errors
            }
        });
    }

    // Toggle logic for location input mode
    const locationToggle = document.getElementById('location-toggle');
    const locationModeControl = document.getElementById('location-mode-control');
    const modeOptions = document.querySelectorAll('.mode-option');
    const addressInput = document.getElementById('address');
    const cityInput = document.getElementById('city');
    const zipInput = document.getElementById('zip');

    function setLocationInputsDisabled(disabled) {
        if (!addressInput || !cityInput || !zipInput) return;
        addressInput.readOnly = disabled;
        cityInput.readOnly = disabled;
        zipInput.readOnly = disabled;
        if (disabled) {
            autofillLocationFields();
        } else {
            addressInput.value = '';
            cityInput.value = '';
            zipInput.value = '';
        }
    }

    function applyLocationMode(useAuto) {
        if (locationToggle) {
            locationToggle.checked = useAuto;
        }
        if (locationModeControl) {
            locationModeControl.classList.toggle('manual', !useAuto);
        }
        modeOptions.forEach(option => {
            const isActive = (useAuto && option.dataset.mode === 'auto') || (!useAuto && option.dataset.mode === 'manual');
            option.classList.toggle('active', isActive);
        });
        setLocationInputsDisabled(useAuto);
    }

    // Initial state: auto-detect enabled
    applyLocationMode(true);

    modeOptions.forEach(option => {
        option.addEventListener('click', function () {
            applyLocationMode(option.dataset.mode === 'auto');
        });
    });

    if (locationToggle) {
        locationToggle.addEventListener('change', function () {
            applyLocationMode(locationToggle.checked);
        });
    }
    // Check if user is logged in (simple localStorage check)
    if (!getAuthItem('userLoggedIn')) {
        // Not logged in, redirect to login page
        window.location.href = 'user-login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
    }
    // Autofill full name if user is logged in
    const userInfo = JSON.parse(getAuthItem('userInfo') || '{}');
    const firstNameInput = document.getElementById('first-name');
    const lastNameInput = document.getElementById('last-name');
    if (userInfo.firstName && firstNameInput) {
        firstNameInput.value = userInfo.firstName;
    }
    if (userInfo.lastName && lastNameInput) {
        lastNameInput.value = userInfo.lastName;
    }

    // Set car_id from URL
    const urlParams = new URLSearchParams(window.location.search);
    const carId = urlParams.get('car_id');
    const offerIdParam = urlParams.get('offer_id');
    const newsletterOfferIdParam = urlParams.get('newsletter_offer_id');
    const summaryCarName = document.getElementById('summary-car-name');
    const summaryCarPrice = document.getElementById('summary-car-price');
    const summaryCarDelivery = document.getElementById('summary-car-delivery');
    const summaryCarDoc = document.getElementById('summary-car-doc');
    const summaryCarRegistration = document.getElementById('summary-car-registration');
    const summaryCarInspection = document.getElementById('summary-car-inspection');
    const summaryCarPlatform = document.getElementById('summary-car-platform');
    const summaryCarInsurance = document.getElementById('summary-car-insurance');
    const summaryCarWarranty = document.getElementById('summary-car-warranty');
    const summaryCarAccessory = document.getElementById('summary-car-accessory');
    const summaryCarTotal = document.getElementById('summary-car-total');
    const summaryCarYear = document.getElementById('summary-car-year');
    const summaryCarId = document.getElementById('summary-car-id');
    const paymentStatus = document.getElementById('payment-status');
    let purchaseAmount = null;
    let purchaseCurrency = 'INR';
    const DELIVERY_FEE = 2000;
    const DOCUMENT_FEE = 1500;
    const REGISTRATION_TRANSFER_FEE = 2500;
    const INSPECTION_FEE = 1200;
    const PLATFORM_FEE = 1500;
    const INSURANCE_ADDON_FEE = 6000;
    const WARRANTY_EXTENSION_FEE = 8000;
    const ACCESSORY_BUNDLE_FEE = 4500;

    const insuranceAddonCheckbox = document.getElementById('insurance-addon-checkbox');
    const warrantyAddonCheckbox = document.getElementById('warranty-addon-checkbox');
    const accessoryAddonCheckbox = document.getElementById('accessory-addon-checkbox');

    function setSummaryFallback(message) {
        if (summaryCarName) summaryCarName.textContent = message;
        if (summaryCarPrice) summaryCarPrice.textContent = '--';
        if (summaryCarDelivery) summaryCarDelivery.textContent = '--';
        if (summaryCarDoc) summaryCarDoc.textContent = '--';
        if (summaryCarRegistration) summaryCarRegistration.textContent = '--';
        if (summaryCarInspection) summaryCarInspection.textContent = '--';
        if (summaryCarPlatform) summaryCarPlatform.textContent = '--';
        if (summaryCarInsurance) summaryCarInsurance.textContent = '--';
        if (summaryCarWarranty) summaryCarWarranty.textContent = '--';
        if (summaryCarAccessory) summaryCarAccessory.textContent = '--';
        if (summaryCarTotal) summaryCarTotal.textContent = '--';
        if (summaryCarYear) summaryCarYear.textContent = '--';
        if (summaryCarId) summaryCarId.textContent = '--';
        purchaseAmount = null;
    }

    function formatINR(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '--';
        return `₹${numericValue.toLocaleString('en-IN')}`;
    }

    function computeTotals(baseAmount, options = {}) {
        const base = Number(baseAmount);
        if (!Number.isFinite(base)) return { base: null, delivery: null, doc: null, total: null };
        const delivery = DELIVERY_FEE;
        const doc = DOCUMENT_FEE;
        const registration = REGISTRATION_TRANSFER_FEE;
        const inspection = INSPECTION_FEE;
        const platform = PLATFORM_FEE;
        const insurance = options.insurance ? INSURANCE_ADDON_FEE : 0;
        const warranty = options.warranty ? WARRANTY_EXTENSION_FEE : 0;
        const accessory = options.accessory ? ACCESSORY_BUNDLE_FEE : 0;
        const total = Math.round((base + delivery + doc + registration + inspection + platform + insurance + warranty + accessory) * 100) / 100;
        return { base, delivery, doc, registration, inspection, platform, insurance, warranty, accessory, total };
    }

    function getAddonOptions() {
        return {
            insurance: !!(insuranceAddonCheckbox && insuranceAddonCheckbox.checked),
            warranty: !!(warrantyAddonCheckbox && warrantyAddonCheckbox.checked),
            accessory: !!(accessoryAddonCheckbox && accessoryAddonCheckbox.checked)
        };
    }

    function setPaymentStatus(message, type) {
        if (!paymentStatus) return;
        paymentStatus.textContent = message;
        paymentStatus.className = 'payment-status show';
        if (type) paymentStatus.classList.add(type);
    }

    function clearPaymentStatus() {
        if (!paymentStatus) return;
        paymentStatus.textContent = '';
        paymentStatus.className = 'payment-status';
    }

    async function loadPurchaseSummary(selectedCarId, selectedOfferId, selectedNewsletterOfferId) {
        if (!selectedCarId) {
            setSummaryFallback('No car selected');
            return;
        }
        try {
            if (selectedNewsletterOfferId) {
                const offerRes = await fetch(`/user/newsletter-offer-checkout/${encodeURIComponent(selectedNewsletterOfferId)}`);
                if (offerRes.ok) {
                    const offerData = await offerRes.json();
                    const car = offerData.car || {};
                    const totals = computeTotals(offerData.agreed_price, getAddonOptions());
                    const originalPrice = offerData.discount?.original_price || car.list_price;
                    if (summaryCarName) {
                        summaryCarName.textContent = `${car.make || ''} ${car.model || ''}`.trim() || `Car #${selectedCarId}`;
                    }
                    if (summaryCarPrice) {
                        const originalPart = Number.isFinite(Number(originalPrice))
                            ? ` (MRP ${formatINR(originalPrice)})`
                            : '';
                        summaryCarPrice.textContent = `${formatINR(totals.base)} (Newsletter Offer)${originalPart}`;
                    }
                    if (summaryCarDelivery) summaryCarDelivery.textContent = formatINR(totals.delivery);
                    if (summaryCarDoc) summaryCarDoc.textContent = formatINR(totals.doc);
                    if (summaryCarRegistration) summaryCarRegistration.textContent = formatINR(totals.registration);
                    if (summaryCarInspection) summaryCarInspection.textContent = formatINR(totals.inspection);
                    if (summaryCarPlatform) summaryCarPlatform.textContent = formatINR(totals.platform);
                    if (summaryCarInsurance) summaryCarInsurance.textContent = formatINR(totals.insurance);
                    if (summaryCarWarranty) summaryCarWarranty.textContent = formatINR(totals.warranty);
                    if (summaryCarAccessory) summaryCarAccessory.textContent = formatINR(totals.accessory);
                    if (summaryCarTotal) summaryCarTotal.textContent = formatINR(totals.total);
                    if (summaryCarYear) summaryCarYear.textContent = car.year ? String(car.year) : '--';
                    if (summaryCarId) summaryCarId.textContent = `#${car.id || selectedCarId}`;
                    purchaseAmount = Number(totals.total);
                    return;
                }
            }
            if (selectedOfferId) {
                const offerRes = await fetch(`/user/offer-checkout/${encodeURIComponent(selectedOfferId)}`);
                if (offerRes.ok) {
                    const offerData = await offerRes.json();
                    const car = offerData.car || {};
                    const totals = computeTotals(offerData.agreed_price, getAddonOptions());
                    if (summaryCarName) {
                        summaryCarName.textContent = `${car.make || ''} ${car.model || ''}`.trim() || `Car #${selectedCarId}`;
                    }
                    if (summaryCarPrice) summaryCarPrice.textContent = `${formatINR(totals.base)} (Offer Price)`;
                    if (summaryCarDelivery) summaryCarDelivery.textContent = formatINR(totals.delivery);
                    if (summaryCarDoc) summaryCarDoc.textContent = formatINR(totals.doc);
                    if (summaryCarRegistration) summaryCarRegistration.textContent = formatINR(totals.registration);
                    if (summaryCarInspection) summaryCarInspection.textContent = formatINR(totals.inspection);
                    if (summaryCarPlatform) summaryCarPlatform.textContent = formatINR(totals.platform);
                    if (summaryCarInsurance) summaryCarInsurance.textContent = formatINR(totals.insurance);
                    if (summaryCarWarranty) summaryCarWarranty.textContent = formatINR(totals.warranty);
                    if (summaryCarAccessory) summaryCarAccessory.textContent = formatINR(totals.accessory);
                    if (summaryCarTotal) summaryCarTotal.textContent = formatINR(totals.total);
                    if (summaryCarYear) summaryCarYear.textContent = car.year ? String(car.year) : '--';
                    if (summaryCarId) summaryCarId.textContent = `#${car.id || selectedCarId}`;
                    purchaseAmount = Number(totals.total);
                    return;
                }
            }

            const res = await fetch(`/cars/${encodeURIComponent(selectedCarId)}`);
            if (!res.ok) throw new Error('Failed to fetch car details');
            const car = await res.json();
            const totals = computeTotals(car.price, getAddonOptions());
            if (summaryCarName) {
                summaryCarName.textContent = `${car.make || ''} ${car.model || ''}`.trim() || `Car #${selectedCarId}`;
            }
            if (summaryCarPrice) summaryCarPrice.textContent = formatINR(totals.base);
            if (summaryCarDelivery) summaryCarDelivery.textContent = formatINR(totals.delivery);
            if (summaryCarDoc) summaryCarDoc.textContent = formatINR(totals.doc);
            if (summaryCarRegistration) summaryCarRegistration.textContent = formatINR(totals.registration);
            if (summaryCarInspection) summaryCarInspection.textContent = formatINR(totals.inspection);
            if (summaryCarPlatform) summaryCarPlatform.textContent = formatINR(totals.platform);
            if (summaryCarInsurance) summaryCarInsurance.textContent = formatINR(totals.insurance);
            if (summaryCarWarranty) summaryCarWarranty.textContent = formatINR(totals.warranty);
            if (summaryCarAccessory) summaryCarAccessory.textContent = formatINR(totals.accessory);
            if (summaryCarTotal) summaryCarTotal.textContent = formatINR(totals.total);
            if (summaryCarYear) summaryCarYear.textContent = car.year ? String(car.year) : '--';
            if (summaryCarId) summaryCarId.textContent = `#${car.id || selectedCarId}`;
            purchaseAmount = Number(totals.total);
        } catch (err) {
            setSummaryFallback('Unable to load vehicle details');
        }
    }

    if (carId) {
        document.getElementById('car-id').value = carId;
        loadPurchaseSummary(carId, offerIdParam, newsletterOfferIdParam);
    } else {
        setSummaryFallback('No car selected');
    }

    if (insuranceAddonCheckbox) {
        insuranceAddonCheckbox.addEventListener('change', () => {
            loadPurchaseSummary(carId, offerIdParam, newsletterOfferIdParam);
        });
    }
    if (warrantyAddonCheckbox) {
        warrantyAddonCheckbox.addEventListener('change', () => {
            loadPurchaseSummary(carId, offerIdParam, newsletterOfferIdParam);
        });
    }
    if (accessoryAddonCheckbox) {
        accessoryAddonCheckbox.addEventListener('change', () => {
            loadPurchaseSummary(carId, offerIdParam, newsletterOfferIdParam);
        });
    }
    const form = document.getElementById('purchase-form');
    const paymentMethod = document.getElementById('payment-method');
    const paymentDetails = document.getElementById('payment-details');

    function formatCardNumber(value) {
        const digits = value.replace(/\D/g, '').slice(0, 16);
        return digits.replace(/(.{4})/g, '$1 ').trim();
    }

    function formatExpiry(value) {
        const digits = value.replace(/\D/g, '').slice(0, 4);
        if (digits.length <= 2) return digits;
        return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    function bindCardDemo() {
        const numberInput = document.getElementById('cc-number');
        const expiryInput = document.getElementById('cc-expiry');
        const cvcInput = document.getElementById('cc-cvc');
        const nameTarget = document.getElementById('demo-card-name');
        const numberTarget = document.getElementById('demo-card-number');
        const expiryTarget = document.getElementById('demo-card-exp');
        const cvcTarget = document.getElementById('demo-card-cvc');
        const firstNameInput = document.getElementById('first-name');
        const lastNameInput = document.getElementById('last-name');

        if (numberInput) {
            numberInput.addEventListener('input', () => {
                numberInput.value = formatCardNumber(numberInput.value);
                if (numberTarget) numberTarget.textContent = numberInput.value || '4242 4242 4242 4242';
            });
        }

        if (expiryInput) {
            expiryInput.addEventListener('input', () => {
                expiryInput.value = formatExpiry(expiryInput.value);
                if (expiryTarget) expiryTarget.textContent = expiryInput.value || '12/28';
            });
        }

        if (cvcInput) {
            cvcInput.addEventListener('input', () => {
                cvcInput.value = cvcInput.value.replace(/\D/g, '').slice(0, 4);
                if (cvcTarget) cvcTarget.textContent = cvcInput.value || '123';
            });
        }

        const updateName = () => {
            const fullName = `${firstNameInput?.value || ''} ${lastNameInput?.value || ''}`.trim();
            if (nameTarget) nameTarget.textContent = fullName || 'CARDHOLDER';
        };
        if (firstNameInput) firstNameInput.addEventListener('input', updateName);
        if (lastNameInput) lastNameInput.addEventListener('input', updateName);
        updateName();
    }

    // Show payment fields based on method and update submit button text
    const submitBtn = form.querySelector('button[type="submit"]');
    paymentMethod.addEventListener('change', function () {
        if (paymentMethod.value === 'credit_card' || paymentMethod.value === 'debit_card') {
            paymentDetails.innerHTML = `
                <div class="payment-card-wrap">
                    <div class="demo-flip-card" aria-hidden="true">
                        <div class="demo-flip-card-inner">
                            <div class="demo-flip-card-front">
                                <div class="demo-card-badge">SECONDGEAR</div>
                                <div class="demo-card-chip"></div>
                                <div class="demo-card-contactless">)))</div>
                                <div class="demo-card-number" id="demo-card-number">4242 4242 4242 4242</div>
                                <div class="demo-card-exp-label">VALID THRU</div>
                                <div class="demo-card-exp" id="demo-card-exp">12/28</div>
                                <div class="demo-card-name" id="demo-card-name">CARDHOLDER</div>
                            </div>
                            <div class="demo-flip-card-back">
                                <div class="demo-card-strip"></div>
                                <div class="demo-card-mstrip">
                                    <div class="demo-card-cvc" id="demo-card-cvc">123</div>
                                </div>
                                <div class="demo-card-sstrip"></div>
                            </div>
                        </div>
                    </div>
                    <div class="payment-fields">
                        <div>
                            <label for="cc-number">Card Number:</label>
                            <input type="text" id="cc-number" name="cc_number" inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="e.g. 4242 4242 4242 4242" required>
                        </div>
                        <div>
                            <label for="cc-expiry">Expiry Date:</label>
                            <input type="text" id="cc-expiry" name="cc_expiry" inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="e.g. 12/28" required>
                        </div>
                        <div>
                            <label for="cc-cvc">CVC:</label>
                            <input type="text" id="cc-cvc" name="cc_cvc" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="e.g. 123" required>
                        </div>
                    </div>
                </div>
            `;
            bindCardDemo();
            if (submitBtn) submitBtn.textContent = 'Submit Payment';
        } else if (paymentMethod.value === 'paypal') {
            paymentDetails.innerHTML = `
                <div>
                    <label for="paypal-email">PayPal Email:</label>
                    <input type="email" id="paypal-email" name="paypal_email" placeholder="e.g. alex@gmail.com" required>
                </div>
            `;
            if (submitBtn) submitBtn.textContent = 'Submit Payment';
        } else if (paymentMethod.value === 'cod') {
            paymentDetails.innerHTML = '<div><em>Cash will be collected on delivery.</em></div>';
            if (submitBtn) submitBtn.textContent = 'Continue';
        } else {
            paymentDetails.innerHTML = '';
            if (submitBtn) submitBtn.textContent = 'Submit Payment';
        }
    });

    // Trigger change event on load
    paymentMethod.dispatchEvent(new Event('change'));

    // --- Multi-Step Form Logic ---
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');
    const progressBar = document.getElementById('progress-bar');
    const animatedCar = document.querySelector('.animated-car');

    if (step1 && step2 && btnNext && btnPrev && progressBar) {
        btnNext.addEventListener('click', function () {
            // Simple validation before moving to step 2
            const requiredInputs = step1.querySelectorAll('input[required]');
            let isValid = true;
            requiredInputs.forEach(input => {
                if (!input.checkValidity()) {
                    input.reportValidity();
                    isValid = false;
                }
            });

            if (isValid) {
                step1.classList.remove('active');
                step2.classList.add('active');
                progressBar.style.width = '100%';
                if (animatedCar) animatedCar.style.left = '90%'; // Drive to the end
            }
        });

        btnPrev.addEventListener('click', function () {
            step2.classList.remove('active');
            step1.classList.add('active');
            progressBar.style.width = '50%';
            if (animatedCar) animatedCar.style.left = '50%'; // Reverse back to middle
        });
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (form.dataset.submitting === 'true') return;
        clearPaymentStatus();
        // Collect form data
        const formData = new FormData(form);
        const car_id = formData.get('car_id');
        const userInfo = JSON.parse(getAuthItem('userInfo') || '{}');
        const user_id = userInfo.id || null;
        if (!car_id) {
            alert('Error: Missing car selection. Please go back and select a vehicle to buy.');
            return;
        }
        if (!user_id) {
            alert('Error: User not logged in. Please log in before purchasing.');
            return;
        }
        if (!Number.isFinite(Number(purchaseAmount))) {
            alert('Error: Unable to determine purchase amount. Please refresh and try again.');
            return;
        }
        const data = {
            car_id,
            user_id,
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            address: formData.get('address'),
            city: formData.get('city'),
            zip: formData.get('zip'),
            payment_method: formData.get('payment_method'),
            payment_details: ''
        };
        const parsedOfferId = offerIdParam ? parseInt(offerIdParam, 10) : null;
        if (parsedOfferId && !Number.isNaN(parsedOfferId)) {
            data.offer_id = parsedOfferId;
        }
        const parsedNewsletterOfferId = newsletterOfferIdParam ? parseInt(newsletterOfferIdParam, 10) : null;
        if (parsedNewsletterOfferId && !Number.isNaN(parsedNewsletterOfferId)) {
            data.newsletter_offer_id = parsedNewsletterOfferId;
        }
        data.insurance_addon = !!(insuranceAddonCheckbox && insuranceAddonCheckbox.checked);
        data.warranty_extension = !!(warrantyAddonCheckbox && warrantyAddonCheckbox.checked);
        data.accessory_bundle = !!(accessoryAddonCheckbox && accessoryAddonCheckbox.checked);
        // Collect payment details
        if (data.payment_method === 'credit_card' || data.payment_method === 'debit_card') {
            const ccNumber = String(formData.get('cc_number') || '').replace(/\s+/g, '');
            const last4 = ccNumber.slice(-4);
            data.payment_details = `Card: **** **** **** ${last4 || '0000'}, Expiry: ${formData.get('cc_expiry')}`;
        } else if (data.payment_method === 'paypal') {
            data.payment_details = `PayPal Email: ${formData.get('paypal_email')}`;
        } else if (data.payment_method === 'cod') {
            data.payment_details = 'Cash on Delivery';
        }
        const originalSubmitText = submitBtn ? submitBtn.textContent : '';
        form.dataset.submitting = 'true';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.background = '#94a3b8';
            submitBtn.style.cursor = 'not-allowed';
            submitBtn.textContent = 'Processing...';
        }
        try {
            let paymentId = null;
            const needsMockPayment = data.payment_method !== 'cod';
            if (needsMockPayment) {
                const mockMethod = (data.payment_method === 'credit_card' || data.payment_method === 'debit_card') ? 'card' : data.payment_method;
                setPaymentStatus('Creating payment intent...', 'warn');
                const intentRes = await fetch('/mock-payments/intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id,
                        car_id,
                        amount: purchaseAmount,
                        currency: purchaseCurrency,
                        payment_method: mockMethod,
                        idempotency_key: `purchase-${user_id}-${car_id}-${Date.now()}`
                    })
                });
                const intentData = await intentRes.json();
                if (!intentRes.ok) {
                    throw new Error(intentData.message || 'Failed to create payment intent.');
                }

                paymentId = intentData.payment_id;
                if (intentData.requires_action) {
                    setPaymentStatus('Additional authentication required. Please confirm to proceed.', 'warn');
                    const proceed = window.confirm('3DS verification required. Continue?');
                    const confirmRes = await fetch('/mock-payments/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_id: paymentId, action_passed: !!proceed })
                    });
                    const confirmData = await confirmRes.json();
                    if (!confirmRes.ok || confirmData.status === 'failed') {
                        setPaymentStatus('Payment failed during authentication.', 'error');
                        throw new Error('Payment authentication failed.');
                    }
                }

                setPaymentStatus('Payment processing...', 'warn');
                const start = Date.now();
                const timeoutMs = 20000;
                let paymentSucceeded = false;
                while (Date.now() - start < timeoutMs) {
                    const statusRes = await fetch(`/mock-payments/${paymentId}`);
                    const statusData = await statusRes.json();
                    if (!statusRes.ok) {
                        throw new Error(statusData.message || 'Payment status check failed.');
                    }
                    if (statusData.status === 'succeeded') {
                        setPaymentStatus(`Payment approved. Receipt: ${statusData.receipt_no || 'N/A'}`, 'success');
                        paymentSucceeded = true;
                        break;
                    }
                    if (statusData.status === 'failed' || statusData.status === 'canceled') {
                        setPaymentStatus(`Payment ${statusData.status}: ${statusData.failure_reason || 'Please try again.'}`, 'error');
                        throw new Error('Payment did not complete.');
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                if (!paymentSucceeded) {
                    setPaymentStatus('Payment is still processing. Please try again.', 'error');
                    throw new Error('Payment processing timeout.');
                }
                data.payment_id = paymentId;
            }

            const res = await fetch('/buy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (res.ok && result.message === 'Purchase successful') {
                window.location.href = 'thank-you-buy.html';
                return;
            }
            alert('Error: ' + (result.message || 'Unknown error'));
        } catch (err) {
            alert('Error submitting payment: ' + err.message);
        } finally {
            form.dataset.submitting = 'false';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.background = '';
                submitBtn.style.cursor = '';
                submitBtn.textContent = originalSubmitText || 'Submit Payment';
            }
        }
    });
});

