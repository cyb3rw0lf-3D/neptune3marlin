/** Fixed lines Valkyrie speaks outside lesson scripts (pre-recorded like the rest). */
export const LINES = {
  practiceIntro: "Practice run. I'll stay quiet unless you ask for a hint. Every hint is counted on your report.",
  testIntro: 'Test run. No hints, and any safety mistake fails the test. You need 80 percent to pass. Good luck.',
  testPassed: 'You passed! That certificate is yours. Great work.',
  testFailed: 'Not this time. Check the report, then go again. Every pro started here.',
  shopWelcome:
    'Welcome to the service counter. Listen to the customer, ask good questions, then write up the service that fits what they describe.',
  shopWrongService: 'That service does not match what the customer described. Ask another question, or pick again.',
  shopJobIntro:
    "This is a customer's car, so work like a pro. Hints are there if you need them, but each one costs the shop ten dollars.",
  shopSafetyStop:
    'We stopped the job. In a real shop, a safety error halts the work until a supervisor checks it. The customer will not be charged.',
  shopComeback:
    'This car came back. A comeback is redone for free, and it costs the shop reputation. Find what went wrong and fix it right.',
  shopHonest: 'Good honest call. Recommend only what the car really needs.',
  shopRefer:
    'We cannot mount and balance tires without a wheel balancer, so recommend the tires and refer the customer to a tire shop.',
  shopShiftDone: "That's the end of the shift. Here is your day sheet.",
  shopPromotion: 'Your reputation is growing. New kinds of work are coming through the door.',
} as const;
