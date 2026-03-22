// buy.js
// Handles buy form submission for vehicle purchases


document.addEventListener('DOMContentLoaded', async function() {
    const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);
    const clearAuthStorage = () => {
        ['userLoggedIn', 'userInfo', 'user_id', 'rememberMe'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    };
    const membersMsg = document.getElementById('members-only-message');
    const listings = document.querySelector('.vehicle-listings');
    const adminDashboardLink = document.getElementById('buy-admin-dashboard-link');
    const adminLogoutBtn = document.getElementById('buy-admin-logout-btn');
    const loginLink = document.getElementById('buy-login-link');
    const adminNote = document.getElementById('admin-edit-note');

    let userLoggedIn = false;
    let isAdmin = false;

    try {
        const [adminRes, userRes] = await Promise.all([fetch('/admin/session'), fetch('/user/session')]);
        if (adminRes.ok) {
            const adminData = await adminRes.json();
            isAdmin = !!adminData.loggedIn;
        }
        if (userRes.ok) {
            const userData = await userRes.json();
            userLoggedIn = !!userData.loggedIn;
        }
    } catch (e) {
        userLoggedIn = getAuthItem('userLoggedIn') === 'true';
        isAdmin = localStorage.getItem('adminLoggedIn') === 'true';
    }

    if (isAdmin) {
        localStorage.setItem('adminLoggedIn', 'true');
    } else {
        localStorage.removeItem('adminLoggedIn');
    }

    if (adminDashboardLink) adminDashboardLink.style.display = isAdmin ? 'inline-block' : 'none';
    if (adminLogoutBtn) {
        adminLogoutBtn.style.display = isAdmin ? 'inline-block' : 'none';
        adminLogoutBtn.onclick = async function() {
            try {
                await fetch('/admin/logout', { method: 'POST' });
            } catch (e) {
                // ignore network errors here
            }
            localStorage.removeItem('adminLoggedIn');
            window.location.href = '/';
        };
    }
    if (loginLink) loginLink.style.display = isAdmin ? 'none' : 'inline-block';
    if (adminNote) adminNote.style.display = isAdmin ? 'block' : 'none';

    if (!userLoggedIn && !isAdmin) {
        if (membersMsg) membersMsg.style.display = 'flex';
        if (listings) listings.style.minHeight = '220px';

        const notice = document.createElement('div');
        notice.className = 'login-notice';
        notice.innerHTML = '<marquee behavior="scroll" direction="left" scrollamount="8" style="width:100%;"><span style="font-size:1.08rem;font-weight:700;letter-spacing:0.03em;"><a href="user-login.html" style="color:#fff;text-decoration:underline;font-weight:700;">Log in</a> to use the features on this page.</span></marquee>';
        notice.style = 'width:100%;max-width:600px;position:fixed;top:40px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#ff5858 0%,#f09819 100%);color:#fff;padding:7px 0;text-align:center;font-size:1.08rem;font-weight:700;letter-spacing:0.03em;border-radius:8px;z-index:1001;box-shadow:0 1px 8px #f09819;';
        document.body.appendChild(notice);
    }
// --- Require login for buy page, but allow admin ---
    if (userLoggedIn || isAdmin) {
        // Advanced filter dropdowns
        const makeSelect = document.getElementById('filter-make');
        const modelSelect = document.getElementById('filter-model');
        const yearSelect = document.getElementById('filter-year');
        const fuelSelect = document.getElementById('filter-fuel');
        const transSelect = document.getElementById('filter-trans');
        const ownersSelect = document.getElementById('filter-owners');
        const colorInput = document.getElementById('filter-color');
        const regCityInput = document.getElementById('filter-regcity');
        const mileageMin = document.getElementById('filter-mileage-min');
        const mileageMax = document.getElementById('filter-mileage-max');
        // Toggle advanced filters
        const advBtn = document.getElementById('toggle-advanced-filters');
        const advSection = document.getElementById('advanced-filters');
        if (advBtn && advSection) {
            advSection.classList.remove('open');
            advBtn.onclick = function() {
                if (!advSection.classList.contains('open')) {
                    advSection.classList.add('open');
                    advBtn.textContent = 'Hide Advanced';
                    // Scroll to bottom of filter container as it expands
                    setTimeout(() => {
                        const filterContainer = document.getElementById('filter-container');
                        if (filterContainer) {
                            filterContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    }, 350);
                } else {
                    advSection.classList.remove('open');
                    advBtn.textContent = 'Advanced Filters';
                }
            };
        }
        // Profile section logic
        const profileSection = document.getElementById('profile-section');
        const welcomeMessage = document.getElementById('welcome-message');
        const profileUsername = document.getElementById('profile-username');
        const logoutBtn = document.getElementById('logout-btn');
        // Check login status
        const user = JSON.parse(getAuthItem('userInfo') || '{}');
        if (profileSection && welcomeMessage && profileUsername && logoutBtn) {
            if (userLoggedIn && !isAdmin) {
                profileSection.style.display = 'flex';
                welcomeMessage.textContent = 'Welcome to SecondGear,';
                profileUsername.textContent = ' ' + (user.username || user.firstName || user.email || 'User');
                logoutBtn.style.display = 'inline-block';
                logoutBtn.onclick = async function() {
                    try {
                        await fetch('/user/logout', { method: 'POST' });
                    } catch (e) {
                        // ignore
                    }
                    clearAuthStorage();
                    window.location.reload();
                };
            } else {
                profileSection.style.display = 'none';
            }
        }

        let allCars = [];
        let wishlistIds = new Set();
        const compareBar = document.getElementById('compare-bar');
        const compareBarCount = document.getElementById('compare-bar-count');
        const compareBarList = document.getElementById('compare-bar-list');
        const compareGoBtn = document.getElementById('compare-go-btn');
        const compareClearBtn = document.getElementById('compare-clear-btn');
        const COMPARE_KEY = 'compareCars';
        const COMPARE_LIMIT = 3;
        const offerModal = document.getElementById('offer-modal');
        const offerForm = document.getElementById('offer-form');
        const offerModalClose = document.getElementById('offer-modal-close');
        const offerCarIdInput = document.getElementById('offer-car-id');
        const offerListedPriceInput = document.getElementById('offer-listed-price');
        const offerPriceInput = document.getElementById('offer-price-input');
        const offerMessageInput = document.getElementById('offer-message-input');
        const offerSubmitBtn = document.getElementById('offer-submit-btn');
        const offerModalCarLabel = document.getElementById('offer-modal-car-label');

        async function loadWishlistIds() {
            if (!userLoggedIn || isAdmin) return;
            try {
                const res = await fetch('/user/wishlist');
                const data = await res.json();
                if (res.ok && Array.isArray(data)) {
                    wishlistIds = new Set(data.map(item => Number(item.car_id || item.id)).filter(Boolean));
                }
            } catch (err) {
                // ignore wishlist load errors
            }
        }

        function syncWishlistButton(btn, carId) {
            const isSaved = wishlistIds.has(carId);
            btn.classList.toggle('active', isSaved);
            btn.textContent = '♥';
        }

        function closeOfferModal() {
            if (!offerModal) return;
            offerModal.style.display = 'none';
            if (offerForm) offerForm.reset();
        }

        function openOfferModal(car) {
            if (!offerModal || !offerForm || !offerCarIdInput || !offerListedPriceInput || !offerPriceInput) return;
            offerCarIdInput.value = String(car.id);
            offerListedPriceInput.value = `₹${Number(car.price || 0).toLocaleString('en-IN')}`;
            offerPriceInput.value = '';
            if (offerMessageInput) offerMessageInput.value = '';
            if (offerModalCarLabel) offerModalCarLabel.textContent = `${car.make} ${car.model} (${car.year})`;
            offerModal.style.display = 'flex';
            setTimeout(() => offerPriceInput.focus(), 0);
        }

        if (offerModalClose) {
            offerModalClose.addEventListener('click', closeOfferModal);
        }
        if (offerModal) {
            offerModal.addEventListener('click', function(e) {
                if (e.target === offerModal) closeOfferModal();
            });
        }
        if (offerForm) {
            offerForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                if (!userLoggedIn || isAdmin) {
                    alert('Please log in as a user to submit an offer.');
                    return;
                }
                const carId = parseInt(offerCarIdInput.value, 10);
                const offeredPrice = parseFloat(offerPriceInput.value);
                if (!carId || Number.isNaN(offeredPrice) || offeredPrice <= 0) {
                    alert('Please enter a valid offer price.');
                    return;
                }

                const originalLabel = offerSubmitBtn ? offerSubmitBtn.textContent : 'Submit Offer';
                if (offerSubmitBtn) {
                    offerSubmitBtn.disabled = true;
                    offerSubmitBtn.textContent = 'Submitting...';
                }
                try {
                    const res = await fetch('/user/car-offers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            car_id: carId,
                            offered_price: offeredPrice,
                            message: offerMessageInput ? offerMessageInput.value.trim() : ''
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.message || 'Failed to submit offer.');
                    }
                    alert(data.message || 'Offer submitted.');
                    closeOfferModal();
                } catch (err) {
                    alert(err.message || 'Failed to submit offer.');
                } finally {
                    if (offerSubmitBtn) {
                        offerSubmitBtn.disabled = false;
                        offerSubmitBtn.textContent = originalLabel;
                    }
                }
            });
        }

        // Helper: unique values
        function unique(arr) { return [...new Set(arr.filter(Boolean))]; }
        const vehicleList = document.getElementById('vehicle-list');

        function renderCars(cars) {
            vehicleList.innerHTML = '';
            vehicleList.classList.add('vehicle-list-grid');
            if (!cars.length) {
                // Determine which filter is most likely responsible
                let msg = 'No cars found.';
                const min = parseInt(document.getElementById('price-min').value, 10) || 0;
                const max = parseInt(document.getElementById('price-max').value, 10) || Number.MAX_SAFE_INTEGER;
                const make = makeSelect && makeSelect.value;
                const model = modelSelect && modelSelect.value;
                const year = yearSelect && yearSelect.value;
                const color = colorInput && colorInput.value;
                const fuel = fuelSelect && fuelSelect.value;
                const trans = transSelect && transSelect.value;
                const owners = ownersSelect && ownersSelect.value;
                const regcity = regCityInput && regCityInput.value;
                const milmin = mileageMin && mileageMin.value;
                const milmax = mileageMax && mileageMax.value;
                if (make) msg = `No cars found for make: ${make}`;
                else if (model) msg = `No cars found for model: ${model}`;
                else if (year) msg = `No cars found for year: ${year}`;
                else if (color) msg = `No cars found for color: ${color}`;
                else if (fuel) msg = `No cars found for fuel: ${fuel}`;
                else if (trans) msg = `No cars found for transmission: ${trans}`;
                else if (owners) msg = `No cars found for owners: ${owners}`;
                else if (regcity) msg = `No cars found for registration city: ${regcity}`;
                else if (milmin && milmax) msg = `No cars found for mileage between ${milmin} and ${milmax} km`;
                else if (milmin) msg = `No cars found for mileage >= ${milmin} km`;
                else if (milmax) msg = `No cars found for mileage <= ${milmax} km`;
                else if (min > 0 || max < Number.MAX_SAFE_INTEGER) msg = `No cars found for selected price range.`;
                vehicleList.innerHTML = `<p class="error">${msg}</p>`;
                return;
            }
            // Check if admin is logged in
            const isAdminMode = isAdmin;
            // Sort cars by id ascending
            cars.sort((a, b) => a.id - b.id);
            // Create a fragment for better performance
            const fragment = document.createDocumentFragment();
            const PLACEHOLDER_IMG = 'images/cars/about.jpg';
            // Populate filter dropdowns (once)
            if (makeSelect && modelSelect && yearSelect && allCars.length) {
                // Makes
                makeSelect.innerHTML = '<option value="">Any</option>' + unique(allCars.map(c=>c.make)).map(m=>`<option>${m}</option>`).join('');
                // Models (filtered by make)
                let models = allCars.map(c=>c.model);
                if (makeSelect.value) models = allCars.filter(c=>c.make===makeSelect.value).map(c=>c.model);
                modelSelect.innerHTML = '<option value="">Any</option>' + unique(models).map(m=>`<option>${m}</option>`).join('');
                // Years
                yearSelect.innerHTML = '<option value="">Any</option>' + unique(allCars.map(c=>c.year)).sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');
            }
            cars.forEach(car => {
                const card = document.createElement('div');
                card.className = 'car-card';
                const hasSeller = !!(car.seller_user_id || (car.seller_email && String(car.seller_email).trim()));
                const isVerifiedSeller = !!car.seller_is_verified;
                const listingLabel = hasSeller ? 'User Listing' : 'SecondGear Direct';
                const listingClass = hasSeller ? 'user' : 'direct';
                const listingTitle = hasSeller
                    ? 'Listed by a SecondGear user'
                    : 'Sold directly by SecondGear';
                const listingBadgeHtml = `<span class="listing-badge ${listingClass}" title="${listingTitle}">${listingLabel}</span>`;
                const verifiedBadgeHtml = hasSeller && isVerifiedSeller
                    ? '<span class="verified-seller-badge" title="Verified Seller">Verified Seller</span>'
                    : '';
                // Determine correct image URL (support both image_url and image)
                let imgUrl = '';
                let imageVal = car.image_url || car.image;
                if (imageVal) {
                    if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) {
                        imgUrl = imageVal;
                    } else {
                        if (imageVal.startsWith('/')) imageVal = imageVal.substring(1);
                        if (imageVal.startsWith('images/cars/')) {
                            imgUrl = imageVal;
                        } else {
                            imgUrl = 'images/cars/' + imageVal;
                        }
                    }
                } else {
                    imgUrl = PLACEHOLDER_IMG;
                }
                const isDeleted = !!car.is_deleted;
                let priceSection = `<p class="car-price">₹${car.price.toLocaleString('en-IN')}</p>`;
                if (isAdminMode) {
                    priceSection = `
                        <form class="edit-price-form" data-car-id="${car.id}" style="margin-bottom:8px;">
                            <label for="edit-price-${car.id}" style="font-size:0.9em;">Price: ₹</label>
                            <input type="number" id="edit-price-${car.id}" value="${car.price}" min="0" style="width:90px;">
                            <button type="submit" style="font-size:0.9em;">Update</button>
                        </form>
                        <p class="car-price" id="car-price-${car.id}">₹${car.price.toLocaleString('en-IN')}</p>
                        ${isDeleted ? '<span class="car-status-badge">Soft Deleted</span>' : ''}
                    `;
                }
                  const offerButtonHtml = (!isAdminMode && car.available) ? `<button class="offer-btn" type="button">Make Offer</button>` : '';
                  const compareButtonHtml = `<button class="compare-btn" type="button" data-compare-id="${car.id}">Compare</button>`;
                  const wishlistHeartHtml = (!isAdminMode && userLoggedIn)
                      ? `<button class="wishlist-heart ${wishlistIds.has(car.id) ? 'active' : ''}" type="button" data-wishlist-id="${car.id}" aria-label="Save to wishlist" title="${wishlistIds.has(car.id) ? 'Saved' : 'Save'}">♥</button>`
                      : '';
                const adminManageHtml = isAdminMode ? `
                    <div class="admin-car-actions">
                        <button class="admin-delete-btn" type="button" data-car-id="${car.id}" ${isDeleted ? 'disabled' : ''}>${isDeleted ? 'Deleted' : 'Soft Delete'}</button>
                        <button class="admin-restore-btn" type="button" data-car-id="${car.id}" ${isDeleted ? '' : 'disabled'}>Restore</button>
                    </div>
                ` : '';
                card.innerHTML = `
                      <div class="car-image-container">
                          ${wishlistHeartHtml}
                          <a href="${imgUrl}" target="_blank">
                              <img src="${imgUrl}" alt="${car.make} ${car.model}" class="car-image" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}';">
                          </a>
                      </div>
                    <div class="car-details">
                        <h2>${car.make} ${car.model} (${car.year})</h2>
                        ${listingBadgeHtml}
                        ${verifiedBadgeHtml}
                        <p class="car-desc">${car.description || ''}</p>
                        ${priceSection}
                          <div class="car-action-row">
                              <button class="buy-btn" ${car.available ? '' : 'disabled'}>${car.available ? 'Buy Now' : 'Sold Out'}</button>
                              ${offerButtonHtml}
                              ${compareButtonHtml}
                          </div>
                        ${adminManageHtml}
                    </div>
                `;
                // Add interactive buy button
                const buyBtn = card.querySelector('.buy-btn');
                if (car.available) {
                    buyBtn.addEventListener('click', function() {
                        if (isAdminMode) {
                            alert('You should be logged in as a user to buy a car.');
                            return;
                        }
                        // Redirect to car details page with car id as query param
                        buyBtn.disabled = true;
                        buyBtn.textContent = 'Opening...';
                        window.location.href = `car-details.html?id=${encodeURIComponent(car.id)}`;
                    });
                }
                const offerBtn = card.querySelector('.offer-btn');
                if (offerBtn) {
                    offerBtn.addEventListener('click', function() {
                        openOfferModal(car);
                    });
                }

                  const compareBtn = card.querySelector('.compare-btn');
                  if (compareBtn) {
                      compareBtn.addEventListener('click', function() {
                          toggleCompare(car);
                      });
                      syncCompareButton(compareBtn, car.id);
                  }

                  const wishlistBtn = card.querySelector('.wishlist-heart');
                  if (wishlistBtn) {
                      if (!car.available) {
                          wishlistBtn.disabled = true;
                      }
                      wishlistBtn.addEventListener('click', async function() {
                          if (!userLoggedIn || isAdmin) {
                              alert('Please log in as a user to save cars.');
                              return;
                          }
                          const originalText = wishlistBtn.textContent;
                          wishlistBtn.disabled = true;
                          try {
                              const isSaved = wishlistIds.has(car.id);
                              if (isSaved) {
                                  const res = await fetch(`/user/wishlist/${car.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.message || 'Failed to remove from wishlist.');
                                  wishlistIds.delete(car.id);
                              } else {
                                  const res = await fetch('/user/wishlist', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ car_id: car.id })
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.message || 'Failed to add to wishlist.');
                                  wishlistIds.add(car.id);
                              }
                              syncWishlistButton(wishlistBtn, car.id);
                              wishlistBtn.title = wishlistIds.has(car.id) ? 'Saved' : 'Save';
                          } catch (err) {
                              alert(err.message || 'Wishlist update failed.');
                              wishlistBtn.textContent = originalText;
                          } finally {
                              wishlistBtn.disabled = !car.available ? true : false;
                          }
                      });
                  }
                // Admin price update logic
                if (isAdminMode) {
                    const form = card.querySelector('.edit-price-form');
                    if (form) {
                        form.addEventListener('submit', async function(e) {
                            e.preventDefault();
                            const newPrice = parseInt(document.getElementById(`edit-price-${car.id}`).value, 10);
                            if (isNaN(newPrice) || newPrice < 0) {
                                alert('Please enter a valid price.');
                                return;
                            }
                            // Call backend to update price
                            try {
                                const res = await fetch(`/admin/car/${car.id}/price`, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ price: newPrice })
                                });
                                if (!res.ok) {
                                    const data = await res.json();
                                    throw new Error(data.message || 'Failed to update price');
                                }
                                car.price = newPrice;
                                document.getElementById(`car-price-${car.id}`).textContent = `₹${newPrice.toLocaleString('en-IN')}`;
                                alert('Price updated!');
                            } catch (err) {
                                alert('Error updating price: ' + err.message);
                            }
                        });
                    }
                }
                if (isAdminMode) {
                    const deleteBtn = card.querySelector('.admin-delete-btn');
                    const restoreBtn = card.querySelector('.admin-restore-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', async function() {
                            const id = this.getAttribute('data-car-id');
                            if (!id) return;
                            if (!confirm('Soft delete this listing? It will be hidden from users.')) return;
                            try {
                                const res = await fetch(`/admin/delete-car?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
                                if (!res.ok) {
                                    const data = await res.json();
                                    throw new Error(data.error || data.message || 'Failed to delete');
                                }
                                car.is_deleted = 1;
                                car.available = 0;
                                renderCars(allCars);
                                updateCompareBar();
                                syncAllCompareButtons();
                            } catch (err) {
                                alert(err.message || 'Failed to delete listing.');
                            }
                        });
                    }
                    if (restoreBtn) {
                        restoreBtn.addEventListener('click', async function() {
                            const id = this.getAttribute('data-car-id');
                            if (!id) return;
                            try {
                                const res = await fetch('/admin/restore-car', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id })
                                });
                                if (!res.ok) {
                                    const data = await res.json();
                                    throw new Error(data.error || data.message || 'Failed to restore');
                                }
                                car.is_deleted = 0;
                                car.available = 1;
                                renderCars(allCars);
                                updateCompareBar();
                                syncAllCompareButtons();
                            } catch (err) {
                                alert(err.message || 'Failed to restore listing.');
                            }
                        });
                    }
                }
                fragment.appendChild(card);
            });
            vehicleList.appendChild(fragment);
        }

        function getCompareList() {
            try {
                const raw = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
                if (Array.isArray(raw)) return raw.map(id => parseInt(id, 10)).filter(Boolean);
            } catch (e) {}
            return [];
        }

        function setCompareList(list) {
            const uniqueList = [...new Set(list)].slice(0, COMPARE_LIMIT);
            localStorage.setItem(COMPARE_KEY, JSON.stringify(uniqueList));
            return uniqueList;
        }

        function toggleCompare(car) {
            let list = getCompareList();
            if (list.includes(car.id)) {
                list = list.filter(id => id !== car.id);
            } else {
                if (list.length >= COMPARE_LIMIT) {
                    alert(`You can compare up to ${COMPARE_LIMIT} cars.`);
                    return;
                }
                list.push(car.id);
            }
            setCompareList(list);
            updateCompareBar();
            syncAllCompareButtons();
        }

        function syncCompareButton(btn, carId) {
            const list = getCompareList();
            const active = list.includes(carId);
            btn.classList.toggle('active', active);
            btn.textContent = active ? 'Selected' : 'Compare';
        }

        function syncAllCompareButtons() {
            document.querySelectorAll('.compare-btn').forEach(btn => {
                const id = parseInt(btn.getAttribute('data-compare-id'), 10);
                if (id) syncCompareButton(btn, id);
            });
        }

        function updateCompareBar() {
            if (!compareBar || !compareBarCount || !compareBarList || !compareGoBtn) return;
            const list = getCompareList();
            compareBarList.innerHTML = '';
            if (!list.length) {
                compareBar.classList.remove('show');
                compareGoBtn.setAttribute('aria-disabled', 'true');
                compareGoBtn.href = 'compare.html';
                return;
            }
            compareBar.classList.add('show');
            compareBarCount.textContent = `${list.length} of ${COMPARE_LIMIT} selected`;
            list.forEach(id => {
                const car = allCars.find(c => c.id === id);
                const label = car ? `${car.make} ${car.model}` : `Car #${id}`;
                const chip = document.createElement('span');
                chip.className = 'compare-chip';
                chip.innerHTML = `<span>${label}</span><button type="button" data-remove-id="${id}" aria-label="Remove">×</button>`;
                compareBarList.appendChild(chip);
            });
            compareBarList.querySelectorAll('button[data-remove-id]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.getAttribute('data-remove-id'), 10);
                    const list = getCompareList().filter(cid => cid !== id);
                    setCompareList(list);
                    updateCompareBar();
                    syncAllCompareButtons();
                });
            });
            compareGoBtn.setAttribute('aria-disabled', list.length < 2 ? 'true' : 'false');
            compareGoBtn.href = `compare.html?ids=${list.join(',')}`;
        }

        // Fetch cars from backend
        (async function fetchCars() {
            try {
                await loadWishlistIds();
                const res = await fetch('/cars');
                allCars = await res.json();
                // Ensure cars that are not available (sold) are shown as 'Sold Out'
                allCars.forEach(car => {
                    if (car.available === false || car.available === 'false' || car.sold === true) {
                        car.available = false;
                    }
                });
                renderCars(allCars);
                updateCompareBar();
                syncAllCompareButtons();
                // Populate filters after data load
                if (makeSelect && modelSelect && yearSelect && allCars.length) {
                    makeSelect.innerHTML = '<option value="">Any</option>' + unique(allCars.map(c=>c.make)).map(m=>`<option>${m}</option>`).join('');
                    yearSelect.innerHTML = '<option value="">Any</option>' + unique(allCars.map(c=>c.year)).sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');
                }
            } catch (err) {
                vehicleList.innerHTML = '<p class="error">Failed to load cars.</p>';
            }
        })();
        // Update models when make changes
        if (makeSelect && modelSelect) {
            makeSelect.addEventListener('change', function() {
                let models = allCars.map(c=>c.model);
                if (makeSelect.value) models = allCars.filter(c=>c.make===makeSelect.value).map(c=>c.model);
                modelSelect.innerHTML = '<option value="">Any</option>' + unique(models).map(m=>`<option>${m}</option>`).join('');
            });
        }

        // Price filter logic
        document.getElementById('apply-price-filter').addEventListener('click', function() {
            const min = parseInt(document.getElementById('price-min').value, 10) || 0;
            const max = parseInt(document.getElementById('price-max').value, 10) || Number.MAX_SAFE_INTEGER;
            let filtered = allCars.filter(car => car.price >= min && car.price <= max);
            // Advanced filters
            if (makeSelect && makeSelect.value) filtered = filtered.filter(car => car.make === makeSelect.value);
            if (modelSelect && modelSelect.value) filtered = filtered.filter(car => car.model === modelSelect.value);
            if (yearSelect && yearSelect.value) filtered = filtered.filter(car => String(car.year) === yearSelect.value);
            if (colorInput && colorInput.value) filtered = filtered.filter(car => car.color && car.color.toLowerCase().includes(colorInput.value.toLowerCase()));
            if (fuelSelect && fuelSelect.value) filtered = filtered.filter(car => car.fuel_type && car.fuel_type.toLowerCase() === fuelSelect.value.toLowerCase());
            if (transSelect && transSelect.value) filtered = filtered.filter(car => car.transmission && car.transmission.toLowerCase() === transSelect.value.toLowerCase());
            if (ownersSelect && ownersSelect.value) {
                if (ownersSelect.value === '4+') filtered = filtered.filter(car => car.num_owners && car.num_owners >= 4);
                else filtered = filtered.filter(car => String(car.num_owners) === ownersSelect.value);
            }
            if (regCityInput && regCityInput.value) filtered = filtered.filter(car => car.registration_city && car.registration_city.toLowerCase().includes(regCityInput.value.toLowerCase()));
            if (mileageMin && mileageMin.value) filtered = filtered.filter(car => car.mileage && car.mileage >= parseInt(mileageMin.value, 10));
            if (mileageMax && mileageMax.value) filtered = filtered.filter(car => car.mileage && car.mileage <= parseInt(mileageMax.value, 10));
            renderCars(filtered);
        });

        // Also filter immediately when min price changes
        document.getElementById('price-min').addEventListener('change', function() {
            const min = parseInt(this.value, 10) || 0;
            const max = parseInt(document.getElementById('price-max').value, 10) || Number.MAX_SAFE_INTEGER;
            let filtered = allCars.filter(car => car.price >= min && car.price <= max);
            // Advanced filters (same as above)
            if (makeSelect && makeSelect.value) filtered = filtered.filter(car => car.make === makeSelect.value);
            if (modelSelect && modelSelect.value) filtered = filtered.filter(car => car.model === modelSelect.value);
            if (yearSelect && yearSelect.value) filtered = filtered.filter(car => String(car.year) === yearSelect.value);
            if (colorInput && colorInput.value) filtered = filtered.filter(car => car.color && car.color.toLowerCase().includes(colorInput.value.toLowerCase()));
            if (fuelSelect && fuelSelect.value) filtered = filtered.filter(car => car.fuel_type && car.fuel_type.toLowerCase() === fuelSelect.value.toLowerCase());
            if (transSelect && transSelect.value) filtered = filtered.filter(car => car.transmission && car.transmission.toLowerCase() === transSelect.value.toLowerCase());
            if (ownersSelect && ownersSelect.value) {
                if (ownersSelect.value === '4+') filtered = filtered.filter(car => car.num_owners && car.num_owners >= 4);
                else filtered = filtered.filter(car => String(car.num_owners) === ownersSelect.value);
            }
            if (regCityInput && regCityInput.value) filtered = filtered.filter(car => car.registration_city && car.registration_city.toLowerCase().includes(regCityInput.value.toLowerCase()));
            if (mileageMin && mileageMin.value) filtered = filtered.filter(car => car.mileage && car.mileage >= parseInt(mileageMin.value, 10));
            if (mileageMax && mileageMax.value) filtered = filtered.filter(car => car.mileage && car.mileage <= parseInt(mileageMax.value, 10));
            renderCars(filtered);
        });

        if (compareClearBtn) {
            compareClearBtn.addEventListener('click', function() {
                setCompareList([]);
                updateCompareBar();
                syncAllCompareButtons();
            });
        }
    }
});




