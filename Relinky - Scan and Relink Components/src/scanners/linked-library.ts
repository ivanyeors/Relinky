// Linked Library Scanner Module
// Scans for tokens that are currently linked from any external libraries.
//
// What we consider "linked from libraries":
// - Remote Variables bound to nodes (figma variables with `remote === true`)
// - Remote Styles applied to nodes (styles with `remote === true`)
//
// This is the foundation for "Identify linked library tokens" so users can mass-select
// and relink or migrate tokens across libraries.

import {
  MissingReference,
  debugNodeVariables,
  getNodePath,
  shouldIncludeNode,
  isScannableNodeType,
  isNodeFromLibraryInstance,
  prepareLibraryInstanceFiltering,
  ProgressCallback,
} from '../common';
import { isScancelled } from './index';

type LibraryTokenKind = 'variable' | 'style';

interface LibraryNameResolution {
  libraryName: string;
  libraryKey?: string;
}

interface LibraryStyleMeta {
  libraryName?: string;
  libraryKey?: string;
}

interface LibraryVariableCollectionMeta {
  libraryName?: string;
  libraryKey?: string;
}

type TeamLibraryLike = {
  getAvailableLibraryStylesAsync?: () => Promise<unknown[]>;
  getAvailableLibraryVariableCollectionsAsync?: () => Promise<unknown[]>;
};

const safeString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const getVariableCategoryFromProperty = (property: string): string => {
  const p = property.toLowerCase();
  if (p.includes('fill') || p.includes('stroke') || p.includes('background')) return 'color';
  if (p.includes('font') || p.includes('text') || p.includes('letter') || p.includes('lineheight') || p.includes('paragraph')) return 'typography';
  if (p.includes('padding') || p.includes('spacing') || p.includes('gap') || p.includes('itemspacing')) return 'spacing';
  if (p.includes('radius') || p.includes('corner')) return 'radius';
  if (p.includes('effect') || p.includes('shadow') || p.includes('blur')) return 'effect';
  if (p.includes('opacity')) return 'opacity';
  if (p.includes('width') || p.includes('height') || p.includes('layout')) return 'layout';
  return 'other';
};

async function getNodesToScan(
  selectedFrameIds: string[] = [],
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<SceneNode[]> {
  // Scan selection if provided; else entire page.
  if (!selectedFrameIds || selectedFrameIds.length === 0) {
    return figma.currentPage
      .findAll(node => {
        const isVisible = !ignoreHiddenLayers || ('visible' in node && node.visible);
        const isNotLibraryInstance = !skipInstances || !isNodeFromLibraryInstance(node);
        return isVisible && isNotLibraryInstance;
      })
      .filter(isScannableNodeType);
  }

  const selectedNodes = await Promise.all(selectedFrameIds.map(id => figma.getNodeByIdAsync(id)));
  const roots = selectedNodes.filter(isScannableNodeType);

  const nodes: SceneNode[] = [];
  for (const root of roots) {
    if (skipInstances && isNodeFromLibraryInstance(root)) continue;
    if (!shouldIncludeNode(root, ignoreHiddenLayers)) continue;

    nodes.push(root);

    if (!('children' in root)) continue;
    const descendants = root.findAll(n => {
      if (!isScannableNodeType(n)) return false;
      if (skipInstances && isNodeFromLibraryInstance(n)) return false;
      return shouldIncludeNode(n, ignoreHiddenLayers);
    });
    nodes.push(...descendants);
  }

  return nodes;
}

async function buildLibraryStyleKeyMap(): Promise<Map<string, LibraryStyleMeta>> {
  const map = new Map<string, LibraryStyleMeta>();

  // Use Team Library metadata when available (gives us library names).
  try {
    const teamLibrary = (figma as unknown as { teamLibrary?: TeamLibraryLike }).teamLibrary;
    const getStyles = teamLibrary?.getAvailableLibraryStylesAsync;
    if (!getStyles) return map;

    const libraryStyles = await getStyles();
    for (const rawItem of libraryStyles || []) {
      const item = rawItem as Record<string, unknown>;
      const key = safeString(item.key);
      if (!key) continue;

      map.set(key, {
        libraryName: safeString(item.libraryName) ?? undefined,
        libraryKey: safeString(item.libraryKey) ?? undefined,
      });
    }
  } catch (err) {
    console.warn('Failed to load library styles metadata:', err);
  }

  return map;
}

async function buildLibraryVariableCollectionKeyMap(): Promise<Map<string, LibraryVariableCollectionMeta>> {
  const map = new Map<string, LibraryVariableCollectionMeta>();

  try {
    const teamLibrary = (figma as unknown as { teamLibrary?: TeamLibraryLike }).teamLibrary;
    const getCollections = teamLibrary?.getAvailableLibraryVariableCollectionsAsync;
    if (!getCollections) return map;

    const libraryCollections = await getCollections();
    for (const rawItem of libraryCollections || []) {
      const item = rawItem as Record<string, unknown>;
      const key = safeString(item.key);
      if (!key) continue;

      map.set(key, {
        libraryName: safeString(item.libraryName) ?? undefined,
        libraryKey: safeString(item.libraryKey) ?? undefined,
      });
    }
  } catch (err) {
    console.warn('Failed to load library variable collections metadata:', err);
  }

  return map;
}

const resolveLibraryName = (
  kind: LibraryTokenKind,
  opts: {
    styleKey?: string;
    variableCollectionKey?: string;
    fallbackName?: string;
    styleKeyMap: Map<string, LibraryStyleMeta>;
    variableCollectionKeyMap: Map<string, LibraryVariableCollectionMeta>;
  }
): LibraryNameResolution => {
  const fallbackName = opts.fallbackName || 'Library';

  if (kind === 'style' && opts.styleKey) {
    const meta = opts.styleKeyMap.get(opts.styleKey);
    return {
      libraryName: meta?.libraryName || fallbackName,
      libraryKey: meta?.libraryKey,
    };
  }

  if (kind === 'variable' && opts.variableCollectionKey) {
    const meta = opts.variableCollectionKeyMap.get(opts.variableCollectionKey);
    return {
      libraryName: meta?.libraryName || fallbackName,
      libraryKey: meta?.libraryKey,
    };
  }

  return { libraryName: fallbackName };
};

const getRemoteStyleRefsForNode = (node: SceneNode): Array<{ property: string; styleId: string }> => {
  const refs: Array<{ property: string; styleId: string }> = [];

  const nodeRecord = node as unknown as Record<string, unknown>;

  const add = (property: string, value: unknown) => {
    const styleId = safeString(value);
    if (!styleId) return;
    // `figma.mixed` isn't a string, so this is safe.
    refs.push({ property, styleId });
  };

  // Paint styles
  add('fillStyleId', nodeRecord.fillStyleId);
  add('strokeStyleId', nodeRecord.strokeStyleId);
  // Effect styles
  add('effectStyleId', nodeRecord.effectStyleId);
  // Grid styles (frames)
  add('gridStyleId', nodeRecord.gridStyleId);
  // Text styles (text)
  if (node.type === 'TEXT') {
    add('textStyleId', (node as TextNode).textStyleId);
  }

  return refs;
};

/**
 * Scan for tokens linked from libraries (remote styles + remote variables).
 *
 * Results are returned as MissingReference entries with:
 * - `currentValue.tokenKind` in {'variable','style'}
 * - `currentValue.tokenName`
 * - `libraryName` and `libraryKey` when resolvable
 * - `groupKey` set to group by token + library
 */
export async function scanForLinkedLibraryTokens(
  progressCallback: ProgressCallback,
  selectedFrameIds: string[] = [],
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<MissingReference[]> {
  const results: MissingReference[] = [];

  await prepareLibraryInstanceFiltering(skipInstances);

  // Preload library metadata to resolve library names.
  const [styleKeyMap, variableCollectionKeyMap] = await Promise.all([
    buildLibraryStyleKeyMap(),
    buildLibraryVariableCollectionKeyMap(),
  ]);

  // Memoization to keep scans fast.
  const variableById = new Map<string, Variable | null>();
  const collectionById = new Map<string, VariableCollection | null>();

  const getVariable = async (id: string): Promise<Variable | null> => {
    if (variableById.has(id)) return variableById.get(id) ?? null;
    try {
      const v = await figma.variables.getVariableByIdAsync(id);
      variableById.set(id, v);
      return v;
    } catch (err) {
      console.warn('Failed to resolve variable by id:', id, err);
      variableById.set(id, null);
      return null;
    }
  };

  const getCollection = async (id: string): Promise<VariableCollection | null> => {
    if (collectionById.has(id)) return collectionById.get(id) ?? null;
    try {
      const c = await figma.variables.getVariableCollectionByIdAsync(id);
      collectionById.set(id, c);
      return c;
    } catch (err) {
      console.warn('Failed to resolve variable collection by id:', id, err);
      collectionById.set(id, null);
      return null;
    }
  };

  const nodes = await getNodesToScan(selectedFrameIds, ignoreHiddenLayers, skipInstances);
  if (nodes.length === 0) {
    progressCallback(1, { processedCount: 0, totalCount: 0, phase: 'complete' });
    return results;
  }

  const total = nodes.length;

  for (let i = 0; i < nodes.length; i++) {
    if (isScancelled()) break;

    const node = nodes[i];

    try {
      // 1) Remote styles applied to node
      const styleRefs = getRemoteStyleRefsForNode(node);
      for (const { property, styleId } of styleRefs) {
        const style = await figma.getStyleByIdAsync(styleId);
        if (!style) continue;
        if (!('remote' in style) || style.remote !== true) continue;

        const styleKey = safeString((style as unknown as { key?: unknown }).key) ?? undefined;
        const resolved = resolveLibraryName('style', {
          styleKey,
          styleKeyMap,
          variableCollectionKeyMap,
          fallbackName: 'External Library',
        });

        const tokenName = safeString(style.name) || 'Unnamed Style';
        const groupKey = `style:${resolved.libraryName}:${tokenName}`;

        results.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'linked-library',
          property,
          currentValue: {
            tokenKind: 'style' as LibraryTokenKind,
            tokenName,
            styleId,
            styleKey,
            styleType: safeString((style as unknown as { styleType?: unknown }).styleType) ?? undefined,
          },
          location: getNodePath(node),
          isVisible: 'visible' in node ? node.visible : true,
          isTeamLibrary: true,
          libraryName: resolved.libraryName,
          libraryKey: resolved.libraryKey,
          groupKey,
        });
      }

      // 2) Remote variables bound to node
      if ('boundVariables' in node && node.boundVariables) {
        const varInfo = debugNodeVariables(node);

        for (const prop in varInfo.variableBindings) {
          const binding = varInfo.variableBindings[prop];

          const addVariableRef = async (variableId: string, property: string) => {
            const variable = await getVariable(variableId);
            if (!variable) return;
            if (variable.remote !== true) return;

            const collection = await getCollection(variable.variableCollectionId);
            const collectionKey = safeString((collection as unknown as { key?: unknown } | null)?.key) ?? undefined;

            const resolved = resolveLibraryName('variable', {
              variableCollectionKey: collectionKey,
              styleKeyMap,
              variableCollectionKeyMap,
              fallbackName: 'External Library',
            });

            const tokenName = safeString(variable.name) || 'Unnamed Variable';
            const groupKey = `variable:${resolved.libraryName}:${tokenName}`;

            results.push({
              nodeId: node.id,
              nodeName: node.name,
              type: 'linked-library',
              property,
              currentValue: {
                tokenKind: 'variable' as LibraryTokenKind,
                tokenName,
                variableId: variable.id,
                variableKey: safeString((variable as unknown as { key?: unknown }).key) ?? undefined,
                variableType: safeString(variable.resolvedType) ?? undefined,
                collectionName: safeString(collection?.name) ?? undefined,
              },
              location: getNodePath(node),
              variableName: tokenName,
              variableType: safeString(variable.resolvedType) ?? undefined,
              variableCategory: getVariableCategoryFromProperty(property),
              isVisible: 'visible' in node ? node.visible : true,
              isTeamLibrary: true,
              libraryName: resolved.libraryName,
              libraryKey: resolved.libraryKey,
              groupKey,
            });
          };

          if (binding?.isVariable && binding.variableId) {
            await addVariableRef(binding.variableId, prop);
          } else if (binding?.type === 'array' && Array.isArray(binding.items)) {
            for (const item of binding.items) {
              if (item?.isVariable && item.variableId) {
                await addVariableRef(item.variableId, `${prop}[${item.index}]`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning node ${node.name} (${node.id}) for linked library tokens:`, err);
    }

    const processedCount = i + 1;
    const ratio = processedCount / total;
    progressCallback(ratio, {
      processedCount,
      totalCount: total,
      phase: 'library-scan'
    });
    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  progressCallback(1, {
    processedCount: total,
    totalCount: total,
    phase: 'complete'
  });
  return results;
}

/**
 * Group linked library results by token+library so the UI can show token name(s)
 * with an associated library and enable "Select All" per group.
 */
export function groupLinkedLibraryResults(references: MissingReference[]): Record<string, MissingReference[]> {
  const grouped: Record<string, MissingReference[]> = {};
  for (const ref of references || []) {
    const key = ref.groupKey || `${ref.type}:${ref.libraryName || 'Library'}:${ref.variableName || ref.nodeName}:${ref.property}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ref);
  }
  return grouped;
}

