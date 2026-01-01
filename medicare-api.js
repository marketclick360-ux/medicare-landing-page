/**
 * Medicare API Integration
 * Fetches real Medicare Advantage and Part D plans from Data.Medicare.gov
 */

// Base API URLs
const MEDICARE_API_BASE = 'https://data.medicare.gov/resource';

// Dataset IDs
const DATASETS = {
    medicareAdvantage: 'khxu-3xry.json',
    partD: 'rx9x-98aq.json'
};

/**
 * Fetch Medicare Advantage plans by ZIP code
 * @param {string} zipCode - 5-digit ZIP code
 * @param {number} year - Plan year (default: 2026)
 */
async function getMedicareAdvantagePlans(zipCode, year = 2026) {
    try {
        const url = `${MEDICARE_API_BASE}/${DATASETS.medicareAdvantage}?$limit=50&contract_year=${year}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const plans = await response.json();
        
        return plans.map(plan => ({
            id: plan.contract_id || plan.plan_id,
            name: plan.organization_name || plan.plan_name || 'Medicare Advantage Plan',
            premium: parseFloat(plan.premium) || 0,
            starRating: parseFloat(plan.overall_rating) || 0,
            contractId: plan.contract_id
        }));
    } catch (error) {
        console.error('Error fetching plans:', error);
        return [];
    }
}

/**
 * Get county from ZIP code using HUD API (free, no key needed)
 */
async function getCountyFromZip(zipCode) {
    try {
        const url = `https://www.huduser.gov/hudapi/public/usps?type=3&query=${zipCode}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.data && data.data.results && data.data.results.length > 0) {
            return {
                county: data.data.results[0].county,
                state: data.data.results[0].state,
                fips: data.data.results[0].geoid
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting county:', error);
        return null;
    }
}

/**
 * Search plans based on user preferences
 */
async function searchPlans(preferences) {
    const { zipCode } = preferences;
    
    try {
        const countyInfo = await getCountyFromZip(zipCode);
        const plans = await getMedicareAdvantagePlans(zipCode);
        
        plans.sort((a, b) => {
            if (b.starRating !== a.starRating) return b.starRating - a.starRating;
            return a.premium - b.premium;
        });
        
        return {
            success: true,
            countyInfo,
            plans: plans.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message, plans: [] };
    }
}

/**
 * Display plans in UI
 */
function displayPlans(plans, containerId = 'plans-results') {
    const container = document.getElementById(containerId);
    if (!container || plans.length === 0) return;
    
    let html = '<div class="plans-grid">';
    plans.forEach(plan => {
        html += `
            <div class="plan-card">
                <h3>${plan.name}</h3>
                <p class="premium">$${plan.premium.toFixed(2)}/month</p>
                ${plan.starRating ? `<p>Rating: ${'⭐'.repeat(Math.round(plan.starRating))}</p>` : ''}
                <button onclick="selectPlan('${plan.id}')">Select Plan</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function selectPlan(planId) {
    localStorage.setItem('selectedPlan', planId);
    console.log('Selected plan:', planId);
}
