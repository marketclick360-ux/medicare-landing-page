// Medicare Questionnaire Logic

let currentStep = 1;
const totalSteps = 7;
const userAnswers = {};

document.addEventListener('DOMContentLoaded', function() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('questionnaireForm');
    
    // Initialize
    updateButtons();
    
    // Navigation
    nextBtn.addEventListener('click', function() {
        if (validateCurrentStep()) {
            saveCurrentAnswer();
            if (currentStep < totalSteps) {
                currentStep++;
                showStep(currentStep);
                updateProgress();
                updateButtons();
            }
        }
    });
    
    prevBtn.addEventListener('click', function() {
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
            updateProgress();
            updateButtons();
        }
    });
    
    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        saveCurrentAnswer();
            
    // Get form data
    const formData = {
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        zipCode: document.getElementById('zipCode').value,
        answers: userAnswers,
        recommendation: userAnswers.recommendation,
        timestamp: new Date().toISOString()
    };
    
    // Fetch real Medicare plans from API
    try {
        const results = await searchPlans({
            zipCode: formData.zipCode,
            planType: userAnswers.recommendation === 'Medicare Advantage' ? 'advantage' : 'supplement'
        });
        
        if (results.success && results.plans.length > 0) {
            // Display real Medicare plans
            displayPlans(results.plans, 'plans-results');
        } else {
            // Fallback: show Medicare.gov link
            document.getElementById('plans-results').innerHTML = `
                <p>View available plans on <a href="https://www.medicare.gov/plan-compare/?zip=${formData.zipCode}" target="_blank">Medicare.gov Plan Compare</a></p>
            `;
        }
    } catch (error) {
        console.error('Error fetching plans:', error);
    }
    
    // Send lead to your email/CRM
    // Option 1: FormSubmit.co (free email forwarding)
    fetch('https://formsubmit.co/ajax/marketclick360@gmail.com', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            name: formData.fullName,
            email: formData.email,
            phone: formData.phone,
            zip: formData.zipCode,
            recommendation: formData.recommendation,
            _subject: 'New Medicare Lead from ' + formData.fullName,
            _template: 'table'
        })
    }).then(response => console.log('Lead sent successfully'))
      .catch(error => console.error('Error sending lead:', error));
    
    alert('Thank you! We\'ll contact you soon with personalized plan options.');
    console.log('User data:', formData)
});

function showStep(step) {
    const steps = document.querySelectorAll('.question-step');
    steps.forEach((s, index) => {
        s.classList.remove('active');
        if (index === step - 1) {
            s.classList.add('active');
        }
    });
    
    // Generate recommendation on last step
    if (step === totalSteps) {
        generateRecommendation();
    }
}

function updateProgress() {
    const progress = document.getElementById('progress');
    const percentage = (currentStep / totalSteps) * 100;
    progress.style.width = percentage + '%';
    
    document.getElementById('currentStep').textContent = currentStep;
    document.getElementById('totalSteps').textContent = totalSteps;
}

function updateButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    
    prevBtn.style.display = currentStep === 1 ? 'none' : 'block';
    
    if (currentStep === totalSteps) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

function validateCurrentStep() {
    const currentStepEl = document.querySelector('.question-step.active');
    const radios = currentStepEl.querySelectorAll('input[type="radio"]');
    
    // Skip validation for step 6 (checkboxes are optional) and step 7 (final step)
    if (currentStep === 6 || currentStep === 7) return true;
    
    if (radios.length > 0) {
        const name = radios[0].name;
        const checked = currentStepEl.querySelector(`input[name="${name}"]:checked`);
        if (!checked) {
            alert('Please select an option to continue');
            return false;
        }
    }
    return true;
}

function saveCurrentAnswer() {
    const currentStepEl = document.querySelector('.question-step.active');
    
    // Save radio button answers
    const radios = currentStepEl.querySelectorAll('input[type="radio"]:checked');
    radios.forEach(radio => {
        userAnswers[radio.name] = radio.value;
    });
    
    // Save checkbox answers  
    const checkboxes = currentStepEl.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length > 0) {
        const extras = [];
        checkboxes.forEach(checkbox => {
            extras.push(checkbox.value);
        });
        userAnswers.extras = extras;
    }
}

function generateRecommendation() {
    let recommendation = '';
    let planType = '';
    let reasons = [];
    
    // Algorithm to determine best plan type based on answers
    const health = userAnswers.health;
    const doctors = userAnswers.doctors;
    const budget = userAnswers.budget;
    const travel = userAnswers.travel;
    const prescriptions = userAnswers.prescriptions;
    
    // Score system
    let advantageScore = 0;
    let supplementScore = 0;
    
    // Health scoring
    if (health === 'excellent' || health === 'good') {
        advantageScore += 2;
        reasons.push('Your good health makes Medicare Advantage cost-effective');
    } else {
        supplementScore += 2;
        reasons.push('Your health needs benefit from comprehensive Medigap coverage');
    }
    
    // Doctor preference scoring
    if (doctors === 'yes-specific') {
        supplementScore += 3;
        reasons.push('Medigap lets you keep any doctor that accepts Medicare');
    } else {
        advantageScore += 2;
        reasons.push('Medicare Advantage networks offer great care options');
    }
    
    // Budget scoring
    if (budget === 'low-premium') {
        advantageScore += 2;
        reasons.push('Medicare Advantage often has $0 premiums');
    } else if (budget === 'comprehensive') {
        supplementScore += 2;
        reasons.push('Medigap provides predictable costs with lower out-of-pocket');
    }
    
    // Travel scoring
    if (travel === 'snowbird' || travel === 'frequent') {
        supplementScore += 3;
        reasons.push('Original Medicare + Medigap works everywhere in the US');
    } else {
        advantageScore += 1;
    }
    
    // Prescription scoring
    if (prescriptions === '7+' || prescriptions === '4-6') {
        advantageScore += 2;
        reasons.push('Medicare Advantage includes prescription drug coverage');
    }
    
    // Determine final recommendation
    if (supplementScore > advantageScore) {
        planType = 'Medicare Supplement (Medigap)';
        recommendation = `
            <h3>Recommended: ${planType}</h3>
            <p style="color: #334155; margin: 15px 0;">Based on your answers, a Medicare Supplement (Medigap) plan appears to be your best option. This gives you the freedom to see any doctor, predictable costs, and comprehensive coverage.</p>
            <ul>
                ${reasons.map(reason => `<li>${reason}</li>`).join('')}
                <li>No network restrictions - see any doctor accepting Medicare</li>
                <li>Lower out-of-pocket costs when you need care</li>
                <li>Works anywhere in the United States</li>
            </ul>
        `;
    } else {
        planType = 'Medicare Advantage';
        recommendation = `
            <h3>Recommended: ${planType}</h3>
            <p style="color: #334155; margin: 15px 0;">Based on your answers, a Medicare Advantage plan appears to be your best option. These plans offer comprehensive coverage including extras like dental, vision, and gym memberships.</p>
            <ul>
                ${reasons.map(reason => `<li>${reason}</li>`).join('')}
                <li>Often $0 monthly premium</li>
                <li>Includes prescription drug coverage</li>
                <li>Extra benefits like dental, vision, hearing</li>
                <li>Annual out-of-pocket maximum for protection</li>
            </ul>
        `;
    }
    
    // Display recommendation
    document.getElementById('planRecommendation').innerHTML = recommendation;
    
    // Store recommendation in answers
    userAnswers.recommendedPlan = planType;
}
