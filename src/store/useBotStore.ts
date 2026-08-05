import { create } from 'zustand';
import { Node, Edge, addEdge, OnNodesChange, OnEdgesChange, OnConnect, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

interface BotState {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (nodeId: string, data: any) => void;
}

export const useBotStore = create<BotState>((set, get) => ({
  nodes: [
    {
      id: '1',
      type: 'input',
      data: { label: 'Start' },
      position: { x: 250, y: 5 },
    },
  ],
  edges: [],
  onNodesChange: (changes) => {
    const currentNodes = Array.isArray(get().nodes) ? get().nodes : (get().nodes && typeof get().nodes === 'object' ? Object.values(get().nodes) : []);
    set({
      nodes: applyNodeChanges(changes, currentNodes),
    });
  },
  onEdgesChange: (changes) => {
    const currentEdges = Array.isArray(get().edges) ? get().edges : (get().edges && typeof get().edges === 'object' ? Object.values(get().edges) : []);
    set({
      edges: applyEdgeChanges(changes, currentEdges),
    });
  },
  onConnect: (connection) => {
    const currentEdges = Array.isArray(get().edges) ? get().edges : (get().edges && typeof get().edges === 'object' ? Object.values(get().edges) : []);
    set({
      edges: addEdge(connection, currentEdges),
    });
  },
  setNodes: (nodesInput) => {
    set((state) => {
      let resolvedNodes = typeof nodesInput === 'function' ? (nodesInput as any)(state.nodes) : nodesInput;
      if (!Array.isArray(resolvedNodes)) {
        resolvedNodes = resolvedNodes && typeof resolvedNodes === 'object' ? Object.values(resolvedNodes) : [];
      }
      return { nodes: resolvedNodes };
    });
  },
  setEdges: (edgesInput) => {
    set((state) => {
      let resolvedEdges = typeof edgesInput === 'function' ? (edgesInput as any)(state.edges) : edgesInput;
      if (!Array.isArray(resolvedEdges)) {
        resolvedEdges = resolvedEdges && typeof resolvedEdges === 'object' ? Object.values(resolvedEdges) : [];
      }
      return { edges: resolvedEdges };
    });
  },
  updateNodeData: (nodeId, data) => {
    const currentNodes = Array.isArray(get().nodes) ? get().nodes : (get().nodes && typeof get().nodes === 'object' ? Object.values(get().nodes) : []);
    set({
      nodes: currentNodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
    });
  },
}));
