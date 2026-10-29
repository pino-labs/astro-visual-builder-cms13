export const RESOLVE_DOC_PATH = /* GraphQL */ `
  query ResolveDocPath($key: String, $locale: [Locales]) {
    _Content(where: { _metadata: { key: { eq: $key } } }, locale: $locale, limit: 1) {
      items { _metadata { url { default } } }
    }
  }
`;
