// Monthly cost alert for the whole Darkspace.Press subscription (Spellstick and aiuthor).
// It only sends emails; it never stops or changes anything.
//
//   az deployment sub create -l eastus2 -n budget -f infra/budget.bicep -p contactEmail=<address>

targetScope = 'subscription'

param amount int = 75
param contactEmail string
@description('First day of the month the budget starts. Must not be in the past when first created.')
param startDate string = '2026-10-01'

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'monthly-subscription-budget'
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: { startDate: startDate }
    notifications: {
      // Spending so far this month passed 80% of the budget.
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [contactEmail]
      }
      // Azure expects the month to end over budget.
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: [contactEmail]
      }
    }
  }
}
