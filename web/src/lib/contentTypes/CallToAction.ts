import { contentType } from '@optimizely/cms-sdk';

export const CallToActionContentType = contentType({
  key: 'CallToAction',
  displayName: 'Call to action',
  baseType: '_component',
  properties: {
    label: { type: 'string', displayName: 'Label' },
    link: { type: 'link', displayName: 'Link' },
    variant: {
      type: 'string',
      displayName: 'Variant',
      enum: [
        { value: 'primary', displayName: 'Primary' },
        { value: 'secondary', displayName: 'Secondary' },
      ],
    },
  },
  compositionBehaviors: ['elementEnabled'],
});
