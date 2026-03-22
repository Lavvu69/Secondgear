// service-booking.js
// Handles service booking form submission

document.addEventListener('DOMContentLoaded', function () {
  const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);

  /* ================= DATE + HOLIDAY LOGIC ================= */

  const form = document.getElementById('serviceBookingForm');
  const bookingMsg = document.getElementById('bookingMsg');
  const dateInput = document.getElementById('date');
  const hourSelect = document.getElementById('time-hour');
  const minuteSelect = document.getElementById('time-minute');
  const ampmSelect = document.getElementById('time-ampm');
  let holidayTimestamps = [];
  let isUserLoggedIn = false;

  function setBookingFormLocked(locked) {
    if (!form) return;
    form.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.type === 'hidden') return;
      el.disabled = locked;
    });
    if (locked && bookingMsg) {
      bookingMsg.innerHTML = 'Please <a href="/user" style="color:#1d4ed8;font-weight:700;">log in</a> to fill the booking form.';
      bookingMsg.style.color = '#1e3a8a';
    } else if (bookingMsg) {
      bookingMsg.textContent = '';
      hourSelect.disabled = true;
      minuteSelect.disabled = true;
      ampmSelect.disabled = true;
    }
  }

  function formatDate(d) {
    return d.toISOString().slice(0, 10);
  }

  // Disable time initially
  hourSelect.disabled = true;
  minuteSelect.disabled = true;
  ampmSelect.disabled = true;

  // Fetch admin holidays
  const API_BASE = window.location.origin;
  fetch(`${API_BASE}/admin/holidays`)
    .then(res => res.json())
    .then(holidays => {
      holidayTimestamps = holidays.map(h => {
        const d = new Date(h.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });
    });

  // Set min date = today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateInput.min = formatDate(today);

  // Treat admin holidays EXACTLY like Sunday
  dateInput.addEventListener('change', function () {
    if (!this.value) return;

    const selected = new Date(this.value);
    selected.setHours(0, 0, 0, 0);

    const day = selected.getDay();
    const isHoliday = holidayTimestamps.includes(selected.getTime());

    if (day === 0 || isHoliday) {
      this.setCustomValidity('Selected date is a holiday. Please choose another day.');
      this.reportValidity();
      this.value = '';
      hourSelect.disabled = true;
      minuteSelect.disabled = true;
      ampmSelect.disabled = true;
      return;
    }

    this.setCustomValidity('');
    setupTimePicker(selected);
  });

  function setupTimePicker(dateObj) {
    const day = dateObj.getDay();
    let minHour, maxHour;

    hourSelect.innerHTML = '';
    minuteSelect.innerHTML = '';
    ampmSelect.innerHTML = '';

    if (day >= 1 && day <= 5) { // Weekdays
        minHour = 9;
        maxHour = 17;
    } else if (day === 6) { // Saturday
        minHour = 11;
        maxHour = 15;
    } else { // Sunday or holiday
        hourSelect.disabled = true;
        minuteSelect.disabled = true;
        ampmSelect.disabled = true;
        return;
    }

    // Populate hours
    for (let hour = minHour; hour < maxHour; hour++) {
        let displayHour = hour % 12;
        if (displayHour === 0) displayHour = 12; // 12 AM/PM
        const option = document.createElement('option');
        option.value = hour;
        option.textContent = displayHour;
        hourSelect.appendChild(option);
    }

    // Populate minutes
    ['00', '15', '30', '45'].forEach(min => {
        const option = document.createElement('option');
        option.value = min;
        option.textContent = min;
        minuteSelect.appendChild(option);
    });

    // Populate AM/PM
    const amOption = document.createElement('option');
    amOption.value = 'AM';
    amOption.textContent = 'AM';
    const pmOption = document.createElement('option');
    pmOption.value = 'PM';
    pmOption.textContent = 'PM';
    ampmSelect.appendChild(amOption);
    ampmSelect.appendChild(pmOption);

    hourSelect.disabled = false;
    minuteSelect.disabled = false;
    ampmSelect.disabled = false;
  }

  /* ================= TIMETABLE TOGGLE ================= */

  const toggleTimetableBtn = document.getElementById('toggleTimetableBtn');
  const timetableSection = document.getElementById('timetableSection');

  if (toggleTimetableBtn && timetableSection) {
    timetableSection.classList.remove('active');
    toggleTimetableBtn.addEventListener('click', function () {
      timetableSection.classList.toggle('active');
    });
  }

  /* ================= SHOW HOLIDAYS IN TIMETABLE ================= */

  fetch(`${API_BASE}/admin/holidays`)
    .then(res => res.json())
    .then(holidays => {

      function formatHolidayDate(dateStr) {
        const d = new Date(dateStr);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      }

      const timetableTable = document.querySelector('.timetable-table tbody');
      if (!timetableTable) return;

      timetableTable.querySelectorAll('.timetable-holiday').forEach(r => r.remove());

      holidays.forEach(h => {
        const tr = document.createElement('tr');
        tr.className = 'timetable-holiday';
        tr.innerHTML = `
          <td style="background:linear-gradient(90deg,#ffb347 0%,#ff5858 100%);color:#fff;font-weight:700;">
            ${formatHolidayDate(h.date)}
          </td>
          <td style="background:linear-gradient(90deg,#ffb347 0%,#ff5858 100%);color:#fff;font-weight:700;">
            ${h.description || 'Holiday'}
          </td>
        `;
        timetableTable.appendChild(tr);
      });
    });

  /* ================= WORKSHOPS ================= */

  const workshopSelect = document.getElementById('workshop');
  fetch(`${API_BASE}/admin/workshops`)
    .then(res => res.json())
    .then(workshops => {
      workshops.forEach(ws => {
        const opt = document.createElement('option');
        opt.value = ws.workshop_id;
        opt.textContent = ws.name + (ws.address ? ' (' + ws.address + ')' : '');
        workshopSelect.appendChild(opt);
      });
    });

  /* ================= MECHANICS ================= */

  const mechanicSelect = document.getElementById('mechanic');

  // Function to fetch and populate mechanics based on workshop
  async function updateMechanics(workshopId) {
      // Clear existing mechanic options
      mechanicSelect.innerHTML = '<option value="">Let system decide</option>';

      if (!workshopId) {
          // If no workshop is selected, maybe load all or do nothing
          // For now, we do nothing and leave it to the system
          return;
      }

      try {
          const res = await fetch(`${API_BASE}/api/mechanics/${workshopId}`);
          if (!res.ok) {
              console.error('Failed to fetch mechanics for workshop');
              return;
          }
          const mechanics = await res.json();
          mechanics.forEach(m => {
              const opt = document.createElement('option');
              opt.value = m.mechanic_id;
              opt.textContent = m.name;
              mechanicSelect.appendChild(opt);
          });
      } catch (error) {
          console.error('Error fetching mechanics:', error);
      }
  }

  // Add event listener to workshop select
  workshopSelect.addEventListener('change', (e) => {
      updateMechanics(e.target.value);
  });

  // Initial call to populate mechanics if a workshop is pre-selected (optional)
  // updateMechanics(workshopSelect.value);


  /* ================= SERVICES + COST ================= */

  let serviceList = [];
  const serviceTypeSelect = document.getElementById('serviceType');
  const vehicleTypeSelect = document.getElementById('vehicleType');
  const serviceCostSpan = document.getElementById('serviceCost');
  const priceInput = document.getElementById('price'); // Get the hidden input
  let currentCost = 0;

  fetch(`${API_BASE}/admin/services`)
    .then(res => res.json())
    .then(services => {
      serviceList = services;

      while (serviceTypeSelect.options.length > 1) {
        serviceTypeSelect.remove(1);
      }

      services.forEach(service => {
        const opt = document.createElement('option');
        opt.value = service.name;
        opt.textContent = service.name;
        serviceTypeSelect.appendChild(opt);
      });
    });

  function updateCost() {
    const selectedService = serviceList.find(s => s.name === serviceTypeSelect.value);
    let cost = 0;

    if (selectedService) {
      let percent = 1;
      if (vehicleTypeSelect.value === 'bike') percent = 0.6;
      else if (vehicleTypeSelect.value === 'scooter') percent = 0.5;
      cost = Math.round(selectedService.price * percent);
    }
    currentCost = cost;
    serviceCostSpan.textContent = `Total Cost: ₹${Number(cost || 0).toLocaleString('en-IN')}`;
    priceInput.value = cost; // Update the hidden input's value
  }

  serviceTypeSelect.addEventListener('change', updateCost);
  vehicleTypeSelect.addEventListener('change', updateCost);
  updateCost();

  /* ================= LOGIN NOTICE + LOCK ================= */

  setBookingFormLocked(true);

  async function initBookingAccess() {
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

    setBookingFormLocked(!isUserLoggedIn);

    if (!isUserLoggedIn) {
      const notice = document.createElement('div');
      notice.className = 'login-notice';
      notice.innerHTML = `<marquee scrollamount="8">
        <strong>
          <a href="/user" style="color:#fff;text-decoration:underline;">Log in</a>
          to use the features on this page.
        </strong>
      </marquee>`;
      notice.style =
        'position:fixed;top:40px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#ff5858,#f09819);color:#fff;padding:8px 16px;border-radius:8px;z-index:1001;';
      document.body.appendChild(notice);
    }
  }

  initBookingAccess();

  /* ================= FORM SUBMISSION ================= */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!isUserLoggedIn) {
      bookingMsg.innerHTML = 'Please <a href="/user" style="color:#1d4ed8;font-weight:700;">log in</a> to book a service.';
      bookingMsg.style.color = '#e74c3c';
      return;
    }

    let hour = parseInt(form['time-hour'].value);
    const minute = form['time-minute'].value;
    const ampm = form['time-ampm'].value;

    if (ampm === 'PM' && hour < 12) {
        hour += 12;
    }
    if (ampm === 'AM' && hour === 12) { // Midnight case
        hour = 0;
    }

    const time24 = `${hour.toString().padStart(2, '0')}:${minute}`;

    const bookingDateTime = new Date(`${form.date.value}T${time24}`);
    if (bookingDateTime <= new Date()) {
      bookingMsg.textContent = 'You can only book for a future date and time.';
      bookingMsg.style.color = '#e74c3c';
      return;
    }

    fetch(`${API_BASE}/book-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: getAuthItem('user_id') || null,
        vehicle_type: form.vehicleType.value,
        service_type: form.serviceType.value,
        booking_date: form.date.value,
        booking_time: time24,
        contact: form.contact.value,
        notes: form.notes.value,
        workshop_id: form.workshop.value,
        mechanic_id: form.mechanic.value,
        price: form.price.value // Read price from the hidden input
      })
    })
      .then(res => res.json())
      .then(result => {
        if (result.booking_id) {
          bookingMsg.textContent = result.message || 'Booking submitted! We will contact you soon.';
          bookingMsg.style.color = '#166534';
          bookingMsg.style.background = 'rgba(22,163,74,0.12)';
          bookingMsg.style.border = '1px solid rgba(22,163,74,0.35)';
          bookingMsg.style.padding = '10px 12px';
          bookingMsg.style.borderRadius = '10px';
          bookingMsg.style.display = 'block';
          form.reset();
          hourSelect.disabled = true;
          minuteSelect.disabled = true;
          ampmSelect.disabled = true;
          bookingMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          bookingMsg.textContent = result.message || 'Booking failed.';
          bookingMsg.style.color = '#b91c1c';
          bookingMsg.style.background = 'rgba(239,68,68,0.12)';
          bookingMsg.style.border = '1px solid rgba(239,68,68,0.35)';
          bookingMsg.style.padding = '10px 12px';
          bookingMsg.style.borderRadius = '10px';
          bookingMsg.style.display = 'block';
          bookingMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      })
      .catch(() => {
        bookingMsg.textContent = 'Booking failed. Please try again later.';
        bookingMsg.style.color = '#b91c1c';
        bookingMsg.style.background = 'rgba(239,68,68,0.12)';
        bookingMsg.style.border = '1px solid rgba(239,68,68,0.35)';
        bookingMsg.style.padding = '10px 12px';
        bookingMsg.style.borderRadius = '10px';
        bookingMsg.style.display = 'block';
        bookingMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
  });

});
