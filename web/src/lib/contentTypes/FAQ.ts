import { contentType } from '@optimizely/cms-sdk';

export const FaqItemContentType = contentType({
  key: 'FaqItem',
  displayName: 'FAQ item',
  baseType: '_component',
  properties: {
    question: { type: 'string', displayName: 'Question' },
    answer: { type: 'richText', displayName: 'Answer' },
  },
});

export const FAQContentType = contentType({
  key: 'FAQ',
  displayName: 'FAQ',
  baseType: '_component',
  properties: {
    heading: { type: 'string', displayName: 'Heading' },
    items: { type: 'array', displayName: 'Questions', items: { type: 'component', contentType: FaqItemContentType } },
  },
  compositionBehaviors: ['sectionEnabled'],
});
