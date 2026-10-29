import type { ContentProps } from '@optimizely/cms-sdk';
import { getPreviewUtils } from '@optimizely/cms-sdk/core';
import type { HeroContentType } from '@/lib/contentTypes';

type Props = { content: ContentProps<typeof HeroContentType> };

export default function Hero({ content }: Props) {
  const { pa, src } = getPreviewUtils(content);
  const background = src(content.background);
  return (
    <header className={`hero hero--${content.theme ?? 'light'}`}>
      {background && <img src={background} alt='' {...pa('background')} />}
      <h2 {...pa('heading')}>{content.heading}</h2>
      <p {...pa('summary')}>{content.summary}</p>
    </header>
  );
}
