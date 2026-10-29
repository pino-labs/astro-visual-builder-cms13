import { contentType } from '@optimizely/cms-sdk';

export const ArticlePageContentType = contentType({
  key: 'ArticlePage',
  displayName: 'Article page',
  baseType: '_page',
  properties: {
    heading: { type: 'string', displayName: 'Heading' },
    body: { type: 'richText', displayName: 'Body' },
    publishedAt: { type: 'dateTime', displayName: 'Published' },
    cover: { type: 'contentReference', displayName: 'Cover image', allowedTypes: ['_image'] },
  },
});
