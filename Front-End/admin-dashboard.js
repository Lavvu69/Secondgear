// Custom file input logic for car image
document.addEventListener('DOMContentLoaded', function() {
    // --- Fetch and display stats ---
    async function fetchStats(startDate, endDate) {
        try {
            let url = '/admin/stats';
            if (startDate && endDate) {
                url += `?startDate=${startDate}&endDate=${endDate}`;
            }
            const res = await fetch(url);
            if (!res.ok) return;
            const stats = await res.json();
            const carRevenueEl = document.getElementById('carRevenue');
            const serviceRevenueEl = document.getElementById('serviceRevenue');
            if (carRevenueEl) {
                carRevenueEl.textContent = `₹${(stats.carRevenue || 0).toLocaleString('en-IN')}`;
            }
            if (serviceRevenueEl) {
                serviceRevenueEl.textContent = `₹${(stats.serviceRevenue || 0).toLocaleString('en-IN')}`;
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    }

    // Initial fetch for all-time stats
    fetchStats();

    // Event listener for the filter button
    const filterBtn = document.getElementById('filterStatsBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            if (startDate && endDate) {
                fetchStats(startDate, endDate);
            } else {
                alert('Please select both a start and end date.');
            }
        });
    }

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
                        } else {
                            alert('Failed to add holiday');
                        }
                    } catch (err) {
                        alert('Server error while adding holiday');
                    }
                });
            }
        // --- Car makes and models as in sell page ---
        const carMakes = [
            "Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Honda", "Toyota", "Kia", "Volkswagen", "Renault", "Ford", "Skoda", "MG", "Nissan", "Jeep", "Fiat", "Datsun", "Mercedes-Benz", "BMW", "Audi", "Volvo", "Jaguar", "Land Rover", "Porsche", "Mini", "Mitsubishi", "Isuzu", "Lexus", "Chevrolet", "Opel", "Force", "Citroen"
        ];
        // Models for each make (copied from sell.html)
        const modelsByMake = {
            "Maruti Suzuki": ["Swift", "Baleno", "Dzire", "Wagon R", "Alto", "Ertiga", "Celerio", "Vitara Brezza", "S-Presso", "Ignis"],
            "Hyundai": ["Creta", "i20", "Venue", "Verna", "Grand i10", "Aura", "Santro", "Elantra", "Tucson"],
            "Tata": ["Nexon", "Altroz", "Tiago", "Harrier", "Safari", "Tigor", "Punch", "Hexa"],
            "Mahindra": ["Scorpio", "XUV700", "XUV300", "Thar", "Bolero", "Marazzo", "KUV100", "Alturas G4"],
            "Honda": ["City", "Amaze", "Jazz", "WR-V", "Civic", "CR-V", "Brio"],
            "Toyota": ["Fortuner", "Innova", "Glanza", "Etios", "Corolla", "Camry", "Yaris", "Urban Cruiser"],
            "Kia": ["Seltos", "Sonet", "Carens", "Carnival", "EV6"],
            "Volkswagen": ["Polo", "Vento", "Taigun", "Virtus", "Tiguan"],
            "Renault": ["Kwid", "Triber", "Duster", "Kiger", "Captur"],
            "Ford": ["EcoSport", "Figo", "Endeavour", "Aspire", "Freestyle"],
            "Skoda": ["Octavia", "Superb", "Rapid", "Kushaq", "Slavia", "Kodiaq"],
            "MG": ["Hector", "ZS EV", "Gloster", "Astor"],
            "Nissan": ["Magnite", "Kicks", "Sunny", "Micra", "Terrano"],
            "Jeep": ["Compass", "Meridian", "Wrangler", "Grand Cherokee"],
            "Fiat": ["Punto", "Linea", "Avventura", "Urban Cross"],
            "Datsun": ["GO", "GO Plus", "Redi-GO"],
            "Mercedes-Benz": ["C-Class", "E-Class", "GLA", "GLC", "S-Class", "GLE", "GLS"],
            "BMW": ["3 Series", "5 Series", "X1", "X3", "X5", "7 Series"],
            "Audi": ["A3", "A4", "A6", "Q3", "Q5", "Q7"],
            "Volvo": ["XC40", "XC60", "XC90", "S60", "V90"],
            "Jaguar": ["XE", "XF", "F-Pace", "XJ"],
            "Land Rover": ["Range Rover", "Discovery", "Defender", "Evoque"],
            "Porsche": ["Cayenne", "Macan", "Panamera", "911"],
            "Mini": ["Cooper", "Countryman", "Clubman"],
            "Mitsubishi": ["Pajero", "Outlander", "Evo", "Cedia"],
            "Isuzu": ["D-Max", "MU-X"],
            "Lexus": ["ES", "NX", "RX", "LS"],
            "Chevrolet": ["Beat", "Cruze", "Spark", "Enjoy", "Sail", "Tavera"],
            "Opel": ["Corsa", "Astra", "Vectra"],
            "Force": ["Gurkha", "Trax"],
            "Citroen": ["C3", "C5 Aircross"]
        };
        const makeSelect = document.getElementById('admin-make-select');
        const modelSelect = document.getElementById('admin-model-select');
        if (makeSelect && modelSelect) {
            // Populate makes
            carMakes.forEach(make => {
                const opt = document.createElement('option');
                opt.value = make;
                opt.textContent = make;
                makeSelect.appendChild(opt);
            });
            // When make changes, update models
            makeSelect.addEventListener('change', function() {
                const selectedMake = makeSelect.value;
                modelSelect.innerHTML = '<option value="">Select Model</option>';
                if (modelsByMake[selectedMake]) {
                    modelsByMake[selectedMake].forEach(model => {
                        const opt = document.createElement('option');
                        opt.value = model;
                        opt.textContent = model;
                        modelSelect.appendChild(opt);
                    });
                }
            });
        }
    const fileInput = document.getElementById('car-image-input');
    const fakeBtn = document.getElementById('car-image-fake-btn');
    const fileNameSpan = document.getElementById('car-image-filename');
    if (fileInput && fakeBtn && fileNameSpan) {
        fakeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fileInput.click();
        });
        fileInput.addEventListener('change', function(e) {
            if (fileInput.files && fileInput.files.length > 0) {
                fileNameSpan.textContent = fileInput.files[0].name;
            } else {
                fileNameSpan.textContent = 'No file chosen';
            }
        });
    }
});
// --------- Admin Auth & Logout ---------
function setAdminLoggedIn(loggedIn) {
    if (loggedIn) {
        localStorage.setItem('adminLoggedIn', 'true');
    } else {
        localStorage.removeItem('adminLoggedIn');
    }
}

function isAdminLoggedIn() {
    return localStorage.getItem('adminLoggedIn') === 'true';
}

function setupAdminLogoutButton() {
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async function() {
            try {
                await fetch('/admin/logout', { method: 'POST' });
            } catch (e) {
                // ignore and still clear local state
            }
            setAdminLoggedIn(false);
            window.location.href = '/admin';
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setupAdminLogoutButton();
});
// ---------------- TAB SWITCHING ----------------
function showAdminSection(section) {
    document.getElementById('adminSectionDashboard').style.display =
        section === 'dashboard' ? '' : 'none';
    document.getElementById('adminSectionFeedback').style.display =
        section === 'feedback' ? '' : 'none';
    document.getElementById('adminSectionBookings').style.display =
        section === 'bookings' ? '' : 'none';
    document.getElementById('adminSectionNewsletter').style.display =
        section === 'newsletter' ? '' : 'none';
    document.getElementById('adminSectionOffers').style.display =
        section === 'offers' ? '' : 'none';
    document.getElementById('adminSectionQueries').style.display =
        section === 'queries' ? '' : 'none';
}

// Fetch newsletter subscribers
async function fetchNewsletterSubscribers() {
    try {
        const res = await fetch('/admin/newsletter-subscribers');
        const subscribers = await res.json();
        const tbody = document.querySelector('#newsletterTable tbody');
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

// ---------------- FETCH USERS ----------------
async function fetchUsers() {
    try {
        const res = await fetch('/admin/users');
        const users = await res.json();
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const isVerified = !!user.is_verified;
            const verifiedLabel = isVerified ? 'Yes' : 'No';
            const verifiedAt = user.verified_at ? new Date(user.verified_at).toLocaleString() : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.id}</td>
                <td>${user.first_name}</td>
                <td>${user.last_name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${new Date(user.created_at).toLocaleString()}</td>
                <td>${verifiedLabel}</td>
                <td>${verifiedAt}</td>
                <td>
                    <button class="ban-user-btn" data-userid="${user.id}" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Ban</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        // Add event listeners for ban only
        tbody.querySelectorAll('.ban-user-btn').forEach(btn => {
            btn.onclick = async function() {
                if (confirm('Are you sure you want to ban this user?')) {
                    const userId = btn.getAttribute('data-userid');
                    const res = await fetch('/admin/ban-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: userId })
                    });
                    const result = await res.json();
                    alert(result.message || 'User banned');
                    window.location.reload(); // Auto refresh page after banning
                }
            };
        });
    } catch (err) {
        console.error('Fetch users failed', err);
    }
}

// ---------------- FETCH BANNED USERS ----------------
async function fetchBannedUsers() {
    try {
        const res = await fetch('/admin/banned-users');
        const users = await res.json();
        const tbody = document.querySelector('#bannedUsersTable tbody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.id}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${new Date(user.banned_at).toLocaleString()}</td>
                <td><button class="unban-user-btn" data-id="${user.id}" data-email="${user.email}" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Unban</button></td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.unban-user-btn').forEach(btn => {
            btn.onclick = async function() {
                if (confirm('Unban this user?')) {
                    const id = btn.getAttribute('data-id');
                    const email = btn.getAttribute('data-email');
                    await fetch('/admin/unban-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    await fetch('/admin/unban-user-soft', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    alert('User unbanned');
                    fetchBannedUsers();
                    fetchUsers();
                }
            };
        });
    } catch (err) {
        console.error('Fetch banned users failed', err);
    }
}

// Call fetchBannedUsers on DOM ready

document.addEventListener('DOMContentLoaded', function () {
    fetchBannedUsers();
});

// ----------- PASSWORD RESET REQUESTS -----------
async function fetchPwResetRequests() {
    try {
        const res = await fetch('/admin/password-reset-requests');
        const requests = await res.json();
        const tbody = document.querySelector('#pwResetRequestsTable tbody');
        tbody.innerHTML = '';
        let hasPending = false;
        for (const req of requests) {
            if (req.status === 'pending') hasPending = true;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${req.user_id || '-'}</td>
                <td>${req.email}</td>
                <td><span style="font-weight:600; color:${req.is_answer_correct ? '#27ae60' : '#e74c3c'};">${req.is_answer_correct ? 'Yes' : 'No'}</span></td>
                <td>${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</td>
                <td>
                    ${req.status === 'pending' ? `<button class="approve-pw-btn" data-id="${req.id}" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;margin-right:6px;">Approve</button>
                    <button class="reject-pw-btn" data-id="${req.id}" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Reject</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        }
        // Animate button if pending
        const btn = document.getElementById('pw-reset-requests-btn');
        if (btn) {
            if (hasPending) {
                btn.classList.add('urgent-animate');
            } else {
                btn.classList.remove('urgent-animate');
            }
        }
        // Add event listeners for approve/reject
        document.querySelectorAll('.approve-pw-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Approve this password reset?')) return;
                await fetch(`/admin/password-reset-requests/${id}/approve`, { method: 'POST' });
                fetchPwResetRequests();
            };
        });
        document.querySelectorAll('.reject-pw-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Reject this password reset?')) return;
                await fetch(`/admin/password-reset-requests/${id}/reject`, { method: 'POST' });
                fetchPwResetRequests();
            };
        });
    } catch (err) {
        console.error('Fetch password reset requests failed', err);
    }
}

// ----------- VERIFIED SELLER REQUESTS -----------
async function fetchVerificationRequests() {
    try {
        const res = await fetch('/admin/verification/requests');
        const requests = await res.json();
        const tbody = document.querySelector('#verificationRequestsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let hasPending = false;
        requests.forEach(req => {
            if (req.status === 'pending') hasPending = true;
            const docs = [];
            if (req.id_doc_url) docs.push(`<a href="/${req.id_doc_url}" target="_blank">ID</a>`);
            if (req.selfie_url) docs.push(`<a href="/${req.selfie_url}" target="_blank">Selfie</a>`);
            if (req.address_doc_url) docs.push(`<a href="/${req.address_doc_url}" target="_blank">Address</a>`);
            const docsHtml = docs.length ? docs.join(' | ') : '-';
            const userLabel = `${req.first_name || ''} ${req.last_name || ''}`.trim() || `User #${req.user_id}`;
            const statusLabel = req.status ? req.status.charAt(0).toUpperCase() + req.status.slice(1) : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${req.id}</td>
                <td>${userLabel}</td>
                <td>${req.email || '-'}</td>
                <td>${req.id_type || '-'}</td>
                <td>${req.id_number || '-'}</td>
                <td>${docsHtml}</td>
                <td>${statusLabel}</td>
                <td>
                    ${req.status === 'pending' ? `
                        <button class="approve-verify-btn" data-id="${req.id}" style="background:#16a34a;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;margin-right:6px;">Approve</button>
                        <button class="reject-verify-btn" data-id="${req.id}" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Reject</button>
                    ` : '-'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        const btn = document.getElementById('verification-requests-btn');
        if (btn) {
            if (hasPending) {
                btn.classList.add('urgent-animate');
            } else {
                btn.classList.remove('urgent-animate');
            }
        }

        tbody.querySelectorAll('.approve-verify-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Approve this verified seller request?')) return;
                const note = prompt('Admin note (optional):') || '';
                await fetch(`/admin/verification/requests/${id}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_note: note })
                });
                fetchVerificationRequests();
            };
        });
        tbody.querySelectorAll('.reject-verify-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Reject this verified seller request?')) return;
                const note = prompt('Rejection note (optional):') || '';
                await fetch(`/admin/verification/requests/${id}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_note: note })
                });
                fetchVerificationRequests();
            };
        });
    } catch (err) {
        console.error('Fetch verification requests failed', err);
    }
}

// ----------- CHAT REQUESTS -----------
async function fetchChatRequests() {
    try {
        const res = await fetch('/admin/chat-requests');
        const requests = await res.json();
        const tbody = document.querySelector('#chatRequestsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        let hasPending = false;
        requests.forEach(req => {
            if (req.status === 'pending_admin') hasPending = true;
            const carLabel = `${req.make || ''} ${req.model || ''} (${req.year || '-'})`.trim();
            const buyerLabel = `${req.buyer_first_name || ''} ${req.buyer_last_name || ''}`.trim() || req.buyer_email || `User #${req.buyer_id}`;
            const sellerLabel = `${req.seller_first_name || ''} ${req.seller_last_name || ''}`.trim() || req.seller_email || `User #${req.seller_id}`;
            const statusLabel = req.status ? req.status.replace(/_/g, ' ') : '-';
            const created = req.created_at ? new Date(req.created_at).toLocaleString() : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${req.id}</td>
                <td>${carLabel}</td>
                <td>${buyerLabel}</td>
                <td>${sellerLabel}</td>
                <td>${statusLabel}</td>
                <td>${created}</td>
                <td>
                    ${req.status === 'pending_admin' ? `
                        <button class="approve-chat-btn" data-id="${req.id}" style="background:#0f766e;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;margin-right:6px;">Approve</button>
                        <button class="reject-chat-btn" data-id="${req.id}" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Reject</button>
                    ` : '-'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        const btn = document.getElementById('chat-requests-btn');
        if (btn) {
            if (hasPending) {
                btn.classList.add('urgent-animate');
            } else {
                btn.classList.remove('urgent-animate');
            }
        }

        tbody.querySelectorAll('.approve-chat-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Approve this chat request?')) return;
                const note = prompt('Admin note (optional):') || '';
                await fetch(`/admin/chat-requests/${id}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_note: note })
                });
                fetchChatRequests();
            };
        });
        tbody.querySelectorAll('.reject-chat-btn').forEach(btn => {
            btn.onclick = async function() {
                const id = btn.getAttribute('data-id');
                if (!confirm('Reject this chat request?')) return;
                const note = prompt('Rejection note (optional):') || '';
                await fetch(`/admin/chat-requests/${id}/reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_note: note })
                });
                fetchChatRequests();
            };
        });
    } catch (err) {
        console.error('Fetch chat requests failed', err);
    }
}

// Button click to show/hide section
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('pw-reset-requests-btn');
    const section = document.getElementById('pwResetRequestsSection');
    if (btn && section) {
        btn.addEventListener('click', function() {
            const isOpen = section.classList.contains('open');
            if (isOpen) {
                section.classList.remove('open');
                section.setAttribute('aria-hidden', 'true');
                btn.classList.remove('active-pw-btn');
            } else {
                section.classList.add('open');
                section.setAttribute('aria-hidden', 'false');
                fetchPwResetRequests();
                btn.classList.add('active-pw-btn');
            }
        });
    }
    // Initial fetch to animate button if needed
    fetchPwResetRequests();
});

document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('verification-requests-btn');
    const section = document.getElementById('verificationRequestsSection');
    if (btn && section) {
        btn.addEventListener('click', function() {
            const isOpen = section.classList.contains('open');
            if (isOpen) {
                section.classList.remove('open');
                section.setAttribute('aria-hidden', 'true');
                btn.classList.remove('active-verify-btn');
            } else {
                section.classList.add('open');
                section.setAttribute('aria-hidden', 'false');
                fetchVerificationRequests();
                btn.classList.add('active-verify-btn');
            }
        });
    }
    fetchVerificationRequests();
});

document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('chat-requests-btn');
    const section = document.getElementById('chatRequestsSection');
    if (btn && section) {
        btn.addEventListener('click', function() {
            const isOpen = section.classList.contains('open');
            if (isOpen) {
                section.classList.remove('open');
                section.setAttribute('aria-hidden', 'true');
                btn.classList.remove('active-chat-btn');
            } else {
                section.classList.add('open');
                section.setAttribute('aria-hidden', 'false');
                fetchChatRequests();
                btn.classList.add('active-chat-btn');
            }
        });
    }
    fetchChatRequests();
});

document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('customer-offers-btn');
    const section = document.getElementById('customerOffersSection');
    if (btn && section) {
        btn.addEventListener('click', function() {
            const isOpen = section.classList.contains('open');
            if (isOpen) {
                section.classList.remove('open');
                section.setAttribute('aria-hidden', 'true');
                btn.classList.remove('active-customer-offers-btn');
            } else {
                section.classList.add('open');
                section.setAttribute('aria-hidden', 'false');
                if (typeof window.fetchCustomerOffers === 'function') {
                    window.fetchCustomerOffers();
                }
                btn.classList.add('active-customer-offers-btn');
            }
        });
    }
});

// Add style for active button
const pwBtnActiveStyle = document.createElement('style');
pwBtnActiveStyle.innerHTML = `
#pw-reset-requests-btn.active-pw-btn {
    background: linear-gradient(90deg, #e67e22 0%, #f6b93b 100%) !important;
    color: #fff !important;
    box-shadow: 0 0 0 4px #f6b93b40, 0 2px 8px rgba(230,126,34,0.12);
}
#verification-requests-btn.active-verify-btn {
    background: linear-gradient(90deg, #16a34a 0%, #22c55e 100%) !important;
    color: #fff !important;
    box-shadow: 0 0 0 4px #86efac40, 0 2px 8px rgba(22,163,74,0.16);
}
#chat-requests-btn.active-chat-btn {
    background: linear-gradient(90deg, #0f766e 0%, #14b8a6 100%) !important;
    color: #fff !important;
    box-shadow: 0 0 0 4px #5eead440, 0 2px 8px rgba(15,118,110,0.16);
}
#customer-offers-btn.active-customer-offers-btn {
    background: linear-gradient(90deg, #1e40af 0%, #0ea5e9 100%) !important;
    color: #fff !important;
    box-shadow: 0 0 0 4px #60a5fa40, 0 2px 8px rgba(45,108,223,0.16);
}`;
document.head.appendChild(pwBtnActiveStyle);

// Add urgent-animate CSS
const urgentStyle = document.createElement('style');
urgentStyle.innerHTML = `
.urgent-animate {
    animation: urgentPulse 1s infinite alternate;
    box-shadow: 0 0 0 4px #e67e2240, 0 2px 8px rgba(230,126,34,0.12);
}
@keyframes urgentPulse {
    0% { background: #e67e22; }
    100% { background: #e74c3c; }
}`;
document.head.appendChild(urgentStyle);

// ---------------- DOM READY ----------------

document.addEventListener('DOMContentLoaded', function () {
    // --- Car Offers Section Logic ---
    const carOfferSelect = document.getElementById('carOfferSelect');
    const carOfferText = document.getElementById('carOfferText');
    const carOfferDiscountType = document.getElementById('carOfferDiscountType');
    const carOfferDiscountValue = document.getElementById('carOfferDiscountValue');
    const carOfferPreviewPrice = document.getElementById('carOfferPreviewPrice');
    const carOfferValidFrom = document.getElementById('carOfferValidFrom');
    const carOfferValidTo = document.getElementById('carOfferValidTo');
    const carOfferIdInput = document.getElementById('carOfferId');
    const carOfferSubmitBtn = document.getElementById('carOfferSubmitBtn');
    const addCarOfferForm = document.getElementById('addCarOfferForm');
    let carList = [];
    let currentOffersCache = [];
    async function fetchCarsForOffers() {
        try {
            const res = await fetch('/admin/cars');
            carList = await res.json();
            if (carOfferSelect) {
                carOfferSelect.innerHTML = '<option value="">Select a car...</option>';
                carList.forEach(car => {
                    carOfferSelect.innerHTML += `<option value="${car.id}">${car.make} ${car.model} (${car.year}) - ₹${Number(car.price || 0).toLocaleString('en-IN')}</option>`;
                });
            }
        } catch (err) {
            if (carOfferSelect) carOfferSelect.innerHTML = '<option value="">Error loading cars</option>';
        }
    }
    function computeDiscountedPrice(price, type, value) {
        const base = Number(price || 0);
        if (!Number.isFinite(base)) return null;
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return null;
        if (type === 'percent') {
            const pct = Math.max(0, Math.min(numericValue, 100));
            return Math.max(0, Math.round((base - (base * pct / 100)) * 100) / 100);
        }
        return Math.max(0, Math.round((base - Math.max(0, numericValue)) * 100) / 100);
    }

    function updateCarOfferPreview() {
        const selectedId = carOfferSelect ? carOfferSelect.value : '';
        const car = carList.find(c => c.id == selectedId);
        const discountType = carOfferDiscountType ? carOfferDiscountType.value : 'percent';
        const discountValue = carOfferDiscountValue ? carOfferDiscountValue.value : '';
        const validFrom = carOfferValidFrom ? carOfferValidFrom.value : '';
        const validTo = carOfferValidTo ? carOfferValidTo.value : '';
        let dateMsg = '';
        if (validFrom && validTo) dateMsg = ` (Valid: ${validFrom} to ${validTo})`;
        else if (validFrom) dateMsg = ` (Valid from: ${validFrom})`;
        else if (validTo) dateMsg = ` (Valid until: ${validTo})`;

        if (!car) {
            if (carOfferText) carOfferText.value = '';
            if (carOfferPreviewPrice) carOfferPreviewPrice.textContent = 'Select a car to preview';
            return;
        }
        const basePrice = Number(car.price || 0);
        const discountedPrice = computeDiscountedPrice(basePrice, discountType, discountValue);
        const formattedBase = formatMoney(basePrice);
        const formattedDiscounted = discountedPrice != null ? formatMoney(discountedPrice) : '--';
        if (carOfferPreviewPrice) {
            carOfferPreviewPrice.textContent = discountedPrice != null
                ? `${formattedDiscounted} (MRP ${formattedBase})`
                : `MRP ${formattedBase}`;
        }
        if (carOfferText) {
            const priceText = discountedPrice != null
                ? `${formattedDiscounted} (MRP ${formattedBase})`
                : formattedBase;
            carOfferText.value = `Subscriber Deal: ${car.make} ${car.model} (${car.year}) now ${priceText}.${dateMsg}`;
        }
    }

    if (carOfferSelect) carOfferSelect.addEventListener('change', updateCarOfferPreview);
    if (carOfferDiscountType) carOfferDiscountType.addEventListener('change', updateCarOfferPreview);
    if (carOfferDiscountValue) carOfferDiscountValue.addEventListener('input', updateCarOfferPreview);
    if (carOfferValidFrom) carOfferValidFrom.addEventListener('change', updateCarOfferPreview);
    if (carOfferValidTo) carOfferValidTo.addEventListener('change', updateCarOfferPreview);

    if (addCarOfferForm) {
        addCarOfferForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const selectedId = carOfferSelect ? carOfferSelect.value : '';
            const car = carList.find(c => c.id == selectedId);
            if (!car) return alert('Please select a car.');
            const discountType = carOfferDiscountType ? carOfferDiscountType.value : '';
            const discountValue = carOfferDiscountValue ? Number(carOfferDiscountValue.value) : NaN;
            if (!discountType || !Number.isFinite(discountValue)) {
                return alert('Please enter a valid discount.');
            }
            const validFrom = carOfferValidFrom ? carOfferValidFrom.value : null;
            const validTo = carOfferValidTo ? carOfferValidTo.value : null;
            if (validFrom && validTo && validFrom > validTo) {
                alert('Valid From date cannot be after Valid To date.');
                return;
            }
            if (validTo && validTo < new Date().toISOString().slice(0,10)) {
                alert('Valid To date cannot be in the past.');
                return;
            }
            const payload = {
                car_id: selectedId,
                discount_type: discountType,
                discount_value: discountValue,
                valid_from: validFrom,
                valid_to: validTo,
                text: carOfferText ? carOfferText.value : ''
            };
            const editId = carOfferIdInput && carOfferIdInput.value ? carOfferIdInput.value : null;
            const endpoint = editId ? `/admin/offers/${editId}` : '/admin/offers';
            const method = editId ? 'PUT' : 'POST';
            try {
                const res = await fetch(endpoint, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    addCarOfferForm.reset();
                    if (carOfferText) carOfferText.value = '';
                    if (carOfferIdInput) carOfferIdInput.value = '';
                    if (carOfferSubmitBtn) carOfferSubmitBtn.textContent = 'Save Offer';
                    updateCarOfferPreview();
                    fetchOffers();
                } else {
                    alert(data.message || 'Failed to save offer');
                }
            } catch (err) {
                alert('Server error while saving offer');
            }
        });
    }

    const customerOffersTableBody = document.querySelector('#customerOffersTable tbody');
    const customerOffersStatusFilter = document.getElementById('customerOffersStatusFilter');
    const refreshCustomerOffersBtn = document.getElementById('refreshCustomerOffersBtn');
    const carQueriesList = document.getElementById('carQueriesList');
    const featuredCarsList = document.getElementById('featuredCarsList');
    const featuredCarsSearch = document.getElementById('featuredCarsSearch');
    const refreshFeaturedCars = document.getElementById('refreshFeaturedCars');
    let featuredCarsCache = [];
    const counterOfferModal = document.getElementById('counterOfferModal');
    const counterOfferTitle = document.getElementById('counterOfferTitle');
    const counterOfferSubtitle = document.getElementById('counterOfferSubtitle');
    const counterOfferSummary = document.getElementById('counterOfferSummary');
    const counterOfferPrice = document.getElementById('counterOfferPrice');
    const counterOfferMessage = document.getElementById('counterOfferMessage');
    const counterPriceField = document.getElementById('counterPriceField');
    const counterOfferSend = document.getElementById('counterOfferSend');
    const counterOfferCancel = document.getElementById('counterOfferCancel');
    const counterOfferClose = document.getElementById('counterOfferClose');
    let counterOfferContext = null;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatMoney(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '-';
        return `₹${num.toLocaleString('en-IN')}`;
    }

    function openCounterOfferModal(context) {
        if (!counterOfferModal) return;
        counterOfferContext = context;
        const action = context.action;
        const carLabel = context.carLabel || 'Customer Offer';
        const listed = context.listed ? formatMoney(context.listed) : '-';
        const offered = context.offered ? formatMoney(context.offered) : '-';

        if (counterOfferTitle) {
            counterOfferTitle.textContent = action === 'accept'
                ? 'Accept Customer Offer'
                : action === 'reject'
                    ? 'Reject Customer Offer'
                    : 'Send Counter Offer';
        }
        if (counterOfferSubtitle) {
            counterOfferSubtitle.textContent = action === 'counter'
                ? 'Propose a new price and optionally add a note.'
                : 'Add a short note for the buyer before sending your response.';
        }
        if (counterOfferSummary) {
            counterOfferSummary.innerHTML = `
                <strong>${escapeHtml(carLabel)}</strong><br>
                Listed: ${escapeHtml(listed)} &nbsp;•&nbsp; Offered: ${escapeHtml(offered)}
            `;
        }
        if (counterPriceField) {
            counterPriceField.style.display = action === 'counter' ? '' : 'none';
        }
        if (counterOfferPrice) {
            counterOfferPrice.value = '';
        }
        if (counterOfferMessage) {
            counterOfferMessage.value =
                action === 'accept'
                    ? 'Your offer has been accepted. Proceed to purchase to complete checkout.'
                    : action === 'reject'
                        ? 'Your offer was rejected.'
                        : 'Admin sent a counter-offer.';
        }
        if (counterOfferSend) {
            counterOfferSend.textContent = action === 'counter' ? 'Send Counter' : 'Send Response';
        }
        counterOfferModal.classList.add('show');
        counterOfferModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
            if (action === 'counter' && counterOfferPrice) {
                counterOfferPrice.focus();
            } else if (counterOfferMessage) {
                counterOfferMessage.focus();
            }
        }, 10);
    }

    function closeCounterOfferModal() {
        if (!counterOfferModal) return;
        counterOfferModal.classList.remove('show');
        counterOfferModal.setAttribute('aria-hidden', 'true');
        counterOfferContext = null;
    }

    async function respondToCustomerOffer(offerId, action, payload = {}) {
        const response_message = payload.response_message || '';
        const counter_price = payload.counter_price ?? null;

        try {
            const res = await fetch(`/admin/customer-offers/${offerId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    response_message: response_message || null,
                    counter_price
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Failed to update customer offer.');
                return;
            }
            alert(data.message || 'Customer offer updated.');
            fetchCustomerOffers();
        } catch (err) {
            alert('Server error while updating customer offer.');
        }
    }

    async function fetchCustomerOffers() {
        if (!customerOffersTableBody) return;
        customerOffersTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#64748b;">Loading...</td></tr>';
        try {
            const params = new URLSearchParams();
            if (customerOffersStatusFilter && customerOffersStatusFilter.value) {
                params.set('status', customerOffersStatusFilter.value);
            }
            const url = params.toString() ? `/admin/customer-offers?${params.toString()}` : '/admin/customer-offers';
            const res = await fetch(url);
            const offers = await res.json();
            if (!res.ok) throw new Error(offers.message || 'Failed to fetch customer offers.');

            if (!offers.length) {
                customerOffersTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#64748b;">No customer offers found.</td></tr>';
                return;
            }

            customerOffersTableBody.innerHTML = '';
            offers.forEach(offer => {
                const buyerName = `${offer.first_name || ''} ${offer.last_name || ''}`.trim() || offer.email || `User #${offer.user_id}`;
                const carLabel = `${offer.make || ''} ${offer.model || ''} (${offer.year || '-'})`;
                const isActionable = offer.status === 'pending' || offer.status === 'countered';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${offer.id}</td>
                    <td>${escapeHtml(carLabel)}</td>
                    <td>${escapeHtml(buyerName)}<br><small>${escapeHtml(offer.email || '')}</small></td>
                    <td>${formatMoney(offer.listed_price)}</td>
                    <td>${formatMoney(offer.offered_price)}</td>
                    <td>${offer.counter_price ? formatMoney(offer.counter_price) : '-'}</td>
                    <td style="font-weight:700; text-transform:capitalize;">${escapeHtml(offer.status)}</td>
                    <td>
                        <div><b>User:</b> ${escapeHtml(offer.user_message || '-')}</div>
                        <div><b>Admin:</b> ${escapeHtml(offer.admin_response || '-')}</div>
                    </td>
                    <td>
                        ${isActionable ? `
                            <button class="co-accept" data-id="${offer.id}" data-car="${escapeHtml(carLabel)}" data-listed="${offer.listed_price}" data-offered="${offer.offered_price}">Accept</button>
                            <button class="co-counter" data-id="${offer.id}" data-car="${escapeHtml(carLabel)}" data-listed="${offer.listed_price}" data-offered="${offer.offered_price}">Counter</button>
                            <button class="co-reject" data-id="${offer.id}" data-car="${escapeHtml(carLabel)}" data-listed="${offer.listed_price}" data-offered="${offer.offered_price}">Reject</button>
                        ` : '-'}
                    </td>
                `;
                customerOffersTableBody.appendChild(tr);
            });
        } catch (err) {
            customerOffersTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#dc2626;">${escapeHtml(err.message || 'Failed to load customer offers.')}</td></tr>`;
        }
    }
    window.fetchCustomerOffers = fetchCustomerOffers;

    if (counterOfferModal) {
        counterOfferModal.addEventListener('click', function(e) {
            if (e.target === counterOfferModal) closeCounterOfferModal();
        });
    }
    if (counterOfferCancel) counterOfferCancel.addEventListener('click', closeCounterOfferModal);
    if (counterOfferClose) counterOfferClose.addEventListener('click', closeCounterOfferModal);
    if (counterOfferSend) {
        counterOfferSend.addEventListener('click', async function() {
            if (!counterOfferContext) return;
            const action = counterOfferContext.action;
            const offerId = counterOfferContext.offerId;
            let counterPriceValue = null;
            if (action === 'counter') {
                const parsed = Number(counterOfferPrice?.value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    alert('Please enter a valid counter price.');
                    return;
                }
                counterPriceValue = parsed;
            }
            const message = counterOfferMessage ? counterOfferMessage.value.trim() : '';
            closeCounterOfferModal();
            await respondToCustomerOffer(offerId, action, {
                response_message: message || null,
                counter_price: counterPriceValue
            });
        });
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && counterOfferModal && counterOfferModal.classList.contains('show')) {
            closeCounterOfferModal();
        }
    });

    async function fetchCarQueries() {
        if (!carQueriesList) return;
        carQueriesList.innerHTML = '<div class="queries-empty">Loading...</div>';
        try {
            const res = await fetch('/admin/car-queries');
            const queries = await res.json();
            if (!res.ok) throw new Error(queries.message || 'Failed to load queries.');
            if (!queries.length) {
                carQueriesList.innerHTML = '<div class="queries-empty">No queries yet.</div>';
                return;
            }
            carQueriesList.innerHTML = '';
            queries.forEach(q => {
                const carLabel = `${q.make || ''} ${q.model || ''} (${q.year || '-'})`.trim() || `Car #${q.car_id}`;
                const imageUrl = (() => {
                    if (q.image_url) {
                        if (q.image_url.startsWith('http') || q.image_url.startsWith('/')) return q.image_url;
                        return `/${q.image_url}`;
                    }
                    const makeKey = (q.make || '')
                        .replace(/[^a-zA-Z0-9]+/g, '')
                        .trim();
                    const modelKey = (q.model || '')
                        .replace(/[^a-zA-Z0-9]+/g, ' ')
                        .trim()
                        .replace(/\s+/g, '_');
                    if (makeKey && modelKey) {
                        return `/images/cars/${makeKey}_${modelKey}.jpg`;
                    }
                    return '/images/cars/about.jpg';
                })();
                const status = (q.status || 'pending').toLowerCase();
                const card = document.createElement('div');
                card.className = 'query-card';
                card.innerHTML = `
                    <div class="query-card-header">
                        <img class="query-car-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(carLabel)}">
                        <div class="query-car-info">
                            <div class="query-car-title">${escapeHtml(carLabel)}</div>
                            <div class="query-meta">
                                <span class="query-badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
                                <span>${escapeHtml(q.user_email || 'Unknown')}</span>
                                <span>${new Date(q.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="query-card-body">
                        <div class="query-section">
                            <h4>Subject</h4>
                            <p>${escapeHtml(q.subject || '-')}</p>
                        </div>
                        <div class="query-section">
                            <h4>Message</h4>
                            <p>${escapeHtml(q.message || '-')}</p>
                        </div>
                        <div class="query-section query-response">
                            <h4>Admin Response</h4>
                            <textarea data-response-id="${q.id}" placeholder="Type a detailed response...">${escapeHtml(q.admin_response || '')}</textarea>
                            <div class="query-actions">
                                <button class="query-respond" data-id="${q.id}">Respond</button>
                                <button class="query-close" data-id="${q.id}">Close</button>
                            </div>
                        </div>
                    </div>
                `;
                carQueriesList.appendChild(card);
            });
        } catch (err) {
            carQueriesList.innerHTML = `<div class="queries-empty" style="color:#dc2626;">${escapeHtml(err.message || 'Failed to load queries.')}</div>`;
        }
    }

    function getFeaturedSearchTerm() {
        return featuredCarsSearch ? featuredCarsSearch.value.trim().toLowerCase() : '';
    }

    function renderFeaturedCars() {
        if (!featuredCarsList) return;
        const term = getFeaturedSearchTerm();
        const filteredCars = term
            ? featuredCarsCache.filter(car => {
                const haystack = `${car.make || ''} ${car.model || ''} ${car.year || ''} ${car.type || ''} ${car.price || ''}`
                    .toLowerCase();
                return haystack.includes(term);
            })
            : featuredCarsCache.slice();

        if (!filteredCars.length) {
            featuredCarsList.innerHTML = '<div class="queries-empty" style="grid-column: 1 / -1;">No cars match your search.</div>';
            return;
        }

        featuredCarsList.innerHTML = '';
        filteredCars.forEach(car => {
            const title = `${car.make || ''} ${car.model || ''} (${car.year || '-'})`.trim();
            const imageUrl = car.image_url ? (car.image_url.startsWith('/') || car.image_url.startsWith('http') ? car.image_url : `/${car.image_url}`) : 'images/cars/about.jpg';
            const card = document.createElement('div');
            card.className = 'featured-admin-card';
            const isOn = Number(car.featured) === 1;
            card.innerHTML = `
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}">
                <div class="featured-admin-meta">
                    <h4>${escapeHtml(title)}</h4>
                    <p>Price: ${formatMoney(car.price)} - ${escapeHtml(car.type || 'N/A')}</p>
                </div>
                <button class="featured-toggle-btn ${isOn ? 'on' : 'off'}" data-id="${car.id}" data-featured="${isOn ? '1' : '0'}">
                    ${isOn ? 'Featured' : 'Not Featured'}
                </button>
            `;
            featuredCarsList.appendChild(card);
        });
    }

    async function fetchFeaturedCars() {
        if (!featuredCarsList) return;
        featuredCarsList.textContent = 'Loading featured cars...';
        try {
            const res = await fetch('/admin/cars/all');
            const cars = await res.json();
            if (!res.ok) throw new Error(cars.message || 'Failed to load cars.');
            if (!cars.length) {
                featuredCarsCache = [];
                featuredCarsList.textContent = 'No cars found.';
                return;
            }
            featuredCarsCache = cars;
            renderFeaturedCars();
        } catch (err) {
            featuredCarsList.textContent = err.message || 'Failed to load cars.';
        }
    }
    if (refreshCustomerOffersBtn) {
        refreshCustomerOffersBtn.addEventListener('click', fetchCustomerOffers);
    }
    if (refreshFeaturedCars) {
        refreshFeaturedCars.addEventListener('click', fetchFeaturedCars);
    }
    if (featuredCarsSearch) {
        featuredCarsSearch.addEventListener('input', renderFeaturedCars);
    }
    if (customerOffersStatusFilter) {
        customerOffersStatusFilter.addEventListener('change', fetchCustomerOffers);
    }
    if (customerOffersTableBody) {
        customerOffersTableBody.addEventListener('click', function(e) {
            const offerId = e.target && e.target.getAttribute ? e.target.getAttribute('data-id') : null;
            if (!offerId) return;
            if (e.target.classList.contains('co-accept')) {
                openCounterOfferModal({
                    action: 'accept',
                    offerId,
                    carLabel: e.target.getAttribute('data-car') || '',
                    listed: e.target.getAttribute('data-listed') || '',
                    offered: e.target.getAttribute('data-offered') || ''
                });
            } else if (e.target.classList.contains('co-counter')) {
                openCounterOfferModal({
                    action: 'counter',
                    offerId,
                    carLabel: e.target.getAttribute('data-car') || '',
                    listed: e.target.getAttribute('data-listed') || '',
                    offered: e.target.getAttribute('data-offered') || ''
                });
            } else if (e.target.classList.contains('co-reject')) {
                openCounterOfferModal({
                    action: 'reject',
                    offerId,
                    carLabel: e.target.getAttribute('data-car') || '',
                    listed: e.target.getAttribute('data-listed') || '',
                    offered: e.target.getAttribute('data-offered') || ''
                });
            }
        });
    }

    if (carQueriesList) {
        carQueriesList.addEventListener('click', async function(e) {
            const id = e.target && e.target.getAttribute ? e.target.getAttribute('data-id') : null;
            if (!id) return;
            const card = e.target.closest('.query-card');
            const responseTextarea = card ? card.querySelector(`textarea[data-response-id="${id}"]`) : null;
            const responseText = responseTextarea ? responseTextarea.value.trim() : '';
            if (e.target.classList.contains('query-respond')) {
                if (!responseText) {
                    alert('Please enter a response before sending.');
                    return;
                }
                try {
                    const res = await fetch(`/admin/car-queries/${id}/respond`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ response: responseText, status: 'responded' })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Failed to respond.');
                    fetchCarQueries();
                } catch (err) {
                    alert(err.message || 'Failed to respond.');
                }
            }
            if (e.target.classList.contains('query-close')) {
                if (!responseText) {
                    alert('Please enter a response before closing.');
                    return;
                }
                try {
                    const res = await fetch(`/admin/car-queries/${id}/respond`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ response: responseText, status: 'closed' })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Failed to close.');
                    fetchCarQueries();
                } catch (err) {
                    alert(err.message || 'Failed to close.');
                }
            }
        });
    }

    if (featuredCarsList) {
        featuredCarsList.addEventListener('click', async function(e) {
            if (!e.target.classList.contains('featured-toggle-btn')) return;
            const carId = e.target.getAttribute('data-id');
            const current = e.target.getAttribute('data-featured') === '1';
            try {
                const res = await fetch(`/admin/cars/${carId}/feature`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ featured: !current })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed to update feature flag.');
                fetchFeaturedCars();
            } catch (err) {
                alert(err.message || 'Failed to update feature flag.');
            }
        });
    }

    fetchFeaturedCars();

    // Only fetch cars when offers section is shown
    const origShowAdminSection = showAdminSection;
    window.showAdminSection = function(section) {
        origShowAdminSection(section);
        if (section === 'offers') {
            fetchCarsForOffers();
        }
    }

    // Add buttons to switch to newsletter and offers sections
    const nav = document.querySelector('nav');
    if (nav) {
        if (!document.getElementById('newsletterTab')) {
            const newsletterBtn = document.createElement('a');
            newsletterBtn.href = '#';
            newsletterBtn.id = 'newsletterTab';
            newsletterBtn.textContent = 'Newsletter';
            newsletterBtn.style.marginLeft = '10px';
            nav.appendChild(newsletterBtn);
            newsletterBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showAdminSection('newsletter');
                fetchNewsletterSubscribers();
            });
        }
        if (!document.getElementById('offersTab')) {
            const offersBtn = document.createElement('a');
            offersBtn.href = '#';
            offersBtn.id = 'offersTab';
            offersBtn.textContent = 'Offers';
            offersBtn.style.marginLeft = '10px';
            nav.appendChild(offersBtn);
            offersBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showAdminSection('offers');
                fetchOffers();
            });
        }
        if (!document.getElementById('queriesTab')) {
            const queriesBtn = document.createElement('a');
            queriesBtn.href = '#';
            queriesBtn.id = 'queriesTab';
            queriesBtn.textContent = 'Queries';
            queriesBtn.style.marginLeft = '10px';
            nav.appendChild(queriesBtn);
            queriesBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showAdminSection('queries');
                fetchCarQueries();
            });
        }
    }
    // Offer form submit
    const addOfferForm = document.getElementById('addOfferForm');
    if (addOfferForm) {
        addOfferForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const offerText = addOfferForm.offerText.value.trim();
            if (!offerText) return alert('Offer text required');
            const validFrom = document.getElementById('offerValidFrom').value || null;
            const validTo = document.getElementById('offerValidTo').value || null;
            // Date validation
            if (validFrom && validTo && validFrom > validTo) {
                alert('Valid From date cannot be after Valid To date.');
                return;
            }
            if (validTo && validTo < new Date().toISOString().slice(0,10)) {
                alert('Valid To date cannot be in the past.');
                return;
            }
            try {
                const res = await fetch('/admin/offers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: offerText, valid_from: validFrom, valid_to: validTo })
                });
                if (res.ok) {
                    addOfferForm.reset();
                    fetchOffers();
                } else {
                    const data = await res.json();
                    alert(data.message || 'Failed to add offer');
                }
            } catch (err) {
                alert('Server error while adding offer');
            }
        });
    }
// Fetch offers for admin table
async function fetchOffers() {
    try {
        const res = await fetch('/admin/offers');
        const offers = await res.json();
        currentOffersCache = Array.isArray(offers) ? offers : [];
        const tbody = document.querySelector('#offersTable tbody');
        tbody.innerHTML = '';
        currentOffersCache.forEach(offer => {
            const tr = document.createElement('tr');
            const validity = offer.valid_from || offer.valid_to
                ? `${offer.valid_from || 'Now'} → ${offer.valid_to || 'Open'}`
                : 'Always';
            const carLabel = offer.make ? `${offer.make} ${offer.model} (${offer.year})` : 'Notification';
            const discountLabel = offer.discount_type
                ? `${offer.discount_type === 'percent' ? `${offer.discount_value}%` : `₹${Number(offer.discount_value || 0).toLocaleString('en-IN')}`}`
                : '--';
            const finalPrice = offer.discounted_price
                ? `₹${Number(offer.discounted_price || 0).toLocaleString('en-IN')}`
                : '--';
            tr.innerHTML = `
                <td>${offer.id}</td>
                <td>${carLabel}</td>
                <td>${discountLabel}</td>
                <td>${finalPrice}</td>
                <td>${validity}</td>
                <td>${new Date(offer.created_at).toLocaleString()}</td>
                <td>
                    <button class="edit-offer-btn" data-offer-id="${offer.id}" style="background:#1d4ed8;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-weight:600;cursor:pointer;margin-right:6px;">Edit</button>
                    <button class="remove-offer-btn" data-offer-id="${offer.id}" style="background:#e74c3c;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-weight:600;cursor:pointer;">Remove</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        // Add event listeners for remove buttons
        tbody.querySelectorAll('.remove-offer-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const offerId = this.getAttribute('data-offer-id');
                if (!confirm('Are you sure you want to remove this offer?')) return;
                try {
                    const res = await fetch(`/admin/offers/${offerId}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok) {
                        fetchOffers();
                    } else {
                        alert(data.message || 'Failed to remove offer');
                    }
                } catch (err) {
                    alert('Server error while removing offer');
                }
            });
        });
        tbody.querySelectorAll('.edit-offer-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const offerId = this.getAttribute('data-offer-id');
                const offer = currentOffersCache.find(item => String(item.id) === String(offerId));
                if (!offer) return;
                if (carOfferSelect) carOfferSelect.value = offer.car_id || '';
                if (carOfferDiscountType && offer.discount_type) carOfferDiscountType.value = offer.discount_type;
                if (carOfferDiscountValue) carOfferDiscountValue.value = offer.discount_value || '';
                if (carOfferValidFrom) carOfferValidFrom.value = offer.valid_from || '';
                if (carOfferValidTo) carOfferValidTo.value = offer.valid_to || '';
                if (carOfferIdInput) carOfferIdInput.value = offer.id;
                if (carOfferSubmitBtn) carOfferSubmitBtn.textContent = 'Update Offer';
                updateCarOfferPreview();
                window.scrollTo({ top: addCarOfferForm ? addCarOfferForm.offsetTop - 120 : 0, behavior: 'smooth' });
            });
        });
    } catch (err) {
        console.error('Fetch offers failed', err);
    }
    // Fetch previous offers
    try {
        const resPrev = await fetch('/admin/previous-offers');
        const prevOffers = await resPrev.json();
        const prevTbody = document.querySelector('#previousOffersTable tbody');
        if (prevTbody) {
            prevTbody.innerHTML = '';
            prevOffers.forEach(offer => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${offer.id}</td>
                    <td>${offer.text}</td>
                    <td>${new Date(offer.created_at).toLocaleString()}</td>
                    <td>${new Date(offer.deleted_at).toLocaleString()}</td>
                `;
                prevTbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error('Fetch previous offers failed', err);
    }
}

    showAdminSection('dashboard');
    fetchUsers();

    const addCarForm = document.getElementById('addCarForm');

    if (addCarForm) {
        addCarForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const formData = new FormData(addCarForm);

            try {
                const res = await fetch('/admin/add-car', {
                    method: 'POST',
                    body: formData
                });

                const data = await res.json();

                if (res.ok) {
                    alert('Car added successfully!');
                    addCarForm.reset();
                } else {
                    alert(data.message || 'Failed to add car');
                }
            } catch (err) {
                console.error(err);
                alert('Server error while adding car');
            }
        });
    }

    const adminDirectMessageForm = document.getElementById('adminDirectMessageForm');
    const adminDirectMessageStatus = document.getElementById('adminDirectMessageStatus');
    const adminToast = document.getElementById('admin-toast');
    let adminToastTimer = null;

    function showAdminToast(message, type) {
        if (!adminToast) return;
        adminToast.textContent = message;
        adminToast.classList.remove('success', 'error', 'show');
        adminToast.classList.add(type === 'success' ? 'success' : 'error');
        adminToast.offsetHeight;
        adminToast.classList.add('show');
        if (adminToastTimer) clearTimeout(adminToastTimer);
        adminToastTimer = setTimeout(() => {
            adminToast.classList.remove('show');
        }, 2600);
    }

    if (adminDirectMessageForm) {
        adminDirectMessageForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('dmUserEmail').value.trim();
            const title = document.getElementById('dmTitle').value.trim();
            const message = document.getElementById('dmMessage').value.trim();
            const link = document.getElementById('dmLink').value.trim();

            if (!email || !title || !message) return;
            try {
                const res = await fetch('/admin/user-notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, title, message, link: link || null })
                });
                const data = await res.json();
                if (!res.ok) {
                    if (adminDirectMessageStatus) {
                        adminDirectMessageStatus.style.color = '#dc2626';
                        adminDirectMessageStatus.textContent = data.message || 'Failed to send message.';
                    }
                    showAdminToast(data.message || 'Failed to send message.', 'error');
                    return;
                }
                if (adminDirectMessageStatus) {
                    adminDirectMessageStatus.style.color = '#16a34a';
                    adminDirectMessageStatus.textContent = data.message || 'Message sent.';
                }
                showAdminToast(data.message || 'Message sent successfully.', 'success');
                adminDirectMessageForm.reset();
            } catch (err) {
                if (adminDirectMessageStatus) {
                    adminDirectMessageStatus.style.color = '#dc2626';
                    adminDirectMessageStatus.textContent = 'Server error while sending message.';
                }
                showAdminToast('Server error while sending message.', 'error');
            }
        });
    }
});


