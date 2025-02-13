// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true,
  title: "Missing References Finder"
});

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.

console.clear(); // Clear previous logs
console.log('Plugin code started');

interface MissingReference {
  nodeId: string;
  nodeName: string;
  referenceType: string;
  propertyType: string;
  currentValue: any;
  missingSource?: string;
}

async function findMissingReferences(
  progressCallback: (current: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  const nodes = figma.currentPage.findAll();
  let processedNodes = 0;
  
  for (const node of nodes) {
    processedNodes++;
    if (processedNodes % 10 === 0) { // Update every 10 nodes to avoid UI spam
      progressCallback(processedNodes);
    }
    
    // Check component instances
    if (node.type === 'INSTANCE') {
      console.log('Checking instance:', node.name); // Debug log
      const instance = node as InstanceNode;
      if (instance.mainComponent === null || instance.mainComponent?.remote) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          referenceType: 'component',
          propertyType: 'component',
          currentValue: instance.mainComponent?.key || null,
          missingSource: instance.mainComponent?.parent?.name || 'Unknown Library'
        });
      }
    }

    // Check styles
    if ('effectStyleId' in node && node.effectStyleId) {
      const style = figma.getStyleById(node.effectStyleId as string);
      if (!style || (style as any).remote) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          referenceType: 'style',
          propertyType: 'effect',
          currentValue: node.effectStyleId,
          missingSource: (style as any)?.parent?.name || 'Unknown Library'
        });
      }
    }

    if ('fillStyleId' in node && node.fillStyleId) {
      const style = figma.getStyleById(node.fillStyleId as string);
      if (!style || (style as any).remote) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          referenceType: 'style',
          propertyType: 'fill',
          currentValue: node.fillStyleId,
          missingSource: (style as any)?.parent?.name || 'Unknown Library'
        });
      }
    }

    if ('strokeStyleId' in node && node.strokeStyleId) {
      const style = figma.getStyleById(node.strokeStyleId as string);
      if (!style || (style as any).remote) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          referenceType: 'style',
          propertyType: 'stroke',
          currentValue: node.strokeStyleId,
          missingSource: (style as any)?.parent?.name || 'Unknown Library'
        });
      }
    }

    // Check text styles
    if (node.type === 'TEXT') {
      if (node.textStyleId) {
        const style = figma.getStyleById(node.textStyleId as string);
        if (!style || (style as any).remote) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            referenceType: 'style',
            propertyType: 'text',
            currentValue: node.textStyleId,
            missingSource: (style as any)?.parent?.name || 'Unknown Library'
          });
        }
      }
    }

    // Check for missing variables (tokens)
    if ('fills' in node) {
      const fills = node.fills;
      if (Array.isArray(fills) && fills.length > 0) {
        const solidFill = fills[0] as SolidPaint;
        if (solidFill && !solidFill.boundVariables) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            referenceType: 'token',
            propertyType: 'fill',
            currentValue: solidFill
          });
        }
      }
    }
    
    if ('strokes' in node) {
      const strokes = node.strokes;
      if (Array.isArray(strokes) && strokes.length > 0) {
        const solidStroke = strokes[0] as SolidPaint;
        if (solidStroke && !solidStroke.boundVariables) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            referenceType: 'token',
            propertyType: 'stroke',
            currentValue: solidStroke
          });
        }
      }
    }

    if ('effects' in node && node.effects) {
      const effects = node.effects;
      if (Array.isArray(effects) && effects.length > 0) {
        if (!effects[0].boundVariables) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            referenceType: 'token',
            propertyType: 'effect',
            currentValue: effects[0]
          });
        }
      }
    }

    // Check variables
    if ('boundVariables' in node) {
      console.log('Checking variables for:', node.name); // Debug log
      // Add variable checks here
    }
  }
  
  progressCallback(nodes.length); // Final update
  return missingRefs;
}

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  console.log('Plugin received message:', msg);

  if (msg.type === 'resize') {
    // Get the new size
    const { width, height } = msg;
    
    // Apply minimum dimensions
    const newWidth = Math.max(320, width);
    const newHeight = Math.max(400, height);
    
    // Resize the window
    figma.ui.resize(newWidth, newHeight);
  }
  
  if (msg.type === 'scan-for-tokens') {
    console.log('Starting scan...');
    const totalNodes = figma.currentPage.findAll().length;
    let scannedNodes = 0;
    
    const updateProgress = (current: number) => {
      figma.ui.postMessage({ 
        type: 'scan-progress', 
        progress: (current / totalNodes) * 100 
      });
    };

    const missingRefs = await findMissingReferences(updateProgress);
    console.log('Found refs:', missingRefs);
    
    figma.ui.postMessage({ 
      type: 'missing-references-result', 
      references: missingRefs
    });
  }
  
  if (msg.type === 'apply-token') {
    const { nodeId, tokenType, tokenValue } = msg;
    const node = figma.getNodeById(nodeId);
    
    if (node) {
      try {
        const variable = figma.variables.getVariableById(tokenValue);
        if (!variable) {
          throw new Error('Variable not found');
        }

        if (tokenType === 'fill' && 'fills' in node) {
          const fills = [...(node.fills as Paint[])];
          if (fills.length > 0 && fills[0].type === 'SOLID') {
            await figma.variables.setBoundVariableForPaint(
              fills[0] as SolidPaint,
              'color',
              variable
            );
            node.fills = fills;
          }
        } else if (tokenType === 'stroke' && 'strokes' in node) {
          const strokes = [...(node.strokes as Paint[])];
          if (strokes.length > 0 && strokes[0].type === 'SOLID') {
            await figma.variables.setBoundVariableForPaint(
              strokes[0] as SolidPaint,
              'color',
              variable
            );
            node.strokes = strokes;
          }
        } else if (tokenType === 'effect' && 'effects' in node) {
          const effects = [...(node.effects as Effect[])];
          if (effects.length > 0) {
            await figma.variables.setBoundVariableForEffect(
              effects[0],
              'spread', // or appropriate effect property
              variable
            );
            node.effects = effects;
          }
        }
        figma.ui.postMessage({ type: 'success', message: `${tokenType} token applied successfully` });
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply token: ${error.message}` 
        });
      }
    }
  }

  if (msg.type === 'apply-style') {
    const { nodeId, styleType, styleId } = msg;
    const node = figma.getNodeById(nodeId);
    const style = figma.getStyleById(styleId);
    
    if (node && style) {
      try {
        switch (styleType) {
          case 'fill':
            if ('fillStyleId' in node) {
              node.fillStyleId = styleId;
            }
            break;
          case 'stroke':
            if ('strokeStyleId' in node) {
              node.strokeStyleId = styleId;
            }
            break;
          case 'effect':
            if ('effectStyleId' in node) {
              node.effectStyleId = styleId;
            }
            break;
          case 'text':
            if (node.type === 'TEXT') {
              node.textStyleId = styleId;
            }
            break;
        }
        figma.ui.postMessage({ type: 'success', message: `${styleType} style applied successfully` });
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply style: ${error.message}` 
        });
      }
    }
  }

  if (msg.type === 'swap-component') {
    const { nodeId } = msg;
    const node = figma.getNodeById(nodeId);
    
    if (node && node.type === 'INSTANCE') {
      try {
        // Use component browser instead of showComponentPicker
        await figma.showUI(__html__, { width: 400, height: 600 });
        const components = figma.currentPage.findAll(node => node.type === "COMPONENT");
        
        if (components.length > 0) {
          const newInstance = (components[0] as ComponentNode).createInstance();
          newInstance.x = node.x;
          newInstance.y = node.y;
          newInstance.resize(node.width, node.height);
          node.parent?.insertChild(node.parent.children.indexOf(node), newInstance);
          node.remove();
          figma.ui.postMessage({ type: 'success', message: 'Component swapped successfully' });
        } else {
          throw new Error('No components found to swap with');
        }
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to swap component: ${error.message}` 
        });
      }
    }
  }

  // Only close the plugin when explicitly requested
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
};

// Wrap the window size restoration in an IIFE
(async function restoreWindowSize() {
  try {
    const savedSize = await figma.clientStorage.getAsync('windowSize');
    if (savedSize) {
      figma.ui.resize(savedSize.width, savedSize.height);
    }
  } catch (err) {
    console.error('Failed to restore window size:', err);
  }
})();

