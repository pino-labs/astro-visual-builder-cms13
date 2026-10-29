import { contentType } from '@optimizely/cms-sdk';

export const MonthlySpecialContentType = contentType({
  key: 'MonthlySpecial',
  displayName: 'Monthly special',
  baseType: '_component',
  properties: {
    title: { type: 'string', displayName: 'Title' },
    price: { type: 'float', displayName: 'Price' },
    validUntil: { type: 'dateTime', displayName: 'Valid until' },
  },
  compositionBehaviors: ['elementEnabled'],
});
