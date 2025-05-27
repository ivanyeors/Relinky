import { MissingReference } from '../common';

export interface UnlinkVariableMessage {
  type: 'unlink-variable';
  nodeId: string;
  property: string;
  currentValue: any;
}

export interface UnlinkGroupVariablesMessage {
  type: 'unlink-group-variables';
  refs: MissingReference[];
}

export type PluginMessage = 
  | UnlinkVariableMessage 
  | UnlinkGroupVariablesMessage 