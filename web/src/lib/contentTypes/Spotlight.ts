import { contentType } from '@optimizely/cms-sdk';

export const SpotlightContentType = contentType({
  key: 'Spotlight',
  displayName: 'Spotlight',
  baseType: '_component',
  properties: {
    eyebrow: { type: 'string', displayName: 'Eyebrow' },
    heading: { type: 'string', displayName: 'Heading' },
    text: { type: 'string', displayName: 'Text' },
    image: { type: 'contentReference', displayName: 'Image', allowedTypes: ['_image'] },
    link: { type: 'link', displayName: 'Link' },
    linkLabel: { type: 'string', displayName: 'Link label' },
    imageSide: {
      type: 'string',
      displayName: 'Image side',
      enum: [
        { value: 'left', displayName: 'Left' },
        { value: 'right', displayName: 'Right' },
      ],
    },
  },
  compositionBehaviors: ['sectionEnabled', 'elementEnabled'],
});
