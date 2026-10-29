import type { ContentProps } from '@optimizely/cms-sdk';
import { getPreviewUtils } from '@optimizely/cms-sdk/core';
import type { CallToActionContentType } from '@/lib/contentTypes';

type Props = { content: ContentProps<typeof CallToActionContentType> };

export default function CallToAction({ content }: Props) {
  const { pa } = getPreviewUtils(content);
  const href = content.link?.url?.default ?? '#';
  return (
    <a className={`cta cta--${content.variant ?? 'primary'}`} href={href} {...pa('label')}>
      {content.label}
    </a>
  );
}
