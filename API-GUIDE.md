# Medicare API Integration Guide

## Overview

This guide explains how to use the Medicare.gov API integration to fetch real Medicare Advantage and Part D plans for your users.

## Files

- `medicare-api.js` - Main API integration file
- `questionnaire.js` - Questionnaire logic (to be updated with API calls)

## API Sources

### 1. Data.Medicare.gov Open Data API
**No API key required** ✅
- Base URL: `https://data.medicare.gov/resource`
- Documentation: https://data.medicare.gov/developers
- Rate Limit: Public use (reasonable limits)

### 2. HUD USPS Crosswalk API
**No API key required** ✅
- Converts ZIP codes to county FIPS codes
- URL: `https://www.huduser.gov/hudapi/public/usps`

## Quick Start

### 1. Add the script to your HTML
```html
<script src="medicare-api.js"></script>
```

### 2. Fetch plans by ZIP code
```javascript
// Get plans for ZIP code 77381 (Texas)
const plans = await getMedicareAdvantagePlans('77381', 2026);
console.log(plans);
```

### 3. Search with user preferences
```javascript
const results = await searchPlans({
    zipCode: '77381',
    planType: 'advantage',
    budget: 100,
    prescriptions: 5
});

console.log(`Found ${results.plans.length} plans`);
displayPlans(results.plans);
```

## Integration with Questionnaire

To integrate with your existing questionnaire:

### Step 1: Add API script to questionnaire.html
```html
<head>
    <!-- Add before questionnaire.js -->
    <script src="medicare-api.js"></script>
    <script src="questionnaire.js"></script>
</head>
```

### Step 2: Modify the final step (step 7)
Update `questionnaire.js` to call the API when form is submitted:

```javascript
// In questionnaire.js, modify the form submission:

document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const zipCode = document.getElementById('zipCode').value;
    
    // Fetch real plans
    const results = await searchPlans({
        zipCode: zipCode,
        planType: answers.recommendation === 'Medicare Advantage' ? 'advantage' : 'supplement'
    });
    
    if (results.success) {
        // Show plans to user
        displayPlans(results.plans, 'plans-results');
    }
});
```

## API Functions

### `getMedicareAdvantagePlans(zipCode, year)`
Fetches Medicare Advantage plans

**Parameters:**
- `zipCode` (string): 5-digit ZIP code
- `year` (number): Plan year (default: 2026)

**Returns:** Array of plan objects

### `getCountyFromZip(zipCode)`
Converts ZIP code to county information

**Returns:** Object with county, state, and FIPS code

### `searchPlans(preferences)`
Search plans based on user preferences

**Parameters:**
```javascript
{
    zipCode: '77381',
    planType: 'advantage' | 'partd' | 'both',
    budget: 100, // max monthly premium
    prescriptions: 5 // number of prescriptions
}
```

**Returns:**
```javascript
{
    success: true,
    countyInfo: { county, state, fips },
    plans: [ /* plan objects */ ],
    totalPlans: 25
}
```

### `displayPlans(plans, containerId)`
Renders plans in the UI

## Example Plan Object

```javascript
{
    id: "H1234-001",
    name: "AARP Medicare Advantage Plan",
    premium: 0,
    starRating: 4.5,
    drugCoverage: true,
    dentalCoverage: true,
    visionCoverage: true,
    hearingCoverage: false,
    maxOutOfPocket: "$6,700",
    contractId: "H1234",
    planId: "001"
}
```

## Testing

### Test ZIP codes (Texas):
- `77381` - Spring, TX (Harris County)
- `75001` - Addison, TX (Dallas County) 
- `78701` - Austin, TX (Travis County)

### Test in browser console:
```javascript
// Test county lookup
getCountyFromZip('77381').then(console.log);

// Test plan fetch
getMedicareAdvantagePlans('77381').then(console.log);
```

## Important Notes

1. **No API Key Required**: Both APIs are public and don't require authentication
2. **CORS**: APIs support CORS, so they work from browser
3. **Data Freshness**: Medicare data is updated annually
4. **Rate Limits**: Be reasonable with requests (cache results)
5. **Fallback**: Always provide link to Medicare.gov if API fails

## Medicare.gov Plan Compare Link

If API fails or user wants official source:
```
https://www.medicare.gov/plan-compare/
```

## Next Steps

1. ✅ API integration created
2. ⏳ Update questionnaire.html to include medicare-api.js
3. ⏳ Modify questionnaire.js to fetch real plans
4. ⏳ Add CSS styling for plan cards
5. ⏳ Test with different ZIP codes

## Support

For API issues:
- Data.Medicare.gov: https://data.medicare.gov/developers
- HUD API: https://www.huduser.gov/portal/dataset/uspszip-api.html

## Additional Resources

- [CMS Developer Tools](https://developer.cms.gov/)
- [Medicare Plan Finder](https://www.medicare.gov/plan-compare/)
- [Blue Button API](https://bluebutton.cms.gov/)
