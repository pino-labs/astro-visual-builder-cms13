import { buildConfig } from '@optimizely/cms-sdk';

export default buildConfig({
  components: ['./src/lib/contentTypes/index.ts'],
  propertyGroups: [{ key: 'seo', displayName: 'SEO', sortOrder: 1 }],
  content: [{ key: 'LandingContent', displayName: 'Landing', contentType: 'LandingExperience' }],
  applications: [
    {
      key: 'astro_app',
      displayName: 'Astro on CMS 13',
      type: 'website',
      isDefault: true,
      entryPoint: 'LandingContent',
      usePreviewTokens: true,
      hosts: [
        { authority: 'localhost:3001', type: 'primary', preferredUrlScheme: 'https', locale: 'en' },
      ],
    },
  ],
});
