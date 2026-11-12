'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  IsValidConnection,
} from '@xyflow/react';

import { workflowStore, WorkflowRecord } from '@/lib/storage/workflowStore';
import { getNodeDefinition } from '@/core/registry/nodeRegistry';
import { validateWorkflowGraph, ValidationReport } from '@/core/validation/graphValidator';
import { WorkflowNode, WorkflowEdge } from '@/core/types/workflow';

import { CustomWorkflowNode, WorkflowNodeData } from '@/components/canvas/CustomWorkflowNode';
import { NodeLibrary } from '@/components/canvas/NodeLibrary';
import { NodeConfigPanel } from '@/components/canvas/NodeConfigPanel';
import { ValidationDrawer } from '@/components/canvas/ValidationDrawer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

import {
  ArrowLeft,
  Save,
  RotateCcw,
  RotateCw,
  Power,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  Sparkles,
} from 'lucide-react';

interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
}

function BuilderCanvas() {
  const params = useParams();
  const workflowId = params?.id as string;
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [status, setStatus] = useState<'active' | 'draft' | 'paused'>('draft');

  // React Flow State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // History Stack (Undo/Redo)
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoAction = useRef<boolean>(false);

  // Save & Autosave State
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Validation Drawer State
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  // Register Custom Node Type
  const nodeTypes = useMemo(
    () => ({
      custom: CustomWorkflowNode,
    }),
    []
  );

  // Helper to push history
  const pushHistory = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
    if (isUndoRedoAction.current) return;

    const snapshot: HistorySnapshot = {
      nodes: JSON.parse(JSON.stringify(currentNodes)),
      edges: JSON.parse(JSON.stringify(currentEdges)),
    };

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(snapshot);
    if (nextHistory.length > 30) nextHistory.shift();

    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
  }, []);

  // Run graph validation
  const runValidation = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]): ValidationReport => {
      const compiledNodes: WorkflowNode[] = currentNodes.map((n) => {
        const data = n.data as unknown as WorkflowNodeData;
        return {
          id: n.id,
          type: data.nodeType,
          category: data.category,
          name: data.title,
          description: data.description,
          config: data.config || {},
          position: n.position,
        };
      });

      const compiledEdges: WorkflowEdge[] = currentEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      }));

      const report = validateWorkflowGraph({
        id: workflowId || 'wf_current',
        name: workflowName,
        nodes: compiledNodes,
        edges: compiledEdges,
      });

      setValidationReport(report);

      // Update validation errors on nodes
      setNodes((nds) =>
        nds.map((n) => {
          const errors = report.nodeErrors[n.id] || [];
          const currentErrors = (n.data as unknown as WorkflowNodeData).validationErrors || [];
          if (JSON.stringify(errors) !== JSON.stringify(currentErrors)) {
            return {
              ...n,
              data: {
                ...(n.data as unknown as WorkflowNodeData),
                validationErrors: errors,
              } as unknown as Record<string, unknown>,
            };
          }
          return n;
        })
      );

      return report;
    },
    [workflowId, workflowName]
  );

  // Load Workflow from Store
  useEffect(() => {
    if (!workflowId) return;
    const existing = workflowStore.getById(workflowId);
    if (existing) {
      setWorkflow(existing);
      setWorkflowName(existing.name);
      setStatus(existing.status);

      const rfNodes: Node[] = existing.nodes.map((n) => ({
        id: n.id,
        type: 'custom',
        position: n.position || { x: 150, y: 150 },
        data: {
          title: n.name,
          category: n.category,
          nodeType: n.type,
          description: n.description,
          config: n.config,
        } as unknown as Record<string, unknown>,
      }));

      const rfEdges: Edge[] = existing.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: true,
        style: { stroke: '#2563EB', strokeWidth: 2 },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);

      // Initial history snapshot
      historyRef.current = [{ nodes: rfNodes, edges: rfEdges }];
      historyIndexRef.current = 0;

      // Initial validation
      runValidation(rfNodes, rfEdges);
      setIsDirty(false);
      setSaveStatus('saved');
    }
  }, [workflowId]);

  // Handle Node Changes (Drag, select)
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds);
        const hasPosChange = changes.some((c) => c.type === 'position' && c.dragging === false);
        if (hasPosChange) {
          pushHistory(nextNodes, edges);
        }
        return nextNodes;
      });
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [edges, pushHistory]
  );

  // Handle Edge Changes
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const nextEdges = applyEdgeChanges(changes, eds);
        pushHistory(nodes, nextEdges);
        return nextEdges;
      });
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [nodes, pushHistory]
  );

  // Connection Validation (Milestone 3B)
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      // Rule 1: Prevent self connections
      if (connection.source === connection.target) {
        return false;
      }

      // Rule 2: Prevent connecting to Trigger nodes as target
      const targetNode = nodes.find((n) => n.id === connection.target);
      const targetData = targetNode?.data as unknown as WorkflowNodeData;
      if (targetData?.category === 'trigger') {
        return false;
      }

      // Rule 3: Prevent duplicate connections
      const isDuplicate = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      );
      if (isDuplicate) {
        return false;
      }

      return true;
    },
    [nodes, edges]
  );

  // Handle New Edge Connection
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!isValidConnection(connection)) return;

      const newEdge: Edge = {
        ...connection,
        id: `e_${connection.source}_${connection.target}_${Math.random().toString(36).substring(2, 6)}`,
        animated: true,
        style: { stroke: '#2563EB', strokeWidth: 2 },
      };

      setEdges((eds) => {
        const nextEdges = addEdge(newEdge, eds);
        pushHistory(nodes, nextEdges);
        return nextEdges;
      });
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [nodes, isValidConnection, pushHistory]
  );

  // Drag and Drop from NodeLibrary (Milestone 3A)
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const definition = getNodeDefinition(nodeType);
      if (!definition) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newId = `node_${Math.random().toString(36).substring(2, 7)}`;
      const newNode: Node = {
        id: newId,
        type: 'custom',
        position,
        data: {
          title: definition.displayName,
          category: definition.category,
          nodeType: definition.type,
          description: definition.description,
          config: definition.defaultConfig,
        } as unknown as Record<string, unknown>,
      };

      setNodes((nds) => {
        const nextNodes = [...nds, newNode];
        pushHistory(nextNodes, edges);
        return nextNodes;
      });

      setSelectedNodeId(newId);
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [screenToFlowPosition, edges, pushHistory]
  );

  // Click-to-add action from NodeLibrary
  const handleAddNode = useCallback(
    (item: any) => {
      const newId = `node_${Math.random().toString(36).substring(2, 7)}`;
      const newNode: Node = {
        id: newId,
        type: 'custom',
        position: { x: 300 + Math.random() * 50, y: 180 + Math.random() * 50 },
        data: {
          title: item.displayName,
          category: item.category,
          nodeType: item.type,
          description: item.description,
          config: item.defaultConfig,
        } as unknown as Record<string, unknown>,
      };

      setNodes((nds) => {
        const nextNodes = [...nds, newNode];
        pushHistory(nextNodes, edges);
        return nextNodes;
      });

      setSelectedNodeId(newId);
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [edges, pushHistory]
  );

  // Node Duplication (Milestone 3A & 3C)
  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const sourceNode = nodes.find((n) => n.id === nodeId);
      if (!sourceNode) return;

      const newId = `node_${Math.random().toString(36).substring(2, 7)}`;
      const sourceData = sourceNode.data as unknown as WorkflowNodeData;

      const duplicatedNode: Node = {
        id: newId,
        type: 'custom',
        position: {
          x: sourceNode.position.x + 40,
          y: sourceNode.position.y + 40,
        },
        data: {
          ...sourceData,
          title: `${sourceData.title} (Copy)`,
        } as unknown as Record<string, unknown>,
      };

      setNodes((nds) => {
        const nextNodes = [...nds, duplicatedNode];
        pushHistory(nextNodes, edges);
        return nextNodes;
      });

      setSelectedNodeId(newId);
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [nodes, edges, pushHistory]
  );

  // Node Deletion
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          pushHistory(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [selectedNodeId, pushHistory]
  );

  // Node Config Update
  const handleUpdateNode = useCallback(
    (nodeId: string, updatedData: Partial<WorkflowNodeData>) => {
      setNodes((nds) => {
        const nextNodes = nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...(n.data as unknown as WorkflowNodeData),
                ...updatedData,
              } as unknown as Record<string, unknown>,
            };
          }
          return n;
        });
        pushHistory(nextNodes, edges);
        return nextNodes;
      });
      setIsDirty(true);
      setSaveStatus('unsaved');
    },
    [edges, pushHistory]
  );

  // Undo and Redo Handlers (Milestone 3C)
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isUndoRedoAction.current = true;
      historyIndexRef.current -= 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setIsDirty(true);
      setSaveStatus('unsaved');
      isUndoRedoAction.current = false;
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isUndoRedoAction.current = true;
      historyIndexRef.current += 1;
      const snapshot = historyRef.current[historyIndexRef.current];
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setIsDirty(true);
      setSaveStatus('unsaved');
      isUndoRedoAction.current = false;
    }
  }, []);

  // Save Workflow Structure
  const handleSave = useCallback(() => {
    if (!workflow) return;
    setIsSaving(true);
    setSaveStatus('saving');

    const compiledNodes: WorkflowNode[] = nodes.map((n) => {
      const data = n.data as unknown as WorkflowNodeData;
      return {
        id: n.id,
        type: data.nodeType,
        category: data.category,
        name: data.title,
        description: data.description,
        config: data.config || {},
        position: n.position,
      };
    });

    const compiledEdges: WorkflowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
    }));

    const updatedWorkflow: WorkflowRecord = {
      ...workflow,
      name: workflowName.trim(),
      status,
      nodes: compiledNodes,
      edges: compiledEdges,
      updatedAt: new Date().toISOString(),
    };

    workflowStore.save(updatedWorkflow);
    setWorkflow(updatedWorkflow);
    runValidation(nodes, edges);

    setIsDirty(false);
    setIsSaving(false);
    setSaveStatus('saved');
  }, [workflow, nodes, edges, workflowName, status, runValidation]);

  // Debounced Autosave (1.5 seconds) (Milestone 3D)
  useEffect(() => {
    if (!isDirty || !workflow) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 1500);

    return () => clearTimeout(timer);
  }, [isDirty, nodes, edges, workflowName, status, handleSave, workflow]);

  // Keyboard Shortcuts (Milestone 3C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl+S or Cmd+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }

      // Ctrl+Shift+Z or Ctrl+Y: Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }

      // Delete or Backspace: Delete selected node
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleUndo, handleRedo, selectedNodeId, handleDeleteNode]);

  // Warn on leave with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50">
      {/* Top Navigation Bar */}
      <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 z-30 select-none">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3">
          <Link
            href="/workflows"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workflows</span>
          </Link>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setIsDirty(true);
                setSaveStatus('unsaved');
              }}
              className="text-sm font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-slate-50 px-1 py-0.5 rounded transition-all outline-none"
            />
            <Badge variant={status} size="sm">
              {status.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Center: Save State & Topology Validation Status */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 font-medium text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            {nodes.length} Nodes, {edges.length} Connections
          </span>
          <span>•</span>

          {/* Validation Status Pill */}
          <button
            onClick={() => {
              runValidation(nodes, edges);
              setIsValidationOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all text-[11px] font-semibold hover:shadow-xs"
          >
            {validationReport?.isValid ? (
              <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Valid Graph
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-700 bg-amber-50 border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {validationReport?.errorsCount || 0} Issues
              </span>
            )}
          </button>

          <span>•</span>

          {/* Save Status Indicator */}
          <span className="font-mono text-[11px]">
            {saveStatus === 'saving' ? (
              <span className="text-blue-600 font-medium">Saving changes...</span>
            ) : saveStatus === 'unsaved' ? (
              <span className="text-amber-600 font-medium">Unsaved changes</span>
            ) : (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Autosaved
              </span>
            )}
          </span>
        </div>

        {/* Right Actions: Undo/Redo, Validation Preview, Save */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/60">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 rounded text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Status Toggle */}
          <button
            onClick={() => {
              const next = status === 'active' ? 'draft' : 'active';
              setStatus(next);
              setIsDirty(true);
              setSaveStatus('unsaved');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              status === 'active'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{status === 'active' ? 'Active' : 'Draft'}</span>
          </button>

          {/* Test Validation Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              runValidation(nodes, edges);
              setIsValidationOpen(true);
            }}
            icon={<ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
          >
            Validate
          </Button>

          {/* Manual Save Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save
          </Button>
        </div>
      </header>

      {/* 3-Panel Workspace */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Panel: Centralized Node Library */}
        <NodeLibrary onAddNode={handleAddNode} />

        {/* Center: React Flow Canvas with Drag & Drop */}
        <div
          className="relative flex-1 h-full bg-[#F8FAFC]"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-[#F8FAFC]"
          >
            <Background gap={16} size={1} color="#E2E8F0" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              nodeStrokeColor="#2563EB"
              nodeColor="#EFF6FF"
              maskColor="rgb(241, 245, 249, 0.7)"
              className="!border !border-slate-200 !rounded-lg !overflow-hidden !shadow-sm !w-32 !h-24"
            />
          </ReactFlow>

          {/* Empty State Overlay */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/90 p-6 shadow-sm max-w-sm pointer-events-auto">
                <Sparkles className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-800">
                  Canvas is empty
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                  Drag any node from the Node Library on the left onto the canvas, or click below to start with a Webhook Trigger.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    handleAddNode(getNodeDefinition('trigger.webhook'))
                  }
                >
                  Add Webhook Trigger
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Contextual Node Config Inspector */}
        <NodeConfigPanel
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={handleDuplicateNode}
          onClose={() => setSelectedNodeId(null)}
        />

        {/* Bottom Drawer: Validation Report */}
        <ValidationDrawer
          isOpen={isValidationOpen}
          onClose={() => setIsValidationOpen(false)}
          report={validationReport}
          onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
        />
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderCanvas />
    </ReactFlowProvider>
  );
}
