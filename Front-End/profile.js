// profile.js - My Profile page logic

document.addEventListener('DOMContentLoaded', function() {
    let holidayTimestamps = [];
    const notificationsList = document.getElementById('notificationsList');
    const notificationsUnreadCount = document.getElementById('notificationsUnreadCount');
    const markAllNotificationsRead = document.getElementById('markAllNotificationsRead');
    const tabOverview = document.getElementById('tab-overview');
    const tabMessages = document.getElementById('tab-messages');
    const tabOffers = document.getElementById('tab-offers');
    const tabWishlist = document.getElementById('tab-wishlist');
    const tabQueries = document.getElementById('tab-queries');
    const tabListings = document.getElementById('tab-listings');
    const viewPrev = document.getElementById('view-prev');
    const viewNext = document.getElementById('view-next');
    const profileSliderTrack = document.getElementById('profile-slider-track');
    const profileSliderShell = document.querySelector('.profile-slider-shell');
    const messagesTabBadge = document.getElementById('messagesTabBadge');
    const verifiedSellerStatus = document.getElementById('verifiedSellerStatus');
    const verificationForm = document.getElementById('verificationForm');
    const verificationMsg = document.getElementById('verificationMsg');
    const verificationSubmitBtn = document.getElementById('verificationSubmitBtn');
    const verificationFullName = document.getElementById('verificationFullName');
    const verificationIdDoc = document.getElementById('verificationIdDoc');
    const verificationSelfie = document.getElementById('verificationSelfie');
    const verificationAddressDoc = document.getElementById('verificationAddressDoc');
    const profileVerifiedBadge = document.getElementById('profileVerifiedBadge');
    const verificationToggleBtn = document.getElementById('verificationToggleBtn');
    const verificationFormWrap = document.getElementById('verificationFormWrap');
    const wishlistList = document.getElementById('wishlistList');
    const wishlistMessage = document.getElementById('wishlistMessage');
    const purchasesList = document.getElementById('purchasesList');
    const purchasesById = new Map();
    const complaintModal = document.getElementById('complaintModal');
    const complaintClose = document.getElementById('complaintClose');
    const complaintForm = document.getElementById('complaintForm');
    const complaintPurchaseId = document.getElementById('complaintPurchaseId');
    const complaintSubject = document.getElementById('complaintSubject');
    const complaintMessage = document.getElementById('complaintMessage');
    const complaintFormMsg = document.getElementById('complaintFormMsg');
    const complaintStatus = document.getElementById('complaintStatus');
    const complaintAdminWrap = document.getElementById('complaintAdminWrap');
    const complaintAdminResponse = document.getElementById('complaintAdminResponse');
    const complaintSubmitBtn = document.getElementById('complaintSubmitBtn');
    const complaintCarSummary = document.getElementById('complaintCarSummary');
    let notificationsPollInterval = null;
    const sliderViews = ['overview', 'messages', 'offers', 'wishlist', 'queries', 'listings'];
    let currentView = 'overview';

    // Fetch holidays for date picker validation
    fetch('/admin/holidays')
        .then(res => res.json())
        .then(holidays => {
            holidayTimestamps = holidays.map(h => {
                const d = new Date(h.date);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            });
        }).catch(err => console.error("Failed to fetch holidays:", err));

    const rescheduleDateInput = document.getElementById('rescheduleDate');
    const rescheduleTimeInput = document.getElementById('rescheduleTime');

    function formatDateForInput(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function normalizeTimeHHMM(rawTime) {
        if (!rawTime) return '';
        const cleaned = String(rawTime).trim();

        // 24-hour format like 13:30 or 13:30:00
        const hhmmMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (hhmmMatch) {
            return `${String(Number(hhmmMatch[1])).padStart(2, '0')}:${hhmmMatch[2]}`;
        }

        // 12-hour format like 1:30 PM
        const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (ampmMatch) {
            let hour = Number(ampmMatch[1]);
            const minute = ampmMatch[2];
            const ampm = ampmMatch[3].toUpperCase();
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            return `${String(hour).padStart(2, '0')}:${minute}`;
        }

        return '';
    }

    function resetRescheduleTimeOptions(placeholderText) {
        if (!rescheduleTimeInput) return;
        rescheduleTimeInput.innerHTML = `<option value="">${placeholderText || 'Select a time slot'}</option>`;
        rescheduleTimeInput.value = '';
        rescheduleTimeInput.disabled = true;
    }

    function setupRescheduleTimeSlots(dateObj, preselectedTime = '') {
        if (!rescheduleTimeInput) return;

        const day = dateObj.getDay();
        let startHour;
        let endHour;

        if (day >= 1 && day <= 5) { // Monday-Friday
            startHour = 9;
            endHour = 17;
        } else if (day === 6) { // Saturday
            startHour = 11;
            endHour = 15;
        } else {
            resetRescheduleTimeOptions('No slots available');
            return;
        }

        rescheduleTimeInput.innerHTML = '<option value="">Select a time slot</option>';
        const quarterHours = ['00', '15', '30', '45'];
        for (let hour = startHour; hour < endHour; hour++) {
            for (const mins of quarterHours) {
                const value = `${String(hour).padStart(2, '0')}:${mins}`;
                let displayHour = hour % 12;
                if (displayHour === 0) displayHour = 12;
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const label = `${displayHour}:${mins} ${ampm}`;
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                rescheduleTimeInput.appendChild(option);
            }
        }

        rescheduleTimeInput.disabled = false;
        if (preselectedTime) {
            rescheduleTimeInput.value = preselectedTime;
        }
    }

    if (rescheduleDateInput && rescheduleTimeInput) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        rescheduleDateInput.min = formatDateForInput(today);
        resetRescheduleTimeOptions('Select a date first');

        rescheduleDateInput.addEventListener('change', function() {
            if (!this.value) {
                resetRescheduleTimeOptions('Select a date first');
                return;
            }

            const selected = new Date(this.value);
            selected.setHours(0, 0, 0, 0);

            const day = selected.getDay();
            const isHoliday = holidayTimestamps.includes(selected.getTime());

            if (day === 0 || isHoliday) {
                this.setCustomValidity('Selected date is a holiday or a Sunday. Please choose another day.');
                this.reportValidity();
                this.value = '';
                resetRescheduleTimeOptions('Select a valid date');
                return;
            }

            this.setCustomValidity('');
            setupRescheduleTimeSlots(selected);
        });
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatNotificationTime(rawDate) {
        const date = new Date(rawDate);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
    }

    function fmtDate(raw) {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString();
    }

    function formatMoney(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '--';
        return `₹${num.toLocaleString('en-IN')}`;
    }

    function setVerificationFormState(disabled) {
        if (!verificationForm) return;
        const fields = verificationForm.querySelectorAll('input, select, button');
        fields.forEach(field => {
            field.disabled = disabled;
        });
    }

    function formatSimpleDate(raw) {
        if (!raw) return '';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
    }

    function formatComplaintStatus(status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (!normalized) return '';
        if (normalized === 'responded') return 'Responded';
        if (normalized === 'closed') return 'Closed';
        return 'Open';
    }

    function openComplaintModal(purchase) {
        if (!complaintModal || !complaintForm || !purchase) return;
        if (complaintFormMsg) {
            complaintFormMsg.textContent = '';
            complaintFormMsg.style.color = '#1d4ed8';
        }
        const hasComplaint = !!purchase.complaint_id;
        if (complaintCarSummary) {
            const title = `${purchase.make || ''} ${purchase.model || ''} (${purchase.year || '-'})`.trim();
            complaintCarSummary.textContent = title ? `Car: ${title}` : 'Car: Purchased vehicle';
        }
        if (complaintPurchaseId) complaintPurchaseId.value = purchase.id || '';
        if (complaintSubject) complaintSubject.value = hasComplaint ? (purchase.complaint_subject || '') : '';
        if (complaintMessage) complaintMessage.value = hasComplaint ? (purchase.complaint_message || '') : '';

        const statusLabel = hasComplaint ? formatComplaintStatus(purchase.complaint_status) : '';
        if (complaintStatus) complaintStatus.textContent = statusLabel ? `Status: ${statusLabel}` : '';

        if (complaintAdminWrap && complaintAdminResponse) {
            if (hasComplaint) {
                complaintAdminWrap.style.display = 'block';
                complaintAdminResponse.textContent = purchase.complaint_admin_response || 'No response yet.';
            } else {
                complaintAdminWrap.style.display = 'none';
                complaintAdminResponse.textContent = '';
            }
        }

        const disableFields = hasComplaint;
        if (complaintSubject) complaintSubject.disabled = disableFields;
        if (complaintMessage) complaintMessage.disabled = disableFields;
        if (complaintSubmitBtn) complaintSubmitBtn.style.display = hasComplaint ? 'none' : 'inline-flex';

        complaintModal.style.display = 'block';
    }

    function renderWishlist(items) {
        if (!wishlistList || !wishlistMessage) return;
        wishlistList.innerHTML = '';
        if (!items.length) {
            wishlistMessage.textContent = 'Your wishlist is empty.';
            return;
        }
        wishlistMessage.textContent = '';
        const fragment = document.createDocumentFragment();
        const PLACEHOLDER_IMG = 'images/cars/placeholder.png';
        items.forEach(car => {
            const card = document.createElement('div');
            card.className = 'wishlist-card';
            let imgUrl = '';
            let imageVal = car.image_url || car.image;
            if (imageVal) {
                if (imageVal.startsWith('/')) imageVal = imageVal.substring(1);
                if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) {
                    imgUrl = imageVal;
                } else if (imageVal.startsWith('images/cars/')) {
                    imgUrl = imageVal;
                } else {
                    imgUrl = 'images/cars/' + imageVal;
                }
            } else {
                imgUrl = PLACEHOLDER_IMG;
            }
            card.innerHTML = `
                <img src="${imgUrl}" alt="${car.make} ${car.model}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}';">
                <h3>${car.make} ${car.model} (${car.year})</h3>
                <div class="wishlist-price">&#8377;${Number(car.price || 0).toLocaleString('en-IN')}</div>
                <div class="wishlist-actions">
                    <button class="wishlist-view-btn" type="button">View</button>
                    <button class="wishlist-remove-btn" type="button" data-car-id="${car.id}">Remove</button>
                </div>
            `;
            const viewBtn = card.querySelector('.wishlist-view-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => {
                    window.location.href = `car-details.html?id=${encodeURIComponent(car.id)}`;
                });
            }
            const removeBtn = card.querySelector('.wishlist-remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', async () => {
                    removeBtn.disabled = true;
                    try {
                        const res = await fetch(`/user/wishlist/${car.id}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.message || 'Failed to remove.');
                        loadWishlist();
                    } catch (err) {
                        alert(err.message || 'Failed to remove.');
                        removeBtn.disabled = false;
                    }
                });
            }
            fragment.appendChild(card);
        });
        wishlistList.appendChild(fragment);
    }

    async function loadWishlist() {
        if (!wishlistList || !wishlistMessage) return;
        try {
            const res = await fetch('/user/wishlist');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load wishlist.');
            renderWishlist(Array.isArray(data) ? data : []);
        } catch (err) {
            wishlistMessage.textContent = err.message || 'Failed to load wishlist.';
            wishlistList.innerHTML = '';
        }
    }

    async function loadVerificationStatus() {
        if (!verifiedSellerStatus) return;
        try {
            const res = await fetch('/user/verification/status');
            if (!res.ok) throw new Error('Failed to load verification status');
            const data = await res.json();
            if (data.is_verified) {
                const when = data.verified_at ? ` on ${formatSimpleDate(data.verified_at)}` : '';
                verifiedSellerStatus.textContent = `Verified Seller${when}.`;
                verifiedSellerStatus.style.background = '#dcfce7';
                verifiedSellerStatus.style.borderColor = '#22c55e';
                verifiedSellerStatus.style.color = '#166534';
                setVerificationFormState(true);
                if (profileVerifiedBadge) {
                    profileVerifiedBadge.style.display = 'inline-flex';
                }
                if (verificationToggleBtn) {
                    verificationToggleBtn.textContent = 'Verified';
                    verificationToggleBtn.disabled = true;
                }
                return;
            }
            if (data.latest_request && data.latest_request.status === 'pending') {
                const created = formatSimpleDate(data.latest_request.created_at);
                verifiedSellerStatus.textContent = `Verification request pending since ${created || 'recently'}.`;
                verifiedSellerStatus.style.background = '#fef3c7';
                verifiedSellerStatus.style.borderColor = '#f59e0b';
                verifiedSellerStatus.style.color = '#92400e';
                setVerificationFormState(true);
                if (profileVerifiedBadge) {
                    profileVerifiedBadge.style.display = 'none';
                }
                if (verificationToggleBtn) {
                    verificationToggleBtn.textContent = 'Pending';
                    verificationToggleBtn.disabled = true;
                }
                return;
            }
            if (data.latest_request && data.latest_request.status === 'rejected') {
                const reviewed = formatSimpleDate(data.latest_request.reviewed_at);
                const note = data.latest_request.admin_note ? ` Admin note: ${data.latest_request.admin_note}` : '';
                verifiedSellerStatus.textContent = `Verification rejected${reviewed ? ` on ${reviewed}` : ''}.${note}`;
                verifiedSellerStatus.style.background = '#fee2e2';
                verifiedSellerStatus.style.borderColor = '#ef4444';
                verifiedSellerStatus.style.color = '#991b1b';
                setVerificationFormState(false);
                if (profileVerifiedBadge) {
                    profileVerifiedBadge.style.display = 'none';
                }
                if (verificationToggleBtn) {
                    verificationToggleBtn.textContent = 'Re-Apply';
                    verificationToggleBtn.disabled = false;
                }
                return;
            }
            verifiedSellerStatus.textContent = 'Not verified yet. Submit your request below.';
            verifiedSellerStatus.style.background = '#eef4ff';
            verifiedSellerStatus.style.borderColor = '#c7d8f0';
            verifiedSellerStatus.style.color = '#1e3a8a';
            setVerificationFormState(false);
            if (profileVerifiedBadge) {
                profileVerifiedBadge.style.display = 'none';
            }
            if (verificationToggleBtn) {
                verificationToggleBtn.textContent = 'Apply';
                verificationToggleBtn.disabled = false;
            }
        } catch (err) {
            verifiedSellerStatus.textContent = 'Unable to load verification status right now.';
        }
    }

    const MAX_VERIFY_FILE_BYTES = 5 * 1024 * 1024;
    const ALLOWED_VERIFY_TYPES = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf'
    ]);

    function validateVerifyFile(file, label) {
        if (!file) return '';
        if (!ALLOWED_VERIFY_TYPES.has(file.type)) {
            return `${label} must be an image or PDF file.`;
        }
        if (file.size > MAX_VERIFY_FILE_BYTES) {
            return `${label} must be 5MB or smaller.`;
        }
        return '';
    }

    function showVerificationError(message) {
        if (!verificationMsg) return;
        verificationMsg.style.color = '#dc2626';
        verificationMsg.textContent = message;
    }

    function setupVerificationFileValidation() {
        const attach = (input, label) => {
            if (!input) return;
            input.addEventListener('change', function() {
                const file = input.files && input.files[0] ? input.files[0] : null;
                const error = validateVerifyFile(file, label);
                if (error) {
                    input.value = '';
                    showVerificationError(error);
                } else if (verificationMsg) {
                    verificationMsg.textContent = '';
                }
            });
        };
        attach(verificationIdDoc, 'ID document');
        attach(verificationSelfie, 'Selfie');
        attach(verificationAddressDoc, 'Address proof');
    }

    function renderNotifications(items) {
        if (!notificationsList || !notificationsUnreadCount) return;
        if (!items || !items.length) {
            notificationsUnreadCount.textContent = '0 unread';
            if (messagesTabBadge) {
                messagesTabBadge.style.display = 'none';
                messagesTabBadge.textContent = '0';
            }
            notificationsList.textContent = 'No updates yet.';
            return;
        }

        const unreadCount = items.filter(item => !item.is_read).length;
        notificationsUnreadCount.textContent = `${unreadCount} unread`;
        if (messagesTabBadge) {
            if (unreadCount > 0) {
                messagesTabBadge.style.display = 'inline-flex';
                messagesTabBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            } else {
                messagesTabBadge.style.display = 'none';
                messagesTabBadge.textContent = '0';
            }
        }

        notificationsList.innerHTML = items.map(item => {
            const linkHref = item.type === 'query' ? '#queries' : (item.link || '');
            const linkHtml = linkHref ? `<a href="${escapeHtml(linkHref)}" data-link="${escapeHtml(linkHref)}">Open</a>` : '';
            return `
            <article class="notification-item ${item.is_read ? '' : 'unread'}" data-id="${item.id}">
                <div class="notification-top">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="notification-time">${escapeHtml(formatNotificationTime(item.created_at))}</span>
                </div>
                <p class="notification-message">${escapeHtml(item.message)}</p>
                <div class="notification-actions">
                    ${item.is_read ? '' : `<button type="button" class="notification-read-btn" data-id="${item.id}">Mark read</button>`}
                    ${linkHtml}
                </div>
            </article>
        `;
        }).join('');
    }

    function loadNotifications() {
        if (!notificationsList) return Promise.resolve();
        return fetch('/user/notifications')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load notifications');
                return res.json();
            })
            .then(renderNotifications)
            .catch(() => {
                notificationsList.textContent = 'Unable to load updates right now.';
            });
    }

    function markNotificationAsRead(notificationId) {
        return fetch(`/user/notifications/${notificationId}/read`, { method: 'POST' })
            .then(() => loadNotifications());
    }

    if (notificationsList) {
        notificationsList.addEventListener('click', function(e) {
            if (e.target && e.target.tagName === 'A') {
                const href = e.target.getAttribute('data-link') || e.target.getAttribute('href') || '';
                if (href === '#queries' || href.endsWith('#queries')) {
                    e.preventDefault();
                    setProfileView('queries', false);
                    history.replaceState(null, '', '#queries');
                }
            }
            if (e.target.classList.contains('notification-read-btn')) {
                const notificationId = e.target.dataset.id;
                if (notificationId) {
                    markNotificationAsRead(notificationId);
                }
            }
        });
    }

    if (markAllNotificationsRead) {
        markAllNotificationsRead.addEventListener('click', function() {
            fetch('/user/notifications/read-all', { method: 'POST' })
                .then(() => loadNotifications());
        });
    }

    function setProfileView(view, toggleIfSame) {
        if (!profileSliderTrack || !tabOverview || !tabMessages || !tabOffers) return;
        if (!sliderViews.includes(view)) view = 'overview';

        if (toggleIfSame && currentView === view) {
            view = 'overview';
        }

        currentView = view;
        const viewIndex = sliderViews.indexOf(currentView);
        profileSliderTrack.style.transform = `translateX(-${(viewIndex * 100) / sliderViews.length}%)`;
        tabOverview.classList.toggle('active', currentView === 'overview');
        tabMessages.classList.toggle('active', currentView === 'messages');
        tabOffers.classList.toggle('active', currentView === 'offers');
        if (tabWishlist) tabWishlist.classList.toggle('active', currentView === 'wishlist');
        if (tabQueries) tabQueries.classList.toggle('active', currentView === 'queries');
        if (tabListings) tabListings.classList.toggle('active', currentView === 'listings');
    }

    if (tabOverview) {
        tabOverview.addEventListener('click', function() {
            setProfileView('overview', false);
        });
    }

    if (tabMessages) {
        tabMessages.addEventListener('click', function() {
            setProfileView('messages', true);
        });
    }

    if (tabOffers) {
        tabOffers.addEventListener('click', function() {
            setProfileView('offers', true);
        });
    }

    if (tabWishlist) {
        tabWishlist.addEventListener('click', function() {
            setProfileView('wishlist', true);
        });
    }

    if (tabQueries) {
        tabQueries.addEventListener('click', function() {
            setProfileView('queries', true);
        });
    }

    if (tabListings) {
        tabListings.addEventListener('click', function() {
            setProfileView('listings', true);
        });
    }

    if (window.location.hash === '#offers') {
        setProfileView('offers', false);
    } else if (window.location.hash === '#wishlist') {
        setProfileView('wishlist', false);
    } else if (window.location.hash === '#messages') {
        setProfileView('messages', false);
    } else if (window.location.hash === '#queries') {
        setProfileView('queries', false);
    } else if (window.location.hash === '#listings') {
        setProfileView('listings', false);
    }

    if (viewNext) {
        viewNext.addEventListener('click', function() {
            const currentIndex = sliderViews.indexOf(currentView);
            const nextIndex = (currentIndex + 1) % sliderViews.length;
            setProfileView(sliderViews[nextIndex], false);
        });
    }

    if (viewPrev) {
        viewPrev.addEventListener('click', function() {
            const currentIndex = sliderViews.indexOf(currentView);
            const prevIndex = (currentIndex - 1 + sliderViews.length) % sliderViews.length;
            setProfileView(sliderViews[prevIndex], false);
        });
    }

    if (profileSliderShell) {
        let touchStartX = 0;
        profileSliderShell.addEventListener('touchstart', function(e) {
            if (!e.touches || !e.touches.length) return;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        profileSliderShell.addEventListener('touchend', function(e) {
            if (!e.changedTouches || !e.changedTouches.length) return;
            const touchEndX = e.changedTouches[0].clientX;
            const deltaX = touchEndX - touchStartX;
            if (Math.abs(deltaX) < 50) return;
            const currentIndex = sliderViews.indexOf(currentView);
            if (deltaX < 0) {
                const nextIndex = Math.min(currentIndex + 1, sliderViews.length - 1);
                setProfileView(sliderViews[nextIndex], false);
            } else {
                const prevIndex = Math.max(currentIndex - 1, 0);
                setProfileView(sliderViews[prevIndex], false);
            }
        }, { passive: true });
    }

    // Fetch user profile
    fetch('/user/profile')
        .then(res => {
            if (!res.ok) throw new Error('Not logged in');
            return res.json();
        })
        .then(user => {
            document.getElementById('firstName').value = user.first_name || '';
            document.getElementById('lastName').value = user.last_name || '';
            document.getElementById('email').value = user.email || '';
            document.getElementById('phone').value = user.phone || '';
            if (verificationFullName) {
                const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                verificationFullName.value = displayName || '';
            }
            setupVerificationFileValidation();
            loadNotifications();
            notificationsPollInterval = setInterval(loadNotifications, 30000);
            loadVerificationStatus();
            loadWishlist();
        })
        .catch(() => {
            window.location.href = 'user-login.html';
        });

    window.addEventListener('beforeunload', function() {
        if (notificationsPollInterval) {
            clearInterval(notificationsPollInterval);
        }
    });

    // Update profile form
    document.getElementById('profileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const first_name = document.getElementById('firstName').value;
        const last_name = document.getElementById('lastName').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;
        fetch('/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name, last_name, phone, password: password || undefined })
        })
        .then(res => res.json())
        .then(data => {
            document.getElementById('profileMsg').textContent = data.message || 'Profile updated!';
            document.getElementById('password').value = '';
        })
        .catch(() => {
            document.getElementById('profileMsg').textContent = 'Error updating profile.';
        });
    });

    if (verificationForm) {
        verificationForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (verificationMsg) verificationMsg.textContent = '';
            const idFile = verificationIdDoc && verificationIdDoc.files ? verificationIdDoc.files[0] : null;
            if (!idFile) {
                showVerificationError('ID document is required.');
                return;
            }
            const idErr = validateVerifyFile(idFile, 'ID document');
            if (idErr) {
                showVerificationError(idErr);
                return;
            }
            const selfieFile = verificationSelfie && verificationSelfie.files ? verificationSelfie.files[0] : null;
            const addressFile = verificationAddressDoc && verificationAddressDoc.files ? verificationAddressDoc.files[0] : null;
            const selfieErr = validateVerifyFile(selfieFile, 'Selfie');
            if (selfieErr) {
                showVerificationError(selfieErr);
                return;
            }
            const addressErr = validateVerifyFile(addressFile, 'Address proof');
            if (addressErr) {
                showVerificationError(addressErr);
                return;
            }
            if (verificationSubmitBtn) {
                verificationSubmitBtn.disabled = true;
                verificationSubmitBtn.textContent = 'Submitting...';
            }
            try {
                const formData = new FormData(verificationForm);
                const res = await fetch('/user/verification/apply', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed to submit verification.');
                if (verificationMsg) {
                    verificationMsg.style.color = '#16a34a';
                    verificationMsg.textContent = data.message || 'Verification submitted.';
                }
                verificationForm.reset();
                if (verificationFullName && document.getElementById('firstName') && document.getElementById('lastName')) {
                    const displayName = `${document.getElementById('firstName').value || ''} ${document.getElementById('lastName').value || ''}`.trim();
                    verificationFullName.value = displayName || '';
                }
                loadVerificationStatus();
            } catch (err) {
                if (verificationMsg) {
                    verificationMsg.style.color = '#dc2626';
                    verificationMsg.textContent = err.message || 'Verification submit failed.';
                }
            } finally {
                if (verificationSubmitBtn) {
                    verificationSubmitBtn.disabled = false;
                    verificationSubmitBtn.textContent = 'Submit Verification';
                }
            }
        });
    }

    if (verificationToggleBtn && verificationFormWrap) {
        verificationToggleBtn.addEventListener('click', function() {
            const isOpen = verificationFormWrap.classList.toggle('open');
            verificationFormWrap.classList.toggle('collapsed', !isOpen);
            verificationFormWrap.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
            if (isOpen) {
                setTimeout(() => {
                    const field = verificationFormWrap.querySelector('input, select');
                    if (field && typeof field.focus === 'function') field.focus();
                }, 120);
            }
        });
    }

    function renderPurchases(purchases) {
        if (!purchasesList) return;
        purchasesList.innerHTML = '';
        purchasesById.clear();
        if (!purchases || !purchases.length) {
            purchasesList.textContent = 'No purchases yet.';
            return;
        }
        purchases.forEach(p => {
            purchasesById.set(String(p.id), p);
            const div = document.createElement('div');
            div.className = 'purchase-card';
            const title = `${p.make || ''} ${p.model || ''} (${p.year || '-'})`.trim();
            const imageUrl = p.image_url || 'images/cars/default.jpg';
            const price = formatMoney(p.purchase_price || p.price || 0);
            const purchasedOn = p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : '-';
            const complaintStatus = (p.complaint_status || '').toLowerCase();
            const complaintBadge = complaintStatus
                ? `<span class="purchase-complaint-status ${escapeHtml(complaintStatus)}">Complaint: ${escapeHtml(complaintStatus)}</span>`
                : '';
            const complaintButton = p.complaint_id
                ? `<button type="button" class="purchase-complaint-view-btn" data-purchase-id="${escapeHtml(p.id)}">View Complaint</button>`
                : `<button type="button" class="purchase-complaint-btn" data-purchase-id="${escapeHtml(p.id)}">Report Complaint</button>`;
            div.innerHTML = `
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title || 'Purchased car')}"/>
                <div class="purchase-info">
                    <div class="purchase-title">${escapeHtml(title || 'Purchased car')}</div>
                    <div class="purchase-meta">
                        <span class="purchase-price">${escapeHtml(price)}</span>
                        <span class="purchase-date">${escapeHtml(purchasedOn)}</span>
                        ${complaintBadge}
                    </div>
                    <div class="purchase-actions">
                        <button type="button" class="purchase-receipt-btn" data-purchase-id="${escapeHtml(p.id)}">Download Receipt</button>
                        ${complaintButton}
                    </div>
                </div>
            `;
            purchasesList.appendChild(div);
        });
    }

    async function loadPurchases() {
        if (!purchasesList) return;
        try {
            const res = await fetch('/user/purchases');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load purchases.');
            renderPurchases(Array.isArray(data) ? data : []);
        } catch (err) {
            purchasesList.textContent = err.message || 'Unable to load purchases right now.';
        }
    }

    if (purchasesList) {
        purchasesList.addEventListener('click', async function(e) {
            const receiptBtn = e.target.closest('.purchase-receipt-btn');
            if (receiptBtn) {
                const purchaseId = receiptBtn.dataset.purchaseId;
                if (!purchaseId) return;
                receiptBtn.disabled = true;
                const originalText = receiptBtn.textContent;
                receiptBtn.textContent = 'Preparing...';
                try {
                    const res = await fetch(`/user/purchases/${encodeURIComponent(purchaseId)}/receipt?format=pdf`);
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.message || 'Unable to download receipt.');
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `SecondGear-Receipt-${purchaseId}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (err) {
                    alert(err.message || 'Unable to download receipt.');
                } finally {
                    receiptBtn.disabled = false;
                    receiptBtn.textContent = originalText;
                }
                return;
            }

            const complaintBtn = e.target.closest('.purchase-complaint-btn, .purchase-complaint-view-btn');
            if (complaintBtn) {
                const purchaseId = complaintBtn.dataset.purchaseId;
                const purchase = purchasesById.get(String(purchaseId));
                if (purchase) {
                    openComplaintModal(purchase);
                }
            }
        });
    }

    loadPurchases();

    // Fetch bookings
    fetch('/user/bookings')
        .then(res => res.json())
        .then(bookings => {
            const list = document.getElementById('bookingsList');
            if (!bookings.length) {
                list.textContent = 'No bookings yet.';
                return;
            }
            list.innerHTML = '';
            bookings.forEach(b => {
                const div = document.createElement('div');
                div.className = 'booking-card';
                const title = b.service_type || b.vehicle_type || 'Service booking';
                const bookedOn = b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '-';
                const bookedAt = b.booking_time ? String(b.booking_time) : '-';
                const status = b.status || 'Pending';
                div.innerHTML = `
                    <div class="booking-info">
                        <div class="booking-title">${escapeHtml(title)}</div>
                        <div class="booking-meta">
                            <span class="booking-date">${escapeHtml(bookedOn)} · ${escapeHtml(bookedAt)}</span>
                            <span class="booking-status">${escapeHtml(status)}</span>
                        </div>
                    </div>
                `;
                if (b.status !== 'Cancelled' && b.status !== 'Completed') {
                    const actions = document.createElement('div');
                    actions.className = 'booking-actions';
                    actions.innerHTML = `
                        <button class="reschedule-btn" data-id="${b.id}" data-date="${b.booking_date}" data-time="${b.booking_time}">Reschedule</button>
                        <button class="cancel-btn" data-id="${b.id}">Cancel</button>
                    `;
                    div.appendChild(actions);
                }
                list.appendChild(div);
            });

            // Add event listeners for new buttons
            list.addEventListener('click', function(e) {
                if (e.target.classList.contains('cancel-btn')) {
                    const bookingId = e.target.dataset.id;
                    if (confirm('Are you sure you want to cancel this booking?')) {
                        fetch(`/user/bookings/cancel/${bookingId}`, { method: 'POST' })
                            .then(res => res.json())
                            .then(data => {
                                if(data.success) {
                                    alert('Booking cancelled successfully.');
                                    window.location.reload(); // Refresh to see changes
                                } else {
                                    alert(data.message || 'Failed to cancel booking.');
                                }
                            });
                    }
                }

                if (e.target.classList.contains('reschedule-btn')) {
                    const bookingId = e.target.dataset.id;
                    const bookingDateRaw = e.target.dataset.date;
                    const bookingTimeRaw = e.target.dataset.time;
                    const modal = document.getElementById('rescheduleModal');
                    document.getElementById('rescheduleBookingId').value = bookingId;

                    if (rescheduleDateInput && bookingDateRaw) {
                        const parsedDate = new Date(bookingDateRaw);
                        if (!Number.isNaN(parsedDate.getTime())) {
                            parsedDate.setHours(0, 0, 0, 0);
                            const day = parsedDate.getDay();
                            const isHoliday = holidayTimestamps.includes(parsedDate.getTime());
                            const dateString = formatDateForInput(parsedDate);
                            rescheduleDateInput.value = dateString;

                            if (day !== 0 && !isHoliday) {
                                const normalizedTime = normalizeTimeHHMM(bookingTimeRaw);
                                setupRescheduleTimeSlots(parsedDate, normalizedTime);
                            } else {
                                resetRescheduleTimeOptions('Select a valid date');
                            }
                        } else {
                            rescheduleDateInput.value = '';
                            resetRescheduleTimeOptions('Select a date first');
                        }
                    } else if (rescheduleDateInput) {
                        rescheduleDateInput.value = '';
                        resetRescheduleTimeOptions('Select a date first');
                    }

                    modal.style.display = 'block';
                }
            });
        });

    // Fetch customer car offers
    fetch('/user/car-offers')
        .then(res => res.json())
        .then(offers => {
            const list = document.getElementById('offersList');
            if (!list) return;
            if (!offers.length) {
                list.textContent = 'No offers submitted yet.';
                return;
            }
            list.innerHTML = '';
            offers.forEach(o => {
                const card = document.createElement('div');
                card.className = 'offer-card';
                const status = (o.status || '').toUpperCase();
                const counterPart = o.counter_price ? `<br>Counter Price: <b>${formatMoney(o.counter_price)}</b>` : '';
                const adminPart = o.admin_response ? `<br>Admin: ${escapeHtml(o.admin_response)}` : '';
                card.innerHTML = `
                    <b>${escapeHtml(o.make)} ${escapeHtml(o.model)} (${escapeHtml(o.year)})</b>
                    <br>Listed: ${formatMoney(o.listed_price)}
                    <br>Your Offer: ${formatMoney(o.offered_price)}
                    ${counterPart}
                    <br>Status: <b>${escapeHtml(status)}</b>
                    ${adminPart}
                `;
                if (o.status === 'countered') {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.textContent = 'Accept Counter';
                    acceptBtn.type = 'button';
                    acceptBtn.dataset.offerId = o.id;
                    acceptBtn.dataset.carId = o.car_id;
                    acceptBtn.className = 'offer-accept-counter-btn';
                    acceptBtn.style.background = '#16a34a';
                    acceptBtn.style.marginRight = '8px';
                    card.appendChild(acceptBtn);

                    const rejectBtn = document.createElement('button');
                    rejectBtn.textContent = 'Reject Counter';
                    rejectBtn.type = 'button';
                    rejectBtn.dataset.offerId = o.id;
                    rejectBtn.dataset.carId = o.car_id;
                    rejectBtn.className = 'offer-reject-counter-btn';
                    rejectBtn.style.background = '#ef4444';
                    rejectBtn.style.marginRight = '8px';
                    card.appendChild(rejectBtn);
                }
                if (o.status === 'pending') {
                    const withdrawBtn = document.createElement('button');
                    withdrawBtn.textContent = 'Withdraw Offer';
                    withdrawBtn.type = 'button';
                    withdrawBtn.dataset.offerId = o.id;
                    withdrawBtn.dataset.carId = o.car_id;
                    withdrawBtn.className = 'offer-withdraw-btn';
                    card.appendChild(withdrawBtn);
                }
                list.appendChild(card);
            });

            list.addEventListener('click', function(e) {
                const offerId = e.target.dataset.offerId;
                const carId = e.target.dataset.carId;
                if (!offerId) return;

                if (e.target.classList.contains('offer-withdraw-btn')) {
                    if (!confirm('Withdraw this offer?')) return;
                    fetch(`/user/car-offers/${offerId}/withdraw`, { method: 'POST' })
                        .then(res => res.json().then(data => ({ ok: res.ok, data })))
                        .then(({ ok, data }) => {
                            if (!ok) {
                                alert(data.message || 'Failed to withdraw offer.');
                                return;
                            }
                            alert(data.message || 'Offer withdrawn.');
                            window.location.reload();
                        })
                        .catch(() => alert('Failed to withdraw offer.'));
                    return;
                }

                if (e.target.classList.contains('offer-accept-counter-btn')) {
                    if (!confirm('Accept this counter-offer and proceed with this price?')) return;
                    fetch(`/user/car-offers/${offerId}/counter-response`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'accept' })
                    })
                        .then(res => res.json().then(data => ({ ok: res.ok, data })))
                        .then(({ ok, data }) => {
                            if (!ok) {
                                alert(data.message || 'Failed to accept counter-offer.');
                                return;
                            }
                            alert(data.message || 'Counter-offer accepted.');
                            if (carId) {
                                window.location.href = `purchase.html?car_id=${encodeURIComponent(carId)}&offer_id=${encodeURIComponent(offerId)}`;
                            } else {
                                window.location.reload();
                            }
                        })
                        .catch(() => alert('Failed to accept counter-offer.'));
                    return;
                }

                if (e.target.classList.contains('offer-reject-counter-btn')) {
                    if (!confirm('Reject this counter-offer?')) return;
                    fetch(`/user/car-offers/${offerId}/counter-response`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'reject' })
                    })
                        .then(res => res.json().then(data => ({ ok: res.ok, data })))
                        .then(({ ok, data }) => {
                            if (!ok) {
                                alert(data.message || 'Failed to reject counter-offer.');
                                return;
                            }
                            alert(data.message || 'Counter-offer rejected.');
                            window.location.reload();
                        })
                        .catch(() => alert('Failed to reject counter-offer.'));
                }
            });
        })
        .catch(() => {
            const list = document.getElementById('offersList');
            if (list) list.textContent = 'Unable to load your offers right now.';
        });

    // Fetch user queries
    fetch('/user/car-queries')
        .then(res => res.json())
        .then(queries => {
            const list = document.getElementById('queriesList');
            if (!list) return;
            if (!queries.length) {
                list.textContent = 'No queries submitted yet.';
                return;
            }
            list.innerHTML = '';
            queries.forEach(q => {
                const card = document.createElement('div');
                card.className = 'query-card';
                const carLabel = `${q.make || ''} ${q.model || ''} (${q.year || '-'})`.trim() || `Car #${q.car_id}`;
                const created = q.created_at ? new Date(q.created_at).toLocaleString() : '';
                card.innerHTML = `
                    <h4>${carLabel}</h4>
                    <div class="query-meta">
                        ${created}
                        <span class="query-status-badge ${q.status || 'open'}">${q.status || 'open'}</span>
                    </div>
                    <div><strong>Subject:</strong> ${q.subject}</div>
                    <div style="margin-top:6px;"><strong>Your Query:</strong> ${q.message}</div>
                    <div style="margin-top:6px; color:#1e3a8a;"><strong>Admin Response:</strong> ${q.admin_response || 'Pending response'}</div>
                `;
                list.appendChild(card);
            });
        })
        .catch(() => {
            const list = document.getElementById('queriesList');
            if (list) list.textContent = 'Unable to load your queries right now.';
        });

    function renderListingCards(target, items, type) {
        if (!target) return;
        if (!items || !items.length) {
            target.innerHTML = '<p class="listing-empty">No records found.</p>';
            return;
        }
        target.innerHTML = items.map(item => {
            const title = `${item.make || ''} ${item.model || ''} (${item.year || '-'})`;
            const price = item.price || item.estimated_price ? `&#8377;${Number(item.price || item.estimated_price).toLocaleString('en-IN')}` : 'N/A';
            const created = item.created_at ? fmtDate(item.created_at) : '-';
            const soldAt = item.purchase_date ? fmtDate(item.purchase_date) : '';
            const image = item.image_url || 'images/cars/default.jpg';

            const chips = [];
            if (item.type) chips.push(`<span class="listing-chip">${escapeHtml(item.type)}</span>`);
            if (item.km_driven) chips.push(`<span class="listing-chip">${escapeHtml(item.km_driven)} km</span>`);
            if (type === 'pending') chips.push('<span class="listing-chip">Pending</span>');
            if (type === 'active') chips.push('<span class="listing-chip">Live</span>');
            if (type === 'sold') chips.push('<span class="listing-chip">Sold</span>');
            if (type === 'rejected') chips.push('<span class="listing-chip">Rejected</span>');

            return `
                <article class="listing-card">
                    <div class="listing-head">
                        <img class="listing-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
                        <div>
                            <p class="listing-title">${escapeHtml(title)}</p>
                            <p class="listing-meta">Price: ${escapeHtml(price)}</p>
                            <p class="listing-meta">${type === 'sold' ? `Sold on: ${escapeHtml(soldAt)}` : `Created: ${escapeHtml(created)}`}</p>
                        </div>
                    </div>
                    <div class="listing-detail">
                        ${chips.join('')}
                    </div>
                </article>
            `;
        }).join('');
    }

    fetch('/user/my-listings')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load listings');
            return res.json();
        })
        .then(data => {
            renderListingCards(document.getElementById('pendingList'), data.pending, 'pending');
            renderListingCards(document.getElementById('activeList'), data.active, 'active');
            renderListingCards(document.getElementById('soldList'), data.sold, 'sold');
            renderListingCards(document.getElementById('rejectedList'), data.rejected, 'rejected');
        })
        .catch(() => {
            const pendingList = document.getElementById('pendingList');
            const activeList = document.getElementById('activeList');
            const soldList = document.getElementById('soldList');
            const rejectedList = document.getElementById('rejectedList');
            if (pendingList) pendingList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (activeList) activeList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (soldList) soldList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (rejectedList) rejectedList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
        });

    // Modal close buttons
    const modal = document.getElementById('rescheduleModal');
    const closeButton = modal ? modal.querySelector('.close-button') : null;
    if (modal && closeButton) {
        closeButton.onclick = function() {
            modal.style.display = 'none';
        };
    }
    if (complaintModal && complaintClose) {
        complaintClose.onclick = function() {
            complaintModal.style.display = 'none';
        };
    }
    if (modal || complaintModal) {
        window.addEventListener('click', function(event) {
            if (modal && event.target === modal) {
                modal.style.display = 'none';
            }
            if (complaintModal && event.target === complaintModal) {
                complaintModal.style.display = 'none';
            }
        });
    }


    // Reschedule form submission
    const rescheduleForm = document.getElementById('rescheduleForm');
    if(rescheduleForm) {
        rescheduleForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const bookingId = document.getElementById('rescheduleBookingId').value;
            const newDate = document.getElementById('rescheduleDate').value;
            const newTime = document.getElementById('rescheduleTime').value;

            fetch(`/user/bookings/reschedule/${bookingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_date: newDate, booking_time: newTime })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Booking rescheduled successfully.');
                    document.getElementById('rescheduleModal').style.display = 'none';
                    window.location.reload(); // Refresh to see changes
                } else {
                    alert(data.message || 'Failed to reschedule booking.');
                }
            });
        });
    }

    if (complaintForm) {
        complaintForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!complaintPurchaseId || !complaintSubject || !complaintMessage) return;
            const purchaseId = complaintPurchaseId.value;
            const subject = complaintSubject.value.trim();
            const message = complaintMessage.value.trim();
            if (!purchaseId || !subject || !message) {
                if (complaintFormMsg) {
                    complaintFormMsg.style.color = '#dc2626';
                    complaintFormMsg.textContent = 'Please provide a subject and details.';
                }
                return;
            }
            if (complaintSubmitBtn) {
                complaintSubmitBtn.disabled = true;
            }
            const originalText = complaintSubmitBtn ? complaintSubmitBtn.textContent : '';
            if (complaintSubmitBtn) complaintSubmitBtn.textContent = 'Submitting...';
            try {
                const res = await fetch(`/user/purchases/${encodeURIComponent(purchaseId)}/complaints`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subject, message })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Failed to submit complaint.');
                if (complaintFormMsg) {
                    complaintFormMsg.style.color = '#16a34a';
                    complaintFormMsg.textContent = data.message || 'Complaint submitted.';
                }
                await loadPurchases();
                setTimeout(() => {
                    if (complaintModal) complaintModal.style.display = 'none';
                }, 700);
            } catch (err) {
                if (complaintFormMsg) {
                    complaintFormMsg.style.color = '#dc2626';
                    complaintFormMsg.textContent = err.message || 'Failed to submit complaint.';
                }
            } finally {
                if (complaintSubmitBtn) {
                    complaintSubmitBtn.disabled = false;
                    complaintSubmitBtn.textContent = originalText || 'Submit Complaint';
                }
            }
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
        logoutBtn.onclick = async function() {
            await fetch('/user/logout', { method: 'POST' });
            window.location.href = 'user-login.html';
        };
    }
});

