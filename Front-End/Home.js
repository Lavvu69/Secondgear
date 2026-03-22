// Home.js
// Profile section logic for navbar


document.addEventListener('DOMContentLoaded', function() {
    const myProfileLink = document.getElementById('my-profile-link');
    const homeProfileMessageBadge = document.getElementById('home-profile-message-badge');
    const homeAccessDashboardLink = document.getElementById('home-access-dashboard-link');
    const unsubscribeBtn = document.getElementById('unsubscribeBtn');
    let notificationsBadgeInterval = null;

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function updateAdminDropdownState(isAdmin) {
        if (homeAccessDashboardLink) {
            homeAccessDashboardLink.style.display = isAdmin ? 'block' : 'none';
        }
    }

    fetch('/admin/session')
        .then(res => res.json())
        .then(data => {
            const isAdmin = !!(data && data.loggedIn);
            if (isAdmin) {
                localStorage.setItem('adminLoggedIn', 'true');
            } else {
                localStorage.removeItem('adminLoggedIn');
            }
            updateAdminDropdownState(isAdmin);
        })
        .catch(() => {
            updateAdminDropdownState(localStorage.getItem('adminLoggedIn') === 'true');
        });

    function updateHomeProfileMessageBadge() {
        if (!homeProfileMessageBadge) return;
        fetch('/user/notifications')
            .then(res => {
                if (!res.ok) throw new Error('Not logged in');
                return res.json();
            })
            .then(items => {
                const unreadCount = (items || []).filter(item => !item.is_read).length;
                if (unreadCount > 0) {
                    homeProfileMessageBadge.style.display = 'inline-flex';
                    homeProfileMessageBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                } else {
                    homeProfileMessageBadge.style.display = 'none';
                    homeProfileMessageBadge.textContent = '0';
                }
            })
            .catch(() => {
                homeProfileMessageBadge.style.display = 'none';
                homeProfileMessageBadge.textContent = '0';
            });
    }

    // Marquee offers ticker
    const offersSection = document.querySelector('.offers-section');
    const offersMarquee = document.getElementById('offersMarquee');
    const offersMarqueeTrack = document.getElementById('offersMarqueeTrack');
    const offersEmpty = document.getElementById('userOffersEmpty');
    // Hide offers section by default
    if (offersSection) offersSection.style.display = 'none';

    function updateSubscriptionUI(userEmail) {
        if (!userEmail || !unsubscribeBtn) return;
        fetch('/admin/newsletter-subscribers')
            .then(res => res.json())
            .then(subscribers => {
                const isSubscribed = subscribers.some(sub => (sub.email || '').toLowerCase() === userEmail.toLowerCase());
                unsubscribeBtn.style.display = isSubscribed ? 'inline-flex' : 'none';
            })
            .catch(() => {
                unsubscribeBtn.style.display = 'none';
            });
    }

    // Check session from backend
    fetch('/user/session')
        .then(res => res.json())
        .then(data => {
            if (data.loggedIn && data.user && offersSection) {
                // Check if user is subscribed
                fetch('/admin/newsletter-subscribers')
                    .then(res => res.json())
                    .then(subscribers => {
                        const userEmail = (data.user.email || '').toLowerCase();
                        const isSubscribed = subscribers.some(sub => (sub.email || '').toLowerCase() === userEmail);
                        if (isSubscribed) {
                            offersSection.style.display = '';
                            // Now fetch and show offers
                            fetch('/offers')
                                .then(res => res.json().then(data => ({ ok: res.ok, data })))
                                .then(({ ok, data }) => {
                                    if (!ok) {
                                        if (offersSection) offersSection.style.display = 'none';
                                        return;
                                    }
                                    const offers = data;
                                    if (!offers || offers.length === 0) {
                                        if (offersEmpty) offersEmpty.style.display = '';
                                        if (offersMarquee) offersMarquee.style.display = 'none';
                                        return;
                                    }
                                    if (offersEmpty) offersEmpty.style.display = 'none';
                                    if (offersMarquee && offersMarqueeTrack) {
                                        offersMarquee.style.display = '';
                                        const items = offers.map(offer => {
                                            const carLabel = offer.car
                                                ? `${offer.car.make || ''} ${offer.car.model || ''} (${offer.car.year || ''})`.trim()
                                                : 'Subscriber Deal';
                                            const original = Number(offer.discount?.original_price || offer.car?.price || 0);
                                            const discounted = Number(offer.discount?.discounted_price || 0);
                                            const priceLine = Number.isFinite(discounted) && discounted > 0
                                                ? `Now ₹${discounted.toLocaleString('en-IN')} (MRP ₹${original.toLocaleString('en-IN')})`
                                                : offer.text;
                                            const time = new Date(offer.created_at).toLocaleString();
                                            return `
                                                <span class="offers-ticker__item">
                                                    <span>${carLabel} · ${priceLine}</span>
                                                    <span class="offers-ticker__time">(${time})</span>
                                                    ${offer.checkout_url ? `<a class="offers-ticker__cta" href="${offer.checkout_url}">Checkout</a>` : ''}
                                                </span>
                                            `;
                                        });
                                        const joined = items.join('');
                                        offersMarqueeTrack.innerHTML = joined + joined;
                                        const duration = Math.max(20, offers.length * 8);
                                        offersMarquee.style.setProperty('--ticker-duration', `${duration}s`);
                                        if (offers.length <= 1) {
                                            offersMarquee.classList.add('offers-ticker--static');
                                            offersMarqueeTrack.innerHTML = joined;
                                        } else {
                                            offersMarquee.classList.remove('offers-ticker--static');
                                        }
                                    }
                                });
                        } else {
                            offersSection.style.display = 'none';
                        }
                        if (unsubscribeBtn) {
                            unsubscribeBtn.style.display = isSubscribed ? 'inline-flex' : 'none';
                        }
                    });
            } else {
                if (offersSection) offersSection.style.display = 'none';
                if (unsubscribeBtn) unsubscribeBtn.style.display = 'none';
            }
        });
        // Show contact suggestion if redirected after payment
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('showContactSuggestion') === '1') {
            setTimeout(function() {
                alert('For any queries about delivery, please contact us through the Contact page.');
            }, 400);
        }
    const profileSection = document.getElementById('profile-section');
    const welcomeMessage = document.getElementById('welcome-message');
    const profileUsername = document.getElementById('profile-username');
    const logoutBtn = document.getElementById('logout-btn');

    const getAuthItem = (key) => {
        return sessionStorage.getItem(key) ?? localStorage.getItem(key);
    };

    const clearAuthStorage = () => {
        ['userLoggedIn', 'userInfo', 'user_id', 'rememberMe'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    };

    const setAuthStorage = (dataUser) => {
        const remember = (sessionStorage.getItem('rememberMe') === 'true') || (localStorage.getItem('rememberMe') === 'true');
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('userLoggedIn', 'true');
        storage.setItem('userInfo', JSON.stringify(dataUser));
    };

    // Check session from backend
    fetch('/user/session')
        .then(res => res.json())
        .then(data => {
            if (data.loggedIn && data.user) {
                setAuthStorage(data.user);
                profileSection.style.display = 'flex';
                welcomeMessage.textContent = 'Welcome to SecondGear,';
                profileUsername.textContent = ' ' + (data.user.firstName || data.user.email);
                logoutBtn.style.display = 'inline-block';
                logoutBtn.onclick = async function() {
                    await fetch('/user/logout', { method: 'POST' });
                    clearAuthStorage();
                    window.location.reload();
                };
                // Autofill email if logged in
                const feedbackEmail = document.getElementById('footer-feedback-email');
                const notifyEmail = document.getElementById('notify-email');
                if (feedbackEmail) feedbackEmail.value = data.user.email;
                if (notifyEmail) notifyEmail.value = data.user.email;
                updateSubscriptionUI(data.user.email);
                if (myProfileLink) myProfileLink.style.display = 'inline-block';
                updateHomeProfileMessageBadge();
                notificationsBadgeInterval = setInterval(updateHomeProfileMessageBadge, 30000);
            } else {
                clearAuthStorage();
                profileSection.style.display = 'none';
                if (myProfileLink) myProfileLink.style.display = 'none';
                if (homeProfileMessageBadge) homeProfileMessageBadge.style.display = 'none';
            }
        });

    window.addEventListener('beforeunload', function() {
        if (notificationsBadgeInterval) {
            clearInterval(notificationsBadgeInterval);
        }
    });

    // Featured cars for homepage
    const featuredSection = document.getElementById('featured-section');
    const featuredGrid = document.getElementById('featured-grid');
    if (featuredSection && featuredGrid) {
        fetch('/featured-cars')
            .then(res => res.json())
            .then(cars => {
                if (!Array.isArray(cars) || cars.length === 0) {
                    featuredSection.style.display = 'none';
                    return;
                }
                featuredSection.style.display = 'block';
                featuredGrid.innerHTML = cars.map(car => {
                    const title = `${car.make || ''} ${car.model || ''} (${car.year || '-'})`.trim();
                    const image = car.image_url ? (car.image_url.startsWith('/') || car.image_url.startsWith('http') ? car.image_url : `/${car.image_url}`) : 'images/cars/about.jpg';
                    const meta = [car.type, car.fuel_type, car.transmission].filter(Boolean).join(' - ');
                    const buyLink = car.id ? `car-details.html?id=${encodeURIComponent(car.id)}` : '/buy';
                    return `
                        <article class="featured-card">
                            <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
                            <div class="featured-content">
                                <span class="featured-tag">Featured</span>
                                <div class="featured-title">${escapeHtml(title)}</div>
                                <div class="featured-meta">${escapeHtml(meta || 'Premium pick')}</div>
                        <div class="featured-price">₹${Number(car.price || 0).toLocaleString('en-IN')}</div>
                                <a class="featured-buy" href="${buyLink}">Buy now</a>
                            </div>
                        </article>
                    `;
                }).join('');
            })
            .catch(() => {
                featuredSection.style.display = 'none';
            });
    }

    // Feedback form submit (footer)
    const footerFeedbackForm = document.getElementById('footerFeedbackForm');
    if (footerFeedbackForm) {
        footerFeedbackForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const user_email = document.getElementById('footer-feedback-email').value;
            const feedback_text = document.getElementById('footer-feedback-text').value;
            try {
                const res = await fetch('/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_email, feedback_text })
                });
                const result = await res.json();
                document.getElementById('footerFeedbackMsg').textContent = result.message || 'Thank you for your feedback!';
                footerFeedbackForm.reset();
            } catch (err) {
                document.getElementById('footerFeedbackMsg').textContent = 'Error submitting feedback.';
            }
        });
    }

    // Notification form submit
    const notifyForm = document.getElementById('notifyForm');
    if (notifyForm) {
        notifyForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('notify-email').value;
            try {
                const res = await fetch('/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const result = await res.json();
                document.getElementById('notifyMsg').textContent = result.message || 'Thanks! Check your email to confirm.';
                updateSubscriptionUI(email);
                notifyForm.reset();
            } catch (err) {
                document.getElementById('notifyMsg').textContent = 'Error subscribing.';
            }
        });
    }

    if (unsubscribeBtn) {
        unsubscribeBtn.addEventListener('click', async function() {
            const userInfo = JSON.parse(getAuthItem('userInfo') || '{}');
            const email = userInfo.email || document.getElementById('notify-email')?.value;
            if (!email) {
                document.getElementById('notifyMsg').textContent = 'Please enter an email to unsubscribe.';
                return;
            }
            try {
                const res = await fetch('/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const result = await res.json();
                document.getElementById('notifyMsg').textContent = result.message || 'You have been unsubscribed.';
                unsubscribeBtn.style.display = 'none';
            } catch (err) {
                document.getElementById('notifyMsg').textContent = 'Error unsubscribing.';
            }
        });
    }

    // Feedback form submit (other feedback form)
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('feedback-email').value;
            const feedback = document.getElementById('feedback-text').value;
            try {
                const res = await fetch('/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, feedback })
                });
                if (!res.ok) {
                    throw new Error('Server responded with status ' + res.status);
                }
                const result = await res.json();
                document.getElementById('feedbackMsg').textContent = result.message || 'Thank you for your feedback!';
                feedbackForm.reset();
            } catch (err) {
                console.error('Feedback submission error:', err);
                document.getElementById('feedbackMsg').textContent = 'Error submitting feedback. Please try again later.';
            }
        });
    }
});
let feedbacks = [];
let feedbackIndex = 0;

function renderFeedback() {
    const card = document.getElementById('testimonial-card');
    if (!card) return;
    if (feedbacks.length === 0) {
        card.innerHTML = '<div class="testimonial-quote">No feedback yet.</div>';
        return;
    }
    // Fade out
    card.classList.add('fade');
    setTimeout(() => {
        const fb = feedbacks[feedbackIndex];
        card.innerHTML = `
            <div class="testimonial-quote">“${fb.feedback_text}”</div>
            <div class="testimonial-user">${fb.user_email}</div>
            <div class="testimonial-meta">${new Date(fb.created_at).toLocaleDateString()}</div>
        `;
        // Fade in
        card.classList.remove('fade');
    }, 400);
}

function fetchFeedbacks() {
  fetch('/api/feedbacks')
    .then(res => res.json())
    .then(data => {
      feedbacks = data;
      feedbackIndex = 0;
      renderFeedback();
    });
}

document.getElementById('testimonial-prev').onclick = function() {
  if (feedbacks.length === 0) return;
  feedbackIndex = (feedbackIndex - 1 + feedbacks.length) % feedbacks.length;
  renderFeedback();
};
document.getElementById('testimonial-next').onclick = function() {
  if (feedbacks.length === 0) return;
  feedbackIndex = (feedbackIndex + 1) % feedbacks.length;
  renderFeedback();
};

fetchFeedbacks();

// Auto-scroll feedback every 4 seconds
setInterval(function() {
    if (feedbacks.length === 0) return;
    feedbackIndex = (feedbackIndex + 1) % feedbacks.length;
    renderFeedback();
}, 4000);

document.addEventListener('DOMContentLoaded', function () {
    const hero = document.getElementById('home-hero');
    const scrollCue = document.getElementById('hero-scroll-cue');
    const offersSection = document.querySelector('.offers-section');

    if (hero) {
        hero.addEventListener('mousemove', function (event) {
            const rect = hero.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            hero.style.setProperty('--hero-mx', `${x}%`);
            hero.style.setProperty('--hero-my', `${y}%`);
        });

        hero.addEventListener('mouseleave', function () {
            hero.style.setProperty('--hero-mx', '50%');
            hero.style.setProperty('--hero-my', '50%');
        });
    }

    if (scrollCue && offersSection) {
        scrollCue.addEventListener('click', function () {
            offersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
});

