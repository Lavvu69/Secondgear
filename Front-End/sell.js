document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('sellForm');
    const estimateSection = document.getElementById('estimateSection');
    const estimateText = document.getElementById('estimateText');
    const progressBar = document.getElementById('progressBar');
    const progressBarContainer = document.getElementById('progressBarContainer');
    let isUserLoggedIn = false;
    const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);

    function setSellFormLocked(locked) {
        if (!form) return;
        form.querySelectorAll('input, select, textarea, button').forEach((el) => {
            el.disabled = locked;
        });
    }

    function showLoginNotice() {
        const notice = document.createElement('div');
        notice.className = 'login-notice';
        notice.innerHTML = '<marquee behavior="scroll" direction="left" scrollamount="8" style="width:100%;"><span style="font-size:1.08rem;font-weight:700;letter-spacing:0.03em;"><span style="margin-right:8px;">LOCKED</span> <a href="/user" style="color:#fff;text-decoration:underline;font-weight:700;">Log in</a> to use the features on this page.</span></marquee>';
        notice.style = 'width:100%;max-width:600px;position:relative;margin:40px auto 30px auto;background:linear-gradient(90deg,#ff5858 0%,#f09819 100%);color:#fff;padding:7px 0;text-align:center;font-size:1.08rem;font-weight:700;letter-spacing:0.03em;border-radius:8px;z-index:1001;box-shadow:0 1px 8px #f09819;';
        const main = document.querySelector('main');
        if (main && main.parentNode) {
            main.parentNode.insertBefore(notice, main);
        } else {
            document.body.insertBefore(notice, document.body.firstChild);
        }
    }

    async function initSellAccess() {
        try {
            const res = await fetch('/user/session');
            if (res.ok) {
                const data = await res.json();
                isUserLoggedIn = !!data.loggedIn;
            } else {
                isUserLoggedIn = getAuthItem('userLoggedIn') === 'true';
            }
        } catch (e) {
            isUserLoggedIn = getAuthItem('userLoggedIn') === 'true';
        }

        setSellFormLocked(!isUserLoggedIn);
        if (!isUserLoggedIn) showLoginNotice();
    }

    // Lock form by default until session check is done.
    setSellFormLocked(true);

    // Auto-fill email if user info is available
    const emailInput = document.getElementById('email');
    const userInfoStr = getAuthItem('userInfo');
    if (emailInput && userInfoStr) {
        try {
            const userInfo = JSON.parse(userInfoStr);
            if (userInfo.email) {
                emailInput.value = userInfo.email;
            }
        } catch (e) {}
    }

    // Car model to valid year mapping (add more as needed)
    const modelYearMap = {
        'Kia Seltos': { start: 2019, end: new Date().getFullYear() },
        'Maruti Suzuki Alto': { start: 2000, end: new Date().getFullYear() },
        'MG Hector': { start: 2019, end: new Date().getFullYear() }
    };

    // Year input logic: set min/max based on model
    const yearInput = document.getElementById('year');
    const modelSelect = document.getElementById('model');
    modelSelect.addEventListener('change', function() {
        const selectedModel = modelSelect.value;
        if (modelYearMap[selectedModel]) {
            yearInput.min = modelYearMap[selectedModel].start;
            yearInput.max = modelYearMap[selectedModel].end;
            yearInput.placeholder = `e.g. ${modelYearMap[selectedModel].start}`;
            yearInput.value = '';
        } else {
            yearInput.min = 1900;
            yearInput.max = new Date().getFullYear();
            yearInput.placeholder = 'e.g. 2019';
            yearInput.value = '';
        }
    });

    // Animate form in
    form.style.opacity = 0;
    setTimeout(() => { form.style.transition = 'opacity 0.7s'; form.style.opacity = 1; }, 100);

    // Insurance validity min date + no insurance toggle
    const noInsCheckbox = document.getElementById('no_insurance');
    const insuranceDate = document.getElementById('insurance_validity');
    if (insuranceDate) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        insuranceDate.setAttribute('min', `${yyyy}-${mm}-${dd}`);
    }
    if (noInsCheckbox && insuranceDate) {
        noInsCheckbox.addEventListener('change', function() {
            if (noInsCheckbox.checked) {
                insuranceDate.value = '';
                insuranceDate.disabled = true;
                insuranceDate.removeAttribute('required');
            } else {
                insuranceDate.disabled = false;
                insuranceDate.setAttribute('required', 'required');
            }
        });
    }

    // Progress bar logic
    function setProgress(percent) {
        progressBarContainer.style.display = 'block';
        progressBar.style.width = percent + '%';
    }

    // Animate progress as user fills form
    const fields = Array.from(form.querySelectorAll('input,select,textarea')).filter((field) => {
        return field.type !== 'checkbox';
    });
    fields.forEach(field => {
        field.addEventListener('input', () => {
            let filled = fields.filter(f => f.value && f.value !== '').length;
            setProgress(Math.round((filled / fields.length) * 100));
        });
    });

    form.addEventListener('submit', function(e) {
        if (!isUserLoggedIn) {
            window.location.href = '/user';
            return;
        }

        e.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        setProgress(100);

        // Get values
        const email = form.email.value;
        const model = form.model.value;
        const type = form.type.value;
        const make = form.make.value;
        const year = parseInt(form.year.value, 10);
        const km = parseInt(form.km.value, 10);
        const condition = form.condition.value;
        const color = form.color.value;
        const fuelType = form.fuel_type.value;
        const mileage = parseInt(form.mileage.value, 10);
        const numOwners = parseInt(form.num_owners.value, 10);
        const registrationCity = form.registration_city.value;
        const registrationNumber = form.registration_number.value;
        const transmission = form.transmission.value;
        const vin = form.vin.value;
        const insuranceValidity = noInsCheckbox && noInsCheckbox.checked ? 'No Insurance' : (form.insurance_validity.value || '');
        const description = form.description.value;
        const imageFile = form.image.files[0];

        if (!insuranceValidity) {
            alert('Please select insurance validity or choose "No Insurance".');
            form.insurance_validity.focus();
            return;
        }

        // Validate year for selected model
        if (modelYearMap[model]) {
            const { start, end } = modelYearMap[model];
            if (isNaN(year) || year < start || year > end) {
                alert(`Please enter a valid year for ${model} (${start} - ${end})`);
                form.year.focus();
                return;
            }
        }

        // --- Enhanced car price estimation (INR) ---
        const currentYear = new Date().getFullYear();
        const carAge = Math.max(0, currentYear - year);

        const premiumBrands = ["BMW", "Mercedes-Benz", "Audi", "Lexus", "Jaguar", "Land Rover", "Porsche", "Volvo"];
        const upperBrands = ["Toyota", "Honda", "Hyundai", "Kia", "Mahindra", "Skoda", "Volkswagen", "MG", "Jeep"];
        const valueBrands = ["Maruti Suzuki", "Tata", "Renault", "Nissan", "Datsun"];

        let segmentBase = 650000;
        if (type === 'SUV') segmentBase = 900000;
        else if (type === 'Sedan') segmentBase = 700000;
        else if (type === 'Hatchback') segmentBase = 500000;
        else if (type === 'Coupe' || type === 'Convertible') segmentBase = 1200000;

        let brandMultiplier = 1.0;
        if (premiumBrands.includes(make)) brandMultiplier = 1.35;
        else if (upperBrands.includes(make)) brandMultiplier = 1.15;
        else if (valueBrands.includes(make)) brandMultiplier = 0.95;

        let basePrice = segmentBase * brandMultiplier;

        // Age depreciation (approx 12% per year, floor at 15% of base)
        const ageFactor = Math.max(0.15, Math.pow(0.88, carAge));
        basePrice *= ageFactor;

        // KM adjustment vs expected usage (12k/year)
        const expectedKm = Math.max(12000, carAge * 12000);
        const kmRatio = km / expectedKm;
        if (kmRatio > 2.0) basePrice *= 0.80;
        else if (kmRatio > 1.4) basePrice *= 0.90;
        else if (kmRatio < 0.7) basePrice *= 1.05;

        // Condition adjustment
        if (condition === 'Excellent') basePrice *= 1.08;
        else if (condition === 'Good') basePrice *= 1.04;
        else if (condition === 'Poor') basePrice *= 0.88;

        // Owners adjustment
        if (numOwners === 2) basePrice *= 0.96;
        else if (numOwners === 3) basePrice *= 0.93;
        else if (numOwners >= 4) basePrice *= 0.90;

        // Fuel type adjustment
        if (fuelType === 'Electric') basePrice *= 1.08;
        else if (fuelType === 'Hybrid') basePrice *= 1.05;
        else if (fuelType === 'Diesel') basePrice *= 1.03;
        else if (fuelType === 'CNG') basePrice *= 0.96;
        else if (fuelType === 'LPG') basePrice *= 0.94;

        // Transmission adjustment
        if (transmission === 'Automatic') basePrice *= 1.04;

        // Mileage adjustment
        if (mileage >= 20) basePrice *= 1.03;
        else if (mileage > 0 && mileage < 12) basePrice *= 0.96;

        // Insurance adjustment
        if (insuranceValidity === 'No Insurance') basePrice *= 0.97;

        // Clamp and round
        if (basePrice < 50000) basePrice = 50000;
        basePrice = Math.round(basePrice / 1000) * 1000;

        // Show user info in estimate section
        let imagePreview = '';
        if (imageFile) {
            const imgURL = URL.createObjectURL(imageFile);
            imagePreview = `<img src="${imgURL}" alt="Car Image" style="max-width:120px;max-height:80px;margin:8px 0;border-radius:8px;box-shadow:0 1px 4px #bbb;">`;
        }
        estimateSection.innerHTML = `
            <h2>Review Your Details</h2>
            <div id="estimateDetails">
                <div><strong>Make:</strong> ${make}</div>
                <div><strong>Model:</strong> ${model}</div>
                <div><strong>Type:</strong> ${type}</div>
                <div><strong>Year:</strong> ${year}</div>
                <div><strong>KM Driven:</strong> ${km}</div>
                <div><strong>Condition:</strong> ${condition}</div>
                <div><strong>Color:</strong> ${color}</div>
                <div><strong>Fuel Type:</strong> ${fuelType}</div>
                <div><strong>Mileage (km/l):</strong> ${mileage}</div>
                <div><strong>Owners:</strong> ${numOwners}</div>
                <div><strong>Registration City:</strong> ${registrationCity}</div>
                <div><strong>Registration Number:</strong> ${registrationNumber}</div>
                <div><strong>Transmission:</strong> ${transmission}</div>
                <div><strong>VIN:</strong> ${vin}</div>
                <div><strong>Insurance:</strong> ${insuranceValidity}</div>
                <div><strong>Description:</strong> ${description}</div>
                <div><strong>Image:</strong><br>${imagePreview}</div>
            </div>
            <div id="estimateText">Estimated Price: ₹${basePrice.toLocaleString('en-IN')}</div>
            <p class="estimate-note">This is only an estimate. Admin will review and send you a final offer.</p>
            <div style="text-align:center;">
                <button id="submitRequestBtn" type="button">Submit Request</button>
                <button id="editRequestBtn" type="button" class="secondary-btn">Edit Details</button>
            </div>
        `;
        estimateSection.style.display = 'block';
        form.style.display = 'none';
        setTimeout(() => { progressBarContainer.style.display = 'none'; }, 600);

        document.getElementById('submitRequestBtn').addEventListener('click', function() {
            const emailVal = document.getElementById('email') ? document.getElementById('email').value : '';
            const estimate = document.getElementById('estimateText').textContent || '';
            const formData = new FormData();
            formData.append('email', emailVal);
            formData.append('make', make);
            formData.append('model', model);
            formData.append('year', year);
            formData.append('km_driven', km);
            formData.append('type', type);
            formData.append('estimated_price', estimate.replace(/[^\d]/g, ''));
            formData.append('color', color);
            formData.append('fuel_type', fuelType);
            formData.append('mileage', mileage);
            formData.append('num_owners', numOwners);
            formData.append('registration_city', registrationCity);
            formData.append('registration_number', registrationNumber);
            formData.append('transmission', transmission);
            formData.append('vin', vin);
            formData.append('insurance_validity', insuranceValidity);
            formData.append('description', description);
            if (form.image.files[0]) {
                formData.append('image', form.image.files[0]);
            }
            fetch('/sell-request', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Your request has been submitted! You will receive a message when admin responds.');
                    window.location.href = 'my-listings.html';
                } else {
                    alert(data.message || 'Failed to submit request.');
                }
            })
            .catch(() => alert('Failed to submit request.'));
        });

        document.getElementById('editRequestBtn').addEventListener('click', function() {
            estimateSection.style.display = 'none';
            form.style.display = 'block';
            progressBarContainer.style.display = 'block';
        });
    });

    initSellAccess();
});
