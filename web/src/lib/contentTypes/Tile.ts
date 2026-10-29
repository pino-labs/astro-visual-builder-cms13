import { contentType, displayTemplate } from '@optimizely/cms-sdk';

export const TileContentType = contentType({
  key: 'Tile',
  displayName: 'Tile',
  baseType: '_component',
  properties: {
    title: { type: 'string', displayName: 'Title' },
    description: { type: 'string', displayName: 'Description' },
  },
  compositionBehaviors: ['elementEnabled'],
});

export const TileRowDisplayTemplate = displayTemplate({
  key: 'TileRowDisplayTemplate',
  displayName: 'Row spacing',
  isDefault: true,
  nodeType: 'row',
  settings: {
    padding: {
      editor: 'select' as const,
      displayName: 'Padding',
      sortOrder: 0,
      choices: {
        small: { displayName: 'Small', sortOrder: 1 },
        medium: { displayName: 'Medium', sortOrder: 2 },
        large: { displayName: 'Large', sortOrder: 3 },
      },
    },
  },
});

export const TileColumnDisplayTemplate = displayTemplate({
  key: 'TileColumnDisplayTemplate',
  displayName: 'Column background',
  isDefault: true,
  nodeType: 'column',
  settings: {
    background: {
      editor: 'select' as const,
      displayName: 'Background',
      sortOrder: 0,
      choices: {
        neutral: { displayName: 'Neutral', sortOrder: 1 },
        primary: { displayName: 'Primary', sortOrder: 2 },
        secondary: { displayName: 'Secondary', sortOrder: 3 },
      },
    },
  },
});

export const SquareDisplayTemplate = displayTemplate({
  key: 'SquareDisplayTemplate',
  displayName: 'Square',
  isDefault: false,
  contentType: 'Tile',
  tag: 'Square',
  settings: {
    orientation: {
      editor: 'select' as const,
      displayName: 'Orientation',
      sortOrder: 0,
      choices: {
        vertical: { displayName: 'Vertical', sortOrder: 1 },
        horizontal: { displayName: 'Horizontal', sortOrder: 2 },
      },
    },
  },
});
