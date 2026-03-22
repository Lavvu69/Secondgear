const signupForm = document.getElementById('signupForm');
const termsModal = document.getElementById('terms-modal');
const openTermsBtn = document.getElementById('open-terms');
const closeTermsBtn = document.getElementById('close-terms');
const acceptTermsBtn = document.getElementById('accept-terms');
const declineTermsBtn = document.getElementById('decline-terms');
const termsCheckbox = document.getElementById('terms-accepted');

const openTerms = () => {
    if (!termsModal) return;
    termsModal.classList.add('is-open');
    termsModal.setAttribute('aria-hidden', 'false');
};

const closeTerms = () => {
    if (!termsModal) return;
    termsModal.classList.remove('is-open');
    termsModal.setAttribute('aria-hidden', 'true');
};

if (openTermsBtn) openTermsBtn.addEventListener('click', openTerms);
if (closeTermsBtn) closeTermsBtn.addEventListener('click', closeTerms);
if (declineTermsBtn) declineTermsBtn.addEventListener('click', closeTerms);
if (acceptTermsBtn) {
    acceptTermsBtn.addEventListener('click', () => {
        if (termsCheckbox) termsCheckbox.checked = true;
        closeTerms();
    });
}

if (termsModal) {
    termsModal.addEventListener('click', (event) => {
        if (event.target === termsModal) closeTerms();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && termsModal.classList.contains('is-open')) {
            closeTerms();
        }
    });
}

signupForm.addEventListener('submit', async (e) => {

    e.preventDefault();

    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData.entries());
    const termsAccepted = termsCheckbox && termsCheckbox.checked;

    // --- Name validation ---
    const namePattern = /^[A-Za-z]+$/;
    if (!namePattern.test(data['first-name'])) {
        alert('First name should contain only alphabets.');
        return;
    }
    if (!namePattern.test(data['last-name'])) {
        alert('Last name should contain only alphabets.');
        return;
    }

    // --- Email validation ---
    // Pattern: username@(gmail|yahoo).(com|in)
    const emailPattern = /^[a-zA-Z0-9._%+-]+@(gmail|yahoo)\.(com|in)$/;
    if (!emailPattern.test(data['email'])) {
        alert('Please enter a valid email address (username@(gmail/yahoo).com or .in)');
        return;
    }

    // --- Phone validation ---
    if (!/^\d{10}$/.test(data['phone'])) {
        alert('Phone number must be exactly 10 digits.');
        return;
    }

    if (!termsAccepted) {
        alert('Please accept the Terms & Conditions to continue.');
        return;
    }

    data['terms-accepted'] = termsAccepted;

    try {
        const res = await fetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (res.ok) {
            alert(result.message);
            // Redirect using window.location
            if (result.redirect) {
                window.location.href = result.redirect;
            } else {
                console.warn('No redirect URL provided by server');
            }
        } else {
            alert(result.message);
        }

    } catch (err) {
        console.error('Error:', err);
        alert('Something went wrong. Try again.');
    }
});
