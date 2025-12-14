// Unbind Node Variable Module
// Handles unbinding variables from node properties by setting raw values

import { MissingReference } from '../common';

// Serializable format for variable values
interface SerializableValue {
  type: 'color' | 'number' | 'string' | 'object';
  value: string; // JSON stringified value
}

/**
 * Convert a value to a serializable format
 */
function toSerializable(value: any): SerializableValue {
  if (value && typeof value === 'object' && 'r' in value) {
    return {
      type: 'color',
      value: JSON.stringify({
        r: value.r,
        g: value.g,
        b: value.b,
        a: value.a !== undefined ? value.a : 1
      })
    };
  } else if (typeof value === 'number') {
    return {
      type: 'number',
      value: value.toString()
    };
  } else if (typeof value === 'object') {
    return {
      type: 'object',
      value: JSON.stringify(value)
    };
  }
  return {
    type: 'string',
    value: String(value)
  };
}

/**
 * Parse a serializable value back to its original format
 */
function fromSerializable(serialized: SerializableValue): any {
  switch (serialized.type) {
    case 'color':
      return JSON.parse(serialized.value);
    case 'number':
      return Number(serialized.value);
    case 'object':
      return JSON.parse(serialized.value);
    default:
      return serialized.value;
  }
}

/**
 * Sets the raw value for a node property, effectively removing variable binding
 */
export async function unbindNodeVariable(nodeId: string, property: string, currentValue: SerializableValue): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const value = fromSerializable(currentValue);

    // Set the raw value based on the property type
    switch (property) {
      case 'fill':
      case 'fills':
        if ('fills' in node) {
          if (currentValue.type === 'color') {
            (node as any).fills = [{
              type: 'SOLID',
              color: value,
              opacity: value.a
            }];
          } else {
            (node as any).fills = value;
          }
        }
        break;

      case 'stroke':
      case 'strokes':
        if ('strokes' in node) {
          if (currentValue.type === 'color') {
            (node as any).strokes = [{
              type: 'SOLID',
              color: value,
              opacity: value.a
            }];
          } else {
            (node as any).strokes = value;
          }
        }
        break;

      case 'opacity':
        if ('opacity' in node) {
          (node as any).opacity = value;
        }
        break;

      case 'cornerRadius':
        if ('cornerRadius' in node) {
          (node as any).cornerRadius = value;
        }
        break;

      case 'paddingTop':
      case 'paddingBottom':
      case 'paddingLeft':
      case 'paddingRight':
        if ('paddingTop' in node && 'paddingBottom' in node && 'paddingLeft' in node && 'paddingRight' in node) {
          (node as any)[property] = value;
        }
        break;

      case 'itemSpacing':
      case 'gap':
        if ('itemSpacing' in node) {
          (node as any).itemSpacing = value;
        }
        break;

      case 'fontSize':
        if ('fontSize' in node) {
          (node as any).fontSize = value;
        }
        break;

      case 'fontName':
        if ('fontName' in node && currentValue.type === 'object') {
          (node as any).fontName = value;
        }
        break;

      case 'letterSpacing':
        if ('letterSpacing' in node) {
          (node as any).letterSpacing = currentValue.type === 'object' ? value : {
            value: value,
            unit: 'PIXELS'
          };
        }
        break;

      case 'lineHeight':
        if ('lineHeight' in node) {
          (node as any).lineHeight = currentValue.type === 'object' ? value : {
            value: value,
            unit: 'PIXELS'
          };
        }
        break;

      case 'effects':
        if ('effects' in node) {
          (node as any).effects = value;
        }
        break;

      case 'layoutGrids':
        if ('layoutGrids' in node) {
          (node as any).layoutGrids = value;
        }
        break;

      default:
        if (property in node) {
          (node as any)[property] = value;
        } else {
          console.warn(`Unsupported property for unbinding: ${property}`);
        }
    }

    figma.notify(`Reset ${property} on ${node.name} to raw value`);

  } catch (error) {
    console.error(`Error setting raw value for ${nodeId}.${property}:`, error);
    throw error;
  }
}

/**
 * Reset variable bindings to raw values for multiple nodes
 */
export async function unbindNodeVariableGroup(refs: MissingReference[]): Promise<{ success: boolean; message: string }> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[]
  };

  try {
    for (const ref of refs) {
      try {
        await unbindNodeVariable(
          ref.nodeId,
          ref.property,
          toSerializable(ref.currentValue)
        );
        results.successful++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Node ${ref.nodeId}: ${errorMessage}`);
      }
    }

    const message = `Successfully reset ${results.successful} properties to raw values` +
      (results.failed > 0 ? `, ${results.failed} failed` : '');

    return {
      success: results.failed === 0,
      message
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to reset variable bindings: ${message}`
    };
  }
}

/**
 * @deprecated Use `unbindNodeVariable` instead.
 */
export async function unlinkVariable(...args: Parameters<typeof unbindNodeVariable>) {
  return unbindNodeVariable(...args);
}

/**
 * @deprecated Use `unbindNodeVariableGroup` instead.
 */
export async function unlinkGroupVariables(...args: Parameters<typeof unbindNodeVariableGroup>) {
  return unbindNodeVariableGroup(...args);
}