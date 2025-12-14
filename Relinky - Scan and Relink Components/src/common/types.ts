import { MissingReference } from '../common';

export interface UnlinkVariableMessage {
  type: 'unbind-node-variable';
  nodeId: string;
  property: string;
  currentValue: any;
}

export interface UnlinkGroupVariablesMessage {
  type: 'unbind-node-variable-group';
  refs: MissingReference[];
}

export type PluginMessage = 
  | UnlinkVariableMessage 
  | UnlinkGroupVariablesMessage 