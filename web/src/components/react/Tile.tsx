import type { ContentProps } from '@optimizely/cms-sdk';
import { getPreviewUtils } from '@optimizely/cms-sdk/core';
import type { TileContentType, SquareDisplayTemplate } from '@/lib/contentTypes';

type Props = {
  content: ContentProps<typeof TileContentType>;
  displaySettings?: ContentProps<typeof SquareDisplayTemplate>;
};

export default function Tile({ content }: Props) {
  const { pa } = getPreviewUtils(content);
  return (
    <div className='tile'>
      <h3 {...pa('title')}>{content.title}</h3>
      <p {...pa('description')}>{content.description}</p>
    </div>
  );
}

export function SquareTile({ content, displaySettings }: Props) {
  const { pa } = getPreviewUtils(content);
  const horizontal = displaySettings?.orientation === 'horizontal';
  return (
    <div className='tile tile--square' style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column' }}>
      <h3 {...pa('title')}>{content.title}</h3>
      <p {...pa('description')}>{content.description}</p>
    </div>
  );
}
